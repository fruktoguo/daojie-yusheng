/**
 * 本文件负责客户端运行时图包的本地资源覆盖。
 *
 * 覆盖只写入当前浏览器 localStorage，不改变服务端真源、manifest 或资源文件。
 */

export type RuntimeImageOverrideKind = 'tile' | 'entity';

export interface RuntimeImageResourceEntry {
  key: string;
  kind: RuntimeImageOverrideKind;
  label: string;
  src: string;
  aliasKeys?: string[];
}

export interface RuntimeImageOverrideEntry {
  key: string;
  dataUrl: string;
  fileName: string;
  updatedAt: number;
}

type RuntimeImageOverridesSnapshot = Record<string, RuntimeImageOverrideEntry>;

type RuntimeImagePackManifest = {
  tiles?: Record<string, unknown>;
  entities?: Record<string, unknown>;
};

const MANIFEST_URL = '/assets/runtime-image-packs/default/manifest.json';
const STORAGE_KEY = 'mud:runtime-image-overrides:v1';
const RELOAD_LIST_STORAGE_KEY = 'mud:runtime-image-reload-list:v1';
export const RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT = 'mud:runtime-image-overrides-changed';

const TILE_LABELS: Record<string, string> = {
  'terrain:floor': '地形 · 平地',
  'terrain:grass': '地形 · 草地',
  'terrain:hill': '地形 · 山丘',
  'terrain:water': '地形 · 水域',
  'terrain:mud': '地形 · 泥地',
  'terrain:swamp': '地形 · 沼泽',
  'terrain:cold_bog': '地形 · 寒潭',
  'terrain:molten_pool': '地形 · 熔岩',
  'terrain:cloud_floor': '地形 · 霞台',
  'terrain:cloud': '地形 · 云海',
  'terrain:void': '地形 · 虚空',
  'terrain:cliff': '地形 · 峭壁',
  'surface:floor': '地表 · 石板',
  'surface:trail': '地表 · 小径',
  'surface:road': '地表 · 大路',
  'surface:veranda': '地表 · 回廊',
  'surface:stone_stairs': '地表 · 石阶',
  'structure:wall': '结构 · 墙',
  'structure:door': '结构 · 门',
  'structure:window': '结构 · 窗',
  'structure:house_eave': '结构 · 屋檐',
  'structure:house_corner': '结构 · 檐角',
  'structure:screen_wall': '结构 · 影壁',
  'structure:tree': '结构 · 树木',
  'structure:bamboo': '结构 · 翠竹',
  'structure:stone': '结构 · 岩石',
  'structure:spirit_ore': '结构 · 灵矿',
  'structure:black_iron_ore': '结构 · 玄铁矿',
  'structure:broken_sword_heap': '结构 · 断剑堆',
};

type MonsterLocationCatalog = Record<string, { monsterName?: unknown }>;

type LocalEditorCatalog = {
  quests?: Array<Record<string, unknown>>;
};

type ResourceLabelMaps = {
  monsterNames: ReadonlyMap<string, string>;
  npcNames: ReadonlyMap<string, string>;
};

let resources: RuntimeImageResourceEntry[] = [];
let resourceLoadPromise: Promise<RuntimeImageResourceEntry[]> | null = null;
let overrides: RuntimeImageOverridesSnapshot | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.trim();
}

function getFallbackKindLabel(kind: RuntimeImageOverrideKind, prefix: string): string {
  if (kind === 'tile') {
    switch (prefix) {
      case 'terrain':
        return '地形';
      case 'surface':
        return '地表';
      case 'structure':
        return '结构';
      case 'interactable':
        return '交互物';
      default:
        return '地块';
    }
  }
  switch (prefix) {
    case 'monster':
      return '怪物';
    case 'npc':
      return 'NPC';
    case 'container':
      return '草药/容器';
    case 'player':
      return '玩家';
    default:
      return '实体';
  }
}

function resolveResourceLabel(kind: RuntimeImageOverrideKind, key: string, labelMaps?: ResourceLabelMaps): string {
  if (TILE_LABELS[key]) return TILE_LABELS[key]!;
  const [prefix, rawId = key] = key.split(':', 2);
  const kindLabel = getFallbackKindLabel(kind, prefix);
  if (prefix === 'monster') {
    const name = labelMaps?.monsterNames.get(rawId);
    if (name) return `${kindLabel} · ${name}`;
  }
  if (prefix === 'npc') {
    const name = labelMaps?.npcNames.get(rawId);
    if (name) return `${kindLabel} · ${name}`;
  }
  if (prefix === 'container' && /[\u3400-\u9fff]/u.test(rawId)) {
    return `${kindLabel} · ${rawId}`;
  }
  if (prefix === 'player') {
    return rawId === 'default' ? '玩家 · 默认形象' : `${kindLabel} · ${rawId}`;
  }
  return `${kindLabel} · ${rawId.replace(/[_-]+/g, ' ')}`;
}

