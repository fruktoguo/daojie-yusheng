/**
 * 客户端引导解锁状态管理
 *
 * 基础引导默认解锁，其余引导随任务触发、查看或播放自动解锁，
 * 状态持久化到 localStorage 中。
 */

const STORAGE_KEY = "mud:guided-tour:unlocked-flows";

const DEFAULT_UNLOCKED_FLOW_IDS = new Set<string>([
  "starter-basics",
  "quest-navigation-guide",
  "equipment-guide",
  "cultivation-guide",
  "force-attack-guide",
]);

let cachedUnlockedIds: Set<string> | null = null;

function loadUnlockedFromStorage(): Set<string> {
  const result = new Set<string>(DEFAULT_UNLOCKED_FLOW_IDS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as string[];
      if (Array.isArray(list)) {
        for (const id of list) {
          if (typeof id === "string" && id.trim()) {
            result.add(id.trim());
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}

export function getUnlockedGuidedTourFlowIds(): Set<string> {
  if (!cachedUnlockedIds) {
    cachedUnlockedIds = loadUnlockedFromStorage();
  }
  return cachedUnlockedIds;
}

export function isGuidedTourFlowUnlocked(flowId: string): boolean {
  if (!flowId) return false;
  return getUnlockedGuidedTourFlowIds().has(flowId.trim());
}

export function unlockGuidedTourFlow(flowId: string): boolean {
  const normalized = flowId.trim();
  if (!normalized) return false;
  const current = getUnlockedGuidedTourFlowIds();
  if (current.has(normalized)) return false;
  current.add(normalized);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // ignore
  }
  return true;
}
