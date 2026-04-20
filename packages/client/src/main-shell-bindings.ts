import type { SidePanel } from './ui/side-panel';
import type { ChatUI } from './ui/chat';
import type { MainAttrDetailStateSource } from './main-attr-detail-state-source';
/**
 * MainShellBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainShellBindingsOptions = {
/**
 * sidePanel：对象字段。
 */

  sidePanel: Pick<SidePanel, 'setVisibilityChangeCallback' | 'setLayoutChangeCallback' | 'setTabChangeCallback' | 'isVisible'>;  
  /**
 * chatUI：对象字段。
 */

  chatUI: Pick<ChatUI, 'setLogbookVisible'>;  
  /**
 * attrDetailStateSource：对象字段。
 */

  attrDetailStateSource: Pick<MainAttrDetailStateSource, 'requestDetail'>;  
  /**
 * sendRequestLeaderboard：对象字段。
 */

  sendRequestLeaderboard: () => void;  
  /**
 * sendRequestWorldSummary：对象字段。
 */

  sendRequestWorldSummary: () => void;  
  /**
 * setPanelRuntimeShellVisible：对象字段。
 */

  setPanelRuntimeShellVisible: (visible: boolean) => void;  
  /**
 * scheduleLayoutViewportSync：对象字段。
 */

  scheduleLayoutViewportSync: () => void;  
  /**
 * resizeCanvas：对象字段。
 */

  resizeCanvas: () => void;  
  /**
 * responsiveViewportChangeEvent：对象字段。
 */

  responsiveViewportChangeEvent: string;  
  /**
 * scheduleConnectionRecovery：对象字段。
 */

  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;  
  /**
 * restartPingLoop：对象字段。
 */

  restartPingLoop: () => void;  
  /**
 * stopPingLoop：对象字段。
 */

  stopPingLoop: () => void;  
  /**
 * clearPendingSocketPing：对象字段。
 */

  clearPendingSocketPing: () => void;  
  /**
 * renderPingLatency：对象字段。
 */

  renderPingLatency: (latencyMs: number | null, status?: string) => void;  
  /**
 * hasPendingTargetedAction：对象字段。
 */

  hasPendingTargetedAction: () => boolean;  
  /**
 * cancelTargeting：对象字段。
 */

  cancelTargeting: (showMessage?: boolean) => void;  
  /**
 * isObserveOpen：对象字段。
 */

  isObserveOpen: () => boolean;  
  /**
 * hideObserveModal：对象字段。
 */

  hideObserveModal: () => void;  
  /**
 * documentRef：对象字段。
 */

  documentRef: Document;  
  /**
 * getObserveModalEl：对象字段。
 */

  getObserveModalEl: () => HTMLElement | null;  
  /**
 * getObserveModalShellEl：对象字段。
 */

  getObserveModalShellEl: () => HTMLElement | null;
};
/**
 * bindMainShellInteractions：执行核心业务逻辑。
 * @param options MainShellBindingsOptions 选项参数。
 * @returns void。
 */


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
