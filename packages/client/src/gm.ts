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
  type GmDatabaseStateRes,
  type GmUploadDatabaseBackupRes,
  type GmCreateMailReq,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmReplySuggestionReq,
  type GmSetPlayerBodyTrainingLevelReq,
  type GmSuggestionListRes,
  type GmCpuSectionSnapshot,
  type GmMemoryDomainEstimateSnapshot,
  type GmMemoryInstanceEstimateSnapshot,
  type GmEditorBuffOption,
  type GmEditorCatalogRes,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
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
  type GmTriggerDatabaseBackupRes,
  type GmUpdateManagedPlayerAccountReq,
  type GmUpdateManagedPlayerPasswordReq,
  type GmUpdateRedeemCodeGroupReq,
  type GmUpdatePlayerReq,
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
} from '@mud/shared';
import {
  GM_FACING_OPTIONS,
  GM_QUEST_LINE_OPTIONS,
  GM_QUEST_OBJECTIVE_TYPE_OPTIONS,
  GM_QUEST_STATUS_OPTIONS,
  GM_TECHNIQUE_REALM_OPTIONS,
} from './constants/world/gm';
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
import { startClientVersionReload } from './version-reload';

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

/** summaryTotalEl：摘要总量El。 */
const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
/** summaryOnlineEl：摘要Online El。 */
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
/** summaryOfflineHangingEl：摘要Offline Hanging El。 */
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
/** summaryOfflineEl：摘要Offline El。 */
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
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
/** serverLogsLoadOlderBtn：服务端日志加载更早Btn。 */
const serverLogsLoadOlderBtn = document.getElementById('server-logs-load-older') as HTMLButtonElement;
/** serverLogsRefreshBtn：服务端日志刷新Btn。 */
const serverLogsRefreshBtn = document.getElementById('server-logs-refresh') as HTMLButtonElement;
/** serverLogsMetaEl：服务端日志元信息El。 */
const serverLogsMetaEl = document.getElementById('server-logs-meta') as HTMLDivElement;
/** serverLogsContentEl：服务端日志内容El。 */
const serverLogsContentEl = document.getElementById('server-logs-content') as HTMLPreElement;
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
/** resetCpuStatsBtn：reset Cpu属性Btn。 */
const resetCpuStatsBtn = document.getElementById('reset-cpu-stats') as HTMLButtonElement;
/** resetPathfindingStatsBtn：reset Pathfinding属性Btn。 */
const resetPathfindingStatsBtn = document.getElementById('reset-pathfinding-stats') as HTMLButtonElement;
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
type GmServerTab = 'overview' | 'traffic' | 'cpu' | 'memory' | 'database' | 'logs';

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
    setStatus('检测到前端新版本，正在刷新页面');
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
/** draftSnapshot：draft快照。 */
let draftSnapshot: PlayerState | null = null;
/** editorDirty：编辑器Dirty。 */
let editorDirty = false;
/** draftSourcePlayerId：draft来源玩家ID。 */
let draftSourcePlayerId: string | null = null;
/** pollTimer：poll Timer。 */
let pollTimer: number | null = null;
/** currentTab：当前Tab。 */
let currentTab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts' = 'server';
/** currentServerTab：当前服务端Tab。 */
let currentServerTab: GmServerTab = 'overview';
/** currentCpuBreakdownSort：当前Cpu Breakdown排序。 */
let currentCpuBreakdownSort: 'total' | 'count' | 'avg' = 'total';
/** currentEditorTab：当前编辑器Tab。 */
let currentEditorTab: GmEditorTab = 'basic';
/** currentDatabaseTable：当前数据库表标签。 */
let currentDatabaseTable = 'server_player_snapshot';
let currentInventoryAddType: (typeof ITEM_TYPES)[number] = 'material';
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
/** lastPlayerListStructureKey：last玩家列表Structure Key。 */
let lastPlayerListStructureKey: string | null = null;
/** lastEditorStructureKey：last编辑器Structure Key。 */
let lastEditorStructureKey: string | null = null;

function buildGmStateApiPath(params: URLSearchParams): string {
  return `${GM_API_BASE_PATH}/state?${params.toString()}`;
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
    throw new Error('GM 状态响应结构异常');
  }
}

function assertGmPlayerDetailResponseShape(data: unknown): asserts data is GmPlayerDetailRes {
  if (!isRecord(data) || !isRecord(data.player) || typeof data.player.id !== 'string') {
    throw new Error('GM 玩家详情响应结构异常');
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
/** lastMemoryInstanceStructureKey：last Memory Instance Structure Key。 */
let lastMemoryInstanceStructureKey: string | null = null;
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
      value: player.meta.lastHeartbeatAt ? formatDateTime(player.meta.lastHeartbeatAt) : '当前在线，暂无可靠记录',
      note: player.meta.lastHeartbeatAt ? undefined : '当前未返回可靠的本次上线时间。',
    };
  }
  if (player.meta.updatedAt) {
    return {
      label: '最近存档时间',
      value: formatDateTime(player.meta.updatedAt),
    };
  }
  if (player.meta.lastHeartbeatAt) {
    return {
      label: '最近心跳时间',
      value: formatDateTime(player.meta.lastHeartbeatAt),
      note: '该时间来自旧心跳语义，不等同于可靠离线时间。',
    };
  }
  return {
    label: '最近活动记录',
    value: '暂无可靠记录',
  };
}

/** getManagedPlayerAccountStatusLabel：读取账号状态标签。 */
function getManagedPlayerAccountStatusLabel(status: GmManagedPlayerSummary['accountStatus']): string {
  switch (status) {
    case 'banned':
      return '封禁';
    case 'abnormal':
      return '异常';
    case 'normal':
    default:
      return '正常';
  }
}

/** getManagedAccountRestrictionLabel：读取账号封禁状态标签。 */
function getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? '已封禁' : '可登录';
}

/** getManagedAccountRestrictionPillClass：读取账号封禁状态样式。 */
function getManagedAccountRestrictionPillClass(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? 'offline' : 'online';
}

