import {
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  ELEMENT_KEYS,
  ELEMENT_KEY_LABELS,
  EQUIP_SLOTS,
  type BasicOkRes,
  ITEM_TYPE_LABELS,
  MONSTER_TIER_EXP_MULTIPLIERS,
  MONSTER_TIER_LABELS,
  MONSTER_TIER_ORDER,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_LABELS,
  PLAYER_REALM_CONFIG,
  PLAYER_REALM_ORDER,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_GRADE_LABELS,
  resolveMonsterTemplateRecord,
  type Attributes,
  type AttrKey,
  type ElementKey,
  type EquipSlot,
  type ItemType,
  type MonsterAggroMode,
  type MonsterTemplateDropRecord,
  type MonsterTemplateEditorItem,
  type MonsterTemplateResolvedRecord,
  type MonsterTier,
  type NumericScalarStatKey,
  type NumericStatPercentages,
  type NumericStats,
  type PartialNumericStats,
  type PlayerRealmStage,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniqueLayerDef,
} from '@mud/shared-next';
import { GmMapEditor } from '../../../packages/client/src/gm-map-editor';

/** 编辑器顶部页签的标识，决定当前显示地图、怪物、功法、文件还是服务状态。 */
type PageId = 'maps' | 'monsters' | 'skills' | 'files' | 'service';

/** 配置文件列表中的最小展示信息，只保留编辑器首页需要的字段。 */
type LocalConfigFileSummary = {
  path: string;
  name: string;
  category: string;
};

/** 本地 API 返回的配置文件列表结果。 */
type LocalConfigFileListRes = {
  files: LocalConfigFileSummary[];
};

/** 本地 API 返回的单个配置文件内容。 */
type LocalConfigFileRes = {
  path: string;
  content: string;
};

/** 功法 Buff 覆盖字段的写入方式，区分基础值和百分比。 */
type LocalBuffModifierMode = 'flat' | 'percent';

/** 功法共享 Buff 模板，供技能内联引用并在编辑器中预览和覆盖。 */
type LocalTechniqueBuffTemplate = {
  id: string;
  target?: 'self' | 'target';
  buffId?: string;
  name?: string;
  desc?: string;
  shortMark?: string;
  category?: 'buff' | 'debuff';
  visibility?: 'public' | 'observe_only' | 'hidden';
  color?: string;
  duration?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  attrMode?: LocalBuffModifierMode;
  stats?: PartialNumericStats;
  statMode?: LocalBuffModifierMode;
  valueStats?: PartialNumericStats;
  buffRef?: string;
  type?: string;
};

/** 单个功法效果项，既可以是共享 Buff 引用，也可以是技能内联效果。 */
type LocalTechniqueEffect = {
  type: string;
  buffRef?: string;
  target?: 'self' | 'target';
  buffId?: string;
  name?: string;
  desc?: string;
  shortMark?: string;
  category?: 'buff' | 'debuff';
  visibility?: 'public' | 'observe_only' | 'hidden';
  color?: string;
  duration?: number;
  maxStacks?: number;
  attrs?: Partial<Attributes>;
  attrMode?: LocalBuffModifierMode;
  stats?: PartialNumericStats;
  statMode?: LocalBuffModifierMode;
  valueStats?: PartialNumericStats;
  [key: string]: unknown;
};

/** 功法内的技能条目，编辑器会按技能维度切换、预览和保存。 */
type LocalTechniqueSkill = {
  id: string;
  name: string;
  desc: string;
  cooldown?: number;
  cost?: number;
  costMultiplier?: number;
  range?: number;
  unlockLevel?: number;
  unlockRealm?: number | string;
  effects: LocalTechniqueEffect[];
  [key: string]: unknown;
};

/** 编辑器中打开的功法模板对象。 */
type LocalTechniqueTemplateRecord = {
  id: string;
  name: string;
  grade: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  layers?: TechniqueLayerDef[];
  skills: LocalTechniqueSkill[];
  [key: string]: unknown;
};

/** 列表中的功法模板条目，带文件定位信息。 */
type LocalTechniqueEntry = {
  key: string;
  filePath: string;
  index: number;
  technique: LocalTechniqueTemplateRecord;
};

/** 功法列表接口返回值，包含模板列表和共享 Buff 模板。 */
type LocalTechniqueListRes = {
  techniques: LocalTechniqueEntry[];
  sharedBuffs: LocalTechniqueBuffTemplate[];
};

/** 保存功法后返回的最新模板内容。 */
type LocalTechniqueSaveRes = BasicOkRes & {
  technique: LocalTechniqueTemplateRecord;
};

/** 本地 API 暴露的服务托管状态。 */
type LocalServerStatusRes = {
  managed: boolean;
  running: boolean;
  pid?: number;
  lastRestartAt?: string;
  lastRestartReason?: string;
  mode: string;
};

/** 怪物模板掉落项，编辑器保存时会回写到内容文件。 */
type MonsterTemplateDrop = MonsterTemplateDropRecord;
/** 怪物模板的完整可编辑对象。 */
type MonsterTemplateRecord = MonsterTemplateResolvedRecord;

/** 列表中的怪物模板条目，带文件和索引定位。 */
type LocalMonsterTemplateEntry = {
  key: string;
  filePath: string;
  index: number;
  monster: MonsterTemplateRecord;
};

/** 怪物模板列表接口返回值。 */
type LocalMonsterTemplateListRes = {
  monsters: LocalMonsterTemplateEntry[];
};

/** 保存怪物模板后返回的结果，包含同步更新的地图数量。 */
type LocalMonsterSaveRes = BasicOkRes & {
  updatedMapCount: number;
  monster: MonsterTemplateRecord;
};

/** 编辑器物品目录中的标准选项项。 */
type LocalEditorItemOption = MonsterTemplateEditorItem;

/** 编辑器物品目录接口返回值。 */
type LocalEditorCatalogRes = {
  items: LocalEditorItemOption[];
};

/** 怪物掉落的稳定身份信息，用于在目录缺失时保留模板内原始值。 */
type MonsterDropIdentity = Pick<MonsterTemplateDrop, 'itemId' | 'name' | 'type'>;

/** 地图页左侧子页签。 */
type MapSideTabId = 'overview' | 'inspector' | 'json';
/** 功法 Buff 编辑器中的字段分组。 */
type TechniqueModifierGroupKey = 'valueStats' | 'stats' | 'attrs';

/** 顶部全局状态栏，统一显示加载、保存和错误反馈。 */
const appStatusBarEl = document.getElementById('app-status-bar') as HTMLDivElement;
/** 服务卡片里的摘要行，用来概括本地托管状态。 */
const serviceSummaryEl = document.getElementById('service-summary') as HTMLDivElement;

const pageMap = {
  maps: document.getElementById('page-maps') as HTMLElement,
  monsters: document.getElementById('page-monsters') as HTMLElement,
  skills: document.getElementById('page-skills') as HTMLElement,
  files: document.getElementById('page-files') as HTMLElement,
  service: document.getElementById('page-service') as HTMLElement,
};

