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
  buildDefaultCombatTargetingRules,
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
  hasCombatTargetingRule,
  isPlainEqual,
  normalizeCombatTargetingRules,
} from '@mud/shared';

/** canvasHost：定义该变量以承载业务值。 */
const canvasHost = document.getElementById('game-stage') as HTMLElement;
/** zoomSlider：定义该变量以承载业务值。 */
const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement | null;
/** zoomLevelEl：定义该变量以承载业务值。 */
const zoomLevelEl = document.getElementById('zoom-level');
/** zoomResetBtn：定义该变量以承载业务值。 */
const zoomResetBtn = document.getElementById('zoom-reset') as HTMLButtonElement | null;
/** tickRateEl：定义该变量以承载业务值。 */
const tickRateEl = document.getElementById('map-tick-rate');

scheduleDeferredLocalContentPreload();
/** currentTimeEl：定义该变量以承载业务值。 */
const currentTimeEl = document.getElementById('map-current-time');
/** currentTimeValueEl：定义该变量以承载业务值。 */
const currentTimeValueEl = document.getElementById('map-current-time-value');
/** currentTimePhaseEl：定义该变量以承载业务值。 */
const currentTimePhaseEl = document.getElementById('map-current-time-phase');
/** currentTimeHourAEl：定义该变量以承载业务值。 */
const currentTimeHourAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-a"]');
/** currentTimeHourBEl：定义该变量以承载业务值。 */
const currentTimeHourBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-b"]');
/** currentTimeDotEl：定义该变量以承载业务值。 */
const currentTimeDotEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="dot"]');
/** currentTimeMinAEl：定义该变量以承载业务值。 */
const currentTimeMinAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-a"]');
/** currentTimeMinBEl：定义该变量以承载业务值。 */
const currentTimeMinBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-b"]');
/** tickRateValueEl：定义该变量以承载业务值。 */
const tickRateValueEl = document.getElementById('map-tick-rate-value');
/** tickRateIntEl：定义该变量以承载业务值。 */
const tickRateIntEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="int"]');
/** tickRateDotEl：定义该变量以承载业务值。 */
const tickRateDotEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="dot"]');
/** tickRateFracAEl：定义该变量以承载业务值。 */
const tickRateFracAEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-a"]');
/** tickRateFracBEl：定义该变量以承载业务值。 */
const tickRateFracBEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-b"]');
/** fpsRateEl：定义该变量以承载业务值。 */
const fpsRateEl = document.getElementById('map-fps-rate');
/** fpsValueEl：定义该变量以承载业务值。 */
const fpsValueEl = document.getElementById('map-fps-value');
/** fpsLowValueEl：定义该变量以承载业务值。 */
const fpsLowValueEl = document.getElementById('map-fps-low-value');
/** fpsOnePercentValueEl：定义该变量以承载业务值。 */
const fpsOnePercentValueEl = document.getElementById('map-fps-one-percent-value');
/** pingLatencyEl：定义该变量以承载业务值。 */
const pingLatencyEl = document.getElementById('map-ping-rate');
/** pingValueEl：定义该变量以承载业务值。 */
const pingValueEl = document.getElementById('map-ping-value');
/** pingUnitEl：定义该变量以承载业务值。 */
const pingUnitEl = document.getElementById('map-ping-unit');
/** pingHundredsEl：定义该变量以承载业务值。 */
const pingHundredsEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="hundreds"]');
/** pingTensEl：定义该变量以承载业务值。 */
const pingTensEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="tens"]');
/** pingOnesEl：定义该变量以承载业务值。 */
const pingOnesEl = pingValueEl?.querySelector<HTMLElement>('[data-ping-part="ones"]');
/** joinQqGroupBtns：定义该变量以承载业务值。 */
const joinQqGroupBtns = document.querySelectorAll<HTMLAnchorElement>('[data-qq-group-link="true"]');

/** QQ_GROUP_NUMBER：定义该变量以承载业务值。 */
const QQ_GROUP_NUMBER = '940886387';
const QQ_GROUP_MOBILE_DEEP_LINK = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
const QQ_GROUP_DESKTOP_DEEP_LINK = `tencent://AddContact/?fromId=45&fromSubId=1&subcmd=all&uin=${QQ_GROUP_NUMBER}`;

/** auraLevelBaseValue：定义该变量以承载业务值。 */
let auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE;
/** pendingQuestNavigateId：定义该变量以承载业务值。 */
let pendingQuestNavigateId: string | null = null;
/** pendingRedeemCodesRequest：定义该变量以承载业务值。 */
let pendingRedeemCodesRequest:
  | {
      resolve: (value: AccountRedeemCodesRes) => void;
      reject: (reason?: unknown) => void;
/** timeoutId：定义该变量以承载业务值。 */
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;
/** activeObservedTile：定义该变量以承载业务值。 */
let activeObservedTile:
  | {
/** mapId：定义该变量以承载业务值。 */
      mapId: string;
/** x：定义该变量以承载业务值。 */
      x: number;
/** y：定义该变量以承载业务值。 */
      y: number;
    }
  | null = null;
/** activeObservedTileDetail：定义该变量以承载业务值。 */
let activeObservedTileDetail: S2C_TileRuntimeDetail | null = null;

/** connectionRecoveryTimer：定义该变量以承载业务值。 */
let connectionRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
/** connectionRecoveryPromise：定义该变量以承载业务值。 */
let connectionRecoveryPromise: Promise<void> | null = null;
/** pingTimer：定义该变量以承载业务值。 */
let pingTimer: ReturnType<typeof setTimeout> | null = null;
/** pingRequestSerial：定义该变量以承载业务值。 */
let pingRequestSerial = 0;
/** pendingSocketPing：定义该变量以承载业务值。 */
let pendingSocketPing:
  | {
/** serial：定义该变量以承载业务值。 */
      serial: number;
/** clientAt：定义该变量以承载业务值。 */
      clientAt: number;
/** timeoutId：定义该变量以承载业务值。 */
      timeoutId: ReturnType<typeof setTimeout>;
    }
  | null = null;
/** currentTimeStateSyncedAt：定义该变量以承载业务值。 */
let currentTimeStateSyncedAt = performance.now();
/** currentTimeTickIntervalMs：定义该变量以承载业务值。 */
let currentTimeTickIntervalMs = 1000;
/** currentTimeTickIntervalUpdatedAt：定义该变量以承载业务值。 */
let currentTimeTickIntervalUpdatedAt = performance.now();
/** fpsMonitorEnabled：定义该变量以承载业务值。 */
let fpsMonitorEnabled = false;
/** fpsSampleFrameCount：定义该变量以承载业务值。 */
let fpsSampleFrameCount = 0;
/** fpsSampleStartedAt：定义该变量以承载业务值。 */
let fpsSampleStartedAt = performance.now();
/** fpsLastFrameAt：定义该变量以承载业务值。 */
let fpsLastFrameAt = 0;
/** fpsFrameDurations：定义该变量以承载业务值。 */
let fpsFrameDurations: number[] = [];
/** fpsFrameDurationWriteIndex：定义该变量以承载业务值。 */
let fpsFrameDurationWriteIndex = 0;

/** PING_BLOCKED_TICK_INTERVAL_MS：定义该变量以承载业务值。 */
const PING_BLOCKED_TICK_INTERVAL_MS = 1_500;
/** PING_BLOCKED_TICK_GRACE_MS：定义该变量以承载业务值。 */
const PING_BLOCKED_TICK_GRACE_MS = 8_000;

/** FpsSampleStats：定义该类型的结构与数据语义。 */
type FpsSampleStats = {
/** fps：定义该变量以承载业务值。 */
  fps: number | null;
/** low：定义该变量以承载业务值。 */
  low: number | null;
/** onePercentLow：定义该变量以承载业务值。 */
  onePercentLow: number | null;
};

/** formatFpsMetric：执行对应的业务逻辑。 */
function formatFpsMetric(value: number | null): string {
  if (value === null) {
    return '---';
  }
  return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, '0');
}

/** renderFpsStats：执行对应的业务逻辑。 */
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

/** resetFpsMonitorSamples：执行对应的业务逻辑。 */
function resetFpsMonitorSamples(now = performance.now()): void {
  fpsSampleFrameCount = 0;
  fpsSampleStartedAt = now;
  fpsLastFrameAt = 0;
  fpsFrameDurations = [];
  fpsFrameDurationWriteIndex = 0;
}

/** appendFpsFrameDuration：执行对应的业务逻辑。 */
function appendFpsFrameDuration(frameDurationMs: number): void {
/** safeDuration：定义该变量以承载业务值。 */
  const safeDuration = Math.max(1, frameDurationMs);
  if (fpsFrameDurations.length < MAP_FPS_SAMPLE_WINDOW_SIZE) {
    fpsFrameDurations.push(safeDuration);
    fpsFrameDurationWriteIndex = fpsFrameDurations.length % MAP_FPS_SAMPLE_WINDOW_SIZE;
    return;
  }
  fpsFrameDurations[fpsFrameDurationWriteIndex] = safeDuration;
  fpsFrameDurationWriteIndex = (fpsFrameDurationWriteIndex + 1) % MAP_FPS_SAMPLE_WINDOW_SIZE;
}

/** resolveFpsLowStats：执行对应的业务逻辑。 */
function resolveFpsLowStats(): Pick<FpsSampleStats, 'low' | 'onePercentLow'> {
  if (fpsFrameDurations.length === 0) {
    return {
      low: null,
      onePercentLow: null,
    };
  }
/** sortedDurations：定义该变量以承载业务值。 */
  const sortedDurations = [...fpsFrameDurations].sort((left, right) => right - left);
/** slowestDuration：定义该变量以承载业务值。 */
  const slowestDuration = sortedDurations[0] ?? null;
/** onePercentCount：定义该变量以承载业务值。 */
  const onePercentCount = Math.max(1, Math.ceil(sortedDurations.length * 0.01));
/** onePercentTotalDuration：定义该变量以承载业务值。 */
  let onePercentTotalDuration = 0;
  for (let index = 0; index < onePercentCount; index += 1) {
    onePercentTotalDuration += sortedDurations[index] ?? 0;
  }
  return {
/** low：定义该变量以承载业务值。 */
    low: slowestDuration === null ? null : 1000 / slowestDuration,
    onePercentLow: onePercentTotalDuration > 0 ? 1000 / (onePercentTotalDuration / onePercentCount) : null,
  };
}

/** recordFpsMonitorFrame：执行对应的业务逻辑。 */
function recordFpsMonitorFrame(now: number): void {
  if (!fpsMonitorEnabled) {
    return;
  }

  if (fpsLastFrameAt > 0) {
/** frameDuration：定义该变量以承载业务值。 */
    const frameDuration = now - fpsLastFrameAt;
    if (frameDuration <= 1000) {
      appendFpsFrameDuration(frameDuration);
    } else {
      resetFpsMonitorSamples(now);
    }
  }
  fpsLastFrameAt = now;
  fpsSampleFrameCount += 1;

/** elapsed：定义该变量以承载业务值。 */
  const elapsed = now - fpsSampleStartedAt;
  if (elapsed >= MAP_FPS_SAMPLE_INTERVAL_MS) {
/** averageFps：定义该变量以承载业务值。 */
    const averageFps = fpsSampleFrameCount * 1000 / elapsed;
/** lowStats：定义该变量以承载业务值。 */
    const lowStats = resolveFpsLowStats();
    renderFpsStats({
      fps: averageFps,
      low: lowStats.low,
      onePercentLow: lowStats.onePercentLow,
    });
    fpsSampleFrameCount = 0;
    fpsSampleStartedAt = now;
  }
}

