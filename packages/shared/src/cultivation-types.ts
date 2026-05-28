/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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

/**
 * 功法量化模板的 sparse overlay 层。
 *
 * 主干层数/经验/属性由 `maxLayer`、`attrRatio`、`layerGains` 等数字配置展开产生；
 * 本字段仅保留策划权威的逐层气机投影等非量化副产物（天阶 49 层等场景），
 * 按 `level` merge 进展开结果。
 */
export interface TechniqueTemplateSparseLayer {
  /** 层号，与展开后的 `TechniqueLayerDef.level` 对齐。 */
  level: number;
  /** 气机投影修正，展开时按层 merge 到对应 `TechniqueLayerDef.qiProjection`。 */
  qiProjection?: QiProjectionModifier[];
}

/**
 * 功法逐层增量压缩配置。
 *
 * 运行时展开为每层 `{ attrs, specialStats }`，替代冗余的逐层 `layers[]` 列表。
 *
 * - `attrs` / `specialStats`：每层常驻的基础增量，展开时逐层原样复制；
 * - `deltas[]`：按 `[fromLevel, toLevel]` 区间叠加的差量，`toLevel` 默认 `maxLayer`；
 *   同一层可被多条 delta 叠加，采用 ADD 语义（累加而非覆写）。
 */
export interface TechniqueLayerGainsDelta {
  /** delta 生效起始层（含）。 */
  fromLevel: number;
  /** delta 生效结束层（含）；不填则覆盖到 `maxLayer`。 */
  toLevel?: number;
  /** 对每层 attrs 的累加增量。 */
  attrsAdd?: Partial<Attributes>;
  /** 对每层 specialStats 的累加增量。 */
  specialStatsAdd?: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>>;
}

/** 功法每层增量打包配置。 */
export interface TechniqueLayerGains {
  /** 每层常驻的基础六维增量。 */
  attrs?: Partial<Attributes>;
  /** 每层常驻的基础特殊属性增量（悟性/幸运）。 */
  specialStats?: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>>;
  /** 段式差量，按 `[fromLevel, toLevel]` 累加到每层基础值上。 */
  deltas?: TechniqueLayerGainsDelta[];
}

/**
 * 功法模板（内容配置层）。
 *
 * - 新"量化"格式：所有功法使用 `maxLayer` + `expDifficulty` 表达数字层数和经验曲线；
 *   六维属性可用 `attrRatio` 公式分配，或用 `layerGains` 表达每层增量。
 *   运行时启动期按公式展开为完整 layers，不进入高频路径。
 * - 旧"逐层"格式：使用 `layers[]` 显式配置每层 `attrs` 和 `expFactor`，仅作为过渡期兼容路径。
 * - `layers` 在新格式下只用于承载 sparse overlay（例如天阶 49 层的 qiProjection）。
 */
export interface TechniqueTemplate {
  /** 功法唯一 id。 */
  id: string;
  /** 功法展示名称。 */
  name: string;
  /** 功法描述文本。 */
  desc?: string;
  /** 功法品阶（凡/黄/玄/地/天/灵/圣/帝）。 */
  grade: TechniqueGrade;
  /** 功法分类：术法 / 内功 / 神通 / 秘术。 */
  category?: TechniqueCategory;
  /** 功法境界等级（对应世界境界系统的 realmLv）。 */
  realmLv: number;

  /**
   * 六维分配权重（量化格式）。
   *
   * - 所有功法均可使用；运行时按权重归一后按阶段/层分配到每层属性。
   * - 例：`{ strength: 0.37, spirit: 0.31, meridians: 0.32 }`；也可填 `37/31/32`，归一结果相同。
   */
  attrRatio?: Partial<Record<AttrKey, number>>;
  /**
   * 六维总量浮动系数（量化格式）。
   *
   * - 默认 0，规范范围 `[-0.15, +0.10]`。
   * - 公式：`T = (g²·(realmLv+25) + 50) × (1 + attrFloat)`。
   */
  attrFloat?: number;
  /**
   * 总层数（量化格式）。
   *
   * - 默认 9，范围 `[3, 49]`。
   * - 用于经验曲线归一与阶段划分（1/3 入门 / 1/3 小成 / 余数归大成）。
   */
  maxLayer?: number;
  /**
   * 经验难度系数（量化格式）。
   *
   * - 默认 1.0，范围 `[0.5, 2.0]`。
   * - 乘到 `totalExp` 上，阶段内部仍走 `K=1.10` 的平滑递增与 `[1,2,4]` 阶段权重。
   */
  expDifficulty?: number;

