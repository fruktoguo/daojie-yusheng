/**
 * GM 管理后台前端 —— 登录鉴权、角色列表/编辑器、机器人管理、建议反馈
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
  type GmAddPlayerCombatExpReq,
  type GmAddPlayerFoundationReq,
  type GmBanManagedPlayerReq,
  type GmCreateRedeemCodeGroupReq,
  type GmCreateRedeemCodeGroupRes,
  type GmDatabaseBackupRecord,
  type GmDatabaseStateRes,
  type GmCreateMailReq,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmReplySuggestionReq,
  type GmSetPlayerBodyTrainingLevelReq,
  type GmSuggestionListRes,
  type GmCpuSectionSnapshot,
  type GmEditorBuffOption,
  type GmEditorCatalogRes,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  type GmPlayerUpdateSection,
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  type AutoBattleSkillConfig,
  type EquipmentSlots,
  type EquipSlot,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  type GmNetworkBucket,
  type GmManagedPlayerSummary,
  type GmPlayerDetailRes,
  type GmLoginReq,
  type GmLoginRes,
  type GmManagedPlayerRecord,
  type GmManagedPlayerBehavior,
  type GmPlayerAccountStatusFilter,
  type GmPlayerBehaviorFilter,
  type GmPlayerPresenceFilter,
  type GmPlayerSortMode,
  type GmRemoveBotsReq,
  type GmRestoreDatabaseReq,
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
import { startClientVersionReload } from './version-reload';

/** loginOverlay：定义该变量以承载业务值。 */
const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
/** gmShell：定义该变量以承载业务值。 */
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
/** loginForm：定义该变量以承载业务值。 */
const loginForm = document.getElementById('gm-login-form') as HTMLFormElement;
/** passwordInput：定义该变量以承载业务值。 */
const passwordInput = document.getElementById('gm-password') as HTMLInputElement;
/** loginSubmitBtn：定义该变量以承载业务值。 */
const loginSubmitBtn = document.getElementById('login-submit') as HTMLButtonElement;
/** loginErrorEl：定义该变量以承载业务值。 */
const loginErrorEl = document.getElementById('login-error') as HTMLDivElement;
/** statusBarEl：定义该变量以承载业务值。 */
const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
/** statusToastEl：定义该变量以承载业务值。 */
const statusToastEl = document.getElementById('status-toast') as HTMLDivElement;
/** playerSearchInput：定义该变量以承载业务值。 */
const playerSearchInput = document.getElementById('player-search') as HTMLInputElement;
/** playerSortSelect：定义该变量以承载业务值。 */
const playerSortSelect = document.getElementById('player-sort') as HTMLSelectElement;
/** playerPresenceFilterSelect：定义该变量以承载业务值。 */
const playerPresenceFilterSelect = document.getElementById('player-presence-filter') as HTMLSelectElement;
/** playerBehaviorFilterSelect：定义该变量以承载业务值。 */
const playerBehaviorFilterSelect = document.getElementById('player-behavior-filter') as HTMLSelectElement;
const playerAccountStatusFilterSelect = document.getElementById('player-account-status-filter') as HTMLSelectElement;
/** playerListEl：定义该变量以承载业务值。 */
const playerListEl = document.getElementById('player-list') as HTMLDivElement;
/** playerPrevPageBtn：定义该变量以承载业务值。 */
const playerPrevPageBtn = document.getElementById('player-page-prev') as HTMLButtonElement;
/** playerNextPageBtn：定义该变量以承载业务值。 */
const playerNextPageBtn = document.getElementById('player-page-next') as HTMLButtonElement;
/** playerPageMetaEl：定义该变量以承载业务值。 */
const playerPageMetaEl = document.getElementById('player-page-meta') as HTMLDivElement;
/** spawnCountInput：定义该变量以承载业务值。 */
const spawnCountInput = document.getElementById('spawn-count') as HTMLInputElement;
/** editorEmptyEl：定义该变量以承载业务值。 */
const editorEmptyEl = document.getElementById('editor-empty') as HTMLDivElement;
/** editorPanelEl：定义该变量以承载业务值。 */
const editorPanelEl = document.getElementById('editor-panel') as HTMLDivElement;
/** editorTitleEl：定义该变量以承载业务值。 */
const editorTitleEl = document.getElementById('editor-title') as HTMLDivElement;
/** editorSubtitleEl：定义该变量以承载业务值。 */
const editorSubtitleEl = document.getElementById('editor-subtitle') as HTMLDivElement;
/** editorMetaEl：定义该变量以承载业务值。 */
const editorMetaEl = document.getElementById('editor-meta') as HTMLDivElement;
/** editorContentEl：定义该变量以承载业务值。 */
const editorContentEl = document.getElementById('editor-content') as HTMLDivElement;
/** editorVisualPanelEl：定义该变量以承载业务值。 */
const editorVisualPanelEl = document.getElementById('editor-visual-panel') as HTMLDivElement;
/** editorPersistedPanelEl：定义该变量以承载业务值。 */
const editorPersistedPanelEl = document.getElementById('editor-persisted-panel') as HTMLDivElement;
/** editorTabBasicBtn：定义该变量以承载业务值。 */
const editorTabBasicBtn = document.getElementById('editor-tab-basic') as HTMLButtonElement;
/** editorTabPositionBtn：定义该变量以承载业务值。 */
const editorTabPositionBtn = document.getElementById('editor-tab-position') as HTMLButtonElement;
/** editorTabRealmBtn：定义该变量以承载业务值。 */
const editorTabRealmBtn = document.getElementById('editor-tab-realm') as HTMLButtonElement;
/** editorTabBuffsBtn：定义该变量以承载业务值。 */
const editorTabBuffsBtn = document.getElementById('editor-tab-buffs') as HTMLButtonElement;
/** editorTabTechniquesBtn：定义该变量以承载业务值。 */
const editorTabTechniquesBtn = document.getElementById('editor-tab-techniques') as HTMLButtonElement;
/** editorTabShortcutsBtn：定义该变量以承载业务值。 */
const editorTabShortcutsBtn = document.getElementById('editor-tab-shortcuts') as HTMLButtonElement;
/** editorTabItemsBtn：定义该变量以承载业务值。 */
const editorTabItemsBtn = document.getElementById('editor-tab-items') as HTMLButtonElement;
/** editorTabQuestsBtn：定义该变量以承载业务值。 */
const editorTabQuestsBtn = document.getElementById('editor-tab-quests') as HTMLButtonElement;
/** editorTabMailBtn：定义该变量以承载业务值。 */
const editorTabMailBtn = document.getElementById('editor-tab-mail') as HTMLButtonElement;
/** editorTabPersistedBtn：定义该变量以承载业务值。 */
const editorTabPersistedBtn = document.getElementById('editor-tab-persisted') as HTMLButtonElement;
/** playerJsonEl：定义该变量以承载业务值。 */
const playerJsonEl = document.getElementById('player-json') as HTMLTextAreaElement;
/** playerPersistedJsonEl：定义该变量以承载业务值。 */
const playerPersistedJsonEl = document.getElementById('player-persisted-json') as HTMLTextAreaElement;
/** applyRawJsonBtn：定义该变量以承载业务值。 */
const applyRawJsonBtn = document.getElementById('apply-raw-json') as HTMLButtonElement;
/** savePlayerBtn：定义该变量以承载业务值。 */
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
/** refreshPlayerBtn：定义该变量以承载业务值。 */
const refreshPlayerBtn = document.getElementById('refresh-player') as HTMLButtonElement;
/** openPlayerMailBtn：定义该变量以承载业务值。 */
const openPlayerMailBtn = document.getElementById('open-player-mail') as HTMLButtonElement;
/** resetPlayerBtn：定义该变量以承载业务值。 */
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
/** resetHeavenGateBtn：定义该变量以承载业务值。 */
const resetHeavenGateBtn = document.getElementById('reset-heaven-gate') as HTMLButtonElement;
/** removeBotBtn：定义该变量以承载业务值。 */
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;

/** summaryTotalEl：定义该变量以承载业务值。 */
const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
/** summaryOnlineEl：定义该变量以承载业务值。 */
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
/** summaryOfflineHangingEl：定义该变量以承载业务值。 */
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
/** summaryOfflineEl：定义该变量以承载业务值。 */
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
/** summaryBotsEl：定义该变量以承载业务值。 */
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
/** summaryTickEl：定义该变量以承载业务值。 */
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
/** summaryTickWindowEl：定义该变量以承载业务值。 */
const summaryTickWindowEl = document.getElementById('summary-tick-window') as HTMLDivElement;
/** summaryCpuEl：定义该变量以承载业务值。 */
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
/** summaryMemoryEl：定义该变量以承载业务值。 */
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;
/** summaryNetInEl：定义该变量以承载业务值。 */
const summaryNetInEl = document.getElementById('summary-net-in') as HTMLDivElement;
/** summaryNetOutEl：定义该变量以承载业务值。 */
const summaryNetOutEl = document.getElementById('summary-net-out') as HTMLDivElement;
/** summaryPathQueueEl：定义该变量以承载业务值。 */
const summaryPathQueueEl = document.getElementById('summary-path-queue') as HTMLDivElement;
/** summaryPathWorkersEl：定义该变量以承载业务值。 */
const summaryPathWorkersEl = document.getElementById('summary-path-workers') as HTMLDivElement;
/** summaryPathCancelledEl：定义该变量以承载业务值。 */
const summaryPathCancelledEl = document.getElementById('summary-path-cancelled') as HTMLDivElement;
/** summaryNetInBreakdownEl：定义该变量以承载业务值。 */
const summaryNetInBreakdownEl = document.getElementById('summary-net-in-breakdown') as HTMLDivElement;
/** summaryNetOutBreakdownEl：定义该变量以承载业务值。 */
const summaryNetOutBreakdownEl = document.getElementById('summary-net-out-breakdown') as HTMLDivElement;
/** serverSubtabOverviewBtn：定义该变量以承载业务值。 */
const serverSubtabOverviewBtn = document.getElementById('server-subtab-overview') as HTMLButtonElement;
/** serverSubtabTrafficBtn：定义该变量以承载业务值。 */
const serverSubtabTrafficBtn = document.getElementById('server-subtab-traffic') as HTMLButtonElement;
/** serverSubtabCpuBtn：定义该变量以承载业务值。 */
const serverSubtabCpuBtn = document.getElementById('server-subtab-cpu') as HTMLButtonElement;
/** serverSubtabDatabaseBtn：定义该变量以承载业务值。 */
const serverSubtabDatabaseBtn = document.getElementById('server-subtab-database') as HTMLButtonElement;
/** serverPanelOverviewEl：定义该变量以承载业务值。 */
const serverPanelOverviewEl = document.getElementById('server-panel-overview') as HTMLElement;
/** serverPanelTrafficEl：定义该变量以承载业务值。 */
const serverPanelTrafficEl = document.getElementById('server-panel-traffic') as HTMLElement;
/** serverPanelCpuEl：定义该变量以承载业务值。 */
const serverPanelCpuEl = document.getElementById('server-panel-cpu') as HTMLElement;
/** serverPanelDatabaseEl：定义该变量以承载业务值。 */
const serverPanelDatabaseEl = document.getElementById('server-panel-database') as HTMLElement;
/** trafficResetMetaEl：定义该变量以承载业务值。 */
const trafficResetMetaEl = document.getElementById('traffic-reset-meta') as HTMLDivElement;
/** trafficTotalInEl：定义该变量以承载业务值。 */
const trafficTotalInEl = document.getElementById('traffic-total-in') as HTMLDivElement;
/** trafficTotalInNoteEl：定义该变量以承载业务值。 */
const trafficTotalInNoteEl = document.getElementById('traffic-total-in-note') as HTMLDivElement;
/** trafficTotalOutEl：定义该变量以承载业务值。 */
const trafficTotalOutEl = document.getElementById('traffic-total-out') as HTMLDivElement;
/** trafficTotalOutNoteEl：定义该变量以承载业务值。 */
const trafficTotalOutNoteEl = document.getElementById('traffic-total-out-note') as HTMLDivElement;
/** resetNetworkStatsBtn：定义该变量以承载业务值。 */
const resetNetworkStatsBtn = document.getElementById('reset-network-stats') as HTMLButtonElement;
/** resetCpuStatsBtn：定义该变量以承载业务值。 */
const resetCpuStatsBtn = document.getElementById('reset-cpu-stats') as HTMLButtonElement;
/** resetPathfindingStatsBtn：定义该变量以承载业务值。 */
const resetPathfindingStatsBtn = document.getElementById('reset-pathfinding-stats') as HTMLButtonElement;
/** cpuCurrentPercentEl：定义该变量以承载业务值。 */
const cpuCurrentPercentEl = document.getElementById('cpu-current-percent') as HTMLDivElement;
/** cpuTickWindowPercentEl：定义该变量以承载业务值。 */
const cpuTickWindowPercentEl = document.getElementById('cpu-tick-window-percent') as HTMLDivElement;
/** cpuTickWindowNoteEl：定义该变量以承载业务值。 */
const cpuTickWindowNoteEl = document.getElementById('cpu-tick-window-note') as HTMLDivElement;
/** cpuProfileMetaEl：定义该变量以承载业务值。 */
const cpuProfileMetaEl = document.getElementById('cpu-profile-meta') as HTMLDivElement;
/** cpuCoreCountEl：定义该变量以承载业务值。 */
const cpuCoreCountEl = document.getElementById('cpu-core-count') as HTMLDivElement;
/** cpuUserMsEl：定义该变量以承载业务值。 */
const cpuUserMsEl = document.getElementById('cpu-user-ms') as HTMLDivElement;
/** cpuSystemMsEl：定义该变量以承载业务值。 */
const cpuSystemMsEl = document.getElementById('cpu-system-ms') as HTMLDivElement;
/** cpuLoad1mEl：定义该变量以承载业务值。 */
const cpuLoad1mEl = document.getElementById('cpu-load-1m') as HTMLDivElement;
/** cpuLoad5mEl：定义该变量以承载业务值。 */
const cpuLoad5mEl = document.getElementById('cpu-load-5m') as HTMLDivElement;
/** cpuLoad15mEl：定义该变量以承载业务值。 */
const cpuLoad15mEl = document.getElementById('cpu-load-15m') as HTMLDivElement;
/** cpuProcessUptimeEl：定义该变量以承载业务值。 */
const cpuProcessUptimeEl = document.getElementById('cpu-process-uptime') as HTMLDivElement;
/** cpuSystemUptimeEl：定义该变量以承载业务值。 */
const cpuSystemUptimeEl = document.getElementById('cpu-system-uptime') as HTMLDivElement;
/** cpuRssMemoryEl：定义该变量以承载业务值。 */
const cpuRssMemoryEl = document.getElementById('cpu-rss-memory') as HTMLDivElement;
/** cpuHeapUsedEl：定义该变量以承载业务值。 */
const cpuHeapUsedEl = document.getElementById('cpu-heap-used') as HTMLDivElement;
/** cpuHeapTotalEl：定义该变量以承载业务值。 */
const cpuHeapTotalEl = document.getElementById('cpu-heap-total') as HTMLDivElement;
/** cpuExternalMemoryEl：定义该变量以承载业务值。 */
const cpuExternalMemoryEl = document.getElementById('cpu-external-memory') as HTMLDivElement;
/** pathfindingResetMetaEl：定义该变量以承载业务值。 */
const pathfindingResetMetaEl = document.getElementById('pathfinding-reset-meta') as HTMLDivElement;
/** pathfindingAvgQueueMsEl：定义该变量以承载业务值。 */
const pathfindingAvgQueueMsEl = document.getElementById('pathfinding-avg-queue-ms') as HTMLDivElement;
/** pathfindingQueueNoteEl：定义该变量以承载业务值。 */
const pathfindingQueueNoteEl = document.getElementById('pathfinding-queue-note') as HTMLDivElement;
/** pathfindingAvgRunMsEl：定义该变量以承载业务值。 */
const pathfindingAvgRunMsEl = document.getElementById('pathfinding-avg-run-ms') as HTMLDivElement;
/** pathfindingRunNoteEl：定义该变量以承载业务值。 */
const pathfindingRunNoteEl = document.getElementById('pathfinding-run-note') as HTMLDivElement;
/** pathfindingAvgExpandedNodesEl：定义该变量以承载业务值。 */
const pathfindingAvgExpandedNodesEl = document.getElementById('pathfinding-avg-expanded-nodes') as HTMLDivElement;
/** pathfindingExpandedNoteEl：定义该变量以承载业务值。 */
const pathfindingExpandedNoteEl = document.getElementById('pathfinding-expanded-note') as HTMLDivElement;
/** pathfindingDropTotalEl：定义该变量以承载业务值。 */
const pathfindingDropTotalEl = document.getElementById('pathfinding-drop-total') as HTMLDivElement;
/** pathfindingDropNoteEl：定义该变量以承载业务值。 */
const pathfindingDropNoteEl = document.getElementById('pathfinding-drop-note') as HTMLDivElement;
/** pathfindingFailureListEl：定义该变量以承载业务值。 */
const pathfindingFailureListEl = document.getElementById('pathfinding-failure-list') as HTMLDivElement;
/** cpuBreakdownListEl：定义该变量以承载业务值。 */
const cpuBreakdownListEl = document.getElementById('cpu-breakdown-list') as HTMLDivElement;
/** cpuBreakdownSortTotalBtn：定义该变量以承载业务值。 */
const cpuBreakdownSortTotalBtn = document.getElementById('cpu-breakdown-sort-total') as HTMLButtonElement;
/** cpuBreakdownSortCountBtn：定义该变量以承载业务值。 */
const cpuBreakdownSortCountBtn = document.getElementById('cpu-breakdown-sort-count') as HTMLButtonElement;
/** cpuBreakdownSortAvgBtn：定义该变量以承载业务值。 */
const cpuBreakdownSortAvgBtn = document.getElementById('cpu-breakdown-sort-avg') as HTMLButtonElement;
/** gmPasswordForm：定义该变量以承载业务值。 */
const gmPasswordForm = document.getElementById('gm-password-form') as HTMLFormElement;
/** gmPasswordCurrentInput：定义该变量以承载业务值。 */
const gmPasswordCurrentInput = document.getElementById('gm-password-current') as HTMLInputElement;
/** gmPasswordNextInput：定义该变量以承载业务值。 */
const gmPasswordNextInput = document.getElementById('gm-password-next') as HTMLInputElement;
/** gmPasswordSaveBtn：定义该变量以承载业务值。 */
const gmPasswordSaveBtn = document.getElementById('gm-password-save') as HTMLButtonElement;
/** playerWorkspaceEl：定义该变量以承载业务值。 */
const playerWorkspaceEl = document.getElementById('player-workspace') as HTMLElement;
/** redeemWorkspaceEl：定义该变量以承载业务值。 */
const redeemWorkspaceEl = document.getElementById('redeem-workspace') as HTMLElement;
/** suggestionWorkspaceEl：定义该变量以承载业务值。 */
const suggestionWorkspaceEl = document.getElementById('suggestion-workspace') as HTMLElement;
/** serverWorkspaceEl：定义该变量以承载业务值。 */
const serverWorkspaceEl = document.getElementById('server-workspace') as HTMLElement;
/** worldWorkspaceEl：定义该变量以承载业务值。 */
const worldWorkspaceEl = document.getElementById('world-workspace') as HTMLElement;
/** shortcutWorkspaceEl：定义该变量以承载业务值。 */
const shortcutWorkspaceEl = document.getElementById('shortcut-workspace') as HTMLElement;
/** shortcutMailComposerEl：定义该变量以承载业务值。 */
const shortcutMailComposerEl = document.getElementById('shortcut-mail-composer') as HTMLDivElement | null;
/** serverTabBtn：定义该变量以承载业务值。 */
const serverTabBtn = document.getElementById('gm-tab-server') as HTMLButtonElement;
/** redeemTabBtn：定义该变量以承载业务值。 */
const redeemTabBtn = document.getElementById('gm-tab-redeem') as HTMLButtonElement;
/** playerTabBtn：定义该变量以承载业务值。 */
const playerTabBtn = document.getElementById('gm-tab-players') as HTMLButtonElement;
/** suggestionTabBtn：定义该变量以承载业务值。 */
const suggestionTabBtn = document.getElementById('gm-tab-suggestions') as HTMLButtonElement;
/** worldTabBtn：定义该变量以承载业务值。 */
const worldTabBtn = document.getElementById('gm-tab-world') as HTMLButtonElement;
/** shortcutTabBtn：定义该变量以承载业务值。 */
const shortcutTabBtn = document.getElementById('gm-tab-shortcuts') as HTMLButtonElement;
/** suggestionListEl：定义该变量以承载业务值。 */
const suggestionListEl = document.getElementById('gm-suggestion-list') as HTMLElement;
/** suggestionSearchInput：定义该变量以承载业务值。 */
const suggestionSearchInput = document.getElementById('gm-suggestion-search') as HTMLInputElement;
/** suggestionSearchClearBtn：定义该变量以承载业务值。 */
const suggestionSearchClearBtn = document.getElementById('gm-suggestion-search-clear') as HTMLButtonElement;
/** suggestionPrevPageBtn：定义该变量以承载业务值。 */
const suggestionPrevPageBtn = document.getElementById('gm-suggestion-page-prev') as HTMLButtonElement;
/** suggestionNextPageBtn：定义该变量以承载业务值。 */
const suggestionNextPageBtn = document.getElementById('gm-suggestion-page-next') as HTMLButtonElement;
/** suggestionPageMetaEl：定义该变量以承载业务值。 */
const suggestionPageMetaEl = document.getElementById('gm-suggestion-page-meta') as HTMLDivElement;
/** redeemStatusEl：定义该变量以承载业务值。 */
const redeemStatusEl = document.getElementById('redeem-status') as HTMLDivElement | null;
/** redeemGroupListEl：定义该变量以承载业务值。 */
const redeemGroupListEl = document.getElementById('redeem-group-list') as HTMLDivElement | null;
/** redeemGroupEditorEl：定义该变量以承载业务值。 */
const redeemGroupEditorEl = document.getElementById('redeem-group-editor') as HTMLDivElement | null;
/** redeemCodeListEl：定义该变量以承载业务值。 */
const redeemCodeListEl = document.getElementById('redeem-code-list') as HTMLDivElement | null;