/** startFpsMonitor：执行对应的业务逻辑。 */
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
}

/** stopFpsMonitor：执行对应的业务逻辑。 */
function stopFpsMonitor(): void {
  fpsMonitorEnabled = false;
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

/** syncFpsMonitorVisibility：执行对应的业务逻辑。 */
function syncFpsMonitorVisibility(showFpsMonitor: boolean): void {
  if (showFpsMonitor) {
    startFpsMonitor();
    return;
  }
  stopFpsMonitor();
}

/** renderTickRate：执行对应的业务逻辑。 */
function renderTickRate(seconds: number) {
  const [integer, fraction] = seconds.toFixed(2).split('.');
  if (tickRateIntEl) tickRateIntEl.textContent = integer;
  if (tickRateDotEl) tickRateDotEl.textContent = '.';
  if (tickRateFracAEl) tickRateFracAEl.textContent = fraction[0] ?? '0';
  if (tickRateFracBEl) tickRateFracBEl.textContent = fraction[1] ?? '0';
}

/** resolveDisplayedLocalTicks：执行对应的业务逻辑。 */
function resolveDisplayedLocalTicks(state: GameTimeState | null, now = performance.now()): number | null {
  if (!state) {
    return null;
  }
/** dayLength：定义该变量以承载业务值。 */
  const dayLength = Math.max(1, state.dayLength);
/** timeScale：定义该变量以承载业务值。 */
  const timeScale = Number.isFinite(state.timeScale) && state.timeScale >= 0 ? state.timeScale : 1;
/** tickIntervalMs：定义该变量以承载业务值。 */
  const tickIntervalMs = Math.max(1, currentTimeTickIntervalMs);
/** elapsedMs：定义该变量以承载业务值。 */
  const elapsedMs = Math.max(0, now - currentTimeStateSyncedAt);
/** elapsedTicks：定义该变量以承载业务值。 */
  const elapsedTicks = elapsedMs / tickIntervalMs * timeScale;
  return ((state.localTicks + elapsedTicks) % dayLength + dayLength) % dayLength;
}

/** resolveDisplayedPhaseLabel：执行对应的业务逻辑。 */
function resolveDisplayedPhaseLabel(state: GameTimeState, localTicks: number): string {
/** phase：定义该变量以承载业务值。 */
  const phase = GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick);
  return phase?.label ?? state.phaseLabel;
}

/** renderCurrentTime：执行对应的业务逻辑。 */
function renderCurrentTime(state: GameTimeState | null, now = performance.now()) {
/** localTicks：定义该变量以承载业务值。 */
  const localTicks = resolveDisplayedLocalTicks(state, now);
/** totalMinutes：定义该变量以承载业务值。 */
  const totalMinutes = localTicks === null
    ? null
    : Math.floor((localTicks / Math.max(1, state?.dayLength ?? 1)) * 24 * 60);
/** hours：定义该变量以承载业务值。 */
  const hours = totalMinutes === null ? '--' : String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
/** minutes：定义该变量以承载业务值。 */
  const minutes = totalMinutes === null ? '--' : String(totalMinutes % 60).padStart(2, '0');
/** phaseLabel：定义该变量以承载业务值。 */
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

/** syncCurrentTimeState：执行对应的业务逻辑。 */
function syncCurrentTimeState(state: GameTimeState | null): void {
  currentTimeState = state;
  currentTimeStateSyncedAt = performance.now();
  renderCurrentTime(currentTimeState, currentTimeStateSyncedAt);
}

/** syncCurrentTimeTickInterval：执行对应的业务逻辑。 */
function syncCurrentTimeTickInterval(dtMs: number | null | undefined): void {
  if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }
  currentTimeTickIntervalMs = dtMs;
  currentTimeTickIntervalUpdatedAt = performance.now();
  syncEstimatedServerTickInterval(dtMs);
}

