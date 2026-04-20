// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeContextActionQueryService } = require("../runtime/world/world-runtime-context-action-query.service");
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(player, log) {
    return new WorldRuntimeContextActionQueryService({    
    /**
 * has：判断ha是否满足条件。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成地图、标识的条件判断。
 */

        has(mapId) {
            return mapId === 'wildlands';
        },        
        /**
 * getOrThrow：读取OrThrow。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow() {
            return { name: '荒原' };
        },
    }, {    
    /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer(playerId) {
            log.push(['getPlayer', playerId]);
            return player;
        },
    }, {    
    /**
 * buildNpcQuestContextAction：构建并返回目标对象。
 * @param view 参数说明。
 * @param npc 参数说明。
 * @returns 无返回值，直接更新NPC任务上下文Action相关状态。
 */

        buildNpcQuestContextAction(view, npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            log.push(['buildNpcQuestContextAction', view.playerId, npc.npcId]);
            if (npc.npcId !== 'npc_a') {
                return null;
            }
            return {
                id: `npc_quests:${npc.npcId}`,
                name: `任务：${npc.name}`,
                type: 'quest',
                desc: `查看 ${npc.name} 相关的任务。`,
                cooldownLeft: 0,
            };
        },
    });
}
/**
 * testBuildContextActions：构建testBuild上下文Action。
 * @returns 无返回值，直接更新testBuild上下文Action相关状态。
 */


function testBuildContextActions() {
    const log = [];
    const player = {
        attrs: { numericStats: { viewRange: 7 } },
        realm: {
            breakthroughReady: true,
            breakthrough: {
                targetDisplayName: '筑基',
                blockedReason: undefined,
            },
        },
        equipment: {
            slots: [{ slot: 'weapon', item: { tags: ['alchemy_furnace', 'enhancement_hammer'] } }],
        },
        alchemyJob: null,
        enhancementJob: null,
    };
    const service = createService(player, log);
    const actions = service.buildContextActions({
        playerId: 'player:1',
        self: { x: 10, y: 20 },
        localPortals: [
            { trigger: 'manual', x: 10, y: 20, targetMapId: 'wildlands' },
            { trigger: 'touch', x: 10, y: 20, targetMapId: 'ignored' },
        ],
        localNpcs: [
            { npcId: 'npc_a', name: '阿青', x: 11, y: 20, dialogue: '  问道于心。  ', hasShop: true },
            { npcId: 'npc_b', name: '远客', x: 14, y: 20, dialogue: '远处', hasShop: true },
        ],
    });
    assert.deepEqual(actions.map((entry) => entry.id), [
        'alchemy:open',
        'battle:force_attack',
        'cultivation:toggle',
        'enhancement:open',
        'npc:npc_a',
        'npc_quests:npc_a',
        'npc_shop:npc_a',
        'portal:travel',
        'realm:breakthrough',
        'sense_qi:toggle',
        'toggle:allow_aoe_player_hit',
        'toggle:auto_battle',
        'toggle:auto_battle_stationary',
        'toggle:auto_idle_cultivation',
        'toggle:auto_retaliate',
        'toggle:auto_switch_cultivation',
        'travel:return_spawn',
    ]);
    assert.deepEqual(actions.find((entry) => entry.id === 'battle:force_attack'), {
        id: 'battle:force_attack',
        name: '强制攻击',
        type: 'battle',
        desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
        cooldownLeft: 0,
        range: 7,
        requiresTarget: true,
        targetMode: 'any',
    });
    assert.equal(actions.find((entry) => entry.id === 'portal:travel')?.name, '传送至：荒原');
    assert.equal(actions.find((entry) => entry.id === 'npc:npc_a')?.desc, '问道于心。');
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['buildNpcQuestContextAction', 'player:1', 'npc_a'],
        ['buildNpcQuestContextAction', 'player:1', 'npc_b'],
    ]);
}
/**
 * testJobFallbackWithoutWeapon：执行testJobFallbackWithoutWeapon相关逻辑。
 * @returns 无返回值，直接更新testJobFallbackWithoutWeapon相关状态。
 */


function testJobFallbackWithoutWeapon() {
    const log = [];
    const service = createService({
        attrs: { numericStats: { viewRange: 3 } },
        realm: { breakthroughReady: false },
        equipment: { slots: [] },
        alchemyJob: { state: 'running' },
        enhancementJob: { state: 'running' },
    }, log);
    const actions = service.buildContextActions({
        playerId: 'player:2',
        self: { x: 1, y: 1 },
        localPortals: [],
        localNpcs: [],
    });
    assert.ok(actions.some((entry) => entry.id === 'alchemy:open'));
    assert.ok(actions.some((entry) => entry.id === 'enhancement:open'));
}

testBuildContextActions();
testJobFallbackWithoutWeapon();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-context-actions' }, null, 2));
