import {
  ELEMENT_KEYS,
  ELEMENT_KEY_LABELS,
  type BasicOkRes,
  ITEM_TYPE_LABELS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_LABELS,
  resolveMonsterNumericStatsFromValueStats,
  TECHNIQUE_GRADE_LABELS,
  type ElementKey,
  type ItemType,
  type MonsterCombatModel,
  type MonsterAggroMode,
  type NumericScalarStatKey,
  type NumericStats,
  type PartialNumericStats,
  type TechniqueGrade,
} from '@mud/shared';
import { GmMapEditor } from '../../client/src/gm-map-editor';

type PageId = 'maps' | 'monsters' | 'files' | 'service';

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

type MonsterTemplateDrop = {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;
};

type MonsterTemplateRecord = {
  id: string;
  name: string;
  char: string;
  color: string;
  grade: TechniqueGrade;
  valueStats?: PartialNumericStats;
  computedStats: NumericStats;
  combatModel: MonsterCombatModel;
  hp: number;
  maxHp: number;
  attack: number;
  count: number;
  radius: number;
  maxAlive: number;
  aggroRange: number;
  viewRange: number;
  aggroMode: MonsterAggroMode;
  respawnSec: number;
  respawnTicks?: number;
  level?: number;
  expMultiplier: number;
  drops: MonsterTemplateDrop[];
};

type LocalMonsterTemplateEntry = {
  key: string;
  filePath: string;
  index: number;
  monster: MonsterTemplateRecord;
};

type LocalMonsterTemplateListRes = {
  monsters: LocalMonsterTemplateEntry[];
};

type LocalMonsterSaveRes = BasicOkRes & {
  updatedMapCount: number;
  monster: MonsterTemplateRecord;
};

type LocalEditorItemOption = {
  itemId: string;
  name: string;
  type: ItemType;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  desc?: string;
};

type LocalEditorCatalogRes = {
  items: LocalEditorItemOption[];
};

type MapSideTabId = 'overview' | 'inspector' | 'json';

const appStatusBarEl = document.getElementById('app-status-bar') as HTMLDivElement;
const serviceSummaryEl = document.getElementById('service-summary') as HTMLDivElement;

const pageMap = {
  maps: document.getElementById('page-maps') as HTMLElement,
  monsters: document.getElementById('page-monsters') as HTMLElement,
  files: document.getElementById('page-files') as HTMLElement,
  service: document.getElementById('page-service') as HTMLElement,
};

