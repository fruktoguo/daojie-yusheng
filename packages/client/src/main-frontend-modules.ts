import { SocketManager } from './network/socket';
import { LoginUI } from './ui/login';
import { HUD } from './ui/hud';
import { ChatUI } from './ui/chat';
import { SidePanel } from './ui/side-panel';
import { DebugPanel } from './ui/debug-panel';
import { AttrPanel } from './ui/panels/attr-panel';
import { InventoryPanel } from './ui/panels/inventory-panel';
import { EquipmentPanel } from './ui/panels/equipment-panel';
import { TechniquePanel } from './ui/panels/technique-panel';
import { BodyTrainingPanel } from './ui/panels/body-training-panel';
import { QuestPanel } from './ui/panels/quest-panel';
import { ActionPanel } from './ui/panels/action-panel';
import { LootPanel } from './ui/panels/loot-panel';
import { SettingsPanel } from './ui/panels/settings-panel';
import { WorldPanel } from './ui/panels/world-panel';
import { NpcShopModal } from './ui/npc-shop-modal';
import { NpcQuestModal } from './ui/npc-quest-modal';
import { EntityDetailModal } from './ui/entity-detail-modal';
import { CraftWorkbenchModal } from './ui/craft-workbench-modal';
import { createClientPanelSystem } from './ui/panel-system/bootstrap';
import { createMapRuntime } from './game-map/runtime/map-runtime';
import { initializeMapPerformanceConfig } from './ui/performance-config';
/**
 * createMainFrontendModules：构建并返回目标对象。
 * @param windowRef Window 参数说明。
 * @returns 无返回值，直接更新MainFrontend模块相关状态。
 */


export function createMainFrontendModules(windowRef: Window) {
  const socket = new SocketManager();

  return {
    socket,
    runtimeSender: socket.runtime,
    panelSender: socket.panel,
    socialEconomySender: socket.socialEconomy,
    adminSender: socket.admin,
    mapRuntime: createMapRuntime(),
    loginUI: new LoginUI(socket),
    hud: new HUD(),
    chatUI: new ChatUI(),
    debugPanel: new DebugPanel(),
    sidePanel: new SidePanel(),
    attrPanel: new AttrPanel(),
    inventoryPanel: new InventoryPanel(),
    equipmentPanel: new EquipmentPanel(),
    techniquePanel: new TechniquePanel(),
    bodyTrainingPanel: new BodyTrainingPanel(),
    questPanel: new QuestPanel(),
    actionPanel: new ActionPanel(),
    lootPanel: new LootPanel(),
    worldPanel: new WorldPanel(),
    settingsPanel: new SettingsPanel(),
    npcShopModal: new NpcShopModal(),
    npcQuestModal: new NpcQuestModal(),
    entityDetailModal: new EntityDetailModal(),
    craftWorkbenchModal: new CraftWorkbenchModal(),
    panelSystem: createClientPanelSystem(windowRef),
    initialMapPerformanceConfig: initializeMapPerformanceConfig(),
  };
}
/**
 * MainFrontendModules：统一结构类型，保证协议与运行时一致性。
 */


export type MainFrontendModules = ReturnType<typeof createMainFrontendModules>;
