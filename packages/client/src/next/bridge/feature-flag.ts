import { shellStore } from '../stores/shell-store';

declare global {
  interface Window {
    __MUD_ENABLE_REACT_UI_NEXT__?: boolean;
    __toggleMudReactUiNext__?: (enabled: boolean) => void;
  }
}

const REACT_UI_NEXT_STORAGE_KEY = 'mud:react-ui-next:enabled';

function readStoredFlag(win: Window): boolean {
  try {
    return win.localStorage.getItem(REACT_UI_NEXT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readQueryFlag(win: Window): boolean | null {
  const params = new URLSearchParams(win.location.search);
  const raw = params.get('react-ui-next');
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return null;
}

export function isReactUiNextEnabled(win: Window = window): boolean {
  if (typeof win.__MUD_ENABLE_REACT_UI_NEXT__ === 'boolean') {
    return win.__MUD_ENABLE_REACT_UI_NEXT__;
  }
  const queryFlag = readQueryFlag(win);
  if (queryFlag !== null) {
    return queryFlag;
  }
  return readStoredFlag(win);
}

export function setReactUiNextEnabled(enabled: boolean, win: Window = window): void {
  try {
    win.localStorage.setItem(REACT_UI_NEXT_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures and keep in-memory state in sync.
  }
  win.__MUD_ENABLE_REACT_UI_NEXT__ = enabled;
  shellStore.patchState({ enabled });
}

export function registerReactUiNextToggleApi(win: Window = window): void {
  win.__toggleMudReactUiNext__ = (enabled: boolean) => {
    setReactUiNextEnabled(enabled, win);
  };
}
