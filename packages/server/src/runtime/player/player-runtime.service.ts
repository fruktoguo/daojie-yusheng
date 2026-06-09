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
import { Inject, BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ATTR_KEYS, AUTO_IDLE_CULTIVATION_DELAY_TICKS, BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER, DEFAULT_BASE_ATTRS, DEFAULT_BONE_AGE_YEARS, DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS, DEFAULT_INVENTORY_CAPACITY, DEFAULT_PLAYER_REALM_STAGE, Direction, EQUIP_SLOTS, PLAYER_REALM_CONFIG, PLAYER_REALM_ORDER, RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH, TechniqueRealm, calculateTechniqueComprehensionProgressGain, calculateTechniqueComprehensionRequiredProgress, canMergeItemStack, coalesceItemStackList, compileValueStatsToActualStats, computeCraftSkillExpGain, createItemStackSignature, enforceSkillEnabledLimit, getBodyTrainingExpToNext, isCreatedTechniqueId, mergeItemStackInto, normalizeBodyTrainingState, normalizeHorizontalFacing, percentModifierToMultiplier, resolvePlayerSkillSlotLimit, resolveSkillRequiresTarget, resolveTechniqueStandardMaxHpRecoveryAmount, resolveTechniqueStandardMaxQiRecoveryAmount, signedRatioValue } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
import { PVP_SHA_BACKLASH_BUFF_ID, PVP_SHA_BACKLASH_DECAY_TICKS, PVP_SHA_BACKLASH_PERCENT_PER_STACK, PVP_SHA_BACKLASH_SOURCE_ID, PVP_SHA_BACKLASH_STACK_DIVISOR, PVP_SHA_INFUSION_ATTACK_CAP_PERCENT, PVP_SHA_INFUSION_BUFF_ID, PVP_SHA_INFUSION_DECAY_TICKS, PVP_SHA_INFUSION_SOURCE_ID, PVP_SOUL_INJURY_BUFF_ID, PVP_SOUL_INJURY_DURATION_TICKS, PVP_SOUL_INJURY_SOURCE_ID } from '../../constants/gameplay/pvp';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import { MAX_NOTICES_PER_PLAYER, NOTICE_KIND_PRIORITY, findLowestPriorityNoticeIndex } from '../event-bus/runtime-event-bus.types';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerAttributesService } from './player-attributes.service';
import { PlayerProgressionService } from './player-progression.service';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules, normalizePersistedAutoUsePills, normalizePersistedCombatTargetingRules } from './player-combat-config.helpers';
import { projectHeavenGateState, projectRealmState } from './player-realm-projection.helpers';
import { createPlayerRuntimeStateStore } from './player-runtime.state';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from './runtime-buff-instance';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel, resolveInitialCraftSkillExpToNext } from '../craft/craft-skill-exp.helpers';
import { TechniqueActivityPipelineService } from '../craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../craft/pipeline/strategies/transmission.strategy';

/** 新角色默认出生地图。 */
const DEFAULT_PLAYER_STARTER_MAP_ID = 'yunlai_town';

const MAX_ITEM_COUNT = 2_147_483_647;

/** 等待写入 logbook 的消息上限，避免队列无限膨胀。 */
const MAX_PENDING_LOGBOOK_MESSAGES = 200;
/** 玩家跨节点转移超时时间，超时后自动回滚 transfer 态。 */
const PLAYER_TRANSFER_TIMEOUT_MS = 120_000;
/** 被玩家攻击后保留反击仇敌的最长时间，按 1Hz tick 计算为 30 分钟。 */
const RETALIATE_PLAYER_TARGET_TIMEOUT_TICKS = 30 * 60;

const HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.heaven';
const DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID = 'root_seed.divine';
const SHATTER_SPIRIT_PILL_ITEM_ID = 'pill.shatter_spirit';
const WANGSHENG_PILL_ITEM_ID = 'pill.wangsheng';

/** 体能下限来源标记，用于把基础生命回填到运行时。 */
const VITAL_BASELINE_BONUS_SOURCE = 'runtime:vitals_baseline';
const RAW_BASE_ATTRS_PERSISTENCE_MARKER = '__rawBaseAttrs';

