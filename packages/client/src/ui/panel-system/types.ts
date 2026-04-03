export type PanelId =
  | 'hud'
  | 'chat'
  | 'attr'
  | 'inventory'
  | 'equipment'
  | 'technique'
  | 'body-training'
  | 'quest'
  | 'market'
  | 'action'
  | 'world-map-intel'
  | 'world-nearby'
  | 'world-suggestions'
  | 'loot'
  | 'settings'
  | 'mail'
  | 'suggestion'
  | 'changelog'
  | 'minimap'
  | 'debug';

export type PanelViewport = 'desktop' | 'mobile';

export type PanelPlacement =
  | 'left-lower'
  | 'center-intel'
  | 'right-top'
  | 'right-bottom'
  | 'hud'
  | 'floating'
  | 'overlay'
  | 'external';

export type PanelTemplateKind = 'embedded' | 'modal' | 'hud' | 'floating';

export interface PanelDefinition {
  id: PanelId;
  title: string;
  templateKind: PanelTemplateKind;
  rootSelector?: string;
  defaultPlacement: Partial<Record<PanelViewport, PanelPlacement>>;
  supports: PanelViewport[];
  preservesInteractionState?: boolean;
}

export interface PanelCapabilities {
  viewportWidth: number;
  viewportHeight: number;
  pointerCoarse: boolean;
  hoverAvailable: boolean;
  reducedMotion: boolean;
  breakpoint: 'mobile' | 'tablet' | 'desktop';
  viewport: PanelViewport;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface PanelLayoutSlot {
  placement: PanelPlacement;
  panelIds: PanelId[];
}

export interface PanelLayoutProfile {
  id: PanelViewport;
  slots: PanelLayoutSlot[];
  overlayPanelIds: PanelId[];
}

export interface PanelUiState {
  activeTab?: string;
  selectedId?: string | null;
  openDetailId?: string | null;
  filterId?: string | null;
  modalOpen?: boolean;
}

export interface PanelRuntimeState {
  connected: boolean;
  playerId: string | null;
  mapId: string | null;
  shellVisible: boolean;
}

export interface PanelSystemState {
  capabilities: PanelCapabilities;
  layout: PanelLayoutProfile;
  runtime: PanelRuntimeState;
  panels: Partial<Record<PanelId, PanelUiState>>;
}
