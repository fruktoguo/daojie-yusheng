import type { MonsterTier } from '@mud/shared';

/** MonsterPresentation：定义该接口的能力与字段约束。 */
export interface MonsterPresentation {
/** label：定义该变量以承载业务值。 */
  label: string;
  badgeText?: string;
  badgeClassName?: string;
/** scale：定义该变量以承载业务值。 */
  scale: number;
}

/** sanitizeMonsterName：执行对应的业务逻辑。 */
export function sanitizeMonsterName(name: string | undefined, tier: MonsterTier | undefined): string {
/** fallback：定义该变量以承载业务值。 */
  const fallback = name?.trim() || '未知妖兽';
  if (tier !== 'variant') {
    return fallback;
  }
/** sanitized：定义该变量以承载业务值。 */
  const sanitized = fallback.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : fallback;
}

/** getMonsterPresentation：执行对应的业务逻辑。 */
export function getMonsterPresentation(
  name: string | undefined,
  tier: MonsterTier | undefined,
): MonsterPresentation {
/** label：定义该变量以承载业务值。 */
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

