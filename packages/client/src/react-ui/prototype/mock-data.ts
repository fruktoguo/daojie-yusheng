import { t } from '../../ui/i18n';

/**
 * PrototypeModuleId：统一结构类型，保证协议与运行时一致性。
 */
export type PrototypeModuleId =
  | 'foundation'
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
  /**
 * PrototypeModuleCardData：定义接口结构约束，明确可交付字段含义。
 */


export interface PrototypeModuleCardData {
/**
 * id：ID标识。
 */

  id: PrototypeModuleId;  
  /**
 * title：title名称或显示文本。
 */

  title: string;
  /**
 * domain：domain相关字段。
 */

  domain: string;
  /**
 * summary：摘要状态或数据块。
 */

  summary: string;
  /**
 * interactions：interaction相关字段。
 */

  interactions: string[];  
  /**
 * status：statu状态或数据块。
 */

  status: 'planned' | 'in-progress' | 'prototype-ready';
}

export const PROTOTYPE_MODULES: PrototypeModuleCardData[] = [
  { id: 'foundation', title: t('prototype.module.foundation.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.foundation.summary'), interactions: [t('prototype.module.foundation.interaction.button-state'), t('prototype.module.foundation.interaction.tab-switch'), t('prototype.module.foundation.interaction.resource-bar'), t('prototype.module.foundation.interaction.input-controls')], status: 'prototype-ready' },
  { id: 'login', title: t('prototype.module.login.title'), domain: t('prototype.module.domain.entry'), summary: t('prototype.module.login.summary'), interactions: [t('prototype.module.login.interaction.form-input'), t('prototype.module.login.interaction.error-feedback'), t('prototype.module.login.interaction.mode-switch')], status: 'prototype-ready' },
  { id: 'hud', title: t('prototype.module.hud.title'), domain: t('prototype.module.domain.hud'), summary: t('prototype.module.hud.summary'), interactions: [t('prototype.module.hud.interaction.resource-bar'), t('prototype.module.hud.interaction.quick-action'), t('prototype.module.hud.interaction.external-button')], status: 'prototype-ready' },
  { id: 'attr', title: t('prototype.module.attr.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.attr.summary'), interactions: [t('prototype.module.attr.interaction.tab-switch'), t('prototype.module.attr.interaction.local-number-update')], status: 'planned' },
  { id: 'equipment', title: t('prototype.module.equipment.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.equipment.summary'), interactions: [t('prototype.module.equipment.interaction.hover-tooltip'), t('prototype.module.equipment.interaction.slot-interaction')], status: 'planned' },
  { id: 'inventory', title: t('prototype.module.inventory.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.inventory.summary'), interactions: [t('prototype.module.inventory.interaction.filter'), t('prototype.module.inventory.interaction.selected-state'), t('prototype.module.inventory.interaction.scroll-list')], status: 'prototype-ready' },
  { id: 'technique', title: t('prototype.module.technique.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.technique.summary'), interactions: [t('prototype.module.technique.interaction.list-switch'), t('prototype.module.technique.interaction.detail-open'), t('prototype.module.technique.interaction.canvas-placeholder')], status: 'planned' },
  { id: 'action', title: t('prototype.module.action.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.action.summary'), interactions: [t('prototype.module.action.interaction.button-state'), t('prototype.module.action.interaction.sorting'), t('prototype.module.action.interaction.local-toggle')], status: 'prototype-ready' },
  { id: 'quest', title: t('prototype.module.quest.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.quest.summary'), interactions: [t('prototype.module.quest.interaction.list-select'), t('prototype.module.quest.interaction.status-tag'), t('prototype.module.quest.interaction.detail-modal')], status: 'prototype-ready' },
  { id: 'world', title: t('prototype.module.world.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.world.summary'), interactions: [t('prototype.module.world.interaction.world-summary'), t('prototype.module.world.interaction.entity-list'), t('prototype.module.world.interaction.recommendation')], status: 'prototype-ready' },
  { id: 'market', title: t('prototype.module.market.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.market.summary'), interactions: [t('prototype.module.market.interaction.pagination'), t('prototype.module.market.interaction.item-hover'), t('prototype.module.market.interaction.trade-modal')], status: 'prototype-ready' },
  { id: 'mail', title: t('prototype.module.mail.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.mail.summary'), interactions: [t('prototype.module.mail.interaction.selected-state'), t('prototype.module.mail.interaction.scroll-keep'), t('prototype.module.mail.interaction.attachment-area')], status: 'prototype-ready' },
  { id: 'settings', title: t('prototype.module.settings.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.settings.summary'), interactions: [t('prototype.module.settings.interaction.form-item'), t('prototype.module.settings.interaction.danger-button'), t('prototype.module.settings.interaction.theme-switch')], status: 'prototype-ready' },
  { id: 'suggestion', title: t('prototype.module.suggestion.title'), domain: t('prototype.module.domain.panel'), summary: t('prototype.module.suggestion.summary'), interactions: [t('prototype.module.suggestion.interaction.tab-switch'), t('prototype.module.suggestion.interaction.thread-reading'), t('prototype.module.suggestion.interaction.submit-entry')], status: 'planned' },
  { id: 'npc-shop', title: t('prototype.module.npc-shop.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.npc-shop.summary'), interactions: [t('prototype.module.npc-shop.interaction.list-detail-link'), t('prototype.module.npc-shop.interaction.quantity-input')], status: 'planned' },
  { id: 'npc-quest', title: t('prototype.module.npc-quest.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.npc-quest.summary'), interactions: [t('prototype.module.npc-quest.interaction.detail-switch'), t('prototype.module.npc-quest.interaction.status-button')], status: 'planned' },
  { id: 'craft', title: t('prototype.module.craft.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.craft.summary'), interactions: [t('prototype.module.craft.interaction.mode-switch'), t('prototype.module.craft.interaction.progress-state'), t('prototype.module.craft.interaction.material-list')], status: 'planned' },
  { id: 'loot', title: t('prototype.module.loot.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.loot.summary'), interactions: [t('prototype.module.loot.interaction.list-patch'), t('prototype.module.loot.interaction.source-header')], status: 'planned' },
  { id: 'minimap', title: t('prototype.module.minimap.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.minimap.summary'), interactions: [t('prototype.module.minimap.interaction.mark-chips'), t('prototype.module.minimap.interaction.scroll-list')], status: 'planned' },
  { id: 'tutorial', title: t('prototype.module.tutorial.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.tutorial.summary'), interactions: [t('prototype.module.tutorial.interaction.catalog-switch'), t('prototype.module.tutorial.interaction.body-scroll')], status: 'prototype-ready' },
  { id: 'changelog', title: t('prototype.module.changelog.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.changelog.summary'), interactions: [t('prototype.module.changelog.interaction.read-only-body')], status: 'prototype-ready' },
  { id: 'debug', title: t('prototype.module.debug.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.debug.summary'), interactions: [t('prototype.module.debug.interaction.status-tag'), t('prototype.module.debug.interaction.button')], status: 'planned' },
  { id: 'gm', title: t('prototype.module.gm.title'), domain: t('prototype.module.domain.gm'), summary: t('prototype.module.gm.summary'), interactions: [t('prototype.module.gm.interaction.table-patch'), t('prototype.module.gm.interaction.filter')], status: 'planned' },
  { id: 'heaven-gate', title: t('prototype.module.heaven-gate.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.heaven-gate.summary'), interactions: [t('prototype.module.heaven-gate.interaction.stage-switch'), t('prototype.module.heaven-gate.interaction.special-panel')], status: 'planned' },
  { id: 'entity-detail', title: t('prototype.module.entity-detail.title'), domain: t('prototype.module.domain.overlay'), summary: t('prototype.module.entity-detail.summary'), interactions: [t('prototype.module.entity-detail.interaction.single-instance-modal'), t('prototype.module.entity-detail.interaction.tooltip')], status: 'planned' },
];

