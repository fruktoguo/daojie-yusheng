import assert from 'node:assert/strict';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await testIdlePlayersSkipCraftPipeline();
  await testCraftBatchKeepsPerPlayerIsolation();
  await testStatisticDiffOnlyRunsForRealMutation();

  console.log(JSON.stringify({
    ok: true,
    cases: ['idle_players_skip_craft_pipeline', 'active_and_queued_players_are_selected', 'batched_craft_tick_keeps_player_isolation', 'unchanged_tick_skips_statistics_diff', 'statistic_signal_records_diff', 'async_tick_records_after_resolution'],
  }, null, 2));
}

async function testIdlePlayersSkipCraftPipeline(): Promise<void> {
  const players = new Map<string, Record<string, unknown>>([
    ['player:craft-idle', { playerId: 'player:craft-idle', techniqueActivityQueue: [] }],
    ['player:craft-active', { playerId: 'player:craft-active', miningJob: { remainingTicks: 3 } }],
    ['player:craft-queued', { playerId: 'player:craft-queued', techniqueActivityQueue: [{ queueId: 'queue:1' }] }],
  ]);
  let activeKindReads = 0;
  let contextBuilds = 0;
  let compatibilityChecks = 0;
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
    } as never,
    {
      ensureAlchemyLikeActiveJobResourceCompatibilityMutation: () => {
        compatibilityChecks += 1;
        return { ok: true };
      },
      listActiveTechniqueActivityKinds: () => {
        activeKindReads += 1;
        return [];
      },
      hasAnyActiveTechniqueActivity: () => false,
      buildPipelineContext: () => {
        contextBuilds += 1;
        return {};
      },
    } as never,
    { flushCraftMutation() {} } as never,
  );

  assert.deepEqual(
    service.listTickablePlayerIds([...players.keys(), 'player:missing']),
    ['player:craft-active', 'player:craft-queued'],
  );
  await service.advanceCraftJobs(['player:craft-idle'], {});
  assert.equal(activeKindReads, 0);
  assert.equal(contextBuilds, 0);
  assert.equal(compatibilityChecks, 0);
}

async function testStatisticDiffOnlyRunsForRealMutation(): Promise<void> {
  const player = { playerId: 'player:technique-statistics-hotpath' };
  let captureCount = 0;
  let recordCount = 0;
  let nextResult: unknown = buildResult();
  const service: any = Object.create(CraftPanelRuntimeService.prototype);
  service.pipeline = {
    hasStrategy: () => true,
    tick: () => nextResult,
  };
  service.playerRuntimeService = {
    captureOfflineGainBeforeTick: () => ({ snapshot: ++captureCount }),
    recordAssetStatisticMutation: () => {
      recordCount += 1;
    },
  };

  const unchanged = service.tickTechniqueActivity(player, 'mining');
  assert.equal((unchanged as { ok?: boolean }).ok, true);
  assert.equal(recordCount, 0, '纯 active_job 进度不应触发全量统计差分');

  nextResult = buildResult({ attrChanged: true });
  service.tickTechniqueActivity(player, 'transmission');
  assert.equal(recordCount, 1, '职业经验变化必须进入统计差分');

  nextResult = Promise.resolve(buildResult({ inventoryChanged: true }));
  await service.tickTechniqueActivity(player, 'gather');
  assert.equal(recordCount, 2, '异步技艺结算完成后必须补记统计差分');
  assert.equal(captureCount, 5);

}

async function testCraftBatchKeepsPerPlayerIsolation(): Promise<void> {
  const players = new Map([
    ['player:craft-fail', { playerId: 'player:craft-fail', miningJob: { remainingTicks: 1 } }],
    ['player:craft-ok', { playerId: 'player:craft-ok', miningJob: { remainingTicks: 1 } }],
  ]);
  const ticked: string[] = [];
  const flushed: string[] = [];
  const notices: string[] = [];
  const warnings: string[] = [];
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
      runtimeEventBusService: null,
    } as never,
    {
      listActiveTechniqueActivityKinds: () => ['mining'],
      hasAnyActiveTechniqueActivity: () => true,
      tickTechniqueActivity: (player: { playerId: string }) => {
        ticked.push(player.playerId);
        if (player.playerId === 'player:craft-fail') {
          throw new Error('expected craft failure');
        }
        return buildResult({ panelChanged: true });
      },
      buildPipelineContext: () => ({}),
    } as never,
    {
      flushCraftMutation: (playerId: string) => flushed.push(playerId),
    } as never,
  );
  (service as any).logger = { error() {}, warn(message: string) { warnings.push(message); } };

  await service.advanceCraftJobs([...players.keys()], {
    queuePlayerNotice: (playerId: string) => {
      notices.push(playerId);
      return Promise.reject(new Error('expected notice failure'));
    },
  });
  await Promise.resolve();

  assert.deepEqual(ticked, ['player:craft-fail', 'player:craft-ok']);
  assert.deepEqual(flushed, ['player:craft-ok']);
  assert.deepEqual(notices, ['player:craft-fail']);
  assert.equal(warnings.length, 1, '异步通知失败必须被捕获，不能形成 unhandledRejection');
}

function buildResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    panelChanged: false,
    inventoryChanged: false,
    equipmentChanged: false,
    attrChanged: false,
    craftRealmExpGain: 0,
    messages: [],
    groundDrops: [],
    ...overrides,
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
