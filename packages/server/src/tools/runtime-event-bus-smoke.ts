/**
 * RuntimeEventBusService 冒烟测试。
 * 验证 queue 合并/覆盖/限流、drain、flush 指标和生命周期清理。
 *
 * 运行：pnpm --filter @mud/server smoke:event-bus
 */

import assert from 'node:assert/strict';

import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';
import {
  MAX_AOI_EFFECTS_PER_INSTANCE,
  MAX_COMBAT_EFFECTS_PER_INSTANCE,
  MAX_FEEDBACK_PER_PLAYER,
  MAX_NOTICES_PER_PLAYER,
} from '../runtime/event-bus/runtime-event-bus.types';

function createService(): RuntimeEventBusService {
  return new RuntimeEventBusService();
}

function testQueuePlayerNoticeAppendMode(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'hello' });
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'world' });

  const result = svc.drainPlayer('p1');
  assert.ok(result);
  assert.equal(result.notices.length, 2);
  assert.equal(result.notices[0]?.text, 'hello');
  assert.equal(result.notices[1]?.text, 'world');
  assert.ok((result.notices[1]?.id ?? 0) > (result.notices[0]?.id ?? 0));
}

function testQueuePlayerNoticeExceedsLimitDropsOldest(): void {
  const svc = createService();
  for (let i = 0; i < MAX_NOTICES_PER_PLAYER + 10; i += 1) {
    svc.queuePlayerNotice('p1', { kind: 'info', text: `msg-${i}` });
  }

  const result = svc.drainPlayer('p1');
  assert.ok(result);
  assert.equal(result.notices.length, MAX_NOTICES_PER_PLAYER);
  assert.equal(result.notices[0]?.text, 'msg-10');
}

function testQueuePlayerNoticeDedupStructuredPayload(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'old', structured: { key: 'notice.test', vars: { item: 'a' } } });
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'new', structured: { key: 'notice.test', vars: { item: 'a' } } });

  const result = svc.drainPlayer('p1');
  assert.ok(result);
  assert.equal(result.notices.length, 1);
  assert.equal(result.notices[0]?.text, 'new');
}

function testQueuePlayerNoticeLimitDropsLowerPriority(): void {
  const svc = createService();
  for (let i = 0; i < MAX_NOTICES_PER_PLAYER; i += 1) {
    svc.queuePlayerNotice('p1', { kind: 'info', text: `info-${i}` });
  }
  svc.queuePlayerNotice('p1', { kind: 'warn', text: 'warn-kept' });

  const result = svc.drainPlayer('p1');
  assert.ok(result);
  assert.equal(result.notices.length, MAX_NOTICES_PER_PLAYER);
  assert.equal(result.notices.some((notice) => notice.text === 'warn-kept'), true);
  assert.equal(result.notices.some((notice) => notice.text === 'info-0'), false);
}

function testQueuePlayerPanelPatchMergeMode(): void {
  const svc = createService();
  svc.queuePlayerPanelPatch('p1', 'inventory', { added: { item1: { qty: 1 } } });
  svc.queuePlayerPanelPatch('p1', 'inventory', { added: { item2: { qty: 2 } }, removed: ['item3'] });

  const result = svc.drainPlayer('p1');
  assert.ok(result?.panelPatches);
  const patch = result.panelPatches.get('inventory');
  assert.ok(patch);
  assert.deepEqual(patch.added, { item1: { qty: 1 }, item2: { qty: 2 } });
  assert.deepEqual(patch.removed, ['item3']);
}

function testQueueActiveJobProgressOverwriteMode(): void {
  const svc = createService();
  svc.queueActiveJobProgress('p1', { jobId: 'j1', jobType: 'craft', progress: 0.3 });
  svc.queueActiveJobProgress('p1', { jobId: 'j1', jobType: 'craft', progress: 0.7 });

  const result = svc.drainPlayer('p1');
  assert.ok(result?.activeJobs);
  assert.equal(result.activeJobs.length, 1);
  assert.equal(result.activeJobs[0]?.progress, 0.7);
}

