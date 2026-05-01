// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerRuntimeService = void 0;

const common_1 = require("@nestjs/common");
const crypto_1 = require("node:crypto");

const shared_1 = require("@mud/shared");

const next_gm_constants_1 = require("../../http/native/native-gm.constants");
const pvp_1 = require("../../constants/gameplay/pvp");

const content_template_repository_1 = require("../../content/content-template.repository");
const player_domain_persistence_service_1 = require("../../persistence/player-domain-persistence.service");

const map_template_repository_1 = require("../map/map-template.repository");

const player_attributes_service_1 = require("./player-attributes.service");

const player_progression_service_1 = require("./player-progression.service");
const player_combat_config_helpers_1 = require("./player-combat-config.helpers");
const player_runtime_state_1 = require("./player-runtime.state");

/** 新角色默认出生地图。 */
const DEFAULT_PLAYER_STARTER_MAP_ID = 'yunlai_town';

/** 等待写入 logbook 的消息上限，避免队列无限膨胀。 */
const MAX_PENDING_LOGBOOK_MESSAGES = 200;
/** 玩家跨节点转移超时时间，超时后自动回滚 transfer 态。 */
const PLAYER_TRANSFER_TIMEOUT_MS = 120_000;

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
let PlayerRuntimeService = class PlayerRuntimeService {
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
    /** 玩家在线态 store，集中托管运行时拥有的热状态。 */
    runtimeState = (0, player_runtime_state_1.createPlayerRuntimeStateStore)();
    /** 在线玩家运行时实例，按 playerId 直接索引。 */
    players = this.runtimeState.players;
    /** 断线重连或死亡切换时，暂存的战斗副作用。 */
    pendingCombatEffectsByPlayerId = this.runtimeState.pendingCombatEffectsByPlayerId;
    /** 注入基础仓库与成长/属性结算器，供玩家在线态统一管理。 */
    constructor(contentTemplateRepository, mapTemplateRepository, playerAttributesService, playerProgressionService, playerDomainPersistenceService = undefined) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerAttributesService = playerAttributesService;
        this.playerProgressionService = playerProgressionService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
    }
    /** 读取或创建玩家在线态快照，首次连接时从持久化状态回填。 */
    async loadOrCreatePlayer(playerId, sessionId, loader, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const existing = this.players.get(playerId);
        if (existing) {
            if (options?.forceRebind === true) {
                this.bindRuntimeSession(existing, sessionId);
            } else {
                this.refreshRuntimeSession(existing, sessionId);
            }
            this.pendingCombatEffectsByPlayerId.delete(playerId);
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
                throw new common_1.ServiceUnavailableException(`player_domain_snapshot_builder_required:${playerId}`);
            }
            snapshot = await this.playerDomainPersistenceService.loadProjectedSnapshot(playerId, buildStarterSnapshot);
            if (typeof options?.onSnapshotLoaded === 'function') {
                options.onSnapshotLoaded(snapshot);
            }
            if (!snapshot) {
                throw new common_1.ServiceUnavailableException(`player_domain_snapshot_required:${playerId}`);
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
            if (options?.forceRebind === true) {
                this.bindRuntimeSession(lateExisting, sessionId);
            } else {
                this.refreshRuntimeSession(lateExisting, sessionId);
            }
            this.pendingCombatEffectsByPlayerId.delete(playerId);
            return lateExisting;
        }

        const player = snapshot
            ? this.hydrateFromSnapshot(playerId, sessionId, snapshot)
            : this.createFreshPlayer(playerId, sessionId);
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
        this.pendingCombatEffectsByPlayerId.delete(playerId);
        return player;
    }
    /** 创建新玩家的初始运行时状态，包含装备、动作、修炼与通知容器。 */
    createFreshPlayer(playerId, sessionId) {

        const starterInventory = this.contentTemplateRepository.createStarterInventory();

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
            respawnTemplateId: '',
            respawnInstanceId: null,
            respawnX: 0,
            respawnY: 0,
            worldPreference: {
                linePreset: 'peaceful',
            },
            x: 0,
            y: 0,
            facing: shared_1.Direction.South,
            hp: 100,
            maxHp: 100,
            qi: 0,
            maxQi: 100,
            foundation: 0,
            rootFoundation: 0,
            combatExp: 0,
            comprehension: 0,
            luck: 0,
            bodyTraining: (0, shared_1.normalizeBodyTrainingState)(),
            boneAgeBaseYears: shared_1.DEFAULT_BONE_AGE_YEARS,
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
                combatTargetId: null,
                combatTargetLocked: false,
                manualEngagePending: false,
                allowAoePlayerHit: false,
                autoIdleCultivation: true,
                autoSwitchCultivation: false,
                senseQiActive: false,
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
            alchemySkill: createCraftSkillState(),
            gatherSkill: createCraftSkillState(),
            gatherJob: null,
            alchemyPresets: [],
            alchemyJob: null,
            enhancementSkill: createCraftSkillState(),
            enhancementSkillLevel: 1,
            enhancementJob: null,
            enhancementRecords: [],
            lootWindowTarget: null,
            pendingLogbookMessages: [],
            vitalRecoveryDeferredUntilTick: -1,
            runtimeBonuses: [],
            dirtyDomains: createPlayerDirtyDomainSet(),
        };
        this.playerProgressionService.initializePlayer(player);
        this.rebuildActionState(player, 0);
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


        const player = this.players.get(playerId);
        if (player) {
            player.sessionId = null;
            if (!Number.isFinite(player.offlineSinceAt)) {
                player.offlineSinceAt = Date.now();
            }
            markPlayerDirtyDomains(player, [PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]);
        }
    }
    /** 从运行时中移除玩家，通常用于注销或彻底清理。 */
    removePlayerRuntime(playerId) {
        this.players.delete(playerId);
        this.pendingCombatEffectsByPlayerId.delete(playerId);
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
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return player;
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
            inWorld: online && typeof player.templateId === 'string' && player.templateId.trim().length > 0,
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
        const nextItems = Array.isArray(items)
            ? items.map((entry) => this.contentTemplateRepository.normalizeItem(entry))
            : [];
        player.inventory.items = nextItems;
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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
        const slotMap = new Map(Array.isArray(slots)
            ? slots.filter((entry) => typeof entry?.slot === 'string' && entry.slot.trim()).map((entry) => [
                entry.slot.trim(),
                entry,
            ])
            : []);
        player.equipment.slots = shared_1.EQUIP_SLOTS.map((slot) => {
            const entry = slotMap.get(slot) ?? null;
            return {
                slot,
                item: entry?.item ? this.contentTemplateRepository.normalizeItem(entry.item) : null,
            };
        });
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

        const result = this.playerProgressionService.gainRealmProgress(player, amount, options);
        return this.applyProgressionResult(player, result);
    }
    /**
 * gainFoundation：执行gainFoundation相关逻辑。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新gainFoundation相关状态。
 */

    gainFoundation(playerId, amount) {

        const player = this.getPlayerOrThrow(playerId);

        const result = this.playerProgressionService.gainFoundation(player, amount);
        return this.applyProgressionResult(player, result);
    }
    /**
 * gainCombatExp：执行gain战斗Exp相关逻辑。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新gain战斗Exp相关状态。
 */

    gainCombatExp(playerId, amount) {

        const player = this.getPlayerOrThrow(playerId);

        const result = this.playerProgressionService.gainCombatExp(player, amount);
        return this.applyProgressionResult(player, result);
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

        const result = this.playerProgressionService.advanceProgressionTick(player, elapsedTicks, options);
        return this.applyProgressionResult(player, result);
    }
    /**
 * advanceCultivation：执行advanceCultivation相关逻辑。
 * @param playerId 玩家 ID。
 * @param elapsedTicks 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新advanceCultivation相关状态。
 */

    advanceCultivation(playerId, elapsedTicks = 1, currentTick = 0, options = {}) {

        const player = this.getPlayerOrThrow(playerId);

        const result = this.playerProgressionService.advanceCultivation(player, elapsedTicks, {
            auraMultiplier: normalizeCultivationAuraMultiplier(options?.auraMultiplier),
        });
        return this.applyProgressionResult(player, result, currentTick);
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

        const result = this.playerProgressionService.grantMonsterKillProgress(player, input);
        return this.applyProgressionResult(player, result, currentTick);
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

        const result = this.playerProgressionService.handleHeavenGateAction(player, action, element);
        return this.applyProgressionResult(player, result, currentTick, true);
    }
    /**
 * attemptBreakthrough：执行attemptBreakthrough相关逻辑。
 * @param playerId 玩家 ID。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新attemptBreakthrough相关状态。
 */

    attemptBreakthrough(playerId, currentTick = 0) {

        const player = this.getPlayerOrThrow(playerId);

        const result = this.playerProgressionService.attemptBreakthrough(player);
        return this.applyProgressionResult(player, result, currentTick, true);
    }
    /** 凝练根基。 */
    refineRootFoundation(playerId, currentTick = 0) {
        const player = this.getPlayerOrThrow(playerId);
        const result = this.playerProgressionService.refineRootFoundation(player);
        return this.applyProgressionResult(player, result, currentTick, true);
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

        let changed = false;
        if (player.instanceId !== view.instance.instanceId) {
            player.instanceId = view.instance.instanceId;
            changed = true;
        }
        if (player.templateId !== view.instance.templateId) {
            player.templateId = view.instance.templateId;
            changed = true;
        }
        if (player.x !== view.self.x) {
            player.x = view.self.x;
            changed = true;
        }
        if (player.y !== view.self.y) {
            player.y = view.self.y;
            changed = true;
        }
        if (player.facing !== view.self.facing) {
            player.facing = view.self.facing;
            changed = true;
        }
        if (changed) {
            markPlayerDirtyDomains(player, ['world_anchor', 'position_checkpoint']);
            this.bumpPersistentRevision(player);
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
            .map((entry) => ({ ...entry }))
            .sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
        if (isSameActionList(player.actions.contextActions, normalized)) {
            return player;
        }
        player.actions.contextActions = normalized;
        this.rebuildActionState(player, currentTick);
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
        const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
        const item = this.contentTemplateRepository.createItem(normalizedItemId, count);
        if (!item) {
            throw new common_1.NotFoundException(`Item ${normalizedItemId} not found`);
        }

        const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
        }
        else {
            player.inventory.items.push(item);
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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
        const normalizedWalletType = normalizeWalletType(walletType);
        const normalizedAmount = Math.max(0, Math.trunc(amount));
        if (!normalizedWalletType || normalizedAmount <= 0) {
            return player;
        }
        const item = this.contentTemplateRepository.createItem(normalizedWalletType, normalizedAmount);
        if (!item) {
            throw new common_1.NotFoundException(`Item ${normalizedWalletType} not found`);
        }
        const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
        } else {
            player.inventory.items.push(item);
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        player.selfRevision += 1;
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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
        const normalizedWalletType = normalizeWalletType(walletType);
        const normalizedAmount = Math.max(0, Math.trunc(amount));
        if (!normalizedWalletType || normalizedAmount <= 0) {
            return player;
        }
        const inventoryBalance = readInventoryItemCount(player, normalizedWalletType);
        if (inventoryBalance < normalizedAmount) {
            throw new common_1.NotFoundException(`Wallet ${normalizedWalletType} insufficient`);
        }
        consumeInventoryItemCount(player.inventory.items, normalizedWalletType, normalizedAmount);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, normalizedWalletType);
        this.playerProgressionService.refreshPreview(player);
        player.selfRevision += 1;
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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
        return player.techniques.techniques.find((entry) => entry.techId === techId)?.name ?? null;
    }
    /**
 * listQuests：读取任务并返回结果。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成任务的读取/组装。
 */

    listQuests(playerId) {

        const player = this.getPlayerOrThrow(playerId);
        return player.quests.quests.map((entry) => ({ ...entry, rewards: entry.rewards.map((reward) => ({ ...reward })) }));
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.getPlayerOrThrow(playerId);
        this.rollbackExpiredTransfer(player);
        if (player.transferWriteBlocked) {
            return player;
        }

        const text = input.text.trim();
        if (!text) {
            return player;
        }
        const notice = {
            id: player.notices.nextId,
            kind: input.kind,
            text,
        };
        player.notices.nextId += 1;
        if (player.transferState === 'in_transfer') {
            player.transferBufferedNotices.push(notice);
            return player;
        }
        player.notices.queue.push(notice);
        return player;
    }
    /**
 * enqueueCombatEffect：处理战斗Effect并更新相关状态。
 * @param playerId 玩家 ID。
 * @param effect 参数说明。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

    enqueueCombatEffect(playerId, effect) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.players.get(playerId);
        if (!player || !player.sessionId) {
            return;
        }

        const queue = this.pendingCombatEffectsByPlayerId.get(playerId);
        if (queue) {
            queue.push(cloneCombatEffect(effect));
            return;
        }
        this.pendingCombatEffectsByPlayerId.set(playerId, [cloneCombatEffect(effect)]);
    }
    /**
 * enqueueCombatEffects：处理战斗Effect并更新相关状态。
 * @param playerId 玩家 ID。
 * @param effects 参数说明。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

    enqueueCombatEffects(playerId, effects) {
        for (const effect of effects) {
            this.enqueueCombatEffect(playerId, effect);
        }
    }
    /**
 * drainCombatEffects：执行drain战斗Effect相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新drain战斗Effect相关状态。
 */

    drainCombatEffects(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const queue = this.pendingCombatEffectsByPlayerId.get(playerId);
        if (!queue || queue.length === 0) {
            return [];
        }
        this.pendingCombatEffectsByPlayerId.delete(playerId);
        return queue.map((entry) => cloneCombatEffect(entry));
    }
    /**
 * drainNotices：执行drainNotice相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新drainNotice相关状态。
 */

    drainNotices(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.getPlayerOrThrow(playerId);
        if (player.notices.queue.length === 0) {
            return [];
        }

        const queue = player.notices.queue.map((entry) => ({ ...entry }));
        player.notices.queue.length = 0;
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

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }

        const normalizedCount = Math.max(1, Math.trunc(count));

        const nextCount = Math.min(normalizedCount, item.count);

        const extracted = {
            ...item,
            count: nextCount,
        };
        consumeInventoryItemAt(player.inventory.items, slotIndex, nextCount);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        return extracted;
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

        const normalized = this.contentTemplateRepository.normalizeItem(item);
        const existing = player.inventory.items.find((entry) => entry.itemId === normalized.itemId);
        if (existing) {
            existing.count += normalized.count;
        }
        else {
            player.inventory.items.push({ ...normalized });
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, normalized.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }

        const learnTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);

        let consumed = false;
        if (learnTechniqueId) {
            if (player.techniques.techniques.some((entry) => entry.techId === learnTechniqueId)) {
                throw new common_1.NotFoundException(`Technique ${learnTechniqueId} already learned`);
            }

            const technique = this.contentTemplateRepository.createTechniqueState(learnTechniqueId);
            if (!technique) {
                throw new common_1.NotFoundException(`Technique ${learnTechniqueId} not found`);
            }
            player.techniques.techniques.push(toTechniqueUpdateEntry(technique));
            player.techniques.techniques.sort((left, right) => (left.realmLv ?? 0) - (right.realmLv ?? 0) || left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
            player.techniques.revision += 1;
            if (!player.techniques.cultivatingTechId) {
                player.techniques.cultivatingTechId = technique.techId;
                player.combat.cultivationActive = true;
            }
            this.playerAttributesService.recalculate(player);
            this.rebuildActionState(player, 0);
            consumed = true;
        }
        else {
            consumed = this.applyConsumableItem(player, item);
        }
        if (!consumed) {
            throw new common_1.NotFoundException(`Item ${item.itemId} has no usable runtime behavior`);
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, 1);
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, learnTechniqueId ? ['inventory', 'technique', 'auto_battle_skill', 'attr'] : ['inventory']);
        this.bumpPersistentRevision(player);
        return player;
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

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, Math.max(1, Math.trunc(count)));
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, item.itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
        return player;
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

        let remaining = Math.max(1, Math.trunc(count));
        if (!Number.isFinite(remaining) || remaining <= 0) {
            throw new common_1.NotFoundException(`Invalid consume count for ${itemId}`);
        }
        for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
            const item = player.inventory.items[slotIndex];
            if (!item || item.itemId !== itemId) {
                continue;
            }

            const consumed = Math.min(item.count, remaining);
            consumeInventoryItemAt(player.inventory.items, slotIndex, consumed);
            remaining -= consumed;
        }
        if (remaining > 0) {
            throw new common_1.NotFoundException(`Inventory item ${itemId} insufficient`);
        }
        player.inventory.revision += 1;
        syncWalletCacheFromInventory(player, itemId);
        this.playerProgressionService.refreshPreview(player);
        markPlayerDirtyDomains(player, ['inventory']);
        this.bumpPersistentRevision(player);
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

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
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
        return destroyed;
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

        const previous = player.inventory.items.map((entry) => `${entry.itemId}:${entry.count}`);
        player.inventory.items.sort(compareInventoryItems);

        let changed = previous.length !== player.inventory.items.length;
        if (!changed) {
            for (let index = 0; index < previous.length; index += 1) {
                const current = player.inventory.items[index];
                if (!current || previous[index] !== `${current.itemId}:${current.count}`) {
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
            throw new common_1.NotFoundException(`Map ${mapId} already unlocked`);
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
            throw new common_1.BadRequestException('Respawn bind map id is required');
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

    equipItem(playerId, slotIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.getPlayerOrThrow(playerId);

        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        if (!item.equipSlot) {
            throw new common_1.NotFoundException(`Item ${item.itemId} is not equippable`);
        }

        const slot = item.equipSlot;

        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} not found`);
        }

        const equippedItem = takeSingleInventoryItemForEquipment(player.inventory.items, slotIndex);
        if (!equippedItem) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }

        const previousEquipped = equipmentEntry.item ? { ...equipmentEntry.item } : null;
        equipmentEntry.item = { ...equippedItem };
        if (previousEquipped) {
            player.inventory.items.push(previousEquipped);
        }
        player.inventory.revision += 1;
        player.equipment.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['inventory', 'equipment', 'attr']);
        this.bumpPersistentRevision(player);
        return player;
    }
    /**
 * unequipItem：执行unequip道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新unequip道具相关状态。
 */

    unequipItem(playerId, slot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.getPlayerOrThrow(playerId);

        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry || !equipmentEntry.item) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} is empty`);
        }
        player.inventory.items.push({ ...equipmentEntry.item });
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
        if (normalized && !player.techniques.techniques.some((entry) => entry.techId === normalized)) {
            throw new common_1.NotFoundException(`Technique ${normalized} not learned`);
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
            throw new common_1.BadRequestException('foundation amount is required');
        }
        if (player.foundation <= 0) {
            throw new common_1.BadRequestException('foundation is insufficient');
        }

        const consumed = Math.min(player.foundation, requested);

        const previousBodyTraining = (0, shared_1.normalizeBodyTrainingState)(player.bodyTraining);

        const nextBodyTraining = (0, shared_1.normalizeBodyTrainingState)({
            level: previousBodyTraining.level,
            exp: previousBodyTraining.exp + consumed * shared_1.BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
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
            expGained: consumed * shared_1.BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
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

        const currentBodyTraining = (0, shared_1.normalizeBodyTrainingState)(player.bodyTraining);
        const normalizedLevel = Math.max(0, Math.trunc(Number(requestedLevel) || 0));
        const expToNext = (0, shared_1.getBodyTrainingExpToNext)(normalizedLevel);
        const nextBodyTraining = (0, shared_1.normalizeBodyTrainingState)({
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

    recordActivity(playerId, currentTick, input = {}) {
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
            throw new common_1.NotFoundException(`Player ${playerId} qi insufficient`);
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
        this.rebuildActionState(player, 0);
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

        const normalized = (0, player_combat_config_helpers_1.normalizePersistedAutoUsePills)(input);
        if ((0, player_combat_config_helpers_1.isSameAutoUsePillList)(player.combat.autoUsePills, normalized)) {
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

        const normalized = (0, player_combat_config_helpers_1.normalizePersistedCombatTargetingRules)(input);
        if ((0, player_combat_config_helpers_1.isSameCombatTargetingRules)(player.combat.combatTargetingRules, normalized)) {
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

        const normalized = normalizePlayerAutoBattleSkills(player, player.combat.autoBattleSkills);

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
        this.rebuildActionState(player, 0);
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
        if (input.senseQiActive !== undefined && player.combat.senseQiActive !== input.senseQiActive) {
            player.combat.senseQiActive = input.senseQiActive;
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
        if (player.combat.retaliatePlayerTargetId === normalizedTargetId) {
            return player;
        }
        player.combat.retaliatePlayerTargetId = normalizedTargetId;
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
        if (existing) {
            existing.remainingTicks = Math.max(existing.remainingTicks, buff.remainingTicks);
            existing.duration = Math.max(existing.duration, buff.duration);
            existing.stacks = Math.min(existing.maxStacks, Math.max(existing.stacks, buff.stacks));
            existing.attrs = buff.attrs ? { ...buff.attrs } : undefined;
            existing.attrMode = buff.attrMode;
            existing.stats = buff.stats ? { ...buff.stats } : undefined;
            existing.statMode = buff.statMode;
            existing.qiProjection = buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined;
            existing.sourceSkillId = buff.sourceSkillId;
            existing.sourceSkillName = buff.sourceSkillName;
            existing.color = buff.color;
            existing.persistOnDeath = buff.persistOnDeath === true;
            existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
        }
        else {
            player.buffs.buffs.push(cloneTemporaryBuff(buff));
        }
        player.buffs.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
        player.buffs.revision += 1;
        this.playerAttributesService.recalculate(player);
        markPlayerDirtyDomains(player, ['buff', 'attr']);
        this.bumpPersistentRevision(player);
        return player;
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
            return this.getBuffStacks(playerId, pvp_1.PVP_SHA_BACKLASH_BUFF_ID);
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
        const stacks = getEntityBuffStacks(player.buffs.buffs, pvp_1.PVP_SHA_INFUSION_BUFF_ID);
        if (stacks <= 0) {
            return {
                stacks: 0,
                loss: 0,
                consumedProgress: 0,
                consumedFoundation: 0,
                backlashAddedStacks: 0,
                backlashTotalStacks: this.getBuffStacks(playerId, pvp_1.PVP_SHA_BACKLASH_BUFF_ID),
                remainingInfusionStacks: 0,
            };
        }
        const backlashAddedStacks = Math.max(1, Math.ceil(stacks / pvp_1.PVP_SHA_BACKLASH_STACK_DIVISOR));
        const remainingInfusionStacks = this.consumePvpBuffStacks(playerId, pvp_1.PVP_SHA_INFUSION_BUFF_ID, backlashAddedStacks);
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
        const consumed = this.playerProgressionService.consumeRealmProgressAndFoundation(player, loss);
        if (Array.isArray(consumed.dirtyDomains) && consumed.dirtyDomains.length > 0) {
            markPlayerDirtyDomains(player, consumed.dirtyDomains);
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
            existing.name = buff.name;
            existing.desc = buff.desc;
            existing.baseDesc = buff.baseDesc;
            existing.shortMark = buff.shortMark;
            existing.category = buff.category;
            existing.visibility = buff.visibility;
            existing.remainingTicks = Math.max(1, Math.round(buff.duration));
            existing.duration = Math.max(1, Math.round(buff.duration));
            existing.maxStacks = Math.max(existing.maxStacks ?? 1, buff.maxStacks ?? 1);
            existing.stacks = Math.min(existing.maxStacks, Math.max(1, Math.round(existing.stacks + (stackDelta || buff.stacks || 0))));
            existing.sourceSkillId = buff.sourceSkillId;
            existing.sourceSkillName = buff.sourceSkillName;
            existing.realmLv = buff.realmLv;
            existing.color = buff.color;
            existing.attrs = buff.attrs ? { ...buff.attrs } : undefined;
            existing.attrMode = buff.attrMode;
            existing.stats = buff.stats ? { ...buff.stats } : undefined;
            existing.statMode = buff.statMode;
            existing.qiProjection = buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined;
            existing.persistOnDeath = buff.persistOnDeath === true;
            existing.persistOnReturnToSpawn = buff.persistOnReturnToSpawn === true;
        }
        else {
            const created = cloneTemporaryBuff(buff);
            created.stacks = Math.max(1, Math.round(stackDelta || buff.stacks || 1));
            player.buffs.buffs.push(created);
        }
        player.buffs.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
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

    advanceTick(currentTick, options = {}) {
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

    advanceTickForPlayerIds(playerIds, currentTick, options = {}) {
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

    advanceSinglePlayerTick(player, currentTick, options = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (advancePlayerChronology(player)) {
                markPlayerDirtyDomains(player, ['progression']);
                this.bumpPersistentRevision(player);
            }
            if (tickTemporaryBuffs(player.buffs.buffs)) {
                player.buffs.revision += 1;
                this.playerAttributesService.recalculate(player);
                markPlayerDirtyDomains(player, ['buff', 'attr']);
                this.bumpPersistentRevision(player);
            }
            if (recoverPlayerVitals(player, currentTick)) {
                player.selfRevision += 1;
                markPlayerDirtyDomains(player, ['vitals']);
                this.bumpPersistentRevision(player);
            }
            if (player.hp > 0 && shouldResumeIdleCultivation(player, currentTick, options.idleCultivationBlockedPlayerIds)) {
                player.combat.cultivationActive = true;
                this.playerAttributesService.recalculate(player);
                markPlayerDirtyDomains(player, ['combat_pref', 'attr']);
                this.bumpPersistentRevision(player);
            }
            if (player.hp > 0 && player.combat.cultivationActive) {

                const result = this.playerProgressionService.advanceCultivation(player, 1, {
                    auraMultiplier: resolveCultivationAuraMultiplier(player, options),
                });
                this.applyProgressionResult(player, result, currentTick);
            }
            if (hasActiveSkillCooldown(player, currentTick)) {
                this.rebuildActionState(player, currentTick);
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
        if (player.facing !== input.facing) {
            player.facing = input.facing;
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
            player.combat.cooldownReadyTickBySkillId = {};
            this.rebuildActionState(player, input.currentTick);
        }
        if (player.combat.autoBattle) {
            player.combat.autoBattle = false;
            changed = true;
        }
        player.combat.retaliatePlayerTargetId = null;
        player.combat.combatTargetId = null;
        player.combat.combatTargetLocked = false;
        player.combat.manualEngagePending = false;
        const wasCultivationActive = player.combat.cultivationActive === true;
        player.combat.cultivationActive = false;
        if (wasCultivationActive) {
            changed = true;
            this.playerAttributesService.recalculate(player);
        }
        player.combat.lastActiveTick = Math.max(player.combat.lastActiveTick, Math.trunc(input.currentTick));
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
            .filter((player) => !(0, next_gm_constants_1.isNativeGmBotPlayerId)(player.playerId))
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
            if ((0, next_gm_constants_1.isNativeGmBotPlayerId)(player.playerId)) {
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
        player.facing = Number.isFinite(placement?.facing)
            ? Math.trunc(placement.facing)
            : shared_1.Direction.South;
        player.unlockedMapIds = [templateId];
        return buildRuntimePlayerPersistenceSnapshot(player);
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
            facing: shared_1.Direction.South,
        });
    }
    /**
 * buildPersistenceSnapshot：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Persistence快照相关状态。
 */

    buildPersistenceSnapshot(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.players.get(playerId);
        if (!player || !player.templateId || (0, next_gm_constants_1.isNativeGmBotPlayerId)(playerId)) {
            return null;
        }
        return buildRuntimePlayerPersistenceSnapshot(player);
    }
    /**
 * markPersisted：判断Persisted是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Persisted相关状态。
 */

    markPersisted(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.players.get(playerId);
        if (!player) {
            return;
        }
        player.persistedRevision = player.persistentRevision;
        clearPlayerDirtyDomains(player);
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
    /**
 * listPlayerSnapshots：读取玩家快照并返回结果。
 * @returns 无返回值，完成玩家快照的读取/组装。
 */

    listPlayerSnapshots() {
        return Array.from(this.players.values(), (player) => cloneRuntimePlayerState(player));
    }
    /**
 * restoreSnapshot：执行restore快照相关逻辑。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新restore快照相关状态。
 */

    restoreSnapshot(snapshot) {
        this.players.set(snapshot.playerId, cloneRuntimePlayerState(snapshot));
        this.pendingCombatEffectsByPlayerId.delete(snapshot.playerId);
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
        const snapshotRespawnX = Number.isFinite(snapshot.respawn?.x)
            ? Math.trunc(snapshot.respawn.x)
            : (snapshotRespawnTemplate ? Math.trunc(snapshotRespawnTemplate.spawnX) : 0);
        const snapshotRespawnY = Number.isFinite(snapshot.respawn?.y)
            ? Math.trunc(snapshot.respawn.y)
            : (snapshotRespawnTemplate ? Math.trunc(snapshotRespawnTemplate.spawnY) : 0);

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
            facing: snapshot.placement.facing,
            hp: snapshot.vitals.hp,
            maxHp: snapshot.vitals.maxHp,
            qi: snapshot.vitals.qi,
            maxQi: snapshot.vitals.maxQi,
            foundation: normalizeCounter(snapshot.progression?.foundation),
            rootFoundation: normalizeCounter(snapshot.progression?.rootFoundation),
            combatExp: normalizeCounter(snapshot.progression?.combatExp),
            comprehension: normalizeCounter(snapshot.progression?.comprehension),
            luck: normalizeCounter(snapshot.progression?.luck),
            bodyTraining: (0, shared_1.normalizeBodyTrainingState)(snapshot.progression?.bodyTraining),
            boneAgeBaseYears: normalizeBoneAgeBaseYears(snapshot.progression?.boneAgeBaseYears),
            lifeElapsedTicks: normalizeLifeElapsedTicks(snapshot.progression?.lifeElapsedTicks),
            lifespanYears: normalizeLifespanYears(snapshot.progression?.lifespanYears),
            realm: normalizeRealmState(snapshot.progression?.realm),
            heavenGate: normalizeHeavenGateState(snapshot.progression?.heavenGate),
            spiritualRoots: normalizeHeavenGateRoots(snapshot.progression?.spiritualRoots),
            alchemySkill: normalizeCraftSkillState(snapshot.progression?.alchemySkill),
            gatherSkill: normalizeCraftSkillState(snapshot.progression?.gatherSkill),
            gatherJob: normalizeGatherJob(snapshot.progression?.gatherJob),
            alchemyPresets: normalizeAlchemyPresets(snapshot.progression?.alchemyPresets),
            alchemyJob: normalizeAlchemyJob(snapshot.progression?.alchemyJob),
            enhancementSkill: normalizeCraftSkillState(snapshot.progression?.enhancementSkill),
            enhancementSkillLevel: Math.max(1, Math.floor(Number(snapshot.progression?.enhancementSkillLevel ?? snapshot.progression?.enhancementSkill?.level) || 1)),
            enhancementJob: normalizeEnhancementJob(snapshot.progression?.enhancementJob),
            enhancementRecords: normalizeEnhancementRecords(snapshot.progression?.enhancementRecords),
            unlockedMapIds: snapshot.unlockedMapIds.slice(),
            selfRevision: 1,
            inventory: {
                revision: Math.max(1, snapshot.inventory.revision),
                capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, snapshot.inventory.capacity),
                items: snapshot.inventory.items.map((entry) => this.contentTemplateRepository.normalizeItem(entry)),
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
                    ? snapshot.equipment.slots.map((entry) => ({
                        slot: entry.slot,
                        item: entry.item ? this.contentTemplateRepository.normalizeItem(entry.item) : null,
                    }))
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
                    ? snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry))
                    : [],
            },
            combat: {
                cooldownReadyTickBySkillId: {},

                autoBattle: snapshot.combat?.autoBattle === true,

                autoRetaliate: snapshot.combat?.autoRetaliate !== false,

                autoBattleStationary: snapshot.combat?.autoBattleStationary === true,
                autoUsePills: (0, player_combat_config_helpers_1.normalizePersistedAutoUsePills)(snapshot.combat?.autoUsePills),
                combatTargetingRules: (0, player_combat_config_helpers_1.normalizePersistedCombatTargetingRules)(snapshot.combat?.combatTargetingRules),
                autoBattleTargetingMode: normalizePersistedAutoBattleTargetingMode(snapshot.combat?.autoBattleTargetingMode),
                retaliatePlayerTargetId: typeof snapshot.combat?.retaliatePlayerTargetId === 'string' && snapshot.combat.retaliatePlayerTargetId.trim()
                    ? snapshot.combat.retaliatePlayerTargetId.trim()
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

                senseQiActive: snapshot.combat?.senseQiActive === true,
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
                quests: snapshot.quests.entries.map((entry) => ({
                    ...entry,
                    rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                    rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
                })),
            },
            lootWindowTarget: null,
            pendingLogbookMessages: normalizePendingLogbookMessages(snapshot.pendingLogbookMessages),
            vitalRecoveryDeferredUntilTick: -1,
            runtimeBonuses: (Array.isArray(snapshot.runtimeBonuses) ? snapshot.runtimeBonuses : [])
                .map((entry) => cloneRuntimeBonus(entry))
                .filter((entry) => Boolean(entry)),
            dirtyDomains: createPlayerDirtyDomainSet(),
        };
        player.attrs.rawBaseAttrs = decodePersistedRawBaseAttrs(snapshot.attrState?.baseAttrs);
        player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        this.playerProgressionService.initializePlayer(player);
        syncWalletCacheFromInventory(player);
        if (ensureVitalBaselineBonus(player, snapshot.vitals)) {
            this.playerAttributesService.recalculate(player);
            markPlayerDirtyDomains(player, ['attr']);
            player.hp = clamp(snapshot.vitals.hp, 0, player.maxHp);
            player.qi = clamp(snapshot.vitals.qi, 0, player.maxQi);
        }
        this.rebuildActionState(player, 0);
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
        player.notices.queue.push(...buffered);
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
                player.notices.queue.push({
                    id: player.notices.nextId,
                    kind: notice.kind,
                    text,
                });
                player.notices.nextId += 1;
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
    /**
 * rebuildActionState：构建rebuildAction状态。
 * @param player 玩家对象。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新rebuildAction状态相关状态。
 */

    rebuildActionState(player, currentTick) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const nextActions = buildActionEntries(player, currentTick);

        const techniqueFlagsChanged = syncTechniqueSkillAvailability(player);
        if (isSameActionList(player.actions.actions, nextActions) && !techniqueFlagsChanged) {
            return;
        }
        if (!isSameActionList(player.actions.actions, nextActions)) {
            player.actions.actions = nextActions;
            player.actions.revision += 1;
        }
        if (techniqueFlagsChanged) {
            player.techniques.revision += 1;
            markPlayerDirtyDomains(player, ['technique']);
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

        const qiPercent = typeof item.qiPercent === 'number' ? Math.max(0, item.qiPercent) : 0;
        if (healAmount > 0 || healPercent > 0 || qiPercent > 0) {

            const nextHp = clamp(player.hp + healAmount + Math.round(player.maxHp * healPercent), 0, player.maxHp);

            const nextQi = clamp(player.qi + Math.round(player.maxQi * qiPercent), 0, player.maxQi);
            if (nextHp !== player.hp || nextQi !== player.qi) {
                player.hp = nextHp;
                player.qi = nextQi;
                selfChanged = true;
            }
            consumed = true;
        }
        if (Array.isArray(item.consumeBuffs) && item.consumeBuffs.length > 0) {
            for (const buff of item.consumeBuffs) {
                this.applyTemporaryBuff(player.playerId, toConsumableTemporaryBuff(item, buff));
            }
            consumed = true;
        }
        if (selfChanged) {
            markPlayerDirtyDomains(player, ['vitals']);
            player.selfRevision += 1;
        }
        return consumed;
    }
};
exports.PlayerRuntimeService = PlayerRuntimeService;
exports.PlayerRuntimeService = PlayerRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        player_attributes_service_1.PlayerAttributesService,
        player_progression_service_1.PlayerProgressionService,
        player_domain_persistence_service_1.PlayerDomainPersistenceService])
], PlayerRuntimeService);
export { PlayerRuntimeService };
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
    return shared_1.EQUIP_SLOTS.map((slot) => ({
        slot,
        item: equipment[slot] ? { ...equipment[slot] } : null,
    }));
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
            items: player.inventory.items.map((entry) => ({ ...entry })),
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
                item: entry.item ? { ...entry.item } : null,
            })),
        },
        techniques: {
            revision: player.techniques.revision,
            techniques: player.techniques.techniques.map((entry) => ({ ...entry })),
            cultivatingTechId: player.techniques.cultivatingTechId,
        },
        attrs: cloneRuntimeAttrState(player.attrs),
        actions: {
            revision: player.actions.revision,
            contextActions: player.actions.contextActions.map((entry) => ({ ...entry })),
            actions: player.actions.actions.map((entry) => ({ ...entry })),
        },
        buffs: {
            revision: player.buffs.revision,
            buffs: player.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
        },
        combat: {
            cooldownReadyTickBySkillId: { ...player.combat.cooldownReadyTickBySkillId },
            autoBattle: player.combat.autoBattle,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
            combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
            retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            senseQiActive: player.combat.senseQiActive,
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
            quests: player.quests.quests.map((entry) => ({
                ...entry,
                rewardItemIds: entry.rewardItemIds.slice(),
                rewards: entry.rewards.map((reward) => ({ ...reward })),
            })),
        },
        alchemySkill: cloneCraftSkillState(player.alchemySkill),
        gatherSkill: cloneCraftSkillState(player.gatherSkill),
        gatherJob: player.gatherJob ? cloneGatherJob(player.gatherJob) : null,
        alchemyPresets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
        alchemyJob: player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
        enhancementSkill: cloneCraftSkillState(player.enhancementSkill),
        enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
        enhancementJob: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
        enhancementRecords: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
        lootWindowTarget: player.lootWindowTarget
            ? { ...player.lootWindowTarget }
            : null,
        pendingLogbookMessages: player.pendingLogbookMessages.map((entry) => ({ ...entry })),
        vitalRecoveryDeferredUntilTick: player.vitalRecoveryDeferredUntilTick,
        runtimeBonuses: player.runtimeBonuses.map((entry) => cloneRuntimeBonus(entry)),
        dirtyDomains: createPlayerDirtyDomainSet(),
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
        throw new common_1.NotFoundException(`Inventory item ${itemId} insufficient`);
    }
}
/**
 * createDefaultRealmState：构建并返回目标对象。
 * @returns 无返回值，直接更新DefaultRealm状态相关状态。
 */