function readManifestResourceEntries(value: unknown, kind: RuntimeImageOverrideKind, labelMaps: ResourceLabelMaps): RuntimeImageResourceEntry[] {
  if (!isRecord(value)) return [];
  const entries: RuntimeImageResourceEntry[] = [];
  for (const [rawKey, rawRef] of Object.entries(value)) {
    const key = normalizeKey(rawKey);
    if (!key || !isRecord(rawRef) || typeof rawRef.src !== 'string' || rawRef.src.trim().length === 0) {
      continue;
    }
    entries.push({
      key,
      kind,
      label: resolveResourceLabel(kind, key, labelMaps),
      src: rawRef.src.trim(),
    });
  }
  return entries;
}

function sortResourceEntries(left: RuntimeImageResourceEntry, right: RuntimeImageResourceEntry): number {
  if (left.kind !== right.kind) return left.kind === 'tile' ? -1 : 1;
  return left.key.localeCompare(right.key, 'zh-Hans-CN');
}

function readStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStoredOverrides(): RuntimeImageOverridesSnapshot {
  const storage = readStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const next: RuntimeImageOverridesSnapshot = {};
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = normalizeKey(rawKey);
      if (!key || !isRecord(rawValue)) continue;
      const dataUrl = typeof rawValue.dataUrl === 'string' ? rawValue.dataUrl : '';
      if (!dataUrl.startsWith('data:image/')) continue;
      next[key] = {
        key,
        dataUrl,
        fileName: typeof rawValue.fileName === 'string' ? rawValue.fileName : '',
        updatedAt: Number.isFinite(Number(rawValue.updatedAt)) ? Number(rawValue.updatedAt) : 0,
      };
    }
    return next;
  } catch {
    return {};
  }
}

function getMutableOverrides(): RuntimeImageOverridesSnapshot {
  if (!overrides) overrides = readStoredOverrides();
  return overrides;
}

function persistOverrides(next: RuntimeImageOverridesSnapshot): void {
  overrides = next;
  const storage = readStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 图片覆盖较大时 localStorage 可能被浏览器拒绝，调用方会通过返回状态提示玩家。
      throw new Error('local_runtime_image_override_storage_failed');
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RUNTIME_IMAGE_OVERRIDES_CHANGED_EVENT, {
      detail: getRuntimeImageOverrides(),
    }));
  }
}

function findResource(key: string): RuntimeImageResourceEntry | null {
  return resources.find((entry) => entry.key === key) ?? null;
}

function normalizeDisplayName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNpcNamesFromLocalEditorCatalog(catalog: LocalEditorCatalog): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const quest of catalog.quests ?? []) {
    for (const [idKey, nameKey] of [['giverId', 'giverName'], ['submitNpcId', 'submitNpcName'], ['npcId', 'npcName']] as const) {
      const id = normalizeDisplayName(quest[idKey]);
      const name = normalizeDisplayName(quest[nameKey]);
      if (id && name && !names.has(id)) names.set(id, name);
    }
  }
  return names;
}

async function loadResourceLabelMaps(): Promise<ResourceLabelMaps> {
  const [monsterModule, editorCatalogModule] = await Promise.all([
    import('../constants/world/monster-locations.generated.json'),
    import('../constants/world/editor-catalog.generated.json'),
  ]);
  const monsterCatalog = monsterModule.default as MonsterLocationCatalog;
  const monsterNames = new Map<string, string>();
  for (const [id, entry] of Object.entries(monsterCatalog)) {
    const name = normalizeDisplayName(entry.monsterName);
    if (id && name) monsterNames.set(id, name);
  }
  return {
    monsterNames,
    npcNames: readNpcNamesFromLocalEditorCatalog(editorCatalogModule.default as LocalEditorCatalog),
  };
}

