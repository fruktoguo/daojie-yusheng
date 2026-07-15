import assert from 'node:assert/strict';

import { MAX_INSTANCE_TICK_SPEED, type BuildingDef } from '@mud/shared';

import { compileBuildingDefinitions } from '../runtime/building/building-content.repository';
import { resolveCompiledBuildingDefinition } from '../runtime/building/building-definition-resolution.helpers';
import { TimeChamberAdmissionPolicy } from '../runtime/building/time-chamber-admission.policy';
import { TimeChamberRuntimeService } from '../runtime/building/time-chamber-runtime.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { resolvePlayerComprehensionSpeedRate } from '../runtime/player/player-progression-rule.helpers';
import { WorldRuntimeContextActionQueryService } from '../runtime/world/query/world-runtime-context-action-query.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const SOURCE_INSTANCE_ID = 'public:building_definition_identity_smoke';
const MAT_BUILDING_ID = 'building:legacy:meditation_mat';
const CHAMBER_BUILDING_ID = 'building:current:time_chamber';

async function main(): Promise<void> {
  const catalog = buildHandleDriftCatalog();
  const chamberDef = catalog.defById.get('time_chamber');
  const matDef = catalog.defById.get('meditation_mat');
  assert.equal(chamberDef?.handle, 8);
  assert.equal(matDef?.handle, 9);

  assert.equal(
    resolveCompiledBuildingDefinition(catalog, { defId: 'meditation_mat', defHandle: 8 })?.id,
    'meditation_mat',
    'defId 存在时不得把旧 handle=8 解析成当前密室定义',
  );
  assert.equal(
    resolveCompiledBuildingDefinition(catalog, { defId: 'removed_definition', defHandle: 8 }),
    null,
    '未知 defId 必须失败关闭，不能退回漂移 handle 猜测定义',
  );
  assert.equal(
    resolveCompiledBuildingDefinition(catalog, { defHandle: 8 })?.id,
    'time_chamber',
    '只有确实缺少 defId 的历史状态才允许 handle 兼容回退',
  );

  const instance = createInstance(catalog);
  const matCellIndex = instance.toTileIndex(3, 3);
  const hydrateResult = instance.hydrateBuildingRoomFengShuiState({
    buildings: [{
      id: MAT_BUILDING_ID,
      defId: 'meditation_mat',
      defHandle: 8,
      x: 3,
      y: 3,
      rotation: 0,
      ownerPlayerId: 'player:owner',
      state: 'active',
      hp: 60,
      maxHp: 60,
      revision: 1,
      cells: [{ tileIndex: matCellIndex, x: 3, y: 3 }],
    }],
    rooms: [],
    roomCells: [],
    fengShui: [],
  });
  assert.equal(hydrateResult.skippedUnknownDefCount, 0);

  const hydratedMat = instance.buildingById.get(MAT_BUILDING_ID);
  assert.ok(hydratedMat);
  assert.equal(hydratedMat.defId, 'meditation_mat');
  assert.equal(hydratedMat.defHandle, 9, '水合后必须使用当前目录的 canonical handle');

  const matView = instance.collectLocalBuildings(3, 3, 2)
    .find((entry) => entry.id === MAT_BUILDING_ID);
  assert.deepEqual(
    { name: matView?.name, char: matView?.char },
    { name: '蒲团', char: '蒲' },
    '旧蒲团必须继续按稳定 defId 投影名称和字符',
  );

  const player = {
    id: 'player:owner',
    instanceId: SOURCE_INSTANCE_ID,
    x: 3,
    y: 3,
    attrs: {
      numericStats: { techniqueExpRate: 0, viewRange: 5 },
      craftEffectStats: {},
    },
    equipment: { slots: [] },
  };
  assert.equal(
    resolvePlayerComprehensionSpeedRate(player, { instanceRuntime: instance }),
    1,
    '旧蒲团仍须提供 transmission.speedRate +1',
  );

  const placedChamber = instance.placeBuildingInstance({
    buildingId: CHAMBER_BUILDING_ID,
    defId: 'time_chamber',
    x: 4,
    y: 3,
    ownerPlayerId: player.id,
    state: 'active',
  });
  assert.equal(placedChamber.ok, true);

  const localBuildings = instance.collectLocalBuildings(3, 3, 2);
  const contextActions = buildContextActions(player, instance, localBuildings);
  assert.deepEqual(
    contextActions
      .filter((entry) => entry.id.startsWith('time_chamber:usage:'))
      .map((entry) => entry.id),
    [`time_chamber:usage:${encodeURIComponent(CHAMBER_BUILDING_ID)}`],
    '真密室应保留开启入口，旧蒲团不得再生成密室入口',
  );
  assert.deepEqual(
    contextActions
      .filter((entry) => entry.id.startsWith('time_chamber:management:'))
      .map((entry) => entry.id),
    [`time_chamber:management:${encodeURIComponent(CHAMBER_BUILDING_ID)}`],
    '密室管理入口只应向建造者开放',
  );
  const ownerUsageAction = contextActions.find((entry) => entry.id.startsWith('time_chamber:usage:'));
  assert.match(ownerUsageAction?.name ?? '', /^开启：/);
  assert.match(ownerUsageAction?.desc ?? '', /时间流速 .+使用人数/);
  const visitorActions = buildContextActions({ ...player, id: 'player:visitor' }, instance, localBuildings);
  assert.equal(
    visitorActions.some((entry) => entry.id.startsWith('time_chamber:usage:')),
    true,
    '访客应看到密室开启入口',
  );
  assert.equal(
    visitorActions.some((entry) => entry.id.startsWith('time_chamber:management:')),
    false,
    '访客不得看到密室管理入口',
  );
  assert.equal(
    contextActions.some((entry) => entry.id.includes(encodeURIComponent(MAT_BUILDING_ID))),
    false,
    '旧蒲团不得生成任何密室管理动作',
  );

  for (const persistedBuilding of instance.buildBuildingPersistenceEntries()) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(persistedBuilding, 'defHandle'),
      false,
      '建筑持久化快照不得写入进程内派生 handle',
    );
  }

  await assertPhantomChamberRecoveryUsesDeconstructFence(instance);

  console.log(JSON.stringify({
    ok: true,
    case: 'building-definition-identity',
    proves: '旧蒲团 handle=8 在新目录中按 defId 水合为 handle=9，并保持蒲团投影、传法加成、密室识别与伪密室恢复清理语义。',
  }, null, 2));
}

