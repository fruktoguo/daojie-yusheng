/**
 * GM 管理后台前端 —— 登录鉴权、角色列表/编辑器、机器人管理、地图编辑器、建议反馈
 */

import {
  type BasicOkRes,
  Direction,
  type GmChangePasswordReq,
  TechniqueRealm,
  type AttrKey,
  type AutoBattleSkillConfig,
  type EquipmentSlots,
  type GmNetworkBucket,
  type GmManagedPlayerSummary,
  type GmPlayerDetailRes,
  type GmLoginReq,
  type GmLoginRes,
  type GmManagedPlayerRecord,
  type GmRemoveBotsReq,
  type GmSpawnBotsReq,
  type GmStateRes,
  type GmUpdatePlayerReq,
  type ItemStack,
  type PlayerState,
  type QuestState,
  type Suggestion,
  type TechniqueState,
  type TemporaryBuffState,
} from '@mud/shared';
import { GmMapEditor } from './gm-map-editor';
import { GmWorldViewer } from './gm-world-viewer';

const TOKEN_KEY = 'mud:gm-access-token';
const POLL_INTERVAL_MS = 5000;
const APPLY_DELAY_MS = 1200;

const ATTR_KEYS: AttrKey[] = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'];
const ATTR_LABELS: Record<AttrKey, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};
const EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'] as const;
const EQUIP_SLOT_LABELS: Record<(typeof EQUIP_SLOTS)[number], string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};
const ITEM_TYPES = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'] as const;
const QUEST_LINES = ['main', 'side', 'daily', 'encounter'] as const;
const QUEST_STATUSES = ['available', 'active', 'ready', 'completed'] as const;
const QUEST_OBJECTIVE_TYPES = ['kill', 'learn_technique', 'realm_progress', 'realm_stage'] as const;
const FACING_OPTIONS = [
  { value: Direction.North, label: '北' },
  { value: Direction.South, label: '南' },
  { value: Direction.East, label: '东' },
  { value: Direction.West, label: '西' },
];
const TECHNIQUE_REALM_OPTIONS = [
  { value: TechniqueRealm.Entry, label: '入门' },
  { value: TechniqueRealm.Minor, label: '小成' },
  { value: TechniqueRealm.Major, label: '大成' },
  { value: TechniqueRealm.Perfection, label: '圆满' },
];
const TECHNIQUE_GRADE_OPTIONS = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'] as const;

const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
const loginForm = document.getElementById('gm-login-form') as HTMLFormElement;
const passwordInput = document.getElementById('gm-password') as HTMLInputElement;
const loginSubmitBtn = document.getElementById('login-submit') as HTMLButtonElement;
const loginErrorEl = document.getElementById('login-error') as HTMLDivElement;
const statusBarEl = document.getElementById('status-bar') as HTMLDivElement;
const playerSearchInput = document.getElementById('player-search') as HTMLInputElement;
const playerListEl = document.getElementById('player-list') as HTMLDivElement;
const spawnCountInput = document.getElementById('spawn-count') as HTMLInputElement;
const editorEmptyEl = document.getElementById('editor-empty') as HTMLDivElement;
const editorPanelEl = document.getElementById('editor-panel') as HTMLDivElement;
const editorTitleEl = document.getElementById('editor-title') as HTMLDivElement;
const editorSubtitleEl = document.getElementById('editor-subtitle') as HTMLDivElement;
const editorMetaEl = document.getElementById('editor-meta') as HTMLDivElement;
const editorContentEl = document.getElementById('editor-content') as HTMLDivElement;
const playerJsonEl = document.getElementById('player-json') as HTMLTextAreaElement;
const playerPersistedJsonEl = document.getElementById('player-persisted-json') as HTMLTextAreaElement;
const applyRawJsonBtn = document.getElementById('apply-raw-json') as HTMLButtonElement;
const jsonViewRuntimeBtn = document.getElementById('json-view-runtime') as HTMLButtonElement;
const jsonViewPersistedBtn = document.getElementById('json-view-persisted') as HTMLButtonElement;
const runtimeJsonPanelEl = document.getElementById('runtime-json-panel') as HTMLDivElement;
const persistedJsonPanelEl = document.getElementById('persisted-json-panel') as HTMLDivElement;
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;