const pageTabs = {
  maps: document.getElementById('page-tab-maps') as HTMLButtonElement,
  monsters: document.getElementById('page-tab-monsters') as HTMLButtonElement,
  skills: document.getElementById('page-tab-skills') as HTMLButtonElement,
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

/** 配置文件页左上角的搜索框，用于按名称或路径过滤列表。 */
const configFileSearchEl = document.getElementById('config-file-search') as HTMLInputElement;
/** 重新拉取配置文件列表的按钮。 */
const configFileRefreshBtn = document.getElementById('config-file-refresh') as HTMLButtonElement;
/** 配置文件列表容器。 */
const configFileListEl = document.getElementById('config-file-list') as HTMLDivElement;
/** 配置文件空态提示。 */
const configFileEmptyEl = document.getElementById('config-file-empty') as HTMLDivElement;
/** 当前打开配置文件的编辑面板。 */
const configFilePanelEl = document.getElementById('config-file-panel') as HTMLDivElement;
/** 当前配置文件的名称展示区。 */
const configFileCurrentNameEl = document.getElementById('config-file-current-name') as HTMLDivElement;
/** 当前配置文件的路径和补充信息。 */
const configFileCurrentMetaEl = document.getElementById('config-file-current-meta') as HTMLDivElement;
/** 配置文件的 JSON 文本编辑器。 */
const configFileEditorEl = document.getElementById('config-file-editor') as HTMLTextAreaElement;
/** 保存当前配置文件的按钮。 */
const configFileSaveBtn = document.getElementById('config-file-save') as HTMLButtonElement;
/** 丢弃本地修改并重新读取文件的按钮。 */
const configFileReloadBtn = document.getElementById('config-file-reload') as HTMLButtonElement;
/** 配置文件页底部的操作状态提示。 */
const configFileStatusEl = document.getElementById('config-file-status') as HTMLDivElement;

/** 功法列表搜索框。 */
const techniqueSearchEl = document.getElementById('technique-search') as HTMLInputElement;
/** 重新拉取功法列表的按钮。 */
const techniqueRefreshBtn = document.getElementById('technique-refresh') as HTMLButtonElement;
/** 功法模板列表容器。 */
const techniqueListEl = document.getElementById('technique-list') as HTMLDivElement;
/** 功法空态提示。 */
const techniqueEmptyEl = document.getElementById('technique-empty') as HTMLDivElement;
/** 当前功法的编辑面板。 */
const techniquePanelEl = document.getElementById('technique-panel') as HTMLDivElement;
/** 当前功法名称展示区。 */
const techniqueCurrentNameEl = document.getElementById('technique-current-name') as HTMLDivElement;
/** 当前功法文件和分类信息。 */
const techniqueCurrentMetaEl = document.getElementById('technique-current-meta') as HTMLDivElement;
/** 保存当前功法模板的按钮。 */
const techniqueSaveBtn = document.getElementById('technique-save') as HTMLButtonElement;
/** 重新读取当前功法模板的按钮。 */
const techniqueReloadBtn = document.getElementById('technique-reload') as HTMLButtonElement;
/** 当前功法内技能切换下拉框。 */
const techniqueSkillSelectEl = document.getElementById('technique-skill-select') as HTMLSelectElement;
/** 当前技能内可编辑 Buff 效果切换下拉框。 */
const techniqueEffectSelectEl = document.getElementById('technique-effect-select') as HTMLSelectElement;
/** 技能摘要区域，展示冷却、射程和效果数量。 */
const techniqueSkillSummaryEl = document.getElementById('technique-skill-summary') as HTMLDivElement;
/** Buff 效果摘要区域，展示来源和覆盖范围。 */
const techniqueEffectSummaryEl = document.getElementById('technique-effect-summary') as HTMLDivElement;
/** Buff 效果的具体编辑区。 */
const techniqueEffectEditorEl = document.getElementById('technique-effect-editor') as HTMLDivElement;
/** 功法页底部的状态提示。 */
const techniqueStatusEl = document.getElementById('technique-status') as HTMLDivElement;

/** 怪物模板列表搜索框。 */
const monsterSearchEl = document.getElementById('monster-search') as HTMLInputElement;
/** 重新拉取怪物列表的按钮。 */
const monsterRefreshBtn = document.getElementById('monster-refresh') as HTMLButtonElement;
/** 怪物模板列表容器。 */
const monsterListEl = document.getElementById('monster-list') as HTMLDivElement;
/** 怪物模板空态提示。 */
const monsterEmptyEl = document.getElementById('monster-empty') as HTMLDivElement;
/** 当前怪物模板的编辑面板。 */
const monsterPanelEl = document.getElementById('monster-panel') as HTMLDivElement;
/** 当前怪物模板名称展示区。 */
const monsterCurrentNameEl = document.getElementById('monster-current-name') as HTMLDivElement;
/** 当前怪物模板文件和来源信息。 */
const monsterCurrentMetaEl = document.getElementById('monster-current-meta') as HTMLDivElement;
/** 保存当前怪物模板的按钮。 */
const monsterSaveBtn = document.getElementById('monster-save') as HTMLButtonElement;
/** 重新读取当前怪物模板的按钮。 */
const monsterReloadBtn = document.getElementById('monster-reload') as HTMLButtonElement;
/** 怪物页底部的状态提示。 */
const monsterStatusEl = document.getElementById('monster-status') as HTMLDivElement;
/** 怪物 ID 输入框。 */
const monsterIdEl = document.getElementById('monster-id') as HTMLInputElement;
/** 怪物名称输入框。 */
const monsterNameEl = document.getElementById('monster-name') as HTMLInputElement;
/** 怪物字符外观输入框。 */
const monsterCharEl = document.getElementById('monster-char') as HTMLInputElement;
/** 怪物颜色输入框。 */
const monsterColorEl = document.getElementById('monster-color') as HTMLInputElement;
/** 怪物品阶选择框。 */
const monsterGradeEl = document.getElementById('monster-grade') as HTMLSelectElement;
/** 怪物档位选择框。 */
const monsterTierEl = document.getElementById('monster-tier') as HTMLSelectElement;
/** 怪物仇恨模式选择框。 */
const monsterAggroModeEl = document.getElementById('monster-aggro-mode') as HTMLSelectElement;
/** 怪物旧血量字段输入框。 */
const monsterHpEl = document.getElementById('monster-hp') as HTMLInputElement;
/** 怪物旧最大血量字段输入框。 */
const monsterMaxHpEl = document.getElementById('monster-max-hp') as HTMLInputElement;
/** 怪物旧攻击字段输入框。 */
const monsterAttackEl = document.getElementById('monster-attack') as HTMLInputElement;
/** 怪物等级输入框。 */
const monsterLevelEl = document.getElementById('monster-level') as HTMLInputElement;
/** 怪物刷怪数量输入框。 */
const monsterCountEl = document.getElementById('monster-count') as HTMLInputElement;
/** 怪物场上最大存活数输入框。 */
const monsterMaxAliveEl = document.getElementById('monster-max-alive') as HTMLInputElement;
/** 怪物占地半径输入框。 */
const monsterRadiusEl = document.getElementById('monster-radius') as HTMLInputElement;
/** 怪物经验倍率输入框。 */
const monsterExpMultiplierEl = document.getElementById('monster-exp-multiplier') as HTMLInputElement;
/** 怪物仇恨范围输入框。 */
const monsterAggroRangeEl = document.getElementById('monster-aggro-range') as HTMLInputElement;
/** 怪物视野范围输入框。 */
const monsterViewRangeEl = document.getElementById('monster-view-range') as HTMLInputElement;
/** 怪物刷新秒数输入框。 */
const monsterRespawnSecEl = document.getElementById('monster-respawn-sec') as HTMLInputElement;
/** 怪物刷新 tick 数输入框。 */
const monsterRespawnTicksEl = document.getElementById('monster-respawn-ticks') as HTMLInputElement;
/** 怪物六维属性编辑区。 */
const monsterAttrsEditorEl = document.getElementById('monster-attrs-editor') as HTMLDivElement;
/** 怪物数值倍率编辑区。 */
const monsterStatPercentsEditorEl = document.getElementById('monster-stat-percents-editor') as HTMLDivElement;
/** 怪物装备编辑区。 */
const monsterEquipmentEditorEl = document.getElementById('monster-equipment-editor') as HTMLDivElement;
/** 怪物技能 ID 文本输入区。 */
const monsterSkillsEl = document.getElementById('monster-skills') as HTMLTextAreaElement;
/** 怪物基础数值和五行增减编辑区。 */
const monsterValueStatsEditorEl = document.getElementById('monster-value-stats-editor') as HTMLDivElement;
/** 怪物解析后的六维预览区。 */
const monsterResolvedAttrsPreviewEl = document.getElementById('monster-resolved-attrs-preview') as HTMLDivElement;
/** 怪物完整计算结果预览区。 */
const monsterComputedStatsPreviewEl = document.getElementById('monster-computed-stats-preview') as HTMLDivElement;
/** 怪物掉落编辑区。 */
const monsterDropsEditorEl = document.getElementById('monster-drops-editor') as HTMLDivElement;
/** 新增掉落项按钮。 */
const monsterDropAddBtn = document.getElementById('monster-drop-add') as HTMLButtonElement;

/** 本地托管服务运行状态的主值展示。 */
const serviceRunningValueEl = document.getElementById('service-running-value') as HTMLDivElement;
/** 本地托管服务运行状态的补充说明。 */
const serviceRunningMetaEl = document.getElementById('service-running-meta') as HTMLDivElement;
/** 本地托管模式说明。 */
const serviceModeEl = document.getElementById('service-mode') as HTMLDivElement;
/** 最近一次重启时间展示。 */
const serviceLastRestartAtEl = document.getElementById('service-last-restart-at') as HTMLDivElement;
/** 最近一次重启原因展示。 */
const serviceLastRestartReasonEl = document.getElementById('service-last-restart-reason') as HTMLDivElement;
/** 当前托管进程 PID 展示。 */
const servicePidEl = document.getElementById('service-pid') as HTMLDivElement;
/** 重新启动托管服务的按钮。 */
const serviceRestartBtn = document.getElementById('service-restart') as HTMLButtonElement;
/** 刷新托管服务状态的按钮。 */
const serviceRefreshBtn = document.getElementById('service-refresh') as HTMLButtonElement;

/** 当前激活的主导航页。 */
let currentPage: PageId = 'maps';
/** 地图页当前正在查看的子页签。 */
let currentMapSideTab: MapSideTabId = 'overview';
let configFiles: LocalConfigFileSummary[] = [];
/** 当前打开的配置文件路径，切换前会用于判断是否有未保存修改。 */
let currentConfigFilePath: string | null = null;
/** 标记配置文件编辑区是否有未保存修改。 */
let configFileDirty = false;
let techniqueTemplates: LocalTechniqueEntry[] = [];
let techniqueBuffTemplates: LocalTechniqueBuffTemplate[] = [];
/** 共享 Buff 模板的快速索引，供技能编辑和预览直接查找。 */
let techniqueBuffTemplateById = new Map<string, LocalTechniqueBuffTemplate>();
/** 当前打开的功法模板键。 */
let currentTechniqueKey: string | null = null;
/** 当前功法的可编辑草稿。 */
let currentTechniqueDraft: LocalTechniqueTemplateRecord | null = null;
/** 当前正在查看或编辑的技能 ID。 */
let currentTechniqueSkillId: string | null = null;
/** 当前选中的 Buff 效果在技能 effects 数组中的索引。 */
let currentTechniqueEffectIndex: number | null = null;
/** 标记功法草稿是否有未保存修改。 */
let techniqueDirty = false;
let monsterTemplates: LocalMonsterTemplateEntry[] = [];
/** 当前打开的怪物模板键。 */
let currentMonsterKey: string | null = null;
/** 当前怪物模板的可编辑草稿。 */
let currentMonsterDraft: MonsterTemplateRecord | null = null;
/** 标记怪物草稿是否有未保存修改。 */
let monsterDirty = false;
/** 定时刷新托管服务状态的轮询句柄。 */
let servicePollTimer: number | null = null;
/** 当前是否启用编辑器托管主游戏服。 */
let serviceManaged = false;
/** 嵌入式地图编辑器实例，负责地图页的实际编辑操作。 */
let mapEditor: GmMapEditor | null = null;
let editorItems: LocalEditorItemOption[] = [];
/** 编辑器物品目录的快速索引，用于掉落和装备校验。 */
let editorItemById = new Map<string, LocalEditorItemOption>();

const GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS) as Array<[TechniqueGrade, string]>;
const MONSTER_TIER_OPTIONS = MONSTER_TIER_ORDER.map((value) => ({ value, label: MONSTER_TIER_LABELS[value] }));
const AGGRO_MODE_OPTIONS: Array<{ value: MonsterAggroMode; label: string }> = [
  { value: 'always', label: '主动攻击' },
  { value: 'retaliate', label: '受击反击' },
  { value: 'day_only', label: '仅白天主动' },
  { value: 'night_only', label: '仅夜晚主动' },
];
const MONSTER_TIER_SORT_ORDER = MONSTER_TIER_ORDER.reduce<Record<MonsterTier, number>>((accumulator, tier, index) => {
  accumulator[tier] = index;
  return accumulator;
}, {} as Record<MonsterTier, number>);
const TECHNIQUE_GRADE_SORT_ORDER = TECHNIQUE_GRADE_ORDER.reduce<Record<TechniqueGrade, number>>((accumulator, grade, index) => {
  accumulator[grade] = index;
  return accumulator;
}, {} as Record<TechniqueGrade, number>);
const PLAYER_REALM_STAGE_SORT_ORDER = PLAYER_REALM_ORDER.reduce<Record<PlayerRealmStage, number>>((accumulator, stage, index) => {
  accumulator[stage] = index;
  return accumulator;
}, {} as Record<PlayerRealmStage, number>);

