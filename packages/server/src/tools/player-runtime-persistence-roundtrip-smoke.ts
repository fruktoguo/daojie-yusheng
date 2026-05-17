// @ts-nocheck

const assert = require("node:assert/strict");

const {
    createNumericRatioDivisors,
    createNumericStats,
    DEFAULT_BONE_AGE_YEARS,
    DEFAULT_INVENTORY_CAPACITY,
    Direction,
} = require("@mud/shared");
const { PlayerRuntimeService } = require("../runtime/player/player-runtime.service");
const { ContentTemplateRepository } = require("../content/content-template.repository");

function createPlayerRuntimeService(contentTemplateRepository) {
    const repository = contentTemplateRepository ?? {
        createStarterInventory() {
            return {
                capacity: DEFAULT_INVENTORY_CAPACITY,
                items: [],
            };
        },
        createDefaultEquipment() {
            return {};
        },
        normalizeItem(item) {
            return item;
        },
        hydrateTechniqueState(entry) {
            return entry;
        },
    };
    return new PlayerRuntimeService(repository, {
        has(mapId) {
            return mapId === 'yunlai_town';
        },
        getOrThrow(mapId) {
            const walkableMask = new Uint8Array(64 * 64).fill(1);
            walkableMask[0] = 0;
            return {
                id: mapId,
                width: 64,
                height: 64,
                spawnX: 32,
                spawnY: 5,
                walkableMask,
            };
        },
        list() {
            return [{
                id: 'yunlai_town',
                width: 64,
                height: 64,
                spawnX: 32,
                spawnY: 5,
                walkableMask: new Uint8Array(64 * 64).fill(1),
            }];
        },
    }, {
        createInitialState() {
            return {
                stage: '炼气',
                baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
                finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
                numericStats: createNumericStats(),
                ratioDivisors: createNumericRatioDivisors(),
            };
        },
        recalculate() {
            return undefined;
        },
    }, {
        initializePlayer() {
            return undefined;
        },
        refreshPreview() {
            return undefined;
        },
    });
}

function createSnapshot(gatherJob, buildingJob = null) {
    return {
        version: 1,
        savedAt: 1000,
        placement: {
            instanceId: 'public:yunlai_town',
            templateId: 'yunlai_town',
            x: 32,
            y: 5,
            facing: Direction.South,
        },
        worldPreference: {
            linePreset: 'real',
        },
        vitals: {
            hp: 100,
            maxHp: 100,
            qi: 10,
            maxQi: 100,
        },
        progression: {
            foundation: 0,
            combatExp: 0,
            bodyTraining: null,
            alchemySkill: null,
            gatherSkill: null,
            gatherJob,
            buildingJob,
            alchemyPresets: [],
            alchemyJob: null,
            enhancementSkill: null,
            enhancementSkillLevel: 1,
            enhancementJob: null,
            enhancementRecords: [],
            boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
            lifeElapsedTicks: 0,
            lifespanYears: null,
            realm: null,
            heavenGate: null,
            spiritualRoots: null,
        },
        unlockedMapIds: ['yunlai_town'],
        inventory: {
            revision: 1,
            capacity: DEFAULT_INVENTORY_CAPACITY,
            items: [],
        },
        equipment: {
            revision: 1,
            slots: [],
        },
        techniques: {
            revision: 1,
            techniques: [],
            cultivatingTechId: null,
        },
        buffs: {
            revision: 1,
            buffs: [],
        },
        quests: {
            revision: 1,
            entries: [],
        },
        combat: {
            autoBattle: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            autoUsePills: [],
        combatTargetingRules: null,
        autoBattleTargetingMode: 'auto',
        retaliatePlayerTargetId: null,
        retaliatePlayerTargetLastAttackTick: null,
        combatTargetId: null,
        combatTargetLocked: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: true,
            autoSwitchCultivation: false,
            senseQiActive: false,
            autoBattleSkills: [],
        },
        pendingLogbookMessages: [],
        runtimeBonuses: [],
    };
}

