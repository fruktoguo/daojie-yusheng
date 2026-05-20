import type {
  ActionType,
  AttrKey,
  Direction,
  ElementKey,
  EntityKind,
  EquipSlot,
  InteractableKind,
  ItemType,
  MapMinimapMarkerKind,
  NumericScalarStatKey,
  SkillFormulaVar,
  StructureType,
  SurfaceType,
  TechniqueGrade,
  TechniqueRealm,
  TerrainType,
  TileType,
  QuestLine,
  QuestObjectiveType,
  QuestStatus,
  TechniqueCategory,
} from '@mud/shared';
import {
  ACTION_TYPE_LABELS,
  ATTR_KEY_LABELS,
  DIRECTION_LABELS,
  ELEMENT_KEY_LABELS,
  ENTITY_KIND_LABELS,
  EQUIP_SLOT_LABELS,
  INTERACTABLE_KIND_LABELS,
  ITEM_TYPE_LABELS,
  MAP_MINIMAP_MARKER_KIND_LABELS,
  NUMERIC_SCALAR_STAT_LABELS,
  QUEST_LINE_LABELS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  QUEST_STATUS_LABELS,
  SKILL_FORMULA_BASE_VAR_LABELS,
  STRUCTURE_TYPE_LABELS,
  SURFACE_TYPE_LABELS,
  TECHNIQUE_CATEGORY_LABELS,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_REALM_LABELS,
  TERRAIN_TYPE_LABELS,
  TILE_TYPE_LABELS,
} from '@mud/shared';
import { t } from './ui/i18n';

export {
  ATTR_KEY_LABELS,
  ELEMENT_KEY_LABELS,
  ENTITY_KIND_LABELS,
  EQUIP_SLOT_LABELS,
  ITEM_TYPE_LABELS,
  SKILL_FORMULA_BASE_VAR_LABELS,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_REALM_LABELS,
  TILE_TYPE_LABELS,
  TERRAIN_TYPE_LABELS,
  SURFACE_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
  INTERACTABLE_KIND_LABELS,
  ACTION_TYPE_LABELS,
  DIRECTION_LABELS,
  QUEST_LINE_LABELS,
  QUEST_STATUS_LABELS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  TECHNIQUE_CATEGORY_LABELS,
};
export {
  NUMERIC_SCALAR_STAT_LABELS as NUMERIC_SCALAR_STAT_KEY_LABELS,
  MAP_MINIMAP_MARKER_KIND_LABELS as MINIMAP_MARKER_KIND_LABELS,
};

/** 读取地块类型的本地化标签。 */
export function getTileTypeLabel(type: TileType, fallback = t('domain.unknown-terrain')): string {
  return TILE_TYPE_LABELS[type] ?? fallback;
}

/** 读取底层地形的本地化标签。 */
export function getTerrainTypeLabel(type: TerrainType | string | null | undefined, fallback = t('domain.none')): string {
  return type ? (TERRAIN_TYPE_LABELS as Record<string, string>)[type] ?? fallback : fallback;
}

/** 读取地表铺装的本地化标签。 */
export function getSurfaceTypeLabel(type: SurfaceType | string | null | undefined, fallback = t('domain.none')): string {
  return type ? (SURFACE_TYPE_LABELS as Record<string, string>)[type] ?? fallback : fallback;
}

/** 读取地上结构的本地化标签。 */
export function getStructureTypeLabel(type: StructureType | string | null | undefined, fallback = t('domain.none')): string {
  return type ? (STRUCTURE_TYPE_LABELS as Record<string, string>)[type] ?? fallback : fallback;
}

/** 读取交互对象种类的本地化标签。 */
export function getInteractableKindLabel(kind: InteractableKind | string | null | undefined, fallback = t('domain.unknown-interactable')): string {
  return kind ? (INTERACTABLE_KIND_LABELS as Record<string, string>)[kind] ?? fallback : fallback;
}

/** 读取实体种类的本地化标签。 */
export function getEntityKindLabel(kind: string | null | undefined, fallback = t('domain.unknown-entity')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!kind) {
    return fallback;
  }
  return (ENTITY_KIND_LABELS as Record<string, string>)[kind] ?? fallback;
}