/** GmEditorTab：定义该类型的结构与数据语义。 */
type GmEditorTab = GmPlayerUpdateSection | 'shortcuts' | 'mail' | 'persisted';

/** GmMailAttachmentDraft：定义该接口的能力与字段约束。 */
interface GmMailAttachmentDraft {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** GmMailComposerDraft：定义该接口的能力与字段约束。 */
interface GmMailComposerDraft {
/** templateId：定义该变量以承载业务值。 */
  templateId: string;
/** targetPlayerId：定义该变量以承载业务值。 */
  targetPlayerId: string;
/** senderLabel：定义该变量以承载业务值。 */
  senderLabel: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** body：定义该变量以承载业务值。 */
  body: string;
/** expireHours：定义该变量以承载业务值。 */
  expireHours: string;
/** attachments：定义该变量以承载业务值。 */
  attachments: GmMailAttachmentDraft[];
}

/** RedeemGroupDraft：定义该接口的能力与字段约束。 */
interface RedeemGroupDraft {
/** name：定义该变量以承载业务值。 */
  name: string;
/** rewards：定义该变量以承载业务值。 */
  rewards: RedeemCodeGroupRewardItem[];
/** createCount：定义该变量以承载业务值。 */
  createCount: string;
/** appendCount：定义该变量以承载业务值。 */
  appendCount: string;
}

/** SearchableItemScope：定义该类型的结构与数据语义。 */
type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot';

/** MAIL_ATTACHMENT_ITEM_PAGE_SIZE：定义该变量以承载业务值。 */
const MAIL_ATTACHMENT_ITEM_PAGE_SIZE = 10;
/** SEARCHABLE_ITEM_RESULT_LIMIT：定义该变量以承载业务值。 */
const SEARCHABLE_ITEM_RESULT_LIMIT = 80;

startClientVersionReload({
  onBeforeReload: () => {
    setStatus('检测到前端新版本，正在刷新页面');
  },
});

/** token：定义该变量以承载业务值。 */
let token = sessionStorage.getItem(GM_ACCESS_TOKEN_STORAGE_KEY) ?? '';
/** state：定义该变量以承载业务值。 */
let state: GmStateRes | null = null;
/** databaseState：定义该变量以承载业务值。 */
let databaseState: GmDatabaseStateRes | null = null;
/** suggestions：定义该变量以承载业务值。 */
let suggestions: Suggestion[] = [];
/** editorCatalog：定义该变量以承载业务值。 */
let editorCatalog: GmEditorCatalogRes | null = null;
/** selectedPlayerId：定义该变量以承载业务值。 */
let selectedPlayerId: string | null = null;
/** selectedPlayerDetail：定义该变量以承载业务值。 */
let selectedPlayerDetail: GmManagedPlayerRecord | null = null;
/** loadingPlayerDetailId：定义该变量以承载业务值。 */
let loadingPlayerDetailId: string | null = null;
/** detailRequestNonce：定义该变量以承载业务值。 */
let detailRequestNonce = 0;
/** draftSnapshot：定义该变量以承载业务值。 */
let draftSnapshot: PlayerState | null = null;
/** editorDirty：定义该变量以承载业务值。 */
let editorDirty = false;
/** draftSourcePlayerId：定义该变量以承载业务值。 */
let draftSourcePlayerId: string | null = null;
/** pollTimer：定义该变量以承载业务值。 */
let pollTimer: number | null = null;
/** currentTab：定义该变量以承载业务值。 */
let currentTab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts' = 'server';
/** currentServerTab：定义该变量以承载业务值。 */
let currentServerTab: 'overview' | 'traffic' | 'cpu' | 'database' = 'overview';
/** currentCpuBreakdownSort：定义该变量以承载业务值。 */
let currentCpuBreakdownSort: 'total' | 'count' | 'avg' = 'total';
/** currentEditorTab：定义该变量以承载业务值。 */
let currentEditorTab: GmEditorTab = 'basic';
/** currentInventoryAddType：定义该变量以承载业务值。 */
let currentInventoryAddType: (typeof ITEM_TYPES)[number] = 'material';
/** currentPlayerSort：定义该变量以承载业务值。 */
let currentPlayerSort: GmPlayerSortMode = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
/** currentPlayerPresenceFilter：定义该变量以承载业务值。 */
let currentPlayerPresenceFilter: GmPlayerPresenceFilter = (playerPresenceFilterSelect.value as GmPlayerPresenceFilter) || 'all';
/** currentPlayerBehaviorFilter：定义该变量以承载业务值。 */
let currentPlayerBehaviorFilter: GmPlayerBehaviorFilter = (playerBehaviorFilterSelect.value as GmPlayerBehaviorFilter) || 'all';
let currentPlayerAccountStatusFilter: GmPlayerAccountStatusFilter = (playerAccountStatusFilterSelect.value as GmPlayerAccountStatusFilter) || 'all';
/** currentPlayerPage：定义该变量以承载业务值。 */
let currentPlayerPage = 1;
/** currentPlayerTotalPages：定义该变量以承载业务值。 */
let currentPlayerTotalPages = 1;
/** playerSearchTimer：定义该变量以承载业务值。 */
let playerSearchTimer: number | null = null;
/** statusToastTimer：定义该变量以承载业务值。 */
let statusToastTimer: number | null = null;
/** currentSuggestionPage：定义该变量以承载业务值。 */
let currentSuggestionPage = 1;
/** currentSuggestionTotalPages：定义该变量以承载业务值。 */
let currentSuggestionTotalPages = 1;
/** currentSuggestionTotal：定义该变量以承载业务值。 */
let currentSuggestionTotal = 0;
/** currentSuggestionKeyword：定义该变量以承载业务值。 */
let currentSuggestionKeyword = '';
/** suggestionSearchTimer：定义该变量以承载业务值。 */
let suggestionSearchTimer: number | null = null;
/** lastPlayerListStructureKey：定义该变量以承载业务值。 */
let lastPlayerListStructureKey: string | null = null;
/** lastEditorStructureKey：定义该变量以承载业务值。 */
let lastEditorStructureKey: string | null = null;
/** lastSuggestionStructureKey：定义该变量以承载业务值。 */
let lastSuggestionStructureKey: string | null = null;
/** lastNetworkInStructureKey：定义该变量以承载业务值。 */
let lastNetworkInStructureKey: string | null = null;
/** lastNetworkOutStructureKey：定义该变量以承载业务值。 */
let lastNetworkOutStructureKey: string | null = null;
/** lastCpuBreakdownStructureKey：定义该变量以承载业务值。 */
let lastCpuBreakdownStructureKey: string | null = null;
/** lastPathfindingFailureStructureKey：定义该变量以承载业务值。 */
let lastPathfindingFailureStructureKey: string | null = null;
/** lastShortcutMailComposerStructureKey：定义该变量以承载业务值。 */
let lastShortcutMailComposerStructureKey: string | null = null;
/** databaseStateLoading：定义该变量以承载业务值。 */
let databaseStateLoading = false;
/** redeemGroupsState：定义该变量以承载业务值。 */
let redeemGroupsState: RedeemCodeGroupView[] = [];
/** selectedRedeemGroupId：定义该变量以承载业务值。 */
let selectedRedeemGroupId: string | null = null;
/** redeemGroupDetailState：定义该变量以承载业务值。 */
let redeemGroupDetailState: GmRedeemCodeGroupDetailRes | null = null;
/** redeemDraft：定义该变量以承载业务值。 */
let redeemDraft: RedeemGroupDraft = createDefaultRedeemGroupDraft();
/** redeemLoading：定义该变量以承载业务值。 */
let redeemLoading = false;
/** redeemLatestGeneratedCodes：定义该变量以承载业务值。 */
let redeemLatestGeneratedCodes: string[] = [];
/** directMailDraftPlayerId：定义该变量以承载业务值。 */
let directMailDraftPlayerId: string | null = null;
/** directMailDraft：定义该变量以承载业务值。 */
let directMailDraft = createDefaultMailComposerDraft();
/** broadcastMailDraft：定义该变量以承载业务值。 */
let broadcastMailDraft = createDefaultMailComposerDraft();
/** shortcutMailComposerRefreshBlocked：定义该变量以承载业务值。 */
let shortcutMailComposerRefreshBlocked = false;
/** directMailAttachmentPageByIndex：定义该变量以承载业务值。 */
let directMailAttachmentPageByIndex = new Map<number, number>();
/** shortcutMailAttachmentPageByIndex：定义该变量以承载业务值。 */
let shortcutMailAttachmentPageByIndex = new Map<number, number>();
/** activeSearchableItemField：定义该变量以承载业务值。 */
let activeSearchableItemField: HTMLElement | null = null;
/** editorRenderRefreshBlocked：定义该变量以承载业务值。 */
let editorRenderRefreshBlocked = false;

/** getBrowserLocalStorage：执行对应的业务逻辑。 */
function getBrowserLocalStorage(): Storage | null {
  return gmPureHelpers.getBrowserLocalStorage();
}

/** readPersistedGmPassword：执行对应的业务逻辑。 */
function readPersistedGmPassword(): string {
  return gmPureHelpers.readPersistedGmPassword();
}

/** persistGmPassword：执行对应的业务逻辑。 */
function persistGmPassword(password: string): void {
  gmPureHelpers.persistGmPassword(password);
}

/** syncPersistedGmPasswordToInputs：执行对应的业务逻辑。 */
function syncPersistedGmPasswordToInputs(): void {
/** persistedPassword：定义该变量以承载业务值。 */
  const persistedPassword = readPersistedGmPassword();
  passwordInput.value = persistedPassword;
  gmPasswordCurrentInput.value = persistedPassword;
}

/** createDefaultMailAttachmentDraft：执行对应的业务逻辑。 */
function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return gmPureHelpers.createDefaultMailAttachmentDraft();
}

/** createDefaultRedeemGroupDraft：执行对应的业务逻辑。 */
function createDefaultRedeemGroupDraft(): RedeemGroupDraft {
  return gmPureHelpers.createDefaultRedeemGroupDraft(gmPureHelpers.createDefaultRedeemReward);
}

/** createDefaultRedeemReward：执行对应的业务逻辑。 */
function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return gmPureHelpers.createDefaultRedeemReward();
}

/** createDefaultMailComposerDraft：执行对应的业务逻辑。 */
function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return gmPureHelpers.createDefaultMailComposerDraft();
}

/** ensureDirectMailDraft：执行对应的业务逻辑。 */
function ensureDirectMailDraft(playerId: string | null): void {
  if (!playerId) {
    directMailDraftPlayerId = null;
    directMailDraft = createDefaultMailComposerDraft();
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  if (directMailDraftPlayerId === playerId) {
    return;
  }
  directMailDraftPlayerId = playerId;
  directMailDraft = createDefaultMailComposerDraft();
  directMailAttachmentPageByIndex = new Map();
}

/** clone：执行对应的业务逻辑。 */
function clone<T>(value: T): T {
  return gmPureHelpers.clone(value);
}

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return gmPureHelpers.escapeHtml(input);
}

/** formatJson：执行对应的业务逻辑。 */
function formatJson(value: unknown): string {
  return gmPureHelpers.formatJson(value);
}

/** formatBytes：执行对应的业务逻辑。 */
function formatBytes(bytes: number | undefined): string {
  return gmPureHelpers.formatBytes(bytes);
}

/** formatPercent：执行对应的业务逻辑。 */
function formatPercent(numerator: number, denominator: number): string {
  return gmPureHelpers.formatPercent(numerator, denominator);
}

/** formatBytesPerSecond：执行对应的业务逻辑。 */
function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  return gmPureHelpers.formatBytesPerSecond(bytes, elapsedSec);
}

/** formatAverageBytesPerEvent：执行对应的业务逻辑。 */
function formatAverageBytesPerEvent(bytes: number, count: number): string {
  return gmPureHelpers.formatAverageBytesPerEvent(bytes, count);
}

/** formatDurationSeconds：执行对应的业务逻辑。 */
function formatDurationSeconds(seconds: number): string {
  return gmPureHelpers.formatDurationSeconds(seconds);
}

/** formatDateTime：执行对应的业务逻辑。 */
function formatDateTime(value?: string): string {
  return gmPureHelpers.formatDateTime(value);
}

/** getPlayerPresenceMeta：执行对应的业务逻辑。 */
function getPlayerPresenceMeta(player: Pick<GmManagedPlayerSummary, 'meta'>): {
/** className：定义该变量以承载业务值。 */
  className: 'online' | 'offline';
/** label：定义该变量以承载业务值。 */
  label: '在线' | '离线挂机' | '离线';
} {
  return gmPureHelpers.getPlayerPresenceMeta(player);
}

/** getManagedAccountStatusLabel：执行对应的业务逻辑。 */
function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  return gmPureHelpers.getManagedAccountStatusLabel(player);
}

/** getFilteredPlayers：执行对应的业务逻辑。 */
function getFilteredPlayers(data: GmStateRes): GmManagedPlayerSummary[] {
  return data.players;
}

function getManagedPlayerBehaviorLabel(behavior: GmManagedPlayerBehavior): string {
  switch (behavior) {
    case 'combat':
      return '战斗';
    case 'cultivation':
      return '修炼';
    case 'alchemy':
      return '炼丹';
    case 'enhancement':
      return '强化';
    case 'gather':
      return '采集';
    default:
      return behavior;
  }
}

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

/** getPlayerIdentityLine：执行对应的业务逻辑。 */
function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerIdentityLine(player);
}

/** getPlayerStatsLine：执行对应的业务逻辑。 */
function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerStatsLine(player);
}

/** getPlayerRowMarkup：执行对应的业务逻辑。 */
function getPlayerRowMarkup(player: GmManagedPlayerSummary): string {
  return gmMarkupHelpers.getPlayerRowMarkup(player);
}

/** patchPlayerRow：执行对应的业务逻辑。 */
function patchPlayerRow(button: HTMLButtonElement, player: GmManagedPlayerSummary, isActive: boolean): void {
/** presence：定义该变量以承载业务值。 */
  const presence = getPlayerPresenceMeta(player);
  button.classList.toggle('active', isActive);
  button.querySelector<HTMLElement>('[data-role="name"]')!.textContent = player.roleName;
/** presenceEl：定义该变量以承载业务值。 */
  const presenceEl = button.querySelector<HTMLElement>('[data-role="presence"]')!;
  presenceEl.classList.toggle('online', presence.className === 'online');
  presenceEl.classList.toggle('offline', presence.className === 'offline');
  presenceEl.textContent = presence.label;
  button.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = `账号: ${player.accountName ?? '无'} · 状态: ${getManagedPlayerAccountStatusLabel(player.accountStatus)} · 显示名: ${player.displayName}`;
  button.querySelector<HTMLElement>('[data-role="identity"]')!.textContent = getPlayerIdentityLine(player);
  button.querySelector<HTMLElement>('[data-role="stats"]')!.textContent = getPlayerStatsLine(player);
}

/** getEditorSubtitle：执行对应的业务逻辑。 */
function getEditorSubtitle(detail: GmManagedPlayerRecord): string {
  return [
    `账号: ${detail.accountName ?? '无'}`,
    detail.account?.status === 'banned' ? '账号状态: 已封禁' : '账号状态: 正常',
    `行为: ${detail.behaviors.length > 0 ? detail.behaviors.map(getManagedPlayerBehaviorLabel).join(' / ') : '空闲'}`,
    `显示名: ${detail.displayName}`,
    `地图: ${detail.mapName} (${detail.x}, ${detail.y})`,
    detail.meta.updatedAt ? `最近落盘: ${new Date(detail.meta.updatedAt).toLocaleString('zh-CN')}` : '最近落盘: 运行时角色',
  ].join(' · ');
}

/** getEditorMetaMarkup：执行对应的业务逻辑。 */
function getEditorMetaMarkup(detail: GmManagedPlayerRecord): string {
/** presence：定义该变量以承载业务值。 */
  const presence = getPlayerPresenceMeta(detail);
  return gmMarkupHelpers.getEditorMetaMarkup(detail, presence, editorDirty);
}

/** getEditorBodyChipMarkup：执行对应的业务逻辑。 */
function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return gmMarkupHelpers.getEditorBodyChipMarkup(player, draft, editorDirty);
}

function getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string {
  return account.status === 'banned' ? '已封禁' : '正常';
}

/** getEquipmentCardTitle：执行对应的业务逻辑。 */
function getEquipmentCardTitle(item: ItemStack | null): string {
  return gmMarkupHelpers.getEquipmentCardTitle(item);
}

/** getEquipmentCardMeta：执行对应的业务逻辑。 */
function getEquipmentCardMeta(item: ItemStack | null): string {
  return gmMarkupHelpers.getEquipmentCardMeta(item);
}

/** getBonusCardTitle：执行对应的业务逻辑。 */
function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return gmMarkupHelpers.getBonusCardTitle(bonus, index);
}

/** getBonusCardMeta：执行对应的业务逻辑。 */
function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return gmMarkupHelpers.getBonusCardMeta(bonus);
}

/** getBuffCardTitle：执行对应的业务逻辑。 */
function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return gmMarkupHelpers.getBuffCardTitle(buff, index);
}

/** getBuffCardMeta：执行对应的业务逻辑。 */
function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  return gmMarkupHelpers.getBuffCardMeta(buff);
}

/** getInventoryCardTitle：执行对应的业务逻辑。 */
function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return gmMarkupHelpers.getInventoryCardTitle(item, index);
}

/** getInventoryCardMeta：执行对应的业务逻辑。 */
function getInventoryCardMeta(item: ItemStack | undefined): string {
  return gmMarkupHelpers.getInventoryCardMeta(item);
}

/** getAutoSkillCardTitle：执行对应的业务逻辑。 */
function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return gmMarkupHelpers.getAutoSkillCardTitle(entry, index);
}

/** getAutoSkillCardMeta：执行对应的业务逻辑。 */
function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return gmMarkupHelpers.getAutoSkillCardMeta(entry);
}

/** getTechniqueCardTitle：执行对应的业务逻辑。 */
function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return gmMarkupHelpers.getTechniqueCardTitle(technique, index);
}

/** getTechniqueCardMeta：执行对应的业务逻辑。 */
function getTechniqueCardMeta(technique: TechniqueState | undefined): string {
  if (!technique) return '';
  return gmMarkupHelpers.getTechniqueCardMeta(technique, (realmLv) => (
    editorCatalog?.realmLevels.find((entry) => entry.realmLv === realmLv)?.displayName
  ));
}