function testGatherJobRoundtrip() {
    const service = createPlayerRuntimeService();
    const gatherJob = {
        resourceNodeId: 'landmark.herb.moondew_grass',
        resourceNodeName: '月露草',
        phase: 'paused',
        startedAt: 100,
        totalTicks: 12,
        remainingTicks: 4,
        pausedTicks: 2,
        successRate: 0.85,
        spiritStoneCost: 0,
    };
    const player = service.hydrateFromSnapshot('player:1', 'session:1', createSnapshot(gatherJob));
    assert.deepEqual(player.gatherJob, gatherJob);
    assert.deepEqual(player.worldPreference, { linePreset: 'real' });
    service.players.set('player:1', player);
    const snapshot = service.buildPersistenceSnapshot('player:1');
    assert.deepEqual(snapshot.progression.gatherJob, gatherJob);
    assert.deepEqual(snapshot.worldPreference, { linePreset: 'real' });
}

function testBuildingJobRoundtrip() {
    const service = createPlayerRuntimeService();
    const buildingJob = {
        buildingId: 'building:half:1',
        buildingName: '门',
        instanceId: 'real:building_command_runtime_smoke',
        phase: 'building',
        startedAt: 100,
        totalTicks: 8,
        remainingTicks: 3,
        pausedTicks: 0,
        successRate: 1,
        spiritStoneCost: 0,
    };
    const player = service.hydrateFromSnapshot('player:building', 'session:1', createSnapshot(null, buildingJob));
    assert.deepEqual(player.buildingJob, buildingJob);
    service.players.set('player:building', player);
    const snapshot = service.buildPersistenceSnapshot('player:building');
    assert.deepEqual(snapshot.progression.buildingJob, buildingJob);
}

function testInvalidGatherJobFallsBackToNull() {
    const service = createPlayerRuntimeService();
    const player = service.hydrateFromSnapshot('player:2', 'session:2', createSnapshot({
        phase: 'paused',
    }));
    assert.equal(player.gatherJob, null);
}

function testFreshSnapshotKeepsGatherJobEmpty() {
    const service = createPlayerRuntimeService();
    const snapshot = service.buildFreshPersistenceSnapshot('player:3', {
        instanceId: 'public:yunlai_town',
        templateId: 'yunlai_town',
        x: 12,
        y: 7,
        facing: Direction.South,
    });
    assert.equal(snapshot.progression.gatherJob, null);
    assert.equal(snapshot.progression.buildingJob, null);
    assert.deepEqual(snapshot.worldPreference, { linePreset: 'peaceful' });
}

function testMissingRespawnFallsBackToStarterMap() {
    const service = createPlayerRuntimeService();
    const snapshot = createSnapshot(null);
    snapshot.placement = {
        instanceId: 'public:yunlai_town_ore_basement',
        templateId: 'yunlai_town_ore_basement',
        x: 8,
        y: 5,
        facing: Direction.South,
    };
    delete snapshot.respawn;
    const player = service.hydrateFromSnapshot('player:4', 'session:4', snapshot);
    assert.equal(player.templateId, 'yunlai_town_ore_basement');
    assert.equal(player.respawnTemplateId, 'yunlai_town');
    assert.equal(player.respawnInstanceId, 'public:yunlai_town');
    assert.equal(player.respawnX, 32);
    assert.equal(player.respawnY, 5);
}

function testInvalidRespawnPointFallsBackToMapSpawnAndMarksCheckpointDirty() {
    const service = createPlayerRuntimeService();
    const snapshot = createSnapshot(null);
    snapshot.respawn = {
        instanceId: 'public:yunlai_town',
        templateId: 'yunlai_town',
        x: 0,
        y: 0,
        facing: Direction.South,
    };
    const player = service.hydrateFromSnapshot('player:invalid-respawn', 'session:invalid-respawn', snapshot);
    assert.equal(player.respawnTemplateId, 'yunlai_town');
    assert.equal(player.respawnInstanceId, 'public:yunlai_town');
    assert.equal(player.respawnX, 32);
    assert.equal(player.respawnY, 5);
    assert.ok(player.dirtyDomains?.has('position_checkpoint'));
    assert.ok(player.persistentRevision > player.persistedRevision);
}

function testSectIdRoundtrip() {
    const service = createPlayerRuntimeService();
    const snapshot = createSnapshot(null);
    snapshot.sectId = 'sect:player:alpha';
    const player = service.hydrateFromSnapshot('player:5', 'session:5', snapshot);
    assert.equal(player.sectId, 'sect:player:alpha');
    service.players.set('player:5', player);
    const persisted = service.buildPersistenceSnapshot('player:5');
    assert.equal(persisted.sectId, 'sect:player:alpha');
}

