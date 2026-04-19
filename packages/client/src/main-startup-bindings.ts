import type { SocketAdminSender } from './network/socket-send-admin';
import type { SocketPanelSender } from './network/socket-send-panel';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { bindZoomControls } from './main-ui-helpers';

type MainStartupBindingsOptions = {
  initializeUiStyleConfig: () => void;
  mountNextUi: () => void;
  startClientVersionReload: (options: { onBeforeReload: () => void }) => void;
  onBeforeVersionReload: () => void;
  createChangelogPanel: () => void;
  createTutorialPanel: () => void;
  syncInitialPanelRuntime: () => void;
  subscribePanelStore: () => void;
  attachMapRuntime: () => void;
  bodyTrainingPanel: {
    setInfusionHandler: (handler: (foundationSpent: number) => void) => void;
  };
  hud: {
    setCallbacks: (callback: () => void) => void;
  };
  lootPanel: {
    setCallbacks: (
      onTakeOne: (sourceId: string, itemKey: string) => void,
      onTakeAll: (sourceId: string) => void,
    ) => void;
  };
  equipmentPanel: {
    setCallbacks: (onUnequip: Parameters<SocketPanelSender['sendUnequip']>[0] extends infer T ? (slot: T) => void : never) => void;
  };
  npcShopModal: {
    setCallbacks: (callbacks: {
      onRequestShop: (npcId: string) => void;
      onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
    }) => void;
  };
  craftWorkbenchModal: {
    setCallbacks: (callbacks: {
      onRequestAlchemy: (knownCatalogVersion?: number) => void;
      onRequestEnhancement: () => void;
      onStartAlchemy: (recipeId: string, ingredients: Array<{ itemId: string; count: number }>, quantity: number) => void;
      onCancelAlchemy: () => void;
      onStartEnhancement: (payload: Parameters<SocketPanelSender['sendStartEnhancement']>[0]) => void;
      onCancelEnhancement: () => void;
    }) => void;
  };
  debugPanel: {
    setCallbacks: (onResetSpawn: () => void) => void;
  };
  chatUI: {
    setCallback: (handler: (message: string) => void) => void;
  };
  zoom: {
    zoomSlider: HTMLInputElement | null;
    zoomResetBtn: HTMLButtonElement | null;
    minZoom: number;
    maxZoom: number;
    applyZoomChange: (nextZoom: number) => number;
  };
  showToast: (message: string) => void;
  joinQqGroupBtns: Iterable<HTMLAnchorElement>;
  qqGroupNumber: string;
  qqGroupMobileDeepLink: string;
  qqGroupDesktopDeepLink: string;
  registerAutoBattleButtons: () => void;
  onOpenRealmAction: () => void;
  runtimeSender: Pick<SocketRuntimeSender, 'sendAction'>;
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
  socialEconomySender: Pick<SocketSocialEconomySender, 'sendChat'>;
  adminSender: Pick<SocketAdminSender, 'sendDebugResetSpawn'>;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
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

function resolveQqGroupLink(mobile: string, desktop: string): string {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return isMobile ? mobile : desktop;
}

export function bindMainStartup(options: MainStartupBindingsOptions): void {
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