/** 可以进入待写 logbook 队列的消息种类。 */
const PENDING_LOGBOOK_KINDS = new Set([
    'system',
    'chat',
    'quest',
    'combat',
    'loot',
    'grudge',
]);
const PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN = 'presence';
const OFFLINE_GAIN_REPORT_MIN_DURATION_MS = 60_000;
const pvpSoulInjuryBuffByRealmLv = new Map();
const pvpShaInfusionBuffByRealmLv = new Map();
const pvpShaBacklashBuffByRealmLv = new Map();
@Injectable()
export class PlayerRuntimeService {
    private readonly logger = new Logger(PlayerRuntimeService.name);
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
    /** 玩家在线态 store，集中托管运行时拥有的热状态。 */
    runtimeState = createPlayerRuntimeStateStore<any>();
    /** 在线玩家运行时实例，按 playerId 直接索引。 */
    players = this.runtimeState.players;
    /** 数据库禁用时的离线收益基线缓存。 */
    offlineGainSessionsByPlayerId = new Map();
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
    /** 待单播给客户端刷新显示的总账玩家。 */
    pendingPlayerStatisticTotalsEmitPlayerIds = new Set();
    /** 最近一次已发给客户端的统计总账，用于构建低频 totalsPatch。 */
    playerStatisticLastEmittedTotalsByPlayerId = new Map();
    /** 当前玩家 tick 的统计上下文，tick 内资产变更只标记一次，tick 末统一 diff。 */
    playerStatisticTickContextsByPlayerId = new Map();
    /** 数据库禁用时等待客户端归档的离线收益报告。 */
    pendingOfflineGainReportsByPlayerId = new Map();
    /** 当前连接期已经下发过的待确认离线收益报告，避免每个同步 tick 重复推送。 */
    pendingOfflineGainReportEmittedIdsByPlayerId = new Map();
    /** 仅在测试 harness fallback 路径首次触发时打印一次提示，避免刷屏。 */
    noticeFallbackWarned = false;
    /** 注入基础仓库与成长/属性结算器，供玩家在线态统一管理。 */
    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(MapTemplateRepository) mapTemplateRepository: any,
        @Inject(PlayerAttributesService) playerAttributesService: any,
        @Inject(PlayerProgressionService) playerProgressionService: any,
        @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any = undefined,
        @Inject(RuntimeEventBusService) runtimeEventBusService: any = undefined,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerAttributesService = playerAttributesService;
        this.playerProgressionService = playerProgressionService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.runtimeEventBusService = runtimeEventBusService;
    }
    /** 读取或创建玩家在线态快照，首次连接时从持久化状态回填。 */
    async loadOrCreatePlayer(playerId, sessionId, loader, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
                return lateExisting;
            }
            await this.finalizeOfflineGainSessionForPlayer(lateExisting, Date.now());
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
            this.players.set(playerId, player);
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
        player.sessionEpoch = 0;
        player.lastHeartbeatAt = null;
        (player as any).transferState = null;
        (player as any).transferTargetNodeId = null;
        (player as any).transferStartedAt = null;
        (player as any).transferDeadlineAt = null;
        (player as any).transferWriteBlocked = false;
        if (!Number.isFinite(player.offlineSinceAt)) {
            player.offlineSinceAt = Date.now();
        }
        this.players.set(normalizedPlayerId, player);
        // 从 DB 恢复离线收益会话（含已累积的 payload）
        const persistedSession = await persistenceService.loadPlayerOfflineGainSession(normalizedPlayerId);
        if (persistedSession) {
            this.offlineGainSessionsByPlayerId.set(normalizedPlayerId, {
                sessionId: persistedSession.sessionId,
                startedAt: persistedSession.startedAt,
                baselinePayload: persistedSession.baselinePayload,
                accumulatedPayload: persistedSession.accumulatedPayload ?? createEmptyOfflineGainReportParts(),
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
            luck: 0,
            bodyTraining: normalizeBodyTrainingState(),
            boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
            lifeElapsedTicks: 0,
            lifespanYears: null,
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
            techniques: {
                revision: 1,
                techniques: [],
                cultivatingTechId: null,
            },
            pendingTechniqueComprehensions: [],
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
        this.playerProgressionService.initializePlayer(player);
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
                this.playerStatisticSnapshotsByPlayerId.set(normalizedPlayerId, existingSession.baselinePayload);
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
            baselinePayload: persistedSession.baselinePayload,
            accumulatedPayload: persistedSession.accumulatedPayload ?? createEmptyOfflineGainReportParts(),
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
        const pendingReports = await this.loadPendingOfflineGainReports(normalizedPlayerId);
        const hasSession = await this.shouldBlockOfflineGainSession(normalizedPlayerId);
        const player = this.players.get(normalizedPlayerId);
        if (!hasSession || !player) {
            return pendingReports;
        }
        const session = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
        if (!session) {
            return pendingReports;
        }
        const previewReport = buildOfflineGainReportFromSession(
            player,
            session,
            Date.now(),
            this.contentTemplateRepository,
        );
        return mergePendingOfflineGainReportList(normalizedPlayerId, [...pendingReports, previewReport]);
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
                await this.playerDomainPersistenceService.replacePlayerOfflineGainReports(normalizedPlayerId, mergedReports[0]);
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
            const dayKeys = buildPlayerStatisticRelevantDayKeys(now);
            const rows = await this.playerDomainPersistenceService.loadPlayerStatisticDayTotals(normalizedPlayerId, dayKeys);
            const byDay = this.playerStatisticPersistedDayTotalsByPlayerId.get(normalizedPlayerId) ?? new Map();
            for (const row of rows) {
                byDay.set(row.dayKey, normalizePlayerStatisticPeriodTotal(row.total));
            }
            this.playerStatisticPersistedDayTotalsByPlayerId.set(normalizedPlayerId, byDay);
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
            return;
        }
        if (await this.ensureOfflineGainSessionLoaded(normalizedPlayerId)) {
            const player = this.players.get(normalizedPlayerId);
            if (player) {
                await this.finalizeOfflineGainSessionForPlayer(player, Date.now());
            }
        }
        const existing = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
        const reportIdSet = new Set(normalizedReportIds);
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
        if (this.playerDomainPersistenceService?.isEnabled?.()) {
            await this.playerDomainPersistenceService.deletePlayerOfflineGainReports(normalizedPlayerId, normalizedReportIds);
        }
        const sessionId = normalizeOfflineGainString(options?.sessionId);
        if (sessionId) {
            this.activatePlayerRuntimeSession(normalizedPlayerId, sessionId);
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
        return this.bindRuntimeSession(player, normalizedSessionId);
    }
    /** 上线前把离线基线与当前权威态做差，生成待下发报告。 */
    async finalizeOfflineGainSessionForPlayer(player, endedAt = Date.now()) {
        const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
        if (!player || !normalizedPlayerId) {
            return null;
        }
        const persistedSession = this.playerDomainPersistenceService?.isEnabled?.()
            ? await this.playerDomainPersistenceService.loadPlayerOfflineGainSession(normalizedPlayerId)
            : this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
        const memorySession = this.offlineGainSessionsByPlayerId.get(normalizedPlayerId);
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
        this.recordPlayerStatisticTotals(normalizedPlayerId, report, report.endedAt);
        this.offlineGainSessionsByPlayerId.delete(normalizedPlayerId);
        const shouldSaveOfflineHistory = report.durationMs >= OFFLINE_GAIN_REPORT_MIN_DURATION_MS && hasOfflineGainReportParts(report);
        if (shouldSaveOfflineHistory) {
            if (this.playerDomainPersistenceService?.isEnabled?.()) {
                const existing = await this.playerDomainPersistenceService.loadPlayerOfflineGainReports(normalizedPlayerId);
                const mergedReport = mergePendingOfflineGainReport(normalizedPlayerId, existing, report);
                await this.playerDomainPersistenceService.replacePlayerOfflineGainReports(normalizedPlayerId, mergedReport);
            } else {
                const existing = this.pendingOfflineGainReportsByPlayerId.get(normalizedPlayerId) ?? [];
                const mergedReport = mergePendingOfflineGainReport(normalizedPlayerId, existing, report);
                this.pendingOfflineGainReportsByPlayerId.set(normalizedPlayerId, [mergedReport]);
            }
        }
        if (this.playerDomainPersistenceService?.isEnabled?.()) {
            await this.playerDomainPersistenceService.deletePlayerOfflineGainSession(normalizedPlayerId, session.sessionId);
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
        if (this.offlineGainSessionsByPlayerId.has(playerId) && !this.playerDomainPersistenceService?.isEnabled?.()) {
            return false;
        }
        return !hasDetachedRuntimeActivity(player);
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
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

    getPlayerOrThrow(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.players.get(playerId);
        if (!player) {
            throw new NotFoundException(`玩家不存在：${playerId}`);
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
    /** 按 itemId 消耗背包物品，成功返回 true */
    consumeItemByItemId(playerId, itemId, count = 1) {
        const player = this.getPlayer(playerId);
        if (!player) return false;
        const slotIndex = player.inventory.items.findIndex((item) => item && item.itemId === itemId && (item.count ?? 1) >= count);
        if (slotIndex < 0) return false;
        consumeInventoryItemAt(player.inventory.items, slotIndex, count);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, itemId);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        return true;
    }
    /** 按 techniqueId 直接学习功法，成功返回 true */
    learnTechniqueById(playerId, techniqueId) {
        const player = this.getPlayer(playerId);
        if (!player) return false;
        if (player.techniques.techniques.some((entry) => entry.techId === techniqueId)) {
            return false; // 已学会
        }
        const technique = this.contentTemplateRepository.createTechniqueState(techniqueId);
        if (!technique) return false;
        player.pendingTechniqueComprehensions = (player.pendingTechniqueComprehensions ?? [])
            .filter((entry) => entry?.techId !== techniqueId);
        player.techniques.techniques.push(toTechniqueUpdateEntry(technique));
        player.techniques.techniques.sort((left, right) => (left.realmLv ?? 0) - (right.realmLv ?? 0) || left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        player.techniques.revision += 1;
        if (!player.techniques.cultivatingTechId) {
            player.techniques.cultivatingTechId = technique.techId;
            player.combat.cultivationActive = true;
        }
        const currentTick = resolvePlayerRuntimeTick(player, 0);
        this.playerAttributesService.recalculate(player);
        this.rebuildActionState(player, currentTick);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
        this.bumpPersistentRevision(player);
        return true;
    }
    /** 按当前模板刷新所有在线玩家已学功法的静态投影。 */
    refreshOnlineTechniqueTemplates() {
        const onlinePlayers = Array.from(this.players.values())
            .filter((player) => !isNativeGmBotPlayerId(player?.playerId));
        const result = {
            ok: true,
            totalPlayers: onlinePlayers.length,
            queuedRuntimePlayers: 0,
            updatedOfflinePlayers: 0,
            refreshedOnlinePlayers: 0,
            refreshedTechniques: 0,
            missingTechniqueTemplates: 0,
        };
        for (const player of onlinePlayers) {
            const techniques = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
            if (techniques.length <= 0) {
                continue;
            }
            let playerChanged = false;
            let missingForPlayer = 0;
            const nextTechniques = techniques.map((entry) => {
                const hydrated = this.contentTemplateRepository.hydrateTechniqueState(entry);
                if (!hydrated || typeof hydrated !== 'object') {
                    missingForPlayer += 1;
                    return entry;
                }
                if (hasTechniqueTemplateProjectionChanged(entry, hydrated)) {
                    playerChanged = true;
                    result.refreshedTechniques += 1;
                }
                return hydrated;
            });
            result.missingTechniqueTemplates += missingForPlayer;
            if (!playerChanged) {
                continue;
            }
            player.techniques.techniques = nextTechniques;
            player.techniques.revision += 1;
            const currentTick = resolvePlayerRuntimeTick(player, 0);
            this.playerAttributesService.recalculate(player);
            this.rebuildActionState(player, currentTick);
            this.playerProgressionService.refreshPreview(player);
            markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
            this.bumpPersistentRevision(player);
            result.refreshedOnlinePlayers += 1;
            result.queuedRuntimePlayers += 1;
        }
        return result;
    }
    /** 将功法加入未领悟列表，不直接学会。 */
    addPendingTechniqueComprehensionById(playerId, techniqueId, sourceKind = 'normal', creatorPlayerId = null) {
        const player = this.getPlayer(playerId);
        if (!player) return false;
        const normalizedTechId = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
        if (!normalizedTechId) return false;
        if (player.techniques.techniques.some((entry) => entry.techId === normalizedTechId)) {
            return false;
        }
        const technique = this.contentTemplateRepository.createTechniqueState(normalizedTechId);
        if (!technique) return false;
        const normalizedSourceKind = sourceKind === 'created' ? 'created' : 'normal';
        const currentTick = resolvePlayerRuntimeTick(player, 0);
        const pending = Array.isArray(player.pendingTechniqueComprehensions)
            ? player.pendingTechniqueComprehensions
            : [];
        const existing = pending.find((entry) => entry?.techId === normalizedTechId);
        const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
            sourceKind: normalizedSourceKind,
            techniqueRealmLv: technique.realmLv,
            grade: technique.grade,
            learnerRealmLv: player.realm?.realmLv ?? 1,
            learnerTransmissionLevel: player.transmissionSkill?.level ?? 1,
        });
        let selfComprehensionAllowed = false;
        if (existing) {
            existing.requiredProgress = requiredProgress;
            existing.updatedAtTick = currentTick;
            existing.name = technique.name ?? existing.name ?? normalizedTechId;
            existing.sourceKind = normalizedSourceKind;
            selfComprehensionAllowed = resolvePendingSelfComprehensionAllowed(
                player.playerId,
                normalizedSourceKind,
                creatorPlayerId ?? existing.creatorPlayerId,
                existing,
            );
            existing.selfComprehensionAllowed = selfComprehensionAllowed;
            if (creatorPlayerId) {
                existing.creatorPlayerId = creatorPlayerId;
            }
        }
        else {
            selfComprehensionAllowed = resolvePendingSelfComprehensionAllowed(
                player.playerId,
                normalizedSourceKind,
                creatorPlayerId,
            );
            pending.push({
                techId: normalizedTechId,
                name: technique.name ?? normalizedTechId,
                sourceKind: normalizedSourceKind,
                creatorPlayerId: creatorPlayerId ?? undefined,
                selfComprehensionAllowed,
                progress: 0,
                requiredProgress,
                realmLv: Math.max(1, Math.floor(Number(technique.realmLv) || 1)),
                grade: technique.grade ?? undefined,
                category: technique.category ?? undefined,
                createdAtTick: currentTick,
                updatedAtTick: currentTick,
            });
        }
        player.pendingTechniqueComprehensions = pending;
        if (!player.techniques.cultivatingTechId && selfComprehensionAllowed) {
            player.techniques.cultivatingTechId = normalizedTechId;
            player.combat.cultivationActive = true;
        }
        const autoBattleSkillsChanged = syncTechniqueAutoBattleSkillCatalog(player, technique);
        player.techniques.revision += 1;
        markPlayerDirtyDomains(player, autoBattleSkillsChanged ? ['technique', 'auto_battle_skill'] : ['technique']);
        this.bumpPersistentRevision(player);
        return true;
    }
    startTechniqueTransmission(teacherPlayerId, learnerPlayerId, techniqueId) {
        const learner = this.getPlayerOrThrow(learnerPlayerId);
        this.captureOfflineGainBeforeTick(learner);
        const { pipeline, ctx } = createTransmissionCompatPipeline(this);
        const result = pipeline.start(learner, 'transmission', {
            learnerPlayerId,
            teacherPlayerId,
            techniqueId,
        }, ctx);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '启动传法失败');
        }
        this.recordAssetStatisticMutation(learner, this.captureOfflineGainBeforeTick(learner));
        return learner;
    }
    cancelTechniqueTransmission(learnerPlayerId, techniqueId) {
        const learner = this.getPlayerOrThrow(learnerPlayerId);
        const normalizedTechId = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
        if (normalizedTechId && learner.transmissionJob?.techniqueId !== normalizedTechId) {
            throw new BadRequestException('没有进行中的传授');
        }
        this.captureOfflineGainBeforeTick(learner);
        const { pipeline, ctx } = createTransmissionCompatPipeline(this);
        const result = pipeline.cancel(learner, 'transmission', ctx);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '取消传法失败');
        }
        this.recordAssetStatisticMutation(learner, this.captureOfflineGainBeforeTick(learner));
        return learner;
    }
    normalizePendingTechniqueComprehensionsForRuntime(value) {
        const entries = clonePendingTechniqueComprehensions(value);
        let changed = false;
        for (const pending of entries) {
            changed = this.refreshPendingTechniqueComprehensionRequirement(pending) || changed;
        }
        return { entries, changed };
    }
    refreshPendingTechniqueComprehensionRequirement(pending, fallbackTechnique = null) {
        if (!pending || typeof pending.techId !== 'string' || !pending.techId.trim()) {
            return false;
        }
        const technique = fallbackTechnique ?? this.contentTemplateRepository.createTechniqueState(pending.techId);
        if (!technique) {
            return false;
        }
        const sourceKind = pending.sourceKind === 'created' || isCreatedTechniqueId(pending.techId) ? 'created' : 'normal';
        const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
            sourceKind,
            techniqueRealmLv: technique.realmLv,
            grade: technique.grade,
        });
        let changed = false;
        if (pending.sourceKind !== sourceKind) {
            pending.sourceKind = sourceKind;
            changed = true;
        }
        if (pending.requiredProgress !== requiredProgress) {
            pending.requiredProgress = requiredProgress;
            changed = true;
        }
        const progress = Math.min(requiredProgress, Math.max(0, Number(pending.progress) || 0));
        if (pending.progress !== progress) {
            pending.progress = progress;
            changed = true;
        }
        const realmLv = Math.max(1, Math.floor(Number(technique.realmLv) || 1));
        if (pending.realmLv !== realmLv) {
            pending.realmLv = realmLv;
            changed = true;
        }
        if ((technique.grade ?? undefined) !== undefined && pending.grade !== technique.grade) {
            pending.grade = technique.grade;
            changed = true;
        }
        if ((technique.category ?? undefined) !== undefined && pending.category !== technique.category) {
            pending.category = technique.category;
            changed = true;
        }
        const name = technique.name ?? pending.name ?? pending.techId;
        if (pending.name !== name) {
            pending.name = name;
            changed = true;
        }
        return changed;
    }
    interruptTechniqueTransmissionForPlayer(learnerPlayerId, reason = 'attack', currentTick = 0) {
        const learner = this.getPlayer(learnerPlayerId);
        if (!learner) {
            return false;
        }
        learner.lifeElapsedTicks = Math.max(0, Math.trunc(Number(currentTick) || 0));
        this.captureOfflineGainBeforeTick(learner);
        const { pipeline, ctx } = createTransmissionCompatPipeline(this);
        const result = pipeline.interrupt(learner, 'transmission', normalizeTechniqueTransmissionInterruptReason(reason), ctx);
        this.recordAssetStatisticMutation(learner, this.captureOfflineGainBeforeTick(learner));
        return result.panelChanged === true;
    }
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
        return {
            runtimeOwnerId: typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
                ? player.runtimeOwnerId.trim()
                : null,
            sessionEpoch: Number.isFinite(player.sessionEpoch)
                ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
                : null,
        };
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
            inWorld: typeof player.templateId === 'string' && player.templateId.trim().length > 0,
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
            versionSeed: Date.now(),
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

    replaceInventoryItems(playerId, items) {
        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);
        const nextItems = Array.isArray(items)
            ? items.map((entry) => this.contentTemplateRepository.normalizeItem(entry))
            : [];
        player.inventory.items = nextItems;
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
    }
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
        this.playerAttributesService.recalculate(player);
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
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const result = this.playerProgressionService.grantMonsterKillProgress(player, input);
        return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick);
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
        return this.applyProgressionResultWithStatistics(player, result, statisticBefore, currentTick, true);
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
            this.playerAttributesService.recalculate(player);
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

    /** 离线挂机恢复后从世界视图同步位置/上下文，不创建网络会话 fencing。 */
    syncOfflineFromWorldView(playerId, view) {
        const player = this.getPlayer(playerId);
        if (!player) {
            return null;
        }
        player.sessionId = null;
        player.runtimeOwnerId = null;
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
            this.playerAttributesService.recalculate(player);
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

    grantItem(playerId, itemId, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);
        const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
        const item = this.contentTemplateRepository.createItem(normalizedItemId, count);
        if (!item) {
            throw new NotFoundException(`物品不存在：${normalizedItemId}`);
        }
        assignItemInstanceIdIfNeeded(item);

        mergeItemStackInto(player.inventory.items, item);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
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
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        player.selfRevision += 1;
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
        syncWalletCacheFromInventory(player, normalizedWalletType);
        this.playerProgressionService.refreshPreview(player);
        player.selfRevision += 1;
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

    getInventoryCountByItemId(playerId, itemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        let total = 0;
        for (const entry of player.inventory.items) {
            if (entry.itemId === itemId) {
                total += entry.count;
            }
        }
        return total;
    }
    /**
 * canReceiveInventoryItem：判断Receive背包道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成Receive背包道具的条件判断。
 */

    canReceiveInventoryItem(playerId, itemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
        if (player.inventory.items.some((entry) => entry.itemId === normalizedItemId)) {
            return true;
        }
        return player.inventory.items.length < player.inventory.capacity;
    }
    /**
 * peekInventoryItem：执行peek背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新peek背包道具相关状态。
 */

    peekInventoryItem(playerId, slotIndex) {

        const player = this.getPlayerOrThrow(playerId);
        return player.inventory.items[slotIndex] ?? null;
    }
    /**
 * peekInventoryItemByInstanceId：按稳定实例 ID 读取背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @returns 背包物品或 null。
 */

    peekInventoryItemByInstanceId(playerId, itemInstanceId) {

        const player = this.getPlayerOrThrow(playerId);
        const index = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        return index >= 0 ? player.inventory.items[index] ?? null : null;
    }
    /**
 * peekEquippedItem：执行peekEquipped道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新peekEquipped道具相关状态。
 */

    peekEquippedItem(playerId, slot) {

        const player = this.getPlayerOrThrow(playerId);
        return player.equipment.slots.find((entry) => entry.slot === slot)?.item ?? null;
    }
    /**
 * getTechniqueName：读取功法名称。
 * @param playerId 玩家 ID。
 * @param techId tech ID。
 * @returns 无返回值，完成功法名称的读取/组装。
 */

    getTechniqueName(playerId, techId) {

        const player = this.getPlayerOrThrow(playerId);
        const learnedName = player.techniques.techniques.find((entry) => entry.techId === techId)?.name;
        if (learnedName) {
            return learnedName;
        }
        const pendingName = (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === techId)?.name;
        if (pendingName) {
            return pendingName;
        }
        return this.contentTemplateRepository.createTechniqueState(techId)?.name ?? null;
    }
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
        return player.pendingLogbookMessages.map((entry) => ({ ...entry }));
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

    splitInventoryItem(playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }

        const normalizedCount = Math.max(1, Math.trunc(count));

        const nextCount = Math.min(normalizedCount, item.count);
        const willKeepRemaining = nextCount < item.count;

        const extracted = {
            ...item,
            count: nextCount,
        };
        // 若拆分后原 slot 仍保留剩余堆叠，被拆出的那部分必须分配新 itemInstanceId，
        // 避免与剩余堆叠在 player_inventory_item / market_listing / loot_container 等下游表上共用 PK。
        if (willKeepRemaining && typeof (extracted as any).itemInstanceId === 'string' && (extracted as any).itemInstanceId.length > 0) {
            (extracted as { itemInstanceId?: string }).itemInstanceId = randomUUID();
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, nextCount);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return extracted;
    }
    /**
 * splitInventoryItemByInstanceId：按稳定实例 ID 拆出背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @returns 拆出的物品快照。
 */

    splitInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) {
        const player = this.getPlayerOrThrow(playerId);
        const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        if (slotIndex < 0) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        return this.splitInventoryItem(playerId, slotIndex, count);
    }
    /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

    receiveInventoryItem(playerId, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const normalized = this.contentTemplateRepository.normalizeItem(item);
        // 装备类必须有稳定 itemInstanceId；缺失或处于迁移期 fallback 时分配新 UUID。
        // 这覆盖所有"装备入手"路径：掉落、合成、强化产物、GM、邮件、兑换码、NPC 商店、
        // 任务奖励、市场买家成交（市场内部已脱壳，到这里时 sourceItem 不带 instanceId）。
        assignItemInstanceIdIfNeeded(normalized);
        const mergeResult = mergeItemStackInto(player.inventory.items, normalized);
        if (mergeResult.merged && mergeResult.entry.count > MAX_ITEM_COUNT) {
            this.logger.warn(`物品数量达到上限 [playerId=${player.id}, itemId=${normalized.itemId}, attempted=${mergeResult.entry.count}, capped=${MAX_ITEM_COUNT}]`);
            mergeResult.entry.count = MAX_ITEM_COUNT;
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, normalized.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
    }
    /**
 * useItem：执行use道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新use道具相关状态。
 */

    useItem(playerId, slotIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }

        const learnTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);

        let consumed = false;
        let autoBattleSkillsChanged = false;
        const currentTick = resolvePlayerRuntimeTick(player, 0);
        if (learnTechniqueId) {
            if (player.techniques.techniques.some((entry) => entry.techId === learnTechniqueId)) {
                throw new NotFoundException(`功法已经学会：${learnTechniqueId}`);
            }

            const technique = this.contentTemplateRepository.createTechniqueState(learnTechniqueId);
            if (!technique) {
                throw new NotFoundException(`功法不存在：${learnTechniqueId}`);
            }
            const pending = Array.isArray(player.pendingTechniqueComprehensions)
                ? player.pendingTechniqueComprehensions
                : [];
            const existing = pending.find((entry) => entry?.techId === learnTechniqueId);
            const requiredProgress = calculateTechniqueComprehensionRequiredProgress({
                sourceKind: 'normal',
                techniqueRealmLv: technique.realmLv,
                grade: technique.grade,
                learnerRealmLv: player.realm?.realmLv ?? 1,
                learnerTransmissionLevel: player.transmissionSkill?.level ?? 1,
            });
            if (existing) {
                existing.requiredProgress = requiredProgress;
                existing.updatedAtTick = currentTick;
                existing.name = technique.name ?? existing.name ?? learnTechniqueId;
                existing.selfComprehensionAllowed = true;
            }
            else {
                pending.push({
                    techId: learnTechniqueId,
                    name: technique.name ?? learnTechniqueId,
                    sourceKind: 'normal',
                    selfComprehensionAllowed: true,
                    progress: 0,
                    requiredProgress,
                    realmLv: Math.max(1, Math.floor(Number(technique.realmLv) || 1)),
                    grade: technique.grade ?? undefined,
                    category: technique.category ?? undefined,
                    createdAtTick: currentTick,
                    updatedAtTick: currentTick,
                });
            }
            player.pendingTechniqueComprehensions = pending;
            player.techniques.revision += 1;
            if (!player.techniques.cultivatingTechId) {
                player.techniques.cultivatingTechId = technique.techId;
                player.combat.cultivationActive = true;
            }
            autoBattleSkillsChanged = syncTechniqueAutoBattleSkillCatalog(player, technique);
            consumed = true;
        }
        else {
            assertConsumableItemCooldownReady(player, item, currentTick);
            consumed = this.applyConsumableItem(player, item);
        }
        if (!consumed) {
            throw new NotFoundException(`物品 ${item.itemId} 没有可用效果`);
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, 1);
        if (!learnTechniqueId) {
            markConsumableItemCooldown(player, item, currentTick);
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, learnTechniqueId
            ? (autoBattleSkillsChanged ? ['inventory', 'technique', 'auto_battle_skill'] : ['inventory', 'technique'])
            : ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
    }
    /**
 * useItemByInstanceId：按稳定实例 ID 使用背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @returns 玩家运行态。
 */

    useItemByInstanceId(playerId, itemInstanceId) {
        const player = this.getPlayerOrThrow(playerId);
        const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        if (slotIndex < 0) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        return this.useItem(playerId, slotIndex);
    }
    /**
 * consumeInventoryItem：执行consume背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具相关状态。
 */

    consumeInventoryItem(playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, Math.max(1, Math.trunc(count)));
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
    }
    /**
 * consumeInventoryItemByInstanceId：按稳定实例 ID 消耗背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @returns 玩家运行态。
 */

    consumeInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) {
        const player = this.getPlayerOrThrow(playerId);
        const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        if (slotIndex < 0) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        return this.consumeInventoryItem(playerId, slotIndex, count);
    }
    /**
 * consumeInventoryItemByItemId：执行consume背包道具By道具ID相关逻辑。
 * @param playerId 玩家 ID。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具By道具ID相关状态。
 */

    consumeInventoryItemByItemId(playerId, itemId, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const normalizedCount = Math.max(1, Math.trunc(count));
        if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
            throw new NotFoundException(`使用数量无效：${itemId}`);
        }
        const available = readInventoryItemCount(player, itemId);
        if (available < normalizedCount) {
            throw new NotFoundException(`背包物品不足：${itemId}`);
        }
        const statisticBefore = this.captureOfflineGainBeforeTick(player);
        let remaining = normalizedCount;
        for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
            const item = player.inventory.items[slotIndex];
            if (!item || item.itemId !== itemId) {
                continue;
            }

            const consumed = Math.min(item.count, remaining);
            consumeInventoryItemAt(player.inventory.items, slotIndex, consumed);
            remaining -= consumed;
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return player;
    }
    /**
 * destroyInventoryItem：执行destroy背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新destroy背包道具相关状态。
 */

    destroyInventoryItem(playerId, slotIndex, count = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        const statisticBefore = this.captureOfflineGainBeforeTick(player);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }

        const normalizedCount = Math.max(1, Math.trunc(count));

        const destroyed = {
            ...item,
            count: Math.min(item.count, normalizedCount),
        };
        consumeInventoryItemAt(player.inventory.items, slotIndex, destroyed.count);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        this.recordAssetStatisticMutation(player, statisticBefore);
        return destroyed;
    }
    /**
 * destroyInventoryItemByInstanceId：按稳定实例 ID 摧毁背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @returns 被摧毁的物品快照。
 */

    destroyInventoryItemByInstanceId(playerId, itemInstanceId, count = 1) {
        const player = this.getPlayerOrThrow(playerId);
        const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        if (slotIndex < 0) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        return this.destroyInventoryItem(playerId, slotIndex, count);
    }
    /**
 * sortInventory：执行sort背包相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新sort背包相关状态。
 */

    sortInventory(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);
        if (player.inventory.items.length <= 1) {
            return player;
        }

        const previous = player.inventory.items.map((entry) => `${entry.itemId}:${entry.count}:${entry.enhanceLevel ?? 0}`);

        // 先按签名合并相同物品堆，再排序，避免同一物品多 slot 残留。
        const mergedMap = new Map();
        const mergedOrder = [];
        for (const entry of player.inventory.items) {
            if (!canMergeItemStack(entry)) {
                mergedOrder.push(cloneItemWithCountPreservingTemplate(entry, Math.max(1, Math.trunc(Number(entry.count ?? 1)))));
                continue;
            }
            const signature = createItemStackSignature(entry);
            const existing = mergedMap.get(signature);
            if (existing) {
                existing.count = Math.min(
                    existing.count + Math.max(1, Math.trunc(Number(entry.count ?? 1))),
                    MAX_ITEM_COUNT,
                );
            }
            else {
                const clone = cloneItemWithCountPreservingTemplate(entry, Math.max(1, Math.trunc(Number(entry.count ?? 1))));
                mergedMap.set(signature, clone);
                mergedOrder.push(clone);
            }
        }
        mergedOrder.sort(compareInventoryItems);
        player.inventory.items = mergedOrder;

        let changed = previous.length !== player.inventory.items.length;
        if (!changed) {
            for (let index = 0; index < previous.length; index += 1) {
                const current = player.inventory.items[index];
                if (!current || previous[index] !== `${current.itemId}:${current.count}:${current.enhanceLevel ?? 0}`) {
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) {
            return player;
        }
        player.inventory.revision += 1;
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        return player;
    }
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
            throw new NotFoundException(`地图已经解锁：${mapId}`);
        }
        player.unlockedMapIds = [...player.unlockedMapIds, mapId]
            .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        markPlayerDirtyDomains(player, ['map_unlock']);
        this.bumpPersistentRevision(player);
        void this.persistMapUnlocks(player).catch((error) => {
            console.warn(`地图解锁直写失败：${error instanceof Error ? error.message : String(error)}`);
        });
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
        markPlayerDirtyDomains(player, ['position_checkpoint']);
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
        markPlayerDirtyDomains(player, ['position_checkpoint']);
        this.bumpPersistentRevision(player);
        return true;
    }
    /**
 * persistMapUnlocks：执行persist地图Unlocks相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist地图Unlocks相关状态。
 */

    async persistMapUnlocks(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        await this.playerDomainPersistenceService.savePlayerMapUnlocks(playerId, [...(player.unlockedMapIds ?? [])], {
            versionSeed: player.persistentRevision,
        });
    }
    async persistWallet(player) {
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        await this.playerDomainPersistenceService.savePlayerWallet(playerId, Array.isArray(player.wallet?.balances) ? player.wallet.balances : [], {
            versionSeed: player.persistentRevision,
        });
    }
    /**
 * persistLogbookMessages：执行persist日志本Messages相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist日志本Messages相关状态。
 */

    async persistLogbookMessages(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        await this.playerDomainPersistenceService.savePlayerLogbookMessages(playerId, [...(player.pendingLogbookMessages ?? [])], {
            versionSeed: player.persistentRevision,
        });
    }
    /**
* equipItem：执行equip道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新equip道具相关状态。
 */

    equipItem(playerId, slotIndex, expectedItemInstanceId?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }
        const normalizedItem = this.contentTemplateRepository.normalizeItem(item);
        if (!normalizedItem.equipSlot) {
            throw new NotFoundException(`物品 ${normalizedItem.itemId} 不能装备`);
        }
        // 装备类必须有稳定 instanceId；迁移期老装备此处 lazy 升级
        assignItemInstanceIdIfNeeded(normalizedItem);
        // 乐观一致性校验：客户端选中目标时看到的 itemInstanceId
        const compare = compareItemInstanceId(
            normalizedItem.itemInstanceId,
            expectedItemInstanceId,
        );
        if (compare === 'mismatch') {
            const hardCheck = isItemInstanceIdHardCheckEnabled();
            console.warn(
                `[player-runtime] equipItem itemInstanceId mismatch player=${playerId} slot=${slotIndex} `
                + `expected=${expectedItemInstanceId} actual=${normalizedItem.itemInstanceId} hardCheck=${hardCheck}`,
            );
            if (hardCheck) {
                throw new BadRequestException('装备目标已变更，请重新选择。');
            }
        }

        const slot = normalizedItem.equipSlot;

        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry) {
            throw new NotFoundException(`装备槽位不存在：${slot}`);
        }

        const equippedItem = takeSingleInventoryItemForEquipment(player.inventory.items, slotIndex);
        if (!equippedItem) {
            throw new NotFoundException(`背包槽位不存在：${slotIndex}`);
        }
        // 显式把 inventory 槽里物品的 instanceId 透传给装备槽（normalizeItem 会保留 source.itemInstanceId）
        if (typeof normalizedItem.itemInstanceId === 'string' && !equippedItem.itemInstanceId) {
            (equippedItem as any).itemInstanceId = normalizedItem.itemInstanceId;
        }

        const previousEquipped = equipmentEntry.item ?? null;
        equipmentEntry.item = this.contentTemplateRepository.normalizeItem(equippedItem);
        // 装备 normalize 后再次确保 instanceId 没丢
        assignItemInstanceIdIfNeeded(equipmentEntry.item);
        if (previousEquipped) {
            // 卸下的旧装备回背包：与同 (itemId, enhanceLevel) 签名的现有堆叠合并 count；
            // 找不到同签名堆叠时再独立成 slot。previousEquipped 的 itemInstanceId 在合并时
            // 由现有堆叠胜出（直接 ++count，不写入新 instanceId）；独立成 slot 时保留原 id。
            assignItemInstanceIdIfNeeded(previousEquipped);
            mergeItemStackInto(player.inventory.items, previousEquipped);
        }
        player.inventory.revision += 1;
        player.equipment.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['inventory', 'equipment', 'attr']);
        this.bumpPersistentRevision(player);
        return player;
    }
    /**
* equipItemByInstanceId：按稳定实例 ID 装备背包物品。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @returns 玩家运行态。
 */

    equipItemByInstanceId(playerId, itemInstanceId) {
        const player = this.getPlayerOrThrow(playerId);
        const slotIndex = findInventoryItemIndexByInstanceId(player.inventory.items, itemInstanceId);
        if (slotIndex < 0) {
            throw new NotFoundException(`背包物品不存在：${normalizeInventoryItemInstanceId(itemInstanceId) || 'unknown'}`);
        }
        return this.equipItem(playerId, slotIndex, normalizeInventoryItemInstanceId(itemInstanceId));
    }
    /**
 * unequipItem：执行unequip道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新unequip道具相关状态。
 */

    unequipItem(playerId, slot, expectedItemInstanceId?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry || !equipmentEntry.item) {
            throw new NotFoundException(`装备槽位为空：${slot}`);
        }
        const unequippedItem = equipmentEntry.item;
        // 装备类必须有稳定 instanceId；迁移期老装备此处 lazy 升级
        assignItemInstanceIdIfNeeded(unequippedItem);
        // 乐观一致性校验
        const compare = compareItemInstanceId(
            unequippedItem.itemInstanceId,
            expectedItemInstanceId,
        );
        if (compare === 'mismatch') {
            const hardCheck = isItemInstanceIdHardCheckEnabled();
            console.warn(
                `[player-runtime] unequipItem itemInstanceId mismatch player=${playerId} slot=${slot} `
                + `expected=${expectedItemInstanceId} actual=${unequippedItem.itemInstanceId} hardCheck=${hardCheck}`,
            );
            if (hardCheck) {
                throw new BadRequestException('装备目标已变更，请重新选择。');
            }
        }
        // 卸下的装备回背包：优先与同 (itemId, enhanceLevel) 签名的现有堆叠合并 count。
        mergeItemStackInto(player.inventory.items, unequippedItem);
        equipmentEntry.item = null;
        player.inventory.revision += 1;
        player.equipment.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['inventory', 'equipment', 'attr']);
        this.bumpPersistentRevision(player);
        return player;
    }
    /**
 * cultivateTechnique：执行cultivate功法相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新cultivate功法相关状态。
 */

    cultivateTechnique(playerId, techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : null;
        const hasLearned = normalized && player.techniques.techniques.some((entry) => entry.techId === normalized);
        const pending = normalized
            ? (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === normalized)
            : null;
        const hasPending = Boolean(pending);
        if (normalized && !hasLearned && !hasPending) {
            throw new NotFoundException(`尚未学会功法：${normalized}`);
        }
        if (pending && pending.selfComprehensionAllowed === false) {
            throw new BadRequestException('该功法只能通过传法领悟，不能设为主修。');
        }
        const previousCultivatingTechId = player.techniques.cultivatingTechId;
        player.techniques.cultivatingTechId = normalized;
        const techniqueChanged = previousCultivatingTechId !== player.techniques.cultivatingTechId;
        if (!techniqueChanged) {
            return player;
        }
        player.techniques.revision += 1;
        markPlayerDirtyDomains(player, ['technique']);
        this.bumpPersistentRevision(player);
        return player;
    }
    /**
 * forgetTechnique：遗忘已掌握功法并清理派生技能状态。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 返回被遗忘功法名称。
 */

    forgetTechnique(playerId, techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
        if (!normalized) {
            throw new BadRequestException('缺少要遗忘的功法。');
        }
        const index = player.techniques.techniques.findIndex((entry) => entry.techId === normalized);
        if (index < 0) {
            throw new NotFoundException('尚未学会该功法。');
        }
        const [removed] = player.techniques.techniques.splice(index, 1);
        const techniqueName = typeof removed?.name === 'string' && removed.name.trim() ? removed.name.trim() : normalized;
        if (player.techniques.cultivatingTechId === normalized) {
            player.techniques.cultivatingTechId = undefined;
            player.combat.cultivationActive = false;
        }
        player.techniques.revision += 1;
        const currentTick = resolvePlayerRuntimeTick(player, 0);
        this.playerAttributesService.recalculate(player);
        this.rebuildActionState(player, currentTick);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
        this.bumpPersistentRevision(player);
        return techniqueName;
    }
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
            this.playerAttributesService.recalculate(player);
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
            this.playerAttributesService.recalculate(player);
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

        const normalizedTick = Math.max(0, Math.trunc(currentTick));
        if (player.combat.lastActiveTick < normalizedTick) {
            player.combat.lastActiveTick = normalizedTick;
        }
        if (input.interruptCultivation === true && player.combat.cultivationActive) {
            player.combat.cultivationActive = false;
            this.playerAttributesService.recalculate(player);
            markPlayerDirtyDomains(player, ['combat_pref', 'attr']);
            this.bumpPersistentRevision(player);
        }
        return player;
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
            throw new NotFoundException(`玩家 ${playerId} 元气不足`);
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

    applyDamage(playerId, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const normalized = Math.max(0, Math.round(amount));
        if (normalized <= 0) {
            return player;
        }
        player.hp = Math.max(0, player.hp - normalized);
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
        this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
        markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill']);
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
        this.rebuildActionState(player, resolvePlayerRuntimeTick(player, 0));
        markPlayerDirtyDomains(player, ['auto_battle_skill']);
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
            this.playerAttributesService.recalculate(player);
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

    applyTemporaryBuff(playerId, buff) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.getPlayerOrThrow(playerId);

        const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
        let changed = false;
        let attrRelevantChanged = false;
        if (existing) {
            if (!isConsumableBuffSource(buff) && isNonConsumableTemporaryBuffReapplyNoop(existing, buff)) {
                return player;
            }
            const previousRemainingTicks = existing.remainingTicks;
            const previousDuration = existing.duration;
            const previousStacks = existing.stacks;
            const previousMaxStacks = existing.maxStacks;
            const previousRealmLv = existing.realmLv;
            const previousInfiniteDuration = existing.infiniteDuration === true;
            const previousSustainTicksElapsed = existing.sustainTicksElapsed;
            const previousPersistOnDeath = existing.persistOnDeath === true;
            const previousPersistOnReturnToSpawn = existing.persistOnReturnToSpawn === true;
            const previousActive = isRuntimeBuffActive(existing);
            const affectsAttributes = doesTemporaryBuffAffectAttributes(existing) || doesTemporaryBuffAffectAttributes(buff);
            const sameAttributePayload = isSameTemporaryBuffAttributePayload(existing, buff);
            const samePrototypePayload = isSameTemporaryBuffPrototypePayload(existing, buff);
            if (isConsumableBuffSource(buff)) {
                if (buff.infiniteDuration === true) {
                    existing.duration = Math.max(1, Math.round(buff.duration));
                    existing.remainingTicks = 1;
                }
                else {
                    const currentRemainingDuration = Math.max(0, existing.remainingTicks - 1);
                    const addedDuration = Math.max(1, Math.round(buff.duration));
                    existing.duration = currentRemainingDuration + addedDuration;
                    existing.remainingTicks = existing.duration + 1;
                }
                existing.stacks = Math.min(buff.maxStacks, existing.stacks + 1);
            }
            else {
                existing.remainingTicks = buff.remainingTicks;
                existing.duration = buff.duration;
                existing.stacks = Math.min(buff.maxStacks, existing.stacks + Math.max(1, buff.stacks));
            }
            existing.maxStacks = buff.maxStacks;
            existing.infiniteDuration = buff.infiniteDuration === true;
            existing.sustainTicksElapsed = buff.sustainCost ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0)) : undefined;
            existing.persistOnDeath = buff.persistOnDeath === true;
            existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
            if (!samePrototypePayload) {
                refreshRuntimeTemporaryBuffPrototype(existing, buff);
            }
            changed = previousRemainingTicks !== existing.remainingTicks
                || previousDuration !== existing.duration
                || previousStacks !== existing.stacks
                || previousMaxStacks !== existing.maxStacks
                || previousRealmLv !== existing.realmLv
                || previousInfiniteDuration !== (existing.infiniteDuration === true)
                || previousSustainTicksElapsed !== existing.sustainTicksElapsed
                || previousPersistOnDeath !== (existing.persistOnDeath === true)
                || previousPersistOnReturnToSpawn !== (existing.persistOnReturnToSpawn === true)
                || !samePrototypePayload;
            attrRelevantChanged = affectsAttributes
                && (previousActive !== isRuntimeBuffActive(existing)
                    || previousStacks !== existing.stacks
                    || previousRealmLv !== existing.realmLv
                    || !sameAttributePayload);
        }
        else {
            player.buffs.buffs.push(createRuntimeTemporaryBuff(buff));
            changed = true;
            attrRelevantChanged = doesTemporaryBuffAffectAttributes(buff);
        }
        if (!changed) {
            return player;
        }
        if (!existing) {
            player.buffs.buffs.sort((left, right) => {
                const a = String(left.buffId ?? '');
                const b = String(right.buffId ?? '');
                return a < b ? -1 : a > b ? 1 : 0;
            });
        }
        player.buffs.revision += 1;
        if (attrRelevantChanged) {
            this.playerAttributesService.recalculate(player);
        }
        markPlayerDirtyDomains(player, attrRelevantChanged ? ['buff', 'attr'] : ['buff']);
        this.bumpPersistentRevision(player);
        return player;
    }

    /** 按内容模板施加 Buff，供地形、系统效果等配置驱动来源复用。 */
    applyConfiguredBuff(playerId, buffId, options: any = {}) {
        const normalizedBuffId = typeof buffId === 'string' ? buffId.trim() : '';
        if (!normalizedBuffId) {
            return null;
        }
        const template = this.contentTemplateRepository?.buffRegistry?.tryGetRef?.(normalizedBuffId);
        if (!template) {
            throw new Error(`未找到 Buff 模板：${normalizedBuffId}`);
        }
        const duration = Math.max(1, Math.round(Number(template.duration) || 1));
        const stacks = Math.max(1, Math.trunc(Number(options.stacks) || Number(template.stacks) || 1));
        const remainingTicks = options.refreshDuration === false
            ? Math.max(1, Math.round(Number(template.remainingTicks) || duration + 1))
            : duration + 1;
        const buff = this.contentTemplateRepository.buffRegistry.createInstance(normalizedBuffId, {
            remainingTicks,
            duration,
            stacks,
            realmLv: Math.max(1, Math.trunc(Number(options.realmLv) || Number(template.realmLv) || 1)),
        });
        return this.applyTemporaryBuff(playerId, buff);
    }
    /** 施加神魂受损 Debuff。 */
    applyPvPSoulInjury(playerId) {
        return this.applyOrRefreshPvpBuff(playerId, buildPvPSoulInjuryBuffState(getPlayerRealmLevel(this.getPlayerOrThrow(playerId))));
    }
    /** 增加一层煞气入体。 */
    addPvPShaInfusionStack(playerId) {
        const player = this.getPlayerOrThrow(playerId);
        const next = this.applyOrRefreshPvpBuff(playerId, buildPvPShaInfusionBuffState(getPlayerRealmLevel(player)), 1);
        return next.stacks;
    }
    /** 增加煞气反噬层数。 */
    addPvPShaBacklashStacks(playerId, addedStacks) {
        if (addedStacks <= 0) {
            return this.getBuffStacks(playerId, PVP_SHA_BACKLASH_BUFF_ID);
        }
        const player = this.getPlayerOrThrow(playerId);
        const next = this.applyOrRefreshPvpBuff(playerId, buildPvPShaBacklashBuffState(getPlayerRealmLevel(player), addedStacks), addedStacks);
        return next.stacks;
    }
    /** 查询指定 Buff 当前层数。 */
    getBuffStacks(playerId, buffId) {
        const player = this.getPlayerOrThrow(playerId);
        return getEntityBuffStacks(player.buffs.buffs, buffId);
    }
    /** 判断玩家是否持有生效中的 Buff。 */
    hasActiveBuff(playerId, buffId, minStacks = 1) {
        const player = this.getPlayerOrThrow(playerId);
        return entityHasActiveBuff(player.buffs.buffs, buffId, minStacks);
    }
    /** 身死时结算煞气反噬，折损修为并转化为煞气反噬层数。 */
    applyShaInfusionDeathPenalty(playerId) {
        const player = this.getPlayerOrThrow(playerId);
        const stacks = getEntityBuffStacks(player.buffs.buffs, PVP_SHA_INFUSION_BUFF_ID);
        if (stacks <= 0) {
            return {
                stacks: 0,
                loss: 0,
                consumedProgress: 0,
                consumedFoundation: 0,
                backlashAddedStacks: 0,
                backlashTotalStacks: this.getBuffStacks(playerId, PVP_SHA_BACKLASH_BUFF_ID),
                remainingInfusionStacks: 0,
            };
        }
        const backlashAddedStacks = Math.max(1, Math.ceil(stacks / PVP_SHA_BACKLASH_STACK_DIVISOR));
        const remainingInfusionStacks = this.consumePvpBuffStacks(playerId, PVP_SHA_INFUSION_BUFF_ID, backlashAddedStacks);
        const backlashTotalStacks = this.addPvPShaBacklashStacks(playerId, backlashAddedStacks);
        const progressToNext = Math.max(0, Math.floor(player.realm?.progressToNext ?? 0));
        const loss = Math.max(0, Math.floor((progressToNext * stacks) / 100));
        if (loss <= 0) {
            return {
                stacks,
                loss: 0,
                consumedProgress: 0,
                consumedFoundation: 0,
                backlashAddedStacks,
                backlashTotalStacks,
                remainingInfusionStacks,
            };
        }
        const statisticBefore = this.captureOfflineGainBeforeTick(player);
        const consumed = this.playerProgressionService.consumeRealmProgressAndFoundation(player, loss);
        if (Array.isArray(consumed.dirtyDomains) && consumed.dirtyDomains.length > 0) {
            markPlayerDirtyDomains(player, consumed.dirtyDomains);
        }
        if (consumed.changed) {
            this.recordPlayerStatisticMutation(player, statisticBefore);
        }
        return {
            stacks,
            loss,
            consumedProgress: consumed.consumedProgress,
            consumedFoundation: consumed.consumedFoundation,
            backlashAddedStacks,
            backlashTotalStacks,
            remainingInfusionStacks,
        };
    }
    /** 按 PVP 规则刷新或叠加指定 Buff。 */
    applyOrRefreshPvpBuff(playerId, buff, stackDelta = 0) {
        const player = this.getPlayerOrThrow(playerId);
        const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
        if (existing) {
            existing.remainingTicks = Math.max(1, Math.round(buff.duration));
            existing.duration = Math.max(1, Math.round(buff.duration));
            existing.maxStacks = Math.max(existing.maxStacks ?? 1, buff.maxStacks ?? 1);
            existing.stacks = Math.min(existing.maxStacks, Math.max(1, Math.round(existing.stacks + (stackDelta || buff.stacks || 0))));
            existing.realmLv = buff.realmLv;
            existing.persistOnDeath = buff.persistOnDeath === true;
            existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
            refreshRuntimeTemporaryBuffPrototype(existing, buff);
        }
        else {
            const created = createRuntimeTemporaryBuff(buff);
            created.stacks = Math.max(1, Math.round(stackDelta || buff.stacks || 1));
            player.buffs.buffs.push(created);
        }
        player.buffs.buffs.sort((left, right) => {
            const a = String(left.buffId ?? '');
            const b = String(right.buffId ?? '');
            return a < b ? -1 : a > b ? 1 : 0;
        });
        player.buffs.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['buff', 'attr']);
        this.bumpPersistentRevision(player);
        return player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
    }
    /** 消耗指定 PVP Buff 层数并返回剩余层数。 */
    consumePvpBuffStacks(playerId, buffId, consumedStacks) {
        if (consumedStacks <= 0) {
            return this.getBuffStacks(playerId, buffId);
        }
        const player = this.getPlayerOrThrow(playerId);
        const index = player.buffs.buffs.findIndex((entry) => entry.buffId === buffId && entry.remainingTicks > 0);
        if (index < 0) {
            return 0;
        }
        const existing = player.buffs.buffs[index];
        const nextStacks = Math.max(0, Math.round(existing.stacks) - consumedStacks);
        if (nextStacks <= 0) {
            player.buffs.buffs.splice(index, 1);
            player.buffs.revision += 1;
            this.playerAttributesService.recalculate(player);
            markPlayerDirtyDomains(player, ['buff', 'attr']);
            this.bumpPersistentRevision(player);
            return 0;
        }
        existing.stacks = nextStacks;
        existing.remainingTicks = Math.max(1, Math.round(existing.duration || 1));
        player.buffs.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['buff', 'attr']);
        this.bumpPersistentRevision(player);
        return nextStacks;
    }
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

            // stateDelta 快照：记录 tick 前的关键数值
            const stateSnapshotStartedAt = performance.now();
            const _prevHp = player.hp;
            const _prevMp = player.mp;
            const _prevExp = player.exp;
            const _prevLevel = player.level;
            recordPlayerTickPerf(options, 'playerTick.stateSnapshotMs', stateSnapshotStartedAt);

            const offlineGainSnapshotStartedAt = performance.now();
            const offlineGainBefore = this.captureOfflineGainBeforeTick(player);
            const statisticTickContext = {
                beforeSnapshot: offlineGainBefore,
                changed: false,
                progressionOnly: true,
            };
            this.playerStatisticTickContextsByPlayerId.set(player.playerId, statisticTickContext);
            try {
            let statisticChangedThisTick = false;
            recordPlayerTickPerf(options, 'playerTick.offlineGainSnapshotMs', offlineGainSnapshotStartedAt);
            let statisticProgressionOnlyThisTick = true;
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
                    this.playerAttributesService.recalculate(player);
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
            recordPlayerTickPerf(options, 'playerTick.vitalsRecoveryMs', vitalsRecoveryStartedAt);
            const idleCultivationResumeStartedAt = performance.now();
            if (player.hp > 0 && shouldResumeIdleCultivation(player, playerTick, options.idleCultivationBlockedPlayerIds)) {
                player.combat.cultivationActive = true;
                this.playerAttributesService.recalculate(player);
                markPlayerDirtyDomains(player, ['combat_pref', 'attr']);
                this.bumpPersistentRevision(player);
            }
            recordPlayerTickPerf(options, 'playerTick.idleCultivationResumeMs', idleCultivationResumeStartedAt);
            if (player.hp > 0 && player.combat.cultivationActive) {

                const cultivationAdvanceStartedAt = performance.now();
                const result = this.playerProgressionService.advanceCultivation(player, 1, {
                    auraMultiplier: resolveCultivationAuraMultiplier(player, options),
                });
                this.applyProgressionResult(player, result, playerTick);
                statisticChangedThisTick = statisticChangedThisTick || result?.changed === true;
                statisticProgressionOnlyThisTick = statisticProgressionOnlyThisTick && isProgressionOnlyStatisticResult(result);
                recordPlayerTickPerf(options, 'playerTick.cultivationAdvanceMs', cultivationAdvanceStartedAt);
            }
            if (player.hp > 0 && player.combat.autoRootFoundation === true) {
                const rootFoundationStartedAt = performance.now();
                const result = this.playerProgressionService.autoRefineRootFoundation(player);
                this.applyProgressionResult(player, result, playerTick, true);
                statisticChangedThisTick = statisticChangedThisTick || result?.changed === true;
                statisticProgressionOnlyThisTick = statisticProgressionOnlyThisTick && isProgressionOnlyStatisticResult(result);
                this.disableAutoRootFoundationAtCap(player, playerTick);
                recordPlayerTickPerf(options, 'playerTick.rootFoundationMs', rootFoundationStartedAt);
            }
            if (hasActiveSkillCooldown(player, playerTick)) {
                const cooldownActionStateStartedAt = performance.now();
                this.rebuildActionState(player, playerTick);
                recordPlayerTickPerf(options, 'playerTick.cooldownActionStateMs', cooldownActionStateStartedAt);
            }
            const offlineGainAccumulateStartedAt = performance.now();
            const contextualStatisticChanged = statisticChangedThisTick || statisticTickContext.changed === true;
            const contextualProgressionOnly = statisticProgressionOnlyThisTick && statisticTickContext.progressionOnly === true;
            this.accumulateOfflineGainAfterTick(player, offlineGainBefore, contextualStatisticChanged, {
                progressionOnly: contextualProgressionOnly,
                recordTickSectionDuration: options.recordTickSectionDuration,
            });
            recordPlayerTickPerf(options, 'playerTick.offlineGainAccumulateMs', offlineGainAccumulateStartedAt);

            // stateDelta 发射：仅在数值实际变化时入队
            const stateDeltaEmitStartedAt = performance.now();
            this.emitPlayerStateDeltaIfChanged(player, _prevHp, _prevMp, _prevExp, _prevLevel, buffTickResult);
            recordPlayerTickPerf(options, 'playerTick.stateDeltaEmitMs', stateDeltaEmitStartedAt);
            } finally {
                this.playerStatisticTickContextsByPlayerId.delete(player.playerId);
            }
    }

    /** 传法推进由 TransmissionStrategy 通过通用技艺 job pipeline 驱动。 */
    advanceTechniqueTransmissionForPlayer(player, playerTick) {
        if (!player) {
            return;
        }
        player.lifeElapsedTicks = Math.max(0, Math.trunc(Number(playerTick) || 0));
        this.captureOfflineGainBeforeTick(player);
        const { pipeline, ctx } = createTransmissionCompatPipeline(this);
        const result = pipeline.tick(player, 'transmission', ctx);
        this.recordAssetStatisticMutation(player, this.captureOfflineGainBeforeTick(player));
        return result;
    }

    /** 比较 tick 前后关键数值，有变化时向 EventBus 发射 stateDelta。 */
    private emitPlayerStateDeltaIfChanged(player, prevHp, prevMp, prevExp, prevLevel, buffTickResult) {
        if (!this.runtimeEventBusService) return;
        const hpChanged = player.hp !== prevHp;
        const mpChanged = player.mp !== prevMp;
        const expChanged = player.exp !== prevExp;
        const levelChanged = player.level !== prevLevel;
        const buffsChanged = buffTickResult?.changed && (buffTickResult.added?.length || buffTickResult?.removed?.length);
        if (!hpChanged && !mpChanged && !expChanged && !levelChanged && !buffsChanged) return;
        const delta: Record<string, unknown> = {};
        if (hpChanged) delta.hp = player.hp;
        if (mpChanged) delta.mp = player.mp;
        if (expChanged) delta.exp = player.exp;
        if (levelChanged) delta.level = player.level;
        if (buffsChanged) {
            delta.buffs = {
                added: buffTickResult.added ?? [],
                removed: buffTickResult.removed ?? [],
            };
        }
        this.runtimeEventBusService.queuePlayerStateDelta(player.playerId, delta);
    }

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
        });
    }
    /** recordPlayerStatisticMutation：把一次权威变更按发生时刻记入全局收支；离线时先归入离线会话。 */
    recordPlayerStatisticMutation(player, beforeSnapshot, endedAt = Date.now(), options: any = {}) {
        if (!beforeSnapshot || !normalizeOfflineGainString(player?.playerId)) {
            return;
        }
        const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
        const progressionOnly = options?.progressionOnly === true;
        const deltaStartedAt = performance.now();
        const resolved = progressionOnly
            ? buildOfflineGainProgressionOnlyMutation(player, beforeSnapshot)
            : null;
        const afterSnapshot = resolved?.afterSnapshot
            ?? buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService);
        const delta = resolved?.delta
            ?? buildOfflineGainDeltaParts(
                normalizeOfflineGainSnapshot(beforeSnapshot),
                normalizeOfflineGainSnapshot(afterSnapshot),
                (level) => resolveCraftSkillExpToNextByLevel(this.playerProgressionService, level),
            );
        recordPlayerTickPerf(options, progressionOnly
            ? 'playerTick.offlineGainProgressionDeltaMs'
            : 'playerTick.offlineGainFullDeltaMs', deltaStartedAt);
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
            offlineSession.accumulatedPayload = mergeOfflineGainReportPartsBySum(
                normalizeOfflineGainReportParts(offlineSession.accumulatedPayload),
                delta,
            );
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
    recordAssetStatisticMutation(player, beforeSnapshot, endedAt = Date.now()) {
        const normalizedPlayerId = normalizeOfflineGainString(player?.playerId);
        if (!normalizedPlayerId || !beforeSnapshot) {
            return;
        }
        const context = this.playerStatisticTickContextsByPlayerId.get(normalizedPlayerId);
        if (context && context.beforeSnapshot) {
            context.changed = true;
            context.progressionOnly = false;
            return;
        }
        this.recordPlayerStatisticMutation(player, beforeSnapshot, endedAt, {
            progressionOnly: false,
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
        if (!hasPlayerStatisticPeriodTotal(delta)) {
            return;
        }
        const dayKey = buildPlayerStatisticLocalDayKey(endedAt);
        mergePlayerStatisticDayTotalMap(this.playerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
        this.pendingPlayerStatisticTotalsEmitPlayerIds.add(normalizedPlayerId);
        if (this.playerDomainPersistenceService?.isEnabled?.()) {
            mergePlayerStatisticDayTotalMap(this.pendingPlayerStatisticDayTotalsByPlayerId, normalizedPlayerId, dayKey, delta);
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
            void this.flushPendingPlayerStatisticLedger(normalizedPlayerId);
        }, 0);
    }
    /** flushPendingPlayerStatisticLedger：落盘待写统计总账增量。 */
    async flushPendingPlayerStatisticLedger(playerId) {
        const normalizedPlayerId = normalizeOfflineGainString(playerId);
        if (!normalizedPlayerId) {
            return;
        }
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
            this.playerAttributesService.recalculate(player);
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
            this.playerAttributesService.recalculate(player);
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
    /**
 * listDirtyPlayerDomains：读取Dirty玩家并返回对应域集合。
 * @returns 无返回值，完成Dirty玩家域集合的读取/组装。
 */

    listDirtyPlayerDomains() {
        const dirtyPlayers = new Map();
        for (const player of this.players.values()) {
            if (isNativeGmBotPlayerId(player.playerId)) {
                continue;
            }
            const dirtyDomains = readPlayerDirtyDomains(player);
            if (dirtyDomains && dirtyDomains.size > 0) {
                dirtyPlayers.set(player.playerId, new Set(dirtyDomains));
                continue;
            }
            if (player.persistentRevision > player.persistedRevision) {
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
        return buildRuntimePlayerPersistenceSnapshot(player, this.mapTemplateRepository, dirtyDomains);
    }
    /**
     * markPersisted：标记一次落库完成，精确清除已持久化的 dirty domains。
     * - 传入 persistedDomains：只清除集合内 domain，保留 flush 期间新增的 dirty。
     * - 传入 persistedRevision：只把 persistedRevision 推进到 min(snapshotRevision, persistentRevision)，
     *   避免把 buildSnapshot 之后产生的新变更误标为已落库。
     * - 不传参数：兼容旧链路的"全清"语义。
     */
    markPersisted(playerId, persistedDomains, persistedRevision) {
        const player = this.players.get(playerId);
        if (!player) {
            return;
        }

        // 只清除本轮真正落库的 domains，保留 flush 期间新增的 dirty
        if (persistedDomains) {
            for (const domain of persistedDomains) {
                player.dirtyDomains?.delete(domain);
            }
        } else {
            clearPlayerDirtyDomains(player);
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
                attrs: this.playerAttributesService.createInitialState(),
                equipment: { revision: 1, slots: equipmentSlots },
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
                inventory: { items: snapshot.inventory.items ?? [] },
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
            this.playerAttributesService.recalculate(player);
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

        const pendingComprehensions = this.normalizePendingTechniqueComprehensionsForRuntime(snapshot.techniques?.pendingComprehensions);
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
            luck: normalizeCounter(snapshot.progression?.luck),
            bodyTraining: normalizeBodyTrainingState(snapshot.progression?.bodyTraining),
            boneAgeBaseYears: normalizeBoneAgeBaseYears(snapshot.progression?.boneAgeBaseYears),
            lifeElapsedTicks: normalizeLifeElapsedTicks(snapshot.progression?.lifeElapsedTicks),
            lifespanYears: normalizeLifespanYears(snapshot.progression?.lifespanYears),
            realm: normalizeRealmState(snapshot.progression?.realm),
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
        if (pendingComprehensions.changed) {
            markPlayerDirtyDomains(player, ['technique']);
            this.bumpPersistentRevision(player);
        }
        if (legacyTransmissionJob) {
            markPlayerDirtyDomains(player, ['technique', 'active_job']);
            this.bumpPersistentRevision(player);
        }
        syncWalletCacheFromInventory(player);
        if (ensureVitalBaselineBonus(player, snapshot.vitals)) {
            this.playerAttributesService.recalculate(player);
            markPlayerDirtyDomains(player, ['attr']);
            player.hp = clamp(snapshot.vitals.hp, 0, player.maxHp);
            player.qi = clamp(snapshot.vitals.qi, 0, player.maxQi);
        }
        if (snapshotRespawnRepaired) {
            markPlayerDirtyDomains(player, ['position_checkpoint']);
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
        if (upgradedAny) {
            markPlayerDirtyDomains(player, ['inventory', 'equipment']);
            this.bumpPersistentRevision(player);
        }
        if (repairDuplicateInventoryItemInstanceIds(player.inventory.items)) {
            markPlayerDirtyDomains(player, ['inventory']);
            this.bumpPersistentRevision(player);
        }
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
            { versionSeed: player.persistentRevision },
        );
    }
    async persistAutoUseItemRules(player) {
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
            { versionSeed: player.persistentRevision },
        );
    }
    /**
* bindRuntimeSession：为玩家生成新的运行时所有权 fencing。
 * @param player 玩家对象。
 * @param sessionId session ID。
 * @returns 无返回值，直接更新会话所有权。
 */

    bindRuntimeSession(player, sessionId) {
        this.rollbackExpiredTransfer(player);
        player.transferWriteBlocked = false;
        player.sessionId = sessionId;
        player.sessionEpoch = Math.max(1, Math.trunc(Number(player.sessionEpoch ?? 0)) + 1);
        player.runtimeOwnerId = buildRuntimeOwnerId(player.playerId, sessionId, player.sessionEpoch);
        player.lastHeartbeatAt = Date.now();
        player.offlineSinceAt = null;
        this.playerStatisticSnapshotsByPlayerId.set(player.playerId, buildOfflineGainSnapshot(player, this.contentTemplateRepository, this.playerProgressionService));
        markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
        return player;
    }
    refreshRuntimeSession(player, sessionId) {
        this.rollbackExpiredTransfer(player);
        player.transferWriteBlocked = false;
        const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
        const existingSessionId = typeof player.sessionId === 'string' ? player.sessionId.trim() : '';
        if (normalizedSessionId && normalizedSessionId === existingSessionId && player.runtimeOwnerId) {
            player.lastHeartbeatAt = Date.now();
            player.offlineSinceAt = null;
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
        const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
        const now = Date.now();
        const normalizedSessionId = typeof player?.sessionId === 'string' && player.sessionId.trim()
            ? player.sessionId.trim()
            : 'transfer';
        player.sessionEpoch = Math.max(1, Math.trunc(Number(player.sessionEpoch ?? 0)) + 1);
        player.runtimeOwnerId = buildRuntimeOwnerId(player.playerId, normalizedSessionId, player.sessionEpoch);
        player.lastHeartbeatAt = now;
        player.offlineSinceAt = null;
        player.transferState = 'in_transfer';
        player.transferTargetNodeId = normalizedTargetNodeId || null;
        player.transferStartedAt = now;
        player.transferDeadlineAt = now + PLAYER_TRANSFER_TIMEOUT_MS;
        player.transferWriteBlocked = false;
        markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
        return player;
    }
    completeTransfer(player) {
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
    flushTransferBufferedNotices(player) {
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
            markPlayerDirtyDomains(player, dirtyDomains);
        }
        return player;
    }
    /** 发送结构化玩家通知，服务端只携带 key 与变量，文本仅作为兼容 fallback。 */
    queuePlayerStructuredNotice(player, notice) {
        const text = typeof notice?.text === 'string' ? notice.text.trim() : '';
        if (!text) {
            return;
        }
        const entry = {
            id: player.notices.nextId,
            kind: notice.kind ?? 'info',
            text,
            ...(notice.structured ? { structured: notice.structured } : {}),
            ...(Array.isArray(notice.structuredGroup) && notice.structuredGroup.length > 0 ? { structuredGroup: notice.structuredGroup } : {}),
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
    applyProgressionResultWithStatistics(player, result, beforeSnapshot, currentTick = 0, rebuildActions = false) {
        this.applyProgressionResult(player, result, currentTick, rebuildActions);
        if (result?.changed) {
            this.recordPlayerStatisticMutation(player, beforeSnapshot, Date.now(), {
                progressionOnly: isProgressionOnlyStatisticResult(result),
            });
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
            const entry = {
                id: player.notices.nextId,
                kind: 'info' as const,
                text,
            };
            player.notices.nextId += 1;
            if (this.runtimeEventBusService) {
                this.runtimeEventBusService.queuePlayerNotice(player.playerId, entry);
            } else {
                player.notices.queue.push(entry);
            }
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
            markPlayerDirtyDomains(player, ['auto_battle_skill']);
        }
    }
    /**
 * applyConsumableItem：处理Consumable道具并更新相关状态。
 * @param player 玩家对象。
 * @param item 道具。
 * @returns 无返回值，直接更新Consumable道具相关状态。
 */

    applyConsumableItem(player, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let consumed = false;

        let selfChanged = false;

        const healAmount = typeof item.healAmount === 'number' ? Math.max(0, Math.round(item.healAmount)) : 0;

        const healPercent = typeof item.healPercent === 'number' ? Math.max(0, item.healPercent) : 0;

        const baselineHealPercent = typeof item.baselineHealPercent === 'number' ? Math.max(0, item.baselineHealPercent) : 0;

        const baselineQiPercent = typeof item.baselineQiPercent === 'number' ? Math.max(0, item.baselineQiPercent) : 0;

        const qiPercent = typeof item.qiPercent === 'number' ? Math.max(0, item.qiPercent) : 0;
        if (healAmount > 0 || healPercent > 0 || baselineHealPercent > 0 || baselineQiPercent > 0 || qiPercent > 0) {

            const baselineHealAmount = baselineHealPercent > 0
                ? resolveTechniqueStandardMaxHpRecoveryAmount(item.level, baselineHealPercent)
                : 0;

            const baselineQiAmount = baselineQiPercent > 0
                ? resolveTechniqueStandardMaxQiRecoveryAmount(item.level, baselineQiPercent)
                : 0;

            const nextHp = clamp(player.hp + healAmount + baselineHealAmount + Math.round(player.maxHp * healPercent), 0, player.maxHp);

            const nextQi = clamp(player.qi + baselineQiAmount + Math.round(player.maxQi * qiPercent), 0, player.maxQi);
            if (nextHp !== player.hp || nextQi !== player.qi) {
                player.hp = nextHp;
                player.qi = nextQi;
                selfChanged = true;
            }
            consumed = true;
        }
        if (Array.isArray(item.consumeBuffs) && item.consumeBuffs.length > 0) {
            const sourceRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
            for (const buff of item.consumeBuffs) {
                this.applyTemporaryBuff(player.playerId, toConsumableTemporaryBuff(item, buff, sourceRealmLv));
            }
            consumed = true;
        }
        const spiritualRootSeedTier = resolveSpiritualRootSeedTier(item);
        if (spiritualRootSeedTier) {
            const statisticBefore = this.captureOfflineGainBeforeTick(player);
            const result = this.playerProgressionService.applySpiritualRootSeed(player, spiritualRootSeedTier);
            if (!result.changed) {
                const message = result.notices?.find((notice) => typeof notice?.text === 'string' && notice.text.trim())?.text.trim()
                    ?? '当前无法使用灵根幼苗';
                throw new BadRequestException(message);
            }
            this.applyProgressionResultWithStatistics(player, result, statisticBefore);
            consumed = true;
        }
        if (item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID || item.itemId === WANGSHENG_PILL_ITEM_ID) {
            const statisticBefore = this.captureOfflineGainBeforeTick(player);
            const result = item.itemId === SHATTER_SPIRIT_PILL_ITEM_ID
                ? this.playerProgressionService.applyShatterSpiritPill(player)
                : this.playerProgressionService.applyWangshengPill(player);
            if (!result.changed) {
                const message = result.notices?.find((notice) => typeof notice?.text === 'string' && notice.text.trim())?.text.trim()
                    ?? '当前无法使用该丹药';
                throw new BadRequestException(message);
            }
            this.applyProgressionResultWithStatistics(player, result, statisticBefore);
            consumed = true;
        }
        if (selfChanged) {
            markPlayerDirtyDomains(player, ['vitals']);
            player.selfRevision += 1;
        }
        return consumed;
    }
};
function createPlayerDirtyDomainSet() {
    return new Set();
}
function markPlayerDirtyDomains(player, domains) {
    if (!player) {
        return;
    }
    if (!(player.dirtyDomains instanceof Set)) {
        player.dirtyDomains = createPlayerDirtyDomainSet();
    }
    for (const domain of Array.isArray(domains) ? domains : []) {
        if (typeof domain === 'string' && domain.trim()) {
            player.dirtyDomains.add(domain.trim());
        }
    }
}

function hasTechniqueTemplateProjectionChanged(current, hydrated) {
    return current?.name !== hydrated?.name
        || current?.grade !== hydrated?.grade
        || current?.category !== hydrated?.category
        || current?.realmLv !== hydrated?.realmLv
        || current?.skills !== hydrated?.skills
        || current?.layers !== hydrated?.layers;
}

const TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS = [
    'buffId',
    'name',
    'desc',
    'baseDesc',
    'shortMark',
    'category',
    'visibility',
    'sourceSkillId',
    'sourceSkillName',
    'color',
    'presentationScale',
    'sustainCost',
    'expireWithBuffId',
    'sourceCasterId',
];

function isRuntimeBuffActive(buff) {
    return Boolean(buff && buff.remainingTicks > 0 && buff.stacks > 0);
}

function doesTemporaryBuffAffectAttributes(buff) {
    return Boolean(buff && (buff.attrs || buff.stats));
}

function isSameTemporaryBuffAttributePayload(left, right) {
    return (left?.buffId ?? undefined) === (right?.buffId ?? undefined)
        && (left?.sourceSkillId ?? undefined) === (right?.sourceSkillId ?? undefined)
        && (left?.attrMode ?? undefined) === (right?.attrMode ?? undefined)
        && (left?.statMode ?? undefined) === (right?.statMode ?? undefined)
        && (left?.realmLv ?? undefined) === (right?.realmLv ?? undefined)
        && isSamePlainObjectValue(left?.attrs, right?.attrs)
        && isSamePlainObjectValue(left?.stats, right?.stats);
}

function isSameTemporaryBuffPrototypePayload(left, right) {
    if (!isSameTemporaryBuffAttributePayload(left, right)
        || !isSamePlainObjectValue(left?.qiProjection, right?.qiProjection)
        || !isSamePlainObjectValue(left?.tickEffects, right?.tickEffects)) {
        return false;
    }
    for (const key of TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS) {
        if ((left?.[key] ?? undefined) !== (right?.[key] ?? undefined)) {
            return false;
        }
    }
    return true;
}

function isNonConsumableTemporaryBuffReapplyNoop(existing, buff) {
    const nextStacks = Math.min(buff.maxStacks, existing.stacks + Math.max(1, buff.stacks));
    const nextSustainTicksElapsed = buff.sustainCost
        ? Math.max(0, Math.floor(Number(existing.sustainTicksElapsed ?? buff.sustainTicksElapsed ?? 0) || 0))
        : undefined;
    return existing.remainingTicks === buff.remainingTicks
        && existing.duration === buff.duration
        && existing.stacks === nextStacks
        && existing.maxStacks === buff.maxStacks
        && existing.realmLv === buff.realmLv
        && (existing.infiniteDuration === true) === (buff.infiniteDuration === true)
        && existing.sustainTicksElapsed === nextSustainTicksElapsed
        && (existing.persistOnDeath === true) === (buff.persistOnDeath === true)
        && (existing.persistOnReturnToSpawn === true) === (buff.persistOnReturnToSpawn === true)
        && isSameTemporaryBuffReferencePayload(existing, buff);
}

function isSameTemporaryBuffReferencePayload(left, right) {
    if ((left?.buffId ?? undefined) !== (right?.buffId ?? undefined)
        || (left?.sourceSkillId ?? undefined) !== (right?.sourceSkillId ?? undefined)
        || (left?.attrMode ?? undefined) !== (right?.attrMode ?? undefined)
        || (left?.statMode ?? undefined) !== (right?.statMode ?? undefined)
        || (left?.attrs ?? undefined) !== (right?.attrs ?? undefined)
        || (left?.stats ?? undefined) !== (right?.stats ?? undefined)
        || (left?.qiProjection ?? undefined) !== (right?.qiProjection ?? undefined)
        || (left?.tickEffects ?? undefined) !== (right?.tickEffects ?? undefined)) {
        return false;
    }
    for (const key of TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS) {
        if ((left?.[key] ?? undefined) !== (right?.[key] ?? undefined)) {
            return false;
        }
    }
    return true;
}

function isSamePlainObjectValue(left, right) {
    if (left === right) {
        return true;
    }
    if (left === undefined || left === null || right === undefined || right === null) {
        return left === right;
    }
    if (typeof left !== 'object' || typeof right !== 'object') {
        return left === right;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!isSamePlainObjectValue(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.hasOwn(right, key) || !isSamePlainObjectValue(left[key], right[key])) {
            return false;
        }
    }
    return true;
}

function resolveSpiritualRootSeedTier(item) {
    if (item?.spiritualRootSeedTier === 'heaven' || item?.spiritualRootSeedTier === 'divine') {
        return item.spiritualRootSeedTier;
    }
    if (item?.itemId === HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID) {
        return 'heaven';
    }
    if (item?.itemId === DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID) {
        return 'divine';
    }
    return null;
}
function clearPlayerDirtyDomains(player) {
    if (player?.dirtyDomains instanceof Set) {
        player.dirtyDomains.clear();
    }
}
function readPlayerDirtyDomains(player) {
    return player?.dirtyDomains instanceof Set ? player.dirtyDomains : null;
}
function isImmediateDomainPersistenceSuppressed(player) {
    return Boolean(player?.suppressImmediateDomainPersistence);
}
function isPlayerRuntimeDirty(player) {
    return (player?.dirtyDomains instanceof Set && player.dirtyDomains.size > 0)
        || player.persistentRevision > player.persistedRevision;
}
/**
 * buildEquipmentSnapshot：构建并返回目标对象。
 * @param equipment 参数说明。
 * @returns 无返回值，直接更新装备快照相关状态。
 */

function buildEquipmentSnapshot(equipment) {
    return EQUIP_SLOTS.map((slot) => ({
        slot,
        item: equipment[slot] ?? null,
    }));
}
function cloneQuestRuntimeEntry(entry) {
    const objectiveType = entry.objectiveType === 'talk'
        || entry.objectiveType === 'submit_item'
        || entry.objectiveType === 'learn_technique'
        || entry.objectiveType === 'realm_progress'
        || entry.objectiveType === 'realm_stage'
        ? entry.objectiveType
        : 'kill';
    const status = entry.status === 'available' || entry.status === 'active' || entry.status === 'ready' || entry.status === 'completed' ? entry.status : 'active';
    const required = Math.max(1, Math.trunc(Number(entry.required ?? 1)));
    const cloned: any = {
        id: typeof entry.id === 'string' ? entry.id : '',
        line: entry.line === 'main' || entry.line === 'daily' || entry.line === 'encounter' ? entry.line : 'side',
        status,
        objectiveType,
        progress: status === 'completed' ? required : normalizeQuestProgressNumber(entry.progress),
        required,
        targetMonsterId: typeof entry.targetMonsterId === 'string' ? entry.targetMonsterId : '',
    };
    if (typeof entry.targetName === 'string' && entry.targetName.trim() && entry.targetName !== cloned.targetMonsterId) {
        cloned.targetName = entry.targetName.trim();
    }
    if (typeof entry.targetTechniqueId === 'string' && entry.targetTechniqueId.trim()) {
        cloned.targetTechniqueId = entry.targetTechniqueId.trim();
    }
    if (entry.targetRealmStage !== undefined) {
        cloned.targetRealmStage = entry.targetRealmStage;
    }
    if (typeof entry.nextQuestId === 'string' && entry.nextQuestId.trim()) {
        cloned.nextQuestId = entry.nextQuestId.trim();
    }
    if (typeof entry.requiredItemId === 'string' && entry.requiredItemId.trim()) {
        cloned.requiredItemId = entry.requiredItemId.trim();
    }
    if (Number.isInteger(entry.requiredItemCount)) {
        cloned.requiredItemCount = Number(entry.requiredItemCount);
    }
    if (typeof entry.giverId === 'string' && entry.giverId.trim()) {
        cloned.giverId = entry.giverId.trim();
    }
    if (typeof entry.targetMapId === 'string' && entry.targetMapId.trim()) {
        cloned.targetMapId = entry.targetMapId.trim();
    }
    if (typeof entry.targetNpcId === 'string' && entry.targetNpcId.trim()) {
        cloned.targetNpcId = entry.targetNpcId.trim();
    }
    if (typeof entry.submitNpcId === 'string' && entry.submitNpcId.trim()) {
        cloned.submitNpcId = entry.submitNpcId.trim();
    }
    if (typeof entry.submitMapId === 'string' && entry.submitMapId.trim()) {
        cloned.submitMapId = entry.submitMapId.trim();
    }
    return cloned;
}
function normalizeQuestProgressNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function cloneQuestRuntimeEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }
    const clonedEntries = [];
    for (const entry of entries) {
        clonedEntries.push(cloneQuestRuntimeEntry(entry));
    }
    return clonedEntries;
}

/**
 * cloneRuntimePlayerState：构建运行态玩家状态。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新运行态玩家状态相关状态。
 */

function cloneRuntimePlayerState(player) {
    return {
        ...player,
        runtimeOwnerId: typeof player.runtimeOwnerId === 'string' ? player.runtimeOwnerId : null,
        sessionEpoch: Number.isFinite(player.sessionEpoch) ? Math.trunc(Number(player.sessionEpoch)) : 0,
        lastHeartbeatAt: Number.isFinite(player.lastHeartbeatAt)
            ? Math.trunc(Number(player.lastHeartbeatAt))
            : null,
        offlineSinceAt: Number.isFinite(player.offlineSinceAt)
            ? Math.trunc(Number(player.offlineSinceAt))
            : null,
        realm: cloneRealmState(player.realm),
        heavenGate: cloneHeavenGateState(player.heavenGate),
        spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
        worldPreference: {
            linePreset: normalizePlayerWorldPreferenceLinePreset(player.worldPreference?.linePreset),
        },
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        unlockedMapIds: player.unlockedMapIds.slice(),
        inventory: {
            revision: player.inventory.revision,
            capacity: player.inventory.capacity,
            items: player.inventory.items.map((entry) => cloneItemPreservingTemplate(entry)),
            lockedItems: Array.isArray(player.inventory.lockedItems)
                ? player.inventory.lockedItems.map((entry) => ({ ...entry }))
                : [],
        },
        wallet: {
            balances: Array.isArray(player.wallet?.balances)
                ? player.wallet.balances.map((entry) => ({ ...entry }))
                : [],
        },
        marketStorage: {
            items: Array.isArray(player.marketStorage?.items)
                ? player.marketStorage.items.map((entry) => ({ ...entry }))
                : [],
        },
        equipment: {
            revision: player.equipment.revision,
            slots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? cloneItemPreservingTemplate(entry.item) : null,
            })),
        },
        techniques: {
            revision: player.techniques.revision,
            techniques: player.techniques.techniques.map((entry) => ({ ...entry })),
            cultivatingTechId: player.techniques.cultivatingTechId,
            pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
        },
        attrs: cloneRuntimeAttrState(player.attrs),
        actions: {
            revision: player.actions.revision,
            contextActions: player.actions.contextActions.map((entry) => ({ ...entry })),
            actions: player.actions.actions.map((entry) => ({ ...entry })),
        },
        buffs: {
            revision: player.buffs.revision,
            buffs: player.buffs.buffs.map((entry) => createRuntimeTemporaryBuff(entry)),
        },
        combat: {
            cooldownReadyTickBySkillId: { ...player.combat.cooldownReadyTickBySkillId },
            autoBattle: player.combat.autoBattle,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            autoUsePills: cloneAutoUsePillList(player.combat.autoUsePills),
            combatTargetingRules: cloneCombatTargetingRules(player.combat.combatTargetingRules),
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
            retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
            retaliatePlayerTargetLastAttackTick: player.combat.retaliatePlayerTargetLastAttackTick,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            autoRootFoundation: player.combat.autoRootFoundation === true,
            senseQiActive: player.combat.senseQiActive,
            wangQiActive: player.combat.wangQiActive === true,
            autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            cultivationActive: player.combat.cultivationActive,
            lastActiveTick: player.combat.lastActiveTick,
            combatActionTick: player.combat.combatActionTick ?? 0,
            combatActionsUsedThisTick: player.combat.combatActionsUsedThisTick ?? 0,
        },
        notices: {
            nextId: player.notices.nextId,
            queue: player.notices.queue.map((entry) => ({ ...entry })),
        },
        quests: {
            revision: player.quests.revision,
            quests: cloneQuestRuntimeEntries(player.quests.quests),
        },
        alchemySkill: cloneCraftSkillState(player.alchemySkill),
        forgingSkill: cloneCraftSkillState(player.forgingSkill),
        gatherSkill: cloneCraftSkillState(player.gatherSkill),
        buildingSkill: cloneCraftSkillState(player.buildingSkill),
        miningSkill: cloneCraftSkillState(player.miningSkill),
        formationSkill: cloneCraftSkillState(player.formationSkill),
        transmissionSkill: cloneCraftSkillState(player.transmissionSkill),
        transmissionJob: player.transmissionJob ? cloneTransmissionJob(player.transmissionJob) : null,
        gatherJob: player.gatherJob ? cloneGatherJob(player.gatherJob) : null,
        buildingJob: player.buildingJob ? cloneBuildingJob(player.buildingJob) : null,
        miningJob: player.miningJob ? cloneMiningJob(player.miningJob) : null,
        formationJob: player.formationJob ? cloneFormationJob(player.formationJob) : null,
        techniqueActivityQueue: cloneTechniqueActivityQueue(player.techniqueActivityQueue),
        alchemyPresets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
        alchemyJob: player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
        forgingJob: player.forgingJob ? cloneAlchemyJob(player.forgingJob) : null,
        enhancementSkill: cloneCraftSkillState(player.enhancementSkill),
        enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
        enhancementJob: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
        enhancementRecords: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
        lootWindowTarget: player.lootWindowTarget
            ? { ...player.lootWindowTarget }
            : null,
        pendingLogbookMessages: player.pendingLogbookMessages.map((entry) => ({ ...entry })),
        vitalRecoveryDeferredUntilTick: player.vitalRecoveryDeferredUntilTick,
        runtimeBonuses: cloneRuntimeBonusesForSnapshot(player.runtimeBonuses),
        dirtyDomains: createPlayerDirtyDomainSet(),
        // cloneRuntimePlayerState 用于快照/旁路读取，不应共享 quest marker cache 引用；新副本起一个空 Map。
        npcQuestMarkerCache: new Map(),
    };
}
function normalizeWalletType(walletType) {
    const value = typeof walletType === 'string' ? walletType.trim() : '';
    return value.length > 0 ? value : '';
}
function ensureWalletBalances(player) {
    if (!player.wallet || !Array.isArray(player.wallet.balances)) {
        player.wallet = {
            balances: [],
        };
    }
    return player.wallet.balances;
}
function readWalletBalance(player, walletType) {
    const balances = Array.isArray(player.wallet?.balances) ? player.wallet.balances : [];
    return balances.reduce((total, entry) => total + (entry?.walletType === walletType ? Math.max(0, Math.trunc(Number(entry?.balance ?? 0))) : 0), 0);
}
function readInventoryItemCount(player, itemId) {
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
    if (!normalizedItemId || !Array.isArray(player?.inventory?.items)) {
        return 0;
    }
    return player.inventory.items.reduce((total, entry) => total + (entry?.itemId === normalizedItemId ? Math.max(0, Math.trunc(Number(entry?.count ?? 0))) : 0), 0);
}
function normalizeOfflineGainString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeOfflineGainCount(value) {
    return Math.max(0, Math.trunc(Number(value ?? 0) || 0));
}
function normalizeOfflineGainSignedCount(value) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}
function buildOfflineGainSessionId(playerId, startedAt) {
    const normalizedPlayerId = normalizeOfflineGainString(playerId) || 'player';
    const normalizedStartedAt = Math.max(0, Math.trunc(Number(startedAt) || Date.now()));
    const digest = createHash('sha1')
        .update(`${normalizedPlayerId}:${normalizedStartedAt}`)
        .digest('base64url')
        .slice(0, 18);
    return `offline:${normalizedStartedAt}:${digest}`;
}
function buildPlayerStatisticRecordId(playerId, timestamp, scope = 'online') {
    const normalizedPlayerId = normalizeOfflineGainString(playerId) || 'player';
    const normalizedTimestamp = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
    const normalizedScope = scope === 'offline' ? 'offline' : 'online';
    const digest = createHash('sha1')
        .update(`${normalizedScope}:${normalizedPlayerId}:${normalizedTimestamp}:${Math.random()}`)
        .digest('base64url')
        .slice(0, 18);
    return `stat:${normalizedScope}:${normalizedTimestamp}:${digest}`;
}
function createEmptyOfflineGainReportParts() {
    return {
        spiritStones: { gained: 0, lost: 0, net: 0 },
        items: [],
        progress: [],
        techniques: [],
        professions: [],
    };
}
function shouldBlockOfflineGainSessionRecord(session, now = Date.now()) {
    if (!session || typeof session !== 'object') {
        return false;
    }
    if (session.accumulatedDurationMs !== undefined && session.accumulatedDurationMs !== null && Number.isFinite(Number(session.accumulatedDurationMs))) {
        const accumulatedDurationMs = normalizeOfflineGainCount(session.accumulatedDurationMs);
        return accumulatedDurationMs >= OFFLINE_GAIN_REPORT_MIN_DURATION_MS;
    }
    const startedAt = normalizeOfflineGainCount(session.startedAt);
    return startedAt > 0 && Math.max(0, normalizeOfflineGainCount(now) - startedAt) >= OFFLINE_GAIN_REPORT_MIN_DURATION_MS;
}
const PROGRESSION_ONLY_STATISTIC_DOMAINS = new Set([
    'progression',
    'attr',
    'technique',
    'body_training',
    'vitals',
]);
function isProgressionOnlyStatisticResult(result) {
    if (result?.changed !== true) {
        return true;
    }
    const dirtyDomains = Array.isArray(result?.dirtyDomains) ? result.dirtyDomains : [];
    if (dirtyDomains.length === 0) {
        return true;
    }
    return dirtyDomains.every((domain) => PROGRESSION_ONLY_STATISTIC_DOMAINS.has(domain));
}
function mergeOfflineGainSessionRecords(persistedSession, memorySession) {
    if (!persistedSession && !memorySession) {
        return null;
    }
    if (!memorySession) {
        return persistedSession;
    }
    if (!persistedSession) {
        return memorySession;
    }
    return {
        ...persistedSession,
        ...memorySession,
        playerId: normalizeOfflineGainString(memorySession.playerId) || normalizeOfflineGainString(persistedSession.playerId),
        sessionId: normalizeOfflineGainString(memorySession.sessionId) || normalizeOfflineGainString(persistedSession.sessionId),
        startedAt: normalizeOfflineGainCount(memorySession.startedAt || persistedSession.startedAt),
        baselinePayload: memorySession.baselinePayload ?? persistedSession.baselinePayload,
        accumulatedPayload: memorySession.accumulatedPayload ?? persistedSession.accumulatedPayload,
        accumulatedDurationMs: normalizeOfflineGainCount(memorySession.accumulatedDurationMs ?? persistedSession.accumulatedDurationMs),
    };
}
function accumulateOfflineGainSessionDelta(session, beforeSnapshot, afterSnapshot, resolveProfessionExpToNext = null) {
    if (!session) {
        return;
    }
    const delta = buildOfflineGainDeltaParts(
        normalizeOfflineGainSnapshot(beforeSnapshot),
        normalizeOfflineGainSnapshot(afterSnapshot),
        resolveProfessionExpToNext,
    );
    session.accumulatedPayload = mergeOfflineGainReportPartsBySum(
        normalizeOfflineGainReportParts(session.accumulatedPayload),
        delta,
    );
}
function buildOfflineGainDeltaParts(before, after, resolveProfessionExpToNext = null) {
    const itemDeltas = diffOfflineGainItems(before.inventoryItems, after.inventoryItems);
    const spiritStones = itemDeltas
        .filter((entry) => isWalletCacheItemId(entry.itemId))
        .reduce((total, entry) => ({
            gained: total.gained + normalizeOfflineGainCount(entry.gained ?? entry.count),
            lost: total.lost + normalizeOfflineGainCount(entry.lost),
            net: total.net + normalizeOfflineGainSignedCount(entry.net ?? ((entry.gained ?? entry.count ?? 0) - (entry.lost ?? 0))),
        }), { gained: 0, lost: 0, net: 0 });
    return {
        spiritStones,
        items: itemDeltas.filter((entry) => !isWalletCacheItemId(entry.itemId)),
        progress: diffOfflineGainProgress(before, after),
        techniques: diffOfflineGainTechniques(before.techniques, after.techniques),
        professions: diffOfflineGainProfessions(before.professions, after.professions, resolveProfessionExpToNext),
    };
}
function buildOfflineGainProgressionOnlyMutation(player, beforeSnapshot) {
    const before = normalizeOfflineGainSnapshot(beforeSnapshot);
    const techniqueResult = buildOfflineGainProgressionTechniqueSnapshotAndDelta(player?.techniques?.techniques, before.techniques);
    const afterSnapshot = buildOfflineGainProgressionOnlySnapshot(player, before, techniqueResult.snapshot);
    return {
        afterSnapshot,
        delta: {
            spiritStones: { gained: 0, lost: 0, net: 0 },
            items: [],
            progress: diffOfflineGainProgress(before, afterSnapshot),
            techniques: techniqueResult.delta,
            professions: [],
        },
    };
}
function buildOfflineGainProgressionOnlySnapshot(player, previousSnapshot, techniqueSnapshot = undefined) {
    return {
        snapshotAt: Date.now(),
        playerId: normalizeOfflineGainString(player?.playerId),
        inventoryItems: previousSnapshot.inventoryItems,
        realm: {
            realmLv: normalizeOfflineGainCount(player?.realm?.realmLv),
            level: normalizeOfflineGainCount(player?.realm?.realmLv),
            progress: normalizeOfflineGainCount(player?.realm?.progress),
            exp: normalizeOfflineGainCount(player?.realm?.progress),
            progressToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
            expToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
        },
        foundation: normalizeOfflineGainCount(player?.foundation),
        rootFoundation: normalizeOfflineGainCount(player?.rootFoundation),
        combatExp: normalizeOfflineGainCount(player?.combatExp),
        bodyTraining: buildOfflineGainExpStateSnapshot(player?.bodyTraining, {
            minLevel: 0,
            resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
                ? getBodyTrainingExpToNext(level)
                : normalizeOfflineGainCount(player?.bodyTraining?.expToNext),
        }),
        techniques: Array.isArray(techniqueSnapshot)
            ? techniqueSnapshot
            : buildOfflineGainProgressionTechniqueSnapshot(player?.techniques?.techniques, previousSnapshot.techniques),
        professions: previousSnapshot.professions,
    };
}
function hasOfflineGainReportParts(parts) {
    const normalized = normalizeOfflineGainReportParts(parts);
    return normalized.spiritStones.gained > 0
        || normalized.spiritStones.lost > 0
        || normalized.items.length > 0
        || normalized.progress.length > 0
        || normalized.techniques.length > 0
        || normalized.professions.length > 0;
}
function hasOfflineGainReportPartsFast(parts) {
    if (!parts || typeof parts !== 'object') {
        return false;
    }
    const spiritStones = parts.spiritStones;
    return normalizeOfflineGainCount(spiritStones?.gained) > 0
        || normalizeOfflineGainCount(spiritStones?.lost) > 0
        || (Array.isArray(parts.items) && parts.items.length > 0)
        || (Array.isArray(parts.progress) && parts.progress.length > 0)
        || (Array.isArray(parts.techniques) && parts.techniques.length > 0)
        || (Array.isArray(parts.professions) && parts.professions.length > 0);
}
function buildEmptyPlayerStatisticTotals(now = Date.now()) {
    const generatedAt = Math.max(0, Math.trunc(Number(now) || Date.now()));
    return {
        today: createEmptyPlayerStatisticPeriodTotal(),
        yesterday: createEmptyPlayerStatisticPeriodTotal(),
        week: createEmptyPlayerStatisticPeriodTotal(),
        generatedAt,
    };
}
function createEmptyPlayerStatisticPeriodTotal() {
    return {
        spiritStones: createEmptyPlayerStatisticAmount(),
        progress: createEmptyPlayerStatisticAmount(),
        techniques: createEmptyPlayerStatisticAmount(),
        professions: createEmptyPlayerStatisticAmount(),
    };
}
function createEmptyPlayerStatisticAmount() {
    return { gained: 0, lost: 0, net: 0 };
}
function buildPlayerStatisticRelevantDayKeys(now = Date.now()) {
    const keys = buildPlayerStatisticPeriodDayKeys(now);
    return Array.from(new Set([keys.today, keys.yesterday, ...keys.week]));
}
function buildPlayerStatisticPeriodDayKeys(now = Date.now()) {
    const dayStart = buildPlayerStatisticLocalDayStart(now);
    const yesterday = new Date(dayStart.getTime());
    yesterday.setDate(dayStart.getDate() - 1);
    const weekday = dayStart.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const monday = new Date(dayStart.getTime());
    monday.setDate(dayStart.getDate() + mondayOffset);
    const week = [];
    for (let index = 0; index < 7; index += 1) {
        const day = new Date(monday.getTime());
        day.setDate(monday.getDate() + index);
        week.push(buildPlayerStatisticLocalDayKey(day.getTime()));
    }
    return {
        today: buildPlayerStatisticLocalDayKey(dayStart.getTime()),
        yesterday: buildPlayerStatisticLocalDayKey(yesterday.getTime()),
        week,
    };
}
function buildPlayerStatisticLocalDayStart(timestamp = Date.now()) {
    const normalized = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
    const date = new Date(normalized);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
const PLAYER_STATISTIC_DAY_KEY_CACHE = {
    startMs: -1,
    endMs: -1,
    key: '',
};
function buildPlayerStatisticLocalDayKey(timestamp = Date.now()) {
    const normalized = Math.max(0, Math.trunc(Number(timestamp) || Date.now()));
    if (normalized >= PLAYER_STATISTIC_DAY_KEY_CACHE.startMs && normalized < PLAYER_STATISTIC_DAY_KEY_CACHE.endMs) {
        return PLAYER_STATISTIC_DAY_KEY_CACHE.key;
    }
    const dayStart = buildPlayerStatisticLocalDayStart(timestamp);
    const year = dayStart.getFullYear();
    const month = String(dayStart.getMonth() + 1).padStart(2, '0');
    const day = String(dayStart.getDate()).padStart(2, '0');
    const nextDayStart = new Date(dayStart.getTime());
    nextDayStart.setDate(dayStart.getDate() + 1);
    const key = `${year}-${month}-${day}`;
    PLAYER_STATISTIC_DAY_KEY_CACHE.startMs = dayStart.getTime();
    PLAYER_STATISTIC_DAY_KEY_CACHE.endMs = nextDayStart.getTime();
    PLAYER_STATISTIC_DAY_KEY_CACHE.key = key;
    return key;
}
function buildPlayerStatisticTotalsView(persistedByDay, runtimeByDay, now = Date.now()) {
    const keys = buildPlayerStatisticPeriodDayKeys(now);
    return {
        today: readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, keys.today),
        yesterday: readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, keys.yesterday),
        week: keys.week.reduce(
            (total, dayKey) => mergePlayerStatisticPeriodTotals(total, readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, dayKey)),
            createEmptyPlayerStatisticPeriodTotal(),
        ),
        generatedAt: Math.max(0, Math.trunc(Number(now) || Date.now())),
    };
}
function buildPlayerStatisticTotalsPatch(previous, current) {
    const patch: any = { generatedAt: Math.max(0, Math.trunc(Number(current?.generatedAt) || Date.now())) };
    const today = buildPlayerStatisticPeriodPatch(previous?.today, current?.today);
    const yesterday = buildPlayerStatisticPeriodPatch(previous?.yesterday, current?.yesterday);
    const week = buildPlayerStatisticPeriodPatch(previous?.week, current?.week);
    if (today) {
        patch.today = today;
    }
    if (yesterday) {
        patch.yesterday = yesterday;
    }
    if (week) {
        patch.week = week;
    }
    return patch;
}
function buildPlayerStatisticPeriodPatch(previous, current) {
    const patch: any = {};
    const hasPrevious = previous !== null && previous !== undefined;
    const normalizedPrevious = normalizePlayerStatisticPeriodTotal(previous);
    const normalizedCurrent = normalizePlayerStatisticPeriodTotal(current);
    if (!isSamePlayerStatisticAmount(normalizedPrevious.spiritStones, normalizedCurrent.spiritStones)
        && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.spiritStones))) {
        patch.spiritStones = normalizedCurrent.spiritStones;
    }
    if (!isSamePlayerStatisticAmount(normalizedPrevious.progress, normalizedCurrent.progress)
        && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.progress))) {
        patch.progress = normalizedCurrent.progress;
    }
    if (!isSamePlayerStatisticAmount(normalizedPrevious.techniques, normalizedCurrent.techniques)
        && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.techniques))) {
        patch.techniques = normalizedCurrent.techniques;
    }
    if (!isSamePlayerStatisticAmount(normalizedPrevious.professions, normalizedCurrent.professions)
        && (hasPrevious || hasPlayerStatisticAmount(normalizedCurrent.professions))) {
        patch.professions = normalizedCurrent.professions;
    }
    return Object.keys(patch).length > 0 ? patch : null;
}
function isSamePlayerStatisticAmount(left, right) {
    return normalizeOfflineGainCount(left?.gained) === normalizeOfflineGainCount(right?.gained)
        && normalizeOfflineGainCount(left?.lost) === normalizeOfflineGainCount(right?.lost)
        && normalizeOfflineGainSignedCount(left?.net) === normalizeOfflineGainSignedCount(right?.net);
}
function hasPlayerStatisticAmount(value) {
    return normalizeOfflineGainCount(value?.gained) > 0 || normalizeOfflineGainCount(value?.lost) > 0;
}
function hasPlayerStatisticTotalsView(totals) {
    return hasPlayerStatisticPeriodTotal(totals?.today)
        || hasPlayerStatisticPeriodTotal(totals?.yesterday)
        || hasPlayerStatisticPeriodTotal(totals?.week);
}
function hasPlayerStatisticTotalsPatch(patch) {
    return Boolean(patch?.today || patch?.yesterday || patch?.week);
}
function readPlayerStatisticDayTotal(persistedByDay, runtimeByDay, dayKey) {
    return mergePlayerStatisticPeriodTotals(
        persistedByDay instanceof Map ? persistedByDay.get(dayKey) : null,
        runtimeByDay instanceof Map ? runtimeByDay.get(dayKey) : null,
    );
}
function summarizePlayerStatisticPeriodTotal(parts) {
    const normalized = normalizeOfflineGainReportParts(parts);
    const total = createEmptyPlayerStatisticPeriodTotal();
    total.spiritStones = normalizePlayerStatisticAmountRecord(normalized.spiritStones);
    for (const entry of normalized.progress) {
        const target = entry.kind === 'bodyTrainingExp' ? 'techniques' : 'progress';
        total[target] = mergePlayerStatisticAmount(total[target], {
            gained: entry.gained ?? entry.amount,
            lost: entry.lost,
        });
    }
    for (const entry of normalized.techniques) {
        total.techniques = mergePlayerStatisticAmount(total.techniques, {
            gained: entry.expGained ?? entry.expGain,
            lost: entry.expLost,
        });
    }
    for (const entry of normalized.professions) {
        total.professions = mergePlayerStatisticAmount(total.professions, {
            gained: entry.expGained ?? entry.expGain,
            lost: entry.expLost,
        });
    }
    return normalizePlayerStatisticPeriodTotal(total);
}
function hasPlayerStatisticPeriodTotal(total) {
    const normalized = normalizePlayerStatisticPeriodTotal(total);
    return normalized.spiritStones.gained > 0
        || normalized.spiritStones.lost > 0
        || normalized.progress.gained > 0
        || normalized.progress.lost > 0
        || normalized.techniques.gained > 0
        || normalized.techniques.lost > 0
        || normalized.professions.gained > 0
        || normalized.professions.lost > 0;
}
function mergePlayerStatisticDayTotalMap(target, playerId, dayKey, delta) {
    const normalizedPlayerId = normalizeOfflineGainString(playerId);
    const normalizedDayKey = normalizeOfflineGainString(dayKey);
    const normalizedDelta = normalizePlayerStatisticPeriodTotal(delta);
    if (!normalizedPlayerId || !normalizedDayKey || !hasPlayerStatisticPeriodTotal(normalizedDelta)) {
        return;
    }
    const byDay = target.get(normalizedPlayerId) ?? new Map();
    byDay.set(normalizedDayKey, mergePlayerStatisticPeriodTotals(byDay.get(normalizedDayKey), normalizedDelta));
    target.set(normalizedPlayerId, byDay);
}
function subtractPlayerStatisticDayTotalMap(target, playerId, dayKey, delta) {
    const normalizedPlayerId = normalizeOfflineGainString(playerId);
    const normalizedDayKey = normalizeOfflineGainString(dayKey);
    if (!normalizedPlayerId || !normalizedDayKey) {
        return;
    }
    const byDay = target.get(normalizedPlayerId);
    if (!(byDay instanceof Map)) {
        return;
    }
    const next = mergePlayerStatisticPeriodTotals(byDay.get(normalizedDayKey), delta, -1);
    if (hasPlayerStatisticPeriodTotal(next)) {
        byDay.set(normalizedDayKey, next);
    } else {
        byDay.delete(normalizedDayKey);
    }
    if (byDay.size > 0) {
        target.set(normalizedPlayerId, byDay);
    } else {
        target.delete(normalizedPlayerId);
    }
}
function normalizePlayerStatisticPeriodTotal(value) {
    const record = value && typeof value === 'object' ? value : {};
    return {
        spiritStones: normalizePlayerStatisticAmountRecord(record.spiritStones),
        progress: normalizePlayerStatisticAmountRecord(record.progress),
        techniques: normalizePlayerStatisticAmountRecord(record.techniques),
        professions: normalizePlayerStatisticAmountRecord(record.professions),
    };
}
function mergePlayerStatisticPeriodTotals(leftValue, rightValue, sign = 1) {
    const left = normalizePlayerStatisticPeriodTotal(leftValue);
    const right = normalizePlayerStatisticPeriodTotal(rightValue);
    return {
        spiritStones: mergePlayerStatisticAmount(left.spiritStones, right.spiritStones, sign),
        progress: mergePlayerStatisticAmount(left.progress, right.progress, sign),
        techniques: mergePlayerStatisticAmount(left.techniques, right.techniques, sign),
        professions: mergePlayerStatisticAmount(left.professions, right.professions, sign),
    };
}
function normalizePlayerStatisticAmountRecord(value) {
    const record = value && typeof value === 'object' ? value : {};
    const gained = normalizeOfflineGainCount(record.gained ?? record.amount ?? record.expGained ?? record.expGain ?? record.count);
    const lost = normalizeOfflineGainCount(record.lost ?? record.expLost);
    return {
        gained,
        lost,
        net: gained - lost,
    };
}
function mergePlayerStatisticAmount(leftValue, rightValue, sign = 1) {
    const left = normalizePlayerStatisticAmountRecord(leftValue);
    const right = normalizePlayerStatisticAmountRecord(rightValue);
    const gained = Math.max(0, left.gained + (sign * right.gained));
    const lost = Math.max(0, left.lost + (sign * right.lost));
    return {
        gained,
        lost,
        net: gained - lost,
    };
}
function buildPlayerStatisticRecordFromParts(player, session, endedAt, parts, scope = 'offline') {
    const normalizedParts = normalizeOfflineGainReportParts(parts);
    const startedAt = normalizeOfflineGainCount(session?.startedAt ?? session?.baselinePayload?.snapshotAt ?? endedAt);
    const normalizedEndedAt = Math.max(startedAt, normalizeOfflineGainCount(endedAt));
    const accumulatedDurationMs = normalizeOfflineGainCount(session?.accumulatedDurationMs);
    const durationMs = accumulatedDurationMs > 0 ? accumulatedDurationMs : Math.max(0, normalizedEndedAt - startedAt);
    const reportEndedAt = resolveOfflineGainReportEndedAt(startedAt, durationMs, normalizedEndedAt);
    const normalizedScope = scope === 'online' ? 'online' : 'offline';
    return {
        id: normalizeOfflineGainString(session?.sessionId) || buildPlayerStatisticRecordId(player?.playerId, normalizedEndedAt, normalizedScope),
        playerId: normalizeOfflineGainString(player?.playerId) || undefined,
        scope: normalizedScope,
        source: resolvePlayerStatisticSource(normalizedParts, normalizedScope),
        startedAt,
        endedAt: reportEndedAt,
        durationMs,
        generatedAt: Date.now(),
        spiritStones: normalizedParts.spiritStones,
        items: normalizedParts.items,
        progress: normalizedParts.progress,
        techniques: normalizedParts.techniques,
        professions: normalizedParts.professions,
    };
}
function mergePendingOfflineGainReportList(playerId, reports) {
    const normalizedPlayerId = normalizeOfflineGainString(playerId);
    const normalizedReports = (Array.isArray(reports) ? reports : [])
        .filter((report) => normalizeOfflineGainString(report?.id).length > 0);
    if (!normalizedPlayerId || normalizedReports.length <= 1) {
        return normalizedReports;
    }
    const offlineReports = normalizedReports.filter((report) => report?.scope !== 'online');
    const onlineReports = normalizedReports.filter((report) => report?.scope === 'online');
    const mergedOfflineReports = offlineReports.length > 1
        ? [mergePendingOfflineGainReport(normalizedPlayerId, offlineReports)]
        : offlineReports;
    return [...mergedOfflineReports, ...onlineReports]
        .filter((report) => normalizeOfflineGainString(report?.id).length > 0)
        .sort((left, right) => normalizeOfflineGainCount(left?.startedAt) - normalizeOfflineGainCount(right?.startedAt));
}
function mergePendingOfflineGainReport(playerId, reports, nextReport = null) {
    const normalizedPlayerId = normalizeOfflineGainString(playerId);
    const normalizedReports = [...(Array.isArray(reports) ? reports : []), nextReport]
        .filter((report) => normalizeOfflineGainString(report?.id).length > 0)
        .sort((left, right) => normalizeOfflineGainCount(left?.startedAt) - normalizeOfflineGainCount(right?.startedAt));
    const first = normalizedReports[0];
    if (!first) {
        return nextReport;
    }
    if (normalizedReports.length === 1) {
        return {
            ...first,
            playerId: normalizeOfflineGainString(first.playerId) || normalizedPlayerId || undefined,
        };
    }
    const last = normalizedReports[normalizedReports.length - 1];
    const mergedParts = normalizedReports.reduce((total, report) => mergeOfflineGainReportPartsBySum(
        total,
        normalizeOfflineGainReportParts(report),
    ), createEmptyOfflineGainReportParts());
    const durationMs = normalizedReports.reduce((total, report) => total + normalizeOfflineGainCount(report?.durationMs), 0);
    const startedAt = normalizeOfflineGainCount(first.startedAt);
    const endedAt = normalizedReports.reduce(
        (latestEndedAt, report) => Math.max(latestEndedAt, resolveOfflineGainReportEndBoundary(report)),
        startedAt,
    );
    return {
        ...first,
        id: normalizeOfflineGainString(first.id),
        playerId: normalizedPlayerId || normalizeOfflineGainString(first.playerId) || undefined,
        scope: 'offline',
        source: 'cultivation',
        startedAt,
        endedAt,
        durationMs,
        generatedAt: Date.now(),
        spiritStones: mergedParts.spiritStones,
        items: mergedParts.items,
        progress: mergedParts.progress,
        techniques: mergedParts.techniques,
        professions: mergedParts.professions,
    };
}
function resolveOfflineGainReportEndedAt(startedAt, durationMs, endedAt) {
    const normalizedStartedAt = normalizeOfflineGainCount(startedAt);
    const normalizedDurationMs = normalizeOfflineGainCount(durationMs);
    const normalizedEndedAt = Math.max(normalizedStartedAt, normalizeOfflineGainCount(endedAt));
    if (normalizedDurationMs <= 0) {
        return normalizedEndedAt;
    }
    return Math.min(normalizedEndedAt, normalizedStartedAt + normalizedDurationMs);
}
function resolveOfflineGainReportEndBoundary(report) {
    const startedAt = normalizeOfflineGainCount(report?.startedAt);
    const durationMs = normalizeOfflineGainCount(report?.durationMs);
    const endedAt = normalizeOfflineGainCount(report?.endedAt);
    const fallbackEndedAt = startedAt + durationMs;
    return resolveOfflineGainReportEndedAt(startedAt, durationMs, endedAt > 0 ? endedAt : fallbackEndedAt);
}
function resolvePlayerStatisticSource(parts, scope) {
    if (scope === 'offline') {
        return 'cultivation';
    }
    const hasGrowth = parts.progress.length > 0 || parts.techniques.length > 0 || parts.professions.length > 0;
    const hasAssets = parts.items.length > 0 || parts.spiritStones.gained > 0 || parts.spiritStones.lost > 0;
    if (hasGrowth && !hasAssets) {
        return 'cultivation';
    }
    if (hasAssets && !hasGrowth) {
        return 'system';
    }
    return 'system';
}
function normalizeOfflineGainReportParts(value) {
    const record = value && typeof value === 'object' ? value : {};
    return {
        spiritStones: normalizeOfflineGainAmountRecord(record.spiritStones),
        items: normalizeOfflineGainItemGainList(record.items),
        progress: normalizeOfflineGainProgressGainList(record.progress),
        techniques: normalizeOfflineGainTechniqueGainList(record.techniques),
        professions: normalizeOfflineGainProfessionGainList(record.professions),
    };
}
function normalizeOfflineGainAmountRecord(value) {
    const record = value && typeof value === 'object' ? value : {};
    const gained = normalizeOfflineGainCount(record.gained ?? record.amount ?? record.expGained ?? record.expGain ?? record.count);
    const lost = normalizeOfflineGainCount(record.lost ?? record.expLost);
    return {
        gained,
        lost,
        net: normalizeOfflineGainSignedCount(record.net ?? record.netExp ?? gained - lost),
    };
}
function normalizeOfflineGainItemGainList(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => {
            const amount = normalizeOfflineGainAmountRecord(entry);
            return {
                itemId: normalizeOfflineGainString(entry?.itemId),
                name: normalizeOfflineGainString(entry?.name) || undefined,
                gained: amount.gained,
                lost: amount.lost,
                net: amount.net,
                count: amount.gained,
            };
        })
        .filter((entry) => entry.itemId && (entry.gained > 0 || entry.lost > 0));
}
function normalizeOfflineGainProgressGainList(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => {
            const amount = normalizeOfflineGainAmountRecord(entry);
            return {
                kind: normalizeOfflineGainProgressKind(entry?.kind),
                label: normalizeOfflineGainString(entry?.label) || '收益',
                gained: amount.gained,
                lost: amount.lost,
                net: amount.net,
                amount: amount.gained,
                levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
                levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
                currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
            };
        })
        .filter((entry) => entry.gained > 0 || entry.lost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0);
}
function normalizeOfflineGainTechniqueGainList(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => {
            const amount = normalizeOfflineGainAmountRecord({
                expGained: entry?.expGained ?? entry?.expGain,
                expLost: entry?.expLost,
                netExp: entry?.netExp,
            });
            return {
                techniqueId: normalizeOfflineGainString(entry?.techniqueId),
                name: normalizeOfflineGainString(entry?.name) || undefined,
                expGained: amount.gained,
                expLost: amount.lost,
                netExp: amount.net,
                expGain: amount.gained,
                levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
                levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
                currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
            };
        })
        .filter((entry) => entry.techniqueId && (entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0));
}
function normalizeOfflineGainProfessionGainList(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => {
            const amount = normalizeOfflineGainAmountRecord({
                expGained: entry?.expGained ?? entry?.expGain,
                expLost: entry?.expLost,
                netExp: entry?.netExp,
            });
            return {
                professionType: normalizeOfflineGainString(entry?.professionType) || 'unknown',
                label: normalizeOfflineGainString(entry?.label) || '技艺',
                expGained: amount.gained,
                expLost: amount.lost,
                netExp: amount.net,
                expGain: amount.gained,
                levelGain: normalizeOfflineGainOptionalCount(entry?.levelGain),
                levelLoss: normalizeOfflineGainOptionalCount(entry?.levelLoss),
                currentLevel: normalizeOfflineGainOptionalCount(entry?.currentLevel),
            };
        })
        .filter((entry) => entry.expGained > 0 || entry.expLost > 0 || (entry.levelGain ?? 0) > 0 || (entry.levelLoss ?? 0) > 0);
}
function normalizeOfflineGainProgressKind(value) {
    switch (value) {
        case 'realmExp':
        case 'foundation':
        case 'rootFoundation':
        case 'combatExp':
        case 'bodyTrainingExp':
            return value;
        default:
            return 'foundation';
    }
}
function normalizeOfflineGainOptionalCount(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    return normalizeOfflineGainCount(value);
}
function mergeOfflineGainReportPartsBySum(left, right) {
    return {
        spiritStones: mergeOfflineGainAmountRecord(left.spiritStones, right.spiritStones, 'sum'),
        items: mergeOfflineGainItems(left.items, right.items, 'sum'),
        progress: mergeOfflineGainProgress(left.progress, right.progress, 'sum'),
        techniques: mergeOfflineGainTechniques(left.techniques, right.techniques, 'sum'),
        professions: mergeOfflineGainProfessions(left.professions, right.professions, 'sum'),
    };
}
function mergeOfflineGainReportPartsByMaximum(left, right) {
    return {
        spiritStones: mergeOfflineGainAmountRecord(left.spiritStones, right.spiritStones, 'maximum'),
        items: mergeOfflineGainItems(left.items, right.items, 'maximum'),
        progress: mergeOfflineGainProgress(left.progress, right.progress, 'maximum'),
        techniques: mergeOfflineGainTechniques(left.techniques, right.techniques, 'maximum'),
        professions: mergeOfflineGainProfessions(left.professions, right.professions, 'maximum'),
    };
}
function mergeOfflineGainAmountRecord(leftValue, rightValue, mode) {
    const left = normalizeOfflineGainAmountRecord(leftValue);
    const right = normalizeOfflineGainAmountRecord(rightValue);
    const gained = mode === 'sum' ? left.gained + right.gained : Math.max(left.gained, right.gained);
    const lost = mode === 'sum' ? left.lost + right.lost : Math.max(left.lost, right.lost);
    return {
        gained,
        lost,
        net: gained - lost,
    };
}
function mergeOfflineGainItems(leftItems, rightItems, mode) {
    const byId = new Map();
    for (const entry of [...normalizeOfflineGainItemGainList(leftItems), ...normalizeOfflineGainItemGainList(rightItems)]) {
        const current = byId.get(entry.itemId);
        if (!current) {
            byId.set(entry.itemId, { ...entry });
            continue;
        }
        current.name = entry.name || current.name;
        const merged = mergeOfflineGainAmountRecord(current, entry, mode);
        current.gained = merged.gained;
        current.lost = merged.lost;
        current.net = merged.net;
        current.count = merged.gained;
    }
    return Array.from(byId.values()).sort((left, right) => String(left.name ?? left.itemId).localeCompare(String(right.name ?? right.itemId), 'zh-Hans-CN'));
}
function mergeOfflineGainProgress(leftRows, rightRows, mode) {
    const byKind = new Map();
    for (const entry of [...normalizeOfflineGainProgressGainList(leftRows), ...normalizeOfflineGainProgressGainList(rightRows)]) {
        const current = byKind.get(entry.kind);
        if (!current) {
            byKind.set(entry.kind, { ...entry });
            continue;
        }
        current.label = entry.label || current.label;
        const merged = mergeOfflineGainAmountRecord(current, entry, mode);
        current.gained = merged.gained;
        current.lost = merged.lost;
        current.net = merged.net;
        current.amount = merged.gained;
        current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
        current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
        current.currentLevel = entry.currentLevel ?? current.currentLevel;
    }
    return Array.from(byKind.values());
}
function mergeOfflineGainTechniques(leftRows, rightRows, mode) {
    const byId = new Map();
    for (const entry of [...normalizeOfflineGainTechniqueGainList(leftRows), ...normalizeOfflineGainTechniqueGainList(rightRows)]) {
        const current = byId.get(entry.techniqueId);
        if (!current) {
            byId.set(entry.techniqueId, { ...entry });
            continue;
        }
        current.name = entry.name || current.name;
        const merged = mergeOfflineGainAmountRecord({
            gained: current.expGained,
            lost: current.expLost,
            net: current.netExp,
        }, {
            gained: entry.expGained,
            lost: entry.expLost,
            net: entry.netExp,
        }, mode);
        current.expGained = merged.gained;
        current.expLost = merged.lost;
        current.netExp = merged.net;
        current.expGain = merged.gained;
        current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
        current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
        current.currentLevel = entry.currentLevel ?? current.currentLevel;
    }
    return Array.from(byId.values()).sort((left, right) => String(left.name ?? left.techniqueId).localeCompare(String(right.name ?? right.techniqueId), 'zh-Hans-CN'));
}
function mergeOfflineGainProfessions(leftRows, rightRows, mode) {
    const byType = new Map();
    for (const entry of [...normalizeOfflineGainProfessionGainList(leftRows), ...normalizeOfflineGainProfessionGainList(rightRows)]) {
        const current = byType.get(entry.professionType);
        if (!current) {
            byType.set(entry.professionType, { ...entry });
            continue;
        }
        current.label = entry.label || current.label;
        const merged = mergeOfflineGainAmountRecord({
            gained: current.expGained,
            lost: current.expLost,
            net: current.netExp,
        }, {
            gained: entry.expGained,
            lost: entry.expLost,
            net: entry.netExp,
        }, mode);
        current.expGained = merged.gained;
        current.expLost = merged.lost;
        current.netExp = merged.net;
        current.expGain = merged.gained;
        current.levelGain = mergeOfflineGainOptionalAmount(current.levelGain, entry.levelGain, mode);
        current.levelLoss = mergeOfflineGainOptionalAmount(current.levelLoss, entry.levelLoss, mode);
        current.currentLevel = entry.currentLevel ?? current.currentLevel;
    }
    return Array.from(byType.values()).sort((left, right) => String(left.label ?? left.professionType).localeCompare(String(right.label ?? right.professionType), 'zh-Hans-CN'));
}
function mergeOfflineGainOptionalAmount(leftValue, rightValue, mode) {
    const left = normalizeOfflineGainCount(leftValue);
    const right = normalizeOfflineGainCount(rightValue);
    const merged = mode === 'sum' ? left + right : Math.max(left, right);
    return merged > 0 ? merged : undefined;
}
function buildOfflineGainSnapshot(player, contentTemplateRepository = null, playerProgressionService = null) {
    const resolveProfessionExpToNext = (level) => resolveCraftSkillExpToNextByLevel(playerProgressionService, level);
    return {
        snapshotAt: Date.now(),
        playerId: normalizeOfflineGainString(player?.playerId),
        inventoryItems: buildOfflineGainInventorySnapshot(player?.inventory?.items, contentTemplateRepository),
        realm: {
            realmLv: normalizeOfflineGainCount(player?.realm?.realmLv),
            level: normalizeOfflineGainCount(player?.realm?.realmLv),
            progress: normalizeOfflineGainCount(player?.realm?.progress),
            exp: normalizeOfflineGainCount(player?.realm?.progress),
            progressToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
            expToNext: normalizeOfflineGainCount(player?.realm?.progressToNext),
        },
        foundation: normalizeOfflineGainCount(player?.foundation),
        rootFoundation: normalizeOfflineGainCount(player?.rootFoundation),
        combatExp: normalizeOfflineGainCount(player?.combatExp),
        bodyTraining: buildOfflineGainExpStateSnapshot(player?.bodyTraining, {
            minLevel: 0,
            resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
                ? getBodyTrainingExpToNext(level)
                : normalizeOfflineGainCount(player?.bodyTraining?.expToNext),
        }),
        techniques: buildOfflineGainTechniqueSnapshot(player?.techniques?.techniques),
        professions: [
            buildOfflineGainProfessionSnapshot('alchemy', '炼丹', player?.alchemySkill, resolveProfessionExpToNext),
            buildOfflineGainProfessionSnapshot('forging', '炼器', player?.forgingSkill, resolveProfessionExpToNext),
            buildOfflineGainProfessionSnapshot('building', '营造', player?.buildingSkill, resolveProfessionExpToNext),
            buildOfflineGainProfessionSnapshot('gather', '采集', player?.gatherSkill, resolveProfessionExpToNext),
            buildOfflineGainProfessionSnapshot('enhancement', '强化', player?.enhancementSkill, resolveProfessionExpToNext),
            buildOfflineGainProfessionSnapshot('mining', '挖矿', player?.miningSkill, resolveProfessionExpToNext),
        ].filter((entry) => Boolean(entry)),
    };
}
function buildOfflineGainInventorySnapshot(items, contentTemplateRepository = null) {
    const byItemId = new Map();
    for (const entry of Array.isArray(items) ? items : []) {
        const itemId = normalizeOfflineGainString(entry?.itemId);
        const count = normalizeOfflineGainCount(entry?.count);
        if (!itemId || count <= 0) {
            continue;
        }
        const existing = byItemId.get(itemId) ?? {
            itemId,
            name: normalizeOfflineGainString(entry?.name)
                || (typeof contentTemplateRepository?.getItemName === 'function' ? contentTemplateRepository.getItemName(itemId) : null)
                || itemId,
            count: 0,
        };
        existing.count += count;
        byItemId.set(itemId, existing);
    }
    return Array.from(byItemId.values())
        .sort((left, right) => String(left.name ?? left.itemId).localeCompare(String(right.name ?? right.itemId), 'zh-Hans-CN'));
}
function buildOfflineGainTechniqueSnapshot(techniques) {
    return (Array.isArray(techniques) ? techniques : [])
        .map((entry) => {
            const techniqueId = normalizeOfflineGainString(entry?.techId);
            if (!techniqueId) {
                return null;
            }
            return {
                techniqueId,
                name: normalizeOfflineGainString(entry?.name) || techniqueId,
                ...buildOfflineGainExpStateSnapshot(entry, {
                    minLevel: 1,
                    levelKey: 'level',
                    expKey: 'exp',
                    expToNextKey: 'expToNext',
                    expToNextByLevel: buildOfflineGainTechniqueExpTable(entry),
                }),
            };
        })
        .filter((entry) => Boolean(entry));
}
function buildOfflineGainProgressionTechniqueSnapshot(techniques, previousTechniques) {
    const previousById = new Map((Array.isArray(previousTechniques) ? previousTechniques : [])
        .map((entry) => [entry?.techniqueId, entry]));
    return (Array.isArray(techniques) ? techniques : [])
        .map((entry) => {
            const techniqueId = normalizeOfflineGainString(entry?.techId);
            if (!techniqueId) {
                return null;
            }
            const previous = previousById.get(techniqueId);
            return {
                techniqueId,
                name: normalizeOfflineGainString(entry?.name) || techniqueId,
                level: Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1)),
                exp: normalizeOfflineGainCount(entry?.exp),
                expToNext: normalizeOfflineGainCount(entry?.expToNext),
                expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
            };
        })
        .filter((entry) => Boolean(entry));
}
function buildOfflineGainProgressionTechniqueSnapshotAndDelta(techniques, previousTechniques) {
    const previousById = new Map((Array.isArray(previousTechniques) ? previousTechniques : [])
        .map((entry) => [entry?.techniqueId, entry]));
    const snapshot = [];
    const delta = [];
    for (const entry of Array.isArray(techniques) ? techniques : []) {
        const techniqueId = normalizeOfflineGainString(entry?.techId);
        if (!techniqueId) {
            continue;
        }
        const previous = previousById.get(techniqueId);
        const after = {
            techniqueId,
            name: normalizeOfflineGainString(entry?.name) || techniqueId,
            level: Math.max(1, Math.trunc(Number(entry?.level ?? 1) || 1)),
            exp: normalizeOfflineGainCount(entry?.exp),
            expToNext: normalizeOfflineGainCount(entry?.expToNext),
            expToNextByLevel: previous?.expToNextByLevel ?? buildOfflineGainTechniqueExpTable(entry),
        };
        snapshot.push(after);
        const changed = calculateOfflineGainExpChange(previous ?? {}, after);
        if (changed.expGained <= 0 && changed.expLost <= 0 && changed.levelGain <= 0 && changed.levelLoss <= 0) {
            continue;
        }
        delta.push({
            techniqueId: after.techniqueId,
            name: normalizeOfflineGainString(after.name) || undefined,
            expGained: changed.expGained,
            expLost: changed.expLost,
            netExp: changed.netExp,
            expGain: changed.expGained,
            levelGain: changed.levelGain > 0 ? changed.levelGain : undefined,
            levelLoss: changed.levelLoss > 0 ? changed.levelLoss : undefined,
            currentLevel: normalizeOfflineGainCount(after.level),
        });
    }
    return { snapshot, delta };
}
function buildOfflineGainTechniqueExpTable(technique) {
    const byLevel: Record<string, number> = {};
    for (const layer of Array.isArray(technique?.layers) ? technique.layers : []) {
        const level = normalizeOfflineGainCount(layer?.level);
        const expToNext = normalizeOfflineGainCount(layer?.expToNext);
        if (level > 0) {
            byLevel[String(level)] = expToNext;
        }
    }
    return byLevel;
}
function buildOfflineGainProfessionSnapshot(professionType, label, state, resolveExpToNext = null) {
    if (!state) {
        return null;
    }
    return {
        professionType,
        label,
        ...buildOfflineGainExpStateSnapshot(state, {
            minLevel: 1,
            resolveExpToNext: resolveExpToNext ?? resolveCraftSkillExpToNextForLevel,
        }),
    };
}
function buildOfflineGainExpStateSnapshot(state, options: any = {}) {
    const levelKey = options.levelKey ?? 'level';
    const expKey = options.expKey ?? 'exp';
    const expToNextKey = options.expToNextKey ?? 'expToNext';
    const minLevel = Number.isFinite(options.minLevel) ? Math.trunc(Number(options.minLevel)) : 0;
    const level = Math.max(minLevel, Math.trunc(Number(state?.[levelKey] ?? minLevel) || minLevel));
    const fallbackExpToNext = typeof options.resolveExpToNext === 'function'
        ? options.resolveExpToNext(level)
        : state?.[expToNextKey];
    return {
        level,
        exp: normalizeOfflineGainCount(state?.[expKey]),
        expToNext: normalizeOfflineGainCount(state?.[expToNextKey] ?? fallbackExpToNext),
        expToNextByLevel: options.expToNextByLevel ?? null,
    };
}
function resolveCraftSkillExpToNextForLevel(level) {
    return resolveCraftSkillExpToNextByLevel(null, level, DEFAULT_CRAFT_EXP_TO_NEXT);
}
function buildOfflineGainReportFromSession(player, session, endedAt, contentTemplateRepository = null) {
    const baseline = normalizeOfflineGainSnapshot(session?.baselinePayload);
    const startedAt = normalizeOfflineGainCount(session?.startedAt ?? baseline.snapshotAt);
    const normalizedEndedAt = Math.max(startedAt, normalizeOfflineGainCount(endedAt));
    const mergedPayload = normalizeOfflineGainReportParts(session?.accumulatedPayload);
    return buildPlayerStatisticRecordFromParts(player, {
        sessionId: normalizeOfflineGainString(session?.sessionId) || buildOfflineGainSessionId(player?.playerId, startedAt),
        startedAt,
        baselinePayload: session?.baselinePayload,
        accumulatedPayload: mergedPayload,
        accumulatedDurationMs: normalizeOfflineGainCount(session?.accumulatedDurationMs),
    }, normalizedEndedAt, mergedPayload, 'offline');
}
function normalizeOfflineGainSnapshot(value) {
    const record = value && typeof value === 'object' ? value : {};
    return {
        snapshotAt: normalizeOfflineGainCount(record.snapshotAt),
        inventoryItems: normalizeOfflineGainItemSnapshotList(record.inventoryItems),
        realm: normalizeOfflineGainExpRecord(record.realm, { levelKey: 'realmLv', minLevel: 0 }),
        foundation: normalizeOfflineGainCount(record.foundation),
        rootFoundation: normalizeOfflineGainCount(record.rootFoundation),
        combatExp: normalizeOfflineGainCount(record.combatExp),
        bodyTraining: normalizeOfflineGainExpRecord(record.bodyTraining, { minLevel: 0 }),
        techniques: normalizeOfflineGainExpNamedList(record.techniques, 'techniqueId'),
        professions: normalizeOfflineGainExpNamedList(record.professions, 'professionType'),
    };
}
function normalizeOfflineGainItemSnapshotList(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => ({
            itemId: normalizeOfflineGainString(entry?.itemId),
            name: normalizeOfflineGainString(entry?.name) || undefined,
            count: normalizeOfflineGainCount(entry?.count),
        }))
        .filter((entry) => entry.itemId && entry.count > 0);
}
function normalizeOfflineGainExpNamedList(value, idKey) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => ({
            ...normalizeOfflineGainExpRecord(entry, { minLevel: 1 }),
            [idKey]: normalizeOfflineGainString(entry?.[idKey]),
            name: normalizeOfflineGainString(entry?.name) || undefined,
            label: normalizeOfflineGainString(entry?.label) || undefined,
        }))
        .filter((entry) => entry[idKey]);
}
function normalizeOfflineGainExpRecord(value, options: any = {}) {
    const record = value && typeof value === 'object' ? value : {};
    const levelKey = options.levelKey ?? 'level';
    const minLevel = Number.isFinite(options.minLevel) ? Math.trunc(Number(options.minLevel)) : 0;
    const level = Math.max(minLevel, Math.trunc(Number(record[levelKey] ?? record.level ?? minLevel) || minLevel));
    return {
        level,
        realmLv: normalizeOfflineGainCount(record.realmLv ?? level),
        exp: normalizeOfflineGainCount(record.exp ?? record.progress),
        progress: normalizeOfflineGainCount(record.progress ?? record.exp),
        expToNext: normalizeOfflineGainCount(record.expToNext ?? record.progressToNext),
        progressToNext: normalizeOfflineGainCount(record.progressToNext ?? record.expToNext),
        expToNextByLevel: record.expToNextByLevel && typeof record.expToNextByLevel === 'object'
            ? { ...record.expToNextByLevel }
            : null,
    };
}
function diffOfflineGainItems(beforeItems, afterItems) {
    const byId = new Map();
    for (const entry of Array.isArray(beforeItems) ? beforeItems : []) {
        const itemId = normalizeOfflineGainString(entry?.itemId);
        if (!itemId) {
            continue;
        }
        const current = byId.get(itemId) ?? {
            itemId,
            name: normalizeOfflineGainString(entry?.name) || undefined,
            before: 0,
            after: 0,
        };
        current.before += normalizeOfflineGainCount(entry?.count);
        current.name = current.name || normalizeOfflineGainString(entry?.name) || undefined;
        byId.set(itemId, current);
    }
    for (const entry of Array.isArray(afterItems) ? afterItems : []) {
        const itemId = normalizeOfflineGainString(entry?.itemId);
        if (!itemId) {
            continue;
        }
        const current = byId.get(itemId) ?? {
            itemId,
            name: normalizeOfflineGainString(entry?.name) || undefined,
            before: 0,
            after: 0,
        };
        current.after += normalizeOfflineGainCount(entry?.count);
        current.name = normalizeOfflineGainString(entry?.name) || current.name;
        byId.set(itemId, current);
    }
    return Array.from(byId.values())
        .map((entry) => {
            const net = normalizeOfflineGainSignedCount(entry.after - entry.before);
            if (net === 0) {
                return null;
            }
            const gained = Math.max(0, net);
            const lost = Math.max(0, -net);
            return {
                itemId: entry.itemId,
                name: normalizeOfflineGainString(entry.name) || undefined,
                gained,
                lost,
                net,
                count: gained,
            };
        })
        .filter((entry) => Boolean(entry));
}
function diffOfflineGainProgress(before, after) {
    const progress = [];
    const realmDelta = calculateOfflineGainExpChange(before.realm, after.realm, {
        beforeLevelKey: 'realmLv',
        afterLevelKey: 'realmLv',
    });
    if (realmDelta.expGained > 0 || realmDelta.expLost > 0 || realmDelta.levelGain > 0 || realmDelta.levelLoss > 0) {
        progress.push({
            kind: 'realmExp',
            label: '修为',
            gained: realmDelta.expGained,
            lost: realmDelta.expLost,
            net: realmDelta.netExp,
            amount: realmDelta.expGained,
            levelGain: realmDelta.levelGain > 0 ? realmDelta.levelGain : undefined,
            levelLoss: realmDelta.levelLoss > 0 ? realmDelta.levelLoss : undefined,
            currentLevel: normalizeOfflineGainCount(after.realm?.realmLv),
        });
    }
    appendOfflineGainProgressDelta(progress, 'foundation', '底蕴', before.foundation, after.foundation);
    appendOfflineGainProgressDelta(progress, 'rootFoundation', '根基', before.rootFoundation, after.rootFoundation);
    appendOfflineGainProgressDelta(progress, 'combatExp', '战斗经验', before.combatExp, after.combatExp);
    const bodyTrainingDelta = calculateOfflineGainExpChange(before.bodyTraining, after.bodyTraining, {
        resolveExpToNext: (level) => typeof getBodyTrainingExpToNext === 'function'
            ? getBodyTrainingExpToNext(level)
            : 0,
    });
    if (bodyTrainingDelta.expGained > 0 || bodyTrainingDelta.expLost > 0 || bodyTrainingDelta.levelGain > 0 || bodyTrainingDelta.levelLoss > 0) {
        progress.push({
            kind: 'bodyTrainingExp',
            label: '炼体经验',
            gained: bodyTrainingDelta.expGained,
            lost: bodyTrainingDelta.expLost,
            net: bodyTrainingDelta.netExp,
            amount: bodyTrainingDelta.expGained,
            levelGain: bodyTrainingDelta.levelGain > 0 ? bodyTrainingDelta.levelGain : undefined,
            levelLoss: bodyTrainingDelta.levelLoss > 0 ? bodyTrainingDelta.levelLoss : undefined,
            currentLevel: normalizeOfflineGainCount(after.bodyTraining?.level),
        });
    }
    return progress;
}
function appendOfflineGainProgressDelta(progress, kind, label, beforeValue, afterValue) {
    const amount = normalizeOfflineGainCount(afterValue) - normalizeOfflineGainCount(beforeValue);
    if (amount === 0) {
        return;
    }
    progress.push({
        kind,
        label,
        gained: Math.max(0, amount),
        lost: Math.max(0, -amount),
        net: amount,
        amount: Math.max(0, amount),
    });
}
function diffOfflineGainTechniques(beforeTechniques, afterTechniques) {
    const beforeById = new Map((Array.isArray(beforeTechniques) ? beforeTechniques : [])
        .map((entry) => [entry.techniqueId, entry]));
    return (Array.isArray(afterTechniques) ? afterTechniques : [])
        .map((after) => {
            const before = beforeById.get(after.techniqueId) ?? {};
            const delta = calculateOfflineGainExpChange(before, after);
            if (delta.expGained <= 0 && delta.expLost <= 0 && delta.levelGain <= 0 && delta.levelLoss <= 0) {
                return null;
            }
            return {
                techniqueId: after.techniqueId,
                name: normalizeOfflineGainString(after.name) || undefined,
                expGained: delta.expGained,
                expLost: delta.expLost,
                netExp: delta.netExp,
                expGain: delta.expGained,
                levelGain: delta.levelGain > 0 ? delta.levelGain : undefined,
                levelLoss: delta.levelLoss > 0 ? delta.levelLoss : undefined,
                currentLevel: normalizeOfflineGainCount(after.level),
            };
        })
        .filter((entry) => Boolean(entry));
}
function diffOfflineGainProfessions(beforeProfessions, afterProfessions, resolveExpToNext = null) {
    const beforeByType = new Map((Array.isArray(beforeProfessions) ? beforeProfessions : [])
        .map((entry) => [entry.professionType, entry]));
    return (Array.isArray(afterProfessions) ? afterProfessions : [])
        .map((after) => {
            const before = beforeByType.get(after.professionType) ?? {};
            const delta = calculateOfflineGainExpChange(before, after, {
                resolveExpToNext: resolveExpToNext ?? resolveCraftSkillExpToNextForLevel,
            });
            if (delta.expGained <= 0 && delta.expLost <= 0 && delta.levelGain <= 0 && delta.levelLoss <= 0) {
                return null;
            }
            return {
                professionType: after.professionType,
                label: normalizeOfflineGainString(after.label) || '技艺',
                expGained: delta.expGained,
                expLost: delta.expLost,
                netExp: delta.netExp,
                expGain: delta.expGained,
                levelGain: delta.levelGain > 0 ? delta.levelGain : undefined,
                levelLoss: delta.levelLoss > 0 ? delta.levelLoss : undefined,
                currentLevel: normalizeOfflineGainCount(after.level),
            };
        })
        .filter((entry) => Boolean(entry));
}
function calculateOfflineGainExpChange(before, after, options: any = {}) {
    const beforeLevelKey = options.beforeLevelKey ?? 'level';
    const afterLevelKey = options.afterLevelKey ?? 'level';
    const beforeLevel = normalizeOfflineGainCount(before?.[beforeLevelKey] ?? before?.level);
    const afterLevel = normalizeOfflineGainCount(after?.[afterLevelKey] ?? after?.level);
    if (afterLevel > beforeLevel) {
        const gained = calculateOfflineGainExpDelta(before, after, options);
        return {
            expGained: gained.expGain,
            expLost: 0,
            netExp: gained.expGain,
            levelGain: gained.levelGain,
            levelLoss: 0,
        };
    }
    if (afterLevel < beforeLevel) {
        const lost = calculateOfflineGainExpDelta(after, before, {
            ...options,
            beforeLevelKey: afterLevelKey,
            afterLevelKey: beforeLevelKey,
        });
        return {
            expGained: 0,
            expLost: lost.expGain,
            netExp: -lost.expGain,
            levelGain: 0,
            levelLoss: Math.max(0, beforeLevel - afterLevel),
        };
    }
    const expDelta = normalizeOfflineGainCount(after?.exp ?? after?.progress) - normalizeOfflineGainCount(before?.exp ?? before?.progress);
    return {
        expGained: Math.max(0, expDelta),
        expLost: Math.max(0, -expDelta),
        netExp: expDelta,
        levelGain: 0,
        levelLoss: 0,
    };
}
function calculateOfflineGainExpDelta(before, after, options: any = {}) {
    const beforeLevelKey = options.beforeLevelKey ?? 'level';
    const afterLevelKey = options.afterLevelKey ?? 'level';
    const beforeLevel = normalizeOfflineGainCount(before?.[beforeLevelKey] ?? before?.level);
    const afterLevel = normalizeOfflineGainCount(after?.[afterLevelKey] ?? after?.level);
    const beforeExp = normalizeOfflineGainCount(before?.exp ?? before?.progress);
    const afterExp = normalizeOfflineGainCount(after?.exp ?? after?.progress);
    if (afterLevel <= beforeLevel) {
        return {
            expGain: Math.max(0, afterExp - beforeExp),
            levelGain: 0,
        };
    }
    let expGain = Math.max(0, resolveOfflineGainExpToNext(beforeLevel, before, after, options) - beforeExp);
    for (let level = beforeLevel + 1; level < afterLevel; level += 1) {
        expGain += Math.max(0, resolveOfflineGainExpToNext(level, before, after, options));
    }
    expGain += afterExp;
    return {
        expGain: normalizeOfflineGainCount(expGain),
        levelGain: Math.max(0, afterLevel - beforeLevel),
    };
}
function resolveOfflineGainExpToNext(level, before, after, options: any = {}) {
    const normalizedLevel = normalizeOfflineGainCount(level);
    const fromAfter = readOfflineGainExpToNextByLevel(after, normalizedLevel);
    if (fromAfter > 0) {
        return fromAfter;
    }
    const fromBefore = readOfflineGainExpToNextByLevel(before, normalizedLevel);
    if (fromBefore > 0) {
        return fromBefore;
    }
    if (typeof options.resolveExpToNext === 'function') {
        return normalizeOfflineGainCount(options.resolveExpToNext(normalizedLevel));
    }
    if (normalizeOfflineGainCount(before?.level) === normalizedLevel) {
        return normalizeOfflineGainCount(before?.expToNext ?? before?.progressToNext);
    }
    if (normalizeOfflineGainCount(after?.level) === normalizedLevel) {
        return normalizeOfflineGainCount(after?.expToNext ?? after?.progressToNext);
    }
    return 0;
}
function readOfflineGainExpToNextByLevel(snapshot, level) {
    const table = snapshot?.expToNextByLevel;
    if (!table || typeof table !== 'object') {
        return 0;
    }
    return normalizeOfflineGainCount(table[String(level)]);
}
function isWalletCacheItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}
function syncWalletCacheFromInventory(player, changedItemId = null) {
    const normalizedChangedItemId = typeof changedItemId === 'string' ? changedItemId.trim() : '';
    const walletItemIds = normalizedChangedItemId
        ? [normalizedChangedItemId]
        : ['spirit_stone'];
    const balances = ensureWalletBalances(player);
    for (const itemId of walletItemIds) {
        if (!isWalletCacheItemId(itemId)) {
            continue;
        }
        const nextBalance = readInventoryItemCount(player, itemId);
        const index = balances.findIndex((entry) => entry?.walletType === itemId);
        if (nextBalance <= 0) {
            if (index >= 0) {
                balances.splice(index, 1);
            }
            continue;
        }
        if (index >= 0) {
            const entry = balances[index];
            if (Math.max(0, Math.trunc(Number(entry.balance ?? 0))) !== nextBalance) {
                entry.balance = nextBalance;
                entry.frozenBalance = 0;
                entry.version = Math.max(0, Math.trunc(Number(entry.version ?? 0))) + 1;
            }
            continue;
        }
        balances.push({
            walletType: itemId,
            balance: nextBalance,
            frozenBalance: 0,
            version: 1,
        });
    }
}
function consumeInventoryItemCount(items, itemId, count) {
    let remaining = Math.max(0, Math.trunc(Number(count ?? 0)));
    for (let index = 0; index < items.length && remaining > 0; index += 1) {
        const entry = items[index];
        if (entry?.itemId !== itemId) {
            continue;
        }
        const itemCount = Math.max(0, Math.trunc(Number(entry.count ?? 0)));
        const consumed = Math.min(itemCount, remaining);
        entry.count = itemCount - consumed;
        remaining -= consumed;
    }
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.itemId === itemId && Math.max(0, Math.trunc(Number(items[index]?.count ?? 0))) <= 0) {
            items.splice(index, 1);
        }
    }
    if (remaining > 0) {
        throw new NotFoundException(`背包物品不足：${itemId}`);
    }
}
/**
 * createDefaultRealmState：构建并返回目标对象。
 * @returns 无返回值，直接更新DefaultRealm状态相关状态。
 */

