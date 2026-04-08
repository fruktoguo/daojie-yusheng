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
  type GmCreateRedeemCodeGroupReq,
  type GmCreateRedeemCodeGroupRes,
  type GmDatabaseBackupRecord,
  type GmDatabaseStateRes,
  type GmCreateMailReq,
  type GmRedeemCodeGroupDetailRes,
  type GmRedeemCodeGroupListRes,
  type GmReplySuggestionReq,
  type GmSuggestionListRes,
  GM_PASSWORD_STORAGE_KEY,
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
import { startClientVersionReload } from './version-reload';

const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
const loginForm = document.getElementById('gm-login-form') as HTMLFormElement;
const passwordInput = document.getElementById('gm-password') as HTMLInputElement;
const loginSubmitBtn = document.getElementById('login-submit') as HTMLButtonElement;
const loginErrorEl = document.getElementById('login-error') as HTMLDivElement;
const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
const playerSearchInput = document.getElementById('player-search') as HTMLInputElement;
const playerSortSelect = document.getElementById('player-sort') as HTMLSelectElement;
const playerListEl = document.getElementById('player-list') as HTMLDivElement;
const spawnCountInput = document.getElementById('spawn-count') as HTMLInputElement;
const editorEmptyEl = document.getElementById('editor-empty') as HTMLDivElement;
const editorPanelEl = document.getElementById('editor-panel') as HTMLDivElement;
const editorTitleEl = document.getElementById('editor-title') as HTMLDivElement;
const editorSubtitleEl = document.getElementById('editor-subtitle') as HTMLDivElement;
const editorMetaEl = document.getElementById('editor-meta') as HTMLDivElement;
const editorContentEl = document.getElementById('editor-content') as HTMLDivElement;
const editorVisualPanelEl = document.getElementById('editor-visual-panel') as HTMLDivElement;
const editorPersistedPanelEl = document.getElementById('editor-persisted-panel') as HTMLDivElement;
const editorTabBasicBtn = document.getElementById('editor-tab-basic') as HTMLButtonElement;
const editorTabPositionBtn = document.getElementById('editor-tab-position') as HTMLButtonElement;
const editorTabRealmBtn = document.getElementById('editor-tab-realm') as HTMLButtonElement;
const editorTabBuffsBtn = document.getElementById('editor-tab-buffs') as HTMLButtonElement;
const editorTabTechniquesBtn = document.getElementById('editor-tab-techniques') as HTMLButtonElement;
const editorTabShortcutsBtn = document.getElementById('editor-tab-shortcuts') as HTMLButtonElement;
const editorTabItemsBtn = document.getElementById('editor-tab-items') as HTMLButtonElement;
const editorTabQuestsBtn = document.getElementById('editor-tab-quests') as HTMLButtonElement;
const editorTabMailBtn = document.getElementById('editor-tab-mail') as HTMLButtonElement;
const editorTabPersistedBtn = document.getElementById('editor-tab-persisted') as HTMLButtonElement;
const playerJsonEl = document.getElementById('player-json') as HTMLTextAreaElement;
const playerPersistedJsonEl = document.getElementById('player-persisted-json') as HTMLTextAreaElement;
const applyRawJsonBtn = document.getElementById('apply-raw-json') as HTMLButtonElement;
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
const refreshPlayerBtn = document.getElementById('refresh-player') as HTMLButtonElement;
const openPlayerMailBtn = document.getElementById('open-player-mail') as HTMLButtonElement;
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
const resetHeavenGateBtn = document.getElementById('reset-heaven-gate') as HTMLButtonElement;
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;

const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
const summaryTickWindowEl = document.getElementById('summary-tick-window') as HTMLDivElement;
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;
const summaryNetInEl = document.getElementById('summary-net-in') as HTMLDivElement;
const summaryNetOutEl = document.getElementById('summary-net-out') as HTMLDivElement;
const summaryPathQueueEl = document.getElementById('summary-path-queue') as HTMLDivElement;
const summaryPathWorkersEl = document.getElementById('summary-path-workers') as HTMLDivElement;
const summaryPathCancelledEl = document.getElementById('summary-path-cancelled') as HTMLDivElement;
const summaryNetInBreakdownEl = document.getElementById('summary-net-in-breakdown') as HTMLDivElement;
const summaryNetOutBreakdownEl = document.getElementById('summary-net-out-breakdown') as HTMLDivElement;
const serverSubtabOverviewBtn = document.getElementById('server-subtab-overview') as HTMLButtonElement;
const serverSubtabTrafficBtn = document.getElementById('server-subtab-traffic') as HTMLButtonElement;
const serverSubtabCpuBtn = document.getElementById('server-subtab-cpu') as HTMLButtonElement;
const serverSubtabDatabaseBtn = document.getElementById('server-subtab-database') as HTMLButtonElement;
const serverPanelOverviewEl = document.getElementById('server-panel-overview') as HTMLElement;
const serverPanelTrafficEl = document.getElementById('server-panel-traffic') as HTMLElement;
const serverPanelCpuEl = document.getElementById('server-panel-cpu') as HTMLElement;
const serverPanelDatabaseEl = document.getElementById('server-panel-database') as HTMLElement;
const trafficResetMetaEl = document.getElementById('traffic-reset-meta') as HTMLDivElement;
const trafficTotalInEl = document.getElementById('traffic-total-in') as HTMLDivElement;
const trafficTotalInNoteEl = document.getElementById('traffic-total-in-note') as HTMLDivElement;
const trafficTotalOutEl = document.getElementById('traffic-total-out') as HTMLDivElement;
const trafficTotalOutNoteEl = document.getElementById('traffic-total-out-note') as HTMLDivElement;
const resetNetworkStatsBtn = document.getElementById('reset-network-stats') as HTMLButtonElement;
const resetCpuStatsBtn = document.getElementById('reset-cpu-stats') as HTMLButtonElement;
const resetPathfindingStatsBtn = document.getElementById('reset-pathfinding-stats') as HTMLButtonElement;
const cpuCurrentPercentEl = document.getElementById('cpu-current-percent') as HTMLDivElement;
const cpuTickWindowPercentEl = document.getElementById('cpu-tick-window-percent') as HTMLDivElement;
const cpuTickWindowNoteEl = document.getElementById('cpu-tick-window-note') as HTMLDivElement;
const cpuProfileMetaEl = document.getElementById('cpu-profile-meta') as HTMLDivElement;
const cpuCoreCountEl = document.getElementById('cpu-core-count') as HTMLDivElement;
const cpuUserMsEl = document.getElementById('cpu-user-ms') as HTMLDivElement;
const cpuSystemMsEl = document.getElementById('cpu-system-ms') as HTMLDivElement;
const cpuLoad1mEl = document.getElementById('cpu-load-1m') as HTMLDivElement;
const cpuLoad5mEl = document.getElementById('cpu-load-5m') as HTMLDivElement;
const cpuLoad15mEl = document.getElementById('cpu-load-15m') as HTMLDivElement;
const cpuProcessUptimeEl = document.getElementById('cpu-process-uptime') as HTMLDivElement;
const cpuSystemUptimeEl = document.getElementById('cpu-system-uptime') as HTMLDivElement;
const cpuRssMemoryEl = document.getElementById('cpu-rss-memory') as HTMLDivElement;
const cpuHeapUsedEl = document.getElementById('cpu-heap-used') as HTMLDivElement;
const cpuHeapTotalEl = document.getElementById('cpu-heap-total') as HTMLDivElement;
const cpuExternalMemoryEl = document.getElementById('cpu-external-memory') as HTMLDivElement;
const pathfindingResetMetaEl = document.getElementById('pathfinding-reset-meta') as HTMLDivElement;
const pathfindingAvgQueueMsEl = document.getElementById('pathfinding-avg-queue-ms') as HTMLDivElement;
const pathfindingQueueNoteEl = document.getElementById('pathfinding-queue-note') as HTMLDivElement;
const pathfindingAvgRunMsEl = document.getElementById('pathfinding-avg-run-ms') as HTMLDivElement;
const pathfindingRunNoteEl = document.getElementById('pathfinding-run-note') as HTMLDivElement;
const pathfindingAvgExpandedNodesEl = document.getElementById('pathfinding-avg-expanded-nodes') as HTMLDivElement;
const pathfindingExpandedNoteEl = document.getElementById('pathfinding-expanded-note') as HTMLDivElement;
const pathfindingDropTotalEl = document.getElementById('pathfinding-drop-total') as HTMLDivElement;
const pathfindingDropNoteEl = document.getElementById('pathfinding-drop-note') as HTMLDivElement;
const pathfindingFailureListEl = document.getElementById('pathfinding-failure-list') as HTMLDivElement;
const cpuBreakdownListEl = document.getElementById('cpu-breakdown-list') as HTMLDivElement;
const cpuBreakdownSortTotalBtn = document.getElementById('cpu-breakdown-sort-total') as HTMLButtonElement;
const cpuBreakdownSortCountBtn = document.getElementById('cpu-breakdown-sort-count') as HTMLButtonElement;
const cpuBreakdownSortAvgBtn = document.getElementById('cpu-breakdown-sort-avg') as HTMLButtonElement;
const gmPasswordForm = document.getElementById('gm-password-form') as HTMLFormElement;
const gmPasswordCurrentInput = document.getElementById('gm-password-current') as HTMLInputElement;
const gmPasswordNextInput = document.getElementById('gm-password-next') as HTMLInputElement;
const gmPasswordSaveBtn = document.getElementById('gm-password-save') as HTMLButtonElement;
const playerWorkspaceEl = document.getElementById('player-workspace') as HTMLElement;
const redeemWorkspaceEl = document.getElementById('redeem-workspace') as HTMLElement;
const suggestionWorkspaceEl = document.getElementById('suggestion-workspace') as HTMLElement;
const serverWorkspaceEl = document.getElementById('server-workspace') as HTMLElement;
const worldWorkspaceEl = document.getElementById('world-workspace') as HTMLElement;
const shortcutWorkspaceEl = document.getElementById('shortcut-workspace') as HTMLElement;
const shortcutMailComposerEl = document.getElementById('shortcut-mail-composer') as HTMLDivElement | null;
const serverTabBtn = document.getElementById('gm-tab-server') as HTMLButtonElement;
const redeemTabBtn = document.getElementById('gm-tab-redeem') as HTMLButtonElement;
const playerTabBtn = document.getElementById('gm-tab-players') as HTMLButtonElement;
const suggestionTabBtn = document.getElementById('gm-tab-suggestions') as HTMLButtonElement;
const worldTabBtn = document.getElementById('gm-tab-world') as HTMLButtonElement;
const shortcutTabBtn = document.getElementById('gm-tab-shortcuts') as HTMLButtonElement;
const suggestionListEl = document.getElementById('gm-suggestion-list') as HTMLElement;
const suggestionSearchInput = document.getElementById('gm-suggestion-search') as HTMLInputElement;
const suggestionSearchClearBtn = document.getElementById('gm-suggestion-search-clear') as HTMLButtonElement;
const suggestionPrevPageBtn = document.getElementById('gm-suggestion-page-prev') as HTMLButtonElement;
const suggestionNextPageBtn = document.getElementById('gm-suggestion-page-next') as HTMLButtonElement;
const suggestionPageMetaEl = document.getElementById('gm-suggestion-page-meta') as HTMLDivElement;
const redeemStatusEl = document.getElementById('redeem-status') as HTMLDivElement | null;
const redeemGroupListEl = document.getElementById('redeem-group-list') as HTMLDivElement | null;
const redeemGroupEditorEl = document.getElementById('redeem-group-editor') as HTMLDivElement | null;
const redeemCodeListEl = document.getElementById('redeem-code-list') as HTMLDivElement | null;

