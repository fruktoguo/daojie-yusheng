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
} from '@mud/shared';
import { GmMapEditor } from '../../client/src/gm-map-editor';

/** PageId：定义该类型的结构与数据语义。 */
type PageId = 'maps' | 'monsters' | 'skills' | 'files' | 'service';

/** LocalConfigFileSummary：定义该类型的结构与数据语义。 */
type LocalConfigFileSummary = {
/** path：定义该变量以承载业务值。 */
  path: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** category：定义该变量以承载业务值。 */
  category: string;
};

/** LocalConfigFileListRes：定义该类型的结构与数据语义。 */
type LocalConfigFileListRes = {
/** files：定义该变量以承载业务值。 */
  files: LocalConfigFileSummary[];
};

/** LocalConfigFileRes：定义该类型的结构与数据语义。 */
type LocalConfigFileRes = {
/** path：定义该变量以承载业务值。 */
  path: string;
/** content：定义该变量以承载业务值。 */
  content: string;
};

/** LocalBuffModifierMode：定义该类型的结构与数据语义。 */
type LocalBuffModifierMode = 'flat' | 'percent';

/** LocalTechniqueBuffTemplate：定义该类型的结构与数据语义。 */
type LocalTechniqueBuffTemplate = {
/** id：定义该变量以承载业务值。 */
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

/** LocalTechniqueEffect：定义该类型的结构与数据语义。 */
type LocalTechniqueEffect = {
/** type：定义该变量以承载业务值。 */
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

/** LocalTechniqueSkill：定义该类型的结构与数据语义。 */
type LocalTechniqueSkill = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
  cooldown?: number;
  cost?: number;
  costMultiplier?: number;
  range?: number;
  unlockLevel?: number;
  unlockRealm?: number | string;
/** effects：定义该变量以承载业务值。 */
  effects: LocalTechniqueEffect[];
  [key: string]: unknown;
};

/** LocalTechniqueTemplateRecord：定义该类型的结构与数据语义。 */
type LocalTechniqueTemplateRecord = {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** grade：定义该变量以承载业务值。 */
  grade: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  layers?: TechniqueLayerDef[];
/** skills：定义该变量以承载业务值。 */
  skills: LocalTechniqueSkill[];
  [key: string]: unknown;
};

/** LocalTechniqueEntry：定义该类型的结构与数据语义。 */
type LocalTechniqueEntry = {
/** key：定义该变量以承载业务值。 */
  key: string;
/** filePath：定义该变量以承载业务值。 */
  filePath: string;
/** index：定义该变量以承载业务值。 */
  index: number;
/** technique：定义该变量以承载业务值。 */
  technique: LocalTechniqueTemplateRecord;
};

/** LocalTechniqueListRes：定义该类型的结构与数据语义。 */
type LocalTechniqueListRes = {
/** techniques：定义该变量以承载业务值。 */
  techniques: LocalTechniqueEntry[];
/** sharedBuffs：定义该变量以承载业务值。 */
  sharedBuffs: LocalTechniqueBuffTemplate[];
};

/** LocalTechniqueSaveRes：定义该类型的结构与数据语义。 */
type LocalTechniqueSaveRes = BasicOkRes & {
/** technique：定义该变量以承载业务值。 */
  technique: LocalTechniqueTemplateRecord;
};

/** LocalServerStatusRes：定义该类型的结构与数据语义。 */
type LocalServerStatusRes = {
/** managed：定义该变量以承载业务值。 */
  managed: boolean;
/** running：定义该变量以承载业务值。 */
  running: boolean;
  pid?: number;
  lastRestartAt?: string;
  lastRestartReason?: string;
/** mode：定义该变量以承载业务值。 */
  mode: string;
};

/** MonsterTemplateDrop：定义该类型的结构与数据语义。 */
type MonsterTemplateDrop = MonsterTemplateDropRecord;
/** MonsterTemplateRecord：定义该类型的结构与数据语义。 */
type MonsterTemplateRecord = MonsterTemplateResolvedRecord;

/** LocalMonsterTemplateEntry：定义该类型的结构与数据语义。 */
type LocalMonsterTemplateEntry = {
/** key：定义该变量以承载业务值。 */
  key: string;
/** filePath：定义该变量以承载业务值。 */
  filePath: string;
/** index：定义该变量以承载业务值。 */
  index: number;
/** monster：定义该变量以承载业务值。 */
  monster: MonsterTemplateRecord;
};

/** LocalMonsterTemplateListRes：定义该类型的结构与数据语义。 */
type LocalMonsterTemplateListRes = {
/** monsters：定义该变量以承载业务值。 */
  monsters: LocalMonsterTemplateEntry[];
};

/** LocalMonsterSaveRes：定义该类型的结构与数据语义。 */
type LocalMonsterSaveRes = BasicOkRes & {
/** updatedMapCount：定义该变量以承载业务值。 */
  updatedMapCount: number;
/** monster：定义该变量以承载业务值。 */
  monster: MonsterTemplateRecord;
};

/** LocalEditorItemOption：定义该类型的结构与数据语义。 */
type LocalEditorItemOption = MonsterTemplateEditorItem;

/** LocalEditorCatalogRes：定义该类型的结构与数据语义。 */
type LocalEditorCatalogRes = {
/** items：定义该变量以承载业务值。 */
  items: LocalEditorItemOption[];
};

/** MonsterDropIdentity：定义该类型的结构与数据语义。 */
type MonsterDropIdentity = Pick<MonsterTemplateDrop, 'itemId' | 'name' | 'type'>;

/** MapSideTabId：定义该类型的结构与数据语义。 */
type MapSideTabId = 'overview' | 'inspector' | 'json';
/** TechniqueModifierGroupKey：定义该类型的结构与数据语义。 */
type TechniqueModifierGroupKey = 'valueStats' | 'stats' | 'attrs';

/** appStatusBarEl：定义该变量以承载业务值。 */
const appStatusBarEl = document.getElementById('app-status-bar') as HTMLDivElement;
/** serviceSummaryEl：定义该变量以承载业务值。 */
const serviceSummaryEl = document.getElementById('service-summary') as HTMLDivElement;

/** pageMap：定义该变量以承载业务值。 */
const pageMap = {
  maps: document.getElementById('page-maps') as HTMLElement,
  monsters: document.getElementById('page-monsters') as HTMLElement,
  skills: document.getElementById('page-skills') as HTMLElement,
  files: document.getElementById('page-files') as HTMLElement,
  service: document.getElementById('page-service') as HTMLElement,
};

/** pageTabs：定义该变量以承载业务值。 */
const pageTabs = {
  maps: document.getElementById('page-tab-maps') as HTMLButtonElement,
  monsters: document.getElementById('page-tab-monsters') as HTMLButtonElement,
  skills: document.getElementById('page-tab-skills') as HTMLButtonElement,
  files: document.getElementById('page-tab-files') as HTMLButtonElement,
  service: document.getElementById('page-tab-service') as HTMLButtonElement,
};

/** mapSideTabs：定义该变量以承载业务值。 */
const mapSideTabs = {
  overview: document.getElementById('map-side-tab-overview') as HTMLButtonElement,
  inspector: document.getElementById('map-side-tab-inspector') as HTMLButtonElement,
  json: document.getElementById('map-side-tab-json') as HTMLButtonElement,
};

/** mapSidePanels：定义该变量以承载业务值。 */
const mapSidePanels = {
  overview: document.getElementById('map-side-panel-overview') as HTMLDivElement,
  inspector: document.getElementById('map-side-panel-inspector') as HTMLDivElement,
  json: document.getElementById('map-side-panel-json') as HTMLDivElement,
};

/** configFileSearchEl：定义该变量以承载业务值。 */
const configFileSearchEl = document.getElementById('config-file-search') as HTMLInputElement;
/** configFileRefreshBtn：定义该变量以承载业务值。 */
const configFileRefreshBtn = document.getElementById('config-file-refresh') as HTMLButtonElement;
/** configFileListEl：定义该变量以承载业务值。 */
const configFileListEl = document.getElementById('config-file-list') as HTMLDivElement;
/** configFileEmptyEl：定义该变量以承载业务值。 */
const configFileEmptyEl = document.getElementById('config-file-empty') as HTMLDivElement;
/** configFilePanelEl：定义该变量以承载业务值。 */
const configFilePanelEl = document.getElementById('config-file-panel') as HTMLDivElement;
/** configFileCurrentNameEl：定义该变量以承载业务值。 */
const configFileCurrentNameEl = document.getElementById('config-file-current-name') as HTMLDivElement;
/** configFileCurrentMetaEl：定义该变量以承载业务值。 */
const configFileCurrentMetaEl = document.getElementById('config-file-current-meta') as HTMLDivElement;
/** configFileEditorEl：定义该变量以承载业务值。 */
const configFileEditorEl = document.getElementById('config-file-editor') as HTMLTextAreaElement;
/** configFileSaveBtn：定义该变量以承载业务值。 */
const configFileSaveBtn = document.getElementById('config-file-save') as HTMLButtonElement;
/** configFileReloadBtn：定义该变量以承载业务值。 */
const configFileReloadBtn = document.getElementById('config-file-reload') as HTMLButtonElement;
/** configFileStatusEl：定义该变量以承载业务值。 */
const configFileStatusEl = document.getElementById('config-file-status') as HTMLDivElement;

/** techniqueSearchEl：定义该变量以承载业务值。 */
const techniqueSearchEl = document.getElementById('technique-search') as HTMLInputElement;
/** techniqueRefreshBtn：定义该变量以承载业务值。 */
const techniqueRefreshBtn = document.getElementById('technique-refresh') as HTMLButtonElement;
/** techniqueListEl：定义该变量以承载业务值。 */
const techniqueListEl = document.getElementById('technique-list') as HTMLDivElement;
/** techniqueEmptyEl：定义该变量以承载业务值。 */
const techniqueEmptyEl = document.getElementById('technique-empty') as HTMLDivElement;
/** techniquePanelEl：定义该变量以承载业务值。 */
const techniquePanelEl = document.getElementById('technique-panel') as HTMLDivElement;
/** techniqueCurrentNameEl：定义该变量以承载业务值。 */
const techniqueCurrentNameEl = document.getElementById('technique-current-name') as HTMLDivElement;
/** techniqueCurrentMetaEl：定义该变量以承载业务值。 */
const techniqueCurrentMetaEl = document.getElementById('technique-current-meta') as HTMLDivElement;
/** techniqueSaveBtn：定义该变量以承载业务值。 */
const techniqueSaveBtn = document.getElementById('technique-save') as HTMLButtonElement;
/** techniqueReloadBtn：定义该变量以承载业务值。 */
const techniqueReloadBtn = document.getElementById('technique-reload') as HTMLButtonElement;
/** techniqueSkillSelectEl：定义该变量以承载业务值。 */
const techniqueSkillSelectEl = document.getElementById('technique-skill-select') as HTMLSelectElement;
/** techniqueEffectSelectEl：定义该变量以承载业务值。 */
const techniqueEffectSelectEl = document.getElementById('technique-effect-select') as HTMLSelectElement;
/** techniqueSkillSummaryEl：定义该变量以承载业务值。 */
const techniqueSkillSummaryEl = document.getElementById('technique-skill-summary') as HTMLDivElement;
/** techniqueEffectSummaryEl：定义该变量以承载业务值。 */
const techniqueEffectSummaryEl = document.getElementById('technique-effect-summary') as HTMLDivElement;
/** techniqueEffectEditorEl：定义该变量以承载业务值。 */
const techniqueEffectEditorEl = document.getElementById('technique-effect-editor') as HTMLDivElement;
/** techniqueStatusEl：定义该变量以承载业务值。 */
const techniqueStatusEl = document.getElementById('technique-status') as HTMLDivElement;

/** monsterSearchEl：定义该变量以承载业务值。 */
const monsterSearchEl = document.getElementById('monster-search') as HTMLInputElement;
/** monsterRefreshBtn：定义该变量以承载业务值。 */
const monsterRefreshBtn = document.getElementById('monster-refresh') as HTMLButtonElement;
/** monsterListEl：定义该变量以承载业务值。 */
const monsterListEl = document.getElementById('monster-list') as HTMLDivElement;
/** monsterEmptyEl：定义该变量以承载业务值。 */
const monsterEmptyEl = document.getElementById('monster-empty') as HTMLDivElement;
/** monsterPanelEl：定义该变量以承载业务值。 */
const monsterPanelEl = document.getElementById('monster-panel') as HTMLDivElement;
/** monsterCurrentNameEl：定义该变量以承载业务值。 */
const monsterCurrentNameEl = document.getElementById('monster-current-name') as HTMLDivElement;
/** monsterCurrentMetaEl：定义该变量以承载业务值。 */
const monsterCurrentMetaEl = document.getElementById('monster-current-meta') as HTMLDivElement;
/** monsterSaveBtn：定义该变量以承载业务值。 */
const monsterSaveBtn = document.getElementById('monster-save') as HTMLButtonElement;
/** monsterReloadBtn：定义该变量以承载业务值。 */
const monsterReloadBtn = document.getElementById('monster-reload') as HTMLButtonElement;
/** monsterStatusEl：定义该变量以承载业务值。 */
const monsterStatusEl = document.getElementById('monster-status') as HTMLDivElement;
/** monsterIdEl：定义该变量以承载业务值。 */
const monsterIdEl = document.getElementById('monster-id') as HTMLInputElement;
/** monsterNameEl：定义该变量以承载业务值。 */
const monsterNameEl = document.getElementById('monster-name') as HTMLInputElement;
/** monsterCharEl：定义该变量以承载业务值。 */
const monsterCharEl = document.getElementById('monster-char') as HTMLInputElement;
/** monsterColorEl：定义该变量以承载业务值。 */
const monsterColorEl = document.getElementById('monster-color') as HTMLInputElement;
/** monsterGradeEl：定义该变量以承载业务值。 */
const monsterGradeEl = document.getElementById('monster-grade') as HTMLSelectElement;
/** monsterTierEl：定义该变量以承载业务值。 */
const monsterTierEl = document.getElementById('monster-tier') as HTMLSelectElement;
/** monsterAggroModeEl：定义该变量以承载业务值。 */
const monsterAggroModeEl = document.getElementById('monster-aggro-mode') as HTMLSelectElement;
/** monsterHpEl：定义该变量以承载业务值。 */
const monsterHpEl = document.getElementById('monster-hp') as HTMLInputElement;
/** monsterMaxHpEl：定义该变量以承载业务值。 */
const monsterMaxHpEl = document.getElementById('monster-max-hp') as HTMLInputElement;
/** monsterAttackEl：定义该变量以承载业务值。 */
const monsterAttackEl = document.getElementById('monster-attack') as HTMLInputElement;
/** monsterLevelEl：定义该变量以承载业务值。 */
const monsterLevelEl = document.getElementById('monster-level') as HTMLInputElement;
/** monsterCountEl：定义该变量以承载业务值。 */
const monsterCountEl = document.getElementById('monster-count') as HTMLInputElement;
/** monsterMaxAliveEl：定义该变量以承载业务值。 */
const monsterMaxAliveEl = document.getElementById('monster-max-alive') as HTMLInputElement;
/** monsterRadiusEl：定义该变量以承载业务值。 */
const monsterRadiusEl = document.getElementById('monster-radius') as HTMLInputElement;
/** monsterExpMultiplierEl：定义该变量以承载业务值。 */
const monsterExpMultiplierEl = document.getElementById('monster-exp-multiplier') as HTMLInputElement;
/** monsterAggroRangeEl：定义该变量以承载业务值。 */
const monsterAggroRangeEl = document.getElementById('monster-aggro-range') as HTMLInputElement;
/** monsterViewRangeEl：定义该变量以承载业务值。 */
const monsterViewRangeEl = document.getElementById('monster-view-range') as HTMLInputElement;
/** monsterRespawnSecEl：定义该变量以承载业务值。 */
const monsterRespawnSecEl = document.getElementById('monster-respawn-sec') as HTMLInputElement;
/** monsterRespawnTicksEl：定义该变量以承载业务值。 */
const monsterRespawnTicksEl = document.getElementById('monster-respawn-ticks') as HTMLInputElement;
/** monsterAttrsEditorEl：定义该变量以承载业务值。 */
const monsterAttrsEditorEl = document.getElementById('monster-attrs-editor') as HTMLDivElement;
/** monsterStatPercentsEditorEl：定义该变量以承载业务值。 */
const monsterStatPercentsEditorEl = document.getElementById('monster-stat-percents-editor') as HTMLDivElement;
/** monsterEquipmentEditorEl：定义该变量以承载业务值。 */
const monsterEquipmentEditorEl = document.getElementById('monster-equipment-editor') as HTMLDivElement;
/** monsterSkillsEl：定义该变量以承载业务值。 */
const monsterSkillsEl = document.getElementById('monster-skills') as HTMLTextAreaElement;
/** monsterValueStatsEditorEl：定义该变量以承载业务值。 */
const monsterValueStatsEditorEl = document.getElementById('monster-value-stats-editor') as HTMLDivElement;
/** monsterResolvedAttrsPreviewEl：定义该变量以承载业务值。 */
const monsterResolvedAttrsPreviewEl = document.getElementById('monster-resolved-attrs-preview') as HTMLDivElement;
/** monsterComputedStatsPreviewEl：定义该变量以承载业务值。 */
const monsterComputedStatsPreviewEl = document.getElementById('monster-computed-stats-preview') as HTMLDivElement;
/** monsterDropsEditorEl：定义该变量以承载业务值。 */
const monsterDropsEditorEl = document.getElementById('monster-drops-editor') as HTMLDivElement;
/** monsterDropAddBtn：定义该变量以承载业务值。 */
const monsterDropAddBtn = document.getElementById('monster-drop-add') as HTMLButtonElement;

/** serviceRunningValueEl：定义该变量以承载业务值。 */
const serviceRunningValueEl = document.getElementById('service-running-value') as HTMLDivElement;
/** serviceRunningMetaEl：定义该变量以承载业务值。 */
const serviceRunningMetaEl = document.getElementById('service-running-meta') as HTMLDivElement;
/** serviceModeEl：定义该变量以承载业务值。 */
const serviceModeEl = document.getElementById('service-mode') as HTMLDivElement;
/** serviceLastRestartAtEl：定义该变量以承载业务值。 */
const serviceLastRestartAtEl = document.getElementById('service-last-restart-at') as HTMLDivElement;
/** serviceLastRestartReasonEl：定义该变量以承载业务值。 */
const serviceLastRestartReasonEl = document.getElementById('service-last-restart-reason') as HTMLDivElement;
/** servicePidEl：定义该变量以承载业务值。 */
const servicePidEl = document.getElementById('service-pid') as HTMLDivElement;
/** serviceRestartBtn：定义该变量以承载业务值。 */
const serviceRestartBtn = document.getElementById('service-restart') as HTMLButtonElement;
/** serviceRefreshBtn：定义该变量以承载业务值。 */
const serviceRefreshBtn = document.getElementById('service-refresh') as HTMLButtonElement;

/** currentPage：定义该变量以承载业务值。 */
let currentPage: PageId = 'maps';
/** currentMapSideTab：定义该变量以承载业务值。 */
let currentMapSideTab: MapSideTabId = 'overview';
/** configFiles：定义该变量以承载业务值。 */
let configFiles: LocalConfigFileSummary[] = [];
/** currentConfigFilePath：定义该变量以承载业务值。 */
let currentConfigFilePath: string | null = null;
/** configFileDirty：定义该变量以承载业务值。 */
let configFileDirty = false;
/** techniqueTemplates：定义该变量以承载业务值。 */
let techniqueTemplates: LocalTechniqueEntry[] = [];
/** techniqueBuffTemplates：定义该变量以承载业务值。 */
let techniqueBuffTemplates: LocalTechniqueBuffTemplate[] = [];
/** techniqueBuffTemplateById：定义该变量以承载业务值。 */
let techniqueBuffTemplateById = new Map<string, LocalTechniqueBuffTemplate>();
/** currentTechniqueKey：定义该变量以承载业务值。 */
let currentTechniqueKey: string | null = null;
/** currentTechniqueDraft：定义该变量以承载业务值。 */
let currentTechniqueDraft: LocalTechniqueTemplateRecord | null = null;
/** currentTechniqueSkillId：定义该变量以承载业务值。 */
let currentTechniqueSkillId: string | null = null;
/** currentTechniqueEffectIndex：定义该变量以承载业务值。 */
let currentTechniqueEffectIndex: number | null = null;
/** techniqueDirty：定义该变量以承载业务值。 */
let techniqueDirty = false;
/** monsterTemplates：定义该变量以承载业务值。 */
let monsterTemplates: LocalMonsterTemplateEntry[] = [];
/** currentMonsterKey：定义该变量以承载业务值。 */
let currentMonsterKey: string | null = null;
/** currentMonsterDraft：定义该变量以承载业务值。 */
let currentMonsterDraft: MonsterTemplateRecord | null = null;
/** monsterDirty：定义该变量以承载业务值。 */
let monsterDirty = false;
/** servicePollTimer：定义该变量以承载业务值。 */
let servicePollTimer: number | null = null;
/** serviceManaged：定义该变量以承载业务值。 */
let serviceManaged = false;
/** mapEditor：定义该变量以承载业务值。 */
let mapEditor: GmMapEditor | null = null;
/** editorItems：定义该变量以承载业务值。 */
let editorItems: LocalEditorItemOption[] = [];
/** editorItemById：定义该变量以承载业务值。 */
let editorItemById = new Map<string, LocalEditorItemOption>();

/** GRADE_OPTIONS：定义该变量以承载业务值。 */
const GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS) as Array<[TechniqueGrade, string]>;
/** MONSTER_TIER_OPTIONS：定义该变量以承载业务值。 */
const MONSTER_TIER_OPTIONS = MONSTER_TIER_ORDER.map((value) => ({ value, label: MONSTER_TIER_LABELS[value] }));
/** AGGRO_MODE_OPTIONS：定义该变量以承载业务值。 */
const AGGRO_MODE_OPTIONS: Array<{ value: MonsterAggroMode; label: string }> = [
  { value: 'always', label: '主动攻击' },
  { value: 'retaliate', label: '受击反击' },
  { value: 'day_only', label: '仅白天主动' },
  { value: 'night_only', label: '仅夜晚主动' },
];
/** MONSTER_TIER_SORT_ORDER：定义该变量以承载业务值。 */
const MONSTER_TIER_SORT_ORDER = MONSTER_TIER_ORDER.reduce<Record<MonsterTier, number>>((accumulator, tier, index) => {
  accumulator[tier] = index;
  return accumulator;
}, {} as Record<MonsterTier, number>);
/** TECHNIQUE_GRADE_SORT_ORDER：定义该变量以承载业务值。 */
const TECHNIQUE_GRADE_SORT_ORDER = TECHNIQUE_GRADE_ORDER.reduce<Record<TechniqueGrade, number>>((accumulator, grade, index) => {
  accumulator[grade] = index;
  return accumulator;
}, {} as Record<TechniqueGrade, number>);
/** PLAYER_REALM_STAGE_SORT_ORDER：定义该变量以承载业务值。 */
const PLAYER_REALM_STAGE_SORT_ORDER = PLAYER_REALM_ORDER.reduce<Record<PlayerRealmStage, number>>((accumulator, stage, index) => {
  accumulator[stage] = index;
  return accumulator;
}, {} as Record<PlayerRealmStage, number>);

