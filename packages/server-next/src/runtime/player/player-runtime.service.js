"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerRuntimeService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** legacy_gm_compat_constants_1：定义该变量以承载业务值。 */
const legacy_gm_compat_constants_1 = require("../../compat/legacy/legacy-gm-compat.constants");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("../../content/content-template.repository");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../map/map-template.repository");
/** player_attributes_service_1：定义该变量以承载业务值。 */
const player_attributes_service_1 = require("./player-attributes.service");
/** player_progression_service_1：定义该变量以承载业务值。 */
const player_progression_service_1 = require("./player-progression.service");
/** DEFAULT_PLAYER_STARTER_MAP_ID：定义该变量以承载业务值。 */
const DEFAULT_PLAYER_STARTER_MAP_ID = 'yunlai_town';
/** MAX_PENDING_LOGBOOK_MESSAGES：定义该变量以承载业务值。 */
const MAX_PENDING_LOGBOOK_MESSAGES = 200;
/** VITAL_BASELINE_BONUS_SOURCE：定义该变量以承载业务值。 */
const VITAL_BASELINE_BONUS_SOURCE = 'runtime:vitals_baseline';
/** PENDING_LOGBOOK_KINDS：定义该变量以承载业务值。 */
const PENDING_LOGBOOK_KINDS = new Set([
    'system',
    'chat',
    'quest',
    'combat',
    'loot',
    'grudge',
]);
/** PlayerRuntimeService：定义该变量以承载业务值。 */
let PlayerRuntimeService = class PlayerRuntimeService {
    contentTemplateRepository;
    mapTemplateRepository;
    playerAttributesService;
    playerProgressionService;
    players = new Map();
    pendingCombatEffectsByPlayerId = new Map();
/** 构造函数：执行实例初始化流程。 */
    constructor(contentTemplateRepository, mapTemplateRepository, playerAttributesService, playerProgressionService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerAttributesService = playerAttributesService;
        this.playerProgressionService = playerProgressionService;
    }
/** loadOrCreatePlayer：执行对应的业务逻辑。 */
    async loadOrCreatePlayer(playerId, sessionId, loader) {
/** existing：定义该变量以承载业务值。 */
        const existing = this.players.get(playerId);
        if (existing) {
            existing.sessionId = sessionId;
            this.pendingCombatEffectsByPlayerId.delete(playerId);
            return existing;
        }
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = await loader();
/** player：定义该变量以承载业务值。 */
        const player = snapshot
            ? this.hydrateFromSnapshot(playerId, sessionId, snapshot)
            : this.createFreshPlayer(playerId, sessionId);
        this.players.set(playerId, player);
        return player;
    }
/** ensurePlayer：执行对应的业务逻辑。 */
    ensurePlayer(playerId, sessionId) {
/** existing：定义该变量以承载业务值。 */
        const existing = this.players.get(playerId);
        if (existing) {
            existing.sessionId = sessionId;
            return existing;
        }
/** player：定义该变量以承载业务值。 */
        const player = this.createFreshPlayer(playerId, sessionId);
        this.players.set(playerId, player);
        this.pendingCombatEffectsByPlayerId.delete(playerId);
        return player;
    }
/** createFreshPlayer：执行对应的业务逻辑。 */
    createFreshPlayer(playerId, sessionId) {
/** starterInventory：定义该变量以承载业务值。 */
        const starterInventory = this.contentTemplateRepository.createStarterInventory();
/** player：定义该变量以承载业务值。 */
        const player = {
            playerId,
            sessionId,
            name: playerId,
            displayName: playerId,
            persistentRevision: 1,
            persistedRevision: 0,
            instanceId: '',
            templateId: '',
            x: 0,
            y: 0,
            facing: shared_1.Direction.South,
            hp: 100,
            maxHp: 100,
            qi: 0,
            maxQi: 100,
            foundation: 0,
            combatExp: 0,
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
                combatTargetId: null,
                combatTargetLocked: false,
                allowAoePlayerHit: false,
                autoIdleCultivation: true,
                autoSwitchCultivation: false,
                senseQiActive: false,
                autoBattleSkills: [],
                cultivationActive: false,
                lastActiveTick: 0,
            },
            notices: {
                nextId: 1,
                queue: [],
            },
            quests: {
                revision: 1,
                quests: [],
            },
            lootWindowTarget: null,
            pendingLogbookMessages: [],
            vitalRecoveryDeferredUntilTick: -1,
            runtimeBonuses: [],
        };
        this.playerProgressionService.initializePlayer(player);
        this.rebuildActionState(player, 0);
        return player;
    }
/** setIdentity：执行对应的业务逻辑。 */
    setIdentity(playerId, input) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** nextName：定义该变量以承载业务值。 */
        const nextName = typeof input.name === 'string' && input.name.trim()
            ? input.name.trim()
            : player.name;
/** nextDisplayName：定义该变量以承载业务值。 */
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
/** detachSession：执行对应的业务逻辑。 */
    detachSession(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (player) {
            player.sessionId = null;
        }
    }
/** removePlayerRuntime：执行对应的业务逻辑。 */
    removePlayerRuntime(playerId) {
        this.players.delete(playerId);
        this.pendingCombatEffectsByPlayerId.delete(playerId);
    }
/** openLootWindow：执行对应的业务逻辑。 */
    openLootWindow(playerId, tileX, tileY) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (player.lootWindowTarget?.tileX === tileX && player.lootWindowTarget.tileY === tileY) {
            return player;
        }
        player.lootWindowTarget = { tileX, tileY };
        return player;
    }
/** clearLootWindow：执行对应的业务逻辑。 */
    clearLootWindow(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (!player.lootWindowTarget) {
            return player;
        }
        player.lootWindowTarget = null;
        return player;
    }
/** getLootWindowTarget：执行对应的业务逻辑。 */
    getLootWindowTarget(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayer(playerId);
        if (!player?.lootWindowTarget) {
            return null;
        }
        return {
            tileX: player.lootWindowTarget.tileX,
            tileY: player.lootWindowTarget.tileY,
        };
    }
/** getPlayer：执行对应的业务逻辑。 */
    getPlayer(playerId) {
        return this.players.get(playerId) ?? null;
    }
/** getPlayerOrThrow：执行对应的业务逻辑。 */
    getPlayerOrThrow(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (!player) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return player;
    }
/** getViewRadius：执行对应的业务逻辑。 */
    getViewRadius(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return Math.max(1, Math.round(player.attrs.numericStats.viewRange));
    }
/** gainRealmProgress：执行对应的业务逻辑。 */
    gainRealmProgress(playerId, amount, options = {}) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.gainRealmProgress(player, amount, options);
        return this.applyProgressionResult(player, result);
    }
/** gainFoundation：执行对应的业务逻辑。 */
    gainFoundation(playerId, amount) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.gainFoundation(player, amount);
        return this.applyProgressionResult(player, result);
    }
/** gainCombatExp：执行对应的业务逻辑。 */
    gainCombatExp(playerId, amount) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.gainCombatExp(player, amount);
        return this.applyProgressionResult(player, result);
    }
/** advanceProgressionTick：执行对应的业务逻辑。 */
    advanceProgressionTick(playerId, elapsedTicks = 1, options = {}) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.advanceProgressionTick(player, elapsedTicks, options);
        return this.applyProgressionResult(player, result);
    }
/** advanceCultivation：执行对应的业务逻辑。 */
    advanceCultivation(playerId, elapsedTicks = 1, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.advanceCultivation(player, elapsedTicks);
        return this.applyProgressionResult(player, result, currentTick);
    }
