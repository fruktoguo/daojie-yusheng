/**
 * 本文件负责 世界 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { useCallback, useRef } from 'react';
import { t } from '../../../ui/i18n';
import { createPanelStore } from '../../stores/create-panel-store';
import { useFloatingTooltip } from '../../hooks/use-floating-tooltip';
import {
  buildMapTypeTooltipLines,
  type WorldPanelSnapshot,
} from '../../../ui/panels/world-panel-projection';

// ─── Store ───────────────────────────────────────────────────────────────────

interface WorldPanelState {
  snapshot: WorldPanelSnapshot | null;
}

export const { store: worldPanelStore, useStore: useWorldPanelStore } = createPanelStore<WorldPanelState>({
  snapshot: null,
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

// ─── 组件 ────────────────────────────────────────────────────────────────────

export function WorldPanel() {
  const { snapshot } = useWorldPanelStore();

  if (!snapshot) {
    return <div className="empty-hint">{t('world.panel.empty-hint')}</div>;
  }

  return <MapIntelPane snapshot={snapshot} />;
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

function MapIntelPane({ snapshot }: { snapshot: WorldPanelSnapshot }) {
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
