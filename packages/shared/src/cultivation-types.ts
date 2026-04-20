import type { ElementKey } from './numeric';
import type { BreakthroughItemRequirement, BreakthroughPreviewState } from './progression-view-types';
import type { AttrKey, Attributes } from './attribute-types';
import type { SkillDef } from './skill-types';

/** 功法境界。 */
export enum TechniqueRealm {
/**
 * Entry：枚举成员常量定义。
 */

  Entry = 0,  
  /**
 * Minor：枚举成员常量定义。
 */

  Minor = 1,  
  /**
 * Major：枚举成员常量定义。
 */

  Major = 2,  
  /**
 * Perfection：枚举成员常量定义。
 */

  Perfection = 3,
}

/** 功法品阶。 */
export type TechniqueGrade = 'mortal' | 'yellow' | 'mystic' | 'earth' | 'heaven' | 'spirit' | 'saint' | 'emperor';

/** 功法分类。 */
export type TechniqueCategory = 'arts' | 'internal' | 'divine' | 'secret';

/** 功法单属性成长分段。 */
export interface TechniqueAttrCurveSegment {
/**
 * startLevel：TechniqueAttrCurveSegment 内部字段。
 */

  startLevel: number;  
  /**
 * endLevel：TechniqueAttrCurveSegment 内部字段。
 */

  endLevel?: number;  
  /**
 * gainPerLevel：TechniqueAttrCurveSegment 内部字段。
 */

  gainPerLevel: number;
}

/** 功法六维成长曲线。 */
export type TechniqueAttrCurves = Partial<Record<AttrKey, TechniqueAttrCurveSegment[]>>;

/** 功法单层配置。 */
export interface TechniqueLayerDef {
/**
 * level：TechniqueLayerDef 内部字段。
 */

  level: number;  
  /**
 * expToNext：TechniqueLayerDef 内部字段。
 */

  expToNext: number;  
  /**
 * attrs：TechniqueLayerDef 内部字段。
 */

  attrs?: Partial<Attributes>;
}

/** 玩家大境界。 */
export enum PlayerRealmStage {
/**
 * Mortal：枚举成员常量定义。
 */

  Mortal = 0,  
  /**
 * BodyTempering：枚举成员常量定义。
 */

  BodyTempering = 1,  
  /**
 * BoneForging：枚举成员常量定义。
 */

  BoneForging = 2,  
  /**
 * Meridian：枚举成员常量定义。
 */

  Meridian = 3,  
  /**
 * Innate：枚举成员常量定义。
 */

  Innate = 4,  
  /**
 * QiRefining：枚举成员常量定义。
 */

  QiRefining = 5,  
  /**
 * Foundation：枚举成员常量定义。
 */

  Foundation = 6,
}

/** 开天门五行数值。 */
export type HeavenGateRootValues = Record<ElementKey, number>;

/** 开天门暂存状态。 */
export interface HeavenGateState {
/**
 * unlocked：HeavenGateState 内部字段。
 */

  unlocked: boolean;  
  /**
 * severed：HeavenGateState 内部字段。
 */

  severed: ElementKey[];  
  /**
 * roots：HeavenGateState 内部字段。
 */

  roots: HeavenGateRootValues | null;  
  /**
 * entered：HeavenGateState 内部字段。
 */

  entered: boolean;  
  /**
 * averageBonus：HeavenGateState 内部字段。
 */

  averageBonus: number;
}

/** 玩家大境界状态。 */
export interface PlayerRealmState {
/**
 * stage：PlayerRealmState 内部字段。
 */

  stage: PlayerRealmStage;  
  /**
 * realmLv：PlayerRealmState 内部字段。
 */

  realmLv: number;  
  /**
 * displayName：PlayerRealmState 内部字段。
 */

  displayName: string;  
  /**
 * name：PlayerRealmState 内部字段。
 */

  name: string;  
  /**
 * shortName：PlayerRealmState 内部字段。
 */

  shortName: string;  
  /**
 * path：PlayerRealmState 内部字段。
 */

  path: 'martial' | 'immortal' | 'ascended';  
  /**
 * narrative：PlayerRealmState 内部字段。
 */

  narrative: string;  
  /**
 * review：PlayerRealmState 内部字段。
 */

  review?: string;  
  /**
 * lifespanYears：PlayerRealmState 内部字段。
 */

  lifespanYears: number | null;  
  /**
 * progress：PlayerRealmState 内部字段。
 */

  progress: number;  
  /**
 * progressToNext：PlayerRealmState 内部字段。
 */

  progressToNext: number;  
  /**
 * breakthroughReady：PlayerRealmState 内部字段。
 */

  breakthroughReady: boolean;  
  /**
 * nextStage：PlayerRealmState 内部字段。
 */

  nextStage?: PlayerRealmStage;  
  /**
 * breakthroughItems：PlayerRealmState 内部字段。
 */

  breakthroughItems: BreakthroughItemRequirement[];  
  /**
 * minTechniqueLevel：PlayerRealmState 内部字段。
 */

  minTechniqueLevel: number;  
  /**
 * minTechniqueRealm：PlayerRealmState 内部字段。
 */

  minTechniqueRealm?: TechniqueRealm;  
  /**
 * breakthrough：PlayerRealmState 内部字段。
 */

  breakthrough?: BreakthroughPreviewState;  
  /**
 * heavenGate：PlayerRealmState 内部字段。
 */

  heavenGate?: HeavenGateState | null;
}

/** 玩家特殊养成数值。 */
export interface PlayerSpecialStats {
/**
 * foundation：PlayerSpecialStats 内部字段。
 */

  foundation: number;  
  /**
 * combatExp：PlayerSpecialStats 内部字段。
 */

  combatExp: number;
}

/** 功法状态。 */
export interface TechniqueState {
/**
 * techId：TechniqueState 内部字段。
 */

  techId: string;  
  /**
 * name：TechniqueState 内部字段。
 */

  name: string;  
  /**
 * level：TechniqueState 内部字段。
 */

  level: number;  
  /**
 * exp：TechniqueState 内部字段。
 */

  exp: number;  
  /**
 * expToNext：TechniqueState 内部字段。
 */

  expToNext: number;  
  /**
 * realmLv：TechniqueState 内部字段。
 */

  realmLv: number;  
  /**
 * realm：TechniqueState 内部字段。
 */

  realm: TechniqueRealm;  
  /**
 * skillsEnabled：TechniqueState 内部字段。
 */

  skillsEnabled?: boolean;  
  /**
 * skills：TechniqueState 内部字段。
 */

  skills: SkillDef[];  
  /**
 * grade：TechniqueState 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * category：TechniqueState 内部字段。
 */

  category?: TechniqueCategory;  
  /**
 * layers：TechniqueState 内部字段。
 */

  layers?: TechniqueLayerDef[];  
  /**
 * attrCurves：TechniqueState 内部字段。
 */

  attrCurves?: TechniqueAttrCurves;
}

/** 炼体状态。 */
export interface BodyTrainingState {
/**
 * level：BodyTrainingState 内部字段。
 */

  level: number;  
  /**
 * exp：BodyTrainingState 内部字段。
 */

  exp: number;  
  /**
 * expToNext：BodyTrainingState 内部字段。
 */

  expToNext: number;
}
