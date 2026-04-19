import type { SidePanel } from './ui/side-panel';
import type { ChatUI } from './ui/chat';
import type { MainAttrDetailStateSource } from './main-attr-detail-state-source';

type MainShellBindingsOptions = {
  sidePanel: Pick<SidePanel, 'setVisibilityChangeCallback' | 'setLayoutChangeCallback' | 'setTabChangeCallback' | 'isVisible'>;
  chatUI: Pick<ChatUI, 'setLogbookVisible'>;
  attrDetailStateSource: Pick<MainAttrDetailStateSource, 'requestDetail'>;
  sendRequestLeaderboard: () => void;
  sendRequestWorldSummary: () => void;
  setPanelRuntimeShellVisible: (visible: boolean) => void;
  scheduleLayoutViewportSync: () => void;
  resizeCanvas: () => void;
  responsiveViewportChangeEvent: string;
  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;
  restartPingLoop: () => void;
  stopPingLoop: () => void;
  clearPendingSocketPing: () => void;
  renderPingLatency: (latencyMs: number | null, status?: string) => void;
  hasPendingTargetedAction: () => boolean;
  cancelTargeting: (showMessage?: boolean) => void;
  isObserveOpen: () => boolean;
  hideObserveModal: () => void;
  documentRef: Document;
  getObserveModalEl: () => HTMLElement | null;
  getObserveModalShellEl: () => HTMLElement | null;
};

export function bindMainShellInteractions(options: MainShellBindingsOptions): void {
  const syncChatLogbookVisibility = (): void => {
    const logbookPane = options.documentRef.querySelector<HTMLElement>('.split-tab-pane[data-pane="logbook"]');
    options.chatUI.setLogbookVisible(options.sidePanel.isVisible() && logbookPane?.classList.contains('active') === true);
  };

  options.sidePanel.setVisibilityChangeCallback((visible) => {
    options.setPanelRuntimeShellVisible(visible);
    syncChatLogbookVisibility();
    if (visible) {
      options.scheduleLayoutViewportSync();
    }
  });

  options.sidePanel.setLayoutChangeCallback(() => {
    if (!options.sidePanel.isVisible()) {
      return;
    }
    options.scheduleLayoutViewportSync();
  });

  options.sidePanel.setTabChangeCallback((tabName) => {
    syncChatLogbookVisibility();
    if (tabName === 'attr') {
      options.attrDetailStateSource.requestDetail();
      return;
    }
    if (tabName === 'world') {
      options.sendRequestLeaderboard();
      options.sendRequestWorldSummary();
    }
  });

  syncChatLogbookVisibility();

  window.addEventListener('resize', options.resizeCanvas);
  window.addEventListener(options.responsiveViewportChangeEvent, options.resizeCanvas as EventListener);
  window.addEventListener('focus', () => {
    options.scheduleConnectionRecovery(150);
    options.restartPingLoop();
  });
  window.addEventListener('pageshow', () => {
    options.scheduleConnectionRecovery(150);
    options.restartPingLoop();
  });
  window.addEventListener('online', () => {
    options.scheduleConnectionRecovery(150);
    options.restartPingLoop();
  });
  window.addEventListener('offline', () => {
    options.clearPendingSocketPing();
    options.renderPingLatency(null, '断网');
  });
  options.documentRef.addEventListener('visibilitychange', () => {
    if (options.documentRef.visibilityState === 'hidden') {
      options.stopPingLoop();
      return;
    }
    options.scheduleConnectionRecovery(150);
    options.restartPingLoop();
  });
  window.addEventListener('contextmenu', (event) => {
    if (options.hasPendingTargetedAction()) {
      event.preventDefault();
      options.cancelTargeting(true);
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && options.isObserveOpen()) {
      options.hideObserveModal();
      return;
    }
    if (event.key === 'Escape' && options.hasPendingTargetedAction()) {
      options.cancelTargeting(true);
    }
  });

  options.getObserveModalEl()?.addEventListener('click', () => {
    options.hideObserveModal();
  });
  options.getObserveModalShellEl()?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}
