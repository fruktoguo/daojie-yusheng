/**
 * 高频 UI 连续性静态门禁。
 *
 * 这里锁定从每息/资产/面板同步入口到稳定 DOM patch 的关键接缝，防止后续把局部更新
 * 悄悄改回整面板或整弹层重建。运行期视觉与触控仍由浏览器验收覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPanelsCss } from './read-panels-css.mjs';

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
const buildingStateSource = read('src/main-building-fengshui-state-source.ts');
const timeChamberStateSource = read('src/main-time-chamber-state-source.ts');
const timeChamberManagement = read('src/ui/time-chamber-console-modal.ts');
const timeChamberUsage = read('src/ui/time-chamber-usage-modal.ts');
const panelsCss = readPanelsCss(clientRoot);

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
assertIncludes(craftPatch, /getCurrentModalDefinition\(this\.activeMode === 'technique_refining'\)/, '高频工坊同步仅允许为需要结构回退的功法精炼预构造 HTML');
assertIncludes(craftPatch, /tryPatchAlchemyBody/, '炼制弹层同步必须保留局部炼丹 patch');
assertIncludes(craftPatch, /tryPatchEnhancementBody/, '炼制弹层同步必须保留局部强化 patch');
assertIncludes(craftPatch, /transmissionView\.tryPatchTransmissionBody/, '炼制弹层同步必须委托传功子视图局部 patch');
assertIncludes(craftPatch, /transmissionView\.tryPatchTechniqueRefiningBody/, '功法精炼同步必须委托传功子视图局部 patch');
assertIncludes(craftPatch, /syncReactShell\(definition, false\)/, '高频工坊同步不得让 React 壳体替换传功内容');
assertMissing(craftPatch, /syncReactShell\(definition, this\.activeMode === 'transmission'\)/, '传功高频同步不得绕过子视图的局部 patch 与焦点保护');
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
assertIncludes(craftTransmissionView, /panel\.dataset\.transmissionRenderKey !== nextKey/, '传功结构比较必须以实际挂载 DOM 的版本为真源');
assertIncludes(craftTransmissionView, /data-transmission-render-key="\$\{escapeHtmlAttr\(renderKey\)\}"/, '传功根节点必须记录实际挂载的结构版本');
assertIncludes(craftTransmissionView, /\[\.\.\.targets\]\.sort/, '传功目标必须稳定排序，避免 AOI 更新顺序触发无意义重建');
assertIncludes(craftTransmissionView, /body\.addEventListener\('focusout'[\s\S]*?this\.parent\.patchOpenCraftShell\(\)/, '传功输入结束聚焦后必须补做被延迟的结构 patch');
assertIncludes(craftTransmissionView, /private buildTechniqueBookCraftPickerKey\(\)[\s\S]*?tech\.realmLv \?\? ''/, '功法抄录结构 key 必须覆盖影响残页成本的境界');

const craftTransmissionRenderKey = section(
  craftTransmissionView,
  '  buildTransmissionRenderKey(): string {',
  '  tryPatchTransmissionBody(body: HTMLElement): boolean {',
  'CraftTransmissionView.buildTransmissionRenderKey',
);
assertMissing(craftTransmissionRenderKey, /entry\.progress\b|progressGainPerTick|estimatedRemainingTicks|progressBreakdown/, '传功结构 key 不得混入每息进度字段');

const craftTransmissionProgressPatch = section(
  craftTransmissionView,
  '  private patchTransmissionProgress(content: HTMLElement): void {',
  '  private shouldDeferTransmissionContentPatch(content: HTMLElement): boolean {',
  'CraftTransmissionView.patchTransmissionProgress',
);
assertIncludes(craftTransmissionProgressPatch, /pendingTextNode\.textContent !== progressText/, '传功进度文本无变化时必须零写入');
assertIncludes(craftTransmissionProgressPatch, /pendingFactorNode\.textContent !== factorText/, '传功速率构成无变化时必须零写入');
assertIncludes(craftTransmissionProgressPatch, /pendingFillNode\.style\.width !== progressWidth/, '传功进度条无变化时必须零写入');
assertMissing(craftTransmissionProgressPatch, /replaceElementHtml|replaceChildren|innerHTML/, '传功每息进度 patch 不得替换任何子树');

const transmissionStatusHandler = section(
  craftTransmissionView,
  '  handleTransmissionStatuses(',
  '  resetTechniqueRefiningSelection(): void {',
  'CraftTransmissionView.handleTransmissionStatuses',
);
assertIncludes(transmissionStatusHandler, /data\.requestId !== activeRequest\.requestId/, '传功状态迟到回包必须按 requestId 丢弃');
assertIncludes(transmissionStatusHandler, /data\.targetPlayerId !== activeRequest\.targetPlayerId/, '传功状态迟到回包必须按目标玩家丢弃');
assertIncludes(transmissionStatusHandler, /this\.patchTransmissionTechniqueOptions\(body\)/, '传功状态回包必须只局部更新功法选项');
assertMissing(transmissionStatusHandler, /replaceElementHtml|patchOpenCraftShell/, '传功状态回包不得重建传功内容或工坊壳体');

const transmissionStatusRequest = section(
  craftTransmissionView,
  '  private requestTransmissionStatuses(root: ParentNode): void {',
  '  private patchTransmissionTechniqueOptions(root: ParentNode): void {',
  'CraftTransmissionView.requestTransmissionStatuses',
);
assertIncludes(transmissionStatusRequest, /this\.activeTransmissionStatusRequest\?\.signature === signature/, '相同玩家与功法集合的状态请求必须在进行中去重');
assertIncludes(transmissionStatusRequest, /this\.resolvedTransmissionStatusSignature === signature/, '已完成的同语义传功状态不得重复请求');
assertIncludes(transmissionStatusRequest, /request\(\{ requestId, targetPlayerId \}\)/, '传功状态请求只应发送目标玩家，不发送整份玩家状态');
assertIncludes(craftTransmissionView, /data-transmission-target-select="true"[\s\S]*?data-transmission-tech-select="true"/, '传功界面必须先选择玩家再选择功法');
assertIncludes(craftTransmissionView, /matches\('\[data-transmission-target-select="true"\]'\)[\s\S]*?this\.requestTransmissionStatuses\(body\)/, '切换玩家后必须刷新功法已学状态');

const transmissionTechniqueChange = section(
  craftTransmissionView,
  '      if (event.target instanceof HTMLSelectElement && event.target.matches(\'[data-transmission-tech-select="true"]\')) {',
  '      if (event.target instanceof HTMLSelectElement && event.target.matches(\'[data-transmission-target-select="true"]\')) {',
  'CraftTransmissionView transmission technique change',
);
assertMissing(transmissionTechniqueChange, /requestTransmissionStatuses/, '切换功法不得重新查询玩家状态');

const transmissionTargetOption = section(
  craftTransmissionView,
  '  private renderTransmissionTargetOption(',
  '  private renderTransmissionTechniqueOption(',
  'CraftTransmissionView.renderTransmissionTargetOption',
);
assertMissing(transmissionTargetOption, /learned|unlearned|transmissionTechniqueStatus/, '玩家列表不得承载功法已学状态');
assertIncludes(craftTransmissionView, /data-transmission-technique-status="\$\{status\}"/, '功法列表必须直接承载目标玩家的已学状态');

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

const timeChamberOpen = section(
  timeChamberStateSource,
  '  const open = (mode: TimeChamberPanelMode, buildingId: string): void => {',
  '  return {',
  'MainTimeChamberStateSource.open',
);
assertIncludes(timeChamberOpen, /activePanelTarget\?\.mode === mode/, '重复触发同一密室交互不得重新打开加载态');
assertIncludes(timeChamberOpen, /&& isActiveModalOpen\(\)\s*\) \{\s*return;/s, '已打开的同一密室面板必须保持稳定壳体');
assertIncludes(
  timeChamberStateSource,
  /result\.ok && \(result\.operation === 'settings' \|\| result\.operation === 'resize'\)[\s\S]*?showDetail\(result\.managementDetail, acceptedOperation\)/,
  '密室管理状态源必须只在成功操作回包后确认对应草稿',
);

const timeChamberManagementDetail = section(
  timeChamberManagement,
  '  showDetail(detail: TimeChamberManagementDetailView, acceptedOperation: TimeChamberAcceptedOperation = null): void {',
  '  setPending(operation: TimeChamberOperationKind, pending: boolean): void {',
  'TimeChamberConsoleModal.showDetail',
);
assertIncludes(timeChamberManagementDetail, /nextSignature === this\.detailSignature/, '密室管理重复详情回包必须零 DOM 写入');
assertIncludes(timeChamberManagementDetail, /patchDetailFields\(shell, detail, this\.settingsDraft, this\.sizeDraft\)/, '密室管理刷新必须使用本地草稿 patch 稳定控件');
assertMissing(timeChamberManagementDetail, /replaceChildren\(/, '密室管理详情刷新不得替换弹层 body');
assertMissing(timeChamberManagement, /document\.activeElement/, '密室管理不能只保护当前焦点，已编辑但失焦的字段也必须保留');

const timeChamberDraftCapture = section(
  timeChamberManagement,
  '  private captureDraftChange(event: Event): void {',
  '  private reconcileDraft(',
  'TimeChamberConsoleModal.captureDraftChange',
);
assertIncludes(timeChamberDraftCapture, /this\.dirtySettings\.add\(target\.name\)/, '密室管理必须逐字段记录未提交草稿');
assertIncludes(timeChamberDraftCapture, /target\.name === 'capacity'/, '密室最大人数输入必须纳入草稿保护，轮询不得回退原值');
assertIncludes(timeChamberDraftCapture, /target\.name === 'password'/, '密室密码输入必须纳入草稿保护，轮询不得清空');
assertIncludes(timeChamberDraftCapture, /this\.dirtySettings\.add\('password'\)/, '密室密码草稿必须独立记录');
assertIncludes(timeChamberDraftCapture, /this\.sizeDirty = target\.value !== this\.detail\.sizeTier/, '密室空间选择必须独立保留未提交草稿');

const timeChamberDraftReconcile = section(
  timeChamberManagement,
  '  private reconcileDraft(',
  '  private resetDraftState(): void {',
  'TimeChamberConsoleModal.reconcileDraft',
);
assertIncludes(timeChamberDraftReconcile, /acceptedOperation === 'settings'/, '密室配置只能在服务端成功回包后确认草稿');
assertIncludes(timeChamberDraftReconcile, /!this\.dirtySettings\.has\(field\)/, '密室管理轮询只能覆盖未编辑字段');
assertIncludes(timeChamberDraftReconcile, /this\.settingsDraft\.password = ''/, '密室密码草稿只能在配置成功后清空');

const timeChamberUsageDetail = section(
  timeChamberUsage,
  '  showDetail(detail: TimeChamberUsageDetailView): void {',
  '  setPending(pending: boolean): void {',
  'TimeChamberUsageModal.showDetail',
);
assertIncludes(timeChamberUsageDetail, /nextSignature === this\.detailSignature/, '密室开启重复详情回包必须零 DOM 写入');
assertIncludes(timeChamberUsageDetail, /this\.durationHours = clampHours\(this\.durationHours, detail\)/, '密室开启刷新必须保留当前时长草稿');
assertIncludes(timeChamberUsageDetail, /this\.passwordAction && detail\.passwordProtected/, '密室密码弹窗打开时轮询不得替换输入节点');
assertMissing(timeChamberUsageDetail, /replaceChildren\(/, '密室开启详情刷新不得替换弹层 body');
assertIncludes(timeChamberUsage, /if \(!this\.passwordAction\)/, '详情过期时服务端密码拒绝必须能补开密码弹窗');
assertIncludes(timeChamberUsage, /const entryAvailable = detail\.active \|\| !activationRequired;/, '一倍速密室必须由稳定详情节点直接开放进入按钮');
assertIncludes(timeChamberUsage, /element\.hidden = detail\.active \|\| !activationRequired;/, '一倍速密室必须隐藏计时购买控件');

const buildingModeSync = section(
  buildingStateSource,
  '  function syncActiveBuildMode(force = false): void {',
  '  function hideBuildModeToolbar(): void {',
  'MainBuildingFengShuiStateSource.syncActiveBuildMode',
);
assertIncludes(buildingModeSync, /inventoryRevision !== lastMaterialInventoryRevision/, '营造模式必须按背包 revision 识别材料投影变化');
assertIncludes(buildingModeSync, /patchBuildModeMaterialProjection\(toolbarHost, materialSlots, selectedEntry\)/, '背包变化只能局部更新营造材料投影');
assertMissing(buildingModeSync, /`inventory:\$\{/, '营造背包 revision 不得并入整工具栏重建签名');
assertIncludes(buildingStateSource, /candidate:\$\{candidate\.slotIndex\}:\$\{candidate\.itemId\}/, '营造材料卡片必须按槽位和物品 ID 复用节点');

console.log('high-frequency UI continuity check passed');