export const PROTOTYPE_PLAYER = {
  name: t('prototype.player.name'),
  displayName: t('prototype.player.display-name'),
  title: t('prototype.player.title'),
  realm: t('prototype.player.realm'),
  map: t('prototype.player.map'),
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
    label: t('prototype.attr-tab.base'),
    rows: [
      [t('prototype.attr.base.vitality'), '148'],
      [t('prototype.attr.base.root-bone'), '132'],
      [t('prototype.attr.base.spirit-sense'), '118'],
      [t('prototype.attr.base.movement'), '126'],
      [t('prototype.attr.base.force'), '141'],
      [t('prototype.attr.base.meridians'), '67'],
    ],
  },
  {
    id: 'combat',
    label: t('prototype.attr-tab.combat'),
    rows: [
      [t('prototype.attr.combat.physical-attack'), '382'],
      [t('prototype.attr.combat.magic-attack'), '295'],
      [t('prototype.attr.combat.hit'), '88%'],
      [t('prototype.attr.combat.dodge'), '21%'],
      [t('prototype.attr.combat.crit'), '17%'],
      [t('prototype.attr.combat.crit-damage'), '162%'],
    ],
  },
  {
    id: 'special',
    label: t('prototype.attr-tab.special'),
    rows: [
      [t('prototype.attr.special.foundation'), '12,840'],
      [t('prototype.attr.special.combat-exp'), '3,820'],
      [t('prototype.attr.special.life-span'), '73 / 120'],
      [t('prototype.attr.special.alchemy'), t('prototype.attr.special.alchemy-value')],
      [t('prototype.attr.special.enhancement'), t('prototype.attr.special.enhancement-value')],
      [t('prototype.attr.special.sense-spirit'), t('prototype.attr.special.sense-spirit-value')],
    ],
  },
] as const;

