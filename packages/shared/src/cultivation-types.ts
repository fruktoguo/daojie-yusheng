import type { ElementKey } from './numeric';
import type { BreakthroughItemRequirement, BreakthroughPreviewState } from './progression-view-types';
import type { AttrKey, Attributes } from './attribute-types';
import type { SkillDef } from './skill-types';
import type { QiProjectionModifier } from './qi';

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
 * startLevel：start等级数值。
 */

  startLevel: number;  
  /**
 * endLevel：end等级数值。
 */

  endLevel?: number;  
  /**
 * gainPerLevel：gainPer等级数值。
 */

  gainPerLevel: number;
}

/** 功法六维成长曲线。 */
export type TechniqueAttrCurves = Partial<Record<AttrKey, TechniqueAttrCurveSegment[]>>;

/** 功法单层配置。 */
export interface TechniqueLayerDef {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext: number;  
  /**
 * attrs：attr相关字段。
 */

  attrs?: Partial<Attributes>;
  /**
 * specialStats：悟性、幸运等非六维特殊属性加成。
 */

  specialStats?: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>>;
  /**
 * qiProjection：气机投影修正规则。
 */

  qiProjection?: QiProjectionModifier[];
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
 * unlocked：unlocked相关字段。
 */

  unlocked: boolean;  
  /**
 * severed：severed相关字段。
 */

  severed: ElementKey[];  
  /**
 * roots：根容器相关字段。
 */

  roots: HeavenGateRootValues | null;  
  /**
 * entered：entered相关字段。
 */

  entered: boolean;  
  /**
 * averageBonus：averageBonu相关字段。
 */

  averageBonus: number;
}

/** 玩家大境界状态。 */
export interface PlayerRealmState {
/**
 * stage：stage相关字段。
 */

  stage: PlayerRealmStage;  
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * shortName：short名称名称或显示文本。
 */

  shortName: string;  
  /**
 * path：路径相关字段。
 */

  path: 'martial' | 'immortal' | 'ascended';  
  /**
 * narrative：narrative相关字段。
 */

  narrative: string;  
  /**
 * review：review相关字段。
 */

  review?: string;  
  /**
 * lifespanYears：lifespanYear相关字段。
 */

  lifespanYears: number | null;  
  /**
 * progress：进度状态或数据块。
 */

  progress: number;  
  /**
 * progressToNext：进度ToNext相关字段。
 */

  progressToNext: number;  
  /**
 * breakthroughReady：breakthroughReady相关字段。
 */

  breakthroughReady: boolean;  
  /**
 * nextStage：nextStage相关字段。
 */

  nextStage?: PlayerRealmStage;  
  /**
 * breakthroughItems：集合字段。
 */

  breakthroughItems: BreakthroughItemRequirement[];  
  /**
 * minTechniqueLevel：min功法等级数值。
 */

  minTechniqueLevel: number;  
  /**
 * minTechniqueRealm：min功法Realm相关字段。
 */

  minTechniqueRealm?: TechniqueRealm;  
  /**
 * breakthrough：breakthrough相关字段。
 */

  breakthrough?: BreakthroughPreviewState;  
  /**
 * heavenGate：heavenGate相关字段。
 */

  heavenGate?: HeavenGateState | null;
}

/** 玩家特殊养成数值。 */
export interface PlayerSpecialStats {
/**
 * foundation：foundation相关字段。
 */

  foundation: number;
  /**
 * rootFoundation：根基点数，每点提供 1% 六维境界乘区。
 */

  rootFoundation?: number;
  /**
 * combatExp：战斗Exp相关字段。
 */

  combatExp: number;  
  /**
 * comprehension：悟性，已从六维移入特殊属性。
 */

  comprehension?: number;  
  /**
 * luck：幸运，已从六维移入特殊属性。
 */

  luck?: number;
}

/** 功法状态。 */
export interface TechniqueState {
/**
 * techId：techID标识。
 */

  techId: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * level：等级数值。
 */

  level: number;  
  /**
 * exp：exp相关字段。
 */

  exp: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext: number;  
  /**
 * realmLv：realmLv相关字段。
 */

  realmLv: number;  
  /**
 * realm：realm相关字段。
 */

  realm: TechniqueRealm;  
  /**
 * skillsEnabled：启用开关或状态标识。
 */

  skillsEnabled?: boolean;  
  /**
 * skills：技能相关字段。
 */

  skills: SkillDef[];  
  /**
 * grade：grade相关字段。
 */

  grade?: TechniqueGrade;  
  /**
 * category：category相关字段。
 */

  category?: TechniqueCategory;  
  /**
 * layers：层相关字段。
 */

  layers?: TechniqueLayerDef[];  
  /**
 * attrCurves：attrCurve相关字段。
 */

  attrCurves?: TechniqueAttrCurves;
}

/** 炼体状态。 */
export interface BodyTrainingState {
/**
 * level：等级数值。
 */

  level: number;  
  /**
 * exp：exp相关字段。
 */

  exp: number;  
  /**
 * expToNext：expToNext相关字段。
 */

  expToNext: number;
}
