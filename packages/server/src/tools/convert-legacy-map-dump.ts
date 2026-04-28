import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const LEGACY_INSTANCE_SCOPES = new Set(['server_next_map_aura_v1', 'server_map_aura_v1']);

const INSTANCE_DOMAIN_TABLE_ORDER = [
  'instance_tile_resource_state',
  'instance_tile_cell',
  'instance_tile_damage_state',
  'instance_temporary_tile_state',
  'instance_ground_item',
  'instance_container_state',
  'instance_container_entry',
  'instance_container_timer',
  'instance_monster_runtime_state',
  'instance_event_state',
  'instance_overlay_chunk',
  'instance_checkpoint',
  'instance_recovery_watermark',
];

type JsonRecord = Record<string, unknown>;

type LegacyDocument = {
  scope: string;
  key: string;
  payload: unknown;
  updatedAt: string;
};

type ProjectionContext = {
  instanceId: string;
  snapshot: JsonRecord;
  updatedAt: string;
};

type StructuredTable = {
  tableName: string;
  rowCount: number;
  checksumSha256: string;
  rows: JsonRecord[];
};

type Args = {
  input: string;
  output: string | null;
  instanceIds: Set<string>;
  pretty: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: '',
    output: null,
    instanceIds: new Set(),
    pretty: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--compact') {
      args.pretty = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--input' || arg === '-i') {
      args.input = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      args.output = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
      continue;
    }
    if (arg === '--instance-id') {
      addInstanceIds(args.instanceIds, argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg.startsWith('--instance-id=')) {
      addInstanceIds(args.instanceIds, arg.slice('--instance-id='.length));
      continue;
    }
  }
  if (!args.input.trim()) {
    throw new Error('missing --input <legacy-dump.json>');
  }
  return args;
}

function printUsage(): void {
  process.stdout.write([
    'Usage: node dist/tools/convert-legacy-map-dump.js --input legacy.json [--output instance-domain.json]',
    '',
    'Input accepts:',
    '  - GM JSON backup with docs[]',
    '  - array of persistent_documents rows',
    '  - single persistent_documents row',
    '  - object keyed by instanceId with legacy map snapshot payloads',
    '',
    'The script only writes a converted JSON file/stdout. It does not connect to the database.',
  ].join('\n'));
  process.stdout.write('\n');
}

