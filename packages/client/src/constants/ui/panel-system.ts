/**
 * 面板系统的默认布局与运行时初始状态。
 */

import type { PanelLayoutProfile, PanelRuntimeState } from '../../ui/panel-system/types';

/** 客户端面板系统的初始运行时状态。 */
export const INITIAL_RUNTIME_STATE: PanelRuntimeState = {
  connected: false,
  playerId: null,
  mapId: null,
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
  overlayPanelIds: ['loot', 'settings', 'suggestion', 'changelog', 'debug'],
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
  overlayPanelIds: ['loot', 'settings', 'suggestion', 'changelog', 'debug'],
};
