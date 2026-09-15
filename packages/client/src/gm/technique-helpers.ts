/**
 * gm/technique-helpers.ts —— GM 功法管理器纯辅助函数。
 *
 * 从 gm.ts 抽取：getLearnedTechniqueIdSet/paginateTechniqueEntries/
 * getTechniqueRealmLvFilterValue/buildTechniqueCandidateMeta/
 * matchesTechniqueFilters/getTechniqueCategoryCounts/
 * getTechniqueRealmLevelDisplayLabel。
 * 全部为纯函数，依赖通过参数显式传入，不依赖 gm.ts 模块级状态。
 */

import {
  type GmEditorCatalogRes,
  type GmEditorTechniqueOption,
  type GmGeneratedTechniqueSummary,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueState,
} from '@mud/shared';
import {
  getTechniqueCategoryDisplayLabel as editorGetTechniqueCategoryDisplayLabel,
  getTechniqueGradeDisplayLabel as editorGetTechniqueGradeDisplayLabel,
} from './editor-helpers';

/** GmTechniqueCandidateMeta：功法候选项元数据所需字段。 */
export interface GmTechniqueCandidateMeta {
  source: 'system' | 'generated';
  category?: TechniqueCategory | string | null;
  grade?: string | null;
  realmLv?: number | null;
  techId: string;
}

/** GmTechniqueCandidate：功法候选项。 */
export interface GmTechniqueCandidate {
  source: 'system' | 'generated';
  techId: string;
  name: string;
  category?: TechniqueCategory | string | null;
  grade?: TechniqueGrade | string | null;
  realmLv?: number | null;
  meta: string;
  learned: boolean;
  disabledReason?: string | null;
}

/** getLearnedTechniqueIdSet：读取已学功法 ID 集合。 */
export function getLearnedTechniqueIdSet(techniques: TechniqueState[]): Set<string> {
  return new Set(techniques.map((technique) => technique.techId).filter(Boolean));
}

/** paginateTechniqueEntries：分页功法条目。 */
export function paginateTechniqueEntries<T>(items: T[], page: number, pageSize: number): {
  items: T[];
  page: number;
  total: number;
  totalPages: number;
} {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const offset = (normalizedPage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    page: normalizedPage,
    total,
    totalPages,
  };
}

