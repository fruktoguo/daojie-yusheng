/**
 * HUD 悬浮窗偏好。
 *
 * 只保存本地显示偏好，服务端仍是行动与技艺任务状态的唯一权威来源。
 */

export type FloatingPanelPreferenceKey = 'actionQueue' | 'interactionList' | 'party';

export type FloatingPanelPreferences = Record<FloatingPanelPreferenceKey, boolean>;

export const FLOATING_PANEL_PREFERENCES_CHANGED_EVENT = 'mud:floating-panel-preferences-changed';

const FLOATING_PANEL_PREFERENCES_STORAGE_KEY = 'mud:floating-panel-preferences:v1';

const DEFAULT_FLOATING_PANEL_PREFERENCES: FloatingPanelPreferences = {
  actionQueue: true,
  interactionList: true,
  party: true,
};

let initialized = false;
let currentPreferences = clonePreferences(DEFAULT_FLOATING_PANEL_PREFERENCES);

export function getFloatingPanelPreferences(): FloatingPanelPreferences {
  if (!initialized) {
    currentPreferences = normalizePreferences(readStoredPreferences());
    initialized = true;
  }
  return clonePreferences(currentPreferences);
}

export function isFloatingPanelEnabled(key: FloatingPanelPreferenceKey): boolean {
  return getFloatingPanelPreferences()[key] === true;
}

export function updateFloatingPanelPreference(
  key: FloatingPanelPreferenceKey,
  enabled: boolean,
): FloatingPanelPreferences {
  const previous = getFloatingPanelPreferences();
  const next = normalizePreferences({
    ...previous,
    [key]: enabled,
  });
  currentPreferences = next;
  initialized = true;
  persistPreferences(next);
  if (previous[key] !== next[key]) {
    window.dispatchEvent(new CustomEvent<FloatingPanelPreferences>(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, {
      detail: clonePreferences(next),
    }));
  }
  return clonePreferences(next);
}

export function resetFloatingPanelPreferences(): FloatingPanelPreferences {
  currentPreferences = clonePreferences(DEFAULT_FLOATING_PANEL_PREFERENCES);
  initialized = true;
  persistPreferences(currentPreferences);
  window.dispatchEvent(new CustomEvent<FloatingPanelPreferences>(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, {
    detail: clonePreferences(currentPreferences),
  }));
  return clonePreferences(currentPreferences);
}

function normalizePreferences(raw: Partial<FloatingPanelPreferences> | null | undefined): FloatingPanelPreferences {
  return {
    actionQueue: raw?.actionQueue !== false,
    interactionList: raw?.interactionList !== false,
    party: raw?.party !== false,
  };
}

function readStoredPreferences(): Partial<FloatingPanelPreferences> | null {
  try {
    const raw = window.localStorage.getItem(FLOATING_PANEL_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? parsed as Partial<FloatingPanelPreferences>
      : null;
  } catch {
    return null;
  }
}

function persistPreferences(preferences: FloatingPanelPreferences): void {
  try {
    window.localStorage.setItem(FLOATING_PANEL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // localStorage 不可用时仅保留当前会话偏好，不影响主 UI。
  }
}

function clonePreferences(preferences: FloatingPanelPreferences): FloatingPanelPreferences {
  return {
    actionQueue: preferences.actionQueue,
    interactionList: preferences.interactionList,
    party: preferences.party,
  };
}
