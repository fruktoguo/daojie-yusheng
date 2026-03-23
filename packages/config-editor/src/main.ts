import { type BasicOkRes } from '@mud/shared';
import { GmMapEditor } from '../../client/src/gm-map-editor';

type PageId = 'maps' | 'files' | 'service';

type LocalConfigFileSummary = {
  path: string;
  name: string;
  category: string;
};

type LocalConfigFileListRes = {
  files: LocalConfigFileSummary[];
};

type LocalConfigFileRes = {
  path: string;
  content: string;
};

type LocalServerStatusRes = {
  running: boolean;
  pid?: number;
  lastRestartAt?: string;
  lastRestartReason?: string;
  mode: string;
};

type MapSideTabId = 'overview' | 'inspector' | 'json';

const appStatusBarEl = document.getElementById('app-status-bar') as HTMLDivElement;
const serviceSummaryEl = document.getElementById('service-summary') as HTMLDivElement;

const pageMap = {
  maps: document.getElementById('page-maps') as HTMLElement,
  files: document.getElementById('page-files') as HTMLElement,
  service: document.getElementById('page-service') as HTMLElement,
};

const pageTabs = {
  maps: document.getElementById('page-tab-maps') as HTMLButtonElement,
  files: document.getElementById('page-tab-files') as HTMLButtonElement,
  service: document.getElementById('page-tab-service') as HTMLButtonElement,
};

const mapSideTabs = {
  overview: document.getElementById('map-side-tab-overview') as HTMLButtonElement,
  inspector: document.getElementById('map-side-tab-inspector') as HTMLButtonElement,
  json: document.getElementById('map-side-tab-json') as HTMLButtonElement,
};

const mapSidePanels = {
  overview: document.getElementById('map-side-panel-overview') as HTMLDivElement,
  inspector: document.getElementById('map-side-panel-inspector') as HTMLDivElement,
  json: document.getElementById('map-side-panel-json') as HTMLDivElement,
};

const configFileSearchEl = document.getElementById('config-file-search') as HTMLInputElement;
const configFileRefreshBtn = document.getElementById('config-file-refresh') as HTMLButtonElement;
const configFileListEl = document.getElementById('config-file-list') as HTMLDivElement;
const configFileEmptyEl = document.getElementById('config-file-empty') as HTMLDivElement;
const configFilePanelEl = document.getElementById('config-file-panel') as HTMLDivElement;
const configFileCurrentNameEl = document.getElementById('config-file-current-name') as HTMLDivElement;
const configFileCurrentMetaEl = document.getElementById('config-file-current-meta') as HTMLDivElement;
const configFileEditorEl = document.getElementById('config-file-editor') as HTMLTextAreaElement;
const configFileSaveBtn = document.getElementById('config-file-save') as HTMLButtonElement;
const configFileReloadBtn = document.getElementById('config-file-reload') as HTMLButtonElement;
const configFileStatusEl = document.getElementById('config-file-status') as HTMLDivElement;

const serviceRunningValueEl = document.getElementById('service-running-value') as HTMLDivElement;
const serviceRunningMetaEl = document.getElementById('service-running-meta') as HTMLDivElement;
const serviceModeEl = document.getElementById('service-mode') as HTMLDivElement;
const serviceLastRestartAtEl = document.getElementById('service-last-restart-at') as HTMLDivElement;
const serviceLastRestartReasonEl = document.getElementById('service-last-restart-reason') as HTMLDivElement;
const servicePidEl = document.getElementById('service-pid') as HTMLDivElement;
const serviceRestartBtn = document.getElementById('service-restart') as HTMLButtonElement;
const serviceRefreshBtn = document.getElementById('service-refresh') as HTMLButtonElement;

let currentPage: PageId = 'maps';
let currentMapSideTab: MapSideTabId = 'overview';
let configFiles: LocalConfigFileSummary[] = [];
let currentConfigFilePath: string | null = null;
let configFileDirty = false;
let servicePollTimer: number | null = null;
let mapEditor: GmMapEditor | null = null;

