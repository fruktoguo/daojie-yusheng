import { S2C_Notice, S2C_NoticeItem, S2C_SystemMsg } from '@mud/shared';
import { ChatUI } from './ui/chat';
import { t } from './ui/i18n';
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
    occurredAt: item.occurredAt,
    persistUntilAck: item.persistUntilAck,
  };
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

      const rawText = typeof data.text === 'string' ? data.text.trim() : '';
      if (!rawText) {
        return;
      }
      if (data.kind === 'chat') {
        void options.chatUI.addMessage(rawText, data.from, data.kind);
        return;
      }
      if (data.kind === 'grudge') {
        void options.chatUI.addMessage(rawText, data.from ?? t('notice.channel.grudge', undefined), data.kind, {
          id: data.id,
          at: data.occurredAt,
        }).then((stored) => {
          if (stored && data.persistUntilAck === true && data.id) {
            options.ackSystemMessages([data.id]);
          }
        });
        options.showToast(rawText, data.kind);
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
        void options.chatUI.addMessage(rawText, label, data.kind);
        if (data.kind === 'quest' || data.kind === 'loot') {
          options.showToast(rawText, data.kind);
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
        const text = rewriteClientNoticeText(rawText);
        void options.chatUI.addMessage(text, label, data.kind);
        options.showToast(text, data.kind);
        return;
      }
      const fallbackKind = data.kind === 'info' ? 'system' : data.kind ?? 'system';
      const text = rewriteClientNoticeText(rawText);
      void options.chatUI.addMessage(text, data.from ?? t('notice.channel.system', undefined), fallbackKind);
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
        this.handleSystemMsg(toSystemMsgFromNotice(item));
      }
    },
  };
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
  // 记录每个castId第一次出现的位置，用于保持顺序
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

  // 如果没有castId分组，回退到无castId的处理
  if (castGroups.size === 0) {
    return mergeCombatSkillNoticesLegacy(items);
  }

  // 按castId顺序处理每组
  let nonCastIdx = 0;
  for (const cid of castOrder) {
    const group = castGroups.get(cid)!;
    // 输出在此castId之前的非castId消息
    const firstGroupItem = items.indexOf(group[0]);
    while (nonCastIdx < nonCastItems.length && nonCastItems[nonCastIdx].index < firstGroupItem) {
      result.push(nonCastItems[nonCastIdx].item);
      nonCastIdx++;
    }
    // 合并此组
    result.push(mergeCastGroup(group));
  }
  // 输出剩余的非castId消息
  while (nonCastIdx < nonCastItems.length) {
    result.push(nonCastItems[nonCastIdx].item);
    nonCastIdx++;
  }
  return result;
}

/** 合并同一castId的消息组为单条消息。 */
function mergeCastGroup(group: S2C_NoticeItem[]): S2C_NoticeItem {
  // 收集kills和damages
  const pendingKills = new Map<string, number>();
  interface HitEntry { target: string; suffix: string; killed: boolean }
  const hits: HitEntry[] = [];
  let skillName = '';

  for (const item of group) {
    const killMatch = KILL_PATTERN.exec(item.text);
    if (killMatch) {
      pendingKills.set(killMatch[1], (pendingKills.get(killMatch[1]) ?? 0) + 1);
      continue;
    }
    const damageMatch = SKILL_CAST_PATTERN.exec(item.text);
    if (damageMatch) {
      if (!skillName) skillName = damageMatch[2];
      const target = damageMatch[1];
      const killCount = pendingKills.get(target) ?? 0;
      const killed = killCount > 0;
      if (killed) {
        if (killCount <= 1) pendingKills.delete(target);
        else pendingKills.set(target, killCount - 1);
      }
      hits.push({ target, suffix: damageMatch[3], killed });
    }
  }

  const baseItem = group.find(g => SKILL_CAST_PATTERN.test(g.text)) ?? group[0];
  if (hits.length <= 1) {
    const hit = hits[0];
    if (!hit) return baseItem;
    const text = hit.killed
      ? `你对${hit.target}施展${skillName}，${appendKillLabel(hit.suffix)}`
      : `你对${hit.target}施展${skillName}，${hit.suffix}`;
    return { ...baseItem, text };
  }

  const lines: string[] = [];
  for (let j = 0; j < hits.length; j++) {
    const hit = hits[j];
    const suffixText = hit.killed ? appendKillLabel(hit.suffix) : hit.suffix;
    if (j === 0) {
      lines.push(`你施展${skillName} 对${hit.target}，${suffixText}`);
    } else {
      lines.push(`对${hit.target}，${suffixText}`);
    }
  }
  return { ...baseItem, text: lines.join('\n') };
}