function createDefaultRealmState() {

    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;

    const config = shared_1.PLAYER_REALM_CONFIG[stage];
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
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!realm) {
        return null;
    }
    return {
        ...realm,
        breakthroughItems: realm.breakthroughItems.map((entry) => ({ ...entry })),
        breakthrough: realm.breakthrough
            ? {
                ...realm.breakthrough,
                requirements: realm.breakthrough.requirements.map((entry) => ({ ...entry })),
            }
            : undefined,
        heavenGate: cloneHeavenGateState(realm.heavenGate),
    };
}
/**
 * cloneHeavenGateState：构建HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function cloneHeavenGateState(state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!state) {
        return null;
    }
    return {
        unlocked: state.unlocked,
        severed: state.severed.slice(),
        roots: cloneHeavenGateRoots(state.roots),
        entered: state.entered,
        averageBonus: state.averageBonus,
    };
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
    const ownerDigest = (0, crypto_1.createHash)('sha256')
        .update(`${normalizedPlayerId}:${normalizedSessionId}:${normalizedEpoch}`)
        .digest('base64url')
        .slice(0, 32);
    return `rt:${normalizedEpoch.toString(36)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}:${ownerDigest}`;
}
/**
 * buildRuntimePlayerPersistenceSnapshot：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新运行态玩家Persistence快照相关状态。
 */

