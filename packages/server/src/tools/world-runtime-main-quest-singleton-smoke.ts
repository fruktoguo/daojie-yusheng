import assert from 'node:assert/strict';
import { WorldRuntimeNpcQuestWriteService } from '../runtime/world/world-runtime-npc-quest-write.service';
import { WorldRuntimeQuestStateService } from '../runtime/world/world-runtime-quest-state.service';
import { WorldRuntimeQuestQueryService } from '../runtime/world/query/world-runtime-quest-query.service';

type AnyRecord = Record<string, any>;

function createPlayerWithActiveMain(): AnyRecord {
    return {
        playerId: 'player:1',
        templateId: 'map_a',
        quests: {
            quests: [{ id: 'quest:current-main', line: 'main', status: 'active', progress: 0, required: 1 }],
        },
    };
}

function createPlayerBeforeChapterTwo(): AnyRecord {
    return {
        playerId: 'player:1',
        templateId: 'map_a',
        quests: {
            quests: [{ id: 'quest:chapter-one', line: 'main', status: 'active', progress: 0, required: 1 }],
        },
    };
}

function createPlayerAfterChapterOneWithNoActiveMain(): AnyRecord {
    return {
        playerId: 'player:1',
        templateId: 'map_a',
        quests: {
            quests: [{ id: 'quest:chapter-one', line: 'main', status: 'completed', progress: 1, required: 1 }],
        },
    };
}

function createQuestQueryService(player: AnyRecord): WorldRuntimeQuestQueryService {
    const questSources = new Map<string, AnyRecord>([
        ['quest:blocked-main', {
            giverNpcId: 'npc_main',
            quest: { id: 'quest:blocked-main', line: 'main' },
        }],
        ['quest:chapter-one', {
            giverNpcId: 'npc_previous',
            quest: { id: 'quest:chapter-one', line: 'main', nextQuestId: 'quest:chapter-two' },
        }],
        ['quest:chapter-two', {
            giverNpcId: 'npc_chapter_two',
            quest: { id: 'quest:chapter-two', line: 'main' },
        }],
        ['quest:side', {
            giverNpcId: 'npc_side',
            quest: { id: 'quest:side', line: 'side' },
        }],
    ]);
    return new WorldRuntimeQuestQueryService({
        getItemName() {
            return '';
        },
        getTechniqueName() {
            return '';
        },
        createItem(itemId: string, count: number) {
            return { itemId, count };
        },
    } as any, {
        questSourceById: questSources,
        getQuestSource(questId: string) {
            return questSources.get(questId) ?? null;
        },
        getNpcLocation() {
            return null;
        },
        has() {
            return false;
        },
        getOrThrow() {
            return { name: 'ignored' };
        },
    } as any, {
        getPlayerOrThrow() {
            return player;
        },
    } as any);
}

function testNpcQuestQueryBlocksNextChapterUntilPreviousCompleted() {
    const player = createPlayerBeforeChapterTwo();
    const service = createQuestQueryService(player);
    const chapterTwoNpc = {
        npcId: 'npc_chapter_two',
        name: '第二章入口',
        quests: [{ id: 'quest:chapter-two', line: 'main' }],
    };
    assert.deepEqual(service.createNpcQuestsEnvelope('player:1', chapterTwoNpc), {
        npcId: 'npc_chapter_two',
        npcName: '第二章入口',
        quests: [],
    });
    assert.equal(service.resolveAvailableNpcQuestMarkerForPlayer(player, chapterTwoNpc), undefined);
}

function testNpcQuestQueryUnlocksNextChapterAfterPreviousCompleted() {
    const player = createPlayerAfterChapterOneWithNoActiveMain();
    const service = createQuestQueryService(player);
    const chapterTwoNpc = {
        npcId: 'npc_chapter_two',
        name: '第二章入口',
        quests: [{ id: 'quest:chapter-two', line: 'main' }],
    };
    const envelope = service.createNpcQuestsEnvelope('player:1', chapterTwoNpc);
    assert.deepEqual(envelope.quests.map((quest: AnyRecord) => ({ id: quest.id, status: quest.status, line: quest.line })), [
        { id: 'quest:chapter-two', status: 'available', line: 'main' },
    ]);
    assert.deepEqual(service.resolveAvailableNpcQuestMarkerForPlayer(player, chapterTwoNpc), {
        line: 'main',
        state: 'available',
    });
}

function testNpcQuestQueryHidesSecondMainQuest() {
    const player = createPlayerWithActiveMain();
    const service = createQuestQueryService(player);
    const mainNpc = {
        npcId: 'npc_main',
        name: '主线人',
        quests: [{ id: 'quest:blocked-main', line: 'main' }],
    };
    const sideNpc = {
        npcId: 'npc_side',
        name: '支线人',
        quests: [{ id: 'quest:side', line: 'side' }],
    };
    assert.deepEqual(service.createNpcQuestsEnvelope('player:1', mainNpc), {
        npcId: 'npc_main',
        npcName: '主线人',
        quests: [],
    });
    assert.equal(service.resolveAvailableNpcQuestMarkerForPlayer(player, mainNpc), undefined);
    assert.deepEqual(service.resolveAvailableNpcQuestMarkerForPlayer(player, sideNpc), {
        line: 'side',
        state: 'available',
    });
}