const pageTabs = {
  maps: document.getElementById('page-tab-maps') as HTMLButtonElement,
  monsters: document.getElementById('page-tab-monsters') as HTMLButtonElement,
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

const monsterSearchEl = document.getElementById('monster-search') as HTMLInputElement;
const monsterRefreshBtn = document.getElementById('monster-refresh') as HTMLButtonElement;
const monsterListEl = document.getElementById('monster-list') as HTMLDivElement;
const monsterEmptyEl = document.getElementById('monster-empty') as HTMLDivElement;
const monsterPanelEl = document.getElementById('monster-panel') as HTMLDivElement;
const monsterCurrentNameEl = document.getElementById('monster-current-name') as HTMLDivElement;
const monsterCurrentMetaEl = document.getElementById('monster-current-meta') as HTMLDivElement;
const monsterSaveBtn = document.getElementById('monster-save') as HTMLButtonElement;
const monsterReloadBtn = document.getElementById('monster-reload') as HTMLButtonElement;
const monsterStatusEl = document.getElementById('monster-status') as HTMLDivElement;
const monsterIdEl = document.getElementById('monster-id') as HTMLInputElement;
const monsterNameEl = document.getElementById('monster-name') as HTMLInputElement;
const monsterCharEl = document.getElementById('monster-char') as HTMLInputElement;
const monsterColorEl = document.getElementById('monster-color') as HTMLInputElement;
const monsterGradeEl = document.getElementById('monster-grade') as HTMLSelectElement;
const monsterAggroModeEl = document.getElementById('monster-aggro-mode') as HTMLSelectElement;
const monsterHpEl = document.getElementById('monster-hp') as HTMLInputElement;
const monsterMaxHpEl = document.getElementById('monster-max-hp') as HTMLInputElement;
const monsterAttackEl = document.getElementById('monster-attack') as HTMLInputElement;
const monsterLevelEl = document.getElementById('monster-level') as HTMLInputElement;
const monsterCountEl = document.getElementById('monster-count') as HTMLInputElement;
const monsterMaxAliveEl = document.getElementById('monster-max-alive') as HTMLInputElement;
const monsterRadiusEl = document.getElementById('monster-radius') as HTMLInputElement;
const monsterExpMultiplierEl = document.getElementById('monster-exp-multiplier') as HTMLInputElement;
const monsterAggroRangeEl = document.getElementById('monster-aggro-range') as HTMLInputElement;
const monsterViewRangeEl = document.getElementById('monster-view-range') as HTMLInputElement;
const monsterRespawnSecEl = document.getElementById('monster-respawn-sec') as HTMLInputElement;
const monsterRespawnTicksEl = document.getElementById('monster-respawn-ticks') as HTMLInputElement;
const monsterValueStatsEditorEl = document.getElementById('monster-value-stats-editor') as HTMLDivElement;
const monsterComputedStatsPreviewEl = document.getElementById('monster-computed-stats-preview') as HTMLDivElement;
const monsterDropsEditorEl = document.getElementById('monster-drops-editor') as HTMLDivElement;
const monsterDropAddBtn = document.getElementById('monster-drop-add') as HTMLButtonElement;

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
let monsterTemplates: LocalMonsterTemplateEntry[] = [];
let currentMonsterKey: string | null = null;
let currentMonsterDraft: MonsterTemplateRecord | null = null;
let monsterDirty = false;
let servicePollTimer: number | null = null;
let mapEditor: GmMapEditor | null = null;
let editorItems: LocalEditorItemOption[] = [];

const GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS) as Array<[TechniqueGrade, string]>;
const AGGRO_MODE_OPTIONS: Array<{ value: MonsterAggroMode; label: string }> = [
  { value: 'always', label: '主动攻击' },
  { value: 'retaliate', label: '受击反击' },
  { value: 'day_only', label: '仅白天主动' },
  { value: 'night_only', label: '仅夜晚主动' },
];

const MONSTER_VALUE_STAT_GROUPS: Array<{ title: string; note: string; keys: NumericScalarStatKey[] }> = [
  {
    title: '生存与攻防',
    note: '基础战斗面板，直接决定怪物的血量、攻击、防御和命中闪避。',
    keys: ['maxHp', 'maxQi', 'physAtk', 'spellAtk', 'physDef', 'spellDef', 'hit', 'dodge'],
  },
  {
    title: '暴击与对抗',
    note: '控制暴击强度和破招、化解这类对抗属性。',
    keys: ['crit', 'critDamage', 'breakPower', 'resolvePower'],
  },
  {
    title: '回复与节奏',
    note: '控制回复、冷却、视野和移动等持续战斗表现。',
    keys: ['maxQiOutputPerTick', 'qiRegenRate', 'hpRegenRate', 'cooldownSpeed', 'viewRange', 'moveSpeed'],
  },
  {
    title: '额外倍率',
    note: '保留给特殊怪物使用，通常不用每项都配置。',
    keys: ['auraCostReduce', 'auraPowerRate', 'playerExpRate', 'techniqueExpRate', 'realmExpPerTick', 'lootRate', 'rareLootRate'],
  },
];

const MONSTER_COMPUTED_STAT_GROUPS: Array<{ title: string; keys: NumericScalarStatKey[] }> = [
  ...MONSTER_VALUE_STAT_GROUPS.map((group) => ({ title: group.title, keys: group.keys })),
  {
    title: '其余属性',
    keys: NUMERIC_SCALAR_STAT_KEYS.filter((key) => !MONSTER_VALUE_STAT_GROUPS.some((group) => group.keys.includes(key))),
  },
];