export function createPlayerRuntimeImageResource(input: {
  playerId: string;
  displayName?: string;
  roleName?: string;
}): RuntimeImageResourceEntry | null {
  const playerId = normalizeKey(input.playerId);
  if (!playerId) return null;
  const displayName = normalizeDisplayName(input.roleName) || normalizeDisplayName(input.displayName) || playerId;
  return {
    key: `player:${playerId}`,
    kind: 'entity',
    label: `我的形象 · ${displayName}`,
    src: '本地玩家形象',
  };
}

export function getRuntimeImageOverrideSpriteEntries(): RuntimeImageResourceEntry[] {
  return getRuntimeImageOverrides()
    .filter((entry) => entry.key.startsWith('player:') && !entry.key.endsWith(':left') && !entry.key.endsWith(':right'))
    .map((entry) => ({
      key: entry.key,
      kind: 'entity',
      label: resolveResourceLabel('entity', entry.key),
      src: entry.dataUrl,
    }));
}

export function getRuntimeImageOverrides(): RuntimeImageOverrideEntry[] {
  return Object.values(getMutableOverrides()).sort((left, right) => right.updatedAt - left.updatedAt || left.key.localeCompare(right.key));
}

export function getRuntimeImageOverride(key: string): RuntimeImageOverrideEntry | null {
  return getMutableOverrides()[key] ?? null;
}

export function resolveRuntimeImageOverrideSrc(key: string, fallbackSrc: string): string {
  return getRuntimeImageOverride(key)?.dataUrl ?? fallbackSrc;
}

export function getRuntimeImageReloadListKeys(): string[] {
  const storage = readStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RELOAD_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const key = normalizeKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export function setRuntimeImageReloadListKeys(keys: readonly string[]): void {
  const storage = readStorage();
  if (!storage) return;
  const seen = new Set<string>();
  const normalizedKeys: string[] = [];
  for (const item of keys) {
    const key = normalizeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalizedKeys.push(key);
  }
  try {
    storage.setItem(RELOAD_LIST_STORAGE_KEY, JSON.stringify(normalizedKeys));
  } catch {
    // 列表本身很小；失败时只影响下次打开设置面板，不影响本次会话。
  }
}

export function removeRuntimeImageOverride(key: string): void {
  const normalizedKey = normalizeKey(key);
  const current = getMutableOverrides();
  if (!current[normalizedKey]) return;
  const next = { ...current };
  delete next[normalizedKey];
  persistOverrides(next);
}

export async function loadRuntimeImageResourceCatalog(): Promise<RuntimeImageResourceEntry[]> {
  if (resources.length > 0) return resources;
  if (resourceLoadPromise) return resourceLoadPromise;
  resourceLoadPromise = Promise.all([
    fetch(MANIFEST_URL, { cache: 'no-cache' }),
    loadResourceLabelMaps(),
  ])
    .then(async ([response, labelMaps]) => {
      if (!response.ok) throw new Error(`runtime_image_resource_manifest_http_${response.status}`);
      const manifest = await response.json() as RuntimeImagePackManifest;
      resources = [
        ...readManifestResourceEntries(manifest.tiles, 'tile', labelMaps),
        ...readManifestResourceEntries(manifest.entities, 'entity', labelMaps),
      ].sort(sortResourceEntries);
      return resources;
    })
    .catch((error) => {
      resourceLoadPromise = null;
      throw error;
    });
  return resourceLoadPromise;
}

export async function saveRuntimeImageOverrideEntryFromFile(entry: RuntimeImageResourceEntry, file: File): Promise<RuntimeImageOverrideEntry> {
  const normalizedKey = normalizeKey(entry.key);
  if (!normalizedKey) throw new Error('local_runtime_image_override_empty_key');
  if (!file.type.startsWith('image/')) throw new Error('local_runtime_image_override_not_image');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('local_runtime_image_override_read_failed'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('local_runtime_image_override_read_failed'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
  const nextEntry: RuntimeImageOverrideEntry = {
    key: normalizedKey,
    dataUrl,
    fileName: file.name,
    updatedAt: Date.now(),
  };
  persistOverrides({
    ...getMutableOverrides(),
    [normalizedKey]: nextEntry,
  });
  return nextEntry;
}

export async function saveRuntimeImageOverrideFromFile(key: string, file: File): Promise<RuntimeImageOverrideEntry> {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) throw new Error('local_runtime_image_override_empty_key');
  const entry = findResource(normalizedKey);
  if (!entry) throw new Error('local_runtime_image_override_unknown_key');
  return saveRuntimeImageOverrideEntryFromFile(entry, file);
}