export const PROTOTYPE_INVENTORY = [
  { id: 'sword-1', category: 'equipment', name: t('prototype.inventory.item.flowing-fire-sword'), qty: 1, grade: t('prototype.grade.earth'), note: t('prototype.inventory.item.flowing-fire-sword.note') },
  { id: 'robe-1', category: 'equipment', name: t('prototype.inventory.item.qing-pattern-robe'), qty: 1, grade: t('prototype.grade.mystic'), note: t('prototype.inventory.item.qing-pattern-robe.note') },
  { id: 'pill-1', category: 'consumable', name: t('prototype.inventory.item.qi-pill'), qty: 36, grade: t('prototype.grade.yellow'), note: t('prototype.inventory.item.qi-pill.note') },
  { id: 'book-1', category: 'skill_book', name: t('prototype.inventory.item.nine-turn-convergence-manual'), qty: 1, grade: t('prototype.grade.earth'), note: t('prototype.inventory.item.nine-turn-convergence-manual.note') },
  { id: 'mat-1', category: 'material', name: t('prototype.inventory.item.cold-iron-essence'), qty: 18, grade: t('prototype.grade.yellow'), note: t('prototype.inventory.item.cold-iron-essence.note') },
  { id: 'map-1', category: 'special', name: t('prototype.inventory.item.mount-sea-marker-fragment'), qty: 2, grade: t('prototype.grade.mystic'), note: t('prototype.inventory.item.mount-sea-marker-fragment.note') },
];

export const PROTOTYPE_ACTIONS = [
  { id: 'cultivate', name: t('prototype.action.cultivate'), state: t('prototype.action.state.constant'), note: t('prototype.action.cultivate.note'), enabled: true },
  { id: 'battle', name: t('prototype.action.battle'), state: t('prototype.action.state.targeted'), note: t('prototype.action.battle.note'), enabled: true },
  { id: 'loot', name: t('prototype.action.loot'), state: t('prototype.action.state.range-1'), note: t('prototype.action.loot.note'), enabled: false },
  { id: 'alchemy', name: t('prototype.action.alchemy-workbench'), state: t('prototype.action.state.panel-entry'), note: t('prototype.action.alchemy-workbench.note'), enabled: true },
  { id: 'enhancement', name: t('prototype.action.enhancement'), state: t('prototype.action.state.panel-entry'), note: t('prototype.action.enhancement.note'), enabled: true },
];

