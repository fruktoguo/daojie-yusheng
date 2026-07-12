import {
  ARTIFACT_SLOTS,
  DEFAULT_BASE_ATTRS,
  EQUIP_SLOTS,
} from '@mud/shared';

import { isLegacyItemInstanceId } from '../../runtime/world/item-instance-id.helpers';
import { resolvePlayerDisplayName } from '../../runtime/player/player-display-name';

const RAW_BASE_ATTRS_PERSISTENCE_MARKER = '__rawBaseAttrs';

export interface ManagedAccountEntryLike {
  userId?: string;
  username?: string;
  playerNo?: number | null;
  playerName?: string | null;
  displayName?: string | null;
  createdAt?: string;
  totalOnlineSeconds?: number;
  currentOnlineStartedAt?: string;
  registerIp?: string | null;
  lastLoginIp?: string | null;
  lastLoginAt?: string | null;
  registerDeviceId?: string | null;
  lastLoginDeviceId?: string | null;
  bannedAt?: string | null;
  banReason?: string | null;
  bannedBy?: string | null;
  isRiskAdmin?: boolean;
}

export interface RecoveryPillMigrationSummary {
  inventoryStacksMigrated: number;
  inventoryItemsMigrated: number;
  marketStorageStacksMigrated: number;
  marketStorageItemsMigrated: number;
  equipmentMigrated: number;
}

const RECOVERY_PILL_MIGRATION_TARGETS: Record<string, string> = {
  pure_yang_pill: 'recovery_powder',
  'pill.nurturing_paste': 'stabilizing_pellet',
  'pill.cleartide_powder': 'recovery_powder',
  'pill.earthrest_paste': 'stabilizing_pellet',
};

export function asGmItemRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeGmItemString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeStableGmItemInstanceId(value: unknown): string | null {
  const normalized = normalizeGmItemString(value);
  if (!normalized || isLegacyItemInstanceId(normalized)) {
    return null;
  }
  return normalized;
}

export function writeGmItemOwnProperty(
  item: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(item, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

export function createEmptyRecoveryPillMigrationSummary(): RecoveryPillMigrationSummary {
  return {
    inventoryStacksMigrated: 0,
    inventoryItemsMigrated: 0,
    marketStorageStacksMigrated: 0,
    marketStorageItemsMigrated: 0,
    equipmentMigrated: 0,
  };
}

export function hasRecoveryPillMigration(summary: RecoveryPillMigrationSummary): boolean {
  return summary.inventoryStacksMigrated > 0
    || summary.marketStorageStacksMigrated > 0
    || summary.equipmentMigrated > 0;
}

export function isLegacyRecoveryPillItemId(itemId: unknown): boolean {
  return typeof itemId === 'string'
    && Object.prototype.hasOwnProperty.call(RECOVERY_PILL_MIGRATION_TARGETS, itemId.trim());
}

export function resolveRecoveryPillMigrationTarget(itemId: unknown): string | null {
  if (!isLegacyRecoveryPillItemId(itemId)) {
    return null;
  }
  return RECOVERY_PILL_MIGRATION_TARGETS[String(itemId).trim()] ?? null;
}

export function addRecoveryPillMigrationSummary(
  target: RecoveryPillMigrationSummary,
  source: RecoveryPillMigrationSummary,
): void {
  target.inventoryStacksMigrated += source.inventoryStacksMigrated;
  target.inventoryItemsMigrated += source.inventoryItemsMigrated;
  target.marketStorageStacksMigrated += source.marketStorageStacksMigrated;
  target.marketStorageItemsMigrated += source.marketStorageItemsMigrated;
  target.equipmentMigrated += source.equipmentMigrated;
}

export function buildManagedAccountView(account: ManagedAccountEntryLike | null | undefined, online: boolean) {
  if (!account?.userId || !account.username) {
    return undefined;
  }

  let totalOnlineSeconds = Number.isFinite(account.totalOnlineSeconds)
    ? Math.max(0, Math.trunc(account.totalOnlineSeconds as number))
    : 0;
  if (online && typeof account.currentOnlineStartedAt === 'string' && account.currentOnlineStartedAt) {
    const sessionStartedAt = Date.parse(account.currentOnlineStartedAt);
    if (Number.isFinite(sessionStartedAt)) {
      totalOnlineSeconds += Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
    }
  }

  return {
    userId: account.userId,
    playerNo: normalizeOptionalPlayerNo(account.playerNo),
    username: account.username,
    createdAt: typeof account.createdAt === 'string' && account.createdAt ? account.createdAt : new Date(0).toISOString(),
    totalOnlineSeconds,
    isRiskAdmin: account.isRiskAdmin === true,
    status: account.bannedAt ? 'banned' : 'active',
    bannedAt: account.bannedAt ?? undefined,
    banReason: account.banReason ?? undefined,
    bannedBy: account.bannedBy ?? undefined,
    lastLoginAt: account.lastLoginAt ?? undefined,
    lastLoginIp: account.lastLoginIp ?? undefined,
    lastLoginDeviceId: account.lastLoginDeviceId ?? undefined,
  };
}

function normalizeOptionalPlayerNo(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
}

export function resolveManagedPlayerName(player: any, account: ManagedAccountEntryLike | null | undefined, fallback: string): string {
  return resolvePlayerDisplayName({
    playerId: player?.id,
    playerName: account?.playerName,
    name: player?.name,
    displayName: account?.displayName ?? player?.displayName,
    username: account?.username,
  }, { fallback });
}

export function resolveManagedPlayerDisplayName(player: any, account: ManagedAccountEntryLike | null | undefined, fallback: string): string {
  return resolvePlayerDisplayName({
    playerId: player?.id,
    displayName: account?.displayName ?? player?.displayName,
    playerName: account?.playerName,
    name: player?.name,
  }, { fallback });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRawBaseAttrs(source: unknown): Record<string, number> {
  const attrs: Record<string, number> = { ...DEFAULT_BASE_ATTRS };
  if (!source || typeof source !== 'object') {
    return attrs;
  }
  const record = source as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_BASE_ATTRS)) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) {
      attrs[key] = Math.max(0, Math.trunc(value));
    }
  }
  return attrs;
}