/** getPlayerRiskLevelLabel：读取风险等级标签。 */
function getPlayerRiskLevelLabel(level: GmPlayerRiskLevel): string {
  switch (level) {
    case 'critical':
      return '极高风险';
    case 'high':
      return '高风险';
    case 'medium':
      return '中风险';
    case 'low':
    default:
      return '低风险';
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
    : '<div class="editor-note" style="margin-top: 8px;">当前维度暂无额外证据。</div>';
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
        账号状态：${escapeHtml(getManagedAccountRestrictionLabel(player.account))}<br />
        管理员名单：${player.account.isRiskAdmin ? '已加入' : '未加入'}<br />
        注册时间：${escapeHtml(formatDateTime(player.account.createdAt))}<br />
        最近登录：${escapeHtml(formatDateTime(player.account.lastLoginAt))}
      </div>
    `
    : '<div class="editor-note" style="margin-top: 8px;">当前目标没有可管理账号，风险检测会按异常账号绑定处理。</div>';

  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">风险总览</div>
          <div class="editor-section-note">这里展示账号真源、命名模式、相似账号簇、重复 IP/设备与坊市关系的低频检测结果，不会自动封号。</div>
        </div>
        <div class="editor-chip-list">
          <span class="pill ${getPlayerRiskLevelPillClass(report.level)}">${escapeHtml(getPlayerRiskLevelLabel(report.level))}</span>
          <span class="pill">总分 ${report.score} / ${report.maxScore}</span>
          <span class="pill">${escapeHtml(formatDateTime(report.generatedAt))}</span>
        </div>
      </div>
      <div class="note-card">${escapeHtml(report.overview)}</div>
      ${accountEnvMarkup}
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">处置建议</div>
          <div class="editor-section-note">只提供复核顺序，资产或账号处置仍必须由 GM 人工确认。</div>
        </div>
      </div>
      <div class="editor-card-list">
        ${report.recommendations.map((entry, index) => `
          <div class="editor-card">
            <div class="editor-card-head">
              <div class="editor-card-title">建议 ${index + 1}</div>
            </div>
            <div class="editor-note" style="margin-top: 0;">${escapeHtml(entry)}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">维度明细</div>
          <div class="editor-section-note">每个维度都会给出分数、摘要和命中的证据。</div>
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
    return '服务端编辑目录加载失败，当前仅保留本地参考标签；模板快捷写入已停用，避免把本地目录直接写回服务端。';
  }
  if (editorCatalogSource === 'unavailable') {
    return '编辑目录尚未加载完成，模板快捷写入暂不可用。';
  }
  return '';
}

/** assertTrustedEditorCatalog：处理assert Trusted编辑器目录。 */
function assertTrustedEditorCatalog(actionLabel: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (hasServerEditorCatalog()) {
    return;
  }
  throw new Error(`${actionLabel}已暂停：GM 编辑目录未从服务端加载成功，当前仅允许查看本地参考标签，避免提交过期目录数据`);
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
  button.querySelector<HTMLElement>('[data-role="name"]')!.textContent = player.roleName;
  const presenceEl = button.querySelector<HTMLElement>('[data-role="presence"]')!;
  presenceEl.classList.toggle('online', presence.className === 'online');
  presenceEl.classList.toggle('offline', presence.className === 'offline');
  presenceEl.textContent = presence.label;
  button.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = `账号: ${player.accountName ?? '无'} · 状态: ${getManagedPlayerAccountStatusLabel(player.accountStatus)} · 风险: ${player.riskScore} (${getPlayerRiskLevelLabel(player.riskLevel)})`;
  button.querySelector<HTMLElement>('[data-role="identity"]')!.textContent = `${getPlayerIdentityLine(player)}${player.riskTags.length > 0 ? ` · 命中: ${player.riskTags.join(' / ')}` : ''}`;
  button.querySelector<HTMLElement>('[data-role="stats"]')!.textContent = getPlayerStatsLine(player);
}

/** getEditorSubtitle：读取编辑器Subtitle。 */
function getEditorSubtitle(detail: GmManagedPlayerRecord): string {
  return [
    `账号: ${detail.accountName ?? '无'}`,
    `显示名: ${detail.displayName}`,
    `地图: ${detail.mapName} (${detail.x}, ${detail.y})`,
    detail.meta.updatedAt ? `最近落盘: ${new Date(detail.meta.updatedAt).toLocaleString('zh-CN')}` : '最近落盘: 运行时角色',
  ].join(' · ');
}

/** getEditorMetaMarkup：读取编辑器元数据Markup。 */
function getEditorMetaMarkup(detail: GmManagedPlayerRecord): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const presence = getPlayerPresenceMeta(detail);
  const base = gmMarkupHelpers.getEditorMetaMarkup(detail, presence, editorDirty);
  const riskMeta = `<span class="pill ${getPlayerRiskLevelPillClass(detail.riskLevel)}">风险 ${detail.riskScore} · ${escapeHtml(getPlayerRiskLevelLabel(detail.riskLevel))}</span>`;
  if (hasServerEditorCatalog()) {
    return `${base}${riskMeta}`;
  }
  return `${base}${riskMeta}<span class="pill">${editorCatalogSource === 'local-fallback' ? '目录: 本地回退' : '目录: 未加载'}</span>`;
}

/** getEditorBodyChipMarkup：读取编辑器身体Chip Markup。 */
function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return gmMarkupHelpers.getEditorBodyChipMarkup(player, draft, editorDirty);
}

/** getEquipmentCardTitle：读取Equipment卡片标题。 */
function getEquipmentCardTitle(item: ItemStack | null): string {
  return gmMarkupHelpers.getEquipmentCardTitle(item);
}

/** getEquipmentCardMeta：读取Equipment卡片元数据。 */
function getEquipmentCardMeta(item: ItemStack | null): string {
  return gmMarkupHelpers.getEquipmentCardMeta(item);
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
  return gmMarkupHelpers.getInventoryCardTitle(item, index);
}

/** getInventoryCardMeta：读取背包卡片元数据。 */
function getInventoryCardMeta(item: ItemStack | undefined): string {
  return gmMarkupHelpers.getInventoryCardMeta(item);
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
    label: technique.name || technique.techId,
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
          { value: '', label: '请选择 Buff' },
          { value: selectedBuffId, label: selectedBuffId },
        ]
      : [{ value: '', label: '请选择 Buff' }];
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
    { value: '', label: '发送给全服玩家' },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.roleName} · ${player.accountName || '无账号'} · ${player.meta.online ? '在线' : '离线'}`,
    })),
  ];
  const selectedTargetId = broadcastMailDraft.targetPlayerId.trim();
  if (selectedTargetId && !options.some((option) => option.value === selectedTargetId)) {
    const fallbackLabel = selectedPlayerDetail?.id === selectedTargetId
      ? `${selectedPlayerDetail.roleName} · ${selectedPlayerDetail.account?.username || '无账号'} · 已选中`
      : `当前目标 · ${selectedTargetId}`;
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
  const senderLabel = draft.senderLabel.trim() || '司命台';
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
    throw new Error('标题、正文和附件至少填写一项');
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
              <div class="editor-card-title">${escapeHtml(entry.itemId || `附件 ${index + 1}`)}</div>
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
  return gmCatalogHelpers.getInventoryRowMeta(item);
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
          <div class="editor-code">${escapeHtml(TECHNIQUE_REALM_LABELS[technique.realm] ?? String(technique.realm))}</div>
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
        ${numberField('强化等级', `${basePath}.enhanceLevel`, item.enhanceLevel)}
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
        该物品来自策划模板，等级、品阶、装备属性、数值和特效会在服务端按模板补全；GM 这里仅建议改模板 ID 和数量。
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
      ${numberField('强化等级', `${basePath}.enhanceLevel`, item.enhanceLevel)}
      ${numberField('等级', `${basePath}.level`, item.level)}
      ${nullableTextField('品阶', `${basePath}.grade`, item.grade, 'undefined')}
      ${jsonField('装备属性', `${basePath}.equipAttrs`, item.equipAttrs ?? {}, 'object')}
      ${jsonField('装备数值', `${basePath}.equipStats`, item.equipStats ?? {}, 'object')}
      ${jsonField('特效配置', `${basePath}.effects`, item.effects ?? [], 'array', 'wide')}
    </div>
  `;
}

