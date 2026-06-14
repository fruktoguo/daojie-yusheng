/**
 * 装备面板的显示层布局辅助。
 *
 * 这里只定义前端排布和简短摘要，不承接装备规则或服务端权威判断。
 */
import type { EquipSlot, ItemStack } from '@mud/shared';
import { getItemDisplayMeta } from './item-display';

/** 装备栏固定显示顺序：战斗槽按两列成组，随后显示技艺槽。 */
export const EQUIPMENT_PANEL_SLOT_LAYOUT = [
  ['weapon', 'body'],
  ['head', 'legs'],
  ['accessory'],
  ['technique_alchemy', 'technique_forging'],
  ['technique_enhancement', 'technique_mining'],
  ['technique_building'],
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

export function formatEquipmentSlotCompactMeta(item: ItemStack | null | undefined): string {
  if (!item) {
    return '';
  }
  const meta = getItemDisplayMeta(item);
  const parts = [meta.gradeLabel, meta.levelLabel].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : '已装备';
}
