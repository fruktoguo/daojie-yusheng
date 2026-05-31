/**
 * 本文件定义服务端网络包体专项 smoke，用于证明地面掉落增量删除补丁不再携带冗余坐标。
 */
import assert from 'node:assert/strict';
import {
  decodeMessage,
  encodeMessage,
  fromWireTick,
  tickPayloadType,
  toWireTick,
  type GroundItemEntryView,
} from '@mud/shared';
import { diffGroundPiles } from '../network/projector-diff';
import type { ProjectedGroundPileEntry } from '../network/projector-types';

function buildGroundPile(x: number, y: number, count: number): ProjectedGroundPileEntry {
  const item: GroundItemEntryView = {
    itemKey: 'ore',
    itemId: 'ore',
    name: '灵矿',
    type: 'material',
    count,
  };
  return {
    x,
    y,
    items: [item],
  };
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function main(): void {
  const previous = new Map<string, ProjectedGroundPileEntry>([
    ['ground:1', buildGroundPile(7, 8, 2)],
  ]);
  const current = new Map<string, ProjectedGroundPileEntry>();

  const removePatches = diffGroundPiles(previous, current);
  assert.equal(removePatches.length, 1);
  assert.deepEqual(removePatches[0], { sourceId: 'ground:1', items: null });
  assert.equal(hasOwn(removePatches[0], 'x'), false);
  assert.equal(hasOwn(removePatches[0], 'y'), false);

  const addPatches = diffGroundPiles(current, previous);
  assert.equal(addPatches.length, 1);
  assert.equal(addPatches[0]?.sourceId, 'ground:1');
  assert.equal(addPatches[0]?.x, 7);
  assert.equal(addPatches[0]?.y, 8);
  assert.equal(addPatches[0]?.items?.[0]?.count, 2);

  const changed = new Map<string, ProjectedGroundPileEntry>([
    ['ground:1', buildGroundPile(7, 8, 3)],
  ]);
  const updatePatches = diffGroundPiles(previous, changed);
  assert.equal(updatePatches.length, 1);
  assert.equal(updatePatches[0]?.x, 7);
  assert.equal(updatePatches[0]?.y, 8);
  assert.equal(updatePatches[0]?.items?.[0]?.count, 3);

  const removeWire = toWireTick({ p: [], e: [], g: removePatches });
  const removeWirePatch = Array.isArray(removeWire.g) ? removeWire.g[0] as Record<string, unknown> : {};
  assert.equal(hasOwn(removeWirePatch, 'x'), false);
  assert.equal(hasOwn(removeWirePatch, 'y'), false);
  assert.equal(removeWirePatch.clearItems, true);

  const decodedRemove = fromWireTick(decodeMessage(tickPayloadType, encodeMessage(tickPayloadType, removeWire)));
  assert.equal(decodedRemove.g?.[0]?.sourceId, 'ground:1');
  assert.equal(decodedRemove.g?.[0]?.items, null);
  assert.equal(hasOwn(decodedRemove.g?.[0] ?? {}, 'x'), false);
  assert.equal(hasOwn(decodedRemove.g?.[0] ?? {}, 'y'), false);

  const addWire = toWireTick({ p: [], e: [], g: addPatches });
  const decodedAdd = fromWireTick(decodeMessage(tickPayloadType, encodeMessage(tickPayloadType, addWire)));
  assert.equal(decodedAdd.g?.[0]?.x, 7);
  assert.equal(decodedAdd.g?.[0]?.y, 8);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-ground-patch-network',
    removePatchBytesBefore: Buffer.byteLength(JSON.stringify({ sourceId: 'ground:1', x: 7, y: 8, items: null }), 'utf8'),
    removePatchBytesAfter: Buffer.byteLength(JSON.stringify(removePatches[0]), 'utf8'),
  }, null, 2));
}

main();