type PlayerSortMode = 'realm-desc' | 'realm-asc' | 'online' | 'map' | 'name';
type GmEditorTab = GmPlayerUpdateSection | 'shortcuts' | 'mail' | 'persisted';

interface GmMailAttachmentDraft {
  itemId: string;
  count: number;
}

interface GmMailComposerDraft {
  templateId: string;
  targetPlayerId: string;
  senderLabel: string;
  title: string;
  body: string;
  expireHours: string;
  attachments: GmMailAttachmentDraft[];
}

interface RedeemGroupDraft {
  name: string;
  rewards: RedeemCodeGroupRewardItem[];
  createCount: string;
  appendCount: string;
}

type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot';

const MAIL_ATTACHMENT_ITEM_PAGE_SIZE = 10;
const SEARCHABLE_ITEM_RESULT_LIMIT = 80;

startClientVersionReload({
  onBeforeReload: () => {
    setStatus('检测到前端新版本，正在刷新页面');
  },
});

let token = sessionStorage.getItem(GM_ACCESS_TOKEN_STORAGE_KEY) ?? '';
let state: GmStateRes | null = null;
let databaseState: GmDatabaseStateRes | null = null;
let suggestions: Suggestion[] = [];
let editorCatalog: GmEditorCatalogRes | null = null;
let selectedPlayerId: string | null = null;
let selectedPlayerDetail: GmManagedPlayerRecord | null = null;
let loadingPlayerDetailId: string | null = null;
let detailRequestNonce = 0;
let draftSnapshot: PlayerState | null = null;
let editorDirty = false;
let draftSourcePlayerId: string | null = null;
let pollTimer: number | null = null;
let currentTab: 'server' | 'redeem' | 'players' | 'suggestions' | 'world' | 'shortcuts' = 'server';
let currentServerTab: 'overview' | 'traffic' | 'cpu' | 'database' = 'overview';
let currentCpuBreakdownSort: 'total' | 'count' | 'avg' = 'total';
let currentEditorTab: GmEditorTab = 'basic';
let currentInventoryAddType: (typeof ITEM_TYPES)[number] = 'material';
let currentPlayerSort: PlayerSortMode = (playerSortSelect.value as PlayerSortMode) || 'realm-desc';
let currentSuggestionPage = 1;
let currentSuggestionTotalPages = 1;
let currentSuggestionTotal = 0;
let currentSuggestionKeyword = '';
let suggestionSearchTimer: number | null = null;
let lastPlayerListStructureKey: string | null = null;
let lastEditorStructureKey: string | null = null;
let lastSuggestionStructureKey: string | null = null;
let lastNetworkInStructureKey: string | null = null;
let lastNetworkOutStructureKey: string | null = null;
let lastCpuBreakdownStructureKey: string | null = null;
let lastPathfindingFailureStructureKey: string | null = null;
let lastShortcutMailComposerStructureKey: string | null = null;
let databaseStateLoading = false;
let redeemGroupsState: RedeemCodeGroupView[] = [];
let selectedRedeemGroupId: string | null = null;
let redeemGroupDetailState: GmRedeemCodeGroupDetailRes | null = null;
let redeemDraft: RedeemGroupDraft = createDefaultRedeemGroupDraft();
let redeemLoading = false;
let redeemLatestGeneratedCodes: string[] = [];
let directMailDraftPlayerId: string | null = null;
let directMailDraft = createDefaultMailComposerDraft();
let broadcastMailDraft = createDefaultMailComposerDraft();
let shortcutMailComposerRefreshBlocked = false;
let directMailAttachmentPageByIndex = new Map<number, number>();
let shortcutMailAttachmentPageByIndex = new Map<number, number>();
let activeSearchableItemField: HTMLElement | null = null;
let editorRenderRefreshBlocked = false;

function getBrowserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPersistedGmPassword(): string {
  const storage = getBrowserLocalStorage();
  if (!storage) return '';
  try {
    return storage.getItem(GM_PASSWORD_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

function persistGmPassword(password: string): void {
  const storage = getBrowserLocalStorage();
  if (!storage) return;
  const normalized = password.trim();
  try {
    if (normalized) {
      storage.setItem(GM_PASSWORD_STORAGE_KEY, normalized);
      return;
    }
    storage.removeItem(GM_PASSWORD_STORAGE_KEY);
  } catch {
    // 本地存储不可用时忽略，避免影响 GM 主流程。
  }
}

function syncPersistedGmPasswordToInputs(): void {
  const persistedPassword = readPersistedGmPassword();
  passwordInput.value = persistedPassword;
  gmPasswordCurrentInput.value = persistedPassword;
}

function createDefaultMailAttachmentDraft(): GmMailAttachmentDraft {
  return {
    itemId: '',
    count: 1,
  };
}

function createDefaultRedeemGroupDraft(): RedeemGroupDraft {
  return {
    name: '',
    rewards: [createDefaultRedeemReward()],
    createCount: '10',
    appendCount: '10',
  };
}

function createDefaultRedeemReward(): RedeemCodeGroupRewardItem {
  return {
    itemId: '',
    count: 1,
  };
}

function createDefaultMailComposerDraft(): GmMailComposerDraft {
  return {
    templateId: '',
    targetPlayerId: '',
    senderLabel: '司命台',
    title: '',
    body: '',
    expireHours: '72',
    attachments: [],
  };
}

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function formatBytes(bytes: number | undefined): string {
  const safe = Number.isFinite(bytes) ? Math.max(0, Number(bytes)) : 0;
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
  return `${(safe / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatPercent(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatBytesPerSecond(bytes: number, elapsedSec: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(elapsedSec) || elapsedSec <= 0) {
    return '0 B/s';
  }
  return `${formatBytes(bytes / elapsedSec)}/s`;
}

function formatAverageBytesPerEvent(bytes: number, count: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(count) || count <= 0) {
    return '0 B';
  }
  return formatBytes(bytes / count);
}

function formatDurationSeconds(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (days > 0) return `${days}天 ${hours}时 ${minutes}分`;
  if (hours > 0) return `${hours}时 ${minutes}分 ${secs}秒`;
  if (minutes > 0) return `${minutes}分 ${secs}秒`;
  return `${secs}秒`;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return '无';
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return '无';
  }
  return time.toLocaleString('zh-CN');
}

function getPlayerPresenceMeta(player: Pick<GmManagedPlayerSummary, 'meta'>): {
  className: 'online' | 'offline';
  label: '在线' | '离线挂机' | '离线';
} {
  if (player.meta.online) {
    return { className: 'online', label: '在线' };
  }
  if (player.meta.inWorld) {
    return { className: 'offline', label: '离线挂机' };
  }
  return { className: 'offline', label: '离线' };
}

function getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string {
  const presence = getPlayerPresenceMeta(player);
  return presence.label;
}

function getFilteredPlayers(data: GmStateRes): GmManagedPlayerSummary[] {
  const keyword = playerSearchInput.value.trim().toLowerCase();
  const filtered = data.players.filter((player) => {
    if (!keyword) return true;
    return [player.accountName ?? '', player.roleName, player.displayName, player.mapName, player.mapId]
      .some((value) => value.toLowerCase().includes(keyword));
  });
  return sortPlayers(filtered);
}

function comparePlayerName(left: GmManagedPlayerSummary, right: GmManagedPlayerSummary): number {
  return left.roleName.localeCompare(right.roleName, 'zh-CN');
}

function comparePlayerRealm(left: GmManagedPlayerSummary, right: GmManagedPlayerSummary): number {
  if (left.realmLv !== right.realmLv) {
    return right.realmLv - left.realmLv;
  }
  return comparePlayerName(left, right);
}

function sortPlayers(players: GmManagedPlayerSummary[]): GmManagedPlayerSummary[] {
  return [...players].sort((left, right) => {
    switch (currentPlayerSort) {
      case 'realm-asc':
        return comparePlayerRealm(right, left);
      case 'online':
        if (left.meta.online !== right.meta.online) {
          return left.meta.online ? -1 : 1;
        }
        if (left.realmLv !== right.realmLv) {
          return right.realmLv - left.realmLv;
        }
        return comparePlayerName(left, right);
      case 'map':
        if (left.mapName !== right.mapName) {
          return left.mapName.localeCompare(right.mapName, 'zh-CN');
        }
        if (left.realmLv !== right.realmLv) {
          return right.realmLv - left.realmLv;
        }
        return comparePlayerName(left, right);
      case 'name':
        return comparePlayerName(left, right);
      case 'realm-desc':
      default:
        return comparePlayerRealm(left, right);
    }
  });
}

function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return `地图: ${player.mapName}`;
}

function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return `${player.meta.isBot ? '机器人' : '玩家'} · ${player.realmLabel}`;
}

function getPlayerRowMarkup(player: GmManagedPlayerSummary): string {
  return `
    <button class="player-row" data-player-id="${escapeHtml(player.id)}" type="button">
      <div class="player-top">
        <div class="player-name" data-role="name"></div>
        <div class="pill" data-role="presence"></div>
      </div>
      <div class="player-meta" data-role="meta"></div>
      <div class="player-subline" data-role="identity"></div>
      <div class="player-subline" data-role="stats"></div>
    </button>
  `;
}

function patchPlayerRow(button: HTMLButtonElement, player: GmManagedPlayerSummary, isActive: boolean): void {
  const presence = getPlayerPresenceMeta(player);
  button.classList.toggle('active', isActive);
  button.querySelector<HTMLElement>('[data-role="name"]')!.textContent = player.roleName;
  const presenceEl = button.querySelector<HTMLElement>('[data-role="presence"]')!;
  presenceEl.classList.toggle('online', presence.className === 'online');
  presenceEl.classList.toggle('offline', presence.className === 'offline');
  presenceEl.textContent = presence.label;
  button.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = `账号: ${player.accountName ?? '无'} · 显示名: ${player.displayName}`;
  button.querySelector<HTMLElement>('[data-role="identity"]')!.textContent = getPlayerIdentityLine(player);
  button.querySelector<HTMLElement>('[data-role="stats"]')!.textContent = getPlayerStatsLine(player);
}

function getEditorSubtitle(detail: GmManagedPlayerRecord): string {
  return [
    `账号: ${detail.accountName ?? '无'}`,
    `显示名: ${detail.displayName}`,
    `地图: ${detail.mapName} (${detail.x}, ${detail.y})`,
    detail.meta.updatedAt ? `最近落盘: ${new Date(detail.meta.updatedAt).toLocaleString('zh-CN')}` : '最近落盘: 运行时角色',
  ].join(' · ');
}

function getEditorMetaMarkup(detail: GmManagedPlayerRecord): string {
  const presence = getPlayerPresenceMeta(detail);
  const pills: string[] = [
    `<span class="pill ${presence.className}">${presence.label}</span>`,
    `<span class="pill ${detail.meta.isBot ? 'bot' : ''}">${detail.meta.isBot ? '机器人' : '玩家'}</span>`,
    `<span class="pill">${detail.dead ? '死亡' : '存活'}</span>`,
    `<span class="pill">${detail.autoBattle ? '自动战斗开' : '自动战斗关'}</span>`,
    `<span class="pill">${detail.autoRetaliate ? '自动反击开' : '自动反击关'}</span>`,
  ];
  if (detail.meta.dirtyFlags.length > 0) {
    pills.push(`<span class="pill">脏标记: ${escapeHtml(detail.meta.dirtyFlags.join(', '))}</span>`);
  }
  if (editorDirty) {
    pills.push('<span class="pill">编辑中</span>');
  }
  return pills.join('');
}

function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string {
  return [
    `<span class="pill ${player.meta.online ? 'online' : 'offline'}">${player.meta.online ? '在线' : '离线'}</span>`,
    `<span class="pill ${player.meta.isBot ? 'bot' : ''}">${player.meta.isBot ? '机器人' : '玩家'}</span>`,
    editorDirty ? '<span class="pill">有未保存修改</span>' : '',
    draft.dead ? '<span class="pill">草稿标记为死亡</span>' : '',
  ].filter(Boolean).join('');
}

function getEquipmentCardTitle(item: ItemStack | null): string {
  return item ? item.name || '未命名装备' : '';
}

function getEquipmentCardMeta(item: ItemStack | null): string {
  return item ? `${item.itemId || '空 ID'} · ${item.grade || '无品阶'} · Lv.${item.level ?? 1}` : '当前为空';
}

function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return bonus?.label || bonus?.source || `加成 ${index + 1}`;
}

function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return bonus?.source || '未填写来源';
}

function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return buff?.name || buff?.buffId || `临时效果 ${index + 1}`;
}

function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  if (!buff) return '';
  return `${buff.buffId || '未填写 buffId'} · ${buff.category} · ${buff.visibility}`;
}

function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return item?.name || item?.itemId || `物品 ${index + 1}`;
}

function getInventoryCardMeta(item: ItemStack | undefined): string {
  if (!item) return '';
  return getInventoryRowMeta(item);
}

function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return entry?.skillId || `技能槽 ${index + 1}`;
}

function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return entry?.enabled ? '启用' : '禁用';
}

function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return technique?.name || technique?.techId || `功法 ${index + 1}`;
}

function getTechniqueCardMeta(technique: TechniqueState | undefined): string {
  if (!technique) return '';
  const realmLevelLabel = editorCatalog?.realmLevels.find((entry) => entry.realmLv === technique.realmLv)?.displayName ?? `Lv.${technique.realmLv}`;
  return `${technique.techId || '未填写功法 ID'} · ${realmLevelLabel} · 等级 ${technique.level} · ${TECHNIQUE_REALM_LABELS[technique.realm] ?? technique.realm}`;
}

function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return quest?.title || quest?.id || `任务 ${index + 1}`;
}

function getQuestCardMeta(quest: QuestState | undefined): string {
  if (!quest) return '';
  return `${quest.id || '未填写任务 ID'} · ${QUEST_LINE_LABELS[quest.line] ?? quest.line} · ${QUEST_STATUS_LABELS[quest.status] ?? quest.status}`;
}

function getTechniqueOptionLabel(option: GmEditorTechniqueOption): string {
  const realmLevelLabel = editorCatalog?.realmLevels.find((entry) => entry.realmLv === option.realmLv)?.displayName;
  return `${option.name}${option.grade ? ` · ${TECHNIQUE_GRADE_LABELS[option.grade] ?? option.grade}` : ''}${realmLevelLabel ? ` · ${realmLevelLabel}` : ''}`;
}

function getItemOptionLabel(option: GmEditorItemOption): string {
  const parts = [option.name];
  if (option.type === 'equipment' && option.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[option.equipSlot]);
  } else {
    parts.push(ITEM_TYPE_LABELS[option.type] ?? option.type);
  }
  return parts.join(' · ');
}

function getTechniqueCatalogOptions(includeEmpty = false): Array<{ value: string; label: string }> {
  const options = editorCatalog?.techniques.map((option) => ({
    value: option.id,
    label: getTechniqueOptionLabel(option),
  })) ?? [];
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

function getLearnedTechniqueOptions(techniques: TechniqueState[], includeEmpty = false): Array<{ value: string; label: string }> {
  const options = techniques.map((technique) => ({
    value: technique.techId,
    label: technique.name || technique.techId,
  }));
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

function getRealmCatalogOptions(): Array<{ value: number; label: string }> {
  return editorCatalog?.realmLevels.map((entry) => ({
    value: entry.realmLv,
    label: `${entry.displayName} · Lv.${entry.realmLv}`,
  })) ?? [];
}

function getItemCatalogOptions(filter?: (option: GmEditorItemOption) => boolean): Array<{ value: string; label: string }> {
  const items = filter ? (editorCatalog?.items.filter(filter) ?? []) : (editorCatalog?.items ?? []);
  return items.map((option) => ({
    value: option.itemId,
    label: getItemOptionLabel(option),
  }));
}

function getBuffOptionLabel(option: GmEditorBuffOption): string {
  const source = option.sourceSkillName || option.sourceSkillId;
  return source ? `${option.name} · ${source}` : option.name;
}

function getBuffCatalogOptions(selectedBuffId?: string): Array<{ value: string; label: string }> {
  const options = editorCatalog?.buffs.map((option) => ({
    value: option.buffId,
    label: getBuffOptionLabel(option),
  })) ?? [];
  if (selectedBuffId && !options.some((option) => option.value === selectedBuffId)) {
    options.unshift({
      value: selectedBuffId,
      label: selectedBuffId,
    });
  }
  return [{ value: '', label: '请选择 Buff' }, ...options];
}

function getMailAttachmentItemOptions(): Array<{ value: string; label: string }> {
  return getItemCatalogOptions();
}

function getMailAttachmentPageStore(scope: 'direct' | 'shortcut'): Map<number, number> {
  return scope === 'direct' ? directMailAttachmentPageByIndex : shortcutMailAttachmentPageByIndex;
}

function resetMailAttachmentPageStore(scope: 'direct' | 'shortcut'): void {
  if (scope === 'direct') {
    directMailAttachmentPageByIndex = new Map();
    return;
  }
  shortcutMailAttachmentPageByIndex = new Map();
}

function getMailAttachmentItemPageState(
  scope: 'direct' | 'shortcut',
  attachmentIndex: number,
  selectedItemId: string,
): {
  page: number;
  totalPages: number;
  options: Array<{ value: string; label: string }>;
} {
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

function updateMailAttachmentItemPage(scope: 'direct' | 'shortcut', attachmentIndex: number, rawValue: string): void {
  const page = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
  getMailAttachmentPageStore(scope).set(attachmentIndex, page);
}

function getMailAttachmentRowMeta(itemId: string): string {
  const entry = findItemCatalogEntry(itemId);
  if (!entry) {
    return itemId ? `未找到物品模板：${itemId}` : '请选择物品模板';
  }
  return getItemOptionLabel(entry);
}

function getMailTemplateOptionMeta(templateId: string): { label: string; description: string } | null {
  return GM_MAIL_TEMPLATE_OPTIONS.find((entry) => entry.templateId === templateId) ?? null;
}

function isServerManagedMailTemplate(templateId: string): boolean {
  return templateId === MAIL_TEMPLATE_BEGINNER_JOURNEY_ID
    || templateId === MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID
    || templateId === MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID;
}

function getShortcutMailTargetOptions(): Array<{ value: string; label: string }> {
  const players = state?.players.filter((player) => !player.meta.isBot) ?? [];
  return [
    { value: '', label: '发送给全服玩家' },
    ...players.map((player) => ({
      value: player.id,
      label: `${player.roleName} · ${player.accountName || '无账号'} · ${player.meta.online ? '在线' : '离线'}`,
    })),
  ];
}

function getMailComposerPayload(draft: GmMailComposerDraft): GmCreateMailReq {
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

function getMailComposerMarkup(
  draft: GmMailComposerDraft,
  options: {
    scope: 'direct' | 'shortcut';
    submitLabel: string;
    note: string;
    showTargetPlayer?: boolean;
  },
): string {
  const usesServerManagedTemplate = isServerManagedMailTemplate(draft.templateId);
  const templateMeta = getMailTemplateOptionMeta(draft.templateId);
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

function getInventoryAddTypeOptions(): Array<{ value: string; label: string }> {
  return ITEM_TYPES.map((type) => ({
    value: type,
    label: ITEM_TYPE_LABELS[type],
  }));
}

function getInventoryAddItemOptions(): Array<{ value: string; label: string }> {
  return getItemCatalogOptions((option) => option.type === currentInventoryAddType);
}

function findTechniqueCatalogEntry(techId: string | undefined): GmEditorTechniqueOption | null {
  if (!techId) return null;
  return editorCatalog?.techniques.find((entry) => entry.id === techId) ?? null;
}

function findItemCatalogEntry(itemId: string | undefined): GmEditorItemOption | null {
  if (!itemId) return null;
  return editorCatalog?.items.find((entry) => entry.itemId === itemId) ?? null;
}

function findBuffCatalogEntry(buffId: string | undefined): GmEditorBuffOption | null {
  if (!buffId) return null;
  return editorCatalog?.buffs.find((entry) => entry.buffId === buffId) ?? null;
}

function createTechniqueFromCatalog(techId: string): TechniqueState {
  const option = findTechniqueCatalogEntry(techId);
  if (!option) {
    return createDefaultTechnique();
  }
  const initialExpToNext = option.layers?.find((layer) => layer.level === 1)?.expToNext ?? 0;
  return {
    techId: option.id,
    name: option.name,
    level: 1,
    exp: 0,
    expToNext: initialExpToNext,
    realmLv: option.realmLv ?? 1,
    realm: TechniqueRealm.Entry,
    skills: option.skills ? clone(option.skills) : [],
    grade: option.grade ?? 'mortal',
    category: option.category,
    layers: option.layers ? clone(option.layers) : [],
    attrCurves: {},
  };
}

function createItemFromCatalog(itemId: string, count = 1): ItemStack {
  const option = findItemCatalogEntry(itemId);
  if (!option) {
    return { ...createDefaultItem(), itemId, count };
  }
  return {
    itemId: option.itemId,
    name: option.name,
    type: option.type,
    count,
    desc: option.desc ?? '',
    grade: option.grade,
    level: option.level,
    equipSlot: option.equipSlot,
    equipAttrs: option.equipAttrs ? clone(option.equipAttrs) : undefined,
    equipStats: option.equipStats ? clone(option.equipStats) : undefined,
    equipValueStats: option.equipValueStats ? clone(option.equipValueStats) : undefined,
    tags: option.tags ? [...option.tags] : undefined,
    effects: option.effects ? clone(option.effects) : undefined,
  };
}

function createBuffFromCatalog(
  buffId: string,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  const option = findBuffCatalogEntry(buffId);
  if (!option) {
    return {
      ...createDefaultBuff(),
      buffId,
      remainingTicks: Math.max(0, current?.remainingTicks ?? 1),
      stacks: Math.max(1, current?.stacks ?? 1),
    };
  }

  const next = clone(option);
  next.duration = Math.max(1, next.duration);
  next.maxStacks = Math.max(1, next.maxStacks);
  next.stacks = Math.max(1, Math.min(next.maxStacks, Math.floor(current?.stacks ?? next.stacks ?? 1)));
  next.remainingTicks = Math.max(0, Math.floor(current?.remainingTicks ?? next.duration));
  return next;
}

function getTechniqueSummary(technique: TechniqueState): string {
  return `${technique.name || technique.techId} · ${technique.grade ?? 'mortal'} · 境界 Lv.${technique.realmLv} · 等级 ${technique.level}`;
}

function getTechniqueTemplateMaxLevel(technique: TechniqueState): number {
  const catalogEntry = findTechniqueCatalogEntry(technique.techId);
  const levels = catalogEntry?.layers?.map((layer) => layer.level)
    ?? technique.layers?.map((layer) => layer.level)
    ?? [];
  if (levels.length === 0) {
    return Math.max(1, Math.floor(technique.level || 1));
  }
  return Math.max(1, ...levels);
}

function buildMaxLevelTechniqueState(technique: TechniqueState): TechniqueState {
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

function getInventoryRowMeta(item: ItemStack): string {
  const parts = [ITEM_TYPE_LABELS[item.type] ?? item.type];
  if (item.type === 'equipment' && item.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[item.equipSlot] ?? item.equipSlot);
  }
  return parts.join(' · ');
}

function getTechniqueEditorControls(index: number, technique: TechniqueState): string {
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

function getItemEditorControls(basePath: string, item: ItemStack, mode: 'inventory' | 'equipment'): string {
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
      ${numberField('等级', `${basePath}.level`, item.level)}
      ${nullableTextField('品阶', `${basePath}.grade`, item.grade, 'undefined')}
      ${jsonField('装备属性', `${basePath}.equipAttrs`, item.equipAttrs ?? {}, 'object')}
      ${jsonField('装备数值', `${basePath}.equipStats`, item.equipStats ?? {}, 'object')}
      ${jsonField('特效配置', `${basePath}.effects`, item.effects ?? [], 'array', 'wide')}
    </div>
  `;
}

function getCompactInventoryItemMarkup(item: ItemStack, index: number): string {
  return `
    <div class="editor-card inventory-compact-row">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title" data-preview="inventory-title" data-index="${index}">${escapeHtml(getInventoryCardTitle(item, index))}</div>
          <div class="editor-card-meta" data-preview="inventory-meta" data-index="${index}">${escapeHtml(getInventoryRowMeta(item))}</div>
        </div>
        <button class="small-btn danger" type="button" data-action="remove-inventory-item" data-index="${index}">删除</button>
      </div>
      <div class="editor-grid compact">
        ${numberField('数量', `inventory.items.${index}.count`, item.count)}
      </div>
    </div>
  `;
}

function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  switch (path) {
    case 'finalAttrs':
      return formatJson(draft.finalAttrs ?? {});
    case 'numericStats':
      return formatJson(draft.numericStats ?? {});
    case 'ratioDivisors':
      return formatJson(draft.ratioDivisors ?? {});
    case 'realm':
      return formatJson(draft.realm ?? {});
    case 'actions':
      return formatJson(draft.actions ?? []);
    default:
      return formatJson(null);
  }
}

function buildEditorStructureKey(detail: GmManagedPlayerRecord, draft: PlayerState): string {
  const mapIds = Array.from(new Set([...(state?.mapIds ?? []), draft.mapId])).sort().join(',');
  const equipmentPresence = EQUIP_SLOTS.map((slot) => (draft.equipment[slot] ? '1' : '0')).join('');
  return [
    detail.id,
    mapIds,
    equipmentPresence,
    ensureArray(draft.bonuses).length,
    ensureArray(draft.temporaryBuffs).length,
    ensureArray(draft.inventory.items).length,
    ensureArray(draft.autoBattleSkills).length,
    ensureArray(draft.techniques).length,
    ensureArray(draft.quests).length,
  ].join('|');
}

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

function syncVisualEditorFieldsFromDraft(draft: PlayerState): void {
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

function patchEditorPreview(detail: GmManagedPlayerRecord, draft: PlayerState): void {
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
  editorContentEl.querySelectorAll<HTMLElement>('[data-preview="readonly"]').forEach((element) => {
    const path = element.dataset.path;
    if (!path) return;
    element.textContent = getReadonlyPreviewValue(draft, path);
  });
}

function clearEditorRenderCache(): void {
  lastEditorStructureKey = null;
  editorContentEl.innerHTML = '';
}

function getVisibleNetworkBuckets(buckets: GmNetworkBucket[]): GmNetworkBucket[] {
  const visibleBuckets = buckets.slice(0, 8);
  const hiddenBuckets = buckets.slice(8);
  if (hiddenBuckets.length > 0) {
    const otherBytes = hiddenBuckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
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

function getNetworkBucketMeta(
  totalBytes: number,
  bucket: GmNetworkBucket,
  elapsedSec: number,
): string {
  return `${formatBytes(bucket.bytes)} · ${formatPercent(bucket.bytes, totalBytes)} · ${bucket.count} 次 · 均次 ${formatAverageBytesPerEvent(bucket.bytes, bucket.count)} · 均秒 ${formatBytesPerSecond(bucket.bytes, elapsedSec)}`;
}

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

function getStatRowMarkup(key: string): string {
  return `
    <div class="network-row" data-key="${escapeHtml(key)}">
      <div class="network-row-main">
        <div class="network-row-label" data-role="label"></div>
        <div class="network-row-meta" data-role="meta"></div>
      </div>
    </div>
  `;
}

function patchStatRow(row: HTMLElement, label: string, meta: string): void {
  row.querySelector<HTMLElement>('[data-role="label"]')!.textContent = label;
  row.querySelector<HTMLElement>('[data-role="meta"]')!.textContent = meta;
}

function renderStructuredStatList(
  container: HTMLElement,
  structureKey: string | null,
  items: Array<{ key: string; label: string; meta: string }>,
  emptyText: string,
): string {
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
    patchStatRow(row, item.label, item.meta);
  });
  return nextStructureKey;
}

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

function getCpuSectionMeta(section: GmCpuSectionSnapshot): string {
  return `${section.totalMs.toFixed(2)} ms · ${section.percent.toFixed(1)}% · ${section.count} 次 · 均次 ${section.avgMs.toFixed(3)} ms`;
}

function getPathfindingFailureMeta(totalFailures: number, count: number): string {
  return `${count} 次 · 占失败 ${formatPercent(count, totalFailures)}`;
}

function renderPerfLists(data: GmStateRes): void {
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const networkInItems = data.perf.networkInBytes > 0
    ? getVisibleNetworkBuckets(data.perf.networkInBuckets).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkInBytes, bucket, elapsedSec),
      }))
    : [];
  const networkOutItems = data.perf.networkOutBytes > 0
    ? getVisibleNetworkBuckets(data.perf.networkOutBuckets).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        meta: getNetworkBucketMeta(data.perf.networkOutBytes, bucket, elapsedSec),
      }))
    : [];
  const cpuItems = getSortedCpuSections(data).map((section) => ({
    key: section.key,
    label: section.label,
    meta: getCpuSectionMeta(section),
  }));
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
  lastPathfindingFailureStructureKey = renderStructuredStatList(
    pathfindingFailureListEl,
    lastPathfindingFailureStructureKey,
    pathfindingFailureItems,
    '当前还没有寻路失败记录。',
  );
}

