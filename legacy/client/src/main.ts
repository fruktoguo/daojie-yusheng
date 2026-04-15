/**
 * 游戏客户端主入口 —— 初始化所有子系统、绑定网络事件、驱动渲染循环
 */

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/hud.css';
import './styles/overlays.css';
import './styles/panels.css';
import './styles/responsive.css';

import { startClientVersionReload } from './version-reload';
import { SocketManager } from './network/socket';
import { KeyboardInput } from './input/keyboard';
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
import { MarketPanel } from './ui/panels/market-panel';
import { ActionPanel } from './ui/panels/action-panel';
import { LootPanel } from './ui/panels/loot-panel';
import { SettingsPanel } from './ui/panels/settings-panel';
import { WorldPanel } from './ui/panels/world-panel';
import { MailPanel } from './ui/mail-panel';
import { SuggestionPanel } from './ui/suggestion-panel';
import { ChangelogPanel } from './ui/changelog-panel';
import { TutorialPanel } from './ui/tutorial-panel';
import { LeaderboardModal } from './ui/leaderboard-modal';
import { WorldSummaryModal } from './ui/world-summary-modal';
import { getMonsterPresentation } from './monster-presentation';
import { NpcShopModal } from './ui/npc-shop-modal';
import { AlchemyModal } from './ui/alchemy-modal';
import { EnhancementModal } from './ui/enhancement-modal';
import { getHeavenGateHudAction, openHeavenGateModal, refreshHeavenGateModal } from './ui/heaven-gate-modal';
import { initializeUiStyleConfig } from './ui/ui-style-config';
import { createClientPanelSystem } from './ui/panel-system/bootstrap';
import { RESPONSIVE_VIEWPORT_CHANGE_EVENT, bindResponsiveViewportCss } from './ui/responsive-viewport';
import { createMapRuntime } from './game-map/runtime/map-runtime';
import { getLatestObservedEntitiesSnapshot } from './game-map/store/map-store';
import { getEntityKindLabel, getTileTypeLabel } from './domain-labels';
import { MAP_FALLBACK } from './constants/world/world-panel';
import { MAP_FPS_SAMPLE_INTERVAL_MS, MAP_FPS_SAMPLE_WINDOW_SIZE } from './constants/ui/performance';
import {
  getLocalItemTemplate,
  getLocalSkillTemplate,
  getLocalTechniqueTemplate,
  resolvePreviewTechnique,
  resolvePreviewTechniques,
} from './content/local-templates';
import { scheduleDeferredLocalContentPreload } from './content/deferred-local-content';
import { hydrateQuestStates } from './content/local-quests';
import { assessMapDanger } from './utils/map-danger';
import { syncEstimatedServerTick, syncEstimatedServerTickInterval } from './runtime/server-tick';

import { FloatingTooltip, prefersPinnedTooltipInteraction } from './ui/floating-tooltip';
import { detailModalHost } from './ui/detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip, renderTextWithInlineItemHighlights } from './ui/item-inline-tooltip';
import { describePreviewBonuses } from './ui/stat-preview';
import {
  initializeMapPerformanceConfig,
  MAP_PERFORMANCE_CONFIG_CHANGE_EVENT,
  type MapPerformanceConfig,
} from './ui/performance-config';
import { MAX_ZOOM, MIN_ZOOM, getDisplayRangeX, getDisplayRangeY, getZoom, setZoom } from './display';
import { getAccessToken, getCurrentAccountName } from './ui/auth-api';
import { formatDisplayCountBadge, formatDisplayCurrentMax, formatDisplayInteger } from './utils/number';
import { findPath } from './pathfinding';
import {
  computeAffectedCellsForAction as computeAffectedCellsForActionHelper,
  getEffectiveTargetingGeometry as getEffectiveTargetingGeometryHelper,
  getSkillDefByActionId as getSkillDefByActionIdHelper,
  hasAffectableTargetInArea as hasAffectableTargetInAreaHelper,
  resolveCurrentTargetingRange as resolveCurrentTargetingRangeHelper,
  resolveTargetRefForAction as resolveTargetRefForActionHelper,
} from './main-targeting-helpers';
import {
  ActionDef,
  AccountRedeemCodesRes,
  buildEffectiveTargetingGeometry,
  resolveTargetingGeometry,
  computeAffectedCellsFromAnchor,
  CONNECTION_RECOVERY_RETRY_MS,
  CURRENT_TIME_REFRESH_MS,
  DEFAULT_AURA_LEVEL_BASE_VALUE,
  Direction,
  EQUIP_SLOTS,
  formatBuffMaxStacks,
  encodeTileTargetRef,
  GAME_TIME_PHASES,
  GameTimeState,
  gridDistance,
  GroundItemPileView,
  GridPoint,
  Inventory,
  isPointInRange,
  LootWindowState,
  MapMeta,
  MonsterTier,
  PartialNumericStats,
  PlayerState,
  packDirections,
  RenderEntity,
  S2C_AttrUpdate,
  S2C_EquipmentUpdate,
  S2C_InventoryUpdate,
  S2C_LootWindowUpdate,
  S2C_RealmUpdate,
  S2C_RedeemCodesResult,
  TechniqueUpdateEntry,
  ActionUpdateEntry,
  BreakthroughRequirementView,
  SkillDef,
  Tile,
  TileType,
  TechniqueState,
  S2C_Init,
  S2C_MapStaticSync,
  S2C_NpcShop,
  S2C_TileRuntimeDetail,
  S2C_Tick,
  SERVER_PING_INTERVAL_MS,
  SOCKET_PING_TIMEOUT_MS,
  TargetingGeometrySpec,
  TargetingShape,
  VisibleBuffState,
  VIEW_RADIUS,
  SyncedItemStack,
  TechniqueRealm,
  directionToDelta,
  getTileTraversalCost,
  clonePlainValue,
  getFirstGrapheme,
  isPlainEqual,
} from '@mud/shared';

const canvasHost = document.getElementById('game-stage') as HTMLElement;
const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement | null;
const zoomLevelEl = document.getElementById('zoom-level');
const zoomResetBtn = document.getElementById('zoom-reset') as HTMLButtonElement | null;
const tickRateEl = document.getElementById('map-tick-rate');

scheduleDeferredLocalContentPreload();
const currentTimeEl = document.getElementById('map-current-time');
const currentTimeValueEl = document.getElementById('map-current-time-value');
const currentTimePhaseEl = document.getElementById('map-current-time-phase');
const currentTimeHourAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-a"]');
const currentTimeHourBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-b"]');
const currentTimeDotEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="dot"]');
const currentTimeMinAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-a"]');
const currentTimeMinBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-b"]');
const tickRateValueEl = document.getElementById('map-tick-rate-value');
const tickRateIntEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="int"]');
const tickRateDotEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="dot"]');
const tickRateFracAEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-a"]');
const tickRateFracBEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-b"]');
const fpsRateEl = document.getElementById('map-fps-rate');
const fpsValueEl = document.getElementById('map-fps-value');
const fpsLowValueEl = document.getElementById('map-fps-low-value');
const fpsOnePercentValueEl = document.getElementById('map-fps-one-percent-value');
const pingLatencyEl = document.getElementById('map-ping-rate');
const pingValueEl = document.getElementById('map-ping-value');
const pingUnitEl = document.getElementById('map-ping-unit');
const pingHundredsEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="hundreds"]');
const pingTensEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="tens"]');
const pingOnesEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="ones"]');
const joinQqGroupBtns = document.querySelectorAll<HTMLAnchorElement>('[data-qq-group-link="true"]');

const QQ_GROUP_NUMBER = '940886387';
const QQ_GROUP_MOBILE_DEEP_LINK = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
const QQ_GROUP_DESKTOP_DEEP_LINK = `tencent://AddContact/?fromId=45&fromSubId=1&subcmd=all&uin=${QQ_GROUP_NUMBER}`;

let auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;
let pendingQuestNavigateId: string | null = null;
let pendingRedeemCodesRequest:
  | {
      resolve: (value: AccountRedeemCodesRes) => void;
      reject: (reason?: unknown) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;
let activeObservedTile:
  | {
      mapId: string;
      x: number;
      y: number;
    }
  | null = null;
let activeObservedTileDetail: S2C_TileRuntimeDetail | null = null;

let connectionRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let connectionRecoveryPromise: Promise<void> | null = null;
let pingTimer: ReturnType<typeof setTimeout> | null = null;
let pingRequestSerial = 0;
let pendingSocketPing:
  | {
      serial: number;
      clientAt: number;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;
let currentTimeStateSyncedAt = performance.now();
let currentTimeTickIntervalMs = 1000;
let currentTimeTickIntervalUpdatedAt = performance.now();
let fpsMonitorFrameRequestId: number | null = null;
let fpsMonitorEnabled = false;
let fpsSampleFrameCount = 0;
let fpsSampleStartedAt = performance.now();
let fpsLastFrameAt = 0;
let fpsFrameDurations: number[] = [];
let fpsFrameDurationWriteIndex = 0;

const PING_BLOCKED_TICK_INTERVAL_MS = 1_500;
const PING_BLOCKED_TICK_GRACE_MS = 8_000;

type FpsSampleStats = {
  fps: number | null;
  low: number | null;
  onePercentLow: number | null;
};

/** formatFpsMetric：格式化输出字符串用于展示。 */
function formatFpsMetric(value: number | null): string {
  if (value === null) {
    return '---';
  }
  return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, '0');
}

/** renderFpsStats：渲染当前界面内容。 */
function renderFpsStats(stats: FpsSampleStats): void {
  if (fpsValueEl) {
    fpsValueEl.textContent = formatFpsMetric(stats.fps);
  }
  if (fpsLowValueEl) {
    fpsLowValueEl.textContent = formatFpsMetric(stats.low);
  }
  if (fpsOnePercentValueEl) {
    fpsOnePercentValueEl.textContent = formatFpsMetric(stats.onePercentLow);
  }
  if (fpsRateEl) {
    fpsRateEl.setAttribute(
      'title',
      stats.fps === null
        ? '客户端当前渲染帧率未采样'
        : `客户端当前渲染帧率约 ${Math.round(stats.fps)} FPS，LOW ${Math.round(stats.low ?? stats.fps)}，1% LOW ${Math.round(stats.onePercentLow ?? stats.fps)}`,
    );
  }
}

/** resetFpsMonitorSamples：重置为初始状态。 */
function resetFpsMonitorSamples(now = performance.now()): void {
  fpsSampleFrameCount = 0;
  fpsSampleStartedAt = now;
  fpsLastFrameAt = 0;
  fpsFrameDurations = [];
  fpsFrameDurationWriteIndex = 0;
}


function appendFpsFrameDuration(frameDurationMs: number): void {
  const safeDuration = Math.max(1, frameDurationMs);
  if (fpsFrameDurations.length < MAP_FPS_SAMPLE_WINDOW_SIZE) {
    fpsFrameDurations.push(safeDuration);
    fpsFrameDurationWriteIndex = fpsFrameDurations.length % MAP_FPS_SAMPLE_WINDOW_SIZE;
    return;
  }
  fpsFrameDurations[fpsFrameDurationWriteIndex] = safeDuration;
  fpsFrameDurationWriteIndex = (fpsFrameDurationWriteIndex + 1) % MAP_FPS_SAMPLE_WINDOW_SIZE;
}


function resolveFpsLowStats(): Pick<FpsSampleStats, 'low' | 'onePercentLow'> {
  if (fpsFrameDurations.length === 0) {
    return {
      low: null,
      onePercentLow: null,
    };
  }
  const sortedDurations = [...fpsFrameDurations].sort((left, right) => right - left);
  const slowestDuration = sortedDurations[0] ?? null;
  const onePercentCount = Math.max(1, Math.ceil(sortedDurations.length * 0.01));
  let onePercentTotalDuration = 0;
  for (let index = 0; index < onePercentCount; index += 1) {
    onePercentTotalDuration += sortedDurations[index] ?? 0;
  }
  return {
    low: slowestDuration === null ? null : 1000 / slowestDuration,
    onePercentLow: onePercentTotalDuration > 0 ? 1000 / (onePercentTotalDuration / onePercentCount) : null,
  };
}


function tickFpsMonitor(now: number): void {
  if (!fpsMonitorEnabled) {
    fpsMonitorFrameRequestId = null;
    return;
  }

  if (fpsLastFrameAt > 0) {
    const frameDuration = now - fpsLastFrameAt;
    if (frameDuration <= 1000) {
      appendFpsFrameDuration(frameDuration);
    } else {
      resetFpsMonitorSamples(now);
    }
  }
  fpsLastFrameAt = now;
  fpsSampleFrameCount += 1;

  const elapsed = now - fpsSampleStartedAt;
  if (elapsed >= MAP_FPS_SAMPLE_INTERVAL_MS) {
    const averageFps = fpsSampleFrameCount * 1000 / elapsed;
    const lowStats = resolveFpsLowStats();
    renderFpsStats({
      fps: averageFps,
      low: lowStats.low,
      onePercentLow: lowStats.onePercentLow,
    });
    fpsSampleFrameCount = 0;
    fpsSampleStartedAt = now;
  }

  fpsMonitorFrameRequestId = requestAnimationFrame(tickFpsMonitor);
}


function startFpsMonitor(): void {
  if (fpsMonitorEnabled || !fpsRateEl || !fpsValueEl || !fpsLowValueEl || !fpsOnePercentValueEl) {
    return;
  }
  fpsMonitorEnabled = true;
  fpsRateEl.hidden = false;
  resetFpsMonitorSamples();
  renderFpsStats({
    fps: null,
    low: null,
    onePercentLow: null,
  });
  fpsMonitorFrameRequestId = requestAnimationFrame(tickFpsMonitor);
}


function stopFpsMonitor(): void {
  fpsMonitorEnabled = false;
  if (fpsMonitorFrameRequestId !== null) {
    cancelAnimationFrame(fpsMonitorFrameRequestId);
    fpsMonitorFrameRequestId = null;
  }
  resetFpsMonitorSamples();
  renderFpsStats({
    fps: null,
    low: null,
    onePercentLow: null,
  });
  if (fpsRateEl) {
    fpsRateEl.hidden = true;
  }
}

/** syncFpsMonitorVisibility：同步外部状态到本地。 */
function syncFpsMonitorVisibility(showFpsMonitor: boolean): void {
  if (showFpsMonitor) {
    startFpsMonitor();
    return;
  }
  stopFpsMonitor();
}

/** renderTickRate：渲染当前界面内容。 */
function renderTickRate(seconds: number) {
  const [integer, fraction] = seconds.toFixed(2).split('.');
  if (tickRateIntEl) tickRateIntEl.textContent = integer;
  if (tickRateDotEl) tickRateDotEl.textContent = '.';
  if (tickRateFracAEl) tickRateFracAEl.textContent = fraction[0] ?? '0';
  if (tickRateFracBEl) tickRateFracBEl.textContent = fraction[1] ?? '0';
}


function resolveDisplayedLocalTicks(state: GameTimeState | null, now = performance.now()): number | null {
  if (!state) {
    return null;
  }
  const dayLength = Math.max(1, state.dayLength);
  const timeScale = Number.isFinite(state.timeScale) && state.timeScale >= 0 ? state.timeScale : 1;
  const tickIntervalMs = Math.max(1, currentTimeTickIntervalMs);
  const elapsedMs = Math.max(0, now - currentTimeStateSyncedAt);
  const elapsedTicks = elapsedMs / tickIntervalMs * timeScale;
  return ((state.localTicks + elapsedTicks) % dayLength + dayLength) % dayLength;
}


function resolveDisplayedPhaseLabel(state: GameTimeState, localTicks: number): string {
  const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick);
  return phase?.label ?? state.phaseLabel;
}

/** renderCurrentTime：渲染当前界面内容。 */
function renderCurrentTime(state: GameTimeState | null, now = performance.now()) {
  const localTicks = resolveDisplayedLocalTicks(state, now);
  const totalMinutes = localTicks === null
    ? null
    : Math.floor((localTicks / Math.max(1, state?.dayLength ?? 1)) * 24 * 60);
  const hours = totalMinutes === null ? '--' : String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const minutes = totalMinutes === null ? '--' : String(totalMinutes % 60).padStart(2, '0');
  const phaseLabel = state && localTicks !== null ? resolveDisplayedPhaseLabel(state, localTicks) : '未明';
  if (currentTimeHourAEl) currentTimeHourAEl.textContent = hours[0] ?? '-';
  if (currentTimeHourBEl) currentTimeHourBEl.textContent = hours[1] ?? '-';
  if (currentTimeDotEl) currentTimeDotEl.textContent = ':';
  if (currentTimeMinAEl) currentTimeMinAEl.textContent = minutes[0] ?? '-';
  if (currentTimeMinBEl) currentTimeMinBEl.textContent = minutes[1] ?? '-';
  if (currentTimePhaseEl) currentTimePhaseEl.textContent = phaseLabel;
  if (currentTimeEl) {
    currentTimeEl.setAttribute('title', state ? `${phaseLabel} ${hours}:${minutes}` : '当前时间未同步');
  }
}

/** syncCurrentTimeState：同步外部状态到本地。 */
function syncCurrentTimeState(state: GameTimeState | null): void {
  currentTimeState = state;
  currentTimeStateSyncedAt = performance.now();
  renderCurrentTime(currentTimeState, currentTimeStateSyncedAt);
}

/** syncCurrentTimeTickInterval：同步外部状态到本地。 */
function syncCurrentTimeTickInterval(dtMs: number | null | undefined): void {
  if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }
  currentTimeTickIntervalMs = dtMs;
  currentTimeTickIntervalUpdatedAt = performance.now();
  syncEstimatedServerTickInterval(dtMs);
}

