import { createExternalStore } from './create-external-store';
import type { PanelCapabilities, PanelRuntimeState } from '../../ui/panel-system/types';

export interface NextUiShellState {
  enabled: boolean;
  mounted: boolean;
  runtime: PanelRuntimeState;
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