function createDefaultRealmState() {

    const stage = DEFAULT_PLAYER_REALM_STAGE;

    const config = PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: 1,
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: 0,
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: PLAYER_REALM_ORDER[PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: null,
    };
}
/**
 * cloneRealmState：构建Realm状态。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

function cloneRealmState(realm) {
    return projectRealmState(realm);
}
/**
 * cloneHeavenGateState：构建HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function cloneHeavenGateState(state) {
    return projectHeavenGateState(state);
}
/**
 * cloneHeavenGateRoots：构建HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function cloneHeavenGateRoots(roots) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!roots) {
        return null;
    }
    return {
        metal: roots.metal,
        wood: roots.wood,
        water: roots.water,
        fire: roots.fire,
        earth: roots.earth,
    };
}

function resolveRevealedBreakthroughRequirementIds(realm) {
    const requirements = Array.isArray(realm?.breakthrough?.requirements) ? realm.breakthrough.requirements : [];
    return requirements
        .filter((entry) => typeof entry?.id === 'string' && entry.id.trim().length > 0 && entry.hidden !== true)
        .map((entry) => entry.id.trim());
}

function buildRuntimeOwnerId(playerId, sessionId, sessionEpoch) {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : 'player';
    const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : 'session';
    const normalizedEpoch = Number.isFinite(sessionEpoch) ? Math.max(1, Math.trunc(Number(sessionEpoch))) : 1;
    const ownerDigest = createHash('sha256')
        .update(`${normalizedPlayerId}:${normalizedSessionId}:${normalizedEpoch}`)
        .digest('base64url')
        .slice(0, 32);
    return `rt:${normalizedEpoch.toString(36)}:${Date.now().toString(36)}:${randomBytes(6).toString('base64url')}:${ownerDigest}`;
}
function resolveRespawnPlacement(mapTemplateRepository, templateId, inputX, inputY) {
    const normalizedTemplateId = typeof templateId === 'string' && templateId.trim() ? templateId.trim() : '';
    const template = normalizedTemplateId
        && typeof mapTemplateRepository?.has === 'function'
        && mapTemplateRepository.has(normalizedTemplateId)
        ? mapTemplateRepository.getOrThrow(normalizedTemplateId)
        : null;
    const spawnX = Number.isFinite(template?.spawnX) ? Math.trunc(template.spawnX) : 0;
    const spawnY = Number.isFinite(template?.spawnY) ? Math.trunc(template.spawnY) : 0;
    const x = Number.isFinite(inputX) ? Math.trunc(inputX) : spawnX;
    const y = Number.isFinite(inputY) ? Math.trunc(inputY) : spawnY;
    if (!template) {
        return { x, y };
    }
    if (isWalkableTemplatePoint(template, x, y)) {
        return { x, y };
    }
    return { x: spawnX, y: spawnY };
}
function isWalkableTemplatePoint(template, x, y) {
    const width = Number.isFinite(template?.width) ? Math.trunc(template.width) : 0;
    const height = Number.isFinite(template?.height) ? Math.trunc(template.height) : 0;
    if (width <= 0 || height <= 0) {
        return true;
    }
    if (x < 0 || y < 0 || x >= width || y >= height) {
        return false;
    }
    const mask = template.walkableMask;
    if (!mask || typeof mask.length !== 'number') {
        return true;
    }
    return mask[(y * width) + x] === 1;
}
/**
 * buildRuntimePlayerPersistenceSnapshot：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新运行态玩家Persistence快照相关状态。
 */