/** getQuestCardTitle：执行对应的业务逻辑。 */
function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return gmMarkupHelpers.getQuestCardTitle(quest, index);
}

/** getQuestCardMeta：执行对应的业务逻辑。 */
function getQuestCardMeta(quest: QuestState | undefined): string {
  return gmMarkupHelpers.getQuestCardMeta(quest);
}

/** getTechniqueOptionLabel：执行对应的业务逻辑。 */
function getTechniqueOptionLabel(option: GmEditorTechniqueOption): string {
  return gmCatalogHelpers.getTechniqueOptionLabel(option, editorCatalog);
}

/** getItemOptionLabel：执行对应的业务逻辑。 */
function getItemOptionLabel(option: GmEditorItemOption): string {
  return gmCatalogHelpers.getItemOptionLabel(option);
}

/** getTechniqueCatalogOptions：执行对应的业务逻辑。 */
function getTechniqueCatalogOptions(includeEmpty = false): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getTechniqueCatalogOptions(editorCatalog, includeEmpty);
}

/** getLearnedTechniqueOptions：执行对应的业务逻辑。 */
function getLearnedTechniqueOptions(techniques: TechniqueState[], includeEmpty = false): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getLearnedTechniqueOptions(techniques, includeEmpty);
}

/** getRealmCatalogOptions：执行对应的业务逻辑。 */
function getRealmCatalogOptions(): Array<{ value: number; label: string }> {
  return gmCatalogHelpers.getRealmCatalogOptions(editorCatalog);
}

/** getItemCatalogOptions：执行对应的业务逻辑。 */
function getItemCatalogOptions(filter?: (option: GmEditorItemOption) => boolean): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getItemCatalogOptions(editorCatalog, filter);
}

/** getBuffOptionLabel：执行对应的业务逻辑。 */
function getBuffOptionLabel(option: GmEditorBuffOption): string {
  return gmCatalogHelpers.getBuffOptionLabel(option);
}

/** getBuffCatalogOptions：执行对应的业务逻辑。 */
function getBuffCatalogOptions(selectedBuffId?: string): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getBuffCatalogOptions(editorCatalog, selectedBuffId);
}

/** getMailAttachmentItemOptions：执行对应的业务逻辑。 */
function getMailAttachmentItemOptions(): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getMailAttachmentItemOptions(editorCatalog);
}

/** getMailAttachmentPageStore：执行对应的业务逻辑。 */
function getMailAttachmentPageStore(scope: 'direct' | 'shortcut'): Map<number, number> {
  return scope === 'direct' ? directMailAttachmentPageByIndex : shortcutMailAttachmentPageByIndex;
}

/** resetMailAttachmentPageStore：执行对应的业务逻辑。 */
function resetMailAttachmentPageStore(scope: 'direct' | 'shortcut'): void {
  if (scope === 'direct') {
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  shortcutMailAttachmentPageByIndex = new Map();
}

/** getMailAttachmentItemPageState：执行对应的业务逻辑。 */
function getMailAttachmentItemPageState(
  scope: 'direct' | 'shortcut',
  attachmentIndex: number,
  selectedItemId: string,
): {
/** page：定义该变量以承载业务值。 */
  page: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
/** options：定义该变量以承载业务值。 */
  options: Array<{ value: string; label: string }>;
} {
/** allOptions：定义该变量以承载业务值。 */
  const allOptions = getMailAttachmentItemOptions();
/** totalPages：定义该变量以承载业务值。 */
  const totalPages = Math.max(1, Math.ceil(allOptions.length / MAIL_ATTACHMENT_ITEM_PAGE_SIZE));
/** selectedIndex：定义该变量以承载业务值。 */
  const selectedIndex = selectedItemId
    ? allOptions.findIndex((option) => option.value === selectedItemId)
    : -1;
/** fallbackPage：定义该变量以承载业务值。 */
  const fallbackPage = selectedIndex >= 0
    ? Math.floor(selectedIndex / MAIL_ATTACHMENT_ITEM_PAGE_SIZE) + 1
    : 1;
/** pageStore：定义该变量以承载业务值。 */
  const pageStore = getMailAttachmentPageStore(scope);
/** storedPage：定义该变量以承载业务值。 */
  const storedPage = pageStore.get(attachmentIndex) ?? fallbackPage;
/** page：定义该变量以承载业务值。 */
  const page = Math.min(totalPages, Math.max(1, storedPage));
  if (pageStore.get(attachmentIndex) !== page) {
    pageStore.set(attachmentIndex, page);
  }
/** start：定义该变量以承载业务值。 */
  const start = (page - 1) * MAIL_ATTACHMENT_ITEM_PAGE_SIZE;
/** pagedOptions：定义该变量以承载业务值。 */
  const pagedOptions = allOptions.slice(start, start + MAIL_ATTACHMENT_ITEM_PAGE_SIZE);
/** selectedOption：定义该变量以承载业务值。 */
  const selectedOption = selectedItemId
    ? allOptions.find((option) => option.value === selectedItemId) ?? null
    : null;
/** options：定义该变量以承载业务值。 */
  const options = selectedOption && !pagedOptions.some((option) => option.value === selectedOption.value)
    ? [selectedOption, ...pagedOptions]
    : pagedOptions;
  return {
    page,
    totalPages,
    options,
  };
}

/** updateMailAttachmentItemPage：执行对应的业务逻辑。 */
function updateMailAttachmentItemPage(scope: 'direct' | 'shortcut', attachmentIndex: number, rawValue: string): void {
/** page：定义该变量以承载业务值。 */
  const page = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
  getMailAttachmentPageStore(scope).set(attachmentIndex, page);
}

/** getMailAttachmentRowMeta：执行对应的业务逻辑。 */
function getMailAttachmentRowMeta(itemId: string): string {
  return gmCatalogHelpers.getMailAttachmentRowMeta(editorCatalog, itemId);
}

/** getMailTemplateOptionMeta：执行对应的业务逻辑。 */
function getMailTemplateOptionMeta(templateId: string): { label: string; description: string } | null {
  return gmCatalogHelpers.getMailTemplateOptionMeta(templateId);
}

/** isServerManagedMailTemplate：执行对应的业务逻辑。 */
function isServerManagedMailTemplate(templateId: string): boolean {
  return gmCatalogHelpers.isServerManagedMailTemplate(templateId);
}

/** getShortcutMailTargetOptions：执行对应的业务逻辑。 */
function getShortcutMailTargetOptions(): Array<{ value: string; label: string }> {
/** players：定义该变量以承载业务值。 */
  const players = state?.players.filter((player) => !player.meta.isBot) ?? [];
/** options：定义该变量以承载业务值。 */
  const options = [
    { value: '', label: '发送给全服玩家' },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.roleName} · ${player.accountName || '无账号'} · ${player.meta.online ? '在线' : '离线'}`,
    })),
  ];
/** selectedTargetId：定义该变量以承载业务值。 */
  const selectedTargetId = broadcastMailDraft.targetPlayerId.trim();
  if (selectedTargetId && !options.some((option) => option.value === selectedTargetId)) {
/** fallbackLabel：定义该变量以承载业务值。 */
    const fallbackLabel = selectedPlayerDetail?.id === selectedTargetId
      ? `${selectedPlayerDetail.roleName} · ${selectedPlayerDetail.account?.username || '无账号'} · 已选中`
      : `当前目标 · ${selectedTargetId}`;
    options.push({ value: selectedTargetId, label: fallbackLabel });
  }
  return options;
}

/** getMailComposerPayload：执行对应的业务逻辑。 */
function getMailComposerPayload(draft: GmMailComposerDraft): GmCreateMailReq {
/** templateId：定义该变量以承载业务值。 */
  const templateId = draft.templateId.trim();
/** usesServerManagedTemplate：定义该变量以承载业务值。 */
  const usesServerManagedTemplate = isServerManagedMailTemplate(templateId);
/** title：定义该变量以承载业务值。 */
  const title = draft.title.trim();
/** body：定义该变量以承载业务值。 */
  const body = draft.body.trim();
/** senderLabel：定义该变量以承载业务值。 */
  const senderLabel = draft.senderLabel.trim() || '司命台';
/** expireHours：定义该变量以承载业务值。 */
  const expireHours = Math.floor(Number(draft.expireHours || '0'));
/** attachments：定义该变量以承载业务值。 */
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

/** getMailComposerMarkup：执行对应的业务逻辑。 */
function getMailComposerMarkup(
  draft: GmMailComposerDraft,
  options: {
/** scope：定义该变量以承载业务值。 */
    scope: 'direct' | 'shortcut';
/** submitLabel：定义该变量以承载业务值。 */
    submitLabel: string;
/** note：定义该变量以承载业务值。 */
    note: string;
    showTargetPlayer?: boolean;
  },
): string {
/** usesServerManagedTemplate：定义该变量以承载业务值。 */
  const usesServerManagedTemplate = isServerManagedMailTemplate(draft.templateId);
/** templateMeta：定义该变量以承载业务值。 */
  const templateMeta = getMailTemplateOptionMeta(draft.templateId);
/** attachmentRows：定义该变量以承载业务值。 */
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
              <input type="number" min="1" data-mail-bind="${options.scope}.attachments.${index}.count" value="${Math.max(1, Math.floor(entry.count || 1))}" />
            </label>
          </div>
        </div>
      `;
      }).join('')
      : '<div class="editor-note">当前没有附件。</div>';
/** targetPlayerField：定义该变量以承载业务值。 */
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
/** templateField：定义该变量以承载业务值。 */
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
/** customContentFields：定义该变量以承载业务值。 */
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
/** attachmentSection：定义该变量以承载业务值。 */
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
          <button class="small-btn" type="button" data-action="${options.scope === 'direct' ? 'add-direct-mail-attachment' : 'add-shortcut-mail-attachment'}">新增附件</button>
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
  `;
}

/** getInventoryAddTypeOptions：执行对应的业务逻辑。 */
function getInventoryAddTypeOptions(): Array<{ value: string; label: string }> {
  return ITEM_TYPES.map((type) => ({
    value: type,
    label: ITEM_TYPE_LABELS[type],
  }));
}

/** getInventoryAddItemOptions：执行对应的业务逻辑。 */
function getInventoryAddItemOptions(): Array<{ value: string; label: string }> {
  return getItemCatalogOptions((option) => option.type === currentInventoryAddType);
}

/** findTechniqueCatalogEntry：执行对应的业务逻辑。 */
function findTechniqueCatalogEntry(techId: string | undefined): GmEditorTechniqueOption | null {
  return gmCatalogHelpers.findTechniqueCatalogEntry(editorCatalog, techId);
}

/** findItemCatalogEntry：执行对应的业务逻辑。 */
function findItemCatalogEntry(itemId: string | undefined): GmEditorItemOption | null {
  return gmCatalogHelpers.findItemCatalogEntry(editorCatalog, itemId);
}

/** findBuffCatalogEntry：执行对应的业务逻辑。 */
function findBuffCatalogEntry(buffId: string | undefined): GmEditorBuffOption | null {
  return gmCatalogHelpers.findBuffCatalogEntry(editorCatalog, buffId);
}

/** createTechniqueFromCatalog：执行对应的业务逻辑。 */
function createTechniqueFromCatalog(techId: string): TechniqueState {
  return gmCatalogHelpers.createTechniqueFromCatalog(techId, editorCatalog, createDefaultTechnique, clone);
}

/** createItemFromCatalog：执行对应的业务逻辑。 */
function createItemFromCatalog(itemId: string, count = 1): ItemStack {
  return gmCatalogHelpers.createItemFromCatalog(itemId, editorCatalog, createDefaultItem, clone, count);
}

/** createBuffFromCatalog：执行对应的业务逻辑。 */
function createBuffFromCatalog(
  buffId: string,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  return gmCatalogHelpers.createBuffFromCatalog(buffId, editorCatalog, createDefaultBuff, clone, current);
}

/** getTechniqueSummary：执行对应的业务逻辑。 */
function getTechniqueSummary(technique: TechniqueState): string {
  return gmCatalogHelpers.getTechniqueSummary(technique);
}

/** getTechniqueTemplateMaxLevel：执行对应的业务逻辑。 */
function getTechniqueTemplateMaxLevel(technique: TechniqueState): number {
  return gmCatalogHelpers.getTechniqueTemplateMaxLevel(technique, editorCatalog);
}

/** buildMaxLevelTechniqueState：执行对应的业务逻辑。 */
function buildMaxLevelTechniqueState(technique: TechniqueState): TechniqueState {
/** catalogEntry：定义该变量以承载业务值。 */
  const catalogEntry = findTechniqueCatalogEntry(technique.techId);
/** maxLevel：定义该变量以承载业务值。 */
  const maxLevel = getTechniqueTemplateMaxLevel(technique);
  if (!catalogEntry) {
    return {
      ...clone(technique),
      level: maxLevel,
      exp: 0,
      expToNext: 0,
    };
  }
/** next：定义该变量以承载业务值。 */
  const next = createTechniqueFromCatalog(technique.techId);
  return {
    ...next,
    level: maxLevel,
    exp: 0,
    expToNext: 0,
  };
}

/** getInventoryRowMeta：执行对应的业务逻辑。 */
function getInventoryRowMeta(item: ItemStack): string {
  return gmCatalogHelpers.getInventoryRowMeta(item);
}

/** getTechniqueEditorControls：执行对应的业务逻辑。 */
function getTechniqueEditorControls(index: number, technique: TechniqueState): string {
/** catalogEntry：定义该变量以承载业务值。 */
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

/** getItemEditorControls：执行对应的业务逻辑。 */
function getItemEditorControls(basePath: string, item: ItemStack, mode: 'inventory' | 'equipment'): string {
/** catalogEntry：定义该变量以承载业务值。 */
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

/** getCompactInventoryItemMarkup：执行对应的业务逻辑。 */
function getCompactInventoryItemMarkup(item: ItemStack, index: number): string {
  return gmMarkupHelpers.getCompactInventoryItemMarkup(item, index, numberField);
}

/** getReadonlyPreviewValue：执行对应的业务逻辑。 */
function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  return gmMarkupHelpers.getReadonlyPreviewValue(draft, path);
}

/** buildEditorStructureKey：执行对应的业务逻辑。 */
function buildEditorStructureKey(detail: GmManagedPlayerRecord, draft: PlayerState): string {
/** mapIds：定义该变量以承载业务值。 */
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort().join(',');
/** equipmentPresence：定义该变量以承载业务值。 */
  const equipmentPresence = EQUIP_SLOTS.map((slot) => (draft.equipment[slot] ? '1' : '0')).join('');
  return [
    detail.id,
    mapIds,
    equipmentPresence,
    detail.account?.status ?? 'no-account',
    detail.account?.bannedAt ?? '',
    detail.account?.banReason ?? '',
    ensureArray(draft.bonuses).length,
    ensureArray(draft.temporaryBuffs).length,
    ensureArray(draft.inventory.items).length,
    ensureArray(draft.autoBattleSkills).length,
    ensureArray(draft.techniques).length,
    ensureArray(draft.quests).length,
  ].join('|');
}

/** setTextLikeValue：执行对应的业务逻辑。 */
function setTextLikeValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  preserveFocusedField = true,
): void {
  if (field.value === value) return;
  if (preserveFocusedField && document.activeElement === field) {
    return;
  }
  field.value = value;
}

/** syncVisualEditorFieldsFromDraft：执行对应的业务逻辑。 */
function syncVisualEditorFieldsFromDraft(draft: PlayerState): void {
/** fields：定义该变量以承载业务值。 */
  const fields = editorContentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');
  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;
/** rawValue：定义该变量以承载业务值。 */
    const rawValue = getValueByPath(draft, path);
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
/** checked：定义该变量以承载业务值。 */
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
/** setTextLikeValue：处理当前场景中的对应操作。 */
      setTextLikeValue(field, typeof rawValue === 'string' ? rawValue : '');
      continue;
    }
    if (kind === 'string-array') {
      setTextLikeValue(field, Array.isArray(rawValue) ? rawValue.join('\n') : '');
      continue;
    }
    if (kind === 'json') {
/** emptyJson：定义该变量以承载业务值。 */
      const emptyJson = field.dataset.emptyJson;
/** fallback：定义该变量以承载业务值。 */
      const fallback = emptyJson === 'array' ? [] : emptyJson === 'null' ? null : {};
      setTextLikeValue(field, formatJson(rawValue ?? fallback));
      continue;
    }
    setTextLikeValue(field, rawValue == null ? '' : String(rawValue));
  }
  syncSearchableItemFields(editorContentEl);
}

/** patchEditorPreview：执行对应的业务逻辑。 */
function patchEditorPreview(detail: GmManagedPlayerRecord, draft: PlayerState): void {
/** equipment：定义该变量以承载业务值。 */
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
/** titleEl：定义该变量以承载业务值。 */
    const titleEl = editorContentEl.querySelector<HTMLElement>(`[data-preview="buff-title"][data-index="${index}"]`);
    if (titleEl) {
      titleEl.textContent = getBuffCardTitle(buff, index);
    }
/** metaEl：定义该变量以承载业务值。 */
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

/** chipListEl：定义该变量以承载业务值。 */
  const chipListEl = editorContentEl.querySelector<HTMLElement>('[data-preview="base-chips"]');
  if (chipListEl) {
    chipListEl.innerHTML = getEditorBodyChipMarkup(detail, draft);
  }
  editorContentEl.querySelectorAll<HTMLElement>('[data-preview="readonly"]').forEach((element) => {
/** path：定义该变量以承载业务值。 */
    const path = element.dataset.path;
    if (!path) return;
    element.textContent = getReadonlyPreviewValue(draft, path);
  });
}

/** clearEditorRenderCache：执行对应的业务逻辑。 */
function clearEditorRenderCache(): void {
  lastEditorStructureKey = null;
  editorContentEl.innerHTML = '';
}

/** getVisibleNetworkBuckets：执行对应的业务逻辑。 */
function getVisibleNetworkBuckets(buckets: GmNetworkBucket[]): GmNetworkBucket[] {
/** visibleBuckets：定义该变量以承载业务值。 */
  const visibleBuckets = buckets.slice(0, 8);
/** hiddenBuckets：定义该变量以承载业务值。 */
  const hiddenBuckets = buckets.slice(8);
  if (hiddenBuckets.length > 0) {
/** otherBytes：定义该变量以承载业务值。 */
    const otherBytes = hiddenBuckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
/** otherCount：定义该变量以承载业务值。 */
    const otherCount = hiddenBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    visibleBuckets.push({
      key: 'other',
      label: `其余 ${hiddenBuckets.length} 项`,
      bytes: otherBytes,
      count: otherCount,
    });
  }
  return visibleBuckets;
}

/** getNetworkBucketMeta：执行对应的业务逻辑。 */
function getNetworkBucketMeta(
  totalBytes: number,
  bucket: GmNetworkBucket,
  elapsedSec: number,
): string {
  return `${formatBytes(bucket.bytes)} · ${formatPercent(bucket.bytes, totalBytes)} · ${bucket.count} 次 · 均次 ${formatAverageBytesPerEvent(bucket.bytes, bucket.count)} · 均秒 ${formatBytesPerSecond(bucket.bytes, elapsedSec)}`;
}

/** getTickPerf：执行对应的业务逻辑。 */
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

/** getStatRowMarkup：执行对应的业务逻辑。 */
function getStatRowMarkup(key: string): string {
  return gmMarkupHelpers.getStatRowMarkup(key);
}

/** patchStatRow：执行对应的业务逻辑。 */
function patchStatRow(row: HTMLElement, label: string, meta: string): void {
  row.querySelector<HTMLElement>('[data-role="label"]')!.textContent = label;
  row.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = meta;
}

/** renderStructuredStatList：执行对应的业务逻辑。 */
function renderStructuredStatList(
  container: HTMLElement,
  structureKey: string | null,
/** items：定义该变量以承载业务值。 */
  items: Array<{ key: string; label: string; meta: string }>,
  emptyText: string,
): string {
  if (items.length === 0) {
    if (structureKey !== 'empty') {
      container.innerHTML = `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
    }
    return 'empty';
  }

/** nextStructureKey：定义该变量以承载业务值。 */
  const nextStructureKey = items.map((item) => item.key).join('|');
  if (structureKey !== nextStructureKey) {
    container.innerHTML = items.map((item) => getStatRowMarkup(item.key)).join('');
  }
  items.forEach((item, index) => {
/** row：定义该变量以承载业务值。 */
    const row = container.children[index];
    if (!(row instanceof HTMLElement)) {
      return;
    }
    patchStatRow(row, item.label, item.meta);
  });
  return nextStructureKey;
}