/** getCompactInventoryItemMarkup：读取Compact背包物品Markup。 */
function getCompactInventoryItemMarkup(item: ItemStack, index: number): string {
  return gmMarkupHelpers.getCompactInventoryItemMarkup(item, index, numberField);
}

/** getReadonlyPreviewValue：读取Readonly Preview值。 */
function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  return gmMarkupHelpers.getReadonlyPreviewValue(draft, path);
}

/** buildEditorStructureKey：构建编辑器Structure Key。 */
function buildEditorStructureKey(detail: GmManagedPlayerRecord, draft: PlayerState): string {
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort().join(',');
  const equipmentPresence = EQUIP_SLOTS.map((slot) => (draft.equipment[slot] ? '1' : '0')).join('');
  return [
    detail.id,
    mapIds,
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
    editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-title"][data-index="${index}"]`)!.textContent = getInventoryCardTitle(item, index);
    editorContentEl.querySelector<HTMLElement>(`[data-preview="inventory-meta"][data-index="${index}"]`)!.textContent = getInventoryCardMeta(item);
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
  const recordedAt = sample.recordedAt > 0 ? new Date(sample.recordedAt).toLocaleString() : '未知时间';
  return `
    <section class="network-payload-sample">
      <div class="network-payload-sample-head">
        <div>样本 ${index + 1}</div>
        <div>${escapeHtml(sample.event)} · ${escapeHtml(recordedAt)} · payload ${escapeHtml(formatBytes(sample.bytes))} · packet ${escapeHtml(formatBytes(sample.packetBytes))}</div>
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
    setStatus('这个流量项当前没有可查看的大包样本', true);
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
          <div class="network-breakdown-subtitle">仅开发态记录最近 ${samples.length} 个超过 1 KB 的实际包体</div>
        </div>
        <button class="small-btn" type="button" data-network-payload-close>关闭</button>
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
      return 'Buff';
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

/** switchServerTab：处理switch服务端Tab。 */
function switchServerTab(tab: GmServerTab): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  /** currentServerTab：当前服务端Tab。 */
  currentServerTab = tab;
  serverSubtabOverviewBtn.classList.toggle('active', tab === 'overview');
  serverSubtabTrafficBtn.classList.toggle('active', tab === 'traffic');
  serverSubtabCpuBtn.classList.toggle('active', tab === 'cpu');
  serverSubtabMemoryBtn.classList.toggle('active', tab === 'memory');
  serverSubtabDatabaseBtn.classList.toggle('active', tab === 'database');
  serverSubtabLogsBtn.classList.toggle('active', tab === 'logs');
  serverPanelOverviewEl.classList.toggle('hidden', tab !== 'overview');
  serverPanelTrafficEl.classList.toggle('hidden', tab !== 'traffic');
  serverPanelCpuEl.classList.toggle('hidden', tab !== 'cpu');
  serverPanelMemoryEl.classList.toggle('hidden', tab !== 'memory');
  serverPanelDatabaseEl.classList.toggle('hidden', tab !== 'database');
  serverPanelLogsEl.classList.toggle('hidden', tab !== 'logs');
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
      return 'PostgreSQL custom dump';
    case 'legacy_json_snapshot':
      return '历史 JSON 快照（硬切后不可恢复）';
    default:
      return '未知格式';
  }
}

/** renderDatabasePanel：渲染数据库面板。 */
function renderDatabasePanel(): void {
  const busy = databaseState?.runningJob?.status === 'running' || databaseImportBusy;
  const backups = databaseState?.backups ?? [];
  const importStatus = databaseImportStatus
    ? databaseImportStatus
    : '只接受新版 PostgreSQL custom dump（.dump）。上传后会进入下方备份列表；选择“上传并导入”会继续走同一套维护态恢复流程。';
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

  serverPanelDatabaseEl.innerHTML = `
    <div class="button-row">
      <button id="database-refresh" class="small-btn" type="button">刷新持久化状态</button>
      <button id="database-export-current" class="small-btn primary" type="button" ${busy ? 'disabled' : ''}>导出数据库备份</button>
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">导入本地数据库备份</div>
        <div class="network-breakdown-subtitle">上传新版 PostgreSQL custom dump，登记到当前 GM 备份目录；恢复仍需要服务端维护态</div>
      </div>
      <div class="filter-row" style="margin-top: 10px;">
        <input id="database-import-file" class="search-input" type="file" accept=".dump,application/octet-stream" ${busy ? 'disabled' : ''} />
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
            <div class="editor-card-title">${escapeHtml(reward.itemId || `奖励 ${index + 1}`)}</div>
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
    setStatus('当前分组没有可复制的未使用兑换码', true);
    return;
  }
  const copied = await copyTextToClipboard(activeCodes.join('\n'));
  if (!copied) {
    setStatus('复制未使用兑换码失败，请检查浏览器剪贴板权限', true);
    return;
  }
  setStatus(`已复制 ${activeCodes.length} 个未使用兑换码${group ? ` · ${group.name}` : ''}`);
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
    throw new Error('分组名称不能为空');
  }
  if (rewards.length === 0) {
    throw new Error('请至少配置一个奖励物品');
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
      setStatus(`已同步 ${redeemGroupsState.length} 个兑换码分组`);
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
      setStatus(`已加载分组 ${detail.group.name}`);
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
  setStatus(`已创建分组 ${result.group.name}，并生成 ${result.codes.length} 个兑换码`);
}

