import { PanelDefinition, PanelId } from './types';

export class PanelRegistry {
  private readonly definitions = new Map<PanelId, PanelDefinition>();

  register(definition: PanelDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  get(id: PanelId): PanelDefinition | undefined {
    return this.definitions.get(id);
  }

  list(): PanelDefinition[] {
    return [...this.definitions.values()];
  }
}

export function buildDefaultPanelRegistry(): PanelRegistry {
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
      title: '聊天',
      templateKind: 'floating',
      rootSelector: '#chat-panel',
      defaultPlacement: { desktop: 'floating', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'attr',
      title: '属性',
      templateKind: 'embedded',
      rootSelector: '#pane-attr',
      defaultPlacement: { desktop: 'left-lower', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'inventory',
      title: '背包',
      templateKind: 'embedded',
      rootSelector: '#pane-inventory',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'equipment',
      title: '装备',
      templateKind: 'embedded',
      rootSelector: '#pane-equipment',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'technique',
      title: '功法',
      templateKind: 'embedded',
      rootSelector: '#pane-technique',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'quest',
      title: '任务',
      templateKind: 'embedded',
      rootSelector: '#pane-quest',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'market',
      title: '坊市',
      templateKind: 'embedded',
      rootSelector: '#pane-market',
      defaultPlacement: { desktop: 'right-top', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'action',
      title: '行动',
      templateKind: 'embedded',
      rootSelector: '#pane-action',
      defaultPlacement: { desktop: 'right-bottom', mobile: 'external' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'world-map-intel',
      title: '地图情报',
      templateKind: 'embedded',
      rootSelector: '#pane-map-intel',
      defaultPlacement: { desktop: 'center-intel', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'world-nearby',
      title: '附近',
      templateKind: 'embedded',
      rootSelector: '#pane-nearby',
      defaultPlacement: { desktop: 'center-intel', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'world-suggestions',
      title: '建议',
      templateKind: 'embedded',
      rootSelector: '#pane-suggestions',
      defaultPlacement: { desktop: 'center-intel', mobile: 'external' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'loot',
      title: '拾取',
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'settings',
      title: '设置',
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'mail',
      title: '飞书',
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
      preservesInteractionState: true,
    },
    {
      id: 'suggestion',
      title: '反馈',
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'changelog',
      title: '更新日志',
      templateKind: 'modal',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'minimap',
      title: '小地图',
      templateKind: 'floating',
      defaultPlacement: { desktop: 'floating', mobile: 'floating' },
      supports: ['desktop', 'mobile'],
    },
    {
      id: 'debug',
      title: '调试',
      templateKind: 'modal',
      rootSelector: '#debug-panel',
      defaultPlacement: { desktop: 'overlay', mobile: 'overlay' },
      supports: ['desktop', 'mobile'],
    },
  ];

  for (const definition of definitions) {
    registry.register(definition);
  }

  return registry;
}
