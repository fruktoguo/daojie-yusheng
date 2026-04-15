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

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};

var WorldRuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const movement_debug_1 = require("../../debug/movement-debug");

const next_gm_constants_1 = require("../../http/next/next-gm.constants");

const content_template_repository_1 = require("../../content/content-template.repository");

const world_session_service_1 = require("../../network/world-session.service");

const world_client_event_service_1 = require("../../network/world-client-event.service");

const map_persistence_service_1 = require("../../persistence/map-persistence.service");

const redeem_code_runtime_service_1 = require("../redeem/redeem-code-runtime.service");

const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");

const player_combat_service_1 = require("../combat/player-combat.service");

const map_instance_runtime_1 = require("../instance/map-instance.runtime");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const {
    normalizeRuntimeActionId,
    buildPublicInstanceId,
    formatItemStackLabel,
    formatItemListSummary,
    cloneCombatEffect,
    buildContainerSourceId,
    isContainerSourceId,
    parseContainerSourceId,
    createSyncedItemStackSignature,
    compareStableKeys,
    serializeStableComparableValue,
    groupContainerLootRows,
    hasHiddenContainerEntries,
    buildContainerWindowItems,
    cloneInventorySimulation,
    canReceiveContainerEntries,
    applyContainerEntriesToInventorySimulation,
    canReceiveContainerRow,
    removeContainerRowEntries,
    buildNpcQuestProgressText,
    canReceiveItemStack,
    toQuestRewardItem,
    roundDurationMs,
    pushDurationMetric,
    summarizeDurations,
    normalizeQuestLine,
    normalizeQuestObjectiveType,
    normalizeQuestRequired,
    normalizeQuestRealmStage,
    resolveQuestTargetLabel,
    buildQuestRewardText,
    cloneQuestState,
    compareQuestViews,
    compareStableStrings,
    parseDirection,
    normalizeSlotIndex,
    normalizeEquipSlot,
    normalizeTechniqueId,
    normalizeShopQuantity,
    normalizePositiveCount,
    normalizeCoordinate,
    normalizeRollCount,
    findPlayerSkill,
    isHostileSkill,
    getSkillEffectColor,
    resolveRuntimeSkillRange,
    resolveAutoBattleSkillQiCost,
} = world_runtime_normalization_helpers_1;
const {
    createTileCombatAttributes,
    createTileCombatNumericStats,
    createTileCombatRatioDivisors,
    computeResolvedDamage,
    formatCombatDamageBreakdown,
    formatCombatActionClause,
    formatCombatDamageType,
    cloneVisibleBuff,
    buildPlayerObservation,
    buildMonsterObservation,
    buildMonsterLootPreview,
    resolveObservedDropChance,
    compareStableText,
    buildNpcObservation,
    buildPortalTileEntityDetail,
    buildGroundTileEntityDetail,
    buildContainerTileEntityDetail,
    buildObservationInsight,
    computeObservationProgress,
    resolveObservationClarity,
    buildObservationVerdict,
    formatCurrentMaxObservation,
    buildPortalDisplayName,
    buildPortalKindLabel,
    buildPortalId,
} = world_runtime_observation_helpers_1;
const {
    chebyshevDistance,
    isInBounds,
    selectNearestPortal,
    buildGoalPoints,
    buildGoalPointsFromTemplate,
    buildAdjacentGoalPoints,
    dedupeGoalPoints,
    decodeClientPathHint,
    resolveInitialRunLength,
    buildPathingBlockMask,
    computePathCost,
    buildCoordKey,
    resolvePreferredClientPathHint,
    findOptimalPathOnMap,
    findNextDirectionOnMap,
    findPathPointsOnMap,
    reconstructPathPoints,
    pushPathNode,
    popPathNode,
    directionFromStep,
    buildAutoBattleGoalPoints,
    isTileVisibleInView,
    DIRECTION_OFFSET,
} = world_runtime_path_planning_helpers_1;

/** DEFAULT_PLAYER_RESPAWN_MAP_ID：DEFAULTPLAYERRESPAWNMAPID。 */
const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** NPC_SHOP_CURRENCY_ITEM_ID：NPCSHOPCURRENCYITEMID。 */
const NPC_SHOP_CURRENCY_ITEM_ID = 'spirit_stone';

/** TICK_METRIC_WINDOW_SIZE：TICKMETRICWINDOWSIZE。 */
const TICK_METRIC_WINDOW_SIZE = 60;

/** CONTAINER_SEARCH_TICKS_BY_GRADE：不同品阶容器每轮翻找所需的 tick 数。 */
const CONTAINER_SEARCH_TICKS_BY_GRADE = {
    mortal: 1,
    yellow: 1,
    mystic: 2,
    earth: 2,
    heaven: 3,
    spirit: 3,
    saint: 4,
    emperor: 4,
};

/** STATIC_TOGGLE_CONTEXT_ACTIONS：STATICTOGGLECONTEXTACTIONS。 */
const STATIC_TOGGLE_CONTEXT_ACTIONS = [{
        id: 'toggle:auto_battle',
        name: '自动战斗',
        type: 'toggle',
        desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
    }, {
        id: 'toggle:auto_retaliate',
        name: '自动反击',
        type: 'toggle',
        desc: '控制被攻击时是否自动开战。',
    }, {
        id: 'toggle:auto_battle_stationary',
        name: '原地战斗',
        type: 'toggle',
        desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
    }, {
        id: 'toggle:allow_aoe_player_hit',
        name: '全体攻击',
        type: 'toggle',
        desc: '控制群体攻击是否会误伤其他玩家。',
    }, {
        id: 'toggle:auto_idle_cultivation',
        name: '闲置自动修炼',
        type: 'toggle',
        desc: '控制角色闲置一段时间后是否自动开始修炼。',
    }, {
        id: 'cultivation:toggle',
        name: '当前修炼',
        type: 'toggle',
        desc: '切换当前主修功法的修炼状态。',
    }, {
        id: 'toggle:auto_switch_cultivation',
        name: '修满自动切换',
        type: 'toggle',
        desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
    }, {
        id: 'sense_qi:toggle',
        name: '感气视角',
        type: 'toggle',
        desc: '切换感气视角，观察地块灵气层次与变化。',
    }];

