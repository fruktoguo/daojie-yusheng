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

let resources: RuntimeImageResourceEntry[] = [];
let resourceLoadPromise: Promise<RuntimeImageResourceEntry[]> | null = null;
let overrides: RuntimeImageOverridesSnapshot | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.trim();
}

function resolveResourceLabel(kind: RuntimeImageOverrideKind, key: string): string {
  const [prefix, rawId = key] = key.split(':', 2);
  const normalizedId = rawId.replace(/[_-]+/g, ' ');
  const kindLabel = kind === 'tile'
    ? prefix === 'terrain'
      ? '地形'
      : prefix === 'surface'
        ? '地表'
        : prefix === 'structure'
          ? '结构'
          : prefix === 'interactable'
            ? '交互物'
            : '地块'
    : prefix === 'monster'
      ? '怪物'
      : prefix === 'npc'
        ? 'NPC'
        : prefix === 'container'
          ? '草药/容器'
          : prefix === 'player'
            ? '玩家'
            : '实体';
  return `${kindLabel} · ${normalizedId}`;
}

function readManifestResourceEntries(value: unknown, kind: RuntimeImageOverrideKind): RuntimeImageResourceEntry[] {
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
      label: resolveResourceLabel(kind, key),
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
  resourceLoadPromise = fetch(MANIFEST_URL, { cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`runtime_image_resource_manifest_http_${response.status}`);
      return response.json() as Promise<RuntimeImagePackManifest>;
    })
    .then((manifest) => {
      resources = [
        ...readManifestResourceEntries(manifest.tiles, 'tile'),
        ...readManifestResourceEntries(manifest.entities, 'entity'),
      ].sort(sortResourceEntries);
      return resources;
    })
    .catch((error) => {
      resourceLoadPromise = null;
      throw error;
    });
  return resourceLoadPromise;
}

export async function saveRuntimeImageOverrideFromFile(key: string, file: File): Promise<RuntimeImageOverrideEntry> {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) throw new Error('local_runtime_image_override_empty_key');
  if (!file.type.startsWith('image/')) throw new Error('local_runtime_image_override_not_image');
  const entry = findResource(normalizedKey);
  if (!entry) throw new Error('local_runtime_image_override_unknown_key');
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
    key: entry.key,
    dataUrl,
    fileName: file.name,
    updatedAt: Date.now(),
  };
  persistOverrides({
    ...getMutableOverrides(),
    [entry.key]: nextEntry,
  });
  return nextEntry;
}