function buildRuntimePlayerPersistenceSnapshot(player) {
    const templateId = typeof player.templateId === 'string' ? player.templateId.trim() : '';
    const respawnTemplateId = typeof player.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
        ? player.respawnTemplateId.trim()
        : DEFAULT_PLAYER_STARTER_MAP_ID;
    const respawnInstanceId = normalizePlayerPlacementInstanceId(player.respawnInstanceId)
        ?? (respawnTemplateId ? buildPublicPlayerInstanceId(respawnTemplateId) : '');
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
            x: Number.isFinite(player.respawnX) ? Math.trunc(player.respawnX) : 0,
            y: Number.isFinite(player.respawnY) ? Math.trunc(player.respawnY) : 0,
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
        progression: {
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
            gatherSkill: cloneCraftSkillState(player.gatherSkill),
            gatherJob: player.gatherJob ? cloneGatherJob(player.gatherJob) : null,
            alchemyPresets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
            alchemyJob: player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
            enhancementSkill: cloneCraftSkillState(player.enhancementSkill),
            enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
            enhancementJob: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
            enhancementRecords: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
        },
        attrState: {
            baseAttrs: player.attrs?.rawBaseAttrs ? encodePersistedRawBaseAttrs(player.attrs.rawBaseAttrs) : null,
            revealedBreakthroughRequirementIds: resolveRevealedBreakthroughRequirementIds(player.realm),
        },
        unlockedMapIds: player.unlockedMapIds.slice(),
        inventory: {
            revision: player.inventory.revision,
            capacity: player.inventory.capacity,
            items: player.inventory.items.map((entry) => ({ ...entry })),
        },
        equipment: {
            revision: player.equipment.revision,
            slots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            })),
        },
        techniques: {
            revision: player.techniques.revision,
            techniques: player.techniques.techniques.map((entry) => ({ ...entry })),
            cultivatingTechId: player.techniques.cultivatingTechId,
        },
        buffs: {
            revision: player.buffs.revision,
            buffs: player.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
        },
        quests: {
            revision: player.quests.revision,
            entries: player.quests.quests.map((entry) => ({
                ...entry,
                rewardItemIds: entry.rewardItemIds.slice(),
                rewards: entry.rewards.map((reward) => ({ ...reward })),
            })),
        },
        combat: {
            autoBattle: player.combat.autoBattle,
            autoRetaliate: player.combat.autoRetaliate,
            autoBattleStationary: player.combat.autoBattleStationary,
            autoUsePills: (0, player_combat_config_helpers_1.cloneAutoUsePillList)(player.combat.autoUsePills),
            combatTargetingRules: (0, player_combat_config_helpers_1.cloneCombatTargetingRules)(player.combat.combatTargetingRules),
            autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
            retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            senseQiActive: player.combat.senseQiActive,
            autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
        },
        pendingLogbookMessages: player.pendingLogbookMessages.map((entry) => ({ ...entry })),
        runtimeBonuses: player.runtimeBonuses.map((entry) => cloneRuntimeBonus(entry)),
    };
}