/** getTechniqueRealmLvFilterValue：读取功法境界等级筛选值。 */
export function getTechniqueRealmLvFilterValue(realmLvFilter: string): number | null {
  const raw = realmLvFilter.trim();
  if (!raw) {
    return null;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
}

/** getTechniqueRealmLevelDisplayLabel：读取功法境界等级显示标签。 */
export function getTechniqueRealmLevelDisplayLabel(
  realmLv: number | null | undefined,
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
): string {
  if (!Number.isFinite(realmLv)) {
    return '境界 Lv.-';
  }
  const level = Math.trunc(Number(realmLv));
  const realm = realmLevels?.find((entry) => entry.realmLv === level);
  return realm ? `${realm.displayName} · Lv.${level}` : `境界 Lv.${level}`;
}

/** getTechniqueCategoryCounts：读取功法分类计数。 */
export function getTechniqueCategoryCounts(
  techniques: TechniqueState[],
  findTechniqueCatalogEntry: (techId: string | undefined) => GmEditorTechniqueOption | null,
): Record<TechniqueCategory, number> {
  const counts: Record<TechniqueCategory, number> = {
    internal: 0,
    arts: 0,
    divine: 0,
    secret: 0,
  };
  for (const technique of techniques) {
    const category = (technique.category || findTechniqueCatalogEntry(technique.techId)?.category || 'internal') as TechniqueCategory;
    if (category in counts) {
      counts[category] += 1;
    }
  }
  return counts;
}

/** buildTechniqueCandidateMeta：构建功法候选项元数据。 */
export function buildTechniqueCandidateMeta(
  candidate: GmTechniqueCandidateMeta,
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
): string {
  const sourceLabel = candidate.source === 'generated' ? '玩家自创' : '系统功法';
  return [
    sourceLabel,
    editorGetTechniqueCategoryDisplayLabel(candidate.category),
    editorGetTechniqueGradeDisplayLabel(candidate.grade),
    getTechniqueRealmLevelDisplayLabel(candidate.realmLv, realmLevels),
    candidate.techId,
  ].filter(Boolean).join(' · ');
}

/** TechniqueFilterState：功法筛选状态。 */
export interface TechniqueFilterState {
  categoryFilter: string;
  gradeFilter: string;
  realmLvFilter: string;
  searchQuery: string;
}

/** matchesTechniqueFilters：判断功法是否匹配筛选条件。 */
export function matchesTechniqueFilters(
  entry: {
    techId: string;
    name?: string | null;
    category?: string | null;
    grade?: string | null;
    realmLv?: number | null;
    meta?: string | null;
  },
  filters: TechniqueFilterState,
): boolean {
  if (filters.categoryFilter !== 'all' && entry.category !== filters.categoryFilter) {
    return false;
  }
  if (filters.gradeFilter !== 'all' && entry.grade !== filters.gradeFilter) {
    return false;
  }
  const realmLvFilter = getTechniqueRealmLvFilterValue(filters.realmLvFilter);
  if (realmLvFilter !== null && Math.trunc(Number(entry.realmLv ?? 0)) !== realmLvFilter) {
    return false;
  }
  const keyword = filters.searchQuery.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  return [
    entry.techId,
    entry.name ?? '',
    entry.meta ?? '',
    editorGetTechniqueCategoryDisplayLabel(entry.category),
    editorGetTechniqueGradeDisplayLabel(entry.grade),
  ].some((value) => value.toLowerCase().includes(keyword));
}

/** getFilteredLearnedTechniques：筛选已学功法并构建元数据。 */
export function getFilteredLearnedTechniques(
  techniques: TechniqueState[],
  findTechniqueCatalogEntry: (techId: string | undefined) => GmEditorTechniqueOption | null,
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
  filters: TechniqueFilterState,
): Array<{ technique: TechniqueState; index: number; meta: string }> {
  return techniques
    .map((technique, index) => {
      const catalogEntry = findTechniqueCatalogEntry(technique.techId);
      const category = technique.category ?? catalogEntry?.category ?? null;
      const grade = technique.grade ?? catalogEntry?.grade ?? null;
      const realmLv = technique.realmLv ?? catalogEntry?.realmLv ?? null;
      const meta = [
        editorGetTechniqueCategoryDisplayLabel(category),
        editorGetTechniqueGradeDisplayLabel(grade),
        getTechniqueRealmLevelDisplayLabel(realmLv, realmLevels),
        `等级 ${Math.max(1, Math.trunc(Number(technique.level) || 1))}`,
        technique.techId,
      ].join(' · ');
      return { technique, index, meta };
    })
    .filter((entry) => matchesTechniqueFilters({
      techId: entry.technique.techId,
      name: entry.technique.name,
      category: entry.technique.category ?? findTechniqueCatalogEntry(entry.technique.techId)?.category ?? null,
      grade: entry.technique.grade ?? findTechniqueCatalogEntry(entry.technique.techId)?.grade ?? null,
      realmLv: entry.technique.realmLv ?? findTechniqueCatalogEntry(entry.technique.techId)?.realmLv ?? null,
      meta: entry.meta,
    }, filters));
}

/** buildSystemTechniqueCandidates：构建系统功法候选项。 */
export function buildSystemTechniqueCandidates(
  learnedIds: Set<string>,
  techniques: GmEditorTechniqueOption[] | undefined,
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
): GmTechniqueCandidate[] {
  return (techniques ?? []).map((option) => {
    const candidate: GmTechniqueCandidate = {
      source: 'system',
      techId: option.id,
      name: option.name,
      category: option.category,
      grade: option.grade,
      realmLv: option.realmLv ?? null,
      meta: '',
      learned: learnedIds.has(option.id),
    };
    candidate.meta = buildTechniqueCandidateMeta(candidate, realmLevels);
    return candidate;
  });
}

/** buildGeneratedTechniqueCandidates：构建自创功法候选项。 */
export function buildGeneratedTechniqueCandidates(
  learnedIds: Set<string>,
  generatedSummaries: GmGeneratedTechniqueSummary[],
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
): GmTechniqueCandidate[] {
  return generatedSummaries.map((summary) => {
    const disabledReason = typeof summary.playerAddDisabledReason === 'string' && summary.playerAddDisabledReason.trim().length > 0
      ? summary.playerAddDisabledReason.trim()
      : null;
    const candidate: GmTechniqueCandidate = {
      source: 'generated',
      techId: summary.id,
      name: summary.name,
      category: summary.category,
      grade: summary.grade,
      realmLv: summary.realmLv ?? null,
      meta: '',
      learned: learnedIds.has(summary.id),
      ...(disabledReason ? { disabledReason } : {}),
    };
    candidate.meta = [buildTechniqueCandidateMeta(candidate, realmLevels), disabledReason].filter(Boolean).join(' · ');
    return candidate;
  });
}

/** getFilteredSystemTechniqueCandidates：筛选系统功法候选项。 */
export function getFilteredSystemTechniqueCandidates(
  learnedIds: Set<string>,
  techniques: GmEditorTechniqueOption[] | undefined,
  realmLevels: GmEditorCatalogRes['realmLevels'] | undefined,
  filters: TechniqueFilterState,
): GmTechniqueCandidate[] {
  return buildSystemTechniqueCandidates(learnedIds, techniques, realmLevels)
    .filter((entry) => matchesTechniqueFilters(entry, filters))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}