function addInstanceIds(target: Set<string>, value: string): void {
  for (const part of String(value ?? '').split(',')) {
    const normalized = part.trim();
    if (normalized) {
      target.add(normalized);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputText = await readFile(args.input, 'utf8');
  const input = JSON.parse(inputText);
  const docs = extractLegacyDocuments(input);
  const contexts = docs
    .map((doc) => toProjectionContext(doc))
    .filter((entry): entry is ProjectionContext => Boolean(entry))
    .filter((entry) => args.instanceIds.size === 0 || args.instanceIds.has(entry.instanceId));
  const rowsByTable = new Map<string, JsonRecord[]>();
  for (const tableName of INSTANCE_DOMAIN_TABLE_ORDER) {
    rowsByTable.set(tableName, []);
  }
  const instances: JsonRecord[] = [];
  for (const context of contexts) {
    const projected = projectInstanceSnapshot(context);
    instances.push(projected.summary);
    for (const [tableName, rows] of projected.rowsByTable.entries()) {
      rowsByTable.get(tableName)?.push(...rows);
    }
  }
  const tables = INSTANCE_DOMAIN_TABLE_ORDER
    .map((tableName) => buildStructuredTable(tableName, rowsByTable.get(tableName) ?? []))
    .filter((table) => table.rowCount > 0);
  const output = {
    kind: 'server_instance_domain_dump_v1',
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      input: args.input,
      legacyDocuments: docs.length,
      convertedInstances: contexts.length,
    },
    importOrder: INSTANCE_DOMAIN_TABLE_ORDER,
    tablesCount: tables.length,
    tablesChecksumSha256: computeTablesChecksum(tables),
    tables,
    instances,
  };
  const serialized = JSON.stringify(output, null, args.pretty ? 2 : 0);
  if (args.output && args.output.trim()) {
    await writeFile(args.output, `${serialized}\n`, 'utf8');
    process.stdout.write(JSON.stringify({
      ok: true,
      output: args.output,
      convertedInstances: contexts.length,
      legacyDocuments: docs.length,
      tables: tables.map((table) => ({ tableName: table.tableName, rowCount: table.rowCount })),
    }, null, 2));
    process.stdout.write('\n');
    return;
  }
  process.stdout.write(serialized);
  process.stdout.write('\n');
}

function extractLegacyDocuments(input: unknown): LegacyDocument[] {
  const docs: LegacyDocument[] = [];
  const record = asRecord(input);
  if (Array.isArray(input)) {
    docs.push(...input.map((entry) => normalizeDocumentEntry(entry)).filter((entry): entry is LegacyDocument => Boolean(entry)));
  }
  if (record) {
    for (const key of ['docs', 'persistentDocuments', 'documents']) {
      const entries = record[key];
      if (Array.isArray(entries)) {
        docs.push(...entries.map((entry) => normalizeDocumentEntry(entry)).filter((entry): entry is LegacyDocument => Boolean(entry)));
      }
    }
    const tables = Array.isArray(record.tables) ? record.tables : [];
    for (const table of tables) {
      const tableRecord = asRecord(table);
      if (normalizeString(tableRecord?.tableName) !== 'persistent_documents' || !Array.isArray(tableRecord?.rows)) {
        continue;
      }
      docs.push(...tableRecord.rows.map((entry) => normalizeDocumentEntry(entry)).filter((entry): entry is LegacyDocument => Boolean(entry)));
    }
    const single = normalizeDocumentEntry(record);
    if (single) {
      docs.push(single);
    }
  }
  if (docs.length > 0) {
    return dedupeDocuments(docs).filter((doc) => LEGACY_INSTANCE_SCOPES.has(doc.scope));
  }
  if (record && looksLikeLegacySnapshot(record)) {
    const instanceId = normalizeString(record.instanceId) || normalizeString(record.key) || 'legacy_instance';
    return [{
      scope: 'server_map_aura_v1',
      key: instanceId,
      payload: record,
      updatedAt: new Date().toISOString(),
    }];
  }
  if (record) {
    for (const [key, value] of Object.entries(record)) {
      const payload = asRecord(value);
      if (!payload || !looksLikeLegacySnapshot(payload)) {
        continue;
      }
      docs.push({
        scope: 'server_map_aura_v1',
        key,
        payload,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return dedupeDocuments(docs);
}

function normalizeDocumentEntry(value: unknown): LegacyDocument | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const scope = normalizeString(record.scope);
  const key = normalizeString(record.key) || normalizeString(record.instanceId) || normalizeString(record.instance_id);
  if (!scope || !key) {
    return null;
  }
  return {
    scope,
    key,
    payload: record.payload ?? null,
    updatedAt: normalizeTimestamp(record.updatedAt) ?? normalizeTimestamp(record.updated_at) ?? new Date().toISOString(),
  };
}

function dedupeDocuments(docs: LegacyDocument[]): LegacyDocument[] {
  const byKey = new Map<string, LegacyDocument>();
  for (const doc of docs) {
    byKey.set(`${doc.scope}\u0000${doc.key}`, doc);
  }
  return Array.from(byKey.values()).sort((left, right) => left.scope.localeCompare(right.scope) || left.key.localeCompare(right.key));
}

function toProjectionContext(doc: LegacyDocument): ProjectionContext | null {
  if (!LEGACY_INSTANCE_SCOPES.has(doc.scope)) {
    return null;
  }
  const snapshot = asRecord(doc.payload);
  if (!snapshot || !looksLikeLegacySnapshot(snapshot)) {
    return null;
  }
  return {
    instanceId: doc.key,
    snapshot,
    updatedAt: doc.updatedAt,
  };
}

function looksLikeLegacySnapshot(value: JsonRecord): boolean {
  return Array.isArray(value.tileResourceEntries)
    || Array.isArray(value.tileDamageEntries)
    || Array.isArray(value.groundPileEntries)
    || Array.isArray(value.containerStates)
    || Array.isArray(value.monsterRuntimeEntries)
    || Array.isArray(value.monsterRuntimeStates)
    || Array.isArray(value.overlayChunks);
}

function projectInstanceSnapshot(context: ProjectionContext): { rowsByTable: Map<string, JsonRecord[]>; summary: JsonRecord } {
  const rowsByTable = new Map<string, JsonRecord[]>();
  for (const tableName of INSTANCE_DOMAIN_TABLE_ORDER) {
    rowsByTable.set(tableName, []);
  }
  const instanceId = context.instanceId;
  const snapshot = context.snapshot;
  const updatedAt = context.updatedAt;
  const savedAt = normalizeInteger(snapshot.savedAt) ?? Date.now();

  pushRows(rowsByTable, 'instance_tile_resource_state', projectTileResourceRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_tile_cell', projectTileCellRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_tile_damage_state', projectTileDamageRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_temporary_tile_state', projectTemporaryTileRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_ground_item', projectGroundItemRows(instanceId, snapshot, updatedAt));
  const containerRows = projectContainerRows(instanceId, snapshot, updatedAt);
  pushRows(rowsByTable, 'instance_container_state', containerRows.states);
  pushRows(rowsByTable, 'instance_container_entry', containerRows.entries);
  pushRows(rowsByTable, 'instance_container_timer', containerRows.timers);
  pushRows(rowsByTable, 'instance_monster_runtime_state', projectMonsterRuntimeRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_event_state', projectEventRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_overlay_chunk', projectOverlayRows(instanceId, snapshot, updatedAt));
  pushRows(rowsByTable, 'instance_checkpoint', [{
    instance_id: instanceId,
    checkpoint_payload: {
      kind: 'migrated_from_map_snapshot',
      templateId: normalizeString(snapshot.templateId) || null,
      savedAt,
      tileResourceEntries: Array.isArray(snapshot.tileResourceEntries) ? snapshot.tileResourceEntries : [],
      tileDamageEntries: Array.isArray(snapshot.tileDamageEntries) ? snapshot.tileDamageEntries : [],
      groundPileEntries: Array.isArray(snapshot.groundPileEntries) ? snapshot.groundPileEntries : [],
      containerStates: Array.isArray(snapshot.containerStates) ? snapshot.containerStates : [],
    },
    updated_at: updatedAt,
  }]);
  pushRows(rowsByTable, 'instance_recovery_watermark', [{
    instance_id: instanceId,
    watermark_payload: {
      catalogVersion: savedAt,
      recoveryVersion: savedAt,
      checkpointKind: 'migrated_from_map_snapshot',
    },
    updated_at: updatedAt,
  }]);

  const summary: JsonRecord = {
    instanceId,
    templateId: normalizeString(snapshot.templateId) || null,
    savedAt,
  };
  for (const [tableName, rows] of rowsByTable.entries()) {
    summary[tableName] = rows.length;
  }
  return { rowsByTable, summary };
}

function projectTileResourceRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  return arrayOfRecords(snapshot.tileResourceEntries)
    .filter((entry) => normalizeString(entry.resourceKey) && normalizeInteger(entry.tileIndex) !== null && normalizeInteger(entry.value) !== null)
    .map((entry) => ({
      instance_id: instanceId,
      resource_key: normalizeString(entry.resourceKey),
      tile_index: Math.max(0, normalizeInteger(entry.tileIndex) ?? 0),
      value: Math.max(0, normalizeInteger(entry.value) ?? 0),
      updated_at: updatedAt,
    }));
}

function projectTileCellRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  const entries = arrayOfRecords(snapshot.tileCellEntries).length > 0
    ? arrayOfRecords(snapshot.tileCellEntries)
    : arrayOfRecords(snapshot.runtimeTileEntries);
  return entries
    .filter((entry) => normalizeInteger(entry.x) !== null && normalizeInteger(entry.y) !== null && normalizeString(entry.tileType))
    .map((entry) => ({
      instance_id: instanceId,
      x: normalizeInteger(entry.x) ?? 0,
      y: normalizeInteger(entry.y) ?? 0,
      tile_type: normalizeString(entry.tileType),
      updated_at: updatedAt,
    }));
}

function projectTileDamageRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  return arrayOfRecords(snapshot.tileDamageEntries)
    .filter((entry) => normalizeInteger(entry.tileIndex) !== null)
    .map((entry) => ({
      instance_id: instanceId,
      tile_index: Math.max(0, normalizeInteger(entry.tileIndex) ?? 0),
      x: normalizeInteger(entry.x),
      y: normalizeInteger(entry.y),
      hp: Math.max(0, normalizeInteger(entry.hp) ?? 0),
      max_hp: Math.max(1, normalizeInteger(entry.maxHp) ?? 1),
      destroyed: entry.destroyed === true,
      respawn_left_ticks: Math.max(0, normalizeInteger(entry.respawnLeft) ?? 0),
      modified_at_ms: Math.max(0, normalizeInteger(entry.modifiedAt) ?? Date.now()),
      updated_at: updatedAt,
    }));
}

function projectTemporaryTileRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  const entries = arrayOfRecords(snapshot.temporaryTileEntries).length > 0
    ? arrayOfRecords(snapshot.temporaryTileEntries)
    : arrayOfRecords(snapshot.temporaryTiles);
  return entries
    .filter((entry) => normalizeInteger(entry.tileIndex) !== null)
    .map((entry) => ({
      instance_id: instanceId,
      tile_index: Math.max(0, normalizeInteger(entry.tileIndex) ?? 0),
      x: normalizeInteger(entry.x),
      y: normalizeInteger(entry.y),
      tile_type: normalizeString(entry.tileType) || 'stone',
      hp: Math.max(1, normalizeInteger(entry.hp) ?? 1),
      max_hp: Math.max(1, normalizeInteger(entry.maxHp) ?? 1),
      expires_at_tick: Math.max(1, normalizeInteger(entry.expiresAtTick) ?? 1),
      owner_player_id: normalizeString(entry.ownerPlayerId) || null,
      source_skill_id: normalizeString(entry.sourceSkillId) || null,
      created_at_ms: Math.max(0, normalizeInteger(entry.createdAt) ?? Date.now()),
      modified_at_ms: Math.max(0, normalizeInteger(entry.modifiedAt) ?? Date.now()),
      updated_at: updatedAt,
    }));
}

function projectGroundItemRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  const rows: JsonRecord[] = [];
  for (const pile of arrayOfRecords(snapshot.groundPileEntries)) {
    const tileIndex = normalizeInteger(pile.tileIndex);
    if (tileIndex === null || !Array.isArray(pile.items)) {
      continue;
    }
    pile.items.forEach((itemPayload, index) => {
      rows.push({
        ground_item_id: buildStableDomainRowId('ground', instanceId, `${Math.max(0, tileIndex)}:${index}`),
        instance_id: instanceId,
        tile_index: Math.max(0, tileIndex),
        item_instance_payload: itemPayload ?? {},
        expire_at: null,
        updated_at: updatedAt,
      });
    });
  }
  return rows;
}

function projectContainerRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): {
  states: JsonRecord[];
  entries: JsonRecord[];
  timers: JsonRecord[];
} {
  const states: JsonRecord[] = [];
  const entries: JsonRecord[] = [];
  const timers: JsonRecord[] = [];
  for (const state of arrayOfRecords(snapshot.containerStates)) {
    const containerId = normalizeString(state.containerId);
    const sourceId = normalizeString(state.sourceId) || containerId;
    if (!containerId || !sourceId) {
      continue;
    }
    states.push({
      instance_id: instanceId,
      container_id: containerId,
      source_id: sourceId,
      state_payload: buildContainerMetadataPayload(state),
      updated_at: updatedAt,
    });
    timers.push({
      instance_id: instanceId,
      container_id: containerId,
      generated_at_tick: normalizeInteger(state.generatedAtTick),
      refresh_at_tick: normalizeInteger(state.refreshAtTick),
      active_search_payload: asRecord(state.activeSearch) ?? {},
      updated_at: updatedAt,
    });
    arrayOfRecords(state.entries).forEach((entry, entryIndex) => {
      entries.push({
        instance_id: instanceId,
        container_id: containerId,
        entry_index: entryIndex,
        item_payload: entry.item ?? {},
        created_tick: normalizeInteger(entry.createdTick),
        visible: entry.visible === true,
        updated_at: updatedAt,
      });
    });
  }
  return { states, entries, timers };
}

function projectMonsterRuntimeRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  const entries = arrayOfRecords(snapshot.monsterRuntimeEntries).length > 0
    ? arrayOfRecords(snapshot.monsterRuntimeEntries)
    : arrayOfRecords(snapshot.monsterRuntimeStates);
  return entries
    .map((entry): JsonRecord | null => {
      const monsterRuntimeId = normalizeString(entry.monsterRuntimeId) || normalizeString(entry.runtimeId);
      const monsterId = normalizeString(entry.monsterId);
      const monsterName = normalizeString(entry.monsterName) || normalizeString(entry.name);
      const monsterTier = normalizeString(entry.monsterTier) || normalizeString(entry.tier);
      if (!monsterRuntimeId || !monsterId || !monsterName || monsterTier === 'mortal_blood') {
        return null;
      }
      return {
        monster_runtime_id: monsterRuntimeId,
        instance_id: instanceId,
        monster_id: monsterId,
        monster_name: monsterName,
        monster_tier: monsterTier,
        monster_level: normalizeInteger(entry.monsterLevel) ?? normalizeInteger(entry.level),
        tile_index: Math.max(0, normalizeInteger(entry.tileIndex) ?? 0),
        x: normalizeInteger(entry.x) ?? 0,
        y: normalizeInteger(entry.y) ?? 0,
        hp: Math.max(0, normalizeInteger(entry.hp) ?? 0),
        max_hp: Math.max(1, normalizeInteger(entry.maxHp) ?? 1),
        alive: entry.alive === true,
        respawn_left: normalizeInteger(entry.respawnLeft),
        respawn_ticks: normalizeInteger(entry.respawnTicks),
        aggro_target_player_id: normalizeString(entry.aggroTargetPlayerId) || null,
        state_payload: asRecord(entry.statePayload) ?? {},
        updated_at: updatedAt,
      };
    })
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function projectEventRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  return arrayOfRecords(snapshot.eventStates)
    .map((entry, index): JsonRecord | null => {
      const eventKind = normalizeString(entry.eventKind);
      const eventKey = normalizeString(entry.eventKey);
      if (!eventKind || !eventKey) {
        return null;
      }
      return {
        event_id: normalizeString(entry.eventId) || buildStableDomainRowId('event', instanceId, `${eventKind}:${eventKey}:${index}`),
        instance_id: instanceId,
        event_kind: eventKind,
        event_key: eventKey,
        state_payload: asRecord(entry.statePayload) ?? {},
        resolved_at: normalizeTimestamp(entry.resolvedAt),
        updated_at: updatedAt,
      };
    })
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function projectOverlayRows(instanceId: string, snapshot: JsonRecord, updatedAt: string): JsonRecord[] {
  const entries = arrayOfRecords(snapshot.overlayChunks).length > 0
    ? arrayOfRecords(snapshot.overlayChunks)
    : arrayOfRecords(snapshot.overlayPersistenceChunks);
  return entries
    .map((entry): JsonRecord | null => {
      const patchKind = normalizeString(entry.patchKind);
      const chunkKey = normalizeString(entry.chunkKey);
      if (!patchKind || !chunkKey) {
        return null;
      }
      return {
        instance_id: instanceId,
        patch_kind: patchKind,
        chunk_key: chunkKey,
        patch_version: Math.max(0, normalizeInteger(entry.patchVersion) ?? 0),
        patch_payload: entry.patchPayload ?? {},
        updated_at: updatedAt,
      };
    })
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function pushRows(rowsByTable: Map<string, JsonRecord[]>, tableName: string, rows: JsonRecord[]): void {
  rowsByTable.get(tableName)?.push(...rows);
}

function buildStructuredTable(tableName: string, rows: JsonRecord[]): StructuredTable {
  const sortedRows = [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    tableName,
    rowCount: sortedRows.length,
    checksumSha256: computeJsonChecksum(sortedRows),
    rows: sortedRows,
  };
}

function computeTablesChecksum(tables: StructuredTable[]): string {
  return computeJsonChecksum(tables.map((table) => ({
    tableName: table.tableName,
    rowCount: table.rowCount,
    checksumSha256: table.checksumSha256,
  })));
}

function computeJsonChecksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildStableDomainRowId(prefix: string, instanceId: string, suffix: string): string {
  return `${prefix}:${hashString(`${instanceId}:${suffix}`)}:${suffix}`.slice(0, 100);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildContainerMetadataPayload(state: JsonRecord): JsonRecord {
  const payload: JsonRecord = {};
  for (const [key, value] of Object.entries(state)) {
    if (key === 'entries' || key === 'generatedAtTick' || key === 'refreshAtTick' || key === 'activeSearch') {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry))
    : [];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeTimestamp(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value.trim();
  }
  if (Number.isFinite(Number(value))) {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
