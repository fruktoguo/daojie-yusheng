/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import type { MonsterTier, RenderEntity } from '@mud/shared';
import { t } from './ui/i18n';

/** 怪物在界面中的展示信息。 */
export interface MonsterPresentation {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * badge：badge相关字段。
 */

  badge?: RenderEntity['badge'];  
  /**
 * scale：scale相关字段。
 */

  scale: number;
}

/** 清理怪物名称里的重复修饰词。 */
export function sanitizeMonsterName(name: string | undefined, tier: MonsterTier | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const fallback = name?.trim() || t('entity.monster.unknown');
  if (tier !== 'variant') {
    return fallback;
  }
  const sanitized = fallback.replaceAll(t('entity.monster.elite-keyword'), '').trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

/** 根据怪物阶位生成展示文案与徽记。 */
export function getMonsterPresentation(
  name: string | undefined,
  tier: MonsterTier | undefined,
): MonsterPresentation {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const label = sanitizeMonsterName(name, tier);
  if (tier === 'variant') {
    return {
      label,
      badge: { text: t('entity.badge.variant'), tone: 'variant' },
      scale: 1.2,
    };
  }
  if (tier === 'demon_king') {
    return {
      label,
      badge: { text: t('entity.badge.boss'), tone: 'boss' },
      scale: 1.5,
    };
  }
  return {
    label,
    scale: 1,
  };
}

/** 将实体徽记映射为现有 UI 徽记类名。 */
export function getEntityBadgeClassName(badge: RenderEntity['badge'] | null | undefined): string | null {
  if (!badge) {
    return null;
  }
  if (badge.tone === 'boss') {
    return 'monster-badge monster-badge--boss';
  }
  if (badge.tone === 'demonic') {
    return 'monster-badge monster-badge--demonic';
  }
  if (badge.tone === 'sect') {
    return 'monster-badge monster-badge--sect';
  }
  return 'monster-badge monster-badge--variant';
}
