/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import type { SocketAdminSender } from './network/socket-send-admin';
import type { SocketPanelSender } from './network/socket-send-panel';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { bindZoomControls } from './main-ui-helpers';
import { t } from './ui/i18n';
/**
 * MainStartupBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainStartupBindingsOptions = {
/**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;
  /**
 * initializeUiStyleConfig：initializeUiStyle配置状态或数据块。
 */

  initializeUiStyleConfig: () => void;
  /**
 * mountReactUi：mountReactUi相关字段。
 */

  mountReactUi: () => void;
  /**
 * startClientVersionReload：startClientVersionReload相关字段。
 */

  startClientVersionReload: (options: {
  /**
 * onBeforeReload：onBeforeReload相关字段。
 */
 onBeforeReload: () => void }) => void;
 /**
 * onBeforeVersionReload：onBeforeVersionReload相关字段。
 */

  onBeforeVersionReload: () => void;
  /**
 * createChangelogPanel：Changelog面板相关字段。
 */

  createChangelogPanel: () => void;
  /**
 * createTutorialPanel：Tutorial面板相关字段。
 */

  createTutorialPanel: () => void;
  /**
 * syncInitialPanelRuntime：Initial面板运行态引用。
 */

  syncInitialPanelRuntime: () => void;
  /**
 * subscribePanelStore：subscribe面板存储引用。
 */

  subscribePanelStore: () => void;
  /**
 * attachMapRuntime：attach地图运行态引用。
 */

  attachMapRuntime: () => void;
  /**
 * bodyTrainingPanel：bodyTraining面板相关字段。
 */

  bodyTrainingPanel: {
  /**
 * setInfusionHandler：InfusionHandler相关字段。
 */

    setInfusionHandler: (handler: (foundationSpent: number) => void) => void;
  };
  /**
 * hud：hud相关字段。
 */

  hud: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (callback: () => void) => void;
  };
  /**
 * lootPanel：掉落面板相关字段。
 */

  lootPanel: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (
      onTakeOne: (sourceId: string, itemKey: string) => void,
      onTakeAll: (sourceId: string) => void,
      onStartGather?: (sourceId: string, itemKey: string) => void,
      onCancelGather?: () => void,
      onStopHarvest?: () => void,
    ) => void;
  };
  /**
 * equipmentPanel：装备面板相关字段。
 */

  equipmentPanel: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (
      onUnequip: (slot: Parameters<SocketPanelSender['sendUnequip']>[0], expectedItemInstanceId?: string) => void,
      onSetArtifactSlotEnabled?: (
        slot: Parameters<SocketPanelSender['sendSetArtifactSlotEnabled']>[0],
        enabled: Parameters<SocketPanelSender['sendSetArtifactSlotEnabled']>[1],
      ) => void,
    ) => void;
  };
  /**
 * npcShopModal：NPCShop弹层相关字段。
 */

  npcShopModal: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (callbacks: {
    /**
 * onRequestShop：onRequestShop相关字段。
 */

      onRequestShop: (npcId: string) => void;
      /**
 * onBuyItem：onBuy道具相关字段。
 */

      onBuyItem: (npcId: string, itemId: string, quantity: number) => void;
    }) => void;
  };
  /**
 * craftWorkbenchModal：炼制Workbench弹层相关字段。
 */

  craftWorkbenchModal: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (callbacks: {
    /**
 * onRequestAlchemy：onRequest炼丹相关字段。
 */

      onRequestAlchemy: (knownCatalogVersion?: number) => void;
      onRequestForging: (knownCatalogVersion?: number) => void;
      /**
 * onSaveAlchemyPreset：onSave炼丹预设相关字段。
 */

      onSaveAlchemyPreset: (payload: Parameters<SocketPanelSender['sendSaveAlchemyPreset']>[0]) => void;
      /**
 * onDeleteAlchemyPreset：onDelete炼丹预设相关字段。
 */

      onDeleteAlchemyPreset: (presetId: string) => void;
      /**
 * onRequestEnhancement：onRequest强化相关字段。
 */

      onRequestEnhancement: () => void;
      /**
 * onStartAlchemy：onStart炼丹相关字段。
 */

      onStartAlchemy: (recipeId: string, ingredients: Array<{
      /**
 * itemId：道具ID标识。
 */
 itemId: string;
 /**
 * count：数量或计量字段。
 */
 count: number }>, quantity: number, queueMode?: Parameters<SocketPanelSender['sendStartAlchemy']>[0]['queueMode']) => void;
      onStartForging: (recipeId: string, ingredients: Array<{
 itemId: string;
 count: number }>, quantity: number, queueMode?: Parameters<SocketPanelSender['sendStartForging']>[0]['queueMode']) => void;
 /**
 * onCancelAlchemy：onCancel炼丹相关字段。
 */

      onCancelAlchemy: () => void;
      onCancelForging: () => void;
      onCancelTechniqueActivity: (cancelRef: Parameters<SocketPanelSender['sendCancelTechniqueActivity']>[0]) => void;
      /**
 * onStartEnhancement：onStart强化相关字段。
 */

      onStartEnhancement: (payload: Parameters<SocketPanelSender['sendStartEnhancement']>[0]) => void;
      /**
 * onCancelEnhancement：onCancel强化相关字段。
 */

      onCancelEnhancement: () => void;
    }) => void;
  };
  /**
 * debugPanel：debug面板相关字段。
 */

  debugPanel: {
  /**
 * setCallbacks：Callback相关字段。
 */

    setCallbacks: (onResetSpawn: () => void) => void;
  };
  /**
 * chatUI：chatUI相关字段。
 */

  chatUI: {
  /**
 * setCallback：Callback相关字段。
 */

    setCallback: (handler: (message: string) => void) => void;
  };
  /**
 * zoom：zoom相关字段。
 */

  zoom: {
  /**
 * zoomSlider：zoomSlider相关字段。
 */

    zoomSlider: HTMLInputElement | null;
    /**
 * zoomResetBtn：zoomResetBtn相关字段。
 */

    zoomResetBtn: HTMLButtonElement | null;
    /**
 * minZoom：minZoom相关字段。
 */

    minZoom: number;
    /**
 * maxZoom：maxZoom相关字段。
 */

    maxZoom: number;
    /**
 * applyZoomChange：ZoomChange相关字段。
 */

    applyZoomChange: (nextZoom: number) => number;
  };
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;
  /**
 * qqGroupNumber：qqGroupNumber相关字段。
 */

  qqGroupNumber: string;
  /**
 * qqGroupMobileDeepLink：qqGroupMobileDeepLink相关字段。
 */

  qqGroupMobileDeepLink: string;
  /**
 * qqGroupDesktopDeepLink：qqGroupDesktopDeepLink相关字段。
 */

  qqGroupDesktopDeepLink: string;
  /**
 * registerAutoBattleButtons：registerAutoBattleButton相关字段。
 */

  registerAutoBattleButtons: () => void;
  /**
 * onOpenRealmAction：onOpenRealmAction相关字段。
 */

  onOpenRealmAction: () => void;
  /**
 * runtimeSender：运行态Sender相关字段。
 */

  runtimeSender: Pick<SocketRuntimeSender, 'sendAction'>;
  /**
 * panelSender：面板Sender相关字段。
 */

  panelSender: Pick<
    SocketPanelSender,
    | 'sendTakeLoot'
    | 'sendStartGather'
    | 'sendCancelGather'
    | 'sendStopLootHarvest'
    | 'sendUnequip'
    | 'sendSetArtifactSlotEnabled'
    | 'sendRequestNpcShop'
    | 'sendBuyNpcShopItem'
    | 'sendRequestAlchemyPanel'
    | 'sendRequestForgingPanel'
    | 'sendSaveAlchemyPreset'
    | 'sendDeleteAlchemyPreset'
    | 'sendRequestEnhancementPanel'
    | 'sendStartAlchemy'
    | 'sendStartForging'
    | 'sendCancelAlchemy'
    | 'sendCancelForging'
    | 'sendStartEnhancement'
    | 'sendCancelEnhancement'
    | 'sendCancelTechniqueActivity'
  >;
  /**
 * socialEconomySender：socialEconomySender相关字段。
 */

  socialEconomySender: Pick<SocketSocialEconomySender, 'sendChat'>;
  /**
 * adminSender：adminSender相关字段。
 */

  adminSender: Pick<SocketAdminSender, 'sendDebugResetSpawn'>;
};
/**
 * copyTextToClipboard：执行copyTextToClipboard相关逻辑。
 * @param text string 参数说明。
 * @returns 返回 Promise，完成后得到copyTextToClipboard。
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
 * resolveQqGroupLink：规范化或转换QqGroupLink。
 * @param mobile string 参数说明。
 * @param desktop string 参数说明。
 * @returns 返回QqGroupLink。
 */


