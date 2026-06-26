/**
 * 回归 smoke：验证“接任务前已达境界等级”的任务能正常完成。
 *
 * 修复不变量：未接任务（available）一律不晋升为 ready；只有已接任务（active）达标才晋升。
 */
import assert from 'node:assert/strict';
import { WorldRuntimeQuestQueryService } from '../runtime/world/query/world-runtime-quest-query.service';

interface RealmLevelSmokePlayer {
    realm: { realmLv: number };
}

function buildRealmLevelSource() {
    return {
        quest: {
            id: 'quest:realm_reached',
            line: 'main',
            objectiveType: 'realm_stage',
            targetRealmLv: 2,
            required: 1,
            title: '突破到炼皮',
        },
        giverNpcId: 'npc_giver',
    };
}

function createService(playerRealmLv: number): WorldRuntimeQuestQueryService {
    const source = buildRealmLevelSource();
    const player: RealmLevelSmokePlayer = { realm: { realmLv: playerRealmLv } };
    return new WorldRuntimeQuestQueryService(
        {
            getItemName() { return ''; },
            getTechniqueName() { return ''; },
        } as any,
        {
            getQuestSource(questId: string) {
                return questId === source.quest.id ? source : undefined;
            },
        } as any,
        {
            getPlayerOrThrow() { return player; },
            getPlayer() { return player; },
            getRealmLevelDisplayName(realmLv: number) {
                return realmLv === 2 ? '炼皮' : undefined;
            },
        } as any,
    );
}

function testRealmLevelAvailableStaysAvailableWhenReached() {
    const service = createService(2);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available', '境界等级达标的未接任务不应晋升为 ready，否则会触发 submit 误判');
    assert.equal(quest.progress, quest.required, '进度应已达标');
    assert.equal(quest.targetRealmLv, 2, '任务运行态应保留目标小境界等级');
    assert.equal(quest.targetName, '炼皮', '任务目标名应使用境界等级 displayName');
}

function testRealmLevelAvailableStaysAvailableWhenExceeded() {
    const service = createService(19);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available', '境界等级超过目标的未接任务也不应晋升为 ready');
    assert.equal(quest.progress, quest.required, '进度应已达标');
}

function testRealmLevelActivePromotesToReadyWhenReached() {
    const service = createService(2);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'active');
    assert.equal(quest.status, 'ready', '境界等级达标的已接任务应晋升为 ready');
}

function testRealmLevelStaysAvailableWhenNotReached() {
    const service = createService(1);
    const quest = service.createQuestStateFromSource('player:1', 'quest:realm_reached', 'available');
    assert.equal(quest.status, 'available');
    assert.ok(quest.progress < quest.required, '未达标时进度不应满');
}

function main() {
    testRealmLevelAvailableStaysAvailableWhenReached();
    testRealmLevelAvailableStaysAvailableWhenExceeded();
    testRealmLevelActivePromotesToReadyWhenReached();
    testRealmLevelStaysAvailableWhenNotReached();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-realm-stage-ready' }, null, 2));
}

main();