/** renderPingLatency：渲染当前界面内容。 */
function renderPingLatency(latencyMs: number | null, status = '毫秒') {

  const digits = (() => {
    if (latencyMs === null) {
      return ['-', '-', '-'];
    }
    const rounded = String(Math.min(999, Math.max(0, Math.round(latencyMs))));
    if (rounded.length >= 3) {
      return rounded.split('');
    }
    if (rounded.length === 2) {
      return ['·', rounded[0], rounded[1]];
    }
    return ['·', '·', rounded[0] ?? '0'];
  })();
  if (pingHundredsEl) pingHundredsEl.textContent = digits[0] ?? '-';
  if (pingTensEl) pingTensEl.textContent = digits[1] ?? '-';
  if (pingOnesEl) pingOnesEl.textContent = digits[2] ?? '-';
  if (pingUnitEl) pingUnitEl.textContent = status;
  if (pingLatencyEl) {
    const title = latencyMs === null
      ? status === '阻塞'
        ? `当前域名 ${window.location.host} 的游戏连接仍可达，但最近 tick/主循环出现明显阻塞，当前“灵网延迟”已不再代表纯网络延迟`
        : `当前域名 ${window.location.host} 的游戏连接响应${status === '离线' ? '不可用' : `状态：${status}`}`
      : `当前域名 ${window.location.host} 上游戏连接往返约 ${Math.round(latencyMs)}ms；该值同时会受到服务端主循环阻塞影响`;
    pingLatencyEl.setAttribute('title', title);
  }
}

/** hasRecentTickStall：判断并返回条件结果。 */
function hasRecentTickStall(now = performance.now()): boolean {
  return currentTimeTickIntervalMs >= PING_BLOCKED_TICK_INTERVAL_MS
    && now - currentTimeTickIntervalUpdatedAt <= PING_BLOCKED_TICK_GRACE_MS;
}


async function waitFor(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}


async function recoverConnection(forceRefresh = false): Promise<void> {
  if (connectionRecoveryPromise) {
    return connectionRecoveryPromise;
  }
  connectionRecoveryPromise = (async () => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    if (socket.connected || !loginUI.hasRefreshToken()) {
      return;
    }

    const accessToken = forceRefresh ? null : getAccessToken();
    if (accessToken) {
      socket.reconnect(accessToken);
      await waitFor(CONNECTION_RECOVERY_RETRY_MS);
      if (socket.connected) {
        return;
      }
    }

    await loginUI.restoreSession();
  })().finally(() => {
    connectionRecoveryPromise = null;
  });
  return connectionRecoveryPromise;
}


function scheduleConnectionRecovery(delayMs = 0, forceRefresh = false): void {
  if (connectionRecoveryTimer !== null) {
    window.clearTimeout(connectionRecoveryTimer);
  }
  connectionRecoveryTimer = window.setTimeout(() => {
    connectionRecoveryTimer = null;
    void recoverConnection(forceRefresh);
  }, delayMs);
}

/** clearPendingSocketPing：清理并清空临时数据。 */
function clearPendingSocketPing(): void {
  if (!pendingSocketPing) {
    return;
  }
  window.clearTimeout(pendingSocketPing.timeoutId);
  pendingSocketPing = null;
}


function markSocketPingTimeout(serial: number): void {
  if (!pendingSocketPing || pendingSocketPing.serial !== serial) {
    return;
  }
  pendingSocketPing = null;
  renderPingLatency(null, socket.connected ? (hasRecentTickStall() ? '阻塞' : '超时') : '离线');
}


function sampleServerPing(): void {
  if (document.visibilityState === 'hidden') {
    return;
  }
  clearPendingSocketPing();
  if (!navigator.onLine) {
    renderPingLatency(null, '断网');
    return;
  }
  if (!socket.connected) {
    renderPingLatency(null, loginUI.hasRefreshToken() ? '重连' : '离线');
    return;
  }
  const serial = ++pingRequestSerial;
  const clientAt = performance.now();
  socket.sendPing(clientAt);
  const timeoutId = window.setTimeout(() => {
    markSocketPingTimeout(serial);
  }, SOCKET_PING_TIMEOUT_MS);
  pendingSocketPing = { serial, clientAt, timeoutId };
}


function stopPingLoop(): void {
  if (pingTimer !== null) {
    window.clearTimeout(pingTimer);
    pingTimer = null;
  }
  clearPendingSocketPing();
}


function scheduleNextPing(delayMs = SERVER_PING_INTERVAL_MS): void {
  if (pingTimer !== null) {
    window.clearTimeout(pingTimer);
  }
  pingTimer = window.setTimeout(() => {
    pingTimer = null;
    sampleServerPing();
    scheduleNextPing(SERVER_PING_INTERVAL_MS);
  }, delayMs);
}


function restartPingLoop(immediate = true): void {
  stopPingLoop();
  if (document.visibilityState === 'hidden') {
    return;
  }
  if (!immediate) {
    scheduleNextPing();
    return;
  }
  sampleServerPing();
  scheduleNextPing(SERVER_PING_INTERVAL_MS);
}

renderTickRate(1);
const initialMapPerformanceConfig = initializeMapPerformanceConfig();
syncFpsMonitorVisibility(initialMapPerformanceConfig.showFpsMonitor);
renderCurrentTime(null);
renderPingLatency(null, '待测');
bindResponsiveViewportCss(window);
initializeUiStyleConfig();
window.addEventListener(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, (event) => {
  const config = (event as CustomEvent<MapPerformanceConfig>).detail;
  syncFpsMonitorVisibility(config.showFpsMonitor);
});
startClientVersionReload({
  onBeforeReload: () => {
    showToast('检测到新版本，正在刷新页面');
  },
});
window.setInterval(() => {
  if (!currentTimeState) {
    return;
  }
  renderCurrentTime(currentTimeState);
}, CURRENT_TIME_REFRESH_MS);
const socket = new SocketManager();
const mapRuntime = createMapRuntime();
const loginUI = new LoginUI(socket);
const hud = new HUD();
const chatUI = new ChatUI();
const debugPanel = new DebugPanel();

// 修仙系统面板
const sidePanel = new SidePanel();
const attrPanel = new AttrPanel();
const inventoryPanel = new InventoryPanel();
const equipmentPanel = new EquipmentPanel();
const techniquePanel = new TechniquePanel();
const bodyTrainingPanel = new BodyTrainingPanel();
bodyTrainingPanel.setInfusionHandler((foundationSpent) => {
  socket.sendAction('body_training:infuse', String(foundationSpent));
});
const questPanel = new QuestPanel();
const marketPanel = new MarketPanel();
const actionPanel = new ActionPanel();
const npcShopModal = new NpcShopModal();
const alchemyModal = new AlchemyModal();
const enhancementModal = new EnhancementModal();
const lootPanel = new LootPanel();
const worldPanel = new WorldPanel();
const leaderboardModal = new LeaderboardModal();
const worldSummaryModal = new WorldSummaryModal();
const settingsPanel = new SettingsPanel();
const mailPanel = new MailPanel(socket);
const suggestionPanel = new SuggestionPanel(socket);
new ChangelogPanel();
new TutorialPanel();
const panelSystem = createClientPanelSystem(window);
mapRuntime.attach(canvasHost);
mapRuntime.setMoveHandler((target) => {
  if (target.isCurrentMap || myPlayer?.mapId === target.mapId) {
/** planPathTo：初始化地图运行数据。 */
    planPathTo({ x: target.x, y: target.y });
    return;
  }
  clearCurrentPath();
  socket.sendNavigateMapPoint(target.mapId, target.x, target.y);
});
const targetingBadgeEl = document.getElementById('map-targeting-indicator');
const observeModalEl = document.getElementById('observe-modal');
const observeModalBodyEl = document.getElementById('observe-modal-body');
const observeModalSubtitleEl = document.getElementById('observe-modal-subtitle');
const observeModalShellEl = observeModalEl?.querySelector('.observe-modal-shell') as HTMLElement | null;
const observeModalAsideEl = document.getElementById('observe-modal-aside');
const observeBuffTooltip = new FloatingTooltip();
let observeBuffTooltipHoverNode: HTMLElement | null = null;
let observeBuffTooltipDelegatedBound = false;
let observeLootPreviewDelegatedBound = false;
const senseQiTooltip = new FloatingTooltip();
let pendingTargetedAction: {
  actionId: string;
  actionName: string;
  targetMode?: string;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  maxTargets?: number;
  hoverX?: number;
  hoverY?: number;
} | null = null;
let hoveredMapTile: {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
} | null = null;

function getTileTypeName(type: TileType): string {
  return getTileTypeLabel(type, '未知地貌');
}

type ObservedEntity = {
  id: string;
  wx: number;
  wy: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  monsterScale?: number;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: RenderEntity['npcQuestMarker'];
  observation?: RenderEntity['observation'];
  lootPreview?: NonNullable<S2C_TileRuntimeDetail['entities']>[number]['lootPreview'];
  buffs?: VisibleBuffState[];
};

/** isCrowdEntityKind：判断并返回条件结果。 */
function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}

/** isPlayerLikeEntityKind：判断并返回条件结果。 */
function isPlayerLikeEntityKind(kind: string | null | undefined): boolean {
  return kind === 'player' || isCrowdEntityKind(kind);
}

type ObserveEntityCardData = Pick<
  ObservedEntity,
  'id' | 'name' | 'kind' | 'monsterTier' | 'hp' | 'maxHp' | 'qi' | 'maxQi' | 'npcQuestMarker' | 'observation' | 'lootPreview' | 'buffs'
>;

type PendingAutoInteraction =
  | {
      kind: 'npc';
      mapId: string;
      x: number;
      y: number;
      actionId: string;
    }
  | {
      kind: 'portal';
      mapId: string;
      x: number;
      y: number;
      actionId: 'portal:travel';
    };

const AUTO_INTERACTION_APPROACH_STEPS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];


function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getBreakthroughRequirementStatusLabel(requirement: BreakthroughRequirementView): string {
  return requirement.blocksBreakthrough === false
    ? (requirement.completed ? '已生效' : '未生效')
    : (requirement.completed ? '已达成' : '未达成');
}

function getBreakthroughRequirementStatusDetail(requirement: BreakthroughRequirementView): string {
  if (requirement.hidden) {
    return '该要求尚未解锁，只能通过主线或支线任务逐步获知。';
  }
  if ((requirement.increasePct ?? 0) > 0) {
    if (requirement.type === 'item') {
      return requirement.completed ? '突破成功后会消耗该材料。' : '未生效时会抬高全部属性要求。';
    }
    return requirement.completed ? '该条件当前已生效。' : '未生效时会抬高全部属性要求。';
  }
  return requirement.detail ?? (requirement.completed ? '当前已满足。' : '当前尚未满足。');
}

/** openBreakthroughModal：打开界面或流程。 */
function openBreakthroughModal() {
  if (openHeavenGateModal(myPlayer, {
    showToast,
    sendAction: (action, element) => socket.sendHeavenGateAction(action, element),
  })) {
    return;
  }

  const preview = myPlayer?.realm?.breakthrough;
  const currentRealm = myPlayer?.realm;
  if (!preview || !currentRealm) {
    showToast('当前境界尚未圆满，暂时不能突破');
    return;
  }

  const hasConsumableRequirements = preview.requirements.some((requirement) => requirement.type === 'item');
  const hasIncreaseRequirements = preview.requirements.some((requirement) => (requirement.increasePct ?? 0) > 0);
  const requirementRows = preview.requirements.length > 0
    ? preview.requirements.map((requirement) => `
      <div class="action-item breakthrough-requirement-item">
        <div class="action-copy">
          <div class="breakthrough-requirement-head">
            <span class="action-name">${renderTextWithInlineItemHighlights(requirement.label)}</span>
            <span class="action-type breakthrough-requirement-status ${requirement.completed ? 'is-completed' : 'is-unmet'}">
              [${getBreakthroughRequirementStatusLabel(requirement)}]
            </span>
            ${!requirement.completed && (requirement.increasePct ?? 0) > 0
              ? `<span class="breakthrough-requirement-bonus">+${requirement.increasePct}%</span>`
              : ''}
          </div>
          <div class="action-desc">${renderTextWithInlineItemHighlights(getBreakthroughRequirementStatusDetail(requirement))}</div>
        </div>
      </div>
    `).join('')
    : '<div class="empty-hint">当前无额外突破要求。</div>';

  detailModalHost.open({
    ownerId: 'realm:breakthrough',
    variantClass: 'detail-modal--breakthrough',
    title: `突破至 ${preview.targetDisplayName}`,
    subtitle: `${currentRealm.displayName} · 核心要求 ${preview.completedBlockingRequirements}/${preview.blockingRequirements}`,
    hint: preview.blockedReason
      ? preview.blockedReason
      : preview.canBreakthrough
      ? (hasConsumableRequirements ? '绿色表示已满足；已生效的材料会在突破后消耗。' : '点击空白处关闭')
      : (hasIncreaseRequirements ? '红色表示当前未满足；带 +% 的条件会抬高全部属性要求。' : '红色表示当前未满足；隐藏条件需通过任务逐步解锁。'),
    bodyHtml: `
      <div class="panel-section">
        <div class="panel-section-title">突破要求</div>
        ${requirementRows}
      </div>
      ${hasIncreaseRequirements ? `
        <div class="panel-section">
          <div class="empty-hint">提示：红色且带 +% 的条件当前未生效，会按配置抬高全部属性要求；绿色表示当前已满足或已生效。</div>
        </div>
      ` : ''}
      <div class="tech-modal-actions">
        <button class="small-btn" type="button" data-breakthrough-confirm ${preview.canBreakthrough ? '' : 'disabled'}>确认突破</button>
      </div>
    `,
    onAfterRender: (body) => {
      bindInlineItemTooltips(body);
      body.querySelector<HTMLElement>('[data-breakthrough-confirm]')?.addEventListener('click', () => {
        detailModalHost.close('realm:breakthrough');
        socket.sendAction('realm:breakthrough');
      });
    },
  });
}

hud.setCallbacks(() => {
  cancelTargeting();
  hideObserveModal();
  openBreakthroughModal();
});