function resolveQqGroupLink(mobile: string, desktop: string): string {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return isMobile ? mobile : desktop;
}

function openQqGroupLink(url: string): boolean {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  return opened !== null;
}

function resolveQqGroupButton(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>('[data-qq-group-link="true"]') : null;
}
/**
 * bindMainStartup：执行bindMainStartup相关逻辑。
 * @param options MainStartupBindingsOptions 选项参数。
 * @returns 无返回值，直接更新bindMainStartup相关状态。
 */


export function bindMainStartup(options: MainStartupBindingsOptions): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  options.initializeUiStyleConfig();
  options.mountReactUi();
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
    (sourceId, itemKey) => {
      options.panelSender.sendStartGather({ sourceId, itemKey });
    },
    () => {
      options.panelSender.sendCancelGather();
    },
    () => {
      options.panelSender.sendStopLootHarvest();
    },
  );

  options.equipmentPanel.setCallbacks(
    (slot, expectedItemInstanceId) => {
      options.panelSender.sendUnequip(slot, expectedItemInstanceId);
    },
    (slot, enabled) => {
      options.panelSender.sendSetArtifactSlotEnabled(slot, enabled);
    },
  );

  options.npcShopModal.setCallbacks({
    onRequestShop: (npcId) => options.panelSender.sendRequestNpcShop(npcId),
    onBuyItem: (npcId, itemId, quantity) => options.panelSender.sendBuyNpcShopItem(npcId, itemId, quantity),
  });

  options.craftWorkbenchModal.setCallbacks({
    onRequestAlchemy: (knownCatalogVersion) => options.panelSender.sendRequestAlchemyPanel(knownCatalogVersion),
    onRequestForging: (knownCatalogVersion) => options.panelSender.sendRequestForgingPanel(knownCatalogVersion),
    onSaveAlchemyPreset: (payload) => options.panelSender.sendSaveAlchemyPreset(payload),
    onDeleteAlchemyPreset: (presetId) => options.panelSender.sendDeleteAlchemyPreset(presetId),
    onRequestEnhancement: () => options.panelSender.sendRequestEnhancementPanel(),
    onStartAlchemy: (recipeId, ingredients, quantity, queueMode) => options.panelSender.sendStartAlchemy({ recipeId, ingredients, quantity, queueMode }),
    onStartForging: (recipeId, ingredients, quantity, queueMode) => options.panelSender.sendStartForging({ recipeId, ingredients, quantity, queueMode }),
    onCancelAlchemy: () => options.panelSender.sendCancelAlchemy(),
    onCancelForging: () => options.panelSender.sendCancelForging(),
    onCancelTechniqueActivity: (cancelRef) => options.panelSender.sendCancelTechniqueActivity(cancelRef),
    onStartEnhancement: (payload) => options.panelSender.sendStartEnhancement(payload),
    onCancelEnhancement: () => options.panelSender.sendCancelEnhancement(),
  });

  options.debugPanel.setCallbacks(() => {
    options.showToast(t('startup.toast.returning-spawn'));
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

  options.documentRef.addEventListener('click', (event) => {
    const button = resolveQqGroupButton(event.target);
    if (!button) {
      return;
    }
    event.preventDefault();
    void (async () => {
      const copyPromise = copyTextToClipboard(options.qqGroupNumber);
      const opened = openQqGroupLink(resolveQqGroupLink(options.qqGroupMobileDeepLink, options.qqGroupDesktopDeepLink));
      const copied = await copyPromise;
      window.setTimeout(() => {
        if (document.visibilityState !== 'visible') {
          return;
        }
        options.showToast(
          !opened
            ? `浏览器已拦截唤起 QQ，可手动搜索群号 ${options.qqGroupNumber}`
            : copied
              ? `已尝试唤起 QQ，加群失败时可直接粘贴群号 ${options.qqGroupNumber}`
              : `已尝试唤起 QQ，如未打开请手动搜索群号 ${options.qqGroupNumber}`,
        );
      }, 600);
    })();
  });

  options.registerAutoBattleButtons();
}