function testNpcQuestAcceptRejectsSecondMainQuest() {
    const player = createPlayerWithActiveMain();
    const service = new WorldRuntimeNpcQuestWriteService({
        getPlayerOrThrow() {
            return player;
        },
        markQuestStateDirty() {
            throw new Error('blocked main quest should not dirty quest state');
        },
    } as any);
    assert.throws(() => service.dispatchAcceptNpcQuest('player:1', 'npc_main', 'quest:blocked-main', {
        resolveAdjacentNpc() {
            return { npcId: 'npc_main', name: '主线人' };
        },
        createNpcQuestsEnvelope() {
            return {
                quests: [{
                    id: 'quest:blocked-main',
                    title: '第二条主线',
                    line: 'main',
                    status: 'available',
                    progress: 0,
                    required: 1,
                }],
            };
        },
        refreshQuestStates() {
            throw new Error('blocked main quest should not refresh after write');
        },
        queuePlayerNotice() {
            throw new Error('blocked main quest should not queue notice');
        },
    }), /当前已有进行中的主线任务/);
    assert.deepEqual(player.quests.quests.map((quest: AnyRecord) => quest.id), ['quest:current-main']);
}

function testNpcQuestAcceptRejectsLockedNextChapter() {
    const player = createPlayerBeforeChapterTwo();
    const queryService = createQuestQueryService(player);
    const service = new WorldRuntimeNpcQuestWriteService({
        getPlayerOrThrow() {
            return player;
        },
        markQuestStateDirty() {
            throw new Error('locked next chapter should not dirty quest state');
        },
    } as any);
    assert.throws(() => service.dispatchAcceptNpcQuest('player:1', 'npc_chapter_two', 'quest:chapter-two', {
        worldRuntimeQuestQueryService: queryService,
        resolveAdjacentNpc() {
            return { npcId: 'npc_chapter_two', name: '第二章入口' };
        },
        createNpcQuestsEnvelope() {
            return {
                quests: [{
                    id: 'quest:chapter-two',
                    title: '第二章入口',
                    desc: '',
                    line: 'main',
                    status: 'available',
                    progress: 0,
                    required: 1,
                }],
            };
        },
        refreshQuestStates() {
            throw new Error('locked next chapter should not refresh after write');
        },
        queuePlayerNotice() {
            throw new Error('locked next chapter should not queue notice');
        },
    }), /前置任务尚未完成/);
    assert.deepEqual(player.quests.quests.map((quest: AnyRecord) => quest.id), ['quest:chapter-one']);
}

function testTryAcceptNextQuestRejectsSecondMainQuest() {
    const player = createPlayerWithActiveMain();
    const dirtyLog: string[] = [];
    const service = new WorldRuntimeQuestStateService({
        getPlayer() {
            return player;
        },
        getPlayerOrThrow() {
            return player;
        },
        markQuestStateDirty(playerId: string) {
            dirtyLog.push(playerId);
        },
    } as any, {
        isQuestUnlockedForPlayer() {
            return true;
        },
        createQuestStateFromSource(_playerId: string, questId: string, status = 'active') {
            return {
                id: questId,
                title: '第二条主线',
                line: 'main',
                status,
                progress: 0,
                required: 1,
                rewardItemIds: [],
                rewards: [],
            };
        },
    } as any, null);
    assert.equal(service.tryAcceptNextQuest('player:1', 'quest:blocked-main'), null);
    assert.deepEqual(player.quests.quests.map((quest: AnyRecord) => quest.id), ['quest:current-main']);
    assert.deepEqual(dirtyLog, []);
}

function testTryAcceptNextQuestRejectsLockedNextChapter() {
    const player = createPlayerBeforeChapterTwo();
    const dirtyLog: string[] = [];
    const service = new WorldRuntimeQuestStateService({
        getPlayer() {
            return player;
        },
        getPlayerOrThrow() {
            return player;
        },
        markQuestStateDirty(playerId: string) {
            dirtyLog.push(playerId);
        },
    } as any, {
        isQuestUnlockedForPlayer() {
            return false;
        },
        createQuestStateFromSource() {
            throw new Error('locked next chapter should not materialize');
        },
    } as any, null);
    assert.equal(service.tryAcceptNextQuest('player:1', 'quest:chapter-two'), null);
    assert.deepEqual(player.quests.quests.map((quest: AnyRecord) => quest.id), ['quest:chapter-one']);
    assert.deepEqual(dirtyLog, []);
}

testNpcQuestQueryBlocksNextChapterUntilPreviousCompleted();
testNpcQuestQueryUnlocksNextChapterAfterPreviousCompleted();
testNpcQuestQueryHidesSecondMainQuest();
testNpcQuestAcceptRejectsLockedNextChapter();
testNpcQuestAcceptRejectsSecondMainQuest();
testTryAcceptNextQuestRejectsSecondMainQuest();
testTryAcceptNextQuestRejectsLockedNextChapter();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-main-quest-singleton' }, null, 2));