const MONSTER_SOURCE_MODE_LABELS: Record<MonsterTemplateRecord['sourceMode'], string> = {
  legacy: '旧 hp/attack 模式',
  value_stats: 'valueStats 推导模式',
  attributes: 'attrs / statPercents 模式',
};

const TECHNIQUE_CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  arts: '术法',
  internal: '内功',
  divine: '神通',
  secret: '秘术',
};

const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};

const MONSTER_VALUE_STAT_GROUPS: Array<{ title: string; note: string; keys: NumericScalarStatKey[] }> = [
  {
    title: '生存与攻防',
    note: '基础战斗面板，直接决定怪物的血量、攻击、防御和命中闪避。',
    keys: ['maxHp', 'maxQi', 'physAtk', 'spellAtk', 'physDef', 'spellDef', 'hit', 'dodge'],
  },
  {
    title: '暴击与对抗',
    note: '控制暴击、免爆以及破招、化解这类对抗属性。',
    keys: ['crit', 'antiCrit', 'critDamage', 'breakPower', 'resolvePower'],
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

/** 统一写入全局状态栏，给保存、加载和错误提示共用。 */
function setAppStatus(message: string, isError = false): void {
  appStatusBarEl.textContent = message;
  appStatusBarEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** 更新配置文件页的局部状态提示。 */
function setConfigFileStatus(message: string, isError = false): void {
  configFileStatusEl.textContent = message;
  configFileStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** 更新功法页的局部状态提示。 */
function setTechniqueStatus(message: string, isError = false): void {
  techniqueStatusEl.textContent = message;
  techniqueStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** 更新怪物页的局部状态提示。 */
function setMonsterStatus(message: string, isError = false): void {
  monsterStatusEl.textContent = message;
  monsterStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** 统一封装前端到本地 API 的请求逻辑，并在失败时提取后端错误信息。 */
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

/** 切换顶部主页面签，并同步高亮状态。 */
function switchPage(page: PageId): void {
  currentPage = page;
  (Object.keys(pageMap) as PageId[]).forEach((key) => {
    pageMap[key].classList.toggle('hidden', key !== page);
    pageTabs[key].classList.toggle('active', key === page);
  });
}

/** 切换地图页的子页签，并在进入预览或检查视图时收起工具。 */
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

/** 根据搜索条件渲染配置文件列表。 */
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

function normalizeTechniqueSortRealmLv(realmLv: number | undefined): number {
  if (!Number.isFinite(realmLv)) {
    return 1;
  }
  return Math.max(1, Math.floor(realmLv ?? 1));
}

/** 按境界、品阶、分类和名称排序功法模板，保证列表稳定。 */
function compareTechniqueTemplateEntries(left: LocalTechniqueEntry, right: LocalTechniqueEntry): number {
  const realmDiff = normalizeTechniqueSortRealmLv(left.technique.realmLv) - normalizeTechniqueSortRealmLv(right.technique.realmLv);
  if (realmDiff !== 0) {
    return realmDiff;
  }

  const gradeDiff = getMonsterGradeSortWeight(left.technique.grade) - getMonsterGradeSortWeight(right.technique.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }

  const categoryDiff = (left.technique.category ?? 'internal').localeCompare(right.technique.category ?? 'internal', 'zh-Hans-CN');
  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  const nameDiff = (left.technique.name || left.technique.id).localeCompare(right.technique.name || right.technique.id, 'zh-Hans-CN');
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.filePath.localeCompare(right.filePath, 'zh-Hans-CN');
}

function formatTechniqueListMeta(entry: LocalTechniqueEntry): string {
  const parts = [
    entry.technique.id,
    `境界 ${normalizeTechniqueSortRealmLv(entry.technique.realmLv)}`,
    TECHNIQUE_GRADE_LABELS[entry.technique.grade] ?? entry.technique.grade,
  ];
  if (entry.technique.category) {
    parts.push(TECHNIQUE_CATEGORY_LABELS[entry.technique.category] ?? entry.technique.category);
  }
  parts.push(entry.filePath);
  return parts.join(' · ');
}

/** 渲染功法列表，并保留当前选中项的高亮。 */
function renderTechniqueList(): void {
  const keyword = techniqueSearchEl.value.trim().toLowerCase();
  const filtered = techniqueTemplates.filter((entry) => {
    if (!keyword) return true;
    return entry.technique.name.toLowerCase().includes(keyword)
      || entry.technique.id.toLowerCase().includes(keyword)
      || entry.filePath.toLowerCase().includes(keyword);
  });

  if (filtered.length === 0) {
    techniqueListEl.innerHTML = '<div class="empty-hint">没有符合条件的功法。</div>';
    return;
  }

  techniqueListEl.innerHTML = filtered.map((entry) => `
    <button class="config-file-row ${entry.key === currentTechniqueKey ? 'active' : ''}" data-technique-key="${escapeHtml(entry.key)}" type="button">
      <div class="config-file-name">${escapeHtml(entry.technique.name || entry.technique.id)}</div>
      <div class="config-file-meta">${escapeHtml(formatTechniqueListMeta(entry))}</div>
    </button>
  `).join('');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnField(target: unknown, key: string): boolean {
  return isPlainRecord(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function cloneTechniqueTemplateRecord(technique: LocalTechniqueTemplateRecord): LocalTechniqueTemplateRecord {
  return JSON.parse(JSON.stringify(technique)) as LocalTechniqueTemplateRecord;
}

function normalizeTechniqueModifierMode(mode: unknown): LocalBuffModifierMode {
  return mode === 'flat' ? 'flat' : 'percent';
}

function normalizeTechniqueNumericGroup(raw: unknown): PartialNumericStats {
  const normalized: PartialNumericStats = {};
  if (!isPlainRecord(raw)) {
    return normalized;
  }
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = raw[key];
    if (Number.isFinite(value)) {
      normalized[key] = Number(value);
    }
  }
  return normalized;
}

function normalizeTechniqueAttrGroup(raw: unknown): Partial<Attributes> {
  const normalized: Partial<Attributes> = {};
  if (!isPlainRecord(raw)) {
    return normalized;
  }
  for (const key of ATTR_KEYS) {
    const value = raw[key];
    if (Number.isFinite(value)) {
      normalized[key] = Number(value);
    }
  }
  return normalized;
}

function formatTechniqueModeLabel(mode: LocalBuffModifierMode): string {
  return mode === 'flat' ? '基础值' : '百分比';
}

function buildTechniqueMetaRow(label: string, value: string): string {
  return `
    <div class="technique-meta-row">
      <div class="technique-meta-key">${escapeHtml(label)}</div>
      <div class="technique-meta-value">${escapeHtml(value || '-')}</div>
    </div>
  `;
}

function buildTechniqueChip(text: string, extraClass = ''): string {
  return `<span class="technique-inline-chip ${escapeHtml(extraClass)}">${escapeHtml(text)}</span>`;
}

/** 读取当前功法页正在编辑的技能，没有显式选择时默认返回第一个技能。 */
function getCurrentTechniqueSkill(): LocalTechniqueSkill | null {
  if (!currentTechniqueDraft) {
    return null;
  }
  if (!currentTechniqueSkillId) {
    return currentTechniqueDraft.skills[0] ?? null;
  }
  return currentTechniqueDraft.skills.find((skill) => skill.id === currentTechniqueSkillId) ?? currentTechniqueDraft.skills[0] ?? null;
}

function isTechniqueBuffEffect(effect: LocalTechniqueEffect | undefined): effect is LocalTechniqueEffect {
  return Boolean(effect && effect.type === 'buff');
}

/** 将内联 Buff 效果与共享模板合并，得到当前页面应展示的生效值。 */
function resolveTechniqueBuffEffect(effect: LocalTechniqueEffect): LocalTechniqueEffect {
  if (!isTechniqueBuffEffect(effect)) {
    return effect;
  }
  const buffRef = typeof effect.buffRef === 'string' && effect.buffRef.trim() ? effect.buffRef.trim() : '';
  const template = buffRef ? techniqueBuffTemplateById.get(buffRef) : undefined;
  return template ? { ...template, ...effect, type: 'buff' } : effect;
}

function getTechniqueBuffEffectOptions(skill: LocalTechniqueSkill | null): Array<{
  rawIndex: number;
  rawEffect: LocalTechniqueEffect;
  resolvedEffect: LocalTechniqueEffect;
}> {
  if (!skill) {
    return [];
  }
  return skill.effects
    .map((effect, rawIndex) => ({ rawIndex, rawEffect: effect, resolvedEffect: resolveTechniqueBuffEffect(effect) }))
    .filter((entry) => isTechniqueBuffEffect(entry.rawEffect));
}

/** 取出当前选中的 Buff 效果，如果未显式选择则回退到第一个可编辑项。 */
function getCurrentTechniqueBuffEffectSelection(): {
  skill: LocalTechniqueSkill;
  rawEffect: LocalTechniqueEffect;
  resolvedEffect: LocalTechniqueEffect;
  rawIndex: number;
} | null {
  const skill = getCurrentTechniqueSkill();
  if (!skill) {
    return null;
  }
  const options = getTechniqueBuffEffectOptions(skill);
  if (options.length === 0) {
    return null;
  }
  const selected = options.find((entry) => entry.rawIndex === currentTechniqueEffectIndex) ?? options[0]!;
  return {
    skill,
    rawEffect: selected.rawEffect,
    resolvedEffect: selected.resolvedEffect,
    rawIndex: selected.rawIndex,
  };
}

function getTechniqueEffectGroup(
  rawEffect: LocalTechniqueEffect,
  resolvedEffect: LocalTechniqueEffect,
  groupKey: TechniqueModifierGroupKey,
): PartialNumericStats | Partial<Attributes> {
  if (groupKey === 'attrs') {
    if (hasOwnField(rawEffect, groupKey)) {
      return normalizeTechniqueAttrGroup(rawEffect[groupKey]);
    }
    return normalizeTechniqueAttrGroup(resolvedEffect[groupKey]);
  }
  if (hasOwnField(rawEffect, groupKey)) {
    return normalizeTechniqueNumericGroup(rawEffect[groupKey]);
  }
  return normalizeTechniqueNumericGroup(resolvedEffect[groupKey]);
}

function getTechniqueEffectMode(
  rawEffect: LocalTechniqueEffect,
  resolvedEffect: LocalTechniqueEffect,
  modeKey: 'statMode' | 'attrMode',
): LocalBuffModifierMode {
  if (hasOwnField(rawEffect, modeKey)) {
    return normalizeTechniqueModifierMode(rawEffect[modeKey]);
  }
  return normalizeTechniqueModifierMode(resolvedEffect[modeKey]);
}

/** 修正当前功法页的技能和效果选择，避免列表刷新后指向失效项。 */
function ensureTechniqueSelection(): void {
  if (!currentTechniqueDraft) {
    currentTechniqueSkillId = null;
    currentTechniqueEffectIndex = null;
    return;
  }
  const skill = getCurrentTechniqueSkill();
  currentTechniqueSkillId = skill?.id ?? null;
  const effectOptions = getTechniqueBuffEffectOptions(skill);
  if (effectOptions.length === 0) {
    currentTechniqueEffectIndex = null;
    return;
  }
  if (currentTechniqueEffectIndex !== null && effectOptions.some((entry) => entry.rawIndex === currentTechniqueEffectIndex)) {
    return;
  }
  currentTechniqueEffectIndex = effectOptions[0]!.rawIndex;
}

/** 根据当前功法和技能状态，刷新技能与 Buff 效果下拉框。 */
function renderTechniqueSelectors(): void {
  if (!currentTechniqueDraft) {
    techniqueSkillSelectEl.innerHTML = '<option value="">没有技能</option>';
    techniqueEffectSelectEl.innerHTML = '<option value="">没有 Buff 效果</option>';
    techniqueSkillSelectEl.disabled = true;
    techniqueEffectSelectEl.disabled = true;
    return;
  }

  ensureTechniqueSelection();
  const skills = currentTechniqueDraft.skills;
  techniqueSkillSelectEl.innerHTML = skills.length > 0
    ? skills.map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === currentTechniqueSkillId ? 'selected' : ''}>${escapeHtml(skill.name)} · ${escapeHtml(skill.id)}</option>`).join('')
    : '<option value="">没有技能</option>';
  techniqueSkillSelectEl.disabled = skills.length === 0;

  const effectOptions = getTechniqueBuffEffectOptions(getCurrentTechniqueSkill());
  techniqueEffectSelectEl.innerHTML = effectOptions.length > 0
    ? effectOptions.map((entry, index) => {
      const label = entry.resolvedEffect.name
        || entry.resolvedEffect.buffId
        || entry.rawEffect.buffRef
        || `Buff 效果 ${index + 1}`;
      const source = entry.rawEffect.buffRef ? '共享模板' : '内联';
      return `<option value="${entry.rawIndex}" ${entry.rawIndex === currentTechniqueEffectIndex ? 'selected' : ''}>${escapeHtml(`效果 ${index + 1} · ${label} · ${source}`)}</option>`;
    }).join('')
    : '<option value="">当前技能没有 Buff 效果</option>';
  techniqueEffectSelectEl.disabled = effectOptions.length === 0;
}

/** 在右侧摘要区展示当前技能的基础信息。 */
function renderTechniqueSkillSummary(): void {
  const skill = getCurrentTechniqueSkill();
  if (!skill) {
    techniqueSkillSummaryEl.innerHTML = '<div class="empty-hint">当前功法没有技能。</div>';
    return;
  }
  const lines = [
    buildTechniqueMetaRow('技能描述', skill.desc || '-'),
    buildTechniqueMetaRow('冷却 / 射程', `${stringifyOptionalNumber(skill.cooldown)} / ${stringifyOptionalNumber(skill.range)}`),
    buildTechniqueMetaRow('消耗倍率 / 消耗', `${stringifyOptionalNumber(skill.costMultiplier)} / ${stringifyOptionalNumber(skill.cost)}`),
    buildTechniqueMetaRow('解锁层数', stringifyOptionalNumber(skill.unlockLevel)),
    buildTechniqueMetaRow('效果数量', `${skill.effects.length} 个，其中 Buff ${getTechniqueBuffEffectOptions(skill).length} 个`),
  ];
  techniqueSkillSummaryEl.innerHTML = lines.join('');
}

/** 在右侧摘要区展示当前 Buff 效果的来源和覆盖信息。 */
function renderTechniqueEffectSummary(): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    const skill = getCurrentTechniqueSkill();
    if (skill) {
      const damageCount = skill.effects.filter((effect) => effect.type === 'damage').length;
      techniqueEffectSummaryEl.innerHTML = [
        buildTechniqueMetaRow('当前状态', '当前技能没有可编辑的 Buff 效果'),
        buildTechniqueMetaRow('其余效果', damageCount > 0 ? `还有 ${damageCount} 个伤害效果` : '没有额外效果'),
      ].join('');
    } else {
      techniqueEffectSummaryEl.innerHTML = '<div class="empty-hint">请选择技能。</div>';
    }
    return;
  }

  const { rawEffect, resolvedEffect } = selection;
  const summary = [
    buildTechniqueMetaRow('效果名称', resolvedEffect.name || resolvedEffect.buffId || rawEffect.buffRef || '未命名效果'),
    buildTechniqueMetaRow('来源', rawEffect.buffRef ? `共享模板 ${rawEffect.buffRef}` : '技能内联配置'),
    buildTechniqueMetaRow('目标 / 持续', `${resolvedEffect.target === 'target' ? '目标' : '自身'} / ${stringifyOptionalNumber(resolvedEffect.duration)} 息`),
    buildTechniqueMetaRow('叠层 / 模式', `${stringifyOptionalNumber(resolvedEffect.maxStacks)} / ${formatTechniqueModeLabel(getTechniqueEffectMode(rawEffect, resolvedEffect, 'statMode'))}`),
    buildTechniqueMetaRow('说明', resolvedEffect.desc || '-'),
  ];
  if (rawEffect.buffRef && !techniqueBuffTemplateById.has(rawEffect.buffRef)) {
    summary.push(buildTechniqueMetaRow('共享模板状态', '未找到对应 buffRef，当前仅显示技能内联字段'));
  }
  techniqueEffectSummaryEl.innerHTML = summary.join('');
}

function buildTechniqueModifierKeyOptions(
  groupKey: TechniqueModifierGroupKey,
  selectedKey: string,
): string {
  const options = ['<option value="">请选择属性</option>'];
  if (groupKey === 'attrs') {
    for (const key of ATTR_KEYS) {
      options.push(`<option value="${escapeHtml(key)}" ${key === selectedKey ? 'selected' : ''}>${escapeHtml(ATTR_KEY_LABELS[key])} · ${escapeHtml(key)}</option>`);
    }
    return options.join('');
  }
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    options.push(`<option value="${escapeHtml(key)}" ${key === selectedKey ? 'selected' : ''}>${escapeHtml(NUMERIC_SCALAR_STAT_LABELS[key])} · ${escapeHtml(key)}</option>`);
  }
  return options.join('');
}

function buildTechniqueModifierRows(
  groupKey: TechniqueModifierGroupKey,
  values: PartialNumericStats | Partial<Attributes>,
): string {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    return '<div class="empty-hint">当前没有配置条目，可用上方按钮新增。</div>';
  }
  return entries.map(([key, value]) => `
    <div class="technique-bonus-row" data-tech-bonus-row data-tech-bonus-group="${escapeHtml(groupKey)}" data-tech-bonus-key="${escapeHtml(key)}">
      <label class="map-field">
        <span>属性</span>
        <select data-tech-bonus-key-select>${buildTechniqueModifierKeyOptions(groupKey, key)}</select>
      </label>
      <label class="map-field">
        <span>${groupKey === 'attrs' ? '数值' : '加成值'}</span>
        <input data-tech-bonus-value-input type="number" step="any" value="${escapeHtml(stringifyOptionalNumber(typeof value === 'number' ? value : Number(value)))}" />
      </label>
      <button class="small-btn danger" type="button" data-tech-remove-row>删除</button>
    </div>
  `).join('');
}

/** 渲染当前 Buff 效果的编辑区，并说明覆盖的是共享模板还是技能内联值。 */
function renderTechniqueEffectEditor(): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    techniqueEffectEditorEl.innerHTML = '<div class="empty-hint">当前技能没有可编辑 Buff 效果，切换别的技能后再编辑。</div>';
    return;
  }

  const { rawEffect, resolvedEffect } = selection;
  const valueStats = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'valueStats') as PartialNumericStats;
  const stats = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'stats') as PartialNumericStats;
  const attrs = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'attrs') as Partial<Attributes>;
  const statMode = getTechniqueEffectMode(rawEffect, resolvedEffect, 'statMode');
  const attrMode = getTechniqueEffectMode(rawEffect, resolvedEffect, 'attrMode');
  const inheritedHint = rawEffect.buffRef
    ? buildTechniqueChip(`共享模板：${rawEffect.buffRef}`)
    : buildTechniqueChip('技能内联配置');
  const missingTemplateHint = rawEffect.buffRef && !techniqueBuffTemplateById.has(rawEffect.buffRef)
    ? buildTechniqueChip('共享模板未找到', 'warn')
    : '';

  techniqueEffectEditorEl.innerHTML = `
    <div class="note-card">
      <div class="editor-section-title">当前编辑上下文</div>
      <div class="editor-note">当前技能页展示的是解析后的生效值；修改后会把当前效果写成技能自己的覆盖字段，不会直接改共享 Buff 模板。</div>
      <div class="button-row">
        ${inheritedHint}
        ${missingTemplateHint}
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">基础数值加成</div>
          <div class="editor-note">这里优先编辑 valueStats。flat 表示基础值，percent 表示百分比；你可以直接在输入框里填百分比。</div>
        </div>
        <label class="map-field" style="min-width: 150px;">
          <span>数值模式</span>
          <select id="technique-stat-mode">
            <option value="flat" ${statMode === 'flat' ? 'selected' : ''}>基础值</option>
            <option value="percent" ${statMode === 'percent' ? 'selected' : ''}>百分比</option>
          </select>
        </label>
      </div>
      <div class="technique-bonus-list">
        <div class="technique-bonus-block">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">基准数值 valueStats</div>
              <div class="editor-note">现有功法技能大多都写在这一组；用于配置基础值加成或百分比加成。</div>
            </div>
            <button class="small-btn" type="button" data-tech-add-row="valueStats">新增条目</button>
          </div>
          <div class="technique-bonus-list">${buildTechniqueModifierRows('valueStats', valueStats)}</div>
        </div>
        <div class="technique-bonus-block">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">直接面板 stats</div>
              <div class="editor-note">保留给少量直接写实际面板值的效果；和 valueStats 共用同一个数值模式。</div>
            </div>
            <button class="small-btn" type="button" data-tech-add-row="stats">新增条目</button>
          </div>
          <div class="technique-bonus-list">${buildTechniqueModifierRows('stats', stats)}</div>
        </div>
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">六维加成</div>
          <div class="editor-note">如果后续某个 Buff 直接给六维，这里也能编辑；当前大部分功法技能通常为空。</div>
        </div>
        <label class="map-field" style="min-width: 150px;">
          <span>六维模式</span>
          <select id="technique-attr-mode">
            <option value="flat" ${attrMode === 'flat' ? 'selected' : ''}>基础值</option>
            <option value="percent" ${attrMode === 'percent' ? 'selected' : ''}>百分比</option>
          </select>
        </label>
      </div>
      <div class="technique-bonus-block">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">六维条目 attrs</div>
            <div class="editor-note">支持体质、神识、感知、资质、悟性和气运。</div>
          </div>
          <button class="small-btn" type="button" data-tech-add-row="attrs">新增条目</button>
        </div>
        <div class="technique-bonus-list">${buildTechniqueModifierRows('attrs', attrs)}</div>
      </div>
    </div>
  `;
}

/** 渲染功法详情面板，并同步技能、效果和编辑器三块区域。 */
function renderTechniquePanel(): void {
  if (!currentTechniqueDraft) {
    techniqueEmptyEl.classList.remove('hidden');
    techniquePanelEl.classList.add('hidden');
    techniqueCurrentNameEl.textContent = '未选择功法';
    techniqueCurrentMetaEl.textContent = '';
    return;
  }

  techniqueEmptyEl.classList.add('hidden');
  techniquePanelEl.classList.remove('hidden');
  techniqueCurrentNameEl.textContent = `${currentTechniqueDraft.name} · ${currentTechniqueDraft.id}`;
  techniqueCurrentMetaEl.textContent = [
    techniqueTemplates.find((entry) => entry.key === currentTechniqueKey)?.filePath ?? '-',
    `第 ${(techniqueTemplates.find((entry) => entry.key === currentTechniqueKey)?.index ?? 0) + 1} 项`,
    TECHNIQUE_GRADE_LABELS[currentTechniqueDraft.grade] ?? currentTechniqueDraft.grade,
    currentTechniqueDraft.category ? (TECHNIQUE_CATEGORY_LABELS[currentTechniqueDraft.category] ?? currentTechniqueDraft.category) : '未分类',
    `境界 ${normalizeTechniqueSortRealmLv(currentTechniqueDraft.realmLv)}`,
  ].join(' · ');
  renderTechniqueSelectors();
  renderTechniqueSkillSummary();
  renderTechniqueEffectSummary();
  renderTechniqueEffectEditor();
}

function ensureTechniqueRawEffectGroup(
  rawEffect: LocalTechniqueEffect,
  resolvedEffect: LocalTechniqueEffect,
  groupKey: TechniqueModifierGroupKey,
): PartialNumericStats | Partial<Attributes> {
  if (groupKey === 'attrs') {
    if (!hasOwnField(rawEffect, groupKey) || !isPlainRecord(rawEffect[groupKey])) {
      rawEffect[groupKey] = { ...(getTechniqueEffectGroup(rawEffect, resolvedEffect, groupKey) as Partial<Attributes>) };
    }
    return rawEffect[groupKey] as Partial<Attributes>;
  }
  if (!hasOwnField(rawEffect, groupKey) || !isPlainRecord(rawEffect[groupKey])) {
    rawEffect[groupKey] = { ...(getTechniqueEffectGroup(rawEffect, resolvedEffect, groupKey) as PartialNumericStats) };
  }
  return rawEffect[groupKey] as PartialNumericStats;
}

function getTechniqueModifierKeys(groupKey: TechniqueModifierGroupKey): readonly string[] {
  return groupKey === 'attrs' ? ATTR_KEYS : NUMERIC_SCALAR_STAT_KEYS;
}

/** 标记功法草稿已被修改，并更新页内状态提示。 */
function markTechniqueDirty(message = '功法技能有未保存修改'): void {
  techniqueDirty = true;
  setTechniqueStatus(message);
}

function updateTechniqueMode(modeKey: 'statMode' | 'attrMode', value: LocalBuffModifierMode): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  selection.rawEffect[modeKey] = value;
  markTechniqueDirty();
  renderTechniqueEffectSummary();
  renderTechniqueEffectEditor();
}

function addTechniqueModifierRow(groupKey: TechniqueModifierGroupKey): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
  const candidateKey = getTechniqueModifierKeys(groupKey).find((key) => !Object.prototype.hasOwnProperty.call(group, key))
    ?? getTechniqueModifierKeys(groupKey)[0];
  if (!candidateKey) {
    return;
  }
  group[candidateKey as keyof typeof group] = 0 as never;
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

function removeTechniqueModifierRow(groupKey: TechniqueModifierGroupKey, key: string): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
  delete group[key as keyof typeof group];
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

function updateTechniqueModifierKey(groupKey: TechniqueModifierGroupKey, previousKey: string, nextKey: string): void {
  if (!nextKey || previousKey === nextKey) {
    return;
  }
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
  const previousValue = group[previousKey as keyof typeof group];
  delete group[previousKey as keyof typeof group];
  group[nextKey as keyof typeof group] = (typeof previousValue === 'number' ? previousValue : 0) as never;
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

function updateTechniqueModifierValue(groupKey: TechniqueModifierGroupKey, key: string, rawValue: string): void {
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
  const value = rawValue.trim();
  if (!value) {
    delete group[key as keyof typeof group];
    markTechniqueDirty();
    return;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    setTechniqueStatus(`字段 ${key} 不是合法数字`, true);
    return;
  }
  group[key as keyof typeof group] = parsed as never;
  markTechniqueDirty();
}

/** 拉取功法模板和共享 Buff 模板，并恢复当前选中项。 */
async function loadTechniqueTemplateList(
  preferredKey?: string | null,
  preferredSkillId?: string | null,
  preferredEffectIndex?: number | null,
): Promise<void> {
  const result = await request<LocalTechniqueListRes>('/api/techniques');
  techniqueTemplates = [...result.techniques].sort(compareTechniqueTemplateEntries);
  techniqueBuffTemplates = result.sharedBuffs;
  techniqueBuffTemplateById = new Map(result.sharedBuffs.map((entry) => [entry.id, entry] as const));
  renderTechniqueList();

  const nextKey = preferredKey && techniqueTemplates.some((entry) => entry.key === preferredKey)
    ? preferredKey
    : (currentTechniqueKey && techniqueTemplates.some((entry) => entry.key === currentTechniqueKey) ? currentTechniqueKey : techniqueTemplates[0]?.key ?? null);

  if (!nextKey) {
    currentTechniqueKey = null;
    currentTechniqueDraft = null;
    currentTechniqueSkillId = null;
    currentTechniqueEffectIndex = null;
    techniqueDirty = false;
    renderTechniquePanel();
    setTechniqueStatus('');
    return;
  }

  await selectTechniqueTemplate(nextKey, false, preferredSkillId ?? currentTechniqueSkillId, preferredEffectIndex ?? currentTechniqueEffectIndex);
}

/** 切换当前编辑的功法模板，必要时先确认是否放弃未保存修改。 */
async function selectTechniqueTemplate(
  key: string,
  announce = true,
  preferredSkillId?: string | null,
  preferredEffectIndex?: number | null,
): Promise<void> {
  if (techniqueDirty && currentTechniqueKey && currentTechniqueKey !== key) {
    const proceed = window.confirm('当前功法技能有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

  const entry = techniqueTemplates.find((item) => item.key === key);
  if (!entry) {
    throw new Error('目标功法不存在');
  }

  currentTechniqueKey = entry.key;
  currentTechniqueDraft = cloneTechniqueTemplateRecord(entry.technique);
  currentTechniqueSkillId = preferredSkillId ?? currentTechniqueDraft.skills[0]?.id ?? null;
  currentTechniqueEffectIndex = preferredEffectIndex ?? null;
  techniqueDirty = false;
  renderTechniqueList();
  renderTechniquePanel();
  setTechniqueStatus(announce ? `已载入功法 ${entry.technique.name}` : '');
}

/** 将当前功法草稿提交到本地 API，并触发服务侧重载。 */
async function saveTechniqueTemplate(): Promise<void> {
  if (!currentTechniqueKey || !currentTechniqueDraft) {
    setTechniqueStatus('请先选择一个功法', true);
    return;
  }

  techniqueSaveBtn.disabled = true;
  try {
    const result = await request<LocalTechniqueSaveRes>('/api/techniques', {
      method: 'PUT',
      body: JSON.stringify({
        key: currentTechniqueKey,
        technique: currentTechniqueDraft,
      }),
    });
    techniqueDirty = false;
    setTechniqueStatus('已保存功法技能');
    setAppStatus(
      serviceManaged
        ? `已写回功法 ${result.technique.name}，编辑器托管的本地服务将自动重启`
        : `已写回功法 ${result.technique.name}；当前未启用服务托管，如需生效请自行重启主游戏服`,
    );
    await loadTechniqueTemplateList(currentTechniqueKey, currentTechniqueSkillId, currentTechniqueEffectIndex);
    await refreshServiceStatus();
  } catch (error) {
    setTechniqueStatus(error instanceof Error ? error.message : '保存功法技能失败', true);
  } finally {
    techniqueSaveBtn.disabled = false;
  }
}

/** 把怪物编辑页的品阶、档位和仇恨模式选项一次性填好。 */
function populateMonsterStaticOptions(): void {
  monsterGradeEl.innerHTML = GRADE_OPTIONS
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  monsterTierEl.innerHTML = MONSTER_TIER_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
  monsterAggroModeEl.innerHTML = AGGRO_MODE_OPTIONS
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join('');
}

function normalizeMonsterSortLevel(level: number | undefined): number {
  if (!Number.isFinite(level)) {
    return 1;
  }
  return Math.max(1, Math.floor(level ?? 1));
}

function resolveMonsterRealmStage(level: number | undefined): PlayerRealmStage {
  const normalizedLevel = normalizeMonsterSortLevel(level);
  for (let index = PLAYER_REALM_ORDER.length - 1; index >= 0; index -= 1) {
    const stage = PLAYER_REALM_ORDER[index]!;
    if (normalizedLevel >= PLAYER_REALM_STAGE_LEVEL_RANGES[stage].levelFrom) {
      return stage;
    }
  }
  return PLAYER_REALM_ORDER[0]!;
}

function getMonsterTierSortWeight(tier: MonsterTier): number {
  return MONSTER_TIER_SORT_ORDER[tier] ?? -1;
}

function getMonsterGradeSortWeight(grade: TechniqueGrade): number {
  return TECHNIQUE_GRADE_SORT_ORDER[grade] ?? -1;
}

function getMonsterRealmStageSortWeight(level: number | undefined): number {
  return PLAYER_REALM_STAGE_SORT_ORDER[resolveMonsterRealmStage(level)] ?? -1;
}

/** 按境界、档位、品阶和名称排序怪物模板，便于编辑器列表查找。 */
function compareMonsterTemplateEntries(left: LocalMonsterTemplateEntry, right: LocalMonsterTemplateEntry): number {
  const realmStageDiff = getMonsterRealmStageSortWeight(right.monster.level) - getMonsterRealmStageSortWeight(left.monster.level);
  if (realmStageDiff !== 0) {
    return realmStageDiff;
  }

  const tierDiff = getMonsterTierSortWeight(right.monster.tier) - getMonsterTierSortWeight(left.monster.tier);
  if (tierDiff !== 0) {
    return tierDiff;
  }

  const gradeDiff = getMonsterGradeSortWeight(right.monster.grade) - getMonsterGradeSortWeight(left.monster.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }

  const levelDiff = normalizeMonsterSortLevel(right.monster.level) - normalizeMonsterSortLevel(left.monster.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }

  const nameDiff = (left.monster.name || left.monster.id).localeCompare(right.monster.name || right.monster.id, 'zh-Hans-CN');
  if (nameDiff !== 0) {
    return nameDiff;
  }

  const idDiff = left.monster.id.localeCompare(right.monster.id);
  if (idDiff !== 0) {
    return idDiff;
  }

  return left.filePath.localeCompare(right.filePath, 'zh-Hans-CN');
}

function formatMonsterListMeta(entry: LocalMonsterTemplateEntry): string {
  const realmStage = resolveMonsterRealmStage(entry.monster.level);
  const realmLabel = PLAYER_REALM_CONFIG[realmStage].shortName;
  return [
    entry.monster.id,
    realmLabel,
    MONSTER_TIER_LABELS[entry.monster.tier],
    TECHNIQUE_GRADE_LABELS[entry.monster.grade],
    entry.filePath,
  ].join(' · ');
}

/** 根据搜索条件渲染怪物模板列表。 */
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
      <div class="config-file-meta">${escapeHtml(formatMonsterListMeta(entry))}</div>
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
  return editorItemById.get(itemId);
}

function isValidItemType(value: string | undefined): value is ItemType {
  return value !== undefined && Object.prototype.hasOwnProperty.call(ITEM_TYPE_LABELS, value);
}

function resolveMonsterDropIdentity(source: Partial<MonsterTemplateDrop> | undefined): MonsterDropIdentity | null {
  const itemId = typeof source?.itemId === 'string' ? source.itemId.trim() : '';
  const name = typeof source?.name === 'string' ? source.name.trim() : '';
  const type = typeof source?.type === 'string' && isValidItemType(source.type) ? source.type : undefined;
  if (!itemId || !name || !type) {
    return null;
  }
  return { itemId, name, type };
}

function getMonsterDropRowIdentity(row: HTMLElement): MonsterDropIdentity | null {
  return resolveMonsterDropIdentity({
    itemId: row.dataset.dropItemId,
    name: row.dataset.dropItemName,
    type: row.dataset.dropItemType as ItemType | undefined,
  });
}

function setMonsterDropRowIdentity(row: HTMLElement, identity: MonsterDropIdentity | null): void {
  if (!identity) {
    delete row.dataset.dropItemId;
    delete row.dataset.dropItemName;
    delete row.dataset.dropItemType;
    return;
  }
  row.dataset.dropItemId = identity.itemId;
  row.dataset.dropItemName = identity.name;
  row.dataset.dropItemType = identity.type;
}

/** 为怪物掉落下拉框拼出可选物品，并兼容模板内临时保留的原始值。 */
function buildEditorItemOptions(selectedItemId = '', fallbackDrop?: Partial<MonsterTemplateDrop>): string {
  const options = ['<option value="">请选择物品</option>'];
  for (const item of editorItems) {
    options.push(
      `<option value="${escapeHtml(item.itemId)}" ${item.itemId === selectedItemId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.itemId)} · ${escapeHtml(getItemTypeLabel(item.type))}</option>`,
    );
  }
  if (selectedItemId && !findEditorItem(selectedItemId)) {
    const fallback = resolveMonsterDropIdentity(fallbackDrop);
    if (fallback && fallback.itemId === selectedItemId) {
      options.push(
        `<option value="${escapeHtml(selectedItemId)}" selected>${escapeHtml(fallback.name)} · ${escapeHtml(selectedItemId)} · ${escapeHtml(getItemTypeLabel(fallback.type))} · 模板内记录</option>`,
      );
    } else {
      options.push(`<option value="${escapeHtml(selectedItemId)}" selected>[缺失物品] ${escapeHtml(selectedItemId)}</option>`);
    }
  }
  return options.join('');
}

/** 只列出和槽位匹配的装备，避免在怪物装备编辑里选错部位。 */
function buildEquipmentItemOptions(slot: EquipSlot, selectedItemId = ''): string {
  const options = ['<option value="">未装备</option>'];
  for (const item of editorItems) {
    if (item.type !== 'equipment' || item.equipSlot !== slot) {
      continue;
    }
    options.push(
      `<option value="${escapeHtml(item.itemId)}" ${item.itemId === selectedItemId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.itemId)}</option>`,
    );
  }
  if (selectedItemId && !findEditorItem(selectedItemId)) {
    options.push(`<option value="${escapeHtml(selectedItemId)}" selected>[缺失装备] ${escapeHtml(selectedItemId)}</option>`);
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
  const fallback = resolveMonsterDropIdentity(drop);
  if (fallback) {
    return `${fallback.name} · ${fallback.itemId} · ${getItemTypeLabel(fallback.type)} · 使用模板内记录`;
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

function buildMonsterAttrInput(key: (typeof ATTR_KEYS)[number], value: number | undefined): string {
  return `
    <div class="monster-stat-card">
      <label class="map-field">
        <span>
          <span>${escapeHtml(ATTR_KEY_LABELS[key])}</span>
          <span class="monster-stat-suffix">${escapeHtml(key)}</span>
        </span>
        <input data-attr-key="${escapeHtml(key)}" type="number" min="0" step="1" value="${escapeHtml(stringifyOptionalNumber(value))}" />
      </label>
    </div>
  `;
}

function buildMonsterStatPercentInput(key: NumericScalarStatKey, value: number | undefined): string {
  return `
    <div class="monster-stat-card">
      <label class="map-field">
        <span>
          <span>${escapeHtml(NUMERIC_SCALAR_STAT_LABELS[key])}</span>
          <span class="monster-stat-suffix">${escapeHtml(key)} %</span>
        </span>
        <input data-stat-percent-key="${escapeHtml(key)}" type="number" min="0" step="any" value="${escapeHtml(stringifyOptionalNumber(value))}" />
      </label>
    </div>
  `;
}

/** 渲染怪物六维的直接编辑区，留空时会交给服务端推导。 */
function renderMonsterAttrsEditor(attrs?: Partial<Attributes>): void {
  monsterAttrsEditorEl.innerHTML = `
    <div class="monster-stat-section">
      <div class="monster-group-head">
        <div class="monster-group-title">六维属性</div>
        <div class="monster-group-note">这里是怪物模板直接配置的六维；为空时，服务端会按旧模板或 valueStats 推导。</div>
      </div>
      <div class="monster-stat-grid">
        ${ATTR_KEYS.map((key) => buildMonsterAttrInput(key, attrs?.[key])).join('')}
      </div>
    </div>
  `;
}

/** 渲染怪物数值倍率编辑区，作为六维推导后的修正层。 */
function renderMonsterStatPercentsEditor(statPercents?: NumericStatPercentages): void {
  monsterStatPercentsEditorEl.innerHTML = `
    <div class="monster-stat-section">
      <div class="monster-group-head">
        <div class="monster-group-title">数值倍率</div>
        <div class="monster-group-note">按百分比作用在六维换算后的基础面板上；留空时，valueStats 模式会自动推导。</div>
      </div>
      <div class="monster-stat-grid">
        ${NUMERIC_SCALAR_STAT_KEYS.map((key) => buildMonsterStatPercentInput(key, statPercents?.[key])).join('')}
      </div>
    </div>
  `;
}

/** 渲染怪物装备槽位编辑区，并按槽位过滤可选装备。 */
function renderMonsterEquipmentEditor(equipment?: Partial<Record<EquipSlot, string>>): void {
  monsterEquipmentEditorEl.innerHTML = `
    <div class="monster-stat-section">
      <div class="monster-group-head">
        <div class="monster-group-title">装备槽位</div>
        <div class="monster-group-note">这里配置的装备会参与怪物真实属性计算，同时也会影响默认掉落。</div>
      </div>
      <div class="monster-stat-grid">
        ${EQUIP_SLOTS.map((slot) => `
          <div class="monster-stat-card">
            <label class="map-field">
              <span>${escapeHtml(EQUIP_SLOT_LABELS[slot])}</span>
              <select data-equip-slot="${escapeHtml(slot)}">${buildEquipmentItemOptions(slot, equipment?.[slot] ?? '')}</select>
            </label>
          </div>
        `).join('')}
      </div>
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

/** 渲染怪物基础数值、额外倍率和五行增减的编辑区。 */
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

/** 只读展示怪物经过推导后的六维结果。 */
function renderMonsterResolvedAttrsPreview(attrs: Attributes): void {
  monsterResolvedAttrsPreviewEl.innerHTML = `
    <div class="monster-computed-grid">
      ${ATTR_KEYS.map((key) => `
        <div class="monster-computed-card">
          <div class="monster-computed-label">${escapeHtml(ATTR_KEY_LABELS[key])}</div>
          <div class="monster-computed-value">${escapeHtml(formatDisplayNumber(attrs[key]))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/** 只读展示怪物的完整计算结果，便于对照服务端实际生效值。 */
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

/** 构建一行怪物掉落编辑项，并附带可读的元信息。 */
function buildMonsterDropRow(drop: Partial<MonsterTemplateDrop>, index: number): string {
  const fallback = resolveMonsterDropIdentity(drop);
  return `
    <div
      class="monster-drop-row"
      data-drop-row
      data-drop-item-id="${escapeHtml(fallback?.itemId ?? '')}"
      data-drop-item-name="${escapeHtml(fallback?.name ?? '')}"
      data-drop-item-type="${escapeHtml(fallback?.type ?? '')}"
    >
      <div class="monster-drop-row-head">
        <div class="monster-drop-row-title" data-drop-row-title>掉落项 ${index + 1}</div>
        <button class="small-btn danger" type="button" data-drop-remove>删除</button>
      </div>
      <div class="monster-drop-grid">
        <label class="map-field wide">
          <span>掉落物品</span>
          <select data-drop-field="itemId">${buildEditorItemOptions(String(drop.itemId ?? ''), drop)}</select>
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

/** 根据当前掉落行数量维护空态提示。 */
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

/** 渲染怪物掉落列表，空时显示占位提示。 */
function renderMonsterDropsEditor(drops: MonsterTemplateDrop[]): void {
  if (drops.length === 0) {
    monsterDropsEditorEl.innerHTML = '<div class="empty-hint" data-drop-empty>当前没有掉落项，点上方“新增掉落”添加。</div>';
    return;
  }
  monsterDropsEditorEl.innerHTML = drops.map((drop, index) => buildMonsterDropRow(drop, index)).join('');
}

/** 在掉落列表末尾新增一行，并把焦点交给物品下拉框。 */
function appendMonsterDropRow(drop: Partial<MonsterTemplateDrop> = {}): void {
  updateMonsterDropEmptyState();
  const rows = monsterDropsEditorEl.querySelectorAll('[data-drop-row]');
  monsterDropsEditorEl.insertAdjacentHTML('beforeend', buildMonsterDropRow(drop, rows.length));
  updateMonsterDropEmptyState();
  const nextRow = monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row]')[rows.length];
  const firstSelect = nextRow?.querySelector<HTMLSelectElement>('select[data-drop-field="itemId"]');
  firstSelect?.focus();
}

/** 重新计算某一行掉落的展示文案，保证选择变化后即时可见。 */
function refreshMonsterDropRowMeta(row: HTMLElement): void {
  const itemId = row.querySelector<HTMLSelectElement>('[data-drop-field="itemId"]')?.value ?? '';
  const metaEl = row.querySelector<HTMLElement>('[data-drop-meta]');
  if (!metaEl) {
    return;
  }
  const identity = getMonsterDropRowIdentity(row);
  metaEl.textContent = buildMonsterDropMeta(identity && identity.itemId === itemId ? identity : { itemId });
}

/** 把怪物草稿回填到各个表单控件和预览区。 */
function fillMonsterForm(monster: MonsterTemplateRecord): void {
  monsterIdEl.value = monster.id;
  monsterNameEl.value = monster.name;
  monsterCharEl.value = monster.char;
  monsterColorEl.value = monster.color;
  monsterGradeEl.value = monster.grade;
  monsterTierEl.value = monster.tier;
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
  renderMonsterAttrsEditor(monster.attrs);
  renderMonsterStatPercentsEditor(monster.statPercents);
  renderMonsterEquipmentEditor(monster.equipment);
  monsterSkillsEl.value = monster.skills.join('\n');
  renderMonsterValueStatsEditor(monster.valueStats);
  renderMonsterResolvedAttrsPreview(monster.resolvedAttrs);
  renderMonsterComputedStatsPreview(monster.computedStats);
  renderMonsterDropsEditor(monster.drops);
}

/** 当经验倍率仍等于旧档位默认值时，跟随档位切换自动改写。 */
function syncMonsterExpMultiplierToTierDefaultIfNeeded(): void {
  if (!currentMonsterDraft) {
    return;
  }
  const previousDefault = MONSTER_TIER_EXP_MULTIPLIERS[currentMonsterDraft.tier];
  const currentValue = Number(monsterExpMultiplierEl.value.trim());
  if (!Number.isFinite(currentValue) || currentValue !== previousDefault) {
    return;
  }
  const nextTier = monsterTierEl.value as MonsterTier;
  monsterExpMultiplierEl.value = String(MONSTER_TIER_EXP_MULTIPLIERS[nextTier]);
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

/** 从六维编辑区收集怪物属性，并过滤掉空输入。 */
function readMonsterAttrsFromEditor(): Partial<Attributes> | undefined {
  let attrs: Partial<Attributes> | undefined;
  for (const input of Array.from(monsterAttrsEditorEl.querySelectorAll<HTMLInputElement>('[data-attr-key]'))) {
    const key = input.dataset.attrKey as (typeof ATTR_KEYS)[number] | undefined;
    if (!key) {
      continue;
    }
    const value = readOptionalDecimalInput(input.value, `六维属性 ${ATTR_KEY_LABELS[key]}`);
    if (value === undefined) {
      continue;
    }
    attrs ??= {};
    attrs[key] = Math.max(0, Math.floor(value));
  }
  return attrs;
}

/** 从数值倍率编辑区收集怪物百分比修正。 */
function readMonsterStatPercentsFromEditor(): NumericStatPercentages | undefined {
  let statPercents: NumericStatPercentages | undefined;
  for (const input of Array.from(monsterStatPercentsEditorEl.querySelectorAll<HTMLInputElement>('[data-stat-percent-key]'))) {
    const key = input.dataset.statPercentKey as NumericScalarStatKey | undefined;
    if (!key) {
      continue;
    }
    const value = readOptionalDecimalInput(input.value, `数值倍率 ${NUMERIC_SCALAR_STAT_LABELS[key]}`);
    if (value === undefined) {
      continue;
    }
    statPercents ??= {};
    statPercents[key] = Math.max(0, value);
  }
  return statPercents;
}

/** 从装备槽位编辑区收集怪物装备配置。 */
function readMonsterEquipmentFromEditor(): Partial<Record<EquipSlot, string>> | undefined {
  let equipment: Partial<Record<EquipSlot, string>> | undefined;
  for (const select of Array.from(monsterEquipmentEditorEl.querySelectorAll<HTMLSelectElement>('[data-equip-slot]'))) {
    const slot = select.dataset.equipSlot as EquipSlot | undefined;
    const itemId = select.value.trim();
    if (!slot || !itemId) {
      continue;
    }
    equipment ??= {};
    equipment[slot] = itemId;
  }
  return equipment;
}

/** 读取怪物技能 ID 列表，并去重去空。 */
function readMonsterSkillsFromEditor(): string[] {
  const entries = monsterSkillsEl.value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(entries));
}

/** 从基础数值和元素增减区收集怪物 valueStats。 */
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

/** 从掉落编辑区收集怪物掉落项，并校验物品、数量和概率。 */
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
    const fallback = getMonsterDropRowIdentity(row);
    const resolved = item ?? (fallback && fallback.itemId === itemId ? fallback : null);
    if (!resolved) {
      throw new Error(itemId ? `掉落物品不存在: ${itemId}` : '掉落项必须选择物品');
    }
    const count = countRaw ? Number(countRaw) : 1;
    const chancePercent = chanceRaw ? Number(chanceRaw) : undefined;
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error(`掉落配置 ${resolved.name} 的数量必须大于 0`);
    }
    if (chancePercent !== undefined && (!Number.isFinite(chancePercent) || chancePercent < 0 || chancePercent > 100)) {
      throw new Error(`掉落配置 ${resolved.name} 的概率必须在 0 到 100 之间`);
    }
    drops.push({
      itemId: resolved.itemId,
      name: resolved.name,
      type: resolved.type,
      count: Math.max(1, Math.floor(count)),
      chance: chancePercent === undefined ? undefined : chancePercent / 100,
    });
  }
  return drops;
}

/** 读取怪物表单并生成服务端可保存的完整草稿，同时刷新预览。 */
function syncMonsterDraftFromForm(): MonsterTemplateRecord {
  const attrs = readMonsterAttrsFromEditor();
  const statPercents = readMonsterStatPercentsFromEditor();
  const equipment = readMonsterEquipmentFromEditor();
  const skills = readMonsterSkillsFromEditor();
  const valueStats = readMonsterValueStatsFromEditor();
  const drops = readMonsterDropsFromEditor();
  const nextDraft = resolveMonsterTemplateRecord({
    id: monsterIdEl.value.trim(),
    name: monsterNameEl.value.trim(),
    char: monsterCharEl.value.trim(),
    color: monsterColorEl.value.trim(),
    grade: monsterGradeEl.value as TechniqueGrade,
    tier: monsterTierEl.value as MonsterTier,
    attrs,
    statPercents,
    equipment,
    skills,
    valueStats,
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
    hp: currentMonsterDraft?.hp,
    maxHp: currentMonsterDraft?.maxHp,
    attack: currentMonsterDraft?.attack,
  }, editorItemById);
  monsterHpEl.value = String(nextDraft.hp);
  monsterMaxHpEl.value = String(nextDraft.maxHp);
  monsterAttackEl.value = String(nextDraft.attack);
  renderMonsterResolvedAttrsPreview(nextDraft.resolvedAttrs);
  renderMonsterComputedStatsPreview(nextDraft.computedStats);
  currentMonsterDraft = nextDraft;
  return nextDraft;
}

/** 怪物表单任一字段变更后，标记脏态并尝试同步派生预览。 */
function onMonsterFormInput(): void {
  monsterDirty = true;
  try {
    syncMonsterDraftFromForm();
    setMonsterStatus('怪物模板有未保存修改');
  } catch (error) {
    setMonsterStatus(error instanceof Error ? error.message : '怪物模板输入非法', true);
  }
}

/** 拉取怪物模板列表并恢复当前选中项。 */
async function loadMonsterTemplateList(preferredKey?: string | null): Promise<void> {
  const result = await request<LocalMonsterTemplateListRes>('/api/monsters');
  monsterTemplates = [...result.monsters].sort(compareMonsterTemplateEntries);
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

/** 切换当前怪物模板，必要时先确认是否丢弃未保存修改。 */
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
  monsterCurrentMetaEl.textContent = `${entry.filePath} · 第 ${entry.index + 1} 项 · ${MONSTER_SOURCE_MODE_LABELS[entry.monster.sourceMode]}`;
  fillMonsterForm(currentMonsterDraft);
  setMonsterStatus(announce ? `已载入怪物模板 ${entry.monster.name}` : '');
  renderMonsterList();
}

/** 将当前怪物草稿保存到本地 API，并同步更新地图引用。 */
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
    setAppStatus(
      serviceManaged
        ? `已写回怪物模板 ${result.monster.name}，编辑器托管的本地服务将自动重启`
        : `已写回怪物模板 ${result.monster.name}；当前未启用服务托管，如需生效请自行重启主游戏服`,
    );
    await loadMonsterTemplateList(currentMonsterKey);
    await refreshServiceStatus();
  } catch (error) {
    setMonsterStatus(error instanceof Error ? error.message : '保存怪物模板失败', true);
  } finally {
    monsterSaveBtn.disabled = false;
  }
}

/** 加载物品目录，供怪物装备和掉落下拉框使用。 */
async function loadEditorCatalog(): Promise<void> {
  const result = await request<LocalEditorCatalogRes>('/api/editor-catalog');
  editorItems = result.items;
  editorItemById = new Map(result.items.map((item) => [item.itemId, item] as const));
  mapEditor?.setItemCatalog(result.items);
  if (currentMonsterDraft) {
    renderMonsterEquipmentEditor(currentMonsterDraft.equipment);
    renderMonsterDropsEditor(currentMonsterDraft.drops);
    if (!monsterDirty) {
      syncMonsterDraftFromForm();
    }
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

/** 拉取内容配置文件列表，并在首次进入时自动打开第一项。 */
async function loadConfigFileList(): Promise<void> {
  const result = await request<LocalConfigFileListRes>('/api/config-files');
  configFiles = result.files;
  renderConfigFileList();
  if (!currentConfigFilePath && configFiles.length > 0) {
    await selectConfigFile(configFiles[0]!.path, false);
  }
}

/** 切换当前配置文件，必要时先确认是否放弃未保存修改。 */
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

/** 保存当前 JSON 配置文件，并把结果交给本地 API 统一写盘。 */
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
    setAppStatus(
      serviceManaged
        ? `已写回 ${currentConfigFilePath}，编辑器托管的本地服务将自动重启`
        : `已写回 ${currentConfigFilePath}；当前未启用服务托管，如需生效请自行重启主游戏服`,
    );
    await refreshServiceStatus();
  } catch (error) {
    setConfigFileStatus(error instanceof Error ? error.message : '保存配置文件失败', true);
  } finally {
    configFileSaveBtn.disabled = false;
  }
}

/** 把本地服务托管状态同步到页面右侧服务面板。 */
function renderServiceStatus(status: LocalServerStatusRes): void {
  serviceManaged = status.managed;
  serviceSummaryEl.textContent = status.managed
    ? status.running
      ? `编辑器托管服务运行中 · PID ${status.pid ?? '-'}`
      : '编辑器托管服务当前未运行'
    : '当前未启用服务托管，编辑器不会自动拉起主游戏服';
  serviceRunningValueEl.textContent = status.managed ? (status.running ? '运行中' : '未运行') : '未托管';
  serviceRunningMetaEl.textContent = status.managed
    ? status.running
      ? `当前进程 PID: ${status.pid ?? '-'}`
      : '若服务刚重启，状态会在几秒内恢复。'
    : '如需启用，请使用 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 重新启动编辑器。';
  serviceModeEl.textContent = status.mode;
  serviceLastRestartAtEl.textContent = status.lastRestartAt ? new Date(status.lastRestartAt).toLocaleString() : '-';
  serviceLastRestartReasonEl.textContent = status.lastRestartReason ?? '-';
  servicePidEl.textContent = status.pid ? String(status.pid) : '-';
  serviceRestartBtn.disabled = !status.managed;
}

/** 主动刷新一次本地服务托管状态。 */
async function refreshServiceStatus(): Promise<void> {
  try {
    const status = await request<LocalServerStatusRes>('/api/server/status');
    renderServiceStatus(status);
  } catch (error) {
    setAppStatus(error instanceof Error ? error.message : '读取服务状态失败', true);
  }
}

/** 触发本地 API 里的服务重启流程。 */
async function restartService(): Promise<void> {
  serviceRestartBtn.disabled = true;
  try {
    await request<BasicOkRes>('/api/server/restart', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setAppStatus('已触发编辑器托管服务重启');
    await refreshServiceStatus();
  } catch (error) {
    setAppStatus(error instanceof Error ? error.message : '重启服务失败', true);
  } finally {
    serviceRestartBtn.disabled = !serviceManaged;
  }
}

/** 绑定整个编辑器的交互事件，避免页面初始化后还要分散注册。 */
function bindEvents(): void {
  pageTabs.maps.addEventListener('click', () => switchPage('maps'));
  pageTabs.monsters.addEventListener('click', () => switchPage('monsters'));
  pageTabs.skills.addEventListener('click', () => switchPage('skills'));
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

  techniqueSearchEl.addEventListener('input', () => renderTechniqueList());
  techniqueRefreshBtn.addEventListener('click', () => {
    loadTechniqueTemplateList(currentTechniqueKey, currentTechniqueSkillId, currentTechniqueEffectIndex).catch((error: unknown) => {
      setTechniqueStatus(error instanceof Error ? error.message : '加载功法列表失败', true);
    });
  });
  techniqueListEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-technique-key]');
    const key = button?.dataset.techniqueKey;
    if (!key) return;
    selectTechniqueTemplate(key).catch((error: unknown) => {
      setTechniqueStatus(error instanceof Error ? error.message : '读取功法失败', true);
    });
  });
  techniqueSkillSelectEl.addEventListener('change', () => {
    currentTechniqueSkillId = techniqueSkillSelectEl.value || null;
    currentTechniqueEffectIndex = null;
    renderTechniquePanel();
  });
  techniqueEffectSelectEl.addEventListener('change', () => {
    const value = techniqueEffectSelectEl.value.trim();
    currentTechniqueEffectIndex = value ? Number(value) : null;
    renderTechniqueEffectSummary();
    renderTechniqueEffectEditor();
  });
  techniqueEffectEditorEl.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLSelectElement && target.id === 'technique-stat-mode') {
      updateTechniqueMode('statMode', target.value === 'flat' ? 'flat' : 'percent');
      return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'technique-attr-mode') {
      updateTechniqueMode('attrMode', target.value === 'flat' ? 'flat' : 'percent');
      return;
    }
    if (target instanceof HTMLSelectElement && target.hasAttribute('data-tech-bonus-key-select')) {
      const row = target.closest<HTMLElement>('[data-tech-bonus-row]');
      const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
      const previousKey = row?.dataset.techBonusKey;
      if (!groupKey || !previousKey) {
        return;
      }
      updateTechniqueModifierKey(groupKey, previousKey, target.value.trim());
    }
  });
  techniqueEffectEditorEl.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-tech-bonus-value-input')) {
      return;
    }
    const row = target.closest<HTMLElement>('[data-tech-bonus-row]');
    const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
    const key = row?.dataset.techBonusKey;
    if (!groupKey || !key) {
      return;
    }
    updateTechniqueModifierValue(groupKey, key, target.value);
  });
  techniqueEffectEditorEl.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const addButton = target.closest<HTMLButtonElement>('[data-tech-add-row]');
    if (addButton) {
      addTechniqueModifierRow(addButton.dataset.techAddRow as TechniqueModifierGroupKey);
      return;
    }
    const removeButton = target.closest<HTMLButtonElement>('[data-tech-remove-row]');
    if (!removeButton) {
      return;
    }
    const row = removeButton.closest<HTMLElement>('[data-tech-bonus-row]');
    const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
    const key = row?.dataset.techBonusKey;
    if (!groupKey || !key) {
      return;
    }
    removeTechniqueModifierRow(groupKey, key);
  });
  techniqueSaveBtn.addEventListener('click', () => {
    saveTechniqueTemplate().catch(() => {});
  });
  techniqueReloadBtn.addEventListener('click', () => {
    if (!currentTechniqueKey) return;
    selectTechniqueTemplate(currentTechniqueKey, true, currentTechniqueSkillId, currentTechniqueEffectIndex).catch((error: unknown) => {
      setTechniqueStatus(error instanceof Error ? error.message : '重新读取功法失败', true);
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
  monsterTierEl.addEventListener('change', syncMonsterExpMultiplierToTierDefaultIfNeeded);
  [
    monsterIdEl,
    monsterNameEl,
    monsterCharEl,
    monsterColorEl,
    monsterGradeEl,
    monsterTierEl,
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
    monsterSkillsEl,
  ].forEach((element) => {
    element.addEventListener('input', onMonsterFormInput);
    element.addEventListener('change', onMonsterFormInput);
  });
  monsterAttrsEditorEl.addEventListener('input', onMonsterFormInput);
  monsterAttrsEditorEl.addEventListener('change', onMonsterFormInput);
  monsterStatPercentsEditorEl.addEventListener('input', onMonsterFormInput);
  monsterStatPercentsEditorEl.addEventListener('change', onMonsterFormInput);
  monsterEquipmentEditorEl.addEventListener('input', onMonsterFormInput);
  monsterEquipmentEditorEl.addEventListener('change', onMonsterFormInput);
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
    const item = findEditorItem(select.value);
    if (item) {
      setMonsterDropRowIdentity(row, {
        itemId: item.itemId,
        name: item.name,
        type: item.type,
      });
    } else if (getMonsterDropRowIdentity(row)?.itemId !== select.value) {
      setMonsterDropRowIdentity(row, null);
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

/** 初始化编辑器页面、嵌入式地图编辑器和各类数据源。 */
async function bootstrap(): Promise<void> {
  populateMonsterStaticOptions();
  bindEvents();
  const nextMapEditor = new GmMapEditor(request, setAppStatus, {
    mapApiBasePath: '/api/maps',
    syncedSummaryLabel: '已与本地文件同步',
    itemCatalog: editorItems,
  });
  mapEditor = nextMapEditor;
  switchMapSideTab(currentMapSideTab);

  await Promise.all([
    nextMapEditor.ensureLoaded(),
    loadEditorCatalog(),
    loadTechniqueTemplateList(),
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