function buildRuntimePlayerPersistenceSnapshot(player, mapTemplateRepository = null, dirtyDomains = null) {
    const dirtyDomainSet = normalizeSnapshotDirtyDomains(dirtyDomains);
    const includeAllDomains = dirtyDomainSet.size === 0;
    const needsDomain = (...domains) => includeAllDomains || domains.some((domain) => dirtyDomainSet.has(domain));
    const needsProgression = needsDomain('progression', 'body_training', 'profession', 'alchemy_preset', 'active_job', 'enhancement_record', 'attr');
    const needsCombat = needsDomain('combat_pref', 'auto_battle_skill', 'auto_use_item_rule');
    const needsTechnique = needsDomain('technique', 'combat_pref');
    const templateId = typeof player.templateId === 'string' ? player.templateId.trim() : '';
    const respawnTemplateId = typeof player.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
        ? player.respawnTemplateId.trim()
        : DEFAULT_PLAYER_STARTER_MAP_ID;
    const respawnInstanceId = normalizePlayerPlacementInstanceId(player.respawnInstanceId)
        ?? (respawnTemplateId ? buildPublicPlayerInstanceId(respawnTemplateId) : '');
    const respawnPlacement = resolveRespawnPlacement(
        mapTemplateRepository,
        respawnTemplateId,
        player.respawnX,
        player.respawnY,
    );
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
            instanceId: normalizePlayerPlacementInstanceId(player.instanceId)
                ?? (templateId ? buildPublicPlayerInstanceId(templateId) : ''),
            templateId,
            x: player.x,
            y: player.y,
            facing: player.facing,
        },
        respawn: {
            instanceId: respawnInstanceId,
            templateId: respawnTemplateId,
            x: respawnPlacement.x,
            y: respawnPlacement.y,
            facing: player.facing,
        },
        worldPreference: {
            linePreset: normalizePlayerWorldPreferenceLinePreset(player.worldPreference?.linePreset),
        },
        sectId: typeof player.sectId === 'string' && player.sectId.trim() ? player.sectId.trim() : null,
        vitals: {
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            maxQi: player.maxQi,
        },
        progression: needsProgression ? {
            foundation: player.foundation,
            rootFoundation: normalizeCounter(player.rootFoundation),
            combatExp: player.combatExp,
            comprehension: normalizeCounter(player.comprehension),
            luck: normalizeCounter(player.luck),
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
            boneAgeBaseYears: player.boneAgeBaseYears,
            lifeElapsedTicks: player.lifeElapsedTicks,
            lifespanYears: player.lifespanYears,
            realm: cloneRealmState(player.realm),
            heavenGate: cloneHeavenGateState(player.heavenGate),
            spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
            alchemySkill: cloneCraftSkillState(player.alchemySkill),
            forgingSkill: cloneCraftSkillState(player.forgingSkill),
            gatherSkill: cloneCraftSkillState(player.gatherSkill),
            buildingSkill: cloneCraftSkillState(player.buildingSkill),
            miningSkill: cloneCraftSkillState(player.miningSkill),
            formationSkill: cloneCraftSkillState(player.formationSkill),
            transmissionSkill: cloneCraftSkillState(player.transmissionSkill),
            transmissionJob: player.transmissionJob ? cloneTransmissionJob(player.transmissionJob) : null,
            gatherJob: player.gatherJob ? cloneGatherJob(player.gatherJob) : null,
            buildingJob: player.buildingJob ? cloneBuildingJob(player.buildingJob) : null,
            miningJob: player.miningJob ? cloneMiningJob(player.miningJob) : null,
            formationJob: player.formationJob ? cloneFormationJob(player.formationJob) : null,
            techniqueActivityQueue: cloneTechniqueActivityQueue(player.techniqueActivityQueue),
            alchemyPresets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
            alchemyJob: player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
            forgingJob: player.forgingJob ? cloneAlchemyJob(player.forgingJob) : null,
            enhancementSkill: cloneCraftSkillState(player.enhancementSkill),
            enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
            enhancementJob: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
            enhancementRecords: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
        } : {},
        attrState: needsDomain('attr') ? {
            baseAttrs: player.attrs?.rawBaseAttrs ? encodePersistedRawBaseAttrs(player.attrs.rawBaseAttrs) : null,
            revealedBreakthroughRequirementIds: resolveRevealedBreakthroughRequirementIds(player.realm),
        } : {},
        unlockedMapIds: needsDomain('map_unlock') ? player.unlockedMapIds.slice() : [],
        inventory: needsDomain('inventory') ? {
            revision: player.inventory.revision,
            capacity: player.inventory.capacity,
            items: player.inventory.items.map((entry) => ({ ...entry })),
            lockedItems: Array.isArray(player.inventory.lockedItems)
                ? player.inventory.lockedItems.map((entry) => ({ ...entry }))
                : [],
        } : {
            revision: player.inventory.revision,
            capacity: player.inventory.capacity,
            items: [],
            lockedItems: [],
        },
        equipment: needsDomain('equipment') ? {
            revision: player.equipment.revision,
            slots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            })),
        } : {
            revision: player.equipment.revision,
            slots: [],
        },
        techniques: needsTechnique ? {
            revision: player.techniques.revision,
            techniques: needsDomain('technique') ? player.techniques.techniques.map((entry) => buildPersistedTechniqueState(entry)) : [],
            cultivatingTechId: player.techniques.cultivatingTechId,
            pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
        } : {
            revision: player.techniques.revision,
            techniques: [],
            cultivatingTechId: player.techniques.cultivatingTechId,
            pendingComprehensions: clonePendingTechniqueComprehensions(player.pendingTechniqueComprehensions),
        },
        buffs: needsDomain('buff') ? {
            revision: player.buffs.revision,
            buffs: player.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
        } : {
            revision: player.buffs.revision,
            buffs: [],
        },
        quests: needsDomain('quest') ? {
            revision: player.quests.revision,
            entries: cloneQuestRuntimeEntries(player.quests.quests),
        } : {
            revision: player.quests.revision,
            entries: [],
        },
        combat: needsCombat ? {
            autoBattle: player.combat.autoBattle,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            autoUsePills: cloneAutoUsePillList(player.combat.autoUsePills),
            combatTargetingRules: cloneCombatTargetingRules(player.combat.combatTargetingRules),
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
            retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
            retaliatePlayerTargetLastAttackTick: player.combat.retaliatePlayerTargetLastAttackTick,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            autoRootFoundation: player.combat.autoRootFoundation === true,
            senseQiActive: player.combat.senseQiActive,
            wangQiActive: player.combat.wangQiActive === true,
            autoBattleSkills: needsDomain('auto_battle_skill') ? player.combat.autoBattleSkills.map((entry) => ({ ...entry })) : [],
        } : {
            autoBattleSkills: [],
        },
        pendingLogbookMessages: needsDomain('logbook') ? player.pendingLogbookMessages.map((entry) => ({ ...entry })) : [],
        runtimeBonuses: needsDomain('attr') ? cloneRuntimeBonusesForSnapshot(player.runtimeBonuses) : [],
    };
}

