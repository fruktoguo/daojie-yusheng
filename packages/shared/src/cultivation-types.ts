import type { ElementKey } from './numeric';
import type { BreakthroughItemRequirement, BreakthroughPreviewState } from './progression-view-types';
import type { AttrKey, Attributes } from './attribute-types';
import type { SkillDef } from './skill-types';

/** 功法境界。 */
export enum TechniqueRealm {
  Entry = 0,
  Minor = 1,
  Major = 2,
  Perfection = 3,
}

/** 功法品阶。 */
export type TechniqueGrade = 'mortal' | 'yellow' | 'mystic' | 'earth' | 'heaven' | 'spirit' | 'saint' | 'emperor';

/** 功法分类。 */
export type TechniqueCategory = 'arts' | 'internal' | 'divine' | 'secret';

/** 功法单属性成长分段。 */
export interface TechniqueAttrCurveSegment {
  startLevel: number;
  endLevel?: number;
  gainPerLevel: number;
}

/** 功法六维成长曲线。 */
export type TechniqueAttrCurves = Partial<Record<AttrKey, TechniqueAttrCurveSegment[]>>;

/** 功法单层配置。 */
export interface TechniqueLayerDef {
  level: number;
  expToNext: number;
  attrs?: Partial<Attributes>;
}

/** 玩家大境界。 */
export enum PlayerRealmStage {
  Mortal = 0,
  BodyTempering = 1,
  BoneForging = 2,
  Meridian = 3,
  Innate = 4,
  QiRefining = 5,
  Foundation = 6,
}

/** 开天门五行数值。 */
export type HeavenGateRootValues = Record<ElementKey, number>;

/** 开天门暂存状态。 */
export interface HeavenGateState {
  unlocked: boolean;
  severed: ElementKey[];
  roots: HeavenGateRootValues | null;
  entered: boolean;
  averageBonus: number;
}

/** 玩家大境界状态。 */
export interface PlayerRealmState {
  stage: PlayerRealmStage;
  realmLv: number;
  displayName: string;
  name: string;
  shortName: string;
  path: 'martial' | 'immortal' | 'ascended';
  narrative: string;
  review?: string;
  lifespanYears: number | null;
  progress: number;
  progressToNext: number;
  breakthroughReady: boolean;
  nextStage?: PlayerRealmStage;
  breakthroughItems: BreakthroughItemRequirement[];
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
  breakthrough?: BreakthroughPreviewState;
  heavenGate?: HeavenGateState | null;
}

/** 玩家特殊养成数值。 */
export interface PlayerSpecialStats {
  foundation: number;
  combatExp: number;
}

/** 功法状态。 */
export interface TechniqueState {
  techId: string;
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  realmLv: number;
  realm: TechniqueRealm;
  skillsEnabled?: boolean;
  skills: SkillDef[];
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  layers?: TechniqueLayerDef[];
  attrCurves?: TechniqueAttrCurves;
}

/** 炼体状态。 */
export interface BodyTrainingState {
  level: number;
  exp: number;
  expToNext: number;
}