/** saveRedeemGroup：保存兑换分组。 */
async function saveRedeemGroup(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
  }
  const payload: GmUpdateRedeemCodeGroupReq = buildRedeemGroupPayload();
  await request<GmRedeemCodeGroupDetailRes>(`${GM_API_BASE_PATH}/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  /** redeemLatestGeneratedCodes：兑换Latest Generated兑换码。 */
  redeemLatestGeneratedCodes = [];
  await loadRedeemGroups(true);
  setStatus('兑换码分组已保存');
}

/** appendRedeemCodes：处理append兑换兑换码。 */
async function appendRedeemCodes(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
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
  setStatus(`已追加 ${result.codes.length} 个兑换码`);
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
  setStatus('兑换码已销毁');
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
      setStatus(`已同步 ${data.backups.length} 份数据库备份`);
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
  setStatus(`已开始导出当前数据库：${result.job.backupId ?? result.job.id}`);
  await loadDatabaseState(true);
}

/** getSelectedDatabaseImportFile：读取数据库导入文件。 */
function getSelectedDatabaseImportFile(): File | null {
  const input = serverPanelDatabaseEl.querySelector<HTMLInputElement>('#database-import-file');
  const liveFile = input?.files?.[0] ?? null;
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
  return lowerName.endsWith('.dump');
}

/** updateDatabaseImportFileSelection：处理数据库导入文件选择变化。 */
function updateDatabaseImportFileSelection(file: File | null): void {
  selectedDatabaseImportFile = file;
  if (!file) {
    patchDatabaseImportStatus('未选择文件。');
    return;
  }

  const fileLabel = `${file.name}（${formatBytes(file.size)}）`;
  if (!isSupportedDatabaseImportFile(file)) {
    patchDatabaseImportStatus(`已选择 ${fileLabel}，但硬切后仅支持新版 PostgreSQL custom dump（.dump）。`);
    setStatus('仅支持新版 PostgreSQL custom dump（.dump）', true);
    return;
  }

  patchDatabaseImportStatus(`已选择 ${fileLabel}，可以上传到备份列表，或上传并导入。`);
  setStatus(`已选择数据库备份：${file.name}`);
}

/** uploadDatabaseBackupFile：上传数据库备份文件。 */
async function uploadDatabaseBackupFile(restoreAfterUpload: boolean): Promise<void> {
  const file = getSelectedDatabaseImportFile();
  if (!file) {
    setStatus('请先选择要导入的数据库备份文件', true);
    patchDatabaseImportStatus('未选择文件。');
    return;
  }
  if (!isSupportedDatabaseImportFile(file)) {
    setStatus('仅支持新版 PostgreSQL custom dump（.dump）', true);
    patchDatabaseImportStatus(`文件类型不受支持：${file.name}。`);
    return;
  }
  if (restoreAfterUpload) {
    const confirmed = window.confirm(`将上传 ${file.name}，随后用它覆盖当前主线数据库。\n服务端仍会先生成一份导入前备份，并断开在线玩家连接。是否继续？`);
    if (!confirmed) {
      return;
    }
  }

  databaseImportBusy = true;
  databaseImportStatus = `正在上传 ${file.name}（${formatBytes(file.size)}）…`;
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
    databaseImportStatus = `已上传 ${result.backup.fileName}，大小 ${formatBytes(result.backup.sizeBytes)}。`;
    setStatus(`已上传数据库备份：${result.backup.fileName}`);
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
  setStatus(`已下载数据库备份 ${fileName}`);
}

/** restoreDatabaseBackup：处理restore数据库备份。 */
async function restoreDatabaseBackup(
  backupId: string,
  options: { skipConfirm?: boolean; fallbackFileName?: string } = {},
): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const backup = databaseState?.backups.find((entry) => entry.id === backupId);
  if (!backup && !options.fallbackFileName) {
    setStatus('目标备份不存在', true);
    return;
  }
  if (backup && backup.format !== 'postgres_custom_dump') {
    setStatus('硬切后只支持恢复新版 PostgreSQL custom dump，不再支持历史 JSON 快照', true);
    return;
  }
  const fileName = backup?.fileName ?? options.fallbackFileName ?? backupId;
  const confirmed = options.skipConfirm === true
    ? true
    : window.confirm(`将使用备份 ${fileName} 覆盖当前主线数据库。\n服务端会先自动生成一份导入前备份，并断开在线玩家连接。是否继续？`);
  if (!confirmed) {
    return;
  }
  const body: GmRestoreDatabaseReq = { backupId };
  const result = await request<GmTriggerDatabaseBackupRes>(`${GM_API_BASE_PATH}/database/restore`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setStatus(`已开始恢复数据库备份：${result.job.sourceBackupId ?? fileName}`);
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
function switchTab(tab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts'): void {
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
  serverWorkspaceEl.classList.toggle('hidden', tab !== 'server');
  redeemWorkspaceEl.classList.toggle('hidden', tab !== 'redeem');
  playerWorkspaceEl.classList.toggle('hidden', tab !== 'players');
  worldWorkspaceEl.classList.toggle('hidden', tab !== 'world');
  shortcutWorkspaceEl.classList.toggle('hidden', tab !== 'shortcuts');
  suggestionWorkspaceEl.classList.toggle('hidden', tab !== 'suggestions');
  if (tab === 'suggestions') {
    loadSuggestions().catch(() => {});
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
    setStatus('GM 编辑目录加载失败，当前仅保留本地参考标签；目录型编辑与带附件邮件已暂停，避免提交过期模板数据。', true);
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
      .map((player) => `${player.id}:${player.roleName}:${player.accountName || ''}:${player.meta.online ? 1 : 0}`),
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
    submitLabel: targetPlayer ? `发送给 ${targetPlayer.roleName}` : '发送全服邮件',
    note: targetPlayer
      ? '指定玩家邮件会直接写入该角色的持久化邮箱，在线时只推送摘要更新。'
      : '全服邮件不会混入高频地图同步，只在玩家打开收件箱时按需拉取。',
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
      suggestionListEl.innerHTML = '<div class="empty-hint">暂无建议反馈数据</div>';
      lastSuggestionStructureKey = 'empty';
    }
    suggestionPageMetaEl.textContent = `第 ${currentSuggestionPage} / ${currentSuggestionTotalPages} 页 · 共 ${currentSuggestionTotal} 条`;
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
  suggestionPageMetaEl.textContent = `第 ${currentSuggestionPage} / ${currentSuggestionTotalPages} 页 · 共 ${currentSuggestionTotal} 条`;
  suggestionPrevPageBtn.disabled = currentSuggestionPage <= 1;
  suggestionNextPageBtn.disabled = currentSuggestionPage >= currentSuggestionTotalPages;
}

/** completeSuggestion：完成建议。 */
async function completeSuggestion(id: string): Promise<void> {
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}/complete`, { method: 'POST' });
    setStatus('建议已标记为完成');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '操作失败', true);
  }
}

/** replySuggestion：处理回复建议。 */
async function replySuggestion(id: string, content: string): Promise<void> {
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content } satisfies GmReplySuggestionReq),
    });
    setStatus('开发者回复已发送');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '发送回复失败', true);
  }
}

/** removeSuggestion：处理remove建议。 */
async function removeSuggestion(id: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!confirm('确定要移除这条建议吗？此操作不可撤销。')) return;
  try {
    await request(`${GM_API_BASE_PATH}/suggestions/${id}`, { method: 'DELETE' });
    setStatus('建议已成功移除');
    if (suggestions.length === 1 && currentSuggestionPage > 1) {
      currentSuggestionPage -= 1;
    }
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除失败', true);
  }
}