/** MONSTER_SOURCE_MODE_LABELS：定义该变量以承载业务值。 */
const MONSTER_SOURCE_MODE_LABELS: Record<MonsterTemplateRecord['sourceMode'], string> = {
  legacy: '旧 hp/attack 模式',
  value_stats: 'valueStats 推导模式',
  attributes: 'attrs / statPercents 模式',
};

/** TECHNIQUE_CATEGORY_LABELS：定义该变量以承载业务值。 */
const TECHNIQUE_CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  arts: '术法',
  internal: '内功',
  divine: '神通',
  secret: '秘术',
};

/** EQUIP_SLOT_LABELS：定义该变量以承载业务值。 */
const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};

/** MONSTER_VALUE_STAT_GROUPS：定义该变量以承载业务值。 */
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

/** MONSTER_COMPUTED_STAT_GROUPS：定义该变量以承载业务值。 */
const MONSTER_COMPUTED_STAT_GROUPS: Array<{ title: string; keys: NumericScalarStatKey[] }> = [
  ...MONSTER_VALUE_STAT_GROUPS.map((group) => ({ title: group.title, keys: group.keys })),
  {
    title: '其余属性',
    keys: NUMERIC_SCALAR_STAT_KEYS.filter((key) => !MONSTER_VALUE_STAT_GROUPS.some((group) => group.keys.includes(key))),
  },
];

