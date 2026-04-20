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

/** ItemAffinityBadge：物品展示徽记。 */
export interface ItemAffinityBadge {
/**
 * label：ItemAffinityBadge 内部字段。
 */

  label: string;  
  /**
 * title：ItemAffinityBadge 内部字段。
 */

  title: string;  
  /**
 * tone：ItemAffinityBadge 内部字段。
 */

  tone: 'physical' | 'spell' | 'mixed' | 'utility';  
  /**
 * element：ItemAffinityBadge 内部字段。
 */

  element: ElementKey | 'multi' | 'neutral';
}

/** ItemDisplayMeta：物品展示元数据。 */
export interface ItemDisplayMeta {
/**
 * displayItem：ItemDisplayMeta 内部字段。
 */

  displayItem: ItemStack;  
  /**
 * grade：ItemDisplayMeta 内部字段。
 */

  grade: TechniqueGrade | null;  
  /**
 * gradeLabel：ItemDisplayMeta 内部字段。
 */

  gradeLabel: string | null;  
  /**
 * levelLabel：ItemDisplayMeta 内部字段。
 */

  levelLabel: string | null;  
  /**
 * affinityBadge：ItemDisplayMeta 内部字段。
 */

  affinityBadge: ItemAffinityBadge | null;
}

/** appendUnique：处理append Unique。 */
function appendUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** resolveTechniqueDamageProfile：解析Technique Damage Profile。 */
function resolveTechniqueDamageProfile(skills: SkillDef[]): {
/**
 * kinds：对象字段。
 */

  kinds: SkillDamageKind[];  
  /**
 * elements：对象字段。
 */

  elements: ElementKey[];
} {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const kinds: SkillDamageKind[] = [];
  const elements: ElementKey[] = [];
  for (const skill of skills) {
    for (const effect of skill.effects) {
      if (effect.type !== 'damage') {
        continue;
      }
      appendUnique(kinds, effect.damageKind === 'physical' ? 'physical' : 'spell');
      if (effect.element) {
        appendUnique(elements, effect.element);
      }
    }
  }
  return { kinds, elements };
}

/** formatAffinityLabel：格式化Affinity标签。 */
function formatAffinityLabel(
  kind: ItemAffinityBadge['tone'],
  element: ItemAffinityBadge['element'],
): {
/**
 * label：对象字段。
 */
 label: string;
 /**
 * title：对象字段。
 */
 title: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** getTechniqueBookTemplate：读取Technique书籍模板。 */
function getTechniqueBookTemplate(item: ItemStack) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (item.type !== 'skill_book') {
    return null;
  }
  const techniqueId = resolveTechniqueIdFromBookItemId(item.itemId);
  if (!techniqueId) {
    return null;
  }
  return getLocalTechniqueTemplate(techniqueId);
}

/** getItemDisplayMeta：读取物品显示元数据。 */
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

/** getItemDecorGrade：读取物品Decor Grade。 */
export function getItemDecorGrade(item: ItemStack): TechniqueGrade | null {
  return getItemDisplayMeta(item).grade;
}

/** getItemDecorClassName：读取物品Decor Class名称。 */
export function getItemDecorClassName(baseClassName: string, item: ItemStack): string {
  const grade = getItemDisplayMeta(item).grade;
  return `${baseClassName}${grade ? ` inventory-cell--grade inventory-cell--grade-${grade}` : ''}`;
}

/** getItemAffixTypeLabel：读取物品词缀类型标签。 */
export function getItemAffixTypeLabel(item: ItemStack, typeLabel: string): string {
  const meta = getItemDisplayMeta(item);
  return meta.gradeLabel ? `${typeLabel} · ${meta.gradeLabel}` : typeLabel;
}

/** getItemAffinityBadge：读取物品Affinity Badge。 */
export function getItemAffinityBadge(item: ItemStack): ItemAffinityBadge | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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






