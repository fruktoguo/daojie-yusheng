// @ts-nocheck

/**
 * 回归 smoke：验证“接任务前已达境界”的境界要求任务能正常完成。
 *
 * 背景 bug：createQuestStateFromSource 曾对未接（available）任务，只要进度达标就晋升为 ready。
 * 后果：境界已达标的玩家在 NPC envelope 视图里看到未接任务为 ready，
 *   executeNpcQuestAction / dispatchNpcInteraction 把它误当已接任务去 submit，
 *   而 dispatchAcceptNpcQuest 又因 status !== 'available' 拒绝接取，玩家既接不掉也提交不掉。
 *
 * 修复不变量：未接任务（available）一律不晋升为 ready；只有已接任务（active）达标才晋升。
 * 本 smoke 直接装配真实 WorldRuntimeQuestQueryService 验证该不变量（player.attrs.stage 使用数字枚举，与运行态一致）。
 */
const assert = require("node:assert/strict");

const { WorldRuntimeQuestQueryService } = require("../runtime/world/query/world-runtime-quest-query.service");
const { PlayerRealmStage } = require("@mud/shared");

/** 构造一个境界要求任务的内容源：要求达到 BodyTempering（炼体境）。 */
function buildRealmStageSource() {
    return {
        quest: {
            id: 'quest:realm_reached',
            line: 'main',
            objectiveType: 'realm_stage',
            targetRealmStage: PlayerRealmStage.BodyTempering,
            required: 1,
            title: '突破到炼体境',
        },
        giverNpcId: 'npc_giver',
    };
}

/** 装配真实 WorldRuntimeQuestQueryService，仅 mock 仓储与玩家运行态依赖。playerStage 为玩家当前境界枚举值。 */
function createService(playerStage) {
    const source = buildRealmStageSource();
    return new WorldRuntimeQuestQueryService(
        {
            getItemName() { return ''; },
            getTechniqueName() { return ''; },
        },
        {
            getQuestSource(questId) {
                return questId === source.quest.id ? source : undefined;
            },
        },
        {
            getPlayerOrThrow() { return { attrs: { stage: playerStage } }; },
            getPlayer() { return { attrs: { stage: playerStage } }; },
        },
    );
}

function testRealmStageAvailableStaysAvailableWhenReached() {
    // 玩家境界刚好达到目标境界：未接任务必须保持 available（不晋升为 ready）。
    const service = createService(PlayerRealmStage.BodyTempering);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available', '境界达标的未接任务不应晋升为 ready，否则会触发 submit 误判');
    assert.equal(quest.progress, quest.required, '进度应已达标');
}

function testRealmStageAvailableStaysAvailableWhenExceeded() {
    // 玩家境界已超过目标境界：未接任务同样必须保持 available。
    const service = createService(PlayerRealmStage.QiRefining);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available', '境界超过目标的未接任务也不应晋升为 ready');
    assert.equal(quest.progress, quest.required, '进度应已达标');
}

function testRealmStageActivePromotesToReadyWhenReached() {
    // 已接任务达标应正常晋升为 ready，确保不破坏正常的接取→完成流程。
    const service = createService(PlayerRealmStage.BodyTempering);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'active');
    assert.equal(quest.status, 'ready', '境界达标的已接任务应晋升为 ready');
}

function testRealmStageStaysAvailableWhenNotReached() {
    // 玩家境界未达标：未接任务保持 available 且进度未满（对照基线）。
    const service = createService(PlayerRealmStage.Mortal);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available');
    assert.ok(quest.progress < quest.required, '未达标时进度不应满');
}

function main() {
    testRealmStageAvailableStaysAvailableWhenReached();
    testRealmStageAvailableStaysAvailableWhenExceeded();
    testRealmStageActivePromotesToReadyWhenReached();
    testRealmStageStaysAvailableWhenNotReached();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-realm-stage-ready' }, null, 2));
}

main();
