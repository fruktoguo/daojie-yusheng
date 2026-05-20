import { getLocalRealmLevelEntry } from '../content/local-templates';
import { t } from '../ui/i18n';

/** 将地图等级转换为玩家可读的推荐境界标签。 */
export function formatMapRecommendedRealmLabel(mapLv: number | null | undefined): string {
  const normalized = normalizeMapLv(mapLv);
  if (normalized === null) {
    return t('map-level.unknown');
  }
  const realmName = getLocalRealmLevelEntry(normalized)?.displayName;
  return `${realmName ?? `Lv.${normalized}`} Lv.${normalized}`;
}

/** 生成包含标题的推荐境界展示。 */
export function formatMapRecommendedRealmText(mapLv: number | null | undefined): string {
  return t('map-level.recommended', { realm: formatMapRecommendedRealmLabel(mapLv) });
}

function normalizeMapLv(mapLv: number | null | undefined): number | null {
  const numeric = Number(mapLv);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}