function testPendingSkillCastIsRuntimeOnly() {
    const service = createPlayerRuntimeService();
    const snapshot = createSnapshot(null);
    snapshot.combat.pendingSkillCast = {
        skillId: 'skill:stale',
        remainingTicks: 2,
    };
    const player = service.hydrateFromSnapshot('player:pending', 'session:pending', snapshot);
    assert.equal(player.combat.pendingSkillCast, undefined);
    player.combat.pendingSkillCast = {
        skillId: 'skill:runtime-only',
        remainingTicks: 2,
    };
    service.players.set('player:pending', player);
    const persisted = service.buildPersistenceSnapshot('player:pending');
    assert.equal(persisted.combat.pendingSkillCast, undefined);
}

function testReplaceInventoryItemsKeepsTemplateOnPrototype() {
    const contentTemplateRepository = new ContentTemplateRepository();
    const template = {
        itemId: 'item:roundtrip-prototype',
        name: 'Roundtrip Prototype Item',
        type: 'material',
        desc: 'template-only description',
        tags: ['proof'],
    };
    contentTemplateRepository.itemTemplates.set(template.itemId, template);

    const service = createPlayerRuntimeService(contentTemplateRepository);
    const player = service.hydrateFromSnapshot('player:replace-inventory', 'session:replace-inventory', createSnapshot(null));
    service.players.set(player.playerId, player);

    service.replaceInventoryItems(player.playerId, [{
        itemId: template.itemId,
        count: 5,
        enhanceLevel: 2,
    }]);

    const replaced = player.inventory.items[0];
    assert.equal(replaced.name, template.name);
    assert.equal(replaced.tags, template.tags);
    assert.deepEqual(Object.keys(replaced).sort(), ['count', 'enhanceLevel', 'itemId']);
    assert.equal(JSON.parse(JSON.stringify(replaced)).name, undefined);
}

function testReplaceEquipmentSlotsKeepsTemplateOnPrototype() {
    const contentTemplateRepository = new ContentTemplateRepository();
    const template = {
        itemId: 'equip:roundtrip-prototype',
        name: 'Roundtrip Prototype Sword',
        type: 'equipment',
        equipSlot: 'weapon',
        desc: 'template-only weapon description',
        equipAttrs: { strength: 3 },
    };
    contentTemplateRepository.itemTemplates.set(template.itemId, template);

    const service = createPlayerRuntimeService(contentTemplateRepository);
    const player = service.hydrateFromSnapshot('player:replace-equipment', 'session:replace-equipment', createSnapshot(null));
    service.players.set(player.playerId, player);

    service.replaceEquipmentSlots(player.playerId, [{
        slot: 'weapon',
        item: {
            itemId: template.itemId,
            count: 1,
            enhanceLevel: 1,
        },
    }]);

    const weapon = player.equipment.slots.find((entry) => entry.slot === 'weapon')?.item;
    assert.equal(weapon.name, template.name);
    assert.equal(weapon.equipSlot, template.equipSlot);
    assert.equal(weapon.equipAttrs, template.equipAttrs);
    assert.deepEqual(Object.keys(weapon).sort(), ['count', 'enhanceLevel', 'itemId']);
    assert.equal(JSON.parse(JSON.stringify(weapon)).equipAttrs, undefined);
}

function testHydrateInventoryItemsKeepTemplateOnPrototype() {
    const contentTemplateRepository = new ContentTemplateRepository();
    const template = {
        itemId: 'item:hydrate-prototype',
        name: 'Hydrate Prototype Item',
        type: 'material',
        desc: 'template-only hydrate description',
        effects: [{ type: 'proof' }],
    };
    contentTemplateRepository.itemTemplates.set(template.itemId, template);

    const service = createPlayerRuntimeService(contentTemplateRepository);
    const snapshot = createSnapshot(null);
    snapshot.inventory.items = [{
        itemId: template.itemId,
        count: 7,
        enhanceLevel: 3,
    }];

    const player = service.hydrateFromSnapshot('player:hydrate-inventory', 'session:hydrate-inventory', snapshot);
    const item = player.inventory.items[0];
    assert.equal(item.name, template.name);
    assert.equal(item.effects, template.effects);
    assert.deepEqual(Object.keys(item).sort(), ['count', 'enhanceLevel', 'itemId']);
    assert.equal(JSON.parse(JSON.stringify(item)).effects, undefined);
}

