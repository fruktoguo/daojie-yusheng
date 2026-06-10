/**
 * 本文件属于客户端展示派生层，统一生成实体名牌前置徽记。
 *
 * 维护时只处理表现字段组合，不改变服务端权威状态。
 */
import { getFirstGrapheme, type RenderEntity, type VisibleBuffState } from '@mud/shared';
import { t } from './ui/i18n';

const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

type EntityBadge = NonNullable<RenderEntity['badge']>;

export type NameplateBadgeCarrier = {
  kind?: RenderEntity['kind'];
  badge?: RenderEntity['badge'] | null;
  badges?: RenderEntity['badges'] | null;
  sectMark?: string | null;
  buffs?: readonly Pick<VisibleBuffState, 'buffId' | 'stacks'>[] | null;
};

export function isDemonizedNameplateBuffCarrier(
  buffs: readonly Pick<VisibleBuffState, 'buffId' | 'stacks'>[] | null | undefined,
): boolean {
  return (buffs ?? []).some((buff) => (
    buff.buffId === PVP_SHA_INFUSION_BUFF_ID
    && Math.max(0, Math.round(buff.stacks ?? 0)) > PVP_SHA_DEMONIZED_STACK_THRESHOLD
  ));
}

export function buildEntityNameplateBadges(entity: NameplateBadgeCarrier): RenderEntity['badges'] | undefined {
  const sourceBadges = Array.isArray(entity.badges)
    ? entity.badges
    : entity.badge
      ? [entity.badge]
      : [];
  const baseBadges = sourceBadges
    .map(normalizeBadge)
    .filter((badge): badge is EntityBadge => {
      if (!badge) {
        return false;
      }
      return entity.kind === 'player'
        ? badge.tone !== 'demonic' && badge.tone !== 'sect'
        : true;
    });
  if (entity.kind !== 'player') {
    return baseBadges.length > 0 ? baseBadges : undefined;
  }
  const badges: EntityBadge[] = [];
  if (isDemonizedNameplateBuffCarrier(entity.buffs)) {
    badges.push({ text: t('entity.badge.demonic'), tone: 'demonic' });
  }
  const sectMark = normalizeSectMark(entity.sectMark);
  if (sectMark) {
    badges.push({ text: sectMark, tone: 'sect' });
  }
  badges.push(...baseBadges);
  return badges.length > 0 ? badges : undefined;
}

function normalizeBadge(badge: RenderEntity['badge'] | null | undefined): EntityBadge | null {
  const text = typeof badge?.text === 'string' ? badge.text.trim().normalize('NFC') : '';
  if (!text) {
    return null;
  }
  const tone = badge?.tone;
  return {
    text,
    ...(tone ? { tone } : {}),
  };
}

function normalizeSectMark(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  return normalized ? getFirstGrapheme(normalized) || null : null;
}
