/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 玩家运行时核心服务。
 * 管理在线玩家的全部运行态：登录/登出、背包/装备/钱包、buff、
 * 战斗配置、移动、修炼、技能冷却、通知队列和持久化脏域追踪。
 */
import { Inject, BadRequestException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ARTIFACT_SLOTS, ARTIFACT_UNLOCK_REALM_LV, ATTR_KEYS, ATTR_TO_NUMERIC_WEIGHTS, ATTR_TO_PERCENT_NUMERIC_WEIGHTS, AUTO_IDLE_CULTIVATION_DELAY_TICKS, BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER, DEFAULT_BASE_ATTRS, DEFAULT_BONE_AGE_YEARS, DEFAULT_COMBAT_ATTACK_INTENSITY, DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS, DEFAULT_INVENTORY_CAPACITY, DEFAULT_PLAYER_REALM_STAGE, DUNGEON_MAX_STAMINA, DUNGEON_PRESSURE_BUFF_ID, Direction, EQUIP_SLOTS, PLAYER_REALM_CONFIG, PLAYER_REALM_ORDER, RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH, TechniqueRealm, addItemStackMergeCount, calculateTechniqueComprehensionProgressGain, calculateTechniqueComprehensionRequiredProgress, canMergeItemStack, cloneCraftEffectStats, coalesceItemStackList, compileValueStatsToActualStats, computeCraftSkillExpGain, createItemStackSignature, enforceSkillEnabledLimit, findMergeableItemStackIndex, getBodyTrainingExpToNext, getTechniqueMaxLevel, isCreatedTechniqueId, isTechniqueAggregationId, isTechniqueFullyMastered, mergeItemStackInto, normalizeBodyTrainingState, normalizeCombatAttackIntensity, normalizeHorizontalFacing, normalizeTechniqueStrengthPercent, resolveArtifactMaxQi, resolveCooldownTicks, resolvePlayerFacingContentName, resolvePlayerSkillSlotLimit, resolveRecoveredStamina, resolveSkillRequiresTarget, resolveTechniqueStandardMaxHpRecoveryAmount, resolveTechniqueStandardMaxQiRecoveryAmount } from '@mud/shared';
import type { TechniqueTransmissionStatusView } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
import { PVP_SHA_BACKLASH_BUFF_ID, PVP_SHA_BACKLASH_DECAY_TICKS, PVP_SHA_BACKLASH_PERCENT_PER_STACK, PVP_SHA_BACKLASH_SOURCE_ID, PVP_SHA_BACKLASH_STACK_DIVISOR, PVP_SHA_INFUSION_ATTACK_CAP_PERCENT, PVP_SHA_INFUSION_BUFF_ID, PVP_SHA_INFUSION_DECAY_TICKS, PVP_SHA_INFUSION_SOURCE_ID, PVP_SOUL_INJURY_BUFF_ID, PVP_SOUL_INJURY_DURATION_TICKS, PVP_SOUL_INJURY_MAX_STACKS, PVP_SOUL_INJURY_SOURCE_ID } from '../../constants/gameplay/pvp';
import { HEAVENLY_DAO_SUPPRESSION_BUFF_ID, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS, HEAVENLY_DAO_SUPPRESSION_MAX_STACKS, HEAVENLY_DAO_SUPPRESSION_SOURCE_ID } from '../../constants/gameplay/virtual-world';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import {
 PlayerDomainPersistenceService,
 nextPlayerPersistenceVersion,
} from '../../persistence/player-domain-persistence.service';
import { FlushLedgerService } from '../../persistence/flush-ledger.service';
import { isFlushTaskConsumerMode } from '../../persistence/flush-task-runtime-mode';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import { MAX_NOTICES_PER_PLAYER, NOTICE_KIND_PRIORITY, findLowestPriorityNoticeIndex } from '../event-bus/runtime-event-bus.types';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerAttributesService } from './player-attributes.service';
import { PlayerProgressionService } from './player-progression.service';
import { TechniqueAggregationService } from '../technique-generation/technique-aggregation.service';
import {
 PLAYER_COMPREHENSION_PROJECTION_CACHE_HIT,
 markPlayerComprehensionSpeedRateProjectionDirty,
 refreshPlayerComprehensionSpeedRateProjectionIfDirty,
} from './player-comprehension-speed.helpers';
import { applyPlayerCraftExpRate, resolvePlayerCraftRealmLevel } from '../craft/craft-effect-runtime.helpers';
import { collectEnabledCultivationTileQiPassives } from './player-skill-passive.helpers';
import { resolveCultivationPassiveTileQiAmount } from './player-cultivation-passive.helpers';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules, normalizePersistedAutoUsePills, normalizePersistedCombatTargetingRules } from './player-combat-config.helpers';
import { projectHeavenGateState, projectRealmState } from './player-realm-projection.helpers';
import { createPlayerRuntimeStateStore } from './player-runtime.state';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from './runtime-buff-instance';
import { compareInventoryItems } from './inventory-sort.helpers';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel, resolveInitialCraftSkillExpToNext } from '../craft/craft-skill-exp.helpers';
import { TechniqueActivityPipelineService } from '../craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../craft/pipeline/strategies/transmission.strategy';
import {
 advancePlayerArtifactQiTick,
 resolveArtifactSustainCostWithOvercharge,
 resolvePlayerArtifactOverchargeStacks,
} from './player-artifact-runtime.helpers';
import { refreshPlayerMovementCapabilities } from './player-movement-capability.helpers';
import { PlayerStatisticLedgerIoQueue } from './player-statistic-ledger-io-queue';
import {
 OFFLINE_GAIN_REPORT_MIN_DURATION_MS,
 resolveOfflineGainReportDurationMs,
} from './offline-gain-duration.helpers';
import { triggerLowHpHeavenlyPassives } from '../combat/reactions/player/low-hp.reaction';
import { CombatReactionRegistry } from '../combat/combat-reaction-registry';
import { registerPlayerCombatReactions } from '../combat/reactions/player/register-player-reactions';
import {
 DEFAULT_PLAYER_STARTER_MAP_ID, MAX_PENDING_LOGBOOK_MESSAGES, advancePlayerChronology, applyCultivationTileQiPassives,
 assertConsumableItemCooldownReady, buildActionCooldownProjectionSchedule, buildActionEntries, buildDefaultArtifactState,
 buildEmptyPlayerStatisticTotals, buildEquipmentSnapshot, buildHeavenlyDaoSuppressionBuffState, buildOfflineGainDeltaParts,
 buildOfflineGainInventoryOnlyMutation, buildOfflineGainProgressionAndInventoryMutation, buildOfflineGainProgressionAndProfessionMutation, buildOfflineGainProgressionOnlyMutation,
 buildOfflineGainReportFromSession, buildOfflineGainSessionId, buildOfflineGainSnapshot, buildPlayerStatisticLocalDayKey,
 buildPlayerStatisticRecordFromParts, buildPlayerStatisticRelevantDayKeys, buildPlayerStatisticTotalsPatch, buildPlayerStatisticTotalsView,
 buildPublicPlayerInstanceId, buildPvPShaBacklashBuffState, buildPvPShaInfusionBuffState, buildPvPSoulInjuryBuffState,
 buildRuntimeOwnerId, buildRuntimePlayerPersistenceSnapshot, clamp, clearPendingTechniqueComprehensionEmptyOverwriteAuthorizationIfPersisted,
 clearPlayerDirtyDomains, cloneItemWithCountPreservingTemplate, clonePendingLogbookMessage, clonePendingTechniqueComprehensions,
 cloneQuestRuntimeEntries, cloneRuntimeBonusesForSnapshot, cloneRuntimePlayerState, coalesceInventoryItems,
 consumeInventoryItemAt, consumeInventoryItemCount, createCraftSkillState, createDefaultRealmState,
 createEmptyOfflineGainReportParts, createPlayerDirtyDomainSet, createTransmissionCompatPipeline, decodePersistedRawBaseAttrs,
 doesBuffAffectAttributeProjection, doesBuffAffectVitalCapacityProjection, doesTemporaryBuffAffectVitalCapacity, enforcePlayerSkillEnabledLimit,
 ensurePendingTechniqueComprehensionEmptyOverwriteTechIds, ensurePlayerPersistenceDomainHoldCountMap, ensurePlayerPersistencePersistedMap, ensurePlayerPersistenceStagingMaps,
 ensureVitalBaselineBonus, entityHasActiveBuff, findInventoryItemIndexByInstanceId, getEntityBuffStacks,
 getPlayerPersistenceDomainRevision, getPlayerRealmLevel, getPlayerStagedDomainRevision, hasDetachedRuntimeActivity,
 hasHeldPlayerPersistenceDomains, hasNormalizedPlayerStatisticPeriodTotal, hasOfflineGainReportParts, hasOfflineGainReportPartsFast,
 hasPendingDetachedAutomation, hasPlayerStatisticTotalsPatch, hasPlayerStatisticTotalsView, hasTechniqueTemplateProjectionChanged,
 isConsumableBuffSource, isDetachedPlayerRuntime, isImmediateDomainPersistenceSuppressed, isNonConsumableTemporaryBuffReapplyNoop,
 isOfflineHangingRuntimeExpired, isOfflineHangingRuntimeReadyForReap, isPlayerInTransmissionRange, isPlayerRuntimeDirty,
 isPlayerRuntimeOnline, isProgressionAndInventoryOnlyStatisticResult, isProgressionOnlyStatisticResult, isRuntimeBuffActive,
 isRuntimeTransferInProgress, isSameActionList, isSameArtifactSlotStateForRuntime, isSameAutoBattleSkillList,
 isSameBuffIdSequence, isSamePendingLogbookMessages, isSameTemporaryBuffAttributePayload, isSameTemporaryBuffPrototypePayload,
 isSameTemporaryBuffReferencePayload, markConsumableItemCooldown, markPlayerDirtyDomains, mergeNormalizedPlayerStatisticDayTotalMap,
 mergeOfflineGainProgressionAndProfessionReportPartsBySum, mergeOfflineGainProgressionReportPartsBySum, mergeOfflineGainReportPartsBySum, mergeOfflineGainSessionRecords,
 mergePendingOfflineGainReport, mergePendingOfflineGainReportList, mergePlayerStatisticDayTotalMap, migrateLegacyCraftQueuedJobsToTechniqueActivityQueue,
 normalizeAlchemyJob, normalizeAlchemyPresets, normalizeArtifactStateWithTemplates, normalizeBoneAgeBaseYears,
 normalizeBuildingJob, normalizeCounter, normalizeCraftSkillState, normalizeCultivationAuraMultiplier,
 normalizeEnhancementJob, normalizeEnhancementRecords, normalizeEquipmentSlotsWithTemplates, normalizeFormationJob,
 normalizeGatherJob, normalizeHeavenGateRoots, normalizeHeavenGateState, normalizeInventoryItemInstanceId,
 normalizeLegacyTransmissionJobFromPending, normalizeLifeElapsedTicks, normalizeLifespanYears, normalizeMiningJob,
 normalizeOfflineGainCount, normalizeOfflineGainReportParts, normalizeOfflineGainSnapshot, normalizeOfflineGainString,
 normalizePendingLogbookMessage, normalizePendingLogbookMessages, normalizePersistedAutoBattleSkills, normalizePersistedAutoBattleTargetingMode,
 normalizePlayerAutoBattleSkills, normalizePlayerDomainRevisionEntries, normalizePlayerPersistenceDomainNames, normalizePlayerPlacementInstanceId,
 normalizePlayerStagingGenerationId, normalizePlayerStatisticPeriodTotal, normalizePlayerWorldPreferenceLinePreset, normalizeRealmState,
 normalizeTechniqueActivityQueue, normalizeTechniqueTransmissionInterruptReason, normalizeTransmissionJob, normalizeWalletType,
 readInventoryItemCount, readPlayerPersistenceDomainHoldCountMap, readUnheldPlayerDirtyDomains, recordPlayerTickCount,
 recordPlayerTickPerf, recoverPlayerVitals, repairDuplicateInventoryItemInstanceIds, repairEnhancementRecoveryDisplayNames,
 repairInvalidEnhancementRecoveryState, resolveCultivationAuraMultiplier, resolvePendingSelfComprehensionAllowed, resolvePlayerRuntimeTick,
 resolveRespawnPlacement, resolveSpiritualRootSeedTier, resolveTechniqueBookMaxLevel, restoreConsumableCooldownStateFromPersistentBuffs,
 shouldBlockOfflineGainSessionRecord, shouldKeepBuffOnRespawn, shouldKeepBuffOnReturnToSpawn, shouldRefreshSkillCooldownActionState,
 shouldResumeIdleCultivation, subtractPlayerStatisticDayTotalMap, summarizePlayerStatisticPeriodTotal, syncTechniqueAutoBattleSkillCatalog,
 syncTechniqueSkillAvailability, syncWalletCacheFromInventory, takeSingleInventoryItemForEquipment, tickTemporaryBuffs,
 toConsumableTemporaryBuff, toTechniqueUpdateEntry,
} from './player-runtime.helpers';
export { repairEnhancementRecoveryDisplayNames } from './player-runtime.helpers';
import {
  applyTemporaryBuffImpl,
  cleanseTemporaryBuffsImpl,
  replaceTemporaryBuffImpl,
  applyConfiguredBuffImpl,
  applyPvPSoulInjuryImpl,
  addPvPShaInfusionStackImpl,
  addPvPShaBacklashStacksImpl,
  addHeavenlyDaoSuppressionStacksImpl,
  getBuffStacksImpl,
  hasActiveBuffImpl,
  applyShaInfusionDeathPenaltyImpl,
  applyOrRefreshPvpBuffImpl,
  consumePvpBuffStacksImpl,
} from './player-runtime.buff';
import {
  buildTechniqueTransmissionStatusesImpl,
  learnTechniqueByIdImpl,
  learnPublishedAggregateTechniqueByIdImpl,
  refreshOnlineTechniqueTemplatesImpl,
  addPendingTechniqueComprehensionByIdImpl,
  resolveTechniqueLearningConflictImpl,
  applyTechniqueAggregationCompletionImpl,
  authorizePendingTechniqueComprehensionRemovalsImpl,
  resolveLatestTechniqueIdImpl,
  startTechniqueTransmissionImpl,
  cancelTechniqueTransmissionImpl,
  normalizePendingTechniqueComprehensionsForRuntimeImpl,
  refreshPendingTechniqueComprehensionRequirementImpl,
  interruptTechniqueTransmissionForPlayerImpl,
  getTechniqueNameImpl,
  cultivateTechniqueImpl,
  forgetTechniqueImpl,
  discardPendingTechniqueComprehensionImpl,
  advanceTechniqueTransmissionForPlayerImpl,
} from './player-runtime.technique';
import {
  consumeItemByItemIdImpl,
  replaceInventoryItemsImpl,
  grantItemImpl,
  getInventoryCountByItemIdImpl,
  canReceiveInventoryItemImpl,
  tryReceiveInventoryItemImpl,
  peekInventoryItemImpl,
  peekInventoryItemByInstanceIdImpl,
  peekEquippedItemImpl,
  ensureArtifactUnlockStateImpl,
  splitInventoryItemImpl,
  splitInventoryItemByInstanceIdImpl,
  receiveInventoryItemImpl,
  applyNormalizedInventoryReceiptImpl,
  useItemImpl,
  useItemByInstanceIdImpl,
  consumeInventoryItemImpl,
  consumeInventoryItemByInstanceIdImpl,
  consumeInventoryItemByItemIdImpl,
  destroyInventoryItemImpl,
  destroyInventoryItemByInstanceIdImpl,
  sortInventoryImpl,
  equipItemImpl,
  equipItemByInstanceIdImpl,
  unequipItemImpl,
  setArtifactSlotEnabledImpl,
  equipArtifactItemImpl,
  unequipArtifactItemImpl,
  applyConsumableItemImpl,
} from './player-runtime.inventory';

const MAX_ITEM_COUNT = 2_147_483_647;

