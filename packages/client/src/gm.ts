/**
 * GM 管理后台前端 —— 登录鉴权、角色列表/编辑器、机器人管理、建议反馈
 * 当前作为 GM 独立工具入口继续保留，不并入玩家主线 main.ts，也不作为主线硬切的前台阻塞项。
 */

import {
  type BasicOkRes,
  Direction,
  GM_MAIL_TEMPLATE_OPTIONS,
  type GmChangePasswordReq,
  GM_ACCESS_TOKEN_STORAGE_KEY,
  GM_APPLY_DELAY_MS,
  GM_PANEL_POLL_INTERVAL_MS,
  type GmAppendRedeemCodesReq,
  type GmAppendRedeemCodesRes,
  type GmBanManagedPlayerReq,
  type GmAddPlayerCombatExpReq,
  type GmAddPlayerFoundationReq,
  type GmCreateRedeemCodeGroupReq,
  type GmCreateRedeemCodeGroupRes,
  type GmDatabaseBackupRecord,
  type GmPlayerDatabaseTableView,
  type GmDatabaseCleanupReq,
  type GmDatabaseStateRes,
  type GmDatabaseTableStatsRes,
  type GmDatabaseCleanupRes,
  type GmDiagnosticsQueryReq,
  type GmDiagnosticsQueryRes,
  type GmDiagnosticsResultSet,
  type GmUploadDatabaseBackupRes,
  type GmCreateMailReq,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmReplySuggestionReq,
  type GmSetPlayerBodyTrainingLevelReq,
  type GmSuggestionListRes,
  type GmCpuSectionSnapshot,
  type GmHeapSnapshotRes,
  type GmHeapSnapshotSummaryRes,
  type GmManualGcRes,
  type GmMemoryDomainEstimateSnapshot,
  type GmMemoryInstanceEstimateSnapshot,
  type GmV8HeapSpaceSnapshot,
  type GmEditorBuffOption,
  type GmEditorCatalogRes,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmMapListRes,
  type GmMapSummary,
  type GmPlayerUpdateSection,
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  DEFAULT_BASE_ATTRS,
  type AutoBattleSkillConfig,
  type EquipmentSlots,
  type EquipSlot,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  type GmNetworkBucket,
  type GmManagedPlayerSummary,
  type GmPlayerListRes,
  type GmPlayerDetailRes,
  type GmPlayerRiskFactor,
  type GmPlayerRiskLevel,
  type GmLoginReq,
  type GmLoginRes,
  type GmManagedPlayerRecord,
  type GmPlayerAccountStatusFilter,
  type GmPlayerSortMode,
  type GmRemoveBotsReq,
  type GmRestoreDatabaseReq,
  type GmServerLogEntry,
  type GmServerLogsRes,
  type GmShortcutRunRes,
  type GmSpawnBotsReq,
  type GmStateRes,
  type GmWorkerRow,
  type GmWorkerStateRes,
  type GmEnvCheckResult,
  type GmTriggerDatabaseBackupRes,
  type GmUpdateManagedPlayerAccountReq,
  type GmUpdateManagedPlayerPasswordReq,
  type GmUpdateRedeemCodeGroupReq,
  type GmUpdatePlayerReq,
  type GmUpdatePlayerSnapshot,
  type GmWorldInstanceListRes,
  type GmWorldInstanceSummary,
  type ItemStack,
  type MailAttachment,
  MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
  MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
  MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  type PlayerState,
  type QuestState,
  QUEST_LINE_LABELS,
  QUEST_STATUS_LABELS,
  type Suggestion,
  type TechniqueState,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_REALM_LABELS,
  TechniqueRealm,
  type TemporaryBuffState,
  type RedeemCodeCodeView,
  type RedeemCodeGroupRewardItem,
  type RedeemCodeGroupView,
  type GmEnvironmentVarItem,
  type GmEnvironmentVarListRes,
  type GmSetEnvironmentVarReq,
  type GmReloadEnvironmentVarsRes,
  type GmAiProviderConfigDeleteRes,
  type GmAiProviderDeleteModelRes,
  type GmAiProviderFetchModelsRes,
  type GmAiProviderConfigItem,
  type GmAiProviderConfigListRes,
  type GmAiProviderConfigSetReq,
  type GmAiProviderConfigSetRes,
  type GmAiProviderKind,
  type GmAiProviderModelItem,
  type GmAiProviderTestModelRes,
  type GmAiImageProvider,
  type GmAiTextProvider,
  type GameConfigItem,
  type GameConfigListRes,
  type GameConfigSetRes,
  type GameConfigDeleteRes,
  type GmMarketTradeItem,
  type GmMarketTradeListQuery,
  type GmMarketTradeListRes,
} from '@mud/shared';
import {
  GM_FACING_OPTIONS,
  GM_QUEST_LINE_OPTIONS,
  GM_QUEST_OBJECTIVE_TYPE_OPTIONS,
  GM_QUEST_STATUS_OPTIONS,
  GM_TECHNIQUE_REALM_OPTIONS,
} from './constants/world/gm';
import {
  mergeRuntimeFlags,
  groupRuntimeFlags,
  PRESET_FLAGS,
} from './constants/world/gm-runtime-flag-registry';
import { getLocalEditorCatalog } from './content/editor-catalog';
import { resolveTechniqueIdFromBookItemId } from './content/local-templates';
import { GmWorldViewer } from './gm-world-viewer';
import * as gmCatalogHelpers from './gm/helpers/catalog';
import * as gmMarkupHelpers from './gm/helpers/markup';
import * as gmPureHelpers from './gm/helpers/pure';
import { renderGmPlayerListSection } from './gm/helpers/player-list';
import {
  GM_API_BASE_PATH,
  GM_AUTH_API_BASE_PATH,
} from './constants/api';
import { applyStaticI18n, t } from './ui/i18n';
import { getCachedMapMeta } from './map-static-cache';
import { startClientVersionReload } from './version-reload';

const GM_PLAYER_QUICK_RESET_PASSWORD = '123456789';

applyStaticI18n(document);

/** loginOverlay：login Overlay。 */
const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
/** gmShell：GM Shell。 */
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
/** loginForm：login Form。 */
const loginForm = document.getElementById('gm-login-form') as HTMLFormElement;
/** passwordInput：密码输入。 */
const passwordInput = document.getElementById('gm-password') as HTMLInputElement;
/** loginSubmitBtn：login Submit Btn。 */
const loginSubmitBtn = document.getElementById('login-submit') as HTMLButtonElement;
/** loginErrorEl：login错误El。 */
const loginErrorEl = document.getElementById('login-error') as HTMLDivElement;
/** statusBarEl：状态Bar El。 */
const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
/** statusToastEl：状态Toast El。 */
const statusToastEl = document.getElementById('status-toast') as HTMLDivElement;
/** playerSearchInput：玩家搜索输入。 */
const playerSearchInput = document.getElementById('player-search') as HTMLInputElement;
/** playerSortSelect：玩家排序Select。 */
const playerSortSelect = document.getElementById('player-sort') as HTMLSelectElement;
/** playerAccountStatusFilterSelect：玩家账号状态筛选。 */
const playerAccountStatusFilterSelect = document.getElementById('player-account-status-filter') as HTMLSelectElement;
/** playerListEl：玩家列表El。 */
const playerListEl = document.getElementById('player-list') as HTMLDivElement;
/** playerPrevPageBtn：玩家Prev分页Btn。 */
const playerPrevPageBtn = document.getElementById('player-page-prev') as HTMLButtonElement;
/** playerNextPageBtn：玩家新版分页Btn。 */
const playerNextPageBtn = document.getElementById('player-page-next') as HTMLButtonElement;
/** playerPageMetaEl：玩家分页元数据El。 */
const playerPageMetaEl = document.getElementById('player-page-meta') as HTMLDivElement;
/** spawnCountInput：生成数量输入。 */
const spawnCountInput = document.getElementById('spawn-count') as HTMLInputElement;
/** editorEmptyEl：编辑器Empty El。 */
const editorEmptyEl = document.getElementById('editor-empty') as HTMLDivElement;
/** editorPanelEl：编辑器面板El。 */
const editorPanelEl = document.getElementById('editor-panel') as HTMLDivElement;
/** editorTitleEl：编辑器标题El。 */
const editorTitleEl = document.getElementById('editor-title') as HTMLDivElement;
/** editorSubtitleEl：编辑器Subtitle El。 */
const editorSubtitleEl = document.getElementById('editor-subtitle') as HTMLDivElement;
/** editorMetaEl：编辑器元数据El。 */
const editorMetaEl = document.getElementById('editor-meta') as HTMLDivElement;
/** editorContentEl：编辑器Content El。 */
const editorContentEl = document.getElementById('editor-content') as HTMLDivElement;
/** editorVisualPanelEl：编辑器Visual面板El。 */
const editorVisualPanelEl = document.getElementById('editor-visual-panel') as HTMLDivElement;
/** editorPersistedPanelEl：编辑器Persisted面板El。 */
const editorPersistedPanelEl = document.getElementById('editor-persisted-panel') as HTMLDivElement;
/** editorTabBasicBtn：编辑器Tab Basic Btn。 */
const editorTabBasicBtn = document.getElementById('editor-tab-basic') as HTMLButtonElement;
/** editorTabPositionBtn：编辑器Tab位置Btn。 */
const editorTabPositionBtn = document.getElementById('editor-tab-position') as HTMLButtonElement;
/** editorTabRealmBtn：编辑器Tab境界Btn。 */
const editorTabRealmBtn = document.getElementById('editor-tab-realm') as HTMLButtonElement;
/** editorTabBuffsBtn：编辑器Tab Buff Btn。 */
const editorTabBuffsBtn = document.getElementById('editor-tab-buffs') as HTMLButtonElement;
/** editorTabTechniquesBtn：编辑器Tab Techniques Btn。 */
const editorTabTechniquesBtn = document.getElementById('editor-tab-techniques') as HTMLButtonElement;
/** editorTabShortcutsBtn：编辑器Tab Shortcuts Btn。 */
const editorTabShortcutsBtn = document.getElementById('editor-tab-shortcuts') as HTMLButtonElement;
/** editorTabItemsBtn：编辑器Tab物品Btn。 */
const editorTabItemsBtn = document.getElementById('editor-tab-items') as HTMLButtonElement;
/** editorTabQuestsBtn：编辑器Tab Quests Btn。 */
const editorTabQuestsBtn = document.getElementById('editor-tab-quests') as HTMLButtonElement;
/** editorTabMailBtn：编辑器Tab邮件Btn。 */
const editorTabMailBtn = document.getElementById('editor-tab-mail') as HTMLButtonElement;
/** editorTabRiskBtn：编辑器Tab风险Btn。 */
const editorTabRiskBtn = document.getElementById('editor-tab-risk') as HTMLButtonElement;
/** editorTabPersistedBtn：编辑器Tab Persisted Btn。 */
const editorTabPersistedBtn = document.getElementById('editor-tab-persisted') as HTMLButtonElement;
/** playerPersistedJsonEl：玩家Persisted JSON El。 */
const playerPersistedJsonEl = document.getElementById('player-persisted-json') as HTMLTextAreaElement;
/** playerDatabaseTabsEl：玩家数据库Tabs。 */
const playerDatabaseTabsEl = document.getElementById('player-database-tabs') as HTMLDivElement;
/** playerDatabaseMetaEl：玩家数据库元数据。 */
const playerDatabaseMetaEl = document.getElementById('player-database-meta') as HTMLDivElement;
/** savePlayerBtn：保存玩家Btn。 */
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
/** refreshPlayerBtn：refresh玩家Btn。 */
const refreshPlayerBtn = document.getElementById('refresh-player') as HTMLButtonElement;
/** openPlayerMailBtn：open玩家邮件Btn。 */
const openPlayerMailBtn = document.getElementById('open-player-mail') as HTMLButtonElement;
/** resetPlayerBtn：reset玩家Btn。 */
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
/** resetHeavenGateBtn：reset Heaven关卡Btn。 */
const resetHeavenGateBtn = document.getElementById('reset-heaven-gate') as HTMLButtonElement;
/** removeBotBtn：remove Bot Btn。 */
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;
/** toggleMaintenanceModeBtn：切换维护态按钮。 */
const toggleMaintenanceModeBtn = document.getElementById('toggle-maintenance-mode') as HTMLButtonElement;
/** restartServerBtn：重启服务器按钮。 */
const restartServerBtn = document.getElementById('restart-server') as HTMLButtonElement;

/** summaryTotalEl：摘要总量El。 */
const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
/** summaryOnlineEl：摘要Online El。 */
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
/** summaryOfflineHangingEl：摘要Offline Hanging El。 */
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
/** summaryOfflineEl：摘要Offline El。 */
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
/** summaryMaintenanceEl：摘要维护态 El。 */
const summaryMaintenanceEl = document.getElementById('summary-maintenance') as HTMLDivElement;
/** summaryBotsEl：摘要Bots El。 */
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
/** summaryTickEl：摘要Tick El。 */
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
/** summaryTickWindowEl：摘要Tick窗口El。 */
const summaryTickWindowEl = document.getElementById('summary-tick-window') as HTMLDivElement;
/** summaryCpuEl：摘要Cpu El。 */
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
/** summaryMemoryEl：摘要Memory El。 */
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;
/** summaryNetInEl：摘要Net In El。 */
const summaryNetInEl = document.getElementById('summary-net-in') as HTMLDivElement;
/** summaryNetOutEl：摘要Net Out El。 */
const summaryNetOutEl = document.getElementById('summary-net-out') as HTMLDivElement;
/** summaryPathQueueEl：摘要路径队列El。 */
const summaryPathQueueEl = document.getElementById('summary-path-queue') as HTMLDivElement;
/** summaryPathWorkersEl：摘要路径Workers El。 */
const summaryPathWorkersEl = document.getElementById('summary-path-workers') as HTMLDivElement;
/** summaryPathCancelledEl：摘要路径Cancelled El。 */
const summaryPathCancelledEl = document.getElementById('summary-path-cancelled') as HTMLDivElement;
/** summaryNetInBreakdownEl：摘要Net In Breakdown El。 */
const summaryNetInBreakdownEl = document.getElementById('summary-net-in-breakdown') as HTMLDivElement;
/** networkInPrevPageBtn：网络上行上一页Btn。 */
const networkInPrevPageBtn = document.getElementById('network-in-page-prev') as HTMLButtonElement;
/** networkInNextPageBtn：网络上行下一页Btn。 */
const networkInNextPageBtn = document.getElementById('network-in-page-next') as HTMLButtonElement;
/** networkInPageMetaEl：网络上行分页元数据。 */
const networkInPageMetaEl = document.getElementById('network-in-page-meta') as HTMLDivElement;
/** summaryNetOutBreakdownEl：摘要Net Out Breakdown El。 */
const summaryNetOutBreakdownEl = document.getElementById('summary-net-out-breakdown') as HTMLDivElement;
/** networkOutPrevPageBtn：网络下行上一页Btn。 */
const networkOutPrevPageBtn = document.getElementById('network-out-page-prev') as HTMLButtonElement;
/** networkOutNextPageBtn：网络下行下一页Btn。 */
const networkOutNextPageBtn = document.getElementById('network-out-page-next') as HTMLButtonElement;
/** networkOutPageMetaEl：网络下行分页元数据。 */
const networkOutPageMetaEl = document.getElementById('network-out-page-meta') as HTMLDivElement;
/** serverSubtabOverviewBtn：服务端Subtab Overview Btn。 */
const serverSubtabOverviewBtn = document.getElementById('server-subtab-overview') as HTMLButtonElement;
/** serverSubtabTrafficBtn：服务端Subtab Traffic Btn。 */
const serverSubtabTrafficBtn = document.getElementById('server-subtab-traffic') as HTMLButtonElement;
/** serverSubtabCpuBtn：服务端Subtab Cpu Btn。 */
const serverSubtabCpuBtn = document.getElementById('server-subtab-cpu') as HTMLButtonElement;
/** serverSubtabMemoryBtn：服务端Subtab Memory Btn。 */
const serverSubtabMemoryBtn = document.getElementById('server-subtab-memory') as HTMLButtonElement;
/** serverSubtabDatabaseBtn：服务端Subtab数据库Btn。 */
const serverSubtabDatabaseBtn = document.getElementById('server-subtab-database') as HTMLButtonElement;
/** serverSubtabLogsBtn：服务端Subtab日志Btn。 */
const serverSubtabLogsBtn = document.getElementById('server-subtab-logs') as HTMLButtonElement;
/** serverSubtabWorkersBtn：服务端Subtab Workers Btn。 */
const serverSubtabWorkersBtn = document.getElementById('server-subtab-workers') as HTMLButtonElement;
/** serverSubtabEnvCheckBtn：服务端环境检测子标签按钮。 */
const serverSubtabEnvCheckBtn = document.getElementById('server-subtab-env-check') as HTMLButtonElement;
/** serverPanelOverviewEl：服务端面板Overview El。 */
const serverPanelOverviewEl = document.getElementById('server-panel-overview') as HTMLElement;
/** serverPanelTrafficEl：服务端面板Traffic El。 */
const serverPanelTrafficEl = document.getElementById('server-panel-traffic') as HTMLElement;
/** serverPanelCpuEl：服务端面板Cpu El。 */
const serverPanelCpuEl = document.getElementById('server-panel-cpu') as HTMLElement;
/** serverPanelMemoryEl：服务端面板Memory El。 */
const serverPanelMemoryEl = document.getElementById('server-panel-memory') as HTMLElement;
/** serverPanelDatabaseEl：服务端面板数据库El。 */
const serverPanelDatabaseEl = document.getElementById('server-panel-database') as HTMLElement;
/** serverPanelLogsEl：服务端面板日志El。 */
const serverPanelLogsEl = document.getElementById('server-panel-logs') as HTMLElement;
/** serverPanelWorkersEl：服务端面板Workers El。 */
const serverPanelWorkersEl = document.getElementById('server-panel-workers') as HTMLElement;
const serverPanelEnvCheckEl = document.getElementById('server-panel-env-check') as HTMLElement;
const serverEnvCheckRefreshBtn = document.getElementById('server-env-check-refresh') as HTMLButtonElement;
const serverEnvCheckMetaEl = document.getElementById('server-env-check-meta') as HTMLDivElement;
const serverEnvCheckContentEl = document.getElementById('server-env-check-content') as HTMLDivElement;
const serverSubtabFlagsBtn = document.getElementById('server-subtab-flags') as HTMLButtonElement | null;
const serverPanelFlagsEl = document.getElementById('server-panel-flags') as HTMLElement | null;
const serverSubtabObjectsBtn = document.getElementById('server-subtab-objects') as HTMLButtonElement;
const serverPanelObjectsEl = document.getElementById('server-panel-objects') as HTMLElement;
const serverObjectsRefreshBtn = document.getElementById('server-objects-refresh') as HTMLButtonElement;
const serverObjectsMetaEl = document.getElementById('server-objects-meta') as HTMLDivElement;
const serverObjectsContentEl = document.getElementById('server-objects-content') as HTMLDivElement;
const serverFlagsRefreshBtn = document.getElementById('server-flags-refresh') as HTMLButtonElement | null;
const serverFlagsMetaEl = document.getElementById('server-flags-meta') as HTMLDivElement | null;
const serverFlagsContentEl = document.getElementById('server-flags-content') as HTMLDivElement | null;
const serverFlagsNewKeyInput = document.getElementById('server-flags-new-key') as HTMLInputElement | null;
const serverFlagsAddBtn = document.getElementById('server-flags-add') as HTMLButtonElement | null;
/** serverWorkersRefreshBtn：服务端Workers刷新Btn。 */
const serverWorkersRefreshBtn = document.getElementById('server-workers-refresh') as HTMLButtonElement;
/** serverWorkersMetaEl：服务端Workers元信息El。 */
const serverWorkersMetaEl = document.getElementById('server-workers-meta') as HTMLDivElement;
/** serverWorkersContentEl：服务端Workers内容El。 */
const serverWorkersContentEl = document.getElementById('server-workers-content') as HTMLDivElement;
/** serverLogsLoadOlderBtn：服务端日志加载更早Btn。 */
const serverLogsLoadOlderBtn = document.getElementById('server-logs-load-older') as HTMLButtonElement;
/** serverLogsRefreshBtn：服务端日志刷新Btn。 */
const serverLogsRefreshBtn = document.getElementById('server-logs-refresh') as HTMLButtonElement;
/** serverLogsMetaEl：服务端日志元信息El。 */
const serverLogsMetaEl = document.getElementById('server-logs-meta') as HTMLDivElement;
/** serverLogsContentEl：服务端日志内容El。 */
const serverLogsContentEl = document.getElementById('server-logs-content') as HTMLPreElement;
function getDiagCommandEl(): HTMLTextAreaElement | null { return document.getElementById('server-diagnostics-command') as HTMLTextAreaElement | null; }
function getDiagLimitEl(): HTMLInputElement | null { return document.getElementById('server-diagnostics-limit') as HTMLInputElement | null; }
function getDiagRunBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-run') as HTMLButtonElement | null; }
function getDiagHelpBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-help') as HTMLButtonElement | null; }
function getDiagMetaEl(): HTMLDivElement | null { return document.getElementById('server-diagnostics-meta') as HTMLDivElement | null; }
function getDiagOutputEl(): HTMLDivElement | null { return document.getElementById('server-diagnostics-output') as HTMLDivElement | null; }
function getDiagUndoBtn(): HTMLButtonElement | null { return document.getElementById('server-diagnostics-undo') as HTMLButtonElement | null; }
function getDiagShortcutsEl(): HTMLDivElement | null { return document.getElementById('diagnostics-shortcuts') as HTMLDivElement | null; }
/** trafficResetMetaEl：traffic Reset元数据El。 */
const trafficResetMetaEl = document.getElementById('traffic-reset-meta') as HTMLDivElement;
/** trafficTotalInEl：traffic总量In El。 */
const trafficTotalInEl = document.getElementById('traffic-total-in') as HTMLDivElement;
/** trafficTotalInNoteEl：traffic总量In Note El。 */
const trafficTotalInNoteEl = document.getElementById('traffic-total-in-note') as HTMLDivElement;
/** trafficTotalOutEl：traffic总量Out El。 */
const trafficTotalOutEl = document.getElementById('traffic-total-out') as HTMLDivElement;
/** trafficTotalOutNoteEl：traffic总量Out Note El。 */
const trafficTotalOutNoteEl = document.getElementById('traffic-total-out-note') as HTMLDivElement;
/** resetNetworkStatsBtn：reset Network属性Btn。 */
const resetNetworkStatsBtn = document.getElementById('reset-network-stats') as HTMLButtonElement;
const toggleNetworkPayloadCaptureBtn = document.getElementById('toggle-network-payload-capture') as HTMLButtonElement;
/** resetCpuStatsBtn：reset Cpu属性Btn。 */
const resetCpuStatsBtn = document.getElementById('reset-cpu-stats') as HTMLButtonElement;
/** resetPathfindingStatsBtn：reset Pathfinding属性Btn。 */
const resetPathfindingStatsBtn = document.getElementById('reset-pathfinding-stats') as HTMLButtonElement;
/** triggerManualGcBtn：手动触发 V8 GC 诊断按钮。 */
const triggerManualGcBtn = document.getElementById('trigger-manual-gc') as HTMLButtonElement;
/** writeHeapSnapshotBtn：生成Heap Snapshot按钮。 */
const writeHeapSnapshotBtn = document.getElementById('write-heap-snapshot') as HTMLButtonElement;
/** copyHeapSnapshotSummaryBtn：生成 Heap Snapshot 后自动复制摘要 JSON 到剪贴板的按钮。 */
const copyHeapSnapshotSummaryBtn = document.getElementById('copy-heap-snapshot-summary') as HTMLButtonElement | null;
/** copyLatestHeapSnapshotSummaryBtn：复制最近一次 Heap Snapshot 摘要 JSON 到剪贴板的按钮。 */
const copyLatestHeapSnapshotSummaryBtn = document.getElementById('copy-latest-heap-snapshot-summary') as HTMLButtonElement | null;
/** heapSnapshotMetaEl：Heap Snapshot操作状态。 */
const heapSnapshotMetaEl = document.getElementById('heap-snapshot-meta') as HTMLDivElement;
/** cpuCurrentPercentEl：cpu当前Percent El。 */
const cpuCurrentPercentEl = document.getElementById('cpu-current-percent') as HTMLDivElement;
/** cpuTickWindowPercentEl：cpu Tick窗口Percent El。 */
const cpuTickWindowPercentEl = document.getElementById('cpu-tick-window-percent') as HTMLDivElement;
/** cpuTickWindowNoteEl：cpu Tick窗口Note El。 */
const cpuTickWindowNoteEl = document.getElementById('cpu-tick-window-note') as HTMLDivElement;
/** cpuProfileMetaEl：cpu Profile元数据El。 */
const cpuProfileMetaEl = document.getElementById('cpu-profile-meta') as HTMLDivElement;
/** cpuCoreCountEl：cpu Core数量El。 */
const cpuCoreCountEl = document.getElementById('cpu-core-count') as HTMLDivElement;
/** cpuUserMsEl：cpu用户Ms El。 */
const cpuUserMsEl = document.getElementById('cpu-user-ms') as HTMLDivElement;
/** cpuSystemMsEl：cpu系统Ms El。 */
const cpuSystemMsEl = document.getElementById('cpu-system-ms') as HTMLDivElement;
/** cpuLoad1mEl：cpu Load1m El。 */
const cpuLoad1mEl = document.getElementById('cpu-load-1m') as HTMLDivElement;
/** cpuLoad5mEl：cpu Load5m El。 */
const cpuLoad5mEl = document.getElementById('cpu-load-5m') as HTMLDivElement;
/** cpuLoad15mEl：cpu Load15m El。 */
const cpuLoad15mEl = document.getElementById('cpu-load-15m') as HTMLDivElement;
/** cpuProcessUptimeEl：cpu Process Uptime El。 */
const cpuProcessUptimeEl = document.getElementById('cpu-process-uptime') as HTMLDivElement;
/** cpuSystemUptimeEl：cpu系统Uptime El。 */
const cpuSystemUptimeEl = document.getElementById('cpu-system-uptime') as HTMLDivElement;
/** memorySnapshotMetaEl：内存快照说明。 */
const memorySnapshotMetaEl = document.getElementById('memory-snapshot-meta') as HTMLDivElement;
/** memoryRssEl：memory Rss El。 */
const memoryRssEl = document.getElementById('memory-rss') as HTMLDivElement;
/** memoryHeapUsedEl：memory Heap Used El。 */
const memoryHeapUsedEl = document.getElementById('memory-heap-used') as HTMLDivElement;
/** memoryHeapTotalEl：memory Heap总量El。 */
const memoryHeapTotalEl = document.getElementById('memory-heap-total') as HTMLDivElement;
/** memoryExternalEl：memory External El。 */
const memoryExternalEl = document.getElementById('memory-external') as HTMLDivElement;
/** memoryHeapUsagePercentEl：memory Heap使用率El。 */
const memoryHeapUsagePercentEl = document.getElementById('memory-heap-usage-percent') as HTMLDivElement;
/** memoryHeapUsageNoteEl：memory Heap使用率说明。 */
const memoryHeapUsageNoteEl = document.getElementById('memory-heap-usage-note') as HTMLDivElement;
/** memoryHeapFreeEl：memory Heap空闲El。 */
const memoryHeapFreeEl = document.getElementById('memory-heap-free') as HTMLDivElement;
/** memoryResidentGapEl：memory 常驻差额El。 */
const memoryResidentGapEl = document.getElementById('memory-resident-gap') as HTMLDivElement;
/** memoryRssHeapRatioEl：memory Rss/Heap 比值El。 */
const memoryRssHeapRatioEl = document.getElementById('memory-rss-heap-ratio') as HTMLDivElement;
/** memoryRssHeapRatioNoteEl：memory Rss/Heap 比值说明。 */
const memoryRssHeapRatioNoteEl = document.getElementById('memory-rss-heap-ratio-note') as HTMLDivElement;
/** memoryEstimateMetaEl：内存估算说明。 */
const memoryEstimateMetaEl = document.getElementById('memory-estimate-meta') as HTMLDivElement;
/** memoryDomainListEl：内存域画像列表。 */
const memoryDomainListEl = document.getElementById('memory-domain-list') as HTMLDivElement;
/** memoryHeapSpaceListEl：V8 heap space列表。 */
const memoryHeapSpaceListEl = document.getElementById('memory-heap-space-list') as HTMLDivElement;
/** memoryInstanceListEl：实例内存画像列表。 */
const memoryInstanceListEl = document.getElementById('memory-instance-list') as HTMLDivElement;
/** pathfindingResetMetaEl：pathfinding Reset元数据El。 */
const pathfindingResetMetaEl = document.getElementById('pathfinding-reset-meta') as HTMLDivElement;
/** pathfindingAvgQueueMsEl：pathfinding Avg队列Ms El。 */
const pathfindingAvgQueueMsEl = document.getElementById('pathfinding-avg-queue-ms') as HTMLDivElement;
/** pathfindingQueueNoteEl：pathfinding队列Note El。 */
const pathfindingQueueNoteEl = document.getElementById('pathfinding-queue-note') as HTMLDivElement;
/** pathfindingAvgRunMsEl：pathfinding Avg Run Ms El。 */
const pathfindingAvgRunMsEl = document.getElementById('pathfinding-avg-run-ms') as HTMLDivElement;
/** pathfindingRunNoteEl：pathfinding Run Note El。 */
const pathfindingRunNoteEl = document.getElementById('pathfinding-run-note') as HTMLDivElement;
/** pathfindingAvgExpandedNodesEl：pathfinding Avg Expanded Nodes El。 */
const pathfindingAvgExpandedNodesEl = document.getElementById('pathfinding-avg-expanded-nodes') as HTMLDivElement;
/** pathfindingExpandedNoteEl：pathfinding Expanded Note El。 */
const pathfindingExpandedNoteEl = document.getElementById('pathfinding-expanded-note') as HTMLDivElement;
/** pathfindingDropTotalEl：pathfinding掉落总量El。 */
const pathfindingDropTotalEl = document.getElementById('pathfinding-drop-total') as HTMLDivElement;
/** pathfindingDropNoteEl：pathfinding掉落Note El。 */
const pathfindingDropNoteEl = document.getElementById('pathfinding-drop-note') as HTMLDivElement;
/** pathfindingFailureListEl：pathfinding Failure列表El。 */
const pathfindingFailureListEl = document.getElementById('pathfinding-failure-list') as HTMLDivElement;
/** cpuBreakdownListEl：cpu Breakdown列表El。 */
const cpuBreakdownListEl = document.getElementById('cpu-breakdown-list') as HTMLDivElement;
/** cpuBreakdownSortTotalBtn：cpu Breakdown排序总量Btn。 */
const cpuBreakdownSortTotalBtn = document.getElementById('cpu-breakdown-sort-total') as HTMLButtonElement;
/** cpuBreakdownSortCountBtn：cpu Breakdown排序数量Btn。 */
const cpuBreakdownSortCountBtn = document.getElementById('cpu-breakdown-sort-count') as HTMLButtonElement;
/** cpuBreakdownSortAvgBtn：cpu Breakdown排序Avg Btn。 */
const cpuBreakdownSortAvgBtn = document.getElementById('cpu-breakdown-sort-avg') as HTMLButtonElement;
/** gmPasswordForm：GM密码Form。 */
const gmPasswordForm = document.getElementById('gm-password-form') as HTMLFormElement;
/** gmPasswordCurrentInput：GM密码当前输入。 */
const gmPasswordCurrentInput = document.getElementById('gm-password-current') as HTMLInputElement;
/** gmPasswordNextInput：GM密码新版输入。 */
const gmPasswordNextInput = document.getElementById('gm-password-next') as HTMLInputElement;
/** gmPasswordSaveBtn：GM密码保存Btn。 */
const gmPasswordSaveBtn = document.getElementById('gm-password-save') as HTMLButtonElement;
/** playerWorkspaceEl：玩家Workspace El。 */
const playerWorkspaceEl = document.getElementById('player-workspace') as HTMLElement;
/** redeemWorkspaceEl：兑换Workspace El。 */
const redeemWorkspaceEl = document.getElementById('redeem-workspace') as HTMLElement;
/** suggestionWorkspaceEl：建议Workspace El。 */
const suggestionWorkspaceEl = document.getElementById('suggestion-workspace') as HTMLElement;
/** serverWorkspaceEl：服务端Workspace El。 */
const serverWorkspaceEl = document.getElementById('server-workspace') as HTMLElement;
/** worldWorkspaceEl：世界Workspace El。 */
const worldWorkspaceEl = document.getElementById('world-workspace') as HTMLElement;
/** shortcutWorkspaceEl：shortcut Workspace El。 */
const shortcutWorkspaceEl = document.getElementById('shortcut-workspace') as HTMLElement;
/** envWorkspaceEl：密钥管理 workspace El。 */
const envWorkspaceEl = document.getElementById('secrets-workspace') as HTMLElement;
/** gameConfigWorkspaceEl：游戏配置 workspace El。 */
const gameConfigWorkspaceEl = document.getElementById('gameconfig-workspace') as HTMLElement;
/** aiWorkspaceEl：AI 配置 workspace El。 */
const aiWorkspaceEl = document.getElementById('ai-workspace') as HTMLElement;
/** tradesWorkspaceEl：交易记录 workspace El。 */
const tradesWorkspaceEl = document.getElementById('trades-workspace') as HTMLElement;
/** shortcutMailComposerEl：shortcut邮件Composer El。 */
const shortcutMailComposerEl = document.getElementById('shortcut-mail-composer') as HTMLDivElement | null;
/** serverTabBtn：服务端Tab Btn。 */
const serverTabBtn = document.getElementById('gm-tab-server') as HTMLButtonElement;
/** redeemTabBtn：兑换Tab Btn。 */
const redeemTabBtn = document.getElementById('gm-tab-redeem') as HTMLButtonElement;
/** playerTabBtn：玩家Tab Btn。 */
const playerTabBtn = document.getElementById('gm-tab-players') as HTMLButtonElement;
/** suggestionTabBtn：建议Tab Btn。 */
const suggestionTabBtn = document.getElementById('gm-tab-suggestions') as HTMLButtonElement;
/** worldTabBtn：世界Tab Btn。 */
const worldTabBtn = document.getElementById('gm-tab-world') as HTMLButtonElement;
/** shortcutTabBtn：shortcut Tab Btn。 */
const shortcutTabBtn = document.getElementById('gm-tab-shortcuts') as HTMLButtonElement;
/** envTabBtn：密钥管理 Tab Btn。 */
const envTabBtn = document.getElementById('gm-tab-secrets') as HTMLButtonElement;
/** gameConfigTabBtn：游戏配置 Tab Btn。 */
const gameConfigTabBtn = document.getElementById('gm-tab-gameconfig') as HTMLButtonElement;
/** aiTabBtn：AI 配置 Tab Btn。 */
const aiTabBtn = document.getElementById('gm-tab-ai') as HTMLButtonElement;
/** tradesTabBtn：交易记录 Tab Btn。 */
const tradesTabBtn = document.getElementById('gm-tab-trades') as HTMLButtonElement;
/** tradesFormEl：交易记录搜索表单。 */
const tradesFormEl = document.getElementById('gm-trades-form') as HTMLFormElement;
/** tradesPlayerInput：玩家序号 / playerId 输入。 */
const tradesPlayerInput = document.getElementById('gm-trades-player') as HTMLInputElement;
/** tradesItemInput：物品名输入。 */
const tradesItemInput = document.getElementById('gm-trades-item') as HTMLInputElement;
/** tradesPageSizeInput：每页条数输入。 */
const tradesPageSizeInput = document.getElementById('gm-trades-page-size') as HTMLInputElement;
/** tradesResetBtn：清空条件按钮。 */
const tradesResetBtn = document.getElementById('gm-trades-reset') as HTMLButtonElement;
/** tradesMetaEl：当前查询元信息。 */
const tradesMetaEl = document.getElementById('gm-trades-meta') as HTMLElement;
/** tradesListEl：交易记录列表容器。 */
const tradesListEl = document.getElementById('gm-trades-list') as HTMLElement;
/** tradesPageMetaEl：分页元信息。 */
const tradesPageMetaEl = document.getElementById('gm-trades-page-meta') as HTMLElement;
/** tradesPagePrevBtn：上一页。 */
const tradesPagePrevBtn = document.getElementById('gm-trades-page-prev') as HTMLButtonElement;
/** tradesPageNextBtn：下一页。 */
const tradesPageNextBtn = document.getElementById('gm-trades-page-next') as HTMLButtonElement;
/** suggestionListEl：建议列表El。 */
const suggestionListEl = document.getElementById('gm-suggestion-list') as HTMLElement;
/** suggestionSearchInput：建议搜索输入。 */
const suggestionSearchInput = document.getElementById('gm-suggestion-search') as HTMLInputElement;
/** suggestionSearchClearBtn：建议搜索Clear Btn。 */
const suggestionSearchClearBtn = document.getElementById('gm-suggestion-search-clear') as HTMLButtonElement;
/** suggestionPrevPageBtn：建议Prev分页Btn。 */
const suggestionPrevPageBtn = document.getElementById('gm-suggestion-page-prev') as HTMLButtonElement;
/** suggestionNextPageBtn：建议新版分页Btn。 */
const suggestionNextPageBtn = document.getElementById('gm-suggestion-page-next') as HTMLButtonElement;
/** suggestionPageMetaEl：建议分页元数据El。 */
const suggestionPageMetaEl = document.getElementById('gm-suggestion-page-meta') as HTMLDivElement;
/** redeemStatusEl：兑换状态El。 */
const redeemStatusEl = document.getElementById('redeem-status') as HTMLDivElement | null;
/** redeemGroupListEl：兑换分组列表El。 */
const redeemGroupListEl = document.getElementById('redeem-group-list') as HTMLDivElement | null;
/** redeemGroupEditorEl：兑换分组编辑器El。 */
const redeemGroupEditorEl = document.getElementById('redeem-group-editor') as HTMLDivElement | null;
/** redeemCodeListEl：兑换兑换码列表El。 */
const redeemCodeListEl = document.getElementById('redeem-code-list') as HTMLDivElement | null;

/** GmEditorTab：GM 玩家编辑器顶部标签页 ID。 */
type GmEditorTab = GmPlayerUpdateSection | 'shortcuts' | 'mail' | 'risk' | 'persisted';

/** GmServerTab：服务器监察子标签页 ID。 */
type GmServerTab = 'overview' | 'traffic' | 'cpu' | 'memory' | 'database' | 'logs' | 'workers' | 'envCheck' | 'objects';

/** GmMailAttachmentDraft：邮件草稿里的单个附件条目。 */
interface GmMailAttachmentDraft {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** GmMailComposerDraft：GM 发信草稿上下文，保存收件人、标题、正文与附件。 */
interface GmMailComposerDraft {
/**
 * templateId：templateID标识。
 */

  templateId: string;  
  /**
 * targetPlayerId：目标玩家ID标识。
 */

  targetPlayerId: string;  
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * body：body相关字段。
 */

  body: string;  
  /**
 * expireHours：expireHour相关字段。
 */

  expireHours: string;  
  /**
 * attachments：attachment相关字段。
 */

  attachments: GmMailAttachmentDraft[];
}

/** RedeemGroupDraft：兑换码分组编辑草稿，保存名称、奖励和批量数量。 */
interface RedeemGroupDraft {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];  
  /**
 * createCount：数量或计量字段。
 */

  createCount: string;  
  /**
 * appendCount：数量或计量字段。
 */

  appendCount: string;
}

/** SearchableItemScope：分类枚举。 */
type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot';

/** MAIL_ATTACHMENT_ITEM_PAGE_SIZE：邮件ATTACHMENT物品分页SIZE。 */
const MAIL_ATTACHMENT_ITEM_PAGE_SIZE = 10;
/** SEARCHABLE_ITEM_RESULT_LIMIT：SEARCHABLE物品结果LIMIT。 */
const SEARCHABLE_ITEM_RESULT_LIMIT = 80;
/** SERVER_LOG_PAGE_SIZE：服务端日志默认读取行数。 */
const SERVER_LOG_PAGE_SIZE = 100;

startClientVersionReload({
  onBeforeReload: () => {
    setStatus(t('gm.client.version.reload'));
  },
});

/** token：令牌。 */
let token = sessionStorage.getItem(GM_ACCESS_TOKEN_STORAGE_KEY) ?? '';
/** state：状态。 */
let state: GmStateRes | null = null;
/** databaseState：数据库状态。 */
let databaseState: GmDatabaseStateRes | null = null;
/** databaseImportBusy：数据库导入上传中。 */
let databaseImportBusy = false;
/** databaseImportStatus：数据库导入局部状态。 */
let databaseImportStatus = '';
/** selectedDatabaseImportFile：当前已选择但尚未上传的数据库备份文件。 */
let selectedDatabaseImportFile: File | null = null;
/** persistentFileInput：持久化的文件选择 input 节点，避免被 innerHTML 销毁导致 change 事件丢失。 */
const persistentFileInput = document.createElement('input');
persistentFileInput.id = 'database-import-file';
persistentFileInput.className = 'search-input';
persistentFileInput.type = 'file';
persistentFileInput.accept = '.dump,.gz,application/octet-stream,application/gzip';
persistentFileInput.addEventListener('change', () => {
  updateDatabaseImportFileSelection(persistentFileInput.files?.[0] ?? null);
});
type DatabaseSubTab = 'commands' | 'backup' | 'table-stats';
let databaseSubTab: DatabaseSubTab = 'commands';
let tableStatsState: GmDatabaseTableStatsRes | null = null;
let tableStatsLoading = false;
let cleanupBusy = false;
let suggestions: Suggestion[] = [];
/** EditorCatalogSource：编辑器目录数据的当前来源标记。 */
type EditorCatalogSource = 'server' | 'local-fallback' | 'unavailable';
/** editorCatalog：编辑器目录。 */
let editorCatalog: GmEditorCatalogRes | null = null;
/** editorCatalogSource：编辑器目录来源。 */
let editorCatalogSource: EditorCatalogSource = 'unavailable';
/** selectedPlayerId：selected玩家ID。 */
let selectedPlayerId: string | null = null;
/** selectedPlayerDetail：selected玩家详情。 */
let selectedPlayerDetail: GmManagedPlayerRecord | null = null;
/** selectedPlayerDetailError：selected玩家详情错误。 */
let selectedPlayerDetailError: string | null = null;
/** loadingPlayerDetailId：loading玩家详情ID。 */
let loadingPlayerDetailId: string | null = null;
/** detailRequestNonce：详情请求Nonce。 */
let detailRequestNonce = 0;
let playerListRequestNonce = 0;
/** draftSnapshot：draft快照。 */
let draftSnapshot: PlayerState | null = null;
/** editorDirty：编辑器Dirty。 */
let editorDirty = false;
/** draftSourcePlayerId：draft来源玩家ID。 */
let draftSourcePlayerId: string | null = null;
/** pollTimer：poll Timer。 */
let pollTimer: number | null = null;
/** currentTab：当前Tab。 */
let currentTab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts' | 'secrets' | 'gameconfig' | 'ai' | 'trades' = 'server';
/** currentServerTab：当前服务端Tab。 */
let currentServerTab: GmServerTab = 'overview';
/** currentCpuBreakdownSort：当前Cpu Breakdown排序。 */
let currentCpuBreakdownSort: 'total' | 'count' | 'avg' = 'total';
/** currentEditorTab：当前编辑器Tab。 */
let currentEditorTab: GmEditorTab = 'basic';
/** currentDatabaseTable：当前数据库表标签。 */
let currentDatabaseTable = 'server_player_snapshot';
let currentInventoryAddType: (typeof ITEM_TYPES)[number] = 'material';
let currentInventorySearchQuery = '';
/** currentPlayerSort：当前玩家排序。 */
let currentPlayerSort: GmPlayerSortMode = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
/** currentPlayerAccountStatusFilter：当前玩家账号状态筛选。 */
let currentPlayerAccountStatusFilter: GmPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
/** currentPlayerPage：当前玩家分页。 */
let currentPlayerPage = 1;
/** currentPlayerTotalPages：当前玩家总量Pages。 */
let currentPlayerTotalPages = 1;
/** playerSearchTimer：玩家搜索Timer。 */
let playerSearchTimer: number | null = null;
/** statusToastTimer：状态Toast Timer。 */
let statusToastTimer: number | null = null;
/** currentSuggestionPage：当前建议分页。 */
let currentSuggestionPage = 1;
/** currentSuggestionTotalPages：当前建议总量Pages。 */
let currentSuggestionTotalPages = 1;
/** currentSuggestionTotal：当前建议总量。 */
let currentSuggestionTotal = 0;
/** currentSuggestionKeyword：当前建议Keyword。 */
let currentSuggestionKeyword = '';
/** suggestionSearchTimer：建议搜索Timer。 */
let suggestionSearchTimer: number | null = null;
/** currentNetworkInPage：当前上行榜分页。 */
let currentNetworkInPage = 1;
/** currentNetworkOutPage：当前下行榜分页。 */
let currentNetworkOutPage = 1;
const networkLargePayloadBucketByKey = new Map<string, GmNetworkBucket>();
type GmPositionMapCategory = 'void' | 'real' | 'sect' | 'secret' | 'map';
const GM_POSITION_MAP_CATEGORY_OPTIONS: readonly { id: GmPositionMapCategory; label: string }[] = [
  { id: 'void', label: t('gm.client.position.category.void') },
  { id: 'real', label: t('gm.client.position.category.real') },
  { id: 'sect', label: t('gm.client.position.category.sect') },
  { id: 'secret', label: t('gm.client.position.category.secret') },
];
let gmMapSummaries: GmMapSummary[] = [];
let gmWorldInstances: GmWorldInstanceSummary[] = [];
let gmMapPickerCatalogLoaded = false;
let gmMapPickerCatalogLoading: Promise<void> | null = null;
let gmMapPickerCatalogWarned = false;
let positionMapCategoryDraft: { playerId: string; category: GmPositionMapCategory } | null = null;
/** lastPlayerListStructureKey：last玩家列表Structure Key。 */
let lastPlayerListStructureKey: string | null = null;
/** lastEditorStructureKey：last编辑器Structure Key。 */
let lastEditorStructureKey: string | null = null;

function buildGmStateApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/state?${params.toString()}`;
}

function buildGmPlayersApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/players?${params.toString()}`;
}

function buildGmPlayerApiPath(playerId: string): string {
  return `${GM_API_BASE_PATH}/players/${encodeURIComponent(playerId)}`;
}

function buildGmDatabaseBackupDownloadApiPath(backupId: string): string {
  return `${GM_API_BASE_PATH}/database/backups/${encodeURIComponent(backupId)}/download`;
}

function buildGmServerLogsApiPath(beforeSeq?: number): string {
  const params = new URLSearchParams({ limit: String(SERVER_LOG_PAGE_SIZE) });
  if (beforeSeq !== undefined) {
    params.set('before', String(beforeSeq));
  }
  return `${GM_API_BASE_PATH}/logs?${params.toString()}`;
}

function buildGmWorkersApiPath(): string {
  return `${GM_API_BASE_PATH}/workers`;
}

function buildGmEnvironmentCheckApiPath(): string {
  return `${GM_API_BASE_PATH}/environment/check`;
}

function buildGmDiagnosticsQueryApiPath(): string {
  return `${GM_API_BASE_PATH}/diagnostics/query`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertGmStateResponseShape(data: unknown): asserts data is GmStateRes {
  if (!isRecord(data)
    || !Array.isArray(data.players)
    || !Array.isArray(data.mapIds)
    || !isRecord(data.playerPage)
    || !Number.isFinite(data.playerPage.page)
    || !Number.isFinite(data.playerPage.pageSize)
    || !Number.isFinite(data.playerPage.total)
    || !Number.isFinite(data.playerPage.totalPages)
    || !isRecord(data.playerStats)
    || !Number.isFinite(data.playerStats.totalPlayers)
    || !Number.isFinite(data.playerStats.onlinePlayers)
    || !Number.isFinite(data.playerStats.offlineHangingPlayers)
    || !Number.isFinite(data.playerStats.offlinePlayers)
    || !isRecord(data.perf)) {
    throw new Error(t('gm.response.invalid-state'));
  }
}

function assertGmPlayerDetailResponseShape(data: unknown): asserts data is GmPlayerDetailRes {
  if (!isRecord(data) || !isRecord(data.player) || typeof data.player.id !== 'string') {
    throw new Error(t('gm.response.invalid-player-detail'));
  }
}
/** lastSuggestionStructureKey：last建议Structure Key。 */
let lastSuggestionStructureKey: string | null = null;
/** lastNetworkInStructureKey：last Network In Structure Key。 */
let lastNetworkInStructureKey: string | null = null;
/** lastNetworkOutStructureKey：last Network Out Structure Key。 */
let lastNetworkOutStructureKey: string | null = null;
/** lastCpuBreakdownStructureKey：last Cpu Breakdown Structure Key。 */
let lastCpuBreakdownStructureKey: string | null = null;
/** lastMemoryDomainStructureKey：last Memory Domain Structure Key。 */
let lastMemoryDomainStructureKey: string | null = null;
/** lastMemoryHeapSpaceStructureKey：last Memory Heap Space Structure Key。 */
let lastMemoryHeapSpaceStructureKey: string | null = null;
/** lastMemoryInstanceStructureKey：last Memory Instance Structure Key。 */
let lastMemoryInstanceStructureKey: string | null = null;
/** networkStatsActivationPending：网络统计启动请求是否进行中。 */
let networkStatsActivationPending = false;
/** lastPathfindingFailureStructureKey：last Pathfinding Failure Structure Key。 */
let lastPathfindingFailureStructureKey: string | null = null;
/** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
let lastShortcutMailComposerStructureKey: string | null = null;
/** databaseStateLoading：数据库状态Loading。 */
let databaseStateLoading = false;
/** serverLogsEntries：服务端日志已加载行。 */
let serverLogsEntries: GmServerLogEntry[] = [];
/** serverLogsNextBeforeSeq：服务端日志向上翻页游标。 */
let serverLogsNextBeforeSeq: number | undefined;
/** serverLogsHasMore：服务端日志是否还有更早行。 */
let serverLogsHasMore = false;
/** serverLogsBufferSize：服务端日志缓冲行数。 */
let serverLogsBufferSize = 0;
/** serverLogsLoading：服务端日志读取中。 */
let serverLogsLoading = false;
let serverDiagnosticsLoading = false;
let lastServerDiagnosticsResult: GmDiagnosticsQueryRes | null = null;
let lastExecCommand: string | null = null;
let lastExecPreviousCommand: string | null = null;
/** workerState：Worker状态。 */
let workerState: GmWorkerStateRes | null = null;
/** workerStateLoading：Worker状态读取中。 */
let workerStateLoading = false;
let envCheckResult: GmEnvCheckResult | null = null;
let envCheckLoading = false;
let runtimeFlags: Array<{ key: string; value: boolean }> = [];
let runtimeFlagsLoading = false;
const NETWORK_PAYLOAD_CAPTURE_FLAG_KEY = 'gm_network_payload_capture_enabled';

interface ObjectCountsResponse {
  totals: {
    instances: number;
    players: number;
    monsters: number;
    npcs: number;
    landmarks: number;
    containers: number;
    groundPiles: number;
    pendingCommands: number;
    monsterSpawnGroups: number;
  };
  topInstances: Array<{
    instanceId: string;
    players: number;
    monsters: number;
    npcs: number;
    landmarks: number;
    containers: number;
    groundPiles: number;
    pendingCommands: number;
  }>;
}
let objectCountsData: ObjectCountsResponse | null = null;
let objectsLoading = false;
let redeemGroupsState: RedeemCodeGroupView[] = [];
/** selectedRedeemGroupId：selected兑换分组ID。 */
let selectedRedeemGroupId: string | null = null;
/** redeemGroupDetailState：兑换分组详情状态。 */
let redeemGroupDetailState: GmRedeemCodeGroupDetailRes | null = null;
/** redeemDraft：兑换Draft。 */
let redeemDraft: RedeemGroupDraft = createDefaultRedeemGroupDraft();
/** redeemLoading：兑换Loading。 */
let redeemLoading = false;
let redeemLatestGeneratedCodes: string[] = [];
/** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
let directMailDraftPlayerId: string | null = null;
/** directMailDraft：direct邮件Draft。 */
let directMailDraft = createDefaultMailComposerDraft();
/** broadcastMailDraft：broadcast邮件Draft。 */
let broadcastMailDraft = createDefaultMailComposerDraft();
/** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
let shortcutMailComposerRefreshBlocked = false;
/** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
let directMailAttachmentPageByIndex = new Map<number, number>();
/** shortcutMailAttachmentPageByIndex：shortcut邮件Attachment分页By索引。 */
let shortcutMailAttachmentPageByIndex = new Map<number, number>();
/** activeSearchableItemField：活跃Searchable物品字段。 */
let activeSearchableItemField: HTMLElement | null = null;
/** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
let editorRenderRefreshBlocked = false;

/** getBrowserLocalStorage：读取Browser本地存储。 */
function getBrowserLocalStorage(): Storage | null {
  return gmPureHelpers.getBrowserLocalStorage();
}

/** readPersistedGmPassword：处理read Persisted GM密码。 */
function readPersistedGmPassword(): string {
  return gmPureHelpers.readPersistedGmPassword();
}

/** persistGmPassword：持久化GM密码。 */
function persistGmPassword(password: string): void {
  gmPureHelpers.persistGmPassword(password);
}

/** syncPersistedGmPasswordToInputs：同步Persisted GM密码To Inputs。 */
function syncPersistedGmPasswordToInputs(): void {
  const persistedPassword = readPersistedGmPassword();
  passwordInput.value = persistedPassword;
  gmPasswordCurrentInput.value = persistedPassword;
}

/** createDefaultMailAttachmentDraft：创建默认邮件Attachment Draft。 */
function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return gmPureHelpers.createDefaultMailAttachmentDraft();
}

/** createDefaultRedeemGroupDraft：创建默认兑换分组Draft。 */
function createDefaultRedeemGroupDraft(): RedeemGroupDraft {
  return gmPureHelpers.createDefaultRedeemGroupDraft(gmPureHelpers.createDefaultRedeemReward);
}

/** createDefaultRedeemReward：创建默认兑换Reward。 */
function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return gmPureHelpers.createDefaultRedeemReward();
}

/** createDefaultMailComposerDraft：创建默认邮件Composer Draft。 */
function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return gmPureHelpers.createDefaultMailComposerDraft();
}

/** ensureDirectMailDraft：确保Direct邮件Draft。 */
function ensureDirectMailDraft(playerId: string | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!playerId) {
    /** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
    directMailDraftPlayerId = null;
    /** directMailDraft：direct邮件Draft。 */
    directMailDraft = createDefaultMailComposerDraft();
    /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  if (directMailDraftPlayerId === playerId) {
    return;
  }
  /** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
  directMailDraftPlayerId = playerId;
  /** directMailDraft：direct邮件Draft。 */
  directMailDraft = createDefaultMailComposerDraft();
  /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
  directMailAttachmentPageByIndex = new Map();
}

/** clone：克隆clone。 */
function clone<T>(value: T): T {
  return gmPureHelpers.clone(value);
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(input: string): string {
  return gmPureHelpers.escapeHtml(input);
}

/** formatJson：格式化JSON。 */
function formatJson(value: unknown): string {
  return gmPureHelpers.formatJson(value);
}

/** formatBytes：格式化Bytes。 */
function formatBytes(bytes: number | undefined): string {
  return gmPureHelpers.formatBytes(bytes);
}

function formatSignedBytes(bytes: number | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value === 0) {
    return '0 B';
  }
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(value))}`;
}

/** formatPercent：格式化Percent。 */
function formatPercent(numerator: number, denominator: number): string {
  return gmPureHelpers.formatPercent(numerator, denominator);
}

/** formatBytesPerSecond：格式化Bytes Per Second。 */
function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  return gmPureHelpers.formatBytesPerSecond(bytes, elapsedSec);
}

/** formatAverageBytesPerEvent：格式化Average Bytes Per事件。 */
function formatAverageBytesPerEvent(bytes: number, count: number): string {
  return gmPureHelpers.formatAverageBytesPerEvent(bytes, count);
}

/** formatDurationSeconds：格式化Duration Seconds。 */
function formatDurationSeconds(seconds: number): string {
  return gmPureHelpers.formatDurationSeconds(seconds);
}

/** formatDateTime：格式化Date时间。 */
function formatDateTime(value?: string): string {
  return gmPureHelpers.formatDateTime(value);
}

/** getPlayerPresenceMeta：读取玩家Presence元数据。 */
function getPlayerPresenceMeta(player: Pick<GmManagedPlayerSummary, 'meta'>): {
/**
 * className：class名称名称或显示文本。
 */

  className: 'online' | 'offline';  
  /**
 * label：label名称或显示文本。
 */

  label: '在线' | '离线挂机' | '离线';
} {
  return gmPureHelpers.getPlayerPresenceMeta(player);
}

/** getManagedAccountStatusLabel：读取托管账号状态标签。 */
function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  return gmPureHelpers.getManagedAccountStatusLabel(player);
}

/** getManagedAccountActivityMeta：读取托管账号Activity元数据。 */
function getManagedAccountActivityMeta(player: Pick<GmManagedPlayerRecord, 'meta'>): {
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * value：值数值。
 */
 value: string;
 /**
 * note：note相关字段。
 */
 note?: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (player.meta.online) {
    return {
      label: '在线时间戳',
      value: player.meta.lastHeartbeatAt ? formatDateTime(player.meta.lastHeartbeatAt) : t('gm.client.activity.online.no-record'),
      note: player.meta.lastHeartbeatAt ? undefined : t('gm.client.activity.online.no-heartbeat-note'),
    };
  }
  if (player.meta.updatedAt) {
    return {
      label: t('gm.client.activity.updated-at'),
      value: formatDateTime(player.meta.updatedAt),
    };
  }
  if (player.meta.lastHeartbeatAt) {
    return {
      label: t('gm.client.activity.last-heartbeat'),
      value: formatDateTime(player.meta.lastHeartbeatAt),
      note: t('gm.client.activity.legacy-heartbeat-note'),
    };
  }
  return {
    label: t('gm.client.activity.latest-record'),
    value: t('gm.client.activity.no-record'),
  };
}

/** getManagedPlayerAccountStatusLabel：读取账号状态标签。 */
function getManagedPlayerAccountStatusLabel(status: GmManagedPlayerSummary['accountStatus']): string {
  switch (status) {
    case 'banned':
      return t('gm.client.account-status.banned');
    case 'abnormal':
      return t('gm.client.account-status.abnormal');
    case 'normal':
    default:
      return t('gm.client.account-status.normal');
  }
}

/** getManagedAccountRestrictionLabel：读取账号封禁状态标签。 */
function getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? t('gm.client.account-restriction.banned') : t('gm.client.account-restriction.allowed');
}

/** getManagedAccountRestrictionPillClass：读取账号封禁状态样式。 */
function getManagedAccountRestrictionPillClass(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? 'offline' : 'online';
}

/** getPlayerRiskLevelLabel：读取风险等级标签。 */
function getPlayerRiskLevelLabel(level: GmPlayerRiskLevel): string {
  switch (level) {
    case 'critical':
      return t('gm.client.risk-level.critical');
    case 'high':
      return t('gm.client.risk-level.high');
    case 'medium':
      return t('gm.client.risk-level.medium');
    case 'low':
    default:
      return t('gm.client.risk-level.low');
  }
}

/** getPlayerRiskLevelPillClass：读取风险等级样式。 */
function getPlayerRiskLevelPillClass(level: GmPlayerRiskLevel): string {
  switch (level) {
    case 'critical':
      return 'bot';
    case 'high':
      return 'offline';
    case 'medium':
      return '';
    case 'low':
    default:
      return 'online';
  }
}

/** renderPlayerRiskFactorCard：渲染风险维度卡片。 */
function renderPlayerRiskFactorCard(factor: GmPlayerRiskFactor): string {
  const evidenceMarkup = factor.evidence.length > 0
    ? `<div class="editor-note" style="margin-top: 8px;">${factor.evidence.map((entry) => `- ${escapeHtml(entry)}`).join('<br />')}</div>`
    : `<div class="editor-note" style="margin-top: 8px;">${escapeHtml(t('gm.client.risk.factor.no-evidence'))}</div>`;
  return `
    <div class="editor-card">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title">${escapeHtml(factor.label)}</div>
          <div class="editor-card-meta">${escapeHtml(factor.summary)}</div>
        </div>
        <span class="pill ${factor.score > 0 ? 'offline' : 'online'}">${factor.score} / ${factor.maxScore}</span>
      </div>
      ${evidenceMarkup}
    </div>
  `;
}

/** renderPlayerRiskSection：渲染玩家风险检测标签页。 */
function renderPlayerRiskSection(player: GmManagedPlayerRecord): string {
  const report = player.riskReport;
  const accountEnvMarkup = player.account
    ? `
      <div class="editor-note" style="margin-top: 8px;">
        ${escapeHtml(t('gm.client.risk.account.status', { status: getManagedAccountRestrictionLabel(player.account) }))}<br />
        ${escapeHtml(t('gm.client.risk.account.admin-list', { state: player.account.isRiskAdmin ? t('gm.client.risk.account.admin-joined') : t('gm.client.risk.account.admin-not-joined') }))}<br />
        ${escapeHtml(t('gm.client.risk.account.created-at', { time: formatDateTime(player.account.createdAt) }))}<br />
        ${escapeHtml(t('gm.client.risk.account.last-login', { time: formatDateTime(player.account.lastLoginAt) }))}
      </div>
    `
    : `<div class="editor-note" style="margin-top: 8px;">${escapeHtml(t('gm.client.risk.no-manageable-account'))}</div>`;

  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.overview.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.overview.note'))}</div>
        </div>
        <div class="editor-chip-list">
          <span class="pill ${getPlayerRiskLevelPillClass(report.level)}">${escapeHtml(getPlayerRiskLevelLabel(report.level))}</span>
          <span class="pill">${escapeHtml(t('gm.client.risk.score', { score: report.score, maxScore: report.maxScore }))}</span>
          <span class="pill">${escapeHtml(formatDateTime(report.generatedAt))}</span>
        </div>
      </div>
      <div class="note-card">${escapeHtml(report.overview)}</div>
      ${accountEnvMarkup}
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.recommendations.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.recommendations.note'))}</div>
        </div>
      </div>
      <div class="editor-card-list">
        ${report.recommendations.map((entry, index) => `
          <div class="editor-card">
            <div class="editor-card-head">
              <div class="editor-card-title">${escapeHtml(t('gm.client.risk.recommendation.index', { index: index + 1 }))}</div>
            </div>
            <div class="editor-note" style="margin-top: 0;">${escapeHtml(entry)}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${escapeHtml(t('gm.client.risk.factors.title'))}</div>
          <div class="editor-section-note">${escapeHtml(t('gm.client.risk.factors.note'))}</div>
        </div>
      </div>
      <div class="editor-card-list">
        ${report.factors.map((factor) => renderPlayerRiskFactorCard(factor)).join('')}
      </div>
    </section>
  `;
}

/** hasServerEditorCatalog：判断是否服务端编辑器目录。 */
function hasServerEditorCatalog(): boolean {
  return editorCatalogSource === 'server' && editorCatalog !== null;
}

/** getEditorCatalogFallbackNote：读取编辑器目录兜底Note。 */
function getEditorCatalogFallbackNote(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (editorCatalogSource === 'local-fallback') {
    return t('gm.client.editor-catalog.local-fallback-note');
  }
  if (editorCatalogSource === 'unavailable') {
    return t('gm.client.editor-catalog.unavailable-note');
  }
  return '';
}

/** assertTrustedEditorCatalog：处理assert Trusted编辑器目录。 */
function assertTrustedEditorCatalog(actionLabel: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (hasServerEditorCatalog()) {
    return;
  }
  throw new Error(t('gm.client.editor-catalog.action-paused', { actionLabel }));
}

/** getFilteredPlayers：读取Filtered Players。 */
function getFilteredPlayers(data: GmStateRes): GmManagedPlayerSummary[] {
  return data.players;
}

/** getPlayerIdentityLine：读取玩家身份Line。 */
function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerIdentityLine(player);
}

/** getPlayerStatsLine：读取玩家属性Line。 */
function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerStatsLine(player);
}

/** getPlayerRowMarkup：读取玩家Row Markup。 */
function getPlayerRowMarkup(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerRowMarkup(player);
}

/** patchPlayerRow：处理patch玩家Row。 */
function patchPlayerRow(button: HTMLButtonElement, player: GmManagedPlayerSummary, isActive: boolean): void {
  const presence = getPlayerPresenceMeta(player);
  button.classList.toggle('active', isActive);
  button.querySelector<HTMLElement>('[data-role="name"]')!.textContent = `${player.roleName} · ${formatPlayerNo(player.playerNo)}`;
  const presenceEl = button.querySelector<HTMLElement>('[data-role="presence"]')!;
  presenceEl.classList.toggle('online', presence.className === 'online');
  presenceEl.classList.toggle('offline', presence.className === 'offline');
  presenceEl.textContent = presence.label;
  button.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = t('gm.client.player-list.meta', {
    accountName: player.accountName ?? t('gm.none'),
    status: getManagedPlayerAccountStatusLabel(player.accountStatus),
    riskScore: player.riskScore,
    riskLevel: getPlayerRiskLevelLabel(player.riskLevel),
  });
  button.querySelector<HTMLElement>('[data-role="identity"]')!.textContent = player.riskTags.length > 0
    ? t('gm.client.player-list.identity-with-risk-tags', { identity: getPlayerIdentityLine(player), tags: player.riskTags.join(' / ') })
    : getPlayerIdentityLine(player);
  button.querySelector<HTMLElement>('[data-role="stats"]')!.textContent = getPlayerStatsLine(player);
}

/** getEditorSubtitle：读取编辑器Subtitle。 */
function getEditorSubtitle(detail: GmManagedPlayerRecord): string {
  return [
    formatPlayerNo(detail.playerNo),
    t('gm.client.editor.subtitle.account', { accountName: detail.accountName ?? t('gm.none') }),
    t('gm.client.editor.subtitle.display-name', { displayName: detail.displayName }),
    t('gm.client.editor.subtitle.map', { mapName: detail.mapName, x: detail.x, y: detail.y }),
    detail.meta.updatedAt
      ? t('gm.client.editor.subtitle.persisted-at', { time: new Date(detail.meta.updatedAt).toLocaleString('zh-CN') })
      : t('gm.client.editor.subtitle.runtime-player'),
  ].join(' · ');
}

function formatPlayerNo(playerNo: number | null | undefined): string {
  return typeof playerNo === 'number' && Number.isSafeInteger(playerNo) && playerNo > 0
    ? String(playerNo).padStart(3, '0')
    : '000';
}

/** getEditorMetaMarkup：读取编辑器元数据Markup。 */
function getEditorMetaMarkup(detail: GmManagedPlayerRecord): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const presence = getPlayerPresenceMeta(detail);
  const base = gmMarkupHelpers.getEditorMetaMarkup(detail, presence, editorDirty);
  const riskMeta = `<span class="pill ${getPlayerRiskLevelPillClass(detail.riskLevel)}">${escapeHtml(t('gm.client.editor.meta.risk', { score: detail.riskScore, level: getPlayerRiskLevelLabel(detail.riskLevel) }))}</span>`;
  if (hasServerEditorCatalog()) {
    return `${base}${riskMeta}`;
  }
  return `${base}${riskMeta}<span class="pill">${escapeHtml(editorCatalogSource === 'local-fallback' ? t('gm.client.editor.meta.catalog-local-fallback') : t('gm.client.editor.meta.catalog-unavailable'))}</span>`;
}

/** getEditorBodyChipMarkup：读取编辑器身体Chip Markup。 */
function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return gmMarkupHelpers.getEditorBodyChipMarkup(player, draft, editorDirty);
}

/** getEquipmentCardTitle：读取Equipment卡片标题。 */
function getEquipmentCardTitle(item: ItemStack | null): string {
  return item ? gmCatalogHelpers.getResolvedItemDisplayName(editorCatalog, item, '未命名装备') : '';
}

/** getEquipmentCardMeta：读取Equipment卡片元数据。 */
function getEquipmentCardMeta(item: ItemStack | null): string {
  return item ? gmCatalogHelpers.getResolvedInventoryRowMeta(editorCatalog, item) : '当前为空';
}

/** getBonusCardTitle：读取Bonus卡片标题。 */
function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return gmMarkupHelpers.getBonusCardTitle(bonus, index);
}

/** getBonusCardMeta：读取Bonus卡片元数据。 */
function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return gmMarkupHelpers.getBonusCardMeta(bonus);
}

/** getBuffCardTitle：读取Buff卡片标题。 */
function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return gmMarkupHelpers.getBuffCardTitle(buff, index);
}

/** getBuffCardMeta：读取Buff卡片元数据。 */
function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  return gmMarkupHelpers.getBuffCardMeta(buff);
}

/** getInventoryCardTitle：读取背包卡片标题。 */
function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return gmCatalogHelpers.getResolvedItemDisplayName(editorCatalog, item, `物品 ${index + 1}`);
}

/** getInventoryCardMeta：读取背包卡片元数据。 */
function getInventoryCardMeta(item: ItemStack | undefined): string {
  return item ? gmCatalogHelpers.getResolvedInventoryRowMeta(editorCatalog, item) : '';
}

/** getAutoSkillCardTitle：读取自动技能卡片标题。 */
function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return gmMarkupHelpers.getAutoSkillCardTitle(entry, index);
}

/** getAutoSkillCardMeta：读取自动技能卡片元数据。 */
function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return gmMarkupHelpers.getAutoSkillCardMeta(entry);
}

/** getTechniqueCardTitle：读取Technique卡片标题。 */
function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return gmMarkupHelpers.getTechniqueCardTitle(technique, index);
}

/** getTechniqueCardMeta：读取Technique卡片元数据。 */
function getTechniqueCardMeta(technique: TechniqueState | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!technique) return '';
  return gmMarkupHelpers.getTechniqueCardMeta(technique, (realmLv) => (
    editorCatalog?.realmLevels.find((entry) => entry.realmLv === realmLv)?.displayName
  ));
}

/** getQuestCardTitle：读取任务卡片标题。 */
function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return gmMarkupHelpers.getQuestCardTitle(quest, index);
}

/** getQuestCardMeta：读取任务卡片元数据。 */
function getQuestCardMeta(quest: QuestState | undefined): string {
  return gmMarkupHelpers.getQuestCardMeta(quest);
}

/** getTechniqueOptionLabel：读取Technique选项标签。 */
function getTechniqueOptionLabel(option: GmEditorTechniqueOption): string {
  return gmCatalogHelpers.getTechniqueOptionLabel(option, editorCatalog);
}

/** getItemOptionLabel：读取物品选项标签。 */
function getItemOptionLabel(option: GmEditorItemOption): string {
  return gmCatalogHelpers.getItemOptionLabel(option);
}

/** getTechniqueCatalogOptions：读取Technique目录选项。 */
function getTechniqueCatalogOptions(includeEmpty = false): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!hasServerEditorCatalog()) {
    return includeEmpty ? [{ value: '', label: '未选择' }] : [];
  }
  return gmCatalogHelpers.getTechniqueCatalogOptions(editorCatalog, includeEmpty);
}

/** getLearnedTechniqueOptions：读取Learned Technique选项。 */
function getLearnedTechniqueOptions(techniques: TechniqueState[], includeEmpty = false): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  const options = techniques.map((technique) => ({
    value: technique.techId,
    label: technique.name?.trim() || '未知功法',
  }));
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

/** getRealmCatalogOptions：读取境界目录选项。 */
function getRealmCatalogOptions(): Array<{
/**
 * value：值数值。
 */
 value: number;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return gmCatalogHelpers.getRealmCatalogOptions(editorCatalog);
}

/** getItemCatalogOptions：读取物品目录选项。 */
function getItemCatalogOptions(filter?: (option: GmEditorItemOption) => boolean): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!hasServerEditorCatalog()) {
    return [];
  }
  return gmCatalogHelpers.getItemCatalogOptions(editorCatalog, filter);
}

/** getBuffOptionLabel：读取Buff选项标签。 */
function getBuffOptionLabel(option: GmEditorBuffOption): string {
  return gmCatalogHelpers.getBuffOptionLabel(option);
}

/** getBuffCatalogOptions：读取Buff目录选项。 */
function getBuffCatalogOptions(selectedBuffId?: string): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!hasServerEditorCatalog()) {
    return selectedBuffId
      ? [
          { value: '', label: '请选择增益' },
          { value: selectedBuffId, label: selectedBuffId },
        ]
      : [{ value: '', label: '请选择增益' }];
  }
  return gmCatalogHelpers.getBuffCatalogOptions(editorCatalog, selectedBuffId);
}

/** getMailAttachmentItemOptions：读取邮件Attachment物品选项。 */
function getMailAttachmentItemOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return gmCatalogHelpers.getMailAttachmentItemOptions(editorCatalog);
}

/** getMailAttachmentPageStore：读取邮件Attachment分页存储。 */
function getMailAttachmentPageStore(scope: 'direct' | 'shortcut'): Map<number, number> {
  return scope === 'direct' ? directMailAttachmentPageByIndex : shortcutMailAttachmentPageByIndex;
}

/** resetMailAttachmentPageStore：重置邮件Attachment分页存储。 */
function resetMailAttachmentPageStore(scope: 'direct' | 'shortcut'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (scope === 'direct') {
    /** directMailAttachmentPageByIndex：direct邮件Attachment分页By索引。 */
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  /** shortcutMailAttachmentPageByIndex：shortcut邮件Attachment分页By索引。 */
  shortcutMailAttachmentPageByIndex = new Map();
}

/** getMailAttachmentItemPageState：读取邮件Attachment物品分页状态。 */
function getMailAttachmentItemPageState(
  scope: 'direct' | 'shortcut',
  attachmentIndex: number,
  selectedItemId: string,
): {
/**
 * page：page相关字段。
 */

  page: number;  
  /**
 * totalPages：totalPage相关字段。
 */

  totalPages: number;  
  /**
 * options：option相关字段。
 */

  options: Array<{  
  /**
 * value：值数值。
 */
 value: string;  
 /**
 * label：label名称或显示文本。
 */
 label: string }>;
} {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const allOptions = getMailAttachmentItemOptions();
  const totalPages = Math.max(1, Math.ceil(allOptions.length / MAIL_ATTACHMENT_ITEM_PAGE_SIZE));
  const selectedIndex = selectedItemId
    ? allOptions.findIndex((option) => option.value === selectedItemId)
    : -1;
  const fallbackPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / MAIL_ATTACHMENT_ITEM_PAGE_SIZE) + 1
    : 1;
  const pageStore = getMailAttachmentPageStore(scope);
  const storedPage = pageStore.get(attachmentIndex) ?? fallbackPage;
  const page = Math.min(totalPages, Math.max(1, storedPage));
  if (pageStore.get(attachmentIndex) !== page) {
    pageStore.set(attachmentIndex, page);
  }
  const start = (page - 1) * MAIL_ATTACHMENT_ITEM_PAGE_SIZE;
  const pagedOptions = allOptions.slice(start, start + MAIL_ATTACHMENT_ITEM_PAGE_SIZE);
  const selectedOption = selectedItemId
    ? allOptions.find((option) => option.value === selectedItemId) ?? null
    : null;
  const options = selectedOption && !pagedOptions.some((option) => option.value === selectedOption.value)
    ? [selectedOption, ...pagedOptions]
    : pagedOptions;
  return {
    page,
    totalPages,
    options,
  };
}

/** updateMailAttachmentItemPage：更新邮件Attachment物品分页。 */
function updateMailAttachmentItemPage(scope: 'direct' | 'shortcut', attachmentIndex: number, rawValue: string): void {
  const page = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
  getMailAttachmentPageStore(scope).set(attachmentIndex, page);
}

/** getMailAttachmentTitle：读取邮件Attachment标题。 */
function getMailAttachmentTitle(itemId: string, fallbackLabel: string): string {
  if (!itemId) {
    return fallbackLabel;
  }
  return gmCatalogHelpers.findItemCatalogEntry(editorCatalog, itemId)?.name?.trim() || '未知物品';
}

/** getMailAttachmentRowMeta：读取邮件Attachment Row元数据。 */
function getMailAttachmentRowMeta(itemId: string): string {
  return gmCatalogHelpers.getMailAttachmentRowMeta(editorCatalog, itemId);
}

/** getMailTemplateOptionMeta：读取邮件模板选项元数据。 */
function getMailTemplateOptionMeta(templateId: string): {
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * description：description相关字段。
 */
 description: string } | null {
  return gmCatalogHelpers.getMailTemplateOptionMeta(templateId);
}

/** isServerManagedMailTemplate：判断是否服务端托管邮件模板。 */
function isServerManagedMailTemplate(templateId: string): boolean {
  return gmCatalogHelpers.isServerManagedMailTemplate(templateId);
}

/** getShortcutMailTargetOptions：读取Shortcut邮件目标选项。 */
function getShortcutMailTargetOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const players = state?.players.filter((player) => !player.meta.isBot) ?? [];
  const options = [
    { value: '', label: t('gm.text.all-player-recipients') },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.roleName} · ${formatPlayerNo(player.playerNo)} · ${player.accountName || t('gm.text.no-account')} · ${player.meta.online ? t('gm.online') : t('gm.offline')}`,
    })),
  ];
  const selectedTargetId = broadcastMailDraft.targetPlayerId.trim();
  if (selectedTargetId && !options.some((option) => option.value === selectedTargetId)) {
    const fallbackLabel = selectedPlayerDetail?.id === selectedTargetId
      ? `${selectedPlayerDetail.roleName} · ${formatPlayerNo(selectedPlayerDetail.playerNo)} · ${selectedPlayerDetail.account?.username || t('gm.text.no-account')} · ${t('gm.text.selected')}`
      : t('gm.text.current-target', { targetId: selectedTargetId });
    options.push({ value: selectedTargetId, label: fallbackLabel });
  }
  return options;
}

/** getMailComposerPayload：读取邮件Composer载荷。 */
function getMailComposerPayload(draft: GmMailComposerDraft): GmCreateMailReq {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const templateId = draft.templateId.trim();
  const usesServerManagedTemplate = isServerManagedMailTemplate(templateId);
  const title = draft.title.trim();
  const body = draft.body.trim();
  const senderLabel = draft.senderLabel.trim() || t('gm.mail.sender.default');
  const expireHours = Math.floor(Number(draft.expireHours || '0'));
  const attachments: MailAttachment[] = usesServerManagedTemplate
    ? []
    : draft.attachments
      .filter((entry) => entry.itemId.trim().length > 0 && Number.isFinite(entry.count) && entry.count > 0)
      .map((entry) => ({
        itemId: entry.itemId.trim(),
        count: Math.max(1, Math.floor(entry.count)),
      }));

  if (!templateId && !title && !body && attachments.length === 0) {
    throw new Error(t('gm.mail.compose.required'));
  }

  return {
    templateId: templateId || undefined,
    fallbackTitle: !templateId && title ? title : undefined,
    fallbackBody: !templateId && body ? body : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    senderLabel,
    expireAt: expireHours > 0 ? Date.now() + expireHours * 3600 * 1000 : null,
  };
}

/** getMailComposerMarkup：读取邮件Composer Markup。 */
function getMailComposerMarkup(
  draft: GmMailComposerDraft,
  options: {  
  /**
 * scope：scope相关字段。
 */

    scope: 'direct' | 'shortcut';    
    /**
 * submitLabel：submitLabel名称或显示文本。
 */

    submitLabel: string;    
    /**
 * note：note相关字段。
 */

    note: string;    
    /**
 * showTargetPlayer：show目标玩家引用。
 */

    showTargetPlayer?: boolean;
  },
): string {
  const usesServerManagedTemplate = isServerManagedMailTemplate(draft.templateId);
  const templateMeta = getMailTemplateOptionMeta(draft.templateId);
  const catalogActionDisabled = hasServerEditorCatalog() ? '' : ' disabled';
  const catalogFallbackNote = getEditorCatalogFallbackNote();
  const attachmentRows = usesServerManagedTemplate
    ? `<div class="editor-note">${escapeHtml(templateMeta?.description || '该模板的附件由服务端固定生成。')}</div>`
    : draft.attachments.length > 0
      ? draft.attachments.map((entry, index) => {
        return `
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">${escapeHtml(getMailAttachmentTitle(entry.itemId, `附件 ${index + 1}`))}</div>
              <div class="editor-card-meta">${escapeHtml(getMailAttachmentRowMeta(entry.itemId))}</div>
            </div>
            <button class="small-btn danger" type="button" data-action="${options.scope === 'direct' ? 'remove-direct-mail-attachment' : 'remove-shortcut-mail-attachment'}" data-mail-attachment-index="${index}">删除附件</button>
          </div>
          <div class="editor-grid compact">
            ${searchableItemField(
              '物品模板',
              entry.itemId,
              'all',
              { 'data-mail-bind': `${options.scope}.attachments.${index}.itemId` },
              'wide',
            )}
            <label class="editor-field">
              <span>数量</span>
              <input type="number" min="1" data-mail-bind="${options.scope}.attachments.${index}.count" value="${Math.max(1, Math.floor(entry.count || 1))}"${catalogActionDisabled} />
            </label>
          </div>
        </div>
      `;
      }).join('')
      : '<div class="editor-note">当前没有附件。</div>';
  const targetPlayerField = options.showTargetPlayer
    ? `
      <label class="editor-field wide">
        <span>发送目标</span>
        <select data-mail-bind="${options.scope}.targetPlayerId">
          ${optionsMarkup(getShortcutMailTargetOptions(), draft.targetPlayerId)}
        </select>
      </label>
    `
    : '';
  const templateField = `
    <label class="editor-field wide">
      <span>邮件模板</span>
      <select data-mail-bind="${options.scope}.templateId">
        ${optionsMarkup(
          GM_MAIL_TEMPLATE_OPTIONS.map((entry) => ({ value: entry.templateId, label: `${entry.label} · ${entry.description}` })),
          draft.templateId,
        )}
      </select>
    </label>
  `;
  const customContentFields = usesServerManagedTemplate
    ? `
      <div class="editor-note" style="margin-top: 10px;">
        当前使用模板“${escapeHtml(templateMeta?.label || '未知模板')}”，标题、正文和附件由服务端统一生成。
      </div>
    `
    : `
      <label class="editor-field wide">
        <span>标题</span>
        <input type="text" autocomplete="off" spellcheck="false" data-mail-bind="${options.scope}.title" value="${escapeHtml(draft.title)}" placeholder="不填则由服务端显示为未命名邮件" />
      </label>
      <label class="editor-field wide">
        <span>正文</span>
        <textarea class="editor-textarea" style="min-height: 120px;" spellcheck="false" data-mail-bind="${options.scope}.body" placeholder="可留空，仅发送附件">${escapeHtml(draft.body)}</textarea>
      </label>
    `;
  const attachmentSection = usesServerManagedTemplate
    ? `
      <div class="editor-section" style="margin-top: 10px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">模板附件</div>
            <div class="editor-section-note">当前模板会附带指定常用装备一套、全部非神通功法书各一本到，以及五枚苦修丹。</div>
          </div>
        </div>
        <div class="editor-card-list">${attachmentRows}</div>
      </div>
    `
    : `
      <div class="editor-section" style="margin-top: 10px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">邮件附件</div>
            <div class="editor-section-note">附件由服务端在领取时校验并发放到背包。</div>
          </div>
          <button class="small-btn" type="button" data-action="${options.scope === 'direct' ? 'add-direct-mail-attachment' : 'add-shortcut-mail-attachment'}"${catalogActionDisabled}>新增附件</button>
        </div>
        <div class="editor-card-list">${attachmentRows}</div>
      </div>
    `;

  return `
    <div class="editor-grid compact">
      ${targetPlayerField}
      ${templateField}
      <label class="editor-field">
        <span>发件人</span>
        <input type="text" autocomplete="off" spellcheck="false" data-mail-bind="${options.scope}.senderLabel" value="${escapeHtml(draft.senderLabel)}" placeholder="司命台" />
      </label>
      <label class="editor-field">
        <span>过期小时</span>
        <input type="number" min="0" data-mail-bind="${options.scope}.expireHours" value="${escapeHtml(draft.expireHours)}" placeholder="72" />
      </label>
      ${customContentFields}
    </div>
    ${attachmentSection}
    <div class="button-row" style="margin-top: 10px;">
      <button class="small-btn primary" type="button" data-action="${options.scope === 'direct' ? 'send-direct-mail' : 'send-shortcut-mail'}">${escapeHtml(options.submitLabel)}</button>
    </div>
    <div class="editor-note" style="margin-top: 8px;">${escapeHtml(options.note)}</div>
    ${catalogFallbackNote ? `<div class="editor-note" style="margin-top: 8px; color: var(--stamp-red);">${escapeHtml(catalogFallbackNote)}</div>` : ''}
  `;
}

/** getInventoryAddTypeOptions：读取背包Add类型选项。 */
function getInventoryAddTypeOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return ITEM_TYPES.map((type) => ({
    value: type,
    label: ITEM_TYPE_LABELS[type],
  }));
}

/** getInventoryAddItemOptions：读取背包Add物品选项。 */
function getInventoryAddItemOptions(): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  return getItemCatalogOptions((option) => option.type === currentInventoryAddType);
}

/** findTechniqueCatalogEntry：查找Technique目录条目。 */
function findTechniqueCatalogEntry(techId: string | undefined): GmEditorTechniqueOption | null {
  return gmCatalogHelpers.findTechniqueCatalogEntry(editorCatalog, techId);
}

/** findItemCatalogEntry：查找物品目录条目。 */
function findItemCatalogEntry(itemId: string | undefined): GmEditorItemOption | null {
  return gmCatalogHelpers.findItemCatalogEntry(editorCatalog, itemId);
}

/** findBuffCatalogEntry：查找Buff目录条目。 */
function findBuffCatalogEntry(buffId: string | undefined): GmEditorBuffOption | null {
  return gmCatalogHelpers.findBuffCatalogEntry(editorCatalog, buffId);
}

/** createTechniqueFromCatalog：创建Technique From目录。 */
function createTechniqueFromCatalog(techId: string): TechniqueState {
  return gmCatalogHelpers.createTechniqueFromCatalog(techId, editorCatalog, createDefaultTechnique, clone);
}

/** createItemFromCatalog：创建物品From目录。 */
function createItemFromCatalog(itemId: string, count = 1): ItemStack {
  return gmCatalogHelpers.createItemFromCatalog(itemId, editorCatalog, createDefaultItem, clone, count);
}

/** createBuffFromCatalog：创建Buff From目录。 */
function createBuffFromCatalog(
  buffId: string,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  return gmCatalogHelpers.createBuffFromCatalog(buffId, editorCatalog, createDefaultBuff, clone, current);
}

/** getTechniqueSummary：读取Technique摘要。 */
function getTechniqueSummary(technique: TechniqueState): string {
  return gmCatalogHelpers.getTechniqueSummary(technique);
}

/** getTechniqueTemplateMaxLevel：读取Technique模板最大等级。 */
function getTechniqueTemplateMaxLevel(technique: TechniqueState): number {
  return gmCatalogHelpers.getTechniqueTemplateMaxLevel(technique, editorCatalog);
}

/** buildMaxLevelTechniqueState：构建最大等级Technique状态。 */
function buildMaxLevelTechniqueState(technique: TechniqueState): TechniqueState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const catalogEntry = findTechniqueCatalogEntry(technique.techId);
  const maxLevel = getTechniqueTemplateMaxLevel(technique);
  if (!catalogEntry) {
    return {
      ...clone(technique),
      level: maxLevel,
      exp: 0,
      expToNext: 0,
    };
  }
  const next = createTechniqueFromCatalog(technique.techId);
  return {
    ...next,
    level: maxLevel,
    exp: 0,
    expToNext: 0,
  };
}

/** getInventoryRowMeta：读取背包Row元数据。 */
function getInventoryRowMeta(item: ItemStack): string {
  return gmCatalogHelpers.getResolvedInventoryRowMeta(editorCatalog, item);
}

/** getTechniqueEditorControls：读取Technique编辑器Controls。 */
function getTechniqueEditorControls(index: number, technique: TechniqueState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const catalogEntry = findTechniqueCatalogEntry(technique.techId);
  if (catalogEntry) {
    return `
      <div class="editor-grid compact">
        ${selectField('功法', `techniques.${index}.techId`, technique.techId, getTechniqueCatalogOptions())}
        ${numberField('等级', `techniques.${index}.level`, technique.level)}
        ${numberField('经验', `techniques.${index}.exp`, technique.exp)}
        <div class="editor-field">
          <span>功法境界</span>
          <div class="editor-code">${escapeHtml(TECHNIQUE_REALM_LABELS[technique.realm] ?? '未知境界')}</div>
        </div>
        <div class="editor-field">
          <span>境界等级</span>
          <div class="editor-code">${escapeHtml(String(technique.realmLv))}</div>
        </div>
        <div class="editor-field">
          <span>升级所需经验</span>
          <div class="editor-code">${escapeHtml(String(technique.expToNext))}</div>
        </div>
        <div class="editor-field wide">
          <span>当前模板</span>
          <div class="editor-code">${escapeHtml(getTechniqueSummary(technique))}</div>
        </div>
      </div>
      <div class="editor-note">
        该功法来自策划模板，名称、品阶、功法境界、层级和升级所需经验都会由服务端按模板重算；GM 这里仅建议改等级与当前经验。
      </div>
    `;
  }

  return `
    <div class="editor-grid compact">
      ${selectField('功法', `techniques.${index}.techId`, technique.techId, getTechniqueCatalogOptions())}
      ${numberField('境界等级', `techniques.${index}.realmLv`, technique.realmLv)}
      ${selectField('功法境界', `techniques.${index}.realm`, technique.realm, GM_TECHNIQUE_REALM_OPTIONS)}
      ${numberField('等级', `techniques.${index}.level`, technique.level)}
      ${numberField('经验', `techniques.${index}.exp`, technique.exp)}
      ${numberField('升级所需经验', `techniques.${index}.expToNext`, technique.expToNext)}
      <div class="editor-field wide">
        <span>当前模板</span>
        <div class="editor-code">${escapeHtml(getTechniqueSummary(technique))}</div>
      </div>
    </div>
  `;
}

/** getItemEditorControls：读取物品编辑器Controls。 */
function getItemEditorControls(basePath: string, item: ItemStack, mode: 'inventory' | 'equipment'): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const catalogEntry = findItemCatalogEntry(item.itemId);
  const enhancementField = shouldShowEnhancementLevelField(item)
    ? numberField('强化等级', `${basePath}.enhanceLevel`, item.enhanceLevel)
    : '';
  if (catalogEntry) {
    return `
      <div class="editor-grid compact">
        ${searchableItemField(
          mode === 'equipment' ? '装备模板' : '物品',
          item.itemId,
          mode === 'equipment' ? 'equipment-slot' : 'all',
          { 'data-bind': `${basePath}.itemId`, 'data-kind': 'string' },
          'wide',
          mode === 'equipment' ? item.equipSlot : undefined,
        )}
        ${mode === 'inventory' ? numberField('数量', `${basePath}.count`, item.count) : ''}
        ${enhancementField}
        <div class="editor-field">
          <span>模板等级</span>
          <div class="editor-code">${escapeHtml(String(item.level ?? '-'))}</div>
        </div>
        <div class="editor-field">
          <span>模板品阶</span>
          <div class="editor-code">${escapeHtml(item.grade ?? '-')}</div>
        </div>
        <div class="editor-field wide">
          <span>当前模板</span>
          <div class="editor-code">${escapeHtml(getInventoryRowMeta(item))}</div>
        </div>
      </div>
      <div class="editor-note">
        该物品来自策划模板，等级、品阶、装备属性、数值和特效会在服务端按模板补全；GM 这里仅建议改模板 ID、数量和强化等级。
      </div>
    `;
  }

  return `
    <div class="editor-grid compact">
      ${searchableItemField(
        mode === 'equipment' ? '装备模板' : '物品',
        item.itemId,
        mode === 'equipment' ? 'equipment-slot' : 'all',
        { 'data-bind': `${basePath}.itemId`, 'data-kind': 'string' },
        'wide',
        mode === 'equipment' ? item.equipSlot : undefined,
      )}
      ${mode === 'inventory' ? numberField('数量', `${basePath}.count`, item.count) : ''}
      ${enhancementField}
      ${numberField('等级', `${basePath}.level`, item.level)}
      ${nullableTextField('品阶', `${basePath}.grade`, item.grade, 'undefined')}
      ${jsonField('装备属性', `${basePath}.equipAttrs`, item.equipAttrs ?? {}, 'object')}
      ${jsonField('装备数值', `${basePath}.equipStats`, item.equipStats ?? {}, 'object')}
      ${jsonField('特效配置', `${basePath}.effects`, item.effects ?? [], 'array', 'wide')}
    </div>
  `;
}

function shouldShowEnhancementLevelField(item: ItemStack): boolean {
  const catalogEntry = findItemCatalogEntry(item.itemId);
  const resolvedType = catalogEntry?.type ?? item.type;
  if (resolvedType === 'equipment') {
    return true;
  }
  return !catalogEntry && !resolvedType && Number(item.enhanceLevel ?? 0) > 0;
}

function normalizeInventorySearchText(value: string): string {
  return value.trim().toLowerCase();
}

function getInventoryItemSearchText(item: ItemStack, index: number): string {
  const catalogEntry = findItemCatalogEntry(item.itemId);
  return normalizeInventorySearchText([
    getInventoryCardTitle(item, index),
    getInventoryCardMeta(item),
    item.itemId,
    item.name,
    catalogEntry?.name,
    catalogEntry?.type,
    catalogEntry?.equipSlot,
    item.type,
    item.equipSlot,
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).join(' '));
}

function getVisibleInventoryItems(items: ItemStack[]): Array<{ item: ItemStack; index: number }> {
  const query = normalizeInventorySearchText(currentInventorySearchQuery);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => !query || getInventoryItemSearchText(item, index).includes(query));
}

function getInventoryListMarkup(items: ItemStack[]): string {
  const visibleItems = getVisibleInventoryItems(items);
  if (items.length === 0) {
    return '<div class="editor-note">背包为空。</div>';
  }
  if (visibleItems.length === 0) {
    return '<div class="editor-note">没有匹配的物品。</div>';
  }
  return visibleItems.map(({ item, index }) => getCompactInventoryItemMarkup(item, index)).join('');
}

function patchInventoryListFromDraft(): void {
  if (!draftSnapshot) {
    return;
  }
  const listEl = editorContentEl.querySelector<HTMLElement>('[data-inventory-compact-list]');
  const countEl = editorContentEl.querySelector<HTMLElement>('[data-inventory-search-count]');
  if (!listEl) {
    return;
  }
  const items = ensureArray(draftSnapshot.inventory.items);
  listEl.innerHTML = getInventoryListMarkup(items);
  if (countEl) {
    const visibleCount = getVisibleInventoryItems(items).length;
    countEl.textContent = currentInventorySearchQuery.trim()
      ? `显示 ${visibleCount} / ${items.length} 项`
      : `共 ${items.length} 项`;
  }
}

/** getCompactInventoryItemMarkup：读取Compact背包物品Markup。 */
function getCompactInventoryItemMarkup(item: ItemStack, index: number): string {
  const searchText = getInventoryItemSearchText(item, index);
  return `
    <div class="editor-card inventory-compact-row" data-inventory-item-row data-index="${index}" data-search="${escapeHtml(searchText)}">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title" data-preview="inventory-title" data-index="${index}">${escapeHtml(getInventoryCardTitle(item, index))}</div>
          <div class="editor-card-meta" data-preview="inventory-meta" data-index="${index}">${escapeHtml(getInventoryCardMeta(item))}</div>
        </div>
        <button class="small-btn danger" type="button" data-action="remove-inventory-item" data-index="${index}">删除</button>
      </div>
      <div class="editor-grid compact">
        ${numberField('数量', `inventory.items.${index}.count`, item.count)}
        ${shouldShowEnhancementLevelField(item) ? numberField('强化等级', `inventory.items.${index}.enhanceLevel`, item.enhanceLevel) : ''}
      </div>
    </div>
  `;
}

/** getReadonlyPreviewValue：读取Readonly Preview值。 */
function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  return gmMarkupHelpers.getReadonlyPreviewValue(draft, path);
}

/** buildEditorStructureKey：构建编辑器Structure Key。 */
function buildEditorStructureKey(detail: GmManagedPlayerRecord, draft: PlayerState): string {
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort().join(',');
  const mapPickerKey = [
    gmMapSummaries.map((entry) => `${entry.id}:${entry.name}:${entry.mapGroupId ?? ''}`).join(','),
    gmWorldInstances.map((entry) => `${entry.instanceId}:${entry.templateId}:${entry.linePreset}:${entry.defaultEntry ? 1 : 0}`).join(','),
    positionMapCategoryDraft?.playerId === detail.id ? positionMapCategoryDraft.category : '',
  ].join('#');
  const equipmentPresence = EQUIP_SLOTS.map((slot) => (draft.equipment[slot] ? '1' : '0')).join('');
  return [
    detail.id,
    mapIds,
    mapPickerKey,
    equipmentPresence,
    detail.account?.status ?? 'no-account',
    String(detail.riskReport.score),
    detail.riskReport.level,
    detail.riskReport.factors.map((factor) => `${factor.key}:${factor.score}`).join(','),
    ensureArray(draft.bonuses).length,
    ensureArray(draft.temporaryBuffs).length,
    ensureArray(draft.inventory.items).length,
    ensureArray(draft.autoBattleSkills).length,
    ensureArray(draft.techniques).length,
    ensureArray(draft.quests).length,
  ].join('|');
}

/** setTextLikeValue：处理set文本Like值。 */
function setTextLikeValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  preserveFocusedField = true,
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (field.value === value) return;
  if (preserveFocusedField && document.activeElement === field) {
    return;
  }
  field.value = value;
}

/** syncVisualEditorFieldsFromDraft：同步Visual编辑器字段From Draft。 */
function syncVisualEditorFieldsFromDraft(draft: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const fields = editorContentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');
  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;
    const rawValue = getValueByPath(draft, path);
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
      const checked = Boolean(rawValue);
      if (document.activeElement === field) continue;
      if (field.checked !== checked) {
        field.checked = checked;
      }
      continue;
    }
    if (kind === 'number') {
      setTextLikeValue(field, Number.isFinite(rawValue) ? String(rawValue) : '0');
      continue;
    }
    if (kind === 'nullable-string') {
      setTextLikeValue(field, typeof rawValue === 'string' ? rawValue : '');
      continue;
    }
    if (kind === 'string-array') {
      setTextLikeValue(field, Array.isArray(rawValue) ? rawValue.join('\n') : '');
      continue;
    }
    if (kind === 'json') {
      const emptyJson = field.dataset.emptyJson;
      const fallback = emptyJson === 'array' ? [] : emptyJson === 'null' ? null : {};
      setTextLikeValue(field, formatJson(rawValue ?? fallback));
      continue;
    }
    setTextLikeValue(field, rawValue == null ? '' : String(rawValue));
  }
  syncSearchableItemFields(editorContentEl);
}

/** patchEditorPreview：处理patch编辑器Preview。 */
function patchEditorPreview(detail: GmManagedPlayerRecord, draft: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const equipment = draft.equipment as EquipmentSlots;
  for (const slot of EQUIP_SLOTS) {
    const item = equipment[slot];
    editorContentEl.querySelector<HTMLElement>(`[data-preview="equipment-title"][data-slot="${slot}"]`)!.textContent = getEquipmentCardTitle(item);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="equipment-meta"][data-slot="${slot}"]`)!.textContent = getEquipmentCardMeta(item);
  }

  ensureArray(draft.bonuses).forEach((bonus, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="bonus-title"][data-index="${index}"]`)!.textContent = getBonusCardTitle(bonus, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="bonus-meta"][data-index="${index}"]`)!.textContent = getBonusCardMeta(bonus);
  });
  ensureArray(draft.temporaryBuffs).forEach((buff, index) => {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="buff-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getBuffCardTitle(buff, index);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="buff-meta"][data-index="${index}"]`);
    if (metaEl) {
      metaEl.textContent = getBuffCardMeta(buff);
    }
  });
  ensureArray(draft.inventory.items).forEach((item, index) => {
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getInventoryCardTitle(item, index);
    }
    const metaEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-meta"][data-index="${index}"]`);
    if (metaEl) {
      metaEl.textContent = getInventoryCardMeta(item);
    }
  });
  ensureArray(draft.autoBattleSkills).forEach((entry, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="auto-skill-title"][data-index="${index}"]`)!.textContent = getAutoSkillCardTitle(entry, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="auto-skill-meta"][data-index="${index}"]`)!.textContent = getAutoSkillCardMeta(entry);
  });
  ensureArray(draft.techniques).forEach((technique, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="technique-title"][data-index="${index}"]`)!.textContent = getTechniqueCardTitle(technique, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="technique-meta"][data-index="${index}"]`)!.textContent = getTechniqueCardMeta(technique);
  });
  ensureArray(draft.quests).forEach((quest, index) => {
    editorContentEl.querySelector<HTMLElement>(`[data-preview="quest-title"][data-index="${index}"]`)!.textContent = getQuestCardTitle(quest, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="quest-meta"][data-index="${index}"]`)!.textContent = getQuestCardMeta(quest);
  });

  const chipListEl = editorContentEl.querySelector<HTMLElement>('[data-preview="base-chips"]');
  if (chipListEl) {
    chipListEl.innerHTML = getEditorBodyChipMarkup(detail, draft);
  }
  for (const key of ATTR_KEYS) {
    const totalValue = draft.finalAttrs?.[key] ?? draft.baseAttrs?.[key] ?? DEFAULT_BASE_ATTRS[key];
    const totalEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="attr-total"][data-key="${key}"]`);
    if (totalEl) {
      totalEl.textContent = getAttrDisplayNumber(totalValue, DEFAULT_BASE_ATTRS[key]);
    }
  }
  editorContentEl.querySelectorAll<HTMLElement>('[data-preview="readonly"]').forEach((element) => {
    const path = element.dataset.path;
    if (!path) return;
    element.textContent = getReadonlyPreviewValue(draft, path);
  });
}

/** clearEditorRenderCache：清理编辑器渲染缓存。 */
function clearEditorRenderCache(): void {
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  editorContentEl.innerHTML = '';
}

/** getVisibleNetworkBuckets：读取可见Network Buckets。 */
function getVisibleNetworkBuckets(buckets: GmNetworkBucket[]): GmNetworkBucket[] {
  return buckets;
}

const NETWORK_BUCKET_PAGE_SIZE = 20;

/** getSortedNetworkBuckets：读取按均秒字节排序后的网络记录。 */
function getSortedNetworkBuckets(
  buckets: GmNetworkBucket[],
  elapsedSec: number,
): GmNetworkBucket[] {
  const safeElapsedSec = elapsedSec > 0 ? elapsedSec : 1;
  return [...getVisibleNetworkBuckets(buckets)].sort((left, right) => {
    const rightBytesPerSecond = right.bytes / safeElapsedSec;
    const leftBytesPerSecond = left.bytes / safeElapsedSec;
    if (rightBytesPerSecond !== leftBytesPerSecond) {
      return rightBytesPerSecond - leftBytesPerSecond;
    }
    if (right.bytes !== left.bytes) {
      return right.bytes - left.bytes;
    }
    return left.label.localeCompare(right.label, 'zh-CN');
  });
}

/** paginateNetworkBuckets：分页切片网络记录。 */
function paginateNetworkBuckets(
  buckets: GmNetworkBucket[],
  currentPage: number,
): {
  page: number;
  totalPages: number;
  items: GmNetworkBucket[];
} {
  const totalPages = Math.max(1, Math.ceil(buckets.length / NETWORK_BUCKET_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, currentPage));
  const start = (page - 1) * NETWORK_BUCKET_PAGE_SIZE;
  return {
    page,
    totalPages,
    items: buckets.slice(start, start + NETWORK_BUCKET_PAGE_SIZE),
  };
}

/** getNetworkBucketMeta：读取Network Bucket元数据。 */
function getNetworkBucketMeta(
  totalBytes: number,
  bucket: GmNetworkBucket,
  elapsedSec: number,
): string {
  const largePayloadMeta = (bucket.largePayloadCount ?? 0) > 0
    ? ` · 大包 ${bucket.largePayloadCount} 次 / ${formatBytes(bucket.largePayloadBytes ?? 0)}`
    : '';
  return `${formatBytes(bucket.bytes)} · ${formatPercent(bucket.bytes, totalBytes)} · ${bucket.count} 次 · 均次 ${formatAverageBytesPerEvent(bucket.bytes, bucket.count)} · 均秒 ${formatBytesPerSecond(bucket.bytes, elapsedSec)}${largePayloadMeta}`;
}

/** getTickPerf：读取Tick性能。 */
function getTickPerf(perf: GmStateRes['perf']) {
  return perf.tick ?? {
    lastMapId: null,
    lastMs: perf.tickMs,
    windowElapsedSec: 0,
    windowTickCount: 0,
    windowTotalMs: 0,
    windowAvgMs: perf.tickMs,
    windowBusyPercent: 0,
  };
}

/** getStatRowMarkup：读取Stat Row Markup。 */
function getStatRowMarkup(key: string): string {
  return gmMarkupHelpers.getStatRowMarkup(key);
}

type StructuredStatListItem = {
  key: string;
  label: string;
  meta: string;
  largePayloadSamples?: GmNetworkBucket['largePayloadSamples'];
};

/** patchStatRow：处理patch Stat Row。 */
function patchStatRow(row: HTMLElement, item: StructuredStatListItem): void {
  const { label, meta } = item;
  row.querySelector<HTMLElement>('[data-role="label"]')!.textContent = label;
  row.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = meta;
  const actionsEl = row.querySelector<HTMLElement>('[data-role="actions"]');
  if (!actionsEl) {
    return;
  }
  if (!Array.isArray(item.largePayloadSamples) || item.largePayloadSamples.length === 0) {
    actionsEl.innerHTML = '';
    actionsEl.hidden = true;
    return;
  }
  actionsEl.hidden = false;
  const currentKey = actionsEl.querySelector<HTMLButtonElement>('[data-network-large-payload-key]')?.dataset.networkLargePayloadKey;
  if (currentKey === item.key) {
    return;
  }
  actionsEl.innerHTML = `<button class="small-btn network-payload-btn" type="button" data-network-large-payload-key="${escapeHtml(item.key)}">查看包体</button>`;
}

/** renderStructuredStatList：渲染Structured Stat列表。 */
function renderStructuredStatList(
  container: HTMLElement,
  structureKey: string | null,
  items: StructuredStatListItem[],
  emptyText: string,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (items.length === 0) {
    if (structureKey !== 'empty') {
      container.innerHTML = `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return 'empty';
  }

  const nextStructureKey = items.map((item) => item.key).join('|');
  if (structureKey !== nextStructureKey) {
    container.innerHTML = items.map((item) => getStatRowMarkup(item.key)).join('');
  }
  items.forEach((item, index) => {
    const row = container.children[index];
    if (!(row instanceof HTMLElement)) {
      return;
    }
    patchStatRow(row, item);
  });
  return nextStructureKey;
}

function rememberNetworkLargePayloadBuckets(buckets: GmNetworkBucket[]): void {
  for (const bucket of buckets) {
    if (Array.isArray(bucket.largePayloadSamples) && bucket.largePayloadSamples.length > 0) {
      networkLargePayloadBucketByKey.set(bucket.key, bucket);
    }
  }
}

function renderNetworkLargePayloadSample(sample: NonNullable<GmNetworkBucket['largePayloadSamples']>[number], index: number): string {
  const recordedAt = sample.recordedAt > 0 ? new Date(sample.recordedAt).toLocaleString() : t('gm.text.unknown-time');
  return `
    <section class="network-payload-sample">
      <div class="network-payload-sample-head">
        <div>${escapeHtml(t('gm.text.sample', { index: index + 1 }))}</div>
        <div>${escapeHtml(t('gm.network.large-payload.sample-meta', {
          event: sample.event,
          recordedAt,
          payloadBytes: formatBytes(sample.bytes),
          packetBytes: formatBytes(sample.packetBytes),
        }))}</div>
      </div>
      <textarea class="network-payload-body" readonly spellcheck="false">${escapeHtml(sample.body)}</textarea>
    </section>
  `;
}

function closeNetworkPayloadModal(): void {
  const modal = document.getElementById('network-payload-modal');
  if (modal) {
    modal.remove();
  }
}

function openNetworkPayloadModal(bucket: GmNetworkBucket): void {
  const samples = Array.isArray(bucket.largePayloadSamples) ? bucket.largePayloadSamples : [];
  if (samples.length === 0) {
    setStatus(t('gm.network.large-payload.empty'), true);
    return;
  }
  closeNetworkPayloadModal();
  const modal = document.createElement('div');
  modal.id = 'network-payload-modal';
  modal.className = 'network-payload-modal';
  modal.innerHTML = `
    <div class="network-payload-dialog" role="dialog" aria-modal="true" aria-label="网络包体内容">
      <div class="network-payload-dialog-head">
        <div>
          <div class="panel-title">${escapeHtml(bucket.label)}</div>
          <div class="network-breakdown-subtitle">${escapeHtml(t('gm.network.large-payload.limit-note', { count: samples.length }))}</div>
        </div>
        <button class="small-btn" type="button" data-network-payload-close>${escapeHtml(t('gm.common.close'))}</button>
      </div>
      <div class="network-payload-sample-list">
        ${samples.map((sample, index) => renderNetworkLargePayloadSample(sample, index)).join('')}
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    const target = event.target;
    if (target === modal || (target instanceof Element && target.closest('[data-network-payload-close]'))) {
      closeNetworkPayloadModal();
    }
  });
  document.body.appendChild(modal);
}

/** getSortedCpuSections：读取Sorted Cpu Sections。 */
function getSortedCpuSections(data: GmStateRes): GmCpuSectionSnapshot[] {
  const sections = [...data.perf.cpu.breakdown];
  sections.sort((left, right) => {
    if (currentCpuBreakdownSort === 'count') {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (right.totalMs !== left.totalMs) {
        return right.totalMs - left.totalMs;
      }
      return left.label.localeCompare(right.label, 'zh-CN');
    }
    if (currentCpuBreakdownSort === 'avg') {
      if (right.avgMs !== left.avgMs) {
        return right.avgMs - left.avgMs;
      }
      if (right.totalMs !== left.totalMs) {
        return right.totalMs - left.totalMs;
      }
      return left.label.localeCompare(right.label, 'zh-CN');
    }
    if (right.totalMs !== left.totalMs) {
      return right.totalMs - left.totalMs;
    }
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.label.localeCompare(right.label, 'zh-CN');
  });
  return sections.slice(0, 12);
}

/** getCpuSectionMeta：读取Cpu Section元数据。 */
function getCpuSectionMeta(section: GmCpuSectionSnapshot): string {
  return `${section.totalMs.toFixed(2)} ms · ${section.percent.toFixed(1)}% · ${section.count} 次 · 均次 ${section.avgMs.toFixed(3)} ms`;
}

/** getMemoryDomainMeta：读取Memory Domain元数据。 */
function getMemoryDomainMeta(totalRssBytes: number, domain: GmMemoryDomainEstimateSnapshot): string {
  const average = domain.count > 0 ? ` · 均值 ${formatBytes(domain.avgBytes)}` : '';
  return `${formatBytes(domain.bytes)} · 占 RSS ${formatPercent(domain.bytes, totalRssBytes)}${domain.count > 0 ? ` · ${domain.count} 个` : ''}${average}`;
}

/** getMemoryInstanceMeta：读取Memory Instance元数据。 */
function getMemoryInstanceMeta(totalRssBytes: number, instance: GmMemoryInstanceEstimateSnapshot): string {
  return `${formatBytes(instance.bytes)} · 占 RSS ${formatPercent(instance.bytes, totalRssBytes)} · 玩家 ${instance.playerCount} · 怪物 ${instance.monsterCount} · 玩家容器 ${formatBytes(instance.playerBytes)} · 怪物容器 ${formatBytes(instance.monsterBytes)} · 其余实例容器 ${formatBytes(instance.instanceBytes)}`;
}

function getHeapSpaceMeta(heapTotalBytes: number, space: GmV8HeapSpaceSnapshot): string {
  const usage = space.sizeBytes > 0 ? formatPercent(space.usedBytes, space.sizeBytes) : '0%';
  return `已用 ${formatBytes(space.usedBytes)} / 总量 ${formatBytes(space.sizeBytes)} · 使用率 ${usage} · 可用 ${formatBytes(space.availableBytes)} · 物理 ${formatBytes(space.physicalBytes)} · 占 Heap ${formatPercent(space.usedBytes, heapTotalBytes)}`;
}

/** getPathfindingFailureMeta：读取Pathfinding Failure元数据。 */
function getPathfindingFailureMeta(totalFailures: number, count: number): string {
  return `${count} 次 · 占失败 ${formatPercent(count, totalFailures)}`;
}

/** renderPerfLists：渲染性能Lists。 */
function renderPerfLists(data: GmStateRes): void {
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const sortedNetworkInBuckets = getSortedNetworkBuckets(data.perf.networkInBuckets, elapsedSec);
  const pagedNetworkInBuckets = paginateNetworkBuckets(sortedNetworkInBuckets, currentNetworkInPage);
  currentNetworkInPage = pagedNetworkInBuckets.page;
  networkLargePayloadBucketByKey.clear();
  rememberNetworkLargePayloadBuckets(sortedNetworkInBuckets);
  networkInPageMetaEl.textContent = `第 ${pagedNetworkInBuckets.page} / ${pagedNetworkInBuckets.totalPages} 页 · 共 ${sortedNetworkInBuckets.length} 条`;
  networkInPrevPageBtn.disabled = pagedNetworkInBuckets.page <= 1;
  networkInNextPageBtn.disabled = pagedNetworkInBuckets.page >= pagedNetworkInBuckets.totalPages;
  const networkInItems = data.perf.networkInBytes > 0
    ? pagedNetworkInBuckets.items.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkInBytes, bucket, elapsedSec),
        largePayloadSamples: bucket.largePayloadSamples,
      }))
    : [];
  const sortedNetworkOutBuckets = getSortedNetworkBuckets(data.perf.networkOutBuckets, elapsedSec);
  const pagedNetworkOutBuckets = paginateNetworkBuckets(sortedNetworkOutBuckets, currentNetworkOutPage);
  currentNetworkOutPage = pagedNetworkOutBuckets.page;
  rememberNetworkLargePayloadBuckets(sortedNetworkOutBuckets);
  networkOutPageMetaEl.textContent = `第 ${pagedNetworkOutBuckets.page} / ${pagedNetworkOutBuckets.totalPages} 页 · 共 ${sortedNetworkOutBuckets.length} 条`;
  networkOutPrevPageBtn.disabled = pagedNetworkOutBuckets.page <= 1;
  networkOutNextPageBtn.disabled = pagedNetworkOutBuckets.page >= pagedNetworkOutBuckets.totalPages;
  const networkOutItems = data.perf.networkOutBytes > 0
    ? pagedNetworkOutBuckets.items.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkOutBytes, bucket, elapsedSec),
        largePayloadSamples: bucket.largePayloadSamples,
      }))
    : [];
  const cpuItems = getSortedCpuSections(data).map((section) => ({
    key: section.key,
    label: section.label,
    meta: getCpuSectionMeta(section),
  }));
  const totalRssBytes = Math.max(0, data.perf.memoryEstimate?.rssBytes ?? 0);
  const memoryDomainItems = Array.isArray(data.perf.memoryEstimate?.domains)
    ? data.perf.memoryEstimate.domains.map((domain) => ({
        key: domain.key,
        label: domain.label,
        meta: getMemoryDomainMeta(totalRssBytes, domain),
      }))
    : [];
  const memoryInstanceItems = Array.isArray(data.perf.memoryEstimate?.topInstances)
    ? data.perf.memoryEstimate.topInstances.map((instance) => ({
        key: instance.instanceId,
        label: instance.label,
        meta: getMemoryInstanceMeta(totalRssBytes, instance),
      }))
    : [];
  const heapTotalBytes = Math.max(0, (data.perf.cpu.heapTotalMb ?? 0) * 1024 * 1024);
  const heapSpaceItems = Array.isArray(data.perf.memoryEstimate?.heapSpaces)
    ? data.perf.memoryEstimate.heapSpaces
        .slice()
        .sort((left, right) => right.usedBytes - left.usedBytes || left.name.localeCompare(right.name))
        .map((space) => ({
          key: space.name,
          label: space.name,
          meta: getHeapSpaceMeta(heapTotalBytes, space),
        }))
    : [];
  const totalFailures = data.perf.pathfinding.failed + data.perf.pathfinding.cancelled;
  const pathfindingFailureItems = data.perf.pathfinding.failureReasons.map((bucket) => ({
    key: bucket.reason,
    label: bucket.label,
    meta: getPathfindingFailureMeta(totalFailures, bucket.count),
  }));

  lastNetworkInStructureKey = renderStructuredStatList(
    summaryNetInBreakdownEl,
    lastNetworkInStructureKey,
    networkInItems,
    '当前还没有累计上行事件。',
  );
  lastNetworkOutStructureKey = renderStructuredStatList(
    summaryNetOutBreakdownEl,
    lastNetworkOutStructureKey,
    networkOutItems,
    '当前还没有累计下行事件。',
  );
  lastCpuBreakdownStructureKey = renderStructuredStatList(
    cpuBreakdownListEl,
    lastCpuBreakdownStructureKey,
    cpuItems,
    '当前还没有 CPU 分项数据。',
  );
  lastMemoryDomainStructureKey = renderStructuredStatList(
    memoryDomainListEl,
    lastMemoryDomainStructureKey,
    memoryDomainItems,
    '当前还没有运行态内存画像。',
  );
  lastMemoryHeapSpaceStructureKey = renderStructuredStatList(
    memoryHeapSpaceListEl,
    lastMemoryHeapSpaceStructureKey,
    heapSpaceItems,
    '当前还没有 V8 heap space 数据。',
  );
  lastMemoryInstanceStructureKey = renderStructuredStatList(
    memoryInstanceListEl,
    lastMemoryInstanceStructureKey,
    memoryInstanceItems,
    '当前还没有实例内存画像。',
  );
  lastPathfindingFailureStructureKey = renderStructuredStatList(
    pathfindingFailureListEl,
    lastPathfindingFailureStructureKey,
    pathfindingFailureItems,
    '当前还没有寻路失败记录。',
  );
}

/** renderSuggestionReply：渲染建议回复。 */
function renderSuggestionReply(reply: Suggestion['replies'][number]): string {
  return gmMarkupHelpers.renderSuggestionReply(reply);
}

/** getSuggestionCardMarkup：读取建议卡片Markup。 */
function getSuggestionCardMarkup(suggestion: Suggestion): string {
  return gmMarkupHelpers.getSuggestionCardMarkup(suggestion);
}

/** getEditorTabLabel：读取编辑器Tab标签。 */
function getEditorTabLabel(tab: GmEditorTab): string {
  switch (tab) {
    case 'basic':
      return '基础';
    case 'position':
      return '位置';
    case 'realm':
      return '属性';
    case 'buffs':
      return '增益';
    case 'techniques':
      return '功法';
    case 'shortcuts':
      return '快捷操作';
    case 'items':
      return '物品';
    case 'quests':
      return '任务';
    case 'mail':
      return '邮件';
    case 'risk':
      return '风险检测';
    case 'persisted':
      return '数据库';
  }
}

/** switchEditorTab：处理switch编辑器Tab。 */
function switchEditorTab(tab: GmEditorTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentEditorTab：当前编辑器Tab。 */
  currentEditorTab = tab;
  editorTabBasicBtn.classList.toggle('active', tab === 'basic');
  editorTabPositionBtn.classList.toggle('active', tab === 'position');
  editorTabRealmBtn.classList.toggle('active', tab === 'realm');
  editorTabBuffsBtn.classList.toggle('active', tab === 'buffs');
  editorTabTechniquesBtn.classList.toggle('active', tab === 'techniques');
  editorTabShortcutsBtn.classList.toggle('active', tab === 'shortcuts');
  editorTabItemsBtn.classList.toggle('active', tab === 'items');
  editorTabQuestsBtn.classList.toggle('active', tab === 'quests');
  editorTabMailBtn.classList.toggle('active', tab === 'mail');
  editorTabRiskBtn.classList.toggle('active', tab === 'risk');
  editorTabPersistedBtn.classList.toggle('active', tab === 'persisted');
  editorVisualPanelEl.classList.toggle('hidden', tab === 'persisted');
  editorPersistedPanelEl.classList.toggle('hidden', tab !== 'persisted');
  editorContentEl.querySelectorAll<HTMLElement>('[data-editor-tab]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.editorTab !== tab);
  });
  if (tab === 'persisted') {
    savePlayerBtn.textContent = '数据库标签不直接保存';
  } else if (tab === 'mail') {
    savePlayerBtn.textContent = '邮件标签不直接保存';
  } else if (tab === 'risk') {
    savePlayerBtn.textContent = '风险标签不直接保存';
  } else if (tab === 'shortcuts') {
    savePlayerBtn.textContent = '快捷标签按钮会直接提交';
  } else {
    savePlayerBtn.textContent = `保存${getEditorTabLabel(tab)}`;
  }
  if (tab === 'persisted') {
    const detail = getSelectedPlayerDetail();
    if (detail) {
      renderPlayerDatabasePanel(detail);
    }
  }
  savePlayerBtn.disabled = tab === 'persisted'
    || tab === 'mail'
    || tab === 'risk'
    || tab === 'shortcuts'
    || !selectedPlayerId
    || ((tab === 'buffs' || tab === 'techniques' || tab === 'items' || tab === 'quests') && !hasServerEditorCatalog());
}

/** StatusKind：分类枚举。 */
type StatusKind = 'idle' | 'pending' | 'success' | 'error';

/** applyStatusState：应用状态状态。 */
function applyStatusState(message: string, kind: StatusKind): void {
  statusBarEl.textContent = message;
  statusBarEl.dataset.kind = kind;
}

/** hideStatusToast：处理hide状态Toast。 */
function hideStatusToast(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
    /** statusToastTimer：状态Toast Timer。 */
    statusToastTimer = null;
  }
  statusToastEl.dataset.open = 'false';
  statusToastEl.dataset.kind = 'idle';
  statusToastEl.textContent = '';
}

/** showStatusToast：处理显示状态Toast。 */
function showStatusToast(message: string, kind: Exclude<StatusKind, 'idle'>): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!message) {
    hideStatusToast();
    return;
  }
  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
    /** statusToastTimer：状态Toast Timer。 */
    statusToastTimer = null;
  }
  statusToastEl.textContent = message;
  statusToastEl.dataset.kind = kind;
  statusToastEl.dataset.open = 'true';
  if (kind === 'pending') {
    return;
  }
  statusToastTimer = window.setTimeout(() => {
    statusToastEl.dataset.open = 'false';
  }, kind === 'error' ? 5200 : 2800);
}

/** setPendingStatus：处理set待处理状态。 */
function setPendingStatus(message: string): void {
  applyStatusState(message, message ? 'pending' : 'idle');
  showStatusToast(message, 'pending');
}

/** setStatus：处理set状态。 */
function setStatus(message: string, isError = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const kind: StatusKind = !message ? 'idle' : isError ? 'error' : 'success';
  applyStatusState(message, kind);
  if (kind === 'idle') {
    hideStatusToast();
    return;
  }
  showStatusToast(message, kind);
}

/** worldViewer：世界Viewer。 */
const worldViewer = new GmWorldViewer(request, setStatus);

function applyServerTabVisibility(tab: GmServerTab): void {
  serverSubtabOverviewBtn.classList.toggle('active', tab === 'overview');
  serverSubtabTrafficBtn.classList.toggle('active', tab === 'traffic');
  serverSubtabCpuBtn.classList.toggle('active', tab === 'cpu');
  serverSubtabMemoryBtn.classList.toggle('active', tab === 'memory');
  serverSubtabDatabaseBtn.classList.toggle('active', tab === 'database');
  serverSubtabLogsBtn.classList.toggle('active', tab === 'logs');
  serverSubtabWorkersBtn.classList.toggle('active', tab === 'workers');
  serverSubtabEnvCheckBtn.classList.toggle('active', tab === 'envCheck');
  serverSubtabObjectsBtn.classList.toggle('active', tab === 'objects');
  serverPanelOverviewEl.classList.toggle('hidden', tab !== 'overview');
  serverPanelTrafficEl.classList.toggle('hidden', tab !== 'traffic');
  serverPanelCpuEl.classList.toggle('hidden', tab !== 'cpu');
  serverPanelMemoryEl.classList.toggle('hidden', tab !== 'memory');
  serverPanelDatabaseEl.classList.toggle('hidden', tab !== 'database');
  serverPanelLogsEl.classList.toggle('hidden', tab !== 'logs');
  serverPanelWorkersEl.classList.toggle('hidden', tab !== 'workers');
  serverPanelEnvCheckEl.classList.toggle('hidden', tab !== 'envCheck');
  serverPanelObjectsEl.classList.toggle('hidden', tab !== 'objects');
}

/** switchServerTab：处理switch服务端Tab。 */
function switchServerTab(tab: GmServerTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentServerTab：当前服务端Tab。 */
  currentServerTab = tab;
  applyServerTabVisibility(tab);
  if (tab === 'database' && !databaseStateLoading) {
    loadDatabaseState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载数据库状态失败', true);
    });
  }
  if (tab === 'logs' && serverLogsEntries.length === 0 && !serverLogsLoading) {
    loadServerLogs(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载服务端日志失败', true);
    });
  }
  if (tab === 'workers' && !workerState && !workerStateLoading) {
    loadWorkerState(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载 worker 状态失败', true);
    });
  }
  if (tab === 'envCheck' && !envCheckResult && !envCheckLoading) {
    loadEnvCheck(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '环境检测失败', true);
    });
  }
  if (tab === 'traffic') {
    ensureNetworkStatsActive().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '启动流量统计失败', true);
    });
  }
  if (tab === 'memory') {
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载内存画像失败', true);
    });
  }
  if (tab === 'objects' && !objectsLoading) {
    loadObjectCounts().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载对象信息失败', true);
    });
  }
}

/** formatServerLogLine：格式化服务端控制台日志行。 */
function formatServerLogLine(entry: GmServerLogEntry): string {
  const level = entry.level.toUpperCase().padEnd(5, ' ');
  return `[${formatDateTime(entry.at)}] [${level}] ${entry.line}`;
}

/** renderServerLogsPanel：渲染服务端日志面板。 */
function renderServerLogsPanel(): void {
  serverLogsContentEl.textContent = serverLogsEntries.length > 0
    ? serverLogsEntries.map(formatServerLogLine).join('\n')
    : '当前还没有服务端日志。';
  serverLogsLoadOlderBtn.disabled = serverLogsLoading || !serverLogsHasMore;
  serverLogsRefreshBtn.disabled = serverLogsLoading;
  if (serverLogsLoading) {
    serverLogsMetaEl.textContent = '日志读取中…';
    return;
  }
  const moreText = serverLogsHasMore ? '可继续加载更早日志' : '已到当前缓冲起点';
  serverLogsMetaEl.textContent = `已加载 ${serverLogsEntries.length} 行 · 缓冲 ${serverLogsBufferSize} 行 · ${serverLogsEntries.length > 0 ? moreText : '暂无日志'}`;
}

/** loadServerLogs：读取服务端控制台日志。 */
async function loadServerLogs(loadOlder: boolean): Promise<void> {
  if (serverLogsLoading) {
    return;
  }
  const beforeSeq = loadOlder ? serverLogsNextBeforeSeq : undefined;
  if (loadOlder && beforeSeq === undefined) {
    return;
  }

  const previousBottomOffset = serverLogsContentEl.scrollHeight - serverLogsContentEl.scrollTop;
  /** serverLogsLoading：服务端日志读取中。 */
  serverLogsLoading = true;
  renderServerLogsPanel();
  try {
    const data = await request<GmServerLogsRes>(buildGmServerLogsApiPath(beforeSeq));
    if (loadOlder) {
      const existingSeqs = new Set(serverLogsEntries.map((entry) => entry.seq));
      const olderEntries = data.entries.filter((entry) => !existingSeqs.has(entry.seq));
      /** serverLogsEntries：服务端日志已加载行。 */
      serverLogsEntries = [...olderEntries, ...serverLogsEntries];
    } else {
      /** serverLogsEntries：服务端日志已加载行。 */
      serverLogsEntries = data.entries;
    }
    /** serverLogsNextBeforeSeq：服务端日志向上翻页游标。 */
    serverLogsNextBeforeSeq = data.nextBeforeSeq;
    /** serverLogsHasMore：服务端日志是否还有更早行。 */
    serverLogsHasMore = data.hasMore;
    /** serverLogsBufferSize：服务端日志缓冲行数。 */
    serverLogsBufferSize = data.bufferSize;
  } finally {
    /** serverLogsLoading：服务端日志读取中。 */
    serverLogsLoading = false;
    renderServerLogsPanel();
    if (loadOlder) {
      serverLogsContentEl.scrollTop = Math.max(0, serverLogsContentEl.scrollHeight - previousBottomOffset);
    } else {
      serverLogsContentEl.scrollTop = serverLogsContentEl.scrollHeight;
    }
  }
}

const DIAG_HISTORY_KEY = 'gm_diag_history';
const DIAG_HISTORY_MAX = 20;
let diagHistoryIndex = -1;

function diagHistoryLoad(): string[] {
  try {
    const raw = localStorage.getItem(DIAG_HISTORY_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function diagHistoryPush(command: string): void {
  const history = diagHistoryLoad();
  const idx = history.indexOf(command);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(command);
  if (history.length > DIAG_HISTORY_MAX) history.length = DIAG_HISTORY_MAX;
  localStorage.setItem(DIAG_HISTORY_KEY, JSON.stringify(history));
  diagHistoryIndex = -1;
}

function diagHistoryNavigate(direction: 'up' | 'down'): string | null {
  const history = diagHistoryLoad();
  if (history.length === 0) return null;
  if (direction === 'up') {
    if (diagHistoryIndex < history.length - 1) {
      diagHistoryIndex++;
      return history[diagHistoryIndex] ?? null;
    }
    return null;
  }
  if (diagHistoryIndex > 0) {
    diagHistoryIndex--;
    return history[diagHistoryIndex] ?? null;
  }
  if (diagHistoryIndex === 0) {
    diagHistoryIndex = -1;
    return '';
  }
  return null;
}

function renderDiagnosticsPanel(): void {
  const runBtn = getDiagRunBtn();
  const helpBtn = getDiagHelpBtn();
  const metaEl = getDiagMetaEl();
  const outputEl = getDiagOutputEl();
  if (runBtn) runBtn.disabled = serverDiagnosticsLoading;
  if (helpBtn) helpBtn.disabled = serverDiagnosticsLoading;
  if (serverDiagnosticsLoading) {
    if (metaEl) metaEl.textContent = '查询执行中…';
    return;
  }
  if (!lastServerDiagnosticsResult) {
    if (metaEl) metaEl.textContent = '查询尚未执行。';
    if (outputEl) outputEl.innerHTML = '<pre class="server-log-view">可输入 help 查看可用指令。</pre>';
    return;
  }
  const statusText = lastServerDiagnosticsResult.ok ? '成功' : '失败';
  const rowCount = lastServerDiagnosticsResult.resultSets.reduce((sum, resultSet) => sum + resultSet.rowCount, 0);
  if (metaEl) metaEl.textContent = `${statusText} · ${formatDateTime(lastServerDiagnosticsResult.executedAt)} · ${lastServerDiagnosticsResult.durationMs} ms · ${rowCount} 行`;
  if (outputEl) outputEl.innerHTML = renderDiagnosticsResultAsTable(lastServerDiagnosticsResult);
}

function updateUndoButton(): void {
  const btn = getDiagUndoBtn();
  if (btn) {
    btn.disabled = !lastExecCommand;
    if (lastExecCommand) {
      btn.setAttribute('aria-label', `撤回: ${lastExecCommand.slice(0, 80)}`);
    } else {
      btn.removeAttribute('aria-label');
    }
  }
}

function renderDiagnosticsResultAsTable(result: GmDiagnosticsQueryRes): string {
  const parts: string[] = [];
  if (result.message) {
    parts.push(`<div class="diagnostics-meta-bar" style="color:var(--stamp-red);">${escapeHtml(result.message)}</div>`);
  }
  if (result.warnings && result.warnings.length > 0) {
    parts.push(`<div class="diagnostics-meta-bar">${result.warnings.map((w) => escapeHtml(w)).join(' · ')}</div>`);
  }
  for (const resultSet of result.resultSets) {
    parts.push('<div class="diagnostics-result-section">');
    parts.push(`<div class="diagnostics-result-title">${escapeHtml(resultSet.title)} (${resultSet.rowCount}${resultSet.truncated ? '+' : ''} rows)</div>`);
    if (resultSet.rows.length === 0) {
      parts.push('<div class="diagnostics-meta-bar">(empty)</div>');
    } else {
      parts.push(renderResultSetTable(resultSet));
    }
    parts.push('</div>');
  }
  return parts.join('');
}

function renderResultSetTable(resultSet: GmDiagnosticsResultSet): string {
  const columns = resultSet.columns && resultSet.columns.length > 0
    ? resultSet.columns
    : Object.keys(resultSet.rows[0] ?? {});
  const rows: string[] = [];
  rows.push(`<table class="diagnostics-table" data-diag-title="${escapeHtml(resultSet.title)}"><thead><tr>`);
  for (const col of columns) {
    rows.push(`<th>${escapeHtml(col)}</th>`);
  }
  rows.push('</tr></thead><tbody>');
  for (let rowIdx = 0; rowIdx < resultSet.rows.length; rowIdx++) {
    const row = resultSet.rows[rowIdx] as Record<string, unknown>;
    rows.push(`<tr data-row-idx="${rowIdx}">`);
    for (const col of columns) {
      const value = row[col];
      rows.push(renderTableCell(value, col));
    }
    rows.push('</tr>');
  }
  rows.push('</tbody></table>');
  return rows.join('');
}

function renderTableCell(value: unknown, col: string): string {
  const colAttr = `data-col="${escapeHtml(col)}"`;
  if (value === null || value === undefined) {
    return `<td class="cell-null diag-cell-editable" ${colAttr} data-raw-value="NULL">NULL</td>`;
  }
  if (typeof value === 'boolean') {
    return `<td class="cell-bool-${value} diag-cell-editable" ${colAttr} data-raw-value="${value}">${value}</td>`;
  }
  if (typeof value === 'number') {
    return `<td class="cell-number diag-cell-editable" ${colAttr} data-raw-value="${value}">${value}</td>`;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    const display = json.length > 120 ? `${json.slice(0, 120)}…` : json;
    return `<td class="diag-cell-editable" ${colAttr} aria-label="${escapeHtml(json)}" data-raw-value="${escapeHtml(json)}">${escapeHtml(display)}</td>`;
  }
  const str = String(value);
  const display = str.length > 80 ? `${str.slice(0, 80)}…` : str;
  return `<td class="diag-cell-editable" ${colAttr} aria-label="${escapeHtml(str)}" data-raw-value="${escapeHtml(str)}">${escapeHtml(display)}</td>`;
}

const DIAG_PLAYER_HISTORY_KEY = 'gm_diag_player_history';
const DIAG_PLAYER_HISTORY_MAX = 10;

function diagPlayerHistoryLoad(): string[] {
  try {
    const raw = localStorage.getItem(DIAG_PLAYER_HISTORY_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function diagPlayerHistorySave(value: string): void {
  const history = diagPlayerHistoryLoad();
  const idx = history.indexOf(value);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(value);
  if (history.length > DIAG_PLAYER_HISTORY_MAX) history.length = DIAG_PLAYER_HISTORY_MAX;
  localStorage.setItem(DIAG_PLAYER_HISTORY_KEY, JSON.stringify(history));
}

function showDiagPrompt(title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const history = diagPlayerHistoryLoad();
    const overlay = document.createElement('div');
    overlay.className = 'diag-prompt-overlay';

    const box = document.createElement('div');
    box.className = 'diag-prompt-box';

    const titleEl = document.createElement('div');
    titleEl.className = 'diag-prompt-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    const input = document.createElement('input');
    input.className = 'diag-prompt-input';
    input.type = 'text';
    input.placeholder = '输入后回车确认';
    box.appendChild(input);

    if (history.length > 0) {
      const historySection = document.createElement('div');
      historySection.className = 'diag-prompt-history';
      const historyTitle = document.createElement('div');
      historyTitle.className = 'diag-prompt-history-title';
      historyTitle.textContent = '最近使用';
      historySection.appendChild(historyTitle);
      for (const item of history) {
        const row = document.createElement('div');
        row.className = 'diag-prompt-history-item';
        row.textContent = item;
        row.addEventListener('click', () => { cleanup(); diagPlayerHistorySave(item); resolve(item); });
        historySection.appendChild(row);
      }
      box.appendChild(historySection);
    }

    const actions = document.createElement('div');
    actions.className = 'diag-prompt-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'primary';
    confirmBtn.textContent = '确定';
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();

    const cleanup = () => { overlay.remove(); };
    const submit = () => {
      const val = input.value.trim();
      if (!val) { cleanup(); resolve(null); return; }
      cleanup();
      diagPlayerHistorySave(val);
      resolve(val);
    };

    cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve(null); }
    });
  });
}

function startDiagCellEdit(td: HTMLTableCellElement): void {
  const rawValue = td.dataset.rawValue ?? td.textContent ?? '';
  const originalHtml = td.innerHTML;
  const originalClasses = td.className;
  td.className = 'cell-editing';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = rawValue === 'NULL' ? '' : rawValue;
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const cancel = () => {
    td.className = originalClasses;
    td.innerHTML = originalHtml;
  };

  const commit = () => {
    const newValue = input.value;
    if (newValue === rawValue || (rawValue === 'NULL' && newValue === '')) {
      cancel();
      return;
    }
    // 生成 UPDATE SQL 并执行
    const col = td.dataset.col;
    const tr = td.closest('tr');
    const table = td.closest<HTMLTableElement>('table.diagnostics-table');
    const title = table?.dataset.diagTitle ?? '';
    if (!col || !tr || !title) {
      cancel();
      setStatus('无法确定表名或列名', true);
      return;
    }
    const tableName = inferTableName(title);
    if (!tableName) {
      cancel();
      setStatus(`无法从 "${title}" 推断表名，请手动执行 exec`, true);
      return;
    }
    const whereClause = buildWhereFromRow(tr, col);
    if (!whereClause) {
      cancel();
      setStatus('无法确定 WHERE 条件（需要行内有可用主键列）', true);
      return;
    }
    const sqlValue = newValue === '' || newValue.toLowerCase() === 'null' ? 'NULL' : `'${newValue.replace(/'/gu, "''")}'`;
    const sql = `exec UPDATE ${tableName} SET ${col} = ${sqlValue} WHERE ${whereClause}`;
    const cmdEl = getDiagCommandEl();
    if (cmdEl) cmdEl.value = sql;
    cancel();
    runDiagnosticsCommand(sql).catch((err: unknown) => {
      setStatus(err instanceof Error ? err.message : '执行修改失败', true);
    });
  };

  input.addEventListener('blur', cancel, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.removeEventListener('blur', cancel);
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', cancel);
      cancel();
    }
  });
}

function inferTableName(title: string): string {
  // title 格式如 "techniques 454", "inventory xxx", "table outbox_event", "identity (xxx)", "wallet (xxx)"
  const cleaned = title.replace(/\s*\(.*\)\s*$/u, '').trim();
  const parts = cleaned.split(/\s+/u);
  // 预置命令名到表名的映射
  const commandToTable: Record<string, string> = {
    identity: 'server_player_identity',
    inventory: 'player_inventory_item',
    equipment: 'player_equipment_slot',
    techniques: 'player_technique_state',
    quests: 'player_quest_progress',
    buffs: 'player_persistent_buff_state',
    wallet: 'player_wallet',
    counters: 'player_counters',
    mail: 'player_mail',
    presence: 'player_presence',
    snapshot: 'server_player_snapshot',
    'outbox summary': 'outbox_event',
    'outbox topics': 'outbox_event',
    'outbox sample': 'outbox_event',
    deadletter: 'dead_letter_event',
    market: 'server_market_order',
    trades: 'server_market_trade_history',
    flush: 'player_flush_ledger',
    audit: 'asset_audit_log',
  };
  const verb = parts[0]?.toLowerCase() ?? '';
  if (commandToTable[verb]) return commandToTable[verb];
  // "table xxx" 格式
  if (verb === 'table' && parts[1]) return parts[1];
  // 如果 title 本身看起来像表名
  if (/^[a-z_][a-z0-9_]*$/u.test(cleaned)) return cleaned;
  return '';
}

function buildWhereFromRow(tr: HTMLElement, excludeCol: string): string {
  // 优先用常见主键列构建 WHERE
  const primaryKeyCandidates = [
    'player_id', 'item_instance_id', 'event_id', 'mail_id', 'order_id',
    'log_id', 'instance_id', 'slot_type', 'tech_id', 'quest_id',
    'buff_id', 'counter_key', 'wallet_type', 'slot_index',
  ];
  const cells = tr.querySelectorAll<HTMLTableCellElement>('td[data-col]');
  const conditions: string[] = [];
  // 先找主键列
  for (const candidate of primaryKeyCandidates) {
    for (const cell of cells) {
      if (cell.dataset.col === candidate) {
        const val = cell.dataset.rawValue ?? '';
        if (val && val !== 'NULL') {
          conditions.push(`${candidate} = '${val.replace(/'/gu, "''")}'`);
        }
      }
    }
    if (conditions.length > 0) break;
  }
  // 如果没找到主键，用前两个非空非修改列
  if (conditions.length === 0) {
    for (const cell of cells) {
      const col = cell.dataset.col ?? '';
      if (col === excludeCol) continue;
      const val = cell.dataset.rawValue ?? '';
      if (val && val !== 'NULL' && val !== '{}' && val !== '[]') {
        conditions.push(`${col} = '${val.replace(/'/gu, "''")}'`);
        if (conditions.length >= 2) break;
      }
    }
  }
  return conditions.join(' AND ');
}

async function runDiagnosticsCommand(command: string): Promise<void> {
  if (!token || serverDiagnosticsLoading) {
    return;
  }
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    setStatus('请输入查询指令', true);
    return;
  }
  // 在重绘前读取当前 UI 状态
  const limitEl = getDiagLimitEl();
  const currentLimit = limitEl ? Number(limitEl.value) : 50;
  diagHistoryPush(normalizedCommand);
  serverDiagnosticsLoading = true;
  renderDiagnosticsPanel();
  try {
    const requestBody: GmDiagnosticsQueryReq = {
      command: normalizedCommand,
      limit: Number.isFinite(currentLimit) ? Math.trunc(currentLimit) : undefined,
      confirm: true,
    };
    lastServerDiagnosticsResult = await request<GmDiagnosticsQueryRes>(buildGmDiagnosticsQueryApiPath(), {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    // 记录 exec 命令用于撤回
    if (lastServerDiagnosticsResult.ok && normalizedCommand.toLowerCase().startsWith('exec ')) {
      lastExecPreviousCommand = lastExecCommand;
      lastExecCommand = normalizedCommand;
    }
    setStatus(lastServerDiagnosticsResult.ok ? '诊断查询完成' : `诊断查询失败：${lastServerDiagnosticsResult.message ?? '未知错误'}`, !lastServerDiagnosticsResult.ok);
  } finally {
    serverDiagnosticsLoading = false;
    renderDiagnosticsPanel();
    updateUndoButton();
  }
}

/** renderWorkerPoolSection：渲染多线程 Worker Pool 指标到 Worker tab。 */
function renderWorkerPoolSection(wp: any): void {
  const statusEl = document.getElementById('worker-pool-status-meta');
  const containerEl = document.getElementById('worker-pool-all-pools');
  if (!statusEl || !containerEl) return;
  if (!wp || (!wp.encoding && !wp.instance && !wp.persistence)) {
    statusEl.textContent = 'Worker Pool 未启用或数据未就绪（所有开关关闭时走主线程 fallback）';
    containerEl.innerHTML = '';
    return;
  }
  const totalActive = (wp.encoding?.activeWorkers ?? 0) + (wp.instance?.activeWorkers ?? 0) + (wp.persistence?.activeWorkers ?? 0);
  const totalSubmitted = (wp.encoding?.totalSubmitted ?? 0) + (wp.instance?.totalSubmitted ?? 0) + (wp.persistence?.totalSubmitted ?? 0);
  statusEl.textContent = totalActive > 0
    ? `${totalActive} 个 worker 线程活跃 · 累计 ${totalSubmitted} 任务`
    : '所有 Pool 未启用或无活跃 worker';
  const pools = [
    { key: 'encoding', label: 'AOI 编码池', note: 'envelope encode / pathfind / fov' },
    { key: 'instance', label: '实例分片池', note: '怪物 AI 预计算 / 资源流动' },
    { key: 'persistence', label: '持久化序列化池', note: 'JSON.stringify / bigint 转换' },
  ];
  containerEl.innerHTML = pools.map(({ key, label, note }) => {
    const m = wp[key];
    if (!m) return `<div class="note-card">${label}：无数据</div>`;
    const active = m.activeWorkers > 0;
    return `<div class="stats-grid" style="margin-top:10px;">
      <div class="stats-card" style="grid-column:1/-1;"><div class="stats-card-label">${label}</div><div class="stats-card-value" style="color:${active ? '#16a34a' : '#888'}">${active ? m.activeWorkers + ' worker' : '未启用'}</div><div class="stats-card-note">${note}</div></div>
      <div class="stats-card"><div class="stats-card-label">提交</div><div class="stats-card-value">${m.totalSubmitted}</div></div>
      <div class="stats-card"><div class="stats-card-label">完成</div><div class="stats-card-value">${m.totalCompleted}</div></div>
      <div class="stats-card"><div class="stats-card-label">超时</div><div class="stats-card-value">${m.totalTimedOut}</div></div>
      <div class="stats-card"><div class="stats-card-label">失败</div><div class="stats-card-value">${m.totalFailed}</div></div>
      <div class="stats-card"><div class="stats-card-label">Fallback</div><div class="stats-card-value">${m.totalFallback}</div></div>
      <div class="stats-card"><div class="stats-card-label">进行中</div><div class="stats-card-value">${m.inFlight}</div></div>
      <div class="stats-card"><div class="stats-card-label">P50</div><div class="stats-card-value">${m.p50Ms.toFixed(1)} ms</div></div>
      <div class="stats-card"><div class="stats-card-label">P95</div><div class="stats-card-value">${m.p95Ms.toFixed(1)} ms</div></div>
    </div>`;
  }).join('');
}

/** renderWorkerPanel：渲染Worker状态面板。 */
function renderWorkerPanel(): void {
  serverWorkersRefreshBtn.disabled = workerStateLoading;
  if (workerStateLoading) {
    serverWorkersMetaEl.textContent = 'Worker 状态读取中…';
  } else if (workerState) {
    const alertText = workerState.alerts.length > 0 ? `告警 ${workerState.alerts.length} 条` : '暂无告警';
    serverWorkersMetaEl.textContent = `采样 ${formatDateTime(workerState.generatedAt)} · 窗口 ${workerState.windowSeconds}s · ${alertText}`;
  } else {
    serverWorkersMetaEl.textContent = 'Worker 状态尚未加载。';
  }

  if (!workerState) {
    serverWorkersContentEl.innerHTML = '<div class="empty-hint">当前还没有 worker 状态。</div>';
    return;
  }

  const alerts = workerState.alerts.length > 0
    ? `
      <div class="network-breakdown">
        <div class="network-breakdown-head">
          <div class="panel-title">Worker 告警</div>
          <div class="network-breakdown-subtitle">积压、死信和心跳异常会在这里集中显示</div>
        </div>
        <div class="network-breakdown-list">
          ${workerState.alerts.map((alert) => `
            <div class="network-row">
              <div class="network-row-label">${escapeHtml(getWorkerAlertLabel(alert.reason))}</div>
              <div class="network-row-meta">${escapeHtml(alert.workerId)}${alert.count !== undefined ? ` · ${alert.count}` : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '<div class="note-card">当前没有 worker 告警。</div>';
  const rows = workerState.rows.length > 0
    ? workerState.rows.map(getWorkerRowMarkup).join('')
    : '<div class="empty-hint">当前还没有 worker 记录。</div>';

  serverWorkersContentEl.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><div class="panel-title">Worker 总数</div><div class="panel-value">${workerState.rows.length}</div></div>
      <div class="summary-card"><div class="panel-title">活跃/待处理</div><div class="panel-value">${countWorkerRows(workerState.rows, ['active', 'pending'])}</div></div>
      <div class="summary-card"><div class="panel-title">积压总数</div><div class="panel-value">${sumWorkerRows(workerState.rows, 'pendingCount')}</div></div>
      <div class="summary-card"><div class="panel-title">死信</div><div class="panel-value">${sumWorkerRows(workerState.rows, 'deadLetterCount')}</div></div>
    </div>
    <div class="note-card">${escapeHtml(workerState.note ?? 'Worker 面板读取低频诊断快照，不改变 worker 运行。')}</div>
    ${alerts}
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">Worker 工作情况</div>
        <div class="network-breakdown-subtitle">按玩家刷盘、实例刷盘、outbox 和备份 worker 汇总</div>
      </div>
      <div class="network-breakdown-list">${rows}</div>
    </div>
  `;
}

/** loadWorkerState：读取Worker状态。 */
async function loadWorkerState(silent = false): Promise<void> {
  if (!token || workerStateLoading) {
    return;
  }
  workerStateLoading = true;
  renderWorkerPanel();
  try {
    workerState = await request<GmWorkerStateRes>(buildGmWorkersApiPath());
    if (!silent) {
      setStatus(`已刷新 ${workerState.rows.length} 个 worker 状态`);
    }
  } finally {
    workerStateLoading = false;
    renderWorkerPanel();
  }
}

function getEnvCheckStatusText(status: GmEnvCheckResult['groups'][number]['items'][number]['status']): string {
  if (status === 'ok') return '通过';
  if (status === 'warn') return '警告';
  return '异常';
}

function getEnvCheckStatusIcon(status: GmEnvCheckResult['groups'][number]['items'][number]['status']): string {
  if (status === 'ok') return '✅';
  if (status === 'warn') return '⚠️';
  return '❌';
}

function renderEnvCheckPanel(): void {
  serverEnvCheckRefreshBtn.disabled = envCheckLoading;
  serverEnvCheckRefreshBtn.textContent = envCheckLoading ? '检测中…' : '开始检测';

  if (envCheckLoading) {
    serverEnvCheckMetaEl.textContent = '环境检测执行中…';
  } else if (envCheckResult) {
    const { summary } = envCheckResult;
    serverEnvCheckMetaEl.textContent = `检测时间 ${new Date(envCheckResult.checkedAt).toLocaleString()} · 共 ${summary.total} 项 · 通过 ${summary.ok} · 警告 ${summary.warn} · 异常 ${summary.error}`;
  } else {
    serverEnvCheckMetaEl.textContent = '环境检测尚未执行。';
  }

  if (!envCheckResult) {
    serverEnvCheckContentEl.innerHTML = '<div class="empty-hint">点击“开始检测”读取环境状态。</div>';
    return;
  }

  serverEnvCheckContentEl.innerHTML = envCheckResult.groups.map((group) => `
    <div class="network-breakdown" style="margin-top: 12px;">
      <div class="network-breakdown-head">
        <div class="panel-title">${escapeHtml(group.title)}</div>
        <div class="network-breakdown-subtitle">${group.items.length} 项检测</div>
      </div>
      <div class="network-breakdown-list">
        ${group.items.map((item) => `
          <div class="network-row">
            <div>
              <div class="network-row-label">${getEnvCheckStatusIcon(item.status)} ${escapeHtml(item.name)}</div>
              <div class="network-row-meta">${escapeHtml(item.value)}${item.expected ? ` · 期望：${escapeHtml(item.expected)}` : ''}</div>
            </div>
            <div class="network-row-value">${getEnvCheckStatusText(item.status)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function loadEnvCheck(silent = false): Promise<void> {
  if (!token || envCheckLoading) return;
  envCheckLoading = true;
  renderEnvCheckPanel();
  try {
    envCheckResult = await request<GmEnvCheckResult>(buildGmEnvironmentCheckApiPath());
    if (!silent) {
      const { summary } = envCheckResult;
      setStatus(`环境检测完成：异常 ${summary.error} 项，警告 ${summary.warn} 项`);
    }
  } finally {
    envCheckLoading = false;
    renderEnvCheckPanel();
  }
}

async function loadRuntimeFlags(): Promise<void> {
  if (!token || runtimeFlagsLoading) return;
  runtimeFlagsLoading = true;
  renderRuntimeFlagsPanel();
  try {
    const res = await request<{ flags: Array<{ key: string; value: boolean }> }>(`${GM_API_BASE_PATH}/runtime-flags`);
    runtimeFlags = res.flags ?? [];
  } finally {
    runtimeFlagsLoading = false;
    renderRuntimeFlagsPanel();
  }
}

async function toggleRuntimeFlag(key: string, value: boolean): Promise<void> {
  if (!token) return;
  await request(`${GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
  if (key === NETWORK_PAYLOAD_CAPTURE_FLAG_KEY) {
    await loadState(true);
  }
  await loadRuntimeFlags();
}

async function addRuntimeFlag(key: string): Promise<void> {
  if (!token || !key.trim()) return;
  await request(`${GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key.trim())}`, {
    method: 'POST',
    body: JSON.stringify({ value: false }),
  });
  await loadRuntimeFlags();
}

async function deleteRuntimeFlag(key: string): Promise<void> {
  if (!token) return;
  await request(`${GM_API_BASE_PATH}/runtime-flags/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  await loadRuntimeFlags();
}

async function setMaintenanceMode(active: boolean): Promise<void> {
  if (!token) return;
  toggleMaintenanceModeBtn.disabled = true;
  try {
    await request<BasicOkRes & { active?: boolean }>(`${GM_API_BASE_PATH}/maintenance`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    if (state) {
      state = {
        ...state,
        operations: {
          maintenanceActive: active,
          restartRequested: state.operations?.restartRequested === true,
        },
      };
      renderSummary(state);
    }
    await loadState(true);
    setStatus(active ? '已开启维护中' : '已关闭维护中');
  } finally {
    toggleMaintenanceModeBtn.disabled = false;
  }
}

async function restartServer(): Promise<void> {
  if (!token) return;
  restartServerBtn.disabled = true;
  await request<BasicOkRes & { restartRequested?: boolean }>(`${GM_API_BASE_PATH}/server/restart`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (state) {
    state = {
      ...state,
      operations: {
        maintenanceActive: state.operations?.maintenanceActive === true,
        restartRequested: true,
      },
    };
    renderSummary(state);
  }
  setPendingStatus('重启指令已发送，服务即将断开并由外层托管器拉起');
}

function renderRuntimeFlagsPanel(): void {
  // 运行时开关现在渲染到游戏配置页，直接触发游戏配置页重新渲染
  renderGameConfig();
}

/** 生成运行时开关区块的 HTML，供游戏配置页使用 */
function buildRuntimeFlagsHtml(): string {
  if (runtimeFlagsLoading) {
    return '<div class="flag-empty">运行时开关加载中...</div>';
  }
  const merged = mergeRuntimeFlags(runtimeFlags);
  const grouped = groupRuntimeFlags(merged);
  if (merged.length === 0) {
    return '<div class="flag-empty">当前没有运行时开关。</div>';
  }

  const groupsHtml = grouped.map(({ group, flags }) => {
    const rows = flags.map((flag) => {
      const checked = flag.value ? 'checked' : '';
      const badgeClass = flag.value ? 'on' : 'off';
      const badgeText = flag.value ? '已启用' : '已禁用';
      const displayLabel = flag.isPreset && flag.label !== flag.key ? flag.label : '';
      const canDelete = !flag.isPreset && flag.key !== NETWORK_PAYLOAD_CAPTURE_FLAG_KEY
        && !PRESET_FLAGS.some((p) => p.key === flag.key);
      const deleteBtn = canDelete
        ? `<button class="flag-delete-btn" data-flag-delete="${flag.key}" type="button" aria-label="删除此开关">删除</button>`
        : '';
      return `<div class="flag-row" data-flag-row="${flag.key}">
        <label class="flag-toggle" onclick="event.stopPropagation()">
          <input type="checkbox" data-flag-key="${flag.key}" ${checked} />
          <span class="flag-toggle-track"></span>
        </label>
        <div class="flag-info">
          <span class="flag-label">${displayLabel || flag.key}</span>
          ${displayLabel ? `<span class="flag-key">${flag.key}</span>` : ''}
        </div>
        <span class="flag-badge ${badgeClass}">${badgeText}</span>
        ${deleteBtn}
      </div>`;
    });
    return `<div class="flag-group">
      <div class="flag-group-title">${group.label}</div>
      ${rows.join('')}
    </div>`;
  });

  const addRowHtml = `<div class="flag-add-row">
    <input id="gameconfig-flags-new-key" type="text" placeholder="输入新开关 key（如 my_feature_enabled）" />
    <button id="gameconfig-flags-add" class="small-btn" type="button">添加开关</button>
  </div>`;

  return groupsHtml.join('') + addRowHtml;
}

/** 绑定运行时开关区块内的事件 */
function bindRuntimeFlagsEvents(container: HTMLElement): void {
  // 整行点击切换（排除删除按钮区域）
  container.querySelectorAll<HTMLElement>('[data-flag-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-flag-delete]')) return;
      const input = row.querySelector<HTMLInputElement>('input[data-flag-key]');
      if (!input) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // 绑定 toggle 事件
  container.querySelectorAll<HTMLInputElement>('input[data-flag-key]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.flagKey!;
      toggleRuntimeFlag(key, input.checked).catch((err: unknown) => {
        setStatus(err instanceof Error ? err.message : '切换开关失败', true);
      });
    });
  });

  // 绑定删除事件
  container.querySelectorAll<HTMLButtonElement>('[data-flag-delete]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.flagDelete!;
      if (!confirm(`确定删除开关 "${key}" 吗？`)) return;
      deleteRuntimeFlag(key).catch((err: unknown) => {
        setStatus(err instanceof Error ? err.message : '删除开关失败', true);
      });
    });
  });

  // 绑定添加开关事件
  const addInput = container.querySelector<HTMLInputElement>('#gameconfig-flags-new-key');
  const addBtn = container.querySelector<HTMLButtonElement>('#gameconfig-flags-add');
  if (addInput && addBtn) {
    addBtn.addEventListener('click', () => {
      const key = addInput.value.trim();
      if (!key) return;
      addRuntimeFlag(key).then(() => {
        addInput.value = '';
      }).catch((err: unknown) => {
        setStatus(err instanceof Error ? err.message : '添加开关失败', true);
      });
    });
  }
}


function renderObjectsPanel(): void {
  serverObjectsRefreshBtn.disabled = objectsLoading;
  if (objectsLoading) {
    serverObjectsMetaEl.textContent = '加载中...';
    return;
  }
  if (!objectCountsData) {
    serverObjectsMetaEl.textContent = '对象信息尚未加载。';
    serverObjectsContentEl.innerHTML = '<div class="empty-hint">当前没有对象信息。</div>';
    return;
  }
  const t = objectCountsData.totals;
  serverObjectsMetaEl.textContent = `${t.instances} 个实例 · ${t.players} 玩家 · ${t.monsters} 妖兽`;
  const instanceRows = objectCountsData.topInstances.length > 0
    ? objectCountsData.topInstances.map((inst) => `
      <div class="network-row">
        <div class="network-row-label" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(inst.instanceId)}</div>
        <div class="network-row-meta">玩家 ${inst.players} · 妖兽 ${inst.monsters} · NPC ${inst.npcs} · 地标 ${inst.landmarks} · 容器 ${inst.containers} · 地面堆 ${inst.groundPiles}</div>
      </div>
    `).join('')
    : '<div class="empty-hint">无实例数据。</div>';

  serverObjectsContentEl.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><div class="panel-title">地图实例</div><div class="panel-value">${t.instances}</div></div>
      <div class="summary-card"><div class="panel-title">在线玩家</div><div class="panel-value">${t.players}</div></div>
      <div class="summary-card"><div class="panel-title">妖兽</div><div class="panel-value">${t.monsters}</div></div>
      <div class="summary-card"><div class="panel-title">NPC</div><div class="panel-value">${t.npcs}</div></div>
      <div class="summary-card"><div class="panel-title">地标</div><div class="panel-value">${t.landmarks}</div></div>
      <div class="summary-card"><div class="panel-title">容器</div><div class="panel-value">${t.containers}</div></div>
      <div class="summary-card"><div class="panel-title">地面堆</div><div class="panel-value">${t.groundPiles}</div></div>
      <div class="summary-card"><div class="panel-title">待处理指令</div><div class="panel-value">${t.pendingCommands}</div></div>
      <div class="summary-card"><div class="panel-title">刷怪组</div><div class="panel-value">${t.monsterSpawnGroups}</div></div>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">对象数 Top 20 实例</div>
        <div class="network-breakdown-subtitle">按（妖兽+玩家）数量降序</div>
      </div>
      <div class="network-breakdown-list">${instanceRows}</div>
    </div>
  `;
}

async function loadObjectCounts(): Promise<void> {
  if (!token || objectsLoading) return;
  objectsLoading = true;
  renderObjectsPanel();
  try {
    objectCountsData = await request<ObjectCountsResponse>(`${GM_API_BASE_PATH}/world/objects`);
  } finally {
    objectsLoading = false;
    renderObjectsPanel();
  }
}

/** getWorkerRowMarkup：读取Worker行Markup。 */
function getWorkerRowMarkup(row: GmWorkerRow): string {
  const statusLabel = getWorkerStatusLabel(row.status);
  const statusClass = row.status === 'error' || row.status === 'warn' ? ' danger' : '';
  const meta = [
    row.domain ? `域 ${row.domain}` : '',
    row.ownershipEpoch ? `epoch ${row.ownershipEpoch}` : '',
    `待处理 ${row.pendingCount}`,
    `认领 ${row.claimedCount}`,
    `延迟 ${row.delayedCount}`,
    `窗口完成 ${row.writeCount}`,
    `${formatWorkerRate(row.writesPerSecond)}`,
    row.deadLetterCount ? `死信 ${row.deadLetterCount}` : '',
    row.oldestPendingAt ? `最早待处理 ${formatDateTime(row.oldestPendingAt)}` : '',
    row.latestUpdatedAt ? `最近更新 ${formatDateTime(row.latestUpdatedAt)}` : '',
  ].filter(Boolean);
  return `
    <div class="network-row">
      <div class="network-row-label">${escapeHtml(row.label)} <span class="pill${statusClass}">${escapeHtml(statusLabel)}</span></div>
      <div class="network-row-meta">${escapeHtml(meta.join(' · '))}</div>
      ${row.note ? `<div class="editor-note" style="margin-top: 6px;">${escapeHtml(row.note)}</div>` : ''}
    </div>
  `;
}

function getWorkerStatusLabel(status: GmWorkerRow['status']): string {
  switch (status) {
    case 'active':
      return '工作中';
    case 'pending':
      return '待处理';
    case 'idle':
      return '空闲';
    case 'warn':
      return '需关注';
    case 'error':
      return '异常';
    default:
      return '未知';
  }
}

function getWorkerAlertLabel(reason: string): string {
  switch (reason) {
    case 'dead_letter_present':
      return '存在死信';
    case 'backlog_high':
      return '积压过高';
    case 'worker_inactive':
      return 'worker 心跳或活跃状态异常';
    default:
      return reason;
  }
}

function formatWorkerRate(value: number): string {
  return `${Math.max(0, Number(value) || 0).toFixed(3)} /s`;
}

function countWorkerRows(rows: GmWorkerRow[], statuses: GmWorkerRow['status'][]): number {
  return rows.filter((row) => statuses.includes(row.status)).length;
}

function sumWorkerRows(rows: GmWorkerRow[], key: 'pendingCount' | 'deadLetterCount'): number {
  return rows.reduce((total, row) => total + Math.max(0, Number(row[key] ?? 0) || 0), 0);
}

/** formatDatabaseBackupKind：格式化数据库备份种类。 */
function formatDatabaseBackupKind(kind: GmDatabaseBackupRecord['kind']): string {
  switch (kind) {
    case 'hourly':
      return '整点备份';
    case 'daily':
      return '每日备份';
    case 'manual':
      return '手动导出';
    case 'pre_import':
      return '导入前备份';
    case 'uploaded':
      return '本地上传';
    default:
      return kind;
  }
}

/** formatDatabaseBackupFormat：格式化数据库备份格式。 */
function formatDatabaseBackupFormat(format: GmDatabaseBackupRecord['format']): string {
  switch (format) {
    case 'postgres_custom_dump':
      return 'PostgreSQL 自定义备份';
    case 'legacy_json_snapshot':
      return '历史 JSON 快照（硬切后不可恢复）';
    default:
      return '未知格式';
  }
}

function renderCommandsContent(): string {
  const metaText = serverDiagnosticsLoading ? '查询执行中…' : (lastServerDiagnosticsResult
    ? `${lastServerDiagnosticsResult.ok ? '成功' : '失败'} · ${formatDateTime(lastServerDiagnosticsResult.executedAt)} · ${lastServerDiagnosticsResult.durationMs} ms`
    : '查询尚未执行。');
  const outputHtml = lastServerDiagnosticsResult
    ? renderDiagnosticsResultAsTable(lastServerDiagnosticsResult)
    : '<pre class="server-log-view">可输入 help 查看可用指令。</pre>';
  return `
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">数据库查询与操作</div>
        <div class="network-breakdown-subtitle">支持 help 查看全部指令；只读查询自动 READ ONLY，写操作需勾选确认。</div>
      </div>
      <div class="diagnostics-shortcuts" id="diagnostics-shortcuts">
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">玩家</span>
          <button type="button" class="diag-btn" data-diag-cmd="presence">在线列表</button>
          <button type="button" class="diag-btn" data-diag-cmd="presence all">全量状态</button>
          <button type="button" class="diag-btn" data-diag-cmd="player " data-diag-prompt="player_id / username / 角色名 / 序号">查玩家</button>
          <button type="button" class="diag-btn" data-diag-cmd="inventory " data-diag-prompt="player_id / 角色名">背包</button>
          <button type="button" class="diag-btn" data-diag-cmd="equipment " data-diag-prompt="player_id / 角色名">装备</button>
          <button type="button" class="diag-btn" data-diag-cmd="techniques " data-diag-prompt="player_id / 角色名">功法</button>
          <button type="button" class="diag-btn" data-diag-cmd="quests " data-diag-prompt="player_id / 角色名">任务</button>
          <button type="button" class="diag-btn" data-diag-cmd="buffs " data-diag-prompt="player_id / 角色名">Buff</button>
          <button type="button" class="diag-btn" data-diag-cmd="wallet " data-diag-prompt="player_id / 角色名">钱包</button>
          <button type="button" class="diag-btn" data-diag-cmd="counters " data-diag-prompt="player_id / 角色名">计数器</button>
          <button type="button" class="diag-btn" data-diag-cmd="mail " data-diag-prompt="player_id / 角色名">邮件</button>
          <button type="button" class="diag-btn" data-diag-cmd="audit " data-diag-prompt="player_id / 角色名">审计</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">世界</span>
          <button type="button" class="diag-btn" data-diag-cmd="instances">实例摘要</button>
          <button type="button" class="diag-btn" data-diag-cmd="instances active">活跃实例</button>
          <button type="button" class="diag-btn" data-diag-cmd="market">市场挂单</button>
          <button type="button" class="diag-btn" data-diag-cmd="trades">最近成交</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">运维</span>
          <button type="button" class="diag-btn" data-diag-cmd="outbox">Outbox</button>
          <button type="button" class="diag-btn" data-diag-cmd="flush">脏数据队列</button>
          <button type="button" class="diag-btn" data-diag-cmd="deadletter">死信</button>
          <button type="button" class="diag-btn" data-diag-cmd="tables">表大小</button>
        </div>
        <div class="diagnostics-shortcut-group">
          <span class="diagnostics-shortcut-label">数据库</span>
          <button type="button" class="diag-btn" data-diag-cmd="dbsize">DB 大小</button>
          <button type="button" class="diag-btn" data-diag-cmd="connections">连接数</button>
          <button type="button" class="diag-btn" data-diag-cmd="locks">锁等待</button>
          <button type="button" class="diag-btn" data-diag-cmd="slowqueries">慢查询</button>
          <button type="button" class="diag-btn" data-diag-cmd="replication">复制状态</button>
        </div>
      </div>
      <div class="server-log-toolbar">
        <textarea id="server-diagnostics-command" rows="3" placeholder="输入命令或点击上方快捷按钮，Ctrl+Enter 执行，↑↓ 切换历史&#10;写操作示例：exec UPDATE player_wallet SET balance = 1000 WHERE player_id = 'xxx'" style="width:100%; min-height:68px; resize:vertical;"></textarea>
      </div>
      <div class="server-log-toolbar">
        <input id="server-diagnostics-limit" type="number" min="1" max="200" value="50" style="width:90px;" />
        <button id="server-diagnostics-run" class="small-btn primary" type="button">执行</button>
        <button id="server-diagnostics-help" class="small-btn" type="button">帮助</button>
        <button id="server-diagnostics-undo" class="small-btn" type="button" disabled>撤回</button>
        <div id="server-diagnostics-meta" class="server-log-meta">${escapeHtml(metaText)}</div>
      </div>
      <div id="server-diagnostics-output" class="diagnostics-output-container">${outputHtml}</div>
    </div>
  `;
}

/** renderDatabasePanel：渲染数据库面板。 */
function renderDatabasePanel(force = false): void {
  // 指令子 tab：如果 DOM 已存在且非强制刷新，跳过重绘以保留 textarea 内容和查询结果
  if (databaseSubTab === 'commands' && !force && getDiagCommandEl()) {
    return;
  }

  const subTabBar = `
    <div class="button-row">
      <button class="small-btn ${databaseSubTab === 'commands' ? 'primary' : ''}" data-db-subtab="commands" type="button">指令</button>
      <button class="small-btn ${databaseSubTab === 'backup' ? 'primary' : ''}" data-db-subtab="backup" type="button">备份管理</button>
      <button class="small-btn ${databaseSubTab === 'table-stats' ? 'primary' : ''}" data-db-subtab="table-stats" type="button">表占用分析</button>
    </div>
  `;

  if (databaseSubTab === 'commands') {
    serverPanelDatabaseEl.innerHTML = subTabBar + renderCommandsContent();
    renderDiagnosticsPanel();
    return;
  }

  if (databaseSubTab === 'table-stats') {
    serverPanelDatabaseEl.innerHTML = subTabBar + renderTableStatsContent();
    return;
  }

  const busy = databaseState?.runningJob?.status === 'running' || databaseImportBusy;
  const backups = databaseState?.backups ?? [];
  const importStatus = databaseImportStatus
    ? databaseImportStatus
    : '只接受新版 PostgreSQL 自定义备份（.dump 或 .dump.gz）。上传后会进入下方备份列表；选择"上传并导入"会继续走同一套数据库恢复流程。';
  const rows = backups.length > 0
    ? backups.map((backup) => `
        <div class="network-row">
          <div class="network-row-label">${escapeHtml(backup.fileName)}</div>
          <div class="network-row-meta">
            ${escapeHtml(formatDatabaseBackupKind(backup.kind))} · ${escapeHtml(formatDatabaseBackupFormat(backup.format))} · ${escapeHtml(formatDateTime(backup.createdAt))} · ${escapeHtml(formatBytes(backup.sizeBytes))}
          </div>
          <div class="button-row" style="margin-top:8px;">
            <button class="small-btn" data-db-download="${escapeHtml(backup.id)}" type="button">下载备份</button>
            <button class="small-btn danger" data-db-restore="${escapeHtml(backup.id)}" type="button" ${busy || backup.format !== 'postgres_custom_dump' ? 'disabled' : ''}>恢复数据库备份</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-hint">当前还没有持久化备份。</div>';

  serverPanelDatabaseEl.innerHTML = subTabBar + `
    <div class="button-row">
      <button id="database-refresh" class="small-btn" type="button">刷新持久化状态</button>
      <button id="database-export-current" class="small-btn primary" type="button" ${busy ? 'disabled' : ''}>导出数据库备份</button>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">导入本地数据库备份</div>
        <div class="network-breakdown-subtitle">上传新版 PostgreSQL 自定义备份，登记到当前 GM 备份目录；可直接执行恢复</div>
      </div>
      <div class="filter-row" style="margin-top: 10px;">
        <span id="database-import-file-slot"></span>
        <button id="database-upload-backup" class="small-btn" type="button" ${busy ? 'disabled' : ''}>上传到备份列表</button>
        <button id="database-upload-and-restore" class="small-btn danger" type="button" ${busy ? 'disabled' : ''}>上传并导入</button>
      </div>
      <div id="database-import-status" class="editor-note" style="margin-top:8px;">${escapeHtml(importStatus)}</div>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">历史持久化备份</div>
        <div class="network-breakdown-subtitle">支持下载任意历史备份，也支持把某份备份重新恢复到当前主线数据库</div>
      </div>
      <div class="network-breakdown-list">${rows}</div>
    </div>
  `;

  // 将持久化的 file input 插入占位容器，保证节点不被销毁、change 事件始终有效
  const slot = serverPanelDatabaseEl.querySelector<HTMLSpanElement>('#database-import-file-slot');
  if (slot) {
    persistentFileInput.disabled = busy;
    slot.replaceWith(persistentFileInput);
  }
}

function renderTableStatsContent(): string {
  if (tableStatsLoading) {
    return '<div class="note-card">正在加载表占用统计…</div>';
  }
  if (!tableStatsState) {
    return `
      <div class="button-row">
        <button class="small-btn primary" data-action="load-table-stats" type="button">加载表占用统计</button>
      </div>
      <div class="empty-hint">点击上方按钮查询各表占用情况。</div>
    `;
  }
  const tables = tableStatsState.tables;
  const tableRows = tables.map((t) => {
    const cleanupAllowed = t.cleanupAllowed === true;
    const cleanupOlderThanAllowed = cleanupAllowed && t.cleanupOlderThanAllowed === true;
    const cleanupMeta = cleanupAllowed
      ? `可清理${t.cleanupTimeColumn ? ` · 时间列 ${t.cleanupTimeColumn}` : ''}`
      : (t.cleanupBlockedReason || '真源保护');
    return `
      <div class="network-row">
        <div class="network-row-label">${escapeHtml(t.tableName)}</div>
        <div class="network-row-meta">行数(估) ${escapeHtml(String(t.rowEstimate))} · 总大小 ${escapeHtml(t.totalSize)} · 数据 ${escapeHtml(t.tableSize)} · 索引 ${escapeHtml(t.indexSize)} · ${escapeHtml(cleanupMeta)}</div>
        ${cleanupAllowed ? `
          <div class="button-row" style="margin-top:4px;">
            <button class="small-btn danger" ${cleanupOlderThanAllowed ? `data-cleanup-target="${escapeHtml(t.tableName)}" data-cleanup-mode="older_than"` : 'aria-label="缺少可按时间清理的列"'} type="button" ${cleanupBusy || !cleanupOlderThanAllowed ? 'disabled' : ''}>清理 7 天前数据</button>
            <button class="small-btn danger" data-cleanup-target="${escapeHtml(t.tableName)}" data-cleanup-mode="all" type="button" ${cleanupBusy ? 'disabled' : ''}>直接清空</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="button-row">
      <button class="small-btn primary" data-action="load-table-stats" type="button">刷新统计</button>
    </div>
    <div class="note-card">总占用: ${escapeHtml(tableStatsState.totalSize)} · 统计时间: ${escapeHtml(formatDateTime(tableStatsState.fetchedAt))}</div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">各表占用明细</div>
        <div class="network-breakdown-subtitle">除真实落盘数据表外，可清理 7 天前数据，也可直接清空整表；实际权限由服务端保护</div>
      </div>
      <div class="network-breakdown-list">${tableRows}</div>
    </div>
  `;
}

async function loadTableStats(): Promise<void> {
  if (!token) return;
  tableStatsLoading = true;
  renderDatabasePanel();
  try {
    tableStatsState = await request<GmDatabaseTableStatsRes>(`${GM_API_BASE_PATH}/database/table-stats`);
    setStatus('表占用统计已加载');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '加载表占用统计失败', true);
  } finally {
    tableStatsLoading = false;
    renderDatabasePanel();
  }
}

async function cleanupTable(target: string, mode: GmDatabaseCleanupReq['mode'] = 'older_than'): Promise<void> {
  if (!token || cleanupBusy) return;
  cleanupBusy = true;
  renderDatabasePanel();
  try {
    const requestBody: GmDatabaseCleanupReq = mode === 'all'
      ? { target, mode }
      : { target, mode: 'older_than', olderThanDays: 7 };
    const result = await request<GmDatabaseCleanupRes>(`${GM_API_BASE_PATH}/database/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    setStatus(result.message);
    await loadTableStats();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '清理失败', true);
  } finally {
    cleanupBusy = false;
    renderDatabasePanel();
  }
}

/** renderRedeemPanel：渲染兑换面板。 */
function renderRedeemPanel(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!redeemGroupListEl || !redeemGroupEditorEl || !redeemCodeListEl) {
    return;
  }

  const selectedGroupId = selectedRedeemGroupId;
  redeemStatusEl && (redeemStatusEl.textContent = redeemLoading ? '正在同步兑换码数据…' : (redeemLatestGeneratedCodes.length > 0 ? `最近生成 ${redeemLatestGeneratedCodes.length} 个兑换码` : '兑换码变更会直接写数据库，但数据库备份不会包含兑换码表。'));

  redeemGroupListEl.innerHTML = redeemGroupsState.length > 0
    ? redeemGroupsState.map((group) => `
      <button
        class="player-row${selectedGroupId === group.id ? ' active' : ''}"
        type="button"
        data-redeem-group-id="${group.id}"
      >
        <div class="player-top">
          <span class="player-name">${escapeHtml(group.name)}</span>
          <span class="pill">${group.usedCodeCount} / ${group.totalCodeCount}</span>
        </div>
        <div class="player-meta">可用 ${group.activeCodeCount} 个 · 已用 ${group.usedCodeCount} 个 · 奖励 ${group.rewards.length} 项</div>
      </button>
    `).join('')
    : '<div class="empty-hint">当前还没有兑换码分组。</div>';

  const editingExisting = !!redeemGroupDetailState && redeemGroupDetailState.group.id === selectedGroupId;
  const groupMeta = redeemGroupDetailState?.group ?? null;
  const rewardRows = redeemDraft.rewards.length > 0
    ? redeemDraft.rewards.map((reward, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(getMailAttachmentTitle(reward.itemId, `奖励 ${index + 1}`))}</div>
            <div class="editor-card-meta">${escapeHtml(getMailAttachmentRowMeta(reward.itemId))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-redeem-reward" data-reward-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${searchableItemField(
            '物品模板',
            reward.itemId,
            'all',
            { 'data-redeem-bind': `rewards.${index}.itemId` },
            'wide',
          )}
          <label class="editor-field">
            <span>数量</span>
            <input type="number" min="1" value="${Math.max(1, Math.floor(reward.count || 1))}" data-redeem-bind="rewards.${index}.count" />
          </label>
        </div>
      </div>
    `).join('')
    : '<div class="empty-hint">请至少添加一个奖励物品。</div>';

  redeemGroupEditorEl.innerHTML = `
    <div class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">${editingExisting ? '编辑分组' : '新建分组'}</div>
          <div class="editor-section-note">分组奖励可随时编辑；新增兑换码会继承当前分组奖励。</div>
        </div>
        <button class="small-btn" type="button" data-action="new-redeem-group">新建空白分组</button>
      </div>
      ${groupMeta ? `<div class="note-card" style="margin-bottom: 12px;">总码数 ${groupMeta.totalCodeCount} · 已使用 ${groupMeta.usedCodeCount} · 可用 ${groupMeta.activeCodeCount} · 创建于 ${escapeHtml(formatDateTime(groupMeta.createdAt))}</div>` : ''}
      <div class="editor-grid compact">
        <label class="editor-field wide">
          <span>分组名称</span>
          <input type="text" value="${escapeHtml(redeemDraft.name)}" data-redeem-bind="name" />
        </label>
        ${editingExisting ? `
        <label class="editor-field">
          <span>追加数量</span>
          <input type="number" min="1" max="500" value="${escapeHtml(redeemDraft.appendCount)}" data-redeem-bind="appendCount" />
        </label>
        ` : `
        <label class="editor-field">
          <span>初始生成数量</span>
          <input type="number" min="1" max="500" value="${escapeHtml(redeemDraft.createCount)}" data-redeem-bind="createCount" />
        </label>
        `}
      </div>
      <div class="editor-section" style="margin-top: 12px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">奖励列表</div>
            <div class="editor-section-note">每个兑换码都会按这里的奖励逐项发放到背包。</div>
          </div>
          <button class="small-btn" type="button" data-action="add-redeem-reward">新增奖励</button>
        </div>
        <div class="editor-card-list">${rewardRows}</div>
      </div>
      <div class="button-row" style="margin-top: 12px;">
        <button class="small-btn primary" type="button" data-action="${editingExisting ? 'save-redeem-group' : 'create-redeem-group'}">${editingExisting ? '保存分组' : '创建分组并生成兑换码'}</button>
        ${editingExisting ? '<button class="small-btn" type="button" data-action="append-redeem-codes">追加兑换码</button>' : ''}
        <button class="small-btn" type="button" data-action="refresh-redeem-groups">刷新</button>
      </div>
      ${redeemLatestGeneratedCodes.length > 0 ? `
      <div class="editor-section" style="margin-top: 12px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">最近生成的兑换码</div>
            <div class="editor-section-note">创建或追加后会在这里展示本次生成结果。</div>
          </div>
        </div>
        <textarea class="editor-textarea" spellcheck="false" readonly>${escapeHtml(redeemLatestGeneratedCodes.join('\n'))}</textarea>
      </div>
      ` : ''}
    </div>
  `;
  syncSearchableItemFields(redeemGroupEditorEl);

  const codeItems = redeemGroupDetailState?.codes ?? [];
  const activeCodeCount = codeItems.filter((code) => code.status === 'active').length;
  redeemCodeListEl.innerHTML = redeemGroupDetailState
    ? `
      <div class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">兑换码列表</div>
            <div class="editor-section-note">当前分组共 ${codeItems.length} 个兑换码，其中 ${activeCodeCount} 个未使用。</div>
          </div>
          <button class="small-btn" type="button" data-action="copy-active-redeem-codes" ${activeCodeCount > 0 ? '' : 'disabled'}>复制全部未使用</button>
        </div>
        <div class="network-breakdown-list">
          ${codeItems.length > 0
            ? codeItems.map((code) => getRedeemCodeMarkup(code)).join('')
            : '<div class="empty-hint">当前分组还没有兑换码。</div>'}
        </div>
      </div>
    `
    : '<div class="empty-hint">请选择一个分组查看兑换码。</div>';
}

/** getRedeemCodeMarkup：读取兑换兑换码Markup。 */
function getRedeemCodeMarkup(code: RedeemCodeCodeView): string {
  return gmMarkupHelpers.getRedeemCodeMarkup(code, formatDateTime);
}

/** copyTextToClipboard：复制文本To Clipboard。 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 某些浏览器或非安全上下文会拒绝 Clipboard API，此时回退到 execCommand。
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

/** copyActiveRedeemCodes：复制活跃兑换兑换码。 */
async function copyActiveRedeemCodes(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const group = redeemGroupDetailState?.group;
  const activeCodes = (redeemGroupDetailState?.codes ?? [])
    .filter((code) => code.status === 'active')
    .map((code) => code.code.trim())
    .filter((code) => code.length > 0);
  if (activeCodes.length === 0) {
    setStatus(t('gm.redeem.active-empty'), true);
    return;
  }
  const copied = await copyTextToClipboard(activeCodes.join('\n'));
  if (!copied) {
    setStatus(t('gm.redeem.copy-failed'), true);
    return;
  }
  setStatus(group
    ? t('gm.redeem.copied-with-group', { count: activeCodes.length, groupName: group.name })
    : t('gm.redeem.copied', { count: activeCodes.length }));
}

/** getRedeemCodeStatusLabel：读取兑换兑换码状态标签。 */
function getRedeemCodeStatusLabel(status: RedeemCodeCodeView['status']): string {
  return gmMarkupHelpers.getRedeemCodeStatusLabel(status);
}

/** buildRedeemGroupPayload：构建兑换分组载荷。 */
function buildRedeemGroupPayload(): {
/**
 * name：名称名称或显示文本。
 */
 name: string;
 /**
 * rewards：reward相关字段。
 */
 rewards: RedeemCodeGroupRewardItem[] } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const name = redeemDraft.name.trim();
  const rewards = redeemDraft.rewards
    .filter((entry) => entry.itemId.trim().length > 0 && Number.isFinite(entry.count) && entry.count > 0)
    .map((entry) => ({
      itemId: entry.itemId.trim(),
      count: Math.max(1, Math.floor(entry.count)),
    }));
  if (!name) {
    throw new Error(t('gm.redeem.group-name-empty'));
  }
  if (rewards.length === 0) {
    throw new Error(t('gm.redeem.reward-empty'));
  }
  return { name, rewards };
}

/** loadRedeemGroups：加载兑换分组。 */
async function loadRedeemGroups(silent = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** redeemLoading：兑换Loading。 */
  redeemLoading = true;
  renderRedeemPanel();
  try {
    const data = await request<GmRedeemCodeGroupListRes>(`${GM_API_BASE_PATH}/redeem-code-groups`);
    /** redeemGroupsState：兑换分组状态。 */
    redeemGroupsState = data.groups;
    if (selectedRedeemGroupId && !redeemGroupsState.some((group) => group.id === selectedRedeemGroupId)) {
      selectedRedeemGroupId = null;
      redeemGroupDetailState = null;
      redeemDraft = createDefaultRedeemGroupDraft();
    }
    if (!selectedRedeemGroupId && redeemGroupsState[0]) {
      selectedRedeemGroupId = redeemGroupsState[0].id;
    }
    if (selectedRedeemGroupId) {
      await loadRedeemGroupDetail(selectedRedeemGroupId, true);
    } else {
      renderRedeemPanel();
    }
    if (!silent) {
      setStatus(t('gm.redeem.synced', { count: redeemGroupsState.length }));
    }
  } finally {
    /** redeemLoading：兑换Loading。 */
    redeemLoading = false;
    renderRedeemPanel();
  }
}

/** loadRedeemGroupDetail：加载兑换分组详情。 */
async function loadRedeemGroupDetail(groupId: string, silent = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** redeemLoading：兑换Loading。 */
  redeemLoading = true;
  renderRedeemPanel();
  try {
    const detail = await request<GmRedeemCodeGroupDetailRes>(`${GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(groupId)}`);
    if (selectedRedeemGroupId !== groupId) {
      return;
    }
    /** redeemGroupDetailState：兑换分组详情状态。 */
    redeemGroupDetailState = detail;
    redeemDraft = {
      name: detail.group.name,
      rewards: detail.group.rewards.map((entry) => ({ ...entry })),
      createCount: '10',
      appendCount: '10',
    };
    if (!silent) {
      setStatus(t('gm.redeem.loaded', { groupName: detail.group.name }));
    }
  } finally {
    /** redeemLoading：兑换Loading。 */
    redeemLoading = false;
    renderRedeemPanel();
  }
}

/** createRedeemGroup：创建兑换分组。 */
async function createRedeemGroup(): Promise<void> {
  const payloadBase = buildRedeemGroupPayload();
  const payload: GmCreateRedeemCodeGroupReq = {
    ...payloadBase,
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.createCount || '0')) || 0)),
  };
  const result = await request<GmCreateRedeemCodeGroupRes>(`${GM_API_BASE_PATH}/redeem-code-groups`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** selectedRedeemGroupId：selected兑换分组ID。 */
  selectedRedeemGroupId = result.group.id;
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(t('gm.redeem.created', { groupName: result.group.name, count: result.codes.length }));
}

/** saveRedeemGroup：保存兑换分组。 */
async function saveRedeemGroup(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedRedeemGroupId) {
    throw new Error(t('gm.redeem.selected-group-required'));
  }
  const payload: GmUpdateRedeemCodeGroupReq = buildRedeemGroupPayload();
  await request<GmRedeemCodeGroupDetailRes>(`${GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [];
  await loadRedeemGroups(true);
  setStatus(t('gm.redeem.saved'));
}

/** appendRedeemCodes：处理append兑换兑换码。 */
async function appendRedeemCodes(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedRedeemGroupId) {
    throw new Error(t('gm.redeem.selected-group-required'));
  }
  const payload: GmAppendRedeemCodesReq = {
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.appendCount || '0')) || 0)),
  };
  const result = await request<GmAppendRedeemCodesRes>(`${GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}/codes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(t('gm.redeem.appended', { count: result.codes.length }));
}

/** destroyRedeemCode：处理destroy兑换兑换码。 */
async function destroyRedeemCode(codeId: string): Promise<void> {
  await request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/redeem-codes/${encodeURIComponent(codeId)}`, {
    method: 'DELETE',
  });
  await loadRedeemGroups(true);
  setStatus(t('gm.redeem.destroyed'));
}

/** loadDatabaseState：加载数据库状态。 */
async function loadDatabaseState(silent = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!token) {
    return;
  }
  /** databaseStateLoading：数据库状态Loading。 */
  databaseStateLoading = true;
  renderDatabasePanel();
  try {
    const data = await request<GmDatabaseStateRes>(`${GM_API_BASE_PATH}/database/state`);
    /** databaseState：数据库状态。 */
    databaseState = data;
    if (!silent) {
      setStatus(t('gm.database.synced-backups', { count: data.backups.length }));
    }
  } finally {
    /** databaseStateLoading：数据库状态Loading。 */
    databaseStateLoading = false;
    renderDatabasePanel();
  }
}

/** exportCurrentDatabase：处理export当前数据库。 */
async function exportCurrentDatabase(): Promise<void> {
  const result = await request<GmTriggerDatabaseBackupRes>(`${GM_API_BASE_PATH}/database/backup`, {
    method: 'POST',
  });
  setStatus(t('gm.database.export-started', { backupId: result.job.backupId ?? result.job.id }));
  await loadDatabaseState(true);
}

/** getSelectedDatabaseImportFile：读取数据库导入文件。 */
function getSelectedDatabaseImportFile(): File | null {
  const liveFile = persistentFileInput.files?.[0] ?? null;
  if (liveFile) {
    selectedDatabaseImportFile = liveFile;
  }
  return liveFile ?? selectedDatabaseImportFile;
}

/** patchDatabaseImportStatus：局部更新数据库导入状态提示。 */
function patchDatabaseImportStatus(message: string): void {
  databaseImportStatus = message;
  const statusEl = serverPanelDatabaseEl.querySelector<HTMLDivElement>('#database-import-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

/** isSupportedDatabaseImportFile：判断数据库导入文件扩展名是否受支持。 */
function isSupportedDatabaseImportFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith('.dump') || lowerName.endsWith('.dump.gz');
}

/** updateDatabaseImportFileSelection：处理数据库导入文件选择变化。 */
function updateDatabaseImportFileSelection(file: File | null): void {
  selectedDatabaseImportFile = file;
  if (!file) {
    patchDatabaseImportStatus(t('gm.database.import.no-file'));
    return;
  }

  const fileLabel = `${file.name}（${formatBytes(file.size)}）`;
  if (!isSupportedDatabaseImportFile(file)) {
    patchDatabaseImportStatus(t('gm.database.import.file-selected-unsupported', { fileLabel }));
    setStatus(t('gm.database.import.unsupported'), true);
    return;
  }

  patchDatabaseImportStatus(t('gm.database.import.file-selected-ready', { fileLabel }));
  setStatus(t('gm.database.import.selected', { fileName: file.name }));
}

/** uploadDatabaseBackupFile：上传数据库备份文件。 */
async function uploadDatabaseBackupFile(restoreAfterUpload: boolean): Promise<void> {
  const file = getSelectedDatabaseImportFile();
  if (!file) {
    setStatus(t('gm.database.import.choose-file'), true);
    patchDatabaseImportStatus(t('gm.database.import.no-file'));
    return;
  }
  if (!isSupportedDatabaseImportFile(file)) {
    setStatus(t('gm.database.import.unsupported'), true);
    patchDatabaseImportStatus(t('gm.database.import.file-unsupported', { fileName: file.name }));
    return;
  }
  if (restoreAfterUpload) {
    const confirmed = window.confirm(t('gm.database.import.confirm-upload', { fileName: file.name }));
    if (!confirmed) {
      return;
    }
  }

  databaseImportBusy = true;
  databaseImportStatus = t('gm.database.import.uploading', { fileName: file.name, fileSize: formatBytes(file.size) });
  renderDatabasePanel();
  try {
    const result = await request<GmUploadDatabaseBackupRes>(`${GM_API_BASE_PATH}/database/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Backup-Filename': encodeURIComponent(file.name),
        'X-Backup-Size': String(file.size),
      },
      body: file,
    });
    selectedDatabaseImportFile = null;
    databaseImportStatus = t('gm.database.import.uploaded-with-size', { fileName: result.backup.fileName, fileSize: formatBytes(result.backup.sizeBytes) });
    setStatus(t('gm.database.uploaded', { fileName: result.backup.fileName }));
    await loadDatabaseState(true);
    if (restoreAfterUpload) {
      await restoreDatabaseBackup(result.backup.id, {
        skipConfirm: true,
        fallbackFileName: result.backup.fileName,
      });
    }
  } finally {
    databaseImportBusy = false;
    renderDatabasePanel();
  }
}

/** getDownloadFileName：读取Download File名称。 */
function getDownloadFileName(response: Response, fallback: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const header = response.headers.get('content-disposition') ?? '';
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = header.match(/filename="?([^";]+)"?/iu);
  return basicMatch?.[1] ?? fallback;
}

/** downloadDatabaseBackup：处理download数据库备份。 */
async function downloadDatabaseBackup(backupId: string): Promise<void> {
  const response = await requestBlob(buildGmDatabaseBackupDownloadApiPath(backupId));
  const blob = await response.blob();
  const fileName = getDownloadFileName(response, `${backupId}.dump`);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  setStatus(t('gm.database.downloaded', { fileName }));
}

/** restoreDatabaseBackup：处理restore数据库备份。 */
async function restoreDatabaseBackup(
  backupId: string,
  options: { skipConfirm?: boolean; fallbackFileName?: string } = {},
): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const backup = databaseState?.backups.find((entry) => entry.id === backupId);
  if (!backup && !options.fallbackFileName) {
    setStatus(t('gm.database.target-missing'), true);
    return;
  }
  if (backup && backup.format !== 'postgres_custom_dump') {
    setStatus(t('gm.database.restore.unsupported-history'), true);
    return;
  }
  const fileName = backup?.fileName ?? options.fallbackFileName ?? backupId;
  const confirmed = options.skipConfirm === true
    ? true
    : window.confirm(t('gm.database.restore.confirm', { fileName }));
  if (!confirmed) {
    return;
  }
  const body: GmRestoreDatabaseReq = { backupId };
  const result = await request<GmTriggerDatabaseBackupRes>(`${GM_API_BASE_PATH}/database/restore`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setStatus(t('gm.database.restore.started', { backupId: result.job.sourceBackupId ?? fileName }));
  await loadDatabaseState(true);
}

/** setCpuBreakdownSort：处理set Cpu Breakdown排序。 */
function setCpuBreakdownSort(sort: 'total' | 'count' | 'avg'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentCpuBreakdownSort：当前Cpu Breakdown排序。 */
  currentCpuBreakdownSort = sort;
  cpuBreakdownSortTotalBtn.classList.toggle('primary', sort === 'total');
  cpuBreakdownSortCountBtn.classList.toggle('primary', sort === 'count');
  cpuBreakdownSortAvgBtn.classList.toggle('primary', sort === 'avg');
  if (state) {
    /** lastCpuBreakdownStructureKey：last Cpu Breakdown Structure Key。 */
    lastCpuBreakdownStructureKey = null;
    renderPerfLists(state);
  }
}

/** switchTab：处理switch Tab。 */
function switchTab(tab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts' | 'secrets' | 'gameconfig' | 'ai' | 'trades'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  // 离开世界管理时停止轮询
  if (currentTab === 'world' && tab !== 'world') {
    worldViewer.stopPolling();
  }
  /** currentTab：当前Tab。 */
  currentTab = tab;
  serverTabBtn.classList.toggle('active', tab === 'server');
  redeemTabBtn.classList.toggle('active', tab === 'redeem');
  playerTabBtn.classList.toggle('active', tab === 'players');
  worldTabBtn.classList.toggle('active', tab === 'world');
  shortcutTabBtn.classList.toggle('active', tab === 'shortcuts');
  suggestionTabBtn.classList.toggle('active', tab === 'suggestions');
  envTabBtn.classList.toggle('active', tab === 'secrets');
  gameConfigTabBtn.classList.toggle('active', tab === 'gameconfig');
  aiTabBtn.classList.toggle('active', tab === 'ai');
  tradesTabBtn.classList.toggle('active', tab === 'trades');
  serverWorkspaceEl.classList.toggle('hidden', tab !== 'server');
  redeemWorkspaceEl.classList.toggle('hidden', tab !== 'redeem');
  playerWorkspaceEl.classList.toggle('hidden', tab !== 'players');
  worldWorkspaceEl.classList.toggle('hidden', tab !== 'world');
  shortcutWorkspaceEl.classList.toggle('hidden', tab !== 'shortcuts');
  suggestionWorkspaceEl.classList.toggle('hidden', tab !== 'suggestions');
  envWorkspaceEl.classList.toggle('hidden', tab !== 'secrets');
  gameConfigWorkspaceEl.classList.toggle('hidden', tab !== 'gameconfig');
  aiWorkspaceEl.classList.toggle('hidden', tab !== 'ai');
  tradesWorkspaceEl.classList.toggle('hidden', tab !== 'trades');
  if (tab === 'suggestions') {
    loadSuggestions().catch((e) => console.error('[GM]', e));
  } else if (tab === 'redeem') {
    loadRedeemGroups(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载兑换码面板失败', true);
    });
  } else if (tab === 'world') {
    worldViewer.mount();
    if (state) {
      worldViewer.updateMapIds(state.mapIds);
    }
    worldViewer.startPolling();
  } else if (tab === 'server') {
    switchServerTab(currentServerTab);
  } else if (tab === 'players') {
    loadPlayerList(false, true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
    });
  } else if (tab === 'shortcuts') {
    loadPlayerList(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
    });
  } else if (tab === 'secrets') {
    loadEnvironmentVars().catch((e) => console.error('[GM]', e));
  } else if (tab === 'gameconfig') {
    loadGameConfig().catch((e) => console.error('[GM]', e));
  } else if (tab === 'ai') {
    loadAiProviderConfigs().catch((e) => console.error('[GM]', e));
  } else if (tab === 'trades') {
    // 进入交易记录 tab：默认拉一次最近一页（无条件），让 GM 立刻能看到现状
    loadTrades({ resetPage: true }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
    });
  }
}

/** loadSuggestions：加载Suggestions。 */
async function loadSuggestions(): Promise<void> {
  try {
    const params = new URLSearchParams({
      page: String(currentSuggestionPage),
      pageSize: '10',
    });
    if (currentSuggestionKeyword.trim()) {
      params.set('keyword', currentSuggestionKeyword.trim());
    }
    const result = await request<GmSuggestionListRes>(`${GM_API_BASE_PATH}/suggestions?${params.toString()}`);
    /** suggestions：suggestions。 */
    suggestions = result.items;
    /** currentSuggestionPage：当前建议分页。 */
    currentSuggestionPage = result.page;
    /** currentSuggestionTotalPages：当前建议总量Pages。 */
    currentSuggestionTotalPages = result.totalPages;
    /** currentSuggestionTotal：当前建议总量。 */
    currentSuggestionTotal = result.total;
    renderSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '加载建议失败', true);
  }
}

/** loadEditorCatalog：加载编辑器目录。 */
async function loadEditorCatalog(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  try {
    /** editorCatalog：编辑器目录。 */
    editorCatalog = await request<GmEditorCatalogRes>(`${GM_API_BASE_PATH}/editor-catalog`);
    /** editorCatalogSource：编辑器目录来源。 */
    editorCatalogSource = 'server';
  } catch {
    const localCatalog = getLocalEditorCatalog();
    editorCatalog = {
      ...localCatalog,
      buffs: localCatalog.buffs ?? [],
    };
    /** editorCatalogSource：编辑器目录来源。 */
    editorCatalogSource = 'local-fallback';
    setStatus(t('gm.editor.catalog.load-failed'), true);
  }
  renderShortcutMailComposer();
}

/** renderShortcutMailComposer：渲染Shortcut邮件Composer。 */
function renderShortcutMailComposer(preserveActiveInteraction = false): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!shortcutMailComposerEl) {
    return;
  }
  const targetPlayer = broadcastMailDraft.targetPlayerId
    ? (
      state?.players.find((player) => player.id === broadcastMailDraft.targetPlayerId)
      ?? (selectedPlayerDetail?.id === broadcastMailDraft.targetPlayerId ? selectedPlayerDetail : null)
    )
    : null;
  const structureKey = JSON.stringify({
    targetPlayerId: broadcastMailDraft.targetPlayerId,
    templateId: broadcastMailDraft.templateId,
    senderLabel: broadcastMailDraft.senderLabel,
    title: broadcastMailDraft.title,
    body: broadcastMailDraft.body,
    expireHours: broadcastMailDraft.expireHours,
    attachments: broadcastMailDraft.attachments.map((entry) => `${entry.itemId}:${entry.count}`),
    players: (state?.players ?? [])
      .filter((player) => !player.meta.isBot)
      .map((player) => `${player.id}:${player.playerNo ?? ''}:${player.roleName}:${player.accountName || ''}:${player.meta.online ? 1 : 0}`),
  });
  const activeElement = document.activeElement;
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (preserveActiveInteraction && activeField && shortcutMailComposerEl.contains(activeField)) {
    /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
    shortcutMailComposerRefreshBlocked = true;
    return;
  }
  /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
  shortcutMailComposerRefreshBlocked = false;
  if (lastShortcutMailComposerStructureKey === structureKey) {
    return;
  }
  shortcutMailComposerEl.innerHTML = getMailComposerMarkup(broadcastMailDraft, {
    scope: 'shortcut',
    submitLabel: targetPlayer ? t('gm.mail.send-to-player', { roleName: targetPlayer.roleName }) : t('gm.mail.send-all'),
    note: targetPlayer ? t('gm.mail.send-to-player.note') : t('gm.mail.send-all.note'),
    showTargetPlayer: true,
  });
  syncSearchableItemFields(shortcutMailComposerEl);
  /** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
  lastShortcutMailComposerStructureKey = structureKey;
}

/** flushShortcutMailComposerRefresh：处理刷新Shortcut邮件Composer Refresh。 */
function flushShortcutMailComposerRefresh(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!shortcutMailComposerEl || !shortcutMailComposerRefreshBlocked) {
    return;
  }
  const activeElement = document.activeElement;
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (activeField && shortcutMailComposerEl.contains(activeField)) {
    return;
  }
  /** lastShortcutMailComposerStructureKey：last Shortcut邮件Composer Structure Key。 */
  lastShortcutMailComposerStructureKey = null;
  /** shortcutMailComposerRefreshBlocked：shortcut邮件Composer Refresh Blocked。 */
  shortcutMailComposerRefreshBlocked = false;
  renderShortcutMailComposer(true);
}

/** renderSuggestions：渲染Suggestions。 */
function renderSuggestions(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!suggestions || suggestions.length === 0) {
    if (lastSuggestionStructureKey !== 'empty') {
      suggestionListEl.innerHTML = `<div class="empty-hint">${escapeHtml(t('gm.suggestion.empty'))}</div>`;
      lastSuggestionStructureKey = 'empty';
    }
    suggestionPageMetaEl.textContent = t('gm.suggestion.page-meta', {
      page: currentSuggestionPage,
      totalPages: currentSuggestionTotalPages,
      total: currentSuggestionTotal,
    });
    suggestionPrevPageBtn.disabled = currentSuggestionPage <= 1;
    suggestionNextPageBtn.disabled = currentSuggestionPage >= currentSuggestionTotalPages;
    return;
  }

  const structureKey = suggestions.map((suggestion) => [
    suggestion.id,
    suggestion.status,
    suggestion.upvotes.length,
    suggestion.downvotes.length,
    suggestion.replies.length,
    suggestion.replies[suggestion.replies.length - 1]?.id ?? '',
  ].join(':')).join('|');
  if (lastSuggestionStructureKey !== structureKey) {
    suggestionListEl.innerHTML = suggestions.map((suggestion) => getSuggestionCardMarkup(suggestion)).join('');
    /** lastSuggestionStructureKey：last建议Structure Key。 */
    lastSuggestionStructureKey = structureKey;
  }
  suggestionPageMetaEl.textContent = t('gm.suggestion.page-meta', {
    page: currentSuggestionPage,
    totalPages: currentSuggestionTotalPages,
    total: currentSuggestionTotal,
  });
  suggestionPrevPageBtn.disabled = currentSuggestionPage <= 1;
  suggestionNextPageBtn.disabled = currentSuggestionPage >= currentSuggestionTotalPages;
}

/** completeSuggestion：完成建议。 */
async function completeSuggestion(id: string): Promise<void> {
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}/complete`, { method: 'POST' });
    setStatus(t('gm.suggestion.completed'));
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  }
}

/** replySuggestion：处理回复建议。 */
async function replySuggestion(id: string, content: string): Promise<void> {
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content } satisfies GmReplySuggestionReq),
    });
    setStatus(t('gm.suggestion.reply-sent'));
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  }
}

/** removeSuggestion：处理remove建议。 */
async function removeSuggestion(id: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!confirm(t('gm.suggestion.remove.confirm'))) return;
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}`, { method: 'DELETE' });
    setStatus(t('gm.suggestion.removed'));
    if (suggestions.length === 1 && currentSuggestionPage > 1) {
      currentSuggestionPage -= 1;
    }
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  }
}

/** GM 默认请求超时（毫秒）。超过该值仍未收到响应即立即 reject，避免 UI 永久卡在“正在保存…”。 */
const GM_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** request：处理请求。 */
async function request<T>(path: string, init: RequestInit = {}, timeoutMs: number = GM_DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 默认带超时：服务端阻塞、网络抖动或 pooler 卡顿时主动取消请求并向上抛出可读错误。
  // 兼容外部传入的 init.signal：任一被触发都会终止 fetch。
  const controller = new AbortController();
  const externalSignal = init.signal ?? null;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  let timedOut = false;
  const timeoutHandle = timeoutMs > 0
    ? window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs)
    : null;

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000)).toString();
      throw new Error(t('gm.request.timeout', { seconds }));
    }
    throw error;
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (response.status === 401 && path !== `${GM_AUTH_API_BASE_PATH}/login`) {
    logout(t('gm.request.login-expired'));
    throw new Error(t('gm.request.expired'));
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as {      
      /**
 * message：message相关字段。
 */
 message: unknown }).message)
      : typeof data === 'string' && data.trim().length > 0
        ? data
        : t('gm.request.failed');
    throw new Error(message);
  }
  return data as T;
}

/** requestBlob：处理请求Blob。 */
async function requestBlob(path: string, init: RequestInit = {}): Promise<Response> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    logout(t('gm.request.login-expired'));
    throw new Error(t('gm.request.expired'));
  }
  if (!response.ok) {
    throw new Error((await response.text()).trim() || t('gm.request.failed'));
  }
  return response;
}

function isGmSectTemplateId(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && templateId.trim().startsWith('sect_domain:');
}

function isGmSectRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId'>): boolean {
  return isGmSectTemplateId(instance.templateId) && instance.instanceId.startsWith('sect:');
}

function isGmSecretRealmRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId' | 'mapGroupId' | 'mapGroupName'>): boolean {
  return instance.instanceId.startsWith('tower:tongtian:layer:')
    || instance.templateId.startsWith('tongtian_tower_layer_')
    || instance.mapGroupId === 'secret_realm'
    || instance.mapGroupName === '秘境';
}

function resolvePositionMapCategory(instance: GmWorldInstanceSummary): GmPositionMapCategory {
  if (isGmSectRuntimeInstance(instance)) return 'sect';
  if (isGmSecretRealmRuntimeInstance(instance)) return 'secret';
  return instance.linePreset === 'real' ? 'real' : 'void';
}

function getMapSummary(mapId: string): GmMapSummary | null {
  return gmMapSummaries.find((entry) => entry.id === mapId) ?? null;
}

function getMapDisplayName(mapId: string, fallbackName?: string): string {
  const name = getMapSummary(mapId)?.name || getCachedMapMeta(mapId)?.name || fallbackName || '未知地域';
  return name.trim() || '未知地域';
}

function getPositionMapCategoryCounts(): Map<GmPositionMapCategory, number> {
  const counts = new Map<GmPositionMapCategory, number>();
  for (const instance of gmWorldInstances) {
    const category = resolvePositionMapCategory(instance);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

function getPositionCategoryOptions(currentCategory: GmPositionMapCategory): Array<{ value: string; label: string }> {
  if (gmWorldInstances.length === 0) {
    return [{ value: 'map', label: '地图' }];
  }
  const counts = getPositionMapCategoryCounts();
  const options = GM_POSITION_MAP_CATEGORY_OPTIONS
    .filter((entry) => (counts.get(entry.id) ?? 0) > 0 || entry.id === currentCategory)
    .map((entry) => ({
      value: entry.id,
      label: `${entry.label}（${counts.get(entry.id) ?? 0}）`,
    }));
  return options.length > 0 ? options : [{ value: 'map', label: '地图' }];
}

function getPositionMapInstances(category: GmPositionMapCategory): GmWorldInstanceSummary[] {
  return gmWorldInstances
    .filter((instance) => resolvePositionMapCategory(instance) === category)
    .slice()
    .sort((left, right) => {
      const leftGroupOrder = left.mapGroupOrder ?? 1000;
      const rightGroupOrder = right.mapGroupOrder ?? 1000;
      if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder;
      const groupOrder = (left.mapGroupName || left.templateName).localeCompare(right.mapGroupName || right.templateName, 'zh-Hans-CN');
      if (groupOrder !== 0) return groupOrder;
      const memberOrder = (left.mapGroupMemberOrder ?? 0) - (right.mapGroupMemberOrder ?? 0);
      if (memberOrder !== 0) return memberOrder;
      const defaultOrder = Number(!left.defaultEntry) - Number(!right.defaultEntry);
      if (defaultOrder !== 0) return defaultOrder;
      return left.templateName.localeCompare(right.templateName, 'zh-Hans-CN') || left.templateId.localeCompare(right.templateId);
    });
}

function getPositionMapOptions(category: GmPositionMapCategory, currentMapId: string): Array<{ value: string; label: string }> {
  const optionsByMapId = new Map<string, { value: string; label: string }>();
  if (category !== 'map' && gmWorldInstances.length > 0) {
    for (const instance of getPositionMapInstances(category)) {
      if (optionsByMapId.has(instance.templateId)) continue;
      optionsByMapId.set(instance.templateId, {
        value: instance.templateId,
        label: getMapDisplayName(instance.templateId, instance.templateName),
      });
    }
  } else {
    const maps = gmMapSummaries.length > 0
      ? gmMapSummaries.slice().sort((left, right) => {
        const groupOrder = (left.mapGroupOrder ?? 1000) - (right.mapGroupOrder ?? 1000);
        if (groupOrder !== 0) return groupOrder;
        const groupNameOrder = (left.mapGroupName || left.name).localeCompare(right.mapGroupName || right.name, 'zh-Hans-CN');
        if (groupNameOrder !== 0) return groupNameOrder;
        const memberOrder = (left.mapGroupMemberOrder ?? 0) - (right.mapGroupMemberOrder ?? 0);
        if (memberOrder !== 0) return memberOrder;
        return left.name.localeCompare(right.name, 'zh-Hans-CN') || left.id.localeCompare(right.id);
      })
      : Array.from(new Set(state?.mapIds ?? [])).map((mapId) => ({ id: mapId, name: getCachedMapMeta(mapId)?.name ?? '未知地域' } as GmMapSummary));
    for (const map of maps) {
      optionsByMapId.set(map.id, { value: map.id, label: getMapDisplayName(map.id, map.name) });
    }
  }
  if (currentMapId && !optionsByMapId.has(currentMapId)) {
    optionsByMapId.set(currentMapId, { value: currentMapId, label: getMapDisplayName(currentMapId) });
  }
  return Array.from(optionsByMapId.values());
}

function getPositionCategoryForMap(playerId: string, mapId: string): GmPositionMapCategory {
  if (
    positionMapCategoryDraft?.playerId === playerId
    && getPositionMapOptions(positionMapCategoryDraft.category, mapId).some((entry) => entry.value === mapId)
  ) {
    return positionMapCategoryDraft.category;
  }
  for (const entry of GM_POSITION_MAP_CATEGORY_OPTIONS) {
    if (getPositionMapOptions(entry.id, mapId).some((option) => option.value === mapId)) {
      return entry.id;
    }
  }
  return 'map';
}

function renderPositionMapPicker(player: GmManagedPlayerRecord, draft: PlayerState): string {
  const category = getPositionCategoryForMap(player.id, draft.mapId);
  const mapOptions = getPositionMapOptions(category, draft.mapId);
  return `
    <label class="editor-field">
      <span>类别</span>
      <select data-gm-position-map-category>
        ${optionsMarkup(getPositionCategoryOptions(category), category)}
      </select>
    </label>
    <label class="editor-field wide">
      <span>地图</span>
      <select data-bind="mapId" data-kind="string" data-gm-position-map-select>
        ${optionsMarkup(mapOptions, draft.mapId)}
      </select>
    </label>
  `;
}

function patchPositionMapSelect(category: GmPositionMapCategory, currentMapId: string): string {
  const mapSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-select]');
  if (!mapSelect) return currentMapId;
  const mapOptions = getPositionMapOptions(category, currentMapId);
  const nextMapId = mapOptions.some((entry) => entry.value === currentMapId)
    ? currentMapId
    : mapOptions[0]?.value ?? currentMapId;
  const fragment = document.createDocumentFragment();
  for (const option of mapOptions) {
    const optionEl = document.createElement('option');
    optionEl.value = String(option.value);
    optionEl.textContent = option.label;
    optionEl.selected = option.value === nextMapId;
    fragment.append(optionEl);
  }
  mapSelect.replaceChildren(fragment);
  mapSelect.value = nextMapId;
  return nextMapId;
}

function resolvePositionTargetInstanceId(mapId: string): string | undefined {
  const categorySelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-category]');
  const category = (categorySelect?.value as GmPositionMapCategory | undefined) ?? positionMapCategoryDraft?.category ?? 'map';
  if (category === 'map') return undefined;
  const candidates = getPositionMapInstances(category).filter((instance) => instance.templateId === mapId);
  const target = candidates.find((instance) => instance.defaultEntry)
    ?? candidates.find((instance) => instance.lineIndex === 1)
    ?? candidates[0];
  return target?.instanceId;
}

async function loadGmMapPickerCatalog(): Promise<void> {
  if (gmMapPickerCatalogLoaded) return;
  if (gmMapPickerCatalogLoading) return gmMapPickerCatalogLoading;
  gmMapPickerCatalogLoading = (async () => {
    const [mapsRes, instancesRes] = await Promise.all([
      request<GmMapListRes>(`${GM_API_BASE_PATH}/maps`),
      request<GmWorldInstanceListRes>(`${GM_API_BASE_PATH}/world/instances`),
    ]);
    gmMapSummaries = Array.isArray(mapsRes.maps) ? mapsRes.maps : [];
    gmWorldInstances = Array.isArray(instancesRes.instances) ? instancesRes.instances : [];
    gmMapPickerCatalogLoaded = true;
    clearEditorRenderCache();
  })().finally(() => {
    gmMapPickerCatalogLoading = null;
  });
  return gmMapPickerCatalogLoading;
}

/** updateMailDraftValue：更新邮件Draft值。 */
function updateMailDraftValue(
  scope: 'direct' | 'shortcut',
  path: string,
  rawValue: string,
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const draft = scope === 'direct' ? directMailDraft : broadcastMailDraft;
  if (path === 'templateId') {
    draft.templateId = rawValue;
    return;
  }
  if (path === 'targetPlayerId') {
    draft.targetPlayerId = rawValue;
    return;
  }
  if (path === 'senderLabel') {
    draft.senderLabel = rawValue;
    return;
  }
  if (path === 'title') {
    draft.title = rawValue;
    return;
  }
  if (path === 'body') {
    draft.body = rawValue;
    return;
  }
  if (path === 'expireHours') {
    draft.expireHours = rawValue;
    return;
  }
  const attachmentMatch = path.match(/^attachments\.(\d+)\.(itemId|count)$/);
  if (!attachmentMatch) {
    return;
  }
  const index = Number(attachmentMatch[1]);
  const field = attachmentMatch[2];
  const attachment = draft.attachments[index];
  if (!attachment) {
    return;
  }
  if (field === 'itemId') {
    attachment.itemId = rawValue;
    return;
  }
  attachment.count = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
}

/** updateRedeemDraftValue：更新兑换Draft值。 */
function updateRedeemDraftValue(path: string, rawValue: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (path === 'name') {
    redeemDraft.name = rawValue;
    return;
  }
  if (path === 'createCount') {
    redeemDraft.createCount = rawValue;
    return;
  }
  if (path === 'appendCount') {
    redeemDraft.appendCount = rawValue;
    return;
  }
  const rewardMatch = path.match(/^rewards\.(\d+)\.(itemId|count)$/);
  if (!rewardMatch) {
    return;
  }
  const index = Number(rewardMatch[1]);
  const field = rewardMatch[2];
  const reward = redeemDraft.rewards[index];
  if (!reward) {
    return;
  }
  if (field === 'itemId') {
    reward.itemId = rawValue;
    return;
  }
  reward.count = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
}

/** rerenderDirectMailComposer：处理rerender Direct邮件Composer。 */
function rerenderDirectMailComposer(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!state) {
    return;
  }
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  renderEditor(state);
}

/** addMailAttachment：处理add邮件Attachment。 */
function addMailAttachment(scope: 'direct' | 'shortcut'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!hasServerEditorCatalog()) {
    setStatus(t('gm.editor.catalog.mail-attachment-unavailable'), true);
    return;
  }
  const draft = scope === 'direct' ? directMailDraft : broadcastMailDraft;
  draft.attachments.push(createDefaultMailAttachmentDraft());
  resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer();
    return;
  }
  renderShortcutMailComposer();
}

/** removeMailAttachment：处理remove邮件Attachment。 */
function removeMailAttachment(scope: 'direct' | 'shortcut', index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const draft = scope === 'direct' ? directMailDraft : broadcastMailDraft;
  if (index < 0 || index >= draft.attachments.length) {
    return;
  }
  draft.attachments.splice(index, 1);
  resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer();
    return;
  }
  renderShortcutMailComposer();
}

/** sendDirectMail：处理send Direct邮件。 */
async function sendDirectMail(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    throw new Error(t('gm.mail.no-target'));
  }
  if (directMailDraft.attachments.some((entry) => entry.itemId.trim().length > 0)) {
    assertTrustedEditorCatalog('带附件邮件发送');
  }
  const payload = getMailComposerPayload(directMailDraft);
  const result = await request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true;  
/**
 * mailId：邮件ID标识。
 */
 mailId: string }>(`${buildGmPlayerApiPath(detail.id)}/mail`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** directMailDraft：direct邮件Draft。 */
  directMailDraft = createDefaultMailComposerDraft();
  /** directMailDraftPlayerId：direct邮件Draft玩家ID。 */
  directMailDraftPlayerId = detail.id;
  resetMailAttachmentPageStore('direct');
  rerenderDirectMailComposer();
  setStatus(t('gm.mail.sent', { roleName: detail.roleName, mailId: result.mailId }));
}

/** sendShortcutMail：处理send Shortcut邮件。 */
async function sendShortcutMail(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (broadcastMailDraft.attachments.some((entry) => entry.itemId.trim().length > 0)) {
    assertTrustedEditorCatalog('带附件邮件发送');
  }
  const payload = getMailComposerPayload(broadcastMailDraft);
  const targetPlayerId = broadcastMailDraft.targetPlayerId.trim();
  const path = targetPlayerId
    ? `${GM_API_BASE_PATH}/players/${encodeURIComponent(targetPlayerId)}/mail`
    : `${GM_API_BASE_PATH}/mail/broadcast`;
  const result = await request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true;  
 /**
 * mailId：邮件ID标识。
 */
 mailId: string;  
 /**
 * batchId：batchID标识。
 */
 batchId?: string;  
 /**
 * recipientCount：数量或计量字段。
 */
 recipientCount?: number }>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const targetPlayer = targetPlayerId
    ? (state?.players.find((player) => player.id === targetPlayerId) ?? null)
    : null;
  /** broadcastMailDraft：broadcast邮件Draft。 */
  broadcastMailDraft = createDefaultMailComposerDraft();
  resetMailAttachmentPageStore('shortcut');
  renderShortcutMailComposer();
  setStatus(targetPlayer
    ? t('gm.mail.sent', { roleName: targetPlayer.roleName, mailId: result.mailId })
    : t('gm.mail.broadcast.sent', { batchId: result.batchId ?? result.mailId, recipientCount: result.recipientCount ?? 0 }));
}

/** getSelectedPlayer：读取Selected玩家。 */
function getSelectedPlayer(): GmManagedPlayerSummary | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!state || !selectedPlayerId) return null;
  return state.players.find((player) => player.id === selectedPlayerId) ?? null;
}

/** getSelectedPlayerDetail：读取Selected玩家详情。 */
function getSelectedPlayerDetail(): GmManagedPlayerRecord | null {
  return selectedPlayerDetail && selectedPlayerDetail.id === selectedPlayerId
    ? selectedPlayerDetail
    : null;
}

function getPlayerDatabaseTables(detail: GmManagedPlayerRecord | null): GmPlayerDatabaseTableView[] {
  return Array.isArray(detail?.databaseTables) ? detail.databaseTables : [];
}

function clearPlayerDatabasePanel(message = '当前还没有数据库表数据。'): void {
  playerDatabaseTabsEl.innerHTML = '';
  playerDatabaseMetaEl.textContent = message;
  playerPersistedJsonEl.value = '';
}

function renderPlayerDatabasePanel(detail: GmManagedPlayerRecord): void {
  const tables = getPlayerDatabaseTables(detail);
  if (tables.length === 0) {
    currentDatabaseTable = '';
    clearPlayerDatabasePanel('当前数据库未启用，或该玩家还没有可展示的分表记录。');
    return;
  }

  if (!tables.some((entry) => entry.table === currentDatabaseTable)) {
    currentDatabaseTable = tables[0]?.table ?? '';
  }
  const activeEntry = tables.find((entry) => entry.table === currentDatabaseTable) ?? tables[0];
  if (!activeEntry) {
    clearPlayerDatabasePanel();
    return;
  }

  playerDatabaseTabsEl.innerHTML = tables.map((entry) => {
    const countLabel = entry.rowCount > 0 ? ` (${entry.rowCount})` : '';
    return `<button class="workspace-tab ${entry.table === activeEntry.table ? 'active' : ''}" data-database-table="${escapeHtml(entry.table)}" type="button">${escapeHtml(entry.table)}${countLabel}</button>`;
  }).join('');
  playerDatabaseMetaEl.textContent = activeEntry.rowCount > 0
    ? `当前查看 ${activeEntry.table} · ${activeEntry.rowCount} 行数据库记录。`
    : `当前查看 ${activeEntry.table} · 该表当前没有该玩家记录。`;
  setTextLikeValue(playerPersistedJsonEl, formatJson(activeEntry.payload ?? null));
}

/** createDefaultItem：创建默认物品。 */
function createDefaultItem(equipSlot?: string): ItemStack {
  return {
    itemId: '',
    name: '',
    type: equipSlot ? 'equipment' : 'material',
    count: 1,
    desc: '',
    grade: equipSlot ? 'mortal' : undefined,
    level: equipSlot ? 1 : undefined,
    equipSlot: equipSlot as ItemStack['equipSlot'],
    equipAttrs: equipSlot ? {} : undefined,
    equipStats: equipSlot ? {} : undefined,
    tags: equipSlot ? [] : undefined,
    effects: equipSlot ? [] : undefined,
  };
}

/** createDefaultTechnique：创建默认Technique。 */
function createDefaultTechnique(): TechniqueState {
  return {
    techId: '',
    name: '',
    level: 1,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    realm: TechniqueRealm.Entry,
    skills: [],
    grade: 'mortal',
    category: 'internal',
    layers: [],
  };
}

/** createDefaultQuest：创建默认任务。 */
function createDefaultQuest(): QuestState {
  return {
    id: '',
    title: '',
    desc: '',
    line: 'side',
    status: 'active',
    objectiveType: 'kill',
    progress: 0,
    required: 1,
    targetName: '',
    rewardText: '',
    targetMonsterId: '',
    rewardItemId: '',
    rewardItemIds: [],
    rewards: [],
    giverId: '',
    giverName: '',
    targetMapId: '',
    targetNpcId: '',
    submitMapId: '',
    submitNpcId: '',
  };
}

/** createDefaultBuff：创建默认Buff。 */
function createDefaultBuff(): TemporaryBuffState {
  return {
    buffId: '',
    name: '',
    shortMark: '',
    category: 'buff',
    visibility: 'public',
    remainingTicks: 1,
    duration: 1,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: '',
    attrs: {},
    stats: {},
  };
}

/** createDefaultPlayerSnapshot：创建默认玩家快照。 */
function createDefaultPlayerSnapshot(source?: PlayerState): PlayerState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (source) return clone(source);
  return {
    id: '',
    name: '',
    mapId: 'yunlai_town',
    x: 0,
    y: 0,
    facing: Direction.South,
    viewRange: 8,
    hp: 1,
    maxHp: 1,
    qi: 0,
    dead: false,
    foundation: 0,
    rootFoundation: 0,
    combatExp: 0,
    comprehension: 0,
    luck: 0,
    baseAttrs: { ...DEFAULT_BASE_ATTRS },
    bonuses: [],
    temporaryBuffs: [],
    inventory: { items: [], capacity: 24 },
    equipment: {
      weapon: null,
      head: null,
      body: null,
      legs: null,
      accessory: null,
    },
    techniques: [],
    actions: [],
    quests: [],
    autoBattle: false,
    autoBattleSkills: [],
    autoUsePills: [],
    autoBattleTargetingMode: 'auto',
    autoRetaliate: true,
    autoIdleCultivation: true,
    revealedBreakthroughRequirementIds: [],
  };
}

/** readCatalogSelectValue：处理read目录Select值。 */
function readCatalogSelectValue(
  kind: 'technique' | 'inventory-item' | 'equipment',
  slot?: EquipSlot,
): string {
  const selector = kind === 'equipment'
    ? `[data-catalog-select="${kind}"][data-slot="${slot}"]`
    : `[data-catalog-select="${kind}"]`;
  const field = editorContentEl.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  return field?.value ?? '';
}

/** updateInventoryAddControls：更新背包Add Controls。 */
function updateInventoryAddControls(resetSelectedItem = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const typeSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-catalog-select="inventory-type"]');
  const itemField = editorContentEl.querySelector<HTMLElement>('[data-item-combobox][data-item-scope="inventory-add"]');
  const itemValueField = editorContentEl.querySelector<HTMLInputElement>('input[data-item-combobox-value][data-catalog-select="inventory-item"]');
  if (!typeSelect || !itemField || !itemValueField) {
    return;
  }
  typeSelect.value = currentInventoryAddType;
  itemField.dataset.placeholder = `点击后输入名称或 ID 搜索${ITEM_TYPE_LABELS[currentInventoryAddType]}模板`;
  if (resetSelectedItem) {
    itemValueField.value = '';
    const input = getSearchableItemInput(itemField);
    if (input) {
      input.value = '';
    }
  }
  syncSearchableItemField(itemField);
}

/** pathSegments：处理路径Segments。 */
function pathSegments(path: string): string[] {
  return gmPureHelpers.pathSegments(path);
}

/** setValueByPath：处理set值By路径。 */
function setValueByPath(target: unknown, path: string, value: unknown): void {
  return gmPureHelpers.setValueByPath(target, path, value);
}

/** getValueByPath：读取值By路径。 */
function getValueByPath(target: unknown, path: string): unknown {
  return gmPureHelpers.getValueByPath(target, path);
}

/** removeArrayIndex：处理remove Array索引。 */
function removeArrayIndex(target: unknown, path: string, index: number): void {
  gmPureHelpers.removeArrayIndex(target, path, index);
}

/** ensureArray：确保Array。 */
function ensureArray<T>(value: T[] | undefined | null): T[] {
  return gmPureHelpers.ensureArray(value);
}

/** buildHtmlAttributes：构建Html属性。 */
function buildHtmlAttributes(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(value ?? '')}"`)
    .join('');
}

/** getSearchableItemDisplayValue：读取Searchable物品显示值。 */
function getSearchableItemDisplayValue(itemId: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!itemId) {
    return '';
  }
  const entry = gmCatalogHelpers.findItemCatalogEntry(editorCatalog, itemId);
  return entry ? entry.name : '未知物品';
}

/** getSearchableItemOptions：读取Searchable物品选项。 */
function getSearchableItemOptions(scope: SearchableItemScope, slot?: EquipSlot): Array<{
/**
 * value：值数值。
 */
 value: string;
 /**
 * label：label名称或显示文本。
 */
 label: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (scope === 'inventory-add') {
    return getInventoryAddItemOptions();
  }
  if (scope === 'equipment-slot') {
    if (!slot) {
      return [];
    }
    return getItemCatalogOptions((option) => option.type === 'equipment' && option.equipSlot === slot);
  }
  return getItemCatalogOptions();
}

/** searchableItemField：处理searchable物品字段。 */
function searchableItemField(
  label: string,
  value: string,
  scope: SearchableItemScope,
  hiddenFieldAttrs: Record<string, string | undefined>,
  extraClass = '',
  slot?: EquipSlot,
  placeholder = '点击后输入名称或 ID 搜索物品模板',
  wrapperAttrs: Record<string, string | undefined> = {},
): string {
  return `
    <label class="editor-field ${extraClass}"${buildHtmlAttributes(wrapperAttrs)}>
      <span>${escapeHtml(label)}</span>
      <div class="gm-item-combobox" data-item-combobox data-item-scope="${escapeHtml(scope)}"${slot ? ` data-slot="${escapeHtml(slot)}"` : ''} data-placeholder="${escapeHtml(placeholder)}">
        <div class="gm-item-combobox-shell">
          <input
            class="gm-item-combobox-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            data-item-combobox-input
            value="${escapeHtml(getSearchableItemDisplayValue(value))}"
            placeholder="${escapeHtml(placeholder)}"
          />
          <button class="gm-item-combobox-toggle" type="button" data-item-combobox-toggle aria-label="展开物品搜索">搜索</button>
        </div>
        <div class="gm-item-combobox-popover hidden" data-item-combobox-popover>
          <div class="gm-item-combobox-hint" data-item-combobox-hint></div>
          <div class="gm-item-combobox-list" data-item-combobox-list></div>
        </div>
        <input type="hidden" data-item-combobox-value${buildHtmlAttributes({ ...hiddenFieldAttrs, value })} />
      </div>
    </label>
  `;
}

/** getSearchableItemValueField：读取Searchable物品值字段。 */
function getSearchableItemValueField(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-value]');
}

/** getSearchableItemInput：读取Searchable物品输入。 */
function getSearchableItemInput(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-input]');
}

/** getSearchableItemList：读取Searchable物品列表。 */
function getSearchableItemList(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-list]');
}

/** getSearchableItemHint：读取Searchable物品Hint。 */
function getSearchableItemHint(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-hint]');
}

/** getSearchableItemPopover：读取Searchable物品Popover。 */
function getSearchableItemPopover(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-popover]');
}

/** normalizeSearchableItemText：规范化Searchable物品文本。 */
function normalizeSearchableItemText(value: string): string {
  return value.trim().toLowerCase();
}

/** renderSearchableItemOptions：渲染Searchable物品选项。 */
function renderSearchableItemOptions(root: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root);
  const valueField = getSearchableItemValueField(root);
  const listEl = getSearchableItemList(root);
  const hintEl = getSearchableItemHint(root);
  if (!input || !valueField || !listEl || !hintEl) {
    return;
  }

  const scope = (root.dataset.itemScope as SearchableItemScope | undefined) ?? 'all';
  const slot = root.dataset.slot as EquipSlot | undefined;
  const allOptions = getSearchableItemOptions(scope, slot);
  const selectedValue = valueField.value;
  const normalizedQuery = normalizeSearchableItemText(input.value);
  const filteredOptions = normalizedQuery.length > 0
    ? allOptions.filter((option) => normalizeSearchableItemText(`${option.label} ${option.value}`).includes(normalizedQuery))
    : allOptions;
  let visibleOptions = filteredOptions.slice(0, SEARCHABLE_ITEM_RESULT_LIMIT);

  if (selectedValue && !visibleOptions.some((option) => option.value === selectedValue)) {
    const selectedOption = allOptions.find((option) => option.value === selectedValue);
    if (selectedOption && (normalizedQuery.length === 0 || normalizeSearchableItemText(`${selectedOption.label} ${selectedOption.value}`).includes(normalizedQuery))) {
      visibleOptions = [selectedOption, ...visibleOptions.slice(0, Math.max(0, SEARCHABLE_ITEM_RESULT_LIMIT - 1))];
    }
  }

  const renderedOptions = normalizedQuery.length === 0
    ? [{ value: '', label: '清空选择' }, ...visibleOptions]
    : visibleOptions;
  const defaultActiveIndex = renderedOptions.findIndex((option) => option.value === selectedValue);
  const fallbackActiveIndex = renderedOptions.findIndex((option) => option.value !== '');
  const initialActiveIndex = defaultActiveIndex >= 0
    ? defaultActiveIndex
    : Math.max(0, fallbackActiveIndex >= 0 ? fallbackActiveIndex : 0);
  const storedActiveIndex = Number(root.dataset.activeIndex ?? '-1');
  const activeIndex = Number.isInteger(storedActiveIndex) && storedActiveIndex >= 0 && storedActiveIndex < renderedOptions.length
    ? storedActiveIndex
    : initialActiveIndex;
  root.dataset.activeIndex = String(activeIndex);

  hintEl.textContent = normalizedQuery.length > 0
    ? `匹配 ${filteredOptions.length} 项${filteredOptions.length > visibleOptions.length ? `，当前显示前 ${visibleOptions.length} 项` : ''}`
    : `共 ${allOptions.length} 项，输入名称或 ID 可继续筛选${allOptions.length > visibleOptions.length ? `，当前显示前 ${visibleOptions.length} 项` : ''}`;

  if (renderedOptions.length === 0) {
    listEl.innerHTML = '<div class="gm-item-combobox-empty">没有匹配的物品模板</div>';
    return;
  }

  listEl.innerHTML = renderedOptions.map((option, index) => `
    <button
      class="gm-item-combobox-option${option.value === selectedValue ? ' selected' : ''}${index === activeIndex ? ' active' : ''}"
      type="button"
      data-item-option-value="${escapeHtml(option.value)}"
    >
      <span class="gm-item-combobox-option-title">${escapeHtml(option.label)}</span>
      <span class="gm-item-combobox-option-meta">${escapeHtml(option.value || '恢复为空')}</span>
    </button>
  `).join('');
  listEl.querySelector<HTMLElement>('.gm-item-combobox-option.active')?.scrollIntoView({ block: 'nearest' });
}

/** syncSearchableItemField：同步Searchable物品字段。 */
function syncSearchableItemField(root: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root);
  const valueField = getSearchableItemValueField(root);
  if (!input || !valueField) {
    return;
  }
  if (root.dataset.open === 'true') {
    renderSearchableItemOptions(root);
    return;
  }
  input.value = getSearchableItemDisplayValue(valueField.value);
  input.placeholder = root.dataset.placeholder ?? '点击后输入名称或 ID 搜索物品模板';
}

/** syncSearchableItemFields：同步Searchable物品字段。 */
function syncSearchableItemFields(scope: ParentNode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (activeSearchableItemField && !activeSearchableItemField.isConnected) {
    /** activeSearchableItemField：活跃Searchable物品字段。 */
    activeSearchableItemField = null;
  }
  scope.querySelectorAll<HTMLElement>('[data-item-combobox]').forEach((field) => {
    syncSearchableItemField(field);
  });
}

/** closeSearchableItemField：关闭Searchable物品字段。 */
function closeSearchableItemField(root: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (activeSearchableItemField === root) {
    /** activeSearchableItemField：活跃Searchable物品字段。 */
    activeSearchableItemField = null;
  }
  root.dataset.open = 'false';
  root.dataset.activeIndex = '-1';
  getSearchableItemPopover(root)?.classList.add('hidden');
  syncSearchableItemField(root);
  queueMicrotask(() => {
    flushBlockedEditorRender();
  });
}

/** openSearchableItemField：打开Searchable物品字段。 */
function openSearchableItemField(root: HTMLElement, resetQuery = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (activeSearchableItemField && activeSearchableItemField !== root) {
    closeSearchableItemField(activeSearchableItemField);
  }
  const input = getSearchableItemInput(root);
  const valueField = getSearchableItemValueField(root);
  if (!input || !valueField) {
    return;
  }
  /** activeSearchableItemField：活跃Searchable物品字段。 */
  activeSearchableItemField = root;
  root.dataset.open = 'true';
  root.dataset.activeIndex = '-1';
  getSearchableItemPopover(root)?.classList.remove('hidden');
  if (resetQuery) {
    input.value = '';
  }
  input.placeholder = getSearchableItemDisplayValue(valueField.value) || (root.dataset.placeholder ?? '点击后输入名称或 ID 搜索物品模板');
  renderSearchableItemOptions(root);
}

/** moveSearchableItemActiveIndex：处理移动Searchable物品活跃索引。 */
function moveSearchableItemActiveIndex(root: HTMLElement, offset: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const listEl = getSearchableItemList(root);
  if (!listEl) {
    return;
  }
  const optionButtons = Array.from(listEl.querySelectorAll<HTMLButtonElement>('[data-item-option-value]'));
  if (optionButtons.length === 0) {
    return;
  }
  const currentIndex = Number(root.dataset.activeIndex ?? '-1');
  const nextIndex = currentIndex >= 0
    ? Math.min(optionButtons.length - 1, Math.max(0, currentIndex + offset))
    : Math.max(0, Math.min(optionButtons.length - 1, offset > 0 ? 0 : optionButtons.length - 1));
  root.dataset.activeIndex = String(nextIndex);
  renderSearchableItemOptions(root);
}

/** commitSearchableItemSelection：处理commit Searchable物品选中项。 */
function commitSearchableItemSelection(root: HTMLElement, value: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const input = getSearchableItemInput(root);
  const valueField = getSearchableItemValueField(root);
  if (!input || !valueField) {
    return;
  }
  const changed = valueField.value !== value;
  valueField.value = value;
  input.value = getSearchableItemDisplayValue(value);
  closeSearchableItemField(root);
  if (!changed) {
    return;
  }
  valueField.dispatchEvent(new Event('input', { bubbles: true }));
  valueField.dispatchEvent(new Event('change', { bubbles: true }));
}

/** flushBlockedEditorRender：处理刷新Blocked编辑器渲染。 */
function flushBlockedEditorRender(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!editorRenderRefreshBlocked || !state) {
    return;
  }
  if (
    activeSearchableItemField
    && activeSearchableItemField.isConnected
    && editorContentEl.contains(activeSearchableItemField)
    && activeSearchableItemField.dataset.open === 'true'
  ) {
    return;
  }
  /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
  editorRenderRefreshBlocked = false;
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  renderEditor(state);
}

/** optionsMarkup：处理选项Markup。 */
function optionsMarkup<T extends string | number>(options: Array<{
/**
 * value：值数值。
 */
 value: T;
 /**
 * label：label名称或显示文本。
 */
 label: string }>, selected: T | undefined): string {
  return options.map((option) => `
    <option value="${escapeHtml(String(option.value))}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

/** textField：处理文本字段。 */
function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

/** nullableTextField：处理nullable文本字段。 */
function nullableTextField(label: string, path: string, value: string | undefined, emptyMode: 'undefined' | 'null' = 'undefined', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="nullable-string" data-empty-mode="${emptyMode}" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

/** numberField：处理数值字段。 */
function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-bind="${escapeHtml(path)}" data-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}

/** checkboxField：处理checkbox字段。 */
function checkboxField(label: string, path: string, checked: boolean | undefined): string {
  return `
    <label class="editor-toggle">
      <input type="checkbox" data-bind="${escapeHtml(path)}" data-kind="boolean" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

/** selectField：选择字段。 */
function selectField(
  label: string,
  path: string,
  value: string | number | undefined,
  options: Array<{  
  /**
 * value：值数值。
 */
 value: string | number;  
 /**
 * label：label名称或显示文本。
 */
 label: string }>,
  extraClass = '',
): string {
  const selected = value ?? '';
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-bind="${escapeHtml(path)}" data-kind="${typeof selected === 'number' ? 'number' : 'string'}">
        ${optionsMarkup(options, selected)}
      </select>
    </label>
  `;
}

/** jsonField：处理JSON字段。 */
function jsonField(label: string, path: string, value: unknown, emptyValue: 'null' | 'object' | 'array' = 'object', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="json" data-empty-json="${emptyValue}">${escapeHtml(formatJson(value ?? (emptyValue === 'array' ? [] : emptyValue === 'null' ? null : {})))}</textarea>
    </label>
  `;
}

/** stringArrayField：处理string Array字段。 */
function stringArrayField(label: string, path: string, value: string[] | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}<span class="editor-section-note"> 每行一项</span></span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="string-array">${escapeHtml((value ?? []).join('\n'))}</textarea>
    </label>
  `;
}

/** readonlyCodeBlock：处理readonly兑换码Block。 */
function readonlyCodeBlock(title: string, path: string, value: unknown): string {
  return `
    <div class="editor-field wide">
      <span>${escapeHtml(title)}</span>
      <div class="editor-code" data-preview="readonly" data-path="${escapeHtml(path)}">${escapeHtml(formatJson(value))}</div>
    </div>
  `;
}

/** getAttrDisplayNumber：读取属性展示数值。 */
function getAttrDisplayNumber(value: number | undefined, fallback = 0): string {
  return String(Number.isFinite(value) ? value : fallback);
}

/** renderAttributeSummaryGrid：渲染六维基础/总属性摘要。 */
function renderAttributeSummaryGrid(draft: PlayerState): string {
  return `
    <div class="editor-attr-summary-grid">
      ${ATTR_KEYS.map((key) => {
        const totalValue = draft.finalAttrs?.[key] ?? draft.baseAttrs?.[key] ?? DEFAULT_BASE_ATTRS[key];
        return `
          <div class="editor-attr-summary-card">
            <div class="editor-attr-summary-label">${escapeHtml(ATTR_KEY_LABELS[key])}</div>
            <div class="editor-attr-summary-value" data-preview="attr-total" data-key="${escapeHtml(key)}">${escapeHtml(getAttrDisplayNumber(totalValue, DEFAULT_BASE_ATTRS[key]))}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/** renderEditorTabSection：渲染编辑器Tab Section。 */
function renderEditorTabSection(tab: GmEditorTab, content: string): string {
  return `<div data-editor-tab="${tab}">${content}</div>`;
}

/** renderVisualEditor：渲染Visual编辑器。 */
function renderVisualEditor(player: GmManagedPlayerRecord, draft: PlayerState): string {
  const equipment = draft.equipment as EquipmentSlots;
  const bonuses = ensureArray(draft.bonuses);
  const buffs = ensureArray(draft.temporaryBuffs);
  const autoBattleSkills = ensureArray(draft.autoBattleSkills);
  const techniques = ensureArray(draft.techniques);
  const quests = ensureArray(draft.quests);
  const inventoryItems = ensureArray(draft.inventory.items);
  const account = player.account;
  const activity = getManagedAccountActivityMeta(player);
  const catalogFallbackNote = getEditorCatalogFallbackNote();
  const catalogActionDisabled = hasServerEditorCatalog() ? '' : ' disabled';

  const equipmentMarkup = EQUIP_SLOTS.map((slot) => {
    const item = equipment[slot];
    return `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(EQUIP_SLOT_LABELS[slot])}</div>
            <div class="editor-card-meta" data-preview="equipment-title" data-slot="${slot}">${escapeHtml(getEquipmentCardTitle(item))}</div>
            <div class="editor-card-meta" data-preview="equipment-meta" data-slot="${slot}">${escapeHtml(getEquipmentCardMeta(item))}</div>
          </div>
          <div class="button-row">
            ${item
              ? `<button class="small-btn danger" type="button" data-action="clear-equip" data-slot="${slot}">清空槽位</button>`
              : `<button class="small-btn" type="button" data-action="create-equip-from-catalog" data-slot="${slot}"${catalogActionDisabled}>加入槽位</button>`}
          </div>
        </div>
        ${item ? getItemEditorControls(`equipment.${slot}`, item, 'equipment') : `
          <div class="editor-note">从下方选择装备模板后即可快速塞入这个槽位。</div>
          <div class="editor-grid compact">
            ${searchableItemField(
              '装备模板',
              '',
              'equipment-slot',
              { 'data-catalog-select': 'equipment', 'data-slot': slot },
              'wide',
              slot,
              '点击后输入名称或 ID 搜索装备模板',
            )}
          </div>
        `}
      </div>
    `;
  }).join('');

  const bonusMarkup = bonuses.length > 0
    ? bonuses.map((bonus, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="bonus-title" data-index="${index}">${escapeHtml(getBonusCardTitle(bonus, index))}</div>
            <div class="editor-card-meta" data-preview="bonus-meta" data-index="${index}">${escapeHtml(getBonusCardMeta(bonus))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-bonus" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('来源', `bonuses.${index}.source`, bonus.source)}
          ${nullableTextField('标签', `bonuses.${index}.label`, bonus.label, 'undefined')}
          ${jsonField('属性加成', `bonuses.${index}.attrs`, bonus.attrs ?? {}, 'object', 'wide')}
          ${jsonField('数值加成', `bonuses.${index}.stats`, bonus.stats ?? {}, 'object')}
          ${jsonField('附加元数据', `bonuses.${index}.meta`, bonus.meta ?? {}, 'object')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有额外属性加成。</div>';

  const buffMarkup = buffs.length > 0
    ? buffs.map((buff, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div class="editor-card-title">增益 ${index + 1}</div>
          <button class="small-btn danger" type="button" data-action="remove-buff" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${selectField('增益', `temporaryBuffs.${index}.buffId`, buff.buffId, getBuffCatalogOptions(buff.buffId), 'wide')}
          ${numberField('层数', `temporaryBuffs.${index}.stacks`, buff.stacks)}
          ${numberField('剩余时间', `temporaryBuffs.${index}.remainingTicks`, buff.remainingTicks)}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有临时效果。</div>';

  const inventoryMarkup = getInventoryListMarkup(inventoryItems);
  const visibleInventoryCount = getVisibleInventoryItems(inventoryItems).length;

  const autoBattleMarkup = autoBattleSkills.length > 0
    ? autoBattleSkills.map((entry, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="auto-skill-title" data-index="${index}">${escapeHtml(getAutoSkillCardTitle(entry, index))}</div>
            <div class="editor-card-meta" data-preview="auto-skill-meta" data-index="${index}">${escapeHtml(getAutoSkillCardMeta(entry))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-auto-skill" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('技能 ID', `autoBattleSkills.${index}.skillId`, entry.skillId)}
          <div class="editor-field">
            <span>启用状态</span>
            <label class="editor-toggle">
              <input type="checkbox" data-bind="autoBattleSkills.${index}.enabled" data-kind="boolean" ${entry.enabled ? 'checked' : ''} />
              <span>自动战斗时允许使用</span>
            </label>
          </div>
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有自动战斗技能配置。</div>';

  const techniqueMarkup = techniques.length > 0
    ? techniques.map((technique, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="technique-title" data-index="${index}">${escapeHtml(getTechniqueCardTitle(technique, index))}</div>
            <div class="editor-card-meta" data-preview="technique-meta" data-index="${index}">${escapeHtml(getTechniqueCardMeta(technique))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-technique" data-index="${index}">删除</button>
        </div>
        ${getTechniqueEditorControls(index, technique)}
      </div>
    `).join('')
    : '<div class="editor-note">当前没有已学会功法。</div>';

  const questMarkup = quests.length > 0
    ? quests.map((quest, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="quest-title" data-index="${index}">${escapeHtml(getQuestCardTitle(quest, index))}</div>
            <div class="editor-card-meta" data-preview="quest-meta" data-index="${index}">${escapeHtml(getQuestCardMeta(quest))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-quest" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('任务 ID', `quests.${index}.id`, quest.id)}
          ${textField('标题', `quests.${index}.title`, quest.title)}
          ${selectField('任务线', `quests.${index}.line`, quest.line, GM_QUEST_LINE_OPTIONS)}
          ${selectField('状态', `quests.${index}.status`, quest.status, GM_QUEST_STATUS_OPTIONS)}
          ${selectField('目标类型', `quests.${index}.objectiveType`, quest.objectiveType, GM_QUEST_OBJECTIVE_TYPE_OPTIONS)}
          ${nullableTextField('章节', `quests.${index}.chapter`, quest.chapter, 'undefined')}
          ${nullableTextField('剧情段落', `quests.${index}.story`, quest.story, 'undefined')}
          ${numberField('当前进度', `quests.${index}.progress`, quest.progress)}
          ${numberField('需求进度', `quests.${index}.required`, quest.required)}
          ${textField('目标名称', `quests.${index}.targetName`, quest.targetName)}
          ${nullableTextField('目标地图 ID', `quests.${index}.targetMapId`, quest.targetMapId, 'undefined')}
          ${numberField('目标 X', `quests.${index}.targetX`, typeof quest.targetX === 'number' ? quest.targetX : 0)}
          ${numberField('目标 Y', `quests.${index}.targetY`, typeof quest.targetY === 'number' ? quest.targetY : 0)}
          ${nullableTextField('目标场景人物 ID', `quests.${index}.targetNpcId`, quest.targetNpcId, 'undefined')}
          ${nullableTextField('目标场景人物名称', `quests.${index}.targetNpcName`, quest.targetNpcName, 'undefined')}
          ${nullableTextField('目标文本', `quests.${index}.objectiveText`, quest.objectiveText, 'undefined', 'wide')}
          ${nullableTextField('传话内容', `quests.${index}.relayMessage`, quest.relayMessage, 'undefined', 'wide')}
          ${textField('奖励文本', `quests.${index}.rewardText`, quest.rewardText, 'wide')}
          ${textField('目标怪物 ID', `quests.${index}.targetMonsterId`, quest.targetMonsterId)}
          ${nullableTextField('目标功法 ID', `quests.${index}.targetTechniqueId`, quest.targetTechniqueId, 'undefined')}
          ${numberField('目标境界阶段', `quests.${index}.targetRealmStage`, typeof quest.targetRealmStage === 'number' ? quest.targetRealmStage : 0)}
          ${textField('发放者 ID', `quests.${index}.giverId`, quest.giverId)}
          ${textField('发放者名称', `quests.${index}.giverName`, quest.giverName)}
          ${nullableTextField('发放地图 ID', `quests.${index}.giverMapId`, quest.giverMapId, 'undefined')}
          ${nullableTextField('发放地图名', `quests.${index}.giverMapName`, quest.giverMapName, 'undefined')}
          ${numberField('发放者 X', `quests.${index}.giverX`, typeof quest.giverX === 'number' ? quest.giverX : 0)}
          ${numberField('发放者 Y', `quests.${index}.giverY`, typeof quest.giverY === 'number' ? quest.giverY : 0)}
          ${nullableTextField('提交场景人物 ID', `quests.${index}.submitNpcId`, quest.submitNpcId, 'undefined')}
          ${nullableTextField('提交场景人物名称', `quests.${index}.submitNpcName`, quest.submitNpcName, 'undefined')}
          ${nullableTextField('提交地图 ID', `quests.${index}.submitMapId`, quest.submitMapId, 'undefined')}
          ${nullableTextField('提交地图名', `quests.${index}.submitMapName`, quest.submitMapName, 'undefined')}
          ${numberField('提交 X', `quests.${index}.submitX`, typeof quest.submitX === 'number' ? quest.submitX : 0)}
          ${numberField('提交 Y', `quests.${index}.submitY`, typeof quest.submitY === 'number' ? quest.submitY : 0)}
          ${nullableTextField('提交物品 ID', `quests.${index}.requiredItemId`, quest.requiredItemId, 'undefined')}
          ${numberField('提交物品数量', `quests.${index}.requiredItemCount`, typeof quest.requiredItemCount === 'number' ? quest.requiredItemCount : 1)}
          ${nullableTextField('下一任务 ID', `quests.${index}.nextQuestId`, quest.nextQuestId, 'undefined')}
          ${textField('奖励物品 ID（旧字段）', `quests.${index}.rewardItemId`, quest.rewardItemId)}
          ${stringArrayField('奖励物品 ID 列表', `quests.${index}.rewardItemIds`, quest.rewardItemIds, 'wide')}
          ${jsonField('奖励物品详情', `quests.${index}.rewards`, quest.rewards ?? [], 'array', 'wide')}
          ${textField('任务描述', `quests.${index}.desc`, quest.desc, 'wide')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有任务数据。</div>';

  return `
    ${renderEditorTabSection('basic', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">账号信息</div>
          <div class="editor-section-note">这里展示账号主键、注册时间、在线状态、最近活动和累计在线时长，密码修改也统一在这里做。</div>
        </div>
      </div>
      ${account ? `
      <div class="editor-grid compact">
        <div class="editor-field">
          <span>玩家编号</span>
          <div class="editor-code">${escapeHtml(formatPlayerNo(player.playerNo))}</div>
        </div>
        <label class="editor-field">
          <span>账号</span>
          <input
            id="player-account-username"
            type="text"
            autocomplete="off"
            spellcheck="false"
            value="${escapeHtml(account.username)}"
            placeholder="输入登录账号"
          />
        </label>
        <div class="editor-field">
          <span>账号 ID</span>
          <div class="editor-code">${escapeHtml(account.userId)}</div>
        </div>
        <div class="editor-field">
          <span>注册时间</span>
          <div class="editor-code">${escapeHtml(formatDateTime(account.createdAt))}</div>
        </div>
        <div class="editor-field">
          <span>是否在线</span>
          <div class="editor-code">${escapeHtml(getManagedAccountStatusLabel(player))}</div>
        </div>
        <div class="editor-field">
          <span>账号状态</span>
          <div class="editor-code"><span class="pill ${getManagedAccountRestrictionPillClass(account)}">${escapeHtml(getManagedAccountRestrictionLabel(account))}</span></div>
        </div>
        <div class="editor-field">
          <span>${escapeHtml(activity.label)}</span>
          <div class="editor-code">${escapeHtml(activity.value)}</div>
        </div>
        <div class="editor-field">
          <span>最近登录</span>
          <div class="editor-code">${escapeHtml(formatDateTime(account.lastLoginAt))}</div>
        </div>
        <div class="editor-field">
          <span>最近 IP</span>
          <div class="editor-code">${escapeHtml(account.lastLoginIp ?? '无')}</div>
        </div>
        <div class="editor-field">
          <span>最近设备</span>
          <div class="editor-code">${escapeHtml(account.lastLoginDeviceId ?? '无')}</div>
        </div>
        <div class="editor-field">
          <span>累计在线时间</span>
          <div class="editor-code">${escapeHtml(formatDurationSeconds(account.totalOnlineSeconds))}</div>
        </div>
        <div class="editor-field">
          <span>封禁时间</span>
          <div class="editor-code">${escapeHtml(formatDateTime(account.bannedAt))}</div>
        </div>
        <div class="editor-field wide">
          <span>封禁原因</span>
          <div class="editor-code">${escapeHtml(account.banReason?.trim() || '无')}</div>
        </div>
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        <label class="editor-field">
          <span>新密码</span>
          <input id="player-password-input" type="text" autocomplete="off" spellcheck="false" placeholder="输入新的账号密码" />
        </label>
        <label class="editor-field wide">
          <span>封禁原因</span>
          <div class="button-row" style="margin-bottom: 8px;">
            ${[
              '同设备批量起号',
              '工作室批量养号',
              '资源转移/小号输血',
              '自动化脚本',
              '规避处罚复开号',
            ].map((reason) => (
              `<button class="small-btn" type="button" data-ban-reason-preset="${escapeHtml(reason)}">${escapeHtml(reason)}</button>`
            )).join('')}
          </div>
          <input id="player-account-ban-reason" type="text" autocomplete="off" spellcheck="false" placeholder="可点快速原因，也可以自定义输入" />
        </label>
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-action="save-player-account">修改账号</button>
        <button class="small-btn" type="button" data-action="save-player-password">修改账号密码</button>
        <button class="small-btn" type="button" data-action="reset-player-password-default">重置密码为 123456789</button>
        <button class="small-btn danger" type="button" data-action="ban-player-account" ${account.status === 'banned' ? 'disabled' : ''}>快捷封号</button>
        <button class="small-btn" type="button" data-action="unban-player-account" ${account.status !== 'banned' ? 'disabled' : ''}>快捷解封</button>
      </div>
      <div class="editor-note">密码只会提交到服务端，并由服务端写入哈希，不会以明文落库。封号状态会写入账号表并阻止后续登录、刷新和重连。</div>
      ${activity.note ? `<div class="editor-note">${escapeHtml(activity.note)}</div>` : ''}
      ${catalogFallbackNote ? `<div class="editor-note">${escapeHtml(catalogFallbackNote)}</div>` : ''}
      ` : '<div class="editor-note">当前目标没有可编辑的账号信息，通常是机器人或异常存档。</div>'}
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">基础资料</div>
          <div class="editor-section-note">人物本体、资源数值与运行时开关。</div>
        </div>
        <div class="editor-chip-list" data-preview="base-chips">
          ${getEditorBodyChipMarkup(player, draft)}
        </div>
      </div>
      <div class="editor-grid">
        ${textField('角色名', 'name', draft.name)}
        ${numberField('HP', 'hp', draft.hp)}
        ${numberField('QI', 'qi', draft.qi)}
        <div class="editor-field wide">
          <span>角色标识</span>
          <div class="editor-code">${escapeHtml(formatPlayerNo(player.playerNo))} · ID: ${escapeHtml(draft.id)}</div>
        </div>
      </div>
      <div class="editor-toggle-row" style="margin-top: 10px;">
        ${checkboxField('死亡', 'dead', draft.dead)}
        ${checkboxField('自动战斗', 'autoBattle', draft.autoBattle)}
        ${checkboxField('自动反击', 'autoRetaliate', draft.autoRetaliate !== false)}
        ${checkboxField('锁定战斗目标', 'combatTargetLocked', draft.combatTargetLocked)}
      </div>
    </section>

    `)}

    ${renderEditorTabSection('position', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">位置与朝向</div>
          <div class="editor-section-note">地图传送、坐标修正与视野范围。</div>
        </div>
      </div>
      <div class="editor-grid">
        ${renderPositionMapPicker(player, draft)}
        ${numberField('X', 'x', draft.x)}
        ${numberField('Y', 'y', draft.y)}
        ${selectField('朝向', 'facing', draft.facing, GM_FACING_OPTIONS)}
        ${numberField('视野', 'viewRange', draft.viewRange)}
      </div>
    </section>
    `)}

    ${renderEditorTabSection('realm', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">境界与属性</div>
          <div class="editor-section-note">当前境界、基础属性与额外加成。</div>
        </div>
      </div>
      <div class="editor-grid">
        ${selectField('当前境界', 'realmLv', typeof draft.realmLv === 'number' ? draft.realmLv : 1, getRealmCatalogOptions())}
        ${numberField('当前境界修为', 'realm.progress', draft.realm?.progress)}
        ${numberField('底蕴', 'foundation', draft.foundation)}
        ${numberField('根基', 'rootFoundation', draft.rootFoundation)}
        ${numberField('悟性', 'comprehension', draft.comprehension)}
        ${numberField('幸运', 'luck', draft.luck)}
      </div>
      <div class="editor-stat-grid" style="margin-top: 10px;">
        ${ATTR_KEYS.map((key) => numberField(ATTR_KEY_LABELS[key], `baseAttrs.${key}`, draft.baseAttrs[key])).join('')}
      </div>
      <div style="margin-top: 10px;">
        ${renderAttributeSummaryGrid(draft)}
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        ${stringArrayField('已揭示突破条件 ID', 'revealedBreakthroughRequirementIds', draft.revealedBreakthroughRequirementIds, 'wide')}
        ${readonlyCodeBlock('境界状态', 'realm', draft.realm ?? {})}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">属性加成</div>
          <div class="editor-section-note">适合直接调试被动、装备外加成等常驻附加效果。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-bonus">新增加成</button>
        </div>
      </div>
      <div class="editor-card-list">${bonusMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">派生只读快照</div>
          <div class="editor-section-note">这些通常由服务端重算，不建议直接改。若确实需要，去高级 JSON 区导入。</div>
        </div>
      </div>
      <div class="editor-grid compact">
        ${readonlyCodeBlock('总属性（最终属性）', 'finalAttrs', draft.finalAttrs ?? {})}
        ${readonlyCodeBlock('数值属性', 'numericStats', draft.numericStats ?? {})}
        ${readonlyCodeBlock('比率分母', 'ratioDivisors', draft.ratioDivisors ?? {})}
        ${readonlyCodeBlock('动作列表', 'actions', draft.actions ?? [])}
      </div>
    </section>
    `)}

    ${renderEditorTabSection('buffs', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">增益编辑</div>
          <div class="editor-section-note">这里只保留增益选择、层数和剩余时间，其他静态字段按模板自动带出。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-buff"${catalogActionDisabled}>新增增益</button>
        </div>
      </div>
      <div class="editor-card-list">${buffMarkup}</div>
    </section>
    `)}

    ${renderEditorTabSection('techniques', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">修炼与自动战斗</div>
          <div class="editor-section-note">主修功法与自动技能列表。</div>
        </div>
        <button class="small-btn" type="button" data-action="add-auto-skill">新增自动技能</button>
      </div>
      <div class="editor-grid compact" style="margin-bottom: 10px;">
        ${selectField('主修功法', 'cultivatingTechId', draft.cultivatingTechId ?? '', getLearnedTechniqueOptions(techniques, true), 'wide')}
      </div>
      <div class="editor-card-list">${autoBattleMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">功法</div>
          <div class="editor-section-note">等级、经验、技能与层级结构。</div>
        </div>
        <div class="button-row">
          <label class="editor-field" style="min-width: 220px;">
            <span>新增功法</span>
            <select data-catalog-select="technique"${catalogActionDisabled}>
              <option value="">选择功法模板</option>
              ${optionsMarkup(getTechniqueCatalogOptions(), '')}
            </select>
          </label>
          <button class="small-btn" type="button" data-action="add-technique-from-catalog"${catalogActionDisabled}>加入角色</button>
        </div>
      </div>
      <div class="editor-card-list">${techniqueMarkup}</div>
    </section>
    `)}

    ${renderEditorTabSection('shortcuts', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">功法快捷操作</div>
          <div class="editor-section-note">按钮会直接修改草稿并自动提交对应标签，无需再切回功法或物品页手动保存。</div>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom: 12px;">
        <div class="stats-card">
          <div class="stats-card-label">已学功法</div>
          <div class="stats-card-value">${ensureArray(draft.techniques).length}</div>
          <div class="stats-card-note">当前角色已写入运行态的功法数量</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-label">未学功法</div>
          <div class="stats-card-value">${Math.max(0, getTechniqueCatalogOptions().length - ensureArray(draft.techniques).length)}</div>
          <div class="stats-card-note">基于当前编辑目录推算的剩余可学功法</div>
        </div>
      </div>
      <div class="editor-card-list">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">获取全部未学习功法书</div>
              <div class="editor-card-meta">把尚未学习且背包里也没有的功法书补进背包。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-unlearned-technique-books"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">添加全部消耗品</div>
              <div class="editor-card-meta">把目录内全部消耗品补进背包；已有堆叠会补到 999 个。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-consumables"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">添加全部装备</div>
              <div class="editor-card-meta">把目录内全部装备补进背包，每件 1 个；已有同 ID 物品不会重复添加。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-equipment"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">当前全部功法满级</div>
              <div class="editor-card-meta">按编辑目录模板把当前已学功法统一拉到最高层级。</div>
            </div>
            <button class="small-btn" type="button" data-action="max-all-techniques"${catalogActionDisabled}>立即满级</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">学习全部功法</div>
              <div class="editor-card-meta">把当前目录里尚未学会的功法全部写入角色。</div>
            </div>
            <button class="small-btn primary" type="button" data-action="learn-all-techniques"${catalogActionDisabled}>全部学习</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">移除所有功法</div>
              <div class="editor-card-meta">清空当前角色已学功法，并移除主修功法与自动战斗技能引用。</div>
            </div>
            <button class="small-btn danger" type="button" data-action="remove-all-techniques"${catalogActionDisabled}>全部移除</button>
          </div>
        </div>
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">属性快速设置</div>
          <div class="editor-section-note">这里直接请求服务端修改角色存档，不走整份角色快照覆盖。炼体等级默认保留现有炼体经验；如果经验超出目标等级上限，会自动截到升级前一档。底蕴和战斗经验则按输入值直接增加。</div>
        </div>
      </div>
      <div class="editor-card-list">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">炼体等级</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.bodyTraining?.level ?? 0))} 层。修改后会立即重算炼体带来的属性加成。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>目标等级</span>
                <input id="shortcut-body-training-level" type="number" min="0" step="1" value="${Math.max(0, Math.floor(draft.bodyTraining?.level ?? 0))}" />
              </label>
              <button class="small-btn primary" type="button" data-action="set-body-training-level">确认修改</button>
            </div>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">增加底蕴</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.foundation ?? 0))}。支持正负整数，负数会扣除到底蕴最低为 0。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>调整数值</span>
                <input id="shortcut-foundation-amount" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="例如 -100 / 100" value="0" />
              </label>
              <button class="small-btn primary" type="button" data-action="add-foundation">确认调整</button>
            </div>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">增加战斗经验</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.combatExp ?? 0))}。支持正负整数，负数会扣除到最低为 0。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>调整数值</span>
                <input id="shortcut-combat-exp-amount" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="例如 -100 / 100" value="0" />
              </label>
              <button class="small-btn primary" type="button" data-action="add-combat-exp">确认调整</button>
            </div>
          </div>
        </div>
      </div>
      ${catalogFallbackNote ? `<div class="editor-note" style="margin-top: 12px; color: var(--stamp-red);">${escapeHtml(catalogFallbackNote)}</div>` : ''}
    </section>
    `)}

    ${renderEditorTabSection('items', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">背包</div>
          <div class="editor-section-note">容量、物品堆叠与实例态强化等级；名称从物品目录按 ID 解析，存档仍保持只存实例字段。</div>
        </div>
        <div class="button-row">
          ${numberField('容量', 'inventory.capacity', draft.inventory.capacity)}
          <label class="editor-field" style="min-width: 220px;">
            <span>搜索当前背包</span>
            <input
              type="search"
              data-inventory-search
              autocomplete="off"
              spellcheck="false"
              value="${escapeHtml(currentInventorySearchQuery)}"
              placeholder="输入中文名、ID、类型或部位"
            />
          </label>
          <div class="editor-field" style="min-width: 110px;">
            <span>筛选结果</span>
            <div class="editor-code" data-inventory-search-count>${escapeHtml(currentInventorySearchQuery.trim() ? `显示 ${visibleInventoryCount} / ${inventoryItems.length} 项` : `共 ${inventoryItems.length} 项`)}</div>
          </div>
          <label class="editor-field" style="min-width: 220px;">
            <span>物品类别</span>
            <select data-catalog-select="inventory-type"${catalogActionDisabled}>
              ${optionsMarkup(getInventoryAddTypeOptions(), currentInventoryAddType)}
            </select>
          </label>
          ${searchableItemField(
            '新增物品',
            '',
            'inventory-add',
            { 'data-catalog-select': 'inventory-item' },
            '',
            undefined,
            `点击后输入名称或 ID 搜索${ITEM_TYPE_LABELS[currentInventoryAddType]}模板`,
            { style: 'min-width: 260px;' },
          )}
          <button class="small-btn" type="button" data-action="add-inventory-item-from-catalog"${catalogActionDisabled}>加入背包</button>
        </div>
      </div>
      <div class="inventory-compact-list" data-inventory-compact-list>${inventoryMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">装备</div>
          <div class="editor-section-note">五个装备槽独立编辑。</div>
        </div>
      </div>
      <div class="editor-card-list">${equipmentMarkup}</div>
    </section>
    `)}

    ${renderEditorTabSection('quests', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">任务</div>
          <div class="editor-section-note">任务链、奖励和发放者数据。</div>
        </div>
        <button class="small-btn" type="button" data-action="add-quest">新增任务</button>
      </div>
      <div class="editor-card-list">${questMarkup}</div>
    </section>
    `)}

    ${renderEditorTabSection('mail', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">角色邮件</div>
          <div class="editor-section-note">给当前选中的角色发送邮件。在线角色会收到收件箱摘要更新，正文仍按需打开。</div>
        </div>
      </div>
      ${getMailComposerMarkup(directMailDraft, {
        scope: 'direct',
        submitLabel: `发送给 ${player.name || '当前角色'}`,
        note: '这里直接走 GM HTTP 接口写入邮件持久化表，不依赖客户端本地缓存。',
      })}
    </section>
    `)}

    ${renderEditorTabSection('risk', renderPlayerRiskSection(player))}
  `;
}

/** renderSummary：渲染摘要。 */
function renderSummary(data: GmStateRes): void {
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const startedAt = data.perf.networkStatsStartedAt > 0 ? new Date(data.perf.networkStatsStartedAt) : null;
  const tickPerf = getTickPerf(data.perf);
  summaryTotalEl.textContent = `${data.playerStats.totalPlayers}`;
  summaryOnlineEl.textContent = `${data.playerStats.onlinePlayers}`;
  summaryOfflineHangingEl.textContent = `${data.playerStats.offlineHangingPlayers}`;
  summaryOfflineEl.textContent = `${data.playerStats.offlinePlayers}`;
  const maintenanceActive = data.operations?.maintenanceActive === true;
  const restartRequested = data.operations?.restartRequested === true;
  summaryMaintenanceEl.textContent = restartRequested
    ? '重启中'
    : maintenanceActive
      ? '维护中'
      : '关闭';
  toggleMaintenanceModeBtn.textContent = maintenanceActive ? '结束维护' : '开启维护中';
  toggleMaintenanceModeBtn.disabled = restartRequested;
  restartServerBtn.disabled = restartRequested;
  summaryBotsEl.textContent = `${data.botCount}`;
  summaryTickEl.textContent = tickPerf.lastMapId
    ? `${Math.round(tickPerf.lastMs)} ms · ${tickPerf.lastMapId}`
    : `${Math.round(tickPerf.lastMs)} ms`;
  summaryTickWindowEl.textContent = `${Math.round(tickPerf.windowBusyPercent)}%`;
  summaryCpuEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  summaryMemoryEl.textContent = `${Math.round(data.perf.memoryMb)} MB`;
  summaryNetInEl.textContent = formatBytes(data.perf.networkInBytes);
  summaryNetOutEl.textContent = formatBytes(data.perf.networkOutBytes);
  summaryPathQueueEl.textContent = `${data.perf.pathfinding.queueDepth}`;
  summaryPathWorkersEl.textContent = `${data.perf.pathfinding.runningWorkers} / ${data.perf.pathfinding.workerCount}`;
  summaryPathCancelledEl.textContent = `${data.perf.pathfinding.cancelled}`;
  trafficResetMetaEl.textContent = data.perf.networkStatsEnabled === false
    ? '流量统计尚未启动，打开本页或点击重置后开始采集。'
    : startedAt
    ? `统计起点：${startedAt.toLocaleString()} · 已累计 ${formatDurationSeconds(elapsedSec)} · 大包采样${data.perf.networkPayloadCaptureEnabled === true ? '开启' : '关闭'}`
    : '统计区间尚未开始。';
  toggleNetworkPayloadCaptureBtn.textContent = data.perf.networkPayloadCaptureEnabled === true ? '关闭大包采样' : '开启大包采样';
  toggleNetworkPayloadCaptureBtn.classList.toggle('danger', data.perf.networkPayloadCaptureEnabled === true);
  trafficTotalInEl.textContent = formatBytes(data.perf.networkInBytes);
  trafficTotalInNoteEl.textContent = `均次 ${formatAverageBytesPerEvent(
    data.perf.networkInBytes,
    data.perf.networkInBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
  )} · 均秒 ${formatBytesPerSecond(data.perf.networkInBytes, elapsedSec)}`;
  trafficTotalOutEl.textContent = formatBytes(data.perf.networkOutBytes);
  trafficTotalOutNoteEl.textContent = `均次 ${formatAverageBytesPerEvent(
    data.perf.networkOutBytes,
    data.perf.networkOutBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
  )} · 均秒 ${formatBytesPerSecond(data.perf.networkOutBytes, elapsedSec)}`;
  cpuCurrentPercentEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  cpuTickWindowPercentEl.textContent = `${Math.round(tickPerf.windowBusyPercent)}%`;
  cpuTickWindowNoteEl.textContent = tickPerf.windowTickCount > 0
    ? `${tickPerf.windowTickCount} 次 tick · 总计 ${Math.round(tickPerf.windowTotalMs)} ms · 均次 ${tickPerf.windowAvgMs.toFixed(1)} ms`
    : tickPerf.windowBusyPercent > 0
      ? `兼容口径估算 · 最近 tick 约 ${tickPerf.windowAvgMs.toFixed(1)} ms`
      : '最近采样窗口内暂无 tick 记录';
  cpuProfileMetaEl.textContent = data.perf.cpu.profileStartedAt > 0
    ? `CPU 画像起点：${new Date(data.perf.cpu.profileStartedAt).toLocaleString()} · 已累计 ${formatDurationSeconds(data.perf.cpu.profileElapsedSec)}`
    : 'CPU 画像尚未开始。';
  cpuCoreCountEl.textContent = `${data.perf.cpu.cores}`;
  cpuUserMsEl.textContent = `${Math.round(data.perf.cpu.userCpuMs)} ms`;
  cpuSystemMsEl.textContent = `${Math.round(data.perf.cpu.systemCpuMs)} ms`;
  cpuLoad1mEl.textContent = `${data.perf.cpu.loadAvg1m.toFixed(2)}`;
  cpuLoad5mEl.textContent = `${data.perf.cpu.loadAvg5m.toFixed(2)}`;
  cpuLoad15mEl.textContent = `${data.perf.cpu.loadAvg15m.toFixed(2)}`;
  cpuProcessUptimeEl.textContent = formatDurationSeconds(data.perf.cpu.processUptimeSec);
  cpuSystemUptimeEl.textContent = formatDurationSeconds(data.perf.cpu.systemUptimeSec);
  const rssMb = Math.max(0, data.perf.cpu.rssMb);
  const heapUsedMb = Math.max(0, data.perf.cpu.heapUsedMb);
  const heapTotalMb = Math.max(0, data.perf.cpu.heapTotalMb);
  const externalMb = Math.max(0, data.perf.cpu.externalMb);
  const heapFreeMb = Math.max(0, heapTotalMb - heapUsedMb);
  const residentGapMb = Math.max(0, rssMb - heapTotalMb - externalMb);
  memorySnapshotMetaEl.textContent = `当前快照：进程常驻 ${Math.round(rssMb)} MB · Heap 已用 ${Math.round(heapUsedMb)} MB · 外部内存 ${Math.round(externalMb)} MB`;
  memoryRssEl.textContent = `${Math.round(rssMb)} MB`;
  memoryHeapUsedEl.textContent = `${Math.round(heapUsedMb)} MB`;
  memoryHeapTotalEl.textContent = `${Math.round(heapTotalMb)} MB`;
  memoryExternalEl.textContent = `${Math.round(externalMb)} MB`;
  memoryHeapUsagePercentEl.textContent = formatPercent(heapUsedMb, heapTotalMb);
  memoryHeapUsageNoteEl.textContent = `已用 ${Math.round(heapUsedMb)} MB / 总量 ${Math.round(heapTotalMb)} MB`;
  memoryHeapFreeEl.textContent = `${Math.round(heapFreeMb)} MB`;
  memoryResidentGapEl.textContent = `${Math.round(residentGapMb)} MB`;
  memoryRssHeapRatioEl.textContent = heapUsedMb > 0 ? `${(rssMb / heapUsedMb).toFixed(2)}x` : '0x';
  memoryRssHeapRatioNoteEl.textContent = heapUsedMb > 0
    ? `RSS ${Math.round(rssMb)} MB / Heap 已用 ${Math.round(heapUsedMb)} MB`
    : '当前 Heap 已用接近 0，暂不计算倍率';
  const memoryEstimate = data.perf.memoryEstimate;
  memoryEstimateMetaEl.textContent = memoryEstimate?.generatedAt > 0
    ? `运行态容器估算：${new Date(memoryEstimate.generatedAt).toLocaleString()} · 已覆盖 ${formatBytes(memoryEstimate.coveredBytes)} / RSS ${formatBytes(memoryEstimate.rssBytes)} · 覆盖 ${memoryEstimate.coveragePercent.toFixed(1)}% · 未覆盖部分需看 V8 heap space 或 Heap Snapshot · 缓存 ${Math.round(memoryEstimate.cacheTtlMs / 1000)} 秒`
    : '运行态内存画像尚未生成。';
  // Worker Pool 状态渲染（已移至 Worker tab）
  renderWorkerPoolSection((data.perf as any).workerPool);
  pathfindingResetMetaEl.textContent = data.perf.pathfinding.statsStartedAt > 0
    ? `寻路统计起点：${new Date(data.perf.pathfinding.statsStartedAt).toLocaleString()} · 已累计 ${formatDurationSeconds(data.perf.pathfinding.statsElapsedSec)}`
    : '寻路统计区间尚未开始。';
  pathfindingAvgQueueMsEl.textContent = `${data.perf.pathfinding.avgQueueMs.toFixed(2)} ms`;
  pathfindingQueueNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxQueueMs.toFixed(2)} ms · 队列峰值 ${data.perf.pathfinding.peakQueueDepth}`;
  pathfindingAvgRunMsEl.textContent = `${data.perf.pathfinding.avgRunMs.toFixed(2)} ms`;
  pathfindingRunNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxRunMs.toFixed(2)} ms · 已完成 ${data.perf.pathfinding.completed}`;
  pathfindingAvgExpandedNodesEl.textContent = `${data.perf.pathfinding.avgExpandedNodes.toFixed(1)}`;
  pathfindingExpandedNoteEl.textContent = `峰值 ${data.perf.pathfinding.maxExpandedNodes} · 成功 ${data.perf.pathfinding.succeeded}`;
  pathfindingDropTotalEl.textContent = `${data.perf.pathfinding.droppedPending + data.perf.pathfinding.droppedStaleResults}`;
  pathfindingDropNoteEl.textContent = `等待丢弃 ${data.perf.pathfinding.droppedPending} · 结果过期 ${data.perf.pathfinding.droppedStaleResults}`;
  renderPerfLists(data);
}

/** renderPlayerList：渲染玩家列表。 */
function renderPlayerList(data: GmStateRes): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const filtered = getFilteredPlayers(data);

  if (!selectedPlayerId || !filtered.some((player) => player.id === selectedPlayerId)) {
    /** selectedPlayerId：selected玩家ID。 */
    selectedPlayerId = filtered[0]?.id ?? data.players[0]?.id ?? null;
  }

  if (filtered.length === 0) {
    lastPlayerListStructureKey = renderGmPlayerListSection({
      playerListEl,
      playerPageMetaEl,
      playerPrevPageBtn,
      playerNextPageBtn,
    }, {
      data,
      filtered,
      selectedPlayerId,
      lastStructureKey: lastPlayerListStructureKey,
      getPlayerRowMarkup,
      patchPlayerRow,
    });
    return;
  }
  lastPlayerListStructureKey = renderGmPlayerListSection({
    playerListEl,
    playerPageMetaEl,
    playerPrevPageBtn,
    playerNextPageBtn,
  }, {
    data,
    filtered,
    selectedPlayerId,
    lastStructureKey: lastPlayerListStructureKey,
    getPlayerRowMarkup,
    patchPlayerRow,
  });
}

/** renderEditor：渲染编辑器。 */
function renderEditor(data: GmStateRes): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = data.players.find((player) => player.id === selectedPlayerId) ?? null;
  if (!selected) {
    editorEmptyEl.classList.remove('hidden');
    editorPanelEl.classList.add('hidden');
    /** draftSnapshot：draft快照。 */
    draftSnapshot = null;
    /** draftSourcePlayerId：draft来源玩家ID。 */
    draftSourcePlayerId = null;
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = null;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    /** loadingPlayerDetailId：loading玩家详情ID。 */
    loadingPlayerDetailId = null;
    clearPlayerDatabasePanel();
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    editorEmptyEl.classList.remove('hidden');
    editorEmptyEl.textContent = loadingPlayerDetailId === selected.id
      ? t('gm.loading-player-detail')
      : (selectedPlayerDetailError?.trim() || t('gm.player.detail-unavailable'));
    editorPanelEl.classList.add('hidden');
    clearPlayerDatabasePanel(loadingPlayerDetailId === selected.id
      ? t('gm.loading-database-detail')
      : t('gm.database.detail-unavailable'));
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

  if (!draftSnapshot || draftSourcePlayerId !== detail.id || !editorDirty) {
    /** draftSnapshot：draft快照。 */
    draftSnapshot = createDefaultPlayerSnapshot(detail.snapshot);
    /** draftSourcePlayerId：draft来源玩家ID。 */
    draftSourcePlayerId = detail.id;
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
  }

  editorEmptyEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');
  ensureDirectMailDraft(detail.id);

  editorTitleEl.textContent = detail.roleName;
  editorSubtitleEl.textContent = getEditorSubtitle(detail);
  editorMetaEl.innerHTML = getEditorMetaMarkup(detail);

  const structureKey = buildEditorStructureKey(detail, draftSnapshot);
  const activeElement = document.activeElement;
  const hasActiveEditorInteraction = (
    (!!activeSearchableItemField
      && activeSearchableItemField.isConnected
      && editorContentEl.contains(activeSearchableItemField)
      && activeSearchableItemField.dataset.open === 'true')
    || (activeElement instanceof HTMLElement
      && editorContentEl.contains(activeElement)
      && (activeElement instanceof HTMLSelectElement
        || activeElement instanceof HTMLInputElement
        || activeElement instanceof HTMLTextAreaElement))
  );
  const shouldDelayStructureRefresh = (
    lastEditorStructureKey !== structureKey
    && draftSourcePlayerId === detail.id
    && hasActiveEditorInteraction
  );
  if (shouldDelayStructureRefresh) {
    /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
    editorRenderRefreshBlocked = true;
    return;
  }
  /** editorRenderRefreshBlocked：编辑器渲染Refresh Blocked。 */
  editorRenderRefreshBlocked = false;
  if (lastEditorStructureKey !== structureKey) {
    editorContentEl.innerHTML = renderVisualEditor(detail, draftSnapshot);
    /** lastEditorStructureKey：last编辑器Structure Key。 */
    lastEditorStructureKey = structureKey;
  } else {
    if (!editorDirty) {
      syncVisualEditorFieldsFromDraft(draftSnapshot);
    }
    patchEditorPreview(detail, draftSnapshot);
  }
  updateInventoryAddControls(false);
  syncSearchableItemFields(editorContentEl);

  renderPlayerDatabasePanel(detail);
  switchEditorTab(currentEditorTab);
  refreshPlayerBtn.disabled = false;
  openPlayerMailBtn.disabled = false;

  removeBotBtn.style.display = detail.meta.isBot ? '' : 'none';
  removeBotBtn.disabled = !detail.meta.isBot;
}

/** render：渲染渲染。 */
function render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!state) return;
  applyServerTabVisibility(currentServerTab);
  renderSummary(state);
  renderDatabasePanel();
  if (currentTab === 'players') {
    renderPlayerList(state);
    renderEditor(state);
  }
  if (currentTab === 'shortcuts') {
    renderShortcutMailComposer(true);
  }
}

/** getEditorTabSection：读取编辑器Tab Section。 */
function getEditorTabSection(tab: GmEditorTab): HTMLElement | null {
  return editorContentEl.querySelector<HTMLElement>(`[data-editor-tab="${tab}"]`);
}

/** syncVisualEditorToDraft：同步Visual编辑器To Draft。 */
function syncVisualEditorToDraft(scope?: ParentNode): {
/**
 * ok：ok相关字段。
 */
 ok: true } | {
 /**
 * ok：ok相关字段。
 */
 ok: false;
 /**
 * message：message相关字段。
 */
 message: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) {
    return { ok: false, message: t('gm.player.no-editable') };
  }

  const next = clone(draftSnapshot);
  const fields = (scope ?? editorContentEl).querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');

  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;

    let value: unknown;
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
      value = field.checked;
    } else if (kind === 'number') {
      value = Math.floor(Number(field.value || '0'));
      if (!Number.isFinite(value)) {
        return { ok: false, message: `${path} 不是合法数字` };
      }
    } else if (kind === 'nullable-string') {
      const text = field.value.trim();
      const emptyMode = field.dataset.emptyMode;
      value = text.length > 0 ? text : emptyMode === 'null' ? null : undefined;
    } else if (kind === 'string-array') {
      value = field.value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (kind === 'json') {
      const text = field.value.trim();
      if (!text) {
        const emptyJson = field.dataset.emptyJson;
        value = emptyJson === 'array' ? [] : emptyJson === 'null' ? null : {};
      } else {
        try {
          value = JSON.parse(text);
        } catch {
          return { ok: false, message: `${path} 的 JSON 解析失败` };
        }
      }
    } else {
      value = field.value;
    }

    setValueByPath(next, path, value);
  }

  /** draftSnapshot：draft快照。 */
  draftSnapshot = next;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  return { ok: true };
}

/** mutateDraft：处理mutate Draft。 */
function mutateDraft(mutator: (draft: PlayerState) => void): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const synced = syncVisualEditorToDraft(getEditorTabSection(currentEditorTab) ?? undefined);
  if (!synced.ok) {
    setStatus(synced.message, true);
    return false;
  }
  if (!draftSnapshot || !state) return false;
  mutator(draftSnapshot);
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  renderEditor(state);
  return true;
}

/** applyCatalogBindingChange：应用目录Binding变更。 */
function applyCatalogBindingChange(path: string, value: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) return false;

  const inventoryMatch = path.match(/^inventory\.items\.(\d+)\.itemId$/);
  const equipmentMatch = path.match(/^equipment\.(weapon|head|body|legs|accessory)\.itemId$/);
  const techniqueMatch = path.match(/^techniques\.(\d+)\.techId$/);
  const buffMatch = path.match(/^temporaryBuffs\.(\d+)\.buffId$/);
  if ((inventoryMatch || equipmentMatch || techniqueMatch || buffMatch) && !hasServerEditorCatalog()) {
    setStatus(t('gm.editor.catalog.binding-unavailable'), true);
    /** lastEditorStructureKey：last编辑器Structure Key。 */
    lastEditorStructureKey = null;
    if (state) {
      renderEditor(state);
    }
    return true;
  }

  let changed = false;
  if (inventoryMatch) {
    const index = Number(inventoryMatch[1]);
    const previousCount = draftSnapshot.inventory.items[index]?.count ?? 1;
    draftSnapshot.inventory.items[index] = createItemFromCatalog(value, previousCount);
    /** changed：changed。 */
    changed = true;
  }

  if (equipmentMatch) {
    const slot = equipmentMatch[1] as EquipSlot;
    draftSnapshot.equipment[slot] = createItemFromCatalog(value);
    /** changed：changed。 */
    changed = true;
  }

  if (techniqueMatch) {
    const index = Number(techniqueMatch[1]);
    draftSnapshot.techniques[index] = createTechniqueFromCatalog(value);
    /** changed：changed。 */
    changed = true;
  }

  if (buffMatch) {
    const index = Number(buffMatch[1]);
    const previous = draftSnapshot.temporaryBuffs?.[index];
    draftSnapshot.temporaryBuffs ??= [];
    draftSnapshot.temporaryBuffs[index] = createBuffFromCatalog(value, {
      stacks: previous?.stacks ?? 1,
      remainingTicks: previous?.remainingTicks ?? 1,
    });
    /** changed：changed。 */
    changed = true;
  }

  if (path === 'cultivatingTechId' && !value) {
    draftSnapshot.cultivatingTechId = undefined;
    /** changed：changed。 */
    changed = true;
  }

  if (!changed) {
    return false;
  }
  /** editorDirty：编辑器Dirty。 */
  editorDirty = true;
  /** lastEditorStructureKey：last编辑器Structure Key。 */
  lastEditorStructureKey = null;
  if (state) {
    renderEditor(state);
  }
  return true;
}

/** loadState：加载状态。 */
async function loadState(silent = false, refreshDetail = false, forceIncludePlayers = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!token) return;
  const shouldIncludePlayers = forceIncludePlayers
    || (!silent && (currentTab === 'players' || currentTab === 'shortcuts'))
    || refreshDetail;
  const params = new URLSearchParams();
  if (shouldIncludePlayers) {
    params.set('page', String(currentPlayerPage));
    params.set('pageSize', '50');
    params.set('sort', currentPlayerSort);
    params.set('accountStatus', currentPlayerAccountStatusFilter);
    params.set('includePlayers', '1');
    const keyword = playerSearchInput.value.trim();
    if (keyword) {
      params.set('keyword', keyword);
    }
  }
  if (currentTab === 'server' && currentServerTab === 'memory') {
    params.set('includeMemoryEstimate', '1');
  }
  let data = await request<GmStateRes>(buildGmStateApiPath(params));
  assertGmStateResponseShape(data);
  if (!shouldIncludePlayers && state) {
    data = {
      ...data,
      players: state.players,
    };
  }
  /** state：状态。 */
  state = data;
  if (shouldIncludePlayers) {
    /** currentPlayerPage：当前玩家分页。 */
    currentPlayerPage = data.playerPage.page;
    /** currentPlayerTotalPages：当前玩家总量Pages。 */
    currentPlayerTotalPages = data.playerPage.totalPages;
  }
  try {
    await loadGmMapPickerCatalog();
  } catch (error) {
    if (!gmMapPickerCatalogWarned) {
      gmMapPickerCatalogWarned = true;
      console.warn('GM 地图选择目录加载失败', error);
    }
  }
  const previousSelectedPlayerId = selectedPlayerId;
  if (shouldIncludePlayers) {
    if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
      /** selectedPlayerId：selected玩家ID。 */
      selectedPlayerId = data.players[0]?.id ?? null;
      if (selectedPlayerDetail?.id !== selectedPlayerId) {
        selectedPlayerDetail = null;
      }
    }
  }
  render();
  const shouldLoadDetail = shouldIncludePlayers && !!selectedPlayerId && (
    refreshDetail
    || selectedPlayerId !== previousSelectedPlayerId
    || selectedPlayerDetail?.id !== selectedPlayerId
  );
  if (shouldLoadDetail && selectedPlayerId) {
    await loadSelectedPlayerDetail(selectedPlayerId, true);
  } else if (shouldIncludePlayers && !selectedPlayerId) {
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = null;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    /** loadingPlayerDetailId：loading玩家详情ID。 */
    loadingPlayerDetailId = null;
  }
  if (!silent && shouldIncludePlayers) {
    setStatus(`已同步角色列表第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页，本页 ${data.players.length} 条，共 ${data.playerPage.total} 条`);
  }
  if (currentTab === 'server' && currentServerTab === 'database') {
    await loadDatabaseState(true);
  }
  // 同步地图列表到世界管理
  if (currentTab === 'world') {
    worldViewer.updateMapIds(data.mapIds);
  }
}

function buildPlayerListQueryParams(refresh = false): URLSearchParams {
  const params = new URLSearchParams({
    page: String(currentPlayerPage),
    pageSize: '50',
    sort: currentPlayerSort,
    accountStatus: currentPlayerAccountStatusFilter,
  });
  if (refresh) {
    params.set('refresh', '1');
  }
  const keyword = playerSearchInput.value.trim();
  if (keyword) {
    params.set('keyword', keyword);
  }
  return params;
}

async function loadPlayerList(silent = true, refreshDetail = false, refreshList = false): Promise<void> {
  if (!token) return;
  if (!state) {
    await loadState(silent, refreshDetail, true);
    return;
  }
  const nonce = ++playerListRequestNonce;
  const data = await request<GmPlayerListRes>(buildGmPlayersApiPath(buildPlayerListQueryParams(refreshList)));
  if (nonce !== playerListRequestNonce) {
    return;
  }
  state = {
    ...state,
    players: data.players,
    playerPage: data.playerPage,
    playerStats: data.playerStats,
    botCount: data.botCount,
  };
  currentPlayerPage = data.playerPage.page;
  currentPlayerTotalPages = data.playerPage.totalPages;

  const previousSelectedPlayerId = selectedPlayerId;
  if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = data.players[0]?.id ?? null;
    if (selectedPlayerDetail?.id !== selectedPlayerId) {
      selectedPlayerDetail = null;
    }
  }
  render();

  const shouldLoadDetail = !!selectedPlayerId && (
    refreshDetail
    || selectedPlayerId !== previousSelectedPlayerId
    || selectedPlayerDetail?.id !== selectedPlayerId
  );
  if (shouldLoadDetail && selectedPlayerId) {
    await loadSelectedPlayerDetail(selectedPlayerId, true);
  } else if (!selectedPlayerId) {
    selectedPlayerDetail = null;
    selectedPlayerDetailError = null;
    loadingPlayerDetailId = null;
  }
  if (!silent) {
    setStatus(`已同步角色列表第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页，本页 ${data.players.length} 条，共 ${data.playerPage.total} 条`);
  }
}

/** loadSelectedPlayerDetail：加载Selected玩家详情。 */
async function loadSelectedPlayerDetail(playerId: string, silent = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const nonce = ++detailRequestNonce;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = playerId;
  /** selectedPlayerDetailError：selected玩家详情错误。 */
  selectedPlayerDetailError = null;
  clearEditorRenderCache();
  render();
  try {
    const data = await request<GmPlayerDetailRes>(buildGmPlayerApiPath(playerId));
    assertGmPlayerDetailResponseShape(data);
    if (nonce !== detailRequestNonce || selectedPlayerId !== playerId) {
      return;
    }
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = data.player;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    if (!silent) {
      setStatus(t('gm.player.detail-loaded', { name: data.player.name }));
    }
  } catch (error) {
    if (nonce === detailRequestNonce && selectedPlayerId === playerId) {
      selectedPlayerDetail = null;
      selectedPlayerDetailError = error instanceof Error ? error.message : t('gm.player.detail-load-failed');
    }
    throw error;
  } finally {
    if (nonce === detailRequestNonce && loadingPlayerDetailId === playerId) {
      loadingPlayerDetailId = null;
    }
    render();
  }
}

/** startPolling：启动Polling。 */
function startPolling(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(() => {
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.refresh.failed'), true);
    });
  }, GM_PANEL_POLL_INTERVAL_MS);
}

/** showShell：处理显示Shell。 */
function showShell(): void {
  loginOverlay.classList.add('hidden');
  gmShell.classList.remove('hidden');
}

/** showLogin：处理显示Login。 */
function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  gmShell.classList.add('hidden');
  syncPersistedGmPasswordToInputs();
}

/** logout：处理logout。 */
function logout(message?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** token：令牌。 */
  token = '';
  /** state：状态。 */
  state = null;
  /** databaseState：数据库状态。 */
  databaseState = null;
  /** databaseStateLoading：数据库状态Loading。 */
  databaseStateLoading = false;
  /** serverLogsEntries：服务端日志已加载行。 */
  serverLogsEntries = [];
  /** serverLogsNextBeforeSeq：服务端日志向上翻页游标。 */
  serverLogsNextBeforeSeq = undefined;
  /** serverLogsHasMore：服务端日志是否还有更早行。 */
  serverLogsHasMore = false;
  /** serverLogsBufferSize：服务端日志缓冲行数。 */
  serverLogsBufferSize = 0;
  /** serverLogsLoading：服务端日志读取中。 */
  serverLogsLoading = false;
  renderServerLogsPanel();
  /** redeemGroupsState：兑换分组状态。 */
  redeemGroupsState = [];
  /** selectedRedeemGroupId：selected兑换分组ID。 */
  selectedRedeemGroupId = null;
  /** redeemGroupDetailState：兑换分组详情状态。 */
  redeemGroupDetailState = null;
  /** redeemDraft：兑换Draft。 */
  redeemDraft = createDefaultRedeemGroupDraft();
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [];
  /** redeemLoading：兑换Loading。 */
  redeemLoading = false;
  /** selectedPlayerId：selected玩家ID。 */
  selectedPlayerId = null;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = null;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  ensureDirectMailDraft(null);
  /** broadcastMailDraft：broadcast邮件Draft。 */
  broadcastMailDraft = createDefaultMailComposerDraft();
  resetMailAttachmentPageStore('shortcut');
  sessionStorage.removeItem(GM_ACCESS_TOKEN_STORAGE_KEY);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    /** pollTimer：poll Timer。 */
    pollTimer = null;
  }
  if (suggestionSearchTimer !== null) {
    window.clearTimeout(suggestionSearchTimer);
    /** suggestionSearchTimer：建议搜索Timer。 */
    suggestionSearchTimer = null;
  }
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
    /** playerSearchTimer：玩家搜索Timer。 */
    playerSearchTimer = null;
  }
  playerListEl.innerHTML = '';
  /** lastPlayerListStructureKey：last玩家列表Structure Key。 */
  lastPlayerListStructureKey = null;
  clearEditorRenderCache();
  /** lastSuggestionStructureKey：last建议Structure Key。 */
  lastSuggestionStructureKey = null;
  /** currentSuggestionPage：当前建议分页。 */
  currentSuggestionPage = 1;
  /** currentSuggestionTotalPages：当前建议总量Pages。 */
  currentSuggestionTotalPages = 1;
  /** currentSuggestionTotal：当前建议总量。 */
  currentSuggestionTotal = 0;
  /** currentSuggestionKeyword：当前建议Keyword。 */
  currentSuggestionKeyword = '';
  suggestionSearchInput.value = '';
  suggestionPageMetaEl.textContent = '第 1 / 1 页';
  suggestionPrevPageBtn.disabled = true;
  suggestionNextPageBtn.disabled = true;
  currentNetworkInPage = 1;
  currentNetworkOutPage = 1;
  networkInPageMetaEl.textContent = '第 1 / 1 页 · 共 0 条';
  networkOutPageMetaEl.textContent = '第 1 / 1 页 · 共 0 条';
  networkInPrevPageBtn.disabled = true;
  networkInNextPageBtn.disabled = true;
  networkOutPrevPageBtn.disabled = true;
  networkOutNextPageBtn.disabled = true;
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  /** currentPlayerTotalPages：当前玩家总量Pages。 */
  currentPlayerTotalPages = 1;
  playerSearchInput.value = '';
  playerPageMetaEl.textContent = '第 1 / 1 页 · 共 0 条';
  playerPrevPageBtn.disabled = true;
  playerNextPageBtn.disabled = true;
  /** lastNetworkInStructureKey：last Network In Structure Key。 */
  lastNetworkInStructureKey = null;
  /** lastNetworkOutStructureKey：last Network Out Structure Key。 */
  lastNetworkOutStructureKey = null;
  /** lastCpuBreakdownStructureKey：last Cpu Breakdown Structure Key。 */
  lastCpuBreakdownStructureKey = null;
  /** lastMemoryDomainStructureKey：last Memory Domain Structure Key。 */
  lastMemoryDomainStructureKey = null;
  /** lastMemoryInstanceStructureKey：last Memory Instance Structure Key。 */
  lastMemoryInstanceStructureKey = null;
  suggestionListEl.innerHTML = '';
  summaryNetInBreakdownEl.innerHTML = '';
  summaryNetOutBreakdownEl.innerHTML = '';
  cpuBreakdownListEl.innerHTML = '';
  memoryDomainListEl.innerHTML = '';
  memoryInstanceListEl.innerHTML = '';
  clearPlayerDatabasePanel();
  worldViewer.stopPolling();
  renderShortcutMailComposer();
  switchTab('server');
  switchEditorTab('basic');
  loginErrorEl.textContent = message ?? '';
  setStatus('');
  showLogin();
}

/** delayRefresh：处理delay Refresh。 */
async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, GM_APPLY_DELAY_MS));
  if (currentTab === 'players' || currentTab === 'shortcuts') {
    await loadPlayerList(true, true, true);
  } else {
    await loadState(true, true);
  }
  setStatus(`${message}，已完成同步`);
}

/** login：处理login。 */
async function login(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const password = passwordInput.value.trim();
  if (!password) {
    loginErrorEl.textContent = t('gm.login.enter-password');
    return;
  }

  loginSubmitBtn.disabled = true;
  loginErrorEl.textContent = '';

  try {
    const result = await request<GmLoginRes>(`${GM_AUTH_API_BASE_PATH}/login`, {
      method: 'POST',
      body: JSON.stringify({ password } satisfies GmLoginReq),
    });
    /** token：令牌。 */
    token = result.accessToken;
    sessionStorage.setItem(GM_ACCESS_TOKEN_STORAGE_KEY, token);
    persistGmPassword(password);
    showShell();
    await loadEditorCatalog();
    await loadState();
    startPolling();
    passwordInput.value = '';
    gmPasswordCurrentInput.value = readPersistedGmPassword();
    setStatus(t('gm.login.token-issued', { hours: Math.round(result.expiresInSec / 3600) }));
  } catch (error) {
    loginErrorEl.textContent = error instanceof Error ? error.message : t('gm.login.failed');
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

// ─── 环境变量管理 ───

const envListEl = document.getElementById('gm-env-list') as HTMLElement;
const envRefreshBtn = document.getElementById('gm-env-refresh') as HTMLButtonElement;
const envReloadBtn = document.getElementById('gm-env-reload') as HTMLButtonElement;
const envExpandBtn = document.getElementById('gm-env-expand') as HTMLButtonElement;
const envCollapseBtn = document.getElementById('gm-env-collapse') as HTMLButtonElement;
const envMetaEl = document.getElementById('gm-env-meta') as HTMLDivElement;
let envVars: GmEnvironmentVarItem[] = [];
let envVarsLoading = false;

async function loadEnvironmentVars(): Promise<void> {
  if (!token || envVarsLoading) return;
  envVarsLoading = true;
  renderEnvironmentVars();
  try {
    const res = await request<GmEnvironmentVarListRes>(`${GM_API_BASE_PATH}/environment/vars`);
    envVars = res.items ?? [];
    envVarsLoading = false;
    renderEnvironmentVars();
  } catch (error) {
    envVarsLoading = false;
    envRefreshBtn.disabled = false;
    envReloadBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    envMetaEl.textContent = message;
    if (envVars.length === 0) {
      envListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${escapeHtml(message)}</div>`;
    }
  }
}

function renderEnvironmentVars(): void {
  envRefreshBtn.disabled = envVarsLoading;
  envReloadBtn.disabled = envVarsLoading;
  envExpandBtn.disabled = envVarsLoading;
  envCollapseBtn.disabled = envVarsLoading;
  if (envVarsLoading) {
    envMetaEl.textContent = '环境变量加载中...';
    return;
  }

  envMetaEl.textContent = `共 ${envVars.length} 个环境变量`;
  if (envVars.length === 0) {
    envListEl.innerHTML = '<div class="env-empty">当前没有可展示的环境变量。</div>';
    return;
  }

  const groups = new Map<string, GmEnvironmentVarItem[]>();
  for (const item of envVars) {
    if (!groups.has(item.category)) {
      groups.set(item.category, []);
    }
    groups.get(item.category)!.push(item);
  }

  envListEl.innerHTML = [...groups.entries()].map(([category, items]) => {
    const rows = items.map((item) => renderEnvironmentVarRow(item)).join('');
    return `
      <details class="env-group" open data-env-group="${escapeHtml(category)}">
        <summary class="env-group-summary">
          <span>${escapeHtml(category)}</span>
          <span class="env-group-count">${items.length}</span>
        </summary>
        <div class="env-group-body">
          ${rows}
        </div>
      </details>
    `;
  }).join('');

  envListEl.querySelectorAll<HTMLElement>('[data-env-key]').forEach((row) => {
    const key = row.dataset.envKey!;
    const valueInput = row.querySelector<HTMLInputElement>('input[data-env-value]');
    const persistInput = row.querySelector<HTMLInputElement>('input[data-env-persist]');
    const saveBtn = row.querySelector<HTMLButtonElement>('[data-env-save]');
    const deleteBtn = row.querySelector<HTMLButtonElement>('[data-env-delete]');
    if (saveBtn && valueInput && persistInput) {
      saveBtn.addEventListener('click', () => {
        saveEnvironmentVar(key, valueInput.value, persistInput.checked).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '保存环境变量失败', true);
        });
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        deleteEnvironmentVar(key).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '删除环境变量失败', true);
        });
      });
    }
  });
}

function renderEnvironmentVarRow(item: GmEnvironmentVarItem): string {
  const sourceLabelMap: Record<GmEnvironmentVarItem['source'], string> = {
    process_env: '进程环境',
    runtime_override: '运行时覆盖',
    runtime_file: '本地覆盖',
    unset: '未设置',
  };
  const currentValue = item.value || '（未设置）';
  const inputValue = item.sensitive ? '' : item.value;
  const editable = item.editable;
  const persistChecked = item.persistent ? 'checked' : '';
  const persistDisabled = item.persistable ? '' : 'disabled';
  const saveDisabled = editable ? '' : 'disabled';
  const deleteDisabled = editable ? '' : 'disabled';
  const restartBadge = item.restartRequired ? '<span class="env-badge meta">需重启</span>' : '';
  const managedBadge = item.managed ? '<span class="env-badge meta">已注册</span>' : '<span class="env-badge meta">未注册</span>';
  const persistBadge = item.persistent ? '<span class="env-badge meta">已持久化</span>' : '';
  const sourceBadge = `<span class="env-badge source-${item.source}">${sourceLabelMap[item.source]}</span>`;
  const sensitiveHint = item.sensitive ? '<span class="env-badge meta">敏感值已脱敏</span>' : '';

  return `
    <div class="env-row" data-env-key="${escapeHtml(item.key)}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.label)}</span>
          <code class="env-key">${escapeHtml(item.key)}</code>
        </div>
        <div class="env-row-badges">
          ${sourceBadge}
          ${managedBadge}
          ${restartBadge}
          ${persistBadge}
          ${sensitiveHint}
        </div>
      </div>
      <div class="env-desc">${escapeHtml(item.description)}</div>
      <div class="env-current">当前值：<code>${escapeHtml(currentValue)}</code></div>
      <div class="env-edit">
        <input data-env-value type="text" ${editable ? '' : 'disabled'} placeholder="${item.sensitive ? '输入新值覆盖当前值' : '输入新的环境变量值'}" value="${escapeHtml(inputValue)}" />
        <label class="env-persist-label">
          <input data-env-persist type="checkbox" ${persistChecked} ${persistDisabled} />
          持久化
        </label>
        <div class="env-actions">
          <button class="small-btn primary" type="button" data-env-save ${saveDisabled}>保存</button>
          <button class="small-btn" type="button" data-env-delete ${deleteDisabled}>删除覆盖</button>
        </div>
      </div>
    </div>
  `;
}

async function saveEnvironmentVar(key: string, value: string, persist: boolean): Promise<void> {
  if (!value.trim()) {
    throw new Error('环境变量值不能为空');
  }
  await request(`${GM_API_BASE_PATH}/environment/vars/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value, persist } satisfies GmSetEnvironmentVarReq),
  });
  setStatus(`环境变量 ${key} 已保存${persist ? '并持久化' : ''}`);
  await loadEnvironmentVars();
}

async function deleteEnvironmentVar(key: string): Promise<void> {
  if (!confirm(`确认删除环境变量覆盖 "${key}"？`)) return;
  await request(`${GM_API_BASE_PATH}/environment/vars/${encodeURIComponent(key)}`, { method: 'DELETE' });
  setStatus(`环境变量 ${key} 已回滚`);
  await loadEnvironmentVars();
}

async function reloadEnvironmentVars(): Promise<void> {
  const res = await request<GmReloadEnvironmentVarsRes>(`${GM_API_BASE_PATH}/environment/reload`, {
    method: 'POST',
  });
  setStatus(`本地覆盖已重载：${res.count} 个持久化项`);
  await loadEnvironmentVars();
}

function toggleAllEnvironmentGroups(open: boolean): void {
  envListEl.querySelectorAll<HTMLDetailsElement>('details.env-group').forEach((group) => {
    group.open = open;
  });
}

// ─── 游戏配置中心 ───

const gameConfigListEl = document.getElementById('gm-gameconfig-list') as HTMLElement;
const gameConfigRefreshBtn = document.getElementById('gm-gameconfig-refresh') as HTMLButtonElement;
const gameConfigExpandBtn = document.getElementById('gm-gameconfig-expand') as HTMLButtonElement;
const gameConfigCollapseBtn = document.getElementById('gm-gameconfig-collapse') as HTMLButtonElement;
const gameConfigMetaEl = document.getElementById('gm-gameconfig-meta') as HTMLDivElement;
let gameConfigItems: GameConfigItem[] = [];
let gameConfigLoading = false;

async function loadGameConfig(): Promise<void> {
  if (!token || gameConfigLoading) return;
  gameConfigLoading = true;
  renderGameConfig();
  try {
    const [configRes] = await Promise.all([
      request<GameConfigListRes>(`${GM_API_BASE_PATH}/game-config`),
      loadRuntimeFlags(),
    ]);
    gameConfigItems = configRes.items ?? [];
    gameConfigLoading = false;
    renderGameConfig();
  } catch (error) {
    gameConfigLoading = false;
    gameConfigRefreshBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    gameConfigMetaEl.textContent = message;
    if (gameConfigItems.length === 0) {
      gameConfigListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${escapeHtml(message)}</div>`;
    }
  }
}

function renderGameConfig(): void {
  gameConfigRefreshBtn.disabled = gameConfigLoading;
  gameConfigExpandBtn.disabled = gameConfigLoading;
  gameConfigCollapseBtn.disabled = gameConfigLoading;
  if (gameConfigLoading && runtimeFlagsLoading) {
    gameConfigMetaEl.textContent = '配置加载中...';
    return;
  }

  const totalConfigCount = gameConfigItems.length;
  const flagCount = mergeRuntimeFlags(runtimeFlags).length;
  gameConfigMetaEl.textContent = `${flagCount} 个运行时开关 · ${totalConfigCount} 项配置`;

  // 运行时开关区块（热生效）
  const flagsSectionHtml = `<details class="env-group" open>
    <summary class="env-group-title">运行时开关（热生效） <span class="env-group-count">(${flagCount})</span></summary>
    <div class="env-group-body" id="gameconfig-flags-container">
      ${buildRuntimeFlagsHtml()}
    </div>
  </details>`;

  // 游戏配置区块（重启生效）
  let configHtml = '';
  if (totalConfigCount > 0) {
    const groups = new Map<string, GameConfigItem[]>();
    for (const item of gameConfigItems) {
      if (!groups.has(item.category)) {
        groups.set(item.category, []);
      }
      groups.get(item.category)!.push(item);
    }
    for (const [category, items] of groups) {
      configHtml += `<details class="env-group" open>
        <summary class="env-group-title">${escapeHtml(category)} <span class="env-group-count">(${items.length})</span></summary>
        <div class="env-group-body">`;
      for (const item of items) {
        configHtml += renderGameConfigRow(item);
      }
      configHtml += '</div></details>';
    }
  } else if (!gameConfigLoading) {
    configHtml = '<div class="env-empty">当前没有已注册的游戏配置。</div>';
  }

  gameConfigListEl.innerHTML = flagsSectionHtml + configHtml;

  // 绑定运行时开关事件
  const flagsContainer = gameConfigListEl.querySelector<HTMLElement>('#gameconfig-flags-container');
  if (flagsContainer) {
    bindRuntimeFlagsEvents(flagsContainer);
  }

  // 绑定游戏配置事件
  gameConfigListEl.querySelectorAll<HTMLElement>('.env-row[data-config-key]').forEach((rowEl) => {
    const key = rowEl.dataset.configKey!;
    const saveBtn = rowEl.querySelector<HTMLButtonElement>('[data-config-save]');
    const resetBtn = rowEl.querySelector<HTMLButtonElement>('[data-config-reset]');
    const toggleInput = rowEl.querySelector<HTMLInputElement>('[data-config-toggle]');
    const valueInput = rowEl.querySelector<HTMLInputElement>('[data-config-value]');

    if (toggleInput) {
      toggleInput.addEventListener('change', () => {
        saveGameConfig(key, String(toggleInput.checked)).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '保存配置失败', true);
        });
      });
    }
    if (saveBtn && valueInput) {
      saveBtn.addEventListener('click', () => {
        saveGameConfig(key, valueInput.value).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '保存配置失败', true);
        });
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        resetGameConfig(key).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '重置配置失败', true);
        });
      });
    }
  });
}

function renderGameConfigRow(item: GameConfigItem): string {
  const pendingBadge = item.pendingRestart ? '<span class="env-badge meta" style="background:var(--stamp-orange);color:#fff;">待重启</span>' : '';
  const defaultBadge = `<span class="env-badge meta">默认: ${escapeHtml(item.defaultValue)}</span>`;

  let controlHtml = '';
  if (item.valueType === 'boolean') {
    const checked = item.currentValue === 'true' ? 'checked' : '';
    controlHtml = `
      <label class="env-persist-label" style="cursor:pointer;">
        <input data-config-toggle type="checkbox" ${checked} />
        ${item.currentValue === 'true' ? '已开启' : '已关闭'}
      </label>`;
  } else if (item.valueType === 'number') {
    const minAttr = item.min !== undefined ? `min="${item.min}"` : '';
    const maxAttr = item.max !== undefined ? `max="${item.max}"` : '';
    controlHtml = `
      <input data-config-value type="number" value="${escapeHtml(item.pendingValue ?? item.currentValue)}" ${minAttr} ${maxAttr} style="width:120px;" />
      <button class="small-btn primary" type="button" data-config-save>保存</button>`;
  } else {
    controlHtml = `
      <input data-config-value type="text" value="${escapeHtml(item.pendingValue ?? item.currentValue)}" style="flex:1;" />
      <button class="small-btn primary" type="button" data-config-save>保存</button>`;
  }

  return `
    <div class="env-row" data-config-key="${escapeHtml(item.key)}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.label)}</span>
          <code class="env-key">${escapeHtml(item.key)}</code>
        </div>
        <div class="env-row-badges">
          ${defaultBadge}
          ${pendingBadge}
        </div>
      </div>
      <div class="env-desc">${escapeHtml(item.description)}</div>
      <div class="env-edit">
        ${controlHtml}
        <button class="small-btn" type="button" data-config-reset>恢复默认</button>
      </div>
    </div>
  `;
}

async function saveGameConfig(key: string, value: string): Promise<void> {
  await request<GameConfigSetRes>(`${GM_API_BASE_PATH}/game-config/${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });
  setStatus(`配置 ${key} 已保存，重启后生效`);
  await loadGameConfig();
}

async function resetGameConfig(key: string): Promise<void> {
  if (!confirm(`确认将 "${key}" 恢复为默认值？`)) return;
  await request<GameConfigDeleteRes>(`${GM_API_BASE_PATH}/game-config/${encodeURIComponent(key)}`, { method: 'DELETE' });
  setStatus(`配置 ${key} 已恢复默认`);
  await loadGameConfig();
}

function toggleAllGameConfigGroups(open: boolean): void {
  gameConfigListEl.querySelectorAll<HTMLDetailsElement>('details.env-group').forEach((group) => {
    group.open = open;
  });
}

// ─── AI 配置中心 ───

const aiProviderListEl = document.getElementById('gm-ai-list') as HTMLElement;
const aiProviderRefreshBtn = document.getElementById('gm-ai-refresh') as HTMLButtonElement;
const aiProviderAddTextBtn = document.getElementById('gm-ai-add-text') as HTMLButtonElement;
const aiProviderAddImageBtn = document.getElementById('gm-ai-add-image') as HTMLButtonElement;
const aiProviderMetaEl = document.getElementById('gm-ai-meta') as HTMLDivElement;
let aiProviderConfigs: GmAiProviderConfigItem[] = [];
let aiProviderConfigsLoading = false;
let aiSecretStoreAvailable = false;

const AI_TEXT_PROVIDER_OPTIONS: readonly GmAiTextProvider[] = ['openai', 'openai-compatible', 'anthropic'];
const AI_IMAGE_PROVIDER_OPTIONS: readonly GmAiImageProvider[] = ['openai', 'dashscope'];
const aiModelTestStateByKey = new Map<string, { kind: 'pending' | 'success' | 'error'; text: string }>();

async function loadAiProviderConfigs(): Promise<void> {
  if (!token || aiProviderConfigsLoading) return;
  aiProviderConfigsLoading = true;
  renderAiProviderConfigs();
  try {
    const res = await request<GmAiProviderConfigListRes>(`${GM_API_BASE_PATH}/ai/providers`);
    aiProviderConfigs = res.items ?? [];
    aiSecretStoreAvailable = res.secretStoreAvailable;
    aiProviderConfigsLoading = false;
    renderAiProviderConfigs();
  } catch (error) {
    aiProviderConfigsLoading = false;
    aiProviderRefreshBtn.disabled = false;
    aiProviderAddTextBtn.disabled = false;
    aiProviderAddImageBtn.disabled = false;
    const message = error instanceof Error ? error.message : '加载失败';
    aiProviderMetaEl.textContent = message;
    if (aiProviderConfigs.length === 0) {
      aiProviderListEl.innerHTML = `<div class="env-empty" style="color:var(--stamp-red);">${escapeHtml(message)}</div>`;
    }
  }
}

function renderAiProviderConfigs(): void {
  aiProviderRefreshBtn.disabled = aiProviderConfigsLoading;
  aiProviderAddTextBtn.disabled = aiProviderConfigsLoading;
  aiProviderAddImageBtn.disabled = aiProviderConfigsLoading;
  if (aiProviderConfigsLoading) {
    aiProviderMetaEl.textContent = 'AI 配置加载中...';
    return;
  }

  const secretNote = aiSecretStoreAvailable ? '密钥存储可用' : '密钥存储不可用：需配置 SERVER_SECRET_ENCRYPTION_KEY 和数据库';
  aiProviderMetaEl.textContent = `共 ${aiProviderConfigs.length} 项配置 · ${secretNote}`;

  const rowsByKind = new Map<GmAiProviderKind, GmAiProviderConfigItem[]>();
  rowsByKind.set('text', []);
  rowsByKind.set('image', []);
  for (const item of aiProviderConfigs) {
    rowsByKind.get(item.kind)?.push(item);
  }

  const textRows = rowsByKind.get('text') ?? [];
  const imageRows = rowsByKind.get('image') ?? [];
  aiProviderListEl.innerHTML = `
    ${renderAiProviderGroup('text', '文本模型', textRows)}
    ${renderAiProviderGroup('image', '图片模型', imageRows)}
  `;

  aiProviderListEl.querySelectorAll<HTMLElement>('.env-row[data-ai-kind][data-ai-scope]').forEach((rowEl) => {
    const kind = rowEl.dataset.aiKind as GmAiProviderKind;
    const scope = rowEl.dataset.aiScope ?? 'default';
    const saveBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-save]');
    const deleteBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-delete]');
    const fetchModelsBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-fetch-models]');
    const addModelBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-add-model]');
    const deleteAllModelsBtn = rowEl.querySelector<HTMLButtonElement>('[data-ai-delete-all-models]');
    const providerSelect = rowEl.querySelector<HTMLSelectElement>('[data-ai-provider]');
    const imageOnlyEls = rowEl.querySelectorAll<HTMLElement>('[data-ai-image-only]');

    providerSelect?.addEventListener('change', () => {
      const isImage = kind === 'image';
      imageOnlyEls.forEach((el) => el.classList.toggle('hidden', !isImage));
    });
    saveBtn?.addEventListener('click', () => {
      saveAiProviderConfig(kind, scope, rowEl).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : '保存 AI 配置失败', true);
      });
    });
    fetchModelsBtn?.addEventListener('click', () => {
      fetchAiProviderModels(kind, scope).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : '获取模型列表失败', true);
      });
    });
    addModelBtn?.addEventListener('click', () => {
      addAiProviderModel(rowEl);
    });
    deleteAllModelsBtn?.addEventListener('click', () => {
      if (rowEl.dataset.aiDraft === 'true') {
        deleteAllAiProviderModelsLocally(rowEl);
        return;
      }
      deleteAllAiProviderModels(kind, scope).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : '删除全部模型失败', true);
      });
    });
    deleteBtn?.addEventListener('click', () => {
      deleteAiProviderConfig(kind, scope).catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : '删除 AI 配置失败', true);
      });
    });
    rowEl.querySelectorAll<HTMLButtonElement>('[data-ai-test-model]').forEach((button) => {
      button.addEventListener('click', () => {
        const modelName = button.dataset.aiTestModel ?? '';
        testAiProviderModel(kind, scope, modelName).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '测试模型失败', true);
        });
      });
    });
    rowEl.querySelectorAll<HTMLButtonElement>('[data-ai-delete-model]').forEach((button) => {
      button.addEventListener('click', () => {
        const modelName = button.dataset.aiDeleteModel ?? '';
        if (rowEl.dataset.aiDraft === 'true') {
          removeAiProviderModelLocally(rowEl, modelName);
          return;
        }
        deleteAiProviderModel(kind, scope, modelName).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : '删除模型失败', true);
        });
      });
    });
  });
}

function renderAiProviderGroup(kind: GmAiProviderKind, label: string, items: GmAiProviderConfigItem[]): string {
  const rows = items.length > 0
    ? items.map((item) => renderAiProviderConfigRow(item)).join('')
    : `<div class="env-empty">当前没有${escapeHtml(label)}配置。</div>`;
  return `
    <details class="env-group" open>
      <summary class="env-group-summary">
        <span>${escapeHtml(label)}</span>
        <span class="env-group-count">${items.length}</span>
      </summary>
      <div class="env-group-body">${rows}</div>
    </details>
  `;
}

function renderAiProviderConfigRow(item: GmAiProviderConfigItem): string {
  const providerOptions = (item.kind === 'image' ? AI_IMAGE_PROVIDER_OPTIONS : AI_TEXT_PROVIDER_OPTIONS)
    .map((provider) => `<option value="${provider}" ${provider === item.provider ? 'selected' : ''}>${provider}</option>`)
    .join('');
  const enabledBadge = item.enabled ? '<span class="env-badge source-process_env">已启用</span>' : '<span class="env-badge source-unset">已禁用</span>';
  const secretBadge = item.secretConfigured ? '<span class="env-badge source-runtime_file">密钥已配置</span>' : '<span class="env-badge meta">密钥未配置</span>';
  const imageFieldsClass = item.kind === 'image' ? '' : 'hidden';
  const models = item.models;
  const modelRowsHtml = models.length > 0
    ? models.map((model) => renderAiProviderModelRow(item, model)).join('')
    : '<div class="ai-model-row"><div class="ai-model-name">当前没有模型</div><div class="ai-model-meta">请手动添加或获取模型列表</div><div class="ai-model-actions"></div></div>';
  return `
    <div class="env-row" data-ai-kind="${escapeHtml(item.kind)}" data-ai-scope="${escapeHtml(item.scope)}" data-ai-draft="${item.revision <= 0 ? 'true' : 'false'}">
      <div class="env-row-head">
        <div class="env-row-title">
          <span class="env-label">${escapeHtml(item.kind === 'text' ? '文本模型' : '图片模型')} · ${escapeHtml(item.scope)}</span>
          <code class="env-key">revision ${escapeHtml(String(item.revision))} · ${escapeHtml(item.updatedAt || '未保存')}</code>
        </div>
        <div class="env-row-badges">
          ${enabledBadge}
          ${secretBadge}
          <span class="env-badge meta">${escapeHtml(item.provider)}</span>
        </div>
      </div>
      <div class="env-desc">scope 用于区分默认模型和未来细分场景；API Key 留空表示沿用当前密钥引用。</div>
      <div class="env-edit">
        <label class="env-persist-label"><input data-ai-enabled type="checkbox" ${item.enabled ? 'checked' : ''} />启用</label>
        <select data-ai-provider>${providerOptions}</select>
        <input data-ai-base-url type="text" value="${escapeHtml(item.baseURL)}" placeholder="Base URL，例如 https://api.example.com" />
        <input data-ai-timeout-ms type="number" min="1000" max="300000" step="1000" value="${escapeHtml(String(item.timeoutMs || (item.kind === 'image' ? 60000 : 30000)))}" placeholder="超时 ms" />
      </div>
      <div class="env-edit ${imageFieldsClass}" data-ai-image-only>
        <input data-ai-image-size type="text" value="${escapeHtml(item.imageSize || '1024x1024')}" placeholder="图片尺寸，例如 1024x1024" />
        <input data-ai-image-quality type="text" value="${escapeHtml(item.imageQuality || 'medium')}" placeholder="图片质量，例如 medium" />
      </div>
      <div class="env-edit">
        <input data-ai-secret-ref type="text" value="${escapeHtml(item.secretKeyRef)}" placeholder="密钥引用名，例如 ai_default_text" />
        <input data-ai-api-key type="password" value="" placeholder="${aiSecretStoreAvailable ? '可选：输入新 API Key 覆盖密钥' : '密钥存储不可用'}" ${aiSecretStoreAvailable ? '' : 'disabled'} autocomplete="new-password" />
        <div class="env-actions">
          <button class="small-btn primary" type="button" data-ai-save>保存</button>
          <button class="small-btn" type="button" data-ai-fetch-models ${item.secretConfigured ? '' : 'disabled'}>获取模型列表</button>
          <button class="small-btn" type="button" data-ai-add-model>手动添加模型</button>
          <button class="small-btn danger" type="button" data-ai-delete-all-models ${models.length > 0 ? '' : 'disabled'}>删除全部模型</button>
          <button class="small-btn danger" type="button" data-ai-delete>删除配置</button>
        </div>
      </div>
      <div class="ai-model-table" data-ai-models>
        ${modelRowsHtml}
      </div>
    </div>
  `;
}

function renderAiProviderModelRow(item: GmAiProviderConfigItem, model: GmAiProviderModelItem): string {
  const sourceLabel = model.source === 'fetched' ? '接口获取' : model.source === 'legacy' ? '旧配置' : '手动';
  const stateKey = getAiModelStateKey(item.kind, item.scope, model.name);
  const testState = aiModelTestStateByKey.get(stateKey);
  const testStateHtml = testState
    ? `<span class="ai-model-test-state" data-kind="${testState.kind}" title="${escapeHtml(testState.text)}">${escapeHtml(testState.text)}</span>`
    : '<span class="ai-model-test-state" data-kind="idle">未测试</span>';
  return `
    <div class="ai-model-row" data-ai-model-row data-ai-model-name="${escapeHtml(model.name)}" data-ai-model-source="${escapeHtml(model.source)}" data-ai-model-added-at="${escapeHtml(model.addedAt)}">
      <div class="ai-model-name" title="${escapeHtml(model.name)}">${escapeHtml(model.name)}</div>
      <div class="ai-model-meta">
        <span>${escapeHtml(sourceLabel)}</span>
        <span>${model.enabled ? '启用' : '禁用'}</span>
        ${testStateHtml}
      </div>
      <div class="ai-model-actions">
        <button class="small-btn" type="button" data-ai-test-model="${escapeHtml(model.name)}" ${item.secretConfigured ? '' : 'disabled'}>测试</button>
        <button class="small-btn danger" type="button" data-ai-delete-model="${escapeHtml(model.name)}">删除模型</button>
      </div>
    </div>
  `;
}

function getAiModelStateKey(kind: GmAiProviderKind, scope: string, modelName: string): string {
  return `${kind}:${scope}:${modelName}`;
}

function addAiProviderConfig(kind: GmAiProviderKind): void {
  const existingScopes = new Set(aiProviderConfigs.filter((item) => item.kind === kind).map((item) => item.scope));
  let scope = 'default';
  if (existingScopes.has(scope)) {
    let index = 2;
    while (existingScopes.has(`${kind}_${index}`)) index += 1;
    scope = `${kind}_${index}`;
  }
  aiProviderConfigs = [
    ...aiProviderConfigs,
    createDraftAiProviderConfig(kind, scope),
  ];
  renderAiProviderConfigs();
}

function createDraftAiProviderConfig(kind: GmAiProviderKind, scope: string): GmAiProviderConfigItem {
  return {
    scope,
    kind,
    provider: kind === 'image' ? 'openai' : 'openai-compatible',
    baseURL: '',
    modelName: kind === 'image' ? 'gpt-image-1.5' : 'gpt-5.4-mini',
    models: [{
      name: kind === 'image' ? 'gpt-image-1.5' : 'gpt-5.4-mini',
      enabled: true,
      source: 'manual',
      addedAt: new Date().toISOString(),
    }],
    timeoutMs: kind === 'image' ? 60_000 : 30_000,
    imageSize: kind === 'image' ? '1024x1024' : '',
    imageQuality: kind === 'image' ? 'medium' : '',
    secretKeyRef: `ai_${scope}_${kind}`,
    secretConfigured: false,
    enabled: true,
    revision: 0,
    updatedBy: '',
    updatedAt: '',
  };
}

async function saveAiProviderConfig(kind: GmAiProviderKind, scope: string, rowEl: HTMLElement): Promise<void> {
  const provider = rowEl.querySelector<HTMLSelectElement>('[data-ai-provider]')?.value ?? '';
  const baseURL = rowEl.querySelector<HTMLInputElement>('[data-ai-base-url]')?.value ?? '';
  const models = readAiProviderModelsFromRow(rowEl);
  const timeoutMsRaw = rowEl.querySelector<HTMLInputElement>('[data-ai-timeout-ms]')?.value ?? '';
  const imageSize = rowEl.querySelector<HTMLInputElement>('[data-ai-image-size]')?.value ?? '';
  const imageQuality = rowEl.querySelector<HTMLInputElement>('[data-ai-image-quality]')?.value ?? '';
  const secretKeyRef = rowEl.querySelector<HTMLInputElement>('[data-ai-secret-ref]')?.value ?? '';
  const apiKey = rowEl.querySelector<HTMLInputElement>('[data-ai-api-key]')?.value ?? '';
  const enabled = rowEl.querySelector<HTMLInputElement>('[data-ai-enabled]')?.checked ?? true;
  const timeoutMs = Number(timeoutMsRaw);

  const body: GmAiProviderConfigSetReq = {
    provider: provider as GmAiTextProvider | GmAiImageProvider,
    baseURL,
    modelName: models.find((model) => model.enabled)?.name ?? models[0]?.name ?? '',
    models,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : undefined,
    imageSize: kind === 'image' ? imageSize : undefined,
    imageQuality: kind === 'image' ? imageQuality : undefined,
    secretKeyRef,
    apiKey: apiKey.trim() ? apiKey : undefined,
    enabled,
  };
  const res = await request<GmAiProviderConfigSetRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  setStatus(`AI 配置 ${res.item.kind}/${res.item.scope} 已保存${res.secretWritten ? '，密钥已更新' : ''}`);
  await loadAiProviderConfigs();
}

function readAiProviderModelsFromRow(rowEl: HTMLElement): GmAiProviderModelItem[] {
  const models: GmAiProviderModelItem[] = [];
  rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]').forEach((modelEl) => {
    const name = modelEl.dataset.aiModelName?.trim() || modelEl.querySelector<HTMLElement>('.ai-model-name')?.textContent?.trim() || '';
    if (!name || models.some((model) => model.name === name)) return;
    const source = modelEl.dataset.aiModelSource === 'fetched' || modelEl.dataset.aiModelSource === 'legacy'
      ? modelEl.dataset.aiModelSource
      : 'manual';
    models.push({
      name,
      enabled: true,
      source,
      addedAt: modelEl.dataset.aiModelAddedAt || new Date().toISOString(),
    });
  });
  return models;
}

function addAiProviderModel(rowEl: HTMLElement): void {
  const modelName = prompt('输入模型名');
  if (!modelName?.trim()) return;
  const host = rowEl.querySelector<HTMLElement>('[data-ai-models]');
  if (!host) return;
  if ([...host.querySelectorAll<HTMLElement>('[data-ai-model-row] .ai-model-name')]
    .some((el) => el.textContent?.trim() === modelName.trim())) {
    setStatus(`模型 ${modelName.trim()} 已存在`, true);
    return;
  }
  const kind = rowEl.dataset.aiKind as GmAiProviderKind;
  const scope = rowEl.dataset.aiScope ?? 'default';
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope) ?? createDraftAiProviderConfig(kind, scope);
  host.insertAdjacentHTML('beforeend', renderAiProviderModelRow(item, {
    name: modelName.trim(),
    enabled: true,
    source: 'manual',
    addedAt: new Date().toISOString(),
  }));
  renderAiProviderConfigsFromDom(rowEl);
}

function renderAiProviderConfigsFromDom(rowEl: HTMLElement): void {
  const kind = rowEl.dataset.aiKind as GmAiProviderKind;
  const scope = rowEl.dataset.aiScope ?? 'default';
  const index = aiProviderConfigs.findIndex((item) => item.kind === kind && item.scope === scope);
  const models = readAiProviderModelsFromRow(rowEl);
  if (index >= 0) {
    aiProviderConfigs[index] = { ...aiProviderConfigs[index], models, modelName: models[0]?.name ?? aiProviderConfigs[index].modelName };
  }
  renderAiProviderConfigs();
}

function removeAiProviderModelLocally(rowEl: HTMLElement, modelName: string): void {
  const modelEl = [...rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]')]
    .find((el) => el.dataset.aiModelName === modelName);
  modelEl?.remove();
  renderAiProviderConfigsFromDom(rowEl);
}

function deleteAllAiProviderModelsLocally(rowEl: HTMLElement): void {
  if (!confirm('确认删除该 provider 下的全部模型？')) return;
  rowEl.querySelectorAll<HTMLElement>('[data-ai-model-row]').forEach((modelEl) => modelEl.remove());
  renderAiProviderConfigsFromDom(rowEl);
  setStatus('已清空本地模型列表');
}

async function deleteAiProviderConfig(kind: GmAiProviderKind, scope: string): Promise<void> {
  if (!confirm(`确认删除 AI 配置 "${kind}/${scope}"？密钥本身不会删除。`)) return;
  const res = await request<GmAiProviderConfigDeleteRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'DELETE' },
  );
  setStatus(res.deleted ? `AI 配置 ${kind}/${scope} 已删除` : `AI 配置 ${kind}/${scope} 不存在`);
  await loadAiProviderConfigs();
}

async function fetchAiProviderModels(kind: GmAiProviderKind, scope: string): Promise<void> {
  const res = await request<GmAiProviderFetchModelsRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/fetch`,
    { method: 'POST' },
    45_000,
  );
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope);
  if (!item) {
    throw new Error('AI provider 配置不存在');
  }
  const existingNames = new Set(item.models.map((model) => model.name));
  const candidates = res.models.filter((model) => !existingNames.has(model.name));
  if (candidates.length === 0) {
    setStatus(`已获取 ${res.fetchedCount} 个模型，没有新的可添加模型`);
    return;
  }
  const selected = await openAiModelPicker(candidates);
  if (selected.length === 0) {
    setStatus('未选择新模型');
    return;
  }
  await saveAiProviderModels(kind, scope, [...item.models, ...selected]);
  setStatus(`已添加 ${selected.length} 个模型`);
}

async function deleteAiProviderModel(kind: GmAiProviderKind, scope: string, modelName: string): Promise<void> {
  if (!modelName.trim()) return;
  if (!confirm(`确认从 "${kind}/${scope}" 删除模型 "${modelName}"？`)) return;
  const res = await request<GmAiProviderDeleteModelRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/${encodeURIComponent(modelName)}`,
    { method: 'DELETE' },
  );
  setStatus(res.deleted ? `模型 ${modelName} 已删除` : `模型 ${modelName} 不存在`);
  await loadAiProviderConfigs();
}

async function deleteAllAiProviderModels(kind: GmAiProviderKind, scope: string): Promise<void> {
  if (!confirm(`确认删除 "${kind}/${scope}" 下的全部模型？`)) return;
  await saveAiProviderModels(kind, scope, []);
  setStatus(`已删除 ${kind}/${scope} 的全部模型`);
}

async function testAiProviderModel(kind: GmAiProviderKind, scope: string, modelName: string): Promise<void> {
  if (!modelName.trim()) return;
  const stateKey = getAiModelStateKey(kind, scope, modelName);
  aiModelTestStateByKey.set(stateKey, { kind: 'pending', text: '测试中...' });
  renderAiProviderConfigs();
  const res = await request<GmAiProviderTestModelRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}/models/${encodeURIComponent(modelName)}/test`,
    { method: 'POST' },
    kind === 'image' ? 45_000 : 30_000,
  );
  aiModelTestStateByKey.set(stateKey, {
    kind: res.ok ? 'success' : 'error',
    text: `${res.ok ? '成功' : '失败'} ${res.latencyMs}ms`,
  });
  renderAiProviderConfigs();
  setStatus(`${modelName}：${res.message}（${res.latencyMs}ms）`, !res.ok);
}

async function saveAiProviderModels(kind: GmAiProviderKind, scope: string, models: GmAiProviderModelItem[]): Promise<void> {
  const item = aiProviderConfigs.find((entry) => entry.kind === kind && entry.scope === scope);
  if (!item) throw new Error('AI provider 配置不存在');
  const body: GmAiProviderConfigSetReq = {
    provider: item.provider,
    baseURL: item.baseURL,
    modelName: models.find((model) => model.enabled)?.name ?? models[0]?.name ?? item.modelName,
    models,
    timeoutMs: item.timeoutMs,
    imageSize: kind === 'image' ? item.imageSize : undefined,
    imageQuality: kind === 'image' ? item.imageQuality : undefined,
    secretKeyRef: item.secretKeyRef,
    enabled: item.enabled,
  };
  await request<GmAiProviderConfigSetRes>(
    `${GM_API_BASE_PATH}/ai/providers/${kind}/${encodeURIComponent(scope)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  await loadAiProviderConfigs();
}

function openAiModelPicker(models: GmAiProviderModelItem[]): Promise<GmAiProviderModelItem[]> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'network-payload-modal';
    overlay.innerHTML = `
      <div class="network-payload-dialog" role="dialog" aria-modal="true" aria-label="选择模型">
        <div class="network-payload-dialog-head">
          <div>
            <div class="section-title">选择要加入的模型</div>
            <div class="network-breakdown-subtitle">仅展示当前 provider 里还没有的模型。</div>
          </div>
          <button class="small-btn" type="button" data-ai-picker-close>关闭</button>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-ai-picker-all>全选</button>
          <button class="small-btn" type="button" data-ai-picker-none>全不选</button>
          <button class="small-btn" type="button" data-ai-picker-invert>反选</button>
          <button class="small-btn primary" type="button" data-ai-picker-confirm>加入选中</button>
        </div>
        <div class="ai-model-picker-list">
          ${models.map((model) => `
            <label class="ai-model-picker-item" title="${escapeHtml(model.name)}">
              <input type="checkbox" data-ai-picker-model="${escapeHtml(model.name)}" />
              <span class="ai-model-picker-name">${escapeHtml(model.name)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
    const close = (result: GmAiProviderModelItem[]) => {
      overlay.remove();
      resolve(result);
    };
    const getInputs = () => [...overlay.querySelectorAll<HTMLInputElement>('[data-ai-picker-model]')];
    overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target === overlay || target?.closest('[data-ai-picker-close]')) {
        close([]);
        return;
      }
      if (target?.closest('[data-ai-picker-all]')) {
        getInputs().forEach((input) => { input.checked = true; });
        return;
      }
      if (target?.closest('[data-ai-picker-none]')) {
        getInputs().forEach((input) => { input.checked = false; });
        return;
      }
      if (target?.closest('[data-ai-picker-invert]')) {
        getInputs().forEach((input) => { input.checked = !input.checked; });
        return;
      }
      if (target?.closest('[data-ai-picker-confirm]')) {
        const selectedNames = new Set(getInputs().filter((input) => input.checked).map((input) => input.dataset.aiPickerModel ?? ''));
        close(models.filter((model) => selectedNames.has(model.name)));
      }
    });
    document.body.appendChild(overlay);
  });
}

// ===== 交易记录 tab =====
/** tradesQueryState：交易记录 tab 当前查询状态，分页 / 关键字。 */
let tradesQueryState: { page: number; pageSize: number; playerKeyword: string; itemKeyword: string } = {
  page: 1,
  pageSize: 20,
  playerKeyword: '',
  itemKeyword: '',
};

/** loadTrades：根据当前/给定查询条件请求服务端并渲染。 */
async function loadTrades(options?: { resetPage?: boolean; playerKeyword?: string; itemKeyword?: string; pageSize?: number }): Promise<void> {
  if (options?.resetPage) {
    tradesQueryState.page = 1;
  }
  if (typeof options?.playerKeyword === 'string') {
    tradesQueryState.playerKeyword = options.playerKeyword.trim();
  }
  if (typeof options?.itemKeyword === 'string') {
    tradesQueryState.itemKeyword = options.itemKeyword.trim();
  }
  if (typeof options?.pageSize === 'number' && Number.isFinite(options.pageSize)) {
    tradesQueryState.pageSize = Math.max(1, Math.min(200, Math.trunc(options.pageSize)));
  }

  const params = new URLSearchParams();
  params.set('page', String(tradesQueryState.page));
  params.set('pageSize', String(tradesQueryState.pageSize));
  if (tradesQueryState.playerKeyword) {
    params.set('playerKeyword', tradesQueryState.playerKeyword);
  }
  if (tradesQueryState.itemKeyword) {
    params.set('itemKeyword', tradesQueryState.itemKeyword);
  }

  tradesMetaEl.textContent = '查询中…';
  try {
    const result = await request<GmMarketTradeListRes>(`${GM_API_BASE_PATH}/market/trades?${params.toString()}`);
    tradesQueryState.page = result.page;
    tradesQueryState.pageSize = result.pageSize;
    renderTrades(result);
  } catch (error) {
    tradesMetaEl.textContent = '';
    tradesListEl.innerHTML = `<div class="empty-hint" style="color:var(--stamp-red);">${escapeHtml(error instanceof Error ? error.message : '加载失败')}</div>`;
    tradesPagePrevBtn.disabled = true;
    tradesPageNextBtn.disabled = true;
  }
}

/** renderTrades：把后端返回结果渲染成表格 + 分页元信息。 */
function renderTrades(result: GmMarketTradeListRes): void {
  const { items, total, page, pageSize, totalPages, playerKeyword, itemKeyword } = result;
  const conditionParts: string[] = [];
  if (playerKeyword) {
    conditionParts.push(`玩家="${escapeHtml(playerKeyword)}"`);
  }
  if (itemKeyword) {
    conditionParts.push(`物品="${escapeHtml(itemKeyword)}"`);
  }
  tradesMetaEl.innerHTML = `共 ${total} 条 · 当前条件 ${conditionParts.length > 0 ? conditionParts.join('，') : '无'}`;
  tradesPageMetaEl.textContent = `第 ${page} / ${Math.max(1, totalPages)} 页 · 共 ${total} 条`;
  tradesPagePrevBtn.disabled = page <= 1;
  tradesPageNextBtn.disabled = page >= totalPages;

  if (items.length === 0) {
    tradesListEl.innerHTML = '<div class="empty-hint">没有符合条件的交易记录。</div>';
    return;
  }

  const rowsHtml = items.map((row) => renderTradeRow(row)).join('');
  tradesListEl.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:rgba(255,255,255,0.6); border-bottom:1.5px solid var(--ink-black);">
          <th style="text-align:left; padding:8px 10px;">完成时间</th>
          <th style="text-align:left; padding:8px 10px;">来源</th>
          <th style="text-align:left; padding:8px 10px;">买家</th>
          <th style="text-align:left; padding:8px 10px;">卖家</th>
          <th style="text-align:left; padding:8px 10px;">物品</th>
          <th style="text-align:right; padding:8px 10px;">数量</th>
          <th style="text-align:right; padding:8px 10px;">单价</th>
          <th style="text-align:right; padding:8px 10px;">总价</th>
          <th style="text-align:left; padding:8px 10px;">交易 ID</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderTradeRow(row: GmMarketTradeItem): string {
  const buyerLabel = formatTradePartyLabel(row.buyerNo, row.buyerName, row.buyerId);
  const sellerLabel = formatTradePartyLabel(row.sellerNo, row.sellerName, row.sellerId);
  const sourceLabel = row.source === 'auction' ? '拍卖行' : '坊市';
  return `
    <tr style="border-bottom:1px solid var(--wash-ink);">
      <td style="padding:8px 10px; white-space:nowrap; color:var(--ink-grey);">${escapeHtml(formatTradeTimestamp(row.createdAt))}</td>
      <td style="padding:8px 10px;">${escapeHtml(sourceLabel)}</td>
      <td style="padding:8px 10px;">${buyerLabel}</td>
      <td style="padding:8px 10px;">${sellerLabel}</td>
      <td style="padding:8px 10px;">${escapeHtml(row.itemName)} <span style="color:var(--light-ink); font-size:12px;">(${escapeHtml(row.itemId)})</span></td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${row.quantity.toLocaleString('zh-Hans-CN')}</td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${formatTradePrice(row.unitPrice)}</td>
      <td style="padding:8px 10px; text-align:right; font-variant-numeric:tabular-nums;">${formatTradePrice(row.totalCost)}</td>
      <td style="padding:8px 10px; color:var(--light-ink); font-family:monospace; font-size:12px; word-break:break-all;">${escapeHtml(row.id)}</td>
    </tr>
  `;
}

function formatTradePartyLabel(playerNo: number | null | undefined, playerName: string | null | undefined, _playerId: string): string {
  const parts: string[] = [];
  const noText = typeof playerNo === 'number' && Number.isFinite(playerNo) ? `#${playerNo}` : null;
  const trimmedName = typeof playerName === 'string' ? playerName.trim() : '';
  if (noText) {
    parts.push(`<span style="font-family:var(--font-heading-sub);">${escapeHtml(noText)}</span>`);
  }
  if (trimmedName) {
    parts.push(`<span>${escapeHtml(trimmedName)}</span>`);
  }
  if (!noText && !trimmedName) {
    parts.push('<span>未知玩家</span>');
  }
  return `<div style="display:flex; flex-direction:column; gap:2px;">${parts.join('')}</div>`;
}

function formatTradePrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return Math.round(value * 100) / 100 === Math.trunc(value)
    ? Math.trunc(value).toLocaleString('zh-Hans-CN')
    : value.toLocaleString('zh-Hans-CN', { maximumFractionDigits: 2 });
}

function formatTradeTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '-';
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** changeGmPassword：处理变更GM密码。 */
async function changeGmPassword(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const currentPassword = gmPasswordCurrentInput.value.trim();
  const newPassword = gmPasswordNextInput.value.trim();
  if (!currentPassword || !newPassword) {
    setStatus(t('gm.password.change.fill-both'), true);
    return;
  }

  gmPasswordSaveBtn.disabled = true;
  try {
    await request<BasicOkRes>(`${GM_AUTH_API_BASE_PATH}/password`, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      } satisfies GmChangePasswordReq),
    });
    persistGmPassword(newPassword);
    const persistedPassword = readPersistedGmPassword();
    passwordInput.value = persistedPassword;
    gmPasswordCurrentInput.value = persistedPassword;
    gmPasswordNextInput.value = '';
    setStatus(t('gm.password.updated'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    gmPasswordSaveBtn.disabled = false;
  }
}

/** getCurrentEditorSaveSection：读取当前编辑器保存Section。 */
function getCurrentEditorSaveSection(): GmPlayerUpdateSection | null {
  return currentEditorTab === 'persisted' || currentEditorTab === 'mail' || currentEditorTab === 'risk' || currentEditorTab === 'shortcuts' ? null : currentEditorTab;
}

/** buildTechniqueSaveSnapshot：构建Technique保存快照。 */
function buildTechniqueSaveSnapshot(technique: TechniqueState): TechniqueState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!findTechniqueCatalogEntry(technique.techId)) {
    return clone(technique);
  }
  return {
    techId: technique.techId,
    name: technique.name,
    level: technique.level,
    exp: technique.exp,
    expToNext: technique.expToNext,
    realmLv: technique.realmLv,
    realm: technique.realm,
    skills: [],
    grade: technique.grade,
    category: technique.category,
    layers: undefined,
  };
}

/** buildInventoryItemSaveSnapshot：构建背包物品保存快照。 */
function buildInventoryItemSaveSnapshot(item: ItemStack): ItemStack {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!findItemCatalogEntry(item.itemId)) {
    return clone(item);
  }
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: item.count,
    desc: item.desc,
    enhanceLevel: item.enhanceLevel,
  };
}

/** buildEquipmentItemSaveSnapshot：构建Equipment物品保存快照。 */
function buildEquipmentItemSaveSnapshot(item: ItemStack | null): ItemStack | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!item) {
    return null;
  }
  if (!findItemCatalogEntry(item.itemId)) {
    return clone(item);
  }
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: 1,
    desc: item.desc,
    equipSlot: item.equipSlot,
    enhanceLevel: item.enhanceLevel,
  };
}

/** buildSectionSnapshot：构建Section快照。 */
function buildSectionSnapshot(section: GmPlayerUpdateSection, draft: PlayerState): GmUpdatePlayerSnapshot {
  switch (section) {
    case 'basic':
      return {
        name: draft.name,
        hp: draft.hp,
        maxHp: draft.maxHp,
        qi: draft.qi,
        dead: draft.dead,
        autoBattle: draft.autoBattle,
        autoRetaliate: draft.autoRetaliate,
        autoBattleStationary: draft.autoBattleStationary,
        allowAoePlayerHit: draft.allowAoePlayerHit,
        autoIdleCultivation: draft.autoIdleCultivation,
        autoSwitchCultivation: draft.autoSwitchCultivation,
        combatTargetId: draft.combatTargetId,
        combatTargetLocked: draft.combatTargetLocked,
      };
    case 'position':
      return {
        mapId: draft.mapId,
        instanceId: resolvePositionTargetInstanceId(draft.mapId),
        x: draft.x,
        y: draft.y,
        facing: draft.facing,
        viewRange: draft.viewRange,
      };
    case 'realm':
      return {
        baseAttrs: clone(draft.baseAttrs),
        realmLv: draft.realmLv,
        realm: typeof draft.realm?.progress === 'number'
          ? { progress: draft.realm.progress } as PlayerState['realm']
          : undefined,
        foundation: draft.foundation,
        rootFoundation: draft.rootFoundation,
        comprehension: draft.comprehension,
        luck: draft.luck,
        revealedBreakthroughRequirementIds: [...(draft.revealedBreakthroughRequirementIds ?? [])],
        bonuses: clone(ensureArray(draft.bonuses)),
      };
    case 'buffs':
      return {
        temporaryBuffs: clone(ensureArray(draft.temporaryBuffs)),
      };
    case 'techniques':
      return {
        techniques: ensureArray(draft.techniques).map((technique) => buildTechniqueSaveSnapshot(technique)),
        autoBattleSkills: clone(ensureArray(draft.autoBattleSkills)),
        cultivatingTechId: draft.cultivatingTechId,
      };
    case 'items':
      return {
        inventory: {
          capacity: draft.inventory.capacity,
          items: ensureArray(draft.inventory.items).map((item) => buildInventoryItemSaveSnapshot(item)),
        },
        equipment: {
          weapon: buildEquipmentItemSaveSnapshot(draft.equipment.weapon),
          head: buildEquipmentItemSaveSnapshot(draft.equipment.head),
          body: buildEquipmentItemSaveSnapshot(draft.equipment.body),
          legs: buildEquipmentItemSaveSnapshot(draft.equipment.legs),
          accessory: buildEquipmentItemSaveSnapshot(draft.equipment.accessory),
        },
      };
    case 'quests':
      return {
        quests: clone(ensureArray(draft.quests)),
      };
    default:
      return clone(draft);
  }
}

/** saveSelectedPlayerSections：保存Selected玩家Sections。 */
async function saveSelectedPlayerSections(sections: GmPlayerUpdateSection[], message: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected || !draftSnapshot) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  const uniqueSections = Array.from(new Set(sections));
  if (uniqueSections.length === 0) {
    setStatus(t('gm.player.no-shortcut-changes'), true);
    return;
  }
  setPendingStatus(t('gm.player.save-started', { name: selected.name, tabLabel: t('gm.editor-tab-shortcuts') }));
  for (const section of uniqueSections) {
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
  }
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  await delayRefresh(message);
}

/** setSelectedPlayerBodyTrainingLevel：处理set Selected玩家身体修炼等级。 */
async function setSelectedPlayerBodyTrainingLevel(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-body-training-level');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="set-body-training-level"]');
  const rawValue = input?.value.trim() ?? '';
  const level = Number(rawValue);

  if (!rawValue || !Number.isFinite(level) || level < 0 || !Number.isInteger(level)) {
    setStatus(t('gm.player.training-level.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.training-level.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/body-training/level`, {
      method: 'POST',
      body: JSON.stringify({ level } satisfies GmSetPlayerBodyTrainingLevelReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.training-level.updated', { name: detail.name, level }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerFoundation：处理add Selected玩家Foundation。 */
async function addSelectedPlayerFoundation(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-foundation-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-foundation"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus(t('gm.player.foundation.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.foundation.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/foundation/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerFoundationReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.foundation.updated', { name: detail.name, amount: amount > 0 ? `+${amount}` : `${amount}` }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerCombatExp：处理add Selected玩家战斗Exp。 */
async function addSelectedPlayerCombatExp(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-combat-exp-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-combat-exp"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus(t('gm.player.combat-exp.invalid'), true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.combat-exp.updating', { name: detail.name }));
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/combat-exp/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerCombatExpReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.combat-exp.updated', { name: detail.name, amount: amount > 0 ? `+${amount}` : `${amount}` }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** runPlayerTechniqueShortcut：处理run玩家Technique Shortcut。 */
async function runPlayerTechniqueShortcut(
  action: 'grant-all-unlearned-technique-books' | 'max-all-techniques' | 'learn-all-techniques' | 'remove-all-techniques',
): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) {
    setStatus(t('gm.player.no-editable'), true);
    return;
  }

  assertTrustedEditorCatalog('快捷操作：');

  if (action === 'grant-all-unlearned-technique-books') {
    const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
    const existingInventoryItemIds = new Set(ensureArray(draftSnapshot.inventory.items).map((item) => item.itemId));
    const bookItemIds = editorCatalog!.items
      .filter((item) => item.type === 'skill_book')
      .map((item) => item.itemId)
      .filter((itemId) => {
        const techniqueId = resolveTechniqueIdFromBookItemId(itemId);
        return !!techniqueId && !learnedTechniqueIds.has(techniqueId) && !existingInventoryItemIds.has(itemId);
      });
    if (bookItemIds.length === 0) {
      setStatus(t('gm.player.no-unlearned-technique-books'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.inventory.items.push(...bookItemIds.map((itemId) => createItemFromCatalog(itemId)));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['items'], t('gm.player.no-unlearned-technique-books.sent', { count: bookItemIds.length }));
    return;
  }

  if (action === 'max-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus(t('gm.player.no-learned-techniques'));
      return;
    }
    const upgradableCount = techniques.filter((technique) => technique.level < getTechniqueTemplateMaxLevel(technique) || technique.expToNext !== 0).length;
    if (upgradableCount === 0) {
      setStatus(t('gm.player.techniques-maxed'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.techniques = ensureArray(draft.techniques).map((technique) => buildMaxLevelTechniqueState(technique));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['techniques'], t('gm.player.techniques-maxed.sent', { count: techniques.length }));
    return;
  }

  if (action === 'remove-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus(t('gm.player.no-removable-techniques'));
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.techniques = [];
      draft.cultivatingTechId = undefined;
      draft.autoBattleSkills = [];
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['techniques'], t('gm.player.techniques-removed', { count: techniques.length }));
    return;
  }

  const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
  const missingTechniqueIds = editorCatalog!.techniques
    .map((technique) => technique.id)
    .filter((techId) => !learnedTechniqueIds.has(techId));
  if (missingTechniqueIds.length === 0) {
    setStatus(t('gm.player.learned-all-techniques'));
    return;
  }
  const changed = mutateDraft((draft) => {
    draft.techniques.push(...missingTechniqueIds.map((techId) => createTechniqueFromCatalog(techId)));
    if (!draft.cultivatingTechId && draft.techniques[0]) {
      draft.cultivatingTechId = draft.techniques[0].techId;
    }
  });
  if (!changed) {
    return;
  }
  await saveSelectedPlayerSections(['techniques'], t('gm.player.learned-all-techniques.sent', { count: missingTechniqueIds.length }));
}

/** runPlayerItemShortcut：执行玩家物品类快捷操作。 */
async function runPlayerItemShortcut(action: 'grant-all-consumables' | 'grant-all-equipment'): Promise<void> {
  if (!draftSnapshot) {
    setStatus(t('gm.player.no-editable'), true);
    return;
  }

  assertTrustedEditorCatalog('快捷操作：');

  const targetType = action === 'grant-all-consumables' ? 'consumable' : 'equipment';
  const targetCount = action === 'grant-all-consumables' ? 999 : 1;
  const catalogItems = editorCatalog!.items
    .filter((item) => item.type === targetType)
    .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  if (catalogItems.length === 0) {
    setStatus(action === 'grant-all-consumables' ? t('gm.player.no-consumable-template') : t('gm.player.no-equipment-template'));
    return;
  }

  const currentItems = ensureArray(draftSnapshot.inventory.items);
  const currentItemById = new Map(currentItems.map((item) => [item.itemId, item]));
  const itemsToAdd = catalogItems.filter((item) => !currentItemById.has(item.itemId));
  const consumablesToUpdate = action === 'grant-all-consumables'
    ? catalogItems.filter((item) => {
        const existing = currentItemById.get(item.itemId);
        return existing && (existing.count ?? 0) < targetCount;
      })
    : [];
  if (itemsToAdd.length === 0 && consumablesToUpdate.length === 0) {
    setStatus(action === 'grant-all-consumables' ? t('gm.player.inventory-full-consumables') : t('gm.player.inventory-full-equipment'));
    return;
  }

  const changed = mutateDraft((draft) => {
    const inventoryItems = ensureArray(draft.inventory.items);
    const inventoryItemById = new Map(inventoryItems.map((item) => [item.itemId, item]));
    for (const catalogItem of consumablesToUpdate) {
      const existing = inventoryItemById.get(catalogItem.itemId);
      if (existing) {
        existing.count = targetCount;
      }
    }
    for (const catalogItem of itemsToAdd) {
      const nextItem = createItemFromCatalog(catalogItem.itemId, targetCount);
      inventoryItems.push(nextItem);
      inventoryItemById.set(catalogItem.itemId, nextItem);
    }
    draft.inventory.items = inventoryItems;
    draft.inventory.capacity = Math.max(draft.inventory.capacity ?? 0, inventoryItems.length);
  });
  if (!changed) {
    return;
  }
  const label = action === 'grant-all-consumables' ? '消耗品' : '装备';
  const detail = action === 'grant-all-consumables'
    ? `新增 ${itemsToAdd.length} 种，补足 ${consumablesToUpdate.length} 种到 999 个`
    : `新增 ${itemsToAdd.length} 件`;
  await saveSelectedPlayerSections(['items'], t('gm.player.inventory-updated', { label, detail }));
}

/** openSelectedPlayerMailTab：打开Selected玩家邮件Tab。 */
function openSelectedPlayerMailTab(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedPlayerId) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  if (currentTab !== 'players') {
    switchTab('players');
  }
  switchEditorTab('mail');
}

/** refreshSelectedPlayer：处理refresh Selected玩家。 */
async function refreshSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  if (editorDirty && !window.confirm(t('gm.refresh.confirm'))) {
    return;
  }

  refreshPlayerBtn.disabled = true;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = selected.id;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  clearEditorRenderCache();
  render();

  try {
    await loadPlayerList(true, true, true);
    setStatus(t('gm.player.refreshed', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.detail-load-failed'), true);
  } finally {
    refreshPlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayer：保存Selected玩家。 */
async function saveSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }
  const section = getCurrentEditorSaveSection();
  if (!section) {
    setStatus(
      currentEditorTab === 'mail'
        ? t('gm.player.section.mail-cannot-save')
        : t('gm.player.section.persisted-cannot-save'),
      true,
    );
    return;
  }
  if ((section === 'buffs' || section === 'techniques' || section === 'items' || section === 'quests') && !hasServerEditorCatalog()) {
    setStatus(t('gm.player.catalog.save-paused', { tabLabel: getEditorTabLabel(section) }), true);
    return;
  }

  const synced = syncVisualEditorToDraft(getEditorTabSection(section) ?? undefined);
  if (!synced.ok || !draftSnapshot) {
    setStatus(synced.ok ? t('gm.player.no-save-content') : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.save-started', { name: selected.name, tabLabel: getEditorTabLabel(section) }));
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.save-done', { name: selected.name, tabLabel: getEditorTabLabel(section) }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    savePlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayerPassword：保存Selected玩家密码。 */
async function saveSelectedPlayerPassword(forcedPassword?: string, action = 'save-player-password'): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.password.no-target'), true);
    return;
  }

  const passwordInput = editorContentEl.querySelector<HTMLInputElement>('#player-password-input');
  const button = editorContentEl.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  const newPassword = typeof forcedPassword === 'string' ? forcedPassword : (passwordInput?.value.trim() ?? '');

  if (!newPassword) {
    setStatus(t('gm.player.password.fill-new'), true);
    if (passwordInput) {
      passwordInput.focus();
    }
    return;
  }

  // 显式标记保存中状态：按钮置灰 + “正在保存…” 文案 + 输入框只读，避免重复点击。
  // 使用 dataset 记录原始文案，恢复时还原（即使 i18n 后续变更也不会丢失原文）。
  const originalLabel = button?.textContent ?? '';
  if (button) {
    button.dataset.originalLabel = originalLabel;
    button.dataset.savingState = 'pending';
    button.textContent = t('gm.player.password.saving-button');
    button.disabled = true;
  }
  if (passwordInput) {
    passwordInput.readOnly = true;
  }
  try {
    setPendingStatus(t('gm.player.password.updating', { username: detail.account.username }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword } satisfies GmUpdateManagedPlayerPasswordReq),
    });
    if (passwordInput) {
      passwordInput.value = '';
    }
    setStatus(forcedPassword
      ? `已将账号 ${detail.account.username} 的密码重置为 ${GM_PLAYER_QUICK_RESET_PASSWORD}`
      : t('gm.player.password.updated', { username: detail.account.username }));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : t('gm.request.failed');
    setStatus(t('gm.player.password.failed', { message }), true);
  } finally {
    if (button) {
      button.disabled = false;
      const restoreLabel = button.dataset.originalLabel || t('gm.player.password.save-button');
      button.textContent = restoreLabel;
      delete button.dataset.savingState;
      delete button.dataset.originalLabel;
    }
    if (passwordInput) {
      passwordInput.readOnly = false;
    }
  }
}

/** saveSelectedPlayerAccount：保存Selected玩家账号。 */
async function saveSelectedPlayerAccount(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.no-target'), true);
    return;
  }

  const accountInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-username');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-account"]');
  const username = accountInput?.value.trim() ?? '';

  if (!username) {
    setStatus(t('gm.player.account.fill'), true);
    return;
  }
  if (username === detail.account.username) {
    setStatus(t('gm.player.account.unchanged'));
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.updating', { username: detail.account.username }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/account`, {
      method: 'PUT',
      body: JSON.stringify({ username } satisfies GmUpdateManagedPlayerAccountReq),
    });
    await delayRefresh(t('gm.player.account.updated', { oldUsername: detail.account.username, newUsername: username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** banSelectedPlayerAccount：封禁Selected玩家账号。 */
async function banSelectedPlayerAccount(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.ban.no-target'), true);
    return;
  }
  const reasonInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="ban-player-account"]');
  const reason = reasonInput?.value.trim() ?? '';
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.ban.updating', { username: detail.account.username }));
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason } satisfies GmBanManagedPlayerReq),
    });
    await delayRefresh(t('gm.player.account.banned', { username: detail.account.username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.account.ban.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** unbanSelectedPlayerAccount：解封Selected玩家账号。 */
async function unbanSelectedPlayerAccount(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus(t('gm.player.account.unban.no-target'), true);
    return;
  }
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="unban-player-account"]');
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(t('gm.player.account.unban.updating', { username: detail.account.username }));
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/unban`, {
      method: 'POST',
    });
    await delayRefresh(t('gm.player.account.unbanned', { username: detail.account.username }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.account.unban.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetSelectedPlayer：重置Selected玩家。 */
async function resetSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.reset.no-target'), true);
    return;
  }

  resetPlayerBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.reset.updating', { name: selected.name }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.reset.done', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.reset.failed'), true);
  } finally {
    resetPlayerBtn.disabled = false;
  }
}

/** resetSelectedPlayerHeavenGate：重置Selected玩家Heaven关卡。 */
async function resetSelectedPlayerHeavenGate(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.player.choose'), true);
    return;
  }

  resetHeavenGateBtn.disabled = true;
  try {
    setPendingStatus(t('gm.player.heaven-gate.reset.updating', { name: selected.name }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/heaven-gate/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.player.heaven-gate.reset.done', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.player.heaven-gate.reset.failed'), true);
  } finally {
    resetHeavenGateBtn.disabled = false;
  }
}

/** removeSelectedBot：处理remove Selected Bot。 */
async function removeSelectedBot(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected || !selected.meta.isBot) {
    setStatus(t('gm.bot.not-selected'), true);
    return;
  }

  removeBotBtn.disabled = true;
  try {
    setPendingStatus(t('gm.bot.removing', { name: selected.name }));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/bots/remove`, {
      method: 'POST',
      body: JSON.stringify({ playerIds: [selected.id] } satisfies GmRemoveBotsReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.bot.removed', { name: selected.name }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.bot.remove.failed'), true);
  } finally {
    removeBotBtn.disabled = false;
  }
}

/** spawnBots：处理生成Bots。 */
async function spawnBots(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus(t('gm.bot.spawn.anchor-required'), true);
    return;
  }

  const count = Number(spawnCountInput.value);
  if (!Number.isFinite(count) || count <= 0) {
    setStatus(t('gm.bot.spawn.count-invalid'), true);
    return;
  }

  try {
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/bots/spawn`, {
      method: 'POST',
      body: JSON.stringify({
        anchorPlayerId: selected.id,
        count,
      } satisfies GmSpawnBotsReq),
    });
    await delayRefresh(t('gm.bot.spawn.started', { name: selected.name, count: Math.floor(count) }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.bot.spawn.failed'), true);
  }
}

/** removeAllBots：处理remove All Bots。 */
async function removeAllBots(): Promise<void> {
  try {
    setPendingStatus(t('gm.bot.remove-all.started'));
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/bots/remove`, {
      method: 'POST',
      body: JSON.stringify({ all: true } satisfies GmRemoveBotsReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.bot.remove-all.done'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.bot.remove.failed'), true);
  }
}

/** returnAllPlayersToDefaultSpawn：处理return All Players To默认生成。 */
async function returnAllPlayersToDefaultSpawn(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(t('gm.shortcut.return-all.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-return-all-to-default-spawn') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>(`${GM_API_BASE_PATH}/shortcuts/players/return-all-to-default-spawn`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.shortcut.return-all.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
    }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** cleanupAllPlayersInvalidItems：处理cleanup All Players Invalid物品。 */
async function cleanupAllPlayersInvalidItems(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(t('gm.shortcut.cleanup-invalid.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-cleanup-invalid-items') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>(`${GM_API_BASE_PATH}/shortcuts/players/cleanup-invalid-items`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.shortcut.cleanup-invalid.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      removedInventoryStacks: Math.floor(result.totalInvalidInventoryStacksRemoved ?? 0),
      removedMarketStorageStacks: Math.floor(result.totalInvalidMarketStorageStacksRemoved ?? 0),
      removedEquipment: Math.floor(result.totalInvalidEquipmentRemoved ?? 0),
    }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersCombatExp：处理compensate All Players战斗Exp。 */
async function compensateAllPlayersCombatExp(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(t('gm.shortcut.combat-exp.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-compensate-combat-exp-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>(`${GM_API_BASE_PATH}/shortcuts/compensation/combat-exp-2026-04-09`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.shortcut.combat-exp.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      combatExp: Math.floor(result.totalCombatExpGranted ?? 0),
    }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersFoundation：处理compensate All Players Foundation。 */
async function compensateAllPlayersFoundation(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm(t('gm.shortcut.foundation.confirm'))) {
    return;
  }

  const button = document.getElementById('shortcut-compensate-foundation-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>(`${GM_API_BASE_PATH}/shortcuts/compensation/foundation-2026-04-09`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(t('gm.shortcut.foundation.done', {
      totalPlayers: result.totalPlayers,
      queuedRuntimePlayers: result.queuedRuntimePlayers,
      updatedOfflinePlayers: result.updatedOfflinePlayers,
      foundation: Math.floor(result.totalFoundationGranted ?? 0),
    }));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetNetworkStats：重置Network属性。 */
async function resetNetworkStats(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  resetNetworkStatsBtn.disabled = true;
  try {
    await activateNetworkStats();
    setStatus(t('gm.perf.network.reset.done'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.perf.network.reset.failed'), true);
  } finally {
    resetNetworkStatsBtn.disabled = false;
  }
}

async function toggleNetworkPayloadCapture(): Promise<void> {
  const enabled = state?.perf.networkPayloadCaptureEnabled !== true;
  toggleNetworkPayloadCaptureBtn.disabled = true;
  try {
    if (enabled && state?.perf.networkStatsEnabled !== true) {
      await activateNetworkStats();
    }
    await request<{
      ok: true;
      enabled: boolean;
    }>(`${GM_API_BASE_PATH}/perf/network/payload-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    await loadState(true);
    await loadRuntimeFlags();
    setStatus(enabled ? '已开启大包采样。' : '已关闭大包采样。');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '切换大包采样失败。', true);
  } finally {
    toggleNetworkPayloadCaptureBtn.disabled = false;
  }
}

async function activateNetworkStats(): Promise<void> {
  currentNetworkInPage = 1;
  currentNetworkOutPage = 1;
  await request<{
    /**
 * ok：ok相关字段。
 */
    ok: true;
  }>(`${GM_API_BASE_PATH}/perf/network/reset`, {
    method: 'POST',
  });
  await loadState(true);
}

async function ensureNetworkStatsActive(): Promise<void> {
  if (!token || networkStatsActivationPending || state?.perf.networkStatsEnabled === true) {
    return;
  }
  networkStatsActivationPending = true;
  resetNetworkStatsBtn.disabled = true;
  try {
    await activateNetworkStats();
  } finally {
    networkStatsActivationPending = false;
    resetNetworkStatsBtn.disabled = false;
  }
}

/** resetCpuStats：重置Cpu属性。 */
async function resetCpuStats(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  resetCpuStatsBtn.disabled = true;
  try {
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/perf/cpu/reset`, {
      method: 'POST',
    });
    await loadState(true);
    setStatus(t('gm.perf.cpu.reset.done'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.perf.cpu.reset.failed'), true);
  } finally {
    resetCpuStatsBtn.disabled = false;
  }
}

/** resetPathfindingStats：重置Pathfinding属性。 */
async function resetPathfindingStats(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  resetPathfindingStatsBtn.disabled = true;
  try {
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/perf/pathfinding/reset`, {
      method: 'POST',
    });
    await loadState(true);
    setStatus(t('gm.perf.pathfinding.reset.done'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : t('gm.perf.pathfinding.reset.failed'), true);
  } finally {
    resetPathfindingStatsBtn.disabled = false;
  }
}

async function triggerManualGc(): Promise<void> {
  triggerManualGcBtn.disabled = true;
  writeHeapSnapshotBtn.disabled = true;
  heapSnapshotMetaEl.textContent = '正在触发手动 GC，服务端会短暂停顿...';
  try {
    const result = await request<GmManualGcRes>(
      `${GM_API_BASE_PATH}/perf/memory/gc`,
      { method: 'POST' },
      60_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '手动 GC 未执行';
      heapSnapshotMetaEl.textContent = message;
      setStatus(message, true);
      return;
    }
    const delta = result.delta;
    const durationMs = Math.max(0, Number(result.durationMs ?? 0));
    const detail = [
      `手动 GC 完成：${durationMs.toFixed(0)} ms`,
      `Heap 已用 ${formatSignedBytes(delta?.heapUsedBytes)}`,
      `Heap 总量 ${formatSignedBytes(delta?.heapTotalBytes)}`,
      `RSS ${formatSignedBytes(delta?.rssBytes)}`,
      `外部 ${formatSignedBytes(delta?.externalBytes)}`,
      `ArrayBuffer ${formatSignedBytes(delta?.arrayBuffersBytes)}`,
    ].join(' · ');
    heapSnapshotMetaEl.textContent = detail;
    setStatus('手动 GC 已完成，已刷新内存快照');
    await loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '手动 GC 失败';
    heapSnapshotMetaEl.textContent = message;
    setStatus(message, true);
  } finally {
    triggerManualGcBtn.disabled = false;
    writeHeapSnapshotBtn.disabled = false;
  }
}

async function writeHeapSnapshot(): Promise<void> {
  writeHeapSnapshotBtn.disabled = true;
  heapSnapshotMetaEl.textContent = '正在生成 Heap Snapshot，服务端会短暂停顿...';
  try {
    // GB 级 heap 在服务端流式解析需要 60~180 秒；客户端默认 30 秒超时不够，这里放宽到 5 分钟。
    const result = await request<GmHeapSnapshotRes>(
      `${GM_API_BASE_PATH}/perf/memory/heap-snapshot`,
      { method: 'POST' },
      300_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '生成 Heap Snapshot 失败';
      heapSnapshotMetaEl.textContent = message;
      setStatus(message, true);
      return;
    }
    const summary = result.summary ?? null;
    const durationMs = typeof result.durationMs === 'number' ? result.durationMs : 0;
    if (summary) {
      const declared = summary.declaredNodeCount ?? 0;
      const totalMb = summary.totalSelfSizeBytes ? formatBytes(summary.totalSelfSizeBytes) : '?';
      heapSnapshotMetaEl.textContent = `Heap snapshot 已解析：节点 ${declared} 个 · 累计 ${totalMb} · 耗时 ${durationMs.toFixed(0)} ms（in-memory，未落盘）`;
      setStatus('Heap Snapshot 已解析为摘要');
    } else {
      heapSnapshotMetaEl.textContent = `Heap Snapshot 已生成（耗时 ${durationMs.toFixed(0)} ms）`;
      setStatus('Heap Snapshot 已生成');
    }
    await loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成 Heap Snapshot 失败';
    heapSnapshotMetaEl.textContent = message;
    setStatus(message, true);
  } finally {
    writeHeapSnapshotBtn.disabled = false;
  }
}

/**
 * writeAndCopyHeapSnapshotSummary：触发服务端生成 Heap Snapshot，
 * 解析完成后把 ~50 KB 摘要 JSON 复制到剪贴板，省去下载 GB 级 .heapsnapshot 的成本。
 */
async function writeAndCopyHeapSnapshotSummary(): Promise<void> {
  if (!copyHeapSnapshotSummaryBtn) {
    return;
  }
  copyHeapSnapshotSummaryBtn.disabled = true;
  writeHeapSnapshotBtn.disabled = true;
  heapSnapshotMetaEl.textContent = '正在生成 Heap Snapshot 并解析摘要，服务端会短暂停顿（GB 级 heap 通常 60~180 秒）...';
  try {
    // 与 writeHeapSnapshot 同步：放宽到 5 分钟，以容纳 3+ GB heap 的解析时间。
    const result = await request<GmHeapSnapshotRes>(
      `${GM_API_BASE_PATH}/perf/memory/heap-snapshot`,
      { method: 'POST' },
      300_000,
    );
    if (!result.ok) {
      const message = result.hint ?? result.error ?? result.reason ?? '生成 Heap Snapshot 失败';
      heapSnapshotMetaEl.textContent = message;
      setStatus(message, true);
      return;
    }
    if (!result.summary) {
      const reason = result.summaryError ? `（${result.summaryError}）` : '';
      const message = `Heap Snapshot 已生成，但摘要解析未完成${reason}，可点"复制最近摘要"重试`;
      heapSnapshotMetaEl.textContent = message;
      setStatus(message, true);
      return;
    }
    const text = JSON.stringify(result.summary, null, 2);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      const detail = `摘要已复制到剪贴板（${text.length} 字节，${(typeof result.durationMs === 'number' ? result.durationMs : 0).toFixed(0)} ms，未落盘）`;
      heapSnapshotMetaEl.textContent = detail;
      setStatus('Heap Snapshot 摘要已复制到剪贴板');
    } else {
      heapSnapshotMetaEl.textContent = '摘要已生成但写入剪贴板失败，请改用"复制最近摘要"或检查浏览器权限';
      setStatus('剪贴板写入失败，请改用"复制最近摘要"按钮重试', true);
    }
    await loadState(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成 Heap Snapshot 摘要失败';
    heapSnapshotMetaEl.textContent = message;
    setStatus(message, true);
  } finally {
    copyHeapSnapshotSummaryBtn.disabled = false;
    writeHeapSnapshotBtn.disabled = false;
  }
}

/**
 * copyLatestHeapSnapshotSummary：读取服务端最近一次 Heap Snapshot 摘要并复制到剪贴板，
 * 不重新生成（不会让 V8 暂停）；如果尚未生成过会提示运维先点"生成并复制摘要"。
 */
async function copyLatestHeapSnapshotSummary(): Promise<void> {
  if (!copyLatestHeapSnapshotSummaryBtn) {
    return;
  }
  copyLatestHeapSnapshotSummaryBtn.disabled = true;
  try {
    const result = await request<GmHeapSnapshotSummaryRes>(`${GM_API_BASE_PATH}/perf/memory/heap-snapshot/summary`);
    if (!result.ok || !result.summary) {
      const message = result.hint ?? result.reason ?? '尚未生成过 Heap Snapshot 摘要';
      heapSnapshotMetaEl.textContent = message;
      setStatus(message, true);
      return;
    }
    const text = JSON.stringify(result.summary, null, 2);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      const fileLabel = result.fileName ?? '最近一份摘要';
      const sizeLabel = typeof result.bytes === 'number' && result.bytes > 0 ? formatBytes(result.bytes) : `${text.length}`;
      heapSnapshotMetaEl.textContent = `${fileLabel} · ${sizeLabel} 已复制到剪贴板`;
      setStatus('Heap Snapshot 摘要已复制到剪贴板');
    } else {
      heapSnapshotMetaEl.textContent = '剪贴板写入失败，请检查浏览器权限或在 https / localhost 下重试';
      setStatus('剪贴板写入失败', true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取 Heap Snapshot 摘要失败';
    heapSnapshotMetaEl.textContent = message;
    setStatus(message, true);
  } finally {
    copyLatestHeapSnapshotSummaryBtn.disabled = false;
  }
}

/** handleEditorAction：处理编辑器动作。 */
function handleEditorAction(action: string, trigger: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!draftSnapshot) return;

  const index = Number(trigger.dataset.index ?? '-1');
  const slot = trigger.dataset.slot as EquipSlot | undefined;

  switch (action) {
    case 'add-bonus':
      mutateDraft((draft) => {
        draft.bonuses.push({ source: '', attrs: {}, stats: {}, meta: {} });
      });
      break;
    case 'remove-bonus':
      mutateDraft((draft) => removeArrayIndex(draft, 'bonuses', index));
      break;
    case 'add-buff':
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.buff-unavailable'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.temporaryBuffs = ensureArray(draft.temporaryBuffs);
        draft.temporaryBuffs.push(createDefaultBuff());
      });
      break;
    case 'remove-buff':
      mutateDraft((draft) => {
        draft.temporaryBuffs = ensureArray(draft.temporaryBuffs);
        draft.temporaryBuffs.splice(index, 1);
      });
      break;
    case 'add-inventory-item':
      mutateDraft((draft) => draft.inventory.items.push(createDefaultItem()));
      break;
    case 'add-inventory-item-from-catalog': {
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.item-unavailable'), true);
        return;
      }
      const itemId = readCatalogSelectValue('inventory-item');
      if (!itemId) {
        setStatus(t('gm.editor.catalog.choose-item-template'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.inventory.items.push(createItemFromCatalog(itemId));
      });
      break;
    }
    case 'remove-inventory-item':
      mutateDraft((draft) => draft.inventory.items.splice(index, 1));
      break;
    case 'create-equip':
      if (!slot) return;
      mutateDraft((draft) => {
        draft.equipment[slot] = createDefaultItem(slot);
      });
      break;
    case 'create-equip-from-catalog':
      if (!slot) return;
      {
        if (!hasServerEditorCatalog()) {
          setStatus(t('gm.editor.catalog.equipment-unavailable'), true);
          return;
        }
        const itemId = readCatalogSelectValue('equipment', slot);
        if (!itemId) {
          setStatus(t('gm.editor.catalog.choose-equipment-template'), true);
          return;
        }
        mutateDraft((draft) => {
          draft.equipment[slot] = createItemFromCatalog(itemId);
        });
      }
      break;
    case 'clear-equip':
      if (!slot) return;
      mutateDraft((draft) => {
        draft.equipment[slot] = null;
      });
      break;
    case 'add-auto-skill':
      mutateDraft((draft) => {
        draft.autoBattleSkills.push({ skillId: '', enabled: true } satisfies AutoBattleSkillConfig);
      });
      break;
    case 'remove-auto-skill':
      mutateDraft((draft) => draft.autoBattleSkills.splice(index, 1));
      break;
    case 'add-technique':
      mutateDraft((draft) => draft.techniques.push(createDefaultTechnique()));
      break;
    case 'add-technique-from-catalog': {
      if (!hasServerEditorCatalog()) {
        setStatus(t('gm.editor.catalog.technique-unavailable'), true);
        return;
      }
      const techId = readCatalogSelectValue('technique');
      if (!techId) {
        setStatus(t('gm.editor.catalog.choose-technique-template'), true);
        return;
      }
      mutateDraft((draft) => {
        draft.techniques.push(createTechniqueFromCatalog(techId));
        if (!draft.cultivatingTechId) {
          draft.cultivatingTechId = techId;
        }
      });
      break;
    }
    case 'remove-technique':
      mutateDraft((draft) => draft.techniques.splice(index, 1));
      break;
    case 'add-quest':
      mutateDraft((draft) => draft.quests.push(createDefaultQuest()));
      break;
    case 'remove-quest':
      mutateDraft((draft) => draft.quests.splice(index, 1));
      break;
  }
}

playerListEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-id]');
  const playerId = button?.dataset.playerId;
  if (!playerId || playerId === selectedPlayerId) return;
  if (editorDirty && !window.confirm(t('gm.player.switch.confirm'))) {
    return;
  }
  /** selectedPlayerId：selected玩家ID。 */
  selectedPlayerId = playerId;
  /** selectedPlayerDetail：selected玩家详情。 */
  selectedPlayerDetail = null;
  /** loadingPlayerDetailId：loading玩家详情ID。 */
  loadingPlayerDetailId = playerId;
  /** draftSnapshot：draft快照。 */
  draftSnapshot = null;
  /** draftSourcePlayerId：draft来源玩家ID。 */
  draftSourcePlayerId = null;
  /** editorDirty：编辑器Dirty。 */
  editorDirty = false;
  currentInventorySearchQuery = '';
  render();
  loadSelectedPlayerDetail(playerId, true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.detail-load-failed'), true);
  });
});

editorContentEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const action = trigger?.dataset.action;
  const reasonPreset = (event.target as HTMLElement).closest<HTMLElement>('[data-ban-reason-preset]');
  if (reasonPreset) {
    const input = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
    if (input) {
      input.value = reasonPreset.dataset.banReasonPreset ?? '';
      input.focus();
    }
    return;
  }
  if (!action || !trigger) return;
  if (action === 'add-direct-mail-attachment') {
    addMailAttachment('direct');
    return;
  }
  if (action === 'remove-direct-mail-attachment') {
    removeMailAttachment('direct', Number(trigger.dataset.mailAttachmentIndex));
    return;
  }
  if (action === 'send-direct-mail') {
    sendDirectMail().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'save-player-account') {
    saveSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'save-player-password') {
    saveSelectedPlayerPassword().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'reset-player-password-default') {
    saveSelectedPlayerPassword(GM_PLAYER_QUICK_RESET_PASSWORD, 'reset-player-password-default').catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'ban-player-account') {
    banSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'unban-player-account') {
    unbanSelectedPlayerAccount().catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'set-body-training-level') {
    setSelectedPlayerBodyTrainingLevel().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'add-foundation') {
    addSelectedPlayerFoundation().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'add-combat-exp') {
    addSelectedPlayerCombatExp().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (
    action === 'grant-all-unlearned-technique-books'
    || action === 'max-all-techniques'
    || action === 'learn-all-techniques'
    || action === 'remove-all-techniques'
  ) {
    runPlayerTechniqueShortcut(action).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  if (action === 'grant-all-consumables' || action === 'grant-all-equipment') {
    runPlayerItemShortcut(action).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
    return;
  }
  handleEditorAction(action, trigger);
});

editorContentEl.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    if (target instanceof HTMLInputElement && target.dataset.inventorySearch !== undefined) {
      currentInventorySearchQuery = target.value;
      patchInventoryListFromDraft();
      return;
    }
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if ((scope === 'direct' || scope === 'shortcut') && rest.length > 0) {
      updateMailDraftValue(scope, rest.join('.'), target.value);
    }
  }
});

editorContentEl.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
      const attachmentIndex = Number(indexText);
      if ((scope === 'direct' || scope === 'shortcut') && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage(scope, attachmentIndex, target.value);
        if (scope === 'direct') {
          rerenderDirectMailComposer();
        }
        return;
      }
    }
    const binding = target.dataset.mailBind;
    if (binding) {
      const [scope, ...rest] = binding.split('.');
      if ((scope === 'direct' || scope === 'shortcut') && rest.length > 0) {
        updateMailDraftValue(scope, rest.join('.'), target.value);
        if (scope === 'direct' && (rest[0] === 'attachments' || rest[0] === 'templateId')) {
          rerenderDirectMailComposer();
        }
        return;
      }
    }
  }
  if (target instanceof HTMLSelectElement && target.dataset.gmPositionMapCategory !== undefined) {
    const selected = getSelectedPlayerDetail();
    const category = (target.value as GmPositionMapCategory) || 'map';
    const mapSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-select]');
    const currentMapId = mapSelect?.value || draftSnapshot?.mapId || '';
    const nextMapId = patchPositionMapSelect(category, currentMapId);
    if (selected) {
      positionMapCategoryDraft = { playerId: selected.id, category };
    }
    const synced = syncVisualEditorToDraft(
      target.closest<HTMLElement>('[data-editor-tab]') ?? undefined,
    );
    if (!synced.ok) {
      setStatus(synced.message, true);
      return;
    }
    if (draftSnapshot) {
      draftSnapshot.mapId = nextMapId;
    }
    const detail = getSelectedPlayerDetail();
    if (detail && draftSnapshot) {
      editorMetaEl.innerHTML = getEditorMetaMarkup(detail);
      patchEditorPreview(detail, draftSnapshot);
    }
    return;
  }
  if (target instanceof HTMLSelectElement && target.dataset.catalogSelect === 'inventory-type') {
    /** currentInventoryAddType：当前背包Add类型。 */
    currentInventoryAddType = (target.value as (typeof ITEM_TYPES)[number]) || 'material';
    updateInventoryAddControls(true);
    return;
  }
  const synced = syncVisualEditorToDraft(
    target instanceof Element
      ? target.closest<HTMLElement>('[data-editor-tab]') ?? undefined
      : undefined,
  );
  if (!synced.ok) {
    setStatus(synced.message, true);
    return;
  }
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const path = target.dataset.bind;
    if (path && applyCatalogBindingChange(path, target.value)) {
      return;
    }
  }
  const detail = getSelectedPlayerDetail();
  if (detail && draftSnapshot) {
    editorMetaEl.innerHTML = getEditorMetaMarkup(detail);
    patchEditorPreview(detail, draftSnapshot);
  }
});

editorContentEl.addEventListener('focusout', () => {
  window.setTimeout(() => {
    flushBlockedEditorRender();
  }, 0);
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !activeSearchableItemField) {
    return;
  }
  if (activeSearchableItemField.contains(target)) {
    return;
  }
  closeSearchableItemField(activeSearchableItemField);
});

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root || root.dataset.open === 'true') {
    return;
  }
  openSearchableItemField(root);
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  if (root.dataset.open !== 'true') {
    openSearchableItemField(root, false);
    return;
  }
  renderSearchableItemOptions(root);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const optionButton = target.closest<HTMLButtonElement>('[data-item-option-value]');
  if (optionButton) {
    const root = optionButton.closest<HTMLElement>('[data-item-combobox]');
    if (!root) {
      return;
    }
    commitSearchableItemSelection(root, optionButton.dataset.itemOptionValue ?? '');
    return;
  }
  const toggleButton = target.closest<HTMLButtonElement>('[data-item-combobox-toggle]');
  if (!toggleButton) {
    return;
  }
  const root = toggleButton.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  event.preventDefault();
  if (root.dataset.open === 'true') {
    closeSearchableItemField(root);
    return;
  }
  openSearchableItemField(root);
  getSearchableItemInput(root)?.focus();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root) {
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (root.dataset.open !== 'true') {
      openSearchableItemField(root, false);
      return;
    }
    moveSearchableItemActiveIndex(root, 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (root.dataset.open !== 'true') {
      openSearchableItemField(root, false);
      return;
    }
    moveSearchableItemActiveIndex(root, -1);
    return;
  }
  if (event.key === 'Enter' && root.dataset.open === 'true') {
    event.preventDefault();
    const listEl = getSearchableItemList(root);
    const activeIndex = Number(root.dataset.activeIndex ?? '-1');
    const activeButton = listEl?.querySelectorAll<HTMLButtonElement>('[data-item-option-value]')[activeIndex];
    if (activeButton) {
      commitSearchableItemSelection(root, activeButton.dataset.itemOptionValue ?? '');
    }
    return;
  }
  if (event.key === 'Escape' && root.dataset.open === 'true') {
    event.preventDefault();
    closeSearchableItemField(root);
  }
});

suggestionListEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-suggestion-id]');
  const suggestionId = card?.dataset.suggestionId;
  const action = trigger?.dataset.action;
  if (!trigger || !suggestionId || !action) {
    return;
  }
  if (action === 'complete-suggestion') {
    completeSuggestion(suggestionId).catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'reply-suggestion') {
    const replyInput = card?.querySelector<HTMLTextAreaElement>('[data-role="reply-input"]');
    const content = replyInput?.value.trim() ?? '';
    if (!content) {
      setStatus(t('gm.suggestion.reply.empty'), true);
      return;
    }
    replySuggestion(suggestionId, content).catch((e) => console.error('[GM]', e));
    return;
  }
  if (action === 'remove-suggestion') {
    removeSuggestion(suggestionId).catch((e) => console.error('[GM]', e));
  }
});

suggestionSearchInput.addEventListener('input', () => {
  /** currentSuggestionKeyword：当前建议Keyword。 */
  currentSuggestionKeyword = suggestionSearchInput.value;
  /** currentSuggestionPage：当前建议分页。 */
  currentSuggestionPage = 1;
  if (suggestionSearchTimer !== null) {
    window.clearTimeout(suggestionSearchTimer);
  }
  suggestionSearchTimer = window.setTimeout(() => {
    loadSuggestions().catch((e) => console.error('[GM]', e));
  }, 250);
});

suggestionSearchClearBtn.addEventListener('click', () => {
  suggestionSearchInput.value = '';
  /** currentSuggestionKeyword：当前建议Keyword。 */
  currentSuggestionKeyword = '';
  /** currentSuggestionPage：当前建议分页。 */
  currentSuggestionPage = 1;
  if (suggestionSearchTimer !== null) {
    window.clearTimeout(suggestionSearchTimer);
    /** suggestionSearchTimer：建议搜索Timer。 */
    suggestionSearchTimer = null;
  }
  loadSuggestions().catch((e) => console.error('[GM]', e));
});

suggestionPrevPageBtn.addEventListener('click', () => {
  if (currentSuggestionPage <= 1) {
    return;
  }
  currentSuggestionPage -= 1;
  loadSuggestions().catch((e) => console.error('[GM]', e));
});

suggestionNextPageBtn.addEventListener('click', () => {
  if (currentSuggestionPage >= currentSuggestionTotalPages) {
    return;
  }
  currentSuggestionPage += 1;
  loadSuggestions().catch((e) => console.error('[GM]', e));
});

networkInPrevPageBtn.addEventListener('click', () => {
  if (currentNetworkInPage <= 1 || !state) {
    return;
  }
  currentNetworkInPage -= 1;
  renderPerfLists(state);
});

networkInNextPageBtn.addEventListener('click', () => {
  if (!state) {
    return;
  }
  currentNetworkInPage += 1;
  renderPerfLists(state);
});

networkOutPrevPageBtn.addEventListener('click', () => {
  if (currentNetworkOutPage <= 1 || !state) {
    return;
  }
  currentNetworkOutPage -= 1;
  renderPerfLists(state);
});

networkOutNextPageBtn.addEventListener('click', () => {
  if (!state) {
    return;
  }
  currentNetworkOutPage += 1;
  renderPerfLists(state);
});

playerSearchInput.addEventListener('input', () => {
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
  }
  playerSearchTimer = window.setTimeout(() => {
    loadPlayerList(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
    });
  }, 250);
});
playerSortSelect.addEventListener('change', () => {
  /** currentPlayerSort：当前玩家排序。 */
  currentPlayerSort = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = 1;
  /** lastPlayerListStructureKey：last玩家列表Structure Key。 */
  lastPlayerListStructureKey = null;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerAccountStatusFilterSelect.addEventListener('change', () => {
  currentPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerPrevPageBtn.addEventListener('click', () => {
  if (currentPlayerPage <= 1) {
    return;
  }
  currentPlayerPage -= 1;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
playerNextPageBtn.addEventListener('click', () => {
  if (currentPlayerPage >= currentPlayerTotalPages) {
    return;
  }
  currentPlayerPage += 1;
  loadPlayerList(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.player.list.failed'), true);
  });
});
redeemTabBtn.addEventListener('click', () => switchTab('redeem'));
playerTabBtn.addEventListener('click', () => switchTab('players'));
suggestionTabBtn.addEventListener('click', () => switchTab('suggestions'));
serverTabBtn.addEventListener('click', () => switchTab('server'));
worldTabBtn.addEventListener('click', () => switchTab('world'));
shortcutTabBtn.addEventListener('click', () => switchTab('shortcuts'));
envTabBtn.addEventListener('click', () => switchTab('secrets'));
gameConfigTabBtn.addEventListener('click', () => switchTab('gameconfig'));
aiTabBtn.addEventListener('click', () => switchTab('ai'));
tradesTabBtn.addEventListener('click', () => switchTab('trades'));
serverSubtabOverviewBtn.addEventListener('click', () => switchServerTab('overview'));
serverSubtabTrafficBtn.addEventListener('click', () => switchServerTab('traffic'));
serverSubtabCpuBtn.addEventListener('click', () => switchServerTab('cpu'));
serverSubtabMemoryBtn.addEventListener('click', () => switchServerTab('memory'));
serverSubtabDatabaseBtn.addEventListener('click', () => switchServerTab('database'));
serverSubtabLogsBtn.addEventListener('click', () => switchServerTab('logs'));
serverSubtabWorkersBtn.addEventListener('click', () => switchServerTab('workers'));
serverSubtabEnvCheckBtn.addEventListener('click', () => switchServerTab('envCheck'));
serverSubtabObjectsBtn.addEventListener('click', () => switchServerTab('objects'));
// 诊断面板事件委托（动态渲染，通过 database panel 委托）
serverPanelDatabaseEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  // 撤回按钮
  if (target.closest('#server-diagnostics-undo')) {
    if (!lastExecCommand) return;
    const undoCmd = lastExecCommand;
    if (!window.confirm(`确认撤回上一次写操作？\n\n${undoCmd}`)) return;
    // 撤回 = 把上一条 exec 的记录清除，重新执行之前的查询
    lastExecCommand = lastExecPreviousCommand;
    lastExecPreviousCommand = null;
    const cmdEl = getDiagCommandEl();
    // 回到上一条历史查询
    const history = diagHistoryLoad();
    const prevQuery = history.find((h) => !h.toLowerCase().startsWith('exec ')) ?? 'help';
    if (cmdEl) cmdEl.value = prevQuery;
    setStatus(`已撤回记录，请手动执行反向操作恢复数据。原命令: ${undoCmd.slice(0, 100)}`, true);
    updateUndoButton();
    return;
  }
  // 执行按钮
  if (target.closest('#server-diagnostics-run')) {
    const cmdEl = getDiagCommandEl();
    if (cmdEl) runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    return;
  }
  // 帮助按钮
  if (target.closest('#server-diagnostics-help')) {
    const cmdEl = getDiagCommandEl();
    if (cmdEl) cmdEl.value = 'help';
    runDiagnosticsCommand('help').catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '加载查询帮助失败', true); });
    return;
  }
  // 快捷按钮
  const diagBtn = target.closest<HTMLElement>('[data-diag-cmd]');
  if (diagBtn) {
    const cmd = diagBtn.dataset.diagCmd ?? '';
    const prompt = diagBtn.dataset.diagPrompt;
    const cmdEl = getDiagCommandEl();
    if (prompt) {
      showDiagPrompt(prompt).then((input) => {
        if (!input || !cmdEl) return;
        cmdEl.value = cmd + input.trim();
        runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
      });
    } else {
      if (cmdEl) cmdEl.value = cmd;
      if (cmdEl) runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    }
    return;
  }
  // 单元格点击编辑
  const td = target.closest<HTMLTableCellElement>('td.diag-cell-editable');
  if (td && !td.classList.contains('cell-editing')) {
    startDiagCellEdit(td);
    return;
  }
});
serverPanelDatabaseEl.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (target.id !== 'server-diagnostics-command') return;
  const cmdEl = target as HTMLTextAreaElement;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runDiagnosticsCommand(cmdEl.value).catch((err: unknown) => { setStatus(err instanceof Error ? err.message : '执行查询失败', true); });
    return;
  }
  if (event.key === 'ArrowUp' && !event.shiftKey) {
    const prev = diagHistoryNavigate('up');
    if (prev !== null) { event.preventDefault(); cmdEl.value = prev; }
  }
  if (event.key === 'ArrowDown' && !event.shiftKey) {
    const next = diagHistoryNavigate('down');
    if (next !== null) { event.preventDefault(); cmdEl.value = next; }
  }
});
serverFlagsRefreshBtn?.addEventListener('click', () => {
  loadRuntimeFlags().catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '加载运行时开关失败', true);
  });
});
serverObjectsRefreshBtn.addEventListener('click', () => {
  loadObjectCounts().catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '加载对象信息失败', true);
  });
});
serverFlagsAddBtn?.addEventListener('click', () => {
  const key = serverFlagsNewKeyInput?.value.trim();
  if (!key) return;
  addRuntimeFlag(key).then(() => {
    if (serverFlagsNewKeyInput) serverFlagsNewKeyInput.value = '';
  }).catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '添加开关失败', true);
  });
});
toggleMaintenanceModeBtn.addEventListener('click', () => {
  const nextActive = state?.operations?.maintenanceActive !== true;
  const message = nextActive
    ? '确认开启维护中？主线连接会被拒绝，世界 tick 会暂停。'
    : '确认结束维护？玩家将可以重新连接。';
  if (!window.confirm(message)) {
    return;
  }
  setMaintenanceMode(nextActive).catch((err: unknown) => {
    setStatus(err instanceof Error ? err.message : '切换维护中失败', true);
  });
});
restartServerBtn.addEventListener('click', () => {
  if (!window.confirm('确认重启服务器？当前连接会断开，服务由外层托管器重新拉起。')) {
    return;
  }
  restartServer().catch((err: unknown) => {
    restartServerBtn.disabled = false;
    setStatus(err instanceof Error ? err.message : '重启服务器失败', true);
  });
});
cpuBreakdownSortTotalBtn.addEventListener('click', () => setCpuBreakdownSort('total'));
cpuBreakdownSortCountBtn.addEventListener('click', () => setCpuBreakdownSort('count'));
cpuBreakdownSortAvgBtn.addEventListener('click', () => setCpuBreakdownSort('avg'));
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login().catch((e) => console.error('[GM]', e));
});
editorTabBasicBtn.addEventListener('click', () => switchEditorTab('basic'));
editorTabPositionBtn.addEventListener('click', () => switchEditorTab('position'));
editorTabRealmBtn.addEventListener('click', () => switchEditorTab('realm'));
editorTabBuffsBtn.addEventListener('click', () => switchEditorTab('buffs'));
editorTabTechniquesBtn.addEventListener('click', () => switchEditorTab('techniques'));
editorTabShortcutsBtn.addEventListener('click', () => switchEditorTab('shortcuts'));
editorTabItemsBtn.addEventListener('click', () => switchEditorTab('items'));
editorTabQuestsBtn.addEventListener('click', () => switchEditorTab('quests'));
editorTabMailBtn.addEventListener('click', () => switchEditorTab('mail'));
editorTabRiskBtn.addEventListener('click', () => switchEditorTab('risk'));
editorTabPersistedBtn.addEventListener('click', () => switchEditorTab('persisted'));
playerDatabaseTabsEl.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-database-table]')
    : null;
  const nextTable = target?.dataset.databaseTable?.trim() ?? '';
  if (!nextTable) {
    return;
  }
  currentDatabaseTable = nextTable;
  const detail = getSelectedPlayerDetail();
  if (detail) {
    renderPlayerDatabasePanel(detail);
  }
});

document.getElementById('refresh-state')?.addEventListener('click', () => {
  const loader = currentTab === 'players' || currentTab === 'shortcuts'
    ? loadPlayerList(false, true)
    : loadState(false, true);
  loader.catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.refresh.failed'), true);
  });
});
document.getElementById('logout')?.addEventListener('click', () => logout());
document.getElementById('spawn-bots')?.addEventListener('click', () => {
  spawnBots().catch((e) => console.error('[GM]', e));
});
document.getElementById('remove-all-bots')?.addEventListener('click', () => {
  removeAllBots().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-return-all-to-default-spawn')?.addEventListener('click', () => {
  returnAllPlayersToDefaultSpawn().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-cleanup-invalid-items')?.addEventListener('click', () => {
  cleanupAllPlayersInvalidItems().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-compensate-combat-exp-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersCombatExp().catch((e) => console.error('[GM]', e));
});
document.getElementById('shortcut-compensate-foundation-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersFoundation().catch((e) => console.error('[GM]', e));
});
shortcutWorkspaceEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  const action = trigger?.dataset.action;
  if (!action || !trigger) {
    return;
  }
  if (action === 'add-shortcut-mail-attachment') {
    addMailAttachment('shortcut');
    return;
  }
  if (action === 'remove-shortcut-mail-attachment') {
    removeMailAttachment('shortcut', Number(trigger.dataset.mailAttachmentIndex));
    return;
  }
  if (action === 'send-shortcut-mail') {
    sendShortcutMail().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.request.failed'), true);
    });
  }
});
shortcutWorkspaceEl.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if (scope === 'shortcut' && rest.length > 0) {
      updateMailDraftValue('shortcut', rest.join('.'), target.value);
    }
  }
});
shortcutWorkspaceEl.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
      const attachmentIndex = Number(indexText);
      if (scope === 'shortcut' && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage('shortcut', attachmentIndex, target.value);
        renderShortcutMailComposer();
        return;
      }
    }
    const binding = target.dataset.mailBind;
    if (!binding) {
      return;
    }
    const [scope, ...rest] = binding.split('.');
    if (scope === 'shortcut' && rest.length > 0) {
      updateMailDraftValue('shortcut', rest.join('.'), target.value);
      if (rest[0] === 'attachments' || rest[0] === 'templateId' || rest[0] === 'targetPlayerId') {
        renderShortcutMailComposer();
      }
    }
  }
});
shortcutWorkspaceEl.addEventListener('focusout', () => {
  window.setTimeout(() => {
    flushShortcutMailComposerRefresh();
  }, 0);
});
redeemWorkspaceEl?.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-redeem-group-id],[data-code-id]');
  if (!trigger) {
    return;
  }
  const groupId = trigger.dataset.redeemGroupId;
  if (groupId) {
    /** selectedRedeemGroupId：selected兑换分组ID。 */
    selectedRedeemGroupId = groupId;
    /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
    redeemLatestGeneratedCodes = [];
    loadRedeemGroupDetail(groupId, true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.load.failed'), true);
    });
    return;
  }
  const action = trigger.dataset.action;
  if (!action) {
    return;
  }
  if (action === 'new-redeem-group') {
    /** selectedRedeemGroupId：selected兑换分组ID。 */
    selectedRedeemGroupId = null;
    /** redeemGroupDetailState：兑换分组详情状态。 */
    redeemGroupDetailState = null;
    /** redeemDraft：兑换Draft。 */
    redeemDraft = createDefaultRedeemGroupDraft();
    /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
    redeemLatestGeneratedCodes = [];
    renderRedeemPanel();
    return;
  }
  if (action === 'add-redeem-reward') {
    redeemDraft.rewards.push(createDefaultRedeemReward());
    renderRedeemPanel();
    return;
  }
  if (action === 'remove-redeem-reward') {
    const rewardIndex = Number(trigger.dataset.rewardIndex);
    if (Number.isInteger(rewardIndex) && rewardIndex >= 0 && rewardIndex < redeemDraft.rewards.length) {
      redeemDraft.rewards.splice(rewardIndex, 1);
      renderRedeemPanel();
    }
    return;
  }
  if (action === 'refresh-redeem-groups') {
    loadRedeemGroups(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.refresh.failed'), true);
    });
    return;
  }
  if (action === 'create-redeem-group') {
    createRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.create.failed'), true);
    });
    return;
  }
  if (action === 'save-redeem-group') {
    saveRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.save.failed'), true);
    });
    return;
  }
  if (action === 'append-redeem-codes') {
    appendRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.append.failed'), true);
    });
    return;
  }
  if (action === 'copy-active-redeem-codes') {
    copyActiveRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.copy.failed'), true);
    });
    return;
  }
  if (action === 'destroy-redeem-code') {
    const codeId = trigger.dataset.codeId;
    if (!codeId) {
      return;
    }
    destroyRedeemCode(codeId).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.redeem.destroy.failed'), true);
    });
  }
});
redeemWorkspaceEl?.addEventListener('input', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.redeemBind;
    if (!binding) {
      return;
    }
    updateRedeemDraftValue(binding, target.value);
  }
});
redeemWorkspaceEl?.addEventListener('change', (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
    const binding = target.dataset.redeemBind;
    if (!binding) {
      return;
    }
    updateRedeemDraftValue(binding, target.value);
    renderRedeemPanel();
  }
});
resetNetworkStatsBtn.addEventListener('click', () => {
  resetNetworkStats().catch((e) => console.error('[GM]', e));
});
toggleNetworkPayloadCaptureBtn.addEventListener('click', () => {
  toggleNetworkPayloadCapture().catch((e) => console.error('[GM]', e));
});
serverPanelTrafficEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest<HTMLButtonElement>('[data-network-large-payload-key]');
  const key = button?.dataset.networkLargePayloadKey;
  if (!key) {
    return;
  }
  event.preventDefault();
  const bucket = networkLargePayloadBucketByKey.get(key);
  if (!bucket) {
    setStatus(t('gm.network.large-payload.expired'), true);
    return;
  }
  openNetworkPayloadModal(bucket);
});
resetCpuStatsBtn.addEventListener('click', () => {
  resetCpuStats().catch((e) => console.error('[GM]', e));
});
resetPathfindingStatsBtn.addEventListener('click', () => {
  resetPathfindingStats().catch((e) => console.error('[GM]', e));
});
triggerManualGcBtn.addEventListener('click', () => {
  triggerManualGc().catch((e) => console.error('[GM]', e));
});
writeHeapSnapshotBtn.addEventListener('click', () => {
  writeHeapSnapshot().catch((e) => console.error('[GM]', e));
});
copyHeapSnapshotSummaryBtn?.addEventListener('click', () => {
  writeAndCopyHeapSnapshotSummary().catch((e) => console.error('[GM]', e));
});
copyLatestHeapSnapshotSummaryBtn?.addEventListener('click', () => {
  copyLatestHeapSnapshotSummary().catch((e) => console.error('[GM]', e));
});
serverLogsLoadOlderBtn.addEventListener('click', () => {
  loadServerLogs(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.server.logs.load-older.failed'), true);
  });
});
serverLogsRefreshBtn.addEventListener('click', () => {
  loadServerLogs(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : t('gm.server.logs.refresh.failed'), true);
  });
});
serverWorkersRefreshBtn.addEventListener('click', () => {
  loadWorkerState(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '刷新 worker 状态失败', true);
  });
});
serverEnvCheckRefreshBtn.addEventListener('click', () => {
  loadEnvCheck(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '环境检测失败', true);
  });
});
serverPanelDatabaseEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;

  const subTabBtn = target?.closest<HTMLButtonElement>('[data-db-subtab]');
  if (subTabBtn?.dataset.dbSubtab) {
    databaseSubTab = subTabBtn.dataset.dbSubtab as DatabaseSubTab;
    renderDatabasePanel();
    if (databaseSubTab === 'table-stats' && !tableStatsState && !tableStatsLoading) {
      loadTableStats().catch((e) => console.error('[GM]', e));
    }
    return;
  }

  const loadStatsBtn = target?.closest<HTMLButtonElement>('[data-action="load-table-stats"]');
  if (loadStatsBtn) {
    loadTableStats().catch((e) => console.error('[GM]', e));
    return;
  }

  const cleanupBtn = target?.closest<HTMLButtonElement>('[data-cleanup-target]');
  if (cleanupBtn?.dataset.cleanupTarget) {
    const tableName = cleanupBtn.dataset.cleanupTarget;
    const cleanupMode = cleanupBtn.dataset.cleanupMode === 'all' ? 'all' : 'older_than';
    const confirmMessage = cleanupMode === 'all'
      ? `确认直接清空 ${tableName}？这会删除该表所有记录，此操作不可撤销。`
      : `确认清理 ${tableName} 中 7 天前的数据？此操作不可撤销。`;
    if (confirm(confirmMessage)) {
      cleanupTable(tableName, cleanupMode).catch((e) => console.error('[GM]', e));
    }
    return;
  }

  const refreshButton = target?.closest<HTMLButtonElement>('#database-refresh');
  if (refreshButton) {
    loadDatabaseState(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.state.refresh.failed'), true);
    });
    return;
  }

  const exportButton = target?.closest<HTMLButtonElement>('#database-export-current');
  if (exportButton) {
    exportCurrentDatabase().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.export.failed'), true);
    });
    return;
  }

  const uploadButton = target?.closest<HTMLButtonElement>('#database-upload-backup');
  if (uploadButton) {
    uploadDatabaseBackupFile(false).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : t('gm.database.upload.failed');
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : t('gm.database.upload.failed'), true);
    });
    return;
  }

  const uploadAndRestoreButton = target?.closest<HTMLButtonElement>('#database-upload-and-restore');
  if (uploadAndRestoreButton) {
    uploadDatabaseBackupFile(true).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : t('gm.database.upload-and-restore.failed');
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : t('gm.database.upload-and-restore.failed'), true);
    });
    return;
  }

  const downloadButton = target?.closest<HTMLButtonElement>('[data-db-download]');
  if (downloadButton?.dataset.dbDownload) {
    downloadDatabaseBackup(downloadButton.dataset.dbDownload).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.download.failed'), true);
    });
    return;
  }

  const restoreButton = target?.closest<HTMLButtonElement>('[data-db-restore]');
  if (restoreButton?.dataset.dbRestore) {
    restoreDatabaseBackup(restoreButton.dataset.dbRestore).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : t('gm.database.restore.failed'), true);
    });
  }
});
gmPasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  changeGmPassword().catch((e) => console.error('[GM]', e));
});
envRefreshBtn.addEventListener('click', () => {
  loadEnvironmentVars().catch((e) => console.error('[GM]', e));
});
envReloadBtn.addEventListener('click', () => {
  reloadEnvironmentVars().catch((e) => console.error('[GM]', e));
});
envExpandBtn.addEventListener('click', () => {
  toggleAllEnvironmentGroups(true);
});
envCollapseBtn.addEventListener('click', () => {
  toggleAllEnvironmentGroups(false);
});
gameConfigRefreshBtn.addEventListener('click', () => {
  loadGameConfig().catch((e) => console.error('[GM]', e));
});
gameConfigExpandBtn.addEventListener('click', () => {
  toggleAllGameConfigGroups(true);
});
gameConfigCollapseBtn.addEventListener('click', () => {
  toggleAllGameConfigGroups(false);
});
aiProviderRefreshBtn.addEventListener('click', () => {
  loadAiProviderConfigs().catch((e) => console.error('[GM]', e));
});
aiProviderAddTextBtn.addEventListener('click', () => {
  addAiProviderConfig('text');
});
aiProviderAddImageBtn.addEventListener('click', () => {
  addAiProviderConfig('image');
});
tradesFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const pageSizeRaw = Number(tradesPageSizeInput.value);
  loadTrades({
    resetPage: true,
    playerKeyword: tradesPlayerInput.value,
    itemKeyword: tradesItemInput.value,
    pageSize: Number.isFinite(pageSizeRaw) ? Math.trunc(pageSizeRaw) : undefined,
  }).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesResetBtn.addEventListener('click', () => {
  tradesPlayerInput.value = '';
  tradesItemInput.value = '';
  tradesPageSizeInput.value = '20';
  loadTrades({
    resetPage: true,
    playerKeyword: '',
    itemKeyword: '',
    pageSize: 20,
  }).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesPagePrevBtn.addEventListener('click', () => {
  if (tradesQueryState.page <= 1) return;
  tradesQueryState.page -= 1;
  loadTrades().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
tradesPageNextBtn.addEventListener('click', () => {
  tradesQueryState.page += 1;
  loadTrades().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载交易记录失败', true);
  });
});
savePlayerBtn.addEventListener('click', () => {
  saveSelectedPlayer().catch((e) => console.error('[GM]', e));
});
refreshPlayerBtn.addEventListener('click', () => {
  refreshSelectedPlayer().catch((e) => console.error('[GM]', e));
});
openPlayerMailBtn.addEventListener('click', () => {
  openSelectedPlayerMailTab();
});
resetPlayerBtn.addEventListener('click', () => {
  resetSelectedPlayer().catch((e) => console.error('[GM]', e));
});
resetHeavenGateBtn.addEventListener('click', () => {
  resetSelectedPlayerHeavenGate().catch((e) => console.error('[GM]', e));
});
removeBotBtn.addEventListener('click', () => {
  removeSelectedBot().catch((e) => console.error('[GM]', e));
});

syncPersistedGmPasswordToInputs();

if (token) {
  showShell();
  switchTab('server');
  switchServerTab(currentServerTab);
  setCpuBreakdownSort(currentCpuBreakdownSort);
  switchEditorTab(currentEditorTab);
  loadEditorCatalog()
    .then(() => loadState())
    .then(() => startPolling())
    .catch(() => logout(t('gm.request.login-expired')));
} else {
  showLogin();
}
