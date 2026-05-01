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

function createPlayerRuntimeService() {
    return new PlayerRuntimeService({
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
    }, {
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
    });
}

function createSnapshot(gatherJob) {
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

testGatherJobRoundtrip();
testInvalidGatherJobFallsBackToNull();
testFreshSnapshotKeepsGatherJobEmpty();
testMissingRespawnFallsBackToStarterMap();
testInvalidRespawnPointFallsBackToMapSpawnAndMarksCheckpointDirty();
testSectIdRoundtrip();

console.log(JSON.stringify({ ok: true, case: 'player-runtime-persistence-roundtrip' }, null, 2));