/** syncTargetingOverlay：同步外部状态到本地。 */
function syncTargetingOverlay() {
  if (!myPlayer || !pendingTargetedAction) {
    mapRuntime.setTargetingOverlay(null);
    targetingBadgeEl?.classList.add('hidden');
    syncSenseQiOverlay();
    return;
  }
  const geometry = getEffectiveTargetingGeometry(pendingTargetedAction);
  const affectedCells = computeAffectedCells(pendingTargetedAction);
  mapRuntime.setTargetingOverlay({
    originX: myPlayer.x,
    originY: myPlayer.y,
    range: geometry.range,
    visibleOnly: doesTargetingRequireVision(pendingTargetedAction.actionId),
    shape: geometry.shape,
    radius: geometry.radius,
    affectedCells,
    hoverX: pendingTargetedAction.hoverX,
    hoverY: pendingTargetedAction.hoverY,
  });
  if (targetingBadgeEl) {
    const rangeLabel = pendingTargetedAction.actionId === 'client:observe' ? `视野 ${geometry.range}` : `射程 ${geometry.range}`;
    const shapeLabel = geometry.shape === 'line'
      ? ` · 直线${pendingTargetedAction.maxTargets ? ` ${pendingTargetedAction.maxTargets}目标` : ''}`
      : geometry.shape === 'ring'
        ? ` · 环带 ${Math.max(0, geometry.innerRadius ?? Math.max((geometry.radius ?? 1) - 1, 0))}-${Math.max(0, geometry.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
      : geometry.shape === 'checkerboard'
        ? ` · 棋盘 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
      : geometry.shape === 'box'
        ? ` · 矩形 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
      : geometry.shape === 'orientedBox'
        ? ` · 定向矩形 ${Math.max(1, geometry.width ?? 1)}x${Math.max(1, geometry.height ?? geometry.width ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
      : geometry.shape === 'area'
        ? ` · 范围半径 ${Math.max(0, geometry.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
        : '';
    targetingBadgeEl.textContent = `选定 ${pendingTargetedAction.actionName} 目标 · ${rangeLabel}${shapeLabel}`;
    targetingBadgeEl.classList.remove('hidden');
  }
  syncSenseQiOverlay();
}


function cancelTargeting(showMessage = false) {
  if (!pendingTargetedAction) return;
  pendingTargetedAction = null;
  syncTargetingOverlay();
  if (showMessage) {
    showToast('已取消目标选择');
  }
}

function getSkillDefByActionId(actionId: string): SkillDef | null {
  return getSkillDefByActionIdHelper(myPlayer, actionId);
}

function getEffectiveTargetingGeometry(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
): TargetingGeometrySpec {
  return getEffectiveTargetingGeometryHelper(action, myPlayer);
}


function resolveCurrentTargetingRange(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
): number {
  return resolveCurrentTargetingRangeHelper(action, myPlayer, getInfoRadius());
}


function doesTargetingRequireVision(actionId: string): boolean {
  return actionId === 'client:observe' || actionId === 'battle:force_attack';
}


function beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1) {
  if (pendingTargetedAction?.actionId === actionId) {
    cancelTargeting(true);
    return;
  }
  const skill = getSkillDefByActionId(actionId);
  pendingTargetedAction = {
    actionId,
    actionName,
    targetMode,
    range: Math.max(1, range),
    shape: skill?.targeting?.shape ?? 'single',
    radius: skill?.targeting?.radius,
    innerRadius: skill?.targeting?.innerRadius,
    width: skill?.targeting?.width,
    height: skill?.targeting?.height,
    maxTargets: skill?.targeting?.maxTargets,
  };
  syncTargetingOverlay();
  if (actionId === 'client:observe') {
    showToast('请选择当前视野内的目标格，Esc 或右键取消');
    return;
  }
  showToast(`请选择 ${resolveCurrentTargetingRange(pendingTargetedAction)} 格内目标，Esc 或右键取消`);
}


function computeAffectedCells(action: NonNullable<typeof pendingTargetedAction>): Array<{ x: number; y: number }> {
  if (action.hoverX === undefined || action.hoverY === undefined) {
    return [];
  }
  return computeAffectedCellsForAction(action, { x: action.hoverX, y: action.hoverY });
}


function computeAffectedCellsForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchor: GridPoint,
): GridPoint[] {
  return computeAffectedCellsForActionHelper(action, anchor, myPlayer);
}


function resolveTargetRefForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
  target: { x: number; y: number; entityId?: string; entityKind?: string },
): string | null {
  return resolveTargetRefForActionHelper(action, target, myPlayer);
}

/** hasAffectableTargetInArea：判断并返回条件结果。 */
function hasAffectableTargetInArea(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
): boolean {
  return hasAffectableTargetInAreaHelper(action, anchorX, anchorY, myPlayer, {
    entities: latestEntities,
    getTile: getVisibleTileAt,
    isPlayerLikeEntityKind,
  });
}

function getVisibleTileAt(x: number, y: number): Tile | null {
  return mapRuntime.getVisibleTileAt(x, y);
}

function getKnownTileAt(x: number, y: number): Tile | null {
  return mapRuntime.getKnownTileAt(x, y);
}

/** isPointInsideCurrentMap：判断并返回条件结果。 */
function isPointInsideCurrentMap(x: number, y: number): boolean {
  const mapMeta = mapRuntime.getMapMeta();
  if (!mapMeta) return true;
  return x >= 0 && y >= 0 && x < mapMeta.width && y < mapMeta.height;
}

function getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
  return mapRuntime.getGroundPileAt(x, y);
}

/** syncSenseQiOverlay：同步外部状态到本地。 */
function syncSenseQiOverlay(): void {
  if (!myPlayer?.senseQiActive) {
    mapRuntime.setSenseQiOverlay(null);
    senseQiTooltip.hide();
    return;
  }

  mapRuntime.setSenseQiOverlay({
    hoverX: hoveredMapTile?.x,
    hoverY: hoveredMapTile?.y,
    levelBaseValue: auraLevelBaseValue,
  });

  if (pendingTargetedAction || !hoveredMapTile) {
    senseQiTooltip.hide();
    return;
  }

  const tile = getVisibleTileAt(hoveredMapTile.x, hoveredMapTile.y);
  if (!tile) {
    senseQiTooltip.hide();
    return;
  }

  senseQiTooltip.show(
    '感气视角',
    [
      `坐标 (${hoveredMapTile.x}, ${hoveredMapTile.y})`,
      formatAuraLevelText(tile.aura ?? 0),
    ],
    hoveredMapTile.clientX,
    hoveredMapTile.clientY,
  );
}

/** isWithinDisplayedMemoryBounds：判断并返回条件结果。 */
function isWithinDisplayedMemoryBounds(x: number, y: number): boolean {
  if (!myPlayer) {
    return false;
  }
  return Math.abs(x - myPlayer.x) <= getDisplayRangeX() && Math.abs(y - myPlayer.y) <= getDisplayRangeY();
}

/** hideObserveModal：隐藏当前视图。 */
function hideObserveModal(): void {
  observeBuffTooltip.hide(true);
  observeModalEl?.classList.add('hidden');
  observeModalEl?.setAttribute('aria-hidden', 'true');
  observeModalAsideEl?.classList.add('hidden');
  observeModalAsideEl?.setAttribute('aria-hidden', 'true');
  activeObservedTile = null;
  activeObservedTileDetail = null;
}

function buildObservationRows(rows: Array<{ label: string; value?: string; valueHtml?: string }>): string {
  return rows
    .map((row) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(row.label)}</span><span class="observe-modal-value">${row.valueHtml ?? escapeHtml(row.value ?? '')}</span></div>`)
    .join('');
}

/** formatCurrentMax：格式化输出字符串用于展示。 */
function formatCurrentMax(current?: number, max?: number): string {
  if (typeof current !== 'number' || typeof max !== 'number') {
    return '未明';
  }
  return formatDisplayCurrentMax(Math.max(0, Math.round(current)), Math.max(0, Math.round(max)));
}

/** syncAuraLevelBaseValue：同步外部状态到本地。 */
function syncAuraLevelBaseValue(nextValue?: number): void {
  if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || nextValue <= 0) {
    return;
  }
  auraLevelBaseValue = Math.max(1, Math.round(nextValue));
}

/** formatAuraLevelText：格式化输出字符串用于展示。 */
function formatAuraLevelText(auraValue: number): string {
  return `灵气 ${formatDisplayInteger(Math.max(0, Math.round(auraValue)))}`;
}

/** formatAuraValueText：格式化输出字符串用于展示。 */
function formatAuraValueText(auraValue: number): string {
  return formatDisplayInteger(Math.max(0, Math.round(auraValue)));
}

type TileRuntimeResourceDetail = S2C_TileRuntimeDetail['resources'][number];
type ObserveAsideCard = {
  mark?: string;
  title: string;
  lines: string[];
  tone?: 'buff' | 'debuff';
};


function createObserveAsideLineElement(line: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = 'floating-tooltip-aside-line';
  element.textContent = line;
  return element;
}


function patchObserveAsideLineElements(container: HTMLElement, lines: string[]): void {
  while (container.children.length > lines.length) {
    container.lastElementChild?.remove();
  }
  lines.forEach((line, index) => {
    const existing = container.children.item(index);
    const lineEl = existing instanceof HTMLSpanElement ? existing : createObserveAsideLineElement(line);
    if (existing !== lineEl) {
      container.insertBefore(lineEl, existing ?? null);
    }
    lineEl.className = 'floating-tooltip-aside-line';
    if (lineEl.textContent !== line) {
      lineEl.textContent = line;
    }
  });
}


function patchObserveAsideCardElement(cardEl: HTMLElement, card: ObserveAsideCard): void {
  cardEl.className = `floating-tooltip-aside-card ${card.tone === 'debuff' ? 'debuff' : 'buff'}`;

  let headEl = cardEl.firstElementChild;
  if (!(headEl instanceof HTMLDivElement) || !headEl.classList.contains('floating-tooltip-aside-head')) {
    headEl = document.createElement('div');
    headEl.className = 'floating-tooltip-aside-head';
    cardEl.prepend(headEl);
  }

  let markEl = headEl.querySelector(':scope > .floating-tooltip-aside-mark');
  if (card.mark) {
    if (!(markEl instanceof HTMLSpanElement)) {
      markEl = document.createElement('span');
      markEl.className = 'floating-tooltip-aside-mark';
      headEl.prepend(markEl);
    }
    if (markEl.textContent !== card.mark) {
      markEl.textContent = card.mark;
    }
  } else if (markEl instanceof HTMLElement) {
    markEl.remove();
  }

  let titleEl = headEl.querySelector(':scope > strong');
  if (!(titleEl instanceof HTMLElement)) {
    titleEl = document.createElement('strong');
    headEl.append(titleEl);
  }
  if (titleEl.textContent !== card.title) {
    titleEl.textContent = card.title;
  }

  const detailEl = cardEl.querySelector(':scope > .floating-tooltip-aside-detail');
  if (card.lines.length === 0) {
    detailEl?.remove();
    return;
  }

  const nextDetailEl = detailEl instanceof HTMLDivElement
    ? detailEl
    : document.createElement('div');
  nextDetailEl.className = 'floating-tooltip-aside-detail';
  if (nextDetailEl.parentElement !== cardEl) {
    cardEl.append(nextDetailEl);
  }
  patchObserveAsideLineElements(nextDetailEl, card.lines);
}

function getObservedTileRuntimeResources(targetX: number, targetY: number): TileRuntimeResourceDetail[] {
  if (
    !myPlayer
    || !activeObservedTile
    || activeObservedTile.mapId !== myPlayer.mapId
    || activeObservedTile.x !== targetX
    || activeObservedTile.y !== targetY
    || !activeObservedTileDetail
  ) {
    return [];
  }
  return activeObservedTileDetail.resources;
}

/** formatObservedResourceOverview：格式化输出字符串用于展示。 */
function formatObservedResourceOverview(resource: TileRuntimeResourceDetail, fallbackLevel?: number): string {
  if (typeof resource.level === 'number') {
    return formatDisplayInteger(Math.max(0, Math.round(resource.level)));
  }
  if (typeof fallbackLevel === 'number') {
    return formatDisplayInteger(Math.max(0, Math.round(fallbackLevel)));
  }
  return formatAuraValueText(resource.value);
}

function buildObservedResourceAsideLines(resource: TileRuntimeResourceDetail): string[] {
  const effectiveValue = typeof resource.effectiveValue === 'number' && Number.isFinite(resource.effectiveValue)
    ? resource.effectiveValue
    : undefined;
  const hasProjectedValue = effectiveValue !== undefined
    && Math.round(effectiveValue) !== Math.round(resource.value);
  const lines = [`当前数值：${formatAuraValueText(hasProjectedValue ? effectiveValue : resource.value)}`];
  if (hasProjectedValue) {
    lines.push(`原始值：${formatAuraValueText(resource.value)}`);
  }
  if (typeof resource.level === 'number') {
    lines.unshift(`当前等级：${formatDisplayInteger(Math.max(0, Math.round(resource.level)))}`);
  }
  return lines;
}

/** isMatchingObservedTile：判断并返回条件结果。 */
function isMatchingObservedTile(targetX: number, targetY: number): boolean {
  return Boolean(
    myPlayer
    && activeObservedTile
    && activeObservedTile.mapId === myPlayer.mapId
    && activeObservedTile.x === targetX
    && activeObservedTile.y === targetY,
  );
}

function buildObservedResourceAsideCards(targetX: number, targetY: number, tile: Tile): ObserveAsideCard[] {
  if (!myPlayer?.senseQiActive || !isMatchingObservedTile(targetX, targetY)) {
    return [];
  }

  const detailResources = getObservedTileRuntimeResources(targetX, targetY);
  if (!activeObservedTileDetail) {
    if ((tile.aura ?? 0) <= 0) {
      return [];
    }
    return [{
      mark: '气',
      title: '气机细察',
      lines: [
        `总灵气等级：${formatDisplayInteger(Math.max(0, Math.round(tile.aura ?? 0)))}`,
        '感气决运转中，正在细察此地气机。',
      ],
      tone: 'buff',
    }];
  }

  if (detailResources.length === 0) {
    return [];
  }

  return detailResources.map((resource) => {
    const lines = buildObservedResourceAsideLines(resource);
    if (resource.key === 'aura' && !lines.some((line) => line.startsWith('当前等级：'))) {
      lines.unshift(`当前等级：${formatObservedResourceOverview(resource, tile.aura ?? 0)}`);
    }
    return {
      mark: resource.label.slice(0, 1),
      title: resource.label,
      lines,
      tone: 'buff',
    };
  });
}

/** renderObserveAsideCards：渲染当前界面内容。 */
function renderObserveAsideCards(cards: ObserveAsideCard[]): void {
  if (!observeModalAsideEl) {
    return;
  }
  if (cards.length === 0) {
    observeModalAsideEl.replaceChildren();
    observeModalAsideEl.classList.add('hidden');
    observeModalAsideEl.setAttribute('aria-hidden', 'true');
    return;
  }
  while (observeModalAsideEl.children.length > cards.length) {
    observeModalAsideEl.lastElementChild?.remove();
  }
  cards.forEach((card, index) => {
    const existing = observeModalAsideEl.children.item(index);
    const cardEl = existing instanceof HTMLDivElement
      ? existing
      : document.createElement('div');
    if (existing !== cardEl) {
      observeModalAsideEl.insertBefore(cardEl, existing ?? null);
    }
    patchObserveAsideCardElement(cardEl, card);
  });
  observeModalAsideEl.classList.remove('hidden');
  observeModalAsideEl.setAttribute('aria-hidden', 'false');
}

/** formatBuffDuration：格式化输出字符串用于展示。 */
function formatBuffDuration(buff: VisibleBuffState): string {
  if (buff.infiniteDuration) {
    return '∞';
  }
  return `${formatDisplayInteger(Math.max(0, Math.round(buff.remainingTicks)))} / ${formatDisplayInteger(Math.max(1, Math.round(buff.duration)))} 息`;
}


function scaleBuffAttrs(
  attrs: VisibleBuffState['attrs'],
  stacks: number,
): VisibleBuffState['attrs'] | undefined {
  if (!attrs || stacks === 1) {
    return attrs;
  }
  const scaled: NonNullable<VisibleBuffState['attrs']> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key as keyof NonNullable<VisibleBuffState['attrs']>] = value * stacks;
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}


