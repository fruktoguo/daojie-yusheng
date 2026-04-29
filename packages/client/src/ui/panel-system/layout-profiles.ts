import { DESKTOP_PANEL_LAYOUT, MOBILE_PANEL_LAYOUT } from '../../constants/ui/panel-system';
import type { PanelCapabilities, PanelLayoutProfile } from './types';

/** resolvePanelLayoutProfile：解析面板布局Profile。 */
export function resolvePanelLayoutProfile(capabilities: PanelCapabilities): PanelLayoutProfile {
  return capabilities.viewport === 'mobile' ? MOBILE_PANEL_LAYOUT : DESKTOP_PANEL_LAYOUT;
}