function testQueueTechniquePanelRefreshDedup(): void {
  const svc = createService();
  svc.queueTechniquePanelRefresh('p1', 'active');
  svc.queueTechniquePanelRefresh('p1', 'active');
  svc.queueTechniquePanelRefresh('p1', 'formation');

  const result = svc.drainPlayer('p1');
  assert.deepEqual(result?.techniqueDirty, ['active', 'formation']);
}

function testQueuePlayerStateDeltaMergeMode(): void {
  const svc = createService();
  svc.queuePlayerStateDelta('p1', { hp: 100, mp: 50 });
  svc.queuePlayerStateDelta('p1', { hp: 90, exp: 200 });

  const result = svc.drainPlayer('p1');
  assert.ok(result?.stateDelta);
  assert.equal(result.stateDelta.hp, 90);
  assert.equal(result.stateDelta.mp, 50);
  assert.equal(result.stateDelta.exp, 200);
}

function testQueuePlayerStateDeltaBuffsMerge(): void {
  const svc = createService();
  svc.queuePlayerStateDelta('p1', { buffs: { added: ['buff1'] } });
  svc.queuePlayerStateDelta('p1', { buffs: { added: ['buff2'], removed: ['buff3'] } });

  const result = svc.drainPlayer('p1');
  assert.ok(result?.stateDelta?.buffs);
  assert.deepEqual(result.stateDelta.buffs.added, ['buff1', 'buff2']);
  assert.deepEqual(result.stateDelta.buffs.removed, ['buff3']);
}

function testQueuePlayerFeedbackAppendMode(): void {
  const svc = createService();
  svc.queuePlayerFeedback('p1', { type: 'confirm', action: 'move' });
  svc.queuePlayerFeedback('p1', { type: 'reject', action: 'attack', message: 'cooldown' });

  const result = svc.drainPlayer('p1');
  assert.ok(result?.feedback);
  assert.equal(result.feedback.length, 2);
}

function testQueuePlayerFeedbackExceedsLimit(): void {
  const svc = createService();
  for (let i = 0; i < MAX_FEEDBACK_PER_PLAYER + 5; i += 1) {
    svc.queuePlayerFeedback('p1', { type: 'confirm', action: `act-${i}` });
  }

  const result = svc.drainPlayer('p1');
  assert.ok(result?.feedback);
  assert.equal(result.feedback.length, MAX_FEEDBACK_PER_PLAYER);
  assert.equal(result.feedback[0]?.action, 'act-5');
}

function testQueueGmStatePushDedup(): void {
  const svc = createService();
  svc.queueGmStatePush('p1');
  svc.queueGmStatePush('p1');
  svc.queueGmStatePush('p1');

  const result = svc.drainPlayer('p1');
  assert.equal(result?.gmStatePush, true);
}

function testQueueCombatEffectAppendMode(): void {
  const svc = createService();
  svc.queueCombatEffect('inst1', { type: 'float', x: 1, y: 2, text: 'hit' });
  svc.queueCombatPresentation('inst1', { type: 'attack', fromX: 0, fromY: 0, toX: 1, toY: 1 });

  const effects = svc.getCombatEffects('inst1');
  assert.equal(effects.length, 2);
}

function testQueueCombatEffectExceedsLimit(): void {
  const svc = createService();
  for (let i = 0; i < MAX_COMBAT_EFFECTS_PER_INSTANCE + 20; i += 1) {
    svc.queueCombatEffect('inst1', { type: 'float', x: i, y: 0, text: `e${i}` });
  }

  const effects = svc.getCombatEffects('inst1');
  assert.equal(effects.length, MAX_COMBAT_EFFECTS_PER_INSTANCE);
  assert.equal(effects[0]?.type, 'float');
  if (effects[0]?.type === 'float') {
    assert.equal(effects[0].text, 'e20');
  }
}

function testQueueAoiPresentationMergesEntityType(): void {
  const svc = createService();
  svc.queueAoiPresentation('inst1', { type: 'statusChange', entityId: 'm1', entityType: 'monster', x: 1, y: 1, data: { hp: 50 } });
  svc.queueAoiPresentation('inst1', { type: 'statusChange', entityId: 'm1', entityType: 'monster', x: 1, y: 1, data: { hp: 10 } });
  svc.queueAoiPresentation('inst1', { type: 'emote', entityId: 'm1', entityType: 'monster', x: 1, y: 1 });

  const result = svc.drainInstance('inst1');
  assert.ok(result);
  assert.equal(result.aoiEffects.length, 2);
  assert.deepEqual(result.aoiEffects[0]?.data, { hp: 10 });
}