function scaleBuffStats(
  stats: VisibleBuffState['stats'],
  stacks: number,
): VisibleBuffState['stats'] | undefined {
  if (!stats || stacks === 1) {
    return stats;
  }
  const scaled: PartialNumericStats = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number') {
      (scaled as Record<string, unknown>)[key] = value * stacks;
      continue;
    }
    if (!value || typeof value !== 'object') {
      continue;
    }
    const nested: Record<string, number> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (typeof nestedValue !== 'number') {
        continue;
      }
      nested[nestedKey] = nestedValue * stacks;
    }
    if (Object.keys(nested).length > 0) {
      (scaled as Record<string, unknown>)[key] = nested;
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

function buildBuffEffectLines(buff: VisibleBuffState): string[] {
  const stackFactor = Math.max(1, Math.floor(buff.stacks || 1));
  return describePreviewBonuses(
    scaleBuffAttrs(buff.attrs, stackFactor),
    scaleBuffStats(buff.stats, stackFactor),
    undefined,
    buff.attrMode ?? 'percent',
    buff.statMode ?? 'percent',
  );
}

function buildBuffTooltipLines(buff: VisibleBuffState): string[] {
  const lines = [
    `类别：${buff.category === 'debuff' ? '减益' : '增益'}`,
    `剩余：${formatBuffDuration(buff)}`,
  ];
  const stackLimit = formatBuffMaxStacks(buff.maxStacks);
  if (stackLimit) {
    lines.push(`层数：${formatDisplayInteger(buff.stacks)} / ${stackLimit}`);
  }
  if (buff.sourceSkillName || buff.sourceSkillId) {
    lines.push(`来源：${buff.sourceSkillName ?? buff.sourceSkillId}`);
  }
  const effectLines = buildBuffEffectLines(buff);
  if (effectLines.length > 0) {
    lines.push(`效果：${effectLines.join('，')}`);
  }
  if (buff.desc) {
    lines.push(buff.desc);
  }
  return lines;
}

function buildBuffBadgeHtml(buff: VisibleBuffState): string {
  const title = escapeHtml(buff.name);
  const detail = escapeHtml(buildBuffTooltipLines(buff).join('\n'));
  const stackText = buff.maxStacks > 1 ? `<span class="observe-buff-stack">${formatDisplayInteger(buff.stacks)}</span>` : '';
  const className = buff.category === 'debuff' ? 'observe-buff-chip debuff' : 'observe-buff-chip buff';
  return `<button class="${className}"
    type="button"
    data-buff-tooltip-title="${title}"
    data-buff-tooltip-detail="${detail}">
    <span class="observe-buff-mark">${escapeHtml(buff.shortMark)}</span>
    <span class="observe-buff-name">${escapeHtml(buff.name)}</span>
    <span class="observe-buff-duration">${escapeHtml(formatBuffDuration(buff))}</span>
    ${stackText}
  </button>`;
}

function buildBuffSectionHtml(title: string, buffs: VisibleBuffState[], emptyText: string): string {
  return `<section class="observe-buff-section">
    <div class="observe-buff-title">${escapeHtml(title)}</div>
    ${buffs.length > 0
      ? `<div class="observe-buff-list">${buffs.map((buff) => buildBuffBadgeHtml(buff)).join('')}</div>`
      : `<div class="observe-entity-empty">${escapeHtml(emptyText)}</div>`}
  </section>`;
}


function applyNullablePatch<T>(value: T | null | undefined, fallback: T | undefined): T | undefined {
  if (value === null) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  return fallback;
}


function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

function buildAttrStateFromPlayer(player: PlayerState): S2C_AttrUpdate {
  return {
    baseAttrs: cloneJson(player.baseAttrs),
    bonuses: cloneJson(player.bonuses),
    finalAttrs: cloneJson(player.finalAttrs ?? player.baseAttrs),
    numericStats: player.numericStats ? cloneJson(player.numericStats) : undefined,
    ratioDivisors: player.ratioDivisors ? cloneJson(player.ratioDivisors) : undefined,
    numericStatBreakdowns: player.numericStatBreakdowns ? cloneJson(player.numericStatBreakdowns) : undefined,
    maxHp: player.maxHp,
    qi: player.qi,
    specialStats: {
      foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
      combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
    },
    boneAgeBaseYears: player.boneAgeBaseYears,
    lifeElapsedTicks: player.lifeElapsedTicks,
    lifespanYears: player.lifespanYears ?? null,
    realmProgress: player.realm?.progress,
    realmProgressToNext: player.realm?.progressToNext,
    realmBreakthroughReady: player.realm?.breakthroughReady ?? player.breakthroughReady,
    alchemySkill: player.alchemySkill ? cloneJson(player.alchemySkill) : undefined,
    gatherSkill: player.gatherSkill ? cloneJson(player.gatherSkill) : undefined,
    enhancementSkill: player.enhancementSkill ? cloneJson(player.enhancementSkill) : undefined,
  };
}


function mergeAttrUpdatePatch(previous: S2C_AttrUpdate | null, patch: S2C_AttrUpdate): S2C_AttrUpdate {
  return {
    baseAttrs: patch.baseAttrs ? cloneJson(patch.baseAttrs) : cloneJson(previous?.baseAttrs ?? myPlayer?.baseAttrs ?? {
      constitution: 0,
      spirit: 0,
      perception: 0,
      talent: 0,
      comprehension: 0,
      luck: 0,
    }),
    bonuses: patch.bonuses ? cloneJson(patch.bonuses) : cloneJson(previous?.bonuses ?? myPlayer?.bonuses ?? []),
    finalAttrs: patch.finalAttrs ? cloneJson(patch.finalAttrs) : cloneJson(previous?.finalAttrs ?? myPlayer?.finalAttrs ?? previous?.baseAttrs ?? myPlayer?.baseAttrs ?? {
      constitution: 0,
      spirit: 0,
      perception: 0,
      talent: 0,
      comprehension: 0,
      luck: 0,
    }),
    numericStats: patch.numericStats ? cloneJson(patch.numericStats) : (previous?.numericStats ? cloneJson(previous.numericStats) : undefined),
    ratioDivisors: patch.ratioDivisors
      ? cloneJson(patch.ratioDivisors)
      : (previous?.ratioDivisors ? cloneJson(previous.ratioDivisors) : (myPlayer?.ratioDivisors ? cloneJson(myPlayer.ratioDivisors) : undefined)),
    numericStatBreakdowns: patch.numericStatBreakdowns
      ? cloneJson(patch.numericStatBreakdowns)
      : (previous?.numericStatBreakdowns ? cloneJson(previous.numericStatBreakdowns) : (myPlayer?.numericStatBreakdowns ? cloneJson(myPlayer.numericStatBreakdowns) : undefined)),
    maxHp: patch.maxHp ?? previous?.maxHp ?? myPlayer?.maxHp ?? 0,
    qi: patch.qi ?? previous?.qi ?? myPlayer?.qi ?? 0,
    specialStats: patch.specialStats
      ? cloneJson(patch.specialStats)
      : cloneJson(previous?.specialStats ?? {
        foundation: Math.max(0, Math.floor(myPlayer?.foundation ?? 0)),
        combatExp: Math.max(0, Math.floor(myPlayer?.combatExp ?? 0)),
      }),
    boneAgeBaseYears: patch.boneAgeBaseYears ?? previous?.boneAgeBaseYears ?? myPlayer?.boneAgeBaseYears ?? undefined,
    lifeElapsedTicks: patch.lifeElapsedTicks ?? previous?.lifeElapsedTicks ?? myPlayer?.lifeElapsedTicks ?? undefined,
    lifespanYears: patch.lifespanYears === null
      ? null
      : patch.lifespanYears ?? previous?.lifespanYears ?? myPlayer?.lifespanYears ?? null,
    realmProgress: patch.realmProgress ?? previous?.realmProgress ?? myPlayer?.realm?.progress ?? undefined,
    realmProgressToNext: patch.realmProgressToNext ?? previous?.realmProgressToNext ?? myPlayer?.realm?.progressToNext ?? undefined,
    realmBreakthroughReady: patch.realmBreakthroughReady
      ?? previous?.realmBreakthroughReady
      ?? myPlayer?.realm?.breakthroughReady
      ?? myPlayer?.breakthroughReady
      ?? undefined,
    alchemySkill: patch.alchemySkill
      ? cloneJson(patch.alchemySkill)
      : (previous?.alchemySkill ? cloneJson(previous.alchemySkill) : (myPlayer?.alchemySkill ? cloneJson(myPlayer.alchemySkill) : undefined)),
    gatherSkill: patch.gatherSkill
      ? cloneJson(patch.gatherSkill)
      : (previous?.gatherSkill ? cloneJson(previous.gatherSkill) : (myPlayer?.gatherSkill ? cloneJson(myPlayer.gatherSkill) : undefined)),
    enhancementSkill: patch.enhancementSkill
      ? cloneJson(patch.enhancementSkill)
      : (previous?.enhancementSkill ? cloneJson(previous.enhancementSkill) : (myPlayer?.enhancementSkill ? cloneJson(myPlayer.enhancementSkill) : undefined)),
  };
}


function mergeTechniquePatch(patch: TechniqueUpdateEntry, previous?: TechniqueState): TechniqueState {
  const previousSameTechnique = previous?.techId === patch.techId ? previous : undefined;
  const template = getLocalTechniqueTemplate(patch.techId);
  const mergedSkills = applyNullablePatch(patch.skills, previousSameTechnique?.skills);
  const mergedLayers = applyNullablePatch(patch.layers, previousSameTechnique?.layers);
  const mergedAttrCurves = applyNullablePatch(patch.attrCurves, previousSameTechnique?.attrCurves);
  return resolvePreviewTechnique({
    techId: patch.techId,
    level: patch.level ?? previousSameTechnique?.level ?? 1,
    exp: patch.exp ?? previousSameTechnique?.exp ?? 0,
    expToNext: patch.expToNext ?? previousSameTechnique?.expToNext ?? 0,
    realmLv: patch.realmLv ?? previousSameTechnique?.realmLv ?? template?.realmLv ?? 1,
    realm: patch.realm ?? previousSameTechnique?.realm ?? TechniqueRealm.Entry,
    skillsEnabled: applyNullablePatch(patch.skillsEnabled, previousSameTechnique?.skillsEnabled) ?? true,
    name: applyNullablePatch(patch.name, previousSameTechnique?.name) ?? template?.name ?? patch.techId,
    skills: mergedSkills
      ? cloneJson(mergedSkills)
      : cloneJson(template?.skills ?? []),
    grade: applyNullablePatch(patch.grade, previousSameTechnique?.grade) ?? template?.grade,
    category: applyNullablePatch(patch.category, previousSameTechnique?.category) ?? template?.category,
    layers: mergedLayers
      ? cloneJson(mergedLayers)
      : template?.layers
        ? cloneJson(template.layers)
      : undefined,
    attrCurves: mergedAttrCurves
      ? cloneJson(mergedAttrCurves)
      : undefined,
  });
}


function hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
  const nextEnhanceLevel = item.enhanceLevel ?? 0;
  const previousSameItem = previous?.itemId === item.itemId && (previous.enhanceLevel ?? 0) === nextEnhanceLevel
    ? previous
    : undefined;
  const template = getLocalItemTemplate(item.itemId);
  return {
    itemId: item.itemId,
    count: item.count,
    name: item.name ?? previousSameItem?.name ?? template?.name ?? item.itemId,
    type: item.type ?? previousSameItem?.type ?? template?.type ?? 'material',
    desc: item.desc ?? previousSameItem?.desc ?? template?.desc ?? '',
    groundLabel: item.groundLabel ?? previousSameItem?.groundLabel ?? template?.groundLabel,
    grade: item.grade ?? previousSameItem?.grade ?? template?.grade,
    level: item.level ?? previousSameItem?.level ?? template?.level,
    equipSlot: item.equipSlot ?? previousSameItem?.equipSlot ?? template?.equipSlot,
    equipAttrs: item.equipAttrs
      ? cloneJson(item.equipAttrs)
      : previousSameItem?.equipAttrs
        ? cloneJson(previousSameItem.equipAttrs)
        : template?.equipAttrs
          ? cloneJson(template.equipAttrs)
          : undefined,
    equipStats: item.equipStats
      ? cloneJson(item.equipStats)
      : previousSameItem?.equipStats
        ? cloneJson(previousSameItem.equipStats)
        : template?.equipStats
          ? cloneJson(template.equipStats)
          : undefined,
    equipValueStats: item.equipValueStats
      ? cloneJson(item.equipValueStats)
      : previousSameItem?.equipValueStats
        ? cloneJson(previousSameItem.equipValueStats)
        : template?.equipValueStats
          ? cloneJson(template.equipValueStats)
          : undefined,
    effects: item.effects
      ? cloneJson(item.effects)
      : previousSameItem?.effects
        ? cloneJson(previousSameItem.effects)
        : template?.effects
          ? cloneJson(template.effects)
          : undefined,
    tags: item.tags
      ? [...item.tags]
      : previousSameItem?.tags
        ? [...previousSameItem.tags]
        : template?.tags
          ? [...template.tags]
          : undefined,
    cooldown: item.cooldown ?? previousSameItem?.cooldown ?? template?.cooldown,
    enhanceLevel: item.enhanceLevel ?? previousSameItem?.enhanceLevel ?? 0,
    alchemySuccessRate: item.alchemySuccessRate ?? previousSameItem?.alchemySuccessRate ?? template?.alchemySuccessRate,
    alchemySpeedRate: item.alchemySpeedRate ?? previousSameItem?.alchemySpeedRate ?? template?.alchemySpeedRate,
    enhancementSuccessRate: item.enhancementSuccessRate ?? previousSameItem?.enhancementSuccessRate ?? template?.enhancementSuccessRate,
    enhancementSpeedRate: item.enhancementSpeedRate ?? previousSameItem?.enhancementSpeedRate ?? template?.enhancementSpeedRate,
    mapUnlockId: item.mapUnlockId ?? previousSameItem?.mapUnlockId,
    mapUnlockIds: item.mapUnlockIds ?? previousSameItem?.mapUnlockIds ?? template?.mapUnlockIds,
    tileAuraGainAmount: item.tileAuraGainAmount ?? previousSameItem?.tileAuraGainAmount,
    allowBatchUse: item.allowBatchUse ?? previousSameItem?.allowBatchUse,
  };
}


function mergeInventoryUpdate(previous: Inventory | undefined, patch: S2C_InventoryUpdate): Inventory {
  if (patch.inventory) {
    return {
      capacity: patch.inventory.capacity,
      items: patch.inventory.items.map((item) => hydrateSyncedItemStack(item)),
      cooldowns: patch.inventory.cooldowns
        ? cloneJson(patch.inventory.cooldowns)
        : undefined,
      serverTick: patch.inventory.serverTick,
    };
  }

  const next: Inventory = previous
    ? cloneJson(previous)
    : { items: [], capacity: 0 };
  if (patch.capacity !== undefined) {
    next.capacity = patch.capacity;
  }
  if (patch.size !== undefined) {
    next.items.length = Math.max(0, patch.size);
  }
  if (patch.cooldowns !== undefined) {
    next.cooldowns = cloneJson(patch.cooldowns);
  }
  if (patch.serverTick !== undefined) {
    next.serverTick = patch.serverTick;
  }
  for (const slotPatch of patch.slots ?? []) {
    if (slotPatch.item) {
      next.items[slotPatch.slotIndex] = hydrateSyncedItemStack(slotPatch.item, next.items[slotPatch.slotIndex]);
      continue;
    }
    next.items.splice(slotPatch.slotIndex, 1);
  }
  return next;
}


function mergeEquipmentUpdate(previous: PlayerState['equipment'] | undefined, patch: S2C_EquipmentUpdate): PlayerState['equipment'] {
  const next = previous
    ? cloneJson(previous)
    : {
        weapon: null,
        head: null,
        body: null,
        legs: null,
        accessory: null,
      };

  for (const slot of EQUIP_SLOTS) {
    if (!(slot in next)) {
      next[slot] = null;
    }
  }

  for (const slotPatch of patch.slots) {
    next[slotPatch.slot] = slotPatch.item
      ? hydrateSyncedItemStack(slotPatch.item, next[slotPatch.slot] ?? undefined)
      : null;
  }

  return next;
}


function hydrateLootWindowState(window: S2C_LootWindowUpdate['window']): LootWindowState | null {
  if (!window) {
    return null;
  }
  return {
    tileX: window.tileX,
    tileY: window.tileY,
    title: window.title,
    sources: window.sources.map((source) => ({
      sourceId: source.sourceId,
      kind: source.kind,
      variant: source.variant,
      title: source.title,
      desc: source.desc,
      grade: source.grade,
      searchable: source.searchable,
      search: source.search ? cloneJson(source.search) : undefined,
      herb: source.herb ? cloneJson(source.herb) : undefined,
      destroyed: source.destroyed === true,
      emptyText: source.emptyText,
      items: source.items.map((entry) => ({
        itemKey: entry.itemKey,
        item: hydrateSyncedItemStack(entry.item),
      })),
    })),
  };
}


function hydrateNpcShopResponse(data: S2C_NpcShop) {
  return {
    npcId: data.npcId,
    error: data.error,
    shop: data.shop
      ? {
          npcId: data.shop.npcId,
          npcName: data.shop.npcName,
          dialogue: data.shop.dialogue,
          currencyItemId: data.shop.currencyItemId,
          currencyItemName: data.shop.currencyItemName,
          items: data.shop.items.map((entry) => ({
            itemId: entry.itemId,
            unitPrice: entry.unitPrice,
            remainingQuantity: entry.remainingQuantity,
            stockLimit: entry.stockLimit,
            refreshAt: entry.refreshAt,
            item: hydrateSyncedItemStack(entry.item),
          })),
        }
      : null,
  };
}


function mergeTechniqueStates(patches: TechniqueUpdateEntry[], removeTechniqueIds: string[] = []): TechniqueState[] {
  const removedIdSet = new Set(removeTechniqueIds);
  const merged = [...latestTechniqueMap.values()]
    .filter((technique) => !removedIdSet.has(technique.techId))
    .map((technique) => cloneJson(technique));
  const nextMap = new Map(merged.map((technique) => [technique.techId, technique] as const));

  for (const patch of patches) {
    const previous = nextMap.get(patch.techId);
    const next = mergeTechniquePatch(patch, previous);
    if (previous) {
      const index = merged.findIndex((technique) => technique.techId === patch.techId);
      if (index >= 0) {
        merged[index] = next;
      }
    } else {
      merged.push(next);
    }
    nextMap.set(next.techId, next);
  }

  latestTechniqueMap = nextMap;
  return merged;
}


function mergeActionPatch(patch: ActionUpdateEntry, previous?: ActionDef): ActionDef {
  const previousSameAction = previous?.id === patch.id ? previous : undefined;
  const skillTemplate = getLocalSkillTemplate(patch.id);
  const nextType = applyNullablePatch(patch.type, previousSameAction?.type) ?? (skillTemplate ? 'skill' : 'interact');
  const isSkillAction = nextType === 'skill';
  return {
    id: patch.id,
    cooldownLeft: patch.cooldownLeft ?? previousSameAction?.cooldownLeft ?? 0,
    autoBattleEnabled: applyNullablePatch(patch.autoBattleEnabled, previousSameAction?.autoBattleEnabled),
    autoBattleOrder: applyNullablePatch(patch.autoBattleOrder, previousSameAction?.autoBattleOrder),
    skillEnabled: applyNullablePatch(patch.skillEnabled, previousSameAction?.skillEnabled),
    name: applyNullablePatch(patch.name, previousSameAction?.name) ?? skillTemplate?.name ?? patch.id,
    type: nextType,
    desc: applyNullablePatch(patch.desc, previousSameAction?.desc) ?? skillTemplate?.desc ?? '',
    range: applyNullablePatch(patch.range, previousSameAction?.range) ?? skillTemplate?.range,
    requiresTarget: applyNullablePatch(patch.requiresTarget, previousSameAction?.requiresTarget)
      ?? skillTemplate?.requiresTarget
      ?? (isSkillAction ? true : undefined),
    targetMode: applyNullablePatch(patch.targetMode, previousSameAction?.targetMode)
      ?? skillTemplate?.targetMode
      ?? (isSkillAction ? 'any' : undefined),
  };
}


function mergeActionStates(
  patches: ActionUpdateEntry[],
  removeActionIds: string[] = [],
  actionOrder?: string[],
): ActionDef[] {
  const removedIdSet = new Set(removeActionIds);
  const merged = [...latestActionMap.values()]
    .filter((action) => !removedIdSet.has(action.id))
    .map((action) => cloneJson(action));
  const nextMap = new Map(merged.map((action) => [action.id, action] as const));

  for (const patch of patches) {
    const previous = nextMap.get(patch.id);
    const next = mergeActionPatch(patch, previous);
    if (previous) {
      const index = merged.findIndex((action) => action.id === patch.id);
      if (index >= 0) {
        merged[index] = next;
      }
    } else {
      merged.push(next);
    }
    nextMap.set(next.id, next);
  }

  if (actionOrder && actionOrder.length > 0) {
    const orderIndex = new Map(actionOrder.map((actionId, index) => [actionId, index] as const));
    merged.sort((left, right) => (
      (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  }

  latestActionMap = nextMap;
  return merged;
}

/** formatTraversalCost：格式化输出字符串用于展示。 */
function formatTraversalCost(tile: Tile): string {
  if (!tile.walkable) {
    return '无法通行';
  }
  const cost = getTileTraversalCost(tile.type);
  return `${cost} 点/格`;
}


function toObserveEntityCardData(entity: ObservedEntity): ObserveEntityCardData {
  if (isCrowdEntityKind(entity.kind)) {
    return {
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      monsterTier: entity.monsterTier,
    };
  }
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    monsterTier: entity.monsterTier,
    hp: entity.hp,
    maxHp: entity.maxHp,
    qi: entity.qi,
    maxQi: entity.maxQi,
    npcQuestMarker: entity.npcQuestMarker,
    observation: entity.observation,
    buffs: entity.buffs,
  };
}


function normalizeObserveEntityCardData(entity: NonNullable<S2C_TileRuntimeDetail['entities']>[number]): ObserveEntityCardData {
  if (isCrowdEntityKind(entity.kind)) {
    return {
      id: entity.id,
      name: entity.name,
      kind: entity.kind ?? undefined,
      monsterTier: entity.monsterTier ?? undefined,
    };
  }
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind ?? undefined,
    monsterTier: entity.monsterTier ?? undefined,
    hp: entity.hp,
    maxHp: entity.maxHp,
    qi: entity.qi,
    maxQi: entity.maxQi,
    npcQuestMarker: entity.npcQuestMarker ?? undefined,
    observation: entity.observation ?? undefined,
    lootPreview: entity.lootPreview ?? undefined,
    buffs: entity.buffs ?? undefined,
  };
}

function buildObservedEntityCardHtml(entity: ObserveEntityCardData): string {
  if (isCrowdEntityKind(entity.kind)) {
    return `<div class="observe-entity-card">
      <div class="observe-entity-head">
        <span class="observe-entity-name">${escapeHtml(entity.name ?? '人群')}</span>
        <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, '人群'))}</span>
      </div>
      <div class="observe-entity-verdict">此地人影交叠，气机纷杂，只能辨出这里聚着一团密集人群。</div>
      <div class="observe-entity-empty">地图广播已将此格玩家聚合为人群显示，不再实时展开单人的血条、Buff 与细节变化。</div>
    </div>`;
  }
  const detailRows = (entity.observation?.lines ?? []).filter((row) => row.label !== '生命' && row.label !== '气血' && row.label !== '灵力');
  const monsterPresentation = entity.kind === 'monster'
    ? getMonsterPresentation(entity.name, entity.monsterTier)
    : null;
  const title = monsterPresentation?.label ?? entity.name ?? entity.id;
  const badge = monsterPresentation?.badgeText
    ? `<span class="${monsterPresentation.badgeClassName}">${escapeHtml(monsterPresentation.badgeText)}</span>`
    : '';
  const vitalRows = [
    { label: '生命', value: formatCurrentMax(entity.hp, entity.maxHp) },
    { label: '灵力', value: formatCurrentMax(entity.qi, entity.maxQi) },
  ].filter((entry) => entry.value !== '—');
  const fallbackVitalRows = (entity.kind === 'monster' || entity.kind === 'npc' || entity.kind === 'player') && detailRows.length === 0
    ? vitalRows
    : [];
  const detailGrid = detailRows.length > 0 ? [...vitalRows, ...detailRows] : fallbackVitalRows;
  const visibleBuffs = entity.buffs ?? [];
  const publicBuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
  const publicDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
  const observeOnlyBuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
  const observeOnlyDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
  const buffSection = `<div class="observe-buff-columns">
    ${buildBuffSectionHtml('增益状态', [...publicBuffs, ...observeOnlyBuffs], '当前未见明显增益状态')}
    ${buildBuffSectionHtml('减益状态', [...publicDebuffs, ...observeOnlyDebuffs], '当前未见明显减益状态')}
  </div>`;
  const lootAction = entity.kind === 'monster'
    ? `<div class="observe-entity-actions">
        <button
          class="small-btn ghost observe-entity-action-btn${entity.observation?.clarity === 'complete' ? '' : ' is-disabled'}"
          type="button"
          data-observe-loot-id="${escapeHtml(entity.id)}"
          aria-disabled="${entity.observation?.clarity === 'complete' ? 'false' : 'true'}"
          title="${escapeHtml(entity.observation?.clarity === 'complete' ? '查看掉落物与概率' : '神识完全探查后可查看掉落物与概率')}"
        >掉落物</button>
      </div>`
    : '';
  return `<div class="observe-entity-card">
    <div class="observe-entity-head">
      <span class="observe-entity-name">${badge}${escapeHtml(title)}</span>
      <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, '未知'))}</span>
    </div>
    <div class="observe-entity-verdict">${escapeHtml(entity.observation?.verdict ?? '神识轻拂而过，未得更多回响。')}</div>
    ${detailGrid.length > 0
      ? `<div class="observe-entity-grid">${buildObservationRows(detailGrid)}</div>`
      : '<div class="observe-entity-empty">此身气机尽藏，暂未看出更多端倪。</div>'}
    ${buffSection}
    ${lootAction}
  </div>`;
}

/** findObservedEntityById：从集合中查找目标。 */
function findObservedEntityById(entityId: string): ObserveEntityCardData | null {
  const entities = activeObservedTileDetail?.entities;
  if (!entities) {
    return null;
  }
  const matched = entities.find((entity) => entity.id === entityId);
  return matched ? normalizeObserveEntityCardData(matched) : null;
}

/** formatObserveLootChance：格式化输出字符串用于展示。 */
function formatObserveLootChance(chance: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(chance) ? chance : 0));
  const percent = normalized * 100;
  if (percent >= 10) {
    return `${percent.toFixed(1)}%`;
  }
  if (percent >= 1) {
    return `${percent.toFixed(2)}%`;
  }
  return `${percent.toFixed(3)}%`;
}