/** grantMonsterKillProgress：执行对应的业务逻辑。 */
    grantMonsterKillProgress(playerId, input, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.grantMonsterKillProgress(player, input);
        return this.applyProgressionResult(player, result, currentTick);
    }
/** refreshProgressionPreview：执行对应的业务逻辑。 */
    refreshProgressionPreview(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        this.playerProgressionService.refreshPreview(player);
        return player;
    }
/** handleHeavenGateAction：执行对应的业务逻辑。 */
    handleHeavenGateAction(playerId, action, element, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.handleHeavenGateAction(player, action, element);
        return this.applyProgressionResult(player, result, currentTick, true);
    }
/** attemptBreakthrough：执行对应的业务逻辑。 */
    attemptBreakthrough(playerId, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** result：定义该变量以承载业务值。 */
        const result = this.playerProgressionService.attemptBreakthrough(player);
        return this.applyProgressionResult(player, result, currentTick, true);
    }
/** syncFromWorldView：执行对应的业务逻辑。 */
    syncFromWorldView(playerId, sessionId, view) {
/** player：定义该变量以承载业务值。 */
        const player = this.ensurePlayer(playerId, sessionId);
/** changed：定义该变量以承载业务值。 */
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
            this.bumpPersistentRevision(player);
            player.selfRevision += 1;
        }
        return player;
    }
/** setContextActions：执行对应的业务逻辑。 */
    setContextActions(playerId, actions, currentTick) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
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
/** setVitals：执行对应的业务逻辑。 */
    setVitals(playerId, input) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** changed：定义该变量以承载业务值。 */
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
/** nextHp：定义该变量以承载业务值。 */
            const nextHp = clamp(Math.trunc(input.hp ?? player.hp), 0, player.maxHp);
            if (player.hp !== nextHp) {
                player.hp = nextHp;
                changed = true;
            }
        }
        if (Number.isFinite(input.qi)) {
/** nextQi：定义该变量以承载业务值。 */
            const nextQi = clamp(Math.trunc(input.qi ?? player.qi), 0, player.maxQi);
            if (player.qi !== nextQi) {
                player.qi = nextQi;
                changed = true;
            }
        }
        if (changed) {
            this.bumpPersistentRevision(player);
            player.selfRevision += 1;
        }
        return player;
    }
/** grantItem：执行对应的业务逻辑。 */
    grantItem(playerId, itemId, count = 1) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = this.contentTemplateRepository.createItem(itemId, count);
        if (!item) {
            throw new common_1.NotFoundException(`Item ${itemId} not found`);
        }
/** existing：定义该变量以承载业务值。 */
        const existing = player.inventory.items.find((entry) => entry.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
        }
        else {
            player.inventory.items.push(item);
        }
        player.inventory.revision += 1;
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** getInventoryCountByItemId：执行对应的业务逻辑。 */
    getInventoryCountByItemId(playerId, itemId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** total：定义该变量以承载业务值。 */
        let total = 0;
        for (const entry of player.inventory.items) {
            if (entry.itemId === itemId) {
                total += entry.count;
            }
        }
        return total;
    }
/** canReceiveInventoryItem：执行对应的业务逻辑。 */
    canReceiveInventoryItem(playerId, itemId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (player.inventory.items.some((entry) => entry.itemId === itemId)) {
            return true;
        }
        return player.inventory.items.length < player.inventory.capacity;
    }
/** peekInventoryItem：执行对应的业务逻辑。 */
    peekInventoryItem(playerId, slotIndex) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return player.inventory.items[slotIndex] ?? null;
    }
/** peekEquippedItem：执行对应的业务逻辑。 */
    peekEquippedItem(playerId, slot) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return player.equipment.slots.find((entry) => entry.slot === slot)?.item ?? null;
    }
/** getTechniqueName：执行对应的业务逻辑。 */
    getTechniqueName(playerId, techId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return player.techniques.techniques.find((entry) => entry.techId === techId)?.name ?? null;
    }
/** listQuests：执行对应的业务逻辑。 */
    listQuests(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return player.quests.quests.map((entry) => ({ ...entry, rewards: entry.rewards.map((reward) => ({ ...reward })) }));
    }
/** getPendingLogbookMessages：执行对应的业务逻辑。 */
    getPendingLogbookMessages(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        return player.pendingLogbookMessages.map((entry) => ({ ...entry }));
    }
/** getLegacyPendingLogbookMessages：执行对应的业务逻辑。 */
    getLegacyPendingLogbookMessages(playerId) {
        return this.getPendingLogbookMessages(playerId);
    }
/** queuePendingLogbookMessage：执行对应的业务逻辑。 */
    queuePendingLogbookMessage(playerId, message) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizePendingLogbookMessage(message);
        if (!normalized) {
            return player;
        }
/** next：定义该变量以承载业务值。 */
        const next = player.pendingLogbookMessages.slice();
/** existingIndex：定义该变量以承载业务值。 */
        const existingIndex = next.findIndex((entry) => entry.id === normalized.id);
        if (existingIndex >= 0) {
            next[existingIndex] = normalized;
        }
        else {
            next.push(normalized);
        }
/** limited：定义该变量以承载业务值。 */
        const limited = next.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
        if (isSamePendingLogbookMessages(player.pendingLogbookMessages, limited)) {
            return player;
        }
        player.pendingLogbookMessages = limited;
        this.bumpPersistentRevision(player);
        return player;
    }
/** queueLegacyPendingLogbookMessage：执行对应的业务逻辑。 */
    queueLegacyPendingLogbookMessage(playerId, message) {
        return this.queuePendingLogbookMessage(playerId, message);
    }
/** deferVitalRecoveryUntilTick：执行对应的业务逻辑。 */
    deferVitalRecoveryUntilTick(playerId, currentTick) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalizedTick：定义该变量以承载业务值。 */
        const normalizedTick = Number.isFinite(currentTick) ? Math.max(0, Math.trunc(currentTick)) : 0;
        if ((player.vitalRecoveryDeferredUntilTick ?? -1) >= normalizedTick) {
            return player;
        }
        player.vitalRecoveryDeferredUntilTick = normalizedTick;
        return player;
    }
/** suppressVitalRecoveryUntilTick：执行对应的业务逻辑。 */
    suppressVitalRecoveryUntilTick(playerId, currentTick) {
        return this.deferVitalRecoveryUntilTick(playerId, currentTick);
    }
/** acknowledgePendingLogbookMessages：执行对应的业务逻辑。 */
    acknowledgePendingLogbookMessages(playerId, ids) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (ids.length === 0 || player.pendingLogbookMessages.length === 0) {
            return player;
        }
/** idSet：定义该变量以承载业务值。 */
        const idSet = new Set(ids
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0));
        if (idSet.size === 0) {
            return player;
        }
/** next：定义该变量以承载业务值。 */
        const next = player.pendingLogbookMessages.filter((entry) => !idSet.has(entry.id));
        if (next.length === player.pendingLogbookMessages.length) {
            return player;
        }
        player.pendingLogbookMessages = next;
        this.bumpPersistentRevision(player);
        return player;
    }
/** ackLegacyPendingLogbookMessages：执行对应的业务逻辑。 */
    ackLegacyPendingLogbookMessages(playerId, ids) {
        return this.acknowledgePendingLogbookMessages(playerId, ids);
    }
