import { shellStore } from '../stores/shell-store';

declare global {
/**
 * Window：定义接口结构约束，明确可交付字段含义。
 */

  interface Window {  
  /**
 * __MUD_ENABLE_REACT_UI__：MUDENABLEREACTUINEXT相关字段。
 */

    __MUD_ENABLE_REACT_UI__?: boolean;    
    /**
 * __toggleMudReactUi__：toggleMudReactUi相关字段。
 */

    __toggleMudReactUi__?: (enabled: boolean) => void;
  }
}

const REACT_UI_STORAGE_KEY = 'mud:react-ui:enabled';
/**
 * readStoredFlag：读取StoredFlag并返回结果。
 * @param win Window 参数说明。
 * @returns 返回是否满足StoredFlag条件。
 */


function readStoredFlag(win: Window): boolean {
  try {
    return win.localStorage.getItem(REACT_UI_STORAGE_KEY) === '1';
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
  const raw = params.get('react-ui');
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return null;
}
/**
 * isReactUiEnabled：判断ReactUi启用是否满足条件。
 * @param win Window 参数说明。
 * @returns 返回是否满足ReactUi启用条件。
 */


export function isReactUiEnabled(win: Window = window): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof win.__MUD_ENABLE_REACT_UI__ === 'boolean') {
    return win.__MUD_ENABLE_REACT_UI__;
  }
  const queryFlag = readQueryFlag(win);
  if (queryFlag !== null) {
    return queryFlag;
  }
  return readStoredFlag(win);
}
/**
 * setReactUiEnabled：写入ReactUi启用。
 * @param enabled boolean 参数说明。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新ReactUi启用相关状态。
 */


export function setReactUiEnabled(enabled: boolean, win: Window = window): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    win.localStorage.setItem(REACT_UI_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures and keep in-memory state in sync.
  }
  win.__MUD_ENABLE_REACT_UI__ = enabled;
  shellStore.patchState({ enabled });
}
/**
 * registerReactUiToggleApi：判断registerReactUiToggleApi是否满足条件。
 * @param win Window 参数说明。
 * @returns 无返回值，直接更新registerReactUiToggleApi相关状态。
 */


export function registerReactUiToggleApi(win: Window = window): void {
  win.__toggleMudReactUi__ = (enabled: boolean) => {
    setReactUiEnabled(enabled, win);
  };
}
