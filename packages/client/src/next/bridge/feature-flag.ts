import { shellStore } from '../stores/shell-store';

declare global {
/**
 * Window：定义接口结构约束，明确可交付字段含义。
 */

  interface Window {  
  /**
 * __MUD_ENABLE_REACT_UI_NEXT__：MUDENABLEREACTUINEXT相关字段。
 */

    __MUD_ENABLE_REACT_UI_NEXT__?: boolean;    
    /**
 * __toggleMudReactUiNext__：toggleMudReactUiNext相关字段。
 */

    __toggleMudReactUiNext__?: (enabled: boolean) => void;
  }
}

const REACT_UI_NEXT_STORAGE_KEY = 'mud:react-ui-next:enabled';
/**
 * readStoredFlag：读取StoredFlag并返回结果。
 * @param win Window 参数说明。
 * @returns 返回是否满足StoredFlag条件。
 */


function readStoredFlag(win: Window): boolean {
  try {
    return win.localStorage.getItem(REACT_UI_NEXT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
/**
 * readQueryFlag：读取QueryFlag并返回结果。
 * @param win Window 参数说明。
 * @returns 返回QueryFlag。
 */


function readQueryFlag(win: Window): boolean | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * isReactUiNextEnabled：判断ReactUiNext启用是否满足条件。
 * @param win Window 参数说明。
 * @returns 返回是否满足ReactUiNext启用条件。
 */


export function isReactUiNextEnabled(win: Window = window): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof win.__MUD_ENABLE_REACT_UI_NEXT__ === 'boolean') {
    return win.__MUD_ENABLE_REACT_UI_NEXT__;
  }
  const queryFlag = readQueryFlag(win);
  if (queryFlag !== null) {
    return queryFlag;
  }
  return readStoredFlag(win);
}
/**
 * setReactUiNextEnabled：写入ReactUiNext启用。
 * @param enabled boolean 参数说明。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新ReactUiNext启用相关状态。
 */


export function setReactUiNextEnabled(enabled: boolean, win: Window = window): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    win.localStorage.setItem(REACT_UI_NEXT_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures and keep in-memory state in sync.
  }
  win.__MUD_ENABLE_REACT_UI_NEXT__ = enabled;
  shellStore.patchState({ enabled });
}
/**
 * registerReactUiNextToggleApi：判断registerReactUiNextToggleApi是否满足条件。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新registerReactUiNextToggleApi相关状态。
 */


export function registerReactUiNextToggleApi(win: Window = window): void {
  win.__toggleMudReactUiNext__ = (enabled: boolean) => {
    setReactUiNextEnabled(enabled, win);
  };
}
