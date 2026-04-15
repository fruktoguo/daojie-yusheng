import type {
  ActionType,
  AttrKey,
  Direction,
  ElementKey,
  EntityKind,
  EquipSlot,
  ItemType,
  MapMinimapMarkerKind,
  NumericScalarStatKey,
  SkillFormulaVar,
  TechniqueGrade,
  TechniqueRealm,
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
  ITEM_TYPE_LABELS,
  MAP_MINIMAP_MARKER_KIND_LABELS,
  NUMERIC_SCALAR_STAT_LABELS,
  QUEST_LINE_LABELS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  QUEST_STATUS_LABELS,
  SKILL_FORMULA_BASE_VAR_LABELS,
  TECHNIQUE_CATEGORY_LABELS,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_REALM_LABELS,
  TILE_TYPE_LABELS,
} from '@mud/shared';

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

/** getTileTypeLabel：执行对应的业务逻辑。 */
export function getTileTypeLabel(type: TileType, fallback = '未知地貌'): string {
  return TILE_TYPE_LABELS[type] ?? fallback;
}

/** getEntityKindLabel：执行对应的业务逻辑。 */
export function getEntityKindLabel(kind: string | null | undefined, fallback = '未知'): string {
  if (!kind) {
    return fallback;
  }
  return (ENTITY_KIND_LABELS as Record<string, string>)[kind] ?? fallback;
}

/** getAttrKeyLabel：执行对应的业务逻辑。 */
export function getAttrKeyLabel(key: string, fallback?: string): string {
  return (ATTR_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

/** getElementKeyLabel：执行对应的业务逻辑。 */
export function getElementKeyLabel(key: string, fallback?: string): string {
  return (ELEMENT_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

/** getNumericScalarStatKeyLabel：执行对应的业务逻辑。 */
export function getNumericScalarStatKeyLabel(key: string, fallback?: string): string {
  return (NUMERIC_SCALAR_STAT_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

/** getMinimapMarkerKindLabel：执行对应的业务逻辑。 */
export function getMinimapMarkerKindLabel(kind: string, fallback?: string): string {
  return (MAP_MINIMAP_MARKER_KIND_LABELS as Record<string, string>)[kind] ?? fallback ?? kind;
}

/** getItemTypeLabel：执行对应的业务逻辑。 */
export function getItemTypeLabel(type: ItemType | string, fallback?: string): string {
  return (ITEM_TYPE_LABELS as Record<string, string>)[type] ?? fallback ?? type;
}

/** getEquipSlotLabel：执行对应的业务逻辑。 */
export function getEquipSlotLabel(slot: EquipSlot | string, fallback?: string): string {
  return (EQUIP_SLOT_LABELS as Record<string, string>)[slot] ?? fallback ?? slot;
}

/** getDirectionLabel：执行对应的业务逻辑。 */
export function getDirectionLabel(direction: Direction | string | null | undefined, fallback = '未知方向'): string {
  if (direction === null || direction === undefined) {
    return fallback;
  }
  return (DIRECTION_LABELS as Record<string, string>)[String(direction)] ?? fallback;
}

/** getActionTypeLabel：执行对应的业务逻辑。 */
export function getActionTypeLabel(type: ActionType | string | null | undefined, fallback = '未知行动'): string {
  if (!type) {
    return fallback;
  }
  return (ACTION_TYPE_LABELS as Record<string, string>)[type] ?? fallback;
}

/** getQuestStatusLabel：执行对应的业务逻辑。 */
export function getQuestStatusLabel(status: QuestStatus | string | null | undefined, fallback = '未知状态'): string {
  if (!status) {
    return fallback;
  }
  return (QUEST_STATUS_LABELS as Record<string, string>)[status] ?? fallback;
}

/** getQuestLineLabel：执行对应的业务逻辑。 */
export function getQuestLineLabel(line: QuestLine | string | null | undefined, fallback = '未知任务线'): string {
  if (!line) {
    return fallback;
  }
  return (QUEST_LINE_LABELS as Record<string, string>)[line] ?? fallback;
}

/** getQuestObjectiveTypeLabel：执行对应的业务逻辑。 */
export function getQuestObjectiveTypeLabel(type: QuestObjectiveType | string | null | undefined, fallback = '未知目标'): string {
  if (!type) {
    return fallback;
  }
  return (QUEST_OBJECTIVE_TYPE_LABELS as Record<string, string>)[type] ?? fallback;
}

/** getTechniqueGradeLabel：执行对应的业务逻辑。 */
export function getTechniqueGradeLabel(grade: TechniqueGrade | string | null | undefined, fallback = '无品'): string {
  if (!grade) {
    return fallback;
  }
  return (TECHNIQUE_GRADE_LABELS as Record<string, string>)[grade] ?? fallback;
}

/** getTechniqueCategoryLabel：执行对应的业务逻辑。 */
export function getTechniqueCategoryLabel(category: TechniqueCategory | string | null | undefined, fallback = '未分类'): string {
  if (!category) {
    return fallback;
  }
  return (TECHNIQUE_CATEGORY_LABELS as Record<string, string>)[category] ?? fallback;
}

/** getTechniqueRealmLabel：执行对应的业务逻辑。 */
export function getTechniqueRealmLabel(realm: TechniqueRealm | string | null | undefined, fallback = '未知'): string {
  if (realm === null || realm === undefined) {
    return fallback;
  }
  return (TECHNIQUE_REALM_LABELS as Record<string, string>)[String(realm)] ?? fallback;
}

/** getSkillFormulaBaseVarLabel：执行对应的业务逻辑。 */
export function getSkillFormulaBaseVarLabel(variable: SkillFormulaVar, fallback?: string): string {
  return (SKILL_FORMULA_BASE_VAR_LABELS as Record<string, string>)[variable] ?? fallback ?? variable;
}