/** getSortedCpuSections：执行对应的业务逻辑。 */
function getSortedCpuSections(data: GmStateRes): GmCpuSectionSnapshot[] {
/** sections：定义该变量以承载业务值。 */
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

/** getCpuSectionMeta：执行对应的业务逻辑。 */
function getCpuSectionMeta(section: GmCpuSectionSnapshot): string {
  return `${section.totalMs.toFixed(2)} ms · ${section.percent.toFixed(1)}% · ${section.count} 次 · 均次 ${section.avgMs.toFixed(3)} ms`;
}

/** getPathfindingFailureMeta：执行对应的业务逻辑。 */
function getPathfindingFailureMeta(totalFailures: number, count: number): string {
  return `${count} 次 · 占失败 ${formatPercent(count, totalFailures)}`;
}

/** renderPerfLists：执行对应的业务逻辑。 */
function renderPerfLists(data: GmStateRes): void {
/** elapsedSec：定义该变量以承载业务值。 */
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
/** networkInItems：定义该变量以承载业务值。 */
  const networkInItems = data.perf.networkInBytes > 0
    ? getVisibleNetworkBuckets(data.perf.networkInBuckets).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkInBytes, bucket, elapsedSec),
      }))
    : [];
/** networkOutItems：定义该变量以承载业务值。 */
  const networkOutItems = data.perf.networkOutBytes > 0
    ? getVisibleNetworkBuckets(data.perf.networkOutBuckets).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkOutBytes, bucket, elapsedSec),
      }))
    : [];
/** cpuItems：定义该变量以承载业务值。 */
  const cpuItems = getSortedCpuSections(data).map((section) => ({
    key: section.key,
    label: section.label,
    meta: getCpuSectionMeta(section),
  }));
/** totalFailures：定义该变量以承载业务值。 */
  const totalFailures = data.perf.pathfinding.failed + data.perf.pathfinding.cancelled;
/** pathfindingFailureItems：定义该变量以承载业务值。 */
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
  lastPathfindingFailureStructureKey = renderStructuredStatList(
    pathfindingFailureListEl,
    lastPathfindingFailureStructureKey,
    pathfindingFailureItems,
    '当前还没有寻路失败记录。',
  );
}

/** renderSuggestionReply：执行对应的业务逻辑。 */
function renderSuggestionReply(reply: Suggestion['replies'][number]): string {
  return gmMarkupHelpers.renderSuggestionReply(reply);
}

/** getSuggestionCardMarkup：执行对应的业务逻辑。 */
function getSuggestionCardMarkup(suggestion: Suggestion): string {
  return gmMarkupHelpers.getSuggestionCardMarkup(suggestion);
}

/** getEditorTabLabel：执行对应的业务逻辑。 */
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
    case 'persisted':
      return '持久化 JSON';
  }
}

/** switchEditorTab：执行对应的业务逻辑。 */
function switchEditorTab(tab: GmEditorTab): void {
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
  editorTabPersistedBtn.classList.toggle('active', tab === 'persisted');
  editorVisualPanelEl.classList.toggle('hidden', tab === 'persisted');
  editorPersistedPanelEl.classList.toggle('hidden', tab !== 'persisted');
  editorContentEl.querySelectorAll<HTMLElement>('[data-editor-tab]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.editorTab !== tab);
  });
  if (tab === 'persisted') {
    savePlayerBtn.textContent = '高级区不直接保存';
  } else if (tab === 'mail') {
    savePlayerBtn.textContent = '邮件标签不直接保存';
  } else if (tab === 'shortcuts') {
    savePlayerBtn.textContent = '快捷标签按钮会直接提交';
  } else {
    savePlayerBtn.textContent = `保存${getEditorTabLabel(tab)}`;
  }
  savePlayerBtn.disabled = tab === 'persisted' || tab === 'mail' || tab === 'shortcuts' || !selectedPlayerId;
}

/** StatusKind：定义该类型的结构与数据语义。 */
type StatusKind = 'idle' | 'pending' | 'success' | 'error';

/** applyStatusState：执行对应的业务逻辑。 */
function applyStatusState(message: string, kind: StatusKind): void {
  statusBarEl.textContent = message;
  statusBarEl.dataset.kind = kind;
}

/** hideStatusToast：执行对应的业务逻辑。 */
function hideStatusToast(): void {
  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
    statusToastTimer = null;
  }
  statusToastEl.dataset.open = 'false';
  statusToastEl.dataset.kind = 'idle';
  statusToastEl.textContent = '';
}

/** showStatusToast：执行对应的业务逻辑。 */
function showStatusToast(message: string, kind: Exclude<StatusKind, 'idle'>): void {
  if (!message) {
    hideStatusToast();
    return;
  }
  if (statusToastTimer !== null) {
    window.clearTimeout(statusToastTimer);
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

/** setPendingStatus：执行对应的业务逻辑。 */
function setPendingStatus(message: string): void {
/** applyStatusState：处理当前场景中的对应操作。 */
  applyStatusState(message, message ? 'pending' : 'idle');
  showStatusToast(message, 'pending');
}

/** setStatus：执行对应的业务逻辑。 */
function setStatus(message: string, isError = false): void {
/** kind：定义该变量以承载业务值。 */
  const kind: StatusKind = !message ? 'idle' : isError ? 'error' : 'success';
  applyStatusState(message, kind);
  if (kind === 'idle') {
    hideStatusToast();
    return;
  }
  showStatusToast(message, kind);
}

/** worldViewer：定义该变量以承载业务值。 */
const worldViewer = new GmWorldViewer(request, setStatus);

/** switchServerTab：执行对应的业务逻辑。 */
function switchServerTab(tab: 'overview' | 'traffic' | 'cpu' | 'database'): void {
  currentServerTab = tab;
  serverSubtabOverviewBtn.classList.toggle('active', tab === 'overview');
  serverSubtabTrafficBtn.classList.toggle('active', tab === 'traffic');
  serverSubtabCpuBtn.classList.toggle('active', tab === 'cpu');
  serverSubtabDatabaseBtn.classList.toggle('active', tab === 'database');
  serverPanelOverviewEl.classList.toggle('hidden', tab !== 'overview');
  serverPanelTrafficEl.classList.toggle('hidden', tab !== 'traffic');
  serverPanelCpuEl.classList.toggle('hidden', tab !== 'cpu');
  serverPanelDatabaseEl.classList.toggle('hidden', tab !== 'database');
  if (tab === 'database' && !databaseStateLoading) {
    loadDatabaseState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '加载数据库状态失败', true);
    });
  }
}

/** formatDatabaseBackupKind：执行对应的业务逻辑。 */
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
    default:
      return kind;
  }
}

/** formatDatabaseJobLabel：执行对应的业务逻辑。 */
function formatDatabaseJobLabel(data: GmDatabaseStateRes | null): string {
/** job：定义该变量以承载业务值。 */
  const job = data?.runningJob ?? data?.lastJob;
  if (!job) {
    return '当前没有数据库任务记录。';
  }
/** action：定义该变量以承载业务值。 */
  const action = job.type === 'restore'
    ? `导入 ${job.sourceBackupId ?? '未知备份'}`
    : `导出 ${job.backupId ?? job.kind ?? '备份'}`;
/** status：定义该变量以承载业务值。 */
  const status = job.status === 'running'
    ? '进行中'
    : job.status === 'completed'
      ? '已完成'
      : '失败';
/** finishedText：定义该变量以承载业务值。 */
  const finishedText = job.finishedAt ? ` · 结束于 ${formatDateTime(job.finishedAt)}` : '';
/** errorText：定义该变量以承载业务值。 */
  const errorText = job.error ? ` · ${job.error}` : '';
  return `${action} · ${status} · 开始于 ${formatDateTime(job.startedAt)}${finishedText}${errorText}`;
}

/** renderDatabasePanel：执行对应的业务逻辑。 */
function renderDatabasePanel(): void {
/** busy：定义该变量以承载业务值。 */
  const busy = databaseState?.runningJob?.status === 'running';
/** backups：定义该变量以承载业务值。 */
  const backups = databaseState?.backups ?? [];
/** summary：定义该变量以承载业务值。 */
  const summary = databaseStateLoading && !databaseState
    ? '正在读取数据库备份状态…'
    : formatDatabaseJobLabel(databaseState);
/** rows：定义该变量以承载业务值。 */
  const rows = backups.length > 0
    ? backups.map((backup) => `
        <div class="network-row">
          <div class="network-row-label">${escapeHtml(backup.fileName)}</div>
          <div class="network-row-meta">
            ${escapeHtml(formatDatabaseBackupKind(backup.kind))} · ${escapeHtml(formatDateTime(backup.createdAt))} · ${escapeHtml(formatBytes(backup.sizeBytes))}
          </div>
          <div class="button-row" style="margin-top:8px;">
            <button class="small-btn" data-db-download="${escapeHtml(backup.id)}" type="button">下载备份</button>
            <button class="small-btn danger" data-db-restore="${escapeHtml(backup.id)}" type="button" ${busy ? 'disabled' : ''}>导入覆盖当前库</button>
          </div>
        </div>
      `).join('')
    : '<div class="empty-hint">当前还没有数据库备份。</div>';

  serverPanelDatabaseEl.innerHTML = `
    <div class="button-row">
      <button id="database-refresh" class="small-btn" type="button">刷新数据库状态</button>
      <button id="database-export-current" class="small-btn primary" type="button" ${busy ? 'disabled' : ''}>导出当前数据库</button>
    </div>
    <div class="note-card">${escapeHtml(summary)}</div>
    <div class="note-card">
      自动策略：${escapeHtml(databaseState?.schedules.hourly ?? '每小时整点低优先级备份')}；${escapeHtml(databaseState?.schedules.daily ?? '每天 04:05 低优先级备份')}。<br />
      保留策略：整点备份最多 ${databaseState?.retention.hourly ?? 72} 份，每日备份最多 ${databaseState?.retention.daily ?? 14} 份。手动导出和导入前备份当前不自动删。<br />
      导入历史备份前，服务端会先生成一份“导入前备份”，随后暂停 tick、断开玩家连接、覆盖数据库并重建运行时。<br />
      ${escapeHtml(databaseState?.note ?? '正式数据库备份与恢复由独立 backup worker 执行，游戏服只负责发起请求、维护窗口与展示状态。')}
    </div>
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">历史数据库备份</div>
        <div class="network-breakdown-subtitle">支持下载任意历史备份，也支持直接把某份备份重新导入为当前数据库</div>
      </div>
      <div class="network-breakdown-list">${rows}</div>
    </div>
  `;
}

/** renderRedeemPanel：执行对应的业务逻辑。 */
function renderRedeemPanel(): void {
  if (!redeemGroupListEl || !redeemGroupEditorEl || !redeemCodeListEl) {
    return;
  }

/** selectedGroupId：定义该变量以承载业务值。 */
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

/** editingExisting：定义该变量以承载业务值。 */
  const editingExisting = !!redeemGroupDetailState && redeemGroupDetailState.group.id === selectedGroupId;
/** groupMeta：定义该变量以承载业务值。 */
  const groupMeta = redeemGroupDetailState?.group ?? null;
/** rewardRows：定义该变量以承载业务值。 */
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

/** codeItems：定义该变量以承载业务值。 */
  const codeItems = redeemGroupDetailState?.codes ?? [];
/** activeCodeCount：定义该变量以承载业务值。 */
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

/** getRedeemCodeMarkup：执行对应的业务逻辑。 */
function getRedeemCodeMarkup(code: RedeemCodeCodeView): string {
  return gmMarkupHelpers.getRedeemCodeMarkup(code, formatDateTime);
}

/** copyTextToClipboard：执行对应的业务逻辑。 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 某些浏览器或非安全上下文会拒绝 Clipboard API，此时回退到 execCommand。
  }

/** textarea：定义该变量以承载业务值。 */
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

/** copyActiveRedeemCodes：执行对应的业务逻辑。 */
async function copyActiveRedeemCodes(): Promise<void> {
/** group：定义该变量以承载业务值。 */
  const group = redeemGroupDetailState?.group;
/** activeCodes：定义该变量以承载业务值。 */
  const activeCodes = (redeemGroupDetailState?.codes ?? [])
    .filter((code) => code.status === 'active')
    .map((code) => code.code.trim())
    .filter((code) => code.length > 0);
  if (activeCodes.length === 0) {
    setStatus('当前分组没有可复制的未使用兑换码', true);
    return;
  }
/** copied：定义该变量以承载业务值。 */
  const copied = await copyTextToClipboard(activeCodes.join('\n'));
  if (!copied) {
    setStatus('复制未使用兑换码失败，请检查浏览器剪贴板权限', true);
    return;
  }
/** setStatus：处理当前场景中的对应操作。 */
  setStatus(`已复制 ${activeCodes.length} 个未使用兑换码${group ? ` · ${group.name}` : ''}`);
}

/** getRedeemCodeStatusLabel：执行对应的业务逻辑。 */
function getRedeemCodeStatusLabel(status: RedeemCodeCodeView['status']): string {
  return gmMarkupHelpers.getRedeemCodeStatusLabel(status);
}

/** buildRedeemGroupPayload：执行对应的业务逻辑。 */
function buildRedeemGroupPayload(): { name: string; rewards: RedeemCodeGroupRewardItem[] } {
/** name：定义该变量以承载业务值。 */
  const name = redeemDraft.name.trim();
/** rewards：定义该变量以承载业务值。 */
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

/** loadRedeemGroups：执行对应的业务逻辑。 */
async function loadRedeemGroups(silent = false): Promise<void> {
  redeemLoading = true;
  renderRedeemPanel();
  try {
/** data：定义该变量以承载业务值。 */
    const data = await request<GmRedeemCodeGroupListRes>('/gm/redeem-code-groups');
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
    redeemLoading = false;
    renderRedeemPanel();
  }
}

/** loadRedeemGroupDetail：执行对应的业务逻辑。 */
async function loadRedeemGroupDetail(groupId: string, silent = false): Promise<void> {
  redeemLoading = true;
  renderRedeemPanel();
  try {
/** detail：定义该变量以承载业务值。 */
    const detail = await request<GmRedeemCodeGroupDetailRes>(`/gm/redeem-code-groups/${encodeURIComponent(groupId)}`);
    if (selectedRedeemGroupId !== groupId) {
      return;
    }
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
    redeemLoading = false;
    renderRedeemPanel();
  }
}

/** createRedeemGroup：执行对应的业务逻辑。 */
async function createRedeemGroup(): Promise<void> {
/** payloadBase：定义该变量以承载业务值。 */
  const payloadBase = buildRedeemGroupPayload();
/** payload：定义该变量以承载业务值。 */
  const payload: GmCreateRedeemCodeGroupReq = {
    ...payloadBase,
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.createCount || '0')) || 0)),
  };
/** result：定义该变量以承载业务值。 */
  const result = await request<GmCreateRedeemCodeGroupRes>('/gm/redeem-code-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  selectedRedeemGroupId = result.group.id;
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(`已创建分组 ${result.group.name}，并生成 ${result.codes.length} 个兑换码`);
}

/** saveRedeemGroup：执行对应的业务逻辑。 */
async function saveRedeemGroup(): Promise<void> {
  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
  }
/** payload：定义该变量以承载业务值。 */
  const payload: GmUpdateRedeemCodeGroupReq = buildRedeemGroupPayload();
  await request<GmRedeemCodeGroupDetailRes>(`/gm/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  redeemLatestGeneratedCodes = [];
  await loadRedeemGroups(true);
  setStatus('兑换码分组已保存');
}

/** appendRedeemCodes：执行对应的业务逻辑。 */
async function appendRedeemCodes(): Promise<void> {
  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
  }
/** payload：定义该变量以承载业务值。 */
  const payload: GmAppendRedeemCodesReq = {
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.appendCount || '0')) || 0)),
  };
/** result：定义该变量以承载业务值。 */
  const result = await request<GmAppendRedeemCodesRes>(`/gm/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}/codes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(`已追加 ${result.codes.length} 个兑换码`);
}

/** destroyRedeemCode：执行对应的业务逻辑。 */
async function destroyRedeemCode(codeId: string): Promise<void> {
  await request<{ ok: true }>(`/gm/redeem-codes/${encodeURIComponent(codeId)}`, {
    method: 'DELETE',
  });
  await loadRedeemGroups(true);
  setStatus('兑换码已销毁');
}

/** loadDatabaseState：执行对应的业务逻辑。 */
async function loadDatabaseState(silent = false): Promise<void> {
  if (!token) {
    return;
  }
  databaseStateLoading = true;
  renderDatabasePanel();
  try {
/** data：定义该变量以承载业务值。 */
    const data = await request<GmDatabaseStateRes>('/gm/database/state');
    databaseState = data;
    if (!silent) {
      setStatus(`已同步 ${data.backups.length} 份数据库备份`);
    }
  } finally {
    databaseStateLoading = false;
    renderDatabasePanel();
  }
}

/** exportCurrentDatabase：执行对应的业务逻辑。 */
async function exportCurrentDatabase(): Promise<void> {
/** result：定义该变量以承载业务值。 */
  const result = await request<GmTriggerDatabaseBackupRes>('/gm/database/backup', {
    method: 'POST',
  });
  setStatus(`已开始导出当前数据库：${result.job.backupId ?? result.job.id}`);
  await loadDatabaseState(true);
}

/** getDownloadFileName：执行对应的业务逻辑。 */
function getDownloadFileName(response: Response, fallback: string): string {
/** header：定义该变量以承载业务值。 */
  const header = response.headers.get('content-disposition') ?? '';
/** utf8Match：定义该变量以承载业务值。 */
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
/** basicMatch：定义该变量以承载业务值。 */
  const basicMatch = header.match(/filename="?([^";]+)"?/iu);
  return basicMatch?.[1] ?? fallback;
}

/** downloadDatabaseBackup：执行对应的业务逻辑。 */
async function downloadDatabaseBackup(backupId: string): Promise<void> {
/** response：定义该变量以承载业务值。 */
  const response = await requestBlob(`/gm/database/backups/${encodeURIComponent(backupId)}/download`);
/** blob：定义该变量以承载业务值。 */
  const blob = await response.blob();
/** fileName：定义该变量以承载业务值。 */
  const fileName = getDownloadFileName(response, `${backupId}.dump`);
/** objectUrl：定义该变量以承载业务值。 */
  const objectUrl = URL.createObjectURL(blob);
/** anchor：定义该变量以承载业务值。 */
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  setStatus(`已下载数据库备份 ${fileName}`);
}

