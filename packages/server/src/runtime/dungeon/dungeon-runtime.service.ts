import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DUNGEON_MAX_PARTY_MEMBERS,
  S2C,
  type DungeonDefinition,
  type DungeonDifficulty,
  type DungeonRunState,
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

interface PendingEntry {
  run: DungeonRunState;
  definition: DungeonDefinition;
  expiresAt: number;
  confirmations: Map<string, boolean>;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class DungeonRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DungeonRuntimeService.name);
  private readonly runs = new Map<string, DungeonRunState>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly exitedPlayers = new Map<string, Set<string>>();
  private readonly runTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
  ) {}

  onModuleInit(): void {
    this.world.attachDungeonRuntime(this);
  }

  onModuleDestroy(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
    for (const timer of this.runTimers.values()) clearTimeout(timer);
    this.runTimers.clear();
  }

  listDefinitions(): DungeonDefinition[] { return this.content.listDungeonDefinitions(); }

  buildCatalog(playerId: string) {
    const activeRun = [...this.runs.values()].find((run) => run.members.some((member) => member.playerId === playerId) && ['created', 'activating', 'active', 'completing', 'completed'].includes(run.status));
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
    const cost = resolveDungeonStaminaCost(difficulty, definition.difficulty);
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
    const pending: PendingEntry = { run, definition, expiresAt: Date.now() + timeout, confirmations: new Map([[leader, true]]), timer };
    this.pending.set(runId, pending);
    this.runs.set(runId, run);
    for (const memberId of memberIds) {
      this.emit(memberId, S2C.DungeonEntryPrompt, {
        runId, dungeonId: definition.id, dungeonName: definition.name, difficulty, presentRank: presentRank ?? '凡', staminaCost: cost,
        expiresAt: pending.expiresAt, leaderPlayerId: leader,
      });
    }
    if (memberIds.length === 1) return this.activate(runId);
    return { ok: true, run, expiresAt: pending.expiresAt };
  }

  async respondEntry(playerId: string, runIdInput: unknown, confirm: boolean) {
    const runId = String(runIdInput ?? '').trim();
    const pending = this.pending.get(runId);
    if (!pending) return { ok: false, reason: 'entry_not_pending' };
    if (!pending.run.members.some((member) => member.playerId === playerId.trim())) return { ok: false, reason: 'not_run_member' };
    pending.confirmations.set(playerId.trim(), confirm === true);
    if (confirm !== true) { this.abortPending(runId, 'member_rejected'); return { ok: true, run: pending.run }; }
    if (pending.run.members.some((member) => pending.confirmations.get(member.playerId) !== true)) return { ok: true, run: pending.run };
    return this.activate(runId);
  }

  getRun(runId: string): DungeonRunState | null { return this.runs.get(runId) ?? null; }

  async exit(playerId: string, runIdInput?: unknown) {
    const player = playerId.trim();
    const location = this.world.getPlayerLocation(player);
    const runId = String(runIdInput ?? (location?.instanceId?.startsWith('dungeon:') ? location.instanceId.slice('dungeon:'.length) : '')).trim();
    const run = this.runs.get(runId);
    if (!run || run.status === 'failed' || run.status === 'aborted' || run.status === 'expired') return { ok: false, reason: 'run_not_active' };
    if (!run.members.some((member) => member.playerId === player)) return { ok: false, reason: 'not_run_member' };
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    const entry = this.content.getDungeonDefinition(run.dungeonId);
    if (!instance || !entry) return { ok: false, reason: 'instance_not_found' };
    const runtimePlayer = instance.getPlayer?.(player);
    const dx = Number(runtimePlayer?.x ?? 9999) - Number(entry.entryX ?? 0);
    const dy = Number(runtimePlayer?.y ?? 9999) - Number(entry.entryY ?? 0);
    if (Math.max(Math.abs(dx), Math.abs(dy)) > Math.max(1, entry.entryExitRadius ?? 1)) return { ok: false, reason: 'not_at_exit' };
    await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId: player, sessionId: this.sessions.getBinding(player)?.sessionId ?? null, instanceId: this.world.getOrCreatePublicInstance(entry.entryMapTemplateId).meta.instanceId, mapId: entry.entryMapTemplateId, preferredX: entry.entryX, preferredY: entry.entryY, allowCreateFallback: false, relocateExisting: true }, this.world as any);
    const exited = this.exitedPlayers.get(runId) ?? new Set<string>();
    exited.add(player); this.exitedPlayers.set(runId, exited);
    if (exited.size >= run.members.length) await this.destroyRun(run);
    return { ok: true, run };
  }

  onMonsterDefeated(instanceId: string, monsterId: string): void {
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
    if (!run) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const controller = definition ? this.controllers.get(definition.flowType) : null;
    controller?.onMonsterDefeated?.(run, definition!, monsterId, { complete: (target, reason) => this.completeRun(target, reason), advanceRoom: (target, roomId) => { target.currentRoomId = roomId; this.emitRunState(target); } });
  }

  onFormationDestroyed(instanceId: string, _formationId: string): void {
    const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
    if (!run) return;
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    const controller = definition ? this.controllers.get(definition.flowType) : null;
    controller?.onFormationDestroyed?.(run, definition!, _formationId, { complete: (target, reason) => this.completeRun(target, reason), advanceRoom: (target, roomId) => { target.currentRoomId = roomId; this.emitRunState(target); } });
  }

  private async activate(runId: string) {
    const pending = this.pending.get(runId); if (!pending) return { ok: false, reason: 'entry_not_pending' };
    clearTimeout(pending.timer); this.pending.delete(runId);
    const { run, definition } = pending;
    run.status = 'activating';
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
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    const staminaCost = resolveDungeonStaminaCost(run.difficulty.difficulty, definition.difficulty);
    const staminaMembers = run.members.map((member) => member.playerId);
    const staminaViews = staminaMembers.map((playerId) => this.players.refreshDungeonStamina(playerId));
    if (staminaViews.some((view) => view.current < staminaCost)) {
      run.status = 'aborted'; run.failureReason = 'stamina_insufficient';
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: 'stamina_insufficient', run });
      return { ok: false, reason: 'stamina_insufficient', run };
    }
    const consumed: string[] = [];
    try {
      for (const playerId of staminaMembers) {
        const result = this.players.consumeDungeonStamina(playerId, staminaCost);
        if (!result.ok) throw new Error('stamina_insufficient');
        consumed.push(playerId);
      }
    } catch (error) {
      for (const playerId of consumed) this.players.refundDungeonStamina(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = error instanceof Error ? error.message : String(error);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    const multipliers = resolveDungeonAttributeMultipliers(run.difficulty, definition.difficulty.maxPresentRank, definition.difficulty.attributeRule);
    const baseSpawns = this.content.createRuntimeMonstersForMap(definition.mapTemplateId);
    const override = run.difficulty.difficulty === 'present'
      ? { ...(definition.difficulty.overrides?.[run.difficulty.difficulty] ?? {}), ...(definition.difficulty.presentRankOverrides?.[run.difficulty.presentRank!] ?? {}) }
      : (definition.difficulty.overrides?.[run.difficulty.difficulty] ?? {});
    const overrideAll = Number.isFinite(Number(override.allAttributeMultiplier)) && Number(override.allAttributeMultiplier) > 0 ? Number(override.allAttributeMultiplier) : 1;
    const overrideHp = Number.isFinite(Number(override.hpMultiplier)) && Number(override.hpMultiplier) > 0 ? Number(override.hpMultiplier) : 1;
    const monsterSpawns = baseSpawns.map((spawn: any) => scaleMonsterSpawn(spawn, multipliers.allAttributeMultiplier * overrideAll, multipliers.hpMultiplier * overrideHp, override.additionalSkillIds));
    let instance;
    try {
      instance = this.world.createInstance({ instanceId: run.mapInstanceId, templateId: definition.mapTemplateId, kind: 'dungeon', persistent: false, persistentPolicy: 'ephemeral', partyId: run.partyId, instanceOrigin: 'dungeon', defaultEntry: false, monsterSpawns });
    } catch (error) {
      for (const playerId of consumed) this.players.refundDungeonStamina(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'instance_activation_failed';
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      (instance.meta as any).dungeonRunId = run.runId;
      this.installRoomMechanism(instance, definition, run);
      run.status = 'active'; run.activatedAt = Date.now();
      timeoutTimer = setTimeout(() => this.expireRun(run.runId), Math.max(1, Math.trunc(definition.timeoutSeconds ?? 3600)) * 1000);
      timeoutTimer.unref?.();
      this.runTimers.set(run.runId, timeoutTimer);
    } catch (_error) {
      for (const playerId of consumed) this.players.refundDungeonStamina(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'instance_activation_failed';
      await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_activation_failed').catch(() => undefined);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    try {
      for (const member of run.members) {
        await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId: member.playerId, sessionId: this.sessions.getBinding(member.playerId)?.sessionId ?? null, instanceId: run.mapInstanceId, mapId: definition.mapTemplateId, allowCreateFallback: false, relocateExisting: true }, this.world as any);
        this.emit(member.playerId, S2C.DungeonState, { run });
        this.emit(member.playerId, S2C.DungeonCatalog, this.buildCatalog(member.playerId));
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
      for (const playerId of consumed) this.players.refundDungeonStamina(playerId, staminaCost);
      run.status = 'aborted'; run.failureReason = 'player_attach_failed';
      await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_activation_failed').catch(() => undefined);
      for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
      return { ok: false, reason: run.failureReason, run };
    }
    return { ok: true, run };
  }

  private installRoomMechanism(instance: any, definition: DungeonDefinition, run: DungeonRunState): void {
    const config = definition.rooms?.[0]?.mechanismFormation;
    const boss = [...(instance.monstersByRuntimeId?.values?.() ?? [])].find((entry: any) => entry.monsterId === definition.rooms?.[0]?.bossId);
    if (!config || !boss) return;
    const formation = this.world.worldRuntimeFormationService.restoreFormationEntry(instance.meta.instanceId, {
      id: `formation:dungeon:${run.runId}:room:${run.currentRoomId}`,
      formationId: config.formationId,
      lifecycle: 'deployed', controlMode: 'controller_only', arrayEyeMode: 'none', ownerPlayerId: '',
      x: boss.x, y: boss.y, eyeX: boss.x, eyeY: boss.y, spiritStoneCount: 1,
      allocation: {
        // 机制阵法仍复用普通阵法的范围计算；副本房间用地图尺寸覆盖整个固定房间。
        radius: Math.max(1, Number(instance.template?.width) || 1, Number(instance.template?.height) || 1),
        durationHours: 24,
        effectValue: Math.max(1, Math.trunc(Number(config.effectValue) || 1)),
      },
      remainingQiBudget: Math.max(1, Math.ceil(boss.maxHp * (config.powerMultiplierByBossMaxHp ?? 100))),
      remainingSpiritStoneBudget: 1, active: true,
    });
    if (formation) this.world.worldRuntimeFormationService.getFormationList(instance.meta.instanceId).push(formation);
  }

  private completeRun(run: DungeonRunState, _reason: string): void {
    if (run.status !== 'active') return;
    const timeoutTimer = this.runTimers.get(run.runId);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    this.runTimers.delete(run.runId);
    run.status = 'completing'; run.completedAt = Date.now(); run.completionId = randomUUID(); run.settlementId = randomUUID();
    const definition = this.content.getDungeonDefinition(run.dungeonId);
    // 首版奖励沿用 Boss 击杀掉落链路，击杀处理已在进入此处前完成；结算快照因此记录为已发放。
    const settlement: DungeonSettlementView = { runId: run.runId, dungeonId: run.dungeonId, status: 'completed', completionId: run.completionId, rewardTableId: definition?.rewards.rewardTableId, rewardClaimed: true, difficulty: run.difficulty, effectiveStep: run.effectiveStep, completedAt: run.completedAt };
    for (const member of run.members) this.emit(member.playerId, S2C.DungeonSettlement, { settlement });
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    // 结算后仍需允许玩家走到入口撤离；实例保持可附着状态，真正销毁时再停止运行态。
    if (instance) instance.meta.status = 'completed';
    run.status = 'completed';
    const cleanupTimer = setTimeout(() => void this.forceCleanupCompletedRun(run), 30_000);
    cleanupTimer.unref?.();
  }

  private expireRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || !['active', 'activating'].includes(run.status)) return;
    run.status = 'expired'; run.failureReason = 'timeout';
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
    clearTimeout(pending.timer); this.pending.delete(runId); pending.run.status = 'aborted'; pending.run.failureReason = reason;
    for (const member of pending.run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason, run: pending.run });
  }

  private async destroyRun(run: DungeonRunState): Promise<void> {
    run.destroyedAt = Date.now();
    await this.world.destroyEmptyManagedInstance(run.mapInstanceId, 'dungeon_completed').catch((error) => this.logger.warn(`副本实例销毁失败 ${run.mapInstanceId}: ${error instanceof Error ? error.message : String(error)}`));
    this.runs.delete(run.runId);
    this.exitedPlayers.delete(run.runId);
    this.runTimers.delete(run.runId);
  }

  private emit(playerId: string, event: string, payload: unknown): void {
    const socket = this.sessions.getSocketByPlayerId(playerId);
    socket?.emit(event, payload);
  }

  private emitRunState(run: DungeonRunState): void {
    for (const member of run.members) this.emit(member.playerId, S2C.DungeonState, { run });
  }
}

