import type { SocketAdminSender } from './network/socket-send-admin';
import type { SocketPanelSender } from './network/socket-send-panel';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { bindZoomControls } from './main-ui-helpers';
/**
 * MainStartupBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainStartupBindingsOptions = {
/**
 * initializeUiStyleConfig：对象字段。
 */

  initializeUiStyleConfig: () => void;  
  /**
 * mountNextUi：对象字段。
 */

  mountNextUi: () => void;  
  /**
 * startClientVersionReload：对象字段。
 */

  startClientVersionReload: (options: {  
  /**
 * onBeforeReload：对象字段。
 */
 onBeforeReload: () => void }) => void;  
 /**
 * onBeforeVersionReload：对象字段。
 */

  onBeforeVersionReload: () => void;  
  /**
 * createChangelogPanel：对象字段。
 */

  createChangelogPanel: () => void;  
  /**
 * createTutorialPanel：对象字段。
 */

  createTutorialPanel: () => void;  
  /**
 * syncInitialPanelRuntime：对象字段。
 */

  syncInitialPanelRuntime: () => void;  
  /**
 * subscribePanelStore：对象字段。
 */

  subscribePanelStore: () => void;  
  /**
 * attachMapRuntime：对象字段。
 */

  attachMapRuntime: () => void;  
  /**
 * bodyTrainingPanel：对象字段。
 */

  bodyTrainingPanel: {  
  /**
 * setInfusionHandler：对象字段。
 */

    setInfusionHandler: (handler: (foundationSpent: number) => void) => void;
  };  
  /**
 * hud：对象字段。
 */

  hud: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (callback: () => void) => void;
  };  
  /**
 * lootPanel：对象字段。
 */

  lootPanel: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (
      onTakeOne: (sourceId: string, itemKey: string) => void,
      onTakeAll: (sourceId: string) => void,
    ) => void;
  };  
  /**
 * equipmentPanel：对象字段。
 */

  equipmentPanel: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (onUnequip: Parameters<SocketPanelSender['sendUnequip']>[0] extends infer T ? (slot: T) => void : never) => void;
  };  
  /**
 * npcShopModal：对象字段。
 */

  npcShopModal: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (callbacks: {    
    /**
 * onRequestShop：对象字段。
 */

      onRequestShop: (npcId: string) => void;      
      /**
 * onBuyItem：对象字段。
 */

      onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
    }) => void;
  };  
  /**
 * craftWorkbenchModal：对象字段。
 */

  craftWorkbenchModal: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (callbacks: {    
    /**
 * onRequestAlchemy：对象字段。
 */

      onRequestAlchemy: (knownCatalogVersion?: number) => void;      
      /**
 * onRequestEnhancement：对象字段。
 */

      onRequestEnhancement: () => void;      
      /**
 * onStartAlchemy：对象字段。
 */

      onStartAlchemy: (recipeId: string, ingredients: Array<{      
      /**
 * itemId：对象字段。
 */
 itemId: string;      
 /**
 * count：对象字段。
 */
 count: number }>, quantity: number) => void;      
 /**
 * onCancelAlchemy：对象字段。
 */

      onCancelAlchemy: () => void;      
      /**
 * onStartEnhancement：对象字段。
 */

      onStartEnhancement: (payload: Parameters<SocketPanelSender['sendStartEnhancement']>[0]) => void;      
      /**
 * onCancelEnhancement：对象字段。
 */

      onCancelEnhancement: () => void;
    }) => void;
  };  
  /**
 * debugPanel：对象字段。
 */

  debugPanel: {  
  /**
 * setCallbacks：对象字段。
 */

    setCallbacks: (onResetSpawn: () => void) => void;
  };  
  /**
 * chatUI：对象字段。
 */

  chatUI: {  
  /**
 * setCallback：对象字段。
 */

    setCallback: (handler: (message: string) => void) => void;
  };  
  /**
 * zoom：对象字段。
 */

  zoom: {  
  /**
 * zoomSlider：对象字段。
 */

    zoomSlider: HTMLInputElement | null;    
    /**
 * zoomResetBtn：对象字段。
 */

    zoomResetBtn: HTMLButtonElement | null;    
    /**
 * minZoom：对象字段。
 */

    minZoom: number;    
    /**
 * maxZoom：对象字段。
 */

    maxZoom: number;    
    /**
 * applyZoomChange：对象字段。
 */

    applyZoomChange: (nextZoom: number) => number;
  };  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;  
  /**
 * joinQqGroupBtns：对象字段。
 */

  joinQqGroupBtns: Iterable<HTMLAnchorElement>;  
  /**
 * qqGroupNumber：对象字段。
 */

  qqGroupNumber: string;  
  /**
 * qqGroupMobileDeepLink：对象字段。
 */

  qqGroupMobileDeepLink: string;  
  /**
 * qqGroupDesktopDeepLink：对象字段。
 */

  qqGroupDesktopDeepLink: string;  
  /**
 * registerAutoBattleButtons：对象字段。
 */

  registerAutoBattleButtons: () => void;  
  /**
 * onOpenRealmAction：对象字段。
 */

  onOpenRealmAction: () => void;  
  /**
 * runtimeSender：对象字段。
 */

  runtimeSender: Pick<SocketRuntimeSender, 'sendAction'>;  
  /**
 * panelSender：对象字段。
 */

  panelSender: Pick<
    SocketPanelSender,
    | 'sendTakeLoot'
    | 'sendUnequip'
    | 'sendRequestNpcShop'
    | 'sendBuyNpcShopItem'
    | 'sendRequestAlchemyPanel'
    | 'sendRequestEnhancementPanel'
    | 'sendStartAlchemy'
    | 'sendCancelAlchemy'
    | 'sendStartEnhancement'
    | 'sendCancelEnhancement'
  >;  
  /**
 * socialEconomySender：对象字段。
 */

  socialEconomySender: Pick<SocketSocialEconomySender, 'sendChat'>;  
  /**
 * adminSender：对象字段。
 */

  adminSender: Pick<SocketAdminSender, 'sendDebugResetSpawn'>;
};
/**
 * copyTextToClipboard：执行核心业务逻辑。
 * @param text string 参数说明。
 * @returns Promise<boolean>。
 */


