"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeCraftInterruptService } = require("../runtime/world/world-runtime-craft-interrupt.service");
const { WorldRuntimeCraftTickService } = require("../runtime/world/world-runtime-craft-tick.service");

function testInterruptCraftForReason() {
    const log = [];
    const service = new WorldRuntimeCraftInterruptService({
        interruptEnhancement(player, reason) {
            log.push(['interruptEnhancement', player.playerId, reason]);
            return { ok: true, messages: [{ text: '强化中断', kind: 'info' }], panelChanged: true, groundDrops: [] };
        },
    }, {
        flushCraftMutation(playerId, result, panel) {
            log.push(['flushCraftMutation', playerId, panel, result.messages?.[0]?.text ?? null]);
        },
    }, {
        interruptAlchemyForReason(playerId, player, reason) {
            log.push(['interruptAlchemyForReason', playerId, player.playerId, reason]);
        },
    });
    service.interruptCraftForReason('player:1', { playerId: 'player:1' }, 'move', {
        queuePlayerNotice() { },
        getInstanceRuntimeOrThrow() {
            return {};
        },
        spawnGroundItem() { },
    });
    assert.deepEqual(log, [
        ['interruptAlchemyForReason', 'player:1', 'player:1', 'move'],
        ['interruptEnhancement', 'player:1', 'move'],
        ['flushCraftMutation', 'player:1', 'enhancement', '强化中断'],
    ]);
}

function testAdvanceCraftJobs() {
    const log = [];
    const players = new Map([
        ['alchemy', { playerId: 'alchemy' }],
        ['enhancement', { playerId: 'enhancement' }],
        ['both', { playerId: 'both' }],
    ]);
    const service = new WorldRuntimeCraftTickService({
        getPlayer(playerId) {
            return players.get(playerId) ?? null;
        },
    }, {
        hasActiveAlchemyJob(player) {
            return player.playerId === 'alchemy' || player.playerId === 'both';
        },
        hasActiveEnhancementJob(player) {
            return player.playerId === 'enhancement' || player.playerId === 'both';
        },
    }, {
        tickEnhancement(playerId) {
            log.push(['tickEnhancement', playerId]);
        },
    }, {
        interruptAlchemyForReason() {
            log.push(['interruptAlchemyForReason']);
        },
        tickAlchemy(playerId) {
            log.push(['tickAlchemy', playerId]);
        },
    });
    service.advanceCraftJobs(['alchemy', 'enhancement', 'both', 'missing'], {});
    assert.deepEqual(log, [
        ['tickAlchemy', 'alchemy'],
        ['tickEnhancement', 'enhancement'],
        ['tickAlchemy', 'both'],
        ['tickEnhancement', 'both'],
    ]);
}

testInterruptCraftForReason();
testAdvanceCraftJobs();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-craft' }, null, 2));
