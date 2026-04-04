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
const legacy_gm_compat_constants_1 = require("../../compat/legacy/legacy-gm-compat.constants");
const content_template_repository_1 = require("../../content/content-template.repository");
const world_session_service_1 = require("../../network/world-session.service");
const world_client_event_service_1 = require("../../network/world-client-event.service");
const map_persistence_service_1 = require("../../persistence/map-persistence.service");
const redeem_code_runtime_service_1 = require("../redeem/redeem-code-runtime.service");
const player_combat_service_1 = require("../combat/player-combat.service");
const map_instance_runtime_1 = require("../instance/map-instance.runtime");
const map_template_repository_1 = require("../map/map-template.repository");
const player_runtime_service_1 = require("../player/player-runtime.service");
const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';
const NPC_SHOP_CURRENCY_ITEM_ID = 'spirit_stone';
const OBSERVATION_BLIND_RATIO = 0.2;
const OBSERVATION_FULL_RATIO = 1.2;
const TICK_METRIC_WINDOW_SIZE = 60;
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
    nextLegacyCompatBotSequence = 1;
    constructor(contentTemplateRepository, templateRepository, mapPersistenceService, playerRuntimeService, playerCombatService, worldSessionService, worldClientEventService, redeemCodeRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.mapPersistenceService = mapPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
        this.redeemCodeRuntimeService = redeemCodeRuntimeService;
    }
    async onModuleInit() {
        this.bootstrapPublicInstances();
    }
    async onApplicationBootstrap() {
        await this.rebuildPersistentRuntimeAfterRestore();
    }
    listMapTemplates() {
        return this.templateRepository.listSummaries();
    }
    listInstances() {
        return Array.from(this.instances.values(), (instance) => instance.snapshot());
    }
    getInstance(instanceId) {
        return this.instances.get(instanceId)?.snapshot() ?? null;
    }
    listInstanceMonsters(instanceId) {
        return this.getInstanceRuntimeOrThrow(instanceId).listMonsters();
    }
    getInstanceMonster(instanceId, runtimeId) {
        return this.getInstanceRuntimeOrThrow(instanceId).getMonster(runtimeId);
    }
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
    getLegacyCombatEffects(instanceId) {
        const effects = this.latestCombatEffectsByInstanceId.get(instanceId);
        return effects ? effects.map((entry) => cloneCombatEffect(entry)) : [];
    }
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
        this.logger.debug(`Player ${playerId} attached to ${targetInstance.meta.instanceId}`);
        return this.getPlayerViewOrThrow(playerId);
    }
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
    removePlayer(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
        this.worldSessionService.purgePlayerSession(normalizedPlayerId);
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
    enqueueMove(playerId, directionInput) {
        const direction = parseDirection(directionInput);
        this.getPlayerLocationOrThrow(playerId);
        this.navigationIntents.delete(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'move',
            direction,
            continuous: true,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput) {
        const location = this.getPlayerLocationOrThrow(playerId);
        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);
        const x = normalizeCoordinate(xInput, 'x');
        const y = normalizeCoordinate(yInput, 'y');
        if (!isInBounds(x, y, instance.template.width, instance.template.height)) {
            throw new common_1.BadRequestException('目标超出地图范围');
        }
        this.pendingCommands.set(playerId, {
            kind: 'moveTo',
            x,
            y,
            allowNearestReachable: allowNearestReachableInput === true,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    usePortal(playerId) {
        this.getPlayerLocationOrThrow(playerId);
        this.navigationIntents.delete(playerId);
        this.pendingCommands.set(playerId, { kind: 'portal' });
        return this.getPlayerViewOrThrow(playerId);
    }
    navigateQuest(playerId, questIdInput) {
        this.getPlayerLocationOrThrow(playerId);
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
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
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
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.navigationIntents.delete(playerId);
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
    enqueueUseItem(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'useItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    enqueueDropItem(playerId, slotIndexInput, countInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'dropItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
            count: normalizePositiveCount(countInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
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
    enqueueEquip(playerId, slotIndexInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'equip',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    enqueueUnequip(playerId, slotInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    enqueueCultivate(playerId, techniqueIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'cultivate',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        });
        return this.getPlayerViewOrThrow(playerId);
    }
    enqueueRedeemCodes(playerId, codesInput) {
        this.getPlayerLocationOrThrow(playerId);
        this.pendingCommands.set(playerId, {
            kind: 'redeemCodes',
            codes: Array.isArray(codesInput) ? codesInput.filter((entry) => typeof entry === 'string') : [],
        });
        return this.getPlayerViewOrThrow(playerId);
    }
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
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput) {
        return this.enqueueCastSkill(playerId, skillIdInput, null, null, targetRefInput);
    }
    buildNpcShopView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        return this.createNpcShopEnvelope(playerId, npcId);
    }
    buildQuestListView(playerId, _input) {
        this.getPlayerLocationOrThrow(playerId);
        this.refreshQuestStates(playerId);
        return {
            quests: this.playerRuntimeService.listQuests(playerId),
        };
    }
    buildNpcQuestsView(playerId, npcIdInput) {
        this.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        this.refreshQuestStates(playerId);
        return this.createNpcQuestsEnvelope(playerId, npcId);
    }
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
            entities.push({
                id: monster.runtimeId,
                name: monster.name,
                kind: 'monster',
                monsterTier: monster.tier,
                hp: monster.hp,
                maxHp: monster.maxHp,
                observation: buildMonsterObservation(viewer.attrs.finalAttrs.spirit, monster),
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
            .sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'zh-Hans-CN'));
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
    refreshPlayerContextActions(playerId, view) {
        const resolvedView = view ?? this.getPlayerView(playerId);
        if (!resolvedView) {
            return null;
        }
        this.playerRuntimeService.setContextActions(playerId, this.buildContextActions(resolvedView), resolvedView.tick);
        return resolvedView;
    }
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
    enqueueLegacyNpcInteraction(playerId, actionIdInput) {
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
            kind: 'legacyNpcInteraction',
            npcId,
        });
        return this.getPlayerViewOrThrow(playerId);
    }
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
    enqueueLegacyGmUpdatePlayer(input) {
        const playerId = typeof input?.playerId === 'string' ? input.playerId.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'legacyGmUpdatePlayer',
            playerId,
            mapId: typeof input?.mapId === 'string' ? input.mapId.trim() : '',
            x: Number.isFinite(input?.x) ? Math.trunc(input.x) : undefined,
            y: Number.isFinite(input?.y) ? Math.trunc(input.y) : undefined,
            hp: Number.isFinite(input?.hp) ? Math.trunc(input.hp) : undefined,
            autoBattle: typeof input?.autoBattle === 'boolean' ? input.autoBattle : undefined,
        });
        return { queued: true };
    }
    enqueueLegacyGmResetPlayer(playerIdInput) {
        const playerId = typeof playerIdInput === 'string' ? playerIdInput.trim() : '';
        if (!playerId) {
            throw new common_1.BadRequestException('playerId is required');
        }
        this.pendingSystemCommands.push({
            kind: 'legacyGmResetPlayer',
            playerId,
        });
        return { queued: true };
    }
    enqueueLegacyGmSpawnBots(anchorPlayerIdInput, countInput) {
        const anchorPlayerId = typeof anchorPlayerIdInput === 'string' ? anchorPlayerIdInput.trim() : '';
        if (!anchorPlayerId) {
            throw new common_1.BadRequestException('anchorPlayerId is required');
        }
        const count = Math.max(0, Math.min(200, Math.trunc(countInput)));
        if (!Number.isFinite(count) || count <= 0) {
            throw new common_1.BadRequestException('count must be greater than 0');
        }
        this.pendingSystemCommands.push({
            kind: 'legacyGmSpawnBots',
            anchorPlayerId,
            count,
        });
        return { queued: true };
    }
    enqueueLegacyGmRemoveBots(playerIdsInput, allInput) {
        const playerIds = Array.isArray(playerIdsInput)
            ? playerIdsInput
                .filter((entry) => typeof entry === 'string')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
            : [];
        this.pendingSystemCommands.push({
            kind: 'legacyGmRemoveBots',
            playerIds,
            all: allInput === true,
        });
        return { queued: true };
    }
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
    resolveCurrentTickForPlayerId(playerId) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return this.tick;
        }
        return this.instances.get(player.instanceId)?.tick ?? this.tick;
    }
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
    getRuntimeSummary() {
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
    listDirtyPersistentInstances() {
        const dirty = new Set(this.dirtyContainerPersistenceInstanceIds);
        for (const [instanceId, instance] of this.instances.entries()) {
            if (instance.meta.persistent && instance.isPersistentDirty()) {
                dirty.add(instanceId);
            }
        }
        return Array.from(dirty).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
    }
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
    markMapPersisted(instanceId) {
        this.instances.get(instanceId)?.markAuraPersisted();
        this.dirtyContainerPersistenceInstanceIds.delete(instanceId);
    }
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
        })).sort((left, right) => left.sourceId.localeCompare(right.sourceId, 'zh-Hans-CN'));
    }
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
    markContainerPersistenceDirty(instanceId) {
        this.dirtyContainerPersistenceInstanceIds.add(instanceId);
    }
    tickAll() {
        return this.advanceFrame(1000);
    }
    advanceFrame(frameDurationMs = 1000, getInstanceTickSpeed = null) {
        const startedAt = performance.now();
        this.latestCombatEffectsByInstanceId.clear();
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
        pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
        return totalLogicalTicks;
    }
    recordSyncFlushDuration(durationMs) {
        this.lastSyncFlushDurationMs = roundDurationMs(durationMs);
        pushDurationMetric(this.syncFlushDurationHistoryMs, this.lastSyncFlushDurationMs);
    }
    bootstrapPublicInstances() {
        for (const template of this.templateRepository.list()) {
            this.createInstance({
                instanceId: buildPublicInstanceId(template.id),
                templateId: template.id,
                kind: 'public',
                persistent: true,
            });
        }
        this.logger.log(`Bootstrapped ${this.instances.size} public instances`);
    }
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
    createInstance(input) {
        const existing = this.instances.get(input.instanceId);
        if (existing) {
            return existing;
        }
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
    getPlayerLocationOrThrow(playerId) {
        const location = this.playerLocations.get(playerId);
        if (!location) {
            throw new common_1.NotFoundException(`Player ${playerId} is not connected`);
        }
        return location;
    }
    getInstanceRuntimeOrThrow(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new common_1.NotFoundException(`Instance ${instanceId} not found`);
        }
        return instance;
    }
    getPlayerViewOrThrow(playerId) {
        const view = this.getPlayerView(playerId);
        if (!view) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return view;
    }
    applyTransfer(transfer) {
        const source = this.instances.get(transfer.fromInstanceId);
        if (!source) {
            return;
        }
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
                    });
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.navigationIntents.delete(playerId);
                this.queuePlayerNotice(playerId, message, 'warn');
            }
        }
    }
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
                return { kind: 'portal' };
            }
            const direction = findNextDirectionOnMap(instance, player.playerId, player.x, player.y, [{
                    x: portal.x,
                    y: portal.y,
                }]);
            if (direction === null) {
                throw new common_1.BadRequestException('前往界门的路径不可达');
            }
            return { kind: 'move', direction };
        }
        if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
            return { kind: 'done' };
        }
        const direction = findNextDirectionOnMap(instance, player.playerId, player.x, player.y, destination.goals);
        if (direction === null) {
            throw new common_1.BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }
        return { kind: 'move', direction };
    }
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
                this.logger.warn(`Failed to resolve pending command for ${playerId}: ${command.kind} (${message})`);
                this.queuePlayerNotice(playerId, message, 'warn');
            }
        }
        this.pendingCommands.clear();
    }
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
                this.logger.warn(`Failed to resolve system command ${command.kind}: ${message}`);
            }
        }
    }
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
            instance.enqueueMove({
                playerId,
                direction: command.direction,
                continuous: command.continuous === true,
            });
            return;
        }
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
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
                this.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable);
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
            this.logger.warn(`Failed to resolve redeem codes for ${playerId}: ${message}`);
            this.queuePlayerNotice(playerId, message, 'warn');
        });
    }
    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null) {
        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
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
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked) {
        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        if (!targetMonsterId) {
            const targetRef = targetPlayerId
                ? `player:${targetPlayerId}`
                : (targetX !== null && targetY !== null ? `tile:${targetX}:${targetY}` : null);
            if (locked && targetRef) {
                this.playerRuntimeService.updateCombatSettings(playerId, {
                    autoBattle: true,
                }, currentTick);
                this.playerRuntimeService.setCombatTarget(playerId, targetRef, true, currentTick);
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
            case 'legacyGmUpdatePlayer':
                this.dispatchLegacyGmUpdatePlayer(command);
                return;
            case 'legacyGmResetPlayer':
                this.respawnPlayer(command.playerId);
                return;
            case 'legacyGmSpawnBots':
                this.dispatchLegacyGmSpawnBots(command.anchorPlayerId, command.count);
                return;
            case 'legacyGmRemoveBots':
                this.dispatchLegacyGmRemoveBots(command.playerIds, command.all);
                return;
        }
    }
    dispatchUseItem(playerId, slotIndex) {
        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        const learnedTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
        if (item.mapUnlockId) {
            if (!this.templateRepository.has(item.mapUnlockId)) {
                throw new common_1.BadRequestException(`Unknown map unlock target: ${item.mapUnlockId}`);
            }
            if (this.playerRuntimeService.hasUnlockedMap(playerId, item.mapUnlockId)) {
                throw new common_1.BadRequestException(`Map ${item.mapUnlockId} already unlocked`);
            }
            this.playerRuntimeService.unlockMap(playerId, item.mapUnlockId);
            this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
            this.refreshQuestStates(playerId);
            const targetName = this.templateRepository.getOrThrow(item.mapUnlockId).name;
            this.queuePlayerNotice(playerId, `已解锁地图：${targetName}`, 'success');
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
    dispatchBreakthrough(playerId) {
        this.playerRuntimeService.attemptBreakthrough(playerId, this.resolveCurrentTickForPlayerId(playerId));
    }
    dispatchHeavenGateAction(playerId, action, element) {
        this.playerRuntimeService.handleHeavenGateAction(playerId, action, element, this.resolveCurrentTickForPlayerId(playerId));
    }
    dispatchMoveTo(playerId, x, y, allowNearestReachable) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.recordActivity(playerId, this.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        this.navigationIntents.set(playerId, {
            kind: 'point',
            mapId: player.templateId,
            x,
            y,
            allowNearestReachable,
        });
    }
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = this.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, {
            interruptCultivation: true,
        });
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        this.ensureAttackAllowed(attacker);
        const baseDamage = Math.max(1, Math.round(Math.max(attacker.attrs.numericStats.physAtk, attacker.attrs.numericStats.spellAtk)));
        if (targetMonsterId) {
            const instance = this.getInstanceRuntimeOrThrow(attacker.instanceId);
            const monster = instance.getMonster(targetMonsterId);
            if (!monster || !monster.alive) {
                throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
            }
            if (chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y) > 1) {
                throw new common_1.BadRequestException('目标超出攻击距离');
            }
            const damage = computeResolvedDamage(baseDamage, 'physical', attacker.attrs.numericStats, attacker.attrs.ratioDivisors, monster.numericStats, monster.ratioDivisors);
            const effectColor = (0, shared_1.getDamageTrailColor)('physical');
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, monster.x, monster.y, effectColor);
            this.pushDamageFloatEffect(attacker.instanceId, monster.x, monster.y, damage, effectColor);
            const outcome = instance.applyDamageToMonster(targetMonsterId, damage, attacker.playerId);
            if (outcome?.defeated) {
                this.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
            }
            this.queuePlayerNotice(playerId, `你攻击命中 ${monster.name}，造成 ${damage} 点伤害`, 'combat');
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
            const damage = computeResolvedDamage(baseDamage, 'physical', attacker.attrs.numericStats, attacker.attrs.ratioDivisors, target.attrs.numericStats, target.attrs.ratioDivisors);
            const effectColor = (0, shared_1.getDamageTrailColor)('physical');
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
            this.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, damage, effectColor);
            const updated = this.playerRuntimeService.applyDamage(target.playerId, damage);
            this.playerRuntimeService.recordActivity(target.playerId, currentTick, {
                interruptCultivation: true,
            });
            if (updated.hp <= 0) {
                this.handlePlayerDefeat(updated.playerId);
            }
            this.queuePlayerNotice(playerId, `你攻击命中 ${target.playerId}，造成 ${damage} 点伤害`, 'combat');
            this.queuePlayerNotice(target.playerId, `你受到 ${attacker.playerId} 攻击，损失 ${damage} 点气血`, 'combat');
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
            const effectColor = (0, shared_1.getDamageTrailColor)('physical');
            this.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, '攻击');
            this.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
            if (result.appliedDamage > 0) {
                this.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, result.appliedDamage, effectColor);
            }
            this.queuePlayerNotice(playerId, `你攻击命中地块，造成 ${result.appliedDamage} 点伤害`, 'combat');
            return;
        }
        throw new common_1.BadRequestException('target is required');
    }
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
        removeContainerRowEntries(resolved.state.entries, row.entries);
        if (!resolved.state.activeSearch && hasHiddenContainerEntries(resolved.state.entries)) {
            this.beginContainerSearch(resolved.state, resolved.container.grade);
        }
        this.markContainerPersistenceDirty(instanceId);
        return { ...row.item };
    }
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
            applyContainerEntriesToInventorySimulation(simulatedInventory, row.entries);
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
    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity) {
        const validated = this.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        this.playerRuntimeService.consumeInventoryItemByItemId(playerId, NPC_SHOP_CURRENCY_ITEM_ID, validated.totalCost);
        this.playerRuntimeService.receiveInventoryItem(playerId, validated.item);
        this.refreshQuestStates(playerId);
        this.queuePlayerNotice(playerId, `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.getNpcShopCurrencyName()} x${validated.totalCost}`, 'success');
    }
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
            this.queuePlayerNotice(playerId, `${npc.name}：${buildLegacyNpcQuestProgressText(activeQuest)}`, 'info');
            return;
        }
        this.queuePlayerNotice(playerId, `${npc.name}：${npc.dialogue}`, 'info');
    }
    dispatchEquipItem(playerId, slotIndex) {
        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        this.playerRuntimeService.equipItem(playerId, slotIndex);
        this.queuePlayerNotice(playerId, `装备 ${item.name}`, 'success');
    }
    dispatchUnequipItem(playerId, slot) {
        const item = this.playerRuntimeService.peekEquippedItem(playerId, slot);
        if (!item) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} is empty`);
        }
        this.playerRuntimeService.unequipItem(playerId, slot);
        this.queuePlayerNotice(playerId, `卸下 ${item.name}`, 'info');
    }
    dispatchCultivateTechnique(playerId, techniqueId) {
        this.playerRuntimeService.cultivateTechnique(playerId, techniqueId);
        if (!techniqueId) {
            this.queuePlayerNotice(playerId, '已停止当前修炼', 'info');
            return;
        }
        const techniqueName = this.playerRuntimeService.getTechniqueName(playerId, techniqueId) ?? techniqueId;
        this.queuePlayerNotice(playerId, `开始修炼 ${techniqueName}`, 'success');
    }
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
    spawnGroundItem(instance, x, y, item) {
        const pile = instance.dropGroundItem(x, y, item);
        if (!pile) {
            throw new common_1.BadRequestException(`Failed to spawn loot at ${x},${y}`);
        }
    }
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
    deliverMonsterLoot(playerId, instance, x, y, item) {
        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            this.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }
        this.spawnGroundItem(instance, x, y, item);
        this.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, 'loot');
    }
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
    resolveAdjacentNpc(playerId, npcId) {
        const location = this.getPlayerLocationOrThrow(playerId);
        const instance = this.getInstanceRuntimeOrThrow(location.instanceId);
        const npc = instance.getAdjacentNpc(playerId, npcId);
        if (!npc) {
            throw new common_1.NotFoundException('你离这位商人太远了');
        }
        return npc;
    }
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
    createNpcQuestsEnvelope(playerId, npcId) {
        const npc = this.resolveAdjacentNpc(playerId, npcId);
        return {
            npcId: npc.npcId,
            npcName: npc.name,
            quests: this.collectNpcQuestViews(playerId, npc),
        };
    }
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
    canQuestBecomeReady(playerId, quest) {
        if (quest.progress < quest.required) {
            return false;
        }
        return !quest.requiredItemId || this.playerRuntimeService.getInventoryCountByItemId(playerId, quest.requiredItemId) >= (quest.requiredItemCount ?? 1);
    }
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
    getNpcForPlayerMap(playerId, npcId) {
        const location = this.playerLocations.get(playerId);
        if (!location) {
            return null;
        }
        return this.instances.get(location.instanceId)?.getNpc(npcId) ?? null;
    }
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
    getNpcShopCurrencyName() {
        return this.contentTemplateRepository.createItem(NPC_SHOP_CURRENCY_ITEM_ID, 1)?.name ?? NPC_SHOP_CURRENCY_ITEM_ID;
    }
    decoratePlayerViewNpcs(playerId, view) {
        return {
            ...view,
            localNpcs: view.localNpcs.map((entry) => ({
                ...entry,
                questMarker: this.resolveNpcQuestMarker(playerId, entry.npcId),
            })),
        };
    }
    buildContextActions(view) {
        const actions = [];
        const player = this.playerRuntimeService.getPlayer(view.playerId);
        actions.push({
            id: 'battle:force_attack',
            name: '强制攻击',
            type: 'battle',
            desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
            cooldownLeft: 0,
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
        actions.sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
        return actions;
    }
    applyMonsterAction(action) {
        if (action.kind === 'skill') {
            this.applyMonsterSkill(action);
            return;
        }
        this.applyMonsterBasicAttack(action);
    }
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
            this.logger.warn(`Failed to resolve monster skill ${action.skillId} from ${action.runtimeId}: ${message}`);
        }
    }
    handlePlayerDefeat(playerId) {
        this.pendingCommands.delete(playerId);
        this.pendingRespawnPlayerIds.add(playerId);
    }
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
    dispatchLegacyGmUpdatePlayer(command) {
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
    dispatchLegacyGmSpawnBots(anchorPlayerId, count) {
        const anchor = this.playerRuntimeService.getPlayerOrThrow(anchorPlayerId);
        for (let index = 0; index < count; index += 1) {
            const sequence = this.nextLegacyCompatBotSequence++;
            const playerId = `${legacy_gm_compat_constants_1.LEGACY_GM_COMPAT_BOT_ID_PREFIX}${Date.now().toString(36)}_${sequence.toString(36)}`;
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
    dispatchLegacyGmRemoveBots(playerIds, removeAll) {
        const requestedIds = Array.isArray(playerIds)
            ? playerIds.filter((entry) => typeof entry === 'string' && (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry))
            : [];
        const targets = removeAll
            ? this.playerRuntimeService.listPlayerSnapshots()
                .map((player) => player.playerId)
                .filter((playerId) => (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(playerId))
            : requestedIds;
        for (const playerId of targets) {
            this.removePlayer(playerId);
        }
    }
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
    pushCombatEffect(instanceId, effect) {
        const list = this.latestCombatEffectsByInstanceId.get(instanceId);
        if (list) {
            list.push(effect);
            return;
        }
        this.latestCombatEffectsByInstanceId.set(instanceId, [effect]);
    }
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
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_client_event_service_1.WorldClientEventService))),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        map_persistence_service_1.MapPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService,
        redeem_code_runtime_service_1.RedeemCodeRuntimeService])
], WorldRuntimeService);
function normalizeRuntimeActionId(actionIdInput) {
    const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
    if (!actionId) {
        return '';
    }
    if (actionId.startsWith('npc:')) {
        return `npc_quests:${actionId.slice('npc:'.length)}`;
    }
    return actionId;
}
function buildPublicInstanceId(templateId) {
    return `public:${templateId}`;
}
function formatItemStackLabel(item) {
    const label = item.name ?? item.itemId;
    return item.count > 1 ? `${label} x${item.count}` : label;
}
function formatItemListSummary(items) {
    const preview = items.slice(0, 3).map((entry) => formatItemStackLabel(entry));
    if (items.length <= 3) {
        return preview.join('、');
    }
    return `${preview.join('、')} 等 ${items.length} 种物品`;
}
function cloneCombatEffect(source) {
    return { ...source };
}
function buildContainerSourceId(instanceId, containerId) {
    return `container:${instanceId}:${containerId}`;
}
function isContainerSourceId(sourceId) {
    return sourceId.startsWith('container:');
}
function parseContainerSourceId(sourceId) {
    if (!isContainerSourceId(sourceId)) {
        return null;
    }
    const prefixLength = 'container:'.length;
    const splitIndex = sourceId.indexOf(':', prefixLength);
    if (splitIndex < 0) {
        return null;
    }
    const instanceId = sourceId.slice(prefixLength, splitIndex).trim();
    const containerId = sourceId.slice(splitIndex + 1).trim();
    if (!instanceId || !containerId) {
        return null;
    }
    return {
        instanceId,
        containerId,
    };
}
function createSyncedItemStackSignature(item) {
    const comparableEntries = Object.entries(item)
        .filter(([key, value]) => key !== 'count' && value !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return JSON.stringify(Object.fromEntries(comparableEntries));
}
function groupContainerLootRows(entries) {
    const rows = [];
    const index = new Map();
    const sorted = entries.slice().sort((left, right) => left.createdTick - right.createdTick);
    for (const entry of sorted) {
        const itemKey = createSyncedItemStackSignature(entry.item);
        const existing = index.get(itemKey);
        if (existing) {
            existing.item.count += entry.item.count;
            existing.entries.push(entry);
            continue;
        }
        const created = {
            itemKey,
            item: { ...entry.item },
            entries: [entry],
        };
        index.set(itemKey, created);
        rows.push(created);
    }
    return rows;
}
function hasHiddenContainerEntries(entries) {
    return entries.some((entry) => !entry.visible);
}
function buildContainerWindowItems(entries) {
    return groupContainerLootRows(entries.filter((entry) => entry.visible)).map((entry) => ({
        itemKey: entry.itemKey,
        item: { ...entry.item },
    }));
}
function cloneInventorySimulation(items) {
    return items.map((entry) => ({ ...entry }));
}
function canReceiveContainerEntries(simulatedInventory, capacity, entries) {
    const simulated = cloneInventorySimulation(simulatedInventory);
    applyContainerEntriesToInventorySimulation(simulated, entries);
    return simulated.length <= capacity;
}
function applyContainerEntriesToInventorySimulation(simulatedInventory, entries) {
    for (const entry of entries) {
        const item = entry.item;
        const existing = simulatedInventory.find((candidate) => candidate.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
            continue;
        }
        simulatedInventory.push({ ...item });
    }
}
function canReceiveContainerRow(player, entries) {
    return canReceiveContainerEntries(cloneInventorySimulation(player.inventory.items), player.inventory.capacity, entries);
}
function removeContainerRowEntries(source, removed) {
    if (removed.length === 0) {
        return;
    }
    const removedSet = new Set(removed);
    let writeIndex = 0;
    for (let index = 0; index < source.length; index += 1) {
        const entry = source[index];
        if (removedSet.has(entry)) {
            continue;
        }
        source[writeIndex++] = entry;
    }
    source.length = writeIndex;
}
function buildLegacyNpcQuestProgressText(quest) {
    switch (quest.objectiveType) {
        case 'kill':
            return `去猎杀 ${quest.targetName}（${quest.progress}/${quest.required}）。`;
        case 'submit_item':
            return `收集 ${quest.targetName}（${quest.progress}/${quest.required}）。`;
        case 'talk':
            return quest.targetNpcName
                ? `去找 ${quest.targetNpcName} 传话。`
                : `去找 ${quest.targetName} 传话。`;
        case 'learn_technique':
            return `修成 ${quest.targetName}。`;
        case 'realm_progress':
        case 'realm_stage':
            return `继续修炼至 ${quest.targetName}。`;
        default:
            return quest.desc || quest.title;
    }
}
function canReceiveItemStack(player, item) {
    if (player.inventory.items.some((entry) => entry.itemId === item.itemId)) {
        return true;
    }
    return player.inventory.items.length < player.inventory.capacity;
}
function toQuestRewardItem(item, fallback) {
    if (!item) {
        return fallback;
    }
    return {
        ...fallback,
        ...item,
        name: item.name ?? fallback.name,
        type: item.type ?? fallback.type,
        desc: item.desc ?? fallback.desc,
        count: item.count,
    };
}
function roundDurationMs(value) {
    return Number(value.toFixed(3));
}
function pushDurationMetric(history, value) {
    history.push(value);
    if (history.length > TICK_METRIC_WINDOW_SIZE) {
        history.shift();
    }
}
function summarizeDurations(last, history) {
    if (history.length === 0) {
        return {
            last,
            avg60: last,
            max60: last,
        };
    }
    let total = 0;
    let max = 0;
    for (const value of history) {
        total += value;
        if (value > max) {
            max = value;
        }
    }
    return {
        last,
        avg60: roundDurationMs(total / history.length),
        max60: roundDurationMs(max),
    };
}
function normalizeQuestLine(value) {
    return value === 'main' || value === 'daily' || value === 'encounter' ? value : 'side';
}
function normalizeQuestObjectiveType(value) {
    return value === 'talk'
        || value === 'submit_item'
        || value === 'learn_technique'
        || value === 'realm_progress'
        || value === 'realm_stage'
        ? value
        : 'kill';
}
function normalizeQuestRequired(quest, objectiveType) {
    if (objectiveType === 'submit_item') {
        if (Number.isInteger(quest.requiredItemCount) && Number(quest.requiredItemCount) > 0) {
            return Number(quest.requiredItemCount);
        }
    }
    if (Number.isInteger(quest.required) && Number(quest.required) > 0) {
        return Number(quest.required);
    }
    if (Number.isInteger(quest.targetCount) && Number(quest.targetCount) > 0) {
        return Number(quest.targetCount);
    }
    return 1;
}
function normalizeQuestRealmStage(value) {
    if (typeof value === 'number' && shared_1.PlayerRealmStage[value] !== undefined) {
        return value;
    }
    if (typeof value === 'string' && shared_1.PlayerRealmStage[value] !== undefined) {
        return shared_1.PlayerRealmStage[value];
    }
    return undefined;
}
function resolveQuestTargetLabel(objectiveType, quest, targetRealmStage, targetNpcName, requiredItemName, techniqueName) {
    if (typeof quest.targetName === 'string' && quest.targetName.trim()) {
        return quest.targetName;
    }
    if (objectiveType === 'talk') {
        return typeof quest.targetNpcName === 'string' && quest.targetNpcName.trim()
            ? quest.targetNpcName
            : targetNpcName || (typeof quest.targetNpcId === 'string' ? quest.targetNpcId : quest.title);
    }
    if (objectiveType === 'submit_item') {
        return requiredItemName || (typeof quest.requiredItemId === 'string' ? quest.requiredItemId : quest.title);
    }
    if (objectiveType === 'learn_technique') {
        return techniqueName || (typeof quest.targetTechniqueId === 'string' ? quest.targetTechniqueId : quest.title);
    }
    if ((objectiveType === 'realm_progress' || objectiveType === 'realm_stage') && targetRealmStage !== undefined) {
        return shared_1.PLAYER_REALM_CONFIG[targetRealmStage]?.name ?? shared_1.PlayerRealmStage[targetRealmStage];
    }
    if (objectiveType === 'kill' && typeof quest.targetMonsterId === 'string' && quest.targetMonsterId.trim()) {
        return quest.targetMonsterId;
    }
    return quest.title;
}
function buildQuestRewardText(quest, rewards) {
    if (typeof quest.rewardText === 'string' && quest.rewardText.trim()) {
        return quest.rewardText;
    }
    if (rewards.length === 0) {
        return '';
    }
    return rewards.map((entry) => formatItemStackLabel(entry)).join('、');
}
function cloneQuestState(quest, status = quest.status) {
    return {
        ...quest,
        status,
        rewardItemIds: quest.rewardItemIds.slice(),
        rewards: quest.rewards.map((reward) => ({ ...reward })),
    };
}
function compareQuestViews(left, right) {
    const statusOrder = {
        ready: 0,
        active: 1,
        available: 2,
        completed: 3,
    };
    return statusOrder[left.status] - statusOrder[right.status]
        || left.line.localeCompare(right.line, 'zh-Hans-CN')
        || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
function parseDirection(input) {
    if (typeof input === 'number' && shared_1.Direction[input] !== undefined) {
        return input;
    }
    if (typeof input === 'string') {
        switch (input.trim().toLowerCase()) {
            case '0':
            case 'north':
            case 'n':
                return shared_1.Direction.North;
            case '1':
            case 'south':
            case 's':
                return shared_1.Direction.South;
            case '2':
            case 'east':
            case 'e':
                return shared_1.Direction.East;
            case '3':
            case 'west':
            case 'w':
                return shared_1.Direction.West;
            default:
                break;
        }
    }
    throw new common_1.BadRequestException(`Unsupported direction: ${String(input)}`);
}
function normalizeSlotIndex(input) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid slotIndex: ${String(input)}`);
    }
    return Math.max(0, Math.trunc(Number(input)));
}
function normalizeEquipSlot(input) {
    const slot = typeof input === 'string' ? input.trim() : '';
    if (!shared_1.EQUIP_SLOTS.includes(slot)) {
        throw new common_1.BadRequestException(`Invalid equip slot: ${String(input)}`);
    }
    return slot;
}
function normalizeTechniqueId(input) {
    return typeof input === 'string' && input.trim() ? input.trim() : null;
}
function normalizeShopQuantity(input) {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
        throw new common_1.BadRequestException('购买数量无效');
    }
    return Math.trunc(input);
}
function normalizePositiveCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid count: ${String(input)}`);
    }
    return Math.max(1, Math.trunc(Number(input)));
}
function normalizeCoordinate(input, label) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid ${label}: ${String(input)}`);
    }
    return Math.trunc(Number(input));
}
function normalizeRollCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid rolls: ${String(input)}`);
    }
    return Math.max(1, Math.min(1000, Math.trunc(Number(input))));
}
function chebyshevDistance(leftX, leftY, rightX, rightY) {
    return Math.max(Math.abs(leftX - rightX), Math.abs(leftY - rightY));
}
function isInBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x < width && y < height;
}
function selectNearestPortal(portals, targetMapId, fromX, fromY) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const portal of portals) {
        if (portal.targetMapId !== targetMapId) {
            continue;
        }
        const distance = Math.abs(portal.x - fromX) + Math.abs(portal.y - fromY);
        if (distance < bestDistance) {
            best = portal;
            bestDistance = distance;
        }
    }
    return best;
}
function buildGoalPoints(instance, targetX, targetY, allowNearestReachable) {
    return buildGoalPointsFromTemplate(instance.template, targetX, targetY, allowNearestReachable);
}
function buildGoalPointsFromTemplate(template, targetX, targetY, allowNearestReachable) {
    const goals = [];
    if (isInBounds(targetX, targetY, template.width, template.height)) {
        const tileIndex = (0, map_template_repository_1.getTileIndex)(targetX, targetY, template.width);
        if (template.walkableMask[tileIndex] === 1) {
            goals.push({ x: targetX, y: targetY });
        }
    }
    if (goals.length > 0 || !allowNearestReachable) {
        return goals;
    }
    for (let radius = 1; radius <= 8; radius += 1) {
        for (let y = targetY - radius; y <= targetY + radius; y += 1) {
            for (let x = targetX - radius; x <= targetX + radius; x += 1) {
                if (!isInBounds(x, y, template.width, template.height)) {
                    continue;
                }
                const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
                if (template.walkableMask[tileIndex] !== 1) {
                    continue;
                }
                goals.push({ x, y });
            }
        }
        if (goals.length > 0) {
            goals.sort((left, right) => (Math.abs(left.x - targetX) + Math.abs(left.y - targetY)) - (Math.abs(right.x - targetX) + Math.abs(right.y - targetY)));
            return dedupeGoalPoints(goals);
        }
    }
    return [];
}
function buildAdjacentGoalPoints(template, centerX, centerY) {
    const goals = [];
    for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            continue;
        }
        const x = centerX + offset.x;
        const y = centerY + offset.y;
        if (!isInBounds(x, y, template.width, template.height)) {
            continue;
        }
        const tileIndex = (0, map_template_repository_1.getTileIndex)(x, y, template.width);
        if (template.walkableMask[tileIndex] !== 1) {
            continue;
        }
        goals.push({ x, y });
    }
    return dedupeGoalPoints(goals);
}
function dedupeGoalPoints(goals) {
    const result = [];
    const seen = new Set();
    for (const goal of goals) {
        const key = `${goal.x},${goal.y}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(goal);
    }
    return result;
}
function findNextDirectionOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
    if (goals.length === 0) {
        return null;
    }
    const template = instance.template;
    const goalIndices = new Set();
    for (const goal of goals) {
        if (!isInBounds(goal.x, goal.y, template.width, template.height)) {
            continue;
        }
        goalIndices.add((0, map_template_repository_1.getTileIndex)(goal.x, goal.y, template.width));
    }
    if (goalIndices.size === 0) {
        return null;
    }
    const blocked = new Uint8Array(template.width * template.height);
    instance.forEachPathingBlocker(playerId, (x, y) => {
        blocked[(0, map_template_repository_1.getTileIndex)(x, y, template.width)] = 1;
    });
    if (allowOccupiedGoals) {
        for (const goalIndex of goalIndices) {
            blocked[goalIndex] = 0;
        }
    }
    const size = template.width * template.height;
    const visited = new Uint8Array(size);
    const previous = new Int32Array(size);
    previous.fill(-1);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const startIndex = (0, map_template_repository_1.getTileIndex)(startX, startY, template.width);
    visited[startIndex] = 1;
    queue[tail++] = startIndex;
    while (head < tail) {
        const current = queue[head++];
        if (goalIndices.has(current)) {
            let cursor = current;
            let parent = previous[cursor];
            while (parent !== -1 && parent !== startIndex) {
                cursor = parent;
                parent = previous[cursor];
            }
            const nextX = cursor % template.width;
            const nextY = Math.trunc(cursor / template.width);
            return directionFromStep(startX, startY, nextX, nextY);
        }
        const x = current % template.width;
        const y = Math.trunc(current / template.width);
        for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
            const offset = DIRECTION_OFFSET[direction];
            if (!offset) {
                continue;
            }
            const nextX = x + offset.x;
            const nextY = y + offset.y;
            if (!isInBounds(nextX, nextY, template.width, template.height)) {
                continue;
            }
            const nextIndex = (0, map_template_repository_1.getTileIndex)(nextX, nextY, template.width);
            if (visited[nextIndex] === 1 || template.walkableMask[nextIndex] !== 1 || blocked[nextIndex] === 1) {
                continue;
            }
            visited[nextIndex] = 1;
            previous[nextIndex] = current;
            queue[tail++] = nextIndex;
        }
    }
    return null;
}
function findPathPointsOnMap(instance, playerId, startX, startY, goals, allowOccupiedGoals = true) {
    if (goals.length === 0) {
        return null;
    }
    const template = instance.template;
    const goalIndices = new Set();
    for (const goal of goals) {
        if (!isInBounds(goal.x, goal.y, template.width, template.height)) {
            continue;
        }
        goalIndices.add((0, map_template_repository_1.getTileIndex)(goal.x, goal.y, template.width));
    }
    if (goalIndices.size === 0) {
        return null;
    }
    const blocked = new Uint8Array(template.width * template.height);
    instance.forEachPathingBlocker(playerId, (x, y) => {
        blocked[(0, map_template_repository_1.getTileIndex)(x, y, template.width)] = 1;
    });
    if (allowOccupiedGoals) {
        for (const goalIndex of goalIndices) {
            blocked[goalIndex] = 0;
        }
    }
    const size = template.width * template.height;
    const visited = new Uint8Array(size);
    const previous = new Int32Array(size);
    previous.fill(-1);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;
    const startIndex = (0, map_template_repository_1.getTileIndex)(startX, startY, template.width);
    visited[startIndex] = 1;
    queue[tail++] = startIndex;
    while (head < tail) {
        const current = queue[head++];
        if (goalIndices.has(current)) {
            return reconstructPathPoints(previous, current, startIndex, template.width);
        }
        const x = current % template.width;
        const y = Math.trunc(current / template.width);
        for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
            const offset = DIRECTION_OFFSET[direction];
            if (!offset) {
                continue;
            }
            const nextX = x + offset.x;
            const nextY = y + offset.y;
            if (!isInBounds(nextX, nextY, template.width, template.height)) {
                continue;
            }
            const nextIndex = (0, map_template_repository_1.getTileIndex)(nextX, nextY, template.width);
            if (visited[nextIndex] === 1 || template.walkableMask[nextIndex] !== 1 || blocked[nextIndex] === 1) {
                continue;
            }
            visited[nextIndex] = 1;
            previous[nextIndex] = current;
            queue[tail++] = nextIndex;
        }
    }
    return null;
}
function reconstructPathPoints(previous, goalIndex, startIndex, width) {
    const path = [];
    let cursor = goalIndex;
    while (cursor !== -1 && cursor !== startIndex) {
        path.push({
            x: cursor % width,
            y: Math.trunc(cursor / width),
        });
        cursor = previous[cursor];
    }
    path.reverse();
    return path;
}
function directionFromStep(startX, startY, nextX, nextY) {
    for (const direction of [shared_1.Direction.North, shared_1.Direction.South, shared_1.Direction.East, shared_1.Direction.West]) {
        const offset = DIRECTION_OFFSET[direction];
        if (!offset) {
            continue;
        }
        if (startX + offset.x === nextX && startY + offset.y === nextY) {
            return direction;
        }
    }
    return null;
}
const DIRECTION_OFFSET = {
    [shared_1.Direction.North]: { x: 0, y: -1 },
    [shared_1.Direction.South]: { x: 0, y: 1 },
    [shared_1.Direction.East]: { x: 1, y: 0 },
    [shared_1.Direction.West]: { x: -1, y: 0 },
};
function computeResolvedDamage(baseDamage, damageKind, attackerStats, attackerRatios, targetStats, targetRatios) {
    const hitGap = Math.max(0, targetStats.dodge - attackerStats.hit);
    if (hitGap > 0 && Math.random() < (0, shared_1.ratioValue)(hitGap, targetRatios.dodge)) {
        return 0;
    }
    const defense = damageKind === 'physical' ? targetStats.physDef : targetStats.spellDef;
    const reduction = Math.max(0, (0, shared_1.ratioValue)(defense, 100));
    const crit = attackerStats.crit > 0 && Math.random() < (0, shared_1.ratioValue)(attackerStats.crit, attackerRatios.crit);
    let damage = Math.max(1, Math.round(baseDamage * (1 - Math.min(0.95, reduction))));
    if (crit) {
        damage = Math.max(1, Math.round(damage * ((200 + Math.max(0, attackerStats.critDamage) / 10) / 100)));
    }
    return Math.max(1, damage);
}
function cloneVisibleBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
function buildPlayerObservation(viewerSpirit, target, selfView = false) {
    return buildObservationInsight(viewerSpirit, target.attrs.finalAttrs.spirit, [
        { threshold: 0.15, label: '气血', value: formatCurrentMaxObservation(target.hp, target.maxHp) },
        { threshold: 0.28, label: '灵力', value: formatCurrentMaxObservation(target.qi, target.maxQi) },
        { threshold: 0.42, label: '体魄', value: String(target.attrs.finalAttrs.constitution) },
        { threshold: 0.58, label: '神识', value: String(target.attrs.finalAttrs.spirit) },
        { threshold: 0.74, label: '感知', value: String(target.attrs.finalAttrs.perception) },
        { threshold: 0.88, label: '悟性', value: String(target.attrs.finalAttrs.comprehension) },
    ], selfView);
}
function buildMonsterObservation(viewerSpirit, monster) {
    return buildObservationInsight(viewerSpirit, monster.attrs.spirit, [
        { threshold: 0.16, label: '气血', value: formatCurrentMaxObservation(monster.hp, monster.maxHp) },
        { threshold: 0.34, label: '体魄', value: String(monster.attrs.constitution) },
        { threshold: 0.58, label: '神识', value: String(monster.attrs.spirit) },
        { threshold: 0.78, label: '境界', value: `等级 ${monster.level}` },
    ]);
}
function buildNpcObservation(npc) {
    const lines = [
        { label: '身份', value: npc.role ?? '寻常人物' },
        { label: '商号', value: npc.hasShop ? '经营货铺' : '暂无营生' },
    ];
    if (typeof npc.dialogue === 'string' && npc.dialogue.trim()) {
        lines.push({ label: '话语', value: npc.dialogue.trim() });
    }
    if (npc.quests.length > 0) {
        lines.push({ label: '委托', value: `可交互 ${npc.quests.length} 项` });
    }
    return {
        clarity: 'clear',
        verdict: npc.quests.length > 0
            ? '对方似乎正等着与来客交谈，身上带着几分未了的委托气息。'
            : npc.hasShop
                ? '对方神色沉稳，像是久经往来的买卖人。'
                : '对方气机平和，看不出明显敌意。',
        lines,
    };
}
function buildPortalTileEntityDetail(portal, targetMapName) {
    const destination = targetMapName
        ? `${targetMapName} (${portal.targetX}, ${portal.targetY})`
        : `${portal.targetMapId} (${portal.targetX}, ${portal.targetY})`;
    return {
        id: buildPortalId(portal.x, portal.y),
        name: buildPortalDisplayName(portal, targetMapName),
        kind: 'portal',
        observation: {
            clarity: 'clear',
            verdict: portal.trigger === 'auto'
                ? '此地灵路与空间缝隙已经贯通，踏入其中便会立刻被牵引离去。'
                : '此地灵路稳定却未主动张开，需要你亲自触动才能穿行。',
            lines: [
                { label: '类型', value: buildPortalKindLabel(portal.kind) },
                { label: '触发', value: portal.trigger === 'auto' ? '踏入即触发' : '需要主动使用' },
                { label: '去向', value: destination },
            ],
        },
    };
}
function buildGroundTileEntityDetail(groundPile) {
    const totalCount = groundPile.items.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.count ?? 0)), 0);
    const previews = groundPile.items
        .slice(0, 3)
        .map((entry) => `${entry.name ?? entry.itemId} x${Math.max(0, Math.round(entry.count ?? 0))}`);
    const remainingKinds = Math.max(0, groundPile.items.length - previews.length);
    const previewText = remainingKinds > 0
        ? `${previews.join('、')} 等 ${groundPile.items.length} 类`
        : previews.join('、');
    return {
        id: groundPile.sourceId,
        name: groundPile.items.length === 1
            ? (groundPile.items[0]?.name ?? groundPile.items[0]?.itemId ?? '地面物品')
            : `散落物品堆 (${groundPile.items.length})`,
        kind: 'ground',
        observation: {
            clarity: 'clear',
            verdict: groundPile.items.length === 1
                ? '地上静静躺着一件可拾取之物。'
                : '地上散落着几样可拾取之物，像是刚被人匆忙遗落。',
            lines: [
                { label: '种类', value: `${groundPile.items.length} 类` },
                { label: '总量', value: `${totalCount} 件` },
                { label: '可见', value: previewText || '暂无可辨之物' },
            ],
        },
    };
}
function buildContainerTileEntityDetail(container) {
    return {
        id: `container:${container.id}`,
        name: container.name,
        kind: 'container',
        observation: {
            clarity: 'clear',
            verdict: container.desc?.trim() || `这处${container.name}可以搜索，翻找后或许会有收获。`,
            lines: [
                { label: '类别', value: '可搜索陈设' },
                { label: '名称', value: container.name },
                { label: '搜索阶次', value: String(container.grade) },
            ],
        },
    };
}
function buildObservationInsight(viewerSpirit, targetSpirit, lines, selfView = false) {
    const progress = selfView ? 1 : computeObservationProgress(viewerSpirit, targetSpirit);
    return {
        clarity: resolveObservationClarity(progress),
        verdict: buildObservationVerdict(progress, selfView),
        lines: lines.map((line) => ({
            label: line.label,
            value: progress >= line.threshold ? line.value : '???',
        })),
    };
}
function computeObservationProgress(viewerSpirit, targetSpirit) {
    const normalizedViewer = Math.max(1, Math.round(viewerSpirit));
    const normalizedTarget = Math.max(1, Math.round(targetSpirit));
    const ratio = normalizedViewer / normalizedTarget;
    if (ratio <= OBSERVATION_BLIND_RATIO) {
        return 0;
    }
    if (ratio >= OBSERVATION_FULL_RATIO) {
        return 1;
    }
    return Math.max(0, Math.min(1, (ratio - OBSERVATION_BLIND_RATIO) / (OBSERVATION_FULL_RATIO - OBSERVATION_BLIND_RATIO)));
}
function resolveObservationClarity(progress) {
    if (progress <= 0) {
        return 'veiled';
    }
    if (progress < 0.34) {
        return 'blurred';
    }
    if (progress < 0.68) {
        return 'partial';
    }
    if (progress < 1) {
        return 'clear';
    }
    return 'complete';
}
function buildObservationVerdict(progress, selfView) {
    if (selfView) {
        return '神识内照，经络与底蕴尽现。';
    }
    if (progress <= 0) {
        return '对方气机晦暗难明，暂时看不透。';
    }
    if (progress < 0.34) {
        return '只能勉强分辨出些许轮廓。';
    }
    if (progress < 0.68) {
        return '已能看出部分深浅，但仍有遮掩。';
    }
    if (progress < 1) {
        return '大致能辨明其底蕴与强弱。';
    }
    return '对方虚实已尽收眼底。';
}
function formatCurrentMaxObservation(current, max) {
    return `${Math.max(0, Math.round(current))} / ${Math.max(0, Math.round(max))}`;
}
function buildPortalDisplayName(portal, targetMapName) {
    const base = buildPortalKindLabel(portal.kind);
    return targetMapName ? `${base} · ${targetMapName}` : base;
}
function buildPortalKindLabel(kind) {
    switch (kind) {
        case 'stairs':
            return '楼梯';
        case 'door':
            return '门扉';
        case 'cave':
            return '洞口';
        case 'gate':
            return '关隘';
        default:
            return '传送点';
    }
}
function buildPortalId(x, y) {
    return `${x}:${y}`;
}
function findPlayerSkill(player, skillId) {
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            if (skill.id === skillId) {
                return skill;
            }
        }
    }
    return null;
}
function isHostileSkill(skill) {
    return skill.effects.some((effect) => effect.type === 'damage' || (effect.type === 'buff' && effect.target === 'target'));
}
function getSkillEffectColor(skill) {
    for (const effect of skill.effects) {
        if (effect.type === 'damage') {
            return (0, shared_1.getDamageTrailColor)(effect.damageKind ?? 'spell', effect.element);
        }
    }
    return (0, shared_1.getDamageTrailColor)('spell');
}
function resolveRuntimeSkillRange(skill) {
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range ?? 1));
}
function resolveAutoBattleSkillQiCost(baseCost, maxQiOutputPerTick) {
    const normalizedBaseCost = Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost ?? 0)) : 0;
    if (normalizedBaseCost <= 0) {
        return 0;
    }
    const outputCap = Number.isFinite(maxQiOutputPerTick) ? Math.max(0, Math.round(maxQiOutputPerTick)) : 0;
    if (outputCap <= 0) {
        return normalizedBaseCost;
    }
    return Math.min(normalizedBaseCost, outputCap);
}
function buildAutoBattleGoalPoints(instance, targetX, targetY, range) {
    const normalizedRange = Math.max(1, Math.round(range));
    const goals = [];
    for (let y = targetY - normalizedRange; y <= targetY + normalizedRange; y += 1) {
        for (let x = targetX - normalizedRange; x <= targetX + normalizedRange; x += 1) {
            if (!isInBounds(x, y, instance.template.width, instance.template.height)) {
                continue;
            }
            if (x === targetX && y === targetY) {
                continue;
            }
            const distance = chebyshevDistance(x, y, targetX, targetY);
            if (distance > normalizedRange) {
                continue;
            }
            goals.push({ x, y });
        }
    }
    goals.sort((left, right) => (Math.abs(chebyshevDistance(left.x, left.y, targetX, targetY) - normalizedRange)
        - Math.abs(chebyshevDistance(right.x, right.y, targetX, targetY) - normalizedRange)) || (chebyshevDistance(left.x, left.y, targetX, targetY) - chebyshevDistance(right.x, right.y, targetX, targetY)) || left.y - right.y || left.x - right.x);
    return goals;
}
function isTileVisibleInView(view, x, y, radius) {
    if (view.self.x === x && view.self.y === y) {
        return true;
    }
    if (Array.isArray(view.visibleTileIndices) && view.visibleTileIndices.length > 0) {
        const tileIndex = x >= 0 && y >= 0 && x < view.instance.width && y < view.instance.height
            ? y * view.instance.width + x
            : -1;
        return view.visibleTileIndices.includes(tileIndex);
    }
    return view.visiblePlayers.some((entry) => entry.x === x && entry.y === y)
        || view.localMonsters.some((entry) => entry.x === x && entry.y === y)
        || view.localNpcs.some((entry) => entry.x === x && entry.y === y)
        || view.localPortals.some((entry) => entry.x === x && entry.y === y)
        || view.localGroundPiles.some((entry) => entry.x === x && entry.y === y)
        || chebyshevDistance(view.self.x, view.self.y, x, y) <= radius;
}
function createTileCombatAttributes() {
    return {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        comprehension: 0,
        luck: 0,
    };
}
function createTileCombatNumericStats(maxHp) {
    return {
        ...(0, shared_1.cloneNumericStats)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].stats),
        maxHp,
        maxQi: 0,
        physAtk: 0,
        spellAtk: 0,
        physDef: 0,
        spellDef: 0,
        hit: 0,
        dodge: 0,
        crit: 0,
        critDamage: 0,
        breakPower: 0,
        resolvePower: 0,
        maxQiOutputPerTick: 0,
        qiRegenRate: 0,
        hpRegenRate: 0,
        cooldownSpeed: 0,
        auraCostReduce: 0,
        auraPowerRate: 0,
        playerExpRate: 0,
        techniqueExpRate: 0,
        realmExpPerTick: 0,
        techniqueExpPerTick: 0,
        lootRate: 0,
        rareLootRate: 0,
        viewRange: 0,
        moveSpeed: 0,
        extraAggroRate: 0,
        elementDamageBonus: {
            metal: 0,
            wood: 0,
            water: 0,
            fire: 0,
            earth: 0,
        },
        elementDamageReduce: {
            metal: 0,
            wood: 0,
            water: 0,
            fire: 0,
            earth: 0,
        },
    };
}
function createTileCombatRatioDivisors() {
    return (0, shared_1.cloneNumericRatioDivisors)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].ratioDivisors);
}
//# sourceMappingURL=world-runtime.service.js.map
