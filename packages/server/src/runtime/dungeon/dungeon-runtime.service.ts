import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveProjectPath } from '../../common/project-path';
import {
  DUNGEON_MAX_PARTY_MEMBERS,
  S2C,
  type DungeonDefinition,
  type DungeonDifficulty,
  type DungeonRunState,
  type DungeonSettlementMember,
  type DungeonSettlementView,
  type DungeonStaminaView,
  isDungeonPresentRankAllowed,
  resolveDungeonAttributeMultipliers,
  resolveDungeonEffectiveStep,
  resolveDungeonStaminaCost,
  type TechniqueGrade,
} from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PartyMembershipRepository } from '../party/party-membership.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeService } from '../world/world-runtime.service';
import { WorldSessionService } from '../../network/world-session.service';
import { DefenseDungeonFlowController, ExpeditionDungeonFlowController, SuppressDemonDungeonFlowController, type DungeonFlowController } from './dungeon-flow-controller';
import { DungeonMechanismFormationService } from './dungeon-mechanism-formation.service';
import { DungeonRewardService } from './dungeon-reward.service';
import { DungeonRunPersistenceService } from './dungeon-run-persistence.service';

interface PendingEntry {
  run: DungeonRunState;
  definition: DungeonDefinition;
  expiresAt: number;
  confirmations: Map<string, boolean>;
  timer: ReturnType<typeof setTimeout>;
  countdownTimer?: ReturnType<typeof setTimeout>;
  countdownStartedAt?: number;
}

interface DungeonCombatMemberStats {
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
}