/** restoreDatabaseBackup：执行对应的业务逻辑。 */
async function restoreDatabaseBackup(backupId: string): Promise<void> {
/** backup：定义该变量以承载业务值。 */
  const backup = databaseState?.backups.find((entry) => entry.id === backupId);
  if (!backup) {
    setStatus('目标备份不存在', true);
    return;
  }
/** confirmed：定义该变量以承载业务值。 */
  const confirmed = window.confirm(`将使用备份 ${backup.fileName} 覆盖当前数据库。\n服务端会先自动备份当前库，并断开在线玩家连接。是否继续？`);
  if (!confirmed) {
    return;
  }
/** body：定义该变量以承载业务值。 */
  const body: GmRestoreDatabaseReq = { backupId };
/** result：定义该变量以承载业务值。 */
  const result = await request<GmTriggerDatabaseBackupRes>('/gm/database/restore', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setStatus(`已开始导入数据库备份：${result.job.sourceBackupId ?? backup.fileName}`);
  await loadDatabaseState(true);
}

/** setCpuBreakdownSort：执行对应的业务逻辑。 */
function setCpuBreakdownSort(sort: 'total' | 'count' | 'avg'): void {
  currentCpuBreakdownSort = sort;
  cpuBreakdownSortTotalBtn.classList.toggle('primary', sort === 'total');
  cpuBreakdownSortCountBtn.classList.toggle('primary', sort === 'count');
  cpuBreakdownSortAvgBtn.classList.toggle('primary', sort === 'avg');
  if (state) {
    lastCpuBreakdownStructureKey = null;
    renderPerfLists(state);
  }
}

/** switchTab：执行对应的业务逻辑。 */
function switchTab(tab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts'): void {
  // 离开世界管理时停止轮询
  if (currentTab === 'world' && tab !== 'world') {
    worldViewer.stopPolling();
  }
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
/** setStatus：处理当前场景中的对应操作。 */
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

/** loadSuggestions：执行对应的业务逻辑。 */
async function loadSuggestions(): Promise<void> {
  try {
/** params：定义该变量以承载业务值。 */
    const params = new URLSearchParams({
      page: String(currentSuggestionPage),
      pageSize: '10',
    });
    if (currentSuggestionKeyword.trim()) {
      params.set('keyword', currentSuggestionKeyword.trim());
    }
/** result：定义该变量以承载业务值。 */
    const result = await request<GmSuggestionListRes>(`/gm/suggestions?${params.toString()}`);
    suggestions = result.items;
    currentSuggestionPage = result.page;
    currentSuggestionTotalPages = result.totalPages;
    currentSuggestionTotal = result.total;
    renderSuggestions();
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '加载建议失败', true);
  }
}

/** loadEditorCatalog：执行对应的业务逻辑。 */
async function loadEditorCatalog(): Promise<void> {
  try {
    editorCatalog = await request<GmEditorCatalogRes>('/gm/editor-catalog');
  } catch {
/** localCatalog：定义该变量以承载业务值。 */
    const localCatalog = getLocalEditorCatalog();
    editorCatalog = {
      ...localCatalog,
      buffs: localCatalog.buffs ?? [],
    };
  }
  renderShortcutMailComposer();
}

/** renderShortcutMailComposer：执行对应的业务逻辑。 */
function renderShortcutMailComposer(preserveActiveInteraction = false): void {
  if (!shortcutMailComposerEl) {
    return;
  }
/** targetPlayer：定义该变量以承载业务值。 */
  const targetPlayer = broadcastMailDraft.targetPlayerId
    ? (
      state?.players.find((player) => player.id === broadcastMailDraft.targetPlayerId)
      ?? (selectedPlayerDetail?.id === broadcastMailDraft.targetPlayerId ? selectedPlayerDetail : null)
    )
    : null;
/** structureKey：定义该变量以承载业务值。 */
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
/** activeElement：定义该变量以承载业务值。 */
  const activeElement = document.activeElement;
/** activeField：定义该变量以承载业务值。 */
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (preserveActiveInteraction && activeField && shortcutMailComposerEl.contains(activeField)) {
    shortcutMailComposerRefreshBlocked = true;
    return;
  }
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
  lastShortcutMailComposerStructureKey = structureKey;
}

/** flushShortcutMailComposerRefresh：执行对应的业务逻辑。 */
function flushShortcutMailComposerRefresh(): void {
  if (!shortcutMailComposerEl || !shortcutMailComposerRefreshBlocked) {
    return;
  }
/** activeElement：定义该变量以承载业务值。 */
  const activeElement = document.activeElement;
/** activeField：定义该变量以承载业务值。 */
  const activeField = activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLSelectElement
    || activeElement instanceof HTMLTextAreaElement
    ? activeElement
    : null;
  if (activeField && shortcutMailComposerEl.contains(activeField)) {
    return;
  }
  lastShortcutMailComposerStructureKey = null;
  shortcutMailComposerRefreshBlocked = false;
  renderShortcutMailComposer(true);
}

/** renderSuggestions：执行对应的业务逻辑。 */
function renderSuggestions(): void {
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

/** structureKey：定义该变量以承载业务值。 */
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
    lastSuggestionStructureKey = structureKey;
  }
  suggestionPageMetaEl.textContent = `第 ${currentSuggestionPage} / ${currentSuggestionTotalPages} 页 · 共 ${currentSuggestionTotal} 条`;
  suggestionPrevPageBtn.disabled = currentSuggestionPage <= 1;
  suggestionNextPageBtn.disabled = currentSuggestionPage >= currentSuggestionTotalPages;
}

/** completeSuggestion：执行对应的业务逻辑。 */
async function completeSuggestion(id: string): Promise<void> {
  try {
    await request(`/gm/suggestions/${id}/complete`, { method: 'POST' });
    setStatus('建议已标记为完成');
    await loadSuggestions();
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '操作失败', true);
  }
}

/** replySuggestion：执行对应的业务逻辑。 */
async function replySuggestion(id: string, content: string): Promise<void> {
  try {
    await request(`/gm/suggestions/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content } satisfies GmReplySuggestionReq),
    });
    setStatus('开发者回复已发送');
    await loadSuggestions();
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '发送回复失败', true);
  }
}

/** removeSuggestion：执行对应的业务逻辑。 */
async function removeSuggestion(id: string): Promise<void> {
  if (!confirm('确定要移除这条建议吗？此操作不可撤销。')) return;
  try {
    await request(`/gm/suggestions/${id}`, { method: 'DELETE' });
    setStatus('建议已成功移除');
    if (suggestions.length === 1 && currentSuggestionPage > 1) {
      currentSuggestionPage -= 1;
    }
    await loadSuggestions();
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '移除失败', true);
  }
}

/** request：执行对应的业务逻辑。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
/** headers：定义该变量以承载业务值。 */
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

/** response：定义该变量以承载业务值。 */
  const response = await fetch(path, { ...init, headers });
/** text：定义该变量以承载业务值。 */
  const text = await response.text();
/** data：定义该变量以承载业务值。 */
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (response.status === 401 && path !== '/auth/gm/login') {
    logout('GM 登录已失效，请重新输入密码');
    throw new Error('GM 登录已失效');
  }
  if (!response.ok) {
/** message：定义该变量以承载业务值。 */
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as { message: unknown }).message)
      : typeof data === 'string' && data.trim().length > 0
        ? data
        : '请求失败';
    throw new Error(message);
  }
  return data as T;
}

/** requestBlob：执行对应的业务逻辑。 */
async function requestBlob(path: string, init: RequestInit = {}): Promise<Response> {
/** headers：定义该变量以承载业务值。 */
  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
/** response：定义该变量以承载业务值。 */
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

/** updateMailDraftValue：执行对应的业务逻辑。 */
function updateMailDraftValue(
  scope: 'direct' | 'shortcut',
  path: string,
  rawValue: string,
): void {
/** draft：定义该变量以承载业务值。 */
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
/** attachmentMatch：定义该变量以承载业务值。 */
  const attachmentMatch = path.match(/^attachments\.(\d+)\.(itemId|count)$/);
  if (!attachmentMatch) {
    return;
  }
/** index：定义该变量以承载业务值。 */
  const index = Number(attachmentMatch[1]);
/** field：定义该变量以承载业务值。 */
  const field = attachmentMatch[2];
/** attachment：定义该变量以承载业务值。 */
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

/** updateRedeemDraftValue：执行对应的业务逻辑。 */
function updateRedeemDraftValue(path: string, rawValue: string): void {
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
/** rewardMatch：定义该变量以承载业务值。 */
  const rewardMatch = path.match(/^rewards\.(\d+)\.(itemId|count)$/);
  if (!rewardMatch) {
    return;
  }
/** index：定义该变量以承载业务值。 */
  const index = Number(rewardMatch[1]);
/** field：定义该变量以承载业务值。 */
  const field = rewardMatch[2];
/** reward：定义该变量以承载业务值。 */
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

/** rerenderDirectMailComposer：执行对应的业务逻辑。 */
function rerenderDirectMailComposer(): void {
  if (!state) {
    return;
  }
  lastEditorStructureKey = null;
  renderEditor(state);
}

/** addMailAttachment：执行对应的业务逻辑。 */
function addMailAttachment(scope: 'direct' | 'shortcut'): void {
/** draft：定义该变量以承载业务值。 */
  const draft = scope === 'direct' ? directMailDraft : broadcastMailDraft;
  draft.attachments.push(createDefaultMailAttachmentDraft());
  resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer();
    return;
  }
  renderShortcutMailComposer();
}

/** removeMailAttachment：执行对应的业务逻辑。 */
function removeMailAttachment(scope: 'direct' | 'shortcut', index: number): void {
/** draft：定义该变量以承载业务值。 */
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

/** sendDirectMail：执行对应的业务逻辑。 */
async function sendDirectMail(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    throw new Error('当前没有可发送邮件的角色');
  }
/** payload：定义该变量以承载业务值。 */
  const payload = getMailComposerPayload(directMailDraft);
/** result：定义该变量以承载业务值。 */
  const result = await request<{ ok: true; mailId: string }>(`/gm/players/${encodeURIComponent(detail.id)}/mail`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  directMailDraft = createDefaultMailComposerDraft();
  directMailDraftPlayerId = detail.id;
  resetMailAttachmentPageStore('direct');
  rerenderDirectMailComposer();
  setStatus(`已向 ${detail.roleName} 发送邮件：${result.mailId}`);
}

/** sendShortcutMail：执行对应的业务逻辑。 */
async function sendShortcutMail(): Promise<void> {
/** payload：定义该变量以承载业务值。 */
  const payload = getMailComposerPayload(broadcastMailDraft);
/** targetPlayerId：定义该变量以承载业务值。 */
  const targetPlayerId = broadcastMailDraft.targetPlayerId.trim();
/** path：定义该变量以承载业务值。 */
  const path = targetPlayerId
    ? `/gm/players/${encodeURIComponent(targetPlayerId)}/mail`
    : '/gm/mail/broadcast';
/** result：定义该变量以承载业务值。 */
  const result = await request<{ ok: true; mailId: string; batchId?: string; recipientCount?: number }>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
/** targetPlayer：定义该变量以承载业务值。 */
  const targetPlayer = targetPlayerId
    ? (state?.players.find((player) => player.id === targetPlayerId) ?? null)
    : null;
  broadcastMailDraft = createDefaultMailComposerDraft();
  resetMailAttachmentPageStore('shortcut');
  renderShortcutMailComposer();
  setStatus(targetPlayer
    ? `已向 ${targetPlayer.roleName} 发送邮件：${result.mailId}`
    : `已发送全服邮件批次 ${result.batchId ?? result.mailId}，覆盖 ${result.recipientCount ?? 0} 人`);
}

/** getSelectedPlayer：执行对应的业务逻辑。 */
function getSelectedPlayer(): GmManagedPlayerSummary | null {
  if (!state || !selectedPlayerId) return null;
  return state.players.find((player) => player.id === selectedPlayerId) ?? null;
}

/** getSelectedPlayerDetail：执行对应的业务逻辑。 */
function getSelectedPlayerDetail(): GmManagedPlayerRecord | null {
  return selectedPlayerDetail && selectedPlayerDetail.id === selectedPlayerId
    ? selectedPlayerDetail
    : null;
}

/** createDefaultItem：执行对应的业务逻辑。 */
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

/** createDefaultTechnique：执行对应的业务逻辑。 */
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

/** createDefaultQuest：执行对应的业务逻辑。 */
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

/** createDefaultBuff：执行对应的业务逻辑。 */
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
    realmLv: 1,
    attrs: {},
    stats: {},
  };
}

/** createDefaultPlayerSnapshot：执行对应的业务逻辑。 */
function createDefaultPlayerSnapshot(source?: PlayerState): PlayerState {
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
    baseAttrs: {
      constitution: 1,
      spirit: 1,
      perception: 1,
      talent: 1,
      comprehension: 0,
      luck: 0,
    },
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

/** readCatalogSelectValue：执行对应的业务逻辑。 */
function readCatalogSelectValue(
  kind: 'technique' | 'inventory-item' | 'equipment',
  slot?: EquipSlot,
): string {
/** selector：定义该变量以承载业务值。 */
  const selector = kind === 'equipment'
    ? `[data-catalog-select="${kind}"][data-slot="${slot}"]`
    : `[data-catalog-select="${kind}"]`;
/** field：定义该变量以承载业务值。 */
  const field = editorContentEl.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  return field?.value ?? '';
}

/** updateInventoryAddControls：执行对应的业务逻辑。 */
function updateInventoryAddControls(resetSelectedItem = true): void {
/** typeSelect：定义该变量以承载业务值。 */
  const typeSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-catalog-select="inventory-type"]');
/** itemField：定义该变量以承载业务值。 */
  const itemField = editorContentEl.querySelector<HTMLElement>('[data-item-combobox][data-item-scope="inventory-add"]');
/** itemValueField：定义该变量以承载业务值。 */
  const itemValueField = editorContentEl.querySelector<HTMLInputElement>('input[data-item-combobox-value][data-catalog-select="inventory-item"]');
  if (!typeSelect || !itemField || !itemValueField) {
    return;
  }
  typeSelect.value = currentInventoryAddType;
  itemField.dataset.placeholder = `点击后输入名称或 ID 搜索${ITEM_TYPE_LABELS[currentInventoryAddType]}模板`;
  if (resetSelectedItem) {
    itemValueField.value = '';
/** input：定义该变量以承载业务值。 */
    const input = getSearchableItemInput(itemField);
    if (input) {
      input.value = '';
    }
  }
  syncSearchableItemField(itemField);
}

/** pathSegments：执行对应的业务逻辑。 */
function pathSegments(path: string): string[] {
  return gmPureHelpers.pathSegments(path);
}

/** setValueByPath：执行对应的业务逻辑。 */
function setValueByPath(target: unknown, path: string, value: unknown): void {
  return gmPureHelpers.setValueByPath(target, path, value);
}

/** getValueByPath：执行对应的业务逻辑。 */
function getValueByPath(target: unknown, path: string): unknown {
  return gmPureHelpers.getValueByPath(target, path);
}

/** removeArrayIndex：执行对应的业务逻辑。 */
function removeArrayIndex(target: unknown, path: string, index: number): void {
  gmPureHelpers.removeArrayIndex(target, path, index);
}

/** ensureArray：执行对应的业务逻辑。 */
function ensureArray<T>(value: T[] | undefined | null): T[] {
  return gmPureHelpers.ensureArray(value);
}

/** buildHtmlAttributes：执行对应的业务逻辑。 */
function buildHtmlAttributes(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(value ?? '')}"`)
    .join('');
}

/** getSearchableItemDisplayValue：执行对应的业务逻辑。 */
function getSearchableItemDisplayValue(itemId: string): string {
  if (!itemId) {
    return '';
  }
/** entry：定义该变量以承载业务值。 */
  const entry = findItemCatalogEntry(itemId);
  return entry ? `${entry.name} · ${itemId}` : itemId;
}

/** getSearchableItemOptions：执行对应的业务逻辑。 */
function getSearchableItemOptions(scope: SearchableItemScope, slot?: EquipSlot): Array<{ value: string; label: string }> {
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

/** searchableItemField：执行对应的业务逻辑。 */
function searchableItemField(
  label: string,
  value: string,
  scope: SearchableItemScope,
  hiddenFieldAttrs: Record<string, string | undefined>,
  extraClass = '',
  slot?: EquipSlot,
  placeholder = '点击后输入名称或 ID 搜索物品模板',
/** wrapperAttrs：定义该变量以承载业务值。 */
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

/** getSearchableItemValueField：执行对应的业务逻辑。 */
function getSearchableItemValueField(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-value]');
}

/** getSearchableItemInput：执行对应的业务逻辑。 */
function getSearchableItemInput(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-input]');
}

/** getSearchableItemList：执行对应的业务逻辑。 */
function getSearchableItemList(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-list]');
}

/** getSearchableItemHint：执行对应的业务逻辑。 */
function getSearchableItemHint(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-hint]');
}

/** getSearchableItemPopover：执行对应的业务逻辑。 */
function getSearchableItemPopover(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-popover]');
}

/** normalizeSearchableItemText：执行对应的业务逻辑。 */
function normalizeSearchableItemText(value: string): string {
  return value.trim().toLowerCase();
}

