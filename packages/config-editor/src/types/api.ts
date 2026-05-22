/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import type {
  Attributes,
  BasicOkRes,
  MonsterTemplateDropRecord,
  MonsterTemplateEditorItem,
  MonsterTemplateResolvedRecord,
  NumericStatPercentages,
  PartialNumericStats,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
} from '@mud/shared';

export type LocalConfigFileSummary = {
  path: string;
  name: string;
  category: string;
};

export type LocalConfigFileListRes = {
  files: LocalConfigFileSummary[];
};

export type LocalConfigFileRes = {
  path: string;
  content: string;
};

export type LocalBuffModifierMode = 'flat' | 'percent';

export type LocalTechniqueBuffTemplate = {
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

export type LocalTechniqueEffect = {
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

export type LocalTechniqueSkill = {
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

export type LocalTechniqueTemplateRecord = {
  id: string;
  name: string;
  grade: TechniqueGrade;
  category?: TechniqueCategory;
  realmLv?: number;
  layers?: TechniqueLayerDef[];
  skills: LocalTechniqueSkill[];
  [key: string]: unknown;
};

export type LocalTechniqueEntry = {
  key: string;
  filePath: string;
  index: number;
  technique: LocalTechniqueTemplateRecord;
};

export type LocalTechniqueListRes = {
  techniques: LocalTechniqueEntry[];
  sharedBuffs: LocalTechniqueBuffTemplate[];
};

export type LocalTechniqueSaveRes = BasicOkRes & {
  technique: LocalTechniqueTemplateRecord;
};

export type LocalServerStatusRes = {
  managed: boolean;
  running: boolean;
  pid?: number;
  lastRestartAt?: string;
  lastRestartReason?: string;
  mode: string;
};

export type MonsterTemplateDrop = MonsterTemplateDropRecord;
export type MonsterTemplateRecord = MonsterTemplateResolvedRecord;

export type LocalMonsterTemplateEntry = {
  key: string;
  filePath: string;
  index: number;
  monster: MonsterTemplateRecord;
};

export type LocalMonsterTemplateListRes = {
  monsters: LocalMonsterTemplateEntry[];
};

export type LocalMonsterSaveRes = BasicOkRes & {
  updatedMapCount: number;
  monster: MonsterTemplateRecord;
};

export type LocalEditorItemOption = MonsterTemplateEditorItem;

export type LocalEditorCatalogRes = {
  items: LocalEditorItemOption[];
};

export type { NumericStatPercentages, PartialNumericStats, Attributes };