function scaleMonsterSpawn(spawn: any, allMultiplier: number, hpMultiplier: number, additionalSkillIds: readonly string[] = []): any {
  const cloneNumbers = (value: any, multiplier: number): any => {
    if (!value || typeof value !== 'object') return value;
    const output: any = Array.isArray(value) ? [...value] : { ...value };
    for (const key of Object.keys(output)) if (typeof output[key] === 'number' && Number.isFinite(output[key])) output[key] *= multiplier;
    return output;
  };
  const scaled = { ...spawn, baseAttrs: cloneNumbers(spawn.baseAttrs, allMultiplier), baseNumericStats: cloneNumbers(spawn.baseNumericStats, allMultiplier) };
  if (scaled.baseNumericStats && typeof scaled.baseNumericStats === 'object') {
    for (const key of ['maxHp', 'hp'] as const) if (typeof scaled.baseNumericStats[key] === 'number') scaled.baseNumericStats[key] = Number(spawn.baseNumericStats[key]) * (hpMultiplier / Math.max(1, allMultiplier));
  }
  scaled.skills = [...new Set([...(Array.isArray(spawn.skills) ? spawn.skills : []), ...additionalSkillIds.filter((id) => typeof id === 'string' && id.trim())])];
  scaled.maxHp = Math.max(1, Math.round(Number(spawn.maxHp) * hpMultiplier)); scaled.hp = scaled.maxHp;
  return scaled;
}