/** openObserveLootPreview：打开界面或流程。 */
function openObserveLootPreview(entity: ObserveEntityCardData): void {
  if (entity.kind !== 'monster' || entity.observation?.clarity !== 'complete' || !entity.lootPreview) {
    return;
  }
  const rowsHtml = entity.lootPreview.entries.length > 0
    ? entity.lootPreview.entries.map((entry) => `
        <div class="observe-loot-preview-row">
          <div class="observe-loot-preview-item">${renderInlineItemChip(entry.itemId, { count: entry.count, label: entry.name, tone: 'reward' })}</div>
          <span class="observe-loot-preview-chance">${escapeHtml(formatObserveLootChance(entry.chance))}</span>
        </div>
      `).join('')
    : `<div class="observe-entity-empty">${escapeHtml(entity.lootPreview.emptyText ?? '未探到稳定掉落。')}</div>`;
  detailModalHost.open({
    ownerId: 'observe-loot-preview',
    variantClass: 'detail-modal--loot',
    title: `${entity.name ?? '目标'}掉落物`,
    subtitle: '当前神识推演下的实际掉落概率',
    bodyHtml: `
      <section class="quest-detail-section">
        <strong>掉落预览</strong>
        <div class="observe-loot-preview-list">${rowsHtml}</div>
      </section>
    `,
    onAfterRender: (body) => {
      bindInlineItemTooltips(body);
    },
  });
}

/** bindObserveLootPreviewActions：绑定回调。 */
function bindObserveLootPreviewActions(root: HTMLElement): void {
  if (observeLootPreviewDelegatedBound) {
    return;
  }
  observeLootPreviewDelegatedBound = true;
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLElement>('[data-observe-loot-id]');
    if (!button) {
      return;
    }
    const entityId = button.dataset.observeLootId?.trim();
    if (!entityId) {
      return;
    }
    const entity = findObservedEntityById(entityId);
    if (!entity || entity.kind !== 'monster' || entity.observation?.clarity !== 'complete' || !entity.lootPreview) {
      showToast('神识尚未完全探明其掉落。');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    openObserveLootPreview(entity);
    event.preventDefault();
    event.stopPropagation();
  });
}


function resolveObserveEntities(targetX: number, targetY: number): ObserveEntityCardData[] {
  if (
    activeObservedTile
    && activeObservedTile.mapId === myPlayer?.mapId
    && activeObservedTile.x === targetX
    && activeObservedTile.y === targetY
    && activeObservedTileDetail?.entities
  ) {
    return activeObservedTileDetail.entities.map((entity) => normalizeObserveEntityCardData(entity));
  }

  const localEntities = latestEntities
    .filter((entity) => entity.wx === targetX && entity.wy === targetY);
  const hasCrowdEntity = localEntities.some((entity) => isCrowdEntityKind(entity.kind));

  return localEntities
    .filter((entity) => !hasCrowdEntity || entity.kind !== 'player')
    .map((entity) => toObserveEntityCardData(entity));
}

function buildObservedEntitySectionHtml(entities: ObserveEntityCardData[]): string {
  return `<section class="observe-modal-section">
    <div class="observe-modal-section-title">角色信息</div>
    ${entities.length > 0
      ? `<div class="observe-entity-list">${entities.map((entity) => buildObservedEntityCardHtml(entity)).join('')}</div>`
      : '<div class="observe-entity-empty">该地块当前没有角色、怪物或 NPC。</div>'}
  </section>`;
}


function resolveObserveBuffTooltipNode(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>('[data-buff-tooltip-title]');
}


function readObserveBuffTooltipPayload(node: HTMLElement): { title: string; lines: string[] } {
  return {
    title: node.dataset.buffTooltipTitle ?? '',
    lines: (node.dataset.buffTooltipDetail ?? '').split('\n').filter(Boolean),
  };
}

/** bindObserveBuffTooltips：绑定回调。 */
function bindObserveBuffTooltips(root: HTMLElement): void {
  if (observeBuffTooltipDelegatedBound) {
    return;
  }
  observeBuffTooltipDelegatedBound = true;

  root.addEventListener('click', (event) => {
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node || !prefersPinnedTooltipInteraction() || !(event instanceof MouseEvent)) {
      return;
    }
    const { title, lines } = readObserveBuffTooltipPayload(node);
    if (observeBuffTooltip.isPinnedTo(node)) {
      observeBuffTooltip.hide(true);
      observeBuffTooltipHoverNode = null;
    } else {
      observeBuffTooltip.showPinned(node, title, lines, event.clientX, event.clientY);
      observeBuffTooltipHoverNode = node;
    }
    event.preventDefault();
    event.stopPropagation();
  }, true);

  root.addEventListener('pointerover', (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node) {
      return;
    }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) {
      return;
    }
    if (prefersPinnedTooltipInteraction() && observeBuffTooltip.isPinned()) {
      return;
    }
    const { title, lines } = readObserveBuffTooltipPayload(node);
    observeBuffTooltip.show(title, lines, event.clientX, event.clientY);
    observeBuffTooltipHoverNode = node;
  });

  root.addEventListener('pointermove', (event) => {
    if (!(event instanceof PointerEvent)) {
      return;
    }
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node || (prefersPinnedTooltipInteraction() && observeBuffTooltip.isPinned())) {
      return;
    }
    if (observeBuffTooltipHoverNode !== node) {
      const { title, lines } = readObserveBuffTooltipPayload(node);
      observeBuffTooltip.show(title, lines, event.clientX, event.clientY);
      observeBuffTooltipHoverNode = node;
      return;
    }
    observeBuffTooltip.move(event.clientX, event.clientY);
  });

  root.addEventListener('pointerout', (event) => {
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node) {
      return;
    }
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && node.contains(relatedTarget)) {
      return;
    }
    if (observeBuffTooltip.isPinnedTo(node)) {
      return;
    }
    if (observeBuffTooltipHoverNode === node) {
      observeBuffTooltipHoverNode = null;
      observeBuffTooltip.hide();
    }
  });
}

/** renderObserveModal：渲染当前界面内容。 */
function renderObserveModal(targetX: number, targetY: number): void {
  const tile = getVisibleTileAt(targetX, targetY);
  if (!tile) {
    showToast('只能观察当前视野内的格子');
    return;
  }

  const groundPile = getVisibleGroundPileAt(targetX, targetY);
  const sortedEntities = [...resolveObserveEntities(targetX, targetY)].sort((left, right) => {
    const order = (kind?: string): number => (kind === 'crowd' ? 0 : kind === 'player' ? 1 : kind === 'container' ? 2 : kind === 'npc' ? 3 : kind === 'monster' ? 4 : 5);
    return order(left.kind) - order(right.kind);
  });
  const terrainRows = [
    { label: '地貌', value: getTileTypeName(tile.type) },
    { label: '是否可通行', value: tile.walkable ? '可通行' : '不可通行' },
    { label: '行走消耗', value: formatTraversalCost(tile) },
    { label: '是否阻挡视线', value: tile.blocksSight ? '会阻挡' : '不会阻挡' },
  ];
  if (typeof tile.hp === 'number' && typeof tile.maxHp === 'number') {
    terrainRows.push({
      label: tile.type === TileType.Wall ? '壁垒稳固' : '地物稳固',
      value: formatCurrentMax(tile.hp, tile.maxHp),
    });
  }
  if (sortedEntities.length > 0) {
    terrainRows.push({ label: '驻足气息', value: sortedEntities.map((entity) => entity.name ?? getEntityKindLabel(entity.kind, entity.id)).join('、') });
  } else if (tile.occupiedBy) {
    terrainRows.push({ label: '驻足气息', value: '此地留有生灵立身之痕' });
  }
  if (tile.modifiedAt) {
    terrainRows.push({ label: '最近变动', value: '此地近期发生过变化' });
  }
  if (tile.hiddenEntrance) {
    terrainRows.push({ label: '异状', value: tile.hiddenEntrance.title });
  }

  if (observeModalSubtitleEl) {
    observeModalSubtitleEl.textContent = `坐标 (${targetX}, ${targetY})`;
  }
  if (observeModalBodyEl) {
    const groundHtml = groundPile && groundPile.items.length > 0
      ? `<div class="observe-entity-list">${groundPile.items.map((entry) => `
          <div class="observe-modal-row">
            <span class="observe-modal-label">${escapeHtml(entry.name)}</span>
            <span class="observe-modal-value">${formatDisplayCountBadge(entry.count)}</span>
          </div>
        `).join('')}</div>`
      : '<div class="observe-entity-empty">该地块当前没有可见地面物品。</div>';
    observeModalBodyEl.innerHTML = `
      <div class="observe-modal-top">
        <section class="observe-modal-section">
          <div class="observe-modal-section-title">地块信息</div>
          <div class="observe-modal-grid">${buildObservationRows(terrainRows)}</div>
        </section>
        ${tile.hiddenEntrance ? `
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">隐藏入口</div>
            <div class="observe-entity-list">
              <div class="observe-modal-row">
                <span class="observe-modal-label">痕迹</span>
                <span class="observe-modal-value">${escapeHtml(tile.hiddenEntrance.title)}</span>
              </div>
              <div class="observe-entity-empty">${escapeHtml(tile.hiddenEntrance.desc ?? '这里隐约残留着一处被刻意遮掩的入口痕迹。')}</div>
            </div>
          </section>
        ` : ''}
        <section class="observe-modal-section">
          <div class="observe-modal-section-title">地面物品</div>
          ${groundHtml}
        </section>
      </div>
      ${buildObservedEntitySectionHtml(sortedEntities)}
    `;
    bindObserveLootPreviewActions(observeModalBodyEl);
    bindObserveBuffTooltips(observeModalBodyEl);
  }
  renderObserveAsideCards(buildObservedResourceAsideCards(targetX, targetY, tile));
  observeModalEl?.classList.remove('hidden');
  observeModalEl?.setAttribute('aria-hidden', 'false');
}

/** showObserveModal：显示当前视图。 */
function showObserveModal(targetX: number, targetY: number): void {
  if (!myPlayer) {
    return;
  }
  activeObservedTile = { mapId: myPlayer.mapId, x: targetX, y: targetY };
  activeObservedTileDetail = null;
  renderObserveModal(targetX, targetY);
  socket.sendInspectTileRuntime(targetX, targetY);
}

// 面板回调绑定
inventoryPanel.setCallbacks(
  (slotIndex, count) => socket.sendUseItem(slotIndex, count),
  (slotIndex, count) => socket.sendDropItem(slotIndex, count),
  (slotIndex, count) => socket.sendDestroyItem(slotIndex, count),
  (slotIndex) => socket.sendEquip(slotIndex),
  () => socket.sendSortInventory(),
);
lootPanel.setCallbacks(
  (sourceId, itemKey) => {
    socket.sendTakeLoot(sourceId, itemKey);
  },
  (sourceId) => {
    socket.sendTakeLoot(sourceId, undefined, true);
  },
  () => {
    socket.sendCloseLootWindow();
  },
);
equipmentPanel.setCallbacks(
  (slot) => socket.sendUnequip(slot),
);
techniquePanel.setCallbacks(
  (techId) => socket.sendCultivate(techId),
  (techId, enabled) => socket.sendUpdateTechniqueSkillAvailability(techId, enabled),
);
attrPanel.setCallbacks({
  onRequestDetail: () => socket.sendRequestAttrDetail(),
});
worldPanel.setCallbacks({
  onOpenWorldSummary: () => worldSummaryModal.open(),
  onOpenLeaderboard: () => leaderboardModal.open(),
});
worldSummaryModal.setCallbacks({
  onRequestData: () => socket.sendRequestWorldSummary(),
});
leaderboardModal.setCallbacks({
  onRequestData: (limit) => socket.sendRequestLeaderboard(limit),
});
questPanel.setCallbacks((questId) => {
  clearCurrentPath();
  pendingQuestNavigateId = questId;
  socket.sendNavigateQuest(questId);
});
marketPanel.setCallbacks({
  onRequestMarket: () => socket.sendRequestMarket(),
  onRequestMarketListings: (payload) => socket.sendRequestMarketListings(payload),
  onRequestItemBook: (itemKey) => socket.sendRequestMarketItemBook(itemKey),
  onRequestTradeHistory: (page) => socket.sendRequestMarketTradeHistory(page),
  onCreateSellOrder: (slotIndex, quantity, unitPrice) => socket.sendCreateMarketSellOrder(slotIndex, quantity, unitPrice),
  onCreateBuyOrder: (itemKey, quantity, unitPrice) => socket.sendCreateMarketBuyOrder(itemKey, quantity, unitPrice),
  onCancelOrder: (orderId) => socket.sendCancelMarketOrder(orderId),
  onClaimStorage: () => socket.sendClaimMarketStorage(),
});
npcShopModal.setCallbacks({
  onRequestShop: (npcId) => socket.sendRequestNpcShop(npcId),
  onBuyItem: (npcId, itemId, quantity) => socket.sendBuyNpcShopItem(npcId, itemId, quantity),
});
alchemyModal.setCallbacks({
  onRequestPanel: (knownCatalogVersion) => socket.sendRequestAlchemyPanel(knownCatalogVersion),
  onSavePreset: (payload) => socket.sendSaveAlchemyPreset(payload),
  onDeletePreset: (presetId) => socket.sendDeleteAlchemyPreset(presetId),
  onStartAlchemy: (payload) => socket.sendStartAlchemy(payload),
  onCancelAlchemy: () => socket.sendCancelAlchemy(),
});
enhancementModal.setCallbacks({
  onRequestPanel: () => socket.sendRequestEnhancementPanel(),
  onStartEnhancement: (payload) => socket.sendStartEnhancement(payload),
  onCancelEnhancement: () => socket.sendCancelEnhancement(),
});
actionPanel.setCallbacks(
  (actionId, requiresTarget, targetMode, range, actionName) => {
    if (actionId === 'client:take') {
      beginTargeting(actionId, actionName ?? actionId, targetMode, range ?? 1);
      return;
    }
    if (actionId === 'realm:breakthrough') {
      cancelTargeting();
      hideObserveModal();
      openBreakthroughModal();
      return;
    }
    if (actionId.startsWith('npc_shop:')) {
      cancelTargeting();
      hideObserveModal();
      npcShopModal.open(actionId.slice('npc_shop:'.length));
      return;
    }
    if (actionId === 'alchemy:open') {
      cancelTargeting();
      hideObserveModal();
      alchemyModal.open();
      return;
    }
    if (actionId === 'enhancement:open') {
      cancelTargeting();
      hideObserveModal();
      enhancementModal.open();
      return;
    }
    if (requiresTarget) {
      beginTargeting(actionId, actionName ?? actionId, targetMode, actionId === 'client:observe' ? getInfoRadius() : (range ?? 1));
      return;
    }
    cancelTargeting();
    hideObserveModal();
    socket.sendAction(actionId);
  },
  (skills) => {
    socket.sendUpdateAutoBattleSkills(skills);
  },
  (pills) => {
    socket.sendUpdateAutoUsePills(pills);
  },
  (combatTargetingRules) => {
    socket.sendUpdateCombatTargetingRules(combatTargetingRules);
  },
  (mode) => {
    socket.sendUpdateAutoBattleTargetingMode(mode);
  },
);
debugPanel.setCallbacks(() => {
  showToast('已发送回出生点请求');
  socket.sendDebugResetSpawn();
});
chatUI.setCallback((message) => socket.sendChat(message));
settingsPanel.setOptions({
  getCurrentAccountName: () => getCurrentAccountName() ?? '',
  getCurrentDisplayName: () => myPlayer?.displayName ?? '',
  getCurrentRoleName: () => myPlayer?.name ?? '',
  onDisplayNameUpdated: (displayName) => {
    applyLocalDisplayName(displayName);
    showToast(`显示名称已改为 ${displayName}`);
  },
  onRoleNameUpdated: (roleName) => {
    applyLocalRoleName(roleName);
    showToast(`角色名称已改为 ${roleName}`);
  },
  redeemCodes: (codes) => requestRedeemCodes(codes),
  onLogout: () => {
    detailModalHost.close('settings-panel');
    socket.disconnect();
    resetGameState();
    loginUI.logout('已退出登录');
  },
});

