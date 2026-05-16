/**
 * ActorBlueprint：可克隆的 actor 战斗运行态快照。
 *
 * 用途：bot / 分身 / 宠物 等 ephemeral actor 共用此结构，以便从一个真实玩家或
 * 模板派生出独立运行的实体。蓝图只携带战斗与表现层所需字段，**不包含** inventory、
 * wallet、market、邮件、quest、accountId、社交关系等运营态。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §5.1。
 *
 * 第 1 批阶段：仅定义类型契约，server 端注册表骨架接受任意合法 ActorBlueprint；
 * 真正的 fromPlayer 克隆实现放到第 2 批。
 */

import type { AttrBonus, Attributes } from '../attribute-types';
import type {
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillConfig,
  CombatTargetingRules,
} from '../automation-types';
import type {
  BodyTrainingState,
  HeavenGateState,
  PlayerRealmState,
  TechniqueState,
} from '../cultivation-types';
import type { EquipmentSlots } from '../item-runtime-types';
import type { NumericRatioDivisors, NumericStats } from '../numeric';
import type { TemporaryBuffState } from '../skill-types';

/** 蓝图唯一 ID 前缀。 */
export const ACTOR_BLUEPRINT_ID_PREFIX = 'bp_';

/**
 * 角色身份外观（不含账号关联字段）。
 * displayName 缺省时由客户端 fallback 为 name。
 */
export interface ActorBlueprintIdentity {
  /** 角色名（用于聊天/通知/队伍展示）。 */
  readonly name: string;
  /** 显示名（HUD/世界标签优先使用）。 */
  readonly displayName: string;
  /** 所属宗门 ID；未入门为 null。 */
  readonly sectId: string | null;
}

/** 蓝图层面的灵根状态摘要（数值面板已收敛到 attrs，此处保留可选元数据）。 */
export interface ActorSpiritualRootsSnapshot {
  /** 是否包含天灵根。 */
  readonly hasHeavenRoot: boolean;
  /** 是否包含神灵根。 */
  readonly hasDivineRoot: boolean;
  /** 是否处于碎灵状态。 */
  readonly shattered: boolean;
}

/**
 * Actor 战斗组合体快照：派生战斗结算与自动战斗所需的最小字段集合。
 *
 * 与 PlayerState 的差异：
 * - 不携带 inventory / wallet / market / mail / quest / pendingLogbookMessages
 * - 不携带账号、社交、合服、跨服等运营态
 * - 仅携带"打架"所需结构 + 自动战斗偏好 + 已学功法清单
 */
export interface ActorCombatantSnapshot {
  /** 基础属性（未叠加 buff/装备 加成）。 */
  readonly baseAttrs: Readonly<Attributes>;
  /** 最终面板属性（已叠加 buff/装备）。 */
  readonly finalAttrs: Readonly<Attributes>;
  /** 派生数值统计：移动速度、攻击间隔、五行加成等。 */
  readonly numericStats: Readonly<NumericStats>;
  /** 数值比率除数：暴击率、闪避率等概率类参数的分母配置。 */
  readonly ratioDivisors: Readonly<NumericRatioDivisors>;
  /** 当前境界状态。 */
  readonly realm: Readonly<PlayerRealmState>;
  /** 体修状态。 */
  readonly bodyTraining: Readonly<BodyTrainingState>;
  /** 通天门状态；未开启时为 null。 */
  readonly heavenGate: Readonly<HeavenGateState> | null;
  /** 灵根摘要；未配置时为 null。 */
  readonly spiritualRoots: ActorSpiritualRootsSnapshot | null;
  /** 装备栏完整快照。 */
  readonly equipment: Readonly<EquipmentSlots>;
  /** 已学功法 + 等级 + 子技能。 */
  readonly techniques: readonly Readonly<TechniqueState>[];
  /** 当前生效的临时 buff（含 duration、stacks）。 */
  readonly buffs: readonly Readonly<TemporaryBuffState>[];
  /** 来自蓝图源玩家的属性 bonus 列表（如装备词条、buff、灵根）。 */
  readonly attrBonuses: readonly Readonly<AttrBonus>[];
  /** 自动战斗主开关。 */
  readonly autoBattle: boolean;
  /** 是否自动反击。 */
  readonly autoRetaliate: boolean;
  /** 自动战斗的技能优先级配置。 */
  readonly autoBattleSkills: readonly Readonly<AutoBattleSkillConfig>[];
  /** 自动战斗的目标筛选模式。 */
  readonly autoBattleTargetingMode: AutoBattleTargetingMode;
  /** 自动用药列表。 */
  readonly autoUsePills: readonly Readonly<AutoUsePillConfig>[];
  /** 战斗目标过滤规则（同盟、宗门、敌对等）。 */
  readonly combatTargetingRules: Readonly<CombatTargetingRules>;
}

/**
 * Actor 生命值/灵力初始化策略。
 * - `full_hp_qi`：bot 默认，登录时直接拉满，避免压测时刚出生就低血。
 * - `inherit`：沿用蓝图源玩家当前值，分身可选用以保持沉浸。
 */
export type ActorVitalsPolicy = 'full_hp_qi' | 'inherit';

/**
 * 可克隆的 actor 蓝图。
 *
 * 仅 bot 路径下需要进 ActorBlueprintRegistry；分身/宠物如使用蓝图也走相同结构，
 * 但 server 内部可能直接生成而不入注册表（持久化路径不同）。
 */
export interface ActorBlueprint {
  /** 蓝图唯一 ID，前缀固定 `bp_`。 */
  readonly blueprintId: string;
  /** 蓝图克隆来源玩家 ID；template 派生（如宠物）时为 null。 */
  readonly sourcePlayerId: string | null;
  /** 蓝图生成时间（毫秒）。 */
  readonly createdAtMs: number;
  /** 推荐生成地图模板 ID。 */
  readonly templateMapId: string;
  /** 推荐生成 X 坐标。 */
  readonly templateX: number;
  /** 推荐生成 Y 坐标。 */
  readonly templateY: number;
  /** 角色身份外观。 */
  readonly identity: ActorBlueprintIdentity;
  /** 战斗组合体快照。 */
  readonly combatant: ActorCombatantSnapshot;
  /** 生命值/灵力初始化策略。 */
  readonly vitalsPolicy: ActorVitalsPolicy;
}
