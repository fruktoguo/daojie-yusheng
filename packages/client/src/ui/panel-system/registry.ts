/**
 * 本文件是客户端 DOM UI 的 registry 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import { PanelDefinition, PanelId } from './types';
import { t } from '../i18n';

/** PanelRegistry：面板注册表实现。 */
export class PanelRegistry {
  /** definitions：definitions。 */
  private readonly definitions = new Map<PanelId, PanelDefinition>();

  /** register：处理register。 */
  register(definition: PanelDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  /** get：读取get。 */
  get(id: PanelId): PanelDefinition | undefined {
    return this.definitions.get(id);
  }

  /** list：列出列表。 */
  list(): PanelDefinition[] {
    return [...this.definitions.values()];
  }
}

/** buildDefaultPanelRegistry：构建默认面板注册表。 */
export function buildDefaultPanelRegistry(): PanelRegistry {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const registry = new PanelRegistry();
  const definitions: PanelDefinition[] = [
    {
      id: 'hud',
      title: 'HUD',
      templateKind: 'hud',
      rootSelector: '#hud',
      defaultPlacement: { desktop: 'hud', mobile: 'hud' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'chat',
      title: t('panel.registry.chat'),
      templateKind: 'floating',
      rootSelector: '#chat-panel',
      defaultPlacement: { desktop: 'floating', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'attr',
      title: t('panel.registry.attr'),
      templateKind: 'embedded',
      rootSelector: '#pane-attr',
      defaultPlacement: { desktop: 'left-lower', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'inventory',
      title: t('panel.registry.inventory'),
      templateKind: 'embedded',
      rootSelector: '#pane-inventory',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'equipment',
      title: t('panel.registry.equipment'),
      templateKind: 'embedded',
      rootSelector: '#pane-equipment',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'technique',
      title: t('panel.registry.technique'),
      templateKind: 'embedded',
      rootSelector: '#pane-technique',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'body-training',
      title: t('panel.registry.body-training'),
      templateKind: 'embedded',
      rootSelector: '#pane-body-training',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'quest',
      title: t('panel.registry.quest'),
      templateKind: 'embedded',
      rootSelector: '#pane-quest',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'market',
      title: t('panel.registry.market'),
      templateKind: 'embedded',
      rootSelector: '#pane-market',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'action',
      title: t('panel.registry.action'),
      templateKind: 'embedded',
      rootSelector: '#pane-action',
      defaultPlacement: { desktop: 'right-bottom', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'world-map-intel',
      title: t('panel.registry.world-map-intel'),
      templateKind: 'embedded',
      rootSelector: '#pane-map-intel',
      defaultPlacement: { desktop: 'center-intel', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'world-tianji',
      title: t('panel.registry.world-tianji'),
      templateKind: 'embedded',
      rootSelector: '#pane-tianji',
      defaultPlacement: { desktop: 'center-intel', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'loot',
      title: t('panel.registry.loot'),
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'settings',
      title: t('panel.registry.settings'),
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'mail',
      title: t('panel.registry.mail'),
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'changelog',
      title: t('panel.registry.changelog'),
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'minimap',
      title: t('panel.registry.minimap'),
      templateKind: 'floating',
      defaultPlacement: { desktop: 'floating', mobile: 'floating' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'debug',
      title: t('panel.registry.debug'),
      templateKind: 'modal',
      rootSelector: '#debug-panel',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
  ];

  for (const definition of definitions) {
    registry.register(definition);
  }

  return registry;
}