/** requestRedeemCodes：发起对应请求。 */
function requestRedeemCodes(codes: string[]): Promise<AccountRedeemCodesRes> {
  if (!socket.connected) {
    return Promise.reject(new Error('当前连接不可用，请稍后重试'));
  }
  if (pendingRedeemCodesRequest) {
    return Promise.reject(new Error('已有兑换请求正在处理中'));
  }
  return new Promise<AccountRedeemCodesRes>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (pendingRedeemCodesRequest?.timeoutId !== timeoutId) {
        return;
      }
      pendingRedeemCodesRequest = null;
      reject(new Error('兑换结果返回超时，请稍后查看背包或重试'));
    }, 12000);
    pendingRedeemCodesRequest = { resolve, reject, timeoutId };
    socket.sendRedeemCodes(codes);
  });
}


function applyZoomChange(nextZoom: number): number {
  const previous = getZoom();
  const zoom = setZoom(nextZoom);
  refreshZoomChrome(zoom);
  if (zoom !== previous) {
    refreshZoomViewport();
  }
  return zoom;
}

zoomSlider?.setAttribute('min', String(MIN_ZOOM));
zoomSlider?.setAttribute('max', String(MAX_ZOOM));
zoomSlider?.addEventListener('input', () => {
  applyZoomChange(Number(zoomSlider.value));
});
zoomSlider?.addEventListener('change', () => {
  const zoom = applyZoomChange(Number(zoomSlider.value));
  showToast(`缩放已调整为 ${formatZoom(zoom)}x`);
});
zoomResetBtn?.addEventListener('click', () => {
  const zoom = applyZoomChange(2);
  showToast(`缩放已重置为 ${formatZoom(zoom)}x`);
});
joinQqGroupBtns.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    void handleQqGroupLinkClick();
  });
});

document.getElementById('hud-toggle-auto-battle')?.addEventListener('click', () => {
  socket.sendAction('toggle:auto_battle');
});
document.getElementById('hud-toggle-auto-retaliate')?.addEventListener('click', () => {
  socket.sendAction('toggle:auto_retaliate');
});
// S2C 更新回调
socket.onRealmUpdate((data: S2C_RealmUpdate) => {
  if (!myPlayer) {
    return;
  }
  const nextRealm = data.realm ? cloneJson(data.realm) : undefined;
  myPlayer.realm = nextRealm;
  myPlayer.realmLv = nextRealm?.realmLv;
  myPlayer.realmName = nextRealm?.name;
  myPlayer.realmStage = nextRealm?.shortName;
  myPlayer.realmReview = nextRealm?.review;
  myPlayer.breakthroughReady = nextRealm?.breakthroughReady;
  myPlayer.heavenGate = nextRealm?.heavenGate ?? undefined;

  if (nextRealm && latestAttrUpdate) {
    nextRealm.progress = latestAttrUpdate.realmProgress ?? nextRealm.progress;
    nextRealm.progressToNext = latestAttrUpdate.realmProgressToNext ?? nextRealm.progressToNext;
    nextRealm.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? nextRealm.breakthroughReady;
    myPlayer.breakthroughReady = nextRealm.breakthroughReady;
  }

  refreshHeavenGateModal(myPlayer, {
    showToast,
    sendAction: (action, element) => socket.sendHeavenGateAction(action, element),
  });
  inventoryPanel.syncPlayerContext(myPlayer ?? undefined);
  refreshUiChrome();
});
socket.onAttrUpdate((data) => {
  attrPanel.invalidateDetail();
  latestAttrUpdate = mergeAttrUpdatePatch(latestAttrUpdate, data);
  if (myPlayer) {
    myPlayer.baseAttrs = latestAttrUpdate.baseAttrs ?? myPlayer.baseAttrs;
    myPlayer.bonuses = latestAttrUpdate.bonuses ?? myPlayer.bonuses;
    myPlayer.finalAttrs = latestAttrUpdate.finalAttrs ?? myPlayer.finalAttrs;
    myPlayer.numericStats = latestAttrUpdate.numericStats ?? myPlayer.numericStats;
    myPlayer.ratioDivisors = latestAttrUpdate.ratioDivisors ?? myPlayer.ratioDivisors;
    myPlayer.numericStatBreakdowns = latestAttrUpdate.numericStatBreakdowns ?? myPlayer.numericStatBreakdowns;
    myPlayer.maxHp = latestAttrUpdate.maxHp ?? myPlayer.maxHp;
    myPlayer.qi = latestAttrUpdate.qi ?? myPlayer.qi;
    myPlayer.foundation = latestAttrUpdate.specialStats?.foundation ?? myPlayer.foundation;
    myPlayer.combatExp = latestAttrUpdate.specialStats?.combatExp ?? myPlayer.combatExp;
    myPlayer.boneAgeBaseYears = latestAttrUpdate.boneAgeBaseYears ?? myPlayer.boneAgeBaseYears;
    myPlayer.lifeElapsedTicks = latestAttrUpdate.lifeElapsedTicks ?? myPlayer.lifeElapsedTicks;
    myPlayer.lifespanYears = latestAttrUpdate.lifespanYears === undefined
      ? myPlayer.lifespanYears
      : latestAttrUpdate.lifespanYears;
    if (latestAttrUpdate.numericStats?.viewRange !== undefined) {
      myPlayer.viewRange = Math.max(1, Math.round(latestAttrUpdate.numericStats.viewRange || myPlayer.viewRange));
    }
    myPlayer.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? myPlayer.breakthroughReady;
    myPlayer.alchemySkill = latestAttrUpdate.alchemySkill ?? myPlayer.alchemySkill;
    myPlayer.gatherSkill = latestAttrUpdate.gatherSkill ?? myPlayer.gatherSkill;
    myPlayer.enhancementSkill = latestAttrUpdate.enhancementSkill ?? myPlayer.enhancementSkill;
    if (myPlayer.realm) {
      myPlayer.realm.progress = latestAttrUpdate.realmProgress ?? myPlayer.realm.progress;
      myPlayer.realm.progressToNext = latestAttrUpdate.realmProgressToNext ?? myPlayer.realm.progressToNext;
      myPlayer.realm.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? myPlayer.realm.breakthroughReady;
      myPlayer.breakthroughReady = myPlayer.realm.breakthroughReady;
    }
    techniquePanel.syncDynamic(myPlayer.techniques, myPlayer.cultivatingTechId, myPlayer);
    actionPanel.syncDynamic(myPlayer.actions, myPlayer.autoBattle, myPlayer.autoRetaliate, myPlayer);
    bodyTrainingPanel.syncFoundation(myPlayer.foundation);
    alchemyModal.syncAlchemySkill(myPlayer.alchemySkill);
  }
  attrPanel.update(latestAttrUpdate);
  refreshHeavenGateModal(myPlayer, {
    showToast,
    sendAction: (action, element) => socket.sendHeavenGateAction(action, element),
  });
  inventoryPanel.syncPlayerContext(myPlayer ?? undefined);
  refreshUiChrome();
});
socket.onAttrDetail((data) => {
  attrPanel.applyDetail(data);
});
socket.onLeaderboard((data) => {
  leaderboardModal.applyData(data);
});
socket.onWorldSummary((data) => {
  worldSummaryModal.applyData(data);
});
socket.onInventoryUpdate((data) => {
  const mergedInventory = mergeInventoryUpdate(myPlayer?.inventory, data);
  if (mergedInventory.serverTick !== undefined) {
    syncEstimatedServerTick(mergedInventory.serverTick);
  }
  if (myPlayer) {
    myPlayer.inventory = mergedInventory;
    actionPanel.syncDynamic(myPlayer.actions, myPlayer.autoBattle, myPlayer.autoRetaliate, myPlayer);
  }
  inventoryPanel.update(mergedInventory);
  questPanel.syncInventory(mergedInventory);
  marketPanel.syncInventory(mergedInventory);
  npcShopModal.syncInventory(mergedInventory);
  alchemyModal.syncInventory(mergedInventory);
  enhancementModal.syncInventory(mergedInventory);
});
socket.onEquipmentUpdate((data) => {
  const mergedEquipment = mergeEquipmentUpdate(myPlayer?.equipment, data);
  if (myPlayer) {
    myPlayer.equipment = mergedEquipment;
    inventoryPanel.syncPlayerContext(myPlayer);
  }
  equipmentPanel.update(mergedEquipment);
  alchemyModal.syncEquipment(mergedEquipment);
  enhancementModal.syncEquipment(mergedEquipment);
});
socket.onTechniqueUpdate((data) => {
  const mergedTechniques = resolvePreviewTechniques(
    mergeTechniqueStates(data.techniques, data.removeTechniqueIds ?? []),
  );
  const nextCultivatingTechId = data.cultivatingTechId === undefined
    ? myPlayer?.cultivatingTechId
    : data.cultivatingTechId ?? undefined;
  const nextBodyTraining = data.bodyTraining === undefined
    ? myPlayer?.bodyTraining
    : data.bodyTraining ?? undefined;
  const shouldRefreshTechniquePanel = !myPlayer
    || haveTechniqueStructureChanges(myPlayer.techniques, myPlayer.cultivatingTechId, mergedTechniques, nextCultivatingTechId);
  if (myPlayer) {
    myPlayer.techniques = mergedTechniques;
    myPlayer.cultivatingTechId = nextCultivatingTechId;
    myPlayer.bodyTraining = nextBodyTraining;
    inventoryPanel.syncPlayerContext(myPlayer);
    marketPanel.syncPlayerContext(myPlayer);
    npcShopModal.syncPlayerContext(myPlayer);
  }
  if (shouldRefreshTechniquePanel) {
    techniquePanel.update(mergedTechniques, nextCultivatingTechId, myPlayer ?? undefined);
    refreshUiChrome();
  } else {
    techniquePanel.syncDynamic(mergedTechniques, nextCultivatingTechId, myPlayer ?? undefined);
  }
  bodyTrainingPanel.syncDynamic(nextBodyTraining, myPlayer?.foundation);
  if (myPlayer) {
    actionPanel.syncDynamic(myPlayer.actions, myPlayer.autoBattle, myPlayer.autoRetaliate, myPlayer);
  }
});
socket.onActionsUpdate((data) => {
  const mergedActions = mergeActionStates(data.actions, data.removeActionIds ?? [], data.actionOrder);
  const previousActions = myPlayer?.actions ?? [];
  const previousAutoBattle = myPlayer?.autoBattle ?? false;
  const previousAutoBattleTargetingMode = myPlayer?.autoBattleTargetingMode ?? 'auto';
  const previousAutoRetaliate = myPlayer?.autoRetaliate ?? true;
  const previousAutoBattleStationary = myPlayer?.autoBattleStationary ?? false;
  const previousAllowAoePlayerHit = myPlayer?.allowAoePlayerHit ?? false;
  const previousCombatTargetingRules = myPlayer?.combatTargetingRules;
  const previousAutoIdleCultivation = myPlayer?.autoIdleCultivation ?? true;
  const previousAutoSwitchCultivation = myPlayer?.autoSwitchCultivation ?? false;
  const previousCultivationActive = myPlayer?.cultivationActive ?? false;
  const nextAutoBattle = data.autoBattle ?? myPlayer?.autoBattle ?? false;
  const nextAutoUsePills = data.autoUsePills ?? myPlayer?.autoUsePills ?? [];
  const nextCombatTargetingRules = data.combatTargetingRules ?? myPlayer?.combatTargetingRules;
  const nextAutoBattleTargetingMode = data.autoBattleTargetingMode ?? myPlayer?.autoBattleTargetingMode ?? 'auto';
  const nextAutoRetaliate = data.autoRetaliate ?? myPlayer?.autoRetaliate ?? true;
  const nextAutoBattleStationary = data.autoBattleStationary ?? myPlayer?.autoBattleStationary ?? false;
  const nextAllowAoePlayerHit = data.allowAoePlayerHit ?? myPlayer?.allowAoePlayerHit ?? false;
  const nextAutoIdleCultivation = data.autoIdleCultivation ?? myPlayer?.autoIdleCultivation ?? true;
  const nextAutoSwitchCultivation = data.autoSwitchCultivation ?? myPlayer?.autoSwitchCultivation ?? false;
  const nextCultivationActive = data.cultivationActive ?? myPlayer?.cultivationActive ?? false;
  const nextSenseQiActive = data.senseQiActive ?? myPlayer?.senseQiActive ?? false;
  const shouldRefreshActionPanel = !myPlayer
    || previousAutoBattle !== nextAutoBattle
    || previousAutoBattleTargetingMode !== nextAutoBattleTargetingMode
    || previousAutoRetaliate !== nextAutoRetaliate
    || previousAutoBattleStationary !== nextAutoBattleStationary
    || previousAllowAoePlayerHit !== nextAllowAoePlayerHit
    || !isPlainEqual(previousCombatTargetingRules ?? null, nextCombatTargetingRules ?? null)
    || previousAutoIdleCultivation !== nextAutoIdleCultivation
    || previousAutoSwitchCultivation !== nextAutoSwitchCultivation
    || previousCultivationActive !== nextCultivationActive
    || haveActionRenderStructureChanges(previousActions, mergedActions);
  if (myPlayer) {
    myPlayer.actions = mergedActions;
    myPlayer.autoBattleSkills = mergedActions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
    myPlayer.autoBattle = data.autoBattle ?? myPlayer.autoBattle;
    myPlayer.autoUsePills = nextAutoUsePills;
    myPlayer.combatTargetingRules = nextCombatTargetingRules;
    myPlayer.autoBattleTargetingMode = nextAutoBattleTargetingMode;
    myPlayer.autoRetaliate = data.autoRetaliate ?? (myPlayer.autoRetaliate !== false);
    myPlayer.autoBattleStationary = nextAutoBattleStationary;
    myPlayer.allowAoePlayerHit = nextAllowAoePlayerHit;
    myPlayer.autoIdleCultivation = nextAutoIdleCultivation;
    myPlayer.autoSwitchCultivation = nextAutoSwitchCultivation;
    myPlayer.cultivationActive = nextCultivationActive;
    myPlayer.senseQiActive = nextSenseQiActive;
  }
  if (!previousAutoBattle && nextAutoBattle && (pathTarget || pathCells.length > 0)) {
    clearCurrentPath();
  }
  if (shouldRefreshActionPanel) {
    actionPanel.update(mergedActions, nextAutoBattle, nextAutoRetaliate, myPlayer ?? undefined);
    refreshUiChrome();
  } else {
    actionPanel.syncDynamic(mergedActions, nextAutoBattle, nextAutoRetaliate, myPlayer ?? undefined);
  }
  enhancementModal.syncActions(mergedActions);
  syncSenseQiOverlay();
});
socket.onLootWindowUpdate((data) => {
  lootPanel.update(hydrateLootWindowState(data.window));
});
socket.onTileRuntimeDetail((data) => {
  if (
    !myPlayer
    || !activeObservedTile
    || activeObservedTile.mapId !== myPlayer.mapId
    || activeObservedTile.x !== data.x
    || activeObservedTile.y !== data.y
  ) {
    return;
  }
  activeObservedTileDetail = data;
  renderObserveModal(data.x, data.y);
});
socket.onQuestUpdate((data) => {
  const hydratedQuests = hydrateQuestStates(data.quests);
  if (myPlayer) myPlayer.quests = hydratedQuests;
  questPanel.setCurrentMapId(myPlayer?.mapId);
  questPanel.update(hydratedQuests);
  refreshUiChrome();
});
socket.onQuestNavigateResult((data) => {
  if (pendingQuestNavigateId !== data.questId) {
    return;
  }
  pendingQuestNavigateId = null;
  if (!data.ok) {
    return;
  }
  questPanel.closeDetail();
});
socket.onMapStaticSync((data: S2C_MapStaticSync) => {
  mapRuntime.applyMapStaticSync(data);
  if (myPlayer && data.minimapLibrary) {
    myPlayer.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
    inventoryPanel.syncPlayerContext(myPlayer);
    marketPanel.syncPlayerContext(myPlayer);
    npcShopModal.syncPlayerContext(myPlayer);
  }
  if (myPlayer && data.mapId === myPlayer.mapId) {
    refreshUiChrome();
  }
});
socket.onSystemMsg((data) => {
  if (data.kind === 'chat') {
    void chatUI.addMessage(data.text, data.from, data.kind);
    return;
  }
  if (data.kind === 'grudge') {
    void chatUI.addMessage(data.text, data.from ?? '情仇', data.kind, {
      id: data.id,
      at: data.occurredAt,
    }).then((stored) => {
      if (stored && data.persistUntilAck === true && data.id) {
        socket.ackSystemMessages([data.id]);
      }
    });
    showToast(data.text, data.kind);
    return;
  }
  if (data.kind === 'quest' || data.kind === 'combat' || data.kind === 'loot') {
    const label = data.from ?? (data.kind === 'quest' ? '任务' : data.kind === 'combat' ? '战斗' : '掉落');
    void chatUI.addMessage(data.text, label, data.kind);
    if (data.kind === 'quest' || data.kind === 'loot') {
      showToast(data.text, data.kind);
    }
    return;
  }
  void chatUI.addMessage(data.text, data.from ?? '系统', data.kind ?? 'system');
  if (data.text === '无法到达该位置' || data.text === '目标过远，无法规划路径') {
    clearCurrentPath();
  }
  showToast(data.text, data.kind ?? 'system');
});
socket.onError(async (data) => {
  if (data.code === 'AUTH_FAIL') {
    const restored = await loginUI.restoreSession();
    if (restored) return;
    resetGameState();
    loginUI.show('登录已失效，请重新登录');
    return;
  }
  showToast(data.message);
});
socket.onKick(() => {
  resetGameState();
  loginUI.logout('账号已在其他位置登录');
});
socket.onConnectError((message) => {
  if (socket.connected) return;
  if (loginUI.hasRefreshToken()) {
    renderPingLatency(null, '重连');
    scheduleConnectionRecovery(300, true);
    return;
  }
/** showToast：显示当前视图。 */
  showToast(`连接失败: ${message}`);
});
socket.onDisconnect((reason) => {
  if (reason === 'io client disconnect') return;
  if (pendingRedeemCodesRequest) {
    const pending = pendingRedeemCodesRequest;
    pendingRedeemCodesRequest = null;
    window.clearTimeout(pending.timeoutId);
    pending.reject(new Error('连接已断开，兑换结果未返回'));
  }
  clearPendingSocketPing();
/** renderPingLatency：渲染当前界面内容。 */
  renderPingLatency(null, navigator.onLine ? '重连' : '断网');
  panelSystem.store.setRuntime({ connected: false });
  if (myPlayer) {
    showToast('连接已断开，正在尝试恢复');
  }

  scheduleConnectionRecovery(document.visibilityState === 'visible' ? 300 : 0);
});
socket.onPong((data) => {
  if (!pendingSocketPing || data.clientAt !== pendingSocketPing.clientAt) {
    return;
  }
  window.clearTimeout(pendingSocketPing.timeoutId);
  pendingSocketPing = null;
  const latencyMs = performance.now() - data.clientAt;
  if (latencyMs > 999 && hasRecentTickStall()) {
    renderPingLatency(null, '阻塞');
    return;
  }
  renderPingLatency(latencyMs);
});

