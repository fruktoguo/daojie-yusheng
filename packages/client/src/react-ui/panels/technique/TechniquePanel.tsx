/**
 * 本文件负责 功法 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerState, TechniqueCategory, TechniqueState } from '@mud/shared';
import { getTechniqueMaxLevel, isTechniqueFullyMastered, isTechniqueLearnLimitReached } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../../domain-labels';
import { getLocalRealmLevelEntry } from '../../../content/local-templates';
import { formatDisplayInteger } from '../../../utils/number';
import { t } from '../../../ui/i18n';
import {
  buildTechniqueListEntries,
  countTechniqueListCategories,
  resolveTechniqueListCategory,
  type TechniqueCategoryFilter,
  type TechniquePendingListEntry,
  type TechniqueStatusFilter,
} from '../../../ui/technique-list-view';

// ─── Store ───────────────────────────────────────────────────────────────────

interface TechniquePanelState {
  techniques: TechniqueState[];
  pendingComprehensions: TechniquePendingListEntry[];
  cultivatingTechId: string | undefined;
  previewPlayer: PlayerState | null;
}

export const { store: techniquePanelStore, useStore: useTechniquePanelStore } = createPanelStore<TechniquePanelState>({
  techniques: [],
  pendingComprehensions: [],
  cultivatingTechId: undefined,
  previewPlayer: null,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface TechniquePanelCallbacks {
  onCultivate: ((techId: string | null) => void) | null;
  onToggleSkills: ((techId: string, enabled: boolean) => void) | null;
  onOpenDetail: ((techId: string) => void) | null;
  onCancelTransmission: ((techId: string) => void) | null;
  onDiscardPending: ((techId: string) => void) | null;
}

const callbacks: TechniquePanelCallbacks = {
  onCultivate: null,
  onToggleSkills: null,
  onOpenDetail: null,
  onCancelTransmission: null,
  onDiscardPending: null,
};

export function setTechniquePanelCallbacks(cbs: Partial<TechniquePanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Types & Helpers ─────────────────────────────────────────────────────────

const CATEGORY_FILTERS: Array<{ value: TechniqueCategoryFilter; label: string }> = [
  { value: 'all', label: t('technique.filter.category.all', undefined) },
  { value: 'arts', label: t('technique.filter.category.arts', undefined) },
  { value: 'internal', label: t('technique.filter.category.internal', undefined) },
  { value: 'divine', label: t('technique.filter.category.divine', undefined) },
  { value: 'secret', label: t('technique.filter.category.secret', undefined) },
];

const STATUS_FILTERS: Array<{ value: TechniqueStatusFilter; label: string }> = [
  { value: 'in_progress', label: t('technique.filter.status.in-progress', undefined) },
  { value: 'completed', label: t('technique.filter.status.completed', undefined) },
  { value: 'all', label: t('technique.filter.status.all', undefined) },
];

const TECHNIQUE_PANEL_PAGE_SIZE = 12;

function resolveTechniqueCategory(tech: TechniqueState): TechniqueCategory {
  return resolveTechniqueListCategory(tech);
}

function shouldShowSkillToggle(tech: TechniqueState): boolean {
  return Array.isArray(tech.skills) && tech.skills.length > 0;
}

function areSkillsEnabled(tech: TechniqueState, _player: PlayerState | null): boolean {
  return tech.skillsEnabled !== false;
}

function getProgressRatio(tech: TechniqueState): number {
  const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level);
  if (tech.level >= maxLevel) return 1;
  const required = tech.expToNext ?? 1;
  return required > 0 ? Math.min(1, (tech.exp ?? 0) / required) : 0;
}

function isTechniqueCappedBeforeMastery(tech: TechniqueState): boolean {
  return !isTechniqueFullyMastered(tech)
    && (isTechniqueLearnLimitReached(tech) || (tech.expToNext ?? 0) <= 0);
}

function formatProgressText(tech: TechniqueState): string {
  if (isTechniqueCappedBeforeMastery(tech)) return t('technique.progress.fragment-limit', undefined);
  const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level);
  if (tech.level >= maxLevel) return t('technique.progress.max-level', undefined);
  return `${tech.exp ?? 0} / ${tech.expToNext ?? 0}`;
}

function getTechniqueRealmLevelLabel(realmLv: number): string {
  const normalizedRealmLv = Math.max(1, Math.floor(Number(realmLv) || 1));
  return getLocalRealmLevelEntry(normalizedRealmLv)?.displayName ?? `Lv.${formatDisplayInteger(normalizedRealmLv)}`;
}

function getTechniqueRealmLevelData(realmLv: number): { displayName: string; lv: number } {
  const normalizedRealmLv = Math.max(1, Math.floor(Number(realmLv) || 1));
  const displayName = getLocalRealmLevelEntry(normalizedRealmLv)?.displayName ?? `Lv.${formatDisplayInteger(normalizedRealmLv)}`;
  return { displayName, lv: normalizedRealmLv };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const TechniquePanel = memo(function TechniquePanel() {
  const { techniques, pendingComprehensions, cultivatingTechId, previewPlayer } = useTechniquePanelStore();
  const [categoryFilter, setCategoryFilter] = useState<TechniqueCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<TechniqueStatusFilter>('in_progress');
  const [currentPage, setCurrentPage] = useState(1);

  const visibleEntries = useMemo(() => buildTechniqueListEntries(
    techniques,
    pendingComprehensions,
    { category: categoryFilter, status: statusFilter },
  ), [techniques, pendingComprehensions, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / TECHNIQUE_PANEL_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);
  const pagedEntries = useMemo(() => {
    const start = (safePage - 1) * TECHNIQUE_PANEL_PAGE_SIZE;
    return visibleEntries.slice(start, start + TECHNIQUE_PANEL_PAGE_SIZE);
  }, [visibleEntries, safePage]);

  const categoryCounts = useMemo(() => countTechniqueListCategories(
    techniques,
    pendingComprehensions,
    statusFilter,
  ), [techniques, pendingComprehensions, statusFilter]);

  if (techniques.length === 0 && (pendingComprehensions ?? []).length === 0) {
    return <div className="empty-hint">{t('technique.empty.none-learned', undefined)}</div>;
  }

  return (
    <div className="tech-panel-shell">
      <div className="tech-filter-tabs ui-filter-tabs">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            className={`tech-filter-tab ui-filter-tab${categoryFilter === f.value ? ' active' : ''}`}
            type="button"
            onClick={() => {
              setCategoryFilter(f.value);
              setCurrentPage(1);
            }}
          >
            {f.label}
            <span className="tech-filter-count">{categoryCounts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="tech-panel-body">
        <div className="tech-side-tabs">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              className={`tech-side-tab ui-subtab-btn${statusFilter === f.value ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setStatusFilter(f.value);
                setCurrentPage(1);
              }}
            >
              <span>{f.label}</span>
            </button>
          ))}
        </div>
        <div className="tech-panel-list">
          {visibleEntries.length > 0
            ? pagedEntries.map((entry) => entry.kind === 'pending'
              ? (
                <PendingTechniqueCard
                  key={`pending:${entry.pending.techId}`}
                  pending={entry.pending}
                  isCultivating={cultivatingTechId === entry.pending.techId}
                />
              )
              : (
                <TechniqueCard
                  key={entry.technique.techId}
                  tech={entry.technique}
                  isCultivating={cultivatingTechId === entry.technique.techId}
                  previewPlayer={previewPlayer}
                />
              ))
            : <div className="empty-hint">{resolveFilteredEmptyHint(statusFilter)}</div>}
        </div>
      </div>
      {visibleEntries.length > TECHNIQUE_PANEL_PAGE_SIZE && (
        <div className="tech-pagination">
          <button className="small-btn ghost" type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>上一页</button>
          <span className="tech-pagination-status">
            第 {formatDisplayInteger(safePage)} / {formatDisplayInteger(totalPages)} 页 · 共 {formatDisplayInteger(visibleEntries.length)} 门
          </span>
          <button className="small-btn ghost" type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>下一页</button>
        </div>
      )}
    </div>
  );
});

const PendingTechniqueCard = memo(function PendingTechniqueCard({ pending, isCultivating }: {
  pending: TechniquePendingListEntry;
  isCultivating: boolean;
}) {
  const ratio = pending.requiredProgress > 0 ? Math.min(1, pending.progress / pending.requiredProgress) : 0;
  const realmLabel = getTechniqueRealmLevelLabel(pending.realmLv);
  const transferLocked = Boolean(pending.activeTransferJob);
  const selfComprehensionAllowed = pending.selfComprehensionAllowed !== false;
  const canStartCultivating = selfComprehensionAllowed && !transferLocked;
  const startDisabled = !isCultivating && !canStartCultivating;
  const handleCultivate = useCallback(() => {
    if (!isCultivating && !canStartCultivating) return;
    callbacks.onCultivate?.(isCultivating ? null : pending.techId);
  }, [canStartCultivating, isCultivating, pending.techId]);
  const handleCancelTransmission = useCallback(() => {
    callbacks.onCancelTransmission?.(pending.techId);
  }, [pending.techId]);
  const handleDiscardPending = useCallback(() => {
    callbacks.onDiscardPending?.(pending.techId);
  }, [pending.techId]);
  const actionLabel = transferLocked
    ? '传授中'
    : !selfComprehensionAllowed
      ? '需传法领悟'
      : isCultivating
        ? t('technique.action.cancel-cultivate', undefined)
        : '设为主修领悟';
  return (
    <div
      className={`tech-card pending${isCultivating ? ' cultivating' : ''}`}
      data-pending-tech-card={pending.techId}
      data-guided-tour-tech-card="pending"
    >
      <button className="tech-card-main" type="button" onClick={handleCultivate} disabled={startDisabled}>
        <span className="tech-summary-main">
          <span className="tech-name">{pending.name}</span>
          <span className="tech-badge tech-category">未领悟</span>
          {pending.sourceKind === 'created' && <span className="tech-badge tech-category">自创</span>}
          <span className="tech-badge tech-grade">{getTechniqueGradeLabel(pending.grade)}</span>
          <span className="tech-badge tech-category">{getTechniqueCategoryLabel(pending.category)}</span>
          <span className="tech-badge tech-realm-level">
            {(() => { const d = getTechniqueRealmLevelData(pending.realmLv); return <>{d.displayName}<small className="realm-lv-suffix"> lv{d.lv}</small></>; })()}
          </span>
          {pending.activeTransferJob && <span className="tech-badge tech-grade">{pending.activeTransferJob.status === 'blocked' ? '等待传授' : '传授中'}</span>}
          {!selfComprehensionAllowed && <span className="tech-badge tech-grade">需传法</span>}
        </span>
        <span className="tech-progress-meta">
          <span className="tech-progress-text">{Math.floor(pending.progress)} / {Math.floor(pending.requiredProgress)}</span>
        </span>
        <span className="tech-progress-bar">
          <span className="tech-progress-fill" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
        </span>
      </button>
      <div className="tech-card-actions">
        <button
          className={`small-btn ${isCultivating ? 'danger' : 'ghost'}`}
          type="button"
          onClick={handleCultivate}
          disabled={startDisabled}
          data-guided-tour-cultivate-button="true"
        >
          {actionLabel}
        </button>
        {pending.activeTransferJob && (
          <button className="small-btn danger" type="button" onClick={handleCancelTransmission}>取消传法</button>
        )}
        {!pending.activeTransferJob && (
          <button className="small-btn danger" type="button" onClick={handleDiscardPending}>{t('technique.comprehension.discard.action')}</button>
        )}
      </div>
    </div>
  );
});

function resolveFilteredEmptyHint(statusFilter: TechniqueStatusFilter): string {
  if (statusFilter === 'in_progress') {
    return t('technique.empty.no-in-progress', undefined);
  }
  if (statusFilter === 'completed') {
    return t('technique.empty.no-completed', undefined);
  }
  return t('technique.empty.no-filtered', undefined);
}

// ─── Technique Card ──────────────────────────────────────────────────────────

const TechniqueCard = memo(function TechniqueCard({ tech, isCultivating, previewPlayer }: {
  tech: TechniqueState;
  isCultivating: boolean;
  previewPlayer: PlayerState | null;
}) {
  const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level);
  const showSkillToggle = shouldShowSkillToggle(tech);
  const skillsEnabled = showSkillToggle ? areSkillsEnabled(tech, previewPlayer) : false;
  const progressRatio = getProgressRatio(tech);
  const progressText = formatProgressText(tech);
  const categoryLabel = getTechniqueCategoryLabel(resolveTechniqueCategory(tech));
  const gradeLabel = getTechniqueGradeLabel(tech.grade);
  const realmLevelLabel = getTechniqueRealmLevelLabel(tech.realmLv);

  const handleCultivate = useCallback(() => {
    callbacks.onCultivate?.(isCultivating ? null : tech.techId);
  }, [isCultivating, tech.techId]);

  const handleSkillToggle = useCallback(() => {
    callbacks.onToggleSkills?.(tech.techId, !skillsEnabled);
  }, [tech.techId, skillsEnabled]);

  const handleOpen = useCallback(() => {
    callbacks.onOpenDetail?.(tech.techId);
  }, [tech.techId]);

  return (
    <div className={`tech-card${isCultivating ? ' cultivating' : ''}`} data-tech-card={tech.techId}>
      <button className="tech-card-main" type="button" onClick={handleOpen}>
        <span className="tech-summary-main">
          <span className="tech-name">{tech.name}</span>
          <span className="tech-badge tech-grade">{gradeLabel}</span>
          <span className="tech-badge tech-category">{categoryLabel}</span>
          <span className="tech-badge tech-realm-level">
            {(() => { const d = getTechniqueRealmLevelData(tech.realmLv); return <>{d.displayName}<small className="realm-lv-suffix"> lv{d.lv}</small></>; })()}
          </span>
          <span className="tech-layer">{t('technique.card.layer', { level: tech.level, maxLevel })}</span>
        </span>
        <span className="tech-progress-meta">
          <span className="tech-progress-text">{progressText}</span>
        </span>
        <span className="tech-progress-bar">
          <span className="tech-progress-fill" style={{ width: `${(progressRatio * 100).toFixed(2)}%` }} />
        </span>
      </button>
      <div className="tech-card-actions">
        {showSkillToggle && (
          <button
            className={`small-btn ghost${skillsEnabled ? ' active' : ''}`}
            type="button"
            onClick={handleSkillToggle}
          >
            {t('technique.card.skills-toggle', { state: skillsEnabled ? t('common.state.on-short', undefined) : t('common.state.off-short', undefined) })}
          </button>
        )}
        <button
          className={`small-btn${isCultivating ? ' danger' : ''}`}
          type="button"
          onClick={handleCultivate}
          data-tech-cultivate-button={tech.techId}
          data-guided-tour-cultivate-button="true"
        >
          {isCultivating ? t('technique.action.cancel-cultivate', undefined) : t('technique.action.set-cultivate', undefined)}
        </button>
      </div>
    </div>
  );
});