function renderSuggestionReply(reply: Suggestion['replies'][number]): string {
  return `
    <div class="gm-suggestion-reply ${reply.authorType === 'gm' ? 'gm' : ''}">
      <div class="gm-suggestion-reply-head">
        <div class="gm-suggestion-reply-author">${escapeHtml(reply.authorType === 'gm' ? '开发者' : '发起人')}</div>
        <div>${new Date(reply.createdAt).toLocaleString()}</div>
      </div>
      <div class="gm-suggestion-reply-content">${escapeHtml(reply.content)}</div>
    </div>
  `;
}

function getSuggestionCardMarkup(suggestion: Suggestion): string {
  const completed = suggestion.status === 'completed';
  const score = suggestion.upvotes.length - suggestion.downvotes.length;
  return `
    <div class="gm-suggestion-card ${completed ? 'completed' : ''}" data-suggestion-id="${escapeHtml(suggestion.id)}">
      <div class="gm-suggestion-head">
        <div>
          <div class="gm-suggestion-title">${escapeHtml(suggestion.title)}</div>
          <div class="gm-suggestion-meta">
            发起人：${escapeHtml(suggestion.authorName)}<br />
            创建时间：${new Date(suggestion.createdAt).toLocaleString()}<br />
            状态：${completed ? '已完成' : '待处理'}
          </div>
        </div>
        <div class="gm-suggestion-side">
          <div class="pill" style="background:${completed ? '#2e7d32' : 'var(--ink-grey)'}; color:#fff;">${completed ? '已完成' : '待处理'}</div>
          <div class="gm-suggestion-meta">赞同 ${suggestion.upvotes.length} · 反对 ${suggestion.downvotes.length} · 分值 ${score > 0 ? '+' : ''}${score}</div>
        </div>
      </div>
      <div class="gm-suggestion-body">
        <div class="gm-suggestion-description-wrap">
          <div class="gm-suggestion-section-title">原始意见</div>
          <div class="gm-suggestion-description">${escapeHtml(suggestion.description)}</div>
        </div>
        <div class="gm-suggestion-replies">
          <div class="gm-suggestion-section-title">回复记录</div>
          ${suggestion.replies.length > 0
            ? suggestion.replies.map((reply) => renderSuggestionReply(reply)).join('')
            : '<div class="empty-hint">当前还没有回复记录</div>'}
        </div>
      </div>
      <div class="gm-suggestion-reply-composer">
        <div class="gm-suggestion-section-title">开发者回复</div>
        <textarea
          class="editor-textarea gm-suggestion-reply-input"
          rows="3"
          maxlength="500"
          data-role="reply-input"
          placeholder="输入给玩家的回复内容；回复后玩家端会出现未读红点。"
        ></textarea>
        <div class="button-row gm-suggestion-reply-actions">
          <button class="small-btn primary" type="button" data-action="reply-suggestion">发送回复</button>
        </div>
      </div>
      <div class="gm-suggestion-actions">
        <div class="gm-suggestion-page-meta">该条会话共 ${suggestion.replies.length} 条回复</div>
        <div class="button-row">
          ${completed ? '' : '<button class="primary small-btn" type="button" data-action="complete-suggestion">标记完成</button>'}
          <button class="danger small-btn" type="button" data-action="remove-suggestion">永久移除</button>
        </div>
      </div>
    </div>
  `;
}

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