@Injectable()
export class DungeonRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DungeonRuntimeService.name);
  private readonly runs = new Map<string, DungeonRunState>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly exitedPlayers = new Map<string, Set<string>>();
  private readonly runTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly combatStatsByRunId = new Map<string, Map<string, DungeonCombatMemberStats>>();
  private restorePromise: Promise<number> | null = null;
  private readonly controllers = new Map<string, DungeonFlowController>([
    ['defense', new DefenseDungeonFlowController()],
    ['suppress_demon', new SuppressDemonDungeonFlowController()],
    ['expedition', new ExpeditionDungeonFlowController()],
  ]);

  constructor(
    private readonly content: ContentTemplateRepository,
    private readonly parties: PartyMembershipRepository,
    private readonly players: PlayerRuntimeService,
    private readonly world: WorldRuntimeService,
    private readonly sessions: WorldSessionService,
    private readonly mechanismFormations: DungeonMechanismFormationService,
    private readonly rewards: DungeonRewardService,
    private readonly runPersistence: DungeonRunPersistenceService,
  ) {}

  onModuleInit(): void {
    this.world.attachDungeonRuntime(this);
  }

  onModuleDestroy(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      if (entry.countdownTimer) clearTimeout(entry.countdownTimer);
    }
    this.pending.clear();
    for (const timer of this.runTimers.values()) clearTimeout(timer);
    this.runTimers.clear();
    this.combatStatsByRunId.clear();
  }

  listDefinitions(): DungeonDefinition[] { return this.content.listDungeonDefinitions(); }

  /** 启动时先恢复副本流程，再恢复玩家挂接，避免玩家快照指向尚未注册的 dungeon 实例。 */
  async restorePersistedRuns(): Promise<number> {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.restorePersistedRunsInternal();
    try {
      return await this.restorePromise;
    } finally {
      this.restorePromise = null;
    }
  }

  private async restorePersistedRunsInternal(): Promise<number> {
    const payloads = await this.runPersistence.loadRecoverableRuns();
    let restored = 0;
    for (const payload of payloads) {
      const run = normalizeRecoveredDungeonRun(payload);
      const definition = run ? this.content.getDungeonDefinition(run.dungeonId) : null;
      if (!run || !definition || this.runs.has(run.runId)) continue;
      if (run.status === 'created') {
        run.status = 'aborted';
        run.failureReason = 'server_restart_before_activation';
        this.runPersistence.save(run);
        continue;
      }
      let instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
      let createdInstance = false;
      if (run.status === 'activating' && !instance) {
        run.status = 'aborted';
        run.failureReason = 'server_restart_during_activation';
        this.runPersistence.save(run);
        continue;
      }
      if (!instance) {
        try {
          const baseSpawns = definition.flowType === 'defense' ? [] : (definition.rooms?.length ? [] : this.content.createRuntimeMonstersForMap(definition.mapTemplateId));
          instance = this.world.createInstance({
            instanceId: run.mapInstanceId,
            templateId: definition.mapTemplateId,
            kind: 'dungeon',
            persistent: true,
            persistentPolicy: 'persistent',
            partyId: run.partyId,
            instanceOrigin: 'dungeon_recovery',
            defaultEntry: false,
            monsterSpawns: baseSpawns,
          });
          createdInstance = true;
        } catch (error) {
          this.logger.warn(`副本实例恢复失败 ${run.runId}：${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
      }
      instance.meta.dungeonRunId = run.runId;
      instance.meta.dungeonId = run.dungeonId;
      if (run.status === 'activating' || (run.status === 'active' && createdInstance)) {
        run.status = 'active';
        run.activatedAt = run.activatedAt ?? Date.now();
        this.activateRoom(instance, definition, run, run.currentRoomId ?? definition.rooms?.[0]?.roomId);
      } else if (run.status === 'completed' || run.status === 'completing') {
        instance.meta.status = 'completed';
      }
      this.runs.set(run.runId, run);
      this.combatStatsByRunId.set(run.runId, new Map(run.members.map((member) => [member.playerId, { damageDealt: 0, damageTaken: 0, healingDone: 0 }])));
      this.scheduleRecoveredRun(run, definition);
      this.runPersistence.save(run);
      restored++;
    }
    if (restored > 0) this.logger.log(`已恢复 ${restored} 个副本流程实例`);
    return restored;
  }

  private scheduleRecoveredRun(run: DungeonRunState, definition: DungeonDefinition): void {
    if (run.status === 'active') {
      const deadline = Number(run.activatedAt ?? run.createdAt) + Math.max(1, Math.trunc(definition.timeoutSeconds ?? 3600)) * 1000;
      const timer = setTimeout(() => this.expireRun(run.runId), Math.max(0, deadline - Date.now()));
      timer.unref?.();
      this.runTimers.set(run.runId, timer);
      return;
    }
    if (run.status === 'completed' || run.status === 'completing') {
      const deadline = Number(run.completedAt ?? Date.now()) + 30_000;
      const timer = setTimeout(() => void this.forceCleanupCompletedRun(run), Math.max(0, deadline - Date.now()));
      timer.unref?.();
      this.runTimers.set(run.runId, timer);
    }
  }

  buildCatalog(playerId: string) {
    const activeRun = [...this.runs.values()].find((run) => run.members.some((member) => member.playerId === playerId) && ['created', 'activating', 'active', 'completing', 'completed'].includes(run.status));
    if (!activeRun) {
      const location = this.world.getPlayerLocation(playerId);
      const instance = location?.instanceId ? this.world.getInstanceRuntime(location.instanceId) as any : null;
      if (isDungeonInstanceCandidate(location?.instanceId, instance)) {
        void this.recoverOrphanDungeonPlayer(playerId, location.instanceId);
      }
    }
    return { dungeons: this.listDefinitions(), stamina: this.players.refreshDungeonStamina(playerId) as DungeonStaminaView, ...(activeRun ? { activeRun } : {}) };
  }

  async startEntry(leaderPlayerId: string, input: { dungeonId?: unknown; difficulty?: unknown; presentRank?: unknown }) {
    const leader = leaderPlayerId.trim();
    const definition = this.content.getDungeonDefinition(String(input.dungeonId ?? '').trim());
    if (!definition) return { ok: false, reason: 'dungeon_not_found' };
    const difficulty = input.difficulty as DungeonDifficulty;
    if (!['trial', 'hard', 'nightmare', 'present'].includes(difficulty)) return { ok: false, reason: 'invalid_difficulty' };
    const presentRank = input.presentRank as TechniqueGrade | undefined;
    if (!isDungeonPresentRankAllowed(difficulty, presentRank, definition.difficulty.maxPresentRank)) return { ok: false, reason: 'invalid_present_rank' };
    const party = await this.parties.getPartyByPlayer(leader);
    if (!party || party.leaderPlayerId !== leader) return { ok: false, reason: 'leader_required' };
    if ([...this.pending.values()].some((entry) => entry.run.partyId === party.partyId)
      || [...this.runs.values()].some((entry) => entry.partyId === party.partyId && ['created', 'activating', 'active', 'completing'].includes(entry.status))) return { ok: false, reason: 'party_dungeon_in_progress' };
    if (party.members.length > Math.min(DUNGEON_MAX_PARTY_MEMBERS, definition.maxPartyMembers)) return { ok: false, reason: 'party_full' };
    const memberIds = party.members.map((member) => member.playerId);
    const locations = memberIds.map((playerId) => ({ playerId, location: this.world.getPlayerLocation(playerId) }));
    if (locations.some((entry) => entry.location?.instanceId?.startsWith('dungeon:'))) return { ok: false, reason: 'member_already_in_dungeon' };
    if (locations.some((entry) => !entry.location || this.world.getInstanceRuntime(entry.location.instanceId)?.template?.id !== definition.entryMapTemplateId)) return { ok: false, reason: 'members_not_at_entry_map' };
    const leaderState = this.players.getPlayer(leader);
    const leaderLocation = locations.find((entry) => entry.playerId === leader)?.location ?? null;
    const leaderInstance = leaderLocation?.instanceId ? this.world.getInstanceRuntime(leaderLocation.instanceId) as any : null;
    const leaderRuntime = leaderInstance?.getPlayer?.(leader) as { x?: number; y?: number } | null;
    const entryX = Number(definition.entryX ?? 0);
    const entryY = Number(definition.entryY ?? 0);
    const leaderX = Number(leaderRuntime?.x ?? leaderState?.x);
    const leaderY = Number(leaderRuntime?.y ?? leaderState?.y);
    if (!leaderState || !leaderInstance
      || leaderInstance.template?.id !== definition.entryMapTemplateId
      || !Number.isFinite(leaderX) || !Number.isFinite(leaderY)
      || Math.max(Math.abs(leaderX - entryX), Math.abs(leaderY - entryY)) > Math.max(1, Number(definition.entryExitRadius ?? 1))) {
      return { ok: false, reason: 'not_near_memory_stone' };
    }
    const runId = randomUUID();
    const selection = { difficulty, ...(difficulty === 'present' ? { presentRank: presentRank! } : {}) } as any;
    const effectiveStep = resolveDungeonEffectiveStep(selection, definition.difficulty.maxPresentRank);
    const run: DungeonRunState = {
      runId,
      dungeonId: definition.id,
      partyId: party.partyId,
      status: 'created',
      difficulty: selection,
      effectiveStep,
      mapInstanceId: `dungeon:${runId}`,
      members: party.members.map((member) => ({ playerId: member.playerId, playerNo: member.playerNo ?? undefined, name: member.name, joinedAt: Date.now() })),
      currentRoomId: definition.rooms?.[0]?.roomId,
      createdAt: Date.now(),
    };
    const timeout = Math.max(1_000, Math.trunc(definition.confirmationTimeoutMs ?? 60_000));
    const timer = setTimeout(() => this.abortPending(runId, 'confirmation_timeout'), timeout);
    timer.unref?.();
    const pending: PendingEntry = { run, definition, expiresAt: Date.now() + timeout, confirmations: new Map(memberIds.map((playerId) => [playerId, false])), timer };
    this.pending.set(runId, pending);
    this.runs.set(runId, run);
    this.runPersistence.save(run);
    this.emitPreparation(pending, 'preparing');
    return { ok: true, run, expiresAt: pending.expiresAt };
  }

  async respondEntry(playerId: string, runIdInput: unknown, confirm: boolean) {
    const runId = String(runIdInput ?? '').trim();
    const pending = this.pending.get(runId);
    if (!pending) return { ok: false, reason: 'entry_not_pending' };
    if (!pending.run.members.some((member) => member.playerId === playerId.trim())) return { ok: false, reason: 'not_run_member' };
    pending.confirmations.set(playerId.trim(), confirm === true);
    if (confirm !== true && pending.countdownTimer) {
      clearTimeout(pending.countdownTimer);
      pending.countdownTimer = undefined;
      pending.countdownStartedAt = undefined;
    }
    const allReady = pending.run.members.every((member) => pending.confirmations.get(member.playerId) === true);
    if (!allReady) {
      this.emitPreparation(pending, 'preparing');
      return { ok: true, run: pending.run };
    }
    if (!pending.countdownTimer) {
      pending.countdownStartedAt = Date.now();
      const enterAt = pending.countdownStartedAt + 5_000;
      pending.countdownTimer = setTimeout(() => { void this.activate(runId); }, 5_000);
      pending.countdownTimer.unref?.();
      this.emitPreparation(pending, 'countdown', enterAt);
    }
    return { ok: true, run: pending.run, enterAt: pending.countdownStartedAt + 5_000 };
  }

  getRun(runId: string): DungeonRunState | null { return this.runs.get(runId) ?? null; }

  async exit(playerId: string, runIdInput?: unknown) {
    const player = playerId.trim();
    const location = this.world.getPlayerLocation(player);
    const runId = String(runIdInput ?? (location?.instanceId?.startsWith('dungeon:') ? location.instanceId.slice('dungeon:'.length) : '')).trim();
    const run = this.runs.get(runId);
    if (!run) {
      const recovered = await this.recoverOrphanDungeonPlayer(player, location?.instanceId);
      return recovered ? { ok: true, reason: 'orphan_dungeon_recovered' } : { ok: false, reason: 'run_not_active' };
    }
    if (run.status === 'failed' || run.status === 'aborted' || run.status === 'expired') return { ok: false, reason: 'run_not_active' };
    if (!run.members.some((member) => member.playerId === player)) return { ok: false, reason: 'not_run_member' };
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    const entry = this.content.getDungeonDefinition(run.dungeonId);
    if (!instance || !entry) return { ok: false, reason: 'instance_not_found' };
    const runtimePlayer = instance.getPlayer?.(player);
    const exitStone = [...(instance.template?.npcs ?? [])].find((npc: any) => (npc?.npcId ?? npc?.id) === 'npc_dungeon_memory_stone');
    const exitX = Number(exitStone?.x ?? entry.entryX ?? 0);
    const exitY = Number(exitStone?.y ?? entry.entryY ?? 0);
    const dx = Number(runtimePlayer?.x ?? 9999) - exitX;
    const dy = Number(runtimePlayer?.y ?? 9999) - exitY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > Math.max(1, entry.entryExitRadius ?? 1)) return { ok: false, reason: 'not_at_exit' };
    await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId: player, sessionId: this.sessions.getBinding(player)?.sessionId ?? null, instanceId: this.world.getOrCreatePublicInstance(entry.entryMapTemplateId).meta.instanceId, mapId: entry.entryMapTemplateId, preferredX: entry.entryX, preferredY: entry.entryY, allowCreateFallback: false, relocateExisting: true }, this.world as any);
    const exited = this.exitedPlayers.get(runId) ?? new Set<string>();
    exited.add(player); this.exitedPlayers.set(runId, exited);
    this.controllers.get(entry.flowType)?.onPlayerLeave?.(run, entry, player, this.buildFlowContext());
    if (exited.size >= run.members.length) await this.destroyRun(run);
    return { ok: true, run };
  }

  onMonsterDefeated(instanceId: string, monsterId: string): void {
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
    if (!run) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const controller = definition ? this.controllers.get(definition.flowType) : null;
    const context = this.buildFlowContext();
    this.emitRunState(run);
    if (controller?.onEntityDeath) controller.onEntityDeath(run, definition!, monsterId, 'monster', context);
    else controller?.onMonsterDefeated?.(run, definition!, monsterId, context);
  }

  onFormationDestroyed(instanceId: string, _formationId: string): void {
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
    if (!run) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const controller = definition ? this.controllers.get(definition.flowType) : null;
    controller?.onFormationDestroyed?.(run, definition!, _formationId, this.buildFlowContext());
  }

  /** 每个逻辑实例 tick 一次；流程控制器只消费内存态，不在 tick 内访问数据库。 */
  onInstanceTick(instanceId: string, _instanceTick: number): void {
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
    if (!run) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const controller = definition ? this.controllers.get(definition.flowType) : null;
    controller?.onTick?.(run, definition!, this.buildFlowContext());
    if (run.status === 'active') this.emitRunState(run);
  }

  private async activate(runId: string) {
    const pending = this.pending.get(runId); if (!pending) return { ok: false, reason: 'entry_not_pending' };
    clearTimeout(pending.timer); if (pending.countdownTimer) clearTimeout(pending.countdownTimer); this.pending.delete(runId);
    const { run, definition } = pending;
    run.status = 'activating';
    this.runPersistence.save(run);
    const currentParty = await this.parties.getParty(run.partyId);
    const expectedMembers = run.members.map((member) => member.playerId).sort();
    const actualMembers = currentParty?.members.map((member) => member.playerId).sort() ?? [];
    const partyChanged = !currentParty
      || currentParty.partyId !== run.partyId
      || expectedMembers.length !== actualMembers.length
      || expectedMembers.some((playerId, index) => playerId !== actualMembers[index]);
    const membersStillAtEntry = run.members.every((member) => {
      const location = this.world.getPlayerLocation(member.playerId);
      return Boolean(location)
        && !location!.instanceId.startsWith('dungeon:')
        && this.world.getInstanceRuntime(location!.instanceId)?.template?.id === definition.entryMapTemplateId;
    });
    if (partyChanged || !membersStillAtEntry) {
      run.status = 'aborted'; run.failureReason = partyChanged ? 'party_changed' : 'members_not_at_entry_map';
      this.runPersistence.save(run);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    const staminaCost = resolveDungeonStaminaCost(run.difficulty.difficulty, definition.difficulty);
    const staminaMembers = run.members.map((member) => member.playerId);
    const staminaViews = staminaMembers.map((playerId) => this.players.refreshDungeonStamina(playerId));
    if (staminaViews.some((view) => view.current < staminaCost)) {
      run.status = 'aborted'; run.failureReason = 'stamina_insufficient';
      this.runPersistence.save(run);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: 'stamina_insufficient', run });
      return { ok: false, reason: 'stamina_insufficient', run };
    }
    const consumed: string[] = [];
    try {
      const result = await this.players.consumeDungeonStaminaForPlayersDurably(staminaMembers, staminaCost);
      if (!result.ok) throw new Error(result.reason ?? 'stamina_insufficient');
      consumed.push(...staminaMembers);
    } catch (error) {
      for (const playerId of consumed) await this.players.refundDungeonStaminaDurably(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = error instanceof Error ? error.message : String(error);
      this.runPersistence.save(run);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    const multipliers = resolveDungeonAttributeMultipliers(run.difficulty, definition.difficulty.maxPresentRank, definition.difficulty.attributeRule);
    const baseSpawns = definition.flowType === 'defense' ? [] : (definition.rooms?.length ? [] : this.content.createRuntimeMonstersForMap(definition.mapTemplateId));
    const override = run.difficulty.difficulty === 'present'
      ? { ...(definition.difficulty.overrides?.[run.difficulty.difficulty] ?? {}), ...(definition.difficulty.presentRankOverrides?.[run.difficulty.presentRank!] ?? {}) }
      : (definition.difficulty.overrides?.[run.difficulty.difficulty] ?? {});
    const overrideAll = Number.isFinite(Number(override.allAttributeMultiplier)) && Number(override.allAttributeMultiplier) > 0 ? Number(override.allAttributeMultiplier) : 1;
    const overrideHp = Number.isFinite(Number(override.hpMultiplier)) && Number(override.hpMultiplier) > 0 ? Number(override.hpMultiplier) : 1;
    const monsterSpawns = baseSpawns.map((spawn: any) => scaleMonsterSpawn(spawn, run.difficulty, multipliers, overrideAll, overrideHp, override.additionalSkillIds));
    let instance;
    try {
      instance = this.world.createInstance({ instanceId: run.mapInstanceId, templateId: definition.mapTemplateId, kind: 'dungeon', persistent: true, persistentPolicy: 'persistent', partyId: run.partyId, instanceOrigin: 'dungeon', defaultEntry: false, monsterSpawns });
    } catch (error) {
      for (const playerId of consumed) await this.players.refundDungeonStaminaDurably(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'instance_activation_failed';
      this.runPersistence.save(run);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      (instance.meta as any).dungeonRunId = run.runId;
      (instance.meta as any).dungeonId = run.dungeonId;
      this.activateRoom(instance, definition, run, run.currentRoomId ?? definition.rooms?.[0]?.roomId);
      run.status = 'active'; run.activatedAt = Date.now();
      this.combatStatsByRunId.set(run.runId, new Map(run.members.map((member) => [member.playerId, { damageDealt: 0, damageTaken: 0, healingDone: 0 }])));
      this.runPersistence.save(run);
      timeoutTimer = setTimeout(() => this.expireRun(run.runId), Math.max(1, Math.trunc(definition.timeoutSeconds ?? 3600)) * 1000);
      timeoutTimer.unref?.();
      this.runTimers.set(run.runId, timeoutTimer);
      this.controllers.get(definition.flowType)?.onRunCreated?.(run, definition, this.buildFlowContext());
    } catch (_error) {
      for (const playerId of consumed) await this.players.refundDungeonStaminaDurably(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'instance_activation_failed';
      this.runPersistence.save(run);
      await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_activation_failed').catch(() => undefined);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    try {
      for (const member of run.members) {
        await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId: member.playerId, sessionId: this.sessions.getBinding(member.playerId)?.sessionId ?? null, instanceId: run.mapInstanceId, mapId: definition.mapTemplateId, allowCreateFallback: false, relocateExisting: true }, this.world as any);
        this.emit(member.playerId, S2C.DungeonState, { run });
        this.emit(member.playerId, S2C.DungeonCatalog, this.buildCatalog(member.playerId));
        this.controllers.get(definition.flowType)?.onPlayerEnter?.(run, definition, member.playerId, this.buildFlowContext());
      }
    } catch (_error) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      this.runTimers.delete(run.runId);
      for (const member of run.members) {
        const location = this.world.getPlayerLocation(member.playerId);
        if (location?.instanceId === run.mapInstanceId) {
          this.world.worldRuntimePlayerSessionService.disconnectPlayer(member.playerId, this.world as any);
        }
      }
      for (const playerId of consumed) await this.players.refundDungeonStaminaDurably(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'player_attach_failed';
      this.runPersistence.save(run);
      await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_activation_failed').catch(() => undefined);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    return { ok: true, run };
  }

  private buildFlowContext() {
    return {
      complete: (target: DungeonRunState, reason: string) => this.completeRun(target, reason),
      advanceRoom: (target: DungeonRunState, roomId: string) => {
        const definition = this.content.getDungeonDefinition(target.dungeonId);
        const instance = this.world.getInstanceRuntime(target.mapInstanceId) as any;
        if (definition && instance) this.activateRoom(instance, definition, target, roomId);
      },
      spawnWave: (target: DungeonRunState, waveIndex: number) => this.spawnWave(target, waveIndex),
      countAliveHostiles: (target: DungeonRunState) => {
        const instance = this.world.getInstanceRuntime(target.mapInstanceId) as any;
        return [...(instance?.monstersByRuntimeId?.values?.() ?? [])].filter((monster: any) => monster.alive === true && Number(monster.hp) > 0).length;
      },
      now: () => Date.now(),
    };
  }

  private activateRoom(instance: any, definition: DungeonDefinition, run: DungeonRunState, roomId?: string): void {
    const room = definition.rooms?.find((entry) => entry.roomId === roomId) ?? definition.rooms?.[0];
    if (!room) return;
    for (const monster of [...(instance.monstersByRuntimeId?.values?.() ?? [])]) instance.removeRuntimeMonster?.(monster.runtimeId);
    for (const formation of this.world.worldRuntimeFormationService.getFormationList(instance.meta.instanceId).filter((entry: any) => entry?.source === 'dungeon_controller' || entry?.controlMode === 'controller_only')) {
      this.mechanismFormations.destroy(instance.meta.instanceId, formation.id);
    }
    const spawnX = Number.isFinite(Number(room.spawnX)) ? Number(room.spawnX) : Number(definition.entryX ?? 0);
    const spawnY = Number.isFinite(Number(room.spawnY)) ? Number(room.spawnY) : Number(definition.entryY ?? 0);
    const monsterIds = room.bossId ? [room.bossId] : [...(room.spawnGroupIds ?? []), ...(room.eliteGroupIds ?? [])];
    for (const monsterId of monsterIds) this.addScaledMonster(instance, run, monsterId, spawnX, spawnY);
    run.currentRoomId = room.roomId;
    this.runPersistence.save(run);
    const boss = room.bossId ? [...(instance.monstersByRuntimeId?.values?.() ?? [])].find((entry: any) => entry.monsterId === room.bossId) : null;
    if (room.mechanismFormation && boss) {
      this.mechanismFormations.create({
        instanceId: instance.meta.instanceId, runId: run.runId, controllerId: definition.controllerId,
        roomId: room.roomId, config: room.mechanismFormation, x: boss.x, y: boss.y, bossMaxHp: boss.maxHp,
        radius: Math.max(1, Number(instance.template?.width) || 1, Number(instance.template?.height) || 1),
      });
    }
    this.emitRunState(run);
  }

  private spawnWave(run: DungeonRunState, waveIndex: number): void {
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    const wave = definition?.waves?.find((entry) => entry.waveIndex === waveIndex);
    if (!definition || !instance || !wave) return;
    const room = definition.rooms?.find((entry) => entry.roomId === run.currentRoomId);
    const spawnX = Number(room?.spawnX ?? definition.entryX ?? 0);
    const spawnY = Number(room?.spawnY ?? definition.entryY ?? 0);
    const count = Math.max(1, Math.trunc(Number(wave.count) || 1));
    for (let i = 0; i < count; i++) {
      const monsterId = wave.spawnGroupIds[i % wave.spawnGroupIds.length];
      if (monsterId) this.addScaledMonster(instance, run, monsterId, spawnX + (i % 3), spawnY + Math.trunc(i / 3));
    }
    run.currentWaveIndex = waveIndex;
    this.runPersistence.save(run);
    this.emitRunState(run);
  }

  private addScaledMonster(instance: any, run: DungeonRunState, monsterId: string, x: number, y: number): void {
    const spawn = this.content.createRuntimeMonsterSpawn(monsterId, { x, y });
    if (!spawn) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const override = run.difficulty.difficulty === 'present'
      ? { ...(definition?.difficulty.overrides?.present ?? {}), ...(definition?.difficulty.presentRankOverrides?.[run.difficulty.presentRank!] ?? {}) }
      : (definition?.difficulty.overrides?.[run.difficulty.difficulty] ?? {});
    if (!definition) return;
    const multipliers = resolveDungeonAttributeMultipliers(run.difficulty, definition.difficulty.maxPresentRank, definition.difficulty.attributeRule);
    instance.addRuntimeMonster?.(scaleMonsterSpawn(spawn, run.difficulty, multipliers, Number(override.allAttributeMultiplier) || 1, Number(override.hpMultiplier) || 1, override.additionalSkillIds));
  }

  private completeRun(run: DungeonRunState, _reason: string): void {
    if (run.status !== 'active') return;
    const timeoutTimer = this.runTimers.get(run.runId);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    this.runTimers.delete(run.runId);
    run.status = 'completing'; run.completedAt = Date.now(); run.completionId = randomUUID(); run.settlementId = randomUUID();
    this.runPersistence.save(run);
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const rewardResult = definition ? this.rewards.claim(run, definition) : { claimed: false, rewardsByPlayer: new Map<string, Array<{ itemId: string; count: number }>>() };
    const stats = this.combatStatsByRunId.get(run.runId) ?? new Map();
    const settlementMembers: DungeonSettlementMember[] = run.members.map((member) => {
      const player = this.players.getPlayer(member.playerId) as any;
      const current = stats.get(member.playerId) ?? { damageDealt: 0, damageTaken: 0, healingDone: 0 };
      return {
        playerId: member.playerId,
        ...(member.playerNo === undefined ? {} : { playerNo: member.playerNo }),
        name: String(player?.name ?? member.name ?? member.playerId),
        ...(player?.displayName ? { displayName: String(player.displayName) } : {}),
        ...(player?.realmName ? { realmName: String(player.realmName) } : {}),
        ...(player?.realmStage ? { realmStage: String(player.realmStage) } : {}),
        damageDealt: Math.max(0, Math.round(current.damageDealt)),
        damageTaken: Math.max(0, Math.round(current.damageTaken)),
        healingDone: Math.max(0, Math.round(current.healingDone)),
        rewards: rewardResult.rewardsByPlayer.get(member.playerId) ?? [],
      };
    });
    const rewardClaimed = rewardResult.claimed;
    const settlement: DungeonSettlementView = { runId: run.runId, dungeonId: run.dungeonId, dungeonName: definition?.name, status: 'completed', completionId: run.completionId, rewardTableId: definition?.rewards.rewardTableId, rewardClaimed, difficulty: run.difficulty, effectiveStep: run.effectiveStep, completedAt: run.completedAt, members: settlementMembers };
    for (const member of run.members) this.emit(member.playerId, S2C.DungeonSettlement, { settlement });
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    for (const monster of [...(instance?.monstersByRuntimeId?.values?.() ?? [])]) instance.removeRuntimeMonster?.(monster.runtimeId);
    for (const formation of this.world.worldRuntimeFormationService.getFormationList(run.mapInstanceId).filter((entry: any) => entry?.source === 'dungeon_controller' || entry?.controlMode === 'controller_only')) {
      this.mechanismFormations.destroy(run.mapInstanceId, formation.id);
    }
    // 结算后仍需允许玩家走到入口撤离；实例保持可附着状态，真正销毁时再停止运行态。
    if (instance) instance.meta.status = 'completed';
    run.status = 'completed';
    this.runPersistence.save(run);
    const cleanupTimer = setTimeout(() => void this.forceCleanupCompletedRun(run), 30_000);
    cleanupTimer.unref?.();
  }

  private expireRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || !['active', 'activating'].includes(run.status)) return;
    run.status = 'expired'; run.failureReason = 'timeout';
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    if (definition) this.controllers.get(definition.flowType)?.onAbort?.(run, definition, 'timeout', this.buildFlowContext());
    this.runPersistence.save(run);
    for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: 'timeout', run });
    void this.forceCleanupCompletedRun(run);
  }

  private async forceCleanupCompletedRun(run: DungeonRunState): Promise<void> {
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    if (!definition) return;
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    if (instance?.listPlayerIds) {
      for (const playerId of instance.listPlayerIds()) {
        await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId, sessionId: this.sessions.getBinding(playerId)?.sessionId ?? null, instanceId: this.world.getOrCreatePublicInstance(definition.entryMapTemplateId).meta.instanceId, mapId: definition.entryMapTemplateId, preferredX: definition.entryX, preferredY: definition.entryY, allowCreateFallback: false, relocateExisting: true }, this.world as any).catch(() => undefined);
      }
    }
    await this.destroyRun(run);
  }

  private abortPending(runId: string, reason: string): void {
    const pending = this.pending.get(runId); if (!pending) return;
    clearTimeout(pending.timer); if (pending.countdownTimer) clearTimeout(pending.countdownTimer); this.pending.delete(runId); pending.run.status = 'aborted'; pending.run.failureReason = reason;
    this.controllers.get(pending.definition.flowType)?.onAbort?.(pending.run, pending.definition, reason, this.buildFlowContext());
    for (const member of pending.run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason, run: pending.run });
  }

  private async destroyRun(run: DungeonRunState): Promise<void> {
    run.destroyedAt = Date.now();
    this.runPersistence.save(run);
    await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_completed').catch((error) => this.logger.warn(`副本实例销毁失败 ${run.mapInstanceId}: ${error instanceof Error ? error.message : String(error)}`));
    this.runs.delete(run.runId);
    this.combatStatsByRunId.delete(run.runId);
    this.exitedPlayers.delete(run.runId);
    this.runTimers.delete(run.runId);
  }

  private emit(playerId: string, event: string, payload: unknown): void {
    const socket = this.sessions.getSocketByPlayerId(playerId);
    socket?.emit(event, payload);
  }

  /** 更新重启后遗留在临时副本实例中的玩家，避免 run 内存态丢失后无法撤离。 */
  private async recoverOrphanDungeonPlayer(playerId: string, instanceId?: string): Promise<boolean> {
    if (!instanceId) return false;
    const instance = this.world.getInstanceRuntime(instanceId) as any;
    if (!isDungeonInstanceCandidate(instanceId, instance)) return false;
    const definitions = this.listDefinitions();
    const instanceTemplateId = String(instance?.template?.id ?? '').trim()
      || instanceId.replace(/^(public|real|line):/, '').trim();
    const definition = definitions.find((entry) => entry.id === instance?.meta?.dungeonId)
      ?? definitions.find((entry) => entry.mapTemplateId === instanceTemplateId || entry.id === instanceTemplateId)
      ?? (definitions.length === 1 ? definitions[0] : undefined);
    if (!definition) return false;
    try {
      await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({
        playerId,
        sessionId: this.sessions.getBinding(playerId)?.sessionId ?? null,
        instanceId: this.world.getOrCreatePublicInstance(definition.entryMapTemplateId).meta.instanceId,
        mapId: definition.entryMapTemplateId,
        preferredX: definition.entryX,
        preferredY: definition.entryY,
        allowCreateFallback: false,
        relocateExisting: true,
      }, this.world as any);
    } catch {
      return false;
    }
    await this.world.destroyEmptyManagedInstance(instanceId, 'dungeon_orphan_recovered').catch(() => undefined);
    return true;
  }

  private emitPreparation(pending: PendingEntry, phase: 'preparing' | 'countdown', enterAt?: number): void {
    const { run, definition } = pending;
    const members = run.members.map((member) => {
      const player = this.players.getPlayer(member.playerId);
      return {
        playerId: member.playerId,
        ...(member.playerNo === undefined ? {} : { playerNo: member.playerNo }),
        name: String(player?.name ?? member.name ?? member.playerId),
        ...(player?.displayName ? { displayName: String(player.displayName) } : {}),
        ...(resolvePlayerImageUrl(player) ? { imageUrl: resolvePlayerImageUrl(player) } : {}),
        ...(player?.realmName ? { realmName: player.realmName } : {}),
        ...(player?.realmStage ? { realmStage: player.realmStage } : {}),
        ready: pending.confirmations.get(member.playerId) === true,
      };
    });
    for (const member of run.members) {
      this.emit(member.playerId, S2C.DungeonEntryPrompt, {
        runId: run.runId,
        dungeonId: definition.id,
        dungeonName: definition.name,
        difficulty: run.difficulty.difficulty,
        presentRank: run.difficulty.presentRank ?? 'mortal',
        staminaCost: resolveDungeonStaminaCost(run.difficulty.difficulty, definition.difficulty),
        expiresAt: pending.expiresAt,
        leaderPlayerId: run.members[0]?.playerId ?? '',
        phase,
        members,
        ...(enterAt ? { enterAt } : {}),
      });
    }
  }

  private emitRunState(run: DungeonRunState): void {
    this.updateProgressProjection(run);
    for (const member of run.members) this.emit(member.playerId, S2C.DungeonState, { run });
  }

  private updateProgressProjection(run: DungeonRunState): void {
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    if (!definition || !instance) return;
    const rooms = definition.rooms ?? [];
    const waves = definition.waves ?? [];
    const roomIndex = Math.max(0, rooms.findIndex((room) => room.roomId === run.currentRoomId));
    const boss = [...(instance.monstersByRuntimeId?.values?.() ?? [])].find((monster: any) => {
      const room = rooms[roomIndex];
      return Boolean(room?.bossId && monster.monsterId === room.bossId);
    });
    const roomProgress = rooms.length > 0
      ? ((roomIndex + (boss && Number(boss.maxHp) > 0
        ? 1 - Math.max(0, Number(boss.hp)) / Number(boss.maxHp)
        : (run.bossProgress && rooms[roomIndex]?.bossId ? 1 : 0))) / rooms.length) * 100
      : (waves.length > 0 ? (Math.min(waves.length, Number(run.currentWaveIndex ?? 0)) / waves.length) * 100 : 0);
    run.progressPercent = Math.max(0, Math.min(100, Math.round(roomProgress)));
    if (boss) {
      run.bossProgress = { name: String(boss.name ?? boss.monsterId ?? '守关者'), hp: Math.max(0, Number(boss.hp) || 0), maxHp: Math.max(1, Number(boss.maxHp) || 1) };
    } else if (run.bossProgress && rooms[roomIndex]?.bossId) {
      run.bossProgress = { ...run.bossProgress, hp: 0 };
    } else {
      delete run.bossProgress;
    }
  }

  recordCombatOutcome(outcome: any): void {
    const instanceId = String(outcome?.instanceId ?? '').trim();
    if (!instanceId.startsWith('dungeon:')) return;
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && ['active', 'completing'].includes(entry.status));
    if (!run) return;
    const stats = this.combatStatsByRunId.get(run.runId);
    if (!stats) return;
    const actor = outcome?.actor;
    const target = outcome?.target;
    const result = outcome?.result ?? {};
    const amount = Math.max(0, Math.round(Number(result.appliedDamage ?? result.damage ?? result.totalDamage) || 0));
    const heal = Math.max(0, Math.round(Number(result.appliedHealing ?? result.heal ?? result.healing ?? result.totalHeal) || 0));
    if (actor?.kind === 'player' && stats.has(actor.id)) {
      const current = stats.get(actor.id)!;
      if (target?.kind === 'monster' && amount > 0) current.damageDealt += amount;
      if (heal > 0) current.healingDone += heal;
    }
    if (target?.kind === 'player' && stats.has(target.id) && actor?.kind === 'monster' && amount > 0) {
      stats.get(target.id)!.damageTaken += amount;
    }
  }
}

function resolvePlayerImageUrl(player: any): string | undefined {
  const candidate = [player?.imageUrl, player?.avatarUrl, player?.portraitUrl].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (!candidate) return undefined;
  const value = candidate.trim();
  return /^(https?:\/\/|\/|data:image\/)/i.test(value) ? value : undefined;
}

function normalizeRecoveredDungeonRun(payload: any): DungeonRunState | null {
  if (!payload || typeof payload.runId !== 'string' || typeof payload.dungeonId !== 'string' || typeof payload.mapInstanceId !== 'string') return null;
  if (!Array.isArray(payload.members) || payload.members.length === 0) return null;
  const allowedStatuses = new Set(['created', 'activating', 'active', 'completing', 'completed']);
  if (!allowedStatuses.has(payload.status)) return null;
  const members = payload.members.filter((member: any) => typeof member?.playerId === 'string' && member.playerId.trim()).map((member: any) => ({
    playerId: member.playerId.trim(),
    ...(member.playerNo === undefined ? {} : { playerNo: Number(member.playerNo) }),
    ...(member.name ? { name: String(member.name) } : {}),
    joinedAt: Number.isFinite(Number(member.joinedAt)) ? Number(member.joinedAt) : Date.now(),
  }));
  if (members.length === 0) return null;
  return {
    ...payload,
    runId: payload.runId.trim(),
    dungeonId: payload.dungeonId.trim(),
    mapInstanceId: payload.mapInstanceId.trim(),
    members,
  } as DungeonRunState;
}

function isDungeonInstanceCandidate(instanceId: string | undefined, instance: any): boolean {
  if (!instanceId) return false;
  if (instance?.meta?.kind === 'dungeon') return true;
  if (!instance && /^(public|real|line):dungeon_/.test(instanceId)) return true;
  if (instance?.meta?.kind !== 'public') return false;
  const templateId = String(instance.template?.id ?? '').trim();
  return templateId.startsWith('dungeon_')
    && /^(public|real|line):/.test(instanceId);
}

const standardBaselinesMap = new Map<number, number>();
const peakBaselinesMap = new Map<number, number>();

function getPeakToStandardScaleRatio(level: number): number {
  if (standardBaselinesMap.size === 0) {
    try {
      const stdPath = resolveProjectPath('packages', 'server', 'data', 'content', 'realm-attr-baselines.json');
      if (fs.existsSync(stdPath)) {
        const parsed = JSON.parse(fs.readFileSync(stdPath, 'utf8'));
        for (const entry of parsed.levels || []) standardBaselinesMap.set(entry.realmLv, entry.singleAttr);
      }
    } catch {}
  }
  if (peakBaselinesMap.size === 0) {
    try {
      const peakPath = resolveProjectPath('packages', 'server', 'data', 'content', 'realm-attr-peak-baselines.json');
      if (fs.existsSync(peakPath)) {
        const parsed = JSON.parse(fs.readFileSync(peakPath, 'utf8'));
        for (const entry of parsed.levels || []) peakBaselinesMap.set(entry.realmLv, entry.singleAttr);
      }
    } catch {}
  }
  const std = standardBaselinesMap.get(level) || 10;
  const peak = peakBaselinesMap.get(level) || 10;
  return Math.max(1, peak / std);
}

function scaleMonsterSpawn(
  spawn: any,
  runDifficulty: { difficulty: DungeonDifficulty; presentRank?: TechniqueGrade },
  multipliers: { allAttributeMultiplier: number; hpMultiplier: number; baselineSource?: string },
  overrideAll = 1,
  overrideHp = 1,
  additionalSkillIds: readonly string[] = [],
): any {
  const isPresent = runDifficulty.difficulty === 'present';
  const monsterLevel = Number(spawn.level) || 1;
  const peakRatio = isPresent ? getPeakToStandardScaleRatio(monsterLevel) : 1;

  const finalAllMult = multipliers.allAttributeMultiplier * overrideAll * peakRatio;
  const finalHpMult = multipliers.hpMultiplier * overrideHp * peakRatio;

  const cloneNumbers = (value: any, multiplier: number): any => {
    if (!value || typeof value !== 'object') return value;
    const output: any = Array.isArray(value) ? [...value] : { ...value };
    for (const key of Object.keys(output)) if (typeof output[key] === 'number' && Number.isFinite(output[key])) output[key] *= multiplier;
    return output;
  };
  const scaled = { ...spawn, baseAttrs: cloneNumbers(spawn.baseAttrs, finalAllMult), baseNumericStats: cloneNumbers(spawn.baseNumericStats, finalAllMult) };
  if (scaled.baseNumericStats && typeof scaled.baseNumericStats === 'object') {
    for (const key of ['maxHp', 'hp'] as const) if (typeof scaled.baseNumericStats[key] === 'number') scaled.baseNumericStats[key] = Number(spawn.baseNumericStats[key]) * (finalHpMult / Math.max(1, finalAllMult));
  }
  scaled.skills = [...new Set([...(Array.isArray(spawn.skills) ? spawn.skills : []), ...additionalSkillIds.filter((id) => typeof id === 'string' && id.trim())])];
  scaled.maxHp = Math.max(1, Math.round(Number(spawn.maxHp) * finalHpMult));
  scaled.hp = scaled.maxHp;
  return scaled;
}