function buildPersistedTechniqueState(entry) {
    return {
        techId: entry.techId,
        level: entry.level,
        exp: entry.exp,
        expToNext: entry.expToNext,
        realmLv: entry.realmLv,
        realm: entry.realm ?? TechniqueRealm.Entry,
        skillsEnabled: entry.skillsEnabled !== false,
        name: entry.name,
        grade: entry.grade ?? null,
        category: entry.category ?? null,
        skills: Array.isArray(entry.skills) ? entry.skills : [],
        layers: Array.isArray(entry.layers) ? entry.layers : [],
    };
}

function normalizePlayerPlacementInstanceId(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
}

function normalizeSnapshotDirtyDomains(dirtyDomains) {
    const normalized = new Set();
    if (!dirtyDomains || typeof dirtyDomains[Symbol.iterator] !== 'function') {
        return normalized;
    }
    for (const domain of dirtyDomains) {
        if (typeof domain === 'string' && domain.trim()) {
            normalized.add(domain.trim());
        }
    }
    return normalized;
}

function normalizePlayerWorldPreferenceLinePreset(value) {
    return value === 'real' ? 'real' : 'peaceful';
}

function buildPublicPlayerInstanceId(templateId) {
    return `public:${templateId}`;
}
/**
 * createCraftSkillState：构建并返回目标对象。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

function createCraftSkillState(expToNext = DEFAULT_CRAFT_EXP_TO_NEXT) {
    return {
        level: 1,
        exp: 0,
        expToNext: Math.max(0, Math.floor(Number(expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT)),
    };
}
/**
 * normalizeCraftSkillState：规范化或转换炼制技能状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

function normalizeCraftSkillState(value, resolveExpToNext = null) {
    const level = Math.max(1, Math.floor(Number(value?.level) || 1));
    const expToNext = typeof resolveExpToNext === 'function'
        ? resolveExpToNext(level)
        : Math.max(0, Math.floor(Number(value?.expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT));
    return {
        level,
        exp: Math.max(0, Math.floor(Number(value?.exp) || 0)),
        expToNext: Math.max(0, Math.floor(Number(expToNext) || 0)),
    };
}
/**
 * cloneCraftSkillState：构建炼制技能状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

function cloneCraftSkillState(value) {
    return value ? { ...normalizeCraftSkillState(value) } : undefined;
}

function applyTransmissionSkillExpFromTicks(player, elapsedTicks, targetLevel, getExpToNextByLevel) {
    const skill = player?.transmissionSkill;
    if (!skill) {
        return false;
    }
    const gain = computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
        baseActionTicks: elapsedTicks,
        getExpToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    }).finalGain;
    return applyCraftSkillExpLocal(skill, gain, getExpToNextByLevel);
}

function applyCraftSkillExpLocal(skill, amount, getExpToNextByLevel) {
    if (!skill) {
        return false;
    }
    let changed = false;
    const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
    if (skill.expToNext !== resolvedExpToNext) {
        skill.expToNext = resolvedExpToNext;
        changed = true;
    }
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) {
        return changed;
    }
    skill.exp += gain;
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
        changed = true;
    }
    return changed || gain > 0;
}

function normalizeTechniqueTransmissionInterruptReason(reason) {
    return reason === 'move'
        || reason === 'attack'
        || reason === 'cancel'
        || reason === 'cultivate'
        || reason === 'defeat'
        ? reason
        : 'attack';
}

function createTransmissionCompatPipeline(playerRuntimeService) {
    const pipeline = new TechniqueActivityPipelineService();
    pipeline.register(new TransmissionStrategy());
    return {
        pipeline,
        ctx: {
            contentTemplateRepository: {
                ...playerRuntimeService.contentTemplateRepository,
                getItemName: typeof playerRuntimeService.contentTemplateRepository?.getItemName === 'function'
                    ? playerRuntimeService.contentTemplateRepository.getItemName.bind(playerRuntimeService.contentTemplateRepository)
                    : () => null,
                normalizeItem: typeof playerRuntimeService.contentTemplateRepository?.normalizeItem === 'function'
                    ? playerRuntimeService.contentTemplateRepository.normalizeItem.bind(playerRuntimeService.contentTemplateRepository)
                    : (item) => item,
                createTechniqueState: typeof playerRuntimeService.contentTemplateRepository?.createTechniqueState === 'function'
                    ? playerRuntimeService.contentTemplateRepository.createTechniqueState.bind(playerRuntimeService.contentTemplateRepository)
                    : () => null,
            },
            resolveExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(playerRuntimeService.playerProgressionService, level),
            getInstanceRuntime: () => null,
            deps: { playerRuntimeService },
        },
    };
}

function clonePendingTechniqueComprehensions(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.techId === 'string' && entry.techId.trim())
        .map((entry) => ({
            ...entry,
            selfComprehensionAllowed: entry.selfComprehensionAllowed !== false,
            activeTransferJob: null,
        }));
}

function resolvePendingSelfComprehensionAllowed(playerId, sourceKind, creatorPlayerId = null, existing = null) {
    if (sourceKind !== 'created') {
        return true;
    }
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    const normalizedCreatorId = typeof creatorPlayerId === 'string' ? creatorPlayerId.trim() : '';
    if (normalizedCreatorId) {
        return normalizedCreatorId === normalizedPlayerId;
    }
    const existingCreatorId = typeof existing?.creatorPlayerId === 'string' ? existing.creatorPlayerId.trim() : '';
    if (existingCreatorId) {
        return existingCreatorId === normalizedPlayerId;
    }
    return false;
}

function normalizeLegacyTransmissionJobFromPending(sourcePendingList, normalizedPendingList) {
    if (!Array.isArray(sourcePendingList)) {
        return null;
    }
    for (const source of sourcePendingList) {
        const transfer = source?.activeTransferJob;
        const techId = typeof source?.techId === 'string' && source.techId.trim() ? source.techId.trim() : '';
        if (!techId || !transfer || typeof transfer !== 'object') {
            continue;
        }
        const pending = Array.isArray(normalizedPendingList)
            ? normalizedPendingList.find((entry) => entry?.techId === techId)
            : null;
        const requiredProgress = Math.max(1, Math.floor(Number(pending?.requiredProgress ?? source.requiredProgress) || 1));
        const progress = Math.max(0, Number(pending?.progress ?? source.progress) || 0);
        const remaining = Math.max(0, Math.ceil(requiredProgress - Math.min(requiredProgress, progress)));
        const normalized = normalizeTransmissionJob({
            jobRunId: typeof transfer.jobId === 'string' && transfer.jobId.trim() ? transfer.jobId.trim() : undefined,
            jobType: 'transmission',
            jobVersion: 1,
            techniqueId: techId,
            techniqueName: pending?.name ?? source.name ?? techId,
            teacherPlayerId: transfer.teacherPlayerId,
            teacherName: transfer.teacherName,
            range: transfer.range ?? 2,
            realmLv: pending?.realmLv ?? source.realmLv ?? 1,
            grade: pending?.grade ?? source.grade,
            category: pending?.category ?? source.category,
            status: transfer.status,
            blockedReason: transfer.blockedReason,
            phase: Number(transfer.interruptWaitRemainingTicks ?? transfer.interruptState?.waitRemainingTicks ?? 0) > 0
                ? 'paused'
                : 'transmitting',
            startedAt: transfer.startedAtTick ?? 0,
            totalTicks: requiredProgress,
            remainingTicks: remaining,
            workTotalTicks: requiredProgress,
            workRemainingTicks: remaining,
            pausedTicks: transfer.interruptWaitRemainingTicks ?? transfer.interruptState?.waitRemainingTicks ?? 0,
            interruptWaitRemainingTicks: transfer.interruptWaitRemainingTicks,
            interruptState: transfer.interruptState ?? null,
            successRate: 1,
            spiritStoneCost: 0,
        });
        if (normalized && Number(normalized.remainingTicks) > 0) {
            return normalized;
        }
    }
    return null;
}
function isPlayerInTransmissionRange(teacher, learner) {
    if (!teacher || !learner || teacher.instanceId !== learner.instanceId) {
        return false;
    }
    const dx = Math.abs(Math.floor(Number(teacher.x) || 0) - Math.floor(Number(learner.x) || 0));
    const dy = Math.abs(Math.floor(Number(teacher.y) || 0) - Math.floor(Number(learner.y) || 0));
    return Math.max(dx, dy) <= 2;
}
/**
 * normalizeAlchemyPresets：规范化或转换炼丹Preset。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

function normalizeAlchemyPresets(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry?.presetId === 'string' && typeof entry?.recipeId === 'string')
        .map((entry) => ({
        presetId: String(entry.presetId),
        recipeId: String(entry.recipeId),
        name: typeof entry.name === 'string' ? entry.name : String(entry.recipeId),
        ingredients: Array.isArray(entry.ingredients)
            ? entry.ingredients
                .filter((ingredient) => typeof ingredient?.itemId === 'string')
                .map((ingredient) => ({
                itemId: String(ingredient.itemId),
                count: Math.max(1, Math.floor(Number(ingredient.count) || 1)),
            }))
            : [],
        updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0)),
    }));
}
/**
 * cloneAlchemyPreset：构建炼丹Preset。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

function cloneAlchemyPreset(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}
/**
 * normalizeGatherJob：规范化或转换采集 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新采集 Job 相关状态。
 */

function normalizeGatherJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.resourceNodeId !== 'string') {
        return null;
    }
    return {
        resourceNodeId: String(value.resourceNodeId),
        resourceNodeName: typeof value.resourceNodeName === 'string' ? value.resourceNodeName : String(value.resourceNodeId),
        phase: value.phase === 'paused' ? 'paused' : 'gathering',
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
    };
}
/**
 * normalizeBuildingJob：规范化或转换营造 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新营造 Job 相关状态。
 */

function normalizeBuildingJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.buildingId !== 'string') {
        return null;
    }
    return {
        buildingId: String(value.buildingId),
        buildingName: typeof value.buildingName === 'string' ? value.buildingName : String(value.buildingId),
        instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
        phase: value.phase === 'paused' ? 'paused' : 'building',
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
    };
}
/**
 * normalizeMiningJob：规范化或转换挖矿 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新挖矿 Job 相关状态。
 */

function normalizeMiningJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.miningNodeId !== 'string') {
        return null;
    }
    return {
        jobRunId: typeof value.jobRunId === 'string' ? value.jobRunId : undefined,
        jobType: 'mining',
        miningNodeId: String(value.miningNodeId),
        miningNodeName: typeof value.miningNodeName === 'string' ? value.miningNodeName : String(value.miningNodeId),
        instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
        targetX: Math.trunc(Number(value.targetX) || 0),
        targetY: Math.trunc(Number(value.targetY) || 0),
        tileType: typeof value.tileType === 'string' ? value.tileType : '',
        baseDamagePerTick: Math.max(1, Math.floor(Number(value.baseDamagePerTick) || 1)),
        phase: value.phase === 'paused' ? 'paused' : 'mining',
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        workTotalTicks: Math.max(1, Math.floor(Number(value.workTotalTicks ?? value.totalTicks) || 1)),
        workRemainingTicks: Math.max(0, Math.floor(Number(value.workRemainingTicks ?? value.remainingTicks) || 0)),
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks ?? value.pausedTicks) || 0)),
        interruptState: value.interruptState && typeof value.interruptState === 'object' ? { ...value.interruptState } : null,
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
        jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
    };
}
/**
 * normalizeFormationJob：规范化或转换阵法维护 Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新阵法维护 Job 相关状态。
 */

function normalizeFormationJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.formationInstanceId !== 'string') {
        return null;
    }
    return {
        jobRunId: typeof value.jobRunId === 'string' ? value.jobRunId : undefined,
        jobType: 'formation',
        formationInstanceId: String(value.formationInstanceId),
        formationName: typeof value.formationName === 'string' ? value.formationName : String(value.formationInstanceId),
        instanceId: typeof value.instanceId === 'string' ? value.instanceId : '',
        controlInstanceId: typeof value.controlInstanceId === 'string' ? value.controlInstanceId : (typeof value.instanceId === 'string' ? value.instanceId : ''),
        controlX: Math.trunc(Number(value.controlX) || 0),
        controlY: Math.trunc(Number(value.controlY) || 0),
        phase: value.phase === 'paused' ? 'paused' : 'maintaining',
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
        maintenanceRate: Math.max(1, Math.floor(Number(value.maintenanceRate) || 1)),
        jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
    };
}
/**
 * normalizeTransmissionJob：规范化传法 Job。
 * @param value 参数说明。
 * @returns 规范化后的传法 Job。
 */

function normalizeTransmissionJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.techniqueId !== 'string') {
        return null;
    }
    const techniqueId = String(value.techniqueId).trim();
    const teacherPlayerId = typeof value.teacherPlayerId === 'string' ? value.teacherPlayerId.trim() : '';
    if (!techniqueId || !teacherPlayerId) {
        return null;
    }
    const totalTicks = Math.max(1, Math.floor(Number(value.totalTicks ?? value.workTotalTicks) || 1));
    const remainingTicks = Math.max(0, Math.floor(Number(value.remainingTicks ?? value.workRemainingTicks) || 0));
    const workTotalTicks = Math.max(1, Math.floor(Number(value.workTotalTicks ?? totalTicks) || totalTicks));
    const workRemainingTicks = Math.max(0, Math.floor(Number(value.workRemainingTicks ?? remainingTicks) || remainingTicks));
    const rawJobType = typeof value.jobType === 'string' ? value.jobType.trim() : '';
    const jobType = rawJobType === 'scripture_recording' || rawJobType === 'scripture_contemplation'
        ? rawJobType
        : 'transmission';
    return {
        ...value,
        jobRunId: typeof value.jobRunId === 'string' && value.jobRunId.trim() ? value.jobRunId.trim() : undefined,
        jobType,
        jobVersion: Math.max(1, Math.floor(Number(value.jobVersion) || 1)),
        techniqueId,
        techniqueName: typeof value.techniqueName === 'string' && value.techniqueName.trim() ? value.techniqueName.trim() : techniqueId,
        teacherPlayerId,
        teacherName: typeof value.teacherName === 'string' && value.teacherName.trim() ? value.teacherName.trim() : undefined,
        range: Math.max(1, Math.floor(Number(value.range) || 2)),
        realmLv: Math.max(1, Math.floor(Number(value.realmLv) || 1)),
        status: value.status === 'blocked' ? 'blocked' : 'running',
        blockedReason: value.blockedReason === 'teacher_out_of_range' || value.blockedReason === 'not_created_technique'
            || value.blockedReason === 'scripture_platform_unavailable'
            || value.blockedReason === 'scripture_platform_out_of_range'
            || value.blockedReason === 'scripture_recording_locked'
            ? value.blockedReason
            : undefined,
        phase: value.phase === 'paused' ? 'paused' : 'transmitting',
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        totalTicks,
        remainingTicks,
        workTotalTicks,
        workRemainingTicks,
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        interruptWaitRemainingTicks: Math.max(0, Math.floor(Number(value.interruptWaitRemainingTicks ?? value.pausedTicks) || 0)),
        interruptState: value.interruptState && typeof value.interruptState === 'object' ? { ...value.interruptState } : null,
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 1)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
    };
}
/**
 * cloneGatherJob：构建采集 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新采集 Job 相关状态。
 */

function cloneGatherJob(entry) {
    return {
        ...entry,
    };
}
/**
 * cloneBuildingJob：构建营造 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新营造 Job 相关状态。
 */

function cloneBuildingJob(entry) {
    return {
        ...entry,
    };
}
/**
 * cloneMiningJob：构建挖矿 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新挖矿 Job 相关状态。
 */

function cloneMiningJob(entry) {
    return {
        ...entry,
        interruptState: entry?.interruptState && typeof entry.interruptState === 'object'
            ? { ...entry.interruptState }
            : entry?.interruptState ?? null,
    };
}
/**
 * cloneFormationJob：构建阵法维护 Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新阵法维护 Job 相关状态。
 */

function cloneFormationJob(entry) {
    return {
        ...entry,
    };
}

function cloneTransmissionJob(entry) {
    return {
        ...entry,
        interruptState: entry?.interruptState && typeof entry.interruptState === 'object'
            ? { ...entry.interruptState }
            : entry?.interruptState ?? null,
    };
}

function normalizeTechniqueActivityKind(value) {
    return value === 'forging'
        || value === 'enhancement'
        || value === 'gather'
        || value === 'building'
        || value === 'mining'
        || value === 'transmission'
        || value === 'formation'
        ? value
        : 'alchemy';
}

function normalizeTechniqueActivityQueueText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function cloneTechniqueActivityQueuePayload(value) {
    if (!value || typeof value !== 'object') {
        return value;
    }
    return structuredClone(value);
}

function normalizeTechniqueActivityQueue(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const queue = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const kind = normalizeTechniqueActivityKind(entry.kind);
        const createdAt = Math.max(1, Math.trunc(Number(entry.createdAt ?? Date.now()) || Date.now()));
        const queueId = normalizeTechniqueActivityQueueText(entry.queueId)
            || `technique-queue:${kind}:${createdAt}:${queue.length}`;
        const item = {
            queueId,
            kind,
            payload: cloneTechniqueActivityQueuePayload(entry.payload),
            label: normalizeTechniqueActivityQueueText(entry.label) || (kind === 'forging'
                ? '炼器任务'
                : kind === 'enhancement'
                    ? '强化任务'
                    : kind === 'gather'
                        ? '采集任务'
                        : kind === 'building'
                            ? '营造任务'
                            : kind === 'mining'
                                ? '挖矿任务'
                                : kind === 'formation'
                                    ? '阵法任务'
                                    : '炼丹任务'),
            state: entry.state === 'sleeping' ? 'sleeping' : 'pending',
            createdAt,
            cancelRef: {
                kind,
                queueId,
            },
            targetLabel: undefined,
            sleepReason: undefined,
            sleepingSince: undefined,
            retryAfterTicks: undefined,
        };
        const targetLabel = normalizeTechniqueActivityQueueText(entry.targetLabel);
        if (targetLabel) {
            item.targetLabel = targetLabel;
        }
        const sleepReason = normalizeTechniqueActivityQueueText(entry.sleepReason);
        if (sleepReason) {
            item.sleepReason = sleepReason;
        }
        if (Number.isFinite(Number(entry.sleepingSince))) {
            item.sleepingSince = Math.max(0, Math.trunc(Number(entry.sleepingSince)));
        }
        if (Number.isFinite(Number(entry.retryAfterTicks))) {
            item.retryAfterTicks = Math.max(0, Math.trunc(Number(entry.retryAfterTicks)));
        }
        queue.push(item);
    }
    return queue;
}

function cloneTechniqueActivityQueue(value) {
    return normalizeTechniqueActivityQueue(value);
}

function migrateLegacyCraftQueuedJobsToTechniqueActivityQueue(player) {
    if (!player || typeof player !== 'object') {
        return false;
    }
    const currentQueue = normalizeTechniqueActivityQueue(player.techniqueActivityQueue);
    const seen = new Set(currentQueue.map((entry) => entry.queueId));
    let changed = currentQueue.length !== (Array.isArray(player.techniqueActivityQueue) ? player.techniqueActivityQueue.length : 0);
    for (const job of [player.alchemyJob, player.forgingJob, player.enhancementJob]) {
        if (!job || typeof job !== 'object' || !Array.isArray(job.queuedJobs)) {
            continue;
        }
        const legacyQueue = normalizeTechniqueActivityQueue(job.queuedJobs);
        for (const item of legacyQueue) {
            if (currentQueue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
                break;
            }
            if (seen.has(item.queueId)) {
                continue;
            }
            currentQueue.push(item);
            seen.add(item.queueId);
            changed = true;
        }
        delete job.queuedJobs;
        changed = true;
    }
    if (changed) {
        player.techniqueActivityQueue = currentQueue.slice(0, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH);
    }
    return changed;
}

function repairInvalidEnhancementRecoveryState(player) {
    const job = player?.enhancementJob;
    if (!job || typeof job !== 'object') {
        return false;
    }
    const itemInstanceId = typeof job.itemInstanceId === 'string' && job.itemInstanceId.trim()
        ? job.itemInstanceId.trim()
        : '';
    const lockedItems = Array.isArray(player?.inventory?.lockedItems) ? player.inventory.lockedItems : [];
    const hasLockedItem = Boolean(itemInstanceId)
        && lockedItems.some((entry) => entry?.itemInstanceId === itemInstanceId);
    if (hasLockedItem) {
        return false;
    }
    const jobRunId = typeof job.jobRunId === 'string' && job.jobRunId.trim() ? job.jobRunId.trim() : '';
    const orphanLockedBy = jobRunId ? `enhancement:${jobRunId}` : '';
    if (orphanLockedBy) {
        player.inventory.lockedItems = lockedItems.filter((entry) => entry?.lockedBy !== orphanLockedBy);
    }
    const now = Date.now();
    const targetItemId = typeof job.targetItemId === 'string' && job.targetItemId.trim() ? job.targetItemId.trim() : '';
    const record = targetItemId
        ? (player.enhancementRecords ?? []).find((entry) => entry?.itemId === targetItemId)
        : null;
    if (record) {
        record.status = 'stopped';
        record.actionEndedAt = now;
        record.highestLevel = Math.max(
            Math.floor(Number(record.highestLevel) || 0),
            Math.floor(Number(job.currentLevel) || 0),
        );
    }
    else if (targetItemId) {
        if (!Array.isArray(player.enhancementRecords)) {
            player.enhancementRecords = [];
        }
        player.enhancementRecords.push({
            itemId: targetItemId,
            highestLevel: Math.max(0, Math.floor(Number(job.currentLevel) || 0)),
            levels: [],
            actionStartedAt: Number.isFinite(Number(job.startedAt)) ? Math.max(0, Math.trunc(Number(job.startedAt))) : undefined,
            actionEndedAt: now,
            startLevel: Math.max(0, Math.floor(Number(job.currentLevel) || 0)),
            initialTargetLevel: Math.max(1, Math.floor(Number(job.targetLevel) || 1)),
            desiredTargetLevel: Math.max(1, Math.floor(Number(job.desiredTargetLevel) || Number(job.targetLevel) || 1)),
            protectionStartLevel: job.protectionStartLevel,
            status: 'stopped',
        });
    }
    player.enhancementJob = null;
    markPlayerDirtyDomains(player, ['active_job', 'enhancement_record', 'inventory']);
    return true;
}
/**
 * normalizeAlchemyJob：规范化或转换炼丹Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼丹Job相关状态。
 */

function normalizeAlchemyJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.recipeId !== 'string') {
        return null;
    }
    return {
        ...value,
        jobType: value.jobType === 'forging' ? 'forging' : 'alchemy',
        recipeId: String(value.recipeId),
        outputItemId: typeof value.outputItemId === 'string' ? value.outputItemId : '',
        outputCount: Math.max(1, Math.floor(Number(value.outputCount) || 1)),
        quantity: Math.max(1, Math.floor(Number(value.quantity) || 1)),
        completedCount: Math.max(0, Math.floor(Number(value.completedCount) || 0)),
        successCount: Math.max(0, Math.floor(Number(value.successCount) || 0)),
        failureCount: Math.max(0, Math.floor(Number(value.failureCount) || 0)),
        ingredients: Array.isArray(value.ingredients)
            ? value.ingredients
                .filter((ingredient) => typeof ingredient?.itemId === 'string')
                .map((ingredient) => ({
                itemId: String(ingredient.itemId),
                count: Math.max(1, Math.floor(Number(ingredient.count) || 1)),
            }))
            : [],
        phase: value.phase === 'paused' ? value.phase : 'brewing',
        preparationTicks: 0,
        batchBrewTicks: Math.max(1, Math.floor(Number(value.batchBrewTicks) || 1)),
        currentBatchRemainingTicks: Math.max(0, Math.floor(Number(value.currentBatchRemainingTicks) || 0)),
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
        exactRecipe: value.exactRecipe === true,
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
    };
}
/**
 * cloneAlchemyJob：构建炼丹Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新炼丹Job相关状态。
 */