/** renderPingLatency：执行对应的业务逻辑。 */
function renderPingLatency(latencyMs: number | null, status = '毫秒') {
/** digits：通过常量导出可复用函数行为。 */
  const digits = (() => {
    if (latencyMs === null) {
      return ['-', '-', '-'];
    }
/** rounded：定义该变量以承载业务值。 */
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
/** title：定义该变量以承载业务值。 */
    const title = latencyMs === null
      ? status === '阻塞'
        ? `当前域名 ${window.location.host} 的游戏连接仍可达，但最近 tick/主循环出现明显阻塞，当前“灵网延迟”已不再代表纯网络延迟`
        : `当前域名 ${window.location.host} 的游戏连接响应${status === '离线' ? '不可用' : `状态：${status}`}`
      : `当前域名 ${window.location.host} 上游戏连接往返约 ${Math.round(latencyMs)}ms；该值同时会受到服务端主循环阻塞影响`;
    pingLatencyEl.setAttribute('title', title);
  }
}

/** hasRecentTickStall：执行对应的业务逻辑。 */
function hasRecentTickStall(now = performance.now()): boolean {
  return currentTimeTickIntervalMs >= PING_BLOCKED_TICK_INTERVAL_MS
    && now - currentTimeTickIntervalUpdatedAt <= PING_BLOCKED_TICK_GRACE_MS;
}

/** waitFor：执行对应的业务逻辑。 */
async function waitFor(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** recoverConnection：执行对应的业务逻辑。 */
async function recoverConnection(forceRefresh = false): Promise<void> {
  if (connectionRecoveryPromise) {
    return connectionRecoveryPromise;
  }
/** connectionRecoveryPromise：将函数作为字段暴露，承接调用行为。 */
  connectionRecoveryPromise = (async () => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    if (socket.connected || !loginUI.hasRefreshToken()) {
      return;
    }

/** accessToken：定义该变量以承载业务值。 */
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

/** scheduleConnectionRecovery：执行对应的业务逻辑。 */
function scheduleConnectionRecovery(delayMs = 0, forceRefresh = false): void {
  if (connectionRecoveryTimer !== null) {
    window.clearTimeout(connectionRecoveryTimer);
  }
  connectionRecoveryTimer = window.setTimeout(() => {
    connectionRecoveryTimer = null;
    void recoverConnection(forceRefresh);
  }, delayMs);
}

/** clearPendingSocketPing：执行对应的业务逻辑。 */
function clearPendingSocketPing(): void {
  if (!pendingSocketPing) {
    return;
  }
  window.clearTimeout(pendingSocketPing.timeoutId);
  pendingSocketPing = null;
}

/** markSocketPingTimeout：执行对应的业务逻辑。 */
function markSocketPingTimeout(serial: number): void {
  if (!pendingSocketPing || pendingSocketPing.serial !== serial) {
    return;
  }
  pendingSocketPing = null;
  renderPingLatency(null, socket.connected ? (hasRecentTickStall() ? '阻塞' : '超时') : '离线');
}

/** sampleServerPing：执行对应的业务逻辑。 */
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
/** serial：定义该变量以承载业务值。 */
  const serial = ++pingRequestSerial;
/** clientAt：定义该变量以承载业务值。 */
  const clientAt = performance.now();
  socket.sendPing(clientAt);
/** timeoutId：定义该变量以承载业务值。 */
  const timeoutId = window.setTimeout(() => {
    markSocketPingTimeout(serial);
  }, SOCKET_PING_TIMEOUT_MS);
  pendingSocketPing = { serial, clientAt, timeoutId };
}

/** stopPingLoop：执行对应的业务逻辑。 */
function stopPingLoop(): void {
  if (pingTimer !== null) {
    window.clearTimeout(pingTimer);
    pingTimer = null;
  }
  clearPendingSocketPing();
}

/** scheduleNextPing：执行对应的业务逻辑。 */
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

/** restartPingLoop：执行对应的业务逻辑。 */
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
/** initialMapPerformanceConfig：定义该变量以承载业务值。 */
const initialMapPerformanceConfig = initializeMapPerformanceConfig();
syncFpsMonitorVisibility(initialMapPerformanceConfig.showFpsMonitor);
renderCurrentTime(null);
renderPingLatency(null, '待测');
bindResponsiveViewportCss(window);
initializeUiStyleConfig();
/** socket：定义该变量以承载业务值。 */
const socket = new SocketManager();
/** mapRuntime：定义该变量以承载业务值。 */
const mapRuntime = createMapRuntime();
mapRuntime.setRenderFrameObserver((frameAtMs) => {
  recordFpsMonitorFrame(frameAtMs);
});
mapRuntime.setTargetFps(initialMapPerformanceConfig.targetFps);
window.addEventListener(MAP_PERFORMANCE_CONFIG_CHANGE_EVENT, (event) => {
/** config：定义该变量以承载业务值。 */
  const config = (event as CustomEvent<MapPerformanceConfig>).detail;
  syncFpsMonitorVisibility(config.showFpsMonitor);
  mapRuntime.setTargetFps(config.targetFps);
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
/** loginUI：定义该变量以承载业务值。 */
const loginUI = new LoginUI(socket);
/** hud：定义该变量以承载业务值。 */
const hud = new HUD();
/** chatUI：定义该变量以承载业务值。 */
const chatUI = new ChatUI();
/** debugPanel：定义该变量以承载业务值。 */
const debugPanel = new DebugPanel();

// 修仙系统面板
const sidePanel = new SidePanel();
/** attrPanel：定义该变量以承载业务值。 */
const attrPanel = new AttrPanel();
/** inventoryPanel：定义该变量以承载业务值。 */
const inventoryPanel = new InventoryPanel();
/** equipmentPanel：定义该变量以承载业务值。 */
const equipmentPanel = new EquipmentPanel();
/** techniquePanel：定义该变量以承载业务值。 */
const techniquePanel = new TechniquePanel();
/** bodyTrainingPanel：定义该变量以承载业务值。 */
const bodyTrainingPanel = new BodyTrainingPanel();
bodyTrainingPanel.setInfusionHandler((foundationSpent) => {
  socket.sendAction('body_training:infuse', String(foundationSpent));
});
/** questPanel：定义该变量以承载业务值。 */
const questPanel = new QuestPanel();
/** marketPanel：定义该变量以承载业务值。 */
const marketPanel = new MarketPanel();
/** actionPanel：定义该变量以承载业务值。 */
const actionPanel = new ActionPanel();
/** npcShopModal：定义该变量以承载业务值。 */
const npcShopModal = new NpcShopModal();
/** alchemyModal：定义该变量以承载业务值。 */
const alchemyModal = new AlchemyModal();
/** enhancementModal：定义该变量以承载业务值。 */
const enhancementModal = new EnhancementModal();
/** lootPanel：定义该变量以承载业务值。 */
const lootPanel = new LootPanel();
/** worldPanel：定义该变量以承载业务值。 */
const worldPanel = new WorldPanel();
/** leaderboardModal：定义该变量以承载业务值。 */
const leaderboardModal = new LeaderboardModal();
const worldSummaryModal = new WorldSummaryModal();
/** settingsPanel：定义该变量以承载业务值。 */
const settingsPanel = new SettingsPanel();
/** mailPanel：定义该变量以承载业务值。 */
const mailPanel = new MailPanel(socket);
/** suggestionPanel：定义该变量以承载业务值。 */
const suggestionPanel = new SuggestionPanel(socket);
new ChangelogPanel();
new TutorialPanel();
/** panelSystem：定义该变量以承载业务值。 */
const panelSystem = createClientPanelSystem(window);
mapRuntime.attach(canvasHost);
mapRuntime.setMoveHandler((target) => {
  if (target.isCurrentMap || myPlayer?.mapId === target.mapId) {
/** planPathTo：处理当前场景中的对应操作。 */
    planPathTo({ x: target.x, y: target.y });
    return;
  }
  clearCurrentPath();
  socket.sendNavigateMapPoint(target.mapId, target.x, target.y);
});
/** targetingBadgeEl：定义该变量以承载业务值。 */
const targetingBadgeEl = document.getElementById('map-targeting-indicator');
/** observeModalEl：定义该变量以承载业务值。 */
const observeModalEl = document.getElementById('observe-modal');
/** observeModalBodyEl：定义该变量以承载业务值。 */
const observeModalBodyEl = document.getElementById('observe-modal-body');
/** observeModalSubtitleEl：定义该变量以承载业务值。 */
const observeModalSubtitleEl = document.getElementById('observe-modal-subtitle');
/** observeModalShellEl：定义该变量以承载业务值。 */
const observeModalShellEl = observeModalEl?.querySelector('.observe-modal-shell') as HTMLElement | null;
/** observeModalAsideEl：定义该变量以承载业务值。 */
const observeModalAsideEl = document.getElementById('observe-modal-aside');
/** observeBuffTooltip：定义该变量以承载业务值。 */
const observeBuffTooltip = new FloatingTooltip();
/** observeBuffTooltipHoverNode：定义该变量以承载业务值。 */
let observeBuffTooltipHoverNode: HTMLElement | null = null;
/** observeBuffTooltipDelegatedBound：定义该变量以承载业务值。 */
let observeBuffTooltipDelegatedBound = false;
/** observeLootPreviewDelegatedBound：定义该变量以承载业务值。 */
let observeLootPreviewDelegatedBound = false;
/** senseQiTooltip：定义该变量以承载业务值。 */
const senseQiTooltip = new FloatingTooltip();
/** pendingTargetedAction：定义该变量以承载业务值。 */
let pendingTargetedAction: {
/** actionId：定义该变量以承载业务值。 */
  actionId: string;
/** actionName：定义该变量以承载业务值。 */
  actionName: string;
  targetMode?: string;
/** range：定义该变量以承载业务值。 */
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
/** hoveredMapTile：定义该变量以承载业务值。 */
let hoveredMapTile: {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** clientX：定义该变量以承载业务值。 */
  clientX: number;
/** clientY：定义该变量以承载业务值。 */
  clientY: number;
} | null = null;

/** getTileTypeName：执行对应的业务逻辑。 */
function getTileTypeName(type: TileType): string {
  return getTileTypeLabel(type, '未知地貌');
}

/** ObservedEntity：定义该类型的结构与数据语义。 */
type ObservedEntity = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** wx：定义该变量以承载业务值。 */
  wx: number;
/** wy：定义该变量以承载业务值。 */
  wy: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
  name?: string;
  kind?: string;
  hostile?: boolean;
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

/** isCrowdEntityKind：执行对应的业务逻辑。 */
function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}

/** isPlayerLikeEntityKind：执行对应的业务逻辑。 */
function isPlayerLikeEntityKind(kind: string | null | undefined): boolean {
  return kind === 'player' || isCrowdEntityKind(kind);
}

/** isEntityHostileToMe：执行对应的业务逻辑。 */
function isEntityHostileToMe(entity: Pick<ObservedEntity, 'id' | 'kind'>): boolean {
  if (!myPlayer) {
    return false;
  }
  if (entity.id === myPlayer.id) {
    return false;
  }
/** rules：定义该变量以承载业务值。 */
  const rules = normalizeCombatTargetingRules(
    myPlayer.combatTargetingRules,
    buildDefaultCombatTargetingRules({ includeAllPlayersHostile: myPlayer.allowAoePlayerHit === true }),
  );
  if (entity.kind === 'monster') {
    return hasCombatTargetingRule(rules, 'hostile', 'monster');
  }
  if (entity.kind === 'player') {
    return hasCombatTargetingRule(rules, 'hostile', 'all_players')
      || (
        hasCombatTargetingRule(rules, 'hostile', 'retaliators')
        && myPlayer.retaliatePlayerTargetId === entity.id
      );
  }
  return false;
}

/** decorateObservedEntitiesForDisplay：执行对应的业务逻辑。 */
function decorateObservedEntitiesForDisplay(entities: ObservedEntity[]): ObservedEntity[] {
  return entities.map((entity) => ({
    ...entity,
    hostile: isEntityHostileToMe(entity),
  }));
}

/** ObserveEntityCardData：定义该类型的结构与数据语义。 */
type ObserveEntityCardData = Pick<
  ObservedEntity,
  'id' | 'name' | 'kind' | 'monsterTier' | 'hp' | 'maxHp' | 'qi' | 'maxQi' | 'npcQuestMarker' | 'observation' | 'lootPreview' | 'buffs'
>;

/** PendingAutoInteraction：定义该类型的结构与数据语义。 */
type PendingAutoInteraction =
  | {
/** kind：定义该变量以承载业务值。 */
      kind: 'npc';
/** mapId：定义该变量以承载业务值。 */
      mapId: string;
/** x：定义该变量以承载业务值。 */
      x: number;
/** y：定义该变量以承载业务值。 */
      y: number;
/** actionId：定义该变量以承载业务值。 */
      actionId: string;
    }
  | {
/** kind：定义该变量以承载业务值。 */
      kind: 'portal';
/** mapId：定义该变量以承载业务值。 */
      mapId: string;
/** x：定义该变量以承载业务值。 */
      x: number;
/** y：定义该变量以承载业务值。 */
      y: number;
/** actionId：定义该变量以承载业务值。 */
      actionId: 'portal:travel';
    };

/** AUTO_INTERACTION_APPROACH_STEPS：定义该变量以承载业务值。 */
const AUTO_INTERACTION_APPROACH_STEPS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** getBreakthroughRequirementStatusLabel：执行对应的业务逻辑。 */
function getBreakthroughRequirementStatusLabel(requirement: BreakthroughRequirementView): string {
  return requirement.blocksBreakthrough === false
    ? (requirement.completed ? '已生效' : '未生效')
    : (requirement.completed ? '已达成' : '未达成');
}

/** getBreakthroughRequirementStatusDetail：执行对应的业务逻辑。 */
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

/** openBreakthroughModal：执行对应的业务逻辑。 */
function openBreakthroughModal() {
  if (openHeavenGateModal(myPlayer, {
    showToast,
    sendAction: (action, element) => socket.sendHeavenGateAction(action, element),
  })) {
    return;
  }

/** preview：定义该变量以承载业务值。 */
  const preview = myPlayer?.realm?.breakthrough;
/** currentRealm：定义该变量以承载业务值。 */
  const currentRealm = myPlayer?.realm;
  if (!preview || !currentRealm) {
    showToast('当前境界尚未圆满，暂时不能突破');
    return;
  }

/** hasConsumableRequirements：定义该变量以承载业务值。 */
  const hasConsumableRequirements = preview.requirements.some((requirement) => requirement.type === 'item');
/** hasIncreaseRequirements：定义该变量以承载业务值。 */
  const hasIncreaseRequirements = preview.requirements.some((requirement) => (requirement.increasePct ?? 0) > 0);
/** requirementRows：定义该变量以承载业务值。 */
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

/** syncTargetingOverlay：执行对应的业务逻辑。 */
function syncTargetingOverlay() {
  if (!myPlayer || !pendingTargetedAction) {
    mapRuntime.setTargetingOverlay(null);
    targetingBadgeEl?.classList.add('hidden');
    syncSenseQiOverlay();
    return;
  }
/** geometry：定义该变量以承载业务值。 */
  const geometry = getEffectiveTargetingGeometry(pendingTargetedAction);
/** affectedCells：定义该变量以承载业务值。 */
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
/** rangeLabel：定义该变量以承载业务值。 */
    const rangeLabel = pendingTargetedAction.actionId === 'client:observe' ? `视野 ${geometry.range}` : `射程 ${geometry.range}`;
/** shapeLabel：定义该变量以承载业务值。 */
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

/** cancelTargeting：执行对应的业务逻辑。 */
function cancelTargeting(showMessage = false) {
  if (!pendingTargetedAction) return;
  pendingTargetedAction = null;
  syncTargetingOverlay();
  if (showMessage) {
    showToast('已取消目标选择');
  }
}

/** getSkillDefByActionId：执行对应的业务逻辑。 */
function getSkillDefByActionId(actionId: string): SkillDef | null {
  return getSkillDefByActionIdHelper(myPlayer, actionId);
}

/** getEffectiveTargetingGeometry：执行对应的业务逻辑。 */
function getEffectiveTargetingGeometry(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
): TargetingGeometrySpec {
  return getEffectiveTargetingGeometryHelper(action, myPlayer);
}

/** resolveCurrentTargetingRange：执行对应的业务逻辑。 */
function resolveCurrentTargetingRange(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
): number {
  return resolveCurrentTargetingRangeHelper(action, myPlayer, getInfoRadius());
}

/** doesTargetingRequireVision：执行对应的业务逻辑。 */
function doesTargetingRequireVision(actionId: string): boolean {
  return actionId === 'client:observe' || actionId === 'battle:force_attack';
}

/** beginTargeting：执行对应的业务逻辑。 */
function beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1) {
  if (pendingTargetedAction?.actionId === actionId) {
    cancelTargeting(true);
    return;
  }
/** skill：定义该变量以承载业务值。 */
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

/** computeAffectedCells：执行对应的业务逻辑。 */
function computeAffectedCells(action: NonNullable<typeof pendingTargetedAction>): Array<{ x: number; y: number }> {
  if (action.hoverX === undefined || action.hoverY === undefined) {
    return [];
  }
  return computeAffectedCellsForAction(action, { x: action.hoverX, y: action.hoverY });
}

/** computeAffectedCellsForAction：执行对应的业务逻辑。 */
function computeAffectedCellsForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchor: GridPoint,
): GridPoint[] {
  return computeAffectedCellsForActionHelper(action, anchor, myPlayer);
}

/** resolveTargetRefForAction：执行对应的业务逻辑。 */
function resolveTargetRefForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
/** target：定义该变量以承载业务值。 */
  target: { x: number; y: number; entityId?: string; entityKind?: string },
): string | null {
  return resolveTargetRefForActionHelper(action, target, myPlayer);
}

/** hasAffectableTargetInArea：执行对应的业务逻辑。 */
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

/** getVisibleTileAt：执行对应的业务逻辑。 */
function getVisibleTileAt(x: number, y: number): Tile | null {
  return mapRuntime.getVisibleTileAt(x, y);
}

/** getKnownTileAt：执行对应的业务逻辑。 */
function getKnownTileAt(x: number, y: number): Tile | null {
  return mapRuntime.getKnownTileAt(x, y);
}

/** isPointInsideCurrentMap：执行对应的业务逻辑。 */
function isPointInsideCurrentMap(x: number, y: number): boolean {
/** mapMeta：定义该变量以承载业务值。 */
  const mapMeta = mapRuntime.getMapMeta();
  if (!mapMeta) return true;
  return x >= 0 && y >= 0 && x < mapMeta.width && y < mapMeta.height;
}

/** getVisibleGroundPileAt：执行对应的业务逻辑。 */
function getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
  return mapRuntime.getGroundPileAt(x, y);
}

/** syncSenseQiOverlay：执行对应的业务逻辑。 */
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

/** tile：定义该变量以承载业务值。 */
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

/** isWithinDisplayedMemoryBounds：执行对应的业务逻辑。 */
function isWithinDisplayedMemoryBounds(x: number, y: number): boolean {
  if (!myPlayer) {
    return false;
  }
  return Math.abs(x - myPlayer.x) <= getDisplayRangeX() && Math.abs(y - myPlayer.y) <= getDisplayRangeY();
}

/** hideObserveModal：执行对应的业务逻辑。 */
function hideObserveModal(): void {
  observeBuffTooltip.hide(true);
  observeModalEl?.classList.add('hidden');
  observeModalEl?.setAttribute('aria-hidden', 'true');
  observeModalAsideEl?.classList.add('hidden');
  observeModalAsideEl?.setAttribute('aria-hidden', 'true');
  activeObservedTile = null;
  activeObservedTileDetail = null;
}

/** buildObservationRows：执行对应的业务逻辑。 */
function buildObservationRows(rows: Array<{ label: string; value?: string; valueHtml?: string }>): string {
  return rows
    .map((row) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(row.label)}</span><span class="observe-modal-value">${row.valueHtml ?? escapeHtml(row.value ?? '')}</span></div>`)
    .join('');
}

/** formatCurrentMax：执行对应的业务逻辑。 */
function formatCurrentMax(current?: number, max?: number): string {
  if (typeof current !== 'number' || typeof max !== 'number') {
    return '未明';
  }
  return formatDisplayCurrentMax(Math.max(0, Math.round(current)), Math.max(0, Math.round(max)));
}

/** syncAuraLevelBaseValue：执行对应的业务逻辑。 */
function syncAuraLevelBaseValue(nextValue?: number): void {
  if (typeof nextValue !== 'number' || !Number.isFinite(nextValue) || nextValue <= 0) {
    return;
  }
  auraLevelBaseValue = Math.max(1, Math.round(nextValue));
}

/** formatAuraLevelText：执行对应的业务逻辑。 */
function formatAuraLevelText(auraValue: number): string {
  return `灵气 ${formatDisplayInteger(Math.max(0, Math.round(auraValue)))}`;
}

/** formatAuraValueText：执行对应的业务逻辑。 */
function formatAuraValueText(auraValue: number): string {
  return formatDisplayInteger(Math.max(0, Math.round(auraValue)));
}

/** TileRuntimeResourceDetail：定义该类型的结构与数据语义。 */
type TileRuntimeResourceDetail = S2C_TileRuntimeDetail['resources'][number];
/** ObserveAsideCard：定义该类型的结构与数据语义。 */
type ObserveAsideCard = {
  mark?: string;
/** title：定义该变量以承载业务值。 */
  title: string;
/** lines：定义该变量以承载业务值。 */
  lines: string[];
  tone?: 'buff' | 'debuff';
};

/** createObserveAsideLineElement：执行对应的业务逻辑。 */
function createObserveAsideLineElement(line: string): HTMLSpanElement {
/** element：定义该变量以承载业务值。 */
  const element = document.createElement('span');
  element.className = 'floating-tooltip-aside-line';
  element.textContent = line;
  return element;
}

/** patchObserveAsideLineElements：执行对应的业务逻辑。 */
function patchObserveAsideLineElements(container: HTMLElement, lines: string[]): void {
  while (container.children.length > lines.length) {
    container.lastElementChild?.remove();
  }
  lines.forEach((line, index) => {
/** existing：定义该变量以承载业务值。 */
    const existing = container.children.item(index);
/** lineEl：定义该变量以承载业务值。 */
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

/** patchObserveAsideCardElement：执行对应的业务逻辑。 */
function patchObserveAsideCardElement(cardEl: HTMLElement, card: ObserveAsideCard): void {
  cardEl.className = `floating-tooltip-aside-card ${card.tone === 'debuff' ? 'debuff' : 'buff'}`;

/** headEl：定义该变量以承载业务值。 */
  let headEl = cardEl.firstElementChild;
  if (!(headEl instanceof HTMLDivElement) || !headEl.classList.contains('floating-tooltip-aside-head')) {
    headEl = document.createElement('div');
    headEl.className = 'floating-tooltip-aside-head';
    cardEl.prepend(headEl);
  }

/** markEl：定义该变量以承载业务值。 */
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

/** titleEl：定义该变量以承载业务值。 */
  let titleEl = headEl.querySelector(':scope > strong');
  if (!(titleEl instanceof HTMLElement)) {
    titleEl = document.createElement('strong');
    headEl.append(titleEl);
  }
  if (titleEl.textContent !== card.title) {
    titleEl.textContent = card.title;
  }

/** detailEl：定义该变量以承载业务值。 */
  const detailEl = cardEl.querySelector(':scope > .floating-tooltip-aside-detail');
  if (card.lines.length === 0) {
    detailEl?.remove();
    return;
  }

/** nextDetailEl：定义该变量以承载业务值。 */
  const nextDetailEl = detailEl instanceof HTMLDivElement
    ? detailEl
    : document.createElement('div');
  nextDetailEl.className = 'floating-tooltip-aside-detail';
  if (nextDetailEl.parentElement !== cardEl) {
    cardEl.append(nextDetailEl);
  }
  patchObserveAsideLineElements(nextDetailEl, card.lines);
}

/** getObservedTileRuntimeResources：执行对应的业务逻辑。 */
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

/** formatObservedResourceOverview：执行对应的业务逻辑。 */
function formatObservedResourceOverview(resource: TileRuntimeResourceDetail, fallbackLevel?: number): string {
  if (typeof resource.level === 'number') {
    return formatDisplayInteger(Math.max(0, Math.round(resource.level)));
  }
  if (typeof fallbackLevel === 'number') {
    return formatDisplayInteger(Math.max(0, Math.round(fallbackLevel)));
  }
  return formatAuraValueText(resource.value);
}

/** buildObservedResourceAsideLines：执行对应的业务逻辑。 */
function buildObservedResourceAsideLines(resource: TileRuntimeResourceDetail): string[] {
/** effectiveValue：定义该变量以承载业务值。 */
  const effectiveValue = typeof resource.effectiveValue === 'number' && Number.isFinite(resource.effectiveValue)
    ? resource.effectiveValue
    : undefined;
/** hasProjectedValue：定义该变量以承载业务值。 */
  const hasProjectedValue = effectiveValue !== undefined
    && Math.round(effectiveValue) !== Math.round(resource.value);
/** lines：定义该变量以承载业务值。 */
  const lines = [`当前数值：${formatAuraValueText(hasProjectedValue ? effectiveValue : resource.value)}`];
  if (hasProjectedValue) {
    lines.push(`原始值：${formatAuraValueText(resource.value)}`);
  }
  if (typeof resource.level === 'number') {
    lines.unshift(`当前等级：${formatDisplayInteger(Math.max(0, Math.round(resource.level)))}`);
  }
  return lines;
}

/** isMatchingObservedTile：执行对应的业务逻辑。 */
function isMatchingObservedTile(targetX: number, targetY: number): boolean {
  return Boolean(
    myPlayer
    && activeObservedTile
    && activeObservedTile.mapId === myPlayer.mapId
    && activeObservedTile.x === targetX
    && activeObservedTile.y === targetY,
  );
}

/** buildObservedResourceAsideCards：执行对应的业务逻辑。 */
function buildObservedResourceAsideCards(targetX: number, targetY: number, tile: Tile): ObserveAsideCard[] {
  if (!myPlayer?.senseQiActive || !isMatchingObservedTile(targetX, targetY)) {
    return [];
  }

/** detailResources：定义该变量以承载业务值。 */
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
/** lines：定义该变量以承载业务值。 */
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

/** renderObserveAsideCards：执行对应的业务逻辑。 */
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
/** existing：定义该变量以承载业务值。 */
    const existing = observeModalAsideEl.children.item(index);
/** cardEl：定义该变量以承载业务值。 */
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

/** formatBuffDuration：执行对应的业务逻辑。 */
function formatBuffDuration(buff: VisibleBuffState): string {
  if (buff.infiniteDuration) {
    return '∞';
  }
  return `${formatDisplayInteger(Math.max(0, Math.round(buff.remainingTicks)))} / ${formatDisplayInteger(Math.max(1, Math.round(buff.duration)))} 息`;
}

/** scaleBuffAttrs：执行对应的业务逻辑。 */
function scaleBuffAttrs(
  attrs: VisibleBuffState['attrs'],
  stacks: number,
): VisibleBuffState['attrs'] | undefined {
  if (!attrs || stacks === 1) {
    return attrs;
  }
/** scaled：定义该变量以承载业务值。 */
  const scaled: NonNullable<VisibleBuffState['attrs']> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key as keyof NonNullable<VisibleBuffState['attrs']>] = value * stacks;
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

/** scaleBuffStats：执行对应的业务逻辑。 */
function scaleBuffStats(
  stats: VisibleBuffState['stats'],
  stacks: number,
): VisibleBuffState['stats'] | undefined {
  if (!stats || stacks === 1) {
    return stats;
  }
/** scaled：定义该变量以承载业务值。 */
  const scaled: PartialNumericStats = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number') {
      (scaled as Record<string, unknown>)[key] = value * stacks;
      continue;
    }
    if (!value || typeof value !== 'object') {
      continue;
    }
/** nested：定义该变量以承载业务值。 */
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

/** buildBuffEffectLines：执行对应的业务逻辑。 */
function buildBuffEffectLines(buff: VisibleBuffState): string[] {
/** stackFactor：定义该变量以承载业务值。 */
  const stackFactor = Math.max(1, Math.floor(buff.stacks || 1));
  return describePreviewBonuses(
    scaleBuffAttrs(buff.attrs, stackFactor),
    scaleBuffStats(buff.stats, stackFactor),
    undefined,
    buff.attrMode ?? 'percent',
    buff.statMode ?? 'percent',
  );
}

/** buildBuffTooltipLines：执行对应的业务逻辑。 */
function buildBuffTooltipLines(buff: VisibleBuffState): string[] {
/** lines：定义该变量以承载业务值。 */
  const lines = [
    `类别：${buff.category === 'debuff' ? '减益' : '增益'}`,
    `剩余：${formatBuffDuration(buff)}`,
  ];
/** stackLimit：定义该变量以承载业务值。 */
  const stackLimit = formatBuffMaxStacks(buff.maxStacks);
  if (stackLimit) {
    lines.push(`层数：${formatDisplayInteger(buff.stacks)} / ${stackLimit}`);
  }
  if (buff.sourceSkillName || buff.sourceSkillId) {
    lines.push(`来源：${buff.sourceSkillName ?? buff.sourceSkillId}`);
  }
/** effectLines：定义该变量以承载业务值。 */
  const effectLines = buildBuffEffectLines(buff);
  if (effectLines.length > 0) {
    lines.push(`效果：${effectLines.join('，')}`);
  }
  if (buff.desc) {
    lines.push(buff.desc);
  }
  return lines;
}

/** buildBuffBadgeHtml：执行对应的业务逻辑。 */
function buildBuffBadgeHtml(buff: VisibleBuffState): string {
/** title：定义该变量以承载业务值。 */
  const title = escapeHtml(buff.name);
/** detail：定义该变量以承载业务值。 */
  const detail = escapeHtml(buildBuffTooltipLines(buff).join('\n'));
/** stackText：定义该变量以承载业务值。 */
  const stackText = buff.maxStacks > 1 ? `<span class="observe-buff-stack">${formatDisplayInteger(buff.stacks)}</span>` : '';
/** className：定义该变量以承载业务值。 */
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

/** buildBuffSectionHtml：执行对应的业务逻辑。 */
function buildBuffSectionHtml(title: string, buffs: VisibleBuffState[], emptyText: string): string {
  return `<section class="observe-buff-section">
    <div class="observe-buff-title">${escapeHtml(title)}</div>
    ${buffs.length > 0
      ? `<div class="observe-buff-list">${buffs.map((buff) => buildBuffBadgeHtml(buff)).join('')}</div>`
      : `<div class="observe-entity-empty">${escapeHtml(emptyText)}</div>`}
  </section>`;
}

/** applyNullablePatch：执行对应的业务逻辑。 */
function applyNullablePatch<T>(value: T | null | undefined, fallback: T | undefined): T | undefined {
  if (value === null) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  return fallback;
}

/** cloneJson：执行对应的业务逻辑。 */
function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

/** buildAttrStateFromPlayer：执行对应的业务逻辑。 */
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

/** mergeAttrUpdatePatch：执行对应的业务逻辑。 */
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
/** lifespanYears：定义该变量以承载业务值。 */
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

/** mergeTechniquePatch：执行对应的业务逻辑。 */
function mergeTechniquePatch(patch: TechniqueUpdateEntry, previous?: TechniqueState): TechniqueState {
/** previousSameTechnique：定义该变量以承载业务值。 */
  const previousSameTechnique = previous?.techId === patch.techId ? previous : undefined;
/** template：定义该变量以承载业务值。 */
  const template = getLocalTechniqueTemplate(patch.techId);
/** mergedSkills：定义该变量以承载业务值。 */
  const mergedSkills = applyNullablePatch(patch.skills, previousSameTechnique?.skills);
/** mergedLayers：定义该变量以承载业务值。 */
  const mergedLayers = applyNullablePatch(patch.layers, previousSameTechnique?.layers);
/** mergedAttrCurves：定义该变量以承载业务值。 */
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

/** hydrateSyncedItemStack：执行对应的业务逻辑。 */
function hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
/** nextEnhanceLevel：定义该变量以承载业务值。 */
  const nextEnhanceLevel = item.enhanceLevel ?? 0;
/** previousSameItem：定义该变量以承载业务值。 */
  const previousSameItem = previous?.itemId === item.itemId && (previous.enhanceLevel ?? 0) === nextEnhanceLevel
    ? previous
    : undefined;
/** template：定义该变量以承载业务值。 */
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

/** mergeInventoryUpdate：执行对应的业务逻辑。 */
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

/** next：定义该变量以承载业务值。 */
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

/** mergeEquipmentUpdate：执行对应的业务逻辑。 */
function mergeEquipmentUpdate(previous: PlayerState['equipment'] | undefined, patch: S2C_EquipmentUpdate): PlayerState['equipment'] {
/** next：定义该变量以承载业务值。 */
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

/** hydrateLootWindowState：执行对应的业务逻辑。 */
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
/** destroyed：定义该变量以承载业务值。 */
      destroyed: source.destroyed === true,
      emptyText: source.emptyText,
      items: source.items.map((entry) => ({
        itemKey: entry.itemKey,
        item: hydrateSyncedItemStack(entry.item),
      })),
    })),
  };
}

/** hydrateNpcShopResponse：执行对应的业务逻辑。 */
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

/** mergeTechniqueStates：执行对应的业务逻辑。 */
function mergeTechniqueStates(patches: TechniqueUpdateEntry[], removeTechniqueIds: string[] = []): TechniqueState[] {
/** removedIdSet：定义该变量以承载业务值。 */
  const removedIdSet = new Set(removeTechniqueIds);
/** merged：定义该变量以承载业务值。 */
  const merged = [...latestTechniqueMap.values()]
    .filter((technique) => !removedIdSet.has(technique.techId))
    .map((technique) => cloneJson(technique));
/** nextMap：定义该变量以承载业务值。 */
  const nextMap = new Map(merged.map((technique) => [technique.techId, technique] as const));

  for (const patch of patches) {
    const previous = nextMap.get(patch.techId);
    const next = mergeTechniquePatch(patch, previous);
    if (previous) {
/** index：定义该变量以承载业务值。 */
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

/** mergeActionPatch：执行对应的业务逻辑。 */
function mergeActionPatch(patch: ActionUpdateEntry, previous?: ActionDef): ActionDef {
/** previousSameAction：定义该变量以承载业务值。 */
  const previousSameAction = previous?.id === patch.id ? previous : undefined;
/** skillTemplate：定义该变量以承载业务值。 */
  const skillTemplate = getLocalSkillTemplate(patch.id);
/** nextType：定义该变量以承载业务值。 */
  const nextType = applyNullablePatch(patch.type, previousSameAction?.type) ?? (skillTemplate ? 'skill' : 'interact');
/** isSkillAction：定义该变量以承载业务值。 */
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

/** mergeActionStates：执行对应的业务逻辑。 */
function mergeActionStates(
  patches: ActionUpdateEntry[],
/** removeActionIds：定义该变量以承载业务值。 */
  removeActionIds: string[] = [],
  actionOrder?: string[],
): ActionDef[] {
/** removedIdSet：定义该变量以承载业务值。 */
  const removedIdSet = new Set(removeActionIds);
/** merged：定义该变量以承载业务值。 */
  const merged = [...latestActionMap.values()]
    .filter((action) => !removedIdSet.has(action.id))
    .map((action) => cloneJson(action));
/** nextMap：定义该变量以承载业务值。 */
  const nextMap = new Map(merged.map((action) => [action.id, action] as const));

  for (const patch of patches) {
    const previous = nextMap.get(patch.id);
    const next = mergeActionPatch(patch, previous);
    if (previous) {
/** index：定义该变量以承载业务值。 */
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
/** orderIndex：定义该变量以承载业务值。 */
    const orderIndex = new Map(actionOrder.map((actionId, index) => [actionId, index] as const));
    merged.sort((left, right) => (
      (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
  }

  latestActionMap = nextMap;
  return merged;
}

/** formatTraversalCost：执行对应的业务逻辑。 */
function formatTraversalCost(tile: Tile): string {
  if (!tile.walkable) {
    return '无法通行';
  }
/** cost：定义该变量以承载业务值。 */
  const cost = getTileTraversalCost(tile.type);
  return `${cost} 点/格`;
}

/** toObserveEntityCardData：执行对应的业务逻辑。 */
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

/** normalizeObserveEntityCardData：执行对应的业务逻辑。 */
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

/** buildObservedEntityCardHtml：执行对应的业务逻辑。 */
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
/** detailRows：定义该变量以承载业务值。 */
  const detailRows = (entity.observation?.lines ?? []).filter((row) => row.label !== '生命' && row.label !== '气血' && row.label !== '灵力');
/** monsterPresentation：定义该变量以承载业务值。 */
  const monsterPresentation = entity.kind === 'monster'
    ? getMonsterPresentation(entity.name, entity.monsterTier)
    : null;
/** title：定义该变量以承载业务值。 */
  const title = monsterPresentation?.label ?? entity.name ?? entity.id;
/** badge：定义该变量以承载业务值。 */
  const badge = monsterPresentation?.badgeText
    ? `<span class="${monsterPresentation.badgeClassName}">${escapeHtml(monsterPresentation.badgeText)}</span>`
    : '';
/** vitalRows：定义该变量以承载业务值。 */
  const vitalRows = [
    { label: '生命', value: formatCurrentMax(entity.hp, entity.maxHp) },
    { label: '灵力', value: formatCurrentMax(entity.qi, entity.maxQi) },
  ].filter((entry) => entry.value !== '—');
/** fallbackVitalRows：定义该变量以承载业务值。 */
  const fallbackVitalRows = (entity.kind === 'monster' || entity.kind === 'npc' || entity.kind === 'player') && detailRows.length === 0
    ? vitalRows
    : [];
/** detailGrid：定义该变量以承载业务值。 */
  const detailGrid = detailRows.length > 0 ? [...vitalRows, ...detailRows] : fallbackVitalRows;
/** visibleBuffs：定义该变量以承载业务值。 */
  const visibleBuffs = entity.buffs ?? [];
/** publicBuffs：定义该变量以承载业务值。 */
  const publicBuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
/** publicDebuffs：定义该变量以承载业务值。 */
  const publicDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
/** observeOnlyBuffs：定义该变量以承载业务值。 */
  const observeOnlyBuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
/** observeOnlyDebuffs：定义该变量以承载业务值。 */
  const observeOnlyDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
/** buffSection：定义该变量以承载业务值。 */
  const buffSection = `<div class="observe-buff-columns">
    ${buildBuffSectionHtml('增益状态', [...publicBuffs, ...observeOnlyBuffs], '当前未见明显增益状态')}
    ${buildBuffSectionHtml('减益状态', [...publicDebuffs, ...observeOnlyDebuffs], '当前未见明显减益状态')}
  </div>`;
/** lootAction：定义该变量以承载业务值。 */
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

/** findObservedEntityById：执行对应的业务逻辑。 */
function findObservedEntityById(entityId: string): ObserveEntityCardData | null {
/** entities：定义该变量以承载业务值。 */
  const entities = activeObservedTileDetail?.entities;
  if (!entities) {
    return null;
  }
/** matched：定义该变量以承载业务值。 */
  const matched = entities.find((entity) => entity.id === entityId);
  return matched ? normalizeObserveEntityCardData(matched) : null;
}

/** formatObserveLootChance：执行对应的业务逻辑。 */
function formatObserveLootChance(chance: number): string {
/** normalized：定义该变量以承载业务值。 */
  const normalized = Math.max(0, Math.min(1, Number.isFinite(chance) ? chance : 0));
/** percent：定义该变量以承载业务值。 */
  const percent = normalized * 100;
  if (percent >= 10) {
    return `${percent.toFixed(1)}%`;
  }
  if (percent >= 1) {
    return `${percent.toFixed(2)}%`;
  }
  return `${percent.toFixed(3)}%`;
}

/** openObserveLootPreview：执行对应的业务逻辑。 */
function openObserveLootPreview(entity: ObserveEntityCardData): void {
  if (entity.kind !== 'monster' || entity.observation?.clarity !== 'complete' || !entity.lootPreview) {
    return;
  }
/** rowsHtml：定义该变量以承载业务值。 */
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

/** bindObserveLootPreviewActions：执行对应的业务逻辑。 */
function bindObserveLootPreviewActions(root: HTMLElement): void {
  if (observeLootPreviewDelegatedBound) {
    return;
  }
  observeLootPreviewDelegatedBound = true;
  root.addEventListener('click', (event) => {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
/** button：定义该变量以承载业务值。 */
    const button = target.closest<HTMLElement>('[data-observe-loot-id]');
    if (!button) {
      return;
    }
/** entityId：定义该变量以承载业务值。 */
    const entityId = button.dataset.observeLootId?.trim();
    if (!entityId) {
      return;
    }
/** entity：定义该变量以承载业务值。 */
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

/** resolveObserveEntities：执行对应的业务逻辑。 */
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

/** localEntities：定义该变量以承载业务值。 */
  const localEntities = latestEntities
    .filter((entity) => entity.wx === targetX && entity.wy === targetY);
/** hasCrowdEntity：定义该变量以承载业务值。 */
  const hasCrowdEntity = localEntities.some((entity) => isCrowdEntityKind(entity.kind));

  return localEntities
    .filter((entity) => !hasCrowdEntity || entity.kind !== 'player')
    .map((entity) => toObserveEntityCardData(entity));
}

/** buildObservedEntitySectionHtml：执行对应的业务逻辑。 */
function buildObservedEntitySectionHtml(entities: ObserveEntityCardData[]): string {
  return `<section class="observe-modal-section">
    <div class="observe-modal-section-title">角色信息</div>
    ${entities.length > 0
      ? `<div class="observe-entity-list">${entities.map((entity) => buildObservedEntityCardHtml(entity)).join('')}</div>`
      : '<div class="observe-entity-empty">该地块当前没有角色、怪物或 NPC。</div>'}
  </section>`;
}

/** resolveObserveBuffTooltipNode：执行对应的业务逻辑。 */
function resolveObserveBuffTooltipNode(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>('[data-buff-tooltip-title]');
}

/** readObserveBuffTooltipPayload：执行对应的业务逻辑。 */
function readObserveBuffTooltipPayload(node: HTMLElement): { title: string; lines: string[] } {
  return {
    title: node.dataset.buffTooltipTitle ?? '',
    lines: (node.dataset.buffTooltipDetail ?? '').split('\n').filter(Boolean),
  };
}

/** bindObserveBuffTooltips：执行对应的业务逻辑。 */
function bindObserveBuffTooltips(root: HTMLElement): void {
  if (observeBuffTooltipDelegatedBound) {
    return;
  }
  observeBuffTooltipDelegatedBound = true;

  root.addEventListener('click', (event) => {
/** node：定义该变量以承载业务值。 */
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
/** node：定义该变量以承载业务值。 */
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node) {
      return;
    }
/** relatedTarget：定义该变量以承载业务值。 */
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
/** node：定义该变量以承载业务值。 */
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
/** node：定义该变量以承载业务值。 */
    const node = resolveObserveBuffTooltipNode(event.target);
    if (!node) {
      return;
    }
/** relatedTarget：定义该变量以承载业务值。 */
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

/** renderObserveModal：执行对应的业务逻辑。 */
function renderObserveModal(targetX: number, targetY: number): void {
/** tile：定义该变量以承载业务值。 */
  const tile = getVisibleTileAt(targetX, targetY);
  if (!tile) {
    showToast('只能观察当前视野内的格子');
    return;
  }

/** groundPile：定义该变量以承载业务值。 */
  const groundPile = getVisibleGroundPileAt(targetX, targetY);
/** sortedEntities：定义该变量以承载业务值。 */
  const sortedEntities = [...resolveObserveEntities(targetX, targetY)].sort((left, right) => {
/** order：定义该变量以承载业务值。 */
    const order = (kind?: string): number => (kind === 'crowd' ? 0 : kind === 'player' ? 1 : kind === 'container' ? 2 : kind === 'npc' ? 3 : kind === 'monster' ? 4 : 5);
    return order(left.kind) - order(right.kind);
  });
/** terrainRows：定义该变量以承载业务值。 */
  const terrainRows = [
    { label: '地貌', value: getTileTypeName(tile.type) },
    { label: '是否可通行', value: tile.walkable ? '可通行' : '不可通行' },
    { label: '行走消耗', value: formatTraversalCost(tile) },
    { label: '是否阻挡视线', value: tile.blocksSight ? '会阻挡' : '不会阻挡' },
  ];
  if (typeof tile.hp === 'number' && typeof tile.maxHp === 'number') {
    terrainRows.push({
/** label：定义该变量以承载业务值。 */
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
/** groundHtml：定义该变量以承载业务值。 */
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

/** showObserveModal：执行对应的业务逻辑。 */
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
    socket.sendStopLootHarvest();
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

/** requestRedeemCodes：执行对应的业务逻辑。 */
function requestRedeemCodes(codes: string[]): Promise<AccountRedeemCodesRes> {
  if (!socket.connected) {
    return Promise.reject(new Error('当前连接不可用，请稍后重试'));
  }
  if (pendingRedeemCodesRequest) {
    return Promise.reject(new Error('已有兑换请求正在处理中'));
  }
  return new Promise<AccountRedeemCodesRes>((resolve, reject) => {
/** timeoutId：定义该变量以承载业务值。 */
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

/** applyZoomChange：执行对应的业务逻辑。 */
function applyZoomChange(nextZoom: number): number {
/** previous：定义该变量以承载业务值。 */
  const previous = getZoom();
/** zoom：定义该变量以承载业务值。 */
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
/** zoom：定义该变量以承载业务值。 */
  const zoom = applyZoomChange(Number(zoomSlider.value));
  showToast(`缩放已调整为 ${formatZoom(zoom)}x`);
});
zoomResetBtn?.addEventListener('click', () => {
/** zoom：定义该变量以承载业务值。 */
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
/** nextRealm：定义该变量以承载业务值。 */
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
/** mergedInventory：定义该变量以承载业务值。 */
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
/** mergedEquipment：定义该变量以承载业务值。 */
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
/** mergedTechniques：定义该变量以承载业务值。 */
  const mergedTechniques = resolvePreviewTechniques(
    mergeTechniqueStates(data.techniques, data.removeTechniqueIds ?? []),
  );
/** nextCultivatingTechId：定义该变量以承载业务值。 */
  const nextCultivatingTechId = data.cultivatingTechId === undefined
    ? myPlayer?.cultivatingTechId
    : data.cultivatingTechId ?? undefined;
/** nextBodyTraining：定义该变量以承载业务值。 */
  const nextBodyTraining = data.bodyTraining === undefined
    ? myPlayer?.bodyTraining
    : data.bodyTraining ?? undefined;
/** shouldRefreshTechniquePanel：定义该变量以承载业务值。 */
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
/** mergedActions：定义该变量以承载业务值。 */
  const mergedActions = mergeActionStates(data.actions, data.removeActionIds ?? [], data.actionOrder);
/** previousActions：定义该变量以承载业务值。 */
  const previousActions = myPlayer?.actions ?? [];
/** previousAutoBattle：定义该变量以承载业务值。 */
  const previousAutoBattle = myPlayer?.autoBattle ?? false;
/** previousAutoBattleTargetingMode：定义该变量以承载业务值。 */
  const previousAutoBattleTargetingMode = myPlayer?.autoBattleTargetingMode ?? 'auto';
/** previousAutoRetaliate：定义该变量以承载业务值。 */
  const previousAutoRetaliate = myPlayer?.autoRetaliate ?? true;
/** previousAutoBattleStationary：定义该变量以承载业务值。 */
  const previousAutoBattleStationary = myPlayer?.autoBattleStationary ?? false;
/** previousAllowAoePlayerHit：定义该变量以承载业务值。 */
  const previousAllowAoePlayerHit = myPlayer?.allowAoePlayerHit ?? false;
/** previousCombatTargetingRules：定义该变量以承载业务值。 */
  const previousCombatTargetingRules = myPlayer?.combatTargetingRules;
/** previousRetaliatePlayerTargetId：定义该变量以承载业务值。 */
  const previousRetaliatePlayerTargetId = myPlayer?.retaliatePlayerTargetId ?? null;
/** previousAutoIdleCultivation：定义该变量以承载业务值。 */
  const previousAutoIdleCultivation = myPlayer?.autoIdleCultivation ?? true;
/** previousAutoSwitchCultivation：定义该变量以承载业务值。 */
  const previousAutoSwitchCultivation = myPlayer?.autoSwitchCultivation ?? false;
/** previousCultivationActive：定义该变量以承载业务值。 */
  const previousCultivationActive = myPlayer?.cultivationActive ?? false;
/** nextAutoBattle：定义该变量以承载业务值。 */
  const nextAutoBattle = data.autoBattle ?? myPlayer?.autoBattle ?? false;
/** nextAutoUsePills：定义该变量以承载业务值。 */
  const nextAutoUsePills = data.autoUsePills ?? myPlayer?.autoUsePills ?? [];
/** nextCombatTargetingRules：定义该变量以承载业务值。 */
  const nextCombatTargetingRules = data.combatTargetingRules ?? myPlayer?.combatTargetingRules;
/** nextAutoBattleTargetingMode：定义该变量以承载业务值。 */
  const nextAutoBattleTargetingMode = data.autoBattleTargetingMode ?? myPlayer?.autoBattleTargetingMode ?? 'auto';
/** nextRetaliatePlayerTargetId：定义该变量以承载业务值。 */
  const nextRetaliatePlayerTargetId = data.retaliatePlayerTargetId ?? myPlayer?.retaliatePlayerTargetId ?? null;
/** nextAutoRetaliate：定义该变量以承载业务值。 */
  const nextAutoRetaliate = data.autoRetaliate ?? myPlayer?.autoRetaliate ?? true;
/** nextAutoBattleStationary：定义该变量以承载业务值。 */
  const nextAutoBattleStationary = data.autoBattleStationary ?? myPlayer?.autoBattleStationary ?? false;
/** nextAllowAoePlayerHit：定义该变量以承载业务值。 */
  const nextAllowAoePlayerHit = data.allowAoePlayerHit ?? myPlayer?.allowAoePlayerHit ?? false;
/** nextAutoIdleCultivation：定义该变量以承载业务值。 */
  const nextAutoIdleCultivation = data.autoIdleCultivation ?? myPlayer?.autoIdleCultivation ?? true;
/** nextAutoSwitchCultivation：定义该变量以承载业务值。 */
  const nextAutoSwitchCultivation = data.autoSwitchCultivation ?? myPlayer?.autoSwitchCultivation ?? false;
/** nextCultivationActive：定义该变量以承载业务值。 */
  const nextCultivationActive = data.cultivationActive ?? myPlayer?.cultivationActive ?? false;
/** nextSenseQiActive：定义该变量以承载业务值。 */
  const nextSenseQiActive = data.senseQiActive ?? myPlayer?.senseQiActive ?? false;
/** shouldRefreshActionPanel：定义该变量以承载业务值。 */
  const shouldRefreshActionPanel = !myPlayer
    || previousAutoBattle !== nextAutoBattle
    || previousAutoBattleTargetingMode !== nextAutoBattleTargetingMode
    || previousAutoRetaliate !== nextAutoRetaliate
    || previousAutoBattleStationary !== nextAutoBattleStationary
    || previousAllowAoePlayerHit !== nextAllowAoePlayerHit
    || !isPlainEqual(previousCombatTargetingRules ?? null, nextCombatTargetingRules ?? null)
    || previousRetaliatePlayerTargetId !== nextRetaliatePlayerTargetId
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
/** enabled：定义该变量以承载业务值。 */
        enabled: action.autoBattleEnabled !== false,
/** skillEnabled：定义该变量以承载业务值。 */
        skillEnabled: action.skillEnabled !== false,
      }));
    myPlayer.autoBattle = data.autoBattle ?? myPlayer.autoBattle;
    myPlayer.autoUsePills = nextAutoUsePills;
    myPlayer.combatTargetingRules = nextCombatTargetingRules;
    myPlayer.autoBattleTargetingMode = nextAutoBattleTargetingMode;
    myPlayer.retaliatePlayerTargetId = nextRetaliatePlayerTargetId ?? undefined;
    myPlayer.autoRetaliate = data.autoRetaliate ?? (myPlayer.autoRetaliate !== false);
    myPlayer.autoBattleStationary = nextAutoBattleStationary;
    myPlayer.allowAoePlayerHit = nextAllowAoePlayerHit;
    myPlayer.autoIdleCultivation = nextAutoIdleCultivation;
    myPlayer.autoSwitchCultivation = nextAutoSwitchCultivation;
    myPlayer.cultivationActive = nextCultivationActive;
    myPlayer.senseQiActive = nextSenseQiActive;
  }
  latestEntities = decorateObservedEntitiesForDisplay(latestEntities);
  latestEntityMap = new Map(latestEntities.map((entity) => [entity.id, entity]));
  mapRuntime.replaceVisibleEntities(latestEntities);
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
/** hydratedQuests：定义该变量以承载业务值。 */
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
/** label：定义该变量以承载业务值。 */
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
/** restored：定义该变量以承载业务值。 */
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
/** showToast：处理当前场景中的对应操作。 */
  showToast(`连接失败: ${message}`);
});
socket.onDisconnect((reason) => {
  if (reason === 'io client disconnect') return;
  if (pendingRedeemCodesRequest) {
/** pending：定义该变量以承载业务值。 */
    const pending = pendingRedeemCodesRequest;
    pendingRedeemCodesRequest = null;
    window.clearTimeout(pending.timeoutId);
    pending.reject(new Error('连接已断开，兑换结果未返回'));
  }
  clearPendingSocketPing();
/** renderPingLatency：处理当前场景中的对应操作。 */
  renderPingLatency(null, navigator.onLine ? '重连' : '断网');
  panelSystem.store.setRuntime({ connected: false });
  if (myPlayer) {
    showToast('连接已断开，正在尝试恢复');
  }
/** scheduleConnectionRecovery：处理当前场景中的对应操作。 */
  scheduleConnectionRecovery(document.visibilityState === 'visible' ? 300 : 0);
});
socket.onPong((data) => {
  if (!pendingSocketPing || data.clientAt !== pendingSocketPing.clientAt) {
    return;
  }
  window.clearTimeout(pendingSocketPing.timeoutId);
  pendingSocketPing = null;
/** latencyMs：定义该变量以承载业务值。 */
  const latencyMs = performance.now() - data.clientAt;
  if (latencyMs > 999 && hasRecentTickStall()) {
    renderPingLatency(null, '阻塞');
    return;
  }
  renderPingLatency(latencyMs);
});

/** pathCells：定义该变量以承载业务值。 */
let pathCells: { x: number; y: number }[] = [];
/** pathTarget：定义该变量以承载业务值。 */
let pathTarget: { x: number; y: number } | null = null;

/** myPlayer：定义该变量以承载业务值。 */
let myPlayer: PlayerState | null = null;
/** currentTimeState：定义该变量以承载业务值。 */
let currentTimeState: GameTimeState | null = null;
/** latestAttrUpdate：定义该变量以承载业务值。 */
let latestAttrUpdate: S2C_AttrUpdate | null = null;
/** latestTechniqueMap：定义该变量以承载业务值。 */
let latestTechniqueMap = new Map<string, TechniqueState>();
/** latestActionMap：定义该变量以承载业务值。 */
let latestActionMap = new Map<string, ActionDef>();
/** latestEntities：定义该变量以承载业务值。 */
let latestEntities: ObservedEntity[] = [];
/** latestEntityMap：定义该变量以承载业务值。 */
let latestEntityMap = new Map<string, ObservedEntity>();
/** pendingLayoutViewportSync：定义该变量以承载业务值。 */
let pendingLayoutViewportSync = false;
/** pendingAutoInteraction：定义该变量以承载业务值。 */
let pendingAutoInteraction: PendingAutoInteraction | null = null;

/** showToast：执行对应的业务逻辑。 */
function showToast(message: string, kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' = 'system') {
/** el：定义该变量以承载业务值。 */
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast-kind-${kind}`;
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.add('show');
/** durationMs：定义该变量以承载业务值。 */
  const durationMs = kind === 'quest' || kind === 'grudge' ? 4200 : 2500;
  window.setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, durationMs);
}

/** handleQqGroupLinkClick：执行对应的业务逻辑。 */
async function handleQqGroupLinkClick(): Promise<void> {
/** copied：定义该变量以承载业务值。 */
  const copied = await copyTextToClipboard(QQ_GROUP_NUMBER);
/** qqScheme：定义该变量以承载业务值。 */
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

/** resolveQqGroupLink：执行对应的业务逻辑。 */
function resolveQqGroupLink(): string {
/** ua：定义该变量以承载业务值。 */
  const ua = navigator.userAgent.toLowerCase();
/** isMobile：定义该变量以承载业务值。 */
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return isMobile ? QQ_GROUP_MOBILE_DEEP_LINK : QQ_GROUP_DESKTOP_DEEP_LINK;
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

/** formatZoom：执行对应的业务逻辑。 */
function formatZoom(zoom: number): string {
  return zoom.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/** refreshZoomChrome：执行对应的业务逻辑。 */
function refreshZoomChrome(zoom = getZoom()) {
  if (zoomSlider) {
    zoomSlider.value = zoom.toFixed(2);
  }
  if (zoomLevelEl) {
/** prefixEl：定义该变量以承载业务值。 */
    let prefixEl = zoomLevelEl.children.item(0);
    if (!(prefixEl instanceof HTMLSpanElement)) {
      prefixEl = document.createElement('span');
      zoomLevelEl.prepend(prefixEl);
    }
    if (prefixEl.textContent !== 'x') {
      prefixEl.textContent = 'x';
    }
/** valueEl：定义该变量以承载业务值。 */
    let valueEl = zoomLevelEl.children.item(1);
    if (!(valueEl instanceof HTMLSpanElement)) {
      valueEl = document.createElement('span');
      zoomLevelEl.append(valueEl);
    }
/** zoomText：定义该变量以承载业务值。 */
    const zoomText = formatZoom(zoom);
    if (valueEl.textContent !== zoomText) {
      valueEl.textContent = zoomText;
    }
    while (zoomLevelEl.children.length > 2) {
      zoomLevelEl.lastElementChild?.remove();
    }
  }
}

/** refreshZoomViewport：执行对应的业务逻辑。 */
function refreshZoomViewport() {
  resizeCanvas();
  mapRuntime.setZoom(getZoom());
}

/** haveActionRenderStructureChanges：执行对应的业务逻辑。 */
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

/** haveTechniqueStructureChanges：执行对应的业务逻辑。 */
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

/** resolveMapDanger：执行对应的业务逻辑。 */
function resolveMapDanger(): string {
/** fallback：定义该变量以承载业务值。 */
  const fallback = myPlayer ? MAP_FALLBACK[myPlayer.mapId] : undefined;
  if (!myPlayer) {
    return '未知';
  }
  return assessMapDanger(myPlayer, mapRuntime.getMapMeta()?.recommendedRealm, fallback?.recommendedRealm).dangerLabel;
}

/** resolveRealmLabel：执行对应的业务逻辑。 */
function resolveRealmLabel(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
/** top：定义该变量以承载业务值。 */
  const top = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!top) return '凡俗武者';
/** labels：定义该变量以承载业务值。 */
  const labels: Record<TechniqueRealm, string> = {
    [TechniqueRealm.Entry]: '武学入门',
    [TechniqueRealm.Minor]: '后天圆熟',
    [TechniqueRealm.Major]: '先天凝意',
    [TechniqueRealm.Perfection]: '半步修真',
  };
  return labels[top.realm] ?? '修行中';
}

/** resolveTitleLabel：执行对应的业务逻辑。 */
function resolveTitleLabel(player: PlayerState): string {
  if (player.realm?.path === 'immortal') {
    return player.realm.shortName === '筑基' ? '云游真修' : '初登仙门';
  }
/** top：定义该变量以承载业务值。 */
  const top = [...player.techniques].sort((a, b) => b.level - a.level)[0];
  if (!top) return '无名后学';
  if (top.realm >= TechniqueRealm.Perfection) return '名动一方';
  if (top.realm >= TechniqueRealm.Major) return '先天气成';
  if (top.realm >= TechniqueRealm.Minor) return '游历武者';
  return '见习弟子';
}

/** refreshUiChrome：执行对应的业务逻辑。 */
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

/** refreshHudChrome：执行对应的业务逻辑。 */
function refreshHudChrome() {
  if (!myPlayer) return;
/** heavenGateAction：定义该变量以承载业务值。 */
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

/** hasSelectionWithin：执行对应的业务逻辑。 */
function hasSelectionWithin(root: HTMLElement | null): boolean {
  if (!root) return false;
/** selection：定义该变量以承载业务值。 */
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
/** anchor：定义该变量以承载业务值。 */
  const anchor = selection.anchorNode;
/** focus：定义该变量以承载业务值。 */
  const focus = selection.focusNode;
  return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
}

/** shouldPauseWorldPanelRefresh：执行对应的业务逻辑。 */
function shouldPauseWorldPanelRefresh(): boolean {
  return hasSelectionWithin(document.getElementById('layout-center'));
}

/** getInfoRadius：执行对应的业务逻辑。 */
function getInfoRadius(): number {
/** baseViewRange：定义该变量以承载业务值。 */
  const baseViewRange = Math.max(1, Math.round(myPlayer?.viewRange ?? VIEW_RADIUS));
  if (currentTimeState) {
    return Math.max(1, Math.ceil(baseViewRange * currentTimeState.visionMultiplier));
  }
  return baseViewRange;
}

/** scheduleLayoutViewportSync：执行对应的业务逻辑。 */
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

/** clearCurrentPath：执行对应的业务逻辑。 */
function clearCurrentPath() {
  pathCells = [];
  pathTarget = null;
  pendingAutoInteraction = null;
  mapRuntime.setPathCells(pathCells);
}

/** sendMoveCommand：执行对应的业务逻辑。 */
function sendMoveCommand(dir: Direction) {
  if (!myPlayer) return;
  clearCurrentPath();
  myPlayer.facing = dir;
  socket.sendMove(dir);
}

/** planPathTo：执行对应的业务逻辑。 */
function planPathTo(
/** target：定义该变量以承载业务值。 */
  target: { x: number; y: number },
  options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean; preserveAutoInteraction?: boolean },
) {
  if (!myPlayer) return;
  if (!options?.preserveAutoInteraction) {
    pendingAutoInteraction = null;
  }
  pathTarget = target;
/** preview：定义该变量以承载业务值。 */
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

/** isCellInsideCurrentMap：执行对应的业务逻辑。 */
function isCellInsideCurrentMap(x: number, y: number): boolean {
/** mapMeta：定义该变量以承载业务值。 */
  const mapMeta = mapRuntime.getMapMeta();
  return Boolean(mapMeta && x >= 0 && x < mapMeta.width && y >= 0 && y < mapMeta.height);
}

/** isCellAvailableForAutoApproach：执行对应的业务逻辑。 */
function isCellAvailableForAutoApproach(x: number, y: number): boolean {
  if (!myPlayer || !isCellInsideCurrentMap(x, y)) {
    return false;
  }
/** mapMeta：定义该变量以承载业务值。 */
  const mapMeta = mapRuntime.getMapMeta();
/** tile：定义该变量以承载业务值。 */
  const tile = getKnownTileAt(x, y);
  if (!tile?.walkable) {
    return false;
  }
  return !isVisibleBlockingEntityAt(x, y, { allowSelf: true, mapMeta });
}

/** findObservedEntityAt：执行对应的业务逻辑。 */
function findObservedEntityAt(x: number, y: number, kind?: string): ObservedEntity | null {
/** entity：定义该变量以承载业务值。 */
  const entity = latestEntities.find((entry) => (
    entry.wx === x
    && entry.wy === y
    && (kind ? entry.kind === kind : true)
  ));
  return entity ?? null;
}

/** isPathPreviewBlockingEntity：执行对应的业务逻辑。 */
function isPathPreviewBlockingEntity(entity: ObservedEntity): boolean {
  return entity.kind === 'player' || entity.kind === 'monster' || entity.kind === 'npc';
}

/** createPlayerOverlapPointKeySet：执行对应的业务逻辑。 */
function createPlayerOverlapPointKeySet(mapMeta: MapMeta | null): ReadonlySet<string> {
  return new Set((mapMeta?.playerOverlapPoints ?? []).map((point) => `${point.x},${point.y}`));
}

/** isVisibleBlockingEntityAt：执行对应的业务逻辑。 */
function isVisibleBlockingEntityAt(
  x: number,
  y: number,
  options?: { allowSelf?: boolean; mapMeta?: MapMeta | null; playerOverlapPointKeys?: ReadonlySet<string> },
): boolean {
/** overlapPointKeys：定义该变量以承载业务值。 */
  const overlapPointKeys = options?.playerOverlapPointKeys
    ?? createPlayerOverlapPointKeySet(options?.mapMeta ?? mapRuntime.getMapMeta());
/** supportsPlayerOverlap：定义该变量以承载业务值。 */
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

/** resolveNpcApproachTarget：执行对应的业务逻辑。 */
function resolveNpcApproachTarget(npc: ObservedEntity): { x: number; y: number } | null {
  if (!myPlayer) {
    return null;
  }

/** bestCandidate：定义该变量以承载业务值。 */
  let bestCandidate: { x: number; y: number; pathLength: number; distance: number } | null = null;

  for (const step of AUTO_INTERACTION_APPROACH_STEPS) {
    const candidateX = npc.wx + step.dx;
    const candidateY = npc.wy + step.dy;
    if (!isCellAvailableForAutoApproach(candidateX, candidateY)) {
      continue;
    }

/** previewPath：定义该变量以承载业务值。 */
    const previewPath = buildClientPreviewPath(myPlayer.x, myPlayer.y, candidateX, candidateY);
    if (!previewPath && (myPlayer.x !== candidateX || myPlayer.y !== candidateY)) {
      continue;
    }

/** pathLength：定义该变量以承载业务值。 */
    const pathLength = previewPath?.cells.length ?? 0;
/** distance：定义该变量以承载业务值。 */
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

/** triggerAutoInteractionIfReady：执行对应的业务逻辑。 */
function triggerAutoInteractionIfReady(): boolean {
  if (!myPlayer || !pendingAutoInteraction || pendingAutoInteraction.mapId !== myPlayer.mapId) {
    pendingAutoInteraction = null;
    return false;
  }

  if (pendingAutoInteraction.kind === 'portal') {
    if (myPlayer.x !== pendingAutoInteraction.x || myPlayer.y !== pendingAutoInteraction.y) {
      return false;
    }
/** actionId：定义该变量以承载业务值。 */
    const actionId = pendingAutoInteraction.actionId;
    clearCurrentPath();
    socket.sendAction(actionId);
    return true;
  }

/** npc：定义该变量以承载业务值。 */
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

/** handleNpcClickTarget：执行对应的业务逻辑。 */
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

/** approachTarget：定义该变量以承载业务值。 */
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
/** planPathTo：处理当前场景中的对应操作。 */
  planPathTo(approachTarget, { allowNearestReachable: true, preserveAutoInteraction: true });
  return true;
}

/** handlePortalClickTarget：执行对应的业务逻辑。 */
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
/** planPathTo：处理当前场景中的对应操作。 */
  planPathTo({ x: target.x, y: target.y }, { preserveAutoInteraction: true });
  return true;
}

/** buildClientPreviewPath：执行对应的业务逻辑。 */
function buildClientPreviewPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): { cells: { x: number; y: number }[]; directions: Direction[] } | null {
/** mapMeta：定义该变量以承载业务值。 */
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
/** playerOverlapPointKeys：定义该变量以承载业务值。 */
  const playerOverlapPointKeys = createPlayerOverlapPointKeySet(mapMeta);

/** visibleBlockingPositions：定义该变量以承载业务值。 */
  const visibleBlockingPositions = new Set(
    latestEntities
      .filter((entity) => isPathPreviewBlockingEntity(entity) && !(entity.kind === 'player' && entity.id === myPlayer?.id))
      .filter((entity) => entity.kind !== 'player' || !playerOverlapPointKeys.has(`${entity.wx},${entity.wy}`))
      .map((entity) => `${entity.wx},${entity.wy}`),
  );

/** tiles：定义该变量以承载业务值。 */
  const tiles: Tile[][] = [];
  for (let y = 0; y < mapMeta.height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapMeta.width; x++) {
      const tile = getKnownTileAt(x, y);
      const baseTile = tile ?? ({
        type: TileType.Wall,
        walkable: false,
      } as Tile);
/** occupiedByVisibleEntity：定义该变量以承载业务值。 */
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

/** previewDirections：定义该变量以承载业务值。 */
  const previewDirections = findPath(tiles, startX, startY, targetX, targetY);
  if (!previewDirections) {
    return null;
  }

/** previewCells：定义该变量以承载业务值。 */
  const previewCells: { x: number; y: number }[] = [];
/** currentX：定义该变量以承载业务值。 */
  let currentX = startX;
/** currentY：定义该变量以承载业务值。 */
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

/** resetGameState：执行对应的业务逻辑。 */
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

/** applyLocalDisplayName：执行对应的业务逻辑。 */
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

/** applyLocalRoleName：执行对应的业务逻辑。 */
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
/** syncChatLogbookVisibility：执行对应的业务逻辑。 */
function syncChatLogbookVisibility(): void {
/** logbookPane：定义该变量以承载业务值。 */
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

/** resizeCanvas：执行对应的业务逻辑。 */
function resizeCanvas() {
/** cssWidth：定义该变量以承载业务值。 */
  const cssWidth = Math.max(1, canvasHost.clientWidth);
/** cssHeight：定义该变量以承载业务值。 */
  const cssHeight = Math.max(1, canvasHost.clientHeight);
/** rect：定义该变量以承载业务值。 */
  const rect = canvasHost.getBoundingClientRect();
/** viewportScale：定义该变量以承载业务值。 */
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
/** clickedMonster：定义该变量以承载业务值。 */
    const clickedMonster = findObservedEntityAt(target.x, target.y, 'monster');
/** clickedNpc：定义该变量以承载业务值。 */
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
/** geometry：定义该变量以承载业务值。 */
      const geometry = getEffectiveTargetingGeometry(pendingTargetedAction);
      if (!myPlayer || !isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: target.x, y: target.y }, geometry.range)) {
        showToast(`超出施法范围，最多 ${geometry.range} 格`);
        return;
      }
      if (!hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
        showToast('该位置范围内没有可命中的目标或可受影响的地块');
        return;
      }
/** targetRef：定义该变量以承载业务值。 */
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
/** knownTile：定义该变量以承载业务值。 */
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

/** entities：定义该变量以承载业务值。 */
  const entities = decorateObservedEntitiesForDisplay(getLatestObservedEntitiesSnapshot() as ObservedEntity[]);
  latestTechniqueMap = new Map((myPlayer.techniques ?? []).map((technique) => [technique.techId, cloneJson(technique)]));
  latestActionMap = new Map((myPlayer.actions ?? []).map((action) => [action.id, cloneJson(action)]));
  latestEntities = entities;
  latestEntityMap = new Map(entities.map((entity) => [entity.id, entity]));
  mapRuntime.replaceVisibleEntities(latestEntities);

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
/** pending：定义该变量以承载业务值。 */
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
/** mapChanged：定义该变量以承载业务值。 */
  let mapChanged = false;
/** previousMapId：定义该变量以承载业务值。 */
  const previousMapId = myPlayer.mapId;
  syncAuraLevelBaseValue(data.auraLevelBaseValue);
  syncCurrentTimeTickInterval(data.dt);
  if (data.time) {
    syncCurrentTimeState(data.time);
  }

  if (data.dt) {
    if (tickRateEl) {
/** seconds：定义该变量以承载业务值。 */
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

/** oldX：定义该变量以承载业务值。 */
  const oldX = myPlayer.x;
/** oldY：定义该变量以承载业务值。 */
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

/** moved：定义该变量以承载业务值。 */
  const moved = !mapChanged && (myPlayer.x !== oldX || myPlayer.y !== oldY);

/** entities：定义该变量以承载业务值。 */
  const entities = decorateObservedEntitiesForDisplay(getLatestObservedEntitiesSnapshot() as ObservedEntity[]);
  latestEntities = entities;
  latestEntityMap = new Map(entities.map((entity) => [entity.id, entity]));
  mapRuntime.replaceVisibleEntities(latestEntities);
  syncTargetingOverlay();
  refreshHudChrome();

/** autoInteractionTriggered：定义该变量以承载业务值。 */
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
