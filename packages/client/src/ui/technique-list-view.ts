/**
 * 功法列表的客户端纯展示规则，统一 React 与原生面板的筛选、计数和排序口径。
 */
import {
  compareTechniqueDisplayOrder,
  isTechniqueFullyMastered,
  type PendingTechniqueComprehensionState,
  type TechniqueCategory,
  type TechniqueState,
} from '@mud/shared';

export type TechniqueCategoryFilter = 'all' | TechniqueCategory;
export type TechniqueStatusFilter = 'in_progress' | 'completed' | 'all';
export type TechniquePendingListEntry = PendingTechniqueComprehensionState;

export type TechniqueListEntry =
  | { kind: 'learned'; technique: TechniqueState }
  | { kind: 'pending'; pending: TechniquePendingListEntry };

export interface TechniqueListFilterOptions {
  category: TechniqueCategoryFilter;
  status: TechniqueStatusFilter;
  search?: string;
}

export function resolveTechniqueListCategory(
  entry: Pick<TechniqueState, 'category' | 'skills'> | Pick<TechniquePendingListEntry, 'category'>,
): TechniqueCategory {
  if (entry.category) return entry.category;
  return 'skills' in entry && Array.isArray(entry.skills) && entry.skills.length === 0
    ? 'internal'
    : 'arts';
}

export function matchesLearnedTechniqueStatus(
  technique: TechniqueState,
  status: TechniqueStatusFilter,
): boolean {
  if (status === 'all') return true;
  return status === 'completed'
    ? isTechniqueFullyMastered(technique)
    : !isTechniqueFullyMastered(technique);
}

export function matchesPendingTechniqueFilters(
  pending: TechniquePendingListEntry,
  options: TechniqueListFilterOptions,
): boolean {
  if (options.status === 'completed') return false;
  if (options.category !== 'all' && resolveTechniqueListCategory(pending) !== options.category) return false;
  return matchesTechniqueSearch(pending.name, options.search);
}

export function buildTechniqueListEntries(
  techniques: readonly TechniqueState[],
  pendingComprehensions: readonly TechniquePendingListEntry[],
  options: TechniqueListFilterOptions,
): TechniqueListEntry[] {
  const entries: TechniqueListEntry[] = [];
  for (const technique of techniques) {
    if (options.category !== 'all' && resolveTechniqueListCategory(technique) !== options.category) continue;
    if (!matchesLearnedTechniqueStatus(technique, options.status)) continue;
    if (!matchesTechniqueSearch(technique.name, options.search)) continue;
    entries.push({ kind: 'learned', technique });
  }
  for (const pending of pendingComprehensions) {
    if (matchesPendingTechniqueFilters(pending, options)) {
      entries.push({ kind: 'pending', pending });
    }
  }
  return entries.sort((left, right) => compareTechniqueDisplayOrder(
    left.kind === 'learned' ? left.technique : left.pending,
    right.kind === 'learned' ? right.technique : right.pending,
  ));
}

export function countTechniqueListCategories(
  techniques: readonly TechniqueState[],
  pendingComprehensions: readonly TechniquePendingListEntry[],
  status: TechniqueStatusFilter,
  search = '',
): Record<TechniqueCategoryFilter, number> {
  const counts: Record<TechniqueCategoryFilter, number> = {
    all: 0,
    arts: 0,
    internal: 0,
    divine: 0,
    secret: 0,
  };
  const entries = buildTechniqueListEntries(techniques, pendingComprehensions, {
    category: 'all',
    status,
    search,
  });
  counts.all = entries.length;
  for (const entry of entries) {
    const category = resolveTechniqueListCategory(
      entry.kind === 'learned' ? entry.technique : entry.pending,
    );
    counts[category] += 1;
  }
  return counts;
}

function matchesTechniqueSearch(name: string, search = ''): boolean {
  const normalizedSearch = search.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalizedSearch) return true;
  const normalizedName = name.toLowerCase();
  return normalizedSearch.split(' ').every((term) => normalizedName.includes(term));
}