export const PROTOTYPE_TECHNIQUES = [
  { id: 'tech-1', name: t('prototype.inventory.item.nine-turn-convergence-manual'), level: t('prototype.technique.level.five'), note: t('prototype.technique.nine-turn-convergence-manual.note') },
  { id: 'tech-2', name: t('prototype.technique.item.xuan-frost-step'), level: t('prototype.technique.level.three'), note: t('prototype.technique.xuan-frost-step.note') },
  { id: 'tech-3', name: t('prototype.technique.item.burning-heart-sword-manual'), level: t('prototype.technique.level.two'), note: t('prototype.technique.burning-heart-sword-manual.note') },
];

export const PROTOTYPE_QUESTS = [
  { id: 'q-1', title: t('prototype.quest.market-letter.title'), status: t('prototype.quest.status.submitable'), note: t('prototype.quest.market-letter.note') },
  { id: 'q-2', title: t('prototype.quest.spirit-herb.title'), status: t('prototype.quest.status.in-progress'), note: t('prototype.quest.spirit-herb.note') },
  { id: 'q-3', title: t('prototype.quest.artificer.title'), status: t('prototype.quest.status.unaccepted'), note: t('prototype.quest.artificer.note') },
];

export const PROTOTYPE_MAILS = [
  {
    id: 'm-1',
    title: t('prototype.mail.sect-invite.title'),
    from: t('prototype.mail.sect-invite.from'),
    status: t('prototype.mail.status.unread'),
    note: t('prototype.mail.sect-invite.note'),
    body: t('prototype.mail.sect-invite.body'),
  },
  {
    id: 'm-2',
    title: t('prototype.mail.market-trade.title'),
    from: t('prototype.mail.market-trade.from'),
    status: t('prototype.mail.status.read'),
    note: t('prototype.mail.market-trade.note'),
    body: t('prototype.mail.market-trade.body'),
  },
  {
    id: 'm-3',
    title: t('prototype.mail.patch-notice.title'),
    from: t('prototype.mail.patch-notice.from'),
    status: t('prototype.mail.status.read'),
    note: t('prototype.mail.patch-notice.note'),
    body: t('prototype.mail.patch-notice.body'),
  },
];

export const PROTOTYPE_MARKET = [
  { id: 'mk-1', category: 'equipment', name: t('prototype.inventory.item.flowing-fire-sword'), sell: 18800, buy: 16200, owned: 1, note: t('prototype.market.flowing-fire-sword.note') },
  { id: 'mk-2', category: 'skill_book', name: t('prototype.inventory.item.nine-turn-convergence-manual'), sell: 46000, buy: 43000, owned: 0, note: t('prototype.market.nine-turn-convergence-manual.note') },
  { id: 'mk-3', category: 'consumable', name: t('prototype.inventory.item.qi-pill'), sell: 28, buy: 24, owned: 36, note: t('prototype.market.qi-pill.note') },
  { id: 'mk-4', category: 'material', name: t('prototype.inventory.item.cold-iron-essence'), sell: 320, buy: 280, owned: 18, note: t('prototype.market.cold-iron-essence.note') },
];

export const PROTOTYPE_WORLD_ENTITIES = [
  { id: 'w-1', name: t('prototype.world.guard.name'), kind: t('prototype.world.kind.npc'), note: t('prototype.world.guard.note') },
  { id: 'w-2', name: t('prototype.world.crimson-tail-wolf.name'), kind: t('prototype.world.kind.monster'), note: t('prototype.world.crimson-tail-wolf.note') },
  { id: 'w-3', name: t('prototype.world.market-gate.name'), kind: t('prototype.world.kind.teleport'), note: t('prototype.world.market-gate.note') },
];