const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
const summaryOfflineHangingEl = document.getElementById('summary-offline-hanging') as HTMLDivElement;
const summaryOfflineEl = document.getElementById('summary-offline') as HTMLDivElement;
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;
const summaryNetInEl = document.getElementById('summary-net-in') as HTMLDivElement;
const summaryNetOutEl = document.getElementById('summary-net-out') as HTMLDivElement;
const summaryNetInBreakdownEl = document.getElementById('summary-net-in-breakdown') as HTMLDivElement;
const summaryNetOutBreakdownEl = document.getElementById('summary-net-out-breakdown') as HTMLDivElement;
const serverSubtabOverviewBtn = document.getElementById('server-subtab-overview') as HTMLButtonElement;
const serverSubtabTrafficBtn = document.getElementById('server-subtab-traffic') as HTMLButtonElement;
const serverSubtabCpuBtn = document.getElementById('server-subtab-cpu') as HTMLButtonElement;
const serverPanelOverviewEl = document.getElementById('server-panel-overview') as HTMLElement;
const serverPanelTrafficEl = document.getElementById('server-panel-traffic') as HTMLElement;
const serverPanelCpuEl = document.getElementById('server-panel-cpu') as HTMLElement;
const trafficResetMetaEl = document.getElementById('traffic-reset-meta') as HTMLDivElement;
const trafficTotalInEl = document.getElementById('traffic-total-in') as HTMLDivElement;
const trafficTotalInNoteEl = document.getElementById('traffic-total-in-note') as HTMLDivElement;
const trafficTotalOutEl = document.getElementById('traffic-total-out') as HTMLDivElement;
const trafficTotalOutNoteEl = document.getElementById('traffic-total-out-note') as HTMLDivElement;
const resetNetworkStatsBtn = document.getElementById('reset-network-stats') as HTMLButtonElement;
const cpuCurrentPercentEl = document.getElementById('cpu-current-percent') as HTMLDivElement;
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
const cpuBreakdownListEl = document.getElementById('cpu-breakdown-list') as HTMLDivElement;
const cpuBreakdownSortTotalBtn = document.getElementById('cpu-breakdown-sort-total') as HTMLButtonElement;
const cpuBreakdownSortCountBtn = document.getElementById('cpu-breakdown-sort-count') as HTMLButtonElement;
const cpuBreakdownSortAvgBtn = document.getElementById('cpu-breakdown-sort-avg') as HTMLButtonElement;
const gmPasswordForm = document.getElementById('gm-password-form') as HTMLFormElement;
const gmPasswordCurrentInput = document.getElementById('gm-password-current') as HTMLInputElement;
const gmPasswordNextInput = document.getElementById('gm-password-next') as HTMLInputElement;
const gmPasswordSaveBtn = document.getElementById('gm-password-save') as HTMLButtonElement;
const playerWorkspaceEl = document.getElementById('player-workspace') as HTMLElement;
const mapWorkspaceEl = document.getElementById('map-workspace') as HTMLElement;
const suggestionWorkspaceEl = document.getElementById('suggestion-workspace') as HTMLElement;
const serverWorkspaceEl = document.getElementById('server-workspace') as HTMLElement;
const worldWorkspaceEl = document.getElementById('world-workspace') as HTMLElement;
const serverTabBtn = document.getElementById('gm-tab-server') as HTMLButtonElement;
const playerTabBtn = document.getElementById('gm-tab-players') as HTMLButtonElement;
const mapTabBtn = document.getElementById('gm-tab-maps') as HTMLButtonElement;
const suggestionTabBtn = document.getElementById('gm-tab-suggestions') as HTMLButtonElement;
const worldTabBtn = document.getElementById('gm-tab-world') as HTMLButtonElement;
const suggestionListEl = document.getElementById('gm-suggestion-list') as HTMLElement;

let token = sessionStorage.getItem(TOKEN_KEY) ?? '';
let state: GmStateRes | null = null;
let suggestions: Suggestion[] = [];
let selectedPlayerId: string | null = null;
let selectedPlayerDetail: GmManagedPlayerRecord | null = null;
let loadingPlayerDetailId: string | null = null;
let detailRequestNonce = 0;
let draftSnapshot: PlayerState | null = null;
let editorDirty = false;
let draftSourcePlayerId: string | null = null;
let pollTimer: number | null = null;
let currentTab: 'server' | 'players' | 'maps' | 'suggestions' | 'world' = 'server';
let currentServerTab: 'overview' | 'traffic' | 'cpu' = 'overview';
let currentCpuBreakdownSort: 'total' | 'count' | 'avg' = 'total';
let currentJsonView: 'runtime' | 'persisted' = 'runtime';

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

function renderNetworkBucketList(
  totalBytes: number,
  buckets: GmNetworkBucket[],
  elapsedSec: number,
  emptyText: string,
): string {
  if (buckets.length === 0 || totalBytes <= 0) {
    return `<div class="empty-hint">${escapeHtml(emptyText)}</div>`;
  }

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

  return visibleBuckets.map((bucket) => `
    <div class="network-row">
      <div class="network-row-main">
        <div class="network-row-label">${escapeHtml(bucket.label)}</div>
        <div class="network-row-meta">${formatBytes(bucket.bytes)} · ${formatPercent(bucket.bytes, totalBytes)} · ${bucket.count} 次 · 均次 ${formatAverageBytesPerEvent(bucket.bytes, bucket.count)} · 均秒 ${formatBytesPerSecond(bucket.bytes, elapsedSec)}</div>
      </div>
    </div>
  `).join('');
}

function renderCpuBreakdownList(data: GmStateRes): string {
  const sections = [...data.perf.cpu.breakdown];
  if (sections.length === 0) {
    return '<div class="empty-hint">当前还没有 CPU 分项数据。</div>';
  }

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

  return sections.slice(0, 12).map((section) => `
    <div class="network-row">
      <div class="network-row-main">
        <div class="network-row-label">${escapeHtml(section.label)}</div>
        <div class="network-row-meta">${section.totalMs.toFixed(2)} ms · ${section.percent.toFixed(1)}% · ${section.count} 次 · 均次 ${section.avgMs.toFixed(3)} ms</div>
      </div>
    </div>
  `).join('');
}

