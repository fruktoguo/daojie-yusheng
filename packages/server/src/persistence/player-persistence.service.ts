import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_INVENTORY_CAPACITY } from '@mud/shared';
import { Pool, type PoolClient } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const PLAYER_SNAPSHOT_TABLE = 'server_next_player_snapshot';

const CREATE_PLAYER_SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_SNAPSHOT_TABLE} (
    player_id varchar(100) PRIMARY KEY,
    template_id varchar(120) NOT NULL,
    instance_id varchar(160),
    persisted_source varchar(32) NOT NULL,
    seeded_at bigint,
    saved_at bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const CREATE_PLAYER_SNAPSHOT_TEMPLATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_snapshot_template_idx
  ON ${PLAYER_SNAPSHOT_TABLE}(template_id)
`;

const CREATE_PLAYER_SNAPSHOT_SOURCE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_snapshot_source_idx
  ON ${PLAYER_SNAPSHOT_TABLE}(persisted_source)
`;

const ALTER_PLAYER_SNAPSHOT_ADD_INSTANCE_ID_SQL = `
  ALTER TABLE ${PLAYER_SNAPSHOT_TABLE}
  ADD COLUMN IF NOT EXISTS instance_id varchar(160)
`;

const CREATE_PLAYER_SNAPSHOT_INSTANCE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_snapshot_instance_idx
  ON ${PLAYER_SNAPSHOT_TABLE}(instance_id)
`;

const PLAYER_SNAPSHOT_META_KEY = '__snapshotMeta';
const PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE = 'native';
const PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED = 'legacy_seeded';
const MAX_PENDING_LOGBOOK_MESSAGES = 200;

type PlayerSnapshotPersistedSource =
  | typeof PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE
  | typeof PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED;

type PendingLogbookKind = 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge';

interface PlayerSnapshotPlacement {
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  facing: number;
}

interface PlayerSnapshotVitals {
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
}

interface PlayerSnapshotProgression {
  foundation: number;
  combatExp: number;
  bodyTraining: Record<string, unknown> | null;
  alchemySkill: Record<string, unknown> | null;
  gatherSkill: Record<string, unknown> | null;
  gatherJob: Record<string, unknown> | null;
  alchemyPresets: unknown[];
  alchemyJob: Record<string, unknown> | null;
  enhancementSkill: Record<string, unknown> | null;
  enhancementSkillLevel: number;
  enhancementJob: Record<string, unknown> | null;
  enhancementRecords: unknown[];
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears: number | null;
  realm: Record<string, unknown> | null;
  heavenGate: Record<string, unknown> | null;
  spiritualRoots: Record<string, unknown> | null;
}

interface PlayerSnapshotInventory {
  revision: number;
  capacity: number;
  items: unknown[];
}

interface PlayerSnapshotEquipment {
  revision: number;
  slots: unknown[];
}

interface PlayerSnapshotTechniques {
  revision: number;
  techniques: unknown[];
  cultivatingTechId: string | null;
}

interface PlayerSnapshotBuffs {
  revision: number;
  buffs: unknown[];
}

interface PlayerSnapshotQuests {
  revision: number;
  entries: unknown[];
}

interface PlayerSnapshotCombat {
  autoBattle: boolean;
  autoRetaliate: boolean;
  autoBattleStationary: boolean;
  combatTargetId: string | null;
  combatTargetLocked: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean;
  autoSwitchCultivation: boolean;
  senseQiActive: boolean;
  autoBattleSkills: unknown[];
}

interface PendingLogbookMessageSnapshot {
  id: string;
  kind: PendingLogbookKind;
  text: string;
  from?: string;
  at: number;
}

interface RuntimeBonusSnapshot {
  source: string;
  label?: string;
  attrs?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  qiProjection?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
}

export interface PersistedPlayerSnapshot {
  version: 1;
  savedAt: number;
  placement: PlayerSnapshotPlacement;
  vitals: PlayerSnapshotVitals;
  progression: PlayerSnapshotProgression;
  unlockedMapIds: string[];
  inventory: PlayerSnapshotInventory;
  equipment: PlayerSnapshotEquipment;
  techniques: PlayerSnapshotTechniques;
  buffs: PlayerSnapshotBuffs;
  quests: PlayerSnapshotQuests;
  combat: PlayerSnapshotCombat;
  pendingLogbookMessages: PendingLogbookMessageSnapshot[];
  runtimeBonuses: RuntimeBonusSnapshot[];
}

interface PersistedPlayerSnapshotPayload extends PersistedPlayerSnapshot {
  [PLAYER_SNAPSHOT_META_KEY]?: {
    persistedSource: PlayerSnapshotPersistedSource;
    seededAt?: number;
  };
}

export interface PersistedPlayerSnapshotRecord {
  snapshot: PersistedPlayerSnapshot;
  persistedSource: PlayerSnapshotPersistedSource;
  seededAt: number | null;
}

interface PersistedPlayerSnapshotRow {
  player_id?: unknown;
  template_id?: unknown;
  instance_id?: unknown;
  persisted_source?: unknown;
  seeded_at?: unknown;
  saved_at?: unknown;
  updated_at?: unknown;
  payload?: unknown;
}

interface SavePlayerSnapshotOptions {
  persistedSource?: PlayerSnapshotPersistedSource;
  seededAt?: number;
}

export interface ListedPlayerSnapshot {
  playerId: string;
  snapshot: PersistedPlayerSnapshot;
  updatedAt: number;
}

@Injectable()
export class PlayerPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('玩家快照持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensurePlayerSnapshotTable(this.pool);
      this.enabled = true;
      this.logger.log('玩家快照持久化已启用（server_next_player_snapshot）');
    } catch (error: unknown) {
      this.logger.error(
        '玩家快照持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async loadPlayerSnapshot(playerId: string): Promise<PersistedPlayerSnapshot | null> {
    const record = await this.loadPlayerSnapshotRecord(playerId);
    return record?.snapshot ?? null;
  }

  async loadPlayerSnapshotRecord(
    playerId: string,
  ): Promise<PersistedPlayerSnapshotRecord | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }

    const result = await this.pool.query<PersistedPlayerSnapshotRow>(
      `
        SELECT
          player_id,
          template_id,
          instance_id,
          persisted_source,
          seeded_at,
          saved_at,
          updated_at,
          payload
        FROM ${PLAYER_SNAPSHOT_TABLE}
        WHERE player_id = $1
        LIMIT 1
      `,
      [playerId],
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }

    const record = normalizePersistedPlayerSnapshotRow(result.rows[0]);
    if (record) {
      return record;
    }

    const message = `Persisted player snapshot record invalid: playerId=${playerId} table=${PLAYER_SNAPSHOT_TABLE}`;
    this.logger.error(message);
    throw new Error(message);
  }

  async listPlayerSnapshots(): Promise<ListedPlayerSnapshot[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }

    const result = await this.pool.query<PersistedPlayerSnapshotRow>(
      `
        SELECT
          player_id,
          template_id,
          instance_id,
          saved_at,
          updated_at,
          payload
        FROM ${PLAYER_SNAPSHOT_TABLE}
        ORDER BY player_id ASC
      `,
    );

    return result.rows
      .map((row): ListedPlayerSnapshot | null => {
        const playerId = typeof row.player_id === 'string' ? row.player_id.trim() : '';
        const record = normalizePersistedPlayerSnapshotRow(row);
        if (!playerId || !record?.snapshot) {
          return null;
        }

        return {
          playerId,
          snapshot: record.snapshot,
          updatedAt: normalizeUpdatedAt(row.updated_at),
        };
      })
      .filter((entry): entry is ListedPlayerSnapshot => entry !== null);
  }

  async savePlayerSnapshot(
    playerId: string,
    snapshot: unknown,
    options: SavePlayerSnapshotOptions | undefined = undefined,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const normalizedSnapshot = normalizePlayerSnapshotPayload(snapshot);
    if (!normalizedSnapshot) {
      return;
    }

    const persistedSource =
      normalizePlayerSnapshotPersistedSource(options?.persistedSource)
      ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE;

    const payload = buildPersistedPlayerSnapshotPayload(normalizedSnapshot, {
      persistedSource,
      seededAt: options?.seededAt,
    });

    await this.pool.query(
      `
        INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
          player_id,
          template_id,
          instance_id,
          persisted_source,
          seeded_at,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
        ON CONFLICT (player_id)
        DO UPDATE SET
          template_id = EXCLUDED.template_id,
          instance_id = EXCLUDED.instance_id,
          persisted_source = EXCLUDED.persisted_source,
          seeded_at = EXCLUDED.seeded_at,
          saved_at = EXCLUDED.saved_at,
          updated_at = now(),
          payload = EXCLUDED.payload
      `,
      [
        playerId,
        normalizedSnapshot.placement.templateId,
        normalizePlayerSnapshotPlacementInstanceId(normalizedSnapshot.placement.instanceId),
        persistedSource,
        Number.isFinite(options?.seededAt) ? Math.max(0, Math.trunc(options.seededAt)) : null,
        Math.max(0, Math.trunc(normalizedSnapshot.savedAt)),
        JSON.stringify(payload),
      ],
    );
  }

  private async safeClosePool(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}

async function ensurePlayerSnapshotTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_PLAYER_SNAPSHOT_TABLE_SQL);
    await client.query(ALTER_PLAYER_SNAPSHOT_ADD_INSTANCE_ID_SQL);
    await client.query(CREATE_PLAYER_SNAPSHOT_TEMPLATE_INDEX_SQL);
    await client.query(CREATE_PLAYER_SNAPSHOT_INSTANCE_INDEX_SQL);
    await client.query(CREATE_PLAYER_SNAPSHOT_SOURCE_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

function normalizePersistedPlayerSnapshotRow(
  row: PersistedPlayerSnapshotRow | null | undefined,
): PersistedPlayerSnapshotRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }

  const record = normalizePlayerSnapshotRecord(row.payload);
  if (!record?.snapshot) {
    return null;
  }

  return {
    snapshot: {
      ...record.snapshot,
      savedAt: normalizeSnapshotSavedAt(row.saved_at, record.snapshot.savedAt),
      placement: {
        ...record.snapshot.placement,
        instanceId:
          normalizePlayerSnapshotPlacementInstanceId(row.instance_id)
          ?? record.snapshot.placement.instanceId
          ?? buildPublicPlayerInstanceId(record.snapshot.placement.templateId),
        templateId:
          typeof row.template_id === 'string' && row.template_id.trim()
            ? row.template_id.trim()
            : record.snapshot.placement.templateId,
      },
    },
    persistedSource:
      normalizePlayerSnapshotPersistedSource(row.persisted_source) ?? record.persistedSource,
    seededAt: normalizeOptionalNonNegativeInteger(row.seeded_at, record.seededAt),
  };
}

function normalizePlayerSnapshotRecord(
  raw: unknown,
): PersistedPlayerSnapshotRecord | null {
  const snapshot = normalizePlayerSnapshotPayload(raw);
  if (!snapshot) {
    return null;
  }

  const meta = resolveSnapshotMeta(raw);
  return {
    snapshot,
    persistedSource:
      normalizePlayerSnapshotPersistedSource(meta?.persistedSource)
      ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE,
    seededAt: normalizeOptionalNonNegativeInteger(meta?.seededAt, null),
  };
}

function normalizePlayerSnapshotPayload(raw: unknown): PersistedPlayerSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const snapshot = raw as Record<string, unknown>;
  const placementInput =
    snapshot.placement && typeof snapshot.placement === 'object'
      ? (snapshot.placement as Record<string, unknown>)
      : null;
  if (snapshot.version !== 1 || typeof placementInput?.templateId !== 'string') {
    return null;
  }

  const normalizedTemplateId = placementInput.templateId.trim();
  if (!normalizedTemplateId) {
    return null;
  }

  const normalizedInstanceId =
    normalizePlayerSnapshotPlacementInstanceId(placementInput.instanceId)
    ?? buildPublicPlayerInstanceId(normalizedTemplateId);

  const vitals = asRecord(snapshot.vitals);
  const inventory = asRecord(snapshot.inventory);
  const equipment = asRecord(snapshot.equipment);
  const techniques = asRecord(snapshot.techniques);
  const buffs = asRecord(snapshot.buffs);
  const quests = asRecord(snapshot.quests);
  const combat = asRecord(snapshot.combat);
  const progression = asRecord(snapshot.progression);

  return {
    version: 1,
    savedAt: isFiniteNumber(snapshot.savedAt) ? Number(snapshot.savedAt) : Date.now(),
    placement: {
      instanceId: normalizedInstanceId,
      templateId: normalizedTemplateId,
      x: isFiniteNumber(placementInput.x) ? Math.trunc(placementInput.x) : 0,
      y: isFiniteNumber(placementInput.y) ? Math.trunc(placementInput.y) : 0,
      facing: isFiniteNumber(placementInput.facing) ? Math.trunc(placementInput.facing) : 1,
    },
    vitals: {
      hp: isFiniteNumber(vitals?.hp) ? Math.trunc(vitals.hp) : 100,
      maxHp: isFiniteNumber(vitals?.maxHp) ? Math.trunc(vitals.maxHp) : 100,
      qi: isFiniteNumber(vitals?.qi) ? Math.trunc(vitals.qi) : 0,
      maxQi: isFiniteNumber(vitals?.maxQi) ? Math.trunc(vitals.maxQi) : 100,
    },
    progression: {
      foundation: isFiniteNumber(progression?.foundation) ? Math.trunc(progression.foundation) : 0,
      combatExp: isFiniteNumber(progression?.combatExp) ? Math.trunc(progression.combatExp) : 0,
      bodyTraining: asRecordOrNull(progression?.bodyTraining),
      alchemySkill: asRecordOrNull(progression?.alchemySkill),
      gatherSkill: asRecordOrNull(progression?.gatherSkill),
      gatherJob: asRecordOrNull(progression?.gatherJob),
      alchemyPresets: Array.isArray(progression?.alchemyPresets) ? progression.alchemyPresets : [],
      alchemyJob: asRecordOrNull(progression?.alchemyJob),
      enhancementSkill: asRecordOrNull(progression?.enhancementSkill),
      enhancementSkillLevel: isFiniteNumber(progression?.enhancementSkillLevel)
        ? Math.max(1, Math.trunc(progression.enhancementSkillLevel))
        : 1,
      enhancementJob: asRecordOrNull(progression?.enhancementJob),
      enhancementRecords: Array.isArray(progression?.enhancementRecords)
        ? progression.enhancementRecords
        : [],
      boneAgeBaseYears: isFiniteNumber(progression?.boneAgeBaseYears)
        ? Math.trunc(progression.boneAgeBaseYears)
        : 16,
      lifeElapsedTicks: isFiniteNumber(progression?.lifeElapsedTicks)
        ? Number(progression.lifeElapsedTicks)
        : 0,
      lifespanYears: isFiniteNumber(progression?.lifespanYears)
        ? Math.trunc(progression.lifespanYears)
        : null,
      realm: asRecordOrNull(progression?.realm),
      heavenGate: asRecordOrNull(progression?.heavenGate),
      spiritualRoots: asRecordOrNull(progression?.spiritualRoots),
    },
    unlockedMapIds: normalizeUnlockedMapIds(snapshot.unlockedMapIds),
    inventory: {
      revision: isFiniteNumber(inventory?.revision) ? Math.trunc(inventory.revision) : 1,
      capacity: isFiniteNumber(inventory?.capacity)
        ? Math.max(DEFAULT_INVENTORY_CAPACITY, Math.trunc(inventory.capacity))
        : DEFAULT_INVENTORY_CAPACITY,
      items: Array.isArray(inventory?.items) ? inventory.items : [],
    },
    equipment: {
      revision: isFiniteNumber(equipment?.revision) ? Math.trunc(equipment.revision) : 1,
      slots: Array.isArray(equipment?.slots) ? equipment.slots : [],
    },
      techniques: {
        revision: isFiniteNumber(techniques?.revision) ? Math.trunc(techniques.revision) : 1,
        techniques: Array.isArray(techniques?.techniques) ? techniques.techniques : [],
        cultivatingTechId:
          typeof techniques?.cultivatingTechId === 'string' || techniques?.cultivatingTechId === null
            ? (techniques.cultivatingTechId as string | null)
            : null,
      },
    buffs: {
      revision: isFiniteNumber(buffs?.revision) ? Math.trunc(buffs.revision) : 1,
      buffs: Array.isArray(buffs?.buffs) ? buffs.buffs : [],
    },
    quests: {
      revision: isFiniteNumber(quests?.revision) ? Math.trunc(quests.revision) : 1,
      entries: Array.isArray(quests?.entries) ? quests.entries : [],
    },
    combat: {
      autoBattle: combat?.autoBattle === true,
      autoRetaliate: combat?.autoRetaliate !== false,
      autoBattleStationary: combat?.autoBattleStationary === true,
      combatTargetId:
        typeof combat?.combatTargetId === 'string' && combat.combatTargetId.trim()
          ? combat.combatTargetId.trim()
          : null,
      combatTargetLocked: combat?.combatTargetLocked === true,
      allowAoePlayerHit: combat?.allowAoePlayerHit === true,
      autoIdleCultivation: combat?.autoIdleCultivation !== false,
      autoSwitchCultivation: combat?.autoSwitchCultivation === true,
      senseQiActive: combat?.senseQiActive === true,
      autoBattleSkills: Array.isArray(combat?.autoBattleSkills) ? combat.autoBattleSkills : [],
    },
    pendingLogbookMessages: normalizePendingLogbookMessages(
      resolveSnapshotArray(snapshot, 'pendingLogbookMessages'),
    ),
    runtimeBonuses: normalizeRuntimeBonuses(resolveSnapshotArray(snapshot, 'runtimeBonuses')),
  };
}

function buildPersistedPlayerSnapshotPayload(
  snapshot: PersistedPlayerSnapshot,
  meta: {
    persistedSource?: PlayerSnapshotPersistedSource;
    seededAt?: number;
  } | null | undefined,
): PersistedPlayerSnapshotPayload {
  const payload: PersistedPlayerSnapshotPayload = {
    ...snapshot,
  };
  payload[PLAYER_SNAPSHOT_META_KEY] = {
    persistedSource:
      normalizePlayerSnapshotPersistedSource(meta?.persistedSource)
      ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE,
  };
  if (Number.isFinite(meta?.seededAt)) {
    payload[PLAYER_SNAPSHOT_META_KEY]!.seededAt = Math.max(0, Math.trunc(meta!.seededAt!));
  }
  return payload;
}

function normalizePlayerSnapshotPersistedSource(
  value: unknown,
): PlayerSnapshotPersistedSource | null {
  if (value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED) {
    return PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED;
  }
  if (value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE) {
    return PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE;
  }
  return null;
}

function normalizePlayerSnapshotPlacementInstanceId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildPublicPlayerInstanceId(templateId: string): string {
  return `public:${templateId}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeRuntimeBonuses(value: unknown[]): RuntimeBonusSnapshot[] {
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry): RuntimeBonusSnapshot => ({
      source: canonicalizeRuntimeBonusSource(entry.source),
      label: typeof entry.label === 'string' ? entry.label : undefined,
      attrs: asRecordOrUndefined(entry.attrs),
      stats: asRecordOrUndefined(entry.stats),
      qiProjection: Array.isArray(entry.qiProjection)
        ? entry.qiProjection
            .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
            .map((item) => ({ ...item }))
        : undefined,
      meta: asRecordOrUndefined(entry.meta),
    }))
    .filter((entry) => entry.source.length > 0);
}