/** setAppStatus：执行对应的业务逻辑。 */
function setAppStatus(message: string, isError = false): void {
  appStatusBarEl.textContent = message;
  appStatusBarEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** setConfigFileStatus：执行对应的业务逻辑。 */
function setConfigFileStatus(message: string, isError = false): void {
  configFileStatusEl.textContent = message;
  configFileStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** setTechniqueStatus：执行对应的业务逻辑。 */
function setTechniqueStatus(message: string, isError = false): void {
  techniqueStatusEl.textContent = message;
  techniqueStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** setMonsterStatus：执行对应的业务逻辑。 */
function setMonsterStatus(message: string, isError = false): void {
  monsterStatusEl.textContent = message;
  monsterStatusEl.style.color = isError ? '#ffb0b0' : 'var(--text-muted)';
}

/** request：执行对应的业务逻辑。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
/** headers：定义该变量以承载业务值。 */
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

/** response：定义该变量以承载业务值。 */
  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
/** message：定义该变量以承载业务值。 */
    let message = `${response.status} ${response.statusText}`;
    try {
/** payload：定义该变量以承载业务值。 */
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
/** text：定义该变量以承载业务值。 */
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

/** switchPage：执行对应的业务逻辑。 */
function switchPage(page: PageId): void {
  currentPage = page;
  (Object.keys(pageMap) as PageId[]).forEach((key) => {
    pageMap[key].classList.toggle('hidden', key !== page);
    pageTabs[key].classList.toggle('active', key === page);
  });
}

/** switchMapSideTab：执行对应的业务逻辑。 */
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

/** renderConfigFileList：执行对应的业务逻辑。 */
function renderConfigFileList(): void {
/** keyword：定义该变量以承载业务值。 */
  const keyword = configFileSearchEl.value.trim().toLowerCase();
/** filtered：定义该变量以承载业务值。 */
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

/** normalizeTechniqueSortRealmLv：执行对应的业务逻辑。 */
function normalizeTechniqueSortRealmLv(realmLv: number | undefined): number {
  if (!Number.isFinite(realmLv)) {
    return 1;
  }
  return Math.max(1, Math.floor(realmLv ?? 1));
}

/** compareTechniqueTemplateEntries：执行对应的业务逻辑。 */
function compareTechniqueTemplateEntries(left: LocalTechniqueEntry, right: LocalTechniqueEntry): number {
/** realmDiff：定义该变量以承载业务值。 */
  const realmDiff = normalizeTechniqueSortRealmLv(left.technique.realmLv) - normalizeTechniqueSortRealmLv(right.technique.realmLv);
  if (realmDiff !== 0) {
    return realmDiff;
  }

/** gradeDiff：定义该变量以承载业务值。 */
  const gradeDiff = getMonsterGradeSortWeight(left.technique.grade) - getMonsterGradeSortWeight(right.technique.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }

/** categoryDiff：定义该变量以承载业务值。 */
  const categoryDiff = (left.technique.category ?? 'internal').localeCompare(right.technique.category ?? 'internal', 'zh-Hans-CN');
  if (categoryDiff !== 0) {
    return categoryDiff;
  }

/** nameDiff：定义该变量以承载业务值。 */
  const nameDiff = (left.technique.name || left.technique.id).localeCompare(right.technique.name || right.technique.id, 'zh-Hans-CN');
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.filePath.localeCompare(right.filePath, 'zh-Hans-CN');
}

/** formatTechniqueListMeta：执行对应的业务逻辑。 */
function formatTechniqueListMeta(entry: LocalTechniqueEntry): string {
/** parts：定义该变量以承载业务值。 */
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

/** renderTechniqueList：执行对应的业务逻辑。 */
function renderTechniqueList(): void {
/** keyword：定义该变量以承载业务值。 */
  const keyword = techniqueSearchEl.value.trim().toLowerCase();
/** filtered：定义该变量以承载业务值。 */
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

/** isPlainRecord：执行对应的业务逻辑。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** hasOwnField：执行对应的业务逻辑。 */
function hasOwnField(target: unknown, key: string): boolean {
  return isPlainRecord(target) && Object.prototype.hasOwnProperty.call(target, key);
}

/** cloneTechniqueTemplateRecord：执行对应的业务逻辑。 */
function cloneTechniqueTemplateRecord(technique: LocalTechniqueTemplateRecord): LocalTechniqueTemplateRecord {
  return JSON.parse(JSON.stringify(technique)) as LocalTechniqueTemplateRecord;
}

/** normalizeTechniqueModifierMode：执行对应的业务逻辑。 */
function normalizeTechniqueModifierMode(mode: unknown): LocalBuffModifierMode {
  return mode === 'flat' ? 'flat' : 'percent';
}

/** normalizeTechniqueNumericGroup：执行对应的业务逻辑。 */
function normalizeTechniqueNumericGroup(raw: unknown): PartialNumericStats {
/** normalized：定义该变量以承载业务值。 */
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

/** normalizeTechniqueAttrGroup：执行对应的业务逻辑。 */
function normalizeTechniqueAttrGroup(raw: unknown): Partial<Attributes> {
/** normalized：定义该变量以承载业务值。 */
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

/** formatTechniqueModeLabel：执行对应的业务逻辑。 */
function formatTechniqueModeLabel(mode: LocalBuffModifierMode): string {
  return mode === 'flat' ? '基础值' : '百分比';
}

/** buildTechniqueMetaRow：执行对应的业务逻辑。 */
function buildTechniqueMetaRow(label: string, value: string): string {
  return `
    <div class="technique-meta-row">
      <div class="technique-meta-key">${escapeHtml(label)}</div>
      <div class="technique-meta-value">${escapeHtml(value || '-')}</div>
    </div>
  `;
}

/** buildTechniqueChip：执行对应的业务逻辑。 */
function buildTechniqueChip(text: string, extraClass = ''): string {
  return `<span class="technique-inline-chip ${escapeHtml(extraClass)}">${escapeHtml(text)}</span>`;
}

/** getCurrentTechniqueSkill：执行对应的业务逻辑。 */
function getCurrentTechniqueSkill(): LocalTechniqueSkill | null {
  if (!currentTechniqueDraft) {
    return null;
  }
  if (!currentTechniqueSkillId) {
    return currentTechniqueDraft.skills[0] ?? null;
  }
  return currentTechniqueDraft.skills.find((skill) => skill.id === currentTechniqueSkillId) ?? currentTechniqueDraft.skills[0] ?? null;
}

/** isTechniqueBuffEffect：执行对应的业务逻辑。 */
function isTechniqueBuffEffect(effect: LocalTechniqueEffect | undefined): effect is LocalTechniqueEffect {
  return Boolean(effect && effect.type === 'buff');
}

/** resolveTechniqueBuffEffect：执行对应的业务逻辑。 */
function resolveTechniqueBuffEffect(effect: LocalTechniqueEffect): LocalTechniqueEffect {
  if (!isTechniqueBuffEffect(effect)) {
    return effect;
  }
/** buffRef：定义该变量以承载业务值。 */
  const buffRef = typeof effect.buffRef === 'string' && effect.buffRef.trim() ? effect.buffRef.trim() : '';
/** template：定义该变量以承载业务值。 */
  const template = buffRef ? techniqueBuffTemplateById.get(buffRef) : undefined;
  return template ? { ...template, ...effect, type: 'buff' } : effect;
}

/** getTechniqueBuffEffectOptions：执行对应的业务逻辑。 */
function getTechniqueBuffEffectOptions(skill: LocalTechniqueSkill | null): Array<{
/** rawIndex：定义该变量以承载业务值。 */
  rawIndex: number;
/** rawEffect：定义该变量以承载业务值。 */
  rawEffect: LocalTechniqueEffect;
/** resolvedEffect：定义该变量以承载业务值。 */
  resolvedEffect: LocalTechniqueEffect;
}> {
  if (!skill) {
    return [];
  }
  return skill.effects
    .map((effect, rawIndex) => ({ rawIndex, rawEffect: effect, resolvedEffect: resolveTechniqueBuffEffect(effect) }))
    .filter((entry) => isTechniqueBuffEffect(entry.rawEffect));
}

/** getCurrentTechniqueBuffEffectSelection：执行对应的业务逻辑。 */
function getCurrentTechniqueBuffEffectSelection(): {
/** skill：定义该变量以承载业务值。 */
  skill: LocalTechniqueSkill;
/** rawEffect：定义该变量以承载业务值。 */
  rawEffect: LocalTechniqueEffect;
/** resolvedEffect：定义该变量以承载业务值。 */
  resolvedEffect: LocalTechniqueEffect;
/** rawIndex：定义该变量以承载业务值。 */
  rawIndex: number;
} | null {
/** skill：定义该变量以承载业务值。 */
  const skill = getCurrentTechniqueSkill();
  if (!skill) {
    return null;
  }
/** options：定义该变量以承载业务值。 */
  const options = getTechniqueBuffEffectOptions(skill);
  if (options.length === 0) {
    return null;
  }
/** selected：定义该变量以承载业务值。 */
  const selected = options.find((entry) => entry.rawIndex === currentTechniqueEffectIndex) ?? options[0]!;
  return {
    skill,
    rawEffect: selected.rawEffect,
    resolvedEffect: selected.resolvedEffect,
    rawIndex: selected.rawIndex,
  };
}

/** getTechniqueEffectGroup：执行对应的业务逻辑。 */
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

/** getTechniqueEffectMode：执行对应的业务逻辑。 */
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

/** ensureTechniqueSelection：执行对应的业务逻辑。 */
function ensureTechniqueSelection(): void {
  if (!currentTechniqueDraft) {
    currentTechniqueSkillId = null;
    currentTechniqueEffectIndex = null;
    return;
  }
/** skill：定义该变量以承载业务值。 */
  const skill = getCurrentTechniqueSkill();
  currentTechniqueSkillId = skill?.id ?? null;
/** effectOptions：定义该变量以承载业务值。 */
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

/** renderTechniqueSelectors：执行对应的业务逻辑。 */
function renderTechniqueSelectors(): void {
  if (!currentTechniqueDraft) {
    techniqueSkillSelectEl.innerHTML = '<option value="">没有技能</option>';
    techniqueEffectSelectEl.innerHTML = '<option value="">没有 Buff 效果</option>';
    techniqueSkillSelectEl.disabled = true;
    techniqueEffectSelectEl.disabled = true;
    return;
  }

  ensureTechniqueSelection();
/** skills：定义该变量以承载业务值。 */
  const skills = currentTechniqueDraft.skills;
  techniqueSkillSelectEl.innerHTML = skills.length > 0
    ? skills.map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === currentTechniqueSkillId ? 'selected' : ''}>${escapeHtml(skill.name)} · ${escapeHtml(skill.id)}</option>`).join('')
    : '<option value="">没有技能</option>';
  techniqueSkillSelectEl.disabled = skills.length === 0;

/** effectOptions：定义该变量以承载业务值。 */
  const effectOptions = getTechniqueBuffEffectOptions(getCurrentTechniqueSkill());
  techniqueEffectSelectEl.innerHTML = effectOptions.length > 0
    ? effectOptions.map((entry, index) => {
/** label：定义该变量以承载业务值。 */
      const label = entry.resolvedEffect.name
        || entry.resolvedEffect.buffId
        || entry.rawEffect.buffRef
        || `Buff 效果 ${index + 1}`;
/** source：定义该变量以承载业务值。 */
      const source = entry.rawEffect.buffRef ? '共享模板' : '内联';
      return `<option value="${entry.rawIndex}" ${entry.rawIndex === currentTechniqueEffectIndex ? 'selected' : ''}>${escapeHtml(`效果 ${index + 1} · ${label} · ${source}`)}</option>`;
    }).join('')
    : '<option value="">当前技能没有 Buff 效果</option>';
  techniqueEffectSelectEl.disabled = effectOptions.length === 0;
}

/** renderTechniqueSkillSummary：执行对应的业务逻辑。 */
function renderTechniqueSkillSummary(): void {
/** skill：定义该变量以承载业务值。 */
  const skill = getCurrentTechniqueSkill();
  if (!skill) {
    techniqueSkillSummaryEl.innerHTML = '<div class="empty-hint">当前功法没有技能。</div>';
    return;
  }
/** lines：定义该变量以承载业务值。 */
  const lines = [
    buildTechniqueMetaRow('技能描述', skill.desc || '-'),
    buildTechniqueMetaRow('冷却 / 射程', `${stringifyOptionalNumber(skill.cooldown)} / ${stringifyOptionalNumber(skill.range)}`),
    buildTechniqueMetaRow('消耗倍率 / 消耗', `${stringifyOptionalNumber(skill.costMultiplier)} / ${stringifyOptionalNumber(skill.cost)}`),
    buildTechniqueMetaRow('解锁层数', stringifyOptionalNumber(skill.unlockLevel)),
    buildTechniqueMetaRow('效果数量', `${skill.effects.length} 个，其中 Buff ${getTechniqueBuffEffectOptions(skill).length} 个`),
  ];
  techniqueSkillSummaryEl.innerHTML = lines.join('');
}

/** renderTechniqueEffectSummary：执行对应的业务逻辑。 */
function renderTechniqueEffectSummary(): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
/** skill：定义该变量以承载业务值。 */
    const skill = getCurrentTechniqueSkill();
    if (skill) {
/** damageCount：定义该变量以承载业务值。 */
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
/** summary：定义该变量以承载业务值。 */
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

/** buildTechniqueModifierKeyOptions：执行对应的业务逻辑。 */
function buildTechniqueModifierKeyOptions(
  groupKey: TechniqueModifierGroupKey,
  selectedKey: string,
): string {
/** options：定义该变量以承载业务值。 */
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

/** buildTechniqueModifierRows：执行对应的业务逻辑。 */
function buildTechniqueModifierRows(
  groupKey: TechniqueModifierGroupKey,
  values: PartialNumericStats | Partial<Attributes>,
): string {
/** entries：定义该变量以承载业务值。 */
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

/** renderTechniqueEffectEditor：执行对应的业务逻辑。 */
function renderTechniqueEffectEditor(): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    techniqueEffectEditorEl.innerHTML = '<div class="empty-hint">当前技能没有可编辑 Buff 效果，切换别的技能后再编辑。</div>';
    return;
  }

  const { rawEffect, resolvedEffect } = selection;
/** valueStats：定义该变量以承载业务值。 */
  const valueStats = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'valueStats') as PartialNumericStats;
/** stats：定义该变量以承载业务值。 */
  const stats = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'stats') as PartialNumericStats;
/** attrs：定义该变量以承载业务值。 */
  const attrs = getTechniqueEffectGroup(rawEffect, resolvedEffect, 'attrs') as Partial<Attributes>;
/** statMode：定义该变量以承载业务值。 */
  const statMode = getTechniqueEffectMode(rawEffect, resolvedEffect, 'statMode');
/** attrMode：定义该变量以承载业务值。 */
  const attrMode = getTechniqueEffectMode(rawEffect, resolvedEffect, 'attrMode');
/** inheritedHint：定义该变量以承载业务值。 */
  const inheritedHint = rawEffect.buffRef
    ? buildTechniqueChip(`共享模板：${rawEffect.buffRef}`)
    : buildTechniqueChip('技能内联配置');
/** missingTemplateHint：定义该变量以承载业务值。 */
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

/** renderTechniquePanel：执行对应的业务逻辑。 */
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

/** ensureTechniqueRawEffectGroup：执行对应的业务逻辑。 */
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

/** getTechniqueModifierKeys：执行对应的业务逻辑。 */
function getTechniqueModifierKeys(groupKey: TechniqueModifierGroupKey): readonly string[] {
  return groupKey === 'attrs' ? ATTR_KEYS : NUMERIC_SCALAR_STAT_KEYS;
}

/** markTechniqueDirty：执行对应的业务逻辑。 */
function markTechniqueDirty(message = '功法技能有未保存修改'): void {
  techniqueDirty = true;
  setTechniqueStatus(message);
}

/** updateTechniqueMode：执行对应的业务逻辑。 */
function updateTechniqueMode(modeKey: 'statMode' | 'attrMode', value: LocalBuffModifierMode): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
  selection.rawEffect[modeKey] = value;
  markTechniqueDirty();
  renderTechniqueEffectSummary();
  renderTechniqueEffectEditor();
}

/** addTechniqueModifierRow：执行对应的业务逻辑。 */
function addTechniqueModifierRow(groupKey: TechniqueModifierGroupKey): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
/** group：定义该变量以承载业务值。 */
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
/** candidateKey：定义该变量以承载业务值。 */
  const candidateKey = getTechniqueModifierKeys(groupKey).find((key) => !Object.prototype.hasOwnProperty.call(group, key))
    ?? getTechniqueModifierKeys(groupKey)[0];
  if (!candidateKey) {
    return;
  }
  group[candidateKey as keyof typeof group] = 0 as never;
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

/** removeTechniqueModifierRow：执行对应的业务逻辑。 */
function removeTechniqueModifierRow(groupKey: TechniqueModifierGroupKey, key: string): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
/** group：定义该变量以承载业务值。 */
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
  delete group[key as keyof typeof group];
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

/** updateTechniqueModifierKey：执行对应的业务逻辑。 */
function updateTechniqueModifierKey(groupKey: TechniqueModifierGroupKey, previousKey: string, nextKey: string): void {
  if (!nextKey || previousKey === nextKey) {
    return;
  }
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
/** group：定义该变量以承载业务值。 */
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
/** previousValue：定义该变量以承载业务值。 */
  const previousValue = group[previousKey as keyof typeof group];
  delete group[previousKey as keyof typeof group];
  group[nextKey as keyof typeof group] = (typeof previousValue === 'number' ? previousValue : 0) as never;
  markTechniqueDirty();
  renderTechniqueEffectEditor();
}

/** updateTechniqueModifierValue：执行对应的业务逻辑。 */
function updateTechniqueModifierValue(groupKey: TechniqueModifierGroupKey, key: string, rawValue: string): void {
/** selection：定义该变量以承载业务值。 */
  const selection = getCurrentTechniqueBuffEffectSelection();
  if (!selection) {
    return;
  }
/** group：定义该变量以承载业务值。 */
  const group = ensureTechniqueRawEffectGroup(selection.rawEffect, selection.resolvedEffect, groupKey);
/** value：定义该变量以承载业务值。 */
  const value = rawValue.trim();
  if (!value) {
    delete group[key as keyof typeof group];
    markTechniqueDirty();
    return;
  }
/** parsed：定义该变量以承载业务值。 */
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    setTechniqueStatus(`字段 ${key} 不是合法数字`, true);
    return;
  }
  group[key as keyof typeof group] = parsed as never;
  markTechniqueDirty();
}

/** loadTechniqueTemplateList：执行对应的业务逻辑。 */
async function loadTechniqueTemplateList(
  preferredKey?: string | null,
  preferredSkillId?: string | null,
  preferredEffectIndex?: number | null,
): Promise<void> {
/** result：定义该变量以承载业务值。 */
  const result = await request<LocalTechniqueListRes>('/api/techniques');
  techniqueTemplates = [...result.techniques].sort(compareTechniqueTemplateEntries);
  techniqueBuffTemplates = result.sharedBuffs;
  techniqueBuffTemplateById = new Map(result.sharedBuffs.map((entry) => [entry.id, entry] as const));
  renderTechniqueList();

/** nextKey：定义该变量以承载业务值。 */
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

/** selectTechniqueTemplate：执行对应的业务逻辑。 */
async function selectTechniqueTemplate(
  key: string,
  announce = true,
  preferredSkillId?: string | null,
  preferredEffectIndex?: number | null,
): Promise<void> {
  if (techniqueDirty && currentTechniqueKey && currentTechniqueKey !== key) {
/** proceed：定义该变量以承载业务值。 */
    const proceed = window.confirm('当前功法技能有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

/** entry：定义该变量以承载业务值。 */
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
/** setTechniqueStatus：处理当前场景中的对应操作。 */
  setTechniqueStatus(announce ? `已载入功法 ${entry.technique.name}` : '');
}

/** saveTechniqueTemplate：执行对应的业务逻辑。 */
async function saveTechniqueTemplate(): Promise<void> {
  if (!currentTechniqueKey || !currentTechniqueDraft) {
    setTechniqueStatus('请先选择一个功法', true);
    return;
  }

  techniqueSaveBtn.disabled = true;
  try {
/** result：定义该变量以承载业务值。 */
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
/** setTechniqueStatus：处理当前场景中的对应操作。 */
    setTechniqueStatus(error instanceof Error ? error.message : '保存功法技能失败', true);
  } finally {
    techniqueSaveBtn.disabled = false;
  }
}

/** populateMonsterStaticOptions：执行对应的业务逻辑。 */
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

/** normalizeMonsterSortLevel：执行对应的业务逻辑。 */
function normalizeMonsterSortLevel(level: number | undefined): number {
  if (!Number.isFinite(level)) {
    return 1;
  }
  return Math.max(1, Math.floor(level ?? 1));
}

/** resolveMonsterRealmStage：执行对应的业务逻辑。 */
function resolveMonsterRealmStage(level: number | undefined): PlayerRealmStage {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = normalizeMonsterSortLevel(level);
  for (let index = PLAYER_REALM_ORDER.length - 1; index >= 0; index -= 1) {
    const stage = PLAYER_REALM_ORDER[index]!;
    if (normalizedLevel >= PLAYER_REALM_STAGE_LEVEL_RANGES[stage].levelFrom) {
      return stage;
    }
  }
  return PLAYER_REALM_ORDER[0]!;
}

/** getMonsterTierSortWeight：执行对应的业务逻辑。 */
function getMonsterTierSortWeight(tier: MonsterTier): number {
  return MONSTER_TIER_SORT_ORDER[tier] ?? -1;
}

/** getMonsterGradeSortWeight：执行对应的业务逻辑。 */
function getMonsterGradeSortWeight(grade: TechniqueGrade): number {
  return TECHNIQUE_GRADE_SORT_ORDER[grade] ?? -1;
}

/** getMonsterRealmStageSortWeight：执行对应的业务逻辑。 */
function getMonsterRealmStageSortWeight(level: number | undefined): number {
  return PLAYER_REALM_STAGE_SORT_ORDER[resolveMonsterRealmStage(level)] ?? -1;
}

/** compareMonsterTemplateEntries：执行对应的业务逻辑。 */
function compareMonsterTemplateEntries(left: LocalMonsterTemplateEntry, right: LocalMonsterTemplateEntry): number {
/** realmStageDiff：定义该变量以承载业务值。 */
  const realmStageDiff = getMonsterRealmStageSortWeight(right.monster.level) - getMonsterRealmStageSortWeight(left.monster.level);
  if (realmStageDiff !== 0) {
    return realmStageDiff;
  }

/** tierDiff：定义该变量以承载业务值。 */
  const tierDiff = getMonsterTierSortWeight(right.monster.tier) - getMonsterTierSortWeight(left.monster.tier);
  if (tierDiff !== 0) {
    return tierDiff;
  }

/** gradeDiff：定义该变量以承载业务值。 */
  const gradeDiff = getMonsterGradeSortWeight(right.monster.grade) - getMonsterGradeSortWeight(left.monster.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }

/** levelDiff：定义该变量以承载业务值。 */
  const levelDiff = normalizeMonsterSortLevel(right.monster.level) - normalizeMonsterSortLevel(left.monster.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }

/** nameDiff：定义该变量以承载业务值。 */
  const nameDiff = (left.monster.name || left.monster.id).localeCompare(right.monster.name || right.monster.id, 'zh-Hans-CN');
  if (nameDiff !== 0) {
    return nameDiff;
  }

/** idDiff：定义该变量以承载业务值。 */
  const idDiff = left.monster.id.localeCompare(right.monster.id);
  if (idDiff !== 0) {
    return idDiff;
  }

  return left.filePath.localeCompare(right.filePath, 'zh-Hans-CN');
}

/** formatMonsterListMeta：执行对应的业务逻辑。 */
function formatMonsterListMeta(entry: LocalMonsterTemplateEntry): string {
/** realmStage：定义该变量以承载业务值。 */
  const realmStage = resolveMonsterRealmStage(entry.monster.level);
/** realmLabel：定义该变量以承载业务值。 */
  const realmLabel = PLAYER_REALM_CONFIG[realmStage].shortName;
  return [
    entry.monster.id,
    realmLabel,
    MONSTER_TIER_LABELS[entry.monster.tier],
    TECHNIQUE_GRADE_LABELS[entry.monster.grade],
    entry.filePath,
  ].join(' · ');
}

/** renderMonsterList：执行对应的业务逻辑。 */
function renderMonsterList(): void {
/** keyword：定义该变量以承载业务值。 */
  const keyword = monsterSearchEl.value.trim().toLowerCase();
/** filtered：定义该变量以承载业务值。 */
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

/** stringifyOptionalNumber：执行对应的业务逻辑。 */
function stringifyOptionalNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** formatDisplayNumber：执行对应的业务逻辑。 */
function formatDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (Math.abs(value - Math.round(value)) < 1e-6) {
    return String(Math.round(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/** getItemTypeLabel：执行对应的业务逻辑。 */
function getItemTypeLabel(type: ItemType): string {
  return ITEM_TYPE_LABELS[type] ?? type;
}

/** formatDropChancePercent：执行对应的业务逻辑。 */
function formatDropChancePercent(chance: number | undefined): string {
  if (chance === undefined) {
    return '';
  }
  return formatDisplayNumber(chance * 100);
}

/** findEditorItem：执行对应的业务逻辑。 */
function findEditorItem(itemId: string): LocalEditorItemOption | undefined {
  return editorItemById.get(itemId);
}

/** isValidItemType：执行对应的业务逻辑。 */
function isValidItemType(value: string | undefined): value is ItemType {
  return value !== undefined && Object.prototype.hasOwnProperty.call(ITEM_TYPE_LABELS, value);
}

/** resolveMonsterDropIdentity：执行对应的业务逻辑。 */
function resolveMonsterDropIdentity(source: Partial<MonsterTemplateDrop> | undefined): MonsterDropIdentity | null {
/** itemId：定义该变量以承载业务值。 */
  const itemId = typeof source?.itemId === 'string' ? source.itemId.trim() : '';
/** name：定义该变量以承载业务值。 */
  const name = typeof source?.name === 'string' ? source.name.trim() : '';
/** type：定义该变量以承载业务值。 */
  const type = typeof source?.type === 'string' && isValidItemType(source.type) ? source.type : undefined;
  if (!itemId || !name || !type) {
    return null;
  }
  return { itemId, name, type };
}

/** getMonsterDropRowIdentity：执行对应的业务逻辑。 */
function getMonsterDropRowIdentity(row: HTMLElement): MonsterDropIdentity | null {
  return resolveMonsterDropIdentity({
    itemId: row.dataset.dropItemId,
    name: row.dataset.dropItemName,
    type: row.dataset.dropItemType as ItemType | undefined,
  });
}

/** setMonsterDropRowIdentity：执行对应的业务逻辑。 */
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

/** buildEditorItemOptions：执行对应的业务逻辑。 */
function buildEditorItemOptions(selectedItemId = '', fallbackDrop?: Partial<MonsterTemplateDrop>): string {
/** options：定义该变量以承载业务值。 */
  const options = ['<option value="">请选择物品</option>'];
  for (const item of editorItems) {
    options.push(
      `<option value="${escapeHtml(item.itemId)}" ${item.itemId === selectedItemId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.itemId)} · ${escapeHtml(getItemTypeLabel(item.type))}</option>`,
    );
  }
  if (selectedItemId && !findEditorItem(selectedItemId)) {
/** fallback：定义该变量以承载业务值。 */
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

/** buildEquipmentItemOptions：执行对应的业务逻辑。 */
function buildEquipmentItemOptions(slot: EquipSlot, selectedItemId = ''): string {
/** options：定义该变量以承载业务值。 */
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

/** buildMonsterDropMeta：执行对应的业务逻辑。 */
function buildMonsterDropMeta(drop: Partial<MonsterTemplateDrop>): string {
  if (!drop.itemId) {
    return '从下拉列表中选择掉落物品。';
  }
/** item：定义该变量以承载业务值。 */
  const item = findEditorItem(drop.itemId);
  if (item) {
/** parts：定义该变量以承载业务值。 */
    const parts = [item.itemId, getItemTypeLabel(item.type)];
    if (item.grade) {
      parts.push(TECHNIQUE_GRADE_LABELS[item.grade]);
    }
    if (item.level !== undefined) {
      parts.push(`等级 ${item.level}`);
    }
    return parts.join(' · ');
  }
/** fallback：定义该变量以承载业务值。 */
  const fallback = resolveMonsterDropIdentity(drop);
  if (fallback) {
    return `${fallback.name} · ${fallback.itemId} · ${getItemTypeLabel(fallback.type)} · 使用模板内记录`;
  }
  return `未在物品目录中找到 ${drop.itemId}`;
}

/** buildMonsterScalarStatInput：执行对应的业务逻辑。 */
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

/** buildMonsterAttrInput：执行对应的业务逻辑。 */
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

/** buildMonsterStatPercentInput：执行对应的业务逻辑。 */
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

/** renderMonsterAttrsEditor：执行对应的业务逻辑。 */
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

/** renderMonsterStatPercentsEditor：执行对应的业务逻辑。 */
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

/** renderMonsterEquipmentEditor：执行对应的业务逻辑。 */
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

/** buildMonsterElementStatInputs：执行对应的业务逻辑。 */
function buildMonsterElementStatInputs(groupKey: 'elementDamageBonus' | 'elementDamageReduce', stats?: PartialNumericStats): string {
/** title：定义该变量以承载业务值。 */
  const title = groupKey === 'elementDamageBonus' ? '五行增伤' : '五行减伤';
/** note：定义该变量以承载业务值。 */
  const note = groupKey === 'elementDamageBonus' ? '给怪物配置额外的五行伤害加成。' : '给怪物配置额外的五行抗性。';
/** group：定义该变量以承载业务值。 */
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

/** renderMonsterValueStatsEditor：执行对应的业务逻辑。 */
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

/** renderMonsterResolvedAttrsPreview：执行对应的业务逻辑。 */
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

/** renderMonsterComputedStatsPreview：执行对应的业务逻辑。 */
function renderMonsterComputedStatsPreview(stats: NumericStats): void {
/** sectionHtml：定义该变量以承载业务值。 */
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

/** elementSections：定义该变量以承载业务值。 */
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

/** buildMonsterDropRow：执行对应的业务逻辑。 */
function buildMonsterDropRow(drop: Partial<MonsterTemplateDrop>, index: number): string {
/** fallback：定义该变量以承载业务值。 */
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

/** updateMonsterDropEmptyState：执行对应的业务逻辑。 */
function updateMonsterDropEmptyState(): void {
/** hasRows：定义该变量以承载业务值。 */
  const hasRows = monsterDropsEditorEl.querySelector('[data-drop-row]') !== null;
/** emptyHint：定义该变量以承载业务值。 */
  const emptyHint = monsterDropsEditorEl.querySelector<HTMLElement>('[data-drop-empty]');
  if (!hasRows && !emptyHint) {
    monsterDropsEditorEl.innerHTML = '<div class="empty-hint" data-drop-empty>当前没有掉落项，点上方“新增掉落”添加。</div>';
    return;
  }
  if (hasRows && emptyHint) {
    emptyHint.remove();
  }
}

/** renderMonsterDropsEditor：执行对应的业务逻辑。 */
function renderMonsterDropsEditor(drops: MonsterTemplateDrop[]): void {
  if (drops.length === 0) {
    monsterDropsEditorEl.innerHTML = '<div class="empty-hint" data-drop-empty>当前没有掉落项，点上方“新增掉落”添加。</div>';
    return;
  }
  monsterDropsEditorEl.innerHTML = drops.map((drop, index) => buildMonsterDropRow(drop, index)).join('');
}

/** appendMonsterDropRow：执行对应的业务逻辑。 */
function appendMonsterDropRow(drop: Partial<MonsterTemplateDrop> = {}): void {
  updateMonsterDropEmptyState();
/** rows：定义该变量以承载业务值。 */
  const rows = monsterDropsEditorEl.querySelectorAll('[data-drop-row]');
  monsterDropsEditorEl.insertAdjacentHTML('beforeend', buildMonsterDropRow(drop, rows.length));
  updateMonsterDropEmptyState();
/** nextRow：定义该变量以承载业务值。 */
  const nextRow = monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row]')[rows.length];
/** firstSelect：定义该变量以承载业务值。 */
  const firstSelect = nextRow?.querySelector<HTMLSelectElement>('select[data-drop-field="itemId"]');
  firstSelect?.focus();
}

/** refreshMonsterDropRowMeta：执行对应的业务逻辑。 */
function refreshMonsterDropRowMeta(row: HTMLElement): void {
/** itemId：定义该变量以承载业务值。 */
  const itemId = row.querySelector<HTMLSelectElement>('[data-drop-field="itemId"]')?.value ?? '';
/** metaEl：定义该变量以承载业务值。 */
  const metaEl = row.querySelector<HTMLElement>('[data-drop-meta]');
  if (!metaEl) {
    return;
  }
/** identity：定义该变量以承载业务值。 */
  const identity = getMonsterDropRowIdentity(row);
  metaEl.textContent = buildMonsterDropMeta(identity && identity.itemId === itemId ? identity : { itemId });
}

/** fillMonsterForm：执行对应的业务逻辑。 */
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

/** syncMonsterExpMultiplierToTierDefaultIfNeeded：执行对应的业务逻辑。 */
function syncMonsterExpMultiplierToTierDefaultIfNeeded(): void {
  if (!currentMonsterDraft) {
    return;
  }
/** previousDefault：定义该变量以承载业务值。 */
  const previousDefault = MONSTER_TIER_EXP_MULTIPLIERS[currentMonsterDraft.tier];
/** currentValue：定义该变量以承载业务值。 */
  const currentValue = Number(monsterExpMultiplierEl.value.trim());
  if (!Number.isFinite(currentValue) || currentValue !== previousDefault) {
    return;
  }
/** nextTier：定义该变量以承载业务值。 */
  const nextTier = monsterTierEl.value as MonsterTier;
  monsterExpMultiplierEl.value = String(MONSTER_TIER_EXP_MULTIPLIERS[nextTier]);
}

/** readOptionalInteger：执行对应的业务逻辑。 */
function readOptionalInteger(input: HTMLInputElement): number | undefined {
/** value：定义该变量以承载业务值。 */
  const value = input.value.trim();
  if (!value) {
    return undefined;
  }
/** parsed：定义该变量以承载业务值。 */
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`字段 ${input.id} 不是合法整数`);
  }
  return parsed;
}

/** readRequiredInteger：执行对应的业务逻辑。 */
function readRequiredInteger(input: HTMLInputElement): number {
/** value：定义该变量以承载业务值。 */
  const value = readOptionalInteger(input);
  if (value === undefined) {
    throw new Error(`字段 ${input.id} 不能为空`);
  }
  return value;
}

/** readRequiredNumber：执行对应的业务逻辑。 */
function readRequiredNumber(input: HTMLInputElement): number {
/** raw：定义该变量以承载业务值。 */
  const raw = input.value.trim();
  if (!raw) {
    throw new Error(`字段 ${input.id} 不能为空`);
  }
/** parsed：定义该变量以承载业务值。 */
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`字段 ${input.id} 不是合法数字`);
  }
  return parsed;
}

/** readOptionalDecimalInput：执行对应的业务逻辑。 */
function readOptionalDecimalInput(raw: string, label: string): number | undefined {
/** value：定义该变量以承载业务值。 */
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
/** parsed：定义该变量以承载业务值。 */
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 不是合法数字`);
  }
  return parsed;
}

/** readMonsterAttrsFromEditor：执行对应的业务逻辑。 */
function readMonsterAttrsFromEditor(): Partial<Attributes> | undefined {
/** attrs：定义该变量以承载业务值。 */
  let attrs: Partial<Attributes> | undefined;
  for (const input of Array.from(monsterAttrsEditorEl.querySelectorAll<HTMLInputElement>('[data-attr-key]'))) {
    const key = input.dataset.attrKey as (typeof ATTR_KEYS)[number] | undefined;
    if (!key) {
      continue;
    }
/** value：定义该变量以承载业务值。 */
    const value = readOptionalDecimalInput(input.value, `六维属性 ${ATTR_KEY_LABELS[key]}`);
    if (value === undefined) {
      continue;
    }
    attrs ??= {};
    attrs[key] = Math.max(0, Math.floor(value));
  }
  return attrs;
}

/** readMonsterStatPercentsFromEditor：执行对应的业务逻辑。 */
function readMonsterStatPercentsFromEditor(): NumericStatPercentages | undefined {
/** statPercents：定义该变量以承载业务值。 */
  let statPercents: NumericStatPercentages | undefined;
  for (const input of Array.from(monsterStatPercentsEditorEl.querySelectorAll<HTMLInputElement>('[data-stat-percent-key]'))) {
    const key = input.dataset.statPercentKey as NumericScalarStatKey | undefined;
    if (!key) {
      continue;
    }
/** value：定义该变量以承载业务值。 */
    const value = readOptionalDecimalInput(input.value, `数值倍率 ${NUMERIC_SCALAR_STAT_LABELS[key]}`);
    if (value === undefined) {
      continue;
    }
    statPercents ??= {};
    statPercents[key] = Math.max(0, value);
  }
  return statPercents;
}

/** readMonsterEquipmentFromEditor：执行对应的业务逻辑。 */
function readMonsterEquipmentFromEditor(): Partial<Record<EquipSlot, string>> | undefined {
/** equipment：定义该变量以承载业务值。 */
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

/** readMonsterSkillsFromEditor：执行对应的业务逻辑。 */
function readMonsterSkillsFromEditor(): string[] {
/** entries：定义该变量以承载业务值。 */
  const entries = monsterSkillsEl.value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(entries));
}

/** readMonsterValueStatsFromEditor：执行对应的业务逻辑。 */
function readMonsterValueStatsFromEditor(): PartialNumericStats | undefined {
/** valueStats：定义该变量以承载业务值。 */
  let valueStats: PartialNumericStats | undefined;
  for (const input of Array.from(monsterValueStatsEditorEl.querySelectorAll<HTMLInputElement>('[data-value-stat-key]'))) {
    const key = input.dataset.valueStatKey as NumericScalarStatKey | undefined;
    if (!key) {
      continue;
    }
/** value：定义该变量以承载业务值。 */
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
/** value：定义该变量以承载业务值。 */
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

/** readMonsterDropsFromEditor：执行对应的业务逻辑。 */
function readMonsterDropsFromEditor(): MonsterTemplateDrop[] {
/** drops：定义该变量以承载业务值。 */
  let drops: MonsterTemplateDrop[] = [];
  for (const row of Array.from(monsterDropsEditorEl.querySelectorAll<HTMLElement>('[data-drop-row]'))) {
    const itemId = row.querySelector<HTMLSelectElement>('[data-drop-field="itemId"]')?.value.trim() ?? '';
    const countRaw = row.querySelector<HTMLInputElement>('[data-drop-field="count"]')?.value.trim() ?? '';
/** chanceRaw：定义该变量以承载业务值。 */
    const chanceRaw = row.querySelector<HTMLInputElement>('[data-drop-field="chancePercent"]')?.value.trim() ?? '';
/** rowIsEmpty：定义该变量以承载业务值。 */
    const rowIsEmpty = !itemId && !countRaw && !chanceRaw;
    if (rowIsEmpty) {
      continue;
    }
/** item：定义该变量以承载业务值。 */
    const item = findEditorItem(itemId);
/** fallback：定义该变量以承载业务值。 */
    const fallback = getMonsterDropRowIdentity(row);
/** resolved：定义该变量以承载业务值。 */
    const resolved = item ?? (fallback && fallback.itemId === itemId ? fallback : null);
    if (!resolved) {
      throw new Error(itemId ? `掉落物品不存在: ${itemId}` : '掉落项必须选择物品');
    }
/** count：定义该变量以承载业务值。 */
    const count = countRaw ? Number(countRaw) : 1;
/** chancePercent：定义该变量以承载业务值。 */
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
/** chance：定义该变量以承载业务值。 */
      chance: chancePercent === undefined ? undefined : chancePercent / 100,
    });
  }
  return drops;
}

/** syncMonsterDraftFromForm：执行对应的业务逻辑。 */
function syncMonsterDraftFromForm(): MonsterTemplateRecord {
/** attrs：定义该变量以承载业务值。 */
  const attrs = readMonsterAttrsFromEditor();
/** statPercents：定义该变量以承载业务值。 */
  const statPercents = readMonsterStatPercentsFromEditor();
/** equipment：定义该变量以承载业务值。 */
  const equipment = readMonsterEquipmentFromEditor();
/** skills：定义该变量以承载业务值。 */
  const skills = readMonsterSkillsFromEditor();
/** valueStats：定义该变量以承载业务值。 */
  const valueStats = readMonsterValueStatsFromEditor();
/** drops：定义该变量以承载业务值。 */
  const drops = readMonsterDropsFromEditor();
/** nextDraft：定义该变量以承载业务值。 */
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

/** onMonsterFormInput：执行对应的业务逻辑。 */
function onMonsterFormInput(): void {
  monsterDirty = true;
  try {
    syncMonsterDraftFromForm();
    setMonsterStatus('怪物模板有未保存修改');
  } catch (error) {
/** setMonsterStatus：处理当前场景中的对应操作。 */
    setMonsterStatus(error instanceof Error ? error.message : '怪物模板输入非法', true);
  }
}

/** loadMonsterTemplateList：执行对应的业务逻辑。 */
async function loadMonsterTemplateList(preferredKey?: string | null): Promise<void> {
/** result：定义该变量以承载业务值。 */
  const result = await request<LocalMonsterTemplateListRes>('/api/monsters');
  monsterTemplates = [...result.monsters].sort(compareMonsterTemplateEntries);
  renderMonsterList();

/** nextKey：定义该变量以承载业务值。 */
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

/** selectMonsterTemplate：执行对应的业务逻辑。 */
async function selectMonsterTemplate(key: string, announce = true): Promise<void> {
  if (monsterDirty && currentMonsterKey && currentMonsterKey !== key) {
/** proceed：定义该变量以承载业务值。 */
    const proceed = window.confirm('当前怪物模板有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

/** entry：定义该变量以承载业务值。 */
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
/** setMonsterStatus：处理当前场景中的对应操作。 */
  setMonsterStatus(announce ? `已载入怪物模板 ${entry.monster.name}` : '');
  renderMonsterList();
}

/** saveMonsterTemplate：执行对应的业务逻辑。 */
async function saveMonsterTemplate(): Promise<void> {
  if (!currentMonsterKey) {
    setMonsterStatus('请先选择一个怪物模板', true);
    return;
  }

/** monster：定义该变量以承载业务值。 */
  let monster: MonsterTemplateRecord;
  try {
    monster = syncMonsterDraftFromForm();
  } catch (error) {
/** setMonsterStatus：处理当前场景中的对应操作。 */
    setMonsterStatus(error instanceof Error ? error.message : '怪物模板数据非法', true);
    return;
  }

  monsterSaveBtn.disabled = true;
  try {
/** result：定义该变量以承载业务值。 */
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
/** setMonsterStatus：处理当前场景中的对应操作。 */
    setMonsterStatus(error instanceof Error ? error.message : '保存怪物模板失败', true);
  } finally {
    monsterSaveBtn.disabled = false;
  }
}

/** loadEditorCatalog：执行对应的业务逻辑。 */
async function loadEditorCatalog(): Promise<void> {
/** result：定义该变量以承载业务值。 */
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

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** loadConfigFileList：执行对应的业务逻辑。 */
async function loadConfigFileList(): Promise<void> {
/** result：定义该变量以承载业务值。 */
  const result = await request<LocalConfigFileListRes>('/api/config-files');
  configFiles = result.files;
  renderConfigFileList();
  if (!currentConfigFilePath && configFiles.length > 0) {
    await selectConfigFile(configFiles[0]!.path, false);
  }
}

/** selectConfigFile：执行对应的业务逻辑。 */
async function selectConfigFile(filePath: string, announce = true): Promise<void> {
  if (configFileDirty && currentConfigFilePath && currentConfigFilePath !== filePath) {
/** proceed：定义该变量以承载业务值。 */
    const proceed = window.confirm('当前配置文件有未保存修改，切换后会丢失这些内容。继续吗？');
    if (!proceed) {
      return;
    }
  }

/** file：定义该变量以承载业务值。 */
  const file = await request<LocalConfigFileRes>(`/api/config-file?path=${encodeURIComponent(filePath)}`);
  currentConfigFilePath = file.path;
  configFileEditorEl.value = file.content;
  configFileDirty = false;
  configFileEmptyEl.classList.add('hidden');
  configFilePanelEl.classList.remove('hidden');
  configFileCurrentNameEl.textContent = file.path.split('/').pop() ?? file.path;
  configFileCurrentMetaEl.textContent = file.path;
/** setConfigFileStatus：处理当前场景中的对应操作。 */
  setConfigFileStatus(announce ? `已载入配置文件 ${file.path}` : '');
  renderConfigFileList();
}

/** saveConfigFile：执行对应的业务逻辑。 */
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
/** setConfigFileStatus：处理当前场景中的对应操作。 */
    setConfigFileStatus(error instanceof Error ? error.message : '保存配置文件失败', true);
  } finally {
    configFileSaveBtn.disabled = false;
  }
}

/** renderServiceStatus：执行对应的业务逻辑。 */
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

/** refreshServiceStatus：执行对应的业务逻辑。 */
async function refreshServiceStatus(): Promise<void> {
  try {
/** status：定义该变量以承载业务值。 */
    const status = await request<LocalServerStatusRes>('/api/server/status');
    renderServiceStatus(status);
  } catch (error) {
/** setAppStatus：处理当前场景中的对应操作。 */
    setAppStatus(error instanceof Error ? error.message : '读取服务状态失败', true);
  }
}

/** restartService：执行对应的业务逻辑。 */
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
/** setAppStatus：处理当前场景中的对应操作。 */
    setAppStatus(error instanceof Error ? error.message : '重启服务失败', true);
  } finally {
    serviceRestartBtn.disabled = !serviceManaged;
  }
}

/** bindEvents：执行对应的业务逻辑。 */
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
/** setConfigFileStatus：处理当前场景中的对应操作。 */
      setConfigFileStatus(error instanceof Error ? error.message : '加载配置文件列表失败', true);
    });
  });
  configFileListEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-config-path]');
/** filePath：定义该变量以承载业务值。 */
    const filePath = button?.dataset.configPath;
    if (!filePath) return;
    selectConfigFile(filePath).catch((error: unknown) => {
/** setConfigFileStatus：处理当前场景中的对应操作。 */
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
/** setConfigFileStatus：处理当前场景中的对应操作。 */
      setConfigFileStatus(error instanceof Error ? error.message : '重新读取配置文件失败', true);
    });
  });

  techniqueSearchEl.addEventListener('input', () => renderTechniqueList());
  techniqueRefreshBtn.addEventListener('click', () => {
    loadTechniqueTemplateList(currentTechniqueKey, currentTechniqueSkillId, currentTechniqueEffectIndex).catch((error: unknown) => {
/** setTechniqueStatus：处理当前场景中的对应操作。 */
      setTechniqueStatus(error instanceof Error ? error.message : '加载功法列表失败', true);
    });
  });
  techniqueListEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-technique-key]');