function switchJsonView(view: 'runtime' | 'persisted'): void {
  currentJsonView = view;
  jsonViewRuntimeBtn.classList.toggle('primary', view === 'runtime');
  jsonViewPersistedBtn.classList.toggle('primary', view === 'persisted');
  runtimeJsonPanelEl.classList.toggle('hidden', view !== 'runtime');
  persistedJsonPanelEl.classList.toggle('hidden', view !== 'persisted');
}

function setStatus(message: string, isError = false): void {
  statusBarEl.textContent = message;
  statusBarEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
}

const mapEditor = new GmMapEditor(request, setStatus);
const worldViewer = new GmWorldViewer(request, setStatus);

function switchServerTab(tab: 'overview' | 'traffic' | 'cpu'): void {
  currentServerTab = tab;
  serverSubtabOverviewBtn.classList.toggle('active', tab === 'overview');
  serverSubtabTrafficBtn.classList.toggle('active', tab === 'traffic');
  serverSubtabCpuBtn.classList.toggle('active', tab === 'cpu');
  serverPanelOverviewEl.classList.toggle('hidden', tab !== 'overview');
  serverPanelTrafficEl.classList.toggle('hidden', tab !== 'traffic');
  serverPanelCpuEl.classList.toggle('hidden', tab !== 'cpu');
}

function setCpuBreakdownSort(sort: 'total' | 'count' | 'avg'): void {
  currentCpuBreakdownSort = sort;
  cpuBreakdownSortTotalBtn.classList.toggle('primary', sort === 'total');
  cpuBreakdownSortCountBtn.classList.toggle('primary', sort === 'count');
  cpuBreakdownSortAvgBtn.classList.toggle('primary', sort === 'avg');
  if (state) {
    cpuBreakdownListEl.innerHTML = renderCpuBreakdownList(state);
  }
}

function switchTab(tab: 'server' | 'players' | 'maps' | 'suggestions' | 'world'): void {
  // 离开世界管理时停止轮询
  if (currentTab === 'world' && tab !== 'world') {
    worldViewer.stopPolling();
  }
  currentTab = tab;
  serverTabBtn.classList.toggle('active', tab === 'server');
  playerTabBtn.classList.toggle('active', tab === 'players');
  worldTabBtn.classList.toggle('active', tab === 'world');
  mapTabBtn.classList.toggle('active', tab === 'maps');
  suggestionTabBtn.classList.toggle('active', tab === 'suggestions');
  serverWorkspaceEl.classList.toggle('hidden', tab !== 'server');
  playerWorkspaceEl.classList.toggle('hidden', tab !== 'players');
  worldWorkspaceEl.classList.toggle('hidden', tab !== 'world');
  mapWorkspaceEl.classList.toggle('hidden', tab !== 'maps');
  suggestionWorkspaceEl.classList.toggle('hidden', tab !== 'suggestions');
  if (tab === 'maps') {
    mapEditor.ensureLoaded().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '加载地图编辑器失败', true);
    });
  } else if (tab === 'suggestions') {
    loadSuggestions().catch(() => {});
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
    suggestions = await request<Suggestion[]>('/gm/suggestions');
    renderSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '加载建议失败', true);
  }
}

function renderSuggestions(): void {
  if (!suggestions || suggestions.length === 0) {
    suggestionListEl.innerHTML = '<div class="empty-hint">暂无建议反馈数据</div>';
    return;
  }

  const sorted = [...suggestions].sort((a, b) => {
    const scoreA = a.upvotes.length - a.downvotes.length;
    const scoreB = b.upvotes.length - b.downvotes.length;
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    return scoreB - scoreA;
  });

  suggestionListEl.innerHTML = sorted.map(s => `
    <div class="suggestion-card" style="border: 1.5px solid var(--ink-black); margin-bottom: 20px; background: var(--paper-bg); box-shadow: 6px 6px 0 rgba(0,0,0,0.1);">
      <div style="padding: 16px; border-bottom: 1.5px solid var(--ink-black); display: flex; justify-content: space-between; align-items: center; background: ${s.status === 'completed' ? '#e8f5e9' : 'transparent'}">
        <div>
          <span style="font-family: var(--font-heading-main); font-size: 20px;">${escapeHtml(s.title)}</span>
          <span class="pill" style="margin-left: 10px; background: ${s.status === 'completed' ? '#2e7d32' : 'var(--ink-grey)'}">${s.status === 'completed' ? '已完成' : '待处理'}</span>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: bold;">${escapeHtml(s.authorName)}</div>
          <div style="font-size: 12px; color: var(--ink-grey);">${new Date(s.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <div style="padding: 16px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; border-bottom: 1.5px solid var(--ink-black);">${escapeHtml(s.description)}</div>
      <div style="padding: 12px 16px; display: flex; align-items: center; gap: 20px;">
        <div style="font-weight: bold; color: var(--ink-black);">赞同: ${s.upvotes.length} | 反对: ${s.downvotes.length} | 分值: ${s.upvotes.length - s.downvotes.length}</div>
        <div style="margin-left: auto; display: flex; gap: 10px;">
          ${s.status === 'pending' ? `<button class="primary small-btn" onclick="completeSuggestion('${s.id}')">标记完成</button>` : ''}
          <button class="danger small-btn" onclick="removeSuggestion('${s.id}')">永久移除</button>
        </div>
      </div>
    </div>
  `).join('');
}