let WorldRuntimeService = WorldRuntimeService_1 = class WorldRuntimeService {
    contentTemplateRepository;
    templateRepository;
    mapPersistenceService;
    playerRuntimeService;
    playerCombatService;
    worldSessionService;
    worldClientEventService;
    redeemCodeRuntimeService;
    craftPanelRuntimeService;
    logger = new common_1.Logger(WorldRuntimeService_1.name);
    instances = new Map();
    playerLocations = new Map();
    pendingCommands = new Map();
    pendingSystemCommands = [];
    pendingRespawnPlayerIds = new Set();
    navigationIntents = new Map();
    tick = 0;
    lastTickDurationMs = 0;
    lastSyncFlushDurationMs = 0;
    lastTickPhaseDurations = {
        pendingCommandsMs: 0,
        systemCommandsMs: 0,
        instanceTicksMs: 0,
        transfersMs: 0,
        monsterActionsMs: 0,
        playerAdvanceMs: 0,
    };
    tickDurationHistoryMs = [];
    syncFlushDurationHistoryMs = [];
    instanceTickProgressById = new Map();
    containerStatesByInstanceId = new Map();
    dirtyContainerPersistenceInstanceIds = new Set();
    latestCombatEffectsByInstanceId = new Map();
    nextGmBotSequence = 1;
    constructor(contentTemplateRepository, templateRepository, mapPersistenceService, playerRuntimeService, playerCombatService, worldSessionService, worldClientEventService, redeemCodeRuntimeService, craftPanelRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.mapPersistenceService = mapPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
    }
    /** onModuleInit：初始化公共实例的基础结构。 */
    async onModuleInit() {
        this.bootstrapPublicInstances();
    }
    /** onApplicationBootstrap：在应用启动后重建持久化相关运行态。 */
    async onApplicationBootstrap() {
        await this.rebuildPersistentRuntimeAfterRestore();
    }
    /** listMapTemplates：列出地图模板。 */
    listMapTemplates() {
        return this.templateRepository.listSummaries();
    }
    /** listInstances：列出实例。 */
    listInstances() {
        return Array.from(this.instances.values(), (instance) => instance.snapshot());
    }
    /** getInstance：读取指定实例。 */
    getInstance(instanceId) {
        return this.instances.get(instanceId)?.snapshot() ?? null;
    }
    /** listInstanceMonsters：列出实例妖兽。 */
    listInstanceMonsters(instanceId) {
        return this.getInstanceRuntimeOrThrow(instanceId).listMonsters();
    }
    /** getInstanceMonster：读取实例中的单只妖兽。 */
    getInstanceMonster(instanceId, runtimeId) {
        return this.getInstanceRuntimeOrThrow(instanceId).getMonster(runtimeId);
    }
    /** getInstanceTileState：读取实例地块状态。 */
    getInstanceTileState(instanceId, x, y) {

        const instance = this.instances.get(instanceId);
        if (!instance) {
            return null;
        }

        const aura = instance.getTileAura(x, y);
        if (aura === null) {
            return null;
        }
        return {
            aura,
            safeZone: instance.getSafeZoneAtTile(x, y),
            container: instance.getContainerAtTile(x, y),
            groundPile: instance.getTileGroundPile(x, y),
            combat: instance.getTileCombatState(x, y),
        };
    }
    /** getLegacyCombatEffects：读取旧版战斗效果。 */
    getLegacyCombatEffects(instanceId) {

        const effects = this.latestCombatEffectsByInstanceId.get(instanceId);
        return effects ? effects.map((entry) => cloneCombatEffect(entry)) : [];
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    connectPlayer(input) {

        const playerId = input.playerId.trim();
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }

        const mapId = input.mapId?.trim() || this.resolveDefaultRespawnMapId();
        if (!mapId) {
            throw new common_1.NotFoundException('No map template available');
        }

        const sessionId = input.sessionId?.trim() || `session:${playerId}`;

        const targetInstance = this.getOrCreatePublicInstance(mapId);

        const previous = this.playerLocations.get(playerId);
        if (previous && previous.instanceId !== targetInstance.meta.instanceId) {
            this.instances.get(previous.instanceId)?.disconnectPlayer(playerId);
        }

        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId,
            preferredX: input.preferredX,
            preferredY: input.preferredY,
        });

        const playerState = this.playerRuntimeService.ensurePlayer(playerId, sessionId);
        targetInstance.setPlayerMoveSpeed(playerId, playerState.attrs.numericStats.moveSpeed);
        this.playerLocations.set(playerId, {
            instanceId: targetInstance.meta.instanceId,
            sessionId: runtimePlayer.sessionId,
        });
        this.pendingRespawnPlayerIds.delete(playerId);
        this.logger.debug(`玩家 ${playerId} 已附着到实例 ${targetInstance.meta.instanceId}`);
        return this.getPlayerViewOrThrow(playerId);
    }
    /** disconnectPlayer：断开玩家与实例的挂接，并清理相关排队状态。 */
    disconnectPlayer(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return false;
        }
        this.navigationIntents.delete(playerId);
        this.pendingCommands.delete(playerId);
        this.pendingRespawnPlayerIds.delete(playerId);

        const disconnected = this.instances.get(location.instanceId)?.disconnectPlayer(playerId) ?? false;
        this.playerLocations.delete(playerId);
        return disconnected;
    }
    /** removePlayer：注销玩家运行态，先清会话再断开实例。 */
    removePlayer(playerId, reason = 'removed') {

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        this.worldSessionService.purgePlayerSession(normalizedPlayerId, reason);
        this.navigationIntents.delete(normalizedPlayerId);
        this.pendingCommands.delete(normalizedPlayerId);
        this.pendingRespawnPlayerIds.delete(normalizedPlayerId);

        const disconnected = this.disconnectPlayer(normalizedPlayerId);

        const runtimePlayer = this.playerRuntimeService.getPlayer(normalizedPlayerId);
        if (!runtimePlayer) {
            return disconnected;
        }
        this.playerRuntimeService.removePlayerRuntime(normalizedPlayerId);
        return true;
    }
    /** enqueueMove：把方向移动请求排入下一次 tick 统一执行。 */
    enqueueMove(playerId, directionInput) {

        const direction = parseDirection(directionInput);
        this.getPlayerLocationOrThrow(playerId);

        const player = this.playerRuntimeService.getPlayer(playerId);
        this.navigationIntents.delete(playerId);
        this.interruptManualNavigation(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'move',
            direction,
            continuous: true,
            resetBudget: true,
        });
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.enqueue.move', {
            playerId,
            direction,
            from: player
                ? {
                    mapId: player.templateId,
                    x: player.x,
                    y: player.y,
                }
                : null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueMoveTo：把点位导航请求排入下一次 tick 统一执行。 */
    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const x = normalizeCoordinate(xInput, 'x');

        const y = normalizeCoordinate(yInput, 'y');
        if (!isInBounds(x, y, instance.template.width, instance.template.height)) {
            throw new common_1.BadRequestException('目标超出地图范围');
        }

        const player = this.playerRuntimeService.getPlayer(playerId);
        this.interruptManualNavigation(playerId);

        const clientPathHint = decodeClientPathHint(packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput);
        this.pendingCommands.set(playerId, {
            kind: 'moveTo',
            x,
            y,

            allowNearestReachable: allowNearestReachableInput === true,
            clientPathHint,
        });
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.enqueue.moveTo', {
            playerId,
            from: player
                ? {
                    mapId: player.templateId,
                    x: player.x,
                    y: player.y,
                }
                : null,
            target: {
                mapId: instance.template.mapId,
                x,
                y,
            },

            allowNearestReachable: allowNearestReachableInput === true,
            clientPathHint: clientPathHint
                ? {
                    startX: clientPathHint.startX,
                    startY: clientPathHint.startY,
                    points: clientPathHint.points,
                }
                : null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** usePortal：把当前站位的传送请求排入下一次 tick。 */
    usePortal(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.navigationIntents.delete(playerId);
        this.interruptManualNavigation(playerId);
        this.pendingCommands.set(playerId, { kind: 'portal' });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** navigateQuest：记录任务导航意图，供后续 tick 续跑路径。 */
    navigateQuest(playerId, questIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.interruptManualNavigation(playerId);

        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!questId) {
            throw new common_1.BadRequestException('questId is required');
        }
        this.navigationIntents.set(playerId, {
            kind: 'quest',
            questId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueBasicAttack：把排队Basic攻击请求排入下一次 tick。 */
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.interruptManualCombat(playerId);

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const hasTileTarget = Number.isFinite(targetXInput) && Number.isFinite(targetYInput);
        if (!targetPlayerId && !targetMonsterId && !hasTileTarget) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'basicAttack',
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetX: hasTileTarget ? normalizeCoordinate(targetXInput ?? Number.NaN, 'x') : null,
            targetY: hasTileTarget ? normalizeCoordinate(targetYInput ?? Number.NaN, 'y') : null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueBattleTarget：把排队战斗目标请求排入下一次 tick。 */
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.interruptManualCombat(playerId);

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const hasTileTarget = Number.isFinite(targetXInput) && Number.isFinite(targetYInput);
        if (!targetPlayerId && !targetMonsterId && !hasTileTarget) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'engageBattle',
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetX: hasTileTarget ? normalizeCoordinate(targetXInput ?? Number.NaN, 'x') : null,
            targetY: hasTileTarget ? normalizeCoordinate(targetYInput ?? Number.NaN, 'y') : null,
            locked,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** executeAction：根据动作 ID 分流到交互、战斗、修炼或传送流程。 */
    executeAction(playerId, actionIdInput, targetInput) {
        this.getPlayerLocationOrThrow(playerId);

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);

        const rawActionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!rawActionId) {
            throw new common_1.BadRequestException('actionId is required');
        }
        if (rawActionId.startsWith('npc:')) {
            return this.executeLegacyNpcAction(playerId, rawActionId.slice('npc:'.length));
        }

        const actionId = normalizeRuntimeActionId(rawActionId);
        if (actionId === 'portal:travel') {
            return {
                kind: 'queued',
                view: this.usePortal(playerId),
            };
        }
        if (actionId === 'realm:breakthrough') {
            this.pendingCommands.set(playerId, {
                kind: 'breakthrough',
            });
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'body_training:infuse') {

            const target = typeof targetInput === 'string' ? targetInput.trim() : '';

            const foundationAmount = Number.parseInt(target, 10);
            if (!Number.isFinite(foundationAmount) || foundationAmount <= 0) {
                throw new common_1.BadRequestException('foundation amount is required');
            }

            const result = this.playerRuntimeService.infuseBodyTraining(playerId, foundationAmount);
            this.queuePlayerNotice(playerId, `你将 ${result.foundationSpent} 点底蕴灌入肉身，转化为 ${result.expGained} 点炼体经验`, 'success');
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_battle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattle: !player.combat.autoBattle,
            }, currentTick);
            return {
                kind: 'queued',
                view: this.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_retaliate') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoRetaliate: !player.combat.autoRetaliate,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_battle_stationary') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattleStationary: !player.combat.autoBattleStationary,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:allow_aoe_player_hit') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                allowAoePlayerHit: !player.combat.allowAoePlayerHit,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_idle_cultivation') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoIdleCultivation: !player.combat.autoIdleCultivation,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'cultivation:toggle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (!player.techniques.cultivatingTechId) {
                throw new common_1.BadRequestException('当前没有主修功法');
            }

            const nextActive = !player.combat.cultivationActive;
            this.playerRuntimeService.cultivateTechnique(playerId, nextActive ? player.techniques.cultivatingTechId : null);
            this.queuePlayerNotice(playerId, nextActive ? '已恢复当前修炼' : '已停止当前修炼', 'info');
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_switch_cultivation') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoSwitchCultivation: !player.combat.autoSwitchCultivation,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'sense_qi:toggle') {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                senseQiActive: !player.combat.senseQiActive,
            }, currentTick);
            return { kind: 'queued', view: this.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('npc_shop:')) {
            return {
                kind: 'npcShop',
                npcShop: this.buildNpcShopView(playerId, actionId.slice('npc_shop:'.length)),
            };
        }
        if (actionId.startsWith('npc_quests:')) {

            const npcId = actionId.slice('npc_quests:'.length);
            this.pendingCommands.set(playerId, {
                kind: 'interactNpcQuest',
                npcId,
            });
            return {
                kind: 'npcQuests',
                npcQuests: this.buildNpcQuestsView(playerId, npcId),
            };
        }
        throw new common_1.BadRequestException(`Unsupported actionId: ${actionId}`);
    }
    /** executeLegacyNpcAction：兼容旧版 NPC 交互入口，自动转成任务或对话命令。 */
    executeLegacyNpcAction(playerId, npcId) {

        const questsView = this.buildNpcQuestsView(playerId, npcId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const readyQuest = questsView.quests.find((entry) => entry.status === 'ready' && entry.submitNpcId === npcId);
        if (readyQuest) {
            this.pendingCommands.set(playerId, {
                kind: 'submitNpcQuest',
                npcId,
                questId: readyQuest.id,
            });
            return {
                kind: 'npcQuests',
                npcQuests: questsView,
            };
        }

        const availableQuest = questsView.quests.find((entry) => entry.status === 'available');
        if (availableQuest) {
            this.pendingCommands.set(playerId, {
                kind: 'acceptNpcQuest',
                npcId,
                questId: availableQuest.id,
            });
            return {
                kind: 'npcQuests',
                npcQuests: questsView,
            };
        }

        const talkQuest = questsView.quests.find((entry) => (entry.status === 'active'
            && entry.objectiveType === 'talk'
            && entry.targetNpcId === npcId
            && (!entry.targetMapId || entry.targetMapId === player.templateId)));
        if (talkQuest) {
            this.pendingCommands.set(playerId, {
                kind: 'interactNpcQuest',
                npcId,
            });
        }
        return {
            kind: 'npcQuests',
            npcQuests: questsView,
        };
    }
    /** enqueueUseItem：把排队使用物品请求排入下一次 tick。 */
    enqueueUseItem(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'useItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueDropItem：把排队丢弃物品请求排入下一次 tick。 */
    enqueueDropItem(playerId, slotIndexInput, countInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'dropItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
            count: normalizePositiveCount(countInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueTakeGround：把排队拿取地面请求排入下一次 tick。 */
    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput) {
        this.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';

        const itemKey = typeof itemKeyInput === 'string' ? itemKeyInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        if (!itemKey) {
            throw new common_1.BadRequestException('itemKey is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'takeGround',
            sourceId,
            itemKey,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueTakeGroundAll：把排队拿取地面All请求排入下一次 tick。 */
    enqueueTakeGroundAll(playerId, sourceIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'takeGroundAll',
            sourceId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueEquip：把排队装备请求排入下一次 tick。 */
    enqueueEquip(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'equip',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueUnequip：把排队卸下请求排入下一次 tick。 */
    enqueueUnequip(playerId, slotInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCultivate：把排队Cultivate请求排入下一次 tick。 */
    enqueueCultivate(playerId, techniqueIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cultivate',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueStartAlchemy：把排队StartAlchemy请求排入下一次 tick。 */
    enqueueStartAlchemy(playerId, payload) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'startAlchemy',
            payload: payload && typeof payload === 'object'
                ? {
                    ...payload,
                    ingredients: Array.isArray(payload.ingredients)
                        ? payload.ingredients.map((entry) => ({ ...entry }))
                        : [],
                }
                : {},
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCancelAlchemy：把排队取消Alchemy请求排入下一次 tick。 */
    enqueueCancelAlchemy(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cancelAlchemy',
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueStartEnhancement：把排队StartEnhancement请求排入下一次 tick。 */
    enqueueStartEnhancement(playerId, payload) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'startEnhancement',
            payload: payload && typeof payload === 'object'
                ? {
                    ...payload,
                    target: payload.target && typeof payload.target === 'object'
                        ? { ...payload.target }
                        : payload.target,
                    protection: payload.protection && typeof payload.protection === 'object'
                        ? { ...payload.protection }
                        : payload.protection,
                }
                : {},
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCancelEnhancement：把排队取消Enhancement请求排入下一次 tick。 */
    enqueueCancelEnhancement(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cancelEnhancement',
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueRedeemCodes：把排队RedeemCodes请求排入下一次 tick。 */
    enqueueRedeemCodes(playerId, codesInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'redeemCodes',
            codes: Array.isArray(codesInput) ? codesInput.filter((entry) => typeof entry === 'string') : [],
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueHeavenGateAction：把排队天门关卡动作请求排入下一次 tick。 */
    enqueueHeavenGateAction(playerId, actionInput, elementInput) {
        this.getPlayerLocationOrThrow(playerId);

        const action = typeof actionInput === 'string' ? actionInput.trim() : '';
        if (action !== 'sever' && action !== 'restore' && action !== 'open' && action !== 'reroll' && action !== 'enter') {
            throw new common_1.BadRequestException('heaven gate action is required');
        }

        const element = typeof elementInput === 'string' ? elementInput.trim() : '';
        this.pendingCommands.set(playerId, {
            kind: 'heavenGateAction',
            action,

            element: element === 'metal' || element === 'wood' || element === 'water' || element === 'fire' || element === 'earth'
                ? element
                : undefined,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCastSkill：把排队CastSkill请求排入下一次 tick。 */
    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput = null) {
        this.getPlayerLocationOrThrow(playerId);

        const skillId = typeof skillIdInput === 'string' ? skillIdInput.trim() : '';

        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';

        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';

        const targetRef = typeof targetRefInput === 'string' ? targetRefInput.trim() : '';
        if (!skillId) {
            throw new common_1.BadRequestException('skillId is required');
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const action = player.actions.actions.find((entry) => entry.id === skillId && entry.type === 'skill');
        if (!action) {
            throw new common_1.NotFoundException(`Skill action ${skillId} not found`);
        }
        if (!targetPlayerId && !targetMonsterId && !targetRef && action.requiresTarget !== false) {
            throw new common_1.BadRequestException('target is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'castSkill',
            skillId,
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetRef: targetRef || null,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueCastSkillTargetRef：把排队CastSkill目标Ref请求排入下一次 tick。 */
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) {
        return this.enqueueCastSkill(playerId, skillIdInput, null, null, targetRefInput);
    }
    /** buildNpcShopView：构建当前 NPC 的商店视图。 */
    buildNpcShopView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        return this.createNpcShopEnvelope(playerId, npcId);
    }
    /** buildQuestListView：构建玩家任务列表视图。 */
    buildQuestListView(playerId, _input) {
        this.getPlayerLocationOrThrow(playerId);
        this.refreshQuestStates(playerId);
        return {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
    }
    /** buildNpcQuestsView：构建当前 NPC 相关的任务视图。 */
    buildNpcQuestsView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        this.refreshQuestStates(playerId);
        return this.createNpcQuestsEnvelope(playerId, npcId);
    }
    /** buildDetail：构建目标详情，要求目标必须在当前视野内。 */
    buildDetail(playerId, input) {
        this.getPlayerLocationOrThrow(playerId);

        const kind = input.kind;

        const id = typeof input.id === 'string' ? input.id.trim() : '';
        if (!id) {
            throw new common_1.BadRequestException('id is required');
        }
        if (kind !== 'npc' && kind !== 'monster' && kind !== 'ground' && kind !== 'player' && kind !== 'portal' && kind !== 'container') {
            throw new common_1.BadRequestException(`Unsupported detail kind: ${String(kind)}`);
        }

        const view = this.getPlayerViewOrThrow(playerId);

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const viewer = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (kind === 'npc') {
            if (!view.localNpcs.some((entry) => entry.npcId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const npc = instance.getNpc(id);
            if (!npc) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                npc: {
                    id: npc.npcId,
                    name: npc.name,
                    char: npc.char,
                    color: npc.color,
                    x: npc.x,
                    y: npc.y,
                    dialogue: npc.dialogue,
                    role: npc.role ?? undefined,
                    hasShop: npc.hasShop ? 1 : undefined,
                    questCount: npc.quests.length > 0 ? npc.quests.length : undefined,
                    questMarker: view.localNpcs.find((entry) => entry.npcId === npc.npcId)?.questMarker,
                    observation: buildNpcObservation(npc),
                },
            };
        }
        if (kind === 'monster') {
            if (!view.localMonsters.some((entry) => entry.runtimeId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const monster = instance.getMonster(id);
            if (!monster) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                monster: {
                    id: monster.runtimeId,
                    mid: monster.monsterId,
                    name: monster.name,
                    char: monster.char,
                    color: monster.color,
                    x: monster.x,
                    y: monster.y,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    level: monster.level,
                    tier: monster.tier,
                    alive: monster.alive,
                    respawnTicks: monster.respawnTicks,
                    observation: buildMonsterObservation(viewer.attrs.finalAttrs.spirit, monster),
                    buffs: monster.buffs.map((entry) => cloneVisibleBuff(entry)),
                },
            };
        }
        if (kind === 'player') {
            if (id !== viewer.playerId && !view.visiblePlayers.some((entry) => entry.playerId === id)) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const target = this.playerRuntimeService.getPlayer(id);
            if (!target || target.instanceId !== location.instanceId) {
                return { kind, id, error: '目标不存在' };
            }
            return {
                kind,
                id,
                player: {
                    id: target.playerId,
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    maxHp: target.maxHp,
                    qi: target.qi,
                    maxQi: target.maxQi,

                    observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                    buffs: target.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
                },
            };
        }
        if (kind === 'portal') {

            const portal = view.localPortals.find((entry) => buildPortalId(entry.x, entry.y) === id);
            if (!portal) {
                return { kind, id, error: '目标不在当前视野内' };
            }

            const targetMapName = this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : undefined;
            return {
                kind,
                id,
                portal: {
                    id,
                    x: portal.x,
                    y: portal.y,
                    kind: portal.kind,
                    targetMapId: portal.targetMapId,
                    targetMapName,
                    targetX: portal.targetX,
                    targetY: portal.targetY,
                    trigger: portal.trigger,
                },
            };
        }
        if (kind === 'container') {

            const containerId = id.startsWith('container:') ? id.slice('container:'.length).trim() : '';
            if (!containerId) {
                return { kind, id, error: '目标不存在' };
            }

            const container = instance.getContainerById(containerId);

            const viewRadius = Math.max(1, Math.round(viewer.attrs.numericStats.viewRange));
            if (!container || !isTileVisibleInView(view, container.x, container.y, viewRadius)) {
                return { kind, id, error: '目标不在当前视野内' };
            }
            return {
                kind,
                id,
                container: {
                    id,
                    name: container.name,
                    x: container.x,
                    y: container.y,
                    grade: container.grade,
                    desc: container.desc?.trim() || undefined,
                },
            };
        }
        if (!view.localGroundPiles.some((entry) => entry.sourceId === id)) {
            return { kind, id, error: '目标不在当前视野内' };
        }

        const pile = instance.getGroundPileBySourceId(id);
        if (!pile) {
            return { kind, id, error: '目标不存在' };
        }
        return {
            kind,
            id,
            ground: {
                sourceId: pile.sourceId,
                x: pile.x,
                y: pile.y,
                items: pile.items.map((entry) => ({ ...entry.item })),
            },
        };
    }
    /** buildTileDetail：构建指定地块的详情，汇总实体、灵气和战斗状态。 */
    buildTileDetail(playerId, input) {
        this.getPlayerLocationOrThrow(playerId);

        const x = normalizeCoordinate(typeof input.x === 'number' ? input.x : Number.NaN, 'x');

        const y = normalizeCoordinate(typeof input.y === 'number' ? input.y : Number.NaN, 'y');

        const view = this.getPlayerViewOrThrow(playerId);

        const viewer = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const viewRadius = Math.max(1, Math.round(viewer.attrs.numericStats.viewRange));
        if (!isTileVisibleInView(view, x, y, viewRadius)) {
            return {
                x,
                y,
                error: '目标不在当前视野内',
            };
        }

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const aura = instance.getTileAura(x, y);
        if (aura === null) {
            return {
                x,
                y,
                error: '目标不存在',
            };
        }

        const groundPile = instance.getTileGroundPile(x, y);

        const portal = instance.getPortalAtTile(x, y);

        const safeZone = instance.getSafeZoneAtTile(x, y);

        const container = instance.getContainerAtTile(x, y);

        const npcs = view.localNpcs.filter((entry) => entry.x === x && entry.y === y);

        const monsters = view.localMonsters.filter((entry) => entry.x === x && entry.y === y);

        const players = [
            ...(view.self.x === x && view.self.y === y ? [viewer.playerId] : []),
            ...view.visiblePlayers.filter((entry) => entry.x === x && entry.y === y).map((entry) => entry.playerId),
        ];

        const entities = [];
        if (portal) {
            entities.push(buildPortalTileEntityDetail(portal, this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : undefined));
        }
        if (container) {
            entities.push(buildContainerTileEntityDetail(container));
        }
        if (groundPile) {
            entities.push(buildGroundTileEntityDetail(groundPile));
        }
        for (const targetPlayerId of players) {
            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.instanceId !== location.instanceId) {
                continue;
            }
            entities.push({
                id: target.playerId,
                name: target.name,
                kind: 'player',
                hp: target.hp,
                maxHp: target.maxHp,
                qi: target.qi,
                maxQi: target.maxQi,

                observation: buildPlayerObservation(viewer.attrs.finalAttrs.spirit, target, viewer.playerId === target.playerId),
                buffs: target.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
            });
        }
        for (const monsterView of monsters) {
            const monster = instance.getMonster(monsterView.runtimeId);
            if (!monster) {
                continue;
            }

            const observation = buildMonsterObservation(viewer.attrs.finalAttrs.spirit, monster);
            entities.push({
                id: monster.runtimeId,
                name: monster.name,
                kind: 'monster',
                monsterTier: monster.tier,
                hp: monster.hp,
                maxHp: monster.maxHp,
                observation,

                lootPreview: observation.clarity === 'complete'
                    ? buildMonsterLootPreview(this.contentTemplateRepository, viewer, monster)
                    : undefined,
                buffs: monster.buffs.map((entry) => cloneVisibleBuff(entry)),
            });
        }
        for (const npcView of npcs) {
            const npc = instance.getNpc(npcView.npcId);
            if (!npc) {
                continue;
            }
            entities.push({
                id: npc.npcId,
                name: npc.name,
                kind: 'npc',
                npcQuestMarker: npcView.questMarker ?? null,
                observation: buildNpcObservation(npc),
            });
        }
        return {
            x,
            y,
            aura,
            safeZone: safeZone
                ? {
                    x: safeZone.x,
                    y: safeZone.y,
                    radius: safeZone.radius,
                }
                : undefined,
            portal: portal
                ? {
                    id: buildPortalId(portal.x, portal.y),
                    x: portal.x,
                    y: portal.y,
                    kind: portal.kind,
                    targetMapId: portal.targetMapId,
                    targetMapName: this.templateRepository.has(portal.targetMapId)
                        ? this.templateRepository.getOrThrow(portal.targetMapId).name
                        : undefined,
                    targetX: portal.targetX,
                    targetY: portal.targetY,
                    trigger: portal.trigger,
                }
                : undefined,
            ground: groundPile
                ? {
                    sourceId: groundPile.sourceId,
                    x: groundPile.x,
                    y: groundPile.y,
                    items: groundPile.items.map((entry) => ({ ...entry })),
                }
                : undefined,
            entities: entities.length > 0 ? entities : undefined,
        };
    }
    /** buildLootWindowSyncState：构建拿取窗口同步状态，供前端按需增量刷新。 */
    buildLootWindowSyncState(playerId, tileX, tileY) {

        const player = this.playerRuntimeService.getPlayer(playerId);

        const view = this.getPlayerView(playerId);
        if (!player || !view || !player.instanceId) {
            return null;
        }
        if (Math.max(Math.abs(player.x - tileX), Math.abs(player.y - tileY)) > 1) {
            return null;
        }

        const instance = this.getInstanceRuntimeOrThrow(player.instanceId);

        const sources = [];

        const groundSources = view.localGroundPiles
            .filter((entry) => entry.x === tileX && entry.y === tileY && entry.items.length > 0)
            .sort((left, right) => compareStableStrings(left.sourceId, right.sourceId));
        for (const [index, pile] of groundSources.entries()) {
            sources.push({
                sourceId: pile.sourceId,
                kind: 'ground',

                title: index === 0 ? '地面物品' : `地面物品 ${index + 1}`,
                searchable: false,
                items: pile.items.map((entry) => ({
                    itemKey: entry.itemKey,
                    item: {
                        itemId: entry.itemId,
                        count: entry.count,
                        name: entry.name,
                        type: entry.type,
                        grade: entry.grade,
                        groundLabel: entry.groundLabel,
                    },
                })),
                emptyText: '地面上已经没有东西了。',
            });
        }

        const container = instance.getContainerAtTile(tileX, tileY);
        if (container) {

            const containerState = this.ensureContainerState(instance.meta.instanceId, container);
            if (!containerState.activeSearch && hasHiddenContainerEntries(containerState.entries)) {
                this.beginContainerSearch(containerState, container.grade);
                this.markContainerPersistenceDirty(instance.meta.instanceId);
            }
            sources.push({
                sourceId: containerState.sourceId,
                kind: 'container',
                title: container.name,
                desc: container.desc,
                grade: container.grade,
                searchable: true,
                search: containerState.activeSearch
                    ? {
                        totalTicks: containerState.activeSearch.totalTicks,
                        remainingTicks: containerState.activeSearch.remainingTicks,
                        elapsedTicks: containerState.activeSearch.totalTicks - containerState.activeSearch.remainingTicks,
                    }
                    : undefined,
                items: buildContainerWindowItems(containerState.entries),
                emptyText: hasHiddenContainerEntries(containerState.entries)
                    ? '正在翻找，每完成一轮搜索会显露一件物品。'
                    : '容器里已经空了。',
            });
        }
        if (sources.length === 0) {
            return null;
        }
        return {
            tileX,
            tileY,
            title: `拿取 · (${tileX}, ${tileY})`,
            sources,
        };
    }
    /** refreshPlayerContextActions：根据当前视野和角色状态刷新上下文动作。 */
    refreshPlayerContextActions(playerId, view) {

        const resolvedView = view ?? this.getPlayerView(playerId);
        if (!resolvedView) {
            return null;
        }
        this.playerRuntimeService.setContextActions(playerId, this.buildContextActions(resolvedView), resolvedView.tick);
        return resolvedView;
    }
    /** enqueueBuyNpcShopItem：把 NPC 商店购买请求排入下一次 tick。 */
    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';

        const itemId = typeof itemIdInput === 'string' ? itemIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!itemId) {
            throw new common_1.BadRequestException('itemId is required');
        }

        const quantity = normalizeShopQuantity(quantityInput);
        this.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        this.pendingCommands.set(playerId, {
            kind: 'buyNpcShopItem',
            npcId,
            itemId,
            quantity,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueNpcInteraction：把 NPC 交互请求排入下一次 tick。 */
    enqueueNpcInteraction(playerId, actionIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!actionId.startsWith('npc:')) {
            throw new common_1.BadRequestException('npc actionId is required');
        }

        const npcId = actionId.slice('npc:'.length).trim();
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'npcInteraction',
            npcId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueLegacyNpcInteraction：兼容旧版 NPC 交互入口。 */
    enqueueLegacyNpcInteraction(playerId, actionIdInput) {
        return this.enqueueNpcInteraction(playerId, actionIdInput);
    }
    /** enqueueAcceptNpcQuest：把 NPC 任务接取请求排入下一次 tick。 */
    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';

        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!questId) {
            throw new common_1.BadRequestException('questId is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'acceptNpcQuest',
            npcId,
            questId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueSubmitNpcQuest：把 NPC 任务提交请求排入下一次 tick。 */
    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput) {
        this.getPlayerLocationOrThrow(playerId);

        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';

        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!questId) {
            throw new common_1.BadRequestException('questId is required');
        }
        this.pendingCommands.set(playerId, {
            kind: 'submitNpcQuest',
            npcId,
            questId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    /** enqueueSpawnMonsterLoot：把妖兽掉落生成请求排入系统命令队列。 */
    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const monsterId = typeof monsterIdInput === 'string' ? monsterIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!monsterId) {
            throw new common_1.BadRequestException('monsterId is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        this.pendingSystemCommands.push({
            kind: 'spawnMonsterLoot',
            instanceId,
            monsterId,
            x: normalizeCoordinate(xInput, 'x'),
            y: normalizeCoordinate(yInput, 'y'),
            rolls: normalizeRollCount(rollsInput),
        });
        return { queued: true };
    }
    /** enqueueDefeatMonster：把妖兽击败请求排入系统命令队列。 */
    enqueueDefeatMonster(instanceIdInput, runtimeIdInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        this.pendingSystemCommands.push({
            kind: 'defeatMonster',
            instanceId,
            runtimeId,
        });
        return { queued: true };
    }
    /** enqueueDamageMonster：把妖兽受伤请求排入系统命令队列。 */
    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput) {

        const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';

        const runtimeId = typeof runtimeIdInput === 'string' ? runtimeIdInput.trim() : '';
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        if (!runtimeId) {
            throw new common_1.BadRequestException('runtimeId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
        }
        this.getInstanceRuntimeOrThrow(instanceId);
        this.pendingSystemCommands.push({
            kind: 'damageMonster',
            instanceId,
            runtimeId,
            amount,
        });
        return { queued: true };
    }
    /** enqueueDamagePlayer：把玩家受伤请求排入系统命令队列。 */
    enqueueDamagePlayer(playerIdInput, amountInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }

        const amount = Math.max(1, Math.trunc(amountInput));
        if (!Number.isFinite(amount)) {
            throw new common_1.BadRequestException('amount is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        this.pendingSystemCommands.push({
            kind: 'damagePlayer',
            playerId,
            amount,
        });
        return { queued: true };
    }
    /** enqueueRespawnPlayer：把玩家复生请求排入系统命令队列。 */
    enqueueRespawnPlayer(playerIdInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        this.pendingSystemCommands.push({
            kind: 'respawnPlayer',
            playerId,
        });
        return { queued: true };
    }
    /** enqueueResetPlayerSpawn：把玩家重置出生点请求排入系统命令队列。 */
    enqueueResetPlayerSpawn(playerIdInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.getPlayerLocationOrThrow(playerId);
        this.pendingSystemCommands.push({
            kind: 'resetPlayerSpawn',
            playerId,
        });
        return { queued: true };
    }
    /** enqueueGmUpdatePlayer：把 GM 更新玩家请求排入系统命令队列。 */
    enqueueGmUpdatePlayer(input) {
        const playerId = typeof input?.playerId === 'string' ? input.playerId.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'gmUpdatePlayer',
            playerId,

            mapId: typeof input?.mapId === 'string' ? input.mapId.trim() : '',
            x: Number.isFinite(input?.x) ? Math.trunc(input.x) : undefined,
            y: Number.isFinite(input?.y) ? Math.trunc(input.y) : undefined,
            hp: Number.isFinite(input?.hp) ? Math.trunc(input.hp) : undefined,

            autoBattle: typeof input?.autoBattle === 'boolean' ? input.autoBattle : undefined,
        });
        return { queued: true };
    }
    /** enqueueLegacyGmUpdatePlayer：兼容旧版 GM 更新玩家入口。 */
    enqueueLegacyGmUpdatePlayer(input) {
        return this.enqueueGmUpdatePlayer(input);
    }
    /** enqueueGmResetPlayer：把 GM 重置玩家请求排入系统命令队列。 */
    enqueueGmResetPlayer(playerIdInput) {

        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'gmResetPlayer',
            playerId,
        });
        return { queued: true };
    }
    /** enqueueLegacyGmResetPlayer：兼容旧版 GM 重置玩家入口。 */
    enqueueLegacyGmResetPlayer(playerIdInput) {
        return this.enqueueGmResetPlayer(playerIdInput);
    }
    /** enqueueGmSpawnBots：把 GM 生成机器人请求排入系统命令队列。 */
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {

        const anchorPlayerId = typeof anchorPlayerIdInput === 'string' ? anchorPlayerIdInput.trim() : '';
        if (!anchorPlayerId) {
            throw new common_1.BadRequestException('anchorPlayerId is required');
        }

        const count = Math.max(0, Math.min(200, Math.trunc(countInput)));
        if (!Number.isFinite(count) || count <= 0) {
            throw new common_1.BadRequestException('count must be greater than 0');
        }
        this.pendingSystemCommands.push({
            kind: 'gmSpawnBots',
            anchorPlayerId,
            count,
        });
        return { queued: true };
    }
    /** enqueueLegacyGmSpawnBots：兼容旧版 GM 生成机器人入口。 */
    enqueueLegacyGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    /** enqueueGmRemoveBots：把 GM 移除机器人请求排入系统命令队列。 */
    enqueueGmRemoveBots(playerIdsInput, allInput) {

        const playerIds = Array.isArray(playerIdsInput)
            ? playerIdsInput
                .filter((entry) => typeof entry === 'string')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
            : [];
        this.pendingSystemCommands.push({
            kind: 'gmRemoveBots',
            playerIds,

            all: allInput === true,
        });
        return { queued: true };
    }
    /** enqueueLegacyGmRemoveBots：兼容旧版 GM 移除机器人入口。 */
    enqueueLegacyGmRemoveBots(playerIdsInput, allInput) {
        return this.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
    /** getPlayerView：读取玩家当前视野快照，并补上 NPC 任务标记。 */
    getPlayerView(playerId, radius) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return null;
        }

        const derivedRadius = this.playerRuntimeService.getPlayer(playerId)?.attrs.numericStats.viewRange;

        const normalizedRadius = typeof derivedRadius === 'number' && Number.isFinite(derivedRadius)
            ? Math.max(1, Math.round(derivedRadius))
            : undefined;

        const effectiveRadius = radius ?? normalizedRadius;

        const view = this.instances.get(location.instanceId)?.buildPlayerView(playerId, effectiveRadius) ?? null;
        return view ? this.decoratePlayerViewNpcs(playerId, view) : null;
    }
    /** resolveCurrentTickForPlayerId：读取玩家所在实例的当前 tick。 */
    resolveCurrentTickForPlayerId(playerId) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return this.tick;
        }
        return this.instances.get(player.instanceId)?.tick ?? this.tick;
    }
    /** getLegacyNavigationPath：生成旧版导航预览路径，便于调试与兼容。 */
    getLegacyNavigationPath(playerId) {

        const intent = this.navigationIntents.get(playerId);
        if (!intent) {
            return [];
        }
        try {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

            const location = this.getPlayerLocationOrThrow(playerId);

            const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

            const destination = this.resolveNavigationDestination(playerId, intent);
            if (destination.mapId !== player.templateId) {

                const route = this.findMapRoute(player.templateId, destination.mapId);
                if (!route || route.length < 2) {
                    return [];
                }

                const nextMapId = route[1];

                const portal = selectNearestPortal(instance.template.portals, nextMapId, player.x, player.y);
                if (!portal || (portal.x === player.x && portal.y === player.y)) {
                    return [];
                }

                const path = findPathPointsOnMap(instance, player.playerId, player.x, player.y, [{
                        x: portal.x,
                        y: portal.y,
                    }]);
                return path ? path.map((entry) => [entry.x, entry.y]) : [];
            }
            if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
                return [];
            }

            const path = findPathPointsOnMap(instance, player.playerId, player.x, player.y, destination.goals);
            return path ? path.map((entry) => [entry.x, entry.y]) : [];
        }
        catch {
            return [];
        }
    }
    /** getRuntimeSummary：汇总世界 tick、实例和同步耗时信息。 */
    getRuntimeSummary() {

        /** instances：当前已加载的地图实例集合。 */
        const instances = this.listInstances();
        return {
            tick: this.tick,
            lastTickDurationMs: this.lastTickDurationMs,
            lastSyncFlushDurationMs: this.lastSyncFlushDurationMs,
            mapTemplateCount: this.templateRepository.list().length,
            instanceCount: instances.length,
            playerCount: this.playerLocations.size,
            pendingCommandCount: this.pendingCommands.size,
            pendingSystemCommandCount: this.pendingSystemCommands.length,
            tickPerf: {
                totalMs: summarizeDurations(this.lastTickDurationMs, this.tickDurationHistoryMs),
                syncFlushMs: summarizeDurations(this.lastSyncFlushDurationMs, this.syncFlushDurationHistoryMs),
                phases: this.lastTickPhaseDurations,
            },
            instances,
        };
    }
    /** listDirtyPersistentInstances：列出需要持久化刷新的实例。 */
    listDirtyPersistentInstances() {

        const dirty = new Set(this.dirtyContainerPersistenceInstanceIds);
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.meta.persistent && instance.isPersistentDirty()) {
                dirty.add(instanceId);
            }
        }
        return Array.from(dirty).sort(compareStableStrings);
    }
    /** buildMapPersistenceSnapshot：构建地图持久化快照。 */
    buildMapPersistenceSnapshot(instanceId) {

        const instance = this.instances.get(instanceId);
        if (!instance || !instance.meta.persistent) {
            return null;
        }
        return {
            version: 1,
            savedAt: Date.now(),
            templateId: instance.template.id,
            auraEntries: instance.buildAuraPersistenceEntries(),
            groundPileEntries: instance.buildGroundPersistenceEntries(),
            containerStates: this.buildContainerPersistenceStates(instanceId),
        };
    }
    /** markMapPersisted：标记地图快照已落盘。 */
    markMapPersisted(instanceId) {
        this.instances.get(instanceId)?.markAuraPersisted();
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }
    /** buildContainerPersistenceStates：导出容器持久化状态。 */
    buildContainerPersistenceStates(instanceId) {

        const containerStates = this.containerStatesByInstanceId.get(instanceId);
        if (!containerStates || containerStates.size === 0) {
            return [];
        }
        return Array.from(containerStates.values(), (state) => ({
            sourceId: state.sourceId,
            containerId: state.containerId,
            generatedAtTick: state.generatedAtTick,
            refreshAtTick: state.refreshAtTick,
            entries: state.entries.map((entry) => ({
                item: { ...entry.item },
                createdTick: entry.createdTick,
                visible: entry.visible,
            })),
            activeSearch: state.activeSearch
                ? {
                    itemKey: state.activeSearch.itemKey,
                    totalTicks: state.activeSearch.totalTicks,
                    remainingTicks: state.activeSearch.remainingTicks,
                }
                : undefined,
        })).sort((left, right) => compareStableStrings(left.sourceId, right.sourceId));
    }
    /** hydrateContainerStates：用持久化数据回填容器状态。 */
    hydrateContainerStates(instanceId, entries) {
        if (entries.length === 0) {
            this.containerStatesByInstanceId.delete(instanceId);
            this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
            return;
        }

        const next = new Map();
        for (const entry of entries) {
            next.set(entry.sourceId, {
                sourceId: entry.sourceId,
                containerId: entry.containerId,
                generatedAtTick: entry.generatedAtTick,
                refreshAtTick: entry.refreshAtTick,
                entries: entry.entries.map((item) => ({
                    item: { ...item.item },
                    createdTick: item.createdTick,
                    visible: item.visible,
                })),
                activeSearch: entry.activeSearch
                    ? {
                        itemKey: entry.activeSearch.itemKey,
                        totalTicks: entry.activeSearch.totalTicks,
                        remainingTicks: entry.activeSearch.remainingTicks,
                    }
                    : undefined,
            });
        }
        this.containerStatesByInstanceId.set(instanceId, next);
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }
    /** ensureContainerState：确保容器运行时状态已创建并刷新到当前 tick。 */
    ensureContainerState(instanceId, container) {

        let states = this.containerStatesByInstanceId.get(instanceId);
        if (!states) {
            states = new Map();
            this.containerStatesByInstanceId.set(instanceId, states);
        }

        const sourceId = buildContainerSourceId(instanceId, container.id);

        const existing = states.get(sourceId);
        if (existing) {
            if (typeof existing.refreshAtTick === 'number'
                && existing.refreshAtTick <= this.tick
                && !existing.activeSearch) {
                existing.entries = this.generateContainerEntries(container);
                existing.generatedAtTick = this.tick;
                existing.refreshAtTick = container.refreshTicks ? this.tick + container.refreshTicks : undefined;
                this.markContainerPersistenceDirty(instanceId);
            }
            return existing;
        }

        const created = existing ?? {
            sourceId,
            containerId: container.id,
            entries: [],
        };
        created.entries = this.generateContainerEntries(container);
        created.generatedAtTick = this.tick;
        created.refreshAtTick = container.refreshTicks ? this.tick + container.refreshTicks : undefined;
        created.activeSearch = undefined;
        states.set(sourceId, created);
        this.markContainerPersistenceDirty(instanceId);
        return created;
    }
    /** generateContainerEntries：生成容器当前轮次的物品条目。 */
    generateContainerEntries(container) {

        const entries = [];
        for (const pool of container.lootPools) {
            const items = this.contentTemplateRepository.rollLootPoolItems({
                rolls: pool.rolls,
                chance: pool.chance,
                minLevel: pool.minLevel,
                maxLevel: pool.maxLevel,
                minGrade: pool.minGrade,
                maxGrade: pool.maxGrade,
                tagGroups: pool.tagGroups?.map((group) => group.slice()),
                countMin: pool.countMin,
                countMax: pool.countMax,
                allowDuplicates: pool.allowDuplicates,
            });
            for (const item of items) {
                entries.push({
                    item,
                    createdTick: this.tick,
                    visible: false,
                });
            }
        }
        if (entries.length > 0 || container.lootPools.length > 0) {
            return entries;
        }
        for (const drop of container.drops) {
            const chance = typeof drop.chance === 'number' ? Math.max(0, Math.min(1, drop.chance)) : 1;
            if (chance <= 0 || Math.random() > chance) {
                continue;
            }

            const item = this.contentTemplateRepository.createItem(drop.itemId, drop.count) ?? {
                itemId: drop.itemId,
                count: Math.max(1, Math.trunc(drop.count)),
                name: drop.name,
                type: drop.type,
            };
            entries.push({
                item,
                createdTick: this.tick,
                visible: false,
            });
        }
        return entries;
    }
    /** beginContainerSearch：启动容器翻找进度。 */
    beginContainerSearch(state, grade) {
        if (state.activeSearch) {
            return;
        }

        const nextHidden = groupContainerLootRows(state.entries.filter((entry) => !entry.visible))[0];
        if (!nextHidden) {
            return;
        }

        const totalTicks = CONTAINER_SEARCH_TICKS_BY_GRADE[grade] ?? 1;
        state.activeSearch = {
            itemKey: nextHidden.itemKey,
            totalTicks,
            remainingTicks: totalTicks,
        };
    }
    /** advanceContainerSearches：推进所有容器翻找进度。 */
    advanceContainerSearches() {
        for (const [instanceId, states] of this.containerStatesByInstanceId) {
            const instance = this.instances.get(instanceId);
            if (!instance) {
                continue;
            }

            let changed = false;
            for (const state of states.values()) {
                const runtimeContainer = instance.template.containers.find((entry) => entry.id === state.containerId) ?? null;
                if (!runtimeContainer) {
                    continue;
                }
                if (!state.activeSearch) {
                    if (hasHiddenContainerEntries(state.entries)
                        && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y)) {
                        this.beginContainerSearch(state, runtimeContainer.grade);
                        changed = true;
                    }
                    continue;
                }
                state.activeSearch.remainingTicks -= 1;
                changed = true;
                if (state.activeSearch.remainingTicks > 0) {
                    continue;
                }

                const target = state.entries.find((entry) => !entry.visible && createSyncedItemStackSignature(entry.item) === state.activeSearch?.itemKey);
                if (target) {
                    target.visible = true;
                }
                state.activeSearch = undefined;
                if (hasHiddenContainerEntries(state.entries)
                    && this.hasActiveContainerViewer(instanceId, runtimeContainer.x, runtimeContainer.y)) {
                    this.beginContainerSearch(state, runtimeContainer.grade);
                }
            }
            if (changed) {
                this.markContainerPersistenceDirty(instanceId);
            }
        }
    }
    /** hasActiveContainerViewer：判断指定地块是否仍有活跃拿取窗口。 */
    hasActiveContainerViewer(instanceId, tileX, tileY) {
        for (const [playerId, location] of this.playerLocations) {
            if (location.instanceId !== instanceId) {
                continue;
            }

            const player = this.playerRuntimeService.getPlayer(playerId);

            const lootWindowTarget = this.playerRuntimeService.getLootWindowTarget(playerId);
            if (!player || !lootWindowTarget) {
                continue;
            }
            if (Math.max(Math.abs(player.x - lootWindowTarget.tileX), Math.abs(player.y - lootWindowTarget.tileY)) > 1) {
                continue;
            }
            if (lootWindowTarget.tileX === tileX && lootWindowTarget.tileY === tileY) {
                return true;
            }
        }
        return false;
    }
    /** markContainerPersistenceDirty：标记容器持久化状态已变更。 */
    markContainerPersistenceDirty(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.add(instanceId);
    }
    /** tickAll：推进全部实例的默认一秒帧。 */
    tickAll() {
        return this.advanceFrame(1000);
    }
    /** advanceFrame：推进世界帧，统筹实例 tick、命令派发和耗时统计。 */
    advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {

        const startedAt = performance.now();
        this.latestCombatEffectsByInstanceId.clear();

        const instanceStepPlans = [];

        let plannedLogicalTicks = 0;
        for (const instance of this.instances.values()) {
            const speed = getInstanceTickSpeed
                ? Math.max(0, Number(getInstanceTickSpeed(instance.template.id) ?? 1))
                : 1;
            if (!Number.isFinite(speed) || speed <= 0) {
                continue;
            }

            const previousProgress = this.instanceTickProgressById.get(instance.meta.instanceId) ?? 0;

            const accumulated = previousProgress + speed * (Math.max(0, frameDurationMs) / 1000);

            const steps = Math.floor(accumulated);
            this.instanceTickProgressById.set(instance.meta.instanceId, accumulated - steps);
            if (steps <= 0) {
                continue;
            }
            instanceStepPlans.push({ instance, steps });
            plannedLogicalTicks += steps;
        }
        if (plannedLogicalTicks <= 0) {
            this.lastTickPhaseDurations = {
                pendingCommandsMs: 0,
                systemCommandsMs: 0,
                instanceTicksMs: 0,
                transfersMs: 0,
                monsterActionsMs: 0,
                playerAdvanceMs: 0,
            };
            this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
            /** pushDurationMetric：追加push耗时Metric。 */
            pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
            return 0;
        }
        this.processPendingRespawns();
        this.materializeNavigationCommands();
        this.materializeAutoCombatCommands();

        const pendingCommandsStartedAt = performance.now();
        this.dispatchPendingCommands();

        const pendingCommandsMs = performance.now() - pendingCommandsStartedAt;

        const systemCommandsStartedAt = performance.now();
        this.dispatchPendingSystemCommands();

        const systemCommandsMs = performance.now() - systemCommandsStartedAt;

        const steppedPlayerIds = new Set();

        const blockedPlayerIds = this.navigationIntents.size > 0
            ? new Set(this.navigationIntents.keys())
            : undefined;

        let totalLogicalTicks = 0;

        const instanceTicksStartedAt = performance.now();
        for (const { instance, steps } of instanceStepPlans) {
            for (let index = 0; index < steps; index += 1) {
                this.tick += 1;
                totalLogicalTicks += 1;

                const result = instance.tickOnce();
                for (const transfer of result.transfers) {
                    this.applyTransfer(transfer);
                }
                for (const action of result.monsterActions) {
                    this.applyMonsterAction(action);
                }

                const currentPlayerIds = instance.listPlayerIds();
                if (currentPlayerIds.length > 0) {
                    this.playerRuntimeService.advanceTickForPlayerIds(currentPlayerIds, instance.tick, {
                        idleCultivationBlockedPlayerIds: blockedPlayerIds,
                    });
                    this.advanceCraftJobs(currentPlayerIds);
                    for (const playerId of currentPlayerIds) {
                        steppedPlayerIds.add(playerId);
                    }
                }
            }
        }

        const instanceTicksMs = performance.now() - instanceTicksStartedAt;

        const transfersMs = 0;

        const monsterActionsMs = 0;

        const playerAdvanceStartedAt = performance.now();
        this.advanceContainerSearches();
        for (const playerId of steppedPlayerIds) {
            this.refreshQuestStates(playerId);
        }

        const playerAdvanceMs = performance.now() - playerAdvanceStartedAt;
        this.lastTickPhaseDurations = {
            pendingCommandsMs: roundDurationMs(pendingCommandsMs),
            systemCommandsMs: roundDurationMs(systemCommandsMs),
            instanceTicksMs: roundDurationMs(instanceTicksMs),
            transfersMs: roundDurationMs(transfersMs),
            monsterActionsMs: roundDurationMs(monsterActionsMs),
            playerAdvanceMs: roundDurationMs(playerAdvanceMs),
        };
        this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
        /** pushDurationMetric：追加push耗时Metric。 */
        pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
        return totalLogicalTicks;
    }
    /** recordSyncFlushDuration：记录一次同步刷新耗时。 */
    recordSyncFlushDuration(durationMs) {
        this.lastSyncFlushDurationMs = roundDurationMs(durationMs);
        /** pushDurationMetric：追加push耗时Metric。 */
        pushDurationMetric(this.syncFlushDurationHistoryMs, this.lastSyncFlushDurationMs);
    }
    /** bootstrapPublicInstances：初始化所有公共地图实例。 */
    bootstrapPublicInstances() {
        for (const template of this.templateRepository.list()) {
            this.createInstance({
                instanceId: buildPublicInstanceId(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
            });
        }
        this.logger.log(`已初始化 ${this.instances.size} 个公共实例`);
    }
    /** restorePublicInstancePersistence：从持久化快照恢复公共实例状态。 */
    async restorePublicInstancePersistence() {
        if (!this.mapPersistenceService.isEnabled()) {
            return;
        }
        for (const [instanceId, instance] of this.instances) {
            if (!instance.meta.persistent) {
                continue;
            }

            const snapshot = await this.mapPersistenceService.loadMapSnapshot(instanceId);
            if (!snapshot || snapshot.templateId !== instance.template.id) {
                continue;
            }
            instance.hydrateAura(snapshot.auraEntries);
            instance.hydrateGroundPiles(snapshot.groundPileEntries);
            this.hydrateContainerStates(instanceId, snapshot.containerStates ?? []);
        }
    }
    /** rebuildPersistentRuntimeAfterRestore：在恢复持久化后重建世界运行态。 */
    async rebuildPersistentRuntimeAfterRestore() {
        this.instances.clear();
        this.playerLocations.clear();
        this.pendingCommands.clear();
        this.pendingSystemCommands.length = 0;
        this.pendingRespawnPlayerIds.clear();
        this.navigationIntents.clear();
        this.instanceTickProgressById.clear();
        this.containerStatesByInstanceId.clear();
        this.dirtyContainerPersistenceInstanceIds.clear();
        this.latestCombatEffectsByInstanceId.clear();
        this.bootstrapPublicInstances();
        await this.restorePublicInstancePersistence();
    }
    /** createInstance：创建地图实例并挂接到世界运行时。 */
    createInstance(input) {

        const existing = this.instances.get(input.instanceId);
        if (existing) {
            return existing;
        }

        /** template：当前实例使用的地图模板。 */
        const template = this.templateRepository.getOrThrow(input.templateId);

        const instance = new map_instance_runtime_1.MapInstanceRuntime({
            instanceId: input.instanceId,
            template,
            monsterSpawns: this.contentTemplateRepository.createRuntimeMonstersForMap(template.id),
            kind: input.kind,
            persistent: input.persistent,
            createdAt: Date.now(),
        });
        this.instances.set(input.instanceId, instance);
        this.instanceTickProgressById.set(input.instanceId, 0);
        return instance;
    }
    /** getOrCreatePublicInstance：读取或创建公共地图实例。 */
    getOrCreatePublicInstance(templateId) {
        if (!this.templateRepository.has(templateId)) {
            throw new common_1.NotFoundException(`Unknown map template: ${templateId}`);
        }
        return this.createInstance({
            instanceId: buildPublicInstanceId(templateId),
            templateId,
            kind: 'public',
            persistent: true,
        });
    }
    /** resolveDefaultRespawnMapId：解析默认复生地图。 */
    resolveDefaultRespawnMapId() {
        if (this.templateRepository.has(DEFAULT_PLAYER_RESPAWN_MAP_ID)) {
            return DEFAULT_PLAYER_RESPAWN_MAP_ID;
        }

        const fallback = this.templateRepository.list()[0]?.id;
        if (!fallback) {
            throw new common_1.NotFoundException('No map template available');
        }
        return fallback;
    }
    /** findMapRoute：查找跨地图传送路线。 */
    findMapRoute(fromMapId, toMapId) {
        if (fromMapId === toMapId) {
            return [fromMapId];
        }

        const visited = new Set([fromMapId]);

        const queue = [{
                mapId: fromMapId,
                path: [fromMapId],
            }];
        for (let index = 0; index < queue.length; index += 1) {
            const current = queue[index];
            /** template：当前实例使用的地图模板。 */
            const template = this.templateRepository.getOrThrow(current.mapId);
            for (const portal of template.portals) {
                if (visited.has(portal.targetMapId)) {
                    continue;
                }

                const nextPath = current.path.concat(portal.targetMapId);
                if (portal.targetMapId === toMapId) {
                    return nextPath;
                }
                visited.add(portal.targetMapId);
                queue.push({
                    mapId: portal.targetMapId,
                    path: nextPath,
                });
            }
        }
        return null;
    }
    /** getPlayerLocationOrThrow：读取玩家当前接入位置，不存在就抛错。 */
    getPlayerLocationOrThrow(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            throw new common_1.NotFoundException(`Player ${playerId} is not connected`);
        }
        return location;
    }
    /** getInstanceRuntimeOrThrow：读取实例运行时，不存在就抛错。 */
    getInstanceRuntimeOrThrow(instanceId) {

        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new common_1.NotFoundException(`Instance ${instanceId} not found`);
        }
        return instance;
    }
    /** cancelPendingInstanceCommand：取消当前实例中玩家待执行命令。 */
    cancelPendingInstanceCommand(playerId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return false;
        }
        return this.instances.get(location.instanceId)?.cancelPendingCommand(playerId) ?? false;
    }
    /** interruptManualNavigation：中断手动导航并清掉自动战斗状态。 */
    interruptManualNavigation(playerId) {

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.updateCombatSettings(playerId, {
            autoBattle: false,
        }, currentTick);
        this.cancelPendingInstanceCommand(playerId);
    }
    /** interruptManualCombat：中断手动战斗并清掉导航意图。 */
    interruptManualCombat(playerId) {
        this.navigationIntents.delete(playerId);
        this.cancelPendingInstanceCommand(playerId);
    }
    /** getPlayerViewOrThrow：读取玩家视野，不存在就抛错。 */
    getPlayerViewOrThrow(playerId) {

        const view = this.getPlayerView(playerId);
        if (!view) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return view;
    }
    /** applyTransfer：把跨图传送结果应用到目标实例。 */
    applyTransfer(transfer) {

        const source = this.instances.get(transfer.fromInstanceId);
        if (!source) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.transfer.apply', {
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            fromInstanceId: transfer.fromInstanceId,
            toMapId: transfer.targetMapId,
            targetX: transfer.targetX,
            targetY: transfer.targetY,
            reason: transfer.reason,
        });
        source.disconnectPlayer(transfer.playerId);

        const target = this.getOrCreatePublicInstance(transfer.targetMapId);
        target.connectPlayer({
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            preferredX: transfer.targetX,
            preferredY: transfer.targetY,
        });

        const runtimePlayer = this.playerRuntimeService.getPlayer(transfer.playerId);
        target.setPlayerMoveSpeed(transfer.playerId, runtimePlayer?.attrs.numericStats.moveSpeed ?? 0);
        this.playerLocations.set(transfer.playerId, {
            instanceId: target.meta.instanceId,
            sessionId: transfer.sessionId,
        });

        const navigation = this.navigationIntents.get(transfer.playerId);
        if (navigation?.kind === 'point') {
            this.navigationIntents.delete(transfer.playerId);
        }
        this.queuePlayerNotice(transfer.playerId, `${transfer.reason === 'manual_portal' ? '通过界门' : '穿过灵脉'}抵达 ${target.template.name}`, 'travel');
    }
    /** materializeNavigationCommands：把导航意图落成可执行的移动或传送命令。 */
    materializeNavigationCommands() {
        if (this.navigationIntents.size === 0) {
            return;
        }
        for (const [playerId, intent] of this.navigationIntents) {
            if (this.pendingCommands.has(playerId)) {
                continue;
            }

            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || !player.instanceId || player.hp <= 0) {
                this.navigationIntents.delete(playerId);
                continue;
            }
            try {

                const step = this.resolveNavigationStep(playerId, intent);
                (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.step', {
                    playerId,
                    intent,
                    step,
                });
                if (step.kind === 'done') {
                    this.navigationIntents.delete(playerId);
                    continue;
                }
                if (step.kind === 'portal') {
                    this.pendingCommands.set(playerId, { kind: 'portal' });
                    continue;
                }
                if (step.kind === 'move') {
                    this.pendingCommands.set(playerId, {
                        kind: 'move',
                        direction: step.direction,
                        continuous: true,
                        maxSteps: step.maxSteps,
                        path: step.path ?? undefined,
                        resetBudget: false,
                    });
                }
            }
            catch (error) {

                const message = error instanceof Error ? error.message : String(error);
                (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.error', {
                    playerId,
                    intent,
                    message,
                });
                this.navigationIntents.delete(playerId);
                this.queuePlayerNotice(playerId, message, 'warn');
            }
        }
    }
    /** resolveNavigationStep：为当前导航目标计算下一步动作。 */
    resolveNavigationStep(playerId, intent) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const destination = this.resolveNavigationDestination(playerId, intent);
        if (destination.mapId !== player.templateId) {

            const route = this.findMapRoute(player.templateId, destination.mapId);
            if (!route || route.length < 2) {
                throw new common_1.BadRequestException(`无法规划前往 ${destination.mapId} 的跨图路线`);
            }

            const nextMapId = route[1];

            const portal = selectNearestPortal(instance.template.portals, nextMapId, player.x, player.y);
            if (!portal) {
                throw new common_1.BadRequestException(`当前地图没有通往 ${nextMapId} 的界门`);
            }
            if (player.x === portal.x && player.y === portal.y) {
                (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.crossMap.atPortal', {
                    playerId,
                    fromMapId: player.templateId,
                    destinationMapId: destination.mapId,
                    route,
                    portal,
                });
                return { kind: 'portal' };
            }

            const pathResult = findOptimalPathOnMap(instance, player.playerId, player.x, player.y, [{
                    x: portal.x,
                    y: portal.y,
                }]);
            if (!pathResult || pathResult.points.length === 0) {
                throw new common_1.BadRequestException('前往界门的路径不可达');
            }

            const previewPath = (0, movement_debug_1.isServerNextMovementDebugEnabled)() ? pathResult.points : null;

            const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
            if (direction === null) {
                throw new common_1.BadRequestException('前往界门的路径不可达');
            }
            (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.crossMap.path', {
                playerId,
                fromMapId: player.templateId,
                destinationMapId: destination.mapId,
                from: { x: player.x, y: player.y },
                route,
                portal,
                direction,
                previewPath: previewPath ? previewPath.map((entry) => ({ x: entry.x, y: entry.y })) : null,
                pathCost: pathResult.cost,
            });
            return {
                kind: 'move',
                direction,
                maxSteps: pathResult.points.length,
                path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
            };
        }
        if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
            (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.arrived', {
                playerId,
                mapId: destination.mapId,
                at: { x: player.x, y: player.y },
                goals: destination.goals,
            });
            return { kind: 'done' };
        }

        const preferredPath = intent.kind === 'point'
            ? resolvePreferredClientPathHint(instance, player.playerId, player.x, player.y, destination.goals, intent.clientPathHint)
            : null;

        const serverPathResult = preferredPath
            ? null
            : findOptimalPathOnMap(instance, player.playerId, player.x, player.y, destination.goals);

        const pathResult = preferredPath ?? serverPathResult;
        if (!pathResult || pathResult.points.length === 0) {
            throw new common_1.BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }

        const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
        if (direction === null) {
            throw new common_1.BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }

        const previewPath = (0, movement_debug_1.isServerNextMovementDebugEnabled)() ? pathResult.points : null;
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.navigation.local.path', {
            playerId,
            mapId: destination.mapId,
            from: { x: player.x, y: player.y },
            goals: destination.goals,
            direction,
            previewPath: previewPath ? previewPath.map((entry) => ({ x: entry.x, y: entry.y })) : null,
            pathSource: preferredPath ? 'client_hint' : 'server_optimal',
            pathCost: pathResult.cost,
        });
        return {
            kind: 'move',
            direction,
            maxSteps: pathResult.points.length,
            path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })),
        };
    }
    /** resolveNavigationDestination：把点位导航或任务导航归一成可寻路目标。 */
    resolveNavigationDestination(playerId, intent) {
        if (intent.kind === 'point') {

            const location = this.getPlayerLocationOrThrow(playerId);

            const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

            const goals = buildGoalPoints(instance, intent.x, intent.y, intent.allowNearestReachable);
            if (goals.length === 0) {
                throw new common_1.BadRequestException('无法到达该位置');
            }
            return {
                mapId: intent.mapId,
                goals,
            };
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const quest = player.quests.quests.find((entry) => entry.id === intent.questId && entry.status !== 'completed');
        if (!quest) {
            throw new common_1.NotFoundException('目标任务不存在或已完成');
        }

        const resolved = this.resolveQuestNavigationTarget(quest);
        if (!resolved) {
            throw new common_1.BadRequestException('当前任务没有可导航目标');
        }

        const targetTemplate = this.templateRepository.getOrThrow(resolved.mapId);

        const goals = resolved.adjacent
            ? buildAdjacentGoalPoints(targetTemplate, resolved.x, resolved.y)
            : buildGoalPointsFromTemplate(targetTemplate, resolved.x, resolved.y, true);
        if (goals.length === 0) {
            throw new common_1.BadRequestException('任务目标当前不可达');
        }
        return {
            mapId: resolved.mapId,
            goals,
        };
    }
    /** materializeAutoCombatCommands：把自动战斗意图落成当前 tick 的战斗命令。 */
    materializeAutoCombatCommands() {
        for (const playerId of this.playerLocations.keys()) {
            if (this.pendingCommands.has(playerId) || this.navigationIntents.has(playerId)) {
                continue;
            }

            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            if (!player.combat.autoBattle && !player.combat.autoRetaliate) {
                continue;
            }

            const location = this.playerLocations.get(playerId);
            if (!location) {
                continue;
            }

            const instance = this.instances.get(location.instanceId);
            if (!instance) {
                continue;
            }
            if (player.combat.autoBattle && instance.isSafeZoneTile(player.x, player.y)) {

                const currentTick = this.resolveCurrentTickForPlayerId(playerId);
                this.playerRuntimeService.updateCombatSettings(playerId, {
                    autoBattle: false,
                }, currentTick);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                this.queuePlayerNotice(playerId, '安全区内无法发起攻击，自动战斗已停止。', 'warn');
                continue;
            }

            const command = this.buildAutoCombatCommand(instance, player);
            if (command) {
                this.pendingCommands.set(playerId, command);
            }
        }
    }
    /** buildAutoCombatCommand：为自动战斗构建移动、普攻或施法命令。 */
    buildAutoCombatCommand(instance, player) {
        if (instance.isPointInSafeZone(player.x, player.y)) {
            return null;
        }

        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));

        const view = instance.buildPlayerView(player.playerId, radius);
        if (!view || view.localMonsters.length === 0) {
            return null;
        }

        const target = this.selectAutoCombatTarget(instance, player, view.localMonsters);
        if (!target) {
            return null;
        }

        const distance = chebyshevDistance(player.x, player.y, target.x, target.y);

        const skillId = this.pickAutoBattleSkill(player, distance);
        if (skillId) {
            return {
                kind: 'castSkill',
                skillId,
                targetPlayerId: null,
                targetMonsterId: target.runtimeId,
            };
        }
        if (distance <= 1) {
            return {
                kind: 'basicAttack',
                targetPlayerId: null,
                targetMonsterId: target.runtimeId,
                targetX: null,
                targetY: null,
            };
        }
        if (player.combat.autoBattleStationary) {
            return null;
        }

        const desiredRange = this.resolveAutoBattleDesiredRange(player);
        if (desiredRange > 1 && distance <= desiredRange) {
            return null;
        }

        const goals = buildAutoBattleGoalPoints(instance, target.x, target.y, desiredRange);

        const direction = findNextDirectionOnMap(instance, player.playerId, player.x, player.y, goals, false);
        if (direction === null) {
            return null;
        }
        return {
            kind: 'move',
            direction,
            continuous: true,
        };
    }
    /** selectAutoCombatTarget：从当前视野里选择自动战斗目标。 */
    selectAutoCombatTarget(instance, player, visibleMonsters) {
        if (player.combat.autoBattle) {

            const trackedTarget = this.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters);
            if (trackedTarget) {
                return trackedTarget;
            }
        }

        let best = null;

        let bestAggro = -1;

        let bestDistance = Number.MAX_SAFE_INTEGER;

        let bestHp = Number.MAX_SAFE_INTEGER;
        for (const monster of visibleMonsters) {
            const liveMonster = instance.getMonster(monster.runtimeId);
            if (!liveMonster?.alive) {
                continue;
            }

            const retaliating = liveMonster.aggroTargetPlayerId === player.playerId;
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }

            const aggroRank = retaliating ? 1 : 0;

            const distance = chebyshevDistance(player.x, player.y, monster.x, monster.y);
            if (aggroRank > bestAggro
                || (aggroRank === bestAggro && distance < bestDistance)
                || (aggroRank === bestAggro && distance === bestDistance && monster.hp < bestHp)
                || (aggroRank === bestAggro && distance === bestDistance && monster.hp === bestHp
                    && best && monster.runtimeId < best.runtimeId)) {
                best = monster;
                bestAggro = aggroRank;
                bestDistance = distance;
                bestHp = monster.hp;
            }
        }
        if (best && player.combat.autoBattle && player.combat.combatTargetId !== best.runtimeId) {
            this.playerRuntimeService.setCombatTarget(player.playerId, best.runtimeId, false, this.resolveCurrentTickForPlayerId(player.playerId));
        }
        return best;
    }
    /** resolveTrackedAutoCombatTarget：解析已锁定的自动战斗目标。 */
    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters) {

        const targetRuntimeId = player.combat.combatTargetId;
        if (!targetRuntimeId || targetRuntimeId.startsWith('player:') || targetRuntimeId.startsWith('tile:')) {
            return null;
        }

        const visibleTarget = visibleMonsters.find((entry) => entry.runtimeId === targetRuntimeId);
        if (visibleTarget) {
            return visibleTarget;
        }

        const trackedTarget = instance.getMonster(targetRuntimeId);

        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        if (trackedTarget?.alive
            && chebyshevDistance(player.x, player.y, trackedTarget.x, trackedTarget.y) <= radius) {
            return trackedTarget;
        }

        const locked = player.combat.combatTargetLocked;
        if (locked) {

            const currentTick = this.resolveCurrentTickForPlayerId(player.playerId);
            this.playerRuntimeService.updateCombatSettings(player.playerId, {
                autoBattle: false,
            }, currentTick);
            this.queuePlayerNotice(player.playerId, '强制攻击目标已经失去踪迹，自动战斗已停止。', 'combat');
            return null;
        }
        this.playerRuntimeService.clearCombatTarget(player.playerId, this.resolveCurrentTickForPlayerId(player.playerId));
        return null;
    }
    /** pickAutoBattleSkill：选择当前距离可用的自动战斗技能。 */
    pickAutoBattleSkill(player, distance) {
        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }
            if ((action.cooldownLeft ?? 0) > 0) {
                continue;
            }

            const range = Math.max(1, Math.round(action.range ?? 1));
            if (distance > range) {
                continue;
            }

            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            return skill.id;
        }
        return null;
    }
    /** resolveAutoBattleDesiredRange：计算自动战斗期望停留射程。 */
    resolveAutoBattleDesiredRange(player) {

        let desiredRange = 1;
        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }

            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            desiredRange = Math.max(desiredRange, Math.max(1, Math.round(action.range ?? 1)));
        }
        return desiredRange;
    }
    /** dispatchPendingCommands：派发玩家待执行命令。 */
    dispatchPendingCommands() {
        for (const [playerId, command] of this.pendingCommands) {
            try {
                if (command.kind === 'move' || command.kind === 'portal') {
                    this.dispatchInstanceCommand(playerId, command);
                }
                else {
                    this.dispatchPlayerCommand(playerId, command);
                }
            }
            catch (error) {

                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`处理玩家 ${playerId} 的待执行指令失败：${command.kind}（${message}）`);
                this.queuePlayerNotice(playerId, message, 'warn');
            }
        }
        this.pendingCommands.clear();
    }
    /** dispatchPendingSystemCommands：派发系统命令队列。 */
    dispatchPendingSystemCommands() {
        if (this.pendingSystemCommands.length === 0) {
            return;
        }

        const commands = this.pendingSystemCommands.splice(0, this.pendingSystemCommands.length);
        for (const command of commands) {
            try {
                this.dispatchSystemCommand(command);
            }
            catch (error) {

                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`处理系统指令 ${command.kind} 失败：${message}`);
            }
        }
    }
    /** dispatchInstanceCommand：执行需要落到实例侧的移动或传送命令。 */
    dispatchInstanceCommand(playerId, command) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return;
        }

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0) {
            return;
        }

        const instance = this.instances.get(location.instanceId);
        if (!instance) {
            return;
        }
        if (command.kind === 'move') {
            instance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
                interruptCultivation: true,
            });
            this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(player, 'move'), 'alchemy');
            this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(player, 'move'), 'enhancement');
            instance.enqueueMove({
                playerId,
                direction: command.direction,

                continuous: command.continuous === true,
                maxSteps: command.maxSteps,
                path: Array.isArray(command.path)
                    ? command.path.map((entry) => ({ x: entry.x, y: entry.y }))
                    : undefined,

                resetBudget: command.resetBudget === true,
            });
            return;
        }
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(player, 'move'), 'alchemy');
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(player, 'move'), 'enhancement');

        const manualTransfer = instance.tryPortalTransfer(playerId, 'manual_portal');
        if (manualTransfer) {
            this.applyTransfer(manualTransfer);
            return;
        }

        const autoTransfer = instance.tryPortalTransfer(playerId, 'auto_portal');
        if (autoTransfer) {
            this.applyTransfer(autoTransfer);
            return;
        }
        instance.enqueuePortalUse({ playerId });
    }
    /** dispatchPlayerCommand：执行不依赖实例移动的玩家命令。 */
    dispatchPlayerCommand(playerId, command) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0 && command.kind !== 'redeemCodes') {
            return;
        }
        switch (command.kind) {
            case 'useItem':
                this.dispatchUseItem(playerId, command.slotIndex);
                return;
            case 'equip':
                this.dispatchEquipItem(playerId, command.slotIndex);
                return;
            case 'dropItem':
                this.dispatchDropItem(playerId, command.slotIndex, command.count);
                return;
            case 'moveTo':
                this.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint);
                return;
            case 'basicAttack':
                this.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY);
                return;
            case 'engageBattle':
                this.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked);
                return;
            case 'takeGround':
                this.dispatchTakeGround(playerId, command.sourceId, command.itemKey);
                return;
            case 'takeGroundAll':
                this.dispatchTakeGroundAll(playerId, command.sourceId);
                return;
            case 'unequip':
                this.dispatchUnequipItem(playerId, command.slot);
                return;
            case 'cultivate':
                this.dispatchCultivateTechnique(playerId, command.techniqueId);
                return;
            case 'startAlchemy':
                this.dispatchStartAlchemy(playerId, command.payload);
                return;
            case 'cancelAlchemy':
                this.dispatchCancelAlchemy(playerId);
                return;
            case 'startEnhancement':
                this.dispatchStartEnhancement(playerId, command.payload);
                return;
            case 'cancelEnhancement':
                this.dispatchCancelEnhancement(playerId);
                return;
            case 'redeemCodes':
                this.dispatchRedeemCodes(playerId, command.codes);
                return;
            case 'breakthrough':
                this.dispatchBreakthrough(playerId);
                return;
            case 'heavenGateAction':
                this.dispatchHeavenGateAction(playerId, command.action, command.element);
                return;
            case 'castSkill':
                this.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef);
                return;
            case 'buyNpcShopItem':
                this.dispatchBuyNpcShopItem(playerId, command.npcId, command.itemId, command.quantity);
                return;
            case 'npcInteraction':
            case 'legacyNpcInteraction':
                this.dispatchLegacyNpcInteraction(playerId, command.npcId);
                return;
            case 'interactNpcQuest':
                this.dispatchInteractNpcQuest(playerId, command.npcId);
                return;
            case 'acceptNpcQuest':
                this.dispatchAcceptNpcQuest(playerId, command.npcId, command.questId);
                return;
            case 'submitNpcQuest':
                this.dispatchSubmitNpcQuest(playerId, command.npcId, command.questId);
                return;
        }
    }
    /** dispatchRedeemCodes：执行兑换码结算并把结果回推给客户端。 */
    dispatchRedeemCodes(playerId, codes) {
        this.redeemCodeRuntimeService.redeemCodes(playerId, codes)
            .then((payload) => {

            const socket = this.worldSessionService.getSocketByPlayerId(playerId);
            if (socket) {
                this.worldClientEventService.emitRedeemCodesResult(socket, { result: payload });
            }
        })
            .catch((error) => {

            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`处理玩家 ${playerId} 的兑换码失败：${message}`);
            this.queuePlayerNotice(playerId, message, 'warn');
        });
    }
    /** dispatchCastSkill：校验目标并把技能释放交给战斗服务。 */
    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(attacker, 'attack'), 'alchemy');
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(attacker, 'attack'), 'enhancement');
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }

        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new common_1.NotFoundException(`Skill ${skillId} not found`);
        }
        this.ensureAttackAllowed(attacker, skill);
        if (targetRef && !targetMonsterId && !targetPlayerId) {

            const resolvedTarget = this.resolveLegacySkillTargetRef(attacker, skill, targetRef);
            if (!resolvedTarget) {
                throw new common_1.BadRequestException('没有可命中的目标');
            }
            if (resolvedTarget.kind === 'monster') {
                this.dispatchCastSkillToMonster(attacker, skillId, resolvedTarget.monsterId);
                return;
            }
            if (resolvedTarget.kind === 'tile') {
                this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y);
                return;
            }
            this.dispatchCastSkill(playerId, skillId, resolvedTarget.playerId, null, null);
            return;
        }
        if (targetMonsterId) {
            this.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId);
            return;
        }
        if (!targetPlayerId) {
            throw new common_1.BadRequestException('targetPlayerId or targetMonsterId is required');
        }

        const target = this.playerRuntimeService.getPlayerOrThrow(targetPlayerId);
        if (attacker.instanceId !== target.instanceId) {
            throw new common_1.BadRequestException(`Target ${targetPlayerId} not in same instance`);
        }

        const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);

        const result = this.playerCombatService.castSkill(attacker, target, skillId, currentTick, distance);

        const effectColor = getSkillEffectColor(skill);
        this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
        if (result.totalDamage > 0) {
            this.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, result.totalDamage, effectColor);
        }
        this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
            interruptCultivation: true,
        });

        const updatedTarget = this.playerRuntimeService.getPlayer(target.playerId);
        if (updatedTarget && updatedTarget.hp <= 0) {
            this.handlePlayerDefeat(updatedTarget.playerId);
        }
    }
    /** resolveLegacySkillTargetRef：解析旧版技能目标引用。 */
    resolveLegacySkillTargetRef(attacker, skill, targetRef) {
        if (!attacker.instanceId) {
            return null;
        }

        const targetPlayerId = targetRef.startsWith('player:') ? targetRef.slice('player:'.length).trim() : '';
        if (targetPlayerId) {

            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.playerId === attacker.playerId || target.instanceId !== attacker.instanceId || target.hp <= 0) {
                return null;
            }
            return {
                kind: 'player',
                playerId: target.playerId,
            };
        }

        const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);
        if (!targetRef.startsWith('tile:')) {

            const monster = instance.getMonster(targetRef);
            if (!monster?.alive) {
                return null;
            }
            return {
                kind: 'monster',
                monsterId: monster.runtimeId,
            };
        }

        const tile = (0, shared_1.parseTileTargetRef)(targetRef);
        if (!tile) {
            return null;
        }

        const directDistance = chebyshevDistance(attacker.x, attacker.y, tile.x, tile.y);
        if (directDistance <= resolveRuntimeSkillRange(skill) && instance.getTileCombatState(tile.x, tile.y)) {
            return {
                kind: 'tile',
                x: tile.x,
                y: tile.y,
            };
        }

        const affectedCells = (0, shared_1.computeAffectedCellsFromAnchor)({ x: attacker.x, y: attacker.y }, { x: tile.x, y: tile.y }, {
            range: resolveRuntimeSkillRange(skill),
            shape: skill.targeting?.shape,
            radius: skill.targeting?.radius,
            width: skill.targeting?.width,
            height: skill.targeting?.height,
        });
        if (affectedCells.length === 0) {
            return null;
        }

        const monsters = instance.listMonsters()
            .filter((entry) => entry.alive)
            .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y));
        for (const cell of affectedCells) {
            const monster = monsters.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (monster) {
                return {
                    kind: 'monster',
                    monsterId: monster.runtimeId,
                };
            }
        }

        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => entry.instanceId === attacker.instanceId && entry.playerId !== attacker.playerId && entry.hp > 0)
            .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y));
        for (const cell of affectedCells) {
            const player = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (player) {
                return {
                    kind: 'player',
                    playerId: player.playerId,
                };
            }
        }
        for (const cell of affectedCells) {
            if (instance.getTileCombatState(cell.x, cell.y)) {
                return {
                    kind: 'tile',
                    x: cell.x,
                    y: cell.y,
                };
            }
        }
        return null;
    }
    /** dispatchEngageBattle：执行战斗锁定或普通攻击的入口。 */
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);

        const currentPlayer = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const wasAutoBattleActive = currentPlayer.combat.autoBattle === true;
        this.interruptManualCombat(playerId);
        if (!targetMonsterId) {

            const targetRef = targetPlayerId
                ? `player:${targetPlayerId}`
                : (targetX !== null && targetY !== null ? `tile:${targetX}:${targetY}` : null);
            if (locked && targetRef) {
                this.playerRuntimeService.updateCombatSettings(playerId, {
                    autoBattle: true,
                }, currentTick);
                this.playerRuntimeService.setCombatTarget(playerId, targetRef, true, currentTick);
                if (wasAutoBattleActive) {
                    return;
                }
            }
            this.dispatchBasicAttack(playerId, targetPlayerId, null, targetX, targetY);
            return;
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (!player.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }

        const instance = this.getInstanceRuntimeOrThrow(player.instanceId);

        const monster = instance.getMonster(targetMonsterId);
        if (!monster?.alive) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }
        this.playerRuntimeService.updateCombatSettings(playerId, {
            autoBattle: true,
        }, currentTick);
        this.playerRuntimeService.setCombatTarget(playerId, monster.runtimeId, locked, currentTick);
        if (wasAutoBattleActive) {
            return;
        }

        const nextCommand = this.buildAutoCombatCommand(instance, player);
        if (!nextCommand) {
            return;
        }
        if (nextCommand.kind === 'move' || nextCommand.kind === 'portal') {
            this.dispatchInstanceCommand(playerId, nextCommand);
            return;
        }
        this.dispatchPlayerCommand(playerId, nextCommand);
    }
    /** dispatchCastSkillToMonster：把技能结算到妖兽目标上。 */
    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId) {

        const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);

        const target = instance.getMonster(targetMonsterId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }

        const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);

        const currentTick = this.resolveCurrentTickForPlayerId(attacker.playerId);

        const result = this.playerCombatService.castSkillToMonster(attacker, {
            runtimeId: target.runtimeId,
            monsterId: target.monsterId,
            hp: target.hp,
            maxHp: target.maxHp,
            qi: 0,
            maxQi: 0,
            attrs: {
                finalAttrs: target.attrs,
                numericStats: target.numericStats,
                ratioDivisors: target.ratioDivisors,
            },
            buffs: target.buffs,
        }, skillId, currentTick, distance, (buff) => {
            instance.applyTemporaryBuffToMonster(targetMonsterId, buff);
        });

        const skill = findPlayerSkill(attacker, skillId);

        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        if (skill) {
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        }
        this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
        if (result.totalDamage <= 0) {
            return;
        }
        this.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, result.totalDamage, effectColor);

        const outcome = instance.applyDamageToMonster(targetMonsterId, result.totalDamage, attacker.playerId);
        if (!outcome?.defeated) {
            return;
        }
        this.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
    }
    /** dispatchCastSkillToTile：把技能结算到地块目标上。 */
    dispatchCastSkillToTile(attacker, skillId, targetX, targetY) {

        const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);

        const tileState = instance.getTileCombatState(targetX, targetY);
        if (!tileState || tileState.destroyed) {
            throw new common_1.BadRequestException('该目标无法被攻击');
        }

        const distance = chebyshevDistance(attacker.x, attacker.y, targetX, targetY);

        const currentTick = this.resolveCurrentTickForPlayerId(attacker.playerId);

        const result = this.playerCombatService.castSkillToMonster(attacker, {
            runtimeId: `tile:${targetX}:${targetY}`,
            monsterId: `tile:${tileState.tileType}`,
            hp: tileState.hp,
            maxHp: tileState.maxHp,
            qi: 0,
            maxQi: 0,
            attrs: {
                finalAttrs: createTileCombatAttributes(),
                numericStats: createTileCombatNumericStats(tileState.maxHp),
                ratioDivisors: createTileCombatRatioDivisors(),
            },
            buffs: [],
        }, skillId, currentTick, distance, () => undefined);

        const skill = findPlayerSkill(attacker, skillId);

        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        if (skill) {
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        }
        this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
        if (result.totalDamage <= 0) {
            return;
        }
        this.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, result.totalDamage, effectColor);
        instance.damageTile(targetX, targetY, result.totalDamage);
    }
    /** dispatchSystemCommand：执行世界层系统命令。 */
    dispatchSystemCommand(command) {
        switch (command.kind) {
            case 'spawnMonsterLoot':
                this.dispatchSpawnMonsterLoot(command.instanceId, command.x, command.y, command.monsterId, command.rolls);
                return;
            case 'damageMonster':
                this.dispatchDamageMonster(command.instanceId, command.runtimeId, command.amount);
                return;
            case 'defeatMonster':
                this.dispatchDefeatMonster(command.instanceId, command.runtimeId);
                return;
            case 'damagePlayer':
                this.dispatchDamagePlayer(command.playerId, command.amount);
                return;
            case 'respawnPlayer':
                this.respawnPlayer(command.playerId);
                return;
            case 'resetPlayerSpawn':
                this.respawnPlayer(command.playerId);
                return;
            case 'gmUpdatePlayer':
            case 'legacyGmUpdatePlayer':
                this.dispatchGmUpdatePlayer(command);
                return;
            case 'gmResetPlayer':
            case 'legacyGmResetPlayer':
                this.respawnPlayer(command.playerId);
                return;
            case 'gmSpawnBots':
            case 'legacyGmSpawnBots':
                this.dispatchGmSpawnBots(command.anchorPlayerId, command.count);
                return;
            case 'gmRemoveBots':
            case 'legacyGmRemoveBots':
                this.dispatchGmRemoveBots(command.playerIds, command.all);
                return;
        }
    }
    /** dispatchUseItem：执行物品使用结算。 */
    dispatchUseItem(playerId, slotIndex) {

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }

        const learnedTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
        const mapUnlockIds = Array.isArray(item.mapUnlockIds) && item.mapUnlockIds.length > 0
            ? item.mapUnlockIds
            : item.mapUnlockId
                ? [item.mapUnlockId]
                : [];
        if (mapUnlockIds.length > 0) {
            for (const mapId of mapUnlockIds) {
                if (!this.templateRepository.has(mapId)) {
                    throw new common_1.BadRequestException(`Unknown map unlock target: ${mapId}`);
                }
            }
            if (mapUnlockIds.every((mapId) => this.playerRuntimeService.hasUnlockedMap(playerId, mapId))) {
                throw new common_1.BadRequestException('Map already unlocked');
            }
            for (const mapId of mapUnlockIds) {
                if (!this.playerRuntimeService.hasUnlockedMap(playerId, mapId)) {
                    this.playerRuntimeService.unlockMap(playerId, mapId);
                }
            }
            this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
            this.refreshQuestStates(playerId);
            const targetLabel = mapUnlockIds.length === 1
                ? this.templateRepository.getOrThrow(mapUnlockIds[0]).name
                : `${item.name ?? '地图'}记载的区域`;
            this.queuePlayerNotice(playerId, `已解锁地图：${targetLabel}`, 'success');
            return;
        }
        if (item.tileAuraGainAmount) {

            const location = this.getPlayerLocationOrThrow(playerId);

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

            const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

            const nextAura = instance.addTileAura(player.x, player.y, item.tileAuraGainAmount);
            if (nextAura === null) {
                throw new common_1.BadRequestException(`Failed to add aura at ${player.x},${player.y}`);
            }
            this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
            this.refreshQuestStates(playerId);
            this.queuePlayerNotice(playerId, `使用 ${item.name}，当前地块灵气提升至 ${nextAura}`, 'success');
            return;
        }
        this.playerRuntimeService.useItem(playerId, slotIndex);
        if (learnedTechniqueId) {
            this.advanceLearnTechniqueQuest(playerId, learnedTechniqueId);
        }
        else {
            this.refreshQuestStates(playerId);
        }
        this.queuePlayerNotice(playerId, `使用 ${item.name}`, 'success');
    }
    /** dispatchBreakthrough：触发修为突破结算。 */
    dispatchBreakthrough(playerId) {
        this.playerRuntimeService.attemptBreakthrough(playerId, this.resolveCurrentTickForPlayerId(playerId));
    }
    /** dispatchHeavenGateAction：执行天门关卡动作。 */
    dispatchHeavenGateAction(playerId, action, element) {
        this.playerRuntimeService.handleHeavenGateAction(playerId, action, element, this.resolveCurrentTickForPlayerId(playerId));
    }
    /** dispatchMoveTo：执行点位导航的首步推进。 */
    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint = null) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });

        const intent = {
            kind: 'point',
            mapId: player.templateId,
            x,
            y,
            allowNearestReachable,
            clientPathHint,
        };
        this.navigationIntents.set(playerId, intent);
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.dispatch.moveTo', {
            playerId,
            from: {
                mapId: player.templateId,
                x: player.x,
                y: player.y,
            },
            target: {
                mapId: player.templateId,
                x,
                y,
            },
            allowNearestReachable,
            previewPath: this.getLegacyNavigationPath(playerId),
            clientPathHint: clientPathHint
                ? {
                    startX: clientPathHint.startX,
                    startY: clientPathHint.startY,
                    points: clientPathHint.points,
                }
                : null,
        });

        const initialStep = this.resolveNavigationStep(playerId, intent);
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.dispatch.moveTo.initialStep', {
            playerId,
            intent,
            step: initialStep,
        });
        if (initialStep.kind === 'done') {
            this.navigationIntents.delete(playerId);
            return;
        }
        if (initialStep.kind === 'portal') {
            this.dispatchInstanceCommand(playerId, { kind: 'portal' });
            return;
        }
        this.dispatchInstanceCommand(playerId, {
            kind: 'move',
            direction: initialStep.direction,
            continuous: true,
            maxSteps: initialStep.maxSteps,
            path: initialStep.path ?? undefined,
            resetBudget: true,
        });
    }
    /** dispatchBasicAttack：执行普通攻击结算，目标可以是玩家、妖兽或地块。 */
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(attacker, 'attack'), 'alchemy');
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(attacker, 'attack'), 'enhancement');
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        this.ensureAttackAllowed(attacker);

        const damageKind = attacker.attrs.numericStats.spellAtk > attacker.attrs.numericStats.physAtk ? 'spell' : 'physical';

        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? attacker.attrs.numericStats.spellAtk
            : attacker.attrs.numericStats.physAtk));
        if (targetMonsterId) {

            const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);

            const monster = instance.getMonster(targetMonsterId);
            if (!monster || !monster.alive) {
                throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
            }
            if (chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y) > 1) {
                throw new common_1.BadRequestException('目标超出攻击距离');
            }

            const resolvedDamage = computeResolvedDamage(baseDamage, damageKind, attacker.attrs.numericStats, attacker.attrs.ratioDivisors, monster.numericStats, monster.ratioDivisors);

            const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, monster.x, monster.y, effectColor);
            this.pushDamageFloatEffect(attacker.instanceId, monster.x, monster.y, resolvedDamage.damage, effectColor);

            const outcome = instance.applyDamageToMonster(targetMonsterId, resolvedDamage.damage, attacker.playerId);
            if (outcome?.defeated) {
                this.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
            }
            this.queuePlayerNotice(playerId, `${formatCombatActionClause('你', monster.name, '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
            return;
        }
        if (targetPlayerId) {

            const target = this.playerRuntimeService.getPlayerOrThrow(targetPlayerId);
            if (target.instanceId !== attacker.instanceId) {
                throw new common_1.BadRequestException('目标不在同一地图');
            }
            if (chebyshevDistance(attacker.x, attacker.y, target.x, target.y) > 1) {
                throw new common_1.BadRequestException('目标超出攻击距离');
            }

            const resolvedDamage = computeResolvedDamage(baseDamage, damageKind, attacker.attrs.numericStats, attacker.attrs.ratioDivisors, target.attrs.numericStats, target.attrs.ratioDivisors);

            const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
            this.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, resolvedDamage.damage, effectColor);

            const updated = this.playerRuntimeService.applyDamage(target.playerId, resolvedDamage.damage);
            this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
                interruptCultivation: true,
            });
            if (updated.hp <= 0) {
                this.handlePlayerDefeat(updated.playerId);
            }
            this.queuePlayerNotice(playerId, `${formatCombatActionClause('你', target.name ?? target.playerId, '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
            this.queuePlayerNotice(target.playerId, `${formatCombatActionClause(attacker.name ?? attacker.playerId, '你', '攻击')}，造成 ${formatCombatDamageBreakdown(resolvedDamage.rawDamage, resolvedDamage.damage, damageKind)} 伤害`, 'combat');
            return;
        }
        if (targetX !== null && targetY !== null) {

            const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);
            if (chebyshevDistance(attacker.x, attacker.y, targetX, targetY) > 1) {
                throw new common_1.BadRequestException('目标超出攻击距离');
            }

            const result = instance.damageTile(targetX, targetY, baseDamage);
            if (!result) {
                throw new common_1.BadRequestException('该目标无法被攻击');
            }

            const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
            if (result.appliedDamage > 0) {
                this.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, result.appliedDamage, effectColor);
            }
            this.queuePlayerNotice(playerId, `${formatCombatActionClause('你', '地块', '攻击')}，造成 ${formatCombatDamageBreakdown(baseDamage, result.appliedDamage, damageKind)} 伤害`, 'combat');
            return;
        }
        throw new common_1.BadRequestException('target is required');
    }
    /** dispatchDropItem：执行丢弃物品结算。 */
    dispatchDropItem(playerId, slotIndex, count) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const item = this.playerRuntimeService.splitInventoryItem(playerId, slotIndex, count);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const pile = instance.dropGroundItem(player.x, player.y, item);
        if (!pile) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            throw new common_1.BadRequestException(`Failed to drop item at ${player.x},${player.y}`);
        }
        this.refreshQuestStates(playerId);
        this.queuePlayerNotice(playerId, `放下 ${formatItemStackLabel(item)}`, 'info');
    }
    /** dispatchTakeGround：执行地面或容器拾取结算。 */
    dispatchTakeGround(playerId, sourceId, itemKey) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (isContainerSourceId(sourceId)) {

            const item = this.takeContainerItem(location.instanceId, playerId, player, sourceId, itemKey);
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            this.refreshQuestStates(playerId);
            this.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const item = instance.takeGroundItem(sourceId, itemKey, player.x, player.y);
        if (!item) {
            throw new common_1.NotFoundException(`Ground item ${itemKey} not found at ${sourceId}`);
        }
        this.playerRuntimeService.receiveInventoryItem(playerId, item);
        this.refreshQuestStates(playerId);
        this.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
    }
    /** dispatchTakeGroundAll：执行一键拾取结算。 */
    dispatchTakeGroundAll(playerId, sourceId) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (isContainerSourceId(sourceId)) {

            const takenItems = this.takeAllContainerItems(location.instanceId, playerId, player, sourceId);
            if (takenItems.length === 0) {
                throw new common_1.BadRequestException('当前没有可拿取的物品');
            }
            for (const item of takenItems) {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
            }
            this.refreshQuestStates(playerId);
            this.queuePlayerNotice(playerId, `获得 ${formatItemListSummary(takenItems)}`, 'loot');
            return;
        }

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const pile = instance.getGroundPileBySourceId(sourceId);
        if (!pile || pile.items.length === 0) {
            throw new common_1.NotFoundException(`Ground source ${sourceId} not found`);
        }

        const takenItems = [];
        for (const entry of pile.items) {
            if (!canReceiveItemStack(player, entry.item)) {
                if (takenItems.length === 0) {
                    throw new common_1.BadRequestException('背包空间不足，无法继续拿取');
                }
                break;
            }

            const taken = instance.takeGroundItem(sourceId, entry.itemKey, player.x, player.y);
            if (!taken) {
                continue;
            }
            this.playerRuntimeService.receiveInventoryItem(playerId, taken);
            takenItems.push(taken);
        }
        if (takenItems.length === 0) {
            throw new common_1.BadRequestException('当前没有可拿取的物品');
        }
        this.refreshQuestStates(playerId);
        this.queuePlayerNotice(playerId, `获得 ${formatItemListSummary(takenItems)}`, 'loot');
        if (takenItems.length < pile.items.length) {
            this.queuePlayerNotice(playerId, '背包空间不足，剩余物品暂时拿不下。', 'info');
        }
    }
    /** takeContainerItem：从容器窗口取走单组物品。 */
    takeContainerItem(instanceId, playerId, player, sourceId, itemKey) {

        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId);

        const row = groupContainerLootRows(resolved.state.entries.filter((entry) => entry.visible))
            .find((entry) => entry.itemKey === itemKey);
        if (!row) {
            throw new common_1.NotFoundException(`Container item ${itemKey} not found at ${sourceId}`);
        }
        if (!canReceiveContainerRow(player, row.entries)) {
            throw new common_1.BadRequestException('背包空间不足，无法拿取该物品');
        }
        /** removeContainerRowEntries：移除容器RowEntries。 */
        removeContainerRowEntries(resolved.state.entries, row.entries);
        if (!resolved.state.activeSearch && hasHiddenContainerEntries(resolved.state.entries)) {
            this.beginContainerSearch(resolved.state, resolved.container.grade);
        }
        this.markContainerPersistenceDirty(instanceId);
        return { ...row.item };
    }
    /** takeAllContainerItems：从容器窗口批量取走物品。 */
    takeAllContainerItems(instanceId, playerId, player, sourceId) {

        const resolved = this.resolveContainerStateForPlayer(instanceId, playerId, player, sourceId);

        const rows = groupContainerLootRows(resolved.state.entries.filter((entry) => entry.visible));
        if (rows.length === 0) {
            return [];
        }

        const takenItems = [];

        const simulatedInventory = cloneInventorySimulation(player.inventory.items);
        for (const row of rows) {
            if (!canReceiveContainerEntries(simulatedInventory, player.inventory.capacity, row.entries)) {
                break;
            }
            /** applyContainerEntriesToInventorySimulation：应用容器EntriesTo背包Simulation。 */
            applyContainerEntriesToInventorySimulation(simulatedInventory, row.entries);
            /** removeContainerRowEntries：移除容器RowEntries。 */
            removeContainerRowEntries(resolved.state.entries, row.entries);
            takenItems.push({ ...row.item });
        }
        if (takenItems.length > 0) {
            if (!resolved.state.activeSearch && hasHiddenContainerEntries(resolved.state.entries)) {
                this.beginContainerSearch(resolved.state, resolved.container.grade);
            }
            this.markContainerPersistenceDirty(instanceId);
        }
        return takenItems;
    }
    /** resolveContainerStateForPlayer：校验并解析玩家当前打开的容器状态。 */
    resolveContainerStateForPlayer(instanceId, playerId, player, sourceId) {

        const lootWindowTarget = this.playerRuntimeService.getLootWindowTarget(playerId);
        if (!lootWindowTarget) {
            throw new common_1.BadRequestException('请先打开拿取界面');
        }
        if (Math.max(Math.abs(player.x - lootWindowTarget.tileX), Math.abs(player.y - lootWindowTarget.tileY)) > 1) {
            this.playerRuntimeService.clearLootWindow(playerId);
            throw new common_1.BadRequestException('你已离开拿取范围');
        }

        const parsedSource = parseContainerSourceId(sourceId);
        if (!parsedSource) {
            throw new common_1.BadRequestException('非法容器来源');
        }
        if (parsedSource.instanceId !== instanceId) {
            throw new common_1.BadRequestException('目标容器不在当前实例中');
        }

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const container = instance.getContainerById(parsedSource.containerId);
        if (!container) {
            this.playerRuntimeService.clearLootWindow(playerId);
            throw new common_1.NotFoundException('目标容器不存在');
        }
        if (container.x !== lootWindowTarget.tileX || container.y !== lootWindowTarget.tileY) {
            throw new common_1.BadRequestException('当前拿取界面与目标容器不一致');
        }

        const expectedSourceId = buildContainerSourceId(instanceId, container.id);
        if (sourceId !== expectedSourceId) {
            throw new common_1.BadRequestException('当前拿取界面与目标容器不一致');
        }
        return {
            container,
            state: this.ensureContainerState(instanceId, container),
        };
    }
    /** dispatchBuyNpcShopItem：执行 NPC 商店购买结算。 */
    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {

        const validated = this.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        this.playerRuntimeService.consumeInventoryItemByItemId(playerId, NPC_SHOP_CURRENCY_ITEM_ID, validated.totalCost);
        this.playerRuntimeService.receiveInventoryItem(playerId, validated.item);
        this.refreshQuestStates(playerId);
        this.queuePlayerNotice(playerId, `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.getNpcShopCurrencyName()} x${validated.totalCost}`, 'success');
    }
    /** dispatchLegacyNpcInteraction：执行旧版 NPC 交互结算。 */
    dispatchLegacyNpcInteraction(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        this.refreshQuestStates(playerId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const readyQuest = player.quests.quests.find((entry) => (entry.status === 'ready'
            && entry.submitNpcId === npcId
            && (!entry.submitMapId || entry.submitMapId === player.templateId)));
        if (readyQuest) {
            this.dispatchSubmitNpcQuest(playerId, npcId, readyQuest.id);
            return;
        }

        const talkQuest = player.quests.quests.find((entry) => (entry.status === 'active'
            && entry.objectiveType === 'talk'
            && entry.targetNpcId === npcId
            && (!entry.targetMapId || entry.targetMapId === player.templateId)));
        if (talkQuest) {
            this.dispatchInteractNpcQuest(playerId, npcId);
            return;
        }

        const questViews = this.createNpcQuestsEnvelope(playerId, npcId).quests;

        const availableQuest = questViews.find((entry) => entry.status === 'available');
        if (availableQuest) {
            this.dispatchAcceptNpcQuest(playerId, npcId, availableQuest.id);
            return;
        }

        const activeQuest = questViews.find((entry) => entry.status === 'active');
        if (activeQuest) {
            this.queuePlayerNotice(playerId, `${npc.name}：${buildNpcQuestProgressText(activeQuest)}`, 'info');
            return;
        }
        this.queuePlayerNotice(playerId, `${npc.name}：${npc.dialogue}`, 'info');
    }
    /** dispatchEquipItem：执行装备穿戴结算。 */
    dispatchEquipItem(playerId, slotIndex) {

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const lockReason = item.equipSlot
            ? this.craftPanelRuntimeService.getLockedSlotReason(player, item.equipSlot)
            : null;
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        this.playerRuntimeService.equipItem(playerId, slotIndex);
        this.queuePlayerNotice(playerId, `装备 ${item.name}`, 'success');
        this.emitCraftPanelUpdate(playerId, 'alchemy');
        this.emitCraftPanelUpdate(playerId, 'enhancement');
    }
    /** dispatchUnequipItem：执行装备卸下结算。 */
    dispatchUnequipItem(playerId, slot) {

        const item = this.playerRuntimeService.peekEquippedItem(playerId, slot);
        if (!item) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} is empty`);
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const lockReason = this.craftPanelRuntimeService.getLockedSlotReason(player, slot);
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        this.playerRuntimeService.unequipItem(playerId, slot);
        this.queuePlayerNotice(playerId, `卸下 ${item.name}`, 'info');
        this.emitCraftPanelUpdate(playerId, 'alchemy');
        this.emitCraftPanelUpdate(playerId, 'enhancement');
    }
    /** dispatchCultivateTechnique：执行功法修炼切换。 */
    dispatchCultivateTechnique(playerId, techniqueId) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const blockReason = this.craftPanelRuntimeService.getCultivationBlockReason(player);
        if (blockReason) {
            throw new common_1.BadRequestException(blockReason);
        }
        this.playerRuntimeService.cultivateTechnique(playerId, techniqueId);
        if (!techniqueId) {
            this.queuePlayerNotice(playerId, '已停止当前修炼', 'info');
            return;
        }

        const techniqueName = this.playerRuntimeService.getTechniqueName(playerId, techniqueId) ?? techniqueId;
        this.queuePlayerNotice(playerId, `开始修炼 ${techniqueName}`, 'success');
    }
    /** dispatchStartAlchemy：启动炼丹流程。 */
    dispatchStartAlchemy(playerId, payload) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const result = this.craftPanelRuntimeService.startAlchemy(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动炼丹失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy');
    }
    /** dispatchCancelAlchemy：取消炼丹流程。 */
    dispatchCancelAlchemy(playerId) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const result = this.craftPanelRuntimeService.cancelAlchemy(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消炼丹失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy');
    }
    /** dispatchStartEnhancement：启动强化流程。 */
    dispatchStartEnhancement(playerId, payload) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const result = this.craftPanelRuntimeService.startEnhancement(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动强化失败');
        }
        this.flushCraftMutation(playerId, result, 'enhancement');
    }
    /** dispatchCancelEnhancement：取消强化流程。 */
    dispatchCancelEnhancement(playerId) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const result = this.craftPanelRuntimeService.cancelEnhancement(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消强化失败');
        }
        this.flushCraftMutation(playerId, result, 'enhancement');
    }
    /** dispatchInteractNpcQuest：推进 NPC 对话型任务的交互进度。 */
    dispatchInteractNpcQuest(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'talk') {
                continue;
            }
            if (quest.targetNpcId !== npc.npcId) {
                continue;
            }
            if (quest.targetMapId && quest.targetMapId !== player.templateId) {
                continue;
            }
            if (quest.progress >= quest.required) {
                continue;
            }
            quest.progress = quest.required;
            changed = true;
            this.queuePlayerNotice(playerId, quest.relayMessage?.trim()
                ? `你向 ${npc.name} 传达了口信：“${quest.relayMessage.trim()}”`
                : `你向 ${npc.name} 传达了来意。`, 'info');
        }
        if (changed) {
            this.refreshQuestStates(playerId, true);
        }
    }
    /** dispatchAcceptNpcQuest：接取 NPC 任务并写入玩家任务列表。 */
    dispatchAcceptNpcQuest(playerId, npcId, questId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);

        const questsView = this.createNpcQuestsEnvelope(playerId, npcId).quests;

        const quest = questsView.find((entry) => entry.id === questId && entry.status === 'available');
        if (!quest) {
            throw new common_1.NotFoundException('当前无法接取该任务');
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === questId && entry.status !== 'completed')) {
            throw new common_1.BadRequestException('该任务已经接取');
        }
        player.quests.quests.push(cloneQuestState(quest, 'active'));
        this.playerRuntimeService.markQuestStateDirty(playerId);
        this.refreshQuestStates(playerId, true);
        this.queuePlayerNotice(playerId, `${npc.name}：${quest.story ?? quest.desc}`, 'success');
    }
    /** dispatchSubmitNpcQuest：提交 NPC 任务并发放奖励。 */
    dispatchSubmitNpcQuest(playerId, npcId, questId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const quest = player.quests.quests.find((entry) => entry.id === questId);
        if (!quest || quest.status !== 'ready') {
            throw new common_1.NotFoundException('该任务当前无法提交');
        }
        if (quest.submitNpcId !== npcId) {
            throw new common_1.BadRequestException('当前不是该任务的提交目标');
        }

        const rewards = this.buildQuestRewardItems(quest);
        if (!this.canReceiveRewardItems(playerId, rewards)) {
            throw new common_1.BadRequestException('背包空间不足，无法领取奖励');
        }
        if (quest.requiredItemId && (quest.requiredItemCount ?? 1) > 0) {
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, quest.requiredItemId, quest.requiredItemCount ?? 1);
        }
        for (const reward of rewards) {
            this.playerRuntimeService.receiveInventoryItem(playerId, reward);
        }
        quest.status = 'completed';
        this.playerRuntimeService.markQuestStateDirty(playerId);

        const nextQuest = this.tryAcceptNextQuest(playerId, quest.nextQuestId);
        this.refreshQuestStates(playerId, true);
        this.queuePlayerNotice(playerId, `${npc.name}：做得不错，这是你的奖励 ${quest.rewardText || '。'}`, 'success');
        if (nextQuest) {
            this.queuePlayerNotice(playerId, `新的任务《${nextQuest.title}》已自动接取`, 'info');
        }
    }
    /** dispatchSpawnMonsterLoot：按掉落表生成妖兽战利品。 */
    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const items = this.contentTemplateRepository.rollMonsterDrops(monsterId, rolls);
        if (items.length === 0) {
            throw new common_1.NotFoundException(`Monster ${monsterId} produced no loot`);
        }
        for (const item of items) {
            this.spawnGroundItem(instance, x, y, item);
        }
    }
    /** dispatchDefeatMonster：直接结算妖兽被击败后的掉落。 */
    dispatchDefeatMonster(instanceId, runtimeId) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const monster = instance.defeatMonster(runtimeId);
        if (!monster) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found or already dead`);
        }

        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1);
        for (const item of items) {
            this.spawnGroundItem(instance, monster.x, monster.y, item);
        }
    }
    /** dispatchDamagePlayer：对玩家直接施加伤害。 */
    dispatchDamagePlayer(playerId, amount) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.hp <= 0) {
            this.handlePlayerDefeat(playerId);
            return;
        }

        const updated = this.playerRuntimeService.applyDamage(playerId, amount);
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            this.handlePlayerDefeat(playerId);
        }
    }
    /** dispatchDamageMonster：对妖兽直接施加伤害。 */
    dispatchDamageMonster(instanceId, runtimeId, amount) {

        const instance = this.getInstanceRuntimeOrThrow(instanceId);

        const target = instance.getMonster(runtimeId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found`);
        }

        const outcome = instance.applyDamageToMonster(runtimeId, amount);
        if (!outcome?.defeated) {
            return;
        }

        const items = this.contentTemplateRepository.rollMonsterDrops(target.monsterId, 1);
        for (const item of items) {
            this.spawnGroundItem(instance, target.x, target.y, item);
        }
    }
    /** spawnGroundItem：在地面上生成物品堆。 */
    spawnGroundItem(instance, x, y, item) {

        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new common_1.BadRequestException(`Failed to spawn loot at ${x},${y}`);
        }
    }
    /** handlePlayerMonsterKill：处理玩家击杀妖兽后的奖励和进度。 */
    handlePlayerMonsterKill(instance, monster, killerPlayerId) {
        this.queuePlayerNotice(killerPlayerId, `${monster.name} 被你斩杀`, 'combat');
        this.advanceKillQuestProgress(killerPlayerId, monster.monsterId, monster.name);
        this.distributeMonsterKillProgress(instance, monster, killerPlayerId);

        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);

        const lootRate = killer?.attrs.numericStats.lootRate ?? 0;

        const rareLootRate = killer?.attrs.numericStats.rareLootRate ?? 0;

        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1, lootRate, rareLootRate);
        for (const item of items) {
            this.deliverMonsterLoot(killerPlayerId, instance, monster.x, monster.y, item);
        }
    }
    /** distributeMonsterKillProgress：把妖兽击杀进度分给参与者。 */
    distributeMonsterKillProgress(instance, monster, killerPlayerId) {

        const participants = this.resolveMonsterExpParticipants(instance, monster.runtimeId, killerPlayerId);

        const topContributionRealmLv = this.resolveMonsterTopContributionRealmLv(participants);

        let totalContribution = 0;
        for (const participant of participants) {
            totalContribution += participant.contribution;
        }
        for (const participant of participants) {
            const contributionRatio = totalContribution > 0 ? participant.contribution / totalContribution : 1;
            this.playerRuntimeService.grantMonsterKillProgress(participant.playerId, {
                monsterLevel: monster.level,
                monsterName: monster.name,
                monsterTier: monster.tier,
                contributionRatio,
                expAdjustmentRealmLv: Math.max(topContributionRealmLv, participant.realmLv),

                isKiller: participant.playerId === killerPlayerId,
            }, this.resolveCurrentTickForPlayerId(participant.playerId));
        }
    }
    /** resolveMonsterExpParticipants：解析参与妖兽经验分配的玩家。 */
    resolveMonsterExpParticipants(instance, runtimeId, killerPlayerId) {

        const contributions = instance.getMonsterDamageContributionEntries(runtimeId);

        const participants = [];

        let hasKiller = false;
        for (const entry of contributions) {
            if (entry.damage <= 0) {
                continue;
            }

            const player = this.playerRuntimeService.getPlayer(entry.playerId);
            if (!player || player.instanceId !== instance.meta.instanceId) {
                continue;
            }
            participants.push({
                playerId: player.playerId,
                contribution: entry.damage,
                realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? 1)),
            });
            if (player.playerId === killerPlayerId) {
                hasKiller = true;
            }
        }
        if (participants.length > 0 && hasKiller) {
            return participants;
        }

        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        if (!killer) {
            return participants;
        }
        participants.push({
            playerId: killerPlayerId,
            contribution: 1,
            realmLv: Math.max(1, Math.floor(killer.realm?.realmLv ?? 1)),
        });
        return participants;
    }
    /** resolveMonsterTopContributionRealmLv：找出妖兽战斗中的最高贡献境界。 */
    resolveMonsterTopContributionRealmLv(participants) {

        let topContribution = 0;

        let topRealmLv = 1;
        for (const participant of participants) {
            if (participant.contribution <= topContribution) {
                continue;
            }
            topContribution = participant.contribution;
            topRealmLv = Math.max(1, participant.realmLv);
        }
        return topRealmLv;
    }
    /** deliverMonsterLoot：把妖兽掉落交付给玩家或落到地面。 */
    deliverMonsterLoot(playerId, instance, x, y, item) {
        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            this.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }
        this.spawnGroundItem(instance, x, y, item);
        this.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, 'loot');
    }
    /** createNpcShopEnvelope：构建 NPC 商店封装结果。 */
    createNpcShopEnvelope(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        if (!npc.hasShop) {
            return {
                npcId,
                shop: null,
                error: '对方现在没有经营商店',
            };
        }

        const shop = this.buildNpcShopState(npc);
        if (!shop) {
            return {
                npcId,
                shop: null,
                error: '商铺货架还没有可售物品',
            };
        }
        return {
            npcId,
            shop,
        };
    }
    /** resolveAdjacentNpc：校验并读取相邻 NPC。 */
    resolveAdjacentNpc(playerId, npcId) {

        const location = this.getPlayerLocationOrThrow(playerId);

        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);

        const npc = instance.getAdjacentNpc(playerId, npcId);
        if (!npc) {
            throw new common_1.NotFoundException('你离这位商人太远了');
        }
        return npc;
    }
    /** buildNpcShopState：构建 NPC 商店的可售状态。 */
    buildNpcShopState(npc) {

        const items = npc.shopItems
            .map((entry) => {

            const item = this.contentTemplateRepository.createItem(entry.itemId, 1);
            if (!item) {
                return null;
            }
            return {
                itemId: entry.itemId,
                item,
                unitPrice: entry.price,
            };
        })
            .filter((entry) => Boolean(entry));
        if (items.length === 0) {
            return null;
        }
        return {
            npcId: npc.npcId,
            npcName: npc.name,
            dialogue: npc.dialogue,
            currencyItemId: NPC_SHOP_CURRENCY_ITEM_ID,
            currencyItemName: this.getNpcShopCurrencyName(),
            items,
        };
    }
    /** createNpcQuestsEnvelope：构建 NPC 任务封装结果。 */
    createNpcQuestsEnvelope(playerId, npcId) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return {
            npcId: npc.npcId,
            npcName: npc.name,
            quests: this.collectNpcQuestViews(playerId, npc),
        };
    }
    /** collectNpcQuestViews：收集玩家在该 NPC 处可见的任务。 */
    collectNpcQuestViews(playerId, npc) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const byQuestId = new Map(player.quests.quests.map((entry) => [entry.id, entry]));

        const result = [];
        for (let index = 0; index < npc.quests.length; index += 1) {
            const rawQuest = npc.quests[index];
            const existing = byQuestId.get(rawQuest.id);
            if (existing && existing.status !== 'completed') {
                result.push(cloneQuestState(existing));
                continue;
            }
            if (existing?.status === 'completed') {
                continue;
            }

            const blockedByPrevious = npc.quests
                .slice(0, index)
                .some((candidate) => byQuestId.get(candidate.id)?.status !== 'completed');
            if (blockedByPrevious) {
                break;
            }
            result.push(this.createQuestStateFromSource(playerId, rawQuest.id, 'available'));
        }
        for (const quest of player.quests.quests) {
            if (result.some((entry) => entry.id === quest.id)) {
                continue;
            }
            if (quest.targetNpcId === npc.npcId || quest.submitNpcId === npc.npcId) {
                result.push(cloneQuestState(quest));
            }
        }
        return result.sort(compareQuestViews);
    }
    /** refreshQuestStates：根据当前运行态刷新任务进度和状态。 */
    refreshQuestStates(playerId, forceDirty = false) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }

        let changed = forceDirty;
        for (const quest of player.quests.quests) {
            const previousProgress = quest.progress;
            const previousStatus = quest.status;
            quest.progress = this.resolveQuestProgress(playerId, quest);

            const nextStatus = quest.status === 'completed'
                ? 'completed'
                : this.canQuestBecomeReady(playerId, quest)
                    ? 'ready'
                    : quest.status === 'ready'
                        ? 'active'
                        : quest.status;
            if (quest.progress !== previousProgress || nextStatus !== previousStatus) {
                quest.status = nextStatus;
                changed = true;
            }
        }
        if (changed) {
            this.playerRuntimeService.markQuestStateDirty(playerId);
        }
    }
    /** resolveQuestProgress：计算任务当前进度。 */
    resolveQuestProgress(playerId, quest) {
        if (quest.status === 'completed') {
            return quest.required;
        }
        switch (quest.objectiveType) {
            case 'submit_item':
                return quest.requiredItemId
                    ? Math.min(quest.required, this.playerRuntimeService.getInventoryCountByItemId(playerId, quest.requiredItemId))
                    : quest.progress;
            case 'learn_technique':
                return quest.targetTechniqueId
                    && this.playerRuntimeService.getTechniqueName(playerId, quest.targetTechniqueId)
                    ? quest.required
                    : 0;
            case 'realm_stage': {

                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                return quest.targetRealmStage !== undefined && player.attrs.stage >= quest.targetRealmStage
                    ? quest.required
                    : quest.progress;
            }
            case 'realm_progress': {

                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                return quest.targetRealmStage !== undefined && player.attrs.stage > quest.targetRealmStage
                    ? quest.required
                    : quest.progress;
            }
            default:
                return quest.progress;
        }
    }
    /** canQuestBecomeReady：判断任务是否已经满足交付条件。 */
    canQuestBecomeReady(playerId, quest) {
        if (quest.progress < quest.required) {
            return false;
        }
        return !quest.requiredItemId || this.playerRuntimeService.getInventoryCountByItemId(playerId, quest.requiredItemId) >= (quest.requiredItemCount ?? 1);
    }
    /** createQuestStateFromSource：把模板任务展开成玩家运行时任务。 */
    createQuestStateFromSource(playerId, questId, status = 'active') {

        const source = this.templateRepository.getQuestSource(questId);
        if (!source) {
            throw new common_1.NotFoundException(`Quest ${questId} not found`);
        }

        const quest = source.quest;

        const objectiveType = normalizeQuestObjectiveType(quest.objectiveType);

        const required = normalizeQuestRequired(quest, objectiveType);

        const targetRealmStage = normalizeQuestRealmStage(quest.targetRealmStage);

        const targetNpcLocation = typeof quest.targetNpcId === 'string' && quest.targetNpcId.trim()
            ? this.templateRepository.getNpcLocation(quest.targetNpcId.trim())
            : null;

        const submitNpcLocation = typeof quest.submitNpcId === 'string' && quest.submitNpcId.trim()
            ? this.templateRepository.getNpcLocation(quest.submitNpcId.trim())
            : null;

        const rewardItems = this.buildQuestRewardItemsFromRecord(quest);

        const built = {
            id: source.quest.id,
            title: source.quest.title,
            desc: source.quest.desc,
            line: normalizeQuestLine(source.quest.line),

            chapter: typeof source.quest.chapter === 'string' ? source.quest.chapter : undefined,

            story: typeof source.quest.story === 'string' ? source.quest.story : undefined,
            status,
            objectiveType,

            objectiveText: typeof source.quest.objectiveText === 'string' ? source.quest.objectiveText : undefined,
            progress: 0,
            required,

            targetName: resolveQuestTargetLabel(objectiveType, source.quest, targetRealmStage, targetNpcLocation?.npcName, this.contentTemplateRepository.getItemName(typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : ''), this.contentTemplateRepository.getTechniqueName(typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : '')),

            targetTechniqueId: typeof source.quest.targetTechniqueId === 'string' ? source.quest.targetTechniqueId : undefined,
            targetRealmStage,
            rewardText: buildQuestRewardText(source.quest, rewardItems),

            targetMonsterId: typeof source.quest.targetMonsterId === 'string' ? source.quest.targetMonsterId : '',

            rewardItemId: typeof source.quest.rewardItemId === 'string' ? source.quest.rewardItemId : (rewardItems[0]?.itemId ?? ''),
            rewardItemIds: rewardItems.map((entry) => entry.itemId),
            rewards: rewardItems.map((entry) => ({ ...entry })),

            nextQuestId: typeof source.quest.nextQuestId === 'string' ? source.quest.nextQuestId : undefined,

            requiredItemId: typeof source.quest.requiredItemId === 'string' ? source.quest.requiredItemId : undefined,
            requiredItemCount: Number.isInteger(source.quest.requiredItemCount) ? Number(source.quest.requiredItemCount) : undefined,
            giverId: source.giverNpcId,
            giverName: source.giverNpcName,
            giverMapId: source.giverMapId,
            giverMapName: source.giverMapName,
            giverX: source.giverX,
            giverY: source.giverY,

            targetMapId: typeof source.quest.targetMapId === 'string' && source.quest.targetMapId.trim()
                ? source.quest.targetMapId.trim()
                : targetNpcLocation?.mapId,

            targetMapName: typeof source.quest.targetMapId === 'string' && this.templateRepository.has(source.quest.targetMapId.trim())
                ? this.templateRepository.getOrThrow(source.quest.targetMapId.trim()).name
                : targetNpcLocation?.mapName,
            targetX: Number.isInteger(source.quest.targetX) ? Number(source.quest.targetX) : targetNpcLocation?.x,
            targetY: Number.isInteger(source.quest.targetY) ? Number(source.quest.targetY) : targetNpcLocation?.y,

            targetNpcId: typeof source.quest.targetNpcId === 'string' ? source.quest.targetNpcId : undefined,

            targetNpcName: typeof source.quest.targetNpcName === 'string' ? source.quest.targetNpcName : targetNpcLocation?.npcName,

            submitNpcId: typeof source.quest.submitNpcId === 'string' ? source.quest.submitNpcId : undefined,

            submitNpcName: typeof source.quest.submitNpcName === 'string' ? source.quest.submitNpcName : submitNpcLocation?.npcName,

            submitMapId: typeof source.quest.submitMapId === 'string' && source.quest.submitMapId.trim()
                ? source.quest.submitMapId.trim()
                : submitNpcLocation?.mapId,

            submitMapName: typeof source.quest.submitMapId === 'string' && this.templateRepository.has(source.quest.submitMapId.trim())
                ? this.templateRepository.getOrThrow(source.quest.submitMapId.trim()).name
                : submitNpcLocation?.mapName,
            submitX: Number.isInteger(source.quest.submitX) ? Number(source.quest.submitX) : submitNpcLocation?.x,
            submitY: Number.isInteger(source.quest.submitY) ? Number(source.quest.submitY) : submitNpcLocation?.y,

            relayMessage: typeof source.quest.relayMessage === 'string' ? source.quest.relayMessage : undefined,
        };
        built.progress = this.resolveQuestProgress(playerId, built);
        if (status !== 'completed' && this.canQuestBecomeReady(playerId, built)) {
            built.status = 'ready';
        }
        return built;
    }
    /** tryAcceptNextQuest：尝试自动接取下一环任务。 */
    tryAcceptNextQuest(playerId, nextQuestId) {
        if (!nextQuestId) {
            return null;
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.quests.quests.some((entry) => entry.id === nextQuestId)) {
            return null;
        }

        const nextQuest = this.createQuestStateFromSource(playerId, nextQuestId, 'active');
        player.quests.quests.push(nextQuest);
        this.playerRuntimeService.markQuestStateDirty(playerId);
        return cloneQuestState(nextQuest);
    }
    /** advanceKillQuestProgress：推进击杀类任务进度。 */
    advanceKillQuestProgress(playerId, monsterId, monsterName) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }

        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'kill' || quest.targetMonsterId !== monsterId) {
                continue;
            }

            const nextProgress = Math.min(quest.required, quest.progress + 1);
            if (nextProgress !== quest.progress) {
                quest.progress = nextProgress;
                if (!quest.targetName || quest.targetName === quest.targetMonsterId) {
                    quest.targetName = monsterName;
                }
                changed = true;
            }
        }
        if (changed) {
            this.refreshQuestStates(playerId, true);
        }
    }
    /** advanceLearnTechniqueQuest：推进学习功法类任务进度。 */
    advanceLearnTechniqueQuest(playerId, techniqueId) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }

        let changed = false;
        for (const quest of player.quests.quests) {
            if (quest.status !== 'active' || quest.objectiveType !== 'learn_technique' || quest.targetTechniqueId !== techniqueId) {
                continue;
            }
            if (quest.progress !== quest.required) {
                quest.progress = quest.required;
                changed = true;
            }
        }
        if (changed) {
            this.refreshQuestStates(playerId, true);
            return;
        }
        this.refreshQuestStates(playerId);
    }
    /** buildQuestRewardItems：构建任务奖励物品列表。 */
    buildQuestRewardItems(quest) {
        if (quest.rewards.length > 0) {
            return quest.rewards.map((entry) => toQuestRewardItem(this.contentTemplateRepository.createItem(entry.itemId, entry.count), {
                itemId: entry.itemId,
                name: entry.name ?? entry.itemId,
                type: entry.type ?? 'material',
                count: entry.count,
                desc: entry.desc ?? (entry.name ?? entry.itemId),
            }));
        }
        if (!quest.rewardItemId) {
            return [];
        }

        const item = this.contentTemplateRepository.createItem(quest.rewardItemId, 1);
        return [toQuestRewardItem(item, {
                itemId: quest.rewardItemId,
                name: quest.rewardItemId,
                type: 'material',
                count: 1,
                desc: quest.rewardItemId,
            })];
    }
    /** buildQuestRewardItemsFromRecord：从任务原始记录构建奖励物品列表。 */
    buildQuestRewardItemsFromRecord(quest) {

        const rewards = [];

        const rewardList = Array.isArray(quest.reward) ? quest.reward : [];
        for (const entry of rewardList) {
            const itemId = typeof entry?.itemId === 'string' ? entry.itemId.trim() : '';
            if (!itemId) {
                continue;
            }

            const count = Number.isInteger(entry.count) ? Math.max(1, Number(entry.count)) : 1;
            rewards.push(toQuestRewardItem(this.contentTemplateRepository.createItem(itemId, count), {
                itemId,
                name: itemId,
                type: 'material',
                count,
                desc: itemId,
            }));
        }
        if (rewards.length > 0) {
            return rewards;
        }

        const rewardItemId = typeof quest.rewardItemId === 'string' ? quest.rewardItemId.trim() : '';
        if (!rewardItemId) {
            return [];
        }

        const item = this.contentTemplateRepository.createItem(rewardItemId, 1);
        return [toQuestRewardItem(item, {
                itemId: rewardItemId,
                name: rewardItemId,
                type: 'material',
                count: 1,
                desc: rewardItemId,
            })];
    }
    /** canReceiveRewardItems：判断玩家是否还能接收任务奖励。 */
    canReceiveRewardItems(playerId, rewards) {

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        let freeSlots = Math.max(0, player.inventory.capacity - player.inventory.items.length);

        const seenNewItemIds = new Set();
        for (const reward of rewards) {
            if (player.inventory.items.some((entry) => entry.itemId === reward.itemId) || seenNewItemIds.has(reward.itemId)) {
                continue;
            }
            if (freeSlots <= 0) {
                return false;
            }
            seenNewItemIds.add(reward.itemId);
            freeSlots -= 1;
        }
        return true;
    }
    /** resolveQuestNavigationTarget：解析任务对应的导航目标。 */
    resolveQuestNavigationTarget(quest) {
        if (quest.status === 'ready') {
            if (quest.submitMapId && Number.isInteger(quest.submitX) && Number.isInteger(quest.submitY)) {
                return {
                    mapId: quest.submitMapId,
                    x: Number(quest.submitX),
                    y: Number(quest.submitY),
                    adjacent: true,
                };
            }
            if (quest.submitNpcId) {

                const location = this.templateRepository.getNpcLocation(quest.submitNpcId);
                if (location) {
                    return {
                        mapId: location.mapId,
                        x: location.x,
                        y: location.y,
                        adjacent: true,
                    };
                }
            }
        }
        if (quest.objectiveType === 'talk' && quest.targetNpcId) {

            const location = this.templateRepository.getNpcLocation(quest.targetNpcId);
            if (location) {
                return {
                    mapId: location.mapId,
                    x: location.x,
                    y: location.y,
                    adjacent: true,
                };
            }
        }
        if (quest.targetMapId && Number.isInteger(quest.targetX) && Number.isInteger(quest.targetY)) {
            return {
                mapId: quest.targetMapId,
                x: Number(quest.targetX),
                y: Number(quest.targetY),
                adjacent: Boolean(quest.targetNpcId),
            };
        }
        if (quest.objectiveType === 'kill' && quest.targetMonsterId && quest.targetMapId) {

            const spawn = this.contentTemplateRepository.createRuntimeMonstersForMap(quest.targetMapId)
                .find((entry) => entry.monsterId === quest.targetMonsterId);
            if (spawn) {
                return {
                    mapId: quest.targetMapId,
                    x: spawn.x,
                    y: spawn.y,
                    adjacent: true,
                };
            }
        }
        if (quest.giverMapId && Number.isInteger(quest.giverX) && Number.isInteger(quest.giverY)) {
            return {
                mapId: quest.giverMapId,
                x: Number(quest.giverX),
                y: Number(quest.giverY),
                adjacent: true,
            };
        }
        return null;
    }
    /** resolveNpcQuestMarker：解析 NPC 头顶的任务标记。 */
    resolveNpcQuestMarker(playerId, npcId) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return undefined;
        }

        const currentMapId = player.templateId;
        for (const quest of player.quests.quests) {
            if (quest.status === 'ready' && quest.submitNpcId === npcId && quest.submitMapId === currentMapId) {
                return { line: quest.line, state: 'ready' };
            }
        }
        for (const quest of player.quests.quests) {
            if (quest.status === 'active'
                && ((quest.objectiveType === 'talk' && quest.targetNpcId === npcId && (!quest.targetMapId || quest.targetMapId === currentMapId))
                    || quest.giverId === npcId)) {
                return { line: quest.line, state: 'active' };
            }
        }

        const npc = this.getNpcForPlayerMap(playerId, npcId);
        if (!npc) {
            return undefined;
        }

        const npcViews = this.collectNpcQuestViews(playerId, npc);

        const available = npcViews.find((entry) => entry.status === 'available');
        return available ? { line: available.line, state: 'available' } : undefined;
    }
    /** getNpcForPlayerMap：读取玩家当前地图中的 NPC。 */
    getNpcForPlayerMap(playerId, npcId) {

        const location = this.playerLocations.get(playerId);
        if (!location) {
            return null;
        }
        return this.instances.get(location.instanceId)?.getNpc(npcId) ?? null;
    }
    /** validateNpcShopPurchase：校验 NPC 商店购买条件。 */
    validateNpcShopPurchase(playerId, npcId, itemId, quantity) {

        const npc = this.resolveAdjacentNpc(playerId, npcId);
        if (!npc.hasShop) {
            throw new common_1.BadRequestException('对方现在没有经营商店');
        }

        const shopItem = npc.shopItems.find((entry) => entry.itemId === itemId);
        if (!shopItem) {
            throw new common_1.NotFoundException('这位商人没有出售该物品');
        }

        const totalCost = quantity * shopItem.price;
        if (!Number.isSafeInteger(totalCost) || totalCost <= 0) {
            throw new common_1.BadRequestException('购买总价过大，暂时无法结算');
        }

        const item = this.contentTemplateRepository.createItem(itemId, quantity);
        if (!item) {
            throw new common_1.NotFoundException('商品配置异常，暂时无法购买');
        }
        if (!this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            throw new common_1.BadRequestException('背包空间不足，无法购买');
        }
        if (this.playerRuntimeService.getInventoryCountByItemId(playerId, NPC_SHOP_CURRENCY_ITEM_ID) < totalCost) {
            throw new common_1.BadRequestException(`${this.getNpcShopCurrencyName()}不足`);
        }
        return {
            item,
            totalCost,
        };
    }
    /** getNpcShopCurrencyName：读取 NPC 商店货币名称。 */
    getNpcShopCurrencyName() {
        return this.contentTemplateRepository.createItem(NPC_SHOP_CURRENCY_ITEM_ID, 1)?.name ?? NPC_SHOP_CURRENCY_ITEM_ID;
    }
    /** decoratePlayerViewNpcs：为玩家视野中的 NPC 补充任务标记。 */
    decoratePlayerViewNpcs(playerId, view) {
        return {
            ...view,
            localNpcs: view.localNpcs.map((entry) => ({
                ...entry,
                questMarker: this.resolveNpcQuestMarker(playerId, entry.npcId),
            })),
        };
    }
    /** buildContextActions：根据当前视野构建上下文动作列表。 */
    buildContextActions(view) {

        const actions = [];

        const player = this.playerRuntimeService.getPlayer(view.playerId);
        actions.push({
            id: 'battle:force_attack',
            name: '强制攻击',
            type: 'battle',
            desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
            cooldownLeft: 0,
            range: Math.max(1, Math.round(player?.attrs.numericStats.viewRange ?? 1)),
            requiresTarget: true,
            targetMode: 'any',
        });
        actions.push({
            id: 'travel:return_spawn',
            name: '遁返云来',
            type: 'travel',
            desc: '催动归引灵符，立即返回当前角色的默认落脚点。',
            cooldownLeft: 0,
        });
        for (const action of STATIC_TOGGLE_CONTEXT_ACTIONS) {
            actions.push({
                id: action.id,
                name: action.name,
                type: action.type,
                desc: action.desc,
                cooldownLeft: 0,
            });
        }
        for (const portal of view.localPortals) {
            if (portal.trigger !== 'manual' || portal.x !== view.self.x || portal.y !== view.self.y) {
                continue;
            }

            const targetName = this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : portal.targetMapId;
            actions.push({
                id: 'portal:travel',
                name: `传送至：${targetName}`,
                type: 'travel',
                desc: `踏入对应界门，前往 ${targetName}。`,
                cooldownLeft: 0,
            });
        }
        for (const npc of view.localNpcs) {
            if (chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) <= 1) {
                actions.push({
                    id: `npc:${npc.npcId}`,
                    name: `交谈：${npc.name}`,
                    type: 'interact',
                    desc: npc.dialogue?.trim() ? npc.dialogue.trim() : `与 ${npc.name} 交谈。`,
                    cooldownLeft: 0,
                });
            }
            if (npc.questMarker && chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) <= 1) {
                actions.push({
                    id: `npc_quests:${npc.npcId}`,

                    name: npc.questMarker.state === 'ready' ? `交付任务：${npc.name}` : `任务：${npc.name}`,
                    type: 'quest',

                    desc: npc.questMarker.state === 'ready'
                        ? `向 ${npc.name} 提交当前可完成的任务。`
                        : `查看 ${npc.name} 相关的任务。`,
                    cooldownLeft: 0,
                });
            }
            if (!npc.hasShop || chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) > 1) {
                continue;
            }
            actions.push({
                id: `npc_shop:${npc.npcId}`,
                name: `商店：${npc.name}`,
                type: 'interact',
                desc: `查看 ${npc.name} 当前出售的货物。`,
                cooldownLeft: 0,
            });
        }
        if (player?.realm?.breakthroughReady) {

            const preview = player.realm.breakthrough;
            actions.push({
                id: 'realm:breakthrough',
                name: `突破至 ${preview?.targetDisplayName ?? '下一境界'}`,
                type: 'breakthrough',
                desc: preview?.blockedReason ?? `当前境界已圆满，点击查看 ${preview?.targetDisplayName ?? '下一境界'} 的突破要求。`,
                cooldownLeft: 0,
            });
        }

        const weapon = player?.equipment?.slots?.find((entry) => entry.slot === 'weapon')?.item ?? null;
        if (weapon?.tags?.includes('alchemy_furnace') || player?.alchemyJob) {
            actions.push({
                id: 'alchemy:open',
                name: '炼丹',
                type: 'interact',
                desc: weapon?.tags?.includes('alchemy_furnace')
                    ? '查看当前丹炉、丹方目录与炼制状态。'
                    : '查看当前炼丹状态。',
                cooldownLeft: 0,
            });
        }
        if (weapon?.tags?.includes('enhancement_hammer') || player?.enhancementJob) {
            actions.push({
                id: 'enhancement:open',
                name: '强化',
                type: 'interact',
                desc: weapon?.tags?.includes('enhancement_hammer')
                    ? '查看当前强化候选、保护材料与强化状态。'
                    : '查看当前强化状态。',
                cooldownLeft: 0,
            });
        }
        actions.sort((left, right) => compareStableStrings(left.id, right.id));
        return actions;
    }
    /** applyMonsterAction：应用实例 tick 产出的妖兽动作。 */
    applyMonsterAction(action) {
        if (action.kind === 'skill') {
            this.applyMonsterSkill(action);
            return;
        }
        this.applyMonsterBasicAttack(action);
    }
    /** applyMonsterBasicAttack：把妖兽普通攻击结算到玩家身上。 */
    applyMonsterBasicAttack(action) {

        const location = this.playerLocations.get(action.targetPlayerId);
        if (!location) {
            return;
        }

        const instance = this.instances.get(action.instanceId);
        if (!instance) {
            return;
        }

        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }

        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }

        const player = this.playerRuntimeService.getPlayer(action.targetPlayerId);
        if (!player || player.instanceId !== location.instanceId || player.hp <= 0) {
            return;
        }

        const distance = chebyshevDistance(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y);
        if (distance > monster.attackRange) {
            return;
        }

        const damage = typeof action.damage === 'number' ? Math.max(0, Math.round(action.damage)) : 0;
        if (damage <= 0) {
            return;
        }

        const effectColor = (0, shared_1.getDamageTrailColor)('physical');
        this.pushActionLabelEffect(action.instanceId, monster.x, monster.y, '攻击');

        const updated = this.playerRuntimeService.applyDamage(action.targetPlayerId, damage);
        this.pushAttackEffect(action.instanceId, monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, effectColor);
        this.pushDamageFloatEffect(action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, damage, effectColor);
        this.playerRuntimeService.recordActivity(action.targetPlayerId, this.resolveCurrentTickForPlayerId(action.targetPlayerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            this.handlePlayerDefeat(updated.playerId);
        }
    }
    /** applyMonsterSkill：把妖兽技能结算到玩家身上。 */
    applyMonsterSkill(action) {
        if (!action.skillId) {
            return;
        }

        const instance = this.instances.get(action.instanceId);
        if (!instance) {
            return;
        }

        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }

        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }

        const player = this.playerRuntimeService.getPlayer(action.targetPlayerId);
        if (!player || player.instanceId !== action.instanceId || player.hp <= 0) {
            return;
        }

        const distance = chebyshevDistance(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y);
        try {

            const currentTick = instance.tick;

            const result = this.playerCombatService.castMonsterSkill({
                runtimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                hp: monster.hp,
                maxHp: monster.maxHp,
                qi: 0,
                maxQi: 0,
                level: monster.level,
                skills: monster.skills,
                cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
                attrs: {
                    finalAttrs: monster.attrs,
                    numericStats: monster.numericStats,
                    ratioDivisors: monster.ratioDivisors,
                },
                buffs: monster.buffs,
            }, player, action.skillId, currentTick, distance, (buff) => {
                instance.applyTemporaryBuffToMonster(monster.runtimeId, buff);
            }, (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(player.playerId, buff);
            });

            const skill = monster.skills.find((entry) => entry.id === action.skillId);

            const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
            if (skill) {
                this.pushActionLabelEffect(action.instanceId, monster.x, monster.y, skill.name);
            }
            this.pushAttackEffect(action.instanceId, monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, effectColor);
            if (result.totalDamage > 0) {
                this.pushDamageFloatEffect(action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, result.totalDamage, effectColor);
            }
            this.playerRuntimeService.recordActivity(player.playerId, currentTick, {
                interruptCultivation: true,
            });

            const updatedPlayer = this.playerRuntimeService.getPlayer(player.playerId);
            if (updatedPlayer && updatedPlayer.hp <= 0) {
                this.handlePlayerDefeat(updatedPlayer.playerId);
            }
        }
        catch (error) {

            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`处理妖兽技能 ${action.skillId}（来源 ${action.runtimeId}）失败：${message}`);
        }
    }
    /** handlePlayerDefeat：标记玩家进入复生队列。 */
    handlePlayerDefeat(playerId) {
        this.pendingCommands.delete(playerId);
        this.pendingRespawnPlayerIds.add(playerId);
    }
    /** processPendingRespawns：处理等待复生的玩家。 */
    processPendingRespawns() {
        if (this.pendingRespawnPlayerIds.size === 0) {
            return;
        }

        const pending = Array.from(this.pendingRespawnPlayerIds);
        this.pendingRespawnPlayerIds.clear();
        for (const playerId of pending) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp > 0) {
                continue;
            }
            this.respawnPlayer(playerId);
        }
    }
    /** dispatchGmUpdatePlayer：执行 GM 更新玩家请求。 */
    dispatchGmUpdatePlayer(command) {
        const playerId = command.playerId;

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const nextMapId = command.mapId || player.templateId || this.resolveDefaultRespawnMapId();

        const targetInstance = this.getOrCreatePublicInstance(nextMapId);

        const previous = this.playerLocations.get(playerId) ?? null;

        const sessionId = previous?.sessionId ?? player.sessionId ?? `session:${playerId}`;
        if (!previous) {
            this.playerRuntimeService.ensurePlayer(playerId, sessionId);

            const runtimePlayer = targetInstance.connectPlayer({
                playerId,
                sessionId,
                preferredX: command.x,
                preferredY: command.y,
            });
            targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            this.playerLocations.set(playerId, {
                instanceId: targetInstance.meta.instanceId,
                sessionId: runtimePlayer.sessionId,
            });
        }
        else if (previous.instanceId !== targetInstance.meta.instanceId) {
            this.instances.get(previous.instanceId)?.disconnectPlayer(playerId);

            const runtimePlayer = targetInstance.connectPlayer({
                playerId,
                sessionId,
                preferredX: command.x,
                preferredY: command.y,
            });
            targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
            this.playerLocations.set(playerId, {
                instanceId: targetInstance.meta.instanceId,
                sessionId: runtimePlayer.sessionId,
            });
        }
        else if (command.x !== undefined && command.y !== undefined) {
            targetInstance.relocatePlayer(playerId, command.x, command.y);
        }

        const view = this.getPlayerViewOrThrow(playerId);
        this.refreshPlayerContextActions(playerId, view);
        this.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
        if (command.hp !== undefined) {
            this.playerRuntimeService.setVitals(playerId, {
                hp: command.hp,
            });
            this.playerRuntimeService.deferVitalRecoveryUntilTick(playerId, this.resolveCurrentTickForPlayerId(playerId));
        }
        if (command.autoBattle !== undefined) {
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattle: command.autoBattle,
            }, this.resolveCurrentTickForPlayerId(playerId));
        }
    }
    /** dispatchLegacyGmUpdatePlayer：兼容旧版 GM 更新玩家入口。 */
    dispatchLegacyGmUpdatePlayer(command) {
        return this.dispatchGmUpdatePlayer(command);
    }
    /** dispatchGmSpawnBots：执行 GM 生成机器人请求。 */
    dispatchGmSpawnBots(anchorPlayerId, count) {

        const anchor = this.playerRuntimeService.getPlayerOrThrow(anchorPlayerId);
        for (let index = 0; index < count; index += 1) {
            const sequence = this.nextGmBotSequence++;
            const playerId = `${next_gm_constants_1.NEXT_GM_BOT_ID_PREFIX}${Date.now().toString(36)}_${sequence.toString(36)}`;

            const sessionId = `bot:${playerId}`;
            this.playerRuntimeService.ensurePlayer(playerId, sessionId);
            this.playerRuntimeService.setIdentity(playerId, {
                name: `挂机分身${sequence}`,
                displayName: `挂机分身${sequence}`,
            });
            this.connectPlayer({
                playerId,
                sessionId,
                mapId: anchor.templateId || this.resolveDefaultRespawnMapId(),
                preferredX: anchor.x,
                preferredY: anchor.y,
            });

            const view = this.getPlayerViewOrThrow(playerId);
            this.refreshPlayerContextActions(playerId, view);
            this.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattle: true,
                autoRetaliate: true,
            }, this.resolveCurrentTickForPlayerId(playerId));
        }
    }
    /** dispatchLegacyGmSpawnBots：兼容旧版 GM 生成机器人入口。 */
    dispatchLegacyGmSpawnBots(anchorPlayerId, count) {
        return this.dispatchGmSpawnBots(anchorPlayerId, count);
    }
    /** dispatchGmRemoveBots：执行 GM 移除机器人请求。 */
    dispatchGmRemoveBots(playerIds, removeAll) {

        const requestedIds = Array.isArray(playerIds)
            ? playerIds.filter((entry) => typeof entry === 'string' && (0, next_gm_constants_1.isNextGmBotPlayerId)(entry))
            : [];

        const targets = removeAll
            ? this.playerRuntimeService.listPlayerSnapshots()
                .map((player) => player.playerId)
                .filter((playerId) => (0, next_gm_constants_1.isNextGmBotPlayerId)(playerId))
            : requestedIds;
        for (const playerId of targets) {
            this.removePlayer(playerId);
        }
    }
    /** dispatchLegacyGmRemoveBots：兼容旧版 GM 移除机器人入口。 */
    dispatchLegacyGmRemoveBots(playerIds, removeAll) {
        return this.dispatchGmRemoveBots(playerIds, removeAll);
    }
    /** respawnPlayer：把玩家复生请求交给世界运行时处理。 */
    respawnPlayer(playerId) {

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }

        const previous = this.playerLocations.get(playerId);

        const targetMapId = this.resolveDefaultRespawnMapId();

        const targetInstance = this.getOrCreatePublicInstance(targetMapId);
        if (previous) {
            this.instances.get(previous.instanceId)?.disconnectPlayer(playerId);
        }

        const runtimePlayer = targetInstance.connectPlayer({
            playerId,
            sessionId: player.sessionId ?? previous?.sessionId ?? `session:${playerId}`,
            preferredX: targetInstance.template.spawnX,
            preferredY: targetInstance.template.spawnY,
        });
        targetInstance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        this.playerLocations.set(playerId, {
            instanceId: targetInstance.meta.instanceId,
            sessionId: runtimePlayer.sessionId,
        });
        this.navigationIntents.delete(playerId);
        this.playerRuntimeService.respawnPlayer(playerId, {
            instanceId: targetInstance.meta.instanceId,
            templateId: targetInstance.template.id,
            x: runtimePlayer.x,
            y: runtimePlayer.y,
            facing: runtimePlayer.facing,
            currentTick: targetInstance.tick,
        });
        this.queuePlayerNotice(playerId, `已在 ${targetInstance.template.name} 复生`, 'travel');
    }
    /** ensureAttackAllowed：校验当前角色是否允许发起攻击。 */
    ensureAttackAllowed(player, skill) {
        if (skill && !isHostileSkill(skill)) {
            return;
        }
        if (!player.instanceId) {
            return;
        }

        const instance = this.instances.get(player.instanceId);
        if (!instance || !instance.isPointInSafeZone(player.x, player.y)) {
            return;
        }
        throw new common_1.BadRequestException('安全区内无法发起攻击。');
    }
    /** queuePlayerNotice：把通知排入玩家运行态消息队列。 */
    queuePlayerNotice(playerId, text, kind) {
        try {
            this.playerRuntimeService.enqueueNotice(playerId, {
                text,
                kind,
            });
        }
        catch {
            // 玩家已经不在线时忽略通知，避免影响主流程。
        }
    }
    /** advanceCraftJobs：推进炼丹和强化任务。 */
    advanceCraftJobs(playerIds) {
        for (const playerId of playerIds) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            if (this.craftPanelRuntimeService.hasActiveAlchemyJob(player)) {
                this.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickAlchemy(player), 'alchemy');
            }
            if (this.craftPanelRuntimeService.hasActiveEnhancementJob(player)) {
                this.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickEnhancement(player), 'enhancement');
            }
        }
    }
    /** flushCraftMutation：把制作流程变更同步回玩家运行态。 */
    flushCraftMutation(playerId, result, panel) {
        if (!result?.ok) {
            return;
        }
        if (Array.isArray(result.groundDrops) && result.groundDrops.length > 0) {
            this.dropCraftGroundItems(playerId, result.groundDrops);
        }
        for (const message of result.messages ?? []) {
            if (message?.text) {
                this.queuePlayerNotice(playerId, message.text, message.kind ?? 'info');
            }
        }
        if (result.panelChanged) {
            this.emitCraftPanelUpdate(playerId, panel);
        }
    }
    /** dropCraftGroundItems：把制作产物落到玩家脚边或回填背包。 */
    dropCraftGroundItems(playerId, items) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const instance = this.getInstanceRuntimeOrThrow(player.instanceId);
        for (const item of items) {
            try {
                this.spawnGroundItem(instance, player.x, player.y, item);
                this.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 背包放不下，已落在你脚边。`, 'loot');
            }
            catch {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
                this.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 无法落地，已直接放回背包。`, 'warn');
            }
        }
    }
    /** emitCraftPanelUpdate：向客户端推送制作面板更新。 */
    emitCraftPanelUpdate(playerId, panel) {
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!socket || !player || !this.worldClientEventService.prefersNext(socket)) {
            return;
        }
        if (panel === 'alchemy') {
            socket.emit(shared_1.NEXT_S2C.AlchemyPanel, this.craftPanelRuntimeService.buildAlchemyPanelPayload(player));
            return;
        }
        socket.emit(shared_1.NEXT_S2C.EnhancementPanel, this.craftPanelRuntimeService.buildEnhancementPanelPayload(player));
    }
    /** pushCombatEffect：收集战斗特效，等待同步层统一发送。 */
    pushCombatEffect(instanceId, effect) {

        const list = this.latestCombatEffectsByInstanceId.get(instanceId);
        if (list) {
            list.push(effect);
            return;
        }
        this.latestCombatEffectsByInstanceId.set(instanceId, [effect]);
    }
    /** pushActionLabelEffect：追加动作标签浮字特效。 */
    pushActionLabelEffect(instanceId, x, y, text) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text,
            color: '#efe3c2',
            variant: 'action',
        });
    }
    /** pushDamageFloatEffect：追加伤害数字浮字特效。 */
    pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text: `-${Math.max(0, Math.round(damage))}`,
            color,
            variant: 'damage',
        });
    }
    /** pushAttackEffect：追加攻击轨迹特效。 */
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.pushCombatEffect(instanceId, {
            type: 'attack',
            fromX,
            fromY,
            toX,
            toY,
            color,
        });
    }
};
exports.WorldRuntimeService = WorldRuntimeService;
exports.WorldRuntimeService = WorldRuntimeService = WorldRuntimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    /** __param：param。 */
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_client_event_service_1.WorldClientEventService))),
    /** __metadata：metadata。 */
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        map_persistence_service_1.MapPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService,
        redeem_code_runtime_service_1.RedeemCodeRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService])
], WorldRuntimeService);
// helper functions were split into dedicated helper modules for maintainability.
//# sourceMappingURL=world-runtime.service.js.map
