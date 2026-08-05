import assert from 'node:assert/strict';

import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import {
  dispatchStartBuildingConstruction,
  handleBuildDeconstructIntent,
} from '../runtime/world/world-runtime-building.service';
import { WorldRuntimeContextActionQueryService } from '../runtime/world/query/world-runtime-context-action-query.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000044:PASS';
const CHAMBER_OWNER_ID = 'player:chamber-owner';
const FOREIGN_BUILDER_ID = 'player:foreign-builder';
const VISITOR_ID = 'player:visitor';

type DomainPlayer = {
  playerId: string;
  x: number;
  y: number;
  attrs: {
    numericStats: { viewRange: number };
    craftEffectStats: { building: { speedRate: number } };
  };
  realm: { breakthroughReady: boolean };
  equipment: { slots: unknown[] };
  buildingSkill: { level: number; exp: number; expToNext: number };
  buildingJob: Record<string, unknown> | null;
  dirtyDomains: Set<string>;
  persistentRevision: number;
};

type VaultRecovery = {
  instanceId: string;
  buildingId: string;
  ownerPlayerId: string | null;
  reason: string;
};

function createTemplateRepository(): MapTemplateRepository {
  const repository = new MapTemplateRepository();
  repository.registerRuntimeMapTemplate({
    id: 'issue-000044-building-management',
    name: '密室建筑管理回归验证',
    width: 9,
    height: 9,
    routeDomain: 'system',
    tiles: Array.from({ length: 9 }, () => '.........'),
    spawnPoint: { x: 8, y: 8 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  return repository;
}

function createInstance(
  repository: MapTemplateRepository,
  instanceId: string,
  kind: string,
  ownerPlayerId: string | null,
): MapInstanceRuntime {
  const instance = new MapInstanceRuntime({
    instanceId,
    template: repository.getOrThrow('issue-000044-building-management'),
    monsterSpawns: [],
    kind,
    persistent: true,
    createdAt: Date.now(),
    displayName: '密室建筑管理回归验证',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'repair-proof',
    defaultEntry: false,
    canDamageTile: kind !== 'time_chamber',
    ownerPlayerId,
  });
  const { catalog, rules } = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(catalog, rules);
  return instance;
}

function createPlayer(playerId: string): DomainPlayer {
  return {
    playerId,
    x: 2,
    y: 2,
    attrs: {
      numericStats: { viewRange: 8 },
      craftEffectStats: { building: { speedRate: 0 } },
    },
    realm: { breakthroughReady: false },
    equipment: { slots: [] },
    buildingSkill: { level: 1, exp: 0, expToNext: 60 },
    buildingJob: null,
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
  };
}

function attachPlayer(instance: MapInstanceRuntime, player: DomainPlayer): void {
  instance.playersById.set(player.playerId, {
    playerId: player.playerId,
    x: player.x,
    y: player.y,
    selfRevision: 1,
  });
}

function placeBuilding(
  instance: MapInstanceRuntime,
  input: {
    buildingId: string;
    defId: string;
    x: number;
    y: number;
    ownerPlayerId: string | null;
    state: 'building' | 'active';
  },
): void {
  const result = instance.placeBuildingInstance(input);
  assert.equal(result.ok, true, `${input.buildingId} 应能进入权威建筑运行态，实际原因：${String(result.reason ?? '')}`);
}

function createRuntime(
  instance: MapInstanceRuntime,
  players: Map<string, DomainPlayer>,
  vaultRecoveries: VaultRecovery[],
): Record<string, any> {
  return {
    tick: 44,
    buildingOperationResultsByKey: new Map<string, unknown>(),
    buildingOperationAuditLog: [],
    getPlayerLocationOrThrow(playerId: string) {
      const player = players.get(playerId);
      if (!player) throw new Error(`player_not_found:${playerId}`);
      return { instanceId: instance.meta.instanceId, x: player.x, y: player.y };
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, instance.meta.instanceId);
      return instance;
    },
    getInstanceRuntime(instanceId: string) {
      return instanceId === instance.meta.instanceId ? instance : null;
    },
    getPlayerView(playerId: string) {
      return instance.buildPlayerView(playerId, 8);
    },
    playerRuntimeService: {
      getPlayer(playerId: string) {
        return players.get(playerId) ?? null;
      },
      getViewRadius(playerId: string) {
        return players.get(playerId)?.attrs.numericStats.viewRange ?? 1;
      },
      bumpPersistentRevision(player: DomainPlayer) {
        player.persistentRevision += 1;
      },
      markPersistenceDirtyDomains(player: DomainPlayer, domains: string[]) {
        for (const domain of domains) player.dirtyDomains.add(domain);
      },
    },
    refreshPlayerContextActions() {},
    timeChamberRuntimeService: {
      isTimeChamberInstance(instanceId: string) {
        return instanceId === instance.meta.instanceId && instance.meta.kind === 'time_chamber';
      },
    },
    treasureVaultRuntimeService: {
      async recoverVaultItemsToOwnerMail(input: VaultRecovery) {
        vaultRecoveries.push({
          instanceId: input.instanceId,
          buildingId: input.buildingId,
          ownerPlayerId: input.ownerPlayerId,
          reason: input.reason,
        });
        return { ok: true, mailId: 'mail:issue-000044', itemCount: 2 };
      },
    },
  };
}

async function main(): Promise<void> {
  const repository = createTemplateRepository();
  const chamber = createInstance(repository, 'time-chamber:issue-000044', 'time_chamber', CHAMBER_OWNER_ID);
  const chamberOwner = createPlayer(CHAMBER_OWNER_ID);
  const visitor = createPlayer(VISITOR_ID);
  attachPlayer(chamber, chamberOwner);
  attachPlayer(chamber, visitor);

  const foreignStartId = 'building:foreign:start';
  const foreignHalfBuiltId = 'building:foreign:half-built';
  const foreignCompletedId = 'building:foreign:completed';
  const foreignVisitorTargetId = 'building:foreign:visitor-target';
  const ownerlessLegacyId = 'building:legacy:ownerless';
  const foreignVaultId = 'building:foreign:vault';
  placeBuilding(chamber, { buildingId: foreignStartId, defId: 'stone_wall', x: 1, y: 1, ownerPlayerId: FOREIGN_BUILDER_ID, state: 'building' });
  placeBuilding(chamber, { buildingId: foreignHalfBuiltId, defId: 'stone_wall', x: 2, y: 1, ownerPlayerId: FOREIGN_BUILDER_ID, state: 'building' });
  placeBuilding(chamber, { buildingId: foreignCompletedId, defId: 'stone_wall', x: 3, y: 1, ownerPlayerId: FOREIGN_BUILDER_ID, state: 'active' });
  placeBuilding(chamber, { buildingId: foreignVisitorTargetId, defId: 'stone_wall', x: 4, y: 1, ownerPlayerId: FOREIGN_BUILDER_ID, state: 'active' });
  placeBuilding(chamber, { buildingId: ownerlessLegacyId, defId: 'stone_wall', x: 5, y: 1, ownerPlayerId: null, state: 'active' });
  placeBuilding(chamber, { buildingId: foreignVaultId, defId: 'treasure_vault', x: 6, y: 1, ownerPlayerId: FOREIGN_BUILDER_ID, state: 'active' });

  const players = new Map([
    [chamberOwner.playerId, chamberOwner],
    [visitor.playerId, visitor],
  ]);
  const vaultRecoveries: VaultRecovery[] = [];
  const chamberRuntime = createRuntime(chamber, players, vaultRecoveries);

  const actionService = new WorldRuntimeContextActionQueryService(
    repository,
    chamberRuntime.playerRuntimeService,
    { buildNpcQuestContextAction: () => null } as never,
  );
  const ownerView = chamber.buildPlayerView(CHAMBER_OWNER_ID, 8);
  assert.ok(ownerView, '密室主人必须能构建权威视野');
  const ownerActions = actionService.buildContextActions(ownerView, chamberRuntime);
  assert.equal(
    ownerActions.some((entry) => entry.id === `building:start:${foreignStartId}`),
    true,
    '密室主人靠近他人半成品时必须看到继续施工动作',
  );
  dispatchStartBuildingConstruction(chamberRuntime, CHAMBER_OWNER_ID, foreignStartId);
  assert.equal(chamber.buildingById.get(foreignStartId)?.activeBuilderPlayerId, CHAMBER_OWNER_ID);
  assert.equal(chamberOwner.buildingJob?.buildingId, foreignStartId, '继续施工必须进入通用建筑 job 生命周期');
  assert.equal(chamberOwner.dirtyDomains.has('active_job'), true, '建筑 job 必须进入既有持久化脏域');

  const visitorDenied = await handleBuildDeconstructIntent(chamberRuntime, VISITOR_ID, {
    requestId: 'issue-000044:visitor-denied',
    buildingId: foreignVisitorTargetId,
  });
  assert.equal(visitorDenied.reason, 'building_owner_mismatch', '普通访客不得借密室场景拆除他人建筑');
  assert.equal(chamber.buildingById.has(foreignVisitorTargetId), true);

  for (const [requestId, buildingId] of [
    ['issue-000044:owner-half-built', foreignHalfBuiltId],
    ['issue-000044:owner-completed', foreignCompletedId],
    ['issue-000044:owner-legacy', ownerlessLegacyId],
  ] as const) {
    const result = await handleBuildDeconstructIntent(chamberRuntime, CHAMBER_OWNER_ID, { requestId, buildingId });
    assert.equal(result.ok, true, `密室主人应能清理 ${buildingId}，实际原因：${String(result.reason ?? '')}`);
    assert.equal(chamber.buildingById.has(buildingId), false);
  }

  const vaultResult = await handleBuildDeconstructIntent(chamberRuntime, CHAMBER_OWNER_ID, {
    requestId: 'issue-000044:owner-vault',
    buildingId: foreignVaultId,
  });
  assert.equal(vaultResult.ok, true, `密室主人应能清理他人宝库，实际原因：${String(vaultResult.reason ?? '')}`);
  assert.deepEqual(vaultRecoveries, [{
    instanceId: chamber.meta.instanceId,
    buildingId: foreignVaultId,
    ownerPlayerId: FOREIGN_BUILDER_ID,
    reason: 'deconstruct',
  }], '密室管理权限不得把宝库资产返还对象改成密室主人');
  assert.equal(
    chamberRuntime.buildingOperationAuditLog.some((entry: Record<string, unknown>) => (
      entry.action === 'deconstruct'
      && entry.playerId === CHAMBER_OWNER_ID
      && entry.buildingId === foreignVaultId
      && entry.ok === true
    )),
    true,
    '密室主人代为清理仍必须进入既有建筑操作审计链',
  );

  const publicInstance = createInstance(repository, 'public:issue-000044', 'public', CHAMBER_OWNER_ID);
  const publicPlayer = createPlayer(CHAMBER_OWNER_ID);
  attachPlayer(publicInstance, publicPlayer);
  const publicForeignBuildingId = 'building:public:foreign';
  placeBuilding(publicInstance, {
    buildingId: publicForeignBuildingId,
    defId: 'stone_wall',
    x: 2,
    y: 1,
    ownerPlayerId: FOREIGN_BUILDER_ID,
    state: 'active',
  });
  const publicRecoveries: VaultRecovery[] = [];
  const publicRuntime = createRuntime(
    publicInstance,
    new Map([[publicPlayer.playerId, publicPlayer]]),
    publicRecoveries,
  );
  const publicDenied = await handleBuildDeconstructIntent(publicRuntime, CHAMBER_OWNER_ID, {
    requestId: 'issue-000044:public-denied',
    buildingId: publicForeignBuildingId,
  });
  assert.equal(publicDenied.reason, 'building_owner_mismatch', '普通地图即使带 ownerPlayerId 元数据也不得放宽建筑归属规则');
  assert.equal(publicInstance.buildingById.has(publicForeignBuildingId), true);
  assert.deepEqual(publicRecoveries, []);

  console.log(MARKER);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
