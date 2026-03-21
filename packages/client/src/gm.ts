import type {
  GmLoginReq,
  GmLoginRes,
  GmManagedPlayerRecord,
  GmRemoveBotsReq,
  GmSpawnBotsReq,
  GmStateRes,
  GmUpdatePlayerReq,
  PlayerState,
} from '@mud/shared';

const TOKEN_KEY = 'mud:gm-access-token';
const POLL_INTERVAL_MS = 5000;
const APPLY_DELAY_MS = 1200;

const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
const gmShell = document.getElementById('gm-shell') as HTMLDivElement;
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
const playerJsonEl = document.getElementById('player-json') as HTMLTextAreaElement;
const savePlayerBtn = document.getElementById('save-player') as HTMLButtonElement;
const resetPlayerBtn = document.getElementById('reset-player') as HTMLButtonElement;
const removeBotBtn = document.getElementById('remove-bot') as HTMLButtonElement;

const summaryTotalEl = document.getElementById('summary-total') as HTMLDivElement;
const summaryOnlineEl = document.getElementById('summary-online') as HTMLDivElement;
const summaryBotsEl = document.getElementById('summary-bots') as HTMLDivElement;
const summaryTickEl = document.getElementById('summary-tick') as HTMLDivElement;
const summaryCpuEl = document.getElementById('summary-cpu') as HTMLDivElement;
const summaryMemoryEl = document.getElementById('summary-memory') as HTMLDivElement;

let token = sessionStorage.getItem(TOKEN_KEY) ?? '';
let state: GmStateRes | null = null;
let selectedPlayerId: string | null = null;
let editorDirty = false;
let lastEditorPlayerId: string | null = null;
let pollTimer: number | null = null;

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
  const data = text ? JSON.parse(text) as unknown : null;

  if (response.status === 401) {
    logout('GM 登录已失效，请重新输入密码');
    throw new Error('GM 登录已失效');
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as { message: unknown }).message)
      : '请求失败';
    throw new Error(message);
  }
  return data as T;
}

function setStatus(message: string, isError = false): void {
  statusBarEl.textContent = message;
  statusBarEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
}

function getSelectedPlayer(): GmManagedPlayerRecord | null {
  if (!state || !selectedPlayerId) return null;
  return state.players.find((player) => player.id === selectedPlayerId) ?? null;
}

function renderSummary(data: GmStateRes): void {
  const onlineCount = data.players.filter((player) => player.meta.online && !player.meta.isBot).length;
  summaryTotalEl.textContent = `${data.players.filter((player) => !player.meta.isBot).length}`;
  summaryOnlineEl.textContent = `${onlineCount}`;
  summaryBotsEl.textContent = `${data.botCount}`;
  summaryTickEl.textContent = `${Math.round(data.perf.tickMs)} ms`;
  summaryCpuEl.textContent = `${Math.round(data.perf.cpuPercent)}%`;
  summaryMemoryEl.textContent = `${Math.round(data.perf.memoryMb)} MB`;
}

function renderPlayerList(data: GmStateRes): void {
  const keyword = playerSearchInput.value.trim().toLowerCase();
  const filtered = data.players.filter((player) => {
    if (!keyword) return true;
    return [
      player.id,
      player.name,
      player.mapId,
      player.meta.userId ?? '',
    ].some((value) => value.toLowerCase().includes(keyword));
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
        <div class="pill ${player.meta.online ? 'online' : 'offline'}">${player.meta.online ? '在线' : '离线'}</div>
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
    return;
  }

  editorEmptyEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');

  editorTitleEl.textContent = selected.name;
  editorSubtitleEl.textContent = [
    `角色 ID: ${selected.id}`,
    selected.meta.userId ? `用户 ID: ${selected.meta.userId}` : '用户 ID: 无',
    `地图: ${selected.mapId} (${selected.x}, ${selected.y})`,
    selected.meta.updatedAt ? `最近落盘: ${new Date(selected.meta.updatedAt).toLocaleString('zh-CN')}` : '最近落盘: 运行时角色',
  ].join(' · ');

  const pills: string[] = [
    `<span class="pill ${selected.meta.online ? 'online' : 'offline'}">${selected.meta.online ? '在线' : '离线'}</span>`,
    `<span class="pill ${selected.meta.isBot ? 'bot' : ''}">${selected.meta.isBot ? '机器人' : '玩家'}</span>`,
    `<span class="pill">${selected.dead ? '死亡' : '存活'}</span>`,
    `<span class="pill">${selected.autoBattle ? '自动战斗开' : '自动战斗关'}</span>`,
    `<span class="pill">${selected.autoRetaliate ? '自动反击开' : '自动反击关'}</span>`,
  ];
  if (selected.meta.dirtyFlags.length > 0) {
    pills.push(`<span class="pill">脏标记: ${escapeHtml(selected.meta.dirtyFlags.join(', '))}</span>`);
  }
  editorMetaEl.innerHTML = pills.join('');

  if (!editorDirty || lastEditorPlayerId !== selected.id) {
    playerJsonEl.value = JSON.stringify(selected.snapshot, null, 2);
    editorDirty = false;
    lastEditorPlayerId = selected.id;
  }

  removeBotBtn.style.display = selected.meta.isBot ? '' : 'none';
  removeBotBtn.disabled = !selected.meta.isBot;
}

function render(): void {
  if (!state) return;
  renderSummary(state);
  renderPlayerList(state);
  renderEditor(state);
}

async function loadState(silent = false): Promise<void> {
  if (!token) return;
  const data = await request<GmStateRes>('/gm/state');
  state = data;
  render();
  if (!silent) {
    setStatus(`已同步 ${data.players.length} 条角色数据`);
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
  editorDirty = false;
  lastEditorPlayerId = null;
  sessionStorage.removeItem(TOKEN_KEY);
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  playerListEl.innerHTML = '';
  playerJsonEl.value = '';
  loginErrorEl.textContent = message ?? '';
  setStatus('');
  showLogin();
}

async function delayRefresh(message: string): Promise<void> {
  setStatus(message);
  await new Promise((resolve) => window.setTimeout(resolve, APPLY_DELAY_MS));
  await loadState(true);
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

async function saveSelectedPlayer(): Promise<void> {
  const selected = getSelectedPlayer();
  if (!selected) {
    setStatus('请先选择角色', true);
    return;
  }

  let snapshot: PlayerState;
  try {
    snapshot = JSON.parse(playerJsonEl.value) as PlayerState;
  } catch {
    setStatus('JSON 解析失败，请先修正编辑内容', true);
    return;
  }

  savePlayerBtn.disabled = true;
  try {
    await request<{ ok: true }>(`/gm/players/${encodeURIComponent(selected.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ snapshot } satisfies GmUpdatePlayerReq),
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
    await delayRefresh('已提交移除全部机器人');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '移除机器人失败', true);
  }
}

playerListEl.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-id]');
  const playerId = button?.dataset.playerId;
  if (!playerId || playerId === selectedPlayerId) return;
  selectedPlayerId = playerId;
  editorDirty = false;
  render();
});

playerSearchInput.addEventListener('input', () => render());
playerJsonEl.addEventListener('input', () => {
  editorDirty = true;
});
passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    login().catch(() => {});
  }
});

loginSubmitBtn.addEventListener('click', () => {
  login().catch(() => {});
});
document.getElementById('refresh-state')?.addEventListener('click', () => {
  loadState().catch((error: unknown) => {
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
  loadState()
    .then(() => startPolling())
    .catch(() => logout('GM 登录已失效，请重新输入密码'));
} else {
  showLogin();
}
