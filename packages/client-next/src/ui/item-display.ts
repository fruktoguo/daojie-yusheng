import type {
  ElementKey,
  ItemStack,
  SkillDef,
  SkillDamageKind,
  TechniqueCategory,
  TechniqueGrade,
} from '@mud/shared-next';
import {
  getLocalRealmLevelEntry,
  getLocalTechniqueTemplate,
  resolvePreviewItem,
  resolveTechniqueIdFromBookItemId,
} from '../content/local-templates';
import { getElementKeyLabel, getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../domain-labels';
import { formatDisplayInteger } from '../utils/number';

/** ItemAffinityBadge：定义该接口的能力与字段约束。 */
export interface ItemAffinityBadge {
  label: string;
  title: string;
  tone: 'physical' | 'spell' | 'mixed' | 'utility';
  element: ElementKey | 'multi' | 'neutral';
}

/** ItemDisplayMeta：定义该接口的能力与字段约束。 */
export interface ItemDisplayMeta {
  displayItem: ItemStack;
  grade: TechniqueGrade | null;
  gradeLabel: string | null;
  levelLabel: string | null;
  affinityBadge: ItemAffinityBadge | null;
}

/** appendUnique：执行对应的业务逻辑。 */
function appendUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** resolveTechniqueDamageProfile：执行对应的业务逻辑。 */
function resolveTechniqueDamageProfile(skills: SkillDef[]): {
  kinds: SkillDamageKind[];
  elements: ElementKey[];
} {
  const kinds: SkillDamageKind[] = [];
  const elements: ElementKey[] = [];
  for (const skill of skills) {
    for (const effect of skill.effects) {
      if (effect.type !== 'damage') {
        continue;
      }
/** appendUnique：处理当前场景中的对应操作。 */
      appendUnique(kinds, effect.damageKind === 'physical' ? 'physical' : 'spell');
      if (effect.element) {
        appendUnique(elements, effect.element);
      }
    }
  }
  return { kinds, elements };
}

/** formatAffinityLabel：执行对应的业务逻辑。 */
function formatAffinityLabel(
  kind: ItemAffinityBadge['tone'],
  element: ItemAffinityBadge['element'],
): { label: string; title: string } {
  const shortKindLabel = kind === 'physical'
    ? '物'
    : kind === 'spell'
      ? '法'
      : kind === 'mixed'
        ? '混'
        : '辅';
  const fullKindLabel = kind === 'physical'
    ? '物理'
    : kind === 'spell'
      ? '法术'
      : kind === 'mixed'
        ? '混合'
        : '辅助';
  const elementLabel = element === 'multi'
    ? '五行'
    : element === 'neutral'
      ? ''
      : `${getElementKeyLabel(element)}行`;
  if (!elementLabel) {
    return {
      label: kind === 'utility' ? '辅助' : fullKindLabel,
      title: kind === 'utility' ? '辅助型功法' : fullKindLabel,
    };
  }
  return {
    label: `${element === 'multi' ? elementLabel : getElementKeyLabel(element)}${shortKindLabel}`,
    title: `${elementLabel}${fullKindLabel}`,
  };
}

/** getTechniqueBookTemplate：执行对应的业务逻辑。 */
function getTechniqueBookTemplate(item: ItemStack) {
  if (item.type !== 'skill_book') {
    return null;
  }
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
  if (!techniqueId) {
    return null;
  }
  return getLocalTechniqueTemplate(techniqueId);
}

/** getItemDisplayMeta：执行对应的业务逻辑。 */
export function getItemDisplayMeta(item: ItemStack): ItemDisplayMeta {
  const displayItem = resolvePreviewItem(item);
  const techniqueTemplate = getTechniqueBookTemplate(displayItem);
  const grade = techniqueTemplate?.grade ?? displayItem.grade ?? null;
  const level = Number.isFinite(displayItem.level) ? Math.max(0, Math.floor(displayItem.level ?? 0)) : 0;
  const techniqueRealmLv = Number.isFinite(techniqueTemplate?.realmLv)
    ? Math.max(1, Math.floor(techniqueTemplate?.realmLv ?? 1))
    : null;
  const realmEntry = techniqueRealmLv ? getLocalRealmLevelEntry(techniqueRealmLv) : null;
  return {
    displayItem,
    grade,
    gradeLabel: grade ? getTechniqueGradeLabel(grade) : null,
    levelLabel: displayItem.type === 'skill_book'
      ? (realmEntry?.displayName ?? (techniqueRealmLv ? `境${formatDisplayInteger(techniqueRealmLv)}` : null))
      : (level > 0 ? `Lv.${formatDisplayInteger(level)}` : null),
    affinityBadge: getItemAffinityBadge(displayItem),
  };
}

/** getItemDecorGrade：执行对应的业务逻辑。 */
export function getItemDecorGrade(item: ItemStack): TechniqueGrade | null {
  return getItemDisplayMeta(item).grade;
}

/** getItemDecorClassName：执行对应的业务逻辑。 */
export function getItemDecorClassName(baseClassName: string, item: ItemStack): string {
  const grade = getItemDisplayMeta(item).grade;
  return `${baseClassName}${grade ? ` inventory-cell--grade inventory-cell--grade-${grade}` : ''}`;
}

/** getItemAffixTypeLabel：执行对应的业务逻辑。 */
export function getItemAffixTypeLabel(item: ItemStack, typeLabel: string): string {
  const meta = getItemDisplayMeta(item);
  return meta.gradeLabel ? `${typeLabel} · ${meta.gradeLabel}` : typeLabel;
}

/** getItemAffinityBadge：执行对应的业务逻辑。 */
export function getItemAffinityBadge(item: ItemStack): ItemAffinityBadge | null {
  const technique = getTechniqueBookTemplate(item);
  if (!technique) {
    return null;
  }
  const { kinds, elements } = resolveTechniqueDamageProfile(technique.skills ?? []);
  if (kinds.length === 0) {
    const category = (technique.category ?? ((technique.skills?.length ?? 0) > 0 ? 'arts' : 'internal')) as TechniqueCategory;
    const label = getTechniqueCategoryLabel(category);
    return {
      label,
      title: `${label} · 无直接伤害`,
      tone: 'utility',
      element: 'neutral',
    };
  }
  const tone: ItemAffinityBadge['tone'] = kinds.length > 1 ? 'mixed' : (kinds[0] === 'physical' ? 'physical' : 'spell');
  const element: ItemAffinityBadge['element'] = elements.length > 1 ? 'multi' : (elements[0] ?? 'neutral');
  const text = formatAffinityLabel(tone, element);
  return {
    label: text.label,
    title: text.title,
    tone,
    element,
  };
}




