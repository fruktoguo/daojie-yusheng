import {
  GM_PASSWORD_STORAGE_KEY,
  type GmManagedPlayerRecord,
  type GmManagedPlayerSummary,
  type RedeemCodeGroupRewardItem,
} from '@mud/shared-next';

/** GmMailAttachmentDraft：定义该接口的能力与字段约束。 */
interface GmMailAttachmentDraft {
  itemId: string;
  count: number;
}

/** GmMailComposerDraft：定义该接口的能力与字段约束。 */
interface GmMailComposerDraft {
  templateId: string;
  targetPlayerId: string;
  senderLabel: string;
  title: string;
  body: string;
  expireHours: string;
  attachments: GmMailAttachmentDraft[];
}

/** getBrowserLocalStorage：执行对应的业务逻辑。 */
export function getBrowserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** readPersistedGmPassword：执行对应的业务逻辑。 */
export function readPersistedGmPassword(storageKey = GM_PASSWORD_STORAGE_KEY): string {
  const storage = getBrowserLocalStorage();
  if (!storage) return '';
  try {
    return storage.getItem(storageKey)?.trim() ?? '';
  } catch {
    return '';
  }
}

/** persistGmPassword：执行对应的业务逻辑。 */
export function persistGmPassword(password: string, storageKey = GM_PASSWORD_STORAGE_KEY): void {
  const storage = getBrowserLocalStorage();
  if (!storage) return;
  const normalized = password.trim();
  try {
    if (normalized) {
      storage.setItem(storageKey, normalized);
      return;
    }
    storage.removeItem(storageKey);
  } catch {
    // 本地存储不可用时忽略，避免影响 GM 主流程。
  }
}

/** createDefaultMailAttachmentDraft：执行对应的业务逻辑。 */
export function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return {
    itemId: '',
    count: 1,
  };
}

/** createDefaultRedeemGroupDraft：执行对应的业务逻辑。 */
export function createDefaultRedeemGroupDraft(
  createRedeemReward: () => RedeemCodeGroupRewardItem = createDefaultRedeemReward,
): {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  createCount: string;
  appendCount: string;
} {
  return {
    name: '',
    rewards: [createRedeemReward()],
    createCount: '10',
    appendCount: '10',
  };
}

/** createDefaultRedeemReward：执行对应的业务逻辑。 */
export function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return {
    itemId: '',
    count: 1,
  };
}

/** createDefaultMailComposerDraft：执行对应的业务逻辑。 */
export function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return {
    templateId: '',
    targetPlayerId: '',
    senderLabel: '司命台',
    title: '',
    body: '',
    expireHours: '72',
    attachments: [],
  };
}

/** clone：执行对应的业务逻辑。 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** escapeHtml：执行对应的业务逻辑。 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatJson：执行对应的业务逻辑。 */
export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

/** formatBytes：执行对应的业务逻辑。 */
export function formatBytes(bytes: number | undefined): string {
  const safe = Number.isFinite(bytes) ? Math.max(0, Number(bytes)) : 0;
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** formatPercent：执行对应的业务逻辑。 */
export function formatPercent(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** formatBytesPerSecond：执行对应的业务逻辑。 */
export function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(elapsedSec) || elapsedSec <= 0) {
    return '0 B/s';
  }
  return `${formatBytes(bytes / elapsedSec)}/s`;
}

/** formatAverageBytesPerEvent：执行对应的业务逻辑。 */
export function formatAverageBytesPerEvent(bytes: number, count: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(count) || count <= 0) {
    return '0 B';
  }
  return formatBytes(bytes / count);
}

/** formatDurationSeconds：执行对应的业务逻辑。 */
export function formatDurationSeconds(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (days > 0) return `${days}天 ${hours}时 ${minutes}分`;
  if (hours > 0) return `${hours}时 ${minutes}分 ${secs}秒`;
  if (minutes > 0) return `${minutes}分 ${secs}秒`;
  return `${secs}秒`;
}

/** formatDateTime：执行对应的业务逻辑。 */
export function formatDateTime(value?: string): string {
  if (!value) {
    return '无';
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return '无';
  }
  return time.toLocaleString('zh-CN');
}

/** getPlayerPresenceMeta：执行对应的业务逻辑。 */
export function getPlayerPresenceMeta(
  player: Pick<GmManagedPlayerSummary, 'meta'>,
): {
  className: 'online' | 'offline';
  label: '在线' | '离线挂机' | '离线';
} {
  if (player.meta.online) {
    return { className: 'online', label: '在线' };
  }
  if (player.meta.inWorld) {
    return { className: 'offline', label: '离线挂机' };
  }
  return { className: 'offline', label: '离线' };
}

/** getManagedAccountStatusLabel：执行对应的业务逻辑。 */
export function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  const presence = getPlayerPresenceMeta(player);
  return presence.label;
}

/** pathSegments：执行对应的业务逻辑。 */
export function pathSegments(path: string): string[] {
  return path.split('.');
}

/** setValueByPath：执行对应的业务逻辑。 */
export function setValueByPath(target: unknown, path: string, value: unknown): void {
  const segments = pathSegments(path);
  let cursor = target as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (next === undefined || next === null) {
      cursor[key] = /^\d+$/.test(segments[index + 1] ?? '') ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/** getValueByPath：执行对应的业务逻辑。 */
export function getValueByPath(target: unknown, path: string): unknown {
  let cursor = target as Record<string, unknown> | undefined;
  for (const segment of pathSegments(path)) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment] as Record<string, unknown> | undefined;
  }
  return cursor;
}

/** removeArrayIndex：执行对应的业务逻辑。 */
export function removeArrayIndex(target: unknown, path: string, index: number): void {
  const value = getValueByPath(target, path);
  if (!Array.isArray(value)) return;
  value.splice(index, 1);
}

/** ensureArray：执行对应的业务逻辑。 */
export function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