/** 玩家跨节点转移超时时间，超时后自动回滚 transfer 态。 */
const PLAYER_TRANSFER_TIMEOUT_MS = 120_000;
/** 被玩家攻击后保留反击仇敌的最长时间，按 1Hz tick 计算为 30 分钟。 */
const RETALIATE_PLAYER_TARGET_TIMEOUT_TICKS = 30 * 60;
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
const WANGSHENG_PILL_ITEM_ID = 'pill.wangsheng';
const PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN = 'presence';
@Injectable()
export class PlayerRuntimeService {
 readonly logger = new Logger(PlayerRuntimeService.name);
 /** 内容仓库，提供起始背包、默认装备和物品模板。 */
 contentTemplateRepository;
 /** 地图仓库，用于出生点、地图索引和传送相关校验。 */
 mapTemplateRepository;
 /** 属性结算器，负责把装备与 buff 折算成最终面板。 */
 playerAttributesService;
 /** 成长结算器，负责境界、经验和修炼态推进。 */
 playerProgressionService;
 /** 玩家分域持久化服务，承接低频改动即写。 */
 playerDomainPersistenceService;
 /** 运行时事件总线，统一收编通知、战斗表现等 tick 内事件。 */
 runtimeEventBusService;
 /** durable 玩家 payload 账本，用于阻止隔离资产恢复为可写运行态。 */
 flushLedgerService;
 /** 功法统合规则服务，仅在低频学习/完成路径读取聚合缓存。 */
 techniqueAggregationService;
 /** 玩家在线态 store，集中托管运行时拥有的热状态。 */
 runtimeState = createPlayerRuntimeStateStore<any>();
 /** 在线玩家运行时实例，按 playerId 直接索引。 */
 players = this.runtimeState.players;
 /**
  * 跨领域玩家资产写队列。市场、邮件、地面拾取等异步强事务在拿数据库锁前，
  * 先通过这里按 playerId 排序串行，避免各自的局部队列拿旧快照整体覆盖其他领域刚提交的资产。
  */
 private readonly assetMutationQueueByPlayerId = new Map<string, Promise<void>>();
 /** 同一异步调用链内允许重入已持有的玩家资产锁，例如事务前主动 flush 当前玩家。 */
 private readonly assetMutationContext = new AsyncLocalStorage<{
  playerIds: ReadonlySet<string>;
  active: boolean;
  deferredAssetStatistics: Map<string, {
   player: any;
   beforeSnapshot: any;
   endedAt: number;
  }> | null;
 }>();
 /** 同进程内合并同一玩家的数据库 ownership claim，避免并发 bootstrap 重复递增 epoch。 */
 private readonly runtimeOwnershipClaimPromiseByPlayerId = new Map<string, Promise<{
  runtimeOwnerId: string | null;
  sessionEpoch: number | null;
 } | null>>();
 /** 数据库禁用时的离线收益基线缓存。 */
 offlineGainSessionsByPlayerId = new Map();
 /** 同一玩家的离线收益结算必须串行，避免重连与离线战败同时生成重复报告。 */
 private readonly offlineGainFinalizationPromiseByPlayerId = new Map<string, Promise<any>>();
 /** 玩家统计持续快照，用于把 tick 外即时资产变化纳入下一次低频统计。 */
 playerStatisticSnapshotsByPlayerId = new Map();
 /** 当前进程尚未合入持久缓存的日总账增量。 */
 playerStatisticDayTotalsByPlayerId = new Map();
 /** 已从数据库回读的日总账缓存。 */
 playerStatisticPersistedDayTotalsByPlayerId = new Map();
 /** 待写入数据库的日总账增量。 */
 pendingPlayerStatisticDayTotalsByPlayerId = new Map();
 /** 正在调度异步总账落盘的玩家。 */
 scheduledPlayerStatisticLedgerFlushes = new Set();
 /** 统计总账落盘重试计数，防止无限重试。 */
 private playerStatisticLedgerRetryCount = new Map<string, number>();
 /** 同一玩家的总账回读与增量落盘必须串行，避免旧 SELECT 覆盖刚完成的 flush。 */
 private readonly playerStatisticLedgerIoQueue = new PlayerStatisticLedgerIoQueue();
 /** 待单播给客户端刷新显示的总账玩家。 */
 pendingPlayerStatisticTotalsEmitPlayerIds = new Set();
 /** 最近一次已发给客户端的统计总账，用于构建低频 totalsPatch。 */
 playerStatisticLastEmittedTotalsByPlayerId = new Map();
 /** 当前玩家 tick 的统计上下文，tick 内资产变更只标记一次，tick 末统一 diff。 */
 playerStatisticTickContextsByPlayerId = new Map();
 /** action 冷却投影只在到期边界或冷却速度输入变化时需要重新物化。 */
 private readonly actionCooldownProjectionScheduleByPlayer = new WeakMap<object, {
  nextReadyTick: number;
  cooldownSpeed: number;
 }>();
 /** 数据库禁用时等待客户端归档的离线收益报告。 */
 pendingOfflineGainReportsByPlayerId = new Map();
 /** 当前连接期已经下发过的待确认离线收益报告，避免每个同步 tick 重复推送。 */
 pendingOfflineGainReportEmittedIdsByPlayerId = new Map();
 /** 当前阻塞确认层实际下发的报告 ID；只有命中该集合的 ACK 才能恢复在线 session。 */
 blockingOfflineGainPreviewIdsByPlayerId = new Map();
 /** 仅在测试 harness fallback 路径首次触发时打印一次提示，避免刷屏。 */
 noticeFallbackWarned = false;
 readonly damageReactionRegistry = new CombatReactionRegistry();
 /** 注入基础仓库与成长/属性结算器，供玩家在线态统一管理。 */
 constructor(
  @Inject(ContentTemplateRepository) contentTemplateRepository: any,
  @Inject(MapTemplateRepository) mapTemplateRepository: any,
  @Inject(PlayerAttributesService) playerAttributesService: any,
  @Inject(PlayerProgressionService) playerProgressionService: any,
  @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any = undefined,
  @Inject(RuntimeEventBusService) runtimeEventBusService: any = undefined,
  @Optional() @Inject(FlushLedgerService) flushLedgerService: any = undefined,
  @Optional() @Inject(TechniqueAggregationService) techniqueAggregationService: TechniqueAggregationService | null = null,
 ) {
  registerPlayerCombatReactions(this.damageReactionRegistry);
  this.contentTemplateRepository = contentTemplateRepository;
  this.mapTemplateRepository = mapTemplateRepository;
  this.playerAttributesService = playerAttributesService;
  this.playerProgressionService = playerProgressionService;
  this.playerDomainPersistenceService = playerDomainPersistenceService;
  this.runtimeEventBusService = runtimeEventBusService;
  this.flushLedgerService = flushLedgerService;
  this.techniqueAggregationService = techniqueAggregationService;
 }
 /** 读取或创建玩家在线态快照，首次连接时从持久化状态回填。 */
 async loadOrCreatePlayer(playerId, sessionId, loader, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  await this.assertPlayerAssetFlushNotQuarantined(playerId);
  const existing = this.players.get(playerId);
  if (existing) {
   if (options?.deferOfflineGainSettlement === true && await this.shouldBlockOfflineGainSession(playerId)) {
    existing.sessionId = null;
    if (!Number.isFinite(existing.offlineSinceAt)) {
     const session = this.offlineGainSessionsByPlayerId.get(playerId);
     existing.offlineSinceAt = Number.isFinite(Number(session?.startedAt))
      ? Math.max(0, Math.trunc(Number(session.startedAt)))
      : Date.now();
    }
    await this.ensureRuntimeOwnershipClaimed(playerId);
    return existing;
   }
   await this.finalizeOfflineGainSessionForPlayer(existing, Date.now());
   if (options?.forceRebind === true) {
    this.bindRuntimeSession(existing, sessionId);
   } else {
    this.refreshRuntimeSession(existing, sessionId);
   }
   return existing;
  }

  let snapshot = null;
  const buildStarterSnapshot = typeof options?.buildStarterSnapshot === 'function'
   ? options.buildStarterSnapshot
   : null;
  const projectionEnabled = typeof this.playerDomainPersistenceService?.isEnabled === 'function'
   && this.playerDomainPersistenceService.isEnabled();
  if (projectionEnabled) {
   if (!buildStarterSnapshot) {
    throw new ServiceUnavailableException(`player_domain_snapshot_builder_required:${playerId}`);
   }
   snapshot = await this.playerDomainPersistenceService.loadProjectedSnapshot(playerId, buildStarterSnapshot);
   if (typeof options?.onSnapshotLoaded === 'function') {
    options.onSnapshotLoaded(snapshot);
   }
   if (!snapshot) {
    throw new ServiceUnavailableException(`player_domain_snapshot_required:${playerId}`);
   }
  }
  else {
   snapshot = await loader();
   if (typeof options?.onSnapshotLoaded === 'function') {
    options.onSnapshotLoaded(snapshot);
   }
  }
  const lateExisting = this.players.get(playerId);
  if (lateExisting) {
   if (options?.deferOfflineGainSettlement === true && await this.shouldBlockOfflineGainSession(playerId)) {
    lateExisting.sessionId = null;
    if (!Number.isFinite(lateExisting.offlineSinceAt)) {
     const session = this.offlineGainSessionsByPlayerId.get(playerId);
     lateExisting.offlineSinceAt = Number.isFinite(Number(session?.startedAt))
      ? Math.max(0, Math.trunc(Number(session.startedAt)))
      : Date.now();
    }
    // 兼容旧持久化入口缺少原子 claim 时仍先对齐 DB floor；正式链路随后会原子认领
    // 新 owner/epoch，避免离线收益阻塞期间产生无 ownership 的运行态写入。
    const blockedEpochFloor = Number.isFinite(options?.sessionEpochFloor)
     ? Math.max(0, Math.trunc(Number(options.sessionEpochFloor)))
     : 0;
    if (blockedEpochFloor > 0) {
     lateExisting.sessionEpoch = Math.max(
      Math.max(0, Math.trunc(Number(lateExisting.sessionEpoch ?? 0))),
      blockedEpochFloor,
     );
    }
    await this.ensureRuntimeOwnershipClaimed(playerId);
    return lateExisting;
   }
   await this.finalizeOfflineGainSessionForPlayer(lateExisting, Date.now());
   // 与 non-existing 路径（line ~247）保持一致：rebind 前先对齐 DB 持久化 epoch，
   // 防止玩家已在内存但 sessionEpoch 低于 DB 值时断线 flush 触发 stale_session 围栏错误。
   const lateExistingEpochFloor = Number.isFinite(options?.sessionEpochFloor)
    ? Math.max(0, Math.trunc(Number(options.sessionEpochFloor)))
    : 0;
   if (lateExistingEpochFloor > 0) {
    lateExisting.sessionEpoch = Math.max(
     Math.max(0, Math.trunc(Number(lateExisting.sessionEpoch ?? 0))),
     lateExistingEpochFloor,
    );
   }
   if (options?.forceRebind === true) {
    this.bindRuntimeSession(lateExisting, sessionId);
   } else {
    this.refreshRuntimeSession(lateExisting, sessionId);
   }
   return lateExisting;
  }

  // 防御：如果 snapshot 为 null 但数据库中已有该玩家的 watermark，
  // 说明是老玩家但数据加载失败（如数据库连接池未就绪），
  // 宁可拒绝登录也不能用空白角色覆盖已有存档。
  if (!snapshot && typeof this.playerDomainPersistenceService?.hasRecoveryWatermark === 'function') {
   let hasWatermark = false;
   try {
    hasWatermark = await this.playerDomainPersistenceService.hasRecoveryWatermark(playerId);
   } catch (_watermarkCheckError) {
    // 连接池完全不可用时查询也会失败，此时同样拒绝创建空白角色（fail-safe）
    throw new ServiceUnavailableException(
     `player_fresh_create_blocked_watermark_check_failed:${playerId}`,
    );
   }
   if (hasWatermark) {
    throw new ServiceUnavailableException(
     `player_fresh_create_blocked_existing_watermark:${playerId}`,
    );
   }
  }

  const deferOfflineGainSettlement = options?.deferOfflineGainSettlement === true;
  const player = snapshot
   ? this.hydrateFromSnapshot(playerId, deferOfflineGainSettlement ? null : sessionId, snapshot)
   : this.createFreshPlayer(playerId, sessionId);
  // 标记玩家数据来源：从持久化恢复 vs 凭空创建，供 flush 防御使用
  (player as any)._hydratedFromPersistence = Boolean(snapshot);
  if (deferOfflineGainSettlement && await this.shouldBlockOfflineGainSession(playerId)) {
   player.sessionId = null;
   const session = this.offlineGainSessionsByPlayerId.get(playerId);
   if (!Number.isFinite(player.offlineSinceAt)) {
    player.offlineSinceAt = Number.isFinite(Number(session?.startedAt))
     ? Math.max(0, Math.trunc(Number(session.startedAt)))
     : Date.now();
   }
   // 兼容旧持久化入口缺少原子 claim 时仍保留 DB epoch 下界。
   const pathCEpochFloor = Number.isFinite(options?.sessionEpochFloor)
    ? Math.max(0, Math.trunc(Number(options.sessionEpochFloor)))
    : 0;
   if (pathCEpochFloor > 0) {
    player.sessionEpoch = Math.max(
     Math.max(0, Math.trunc(Number(player.sessionEpoch ?? 0))),
     pathCEpochFloor,
    );
   }
   this.players.set(playerId, player);
   await this.ensureRuntimeOwnershipClaimed(playerId);
   return player;
  }
  await this.finalizeOfflineGainSessionForPlayer(player, Date.now());
  const sessionEpochFloor = Number.isFinite(options?.sessionEpochFloor)
   ? Math.max(0, Math.trunc(Number(options.sessionEpochFloor)))
   : 0;
  if (sessionEpochFloor > 0) {
   player.sessionEpoch = Math.max(
    Math.max(0, Math.trunc(Number(player.sessionEpoch ?? 0))),
    sessionEpochFloor,
   );
  }
  this.bindRuntimeSession(player, sessionId);
  this.players.set(playerId, player);
  return player;
 }
 /** 确保玩家在内存里存在，常用于 GM、调试或重连补建状态。 */
 ensurePlayer(playerId, sessionId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const existing = this.players.get(playerId);
  if (existing) {
   this.refreshRuntimeSession(existing, sessionId);
   return existing;
  }

  const player = this.createFreshPlayer(playerId, sessionId);
  this.bindRuntimeSession(player, sessionId);
  this.players.set(playerId, player);
  return player;
 }
 /**
  * 恢复离线挂机玩家到内存（服务器重启后调用）。
  * 不触发 finalizeOfflineGainSession，因为离线挂机仍在继续。
  */
 async restoreOfflineHangingPlayer(playerId, persistenceService) {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  if (!normalizedPlayerId) {
   return null;
  }
  await this.assertPlayerAssetFlushNotQuarantined(normalizedPlayerId);
  if (this.players.has(normalizedPlayerId)) {
   return this.players.get(normalizedPlayerId);
  }
  if (!persistenceService?.isEnabled?.()) {
   return null;
  }
  const buildStarterSnapshot = (pid) => this.buildStarterPersistenceSnapshot?.(pid) ?? null;
  const snapshot = await persistenceService.loadProjectedSnapshot(normalizedPlayerId, buildStarterSnapshot);
  if (!snapshot) {
   return null;
  }
  const player = this.hydrateFromSnapshot(normalizedPlayerId, null, snapshot);
  (player as any)._hydratedFromPersistence = true;
  player.sessionId = null;
  player.runtimeOwnerId = null;
  // 从 DB presence 读取真实 session_epoch 与离线起点作为恢复上下文，但不沿用旧进程 owner。
  // 启动编排必须在实例 lease/attach gate 通过后调用 ensureRuntimeOwnershipClaimed，
  // 避免多个节点在批量扫描阶段互相抢占同一玩家。
  let restoredSessionEpoch = 0;
  let restoredOfflineSinceAt = null;
  if (typeof persistenceService?.loadPlayerPresence === 'function') {
   const persistedPresence = await persistenceService.loadPlayerPresence(normalizedPlayerId);
   const persistedEpoch = Number(persistedPresence?.sessionEpoch);
   if (Number.isFinite(persistedEpoch) && persistedEpoch > 0) {
    restoredSessionEpoch = Math.trunc(persistedEpoch);
   }
   const persistedOfflineSinceAt = Number(persistedPresence?.offlineSinceAt);
   if (Number.isFinite(persistedOfflineSinceAt) && persistedOfflineSinceAt > 0) {
    restoredOfflineSinceAt = Math.trunc(persistedOfflineSinceAt);
   }
  }
  player.sessionEpoch = restoredSessionEpoch;
  player.lastHeartbeatAt = null;
  (player as any).transferState = null;
  (player as any).transferTargetNodeId = null;
  (player as any).transferStartedAt = null;
  (player as any).transferDeadlineAt = null;
  (player as any).transferWriteBlocked = false;
  (player as any).transferBufferedNotices = [];
  // 从 DB 恢复离线收益会话（含已累积的 payload）
  const persistedSession = await persistenceService.loadPlayerOfflineGainSession(normalizedPlayerId);
  const persistedSessionStartedAt = Number(persistedSession?.startedAt);
  player.offlineSinceAt = restoredOfflineSinceAt
   ?? (Number.isFinite(persistedSessionStartedAt) && persistedSessionStartedAt > 0
    ? Math.trunc(persistedSessionStartedAt)
    : Date.now());
  const lateExisting = this.players.get(normalizedPlayerId);
  if (lateExisting) {
   return lateExisting;
  }
  // 最后一个 await 之后同步提交 player 与离线收益会话，避免覆盖并发登录刚建立的在线 runtime。
  this.players.set(normalizedPlayerId, player);
  if (persistedSession) {
   this.offlineGainSessionsByPlayerId.set(normalizedPlayerId, {
    sessionId: persistedSession.sessionId,
    startedAt: persistedSession.startedAt,
    baselinePayload: normalizeOfflineGainSnapshot(persistedSession.baselinePayload),
    accumulatedPayload: normalizeOfflineGainReportParts(persistedSession.accumulatedPayload),
    accumulatedDurationMs: persistedSession.accumulatedDurationMs,
   });
  }
  return player;
 }
 /** 创建新玩家的初始运行时状态，包含装备、动作、修炼与通知容器。 */
 createFreshPlayer(playerId, sessionId) {

  const starterInventory = this.contentTemplateRepository.createStarterInventory();
  const defaultRespawnTemplateId = this.mapTemplateRepository.has(DEFAULT_PLAYER_STARTER_MAP_ID)
   ? DEFAULT_PLAYER_STARTER_MAP_ID
   : (this.mapTemplateRepository.list()[0]?.id ?? '');
  const defaultRespawnPlacement = resolveRespawnPlacement(
   this.mapTemplateRepository,
   defaultRespawnTemplateId,
   undefined,
   undefined,
  );

  const player = {
   playerId,
   sessionId,
   runtimeOwnerId: null,
   sessionEpoch: 0,
   lastHeartbeatAt: null,
   offlineSinceAt: null,
   transferState: null,
   transferTargetNodeId: null,
   transferStartedAt: null,
   transferDeadlineAt: null,
   transferWriteBlocked: false,
   transferBufferedNotices: [],
   name: playerId,
   displayName: playerId,
   sectId: null,
   persistentRevision: 1,
   persistedRevision: 0,
   instanceId: '',
   templateId: '',
   respawnTemplateId: defaultRespawnTemplateId,
   respawnInstanceId: defaultRespawnTemplateId ? buildPublicPlayerInstanceId(defaultRespawnTemplateId) : null,
   respawnX: defaultRespawnPlacement.x,
   respawnY: defaultRespawnPlacement.y,
   worldPreference: {
    linePreset: 'peaceful',
   },
   x: 0,
   y: 0,
   facing: Direction.East,
   hp: 100,
   maxHp: 100,
   qi: 0,
   maxQi: 100,
   foundation: 0,
   rootFoundation: 0,
   combatExp: 0,
   comprehension: 0,
   comprehensionSpeedRate: 0,
   luck: 0,
   dailySignInFortuneLuck: 0,
   dailySignInFortuneExpireAt: 0,
   bodyTraining: normalizeBodyTrainingState(),
   boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
   lifeElapsedTicks: 0,
   lifespanYears: null,
   stamina: DUNGEON_MAX_STAMINA,
   staminaUpdatedAt: Date.now(),
   realm: createDefaultRealmState(),
   heavenGate: null,
   spiritualRoots: null,
   unlockedMapIds: [],
   selfRevision: 1,
   inventory: {
    revision: 1,
    capacity: starterInventory.capacity,
    items: starterInventory.items,
    lockedItems: [],
   },
   wallet: {
    balances: [],
   },
   marketStorage: {
    items: [],
   },
   equipment: {
    revision: 1,
    slots: buildEquipmentSnapshot(this.contentTemplateRepository.createDefaultEquipment()),
   },
   artifacts: buildDefaultArtifactState(false),
   movementCapabilities: { staticObstacleIgnore: false },
   techniques: {
    revision: 1,
    techniques: [],
    cultivatingTechId: null,
   },
   pendingTechniqueComprehensions: [],
   allowPendingTechniqueComprehensionEmptyOverwrite: false,
   pendingTechniqueComprehensionEmptyOverwriteRevision: 0,
   pendingTechniqueComprehensionEmptyOverwriteTechIds: new Set(),
   attrs: this.playerAttributesService.createInitialState(),
   actions: {
    revision: 1,
    contextActions: [],
    actions: [],
   },
   buffs: {
    revision: 1,
    buffs: [],
   },
   combat: {
    cooldownReadyTickBySkillId: {},
    autoBattle: false,
    autoRetaliate: true,
    autoBattleStationary: false,
    autoUsePills: [],
    combatTargetingRules: undefined,
    autoBattleTargetingMode: 'auto',
    retaliatePlayerTargetId: null,
    retaliatePlayerTargetLastAttackTick: null,
    combatTargetId: null,
    combatTargetLocked: false,
    manualEngagePending: false,
    allowAoePlayerHit: false,
    autoIdleCultivation: true,
    autoSwitchCultivation: false,
    autoRootFoundation: false,
    combatAttackIntensity: DEFAULT_COMBAT_ATTACK_INTENSITY,
    senseQiActive: false,
    wangQiActive: false,
    autoBattleSkills: [],
    cultivationActive: false,
    lastActiveTick: 0,
    combatActionTick: 0,
    combatActionsUsedThisTick: 0,
   },
   notices: {
    nextId: 1,
    queue: [],
   },
   quests: {
    revision: 1,
    quests: [],
   },
   alchemySkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   forgingSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   gatherSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   buildingSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   miningSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   formationSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   transmissionSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   transmissionJob: null,
   gatherJob: null,
   buildingJob: null,
   miningJob: null,
   formationJob: null,
   techniqueActivityQueue: [],
   alchemyPresets: [],
   alchemyJob: null,
   forgingJob: null,
   enhancementSkill: createCraftSkillState(resolveInitialCraftSkillExpToNext(this.playerProgressionService)),
   enhancementSkillLevel: 1,
   enhancementJob: null,
   enhancementRecords: [],
   lootWindowTarget: null,
   pendingLogbookMessages: [],
   vitalRecoveryDeferredUntilTick: -1,
   runtimeBonuses: [],
   dirtyDomains: createPlayerDirtyDomainSet(),
   // 玩家维度 NPC quest marker 投影缓存；挂在 player 对象上跟随 removePlayerRuntime/runtime GC 释放，避免 service-level Map 泄漏。
   npcQuestMarkerCache: new Map(),
  };
  this.refreshWalletCacheFromInventory(player);
  this.playerProgressionService.initializePlayer(player);
  this.ensureArtifactUnlockState(player, { emitMovementCapabilityDelta: false });
  this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
  return player;
 }
 /** 更新角色名与展示名，仅在确实变化时递增版本。 */
 setIdentity(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const nextName = typeof input.name === 'string' && input.name.trim()
   ? input.name.trim()
   : player.name;

  const nextDisplayName = typeof input.displayName === 'string' && input.displayName.trim()
   ? input.displayName.trim()
   : nextName;
  if (player.name === nextName && player.displayName === nextDisplayName) {
   return player;
  }
  player.name = nextName;
  player.displayName = nextDisplayName;
  player.selfRevision += 1;
  return player;
 }
 /** 断开当前会话引用，但保留玩家运行时对象供重连复用。 */
 detachSession(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const player = this.players.get(playerId);
  if (player) {
   player.sessionId = null;
   if (!Number.isFinite(player.offlineSinceAt)) {
    player.offlineSinceAt = Date.now();
   }
   markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  }
  if (normalizedPlayerId) {
   this.pendingOfflineGainReportEmittedIdsByPlayerId.delete(normalizedPlayerId);
   this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId);
  }
 }
 /** 记录离线挂机开始时的权威状态基线。 */
 async beginOfflineGainSession(playerId, startedAt = Date.now()) {
  const player = this.players.get(playerId);
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!player || !normalizedPlayerId) {
   return;
  }
  if (await this.ensureOfflineGainSessionLoaded(normalizedPlayerId)) {
   const existingSession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
   if (!Number.isFinite(player.offlineSinceAt)) {
    player.offlineSinceAt = Number.isFinite(Number(existingSession?.startedAt))
     ? Math.max(0, Math.trunc(Number(existingSession.startedAt)))
     : Math.max(0, Math.trunc(Number(startedAt) || Date.now()));
   }
   if (existingSession?.baselinePayload) {
    const baselinePayload = normalizeOfflineGainSnapshot(existingSession.baselinePayload);
    existingSession.baselinePayload = baselinePayload;
    existingSession.accumulatedPayload = normalizeOfflineGainReportParts(existingSession.accumulatedPayload);
    this.playerStatisticSnapshotsByPlayerId.set(normalizedPlayerId, baselinePayload);
   }
   if (this.playerDomainPersistenceService?.isEnabled?.() && existingSession) {
    await this.playerDomainPersistenceService.savePlayerOfflineGainSession(normalizedPlayerId, existingSession);
   }
   return;
  }
  const normalizedStartedAt = Number.isFinite(player.offlineSinceAt)
   ? Math.max(0, Math.trunc(Number(player.offlineSinceAt)))
   : Math.max(0, Math.trunc(Number(startedAt) || Date.now()));
  const session = {
   sessionId: buildOfflineGainSessionId(normalizedPlayerId, normalizedStartedAt),
   startedAt: normalizedStartedAt,
   baselinePayload: buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService),
   accumulatedPayload: createEmptyOfflineGainReportParts(),
   accumulatedDurationMs: 0,
  };
  this.playerStatisticSnapshotsByPlayerId.set(normalizedPlayerId, session.baselinePayload);
  this.offlineGainSessionsByPlayerId.set(normalizedPlayerId, session);
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   await this.playerDomainPersistenceService.savePlayerOfflineGainSession(normalizedPlayerId, session);
  }
 }
 /** 确保离线收益会话从持久化恢复到内存。 */
 async ensureOfflineGainSessionLoaded(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return false;
  }
  if (this.offlineGainSessionsByPlayerId.has(normalizedPlayerId)) {
   return true;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return false;
  }
  const persistedSession = await this.playerDomainPersistenceService.loadPlayerOfflineGainSession(normalizedPlayerId);
  if (!persistedSession) {
   return false;
  }
  this.offlineGainSessionsByPlayerId.set(normalizedPlayerId, {
   sessionId: persistedSession.sessionId,
   startedAt: persistedSession.startedAt,
   baselinePayload: normalizeOfflineGainSnapshot(persistedSession.baselinePayload),
   accumulatedPayload: normalizeOfflineGainReportParts(persistedSession.accumulatedPayload),
   accumulatedDurationMs: persistedSession.accumulatedDurationMs,
  });
  return true;
 }
 /** 判断玩家是否仍有待确认的离线收益会话。 */
 async hasActiveOfflineGainSession(playerId) {
  return this.shouldBlockOfflineGainSession(playerId);
 }
 /** 同步热路径只读内存态：bootstrap/请求刷新会负责先恢复持久化 session。 */
 hasLoadedActiveOfflineGainSession(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const session = normalizedPlayerId ? this.offlineGainSessionsByPlayerId.get(normalizedPlayerId) : null;
  return shouldBlockOfflineGainSessionRecord(session);
 }
 async shouldBlockOfflineGainSession(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !await this.ensureOfflineGainSessionLoaded(normalizedPlayerId)) {
   return false;
  }
  return shouldBlockOfflineGainSessionRecord(this.offlineGainSessionsByPlayerId.get(normalizedPlayerId));
 }
 /** 生成当前离线收益预览；不结算、不删除 session、不写入 pending 报告。 */
 async loadOfflineGainPreviewReports(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return [];
  }
  const pendingReports = (await this.loadPendingOfflineGainReports(normalizedPlayerId))
   .filter((report) => report?.scope !== 'online');
  const hasSession = await this.shouldBlockOfflineGainSession(normalizedPlayerId);
  const player = this.players.get(normalizedPlayerId);
  if (!hasSession || !player) {
   this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId);
   return pendingReports;
  }
  const session = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
  if (!session) {
   this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId);
   return pendingReports;
  }
  const previewReport = buildOfflineGainReportFromSession(
   player,
   session,
   Date.now(),
   this.contentTemplateRepository,
  );
  const reports = [mergePendingOfflineGainReport(normalizedPlayerId, pendingReports, previewReport)];
  const previewIds = this.blockingOfflineGainPreviewIdsByPlayerId.get(normalizedPlayerId) ?? new Set();
  for (const report of reports) {
   const reportId = normalizeOfflineGainString(report?.id);
   if (reportId) {
    previewIds.add(reportId);
   }
  }
  this.blockingOfflineGainPreviewIdsByPlayerId.set(normalizedPlayerId, previewIds);
  return reports;
 }
 /** 读取当前还在云端等待浏览器本地归档的离线收益报告。 */
 async loadPendingOfflineGainReports(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return [];
  }
  const memoryReports = this.getPendingPlayerStatisticRecords(normalizedPlayerId);
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   const persistedReports = await this.playerDomainPersistenceService.loadPlayerOfflineGainReports(normalizedPlayerId);
   const mergedReports = mergePendingOfflineGainReportList(normalizedPlayerId, [...persistedReports, ...memoryReports]);
   if (mergedReports.length === 1 && persistedReports.length + memoryReports.length > 1) {
    await this.playerDomainPersistenceService.replacePlayerOfflineGainReports(normalizedPlayerId, mergedReports);
    this.pendingOfflineGainReportsByPlayerId.delete(normalizedPlayerId);
   }
   return mergedReports;
  }
  return memoryReports;
 }
 /** 同步读取内存中的待归档离线挂机统计，数据库禁用时供低频同步投递。 */
 getPendingPlayerStatisticRecords(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return [];
  }
  return this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
 }
 /** 读取本连接期尚未下发过的待归档报告；报告仍保留到客户端 ack 后再删除。 */
 consumePendingPlayerStatisticRecordsForEmit(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return [];
  }
  const reports = this.getPendingPlayerStatisticRecords(normalizedPlayerId);
  if (reports.length === 0) {
   this.pendingOfflineGainReportEmittedIdsByPlayerId.delete(normalizedPlayerId);
   return [];
  }
  const emittedIds = this.pendingOfflineGainReportEmittedIdsByPlayerId.get(normalizedPlayerId) ?? new Set();
  const nextReports = [];
  for (const report of reports) {
   const reportId = normalizeOfflineGainString(report?.id);
   if (!reportId || emittedIds.has(reportId)) {
    continue;
   }
   emittedIds.add(reportId);
   nextReports.push(report);
  }
  if (emittedIds.size > 0) {
   this.pendingOfflineGainReportEmittedIdsByPlayerId.set(normalizedPlayerId, emittedIds);
  }
  return nextReports;
 }
 /** 标记 bootstrap 后置链路已经下发过的报告，避免随后 tick 再重复推送同一批。 */
 markPendingOfflineGainReportsEmitted(playerId, reports) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !Array.isArray(reports) || reports.length === 0) {
   return;
  }
  const emittedIds = this.pendingOfflineGainReportEmittedIdsByPlayerId.get(normalizedPlayerId) ?? new Set();
  for (const report of reports) {
   const reportId = normalizeOfflineGainString(report?.id);
   if (reportId) {
    emittedIds.add(reportId);
   }
  }
  if (emittedIds.size > 0) {
   this.pendingOfflineGainReportEmittedIdsByPlayerId.set(normalizedPlayerId, emittedIds);
  }
 }
 /** 从数据库回读并组合玩家统计总账。 */
 async loadPlayerStatisticTotals(playerId, now = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return buildEmptyPlayerStatisticTotals(now);
  }
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   await this.playerStatisticLedgerIoQueue.run(normalizedPlayerId, async () => {
    const dayKeys = buildPlayerStatisticRelevantDayKeys(now);
    const rows = await this.playerDomainPersistenceService.loadPlayerStatisticDayTotals(normalizedPlayerId, dayKeys);
    const byDay = this.playerStatisticPersistedDayTotalsByPlayerId.get(normalizedPlayerId) ?? new Map();
    for (const row of rows) {
     byDay.set(row.dayKey, normalizePlayerStatisticPeriodTotal(row.total));
    }
    this.playerStatisticPersistedDayTotalsByPlayerId.set(normalizedPlayerId, byDay);
   });
  }
  const totals = this.getPlayerStatisticTotalsSync(normalizedPlayerId, now);
  return totals && hasPlayerStatisticTotalsView(totals) ? totals : null;
 }
 /** 同步读取当前服务端已知统计总账，用于低频单播。 */
 getPlayerStatisticTotalsSync(playerId, now = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return null;
  }
  const persisted = this.playerStatisticPersistedDayTotalsByPlayerId.get(normalizedPlayerId);
  const runtime = this.playerStatisticDayTotalsByPlayerId.get(normalizedPlayerId);
  if (!persisted && !runtime) {
   return null;
  }
  return buildPlayerStatisticTotalsView(persisted, runtime, now);
 }
 /** 消费待下发的服务端总账，只在实际收支变化后单播，避免低频循环重复发包。 */
 consumePlayerStatisticTotalsForEmit(playerId, now = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !this.pendingPlayerStatisticTotalsEmitPlayerIds.has(normalizedPlayerId)) {
   return null;
  }
  this.pendingPlayerStatisticTotalsEmitPlayerIds.delete(normalizedPlayerId);
  return this.getPlayerStatisticTotalsSync(normalizedPlayerId, now) ?? buildEmptyPlayerStatisticTotals(now);
 }
 /** 消费待下发总账增量；在线 tick 只发变化周期与指标，避免每秒重复完整总账。 */
 consumePlayerStatisticTotalsPatchForEmit(playerId, now = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !this.pendingPlayerStatisticTotalsEmitPlayerIds.has(normalizedPlayerId)) {
   return null;
  }
  this.pendingPlayerStatisticTotalsEmitPlayerIds.delete(normalizedPlayerId);
  const current = this.getPlayerStatisticTotalsSync(normalizedPlayerId, now);
  if (!current || !hasPlayerStatisticTotalsView(current)) {
   this.playerStatisticLastEmittedTotalsByPlayerId.delete(normalizedPlayerId);
   return null;
  }
  const previous = this.playerStatisticLastEmittedTotalsByPlayerId.get(normalizedPlayerId) ?? null;
  const patch = buildPlayerStatisticTotalsPatch(previous, current);
  this.playerStatisticLastEmittedTotalsByPlayerId.set(normalizedPlayerId, current);
  return hasPlayerStatisticTotalsPatch(patch) ? patch : null;
 }
 /** 记录已经完整下发给客户端的统计总账，后续在线刷新才能按真实差异发 totalsPatch。 */
 markPlayerStatisticTotalsEmitted(playerId, totals) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !totals || !hasPlayerStatisticTotalsView(totals)) {
   return;
  }
  this.playerStatisticLastEmittedTotalsByPlayerId.set(normalizedPlayerId, totals);
 }
 /** 客户端确认离线收益后，清掉云端待发副本；浏览器本地历史只是展示缓存。 */
 async acknowledgeOfflineGainReports(playerId, reportIds, options = undefined) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const normalizedReportIds = Array.from(new Set(Array.from(reportIds ?? [])
   .map((reportId) => normalizeOfflineGainString(reportId))
   .filter((reportId) => reportId.length > 0)));
  if (!normalizedPlayerId || normalizedReportIds.length === 0) {
   return false;
  }
  const pendingReports = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
  const pendingReportById = new Map<string, any>(
   pendingReports
    .filter((report) => normalizeOfflineGainString(report?.id))
    .map((report) => [normalizeOfflineGainString(report.id), report]),
  );
  const onlyKnownOnlineReports = normalizedReportIds.every(
   (reportId) => pendingReportById.get(reportId)?.scope === 'online',
  );
  if (onlyKnownOnlineReports) {
   this.removeAcknowledgedPlayerStatisticRecordsFromMemory(normalizedPlayerId, normalizedReportIds);
   return false;
  }
  const blockingPreviewIds = this.blockingOfflineGainPreviewIdsByPlayerId.get(normalizedPlayerId);
  const acknowledgesBlockingPreview = normalizedReportIds.some((reportId) => blockingPreviewIds?.has(reportId));
  if (!acknowledgesBlockingPreview) {
   this.removeAcknowledgedPlayerStatisticRecordsFromMemory(normalizedPlayerId, normalizedReportIds);
   if (this.playerDomainPersistenceService?.isEnabled?.()) {
    await this.playerDomainPersistenceService.deletePlayerOfflineGainReports(normalizedPlayerId, normalizedReportIds);
   }
   return false;
  }
  const sessionId = normalizeOfflineGainString(options?.sessionId);
  const shouldResumeBlockingSession = Boolean(sessionId)
   && await this.shouldBlockOfflineGainSession(normalizedPlayerId);
  if (!shouldResumeBlockingSession) {
   return false;
  }
  if (await this.ensureOfflineGainSessionLoaded(normalizedPlayerId)) {
   const player = this.players.get(normalizedPlayerId);
   if (player) {
    await this.finalizeOfflineGainSessionForPlayer(player, Date.now());
   }
  }
  this.removeAcknowledgedPlayerStatisticRecordsFromMemory(normalizedPlayerId, normalizedReportIds);
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   await this.playerDomainPersistenceService.deletePlayerOfflineGainReports(normalizedPlayerId, normalizedReportIds);
  }
  const activated = Boolean(this.activatePlayerRuntimeSession(normalizedPlayerId, sessionId));
  if (activated) {
   this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId);
  }
  return activated;
 }
 /** 从内存待发队列清除已归档的在线或离线收支记录。 */
 private removeAcknowledgedPlayerStatisticRecordsFromMemory(playerId, reportIds) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return;
  }
  const normalizedReportIds = Array.from(reportIds ?? [])
   .map((reportId) => normalizeOfflineGainString(reportId))
   .filter(Boolean);
  const reportIdSet = new Set(normalizedReportIds);
  const existing = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
  const remaining = existing.filter((entry) => !reportIdSet.has(entry?.id));
  if (remaining.length > 0) {
   this.pendingOfflineGainReportsByPlayerId.set(normalizedPlayerId, remaining);
  } else {
   this.pendingOfflineGainReportsByPlayerId.delete(normalizedPlayerId);
  }
  const emittedIds = this.pendingOfflineGainReportEmittedIdsByPlayerId.get(normalizedPlayerId);
  if (emittedIds) {
   for (const reportId of normalizedReportIds) {
    emittedIds.delete(reportId);
   }
   if (emittedIds.size > 0) {
    this.pendingOfflineGainReportEmittedIdsByPlayerId.set(normalizedPlayerId, emittedIds);
   } else {
    this.pendingOfflineGainReportEmittedIdsByPlayerId.delete(normalizedPlayerId);
   }
  }
 }
 /** 客户端确认离线收益后，把玩家从离线挂机态切回在线 session。 */
 activatePlayerRuntimeSession(playerId, sessionId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const normalizedSessionId = normalizeOfflineGainString(sessionId);
  const player = normalizedPlayerId ? this.players.get(normalizedPlayerId) : null;
  if (!player || !normalizedSessionId) {
   return null;
  }
  // 离线收益确认可能因重试重复到达；同一 session 的重复确认只刷新心跳，不能反复轮换 fence。
  return this.refreshRuntimeSession(player, normalizedSessionId);
 }
 /** 上线前把离线基线与当前权威态做差，生成待下发报告。 */
 async finalizeOfflineGainSessionForPlayer(player, endedAt = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
  if (!player || !normalizedPlayerId) {
   return null;
  }
  const existing = this.offlineGainFinalizationPromiseByPlayerId.get(normalizedPlayerId);
  if (existing) {
   return existing;
  }
  const finalization = this.finalizeOfflineGainSessionForPlayerLocked(player, normalizedPlayerId, endedAt);
  this.offlineGainFinalizationPromiseByPlayerId.set(normalizedPlayerId, finalization);
  try {
   return await finalization;
  }
  finally {
   if (this.offlineGainFinalizationPromiseByPlayerId.get(normalizedPlayerId) === finalization) {
    this.offlineGainFinalizationPromiseByPlayerId.delete(normalizedPlayerId);
   }
  }
 }
 private async finalizeOfflineGainSessionForPlayerLocked(player, normalizedPlayerId, endedAt) {
  // 必须在首次数据库 await 前保留内存基线；失败重试仍要能证明本次离线收益。
  const memorySession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
  const persistedSession = this.playerDomainPersistenceService?.isEnabled?.()
   ? await this.playerDomainPersistenceService.loadPlayerOfflineGainSession(normalizedPlayerId)
   : memorySession;
  const session = mergeOfflineGainSessionRecords(persistedSession, memorySession);
  if (!session) {
   return null;
  }

  const report = buildOfflineGainReportFromSession(
   player,
   session,
   Math.max(0, Math.trunc(Number(endedAt) || Date.now())),
   this.contentTemplateRepository,
  );
  const shouldSaveOfflineHistory = report.durationMs >= OFFLINE_GAIN_REPORT_MIN_DURATION_MS && hasOfflineGainReportParts(report);
  if (shouldSaveOfflineHistory) {
   if (this.playerDomainPersistenceService?.isEnabled?.()) {
    const existing = await this.playerDomainPersistenceService.loadPlayerOfflineGainReports(normalizedPlayerId);
    const mergedReports = mergePendingOfflineGainReportList(normalizedPlayerId, [...existing, report]);
    await this.playerDomainPersistenceService.replacePlayerOfflineGainReports(normalizedPlayerId, mergedReports);
   } else {
    const existing = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
    this.pendingOfflineGainReportsByPlayerId.set(
     normalizedPlayerId,
     mergePendingOfflineGainReportList(normalizedPlayerId, [...existing, report]),
    );
   }
  }
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   await this.playerDomainPersistenceService.deletePlayerOfflineGainSession(normalizedPlayerId, session.sessionId);
  }
  this.recordPlayerStatisticTotals(normalizedPlayerId, report, report.endedAt);
  const currentMemorySession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
  if (!currentMemorySession || currentMemorySession === memorySession || currentMemorySession.sessionId === session.sessionId) {
   this.offlineGainSessionsByPlayerId.delete(normalizedPlayerId);
   this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId);
  }
  return report;
 }
 /** 从运行时中移除玩家，通常用于注销或彻底清理。 */
 removePlayerRuntime(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  this.players.delete(playerId);
  this.offlineGainSessionsByPlayerId.delete(playerId);
  this.playerStatisticSnapshotsByPlayerId.delete(playerId);
  this.playerStatisticDayTotalsByPlayerId.delete(playerId);
  this.playerStatisticPersistedDayTotalsByPlayerId.delete(playerId);
  this.pendingPlayerStatisticDayTotalsByPlayerId.delete(playerId);
  this.scheduledPlayerStatisticLedgerFlushes.delete(playerId);
  this.pendingPlayerStatisticTotalsEmitPlayerIds.delete(playerId);
  this.playerStatisticLastEmittedTotalsByPlayerId.delete(playerId);
  this.pendingOfflineGainReportsByPlayerId.delete(playerId);
  this.pendingOfflineGainReportEmittedIdsByPlayerId.delete(normalizedPlayerId || playerId);
  this.blockingOfflineGainPreviewIdsByPlayerId.delete(normalizedPlayerId || playerId);
  // 同步清理事件总线上该玩家的待发队列，避免历史 playerId 在 playerQueues 中持续残留。
  if (typeof this.runtimeEventBusService?.discardPlayer === 'function') {
   this.runtimeEventBusService.discardPlayer(playerId);
  }
 }
 /** 判断断线窗口过期后是否可以卸载完整玩家运行态，避免空闲离线玩家长期常驻。 */
 canUnloadDetachedPlayerRuntime(playerId) {
  const player = this.players.get(playerId);
  if (!player) {
   return false;
  }
  const online = typeof player.sessionId === 'string' && player.sessionId.trim().length > 0;
  if (online) {
   return false;
  }
  if (isOfflineHangingRuntimeExpired(player) && !isOfflineHangingRuntimeReadyForReap(player)) {
   return false;
  }
  if (this.offlineGainSessionsByPlayerId.has(playerId)) {
   if (!this.playerDomainPersistenceService?.isEnabled?.() || hasPendingDetachedAutomation(player)) {
    return false;
   }
  }
  return !hasDetachedRuntimeActivity(player);
 }
 /** 标记离线挂机已到权益上限，并停止等待 reaper 期间仍可能自动恢复的战斗活动。 */
 markOfflineHangingRuntimeExpired(playerId, expiredAt = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const player = normalizedPlayerId ? this.players.get(normalizedPlayerId) : null;
  if (!player || isPlayerRuntimeOnline(player) || isRuntimeTransferInProgress(player)) {
   return false;
  }
  const expiryMarkerChanged = !isOfflineHangingRuntimeExpired(player);
  if (expiryMarkerChanged) {
   player.offlineHangingExpiredAt = Math.max(1, Math.trunc(Number(expiredAt) || Date.now()));
   player.offlineHangingReapReadyAt = null;
  }
  const combat = player.combat ?? (player.combat = {});
  const cultivationChanged = combat.cultivationActive === true;
  const combatChanged = cultivationChanged
   || combat.autoRootFoundation === true
   || combat.autoBattle === true
   || combat.manualEngagePending === true
   || combat.retaliatePlayerTargetId != null
   || combat.retaliatePlayerTargetLastAttackTick != null
   || combat.combatTargetId != null
   || combat.combatTargetLocked === true;
  combat.cultivationActive = false;
  combat.autoRootFoundation = false;
  combat.autoBattle = false;
  combat.manualEngagePending = false;
  combat.retaliatePlayerTargetId = null;
  combat.retaliatePlayerTargetLastAttackTick = null;
  combat.combatTargetId = null;
  combat.combatTargetLocked = false;
  if (cultivationChanged) {
   this.playerAttributesService.recalculate(player, 'cultivation_state');
  }
  if (!expiryMarkerChanged && !combatChanged) {
   return true;
  }
  if (combatChanged) {
   markPlayerDirtyDomains(player, [
    'combat_pref',
    ...(cultivationChanged ? ['attr'] : []),
   ]);
   this.bumpPersistentRevision(player);
  }
  return true;
 }
 /** 清理前置步骤全部完成后开放 reaper，并让 presence 在最终刷盘时切换为彻底离线。 */
 markOfflineHangingRuntimeReadyForReap(playerId, readyAt = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  const player = normalizedPlayerId ? this.players.get(normalizedPlayerId) : null;
  if (!player
   || !isOfflineHangingRuntimeExpired(player)
   || isPlayerRuntimeOnline(player)
   || isRuntimeTransferInProgress(player)) {
   return false;
  }
  if (isOfflineHangingRuntimeReadyForReap(player)) {
   return true;
  }
  player.offlineHangingReapReadyAt = Math.max(1, Math.trunc(Number(readyAt) || Date.now()));
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  this.bumpPersistentRevision(player);
  return true;
 }
 /** 打开指定坐标的战利品窗口。 */
 openLootWindow(playerId, tileX, tileY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  if (player.lootWindowTarget?.tileX === tileX && player.lootWindowTarget.tileY === tileY) {
   return player;
  }
  player.lootWindowTarget = { tileX, tileY };
  return player;
 }
 /**
* clearLootWindow：执行clear掉落窗口相关逻辑。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新clear掉落窗口相关状态。
*/

 clearLootWindow(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  if (!player.lootWindowTarget) {
   return player;
  }
  player.lootWindowTarget = null;
  return player;
 }
 /**
* getLootWindowTarget：读取掉落窗口目标。
* @param playerId 玩家 ID。
* @returns 无返回值，完成掉落窗口目标的读取/组装。
*/

 getLootWindowTarget(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayer(playerId);
  if (!player?.lootWindowTarget) {
   return null;
  }
  return {
   tileX: player.lootWindowTarget.tileX,
   tileY: player.lootWindowTarget.tileY,
  };
 }
 /**
* getPlayer：读取玩家。
* @param playerId 玩家 ID。
* @returns 无返回值，完成玩家的读取/组装。
*/

 getPlayer(playerId) {
  return this.players.get(playerId) ?? null;
 }
 /** 结算玩家精力的自然恢复，并返回权威精力视图。 */
 refreshDungeonStamina(playerId, now = Date.now()) {
  const player = this.getPlayerOrThrow(playerId);
  const recovered = resolveRecoveredStamina(
   Number.isFinite(player.stamina) ? player.stamina : DUNGEON_MAX_STAMINA,
   Number.isFinite(player.staminaUpdatedAt) ? player.staminaUpdatedAt : now,
   now,
  );
  if (player.stamina !== recovered.current || player.staminaUpdatedAt !== recovered.updatedAt) {
   player.stamina = recovered.current;
   player.staminaUpdatedAt = recovered.updatedAt;
   markPlayerDirtyDomains(player, ['progression']);
   this.bumpPersistentRevision(player);
  }
  return {
   current: recovered.current,
   maximum: DUNGEON_MAX_STAMINA,
   updatedAt: recovered.updatedAt,
   nextRecoveryAt: recovered.current >= DUNGEON_MAX_STAMINA
    ? null
    : recovered.updatedAt + 60 * 60 * 1000,
  };
 }
 /** 用已提交的耐久事务结果替换运行态副本精力。 */
 replaceDungeonStamina(playerId, currentInput, updatedAtInput) {
  const player = this.getPlayerOrThrow(playerId);
  const current = Math.max(0, Math.min(DUNGEON_MAX_STAMINA, Math.trunc(Number(currentInput) || 0)));
  const updatedAt = Math.max(0, Math.trunc(Number(updatedAtInput) || Date.now()));
  player.stamina = current;
  player.staminaUpdatedAt = updatedAt;
  markPlayerDirtyDomains(player, ['progression']);
  this.bumpPersistentRevision(player);
  return {
   current,
   maximum: DUNGEON_MAX_STAMINA,
   updatedAt,
   nextRecoveryAt: current >= DUNGEON_MAX_STAMINA ? null : updatedAt + 60 * 60 * 1000,
  };
 }
 /** 在进入副本的唯一提交点扣除精力；不足时不产生任何写入。 */
 consumeDungeonStamina(playerId, costInput, now = Date.now()) {
  const cost = Math.max(0, Math.trunc(Number(costInput) || 0));
  const view = this.refreshDungeonStamina(playerId, now);
  if (view.current < cost) {
   return { ok: false, ...view };
  }
  const player = this.getPlayerOrThrow(playerId);
  player.stamina = view.current - cost;
  player.staminaUpdatedAt = now;
  markPlayerDirtyDomains(player, ['progression']);
  this.bumpPersistentRevision(player);
  return {
   ok: true,
   current: player.stamina,
   maximum: DUNGEON_MAX_STAMINA,
   updatedAt: now,
   nextRecoveryAt: player.stamina >= DUNGEON_MAX_STAMINA ? null : now + 60 * 60 * 1000,
  };
 }

 /** 副本入口优先调用持久化层原子扣除；数据库不可用时保留本地 smoke/开发回退。 */
 async consumeDungeonStaminaDurably(playerId, costInput, now = Date.now()) {
  return this.runExclusiveAssetMutation([playerId], async () => {
   if (this.playerDomainPersistenceService?.isEnabled?.() && typeof this.playerDomainPersistenceService.consumeDungeonStaminaAtomic === 'function') {
    const fence = this.getSessionFence(playerId);
    if (!fence?.runtimeOwnerId || !fence.sessionEpoch) throw new Error(`dungeon_stamina_session_fence_required:${playerId}`);
    const result = await this.playerDomainPersistenceService.consumeDungeonStaminaAtomic(playerId, costInput, now, {
     expectedRuntimeOwnerId: fence.runtimeOwnerId,
     expectedSessionEpoch: fence.sessionEpoch,
    });
    this.replaceDungeonStamina(playerId, result.current, result.updatedAt);
    return result;
   }
   return this.consumeDungeonStamina(playerId, costInput, now);
  });
 }
 async refundDungeonStaminaDurably(playerId, amountInput, now = Date.now()) {
  return this.runExclusiveAssetMutation([playerId], async () => {
   if (this.playerDomainPersistenceService?.isEnabled?.() && typeof this.playerDomainPersistenceService.refundDungeonStaminaAtomic === 'function') {
    const fence = this.getSessionFence(playerId);
    if (!fence?.runtimeOwnerId || !fence.sessionEpoch) throw new Error(`dungeon_stamina_session_fence_required:${playerId}`);
    const result = await this.playerDomainPersistenceService.refundDungeonStaminaAtomic(playerId, amountInput, now, {
     expectedRuntimeOwnerId: fence.runtimeOwnerId,
     expectedSessionEpoch: fence.sessionEpoch,
    });
    this.replaceDungeonStamina(playerId, result.current, result.updatedAt);
    return result;
   }
   return this.refundDungeonStamina(playerId, amountInput, now);
  });
 }
 async consumeDungeonStaminaForPlayersDurably(playerIds, costInput, now = Date.now()) {
  const normalizedPlayerIds = Array.from(new Set((Array.isArray(playerIds) ? playerIds : []).map((value) => String(value ?? '').trim()).filter(Boolean)));
  return this.runExclusiveAssetMutation(normalizedPlayerIds, async () => {
   if (this.playerDomainPersistenceService?.isEnabled?.() && typeof this.playerDomainPersistenceService.consumeDungeonStaminaForPlayersAtomic === 'function') {
    const fences: Record<string, { expectedRuntimeOwnerId: string; expectedSessionEpoch: number }> = {};
    for (const playerId of normalizedPlayerIds) {
     const fence = this.getSessionFence(playerId);
     if (!fence?.runtimeOwnerId || !fence.sessionEpoch) throw new Error(`dungeon_stamina_session_fence_required:${playerId}`);
     fences[playerId] = {
      expectedRuntimeOwnerId: fence.runtimeOwnerId,
      expectedSessionEpoch: fence.sessionEpoch,
     };
    }
    const result = await this.playerDomainPersistenceService.consumeDungeonStaminaForPlayersAtomic(normalizedPlayerIds, costInput, now, fences);
    for (const playerId of normalizedPlayerIds) {
     const view = result.views[playerId];
     if (view) this.replaceDungeonStamina(playerId, view.current, view.updatedAt);
    }
    return result;
   }
   const views = {};
   const consumed = [];
   for (const playerId of normalizedPlayerIds) {
    const result = this.consumeDungeonStamina(playerId, costInput, now);
    if (!result.ok) {
     for (const consumedPlayerId of consumed) this.refundDungeonStamina(consumedPlayerId, costInput, now);
     return { ok: false, reason: 'stamina_insufficient', views };
    }
    consumed.push(playerId);
    views[playerId] = result;
   }
   return { ok: true, views };
  });
 }
 refundDungeonStamina(playerId, amountInput, now = Date.now()) {
  const amount = Math.max(0, Math.trunc(Number(amountInput) || 0));
  const player = this.getPlayerOrThrow(playerId);
  this.refreshDungeonStamina(playerId, now);
  player.stamina = Math.min(DUNGEON_MAX_STAMINA, Math.max(0, Number(player.stamina) || 0) + amount);
  player.staminaUpdatedAt = now;
  markPlayerDirtyDomains(player, ['progression']);
  this.bumpPersistentRevision(player);
  return this.refreshDungeonStamina(playerId, now);
 }
 /** 构建目标玩家对传授者当前可传功法的已学状态。 */
 buildTechniqueTransmissionStatuses(teacherPlayerIdInput, targetPlayerIdInput): TechniqueTransmissionStatusView[] { return buildTechniqueTransmissionStatusesImpl(this, teacherPlayerIdInput, targetPlayerIdInput); }
 /**
  * 仅在玩家没有已登记资产事务时，于当前事件循环同步执行非资产状态推进。
  * 队列检查与 action 封装在同一同步调用栈内，保证新的资产事务不能插入两者之间。
  */
 tryRunSynchronousPlayerMutationWhileAssetIdle(
  playerId: string,
  action: () => void,
 ): boolean {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  if (!normalizedPlayerId || typeof action !== 'function') {
   return false;
  }
  if (this.assetMutationQueueByPlayerId.has(normalizedPlayerId)) {
   return false;
  }
  const result = (action as () => unknown)();
  if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
   throw new Error('player_asset_idle_action_must_be_synchronous');
  }
  return true;
 }
 /**
  * 串行执行会跨 await 的玩家资产变更。一次涉及多名玩家时先同步登记全部有序 ticket，
  * 因而不同调用即使传入相反顺序也不会形成交叉等待。
  */
 async runExclusiveAssetMutation<TResult>(
  playerIds: readonly string[],
  action: () => Promise<TResult> | TResult,
  options: { deferAssetStatisticsUntilSuccess?: boolean } = {},
 ): Promise<TResult> {
  const normalizedPlayerIds = Array.from(new Set(
   (Array.isArray(playerIds) ? playerIds : [])
    .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
    .filter(Boolean),
  )).sort();
  if (normalizedPlayerIds.length === 0) {
   return await action();
  }
  const activeContext = this.assetMutationContext.getStore();
  if (activeContext?.active && normalizedPlayerIds.every((playerId) => activeContext.playerIds.has(playerId))) {
   if (options.deferAssetStatisticsUntilSuccess === true && !activeContext.deferredAssetStatistics) {
    throw new Error('player_asset_statistic_deferred_scope_required');
   }
   return await action();
  }
  if (activeContext?.active && activeContext.playerIds.size > 0) {
   throw new Error('player_asset_mutation_nested_lock_expansion_forbidden');
  }

  const tickets = normalizedPlayerIds.map((playerId) => {
   const previous = this.assetMutationQueueByPlayerId.get(playerId) ?? Promise.resolve();
   let release!: () => void;
   const gate = new Promise<void>((resolve) => {
    release = resolve;
   });
   const tail = previous.catch(() => undefined).then(() => gate);
   this.assetMutationQueueByPlayerId.set(playerId, tail);
   return { playerId, previous, release, tail };
  });

  await Promise.all(tickets.map((ticket) => ticket.previous.catch(() => undefined)));
  const lockContext = {
   playerIds: new Set(normalizedPlayerIds),
   active: true,
   deferredAssetStatistics: options.deferAssetStatisticsUntilSuccess === true
    ? new Map(normalizedPlayerIds.flatMap((playerId) => {
     const player = this.getPlayer(playerId);
     const beforeSnapshot = player ? this.captureOfflineGainBeforeTick(player) : null;
     return player && beforeSnapshot
      ? [[playerId, { player, beforeSnapshot, endedAt: Date.now() }] as const]
      : [];
    }))
    : null,
  };
  try {
   const result = await this.assetMutationContext.run(lockContext, action);
   if (lockContext.deferredAssetStatistics) {
    const deferredAssetStatistics = lockContext.deferredAssetStatistics;
    lockContext.deferredAssetStatistics = null;
    for (const entry of deferredAssetStatistics.values()) {
     try {
      this.recordAssetStatisticMutation(entry.player, entry.beforeSnapshot, entry.endedAt);
     }
     catch (error) {
      // 资产事务已经成功，统计派生失败不能把已提交结果伪装成事务失败。
      this.logger.warn(
       `提交后资产统计结算失败：${entry.player?.playerId ?? 'unknown'} ${error instanceof Error ? error.message : String(error)}`,
      );
     }
    }
   }
   return result;
  }
  finally {
   lockContext.active = false;
   for (const ticket of tickets) {
    ticket.release();
   }
   for (const ticket of tickets) {
    void ticket.tail.finally(() => {
     if (this.assetMutationQueueByPlayerId.get(ticket.playerId) === ticket.tail) {
      this.assetMutationQueueByPlayerId.delete(ticket.playerId);
     }
    });
   }
  }
 }
 /** 供跨领域强事务在提交前确认当前异步链确实持有全部参与玩家资产锁。 */
 hasActiveAssetMutationLocks(playerIds: readonly string[]): boolean {
  const activeContext = this.assetMutationContext.getStore();
  if (!activeContext?.active) {
   return false;
  }
  return (Array.isArray(playerIds) ? playerIds : [])
   .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
   .filter(Boolean)
   .every((playerId) => activeContext.playerIds.has(playerId));
 }
 /**
* getPlayerOrThrow：读取玩家OrThrow。
* @param playerId 玩家 ID。
* @returns 无返回值，完成玩家OrThrow的读取/组装。
*/

 getPlayerOrThrow(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.players.get(playerId);
  if (!player) {
   throw new NotFoundException('玩家不存在');
  }
  return player;
 }
 /**
* repairInventoryItemInstanceIds：扫描玩家全背包并补齐缺失或旧格式实例 ID。
* @param playerId 玩家 ID。
* @returns 修复数量。
*/

 repairInventoryItemInstanceIds(playerId) {
  const player = this.getPlayerOrThrow(playerId);
  let repairedCount = 0;
  for (const entry of player.inventory?.items ?? []) {
   if (assignItemInstanceIdIfNeeded(entry)) {
    repairedCount += 1;
   }
  }
  if (repairedCount > 0) {
   player.inventory.revision += 1;
   markPlayerDirtyDomains(player, ['inventory']);
   this.bumpPersistentRevision(player);
  }
  return repairedCount;
 }
 /** 获取玩家当前境界等级（realmLv），玩家不在线返回 null */
 getPlayerRealmLv(playerId) {
  const player = this.getPlayer(playerId);
  if (!player) return null;
  return Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
 }
 /** 获取玩家历史最高境界等级；玩家不在线返回 null。 */
 getPlayerHighestRealmLv(playerId) {
  const player = this.getPlayer(playerId);
  if (!player) return null;
  if (typeof this.playerProgressionService?.getHighestRealmLv === 'function') {
   return this.playerProgressionService.getHighestRealmLv(player);
  }
  return Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
 }
 /** 按境界等级读取展示名，避免运行态调用方接触经验等混合配置。 */
 getRealmLevelDisplayName(realmLv) {
  const normalizedRealmLv = Math.max(1, Math.floor(Number(realmLv) || 1));
  if (typeof this.playerProgressionService?.listRealmLevels !== 'function') {
   return undefined;
  }
  const entry = this.playerProgressionService
   .listRealmLevels()
   .find((item) => item?.realmLv === normalizedRealmLv);
  return typeof entry?.displayName === 'string' && entry.displayName.trim()
   ? entry.displayName.trim()
   : undefined;
 }
 /** 按 itemId 消耗背包物品，成功返回 true */
 consumeItemByItemId(playerId, itemId, count = 1) { return consumeItemByItemIdImpl(this, playerId, itemId, count); }
 /** 按 techniqueId 直接学习功法，成功返回 true */
 learnTechniqueById(playerId, techniqueId) { return learnTechniqueByIdImpl(this, playerId, techniqueId); }
 /** 发布者完成统合后直接继承已圆满源功法的训练成果。 */
 learnPublishedAggregateTechniqueById(playerId, techniqueId) { return learnPublishedAggregateTechniqueByIdImpl(this, playerId, techniqueId); }
 /** 按当前模板刷新所有在线玩家已学功法的静态投影。 */
 refreshOnlineTechniqueTemplates() { return refreshOnlineTechniqueTemplatesImpl(this); }
 /** 将功法加入未领悟列表，不直接学会。 */
 addPendingTechniqueComprehensionById(playerId, techniqueId, sourceKind = 'normal', creatorPlayerId = null, options = undefined) { return addPendingTechniqueComprehensionByIdImpl(this, playerId, techniqueId, sourceKind, creatorPlayerId, options); }

 /** 返回结构化功法统合重叠错误；无冲突时返回 null。 */
 resolveTechniqueLearningConflict(playerOrId, techniqueId) { return resolveTechniqueLearningConflictImpl(this, playerOrId, techniqueId); }

 /** 领悟完成后执行聚合功法的源功法/旧版本替换。 */
 applyTechniqueAggregationCompletion(player, techniqueId) { return applyTechniqueAggregationCompletionImpl(this, player, techniqueId); }

 /** 为聚合替换清空最后一批待领悟行提供精确持久化授权。 */
 authorizePendingTechniqueComprehensionRemovals(playerOrId, techniqueIds) { return authorizePendingTechniqueComprehensionRemovalsImpl(this, playerOrId, techniqueIds); }

 /** 将旧聚合版本解析为家族最新版本，供背包、传法和兼容入口共用。 */
 resolveLatestTechniqueId(techniqueId) { return resolveLatestTechniqueIdImpl(this, techniqueId); }
 startTechniqueTransmission(teacherPlayerId, learnerPlayerId, techniqueId) { return startTechniqueTransmissionImpl(this, teacherPlayerId, learnerPlayerId, techniqueId); }
 cancelTechniqueTransmission(learnerPlayerId, techniqueId) { return cancelTechniqueTransmissionImpl(this, learnerPlayerId, techniqueId); }
 normalizePendingTechniqueComprehensionsForRuntime(value, learnerRealmLv = undefined) { return normalizePendingTechniqueComprehensionsForRuntimeImpl(this, value, learnerRealmLv); }
 refreshPendingTechniqueComprehensionRequirement(pending, fallbackTechnique = null, learnerRealmLv = undefined) { return refreshPendingTechniqueComprehensionRequirementImpl(this, pending, fallbackTechnique, learnerRealmLv); }
 interruptTechniqueTransmissionForPlayer(learnerPlayerId, reason = 'attack', currentTick = 0) { return interruptTechniqueTransmissionForPlayerImpl(this, learnerPlayerId, reason, currentTick); }
 /**
* getSessionFence：读取当前运行态 session fencing 信息。
* @param playerId 玩家 ID。
* @returns 无返回值，完成 session fencing 信息读取。
*/

 getSessionFence(playerId) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  const sessionEpoch = Number.isFinite(player.sessionEpoch)
   ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
   : 0;
  return {
   runtimeOwnerId: typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
    ? player.runtimeOwnerId.trim()
    : null,
   sessionEpoch: sessionEpoch > 0 ? sessionEpoch : null,
  };
 }
 /**
  * 为已经由本节点安全接管的玩家补齐数据库 ownership fence。
  * 启动批量 restore 不在加载阶段调用；调用方必须先通过实例 lease/attach gate。
  */
 async ensureRuntimeOwnershipClaimed(playerId) {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  if (!normalizedPlayerId) {
   return null;
  }
  const player = this.getPlayer(normalizedPlayerId);
  if (!player) {
   return null;
  }
  const currentFence = this.getSessionFence(normalizedPlayerId);
  if (currentFence?.runtimeOwnerId && currentFence.sessionEpoch) {
   return currentFence;
  }
  if (
   !this.playerDomainPersistenceService?.isEnabled?.()
   || typeof this.playerDomainPersistenceService?.claimPlayerRuntimeOwnership !== 'function'
  ) {
   return currentFence;
  }

  const pendingClaim = this.runtimeOwnershipClaimPromiseByPlayerId.get(normalizedPlayerId);
  if (pendingClaim) {
   return pendingClaim;
  }
  const claimPromise = (async () => {
   const claimTarget = this.getPlayer(normalizedPlayerId);
   if (!claimTarget) {
    return null;
   }
   const fenceBeforeClaim = this.getSessionFence(normalizedPlayerId);
   if (fenceBeforeClaim?.runtimeOwnerId && fenceBeforeClaim.sessionEpoch) {
    return fenceBeforeClaim;
   }
   const presence = this.describePersistencePresence(normalizedPlayerId);
   const claimed = await this.playerDomainPersistenceService.claimPlayerRuntimeOwnership(
    normalizedPlayerId,
    {
     online: presence?.online === true,
     inWorld: presence?.inWorld === true,
     lastHeartbeatAt: presence?.lastHeartbeatAt ?? null,
     offlineSinceAt: presence?.offlineSinceAt ?? Date.now(),
     transferState: presence?.transferState ?? null,
     transferTargetNodeId: presence?.transferTargetNodeId ?? null,
     versionSeed: presence?.versionSeed ?? nextPlayerPersistenceVersion(),
    },
   );
   if (!claimed) {
    return this.getSessionFence(normalizedPlayerId);
   }
   const currentPlayer = this.getPlayer(normalizedPlayerId);
   if (!currentPlayer) {
    return null;
   }
   const ownerAfterClaim = typeof currentPlayer.runtimeOwnerId === 'string'
    ? currentPlayer.runtimeOwnerId.trim()
    : '';
   if (ownerAfterClaim) {
    // claim 等待 DB 时可能恰逢离线确认/顶号生成了新的本地 owner。DB claim 已占用 E+1，
    // 本地执行权必须再前进一代，后续 presence-first flush 才能以 E+2 安全胜出。
    currentPlayer.sessionEpoch = Math.max(
     Math.max(0, Math.trunc(Number(currentPlayer.sessionEpoch ?? 0))),
     claimed.sessionEpoch,
    ) + 1;
    const ownerSessionId = typeof currentPlayer.sessionId === 'string' && currentPlayer.sessionId.trim()
     ? currentPlayer.sessionId.trim()
     : 'offline-runtime';
    currentPlayer.runtimeOwnerId = buildRuntimeOwnerId(
     currentPlayer.playerId,
     ownerSessionId,
     currentPlayer.sessionEpoch,
    );
    markPlayerDirtyDomains(currentPlayer, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
    return this.getSessionFence(normalizedPlayerId);
   }
   currentPlayer.runtimeOwnerId = claimed.runtimeOwnerId;
   currentPlayer.sessionEpoch = claimed.sessionEpoch;
   markPlayerDirtyDomains(currentPlayer, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
   return this.getSessionFence(normalizedPlayerId);
  })();
  this.runtimeOwnershipClaimPromiseByPlayerId.set(normalizedPlayerId, claimPromise);
  try {
   return await claimPromise;
  } finally {
   if (this.runtimeOwnershipClaimPromiseByPlayerId.get(normalizedPlayerId) === claimPromise) {
    this.runtimeOwnershipClaimPromiseByPlayerId.delete(normalizedPlayerId);
   }
  }
 }
 /**
* describePersistencePresence：导出 presence 域所需的运行态投影。
* @param playerId 玩家 ID。
* @returns 无返回值，完成 presence 投影读取。
*/

 describePersistencePresence(playerId) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  this.rollbackExpiredTransfer(player);
  const sessionFence = this.getSessionFence(playerId);
  const online = typeof player.sessionId === 'string' && player.sessionId.trim().length > 0;
  return {
   online,
   inWorld: !isOfflineHangingRuntimeReadyForReap(player)
    && typeof player.templateId === 'string'
    && player.templateId.trim().length > 0,
   lastHeartbeatAt: Number.isFinite(player.lastHeartbeatAt)
    ? Math.trunc(Number(player.lastHeartbeatAt))
    : (online ? Date.now() : null),
   offlineSinceAt: online
    ? null
    : (Number.isFinite(player.offlineSinceAt) ? Math.trunc(Number(player.offlineSinceAt)) : Date.now()),
   runtimeOwnerId: sessionFence?.runtimeOwnerId ?? null,
   sessionEpoch: sessionFence?.sessionEpoch ?? null,
   transferState: typeof player.transferState === 'string' && player.transferState.trim()
    ? player.transferState.trim()
    : null,
   transferTargetNodeId: typeof player.transferTargetNodeId === 'string' && player.transferTargetNodeId.trim()
    ? player.transferTargetNodeId.trim()
    : null,
   transferStartedAt: Number.isFinite(player.transferStartedAt)
    ? Math.trunc(Number(player.transferStartedAt))
    : null,
   transferDeadlineAt: Number.isFinite(player.transferDeadlineAt)
    ? Math.trunc(Number(player.transferDeadlineAt))
    : null,
   versionSeed: nextPlayerPersistenceVersion(),
  };
 }
 /**
* markHeartbeat：更新玩家最后一次心跳时间。
* @param playerId 玩家 ID。
* @returns 无返回值，直接刷新心跳戳。
*/

 markHeartbeat(playerId) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return;
  }
  this.rollbackExpiredTransfer(player);
  player.lastHeartbeatAt = Date.now();
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
 }
 /**
* replaceInventoryItems：用已提交的新背包快照替换运行态。
* @param playerId 玩家 ID。
* @param items 新背包条目。
* @returns 无返回值，直接更新运行态背包。
*/

 replaceInventoryItems(playerId, items) { return replaceInventoryItemsImpl(this, playerId, items); }
 /**
* replaceWalletBalances：用已提交的钱包快照替换运行态。
* @param playerId 玩家 ID。
* @param balances 新钱包条目。
* @returns 无返回值，直接更新运行态钱包。
*/

 replaceWalletBalances(playerId, balances) {
  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  player.wallet = {
   balances: Array.isArray(balances)
    ? balances
     .map((entry) => ({
      walletType: normalizeWalletType(entry?.walletType),
      balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
      frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
      version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
     }))
     .filter((entry) => entry.walletType)
    : [],
  };
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['wallet']);
  this.bumpPersistentRevision(player);
  this.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }

 /**
  * 以背包货币真源刷新 wallet 投影，并在投影实际变化时推进 SelfDelta 修订。
  * 普通物品变化不会触发 selfRevision，避免为每次背包 patch 额外发送自身状态。
  */
 refreshWalletCacheFromInventory(player, changedItemId = null) {
  const changed = syncWalletCacheFromInventory(player, changedItemId);
  if (changed) {
   player.selfRevision += 1;
  }
  return changed;
 }
 /**
* replaceEquipmentSlots：用已提交的新装备快照替换运行态。
* @param playerId 玩家 ID。
* @param slots 新装备条目。
* @returns 无返回值，直接更新运行态装备。
*/

 replaceEquipmentSlots(playerId, slots) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  player.equipment.slots = normalizeEquipmentSlotsWithTemplates(slots, this.contentTemplateRepository);
  player.equipment.revision += 1;
  this.playerAttributesService.recalculate(player, 'equipment');
  markPlayerDirtyDomains(player, ['equipment', 'attr']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* getViewRadius：读取视图Radiu。
* @param playerId 玩家 ID。
* @returns 无返回值，完成视图Radiu的读取/组装。
*/

 getViewRadius(playerId) {

  const player = this.getPlayerOrThrow(playerId);
  return Math.max(1, Math.round(player.attrs.numericStats.viewRange));
 }
 /**
* gainRealmProgress：执行gainRealm进度相关逻辑。
* @param playerId 玩家 ID。
* @param amount 参数说明。
* @param options 选项参数。
* @returns 无返回值，直接更新gainRealm进度相关状态。
*/

 gainRealmProgress(playerId, amount, options = {}) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.gainRealmProgress(player, amount, options);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore);
 }
 /**
* gainFoundation：执行gainFoundation相关逻辑。
* @param playerId 玩家 ID。
* @param amount 参数说明。
* @returns 无返回值，直接更新gainFoundation相关状态。
*/

 gainFoundation(playerId, amount) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.gainFoundation(player, amount);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore);
 }
 /**
* gainCombatExp：执行gain战斗Exp相关逻辑。
* @param playerId 玩家 ID。
* @param amount 参数说明。
* @returns 无返回值，直接更新gain战斗Exp相关状态。
*/

 gainCombatExp(playerId, amount) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.gainCombatExp(player, amount);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore);
 }
 /**
* advanceProgressionTick：执行advance修炼进度tick相关逻辑。
* @param playerId 玩家 ID。
* @param elapsedTicks 参数说明。
* @param options 选项参数。
* @returns 无返回值，直接更新advance修炼进度tick相关状态。
*/

 advanceProgressionTick(playerId, elapsedTicks = 1, options = {}) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.advanceProgressionTick(player, elapsedTicks, options);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore);
 }
 /**
* advanceCultivation：执行advanceCultivation相关逻辑。
* @param playerId 玩家 ID。
* @param elapsedTicks 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新advanceCultivation相关状态。
*/

 advanceCultivation(playerId, elapsedTicks = 1, currentTick = 0, options: any = {}) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.advanceCultivation(player, elapsedTicks, {
   auraMultiplier: normalizeCultivationAuraMultiplier(options?.auraMultiplier),
   getInstanceRuntime: options?.getInstanceRuntime,
  });
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick);
 }
 /**
* grantMonsterKillProgress：执行grant怪物Kill进度相关逻辑。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新grant怪物Kill进度相关状态。
*/

 grantMonsterKillProgress(playerId, input, currentTick = 0) {

  const player = this.getPlayerOrThrow(playerId);
  const snapshotStartedAt = performance.now();
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  recordPlayerTickPerf(input, 'combat.playerMonsterKill.progressSnapshotMs', snapshotStartedAt);

  const progressionStartedAt = performance.now();
  const result = this.playerProgressionService.grantMonsterKillProgress(player, {
   ...input,
  });
  recordPlayerTickPerf(input, 'combat.playerMonsterKill.progressResolveMs', progressionStartedAt);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, false, input);
 }
 /**
* refreshProgressionPreview：执行refresh修炼进度Preview相关逻辑。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新refresh修炼进度Preview相关状态。
*/

 refreshProgressionPreview(playerId) {

  const player = this.getPlayerOrThrow(playerId);
  this.playerProgressionService.refreshPreview(player);
  return player;
 }
 /**
* handleHeavenGateAction：处理HeavenGateAction并更新相关状态。
* @param playerId 玩家 ID。
* @param action 参数说明。
* @param element 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新HeavenGateAction相关状态。
*/

 handleHeavenGateAction(playerId, action, element, currentTick = 0) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.handleHeavenGateAction(player, action, element);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, true);
 }
 /**
* attemptBreakthrough：执行attemptBreakthrough相关逻辑。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新attemptBreakthrough相关状态。
*/

 attemptBreakthrough(playerId, currentTick = 0) {

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);

  const result = this.playerProgressionService.attemptBreakthrough(player);
  const applied = this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, true);
  this.ensureArtifactUnlockState(player);
  return applied;
 }
 /** 凝练根基。 */
 refineRootFoundation(playerId, currentTick = 0) {
  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  const result = this.playerProgressionService.refineRootFoundation(player);
  return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, true);
 }
 /**
* syncFromWorldView：处理From世界视图并更新相关状态。
* @param playerId 玩家 ID。
* @param sessionId session ID。
* @param view 参数说明。
* @returns 无返回值，直接更新From世界视图相关状态。
*/

 syncFromWorldView(playerId, sessionId, view) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.ensurePlayer(playerId, sessionId);

  let anchorChanged = false;
  let selfChanged = false;
  if (player.instanceId !== view.instance.instanceId) {
   player.instanceId = view.instance.instanceId;
   anchorChanged = true;
  }
  if (player.templateId !== view.instance.templateId) {
   player.templateId = view.instance.templateId;
   anchorChanged = true;
  }
  if (player.x !== view.self.x) {
   player.x = view.self.x;
   anchorChanged = true;
  }
  if (player.y !== view.self.y) {
   player.y = view.self.y;
   anchorChanged = true;
  }
  const nextFacing = normalizeHorizontalFacing(view.self.facing, player.facing);
  if (player.facing !== nextFacing) {
   player.facing = nextFacing;
   anchorChanged = true;
  }
  const nextFengShuiLuck = Math.trunc(Number(view.self.fengShuiLuck ?? 0) || 0);
  if (Math.trunc(Number(player.fengShuiLuck ?? 0) || 0) !== nextFengShuiLuck) {
   player.fengShuiLuck = nextFengShuiLuck;
   selfChanged = true;
   this.playerAttributesService.recalculate(player, 'feng_shui_luck');
   markPlayerDirtyDomains(player, ['attr']);
  }
  if (anchorChanged) {
   markPlayerDirtyDomains(player, ['world_anchor', 'position_checkpoint']);
   this.bumpPersistentRevision(player);
  }
  if (anchorChanged || selfChanged) {
   player.selfRevision += 1;
  }
  return player;
 }

 /** 从实例 tick 的权威位置同步玩家世界锚点，供自动任务下一息使用。 */
 syncWorldAnchorFromInstanceTick(playerId, input) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }

  let anchorChanged = false;
  if (player.instanceId !== input.instanceId) {
   player.instanceId = input.instanceId;
   anchorChanged = true;
  }
  if (player.templateId !== input.templateId) {
   player.templateId = input.templateId;
   anchorChanged = true;
  }
  if (player.x !== input.x) {
   player.x = input.x;
   anchorChanged = true;
  }
  if (player.y !== input.y) {
   player.y = input.y;
   anchorChanged = true;
  }
  if (input.facing !== undefined) {
   const nextFacing = normalizeHorizontalFacing(input.facing, player.facing);
   if (player.facing !== nextFacing) {
    player.facing = nextFacing;
    anchorChanged = true;
   }
  }
  if (anchorChanged) {
   markPlayerDirtyDomains(player, ['world_anchor', 'position_checkpoint']);
   this.bumpPersistentRevision(player);
   player.selfRevision += 1;
  }
  return player;
 }

 /** 离线挂机恢复后从世界视图同步位置/上下文，保留已认领的运行态 ownership。 */
 syncOfflineFromWorldView(playerId, view) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  player.sessionId = null;
  player.lastHeartbeatAt = null;
  let anchorChanged = false;
  let selfChanged = false;
  if (player.instanceId !== view.instance.instanceId) {
   player.instanceId = view.instance.instanceId;
   anchorChanged = true;
  }
  if (player.templateId !== view.instance.templateId) {
   player.templateId = view.instance.templateId;
   anchorChanged = true;
  }
  if (player.x !== view.self.x) {
   player.x = view.self.x;
   anchorChanged = true;
  }
  if (player.y !== view.self.y) {
   player.y = view.self.y;
   anchorChanged = true;
  }
  const nextFacing = normalizeHorizontalFacing(view.self.facing, player.facing);
  if (player.facing !== nextFacing) {
   player.facing = nextFacing;
   anchorChanged = true;
  }
  const nextFengShuiLuck = Math.trunc(Number(view.self.fengShuiLuck ?? 0) || 0);
  if (Math.trunc(Number(player.fengShuiLuck ?? 0) || 0) !== nextFengShuiLuck) {
   player.fengShuiLuck = nextFengShuiLuck;
   selfChanged = true;
   this.playerAttributesService.recalculate(player, 'feng_shui_luck');
   markPlayerDirtyDomains(player, ['attr']);
  }
  if (anchorChanged) {
   markPlayerDirtyDomains(player, ['world_anchor', 'position_checkpoint']);
   this.bumpPersistentRevision(player);
  }
  if (anchorChanged || selfChanged) {
   player.selfRevision += 1;
  }
  return player;
 }
 /**
* setContextActions：写入上下文Action。
* @param playerId 玩家 ID。
* @param actions 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新上下文Action相关状态。
*/

 setContextActions(playerId, actions, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = actions
   .slice()
   .sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
  if (isSameActionList(player.actions.contextActions, normalized)) {
   return player;
  }
  player.actions.contextActions = normalized;
  this.rebuildActionState(player, resolvePlayerRuntimeTick(player, currentTick));
  return player;
 }
 /**
* setVitals：写入Vital。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新Vital相关状态。
*/

 setVitals(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  let changed = false;
  if (Number.isFinite(input.maxHp) && player.maxHp !== Math.max(1, Math.trunc(input.maxHp ?? player.maxHp))) {
   player.maxHp = Math.max(1, Math.trunc(input.maxHp ?? player.maxHp));
   if (player.hp > player.maxHp) {
    player.hp = player.maxHp;
   }
   changed = true;
  }
  if (Number.isFinite(input.maxQi) && player.maxQi !== Math.max(0, Math.trunc(input.maxQi ?? player.maxQi))) {
   player.maxQi = Math.max(0, Math.trunc(input.maxQi ?? player.maxQi));
   if (player.qi > player.maxQi) {
    player.qi = player.maxQi;
   }
   changed = true;
  }
  if (Number.isFinite(input.hp)) {

   const nextHp = clamp(Math.trunc(input.hp ?? player.hp), 0, player.maxHp);
   if (player.hp !== nextHp) {
    player.hp = nextHp;
    changed = true;
   }
  }
  if (Number.isFinite(input.qi)) {

   const nextQi = clamp(Math.trunc(input.qi ?? player.qi), 0, player.maxQi);
   if (player.qi !== nextQi) {
    player.qi = nextQi;
    changed = true;
   }
  }
  if (changed) {
   markPlayerDirtyDomains(player, ['vitals']);
   this.bumpPersistentRevision(player);
   player.selfRevision += 1;
  }
  return player;
 }
 /**
* grantItem：执行grant道具相关逻辑。
* @param playerId 玩家 ID。
* @param itemId 道具 ID。
* @param count 数量。
* @returns 无返回值，直接更新grant道具相关状态。
*/

 grantItem(playerId, itemId, count = 1) { return grantItemImpl(this, playerId, itemId, count); }
 /**
* setDailySignInFortuneLuck：设置每日签运临时幸运，过期后读取端自动忽略。
* @param playerId 玩家 ID。
* @param luckDelta 临时幸运变化量。
* @param expireAtMs 过期时间戳。
* @returns 是否改变了运行态。
*/

 setDailySignInFortuneLuck(playerId, luckDelta, expireAtMs) {
  const player = this.getPlayerOrThrow(playerId);
  const normalizedLuckDelta = Math.trunc(Number(luckDelta) || 0);
  const normalizedExpireAtMs = Math.max(0, Math.trunc(Number(expireAtMs) || 0));
  const nowMs = Date.now();
  const nextLuck = normalizedExpireAtMs > nowMs ? normalizedLuckDelta : 0;
  const nextExpireAtMs = nextLuck !== 0 ? normalizedExpireAtMs : 0;
  const currentLuck = Math.trunc(Number(player.dailySignInFortuneLuck ?? 0) || 0);
  const currentExpireAtMs = Math.max(0, Math.trunc(Number(player.dailySignInFortuneExpireAt ?? 0) || 0));
  if (currentLuck === nextLuck && currentExpireAtMs === nextExpireAtMs) {
   return false;
  }
  player.dailySignInFortuneLuck = nextLuck;
  player.dailySignInFortuneExpireAt = nextExpireAtMs;
  const attrChanged = this.playerAttributesService.recalculate(player, 'fortune');
  if (!attrChanged) {
   this.playerAttributesService.markPanelDirty(player);
  }
  markPlayerDirtyDomains(player, ['attr']);
  return true;
 }
 /**
* getWalletBalanceByType：读取指定钱包类型余额。
* @param playerId 玩家 ID。
* @param walletType 钱包类型。
* @returns 无返回值，完成钱包余额读取/组装。
*/

 getWalletBalanceByType(playerId, walletType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  const normalizedWalletType = normalizeWalletType(walletType);
  if (!normalizedWalletType) {
   return 0;
  }
  return readInventoryItemCount(player, normalizedWalletType);
 }
 /**
* canAffordWallet：判断钱包余额是否足够。
* @param playerId 玩家 ID。
* @param walletType 钱包类型。
* @param amount 数量。
* @returns 无返回值，完成钱包余额条件判断。
*/

 canAffordWallet(playerId, walletType, amount) {
  const player = this.getPlayerOrThrow(playerId);
  const normalizedWalletType = normalizeWalletType(walletType);
  const normalizedAmount = Math.max(0, Math.trunc(amount || 0));
  if (!normalizedWalletType || normalizedAmount <= 0) {
   return true;
  }
  return readInventoryItemCount(player, normalizedWalletType) >= normalizedAmount;
 }
 /**
* creditWallet：执行wallet加余额相关逻辑。
* @param playerId 玩家 ID。
* @param walletType 钱包类型。
* @param amount 数量。
* @returns 无返回值，直接更新wallet相关状态。
*/

 creditWallet(playerId, walletType, amount = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  const normalizedWalletType = normalizeWalletType(walletType);
  const normalizedAmount = Math.max(0, Math.trunc(amount));
  if (!normalizedWalletType || normalizedAmount <= 0) {
   return player;
  }
  const item = this.contentTemplateRepository.createItem(normalizedWalletType, normalizedAmount);
  if (!item) {
   throw new NotFoundException(`钱包物品不存在：${normalizedWalletType}`);
  }
  const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
  if (existing) {
   const newCount = existing.count + item.count;
   if (newCount > MAX_ITEM_COUNT) {
    this.logger.warn(`物品数量达到上限 [playerId=${player.id}, itemId=${item.itemId}, attempted=${newCount}, capped=${MAX_ITEM_COUNT}]`);
   }
   existing.count = Math.min(newCount, MAX_ITEM_COUNT);
  } else {
   player.inventory.items.push(item);
  }
  player.inventory.revision += 1;
  this.refreshWalletCacheFromInventory(player, item.itemId);
  this.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  this.bumpPersistentRevision(player);
  this.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }
 /**
* debitWallet：执行wallet扣余额相关逻辑。
* @param playerId 玩家 ID。
* @param walletType 钱包类型。
* @param amount 数量。
* @returns 无返回值，直接更新wallet相关状态。
*/

 debitWallet(playerId, walletType, amount = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  const normalizedWalletType = normalizeWalletType(walletType);
  const normalizedAmount = Math.max(0, Math.trunc(amount));
  if (!normalizedWalletType || normalizedAmount <= 0) {
   return player;
  }
  const inventoryBalance = readInventoryItemCount(player, normalizedWalletType);
  if (inventoryBalance < normalizedAmount) {
   throw new NotFoundException(`${normalizedWalletType} 余额不足`);
  }
  consumeInventoryItemCount(player.inventory.items, normalizedWalletType, normalizedAmount);
  player.inventory.revision += 1;
  this.refreshWalletCacheFromInventory(player, normalizedWalletType);
  this.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['inventory']);
  this.bumpPersistentRevision(player);
  this.recordAssetStatisticMutation(player, statisticBefore);
  return player;
 }
 /**
* getInventoryCountByItemId：读取背包数量By道具ID。
* @param playerId 玩家 ID。
* @param itemId 道具 ID。
* @returns 无返回值，完成背包数量By道具ID的读取/组装。
*/

 getInventoryCountByItemId(playerId, itemId) { return getInventoryCountByItemIdImpl(this, playerId, itemId); }
 /**
* canReceiveInventoryItem：判断Receive背包道具是否满足条件。
* @param playerId 玩家 ID。
* @param item 待入包物品。
* @returns 无返回值，完成Receive背包道具的条件判断。
*/

 canReceiveInventoryItem(playerId, item) { return canReceiveInventoryItemImpl(this, playerId, item); }
 /** 同步校验容量并入包，供击杀掉落避免重复规范化和重复堆叠扫描。 */
 tryReceiveInventoryItem(playerId, item, options: any = {}) { return tryReceiveInventoryItemImpl(this, playerId, item, options); }
 /**
* peekInventoryItem：执行peek背包道具相关逻辑。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @returns 无返回值，直接更新peek背包道具相关状态。
*/

 peekInventoryItem(playerId, slotIndex) { return peekInventoryItemImpl(this, playerId, slotIndex); }
 /**
* peekInventoryItemByInstanceId：按稳定实例 ID 读取背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @returns 背包物品或 null。
*/

 peekInventoryItemByInstanceId(playerId, itemInstanceId) { return peekInventoryItemByInstanceIdImpl(this, playerId, itemInstanceId); }
 /**
* peekEquippedItem：执行peekEquipped道具相关逻辑。
* @param playerId 玩家 ID。
* @param slot 参数说明。
* @returns 无返回值，直接更新peekEquipped道具相关状态。
*/

 peekEquippedItem(playerId, slot) { return peekEquippedItemImpl(this, playerId, slot); }
 /** 确保法宝槽结构完整，并按历史最高境界永久解锁。 */
 ensureArtifactUnlockState(player, options = undefined) { return ensureArtifactUnlockStateImpl(this, player, options); }
 /** 刷新玩家移动能力投影；装备、法宝、buff 等来源不直接进入移动裁定。 */
 refreshMovementCapabilities(player, emitSelfDelta = true) {
  const changed = refreshPlayerMovementCapabilities(player);
  if (changed && emitSelfDelta === true) {
   player.selfRevision += 1;
  }
  return changed;
 }
 /**
* getTechniqueName：读取功法名称。
* @param playerId 玩家 ID。
* @param techId tech ID。
* @returns 无返回值，完成功法名称的读取/组装。
*/

 getTechniqueName(playerId, techId) { return getTechniqueNameImpl(this, playerId, techId); }
 /**
* listQuests：读取任务并返回结果。
* @param playerId 玩家 ID。
* @returns 无返回值，完成任务的读取/组装。
*/

 listQuests(playerId) {

  const player = this.getPlayerOrThrow(playerId);
  return player.quests.quests;
 }
 /**
* getPendingLogbookMessages：读取待处理LogbookMessage。
* @param playerId 玩家 ID。
* @returns 无返回值，完成PendingLogbookMessage的读取/组装。
*/

 getPendingLogbookMessages(playerId) {

  const player = this.getPlayerOrThrow(playerId);
  return player.pendingLogbookMessages.map(clonePendingLogbookMessage);
 }
 /**
* getLegacyPendingLogbookMessages：读取Legacy待处理LogbookMessage。
* @param playerId 玩家 ID。
* @returns 无返回值，完成LegacyPendingLogbookMessage的读取/组装。
*/

 getLegacyPendingLogbookMessages(playerId) {
  return this.getPendingLogbookMessages(playerId);
 }
 /**
* queuePendingLogbookMessage：执行queue待处理LogbookMessage相关逻辑。
* @param playerId 玩家 ID。
* @param message 参数说明。
* @returns 无返回值，直接更新queuePendingLogbookMessage相关状态。
*/

 queuePendingLogbookMessage(playerId, message) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  this.rollbackExpiredTransfer(player);
  if (player.transferWriteBlocked) {
   return player;
  }

  const normalized = normalizePendingLogbookMessage(message);
  if (!normalized) {
   return player;
  }

  const next = player.pendingLogbookMessages.slice();

  const existingIndex = next.findIndex((entry) => entry.id === normalized.id);
  if (existingIndex >= 0) {
   next[existingIndex] = normalized;
  }
  else {
   next.push(normalized);
  }

  const limited = next.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
  if (isSamePendingLogbookMessages(player.pendingLogbookMessages, limited)) {
   return player;
  }
  player.pendingLogbookMessages = limited;
  markPlayerDirtyDomains(player, ['logbook']);
  this.bumpPersistentRevision(player);
  void this.persistLogbookMessages(player).catch((error) => {
   console.warn(`日志本直写失败：${error instanceof Error ? error.message : String(error)}`);
  });
  return player;
 }
 /**
* queueLegacyPendingLogbookMessage：执行queueLegacy待处理LogbookMessage相关逻辑。
* @param playerId 玩家 ID。
* @param message 参数说明。
* @returns 无返回值，直接更新queueLegacyPendingLogbookMessage相关状态。
*/

 queueLegacyPendingLogbookMessage(playerId, message) {
  return this.queuePendingLogbookMessage(playerId, message);
 }
 /**
* deferVitalRecoveryUntilTick：执行deferVitalRecoveryUntiltick相关逻辑。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新deferVitalRecoveryUntiltick相关状态。
*/

 deferVitalRecoveryUntilTick(playerId, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalizedTick = Number.isFinite(currentTick) ? Math.max(0, Math.trunc(currentTick)) : 0;
  if ((player.vitalRecoveryDeferredUntilTick ?? -1) >= normalizedTick) {
   return player;
  }
  player.vitalRecoveryDeferredUntilTick = normalizedTick;
  return player;
 }
 /**
* suppressVitalRecoveryUntilTick：执行suppressVitalRecoveryUntiltick相关逻辑。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新suppressVitalRecoveryUntiltick相关状态。
*/

 suppressVitalRecoveryUntilTick(playerId, currentTick) {
  return this.deferVitalRecoveryUntilTick(playerId, currentTick);
 }
 /**
* acknowledgePendingLogbookMessages：执行acknowledge待处理LogbookMessage相关逻辑。
* @param playerId 玩家 ID。
* @param ids 参数说明。
* @returns 无返回值，直接更新acknowledgePendingLogbookMessage相关状态。
*/

 acknowledgePendingLogbookMessages(playerId, ids) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  this.rollbackExpiredTransfer(player);
  if (player.transferWriteBlocked) {
   return player;
  }
  if (ids.length === 0 || player.pendingLogbookMessages.length === 0) {
   return player;
  }

  const idSet = new Set(ids
   .filter((entry) => typeof entry === 'string')
   .map((entry) => entry.trim())
   .filter((entry) => entry.length > 0));
  if (idSet.size === 0) {
   return player;
  }

  const next = player.pendingLogbookMessages.filter((entry) => !idSet.has(entry.id));
  if (next.length === player.pendingLogbookMessages.length) {
   return player;
  }
  player.pendingLogbookMessages = next;
  markPlayerDirtyDomains(player, ['logbook']);
  this.bumpPersistentRevision(player);
  void this.persistLogbookMessages(player).catch((error) => {
   console.warn(`日志本直写失败：${error instanceof Error ? error.message : String(error)}`);
  });
  return player;
 }
 /**
* ackLegacyPendingLogbookMessages：执行ackLegacy待处理LogbookMessage相关逻辑。
* @param playerId 玩家 ID。
* @param ids 参数说明。
* @returns 无返回值，直接更新ackLegacyPendingLogbookMessage相关状态。
*/

 ackLegacyPendingLogbookMessages(playerId, ids) {
  return this.acknowledgePendingLogbookMessages(playerId, ids);
 }
 /**
* markQuestStateDirty：处理任务状态Dirty并更新相关状态。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新任务状态Dirty相关状态。
*/

 markQuestStateDirty(playerId) {

  const player = this.getPlayerOrThrow(playerId);
  player.quests.revision += 1;
  markPlayerDirtyDomains(player, ['quest']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* enqueueNotice：处理Notice并更新相关状态。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新Notice相关状态。
*/

 enqueueNotice(playerId, input) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  this.rollbackExpiredTransfer(player);
  if (player.transferWriteBlocked) {
   return player;
  }

  const rawText = input.text.trim();
  const text = input.kind === 'combat' && input.combat ? 'combat' : rawText;
  if (!text) {
   return player;
  }
  const notice = {
   id: player.notices.nextId,
   kind: input.kind,
   text,
   ...(input.castId ? { castId: input.castId } : undefined),
   ...(input.combat ? { combat: input.combat } : undefined),
   ...(input.structured ? { structured: input.structured } : undefined),
  };
  player.notices.nextId += 1;
  if (player.transferState === 'in_transfer') {
   this.appendBoundedNoticeBuffer(player.transferBufferedNotices, notice);
   return player;
  }
  // 委托给 EventBus（如果可用），否则回退到本地队列
  if (this.runtimeEventBusService) {
   this.runtimeEventBusService.queuePlayerNotice(playerId, notice);
  } else {
   // 进入 fallback 路径意味着 NestJS 注入缺失或运行在非 NestJS 测试 harness 中。
   // 真实生产场景已由 onModuleInit 在启动期 fail-fast，此处仅为 smoke/单测兜底。
   this.warnNoticeFallbackOnce();
   this.appendBoundedNoticeBuffer(player.notices.queue, notice);
  }
  return player;
 }
 /**
  * 启动期 fail-fast：NestJS 应用进入 onModuleInit 时 RuntimeEventBusService 必须已经
  * 注入完成，否则后续所有通知都会落到 fallback 队列，触发 M4 描述的隐性兜底缺陷。
  * 测试 harness 通过 new 直接构造时不会触发 NestJS 生命周期，依旧保留 fallback 行为。
  */
 onModuleInit() {
  if (!this.runtimeEventBusService) {
   throw new Error('PlayerRuntimeService requires RuntimeEventBusService to be injected at application startup');
  }
 }
 /** 隔离 payload 未经核对前不能加载玩家，否则新运行态会覆盖待修复资产证据。 */
 async assertPlayerAssetFlushNotQuarantined(playerId) {
  if (typeof this.flushLedgerService?.isPlayerFlushAssetConflictQuarantined !== 'function') {
   return;
  }
  if (!await this.flushLedgerService.isPlayerFlushAssetConflictQuarantined(playerId)) {
   return;
  }
  try {
   const attempted = await this.tryRepairDetachedPlayerAssetFlushQuarantine(playerId);
   if (attempted && !await this.flushLedgerService.isPlayerFlushAssetConflictQuarantined(playerId)) {
    return;
   }
  }
  catch (error) {
   this.logger.error(
    `离线挂机玩家登录资产隔离恢复失败：playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`,
   );
  }
  throw new ServiceUnavailableException(`player_asset_flush_quarantined:${playerId}`);
 }
 /**
  * 登录恢复只处理仍由本进程托管、且尚未绑定在线 session 的玩家。
  * 资产锁覆盖数据库核对和运行时 ID 换发，避免等待 IO 时与装备、丢弃等资产操作交错。
  */
 async tryRepairDetachedPlayerAssetFlushQuarantine(playerId) {
  const repair = this.flushLedgerService?.repairPlayerFlushAssetConflictQuarantines;
  const initialPlayer = this.players.get(playerId);
  if (typeof repair !== 'function' || !isDetachedPlayerRuntime(initialPlayer)) {
   return false;
  }
  await this.runExclusiveAssetMutation([playerId], async () => {
   const player = this.players.get(playerId);
   if (!isDetachedPlayerRuntime(player)) {
    throw new Error('player_asset_flush_runtime_became_active');
   }
   const runtimeInventoryItems = Array.isArray(player.inventory?.items)
    ? player.inventory.items.map((item) => ({
     itemInstanceId: item?.itemInstanceId,
     itemId: item?.itemId,
     count: item?.count,
     name: item?.name,
     desc: item?.desc,
     enhanceLevel: item?.enhanceLevel,
     learnTechniqueId: item?.learnTechniqueId,
     learnTechniqueMaxLevel: item?.learnTechniqueMaxLevel,
     grade: item?.grade,
     level: item?.level,
     rawPayload: item?.rawPayload && typeof item.rawPayload === 'object'
      ? { ...item.rawPayload }
      : item?.rawPayload,
     lockedBy: item?.lockedBy,
    }))
    : [];
   const summary = await repair.call(this.flushLedgerService, playerId, {
    allowOfflineFenceRebase: true,
    logUnresolved: false,
    runtimeInventoryItems,
   });
   const remaps = Array.isArray(summary?.repairs)
    ? summary.repairs.filter((entry) => entry?.playerId === playerId)
    : [];
   if (remaps.length === 0) {
    return;
   }
   let changed = false;
   for (const remap of remaps) {
    const matches = player.inventory.items.filter((item) => (
     item?.itemInstanceId === remap.previousItemInstanceId
     && item?.itemId === remap.itemId
    ));
    if (matches.length === 0) {
     throw new Error(`player_asset_flush_runtime_remap_missing:${remap.previousItemInstanceId}`);
    }
    for (const item of matches) {
     item.itemInstanceId = remap.nextItemInstanceId;
     if (item.rawPayload && typeof item.rawPayload === 'object'
      && Object.prototype.hasOwnProperty.call(item.rawPayload, 'itemInstanceId')) {
      item.rawPayload.itemInstanceId = remap.nextItemInstanceId;
     }
    }
    changed = true;
   }
   if (changed) {
    player.inventory.revision += 1;
    markPlayerDirtyDomains(player, ['inventory']);
    this.bumpPersistentRevision(player);
   }
   this.logger.warn(
    `离线挂机玩家登录前已同步资产冲突换号：playerId=${playerId} remaps=${remaps.length}`,
   );
  });
  return true;
 }
 /** 仅在测试 harness 缺失 RuntimeEventBusService 时打印一次警告，避免每条通知刷屏。 */
 warnNoticeFallbackOnce() {
  if (this.noticeFallbackWarned) {
   return;
  }
  this.noticeFallbackWarned = true;
  console.warn('玩家运行时服务通知缺失运行时事件总线服务，已退回到玩家本地受限队列。生产环境应在启动期快速失败。');
 }
 /**
  * 受限缓冲区追加：与 RuntimeEventBusService.queuePlayerNotice 对齐，
  * 上限 MAX_NOTICES_PER_PLAYER，超限时按 NOTICE_KIND_PRIORITY 丢弃最低优先级条目，
  * 确保 transferBufferedNotices 与 fallback 队列在 ≤120s 转移窗口内不会无界增长。
  */
 appendBoundedNoticeBuffer(queue, notice) {
  if (!Array.isArray(queue)) {
   return;
  }
  if (queue.length >= MAX_NOTICES_PER_PLAYER) {
   const incomingPriority = NOTICE_KIND_PRIORITY[notice?.kind ?? 'info'] ?? 0;
   const dropIndex = findLowestPriorityNoticeIndex(queue);
   const droppedPriority = NOTICE_KIND_PRIORITY[queue[dropIndex]?.kind ?? 'info'] ?? 0;
   if (incomingPriority < droppedPriority) {
    // 新通知比现有最低优先级还低：直接丢弃新通知，保留旧条目。
    return;
   }
   queue.splice(dropIndex, 1);
  }
  queue.push(notice);
 }
 /**
* drainNotices：执行drainNotice相关逻辑。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新drainNotice相关状态。
*/

 drainNotices(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  // 优先从 EventBus drain
  if (this.runtimeEventBusService) {
   const result = this.runtimeEventBusService.drainPlayer(playerId);
   return result?.notices ?? [];
  }
  // 回退到本地队列
  const player = this.getPlayerOrThrow(playerId);
  if (player.notices.queue.length === 0) {
   return [];
  }

  const queue = player.notices.queue;
  player.notices.queue = [];
  return queue;
 }
 /**
* splitInventoryItem：处理背包道具并更新相关状态。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @param count 数量。
* @returns 无返回值，直接更新背包道具相关状态。
*/

 splitInventoryItem(playerId, slotIndex, count = 1) { return splitInventoryItemImpl(this, playerId, slotIndex, count); }
 /**
* splitInventoryItemByInstanceId：按稳定实例 ID 拆出背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @param count 数量。
* @returns 拆出的物品快照。
*/

 splitInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) { return splitInventoryItemByInstanceIdImpl(this, playerId, itemInstanceId, count); }
 /**
* receiveInventoryItem：执行receive背包道具相关逻辑。
* @param playerId 玩家 ID。
* @param item 道具。
* @returns 无返回值，直接更新receive背包道具相关状态。
*/

 receiveInventoryItem(playerId, item, options: any = {}) { return receiveInventoryItemImpl(this, playerId, item, options); }
 /** 应用已规范化的入包结果；knownMergeIndex 只由同一同步调用栈内的容量检查提供。 */
 applyNormalizedInventoryReceipt(player, normalized, statisticBefore, options: any = {}, knownMergeIndex = null) { return applyNormalizedInventoryReceiptImpl(this, player, normalized, statisticBefore, options, knownMergeIndex); }
 /**
* useItem：执行use道具相关逻辑。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @returns 无返回值，直接更新use道具相关状态。
*/

 useItem(playerId, slotIndex) { return useItemImpl(this, playerId, slotIndex); }
 /**
* useItemByInstanceId：按稳定实例 ID 使用背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @returns 玩家运行态。
*/

 useItemByInstanceId(playerId, itemInstanceId) { return useItemByInstanceIdImpl(this, playerId, itemInstanceId); }
 /**
* consumeInventoryItem：执行consume背包道具相关逻辑。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @param count 数量。
* @returns 无返回值，直接更新consume背包道具相关状态。
*/

 consumeInventoryItem(playerId, slotIndex, count = 1) { return consumeInventoryItemImpl(this, playerId, slotIndex, count); }
 /**
* consumeInventoryItemByInstanceId：按稳定实例 ID 消耗背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @param count 数量。
* @returns 玩家运行态。
*/

 consumeInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) { return consumeInventoryItemByInstanceIdImpl(this, playerId, itemInstanceId, count); }
 /**
* consumeInventoryItemByItemId：执行consume背包道具By道具ID相关逻辑。
* @param playerId 玩家 ID。
* @param itemId 道具 ID。
* @param count 数量。
* @returns 无返回值，直接更新consume背包道具By道具ID相关状态。
*/

 consumeInventoryItemByItemId(playerId, itemId, count = 1) { return consumeInventoryItemByItemIdImpl(this, playerId, itemId, count); }
 /**
* destroyInventoryItem：执行destroy背包道具相关逻辑。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @param count 数量。
* @returns 无返回值，直接更新destroy背包道具相关状态。
*/

 destroyInventoryItem(playerId, slotIndex, count = 1) { return destroyInventoryItemImpl(this, playerId, slotIndex, count); }
 /**
* destroyInventoryItemByInstanceId：按稳定实例 ID 摧毁背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @param count 数量。
* @returns 被摧毁的物品快照。
*/

 destroyInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) { return destroyInventoryItemByInstanceIdImpl(this, playerId, itemInstanceId, count); }
 /**
* sortInventory：执行sort背包相关逻辑。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新sort背包相关状态。
*/

 sortInventory(playerId) { return sortInventoryImpl(this, playerId); }
 /**
* unlockMap：执行unlock地图相关逻辑。
* @param playerId 玩家 ID。
* @param mapId 地图 ID。
* @returns 无返回值，直接更新unlock地图相关状态。
*/

 unlockMap(playerId, mapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  if (player.unlockedMapIds.includes(mapId)) {
   const mapName = resolvePlayerFacingContentName(
    mapId,
    '未知地图',
    this.mapTemplateRepository.has(mapId) ? this.mapTemplateRepository.getOrThrow(mapId).name : undefined,
   );
   throw new NotFoundException(`${mapName}已经解锁`);
  }
  player.unlockedMapIds = [...player.unlockedMapIds, mapId]
   .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  markPlayerDirtyDomains(player, ['map_unlock']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* hasUnlockedMap：判断Unlocked地图是否满足条件。
* @param playerId 玩家 ID。
* @param mapId 地图 ID。
* @returns 无返回值，完成Unlocked地图的条件判断。
*/

 hasUnlockedMap(playerId, mapId) {
  return this.getPlayerOrThrow(playerId).unlockedMapIds.includes(mapId);
 }
 /**
* bindRespawnPoint：绑定玩家复活点。
* @param playerId 玩家 ID。
* @param mapId 地图 ID。
* @returns 返回是否发生变化。
*/

 bindRespawnPoint(playerId, mapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
  if (!normalizedMapId) {
   throw new BadRequestException('复活绑定地图 ID 不能为空');
  }
  const template = this.mapTemplateRepository.getOrThrow(normalizedMapId);
  const player = this.getPlayerOrThrow(playerId);
  const nextInstanceId = buildPublicPlayerInstanceId(normalizedMapId);
  const nextX = Number.isFinite(template.spawnX) ? Math.trunc(template.spawnX) : 0;
  const nextY = Number.isFinite(template.spawnY) ? Math.trunc(template.spawnY) : 0;
  const changed = player.respawnTemplateId !== normalizedMapId
   || player.respawnInstanceId !== nextInstanceId
   || player.respawnX !== nextX
   || player.respawnY !== nextY;
  if (!changed) {
   return false;
  }
  player.respawnTemplateId = normalizedMapId;
  player.respawnInstanceId = nextInstanceId;
  player.respawnX = nextX;
  player.respawnY = nextY;
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['world_anchor']);
  this.bumpPersistentRevision(player);
  return true;
 }
 bindRespawnPointToPlacement(playerId, placement) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedMapId = typeof placement?.templateId === 'string' ? placement.templateId.trim() : '';
  const normalizedInstanceId = normalizePlayerPlacementInstanceId(placement?.instanceId);
  if (!normalizedMapId) {
   throw new BadRequestException('复活绑定地图 ID 不能为空');
  }
  if (!normalizedInstanceId) {
   throw new BadRequestException('复活绑定实例 ID 不能为空');
  }
  const template = this.mapTemplateRepository.getOrThrow(normalizedMapId);
  const player = this.getPlayerOrThrow(playerId);
  const nextX = Number.isFinite(placement?.x)
   ? Math.trunc(Number(placement.x))
   : (Number.isFinite(template.spawnX) ? Math.trunc(template.spawnX) : 0);
  const nextY = Number.isFinite(placement?.y)
   ? Math.trunc(Number(placement.y))
   : (Number.isFinite(template.spawnY) ? Math.trunc(template.spawnY) : 0);
  const changed = player.respawnTemplateId !== normalizedMapId
   || player.respawnInstanceId !== normalizedInstanceId
   || player.respawnX !== nextX
   || player.respawnY !== nextY;
  if (!changed) {
   return false;
  }
  player.respawnTemplateId = normalizedMapId;
  player.respawnInstanceId = normalizedInstanceId;
  player.respawnX = nextX;
  player.respawnY = nextY;
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['world_anchor']);
  this.bumpPersistentRevision(player);
  return true;
 }
 async persistWallet(player) {
  if (isFlushTaskConsumerMode()) {
   return;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return;
  }
  const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
  if (!playerId) {
   return;
  }
  await this.playerDomainPersistenceService.savePlayerWallet(playerId, Array.isArray(player.wallet?.balances) ? player.wallet.balances : [], {
   versionSeed: nextPlayerPersistenceVersion(),
  });
 }
 /**
* persistLogbookMessages：执行persist日志本Messages相关逻辑。
* @param player 玩家对象。
* @returns 无返回值，直接更新persist日志本Messages相关状态。
*/

 async persistLogbookMessages(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (isFlushTaskConsumerMode()) {
   return;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return;
  }
  const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
  if (!playerId) {
   return;
  }
  await this.playerDomainPersistenceService.savePlayerLogbookMessages(playerId, [...(player.pendingLogbookMessages ?? [])], {
   versionSeed: nextPlayerPersistenceVersion(),
  });
 }
 /**
* equipItem：执行equip道具相关逻辑。
* @param playerId 玩家 ID。
* @param slotIndex 参数说明。
* @returns 无返回值，直接更新equip道具相关状态。
*/

 equipItem(playerId, slotIndex, expectedItemInstanceId?: string) { return equipItemImpl(this, playerId, slotIndex, expectedItemInstanceId); }
 /**
* equipItemByInstanceId：按稳定实例 ID 装备背包物品。
* @param playerId 玩家 ID。
* @param itemInstanceId 物品实例 ID。
* @returns 玩家运行态。
*/

 equipItemByInstanceId(playerId, itemInstanceId) { return equipItemByInstanceIdImpl(this, playerId, itemInstanceId); }
 /**
* unequipItem：执行unequip道具相关逻辑。
* @param playerId 玩家 ID。
* @param slot 参数说明。
* @returns 无返回值，直接更新unequip道具相关状态。
*/

 unequipItem(playerId, slot, expectedItemInstanceId?: string) { return unequipItemImpl(this, playerId, slot, expectedItemInstanceId); }
 /** 设置法宝槽位启用开关。 */
 setArtifactSlotEnabled(playerId, slot, enabled) { return setArtifactSlotEnabledImpl(this, playerId, slot, enabled); }
 /** 装备法宝：复用装备 C2S 入口，但写入独立法宝槽。 */
 equipArtifactItem(player, slotIndex, normalizedItem, expectedItemInstanceId) { return equipArtifactItemImpl(this, player, slotIndex, normalizedItem, expectedItemInstanceId); }
 /** 卸下法宝并回到背包。 */
 unequipArtifactItem(player, slot, expectedItemInstanceId) { return unequipArtifactItemImpl(this, player, slot, expectedItemInstanceId); }
 /**
* cultivateTechnique：执行cultivate功法相关逻辑。
* @param playerId 玩家 ID。
* @param techniqueId technique ID。
* @returns 无返回值，直接更新cultivate功法相关状态。
*/

 cultivateTechnique(playerId, techniqueId) { return cultivateTechniqueImpl(this, playerId, techniqueId); }
 /**
* forgetTechnique：遗忘已掌握功法并清理派生技能状态。
* @param playerId 玩家 ID。
* @param techniqueId technique ID。
* @returns 返回被遗忘功法名称。
*/

 forgetTechnique(playerId, techniqueId) { return forgetTechniqueImpl(this, playerId, techniqueId); }
 /** 放弃尚未领悟的功法；进行中的传法必须先走通用 job 取消流程。 */
 discardPendingTechniqueComprehension(playerId, techniqueId) { return discardPendingTechniqueComprehensionImpl(this, playerId, techniqueId); }
 /**
* infuseBodyTraining：执行infuseBodyTraining相关逻辑。
* @param playerId 玩家 ID。
* @param foundationAmount 参数说明。
* @returns 无返回值，直接更新infuseBodyTraining相关状态。
*/

 infuseBodyTraining(playerId, foundationAmount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const requested = normalizeCounter(foundationAmount);
  if (requested <= 0) {
   throw new BadRequestException('底蕴数量不能为空');
  }
  if (player.foundation <= 0) {
   throw new BadRequestException('底蕴不足');
  }

  const consumed = Math.min(player.foundation, requested);

  const previousBodyTraining = normalizeBodyTrainingState(player.bodyTraining);

  const nextBodyTraining = normalizeBodyTrainingState({
   level: previousBodyTraining.level,
   exp: previousBodyTraining.exp + consumed * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
   expToNext: previousBodyTraining.expToNext,
  });
  player.foundation -= consumed;
  player.bodyTraining = nextBodyTraining;
  player.techniques.revision += 1;
  if (nextBodyTraining.level !== previousBodyTraining.level) {
   this.playerAttributesService.recalculate(player, 'body_training');
   markPlayerDirtyDomains(player, ['attr']);
  }
  else {
   this.playerAttributesService.markPanelDirty(player);
  }
  this.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['body_training', 'progression']);
  this.bumpPersistentRevision(player);
  return {
   player,
   foundationSpent: consumed,
   expGained: consumed * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
  };
 }
 /**
* setManagedBodyTrainingLevel：以运行时权威链路设置托管玩家炼体等级。
* @param playerId 玩家 ID。
* @param requestedLevel 目标等级。
* @returns 无返回值，直接更新炼体状态相关状态。
*/

 setManagedBodyTrainingLevel(playerId, requestedLevel) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const currentBodyTraining = normalizeBodyTrainingState(player.bodyTraining);
  const normalizedLevel = Math.max(0, Math.trunc(Number(requestedLevel) || 0));
  const expToNext = getBodyTrainingExpToNext(normalizedLevel);
  const nextBodyTraining = normalizeBodyTrainingState({
   level: normalizedLevel,
   exp: Math.min(currentBodyTraining.exp, Math.max(0, expToNext - 1)),
   expToNext,
  });
  if (nextBodyTraining.level === currentBodyTraining.level
   && nextBodyTraining.exp === currentBodyTraining.exp
   && nextBodyTraining.expToNext === currentBodyTraining.expToNext) {
   return player;
  }
  player.bodyTraining = nextBodyTraining;
  player.techniques.revision += 1;
  if (nextBodyTraining.level !== currentBodyTraining.level) {
   this.playerAttributesService.recalculate(player, 'body_training');
   markPlayerDirtyDomains(player, ['attr']);
  }
  else {
   this.playerAttributesService.markPanelDirty(player);
  }
  this.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['body_training', 'progression']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* recordActivity：执行recordActivity相关逻辑。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @param input 输入参数。