(window as any).completeSuggestion = async (id: string) => {
  try {
    await request(`/gm/suggestions/${id}/complete`, { method: 'POST' });
    setStatus('建议已标记为完成');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '操作失败', true);
  }
};

(window as any).removeSuggestion = async (id: string) => {
  if (!confirm('确定要移除这条建议吗？此操作不可撤销。')) return;
  try {
    await request(`/gm/suggestions/${id}`, { method: 'DELETE' });
    setStatus('建议已成功移除');
    await loadSuggestions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除失败', true);
  }
};

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

  if (response.status === 401) {
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
    equipSlot: equipSlot as ItemStack['equipSlot'],
    equipAttrs: equipSlot ? {} : undefined,
    equipStats: equipSlot ? {} : undefined,
  };
}

function createDefaultTechnique(): TechniqueState {
  return {
    techId: '',
    name: '',
    level: 1,
    exp: 0,
    expToNext: 0,
    realm: TechniqueRealm.Entry,
    skills: [],
    grade: 'mortal',
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
    attrs: {},
    stats: {},
  };
}

function createDefaultPlayerSnapshot(source?: PlayerState): PlayerState {
  if (source) return clone(source);
  return {
    id: '',
    name: '',
    mapId: 'spawn',
    x: 0,
    y: 0,
    facing: Direction.South,
    viewRange: 8,
    hp: 1,
    maxHp: 1,
    qi: 0,
    dead: false,
    baseAttrs: {
      constitution: 1,
      spirit: 1,
      perception: 1,
      talent: 1,
      comprehension: 1,
      luck: 1,
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
    autoRetaliate: true,
    autoIdleCultivation: true,
    revealedBreakthroughRequirementIds: [],
  };
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

function readonlyCodeBlock(title: string, value: unknown): string {
  return `
    <div class="editor-field wide">
      <span>${escapeHtml(title)}</span>
      <div class="editor-code">${escapeHtml(formatJson(value))}</div>
    </div>
  `;
}

function renderItemFields(basePath: string, item: ItemStack): string {
  return `
    <div class="editor-grid compact">
      ${textField('物品 ID', `${basePath}.itemId`, item.itemId)}
      ${textField('名称', `${basePath}.name`, item.name)}
      ${selectField('类型', `${basePath}.type`, item.type, ITEM_TYPES.map((value) => ({ value, label: value })))}
      ${numberField('数量', `${basePath}.count`, item.count)}
      ${nullableTextField('装备槽', `${basePath}.equipSlot`, item.equipSlot, 'undefined')}
      ${textField('描述', `${basePath}.desc`, item.desc, 'wide')}
      ${jsonField('装备属性', `${basePath}.equipAttrs`, item.equipAttrs ?? {}, 'object')}
      ${jsonField('装备数值', `${basePath}.equipStats`, item.equipStats ?? {}, 'object')}
    </div>
  `;
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

  const equipmentMarkup = EQUIP_SLOTS.map((slot) => {
    const item = equipment[slot];
    return `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(EQUIP_SLOT_LABELS[slot])}</div>
            <div class="editor-card-meta">${item ? `${item.name || '未命名装备'} · ${item.itemId || '空 ID'}` : '当前为空'}</div>
          </div>
          <div class="button-row">
            ${item
              ? `<button class="small-btn danger" type="button" data-action="clear-equip" data-slot="${slot}">清空槽位</button>`
              : `<button class="small-btn" type="button" data-action="create-equip" data-slot="${slot}">创建装备</button>`}
          </div>
        </div>
        ${item ? renderItemFields(`equipment.${slot}`, item) : '<div class="editor-note">点击“创建装备”后可填写该槽位的详细数据。</div>'}
      </div>
    `;
  }).join('');

  const bonusMarkup = bonuses.length > 0
    ? bonuses.map((bonus, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(bonus.label || bonus.source || `加成 ${index + 1}`)}</div>
            <div class="editor-card-meta">${escapeHtml(bonus.source || '未填写来源')}</div>
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
          <div>
            <div class="editor-card-title">${escapeHtml(buff.name || buff.buffId || `临时效果 ${index + 1}`)}</div>
            <div class="editor-card-meta">${escapeHtml(buff.buffId || '未填写 buffId')} · ${escapeHtml(buff.category)} · ${escapeHtml(buff.visibility)}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-buff" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('Buff ID', `temporaryBuffs.${index}.buffId`, buff.buffId)}
          ${textField('名称', `temporaryBuffs.${index}.name`, buff.name)}
          ${nullableTextField('短标记', `temporaryBuffs.${index}.shortMark`, buff.shortMark, 'undefined')}
          ${selectField('类别', `temporaryBuffs.${index}.category`, buff.category, [{ value: 'buff', label: 'buff' }, { value: 'debuff', label: 'debuff' }])}
          ${selectField('可见性', `temporaryBuffs.${index}.visibility`, buff.visibility, [{ value: 'public', label: 'public' }, { value: 'observe_only', label: 'observe_only' }, { value: 'hidden', label: 'hidden' }])}
          ${numberField('剩余 tick', `temporaryBuffs.${index}.remainingTicks`, buff.remainingTicks)}
          ${numberField('总时长', `temporaryBuffs.${index}.duration`, buff.duration)}
          ${numberField('层数', `temporaryBuffs.${index}.stacks`, buff.stacks)}
          ${numberField('最大层数', `temporaryBuffs.${index}.maxStacks`, buff.maxStacks)}
          ${textField('来源技能 ID', `temporaryBuffs.${index}.sourceSkillId`, buff.sourceSkillId)}
          ${nullableTextField('来源技能名', `temporaryBuffs.${index}.sourceSkillName`, buff.sourceSkillName, 'undefined')}
          ${nullableTextField('颜色', `temporaryBuffs.${index}.color`, buff.color, 'undefined')}
          ${nullableTextField('描述', `temporaryBuffs.${index}.desc`, buff.desc, 'undefined', 'wide')}
          ${jsonField('属性修正', `temporaryBuffs.${index}.attrs`, buff.attrs ?? {}, 'object')}
          ${jsonField('数值修正', `temporaryBuffs.${index}.stats`, buff.stats ?? {}, 'object')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有临时效果。</div>';

  const inventoryMarkup = inventoryItems.length > 0
    ? inventoryItems.map((item, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(item.name || item.itemId || `物品 ${index + 1}`)}</div>
            <div class="editor-card-meta">${escapeHtml(item.itemId || '未填写 ID')} · ${escapeHtml(item.type)} · 数量 ${item.count}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-inventory-item" data-index="${index}">删除</button>
        </div>
        ${renderItemFields(`inventory.items.${index}`, item)}
      </div>
    `).join('')
    : '<div class="editor-note">背包为空。</div>';

  const autoBattleMarkup = autoBattleSkills.length > 0
    ? autoBattleSkills.map((entry, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(entry.skillId || `技能槽 ${index + 1}`)}</div>
            <div class="editor-card-meta">${entry.enabled ? '启用' : '禁用'}</div>
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
            <div class="editor-card-title">${escapeHtml(technique.name || technique.techId || `功法 ${index + 1}`)}</div>
            <div class="editor-card-meta">${escapeHtml(technique.techId || '未填写功法 ID')} · 等级 ${technique.level} · ${TECHNIQUE_REALM_OPTIONS.find((option) => option.value === technique.realm)?.label ?? technique.realm}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-technique" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('功法 ID', `techniques.${index}.techId`, technique.techId)}
          ${textField('名称', `techniques.${index}.name`, technique.name)}
          ${numberField('等级', `techniques.${index}.level`, technique.level)}
          ${numberField('经验', `techniques.${index}.exp`, technique.exp)}
          ${numberField('升级所需经验', `techniques.${index}.expToNext`, technique.expToNext)}
          ${selectField('功法境界', `techniques.${index}.realm`, technique.realm, TECHNIQUE_REALM_OPTIONS)}
          ${nullableTextField('品阶', `techniques.${index}.grade`, technique.grade, 'undefined')}
          ${jsonField('技能列表', `techniques.${index}.skills`, technique.skills ?? [], 'array', 'wide')}
          ${jsonField('层级配置', `techniques.${index}.layers`, technique.layers ?? [], 'array')}
          ${jsonField('属性曲线', `techniques.${index}.attrCurves`, technique.attrCurves ?? {}, 'object')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有已学会功法。</div>';

  const questMarkup = quests.length > 0
    ? quests.map((quest, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${escapeHtml(quest.title || quest.id || `任务 ${index + 1}`)}</div>
            <div class="editor-card-meta">${escapeHtml(quest.id || '未填写任务 ID')} · ${escapeHtml(quest.line)} · ${escapeHtml(quest.status)}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-quest" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${textField('任务 ID', `quests.${index}.id`, quest.id)}
          ${textField('标题', `quests.${index}.title`, quest.title)}
          ${selectField('任务线', `quests.${index}.line`, quest.line, QUEST_LINES.map((value) => ({ value, label: value })))}
          ${selectField('状态', `quests.${index}.status`, quest.status, QUEST_STATUSES.map((value) => ({ value, label: value })))}
          ${selectField('目标类型', `quests.${index}.objectiveType`, quest.objectiveType, QUEST_OBJECTIVE_TYPES.map((value) => ({ value, label: value })))}
          ${nullableTextField('章节', `quests.${index}.chapter`, quest.chapter, 'undefined')}
          ${nullableTextField('剧情段落', `quests.${index}.story`, quest.story, 'undefined')}
          ${numberField('当前进度', `quests.${index}.progress`, quest.progress)}
          ${numberField('需求进度', `quests.${index}.required`, quest.required)}
          ${textField('目标名称', `quests.${index}.targetName`, quest.targetName)}
          ${nullableTextField('目标文本', `quests.${index}.objectiveText`, quest.objectiveText, 'undefined', 'wide')}
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
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">基础资料</div>
          <div class="editor-section-note">人物本体、坐标、资源与运行时开关。</div>
        </div>
        <div class="editor-chip-list">
          <span class="pill ${player.meta.online ? 'online' : 'offline'}">${player.meta.online ? '在线' : '离线'}</span>
          <span class="pill ${player.meta.isBot ? 'bot' : ''}">${player.meta.isBot ? '机器人' : '玩家'}</span>
          ${editorDirty ? '<span class="pill">有未保存修改</span>' : ''}
        </div>
      </div>
      <div class="editor-grid">
        ${textField('角色名', 'name', draft.name)}
        ${textField('角色 ID', 'id', draft.id)}
        ${nullableTextField('战斗目标 ID', 'combatTargetId', draft.combatTargetId, 'undefined')}
        ${selectField('地图', 'mapId', draft.mapId, mapIds.map((mapId) => ({ value: mapId, label: mapId })))}
        ${numberField('X', 'x', draft.x)}
        ${numberField('Y', 'y', draft.y)}
        ${selectField('朝向', 'facing', draft.facing, FACING_OPTIONS)}
        ${numberField('视野', 'viewRange', draft.viewRange)}
        ${nullableTextField('主修功法 ID', 'cultivatingTechId', draft.cultivatingTechId, 'undefined')}
        ${numberField('HP', 'hp', draft.hp)}
        ${numberField('最大 HP', 'maxHp', draft.maxHp)}
        ${numberField('QI', 'qi', draft.qi)}
        ${numberField('境界等级', 'realmLv', typeof draft.realmLv === 'number' ? draft.realmLv : 0)}
        ${nullableTextField('境界名', 'realmName', draft.realmName, 'undefined')}
        ${nullableTextField('境界阶段标签', 'realmStage', draft.realmStage, 'undefined')}
        ${nullableTextField('境界评语', 'realmReview', draft.realmReview, 'undefined', 'wide')}
      </div>
      <div class="editor-toggle-row" style="margin-top: 10px;">
        ${checkboxField('机器人', 'isBot', draft.isBot)}
        ${checkboxField('死亡', 'dead', draft.dead)}
        ${checkboxField('自动战斗', 'autoBattle', draft.autoBattle)}
        ${checkboxField('自动反击', 'autoRetaliate', draft.autoRetaliate !== false)}
        ${checkboxField('锁定战斗目标', 'combatTargetLocked', draft.combatTargetLocked)}
        ${checkboxField('可突破', 'breakthroughReady', draft.breakthroughReady)}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">基础属性</div>
          <div class="editor-section-note">六维基础属性与突破线索。</div>
        </div>
      </div>
      <div class="editor-stat-grid">
        ${ATTR_KEYS.map((key) => numberField(ATTR_LABELS[key], `baseAttrs.${key}`, draft.baseAttrs[key])).join('')}
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        ${stringArrayField('已揭示突破条件 ID', 'revealedBreakthroughRequirementIds', draft.revealedBreakthroughRequirementIds, 'wide')}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">属性加成与临时效果</div>
          <div class="editor-section-note">适合直接调试被动、装备外加成与 Buff。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-bonus">新增加成</button>
          <button class="small-btn" type="button" data-action="add-buff">新增临时效果</button>
        </div>
      </div>
      <div class="editor-card-list">${bonusMarkup}</div>
      <div class="editor-card-list" style="margin-top: 10px;">${buffMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">自动战斗</div>
          <div class="editor-section-note">编辑自动技能列表。</div>
        </div>
        <button class="small-btn" type="button" data-action="add-auto-skill">新增自动技能</button>
      </div>
      <div class="editor-card-list">${autoBattleMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">背包</div>
          <div class="editor-section-note">容量与物品堆叠。</div>
        </div>
        <div class="button-row">
          ${numberField('容量', 'inventory.capacity', draft.inventory.capacity)}
          <button class="small-btn" type="button" data-action="add-inventory-item">新增物品</button>
        </div>
      </div>
      <div class="editor-card-list">${inventoryMarkup}</div>
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

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">功法</div>
          <div class="editor-section-note">等级、经验、技能与层级结构。</div>
        </div>
        <button class="small-btn" type="button" data-action="add-technique">新增功法</button>
      </div>
      <div class="editor-card-list">${techniqueMarkup}</div>
    </section>

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

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">派生只读快照</div>
          <div class="editor-section-note">这些通常由服务端重算，不建议直接改。若确实需要，去高级 JSON 区导入。</div>
        </div>
      </div>
      <div class="editor-grid compact">
        ${readonlyCodeBlock('最终属性', draft.finalAttrs ?? {})}
        ${readonlyCodeBlock('数值属性', draft.numericStats ?? {})}
        ${readonlyCodeBlock('比率分母', draft.ratioDivisors ?? {})}
        ${readonlyCodeBlock('境界状态', draft.realm ?? {})}
        ${readonlyCodeBlock('动作列表', draft.actions ?? [])}
      </div>
    </section>
  `;
}

function renderSummary(data: GmStateRes): void {
  const humanPlayers = data.players.filter((player) => !player.meta.isBot);
  const onlineCount = humanPlayers.filter((player) => player.meta.online).length;
  const offlineHangingCount = humanPlayers.filter((player) => !player.meta.online && player.meta.inWorld).length;
  const offlineCount = humanPlayers.filter((player) => !player.meta.online && !player.meta.inWorld).length;
  const elapsedSec = Math.max(0, data.perf.networkStatsElapsedSec);
  const startedAt = data.perf.networkStatsStartedAt > 0 ? new Date(data.perf.networkStatsStartedAt) : null;
  summaryTotalEl.textContent = `${humanPlayers.length}`;
  summaryOnlineEl.textContent = `${onlineCount}`;
  summaryOfflineHangingEl.textContent = `${offlineHangingCount}`;
  summaryOfflineEl.textContent = `${offlineCount}`;
  summaryBotsEl.textContent = `${data.botCount}`;
  summaryTickEl.textContent = `${Math.round(data.perf.tickMs)} ms`;
  summaryCpuEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  summaryMemoryEl.textContent = `${Math.round(data.perf.memoryMb)} MB`;
  summaryNetInEl.textContent = formatBytes(data.perf.networkInBytes);
  summaryNetOutEl.textContent = formatBytes(data.perf.networkOutBytes);
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
  summaryNetInBreakdownEl.innerHTML = renderNetworkBucketList(
    data.perf.networkInBytes,
    data.perf.networkInBuckets,
    elapsedSec,
    '当前还没有累计上行事件。',
  );
  summaryNetOutBreakdownEl.innerHTML = renderNetworkBucketList(
    data.perf.networkOutBytes,
    data.perf.networkOutBuckets,
    elapsedSec,
    '当前还没有累计下行事件。',
  );
  cpuCurrentPercentEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
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
  cpuBreakdownListEl.innerHTML = renderCpuBreakdownList(data);
}

function renderPlayerList(data: GmStateRes): void {
  const keyword = playerSearchInput.value.trim().toLowerCase();
  const filtered = data.players.filter((player) => {
    if (!keyword) return true;
    return [player.id, player.name, player.mapId, player.meta.userId ?? '']
      .some((value) => value.toLowerCase().includes(keyword));
  });

  if (!selectedPlayerId || !filtered.some((player) => player.id === selectedPlayerId)) {
    selectedPlayerId = filtered[0]?.id ?? data.players[0]?.id ?? null;
  }

  if (filtered.length === 0) {
    playerListEl.innerHTML = '<div class="empty-hint">没有符合筛选条件的角色。</div>';
    return;
  }

  playerListEl.innerHTML = filtered.map((player) => `
    <button class="player-row ${player.id === selectedPlayerId ? 'active' : ''}" data-player-id="${escapeHtml(player.id)}" type="button">
      <div class="player-top">
        <div class="player-name">${escapeHtml(player.name)}</div>
        <div class="pill ${getPlayerPresenceMeta(player).className}">${getPlayerPresenceMeta(player).label}</div>
      </div>
      <div class="player-meta">${player.meta.isBot ? '机器人' : '玩家'} · ${escapeHtml(player.mapId)} · (${player.x}, ${player.y})</div>
      <div class="player-subline">ID: ${escapeHtml(player.id)}${player.meta.userId ? ` · 用户: ${escapeHtml(player.meta.userId)}` : ''}</div>
      <div class="player-subline">HP ${player.hp}/${player.maxHp} · QI ${player.qi} · ${player.dead ? '已死亡' : '存活'} · ${player.autoBattle ? '自动战斗开' : '自动战斗关'}</div>
    </button>
  `).join('');
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
    return;
  }

  const detail = getSelectedPlayerDetail();
  if (!detail) {
    editorEmptyEl.classList.remove('hidden');
    editorEmptyEl.textContent = loadingPlayerDetailId === selected.id ? '正在加载角色详情…' : '当前角色详情暂不可用。';
    editorPanelEl.classList.add('hidden');
    playerJsonEl.value = '';
    playerPersistedJsonEl.value = '';
    return;
  }

  if (!draftSnapshot || draftSourcePlayerId !== detail.id || !editorDirty) {
    draftSnapshot = createDefaultPlayerSnapshot(detail.snapshot);
    draftSourcePlayerId = detail.id;
    editorDirty = false;
  }

  editorEmptyEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');

  editorTitleEl.textContent = detail.name;
  editorSubtitleEl.textContent = [
    `角色 ID: ${detail.id}`,
    detail.meta.userId ? `用户 ID: ${detail.meta.userId}` : '用户 ID: 无',
    `地图: ${detail.mapId} (${detail.x}, ${detail.y})`,
    detail.meta.updatedAt ? `最近落盘: ${new Date(detail.meta.updatedAt).toLocaleString('zh-CN')}` : '最近落盘: 运行时角色',
  ].join(' · ');

  const pills: string[] = [
    `<span class="pill ${getPlayerPresenceMeta(detail).className}">${getPlayerPresenceMeta(detail).label}</span>`,
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
  editorMetaEl.innerHTML = pills.join('');

  editorContentEl.innerHTML = renderVisualEditor(detail, draftSnapshot);
  playerJsonEl.value = formatJson(draftSnapshot);
  playerPersistedJsonEl.value = formatJson(detail.persistedSnapshot);

  removeBotBtn.style.display = detail.meta.isBot ? '' : 'none';
  removeBotBtn.disabled = !detail.meta.isBot;
}

function render(): void {
  if (!state) return;
  switchServerTab(currentServerTab);
  setCpuBreakdownSort(currentCpuBreakdownSort);
  renderSummary(state);
  renderPlayerList(state);
  renderEditor(state);
}

function syncVisualEditorToDraft(): { ok: true } | { ok: false; message: string } {
  if (!draftSnapshot) {
    return { ok: false, message: '当前没有可编辑角色' };
  }

  const next = clone(draftSnapshot);
  const fields = editorContentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-bind]');

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
  const synced = syncVisualEditorToDraft();
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
  // 同步地图列表到世界管理
  if (currentTab === 'world') {
    worldViewer.updateMapIds(data.mapIds);
  }
}

async function loadSelectedPlayerDetail(playerId: string, silent = false): Promise<void> {
  const nonce = ++detailRequestNonce;
  loadingPlayerDetailId = playerId;
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
  }, POLL_INTERVAL_MS);
}

function showShell(): void {
  loginOverlay.classList.add('hidden');
  gmShell.classList.remove('hidden');
}

function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  gmShell.classList.add('hidden');
}

function logout(message?: string): void {
  token = '';
  state = null;
  selectedPlayerId = null;
  selectedPlayerDetail = null;
  loadingPlayerDetailId = null;
  draftSnapshot = null;
  editorDirty = false;
  draftSourcePlayerId = null;
  sessionStorage.removeItem(TOKEN_KEY);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  playerListEl.innerHTML = '';
  editorContentEl.innerHTML = '';
  playerJsonEl.value = '';
  playerPersistedJsonEl.value = '';
  mapEditor.reset();
  worldViewer.stopPolling();
  switchTab('server');
  switchJsonView('runtime');
  loginErrorEl.textContent = message ?? '';
  setStatus('');
  showLogin();
}

async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, APPLY_DELAY_MS));
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
    sessionStorage.setItem(TOKEN_KEY, token);
    showShell();
    await loadState();
    startPolling();
    passwordInput.value = '';
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
    gmPasswordCurrentInput.value = '';
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
    renderEditor(state!);
    setStatus('原始 JSON 已应用到可视化编辑区');
  } catch {
    setStatus('原始 JSON 解析失败', true);
  }
}