export function encodePersistedRawBaseAttrs(source: unknown): Record<string, number | boolean> {
  return {
    ...normalizeRawBaseAttrs(source),
    [RAW_BASE_ATTRS_PERSISTENCE_MARKER]: true,
  };
}

export function decodePersistedRawBaseAttrs(source: unknown): Record<string, number> {
  if (
    !source
    || typeof source !== 'object'
    || (source as Record<string, unknown>)[RAW_BASE_ATTRS_PERSISTENCE_MARKER] !== true
  ) {
    return { ...DEFAULT_BASE_ATTRS };
  }
  return normalizeRawBaseAttrs(source);
}

function createEmptyLegacyArtifactSlot(slot: string) {
  return {
    slot,
    unlocked: false,
    enabled: false,
    qi: 0,
    maxQi: 0,
    item: null,
  };
}

export function toLegacyArtifactSlots(artifacts: any) {
  const slots = Array.isArray(artifacts?.slots) ? artifacts.slots : [];
  const bySlot = new Map(slots.map((entry: any) => [entry.slot, entry]));
  return {
    revision: Number.isFinite(artifacts?.revision) ? Math.max(0, Math.trunc(artifacts.revision)) : 1,
    slots: ARTIFACT_SLOTS.map((slot) => {
      const entry = bySlot.get(slot) ?? null;
      if (!entry || typeof entry !== 'object') {
        return createEmptyLegacyArtifactSlot(slot);
      }
      const record = entry as Record<string, any>;
      return {
        slot,
        unlocked: record.unlocked === true,
        enabled: record.enabled === true,
        qi: Number.isFinite(record.qi) ? Math.max(0, Math.trunc(record.qi)) : 0,
        maxQi: Number.isFinite(record.maxQi) ? Math.max(0, Math.trunc(record.maxQi)) : 0,
        item: record.item ? { ...record.item } : null,
      };
    }),
  };
}

export function toLegacyEquipmentSlots(slots: any) {
  const bySlot = new Map(
    (Array.isArray(slots) ? slots : []).map((entry: any) => [entry.slot, entry.item ? { ...entry.item } : null]),
  );
  return Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, bySlot.get(slot) ?? null]));
}

export function cloneRatioDivisors(source: any) {
  return {
    dodge: source.dodge,
    crit: source.crit,
    breakPower: source.breakPower,
    resolvePower: source.resolvePower,
    cooldownSpeed: source.cooldownSpeed,
    moveSpeed: source.moveSpeed,
    elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
  };
}