function setAppStatus(message: string, isError = false): void {
  appStatusBarEl.textContent = message;
  appStatusBarEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

function setConfigFileStatus(message: string, isError = false): void {
  configFileStatusEl.textContent = message;
  configFileStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

function setMonsterStatus(message: string, isError = false): void {
  monsterStatusEl.textContent = message;
  monsterStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
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

function populateMonsterStaticOptions(): void {
  monsterGradeEl.innerHTML = GRADE_OPTIONS
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  monsterAggroModeEl.innerHTML = AGGRO_MODE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
}

function renderMonsterList(): void {
  const keyword = monsterSearchEl.value.trim().toLowerCase();
  const filtered = monsterTemplates.filter((entry) => {
    if (!keyword) return true;
    return entry.monster.name.toLowerCase().includes(keyword)
      || entry.monster.id.toLowerCase().includes(keyword)
      || entry.filePath.toLowerCase().includes(keyword);
  });

  if (filtered.length === 0) {
    monsterListEl.innerHTML = '<div class="empty-hint">没有符合条件的怪物模板。</div>';
    return;
  }

  monsterListEl.innerHTML = filtered.map((entry) => `
    <button class="config-file-row ${entry.key === currentMonsterKey ? 'active' : ''}" data-monster-key="${escapeHtml(entry.key)}" type="button">
      <div class="config-file-name">${escapeHtml(entry.monster.name || entry.monster.id)}</div>
      <div class="config-file-meta">${escapeHtml(entry.monster.id)} · ${escapeHtml(TECHNIQUE_GRADE_LABELS[entry.monster.grade])} · ${escapeHtml(entry.filePath)}</div>
    </button>
  `).join('');
}

function stringifyOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return String(Math.round(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function getItemTypeLabel(type: ItemType): string {
  return ITEM_TYPE_LABELS[type] ?? type;
}

function formatDropChancePercent(chance: number | undefined): string {
  if (chance === undefined) {
    return '';
  }
  return formatDisplayNumber(chance * 100);
}

function findEditorItem(itemId: string): LocalEditorItemOption | undefined {
  return editorItems.find((item) => item.itemId === itemId);
}

function buildEditorItemOptions(selectedItemId = ''): string {
  const options = ['<option value="">请选择物品</option>'];
  for (const item of editorItems) {
    options.push(
      `<option value="${escapeHtml(item.itemId)}" ${item.itemId === selectedItemId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.itemId)} · ${escapeHtml(getItemTypeLabel(item.type))}</option>`,
    );
  }
  if (selectedItemId && !findEditorItem(selectedItemId)) {
    options.push(`<option value="${escapeHtml(selectedItemId)}" selected>[缺失物品] ${escapeHtml(selectedItemId)}</option>`);
  }
  return options.join('');
}

function buildMonsterDropMeta(drop: Partial<MonsterTemplateDrop>): string {
  if (!drop.itemId) {
    return '从下拉列表中选择掉落物品。';
  }
  const item = findEditorItem(drop.itemId);
  if (item) {
    const parts = [item.itemId, getItemTypeLabel(item.type)];
    if (item.grade) {
      parts.push(TECHNIQUE_GRADE_LABELS[item.grade]);
    }
    if (item.level !== undefined) {
      parts.push(`等级 ${item.level}`);
    }
    return parts.join(' · ');
  }
  return `未在物品目录中找到 ${drop.itemId}`;
}

function buildMonsterScalarStatInput(key: NumericScalarStatKey, value: number | undefined): string {
  return `
    <div class="monster-stat-card">
      <label class="map-field">
        <span>
          <span>${escapeHtml(NUMERIC_SCALAR_STAT_LABELS[key])}</span>
          <span class="monster-stat-suffix">${escapeHtml(key)}</span>
        </span>
        <input data-value-stat-key="${escapeHtml(key)}" type="number" step="any" value="${escapeHtml(stringifyOptionalNumber(value))}" />
      </label>
    </div>
  `;
}

function buildMonsterElementStatInputs(groupKey: 'elementDamageBonus' | 'elementDamageReduce', stats?: PartialNumericStats): string {
  const title = groupKey === 'elementDamageBonus' ? '五行增伤' : '五行减伤';
  const note = groupKey === 'elementDamageBonus' ? '给怪物配置额外的五行伤害加成。' : '给怪物配置额外的五行抗性。';
  const group = stats?.[groupKey];
  return `
    <div class="monster-element-card">
      <div class="monster-group-head">
        <div class="monster-group-title">${escapeHtml(title)}</div>
        <div class="monster-group-note">${escapeHtml(note)}</div>
      </div>
      <div class="monster-element-grid">
        ${ELEMENT_KEYS.map((element) => `
          <label class="map-field">
            <span>${escapeHtml(ELEMENT_KEY_LABELS[element])}</span>
            <input
              data-value-stat-group="${escapeHtml(groupKey)}"
              data-element-key="${escapeHtml(element)}"
              type="number"
              step="any"
              value="${escapeHtml(stringifyOptionalNumber(group?.[element]))}"
            />
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMonsterValueStatsEditor(stats?: PartialNumericStats): void {
  monsterValueStatsEditorEl.innerHTML = MONSTER_VALUE_STAT_GROUPS.map((group) => `
    <div class="monster-stat-section">
      <div class="monster-group-head">
        <div class="monster-group-title">${escapeHtml(group.title)}</div>
        <div class="monster-group-note">${escapeHtml(group.note)}</div>
      </div>
      <div class="monster-stat-grid">
        ${group.keys.map((key) => buildMonsterScalarStatInput(key, stats?.[key])).join('')}
      </div>
    </div>
  `).join('') + buildMonsterElementStatInputs('elementDamageBonus', stats) + buildMonsterElementStatInputs('elementDamageReduce', stats);
}

function renderMonsterComputedStatsPreview(stats: NumericStats): void {
  const sectionHtml = MONSTER_COMPUTED_STAT_GROUPS
    .filter((group) => group.keys.length > 0)
    .map((group) => `
      <div class="monster-computed-section">
        <div class="monster-group-head">
          <div class="monster-group-title">${escapeHtml(group.title)}</div>
        </div>
        <div class="monster-computed-grid">
          ${group.keys.map((key) => `
            <div class="monster-computed-card">
              <div class="monster-computed-label">${escapeHtml(NUMERIC_SCALAR_STAT_LABELS[key])}</div>
              <div class="monster-computed-value">${escapeHtml(formatDisplayNumber(stats[key]))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

  const elementSections = ([
    ['elementDamageBonus', '五行增伤'],
    ['elementDamageReduce', '五行减伤'],
  ] as const).map(([groupKey, title]) => `
    <div class="monster-computed-section">
      <div class="monster-group-head">
        <div class="monster-group-title">${escapeHtml(title)}</div>
      </div>
      <div class="monster-computed-grid">
        ${ELEMENT_KEYS.map((element) => `
          <div class="monster-computed-card">
            <div class="monster-computed-label">${escapeHtml(ELEMENT_KEY_LABELS[element])}</div>
            <div class="monster-computed-value">${escapeHtml(formatDisplayNumber(stats[groupKey][element]))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  monsterComputedStatsPreviewEl.innerHTML = sectionHtml + elementSections;
}

function buildMonsterDropRow(drop: Partial<MonsterTemplateDrop>, index: number): string {
  return `
    <div class="monster-drop-row" data-drop-row>
      <div class="monster-drop-row-head">
        <div class="monster-drop-row-title" data-drop-row-title>掉落项 ${index + 1}</div>
        <button class="small-btn danger" type="button" data-drop-remove>删除</button>
      </div>
      <div class="monster-drop-grid">
        <label class="map-field wide">
          <span>掉落物品</span>
          <select data-drop-field="itemId">${buildEditorItemOptions(String(drop.itemId ?? ''))}</select>
        </label>
        <label class="map-field">
          <span>数量</span>
          <input data-drop-field="count" type="number" min="1" step="1" value="${escapeHtml(stringifyOptionalNumber(drop.count))}" placeholder="1" />
        </label>
        <label class="map-field">
          <span>概率 (%)</span>
          <input data-drop-field="chancePercent" type="number" min="0" max="100" step="0.01" value="${escapeHtml(formatDropChancePercent(drop.chance))}" placeholder="留空表示 100%" />
        </label>
      </div>
      <div class="monster-inline-note" data-drop-meta>${escapeHtml(buildMonsterDropMeta(drop))}</div>
    </div>
  `;
}

function updateMonsterDropEmptyState(): void {
  const hasRows = monsterDropsEditorEl.querySelector('[data-drop-row]') !== null;
  const emptyHint = monsterDropsEditorEl.querySelector<HTMLElement>('[data-drop-empty]');
  if (!hasRows && !emptyHint) {
    monsterDropsEditorEl.innerHTML = '<div class="empty-hint" data-drop-empty>当前没有掉落项，点上方“新增掉落”添加。</div>';
    return;
  }
  if (hasRows && emptyHint) {
    emptyHint.remove();
  }
}

function renderMonsterDropsEditor(drops: MonsterTemplateDrop[]): void {
  if (drops.length === 0) {
    monsterDropsEditorEl.innerHTML = '<div class="empty-hint" data-drop-empty>当前没有掉落项，点上方“新增掉落”添加。</div>';
    return;
  }
  monsterDropsEditorEl.innerHTML = drops.map((drop, index) => buildMonsterDropRow(drop, index)).join('');
}

function appendMonsterDropRow(drop: Partial<MonsterTemplateDrop> = {}): void {
  updateMonsterDropEmptyState();
  const rows = monsterDropsEditorEl.querySelectorAll('[data-drop-row]');
  monsterDropsEditorEl.insertAdjacentHTML('beforeend', buildMonsterDropRow(drop, rows.length));
  updateMonsterDropEmptyState();
  const nextRow = monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row]')[rows.length];
  const firstSelect = nextRow?.querySelector<HTMLSelectElement>('select[data-drop-field="itemId"]');
  firstSelect?.focus();
}

function refreshMonsterDropRowMeta(row: HTMLElement): void {
  const itemId = row.querySelector<HTMLSelectElement>('[data-drop-field="itemId"]')?.value ?? '';
  const metaEl = row.querySelector<HTMLElement>('[data-drop-meta]');
  if (!metaEl) {
    return;
  }
  metaEl.textContent = buildMonsterDropMeta({ itemId });
}

function fillMonsterForm(monster: MonsterTemplateRecord): void {
  monsterIdEl.value = monster.id;
  monsterNameEl.value = monster.name;
  monsterCharEl.value = monster.char;
  monsterColorEl.value = monster.color;
  monsterGradeEl.value = monster.grade;
  monsterAggroModeEl.value = monster.aggroMode;
  monsterHpEl.value = String(monster.hp);
  monsterMaxHpEl.value = String(monster.maxHp);
  monsterAttackEl.value = String(monster.attack);
  monsterLevelEl.value = monster.level === undefined ? '' : String(monster.level);
  monsterCountEl.value = String(monster.count);
  monsterMaxAliveEl.value = String(monster.maxAlive);
  monsterRadiusEl.value = String(monster.radius);
  monsterExpMultiplierEl.value = String(monster.expMultiplier);
  monsterAggroRangeEl.value = String(monster.aggroRange);
  monsterViewRangeEl.value = String(monster.viewRange);
  monsterRespawnSecEl.value = String(monster.respawnSec);
  monsterRespawnTicksEl.value = monster.respawnTicks === undefined ? '' : String(monster.respawnTicks);
  renderMonsterValueStatsEditor(monster.valueStats);
  renderMonsterComputedStatsPreview(monster.computedStats);
  renderMonsterDropsEditor(monster.drops);
}

function readOptionalInteger(input: HTMLInputElement): number | undefined {
  const value = input.value.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`字段 ${input.id} 不是合法整数`);
  }
  return parsed;
}

function readRequiredInteger(input: HTMLInputElement): number {
  const value = readOptionalInteger(input);
  if (value === undefined) {
    throw new Error(`字段 ${input.id} 不能为空`);
  }
  return value;
}

function readRequiredNumber(input: HTMLInputElement): number {
  const raw = input.value.trim();
  if (!raw) {
    throw new Error(`字段 ${input.id} 不能为空`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`字段 ${input.id} 不是合法数字`);
  }
  return parsed;
}

function readOptionalDecimalInput(raw: string, label: string): number | undefined {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 不是合法数字`);
  }
  return parsed;
}

function readMonsterValueStatsFromEditor(): PartialNumericStats | undefined {
  let valueStats: PartialNumericStats | undefined;
  for (const input of Array.from(monsterValueStatsEditorEl.querySelectorAll<HTMLInputElement>('[data-value-stat-key]'))) {
    const key = input.dataset.valueStatKey as NumericScalarStatKey | undefined;
    if (!key) {
      continue;
    }
    const value = readOptionalDecimalInput(input.value, `基准数值 ${NUMERIC_SCALAR_STAT_LABELS[key]}`);
    if (value === undefined) {
      continue;
    }
    valueStats ??= {};
    valueStats[key] = value;
  }

  for (const groupKey of ['elementDamageBonus', 'elementDamageReduce'] as const) {
    let group: Partial<Record<ElementKey, number>> | undefined;
    for (const input of Array.from(monsterValueStatsEditorEl.querySelectorAll<HTMLInputElement>(`[data-value-stat-group="${groupKey}"]`))) {
      const elementKey = input.dataset.elementKey as ElementKey | undefined;
      if (!elementKey) {
        continue;
      }
      const value = readOptionalDecimalInput(input.value, `基准数值 ${groupKey}.${ELEMENT_KEY_LABELS[elementKey]}`);
      if (value === undefined) {
        continue;
      }
      group ??= {};
      group[elementKey] = value;
    }
    if (group && Object.keys(group).length > 0) {
      valueStats ??= {};
      valueStats[groupKey] = group;
    }
  }

  return valueStats;
}

function readMonsterDropsFromEditor(): MonsterTemplateDrop[] {
  let drops: MonsterTemplateDrop[] = [];
  for (const row of Array.from(monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row]'))) {
    const itemId = row.querySelector<HTMLSelectElement>('[data-drop-field="itemId"]')?.value.trim() ?? '';
    const countRaw = row.querySelector<HTMLInputElement>('[data-drop-field="count"]')?.value.trim() ?? '';
    const chanceRaw = row.querySelector<HTMLInputElement>('[data-drop-field="chancePercent"]')?.value.trim() ?? '';
    const rowIsEmpty = !itemId && !countRaw && !chanceRaw;
    if (rowIsEmpty) {
      continue;
    }
    const item = findEditorItem(itemId);
    if (!item) {
      throw new Error(itemId ? `掉落物品不存在: ${itemId}` : '掉落项必须选择物品');
    }
    const count = countRaw ? Number(countRaw) : 1;
    const chancePercent = chanceRaw ? Number(chanceRaw) : undefined;
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error(`掉落配置 ${item.name} 的数量必须大于 0`);
    }
    if (chancePercent !== undefined && (!Number.isFinite(chancePercent) || chancePercent < 0 || chancePercent > 100)) {
      throw new Error(`掉落配置 ${item.name} 的概率必须在 0 到 100 之间`);
    }
    drops.push({
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count: Math.max(1, Math.floor(count)),
      chance: chancePercent === undefined ? undefined : chancePercent / 100,
    });
  }
  return drops;
}

function syncMonsterDraftFromForm(): MonsterTemplateRecord {
  const valueStats = readMonsterValueStatsFromEditor();
  const drops = readMonsterDropsFromEditor();
  const nextDraft: MonsterTemplateRecord = {
    id: monsterIdEl.value.trim(),
    name: monsterNameEl.value.trim(),
    char: monsterCharEl.value.trim(),
    color: monsterColorEl.value.trim(),
    grade: monsterGradeEl.value as TechniqueGrade,
    valueStats,
    computedStats: resolveMonsterNumericStatsFromValueStats(valueStats, readOptionalInteger(monsterLevelEl)),
    combatModel: valueStats ? 'value_stats' : (currentMonsterDraft?.combatModel ?? 'value_stats'),
    hp: 0,
    maxHp: 0,
    attack: 0,
    level: readOptionalInteger(monsterLevelEl),
    count: readRequiredInteger(monsterCountEl),
    maxAlive: readRequiredInteger(monsterMaxAliveEl),
    radius: readRequiredInteger(monsterRadiusEl),
    expMultiplier: readRequiredNumber(monsterExpMultiplierEl),
    aggroRange: readRequiredInteger(monsterAggroRangeEl),
    viewRange: readRequiredInteger(monsterViewRangeEl),
    aggroMode: monsterAggroModeEl.value as MonsterAggroMode,
    respawnSec: readRequiredInteger(monsterRespawnSecEl),
    respawnTicks: readOptionalInteger(monsterRespawnTicksEl),
    drops,
  };
  nextDraft.hp = Math.max(1, Math.round(nextDraft.computedStats.maxHp));
  nextDraft.maxHp = nextDraft.hp;
  nextDraft.attack = Math.max(1, Math.round(nextDraft.computedStats.physAtk));
  monsterHpEl.value = String(nextDraft.hp);
  monsterMaxHpEl.value = String(nextDraft.maxHp);
  monsterAttackEl.value = String(nextDraft.attack);
  renderMonsterComputedStatsPreview(nextDraft.computedStats);
  currentMonsterDraft = nextDraft;
  return nextDraft;
}

function onMonsterFormInput(): void {
  monsterDirty = true;
  try {
    syncMonsterDraftFromForm();
    setMonsterStatus('怪物模板有未保存修改');
  } catch (error) {
    setMonsterStatus(error instanceof Error ? error.message : '怪物模板输入非法', true);
  }
}

async function loadMonsterTemplateList(preferredKey?: string | null): Promise<void> {
  const result = await request<LocalMonsterTemplateListRes>('/api/monsters');
  monsterTemplates = result.monsters;
  renderMonsterList();

  const nextKey = preferredKey && monsterTemplates.some((entry) => entry.key === preferredKey)
    ? preferredKey
    : (currentMonsterKey && monsterTemplates.some((entry) => entry.key === currentMonsterKey) ? currentMonsterKey : monsterTemplates[0]?.key ?? null);

  if (!nextKey) {
    currentMonsterKey = null;
    currentMonsterDraft = null;
    monsterDirty = false;
    monsterEmptyEl.classList.remove('hidden');
    monsterPanelEl.classList.add('hidden');
    setMonsterStatus('');
    return;
  }

  await selectMonsterTemplate(nextKey, false);
}

async function selectMonsterTemplate(key: string, announce = true): Promise<void> {
  if (monsterDirty && currentMonsterKey && currentMonsterKey !== key) {
    const proceed = window.confirm('当前怪物模板有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

  const entry = monsterTemplates.find((item) => item.key === key);
  if (!entry) {
    throw new Error('目标怪物模板不存在');
  }

  currentMonsterKey = entry.key;
  currentMonsterDraft = JSON.parse(JSON.stringify(entry.monster)) as MonsterTemplateRecord;
  monsterDirty = false;
  monsterEmptyEl.classList.add('hidden');
  monsterPanelEl.classList.remove('hidden');
  monsterCurrentNameEl.textContent = `${entry.monster.name} · ${entry.monster.id}`;
  monsterCurrentMetaEl.textContent = `${entry.filePath} · 第 ${entry.index + 1} 项 · ${entry.monster.combatModel === 'value_stats' ? '基准值模式' : '旧属性模式'}`;
  fillMonsterForm(currentMonsterDraft);
  setMonsterStatus(announce ? `已载入怪物模板 ${entry.monster.name}` : '');
  renderMonsterList();
}

async function saveMonsterTemplate(): Promise<void> {
  if (!currentMonsterKey) {
    setMonsterStatus('请先选择一个怪物模板', true);
    return;
  }

  let monster: MonsterTemplateRecord;
  try {
    monster = syncMonsterDraftFromForm();
  } catch (error) {
    setMonsterStatus(error instanceof Error ? error.message : '怪物模板数据非法', true);
    return;
  }

  monsterSaveBtn.disabled = true;
  try {
    const result = await request<LocalMonsterSaveRes>('/api/monsters', {
      method: 'PUT',
      body: JSON.stringify({
        key: currentMonsterKey,
        monster,
      }),
    });
    monsterDirty = false;
    setMonsterStatus(result.updatedMapCount > 0
      ? `已保存怪物模板，并同步更新 ${result.updatedMapCount} 张地图中的引用`
      : '已保存怪物模板');
    setAppStatus(`已写回怪物模板 ${result.monster.name}，本地服务将自动重启`);
    await loadMonsterTemplateList(currentMonsterKey);
    await refreshServiceStatus();
  } catch (error) {
    setMonsterStatus(error instanceof Error ? error.message : '保存怪物模板失败', true);
  } finally {
    monsterSaveBtn.disabled = false;
  }
}

async function loadEditorCatalog(): Promise<void> {
  const result = await request<LocalEditorCatalogRes>('/api/editor-catalog');
  editorItems = result.items;
  if (currentMonsterDraft) {
    renderMonsterDropsEditor(currentMonsterDraft.drops);
  }
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
  pageTabs.monsters.addEventListener('click', () => switchPage('monsters'));
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

  monsterSearchEl.addEventListener('input', () => renderMonsterList());
  monsterRefreshBtn.addEventListener('click', () => {
    loadMonsterTemplateList(currentMonsterKey).catch((error: unknown) => {
      setMonsterStatus(error instanceof Error ? error.message : '加载怪物模板列表失败', true);
    });
  });
  monsterListEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-monster-key]');
    const key = button?.dataset.monsterKey;
    if (!key) return;
    selectMonsterTemplate(key).catch((error: unknown) => {
      setMonsterStatus(error instanceof Error ? error.message : '读取怪物模板失败', true);
    });
  });
  [
    monsterIdEl,
    monsterNameEl,
    monsterCharEl,
    monsterColorEl,
    monsterGradeEl,
    monsterAggroModeEl,
    monsterLevelEl,
    monsterCountEl,
    monsterMaxAliveEl,
    monsterRadiusEl,
    monsterExpMultiplierEl,
    monsterAggroRangeEl,
    monsterViewRangeEl,
    monsterRespawnSecEl,
    monsterRespawnTicksEl,
  ].forEach((element) => {
    element.addEventListener('input', onMonsterFormInput);
    element.addEventListener('change', onMonsterFormInput);
  });
  monsterValueStatsEditorEl.addEventListener('input', onMonsterFormInput);
  monsterValueStatsEditorEl.addEventListener('change', onMonsterFormInput);
  monsterDropsEditorEl.addEventListener('input', onMonsterFormInput);
  monsterDropsEditorEl.addEventListener('change', onMonsterFormInput);
  monsterDropsEditorEl.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-drop-field="itemId"]');
    if (!select) {
      return;
    }
    const row = select.closest<HTMLElement>('[data-drop-row]');
    if (!row) {
      return;
    }
    refreshMonsterDropRowMeta(row);
  });
  monsterDropAddBtn.addEventListener('click', () => {
    appendMonsterDropRow();
    onMonsterFormInput();
  });
  monsterDropsEditorEl.addEventListener('click', (event) => {
    const removeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-drop-remove]');
    if (!removeButton) {
      return;
    }
    removeButton.closest('[data-drop-row]')?.remove();
    const rows = Array.from(monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row-title]'));
    rows.forEach((titleEl, index) => {
      titleEl.textContent = `掉落项 ${index + 1}`;
    });
    updateMonsterDropEmptyState();
    onMonsterFormInput();
  });
  monsterSaveBtn.addEventListener('click', () => {
    saveMonsterTemplate().catch(() => {});
  });
  monsterReloadBtn.addEventListener('click', () => {
    if (!currentMonsterKey) return;
    selectMonsterTemplate(currentMonsterKey).catch((error: unknown) => {
      setMonsterStatus(error instanceof Error ? error.message : '重新读取怪物模板失败', true);
    });
  });
}

async function bootstrap(): Promise<void> {
  populateMonsterStaticOptions();
  bindEvents();
  const nextMapEditor = new GmMapEditor(request, setAppStatus, {
    mapApiBasePath: '/api/maps',
    syncedSummaryLabel: '已与本地文件同步',
  });
  mapEditor = nextMapEditor;
  switchMapSideTab(currentMapSideTab);

  await Promise.all([
    nextMapEditor.ensureLoaded(),
    loadEditorCatalog(),
    loadMonsterTemplateList(),
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