/** 无castId时的回退合并逻辑（兼容旧消息）。 */
function mergeCombatSkillNoticesLegacy(items: S2C_NoticeItem[]): S2C_NoticeItem[] {
  const result: S2C_NoticeItem[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind !== 'combat') {
      result.push(item);
      i += 1;
      continue;
    }
    let firstDamageIdx = -1;
    for (let j = i; j < items.length; j++) {
      if (items[j].kind !== 'combat') break;
      if (SKILL_CAST_PATTERN.test(items[j].text)) {
        firstDamageIdx = j;
        break;
      }
    }
    if (firstDamageIdx < 0) {
      result.push(item);
      i += 1;
      continue;
    }
    const firstDamageMatch = SKILL_CAST_PATTERN.exec(items[firstDamageIdx].text)!;
    const skillName = firstDamageMatch[2];
    const pendingKills = new Map<string, number>();
    interface HitEntry { target: string; suffix: string; killed: boolean }
    const hits: HitEntry[] = [];
    const otherCombatItems: S2C_NoticeItem[] = [];
    while (i < items.length) {
      const cur = items[i];
      if (cur.kind !== 'combat') break;
      const curKill = KILL_PATTERN.exec(cur.text);
      if (curKill) {
        pendingKills.set(curKill[1], (pendingKills.get(curKill[1]) ?? 0) + 1);
        i += 1;
        continue;
      }
      const curDamage = SKILL_CAST_PATTERN.exec(cur.text);
      if (curDamage && curDamage[2] === skillName) {
        const target = curDamage[1];
        const killCount = pendingKills.get(target) ?? 0;
        const killed = killCount > 0;
        if (killed) {
          if (killCount <= 1) pendingKills.delete(target);
          else pendingKills.set(target, killCount - 1);
        }
        hits.push({ target, suffix: curDamage[3], killed });
        i += 1;
        continue;
      }
      otherCombatItems.push(cur);
      i += 1;
    }
    if (hits.length === 0) {
      result.push(item);
      continue;
    }
    const baseItem = items[firstDamageIdx];
    if (hits.length === 1) {
      const hit = hits[0];
      if (hit.killed) {
        result.push({ ...baseItem, text: `你对${hit.target}施展${skillName}，${appendKillLabel(hit.suffix)}` });
      } else {
        result.push({ ...baseItem, text: `你对${hit.target}施展${skillName}，${hit.suffix}` });
      }
    } else {
      const lines: string[] = [];
      for (let j = 0; j < hits.length; j++) {
        const hit = hits[j];
        const suffixText = hit.killed ? appendKillLabel(hit.suffix) : hit.suffix;
        if (j === 0) {
          lines.push(`你施展${skillName} 对${hit.target}，${suffixText}`);
        } else {
          lines.push(`对${hit.target}，${suffixText}`);
        }
      }
      result.push({ ...baseItem, text: lines.join('\n') });
    }
    for (const other of otherCombatItems) {
      result.push(other);
    }
  }
  return result;
}
/** 在伤害后缀的括号内追加"击杀"标签。 */
function appendKillLabel(suffix: string): string {
  // 匹配末尾的（...）括号
  const bracketMatch = /（([^）]+)）$/.exec(suffix);
  if (bracketMatch) {
    return suffix.slice(0, bracketMatch.index) + `（${bracketMatch[1]}、击杀）`;
  }
  // 没有括号则追加
  return suffix + '（击杀）';
}