function normalizePlayerPlacementInstanceId(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
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

function createCraftSkillState() {
    return {
        level: 1,
        exp: 0,
        expToNext: 60,
    };
}
/**
 * normalizeCraftSkillState：规范化或转换炼制技能状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能状态相关状态。
 */

function normalizeCraftSkillState(value) {
    return {
        level: Math.max(1, Math.floor(Number(value?.level) || 1)),
        exp: Math.max(0, Math.floor(Number(value?.exp) || 0)),
        expToNext: Math.max(0, Math.floor(Number(value?.expToNext) || 60)),
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
        phase: value.phase === 'preparing' || value.phase === 'paused' ? value.phase : 'brewing',
        preparationTicks: Math.max(0, Math.floor(Number(value.preparationTicks) || 0)),
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
        item: value.item && typeof value.item === 'object' ? { ...value.item } : value.item,
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
    return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? shared_1.DEFAULT_BONE_AGE_YEARS)) : shared_1.DEFAULT_BONE_AGE_YEARS;
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
        const [removed] = items.splice(slotIndex, 1);
        return {
            ...removed,
            count: 1,
        };
    }
    item.count = itemCount - 1;
    return {
        ...item,
        count: 1,
    };
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
        realm: technique.realm ?? shared_1.TechniqueRealm.Entry,

        skillsEnabled: technique.skillsEnabled !== false,
        name: technique.name,
        grade: technique.grade ?? null,
        category: technique.category ?? null,
        skills: technique.skills.map((entry) => ({ ...entry })),
        layers: technique.layers?.map((entry) => ({
            level: entry.level,
            expToNext: entry.expToNext,
            attrs: entry.attrs ? { ...entry.attrs } : undefined,
            qiProjection: entry.qiProjection ? entry.qiProjection.map((modifier) => ({
                ...modifier,
                selector: modifier.selector
                    ? {
                        ...modifier.selector,
                        resourceKeys: modifier.selector.resourceKeys ? modifier.selector.resourceKeys.slice() : undefined,
                        families: modifier.selector.families ? modifier.selector.families.slice() : undefined,
                        forms: modifier.selector.forms ? modifier.selector.forms.slice() : undefined,
                        elements: modifier.selector.elements ? modifier.selector.elements.slice() : undefined,
                    }
                    : undefined,
            })) : undefined,
        })) ?? null,
        attrCurves: technique.attrCurves ? { ...technique.attrCurves } : null,
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

    const autoBattleSkills = normalizePlayerAutoBattleSkills(player, player.combat.autoBattleSkills);

    const skillOrder = new Map(autoBattleSkills.map((entry, index) => [entry.skillId, index]));

    const autoBattleEnabledMap = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.enabled]));

    const skillEnabledMap = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
            if ((technique.level ?? 1) < unlockLevel) {
                continue;
            }

            const readyTick = player.combat.cooldownReadyTickBySkillId[skill.id] ?? 0;
            actions.push({
                id: skill.id,
                name: skill.name,
                type: 'skill',
                desc: skill.desc,
                cooldownLeft: Math.max(0, readyTick - currentTick),
                range: skill.targeting?.range ?? skill.range,
                requiresTarget: skill.requiresTarget ?? true,
                targetMode: skill.targetMode ?? 'entity',
                autoBattleEnabled: autoBattleEnabledMap.get(skill.id) ?? true,
                autoBattleOrder: skillOrder.get(skill.id),
                skillEnabled: skillEnabledMap.get(skill.id) ?? true,
            });
        }
    }
    player.combat.autoBattleSkills = autoBattleSkills;
    for (const entry of player.actions.contextActions) {
        const readyTick = Math.max(0, Math.trunc(Number(player.combat.cooldownReadyTickBySkillId[entry.id] ?? 0)));
        actions.push({
            ...entry,
            cooldownLeft: readyTick > 0 ? Math.max(0, readyTick - currentTick) : Math.max(0, Number(entry.cooldownLeft ?? 0)),
        });
    }
    actions.sort((left, right) => ((skillOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (skillOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)) || left.id.localeCompare(right.id, 'zh-Hans-CN'));
    return actions;
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
    return (0, shared_1.enforceSkillEnabledLimit)(entries, (0, shared_1.resolvePlayerSkillSlotLimit)(player));
}
/**
 * normalizePlayerAutoBattleSkills：按玩家当前可用技能与槽位上限规整自动战斗技能配置。
 * @param player 玩家对象。
 * @param input 原始技能配置列表。
 * @returns 返回已按技能可见性和槽位上限规整后的配置列表。
 */

