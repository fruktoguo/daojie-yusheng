import type { MonsterTier } from '@mud/shared-next';

/** 怪物在界面中的展示信息。 */
export interface MonsterPresentation {
  label: string;
  badgeText?: string;
  badgeClassName?: string;
  scale: number;
}

/** 清理怪物名称里的重复修饰词。 */
export function sanitizeMonsterName(name: string | undefined, tier: MonsterTier | undefined): string {
  const fallback = name?.trim() || '未知妖兽';
  if (tier !== 'variant') {
    return fallback;
  }
  const sanitized = fallback.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

/** 根据怪物阶位生成展示文案与徽记。 */
export function getMonsterPresentation(
  name: string | undefined,
  tier: MonsterTier | undefined,
): MonsterPresentation {
  const label = sanitizeMonsterName(name, tier);
  if (tier === 'variant') {
    return {
      label,
      badgeText: '异',
      badgeClassName: 'monster-badge monster-badge--variant',
      scale: 1.2,
    };
  }
  if (tier === 'demon_king') {
    return {
      label,
      badgeText: '王',
      badgeClassName: 'monster-badge monster-badge--boss',
      scale: 1.5,
    };
  }
  return {
    label,
    scale: 1,
  };
}

