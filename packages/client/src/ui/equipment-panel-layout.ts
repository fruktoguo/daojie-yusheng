/**
 * 装备面板的显示层布局辅助。
 *
 * 这里只定义前端排布和简短摘要，不承接装备规则或服务端权威判断。
 */
import type { EquipSlot, ItemStack } from '@mud/shared';
import { getItemDisplayMeta } from './item-display';

export type EquipmentPanelTab = 'combat' | 'technique' | 'artifact';

export const EQUIPMENT_PANEL_TABS = ['combat', 'technique', 'artifact'] as const satisfies readonly EquipmentPanelTab[];

export const EQUIPMENT_PANEL_TAB_LABEL_KEYS: Record<EquipmentPanelTab, string> = {
  combat: 'equipment.tab.combat',
  technique: 'equipment.tab.technique',
  artifact: 'equipment.tab.artifact',
};

export const EQUIPMENT_PANEL_TAB_EMPTY_KEYS: Record<EquipmentPanelTab, string> = {
  combat: 'equipment.empty.combat',
  technique: 'equipment.empty.technique',
  artifact: 'equipment.empty.artifact',
};

/** 战斗装备槽固定显示顺序：武器/身体、头部/腿部、饰品。 */
export const EQUIPMENT_PANEL_COMBAT_SLOT_LAYOUT = [
  ['weapon', 'body'],
  ['head', 'legs'],
  ['accessory'],
] as const satisfies readonly (readonly EquipSlot[])[];

/** 技艺装备槽固定显示顺序。 */
export const EQUIPMENT_PANEL_TECHNIQUE_SLOT_LAYOUT = [
  ['technique_alchemy', 'technique_forging'],
  ['technique_enhancement', 'technique_mining'],
  ['technique_building'],
] as const satisfies readonly (readonly EquipSlot[])[];

/** 法宝槽位尚未接入权威装备模型，面板只保留独立分类入口。 */
export const EQUIPMENT_PANEL_ARTIFACT_SLOT_LAYOUT = [] as const satisfies readonly (readonly EquipSlot[])[];

export const EQUIPMENT_PANEL_SLOT_LAYOUT_BY_TAB: Record<EquipmentPanelTab, readonly (readonly EquipSlot[])[]> = {
  combat: EQUIPMENT_PANEL_COMBAT_SLOT_LAYOUT,
  technique: EQUIPMENT_PANEL_TECHNIQUE_SLOT_LAYOUT,
  artifact: EQUIPMENT_PANEL_ARTIFACT_SLOT_LAYOUT,
};

/** 装备栏完整槽位顺序，用于同步更新所有已存在槽位视图。 */
export const EQUIPMENT_PANEL_SLOT_LAYOUT = [
  ...EQUIPMENT_PANEL_COMBAT_SLOT_LAYOUT,
  ...EQUIPMENT_PANEL_TECHNIQUE_SLOT_LAYOUT,
] as const satisfies readonly (readonly EquipSlot[])[];

export const EQUIPMENT_PANEL_SLOT_ORDER: readonly EquipSlot[] = EQUIPMENT_PANEL_SLOT_LAYOUT.flat();

const WIDE_EQUIPMENT_PANEL_SLOTS = new Set<EquipSlot>(
  EQUIPMENT_PANEL_SLOT_LAYOUT
    .filter((row) => row.length === 1)
    .map((row) => row[0]),
);

export function isWideEquipmentPanelSlot(slot: EquipSlot): boolean {
  return WIDE_EQUIPMENT_PANEL_SLOTS.has(slot);
}

export function getEquipmentPanelTabSlotOrder(tab: EquipmentPanelTab): readonly EquipSlot[] {
  return EQUIPMENT_PANEL_SLOT_LAYOUT_BY_TAB[tab].flat();
}

export function formatEquipmentSlotCompactMeta(item: ItemStack | null | undefined): string {
  if (!item) {
    return '';
  }
  const meta = getItemDisplayMeta(item);
  const parts = [meta.gradeLabel, meta.levelLabel].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : '已装备';
}