function normalizePlayerAutoBattleSkills(player, input) {
    return enforcePlayerSkillEnabledLimit(player, normalizeAutoBattleSkills(collectUnlockedSkillIds(player), input));
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

function tickTemporaryBuffs(buffs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let changed = false;
    for (const buff of buffs) {
        if (buff.remainingTicks <= 0) {
            continue;
        }
        buff.remainingTicks -= 1;
        changed = true;
        if (buff.remainingTicks <= 0 && isDecayStackBuff(buff)) {
            if (buff.stacks > 1) {
                buff.stacks -= 1;
                buff.remainingTicks = Math.max(1, Math.round(buff.duration || 1));
            }
        }
    }

    const nextLength = buffs.filter((entry) => entry.remainingTicks > 0 && entry.stacks > 0).length;
    if (nextLength !== buffs.length) {
        changed = true;
    }
    if (changed) {

        let writeIndex = 0;
        for (const buff of buffs) {
            if (buff.remainingTicks > 0 && buff.stacks > 0) {
                buffs[writeIndex] = buff;
                writeIndex += 1;
            }
        }
        buffs.length = writeIndex;
    }
    return changed;
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
    for (const readyTick of Object.values(player.combat.cooldownReadyTickBySkillId)) {
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
        || player.combat.autoIdleCultivation === false) {
        return false;
    }
    if (blockedPlayerIds?.has(player.playerId)) {
        return false;
    }
    return currentTick - player.combat.lastActiveTick >= shared_1.AUTO_IDLE_CULTIVATION_DELAY_TICKS;
}
/**
 * cloneTemporaryBuff：构建TemporaryBuff。
 * @param source 来源对象。
 * @returns 无返回值，直接更新TemporaryBuff相关状态。
 */

function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}

