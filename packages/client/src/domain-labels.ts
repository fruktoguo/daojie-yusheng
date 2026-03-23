import type {
  AttrKey,
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
} from '@mud/shared';
import {
  ATTR_KEY_LABELS,
  ELEMENT_KEY_LABELS,
  ENTITY_KIND_LABELS,
  EQUIP_SLOT_LABELS,
  ITEM_TYPE_LABELS,
  MAP_MINIMAP_MARKER_KIND_LABELS,
  NUMERIC_SCALAR_STAT_LABELS,
  SKILL_FORMULA_BASE_VAR_LABELS,
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
};
export const NUMERIC_SCALAR_STAT_KEY_LABELS = NUMERIC_SCALAR_STAT_LABELS;
export const MINIMAP_MARKER_KIND_LABELS = MAP_MINIMAP_MARKER_KIND_LABELS;

export function getTileTypeLabel(type: TileType, fallback = '未知地貌'): string {
  return TILE_TYPE_LABELS[type] ?? fallback;
}

export function getEntityKindLabel(kind: string | null | undefined, fallback = '未知'): string {
  if (!kind) {
    return fallback;
  }
  return (ENTITY_KIND_LABELS as Record<string, string>)[kind] ?? fallback;
}

export function getAttrKeyLabel(key: string, fallback?: string): string {
  return (ATTR_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

export function getElementKeyLabel(key: string, fallback?: string): string {
  return (ELEMENT_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

export function getNumericScalarStatKeyLabel(key: string, fallback?: string): string {
  return (NUMERIC_SCALAR_STAT_KEY_LABELS as Record<string, string>)[key] ?? fallback ?? key;
}

export function getMinimapMarkerKindLabel(kind: string, fallback?: string): string {
  return (MINIMAP_MARKER_KIND_LABELS as Record<string, string>)[kind] ?? fallback ?? kind;
}

export function getItemTypeLabel(type: ItemType | string, fallback?: string): string {
  return (ITEM_TYPE_LABELS as Record<string, string>)[type] ?? fallback ?? type;
}

export function getEquipSlotLabel(slot: EquipSlot | string, fallback?: string): string {
  return (EQUIP_SLOT_LABELS as Record<string, string>)[slot] ?? fallback ?? slot;
}

export function getTechniqueGradeLabel(grade: TechniqueGrade | string | null | undefined, fallback = '无品'): string {
  if (!grade) {
    return fallback;
  }
  return (TECHNIQUE_GRADE_LABELS as Record<string, string>)[grade] ?? fallback;
}

export function getTechniqueRealmLabel(realm: TechniqueRealm | string | null | undefined, fallback = '未知'): string {
  if (realm === null || realm === undefined) {
    return fallback;
  }
  return (TECHNIQUE_REALM_LABELS as Record<string, string>)[String(realm)] ?? fallback;
}

export function getSkillFormulaBaseVarLabel(variable: SkillFormulaVar, fallback?: string): string {
  return (SKILL_FORMULA_BASE_VAR_LABELS as Record<string, string>)[variable] ?? fallback ?? variable;
}