/** 读取属性键的本地化标签。 */
export function getAttrKeyLabel(key: string, fallback?: string): string {
  return (ATTR_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? t('domain.unknown-attr');
}

/** 读取元素键的本地化标签。 */
export function getElementKeyLabel(key: string, fallback?: string): string {
  return (ELEMENT_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? t('domain.unknown-element');
}

/** 读取数值型统计键的本地化标签。 */
export function getNumericScalarStatKeyLabel(key: string, fallback?: string): string {
  return (NUMERIC_SCALAR_STAT_LABELS as Record<string, string>)[key] ?? fallback ?? t('domain.unknown-stat');
}

/** 读取小地图标记种类的本地化标签。 */
export function getMinimapMarkerKindLabel(kind: string, fallback?: string): string {
  return (MAP_MINIMAP_MARKER_KIND_LABELS as Record<string, string>)[kind] ?? fallback ?? t('domain.unknown-marker');
}

/** 读取物品类型的本地化标签。 */
export function getItemTypeLabel(type: ItemType | string, fallback?: string): string {
  return (ITEM_TYPE_LABELS as Record<string, string>)[type] ?? fallback ?? t('domain.unknown-item-type');
}

/** 读取装备槽位的本地化标签。 */
export function getEquipSlotLabel(slot: EquipSlot | string, fallback?: string): string {
  return (EQUIP_SLOT_LABELS as Record<string, string>)[slot] ?? fallback ?? t('domain.unknown-equip-slot');
}

/** 读取方向的本地化标签。 */
export function getDirectionLabel(direction: Direction | string | null | undefined, fallback = t('domain.unknown-entity')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (direction === null || direction === undefined) {
    return fallback;
  }
  return (DIRECTION_LABELS as Record<string, string>)[String(direction)] ?? fallback;
}

/** 读取动作类型的本地化标签。 */
export function getActionTypeLabel(type: ActionType | string | null | undefined, fallback = t('domain.unknown-action')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!type) {
    return fallback;
  }
  return (ACTION_TYPE_LABELS as Record<string, string>)[type] ?? fallback;
}

/** 读取任务状态的本地化标签。 */
export function getQuestStatusLabel(status: QuestStatus | string | null | undefined, fallback = t('domain.unknown-quest-status')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!status) {
    return fallback;
  }
  return (QUEST_STATUS_LABELS as Record<string, string>)[status] ?? fallback;
}

/** 读取任务线的本地化标签。 */
export function getQuestLineLabel(line: QuestLine | string | null | undefined, fallback = t('domain.unknown-quest-line')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!line) {
    return fallback;
  }
  return (QUEST_LINE_LABELS as Record<string, string>)[line] ?? fallback;
}

/** 读取任务目标类型的本地化标签。 */
export function getQuestObjectiveTypeLabel(type: QuestObjectiveType | string | null | undefined, fallback = t('domain.unknown-quest-objective')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!type) {
    return fallback;
  }
  return (QUEST_OBJECTIVE_TYPE_LABELS as Record<string, string>)[type] ?? fallback;
}

/** 读取功法品阶的本地化标签。 */
export function getTechniqueGradeLabel(grade: TechniqueGrade | string | null | undefined, fallback = t('domain.unknown-technique-grade')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!grade) {
    return fallback;
  }
  return (TECHNIQUE_GRADE_LABELS as Record<string, string>)[grade] ?? fallback;
}

/** 读取功法类别的本地化标签。 */
export function getTechniqueCategoryLabel(category: TechniqueCategory | string | null | undefined, fallback = t('domain.unknown-technique-category')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!category) {
    return fallback;
  }
  return (TECHNIQUE_CATEGORY_LABELS as Record<string, string>)[category] ?? fallback;
}

/** 读取功法境界的本地化标签。 */
export function getTechniqueRealmLabel(realm: TechniqueRealm | string | null | undefined, fallback = t('domain.unknown-technique-realm')): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (realm === null || realm === undefined) {
    return fallback;
  }
  return (TECHNIQUE_REALM_LABELS as Record<string, string>)[String(realm)] ?? fallback;
}

/** 读取技能公式基础变量的本地化标签。 */
export function getSkillFormulaBaseVarLabel(variable: SkillFormulaVar, fallback?: string): string {
  return (SKILL_FORMULA_BASE_VAR_LABELS as Record<string, string>)[variable] ?? fallback ?? t('domain.unknown-formula-var');
}