/** request：处理请求。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
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
    logout('GM 登录已失效，请重新输入密码');
    throw new Error('GM 登录已失效');
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
        : '请求失败';
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
    logout('GM 登录已失效，请重新输入密码');
    throw new Error('GM 登录已失效');
  }
  if (!response.ok) {
    throw new Error((await response.text()).trim() || '请求失败');
  }
  return response;
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
    setStatus('服务端编辑目录不可用，当前不能用模板方式新增邮件附件。', true);
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
    throw new Error('当前没有可发送邮件的角色');
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
  setStatus(`已向 ${detail.roleName} 发送邮件：${result.mailId}`);
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
    ? `已向 ${targetPlayer.roleName} 发送邮件：${result.mailId}`
    : `已发送全服邮件批次 ${result.batchId ?? result.mailId}，覆盖 ${result.recipientCount ?? 0} 人`);
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
    attrCurves: {},
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
  return entry ? `${entry.name} · ${itemId}` : itemId;
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
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort();
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
          <div class="editor-card-title">Buff ${index + 1}</div>
          <button class="small-btn danger" type="button" data-action="remove-buff" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${selectField('Buff', `temporaryBuffs.${index}.buffId`, buff.buffId, getBuffCatalogOptions(buff.buffId), 'wide')}
          ${numberField('层数', `temporaryBuffs.${index}.stacks`, buff.stacks)}
          ${numberField('剩余时间', `temporaryBuffs.${index}.remainingTicks`, buff.remainingTicks)}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有临时效果。</div>';

  const inventoryMarkup = inventoryItems.length > 0
    ? inventoryItems.map((item, index) => getCompactInventoryItemMarkup(item, index)).join('')
    : '<div class="editor-note">背包为空。</div>';

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
          ${nullableTextField('目标 NPC ID', `quests.${index}.targetNpcId`, quest.targetNpcId, 'undefined')}
          ${nullableTextField('目标 NPC 名称', `quests.${index}.targetNpcName`, quest.targetNpcName, 'undefined')}
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
          ${nullableTextField('提交 NPC ID', `quests.${index}.submitNpcId`, quest.submitNpcId, 'undefined')}
          ${nullableTextField('提交 NPC 名称', `quests.${index}.submitNpcName`, quest.submitNpcName, 'undefined')}
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
          <div class="editor-code">ID: ${escapeHtml(draft.id)}</div>
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
        ${selectField('地图', 'mapId', draft.mapId, mapIds.map((mapId) => ({ value: mapId, label: mapId })))}
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
          <div class="editor-section-title">Buff 编辑</div>
          <div class="editor-section-note">这里只保留 Buff 选择、层数和剩余时间，其他静态字段按模板自动带出。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-buff"${catalogActionDisabled}>新增 Buff</button>
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
          <div class="editor-section-note">容量与物品堆叠。</div>
        </div>
        <div class="button-row">
          ${numberField('容量', 'inventory.capacity', draft.inventory.capacity)}
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
      <div class="inventory-compact-list">${inventoryMarkup}</div>
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
  trafficResetMetaEl.textContent = startedAt
    ? `统计起点：${startedAt.toLocaleString()} · 已累计 ${formatDurationSeconds(elapsedSec)}`
    : '统计区间尚未开始。';
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
    ? `运行态画像：${new Date(memoryEstimate.generatedAt).toLocaleString()} · 快照估算覆盖 ${formatBytes(memoryEstimate.coveredBytes)} / RSS ${formatBytes(memoryEstimate.rssBytes)} · 覆盖 ${memoryEstimate.coveragePercent.toFixed(1)}% · 缓存 ${Math.round(memoryEstimate.cacheTtlMs / 1000)} 秒`
    : '运行态内存画像尚未生成。';
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
      ? '正在加载角色详情…'
      : (selectedPlayerDetailError?.trim() || '当前角色详情暂不可用。');
    editorPanelEl.classList.add('hidden');
    clearPlayerDatabasePanel(loadingPlayerDetailId === selected.id
      ? '正在加载数据库详情…'
      : '当前数据库详情暂不可用。');
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
  const shouldDelayStructureRefresh = (
    lastEditorStructureKey !== structureKey
    && draftSourcePlayerId === detail.id
    && !!activeSearchableItemField
    && activeSearchableItemField.isConnected
    && editorContentEl.contains(activeSearchableItemField)
    && activeSearchableItemField.dataset.open === 'true'
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
  switchServerTab(currentServerTab);
  renderSummary(state);
  renderDatabasePanel();
  renderPlayerList(state);
  renderEditor(state);
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
    return { ok: false, message: '当前没有可编辑角色' };
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
    setStatus('服务端编辑目录不可用，当前不能通过模板下拉直接改写角色数据。', true);
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
async function loadState(silent = false, refreshDetail = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!token) return;
  const params = new URLSearchParams({
    page: String(currentPlayerPage),
    pageSize: '50',
    sort: currentPlayerSort,
    accountStatus: currentPlayerAccountStatusFilter,
  });
  const keyword = playerSearchInput.value.trim();
  if (keyword) {
    params.set('keyword', keyword);
  }
  const data = await request<GmStateRes>(buildGmStateApiPath(params));
  assertGmStateResponseShape(data);
  /** state：状态。 */
  state = data;
  /** currentPlayerPage：当前玩家分页。 */
  currentPlayerPage = data.playerPage.page;
  /** currentPlayerTotalPages：当前玩家总量Pages。 */
  currentPlayerTotalPages = data.playerPage.totalPages;
  const previousSelectedPlayerId = selectedPlayerId;
  if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
    /** selectedPlayerId：selected玩家ID。 */
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
    /** selectedPlayerDetail：selected玩家详情。 */
    selectedPlayerDetail = null;
    /** selectedPlayerDetailError：selected玩家详情错误。 */
    selectedPlayerDetailError = null;
    /** loadingPlayerDetailId：loading玩家详情ID。 */
    loadingPlayerDetailId = null;
  }
  if (!silent) {
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
      setStatus(`已加载 ${data.player.name} 的角色详情`);
    }
  } catch (error) {
    if (nonce === detailRequestNonce && selectedPlayerId === playerId) {
      selectedPlayerDetail = null;
      selectedPlayerDetailError = error instanceof Error ? error.message : '加载角色详情失败';
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
      setStatus(error instanceof Error ? error.message : '刷新失败', true);
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
  await loadState(true, true);
  setStatus(`${message}，已完成同步`);
}

/** login：处理login。 */
async function login(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const password = passwordInput.value.trim();
  if (!password) {
    loginErrorEl.textContent = '请输入 GM 密码';
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
    setStatus(`GM 管理令牌已签发，有效期约 ${Math.round(result.expiresInSec / 3600)} 小时`);
  } catch (error) {
    loginErrorEl.textContent = error instanceof Error ? error.message : '登录失败';
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

/** changeGmPassword：处理变更GM密码。 */
async function changeGmPassword(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const currentPassword = gmPasswordCurrentInput.value.trim();
  const newPassword = gmPasswordNextInput.value.trim();
  if (!currentPassword || !newPassword) {
    setStatus('请填写当前密码和新密码', true);
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
    setStatus('GM 密码已更新');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'GM 密码修改失败', true);
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
    attrCurves: undefined,
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
function buildSectionSnapshot(section: GmPlayerUpdateSection, draft: PlayerState): Partial<PlayerState> {
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
    setStatus('请先选择角色', true);
    return;
  }
  const uniqueSections = Array.from(new Set(sections));
  if (uniqueSections.length === 0) {
    setStatus('当前没有需要提交的快捷改动', true);
    return;
  }
  setPendingStatus(`正在提交 ${selected.name} 的快捷修改...`);
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
    setStatus('请先选择角色', true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-body-training-level');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="set-body-training-level"]');
  const rawValue = input?.value.trim() ?? '';
  const level = Number(rawValue);

  if (!rawValue || !Number.isFinite(level) || level < 0 || !Number.isInteger(level)) {
    setStatus('请输入非负整数炼体等级', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在设置 ${detail.name} 的炼体等级...`);
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/body-training/level`, {
      method: 'POST',
      body: JSON.stringify({ level } satisfies GmSetPlayerBodyTrainingLevelReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的炼体等级设置为 ${level} 层`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '设置炼体等级失败', true);
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
    setStatus('请先选择角色', true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-foundation-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-foundation"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus('请输入整数底蕴调整值', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在调整 ${detail.name} 的底蕴...`);
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/foundation/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerFoundationReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的底蕴调整 ${amount > 0 ? '+' : ''}${amount}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '调整底蕴失败', true);
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
    setStatus('请先选择角色', true);
    return;
  }

  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-combat-exp-amount');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-combat-exp"]');
  const rawValue = input?.value.trim() ?? '';
  const isInteger = /^-?\d+$/.test(rawValue);
  const amount = isInteger ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (!rawValue || !Number.isFinite(amount) || !isInteger) {
    setStatus('请输入整数战斗经验调整值', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在调整 ${detail.name} 的战斗经验...`);
    await request<BasicOkRes>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/combat-exp/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerCombatExpReq),
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的战斗经验调整 ${amount > 0 ? '+' : ''}${amount}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '调整战斗经验失败', true);
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
    setStatus('当前没有可编辑角色', true);
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
      setStatus('当前没有可补发的未学习功法书');
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.inventory.items.push(...bookItemIds.map((itemId) => createItemFromCatalog(itemId)));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['items'], `已为当前角色补发 ${bookItemIds.length} 本未学习功法书`);
    return;
  }

  if (action === 'max-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus('当前角色还没有已学习功法');
      return;
    }
    const upgradableCount = techniques.filter((technique) => technique.level < getTechniqueTemplateMaxLevel(technique) || technique.expToNext !== 0).length;
    if (upgradableCount === 0) {
      setStatus('当前全部功法已经处于满级状态');
      return;
    }
    const changed = mutateDraft((draft) => {
      draft.techniques = ensureArray(draft.techniques).map((technique) => buildMaxLevelTechniqueState(technique));
    });
    if (!changed) {
      return;
    }
    await saveSelectedPlayerSections(['techniques'], `已将当前 ${techniques.length} 门功法提升至满级`);
    return;
  }

  if (action === 'remove-all-techniques') {
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus('当前角色没有可移除的已学功法');
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
    await saveSelectedPlayerSections(['techniques'], `已移除当前角色全部 ${techniques.length} 门功法`);
    return;
  }

  const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
  const missingTechniqueIds = editorCatalog!.techniques
    .map((technique) => technique.id)
    .filter((techId) => !learnedTechniqueIds.has(techId));
  if (missingTechniqueIds.length === 0) {
    setStatus('当前角色已经学会目录内全部功法');
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
  await saveSelectedPlayerSections(['techniques'], `已为当前角色补齐 ${missingTechniqueIds.length} 门功法`);
}

/** openSelectedPlayerMailTab：打开Selected玩家邮件Tab。 */
function openSelectedPlayerMailTab(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!selectedPlayerId) {
    setStatus('请先选择角色', true);
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
    setStatus('请先选择角色', true);
    return;
  }

  if (editorDirty && !window.confirm('刷新会丢弃当前未保存的修改。继续吗？')) {
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
    await loadState(true, true);
    setStatus(`已刷新 ${selected.name} 的角色详情`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '刷新角色详情失败', true);
  } finally {
    refreshPlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayer：保存Selected玩家。 */
async function saveSelectedPlayer(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }
  const section = getCurrentEditorSaveSection();
  if (!section) {
    setStatus(
      currentEditorTab === 'mail'
        ? '邮件标签不参与角色保存，请直接使用邮件表单发送'
        : '持久化 JSON 标签不直接保存，请先应用到可视化标签',
      true,
    );
    return;
  }
  if ((section === 'buffs' || section === 'techniques' || section === 'items' || section === 'quests') && !hasServerEditorCatalog()) {
    setStatus(`${getEditorTabLabel(section)}保存已暂停：GM 编辑目录未从服务端加载成功，避免提交过期目录数据`, true);
    return;
  }

  const synced = syncVisualEditorToDraft(getEditorTabSection(section) ?? undefined);
  if (!synced.ok || !draftSnapshot) {
    setStatus(synced.ok ? '当前没有可保存内容' : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    setPendingStatus(`正在提交 ${selected.name} 的${getEditorTabLabel(section)}修改...`);
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
    await delayRefresh(`已提交 ${selected.name} 的${getEditorTabLabel(section)}修改`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    savePlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayerPassword：保存Selected玩家密码。 */
async function saveSelectedPlayerPassword(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可修改的账号密码', true);
    return;
  }

  const passwordInput = editorContentEl.querySelector<HTMLInputElement>('#player-password-input');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-password"]');
  const newPassword = passwordInput?.value.trim() ?? '';

  if (!newPassword) {
    setStatus('请填写新密码', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在修改账号 ${detail.account.username} 的密码...`);
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
    setStatus(`已修改账号 ${detail.account.username} 的密码，服务端已按哈希保存`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '修改账号密码失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** saveSelectedPlayerAccount：保存Selected玩家账号。 */
async function saveSelectedPlayerAccount(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可修改的账号', true);
    return;
  }

  const accountInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-username');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-account"]');
  const username = accountInput?.value.trim() ?? '';

  if (!username) {
    setStatus('请填写账号', true);
    return;
  }
  if (username === detail.account.username) {
    setStatus('账号未变化');
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在修改账号 ${detail.account.username}...`);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/account`, {
      method: 'PUT',
      body: JSON.stringify({ username } satisfies GmUpdateManagedPlayerAccountReq),
    });
    await delayRefresh(`已将账号从 ${detail.account.username} 修改为 ${username}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '修改账号失败', true);
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
    setStatus('当前目标没有可封禁的账号', true);
    return;
  }
  const reasonInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="ban-player-account"]');
  const reason = reasonInput?.value.trim() ?? '';
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在封禁账号 ${detail.account.username}...`);
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason } satisfies GmBanManagedPlayerReq),
    });
    await delayRefresh(`已封禁账号 ${detail.account.username}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '封禁账号失败', true);
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
    setStatus('当前目标没有可解封的账号', true);
    return;
  }
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="unban-player-account"]');
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在解封账号 ${detail.account.username}...`);
    await request<{
      ok: true;
    }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(detail.id)}/unban`, {
      method: 'POST',
    });
    await delayRefresh(`已解封账号 ${detail.account.username}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '解封账号失败', true);
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
    setStatus('请先选择角色', true);
    return;
  }

  resetPlayerBtn.disabled = true;
  try {
    setPendingStatus(`正在让 ${selected.name} 返回出生点...`);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(`已让 ${selected.name} 返回出生点`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置失败', true);
  } finally {
    resetPlayerBtn.disabled = false;
  }
}