/** markQuestStateDirty：执行对应的业务逻辑。 */
    markQuestStateDirty(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        player.quests.revision += 1;
        this.bumpPersistentRevision(player);
        return player;
    }
/** enqueueNotice：执行对应的业务逻辑。 */
    enqueueNotice(playerId, input) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** text：定义该变量以承载业务值。 */
        const text = input.text.trim();
        if (!text) {
            return player;
        }
        player.notices.queue.push({
            id: player.notices.nextId,
            kind: input.kind,
            text,
        });
        player.notices.nextId += 1;
        return player;
    }
/** enqueueCombatEffect：执行对应的业务逻辑。 */
    enqueueCombatEffect(playerId, effect) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (!player || !player.sessionId) {
            return;
        }
/** queue：定义该变量以承载业务值。 */
        const queue = this.pendingCombatEffectsByPlayerId.get(playerId);
        if (queue) {
            queue.push(cloneCombatEffect(effect));
            return;
        }
        this.pendingCombatEffectsByPlayerId.set(playerId, [cloneCombatEffect(effect)]);
    }
/** enqueueCombatEffects：执行对应的业务逻辑。 */
    enqueueCombatEffects(playerId, effects) {
        for (const effect of effects) {
            this.enqueueCombatEffect(playerId, effect);
        }
    }
/** drainCombatEffects：执行对应的业务逻辑。 */
    drainCombatEffects(playerId) {
/** queue：定义该变量以承载业务值。 */
        const queue = this.pendingCombatEffectsByPlayerId.get(playerId);
        if (!queue || queue.length === 0) {
            return [];
        }
        this.pendingCombatEffectsByPlayerId.delete(playerId);
        return queue.map((entry) => cloneCombatEffect(entry));
    }
/** drainNotices：执行对应的业务逻辑。 */
    drainNotices(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (player.notices.queue.length === 0) {
            return [];
        }
/** queue：定义该变量以承载业务值。 */
        const queue = player.notices.queue.map((entry) => ({ ...entry }));
        player.notices.queue.length = 0;
        return queue;
    }
/** splitInventoryItem：执行对应的业务逻辑。 */
    splitInventoryItem(playerId, slotIndex, count = 1) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
/** normalizedCount：定义该变量以承载业务值。 */
        const normalizedCount = Math.max(1, Math.trunc(count));
/** nextCount：定义该变量以承载业务值。 */
        const nextCount = Math.min(normalizedCount, item.count);
/** extracted：定义该变量以承载业务值。 */
        const extracted = {
            ...item,
            count: nextCount,
        };
        consumeInventoryItemAt(player.inventory.items, slotIndex, nextCount);
        player.inventory.revision += 1;
        this.bumpPersistentRevision(player);
        return extracted;
    }
/** receiveInventoryItem：执行对应的业务逻辑。 */
    receiveInventoryItem(playerId, item) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = this.contentTemplateRepository.normalizeItem(item);
/** existing：定义该变量以承载业务值。 */
        const existing = player.inventory.items.find((entry) => entry.itemId === normalized.itemId);
        if (existing) {
            existing.count += normalized.count;
        }
        else {
            player.inventory.items.push({ ...normalized });
        }
        player.inventory.revision += 1;
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** useItem：执行对应的业务逻辑。 */
    useItem(playerId, slotIndex) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
/** learnTechniqueId：定义该变量以承载业务值。 */
        const learnTechniqueId = this.contentTemplateRepository.getLearnTechniqueId(item.itemId);
/** consumed：定义该变量以承载业务值。 */
        let consumed = false;
        if (learnTechniqueId) {
            if (player.techniques.techniques.some((entry) => entry.techId === learnTechniqueId)) {
                throw new common_1.NotFoundException(`Technique ${learnTechniqueId} already learned`);
            }
/** technique：定义该变量以承载业务值。 */
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
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** consumeInventoryItem：执行对应的业务逻辑。 */
    consumeInventoryItem(playerId, slotIndex, count = 1) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        consumeInventoryItemAt(player.inventory.items, slotIndex, Math.max(1, Math.trunc(count)));
        player.inventory.revision += 1;
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** consumeInventoryItemByItemId：执行对应的业务逻辑。 */
    consumeInventoryItemByItemId(playerId, itemId, count = 1) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** remaining：定义该变量以承载业务值。 */
        let remaining = Math.max(1, Math.trunc(count));
        if (!Number.isFinite(remaining) || remaining <= 0) {
            throw new common_1.NotFoundException(`Invalid consume count for ${itemId}`);
        }
        for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
            const item = player.inventory.items[slotIndex];
            if (!item || item.itemId !== itemId) {
                continue;
            }
/** consumed：定义该变量以承载业务值。 */
            const consumed = Math.min(item.count, remaining);
            consumeInventoryItemAt(player.inventory.items, slotIndex, consumed);
            remaining -= consumed;
        }
        if (remaining > 0) {
            throw new common_1.NotFoundException(`Inventory item ${itemId} insufficient`);
        }
        player.inventory.revision += 1;
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** destroyInventoryItem：执行对应的业务逻辑。 */
    destroyInventoryItem(playerId, slotIndex, count = 1) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
/** normalizedCount：定义该变量以承载业务值。 */
        const normalizedCount = Math.max(1, Math.trunc(count));
/** destroyed：定义该变量以承载业务值。 */
        const destroyed = {
            ...item,
            count: Math.min(item.count, normalizedCount),
        };
        consumeInventoryItemAt(player.inventory.items, slotIndex, destroyed.count);
        player.inventory.revision += 1;
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return destroyed;
    }
/** sortInventory：执行对应的业务逻辑。 */
    sortInventory(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (player.inventory.items.length <= 1) {
            return player;
        }
/** previous：定义该变量以承载业务值。 */
        const previous = player.inventory.items.map((entry) => `${entry.itemId}:${entry.count}`);
        player.inventory.items.sort(compareInventoryItems);
/** changed：定义该变量以承载业务值。 */
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
        this.bumpPersistentRevision(player);
        return player;
    }
/** unlockMap：执行对应的业务逻辑。 */
    unlockMap(playerId, mapId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        if (player.unlockedMapIds.includes(mapId)) {
            throw new common_1.NotFoundException(`Map ${mapId} already unlocked`);
        }
        player.unlockedMapIds = [...player.unlockedMapIds, mapId]
            .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        this.bumpPersistentRevision(player);
        return player;
    }
/** hasUnlockedMap：执行对应的业务逻辑。 */
    hasUnlockedMap(playerId, mapId) {
        return this.getPlayerOrThrow(playerId).unlockedMapIds.includes(mapId);
    }
/** equipItem：执行对应的业务逻辑。 */
    equipItem(playerId, slotIndex) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** item：定义该变量以承载业务值。 */
        const item = player.inventory.items[slotIndex];
        if (!item) {
            throw new common_1.NotFoundException(`Inventory slot ${slotIndex} not found`);
        }
        if (!item.equipSlot) {
            throw new common_1.NotFoundException(`Item ${item.itemId} is not equippable`);
        }
/** slot：定义该变量以承载业务值。 */
        const slot = item.equipSlot;
