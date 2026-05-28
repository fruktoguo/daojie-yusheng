/**
 * 本文件负责 功法 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useMemo, useState } from 'react';
import type { PlayerState, TechniqueCategory, TechniqueState } from '@mud/shared';
import { getTechniqueMaxLevel, TECHNIQUE_GRADE_ORDER } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../../domain-labels';
import { getLocalRealmLevelEntry } from '../../../content/local-templates';
import { formatDisplayInteger } from '../../../utils/number';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface TechniquePanelState {
  techniques: TechniqueState[];
  pendingComprehensions: PlayerState['pendingTechniqueComprehensions'];
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
}

const callbacks: TechniquePanelCallbacks = {
  onCultivate: null,
  onToggleSkills: null,
  onOpenDetail: null,
  onCancelTransmission: null,
};

export function setTechniquePanelCallbacks(cbs: Partial<TechniquePanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Types & Helpers ─────────────────────────────────────────────────────────

type TechniqueCategoryFilter = 'all' | TechniqueCategory;
type TechniqueStatusFilter = 'in_progress' | 'completed' | 'all';

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

const GRADE_SORT_INDEX = new Map(TECHNIQUE_GRADE_ORDER.map((g, i) => [g, i] as const));

function resolveTechniqueCategory(tech: TechniqueState): TechniqueCategory {
  return tech.category ?? 'arts';
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

function formatProgressText(tech: TechniqueState): string {
  const maxLevel = getTechniqueMaxLevel(tech.layers, tech.level);
  if (tech.level >= maxLevel) return t('technique.progress.max-level', undefined);
  return `${tech.exp ?? 0} / ${tech.expToNext ?? 0}`;
}

function sortTechniques(techniques: TechniqueState[]): TechniqueState[] {
  return [...techniques].sort((a, b) => {
    const ga = GRADE_SORT_INDEX.get(a.grade!) ?? 99;
    const gb = GRADE_SORT_INDEX.get(b.grade!) ?? 99;
    if (ga !== gb) return gb - ga;
    return (b.level ?? 0) - (a.level ?? 0);
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const TechniquePanel = memo(function TechniquePanel() {
  const { techniques, pendingComprehensions, cultivatingTechId, previewPlayer } = useTechniquePanelStore();
  const [categoryFilter, setCategoryFilter] = useState<TechniqueCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<TechniqueStatusFilter>('in_progress');

  const filtered = useMemo(() => {
    let list = techniques;
    if (categoryFilter !== 'all') {
      list = list.filter((t) => resolveTechniqueCategory(t) === categoryFilter);
    }
    if (statusFilter !== 'all') {
      list = list.filter((t) => {
        const maxLevel = getTechniqueMaxLevel(t.layers, t.level);
        return statusFilter === 'in_progress' ? t.level < maxLevel : t.level >= maxLevel;
      });
    }
    return sortTechniques(list);
  }, [techniques, categoryFilter, statusFilter]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: techniques.length };
    for (const tech of techniques) {
      const cat = resolveTechniqueCategory(tech);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [techniques]);

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
            onClick={() => setCategoryFilter(f.value)}
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
              onClick={() => setStatusFilter(f.value)}
            >
              <span>{f.label}</span>
            </button>
          ))}
        </div>
        <div className="tech-panel-list">
          {(pendingComprehensions ?? []).map((pending) => (
            <PendingTechniqueCard
              key={`pending:${pending.techId}`}
              pending={pending}
              isCultivating={cultivatingTechId === pending.techId}
            />
          ))}
          {filtered.length > 0
            ? filtered.map((tech) => (
              <TechniqueCard
                key={tech.techId}
                tech={tech}
                isCultivating={cultivatingTechId === tech.techId}
                previewPlayer={previewPlayer}
              />
            ))
            : <div className="empty-hint">{resolveFilteredEmptyHint(statusFilter)}</div>}
        </div>
      </div>
    </div>
  );
});

const PendingTechniqueCard = memo(function PendingTechniqueCard({ pending, isCultivating }: {
  pending: NonNullable<PlayerState['pendingTechniqueComprehensions']>[number];
  isCultivating: boolean;
}) {
  const ratio = pending.requiredProgress > 0 ? Math.min(1, pending.progress / pending.requiredProgress) : 0;
  const realmLv = Math.max(1, Math.floor(Number(pending.realmLv) || 1));
  const realmLabel = getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`;
  const handleCultivate = useCallback(() => {
    callbacks.onCultivate?.(isCultivating ? null : pending.techId);
  }, [isCultivating, pending.techId]);
  const handleCancelTransmission = useCallback(() => {
    callbacks.onCancelTransmission?.(pending.techId);
  }, [pending.techId]);
  return (
    <div className={`tech-card pending${isCultivating ? ' cultivating' : ''}`}>
      <button className="tech-card-main" type="button" onClick={handleCultivate}>
        <span className="tech-summary-main">
          <span className="tech-name">{pending.name}</span>
          <span className="tech-badge tech-category">{pending.sourceKind === 'created' ? '自创' : '未领悟'}</span>
          <span className="tech-badge tech-grade">{getTechniqueGradeLabel(pending.grade)}</span>
          <span className="tech-badge tech-category">{getTechniqueCategoryLabel(pending.category)}</span>
          <span className="tech-badge tech-realm-level">{realmLabel}</span>
          {pending.activeTransferJob && <span className="tech-badge tech-grade">{pending.activeTransferJob.status === 'blocked' ? '等待传授' : '传授中'}</span>}
        </span>
        <span className="tech-progress-meta">
          <span className="tech-progress-text">{Math.floor(pending.progress)} / {Math.floor(pending.requiredProgress)}</span>
        </span>
        <span className="tech-progress-bar">
          <span className="tech-progress-fill" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
        </span>
      </button>
      <div className="tech-card-actions">
        <button className={`small-btn ${isCultivating ? 'danger' : 'ghost'}`} type="button" onClick={handleCultivate} disabled={Boolean(pending.activeTransferJob)}>
          {pending.activeTransferJob ? '传授中' : isCultivating ? t('technique.action.cancel-cultivate', undefined) : '设为主修领悟'}
        </button>
        {pending.activeTransferJob && (
          <button className="small-btn danger" type="button" onClick={handleCancelTransmission}>取消传法</button>
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
    <div className={`tech-card${isCultivating ? ' cultivating' : ''}`}>
      <button className="tech-card-main" type="button" onClick={handleOpen}>
        <span className="tech-summary-main">
          <span className="tech-name">{tech.name}</span>
          <span className="tech-badge tech-grade">{gradeLabel}</span>
          <span className="tech-badge tech-category">{categoryLabel}</span>
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
        >
          {isCultivating ? t('technique.action.cancel-cultivate', undefined) : t('technique.action.set-cultivate', undefined)}
        </button>
      </div>
    </div>
  );
});
