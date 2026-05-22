/**
 * 本文件负责 世界 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { useCallback, useMemo, useRef } from 'react';
import type { MapMeta, PlayerState } from '@mud/shared';
import { TECH_REALM_LABELS, WORLD_GUIDE } from '../../../constants/world/world-panel';
import { formatMapRecommendedRealmLabel } from '../../../utils/map-level-display';
import { t } from '../../../ui/i18n';
import { createPanelStore } from '../../stores/create-panel-store';
import { useFloatingTooltip } from '../../hooks/use-floating-tooltip';

// ─── Store ───────────────────────────────────────────────────────────────────

interface WorldPanelState {
  player: PlayerState | null;
  mapMeta: MapMeta | null;
}

export const { store: worldPanelStore, useStore: useWorldPanelStore } = createPanelStore<WorldPanelState>({
  player: null,
  mapMeta: null,
});

// ─── Callbacks (由 bridge 注入) ──────────────────────────────────────────────

let onOpenLeaderboard: (() => void) | null = null;
let onOpenWorldSummary: (() => void) | null = null;

export function setWorldPanelCallbacks(callbacks: {
  onOpenLeaderboard?: () => void;
  onOpenWorldSummary?: () => void;
}): void {
  onOpenLeaderboard = callbacks.onOpenLeaderboard ?? null;
  onOpenWorldSummary = callbacks.onOpenWorldSummary ?? null;
}

// ─── 纯逻辑（从原生面板搬入） ───────────────────────────────────────────────

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

function resolveMapTypeLabel(player: PlayerState): string {
  if (isSectMap(player)) return t('world.panel.map-type.sect');
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  if (instanceId.startsWith('real:') || instanceId.includes(':real:')) return t('world.panel.map-type.real');
  return t('world.panel.map-type.peaceful');
}

function isSectMap(player: PlayerState): boolean {
  const mapId = typeof player.mapId === 'string' ? player.mapId.trim() : '';
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  return mapId.startsWith('sect_domain:') || instanceId.startsWith('sect:');
}

function resolveRecommendedRealmLabel(mapMeta: MapMeta | null): string {
  return formatMapRecommendedRealmLabel(mapMeta?.mapLv);
}

interface WorldPanelSnapshot {
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

function buildSnapshot(player: PlayerState, mapMeta: MapMeta | null): WorldPanelSnapshot {
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
    recommendedRealmLabel: resolveRecommendedRealmLabel(mapMeta),
    realmLabel: inferRealm(player),
    route: guide.route,
    resourcesLabel: guide.resources.join('、') || t('world.panel.resources-empty'),
    threatsLabel: guide.threats.join('、') || t('world.panel.threats-empty'),
    cultivatingName: cultivating?.name ?? t('world.panel.cultivating-empty'),
  };
}

function buildMapTypeTooltipLines(mapTypeLabel: string): string[] {
  if (mapTypeLabel === t('world.panel.map-type.sect')) return [t('world.panel.tooltip.sect')];
  if (mapTypeLabel === t('world.panel.map-type.real')) return [t('world.panel.tooltip.real-pvp'), t('world.panel.tooltip.real-tile')];
  return [t('world.panel.tooltip.peaceful-pvp'), t('world.panel.tooltip.real-tile')];
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function WorldPanel() {
  const { player, mapMeta } = useWorldPanelStore();

  if (!player) {
    return <div className="empty-hint">{t('world.panel.empty-hint')}</div>;
  }

  return (
    <>
      <MapIntelPane player={player} mapMeta={mapMeta} />
    </>
  );
}

export function TianjiPanel() {
  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest<HTMLElement>('[data-world-tianji-action]')?.dataset.worldTianjiAction;
    if (action === 'leaderboard') {
      onOpenLeaderboard?.();
      event.preventDefault();
    } else if (action === 'world') {
      onOpenWorldSummary?.();
      event.preventDefault();
    }
  }, []);

  return (
    <div onClick={handleClick}>
      <div className="panel-section">
        <div className="panel-section-title">{t('world.panel.tianji.title')}</div>
        <div className="panel-subtext">{t('world.panel.tianji.subtitle')}</div>
      </div>
      <div className="tianji-action-list">
        <button className="tianji-action-card" data-world-tianji-action="world" type="button">
          <div>
            <div className="tianji-action-title">{t('world.panel.tianji.world-title')}</div>
            <div className="tianji-action-desc">{t('world.panel.tianji.world-desc')}</div>
          </div>
          <div className="tianji-action-arrow">{t('world.panel.tianji.view')}</div>
        </button>
        <button className="tianji-action-card" data-world-tianji-action="leaderboard" type="button">
          <div>
            <div className="tianji-action-title">{t('world.panel.tianji.leaderboard-title')}</div>
            <div className="tianji-action-desc">{t('world.panel.tianji.leaderboard-desc')}</div>
          </div>
          <div className="tianji-action-arrow">{t('world.panel.tianji.view')}</div>
        </button>
      </div>
    </div>
  );
}

function MapIntelPane({ player, mapMeta }: { player: PlayerState; mapMeta: MapMeta | null }) {
  const snapshot = useMemo(() => buildSnapshot(player, mapMeta), [player, mapMeta]);
  const { show, hide } = useFloatingTooltip();
  const tooltipTargetRef = useRef<HTMLElement | null>(null);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      hide();
      return;
    }
    const badge = target.closest<HTMLElement>('[data-world-map-type="true"]');
    if (!badge) {
      hide();
      tooltipTargetRef.current = null;
      return;
    }
    const label = badge.textContent?.trim() || t('world.panel.map-type.peaceful');
    if (tooltipTargetRef.current !== badge) {
      const lines = buildMapTypeTooltipLines(label);
      show({ title: label, lines }, event.nativeEvent);
      tooltipTargetRef.current = badge;
    }
  }, [show, hide]);

  const handlePointerLeave = useCallback(() => {
    hide();
    tooltipTargetRef.current = null;
  }, [hide]);

  return (
    <div onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      <div className="world-hero compact">
        <div>
          <div className="world-kicker">{snapshot.mapMood}</div>
          <div className="world-title-row">
            <div className="world-title">{snapshot.mapName}</div>
            <span className="world-map-type-badge" data-world-map-type="true">{snapshot.mapTypeLabel}</span>
          </div>
          <div className="world-desc">{snapshot.mapDesc}</div>
        </div>
        <div className="world-danger">
          <div className="world-danger-label">{t('world.panel.label.recommended-realm')}</div>
          <div className="world-danger-value danger-3">{snapshot.recommendedRealmLabel}</div>
        </div>
      </div>
      <div className="info-list">
        <div className="info-line"><span>{t('world.panel.label.current-stage')}</span><strong>{snapshot.realmLabel}</strong></div>
        <div className="info-line"><span>{t('world.panel.label.route')}</span><strong>{snapshot.route}</strong></div>
        <div className="info-line"><span>{t('world.panel.label.resources')}</span><strong>{snapshot.resourcesLabel}</strong></div>
        <div className="info-line"><span>{t('world.panel.label.threats')}</span><strong>{snapshot.threatsLabel}</strong></div>
        <div className="info-line"><span>{t('world.panel.label.cultivating')}</span><strong>{snapshot.cultivatingName}</strong></div>
      </div>
    </div>
  );
}
