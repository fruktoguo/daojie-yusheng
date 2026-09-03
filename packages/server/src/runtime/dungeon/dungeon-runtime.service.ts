import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveProjectPath } from '../../common/project-path';
import {
 DUNGEON_MAX_PARTY_MEMBERS,
 S2C,
 type DungeonDefinition,
 type DungeonPresentationActiveAction,
 type DungeonDifficulty,
 type DungeonRunState,
 type DungeonSettlementMember,
 type DungeonSettlementView,
 type DungeonStaminaView,
 filterDungeonBossDropTable,
 isDungeonPresentRankAllowed,
 resolveDungeonAttributeMultipliers,
 resolveDungeonEffectiveStep,
 resolveDungeonLootMultipliers,
 resolveDungeonPartyDropRateMultiplier,
 resolveDungeonStaminaCost,
 type TechniqueGrade,
 DUNGEON_PRESSURE_BUFF_ID,
 DUNGEON_PRESSURE_DURATION_TICKS,
 DUNGEON_ENTRY_REJECTION_DELAY_MS,
 DUNGEON_EXIT_MEMORY_STONE_NPC_ID,
 DUNGEON_PRESSURE_QI_DRAIN_PERCENT,
 DUNGEON_PRESSURE_SOURCE_ID,
 resolveDungeonPressureStacks,
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
import { DungeonPresentationController, type DungeonPresentationControllerContext } from './dungeon-presentation-controller';

interface PendingEntry {
 run: DungeonRunState;
 definition: DungeonDefinition;
 expiresAt: number;
 confirmations: Map<string, boolean>;
 rejectedMemberIds: Set<string>;
 timer: ReturnType<typeof setTimeout>;
 countdownTimer?: ReturnType<typeof setTimeout>;
 countdownStartedAt?: number;
 rejectionTimer?: ReturnType<typeof setTimeout>;
 rejectionDeadline?: number;
}

interface DungeonCombatMemberStats {
 damageDealt: number;
 damageTaken: number;
 healingDone: number;
}

interface DungeonRewardResult {
 claimed: boolean;
 rewardsByPlayer: Map<string, Array<{ itemId: string; count: number }>>;
}

interface DungeonInstanceTickResult {
 monsterActions?: ReadonlyArray<{
  kind?: unknown;
  skillId?: unknown;
  actionId?: unknown;
 }>;
 engagedMonsterEvents?: ReadonlyArray<{
  runtimeId: string;
  monsterId: string;
  x: number;
  y: number;
  triggerPlayerId?: string;
 }>;
}
interface MonsterSpeechSettableInstance {
 setMonsterSpeechTicks(runtimeId: string, ticks: number): void;
}

function isMonsterSpeechSettable(instance: unknown): instance is MonsterSpeechSettableInstance {
 return typeof instance === 'object' && instance !== null && 'setMonsterSpeechTicks' in instance && typeof (instance as Record<string, unknown>).setMonsterSpeechTicks === 'function';
}

function emptyDungeonRewardResult(): DungeonRewardResult {
 return { claimed: false, rewardsByPlayer: new Map() };
}

/** 只有全部队员都处于当前战败集合时，副本才进入团灭失败终态。 */
export function isDungeonPartyDefeated(
 run: Readonly<Pick<DungeonRunState, 'members' | 'defeatedMemberIds'>>,
): boolean {
 const members = Array.isArray(run.members) ? run.members : [];
 if (members.length === 0) return false;
 const defeated = new Set(
  (Array.isArray(run.defeatedMemberIds) ? run.defeatedMemberIds : [])
   .filter((playerId): playerId is string => typeof playerId === 'string' && playerId.trim().length > 0),
 );
 return members.every((member) => defeated.has(member.playerId));
}

@Injectable()
export class DungeonRuntimeService implements OnModuleInit, OnModuleDestroy {
 private readonly logger = new Logger(DungeonRuntimeService.name);
 private readonly runs = new Map<string, DungeonRunState>();
 private readonly pending = new Map<string, PendingEntry>();
 private readonly exitedPlayers = new Map<string, Set<string>>();
 private readonly runTimers = new Map<string, ReturnType<typeof setTimeout>>();
 private readonly terminalCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
 private readonly combatStatsByRunId = new Map<string, Map<string, DungeonCombatMemberStats>>();
 private restorePromise: Promise<number> | null = null;
 private readonly controllers = new Map<string, DungeonFlowController>([
  ['defense', new DefenseDungeonFlowController()],
  ['suppress_demon', new SuppressDemonDungeonFlowController()],
  ['expedition', new ExpeditionDungeonFlowController()],
 ]);
 private readonly presentationController = new DungeonPresentationController();

 constructor(
  private readonly content: ContentTemplateRepository,
  private readonly parties: PartyMembershipRepository,
  private readonly players: PlayerRuntimeService,
  private readonly world: WorldRuntimeService,
  private readonly sessions: WorldSessionService,
  private readonly mechanismFormations: DungeonMechanismFormationService,
  private readonly rewards: DungeonRewardService,
  private readonly runPersistence: DungeonRunPersistenceService,
 ) { }

 onModuleInit(): void {
  this.world.attachDungeonRuntime(this);
 }

 onModuleDestroy(): void {
  for (const entry of this.pending.values()) {
   clearTimeout(entry.timer);
   if (entry.countdownTimer) clearTimeout(entry.countdownTimer);
   if (entry.rejectionTimer) clearTimeout(entry.rejectionTimer);
  }
  this.pending.clear();
  for (const timer of this.runTimers.values()) clearTimeout(timer);
  this.runTimers.clear();
  for (const timer of this.terminalCleanupTimers.values()) clearTimeout(timer);
  this.terminalCleanupTimers.clear();
  this.combatStatsByRunId.clear();
 }

 listDefinitions(): DungeonDefinition[] { return this.content.listDungeonDefinitions(); }

 /** 返回副本实例对应的持久化流程，供玩家恢复链裁定缺失实例。 */
 async getRunByInstanceId(instanceId: string): Promise<DungeonRunState | null> {
  const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
  if (!normalizedInstanceId) return null;
  const inMemory = [...this.runs.values()]
   .find((run) => run.mapInstanceId === normalizedInstanceId);
  return inMemory ?? this.runPersistence.loadRunStatusByInstanceId(normalizedInstanceId);
 }

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
  const reconciledCatalogCount = await this.runPersistence.reconcileTerminalCatalogInstances();
  if (reconciledCatalogCount > 0) {
   this.logger.log(`已对账并销毁 ${reconciledCatalogCount} 条终态副本实例目录记录`);
  }
  const payloads = await this.runPersistence.loadRecoverableRuns();
  let restored = 0;
  let terminalCatalogReconcileNeeded = false;
  for (const payload of payloads) {
   const run = normalizeRecoveredDungeonRun(payload);
   const definition = run ? this.content.getDungeonDefinition(run.dungeonId) : null;
   if (!run || !definition || this.runs.has(run.runId)) continue;
   if (run.status === 'created') {
    run.status = 'aborted';
    run.failureReason = 'server_restart_before_activation';
    this.runPersistence.save(run);
    await this.runPersistence.waitForSave?.(run.runId);
    continue;
   }
   let instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
   if (run.status === 'activating' && !instance) {
    run.status = 'aborted';
    run.failureReason = 'server_restart_during_activation';
    this.runPersistence.save(run);
    await this.runPersistence.waitForSave?.(run.runId);
    continue;
   }
   if (!instance) {
    if (run.status === 'failed') {
     run.destroyedAt = run.destroyedAt ?? Date.now();
     this.runPersistence.save(run);
     await this.runPersistence.waitForSave(run.runId);
     terminalCatalogReconcileNeeded = true;
     continue;
    }
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
    } catch (error) {
     this.logger.warn(`副本实例恢复失败 ${run.runId}：${error instanceof Error ? error.message : String(error)}`);
     continue;
    }
   }
   instance.meta.dungeonRunId = run.runId;
   instance.meta.dungeonId = run.dungeonId;
   this.applyDungeonEntryMetadata(instance, definition);
   if (run.status === 'activating' || run.status === 'active') {
    run.status = 'active';
    run.activatedAt = run.activatedAt ?? Date.now();
    // catalog 恢复会先创建没有动态妖兽的实例壳；这里必须重新物化当前房间，
    // 再回填已落盘的 runtimeId/HP，否则重启后流程还在但 Boss 直接消失。
    await this.restoreActiveDungeonRuntime(instance, definition, run);
   } else if (run.status === 'completed' || run.status === 'completing' || run.status === 'failed') {
    instance.meta.status = 'completed';
    instance.meta.dungeonRunStatus = run.status;
    // 崩溃可能发生在终态写入与实例清理之间，恢复时再次收敛实体，避免终态副本继续产生战斗。
    this.clearTerminalInstance(run, run.status);
   }
   this.runs.set(run.runId, run);
   this.combatStatsByRunId.set(run.runId, new Map(run.members.map((member) => [member.playerId, { damageDealt: 0, damageTaken: 0, healingDone: 0 }])));
   this.scheduleRecoveredRun(run, definition);
   this.runPersistence.save(run);
   await this.runPersistence.waitForSave?.(run.runId);
   restored++;
  }
  if (terminalCatalogReconcileNeeded) {
   const reconciledAfterRestore = await this.runPersistence.reconcileTerminalCatalogInstances();
   if (reconciledAfterRestore > 0) {
    this.logger.log(`恢复阶段已对账并销毁 ${reconciledAfterRestore} 条缺失实例的终态副本目录记录`);
   }
  }
  if (restored > 0) this.logger.log(`已恢复 ${restored} 个副本流程实例`);
  return restored;
 }

 /**
  * 恢复 active 副本的动态实体。
  *
  * 实例目录恢复只负责创建通用实例壳，且通用实例水合发生在副本流程恢复之前；
  * 因而 dungeon 房间中的动态 Boss/实体必须在这里按当前流程重新建立，再用实例域真源回填。
  */
 private async restoreActiveDungeonRuntime(
  instance: any,
  definition: DungeonDefinition,
  run: DungeonRunState,
 ): Promise<void> {
  const loadedStates = await this.world.loadPersistedMonsterRuntimeStates?.(run.mapInstanceId);
  const persistedStates = Array.isArray(loadedStates) ? loadedStates : [];
  const room = definition.rooms?.find((entry) => entry.roomId === run.currentRoomId) ?? definition.rooms?.[0];
  const expectedMonsterIds = resolveDungeonRoomMonsterIds(room);
  const currentMonsters = Array.from((instance.monstersByRuntimeId?.values?.() ?? []) as Iterable<any>);
  if (room && expectedMonsterIds.length > 0 && !hasMonsterIdMultiplicity(currentMonsters, expectedMonsterIds)) {
   this.activateRoom(instance, definition, run, room.roomId, persistedStates);
   return;
  }

  if (expectedMonsterIds.length > 0) {
   this.materializePersistedDungeonMonsters(instance, run, definition, persistedStates, expectedMonsterIds);
  }
  instance.hydrateMonsterRuntimeStates?.(persistedStates, { preserveScaledBaseStats: true });
  this.ensureDungeonRoomFormation(instance, definition, run, room);
 }

 /** 将已落盘但尚未出现在实例壳中的当前房间实体补回，并保留原 runtimeId。 */
 private materializePersistedDungeonMonsters(
  instance: any,
  run: DungeonRunState,
  definition: DungeonDefinition,
  persistedStates: readonly any[],
  expectedMonsterIds: readonly string[],
 ): void {
  const expectedCounts = countStringValues(expectedMonsterIds);
  const currentByMonsterId = new Map<string, any[]>();
  for (const monster of Array.from((instance.monstersByRuntimeId?.values?.() ?? []) as Iterable<any>)) {
   const monsterId = normalizeOptionalDungeonString(monster?.monsterId);
   if (!monsterId) continue;
   const list = currentByMonsterId.get(monsterId) ?? [];
   list.push(monster);
   currentByMonsterId.set(monsterId, list);
  }
  const usedCurrentIds = new Set<string>();
  for (const state of persistedStates) {
   const monsterId = normalizeOptionalDungeonString(state?.monsterId);
   const runtimeId = normalizeOptionalDungeonString(state?.monsterRuntimeId ?? state?.runtimeId);
   if (!monsterId || !runtimeId || !expectedCounts.has(monsterId) || (expectedCounts.get(monsterId) ?? 0) <= 0) {
    continue;
   }
   expectedCounts.set(monsterId, (expectedCounts.get(monsterId) ?? 1) - 1);
   const exact = instance.getMonsterRuntimeRef?.(runtimeId)
    ?? instance.monstersByRuntimeId?.get?.(runtimeId);
   if (exact) {
    usedCurrentIds.add(runtimeId);
    continue;
   }
   const candidates = currentByMonsterId.get(monsterId) ?? [];
   const replacement = candidates.find((candidate) => {
    const candidateId = normalizeOptionalDungeonString(candidate?.runtimeId);
    return candidateId && !usedCurrentIds.has(candidateId);
   });
   if (replacement?.runtimeId) {
    instance.removeRuntimeMonster?.(replacement.runtimeId);
    usedCurrentIds.add(replacement.runtimeId);
   }
   const x = Number.isFinite(Number(state?.x)) ? Math.trunc(Number(state.x)) : Number(definition.entryX ?? 0);
   const y = Number.isFinite(Number(state?.y)) ? Math.trunc(Number(state.y)) : Number(definition.entryY ?? 0);
   this.addScaledMonster(instance, run, monsterId, x, y, {
    runtimeId,
    alive: state?.alive !== false,
   });
  }
 }

 private scheduleRecoveredRun(run: DungeonRunState, definition: DungeonDefinition): void {
  if (run.status === 'active') {
   const deadline = Number(run.activatedAt ?? run.createdAt) + Math.max(1, Math.trunc(definition.timeoutSeconds ?? 3600)) * 1000;
   const timer = setTimeout(() => this.expireRun(run.runId), Math.max(0, deadline - Date.now()));
   timer.unref?.();
   this.runTimers.set(run.runId, timer);
   return;
  }
  if (run.status === 'completed' || run.status === 'completing' || run.status === 'failed') {
   const deadline = Number(run.completedAt ?? Date.now()) + 30_000;
   this.scheduleTerminalCleanup(run, Math.max(0, deadline - Date.now()));
  }
 }

 buildCatalog(playerId: string) {
  const activeRun = [...this.runs.values()].find((run) => run.members.some((member) => member.playerId === playerId) && ['created', 'activating', 'active', 'completing', 'completed'].includes(run.status));
  if (!activeRun) {
   const location = this.world.getPlayerLocation(playerId);
   const instance = location?.instanceId ? this.world.getInstanceRuntime(location.instanceId) as any : null;
   if (isDungeonInstanceCandidate(location?.instanceId, instance)) {
    // 查询目录时可能恰好处于“实例目录已恢复、流程注册表尚未恢复”的窗口；
    // 先完成一次快照恢复，再确认仍无流程，避免把可恢复玩家误判为孤儿并立即传送。
    void this.restorePersistedRuns()
     .then(() => {
      const recoveredRun = [...this.runs.values()].find((run) => run.members.some((member) => member.playerId === playerId) && ['created', 'activating', 'active', 'completing', 'completed'].includes(run.status));
      const currentLocation = this.world.getPlayerLocation(playerId);
      if (!recoveredRun && currentLocation?.instanceId === location.instanceId) {
       void this.recoverOrphanDungeonPlayer(playerId, location.instanceId);
      }
     })
     .catch((error) => {
      // 持久化查询失败时不能把“暂时未知”降级成孤儿副本，否则会误撤离仍在进行中的队伍。
      this.logger.warn(`副本目录查询触发恢复失败 ${location.instanceId}：${error instanceof Error ? error.message : String(error)}`);
     });
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
  const pending: PendingEntry = {
   run,
   definition,
   expiresAt: Date.now() + timeout,
   confirmations: new Map(memberIds.map((playerId) => [playerId, false])),
   rejectedMemberIds: new Set(),
   timer,
  };
  this.pending.set(runId, pending);
  this.runs.set(runId, run);
  this.runPersistence.save(run);
  if (!await this.waitForRunPersistence(run)) {
   clearTimeout(timer);
   if (pending.rejectionTimer) clearTimeout(pending.rejectionTimer);
   this.pending.delete(runId);
   this.runs.delete(runId);
   this.runPersistence.remove(runId);
   return { ok: false, reason: 'dungeon_persistence_unavailable' };
  }
  this.emitPreparation(pending, 'preparing');
  return { ok: true, run, expiresAt: pending.expiresAt };
 }

 async respondEntry(playerId: string, runIdInput: unknown, confirm: boolean, reject = false) {
  const runId = String(runIdInput ?? '').trim();
  const pending = this.pending.get(runId);
  if (!pending) return { ok: false, reason: 'entry_not_pending' };
  const memberId = playerId.trim();
  if (!pending.run.members.some((member) => member.playerId === memberId)) return { ok: false, reason: 'not_run_member' };
  if (pending.rejectionDeadline || pending.rejectedMemberIds.has(memberId)) {
   this.emitPreparation(pending, 'preparing', undefined, pending.rejectionDeadline);
   return { ok: true, run: pending.run };
  }
  pending.confirmations.set(memberId, confirm === true);
  if (reject === true) {
   pending.confirmations.set(memberId, false);
   pending.rejectedMemberIds.add(memberId);
   pending.rejectionDeadline = Date.now() + DUNGEON_ENTRY_REJECTION_DELAY_MS;
   if (pending.countdownTimer) {
    clearTimeout(pending.countdownTimer);
    pending.countdownTimer = undefined;
    pending.countdownStartedAt = undefined;
   }
   this.emitPreparation(pending, 'preparing', undefined, pending.rejectionDeadline);
   pending.rejectionTimer = setTimeout(() => this.abortPending(runId, 'member_rejected'), DUNGEON_ENTRY_REJECTION_DELAY_MS);
   pending.rejectionTimer.unref?.();
   return { ok: true, run: pending.run };
  }
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

 /**
  * 玩家在副本内被权威战斗链击败时调用。死亡先记入副本快照，再由通用规则裁定是否团灭。
  * 单人副本天然满足“全员战败”，多人副本则允许剩余队员继续挑战。
  */
 onPlayerDefeated(playerIdInput: string, instanceIdInput?: string | null): void {
  const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
  const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
  if (!playerId) return;
  const run = [...this.runs.values()].find((entry) => {
   if (!['active', 'activating'].includes(entry.status)) return false;
   if (!entry.members.some((member) => member.playerId === playerId)) return false;
   if (instanceId && entry.mapInstanceId === instanceId) return true;
   return this.world.getPlayerLocation(playerId)?.instanceId === entry.mapInstanceId;
  });
  if (!run) return;

  this.reconcileDefeatedMembers(run);
  const defeated = new Set(run.defeatedMemberIds ?? []);
  if (defeated.has(playerId)) return;
  defeated.add(playerId);
  run.defeatedMemberIds = [...defeated];
  this.runPersistence.save(run);
  this.emitRunState(run);
  if (isDungeonPartyDefeated(run)) this.failRun(run, 'party_defeated');
 }

 /** 玩家复生或被外部恢复生命后清除当前战败标记，避免旧死亡状态污染后续团灭判定。 */
 onPlayerRevived(playerIdInput: string, instanceIdInput?: string | null): void {
  const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
  const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
  if (!playerId) return;
  const run = [...this.runs.values()].find((entry) => {
   if (entry.status !== 'active' || !entry.defeatedMemberIds?.includes(playerId)) return false;
   return !instanceId || entry.mapInstanceId === instanceId;
  });
  if (!run || !this.clearDefeatedMember(run, playerId)) return;
  this.runPersistence.save(run);
  this.emitRunState(run);
 }

 private clearDefeatedMember(run: DungeonRunState, playerId: string): boolean {
  const previous = Array.isArray(run.defeatedMemberIds) ? run.defeatedMemberIds : [];
  if (!previous.includes(playerId)) return false;
  const remaining = previous.filter((entry) => entry !== playerId);
  if (remaining.length > 0) run.defeatedMemberIds = remaining;
  else delete run.defeatedMemberIds;
  return true;
 }

 /** 清除已完成复生的成员标记，并过滤快照中已不存在的成员。 */
 private reconcileDefeatedMembers(run: DungeonRunState): boolean {
  const previous = Array.isArray(run.defeatedMemberIds) ? run.defeatedMemberIds : [];
  if (previous.length === 0) return false;
  const memberIds = new Set(run.members.map((member) => member.playerId));
  const next: string[] = [];
  for (const playerId of previous) {
   if (!memberIds.has(playerId)) continue;
   const player = this.players.getPlayer(playerId) as any;
   if (player && Number(player.hp) > 0) continue;
   if (!next.includes(playerId)) next.push(playerId);
  }
  const changed = previous.length !== next.length || previous.some((playerId, index) => playerId !== next[index]);
  if (!changed) return false;
  if (next.length > 0) run.defeatedMemberIds = next;
  else delete run.defeatedMemberIds;
  return true;
 }

 async exit(playerId: string, runIdInput?: unknown) {
  const player = playerId.trim();
  const playerState = this.players.getPlayer(player) as any;
  let location = this.world.getPlayerLocation(player);
  const requestedRunId = normalizeDungeonRunId(runIdInput);
  const locationInstanceId = typeof location?.instanceId === 'string' ? location.instanceId.trim() : '';
  const playerInstanceId = typeof playerState?.instanceId === 'string' ? playerState.instanceId.trim() : '';
  const inferredInstanceId = locationInstanceId.startsWith('dungeon:')
   ? locationInstanceId
   : (playerInstanceId.startsWith('dungeon:') ? playerInstanceId : '');
  let runId = requestedRunId
   || (inferredInstanceId.startsWith('dungeon:') ? inferredInstanceId.slice('dungeon:'.length) : '');
  let run = this.runs.get(runId);
  let restoreFailed = false;
  if (!run && runId) {
   // 进程重启/热更新可能先恢复了实例目录，流程注册表却尚未恢复；
   // 退出动作必须先尝试重建流程，不能立即把仍可恢复的玩家当作孤儿撤离。
   try {
    await this.restorePersistedRuns();
   } catch (error) {
    restoreFailed = true;
    this.logger.warn(`副本退出前恢复流程失败 ${runId}：${error instanceof Error ? error.message : String(error)}`);
   }
   run = this.runs.get(runId);
   location = this.world.getPlayerLocation(player) ?? location;
   if (!run && !requestedRunId) {
    const refreshedInstanceId = typeof location?.instanceId === 'string' ? location.instanceId.trim() : '';
    if (refreshedInstanceId.startsWith('dungeon:')) {
     runId = refreshedInstanceId.slice('dungeon:'.length);
     run = this.runs.get(runId);
    }
   }
  }
  if (!run) {
   if (restoreFailed) return { ok: false, reason: 'dungeon_persistence_unavailable' };
   const orphanInstanceId = typeof location?.instanceId === 'string' && location.instanceId.trim()
    ? location.instanceId.trim()
    : (runId ? `dungeon:${runId}` : '');
   const recovered = await this.recoverOrphanDungeonPlayer(player, orphanInstanceId);
   return recovered ? { ok: true, reason: 'orphan_dungeon_recovered' } : { ok: false, reason: 'run_not_active' };
  }
  if (run.status === 'failed' || run.status === 'aborted' || run.status === 'expired') return { ok: false, reason: 'run_not_active' };
  if (!run.members.some((member) => member.playerId === player)) return { ok: false, reason: 'not_run_member' };
  const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
  const entry = this.content.getDungeonDefinition(run.dungeonId);
  if (!instance || !entry) return { ok: false, reason: 'instance_not_found' };
  const currentInstanceId = typeof location?.instanceId === 'string' && location.instanceId.trim()
   ? location.instanceId.trim()
   : (typeof playerState?.instanceId === 'string' ? playerState.instanceId.trim() : '');
  if (currentInstanceId && currentInstanceId !== run.mapInstanceId) return { ok: false, reason: 'not_run_member' };
  const runtimePlayer = instance.getPlayer?.(player);
  const runtimePosition = instance.getPlayerPosition?.(player) ?? runtimePlayer;
  const exitStone = [...(instance.template?.npcs ?? [])].find((npc: any) => (npc?.npcId ?? npc?.id) === DUNGEON_EXIT_MEMORY_STONE_NPC_ID);
  const playerX = firstFiniteDungeonCoordinate(runtimePosition?.x, playerState?.x);
  const playerY = firstFiniteDungeonCoordinate(runtimePosition?.y, playerState?.y);
  const configuredExitRadius = Number(entry.entryExitRadius ?? 1);
  const exitRadius = Math.max(1, Number.isFinite(configuredExitRadius) ? configuredExitRadius : 1);
  const exitAnchors = [
   { x: Number(exitStone?.x), y: Number(exitStone?.y) },
   { x: Number(entry.entryX), y: Number(entry.entryY) },
  ].filter((anchor) => Number.isFinite(anchor.x) && Number.isFinite(anchor.y));
  // entryX/entryY 是副本入口锚点。重启恢复时若入口格被 Boss 占用，
  // 玩家会被服务端移到相邻空格；该锚点仍属于忆梦石入口区域，不能因此误报“不在附近”。
  if (!Number.isFinite(playerX) || !Number.isFinite(playerY)
   || !exitAnchors.some((anchor) => Math.max(Math.abs(playerX - anchor.x), Math.abs(playerY - anchor.y)) <= exitRadius)) {
   return { ok: false, reason: 'not_at_exit' };
  }
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
 onInstanceTick(instanceId: string, _instanceTick: number, tickResult?: DungeonInstanceTickResult): void {
  const run = [...this.runs.values()].find((entry) => entry.mapInstanceId === instanceId && entry.status === 'active');
  if (!run) return;
  const defeatedChanged = this.reconcileDefeatedMembers(run);
  if (defeatedChanged) this.runPersistence.save(run);
  if (isDungeonPartyDefeated(run)) {
   this.failRun(run, 'party_defeated');
   return;
  }
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  const controller = definition ? this.controllers.get(definition.flowType) : null;
  if (definition && run.status === 'active' && tickResult?.engagedMonsterEvents?.length) {
   const instance = this.world.getInstanceRuntime(run.mapInstanceId);
   for (const event of tickResult.engagedMonsterEvents) {
    const speechTicks = this.presentationController.onMonsterEngaged(
     run,
     definition,
     event.monsterId,
     this.buildPresentationContext(),
    );
    if (speechTicks > 0 && isMonsterSpeechSettable(instance)) {
     instance.setMonsterSpeechTicks(event.runtimeId, speechTicks);
    }
   }
  }
  if (definition && run.status === 'active') {
   this.presentationController.onMonsterActions(
    run,
    definition,
    tickResult?.monsterActions ?? [],
    this.buildPresentationContext(),
   );
  }
  controller?.onTick?.(run, definition!, this.buildFlowContext());
  if (definition && run.status === 'active') {
   this.presentationController.onTick(run, definition, this.buildPresentationContext());
  }
  if (run.status === 'active') this.emitRunState(run);
 }

 private async activate(runId: string) {
  const pending = this.pending.get(runId); if (!pending) return { ok: false, reason: 'entry_not_pending' };
  clearTimeout(pending.timer); if (pending.countdownTimer) clearTimeout(pending.countdownTimer); if (pending.rejectionTimer) clearTimeout(pending.rejectionTimer); this.pending.delete(runId);
  const { run, definition } = pending;
  run.status = 'activating';
  this.runPersistence.save(run);
  if (!await this.waitForRunPersistence(run)) {
   run.status = 'aborted';
   run.failureReason = 'dungeon_persistence_unavailable';
   this.runPersistence.save(run);
   for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: run.failureReason, run });
   return { ok: false, reason: run.failureReason, run };
  }
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
  const monsterSpawns = baseSpawns.map((spawn: any) => {
   const scaled = scaleMonsterSpawn(spawn, run.difficulty, multipliers, overrideAll, overrideHp, override.additionalSkillIds);
   const openingStep = (definition.presentation?.onCombatEngaged ?? definition.presentation?.onRunCreated ?? [])
    .find((step) => step.actor?.kind === 'monster' && step.actor?.id === spawn.monsterId && step.type === 'dialogue');
   const combatOpeningTicks = openingStep?.type === 'dialogue'
    ? Math.max(1, Math.ceil((openingStep.durationMs ?? 3000) / 1000))
    : 0;
   if (combatOpeningTicks > 0) {
    (scaled as { combatOpeningTicks?: number }).combatOpeningTicks = combatOpeningTicks;
   }
   return scaled;
  });
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
   this.applyDungeonEntryMetadata(instance, definition);
   this.activateRoom(instance, definition, run, run.currentRoomId ?? definition.rooms?.[0]?.roomId);
   run.status = 'active'; run.activatedAt = Date.now();
   this.combatStatsByRunId.set(run.runId, new Map(run.members.map((member) => [member.playerId, { damageDealt: 0, damageTaken: 0, healingDone: 0 }])));
   this.runPersistence.save(run);
   if (!await this.waitForRunPersistence(run)) {
    throw new Error('dungeon_persistence_unavailable');
   }
   timeoutTimer = setTimeout(() => this.expireRun(run.runId), Math.max(1, Math.trunc(definition.timeoutSeconds ?? 3600)) * 1000);
   timeoutTimer.unref?.();
   this.runTimers.set(run.runId, timeoutTimer);
   this.controllers.get(definition.flowType)?.onRunCreated?.(run, definition, this.buildFlowContext());
   this.presentationController.onRunCreated(run, definition, this.buildPresentationContext());
   this.runPersistence.save(run);
  } catch (_error) {
   for (const playerId of consumed) await this.players.refundDungeonStaminaDurably(playerId, staminaCost);
   run.status = 'aborted';
   run.failureReason = _error instanceof Error && _error.message === 'dungeon_persistence_unavailable'
    ? 'dungeon_persistence_unavailable'
    : 'instance_activation_failed';
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

 private buildPresentationContext(): DungeonPresentationControllerContext {
  return {
   getInstance: (run) => this.world.getInstanceRuntime(run.mapInstanceId) as any,
   getPlayer: (playerId) => this.players.getPlayer(playerId),
   resolveActorPosition: (run, actor) => {
    const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
    if (!instance) return null;
    if (actor.kind === 'monster') {
     const monster = [...(instance.monstersByRuntimeId?.values?.() ?? [])]
      .find((entry: any) => entry?.alive === true && entry?.monsterId === actor.id);
     return monster && Number.isFinite(Number(monster.x)) && Number.isFinite(Number(monster.y))
      ? { x: Math.trunc(monster.x), y: Math.trunc(monster.y) }
      : null;
    }
    const npc = [...(instance.npcsById?.values?.() ?? [])]
     .find((entry: any) => entry?.npcId === actor.id || entry?.id === actor.id);
    return npc && Number.isFinite(Number(npc.x)) && Number.isFinite(Number(npc.y))
     ? { x: Math.trunc(npc.x), y: Math.trunc(npc.y) }
     : null;
   },
   pushDialogueBubble: (run, position, text, durationMs) => {
    this.world.pushCombatEffect(run.mapInstanceId, {
     type: 'float',
     x: position.x,
     y: position.y,
     text,
     color: '#f6d58b',
     variant: 'action',
     bubble: true,
     durationMs,
    });
   },
   applyActions: (run, actions) => this.applyDungeonPresentationActions(run, actions),
  };
 }

 /** 每息按所有有效来源汇总威压层数，再一次性精确覆盖目标 Buff。 */
 private applyDungeonPressure(
  run: DungeonRunState,
  actions: readonly DungeonPresentationActiveAction[],
 ): Set<string> {
  const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
  if (!instance) return new Set();
  const pressureSources: any[] = [];
  const validActionIds = new Set<string>();
  const seenSourceRuntimeIds = new Set<string>();
  for (const action of actions) {
   if (action.actor.kind !== 'monster') continue;
   const source = [...(instance.monstersByRuntimeId?.values?.() ?? [])]
    .find((entry: any) => entry?.alive === true && entry?.monsterId === action.actor.id);
   if (!source || Number(source.hp) <= 0 || Number(source.qi) <= 0) continue;
   validActionIds.add(action.stepId);
   if (seenSourceRuntimeIds.has(String(source.runtimeId))) continue;
   seenSourceRuntimeIds.add(String(source.runtimeId));
   const drain = Math.max(1, Math.ceil(Math.max(0, Number(source.maxQi) || 0) * DUNGEON_PRESSURE_QI_DRAIN_PERCENT));
   source.qi = Math.max(0, Math.round(Number(source.qi) || 0) - drain);
   instance.markMonsterRuntimePersistenceDirty?.(source.runtimeId);
   instance.markAoiViewChangedAt?.(source.x, source.y);
   instance.worldRevision = Math.max(0, Math.trunc(Number(instance.worldRevision) || 0)) + 1;
   pressureSources.push(source);
  }

  const desiredStacksByPlayerId = new Map<string, number>();
  for (const source of pressureSources) {
   const viewRange = Math.max(0, Math.trunc(Number(source.numericStats?.viewRange ?? source.aggroRange ?? 10) || 0));
   const visibleIndices = instance.collectVisibleTileIndices?.(source.x, source.y, viewRange) ?? new Set();
   const visiblePlayers = instance.collectPlayersByTileIndices?.(visibleIndices) ?? [];
   for (const player of visiblePlayers) {
    if (!player?.playerId || Number(player.hp) <= 0) continue;
    if (chebyshevDistance(source.x, source.y, player.x, player.y) > viewRange) continue;
    const member = run.members.find((entry) => entry.playerId === player.playerId);
    if (!member) continue;
    const stacks = resolveDungeonPressureStacks(source.level, player.realm?.realmLv ?? player.realmLv);
    if (stacks > 0) desiredStacksByPlayerId.set(player.playerId, (desiredStacksByPlayerId.get(player.playerId) ?? 0) + stacks);
   }
  }

  for (const member of run.members) {
   if (!this.players.getPlayer(member.playerId)) continue;
   const stacks = desiredStacksByPlayerId.get(member.playerId) ?? 0;
   this.players.replaceTemporaryBuff(member.playerId, {
    buffId: DUNGEON_PRESSURE_BUFF_ID,
    name: '威压',
    desc: '境界威压压制了战斗属性与移动速度。',
    shortMark: '压',
    category: 'debuff',
    visibility: 'public',
    remainingTicks: stacks > 0 ? DUNGEON_PRESSURE_DURATION_TICKS + 1 : 0,
    duration: DUNGEON_PRESSURE_DURATION_TICKS,
    stacks,
    maxStacks: 999,
    sourceSkillId: DUNGEON_PRESSURE_SOURCE_ID,
    sourceSkillName: '威压',
    realmLv: Math.max(1, ...pressureSources.map((source) => Math.trunc(Number(source.level) || 1))),
    color: '#805ad5',
   });
  }
  return validActionIds;
 }

 private applyDungeonPresentationActions(
  run: DungeonRunState,
  actions: readonly DungeonPresentationActiveAction[],
 ): Set<string> {
  const pressureActions = actions.filter((action) => action.actionId.trim().toLowerCase() === DUNGEON_PRESSURE_BUFF_ID
   || action.actionId.trim().toLowerCase() === 'pressure'
   || action.actionId === '威压');
  return pressureActions.length > 0 ? this.applyDungeonPressure(run, pressureActions) : new Set<string>();
 }

 private clearDungeonPressure(run: DungeonRunState): void {
  for (const member of run.members) {
   if (!this.players.getPlayer(member.playerId)) continue;
   this.players.replaceTemporaryBuff(member.playerId, {
    buffId: DUNGEON_PRESSURE_BUFF_ID,
    name: '威压',
    shortMark: '压',
    category: 'debuff',
    visibility: 'public',
    remainingTicks: 0,
    duration: DUNGEON_PRESSURE_DURATION_TICKS,
    stacks: 0,
    maxStacks: 999,
    sourceSkillId: DUNGEON_PRESSURE_SOURCE_ID,
    sourceSkillName: '威压',
   });
  }
 }

 private activateRoom(
  instance: any,
  definition: DungeonDefinition,
  run: DungeonRunState,
  roomId?: string,
  persistedStates: readonly any[] = [],
 ): void {
  const room = definition.rooms?.find((entry) => entry.roomId === roomId) ?? definition.rooms?.[0];
  if (!room) return;
  for (const monster of [...(instance.monstersByRuntimeId?.values?.() ?? [])]) instance.removeRuntimeMonster?.(monster.runtimeId);
  for (const formation of this.world.worldRuntimeFormationService.getFormationList(instance.meta.instanceId).filter((entry: any) => entry?.source === 'dungeon_controller' || entry?.controlMode === 'controller_only')) {
   this.mechanismFormations.destroy(instance.meta.instanceId, formation.id);
  }
  const spawnX = Number.isFinite(Number(room.spawnX)) ? Number(room.spawnX) : Number(definition.entryX ?? 0);
  const spawnY = Number.isFinite(Number(room.spawnY)) ? Number(room.spawnY) : Number(definition.entryY ?? 0);
  const monsterIds = room.bossId ? [room.bossId] : [...(room.spawnGroupIds ?? []), ...(room.eliteGroupIds ?? [])];
  const persistedByMonsterId = new Map<string, any[]>();
  for (const state of persistedStates) {
   const monsterId = normalizeOptionalDungeonString(state?.monsterId);
   if (!monsterId || !monsterIds.includes(monsterId)) continue;
   const states = persistedByMonsterId.get(monsterId) ?? [];
   states.push(state);
   persistedByMonsterId.set(monsterId, states);
  }
  for (const monsterId of monsterIds) {
   const persisted = persistedByMonsterId.get(monsterId)?.shift();
   const x = Number.isFinite(Number(persisted?.x)) ? Math.trunc(Number(persisted.x)) : spawnX;
   const y = Number.isFinite(Number(persisted?.y)) ? Math.trunc(Number(persisted.y)) : spawnY;
   this.addScaledMonster(instance, run, monsterId, x, y, {
    runtimeId: normalizeOptionalDungeonString(persisted?.monsterRuntimeId ?? persisted?.runtimeId) || undefined,
    alive: persisted?.alive !== false,
    ...(room.bossId === monsterId && Array.isArray(room.bossSkillIds) ? { skillIds: room.bossSkillIds } : {}),
    ...(room.bossId === monsterId && Array.isArray(room.bossDropTable) ? { dropTable: room.bossDropTable } : {}),
   });
  }
  run.currentRoomId = room.roomId;
  this.runPersistence.save(run);
  if (persistedStates.length > 0) {
   instance.hydrateMonsterRuntimeStates?.(persistedStates, { preserveScaledBaseStats: true });
  }
  this.ensureDungeonRoomFormation(instance, definition, run, room);
  this.emitRunState(run);
 }

 /** 副本机制阵法不进入通用持久化表，重启时按当前房间重新建立。 */
 private ensureDungeonRoomFormation(instance: any, definition: DungeonDefinition, run: DungeonRunState, room: any): void {
  if (!room?.mechanismFormation) return;
  const boss = room.bossId ? [...(instance.monstersByRuntimeId?.values?.() ?? [])].find((entry: any) => entry.monsterId === room.bossId) : null;
  if (!boss) return;
  const formations = this.world.worldRuntimeFormationService?.getFormationList?.(instance.meta.instanceId) ?? [];
  const expectedFormationId = `formation:dungeon:${run.runId}:room:${room.roomId}`;
  if (formations.some((entry: any) => entry?.id === expectedFormationId
   || (entry?.source === 'dungeon_controller' && entry?.controllerId === definition.controllerId))) {
   return;
  }
  this.mechanismFormations.create({
   instanceId: instance.meta.instanceId, runId: run.runId, controllerId: definition.controllerId,
   roomId: room.roomId, config: room.mechanismFormation, x: boss.x, y: boss.y, bossMaxHp: boss.maxHp,
   radius: Math.max(1, Number(instance.template?.width) || 1, Number(instance.template?.height) || 1),
  });
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

 private addScaledMonster(
  instance: any,
  run: DungeonRunState,
  monsterId: string,
  x: number,
  y: number,
  options: { runtimeId?: string; alive?: boolean; skillIds?: readonly string[]; dropTable?: readonly any[] } = {},
 ): void {
  const spawn = this.content.createRuntimeMonsterSpawn(monsterId, {
   x,
   y,
   ...(options.runtimeId ? { runtimeId: options.runtimeId } : {}),
   ...(options.alive === false ? { alive: false } : {}),
  });
  if (!spawn) return;
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  const override = run.difficulty.difficulty === 'present'
   ? { ...(definition?.difficulty.overrides?.present ?? {}), ...(definition?.difficulty.presentRankOverrides?.[run.difficulty.presentRank!] ?? {}) }
   : (definition?.difficulty.overrides?.[run.difficulty.difficulty] ?? {});
  if (!definition) return;
  const multipliers = resolveDungeonAttributeMultipliers(run.difficulty, definition.difficulty.maxPresentRank, definition.difficulty.attributeRule);
  const lootMultipliers = resolveDungeonLootMultipliers(run.difficulty, definition.difficulty.maxPresentRank);
  lootMultipliers.dropRateMultiplier *= resolveDungeonPartyDropRateMultiplier(run.members.length);
  const effectiveDropTable = filterDungeonBossDropTable(options.dropTable, run.difficulty);
  const scaledSpawn = scaleMonsterSpawn(
   spawn,
   run.difficulty,
   multipliers,
   Number(override.allAttributeMultiplier) || 1,
   Number(override.hpMultiplier) || 1,
   override.additionalSkillIds,
   options.skillIds,
   effectiveDropTable,
   lootMultipliers,
  );
  const openingStep = (definition.presentation?.onCombatEngaged ?? definition.presentation?.onRunCreated ?? [])
   .find((step) => step.actor?.kind === 'monster' && step.actor?.id === monsterId && step.type === 'dialogue');
  const combatOpeningTicks = openingStep?.type === 'dialogue'
   ? Math.max(1, Math.ceil((openingStep.durationMs ?? 3000) / 1000))
   : 0;
  if (combatOpeningTicks > 0) {
   (scaledSpawn as { combatOpeningTicks?: number }).combatOpeningTicks = combatOpeningTicks;
  }
  instance.addRuntimeMonster?.(scaledSpawn);
 }

 private completeRun(run: DungeonRunState, _reason: string): void {
  if (run.status !== 'active') return;
  this.clearRunTimeout(run.runId);
  this.clearDungeonPressure(run);
  this.presentationController.onAbort(run);
  run.status = 'completing';
  run.completedAt = Date.now();
  run.completionId = randomUUID();
  run.settlementId = randomUUID();
  delete run.defeatedMemberIds;
  this.runPersistence.save(run);
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  const rewardResult = definition
   ? this.rewards.claim(run, definition)
   : emptyDungeonRewardResult();
  const settlement = this.buildSettlement(run, 'completed', rewardResult);
  for (const member of run.members) this.emit(member.playerId, S2C.DungeonSettlement, { settlement });
  this.clearTerminalInstance(run, 'completed');
  // 结算后仍需允许玩家走到入口撤离；实例保持可附着状态，真正销毁时再停止运行态。
  run.status = 'completed';
  this.runPersistence.save(run);
  this.scheduleTerminalCleanup(run);
 }

 /** 全员战败时进入失败终态；失败不发放通关奖励，但保留队伍统计和失败结算。 */
 private failRun(run: DungeonRunState, reason: string): void {
  if (!['active', 'activating'].includes(run.status)) return;
  this.clearRunTimeout(run.runId);
  this.clearDungeonPressure(run);
  this.presentationController.onAbort(run);
  run.status = 'failed';
  run.failureReason = reason;
  run.completedAt = Date.now();
  run.completionId = randomUUID();
  run.settlementId = randomUUID();
  this.logger.log(`副本进入战败终态：runId=${run.runId} dungeonId=${run.dungeonId} reason=${reason}`);
  try {
   const definition = this.content.getDungeonDefinition(run.dungeonId);
   if (definition) this.controllers.get(definition.flowType)?.onAbort?.(run, definition, reason, this.buildFlowContext());
  } catch (error) {
   this.logger.warn(`副本战败流程收尾失败 ${run.runId}：${error instanceof Error ? error.message : String(error)}`);
  }
  this.runPersistence.save(run);
  // 先同步终态，关闭进行中的 HUD，再发送失败结算弹窗。
  this.emitRunState(run);
  const settlement = this.buildSettlement(run, 'failed', emptyDungeonRewardResult());
  for (const member of run.members) this.emit(member.playerId, S2C.DungeonSettlement, { settlement });
  this.clearTerminalInstance(run, 'failed');
  this.runPersistence.save(run);
  this.scheduleTerminalCleanup(run);
 }

 private buildSettlement(
  run: DungeonRunState,
  status: DungeonSettlementView['status'],
  rewardResult: DungeonRewardResult,
 ): DungeonSettlementView {
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  const stats = this.combatStatsByRunId.get(run.runId) ?? new Map();
  const settlementMembers: DungeonSettlementMember[] = run.members.map((member) => {
   const player = this.players.getPlayer(member.playerId) as any;
   const current = stats.get(member.playerId) ?? { damageDealt: 0, damageTaken: 0, healingDone: 0 };
   const imageUrl = resolvePlayerImageUrl(player);
   return {
    playerId: member.playerId,
    ...(member.playerNo === undefined ? {} : { playerNo: member.playerNo }),
    name: String(player?.name ?? member.name ?? member.playerId),
    ...(player?.displayName ? { displayName: String(player.displayName) } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(player?.realmName ? { realmName: String(player.realmName) } : {}),
    ...(player?.realmStage ? { realmStage: String(player.realmStage) } : {}),
    damageDealt: Math.max(0, Math.round(current.damageDealt)),
    damageTaken: Math.max(0, Math.round(current.damageTaken)),
    healingDone: Math.max(0, Math.round(current.healingDone)),
    rewards: rewardResult.rewardsByPlayer.get(member.playerId) ?? [],
   };
  });
  return {
   runId: run.runId,
   dungeonId: run.dungeonId,
   ...(definition?.name ? { dungeonName: definition.name } : {}),
   status,
   completionId: run.completionId ?? run.settlementId ?? run.runId,
   ...(definition?.rewards.rewardTableId ? { rewardTableId: definition.rewards.rewardTableId } : {}),
   rewardClaimed: rewardResult.claimed,
   difficulty: run.difficulty,
   effectiveStep: run.effectiveStep,
   completedAt: run.completedAt ?? Date.now(),
   ...(run.failureReason ? { failureReason: run.failureReason } : {}),
   members: settlementMembers,
  };
 }

 private clearTerminalInstance(run: DungeonRunState, terminalStatus: DungeonRunState['status']): void {
  const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
  for (const monster of [...(instance?.monstersByRuntimeId?.values?.() ?? [])]) instance.removeRuntimeMonster?.(monster.runtimeId);
  for (const formation of this.world.worldRuntimeFormationService.getFormationList(run.mapInstanceId).filter((entry: any) => entry?.source === 'dungeon_controller' || entry?.controlMode === 'controller_only')) {
   this.mechanismFormations.destroy(run.mapInstanceId, formation.id);
  }
  if (instance) {
   instance.meta.status = 'completed';
   instance.meta.dungeonRunStatus = terminalStatus;
  }
 }

 private clearRunTimeout(runId: string): void {
  const timeoutTimer = this.runTimers.get(runId);
  if (timeoutTimer) clearTimeout(timeoutTimer);
  this.runTimers.delete(runId);
 }

 private scheduleTerminalCleanup(run: DungeonRunState, delayMs = 30_000): void {
  const previous = this.terminalCleanupTimers.get(run.runId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
   this.terminalCleanupTimers.delete(run.runId);
   void this.forceCleanupTerminalRun(run);
  }, Math.max(0, Math.trunc(delayMs)));
  timer.unref?.();
  this.terminalCleanupTimers.set(run.runId, timer);
 }

 private expireRun(runId: string): void {
  const run = this.runs.get(runId);
  if (!run || !['active', 'activating'].includes(run.status)) return;
  run.status = 'expired'; run.failureReason = 'timeout';
  this.clearDungeonPressure(run);
  this.presentationController.onAbort(run);
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  if (definition) this.controllers.get(definition.flowType)?.onAbort?.(run, definition, 'timeout', this.buildFlowContext());
  this.runPersistence.save(run);
  for (const member of run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason: 'timeout', run });
  void this.forceCleanupTerminalRun(run);
 }

 private async forceCleanupTerminalRun(run: DungeonRunState): Promise<void> {
  const definition = this.content.getDungeonDefinition(run.dungeonId);
  if (!definition) return;
  const instance = this.world.getInstanceRuntime(run.mapInstanceId) as any;
  if (instance?.listPlayerIds) {
   for (const playerId of instance.listPlayerIds()) {
    await this.world.worldRuntimePlayerSessionService.connectPlayerWhenReady({ playerId, sessionId: this.sessions.getBinding(playerId)?.sessionId ?? null, instanceId: this.world.getOrCreatePublicInstance(definition.entryMapTemplateId).meta.instanceId, mapId: definition.entryMapTemplateId, preferredX: definition.entryX, preferredY: definition.entryY, allowCreateFallback: false, relocateExisting: true }, this.world as any).catch(() => undefined);
   }
  }
  if (instance?.listPlayerIds?.().length > 0) {
   this.logger.warn(`副本终态清理暂缓，仍有玩家未撤离：runId=${run.runId}`);
   this.scheduleTerminalCleanup(run, 5_000);
   return;
  }
  await this.destroyRun(run);
 }

 private abortPending(runId: string, reason: string): void {
  const pending = this.pending.get(runId); if (!pending) return;
  clearTimeout(pending.timer); if (pending.countdownTimer) clearTimeout(pending.countdownTimer); if (pending.rejectionTimer) clearTimeout(pending.rejectionTimer); this.pending.delete(runId); pending.run.status = 'aborted'; pending.run.failureReason = reason;
  this.runPersistence.save(pending.run);
  this.presentationController.onAbort(pending.run);
  this.controllers.get(pending.definition.flowType)?.onAbort?.(pending.run, pending.definition, reason, this.buildFlowContext());
  for (const member of pending.run.members) this.emit(member.playerId, S2C.DungeonEntryResult, { ok: false, reason, run: pending.run });
 }

 private async destroyRun(run: DungeonRunState): Promise<void> {
  const terminalCleanupTimer = this.terminalCleanupTimers.get(run.runId);
  if (terminalCleanupTimer) clearTimeout(terminalCleanupTimer);
  this.terminalCleanupTimers.delete(run.runId);
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

 private applyDungeonEntryMetadata(instance: any, definition: DungeonDefinition): void {
  if (!instance?.meta || !definition) return;
  const entryX = Number(definition.entryX);
  const entryY = Number(definition.entryY);
  const exitRadius = Number(definition.entryExitRadius);
  instance.meta.dungeonEntryX = Number.isFinite(entryX) ? Math.trunc(entryX) : null;
  instance.meta.dungeonEntryY = Number.isFinite(entryY) ? Math.trunc(entryY) : null;
  instance.meta.dungeonEntryExitRadius = Number.isFinite(exitRadius) ? Math.max(1, exitRadius) : 1;
 }

 /** 用户可见的副本创建/激活前必须确认快照已落库；未接入持久化的本地 smoke 保持兼容。 */
 private async waitForRunPersistence(run: DungeonRunState): Promise<boolean> {
  if (typeof this.runPersistence.waitForSave !== 'function') return true;
  try {
   await this.runPersistence.waitForSave(run.runId);
   return true;
  } catch (error) {
   this.logger.error(`副本流程快照未能确认落库 ${run.runId}：${error instanceof Error ? error.message : String(error)}`);
   return false;
  }
 }

 /** 更新重启后遗留在临时副本实例中的玩家，避免 run 内存态丢失后无法撤离。 */
 private async recoverOrphanDungeonPlayer(playerId: string, instanceId?: string): Promise<boolean> {
  if (!instanceId) return false;
  const instance = this.world.getInstanceRuntime(instanceId) as any;
  if (!isDungeonInstanceCandidate(instanceId, instance)) return false;
  const player = this.players.getPlayer(playerId) as any;
  const location = this.world.getPlayerLocation(playerId);
  const isAttached = instance?.getPlayer?.(playerId)
   || location?.instanceId === instanceId
   || player?.instanceId === instanceId;
  if (!isAttached) return false;
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

 private emitPreparation(pending: PendingEntry, phase: 'preparing' | 'countdown', enterAt?: number, rejectAt?: number): void {
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
    ...(pending.rejectedMemberIds.has(member.playerId) ? { rejected: true } : {}),
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
    ...(rejectAt ? { rejectAt } : {}),
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
 const allowedStatuses = new Set(['created', 'activating', 'active', 'completing', 'completed', 'failed']);
 if (!allowedStatuses.has(payload.status)) return null;
 const members = payload.members.filter((member: any) => typeof member?.playerId === 'string' && member.playerId.trim()).map((member: any) => ({
  playerId: member.playerId.trim(),
  ...(member.playerNo === undefined ? {} : { playerNo: Number(member.playerNo) }),
  ...(member.name ? { name: String(member.name) } : {}),
  joinedAt: Number.isFinite(Number(member.joinedAt)) ? Number(member.joinedAt) : Date.now(),
 }));
 if (members.length === 0) return null;
 const memberIds = new Set(members.map((member) => member.playerId));
 const defeatedMemberIds: string[] = Array.isArray(payload.defeatedMemberIds)
  ? Array.from(new Set<string>(payload.defeatedMemberIds
   .filter((playerId: unknown): playerId is string => typeof playerId === 'string' && memberIds.has(playerId.trim()))
   .map((playerId: string) => playerId.trim())))
  : [];
 const normalized: DungeonRunState = {
  ...payload,
  runId: payload.runId.trim(),
  dungeonId: payload.dungeonId.trim(),
  mapInstanceId: payload.mapInstanceId.trim(),
  members,
 } as DungeonRunState;
 if (defeatedMemberIds.length > 0) normalized.defeatedMemberIds = defeatedMemberIds;
 else delete normalized.defeatedMemberIds;
 return normalized;
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

function normalizeOptionalDungeonString(value: unknown): string {
 return typeof value === 'string' ? value.trim() : '';
}

function normalizeDungeonRunId(value: unknown): string {
 const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
 return raw.startsWith('dungeon:') ? raw.slice('dungeon:'.length).trim() : raw;
}

function resolveDungeonRoomMonsterIds(room: any): string[] {
 if (!room || typeof room !== 'object') return [];
 return [
  ...(room.bossId ? [normalizeOptionalDungeonString(room.bossId)] : []),
  ...(Array.isArray(room.spawnGroupIds) ? room.spawnGroupIds.map(normalizeOptionalDungeonString) : []),
  ...(Array.isArray(room.eliteGroupIds) ? room.eliteGroupIds.map(normalizeOptionalDungeonString) : []),
 ].filter(Boolean);
}

function countStringValues(values: readonly string[]): Map<string, number> {
 const counts = new Map<string, number>();
 for (const value of values) {
  const normalized = normalizeOptionalDungeonString(value);
  if (!normalized) continue;
  counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
 }
 return counts;
}

function hasMonsterIdMultiplicity(monsters: readonly any[], expectedMonsterIds: readonly string[]): boolean {
 const actualCounts = countStringValues(monsters.map((monster) => normalizeOptionalDungeonString(monster?.monsterId)));
 for (const [monsterId, expectedCount] of countStringValues(expectedMonsterIds)) {
  if ((actualCounts.get(monsterId) ?? 0) < expectedCount) return false;
 }
 return true;
}

function firstFiniteDungeonCoordinate(...values: unknown[]): number {
 for (const value of values) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) continue;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.trunc(numeric);
 }
 return Number.NaN;
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
  } catch { }
 }
 if (peakBaselinesMap.size === 0) {
  try {
   const peakPath = resolveProjectPath('packages', 'server', 'data', 'content', 'realm-attr-peak-baselines.json');
   if (fs.existsSync(peakPath)) {
    const parsed = JSON.parse(fs.readFileSync(peakPath, 'utf8'));
    for (const entry of parsed.levels || []) peakBaselinesMap.set(entry.realmLv, entry.singleAttr);
   }
  } catch { }
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
 replacementSkillIds: readonly string[] = [],
 dungeonDropTable?: readonly any[],
 dungeonLootMultipliers?: { currencyCountMultiplier: number; dropRateMultiplier: number },
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
 const scaled = {
  ...spawn,
  baseAttrs: spawn.baseAttrs && typeof spawn.baseAttrs === 'object' ? { ...spawn.baseAttrs } : spawn.baseAttrs,
  baseNumericStats: cloneNumbers(spawn.baseNumericStats, finalAllMult),
 };
 if (scaled.baseNumericStats && typeof scaled.baseNumericStats === 'object') {
  for (const key of ['maxHp', 'hp'] as const) {
   if (typeof scaled.baseNumericStats[key] === 'number') {
    scaled.baseNumericStats[key] = Math.max(1, Math.round(Number(spawn.baseNumericStats[key]) * finalHpMult));
   }
  }
  if (isPresent) {
   for (const key of ['dodge', 'crit', 'antiCrit', 'resolvePower'] as const) {
    if (typeof scaled.baseNumericStats[key] === 'number') {
     scaled.baseNumericStats[key] = Math.max(0, Math.round(Number(scaled.baseNumericStats[key]) * 0.5));
    }
   }
  }
 }
 const normalizedReplacementSkillIds = replacementSkillIds
  .filter((id) => typeof id === 'string' && id.trim())
  .map((id) => id.trim());
 scaled.skills = normalizedReplacementSkillIds.length > 0
  ? [...new Set(normalizedReplacementSkillIds)]
  : [...new Set([...(Array.isArray(spawn.skills) ? spawn.skills : []), ...additionalSkillIds.filter((id) => typeof id === 'string' && id.trim())])];
 if (Array.isArray(dungeonDropTable)) {
  scaled.dungeonDropTable = dungeonDropTable;
  scaled.dungeonDropRateMultiplier = Math.max(0, Number(dungeonLootMultipliers?.dropRateMultiplier) || 1);
  scaled.dungeonCurrencyCountMultiplier = Math.max(0, Number(dungeonLootMultipliers?.currencyCountMultiplier) || 1);
 }
 scaled.maxHp = Math.max(1, Math.round(Number(spawn.maxHp) * finalHpMult));
 scaled.hp = scaled.maxHp;
 return scaled;
}

function chebyshevDistance(fromX: unknown, fromY: unknown, toX: unknown, toY: unknown): number {
 return Math.max(
  Math.abs(Math.trunc(Number(fromX) || 0) - Math.trunc(Number(toX) || 0)),
  Math.abs(Math.trunc(Number(fromY) || 0) - Math.trunc(Number(toY) || 0)),
 );
}