* @returns 无返回值，直接更新recordActivity相关状态。
*/

 recordActivity(playerId, currentTick, input: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  // 活动时间必须使用被影响玩家自己的生命周期时钟。PVP 受击路径传入的
  // currentTick 属于攻击者，直接写入会让短在线玩家的空闲恢复长期停在未来。
  player.combat.lastActiveTick = resolvePlayerRuntimeTick(player, currentTick);
  if (input.interruptCultivation === true && player.combat.cultivationActive) {
   player.combat.cultivationActive = false;
   this.playerAttributesService.recalculate(player, 'cultivation_state');
   markPlayerDirtyDomains(player, ['combat_pref', 'attr']);
   this.bumpPersistentRevision(player);
  }
  return player;
 }

 /** 在一个权威操作区间内合并同一玩家的属性重算请求。 */
 withDeferredAttributeRecalculation(playerId, callback) {
  const player = this.getPlayerOrThrow(playerId);
  if (typeof this.playerAttributesService?.withDeferredRecalculation !== 'function') {
   return {
    value: callback(),
    requested: false,
    changed: false,
    panelDirtyChanged: false,
   };
  }
  return this.playerAttributesService.withDeferredRecalculation(player, callback);
 }

 /** 权威读取属性前收敛当前操作区间内尚未结算的脏状态。 */
 ensurePlayerAttributesFresh(playerId) {
  const player = this.getPlayerOrThrow(playerId);
  return this.playerAttributesService?.ensureFresh?.(player) ?? { requested: false, changed: false };
 }
 /**
* spendQi：执行spendQi相关逻辑。
* @param playerId 玩家 ID。
* @param amount 参数说明。
* @returns 无返回值，直接更新spendQi相关状态。
*/

 spendQi(playerId, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = Math.max(0, Math.round(amount));
  if (normalized <= 0) {
   return player;
  }
  if (player.qi < normalized) {
   throw new NotFoundException('元气不足');
  }
  player.qi -= normalized;
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['vitals']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* applyDamage：处理Damage并更新相关状态。
* @param playerId 玩家 ID。
* @param amount 参数说明。
* @returns 无返回值，直接更新Damage相关状态。
*/

 applyDamage(playerId, amount, attackerId = null, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = Math.max(0, Math.round(amount));
  if (normalized <= 0) {
   return player;
  }

  const currentTick = Number(options?.currentTick ?? 0);
  const damageElement = options?.damageElement ?? options?.element;

  const reactionContext = {
   phase: 'beforeDamage' as const,
   targetKind: 'player' as const,
   target: player,
   damage: normalized,
   damageElement,
   currentTick,
   attackerId,
  };
  const beforeDamageReaction = this.damageReactionRegistry.dispatch(reactionContext);
  if (beforeDamageReaction.changed) {
   markPlayerDirtyDomains(player, ['buff', 'attr']);
   this.playerAttributesService?.recalculate?.(player, 'buff');
  }
  if (beforeDamageReaction.prevented) {
   player.hp = beforeDamageReaction.finalHp ?? 1;
   player.selfRevision += 1;
   markPlayerDirtyDomains(player, ['vitals', 'buff']);
   this.bumpPersistentRevision(player);
   return player;
  }
  player.hp = Math.max(0, player.hp - normalized);

  const lowHpReaction = this.damageReactionRegistry.dispatch({
   ...reactionContext,
   phase: 'afterHealthChange',
  });
  if (lowHpReaction.changed) {
   markPlayerDirtyDomains(player, ['buff', 'attr']);
   this.playerAttributesService?.recalculate?.(player, 'buff');
   this.bumpPersistentRevision(player);
  }
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['vitals']);
  this.bumpPersistentRevision(player);
  return player;
 }

 /** 治疗玩家：恢复生命值，不超过 maxHp。 */
 healPlayer(playerId, amount) {
  const player = this.getPlayerOrThrow(playerId);
  const normalized = Math.max(0, Math.round(amount));
  if (normalized <= 0 || player.hp >= player.maxHp) {
   return player;
  }
  player.hp = Math.min(player.maxHp, player.hp + normalized);
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['vitals']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* setSkillCooldownReadyTick：写入技能冷却Readytick。
* @param playerId 玩家 ID。
* @param skillId skill ID。
* @param readyTick 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新技能冷却Readytick相关状态。
*/

 setSkillCooldownReadyTick(playerId, skillId, readyTick, currentTick) {

  const player = this.getPlayerOrThrow(playerId);
  player.combat.cooldownReadyTickBySkillId[skillId] = Math.max(0, Math.trunc(readyTick));
  this.rebuildActionState(player, currentTick);
  return player;
 }
 /**
* updateAutoBattleSkills：处理AutoBattle技能并更新相关状态。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新AutoBattle技能相关状态。
*/

 updateAutoBattleSkills(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = normalizePlayerAutoBattleSkills(player, input);
  if (isSameAutoBattleSkillList(player.combat.autoBattleSkills, normalized)) {
   return player;
  }
  player.combat.autoBattleSkills = normalized;
  this.playerAttributesService.recalculate(player, 'technique_mutation');
  this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
  markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr', 'buff']);
  this.bumpPersistentRevision(player);
  void this.persistAutoBattleSkills(player).catch((error) => {
   console.warn(`自动战斗技能直写失败：${error instanceof Error ? error.message : String(error)}`);
  });
  return player;
 }
 /**
* updateAutoUsePills：处理AutoUsePill并更新相关状态。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新AutoUsePill相关状态。
*/

 updateAutoUsePills(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = normalizePersistedAutoUsePills(input);
  if (isSameAutoUsePillList(player.combat.autoUsePills, normalized)) {
   return player;
  }
  player.combat.autoUsePills = normalized;
  markPlayerDirtyDomains(player, ['auto_use_item_rule']);
  this.bumpPersistentRevision(player);
  void this.persistAutoUseItemRules(player).catch((error) => {
   console.warn(`自动使用规则直写失败：${error instanceof Error ? error.message : String(error)}`);
  });
  return player;
 }
 /**
* updateCombatTargetingRules：读取战斗TargetingRule并返回结果。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新战斗TargetingRule相关状态。
*/

 updateCombatTargetingRules(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = normalizePersistedCombatTargetingRules(input);
  if (isSameCombatTargetingRules(player.combat.combatTargetingRules, normalized)) {
   return player;
  }
  player.combat.combatTargetingRules = normalized;
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* updateAutoBattleTargetingMode：读取AutoBattleTargetingMode并返回结果。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新AutoBattleTargetingMode相关状态。
*/

 updateAutoBattleTargetingMode(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalized = normalizePersistedAutoBattleTargetingMode(input);
  if (player.combat.autoBattleTargetingMode === normalized) {
   return player;
  }
  player.combat.autoBattleTargetingMode = normalized;
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* updateTechniqueSkillAvailability：处理功法技能Availability并更新相关状态。
* @param playerId 玩家 ID。
* @param techId tech ID。
* @param enabled 参数说明。
* @returns 无返回值，直接更新功法技能Availability相关状态。
*/

 updateTechniqueSkillAvailability(playerId, techId, enabled) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalizedTechId = typeof techId === 'string' ? techId.trim() : '';
  if (!normalizedTechId) {
   return player;
  }

  const technique = player.techniques.techniques.find((entry) => entry.techId === normalizedTechId);
  if (!technique) {
   return player;
  }

  const unlockedSkillIds = new Set((technique.skills ?? [])
   .filter((skill) => (technique.level ?? 1) >= (typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1))
   .map((skill) => skill.id));
  if (unlockedSkillIds.size === 0) {
   return player;
  }

  const normalized: any[] = normalizePlayerAutoBattleSkills(player, player.combat.autoBattleSkills);

  let changed = false;
  for (const entry of normalized) {
   if (!unlockedSkillIds.has(entry.skillId)) {
    continue;
   }
   if ((entry.skillEnabled !== false) === (enabled !== false)) {
    continue;
   }
   entry.skillEnabled = enabled !== false;
   changed = true;
  }
  const limited = enforcePlayerSkillEnabledLimit(player, normalized);
  if (!changed && isSameAutoBattleSkillList(player.combat.autoBattleSkills, limited)) {
   return player;
  }
  player.combat.autoBattleSkills = limited;
  this.playerAttributesService.recalculate(player, 'technique_mutation');
  this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
  markPlayerDirtyDomains(player, ['auto_battle_skill', 'attr', 'buff']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* updateCombatSettings：处理战斗Setting并更新相关状态。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新战斗Setting相关状态。
*/

 updateCombatSettings(playerId, input, currentTick = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  let changed = false;
  if (input.autoBattle === false) {
   player.combat.manualEngagePending = false;
  }
  if (input.autoBattle !== undefined && player.combat.autoBattle !== input.autoBattle) {
   player.combat.autoBattle = input.autoBattle;
   changed = true;
   if (!input.autoBattle && (player.combat.combatTargetId !== null || player.combat.combatTargetLocked)) {
    player.combat.combatTargetId = null;
    player.combat.combatTargetLocked = false;
   }
  }
  if (input.autoRetaliate !== undefined && player.combat.autoRetaliate !== input.autoRetaliate) {
   player.combat.autoRetaliate = input.autoRetaliate;
   changed = true;
  }
  if (input.autoBattleStationary !== undefined && player.combat.autoBattleStationary !== input.autoBattleStationary) {
   player.combat.autoBattleStationary = input.autoBattleStationary;
   changed = true;
  }
  if (input.allowAoePlayerHit !== undefined && player.combat.allowAoePlayerHit !== input.allowAoePlayerHit) {
   player.combat.allowAoePlayerHit = input.allowAoePlayerHit;
   changed = true;
  }
  if (input.autoIdleCultivation !== undefined && player.combat.autoIdleCultivation !== input.autoIdleCultivation) {
   player.combat.autoIdleCultivation = input.autoIdleCultivation;
   changed = true;
  }
  if (input.autoSwitchCultivation !== undefined && player.combat.autoSwitchCultivation !== input.autoSwitchCultivation) {
   player.combat.autoSwitchCultivation = input.autoSwitchCultivation;
   changed = true;
  }
  if (input.autoRootFoundation !== undefined && player.combat.autoRootFoundation !== input.autoRootFoundation) {
   player.combat.autoRootFoundation = input.autoRootFoundation;
   changed = true;
  }
  if (input.combatAttackIntensity !== undefined) {
   const nextIntensity = normalizeCombatAttackIntensity(input.combatAttackIntensity);
   if (player.combat.combatAttackIntensity !== nextIntensity) {
    player.combat.combatAttackIntensity = nextIntensity;
    changed = true;
   }
  }
  if (input.senseQiActive !== undefined && player.combat.senseQiActive !== input.senseQiActive) {
   player.combat.senseQiActive = input.senseQiActive;
   if (input.senseQiActive === true) {
    player.combat.wangQiActive = false;
   }
   changed = true;
  }
  if (input.wangQiActive !== undefined && player.combat.wangQiActive !== input.wangQiActive) {
   player.combat.wangQiActive = input.wangQiActive;
   if (input.wangQiActive === true) {
    player.combat.senseQiActive = false;
   }
   changed = true;
  }
  let cultivationActiveChanged = false;
  if (input.cultivationActive !== undefined && player.combat.cultivationActive !== input.cultivationActive) {
   player.combat.cultivationActive = input.cultivationActive;
   cultivationActiveChanged = true;
   changed = true;
  }
  if (!changed) {
   return player;
  }
  if (cultivationActiveChanged) {
   this.playerAttributesService.recalculate(player, 'cultivation_state');
  }
  this.rebuildActionState(player, currentTick);
  markPlayerDirtyDomains(player, cultivationActiveChanged ? ['combat_pref', 'attr'] : ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /** 更新自动凝练根基开关，并在开启当下立即做一次权威条件检测。 */
 updateAutoRootFoundation(playerId, enabled, currentTick = 0) {
  const player = this.updateCombatSettings(playerId, {
   autoRootFoundation: enabled === true,
  }, currentTick);
  if (enabled === true && this.disableAutoRootFoundationAtCap(player, currentTick, false)) {
   return player;
  }
  if (enabled !== true || player.hp <= 0) {
   return player;
  }
  const statisticBefore = this.captureOfflineGainBeforeTick(player);
  const result = this.playerProgressionService.autoRefineRootFoundation(player);
  this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, true);
  this.disableAutoRootFoundationAtCap(player, currentTick, false);
  return player;
 }
 /**
* updateWorldPreference：更新玩家默认世界偏好。
* @param playerId 玩家 ID。
* @param linePreset 分线偏好。
* @returns 返回更新后的玩家运行态。
*/

 updateWorldPreference(playerId, linePreset) {
  const player = this.getPlayerOrThrow(playerId);
  const nextLinePreset = normalizePlayerWorldPreferenceLinePreset(linePreset);
  if (player.worldPreference?.linePreset === nextLinePreset) {
   return player;
  }
  player.worldPreference = {
   linePreset: nextLinePreset,
  };
  markPlayerDirtyDomains(player, ['world_anchor']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /** setPlayerSectId：设置玩家所属宗门。 */
 setPlayerSectId(playerId, sectId) {
  const player = this.getPlayerOrThrow(playerId);
  const normalized = typeof sectId === 'string' && sectId.trim() ? sectId.trim() : null;
  if ((player.sectId ?? null) === normalized) {
   return player;
  }
  player.sectId = normalized;
  player.selfRevision += 1;
  markPlayerDirtyDomains(player, ['sect_membership']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* setCombatTarget：写入战斗目标。
* @param playerId 玩家 ID。
* @param targetId target ID。
* @param locked 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新战斗目标相关状态。
*/

 setCombatTarget(playerId, targetId, locked, currentTick = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);

  const normalizedTargetId = typeof targetId === 'string' && targetId.trim() ? targetId.trim() : null;

  const normalizedLocked = normalizedTargetId !== null && locked === true;
  if (player.combat.combatTargetId === normalizedTargetId
   && player.combat.combatTargetLocked === normalizedLocked) {
   return player;
  }
  player.combat.combatTargetId = normalizedTargetId;
  player.combat.combatTargetLocked = normalizedLocked;
  this.rebuildActionState(player, currentTick);
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* clearCombatTarget：读取clear战斗目标并返回结果。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新clear战斗目标相关状态。
*/

 clearCombatTarget(playerId, currentTick = 0) {
  return this.setCombatTarget(playerId, null, false, currentTick);
 }
 /**
* setManualEngagePending：写入一次性接战待完成状态。
* @param playerId 玩家 ID。
* @param pending 是否仍需追击并完成一次出手。
* @returns 返回更新后的玩家运行态。
*/

 setManualEngagePending(playerId, pending) {
  // 一次性接战只在服务端运行时生效，不投影到客户端，也不进入持久化。

  const player = this.getPlayerOrThrow(playerId);
  const normalizedPending = pending === true;
  if (player.combat.manualEngagePending === normalizedPending) {
   return player;
  }
  player.combat.manualEngagePending = normalizedPending;
  return player;
 }
 /**
* clearManualEngagePending：清空一次性接战待完成状态。
* @param playerId 玩家 ID。
* @returns 返回更新后的玩家运行态。
*/

 clearManualEngagePending(playerId) {
  return this.setManualEngagePending(playerId, false);
 }
 /**
* setRetaliatePlayerTarget：写入当前反击锁定的玩家目标。
* @param playerId 玩家 ID。
* @param targetPlayerId 参数说明。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新当前反击锁定的玩家目标相关状态。
*/

 setRetaliatePlayerTarget(playerId, targetPlayerId, currentTick = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  const normalizedTargetId = typeof targetPlayerId === 'string' && targetPlayerId.trim() ? targetPlayerId.trim() : null;
  const normalizedCombatTargetId = normalizedTargetId ? `player:${normalizedTargetId}` : null;
  const normalizedCurrentTick = Number.isFinite(Number(currentTick))
   ? Math.max(0, Math.trunc(Number(currentTick) || 0))
   : 0;
  let changed = false;
  if (player.combat.retaliatePlayerTargetId !== normalizedTargetId) {
   player.combat.retaliatePlayerTargetId = normalizedTargetId;
   changed = true;
  }
  const nextRetaliatePlayerTargetLastAttackTick = normalizedTargetId ? normalizedCurrentTick : null;
  if ((player.combat.retaliatePlayerTargetLastAttackTick ?? null) !== nextRetaliatePlayerTargetLastAttackTick) {
   player.combat.retaliatePlayerTargetLastAttackTick = nextRetaliatePlayerTargetLastAttackTick;
   changed = true;
  }
  if (normalizedTargetId
   && player.hp > 0
   && player.combat.autoRetaliate !== false
   && player.combat.autoBattle !== true) {
   player.combat.autoBattle = true;
   player.combat.combatTargetId = normalizedCombatTargetId;
   player.combat.combatTargetLocked = true;
   player.combat.manualEngagePending = false;
   changed = true;
  }
  if (!changed) {
   return player;
  }
  this.rebuildActionState(player, currentTick);
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /** clearRetaliatePlayerTarget：清除当前反击锁定的玩家目标。 */
 clearRetaliatePlayerTarget(playerId, currentTick = 0) {
  return this.setRetaliatePlayerTarget(playerId, null, currentTick);
 }
 /** clearRetaliatePlayerTargetIfExpired：超时后清理当前反击锁定的玩家目标。 */
 clearRetaliatePlayerTargetIfExpired(playerId, currentTick, timeoutTicks = RETALIATE_PLAYER_TARGET_TIMEOUT_TICKS) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  const targetPlayerId = typeof player.combat?.retaliatePlayerTargetId === 'string' && player.combat.retaliatePlayerTargetId.trim()
   ? player.combat.retaliatePlayerTargetId.trim()
   : null;
  if (!targetPlayerId) {
   return player;
  }
  const normalizedCurrentTick = Number.isFinite(Number(currentTick))
   ? Math.max(0, Math.trunc(Number(currentTick) || 0))
   : 0;
  const normalizedTimeoutTicks = Math.max(1, Math.trunc(Number(timeoutTicks) || RETALIATE_PLAYER_TARGET_TIMEOUT_TICKS));
  const lastAttackTick = Number.isFinite(Number(player.combat?.retaliatePlayerTargetLastAttackTick))
   ? Math.max(0, Math.trunc(Number(player.combat.retaliatePlayerTargetLastAttackTick) || 0))
   : null;
  if (lastAttackTick !== null && normalizedCurrentTick - lastAttackTick < normalizedTimeoutTicks) {
   return player;
  }
  return this.clearRetaliatePlayerTarget(playerId, normalizedCurrentTick);
 }
 /** clearRetaliatePlayerTargetIfMatches：若当前反击目标命中指定玩家，则立即清理。 */
 clearRetaliatePlayerTargetIfMatches(playerId, targetPlayerId, currentTick = 0) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  const normalizedTargetId = typeof targetPlayerId === 'string' && targetPlayerId.trim() ? targetPlayerId.trim() : null;
  if (!normalizedTargetId || player.combat?.retaliatePlayerTargetId !== normalizedTargetId) {
   return player;
  }
  return this.clearRetaliatePlayerTarget(playerId, currentTick);
 }
 /**
* activateAutoRetaliate：受怪物攻击时开启自动战斗，由自动战斗选择器接管仇恨目标。
* @param playerId 玩家 ID。
* @param currentTick 参数说明。
* @returns 返回更新后的玩家运行态。
*/

 activateAutoRetaliate(playerId, currentTick = 0) {
  const player = this.getPlayerOrThrow(playerId);
  if (player.hp <= 0 || player.combat.autoRetaliate === false || player.combat.autoBattle === true) {
   return player;
  }
  player.combat.autoBattle = true;
  player.combat.retaliatePlayerTargetId = null;
  player.combat.retaliatePlayerTargetLastAttackTick = null;
  player.combat.manualEngagePending = false;
  this.rebuildActionState(player, currentTick);
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  return player;
 }
 /**
* applyTemporaryBuff：处理TemporaryBuff并更新相关状态。
* @param playerId 玩家 ID。
* @param buff 参数说明。
* @returns 无返回值，直接更新TemporaryBuff相关状态。
*/

 applyTemporaryBuff(playerId, buff) { return applyTemporaryBuffImpl(this, playerId, buff); }

 /** 按技能净化规则移除可清除 Buff；免疫净化的效果始终保留。 */
 cleanseTemporaryBuffs(playerId, category = 'debuff', removeCount = 1) { return cleanseTemporaryBuffsImpl(this, playerId, category, removeCount); }

 /** 精确替换一个临时 Buff 的层数与持续时间，供“每息重算”的场景使用。 */
 replaceTemporaryBuff(playerId, buff) { return replaceTemporaryBuffImpl(this, playerId, buff); }

 /** 按内容模板施加 Buff，供地形、系统效果等配置驱动来源复用。 */
 applyConfiguredBuff(playerId, buffId, options: any = {}) { return applyConfiguredBuffImpl(this, playerId, buffId, options); }
 /** 施加神魂受损 Debuff。 */
 applyPvPSoulInjury(playerId) { return applyPvPSoulInjuryImpl(this, playerId); }
 /** 增加一层煞气入体。 */
 addPvPShaInfusionStack(playerId) { return addPvPShaInfusionStackImpl(this, playerId); }
 /** 增加煞气反噬层数。 */
 addPvPShaBacklashStacks(playerId, addedStacks) { return addPvPShaBacklashStacksImpl(this, playerId, addedStacks); }
 /** 增加天道压制层数，并把整组持续时间刷新为一小时。 */
 addHeavenlyDaoSuppressionStacks(playerId, addedStacks) { return addHeavenlyDaoSuppressionStacksImpl(this, playerId, addedStacks); }
 /** 查询指定 Buff 当前层数。 */
 getBuffStacks(playerId, buffId) { return getBuffStacksImpl(this, playerId, buffId); }
 /** 判断玩家是否持有生效中的 Buff。 */
 hasActiveBuff(playerId, buffId, minStacks = 1) { return hasActiveBuffImpl(this, playerId, buffId, minStacks); }
 /** 身死时结算煞气反噬，折损修为并转化为煞气反噬层数。 */
 applyShaInfusionDeathPenalty(playerId) { return applyShaInfusionDeathPenaltyImpl(this, playerId); }
 /** 刷新或叠加持续型 Buff，整组层数共用同一到期时间。 */
 applyOrRefreshPvpBuff(playerId, buff, stackDelta = 0) { return applyOrRefreshPvpBuffImpl(this, playerId, buff, stackDelta); }
 /** 消耗指定 PVP Buff 层数并返回剩余层数。 */
 consumePvpBuffStacks(playerId, buffId, consumedStacks) { return consumePvpBuffStacksImpl(this, playerId, buffId, consumedStacks); }
 /**
* advanceTick：执行advancetick相关逻辑。
* @param currentTick 参数说明。
* @param options 选项参数。
* @returns 无返回值，直接更新advancetick相关状态。
*/

 advanceTick(currentTick, options: any = {}) {
  for (const player of this.players.values()) {
   this.advanceSinglePlayerTick(player, currentTick, options);
  }
 }
 /**
* advanceTickForPlayerIds：执行advancetickFor玩家ID相关逻辑。
* @param playerIds player ID 集合。
* @param currentTick 参数说明。
* @param options 选项参数。
* @returns 无返回值，直接更新advancetickFor玩家ID相关状态。
*/

 advanceTickForPlayerIds(playerIds, currentTick, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
   return;
  }
  for (const playerId of playerIds) {
   const player = this.players.get(playerId);
   if (!player) {
    continue;
   }
   this.advanceSinglePlayerTick(player, currentTick, options);
  }
 }
 /**
* advanceSinglePlayerTick：执行advanceSingle玩家tick相关逻辑。
* @param player 玩家对象。
* @param currentTick 参数说明。
* @param options 选项参数。
* @returns 无返回值，直接更新advanceSingle玩家tick相关状态。
*/

 advanceSinglePlayerTick(player, currentTick, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (options.__attributeRecalculationDeferred !== true
   && typeof this.playerAttributesService?.withDeferredRecalculation === 'function') {
   options.__attributeRecalculationDeferred = true;
   try {
    const deferred = this.playerAttributesService.withDeferredRecalculation(
     player,
     () => this.advanceSinglePlayerTick(player, currentTick, options),
    );
    if (deferred?.requested === true) {
     this.playerProgressionService?.refreshPreview?.(player);
    }
    if (deferred?.changed === true || deferred?.panelDirtyChanged === true) {
     markPlayerDirtyDomains(player, ['attr']);
    }
    return deferred?.value;
   }
   finally {
    delete options.__attributeRecalculationDeferred;
   }
  }
  const offlineGainSnapshotStartedAt = performance.now();
  const offlineGainBefore = this.captureOfflineGainBeforeTick(player);
  const statisticTickContext = {
   beforeSnapshot: offlineGainBefore,
   changed: false,
   progressionOnly: true,
   progressionAndInventoryOnly: true,
  };
  this.playerStatisticTickContextsByPlayerId.set(player.playerId, statisticTickContext);
  try {
   let statisticChangedThisTick = false;
   let statisticTechniqueChangedIdsThisTick = [];
   recordPlayerTickPerf(options, 'playerTick.offlineGainSnapshotMs', offlineGainSnapshotStartedAt);
   let statisticProgressionOnlyThisTick = true;
   let statisticProgressionAndInventoryOnlyThisTick = true;
   const chronologyStartedAt = performance.now();
   if (advancePlayerChronology(player)) {
    markPlayerDirtyDomains(player, ['progression']);
    this.bumpPersistentRevision(player);
   }
   recordPlayerTickPerf(options, 'playerTick.chronologyMs', chronologyStartedAt);
   const buffTickStartedAt = performance.now();
   const buffTickResult = tickTemporaryBuffs(player.buffs.buffs, player);
   if (buffTickResult.changed) {
    player.buffs.revision += 1;
    const dirtyDomains = ['buff'];
    if (buffTickResult.attrChanged) {
     this.playerAttributesService.recalculate(player, 'buff');
     dirtyDomains.push('attr');
    }
    if (buffTickResult.vitalsChanged) {
     dirtyDomains.push('vitals');
    }
    markPlayerDirtyDomains(player, dirtyDomains);
    this.bumpPersistentRevision(player);
   }
   if (buffTickResult.defeated === true && typeof options.markPlayerDefeated === 'function') {
    options.markPlayerDefeated(player.playerId);
   }
   recordPlayerTickPerf(options, 'playerTick.buffTickMs', buffTickStartedAt);
   const runtimeTickResolveStartedAt = performance.now();
   const playerTick = resolvePlayerRuntimeTick(player, currentTick);
   recordPlayerTickPerf(options, 'playerTick.runtimeTickResolveMs', runtimeTickResolveStartedAt);
   const vitalsRecoveryStartedAt = performance.now();
   if (recoverPlayerVitals(player, playerTick)) {
    player.selfRevision += 1;
    markPlayerDirtyDomains(player, ['vitals']);
    this.bumpPersistentRevision(player);
   }
   if (player.hp > 0 && player.maxHp > 0 && player.hp / player.maxHp <= 0.3) {
    const lowHpChanged = triggerLowHpHeavenlyPassives(player, currentTick);
    if (lowHpChanged) {
     this.playerAttributesService.recalculate(player, 'buff');
     player.buffs.revision += 1;
     markPlayerDirtyDomains(player, ['buff', 'attr']);
     this.bumpPersistentRevision(player);
    }
   }
   recordPlayerTickPerf(options, 'playerTick.vitalsRecoveryMs', vitalsRecoveryStartedAt);
   const artifactTickStartedAt = performance.now();
   const qiBeforeArtifactTick = Math.max(0, Math.round(Number(player.qi) || 0));
   const artifactTickResult = advancePlayerArtifactQiTick(player);
   const qiSpentByArtifactTick = Math.max(0, qiBeforeArtifactTick - Math.max(0, Math.round(Number(player.qi) || 0)));
   if (qiSpentByArtifactTick > 0 && typeof options.onPlayerQiSpent === 'function') {
    options.onPlayerQiSpent(player, qiSpentByArtifactTick);
   }
   if (artifactTickResult.artifactChanged || artifactTickResult.buffChanged || artifactTickResult.vitalsChanged) {
    if (artifactTickResult.artifactEnabledChanged) {
     this.refreshMovementCapabilities(player);
    }
    if (artifactTickResult.vitalsChanged) {
     player.selfRevision += 1;
    }
    markPlayerDirtyDomains(player, [
     ...(artifactTickResult.artifactChanged ? ['artifact'] : []),
     ...(artifactTickResult.buffChanged ? ['buff'] : []),
     ...(artifactTickResult.vitalsChanged ? ['vitals'] : []),
    ]);
    this.bumpPersistentRevision(player);
   }
   recordPlayerTickPerf(options, 'playerTick.artifactTickMs', artifactTickStartedAt);
   if (options.invalidateComprehensionProjection === true) {
    markPlayerComprehensionSpeedRateProjectionDirty(player);
   }
   if (options.deferComprehensionProjection === true) {
    recordPlayerTickCount(options, 'playerTick.comprehensionProjectionDeferrals');
   }
   else {
    const comprehensionProjectionStartedAt = performance.now();
    const comprehensionProjectionResult = refreshPlayerComprehensionSpeedRateProjectionIfDirty(player, {
     getInstanceRuntime: options.getInstanceRuntime,
    });
    recordPlayerTickPerf(options, 'playerTick.comprehensionProjectionMs', comprehensionProjectionStartedAt);
    recordPlayerTickCount(
     options,
     comprehensionProjectionResult === PLAYER_COMPREHENSION_PROJECTION_CACHE_HIT
      ? 'playerTick.comprehensionProjectionCacheHits'
      : 'playerTick.comprehensionProjectionRecalculations',
    );
   }
   const idleCultivationResumeStartedAt = performance.now();
   if (player.hp > 0 && shouldResumeIdleCultivation(player, playerTick)) {
    player.combat.cultivationActive = true;
    this.playerAttributesService.recalculate(player, 'cultivation_state');
    markPlayerDirtyDomains(player, ['combat_pref', 'attr']);
    this.bumpPersistentRevision(player);
   }
   recordPlayerTickPerf(options, 'playerTick.idleCultivationResumeMs', idleCultivationResumeStartedAt);
   if (player.hp > 0 && player.combat.cultivationActive) {

    const cultivationAdvanceStartedAt = performance.now();
    const result = this.playerProgressionService.advanceCultivation(player, 1, {
     auraMultiplier: resolveCultivationAuraMultiplier(player, options),
     getInstanceRuntime: options.getInstanceRuntime,
    });
    this.applyProgressionResult(player, result, playerTick);
    statisticChangedThisTick = statisticChangedThisTick || result?.changed === true;
    statisticProgressionOnlyThisTick = statisticProgressionOnlyThisTick && isProgressionOnlyStatisticResult(result);
    statisticProgressionAndInventoryOnlyThisTick = statisticProgressionAndInventoryOnlyThisTick
     && isProgressionAndInventoryOnlyStatisticResult(result);
    if (result?.changed === true) {
     statisticTechniqueChangedIdsThisTick = Array.isArray(result?.statisticTechniqueChangedIds)
      ? result.statisticTechniqueChangedIds
      : undefined;
    }
    const passiveCultivationQiStartedAt = performance.now();
    applyCultivationTileQiPassives(player, options);
    recordPlayerTickPerf(options, 'playerTick.passiveCultivationQiMs', passiveCultivationQiStartedAt);
    recordPlayerTickPerf(options, 'playerTick.cultivationAdvanceMs', cultivationAdvanceStartedAt);
   }
   if (player.hp > 0 && player.combat.autoRootFoundation === true) {
    const rootFoundationStartedAt = performance.now();
    const result = this.playerProgressionService.autoRefineRootFoundation(player);
    this.applyProgressionResult(player, result, playerTick, true);
    statisticChangedThisTick = statisticChangedThisTick || result?.changed === true;
    statisticProgressionOnlyThisTick = statisticProgressionOnlyThisTick && isProgressionOnlyStatisticResult(result);
    statisticProgressionAndInventoryOnlyThisTick = statisticProgressionAndInventoryOnlyThisTick
     && isProgressionAndInventoryOnlyStatisticResult(result);
    this.disableAutoRootFoundationAtCap(player, playerTick);
    recordPlayerTickPerf(options, 'playerTick.rootFoundationMs', rootFoundationStartedAt);
   }
   if (shouldRefreshSkillCooldownActionState(
    player,
    playerTick,
    this.actionCooldownProjectionScheduleByPlayer.get(player),
   )) {
    const cooldownActionStateStartedAt = performance.now();
    this.rebuildActionState(player, playerTick);
    recordPlayerTickPerf(options, 'playerTick.cooldownActionStateMs', cooldownActionStateStartedAt);
   }
   const offlineGainAccumulateStartedAt = performance.now();
   const contextualStatisticChanged = statisticChangedThisTick || statisticTickContext.changed === true;
   const contextualProgressionOnly = statisticProgressionOnlyThisTick && statisticTickContext.progressionOnly === true;
   const contextualProgressionAndInventoryOnly = !contextualProgressionOnly
    && statisticProgressionAndInventoryOnlyThisTick
    && statisticTickContext.progressionAndInventoryOnly === true;
   this.accumulateOfflineGainAfterTick(player, offlineGainBefore, contextualStatisticChanged, {
    progressionOnly: contextualProgressionOnly,
    progressionAndInventoryOnly: contextualProgressionAndInventoryOnly,
    statisticTechniqueChangedIds: contextualProgressionOnly || contextualProgressionAndInventoryOnly
     ? statisticTechniqueChangedIdsThisTick
     : undefined,
    recordTickSectionDuration: options.recordTickSectionDuration,
   });
   recordPlayerTickPerf(options, 'playerTick.offlineGainAccumulateMs', offlineGainAccumulateStartedAt);

  } finally {
   this.playerStatisticTickContextsByPlayerId.delete(player.playerId);
  }
 }

 /** 传法推进由 TransmissionStrategy 通过通用技艺 job pipeline 驱动。 */
 advanceTechniqueTransmissionForPlayer(player, playerTick) { return advanceTechniqueTransmissionForPlayerImpl(this, player, playerTick); }

 /** captureOfflineGainBeforeTick：捕获离线收益tick前快照。 */
 captureOfflineGainBeforeTick(player) {
  const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
  if (!normalizedPlayerId) {
   return null;
  }
  const existing = this.playerStatisticSnapshotsByPlayerId.get(normalizedPlayerId);
  if (existing) {
   return existing;
  }
  const snapshot = buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService);
  this.playerStatisticSnapshotsByPlayerId.set(normalizedPlayerId, snapshot);
  return snapshot;
 }
 /** accumulateOfflineGainAfterTick：累计玩家tick内实际收支；在线即时排队，离线归入挂机片段。 */
 accumulateOfflineGainAfterTick(player, beforeSnapshot, statisticChanged = true, options: any = {}) {
  const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
  if (!beforeSnapshot || !normalizedPlayerId) {
   return;
  }
  const offlineSession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
  const offline = offlineSession && !normalizeOfflineGainString(player?.sessionId);
  if (statisticChanged !== true) {
   if (offline) {
    offlineSession.accumulatedDurationMs = normalizeOfflineGainCount(offlineSession.accumulatedDurationMs) + 1000;
   }
   return;
  }
  this.recordPlayerStatisticMutation(player, beforeSnapshot, Date.now(), {
   progressionOnly: options?.progressionOnly === true,
   progressionAndInventoryOnly: options?.progressionAndInventoryOnly === true,
   statisticTechniqueChangedIds: options?.statisticTechniqueChangedIds,
   recordTickSectionDuration: options?.recordTickSectionDuration,
  });
 }
 /** recordPlayerStatisticMutation：把一次权威变更按发生时刻记入全局收支；离线时先归入离线会话。 */
 recordPlayerStatisticMutation(player, beforeSnapshot, endedAt = Date.now(), options: any = {}) {
  if (!beforeSnapshot || !normalizeOfflineGainString(player?.playerId)) {
   return;
  }
  const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
  const progressionOnly = options?.progressionOnly === true;
  const progressionAndInventoryOnly = !progressionOnly && options?.progressionAndInventoryOnly === true;
  const progressionAndProfessionOnly = !progressionOnly
   && !progressionAndInventoryOnly
   && options?.progressionAndProfessionOnly === true;
  const inventoryOnly = !progressionOnly
   && !progressionAndInventoryOnly
   && !progressionAndProfessionOnly
   && options?.inventoryOnly === true;
  const deltaStartedAt = performance.now();
  const resolved = progressionOnly
   ? buildOfflineGainProgressionOnlyMutation(
    player,
    beforeSnapshot,
    options?.statisticTechniqueChangedIds,
   )
   : progressionAndInventoryOnly
    ? buildOfflineGainProgressionAndInventoryMutation(
     player,
     beforeSnapshot,
     this.contentTemplateRepository,
     options?.statisticTechniqueChangedIds,
    )
    : progressionAndProfessionOnly
     ? buildOfflineGainProgressionAndProfessionMutation(
      player,
      beforeSnapshot,
      this.playerProgressionService,
     )
     : inventoryOnly
      ? buildOfflineGainInventoryOnlyMutation(
       player,
       beforeSnapshot,
       this.contentTemplateRepository,
       options?.inventoryItemDeltaHint,
      )
      : null;
  const afterSnapshot = resolved?.afterSnapshot
   ?? buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService);
  const delta = resolved?.delta
   ?? buildOfflineGainDeltaParts(
    normalizeOfflineGainSnapshot(beforeSnapshot),
    normalizeOfflineGainSnapshot(afterSnapshot),
    (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level),
   );
  recordPlayerTickPerf(
   options,
   progressionOnly
    ? 'playerTick.offlineGainProgressionDeltaMs'
    : progressionAndInventoryOnly
     ? 'playerTick.offlineGainProgressionInventoryDeltaMs'
     : progressionAndProfessionOnly
      ? 'playerTick.offlineGainProgressionProfessionDeltaMs'
      : inventoryOnly
       ? 'playerTick.offlineGainInventoryDeltaMs'
       : 'playerTick.offlineGainFullDeltaMs',
   deltaStartedAt,
  );
  this.playerStatisticSnapshotsByPlayerId.set(normalizedPlayerId, afterSnapshot);
  const offlineSession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
  if (offlineSession && !normalizeOfflineGainString(player?.sessionId)) {
   const offlineMergeStartedAt = performance.now();
   if (options?.countOfflineDuration !== false) {
    offlineSession.accumulatedDurationMs = normalizeOfflineGainCount(offlineSession.accumulatedDurationMs) + 1000;
   }
   if (!hasOfflineGainReportPartsFast(delta)) {
    recordPlayerTickPerf(options, 'playerTick.offlineGainOfflineMergeMs', offlineMergeStartedAt);
    return;
   }
   offlineSession.accumulatedPayload = progressionOnly
    ? mergeOfflineGainProgressionReportPartsBySum(offlineSession.accumulatedPayload, delta)
    : progressionAndProfessionOnly
     ? mergeOfflineGainProgressionAndProfessionReportPartsBySum(offlineSession.accumulatedPayload, delta)
     : mergeOfflineGainReportPartsBySum(offlineSession.accumulatedPayload, delta);
   recordPlayerTickPerf(options, 'playerTick.offlineGainOfflineMergeMs', offlineMergeStartedAt);
   return;
  }
  if (!hasOfflineGainReportPartsFast(delta)) {
   return;
  }
  if (!normalizeOfflineGainString(player?.sessionId)) {
   return;
  }
  const onlineTotalsStartedAt = performance.now();
  this.recordPlayerStatisticTotals(normalizedPlayerId, delta, endedAt);
  if (!progressionOnly) {
   this.queueOnlinePlayerStatisticReport(normalizedPlayerId, player, delta, endedAt);
  }
  recordPlayerTickPerf(options, 'playerTick.offlineGainOnlineTotalsMs', onlineTotalsStartedAt);
 }
 /** 在线收支明细交给客户端本地归档；日总账仍走 recordPlayerStatisticTotals 的权威累计链路。 */
 queueOnlinePlayerStatisticReport(playerId, player, parts, endedAt = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || !hasOfflineGainReportPartsFast(parts)) {
   return;
  }
  const endedAtMs = Math.max(0, Math.trunc(Number(endedAt) || Date.now()));
  const report = buildPlayerStatisticRecordFromParts(player, {
   startedAt: endedAtMs,
   accumulatedDurationMs: 0,
  }, endedAtMs, parts, 'online');
  if (!normalizeOfflineGainString(report?.id)) {
   return;
  }
  const existing = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
  this.pendingOfflineGainReportsByPlayerId.set(
   normalizedPlayerId,
   mergePendingOfflineGainReportList(normalizedPlayerId, [...existing, report]),
  );
 }
 /** 资产入口成功变更后记录统计；tick 内延迟到 tick 末统一结算，避免重复累计离线时长。 */
 recordAssetStatisticMutation(player, beforeSnapshot, endedAt = Date.now(), options: any = {}) {
  const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
  if (!normalizedPlayerId || !beforeSnapshot) {
   return;
  }
  const assetMutationContext = this.assetMutationContext.getStore();
  const deferredAssetStatistic = assetMutationContext?.active
   ? assetMutationContext.deferredAssetStatistics?.get(normalizedPlayerId)
   : null;
  if (deferredAssetStatistic) {
   deferredAssetStatistic.endedAt = Math.max(
    deferredAssetStatistic.endedAt,
    Math.max(0, Math.trunc(Number(endedAt) || Date.now())),
   );
   return;
  }
  const context = this.playerStatisticTickContextsByPlayerId.get(normalizedPlayerId);
  if (context && context.beforeSnapshot) {
   context.changed = true;
   context.progressionOnly = false;
   context.progressionAndInventoryOnly = context.progressionAndInventoryOnly === true
    && options?.inventoryOnly === true;
   return;
  }
  this.recordPlayerStatisticMutation(player, beforeSnapshot, endedAt, {
   progressionOnly: false,
   progressionAndProfessionOnly: options?.progressionAndProfessionOnly === true,
   inventoryOnly: options?.inventoryOnly === true,
   inventoryItemDeltaHint: options?.inventoryItemDeltaHint,
   recordTickSectionDuration: options?.recordTickSectionDuration,
   countOfflineDuration: false,
  });
 }
 /** recordPlayerStatisticTotals：把收支写入服务端权威日总账，数据库落盘异步调度。 */
 recordPlayerStatisticTotals(playerId, parts, endedAt = Date.now()) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return;
  }
  const delta = summarizePlayerStatisticPeriodTotal(parts);
  if (!hasNormalizedPlayerStatisticPeriodTotal(delta)) {
   return;
  }
  const dayKey = buildPlayerStatisticLocalDayKey(endedAt);
  mergeNormalizedPlayerStatisticDayTotalMap(this.playerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
  this.pendingPlayerStatisticTotalsEmitPlayerIds.add(normalizedPlayerId);
  if (this.playerDomainPersistenceService?.isEnabled?.()) {
   mergeNormalizedPlayerStatisticDayTotalMap(this.pendingPlayerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
   this.schedulePlayerStatisticLedgerFlush(normalizedPlayerId);
  }
 }
 /** schedulePlayerStatisticLedgerFlush：异步刷新服务端统计总账到数据库，避开 tick 热路径 IO。 */
 schedulePlayerStatisticLedgerFlush(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId || this.scheduledPlayerStatisticLedgerFlushes.has(normalizedPlayerId)) {
   return;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return;
  }
  this.scheduledPlayerStatisticLedgerFlushes.add(normalizedPlayerId);
  setTimeout(() => {
   void this.flushPendingPlayerStatisticLedger(normalizedPlayerId).catch((error) => {
    this.scheduledPlayerStatisticLedgerFlushes.delete(normalizedPlayerId);
    this.logger.error(
     `统计总账后台调度失败 playerId=${normalizedPlayerId}`,
     error instanceof Error ? error.stack : String(error),
    );
   });
  }, 0);
 }
 /** flushPendingPlayerStatisticLedger：落盘待写统计总账增量。 */
 async flushPendingPlayerStatisticLedger(playerId) {
  const normalizedPlayerId = normalizeOfflineGainString(playerId);
  if (!normalizedPlayerId) {
   return;
  }
  await this.playerStatisticLedgerIoQueue.run(normalizedPlayerId, async () => {
   this.scheduledPlayerStatisticLedgerFlushes.delete(normalizedPlayerId);
   const pendingByDay = this.pendingPlayerStatisticDayTotalsByPlayerId.get(normalizedPlayerId);
   if (!pendingByDay || pendingByDay.size === 0 || !this.playerDomainPersistenceService?.isEnabled?.()) {
    return;
   }
   this.pendingPlayerStatisticDayTotalsByPlayerId.delete(normalizedPlayerId);
   let shouldRetry = false;
   for (const [dayKey, delta] of pendingByDay.entries()) {
    try {
     await this.playerDomainPersistenceService.incrementPlayerStatisticDayTotal(normalizedPlayerId, dayKey, delta);
     mergePlayerStatisticDayTotalMap(this.playerStatisticPersistedDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
     subtractPlayerStatisticDayTotalMap(this.playerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
    } catch (error) {
     mergePlayerStatisticDayTotalMap(this.pendingPlayerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
     shouldRetry = true;
     if (error instanceof TypeError || error instanceof ReferenceError) {
      this.logger.error(`统计总账落盘编程错误 playerId=${normalizedPlayerId} dayKey=${dayKey}`, error.stack);
     }
    }
   }
   if (shouldRetry) {
    const retries = (this.playerStatisticLedgerRetryCount.get(normalizedPlayerId) ?? 0) + 1;
    if (retries <= 5) {
     this.playerStatisticLedgerRetryCount.set(normalizedPlayerId, retries);
     this.schedulePlayerStatisticLedgerFlush(normalizedPlayerId);
    } else {
     this.playerStatisticLedgerRetryCount.delete(normalizedPlayerId);
     this.logger.warn(`统计总账落盘重试超限 playerId=${normalizedPlayerId}，放弃本轮重试`);
    }
   } else {
    this.playerStatisticLedgerRetryCount.delete(normalizedPlayerId);
   }
  });
 }
 /**
* respawnPlayer：执行重生玩家相关逻辑。
* @param playerId 玩家 ID。
* @param input 输入参数。
* @returns 无返回值，直接更新重生玩家相关状态。
*/

 respawnPlayer(playerId, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.getPlayerOrThrow(playerId);
  const currentTick = Math.max(0, Math.trunc(Number(input.currentTick) || 0));
  if (player.lifeElapsedTicks !== currentTick) {
   player.lifeElapsedTicks = currentTick;
  }

  let changed = false;
  if (player.instanceId !== input.instanceId) {
   player.instanceId = input.instanceId;
   changed = true;
  }
  if (player.templateId !== input.templateId) {
   player.templateId = input.templateId;
   changed = true;
  }
  if (player.x !== input.x) {
   player.x = input.x;
   changed = true;
  }
  if (player.y !== input.y) {
   player.y = input.y;
   changed = true;
  }
  const nextFacing = normalizeHorizontalFacing(input.facing, player.facing);
  if (player.facing !== nextFacing) {
   player.facing = nextFacing;
   changed = true;
  }
  if (player.hp !== player.maxHp) {
   player.hp = player.maxHp;
   changed = true;
  }
  if (player.qi !== player.maxQi) {
   player.qi = player.maxQi;
   changed = true;
  }
  const keepBuff = input.buffClearMode === 'return_to_spawn'
   ? shouldKeepBuffOnReturnToSpawn
   : shouldKeepBuffOnRespawn;
  const keptBuffs = player.buffs.buffs.filter((buff) => keepBuff(buff));
  if (!isSameBuffIdSequence(player.buffs.buffs, keptBuffs)) {
   player.buffs.buffs = keptBuffs;
   player.buffs.revision += 1;
   changed = true;
   this.playerAttributesService.recalculate(player, 'respawn');
  }
  if (Object.keys(player.combat.cooldownReadyTickBySkillId).length > 0) {
   this.rebuildActionState(player, currentTick);
  }
  if (player.combat.autoBattle) {
   player.combat.autoBattle = false;
   changed = true;
  }
  player.combat.retaliatePlayerTargetId = null;
  player.combat.retaliatePlayerTargetLastAttackTick = null;
  player.combat.combatTargetId = null;
  player.combat.combatTargetLocked = false;
  player.combat.manualEngagePending = false;
  const wasCultivationActive = player.combat.cultivationActive === true;
  player.combat.cultivationActive = false;
  if (wasCultivationActive) {
   changed = true;
   this.playerAttributesService.recalculate(player, 'respawn');
  }
  player.combat.lastActiveTick = Math.max(player.combat.lastActiveTick, currentTick);
  if (changed) {
   player.selfRevision += 1;
   markPlayerDirtyDomains(player, ['position_checkpoint', 'vitals', 'buff', 'combat_pref', 'attr']);
   this.bumpPersistentRevision(player);
  }
  return player;
 }
 /**
* listDirtyPlayers：读取Dirty玩家并返回结果。
* @returns 无返回值，完成Dirty玩家的读取/组装。
*/

 listDirtyPlayers() {
  return Array.from(this.players.values())
   .filter((player) => !isNativeGmBotPlayerId(player.playerId))
   .filter((player) => isPlayerRuntimeDirty(player))
   .map((player) => player.playerId);
 }
 /**
  * 临时持有指定持久化域，使普通 flush/ledger 在跨域检查点提交前不抢先落盘。
  * 使用引用计数，允许多个独立协调器安全嵌套持有同一域。
  */
 holdPersistenceDomains(playerId, domains) {
  const player = this.players.get(playerId);
  if (!player) {
   return;
  }
  const holds = ensurePlayerPersistenceDomainHoldCountMap(player);
  for (const domain of normalizePlayerPersistenceDomainNames(domains)) {
   holds.set(domain, Math.max(0, Math.trunc(Number(holds.get(domain)) || 0)) + 1);
  }
 }
 /** 释放跨域检查点持有的持久化域；归零后普通 flush 会重新看到仍然脏的域。 */
 releasePersistenceDomains(playerId, domains) {
  const player = this.players.get(playerId);
  const holds = readPlayerPersistenceDomainHoldCountMap(player);
  if (!holds) {
   return;
  }
  for (const domain of normalizePlayerPersistenceDomainNames(domains)) {
   const nextCount = Math.max(0, Math.trunc(Number(holds.get(domain)) || 0) - 1);
   if (nextCount > 0) {
    holds.set(domain, nextCount);
   }
   else {
    holds.delete(domain);
   }
  }
  if (holds.size === 0) {
   delete player.persistenceDomainHoldCountByDomain;
  }
 }
 /** getPersistenceRevision：读取玩家持久化版本。 */
 getPersistenceRevision(playerId) {
  const player = this.players.get(playerId);
  if (!player) {
   return null;
  }
  return Number.isFinite(Number(player.persistentRevision))
   ? Math.trunc(Number(player.persistentRevision))
   : null;
 }
 /** 读取玩家单个持久化域的运行态修订。 */
 getPersistenceDomainRevision(playerId, domain) {
  const player = this.players.get(playerId);
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  if (!player || !normalizedDomain) {
   return null;
  }
  return getPlayerPersistenceDomainRevision(player, normalizedDomain);
 }
 /** 判断指定持久化域是否已经按当前运行态修订落库且没有新的脏变更。 */
 isPersistenceDomainPersisted(playerId, domain) {
  const player = this.players.get(playerId);
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  if (!player || !normalizedDomain || !(player.persistedDomainRevisionByDomain instanceof Map)) {
   return false;
  }
  if (player.dirtyDomains instanceof Set && player.dirtyDomains.has(normalizedDomain)) {
   return false;
  }
  const currentRevision = getPlayerPersistenceDomainRevision(player, normalizedDomain);
  if (currentRevision <= 0) {
   return false;
  }
  return Math.max(
   0,
   Math.trunc(Number(player.persistedDomainRevisionByDomain.get(normalizedDomain) ?? 0)),
  ) === currentRevision;
 }
 /** 在生成 ledger payload 前复核单域仍未被 hold，且仍存在未暂存修订。 */
 getUnstagedPersistenceDomainRevision(playerId, domain, stagingGenerationId) {
  const player = this.players.get(playerId);
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  const normalizedGenerationId = normalizePlayerStagingGenerationId(stagingGenerationId);
  if (
   !player
   || !normalizedDomain
   || !normalizedGenerationId
   || isNativeGmBotPlayerId(player.playerId)
   || isImmediateDomainPersistenceSuppressed(player)
  ) {
   return 0;
  }
  const currentDomains = readUnheldPlayerDirtyDomains(player);
  const isFallbackDomain = normalizedDomain === PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN;
  const fallbackDirty = isFallbackDomain
   && !hasHeldPlayerPersistenceDomains(player)
   && player.persistentRevision > Math.max(
    Math.max(0, Math.trunc(Number(player.persistedRevision) || 0)),
    Math.max(0, Math.trunc(Number(player.stagedRevision) || 0)),
   );
  if (!currentDomains.has(normalizedDomain) && !fallbackDirty) {
   return 0;
  }
  const domainRevision = isFallbackDomain
   ? Math.max(0, Math.trunc(Number(player.persistentRevision) || 0))
   : getPlayerPersistenceDomainRevision(player, normalizedDomain);
  const stagedRevision = getPlayerStagedDomainRevision(
   player,
   normalizedDomain,
   normalizedGenerationId,
  );
  return domainRevision > stagedRevision ? domainRevision : 0;
 }
 /**
  * 列出尚未由当前 ledger generation 接管的脏域。
  * staged 只表示 payload 已经可靠写入 flush ledger，不代表数据库真源已经落盘。
  */
 listUnstagedPlayerDomainRevisions(stagingGenerationId) {
  const normalizedGenerationId = normalizePlayerStagingGenerationId(stagingGenerationId);
  const dirtyPlayers = new Map();
  for (const player of this.players.values()) {
   if (isNativeGmBotPlayerId(player.playerId) || isImmediateDomainPersistenceSuppressed(player)) {
    continue;
   }
   const currentDomains = readUnheldPlayerDirtyDomains(player);
   const domains = currentDomains.size > 0
    ? Array.from(currentDomains)
    : (!hasHeldPlayerPersistenceDomains(player) && player.persistentRevision > Math.max(
     Math.max(0, Math.trunc(Number(player.persistedRevision) || 0)),
     Math.max(0, Math.trunc(Number(player.stagedRevision) || 0)),
    )
     ? [PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN]
     : []);
   const unstagedDomains = new Map();
   for (const domain of domains) {
    const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
    if (!normalizedDomain) {
     continue;
    }
    const domainRevision = normalizedDomain === PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN
     ? Math.max(0, Math.trunc(Number(player.persistentRevision) || 0))
     : getPlayerPersistenceDomainRevision(player, normalizedDomain);
    const stagedRevision = getPlayerStagedDomainRevision(
     player,
     normalizedDomain,
     normalizedGenerationId,
    );
    if (domainRevision > stagedRevision) {
     unstagedDomains.set(normalizedDomain, domainRevision);
    }
   }
   if (unstagedDomains.size > 0) {
    dirtyPlayers.set(player.playerId, unstagedDomains);
   }
  }
  return dirtyPlayers;
 }
 /** flush ledger 批次提交成功后，按捕获修订转移 dirty 持久化义务，但不冒充 DB persisted。 */
 markPersistenceDomainsStaged(playerId, domainRevisions, runtimeRevision, stagingGenerationId) {
  const player = this.players.get(playerId);
  const normalizedGenerationId = normalizePlayerStagingGenerationId(stagingGenerationId);
  if (!player || !normalizedGenerationId) {
   return;
  }
  const normalizedDomainRevisions = normalizePlayerDomainRevisionEntries(domainRevisions);
  ensurePlayerPersistenceStagingMaps(player);
  for (const [domain, capturedRevision] of normalizedDomainRevisions) {
   if (domain !== PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN
    && getPlayerPersistenceDomainRevision(player, domain) === capturedRevision) {
    // durable ledger 已接管本修订的持久化义务；不推进 persistedRevision。
    // 同域在 staging IO 期间再次变更时修订不同，新的 dirty 会保留下来。
    player.dirtyDomains?.delete(domain);
   }
   const previousGenerationId = player.persistenceStagingGenerationByDomain.get(domain);
   const previousRevision = previousGenerationId === normalizedGenerationId
    ? Math.max(0, Math.trunc(Number(player.stagedPersistenceDomainRevisionByDomain.get(domain) ?? 0)))
    : 0;
   player.stagedPersistenceDomainRevisionByDomain.set(domain, Math.max(previousRevision, capturedRevision));
   player.persistenceStagingGenerationByDomain.set(domain, normalizedGenerationId);
  }
  const capturedRuntimeRevision = Math.max(0, Math.trunc(Number(runtimeRevision) || 0));
  if (player.persistenceStagingGenerationId !== normalizedGenerationId) {
   player.persistenceStagingGenerationId = normalizedGenerationId;
   player.stagedRevision = capturedRuntimeRevision;
  }
  else {
   player.stagedRevision = Math.max(
    Math.max(0, Math.trunc(Number(player.stagedRevision) || 0)),
    capturedRuntimeRevision,
   );
  }
 }
 /** payload 真源写与 ledger 完成均成功后，按单域捕获修订精确清理 dirty。 */
 markPersistenceDomainsPersistedByRevision(playerId, domainRevisions, runtimeRevision, stagingGenerationId) {
  const player = this.players.get(playerId);
  if (!player) {
   return;
  }
  const normalizedDomainRevisions = normalizePlayerDomainRevisionEntries(domainRevisions);
  const normalizedGenerationId = normalizePlayerStagingGenerationId(stagingGenerationId);
  for (const [domain, capturedRevision] of normalizedDomainRevisions) {
   if (domain === PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN) {
    continue;
   }
   const currentRevision = getPlayerPersistenceDomainRevision(player, domain);
   if (currentRevision !== capturedRevision) {
    continue;
   }
   player.dirtyDomains?.delete(domain);
   ensurePlayerPersistencePersistedMap(player).set(domain, capturedRevision);
   clearPendingTechniqueComprehensionEmptyOverwriteAuthorizationIfPersisted(
    player,
    domain,
    capturedRevision,
   );
  }
  const capturedRuntimeRevision = Math.max(0, Math.trunc(Number(runtimeRevision) || 0));
  const noDirtyDomains = !(player.dirtyDomains instanceof Set) || player.dirtyDomains.size === 0;
  if (noDirtyDomains && player.persistentRevision <= capturedRuntimeRevision) {
   player.persistedRevision = Math.max(
    Math.max(0, Math.trunc(Number(player.persistedRevision) || 0)),
    Math.min(capturedRuntimeRevision, player.persistentRevision),
   );
  }
  this.markPersistenceDomainsStaged(
   playerId,
   normalizedDomainRevisions,
   capturedRuntimeRevision,
   normalizedGenerationId,
  );
 }
 /**
* listDirtyPlayerDomains：读取Dirty玩家并返回对应域集合。
* @returns 无返回值，完成Dirty玩家域集合的读取/组装。
*/

 listDirtyPlayerDomains() {
  const dirtyPlayers = new Map();
  for (const player of this.players.values()) {
   if (isNativeGmBotPlayerId(player.playerId) || isImmediateDomainPersistenceSuppressed(player)) {
    continue;
   }
   const dirtyDomains = readUnheldPlayerDirtyDomains(player);
   if (dirtyDomains.size > 0) {
    dirtyPlayers.set(player.playerId, dirtyDomains);
    continue;
   }
   if (!hasHeldPlayerPersistenceDomains(player) && player.persistentRevision > Math.max(
    Math.max(0, Math.trunc(Number(player.persistedRevision) || 0)),
    Math.max(0, Math.trunc(Number(player.stagedRevision) || 0)),
   )) {
    dirtyPlayers.set(player.playerId, new Set([PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN]));
   }
  }
  return dirtyPlayers;
 }
 /**
  * 检查玩家是否从持久化恢复（而非凭空创建的空白角色）。
  * 用于 flush 防御：阻止空白角色覆盖数据库中已有的老玩家存档。
  */
 isPlayerHydratedFromPersistence(playerId) {
  const player = this.players.get(playerId);
  if (!player) {
   return false;
  }
  // 未标记时默认视为已恢复（兼容旧路径创建的玩家）
  return (player as any)._hydratedFromPersistence !== false;
 }
 /**
* buildFreshPersistenceSnapshot：构建并返回目标对象。
* @param playerId 玩家 ID。
* @param placement 参数说明。
* @returns 无返回值，直接更新FreshPersistence快照相关状态。
*/

 buildFreshPersistenceSnapshot(playerId, placement) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';

  const templateId = typeof placement?.templateId === 'string' ? placement.templateId.trim() : '';
  if (!normalizedPlayerId || !templateId) {
   return null;
  }

  const player = this.createFreshPlayer(normalizedPlayerId, null);
  player.instanceId = normalizePlayerPlacementInstanceId(placement?.instanceId)
   ?? buildPublicPlayerInstanceId(templateId);
  player.templateId = templateId;
  player.respawnTemplateId = templateId;
  player.respawnInstanceId = player.instanceId;
  player.respawnX = Number.isFinite(placement?.x) ? Math.trunc(placement.x) : 0;
  player.respawnY = Number.isFinite(placement?.y) ? Math.trunc(placement.y) : 0;
  player.x = Number.isFinite(placement?.x) ? Math.trunc(placement.x) : 0;
  player.y = Number.isFinite(placement?.y) ? Math.trunc(placement.y) : 0;
  player.facing = normalizeHorizontalFacing(Number.isFinite(placement?.facing)
   ? Math.trunc(placement.facing)
   : undefined);
  player.unlockedMapIds = [templateId];
  return buildRuntimePlayerPersistenceSnapshot(player, this.mapTemplateRepository);
 }
 /**
* buildStarterPersistenceSnapshot：构建并返回目标对象。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新StarterPersistence快照相关状态。
*/

 buildStarterPersistenceSnapshot(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const templateId = this.mapTemplateRepository.has(DEFAULT_PLAYER_STARTER_MAP_ID)
   ? DEFAULT_PLAYER_STARTER_MAP_ID
   : (this.mapTemplateRepository.list()[0]?.id ?? '');
  if (!templateId) {
   return null;
  }

  const template = this.mapTemplateRepository.getOrThrow(templateId);
  return this.buildFreshPersistenceSnapshot(playerId, {
   templateId: template.id,
   x: template.spawnX,
   y: template.spawnY,
   facing: Direction.East,
  });
 }
 /**
* buildPersistenceSnapshot：构建并返回目标对象。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新Persistence快照相关状态。
*/

 buildPersistenceSnapshot(playerId, dirtyDomains = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.players.get(playerId);
  if (!player || !player.templateId || isNativeGmBotPlayerId(playerId)) {
   return null;
  }
  const inventoryCoalesced = coalesceInventoryItems(player.inventory?.items);
  const inventoryRepaired = repairDuplicateInventoryItemInstanceIds(player.inventory?.items);
  let inventoryInstanceIdRepaired = false;
  for (const entry of player.inventory?.items ?? []) {
   if (assignItemInstanceIdIfNeeded(entry)) {
    inventoryInstanceIdRepaired = true;
   }
  }
  let equipmentInstanceIdRepaired = false;
  for (const slotEntry of player.equipment?.slots ?? []) {
   if (slotEntry?.item && assignItemInstanceIdIfNeeded(slotEntry.item)) {
    equipmentInstanceIdRepaired = true;
   }
  }
  if (inventoryCoalesced || inventoryRepaired || inventoryInstanceIdRepaired) {
   markPlayerDirtyDomains(player, ['inventory']);
   this.bumpPersistentRevision(player);
  }
  if (equipmentInstanceIdRepaired) {
   markPlayerDirtyDomains(player, ['equipment']);
   this.bumpPersistentRevision(player);
  }
  let artifactInstanceIdRepaired = false;
  for (const artifactEntry of player.artifacts?.slots ?? []) {
   if (artifactEntry?.item && assignItemInstanceIdIfNeeded(artifactEntry.item)) {
    artifactInstanceIdRepaired = true;
   }
  }
  if (artifactInstanceIdRepaired) {
   markPlayerDirtyDomains(player, ['artifact']);
   this.bumpPersistentRevision(player);
  }
  return buildRuntimePlayerPersistenceSnapshot(player, this.mapTemplateRepository, dirtyDomains);
 }
 /**
  * markPersisted：标记一次落库完成，精确清除已持久化的 dirty domains。
  * - 传入 persistedDomains：只清除集合内 domain，保留 flush 期间新增的 dirty。
  * - 传入 persistedRevision：只把 persistedRevision 推进到 min(snapshotRevision, persistentRevision)，
  *   避免把 buildSnapshot 之后产生的新变更误标为已落库。
  * - 不传参数：兼容旧链路的"全清"语义。
  */
 markPersisted(
  playerId: string,
  persistedDomains?: Iterable<string> | null,
  persistedRevision?: number | null,
 ) {
  const player = this.players.get(playerId);
  if (!player) {
   return;
  }

  // 同一 domain 在 IO 期间可能再次变脏。当前 dirtyDomains 是集合而不是版本化队列，
  // 因此只要全局 revision 已越过快照版本，就保守保留本轮所有 domain，交给下一轮重刷。
  const hasMutationAfterSnapshot = persistedRevision != null
   && Number.isFinite(persistedRevision)
   && player.persistentRevision > persistedRevision;
  if (persistedDomains && !hasMutationAfterSnapshot) {
   for (const domain of persistedDomains) {
    const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
    if (normalizedDomain) {
     const domainRevision = getPlayerPersistenceDomainRevision(player, normalizedDomain);
     player.dirtyDomains?.delete(domain);
     ensurePlayerPersistencePersistedMap(player).set(
      normalizedDomain,
      domainRevision,
     );
     clearPendingTechniqueComprehensionEmptyOverwriteAuthorizationIfPersisted(
      player,
      normalizedDomain,
      domainRevision,
     );
    }
   }
  } else {
   if (!persistedDomains && !hasMutationAfterSnapshot) {
    const dirtyDomains = player.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [];
    for (const domain of dirtyDomains) {
     const domainRevision = getPlayerPersistenceDomainRevision(player, domain);
     ensurePlayerPersistencePersistedMap(player).set(
      domain,
      domainRevision,
     );
     clearPendingTechniqueComprehensionEmptyOverwriteAuthorizationIfPersisted(
      player,
      domain,
      domainRevision,
     );
    }
    clearPlayerDirtyDomains(player);
   }
  }

  // 只推进到快照时的 revision，不跳过 flush 期间的新变更
  if (persistedRevision != null && Number.isFinite(persistedRevision)) {
   player.persistedRevision = Math.min(persistedRevision, player.persistentRevision);
  } else {
   player.persistedRevision = player.persistentRevision;
  }
 }
 /**
* snapshot：执行快照相关逻辑。
* @param playerId 玩家 ID。
* @returns 无返回值，直接更新快照相关状态。
*/

 snapshot(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.players.get(playerId);
  if (!player) {
   return null;
  }
  return cloneRuntimePlayerState(player);
 }
 /** 读取在线玩家身份轻量投影，供鉴权/账号链路避免完整玩家深拷贝。 */
 getPlayerIdentityProjection(playerId) {
  const player = this.players.get(playerId);
  if (!player) {
   return null;
  }
  return {
   playerId: player.playerId,
   name: player.name,
   displayName: player.displayName,
  };
 }
 /**
* listPlayerSnapshots：读取玩家快照并返回结果。
* @returns 无返回值，完成玩家快照的读取/组装。
*/

 listPlayerSnapshots() {
  return Array.from(this.players.values(), (player) => cloneRuntimePlayerState(player));
 }
 /** 只返回当前已水合玩家 ID，避免只需身份的运维链路深拷完整玩家运行态。 */
 listPlayerIds() {
  return Array.from(this.players.keys());
 }
 /** 列出 GM 列表所需的轻量玩家摘要，避免为诊断面板深拷贝完整玩家运行态。 */
 listGmPlayerSummaries() {
  return Array.from(this.players.values(), (player) => ({
   playerId: player.playerId,
   name: player.name,
   displayName: player.displayName,
   sessionId: player.sessionId,
   instanceId: player.instanceId,
   templateId: player.templateId,
   x: player.x,
   y: player.y,
   hp: player.hp,
   maxHp: player.maxHp,
   qi: player.qi,
   realm: player.realm
    ? {
     realmLv: player.realm.realmLv,
     name: player.realm.name,
     displayName: player.realm.displayName,
    }
    : null,
   combat: {
    autoBattle: player.combat?.autoBattle === true,
    autoBattleStationary: player.combat?.autoBattleStationary === true,
    autoRetaliate: player.combat?.autoRetaliate !== false,
   },
   persistentRevision: player.persistentRevision,
   persistedRevision: player.persistedRevision,
  }));
 }
 /** 列出排行榜与世界摘要所需的轻量投影，避免低频榜单重算深拷完整玩家运行态。 */
 listLeaderboardPlayerProjections() {
  return Array.from(this.players.values(), (player) => ({
   playerId: player.playerId,
   name: player.name,
   displayName: player.displayName,
   sessionId: player.sessionId,
   templateId: player.templateId,
   instanceId: player.instanceId,
   x: player.x,
   y: player.y,
   realm: player.realm,
   foundation: player.foundation,
   inventory: player.inventory,
   wallet: player.wallet,
   marketStorage: player.marketStorage,
   attrs: player.attrs,
   combat: player.combat,
   alchemyJob: player.alchemyJob,
   enhancementJob: player.enhancementJob,
   bodyTraining: player.bodyTraining,
   alchemySkill: player.alchemySkill,
   forgingSkill: player.forgingSkill,
   enhancementSkill: player.enhancementSkill,
   transmissionSkill: player.transmissionSkill,
   gatherSkill: player.gatherSkill,
   miningSkill: player.miningSkill,
   buildingSkill: player.buildingSkill,
   formationSkill: player.formationSkill,
   monsterKillCount: player.monsterKillCount,
   eliteMonsterKillCount: player.eliteMonsterKillCount,
   bossMonsterKillCount: player.bossMonsterKillCount,
   playerKillCount: player.playerKillCount,
   deathCount: player.deathCount,
   __leaderboardInWorld: player.__leaderboardInWorld,
  }));
 }
 /**
  * 从持久化快照构建排行榜所需的轻量投影对象。
  * 跳过 inventory normalize、quests clone、logbook、notices、npcQuestMarkerCache 等
  * 排行榜不需要的大数据，只保留 createSnapshot + buildState 所需的最小字段集。
  * 相比完整 hydrateFromSnapshot，每个对象节省约 60-80% 内存分配。
  */
 buildLeaderboardProjectionFromSnapshot(playerId, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
   return null;
  }
  try {
   const defaultEquipment = buildEquipmentSnapshot(this.contentTemplateRepository.createDefaultEquipment());
   const realm = normalizeRealmState(snapshot.progression?.realm);
   const bodyTraining = normalizeBodyTrainingState(snapshot.progression?.bodyTraining);
   const equipmentSlots = snapshot.equipment.slots.length > 0
    ? normalizeEquipmentSlotsWithTemplates(snapshot.equipment.slots, this.contentTemplateRepository)
    : defaultEquipment;
   const techniques = snapshot.techniques.techniques
    .map((entry) => this.contentTemplateRepository.hydrateTechniqueState(entry))
    .filter((entry) => Boolean(entry));
   const buffs = Array.isArray(snapshot.buffs?.buffs)
    ? snapshot.buffs.buffs.map((entry) => createRuntimeTemporaryBuff(entry))
    : [];
   const runtimeBonuses = cloneRuntimeBonusesForSnapshot(snapshot.runtimeBonuses);
   // 构建最小化 player 形状，仅供 buildState 计算 finalAttrs
   const player = {
    playerId,
    sessionId: null,
    name: playerId,
    displayName: playerId,
    templateId: snapshot.placement.templateId,
    instanceId: normalizePlayerPlacementInstanceId(snapshot.placement.instanceId)
     ?? buildPublicPlayerInstanceId(snapshot.placement.templateId),
    x: snapshot.placement.x,
    y: snapshot.placement.y,
    foundation: normalizeCounter(snapshot.progression?.foundation),
    rootFoundation: normalizeCounter(snapshot.progression?.rootFoundation),
    realm,
    bodyTraining,
    alchemySkill: normalizeCraftSkillState(snapshot.progression?.alchemySkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    forgingSkill: normalizeCraftSkillState(snapshot.progression?.forgingSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    enhancementSkill: normalizeCraftSkillState(snapshot.progression?.enhancementSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    transmissionSkill: normalizeCraftSkillState(snapshot.progression?.transmissionSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    gatherSkill: normalizeCraftSkillState(snapshot.progression?.gatherSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    miningSkill: normalizeCraftSkillState(snapshot.progression?.miningSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    buildingSkill: normalizeCraftSkillState(snapshot.progression?.buildingSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    formationSkill: normalizeCraftSkillState(snapshot.progression?.formationSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
    attrs: this.playerAttributesService.createInitialState(),
    equipment: { revision: 1, slots: equipmentSlots },
    artifacts: normalizeArtifactStateWithTemplates(snapshot.artifacts, this.contentTemplateRepository, false),
    movementCapabilities: { staticObstacleIgnore: false },
    techniques: { revision: 1, techniques, cultivatingTechId: snapshot.techniques.cultivatingTechId },
    pendingTechniqueComprehensions: clonePendingTechniqueComprehensions(snapshot.techniques?.pendingComprehensions),
    buffs: { revision: 1, buffs },
    runtimeBonuses,
    combat: {
     cultivationActive: snapshot.combat?.cultivationActive === true
      || (snapshot.combat?.cultivationActive === undefined && snapshot.techniques.cultivatingTechId !== null),
     autoBattle: snapshot.combat?.autoBattle === true,
     combatTargetId: typeof snapshot.combat?.combatTargetId === 'string' && snapshot.combat.combatTargetId.trim()
      ? snapshot.combat.combatTargetId.trim()
      : null,
    },
    alchemyJob: snapshot.progression?.alchemyJob ?? null,
    enhancementJob: snapshot.progression?.enhancementJob ?? null,
    // inventory/wallet/marketStorage 保留原始数据用于灵石计数，不做 normalizeItem
    inventory: {
     items: snapshot.inventory.items ?? [],
     lockedItems: Array.isArray(snapshot.inventory.lockedItems) ? snapshot.inventory.lockedItems : [],
    },
    wallet: { balances: Array.isArray(snapshot.wallet?.balances) ? snapshot.wallet.balances : [] },
    marketStorage: { items: Array.isArray(snapshot.marketStorage?.items) ? snapshot.marketStorage.items : [] },
    hp: snapshot.vitals.hp,
    maxHp: snapshot.vitals.maxHp,
    qi: snapshot.vitals.qi,
    maxQi: snapshot.vitals.maxQi,
    selfRevision: 1,
   };
   player.attrs.rawBaseAttrs = decodePersistedRawBaseAttrs(snapshot.attrState?.baseAttrs);
   // 计算 finalAttrs（不修改 hp/qi/selfRevision，排行榜不需要）
   this.playerAttributesService.recalculate(player, 'leaderboard_projection');
   return player;
  } catch (_error) {
   return null;
  }
 }
 /**
* restoreSnapshot：执行restore快照相关逻辑。
* @param snapshot 参数说明。
* @returns 无返回值，直接更新restore快照相关状态。
*/

 restoreSnapshot(snapshot) {
  this.players.set(snapshot.playerId, cloneRuntimePlayerState(snapshot));
 }
 /**
* hydrateFromSnapshot：执行hydrateFrom快照相关逻辑。
* @param playerId 玩家 ID。
* @param sessionId session ID。
* @param snapshot 参数说明。
* @returns 无返回值，直接更新hydrateFrom快照相关状态。
*/

 hydrateFromSnapshot(playerId, sessionId, snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const defaultEquipment = buildEquipmentSnapshot(this.contentTemplateRepository.createDefaultEquipment());
  const fallbackRespawnTemplateId = this.mapTemplateRepository.has(DEFAULT_PLAYER_STARTER_MAP_ID)
   ? DEFAULT_PLAYER_STARTER_MAP_ID
   : snapshot.placement.templateId;
  const snapshotRespawnTemplateId = typeof snapshot.respawn?.templateId === 'string' && snapshot.respawn.templateId.trim()
   ? snapshot.respawn.templateId.trim()
   : fallbackRespawnTemplateId;
  const snapshotRespawnTemplate = snapshotRespawnTemplateId && this.mapTemplateRepository.has(snapshotRespawnTemplateId)
   ? this.mapTemplateRepository.getOrThrow(snapshotRespawnTemplateId)
   : null;
  const snapshotRespawnInstanceId = normalizePlayerPlacementInstanceId(snapshot.respawn?.instanceId)
   ?? (snapshotRespawnTemplateId ? buildPublicPlayerInstanceId(snapshotRespawnTemplateId) : null);
  const snapshotRespawnPlacement = resolveRespawnPlacement(
   this.mapTemplateRepository,
   snapshotRespawnTemplateId,
   snapshot.respawn?.x,
   snapshot.respawn?.y,
  );
  const snapshotRespawnX = snapshotRespawnPlacement.x;
  const snapshotRespawnY = snapshotRespawnPlacement.y;
  const snapshotRespawnRepaired = Boolean(
   snapshot.respawn
   && snapshotRespawnTemplateId
   && (!Number.isFinite(snapshot.respawn.x)
    || !Number.isFinite(snapshot.respawn.y)
    || Math.trunc(snapshot.respawn.x) !== snapshotRespawnX
    || Math.trunc(snapshot.respawn.y) !== snapshotRespawnY)
  );

  const snapshotRealm = normalizeRealmState(snapshot.progression?.realm);
  const pendingComprehensions = this.normalizePendingTechniqueComprehensionsForRuntime(
   snapshot.techniques?.pendingComprehensions,
   snapshotRealm.realmLv,
  );
  const legacyTransmissionJob = normalizeLegacyTransmissionJobFromPending(
   snapshot.techniques?.pendingComprehensions,
   pendingComprehensions.entries,
  );
  const player = {
   playerId,
   sessionId,
   runtimeOwnerId: null,
   sessionEpoch: 0,
   lastHeartbeatAt: null,
   offlineSinceAt: null,
   name: playerId,
   displayName: playerId,
   sectId: typeof snapshot.sectId === 'string' && snapshot.sectId.trim() ? snapshot.sectId.trim() : null,
   persistentRevision: 1,
   persistedRevision: 1,
   instanceId: normalizePlayerPlacementInstanceId(snapshot.placement.instanceId)
    ?? buildPublicPlayerInstanceId(snapshot.placement.templateId),
   templateId: snapshot.placement.templateId,
   respawnTemplateId: snapshotRespawnTemplateId,
   respawnInstanceId: snapshotRespawnInstanceId,
   respawnX: snapshotRespawnX,
   respawnY: snapshotRespawnY,
   worldPreference: {
    linePreset: normalizePlayerWorldPreferenceLinePreset(snapshot.worldPreference?.linePreset),
   },
   x: snapshot.placement.x,
   y: snapshot.placement.y,
   facing: normalizeHorizontalFacing(snapshot.placement.facing),
   hp: snapshot.vitals.hp,
   maxHp: snapshot.vitals.maxHp,
   qi: snapshot.vitals.qi,
   maxQi: snapshot.vitals.maxQi,
   foundation: normalizeCounter(snapshot.progression?.foundation),
   rootFoundation: normalizeCounter(snapshot.progression?.rootFoundation),
   combatExp: normalizeCounter(snapshot.progression?.combatExp),
   comprehension: normalizeCounter(snapshot.progression?.comprehension),
   comprehensionSpeedRate: 0,
   luck: normalizeCounter(snapshot.progression?.luck),
   dailySignInFortuneLuck: 0,
   dailySignInFortuneExpireAt: 0,
   bodyTraining: normalizeBodyTrainingState(snapshot.progression?.bodyTraining),
   boneAgeBaseYears: normalizeBoneAgeBaseYears(snapshot.progression?.boneAgeBaseYears),
   lifeElapsedTicks: normalizeLifeElapsedTicks(snapshot.progression?.lifeElapsedTicks),
   lifespanYears: normalizeLifespanYears(snapshot.progression?.lifespanYears),
   stamina: Math.max(0, Math.min(DUNGEON_MAX_STAMINA, Math.trunc(Number(snapshot.progression?.stamina) || DUNGEON_MAX_STAMINA))),
   staminaUpdatedAt: Math.max(0, Math.trunc(Number(snapshot.progression?.staminaUpdatedAt) || Date.now())),
   realm: snapshotRealm,
   heavenGate: normalizeHeavenGateState(snapshot.progression?.heavenGate),
   spiritualRoots: normalizeHeavenGateRoots(snapshot.progression?.spiritualRoots),
   alchemySkill: normalizeCraftSkillState(snapshot.progression?.alchemySkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   forgingSkill: normalizeCraftSkillState(snapshot.progression?.forgingSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   gatherSkill: normalizeCraftSkillState(snapshot.progression?.gatherSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   buildingSkill: normalizeCraftSkillState(snapshot.progression?.buildingSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   miningSkill: normalizeCraftSkillState(snapshot.progression?.miningSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   formationSkill: normalizeCraftSkillState(snapshot.progression?.formationSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   transmissionSkill: normalizeCraftSkillState(snapshot.progression?.transmissionSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   transmissionJob: normalizeTransmissionJob(snapshot.progression?.transmissionJob) ?? legacyTransmissionJob,
   gatherJob: normalizeGatherJob(snapshot.progression?.gatherJob),
   buildingJob: normalizeBuildingJob(snapshot.progression?.buildingJob),
   miningJob: normalizeMiningJob(snapshot.progression?.miningJob),
   formationJob: normalizeFormationJob(snapshot.progression?.formationJob),
   techniqueActivityQueue: normalizeTechniqueActivityQueue(snapshot.progression?.techniqueActivityQueue),
   alchemyPresets: normalizeAlchemyPresets(snapshot.progression?.alchemyPresets),
   alchemyJob: normalizeAlchemyJob(snapshot.progression?.alchemyJob),
   forgingJob: normalizeAlchemyJob(snapshot.progression?.forgingJob),
   enhancementSkill: normalizeCraftSkillState(snapshot.progression?.enhancementSkill, (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level)),
   enhancementSkillLevel: Math.max(1, Math.floor(Number(snapshot.progression?.enhancementSkillLevel ?? snapshot.progression?.enhancementSkill?.level) || 1)),
   enhancementJob: normalizeEnhancementJob(snapshot.progression?.enhancementJob),
   enhancementRecords: normalizeEnhancementRecords(snapshot.progression?.enhancementRecords),
   pendingTechniqueComprehensions: pendingComprehensions.entries,
   allowPendingTechniqueComprehensionEmptyOverwrite: false,
   pendingTechniqueComprehensionEmptyOverwriteRevision: 0,
   pendingTechniqueComprehensionEmptyOverwriteTechIds: new Set(),
   unlockedMapIds: snapshot.unlockedMapIds.slice(),
   selfRevision: 1,
   inventory: {
    revision: Math.max(1, snapshot.inventory.revision),
    capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, snapshot.inventory.capacity),
    items: snapshot.inventory.items
     .filter((entry) => entry && typeof entry === 'object' && typeof entry.itemId === 'string' && entry.itemId)
     .map((entry) => this.contentTemplateRepository.normalizeItem(entry)),
    lockedItems: Array.isArray(snapshot.inventory.lockedItems)
     ? snapshot.inventory.lockedItems.map((entry) => ({ ...entry }))
     : [],
   },
   wallet: {
    balances: Array.isArray(snapshot.wallet?.balances)
     ? snapshot.wallet.balances.map((entry) => ({ ...entry }))
     : [],
   },
   marketStorage: {
    items: Array.isArray(snapshot.marketStorage?.items)
     ? snapshot.marketStorage.items.map((entry) => ({ ...entry }))
     : [],
   },
   equipment: {
    revision: Math.max(1, snapshot.equipment.revision),
    slots: snapshot.equipment.slots.length > 0
     ? normalizeEquipmentSlotsWithTemplates(snapshot.equipment.slots, this.contentTemplateRepository)
     : defaultEquipment,
   },
   artifacts: normalizeArtifactStateWithTemplates(snapshot.artifacts, this.contentTemplateRepository, false),
   movementCapabilities: { staticObstacleIgnore: false },
   techniques: {
    revision: Math.max(1, snapshot.techniques.revision),
    techniques: snapshot.techniques.techniques
     .map((entry) => this.contentTemplateRepository.hydrateTechniqueState(entry))
     .filter((entry) => Boolean(entry)),
    cultivatingTechId: snapshot.techniques.cultivatingTechId,
   },
   attrs: this.playerAttributesService.createInitialState(),
   actions: {
    revision: 1,
    contextActions: [],
    actions: [],
   },
   buffs: {
    revision: Math.max(1, snapshot.buffs?.revision ?? 1),
    buffs: Array.isArray(snapshot.buffs?.buffs)
     ? snapshot.buffs.buffs.map((entry) => createRuntimeTemporaryBuff(entry))
     : [],
   },
   combat: {
    cooldownReadyTickBySkillId: {},

    autoBattle: snapshot.combat?.autoBattle === true,

    autoRetaliate: snapshot.combat?.autoRetaliate !== false,

    autoBattleStationary: snapshot.combat?.autoBattleStationary === true,
    autoUsePills: normalizePersistedAutoUsePills(snapshot.combat?.autoUsePills),
    combatTargetingRules: normalizePersistedCombatTargetingRules(snapshot.combat?.combatTargetingRules),
    autoBattleTargetingMode: normalizePersistedAutoBattleTargetingMode(snapshot.combat?.autoBattleTargetingMode),
    retaliatePlayerTargetId: typeof snapshot.combat?.retaliatePlayerTargetId === 'string' && snapshot.combat.retaliatePlayerTargetId.trim()
     ? snapshot.combat.retaliatePlayerTargetId.trim()
     : null,
    retaliatePlayerTargetLastAttackTick: Number.isFinite(Number(snapshot.combat?.retaliatePlayerTargetLastAttackTick))
     ? Math.max(0, Math.trunc(Number(snapshot.combat.retaliatePlayerTargetLastAttackTick)))
     : null,

    combatTargetId: typeof snapshot.combat?.combatTargetId === 'string' && snapshot.combat.combatTargetId.trim()
     ? snapshot.combat.combatTargetId.trim()
     : null,

    combatTargetLocked: snapshot.combat?.combatTargetLocked === true
     && typeof snapshot.combat?.combatTargetId === 'string'
     && snapshot.combat.combatTargetId.trim().length > 0,
    manualEngagePending: false,

    allowAoePlayerHit: snapshot.combat?.allowAoePlayerHit === true,

    autoIdleCultivation: snapshot.combat?.autoIdleCultivation !== false,

    autoSwitchCultivation: snapshot.combat?.autoSwitchCultivation === true,
    autoRootFoundation: snapshot.combat?.autoRootFoundation === true,
    combatAttackIntensity: normalizeCombatAttackIntensity(snapshot.combat?.combatAttackIntensity ?? DEFAULT_COMBAT_ATTACK_INTENSITY),

    senseQiActive: snapshot.combat?.senseQiActive === true,
    wangQiActive: snapshot.combat?.wangQiActive === true,
    autoBattleSkills: normalizePersistedAutoBattleSkills(snapshot.combat?.autoBattleSkills),

    cultivationActive: snapshot.combat?.cultivationActive === true
     || (snapshot.combat?.cultivationActive === undefined && snapshot.techniques.cultivatingTechId !== null),
    lastActiveTick: 0,
    combatActionTick: 0,
    combatActionsUsedThisTick: 0,
   },
   notices: {
    nextId: 1,
    queue: [],
   },
   quests: {
    revision: Math.max(1, snapshot.quests.revision),
    quests: cloneQuestRuntimeEntries(snapshot.quests.entries),
   },
   lootWindowTarget: null,
   pendingLogbookMessages: normalizePendingLogbookMessages(snapshot.pendingLogbookMessages),
   vitalRecoveryDeferredUntilTick: -1,
   runtimeBonuses: cloneRuntimeBonusesForSnapshot(snapshot.runtimeBonuses),
   dirtyDomains: createPlayerDirtyDomainSet(),
   // 玩家维度 NPC quest marker 投影缓存；hydrate 路径同样初始化，跟随玩家运行态生命周期。
   npcQuestMarkerCache: new Map(),
  };
  player.attrs.rawBaseAttrs = decodePersistedRawBaseAttrs(snapshot.attrState?.baseAttrs);
  player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
  this.playerProgressionService.initializePlayer(player);
  this.ensureArtifactUnlockState(player, { emitMovementCapabilityDelta: false });
  if (pendingComprehensions.changed) {
   markPlayerDirtyDomains(player, ['technique']);
   this.bumpPersistentRevision(player);
  }
  if (legacyTransmissionJob) {
   markPlayerDirtyDomains(player, ['technique', 'active_job']);
   this.bumpPersistentRevision(player);
  }
  this.refreshWalletCacheFromInventory(player);
  if (ensureVitalBaselineBonus(player, snapshot.vitals)) {
   this.playerAttributesService.recalculate(player, 'initialization');
   markPlayerDirtyDomains(player, ['attr']);
   player.hp = clamp(snapshot.vitals.hp, 0, player.maxHp);
   player.qi = clamp(snapshot.vitals.qi, 0, player.maxQi);
  }
  if (snapshotRespawnRepaired) {
   markPlayerDirtyDomains(player, ['world_anchor']);
   this.bumpPersistentRevision(player);
  }
  // 水合期合并：把旧版拆分开的同 (itemId, enhanceLevel) 签名堆叠重新合到同一 slot。
  // 这解决 itemInstanceId 引入时 canMergeItemStack 过于严格导致的碎片化。
  if (coalesceInventoryItems(player.inventory.items)) {
   markPlayerDirtyDomains(player, ['inventory']);
   this.bumpPersistentRevision(player);
  }

  // 水合期 lazy 升级：如果 inventory / equipment 里的装备携带迁移期 fallback
  // itemInstanceId（含":"，如 inv:p_xxx:0），就在此分配新 UUID 替换。
  // 升级后的 instanceId 会随下一次 flush 落回数据库，从此该装备拥有稳定身份。
  let upgradedAny = false;
  for (const entry of player.inventory.items ?? []) {
   if (assignItemInstanceIdIfNeeded(entry)) {
    upgradedAny = true;
   }
  }
  for (const slotEntry of player.equipment.slots ?? []) {
   if (slotEntry?.item && assignItemInstanceIdIfNeeded(slotEntry.item)) {
    upgradedAny = true;
   }
  }
  let upgradedArtifactAny = false;
  for (const artifactEntry of player.artifacts?.slots ?? []) {
   if (artifactEntry?.item && assignItemInstanceIdIfNeeded(artifactEntry.item)) {
    upgradedArtifactAny = true;
   }
  }
  if (upgradedAny) {
   markPlayerDirtyDomains(player, ['inventory', 'equipment']);
   this.bumpPersistentRevision(player);
  }
  if (upgradedArtifactAny) {
   markPlayerDirtyDomains(player, ['artifact']);
   this.bumpPersistentRevision(player);
  }
  if (repairDuplicateInventoryItemInstanceIds(player.inventory.items)) {
   markPlayerDirtyDomains(player, ['inventory']);
   this.bumpPersistentRevision(player);
  }
  restoreConsumableCooldownStateFromPersistentBuffs(player);
  // 水合期迁移：旧版 enhancementJob 直接持有 item 完整快照；新版只存 itemInstanceId，
  // 实际物品落在 inventory.lockedItems。若读到旧格式，把 job.item 迁入 lockedItems
  // 并在 job 上保留 itemInstanceId，保证旧存档的进行中强化任务不丢失工件。
  if (player.enhancementJob && typeof player.enhancementJob === 'object') {
   const legacyItem = player.enhancementJob.item;
   const hasInstanceId = typeof player.enhancementJob.itemInstanceId === 'string'
    && player.enhancementJob.itemInstanceId.length > 0;
   if (!hasInstanceId && legacyItem && typeof legacyItem === 'object') {
    assignItemInstanceIdIfNeeded(legacyItem);
    const legacyInstanceId = typeof legacyItem.itemInstanceId === 'string'
     ? legacyItem.itemInstanceId
     : '';
    if (legacyInstanceId) {
     player.inventory.lockedItems.push({
      ...legacyItem,
      itemInstanceId: legacyInstanceId,
      itemId: String(legacyItem.itemId ?? player.enhancementJob.targetItemId ?? ''),
      count: Math.max(1, Math.trunc(Number(legacyItem.count) || 1)),
      lockedBy: `enhancement:${player.enhancementJob.jobRunId ?? 'legacy'}`,
      lockedAt: Date.now(),
     });
     player.enhancementJob.itemInstanceId = legacyInstanceId;
     // 迁移成功：清理旧字段并标脏，确保下次 flush 落库
     delete player.enhancementJob.item;
     markPlayerDirtyDomains(player, ['inventory', 'active_job']);
     this.bumpPersistentRevision(player);
    }
   }
  }
  if (migrateLegacyCraftQueuedJobsToTechniqueActivityQueue(player)) {
   markPlayerDirtyDomains(player, ['active_job']);
   this.bumpPersistentRevision(player);
  }
  if (repairEnhancementRecoveryDisplayNames(player, this.contentTemplateRepository)) {
   this.bumpPersistentRevision(player);
  }
  if (repairInvalidEnhancementRecoveryState(player)) {
   this.bumpPersistentRevision(player);
  }
  this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
  return player;
 }
 /**
* bumpPersistentRevision：判断bumpPersistentRevision是否满足条件。
* @param player 玩家对象。
* @returns 无返回值，直接更新bumpPersistentRevision相关状态。
*/

 bumpPersistentRevision(player) {
  player.persistentRevision += 1;
 }
 /**
* markPersistenceDirtyDomains：为玩家补记持久化脏域。
* @param player 玩家对象。
* @param domains 脏域列表。
* @returns 无返回值，直接更新持久化脏域。
*/

 markPersistenceDirtyDomains(player, domains) {
  markPlayerDirtyDomains(player, domains);
 }
 async persistAutoBattleSkills(player) {
  if (isFlushTaskConsumerMode()) {
   return;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return;
  }
  const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
  if (!playerId) {
   return;
  }
  await this.playerDomainPersistenceService.savePlayerAutoBattleSkills(
   playerId,
   Array.isArray(player.combat?.autoBattleSkills) ? player.combat.autoBattleSkills : [],
   { versionSeed: nextPlayerPersistenceVersion() },
  );
 }
 async persistAutoUseItemRules(player) {
  if (isFlushTaskConsumerMode()) {
   return;
  }
  if (!this.playerDomainPersistenceService?.isEnabled?.()) {
   return;
  }
  const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
  if (!playerId) {
   return;
  }
  await this.playerDomainPersistenceService.savePlayerAutoUseItemRules(
   playerId,
   Array.isArray(player.combat?.autoUsePills) ? player.combat.autoUsePills : [],
   { versionSeed: nextPlayerPersistenceVersion() },
  );
 }
 /**
* bindRuntimeSession：为玩家生成新的运行时所有权 fencing。
* @param player 玩家对象。
* @param sessionId session ID。
* @returns 无返回值，直接更新会话所有权。
*/

 bindRuntimeSession(player, sessionId) {
  this.ensureTransferRuntimeState(player);
  this.rollbackExpiredTransfer(player);
  player.transferWriteBlocked = false;
  player.sessionId = sessionId;
  player.sessionEpoch = Math.max(1, Math.trunc(Number(player.sessionEpoch ?? 0)) + 1);
  player.runtimeOwnerId = buildRuntimeOwnerId(player.playerId, sessionId, player.sessionEpoch);
  player.lastHeartbeatAt = Date.now();
  player.offlineSinceAt = null;
  player.offlineHangingExpiredAt = null;
  player.offlineHangingReapReadyAt = null;
  this.playerStatisticSnapshotsByPlayerId.set(player.playerId, buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService));
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  return player;
 }
 refreshRuntimeSession(player, sessionId) {
  this.ensureTransferRuntimeState(player);
  this.rollbackExpiredTransfer(player);
  player.transferWriteBlocked = false;
  const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
  const existingSessionId = typeof player.sessionId === 'string' ? player.sessionId.trim() : '';
  if (normalizedSessionId && normalizedSessionId === existingSessionId && player.runtimeOwnerId) {
   player.lastHeartbeatAt = Date.now();
   player.offlineSinceAt = null;
   player.offlineHangingExpiredAt = null;
   player.offlineHangingReapReadyAt = null;
   markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
   return player;
  }
  return this.bindRuntimeSession(player, sessionId);
 }
 ensureRuntimeSessionFenceAtLeast(playerId, sessionEpochFloor) {
  const player = this.getPlayer(playerId);
  if (!player) {
   return null;
  }
  const normalizedFloor = Number.isFinite(sessionEpochFloor)
   ? Math.max(0, Math.trunc(Number(sessionEpochFloor)))
   : 0;
  const currentEpoch = Number.isFinite(player.sessionEpoch)
   ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
   : 0;
  if (normalizedFloor <= 0 || (currentEpoch > normalizedFloor && player.runtimeOwnerId)) {
   return this.getSessionFence(playerId);
  }
  player.sessionEpoch = Math.max(currentEpoch, normalizedFloor);
  const normalizedSessionId = typeof player.sessionId === 'string' && player.sessionId.trim()
   ? player.sessionId.trim()
   : `session:${player.playerId}`;
  this.bindRuntimeSession(player, normalizedSessionId);
  return this.getSessionFence(playerId);
 }
 beginTransfer(player, targetNodeId) {
  this.ensureTransferRuntimeState(player);
  const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
  const now = Date.now();
  const normalizedSessionId = typeof player?.sessionId === 'string' && player.sessionId.trim()
   ? player.sessionId.trim()
   : 'transfer';
  player.sessionEpoch = Math.max(1, Math.trunc(Number(player.sessionEpoch ?? 0)) + 1);
  player.runtimeOwnerId = buildRuntimeOwnerId(player.playerId, normalizedSessionId, player.sessionEpoch);
  player.lastHeartbeatAt = now;
  player.offlineSinceAt = null;
  player.offlineHangingExpiredAt = null;
  player.offlineHangingReapReadyAt = null;
  player.transferState = 'in_transfer';
  player.transferTargetNodeId = normalizedTargetNodeId || null;
  player.transferStartedAt = now;
  player.transferDeadlineAt = now + PLAYER_TRANSFER_TIMEOUT_MS;
  player.transferWriteBlocked = false;
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  return player;
 }
 completeTransfer(player) {
  this.ensureTransferRuntimeState(player);
  player.transferState = null;
  player.transferTargetNodeId = null;
  player.transferStartedAt = null;
  player.transferDeadlineAt = null;
  player.transferWriteBlocked = false;
  this.flushTransferBufferedNotices(player);
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  return player;
 }
 rollbackExpiredTransfer(player, now = Date.now()) {
  if (!player || player.transferState !== 'in_transfer') {
   return false;
  }
  this.ensureTransferRuntimeState(player);
  if (!Number.isFinite(player.transferDeadlineAt) || now < Number(player.transferDeadlineAt)) {
   return false;
  }
  player.transferState = null;
  player.transferTargetNodeId = null;
  player.transferStartedAt = null;
  player.transferDeadlineAt = null;
  player.transferWriteBlocked = true;
  player.transferBufferedNotices.length = 0;
  this.flushTransferBufferedNotices(player);
  markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
  return true;
 }
 ensureTransferRuntimeState(player) {
  if (!player) {
   return player;
  }
  if (!Array.isArray(player.transferBufferedNotices)) {
   player.transferBufferedNotices = [];
  }
  if (player.transferWriteBlocked !== true) {
   player.transferWriteBlocked = false;
  }
  return player;
 }
 flushTransferBufferedNotices(player) {
  this.ensureTransferRuntimeState(player);
  if (!player || !Array.isArray(player.transferBufferedNotices) || player.transferBufferedNotices.length === 0) {
   return player;
  }
  const buffered = player.transferBufferedNotices.map((entry) => ({ ...entry }));
  player.transferBufferedNotices.length = 0;
  if (buffered.length === 0) {
   return player;
  }
  // 委托给 EventBus（如果可用），否则回退到本地队列
  if (this.runtimeEventBusService) {
   for (const notice of buffered) {
    this.runtimeEventBusService.queuePlayerNotice(player.playerId, notice);
   }
  } else {
   player.notices.queue.push(...buffered);
  }
  return player;
 }
 /**
* applyProgressionResult：处理修炼进度结果并更新相关状态。
* @param player 玩家对象。
* @param result 返回结果。
* @param currentTick 参数说明。
* @param rebuildActions 参数说明。
* @returns 无返回值，直接更新修炼进度结果相关状态。
*/

 applyProgressionResult(player, result, currentTick = 0, rebuildActions = false) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (result.notices.length > 0) {
   for (const notice of result.notices) {
    const text = notice.text.trim();
    if (!text) {
     continue;
    }
    const entry = {
     id: player.notices.nextId,
     kind: notice.kind,
     text,
     ...(notice.structured ? { structured: notice.structured } : {}),
     ...(Array.isArray(notice.structuredGroup) && notice.structuredGroup.length > 0 ? { structuredGroup: notice.structuredGroup } : {}),
    };
    player.notices.nextId += 1;
    if (this.runtimeEventBusService) {
     this.runtimeEventBusService.queuePlayerNotice(player.playerId, entry);
    } else {
     player.notices.queue.push(entry);
    }
   }
  }
  if (result.changed && (rebuildActions || result.actionsDirty === true)) {
   this.rebuildActionState(player, currentTick);
  }
  if (result.changed) {
   const dirtyDomains = Array.isArray(result.dirtyDomains) && result.dirtyDomains.length > 0
    ? result.dirtyDomains
    : ['progression'];
   if (dirtyDomains.includes('inventory')) {
    this.refreshWalletCacheFromInventory(player);
   }
   markPlayerDirtyDomains(player, dirtyDomains);
   if (dirtyDomains.includes('technique')) {
    this.authorizePendingTechniqueComprehensionRemovals(
     player,
     result.pendingTechniqueComprehensionRemovedIds,
    );
   }
  }
  return player;
 }
 /** 发送结构化玩家通知，服务端只携带 key 与变量，文本仅作为兼容 fallback。 */
 queuePlayerStructuredNotice(player, notice) {
  const text = typeof notice?.text === 'string' ? notice.text.trim() : '';
  const structured = notice?.structured;
  const structuredGroup = Array.isArray(notice?.structuredGroup) ? notice.structuredGroup : [];
  if (!text && !structured && structuredGroup.length === 0) {
   return;
  }
  const entry = {
   id: player.notices.nextId,
   kind: notice.kind ?? 'info',
   text,
   ...(structured ? { structured } : {}),
   ...(structuredGroup.length > 0 ? { structuredGroup } : {}),
  };
  player.notices.nextId += 1;
  if (this.runtimeEventBusService) {
   this.runtimeEventBusService.queuePlayerNotice(player.playerId, entry);
  }
  else {
   player.notices.queue.push(entry);
  }
 }
 /** applyProgressionResultWithStatistics：应用进度变更，并按变更发生顺序记录收支，避免快照净值互相抵消。 */
 applyProgressionResultWithStatistics(
  player,
  result,
  beforeSnapshot,
  currentTick = 0,
  rebuildActions = false,
  performanceOptions = null,
 ) {
  const applyStartedAt = performance.now();
  this.applyProgressionResult(player, result, currentTick, rebuildActions);
  recordPlayerTickPerf(performanceOptions, 'combat.playerMonsterKill.progressResultApplyMs', applyStartedAt);
  if (result?.changed) {
   const statisticStartedAt = performance.now();
   this.recordPlayerStatisticMutation(player, beforeSnapshot, Date.now(), {
    progressionOnly: isProgressionOnlyStatisticResult(result),
    progressionAndInventoryOnly: isProgressionAndInventoryOnlyStatisticResult(result),
    statisticTechniqueChangedIds: result?.statisticTechniqueChangedIds,
    recordTickSectionDuration: performanceOptions?.recordTickSectionDuration,
   });
   recordPlayerTickPerf(performanceOptions, 'combat.playerMonsterKill.progressStatisticsMs', statisticStartedAt);
  }
  return player;
 }
 /** 根基已达上限时关闭自动凝练，并持久化玩家偏好。 */
 disableAutoRootFoundationAtCap(player, currentTick = 0, emitNotice = true) {
  if (!player || player.combat?.autoRootFoundation !== true) {
   return false;
  }
  if (typeof this.playerProgressionService?.isRootFoundationAtCurrentCap !== 'function'
   || !this.playerProgressionService.isRootFoundationAtCurrentCap(player)) {
   return false;
  }
  player.combat.autoRootFoundation = false;
  this.rebuildActionState(player, currentTick);
  markPlayerDirtyDomains(player, ['combat_pref']);
  this.bumpPersistentRevision(player);
  const text = '根基已达当前境界上限，已关闭自动凝练根基。';
  if (emitNotice) {
   this.queuePlayerStructuredNotice(player, {
    kind: 'info',
    text,
    structured: { key: 'notice.action.auto-root-foundation-cap' },
   });
  }
  return true;
 }
 /**
* rebuildActionState：构建rebuildAction状态。
* @param player 玩家对象。
* @param currentTick 参数说明。
* @returns 无返回值，直接更新rebuildAction状态相关状态。
*/

 rebuildActionState(player, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const playerTick = resolvePlayerRuntimeTick(player, currentTick);
  const nextActionResult = buildActionEntries(player, playerTick);
  const nextActions = nextActionResult.actions;

  const techniqueFlagsChanged = syncTechniqueSkillAvailability(player);
  if (!nextActionResult.changed && !techniqueFlagsChanged && !nextActionResult.autoBattleSkillsChanged) {
   player.actions.actions = nextActions;
   this.actionCooldownProjectionScheduleByPlayer.set(
    player,
    buildActionCooldownProjectionSchedule(player, playerTick),
   );
   return;
  }
  player.actions.actions = nextActions;
  if (nextActionResult.changed) {
   player.actions.revision += 1;
  }
  if (techniqueFlagsChanged) {
   player.techniques.revision += 1;
   markPlayerDirtyDomains(player, ['technique']);
  }
  if (nextActionResult.autoBattleSkillsChanged) {
   this.playerAttributesService.recalculate(player, 'technique_mutation');
   markPlayerDirtyDomains(player, ['attr']);
   markPlayerDirtyDomains(player, ['auto_battle_skill', 'buff']);
  }
  this.actionCooldownProjectionScheduleByPlayer.set(
   player,
   buildActionCooldownProjectionSchedule(player, playerTick),
  );
 }
 /**
* applyConsumableItem：处理Consumable道具并更新相关状态。
* @param player 玩家对象。
* @param item 道具。
* @returns 无返回值，直接更新Consumable道具相关状态。
*/

 applyConsumableItem(player, item) { return applyConsumableItemImpl(this, player, item); }
};
