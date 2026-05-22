/**
 * 本文件负责 拾取 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback } from 'react';
import type { LootWindowState } from '@mud/shared';
import { getTechniqueGradeLabel } from '../../../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../../utils/number';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface LootPanelState {
  windowState: LootWindowState | null;
  suppressAutoOpen: boolean;
}

export const { store: lootPanelStore, useStore: useLootPanelStore } = createPanelStore<LootPanelState>({
  windowState: null,
  suppressAutoOpen: false,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface LootPanelCallbacks {
  onTake: ((sourceId: string, itemKey: string) => void) | null;
  onTakeAll: ((sourceId: string) => void) | null;
  onStartGather: ((sourceId: string, itemKey: string) => void) | null;
  onCancelGather: (() => void) | null;
  onStopHarvest: (() => void) | null;
  onManualClose: (() => void) | null;
}

const callbacks: LootPanelCallbacks = {
  onTake: null,
  onTakeAll: null,
  onStartGather: null,
  onCancelGather: null,
  onStopHarvest: null,
  onManualClose: null,
};

export function setLootPanelCallbacks(cbs: Partial<LootPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── 辅助逻辑 ────────────────────────────────────────────────────────────────

type LootHerbExtras = {
  variant?: string;
  herb?: { grade?: string; level?: number; gatherTicks?: number; respawnRemainingTicks?: number };
  destroyed?: boolean;
};

function readLootHerbExtras(source: LootWindowState['sources'][number]): LootHerbExtras {
  return source as LootWindowState['sources'][number] & LootHerbExtras;
}

function isHarvestSource(source: LootWindowState['sources'][number]): boolean {
  return source.kind === 'ground' && source.searchable;
}

function getSourceSubtitle(source: LootWindowState['sources'][number]): string {
  const extras = readLootHerbExtras(source);
  const isHerb = extras.variant === 'herb';
  const herbGrade = extras.herb?.grade;
  const gradeLabel = getTechniqueGradeLabel((isHerb ? herbGrade : source.grade) ?? '', (isHerb ? herbGrade : source.grade) ?? '');
  if (isHerb) return t('loot.source.herb-gather', { grade: gradeLabel ? ` · ${gradeLabel}` : '' });
  if (source.kind === 'ground') return t('loot.source.ground');
  return t('loot.source.container-search', { grade: gradeLabel ? ` · ${gradeLabel}` : '' });
}

function getSearchHeading(source: LootWindowState['sources'][number]): string {
  if (readLootHerbExtras(source).variant === 'herb') return t('loot.search.heading.herb');
  return isHarvestSource(source) ? t('loot.search.heading.harvest') : t('loot.search.heading.search');
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

/** 拾取面板内容（嵌入 DetailModal body） */
export function LootPanelContent() {
  const { windowState } = useLootPanelStore();

  if (!windowState) return null;

  return (
    <div className="loot-shell">
      {windowState.sources.map((source) => (
        <LootSourceSection key={source.sourceId} source={source} />
      ))}
    </div>
  );
}

/** 获取弹层 meta */
export function getLootModalMeta(windowState: LootWindowState) {
  const useHerbVariant = windowState.sources.some((s) => readLootHerbExtras(s).variant === 'herb');
  return {
    title: windowState.title,
    subtitle: t('loot.modal.subtitle.coords', { x: windowState.tileX, y: windowState.tileY }),
    hint: t('common.modal.click-blank-close'),
    variantClass: useHerbVariant ? 'detail-modal--herb-gather' : 'detail-modal--loot',
  };
}

const LootSourceSection = memo(function LootSourceSection({ source }: { source: LootWindowState['sources'][number] }) {
  const extras = readLootHerbExtras(source);
  const isHerb = extras.variant === 'herb';
  const harvestSrc = isHarvestSource(source);
  const harvesting = Boolean(source.search && source.search.remainingTicks > 0);

  const handleTakeAll = useCallback(() => {
    callbacks.onTakeAll?.(source.sourceId);
  }, [source.sourceId]);

  const handleStopHarvest = useCallback(() => {
    callbacks.onStopHarvest?.();
  }, []);

  const handleCancelGather = useCallback(() => {
    callbacks.onCancelGather?.();
  }, []);

  return (
    <section className={`loot-source-section${isHerb ? ' loot-source-section--herb' : ''}`} data-loot-source-section={source.sourceId}>
      {/* Head */}
      <div className="loot-source-head">
        <div>
          <div className="loot-source-title">{source.title}</div>
          <div className="loot-source-subtitle">{getSourceSubtitle(source)}</div>
        </div>
        <div className="loot-source-actions">
          {source.items.length > 0 && !harvestSrc && !isHerb && (
            <button className="small-btn" type="button" onClick={handleTakeAll}>
              {t('loot.action.take-all')}
            </button>
          )}
          {!isHerb && source.search && source.search.remainingTicks > 0 && (
            <button className={`small-btn ${harvestSrc ? 'danger' : 'ghost'}`} type="button" onClick={handleStopHarvest}>
              {harvestSrc ? t('loot.action.stop-gather') : t('loot.action.stop-search')}
            </button>
          )}
          {source.desc && <div className="loot-source-desc">{source.desc}</div>}
        </div>
      </div>

      {/* Herb summary */}
      {isHerb && extras.herb && (
        <HerbSummary source={source} extras={extras} harvesting={harvesting} onCancelGather={handleCancelGather} />
      )}

      {/* Search state */}
      {source.search && source.search.remainingTicks > 0 && (
        <div className="loot-search-state">
          <div className="loot-search-copy">
            <strong>{getSearchHeading(source)}</strong>
            <span>{t('loot.search.progress', { elapsed: formatDisplayInteger(source.search.elapsedTicks), total: formatDisplayInteger(source.search.totalTicks) })}</span>
          </div>
          <div className="loot-search-bar">
            <span className="loot-search-fill" style={{ width: `${Math.max(0, Math.min(100, (source.search.elapsedTicks / Math.max(1, source.search.totalTicks)) * 100))}%` }} />
          </div>
        </div>
      )}

      {/* Items */}
      <LootItemsGrid source={source} isHerb={isHerb} harvesting={harvesting} />
    </section>
  );
});