function cloneAlchemyJob(entry) {
    return {
        ...entry,
        ingredients: Array.isArray(entry.ingredients) ? entry.ingredients.map((ingredient) => ({ ...ingredient })) : [],
    };
}
/**
 * normalizeEnhancementJob：规范化或转换强化Job。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

function normalizeEnhancementJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || typeof value.targetItemId !== 'string') {
        return null;
    }
    return {
        ...value,
        target: value.target && typeof value.target === 'object' ? { ...value.target } : value.target,
        // 旧版兼容：若仍存在 value.item 字段，原样保留以便 hydrateFromSnapshot 完成迁移。
        // 新版 job 只通过 itemInstanceId 引用 inventory.lockedItems 中的物品。
        item: value.item && typeof value.item === 'object' ? { ...value.item } : value.item,
        itemInstanceId: typeof value.itemInstanceId === 'string' && value.itemInstanceId.length > 0
            ? value.itemInstanceId
            : undefined,
        targetItemId: String(value.targetItemId),
        targetItemName: typeof value.targetItemName === 'string' ? value.targetItemName : String(value.targetItemId),
        targetItemLevel: Math.max(1, Math.floor(Number(value.targetItemLevel) || 1)),
        currentLevel: Math.max(0, Math.floor(Number(value.currentLevel) || 0)),
        targetLevel: Math.max(1, Math.floor(Number(value.targetLevel) || 1)),
        desiredTargetLevel: Math.max(1, Math.floor(Number(value.desiredTargetLevel) || Number(value.targetLevel) || 1)),
        spiritStoneCost: Math.max(0, Math.floor(Number(value.spiritStoneCost) || 0)),
        materials: Array.isArray(value.materials) ? value.materials.map((entry) => ({ ...entry })) : [],
        protectionUsed: value.protectionUsed === true,
        protectionStartLevel: value.protectionStartLevel === undefined ? undefined : Math.max(2, Math.floor(Number(value.protectionStartLevel) || 2)),
        protectionItemId: typeof value.protectionItemId === 'string' ? value.protectionItemId : undefined,
        protectionItemName: typeof value.protectionItemName === 'string' ? value.protectionItemName : undefined,
        protectionItemSignature: typeof value.protectionItemSignature === 'string' ? value.protectionItemSignature : undefined,
        phase: value.phase === 'paused' ? 'paused' : 'enhancing',
        pausedTicks: Math.max(0, Math.floor(Number(value.pausedTicks) || 0)),
        successRate: Math.max(0, Math.min(1, Number(value.successRate) || 0)),
        totalTicks: Math.max(1, Math.floor(Number(value.totalTicks) || 1)),
        remainingTicks: Math.max(0, Math.floor(Number(value.remainingTicks) || 0)),
        startedAt: Math.max(0, Math.floor(Number(value.startedAt) || 0)),
        roleEnhancementLevel: Math.max(1, Math.floor(Number(value.roleEnhancementLevel) || 1)),
        totalSpeedRate: Number.isFinite(value.totalSpeedRate) ? Number(value.totalSpeedRate) : 0,
    };
}
/**
 * cloneEnhancementJob：构建强化Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target && typeof entry.target === 'object' ? { ...entry.target } : entry.target,
        // 旧版字段：仅在迁移期可能仍出现，clone 时透传不强构造
        item: entry.item && typeof entry.item === 'object' ? { ...entry.item } : entry.item,
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}
/**
 * normalizeEnhancementRecords：规范化或转换强化Record。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

function normalizeEnhancementRecords(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => typeof entry?.itemId === 'string')
        .map((entry) => ({
        ...entry,
        itemId: String(entry.itemId),
        highestLevel: Math.max(0, Math.floor(Number(entry.highestLevel) || 0)),
        levels: Array.isArray(entry.levels)
            ? entry.levels.map((level) => ({
                targetLevel: Math.max(1, Math.floor(Number(level?.targetLevel) || 1)),
                successCount: Math.max(0, Math.floor(Number(level?.successCount) || 0)),
                failureCount: Math.max(0, Math.floor(Number(level?.failureCount) || 0)),
            }))
            : [],
        actionStartedAt: entry.actionStartedAt === undefined ? undefined : Math.max(0, Math.floor(Number(entry.actionStartedAt) || 0)),
        actionEndedAt: entry.actionEndedAt === undefined ? undefined : Math.max(0, Math.floor(Number(entry.actionEndedAt) || 0)),
        startLevel: entry.startLevel === undefined ? undefined : Math.max(0, Math.floor(Number(entry.startLevel) || 0)),
        initialTargetLevel: entry.initialTargetLevel === undefined ? undefined : Math.max(1, Math.floor(Number(entry.initialTargetLevel) || 1)),
        desiredTargetLevel: entry.desiredTargetLevel === undefined ? undefined : Math.max(1, Math.floor(Number(entry.desiredTargetLevel) || 1)),
        protectionStartLevel: entry.protectionStartLevel === undefined ? undefined : Math.max(2, Math.floor(Number(entry.protectionStartLevel) || 2)),
        status: entry.status,
    }));
}
/**
 * cloneEnhancementRecord：构建强化Record。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

function cloneEnhancementRecord(entry) {
    return {
        ...entry,
        levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
    };
}
/**
 * normalizeRealmState：规范化或转换Realm状态。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

function normalizeRealmState(realm) {
    return realm ? cloneRealmState(realm) : createDefaultRealmState();
}
/**
 * normalizeHeavenGateState：规范化或转换HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function normalizeHeavenGateState(state) {
    return cloneHeavenGateState(state);
}
/**
 * normalizeHeavenGateRoots：规范化或转换HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function normalizeHeavenGateRoots(roots) {
    return cloneHeavenGateRoots(roots);
}
/**
 * normalizeCounter：规范化或转换Counter。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Counter相关状态。
 */

function normalizeCounter(value) {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}
/**
 * normalizeBoneAgeBaseYears：规范化或转换BoneAgeBaseYear。
 * @param value 参数说明。
 * @returns 无返回值，直接更新BoneAgeBaseYear相关状态。
 */

function normalizeBoneAgeBaseYears(value) {
    return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? DEFAULT_BONE_AGE_YEARS)) : DEFAULT_BONE_AGE_YEARS;
}
function advancePlayerChronology(player) {
    const previous = Number.isFinite(Number(player.lifeElapsedTicks))
        ? Math.max(0, Number(player.lifeElapsedTicks))
        : 0;
    const next = previous + 1;
    if (!Number.isFinite(next) || next <= previous) {
        return false;
    }
    player.lifeElapsedTicks = next;
    return true;
}
/**
 * normalizeLifeElapsedTicks：规范化或转换LifeElapsedtick。
 * @param value 参数说明。
 * @returns 无返回值，直接更新LifeElapsedtick相关状态。
 */

function normalizeLifeElapsedTicks(value) {
    return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function resolvePlayerRuntimeTick(player, fallbackTick = 0) {
    if (Number.isFinite(Number(player?.lifeElapsedTicks))) {
        return Math.max(0, Math.trunc(Number(player.lifeElapsedTicks) || 0));
    }
    return Math.max(0, Math.trunc(Number(fallbackTick) || 0));
}

function assertConsumableItemCooldownReady(player, item, currentTick) {
    const cooldownLeft = getConsumableItemCooldownRemainingTicks(player, item, currentTick);
    syncConsumableInventoryCooldownProjection(player, currentTick);
    if (cooldownLeft > 0) {
        throw new BadRequestException(`${item?.name ?? item?.itemId ?? '物品'}冷却中，还需 ${cooldownLeft} 息。`);
    }
}

function markConsumableItemCooldown(player, item, currentTick) {
    const cooldown = resolveConsumableItemCooldownTicks(item);
    const groups = resolveConsumableItemCooldownGroups(item);
    if (cooldown <= 0 || groups.length === 0) {
        syncConsumableInventoryCooldownProjection(player, currentTick);
        return;
    }
    const state = ensureConsumableCooldownState(player);
    const startedAtTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    for (const group of groups) {
        state[group] = startedAtTick;
    }
    syncConsumableInventoryCooldownProjection(player, startedAtTick);
}

function getConsumableItemCooldownRemainingTicks(player, item, currentTick) {
    const cooldown = resolveConsumableItemCooldownTicks(item);
    if (cooldown <= 0) {
        return 0;
    }
    const groups = resolveConsumableItemCooldownGroups(item);
    if (groups.length === 0) {
        return 0;
    }
    const state = getConsumableCooldownState(player);
    if (!state) {
        return 0;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    let maxRemaining = 0;
    for (const group of groups) {
        const startedAtTick = state[group];
        if (!Number.isFinite(Number(startedAtTick)) || Number(startedAtTick) < 0) {
            continue;
        }
        const elapsed = Math.max(0, normalizedCurrentTick - Math.max(0, Math.trunc(Number(startedAtTick) || 0)));
        const remaining = Math.max(0, cooldown - elapsed);
        if (remaining > 0) {
            maxRemaining = Math.max(maxRemaining, remaining);
            continue;
        }
        delete state[group];
    }
    return maxRemaining;
}

function syncConsumableInventoryCooldownProjection(player, currentTick) {
    const inventory = player?.inventory;
    if (!inventory) {
        return;
    }
    const state = getConsumableCooldownState(player);
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    inventory.serverTick = normalizedCurrentTick;
    if (!state) {
        inventory.cooldowns = [];
        return;
    }
    const cooldownsByItemId = new Map();
    for (const item of Array.isArray(inventory.items) ? inventory.items : []) {
        if (!item?.itemId || cooldownsByItemId.has(item.itemId)) {
            continue;
        }
        const cooldown = resolveConsumableItemCooldownTicks(item);
        const groups = resolveConsumableItemCooldownGroups(item);
        if (cooldown <= 0 || groups.length === 0) {
            continue;
        }
        let selectedStartedAtTick = null;
        let maxRemaining = 0;
        for (const group of groups) {
            const startedAtTick = state[group];
            if (!Number.isFinite(Number(startedAtTick)) || Number(startedAtTick) < 0) {
                continue;
            }
            const normalizedStartedAtTick = Math.max(0, Math.trunc(Number(startedAtTick) || 0));
            const remaining = Math.max(0, cooldown - Math.max(0, normalizedCurrentTick - normalizedStartedAtTick));
            if (remaining > maxRemaining) {
                maxRemaining = remaining;
                selectedStartedAtTick = normalizedStartedAtTick;
            }
            if (remaining <= 0) {
                delete state[group];
            }
        }
        if (maxRemaining > 0 && selectedStartedAtTick !== null) {
            cooldownsByItemId.set(item.itemId, {
                itemId: item.itemId,
                cooldown,
                startedAtTick: selectedStartedAtTick,
            });
        }
    }
    inventory.cooldowns = Array.from(cooldownsByItemId.values())
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
}

function resolveConsumableItemCooldownTicks(item) {
    if (!item) {
        return 0;
    }
    const hasCooldownEffect = hasConsumableRecoveryCooldownEffect(item);
    if (!hasCooldownEffect) {
        return 0;
    }
    if (Number.isFinite(Number(item.cooldown)) && Number(item.cooldown) > 0) {
        return Math.max(1, Math.trunc(Number(item.cooldown)));
    }
    return hasCooldownEffect ? DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS : 0;
}

function resolveConsumableItemCooldownGroups(item) {
    if (!item) {
        return [];
    }
    const groups = [];
    if (hasHpConsumableEffect(item)) {
        groups.push('hp');
    }
    if (hasQiConsumableEffect(item)) {
        groups.push('qi');
    }
    return groups;
}

function hasInstantConsumableEffect(item) {
    return hasHpConsumableEffect(item) || hasQiConsumableEffect(item);
}

function hasConsumableRecoveryCooldownEffect(item) {
    return hasInstantConsumableEffect(item);
}

function hasHpConsumableEffect(item) {
    return Math.max(0, Number(item?.healAmount ?? 0)) > 0
        || Math.max(0, Number(item?.healPercent ?? 0)) > 0
        || Math.max(0, Number(item?.baselineHealPercent ?? 0)) > 0;
}

function hasQiConsumableEffect(item) {
    return Math.max(0, Number(item?.baselineQiPercent ?? 0)) > 0
        || Math.max(0, Number(item?.qiPercent ?? 0)) > 0;
}

function getConsumableCooldownState(player) {
    const state = player?.inventory?.consumableCooldownStartedAtByGroup;
    return state && typeof state === 'object' ? state : null;
}

function ensureConsumableCooldownState(player) {
    if (!player.inventory.consumableCooldownStartedAtByGroup || typeof player.inventory.consumableCooldownStartedAtByGroup !== 'object') {
        player.inventory.consumableCooldownStartedAtByGroup = {};
    }
    return player.inventory.consumableCooldownStartedAtByGroup;
}
/**
* normalizeLifespanYears：规范化或转换LifespanYear。
* @param value 参数说明。
* @returns 无返回值，直接更新LifespanYear相关状态。
*/

function normalizeLifespanYears(value) {
    return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? 0)) : null;
}
/**
 * normalizePendingLogbookMessages：规范化或转换待处理LogbookMessage。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PendingLogbookMessage相关状态。
 */

function normalizePendingLogbookMessages(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }

    const normalized = [];

    const indexById = new Map();
    for (const entry of input) {
        const candidate = normalizePendingLogbookMessage(entry);
        if (!candidate) {
            continue;
        }
        if (isRetiredRedeemSuccessLogbookMessage(candidate)) {
            continue;
        }

        const existingIndex = indexById.get(candidate.id);
        if (existingIndex !== undefined) {
            normalized[existingIndex] = candidate;
            continue;
        }
        indexById.set(candidate.id, normalized.length);
        normalized.push(candidate);
    }
    return normalized.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
}
/**
 * normalizePendingLogbookMessage：规范化或转换待处理LogbookMessage。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PendingLogbookMessage相关状态。
 */

function normalizePendingLogbookMessage(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!input || typeof input !== 'object') {
        return null;
    }

    const id = typeof input.id === 'string' ? input.id.trim() : '';

    const text = typeof input.text === 'string' ? input.text.trim() : '';

    const kind = typeof input.kind === 'string' && PENDING_LOGBOOK_KINDS.has(input.kind)
        ? input.kind
        : 'grudge';
    if (!id || !text) {
        return null;
    }

    const at = Number.isFinite(input.at) ? Math.max(0, Math.trunc(input.at)) : Date.now();

    const from = typeof input.from === 'string' && input.from.trim().length > 0
        ? input.from.trim()
        : undefined;
    return {
        id,
        kind,
        text,
        from,
        at,
    };
}

function isRetiredRedeemSuccessLogbookMessage(entry) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
    return id.startsWith('redeem:') && text.startsWith('兑换成功：');
}
/**
 * isSamePendingLogbookMessages：判断Same待处理LogbookMessage是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SamePendingLogbookMessage的条件判断。
 */

function isSamePendingLogbookMessages(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const a = left[index];
        const b = right[index];
        if (a.id !== b.id
            || a.kind !== b.kind
            || a.text !== b.text
            || a.from !== b.from
            || a.at !== b.at) {
            return false;
        }
    }
    return true;
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clamp相关状态。
 */

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * compareInventoryItems：执行compare背包道具相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compare背包道具相关状态。
 */

function compareInventoryItems(left, right) {
    return left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')
        || (left.name ?? '').localeCompare(right.name ?? '', 'zh-Hans-CN')
        || right.count - left.count;
}
/**
 * consumeInventoryItemAt：执行consume背包道具At相关逻辑。
 * @param items 道具列表。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具At相关状态。
 */

/**
 * coalesceInventoryItems：就地合并同 (itemId, enhanceLevel) 签名的堆叠。
 *
 * 水合期调用一次：把之前因 canMergeItemStack 过于严格而被拆成多个 slot
 * 的同签名物品重新合到同一 slot（count 相加，后续 slot 被移除）。
 * 合并后保留首个遇到的 slot 的 itemInstanceId（现有堆叠胜出）。
 */
function coalesceInventoryItems(items: any[] | null | undefined): boolean {
    return coalesceItemStackList(items);
}

function repairDuplicateInventoryItemInstanceIds(items: any[]): boolean {
    if (!Array.isArray(items) || items.length <= 1) {
        return false;
    }
    const seen = new Set<string>();
    let repaired = false;
    for (const item of items) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const itemInstanceId = typeof item.itemInstanceId === 'string' ? item.itemInstanceId.trim() : '';
        if (!itemInstanceId || !seen.has(itemInstanceId)) {
            if (itemInstanceId) {
                seen.add(itemInstanceId);
            }
            continue;
        }
        item.itemInstanceId = randomUUID();
        seen.add(item.itemInstanceId);
        repaired = true;
    }
    return repaired;
}

function normalizeInventoryItemInstanceId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function findInventoryItemIndexByInstanceId(items: any[] | null | undefined, itemInstanceId: unknown): number {
    const normalized = normalizeInventoryItemInstanceId(itemInstanceId);
    if (!normalized || !Array.isArray(items)) {
        return -1;
    }
    return items.findIndex((item) =>
        item
        && typeof item === 'object'
        && normalizeInventoryItemInstanceId((item as { itemInstanceId?: unknown }).itemInstanceId) === normalized,
    );
}

function consumeInventoryItemAt(items, slotIndex, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const item = items[slotIndex];
    if (!item) {
        return;
    }
    if (item.count <= count) {
        items.splice(slotIndex, 1);
        return;
    }
    item.count -= count;
}

function takeSingleInventoryItemForEquipment(items, slotIndex) {
    const item = items[slotIndex];
    if (!item) {
        return null;
    }
    const itemCount = Math.max(1, Math.trunc(Number(item.count ?? 1)));
    if (itemCount <= 1) {
        // 堆叠仅 1 件：原 slot 整体移除，克隆继承原 itemInstanceId（不会发生 PK 冲突）
        const [removed] = items.splice(slotIndex, 1);
        return cloneItemWithCountPreservingTemplate(removed, 1);
    }
    item.count = itemCount - 1;
    const cloned = cloneItemWithCountPreservingTemplate(item, 1);
    // 从 count > 1 的堆叠里拆 1 件出来：被拆出的那件必须分配新 itemInstanceId，
    // 否则剩余堆叠（仍在背包）和被拆出的那件（即将进入装备槽 / 强化 / 挂单 / 掉落）
    // 会在 player_inventory_item / player_equipment_slot 等表上共用同一 PK。
    if (typeof (cloned as any).itemInstanceId === 'string' && (cloned as any).itemInstanceId.length > 0) {
        (cloned as { itemInstanceId?: string }).itemInstanceId = randomUUID();
    }
    return cloned;
}

function cloneItemWithCountPreservingTemplate(item, count) {
    if (!item || typeof item !== 'object') {
        return item;
    }
    const cloned = cloneItemOwnFieldsPreservingTemplate(item);
    defineClonedItemValue(cloned, 'count', count);
    return cloned;
}

function cloneItemPreservingTemplate(item) {
    if (!item || typeof item !== 'object') {
        return item;
    }
    return cloneItemOwnFieldsPreservingTemplate(item);
}

function cloneItemOwnFieldsPreservingTemplate(item) {
    const cloned = Object.create(Object.getPrototypeOf(item));
    for (const [key, value] of Object.entries(item)) {
        defineClonedItemValue(cloned, key, value);
    }
    return cloned;
}

function defineClonedItemValue(target, key, value) {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}
/**
 * toTechniqueUpdateEntry：处理to功法Update条目并更新相关状态。
 * @param technique 参数说明。
 * @returns 无返回值，直接更新to功法Update条目相关状态。
 */

function toTechniqueUpdateEntry(technique) {
    return {
        techId: technique.techId,
        level: technique.level,
        exp: technique.exp,
        expToNext: technique.expToNext,
        realmLv: technique.realmLv,
        realm: technique.realm ?? TechniqueRealm.Entry,

        skillsEnabled: technique.skillsEnabled !== false,
        name: technique.name,
        grade: technique.grade ?? null,
        category: technique.category ?? null,
        // skills/layers 直接引用模板，运行时只读共享，不在 update 投影里克隆。
        skills: technique.skills,
        layers: technique.layers ?? null,
    };
}
/**
 * buildActionEntries：构建并返回目标对象。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新Action条目相关状态。
 */

function buildActionEntries(player, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const actions = [];
    const previousById = new Map((player.actions.actions ?? []).map((entry) => [entry.id, entry]));
    let changed = false;

    const autoBattleSkills: any[] = normalizePlayerAutoBattleSkills(player, player.combat.autoBattleSkills);
    const autoBattleSkillById = new Map();
    for (let index = 0; index < autoBattleSkills.length; index += 1) {
        const entry = autoBattleSkills[index];
        autoBattleSkillById.set(entry.skillId, { entry, order: index });
    }
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
            if ((technique.level ?? 1) < unlockLevel) {
                continue;
            }

            const normalizedReadyTick = normalizeActionCooldownReadyTick(
                player,
                skill.id,
                currentTick,
                resolvePlayerSkillActionCooldownTicks(player, skill.cooldown),
            );
            const autoBattleSkill = autoBattleSkillById.get(skill.id);
            const nextAction = reuseActionEntry(previousById.get(skill.id), {
                id: skill.id,
                name: skill.name,
                type: 'skill',
                desc: skill.desc,
                cooldownLeft: Math.max(0, normalizedReadyTick - currentTick),
                cooldownReadyTick: normalizedReadyTick > currentTick ? normalizedReadyTick : undefined,
                range: skill.targeting?.range ?? skill.range,
                requiresTarget: resolveSkillRequiresTarget(skill),
                targetMode: skill.targetMode ?? 'entity',
                autoBattleEnabled: autoBattleSkill?.entry?.enabled ?? true,
                autoBattleOrder: autoBattleSkill?.order,
                skillEnabled: autoBattleSkill?.entry?.skillEnabled !== false,
            });
            if (nextAction.changed) {
                changed = true;
            }
            actions.push(nextAction.entry);
        }
    }
    const autoBattleSkillsChanged = !isSameAutoBattleSkillList(player.combat.autoBattleSkills, autoBattleSkills);
    player.combat.autoBattleSkills = autoBattleSkills;
    for (const entry of player.actions.contextActions) {
        const readyTick = normalizeActionCooldownReadyTick(
            player,
            entry.id,
            currentTick,
            resolveContextActionCooldownTicks(entry),
        );
        const nextAction = reuseActionEntry(previousById.get(entry.id), {
            ...entry,
            cooldownLeft: readyTick > 0 ? Math.max(0, readyTick - currentTick) : Math.max(0, Number(entry.cooldownLeft ?? 0)),
            cooldownReadyTick: readyTick > currentTick ? readyTick : undefined,
        });
        if (nextAction.changed) {
            changed = true;
        }
        actions.push(nextAction.entry);
    }
    actions.sort((left, right) => {
        const leftId = typeof left.id === 'string' ? left.id : '';
        const rightId = typeof right.id === 'string' ? right.id : '';
        return ((autoBattleSkillById.get(leftId)?.order ?? Number.MAX_SAFE_INTEGER) - (autoBattleSkillById.get(rightId)?.order ?? Number.MAX_SAFE_INTEGER))
            || leftId.localeCompare(rightId, 'zh-Hans-CN');
    });
    if (!isSameActionIdOrder(player.actions.actions, actions)) {
        changed = true;
    }
    return { actions, changed, autoBattleSkillsChanged };
}

function reuseActionEntry(previous, next) {
    if (previous && isSameActionEntry(previous, next)) {
        if (previous.cooldownLeft !== next.cooldownLeft) {
            return { entry: { ...previous, cooldownLeft: next.cooldownLeft }, changed: false };
        }
        return { entry: previous, changed: false };
    }
    return { entry: next, changed: true };
}

function resolvePlayerSkillActionCooldownTicks(player, cooldown) {
    const baseCooldown = Math.max(1, Math.round(Number(cooldown) || 1));
    const cooldownSpeed = Math.trunc(Number(player.attrs?.numericStats?.cooldownSpeed ?? 0));
    const cooldownDivisor = Math.max(1, Math.trunc(Number(player.attrs?.ratioDivisors?.cooldownSpeed ?? 100)));
    const cooldownRate = signedRatioValue(cooldownSpeed, cooldownDivisor);
    const cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100);
    return Math.max(1, Math.ceil(baseCooldown * cooldownMultiplier));
}

function resolveContextActionCooldownTicks(entry) {
    if (entry?.id === RETURN_TO_SPAWN_ACTION_ID) {
        return RETURN_TO_SPAWN_COOLDOWN_TICKS;
    }
    return null;
}

function normalizeActionCooldownReadyTick(player, actionId, currentTick, maxCooldownTicks) {
    const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
    if (!cooldowns || !actionId) {
        return 0;
    }
    const readyTick = Math.max(0, Math.trunc(Number(cooldowns[actionId] ?? 0)));
    if (readyTick <= 0) {
        return 0;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    const remainingTicks = readyTick - normalizedCurrentTick;
    const normalizedMax = Number.isFinite(Number(maxCooldownTicks))
        ? Math.max(1, Math.trunc(Number(maxCooldownTicks)))
        : null;
    if (normalizedCurrentTick <= 0) {
        // 偏好/内容重建可能还没有玩家 tick，只收敛面板显示，不清运行时真源。
        return normalizedMax !== null && readyTick > normalizedMax ? normalizedMax : readyTick;
    }
    if (remainingTicks <= 0 || (normalizedMax !== null && remainingTicks > normalizedMax)) {
        delete cooldowns[actionId];
        return 0;
    }
    return readyTick;
}
/**
 * isSameActionList：读取SameAction列表并返回结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，完成SameAction列表的条件判断。
 */

function isSameActionList(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (previous.length !== current.length) {
        return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
        const left = previous[index];
        const right = current[index];
        if (left.id !== right.id
            || left.name !== right.name
            || left.type !== right.type
            || left.desc !== right.desc
            || left.cooldownLeft !== right.cooldownLeft
            || left.range !== right.range
            || left.requiresTarget !== right.requiresTarget
            || left.targetMode !== right.targetMode
            || left.autoBattleEnabled !== right.autoBattleEnabled
            || left.autoBattleOrder !== right.autoBattleOrder
            || left.skillEnabled !== right.skillEnabled) {
            return false;
        }
    }
    return true;
}

function isSameActionIdOrder(previous, current) {
    if (previous.length !== current.length) {
        return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
        if (previous[index]?.id !== current[index]?.id) {
            return false;
        }
    }
    return true;
}

function isSameActionEntry(left, right) {
    return left.id === right.id
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.cooldownReadyTick === right.cooldownReadyTick
        && left.range === right.range
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && left.autoBattleEnabled === right.autoBattleEnabled
        && left.autoBattleOrder === right.autoBattleOrder
        && left.skillEnabled === right.skillEnabled;
}
/**
 * normalizePersistedAutoBattleSkills：判断PersistedAutoBattle技能是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PersistedAutoBattle技能相关状态。
 */

function normalizePersistedAutoBattleSkills(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }

    const normalized = input
        .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
        .map((entry) => ({
        skillId: entry.skillId.trim(),

        enabled: entry.enabled !== false,

        skillEnabled: entry.skillEnabled !== false,
        autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
    }));
    normalized.sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) || left.skillId.localeCompare(right.skillId, 'zh-Hans-CN'));
    return normalized;
}
/**
 * normalizeAutoBattleSkills：规范化或转换AutoBattle技能。
 * @param skillIds skill ID 集合。
 * @param input 输入参数。
 * @returns 无返回值，直接更新AutoBattle技能相关状态。
 */

function normalizeAutoBattleSkills(skillIds, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const availableIds = new Set(skillIds);

    const normalized = [];

    const seen = new Set();
    for (const entry of input ?? []) {
        const skillId = typeof entry.skillId === 'string' ? entry.skillId.trim() : '';
        if (!skillId || seen.has(skillId) || !availableIds.has(skillId)) {
            continue;
        }
        normalized.push({
            skillId,

            enabled: entry.enabled !== false,

            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: normalized.length,
        });
        seen.add(skillId);
    }
    for (const skillId of skillIds) {
        if (seen.has(skillId)) {
            continue;
        }
        normalized.push({
            skillId,
            enabled: true,
            skillEnabled: true,
            autoBattleOrder: normalized.length,
        });
    }
    return normalized;
}
/**
 * enforcePlayerSkillEnabledLimit：按玩家当前技能槽位上限规整技能启用状态。
 * @param player 玩家对象。
 * @param entries 技能配置列表。
 * @returns 返回已按槽位上限裁剪的技能配置列表。
 */

function enforcePlayerSkillEnabledLimit(player, entries) {
    return enforceSkillEnabledLimit(entries, resolvePlayerSkillSlotLimit(player));
}
/**
 * normalizePlayerAutoBattleSkills：按玩家当前可用技能与槽位上限规整自动战斗技能配置。
 * @param player 玩家对象。
 * @param input 原始技能配置列表。
 * @returns 返回已按技能可见性和槽位上限规整后的配置列表。
 */

function normalizePlayerAutoBattleSkills(player, input) {
    const skillIds = collectUnlockedSkillIds(player);
    const skillLimit = resolvePlayerSkillSlotLimit(player);
    if (isNormalizedAutoBattleSkillsForSkillIds(input, skillIds, skillLimit)) {
        return input;
    }
    return enforceSkillEnabledLimit(normalizeAutoBattleSkills(skillIds, input), skillLimit);
}
function isNormalizedAutoBattleSkillsForSkillIds(input, skillIds, skillLimit) {
    if (!Array.isArray(input) || input.length !== skillIds.length) {
        return false;
    }
    const normalizedLimit = Number.isFinite(skillLimit) ? Math.max(0, Math.floor(skillLimit)) : 0;
    let enabledCount = 0;
    for (let index = 0; index < input.length; index += 1) {
        const entry = input[index];
        const skillId = typeof entry?.skillId === 'string' ? entry.skillId.trim() : '';
        if (!skillId || entry.skillId !== skillId || entry.enabled !== (entry.enabled !== false) || entry.skillEnabled !== (entry.skillEnabled !== false)) {
            return false;
        }
        if (!skillIds.includes(skillId)) {
            return false;
        }
        for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
            if (input[previousIndex]?.skillId === skillId) {
                return false;
            }
        }
        if (entry.autoBattleOrder !== index) {
            return false;
        }
        if (entry.skillEnabled !== false) {
            enabledCount += 1;
            if (enabledCount > normalizedLimit) {
                return false;
            }
        }
    }
    return true;
}
/**
 * normalizePersistedAutoBattleTargetingMode：读取PersistedAutoBattleTargetingMode并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PersistedAutoBattleTargetingMode相关状态。
 */

function normalizePersistedAutoBattleTargetingMode(input) {

    const value = typeof input === 'string'
        ? input
        : (typeof input?.mode === 'string' ? input.mode : '');
    return ['auto', 'nearest', 'low_hp', 'full_hp', 'boss', 'player'].includes(value) ? value : 'auto';
}
/**
 * collectUnlockedSkillIds：执行Unlocked技能ID相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Unlocked技能ID相关状态。
 */

function collectUnlockedSkillIds(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const skillIds = [];
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
            if ((technique.level ?? 1) < unlockLevel) {
                continue;
            }
            skillIds.push(skill.id);
        }
    }
    return skillIds;
}

function syncTechniqueAutoBattleSkillCatalog(player, technique) {
    const skillIds = collectUnlockedSkillIds(player);
    const seen = new Set(skillIds);
    for (const skill of technique?.skills ?? []) {
        const skillId = typeof skill?.id === 'string' ? skill.id.trim() : '';
        if (!skillId || seen.has(skillId)) {
            continue;
        }
        skillIds.push(skillId);
        seen.add(skillId);
    }
    const normalized = enforceSkillEnabledLimit(
        normalizeAutoBattleSkills(skillIds, player.combat.autoBattleSkills),
        resolvePlayerSkillSlotLimit(player),
    );
    if (isSameAutoBattleSkillList(player.combat.autoBattleSkills, normalized)) {
        return false;
    }
    player.combat.autoBattleSkills = normalized;
    return true;
}
/**
 * syncTechniqueSkillAvailability：处理功法技能Availability并更新相关状态。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新功法技能Availability相关状态。
 */

function syncTechniqueSkillAvailability(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const skillEnabledMap = new Map(player.combat.autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));

    let changed = false;
    for (const technique of player.techniques.techniques) {
        const nextEnabled = resolveTechniqueSkillAvailability(technique, skillEnabledMap);
        if ((technique.skillsEnabled !== false) === nextEnabled) {
            continue;
        }
        technique.skillsEnabled = nextEnabled;
        changed = true;
    }
    return changed;
}
/**
 * resolveTechniqueSkillAvailability：规范化或转换功法技能Availability。
 * @param technique 参数说明。
 * @param skillEnabledMap 参数说明。
 * @returns 无返回值，直接更新功法技能Availability相关状态。
 */

function resolveTechniqueSkillAvailability(technique, skillEnabledMap) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let hasResolvedSkill = false;
    for (const skill of technique.skills ?? []) {
        const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
        if ((technique.level ?? 1) < unlockLevel) {
            continue;
        }
        if (!skillEnabledMap.has(skill.id)) {
            continue;
        }
        hasResolvedSkill = true;
        if (skillEnabledMap.get(skill.id) !== false) {
            return true;
        }
    }
    return hasResolvedSkill ? false : true;
}
/**
 * isSameAutoBattleSkillList：读取SameAutoBattle技能列表并返回结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，完成SameAutoBattle技能列表的条件判断。
 */

function isSameAutoBattleSkillList(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (previous.length !== current.length) {
        return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
        const left = previous[index];
        const right = current[index];
        if (left.skillId !== right.skillId
            || left.enabled !== right.enabled
            || (left.skillEnabled !== false) !== (right.skillEnabled !== false)
            || (left.autoBattleOrder ?? index) !== (right.autoBattleOrder ?? index)) {
            return false;
        }
    }
    return true;
}
/**
 * tickTemporaryBuffs：执行tickTemporaryBuff相关逻辑。
 * @param buffs 参数说明。
 * @returns 无返回值，直接更新tickTemporaryBuff相关状态。
 */

const TICK_TEMPORARY_BUFFS_UNCHANGED = Object.freeze({
    changed: false,
    durationChanged: false,
    attrChanged: false,
    listChanged: false,
    vitalsChanged: false,
    defeated: false,
});
const BUFF_TICK_EFFECTS_UNCHANGED = Object.freeze({ vitalsChanged: false });
const BUFF_SUSTAIN_COST_UNCHANGED = Object.freeze({ sustained: true, vitalsChanged: false });

