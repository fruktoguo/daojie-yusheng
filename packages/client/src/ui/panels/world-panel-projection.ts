/**
 * 世界面板的只读展示投影。
 *
 * 这里只从服务端玩家投影与地图元信息派生稳定文案，避免 React store 持有会被原地修改的玩家对象。
 */
import type { MapMeta, PlayerState } from '@mud/shared';
import { TECH_REALM_LABELS, WORLD_GUIDE } from '../../constants/world/world-panel';
import { formatMapRecommendedRealmLabel } from '../../utils/map-level-display';
import { t } from '../i18n';

export interface WorldPanelSnapshot {
  mapName: string;
  mapTypeLabel: string;
  mapMood: string;
  mapDesc: string;
  recommendedRealmLabel: string;
  realmLabel: string;
  route: string;
  resourcesLabel: string;
  threatsLabel: string;
  cultivatingName: string;
}

const WORLD_PANEL_SNAPSHOT_KEYS = [
  'mapName',
  'mapTypeLabel',
  'mapMood',
  'mapDesc',
  'recommendedRealmLabel',
  'realmLabel',
  'route',
  'resourcesLabel',
  'threatsLabel',
  'cultivatingName',
] as const satisfies readonly (keyof WorldPanelSnapshot)[];

function inferRealm(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  let highest = player.techniques[0];
  for (let index = 1; index < player.techniques.length; index += 1) {
    const technique = player.techniques[index];
    if ((technique?.realm ?? -Infinity) > (highest?.realm ?? -Infinity)) {
      highest = technique;
    }
  }
  if (!highest) return t('world.panel.realm-fallback');
  return TECH_REALM_LABELS[highest.realm] ?? t('world.panel.realm-cultivating');
}

function isSectMap(player: PlayerState): boolean {
  const mapId = typeof player.mapId === 'string' ? player.mapId.trim() : '';
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  return mapId.startsWith('sect_domain:') || instanceId.startsWith('sect:');
}

function resolveMapTypeLabel(player: PlayerState): string {
  if (isSectMap(player)) return t('world.panel.map-type.sect');
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  if (instanceId.startsWith('real:') || instanceId.includes(':real:')) {
    return t('world.panel.map-type.real');
  }
  return t('world.panel.map-type.peaceful');
}

export function buildWorldPanelSnapshot(player: PlayerState, mapMeta: MapMeta | null): WorldPanelSnapshot {
  const sectMap = isSectMap(player);
  const guide = WORLD_GUIDE[player.mapId] ?? (sectMap ? {
    title: mapMeta?.name ?? t('world.panel.map-type.sect'),
    route: t('world.panel.sect-fallback.route'),
    mood: t('world.panel.sect-fallback.mood'),
    desc: t('world.panel.sect-fallback.desc'),
    resources: [],
    threats: [],
  } : {
    title: mapMeta?.name ?? t('world.panel.unknown-map.title'),
    route: t('world.panel.unknown-map.route'),
    mood: t('world.panel.unknown-map.mood'),
    desc: t('world.panel.unknown-map.desc'),
    resources: [],
    threats: [],
  });
  const cultivating = player.cultivatingTechId
    ? player.techniques.find((entry) => entry.techId === player.cultivatingTechId)
    : null;

  return {
    mapName: mapMeta?.name ?? guide.title,
    mapTypeLabel: resolveMapTypeLabel(player),
    mapMood: guide.mood,
    mapDesc: guide.desc,
    recommendedRealmLabel: formatMapRecommendedRealmLabel(mapMeta?.mapLv),
    realmLabel: inferRealm(player),
    route: guide.route,
    resourcesLabel: guide.resources.join('、') || t('world.panel.resources-empty'),
    threatsLabel: guide.threats.join('、') || t('world.panel.threats-empty'),
    cultivatingName: cultivating?.name ?? t('world.panel.cultivating-empty'),
  };
}

export function areWorldPanelSnapshotsEqual(
  left: WorldPanelSnapshot | null,
  right: WorldPanelSnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return WORLD_PANEL_SNAPSHOT_KEYS.every((key) => left[key] === right[key]);
}

export function buildMapTypeTooltipLines(mapTypeLabel: string): string[] {
  if (mapTypeLabel === t('world.panel.map-type.sect')) return [t('world.panel.tooltip.sect')];
  if (mapTypeLabel === t('world.panel.map-type.real')) {
    return [t('world.panel.tooltip.real-pvp'), t('world.panel.tooltip.real-tile')];
  }
  return [t('world.panel.tooltip.peaceful-pvp'), t('world.panel.tooltip.real-tile')];
}