function testSnapshotAndRestoreKeepItemPrototypes() {
    const contentTemplateRepository = new ContentTemplateRepository();
    const itemTemplate = {
        itemId: 'item:snapshot-prototype',
        name: 'Snapshot Prototype Item',
        type: 'material',
        desc: 'snapshot template-only item',
    };
    const equipmentTemplate = {
        itemId: 'equip:snapshot-prototype',
        name: 'Snapshot Prototype Equipment',
        type: 'equipment',
        equipSlot: 'weapon',
        equipAttrs: { spirit: 4 },
    };
    contentTemplateRepository.itemTemplates.set(itemTemplate.itemId, itemTemplate);
    contentTemplateRepository.itemTemplates.set(equipmentTemplate.itemId, equipmentTemplate);

    const service = createPlayerRuntimeService(contentTemplateRepository);
    const snapshot = createSnapshot(null);
    snapshot.inventory.items = [{ itemId: itemTemplate.itemId, count: 2 }];
    snapshot.equipment.slots = [{
        slot: 'weapon',
        item: { itemId: equipmentTemplate.itemId, count: 1, enhanceLevel: 1 },
    }];
    const player = service.hydrateFromSnapshot('player:snapshot-prototype', 'session:snapshot-prototype', snapshot);
    service.players.set(player.playerId, player);

    const runtimeSnapshot = service.snapshot(player.playerId);
    assert.equal(runtimeSnapshot.inventory.items[0].name, itemTemplate.name);
    assert.deepEqual(Object.keys(runtimeSnapshot.inventory.items[0]).sort(), ['count', 'itemId']);
    const snapshotWeapon = runtimeSnapshot.equipment.slots.find((entry) => entry.slot === 'weapon')?.item;
    assert.equal(snapshotWeapon.name, equipmentTemplate.name);
    assert.equal(snapshotWeapon.equipAttrs, equipmentTemplate.equipAttrs);
    // 装备类强制带 itemInstanceId（assignItemInstanceIdIfNeeded 兜底）
    assert.deepEqual(Object.keys(snapshotWeapon).sort(), ['count', 'enhanceLevel', 'itemId', 'itemInstanceId']);

    service.restoreSnapshot(runtimeSnapshot);
    const restoredSnapshot = service.snapshot(player.playerId);
    assert.equal(restoredSnapshot.inventory.items[0].name, itemTemplate.name);
    const restoredWeapon = restoredSnapshot.equipment.slots.find((entry) => entry.slot === 'weapon')?.item;
    assert.equal(restoredWeapon.name, equipmentTemplate.name);
    assert.equal(JSON.parse(JSON.stringify(restoredWeapon)).equipAttrs, undefined);
}

function testTemporaryBuffRuntimeUsesPrototypeAndMaterializesJson() {
    const service = createPlayerRuntimeService();
    const player = service.hydrateFromSnapshot('player:buff-prototype', 'session:buff-prototype', createSnapshot(null));
    service.players.set(player.playerId, player);

    const attrs = { spirit: 12 };
    const stats = { physAtk: 7 };
    const qiProjection = [{ key: 'test.qi', value: 3 }];
    service.applyTemporaryBuff(player.playerId, {
        buffId: 'buff:prototype',
        name: 'Prototype Buff',
        desc: 'template-only buff desc',
        baseDesc: 'template-only base desc',
        shortMark: '原',
        category: 'buff',
        visibility: 'public',
        remainingTicks: 10,
        duration: 10,
        stacks: 1,
        maxStacks: 3,
        sourceSkillId: 'skill:prototype',
        sourceSkillName: 'Prototype Skill',
        color: '#abcdef',
        attrs,
        attrMode: 'flat',
        stats,
        statMode: 'percent',
        qiProjection,
        presentationScale: 1.2,
    });

    const runtimeBuff = player.buffs.buffs[0];
    assert.equal(runtimeBuff.name, 'Prototype Buff');
    assert.equal(runtimeBuff.attrs, attrs);
    assert.equal(runtimeBuff.stats, stats);
    assert.equal(runtimeBuff.qiProjection, qiProjection);
    assert.deepEqual(Object.keys(runtimeBuff).sort(), ['duration', 'maxStacks', 'remainingTicks', 'stacks']);

    const snapshot = service.snapshot(player.playerId);
    const snapshotBuff = snapshot.buffs.buffs[0];
    assert.equal(snapshotBuff.name, 'Prototype Buff');
    assert.equal(snapshotBuff.attrs, attrs);
    assert.deepEqual(Object.keys(snapshotBuff).sort(), ['duration', 'maxStacks', 'remainingTicks', 'stacks']);
    assert.deepEqual(JSON.parse(JSON.stringify(snapshotBuff)), {
        buffId: 'buff:prototype',
        name: 'Prototype Buff',
        desc: 'template-only buff desc',
        baseDesc: 'template-only base desc',
        shortMark: '原',
        category: 'buff',
        visibility: 'public',
        remainingTicks: 10,
        duration: 10,
        stacks: 1,
        maxStacks: 3,
        sourceSkillId: 'skill:prototype',
        sourceSkillName: 'Prototype Skill',
        color: '#abcdef',
        attrs,
        attrMode: 'flat',
        stats,
        statMode: 'percent',
        qiProjection,
        presentationScale: 1.2,
    });

    service.restoreSnapshot(snapshot);
    const restoredBuff = service.snapshot(player.playerId).buffs.buffs[0];
    assert.equal(restoredBuff.name, 'Prototype Buff');
    assert.equal(restoredBuff.attrs, attrs);
    assert.deepEqual(Object.keys(restoredBuff).sort(), ['duration', 'maxStacks', 'remainingTicks', 'stacks']);
}