function testQueueAoiPresentationExceedsLimit(): void {
  const svc = createService();
  for (let i = 0; i < MAX_AOI_EFFECTS_PER_INSTANCE + 3; i += 1) {
    svc.queueAoiPresentation('inst1', { type: 'appear', entityId: `e${i}`, entityType: 'monster', x: i, y: 0 });
  }

  const result = svc.drainInstance('inst1');
  assert.ok(result);
  assert.equal(result.aoiEffects.length, MAX_AOI_EFFECTS_PER_INSTANCE);
  assert.equal(result.aoiEffects[0]?.entityId, 'e3');
}

function testFlushTickClearsInstanceQueuesAndReportsTotals(): void {
  const svc = createService();
  svc.queueCombatEffect('inst1', { type: 'float', x: 0, y: 0, text: 'a' });
  svc.queueAoiPresentation('inst1', { type: 'appear', entityId: 'm1', entityType: 'monster', x: 0, y: 0 });
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'notice' });
  svc.queueActiveJobProgress('p1', { jobId: 'j1', jobType: 'alchemy', progress: 0.5 });
  svc.queueTechniquePanelRefresh('p1', 'active');
  svc.queuePlayerStateDelta('p1', { hp: 1 });

  const result = svc.flushTick();
  assert.equal(result.playerCount, 1);
  assert.equal(result.instanceCount, 1);
  assert.equal(result.totalCombatEffects, 1);
  assert.equal(result.totalAoiEffects, 1);
  assert.equal(result.totalNotices, 1);
  assert.equal(result.totalActiveJobs, 1);
  assert.equal(result.totalTechniqueDirty, 1);
  assert.equal(result.totalStateDeltas, 1);
  assert.equal(svc.getCombatEffects('inst1').length, 0);
  assert.equal(svc.getAoiPresentations('inst1').length, 0);
  assert.equal(svc.getPlayerQueueCount(), 0);
  assert.equal(svc.getInstanceQueueCount(), 0);
}

function testDrainPlayerClearsQueue(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'x' });

  const first = svc.drainPlayer('p1');
  assert.ok(first);
  assert.equal(first.notices.length, 1);
  assert.equal(svc.drainPlayer('p1'), null);
  assert.equal(svc.getPlayerQueueCount(), 0);
}

function testDrainPlayerEventBusPayloadMatchesEnvelopeShape(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'notice' });
  svc.queuePlayerPanelPatch('p1', 'inventory', { updated: { slot1: { itemId: 'herb', count: 2 } } });
  svc.queueActiveJobProgress('p1', { jobId: 'job:1', jobType: 'alchemy', progress: 0.6 });
  svc.queueTechniquePanelRefresh('p1', 'active');
  svc.queuePlayerStateDelta('p1', { hp: 88 });
  svc.queuePlayerFeedback('p1', { type: 'confirm', action: 'alchemy' });
  svc.queueGmStatePush('p1');

  const result = svc.drainPlayerEventBusPayload('p1');
  assert.equal(result.gmStatePush, true);
  assert.ok(result.payload);
  assert.equal(result.payload.notices?.[0]?.text, 'notice');
  assert.equal(result.payload.panelPatches?.inventory?.updated?.slot1 && typeof result.payload.panelPatches.inventory.updated.slot1, 'object');
  assert.equal(result.payload.jobProgress?.['job:1']?.progress, 0.6);
  assert.deepEqual(result.payload.techniqueDirty, ['active']);
  assert.equal(result.payload.stateDelta?.hp, 88);
  assert.equal(result.payload.feedbacks?.[0]?.action, 'alchemy');
  assert.equal(svc.drainPlayer('p1'), null);
  assert.equal(svc.getPlayerQueueCount(), 0);
}

