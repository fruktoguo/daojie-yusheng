/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
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
