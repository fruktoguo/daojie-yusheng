// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeRedeemCodeService } = require("../runtime/world/world-runtime-redeem-code.service");

function nextTick() {
    return new Promise((resolve) => setImmediate(resolve));
}

async function testAwaitsRedeemBeforeEmit() {
    const log = [];
    let resolveRedeem = () => {};
    const service = new WorldRuntimeRedeemCodeService({
        redeemCodes(playerId, codes) {
            log.push(['redeemCodes', playerId, codes]);
            return new Promise((resolve) => {
                resolveRedeem = () => {
                    log.push(['redeemCodes:resolved', playerId]);
                    resolve({ results: [{ code: String(codes?.[0] ?? ''), ok: true }] });
                };
            });
        },
    }, {
        getSocketByPlayerId(playerId) {
            log.push(['getSocketByPlayerId', playerId]);
            return { id: 'socket:redeem' };
        },
    }, {
        emitRedeemCodesResult(socket, payload) {
            log.push(['emitRedeemCodesResult', socket.id, payload.result.results.length]);
        },
    });
    const deps = {
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    };
    const pendingDispatch = service.dispatchRedeemCodes('player:1', ['CODE-1'], deps);
    await nextTick();
    assert.deepEqual(log, [
        ['redeemCodes', 'player:1', ['CODE-1']],
    ]);
    resolveRedeem();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['redeemCodes', 'player:1', ['CODE-1']],
        ['redeemCodes:resolved', 'player:1'],
        ['getSocketByPlayerId', 'player:1'],
        ['emitRedeemCodesResult', 'socket:redeem', 1],
    ]);
}

async function testWarnsOnRedeemFailure() {
    const log = [];
    const service = new WorldRuntimeRedeemCodeService({
        async redeemCodes() {
            throw new Error('redeem durable failed');
        },
    }, {
        getSocketByPlayerId() {
            log.push(['getSocketByPlayerId']);
            return { id: 'socket:redeem' };
        },
    }, {
        emitRedeemCodesResult() {
            log.push(['emitRedeemCodesResult']);
        },
    });
    const deps = {
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    };
    await service.dispatchRedeemCodes('player:2', ['CODE-2'], deps);
    assert.deepEqual(log, [
        ['warn', '处理玩家 player:2 的兑换码失败：redeem durable failed'],
        ['queuePlayerNotice', 'player:2', 'redeem durable failed', 'warn'],
    ]);
}

Promise.resolve()
    .then(() => testAwaitsRedeemBeforeEmit())
    .then(() => testWarnsOnRedeemFailure())
    .then(() => {
    console.log(JSON.stringify({
        ok: true,
        case: 'world-runtime-redeem-code',
        answers: 'WorldRuntimeRedeemCodeService 现在会等待 redeemCodes durable 结果后再发 socket result，失败时走 warn notice，不再从玩家命令入口 fire-and-forget',
        excludes: '不证明 quest submit 奖励已统一走同一条组合事务链',
    }, null, 2));
});
