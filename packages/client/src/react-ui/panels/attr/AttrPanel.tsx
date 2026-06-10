/**
 * 本文件负责 属性 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { S2C_AttrUpdate } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import {
  ATTR_COLORS,
  ATTR_ICON_ATLAS_CELLS,
  ATTR_TAB_LABELS,
  type AttrTab,
} from '../../../constants/ui/attr-panel';
import { t } from '../../../ui/i18n';

import type {
  AttrCraftPaneSnapshot,
  AttrNumericCardSnapshot,
  AttrNumericPaneSnapshot,
  AttrPaneSnapshot,
  AttrRadarPaneSnapshot,
} from '../../../ui/panels/attr-panel';

// ─── Store ───────────────────────────────────────────────────────────────────

interface AttrPanelState {
  panes: Record<AttrTab, AttrPaneSnapshot>;
  rawData: S2C_AttrUpdate | null;
  activeTab: AttrTab;
}

const defaultPanes: Record<AttrTab, AttrPaneSnapshot> = {
  base: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  root: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  vein: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  combat: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  qi: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  special: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
  craft: { kind: 'placeholder', message: t('attr.empty.no-data', undefined) },
};

export const { store: attrPanelStore, useStore: useAttrPanelStore } = createPanelStore<AttrPanelState>({
  panes: defaultPanes,
  rawData: null,
  activeTab: 'base',
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface AttrPanelCallbacks {
  onRequestDetail: (() => void) | null;
  onOpenCraftSkill: ((key: string) => void) | null;
  onBindCraftSkill: ((key: string) => void) | null;
  onSwitchTab: ((tab: AttrTab) => void) | null;
}

const callbacks: AttrPanelCallbacks = {
  onRequestDetail: null,
  onOpenCraftSkill: null,
  onBindCraftSkill: null,
  onSwitchTab: null,
};

export function setAttrPanelCallbacks(cbs: Partial<AttrPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Main Component ──────────────────────────────────────────────────────────

const TABS = Object.keys(ATTR_TAB_LABELS) as AttrTab[];

function formatRadarNodePercent(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '50%';
  }
  return `${((numeric / 340) * 100).toFixed(3)}%`;
}

function AttrAtlasIcon({ iconKey, className }: { iconKey: string; className: string }) {
  const iconCell = ATTR_ICON_ATLAS_CELLS[iconKey];
  if (!iconCell) {
    return null;
  }
  return (
    <span
      className={className}
      style={{
        '--attr-icon-col': iconCell.col,
        '--attr-icon-row': iconCell.row,
      } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export const AttrPanel = memo(function AttrPanel() {
  const { panes, activeTab } = useAttrPanelStore();

  const activePane = panes[activeTab];

  return (
    <div className="attr-layout">
      <div className="action-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`action-tab-btn${activeTab === tab ? ' active' : ''}`}
            type="button"
            data-attr-tab={tab}
            data-guided-tour-attr-tab={tab}
            onClick={() => callbacks.onSwitchTab?.(tab)}
          >
            {ATTR_TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className="action-tab-pane active">
        <div data-attr-pane={activeTab}>
        <AttrPaneView pane={activePane} />
        </div>
      </div>
    </div>
  );
});

// ─── Pane View ───────────────────────────────────────────────────────────────

const AttrPaneView = memo(function AttrPaneView({ pane }: { pane: AttrPaneSnapshot }) {
  if (pane.kind === 'placeholder') {
    return <div className="panel-section"><div className="empty-hint">{pane.message}</div></div>;
  }
  if (pane.kind === 'numeric') {
    return <NumericPane pane={pane} />;
  }
  if (pane.kind === 'craft') {
    return <CraftPane pane={pane} />;
  }
  return <RadarPane pane={pane} />;
});

// ─── Radar Pane ──────────────────────────────────────────────────────────────

const RadarPane = memo(function RadarPane({ pane }: { pane: AttrRadarPaneSnapshot }) {
  const gradientId = `attr-radar-area-${pane.paneId}`;
  const gradientStops = useMemo(() => {
    return pane.nodes.map((node, i) => {
      const offset = pane.nodes.length === 1 ? '50%' : `${(i / (pane.nodes.length - 1)) * 100}%`;
      return <stop key={i} offset={offset} stopColor={node.color} stopOpacity={0.4} />;
    });
  }, [pane.nodes]);

  return (
    <div className="panel-section">
      <div className="attr-radar-shell">
        <div className="attr-radar-head">
          <div className="attr-radar-title">{pane.title}</div>
          <div className="attr-radar-scale" data-radar-scale="true">{t('attr.radar.scale', { label: pane.scaleLabel })}</div>
        </div>
        <div className="attr-radar-body">
          <svg className="attr-radar" viewBox="0 0 340 340" role="img" aria-label={pane.title}>
            <defs>
              <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="100%">
                {gradientStops}
              </linearGradient>
            </defs>
            {pane.rings.map((points, i) => (
              <polygon key={i} className="attr-radar-ring" points={points} />
            ))}
            {pane.axes.map((axis, i) => (
              <line key={i} className="attr-radar-axis" x1="170" y1="170" x2={axis.x} y2={axis.y} stroke={axis.stroke} />
            ))}
            <polygon
              className="attr-radar-area"
              points={pane.areaPoints}
              fill={`url(#${gradientId})`}
              stroke={pane.nodes[0]?.color ?? ATTR_COLORS[0]}
              strokeWidth={2}
            />
            {pane.nodes.map((node, i) => (
              <g
                key={i}
                className="attr-radar-node"
                data-radar-node={i}
                data-tooltip-key={node.key}
                data-tooltip-title={node.tooltipTitle}
                data-tooltip-detail={node.tooltipDetail}
              >
                <circle className="attr-radar-dot" cx={node.dotX} cy={node.dotY} r="6" fill={node.color} strokeWidth="1.8" />
                <text className="attr-radar-label attr-radar-trigger" x={node.labelX} y={node.labelY} textAnchor="middle" dominantBaseline="middle">{node.label}</text>
                <text className="attr-radar-value attr-radar-trigger" x={node.valueX} y={node.valueY} textAnchor="middle" dominantBaseline="middle">{node.valueLabel}</text>
              </g>
            ))}
          </svg>
          {pane.nodes.map((node, i) => (
            <div
              key={node.key}
              className="attr-radar-icon-node"
              data-radar-icon-node={i}
              data-tooltip-key={node.key}
              style={{ left: formatRadarNodePercent(node.labelX), top: formatRadarNodePercent(node.labelY) }}
              data-tooltip-title={node.tooltipTitle}
              data-tooltip-detail={node.tooltipDetail}
            >
              <AttrAtlasIcon iconKey={node.key} className="attr-radar-icon" />
              <span className="attr-radar-icon-value">{node.valueLabel}</span>
            </div>
          ))}
          {pane.summaryCards?.map((card) => (
            <div
              key={card.key}
              className="attr-radar-floating-stat"
              data-radar-summary-card={card.key}
              data-tooltip-key={card.key}
              data-tooltip-title={card.tooltipTitle}
              data-tooltip-detail={card.tooltipDetail}
            >
              <AttrAtlasIcon iconKey={card.key} className="attr-radar-floating-icon" />
              <span className="attr-radar-floating-label">{card.label}</span>
              <span className="attr-radar-floating-value">{card.value}</span>
            </div>
          ))}
        </div>
      </div>
      {pane.cards && pane.cards.length > 0 && (
        <div className="attr-grid wide attr-radar-extra-grid" data-radar-extra-grid="true">
          {pane.cards.map((card) => <NumericCard key={card.key} card={card} />)}
        </div>
      )}
    </div>
  );
});

// ─── Numeric Pane ────────────────────────────────────────────────────────────

const NumericPane = memo(function NumericPane({ pane }: { pane: AttrNumericPaneSnapshot }) {
  return (
    <div className="panel-section">
      <div className="panel-section-title">{pane.title}</div>
      <div className="attr-grid wide">
        {pane.cards.map((card) => <NumericCard key={card.key} card={card} />)}
      </div>
    </div>
  );
});

// ─── Numeric Card ────────────────────────────────────────────────────────────

const NumericCard = memo(function NumericCard({ card }: { card: AttrNumericCardSnapshot }) {
  return (
    <div
      className={`attr-mini${ATTR_ICON_ATLAS_CELLS[card.key] ? ' attr-mini--with-icon' : ''}`}
      data-tooltip-key={card.key}
      data-tooltip-title={card.tooltipTitle}
      data-tooltip-detail={card.tooltipDetail}
    >
      <div className="attr-mini-main">
        <AttrAtlasIcon iconKey={card.key} className="attr-mini-icon" />
        <div className="attr-mini-value">{card.value}</div>
      </div>
      <div className="attr-mini-label">{card.label}</div>
      {card.sub && <span className="attr-mini-sub">{card.sub}</span>}
    </div>
  );
});

// ─── Craft Pane ──────────────────────────────────────────────────────────────

const CraftPane = memo(function CraftPane({ pane }: { pane: AttrCraftPaneSnapshot }) {
  const handleOpen = useCallback((key: string) => {
    callbacks.onOpenCraftSkill?.(key);
  }, []);

  return (
    <div className="attr-craft-list" data-guided-tour-craft-pane="true">
      {pane.skills.map((skill) => (
        <div
          key={skill.key}
          className="attr-craft-row"
          data-guided-tour-craft-skill={skill.key}
          data-tooltip-key={skill.key}
          data-tooltip-title={skill.tooltipTitle}
          data-tooltip-detail={skill.tooltipDetail}
        >
          <span className="attr-craft-label">{skill.label}</span>
          <strong className="attr-craft-level">{skill.level}</strong>
          <div className="attr-craft-exp">
            <span className="attr-craft-exp-text">{skill.progress}</span>
            <div className="attr-craft-exp-track" aria-hidden="true">
              <span className="attr-craft-exp-fill" style={{ width: skill.progressPercent }} />
            </div>
          </div>
          <span className="attr-craft-remain">{skill.remain}</span>
          {skill.openable && (
            <div className="attr-craft-actions">
              <button
                className="small-btn"
                type="button"
                data-guided-tour-craft-open={skill.key}
                onClick={() => handleOpen(skill.key)}
              >
                {t('attr.craft.open', undefined)}
              </button>
              <button className="small-btn ghost" type="button" onClick={() => callbacks.onBindCraftSkill?.(skill.key)}>
                {skill.bindLabel}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