/** key：定义该变量以承载业务值。 */
    const key = button?.dataset.techniqueKey;
    if (!key) return;
    selectTechniqueTemplate(key).catch((error: unknown) => {
/** setTechniqueStatus：处理当前场景中的对应操作。 */
      setTechniqueStatus(error instanceof Error ? error.message : '读取功法失败', true);
    });
  });
  techniqueSkillSelectEl.addEventListener('change', () => {
    currentTechniqueSkillId = techniqueSkillSelectEl.value || null;
    currentTechniqueEffectIndex = null;
    renderTechniquePanel();
  });
  techniqueEffectSelectEl.addEventListener('change', () => {
/** value：定义该变量以承载业务值。 */
    const value = techniqueEffectSelectEl.value.trim();
    currentTechniqueEffectIndex = value ? Number(value) : null;
    renderTechniqueEffectSummary();
    renderTechniqueEffectEditor();
  });
  techniqueEffectEditorEl.addEventListener('change', (event) => {
/** target：定义该变量以承载业务值。 */
    const target = event.target as HTMLElement;
    if (target instanceof HTMLSelectElement && target.id === 'technique-stat-mode') {
/** updateTechniqueMode：处理当前场景中的对应操作。 */
      updateTechniqueMode('statMode', target.value === 'flat' ? 'flat' : 'percent');
      return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'technique-attr-mode') {
/** updateTechniqueMode：处理当前场景中的对应操作。 */
      updateTechniqueMode('attrMode', target.value === 'flat' ? 'flat' : 'percent');
      return;
    }
    if (target instanceof HTMLSelectElement && target.hasAttribute('data-tech-bonus-key-select')) {
/** row：定义该变量以承载业务值。 */
      const row = target.closest<HTMLElement>('[data-tech-bonus-row]');
/** groupKey：定义该变量以承载业务值。 */
      const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
/** previousKey：定义该变量以承载业务值。 */
      const previousKey = row?.dataset.techBonusKey;
      if (!groupKey || !previousKey) {
        return;
      }
      updateTechniqueModifierKey(groupKey, previousKey, target.value.trim());
    }
  });
  techniqueEffectEditorEl.addEventListener('input', (event) => {
/** target：定义该变量以承载业务值。 */
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-tech-bonus-value-input')) {
      return;
    }
/** row：定义该变量以承载业务值。 */
    const row = target.closest<HTMLElement>('[data-tech-bonus-row]');
/** groupKey：定义该变量以承载业务值。 */
    const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
/** key：定义该变量以承载业务值。 */
    const key = row?.dataset.techBonusKey;
    if (!groupKey || !key) {
      return;
    }
    updateTechniqueModifierValue(groupKey, key, target.value);
  });
  techniqueEffectEditorEl.addEventListener('click', (event) => {
/** target：定义该变量以承载业务值。 */
    const target = event.target as HTMLElement;
/** addButton：定义该变量以承载业务值。 */
    const addButton = target.closest<HTMLButtonElement>('[data-tech-add-row]');
    if (addButton) {
      addTechniqueModifierRow(addButton.dataset.techAddRow as TechniqueModifierGroupKey);
      return;
    }
/** removeButton：定义该变量以承载业务值。 */
    const removeButton = target.closest<HTMLButtonElement>('[data-tech-remove-row]');
    if (!removeButton) {
      return;
    }
/** row：定义该变量以承载业务值。 */
    const row = removeButton.closest<HTMLElement>('[data-tech-bonus-row]');
/** groupKey：定义该变量以承载业务值。 */
    const groupKey = row?.dataset.techBonusGroup as TechniqueModifierGroupKey | undefined;
/** key：定义该变量以承载业务值。 */
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
/** setTechniqueStatus：处理当前场景中的对应操作。 */
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
/** setMonsterStatus：处理当前场景中的对应操作。 */
      setMonsterStatus(error instanceof Error ? error.message : '加载怪物模板列表失败', true);
    });
  });
  monsterListEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-monster-key]');
