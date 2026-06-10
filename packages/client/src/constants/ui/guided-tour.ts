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
    }
  | {
      type: 'click';
      selector: string;
      mobileSelector?: string;
      waitMs?: number;
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

const OPEN_ACTION_PANEL_PREPARE: GuidedTourPrepareAction[] = [
  { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
  { type: 'switch-tab', tabName: 'mobile-action', when: 'mobile' },
];

const OPEN_TECHNIQUE_PANEL_PREPARE: GuidedTourPrepareAction[] = [
  { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
  { type: 'switch-tab', tabName: 'mobile-bag', when: 'mobile' },
  { type: 'switch-tab', tabName: 'technique' },
];

const OPEN_ATTR_PANEL_PREPARE: GuidedTourPrepareAction[] = [
  { type: 'set-layout-collapsed', target: 'left', collapsed: false, when: 'desktop' },
  { type: 'switch-tab', tabName: 'mobile-attrs', when: 'mobile' },
];

const OPEN_ATTR_CRAFT_PANEL_PREPARE: GuidedTourPrepareAction[] = [
  ...OPEN_ATTR_PANEL_PREPARE,
  { type: 'click', selector: '[data-guided-tour-attr-tab="craft"]' },
];

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
  {
    id: 'alchemy-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.alchemy.title',
    titleFallback: '炼丹引导',
    steps: [
      {
        id: 'alchemy-attr-panel',
        targetSelector: '#pane-attr',
        titleKey: 'guided-tour.step.alchemy-attr-panel.title',
        titleFallback: '先看左侧修行卷',
        bodyKey: 'guided-tour.step.alchemy-attr-panel.body',
        bodyFallback: '炼丹入口在左侧修行卷的技艺页里。桌面端展开左侧，手机端先切到属性页。',
        placement: 'right',
        prepare: OPEN_ATTR_PANEL_PREPARE,
      },
      {
        id: 'alchemy-craft-tab',
        targetSelector: '[data-guided-tour-attr-tab="craft"]',
        titleKey: 'guided-tour.step.alchemy-craft-tab.title',
        titleFallback: '切换到技艺',
        bodyKey: 'guided-tour.step.alchemy-craft-tab.body',
        bodyFallback: '点击技艺页，进入炼丹、炼器、强化、挖矿等技艺等级与入口列表。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ATTR_PANEL_PREPARE,
      },
      {
        id: 'alchemy-craft-row',
        targetSelector: '[data-guided-tour-craft-skill="alchemy"]',
        titleKey: 'guided-tour.step.alchemy-craft-row.title',
        titleFallback: '找到炼丹',
        bodyKey: 'guided-tour.step.alchemy-craft-row.body',
        bodyFallback: '这一行显示炼丹等级、经验进度和距离下一级还需经验。右侧打开按钮会进入炼丹操作界面。',
        placement: 'right',
        prepare: OPEN_ATTR_CRAFT_PANEL_PREPARE,
      },
      {
        id: 'alchemy-open',
        targetSelector: '[data-guided-tour-craft-open="alchemy"]',
        titleKey: 'guided-tour.step.alchemy-open.title',
        titleFallback: '打开炼丹',
        bodyKey: 'guided-tour.step.alchemy-open.body',
        bodyFallback: '点击炼丹这一行的打开按钮，进入对应的炼丹操作界面。',
        placement: 'right',
        advanceMode: 'target-click',
        prepare: OPEN_ATTR_CRAFT_PANEL_PREPARE,
      },
      {
        id: 'alchemy-workbench',
        targetSelector: '.detail-modal--craft [data-craft-workbench-shell="true"]',
        titleKey: 'guided-tour.step.alchemy-workbench.title',
        titleFallback: '炼丹操作界面',
        bodyKey: 'guided-tour.step.alchemy-workbench.body',
        bodyFallback: '左侧是技艺模式切换，右侧是当前炼丹内容。基础丹方和自定义丹方都在这里完成。',
        placement: 'left',
      },
      {
        id: 'alchemy-qi-realm',
        targetSelector: '[data-guided-tour-alchemy-realm="qi"]',
        titleKey: 'guided-tour.step.alchemy-qi-realm.title',
        titleFallback: '选择练气期',
        bodyKey: 'guided-tour.step.alchemy-qi-realm.body',
        bodyFallback: '先按丹药适用阶段筛选。回春散属于练气期恢复类丹药，点击练气期分组。',
        placement: 'bottom',
        advanceMode: 'target-click',
      },
      {
        id: 'alchemy-recovery-category',
        targetSelector: '[data-guided-tour-alchemy-category="recovery"]',
        titleKey: 'guided-tour.step.alchemy-recovery-category.title',
        titleFallback: '选择回复药',
        bodyKey: 'guided-tour.step.alchemy-recovery-category.body',
        bodyFallback: '再按用途筛选。回复药分组会收束到气血、灵力等恢复类丹药。',
        placement: 'bottom',
        advanceMode: 'target-click',
      },
      {
        id: 'alchemy-recovery-powder',
        targetSelector: '[data-guided-tour-alchemy-output="recovery_powder"], [data-guided-tour-alchemy-recipe="alchemy.recovery_powder"]',
        titleKey: 'guided-tour.step.alchemy-recovery-powder.title',
        titleFallback: '选择回春散',
        bodyKey: 'guided-tour.step.alchemy-recovery-powder.body',
        bodyFallback: '点击回春散后，右侧会显示等级、品阶、五行匹配、材料、耗时、成功率和单批产出。',
        placement: 'right',
        advanceMode: 'target-click',
      },
      {
        id: 'alchemy-detail',
        targetSelector: '[data-alchemy-detail-panel="true"]',
        titleKey: 'guided-tour.step.alchemy-detail.title',
        titleFallback: '查看丹方详情',
        bodyKey: 'guided-tour.step.alchemy-detail.body',
        bodyFallback: '详情区会对比当前投料和标准需求。基础丹方按固定材料炼制，适合稳定生产。',
        placement: 'left',
      },
      {
        id: 'alchemy-custom-tab',
        targetSelector: '[data-guided-tour-alchemy-tab="simple"]',
        titleKey: 'guided-tour.step.alchemy-custom-tab.title',
        titleFallback: '切到自定义丹方',
        bodyKey: 'guided-tour.step.alchemy-custom-tab.body',
        bodyFallback: '自定义丹方允许调整辅药，用不同材料尝试满足五行需求。点击这里查看自定义投料区。',
        placement: 'bottom',
        advanceMode: 'target-click',
      },
      {
        id: 'alchemy-custom-detail',
        targetSelector: '[data-alchemy-ingredients="true"], [data-alchemy-actions="true"]',
        titleKey: 'guided-tour.step.alchemy-custom-detail.title',
        titleFallback: '自定义丹方说明',
        bodyKey: 'guided-tour.step.alchemy-custom-detail.body',
        bodyFallback: '主药通常固定，辅药可以加减。系统会按当前投料重新计算成功率、耗时和是否满足完整丹方。',
        placement: 'left',
      },
      {
        id: 'alchemy-base-tab',
        targetSelector: '[data-guided-tour-alchemy-tab="full"]',
        titleKey: 'guided-tour.step.alchemy-base-tab.title',
        titleFallback: '回到基础丹方',
        bodyKey: 'guided-tour.step.alchemy-base-tab.body',
        bodyFallback: '点击基础丹方，回到标准配方视图。新手优先用基础丹方确认材料和消耗。',
        placement: 'bottom',
        advanceMode: 'target-click',
      },
      {
        id: 'alchemy-start',
        targetSelector: '[data-guided-tour-alchemy-start="full"]',
        titleKey: 'guided-tour.step.alchemy-start.title',
        titleFallback: '开始炼制',
        bodyKey: 'guided-tour.step.alchemy-start.body',
        bodyFallback: '材料足够时，从这里开始炼制或加入技艺队列。按钮不可点时，先补齐材料或灵石。',
        placement: 'top',
      },
    ],
  },
  {
    id: 'observe-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.observe.title',
    titleFallback: '观察功能引导',
    steps: [
      {
        id: 'observe-action-panel',
        targetSelector: '#pane-action',
        titleKey: 'guided-tour.step.observe-action-panel.title',
        titleFallback: '打开行动栏',
        bodyKey: 'guided-tour.step.observe-action-panel.body',
        bodyFallback: '观察是指向地图格子的通用操作，先打开行动栏。',
        placement: 'left',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'observe-utility-tab',
        targetSelector: '[data-action-tab="utility"]',
        titleKey: 'guided-tour.step.observe-utility-tab.title',
        titleFallback: '切到通用页',
        bodyKey: 'guided-tour.step.observe-utility-tab.body',
        bodyFallback: '通用页放置观察、强制攻击、返回复活点等不属于普通技能的操作。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'observe-button',
        targetSelector: '[data-action-exec="client:observe"]',
        titleKey: 'guided-tour.step.observe-button.title',
        titleFallback: '点击观察',
        bodyKey: 'guided-tour.step.observe-button.body',
        bodyFallback: '点击观察后会进入选格状态，不会立刻消耗资源。接着到地图上选择要查看的格子。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="utility"]' },
        ],
      },
      {
        id: 'observe-map',
        targetSelector: '#game-stage',
        titleKey: 'guided-tour.step.observe-map.title',
        titleFallback: '在地图上选格',
        bodyKey: 'guided-tour.step.observe-map.body',
        bodyFallback: '观察可以查看视野内格子的地形、资源、建筑或实体信息。选中目标后，详情会在界面中弹出。',
        placement: 'top',
      },
    ],
  },
  {
    id: 'sense-qi-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.sense-qi.title',
    titleFallback: '感气功能引导',
    steps: [
      {
        id: 'sense-qi-toggle-tab',
        targetSelector: '[data-action-tab="toggle"]',
        titleKey: 'guided-tour.step.sense-qi-toggle-tab.title',
        titleFallback: '切到开关页',
        bodyKey: 'guided-tour.step.sense-qi-toggle-tab.body',
        bodyFallback: '感气是显示类开关，先进入行动栏的开关页。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'sense-qi-card',
        targetSelector: '[data-action-card="sense_qi:toggle"]',
        titleKey: 'guided-tour.step.sense-qi-card.title',
        titleFallback: '开启感气',
        bodyKey: 'guided-tour.step.sense-qi-card.body',
        bodyFallback: '点击感气开关后，地图会显示可感知的灵气、魔气、煞气等气机线索。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="toggle"]' },
        ],
      },
      {
        id: 'sense-qi-map',
        targetSelector: '#game-stage',
        titleKey: 'guided-tour.step.sense-qi-map.title',
        titleFallback: '观察地图气机',
        bodyKey: 'guided-tour.step.sense-qi-map.body',
        bodyFallback: '开启后回到地图查看气机叠层。不同地点的灵气、阵法、地块状态会影响后续判断。',
        placement: 'top',
      },
    ],
  },
  {
    id: 'cultivation-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.cultivation.title',
    titleFallback: '修炼引导',
    steps: [
      {
        id: 'cultivation-open-bag',
        targetSelector: '[data-tab="inventory"]',
        mobileTargetSelector: '[data-tab="mobile-bag"]',
        titleKey: 'guided-tour.step.cultivation-open-bag.title',
        titleFallback: '打开行囊侧栏',
        bodyKey: 'guided-tour.step.cultivation-open-bag.body',
        bodyFallback: '功法面板在行囊侧栏里。桌面端展开右侧，手机端先切到行囊页。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
          { type: 'switch-tab', tabName: 'mobile-bag', when: 'mobile' },
        ],
      },
      {
        id: 'cultivation-technique-tab',
        targetSelector: '[data-tab="technique"]',
        titleKey: 'guided-tour.step.cultivation-technique-tab.title',
        titleFallback: '切到功法',
        bodyKey: 'guided-tour.step.cultivation-technique-tab.body',
        bodyFallback: '修炼功法前，先进入功法页查看已学功法、领悟进度和主修按钮。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: [
          { type: 'set-layout-collapsed', target: 'right', collapsed: false, when: 'desktop' },
          { type: 'switch-tab', tabName: 'mobile-bag', when: 'mobile' },
        ],
      },
      {
        id: 'cultivation-technique-card',
        targetSelector: '[data-guided-tour-cultivate-button="true"], [data-tech-cultivate-button]',
        titleKey: 'guided-tour.step.cultivation-technique-card.title',
        titleFallback: '选择主修功法',
        bodyKey: 'guided-tour.step.cultivation-technique-card.body',
        bodyFallback: '这里可以把某门功法设为主修。若按钮显示取消主修，说明当前已经有功法在修炼中。',
        placement: 'left',
        prepare: OPEN_TECHNIQUE_PANEL_PREPARE,
      },
      {
        id: 'cultivation-toggle-tab',
        targetSelector: '[data-action-tab="toggle"]',
        titleKey: 'guided-tour.step.cultivation-toggle-tab.title',
        titleFallback: '回到修炼开关',
        bodyKey: 'guided-tour.step.cultivation-toggle-tab.body',
        bodyFallback: '主修功法确定后，再回到行动栏开关页控制当前是否闭关修炼。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'cultivation-toggle-card',
        targetSelector: '[data-action-card="cultivation:toggle"]',
        titleKey: 'guided-tour.step.cultivation-toggle-card.title',
        titleFallback: '当前修炼开关',
        bodyKey: 'guided-tour.step.cultivation-toggle-card.body',
        bodyFallback: '这个开关控制是否进行闭关修炼。开启后每息获得境界修为和主修功法经验，移动、攻击等操作可能打断当前修炼状态。',
        placement: 'left',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="toggle"]' },
        ],
      },
      {
        id: 'cultivation-auto-card',
        targetSelector: '[data-action-card="toggle:auto_idle_cultivation"], [data-action-card="toggle:auto_switch_cultivation"]',
        titleKey: 'guided-tour.step.cultivation-auto-card.title',
        titleFallback: '自动修炼选项',
        bodyKey: 'guided-tour.step.cultivation-auto-card.body',
        bodyFallback: '自动修炼会在空闲时尝试恢复修炼；修满切换可辅助轮换功法。按当前策略选择开启即可。',
        placement: 'left',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="toggle"]' },
        ],
      },
    ],
  },
  {
    id: 'force-attack-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.force-attack.title',
    titleFallback: '强制攻击引导',
    steps: [
      {
        id: 'force-attack-utility-tab',
        targetSelector: '[data-action-tab="utility"]',
        titleKey: 'guided-tour.step.force-attack-utility-tab.title',
        titleFallback: '切到通用页',
        bodyKey: 'guided-tour.step.force-attack-utility-tab.body',
        bodyFallback: '强制攻击属于通用操作，用于主动选择目标发起攻击。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'force-attack-button',
        targetSelector: '[data-action-exec="battle:force_attack"]',
        titleKey: 'guided-tour.step.force-attack-button.title',
        titleFallback: '点击强制攻击',
        bodyKey: 'guided-tour.step.force-attack-button.body',
        bodyFallback: '点击后进入选目标状态。它不会自动找怪，需要你在地图上指定要攻击的目标。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="utility"]' },
        ],
      },
      {
        id: 'force-attack-map',
        targetSelector: '#game-stage',
        titleKey: 'guided-tour.step.force-attack-map.title',
        titleFallback: '选择攻击目标',
        bodyKey: 'guided-tour.step.force-attack-map.body',
        bodyFallback: '在地图上点击视野内目标即可发起攻击。请注意玩家、怪物、建筑或阵法目标的可攻击规则不同。',
        placement: 'top',
      },
    ],
  },
  {
    id: 'mining-guide',
    storageVersion: 1,
    autoStart: false,
    titleKey: 'guided-tour.flow.mining.title',
    titleFallback: '挖矿引导',
    steps: [
      {
        id: 'mining-skill-tab',
        targetSelector: '[data-action-tab="skill"]',
        titleKey: 'guided-tour.step.mining-skill-tab.title',
        titleFallback: '切到技能页',
        bodyKey: 'guided-tour.step.mining-skill-tab.body',
        bodyFallback: '挖矿是需要附近有矿脉时出现的采集行动。先进入行动栏的技能页。',
        placement: 'bottom',
        advanceMode: 'target-click',
        prepare: OPEN_ACTION_PANEL_PREPARE,
      },
      {
        id: 'mining-button',
        targetSelector: '[data-action-exec="mining:start"], [data-action-card="mining:start"]',
        titleKey: 'guided-tour.step.mining-button.title',
        titleFallback: '点击挖矿',
        bodyKey: 'guided-tour.step.mining-button.body',
        bodyFallback: '看到挖矿行动时，点击它进入矿脉选择状态。若当前没有这个按钮，说明附近没有可采的可见矿脉。',
        placement: 'left',
        advanceMode: 'target-click',
        prepare: [
          ...OPEN_ACTION_PANEL_PREPARE,
          { type: 'click', selector: '[data-action-tab="skill"]' },
        ],
      },
      {
        id: 'mining-map',
        targetSelector: '#game-stage',
        titleKey: 'guided-tour.step.mining-map.title',
        titleFallback: '选择矿脉格',
        bodyKey: 'guided-tour.step.mining-map.body',
        bodyFallback: '移动到矿脉附近后，在地图上选择可见矿脉格即可开始采集。挖矿按钮随位置和可见目标动态出现。',
        placement: 'top',
      },
    ],
  },
];
