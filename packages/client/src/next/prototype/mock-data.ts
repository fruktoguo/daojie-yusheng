export type PrototypeModuleId =
  | 'login'
  | 'hud'
  | 'attr'
  | 'equipment'
  | 'inventory'
  | 'technique'
  | 'action'
  | 'quest'
  | 'world'
  | 'market'
  | 'mail'
  | 'settings'
  | 'suggestion'
  | 'npc-shop'
  | 'npc-quest'
  | 'craft'
  | 'loot'
  | 'minimap'
  | 'tutorial'
  | 'changelog'
  | 'debug'
  | 'gm'
  | 'heaven-gate'
  | 'entity-detail';

export interface PrototypeModuleCardData {
  id: PrototypeModuleId;
  title: string;
  domain: '入口' | 'HUD' | '面板' | '浮层' | 'GM';
  summary: string;
  interactions: string[];
  status: 'planned' | 'in-progress' | 'prototype-ready';
}

export const PROTOTYPE_MODULES: PrototypeModuleCardData[] = [
  { id: 'login', title: '登录', domain: '入口', summary: '账号、角色名、显示名、登录态切换。', interactions: ['表单输入', '错误反馈', '模式切换'], status: 'prototype-ready' },
  { id: 'hud', title: 'HUD', domain: 'HUD', summary: '角色主状态、地图、境界、资源条。', interactions: ['资源条', '快捷动作', '外链按钮'], status: 'prototype-ready' },
  { id: 'attr', title: '属性面板', domain: '面板', summary: '基础属性、战斗属性、特殊属性分页。', interactions: ['Tab 切换', '局部数值更新'], status: 'planned' },
  { id: 'equipment', title: '装备面板', domain: '面板', summary: '装备槽、对比、hover 详情。', interactions: ['hover tooltip', '槽位交互'], status: 'planned' },
  { id: 'inventory', title: '背包面板', domain: '面板', summary: '筛选、选中、物品详情、批量操作。', interactions: ['筛选', '选中态', '滚动列表'], status: 'prototype-ready' },
  { id: 'technique', title: '功法面板', domain: '面板', summary: '功法列表、层级、技能、里程碑。', interactions: ['列表切换', '详情展开', 'Canvas 区域占位'], status: 'planned' },
  { id: 'action', title: '行动面板', domain: '面板', summary: '行动列表、自动战斗、目标模式。', interactions: ['按钮状态', '排序', '局部开关'], status: 'prototype-ready' },
  { id: 'quest', title: '任务面板', domain: '面板', summary: '主支线任务、追踪、导航入口。', interactions: ['列表选中', '状态标签', '详情弹层'], status: 'prototype-ready' },
  { id: 'world', title: '世界面板', domain: '面板', summary: '地图摘要、附近实体、推荐行动。', interactions: ['世界摘要', '实体列表', '推荐区'], status: 'prototype-ready' },
  { id: 'market', title: '坊市面板', domain: '面板', summary: '盘面、书籍、交易弹窗、托管仓。', interactions: ['分页', '物品 hover', '交易弹窗'], status: 'prototype-ready' },
  { id: 'mail', title: '邮件面板', domain: '面板', summary: '邮件列表、正文、附件、未读态。', interactions: ['选中态', '滚动保留', '附件区'], status: 'prototype-ready' },
  { id: 'settings', title: '设置面板', domain: '面板', summary: '主题、字号、缩放、登出与兑换码。', interactions: ['表单项', '危险按钮', '主题切换'], status: 'prototype-ready' },
  { id: 'suggestion', title: '建议面板', domain: '面板', summary: '我的建议、处理结果、线程区。', interactions: ['Tab 切换', '线程阅读', '提交入口'], status: 'planned' },
  { id: 'npc-shop', title: 'NPC 商店', domain: '浮层', summary: '货架列表、详情区、购买确认。', interactions: ['列表详情联动', '数量输入'], status: 'planned' },
  { id: 'npc-quest', title: 'NPC 委托', domain: '浮层', summary: '接取、提交、任务详情。', interactions: ['详情切换', '状态按钮'], status: 'planned' },
  { id: 'craft', title: '炼丹 / 强化', domain: '浮层', summary: '双模式工作台、配方、进度、取消。', interactions: ['模式切换', '进度态', '材料列表'], status: 'planned' },
  { id: 'loot', title: '掉落弹层', domain: '浮层', summary: '来源列表、全部拾取、逐项拾取。', interactions: ['列表 patch', '来源头'], status: 'planned' },
  { id: 'minimap', title: '小地图', domain: '浮层', summary: '地图发现、标记、图鉴区。', interactions: ['标记 chips', '滚动列表'], status: 'planned' },
  { id: 'tutorial', title: '教程', domain: '浮层', summary: '分主题阅读与索引。', interactions: ['目录切换', '正文滚动'], status: 'prototype-ready' },
  { id: 'changelog', title: '更新日志', domain: '浮层', summary: '版本说明和公告。', interactions: ['只读正文'], status: 'prototype-ready' },
  { id: 'debug', title: '调试面板', domain: '浮层', summary: '诊断信息与调试动作。', interactions: ['状态标签', '按钮'], status: 'planned' },
  { id: 'gm', title: 'GM 面板', domain: 'GM', summary: '玩家列表、建议处理、地图控制。', interactions: ['表格局部 patch', '筛选'], status: 'planned' },
  { id: 'heaven-gate', title: '天门', domain: '浮层', summary: '特殊突破流程和判定展示。', interactions: ['阶段切换', '特殊面板'], status: 'planned' },
  { id: 'entity-detail', title: '实体详情', domain: '浮层', summary: '观察目标、Buff、交互入口。', interactions: ['单实例详情弹层', 'tooltip'], status: 'planned' },
];