async function copyTextToClipboard(text: string): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 回退到旧复制链路。
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
/**
 * resolveQqGroupLink：执行核心业务逻辑。
 * @param mobile string 参数说明。
 * @param desktop string 参数说明。
 * @returns string。
 */


function resolveQqGroupLink(mobile: string, desktop: string): string {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return isMobile ? mobile : desktop;
}
/**
 * bindMainStartup：执行核心业务逻辑。
 * @param options MainStartupBindingsOptions 选项参数。
 * @returns void。
 */


export function bindMainStartup(options: MainStartupBindingsOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  options.initializeUiStyleConfig();
  options.mountNextUi();
  options.startClientVersionReload({
    onBeforeReload: options.onBeforeVersionReload,
  });

  options.createChangelogPanel();
  options.createTutorialPanel();
  options.syncInitialPanelRuntime();
  options.subscribePanelStore();
  options.attachMapRuntime();

  options.bodyTrainingPanel.setInfusionHandler((foundationSpent) => {
    options.runtimeSender.sendAction('body_training:infuse', String(foundationSpent));
  });

  options.hud.setCallbacks(() => {
    options.onOpenRealmAction();
  });

  options.lootPanel.setCallbacks(
    (sourceId, itemKey) => {
      options.panelSender.sendTakeLoot(sourceId, itemKey);
    },
    (sourceId) => {
      options.panelSender.sendTakeLoot(sourceId, undefined, true);
    },
  );

  options.equipmentPanel.setCallbacks((slot) => {
    options.panelSender.sendUnequip(slot);
  });

  options.npcShopModal.setCallbacks({
    onRequestShop: (npcId) => options.panelSender.sendRequestNpcShop(npcId),
    onBuyItem: (npcId, itemId, quantity) => options.panelSender.sendBuyNpcShopItem(npcId, itemId, quantity),
  });

  options.craftWorkbenchModal.setCallbacks({
    onRequestAlchemy: (knownCatalogVersion) => options.panelSender.sendRequestAlchemyPanel(knownCatalogVersion),
    onRequestEnhancement: () => options.panelSender.sendRequestEnhancementPanel(),
    onStartAlchemy: (recipeId, ingredients, quantity) => options.panelSender.sendStartAlchemy({ recipeId, ingredients, quantity }),
    onCancelAlchemy: () => options.panelSender.sendCancelAlchemy(),
    onStartEnhancement: (payload) => options.panelSender.sendStartEnhancement(payload),
    onCancelEnhancement: () => options.panelSender.sendCancelEnhancement(),
  });

  options.debugPanel.setCallbacks(() => {
    options.showToast('已发送回出生点请求');
    options.adminSender.sendDebugResetSpawn();
  });

  options.chatUI.setCallback((message) => {
    options.socialEconomySender.sendChat(message);
  });

  bindZoomControls({
    zoomSlider: options.zoom.zoomSlider,
    zoomResetBtn: options.zoom.zoomResetBtn,
    minZoom: options.zoom.minZoom,
    maxZoom: options.zoom.maxZoom,
    applyZoomChange: options.zoom.applyZoomChange,
    showToast: options.showToast,
  });

  for (const button of options.joinQqGroupBtns) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void (async () => {
        const copied = await copyTextToClipboard(options.qqGroupNumber);
        window.location.href = resolveQqGroupLink(options.qqGroupMobileDeepLink, options.qqGroupDesktopDeepLink);
        window.setTimeout(() => {
          if (document.visibilityState !== 'visible') {
            return;
          }
          options.showToast(
            copied
              ? `已尝试唤起 QQ，加群失败时可直接粘贴群号 ${options.qqGroupNumber}`
              : `已尝试唤起 QQ，如未打开请手动搜索群号 ${options.qqGroupNumber}`,
          );
        }, 600);
      })();
    });
  }

  options.registerAutoBattleButtons();
}
