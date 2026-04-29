import type { SidePanel } from './ui/side-panel';
import type { ChatUI } from './ui/chat';
import type { MainAttrDetailStateSource } from './main-attr-detail-state-source';
/**
 * MainShellBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainShellBindingsOptions = {
/**
 * sidePanel：side面板相关字段。
 */

  sidePanel: Pick<SidePanel, 'setVisibilityChangeCallback' | 'setLayoutChangeCallback' | 'setTabChangeCallback' | 'isVisible'>;  
  /**
 * chatUI：chatUI相关字段。
 */

  chatUI: Pick<ChatUI, 'setLogbookVisible'>;  
  /**
 * attrDetailStateSource：attr详情状态来源相关字段。
 */

  attrDetailStateSource: Pick<MainAttrDetailStateSource, 'requestDetail'>;  
  /**
 * sendRequestLeaderboard：sendRequestLeaderboard相关字段。
 */

  sendRequestLeaderboard: () => void;  
  /**
 * sendRequestWorldSummary：sendRequest世界摘要状态或数据块。
 */

  sendRequestWorldSummary: () => void;  
  /**
 * setPanelRuntimeShellVisible：面板运行态Shell可见相关字段。
 */

  setPanelRuntimeShellVisible: (visible: boolean) => void;  
  /**
 * scheduleLayoutViewportSync：scheduleLayoutViewportSync相关字段。
 */

  scheduleLayoutViewportSync: () => void;  
  /**
 * resizeCanvas：resizeCanva相关字段。
 */

  resizeCanvas: () => void;  
  /**
 * responsiveViewportChangeEvent：responsiveViewportChange事件相关字段。
 */

  responsiveViewportChangeEvent: string;  
  /**
 * scheduleConnectionRecovery：scheduleConnectionRecovery相关字段。
 */

  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;  
  /**
 * restartPingLoop：restartPingLoop相关字段。
 */

  restartPingLoop: () => void;  
  /**
 * stopPingLoop：stopPingLoop相关字段。
 */

  stopPingLoop: () => void;  
  /**
 * clearPendingSocketPing：clearPendingSocketPing相关字段。
 */

  clearPendingSocketPing: () => void;  
  /**
 * renderPingLatency：PingLatency相关字段。
 */

  renderPingLatency: (latencyMs: number | null, status?: string) => void;  
  /**
 * hasPendingTargetedAction：启用开关或状态标识。
 */

  hasPendingTargetedAction: () => boolean;  
  /**
 * cancelTargeting：cancelTargeting相关字段。
 */

  cancelTargeting: (showMessage?: boolean) => void;  
  /**
 * isObserveOpen：启用开关或状态标识。
 */

  isObserveOpen: () => boolean;  
  /**
 * hideObserveModal：hideObserve弹层相关字段。
 */

  hideObserveModal: () => void;  
  /**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * getObserveModalEl：Observe弹层El相关字段。
 */

  getObserveModalEl: () => HTMLElement | null;  
  /**
 * getObserveModalShellEl：Observe弹层ShellEl相关字段。
 */

  getObserveModalShellEl: () => HTMLElement | null;
};
/**
 * bindMainShellInteractions：执行bindMainShellInteraction相关逻辑。
 * @param options MainShellBindingsOptions 选项参数。
 * @returns 无返回值，直接更新bindMainShellInteraction相关状态。
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
    options.renderPingLatency(null, '气机断绝');
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