async function saveSelectedPlayer(): Promise<void> {
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  const synced = syncVisualEditorToDraft();
  if (!synced.ok || !draftSnapshot) {
    setStatus(synced.ok ? '当前没有可保存内容' : synced.message, true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot: draftSnapshot } satisfies GmUpdatePlayerReq),
    });
    editorDirty = false;
    await delayRefresh(`已提交 ${selected.name} 的修改`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '保存失败', true);
  } finally {
    savePlayerBtn.disabled = false;
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

function handleEditorAction(action: string, trigger: HTMLElement): void {
  if (!draftSnapshot) return;

  const index = Number(trigger.dataset.index ?? '-1');
  const slot = trigger.dataset.slot as (typeof EQUIP_SLOTS)[number] | undefined;

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
    case 'remove-inventory-item':
      mutateDraft((draft) => draft.inventory.items.splice(index, 1));
      break;
    case 'create-equip':
      if (!slot) return;
      mutateDraft((draft) => {
        draft.equipment[slot] = createDefaultItem(slot);
      });
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
  handleEditorAction(action, trigger);
});

editorContentEl.addEventListener('change', () => {
  const synced = syncVisualEditorToDraft();
  if (!synced.ok) {
    setStatus(synced.message, true);
    return;
  }
  renderEditor(state!);
});