function setAppStatus(message: string, isError = false): void {
  appStatusBarEl.textContent = message;
  appStatusBarEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

function setConfigFileStatus(message: string, isError = false): void {
  configFileStatusEl.textContent = message;
  configFileStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      const text = await response.text();
      if (text.trim()) {
        message = text.trim();
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function switchPage(page: PageId): void {
  currentPage = page;
  (Object.keys(pageMap) as PageId[]).forEach((key) => {
    pageMap[key].classList.toggle('hidden', key !== page);
    pageTabs[key].classList.toggle('active', key === page);
  });
}

function switchMapSideTab(tab: MapSideTabId): void {
  currentMapSideTab = tab;
  (Object.keys(mapSideTabs) as MapSideTabId[]).forEach((key) => {
    mapSideTabs[key].classList.toggle('active', key === tab);
    mapSidePanels[key].classList.toggle('hidden', key !== tab);
  });
  if (!mapEditor) return;
  if (tab === 'inspector' || tab === 'json') {
    mapEditor.forceTool('select');
    return;
  }
  mapEditor.clearForcedTool();
}

function renderConfigFileList(): void {
  const keyword = configFileSearchEl.value.trim().toLowerCase();
  const filtered = configFiles.filter((file) => {
    if (!keyword) return true;
    return file.path.toLowerCase().includes(keyword) || file.name.toLowerCase().includes(keyword);
  });

  if (filtered.length === 0) {
    configFileListEl.innerHTML = '<div class="empty-hint">没有符合条件的配置文件。</div>';
    return;
  }

  configFileListEl.innerHTML = filtered.map((file) => `
    <button class="config-file-row ${file.path === currentConfigFilePath ? 'active' : ''}" data-config-path="${escapeHtml(file.path)}" type="button">
      <div class="config-file-name">${escapeHtml(file.name)}</div>
      <div class="config-file-meta">${escapeHtml(file.category)} · ${escapeHtml(file.path)}</div>
    </button>
  `).join('');
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadConfigFileList(): Promise<void> {
  const result = await request<LocalConfigFileListRes>('/api/config-files');
  configFiles = result.files;
  renderConfigFileList();
  if (!currentConfigFilePath && configFiles.length > 0) {
    await selectConfigFile(configFiles[0]!.path, false);
  }
}

async function selectConfigFile(filePath: string, announce = true): Promise<void> {
  if (configFileDirty && currentConfigFilePath && currentConfigFilePath !== filePath) {
    const proceed = window.confirm('当前配置文件有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

  const file = await request<LocalConfigFileRes>(`/api/config-file?path=${encodeURIComponent(filePath)}`);
  currentConfigFilePath = file.path;
  configFileEditorEl.value = file.content;
  configFileDirty = false;
  configFileEmptyEl.classList.add('hidden');
  configFilePanelEl.classList.remove('hidden');
  configFileCurrentNameEl.textContent = file.path.split('/').pop() ?? file.path;
  configFileCurrentMetaEl.textContent = file.path;
  setConfigFileStatus(announce ? `已载入配置文件 ${file.path}` : '');
  renderConfigFileList();
}

async function saveConfigFile(): Promise<void> {
  if (!currentConfigFilePath) {
    setConfigFileStatus('请先选择一个配置文件', true);
    return;
  }

  try {
    JSON.parse(configFileEditorEl.value);
  } catch {
    setConfigFileStatus('配置文件不是合法 JSON', true);
    return;
  }

  configFileSaveBtn.disabled = true;
  try {
    await request<BasicOkRes>('/api/config-file', {
      method: 'PUT',
      body: JSON.stringify({
        path: currentConfigFilePath,
        content: configFileEditorEl.value,
      }),
    });
    configFileDirty = false;
    setConfigFileStatus(`已保存配置文件 ${currentConfigFilePath}`);
    setAppStatus(`已写回 ${currentConfigFilePath}，本地服务将自动重启`);
    await refreshServiceStatus();
  } catch (error) {
    setConfigFileStatus(error instanceof Error ? error.message : '保存配置文件失败', true);
  } finally {
    configFileSaveBtn.disabled = false;
  }
}

function renderServiceStatus(status: LocalServerStatusRes): void {
  serviceSummaryEl.textContent = status.running
    ? `本地服务运行中 · PID ${status.pid ?? '-'}`
    : '本地服务当前未运行';
  serviceRunningValueEl.textContent = status.running ? '运行中' : '未运行';
  serviceRunningMetaEl.textContent = status.running
    ? `当前进程 PID: ${status.pid ?? '-'}`
    : '若服务刚重启，状态会在几秒内恢复。';
  serviceModeEl.textContent = status.mode;
  serviceLastRestartAtEl.textContent = status.lastRestartAt ? new Date(status.lastRestartAt).toLocaleString() : '-';
  serviceLastRestartReasonEl.textContent = status.lastRestartReason ?? '-';
  servicePidEl.textContent = status.pid ? String(status.pid) : '-';
}

async function refreshServiceStatus(): Promise<void> {
  try {
    const status = await request<LocalServerStatusRes>('/api/server/status');
    renderServiceStatus(status);
  } catch (error) {
    setAppStatus(error instanceof Error ? error.message : '读取服务状态失败', true);
  }
}

async function restartService(): Promise<void> {
  serviceRestartBtn.disabled = true;
  try {
    await request<BasicOkRes>('/api/server/restart', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setAppStatus('已触发本地服务重启');
    await refreshServiceStatus();
  } catch (error) {
    setAppStatus(error instanceof Error ? error.message : '重启服务失败', true);
  } finally {
    serviceRestartBtn.disabled = false;
  }
}

function bindEvents(): void {
  pageTabs.maps.addEventListener('click', () => switchPage('maps'));
  pageTabs.files.addEventListener('click', () => switchPage('files'));
  pageTabs.service.addEventListener('click', () => switchPage('service'));

  mapSideTabs.overview.addEventListener('click', () => switchMapSideTab('overview'));
  mapSideTabs.inspector.addEventListener('click', () => switchMapSideTab('inspector'));
  mapSideTabs.json.addEventListener('click', () => switchMapSideTab('json'));

  configFileSearchEl.addEventListener('input', () => renderConfigFileList());
  configFileRefreshBtn.addEventListener('click', () => {
    loadConfigFileList().catch((error: unknown) => {
      setConfigFileStatus(error instanceof Error ? error.message : '加载配置文件列表失败', true);
    });
  });
  configFileListEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-config-path]');
    const filePath = button?.dataset.configPath;
    if (!filePath) return;
    selectConfigFile(filePath).catch((error: unknown) => {
      setConfigFileStatus(error instanceof Error ? error.message : '读取配置文件失败', true);
    });
  });
  configFileEditorEl.addEventListener('input', () => {
    configFileDirty = true;
  });
  configFileSaveBtn.addEventListener('click', () => {
    saveConfigFile().catch(() => {});
  });
  configFileReloadBtn.addEventListener('click', () => {
    if (!currentConfigFilePath) return;
    selectConfigFile(currentConfigFilePath).catch((error: unknown) => {
      setConfigFileStatus(error instanceof Error ? error.message : '重新读取配置文件失败', true);
    });
  });
  serviceRestartBtn.addEventListener('click', () => {
    restartService().catch(() => {});
  });
  serviceRefreshBtn.addEventListener('click', () => {
    refreshServiceStatus().catch(() => {});
  });
}

async function bootstrap(): Promise<void> {
  bindEvents();
  const nextMapEditor = new GmMapEditor(request, setAppStatus, {
    mapApiBasePath: '/api/maps',
    syncedSummaryLabel: '已与本地文件同步',
  });
  mapEditor = nextMapEditor;
  switchMapSideTab(currentMapSideTab);

  await Promise.all([
    nextMapEditor.ensureLoaded(),
    loadConfigFileList(),
    refreshServiceStatus(),
  ]);

  servicePollTimer = window.setInterval(() => {
    refreshServiceStatus().catch(() => {});
  }, 3000);
}

bootstrap().catch((error: unknown) => {
  setAppStatus(error instanceof Error ? error.message : '本地配置编辑器初始化失败', true);
});

window.addEventListener('beforeunload', () => {
  if (servicePollTimer !== null) {
    window.clearInterval(servicePollTimer);
  }
});
