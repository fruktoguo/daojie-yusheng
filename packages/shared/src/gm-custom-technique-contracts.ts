/**
 * GM 手工创建自创功法的共享 HTTP 契约。
 *
 * 客户端只提交权重草稿；服务端负责校验、预算展开、生成正式模板并发布。
 */
import type { AttrKey, Attributes } from './attribute-types';
import type { TechniqueCategory, TechniqueGrade, TechniqueLayerDef, TechniqueTemplate } from './cultivation-types';
import type { ElementKey } from './numeric';
import type { SkillDamageKind } from './skill-types';
import type {
  TechniqueArtsStrengthAttributeBaseStat,
  TechniqueArtsStrengthPercentBonusKey,
} from './technique-arts-strength';

export type GmCustomTechniqueCategory = Extract<TechniqueCategory, 'internal' | 'arts'>;
export type GmCustomTechniqueTargetType = 'single' | 'line' | 'box' | 'area';
export type GmCustomTechniqueTargetMode = 'any' | 'entity' | 'tile';

export interface GmCustomTechniqueStructureStrengthInput {
  damage: number;
  cost: number;
  cooldown: number;
  chant: number;
  castRange: number;
  area: number;
}

export interface GmCustomTechniqueFormulaStrengthInput {
  attributeBases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>;
  percentBonuses?: Partial<Record<TechniqueArtsStrengthPercentBonusKey, number>>;
}

export interface GmCustomTechniqueArtsSkillInput {
  name: string;
  desc?: string;
  unlockLevel: number;
  damageKind: SkillDamageKind;
  element?: ElementKey;
  target: {
    type: GmCustomTechniqueTargetType;
    targetMode: GmCustomTechniqueTargetMode;
  };
  structureStrength: GmCustomTechniqueStructureStrengthInput;
  formulaStrength: GmCustomTechniqueFormulaStrengthInput;
}

interface GmCustomTechniqueInputBase {
  name: string;
  desc?: string;
  grade: TechniqueGrade;
  realmLv: number;
  maxLayer: number;
  expDifficulty: number;
  /** 总强度倍率，0.8 表示基准的 80%，1.2 表示基准的 120%。 */
  budgetPercent: number;
}

export interface GmCustomInternalTechniqueInput extends GmCustomTechniqueInputBase {
  category: 'internal';
  attrRatio: Partial<Record<AttrKey, number>>;
  skills?: never;
}

export interface GmCustomArtsTechniqueInput extends GmCustomTechniqueInputBase {
  category: 'arts';
  skills: [GmCustomTechniqueArtsSkillInput];
  attrRatio?: never;
}

export type GmCustomTechniqueInput = GmCustomInternalTechniqueInput | GmCustomArtsTechniqueInput;

export interface GmPreviewCustomTechniqueReq {
  technique: GmCustomTechniqueInput;
}

export interface GmCreateCustomTechniqueReq extends GmPreviewCustomTechniqueReq {
  /** 客户端生成的幂等键；同一键重复提交相同请求只创建一次。 */
  operationId: string;
  /** 可选的玩家创作者归属；缺省时记录为 GM 手工创建。 */
  creatorPlayerId?: string;
}

export interface GmCustomTechniquePreview {
  template: TechniqueTemplate;
  expandedLayers: TechniqueLayerDef[];
  fullLevelAttrs?: Partial<Attributes>;
  validationReport: unknown;
}

export interface GmPreviewCustomTechniqueRes {
  preview: GmCustomTechniquePreview;
}

export interface GmCreateCustomTechniqueRes extends GmPreviewCustomTechniqueRes {
  techniqueId: string;
  /** false 表示命中相同 operationId 的幂等重放。 */
  created: boolean;
}
