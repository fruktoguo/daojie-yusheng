/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import { S2C_Notice, S2C_NoticeItem, S2C_SystemMsg } from '@mud/shared';
import { ChatUI } from './ui/chat';
import { t } from './ui/i18n';
import { resolveStructuredNoticeText } from './ui/structured-notice-display';
/**
 * MainToastKind：统一结构类型，保证协议与运行时一致性。
 */


type MainToastKind = 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
/**
 * MainNoticeStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainNoticeStateSourceOptions = {
/**
 * chatUI：chatUI相关字段。
 */

  chatUI: Pick<ChatUI, 'addMessage'>;  
  /**
 * ackSystemMessages：ackSystemMessage相关字段。
 */

  ackSystemMessages: (ids: string[]) => void;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string, kind?: MainToastKind) => void;  
  /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

  clearCurrentPath: () => void;
  /** 服务端指令打开面板（panel 标识） */
  onOpenPanel?: (panel: string) => void;
};
/**
 * resolveSystemMsgIdFromNotice：规范化或转换SystemMsgIDFromNextNotice。
 * @param item S2C_NoticeItem 道具。
 * @returns 返回SystemMsgIDFromNextNotice。
 */


function resolveSystemMsgIdFromNotice(item: S2C_NoticeItem): string | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof item.messageId === 'string' && item.messageId.length > 0) {
    return item.messageId;
  }
  return typeof item.id === 'number' ? String(item.id) : undefined;
}
/**
 * toSystemMsgFromNotice：执行toSystemMsgFromNotice相关逻辑。
 * @param item S2C_NoticeItem 道具。
 * @returns 返回toSystemMsgFromNotice。
 */


function toSystemMsgFromNotice(item: S2C_NoticeItem): S2C_SystemMsg {
  const kind = item.kind === 'chat'
    ? 'chat'
    : item.kind === 'grudge'
      ? 'grudge'
      : item.kind === 'quest'
        ? 'quest'
        : item.kind === 'loot'
          ? 'loot'
          : item.kind === 'combat'
            ? 'combat'
            : item.kind === 'success'
              ? 'success'
              : item.kind === 'warn'
                ? 'warn'
                : item.kind === 'travel'
                  ? 'travel'
                  : 'system';
  return {
    id: resolveSystemMsgIdFromNotice(item),
    text: item.text,
    kind,
    from: item.from,
    occurredAt: item.occurredAt ?? Date.now(),
    persistUntilAck: Boolean(item.persistUntilAck),
    structured: item.structured,
    structuredGroup: (item as any).structuredGroup,
  } as any;
}
/**
 * MainNoticeStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainNoticeStateSource = ReturnType<typeof createMainNoticeStateSource>;
/**
 * createMainNoticeStateSource：构建并返回目标对象。
 * @param options MainNoticeStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainNotice状态来源相关状态。
 */


export function createMainNoticeStateSource(options: MainNoticeStateSourceOptions) {
  return {  
  /**
 * handleSystemMsg：处理SystemMsg并更新相关状态。
 * @param data S2C_SystemMsg 原始数据。
 * @returns 无返回值，直接更新SystemMsg相关状态。
 */

    handleSystemMsg(data: S2C_SystemMsg): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      // 服务端指令：打开面板（useBehavior 类物品触发）
      const structured = data.structured as { key?: string; vars?: Record<string, string> } | undefined;
      if (structured?.key === 'notice.item.open-panel' && structured.vars?.panel) {
        options.onOpenPanel?.(structured.vars.panel);
        return;
      }

      const rawText = typeof data.text === 'string' ? data.text.trim() : '';
      if (!rawText) {
        return;
      }
      if (data.kind === 'chat') {
        void options.chatUI.addMessage(rawText, data.from, data.kind);
        return;
      }
      if (data.kind === 'grudge') {
        const text = resolveClientNoticeText(rawText, data.structured, (data as any).structuredGroup);
        void options.chatUI.addMessage(text, data.from ?? t('notice.channel.grudge', undefined), data.kind, {
          id: data.id,
          at: data.occurredAt,
        }).then((stored) => {
          if (stored && data.persistUntilAck === true && data.id) {
            options.ackSystemMessages([data.id]);
          }
        });
        options.showToast(text, data.kind);
        return;
      }
      if (data.kind === 'quest' || data.kind === 'combat' || data.kind === 'loot') {
        const label = data.from ?? (
          data.kind === 'quest'
            ? t('notice.channel.quest', undefined)
            : data.kind === 'combat'
              ? t('notice.channel.combat', undefined)
              : t('notice.channel.loot', undefined)
        );
        const structuredGroup = (data as any).structuredGroup as unknown[] | undefined;
        const text = resolveClientNoticeText(rawText, data.structured, structuredGroup);
        void options.chatUI.addMessage(text, label, data.kind, data.structured || structuredGroup ? {
          ...(data.structured ? { structured: data.structured } : undefined),
          ...(structuredGroup ? { structuredGroup } : undefined),
        } : undefined);
        if (data.kind === 'quest' || data.kind === 'loot') {
          options.showToast(text, data.kind);
        }
        return;
      }
      if (data.kind === 'success' || data.kind === 'warn' || data.kind === 'travel') {
        const label = data.from ?? (
          data.kind === 'success'
            ? t('notice.channel.success', undefined)
            : data.kind === 'warn'
              ? t('notice.channel.warn', undefined)
              : t('notice.channel.travel', undefined)
        );
        const structuredGroup = (data as any).structuredGroup as unknown[] | undefined;
        const text = resolveClientNoticeText(rawText, data.structured, structuredGroup);
        void options.chatUI.addMessage(text, label, data.kind, data.structured || structuredGroup ? {
          ...(data.structured ? { structured: data.structured } : undefined),
          ...(structuredGroup ? { structuredGroup } : undefined),
        } : undefined);
        options.showToast(text, data.kind);
        return;
      }
      const fallbackKind = data.kind === 'info' ? 'system' : data.kind ?? 'system';
      const structuredGroup = (data as any).structuredGroup as unknown[] | undefined;
      const text = resolveClientNoticeText(rawText, data.structured, structuredGroup);
      void options.chatUI.addMessage(text, data.from ?? t('notice.channel.system', undefined), fallbackKind, data.structured || structuredGroup ? {
        ...(data.structured ? { structured: data.structured } : undefined),
        ...(structuredGroup ? { structuredGroup } : undefined),
      } : undefined);
      if (text === t('notice.rewrite.unreachable', undefined)
        || text === t('notice.rewrite.target-too-far', undefined)) {
        options.clearCurrentPath();
      }
      options.showToast(text, fallbackKind);
    },
    /**
 * handleNotice：处理Notice并更新相关状态。
 * @param payload S2C_Notice 载荷参数。
 * @returns 无返回值，直接更新Notice相关状态。
 */


    handleNotice(payload: S2C_Notice): void {
      const merged = mergeCombatSkillNotices(payload.items);
      for (const item of merged) {
        const combatGroup = ((item as any).combatGroup ?? (item as any)._combatGroup) as unknown[] | undefined;
        if (item.kind === 'combat' && (item.combat || combatGroup)) {
          const label = item.from ?? t('notice.channel.combat', undefined);
          const combat = item.combat ?? combatGroup?.[0];
          void options.chatUI.addMessage(item.text, label, 'combat', {
            ...(combat ? { combat } : undefined),
            ...(combatGroup ? { combatGroup } : undefined),
          });
        } else {
          this.handleSystemMsg(toSystemMsgFromNotice(item));
        }
      }
    },
  };
}

