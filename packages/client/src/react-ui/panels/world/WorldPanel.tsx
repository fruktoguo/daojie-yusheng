/**
 * React 版世界面板
 * 展示当前地图信息与天机阁入口，复用原生面板相同的 DOM 结构和 CSS class
 */
import { useCallback, useMemo, useRef } from 'react';
import type { MapMeta, PlayerState } from '@mud/shared';
import { TECH_REALM_LABELS, WORLD_GUIDE } from '../../../constants/world/world-panel';
import { formatMapRecommendedRealmLabel } from '../../../utils/map-level-display';
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
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

function resolveMapTypeLabel(player: PlayerState): string {
  if (isSectMap(player)) return '宗门';
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  if (instanceId.startsWith('real:') || instanceId.includes(':real:')) return '现世';
  return '虚境';
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
    title: mapMeta?.name ?? '宗门',
    route: '宗门驻地',
    mood: '宗门',
    desc: '宗门驻地。',
    resources: [],
    threats: [],
  } : {
    title: mapMeta?.name ?? player.mapId,
    route: '继续探索当前区域',
    mood: '未知地域',
    desc: '该区域暂无卷宗记载，建议稳步试探。',
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
    resourcesLabel: guide.resources.join('、') || '暂无',
    threatsLabel: guide.threats.join('、') || '未知',
    cultivatingName: cultivating?.name ?? '未设定',
  };
}

function buildMapTypeTooltipLines(mapTypeLabel: string): string[] {
  if (mapTypeLabel === '宗门') return ['宗门驻地'];
  if (mapTypeLabel === '现世') return ['可以对其他修士发起攻击', '可以攻击地块'];
  return ['不能对其他修士发起攻击', '可以攻击地块'];
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function WorldPanel() {
  const { player, mapMeta } = useWorldPanelStore();

  if (!player) {
    return <div className="empty-hint">尚未进入世界</div>;
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
        <div className="panel-section-title">天机阁</div>
        <div className="panel-subtext">阁藏天下卷宗，专收低频榜册与汇总情报。</div>
      </div>
      <div className="tianji-action-list">
        <button className="tianji-action-card" data-world-tianji-action="world" type="button">
          <div>
            <div className="tianji-action-title">世界</div>
            <div className="tianji-action-desc">查看全服灵石总和、行动人数、境界人数，以及击杀与死亡总计。</div>
          </div>
          <div className="tianji-action-arrow">查看</div>
        </button>
        <button className="tianji-action-card" data-world-tianji-action="leaderboard" type="button">
          <div>
            <div className="tianji-action-title">排行榜</div>
            <div className="tianji-action-desc">查看境界、击杀、灵石、死亡、炼体、六维最强与宗门榜单。</div>
          </div>
          <div className="tianji-action-arrow">查看</div>
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
    const label = badge.textContent?.trim() || '虚境';
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
          <div className="world-danger-label">推荐境界</div>
          <div className="world-danger-value danger-3">{snapshot.recommendedRealmLabel}</div>
        </div>
      </div>
      <div className="info-list">
        <div className="info-line"><span>当前阶段</span><strong>{snapshot.realmLabel}</strong></div>
        <div className="info-line"><span>推进路线</span><strong>{snapshot.route}</strong></div>
        <div className="info-line"><span>主要资源</span><strong>{snapshot.resourcesLabel}</strong></div>
        <div className="info-line"><span>主要威胁</span><strong>{snapshot.threatsLabel}</strong></div>
        <div className="info-line"><span>当前主修</span><strong>{snapshot.cultivatingName}</strong></div>
      </div>
    </div>
  );
}
