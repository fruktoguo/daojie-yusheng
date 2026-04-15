import { DESKTOP_PANEL_LAYOUT, MOBILE_PANEL_LAYOUT } from '../../constants/ui/panel-system';
import type { PanelCapabilities, PanelLayoutProfile } from './types';

/** resolvePanelLayoutProfile：执行对应的业务逻辑。 */
export function resolvePanelLayoutProfile(capabilities: PanelCapabilities): PanelLayoutProfile {
  return capabilities.viewport === 'mobile' ? MOBILE_PANEL_LAYOUT : DESKTOP_PANEL_LAYOUT;
}