playerSearchInput.addEventListener('input', () => render());
playerTabBtn.addEventListener('click', () => switchTab('players'));
mapTabBtn.addEventListener('click', () => switchTab('maps'));
suggestionTabBtn.addEventListener('click', () => switchTab('suggestions'));
serverTabBtn.addEventListener('click', () => switchTab('server'));
worldTabBtn.addEventListener('click', () => switchTab('world'));
serverSubtabOverviewBtn.addEventListener('click', () => switchServerTab('overview'));
serverSubtabTrafficBtn.addEventListener('click', () => switchServerTab('traffic'));
serverSubtabCpuBtn.addEventListener('click', () => switchServerTab('cpu'));
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
jsonViewRuntimeBtn.addEventListener('click', () => switchJsonView('runtime'));
jsonViewPersistedBtn.addEventListener('click', () => switchJsonView('persisted'));

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
resetNetworkStatsBtn.addEventListener('click', () => {
  resetNetworkStats().catch(() => {});
});
gmPasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  changeGmPassword().catch(() => {});
});
savePlayerBtn.addEventListener('click', () => {
  saveSelectedPlayer().catch(() => {});
});
resetPlayerBtn.addEventListener('click', () => {
  resetSelectedPlayer().catch(() => {});
});
removeBotBtn.addEventListener('click', () => {
  removeSelectedBot().catch(() => {});
});

if (token) {
  showShell();
  switchTab('server');
  switchServerTab(currentServerTab);
  setCpuBreakdownSort(currentCpuBreakdownSort);
  switchJsonView(currentJsonView);
  loadState()
    .then(() => startPolling())
    .catch(() => logout('GM 登录已失效，请重新输入密码'));
} else {
  showLogin();
}