  /**
   * 旧格式逐层配置，或新格式的 sparse overlay。
   *
   * - 旧格式：`{ level, expFactor|expToNext, attrs, specialStats, qiProjection }`。
   * - 新格式：仅 `{ level, qiProjection }`，其余字段由公式展开生成。
   */
  layers?: TechniqueLayerDef[] | TechniqueTemplateSparseLayer[];
  /**
   * 功法逐层增量压缩配置。
   *
   * 运行时展开为每层 `{ attrs, specialStats }`，与 legacy `layers[]` 等价但更紧凑。
   * 若同时指定 `layers[]` 和 `layerGains`，优先 `layerGains`。
   */
  layerGains?: TechniqueLayerGains;

  /** 功法携带的主动技能（术法类使用，内功一般为空）。 */
  skills?: SkillDef[];
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
  /**
 * QiRefiningMiddle：枚举成员常量定义。
 */

  QiRefiningMiddle = 7,
  /**
 * QiRefiningLate：枚举成员常量定义。
 */

  QiRefiningLate = 8,
  /**
 * FoundationMiddle：枚举成员常量定义。
 */

  FoundationMiddle = 9,
  /**
 * FoundationLate：枚举成员常量定义。
 */

  FoundationLate = 10,
  GoldenCore = 11,
  GoldenCoreMiddle = 12,
  GoldenCoreLate = 13,
  Nascent = 14,
  NascentMiddle = 15,
  NascentLate = 16,
  SoulTransform = 17,
  SoulTransformMiddle = 18,
  SoulTransformLate = 19,
  VoidRefine = 20,
  VoidRefineMiddle = 21,
  VoidRefineLate = 22,
  BodyIntegration = 23,
  BodyIntegrationMiddle = 24,
  BodyIntegrationLate = 25,
  Mahayana = 26,
  MahayanaMiddle = 27,
  MahayanaLate = 28,
  Tribulation = 29,
  TribulationMiddle = 30,
  TribulationLate = 31,
  Ascension = 32,
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
 * bodyTrainingLevel：炼体层数，每层提供 1% 全属性增幅。
 */

  bodyTrainingLevel?: number;
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

}

export type TechniqueComprehensionSourceKind = 'normal' | 'created';

export type TechniqueTransmissionJobStatus = 'running' | 'blocked';

export type TechniqueTransmissionBlockedReason = 'teacher_out_of_range' | 'not_created_technique';

export interface TechniqueTransmissionJobState {
  jobId: string;
  teacherPlayerId: string;
  teacherName?: string;
  startedAtTick: number;
  status: TechniqueTransmissionJobStatus;
  blockedReason?: TechniqueTransmissionBlockedReason;
  range: number;
  /** 当前每息可推进的领悟进度，用于客户端估算速率。 */
  progressGainPerTick?: number;
  /** 按当前速率估算的剩余完成息数。 */
  estimatedRemainingTicks?: number;
  interruptWaitRemainingTicks?: number;
  interruptState?: {
    reason?: 'move' | 'attack' | 'cancel' | 'cultivate' | 'defeat';
    waitTotalTicks?: number;
    waitRemainingTicks?: number;
    startedAtTick?: number;
  } | null;
}

export interface PendingTechniqueComprehensionState {
  techId: string;
  name: string;
  sourceKind: TechniqueComprehensionSourceKind;
  creatorPlayerId?: string;
  /**
   * selfComprehensionAllowed：是否允许通过主修修炼自行领悟。
   * 功法书和自己创建的自创功法为 true；被他人传授加入的功法为 false，必须由传法 job 推进。
   */
  selfComprehensionAllowed?: boolean;
  progress: number;
  requiredProgress: number;
  realmLv: number;
  grade?: TechniqueGrade;
  category?: TechniqueCategory;
  createdAtTick: number;
  updatedAtTick: number;
  activeTransferJob?: TechniqueTransmissionJobState | null;
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
