"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmPlayerService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const content_template_repository_1 = require("../../content/content-template.repository");

const map_template_repository_1 = require("../../runtime/map/map-template.repository");

const player_persistence_service_1 = require("../../persistence/player-persistence.service");

const player_progression_service_1 = require("../../runtime/player/player-progression.service");

const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");

const world_runtime_service_1 = require("../../runtime/world/world-runtime.service");

const next_managed_account_service_1 = require("./next-managed-account.service");

const next_gm_contract_1 = require("./next-gm-contract");

const next_gm_constants_1 = require("./next-gm.constants");

let NextGmPlayerService = class NextGmPlayerService {
    contentTemplateRepository;
    mapTemplateRepository;
    playerPersistenceService;
    playerProgressionService;
    playerRuntimeService;
    worldRuntimeService;
    nextManagedAccountService;
    constructor(contentTemplateRepository, mapTemplateRepository, playerPersistenceService, playerProgressionService, playerRuntimeService, worldRuntimeService, nextManagedAccountService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerPersistenceService = playerPersistenceService;
        this.playerProgressionService = playerProgressionService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.nextManagedAccountService = nextManagedAccountService;
    }
    hasRuntimePlayer(playerId) {
        return Boolean(this.playerRuntimeService.snapshot(playerId));
    }
    async getPlayerDetail(playerId) {

        const account = (await this.nextManagedAccountService.getManagedAccountIndex([playerId])).get(playerId);

        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            return {
                player: this.toManagedPlayerRecord(runtime, this.playerRuntimeService.buildPersistenceSnapshot(playerId), account),
            };
        }

        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            return null;
        }
        return {
            player: this.toManagedPlayerRecordFromPersistence(playerId, persisted, account),
        };
    }
    async updatePlayer(playerId, body) {

        const section = body?.section ?? null;

        const snapshot = body?.snapshot ?? {};

        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            if (section === next_gm_contract_1.NEXT_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
                this.worldRuntimeService.enqueueGmUpdatePlayer({
                    playerId,

                    mapId: typeof snapshot.mapId === 'string' ? snapshot.mapId : runtime.templateId,
                    x: Number.isFinite(snapshot.x) ? snapshot.x : runtime.x,
                    y: Number.isFinite(snapshot.y) ? snapshot.y : runtime.y,
                    hp: Number.isFinite(snapshot.hp) ? snapshot.hp : runtime.hp,

                    autoBattle: typeof snapshot.autoBattle === 'boolean' ? snapshot.autoBattle : runtime.combat.autoBattle === true,
                });
                return;
            }
        }

        const persisted = runtime
            ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
            : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        if (section === next_gm_contract_1.NEXT_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
            this.applyPositionToPersistenceSnapshot(persisted, snapshot);
        }
        else {
            this.applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section);
        }
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
        if (!runtime || section === next_gm_contract_1.NEXT_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
            return;
        }
        const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
        if (!refreshedRuntime) {
            return;
        }
        this.applyPlayerSnapshotMutation(refreshedRuntime, snapshot, section);
        this.repairRuntimeSnapshot(refreshedRuntime);
        refreshedRuntime.selfRevision += 1;
        refreshedRuntime.persistentRevision += 1;
        this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
    }
    resetPlayer(playerId) {
        this.worldRuntimeService.enqueueGmResetPlayer(playerId);
    }
    async resetPersistedPlayer(playerId) {

        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }

        const template = this.mapTemplateRepository.getOrThrow('yunlai_town');
        persisted.placement.templateId = template.id;
        persisted.placement.x = template.spawnX;
        persisted.placement.y = template.spawnY;
        persisted.placement.facing = shared_1.Direction.South;
        persisted.vitals.hp = persisted.vitals.maxHp;
        persisted.vitals.qi = persisted.vitals.maxQi;
        persisted.buffs.buffs = [];
        persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
        persisted.combat.autoBattle = false;
        persisted.combat.combatTargetId = null;
        persisted.combat.combatTargetLocked = false;
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    }
    async resetHeavenGate(playerId) {

        const runtime = this.playerRuntimeService.snapshot(playerId);
        const persisted = runtime
            ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
            : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        persisted.progression.heavenGate = null;
        persisted.progression.spiritualRoots = null;
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
        if (!runtime) {
            return;
        }
        const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
        if (!refreshedRuntime) {
            return;
        }
        refreshedRuntime.heavenGate = null;
        refreshedRuntime.spiritualRoots = null;
        if (refreshedRuntime.realm) {
            refreshedRuntime.realm.heavenGate = undefined;
        }
        this.repairRuntimeSnapshot(refreshedRuntime);
        refreshedRuntime.selfRevision += 1;
        refreshedRuntime.persistentRevision += 1;
        this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
    }
    spawnBots(anchorPlayerId, count) {
        this.worldRuntimeService.enqueueGmSpawnBots(anchorPlayerId, count);
    }
    removeBots(playerIds, all) {
        this.worldRuntimeService.enqueueGmRemoveBots(playerIds, all);
    }
    async returnAllPlayersToDefaultSpawn() {

        const template = this.mapTemplateRepository.getOrThrow('yunlai_town');

        const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => !(0, next_gm_constants_1.isNextGmBotPlayerId)(entry.playerId));

        const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
        for (const runtime of runtimePlayers) {
            this.worldRuntimeService.enqueueGmResetPlayer(runtime.playerId);
        }

        let updatedOfflinePlayers = 0;
        for (const entry of persistedEntries) {
            if (runtimePlayerIds.has(entry.playerId)) {
                continue;
            }
            entry.snapshot.placement.templateId = template.id;
            entry.snapshot.placement.x = template.spawnX;
            entry.snapshot.placement.y = template.spawnY;
            entry.snapshot.placement.facing = shared_1.Direction.South;
            entry.snapshot.vitals.hp = entry.snapshot.vitals.maxHp;
            entry.snapshot.vitals.qi = entry.snapshot.vitals.maxQi;
            entry.snapshot.buffs.buffs = [];
            entry.snapshot.buffs.revision = Math.max(1, (entry.snapshot.buffs.revision ?? 1) + 1);
            entry.snapshot.combat.autoBattle = false;
            entry.snapshot.combat.combatTargetId = null;
            entry.snapshot.combat.combatTargetLocked = false;
            await this.playerPersistenceService.savePlayerSnapshot(entry.playerId, entry.snapshot);
            updatedOfflinePlayers += 1;
        }
        return {
            ok: true,
            totalPlayers: runtimePlayers.length + updatedOfflinePlayers,
            queuedRuntimePlayers: runtimePlayers.length,
            updatedOfflinePlayers,
            targetMapId: template.id,
            targetX: template.spawnX,
            targetY: template.spawnY,
        };
    }
    applyPlayerSnapshotMutation(next, snapshot, section) {
        if (section === null || section === 'basic') {
            if (typeof snapshot.name === 'string' && snapshot.name.trim()) {
                next.name = snapshot.name.trim();
            }
            if (typeof snapshot.displayName === 'string' && snapshot.displayName.trim()) {
                next.displayName = snapshot.displayName.trim();
            }
            if (Number.isFinite(snapshot.maxHp)) {
                next.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
            }
            if (Number.isFinite(snapshot.maxQi)) {
                next.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
            }
            if (Number.isFinite(snapshot.hp)) {
                next.hp = clamp(Math.trunc(snapshot.hp), 0, next.maxHp);
            }
            if (Number.isFinite(snapshot.qi)) {
                next.qi = clamp(Math.trunc(snapshot.qi), 0, next.maxQi);
            }
            if (typeof snapshot.dead === 'boolean') {
                next.hp = snapshot.dead ? 0 : Math.max(1, next.hp);
            }
            if (typeof snapshot.autoBattle === 'boolean') {
                next.combat.autoBattle = snapshot.autoBattle;
            }
            if (typeof snapshot.autoRetaliate === 'boolean') {
                next.combat.autoRetaliate = snapshot.autoRetaliate;
            }
            if (typeof snapshot.autoBattleStationary === 'boolean') {
                next.combat.autoBattleStationary = snapshot.autoBattleStationary;
            }
            if (typeof snapshot.allowAoePlayerHit === 'boolean') {
                next.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
            }
            if (typeof snapshot.autoIdleCultivation === 'boolean') {
                next.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
            }
            if (typeof snapshot.autoSwitchCultivation === 'boolean') {
                next.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
            }
            if (typeof snapshot.senseQiActive === 'boolean') {
                next.combat.senseQiActive = snapshot.senseQiActive;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                next.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),

                    enabled: entry.enabled !== false,

                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
            if (Array.isArray(snapshot.temporaryBuffs)) {
                next.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
                next.buffs.revision += 1;
            }
        }
        if (section === 'realm') {
            if (snapshot.baseAttrs && typeof snapshot.baseAttrs === 'object') {
                next.attrs.baseAttrs = { ...shared_1.DEFAULT_BASE_ATTRS, ...snapshot.baseAttrs };
            }
            if (Number.isFinite(snapshot.foundation)) {
                next.foundation = Math.max(0, Math.trunc(snapshot.foundation));
            }
            if (Number.isFinite(snapshot.combatExp)) {
                next.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
            }

            const realmLv = Number.isFinite(snapshot.realmLv)
                ? Math.trunc(snapshot.realmLv)
                : next.realm?.realmLv ?? 1;

            const progress = Number.isFinite(snapshot.realm?.progress)
                ? Math.trunc(snapshot.realm.progress)
                : next.realm?.progress ?? 0;
            next.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
        }
        if (section === 'techniques') {
            if (Array.isArray(snapshot.techniques)) {
                next.techniques.techniques = snapshot.techniques
                    .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
                    .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
                    .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
                next.techniques.revision += 1;
            }
            if (snapshot.cultivatingTechId === undefined || snapshot.cultivatingTechId === null || typeof snapshot.cultivatingTechId === 'string') {
                next.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                next.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),

                    enabled: entry.enabled !== false,

                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
        }
        if (section === 'items') {
            if (snapshot.inventory && typeof snapshot.inventory === 'object') {
                if (Number.isFinite(snapshot.inventory.capacity)) {
                    next.inventory.capacity = Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
                }
                if (Array.isArray(snapshot.inventory.items)) {
                    next.inventory.items = snapshot.inventory.items
                        .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
                        .map((entry) => this.contentTemplateRepository.normalizeItem({
                        ...entry,
                        itemId: entry.itemId.trim(),
                        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
                    }));
                    next.inventory.revision += 1;
                }
            }
            if (snapshot.equipment && typeof snapshot.equipment === 'object') {

                const bySlot = new Map(next.equipment.slots.map((entry) => [entry.slot, entry]));
                for (const slot of shared_1.EQUIP_SLOTS) {
                    if (!(slot in snapshot.equipment)) {
                        continue;
                    }

                    const record = bySlot.get(slot);
                    if (!record) {
                        continue;
                    }

                    const item = snapshot.equipment[slot];
                    record.item = item && typeof item.itemId === 'string' && item.itemId.trim()
                        ? this.contentTemplateRepository.normalizeItem({
                            ...item,
                            itemId: item.itemId.trim(),
                            count: 1,
                        })
                        : null;
                }
                next.equipment.revision += 1;
            }
        }
        if (section === 'quests' && Array.isArray(snapshot.quests)) {
            next.quests.quests = snapshot.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            }));
            next.quests.revision += 1;
        }
    }
    applyPositionToPersistenceSnapshot(persisted, snapshot) {
        if (typeof snapshot.mapId === 'string' && snapshot.mapId.trim()) {
            this.mapTemplateRepository.getOrThrow(snapshot.mapId.trim());
            persisted.placement.templateId = snapshot.mapId.trim();
        }

        const template = this.mapTemplateRepository.getOrThrow(persisted.placement.templateId);
        if (Number.isFinite(snapshot.x)) {
            persisted.placement.x = clamp(Math.trunc(snapshot.x), 0, Math.max(0, template.width - 1));
        }
        if (Number.isFinite(snapshot.y)) {
            persisted.placement.y = clamp(Math.trunc(snapshot.y), 0, Math.max(0, template.height - 1));
        }
        if (Number.isFinite(snapshot.facing)) {
            persisted.placement.facing = Math.trunc(snapshot.facing);
        }
        if (Number.isFinite(snapshot.hp)) {
            persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
        }
        if (typeof snapshot.autoBattle === 'boolean') {
            persisted.combat.autoBattle = snapshot.autoBattle;
        }
    }
    applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section) {
        if (section === null || section === 'basic') {
            if (Number.isFinite(snapshot.maxHp)) {
                persisted.vitals.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
                if (persisted.vitals.hp > persisted.vitals.maxHp) {
                    persisted.vitals.hp = persisted.vitals.maxHp;
                }
            }
            if (Number.isFinite(snapshot.maxQi)) {
                persisted.vitals.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
                if (persisted.vitals.qi > persisted.vitals.maxQi) {
                    persisted.vitals.qi = persisted.vitals.maxQi;
                }
            }
            if (Number.isFinite(snapshot.hp)) {
                persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
            }
            if (Number.isFinite(snapshot.qi)) {
                persisted.vitals.qi = clamp(Math.trunc(snapshot.qi), 0, persisted.vitals.maxQi);
            }
            if (typeof snapshot.dead === 'boolean') {
                persisted.vitals.hp = snapshot.dead ? 0 : Math.max(1, persisted.vitals.hp);
            }
            if (typeof snapshot.autoBattle === 'boolean') {
                persisted.combat.autoBattle = snapshot.autoBattle;
            }
            if (typeof snapshot.autoRetaliate === 'boolean') {
                persisted.combat.autoRetaliate = snapshot.autoRetaliate;
            }
            if (typeof snapshot.autoBattleStationary === 'boolean') {
                persisted.combat.autoBattleStationary = snapshot.autoBattleStationary;
            }
            if (typeof snapshot.allowAoePlayerHit === 'boolean') {
                persisted.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
            }
            if (typeof snapshot.autoIdleCultivation === 'boolean') {
                persisted.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
            }
            if (typeof snapshot.autoSwitchCultivation === 'boolean') {
                persisted.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
            }
            if (typeof snapshot.senseQiActive === 'boolean') {
                persisted.combat.senseQiActive = snapshot.senseQiActive;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),

                    enabled: entry.enabled !== false,

                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
            if (Array.isArray(snapshot.temporaryBuffs)) {
                persisted.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
                persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
            }
        }
        if (section === 'realm') {
            if (Number.isFinite(snapshot.foundation)) {
                persisted.progression.foundation = Math.max(0, Math.trunc(snapshot.foundation));
            }
            if (Number.isFinite(snapshot.combatExp)) {
                persisted.progression.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
            }

            const realmLv = Number.isFinite(snapshot.realmLv)
                ? Math.trunc(snapshot.realmLv)
                : persisted.progression.realm?.realmLv ?? 1;

            const progress = Number.isFinite(snapshot.realm?.progress)
                ? Math.trunc(snapshot.realm.progress)
                : persisted.progression.realm?.progress ?? 0;
            persisted.progression.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
        }
        if (section === 'techniques') {
            if (Array.isArray(snapshot.techniques)) {
                persisted.techniques.techniques = snapshot.techniques
                    .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
                    .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
                    .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
                persisted.techniques.revision = Math.max(1, (persisted.techniques.revision ?? 1) + 1);
            }
            if (snapshot.cultivatingTechId === undefined || snapshot.cultivatingTechId === null || typeof snapshot.cultivatingTechId === 'string') {
                persisted.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),

                    enabled: entry.enabled !== false,

                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
        }
        if (section === 'items') {
            if (snapshot.inventory && typeof snapshot.inventory === 'object') {
                if (Number.isFinite(snapshot.inventory.capacity)) {
                    persisted.inventory.capacity = Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
                }
                if (Array.isArray(snapshot.inventory.items)) {
                    persisted.inventory.items = snapshot.inventory.items
                        .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
                        .map((entry) => ({
                        ...entry,
                        itemId: entry.itemId.trim(),
                        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
                    }));
                    persisted.inventory.revision = Math.max(1, (persisted.inventory.revision ?? 1) + 1);
                }
            }
            if (snapshot.equipment && typeof snapshot.equipment === 'object') {

                const nextSlots = [];
                for (const slot of shared_1.EQUIP_SLOTS) {
                    const item = snapshot.equipment[slot];
                    nextSlots.push({
                        slot,

                        item: item && typeof item.itemId === 'string' && item.itemId.trim()
                            ? {
                                ...item,
                                itemId: item.itemId.trim(),
                                count: 1,
                            }
                            : null,
                    });
                }
                persisted.equipment.slots = nextSlots;
                persisted.equipment.revision = Math.max(1, (persisted.equipment.revision ?? 1) + 1);
            }
        }
        if (section === 'quests' && Array.isArray(snapshot.quests)) {
            persisted.quests.entries = snapshot.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            }));
            persisted.quests.revision = Math.max(1, (persisted.quests.revision ?? 1) + 1);
        }
    }
    repairRuntimeSnapshot(snapshot) {
        if (snapshot.maxHp < 1) {
            snapshot.maxHp = 1;
        }
        if (snapshot.maxQi < 0) {
            snapshot.maxQi = 0;
        }
        snapshot.hp = clamp(snapshot.hp, 0, snapshot.maxHp);
        snapshot.qi = clamp(snapshot.qi, 0, snapshot.maxQi);
        if (snapshot.realm) {
            snapshot.realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.realm.realmLv, snapshot.realm.progress);
        }
        this.playerProgressionService.initializePlayer(snapshot);
        this.playerRuntimeService.rebuildActionState(snapshot, 0);
    }
    toManagedPlayerSummary(snapshot, account = null) {

        const player = this.toLegacyPlayerState(snapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,

            autoBattleStationary: player.autoBattleStationary === true,

            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,

                isBot: player.isBot === true,

                online: player.online === true,

                inWorld: player.inWorld !== false,
                dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
            },
        };
    }
    toManagedPlayerRecord(snapshot, persistedSnapshot, account = null) {

        const summary = this.toManagedPlayerSummary(snapshot, account);
        return {
            ...summary,

            account: buildManagedAccountView(account, summary.meta.online === true),
            snapshot: this.toLegacyPlayerState(snapshot),
            persistedSnapshot: persistedSnapshot ?? null,
        };
    }
    toManagedPlayerRecordFromPersistence(playerId, persistedSnapshot, account = null) {

        const player = this.toLegacyPlayerStateFromPersistence(playerId, persistedSnapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,

            autoBattleStationary: player.autoBattleStationary === true,

            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,

                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                dirtyFlags: [],
            },
            account: buildManagedAccountView(account, false),
            snapshot: player,
            persistedSnapshot,
        };
    }
    toLegacyPlayerState(snapshot) {
        return {
            id: snapshot.playerId,
            name: snapshot.name,
            displayName: snapshot.displayName,
            isBot: (0, next_gm_constants_1.isNextGmBotPlayerId)(snapshot.playerId),

            online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,

            inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,

            senseQiActive: snapshot.combat.senseQiActive === true,

            autoRetaliate: snapshot.combat.autoRetaliate !== false,

            autoBattleStationary: snapshot.combat.autoBattleStationary === true,

            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,

            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,

            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,

            cultivationActive: snapshot.combat.cultivationActive === true,
            realmLv: snapshot.realm?.realmLv ?? 1,
            realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',

            realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
            realmReview: snapshot.realm?.review,

            breakthroughReady: snapshot.realm?.breakthroughReady === true,
            heavenGate: snapshot.heavenGate,
            spiritualRoots: snapshot.spiritualRoots,
            boneAgeBaseYears: snapshot.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.lifeElapsedTicks,
            lifespanYears: snapshot.lifespanYears,
            mapId: snapshot.templateId,
            x: snapshot.x,
            y: snapshot.y,
            facing: snapshot.facing,
            viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
            hp: snapshot.hp,
            maxHp: snapshot.maxHp,
            qi: snapshot.qi,

            dead: snapshot.hp <= 0,
            foundation: snapshot.foundation,
            combatExp: snapshot.combatExp,
            baseAttrs: { ...snapshot.attrs.baseAttrs },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            finalAttrs: { ...snapshot.attrs.finalAttrs },
            numericStats: { ...snapshot.attrs.numericStats },
            ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: snapshot.inventory.items.map((entry) => ({ ...entry })),
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
            actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
            quests: snapshot.quests.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            })),

            autoBattle: snapshot.combat.autoBattle === true,
            autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,

            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm: snapshot.realm ? {
                ...snapshot.realm,
                heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
                breakthrough: snapshot.realm.breakthrough ? {
                    ...snapshot.realm.breakthrough,
                    requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                        ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                        : [],
                } : snapshot.realm.breakthrough,
            } : undefined,
        };
    }
    toLegacyPlayerStateFromPersistence(playerId, snapshot) {

        const realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.progression?.realm?.realmLv ?? 1, snapshot.progression?.realm?.progress ?? 0);
        return {
            id: playerId,
            name: playerId,
            displayName: playerId,
            mapId: snapshot.placement.templateId,
            x: snapshot.placement.x,
            y: snapshot.placement.y,
            facing: snapshot.placement.facing,
            viewRange: shared_1.VIEW_RADIUS,
            hp: snapshot.vitals.hp,
            maxHp: snapshot.vitals.maxHp,
            qi: snapshot.vitals.qi,

            dead: snapshot.vitals.hp <= 0,

            autoBattle: snapshot.combat.autoBattle === true,

            autoRetaliate: snapshot.combat.autoRetaliate !== false,

            autoBattleStationary: snapshot.combat.autoBattleStationary === true,

            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,

            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,

            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,

            senseQiActive: snapshot.combat.senseQiActive === true,
            realmLv: realm.realmLv,
            realmName: realm.displayName,
            realmStage: realm.stage,
            realmReview: realm.review,
            breakthroughReady: realm.breakthroughReady,
            heavenGate: snapshot.progression.heavenGate ?? null,
            spiritualRoots: snapshot.progression.spiritualRoots ?? null,
            boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
            lifespanYears: snapshot.progression.lifespanYears,
            foundation: snapshot.progression.foundation,
            combatExp: snapshot.progression.combatExp,
            baseAttrs: { ...shared_1.DEFAULT_BASE_ATTRS },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: Array.isArray(snapshot.techniques.techniques) ? snapshot.techniques.techniques.map((entry) => ({ ...entry })) : [],
            actions: [],
            quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
            autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills) ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })) : [],
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,

            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm,
        };
    }
    resolveMapName(mapId) {
        try {
            return this.mapTemplateRepository.getOrThrow(mapId).name;
        }
        catch {
            return mapId;
        }
    }
};
exports.NextGmPlayerService = NextGmPlayerService;
exports.NextGmPlayerService = NextGmPlayerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        map_template_repository_1.MapTemplateRepository,
        player_persistence_service_1.PlayerPersistenceService,
        player_progression_service_1.PlayerProgressionService,
        player_runtime_service_1.PlayerRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        next_managed_account_service_1.NextManagedAccountService])
], NextGmPlayerService);
function buildManagedAccountView(account, online) {
    if (!account?.userId || !account.username) {
        return undefined;
    }

    let totalOnlineSeconds = Number.isFinite(account.totalOnlineSeconds) ? Math.max(0, Math.trunc(account.totalOnlineSeconds)) : 0;
    if (online && typeof account.currentOnlineStartedAt === 'string' && account.currentOnlineStartedAt) {

        const sessionStartedAt = Date.parse(account.currentOnlineStartedAt);
        if (Number.isFinite(sessionStartedAt)) {
            totalOnlineSeconds += Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
        }
    }
    return {
        userId: account.userId,
        username: account.username,

        createdAt: typeof account.createdAt === 'string' && account.createdAt ? account.createdAt : new Date(0).toISOString(),
        totalOnlineSeconds,
    };
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function toLegacyEquipmentSlots(slots) {

    const bySlot = new Map(slots.map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));
    return {
        weapon: bySlot.get('weapon') ?? null,
        head: bySlot.get('head') ?? null,
        body: bySlot.get('body') ?? null,
        legs: bySlot.get('legs') ?? null,
        accessory: bySlot.get('accessory') ?? null,
    };
}
function cloneTemporaryBuff(entry) {
    return {
        ...entry,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        stats: entry.stats ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
    };
}
function cloneRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
    };
}
