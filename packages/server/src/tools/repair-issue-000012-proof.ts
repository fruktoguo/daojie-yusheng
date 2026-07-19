import assert from 'node:assert/strict';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { GatherStrategy } from '../runtime/craft/pipeline/strategies/gather.strategy';
import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeLootContainerService } from '../runtime/world/world-runtime-loot-container.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000012:PASS';
const MAP_ID = 'darksoil_abyss';
const INSTANCE_ID = 'virtual:darksoil_abyss:repair-proof-issue-000012';
const PLAYER_ID = 'player:repair-proof-issue-000012';

function createRuntimeServices() {
  const contentRepository = new ContentTemplateRepository();
  contentRepository.onModuleInit();

  const mapRepository = new MapTemplateRepository();
  mapRepository.onModuleInit();

  const attributesService = new PlayerAttributesService();
  const progressionService = new PlayerProgressionService(contentRepository, attributesService);
  progressionService.onModuleInit();
  const playerRuntimeService = new PlayerRuntimeService(
    contentRepository,
    mapRepository,
    attributesService,
    progressionService,
  );

  return { contentRepository, mapRepository, playerRuntimeService, progressionService };
}

async function main(): Promise<void> {
  const {
    contentRepository,
    mapRepository,
    playerRuntimeService,
    progressionService,
  } = createRuntimeServices();
  const template = mapRepository.getOrThrow(MAP_ID);
  const container = template.containers.find((entry) => (
    entry.name === '混元脉石' && entry.x === 28 && entry.y === 25
  ));
  assert.ok(container, '玄壤深渊中央混元脉石必须由生产地图加载链生成');
  assert.equal(container.variant, 'herb');

  const instance = new MapInstanceRuntime({
    instanceId: INSTANCE_ID,
    template,
    monsterSpawns: [],
    kind: 'virtual',
    persistent: true,
    createdAt: Date.now(),
    displayName: '玄壤深渊虚境修复验证',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'repair-proof',
    defaultEntry: true,
    supportsPvp: true,
    canDamageTile: true,
  });
  const placement = instance.findNearestOpenTile(container.x, container.y);
  assert.ok(placement, '中央混元脉石附近必须存在可采集站位');
  assert.ok(
    Math.max(Math.abs(placement.x - container.x), Math.abs(placement.y - container.y)) <= 1,
    '验证玩家必须位于中央混元脉石一格范围内',
  );

  const player = playerRuntimeService.createFreshPlayer(PLAYER_ID, 'session:repair-proof-issue-000012');
  player.instanceId = INSTANCE_ID;
  player.templateId = MAP_ID;
  player.x = placement.x;
  player.y = placement.y;
  player.gatherSkill.level = 20;
  playerRuntimeService.players.set(PLAYER_ID, player);
  playerRuntimeService.openLootWindow(PLAYER_ID, container.x, container.y);
  const attached = instance.connectPlayer({
    playerId: PLAYER_ID,
    sessionId: player.sessionId,
    preferredX: placement.x,
    preferredY: placement.y,
  });
  player.x = attached.x;
  player.y = attached.y;

  const lootService = new WorldRuntimeLootContainerService(contentRepository, playerRuntimeService);
  lootService.prepareContainerLootSource(INSTANCE_ID, container, instance.tick, player);
  const prepared = lootService.getPreparedContainerLootSource(INSTANCE_ID, container, player, instance.tick);
  const itemKey = prepared?.items?.[0]?.itemKey;
  assert.equal(typeof itemKey, 'string');
  assert.ok(itemKey, '中央混元脉石必须通过生产容器链生成可采集库存');

  const persisted = lootService.buildContainerPersistenceStates(INSTANCE_ID);
  assert.equal(persisted.length, 1);
  lootService.hydrateContainerStates(INSTANCE_ID, [{
    ...persisted[0],
    activeSearch: {
      itemKey,
      totalTicks: 10,
      remainingTicks: 7,
    },
  }]);

  const deps = {
    playerRuntimeService,
    worldRuntimeLootContainerService: lootService,
    getPlayerLocationOrThrow(requestedPlayerId: string) {
      assert.equal(requestedPlayerId, PLAYER_ID);
      return { instanceId: INSTANCE_ID, x: player.x, y: player.y };
    },
    getInstanceRuntime(requestedInstanceId: string) {
      return requestedInstanceId === INSTANCE_ID ? instance : null;
    },
    getInstanceRuntimeOrThrow(requestedInstanceId: string) {
      assert.equal(requestedInstanceId, INSTANCE_ID);
      return instance;
    },
    areInstancePlayersHydrated(requestedInstanceId: string) {
      return requestedInstanceId === INSTANCE_ID;
    },
    refreshQuestStates() {},
  };
  const context = {
    contentTemplateRepository: contentRepository,
    resolveExpToNextByLevel(level: number) {
      return progressionService.getRealmRuntimeExpToNext(level);
    },
    getInstanceRuntime(requestedInstanceId: string) {
      return requestedInstanceId === INSTANCE_ID ? instance : null;
    },
    deps,
  };
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new GatherStrategy());

  const startResult = pipeline.startLifecycle(player, 'gather', {
    sourceId: prepared.sourceId,
    itemKey,
  }, context);
  assert.equal(startResult.ok, true, '完整水合后，无对应 gatherJob 的旧无主占用必须可由冷命令安全回收');
  assert.equal(startResult.started, true);

  const gatherJob = player.gatherJob as Record<string, unknown> | null;
  assert.ok(gatherJob);
  assert.equal(gatherJob.resourceNodeName, '混元脉石');
  assert.equal(typeof gatherJob.jobRunId, 'string');
  assert.equal(gatherJob.jobType, 'gather');
  assert.equal(gatherJob.sourceId, prepared.sourceId);
  assert.equal(gatherJob.instanceId, INSTANCE_ID);
  assert.equal(gatherJob.itemKey, itemKey);

  const task = buildTechniqueActivityTaskListView(player).tasks.find((entry) => entry.kind === 'gather');
  assert.equal(task?.state, 'running');
  assert.equal(task?.targetLabel, '混元脉石');

  const remainingBeforeTick = Number(gatherJob.remainingTicks);
  const tickResult = await pipeline.tickLifecycle(player, 'gather', context);
  assert.equal(tickResult.ok, true);
  assert.equal(Number(player.gatherJob?.remainingTicks), remainingBeforeTick - 1);
  const projected = lootService.getPreparedContainerLootSource(INSTANCE_ID, container, player, instance.tick);
  assert.equal(projected?.search?.remainingTicks, remainingBeforeTick - 1);

  const containerSnapshot = lootService.buildContainerPersistenceStates(INSTANCE_ID);
  const activeSearch = containerSnapshot[0]?.activeSearch as Record<string, unknown> | undefined;
  assert.equal(activeSearch?.playerId, PLAYER_ID);
  assert.equal(activeSearch?.jobRunId, player.gatherJob?.jobRunId);
  assert.equal(activeSearch?.itemKey, itemKey);

  const restartedLootService = new WorldRuntimeLootContainerService(contentRepository, playerRuntimeService);
  restartedLootService.hydrateContainerStates(
    INSTANCE_ID,
    JSON.parse(JSON.stringify(containerSnapshot)),
  );
  const restartedSearch = restartedLootService
    .buildContainerPersistenceStates(INSTANCE_ID)[0]?.activeSearch as Record<string, unknown> | undefined;
  assert.equal(restartedSearch?.playerId, PLAYER_ID);
  assert.equal(restartedSearch?.jobRunId, player.gatherJob?.jobRunId);

  const playerSnapshot = playerRuntimeService.buildPersistenceSnapshot(PLAYER_ID, ['active_job']);
  assert.ok(playerSnapshot);
  const restartedPlayer = playerRuntimeService.hydrateFromSnapshot(
    `${PLAYER_ID}:restart`,
    null,
    JSON.parse(JSON.stringify(playerSnapshot)),
  );
  const restartedGatherJob = restartedPlayer.gatherJob as Record<string, unknown> | null;
  assert.equal(restartedGatherJob?.jobRunId, player.gatherJob?.jobRunId);
  assert.equal(restartedGatherJob?.sourceId, prepared.sourceId);
  assert.equal(restartedGatherJob?.instanceId, INSTANCE_ID);
  assert.equal(restartedGatherJob?.itemKey, itemKey);
  assert.equal(restartedGatherJob?.workRemainingTicks, player.gatherJob?.workRemainingTicks);

  console.log(MARKER);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