function buildPvPSoulInjuryBuffState(sourceRealmLv) {
    return {
        buffId: pvp_1.PVP_SOUL_INJURY_BUFF_ID,
        name: '神魂受损',
        desc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
        baseDesc: '神魂受创；身死与遁返都不会清除，需静养满一时辰。',
        shortMark: '残',
        category: 'debuff',
        visibility: 'public',
        remainingTicks: pvp_1.PVP_SOUL_INJURY_DURATION_TICKS,
        duration: pvp_1.PVP_SOUL_INJURY_DURATION_TICKS,
        stacks: 1,
        maxStacks: 1,
        sourceSkillId: pvp_1.PVP_SOUL_INJURY_SOURCE_ID,
        sourceSkillName: '杀孽',
        realmLv: Math.max(1, Math.floor(sourceRealmLv)),
        color: '#8a5a64',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
    };
}

function getPlayerRealmLevel(player) {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? 1));
}

function buildPvPShaInfusionBuffState(sourceRealmLv) {
    return {
        buffId: pvp_1.PVP_SHA_INFUSION_BUFF_ID,
        name: '煞气入体',
        desc: `每层攻击 +1%（最高 +${pvp_1.PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
        baseDesc: `每层攻击 +1%（最高 +${pvp_1.PVP_SHA_INFUSION_ATTACK_CAP_PERCENT}%）、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。`,
        shortMark: '煞',
        category: 'buff',
        visibility: 'public',
        remainingTicks: pvp_1.PVP_SHA_INFUSION_DECAY_TICKS,
        duration: pvp_1.PVP_SHA_INFUSION_DECAY_TICKS,
        stacks: 1,
        maxStacks: 999999,
        sourceSkillId: pvp_1.PVP_SHA_INFUSION_SOURCE_ID,
        sourceSkillName: '杀孽',
        realmLv: Math.max(1, Math.floor(sourceRealmLv)),
        color: '#7a2e2e',
        stats: {
            physAtk: 1,
            spellAtk: 1,
            physDef: -2,
            spellDef: -2,
        },
        statMode: 'percent',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
    };
}

function buildPvPShaBacklashBuffState(sourceRealmLv, stacks) {
    return {
        buffId: pvp_1.PVP_SHA_BACKLASH_BUFF_ID,
        name: '煞气反噬',
        desc: `每层攻击 -${pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
        baseDesc: `每层攻击 -${pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK}%、防御 -${pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK}%；每十分钟自然消退一层。`,
        shortMark: '蚀',
        category: 'debuff',
        visibility: 'public',
        remainingTicks: pvp_1.PVP_SHA_BACKLASH_DECAY_TICKS,
        duration: pvp_1.PVP_SHA_BACKLASH_DECAY_TICKS,
        stacks: Math.max(1, Math.floor(stacks)),
        maxStacks: 999999,
        sourceSkillId: pvp_1.PVP_SHA_BACKLASH_SOURCE_ID,
        sourceSkillName: '煞气反噬',
        realmLv: Math.max(1, Math.floor(sourceRealmLv)),
        color: '#6d2626',
        stats: {
            physAtk: -pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            spellAtk: -pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            physDef: -pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK,
            spellDef: -pvp_1.PVP_SHA_BACKLASH_PERCENT_PER_STACK,
        },
        statMode: 'percent',
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
    };
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
    return buff.buffId === pvp_1.PVP_SHA_INFUSION_BUFF_ID || buff.buffId === pvp_1.PVP_SHA_BACKLASH_BUFF_ID;
}

function shouldKeepBuffOnRespawn(buff) {
    return buff.persistOnDeath === true
        || buff.category !== 'debuff'
        || buff.buffId === pvp_1.PVP_SOUL_INJURY_BUFF_ID
        || buff.buffId === pvp_1.PVP_SHA_INFUSION_BUFF_ID
        || buff.buffId === pvp_1.PVP_SHA_BACKLASH_BUFF_ID;
}

function shouldKeepBuffOnReturnToSpawn(buff) {
    return buff.persistOnReturnToSpawn === true
        || buff.buffId === pvp_1.PVP_SHA_INFUSION_BUFF_ID
        || buff.buffId === pvp_1.PVP_SHA_BACKLASH_BUFF_ID;
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

function toConsumableTemporaryBuff(item, buff) {
    return {
        buffId: buff.buffId,
        name: buff.name,
        desc: buff.desc,
        shortMark: buff.shortMark ?? (buff.name.slice(0, 1) || '*'),
        category: buff.category ?? 'buff',
        visibility: buff.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.round(buff.duration)),
        duration: Math.max(1, Math.round(buff.duration)),
        stacks: 1,
        maxStacks: Math.max(1, Math.round(buff.maxStacks ?? 1)),
        sourceSkillId: item.itemId,
        sourceSkillName: item.name ?? item.itemId,
        color: buff.color,
        attrs: buff.attrs ? { ...buff.attrs } : undefined,
        attrMode: buff.attrMode,
        stats: buff.stats
            ? { ...buff.stats }
            : (buff.valueStats ? (0, shared_1.compileValueStatsToActualStats)(buff.valueStats) : undefined),
        statMode: buff.statMode,
        qiProjection: buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined,
        persistOnDeath: buff.persistOnDeath === true,
        persistOnReturnToSpawn: buff.persistOnReturnToSpawn === true,
    };
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

function createDefaultBaseAttributes() {
    return {
        constitution: shared_1.DEFAULT_BASE_ATTRS.constitution,
        spirit: shared_1.DEFAULT_BASE_ATTRS.spirit,
        perception: shared_1.DEFAULT_BASE_ATTRS.perception,
        talent: shared_1.DEFAULT_BASE_ATTRS.talent,
        strength: shared_1.DEFAULT_BASE_ATTRS.strength,
        meridians: shared_1.DEFAULT_BASE_ATTRS.meridians,
    };
}

function normalizeRawBaseAttributes(source) {
    const attrs = createDefaultBaseAttributes();
    if (!source || typeof source !== 'object') {
        return attrs;
    }
    for (const key of shared_1.ATTR_KEYS) {
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

    const stats = {};
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
/**
 * cloneCombatEffect：构建战斗Effect。
 * @param source 来源对象。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

function cloneCombatEffect(source) {
    return { ...source };
}