function buildHandleDriftCatalog() {
  const prefixDefinitions: BuildingDef[] = Array.from({ length: 7 }, (_, index) => ({
    id: `identity_prefix_${index + 1}`,
    name: `身份占位建筑${index + 1}`,
    placement: { layer: 'facility', footprint: [{ dx: 0, dy: 0 }] },
    topology: { blocksMove: false },
    economy: { maxHp: 1, cost: [] },
  }));
  return compileBuildingDefinitions([
    ...prefixDefinitions,
    {
      id: 'time_chamber',
      name: '密室',
      visual: { glyph: '室', color: '#6554c0', layer: 'furniture' },
      placement: { layer: 'facility', footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: false },
      economy: { maxHp: 180, cost: [] },
      timeChamber: {
        defaultCapacity: 1,
        maxSpeed: MAX_INSTANCE_TICK_SPEED,
        fuelUnitsPerSpiritStone: 36_000,
        allowedSizeTiers: ['small', 'medium', 'large'],
      },
    },
    {
      id: 'meditation_mat',
      name: '蒲团',
      visual: { glyph: '蒲', color: '#8b5e34', layer: 'furniture' },
      placement: { layer: 'facility', footprint: [{ dx: 0, dy: 0 }] },
      topology: { blocksMove: false },
      economy: { maxHp: 60, cost: [] },
      craftEffectStats: { transmission: { speedRate: 1 } },
    },
  ]);
}

function createInstance(catalog: ReturnType<typeof buildHandleDriftCatalog>): MapInstanceRuntime {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'building_definition_identity_smoke',
    name: '建筑定义身份烟测',
    width: 7,
    height: 7,
    routeDomain: 'system',
    tiles: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'],
    spawnPoint: { x: 0, y: 0 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: SOURCE_INSTANCE_ID,
    template: templateRepository.getOrThrow('building_definition_identity_smoke'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '建筑定义身份烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  instance.configureBuildingRuntime(catalog, []);
  return instance;
}

function buildContextActions(player: any, instance: MapInstanceRuntime, localBuildings: any[]): any[] {
  const service = new WorldRuntimeContextActionQueryService(
    { has: () => false, getOrThrow: (mapId: string) => ({ name: mapId }) } as any,
    { getPlayer: () => player } as any,
    { buildNpcQuestContextAction: () => null } as any,
  );
  return service.buildContextActions({
    playerId: player.id,
    self: { x: player.x, y: player.y },
    instance: { instanceId: SOURCE_INSTANCE_ID },
    localBuildings,
    localPortals: [],
    localNpcs: [],
  }, {
    getInstanceRuntimeOrThrow: () => instance,
  });
}

async function assertPhantomChamberRecoveryUsesDeconstructFence(instance: MapInstanceRuntime): Promise<void> {
  const service = new TimeChamberRuntimeService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { registerOrUpdate(): void {}, unregister(): void {} } as any,
    new TimeChamberAdmissionPolicy(),
  );
  const serviceInternal = service as any;
  const phantomState = {
    sourceInstanceId: SOURCE_INSTANCE_ID,
    buildingId: MAT_BUILDING_ID,
    chamberInstanceId: 'time-chamber:phantom-mat',
    templateId: 'time-chamber-template:phantom-mat',
    ownerPlayerId: 'player:owner',
    displayName: '伪密室',
    sizeTier: 'small',
    capacity: 1,
    configuredSpeed: 1,
    databaseFuelUnits: 0,
    hourlyFee: 0,
    revenueSpiritStones: 0,
    fuelUnitsPerSpiritStone: 36_000,
    maxSpeed: MAX_INSTANCE_TICK_SPEED,
    allowedSizeTiers: ['small', 'medium', 'large'],
    revision: 1,
  };
  serviceInternal.stateByBuildingKey.set(`${SOURCE_INSTANCE_ID}\u0000${MAT_BUILDING_ID}`, phantomState);
  serviceInternal.stateByChamberInstanceId.set(phantomState.chamberInstanceId, phantomState);

  const cleanupCalls: Array<[string, string]> = [];
  serviceInternal.prepareDeconstruct = async (sourceInstanceId: string, buildingId: string) => {
    cleanupCalls.push([sourceInstanceId, buildingId]);
    return { ok: true };
  };
  await service.applyRecoveredRuntimeState({
    getInstanceRuntime: (instanceId: string) => instanceId === SOURCE_INSTANCE_ID ? instance : null,
    isInstanceLeaseWritable: (candidate: unknown) => candidate === instance,
  });
  assert.deepEqual(
    cleanupCalls,
    [[SOURCE_INSTANCE_ID, MAT_BUILDING_ID]],
    '恢复期识别到蒲团关联的伪密室状态后，必须进入现有 prepareDeconstruct lease fence 清理链',
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