/** resetSelectedPlayerHeavenGate：重置Selected玩家Heaven关卡。 */
async function resetSelectedPlayerHeavenGate(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  resetHeavenGateBtn.disabled = true;
  try {
    setPendingStatus(`正在重置 ${selected.name} 的天门测试状态...`);
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/players/${encodeURIComponent(selected.id)}/heaven-gate/reset`, {
      method: 'POST',
    });
    /** editorDirty：编辑器Dirty。 */
    editorDirty = false;
    await delayRefresh(`已重置 ${selected.name} 的天门测试状态`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置天门失败', true);
  } finally {
    resetHeavenGateBtn.disabled = false;
  }
}

/** removeSelectedBot：处理remove Selected Bot。 */
async function removeSelectedBot(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected || !selected.meta.isBot) {
    setStatus('当前选中目标不是机器人', true);
    return;
  }

  removeBotBtn.disabled = true;
  try {
    setPendingStatus(`正在移除机器人 ${selected.name}...`);
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
    await delayRefresh(`已移除机器人 ${selected.name}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  } finally {
    removeBotBtn.disabled = false;
  }
}

/** spawnBots：处理生成Bots。 */
async function spawnBots(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择一个角色作为生成锚点', true);
    return;
  }

  const count = Number(spawnCountInput.value);
  if (!Number.isFinite(count) || count <= 0) {
    setStatus('机器人数量必须为正整数', true);
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
    await delayRefresh(`已提交在 ${selected.name} 附近生成 ${Math.floor(count)} 个机器人`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '生成机器人失败', true);
  }
}

