import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';

const databaseUrl = resolveServerDatabaseUrl();

function createPrototypePayload<T extends Record<string, unknown>>(
  payload: T,
  prototypeFields: Record<string, unknown>,
): T {
  return Object.assign(Object.create(prototypeFields), payload);
}

async function main(): Promise<void> {
  await assertBuildingRoomFengShuiSnapshotUsesStaleKeyPruning();
  await assertContainerAndOverlaySnapshotsUseStaleKeyPruning();
  await assertInstanceStateSnapshotsUseStaleKeyPruning();

  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '无 DB 时已用 fake pool 验证 building/room/fengshui、container、overlay、tile_resource、tile_damage、runtime_tile、temporary_tile、ground_item 快照保存不再发送裸 DELETE 整实例 SQL，而是 jsonb_to_recordset 当前快照 key 后删除 stale key；with-db 下可验证实例分域专表可落地 tile resource diff、行级 tile_resource/tile_damage/ground_item/monster_runtime delta、带坐标的 tile damage state 与技能生成 temporary tile state，并可按 instance_id 读回',
          excludes: '无 DB 时不证明真实 PostgreSQL 回读、完整实例分域恢复/迁移链，也不证明其它 instance_* 专表',
          completionMapping: 'release:proof:with-db.instance-domain-persistence',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const service = new InstanceDomainPersistenceService({
    getPool() {
      return pool;
    },
  } as never);
  await service.onModuleInit();
  const instanceId = `instance:${Date.now().toString(36)}`;
  const monsterInstanceId = `${instanceId}:monster`;

  try {
    await cleanupRows(pool, instanceId);
    await service.saveTileResourceDiffs(instanceId, [
      { resourceKey: 'qi', tileIndex: 12, value: 34 },
      { resourceKey: 'qi', tileIndex: 15, value: 56 },
    ]);
    const rows = await service.loadTileResourceDiffs(instanceId);
    assert.deepEqual(rows, [
      { resourceKey: 'qi', tileIndex: 12, value: 34 },
      { resourceKey: 'qi', tileIndex: 15, value: 56 },
    ]);
    await service.saveTileResourceDelta(
      instanceId,
      [
        { resourceKey: 'qi', tileIndex: 15, value: 99 },
        { resourceKey: 'tile.resource.herb', tileIndex: 21, value: 3 },
      ],
      [{ resourceKey: 'qi', tileIndex: 12 }],
    );
    const rowsAfterDelta = await service.loadTileResourceDiffs(instanceId);
    assert.deepEqual(rowsAfterDelta, [
      { resourceKey: 'qi', tileIndex: 15, value: 99 },
      { resourceKey: 'tile.resource.herb', tileIndex: 21, value: 3 },
    ]);
    await service.replaceRuntimeTileCells(instanceId, [
      { x: 3, y: 4, tileType: 'floor', terrainType: 'floor', surfaceType: 'floor', structureType: null, interactableKinds: [] },
      { x: -2, y: 7, tileType: 'stone', terrainType: 'stone_ground', surfaceType: null, structureType: 'stone', interactableKinds: [] },
    ]);
    const runtimeTileCells = await service.loadRuntimeTileCells(instanceId);
    assert.deepEqual(runtimeTileCells, [
      { x: 3, y: 4, tileType: 'floor', terrainType: 'floor', surfaceType: 'floor', structureType: null, interactableKinds: [] },
      { x: -2, y: 7, tileType: 'stone', terrainType: 'stone_ground', surfaceType: null, structureType: 'stone', interactableKinds: [] },
    ]);
    await service.replaceRuntimeTileCells(instanceId, [
      { x: 3, y: 4, tileType: 'forest', terrainType: 'grass', surfaceType: 'moss', structureType: null, interactableKinds: ['forage'] },
    ]);
    const runtimeTileCellsAfterPrune = await service.loadRuntimeTileCells(instanceId);
    assert.deepEqual(runtimeTileCellsAfterPrune, [
      { x: 3, y: 4, tileType: 'forest', terrainType: 'grass', surfaceType: 'moss', structureType: null, interactableKinds: ['forage'] },
    ]);
    await service.saveTileDamageStates(instanceId, [
      {
        tileIndex: 7,
        x: 11,
        y: -3,
        hp: 0,
        maxHp: 100,
        destroyed: true,
        respawnLeft: 42,
        modifiedAt: 123456,
      },
    ]);
    const tileDamageRows = await service.loadTileDamageStates(instanceId);
    assert.deepEqual(tileDamageRows, [
      {
        tileIndex: 7,
        x: 11,
        y: -3,
        hp: 0,
        maxHp: 100,
        destroyed: true,
        respawnLeft: 42,
        modifiedAt: 123456,
      },
    ]);
    await service.saveTileDamageDelta(
      instanceId,
      [
        {
          tileIndex: 8,
          x: 12,
          y: -2,
          hp: 5,
          maxHp: 100,
          destroyed: false,
          respawnLeft: 0,
          modifiedAt: 123999,
        },
      ],
      [7],
    );
    const tileDamageRowsAfterDelta = await service.loadTileDamageStates(instanceId);
    assert.deepEqual(tileDamageRowsAfterDelta, [
      {
        tileIndex: 8,
        x: 12,
        y: -2,
        hp: 5,
        maxHp: 100,
        destroyed: false,
        respawnLeft: 0,
        modifiedAt: 123999,
      },
    ]);
    await service.deleteTileDamageStates(instanceId, [8]);
    assert.equal((await service.loadTileDamageStates(instanceId)).length, 0);
    await service.saveTileDamageStates(instanceId, [
      {
        tileIndex: 7,
        x: 11,
        y: -3,
        hp: 0,
        maxHp: 100,
        destroyed: true,
        respawnLeft: 42,
        modifiedAt: 123456,
      },
    ]);
    await service.deleteTileDamageStates(instanceId, [7]);
    const tileDamageRowsAfterDelete = await service.loadTileDamageStates(instanceId);
    assert.equal(tileDamageRowsAfterDelete.length, 0);
    await service.saveTileDamageStates(instanceId, [
      {
        tileIndex: 7,
        x: 11,
        y: -3,
        hp: 0,
        maxHp: 100,
        destroyed: true,
        respawnLeft: 42,
        modifiedAt: 123456,
      },
    ]);
    await service.saveTileDamageStates(instanceId, []);
    const tileDamageRowsAfterClear = await service.loadTileDamageStates(instanceId);
    assert.equal(tileDamageRowsAfterClear.length, 0);
    await service.replaceTemporaryTileStates(instanceId, [
      {
        tileIndex: 9,
        x: 12,
        y: -4,
        tileType: 'stone',
        hp: 77,
        maxHp: 90,
        expiresAtTick: 1234,
        ownerPlayerId: 'player:owner',
        sourceSkillId: 'skill.yi_kunlun_point_stone',
        createdAt: 222,
        modifiedAt: 333,
      },
    ]);
    const temporaryTileRows = await service.loadTemporaryTileStates(instanceId);
    assert.deepEqual(temporaryTileRows, [
      {
        tileIndex: 9,
        x: 12,
        y: -4,
        tileType: 'stone',
        hp: 77,
        maxHp: 90,
        expiresAtTick: 1234,
        ownerPlayerId: 'player:owner',
        sourceSkillId: 'skill.yi_kunlun_point_stone',
        createdAt: 222,
        modifiedAt: 333,
      },
    ]);
    await service.replaceTemporaryTileStates(instanceId, [
      {
        tileIndex: 9,
        x: 12,
        y: -4,
        tileType: 'floor',
        hp: 55,
        maxHp: 90,
        expiresAtTick: 1235,
        ownerPlayerId: 'player:owner',
        sourceSkillId: 'skill.yi_kunlun_point_stone',
        createdAt: 222,
        modifiedAt: 444,
      },
      {
        tileIndex: 10,
        x: 13,
        y: -4,
        tileType: 'stone',
        hp: 12,
        maxHp: 18,
        expiresAtTick: 1500,
      },
    ]);
    await service.replaceTemporaryTileStates(instanceId, [
      {
        tileIndex: 9,
        x: 12,
        y: -4,
        tileType: 'floor',
        hp: 44,
        maxHp: 90,
        expiresAtTick: 1236,
        ownerPlayerId: 'player:owner',
        sourceSkillId: 'skill.yi_kunlun_point_stone',
        createdAt: 222,
        modifiedAt: 555,
      },
    ]);
    const temporaryTileRowsAfterPrune = await service.loadTemporaryTileStates(instanceId);
    assert.deepEqual(temporaryTileRowsAfterPrune, [
      {
        tileIndex: 9,
        x: 12,
        y: -4,
        tileType: 'floor',
        hp: 44,
        maxHp: 90,
        expiresAtTick: 1236,
        ownerPlayerId: 'player:owner',
        sourceSkillId: 'skill.yi_kunlun_point_stone',
        createdAt: 222,
        modifiedAt: 555,
      },
    ]);
    await service.replaceTemporaryTileStates(instanceId, []);
    const temporaryTileRowsAfterClear = await service.loadTemporaryTileStates(instanceId);
    assert.equal(temporaryTileRowsAfterClear.length, 0);
    await service.saveInstanceCheckpoint(instanceId, {
      kind: 'cold_start',
      tileResourceCount: rows.length,
    });
    const checkpoint = await service.loadInstanceCheckpoint(instanceId) as { kind?: string; tileResourceCount?: number } | null;
    assert.equal(checkpoint?.kind, 'cold_start');
    assert.equal(checkpoint?.tileResourceCount, 2);
    await service.saveInstanceRecoveryWatermark(instanceId, {
      catalogVersion: 7,
      recoveryVersion: 9,
      checkpointKind: 'cold_start',
    });
    const watermark = await service.loadInstanceRecoveryWatermark(instanceId) as { catalogVersion?: number; recoveryVersion?: number; checkpointKind?: string } | null;
    assert.equal(watermark?.catalogVersion, 7);
    assert.equal(watermark?.recoveryVersion, 9);
    assert.equal(watermark?.checkpointKind, 'cold_start');
    await service.saveGroundItem({
      groundItemId: `ground:${instanceId}:1`,
      instanceId,
      tileIndex: 18,
      itemPayload: createPrototypePayload(
        { itemId: 'rat_tail', count: 3 },
        { name: '模板名不应落盘', desc: '模板描述不应落盘' },
      ),
      expireAt: null,
    });
    const groundItems = await service.loadGroundItems(instanceId);
    assert.deepEqual(groundItems, [
      {
        groundItemId: `ground:${instanceId}:1`,
        instanceId,
        tileIndex: 18,
        itemPayload: { itemId: 'rat_tail', count: 3 },
        expireAt: null,
      },
    ]);
    const removedGroundItem = await service.removeGroundItem(`ground:${instanceId}:1`);
    assert.equal(removedGroundItem, true);
    const groundItemsAfterRemove = await service.loadGroundItems(instanceId);
    assert.equal(groundItemsAfterRemove.length, 0);
    await service.replaceGroundItemTiles(instanceId, [18], [
      {
        tileIndex: 18,
        items: [
          createPrototypePayload(
            { itemId: 'rat_tail', count: 4 },
            { name: '模板名不应落盘', desc: '模板描述不应落盘' },
          ),
          { itemId: 'spirit_stone', count: 1 },
        ],
      },
    ]);
    const groundItemsAfterTileDelta = await service.loadGroundItems(instanceId);
    assert.deepEqual(groundItemsAfterTileDelta.map((entry) => ({
      instanceId: entry.instanceId,
      tileIndex: entry.tileIndex,
      itemPayload: entry.itemPayload,
      expireAt: entry.expireAt,
    })).sort((left, right) => String((left.itemPayload as { itemId?: unknown } | null | undefined)?.itemId)
      .localeCompare(String((right.itemPayload as { itemId?: unknown } | null | undefined)?.itemId), 'zh-Hans-CN')), [
      {
        instanceId,
        tileIndex: 18,
        itemPayload: { itemId: 'rat_tail', count: 4 },
        expireAt: null,
      },
      {
        instanceId,
        tileIndex: 18,
        itemPayload: { itemId: 'spirit_stone', count: 1 },
        expireAt: null,
      },
    ]);
    await service.replaceGroundItemTiles(instanceId, [18], []);
    const groundItemsAfterTileClear = await service.loadGroundItems(instanceId);
    assert.equal(groundItemsAfterTileClear.length, 0);
    await service.saveContainerState({
      instanceId,
      containerId: 'container:1',
      sourceId: 'source:1',
      statePayload: {
        locked: true,
        slots: 4,
        generatedAtTick: 11,
        refreshAtTick: 29,
        entries: [
          {
            item: { itemId: 'spirit_grass', count: 2 },
            createdTick: 12,
            visible: true,
          },
        ],
        activeSearch: createPrototypePayload(
          {
            itemKey: 'spirit_grass',
            totalTicks: 5,
            remainingTicks: 3,
          },
          { debugName: '不应落盘' },
        ),
      },
    });
    const containerStates = await service.loadContainerStates(instanceId);
    assert.deepEqual(containerStates, [
      {
        instanceId,
        containerId: 'container:1',
        sourceId: 'source:1',
        statePayload: {
          locked: true,
          slots: 4,
          sourceId: 'source:1',
          containerId: 'container:1',
          generatedAtTick: 11,
          refreshAtTick: 29,
          entries: [
            {
              item: { itemId: 'spirit_grass', count: 2 },
              createdTick: 12,
              visible: true,
            },
          ],
        activeSearch: {
          itemKey: 'spirit_grass',
          totalTicks: 5,
          remainingTicks: 3,
        },
        },
      },
    ]);
    const removedContainerState = await service.removeContainerState(instanceId, 'container:1');
    assert.equal(removedContainerState, true);
    const containerStatesAfterRemove = await service.loadContainerStates(instanceId);
    assert.equal(containerStatesAfterRemove.length, 0);
    await service.replaceContainerStates(instanceId, [
      {
        containerId: 'lm_old_shrine',
        sourceId: 'legacy:source:old_shrine',
        generatedAtTick: 41,
        refreshAtTick: 51,
        entries: [
          {
            item: createPrototypePayload(
              { itemId: 'old_grass', count: 1 },
              { name: '模板名不应落盘', desc: '模板描述不应落盘' },
            ),
            createdTick: 41,
            visible: false,
          },
        ],
      },
      {
        containerId: 'lm_old_shrine',
        sourceId: `container:${instanceId}:lm_old_shrine`,
        generatedAtTick: 42,
        refreshAtTick: 52,
        entries: [
          {
            item: createPrototypePayload(
              { itemId: 'new_grass', count: 2 },
              { name: '模板名不应落盘', desc: '模板描述不应落盘' },
            ),
            createdTick: 42,
            visible: true,
          },
        ],
      },
    ]);
    const dedupedContainerStates = await service.loadContainerStates(instanceId);
    assert.equal(dedupedContainerStates.length, 1);
    assert.equal(dedupedContainerStates[0]?.containerId, 'lm_old_shrine');
    assert.equal(dedupedContainerStates[0]?.sourceId, `container:${instanceId}:lm_old_shrine`);
    assert.deepEqual((dedupedContainerStates[0]?.statePayload as { entries?: unknown[] }).entries, [
      {
        item: { itemId: 'new_grass', count: 2 },
        createdTick: 42,
        visible: true,
      },
    ]);
    await service.replaceContainerStates(instanceId, [
      {
        containerId: 'lm_old_shrine',
        sourceId: `container:${instanceId}:lm_old_shrine`,
        generatedAtTick: 43,
        refreshAtTick: 53,
        activeSearch: { itemKey: 'new_grass', totalTicks: 10, remainingTicks: 6 },
        entries: [
          {
            item: { itemId: 'new_grass', count: 3 },
            createdTick: 43,
            visible: true,
          },
          {
            item: { itemId: 'stale_branch', count: 1 },
            createdTick: 44,
            visible: false,
          },
        ],
      },
      {
        containerId: 'stale_cache_chest',
        sourceId: 'container:stale_cache_chest',
        generatedAtTick: 45,
        refreshAtTick: 55,
        entries: [
          {
            item: { itemId: 'stale_seed', count: 1 },
            createdTick: 45,
            visible: true,
          },
        ],
      },
    ]);
    await service.replaceContainerStates(instanceId, [
      {
        containerId: 'lm_old_shrine',
        sourceId: `container:${instanceId}:lm_old_shrine`,
        generatedAtTick: 46,
        refreshAtTick: 56,
        activeSearch: { itemKey: 'new_grass', totalTicks: 10, remainingTicks: 2 },
        entries: [
          {
            item: { itemId: 'new_grass', count: 4 },
            createdTick: 46,
            visible: true,
          },
        ],
      },
    ]);
    const prunedContainerStates = await service.loadContainerStates(instanceId);
    assert.equal(prunedContainerStates.length, 1);
    assert.equal(prunedContainerStates[0]?.containerId, 'lm_old_shrine');
    assert.deepEqual(prunedContainerStates[0]?.statePayload, {
      sourceId: `container:${instanceId}:lm_old_shrine`,
      containerId: 'lm_old_shrine',
      generatedAtTick: 46,
      refreshAtTick: 56,
      entries: [
        {
          item: { itemId: 'new_grass', count: 4 },
          createdTick: 46,
          visible: true,
        },
      ],
      activeSearch: { itemKey: 'new_grass', totalTicks: 10, remainingTicks: 2 },
    });
    const savedMonster = await service.saveMonsterRuntimeState({
      monsterRuntimeId: `monster:${monsterInstanceId}:1`,
      instanceId: monsterInstanceId,
      monsterId: 'm_demon_king_guard',
      monsterName: '镇渊妖将',
      monsterTier: 'demon_king',
      monsterLevel: 88,
      tileIndex: 27,
      x: 3,
      y: 4,
      hp: 9000,
      maxHp: 12000,
      alive: true,
      respawnLeft: 0,
      respawnTicks: 0,
      aggroTargetPlayerId: 'player:target',
      statePayload: createPrototypePayload(
        {
          buffs: [{ buffId: 'doom', remainingTicks: 12 }],
          attackReadyTick: 77,
        },
        { debugName: '不应落盘' },
      ),
    });
    assert.equal(savedMonster, true);
    const monsterRows = await service.loadMonsterRuntimeStates(monsterInstanceId);
    assert.deepEqual(monsterRows, [
      {
        monsterRuntimeId: `monster:${monsterInstanceId}:1`,
        instanceId: monsterInstanceId,
        monsterId: 'm_demon_king_guard',
        monsterName: '镇渊妖将',
        monsterTier: 'demon_king',
        monsterLevel: 88,
        tileIndex: 27,
        x: 3,
        y: 4,
        hp: 9000,
        maxHp: 12000,
        alive: true,
        respawnLeft: 0,
        respawnTicks: 0,
        aggroTargetPlayerId: 'player:target',
        statePayload: {
          buffs: [{ buffId: 'doom', remainingTicks: 12 }],
          attackReadyTick: 77,
        },
      },
    ]);
    await service.saveMonsterRuntimeDelta(monsterInstanceId, [
      {
        monsterRuntimeId: `monster:${monsterInstanceId}:1`,
        monsterId: 'm_demon_king_guard',
        monsterName: '镇渊妖将',
        monsterTier: 'demon_king',
        monsterLevel: 88,
        tileIndex: 28,
        x: 4,
        y: 4,
        hp: 8000,
        maxHp: 12000,
        alive: true,
        respawnLeft: 0,
        respawnTicks: 0,
        aggroTargetPlayerId: 'player:target',
        statePayload: createPrototypePayload(
          {
            buffs: [{ buffId: 'doom', remainingTicks: 9 }],
            attackReadyTick: 88,
          },
          { debugName: '不应落盘' },
        ),
      },
    ], []);
    const monsterRowsAfterDelta = await service.loadMonsterRuntimeStates(monsterInstanceId);
    assert.equal(monsterRowsAfterDelta[0]?.tileIndex, 28);
    assert.equal(monsterRowsAfterDelta[0]?.hp, 8000);
    assert.deepEqual(monsterRowsAfterDelta[0]?.statePayload, {
      buffs: [{ buffId: 'doom', remainingTicks: 9 }],
      attackReadyTick: 88,
    });
    await service.saveMonsterRuntimeDelta(monsterInstanceId, [], [`monster:${monsterInstanceId}:1`]);
    const monsterRowsAfterDeltaDelete = await service.loadMonsterRuntimeStates(monsterInstanceId);
    assert.equal(monsterRowsAfterDeltaDelete.length, 0);
    await service.saveMonsterRuntimeState({
      monsterRuntimeId: `monster:${monsterInstanceId}:1`,
      instanceId: monsterInstanceId,
      monsterId: 'm_demon_king_guard',
      monsterName: '镇渊妖将',
      monsterTier: 'demon_king',
      monsterLevel: 88,
      tileIndex: 27,
      x: 3,
      y: 4,
      hp: 9000,
      maxHp: 12000,
      alive: true,
      respawnLeft: 0,
      respawnTicks: 0,
      aggroTargetPlayerId: 'player:target',
      statePayload: {
        buffs: [{ buffId: 'doom', remainingTicks: 12 }],
        attackReadyTick: 77,
      },
    });
    const rejectedMonster = await service.saveMonsterRuntimeState({
      monsterRuntimeId: `monster:${instanceId}:2`,
      instanceId,
      monsterId: 'm_dust_vulture',
      monsterName: '灰尾秃鹫',
      monsterTier: 'mortal_blood',
      monsterLevel: 16,
      tileIndex: 31,
      x: 5,
      y: 5,
      hp: 100,
      maxHp: 100,
      alive: true,
      statePayload: { note: 'should not persist' },
    });
    assert.equal(rejectedMonster, false);
    const rejectedMonsterRows = await service.loadMonsterRuntimeStates(instanceId);
    assert.equal(rejectedMonsterRows.length, 0);
    await service.replaceMonsterRuntimeStates(monsterInstanceId, []);
    const monsterRowsAfterReplaceClear = await service.loadMonsterRuntimeStates(monsterInstanceId);
    assert.equal(monsterRowsAfterReplaceClear.length, 0);
    const savedEvent = await service.saveEventState({
      eventId: `event:${instanceId}:1`,
      instanceId,
      eventKind: 'portal',
      eventKey: 'portal:spawn:manual',
      statePayload: createPrototypePayload(
        {
          opened: true,
          x: 7,
          y: 11,
        },
        { debugName: '不应落盘' },
      ),
      resolvedAt: null,
    });
    assert.equal(savedEvent, true);
    const eventRows = await service.loadEventStates(instanceId);
    assert.deepEqual(eventRows, [
      {
        eventId: `event:${instanceId}:1`,
        instanceId,
        eventKind: 'portal',
        eventKey: 'portal:spawn:manual',
        statePayload: {
          opened: true,
          x: 7,
          y: 11,
        },
        resolvedAt: null,
      },
    ]);
    const removedEvent = await service.removeEventState(`event:${instanceId}:1`);
    assert.equal(removedEvent, true);
    const eventRowsAfterRemove = await service.loadEventStates(instanceId);
    assert.equal(eventRowsAfterRemove.length, 0);
    const savedOverlay = await service.saveOverlayChunk({
      instanceId,
      patchKind: 'tile',
      chunkKey: 'tile:0:0',
      patchVersion: 3,
      patchPayload: createPrototypePayload(
        {
          tiles: [
            { x: 0, y: 0, aura: 12 },
            { x: 1, y: 0, aura: 8 },
          ],
        },
        { debugName: '不应落盘' },
      ),
    });
    assert.equal(savedOverlay, true);
    const overlayChunks = await service.loadOverlayChunks(instanceId);
    assert.deepEqual(overlayChunks, [
      {
        instanceId,
        patchKind: 'tile',
        chunkKey: 'tile:0:0',
        patchVersion: 3,
        patchPayload: {
          tiles: [
            { x: 0, y: 0, aura: 12 },
            { x: 1, y: 0, aura: 8 },
          ],
        },
      },
    ]);
    const removedOverlay = await service.removeOverlayChunk(instanceId, 'tile', 'tile:0:0');
    assert.equal(removedOverlay, true);
    const overlayChunksAfterRemove = await service.loadOverlayChunks(instanceId);
    assert.equal(overlayChunksAfterRemove.length, 0);
    await service.replaceOverlayChunks(instanceId, [
      {
        patchKind: 'tile',
        chunkKey: 'tile:stale',
        patchVersion: 1,
        patchPayload: { tiles: [{ x: 9, y: 9, aura: 1 }] },
      },
      {
        patchKind: 'portal',
        chunkKey: 'runtime_portals',
        patchVersion: 4,
        patchPayload: { version: 1, portals: [{ x: 1, y: 1, targetMapId: 'sect_domain' }] },
      },
    ]);
    const overlayChunksAfterReplace = await service.loadOverlayChunks(instanceId);
    assert.equal(overlayChunksAfterReplace.length, 2);
    await service.replaceOverlayChunks(instanceId, [
      {
        patchKind: 'portal',
        chunkKey: 'runtime_portals',
        patchVersion: 5,
        patchPayload: { version: 2, portals: [{ x: 2, y: 2, targetMapId: 'market_square' }] },
      },
    ]);
    const overlayChunksAfterPrune = await service.loadOverlayChunks(instanceId);
    assert.deepEqual(overlayChunksAfterPrune, [
      {
        instanceId,
        patchKind: 'portal',
        chunkKey: 'runtime_portals',
        patchVersion: 5,
        patchPayload: { version: 2, portals: [{ x: 2, y: 2, targetMapId: 'market_square' }] },
      },
    ]);
    await service.replaceOverlayChunks(instanceId, []);
    const overlayChunksAfterReplaceClear = await service.loadOverlayChunks(instanceId);
    assert.equal(overlayChunksAfterReplaceClear.length, 0);
    await service.saveBuildingRoomFengShuiState(instanceId, {
      buildings: [
        {
          id: 'building:stone_wall:1',
          defId: 'stone_wall',
          defHandle: 7,
          x: 6,
          y: 8,
          rotation: 90,
          ownerPlayerId: 'player:builder',
          ownerSectId: 'sect:builder',
          roomId: 'room:alchemy:1',
          hp: 80,
          maxHp: 100,
          state: 'active',
          createdAtTick: 10,
          updatedAtTick: 12,
          revision: 3,
          cells: [{ tileIndex: 88, x: 6, y: 8 }],
        },
      ],
      rooms: [
        {
          id: 'room:alchemy:1',
          role: 'alchemy',
          enclosed: true,
          semiOutdoor: false,
          minX: 5,
          minY: 7,
          maxX: 9,
          maxY: 11,
          area: 9,
          perimeter: 12,
          doorCount: 1,
          windowCount: 0,
          roofCoverageRatio: 100,
          roomHash: 'hash:alchemy:1',
          topologyRevision: 31,
          contentRevision: 17,
          updatedAtTick: 13,
        },
      ],
      fengShui: [
        {
          roomId: 'room:alchemy:1',
          score: 742,
          grade: 'great_good',
          primaryElement: 'wood',
          functionElement: 'fire',
          shapeScore: 40,
          enclosureScore: 80,
          qiScore: 90,
          shaScore: 0,
          comfortScore: 10,
          integrityScore: 0,
          elementScore: 45,
          formationScore: 0,
          reasons: [
            { code: 'element.generates_function', delta: 45, severity: 'good' },
          ],
          revision: 48,
          updatedAtTick: 14,
        },
      ],
    });
    const loadedBuildingRoomFengShuiState = await service.loadBuildingRoomFengShuiState(instanceId) as {
      buildings: Array<Record<string, unknown>>;
      rooms: Array<Record<string, unknown>>;
      fengShui: Array<Record<string, unknown>>;
    };
    assert.equal(loadedBuildingRoomFengShuiState.buildings.length, 1);
    assert.equal(loadedBuildingRoomFengShuiState.buildings[0]?.id, 'building:stone_wall:1');
    assert.equal(loadedBuildingRoomFengShuiState.buildings[0]?.defId, 'stone_wall');
    assert.equal(loadedBuildingRoomFengShuiState.buildings[0]?.defHandle, 7);
    assert.deepEqual(loadedBuildingRoomFengShuiState.buildings[0]?.cells, [{
      buildingId: 'building:stone_wall:1',
      tileIndex: 88,
      x: 6,
      y: 8,
      tileType: 'floor',
      previousTileType: null,
      previousTerrainType: null,
      previousSurfaceType: null,
      previousStructureType: null,
      previousInteractableKinds: [],
      blocksMove: false,
      blocksSight: false,
    }]);
    assert.equal(loadedBuildingRoomFengShuiState.rooms.length, 1);
    assert.equal(loadedBuildingRoomFengShuiState.rooms[0]?.id, 'room:alchemy:1');
    assert.equal(loadedBuildingRoomFengShuiState.rooms[0]?.roofCoverageRatio, 100);
    assert.equal(loadedBuildingRoomFengShuiState.rooms[0]?.topologyRevision, 31);
    assert.equal(loadedBuildingRoomFengShuiState.fengShui.length, 1);
    assert.equal(loadedBuildingRoomFengShuiState.fengShui[0]?.roomId, 'room:alchemy:1');
    assert.equal(loadedBuildingRoomFengShuiState.fengShui[0]?.score, 742);
    assert.deepEqual(loadedBuildingRoomFengShuiState.fengShui[0]?.reasons, [
      { code: 'element.generates_function', delta: 45, severity: 'good' },
    ]);
    await service.saveBuildingRoomFengShuiState(instanceId, {
      buildings: [
        {
          id: 'building:stone_wall:1',
          defId: 'stone_wall',
          x: 6,
          y: 8,
          hp: 66,
          maxHp: 100,
          cells: [{ tileIndex: 88, x: 6, y: 8, blocksMove: true }],
        },
        {
          id: 'building:wood_wall:2',
          defId: 'wood_wall',
          x: 7,
          y: 8,
          hp: 20,
          maxHp: 40,
          cells: [{ tileIndex: 89, x: 7, y: 8 }],
        },
      ],
      rooms: [
        {
          id: 'room:alchemy:1',
          role: 'alchemy',
          enclosed: true,
          minX: 5,
          minY: 7,
          maxX: 9,
          maxY: 11,
          area: 10,
          roomHash: 'hash:alchemy:2',
          revision: 32,
        },
      ],
      fengShui: [],
    });
    const loadedBuildingRoomFengShuiStateAfterPrune = await service.loadBuildingRoomFengShuiState(instanceId) as {
      buildings: Array<Record<string, unknown>>;
      rooms: Array<Record<string, unknown>>;
      roomCells: Array<Record<string, unknown>>;
      fengShui: Array<Record<string, unknown>>;
    };
    assert.deepEqual(loadedBuildingRoomFengShuiStateAfterPrune.buildings.map((entry) => entry.id), [
      'building:stone_wall:1',
      'building:wood_wall:2',
    ]);
    assert.equal(loadedBuildingRoomFengShuiStateAfterPrune.buildings[0]?.hp, 66);
    assert.equal(loadedBuildingRoomFengShuiStateAfterPrune.rooms.length, 1);
    assert.equal(loadedBuildingRoomFengShuiStateAfterPrune.rooms[0]?.roomHash, 'hash:alchemy:2');
    assert.equal(loadedBuildingRoomFengShuiStateAfterPrune.roomCells.length, 0);
    assert.equal(loadedBuildingRoomFengShuiStateAfterPrune.fengShui.length, 0);

    const legacySnapshot = {
      version: 1,
      savedAt: Date.now(),
      templateId: 'yunlai_town',
      auraEntries: [{ tileIndex: 2, value: 13 }],
      tileResourceEntries: [
        { resourceKey: 'aura.refined.neutral', tileIndex: 2, value: 13 },
        { resourceKey: 'qi', tileIndex: 6, value: 9 },
      ],
      groundPileEntries: [
        {
          tileIndex: 15,
          items: [
            { itemId: 'spirit_stone', count: 4, name: '灵石' },
          ],
        },
      ],
      containerStates: [
        {
          instanceId,
          containerId: 'container:legacy:1',
          sourceId: 'source:legacy:1',
          statePayload: {
            locked: true,
            generatedAtTick: 31,
            refreshAtTick: 62,
            entries: [
              {
                item: { itemId: 'spirit_grass_seed', count: 1 },
                createdTick: 33,
                visible: false,
              },
            ],
          },
        },
      ],
    };
    const projected = projectLegacyInstanceSnapshot(legacySnapshot, `${instanceId}:legacy`);
    await service.saveTileResourceDiffs(`${instanceId}:legacy`, projected.tileResourceEntries);
    await service.saveInstanceCheckpoint(`${instanceId}:legacy`, projected.checkpoint);
    await service.saveInstanceRecoveryWatermark(`${instanceId}:legacy`, projected.recoveryWatermark);
    for (const entry of projected.groundItems) {
      await service.saveGroundItem(entry);
    }
    for (const containerState of projected.containerStates) {
      await service.saveContainerState(containerState);
    }
    const projectedTileRows = await service.loadTileResourceDiffs(`${instanceId}:legacy`);
    const projectedCheckpoint = await service.loadInstanceCheckpoint(`${instanceId}:legacy`);
    const projectedWatermark = await service.loadInstanceRecoveryWatermark(`${instanceId}:legacy`);
    const projectedGroundItems = await service.loadGroundItems(`${instanceId}:legacy`);
    const projectedContainerStates = await service.loadContainerStates(`${instanceId}:legacy`);
    assert.deepEqual(projectedTileRows, projected.tileResourceEntries);
    assert.deepEqual(projectedCheckpoint, projected.checkpoint);
    assert.deepEqual(projectedWatermark, projected.recoveryWatermark);
    assert.deepEqual(projectedGroundItems, projected.expectedGroundItems);
    assert.deepEqual(projectedContainerStates, projected.containerStates);

    console.log(
      JSON.stringify(
        {
          ok: true,
          instanceId,
          rowCount: rows.length,
          answers: 'with-db 下已验证 instance_tile_cell 可按 instance_id/x/y 落地和回读动态地块，instance_tile_resource_state 可按 instance_id/resource_key/tile_index 落地、delta upsert/delete 并回读 tile resource diff，instance_tile_damage_state 可按 instance_id/tile_index 落地、delta upsert/delete、按 x/y 回读动态地块坐标、清空并回读地块损坏状态，instance_temporary_tile_state 可按 instance_id/tile_index 落地、回读并清空技能生成临时地块，instance_checkpoint 可按 instance_id 存储/读取冷启动 checkpoint，instance_recovery_watermark 也可按 instance_id 存储/读取恢复水位，instance_ground_item 也能按 ground_item_id 落地/删除、按 tile delta 替换并按 instance_id 回读，instance_container_state/entry/timer 能按 instance_id/container_id 拆表落地、重建回读、二次快照更新并清理 stale container/entry/timer，instance_monster_runtime_state 也能只给高价值怪物写入、delta upsert/delete 并按 instance_id 回读，低价值怪物会被拒绝落库，instance_event_state 也能按 event_id/instance_id 落地、回读并删除，instance_overlay_chunk 也能按 instance_id/patch_kind/chunk_key 落地、二次快照更新并清理 stale chunk，instance_building_state/instance_building_cell/instance_room_state/instance_room_cell/instance_fengshui_state 能按 instance_id 分域 upsert 当前快照、删除快照外 stale key，并回读建筑真源、房间快照与风水解释',
          excludes: '不证明完整实例分域恢复/迁移链，也不证明其它 instance_* 专表',
          completionMapping: 'release:proof:with-db.instance-domain-persistence',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRows(pool, instanceId).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, instanceId: string): Promise<void> {
    await pool.query('DELETE FROM instance_tile_cell WHERE instance_id = $1', [instanceId]).catch(() => undefined);
    await pool.query('DELETE FROM instance_tile_resource_state WHERE instance_id = $1', [instanceId]);
    await pool.query('DELETE FROM instance_tile_damage_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_temporary_tile_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_monster_runtime_state WHERE instance_id = $1 OR instance_id = $2', [instanceId, `${instanceId}:monster`]);
  await pool.query('DELETE FROM instance_event_state WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_overlay_chunk WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_fengshui_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_room_cell WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_room_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_building_cell WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_building_state WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_entry WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_timer WHERE instance_id = $1', [instanceId]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_state WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_ground_item WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_checkpoint WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_recovery_watermark WHERE instance_id = $1', [instanceId]);
  await pool.query('DELETE FROM instance_tile_resource_state WHERE instance_id = $1', [`${instanceId}:legacy`]);
  await pool.query('DELETE FROM instance_ground_item WHERE instance_id = $1', [`${instanceId}:legacy`]);
  await pool.query('DELETE FROM instance_container_entry WHERE instance_id = $1', [`${instanceId}:legacy`]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_timer WHERE instance_id = $1', [`${instanceId}:legacy`]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_state WHERE instance_id = $1', [`${instanceId}:legacy`]);
  await pool.query('DELETE FROM instance_checkpoint WHERE instance_id = $1', [`${instanceId}:legacy`]);
  await pool.query('DELETE FROM instance_recovery_watermark WHERE instance_id = $1', [`${instanceId}:legacy`]);
}

async function assertBuildingRoomFengShuiSnapshotUsesStaleKeyPruning(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      queries.push(sql);
      return { rows: [] };
    },
    release() {
      return undefined;
    },
  };
  const service = new InstanceDomainPersistenceService(null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.saveBuildingRoomFengShuiState('instance:fake', {
    buildings: [
      {
        id: 'building:guard:1',
        defId: 'stone_wall',
        x: 1,
        y: 2,
        cells: [{ tileIndex: 12, x: 1, y: 2 }],
      },
    ],
    rooms: [
      {
        id: 'room:guard:1',
        minX: 0,
        minY: 0,
        maxX: 2,
        maxY: 2,
      },
    ],
    roomCells: [{ roomId: 'room:guard:1', tileIndex: 12, x: 1, y: 2 }],
    fengShui: [{ roomId: 'room:guard:1', score: 1 }],
  });

  const normalizedQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  const forbiddenDeletes = [
    'DELETE FROM instance_building_cell WHERE instance_id = $1',
    'DELETE FROM instance_building_state WHERE instance_id = $1',
    'DELETE FROM instance_room_cell WHERE instance_id = $1',
    'DELETE FROM instance_room_state WHERE instance_id = $1',
    'DELETE FROM instance_fengshui_state WHERE instance_id = $1',
  ];
  for (const forbidden of forbiddenDeletes) {
    assert.equal(
      normalizedQueries.some((query) => query === forbidden),
      false,
      `building/room/fengshui snapshot emitted forbidden whole-domain delete: ${forbidden}`,
    );
  }
  for (const tableName of [
    'instance_building_state',
    'instance_building_cell',
    'instance_room_state',
    'instance_room_cell',
    'instance_fengshui_state',
  ]) {
    assert.equal(
      normalizedQueries.some((query) => query.includes(`DELETE FROM ${tableName} target`)
        && query.includes('jsonb_to_recordset')
        && query.includes('NOT EXISTS')),
      true,
      `building/room/fengshui snapshot missing stale-key delete guard for ${tableName}`,
    );
  }
}

async function assertContainerAndOverlaySnapshotsUseStaleKeyPruning(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      queries.push(sql);
      return { rows: [] };
    },
    release() {
      return undefined;
    },
  };
  const service = new InstanceDomainPersistenceService(null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.replaceContainerStates('instance:fake', [
    {
      containerId: 'container:fake:1',
      sourceId: 'container:instance:fake:container:fake:1',
      generatedAtTick: 1,
      refreshAtTick: 2,
      entries: [{ item: { itemId: 'grass', count: 1 }, createdTick: 1, visible: true }],
    },
  ]);
  await service.replaceOverlayChunks('instance:fake', [
    {
      patchKind: 'tile',
      chunkKey: 'tile:0:0',
      patchVersion: 1,
      patchPayload: { tiles: [{ x: 0, y: 0 }] },
    },
  ]);

  const normalizedQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  const forbiddenDeletes = [
    'DELETE FROM instance_container_entry WHERE instance_id = $1',
    'DELETE FROM instance_container_timer WHERE instance_id = $1',
    'DELETE FROM instance_container_state WHERE instance_id = $1',
    'DELETE FROM instance_overlay_chunk WHERE instance_id = $1',
  ];
  for (const forbidden of forbiddenDeletes) {
    assert.equal(
      normalizedQueries.some((query) => query === forbidden),
      false,
      `container/overlay snapshot emitted forbidden whole-domain delete: ${forbidden}`,
    );
  }
  for (const tableName of [
    'instance_container_state',
    'instance_container_timer',
    'instance_container_entry',
    'instance_overlay_chunk',
  ]) {
    assert.equal(
      normalizedQueries.some((query) => query.includes(`DELETE FROM ${tableName} target`)
        && query.includes('jsonb_to_recordset')
        && query.includes('NOT EXISTS')),
      true,
      `container/overlay snapshot missing stale-key delete guard for ${tableName}`,
    );
  }
}

async function assertInstanceStateSnapshotsUseStaleKeyPruning(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      queries.push(sql);
      return { rows: [] };
    },
    release() {
      return undefined;
    },
  };
  const service = new InstanceDomainPersistenceService(null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.saveTileResourceDiffs('instance:fake', [
    { resourceKey: 'qi', tileIndex: 1, value: 3 },
  ]);
  await service.saveTileDamageStates('instance:fake', [
    { tileIndex: 2, x: 1, y: 1, hp: 7, maxHp: 10, destroyed: false },
  ]);
  await service.replaceRuntimeTileCells('instance:fake', [
    { x: 1, y: 2, tileType: 'floor', terrainType: 'floor' },
  ]);
  await service.replaceTemporaryTileStates('instance:fake', [
    { tileIndex: 3, x: 1, y: 3, tileType: 'stone', hp: 5, maxHp: 5, expiresAtTick: 10 },
  ]);
  await service.replaceGroundItems('instance:fake', [
    { tileIndex: 4, items: [{ itemId: 'grass', count: 1 }] },
  ]);

  const normalizedQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  const forbiddenDeletes = [
    'DELETE FROM instance_tile_resource_state WHERE instance_id = $1',
    'DELETE FROM instance_tile_damage_state WHERE instance_id = $1',
    'DELETE FROM instance_tile_cell WHERE instance_id = $1',
    'DELETE FROM instance_temporary_tile_state WHERE instance_id = $1',
    'DELETE FROM instance_ground_item WHERE instance_id = $1',
  ];
  for (const forbidden of forbiddenDeletes) {
    assert.equal(
      normalizedQueries.some((query) => query === forbidden),
      false,
      `instance state snapshot emitted forbidden whole-domain delete: ${forbidden}`,
    );
  }
  for (const tableName of [
    'instance_tile_resource_state',
    'instance_tile_damage_state',
    'instance_tile_cell',
    'instance_temporary_tile_state',
    'instance_ground_item',
  ]) {
    assert.equal(
      normalizedQueries.some((query) => query.includes(`DELETE FROM ${tableName} target`)
        && query.includes('jsonb_to_recordset')
        && query.includes('NOT EXISTS')),
      true,
      `instance state snapshot missing stale-key delete guard for ${tableName}`,
    );
  }
}

function projectLegacyInstanceSnapshot(snapshot, instanceId) {
  const tileResourceEntries = Array.isArray(snapshot?.tileResourceEntries)
    ? snapshot.tileResourceEntries
        .filter((entry) => entry && typeof entry.resourceKey === 'string' && Number.isFinite(Number(entry.tileIndex)) && Number.isFinite(Number(entry.value)))
        .map((entry) => ({
          resourceKey: entry.resourceKey,
          tileIndex: Math.trunc(Number(entry.tileIndex)),
          value: Math.max(0, Math.trunc(Number(entry.value))),
        }))
    : Array.isArray(snapshot?.auraEntries)
      ? snapshot.auraEntries
          .filter((entry) => entry && Number.isFinite(Number(entry.tileIndex)) && Number.isFinite(Number(entry.value)))
          .map((entry) => ({
            resourceKey: 'aura.refined.neutral',
            tileIndex: Math.trunc(Number(entry.tileIndex)),
            value: Math.max(0, Math.trunc(Number(entry.value))),
          }))
      : [];
  const checkpoint = {
    kind: 'migrated_from_map_snapshot',
    templateId: snapshot?.templateId ?? null,
    savedAt: snapshot?.savedAt ?? null,
  };
  const recoveryWatermark = {
    catalogVersion: Number.isFinite(Number(snapshot?.savedAt)) ? Math.trunc(Number(snapshot.savedAt)) : Date.now(),
    recoveryVersion: Number.isFinite(Number(snapshot?.savedAt)) ? Math.trunc(Number(snapshot.savedAt)) : Date.now(),
    checkpointKind: 'migrated_from_map_snapshot',
  };
  const groundItems = Array.isArray(snapshot?.groundPileEntries)
    ? snapshot.groundPileEntries.flatMap((pile) => {
        if (!pile || !Number.isFinite(Number(pile.tileIndex)) || !Array.isArray(pile.items)) {
          return [];
        }
        const tileIndex = Math.trunc(Number(pile.tileIndex));
        return pile.items
          .map((item) => normalizeLegacyGroundItem(item))
          .filter((item) => Boolean(item))
          .map((item) => ({
            groundItemId: `ground:${instanceId}:${tileIndex}:${item.itemId}`,
            instanceId,
            tileIndex,
            itemPayload: item,
            expireAt: null,
          }));
      })
    : [];
  const containerStates = Array.isArray(snapshot?.containerStates)
    ? snapshot.containerStates
        .filter((entry) => entry && typeof entry.containerId === 'string')
        .map((entry) => {
          const containerId = entry.containerId;
          const sourceId = entry.sourceId ?? entry.containerId;
          const statePayload = entry.statePayload && typeof entry.statePayload === 'object' ? entry.statePayload : {};
          return {
            instanceId,
            containerId,
            sourceId,
            statePayload: {
              ...statePayload,
              sourceId,
              containerId,
              generatedAtTick: Number.isFinite(Number(statePayload.generatedAtTick)) ? Math.trunc(Number(statePayload.generatedAtTick)) : null,
              refreshAtTick: Number.isFinite(Number(statePayload.refreshAtTick)) ? Math.trunc(Number(statePayload.refreshAtTick)) : null,
              entries: Array.isArray(statePayload.entries) ? statePayload.entries : [],
              activeSearch: statePayload.activeSearch,
            },
          };
        })
    : [];
  const expectedGroundItems = Array.isArray(snapshot?.groundPileEntries)
    ? snapshot.groundPileEntries.flatMap((pile) => {
        if (!pile || !Array.isArray(pile.items)) {
          return [];
        }
        return pile.items
          .map((item) => normalizeLegacyGroundItem(item))
          .filter((item) => Boolean(item))
          .map((item) => ({
            groundItemId: `ground:${instanceId}:${Math.trunc(Number(pile.tileIndex))}:${item.itemId}`,
            instanceId,
            tileIndex: Math.trunc(Number(pile.tileIndex)),
            itemPayload: item,
            expireAt: null,
          }));
      })
    : [];
  return {
    tileResourceEntries,
    checkpoint,
    recoveryWatermark,
    groundItems,
    expectedGroundItems,
    containerStates,
  };
}

function normalizeLegacyGroundItem(item) {
  if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
    return null;
  }
  return {
    itemId: item.itemId.trim(),
    count: Number.isFinite(Number(item.count)) ? Math.max(1, Math.trunc(Number(item.count))) : 1,
    name: typeof item.name === 'string' ? item.name : undefined,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
