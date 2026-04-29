import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证实例分域专表可落地 tile resource diff、行级 tile_resource/tile_damage/ground_item/monster_runtime delta、带坐标的 tile damage state 与技能生成 temporary tile state，并可按 instance_id 读回',
          excludes: '不证明完整实例分域恢复/迁移链，也不证明其它 instance_* 专表',
          completionMapping: 'replace-ready:proof:with-db.instance-domain-persistence',
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
      { x: 3, y: 4, tileType: 'floor' },
      { x: -2, y: 7, tileType: 'stone' },
    ]);
    const runtimeTileCells = await service.loadRuntimeTileCells(instanceId);
    assert.deepEqual(runtimeTileCells, [
      { x: 3, y: 4, tileType: 'floor' },
      { x: -2, y: 7, tileType: 'stone' },
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
      itemPayload: { itemId: 'rat_tail', count: 3 },
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
          { itemId: 'rat_tail', count: 4 },
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
    })), [
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
        activeSearch: {
          itemKey: 'spirit_grass',
          totalTicks: 5,
          remainingTicks: 3,
        },
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
            item: { itemId: 'old_grass', count: 1 },
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
            item: { itemId: 'new_grass', count: 2 },
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
      statePayload: {
        buffs: [{ buffId: 'doom', remainingTicks: 12 }],
        attackReadyTick: 77,
      },
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
        statePayload: {
          buffs: [{ buffId: 'doom', remainingTicks: 9 }],
          attackReadyTick: 88,
        },
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
      statePayload: {
        opened: true,
        x: 7,
        y: 11,
      },
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
      patchPayload: {
        tiles: [
          { x: 0, y: 0, aura: 12 },
          { x: 1, y: 0, aura: 8 },
        ],
      },
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
        patchKind: 'portal',
        chunkKey: 'runtime_portals',
        patchVersion: 4,
        patchPayload: { version: 1, portals: [{ x: 1, y: 1, targetMapId: 'sect_domain' }] },
      },
    ]);
    const overlayChunksAfterReplace = await service.loadOverlayChunks(instanceId);
    assert.equal(overlayChunksAfterReplace.length, 1);
    assert.equal(overlayChunksAfterReplace[0]?.patchKind, 'portal');
    await service.replaceOverlayChunks(instanceId, []);
    const overlayChunksAfterReplaceClear = await service.loadOverlayChunks(instanceId);
    assert.equal(overlayChunksAfterReplaceClear.length, 0);

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
          answers: 'with-db 下已验证 instance_tile_cell 可按 instance_id/x/y 落地和回读动态地块，instance_tile_resource_state 可按 instance_id/resource_key/tile_index 落地、delta upsert/delete 并回读 tile resource diff，instance_tile_damage_state 可按 instance_id/tile_index 落地、delta upsert/delete、按 x/y 回读动态地块坐标、清空并回读地块损坏状态，instance_temporary_tile_state 可按 instance_id/tile_index 落地、回读并清空技能生成临时地块，instance_checkpoint 可按 instance_id 存储/读取冷启动 checkpoint，instance_recovery_watermark 也可按 instance_id 存储/读取恢复水位，instance_ground_item 也能按 ground_item_id 落地/删除、按 tile delta 替换并按 instance_id 回读，instance_container_state/entry/timer 能按 instance_id/container_id 拆表落地、重建回读并删除，instance_monster_runtime_state 也能只给高价值怪物写入、delta upsert/delete 并按 instance_id 回读，低价值怪物会被拒绝落库，instance_event_state 也能按 event_id/instance_id 落地、回读并删除，instance_overlay_chunk 也能按 instance_id/patch_kind/chunk_key 落地、回读并删除',
          excludes: '不证明完整实例分域恢复/迁移链，也不证明其它 instance_* 专表',
          completionMapping: 'replace-ready:proof:with-db.instance-domain-persistence',
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