/** removeAllBots：处理remove All Bots。 */
async function removeAllBots(): Promise<void> {
  try {
    setPendingStatus('正在移除全部机器人...');
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
    await delayRefresh('已提交移除全部机器人');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  }
}

/** returnAllPlayersToDefaultSpawn：处理return All Players To默认生成。 */
async function returnAllPlayersToDefaultSpawn(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm('这会把所有非机器人角色统一送回新手村出生点。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
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
    await delayRefresh(
      `已提交全部角色回新手村出生点，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '执行快捷指令失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** cleanupAllPlayersInvalidItems：处理cleanup All Players Invalid物品。 */
async function cleanupAllPlayersInvalidItems(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm('这会手动清理所有非机器人角色背包、坊市托管仓和装备栏里的无效物品。在线角色将在下一息处理并落盘，离线角色会直接改存档。确认继续吗？')) {
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
    await delayRefresh(
      `已提交无效物品清理，共 ${result.totalPlayers} 个角色，运行态 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，移除背包堆叠 ${Math.floor(result.totalInvalidInventoryStacksRemoved ?? 0)} 个、托管仓堆叠 ${Math.floor(result.totalInvalidMarketStorageStacksRemoved ?? 0)} 个、装备栏 ${Math.floor(result.totalInvalidEquipmentRemoved ?? 0)} 件`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '执行无效物品清理失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersCombatExp：处理compensate All Players战斗Exp。 */
async function compensateAllPlayersCombatExp(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm('这会给所有非机器人角色补偿战斗经验。每个角色获得的数值 = 当前境界升级所需经验 + 当前炼体境界升级所需经验。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
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
    await delayRefresh(
      `已提交战斗经验补偿，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，累计补偿 ${Math.floor(result.totalCombatExpGranted ?? 0)} 点战斗经验`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '执行补偿失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersFoundation：处理compensate All Players Foundation。 */
async function compensateAllPlayersFoundation(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!window.confirm('这会给所有非机器人角色补偿底蕴。每个角色获得的数值 = 当前境界升级所需经验的五倍。在线角色下一息生效，离线和离线挂机角色会直接改存档。确认继续吗？')) {
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
    await delayRefresh(
      `已提交底蕴补偿，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，累计补偿 ${Math.floor(result.totalFoundationGranted ?? 0)} 点底蕴`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '执行补偿失败', true);
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
    currentNetworkInPage = 1;
    currentNetworkOutPage = 1;
    await request<{    
    /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/perf/network/reset`, {
      method: 'POST',
    });
    await loadState(true);
    setStatus('流量统计已重置');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置流量统计失败', true);
  } finally {
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
    setStatus('CPU 统计已重置');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置 CPU 统计失败', true);
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
    setStatus('寻路统计已重置');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置寻路统计失败', true);
  } finally {
    resetPathfindingStatsBtn.disabled = false;
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
        setStatus('服务端编辑目录不可用，当前不能用模板方式新增 Buff。', true);
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
        setStatus('服务端编辑目录不可用，当前不能用模板方式加入物品。', true);
        return;
      }
      const itemId = readCatalogSelectValue('inventory-item');
      if (!itemId) {
        setStatus('请先选择一个物品模板', true);
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
          setStatus('服务端编辑目录不可用，当前不能用模板方式创建装备。', true);
          return;
        }
        const itemId = readCatalogSelectValue('equipment', slot);
        if (!itemId) {
          setStatus('请先选择一个装备模板', true);
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
        setStatus('服务端编辑目录不可用，当前不能用模板方式加入功法。', true);
        return;
      }
      const techId = readCatalogSelectValue('technique');
      if (!techId) {
        setStatus('请先选择一个功法模板', true);
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
  if (editorDirty && !window.confirm('当前角色有未保存修改，切换后会丢失这些修改。继续吗？')) {
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
  render();
  loadSelectedPlayerDetail(playerId, true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色详情失败', true);
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
      setStatus(error instanceof Error ? error.message : '发送角色邮件失败', true);
    });
    return;
  }
  if (action === 'save-player-account') {
    saveSelectedPlayerAccount().catch(() => {});
    return;
  }
  if (action === 'save-player-password') {
    saveSelectedPlayerPassword().catch(() => {});
    return;
  }
  if (action === 'ban-player-account') {
    banSelectedPlayerAccount().catch(() => {});
    return;
  }
  if (action === 'unban-player-account') {
    unbanSelectedPlayerAccount().catch(() => {});
    return;
  }
  if (action === 'set-body-training-level') {
    setSelectedPlayerBodyTrainingLevel().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '设置炼体等级失败', true);
    });
    return;
  }
  if (action === 'add-foundation') {
    addSelectedPlayerFoundation().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '调整底蕴失败', true);
    });
    return;
  }
  if (action === 'add-combat-exp') {
    addSelectedPlayerCombatExp().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '调整战斗经验失败', true);
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
      setStatus(error instanceof Error ? error.message : '执行快捷操作失败', true);
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
    completeSuggestion(suggestionId).catch(() => {});
    return;
  }
  if (action === 'reply-suggestion') {
    const replyInput = card?.querySelector<HTMLTextAreaElement>('[data-role="reply-input"]');
    const content = replyInput?.value.trim() ?? '';
    if (!content) {
      setStatus('请输入开发者回复内容', true);
      return;
    }
    replySuggestion(suggestionId, content).catch(() => {});
    return;
  }
  if (action === 'remove-suggestion') {
    removeSuggestion(suggestionId).catch(() => {});
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
    loadSuggestions().catch(() => {});
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
  loadSuggestions().catch(() => {});
});

suggestionPrevPageBtn.addEventListener('click', () => {
  if (currentSuggestionPage <= 1) {
    return;
  }
  currentSuggestionPage -= 1;
  loadSuggestions().catch(() => {});
});