function HerbSummary({ source, extras, harvesting, onCancelGather }: {
  source: LootWindowState['sources'][number];
  extras: LootHerbExtras;
  harvesting: boolean;
  onCancelGather: () => void;
}) {
  const herb = extras.herb!;
  const totalCount = source.items.reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.item.count || 0)), 0);
  const gradeLabel = herb.grade ? getTechniqueGradeLabel(herb.grade, herb.grade) : '';
  const respawnRemainingTicks = typeof herb.respawnRemainingTicks === 'number'
    ? Math.max(0, Math.floor(herb.respawnRemainingTicks))
    : undefined;

  return (
    <div className="herb-gather-summary">
      <div className="herb-gather-summary-meta">
        {gradeLabel && <span>{gradeLabel}</span>}
        <span>LV {formatDisplayInteger(herb.level ?? 1)}</span>
        <span>{t('loot.herb.gather-ticks', { ticks: formatDisplayInteger(herb.gatherTicks ?? 0) })}</span>
        <span>{t('loot.herb.stock-count', { count: formatDisplayInteger(totalCount) })}</span>
        <span>
          {respawnRemainingTicks !== undefined
            ? t('loot.herb.respawn-ticks', { ticks: formatDisplayInteger(Math.max(1, respawnRemainingTicks)) })
            : extras.destroyed ? t('loot.herb.respawning') : t('loot.herb.available')}
        </span>
      </div>
      {harvesting && (
        <div className="herb-gather-summary-actions">
          <button className="small-btn danger" type="button" onClick={onCancelGather}>
            {t('loot.action.stop-gather')}
          </button>
        </div>
      )}
    </div>
  );
}

function LootItemsGrid({ source, isHerb, harvesting }: {
  source: LootWindowState['sources'][number];
  isHerb: boolean;
  harvesting: boolean;
}) {
  if (source.items.length <= 0) {
    return <div className="loot-source-empty">{source.emptyText ?? t('loot.empty.none')}</div>;
  }

  return (
    <div className={`inventory-grid ${isHerb ? 'herb-gather-grid' : 'loot-item-grid'}`}>
      {source.items.map((entry) => (
        <LootItemCell
          key={entry.itemKey}
          entry={entry}
          sourceId={source.sourceId}
          sourceKind={source.kind}
          isHerb={isHerb}
          harvesting={harvesting}
        />
      ))}
    </div>
  );
}

const LootItemCell = memo(function LootItemCell({ entry, sourceId, sourceKind, isHerb, harvesting }: {
  entry: LootWindowState['sources'][number]['items'][number];
  sourceId: string;
  sourceKind: string;
  isHerb: boolean;
  harvesting: boolean;
}) {
  const handleClick = useCallback(() => {
    if (isHerb) {
      callbacks.onStartGather?.(sourceId, entry.itemKey);
    } else {
      callbacks.onTake?.(sourceId, entry.itemKey);
    }
  }, [sourceId, entry.itemKey, isHerb]);

  return (
    <div className={isHerb ? 'herb-gather-card' : 'inventory-cell'}>
      <div className="inventory-cell-head">
        <span className="inventory-cell-type">
          {isHerb ? t('loot.item.type.current-stock') : sourceKind === 'ground' ? t('loot.item.type.ground') : t('loot.item.type.container')}
        </span>
        <span className="inventory-cell-count">{formatDisplayCountBadge(entry.item.count)}</span>
      </div>
      <div className="inventory-cell-name" aria-label={isHerb ? t('loot.herb.start-title') : entry.item.name}>
        {isHerb ? t('loot.herb.start-hint') : entry.item.name}
      </div>
      <div className="inventory-cell-actions">
        <button
          className="small-btn"
          type="button"
          disabled={isHerb && harvesting}
          onClick={handleClick}
        >
          {isHerb ? (harvesting ? t('loot.action.gathering') : t('loot.action.start-gather')) : t('loot.action.take')}
        </button>
      </div>
    </div>
  );
});
