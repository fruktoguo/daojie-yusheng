/**
 * 装备面板快捷键辅助。
 *
 * 这里只保存本地 UI 绑定和按键规范化，不承接服务端权威规则。
 */
import type { ArtifactSlot } from '@mud/shared';
import { normalizeShortcutKey } from './panels/action-panel-helpers';

/** 法宝槽快捷键本地存储键。 */
export const EQUIPMENT_ARTIFACT_SHORTCUTS_KEY = 'mud.equipment.artifact-shortcuts.v1';

/** 规范化装备面板快捷键，沿用行动面板的单字母/数字规则。 */
export function normalizeEquipmentShortcutKey(key: string): string | null {
  return normalizeShortcutKey(key);
}

/** 从 localStorage 读取法宝槽快捷键。 */
export function loadArtifactShortcutBindings(): Map<ArtifactSlot, string> {
  try {
    const raw = localStorage.getItem(EQUIPMENT_ARTIFACT_SHORTCUTS_KEY);
    if (!raw) {
      return new Map();
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    const result = new Map<ArtifactSlot, string>();
    for (const [slot, key] of Object.entries(parsed)) {
      const normalized = normalizeEquipmentShortcutKey(key);
      if (normalized) {
        result.set(slot as ArtifactSlot, normalized);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/** 保存法宝槽快捷键。 */
export function saveArtifactShortcutBindings(bindings: Map<ArtifactSlot, string>): void {
  localStorage.setItem(EQUIPMENT_ARTIFACT_SHORTCUTS_KEY, JSON.stringify(Object.fromEntries(bindings.entries())));
}

/** 查找指定快捷键对应的法宝槽。 */
export function findArtifactShortcutSlot(bindings: Map<ArtifactSlot, string>, normalizedKey: string): ArtifactSlot | null {
  for (const [slot, binding] of bindings.entries()) {
    if (binding === normalizedKey) {
      return slot;
    }
  }
  return null;
}

/** 写入一个快捷键，同时移除同一按键在其他法宝槽上的绑定。 */
export function setArtifactShortcutBinding(
  bindings: Map<ArtifactSlot, string>,
  slot: ArtifactSlot,
  normalizedKey: string,
): Map<ArtifactSlot, string> {
  const next = new Map(bindings);
  for (const [candidateSlot, binding] of next.entries()) {
    if (candidateSlot !== slot && binding === normalizedKey) {
      next.delete(candidateSlot);
    }
  }
  next.set(slot, normalizedKey);
  return next;
}