suggestionNextPageBtn.addEventListener('click', () => {
  if (currentSuggestionPage >= currentSuggestionTotalPages) {
    return;
  }
  currentSuggestionPage += 1;
  loadSuggestions().catch(() => {});
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
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
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
  loadState(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerAccountStatusFilterSelect.addEventListener('change', () => {
  currentPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadState(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerPrevPageBtn.addEventListener('click', () => {
  if (currentPlayerPage <= 1) {
    return;
  }
  currentPlayerPage -= 1;
  loadState(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerNextPageBtn.addEventListener('click', () => {
  if (currentPlayerPage >= currentPlayerTotalPages) {
    return;
  }
  currentPlayerPage += 1;
  loadState(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
redeemTabBtn.addEventListener('click', () => switchTab('redeem'));
playerTabBtn.addEventListener('click', () => switchTab('players'));
suggestionTabBtn.addEventListener('click', () => switchTab('suggestions'));
serverTabBtn.addEventListener('click', () => switchTab('server'));
worldTabBtn.addEventListener('click', () => switchTab('world'));
shortcutTabBtn.addEventListener('click', () => switchTab('shortcuts'));
serverSubtabOverviewBtn.addEventListener('click', () => switchServerTab('overview'));
serverSubtabTrafficBtn.addEventListener('click', () => switchServerTab('traffic'));
serverSubtabCpuBtn.addEventListener('click', () => switchServerTab('cpu'));
serverSubtabMemoryBtn.addEventListener('click', () => switchServerTab('memory'));
serverSubtabDatabaseBtn.addEventListener('click', () => switchServerTab('database'));
serverSubtabLogsBtn.addEventListener('click', () => switchServerTab('logs'));
cpuBreakdownSortTotalBtn.addEventListener('click', () => setCpuBreakdownSort('total'));
cpuBreakdownSortCountBtn.addEventListener('click', () => setCpuBreakdownSort('count'));
cpuBreakdownSortAvgBtn.addEventListener('click', () => setCpuBreakdownSort('avg'));
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login().catch(() => {});
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
  loadState(false, true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '刷新失败', true);
  });
});
document.getElementById('logout')?.addEventListener('click', () => logout());
document.getElementById('spawn-bots')?.addEventListener('click', () => {
  spawnBots().catch(() => {});
});
document.getElementById('remove-all-bots')?.addEventListener('click', () => {
  removeAllBots().catch(() => {});
});
document.getElementById('shortcut-return-all-to-default-spawn')?.addEventListener('click', () => {
  returnAllPlayersToDefaultSpawn().catch(() => {});
});
document.getElementById('shortcut-cleanup-invalid-items')?.addEventListener('click', () => {
  cleanupAllPlayersInvalidItems().catch(() => {});
});
document.getElementById('shortcut-compensate-combat-exp-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersCombatExp().catch(() => {});
});
document.getElementById('shortcut-compensate-foundation-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersFoundation().catch(() => {});
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
      setStatus(error instanceof Error ? error.message : '发送快捷邮件失败', true);
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
      setStatus(error instanceof Error ? error.message : '加载兑换码分组失败', true);
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
      setStatus(error instanceof Error ? error.message : '刷新兑换码分组失败', true);
    });
    return;
  }
  if (action === 'create-redeem-group') {
    createRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '创建兑换码分组失败', true);
    });
    return;
  }
  if (action === 'save-redeem-group') {
    saveRedeemGroup().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '保存兑换码分组失败', true);
    });
    return;
  }
  if (action === 'append-redeem-codes') {
    appendRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '追加兑换码失败', true);
    });
    return;
  }
  if (action === 'copy-active-redeem-codes') {
    copyActiveRedeemCodes().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '复制未使用兑换码失败', true);
    });
    return;
  }
  if (action === 'destroy-redeem-code') {
    const codeId = trigger.dataset.codeId;
    if (!codeId) {
      return;
    }
    destroyRedeemCode(codeId).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '销毁兑换码失败', true);
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
  resetNetworkStats().catch(() => {});
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
    setStatus('这个流量项的大包样本已经过期，请等待下一次刷新', true);
    return;
  }
  openNetworkPayloadModal(bucket);
});
resetCpuStatsBtn.addEventListener('click', () => {
  resetCpuStats().catch(() => {});
});
resetPathfindingStatsBtn.addEventListener('click', () => {
  resetPathfindingStats().catch(() => {});
});
serverLogsLoadOlderBtn.addEventListener('click', () => {
  loadServerLogs(true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载更早服务端日志失败', true);
  });
});
serverLogsRefreshBtn.addEventListener('click', () => {
  loadServerLogs(false).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '刷新服务端日志失败', true);
  });
});
serverPanelDatabaseEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const refreshButton = target?.closest<HTMLButtonElement>('#database-refresh');
  if (refreshButton) {
    loadDatabaseState(false).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '刷新数据库状态失败', true);
    });
    return;
  }

  const exportButton = target?.closest<HTMLButtonElement>('#database-export-current');
  if (exportButton) {
    exportCurrentDatabase().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '导出数据库失败', true);
    });
    return;
  }

  const uploadButton = target?.closest<HTMLButtonElement>('#database-upload-backup');
  if (uploadButton) {
    uploadDatabaseBackupFile(false).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : '上传数据库备份失败';
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : '上传数据库备份失败', true);
    });
    return;
  }

  const uploadAndRestoreButton = target?.closest<HTMLButtonElement>('#database-upload-and-restore');
  if (uploadAndRestoreButton) {
    uploadDatabaseBackupFile(true).catch((error: unknown) => {
      databaseImportBusy = false;
      databaseImportStatus = error instanceof Error ? error.message : '上传并导入数据库失败';
      renderDatabasePanel();
      setStatus(error instanceof Error ? error.message : '上传并导入数据库失败', true);
    });
    return;
  }

  const downloadButton = target?.closest<HTMLButtonElement>('[data-db-download]');
  if (downloadButton?.dataset.dbDownload) {
    downloadDatabaseBackup(downloadButton.dataset.dbDownload).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '下载数据库备份失败', true);
    });
    return;
  }

  const restoreButton = target?.closest<HTMLButtonElement>('[data-db-restore]');
  if (restoreButton?.dataset.dbRestore) {
    restoreDatabaseBackup(restoreButton.dataset.dbRestore).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '导入数据库失败', true);
    });
  }
});
serverPanelDatabaseEl.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== 'database-import-file') {
    return;
  }
  updateDatabaseImportFileSelection(target.files?.[0] ?? null);
});
gmPasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  changeGmPassword().catch(() => {});
});
savePlayerBtn.addEventListener('click', () => {
  saveSelectedPlayer().catch(() => {});
});
refreshPlayerBtn.addEventListener('click', () => {
  refreshSelectedPlayer().catch(() => {});
});
openPlayerMailBtn.addEventListener('click', () => {
  openSelectedPlayerMailTab();
});
resetPlayerBtn.addEventListener('click', () => {
  resetSelectedPlayer().catch(() => {});
});
resetHeavenGateBtn.addEventListener('click', () => {
  resetSelectedPlayerHeavenGate().catch(() => {});
});
removeBotBtn.addEventListener('click', () => {
  removeSelectedBot().catch(() => {});
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
    .catch(() => logout('GM 登录已失效，请重新输入密码'));
} else {
  showLogin();
}