function testDrainNoticesReturnsQueueReferenceAndResetsQueue() {
    const service = createPlayerRuntimeService();
    const player = service.hydrateFromSnapshot('player:notice-drain-ref', 'session:notice-drain-ref', createSnapshot(null));
    service.players.set(player.playerId, player);
    player.notices.queue = [{
        id: 1,
        kind: 'info',
        text: 'notice-drain-ref',
        structured: { key: 'notice.test' },
    }];
    const originalQueue = player.notices.queue;
    const originalNotice = originalQueue[0];

    const drained = service.drainNotices(player.playerId);
    assert.equal(drained, originalQueue);
    assert.equal(drained[0], originalNotice);
    assert.notEqual(player.notices.queue, originalQueue);
    assert.deepEqual(player.notices.queue, []);
}

function testPendingStatisticRecordsReuseReadonlyReferences() {
    const service = createPlayerRuntimeService();
    const report = {
        id: 'offline-report:1',
        startedAt: 1,
        endedAt: 2,
        spiritStones: { gained: 3 },
        items: [{ itemId: 'pill.test', count: 1 }],
        progress: [{ kind: 'foundation', amount: 2 }],
        techniques: [{ techId: 'tech.test', exp: 4 }],
        professions: [{ kind: 'alchemy', exp: 5 }],
    };
    service.pendingOfflineGainReportsByPlayerId.set('player:pending-stat', [report]);

    const records = service.getPendingPlayerStatisticRecords('player:pending-stat');
    assert.equal(records, service.pendingOfflineGainReportsByPlayerId.get('player:pending-stat'));
    assert.equal(records[0], report);
    assert.equal(records[0].items, report.items);
    assert.equal(records[0].progress, report.progress);
    assert.equal(records[0].techniques, report.techniques);
    assert.equal(records[0].professions, report.professions);
}

    testGatherJobRoundtrip();
    testBuildingJobRoundtrip();
    testInvalidGatherJobFallsBackToNull();
testFreshSnapshotKeepsGatherJobEmpty();
testMissingRespawnFallsBackToStarterMap();
testInvalidRespawnPointFallsBackToMapSpawnAndMarksCheckpointDirty();
testSectIdRoundtrip();
testPendingSkillCastIsRuntimeOnly();
testReplaceInventoryItemsKeepsTemplateOnPrototype();
testReplaceEquipmentSlotsKeepsTemplateOnPrototype();
testHydrateInventoryItemsKeepTemplateOnPrototype();
testSnapshotAndRestoreKeepItemPrototypes();
testTemporaryBuffRuntimeUsesPrototypeAndMaterializesJson();
testDrainNoticesReturnsQueueReferenceAndResetsQueue();
testPendingStatisticRecordsReuseReadonlyReferences();

console.log(JSON.stringify({ ok: true, case: 'player-runtime-persistence-roundtrip' }, null, 2));
