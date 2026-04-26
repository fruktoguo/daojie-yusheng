// @ts-nocheck

const assert = require("node:assert/strict");

const { createNumericStats, createNumericRatioDivisors } = require("@mud/shared");
const { WorldSyncPlayerStateService } = require("../network/world-sync-player-state.service");
/**
 * createPlayer：构建并返回目标对象。
 * @returns 无返回值，直接更新玩家相关状态。
 */


function createPlayer() {
    return {
        playerId: 'player:1',
        name: '甲',
        displayName: '甲乙',
        x: 3,
        y: 4,
        facing: 'south',
        hp: 12,
        maxHp: 20,
        qi: 8,
        foundation: 2,
        combatExp: 9,
        boneAgeBaseYears: 18,
        lifeElapsedTicks: 30,
        lifespanYears: 60,
        attrs: {
            stage: '炼气',
            baseAttrs: { constitution: 1, spirit: 2, perception: 3, talent: 4, strength: 5, meridians: 6 },
            finalAttrs: { constitution: 2, spirit: 3, perception: 4, talent: 5, strength: 6, meridians: 7 },
            numericStats: { ...createNumericStats(), viewRange: 2 },
            ratioDivisors: createNumericRatioDivisors(),
        },
        inventory: {
            capacity: 8,
            items: [{ itemId: 'potion', name: '药', type: 'consumable', count: 2, desc: 'desc', allowBatchUse: true }],
        },
        equipment: {
            slots: [{ slot: 'weapon', item: { itemId: 'sword', name: '剑', type: 'weapon', count: 1, desc: 'weapon' } }],
        },
        techniques: {
            techniques: [{ techId: 'tech.a', level: 1, exp: 0, expToNext: 10, realmLv: 1, realm: 'entry', skillsEnabled: true }],
            cultivatingTechId: 'tech.a',
        },
        bodyTraining: { level: 1, exp: 2, expToNext: 3 },
        alchemySkill: { level: 1, exp: 2, expToNext: 3 },
        gatherSkill: { level: 2, exp: 3, expToNext: 4 },
        enhancementSkill: { level: 3, exp: 4, expToNext: 5 },
        enhancementSkillLevel: 3,
        actions: { actions: [{ id: 'npc_quests:npc.a', name: '任务', type: 'interact', desc: 'desc' }] },
        quests: { quests: [{ questId: 'quest.a', rewardItemIds: ['potion'], rewards: [{ kind: 'item', itemId: 'potion', count: 1 }] }] },
        realm: {
            stage: '炼气',
            realmLv: 1,
            displayName: '炼气',
            name: '炼气',
            shortName: '炼气',
            path: 'qi',
            narrative: 'n',
            review: 'r',
            lifespanYears: 60,
            progress: 10,
            progressToNext: 100,
            breakthroughReady: false,
            nextStage: '筑基',
            minTechniqueLevel: 1,
            minTechniqueRealm: 1,
            breakthroughItems: [],
            heavenGate: null,
        },
        heavenGate: null,
        spiritualRoots: null,
        combat: {
            senseQiActive: false,
            autoRetaliate: true,
            autoBattleStationary: false,
            allowAoePlayerHit: false,
            autoIdleCultivation: false,
            autoSwitchCultivation: true,
            cultivationActive: true,
            autoBattle: false,
            autoBattleSkills: [],
            autoUsePills: [],
            combatTargetingRules: null,
            autoBattleTargetingMode: 'manual',
            combatTargetId: null,
            combatTargetLocked: false,
        },
        buffs: { buffs: [] },
        runtimeBonuses: [],
    };
}
/**
 * testPlayerState：执行test玩家状态相关逻辑。
 * @returns 无返回值，直接更新test玩家状态相关状态。
 */


function testPlayerState() {
    const service = new WorldSyncPlayerStateService();
    const state = service.buildPlayerSyncState(createPlayer(), { instance: { templateId: 'map.a' } }, ['map.a', 'map.b']);
    assert.equal(state.id, 'player:1');
    assert.equal(state.inventory.items[0].itemId, 'potion');
    assert.equal(state.equipment.weapon.itemId, 'sword');
    assert.equal(state.actions[0].id, 'npc:npc.a');
    assert.deepEqual(state.unlockedMinimapIds, ['map.a', 'map.b']);
}

testPlayerState();

console.log(JSON.stringify({ ok: true, case: 'world-sync-player-state' }, null, 2));
