import {
  GM_PASSWORD_STORAGE_KEY,
  type GmManagedPlayerRecord,
  type GmManagedPlayerSummary,
  type RedeemCodeGroupRewardItem,
} from '@mud/shared';
import { t } from '../../ui/i18n';

/** GM 邮件草稿里单条附件的最小输入结构。 */
interface GmMailAttachmentDraft {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** GM 邮件编辑器中整份草稿的输入结构。 */
interface GmMailComposerDraft {
/**
 * templateId：templateID标识。
 */

  templateId: string;  
  /**
 * targetPlayerId：目标玩家ID标识。
 */

  targetPlayerId: string;  
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * body：body相关字段。
 */

  body: string;  
  /**
 * expireHours：expireHour相关字段。
 */

  expireHours: string;  
  /**
 * attachments：attachment相关字段。
 */

  attachments: GmMailAttachmentDraft[];
}

/** 读取浏览器 LocalStorage；当前环境不可用时返回 null。 */
export function getBrowserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 读取已保存的 GM 登录口令。
 *
 * N51 安全收口：本函数永远返回空字符串，并在调用时清理 localStorage 上可能残留的明文
 * 密码（一次性迁移）。原本"localStorage 持久化 GM 密码 + 自动回填"的设计在玩家域 XSS
 * 场景下会一并暴露 GM 凭证；安全收益远大于"刷新页面要重新输入"的体验损失。
 */
export function readPersistedGmPassword(storageKey = GM_PASSWORD_STORAGE_KEY): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const storage = getBrowserLocalStorage();
  if (!storage) return '';
  try {
    // 一次性清理：旧版本可能已经把明文密码写入 localStorage；这里强制移除避免泄漏面持久存在。
    storage.removeItem(storageKey);
  } catch {
    // ignore
  }
  return '';
}

/**
 * 保存或清理 GM 登录口令。
 *
 * N51 安全收口：本函数不再写入 localStorage，无论传入什么都强制清理；
 * 旧调用点保留以避免上层 diff 噪音，调用语义等价于"确保 GM 密码不在 localStorage 中"。
 */
export function persistGmPassword(_password: string, storageKey = GM_PASSWORD_STORAGE_KEY): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const storage = getBrowserLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // 本地存储不可用时直接跳过，不影响 GM 主流程。
  }
}

/** 创建空的邮件附件草稿，供编辑面板新增一行使用。 */
export function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return {
    itemId: '',
    count: 1,
  };
}

/** 创建兑换码批量生成分组草稿，填充可直接提交的默认值。 */
export function createDefaultRedeemGroupDraft(
  createRedeemReward: () => RedeemCodeGroupRewardItem = createDefaultRedeemReward,
): {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];  
  /**
 * createCount：数量或计量字段。
 */

  createCount: string;  
  /**
 * appendCount：数量或计量字段。
 */

  appendCount: string;
} {
  return {
    name: '',
    rewards: [createRedeemReward()],
    createCount: '10',
    appendCount: '10',
  };
}

/** 创建单条奖励草稿，作为兑换码分组的默认奖励项。 */
export function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return {
    itemId: '',
    count: 1,
  };
}

/** 创建邮件编辑草稿，预置默认发件人与有效期。 */
export function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return {
    templateId: '',
    targetPlayerId: '',
    senderLabel: t('gm.mail.sender.default', undefined),
    title: '',
    body: '',
    expireHours: '72',
    attachments: [],
  };
}

/** 纯数据快照的深拷贝工具，当前实现基于 JSON 序列化。 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 转义 HTML 实体，避免 GM 面板中的内容被当成标签渲染。 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 将任意值格式化成缩进 JSON，便于详情和日志查看。 */
export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

/** 将字节数转成 B/KB/MB/GB 文本，便于运维面板阅读。 */
export function formatBytes(bytes: number | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const safe = Number.isFinite(bytes) ? Math.max(0, Number(bytes)) : 0;
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 将分子分母转换成百分比字符串，异常输入回退为 0。 */
export function formatPercent(numerator: number, denominator: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** 计算并格式化每秒吞吐量。 */
export function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(elapsedSec) || elapsedSec <= 0) {
    return '0 B/s';
  }
  return `${formatBytes(bytes / elapsedSec)}/s`;
}

/** 计算并格式化单次事件平均字节数。 */
export function formatAverageBytesPerEvent(bytes: number, count: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(count) || count <= 0) {
    return '0 B';
  }
  return formatBytes(bytes / count);
}

/** 将秒数格式化成中文可读时长。 */
export function formatDurationSeconds(seconds: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (days > 0) return t('gm.duration.days', { days, hours, minutes });
  if (hours > 0) return t('gm.duration.hours', { hours, minutes, seconds: secs });
  if (minutes > 0) return t('gm.duration.minutes', { minutes, seconds: secs });
  return t('gm.duration.seconds', { seconds: secs });
}

/** 将 ISO 时间转成本地中文时间，非法值返回 `无`。 */
export function formatDateTime(value?: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value) {
    return t('gm.none', undefined);
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return t('gm.none', undefined);
  }
  return time.toLocaleString('zh-CN');
}

/** 根据玩家在线状态生成列表里的样式与文案。 */
export function getPlayerPresenceMeta(
  player: Pick<GmManagedPlayerSummary, 'meta'>,
): {
/**
 * className：class名称名称或显示文本。
 */

  className: 'online' | 'offline';  
  /**
 * label：label名称或显示文本。
 */

  label: '在线' | '离线挂机' | '离线';
} {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (player.meta.online) {
    return { className: 'online', label: t('gm.presence.online') as '在线' };
  }
  if (player.meta.inWorld) {
    return { className: 'offline', label: t('gm.presence.offline-hanging') as '离线挂机' };
  }
  return { className: 'offline', label: t('gm.presence.offline') as '离线' };
}

/** 复用在线状态映射，生成托管账号的显示文本。 */
export function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  const presence = getPlayerPresenceMeta(player);
  return presence.label;
}

/** 将点分路径拆成片段，供路径读写工具复用。 */
export function pathSegments(path: string): string[] {
  return path.split('.');
}

/** 按点分路径写值，缺失节点会按后续片段自动补齐数组或对象。 */
export function setValueByPath(target: unknown, path: string, value: unknown): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 按点分路径读取任意对象字段，路径缺失时返回 undefined。 */
export function getValueByPath(target: unknown, path: string): unknown {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let cursor = target as Record<string, unknown> | undefined;
  for (const segment of pathSegments(path)) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment] as Record<string, unknown> | undefined;
  }
  return cursor;
}

/** 定位点路径上的数组并移除指定下标，用于草稿表单删除。 */
export function removeArrayIndex(target: unknown, path: string, index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const value = getValueByPath(target, path);
  if (!Array.isArray(value)) return;
  value.splice(index, 1);
}

/** 将输入统一规范成数组，非数组输入返回空数组。 */
export function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}
