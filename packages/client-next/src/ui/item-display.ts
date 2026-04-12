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
/** label：定义该变量以承载业务值。 */
  label: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** tone：定义该变量以承载业务值。 */
  tone: 'physical' | 'spell' | 'mixed' | 'utility';
/** element：定义该变量以承载业务值。 */
  element: ElementKey | 'multi' | 'neutral';
}

/** ItemDisplayMeta：定义该接口的能力与字段约束。 */
export interface ItemDisplayMeta {
/** displayItem：定义该变量以承载业务值。 */
  displayItem: ItemStack;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade | null;
/** gradeLabel：定义该变量以承载业务值。 */
  gradeLabel: string | null;
/** levelLabel：定义该变量以承载业务值。 */
  levelLabel: string | null;
/** affinityBadge：定义该变量以承载业务值。 */
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
/** kinds：定义该变量以承载业务值。 */
  kinds: SkillDamageKind[];
/** elements：定义该变量以承载业务值。 */
  elements: ElementKey[];
} {
/** kinds：定义该变量以承载业务值。 */
  const kinds: SkillDamageKind[] = [];
/** elements：定义该变量以承载业务值。 */
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
/** shortKindLabel：定义该变量以承载业务值。 */
  const shortKindLabel = kind === 'physical'
    ? '物'
    : kind === 'spell'
      ? '法'
      : kind === 'mixed'
        ? '混'
        : '辅';
/** fullKindLabel：定义该变量以承载业务值。 */
  const fullKindLabel = kind === 'physical'
    ? '物理'
    : kind === 'spell'
      ? '法术'
      : kind === 'mixed'
        ? '混合'
        : '辅助';
/** elementLabel：定义该变量以承载业务值。 */
  const elementLabel = element === 'multi'
    ? '五行'
    : element === 'neutral'
      ? ''
      : `${getElementKeyLabel(element)}行`;
  if (!elementLabel) {
    return {
/** label：定义该变量以承载业务值。 */
      label: kind === 'utility' ? '辅助' : fullKindLabel,
/** title：定义该变量以承载业务值。 */
      title: kind === 'utility' ? '辅助型功法' : fullKindLabel,
    };
  }
  return {
/** label：定义该变量以承载业务值。 */
    label: `${element === 'multi' ? elementLabel : getElementKeyLabel(element)}${shortKindLabel}`,
    title: `${elementLabel}${fullKindLabel}`,
  };
}

/** getTechniqueBookTemplate：执行对应的业务逻辑。 */
function getTechniqueBookTemplate(item: ItemStack) {
  if (item.type !== 'skill_book') {
    return null;
  }
/** techniqueId：定义该变量以承载业务值。 */
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
  if (!techniqueId) {
    return null;
  }
  return getLocalTechniqueTemplate(techniqueId);
}

/** getItemDisplayMeta：执行对应的业务逻辑。 */
export function getItemDisplayMeta(item: ItemStack): ItemDisplayMeta {
/** displayItem：定义该变量以承载业务值。 */
  const displayItem = resolvePreviewItem(item);
/** techniqueTemplate：定义该变量以承载业务值。 */
  const techniqueTemplate = getTechniqueBookTemplate(displayItem);
/** grade：定义该变量以承载业务值。 */
  const grade = techniqueTemplate?.grade ?? displayItem.grade ?? null;
/** level：定义该变量以承载业务值。 */
  const level = Number.isFinite(displayItem.level) ? Math.max(0, Math.floor(displayItem.level ?? 0)) : 0;
/** techniqueRealmLv：定义该变量以承载业务值。 */
  const techniqueRealmLv = Number.isFinite(techniqueTemplate?.realmLv)
    ? Math.max(1, Math.floor(techniqueTemplate?.realmLv ?? 1))
    : null;
/** realmEntry：定义该变量以承载业务值。 */
  const realmEntry = techniqueRealmLv ? getLocalRealmLevelEntry(techniqueRealmLv) : null;
  return {
    displayItem,
    grade,
    gradeLabel: grade ? getTechniqueGradeLabel(grade) : null,
/** levelLabel：定义该变量以承载业务值。 */
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
/** grade：定义该变量以承载业务值。 */
  const grade = getItemDisplayMeta(item).grade;
  return `${baseClassName}${grade ? ` inventory-cell--grade inventory-cell--grade-${grade}` : ''}`;
}

/** getItemAffixTypeLabel：执行对应的业务逻辑。 */
export function getItemAffixTypeLabel(item: ItemStack, typeLabel: string): string {
/** meta：定义该变量以承载业务值。 */
  const meta = getItemDisplayMeta(item);
  return meta.gradeLabel ? `${typeLabel} · ${meta.gradeLabel}` : typeLabel;
}

/** getItemAffinityBadge：执行对应的业务逻辑。 */
export function getItemAffinityBadge(item: ItemStack): ItemAffinityBadge | null {
/** technique：定义该变量以承载业务值。 */
  const technique = getTechniqueBookTemplate(item);
  if (!technique) {
    return null;
  }
  const { kinds, elements } = resolveTechniqueDamageProfile(technique.skills ?? []);
  if (kinds.length === 0) {
/** category：定义该变量以承载业务值。 */
    const category = (technique.category ?? ((technique.skills?.length ?? 0) > 0 ? 'arts' : 'internal')) as TechniqueCategory;
/** label：定义该变量以承载业务值。 */
    const label = getTechniqueCategoryLabel(category);
    return {
      label,
      title: `${label} · 无直接伤害`,
      tone: 'utility',
      element: 'neutral',
    };
  }
/** tone：定义该变量以承载业务值。 */
  const tone: ItemAffinityBadge['tone'] = kinds.length > 1 ? 'mixed' : (kinds[0] === 'physical' ? 'physical' : 'spell');
/** element：定义该变量以承载业务值。 */
  const element: ItemAffinityBadge['element'] = elements.length > 1 ? 'multi' : (elements[0] ?? 'neutral');
/** text：定义该变量以承载业务值。 */
  const text = formatAffinityLabel(tone, element);
  return {
    label: text.label,
    title: text.title,
    tone,
    element,
  };
}