/** key：定义该变量以承载业务值。 */
    const key = button?.dataset.monsterKey;
    if (!key) return;
    selectMonsterTemplate(key).catch((error: unknown) => {
/** setMonsterStatus：处理当前场景中的对应操作。 */
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
/** select：定义该变量以承载业务值。 */
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-drop-field="itemId"]');
    if (!select) {
      return;
    }
/** row：定义该变量以承载业务值。 */
    const row = select.closest<HTMLElement>('[data-drop-row]');
    if (!row) {
      return;
    }
/** item：定义该变量以承载业务值。 */
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
/** removeButton：定义该变量以承载业务值。 */
    const removeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-drop-remove]');
    if (!removeButton) {
      return;
    }
    removeButton.closest('[data-drop-row]')?.remove();
/** rows：定义该变量以承载业务值。 */
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
/** setMonsterStatus：处理当前场景中的对应操作。 */
      setMonsterStatus(error instanceof Error ? error.message : '重新读取怪物模板失败', true);
    });
  });
}

/** bootstrap：执行对应的业务逻辑。 */
async function bootstrap(): Promise<void> {
  populateMonsterStaticOptions();
  bindEvents();
/** nextMapEditor：定义该变量以承载业务值。 */
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
/** setAppStatus：处理当前场景中的对应操作。 */
  setAppStatus(error instanceof Error ? error.message : '本地配置编辑器初始化失败', true);
});

window.addEventListener('beforeunload', () => {
  if (servicePollTimer !== null) {
    window.clearInterval(servicePollTimer);
  }
});




