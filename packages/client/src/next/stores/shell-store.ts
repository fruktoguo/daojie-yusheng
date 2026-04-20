import { createExternalStore } from './create-external-store';
import type { PanelCapabilities, PanelRuntimeState } from '../../ui/panel-system/types';
/**
 * NextUiShellState：定义接口结构约束，明确可交付字段含义。
 */


export interface NextUiShellState {
/**
 * enabled：NextUiShellState 内部字段。
 */

  enabled: boolean;  
  /**
 * mounted：NextUiShellState 内部字段。
 */

  mounted: boolean;  
  /**
 * runtime：NextUiShellState 内部字段。
 */

  runtime: PanelRuntimeState;  
  /**
 * capabilities：NextUiShellState 内部字段。
 */

  capabilities: PanelCapabilities | null;
}

const INITIAL_SHELL_RUNTIME: PanelRuntimeState = {
  connected: false,
  shellVisible: false,
  playerId: null,
  mapId: null,
};

export const shellStore = createExternalStore<NextUiShellState>({
  enabled: false,
  mounted: false,
  runtime: INITIAL_SHELL_RUNTIME,
  capabilities: null,
});