function resolveSnapshotArray(
  snapshot: Record<string, unknown>,
  key: string,
): unknown[] {
  const value = snapshot[key];
  return Array.isArray(value) ? value : [];
}

function canonicalizeRuntimeBonusSource(source: unknown): string {
  const normalized = typeof source === 'string' ? source.trim() : '';
  if (!normalized) {
    return '';
  }
  if (normalized === 'technique:aggregate') {
    return 'runtime:technique_aggregate';
  }
  if (normalized === 'realm:state') {
    return 'runtime:realm_state';
  }
  if (normalized === 'realm:stage') {
    return 'runtime:realm_stage';
  }
  if (normalized === 'heaven_gate:roots') {
    return 'runtime:heaven_gate_roots';
  }
  if (normalized.startsWith('equip:')) {
    return `equipment:${normalized.slice('equip:'.length)}`;
  }
  return normalized;
}

function normalizePendingLogbookMessages(
  value: unknown[],
): PendingLogbookMessageSnapshot[] {
  const normalized: PendingLogbookMessageSnapshot[] = [];
  const indexById = new Map<string, number>();

  for (const entry of value) {
    if (!isPendingLogbookMessage(entry)) {
      continue;
    }

    const candidate: PendingLogbookMessageSnapshot = {
      id: entry.id.trim(),
      kind: normalizePendingLogbookKind(entry.kind),
      text: entry.text.trim(),
      from:
        typeof entry.from === 'string' && entry.from.trim().length > 0
          ? entry.from.trim()
          : undefined,
      at: Math.max(0, Math.trunc(entry.at)),
    };
    if (!candidate.id || !candidate.text) {
      continue;
    }

    const existingIndex = indexById.get(candidate.id);
    if (existingIndex !== undefined) {
      normalized[existingIndex] = candidate;
      continue;
    }
    indexById.set(candidate.id, normalized.length);
    normalized.push(candidate);
  }

  return normalized.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
}

function isPendingLogbookMessage(
  value: unknown,
): value is {
  id: string;
  kind: PendingLogbookKind;
  text: string;
  from?: string;
  at: number;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string'
    && normalizePendingLogbookKind(candidate.kind) === candidate.kind
    && typeof candidate.text === 'string'
    && (candidate.from === undefined || typeof candidate.from === 'string')
    && isFiniteNumber(candidate.at)
  );
}

function normalizePendingLogbookKind(value: unknown): PendingLogbookKind {
  switch (value) {
    case 'system':
    case 'chat':
    case 'quest':
    case 'combat':
    case 'loot':
    case 'grudge':
      return value;
    default:
      return 'grudge';
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return asRecord(value);
}

function asRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return asRecord(value) ?? undefined;
}

function normalizeUnlockedMapIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function normalizeUpdatedAt(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return Date.parse(String(value ?? '')) || 0;
}

function normalizeSnapshotSavedAt(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function normalizeOptionalNonNegativeInteger(value: unknown, fallback: number | null): number | null {
  return isFiniteNumber(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function resolveSnapshotMeta(raw: unknown): { persistedSource?: unknown; seededAt?: unknown } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const meta = (raw as Record<string, unknown>)[PLAYER_SNAPSHOT_META_KEY];
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}
