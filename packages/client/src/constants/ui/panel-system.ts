/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 面板系统的默认布局与运行时初始状态。
 */

import type { PanelLayoutProfile, PanelRuntimeState } from '../../ui/panel-system/types';

/** 客户端面板系统的初始运行时状态。 */
export const INITIAL_RUNTIME_STATE: PanelRuntimeState = {
  connected: false,
  playerId: null,
  mapId: null,
  mapName: null,
  shellVisible: false,
};

/** 桌面端默认面板布局。 */
export const DESKTOP_PANEL_LAYOUT: PanelLayoutProfile = {
  id: 'desktop',
  slots: [
    {
      placement: 'left-lower',
      panelIds: ['attr'],
    },
    {
      placement: 'center-intel',
      panelIds: ['world-map-intel', 'world-tianji'],
    },
    {
      placement: 'right-top',
      panelIds: ['inventory', 'equipment', 'technique', 'quest'],
    },
    {
      placement: 'right-bottom',
      panelIds: ['action'],
    },
    {
      placement: 'hud',
      panelIds: ['hud'],
    },
    {
      placement: 'floating',
      panelIds: ['minimap', 'chat'],
    },
  ],
  overlayPanelIds: ['loot', 'settings', 'changelog', 'debug'],
};

/** 移动端默认面板布局。 */
export const MOBILE_PANEL_LAYOUT: PanelLayoutProfile = {
  id: 'mobile',
  slots: [
    {
      placement: 'hud',
      panelIds: ['hud'],
    },
    {
      placement: 'floating',
      panelIds: ['minimap'],
    },
    {
      placement: 'external',
      panelIds: [
        'chat',
        'attr',
        'inventory',
        'equipment',
        'technique',
        'quest',
        'action',
        'world-map-intel',
        'world-tianji',
      ],
    },
  ],
  overlayPanelIds: ['loot', 'settings', 'changelog', 'debug'],
};
