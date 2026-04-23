import { createExternalStore } from './create-external-store';
import type { PanelCapabilities, PanelRuntimeState } from '../../ui/panel-system/types';
/**
 * ReactUiShellState：定义接口结构约束，明确可交付字段含义。
 */


export interface ReactUiShellState {
/**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * mounted：mounted相关字段。
 */

  mounted: boolean;  
  /**
 * runtime：运行态引用。
 */

  runtime: PanelRuntimeState;  
  /**
 * capabilities：capability相关字段。
 */

  capabilities: PanelCapabilities | null;
}

const INITIAL_SHELL_RUNTIME: PanelRuntimeState = {
  connected: false,
  shellVisible: false,
  playerId: null,
  mapId: null,
};

export const shellStore = createExternalStore<ReactUiShellState>({
  enabled: false,
  mounted: false,
  runtime: INITIAL_SHELL_RUNTIME,
  capabilities: null,
});