function resolveClientNoticeText(rawText: string, structured?: unknown, structuredGroup?: unknown[]): string {
  const normalizedText = rewriteClientNoticeText(rawText);
  return resolveStructuredNoticeText(normalizedText, structured, structuredGroup);
}

function rewriteClientNoticeText(rawText: string): string {
  if (rawText === '目标过远，无法规划路径') {
    return t('notice.rewrite.target-too-far', undefined);
  }
  if (rawText === '无法到达该位置') {
    return t('notice.rewrite.unreachable', undefined);
  }
  return rawText;
}

/** 匹配"你对{target}施展{skill}，..."格式的战斗伤害消息。 */
const SKILL_CAST_PATTERN = /^你对(.+?)施展(.+?)，(.+)$/;
/** 匹配"{target} 被你斩杀"格式的击杀消息。 */
const KILL_PATTERN = /^(.+?) 被你斩杀$/;

/** 合并同一技能对多目标的连续战斗消息为单条多行消息。 */
function mergeCombatSkillNotices(items: S2C_NoticeItem[]): S2C_NoticeItem[] {
  if (items.length <= 1) {
    return items;
  }

  // 按castId分组
  const castGroups = new Map<string, S2C_NoticeItem[]>();
  const result: S2C_NoticeItem[] = [];
  const castOrder: string[] = [];
  const nonCastItems: { index: number; item: S2C_NoticeItem }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.castId) {
      if (!castGroups.has(item.castId)) {
        castGroups.set(item.castId, []);
        castOrder.push(item.castId);
      }
      castGroups.get(item.castId)!.push(item);
    } else {
      nonCastItems.push({ index: i, item });
    }
  }

  if (castGroups.size === 0) {
    return items;
  }

  let nonCastIdx = 0;
  for (const cid of castOrder) {
    const group = castGroups.get(cid)!;
    const firstGroupItem = items.indexOf(group[0]);
    while (nonCastIdx < nonCastItems.length && nonCastItems[nonCastIdx].index < firstGroupItem) {
      result.push(nonCastItems[nonCastIdx].item);
      nonCastIdx++;
    }
    result.push(mergeCastGroup(group));
  }
  while (nonCastIdx < nonCastItems.length) {
    result.push(nonCastItems[nonCastIdx].item);
    nonCastIdx++;
  }
  return result;
}

/** 合并同一castId的消息组为单条消息（使用combat结构化数据）。 */
function mergeCastGroup(group: S2C_NoticeItem[]): S2C_NoticeItem {
  // 过滤出有combat字段的消息（击杀消息没有combat）
  const combatItems = group.filter(g => g.combat);
  const killItems = group.filter(g => !g.combat && KILL_PATTERN.test(g.text));

  // 如果没有combat字段，保留原始文本
  if (combatItems.length === 0) {
    return group[0];
  }

  // 收集击杀目标
  const pendingKills = new Map<string, number>();
  for (const ki of killItems) {
    const m = KILL_PATTERN.exec(ki.text);
    if (m) pendingKills.set(m[1], (pendingKills.get(m[1]) ?? 0) + 1);
  }

  // 标记击杀
  for (const ci of combatItems) {
    const target = ci.combat!.target;
    const killCount = pendingKills.get(target) ?? 0;
    if (killCount > 0) {
      ci.combat!.killed = true;
      if (killCount <= 1) pendingKills.delete(target);
      else pendingKills.set(target, killCount - 1);
    }
  }

  const baseItem = combatItems[0];
  if (combatItems.length === 1) {
    return baseItem;
  }

  // 多目标：合并combat数组到第一条消息
  const combatGroup = Array.isArray((baseItem as any).combatGroup) && (baseItem as any).combatGroup.length > 0
    ? (baseItem as any).combatGroup
    : combatItems.map(i => i.combat!).filter(Boolean);
  return { ...baseItem, combat: baseItem.combat, combatGroup, _combatGroup: combatGroup } as any;
}
