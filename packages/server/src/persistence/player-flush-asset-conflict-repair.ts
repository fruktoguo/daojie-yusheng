/**
 * 本文件属于持久化恢复边界，只修复 durable 玩家背包 payload 中的技术实例 ID 冲突。
 * 只有物品模板与完整持久化实例态都一致时才允许换 ID，无法证明等价时继续保留隔离。
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { buildPersistedInventoryItemRawPayload } from './inventory-item-persistence';

export interface PlayerInventoryOwnershipConflict {
  itemInstanceId: string;
  ownerPlayerId: string;
  itemId: string;
  rawPayload: Record<string, unknown>;
  lockedBy: string | null;
}

export interface PlayerInventoryItemInstanceIdRemap {
  previousItemInstanceId: string;
  nextItemInstanceId: string;
  ownerPlayerId: string;
  itemId: string;
}

export interface PlayerInventoryOwnershipConflictRepairResult {
  canReleaseQuarantine: boolean;
  payloadJson: unknown;
  remaps: PlayerInventoryItemInstanceIdRemap[];
  unresolvedItemInstanceIds: string[];
}

export function listPlayerInventoryPayloadItemInstanceIds(payloadJson: unknown): string[] {
  const items = resolveInventoryPayloadItems(payloadJson);
  if (!items) {
    return [];
  }
  const ids = new Set<string>();
  for (const item of items) {
    const itemInstanceId = normalizeString(asRecord(item)?.itemInstanceId);
    if (itemInstanceId) {
      ids.add(itemInstanceId);
    }
  }
  return Array.from(ids).sort();
}

/**
 * 将已被其他玩家占用、但物品实例态完全相同的 ID 换成新 UUID。
 *
 * 数据库当前持有人始终优先；这里不转移、不删除任何已落库资产，只为待重放 payload
 * 建立新的独立行身份。任一冲突无法证明等价时整份 payload 保持原样，避免半修复。
 */
export function repairPlayerInventoryOwnershipConflictPayload(
  payloadJson: unknown,
  conflicts: readonly PlayerInventoryOwnershipConflict[],
  createItemInstanceId: () => string = randomUUID,
): PlayerInventoryOwnershipConflictRepairResult {
  const items = resolveInventoryPayloadItems(payloadJson);
  if (!items) {
    return unresolvedRepairResult(payloadJson, conflicts.map(({ itemInstanceId }) => itemInstanceId));
  }
  if (conflicts.length === 0) {
    return {
      canReleaseQuarantine: true,
      payloadJson,
      remaps: [],
      unresolvedItemInstanceIds: [],
    };
  }

  const conflictsById = new Map(
    conflicts
      .map((conflict) => [normalizeString(conflict.itemInstanceId), conflict] as const)
      .filter(([itemInstanceId]) => itemInstanceId.length > 0),
  );
  const payloadItemsById = new Map<string, Record<string, unknown>[]>();
  const usedIds = new Set<string>();
  for (const itemValue of items) {
    const item = asRecord(itemValue);
    const itemInstanceId = normalizeString(item?.itemInstanceId);
    if (!item || !itemInstanceId) {
      continue;
    }
    usedIds.add(itemInstanceId);
    const matches = payloadItemsById.get(itemInstanceId) ?? [];
    matches.push(item);
    payloadItemsById.set(itemInstanceId, matches);
  }

  const unresolved = new Set<string>();
  for (const [itemInstanceId, conflict] of conflictsById) {
    const matches = payloadItemsById.get(itemInstanceId) ?? [];
    if (matches.length === 0 || matches.some((item) => !isSafeIdentityOnlyConflict(item, conflict))) {
      unresolved.add(itemInstanceId);
    }
  }
  if (unresolved.size > 0) {
    return unresolvedRepairResult(payloadJson, Array.from(unresolved));
  }

  const remapsById = new Map<string, PlayerInventoryItemInstanceIdRemap>();
  for (const [itemInstanceId, conflict] of conflictsById) {
    const nextItemInstanceId = createUniqueItemInstanceId(usedIds, createItemInstanceId);
    if (!nextItemInstanceId) {
      unresolved.add(itemInstanceId);
      continue;
    }
    usedIds.add(nextItemInstanceId);
    remapsById.set(itemInstanceId, {
      previousItemInstanceId: itemInstanceId,
      nextItemInstanceId,
      ownerPlayerId: conflict.ownerPlayerId,
      itemId: conflict.itemId,
    });
  }
  if (unresolved.size > 0) {
    return unresolvedRepairResult(payloadJson, Array.from(unresolved));
  }

  const nextItems = items.map((itemValue) => {
    const item = asRecord(itemValue);
    const itemInstanceId = normalizeString(item?.itemInstanceId);
    const remap = itemInstanceId ? remapsById.get(itemInstanceId) : undefined;
    if (!item || !remap) {
      return itemValue;
    }
    const rawPayload = asRecord(item.rawPayload);
    return {
      ...item,
      itemInstanceId: remap.nextItemInstanceId,
      ...(rawPayload && Object.prototype.hasOwnProperty.call(rawPayload, 'itemInstanceId')
        ? { rawPayload: { ...rawPayload, itemInstanceId: remap.nextItemInstanceId } }
        : {}),
    };
  });
  const payload = asRecord(payloadJson)!;
  const snapshot = asRecord(payload.snapshot)!;
  const inventory = asRecord(snapshot.inventory)!;
  return {
    canReleaseQuarantine: true,
    payloadJson: {
      ...payload,
      snapshot: {
        ...snapshot,
        inventory: {
          ...inventory,
          items: nextItems,
        },
      },
    },
    remaps: Array.from(remapsById.values()).sort((left, right) => (
      left.previousItemInstanceId < right.previousItemInstanceId ? -1 : 1
    )),
    unresolvedItemInstanceIds: [],
  };
}

function resolveInventoryPayloadItems(payloadJson: unknown): unknown[] | null {
  const payload = asRecord(payloadJson);
  const snapshot = asRecord(payload?.snapshot);
  const inventory = asRecord(snapshot?.inventory);
  return payload?.kind === 'player_snapshot_projection' && Array.isArray(inventory?.items)
    ? inventory.items
    : null;
}

function isSafeIdentityOnlyConflict(
  item: Record<string, unknown>,
  conflict: PlayerInventoryOwnershipConflict,
): boolean {
  const itemId = normalizeString(item.itemId);
  const lockedBy = normalizeString(item.lockedBy);
  if (!itemId || itemId !== normalizeString(conflict.itemId) || lockedBy || conflict.lockedBy) {
    return false;
  }
  const rawPayload = asRecord(item.rawPayload);
  const persistedPayload = buildPersistedInventoryItemRawPayload({
    itemId,
    count: item.count,
    name: item.name,
    desc: item.desc,
    enhanceLevel: item.enhanceLevel,
    learnTechniqueId: item.learnTechniqueId,
    learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
    grade: item.grade,
    level: item.level,
    rawPayload,
  });
  return isDeepStrictEqual(persistedPayload, conflict.rawPayload);
}

function createUniqueItemInstanceId(usedIds: Set<string>, createItemInstanceId: () => string): string | null {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = normalizeString(createItemInstanceId());
    if (candidate && !candidate.includes(':') && !usedIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function unresolvedRepairResult(
  payloadJson: unknown,
  itemInstanceIds: readonly string[],
): PlayerInventoryOwnershipConflictRepairResult {
  return {
    canReleaseQuarantine: false,
    payloadJson,
    remaps: [],
    unresolvedItemInstanceIds: Array.from(new Set(itemInstanceIds.map(normalizeString).filter(Boolean))).sort(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