let pathCells: { x: number; y: number }[] = [];
let pathTarget: { x: number; y: number } | null = null;

let myPlayer: PlayerState | null = null;
let currentTimeState: GameTimeState | null = null;
let latestAttrUpdate: S2C_AttrUpdate | null = null;
let latestTechniqueMap = new Map<string, TechniqueState>();
let latestActionMap = new Map<string, ActionDef>();
let latestEntities: ObservedEntity[] = [];
let latestEntityMap = new Map<string, ObservedEntity>();
let pendingLayoutViewportSync = false;
let pendingAutoInteraction: PendingAutoInteraction | null = null;

/** showToast：显示当前视图。 */
function showToast(message: string, kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' = 'system') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast-kind-${kind}`;
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.add('show');
  const durationMs = kind === 'quest' || kind === 'grudge' ? 4200 : 2500;
  window.setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, durationMs);
}

/** handleQqGroupLinkClick：处理输入事件。 */
async function handleQqGroupLinkClick(): Promise<void> {
  const copied = await copyTextToClipboard(QQ_GROUP_NUMBER);
  const qqScheme = resolveQqGroupLink();
  window.location.href = qqScheme;
  window.setTimeout(() => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    showToast(
      copied
        ? `已尝试唤起 QQ，加群失败时可直接粘贴群号 ${QQ_GROUP_NUMBER}`
        : `已尝试唤起 QQ，如未打开请手动搜索群号 ${QQ_GROUP_NUMBER}`,
    );
  }, 600);
}


function resolveQqGroupLink(): string {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return isMobile ? QQ_GROUP_MOBILE_DEEP_LINK : QQ_GROUP_DESKTOP_DEEP_LINK;
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

/** formatZoom：格式化输出字符串用于展示。 */
function formatZoom(zoom: number): string {
  return zoom.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** refreshZoomChrome：刷新缓存并触发重绘。 */
function refreshZoomChrome(zoom = getZoom()) {
  if (zoomSlider) {
    zoomSlider.value = zoom.toFixed(2);
  }
  if (zoomLevelEl) {
    let prefixEl = zoomLevelEl.children.item(0);
    if (!(prefixEl instanceof HTMLSpanElement)) {
      prefixEl = document.createElement('span');
      zoomLevelEl.prepend(prefixEl);
    }
    if (prefixEl.textContent !== 'x') {
      prefixEl.textContent = 'x';
    }
    let valueEl = zoomLevelEl.children.item(1);
    if (!(valueEl instanceof HTMLSpanElement)) {
      valueEl = document.createElement('span');
      zoomLevelEl.append(valueEl);
    }
    const zoomText = formatZoom(zoom);
    if (valueEl.textContent !== zoomText) {
      valueEl.textContent = zoomText;
    }
    while (zoomLevelEl.children.length > 2) {
      zoomLevelEl.lastElementChild?.remove();
    }
  }
}

/** refreshZoomViewport：刷新缓存并触发重绘。 */
function refreshZoomViewport() {
  resizeCanvas();
  mapRuntime.setZoom(getZoom());
}


function haveActionRenderStructureChanges(previousActions: ActionDef[], nextActions: ActionDef[]): boolean {
  if (previousActions.length !== nextActions.length) {
    return true;
  }
  for (let index = 0; index < previousActions.length; index += 1) {
    const previous = previousActions[index]!;
    const next = nextActions[index]!;
    if (
      previous.id !== next.id
      || previous.name !== next.name
      || previous.desc !== next.desc
      || previous.type !== next.type
      || previous.range !== next.range
      || previous.requiresTarget !== next.requiresTarget
      || previous.targetMode !== next.targetMode
      || previous.autoBattleEnabled !== next.autoBattleEnabled
      || previous.skillEnabled !== next.skillEnabled
    ) {
      return true;
    }
  }
  return false;
}


function haveTechniqueStructureChanges(
  previousTechniques: TechniqueState[],
  previousCultivatingTechId: string | undefined,
  nextTechniques: TechniqueState[],
  nextCultivatingTechId: string | undefined,
): boolean {
  if ((previousCultivatingTechId ?? null) !== (nextCultivatingTechId ?? null)) {
    return true;
  }
  if (previousTechniques.length !== nextTechniques.length) {
    return true;
  }
  for (let index = 0; index < previousTechniques.length; index += 1) {
    const previous = previousTechniques[index]!;
    const next = nextTechniques[index]!;
    if (
      previous.techId !== next.techId
      || previous.name !== next.name
      || previous.level !== next.level
      || previous.realmLv !== next.realmLv
      || previous.realm !== next.realm
      || previous.grade !== next.grade
    ) {
      return true;
    }
    if (previous.skills.length !== next.skills.length) {
      return true;
    }
    for (let skillIndex = 0; skillIndex < previous.skills.length; skillIndex += 1) {
      if (previous.skills[skillIndex]!.id !== next.skills[skillIndex]!.id) {
        return true;
      }
    }
    if (!isPlainEqual(previous.layers ?? null, next.layers ?? null)) {
      return true;
    }
    if (!isPlainEqual(previous.attrCurves ?? null, next.attrCurves ?? null)) {
      return true;
    }
  }
  return false;
}


function resolveMapDanger(): string {
  const fallback = myPlayer ? MAP_FALLBACK[myPlayer.mapId] : undefined;
  if (!myPlayer) {
    return '未知';
  }
  return assessMapDanger(myPlayer, mapRuntime.getMapMeta()?.recommendedRealm, fallback?.recommendedRealm).dangerLabel;
}


function resolveRealmLabel(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  const top = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!top) return '凡俗武者';
  const labels: Record<TechniqueRealm, string> = {
    [TechniqueRealm.Entry]: '武学入门',
    [TechniqueRealm.Minor]: '后天圆熟',
    [TechniqueRealm.Major]: '先天凝意',
    [TechniqueRealm.Perfection]: '半步修真',
  };
  return labels[top.realm] ?? '修行中';
}


function resolveTitleLabel(player: PlayerState): string {
  if (player.realm?.path === 'immortal') {
    return player.realm.shortName === '筑基' ? '云游真修' : '初登仙门';
  }
  const top = [...player.techniques].sort((a, b) => b.level - a.level)[0];
  if (!top) return '无名后学';
  if (top.realm >= TechniqueRealm.Perfection) return '名动一方';
  if (top.realm >= TechniqueRealm.Major) return '先天气成';
  if (top.realm >= TechniqueRealm.Minor) return '游历武者';
  return '见习弟子';
}

/** refreshUiChrome：刷新缓存并触发重绘。 */
function refreshUiChrome() {
  refreshHudChrome();
  if (!myPlayer) return;
  if (shouldPauseWorldPanelRefresh()) {
    return;
  }
  worldPanel.update({
    player: myPlayer,
    mapMeta: mapRuntime.getMapMeta(),
    entities: latestEntities,
    actions: myPlayer.actions,
    quests: myPlayer.quests,
  });
}

/** refreshHudChrome：刷新缓存并触发重绘。 */
function refreshHudChrome() {
  if (!myPlayer) return;
  const heavenGateAction = getHeavenGateHudAction(myPlayer);
  hud.update(myPlayer, {
    mapName: mapRuntime.getMapMeta()?.name ?? myPlayer.mapId,
    mapDanger: resolveMapDanger(),
    realmLabel: myPlayer.realm?.displayName ?? resolveRealmLabel(myPlayer),
    realmReviewLabel: myPlayer.realm?.review ?? myPlayer.realmReview,
    realmActionLabel: heavenGateAction?.label,
    showRealmAction: heavenGateAction?.visible,
    titleLabel: resolveTitleLabel(myPlayer),
  });
}

/** hasSelectionWithin：判断并返回条件结果。 */
function hasSelectionWithin(root: HTMLElement | null): boolean {
  if (!root) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
}


function shouldPauseWorldPanelRefresh(): boolean {
  return hasSelectionWithin(document.getElementById('layout-center'));
}

function getInfoRadius(): number {
  const baseViewRange = Math.max(1, Math.round(myPlayer?.viewRange ?? VIEW_RADIUS));
  if (currentTimeState) {
    return Math.max(1, Math.ceil(baseViewRange * currentTimeState.visionMultiplier));
  }
  return baseViewRange;
}


function scheduleLayoutViewportSync(): void {
  if (pendingLayoutViewportSync) {
    return;
  }
  pendingLayoutViewportSync = true;
  requestAnimationFrame(() => {
    pendingLayoutViewportSync = false;
    resizeCanvas();
  });
}

/** clearCurrentPath：清理并清空临时数据。 */
function clearCurrentPath() {
  pathCells = [];
  pathTarget = null;
  pendingAutoInteraction = null;
  mapRuntime.setPathCells(pathCells);
}

/** sendMoveCommand：发送数据请求。 */
function sendMoveCommand(dir: Direction) {
  if (!myPlayer) return;
  clearCurrentPath();
  myPlayer.facing = dir;
  socket.sendMove(dir);
}

/** planPathTo：初始化地图运行数据。 */
function planPathTo(
  target: { x: number; y: number },
  options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean },
) {
  if (!myPlayer) return;
  if (!options?.preserveAutoInteraction) {
    pendingAutoInteraction = null;
  }
  pathTarget = target;
  const preview = buildClientPreviewPath(myPlayer.x, myPlayer.y, target.x, target.y);
  pathCells = preview?.cells ?? [{ x: target.x, y: target.y }];
  mapRuntime.setPathCells(pathCells);
  socket.sendMoveTo(target.x, target.y, {
    ...options,
    packedPath: preview ? packDirections(preview.directions) : undefined,
    packedPathSteps: preview?.directions.length,
    pathStartX: preview ? myPlayer.x : undefined,
    pathStartY: preview ? myPlayer.y : undefined,
  });
}

/** isCellInsideCurrentMap：判断并返回条件结果。 */
function isCellInsideCurrentMap(x: number, y: number): boolean {
  const mapMeta = mapRuntime.getMapMeta();
  return Boolean(mapMeta && x >= 0 && x < mapMeta.width && y >= 0 && y < mapMeta.height);
}

/** isCellAvailableForAutoApproach：判断并返回条件结果。 */
function isCellAvailableForAutoApproach(x: number, y: number): boolean {
  if (!myPlayer || !isCellInsideCurrentMap(x, y)) {
    return false;
  }
  const mapMeta = mapRuntime.getMapMeta();
  const tile = getKnownTileAt(x, y);
  if (!tile?.walkable) {
    return false;
  }
  return !isVisibleBlockingEntityAt(x, y, { allowSelf: true, mapMeta });
}

/** findObservedEntityAt：从集合中查找目标。 */
function findObservedEntityAt(x: number, y: number, kind?: string): ObservedEntity | null {
  const entity = latestEntities.find((entry) => (
    entry.wx === x
    && entry.wy === y
    && (kind ? entry.kind === kind : true)
  ));
  return entity ?? null;
}

/** isPathPreviewBlockingEntity：判断并返回条件结果。 */
function isPathPreviewBlockingEntity(entity: ObservedEntity): boolean {
  return entity.kind === 'player' || entity.kind === 'monster' || entity.kind === 'npc';
}


function createPlayerOverlapPointKeySet(mapMeta: MapMeta | null): ReadonlySet<string> {
  return new Set((mapMeta?.playerOverlapPoints ?? []).map((point) => `${point.x},${point.y}`));
}

/** isVisibleBlockingEntityAt：判断并返回条件结果。 */
function isVisibleBlockingEntityAt(
  x: number,
  y: number,
  options?: { allowSelf?: boolean; mapMeta?: MapMeta | null; playerOverlapPointKeys?: ReadonlySet<string> },
): boolean {
  const overlapPointKeys = options?.playerOverlapPointKeys
    ?? createPlayerOverlapPointKeySet(options?.mapMeta ?? mapRuntime.getMapMeta());
  const supportsPlayerOverlap = overlapPointKeys.has(`${x},${y}`);
  return latestEntities.some((entity) => {
    if (entity.wx !== x || entity.wy !== y || !isPathPreviewBlockingEntity(entity)) {
      return false;
    }
    if (options?.allowSelf && entity.kind === 'player' && entity.id === myPlayer?.id) {
      return false;
    }
    if (entity.kind === 'player' && supportsPlayerOverlap) {
      return false;
    }
    return true;
  });
}


function resolveNpcApproachTarget(npc: ObservedEntity): { x: number; y: number } | null {
  if (!myPlayer) {
    return null;
  }

  let bestCandidate: { x: number; y: number; pathLength: number; distance: number } | null = null;

  for (const step of AUTO_INTERACTION_APPROACH_STEPS) {
    const candidateX = npc.wx + step.dx;
    const candidateY = npc.wy + step.dy;
    if (!isCellAvailableForAutoApproach(candidateX, candidateY)) {
      continue;
    }

    const previewPath = buildClientPreviewPath(myPlayer.x, myPlayer.y, candidateX, candidateY);
    if (!previewPath && (myPlayer.x !== candidateX || myPlayer.y !== candidateY)) {
      continue;
    }

    const pathLength = previewPath?.cells.length ?? 0;
    const distance = gridDistance({ x: myPlayer.x, y: myPlayer.y }, { x: candidateX, y: candidateY });
    if (
      !bestCandidate
      || pathLength < bestCandidate.pathLength
      || (pathLength === bestCandidate.pathLength && distance < bestCandidate.distance)
    ) {
      bestCandidate = {
        x: candidateX,
        y: candidateY,
        pathLength,
        distance,
      };
    }
  }

  return bestCandidate ? { x: bestCandidate.x, y: bestCandidate.y } : null;
}


function triggerAutoInteractionIfReady(): boolean {
  if (!myPlayer || !pendingAutoInteraction || pendingAutoInteraction.mapId !== myPlayer.mapId) {
    pendingAutoInteraction = null;
    return false;
  }

  if (pendingAutoInteraction.kind === 'portal') {
    if (myPlayer.x !== pendingAutoInteraction.x || myPlayer.y !== pendingAutoInteraction.y) {
      return false;
    }
    const actionId = pendingAutoInteraction.actionId;
    clearCurrentPath();
    socket.sendAction(actionId);
    return true;
  }

  const npc = latestEntityMap.get(pendingAutoInteraction.actionId)
    ?? findObservedEntityAt(pendingAutoInteraction.x, pendingAutoInteraction.y, 'npc');
  if (!npc || npc.kind !== 'npc') {
    pendingAutoInteraction = null;
    return false;
  }
  if (!isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: npc.wx, y: npc.wy }, 1)) {
    return false;
  }
  clearCurrentPath();
  socket.sendAction(pendingAutoInteraction.actionId);
  return true;
}

/** handleNpcClickTarget：处理输入事件。 */
function handleNpcClickTarget(npc: ObservedEntity): boolean {
  if (!myPlayer) {
    return false;
  }
  if (npc.kind !== 'npc') {
    return false;
  }

  if (isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: npc.wx, y: npc.wy }, 1)) {
    clearCurrentPath();
    if ((myPlayer.actions ?? []).some((action) => action.id === npc.id)) {
      socket.sendAction(npc.id);
      return true;
    }
    pendingAutoInteraction = {
      kind: 'npc',
      mapId: myPlayer.mapId,
      x: npc.wx,
      y: npc.wy,
      actionId: npc.id,
    };
    return true;
  }

  const approachTarget = resolveNpcApproachTarget(npc);
  if (!approachTarget) {
    showToast('找不到能靠近该 NPC 的位置');
    return true;
  }

  pendingAutoInteraction = {
    kind: 'npc',
    mapId: myPlayer.mapId,
    x: npc.wx,
    y: npc.wy,
    actionId: npc.id,
  };
/** planPathTo：初始化地图运行数据。 */
  planPathTo(approachTarget, { allowNearestReachable: true, preserveAutoInteraction: true });
  return true;
}