/** equipmentEntry：定义该变量以承载业务值。 */
        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} not found`);
        }
/** equippedItem：定义该变量以承载业务值。 */
        const equippedItem = player.inventory.items.splice(slotIndex, 1)[0];
/** previousEquipped：定义该变量以承载业务值。 */
        const previousEquipped = equipmentEntry.item ? { ...equipmentEntry.item } : null;
        equipmentEntry.item = { ...equippedItem };
        if (previousEquipped) {
            player.inventory.items.push(previousEquipped);
        }
        player.inventory.revision += 1;
        player.equipment.revision += 1;
        this.playerAttributesService.recalculate(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** unequipItem：执行对应的业务逻辑。 */
    unequipItem(playerId, slot) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** equipmentEntry：定义该变量以承载业务值。 */
        const equipmentEntry = player.equipment.slots.find((entry) => entry.slot === slot);
        if (!equipmentEntry || !equipmentEntry.item) {
            throw new common_1.NotFoundException(`Equipment slot ${slot} is empty`);
        }
        player.inventory.items.push({ ...equipmentEntry.item });
        equipmentEntry.item = null;
        player.inventory.revision += 1;
        player.equipment.revision += 1;
        this.playerAttributesService.recalculate(player);
        this.bumpPersistentRevision(player);
        return player;
    }
/** cultivateTechnique：执行对应的业务逻辑。 */
    cultivateTechnique(playerId, techniqueId) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : null;
        if (normalized && !player.techniques.techniques.some((entry) => entry.techId === normalized)) {
            throw new common_1.NotFoundException(`Technique ${normalized} not learned`);
        }
        if (player.techniques.cultivatingTechId === normalized) {
            return player;
        }
        player.techniques.cultivatingTechId = normalized;
        player.combat.cultivationActive = normalized !== null;
        player.techniques.revision += 1;
        this.bumpPersistentRevision(player);
        return player;
    }
/** infuseBodyTraining：执行对应的业务逻辑。 */
    infuseBodyTraining(playerId, foundationAmount) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** requested：定义该变量以承载业务值。 */
        const requested = normalizeCounter(foundationAmount);
        if (requested <= 0) {
            throw new common_1.BadRequestException('foundation amount is required');
        }
        if (player.foundation <= 0) {
            throw new common_1.BadRequestException('foundation is insufficient');
        }
/** consumed：定义该变量以承载业务值。 */
        const consumed = Math.min(player.foundation, requested);
/** previousBodyTraining：定义该变量以承载业务值。 */
        const previousBodyTraining = (0, shared_1.normalizeBodyTrainingState)(player.bodyTraining);
/** nextBodyTraining：定义该变量以承载业务值。 */
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
        }
        else {
            this.playerAttributesService.markPanelDirty(player);
        }
        this.playerProgressionService.refreshPreview(player);
        this.bumpPersistentRevision(player);
        return {
            player,
            foundationSpent: consumed,
            expGained: consumed * shared_1.BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
        };
    }
/** recordActivity：执行对应的业务逻辑。 */
    recordActivity(playerId, currentTick, input = {}) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalizedTick：定义该变量以承载业务值。 */
        const normalizedTick = Math.max(0, Math.trunc(currentTick));
        if (player.combat.lastActiveTick < normalizedTick) {
            player.combat.lastActiveTick = normalizedTick;
        }
        if (input.interruptCultivation === true) {
            player.combat.cultivationActive = false;
        }
        return player;
    }
/** spendQi：执行对应的业务逻辑。 */
    spendQi(playerId, amount) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = Math.max(0, Math.round(amount));
        if (normalized <= 0) {
            return player;
        }
        if (player.qi < normalized) {
            throw new common_1.NotFoundException(`Player ${playerId} qi insufficient`);
        }
        player.qi -= normalized;
        player.selfRevision += 1;
        this.bumpPersistentRevision(player);
        return player;
    }
/** applyDamage：执行对应的业务逻辑。 */
    applyDamage(playerId, amount) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = Math.max(0, Math.round(amount));
        if (normalized <= 0) {
            return player;
        }
        player.hp = Math.max(0, player.hp - normalized);
        player.selfRevision += 1;
        this.bumpPersistentRevision(player);
        return player;
    }
/** setSkillCooldownReadyTick：执行对应的业务逻辑。 */
    setSkillCooldownReadyTick(playerId, skillId, readyTick, currentTick) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
        player.combat.cooldownReadyTickBySkillId[skillId] = Math.max(0, Math.trunc(readyTick));
        this.rebuildActionState(player, currentTick);
        return player;
    }
/** updateAutoBattleSkills：执行对应的业务逻辑。 */
    updateAutoBattleSkills(playerId, input) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizeAutoBattleSkills(collectUnlockedSkillIds(player), input);
        if (isSameAutoBattleSkillList(player.combat.autoBattleSkills, normalized)) {
            return player;
        }
        player.combat.autoBattleSkills = normalized;
        this.rebuildActionState(player, 0);
        this.bumpPersistentRevision(player);
        return player;
    }
/** updateTechniqueSkillAvailability：执行对应的业务逻辑。 */
    updateTechniqueSkillAvailability(playerId, techId, enabled) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalizedTechId：定义该变量以承载业务值。 */
        const normalizedTechId = typeof techId === 'string' ? techId.trim() : '';
        if (!normalizedTechId) {
            return player;
        }
/** technique：定义该变量以承载业务值。 */
        const technique = player.techniques.techniques.find((entry) => entry.techId === normalizedTechId);
        if (!technique) {
            return player;
        }
/** unlockedSkillIds：定义该变量以承载业务值。 */
        const unlockedSkillIds = new Set((technique.skills ?? [])
            .filter((skill) => (technique.level ?? 1) >= (typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1))
            .map((skill) => skill.id));
        if (unlockedSkillIds.size === 0) {
            return player;
        }
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizeAutoBattleSkills(collectUnlockedSkillIds(player), player.combat.autoBattleSkills);
/** changed：定义该变量以承载业务值。 */
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
        if (!changed) {
            return player;
        }
        player.combat.autoBattleSkills = normalized;
        this.rebuildActionState(player, 0);
        this.bumpPersistentRevision(player);
        return player;
    }
/** updateCombatSettings：执行对应的业务逻辑。 */
    updateCombatSettings(playerId, input, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** changed：定义该变量以承载业务值。 */
        let changed = false;
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
        if (!changed) {
            return player;
        }
        this.rebuildActionState(player, currentTick);
        this.bumpPersistentRevision(player);
        return player;
    }
/** setCombatTarget：执行对应的业务逻辑。 */
    setCombatTarget(playerId, targetId, locked, currentTick = 0) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** normalizedTargetId：定义该变量以承载业务值。 */
        const normalizedTargetId = typeof targetId === 'string' && targetId.trim() ? targetId.trim() : null;
/** normalizedLocked：定义该变量以承载业务值。 */
        const normalizedLocked = normalizedTargetId !== null && locked === true;
        if (player.combat.combatTargetId === normalizedTargetId
            && player.combat.combatTargetLocked === normalizedLocked) {
            return player;
        }
        player.combat.combatTargetId = normalizedTargetId;
        player.combat.combatTargetLocked = normalizedLocked;
        this.rebuildActionState(player, currentTick);
        this.bumpPersistentRevision(player);
        return player;
    }
/** clearCombatTarget：执行对应的业务逻辑。 */
    clearCombatTarget(playerId, currentTick = 0) {
        return this.setCombatTarget(playerId, null, false, currentTick);
    }
/** applyTemporaryBuff：执行对应的业务逻辑。 */
    applyTemporaryBuff(playerId, buff) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** existing：定义该变量以承载业务值。 */
        const existing = player.buffs.buffs.find((entry) => entry.buffId === buff.buffId);
        if (existing) {
            existing.remainingTicks = Math.max(existing.remainingTicks, buff.remainingTicks);
            existing.duration = Math.max(existing.duration, buff.duration);
            existing.stacks = Math.min(existing.maxStacks, Math.max(existing.stacks, buff.stacks));
            existing.attrs = buff.attrs ? { ...buff.attrs } : undefined;
            existing.stats = buff.stats ? { ...buff.stats } : undefined;
            existing.qiProjection = buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined;
            existing.sourceSkillId = buff.sourceSkillId;
            existing.sourceSkillName = buff.sourceSkillName;
            existing.color = buff.color;
        }
        else {
            player.buffs.buffs.push(cloneTemporaryBuff(buff));
        }
        player.buffs.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
        player.buffs.revision += 1;
        this.playerAttributesService.recalculate(player);
        return player;
    }
/** advanceTick：执行对应的业务逻辑。 */
    advanceTick(currentTick, options = {}) {
        for (const player of this.players.values()) {
            this.advanceSinglePlayerTick(player, currentTick, options);
        }
    }
/** advanceTickForPlayerIds：执行对应的业务逻辑。 */
    advanceTickForPlayerIds(playerIds, currentTick, options = {}) {
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
/** advanceSinglePlayerTick：执行对应的业务逻辑。 */
    advanceSinglePlayerTick(player, currentTick, options = {}) {
            if (tickTemporaryBuffs(player.buffs.buffs)) {
                player.buffs.revision += 1;
                this.playerAttributesService.recalculate(player);
            }
            if (recoverPlayerVitals(player, currentTick)) {
                player.selfRevision += 1;
                this.bumpPersistentRevision(player);
            }
            if (player.hp > 0 && shouldResumeIdleCultivation(player, currentTick, options.idleCultivationBlockedPlayerIds)) {
                player.combat.cultivationActive = true;
            }
            if (player.hp > 0 && player.combat.cultivationActive && player.techniques.cultivatingTechId) {
/** result：定义该变量以承载业务值。 */
                const result = this.playerProgressionService.advanceCultivation(player, 1);
                this.applyProgressionResult(player, result, currentTick);
            }
            if (hasActiveSkillCooldown(player, currentTick)) {
                this.rebuildActionState(player, currentTick);
            }
    }
/** respawnPlayer：执行对应的业务逻辑。 */
    respawnPlayer(playerId, input) {
/** player：定义该变量以承载业务值。 */
        const player = this.getPlayerOrThrow(playerId);
/** changed：定义该变量以承载业务值。 */
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
        if (player.buffs.buffs.length > 0) {
            player.buffs.buffs.length = 0;
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
        player.combat.combatTargetId = null;
        player.combat.combatTargetLocked = false;
        player.combat.cultivationActive = false;
        player.combat.lastActiveTick = Math.max(player.combat.lastActiveTick, Math.trunc(input.currentTick));
        if (changed) {
            player.selfRevision += 1;
            this.bumpPersistentRevision(player);
        }
        return player;
    }
/** listDirtyPlayers：执行对应的业务逻辑。 */
    listDirtyPlayers() {
        return Array.from(this.players.values())
            .filter((player) => !(0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(player.playerId))
            .filter((player) => player.persistentRevision > player.persistedRevision)
            .map((player) => player.playerId);
    }
/** buildFreshPersistenceSnapshot：执行对应的业务逻辑。 */
    buildFreshPersistenceSnapshot(playerId, placement) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
/** templateId：定义该变量以承载业务值。 */
        const templateId = typeof placement?.templateId === 'string' ? placement.templateId.trim() : '';
        if (!normalizedPlayerId || !templateId) {
            return null;
        }
/** player：定义该变量以承载业务值。 */
        const player = this.createFreshPlayer(normalizedPlayerId, null);
        player.templateId = templateId;
        player.x = Number.isFinite(placement?.x) ? Math.trunc(placement.x) : 0;
        player.y = Number.isFinite(placement?.y) ? Math.trunc(placement.y) : 0;
        player.facing = Number.isFinite(placement?.facing)
            ? Math.trunc(placement.facing)
            : shared_1.Direction.South;
        player.unlockedMapIds = [templateId];
        return buildRuntimePlayerPersistenceSnapshot(player);
    }
/** buildStarterPersistenceSnapshot：执行对应的业务逻辑。 */
    buildStarterPersistenceSnapshot(playerId) {
/** templateId：定义该变量以承载业务值。 */
        const templateId = this.mapTemplateRepository.has(DEFAULT_PLAYER_STARTER_MAP_ID)
            ? DEFAULT_PLAYER_STARTER_MAP_ID
            : (this.mapTemplateRepository.list()[0]?.id ?? '');
        if (!templateId) {
            return null;
        }
/** template：定义该变量以承载业务值。 */
        const template = this.mapTemplateRepository.getOrThrow(templateId);
        return this.buildFreshPersistenceSnapshot(playerId, {
            templateId: template.id,
            x: template.spawnX,
            y: template.spawnY,
            facing: shared_1.Direction.South,
        });
    }
/** buildPersistenceSnapshot：执行对应的业务逻辑。 */
    buildPersistenceSnapshot(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (!player || !player.templateId || (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(playerId)) {
            return null;
        }
        return buildRuntimePlayerPersistenceSnapshot(player);
    }
/** markPersisted：执行对应的业务逻辑。 */
    markPersisted(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (!player) {
            return;
        }
        player.persistedRevision = player.persistentRevision;
    }
/** snapshot：执行对应的业务逻辑。 */
    snapshot(playerId) {
/** player：定义该变量以承载业务值。 */
        const player = this.players.get(playerId);
        if (!player) {
            return null;
        }
        return cloneRuntimePlayerState(player);
    }
/** listPlayerSnapshots：执行对应的业务逻辑。 */
    listPlayerSnapshots() {
        return Array.from(this.players.values(), (player) => cloneRuntimePlayerState(player));
    }
/** restoreSnapshot：执行对应的业务逻辑。 */
    restoreSnapshot(snapshot) {
        this.players.set(snapshot.playerId, cloneRuntimePlayerState(snapshot));
        this.pendingCombatEffectsByPlayerId.delete(snapshot.playerId);
    }
/** hydrateFromSnapshot：执行对应的业务逻辑。 */
    hydrateFromSnapshot(playerId, sessionId, snapshot) {
/** defaultEquipment：定义该变量以承载业务值。 */
        const defaultEquipment = buildEquipmentSnapshot(this.contentTemplateRepository.createDefaultEquipment());
/** player：定义该变量以承载业务值。 */
        const player = {
            playerId,
            sessionId,
            name: playerId,
            displayName: playerId,
            persistentRevision: 1,
            persistedRevision: 1,
            instanceId: '',
            templateId: snapshot.placement.templateId,
            x: snapshot.placement.x,
            y: snapshot.placement.y,
            facing: snapshot.placement.facing,
            hp: snapshot.vitals.hp,
            maxHp: snapshot.vitals.maxHp,
            qi: snapshot.vitals.qi,
            maxQi: snapshot.vitals.maxQi,
            foundation: normalizeCounter(snapshot.progression?.foundation),
            combatExp: normalizeCounter(snapshot.progression?.combatExp),
            bodyTraining: (0, shared_1.normalizeBodyTrainingState)(snapshot.progression?.bodyTraining),
            boneAgeBaseYears: normalizeBoneAgeBaseYears(snapshot.progression?.boneAgeBaseYears),
            lifeElapsedTicks: normalizeLifeElapsedTicks(snapshot.progression?.lifeElapsedTicks),
            lifespanYears: normalizeLifespanYears(snapshot.progression?.lifespanYears),
            realm: normalizeRealmState(snapshot.progression?.realm),
            heavenGate: normalizeHeavenGateState(snapshot.progression?.heavenGate),
            spiritualRoots: normalizeHeavenGateRoots(snapshot.progression?.spiritualRoots),
            unlockedMapIds: snapshot.unlockedMapIds.slice(),
            selfRevision: 1,
            inventory: {
                revision: Math.max(1, snapshot.inventory.revision),
                capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, snapshot.inventory.capacity),
                items: snapshot.inventory.items.map((entry) => this.contentTemplateRepository.normalizeItem(entry)),
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
/** autoBattle：定义该变量以承载业务值。 */
                autoBattle: snapshot.combat?.autoBattle === true,
/** autoRetaliate：定义该变量以承载业务值。 */
                autoRetaliate: snapshot.combat?.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
                autoBattleStationary: snapshot.combat?.autoBattleStationary === true,
/** combatTargetId：定义该变量以承载业务值。 */
                combatTargetId: typeof snapshot.combat?.combatTargetId === 'string' && snapshot.combat.combatTargetId.trim()
                    ? snapshot.combat.combatTargetId.trim()
                    : null,
/** combatTargetLocked：定义该变量以承载业务值。 */
                combatTargetLocked: snapshot.combat?.combatTargetLocked === true
                    && typeof snapshot.combat?.combatTargetId === 'string'
                    && snapshot.combat.combatTargetId.trim().length > 0,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
                allowAoePlayerHit: snapshot.combat?.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
                autoIdleCultivation: snapshot.combat?.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
                autoSwitchCultivation: snapshot.combat?.autoSwitchCultivation === true,
/** senseQiActive：定义该变量以承载业务值。 */
                senseQiActive: snapshot.combat?.senseQiActive === true,
                autoBattleSkills: normalizePersistedAutoBattleSkills(snapshot.combat?.autoBattleSkills),
/** cultivationActive：定义该变量以承载业务值。 */
                cultivationActive: snapshot.techniques.cultivatingTechId !== null,
                lastActiveTick: 0,
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
            pendingLogbookMessages: normalizePendingLogbookMessages(resolveCompatiblePendingLogbookMessages(snapshot)),
            vitalRecoveryDeferredUntilTick: -1,
            runtimeBonuses: resolveCompatibleRuntimeBonuses(snapshot)
                .map((entry) => cloneRuntimeBonus(entry))
                .filter((entry) => Boolean(entry)),
        };
        this.playerProgressionService.initializePlayer(player);
        if (ensureVitalBaselineBonus(player, snapshot.vitals)) {
            this.playerAttributesService.recalculate(player);
            player.hp = clamp(snapshot.vitals.hp, 0, player.maxHp);
            player.qi = clamp(snapshot.vitals.qi, 0, player.maxQi);
        }
        this.rebuildActionState(player, 0);
        return player;
    }
/** bumpPersistentRevision：执行对应的业务逻辑。 */
    bumpPersistentRevision(player) {
        player.persistentRevision += 1;
    }
/** applyProgressionResult：执行对应的业务逻辑。 */
    applyProgressionResult(player, result, currentTick = 0, rebuildActions = false) {
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
        return player;
    }
/** rebuildActionState：执行对应的业务逻辑。 */
    rebuildActionState(player, currentTick) {
/** nextActions：定义该变量以承载业务值。 */
        const nextActions = buildActionEntries(player, currentTick);
/** techniqueFlagsChanged：定义该变量以承载业务值。 */
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
        }
    }
/** applyConsumableItem：执行对应的业务逻辑。 */
    applyConsumableItem(player, item) {
/** consumed：定义该变量以承载业务值。 */
        let consumed = false;
/** selfChanged：定义该变量以承载业务值。 */
        let selfChanged = false;
/** healAmount：定义该变量以承载业务值。 */
        const healAmount = typeof item.healAmount === 'number' ? Math.max(0, Math.round(item.healAmount)) : 0;
/** healPercent：定义该变量以承载业务值。 */
        const healPercent = typeof item.healPercent === 'number' ? Math.max(0, item.healPercent) : 0;
/** qiPercent：定义该变量以承载业务值。 */
        const qiPercent = typeof item.qiPercent === 'number' ? Math.max(0, item.qiPercent) : 0;
        if (healAmount > 0 || healPercent > 0 || qiPercent > 0) {
/** nextHp：定义该变量以承载业务值。 */
            const nextHp = clamp(player.hp + healAmount + Math.round(player.maxHp * healPercent), 0, player.maxHp);
/** nextQi：定义该变量以承载业务值。 */
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
        player_progression_service_1.PlayerProgressionService])
], PlayerRuntimeService);
/** buildEquipmentSnapshot：执行对应的业务逻辑。 */
function buildEquipmentSnapshot(equipment) {
    return shared_1.EQUIP_SLOTS.map((slot) => ({
        slot,
        item: equipment[slot] ? { ...equipment[slot] } : null,
    }));
}
/** cloneRuntimePlayerState：执行对应的业务逻辑。 */
function cloneRuntimePlayerState(player) {
    return {
        ...player,
        realm: cloneRealmState(player.realm),
        heavenGate: cloneHeavenGateState(player.heavenGate),
        spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
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
            combatTargetId: player.combat.combatTargetId,
            combatTargetLocked: player.combat.combatTargetLocked,
            allowAoePlayerHit: player.combat.allowAoePlayerHit,
            autoIdleCultivation: player.combat.autoIdleCultivation,
            autoSwitchCultivation: player.combat.autoSwitchCultivation,
            senseQiActive: player.combat.senseQiActive,
            autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            cultivationActive: player.combat.cultivationActive,
            lastActiveTick: player.combat.lastActiveTick,
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
        lootWindowTarget: player.lootWindowTarget
            ? { ...player.lootWindowTarget }
            : null,
        pendingLogbookMessages: player.pendingLogbookMessages.map((entry) => ({ ...entry })),
        vitalRecoveryDeferredUntilTick: player.vitalRecoveryDeferredUntilTick,
        runtimeBonuses: player.runtimeBonuses.map((entry) => cloneRuntimeBonus(entry)),
    };
}
/** createDefaultRealmState：执行对应的业务逻辑。 */
function createDefaultRealmState() {
/** stage：定义该变量以承载业务值。 */
    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
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
/** cloneRealmState：执行对应的业务逻辑。 */
function cloneRealmState(realm) {
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
/** cloneHeavenGateState：执行对应的业务逻辑。 */
function cloneHeavenGateState(state) {
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
/** cloneHeavenGateRoots：执行对应的业务逻辑。 */
function cloneHeavenGateRoots(roots) {
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
/** buildRuntimePlayerPersistenceSnapshot：执行对应的业务逻辑。 */
function buildRuntimePlayerPersistenceSnapshot(player) {
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
            templateId: player.templateId,
            x: player.x,
            y: player.y,
            facing: player.facing,
        },
        vitals: {
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            maxQi: player.maxQi,
        },
        progression: {
            foundation: player.foundation,
            combatExp: player.combatExp,
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
            boneAgeBaseYears: player.boneAgeBaseYears,
            lifeElapsedTicks: player.lifeElapsedTicks,
            lifespanYears: player.lifespanYears,
            realm: cloneRealmState(player.realm),
            heavenGate: cloneHeavenGateState(player.heavenGate),
            spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots),
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
/** normalizeRealmState：执行对应的业务逻辑。 */
function normalizeRealmState(realm) {
    return realm ? cloneRealmState(realm) : createDefaultRealmState();
}
/** normalizeHeavenGateState：执行对应的业务逻辑。 */
function normalizeHeavenGateState(state) {
    return cloneHeavenGateState(state);
}
/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
function normalizeHeavenGateRoots(roots) {
    return cloneHeavenGateRoots(roots);
}
/** normalizeCounter：执行对应的业务逻辑。 */
function normalizeCounter(value) {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}
/** normalizeBoneAgeBaseYears：执行对应的业务逻辑。 */
function normalizeBoneAgeBaseYears(value) {
    return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? shared_1.DEFAULT_BONE_AGE_YEARS)) : shared_1.DEFAULT_BONE_AGE_YEARS;
}
/** normalizeLifeElapsedTicks：执行对应的业务逻辑。 */
function normalizeLifeElapsedTicks(value) {
    return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
/** normalizeLifespanYears：执行对应的业务逻辑。 */
function normalizeLifespanYears(value) {
    return Number.isFinite(value) ? Math.max(1, Math.trunc(value ?? 0)) : null;
}
/** normalizePendingLogbookMessages：执行对应的业务逻辑。 */
function normalizePendingLogbookMessages(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
/** indexById：定义该变量以承载业务值。 */
    const indexById = new Map();
    for (const entry of input) {
        const candidate = normalizePendingLogbookMessage(entry);
        if (!candidate) {
            continue;
        }
/** existingIndex：定义该变量以承载业务值。 */
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
/** resolveCompatibleSnapshotArray：执行对应的业务逻辑。 */
function resolveCompatibleSnapshotArray(snapshot, primaryKey, compatResolver) {
/** primaryValue：定义该变量以承载业务值。 */
    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }
/** compatValue：定义该变量以承载业务值。 */
    const compatValue = compatResolver(snapshot);
    return Array.isArray(compatValue) ? compatValue : [];
}
/** resolveCompatiblePendingLogbookMessages：执行对应的业务逻辑。 */
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'pendingLogbookMessages', (candidate) => candidate?.legacyCompat?.pendingLogbookMessages);
}
/** normalizePendingLogbookMessage：执行对应的业务逻辑。 */
function normalizePendingLogbookMessage(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
/** id：定义该变量以承载业务值。 */
    const id = typeof input.id === 'string' ? input.id.trim() : '';
/** text：定义该变量以承载业务值。 */
    const text = typeof input.text === 'string' ? input.text.trim() : '';
/** kind：定义该变量以承载业务值。 */
    const kind = typeof input.kind === 'string' && PENDING_LOGBOOK_KINDS.has(input.kind)
        ? input.kind
        : 'grudge';
    if (!id || !text) {
        return null;
    }
/** at：定义该变量以承载业务值。 */
    const at = Number.isFinite(input.at) ? Math.max(0, Math.trunc(input.at)) : Date.now();
/** from：定义该变量以承载业务值。 */
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
/** isSamePendingLogbookMessages：执行对应的业务逻辑。 */
function isSamePendingLogbookMessages(left, right) {
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
/** clamp：执行对应的业务逻辑。 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/** compareInventoryItems：执行对应的业务逻辑。 */
function compareInventoryItems(left, right) {
    return left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')
        || (left.name ?? '').localeCompare(right.name ?? '', 'zh-Hans-CN')
        || right.count - left.count;
}
/** consumeInventoryItemAt：执行对应的业务逻辑。 */
function consumeInventoryItemAt(items, slotIndex, count) {
/** item：定义该变量以承载业务值。 */
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
/** toTechniqueUpdateEntry：执行对应的业务逻辑。 */
function toTechniqueUpdateEntry(technique) {
    return {
        techId: technique.techId,
        level: technique.level,
        exp: technique.exp,
        expToNext: technique.expToNext,
        realmLv: technique.realmLv,
        realm: technique.realm ?? shared_1.TechniqueRealm.Entry,
/** skillsEnabled：定义该变量以承载业务值。 */
        skillsEnabled: technique.skillsEnabled !== false,
        name: technique.name,
        grade: technique.grade ?? null,
        category: technique.category ?? null,
        skills: technique.skills.map((entry) => ({ ...entry })),
        layers: technique.layers?.map((entry) => ({
            level: entry.level,
            expToNext: entry.expToNext,
            attrs: entry.attrs ? { ...entry.attrs } : undefined,
        })) ?? null,
        attrCurves: technique.attrCurves ? { ...technique.attrCurves } : null,
    };
}
/** buildActionEntries：执行对应的业务逻辑。 */
function buildActionEntries(player, currentTick) {
/** actions：定义该变量以承载业务值。 */
    const actions = [];
/** unlockedSkillIds：定义该变量以承载业务值。 */
    const unlockedSkillIds = collectUnlockedSkillIds(player);
/** autoBattleSkills：定义该变量以承载业务值。 */
    const autoBattleSkills = normalizeAutoBattleSkills(unlockedSkillIds, player.combat.autoBattleSkills);
/** skillOrder：定义该变量以承载业务值。 */
    const skillOrder = new Map(autoBattleSkills.map((entry, index) => [entry.skillId, index]));
/** autoBattleEnabledMap：定义该变量以承载业务值。 */
    const autoBattleEnabledMap = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.enabled]));
/** skillEnabledMap：定义该变量以承载业务值。 */
    const skillEnabledMap = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
            if ((technique.level ?? 1) < unlockLevel) {
                continue;
            }
/** readyTick：定义该变量以承载业务值。 */
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
        actions.push({ ...entry });
    }
    actions.sort((left, right) => ((skillOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (skillOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)) || left.id.localeCompare(right.id, 'zh-Hans-CN'));
    return actions;
}
/** isSameActionList：执行对应的业务逻辑。 */
function isSameActionList(previous, current) {
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
/** normalizePersistedAutoBattleSkills：执行对应的业务逻辑。 */
function normalizePersistedAutoBattleSkills(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = input
        .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
        .map((entry) => ({
        skillId: entry.skillId.trim(),
/** enabled：定义该变量以承载业务值。 */
        enabled: entry.enabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
        skillEnabled: entry.skillEnabled !== false,
        autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
    }));
    normalized.sort((left, right) => (left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) - (right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER) || left.skillId.localeCompare(right.skillId, 'zh-Hans-CN'));
    return normalized;
}
/** normalizeAutoBattleSkills：执行对应的业务逻辑。 */
function normalizeAutoBattleSkills(skillIds, input) {
/** availableIds：定义该变量以承载业务值。 */
    const availableIds = new Set(skillIds);
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set();
    for (const entry of input ?? []) {
        const skillId = typeof entry.skillId === 'string' ? entry.skillId.trim() : '';
        if (!skillId || seen.has(skillId) || !availableIds.has(skillId)) {
            continue;
        }
        normalized.push({
            skillId,
/** enabled：定义该变量以承载业务值。 */
            enabled: entry.enabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
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
/** collectUnlockedSkillIds：执行对应的业务逻辑。 */
function collectUnlockedSkillIds(player) {
/** skillIds：定义该变量以承载业务值。 */
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
/** syncTechniqueSkillAvailability：执行对应的业务逻辑。 */
function syncTechniqueSkillAvailability(player) {
/** skillEnabledMap：定义该变量以承载业务值。 */
    const skillEnabledMap = new Map(player.combat.autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));
/** changed：定义该变量以承载业务值。 */
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
/** resolveTechniqueSkillAvailability：执行对应的业务逻辑。 */
function resolveTechniqueSkillAvailability(technique, skillEnabledMap) {
/** hasResolvedSkill：定义该变量以承载业务值。 */
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
/** isSameAutoBattleSkillList：执行对应的业务逻辑。 */
function isSameAutoBattleSkillList(previous, current) {
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
/** tickTemporaryBuffs：执行对应的业务逻辑。 */
function tickTemporaryBuffs(buffs) {
/** changed：定义该变量以承载业务值。 */
    let changed = false;
    for (const buff of buffs) {
        if (buff.remainingTicks > 0) {
            buff.remainingTicks -= 1;
            changed = true;
        }
    }
/** nextLength：定义该变量以承载业务值。 */
    const nextLength = buffs.filter((entry) => entry.remainingTicks > 0 && entry.stacks > 0).length;
    if (nextLength !== buffs.length) {
        changed = true;
    }
    if (changed) {
/** writeIndex：定义该变量以承载业务值。 */
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
/** recoverPlayerVitals：执行对应的业务逻辑。 */
function recoverPlayerVitals(player, currentTick = -1) {
/** suppressUntilTick：定义该变量以承载业务值。 */
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
/** changed：定义该变量以承载业务值。 */
    let changed = false;
    if (player.hp < player.maxHp && player.attrs.numericStats.hpRegenRate > 0) {
/** heal：定义该变量以承载业务值。 */
        const heal = Math.max(1, Math.round(player.maxHp * (player.attrs.numericStats.hpRegenRate / 10000)));
/** nextHp：定义该变量以承载业务值。 */
        const nextHp = clamp(player.hp + heal, 0, player.maxHp);
        if (nextHp !== player.hp) {
            player.hp = nextHp;
            changed = true;
        }
    }
    if (player.qi < player.maxQi && player.attrs.numericStats.qiRegenRate > 0) {
/** recover：定义该变量以承载业务值。 */
        const recover = Math.max(1, Math.round(player.maxQi * (player.attrs.numericStats.qiRegenRate / 10000)));
/** nextQi：定义该变量以承载业务值。 */
        const nextQi = clamp(player.qi + recover, 0, player.maxQi);
        if (nextQi !== player.qi) {
            player.qi = nextQi;
            changed = true;
        }
    }
    return changed;
}
/** hasActiveSkillCooldown：执行对应的业务逻辑。 */
function hasActiveSkillCooldown(player, currentTick) {
    if (player.actions.actions.length === 0) {
        return false;
    }
    for (const readyTick of Object.values(player.combat.cooldownReadyTickBySkillId)) {
        if (readyTick > currentTick) {
            return true;
        }
    }
    return false;
}
/** shouldResumeIdleCultivation：执行对应的业务逻辑。 */
function shouldResumeIdleCultivation(player, currentTick, blockedPlayerIds) {
    if (player.hp <= 0
        || player.techniques.cultivatingTechId === null
        || player.combat.cultivationActive
        || player.combat.autoIdleCultivation === false) {
        return false;
    }
    if (blockedPlayerIds?.has(player.playerId)) {
        return false;
    }
    return currentTick - player.combat.lastActiveTick >= shared_1.AUTO_IDLE_CULTIVATION_DELAY_TICKS;
}
/** cloneTemporaryBuff：执行对应的业务逻辑。 */
function cloneTemporaryBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/** toConsumableTemporaryBuff：执行对应的业务逻辑。 */
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
        stats: buff.stats
            ? { ...buff.stats }
            : (buff.valueStats ? (0, shared_1.compileValueStatsToActualStats)(buff.valueStats) : undefined),
        qiProjection: buff.qiProjection ? buff.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/** cloneRuntimeAttrState：执行对应的业务逻辑。 */
function cloneRuntimeAttrState(source) {
    return {
        revision: source.revision,
        stage: source.stage,
        baseAttrs: cloneAttributes(source.baseAttrs),
        finalAttrs: cloneAttributes(source.finalAttrs),
        numericStats: cloneNumericStats(source.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(source.ratioDivisors),
    };
}
/** cloneAttributes：执行对应的业务逻辑。 */
function cloneAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}
/** cloneNumericStats：执行对应的业务逻辑。 */
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
/** cloneNumericRatioDivisors：执行对应的业务逻辑。 */
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
/** cloneRuntimeBonus：执行对应的业务逻辑。 */
function cloneRuntimeBonus(source) {
    if (!source || typeof source !== 'object') {
        return null;
    }
    return {
/** source：定义该变量以承载业务值。 */
        source: canonicalizeRuntimeBonusSource(typeof source.source === 'string' ? source.source : ''),
/** label：定义该变量以承载业务值。 */
        label: typeof source.label === 'string' ? source.label : undefined,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: Array.isArray(source.qiProjection) ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
/** meta：定义该变量以承载业务值。 */
        meta: source.meta && typeof source.meta === 'object' ? { ...source.meta } : undefined,
    };
}
/** ensureVitalBaselineBonus：执行对应的业务逻辑。 */
function ensureVitalBaselineBonus(player, vitals) {
    if (!vitals || !Array.isArray(player.runtimeBonuses)) {
        return false;
    }
/** baselineHp：定义该变量以承载业务值。 */
    const baselineHp = Number.isFinite(vitals.maxHp) ? Math.max(1, Math.round(vitals.maxHp)) : 0;
/** baselineQi：定义该变量以承载业务值。 */
    const baselineQi = Number.isFinite(vitals.maxQi) ? Math.max(0, Math.round(vitals.maxQi)) : 0;
/** currentMaxHp：定义该变量以承载业务值。 */
    const currentMaxHp = Math.max(1, Math.round(player.maxHp));
/** currentMaxQi：定义该变量以承载业务值。 */
    const currentMaxQi = Math.max(0, Math.round(player.maxQi));
/** hpDelta：定义该变量以承载业务值。 */
    const hpDelta = Math.max(0, baselineHp - currentMaxHp);
/** qiDelta：定义该变量以承载业务值。 */
    const qiDelta = Math.max(0, baselineQi - currentMaxQi);
/** hpRatio：定义该变量以承载业务值。 */
    const hpRatio = currentMaxHp > 0 ? baselineHp / currentMaxHp : 1;
/** qiRatio：定义该变量以承载业务值。 */
    const qiRatio = currentMaxQi > 0 ? baselineQi / currentMaxQi : 1;
/** nextBonuses：定义该变量以承载业务值。 */
    const nextBonuses = player.runtimeBonuses.filter((entry) => entry?.source !== VITAL_BASELINE_BONUS_SOURCE);
    if (hpDelta <= 0 && qiDelta <= 0) {
        if (nextBonuses.length === player.runtimeBonuses.length) {
            return false;
        }
        player.runtimeBonuses = nextBonuses;
        return true;
    }
/** stats：定义该变量以承载业务值。 */
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
/** resolveCompatibleRuntimeBonuses：执行对应的业务逻辑。 */
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'runtimeBonuses', (candidate) => candidate?.legacyBonuses);
}
/** canonicalizeRuntimeBonusSource：执行对应的业务逻辑。 */
function canonicalizeRuntimeBonusSource(source) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'legacy:vitals_baseline') {
        return VITAL_BASELINE_BONUS_SOURCE;
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
/** cloneCombatEffect：执行对应的业务逻辑。 */
function cloneCombatEffect(source) {
    return { ...source };
}
//# sourceMappingURL=player-runtime.service.js.map
