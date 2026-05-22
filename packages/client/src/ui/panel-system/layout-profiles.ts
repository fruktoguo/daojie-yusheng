/**
 * 本文件是客户端 DOM UI 的 layout profiles 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import { DESKTOP_PANEL_LAYOUT, MOBILE_PANEL_LAYOUT } from '../../constants/ui/panel-system';
import type { PanelCapabilities, PanelLayoutProfile } from './types';

/** resolvePanelLayoutProfile：解析面板布局Profile。 */
export function resolvePanelLayoutProfile(capabilities: PanelCapabilities): PanelLayoutProfile {
  return capabilities.viewport === 'mobile' ? MOBILE_PANEL_LAYOUT : DESKTOP_PANEL_LAYOUT;
}