export const PROTOTYPE_PLAYER = {
  name: '顾长青',
  displayName: '青',
  title: '流云散修',
  realm: '筑基初期',
  map: '青石坊',
  position: '(31, 18)',
  hp: 1820,
  hpMax: 2200,
  qi: 960,
  qiMax: 1200,
  cultivate: 4600,
  cultivateMax: 7000,
  foundation: 12840,
  combatExp: 3820,
};

export const PROTOTYPE_ATTR_TABS = [
  {
    id: 'base',
    label: '基础',
    rows: [
      ['体魄', '148'],
      ['根骨', '132'],
      ['神识', '118'],
      ['身法', '126'],
      ['悟性', '141'],
      ['福缘', '67'],
    ],
  },
  {
    id: 'combat',
    label: '战斗',
    rows: [
      ['物攻', '382'],
      ['法攻', '295'],
      ['命中', '88%'],
      ['闪避', '21%'],
      ['暴击', '17%'],
      ['暴伤', '162%'],
    ],
  },
  {
    id: 'special',
    label: '特殊',
    rows: [
      ['底蕴', '12,840'],
      ['战斗经验', '3,820'],
      ['寿元', '73 / 120'],
      ['炼丹术', '二阶中品'],
      ['强化术', '一阶圆满'],
      ['可感灵气', '是'],
    ],
  },
] as const;

export const PROTOTYPE_INVENTORY = [
  { id: 'sword-1', category: 'equipment', name: '流火长剑', qty: 1, grade: '地品', note: '+7 强化 · 武器' },
  { id: 'robe-1', category: 'equipment', name: '青纹法袍', qty: 1, grade: '玄品', note: '衣服 · 抗性偏向' },
  { id: 'pill-1', category: 'consumable', name: '养气丹', qty: 36, grade: '黄品', note: '可批量使用' },
  { id: 'book-1', category: 'skill_book', name: '九转凝息诀', qty: 1, grade: '地品', note: '功法书 · hover 详情' },
  { id: 'mat-1', category: 'material', name: '寒铁精', qty: 18, grade: '黄品', note: '炼器材料' },
  { id: 'map-1', category: 'special', name: '山海道标残卷', qty: 2, grade: '玄品', note: '地图解锁物品' },
];

export const PROTOTYPE_ACTIONS = [
  { id: 'cultivate', name: '吐纳修炼', state: '常驻', note: '当前地图允许', enabled: true },
  { id: 'battle', name: '战斗接战', state: '目标型', note: '需要选中怪物', enabled: true },
  { id: 'loot', name: '拾取地物', state: '范围 1', note: '支持全部拾取', enabled: false },
  { id: 'alchemy', name: '炼丹工作台', state: '面板入口', note: '打开工作台', enabled: true },
  { id: 'enhancement', name: '装备强化', state: '面板入口', note: '打开强化台', enabled: true },
];

export const PROTOTYPE_TECHNIQUES = [
  { id: 'tech-1', name: '九转凝息诀', level: '五层', note: '主修功法 · 正在运转' },
  { id: 'tech-2', name: '玄霜步', level: '三层', note: '身法 · 提升闪避' },
  { id: 'tech-3', name: '焚心剑经', level: '二层', note: '攻伐 · 提升物攻' },
];

export const PROTOTYPE_QUESTS = [
  { id: 'q-1', title: '坊市来信', status: '可提交', note: '与信使交谈' },
  { id: 'q-2', title: '灵草试采', status: '进行中', note: '收集 4/6 份青露草' },
  { id: 'q-3', title: '初识器道', status: '未接取', note: '前往铁匠铺' },
];

export const PROTOTYPE_MAILS = [
  {
    id: 'm-1',
    title: '宗门邀约',
    from: '青石坊驿馆',
    status: '未读',
    note: '附带 2 件附件',
    body: '顾长青：\n\n青石坊近来妖患稍重，驿馆愿荐你前往青岩渡口协防三日。若愿接下此事，可携此信前往坊北驿站。\n\n另附补给两份，路上慎行。',
  },
  {
    id: 'm-2',
    title: '坊市成交提醒',
    from: '坊市司库',
    status: '已读',
    note: '灵石已入托管仓',
    body: '你挂售的【流火长剑】已成交，所得灵石已划入坊市托管仓，可随时领取。',
  },
  {
    id: 'm-3',
    title: '版本公告',
    from: '系统',
    status: '已读',
    note: '查看更新日志',
    body: '本次更新重点：\n1. 整理世界摘要与推荐行动。\n2. 收敛坊市盘面信息。\n3. 优化部分弹层的移动端适配。',
  },
];

export const PROTOTYPE_MARKET = [
  { id: 'mk-1', category: 'equipment', name: '流火长剑', sell: 18800, buy: 16200, owned: 1, note: '武器 · 强化装备' },
  { id: 'mk-2', category: 'skill_book', name: '九转凝息诀', sell: 46000, buy: 43000, owned: 0, note: '功法书 · 主修类' },
  { id: 'mk-3', category: 'consumable', name: '养气丹', sell: 28, buy: 24, owned: 36, note: '丹药 · 批量消耗' },
  { id: 'mk-4', category: 'material', name: '寒铁精', sell: 320, buy: 280, owned: 18, note: '材料 · 锻造需求' },
];

export const PROTOTYPE_WORLD_ENTITIES = [
  { id: 'w-1', name: '青石坊守卫', kind: 'NPC', note: '可对话 · 可接委托' },
  { id: 'w-2', name: '赤尾狼', kind: '怪物', note: '精英 · 低血量' },
  { id: 'w-3', name: '坊市界门', kind: '传送点', note: '通往外城' },
];