/** renderSearchableItemOptions：执行对应的业务逻辑。 */
function renderSearchableItemOptions(root: HTMLElement): void {
/** input：定义该变量以承载业务值。 */
  const input = getSearchableItemInput(root);
/** valueField：定义该变量以承载业务值。 */
  const valueField = getSearchableItemValueField(root);
/** listEl：定义该变量以承载业务值。 */
  const listEl = getSearchableItemList(root);
/** hintEl：定义该变量以承载业务值。 */
  const hintEl = getSearchableItemHint(root);
  if (!input || !valueField || !listEl || !hintEl) {
    return;
  }

/** scope：定义该变量以承载业务值。 */
  const scope = (root.dataset.itemScope as SearchableItemScope | undefined) ?? 'all';
/** slot：定义该变量以承载业务值。 */
  const slot = root.dataset.slot as EquipSlot | undefined;
/** allOptions：定义该变量以承载业务值。 */
  const allOptions = getSearchableItemOptions(scope, slot);
/** selectedValue：定义该变量以承载业务值。 */
  const selectedValue = valueField.value;
/** normalizedQuery：定义该变量以承载业务值。 */
  const normalizedQuery = normalizeSearchableItemText(input.value);
/** filteredOptions：定义该变量以承载业务值。 */
  const filteredOptions = normalizedQuery.length > 0
    ? allOptions.filter((option) => normalizeSearchableItemText(`${option.label} ${option.value}`).includes(normalizedQuery))
    : allOptions;
/** visibleOptions：定义该变量以承载业务值。 */
  let visibleOptions = filteredOptions.slice(0, SEARCHABLE_ITEM_RESULT_LIMIT);

  if (selectedValue && !visibleOptions.some((option) => option.value === selectedValue)) {
/** selectedOption：定义该变量以承载业务值。 */
    const selectedOption = allOptions.find((option) => option.value === selectedValue);
    if (selectedOption && (normalizedQuery.length === 0 || normalizeSearchableItemText(`${selectedOption.label} ${selectedOption.value}`).includes(normalizedQuery))) {
      visibleOptions = [selectedOption, ...visibleOptions.slice(0, Math.max(0, SEARCHABLE_ITEM_RESULT_LIMIT - 1))];
    }
  }

/** renderedOptions：定义该变量以承载业务值。 */
  const renderedOptions = normalizedQuery.length === 0
    ? [{ value: '', label: '清空选择' }, ...visibleOptions]
    : visibleOptions;
/** defaultActiveIndex：定义该变量以承载业务值。 */
  const defaultActiveIndex = renderedOptions.findIndex((option) => option.value === selectedValue);
/** fallbackActiveIndex：定义该变量以承载业务值。 */
  const fallbackActiveIndex = renderedOptions.findIndex((option) => option.value !== '');
/** initialActiveIndex：定义该变量以承载业务值。 */
  const initialActiveIndex = defaultActiveIndex >= 0
    ? defaultActiveIndex
    : Math.max(0, fallbackActiveIndex >= 0 ? fallbackActiveIndex : 0);
/** storedActiveIndex：定义该变量以承载业务值。 */
  const storedActiveIndex = Number(root.dataset.activeIndex ?? '-1');
/** activeIndex：定义该变量以承载业务值。 */
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

/** syncSearchableItemField：执行对应的业务逻辑。 */
function syncSearchableItemField(root: HTMLElement): void {
/** input：定义该变量以承载业务值。 */
  const input = getSearchableItemInput(root);
/** valueField：定义该变量以承载业务值。 */
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

/** syncSearchableItemFields：执行对应的业务逻辑。 */
function syncSearchableItemFields(scope: ParentNode): void {
  if (activeSearchableItemField && !activeSearchableItemField.isConnected) {
    activeSearchableItemField = null;
  }
  scope.querySelectorAll<HTMLElement>('[data-item-combobox]').forEach((field) => {
    syncSearchableItemField(field);
  });
}

/** closeSearchableItemField：执行对应的业务逻辑。 */
function closeSearchableItemField(root: HTMLElement): void {
  if (activeSearchableItemField === root) {
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

/** openSearchableItemField：执行对应的业务逻辑。 */
function openSearchableItemField(root: HTMLElement, resetQuery = true): void {
  if (activeSearchableItemField && activeSearchableItemField !== root) {
    closeSearchableItemField(activeSearchableItemField);
  }
/** input：定义该变量以承载业务值。 */
  const input = getSearchableItemInput(root);
/** valueField：定义该变量以承载业务值。 */
  const valueField = getSearchableItemValueField(root);
  if (!input || !valueField) {
    return;
  }
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

/** moveSearchableItemActiveIndex：执行对应的业务逻辑。 */
function moveSearchableItemActiveIndex(root: HTMLElement, offset: number): void {
/** listEl：定义该变量以承载业务值。 */
  const listEl = getSearchableItemList(root);
  if (!listEl) {
    return;
  }
/** optionButtons：定义该变量以承载业务值。 */
  const optionButtons = Array.from(listEl.querySelectorAll<HTMLButtonElement>('[data-item-option-value]'));
  if (optionButtons.length === 0) {
    return;
  }
/** currentIndex：定义该变量以承载业务值。 */
  const currentIndex = Number(root.dataset.activeIndex ?? '-1');
/** nextIndex：定义该变量以承载业务值。 */
  const nextIndex = currentIndex >= 0
    ? Math.min(optionButtons.length - 1, Math.max(0, currentIndex + offset))
    : Math.max(0, Math.min(optionButtons.length - 1, offset > 0 ? 0 : optionButtons.length - 1));
  root.dataset.activeIndex = String(nextIndex);
  renderSearchableItemOptions(root);
}

/** commitSearchableItemSelection：执行对应的业务逻辑。 */
function commitSearchableItemSelection(root: HTMLElement, value: string): void {
/** input：定义该变量以承载业务值。 */
  const input = getSearchableItemInput(root);
/** valueField：定义该变量以承载业务值。 */
  const valueField = getSearchableItemValueField(root);
  if (!input || !valueField) {
    return;
  }
/** changed：定义该变量以承载业务值。 */
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

/** flushBlockedEditorRender：执行对应的业务逻辑。 */
function flushBlockedEditorRender(): void {
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
  editorRenderRefreshBlocked = false;
  lastEditorStructureKey = null;
  renderEditor(state);
}

/** optionsMarkup：执行对应的业务逻辑。 */
function optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string {
  return options.map((option) => `
    <option value="${escapeHtml(String(option.value))}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

/** textField：执行对应的业务逻辑。 */
function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

/** nullableTextField：执行对应的业务逻辑。 */
function nullableTextField(label: string, path: string, value: string | undefined, emptyMode: 'undefined' | 'null' = 'undefined', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="nullable-string" data-empty-mode="${emptyMode}" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

/** numberField：执行对应的业务逻辑。 */
function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-bind="${escapeHtml(path)}" data-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}

/** checkboxField：执行对应的业务逻辑。 */
function checkboxField(label: string, path: string, checked: boolean | undefined): string {
  return `
    <label class="editor-toggle">
      <input type="checkbox" data-bind="${escapeHtml(path)}" data-kind="boolean" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

/** selectField：执行对应的业务逻辑。 */
function selectField(
  label: string,
  path: string,
  value: string | number | undefined,
/** options：定义该变量以承载业务值。 */
  options: Array<{ value: string | number; label: string }>,
  extraClass = '',
): string {
/** selected：定义该变量以承载业务值。 */
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

/** jsonField：执行对应的业务逻辑。 */
function jsonField(label: string, path: string, value: unknown, emptyValue: 'null' | 'object' | 'array' = 'object', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="json" data-empty-json="${emptyValue}">${escapeHtml(formatJson(value ?? (emptyValue === 'array' ? [] : emptyValue === 'null' ? null : {})))}</textarea>
    </label>
  `;
}

/** stringArrayField：执行对应的业务逻辑。 */
function stringArrayField(label: string, path: string, value: string[] | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}<span class="editor-section-note"> 每行一项</span></span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="string-array">${escapeHtml((value ?? []).join('\n'))}</textarea>
    </label>
  `;
}

/** readonlyCodeBlock：执行对应的业务逻辑。 */
function readonlyCodeBlock(title: string, path: string, value: unknown): string {
  return `
    <div class="editor-field wide">
      <span>${escapeHtml(title)}</span>
      <div class="editor-code" data-preview="readonly" data-path="${escapeHtml(path)}">${escapeHtml(formatJson(value))}</div>
    </div>
  `;
}

/** renderEditorTabSection：执行对应的业务逻辑。 */
function renderEditorTabSection(tab: GmEditorTab, content: string): string {
  return `<div data-editor-tab="${tab}">${content}</div>`;
}

/** renderVisualEditor：执行对应的业务逻辑。 */
function renderVisualEditor(player: GmManagedPlayerRecord, draft: PlayerState): string {
/** mapIds：定义该变量以承载业务值。 */
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort();
/** equipment：定义该变量以承载业务值。 */
  const equipment = draft.equipment as EquipmentSlots;
/** bonuses：定义该变量以承载业务值。 */
  const bonuses = ensureArray(draft.bonuses);
/** buffs：定义该变量以承载业务值。 */
  const buffs = ensureArray(draft.temporaryBuffs);
/** autoBattleSkills：定义该变量以承载业务值。 */
  const autoBattleSkills = ensureArray(draft.autoBattleSkills);
/** techniques：定义该变量以承载业务值。 */
  const techniques = ensureArray(draft.techniques);
/** quests：定义该变量以承载业务值。 */
  const quests = ensureArray(draft.quests);
/** inventoryItems：定义该变量以承载业务值。 */
  const inventoryItems = ensureArray(draft.inventory.items);
/** account：定义该变量以承载业务值。 */
  const account = player.account;

/** equipmentMarkup：定义该变量以承载业务值。 */
  const equipmentMarkup = EQUIP_SLOTS.map((slot) => {
/** item：定义该变量以承载业务值。 */
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
              : `<button class="small-btn" type="button" data-action="create-equip-from-catalog" data-slot="${slot}">加入槽位</button>`}
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

/** bonusMarkup：定义该变量以承载业务值。 */
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

/** buffMarkup：定义该变量以承载业务值。 */
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

/** inventoryMarkup：定义该变量以承载业务值。 */
  const inventoryMarkup = inventoryItems.length > 0
    ? inventoryItems.map((item, index) => getCompactInventoryItemMarkup(item, index)).join('')
    : '<div class="editor-note">背包为空。</div>';

/** autoBattleMarkup：定义该变量以承载业务值。 */
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

/** techniqueMarkup：定义该变量以承载业务值。 */
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

/** questMarkup：定义该变量以承载业务值。 */
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
          <div class="editor-section-note">这里展示账号主键、注册时间、在线状态和累计在线时长，密码修改也统一在这里做。</div>
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
          <span>在线状态</span>
          <div class="editor-code">${escapeHtml(getManagedAccountStatusLabel(player))}</div>
        </div>
        <div class="editor-field">
          <span>账号状态</span>
          <div class="editor-code">${escapeHtml(getManagedAccountRestrictionLabel(account))}</div>
        </div>
        <div class="editor-field">
          <span>上次在线时间</span>
          <div class="editor-code">${escapeHtml(formatDateTime(player.meta.lastHeartbeatAt))}</div>
        </div>
        <div class="editor-field">
          <span>累计在线时间</span>
          <div class="editor-code">${escapeHtml(formatDurationSeconds(account.totalOnlineSeconds))}</div>
        </div>
        <div class="editor-field wide">
          <span>封禁时间</span>
          <div class="editor-code">${escapeHtml(formatDateTime(account.bannedAt))}</div>
        </div>
        <div class="editor-field wide">
          <span>当前封禁原因</span>
          <div class="editor-code">${escapeHtml(account.banReason?.trim() || '无')}</div>
        </div>
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        <label class="editor-field">
          <span>新密码</span>
          <input id="player-password-next" type="text" autocomplete="off" spellcheck="false" placeholder="输入新的账号密码" />
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
          <input id="player-account-ban-reason" type="text" autocomplete="off" spellcheck="false" placeholder="可直接点上面的快速原因，也可以自定义输入" />
        </label>
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-action="save-player-account">修改账号</button>
        <button class="small-btn" type="button" data-action="save-player-password">修改账号密码</button>
        <button class="small-btn danger" type="button" data-action="ban-player-account" ${account.status === 'banned' ? 'disabled' : ''}>快捷封号</button>
        <button class="small-btn" type="button" data-action="unban-player-account" ${account.status !== 'banned' ? 'disabled' : ''}>快捷解封</button>
      </div>
      <div class="editor-note">密码只会提交到服务端，并由服务端写入 bcrypt 哈希，不会以明文落库。封号会立即阻止登录、刷新与重连；如果目标当前在世界中，会被立刻踢下线并移出世界。建议填写封禁原因，便于后续排查小号链路。</div>
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
      </div>
      <div class="editor-stat-grid" style="margin-top: 10px;">
        ${ATTR_KEYS.map((key) => numberField(ATTR_KEY_LABELS[key], `baseAttrs.${key}`, draft.baseAttrs[key])).join('')}
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
        ${readonlyCodeBlock('最终属性', 'finalAttrs', draft.finalAttrs ?? {})}
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
          <button class="small-btn" type="button" data-action="add-buff">新增 Buff</button>
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
            <select data-catalog-select="technique">
              <option value="">选择功法模板</option>
              ${optionsMarkup(getTechniqueCatalogOptions(), '')}
            </select>
          </label>
          <button class="small-btn" type="button" data-action="add-technique-from-catalog">加入角色</button>
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
            <button class="small-btn" type="button" data-action="grant-all-unlearned-technique-books">加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">当前全部功法满级</div>
              <div class="editor-card-meta">按编辑目录模板把当前已学功法统一拉到最高层级。</div>
            </div>
            <button class="small-btn" type="button" data-action="max-all-techniques">立即满级</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">学习全部功法</div>
              <div class="editor-card-meta">把当前目录里尚未学会的功法全部写入角色。</div>
            </div>
            <button class="small-btn primary" type="button" data-action="learn-all-techniques">全部学习</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">移除所有功法</div>
              <div class="editor-card-meta">清空当前角色已学功法，并移除主修功法与自动战斗技能引用。</div>
            </div>
            <button class="small-btn danger" type="button" data-action="remove-all-techniques">全部移除</button>
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
            <select data-catalog-select="inventory-type">
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
          <button class="small-btn" type="button" data-action="add-inventory-item-from-catalog">加入背包</button>
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
  `;
}

/** renderSummary：执行对应的业务逻辑。 */
function renderSummary(data: GmStateRes): void {
/** elapsedSec：定义该变量以承载业务值。 */
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
/** startedAt：定义该变量以承载业务值。 */
  const startedAt = data.perf.networkStatsStartedAt > 0 ? new Date(data.perf.networkStatsStartedAt) : null;
/** tickPerf：定义该变量以承载业务值。 */
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
  cpuRssMemoryEl.textContent = `${Math.round(data.perf.cpu.rssMb)} MB`;
  cpuHeapUsedEl.textContent = `${Math.round(data.perf.cpu.heapUsedMb)} MB`;
  cpuHeapTotalEl.textContent = `${Math.round(data.perf.cpu.heapTotalMb)} MB`;
  cpuExternalMemoryEl.textContent = `${Math.round(data.perf.cpu.externalMb)} MB`;
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

/** renderPlayerPageMeta：执行对应的业务逻辑。 */
function renderPlayerPageMeta(data: GmStateRes): void {
  playerPageMetaEl.textContent = `第 ${data.playerPage.page} / ${data.playerPage.totalPages} 页 · 共 ${data.playerPage.total} 条`;
  playerPrevPageBtn.disabled = data.playerPage.page <= 1;
  playerNextPageBtn.disabled = data.playerPage.page >= data.playerPage.totalPages;
}

/** renderPlayerList：执行对应的业务逻辑。 */
function renderPlayerList(data: GmStateRes): void {
/** filtered：定义该变量以承载业务值。 */
  const filtered = getFilteredPlayers(data);

  if (!selectedPlayerId || !filtered.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = filtered[0]?.id ?? data.players[0]?.id ?? null;
  }

  if (filtered.length === 0) {
    if (lastPlayerListStructureKey !== 'empty') {
      playerListEl.innerHTML = '<div class="empty-hint">没有符合筛选条件的角色。</div>';
      lastPlayerListStructureKey = 'empty';
    }
    renderPlayerPageMeta(data);
    return;
  }

/** structureKey：定义该变量以承载业务值。 */
  const structureKey = filtered.map((player) => player.id).join('|');
  if (lastPlayerListStructureKey !== structureKey) {
    playerListEl.innerHTML = filtered.map((player) => getPlayerRowMarkup(player)).join('');
    lastPlayerListStructureKey = structureKey;
  }

  filtered.forEach((player, index) => {
/** row：定义该变量以承载业务值。 */
    const row = playerListEl.children[index];
    if (!(row instanceof HTMLButtonElement)) {
      return;
    }
    patchPlayerRow(row, player, player.id === selectedPlayerId);
  });
  renderPlayerPageMeta(data);
}

/** renderEditor：执行对应的业务逻辑。 */
function renderEditor(data: GmStateRes): void {
/** selected：定义该变量以承载业务值。 */
  const selected = data.players.find((player) => player.id === selectedPlayerId) ?? null;
  if (!selected) {
    editorEmptyEl.classList.remove('hidden');
    editorPanelEl.classList.add('hidden');
    draftSnapshot = null;
    draftSourcePlayerId = null;
    selectedPlayerDetail = null;
    loadingPlayerDetailId = null;
    playerJsonEl.value = '';
    playerPersistedJsonEl.value = '';
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    editorEmptyEl.classList.remove('hidden');
    editorEmptyEl.textContent = loadingPlayerDetailId === selected.id ? '正在加载角色详情…' : '当前角色详情暂不可用。';
    editorPanelEl.classList.add('hidden');
    playerJsonEl.value = '';
    playerPersistedJsonEl.value = '';
    savePlayerBtn.disabled = true;
    refreshPlayerBtn.disabled = true;
    openPlayerMailBtn.disabled = true;
    removeBotBtn.style.display = 'none';
    removeBotBtn.disabled = true;
    clearEditorRenderCache();
    return;
  }

  if (!draftSnapshot || draftSourcePlayerId !== detail.id || !editorDirty) {
    draftSnapshot = createDefaultPlayerSnapshot(detail.snapshot);
    draftSourcePlayerId = detail.id;
    editorDirty = false;
  }

  editorEmptyEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');
  ensureDirectMailDraft(detail.id);

  editorTitleEl.textContent = detail.roleName;
  editorSubtitleEl.textContent = getEditorSubtitle(detail);
  editorMetaEl.innerHTML = getEditorMetaMarkup(detail);

/** structureKey：定义该变量以承载业务值。 */
  const structureKey = buildEditorStructureKey(detail, draftSnapshot);
/** shouldDelayStructureRefresh：定义该变量以承载业务值。 */
  const shouldDelayStructureRefresh = (
    lastEditorStructureKey !== structureKey
    && draftSourcePlayerId === detail.id
    && !!activeSearchableItemField
    && activeSearchableItemField.isConnected
    && editorContentEl.contains(activeSearchableItemField)
    && activeSearchableItemField.dataset.open === 'true'
  );
  if (shouldDelayStructureRefresh) {
    editorRenderRefreshBlocked = true;
    return;
  }
  editorRenderRefreshBlocked = false;
  if (lastEditorStructureKey !== structureKey) {
    editorContentEl.innerHTML = renderVisualEditor(detail, draftSnapshot);
    lastEditorStructureKey = structureKey;
  } else {
    if (!editorDirty) {
      syncVisualEditorFieldsFromDraft(draftSnapshot);
    }
    patchEditorPreview(detail, draftSnapshot);
  }
  updateInventoryAddControls(false);
  syncSearchableItemFields(editorContentEl);

  setTextLikeValue(playerJsonEl, formatJson(draftSnapshot));
  setTextLikeValue(playerPersistedJsonEl, formatJson(detail.persistedSnapshot));
  switchEditorTab(currentEditorTab);
  refreshPlayerBtn.disabled = false;
  openPlayerMailBtn.disabled = false;

  removeBotBtn.style.display = detail.meta.isBot ? '' : 'none';
  removeBotBtn.disabled = !detail.meta.isBot;
}

/** render：执行对应的业务逻辑。 */
function render(): void {
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

/** getEditorTabSection：执行对应的业务逻辑。 */
function getEditorTabSection(tab: GmEditorTab): HTMLElement | null {
  return editorContentEl.querySelector<HTMLElement>(`[data-editor-tab="${tab}"]`);
}

/** syncVisualEditorToDraft：执行对应的业务逻辑。 */
function syncVisualEditorToDraft(scope?: ParentNode): { ok: true } | { ok: false; message: string } {
  if (!draftSnapshot) {
    return { ok: false, message: '当前没有可编辑角色' };
  }

/** next：定义该变量以承载业务值。 */
  const next = clone(draftSnapshot);
/** fields：定义该变量以承载业务值。 */
  const fields = (scope ?? editorContentEl).querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');

  for (const field of fields) {
    const path = field.dataset.bind;
    const kind = field.dataset.kind;
    if (!path || !kind) continue;

/** value：定义该变量以承载业务值。 */
    let value: unknown;
    if (kind === 'boolean' && field instanceof HTMLInputElement) {
      value = field.checked;
    } else if (kind === 'number') {
      value = Math.floor(Number(field.value || '0'));
      if (!Number.isFinite(value)) {
        return { ok: false, message: `${path} 不是合法数字` };
      }
    } else if (kind === 'nullable-string') {
/** text：定义该变量以承载业务值。 */
      const text = field.value.trim();
/** emptyMode：定义该变量以承载业务值。 */
      const emptyMode = field.dataset.emptyMode;
      value = text.length > 0 ? text : emptyMode === 'null' ? null : undefined;
    } else if (kind === 'string-array') {
      value = field.value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (kind === 'json') {
/** text：定义该变量以承载业务值。 */
      const text = field.value.trim();
      if (!text) {
/** emptyJson：定义该变量以承载业务值。 */
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

  draftSnapshot = next;
  editorDirty = true;
  playerJsonEl.value = formatJson(draftSnapshot);
  return { ok: true };
}

/** mutateDraft：执行对应的业务逻辑。 */
function mutateDraft(mutator: (draft: PlayerState) => void): boolean {
/** synced：定义该变量以承载业务值。 */
  const synced = syncVisualEditorToDraft(getEditorTabSection(currentEditorTab) ?? undefined);
  if (!synced.ok) {
    setStatus(synced.message, true);
    return false;
  }
  if (!draftSnapshot || !state) return false;
  mutator(draftSnapshot);
  editorDirty = true;
  renderEditor(state);
  return true;
}

/** applyCatalogBindingChange：执行对应的业务逻辑。 */
function applyCatalogBindingChange(path: string, value: string): boolean {
  if (!draftSnapshot) return false;

/** changed：定义该变量以承载业务值。 */
  let changed = false;
/** inventoryMatch：定义该变量以承载业务值。 */
  const inventoryMatch = path.match(/^inventory\.items\.(\d+)\.itemId$/);
  if (inventoryMatch) {
/** index：定义该变量以承载业务值。 */
    const index = Number(inventoryMatch[1]);
/** previousCount：定义该变量以承载业务值。 */
    const previousCount = draftSnapshot.inventory.items[index]?.count ?? 1;
    draftSnapshot.inventory.items[index] = createItemFromCatalog(value, previousCount);
    changed = true;
  }

/** equipmentMatch：定义该变量以承载业务值。 */
  const equipmentMatch = path.match(/^equipment\.(weapon|head|body|legs|accessory)\.itemId$/);
  if (equipmentMatch) {
/** slot：定义该变量以承载业务值。 */
    const slot = equipmentMatch[1] as EquipSlot;
    draftSnapshot.equipment[slot] = createItemFromCatalog(value);
    changed = true;
  }

/** techniqueMatch：定义该变量以承载业务值。 */
  const techniqueMatch = path.match(/^techniques\.(\d+)\.techId$/);
  if (techniqueMatch) {
/** index：定义该变量以承载业务值。 */
    const index = Number(techniqueMatch[1]);
    draftSnapshot.techniques[index] = createTechniqueFromCatalog(value);
    changed = true;
  }

/** buffMatch：定义该变量以承载业务值。 */
  const buffMatch = path.match(/^temporaryBuffs\.(\d+)\.buffId$/);
  if (buffMatch) {
/** index：定义该变量以承载业务值。 */
    const index = Number(buffMatch[1]);
/** previous：定义该变量以承载业务值。 */
    const previous = draftSnapshot.temporaryBuffs?.[index];
    draftSnapshot.temporaryBuffs ??= [];
    draftSnapshot.temporaryBuffs[index] = createBuffFromCatalog(value, {
      stacks: previous?.stacks ?? 1,
      remainingTicks: previous?.remainingTicks ?? 1,
    });
    changed = true;
  }

  if (path === 'cultivatingTechId' && !value) {
    draftSnapshot.cultivatingTechId = undefined;
    changed = true;
  }

  if (!changed) {
    return false;
  }
  editorDirty = true;
  lastEditorStructureKey = null;
  if (state) {
    renderEditor(state);
  }
  return true;
}

/** loadState：执行对应的业务逻辑。 */
async function loadState(silent = false, refreshDetail = false): Promise<void> {
  if (!token) return;
/** params：定义该变量以承载业务值。 */
  const params = new URLSearchParams({
    page: String(currentPlayerPage),
    pageSize: '50',
    sort: currentPlayerSort,
    presence: currentPlayerPresenceFilter,
    behavior: currentPlayerBehaviorFilter,
    accountStatus: currentPlayerAccountStatusFilter,
  });
/** keyword：定义该变量以承载业务值。 */
  const keyword = playerSearchInput.value.trim();
  if (keyword) {
    params.set('keyword', keyword);
  }
/** data：定义该变量以承载业务值。 */
  const data = await request<GmStateRes>(`/gm/state?${params.toString()}`);
  state = data;
  currentPlayerPage = data.playerPage.page;
  currentPlayerTotalPages = data.playerPage.totalPages;
/** previousSelectedPlayerId：定义该变量以承载业务值。 */
  const previousSelectedPlayerId = selectedPlayerId;
  if (!selectedPlayerId || !data.players.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = data.players[0]?.id ?? null;
    if (selectedPlayerDetail?.id !== selectedPlayerId) {
      selectedPlayerDetail = null;
    }
  }
  render();
/** shouldLoadDetail：定义该变量以承载业务值。 */
  const shouldLoadDetail = !!selectedPlayerId && (
    refreshDetail
    || selectedPlayerId !== previousSelectedPlayerId
    || selectedPlayerDetail?.id !== selectedPlayerId
  );
  if (shouldLoadDetail && selectedPlayerId) {
    await loadSelectedPlayerDetail(selectedPlayerId, true);
  } else if (!selectedPlayerId) {
    selectedPlayerDetail = null;
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

/** loadSelectedPlayerDetail：执行对应的业务逻辑。 */
async function loadSelectedPlayerDetail(playerId: string, silent = false): Promise<void> {
/** nonce：定义该变量以承载业务值。 */
  const nonce = ++detailRequestNonce;
  loadingPlayerDetailId = playerId;
  clearEditorRenderCache();
  render();
  try {
/** data：定义该变量以承载业务值。 */
    const data = await request<GmPlayerDetailRes>(`/gm/players/${encodeURIComponent(playerId)}`);
    if (nonce !== detailRequestNonce || selectedPlayerId !== playerId) {
      return;
    }
    selectedPlayerDetail = data.player;
    if (!silent) {
      setStatus(`已加载 ${data.player.name} 的角色详情`);
    }
  } finally {
    if (nonce === detailRequestNonce && loadingPlayerDetailId === playerId) {
      loadingPlayerDetailId = null;
    }
    render();
  }
}

/** startPolling：执行对应的业务逻辑。 */
function startPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(() => {
    loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '刷新失败', true);
    });
  }, GM_PANEL_POLL_INTERVAL_MS);
}

/** showShell：执行对应的业务逻辑。 */
function showShell(): void {
  loginOverlay.classList.add('hidden');
  gmShell.classList.remove('hidden');
}

/** showLogin：执行对应的业务逻辑。 */
function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  gmShell.classList.add('hidden');
  syncPersistedGmPasswordToInputs();
}

/** logout：执行对应的业务逻辑。 */
function logout(message?: string): void {
  token = '';
  state = null;
  databaseState = null;
  databaseStateLoading = false;
  redeemGroupsState = [];
  selectedRedeemGroupId = null;
  redeemGroupDetailState = null;
  redeemDraft = createDefaultRedeemGroupDraft();
  redeemLatestGeneratedCodes = [];
  redeemLoading = false;
  selectedPlayerId = null;
  selectedPlayerDetail = null;
  loadingPlayerDetailId = null;
  draftSnapshot = null;
  editorDirty = false;
  draftSourcePlayerId = null;
  ensureDirectMailDraft(null);
  broadcastMailDraft = createDefaultMailComposerDraft();
  resetMailAttachmentPageStore('shortcut');
  sessionStorage.removeItem(GM_ACCESS_TOKEN_STORAGE_KEY);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (suggestionSearchTimer !== null) {
    window.clearTimeout(suggestionSearchTimer);
    suggestionSearchTimer = null;
  }
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
    playerSearchTimer = null;
  }
  playerListEl.innerHTML = '';
  lastPlayerListStructureKey = null;
  clearEditorRenderCache();
  lastSuggestionStructureKey = null;
  currentSuggestionPage = 1;
  currentSuggestionTotalPages = 1;
  currentSuggestionTotal = 0;
  currentSuggestionKeyword = '';
  suggestionSearchInput.value = '';
  suggestionPageMetaEl.textContent = '第 1 / 1 页';
  suggestionPrevPageBtn.disabled = true;
  suggestionNextPageBtn.disabled = true;
  currentPlayerPage = 1;
  currentPlayerTotalPages = 1;
  playerSearchInput.value = '';
  playerPageMetaEl.textContent = '第 1 / 1 页 · 共 0 条';
  playerPrevPageBtn.disabled = true;
  playerNextPageBtn.disabled = true;
  lastNetworkInStructureKey = null;
  lastNetworkOutStructureKey = null;
  lastCpuBreakdownStructureKey = null;
  suggestionListEl.innerHTML = '';
  summaryNetInBreakdownEl.innerHTML = '';
  summaryNetOutBreakdownEl.innerHTML = '';
  cpuBreakdownListEl.innerHTML = '';
  playerJsonEl.value = '';
  playerPersistedJsonEl.value = '';
  worldViewer.stopPolling();
  renderShortcutMailComposer();
  switchTab('server');
  switchEditorTab('basic');
  loginErrorEl.textContent = message ?? '';
  setStatus('');
  showLogin();
}

/** delayRefresh：执行对应的业务逻辑。 */
async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, GM_APPLY_DELAY_MS));
  await loadState(true, true);
  setStatus(`${message}，已完成同步`);
}

/** login：执行对应的业务逻辑。 */
async function login(): Promise<void> {
/** password：定义该变量以承载业务值。 */
  const password = passwordInput.value.trim();
  if (!password) {
    loginErrorEl.textContent = '请输入 GM 密码';
    return;
  }

  loginSubmitBtn.disabled = true;
  loginErrorEl.textContent = '';

  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmLoginRes>('/auth/gm/login', {
      method: 'POST',
      body: JSON.stringify({ password } satisfies GmLoginReq),
    });
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

/** changeGmPassword：执行对应的业务逻辑。 */
async function changeGmPassword(): Promise<void> {
/** currentPassword：定义该变量以承载业务值。 */
  const currentPassword = gmPasswordCurrentInput.value.trim();
/** newPassword：定义该变量以承载业务值。 */
  const newPassword = gmPasswordNextInput.value.trim();
  if (!currentPassword || !newPassword) {
    setStatus('请填写当前密码和新密码', true);
    return;
  }

  gmPasswordSaveBtn.disabled = true;
  try {
    await request<BasicOkRes>('/auth/gm/password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      } satisfies GmChangePasswordReq),
    });
    persistGmPassword(newPassword);
/** persistedPassword：定义该变量以承载业务值。 */
    const persistedPassword = readPersistedGmPassword();
    passwordInput.value = persistedPassword;
    gmPasswordCurrentInput.value = persistedPassword;
    gmPasswordNextInput.value = '';
    setStatus('GM 密码已更新');
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : 'GM 密码修改失败', true);
  } finally {
    gmPasswordSaveBtn.disabled = false;
  }
}

/** applyRawJson：执行对应的业务逻辑。 */
async function applyRawJson(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  try {
    draftSnapshot = JSON.parse(playerJsonEl.value) as PlayerState;
    draftSourcePlayerId = selected.id;
    editorDirty = true;
    lastEditorStructureKey = null;
    renderEditor(state!);
    switchEditorTab('basic');
    setStatus('原始 JSON 已应用到可视化编辑区');
  } catch {
    setStatus('原始 JSON 解析失败', true);
  }
}

/** getCurrentEditorSaveSection：执行对应的业务逻辑。 */
function getCurrentEditorSaveSection(): GmPlayerUpdateSection | null {
  return currentEditorTab === 'persisted' || currentEditorTab === 'mail' || currentEditorTab === 'shortcuts' ? null : currentEditorTab;
}

/** buildTechniqueSaveSnapshot：执行对应的业务逻辑。 */
function buildTechniqueSaveSnapshot(technique: TechniqueState): TechniqueState {
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

/** buildInventoryItemSaveSnapshot：执行对应的业务逻辑。 */
function buildInventoryItemSaveSnapshot(item: ItemStack): ItemStack {
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

/** buildEquipmentItemSaveSnapshot：执行对应的业务逻辑。 */
function buildEquipmentItemSaveSnapshot(item: ItemStack | null): ItemStack | null {
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

/** buildSectionSnapshot：执行对应的业务逻辑。 */
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
/** realm：定义该变量以承载业务值。 */
        realm: typeof draft.realm?.progress === 'number'
          ? { progress: draft.realm.progress } as PlayerState['realm']
          : undefined,
        foundation: draft.foundation,
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

/** saveSelectedPlayerSections：执行对应的业务逻辑。 */
async function saveSelectedPlayerSections(sections: GmPlayerUpdateSection[], message: string): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected || !draftSnapshot) {
    setStatus('请先选择角色', true);
    return;
  }
/** uniqueSections：定义该变量以承载业务值。 */
  const uniqueSections = Array.from(new Set(sections));
  if (uniqueSections.length === 0) {
    setStatus('当前没有需要提交的快捷改动', true);
    return;
  }
  setPendingStatus(`正在提交 ${selected.name} 的快捷修改...`);
  for (const section of uniqueSections) {
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
  }
  editorDirty = false;
  await delayRefresh(message);
}

/** setSelectedPlayerBodyTrainingLevel：执行对应的业务逻辑。 */
async function setSelectedPlayerBodyTrainingLevel(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus('请先选择角色', true);
    return;
  }

/** input：定义该变量以承载业务值。 */
  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-body-training-level');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="set-body-training-level"]');
/** rawValue：定义该变量以承载业务值。 */
  const rawValue = input?.value.trim() ?? '';
/** level：定义该变量以承载业务值。 */
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
    await request<BasicOkRes>(`/gm/players/${encodeURIComponent(detail.id)}/body-training/level`, {
      method: 'POST',
      body: JSON.stringify({ level } satisfies GmSetPlayerBodyTrainingLevelReq),
    });
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的炼体等级设置为 ${level} 层`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '设置炼体等级失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerFoundation：执行对应的业务逻辑。 */
async function addSelectedPlayerFoundation(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus('请先选择角色', true);
    return;
  }

/** input：定义该变量以承载业务值。 */
  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-foundation-amount');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-foundation"]');
/** rawValue：定义该变量以承载业务值。 */
  const rawValue = input?.value.trim() ?? '';
/** isInteger：定义该变量以承载业务值。 */
  const isInteger = /^-?\d+$/.test(rawValue);
/** amount：定义该变量以承载业务值。 */
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
    await request<BasicOkRes>(`/gm/players/${encodeURIComponent(detail.id)}/foundation/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerFoundationReq),
    });
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的底蕴调整 ${amount > 0 ? '+' : ''}${amount}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '调整底蕴失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addSelectedPlayerCombatExp：执行对应的业务逻辑。 */
async function addSelectedPlayerCombatExp(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    setStatus('请先选择角色', true);
    return;
  }

/** input：定义该变量以承载业务值。 */
  const input = editorContentEl.querySelector<HTMLInputElement>('#shortcut-combat-exp-amount');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="add-combat-exp"]');
/** rawValue：定义该变量以承载业务值。 */
  const rawValue = input?.value.trim() ?? '';
/** isInteger：定义该变量以承载业务值。 */
  const isInteger = /^-?\d+$/.test(rawValue);
/** amount：定义该变量以承载业务值。 */
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
    await request<BasicOkRes>(`/gm/players/${encodeURIComponent(detail.id)}/combat-exp/add`, {
      method: 'POST',
      body: JSON.stringify({ amount } satisfies GmAddPlayerCombatExpReq),
    });
    editorDirty = false;
    await delayRefresh(`已将 ${detail.name} 的战斗经验调整 ${amount > 0 ? '+' : ''}${amount}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '调整战斗经验失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** runPlayerTechniqueShortcut：执行对应的业务逻辑。 */
async function runPlayerTechniqueShortcut(
  action: 'grant-all-unlearned-technique-books' | 'max-all-techniques' | 'learn-all-techniques' | 'remove-all-techniques',
): Promise<void> {
  if (!draftSnapshot) {
    setStatus('当前没有可编辑角色', true);
    return;
  }

  if (!editorCatalog) {
    setStatus('编辑目录尚未加载完成，暂时无法执行快捷操作', true);
    return;
  }

  if (action === 'grant-all-unlearned-technique-books') {
/** learnedTechniqueIds：定义该变量以承载业务值。 */
    const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
/** existingInventoryItemIds：定义该变量以承载业务值。 */
    const existingInventoryItemIds = new Set(ensureArray(draftSnapshot.inventory.items).map((item) => item.itemId));
/** bookItemIds：定义该变量以承载业务值。 */
    const bookItemIds = editorCatalog.items
      .filter((item) => item.type === 'skill_book')
      .map((item) => item.itemId)
      .filter((itemId) => {
/** techniqueId：定义该变量以承载业务值。 */
        const techniqueId = resolveTechniqueIdFromBookItemId(itemId);
        return !!techniqueId && !learnedTechniqueIds.has(techniqueId) && !existingInventoryItemIds.has(itemId);
      });
    if (bookItemIds.length === 0) {
      setStatus('当前没有可补发的未学习功法书');
      return;
    }
/** changed：定义该变量以承载业务值。 */
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
/** techniques：定义该变量以承载业务值。 */
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus('当前角色还没有已学习功法');
      return;
    }
/** upgradableCount：定义该变量以承载业务值。 */
    const upgradableCount = techniques.filter((technique) => technique.level < getTechniqueTemplateMaxLevel(technique) || technique.expToNext !== 0).length;
    if (upgradableCount === 0) {
      setStatus('当前全部功法已经处于满级状态');
      return;
    }
/** changed：定义该变量以承载业务值。 */
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
/** techniques：定义该变量以承载业务值。 */
    const techniques = ensureArray(draftSnapshot.techniques);
    if (techniques.length === 0) {
      setStatus('当前角色没有可移除的已学功法');
      return;
    }
/** changed：定义该变量以承载业务值。 */
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

/** learnedTechniqueIds：定义该变量以承载业务值。 */
  const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
/** missingTechniqueIds：定义该变量以承载业务值。 */
  const missingTechniqueIds = editorCatalog.techniques
    .map((technique) => technique.id)
    .filter((techId) => !learnedTechniqueIds.has(techId));
  if (missingTechniqueIds.length === 0) {
    setStatus('当前角色已经学会目录内全部功法');
    return;
  }
/** changed：定义该变量以承载业务值。 */
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

/** openSelectedPlayerMailTab：执行对应的业务逻辑。 */
function openSelectedPlayerMailTab(): void {
  if (!selectedPlayerId) {
    setStatus('请先选择角色', true);
    return;
  }
  if (currentTab !== 'players') {
    switchTab('players');
  }
  switchEditorTab('mail');
}

/** refreshSelectedPlayer：执行对应的业务逻辑。 */
async function refreshSelectedPlayer(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  if (editorDirty && !window.confirm('刷新会丢弃当前未保存的修改。继续吗？')) {
    return;
  }

  refreshPlayerBtn.disabled = true;
  selectedPlayerDetail = null;
  loadingPlayerDetailId = selected.id;
  draftSnapshot = null;
  draftSourcePlayerId = null;
  editorDirty = false;
  clearEditorRenderCache();
  render();

  try {
    await loadState(true, true);
    setStatus(`已刷新 ${selected.name} 的角色详情`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '刷新角色详情失败', true);
  } finally {
    refreshPlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayer：执行对应的业务逻辑。 */
async function saveSelectedPlayer(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }
/** section：定义该变量以承载业务值。 */
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

/** synced：定义该变量以承载业务值。 */
  const synced = syncVisualEditorToDraft(getEditorTabSection(section) ?? undefined);
  if (!synced.ok || !draftSnapshot) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(synced.ok ? '当前没有可保存内容' : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    setPendingStatus(`正在提交 ${selected.name} 的${getEditorTabLabel(section)}修改...`);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
    editorDirty = false;
    await delayRefresh(`已提交 ${selected.name} 的${getEditorTabLabel(section)}修改`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    savePlayerBtn.disabled = false;
  }
}

/** saveSelectedPlayerPassword：执行对应的业务逻辑。 */
async function saveSelectedPlayerPassword(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可修改的账号密码', true);
    return;
  }

/** nextInput：定义该变量以承载业务值。 */
  const nextInput = editorContentEl.querySelector<HTMLInputElement>('#player-password-next');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-password"]');
/** newPassword：定义该变量以承载业务值。 */
  const newPassword = nextInput?.value.trim() ?? '';

  if (!newPassword) {
    setStatus('请填写新密码', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在修改账号 ${detail.account.username} 的密码...`);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword } satisfies GmUpdateManagedPlayerPasswordReq),
    });
    if (nextInput) {
      nextInput.value = '';
    }
    setStatus(`已修改账号 ${detail.account.username} 的密码，服务端已按哈希保存`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '修改账号密码失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** saveSelectedPlayerAccount：执行对应的业务逻辑。 */
async function saveSelectedPlayerAccount(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可修改的账号', true);
    return;
  }

/** accountInput：定义该变量以承载业务值。 */
  const accountInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-username');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-account"]');
/** username：定义该变量以承载业务值。 */
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
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/account`, {
      method: 'PUT',
      body: JSON.stringify({ username } satisfies GmUpdateManagedPlayerAccountReq),
    });
    await delayRefresh(`已将账号从 ${detail.account.username} 修改为 ${username}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '修改账号失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function banSelectedPlayerAccount(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可封禁的账号', true);
    return;
  }
  if (detail.account.status === 'banned') {
    setStatus('当前账号已封禁');
    return;
  }
/** reasonInput：定义该变量以承载业务值。 */
  const reasonInput = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="ban-player-account"]');
/** reason：定义该变量以承载业务值。 */
  const reason = reasonInput?.value.trim() ?? '';
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在封禁账号 ${detail.account.username}...`);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason } satisfies GmBanManagedPlayerReq),
    });
    if (reasonInput) {
      reasonInput.value = '';
      syncBanReasonPresetButtons();
    }
    await loadSelectedPlayerDetail(detail.id, true);
    setStatus(`已封禁账号 ${detail.account.username}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '封号失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function syncBanReasonPresetButtons(scope: ParentNode = editorContentEl): void {
/** input：定义该变量以承载业务值。 */
  const input = scope.querySelector<HTMLInputElement>('#player-account-ban-reason');
  if (!input) {
    return;
  }
/** currentValue：定义该变量以承载业务值。 */
  const currentValue = input.value.trim();
  scope.querySelectorAll<HTMLButtonElement>('[data-ban-reason-preset]').forEach((button) => {
/** preset：定义该变量以承载业务值。 */
    const preset = button.dataset.banReasonPreset ?? '';
    button.classList.toggle('primary', preset.length > 0 && preset === currentValue);
  });
}

function toggleBanReasonPreset(button: HTMLButtonElement): void {
/** input：定义该变量以承载业务值。 */
  const input = editorContentEl.querySelector<HTMLInputElement>('#player-account-ban-reason');
  if (!input) {
    return;
  }
/** preset：定义该变量以承载业务值。 */
  const preset = button.dataset.banReasonPreset?.trim() ?? '';
  if (!preset) {
    return;
  }
  input.value = input.value.trim() === preset ? '' : preset;
  syncBanReasonPresetButtons();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function unbanSelectedPlayerAccount(): Promise<void> {
/** detail：定义该变量以承载业务值。 */
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可解封的账号', true);
    return;
  }
  if (detail.account.status !== 'banned') {
    setStatus('当前账号未封禁');
    return;
  }
  if (!window.confirm(`确定解封账号 ${detail.account.username} 吗？`)) {
    return;
  }
/** button：定义该变量以承载业务值。 */
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="unban-player-account"]');
  if (button) {
    button.disabled = true;
  }
  try {
    setPendingStatus(`正在解封账号 ${detail.account.username}...`);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/unban`, {
      method: 'POST',
    });
    await loadSelectedPlayerDetail(detail.id, true);
    setStatus(`已解封账号 ${detail.account.username}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '解封失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetSelectedPlayer：执行对应的业务逻辑。 */
async function resetSelectedPlayer(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  resetPlayerBtn.disabled = true;
  try {
    setPendingStatus(`正在让 ${selected.name} 返回出生点...`);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}/reset`, {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(`已让 ${selected.name} 返回出生点`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '重置失败', true);
  } finally {
    resetPlayerBtn.disabled = false;
  }
}

/** resetSelectedPlayerHeavenGate：执行对应的业务逻辑。 */
async function resetSelectedPlayerHeavenGate(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  resetHeavenGateBtn.disabled = true;
  try {
    setPendingStatus(`正在重置 ${selected.name} 的天门测试状态...`);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}/heaven-gate/reset`, {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(`已重置 ${selected.name} 的天门测试状态`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '重置天门失败', true);
  } finally {
    resetHeavenGateBtn.disabled = false;
  }
}

/** removeSelectedBot：执行对应的业务逻辑。 */
async function removeSelectedBot(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected || !selected.meta.isBot) {
    setStatus('当前选中目标不是机器人', true);
    return;
  }

  removeBotBtn.disabled = true;
  try {
    setPendingStatus(`正在移除机器人 ${selected.name}...`);
    await request<{ ok: true }>('/gm/bots/remove', {
      method: 'POST',
      body: JSON.stringify({ playerIds: [selected.id] } satisfies GmRemoveBotsReq),
    });
    editorDirty = false;
    await delayRefresh(`已移除机器人 ${selected.name}`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  } finally {
    removeBotBtn.disabled = false;
  }
}

/** spawnBots：执行对应的业务逻辑。 */
async function spawnBots(): Promise<void> {
/** selected：定义该变量以承载业务值。 */
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择一个角色作为生成锚点', true);
    return;
  }

/** count：定义该变量以承载业务值。 */
  const count = Number(spawnCountInput.value);
  if (!Number.isFinite(count) || count <= 0) {
    setStatus('机器人数量必须为正整数', true);
    return;
  }

  try {
    await request<{ ok: true }>('/gm/bots/spawn', {
      method: 'POST',
      body: JSON.stringify({
        anchorPlayerId: selected.id,
        count,
      } satisfies GmSpawnBotsReq),
    });
    await delayRefresh(`已提交在 ${selected.name} 附近生成 ${Math.floor(count)} 个机器人`);
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '生成机器人失败', true);
  }
}

/** removeAllBots：执行对应的业务逻辑。 */
async function removeAllBots(): Promise<void> {
  try {
    setPendingStatus('正在移除全部机器人...');
    await request<{ ok: true }>('/gm/bots/remove', {
      method: 'POST',
      body: JSON.stringify({ all: true } satisfies GmRemoveBotsReq),
    });
    editorDirty = false;
    await delayRefresh('已提交移除全部机器人');
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  }
}

/** returnAllPlayersToDefaultSpawn：执行对应的业务逻辑。 */
async function returnAllPlayersToDefaultSpawn(): Promise<void> {
  if (!window.confirm('这会把所有非机器人角色统一送回新手村出生点。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
    return;
  }

/** button：定义该变量以承载业务值。 */
  const button = document.getElementById('shortcut-return-all-to-default-spawn') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/players/return-all-to-default-spawn', {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(
      `已提交全部角色回新手村出生点，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个`,
    );
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '执行快捷指令失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** cleanupAllPlayersInvalidItems：执行对应的业务逻辑。 */
async function cleanupAllPlayersInvalidItems(): Promise<void> {
  if (!window.confirm('这会手动清理所有非机器人角色背包、坊市托管仓和装备栏里的无效物品。在线角色将在下一息处理并落盘，离线角色会直接改存档。确认继续吗？')) {
    return;
  }

/** button：定义该变量以承载业务值。 */
  const button = document.getElementById('shortcut-cleanup-invalid-items') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/players/cleanup-invalid-items', {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(
      `已提交无效物品清理，共 ${result.totalPlayers} 个角色，运行态 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，移除背包堆叠 ${Math.floor(result.totalInvalidInventoryStacksRemoved ?? 0)} 个、托管仓堆叠 ${Math.floor(result.totalInvalidMarketStorageStacksRemoved ?? 0)} 个、装备栏 ${Math.floor(result.totalInvalidEquipmentRemoved ?? 0)} 件`,
    );
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '执行无效物品清理失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersCombatExp：执行对应的业务逻辑。 */
async function compensateAllPlayersCombatExp(): Promise<void> {
  if (!window.confirm('这会给所有非机器人角色补偿战斗经验。每个角色获得的数值 = 当前境界升级所需经验 + 当前炼体境界升级所需经验。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
    return;
  }

/** button：定义该变量以承载业务值。 */
  const button = document.getElementById('shortcut-compensate-combat-exp-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/compensation/combat-exp-2026-04-09', {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(
      `已提交战斗经验补偿，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，累计补偿 ${Math.floor(result.totalCombatExpGranted ?? 0)} 点战斗经验`,
    );
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '执行补偿失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** compensateAllPlayersFoundation：执行对应的业务逻辑。 */
async function compensateAllPlayersFoundation(): Promise<void> {
  if (!window.confirm('这会给所有非机器人角色补偿底蕴。每个角色获得的数值 = 当前境界升级所需经验的五倍。在线角色下一息生效，离线和离线挂机角色会直接改存档。确认继续吗？')) {
    return;
  }

/** button：定义该变量以承载业务值。 */
  const button = document.getElementById('shortcut-compensate-foundation-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/compensation/foundation-2026-04-09', {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(
      `已提交底蕴补偿，共 ${result.totalPlayers} 个角色，在线 ${result.queuedRuntimePlayers} 个，离线 ${result.updatedOfflinePlayers} 个，累计补偿 ${Math.floor(result.totalFoundationGranted ?? 0)} 点底蕴`,
    );
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '执行补偿失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** addHerbStockToAllMaps：执行对应的业务逻辑。 */
async function addHerbStockToAllMaps(): Promise<void> {
/** button：定义该变量以承载业务值。 */
  const button = document.getElementById('shortcut-add-herb-stock-1000') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
/** result：定义该变量以承载业务值。 */
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/world/add-herb-stock-1000', {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(
      `已提交全图草药库存补充，共 ${Math.floor(result.totalMaps ?? result.queuedRuntimeMaps ?? 0)} 张地图、${Math.floor(result.totalHerbContainers ?? 0)} 处草药点，累计增加 ${Math.floor(result.totalHerbStockAdded ?? 0)} 份库存`,
    );
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '执行草药库存补充失败', true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

/** resetNetworkStats：执行对应的业务逻辑。 */
async function resetNetworkStats(): Promise<void> {
  resetNetworkStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/network/reset', {
      method: 'POST',
    });
    await loadState(true);
    setStatus('流量统计已重置');
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '重置流量统计失败', true);
  } finally {
    resetNetworkStatsBtn.disabled = false;
  }
}

/** resetCpuStats：执行对应的业务逻辑。 */
async function resetCpuStats(): Promise<void> {
  resetCpuStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/cpu/reset', {
      method: 'POST',
    });
    await loadState(true);
    setStatus('CPU 统计已重置');
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '重置 CPU 统计失败', true);
  } finally {
    resetCpuStatsBtn.disabled = false;
  }
}

/** resetPathfindingStats：执行对应的业务逻辑。 */
async function resetPathfindingStats(): Promise<void> {
  resetPathfindingStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/pathfinding/reset', {
      method: 'POST',
    });
    await loadState(true);
    setStatus('寻路统计已重置');
  } catch (error) {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '重置寻路统计失败', true);
  } finally {
    resetPathfindingStatsBtn.disabled = false;
  }
}

/** handleEditorAction：执行对应的业务逻辑。 */
function handleEditorAction(action: string, trigger: HTMLElement): void {
  if (!draftSnapshot) return;

/** index：定义该变量以承载业务值。 */
  const index = Number(trigger.dataset.index ?? '-1');
/** slot：定义该变量以承载业务值。 */
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
/** itemId：定义该变量以承载业务值。 */
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
/** itemId：定义该变量以承载业务值。 */
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
/** techId：定义该变量以承载业务值。 */
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
/** button：定义该变量以承载业务值。 */
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-id]');
/** playerId：定义该变量以承载业务值。 */
  const playerId = button?.dataset.playerId;
  if (!playerId || playerId === selectedPlayerId) return;
  if (editorDirty && !window.confirm('当前角色有未保存修改，切换后会丢失这些修改。继续吗？')) {
    return;
  }
  selectedPlayerId = playerId;
  selectedPlayerDetail = null;
  loadingPlayerDetailId = playerId;
  draftSnapshot = null;
  draftSourcePlayerId = null;
  editorDirty = false;
  render();
  loadSelectedPlayerDetail(playerId, true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '加载角色详情失败', true);
  });
});

editorContentEl.addEventListener('click', (event) => {
/** presetButton：定义该变量以承载业务值。 */
  const presetButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ban-reason-preset]');
  if (presetButton) {
    toggleBanReasonPreset(presetButton);
    return;
  }
/** trigger：定义该变量以承载业务值。 */
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
/** action：定义该变量以承载业务值。 */
  const action = trigger?.dataset.action;
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
/** setStatus：处理当前场景中的对应操作。 */
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
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '设置炼体等级失败', true);
    });
    return;
  }
  if (action === 'add-foundation') {
    addSelectedPlayerFoundation().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '调整底蕴失败', true);
    });
    return;
  }
  if (action === 'add-combat-exp') {
    addSelectedPlayerCombatExp().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
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
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '执行快捷操作失败', true);
    });
    return;
  }
  handleEditorAction(action, trigger);
});
editorContentEl.addEventListener('input', (event) => {
  if ((event.target as HTMLElement)?.id === 'player-account-ban-reason') {
    syncBanReasonPresetButtons();
  }
});

editorContentEl.addEventListener('input', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** binding：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** pageBinding：定义该变量以承载业务值。 */
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
/** attachmentIndex：定义该变量以承载业务值。 */
      const attachmentIndex = Number(indexText);
      if ((scope === 'direct' || scope === 'shortcut') && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage(scope, attachmentIndex, target.value);
        if (scope === 'direct') {
          rerenderDirectMailComposer();
        }
        return;
      }
    }
/** binding：定义该变量以承载业务值。 */
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
    currentInventoryAddType = (target.value as (typeof ITEM_TYPES)[number]) || 'material';
    updateInventoryAddControls(true);
    return;
  }
/** synced：定义该变量以承载业务值。 */
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
/** path：定义该变量以承载业务值。 */
    const path = target.dataset.bind;
    if (path && applyCatalogBindingChange(path, target.value)) {
      return;
    }
  }
/** detail：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
/** root：定义该变量以承载业务值。 */
  const root = target.closest<HTMLElement>('[data-item-combobox]');
  if (!root || root.dataset.open === 'true') {
    return;
  }
  openSearchableItemField(root);
});

document.addEventListener('input', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
/** root：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
/** optionButton：定义该变量以承载业务值。 */
  const optionButton = target.closest<HTMLButtonElement>('[data-item-option-value]');
  if (optionButton) {
/** root：定义该变量以承载业务值。 */
    const root = optionButton.closest<HTMLElement>('[data-item-combobox]');
    if (!root) {
      return;
    }
    commitSearchableItemSelection(root, optionButton.dataset.itemOptionValue ?? '');
    return;
  }
/** toggleButton：定义该变量以承载业务值。 */
  const toggleButton = target.closest<HTMLButtonElement>('[data-item-combobox-toggle]');
  if (!toggleButton) {
    return;
  }
/** root：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.itemComboboxInput === undefined) {
    return;
  }
/** root：定义该变量以承载业务值。 */
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
/** listEl：定义该变量以承载业务值。 */
    const listEl = getSearchableItemList(root);
/** activeIndex：定义该变量以承载业务值。 */
    const activeIndex = Number(root.dataset.activeIndex ?? '-1');
/** activeButton：定义该变量以承载业务值。 */
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
/** trigger：定义该变量以承载业务值。 */
  const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
/** card：定义该变量以承载业务值。 */
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-suggestion-id]');
/** suggestionId：定义该变量以承载业务值。 */
  const suggestionId = card?.dataset.suggestionId;
/** action：定义该变量以承载业务值。 */
  const action = trigger?.dataset.action;
  if (!trigger || !suggestionId || !action) {
    return;
  }
  if (action === 'complete-suggestion') {
    completeSuggestion(suggestionId).catch(() => {});
    return;
  }
  if (action === 'reply-suggestion') {
/** replyInput：定义该变量以承载业务值。 */
    const replyInput = card?.querySelector<HTMLTextAreaElement>('[data-role="reply-input"]');
/** content：定义该变量以承载业务值。 */
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
  currentSuggestionKeyword = suggestionSearchInput.value;
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
  currentSuggestionKeyword = '';
  currentSuggestionPage = 1;
  if (suggestionSearchTimer !== null) {
    window.clearTimeout(suggestionSearchTimer);
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

playerSearchInput.addEventListener('input', () => {
  currentPlayerPage = 1;
  if (playerSearchTimer !== null) {
    window.clearTimeout(playerSearchTimer);
  }
  playerSearchTimer = window.setTimeout(() => {
    loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
    });
  }, 250);
});
playerSortSelect.addEventListener('change', () => {
  currentPlayerSort = (playerSortSelect.value as GmPlayerSortMode) || 'realm-desc';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerPresenceFilterSelect.addEventListener('change', () => {
  currentPlayerPresenceFilter = (playerPresenceFilterSelect.value as GmPlayerPresenceFilter) || 'all';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerBehaviorFilterSelect.addEventListener('change', () => {
  currentPlayerBehaviorFilter = (playerBehaviorFilterSelect.value as GmPlayerBehaviorFilter) || 'all';
  currentPlayerPage = 1;
  lastPlayerListStructureKey = null;
  loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
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
/** setStatus：处理当前场景中的对应操作。 */
    setStatus(error instanceof Error ? error.message : '加载角色列表失败', true);
  });
});
playerNextPageBtn.addEventListener('click', () => {
  if (currentPlayerPage >= currentPlayerTotalPages) {
    return;
  }
  currentPlayerPage += 1;
  loadState(true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
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
serverSubtabDatabaseBtn.addEventListener('click', () => switchServerTab('database'));
cpuBreakdownSortTotalBtn.addEventListener('click', () => setCpuBreakdownSort('total'));
cpuBreakdownSortCountBtn.addEventListener('click', () => setCpuBreakdownSort('count'));
cpuBreakdownSortAvgBtn.addEventListener('click', () => setCpuBreakdownSort('avg'));
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  login().catch(() => {});
});

applyRawJsonBtn.addEventListener('click', () => {
  applyRawJson().catch(() => {});
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
editorTabPersistedBtn.addEventListener('click', () => switchEditorTab('persisted'));

document.getElementById('refresh-state')?.addEventListener('click', () => {
  loadState(false, true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
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
document.getElementById('shortcut-add-herb-stock-1000')?.addEventListener('click', () => {
  addHerbStockToAllMaps().catch(() => {});
});
shortcutWorkspaceEl.addEventListener('click', (event) => {
/** trigger：定义该变量以承载业务值。 */
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
/** action：定义该变量以承载业务值。 */
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
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '发送快捷邮件失败', true);
    });
  }
});
shortcutWorkspaceEl.addEventListener('input', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** binding：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** pageBinding：定义该变量以承载业务值。 */
    const pageBinding = target.dataset.mailItemPage;
    if (pageBinding) {
      const [scope, indexText] = pageBinding.split('.');
/** attachmentIndex：定义该变量以承载业务值。 */
      const attachmentIndex = Number(indexText);
      if (scope === 'shortcut' && Number.isInteger(attachmentIndex)) {
        updateMailAttachmentItemPage('shortcut', attachmentIndex, target.value);
        renderShortcutMailComposer();
        return;
      }
    }
/** binding：定义该变量以承载业务值。 */
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
/** trigger：定义该变量以承载业务值。 */
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-redeem-group-id],[data-code-id]');
  if (!trigger) {
    return;
  }
/** groupId：定义该变量以承载业务值。 */
  const groupId = trigger.dataset.redeemGroupId;
  if (groupId) {
    selectedRedeemGroupId = groupId;
    redeemLatestGeneratedCodes = [];
    loadRedeemGroupDetail(groupId, true).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '加载兑换码分组失败', true);
    });
    return;
  }
/** action：定义该变量以承载业务值。 */
  const action = trigger.dataset.action;
  if (!action) {
    return;
  }
  if (action === 'new-redeem-group') {
    selectedRedeemGroupId = null;
    redeemGroupDetailState = null;
    redeemDraft = createDefaultRedeemGroupDraft();
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
/** rewardIndex：定义该变量以承载业务值。 */
    const rewardIndex = Number(trigger.dataset.rewardIndex);
    if (Number.isInteger(rewardIndex) && rewardIndex >= 0 && rewardIndex < redeemDraft.rewards.length) {
      redeemDraft.rewards.splice(rewardIndex, 1);
      renderRedeemPanel();
    }
    return;
  }
  if (action === 'refresh-redeem-groups') {
    loadRedeemGroups(false).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '刷新兑换码分组失败', true);
    });
    return;
  }
  if (action === 'create-redeem-group') {
    createRedeemGroup().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '创建兑换码分组失败', true);
    });
    return;
  }
  if (action === 'save-redeem-group') {
    saveRedeemGroup().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '保存兑换码分组失败', true);
    });
    return;
  }
  if (action === 'append-redeem-codes') {
    appendRedeemCodes().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '追加兑换码失败', true);
    });
    return;
  }
  if (action === 'copy-active-redeem-codes') {
    copyActiveRedeemCodes().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '复制未使用兑换码失败', true);
    });
    return;
  }
  if (action === 'destroy-redeem-code') {
/** codeId：定义该变量以承载业务值。 */
    const codeId = trigger.dataset.codeId;
    if (!codeId) {
      return;
    }
    destroyRedeemCode(codeId).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '销毁兑换码失败', true);
    });
  }
});
redeemWorkspaceEl?.addEventListener('input', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** binding：定义该变量以承载业务值。 */
    const binding = target.dataset.redeemBind;
    if (!binding) {
      return;
    }
    updateRedeemDraftValue(binding, target.value);
  }
});
redeemWorkspaceEl?.addEventListener('change', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
  ) {
/** binding：定义该变量以承载业务值。 */
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
resetCpuStatsBtn.addEventListener('click', () => {
  resetCpuStats().catch(() => {});
});
resetPathfindingStatsBtn.addEventListener('click', () => {
  resetPathfindingStats().catch(() => {});
});
serverPanelDatabaseEl.addEventListener('click', (event) => {
/** target：定义该变量以承载业务值。 */
  const target = event.target as HTMLElement | null;
/** refreshButton：定义该变量以承载业务值。 */
  const refreshButton = target?.closest<HTMLButtonElement>('#database-refresh');
  if (refreshButton) {
    loadDatabaseState(false).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '刷新数据库状态失败', true);
    });
    return;
  }

/** exportButton：定义该变量以承载业务值。 */
  const exportButton = target?.closest<HTMLButtonElement>('#database-export-current');
  if (exportButton) {
    exportCurrentDatabase().catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '导出数据库失败', true);
    });
    return;
  }

/** downloadButton：定义该变量以承载业务值。 */
  const downloadButton = target?.closest<HTMLButtonElement>('[data-db-download]');
  if (downloadButton?.dataset.dbDownload) {
    downloadDatabaseBackup(downloadButton.dataset.dbDownload).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '下载数据库备份失败', true);
    });
    return;
  }

/** restoreButton：定义该变量以承载业务值。 */
  const restoreButton = target?.closest<HTMLButtonElement>('[data-db-restore]');
  if (restoreButton?.dataset.dbRestore) {
    restoreDatabaseBackup(restoreButton.dataset.dbRestore).catch((error: unknown) => {
/** setStatus：处理当前场景中的对应操作。 */
      setStatus(error instanceof Error ? error.message : '导入数据库失败', true);
    });
  }
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
