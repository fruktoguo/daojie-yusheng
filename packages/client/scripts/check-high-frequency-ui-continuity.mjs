/**
 * 高频 UI 连续性静态门禁。
 *
 * 这里锁定从每息/资产/面板同步入口到稳定 DOM patch 的关键接缝，防止后续把局部更新
 * 悄悄改回整面板或整弹层重建。运行期视觉与触控仍由浏览器验收覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function section(content, startMarker, endMarker, label) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, `高频 UI 门禁找不到 ${label} 起点：${startMarker}`);
  assert(end > start, `高频 UI 门禁找不到 ${label} 终点：${endMarker}`);
  return content.slice(start, end);
}

function assertIncludes(content, pattern, message) {
  assert(pattern.test(content), message);
}

function assertMissing(content, pattern, message) {
  assert(!pattern.test(content), message);
}

const marketPanel = read('src/ui/panels/market-panel.ts');
const auctionView = read('src/ui/panels/market-auction-view.ts');
const transmissionView = read('src/ui/panels/market-transmission-view.ts');
const actionPanel = read('src/ui/panels/action-panel.ts');
const actionCombatSettings = read('src/ui/panels/action-panel-combat-settings.ts');
const actionSectManagement = read('src/ui/panels/action-panel-sect-management.ts');
const actionSkillManagement = read('src/ui/panels/action-panel-skill-management.ts');
const techniquePanel = read('src/ui/panels/technique-panel.ts');
const inventoryPanel = read('src/ui/panels/inventory-panel.ts');
const bodyTrainingPanel = read('src/ui/panels/body-training-panel.ts');
const craftWorkbench = read('src/ui/craft-workbench-modal.ts');
const craftEnhancementView = read('src/ui/craft-enhancement-view.ts');
const craftTransmissionView = read('src/ui/craft-transmission-view.ts');
const npcShop = read('src/ui/npc-shop-modal.ts');
const npcQuest = read('src/ui/npc-quest-modal.ts');
const socialPanel = read('src/ui/panels/social-panel.ts');
const panelsCss = read('src/styles/panels.css');

const marketUpdate = section(
  marketPanel,
  'updateMarket(data: S2C_MarketUpdate): void {',
  '/** 更新列表分页数据。 */',
  'MarketPanel.updateMarket',
);
assertMissing(
  marketUpdate,
  /requestTransmissionListings\(/,
  'MarketUpdate 不得触发传法台详情重查；普通坊市变化会形成高频全量刷新回路',
);

const marketListingsUpdate = section(
  marketPanel,
  'updateListings(data: S2C_MarketListings): void {',
  '/** 更新传法台分页数据。 */',
  'MarketPanel.updateListings',
);
assertIncludes(marketListingsUpdate, /isPlainEqual\(this\.marketListingsSnapshot, data\)/, '普通坊市重复分页包必须零 DOM 写入');
assertIncludes(marketListingsUpdate, /clonePlainValue\(data\)/, '普通坊市必须使用独立语义快照');

const transmissionUpdate = section(
  marketPanel,
  'updateTransmissionListings(data: S2C_TransmissionListings): void {',
  'updateAuctionListings(data: S2C_AuctionListings): void {',
  'MarketPanel.updateTransmissionListings',
);
assertIncludes(transmissionUpdate, /isPlainEqual\(this\.transmissionListingsSnapshot, data\)/, '传法台回包必须先做独立语义比较');
assertIncludes(transmissionUpdate, /clonePlainValue\(data\)/, '传法台必须保存独立快照，不能依赖可原地修改的对象引用');
assertIncludes(transmissionUpdate, /if \(!listingsChanged\) return;/, '传法台重复分页包必须零 DOM 写入');
assertIncludes(transmissionUpdate, /patchTransmissionListingsState\(\)/, '传法台真实变化必须走稳定壳体局部 patch');
assertMissing(transmissionUpdate, /detailModalHost\.(?:open|patch)\(/, '传法台回包入口不得直接重建弹层宿主');

const auctionListingsUpdate = section(
  marketPanel,
  'updateAuctionListings(data: S2C_AuctionListings): void {',
  '/** 更新我的订单数据。 */',
  'MarketPanel.updateAuctionListings',
);
assertIncludes(auctionListingsUpdate, /isPlainEqual\(this\.auctionListingsSnapshot, data\)/, '拍卖行重复行情包必须零 DOM 写入');
assertIncludes(auctionListingsUpdate, /clonePlainValue\(data\)/, '拍卖行必须使用独立语义快照');
assertIncludes(marketPanel, /this\.marketListingsSnapshot = null;/, '普通坊市语义快照必须随会话清理');
assertIncludes(marketPanel, /this\.auctionListingsSnapshot = null;/, '拍卖行语义快照必须随会话清理');
assertIncludes(marketPanel, /this\.transmissionListingsSnapshot = null;/, '传法台语义快照必须随会话清理');

const auctionConsignProjectionSync = section(
  auctionView,
  'patchAuctionConsignModalState(): void {',
  '  patchAuctionConsignItems(',
  'MarketAuctionView.patchAuctionConsignModalState',
);
assertIncludes(auctionConsignProjectionSync, /nextSignature === this\.auctionConsignProjectionSignature/, '发起拍卖重复背包与灵石投影必须零 DOM 写入');
assertIncludes(auctionConsignProjectionSync, /patchAuctionConsignItems\(allItems\)/, '发起拍卖真实背包变化必须进入局部列表 patch');
assertMissing(auctionConsignProjectionSync, /replaceElementHtml\(/, '发起拍卖每息同步入口不得替换任何 DOM 子树');

const auctionConsignListPatch = section(
  auctionView,
  '  private patchAuctionConsignItemList(',
  '  private patchAuctionConsignItem(',
  'MarketAuctionView.patchAuctionConsignItemList',
);
assertIncludes(auctionConsignListPatch, /new Map<string, HTMLButtonElement>\(\)/, '发起拍卖物品列表必须按 itemInstanceId 复用节点');
assertIncludes(auctionConsignListPatch, /syncAuctionConsignListChildren\(list, ordered\)/, '发起拍卖筛选与背包变化只能重排稳定节点');
assertMissing(auctionConsignListPatch, /renderAuctionConsignItems\(/, '发起拍卖非空列表不得整容器重建');
assertIncludes(auctionView, /data-ui-key="auction-consign:/, '发起拍卖物品节点必须声明稳定 UI key');

const auctionQuantityPatch = section(
  auctionView,
  'patchAuctionConsignQuantityControl(): void {',
  '  patchAuctionConsignPriceControl(): void {',
  'MarketAuctionView.patchAuctionConsignQuantityControl',
);
assertIncludes(auctionQuantityPatch, /document\.activeElement !== input/, '发起拍卖数量输入聚焦时不得被同步值覆盖');
assertIncludes(auctionQuantityPatch, /input\.max = String\(quantityMax\)/, '发起拍卖数量上限必须原位同步');

const auctionDetail = section(
  auctionView,
  'renderAuctionDetailPanel(lot: AuctionLotView | null, update: S2C_MarketUpdate, tab: AuctionHouseTab): string {',
  '  renderAuctionBidHistory(',
  'MarketAuctionView.renderAuctionDetailPanel',
);
assertMissing(auctionDetail, /findConflictingOwnOrder\(/, '拍卖竞拍资格不得读取普通坊市反向挂单冲突');

const tradeHistoryUpdate = section(
  marketPanel,
  'updateTradeHistory(data: S2C_MarketTradeHistory): void {',
  '/** 清空市场面板状态、缓存和临时弹窗。 */',
  'MarketPanel.updateTradeHistory',
);
assertIncludes(tradeHistoryUpdate, /data\.source,\s*data\.scope,/s, '成交记录迟到回包校验必须包含全服/我的范围');

const marketClear = section(
  marketPanel,
  'clear(): void {',
  '/** 确保坊市唯一的 React 首屏已挂载；重复调用不会重建根节点。 */',
  'MarketPanel.clear',
);
assertIncludes(marketClear, /this\.transmissionView\.clear\(\)/, '会话清理必须关闭传法台并取消其异步生命周期');

const transmissionPatch = section(
  transmissionView,
  'patchTransmissionListingsState(): void {',
  '/** 玩家上下文或钱包变化只更新主界面的资产节点，不触碰上架选择器。 */',
  'MarketTransmissionView.patchTransmissionListingsState',
);
assertIncludes(
  transmissionPatch,
  /if \(!shell\) \{\s*detailModalHost\.patch\(this\.buildTransmissionModalOptions\(\)\);\s*return;\s*\}/s,
  '传法台只有加载态首次建立稳定壳体时才允许替换 body',
);
assertIncludes(transmissionPatch, /patchTransmissionList\(/, '传法台分页必须按列表局部更新');
assertIncludes(transmissionPatch, /patchTransmissionDetail\(/, '传法台详情必须与列表分开更新');
assertIncludes(transmissionView, /new Map<string, HTMLButtonElement>\(\)/, '传法台列表必须按 itemKey 复用行节点');
assertIncludes(transmissionView, /data-transmission-shell/, '传法台必须保留稳定弹层壳体标记');

const transmissionPreload = section(
  transmissionView,
  'private preloadTechniqueTemplates(): void {',
  'private getTransmissionRequestKey(): string {',
  'MarketTransmissionView.preloadTechniqueTemplates',
);
assertIncludes(transmissionPreload, /patchTransmissionListingsState\(\)/, '异步功法模板回包必须走局部 patch');
assertIncludes(transmissionPreload, /patchTransmissionConsignInventoryState\(\)/, '异步功法模板回包必须局部更新上架残卷投影');
assertMissing(transmissionPreload, /detailModalHost\.(?:open|patch)\(/, '异步模板回包不得重建传法台弹层');

const transmissionClear = section(
  transmissionView,
  'clear(): void {',
  'openTransmissionModal(',
  'MarketTransmissionView.clear',
);
assertIncludes(transmissionClear, /releaseTransientState\(\)/, '传法台会话清理必须释放防抖与内联监听状态');
assertIncludes(transmissionClear, /detailModalHost\.close\(TRANSMISSION_MODAL_OWNER\)/, '传法台会话清理必须关闭仍显示旧玩家数据的弹层');

const transmissionSubmit = section(
  transmissionView,
  'private submitTransmissionConsign(): void {',
  '  private patchTransmissionConsignItems(',
  'MarketTransmissionView.submitTransmissionConsign',
);
assertMissing(transmissionSubmit, /requestTransmissionListings\(/, '传法台上架提交后不得抢跑拉取旧分页');
assertMissing(transmissionSubmit, /transmissionTab\s*=/, '传法台上架提交后不得强制切换标签打断浏览上下文');

const consignProjectionSync = section(
  transmissionView,
  'patchTransmissionConsignInventoryState(): void {',
  '  private buildTransmissionModalOptions()',
  'MarketTransmissionView.patchTransmissionConsignInventoryState',
);
assertIncludes(consignProjectionSync, /nextSignature === this\.transmissionConsignProjectionSignature/, '上架残卷重复背包投影必须零 DOM 写入');
assertIncludes(consignProjectionSync, /patchTransmissionConsignItems\(allItems\)/, '上架残卷真实变化必须进入局部列表 patch');

const consignListPatch = section(
  transmissionView,
  '  private patchTransmissionConsignItemList(',
  '  private patchTransmissionConsignItem(',
  'MarketTransmissionView.patchTransmissionConsignItemList',
);
assertIncludes(consignListPatch, /new Map<string, HTMLButtonElement>\(\)/, '上架残卷列表必须按 itemInstanceId 复用卡片节点');
assertIncludes(consignListPatch, /syncTransmissionListChildren\(list, ordered\)/, '上架残卷排序和筛选只能重排稳定节点');
assertMissing(consignListPatch, /renderTransmissionConsignItems\(/, '上架残卷非空列表不得整容器重建');

const consignFieldsPatch = section(
  transmissionView,
  '  private patchTransmissionConsignFields(',
  '  private captureTransmissionConsignProjectionSignature()',
  'MarketTransmissionView.patchTransmissionConsignFields',
);
assertIncludes(consignFieldsPatch, /data-transmission-consign-price-display/, '上架价格必须原位更新现有显示节点');
assertMissing(consignFieldsPatch, /replaceElementHtml\(/, '上架选中项与价格变化不得替换字段子树');
assertIncludes(transmissionView, /data-ui-key="transmission-consign:/, '上架残卷卡片必须声明稳定 UI key');

const playerContextSync = section(
  marketPanel,
  'syncPlayerContext(player?: PlayerState): void {',
  '/** 同步背包快照，并刷新依赖弹窗。 */',
  'MarketPanel.syncPlayerContext',
);
assertMissing(playerContextSync, /patchTransmissionConsignInventoryState\(\)/, '每息玩家上下文不得触碰上架残卷选择器');

const inventorySync = section(
  marketPanel,
  'syncInventory(inventory: Inventory): void {',
  '/** 更新市场主视图。 */',
  'MarketPanel.syncInventory',
);
assertIncludes(inventorySync, /MarketTransmissionView\.modalOwner/, '背包同步必须识别打开中的传法台');
assertIncludes(inventorySync, /patchTransmissionInventoryState\(\)/, '背包同步必须局部更新传法台钱包');
assertIncludes(inventorySync, /patchTransmissionConsignInventoryState\(\)/, '背包同步必须通过语义门控局部更新上架选择器');

const tradeHistoryRequest = section(
  marketPanel,
  'private requestTradeHistory(',
  '/** 向外部请求当前筛选条件下的列表分页。 */',
  'MarketPanel.requestTradeHistory',
);
assertIncludes(tradeHistoryRequest, /requestSource, requestScope, this\.tradeHistoryPage/, '成交记录请求标识必须包含 source、scope 与 page');

const actionDynamic = section(actionPanel, '/** 只同步会变的动作状态，优先走局部 patch，避免整块重绘。 */', '/** 从玩家快照初始化面板状态。 */', 'ActionPanel.syncDynamic');
assertIncludes(actionDynamic, /buildActionPanelContentKey/, '行动面板高频同步必须保留结构签名');
assertIncludes(actionDynamic, /patchDynamicActionPanel/, '行动面板高频同步必须优先局部 patch');
assertIncludes(actionPanel, /this\.combatSettings\.renderCombatSettingsModalIfOpen\(\)/, '行动面板必须把战斗设置更新委托给唯一子面板');
assertIncludes(actionPanel, /this\.sectMgmt\.renderSectManagementModalIfOpen\(\)/, '行动面板必须把宗门管理更新委托给唯一子面板');
assertIncludes(actionCombatSettings, /export class CombatSettingsSubpanel/, '战斗设置子面板必须保留独立状态与渲染拥有者');
assertIncludes(actionSectManagement, /export class SectManagementSubpanel/, '宗门管理子面板必须保留独立状态与渲染拥有者');
assertMissing(actionPanel, /private renderCombatSettingsModal\(/, '主行动面板不得重新吸收战斗设置模板');
assertMissing(actionPanel, /private renderSectManagementModal\(/, '主行动面板不得重新吸收宗门管理模板');
assertMissing(actionPanel, /private cloneAutoUsePillConfigs\(/, '主行动面板不得保留自动丹药旧实现代码岛');
assertMissing(actionPanel, /function parseSectManagementData\(/, '主行动面板不得复制宗门数据解析职责');
assertIncludes(actionPanel, /this\.skillMgmt\.renderSkillManagementModalIfOpen\(\)/, '行动面板必须把技能管理刷新委托给唯一子面板');
assertIncludes(actionPanel, /this\.skillMgmt\.renderSkillPresetModalIfOpen\(\)/, '行动面板必须把技能预设刷新委托给唯一子面板');
assertIncludes(actionSkillManagement, /ownerId: this\.p\.SKILL_MANAGEMENT_MODAL_OWNER/, '技能管理子面板必须直接拥有管理弹层模板');
assertIncludes(actionSkillManagement, /ownerId: this\.p\.SKILL_PRESET_MODAL_OWNER/, '技能管理子面板必须直接拥有预设弹层模板');
assertIncludes(actionSkillManagement, /private applySkillManagementDraftMutation\(/, '技能管理草稿变更必须由子面板唯一编排');
assertIncludes(actionSkillManagement, /onRequestClose: \(\) => this\.confirmDiscardSkillManagementChanges\(\)/, '技能管理子面板关闭前必须保留未应用草稿确认');
assertIncludes(actionSkillManagement, /this\.p\.bindTooltips\(body, signal\)/, '技能管理重绘后必须恢复技能提示绑定');
assertIncludes(actionSkillManagement, /\[data-skill-preset-import\]/, '技能预设子面板必须保留导入事件入口');
assertMissing(actionSkillManagement, /_renderSkill|_bindSkill|as unknown as \{ _/, '技能子面板不得反向调用主类私有模板或事件绑定');
assertMissing(actionPanel, /private _(?:render|bind)Skill/, '主行动面板不得重新吸收技能弹层模板和事件绑定');
assertMissing(actionPanel, /private (?:applySkillManagementDraftMutation|renderSkillManagementItem|saveCurrentSkillPreset|parseSkillPresetCollection)\(/, '主行动面板不得重新吸收技能管理或预设实现');

const techniqueDynamic = section(techniquePanel, '/** 仅同步经验、进度条与主修状态，避免高频整块重绘 */', '/** initFromPlayer：初始化From玩家。 */', 'TechniquePanel.syncDynamic');
assertIncludes(techniqueDynamic, /patchList\(\)/, '功法面板高频同步必须优先 patch 列表');
assertIncludes(techniqueDynamic, /patchModal\(\)/, '功法面板高频同步必须优先 patch 弹层');

const inventoryContext = section(inventoryPanel, 'syncPlayerContext(', '/** buildPlayerContextKey：构建背包展示依赖的玩家上下文签名。 */', 'InventoryPanel.syncPlayerContext');
assertIncludes(inventoryContext, /buildPlayerContextKey/, '背包玩家上下文同步必须使用语义签名');
assertIncludes(inventoryContext, /lastPlayerContextKey === nextContextKey/, '背包无变化时必须零 DOM 写入');

const bodyTrainingDynamic = section(bodyTrainingPanel, '/** syncDynamic：同步Dynamic。 */', 'private useReactPanel(): boolean {', 'BodyTrainingPanel.syncDynamic');
assertIncludes(bodyTrainingDynamic, /patchOrRender\(\)/, '炼体高频同步必须优先走结构感知 patch');

const craftPatch = section(craftWorkbench, 'private patchOpenCraftShell(): void {', 'private patchOpenCraftQueueOnly(): void {', 'CraftWorkbenchModal.patchOpenCraftShell');
assertIncludes(craftPatch, /tryPatchAlchemyBody/, '炼制弹层同步必须保留局部炼丹 patch');
assertIncludes(craftPatch, /tryPatchEnhancementBody/, '炼制弹层同步必须保留局部强化 patch');
assertIncludes(craftPatch, /transmissionView\.tryPatchTransmissionBody/, '炼制弹层同步必须委托传功子视图局部 patch');
assertIncludes(craftPatch, /transmissionView\.tryPatchTechniqueRefiningBody/, '功法精炼同步必须委托传功子视图局部 patch');
assertIncludes(craftWorkbench, /this\.enhancementView\.mergeServerEnhancementSessionRecord\(/, '强化历史增量必须由强化子视图唯一合并');
assertIncludes(craftWorkbench, /this\.enhancementView\.closeTransientUi\(\)/, '工坊关闭时必须释放强化子视图的弹层和提示');
assertIncludes(craftWorkbench, /confirmModalHost\.close\(CraftWorkbenchModal\.ALCHEMY_MATERIAL_PICKER_OWNER\)/, '工坊关闭时必须释放炼制材料选择弹层');
assertMissing(craftWorkbench, /private (?:renderEnhancementActiveJob|ensureLocalEnhancementHistoryLoaded|openEnhancementPickerModal|bindEnhancementFormulaTooltip)\(/, '工坊主类不得重新吸收强化模板、历史或提示生命周期');
assertMissing(craftWorkbench, /private readonly enhancementFormulaTooltip/, '工坊主类不得保留强化子视图已接管的废弃提示实例');
assertIncludes(craftEnhancementView, /renderEnhancementActiveJob\(activeJob, selected\)/, '强化子视图必须保留专用运行态详情，不能退化为仅显示公共队列');
assertIncludes(craftEnhancementView, /closeTransientUi\(\): void \{/, '强化子视图必须提供统一临时 UI 释放入口');
assertIncludes(craftEnhancementView, /\[data-craft-action="enhancement-refresh"\]/, '强化刷新入口必须由强化子视图绑定');
assertIncludes(craftWorkbench, /this\.transmissionView\.closeTransientUi\(\)/, '工坊关闭时必须释放传功子视图确认弹层');
assertMissing(craftWorkbench, /private (?:renderTransmissionBody|renderTechniqueRefiningBody|bindTransmissionEvents|buildTransmissionRenderKey)\(/, '工坊主类不得重新吸收传功或功法精炼模板与事件');
assertIncludes(craftTransmissionView, /tech\.name \?\? ''[\s\S]*?tech\.grade \?\? ''[\s\S]*?tech\.category \?\? ''[\s\S]*?tech\.realmLv \?\? ''/, '传功结构 key 必须覆盖功法显示与成本语义');
assertIncludes(craftTransmissionView, /target\.playerId}:\$\{target\.name}/, '传功结构 key 必须覆盖附近玩家名称变化');
assertIncludes(craftTransmissionView, /body\.addEventListener\('focusout'[\s\S]*?this\.parent\.patchOpenCraftShell\(\)/, '传功输入结束聚焦后必须补做被延迟的结构 patch');
assertIncludes(craftTransmissionView, /private buildTechniqueBookCraftPickerKey\(\)[\s\S]*?tech\.realmLv \?\? ''/, '功法抄录结构 key 必须覆盖影响残页成本的境界');

const floatingQueueRefresh = section(
  craftWorkbench,
  'private refreshQueueFloatingPanel(): void {',
  'private ensureQueueFloatingPanel(): FloatingListPanel {',
  'CraftWorkbenchModal.refreshQueueFloatingPanel',
);
assertIncludes(floatingQueueRefresh, /patchFloatingQueueProgress\(panel\.body, queue\)/, '悬浮行动队列每息进度必须原位 patch');
assertIncludes(floatingQueueRefresh, /bindQueueFloatingEvents\(panel\)/, '悬浮行动队列必须复用委托事件，内容更新后不能逐按钮重绑');

const floatingQueueStructureKey = section(
  craftWorkbench,
  'private buildFloatingQueueStructureKey(',
  'private renderFloatingQueueList(',
  'CraftWorkbenchModal.buildFloatingQueueStructureKey',
);
assertMissing(floatingQueueStructureKey, /entry\.progress/, '悬浮行动队列结构 key 不得混入每息进度导致整列表重建');

const floatingQueueProgressPatch = section(
  craftWorkbench,
  'private patchFloatingQueueProgress(',
  'private bindQueueFloatingEvents(',
  'CraftWorkbenchModal.patchFloatingQueueProgress',
);
assertIncludes(floatingQueueProgressPatch, /\[data-floating-job-id\]/, '悬浮行动队列必须按稳定任务 ID 定位进度节点');
assertIncludes(floatingQueueProgressPatch, /progressLabel\.textContent !== progress\.label/, '悬浮行动队列相同进度文本必须零 DOM 写入');
assertIncludes(floatingQueueProgressPatch, /fill\.style\.width !== fillWidth/, '悬浮行动队列相同进度条宽度必须零 DOM 写入');
assertIncludes(craftWorkbench, /data-floating-queue-action="move_to_top"/, '悬浮行动队列每项必须提供置顶按钮');
assertIncludes(craftWorkbench, /data-floating-queue-action="move_down"/, '悬浮行动队列每项必须提供下移按钮');
assertIncludes(craftWorkbench, /data-floating-queue-action="remove"/, '悬浮行动队列每项必须提供移除按钮');
assertIncludes(craftWorkbench, /onReorderTechniqueActivityQueue\(queueId, action\)/, '悬浮行动队列排序只能提交服务端权威意图');
assertIncludes(panelsCss, /\.floating-job-actions\s*\{/, '悬浮行动队列快捷按钮必须有稳定三列布局');
assertIncludes(panelsCss, /:root\[data-color-mode="dark"\] \.floating-job-action\s*\{/, '悬浮行动队列快捷按钮必须覆盖深色模式');
assertIncludes(panelsCss, /@media \(max-width: 760px\)[\s\S]*?\.floating-job-action\s*\{[\s\S]*?min-height: 34px;/, '悬浮行动队列快捷按钮必须保留手机触控高度');

const npcShopRender = section(npcShop, 'private render(): void {', '/** renderBody：渲染身体。 */', 'NpcShopModal.render');
assertIncludes(npcShopRender, /this\.patchBody\(body, meta\)/, 'NPC 商店已打开时必须先复用稳定壳体');
const npcShopPlayerSync = section(npcShop, 'syncPlayerContext(player?: PlayerState): void {', '/** syncInventory：同步背包。 */', 'NpcShopModal.syncPlayerContext');
assertIncludes(npcShopPlayerSync, /buildPlayerDisplaySignature/, 'NPC 商店每息玩家上下文必须先比较显示语义');
assertIncludes(npcShopPlayerSync, /patchOpenShopLiveState\(\)/, 'NPC 商店玩家上下文只能局部 patch');
assertMissing(npcShopPlayerSync, /this\.render\(\)/, 'NPC 商店玩家上下文不得重建弹层');
const npcShopInventorySync = section(npcShop, 'syncInventory(inventory: Inventory): void {', '/** open：打开open。 */', 'NpcShopModal.syncInventory');
assertIncludes(npcShopInventorySync, /patchOpenShopLiveState\(\)/, 'NPC 商店背包同步只能局部 patch');
assertMissing(npcShopInventorySync, /this\.render\(\)/, 'NPC 商店背包同步不得重建弹层');
assertIncludes(npcShop, /buildDetailStaticRevision/, 'NPC 商店详情必须用静态 revision 保留数量输入节点');
assertIncludes(npcShop, /patchDetailLiveState/, 'NPC 商店钱包、库存和购买状态必须原位更新');
const npcQuestRender = section(npcQuest, 'private render(): void {', '/** buildModalMeta：构建弹窗元数据。 */', 'NpcQuestModal.render');
assertIncludes(npcQuestRender, /this\.patchBody\(body, meta\)/, 'NPC 任务已打开时必须先复用稳定壳体');
const npcQuestInventorySync = section(npcQuest, 'syncInventory(inventory: Inventory): void {', '/** openPending：打开待处理。 */', 'NpcQuestModal.syncInventory');
assertIncludes(npcQuestInventorySync, /patchInventoryDependentDetail\(\)/, 'NPC 任务背包同步只能更新进度相关子节点');
assertMissing(npcQuestInventorySync, /this\.render\(\)/, 'NPC 任务背包同步不得重建弹层');
assertIncludes(npcQuest, /isPlainEqual\(this\.renderedDetailQuestSnapshot, selected\)/, 'NPC 任务重复详情回包必须零 DOM 写入');
assertIncludes(npcQuest, /clonePlainValue\(selected\)/, 'NPC 任务详情必须保存独立语义快照');
assertIncludes(npcQuest, /nextSignature === this\.renderedInventoryDetailSignature/, 'NPC 任务无关背包变化必须零 DOM 写入');

const socialSelect = section(
  socialPanel,
  'private openConversation(playerId: string): void {',
  'private replaceActiveTabContent(',
  'SocialPanel.openConversation',
);
assertIncludes(socialSelect, /patchSelectedRelation\(playerId\)/, '切换道友必须原位更新列表选中态');
assertIncludes(socialSelect, /replaceConversationSection\(playerId, inputSnapshot\)/, '切换道友只能替换私聊区域');
assertMissing(socialSelect, /this\.render\(/, '切换道友不得重建私聊联系人和其他子 Tab');

const socialSwitchTab = section(
  socialPanel,
  'private switchActiveTab(tab: SocialPanelTab): void {',
  'private openConversation(playerId: string): void {',
  'SocialPanel.switchActiveTab',
);
assertIncludes(socialSwitchTab, /replaceActiveTabContent\(inputSnapshot\)/, '道友子 Tab 切换只能替换当前内容区');
assertMissing(socialSwitchTab, /this\.render\(/, '道友子 Tab 切换不得重建面板标题和四个 Tab');

const socialAppendMessage = section(
  socialPanel,
  'appendMessage(message: DaoistDirectMessageView, currentPlayerId: string | null): void {',
  'clear(): void {',
  'SocialPanel.appendMessage',
);
assertIncludes(socialAppendMessage, /patchCurrentConversation\(/, '新私聊消息必须优先追加稳定消息节点');
assertIncludes(socialAppendMessage, /message\.toPlayerId === currentPlayerId/, '私聊未读只能统计对方发来的消息');
assertIncludes(socialAppendMessage, /isConversationVisible\(peerId\)/, '私聊未读必须区分当前对话是否真实可见');
assertIncludes(socialAppendMessage, /patchUnreadIndicators\(peerId\)/, '新私聊必须局部更新 Tab 与道友未读角标');
assertIncludes(socialPanel, /panel-section-head social-panel-head/, '道友面板标题必须复用现有面板头原语');
assertIncludes(socialPanel, /data-social-tab-content="true"/, '道友面板必须保留单一活动子 Tab 内容宿主');
assertIncludes(socialPanel, /data-social-tab-unread="true"/, '私聊子 Tab 必须提供未读角标节点');
assertMissing(socialPanel, /panel-section-header/, '道友面板不得继续使用不存在的 panel-section-header 类');
assertIncludes(panelsCss, /\.social-panel \.ui-list-row\s*\{/, '道友列表行必须有明确布局样式');
assertIncludes(panelsCss, /\.social-panel-tabs\s*\{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/, '道友面板顶部必须保持四列子 Tab');
assertIncludes(panelsCss, /\.social-conversation-workspace\s*\{/, '私聊联系人与对话必须有稳定工作区布局');
assertIncludes(panelsCss, /\.social-panel-tab-unread\[hidden\]/, '私聊无未读时必须隐藏角标');
assertIncludes(panelsCss, /@container social-panel \(max-width: 560px\)/, '道友面板必须保留窄容器响应式布局');

const vaultPlayerSync = section(
  socialPanel,
  'setCurrentPlayer(playerId: string | null, inventoryItems: SyncedItemStack[]): void {',
  'setPreferredTab(tab: TreasureVaultModalTab): void {',
  'TreasureVaultModal.setCurrentPlayer',
);
assertIncludes(vaultPlayerSync, /if \(!playerChanged && !inventoryChanged\) return;/, '宝库每息玩家上下文必须用背包语义签名短路');
assertIncludes(
  vaultPlayerSync,
  /else if \(inventoryChanged && this\.detail && !this\.depositPickerOpen\) \{\s*this\.patchVaultDepositState\(\);\s*\}/s,
  '宝库背包变化只能局部更新存入入口',
);

console.log('high-frequency UI continuity check passed');