function setStatus(message: string, isError = false): void {
  statusBarEl.textContent = message;
  statusBarEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
}

const worldViewer = new GmWorldViewer(request, setStatus);

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
      setStatus(error instanceof Error ? error.message : '加载数据库状态失败', true);
    });
  }
}

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

function formatDatabaseJobLabel(data: GmDatabaseStateRes | null): string {
  const job = data?.runningJob ?? data?.lastJob;
  if (!job) {
    return '当前没有数据库任务记录。';
  }
  const action = job.type === 'restore'
    ? `导入 ${job.sourceBackupId ?? '未知备份'}`
    : `导出 ${job.backupId ?? job.kind ?? '备份'}`;
  const status = job.status === 'running'
    ? '进行中'
    : job.status === 'completed'
      ? '已完成'
      : '失败';
  const finishedText = job.finishedAt ? ` · 结束于 ${formatDateTime(job.finishedAt)}` : '';
  const errorText = job.error ? ` · ${job.error}` : '';
  return `${action} · ${status} · 开始于 ${formatDateTime(job.startedAt)}${finishedText}${errorText}`;
}

function renderDatabasePanel(): void {
  const busy = databaseState?.runningJob?.status === 'running';
  const backups = databaseState?.backups ?? [];
  const summary = databaseStateLoading && !databaseState
    ? '正在读取数据库备份状态…'
    : formatDatabaseJobLabel(databaseState);
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

function renderRedeemPanel(): void {
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

function getRedeemCodeMarkup(code: RedeemCodeCodeView): string {
  const meta = [
    `状态 ${getRedeemCodeStatusLabel(code.status)}`,
    code.usedByRoleName ? `使用者 ${code.usedByRoleName}` : null,
    code.usedAt ? `使用时间 ${formatDateTime(code.usedAt)}` : null,
    code.destroyedAt ? `销毁时间 ${formatDateTime(code.destroyedAt)}` : null,
  ].filter((entry): entry is string => typeof entry === 'string').join(' · ');
  return `
    <div class="network-row">
      <div class="network-row-label">${escapeHtml(code.code)}</div>
      <div class="network-row-meta">${escapeHtml(meta || `创建于 ${formatDateTime(code.createdAt)}`)}</div>
      <div class="button-row" style="margin-top: 8px;">
        ${code.status === 'active'
          ? `<button class="small-btn danger" type="button" data-action="destroy-redeem-code" data-code-id="${code.id}">销毁</button>`
          : ''}
      </div>
    </div>
  `;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
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

async function copyActiveRedeemCodes(): Promise<void> {
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

function getRedeemCodeStatusLabel(status: RedeemCodeCodeView['status']): string {
  switch (status) {
    case 'active':
      return '可用';
    case 'used':
      return '已使用';
    case 'destroyed':
      return '已销毁';
    default:
      return status;
  }
}

function buildRedeemGroupPayload(): { name: string; rewards: RedeemCodeGroupRewardItem[] } {
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

async function loadRedeemGroups(silent = false): Promise<void> {
  redeemLoading = true;
  renderRedeemPanel();
  try {
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

async function loadRedeemGroupDetail(groupId: string, silent = false): Promise<void> {
  redeemLoading = true;
  renderRedeemPanel();
  try {
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

async function createRedeemGroup(): Promise<void> {
  const payloadBase = buildRedeemGroupPayload();
  const payload: GmCreateRedeemCodeGroupReq = {
    ...payloadBase,
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.createCount || '0')) || 0)),
  };
  const result = await request<GmCreateRedeemCodeGroupRes>('/gm/redeem-code-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  selectedRedeemGroupId = result.group.id;
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(`已创建分组 ${result.group.name}，并生成 ${result.codes.length} 个兑换码`);
}

async function saveRedeemGroup(): Promise<void> {
  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
  }
  const payload: GmUpdateRedeemCodeGroupReq = buildRedeemGroupPayload();
  await request<GmRedeemCodeGroupDetailRes>(`/gm/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  redeemLatestGeneratedCodes = [];
  await loadRedeemGroups(true);
  setStatus('兑换码分组已保存');
}

async function appendRedeemCodes(): Promise<void> {
  if (!selectedRedeemGroupId) {
    throw new Error('请先选择一个分组');
  }
  const payload: GmAppendRedeemCodesReq = {
    count: Math.max(1, Math.min(500, Math.floor(Number(redeemDraft.appendCount || '0')) || 0)),
  };
  const result = await request<GmAppendRedeemCodesRes>(`/gm/redeem-code-groups/${encodeURIComponent(selectedRedeemGroupId)}/codes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  redeemLatestGeneratedCodes = [...result.codes];
  await loadRedeemGroups(true);
  setStatus(`已追加 ${result.codes.length} 个兑换码`);
}

async function destroyRedeemCode(codeId: string): Promise<void> {
  await request<{ ok: true }>(`/gm/redeem-codes/${encodeURIComponent(codeId)}`, {
    method: 'DELETE',
  });
  await loadRedeemGroups(true);
  setStatus('兑换码已销毁');
}

async function loadDatabaseState(silent = false): Promise<void> {
  if (!token) {
    return;
  }
  databaseStateLoading = true;
  renderDatabasePanel();
  try {
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

async function exportCurrentDatabase(): Promise<void> {
  const result = await request<GmTriggerDatabaseBackupRes>('/gm/database/backup', {
    method: 'POST',
  });
  setStatus(`已开始导出当前数据库：${result.job.backupId ?? result.job.id}`);
  await loadDatabaseState(true);
}

function getDownloadFileName(response: Response, fallback: string): string {
  const header = response.headers.get('content-disposition') ?? '';
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/iu);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const basicMatch = header.match(/filename="?([^";]+)"?/iu);
  return basicMatch?.[1] ?? fallback;
}

async function downloadDatabaseBackup(backupId: string): Promise<void> {
  const response = await requestBlob(`/gm/database/backups/${encodeURIComponent(backupId)}/download`);
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

async function restoreDatabaseBackup(backupId: string): Promise<void> {
  const backup = databaseState?.backups.find((entry) => entry.id === backupId);
  if (!backup) {
    setStatus('目标备份不存在', true);
    return;
  }
  const confirmed = window.confirm(`将使用备份 ${backup.fileName} 覆盖当前数据库。\n服务端会先自动备份当前库，并断开在线玩家连接。是否继续？`);
  if (!confirmed) {
    return;
  }
  const body: GmRestoreDatabaseReq = { backupId };
  const result = await request<GmTriggerDatabaseBackupRes>('/gm/database/restore', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setStatus(`已开始导入数据库备份：${result.job.sourceBackupId ?? backup.fileName}`);
  await loadDatabaseState(true);
}

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

async function loadSuggestions(): Promise<void> {
  try {
    const params = new URLSearchParams({
      page: String(currentSuggestionPage),
      pageSize: '10',
    });
    if (currentSuggestionKeyword.trim()) {
      params.set('keyword', currentSuggestionKeyword.trim());
    }
    const result = await request<GmSuggestionListRes>(`/gm/suggestions?${params.toString()}`);
    suggestions = result.items;
    currentSuggestionPage = result.page;
    currentSuggestionTotalPages = result.totalPages;
    currentSuggestionTotal = result.total;
    renderSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '加载建议失败', true);
  }
}

async function loadEditorCatalog(): Promise<void> {
  try {
    editorCatalog = await request<GmEditorCatalogRes>('/gm/editor-catalog');
  } catch {
    const localCatalog = getLocalEditorCatalog();
    editorCatalog = {
      ...localCatalog,
      buffs: localCatalog.buffs ?? [],
    };
  }
  renderShortcutMailComposer();
}

function renderShortcutMailComposer(preserveActiveInteraction = false): void {
  if (!shortcutMailComposerEl) {
    return;
  }
  if (broadcastMailDraft.targetPlayerId) {
    const targetExists = (state?.players ?? []).some((player) => player.id === broadcastMailDraft.targetPlayerId);
    if (!targetExists) {
      broadcastMailDraft.targetPlayerId = '';
    }
  }
  const targetPlayer = broadcastMailDraft.targetPlayerId
    ? (state?.players.find((player) => player.id === broadcastMailDraft.targetPlayerId) ?? null)
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

function flushShortcutMailComposerRefresh(): void {
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
  lastShortcutMailComposerStructureKey = null;
  shortcutMailComposerRefreshBlocked = false;
  renderShortcutMailComposer(true);
}

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

async function completeSuggestion(id: string): Promise<void> {
  try {
    await request(`/gm/suggestions/${id}/complete`, { method: 'POST' });
    setStatus('建议已标记为完成');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '操作失败', true);
  }
}

async function replySuggestion(id: string, content: string): Promise<void> {
  try {
    await request(`/gm/suggestions/${id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ content } satisfies GmReplySuggestionReq),
    });
    setStatus('开发者回复已发送');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '发送回复失败', true);
  }
}

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
    setStatus(error instanceof Error ? error.message : '移除失败', true);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  if (response.status === 401 && path !== '/auth/gm/login') {
    logout('GM 登录已失效，请重新输入密码');
    throw new Error('GM 登录已失效');
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as { message: unknown }).message)
      : typeof data === 'string' && data.trim().length > 0
        ? data
        : '请求失败';
    throw new Error(message);
  }
  return data as T;
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Response> {
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

function updateMailDraftValue(
  scope: 'direct' | 'shortcut',
  path: string,
  rawValue: string,
): void {
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

function rerenderDirectMailComposer(): void {
  if (!state) {
    return;
  }
  lastEditorStructureKey = null;
  renderEditor(state);
}

function addMailAttachment(scope: 'direct' | 'shortcut'): void {
  const draft = scope === 'direct' ? directMailDraft : broadcastMailDraft;
  draft.attachments.push(createDefaultMailAttachmentDraft());
  resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer();
    return;
  }
  renderShortcutMailComposer();
}

function removeMailAttachment(scope: 'direct' | 'shortcut', index: number): void {
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

async function sendDirectMail(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail) {
    throw new Error('当前没有可发送邮件的角色');
  }
  const payload = getMailComposerPayload(directMailDraft);
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

async function sendShortcutMail(): Promise<void> {
  const payload = getMailComposerPayload(broadcastMailDraft);
  const targetPlayerId = broadcastMailDraft.targetPlayerId.trim();
  const path = targetPlayerId
    ? `/gm/players/${encodeURIComponent(targetPlayerId)}/mail`
    : '/gm/mail/broadcast';
  const result = await request<{ ok: true; mailId: string; batchId?: string; recipientCount?: number }>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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

function getSelectedPlayer(): GmManagedPlayerSummary | null {
  if (!state || !selectedPlayerId) return null;
  return state.players.find((player) => player.id === selectedPlayerId) ?? null;
}

function getSelectedPlayerDetail(): GmManagedPlayerRecord | null {
  return selectedPlayerDetail && selectedPlayerDetail.id === selectedPlayerId
    ? selectedPlayerDetail
    : null;
}

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

function updateInventoryAddControls(resetSelectedItem = true): void {
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

function pathSegments(path: string): string[] {
  return path.split('.');
}

function setValueByPath(target: unknown, path: string, value: unknown): void {
  const segments = pathSegments(path);
  let cursor = target as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (next === undefined || next === null) {
      cursor[key] = /^\d+$/.test(segments[index + 1] ?? '') ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

function getValueByPath(target: unknown, path: string): unknown {
  let cursor = target as Record<string, unknown> | undefined;
  for (const segment of pathSegments(path)) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment] as Record<string, unknown> | undefined;
  }
  return cursor;
}

function removeArrayIndex(target: unknown, path: string, index: number): void {
  const value = getValueByPath(target, path);
  if (!Array.isArray(value)) return;
  value.splice(index, 1);
}

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function buildHtmlAttributes(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(value ?? '')}"`)
    .join('');
}

function getSearchableItemDisplayValue(itemId: string): string {
  if (!itemId) {
    return '';
  }
  const entry = findItemCatalogEntry(itemId);
  return entry ? `${entry.name} · ${itemId}` : itemId;
}

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

function getSearchableItemValueField(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-value]');
}

function getSearchableItemInput(root: ParentNode): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>('input[data-item-combobox-input]');
}

function getSearchableItemList(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-list]');
}

function getSearchableItemHint(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-hint]');
}

function getSearchableItemPopover(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-item-combobox-popover]');
}

function normalizeSearchableItemText(value: string): string {
  return value.trim().toLowerCase();
}

function renderSearchableItemOptions(root: HTMLElement): void {
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

function syncSearchableItemField(root: HTMLElement): void {
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

function syncSearchableItemFields(scope: ParentNode): void {
  if (activeSearchableItemField && !activeSearchableItemField.isConnected) {
    activeSearchableItemField = null;
  }
  scope.querySelectorAll<HTMLElement>('[data-item-combobox]').forEach((field) => {
    syncSearchableItemField(field);
  });
}

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

function openSearchableItemField(root: HTMLElement, resetQuery = true): void {
  if (activeSearchableItemField && activeSearchableItemField !== root) {
    closeSearchableItemField(activeSearchableItemField);
  }
  const input = getSearchableItemInput(root);
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

function moveSearchableItemActiveIndex(root: HTMLElement, offset: number): void {
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

function commitSearchableItemSelection(root: HTMLElement, value: string): void {
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

function optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string {
  return options.map((option) => `
    <option value="${escapeHtml(String(option.value))}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

function nullableTextField(label: string, path: string, value: string | undefined, emptyMode: 'undefined' | 'null' = 'undefined', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="nullable-string" data-empty-mode="${emptyMode}" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-bind="${escapeHtml(path)}" data-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}

function checkboxField(label: string, path: string, checked: boolean | undefined): string {
  return `
    <label class="editor-toggle">
      <input type="checkbox" data-bind="${escapeHtml(path)}" data-kind="boolean" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function selectField(
  label: string,
  path: string,
  value: string | number | undefined,
  options: Array<{ value: string | number; label: string }>,
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

function jsonField(label: string, path: string, value: unknown, emptyValue: 'null' | 'object' | 'array' = 'object', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="json" data-empty-json="${emptyValue}">${escapeHtml(formatJson(value ?? (emptyValue === 'array' ? [] : emptyValue === 'null' ? null : {})))}</textarea>
    </label>
  `;
}

function stringArrayField(label: string, path: string, value: string[] | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}<span class="editor-section-note"> 每行一项</span></span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="string-array">${escapeHtml((value ?? []).join('\n'))}</textarea>
    </label>
  `;
}

function readonlyCodeBlock(title: string, path: string, value: unknown): string {
  return `
    <div class="editor-field wide">
      <span>${escapeHtml(title)}</span>
      <div class="editor-code" data-preview="readonly" data-path="${escapeHtml(path)}">${escapeHtml(formatJson(value))}</div>
    </div>
  `;
}

function renderEditorTabSection(tab: GmEditorTab, content: string): string {
  return `<div data-editor-tab="${tab}">${content}</div>`;
}

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
          <span>是否在线</span>
          <div class="editor-code">${escapeHtml(getManagedAccountStatusLabel(player))}</div>
        </div>
        <div class="editor-field">
          <span>上次在线时间</span>
          <div class="editor-code">${escapeHtml(formatDateTime(player.meta.lastHeartbeatAt))}</div>
        </div>
        <div class="editor-field">
          <span>累计在线时间</span>
          <div class="editor-code">${escapeHtml(formatDurationSeconds(account.totalOnlineSeconds))}</div>
        </div>
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        <label class="editor-field">
          <span>新密码</span>
          <input id="player-password-next" type="text" autocomplete="off" spellcheck="false" placeholder="输入新的账号密码" />
        </label>
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-action="save-player-account">修改账号</button>
        <button class="small-btn" type="button" data-action="save-player-password">修改账号密码</button>
      </div>
      <div class="editor-note">密码只会提交到服务端，并由服务端写入 bcrypt 哈希，不会以明文落库。</div>
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

function renderSummary(data: GmStateRes): void {
  const humanPlayers = data.players.filter((player) => !player.meta.isBot);
  const onlineCount = humanPlayers.filter((player) => player.meta.online).length;
  const offlineHangingCount = humanPlayers.filter((player) => !player.meta.online && player.meta.inWorld).length;
  const offlineCount = humanPlayers.filter((player) => !player.meta.online && !player.meta.inWorld).length;
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const startedAt = data.perf.networkStatsStartedAt > 0 ? new Date(data.perf.networkStatsStartedAt) : null;
  const tickPerf = getTickPerf(data.perf);
  summaryTotalEl.textContent = `${humanPlayers.length}`;
  summaryOnlineEl.textContent = `${onlineCount}`;
  summaryOfflineHangingEl.textContent = `${offlineHangingCount}`;
  summaryOfflineEl.textContent = `${offlineCount}`;
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

function renderPlayerList(data: GmStateRes): void {
  const filtered = getFilteredPlayers(data);

  if (!selectedPlayerId || !filtered.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = filtered[0]?.id ?? data.players[0]?.id ?? null;
  }

  if (filtered.length === 0) {
    if (lastPlayerListStructureKey !== 'empty') {
      playerListEl.innerHTML = '<div class="empty-hint">没有符合筛选条件的角色。</div>';
      lastPlayerListStructureKey = 'empty';
    }
    return;
  }

  const structureKey = filtered.map((player) => player.id).join('|');
  if (lastPlayerListStructureKey !== structureKey) {
    playerListEl.innerHTML = filtered.map((player) => getPlayerRowMarkup(player)).join('');
    lastPlayerListStructureKey = structureKey;
  }

  filtered.forEach((player, index) => {
    const row = playerListEl.children[index];
    if (!(row instanceof HTMLButtonElement)) {
      return;
    }
    patchPlayerRow(row, player, player.id === selectedPlayerId);
  });
}

function renderEditor(data: GmStateRes): void {
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

function getEditorTabSection(tab: GmEditorTab): HTMLElement | null {
  return editorContentEl.querySelector<HTMLElement>(`[data-editor-tab="${tab}"]`);
}

function syncVisualEditorToDraft(scope?: ParentNode): { ok: true } | { ok: false; message: string } {
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

  draftSnapshot = next;
  editorDirty = true;
  playerJsonEl.value = formatJson(draftSnapshot);
  return { ok: true };
}

function mutateDraft(mutator: (draft: PlayerState) => void): boolean {
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

function applyCatalogBindingChange(path: string, value: string): boolean {
  if (!draftSnapshot) return false;

  let changed = false;
  const inventoryMatch = path.match(/^inventory\.items\.(\d+)\.itemId$/);
  if (inventoryMatch) {
    const index = Number(inventoryMatch[1]);
    const previousCount = draftSnapshot.inventory.items[index]?.count ?? 1;
    draftSnapshot.inventory.items[index] = createItemFromCatalog(value, previousCount);
    changed = true;
  }

  const equipmentMatch = path.match(/^equipment\.(weapon|head|body|legs|accessory)\.itemId$/);
  if (equipmentMatch) {
    const slot = equipmentMatch[1] as EquipSlot;
    draftSnapshot.equipment[slot] = createItemFromCatalog(value);
    changed = true;
  }

  const techniqueMatch = path.match(/^techniques\.(\d+)\.techId$/);
  if (techniqueMatch) {
    const index = Number(techniqueMatch[1]);
    draftSnapshot.techniques[index] = createTechniqueFromCatalog(value);
    changed = true;
  }

  const buffMatch = path.match(/^temporaryBuffs\.(\d+)\.buffId$/);
  if (buffMatch) {
    const index = Number(buffMatch[1]);
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

async function loadState(silent = false, refreshDetail = false): Promise<void> {
  if (!token) return;
  const data = await request<GmStateRes>('/gm/state');
  state = data;
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
    loadingPlayerDetailId = null;
  }
  if (!silent) {
    setStatus(`已同步 ${data.players.length} 条角色数据`);
  }
  if (currentTab === 'server' && currentServerTab === 'database') {
    await loadDatabaseState(true);
  }
  // 同步地图列表到世界管理
  if (currentTab === 'world') {
    worldViewer.updateMapIds(data.mapIds);
  }
}

async function loadSelectedPlayerDetail(playerId: string, silent = false): Promise<void> {
  const nonce = ++detailRequestNonce;
  loadingPlayerDetailId = playerId;
  clearEditorRenderCache();
  render();
  try {
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

function startPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(() => {
    loadState(true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '刷新失败', true);
    });
  }, GM_PANEL_POLL_INTERVAL_MS);
}

function showShell(): void {
  loginOverlay.classList.add('hidden');
  gmShell.classList.remove('hidden');
}

function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  gmShell.classList.add('hidden');
  syncPersistedGmPasswordToInputs();
}

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

async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, GM_APPLY_DELAY_MS));
  await loadState(true, true);
  setStatus(`${message}，已完成同步`);
}

async function login(): Promise<void> {
  const password = passwordInput.value.trim();
  if (!password) {
    loginErrorEl.textContent = '请输入 GM 密码';
    return;
  }

  loginSubmitBtn.disabled = true;
  loginErrorEl.textContent = '';

  try {
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

async function changeGmPassword(): Promise<void> {
  const currentPassword = gmPasswordCurrentInput.value.trim();
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

async function applyRawJson(): Promise<void> {
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

function getCurrentEditorSaveSection(): GmPlayerUpdateSection | null {
  return currentEditorTab === 'persisted' || currentEditorTab === 'mail' || currentEditorTab === 'shortcuts' ? null : currentEditorTab;
}

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
  };
}

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
  };
}

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

async function saveSelectedPlayerSections(sections: GmPlayerUpdateSection[], message: string): Promise<void> {
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
    const learnedTechniqueIds = new Set(ensureArray(draftSnapshot.techniques).map((technique) => technique.techId).filter(Boolean));
    const existingInventoryItemIds = new Set(ensureArray(draftSnapshot.inventory.items).map((item) => item.itemId));
    const bookItemIds = editorCatalog.items
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
  const missingTechniqueIds = editorCatalog.techniques
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

async function refreshSelectedPlayer(): Promise<void> {
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
    setStatus(error instanceof Error ? error.message : '刷新角色详情失败', true);
  } finally {
    refreshPlayerBtn.disabled = false;
  }
}

async function saveSelectedPlayer(): Promise<void> {
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

  const synced = syncVisualEditorToDraft(getEditorTabSection(section) ?? undefined);
  if (!synced.ok || !draftSnapshot) {
    setStatus(synced.ok ? '当前没有可保存内容' : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    const snapshot = buildSectionSnapshot(section, draftSnapshot);
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot, section } satisfies GmUpdatePlayerReq),
    });
    editorDirty = false;
    await delayRefresh(`已提交 ${selected.name} 的${getEditorTabLabel(section)}修改`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    savePlayerBtn.disabled = false;
  }
}

async function saveSelectedPlayerPassword(): Promise<void> {
  const detail = getSelectedPlayerDetail();
  if (!detail?.account) {
    setStatus('当前目标没有可修改的账号密码', true);
    return;
  }

  const nextInput = editorContentEl.querySelector<HTMLInputElement>('#player-password-next');
  const button = editorContentEl.querySelector<HTMLButtonElement>('[data-action="save-player-password"]');
  const newPassword = nextInput?.value.trim() ?? '';

  if (!newPassword) {
    setStatus('请填写新密码', true);
    return;
  }

  if (button) {
    button.disabled = true;
  }
  try {
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword } satisfies GmUpdateManagedPlayerPasswordReq),
    });
    if (nextInput) {
      nextInput.value = '';
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

async function saveSelectedPlayerAccount(): Promise<void> {
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
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(detail.id)}/account`, {
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

async function resetSelectedPlayer(): Promise<void> {
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  resetPlayerBtn.disabled = true;
  try {
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}/reset`, {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(`已让 ${selected.name} 返回出生点`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置失败', true);
  } finally {
    resetPlayerBtn.disabled = false;
  }
}

async function resetSelectedPlayerHeavenGate(): Promise<void> {
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  resetHeavenGateBtn.disabled = true;
  try {
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}/heaven-gate/reset`, {
      method: 'POST',
    });
    editorDirty = false;
    await delayRefresh(`已重置 ${selected.name} 的天门测试状态`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '重置天门失败', true);
  } finally {
    resetHeavenGateBtn.disabled = false;
  }
}

async function removeSelectedBot(): Promise<void> {
  const selected = getSelectedPlayer();
  if (!selected || !selected.meta.isBot) {
    setStatus('当前选中目标不是机器人', true);
    return;
  }

  removeBotBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/bots/remove', {
      method: 'POST',
      body: JSON.stringify({ playerIds: [selected.id] } satisfies GmRemoveBotsReq),
    });
    editorDirty = false;
    await delayRefresh(`已移除机器人 ${selected.name}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  } finally {
    removeBotBtn.disabled = false;
  }
}

async function spawnBots(): Promise<void> {
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
    await request<{ ok: true }>('/gm/bots/spawn', {
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

async function removeAllBots(): Promise<void> {
  try {
    await request<{ ok: true }>('/gm/bots/remove', {
      method: 'POST',
      body: JSON.stringify({ all: true } satisfies GmRemoveBotsReq),
    });
    editorDirty = false;
    await delayRefresh('已提交移除全部机器人');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  }
}

async function returnAllPlayersToDefaultSpawn(): Promise<void> {
  if (!window.confirm('这会把所有非机器人角色统一送回新手村出生点。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
    return;
  }

  const button = document.getElementById('shortcut-return-all-to-default-spawn') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/players/return-all-to-default-spawn', {
      method: 'POST',
    });
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

async function compensateAllPlayersCombatExp(): Promise<void> {
  if (!window.confirm('这会给所有非机器人角色补偿战斗经验。每个角色获得的数值 = 当前境界升级所需经验 + 当前炼体境界升级所需经验。在线角色下一息生效，离线角色会直接改存档。确认继续吗？')) {
    return;
  }

  const button = document.getElementById('shortcut-compensate-combat-exp-2026-04-09') as HTMLButtonElement | null;
  if (button) {
    button.disabled = true;
  }
  try {
    const result = await request<GmShortcutRunRes>('/gm/shortcuts/compensation/combat-exp-2026-04-09', {
      method: 'POST',
    });
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

async function resetNetworkStats(): Promise<void> {
  resetNetworkStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/network/reset', {
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

async function resetCpuStats(): Promise<void> {
  resetCpuStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/cpu/reset', {
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

async function resetPathfindingStats(): Promise<void> {
  resetPathfindingStatsBtn.disabled = true;
  try {
    await request<{ ok: true }>('/gm/perf/pathfinding/reset', {
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

function handleEditorAction(action: string, trigger: HTMLElement): void {
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
  selectedPlayerId = playerId;
  selectedPlayerDetail = null;
  loadingPlayerDetailId = playerId;
  draftSnapshot = null;
  draftSourcePlayerId = null;
  editorDirty = false;
  render();
  loadSelectedPlayerDetail(playerId, true).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : '加载角色详情失败', true);
  });
});

editorContentEl.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
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
  if (!state) return;
  const previousSelectedPlayerId = selectedPlayerId;
  renderPlayerList(state);
  const selectedChanged = previousSelectedPlayerId !== selectedPlayerId;
  if (selectedChanged) {
    selectedPlayerDetail = null;
    loadingPlayerDetailId = selectedPlayerId;
    draftSnapshot = null;
    draftSourcePlayerId = null;
    editorDirty = false;
  }
  renderEditor(state);
  if (selectedChanged && selectedPlayerId) {
    loadSelectedPlayerDetail(selectedPlayerId, true).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载角色详情失败', true);
    });
  }
});
playerSortSelect.addEventListener('change', () => {
  currentPlayerSort = (playerSortSelect.value as PlayerSortMode) || 'realm-desc';
  lastPlayerListStructureKey = null;
  if (!state) return;
  renderPlayerList(state);
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
document.getElementById('shortcut-compensate-combat-exp-2026-04-09')?.addEventListener('click', () => {
  compensateAllPlayersCombatExp().catch(() => {});
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
    selectedRedeemGroupId = groupId;
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
resetCpuStatsBtn.addEventListener('click', () => {
  resetCpuStats().catch(() => {});
});
resetPathfindingStatsBtn.addEventListener('click', () => {
  resetPathfindingStats().catch(() => {});
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
