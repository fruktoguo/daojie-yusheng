/**
 * 客户端新手导览配置。
 *
 * 这里只描述“指向哪里、进入前做什么、如何推进”，具体遮罩和定位由 ui/guided-tour.ts 负责。
 */

export type GuidedTourPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export type GuidedTourAdvanceMode = 'next' | 'target-click';

export type GuidedTourPrepareWhen = 'always' | 'mobile' | 'desktop';

export type GuidedTourPrepareAction =
  | {
      type: 'switch-tab';
      tabName: string;
      when?: GuidedTourPrepareWhen;
    }
  | {
      type: 'set-layout-collapsed';
      target: 'left' | 'right' | 'bottom';
      collapsed: boolean;
      when?: GuidedTourPrepareWhen;
    };

export interface GuidedTourStep {
  id: string;
  targetSelector: string;
  mobileTargetSelector?: string;
  titleKey: string;
  titleFallback: string;
  bodyKey: string;
  bodyFallback: string;
  placement?: GuidedTourPlacement;
  advanceMode?: GuidedTourAdvanceMode;
  prepare?: GuidedTourPrepareAction[];
}

export interface GuidedTourFlow {
  id: string;
  storageVersion: number;
  autoStart: boolean;
  titleKey: string;
  titleFallback: string;
  steps: GuidedTourStep[];
}

export const STARTER_GUIDED_TOUR_FLOW_ID = 'starter-basics';

export const GUIDED_TOUR_FLOWS: GuidedTourFlow[] = [
  {
    id: STARTER_GUIDED_TOUR_FLOW_ID,
    storageVersion: 1,
    autoStart: true,
    titleKey: 'guided-tour.flow.starter.title',
    titleFallback: '基础界面导览',
    steps: [
      {
        id: 'hud',
        targetSelector: '#hud',
        titleKey: 'guided-tour.step.hud.title',
        titleFallback: '先看自身状态',
        bodyKey: 'guided-tour.step.hud.body',
        bodyFallback: '这里显示角色、境界、气血、灵力和突破入口。后续能突破时，按钮会出现在境界区域。',
        placement: 'right',
        prepare: [
          { type: 'set-layout-collapsed', target: 'left', collapsed: false, when: 'desktop' },
          { type: 'switch-tab', tabName: 'mobile-overview', when: 'mobile' },
        ],
      },
      {
        id: 'map',
        targetSelector: '#game-stage',
        titleKey: 'guided-tour.step.map.title',
        titleFallback: '地图是主要行动区',
        bodyKey: 'guided-tour.step.map.body',
        bodyFallback: '点击可见地图格子可以移动或选择目标。战斗、采集、观察等指向性操作也会落在这里。',
        placement: 'top',
        prepare: [
          { type: 'set-layout-collapsed', target: 'bottom', collapsed: false, when: 'desktop' },
        ],
      },
      {
        id: 'inventory-tab',
        targetSelector: '[data-tab="inventory"]',
        mobileTargetSelector: '[data-tab="mobile-bag"]',
        titleKey: 'guided-tour.step.inventory.title',
        titleFallback: '打开行囊',
        bodyKey: 'guided-tour.step.inventory.body',
        bodyFallback: '背包、装备、功法和任务都在这一侧。点击高亮按钮进入行囊页签。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
        ],
      },
      {
        id: 'action-panel',
        targetSelector: '#pane-action',
        titleKey: 'guided-tour.step.action.title',
        titleFallback: '行动栏执行操作',
        bodyKey: 'guided-tour.step.action.body',
        bodyFallback: '常用互动、技能、开关和通用操作都在行动栏。需要点目标的操作会先进入选择状态，再到地图上点目标。',
        placement: 'left',
        prepare: [
          { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
          { type: 'switch-tab', tabName: 'mobile-action', when: 'mobile' },
        ],
      },
      {
        id: 'tutorial-book',
        targetSelector: '#hud-open-tutorial',
        titleKey: 'guided-tour.step.tutorial.title',
        titleFallback: '百科随时可查',
        bodyKey: 'guided-tour.step.tutorial.body',
        bodyFallback: '不清楚系统规则时，可以从这里打开百科。导览完成后也能从设置或调试入口重新打开。',
        placement: 'bottom',
        prepare: [
          { type: 'set-layout-collapsed', target: 'left', collapsed: false, when: 'desktop' },
          { type: 'switch-tab', tabName: 'mobile-overview', when: 'mobile' },
        ],
      },
    ],
  },
];