function testFlushPlayerReturnsSummaryAndClearsQueue(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'x' });
  svc.queueActiveJobProgress('p1', { jobId: 'j1', jobType: 'craft', progress: 0.1 });

  const result = svc.flushPlayer('p1');
  assert.equal(result.playerCount, 1);
  assert.equal(result.totalNotices, 1);
  assert.equal(result.totalActiveJobs, 1);
  assert.equal(svc.drainPlayer('p1'), null);
  assert.equal(svc.getPlayerQueueCount(), 0);
}

function testFlushInstanceReturnsSummaryAndClearsQueue(): void {
  const svc = createService();
  svc.queueCombatEffect('inst1', { type: 'float', x: 0, y: 0, text: 'x' });
  svc.queueAoiPresentation('inst1', { type: 'appear', entityId: 'm1', entityType: 'monster', x: 0, y: 0 });

  const result = svc.flushInstance('inst1');
  assert.equal(result.instanceCount, 1);
  assert.equal(result.totalCombatEffects, 1);
  assert.equal(result.totalAoiEffects, 1);
  assert.equal(svc.drainInstance('inst1'), null);
  assert.equal(svc.getInstanceQueueCount(), 0);
}

function testDrainPlayerNonExistentReturnsNull(): void {
  const svc = createService();
  assert.equal(svc.drainPlayer('nonexistent'), null);
}

function testDiscardPlayerRemovesQueue(): void {
  const svc = createService();
  svc.queuePlayerNotice('p1', { kind: 'system', text: 'x' });
  svc.discardPlayer('p1');

  assert.equal(svc.drainPlayer('p1'), null);
  assert.equal(svc.getPlayerQueueCount(), 0);
}

function testDiscardInstanceRemovesQueue(): void {
  const svc = createService();
  svc.queueCombatEffect('inst1', { type: 'float', x: 0, y: 0, text: 'a' });
  svc.queueAoiPresentation('inst1', { type: 'appear', entityId: 'm1', entityType: 'monster', x: 0, y: 0 });
  svc.discardInstance('inst1');

  assert.equal(svc.getCombatEffects('inst1').length, 0);
  assert.equal(svc.getAoiPresentations('inst1').length, 0);
  assert.equal(svc.getInstanceQueueCount(), 0);
}

function testGetLastFlushResult(): void {
  const svc = createService();
  assert.equal(svc.getLastFlushResult(), null);

  svc.queuePlayerNotice('p1', { kind: 'system', text: 'x' });
  svc.flushTick();

  const result = svc.getLastFlushResult();
  assert.ok(result);
  assert.equal(result.totalNotices, 1);
}

async function main(): Promise<void> {
  const tests: Array<() => void> = [
    testQueuePlayerNoticeAppendMode,
    testQueuePlayerNoticeExceedsLimitDropsOldest,
    testQueuePlayerNoticeDedupStructuredPayload,
    testQueuePlayerNoticeLimitDropsLowerPriority,
    testQueuePlayerPanelPatchMergeMode,
    testQueueActiveJobProgressOverwriteMode,
    testQueueTechniquePanelRefreshDedup,
    testQueuePlayerStateDeltaMergeMode,
    testQueuePlayerStateDeltaBuffsMerge,
    testQueuePlayerFeedbackAppendMode,
    testQueuePlayerFeedbackExceedsLimit,
    testQueueGmStatePushDedup,
    testQueueCombatEffectAppendMode,
    testQueueCombatEffectExceedsLimit,
    testQueueAoiPresentationMergesEntityType,
    testQueueAoiPresentationExceedsLimit,
    testFlushTickClearsInstanceQueuesAndReportsTotals,
    testDrainPlayerClearsQueue,
    testDrainPlayerEventBusPayloadMatchesEnvelopeShape,
    testFlushPlayerReturnsSummaryAndClearsQueue,
    testFlushInstanceReturnsSummaryAndClearsQueue,
    testDrainPlayerNonExistentReturnsNull,
    testDiscardPlayerRemovesQueue,
    testDiscardInstanceRemovesQueue,
    testGetLastFlushResult,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed += 1;
      console.log(`  ok ${test.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  fail ${test.name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nRuntimeEventBus smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