function tickTemporaryBuffs(buffs, player = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(buffs) || buffs.length === 0) {
        return TICK_TEMPORARY_BUFFS_UNCHANGED;
    }
    let durationChanged = false;
    let attrChanged = false;
    let listChanged = false;
    let vitalsChanged = false;
    let defeated = false;
    let hasDependentBuff = false;
    let activeBuffIds = null;
    for (let index = 0; index < buffs.length; index += 1) {
        const entry = buffs[index];
        if (entry && entry.remainingTicks > 0 && entry.stacks > 0 && entry.expireWithBuffId) {
            hasDependentBuff = true;
            break;
        }
    }
    if (hasDependentBuff) {
        activeBuffIds = new Set();
        for (let index = 0; index < buffs.length; index += 1) {
            const entry = buffs[index];
            if (entry && entry.remainingTicks > 0 && entry.stacks > 0) {
                activeBuffIds.add(entry.buffId);
            }
        }
    }
    for (let index = 0; index < buffs.length; index += 1) {
        const buff = buffs[index];
        if (buff.remainingTicks <= 0) {
            continue;
        }
        if (activeBuffIds && buff.expireWithBuffId && !activeBuffIds.has(buff.expireWithBuffId)) {
            buff.remainingTicks = 0;
            attrChanged = true;
            listChanged = true;
            continue;
        }
        if (player && Array.isArray(buff.tickEffects) && buff.tickEffects.length > 0) {
            const tickEffectResult = applyBuffTickEffects(player, buff);
            if (tickEffectResult.vitalsChanged) {
                vitalsChanged = true;
                if (player.hp <= 0) {
                    defeated = true;
                }
            }
        }
        if (buff.infiniteDuration === true) {
            if (buff.sustainCost && player) {
                const sustainResult = applyBuffSustainCost(player, buff);
                vitalsChanged = vitalsChanged || sustainResult.vitalsChanged;
                if (!sustainResult.sustained) {
                    buff.remainingTicks = 0;
                    attrChanged = true;
                    listChanged = true;
                    continue;
                }
            }
            if (!Number.isInteger(buff.remainingTicks) || buff.remainingTicks < 1) {
                const nextRemainingTicks = Math.max(1, Math.round(Number(buff.remainingTicks) || 1));
                buff.remainingTicks = nextRemainingTicks;
                durationChanged = true;
            }
            continue;
        }
        buff.remainingTicks -= 1;
        durationChanged = true;
        if (buff.remainingTicks <= 0 && isDecayStackBuff(buff)) {
            if (buff.stacks > 1) {
                buff.stacks -= 1;
                buff.remainingTicks = Math.max(1, Math.round(buff.duration || 1));
                attrChanged = true;
            }
        }
        if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
            attrChanged = true;
            listChanged = true;
        }
    }

    if (hasDependentBuff && (attrChanged || listChanged)) {
        const finalActiveBuffIds = new Set();
        for (let index = 0; index < buffs.length; index += 1) {
            const entry = buffs[index];
            if (entry && entry.remainingTicks > 0 && entry.stacks > 0) {
                finalActiveBuffIds.add(entry.buffId);
            }
        }
        for (let index = 0; index < buffs.length; index += 1) {
            const buff = buffs[index];
            if (buff.remainingTicks > 0 && buff.expireWithBuffId && !finalActiveBuffIds.has(buff.expireWithBuffId)) {
                buff.remainingTicks = 0;
                attrChanged = true;
                listChanged = true;
            }
        }
    }
    if (listChanged) {
        let writeIndex = 0;
        for (let index = 0; index < buffs.length; index += 1) {
            const buff = buffs[index];
            if (buff.remainingTicks > 0 && buff.stacks > 0) {
                buffs[writeIndex] = buff;
                writeIndex += 1;
            }
        }
        buffs.length = writeIndex;
    }
    const changed = durationChanged || attrChanged || listChanged || vitalsChanged;
    if (!changed) {
        return TICK_TEMPORARY_BUFFS_UNCHANGED;
    }
    return { changed, durationChanged, attrChanged, listChanged, vitalsChanged, defeated };
}

function applyBuffTickEffects(player, buff) {
    if (!player || !buff || !Array.isArray(buff.tickEffects) || buff.tickEffects.length === 0) {
        return BUFF_TICK_EFFECTS_UNCHANGED;
    }
    let vitalsChanged = false;
    for (const effect of buff.tickEffects) {
        if (!effect || effect.type !== 'damage') {
            continue;
        }
        const resource = effect.resource ?? 'hp';
        if (resource !== 'hp') {
            continue;
        }
        const currentHp = Math.max(0, Math.round(Number(player.hp) || 0));
        if (currentHp <= 0) {
            continue;
        }
        const damage = resolveBuffTickDamage(player, buff, effect);
        if (damage <= 0) {
            continue;
        }
        const nextHp = Math.max(0, currentHp - damage);
        if (nextHp !== player.hp) {
            player.hp = nextHp;
            player.selfRevision += 1;
            vitalsChanged = true;
        }
    }
    return { vitalsChanged };
}

function resolveBuffTickDamage(player, buff, effect) {
    const basis = effect.basis === 'target.hp'
        ? Math.max(0, Math.round(Number(player.hp) || 0))
        : Math.max(1, Math.round(Number(player.maxHp) || 1));
    const ratio = Math.max(0, Number(effect.ratio) || 0);
    if (basis <= 0 || ratio <= 0) {
        return 0;
    }
    const stackFactor = effect.perStack === true
        ? Math.max(1, Math.round(Number(buff.stacks) || 1))
        : 1;
    const minimum = Number.isFinite(effect.min) ? Math.max(0, Math.round(Number(effect.min))) : 0;
    return Math.max(minimum, Math.round(basis * ratio * stackFactor));
}

function applyBuffSustainCost(player, buff) {
    const cost = resolveBuffSustainCost(buff);
    if (!cost) {
        return BUFF_SUSTAIN_COST_UNCHANGED;
    }
    const elapsed = Math.max(0, Math.floor(Number(buff.sustainTicksElapsed ?? 0) || 0));
    if (cost.resource === 'qi') {
        if (Math.max(0, Math.round(Number(player.qi) || 0)) < cost.amount) {
            return { sustained: false, vitalsChanged: false };
        }
        player.qi = Math.max(0, Math.round(Number(player.qi) || 0) - cost.amount);
    }
    else {
        if (Math.max(0, Math.round(Number(player.hp) || 0)) <= cost.amount) {
            return { sustained: false, vitalsChanged: false };
        }
        player.hp = Math.max(1, Math.round(Number(player.hp) || 0) - cost.amount);
    }
    player.selfRevision += 1;
    buff.sustainTicksElapsed = elapsed + 1;
    return { sustained: true, vitalsChanged: cost.amount > 0 };
}

function resolveBuffSustainCost(buff) {
    const sustainCost = buff?.sustainCost;
    if (!sustainCost || (sustainCost.resource !== 'hp' && sustainCost.resource !== 'qi')) {
        return null;
    }
    const baseCost = Math.max(0, Math.round(Number(sustainCost.baseCost) || 0));
    if (baseCost <= 0) {
        return null;
    }
    const elapsed = Math.max(0, Math.floor(Number(buff.sustainTicksElapsed ?? 0) || 0));
    const growthRate = Math.max(0, Number(sustainCost.growthRate) || 0);
    return {
        resource: sustainCost.resource,
        amount: Math.max(1, Math.round(baseCost * Math.pow(1 + growthRate, elapsed))),
    };
}
/**
 * recoverPlayerVitals：执行recover玩家Vital相关逻辑。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新recover玩家Vital相关状态。
 */

function recoverPlayerVitals(player, currentTick = -1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const suppressUntilTick = Number.isFinite(player.vitalRecoveryDeferredUntilTick)
        ? Math.trunc(player.vitalRecoveryDeferredUntilTick)
        : -1;
    if (suppressUntilTick >= 0) {
        player.vitalRecoveryDeferredUntilTick = -1;
    }
    if (suppressUntilTick >= Math.trunc(currentTick)) {
        return false;
    }
    if (player.hp <= 0) {
        return false;
    }

    let changed = false;
    if (player.hp < player.maxHp && player.attrs.numericStats.hpRegenRate > 0) {

        const heal = Math.max(1, Math.round(player.maxHp * (player.attrs.numericStats.hpRegenRate / 10000)));

        const nextHp = clamp(player.hp + heal, 0, player.maxHp);
        if (nextHp !== player.hp) {
            player.hp = nextHp;
            changed = true;
        }
    }
    if (player.qi < player.maxQi && player.attrs.numericStats.qiRegenRate > 0) {

        const recover = Math.max(1, Math.round(player.maxQi * (player.attrs.numericStats.qiRegenRate / 10000)));

        const nextQi = clamp(player.qi + recover, 0, player.maxQi);
        if (nextQi !== player.qi) {
            player.qi = nextQi;
            changed = true;
        }
    }
    return changed;
}
/**
 * hasActiveSkillCooldown：判断激活技能冷却是否满足条件。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，完成激活技能冷却的条件判断。
 */

function hasActiveSkillCooldown(player, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player.actions.actions.length === 0) {
        return false;
    }
    for (const readyTick of Object.values(player.combat.cooldownReadyTickBySkillId) as any[]) {
        if (readyTick > 0 && readyTick >= currentTick) {
            return true;
        }
    }
    return false;
}

function resolveCultivationAuraMultiplier(player, options) {
    const mapped = options?.cultivationAuraMultiplierByPlayerId instanceof Map
        ? options.cultivationAuraMultiplierByPlayerId.get(player.playerId)
        : undefined;
    if (mapped !== undefined) {
        return normalizeCultivationAuraMultiplier(mapped);
    }
    if (typeof options?.resolveCultivationAuraMultiplier === 'function') {
        return normalizeCultivationAuraMultiplier(options.resolveCultivationAuraMultiplier(player));
    }
    return 1;
}

function normalizeCultivationAuraMultiplier(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return 1;
    }
    return normalized;
}
/**
 * shouldResumeIdleCultivation：判断ResumeIdleCultivation是否满足条件。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @param blockedPlayerIds blockedPlayer ID 集合。
 * @returns 无返回值，完成ResumeIdleCultivation的条件判断。
 */

function shouldResumeIdleCultivation(player, currentTick, blockedPlayerIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player.hp <= 0
        || player.combat.cultivationActive
        || player.combat.autoIdleCultivation === false
        || hasAnyRemainingTechniqueJob(player)) {
        return false;
    }
    if (blockedPlayerIds?.has(player.playerId)) {
        return false;
    }
    return currentTick - player.combat.lastActiveTick >= AUTO_IDLE_CULTIVATION_DELAY_TICKS;
}

function hasDetachedRuntimeActivity(player) {
    if (!player) {
        return false;
    }
    const combat = player.combat ?? {};
    if (combat.cultivationActive === true || combat.autoRootFoundation === true) {
        return true;
    }
    if (combat.autoBattle === true) {
        return true;
    }
    if (hasRemainingTechniqueActivityQueue(player)) {
        return true;
    }
    return hasRemainingRuntimeJob(player.alchemyJob)
        || hasRemainingRuntimeJob(player.forgingJob)
        || hasRemainingRuntimeJob(player.enhancementJob)
        || hasRemainingRuntimeJob(player.transmissionJob)
        || hasRemainingRuntimeJob(player.gatherJob)
        || hasRemainingRuntimeJob(player.buildingJob)
        || hasRemainingRuntimeJob(player.miningJob)
        || hasRemainingRuntimeJob(player.formationJob);
}

function hasAnyRemainingTechniqueJob(player) {
    return hasRemainingRuntimeJob(player?.alchemyJob)
        || hasRemainingRuntimeJob(player?.forgingJob)
        || hasRemainingRuntimeJob(player?.enhancementJob)
        || hasRemainingRuntimeJob(player?.transmissionJob)
        || hasRemainingRuntimeJob(player?.gatherJob)
        || hasRemainingRuntimeJob(player?.buildingJob)
        || hasRemainingRuntimeJob(player?.miningJob)
        || hasRemainingRuntimeJob(player?.formationJob);
}

function hasRemainingRuntimeJob(job) {
    if (!job || typeof job !== 'object') {
        return false;
    }
    return Number(job.remainingTicks) > 0 || Number(job.workRemainingTicks) > 0 || hasLegacyQueuedRuntimeJobs(job);
}

function hasRemainingTechniqueActivityQueue(player) {
    return Array.isArray(player?.techniqueActivityQueue)
        && player.techniqueActivityQueue.some((entry) => entry && typeof entry === 'object');
}

function hasLegacyQueuedRuntimeJobs(job) {
    return Array.isArray(job?.queuedJobs)
        && job.queuedJobs.some((entry) => entry && typeof entry === 'object');
}

function buildPvPSoulInjuryBuffState(sourceRealmLv) {
    const realmLv = Math.max(1, Math.floor(sourceRealmLv));
    const cached = pvpSoulInjuryBuffByRealmLv.get(realmLv);
    if (cached) {
        return cached;
    }
    const buff = freezeRuntimeBuffTemplate({
        buffId: PVP_SOUL_INJURY_BUFF_ID,
        name: '神魂受损',
        desc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
        baseDesc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
        shortMark: '残',
        category: 'debuff',
        visibility: 'public',
        remainingTicks: PVP_SOUL_INJURY_DURATION_TICKS,
        duration: PVP_SOUL_INJURY_DURATION_TICKS,
        stacks: 1,
        maxStacks: 1,
        sourceSkillId: PVP_SOUL_INJURY_SOURCE_ID,
        sourceSkillName: '杀孽',
        realmLv,
        color: '#8a5a64',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
    });
    pvpSoulInjuryBuffByRealmLv.set(realmLv, buff);
    return buff;
}

function getPlayerRealmLevel(player) {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
}

function buildPvPShaInfusionBuffState(sourceRealmLv) {
    const realmLv = Math.max(1, Math.floor(sourceRealmLv));
    const cached = pvpShaInfusionBuffByRealmLv.get(realmLv);
    if (cached) {
        return cached;
    }
    const buff = freezeRuntimeBuffTemplate({
        buffId: PVP_SHA_INFUSION_BUFF_ID,
        name: '煞气入体',
        desc: `每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
        baseDesc: `每层攻击 +1%（最高 +${PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
        shortMark: '煞',
        category: 'buff',
        visibility: 'public',
        remainingTicks: PVP_SHA_INFUSION_DECAY_TICKS,
        duration: PVP_SHA_INFUSION_DECAY_TICKS,
        stacks: 1,
        maxStacks: 999999,
        sourceSkillId: PVP_SHA_INFUSION_SOURCE_ID,
        sourceSkillName: '杀孽',
        realmLv,
        color: '#7a2e2e',
        stats: freezeRuntimeBuffTemplate({
            physAtk: 1,
            spellAtk: 1,
            physDef: -2,
            spellDef: -2,
        }),
        statMode: 'percent',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
    });
    pvpShaInfusionBuffByRealmLv.set(realmLv, buff);
    return buff;
}

function buildPvPShaBacklashBuffState(sourceRealmLv, stacks) {
    const realmLv = Math.max(1, Math.floor(sourceRealmLv));
    let cached = pvpShaBacklashBuffByRealmLv.get(realmLv);
    if (!cached) {
        cached = freezeRuntimeBuffTemplate({
        buffId: PVP_SHA_BACKLASH_BUFF_ID,
        name: '煞气反噬',
        desc: `每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
        baseDesc: `每层攻击 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
        shortMark: '蚀',
        category: 'debuff',
        visibility: 'public',
        remainingTicks: PVP_SHA_BACKLASH_DECAY_TICKS,
        duration: PVP_SHA_BACKLASH_DECAY_TICKS,
        stacks: 1,
        maxStacks: 999999,
        sourceSkillId: PVP_SHA_BACKLASH_SOURCE_ID,
        sourceSkillName: '煞气反噬',
        realmLv,
        color: '#6d2626',
        stats: freezeRuntimeBuffTemplate({
            physAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            spellAtk: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            physDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            spellDef: -PVP_SHA_BACKLASH_PERCENT_PER_STACK,
        }),
        statMode: 'percent',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
        });
        pvpShaBacklashBuffByRealmLv.set(realmLv, cached);
    }
    return cached;
}

function freezeRuntimeBuffTemplate(entry) {
    return entry && process.env.NODE_ENV !== 'production' ? Object.freeze(entry) : entry;
}

function entityHasActiveBuff(buffs, buffId, minStacks = 1) {
    return buffs.some((buff) => buff.buffId === buffId
        && buff.remainingTicks > 0
        && Math.max(0, Math.round(buff.stacks ?? 0)) >= minStacks);
}

function getEntityBuffStacks(buffs, buffId) {
    const target = buffs.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0);
    return target ? Math.max(0, Math.round(target.stacks ?? 0)) : 0;
}

function isDecayStackBuff(buff) {
    return buff.buffId === PVP_SHA_INFUSION_BUFF_ID || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

function shouldKeepBuffOnRespawn(buff) {
    return buff.persistOnDeath === true
        || buff.category !== 'debuff'
        || buff.buffId === PVP_SOUL_INJURY_BUFF_ID
        || buff.buffId === PVP_SHA_INFUSION_BUFF_ID
        || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

function shouldKeepBuffOnReturnToSpawn(buff) {
    return buff.persistOnReturnToSpawn === true
        || buff.buffId === PVP_SHA_INFUSION_BUFF_ID
        || buff.buffId === PVP_SHA_BACKLASH_BUFF_ID;
}

function isSameBuffIdSequence(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index]?.buffId !== right[index]?.buffId || left[index]?.stacks !== right[index]?.stacks || left[index]?.remainingTicks !== right[index]?.remainingTicks) {
            return false;
        }
    }
    return true;
}
/**
 * toConsumableTemporaryBuff：执行toConsumableTemporaryBuff相关逻辑。
 * @param item 道具。
 * @param buff 参数说明。
 * @returns 无返回值，直接更新toConsumableTemporaryBuff相关状态。
 */

function toConsumableTemporaryBuff(item, buff, sourceRealmLv = 1) {
    const sourceSkillId = typeof buff.sourceSkillId === 'string' && buff.sourceSkillId.trim()
        ? buff.sourceSkillId.trim()
        : `item:${item.itemId}`;
    const duration = Math.max(1, Math.round(buff.duration));
    return {
        buffId: buff.buffId,
        name: buff.name,
        desc: buff.desc,
        shortMark: buff.shortMark ?? (buff.name.slice(0, 1) || '*'),
        category: buff.category ?? 'buff',
        visibility: buff.visibility ?? 'public',
        remainingTicks: buff.infiniteDuration === true ? 1 : duration + 1,
        duration,
        stacks: 1,
        maxStacks: Math.max(1, Math.round(buff.maxStacks ?? 1)),
        sourceSkillId,
        sourceSkillName: item.name ?? item.itemId,
        realmLv: Math.max(1, Math.floor(sourceRealmLv)),
        color: buff.color,
        attrs: buff.attrs ? { ...buff.attrs } : undefined,
        attrMode: buff.attrMode,
        stats: buff.stats
            ? { ...buff.stats }
            : (buff.valueStats
                ? (buff.statMode === 'flat' ? compileValueStatsToActualStats(buff.valueStats) : { ...buff.valueStats })
                : undefined),
        statMode: buff.statMode,
        qiProjection: buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined,
        presentationScale: Number.isFinite(buff.presentationScale) && Number(buff.presentationScale) > 0 ? Number(buff.presentationScale) : undefined,
        infiniteDuration: buff.infiniteDuration === true,
        sustainCost: buff.sustainCost ? { ...buff.sustainCost } : undefined,
        sustainTicksElapsed: buff.sustainCost ? 0 : undefined,
        expireWithBuffId: buff.expireWithBuffId,
        persistOnDeath: buff.persistOnDeath === true,
        persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
    };
}

function isConsumableBuffSource(buff) {
    const sourceSkillId = typeof buff?.sourceSkillId === 'string' ? buff.sourceSkillId : '';
    const buffId = typeof buff?.buffId === 'string' ? buff.buffId : '';
    return sourceSkillId.startsWith('item:') || sourceSkillId.startsWith('pill.') || buffId.startsWith('item_buff.');
}
/**
 * cloneRuntimeAttrState：构建运行态Attr状态。
 * @param source 来源对象。
 * @returns 无返回值，直接更新运行态Attr状态相关状态。
 */

function cloneRuntimeAttrState(source) {
    return {
        revision: source.revision,
        stage: source.stage,
        rawBaseAttrs: cloneAttributes(source.rawBaseAttrs ?? createDefaultBaseAttributes()),
        baseAttrs: cloneAttributes(source.baseAttrs),
        finalAttrs: cloneAttributes(source.finalAttrs),
        numericStats: cloneNumericStats(source.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(source.ratioDivisors),
    };
}
/**
 * cloneAttributes：构建Attribute。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Attribute相关状态。
 */

function cloneAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        strength: source.strength ?? source.comprehension ?? 0,
        meridians: source.meridians ?? source.luck ?? 0,
    };
}

function createDefaultBaseAttributes(): Record<string, number> {
    return {
        constitution: DEFAULT_BASE_ATTRS.constitution,
        spirit: DEFAULT_BASE_ATTRS.spirit,
        perception: DEFAULT_BASE_ATTRS.perception,
        talent: DEFAULT_BASE_ATTRS.talent,
        strength: DEFAULT_BASE_ATTRS.strength,
        meridians: DEFAULT_BASE_ATTRS.meridians,
    };
}

function normalizeRawBaseAttributes(source) {
    const attrs = createDefaultBaseAttributes();
    if (!source || typeof source !== 'object') {
        return attrs;
    }
    for (const key of ATTR_KEYS) {
        const value = Number(source[key]);
        if (Number.isFinite(value)) {
            attrs[key] = Math.max(0, Math.trunc(value));
        }
    }
    const legacyStrength = Number(source.comprehension);
    if (!Number.isFinite(Number(source.strength)) && Number.isFinite(legacyStrength)) {
        attrs.strength = Math.max(0, Math.trunc(legacyStrength));
    }
    const legacyMeridians = Number(source.luck);
    if (!Number.isFinite(Number(source.meridians)) && Number.isFinite(legacyMeridians)) {
        attrs.meridians = Math.max(0, Math.trunc(legacyMeridians));
    }
    return attrs;
}

function encodePersistedRawBaseAttrs(source) {
    return {
        ...normalizeRawBaseAttributes(source),
        [RAW_BASE_ATTRS_PERSISTENCE_MARKER]: true,
    };
}

function decodePersistedRawBaseAttrs(source) {
    if (!source || typeof source !== 'object' || source[RAW_BASE_ATTRS_PERSISTENCE_MARKER] !== true) {
        return createDefaultBaseAttributes();
    }
    return normalizeRawBaseAttributes(source);
}
/**
 * cloneNumericStats：构建NumericStat。
 * @param source 来源对象。
 * @returns 无返回值，直接更新NumericStat相关状态。
 */

function cloneNumericStats(source) {
    return {
        maxHp: source.maxHp,
        maxQi: source.maxQi,
        physAtk: source.physAtk,
        spellAtk: source.spellAtk,
        physDef: source.physDef,
        spellDef: source.spellDef,
        hit: source.hit,
        dodge: source.dodge,
        crit: source.crit,
        antiCrit: source.antiCrit,
        critDamage: source.critDamage,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        maxQiOutputPerTick: source.maxQiOutputPerTick,
        qiRegenRate: source.qiRegenRate,
        hpRegenRate: source.hpRegenRate,
        cooldownSpeed: source.cooldownSpeed,
        auraCostReduce: source.auraCostReduce,
        auraPowerRate: source.auraPowerRate,
        playerExpRate: source.playerExpRate,
        techniqueExpRate: source.techniqueExpRate,
        realmExpPerTick: source.realmExpPerTick,
        techniqueExpPerTick: source.techniqueExpPerTick,
        lootRate: source.lootRate,
        rareLootRate: source.rareLootRate,
        viewRange: source.viewRange,
        moveSpeed: source.moveSpeed,
        extraAggroRate: source.extraAggroRate,
        extraRange: source.extraRange ?? 0,
        extraArea: source.extraArea ?? 0,
        actionsPerTurn: source.actionsPerTurn ?? 1,
        elementDamageBonus: {
            metal: source.elementDamageBonus.metal,
            wood: source.elementDamageBonus.wood,
            water: source.elementDamageBonus.water,
            fire: source.elementDamageBonus.fire,
            earth: source.elementDamageBonus.earth,
        },
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
/**
 * cloneNumericRatioDivisors：判断NumericRatioDivisor是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，直接更新NumericRatioDivisor相关状态。
 */

function cloneNumericRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
/**
 * cloneRuntimeBonus：构建运行态Bonu。
 * @param source 来源对象。
 * @returns 无返回值，直接更新运行态Bonu相关状态。
 */

function cloneRuntimeBonus(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!source || typeof source !== 'object') {
        return null;
    }
    return {

        source: canonicalizeRuntimeBonusSource(typeof source.source === 'string' ? source.source : ''),

        label: typeof source.label === 'string' ? source.label : undefined,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: Array.isArray(source.qiProjection) ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,

        meta: source.meta && typeof source.meta === 'object' ? { ...source.meta } : undefined,
    };
}

function cloneRuntimeBonusesForSnapshot(source) {
    if (!Array.isArray(source) || source.length === 0) {
        return [];
    }
    const bonuses = [];
    for (const entry of source) {
        if (!shouldKeepRuntimeBonusSource(entry)) {
            continue;
        }
        const cloned = cloneRuntimeBonus(entry);
        if (cloned) {
            bonuses.push(cloned);
        }
    }
    return bonuses;
}

function shouldKeepRuntimeBonusSource(entry) {
    return Boolean(entry && typeof entry === 'object' && shouldKeepRuntimeBonusSourceId(entry.source));
}

function shouldKeepRuntimeBonus(entry) {
    return Boolean(entry?.source && shouldKeepRuntimeBonusSourceId(entry.source));
}

function shouldKeepRuntimeBonusSourceId(source) {
    return typeof source === 'string' && source.trim().length > 0 && !isDerivedPersistentRuntimeBonusSource(canonicalizeRuntimeBonusSource(source));
}

function isDerivedPersistentRuntimeBonusSource(source) {
    const normalized = typeof source === 'string' ? source.trim() : '';
    return normalized === 'runtime:realm_stage'
        || normalized === 'runtime:realm_state'
        || normalized === 'runtime:heaven_gate_roots'
        || normalized === 'runtime:technique_aggregate'
        || normalized === 'technique:aggregate'
        || normalized === 'realm:state'
        || normalized === 'realm:stage'
        || normalized === 'heaven_gate:roots'
        || normalized.startsWith('technique:')
        || normalized.startsWith('equipment:')
        || normalized.startsWith('equip:')
        || normalized.startsWith('equip-effect:')
        || normalized.startsWith('body_training:')
        || normalized.startsWith('buff:');
}
/**
 * ensureVitalBaselineBonus：执行ensureVitalBaselineBonu相关逻辑。
 * @param player 玩家对象。
 * @param vitals 参数说明。
 * @returns 无返回值，直接更新ensureVitalBaselineBonu相关状态。
 */

function ensureVitalBaselineBonus(player, vitals) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!vitals || !Array.isArray(player.runtimeBonuses)) {
        return false;
    }

    const baselineHp = Number.isFinite(vitals.maxHp) ? Math.max(1, Math.round(vitals.maxHp)) : 0;

    const baselineQi = Number.isFinite(vitals.maxQi) ? Math.max(0, Math.round(vitals.maxQi)) : 0;

    const currentMaxHp = Math.max(1, Math.round(player.maxHp));

    const currentMaxQi = Math.max(0, Math.round(player.maxQi));

    const hpDelta = Math.max(0, baselineHp - currentMaxHp);

    const qiDelta = Math.max(0, baselineQi - currentMaxQi);

    const hpRatio = currentMaxHp > 0 ? baselineHp / currentMaxHp : 1;

    const qiRatio = currentMaxQi > 0 ? baselineQi / currentMaxQi : 1;

    const nextBonuses = player.runtimeBonuses.filter((entry) => entry?.source !== VITAL_BASELINE_BONUS_SOURCE);
    if (hpDelta <= 0 && qiDelta <= 0) {
        if (nextBonuses.length === player.runtimeBonuses.length) {
            return false;
        }
        player.runtimeBonuses = nextBonuses;
        return true;
    }

    const stats: Record<string, number> = {};
    if (hpDelta > 0) {
        stats.maxHp = hpDelta;
        if (player.attrs.numericStats.hpRegenRate > 0 && hpRatio > 1) {
            stats.hpRegenRate = Math.max(0, Math.round(player.attrs.numericStats.hpRegenRate * (hpRatio - 1)));
        }
    }
    if (qiDelta > 0) {
        stats.maxQi = qiDelta;
        if (player.attrs.numericStats.qiRegenRate > 0 && qiRatio > 1) {
            stats.qiRegenRate = Math.max(0, Math.round(player.attrs.numericStats.qiRegenRate * (qiRatio - 1)));
        }
        if (player.attrs.numericStats.maxQiOutputPerTick > 0 && qiRatio > 1) {
            stats.maxQiOutputPerTick = Math.max(0, Math.round(player.attrs.numericStats.maxQiOutputPerTick * (qiRatio - 1)));
        }
    }
    nextBonuses.push({
        source: VITAL_BASELINE_BONUS_SOURCE,
        label: '生命灵力基线补正',
        stats,
        meta: {
            baselineHp,
            baselineQi,
        },
    });
    player.runtimeBonuses = nextBonuses;
    return true;
}
/**
 * canonicalizeRuntimeBonusSource：判断canonicalize运行态Bonu来源是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，完成canonicalize运行态Bonu来源的条件判断。
 */

function canonicalizeRuntimeBonusSource(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'technique:aggregate') {
        return 'runtime:technique_aggregate';
    }
    if (normalized === 'realm:state') {
        return 'runtime:realm_state';
    }
    if (normalized === 'realm:stage') {
        return 'runtime:realm_stage';
    }
    if (normalized === 'heaven_gate:roots') {
        return 'runtime:heaven_gate_roots';
    }
    if (normalized.startsWith('equip:')) {
        return `equipment:${normalized.slice('equip:'.length)}`;
    }
    return normalized;
}

function recordPlayerTickPerf(options, key, startedAt, count = 1) {
    const recorder = options?.recordTickSectionDuration;
    if (typeof recorder !== 'function') {
        return;
    }
    recorder(key, performance.now() - startedAt, count);
}

function normalizeEquipmentSlotsWithTemplates(slots, contentTemplateRepository) {
    const slotItems = new Map(EQUIP_SLOTS.map((slot) => [slot, null]));
    if (Array.isArray(slots)) {
        for (const entry of slots) {
            const sourceSlot = typeof entry?.slot === 'string' ? entry.slot.trim() : '';
            if (!EQUIP_SLOTS.includes(sourceSlot)) {
                continue;
            }
            if (!entry?.item) {
                continue;
            }
            const item = contentTemplateRepository.normalizeItem(entry.item);
            const targetSlot = typeof item?.equipSlot === 'string' && EQUIP_SLOTS.includes(item.equipSlot)
                ? item.equipSlot
                : sourceSlot;
            if (!slotItems.get(targetSlot)) {
                slotItems.set(targetSlot, item);
                continue;
            }
            if (!slotItems.get(sourceSlot)) {
                slotItems.set(sourceSlot, item);
            }
        }
    }
    return EQUIP_SLOTS.map((slot) => ({
        slot,
        item: slotItems.get(slot) ?? null,
    }));
}