/** handlePortalClickTarget：处理输入事件。 */
function handlePortalClickTarget(target: { x: number; y: number }, tile: Tile): boolean {
  if (!myPlayer || (tile.type !== TileType.Portal && tile.type !== TileType.Stairs)) {
    return false;
  }

  if (myPlayer.x === target.x && myPlayer.y === target.y) {
    pathCells = [];
    pathTarget = null;
    pendingAutoInteraction = {
      kind: 'portal',
      mapId: myPlayer.mapId,
      x: target.x,
      y: target.y,
      actionId: 'portal:travel',
    };
    mapRuntime.setPathCells(pathCells);
    return true;
  }

  pendingAutoInteraction = {
    kind: 'portal',
    mapId: myPlayer.mapId,
    x: target.x,
    y: target.y,
    actionId: 'portal:travel',
  };
/** planPathTo：初始化地图运行数据。 */
  planPathTo({ x: target.x, y: target.y }, { preserveAutoInteraction: true });
  return true;
}

function buildClientPreviewPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): { cells: { x: number; y: number }[]; directions: Direction[] } | null {
  const mapMeta = mapRuntime.getMapMeta();
  if (!mapMeta) {
    return null;
  }

  if (
    startX < 0 || startY < 0 || targetX < 0 || targetY < 0
    || startX >= mapMeta.width || targetX >= mapMeta.width
    || startY >= mapMeta.height || targetY >= mapMeta.height
  ) {
    return null;
  }
  const playerOverlapPointKeys = createPlayerOverlapPointKeySet(mapMeta);

  const visibleBlockingPositions = new Set(
    latestEntities
      .filter((entity) => isPathPreviewBlockingEntity(entity) && !(entity.kind === 'player' && entity.id === myPlayer?.id))
      .filter((entity) => entity.kind !== 'player' || !playerOverlapPointKeys.has(`${entity.wx},${entity.wy}`))
      .map((entity) => `${entity.wx},${entity.wy}`),
  );

  const tiles: Tile[][] = [];
  for (let y = 0; y < mapMeta.height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapMeta.width; x++) {
      const tile = getKnownTileAt(x, y);
      const baseTile = tile ?? ({
        type: TileType.Wall,
        walkable: false,
      } as Tile);
      const occupiedByVisibleEntity = visibleBlockingPositions.has(`${x},${y}`);
      row.push(occupiedByVisibleEntity
        ? {
            ...baseTile,
            walkable: false,
            occupiedBy: 'visible_entity',
          }
        : baseTile);
    }
    tiles.push(row);
  }

  const previewDirections = findPath(tiles, startX, startY, targetX, targetY);
  if (!previewDirections) {
    return null;
  }

  const previewCells: { x: number; y: number }[] = [];
  let currentX = startX;
  let currentY = startY;
  for (const direction of previewDirections) {
    const [dx, dy] = directionToDelta(direction);
    currentX += dx;
    currentY += dy;
    previewCells.push({ x: currentX, y: currentY });
  }
  return {
    cells: previewCells,
    directions: previewDirections,
  };
}

/** resetGameState：重置为初始状态。 */
function resetGameState() {
  myPlayer = null;
  currentTimeTickIntervalMs = 1000;
  syncEstimatedServerTick(null);
  syncCurrentTimeState(null);
  latestAttrUpdate = null;
  clearCurrentPath();
  latestTechniqueMap.clear();
  latestActionMap.clear();
  latestEntities = [];
  latestEntityMap.clear();
  pendingTargetedAction = null;
  hoveredMapTile = null;
  hideObserveModal();
  syncTargetingOverlay();
  sidePanel.hide();
  chatUI.hide();
  chatUI.setPersistenceScope(null);
  debugPanel.hide();
  attrPanel.clear();
  inventoryPanel.clear();
  equipmentPanel.clear();
  techniquePanel.clear();
  questPanel.clear();
  marketPanel.clear();
  actionPanel.clear();
  npcShopModal.clear();
  alchemyModal.clear();
  enhancementModal.clear();
  lootPanel.clear();
  worldPanel.clear();
  mailPanel.clear();
  mapRuntime.reset();
  panelSystem.store.setRuntime({
    connected: false,
    playerId: null,
    mapId: null,
    shellVisible: false,
  });
  resizeCanvas();
  document.getElementById('hud')?.classList.add('hidden');
}


function applyLocalDisplayName(displayName: string) {
  if (!myPlayer) {
    return;
  }
  myPlayer.displayName = displayName;
  latestEntities = latestEntities.map((entity) => {
    if (entity.id !== myPlayer?.id) {
      return entity;
    }
    return {
      ...entity,
      char: getFirstGrapheme(displayName) || entity.char,
    };
  });
  mapRuntime.replaceVisibleEntities(latestEntities);
  refreshHudChrome();
}


function applyLocalRoleName(roleName: string) {
  if (!myPlayer) {
    return;
  }
  myPlayer.name = roleName;
  latestEntities = latestEntities.map((entity) => {
    if (entity.id !== myPlayer?.id) {
      return entity;
    }
    return {
      ...entity,
      name: roleName,
    };
  });
  mapRuntime.replaceVisibleEntities(latestEntities);
  refreshHudChrome();
}

// 键盘输入
const keyboard = new KeyboardInput((dirs: Direction[]) => {
  clearCurrentPath();
  if (dirs.length > 0) {
    sendMoveCommand(dirs[0]);
  }
});

sidePanel.setVisibilityChangeCallback((visible) => {
  panelSystem.store.setRuntime({ shellVisible: visible });
  if (visible) {
    scheduleLayoutViewportSync();
  }
});
sidePanel.setLayoutChangeCallback(() => {
  if (!sidePanel.isVisible()) {
    return;
  }
  scheduleLayoutViewportSync();
});
/** syncChatLogbookVisibility：同步外部状态到本地。 */
function syncChatLogbookVisibility(): void {
  const logbookPane = document.querySelector<HTMLElement>('.split-tab-pane[data-pane="logbook"]');
  chatUI.setLogbookVisible(logbookPane?.classList.contains('active') === true);
}
sidePanel.setTabChangeCallback((tabName) => {
  syncChatLogbookVisibility();
  if (tabName === 'market') {
    socket.sendRequestMarket();
  }
});
syncChatLogbookVisibility();


function resizeCanvas() {
  const cssWidth = Math.max(1, canvasHost.clientWidth);
  const cssHeight = Math.max(1, canvasHost.clientHeight);
  const rect = canvasHost.getBoundingClientRect();
  const viewportScale = cssWidth > 0 && rect.width > 0
    ? rect.width / cssWidth
    : 1;
  mapRuntime.setViewportSize(cssWidth, cssHeight, window.devicePixelRatio || 1, viewportScale);
}
resizeCanvas();
refreshZoomChrome();
window.addEventListener('resize', resizeCanvas);
window.addEventListener(RESPONSIVE_VIEWPORT_CHANGE_EVENT, resizeCanvas as EventListener);
window.addEventListener('focus', () => {
  scheduleConnectionRecovery(150);
  restartPingLoop();
});
window.addEventListener('pageshow', () => {
  scheduleConnectionRecovery(150);
  restartPingLoop();
});
window.addEventListener('online', () => {
  scheduleConnectionRecovery(150);
  restartPingLoop();
});
window.addEventListener('offline', () => {
  clearPendingSocketPing();
  renderPingLatency(null, '断网');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopPingLoop();
    return;
  }
  scheduleConnectionRecovery(150);
  restartPingLoop();
});
window.addEventListener('contextmenu', (event) => {
  if (pendingTargetedAction) {
    event.preventDefault();
    cancelTargeting(true);
    return;
  }
  event.preventDefault();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !(observeModalEl?.classList.contains('hidden') ?? true)) {
    hideObserveModal();
    return;
  }
  if (event.key === 'Escape' && pendingTargetedAction) {
    cancelTargeting(true);
  }
});

observeModalEl?.addEventListener('click', () => {
  hideObserveModal();
});
observeModalShellEl?.addEventListener('click', (event) => {
  event.stopPropagation();
});

mapRuntime.setInteractionCallbacks({
  onTarget: (target) => {
    const clickedMonster = findObservedEntityAt(target.x, target.y, 'monster');
    const clickedNpc = findObservedEntityAt(target.x, target.y, 'npc');
    if (pendingTargetedAction) {
      pendingTargetedAction.range = resolveCurrentTargetingRange(pendingTargetedAction);
      if (pendingTargetedAction.actionId !== 'client:observe' && !isPointInsideCurrentMap(target.x, target.y)) {
        showToast('窗外投影当前仅支持观察');
        return;
      }
      if (pendingTargetedAction.actionId === 'client:observe') {
        if (!getVisibleTileAt(target.x, target.y)) {
          showToast('只能观察当前视野内的格子');
          return;
        }
        showObserveModal(target.x, target.y);
        cancelTargeting();
        return;
      }
      if (pendingTargetedAction.actionId === 'client:take') {
        if (!myPlayer || !isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          showToast(`超出拿取范围，最多 ${pendingTargetedAction.range} 格`);
          return;
        }
        socket.sendAction('loot:open', encodeTileTargetRef({ x: target.x, y: target.y }));
        cancelTargeting();
        return;
      }
      const geometry = getEffectiveTargetingGeometry(pendingTargetedAction);
      if (!myPlayer || !isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: target.x, y: target.y }, geometry.range)) {
        showToast(`超出施法范围，最多 ${geometry.range} 格`);
        return;
      }
      if (!hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
        showToast('该位置范围内没有可命中的目标或可受影响的地块');
        return;
      }
      const targetRef = resolveTargetRefForAction(pendingTargetedAction, target);
      if (!targetRef) {
        showToast('该技能需要选中有效目标');
        return;
      }
      socket.sendAction(pendingTargetedAction.actionId, targetRef);
      cancelTargeting();
      return;
    }
    if (!isPointInsideCurrentMap(target.x, target.y)) {
      showToast('窗外投影当前仅支持观察');
      return;
    }
    if (clickedMonster) {
      clearCurrentPath();
      socket.sendAction('battle:engage', clickedMonster.id);
      return;
    }
    if (!isWithinDisplayedMemoryBounds(target.x, target.y)) {
      showToast('只能点击当前显示区域内的格子');
      return;
    }
    const knownTile = getKnownTileAt(target.x, target.y);
    if (!knownTile) {
      showToast('完全未知的黑色区域无法点击移动');
      return;
    }
    if (clickedNpc && handleNpcClickTarget(clickedNpc)) {
      return;
    }
    if (handlePortalClickTarget(target, knownTile)) {
      return;
    }
    if (!knownTile.walkable) {
      showToast('无法到达该位置');
      return;
    }
    planPathTo(target);
  },
  onHover: (target) => {
    hoveredMapTile = target && typeof target.clientX === 'number' && typeof target.clientY === 'number'
      ? {
          x: target.x,
          y: target.y,
          clientX: target.clientX,
          clientY: target.clientY,
        }
      : null;
    if (pendingTargetedAction) {
      pendingTargetedAction.hoverX = target?.x;
      pendingTargetedAction.hoverY = target?.y;
      syncTargetingOverlay();
      return;
    }
    syncSenseQiOverlay();
  },
});

// 初始化
socket.onInit((data: S2C_Init) => {
  pendingTargetedAction = null;
  hoveredMapTile = null;
  hideObserveModal();
  syncAuraLevelBaseValue(data.auraLevelBaseValue);
  myPlayer = data.self;
  myPlayer.techniques = resolvePreviewTechniques(myPlayer.techniques);
  syncCurrentTimeState(data.time ?? null);
  latestAttrUpdate = buildAttrStateFromPlayer(myPlayer);
  myPlayer.senseQiActive = myPlayer.senseQiActive === true;
  myPlayer.autoBattleStationary = myPlayer.autoBattleStationary === true;
  myPlayer.combatTargetingRules = myPlayer.combatTargetingRules ?? { hostile: ['monster', 'retaliators', 'terrain'], friendly: ['non_hostile_players'] };
  myPlayer.autoBattleTargetingMode = myPlayer.autoBattleTargetingMode ?? 'auto';
  myPlayer.allowAoePlayerHit = myPlayer.allowAoePlayerHit === true;
  myPlayer.autoIdleCultivation = myPlayer.autoIdleCultivation !== false;
  myPlayer.autoSwitchCultivation = myPlayer.autoSwitchCultivation === true;
  myPlayer.cultivationActive = myPlayer.cultivationActive === true;
  syncTargetingOverlay();
  mapRuntime.applyInit(data);
  syncSenseQiOverlay();

  const entities = getLatestObservedEntitiesSnapshot() as ObservedEntity[];
  latestTechniqueMap = new Map((myPlayer.techniques ?? []).map((technique) => [technique.techId, cloneJson(technique)]));
  latestActionMap = new Map((myPlayer.actions ?? []).map((action) => [action.id, cloneJson(action)]));
  latestEntities = entities;
  latestEntityMap = new Map(entities.map((entity) => [entity.id, entity]));

  clearCurrentPath();
  mapRuntime.setPathCells(pathCells);

  // 显示主界面布局并初始化各子面板
  sidePanel.show();
  chatUI.setPersistenceScope(myPlayer.id);
  chatUI.show();
  document.getElementById('hud')?.classList.remove('hidden');
  resizeCanvas();
  refreshZoomChrome();
  panelSystem.store.setRuntime({
    connected: true,
    playerId: myPlayer.id,
    mapId: myPlayer.mapId,
    shellVisible: true,
  });
  attrPanel.initFromPlayer(myPlayer);
  inventoryPanel.initFromPlayer(myPlayer);
  marketPanel.initFromPlayer(myPlayer);
  equipmentPanel.initFromPlayer(myPlayer);
  techniquePanel.initFromPlayer(myPlayer);
  bodyTrainingPanel.initFromPlayer(myPlayer);
  questPanel.initFromPlayer(myPlayer);
  npcShopModal.initFromPlayer(myPlayer);
  alchemyModal.initFromPlayer(myPlayer);
  enhancementModal.initFromPlayer(myPlayer);
  actionPanel.initFromPlayer(myPlayer);
  refreshUiChrome();
  mailPanel.setPlayerId(myPlayer.id);
  suggestionPanel.setPlayerId(myPlayer.id);
});

// 建议更新
socket.onSuggestionUpdate((data) => {
  suggestionPanel.updateSuggestions(data.suggestions);
});

socket.onMailSummary((data) => {
  mailPanel.updateSummary(data.summary);
});

socket.onMailPage((data) => {
  mailPanel.updatePage(data.page);
});

socket.onMailDetail((data) => {
  mailPanel.updateDetail(data.detail, data.error);
});

socket.onRedeemCodesResult((data: S2C_RedeemCodesResult) => {
  if (!pendingRedeemCodesRequest) {
    return;
  }
  const pending = pendingRedeemCodesRequest;
  pendingRedeemCodesRequest = null;
  clearTimeout(pending.timeoutId);
  pending.resolve(data.result);
});

socket.onMailOpResult((data) => {
  mailPanel.handleOpResult(data);
});

socket.onMarketListings((data) => {
  marketPanel.updateListings(data);
});
socket.onMarketOrders((data) => {
  marketPanel.updateOrders(data);
});
socket.onMarketStorage((data) => {
  if (myPlayer) {
    myPlayer.marketStorage = {
      items: data.items.map((item) => ({
        ...item.item,
        count: item.count,
      })),
    };
  }
  marketPanel.updateStorage(data);
});

socket.onMarketItemBook((data) => {
  marketPanel.updateItemBook(data);
});
socket.onMarketTradeHistory((data) => {
  marketPanel.updateTradeHistory(data);
});
socket.onNpcShop((data) => {
  npcShopModal.updateShop(hydrateNpcShopResponse(data));
});
socket.onAlchemyPanel((data) => {
  alchemyModal.updatePanel(data);
});
socket.onEnhancementPanel((data) => {
  enhancementModal.updatePanel(data);
});

// Tick 更新
socket.onTick((data: S2C_Tick) => {
  if (!myPlayer) return;
  let mapChanged = false;
  const previousMapId = myPlayer.mapId;
  syncAuraLevelBaseValue(data.auraLevelBaseValue);
  syncCurrentTimeTickInterval(data.dt);
  if (data.time) {
    syncCurrentTimeState(data.time);
  }

  if (data.dt) {
    if (tickRateEl) {
      const seconds = Math.max(data.dt, 0) / 1000;
      renderTickRate(seconds);
    }
  }
  mapRuntime.applyTick(data);

  if (data.m) {
    mapChanged = previousMapId !== data.m;
    if (mapChanged) {
      clearCurrentPath();
      latestEntities = [];
      latestEntityMap.clear();
      hoveredMapTile = null;
      hideObserveModal();
      lootPanel.clear();
      cancelTargeting();
    }
    myPlayer.mapId = data.m;
    panelSystem.store.setRuntime({ mapId: myPlayer.mapId });
    questPanel.setCurrentMapId(myPlayer.mapId);
  }

  if (typeof data.hp === 'number') {
    myPlayer.hp = data.hp;
  }
  if (typeof data.qi === 'number') {
    myPlayer.qi = data.qi;
  }
  if (data.f !== undefined) {
    myPlayer.facing = data.f;
  }

  const oldX = myPlayer.x;
  const oldY = myPlayer.y;

  for (const entity of data.p) {
    if (entity.id === myPlayer.id) {
      if (entity.name) {
        myPlayer.name = entity.name;
      }
      myPlayer.x = entity.x;
      myPlayer.y = entity.y;
      break;
    }
  }
  if (data.v || data.t || data.auraLevelBaseValue !== undefined) {
    syncSenseQiOverlay();
  }

  const moved = !mapChanged && (myPlayer.x !== oldX || myPlayer.y !== oldY);

  const entities = getLatestObservedEntitiesSnapshot() as ObservedEntity[];
  latestEntities = entities;
  latestEntityMap = new Map(entities.map((entity) => [entity.id, entity]));
  syncTargetingOverlay();
  refreshHudChrome();

  const autoInteractionTriggered = triggerAutoInteractionIfReady();
  if (!autoInteractionTriggered && pathTarget && myPlayer.x === pathTarget.x && myPlayer.y === pathTarget.y) {
    clearCurrentPath();
  }
  if (autoInteractionTriggered) {
    pathCells = [];
  } else if (data.path) {
    pathCells = data.path.map(([x, y]) => ({ x, y }));
    if (pathCells.length === 0 && pathTarget) {
      clearCurrentPath();
    }
  }
  mapRuntime.setPathCells(pathCells);
});

restartPingLoop();
void loginUI.restoreSession();
