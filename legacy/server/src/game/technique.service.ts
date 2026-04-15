/**
 * 功法与境界系统：修炼推进、功法升级、突破判定、技能解锁
 */
import { Injectable } from '@nestjs/common';
import {
  ActionDef,
  AttrBonus,
  calcBodyTrainingAttrBonus,
  BreakthroughPreviewState,
  BreakthroughRequirementView,
  BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
  calcTechniqueFinalAttrBonus,
  CULTIVATE_EXP_PER_TICK,
  DEFAULT_PLAYER_REALM_STAGE,
  deriveTechniqueRealm,
  ELEMENT_KEYS,
  ELEMENT_KEY_LABELS,
  ElementKey,
  getMonsterKillExpLevelAdjustment,
  getMonsterLevelExpDecayMultiplier,
  getBodyTrainingExpToNext,
  HEAVEN_GATE_REROLL_COST_RATIO,
  HEAVEN_GATE_SEVER_COST_RATIO,
  getTechniqueExpLevelAdjustment,
  HeavenGateRootValues,
  HeavenGateState,
  getTechniqueExpToNext,
  getTechniqueMaxLevel,
  MonsterTier,
  percentModifierToMultiplier,
  PLAYER_REALM_CONFIG,
  PLAYER_REALM_ORDER,
  PlayerRealmStage,
  PlayerRealmState,
  PlayerState,
  SHATTER_SPIRIT_PILL_COST_RATIO,
  TemporaryBuffState,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_GRADE_ORDER,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
  normalizeBodyTrainingState,
  resolveSkillUnlockLevel,
  SkillDef,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { BreakthroughConfigEntry, BreakthroughRequirementDef, ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { MapService } from './map.service';
import { PerformanceService } from './performance.service';
import { QiProjectionService } from './qi-projection.service';
import {
  BODY_TRAINING_SOURCE,
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_DURATION,
  CULTIVATION_BUFF_ID,
  CULTIVATION_REALM_EXP_PER_TICK,
  EMPTY_CULTIVATION_RESULT,
  PATH_SEVERED_BREAKTHROUGH_LABEL,
  PATH_SEVERED_BREAKTHROUGH_REASON,
  REALM_STATE_SOURCE,
  REALM_STAGE_SOURCE,
  TECHNIQUE_SOURCE_PREFIX,
} from '../constants/gameplay/technique';

/** TechniqueDirtyFlag：定义该类型的结构与数据语义。 */
type TechniqueDirtyFlag = 'inv' | 'tech' | 'attr' | 'actions';
/** TechniqueMessageKind：定义该类型的结构与数据语义。 */
type TechniqueMessageKind = 'system' | 'quest' | 'combat' | 'loot';

/** TechniqueMessage：定义该接口的能力与字段约束。 */
interface TechniqueMessage {
/** text：定义该变量以承载业务值。 */
  text: string;
  kind?: TechniqueMessageKind;
}

/** CultivationResult：定义该接口的能力与字段约束。 */
interface CultivationResult {
  error?: string;
/** changed：定义该变量以承载业务值。 */
  changed: boolean;
/** dirty：定义该变量以承载业务值。 */
  dirty: TechniqueDirtyFlag[];
/** messages：定义该变量以承载业务值。 */
  messages: TechniqueMessage[];
}

/** TechniqueExpAdvanceResult：定义该接口的能力与字段约束。 */
interface TechniqueExpAdvanceResult {
/** changed：定义该变量以承载业务值。 */
  changed: boolean;
/** gained：定义该变量以承载业务值。 */
  gained: number;
  targetLabel?: string;
/** expLabel：定义该变量以承载业务值。 */
  expLabel: string;
/** dirty：定义该变量以承载业务值。 */
  dirty: TechniqueDirtyFlag[];
/** messages：定义该变量以承载业务值。 */
  messages: TechniqueMessage[];
}

/** BreakthroughResult：定义该接口的能力与字段约束。 */
interface BreakthroughResult {
  error?: string;
/** dirty：定义该变量以承载业务值。 */
  dirty: TechniqueDirtyFlag[];
/** messages：定义该变量以承载业务值。 */
  messages: TechniqueMessage[];
}

/** HeavenGateActionResult：定义该接口的能力与字段约束。 */
interface HeavenGateActionResult {
  error?: string;
/** dirty：定义该变量以承载业务值。 */
  dirty: TechniqueDirtyFlag[];
/** messages：定义该变量以承载业务值。 */
  messages: TechniqueMessage[];
}

/** ResolvedBreakthroughRequirement：定义该接口的能力与字段约束。 */
interface ResolvedBreakthroughRequirement {
/** def：定义该变量以承载业务值。 */
  def: BreakthroughRequirementDef;
/** completed：定义该变量以承载业务值。 */
  completed: boolean;
/** blocksBreakthrough：定义该变量以承载业务值。 */
  blocksBreakthrough: boolean;
/** view：定义该变量以承载业务值。 */
  view: BreakthroughRequirementView;
}

/** MonsterKillExpInput：定义该接口的能力与字段约束。 */
interface MonsterKillExpInput {
  monsterLevel?: number;
  monsterName?: string;
  monsterTier?: MonsterTier;
  expMultiplier?: number;
  contributionRatio?: number;
  isKiller?: boolean;
  expAdjustmentRealmLv?: number;
}

/** RealmExpAdvanceOptions：定义该接口的能力与字段约束。 */
interface RealmExpAdvanceOptions {
  expBonus?: number;
  minimumGain?: number;
  useFoundation?: boolean;
  overflowToFoundation?: boolean;
  trackCombatExp?: boolean;
}

/** SpiritualRootSeedTier：定义该类型的结构与数据语义。 */
type SpiritualRootSeedTier = 'heaven' | 'divine';

/** HEAVEN_GATE_REALM_LEVEL：定义该变量以承载业务值。 */
const HEAVEN_GATE_REALM_LEVEL = 18;
/** HEAVEN_GATE_MAX_SEVERED：定义该变量以承载业务值。 */
const HEAVEN_GATE_MAX_SEVERED = 4;
/** HEAVEN_GATE_ROOTS_SOURCE：定义该变量以承载业务值。 */
const HEAVEN_GATE_ROOTS_SOURCE = 'heaven_gate:roots';
/** HEAVEN_GATE_REROLL_AVERAGE_BONUS：定义该变量以承载业务值。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
/** HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP：定义该变量以承载业务值。 */
const HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP = 174;
/** HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS：定义该变量以承载业务值。 */
const HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS: Record<number, Array<{ min: number; max: number; weight: number }>> = {
  5: [
    { min: 1, max: 15, weight: 35 },
    { min: 16, max: 30, weight: 35 },
    { min: 31, max: 45, weight: 18 },
    { min: 46, max: 60, weight: 8 },
    { min: 61, max: 75, weight: 2.95 },
    { min: 76, max: 99, weight: 1 },
    { min: 100, max: 100, weight: 0.05 },
  ],
  4: [
    { min: 1, max: 15, weight: 32 },
    { min: 16, max: 32, weight: 33 },
    { min: 33, max: 50, weight: 18 },
    { min: 51, max: 66, weight: 8 },
    { min: 67, max: 82, weight: 4.8 },
    { min: 83, max: 99, weight: 4 },
    { min: 100, max: 100, weight: 0.2 },
  ],
  3: [
    { min: 1, max: 12, weight: 17 },
    { min: 13, max: 30, weight: 23 },
    { min: 31, max: 50, weight: 27 },
    { min: 51, max: 68, weight: 18 },
    { min: 69, max: 84, weight: 9.2 },
    { min: 85, max: 99, weight: 5.3 },
    { min: 100, max: 100, weight: 0.5 },
  ],
  2: [
    { min: 1, max: 10, weight: 10 },
    { min: 11, max: 25, weight: 13 },
    { min: 26, max: 45, weight: 21 },
    { min: 46, max: 65, weight: 23 },
    { min: 66, max: 82, weight: 16.5 },
    { min: 83, max: 99, weight: 15.5 },
    { min: 100, max: 100, weight: 1 },
  ],
  1: [
    { min: 1, max: 8, weight: 1 },
    { min: 9, max: 20, weight: 3 },
    { min: 21, max: 40, weight: 10 },
    { min: 41, max: 60, weight: 16 },
    { min: 61, max: 78, weight: 24 },
    { min: 79, max: 92, weight: 23 },
    { min: 93, max: 99, weight: 20 },
    { min: 100, max: 100, weight: 3 },
  ],
};
/** HEAVEN_GATE_DISTRIBUTION_SPREAD：定义该变量以承载业务值。 */
const HEAVEN_GATE_DISTRIBUTION_SPREAD: Record<number, number> = {
  5: 0.18,
  4: 0.28,
  3: 0.4,
  2: 0.58,
  1: 0,
};

/** RealmExpAdvanceResult：定义该接口的能力与字段约束。 */
interface RealmExpAdvanceResult {
/** changed：定义该变量以承载业务值。 */
  changed: boolean;
/** gained：定义该变量以承载业务值。 */
  gained: number;
/** techniqueEligibleGain：定义该变量以承载业务值。 */
  techniqueEligibleGain: number;
/** foundationSpent：定义该变量以承载业务值。 */
  foundationSpent: number;
/** foundationGained：定义该变量以承载业务值。 */
  foundationGained: number;
/** combatExpGained：定义该变量以承载业务值。 */
  combatExpGained: number;
/** dirty：定义该变量以承载业务值。 */
  dirty: TechniqueDirtyFlag[];
/** messages：定义该变量以承载业务值。 */
  messages: TechniqueMessage[];
}

/** FOUNDATION_EXP_MULTIPLIER：定义该变量以承载业务值。 */
const FOUNDATION_EXP_MULTIPLIER = 3;
/** FOUNDATION_EXP_BONUS_MULTIPLIER：定义该变量以承载业务值。 */
const FOUNDATION_EXP_BONUS_MULTIPLIER = FOUNDATION_EXP_MULTIPLIER - 1;
/** SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER：定义该变量以承载业务值。 */
const SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER = 5;
/** SPIRITUAL_ROOT_SEED_REROLL_EQUIVALENTS：定义该变量以承载业务值。 */
const SPIRITUAL_ROOT_SEED_REROLL_EQUIVALENTS: Record<SpiritualRootSeedTier, number> = {
  heaven: 10,
  divine: 100,
};

@Injectable()
/** TechniqueService：封装相关状态与行为。 */
export class TechniqueService {
  private readonly progressionInitialized = new WeakSet<PlayerState>();

  constructor(
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly contentService: ContentService,
    private readonly mapService: MapService,
    private readonly performanceService: PerformanceService,
    private readonly qiProjectionService: QiProjectionService,
  ) {}

  /** 初始化玩家境界与功法进度（加载时、持久化前调用） */
  initializePlayerProgression(player: PlayerState): void {
    this.initializePlayerSpecialStats(player);
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = player.hp;
/** previousMaxHp：定义该变量以承载业务值。 */
    const previousMaxHp = player.maxHp;
/** persisted：定义该变量以承载业务值。 */
    const persisted = this.readPersistedRealmState(player);
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.resolveInitialRealmState(player, persisted);
    this.syncTechniqueMetadata(player);
    this.applyRealmBonus(player, normalized);
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    this.syncRealmPresentation(player, normalized);

    if (previousMaxHp <= 0) {
      this.progressionInitialized.add(player);
      player.hp = player.maxHp;
      return;
    }

    if (player.hp <= 0) {
      player.hp = Math.min(player.maxHp, Math.max(1, previousHp));
    }

    this.progressionInitialized.add(player);
  }

  /**
   * 只读链路只需要确保玩家至少完成过一次初始化。
   * 高频读取不应反复触发元数据同步、加成重算和属性重算。
   */
  private ensurePlayerProgressionInitialized(player: PlayerState): void {
    if (!this.progressionInitialized.has(player)) {
      this.initializePlayerProgression(player);
    }
  }

/** preparePlayerForPersistence：执行对应的业务逻辑。 */
  preparePlayerForPersistence(player: PlayerState): void {
    this.initializePlayerProgression(player);
  }

/** normalizeHeavenGateState：执行对应的业务逻辑。 */
  normalizeHeavenGateState(value: unknown): HeavenGateState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value as Record<string, unknown>;
/** severed：定义该变量以承载业务值。 */
    const severed = Array.isArray(raw.severed)
      ? [...new Set(raw.severed.filter((entry): entry is ElementKey => typeof entry === 'string' && ELEMENT_KEYS.includes(entry as ElementKey)))]
        .slice(0, HEAVEN_GATE_MAX_SEVERED)
      : [];
/** roots：定义该变量以承载业务值。 */
    const roots = this.normalizeHeavenGateRoots(raw.roots);
/** entered：定义该变量以承载业务值。 */
    const entered = raw.entered === true;
/** averageBonus：定义该变量以承载业务值。 */
    const averageBonus = Math.max(0, Math.floor(Number(raw.averageBonus ?? 0) || 0));
/** unlocked：定义该变量以承载业务值。 */
    const unlocked = raw.unlocked === true || entered || roots !== null || severed.length > 0;
    if (!unlocked && severed.length === 0 && roots === null) {
      return null;
    }
    return {
      unlocked,
      severed,
      roots,
      entered,
      averageBonus,
    };
  }

  handleHeavenGateAction(
    player: PlayerState,
    action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter',
    element?: ElementKey,
  ): HeavenGateActionResult {
    this.initializePlayerProgression(player);
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm || !this.hasReachedHeavenGateRealm(realm.realmLv)) {
      return { error: '当前境界不可开天门', dirty: [], messages: [] };
    }

/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.syncHeavenGateState(player, realm);
    if (!heavenGate?.unlocked) {
      return { error: '当前尚未叩开仙门，暂时不能开天门', dirty: [], messages: [] };
    }

    if (action === 'sever' || action === 'restore') {
      if (heavenGate.entered) {
        return { error: '当前已入天门，无法再改动灵根', dirty: [], messages: [] };
      }
      if (!element || !ELEMENT_KEYS.includes(element)) {
        return { error: '灵根目标无效', dirty: [], messages: [] };
      }
/** cost：定义该变量以承载业务值。 */
      const cost = this.getHeavenGateSeverCost(realm);
      if (realm.progress < cost) {
        return { error: '当前境界修为不足', dirty: [], messages: [] };
      }
/** severed：定义该变量以承载业务值。 */
      const severed = new Set<ElementKey>(heavenGate.severed);
      if (action === 'sever') {
        if (severed.has(element)) {
          return { error: `${ELEMENT_KEY_LABELS[element]}灵根已被斩断`, dirty: [], messages: [] };
        }
        if (severed.size >= HEAVEN_GATE_MAX_SEVERED) {
          return { error: '最多只能斩断四条灵根', dirty: [], messages: [] };
        }
        severed.add(element);
      } else if (!severed.has(element)) {
        return { error: `${ELEMENT_KEY_LABELS[element]}灵根尚未斩断`, dirty: [], messages: [] };
      } else {
        severed.delete(element);
      }
      player.heavenGate = {
        unlocked: true,
        severed: [...severed],
        roots: null,
        entered: false,
        averageBonus: heavenGate.averageBonus,
      };
      this.applyResolvedRealmState(player, this.normalizeRealmState(realm.realmLv, Math.max(0, realm.progress - cost)));
      return {
        dirty: ['attr', 'actions'],
        messages: [{
/** text：定义该变量以承载业务值。 */
          text: `${action === 'sever' ? '斩断' : '补回'}${ELEMENT_KEY_LABELS[element]}灵根，消耗 ${cost} 点境界修为。`,
          kind: 'quest',
        }],
      };
    }

    if (action === 'open') {
      if (heavenGate.entered) {
        return { error: '当前已入天门，无法再重开天门', dirty: [], messages: [] };
      }
/** roots：定义该变量以承载业务值。 */
      const roots = this.rollHeavenGateRoots(heavenGate.severed, heavenGate.averageBonus);
      player.heavenGate = {
        unlocked: true,
        severed: [...heavenGate.severed],
        roots,
        entered: false,
        averageBonus: heavenGate.averageBonus,
      };
      this.syncRealmPresentation(player, this.normalizeRealmState(realm.realmLv, realm.progress));
/** total：定义该变量以承载业务值。 */
      const total = ELEMENT_KEYS.reduce((sum, key) => sum + roots[key], 0);
      return {
        dirty: ['attr'],
        messages: [{
          text: `天门已开，本次灵根总值为 ${total}。`,
          kind: 'quest',
        }],
      };
    }

    if (action === 'reroll') {
      if (heavenGate.entered) {
        return { error: '当前已入天门，无法再逆天改命', dirty: [], messages: [] };
      }
      if (!heavenGate.roots) {
        return { error: '当前尚未开天门，无法逆天改命', dirty: [], messages: [] };
      }
/** cost：定义该变量以承载业务值。 */
      const cost = this.getHeavenGateRerollCost(realm);
      if (realm.progress < cost) {
        return { error: '当前境界修为不足，无法逆天改命', dirty: [], messages: [] };
      }
      player.heavenGate = {
        unlocked: true,
        severed: [...heavenGate.severed],
        roots: null,
        entered: false,
        averageBonus: heavenGate.averageBonus + HEAVEN_GATE_REROLL_AVERAGE_BONUS,
      };
      this.applyResolvedRealmState(player, this.normalizeRealmState(realm.realmLv, Math.max(0, realm.progress - cost)));
      return {
        dirty: ['attr', 'actions'],
        messages: [{
          text: `逆天改命消耗 ${cost} 点境界修为，后续开天门平均品质加成提升至 +${heavenGate.averageBonus + HEAVEN_GATE_REROLL_AVERAGE_BONUS}。`,
          kind: 'quest',
        }],
      };
    }

    if (!heavenGate.roots) {
      return { error: '尚未开天门，无法入天门', dirty: [], messages: [] };
    }
    if (heavenGate.entered) {
      return { error: '当前已入天门，无需重复确认', dirty: [], messages: [] };
    }
/** resolvedRoots：定义该变量以承载业务值。 */
    const resolvedRoots = this.cloneHeavenGateRoots(heavenGate.roots);
    player.spiritualRoots = resolvedRoots;
    player.heavenGate = {
      unlocked: true,
      severed: [...heavenGate.severed],
      roots: resolvedRoots,
      entered: true,
      averageBonus: heavenGate.averageBonus,
    };
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    this.syncRealmPresentation(player, this.normalizeRealmState(realm.realmLv, realm.progress));
    return {
      dirty: ['attr', 'actions', 'tech'],
      messages: [{
        text: '你已入天门，灵根结果已定。后续仍需按原本条件突破至练气。',
        kind: 'quest',
      }],
    };
  }

/** setRealmLevel：执行对应的业务逻辑。 */
  setRealmLevel(player: PlayerState, realmLv: number): void {
    this.setRealmState(player, realmLv, 0);
  }

/** setRealmProgress：执行对应的业务逻辑。 */
  setRealmProgress(player: PlayerState, progress: number): void {
    this.initializePlayerProgression(player);
/** currentRealmLv：定义该变量以承载业务值。 */
    const currentRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    this.applyResolvedRealmState(player, this.normalizeRealmState(currentRealmLv, progress));
  }

/** setRealmState：执行对应的业务逻辑。 */
  setRealmState(player: PlayerState, realmLv: number, progress = 0): void {
    this.initializePlayerProgression(player);
    this.applyResolvedRealmState(player, this.normalizeRealmState(realmLv, progress));
  }

/** resetHeavenGateForTesting：执行对应的业务逻辑。 */
  resetHeavenGateForTesting(player: PlayerState): void {
    this.initializePlayerProgression(player);
/** currentRealmLv：定义该变量以承载业务值。 */
    const currentRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
/** currentProgress：定义该变量以承载业务值。 */
    const currentProgress = Math.max(0, Math.floor(player.realm?.progress ?? 0));
/** currentRealm：定义该变量以承载业务值。 */
    const currentRealm = this.normalizeRealmState(currentRealmLv, currentProgress);
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.normalizeHeavenGateState(player.heavenGate);
    this.applyHeavenGateResetState(player, currentRealm, heavenGate?.averageBonus ?? 0, heavenGate?.unlocked === true);
  }

/** canUseShatterSpiritPill：执行对应的业务逻辑。 */
  canUseShatterSpiritPill(player: PlayerState): string | null {
    this.initializePlayerProgression(player);
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm || !this.hasReachedHeavenGateRealm(realm.realmLv)) {
      return '当前至少需要叩仙门境界，才能使用碎灵丹';
    }
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.syncHeavenGateState(player, realm);
    if (!heavenGate?.unlocked) {
      return '当前尚未叩开仙门，暂时不能使用碎灵丹';
    }
    return null;
  }

/** useShatterSpiritPill：执行对应的业务逻辑。 */
  useShatterSpiritPill(player: PlayerState): HeavenGateActionResult {
/** error：定义该变量以承载业务值。 */
    const error = this.canUseShatterSpiritPill(player);
    if (error) {
      return { error, dirty: [], messages: [] };
    }
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm) {
      return { error: '当前境界异常，无法使用碎灵丹', dirty: [], messages: [] };
    }
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.syncHeavenGateState(player, realm);
    if (!heavenGate) {
      return { error: '当前尚未叩开仙门，暂时不能使用碎灵丹', dirty: [], messages: [] };
    }
/** cost：定义该变量以承载业务值。 */
    const cost = this.getShatterSpiritPillCost(realm);
/** previousRerollCount：定义该变量以承载业务值。 */
    const previousRerollCount = this.getHeavenGateRerollCount(heavenGate.averageBonus);
/** nextRerollCount：定义该变量以承载业务值。 */
    const nextRerollCount = previousRerollCount + 1;
/** nextRealm：定义该变量以承载业务值。 */
    const nextRealm = this.normalizeRealmState(realm.realmLv, Math.max(0, realm.progress - cost));
    this.applyHeavenGateResetState(
      player,
      nextRealm,
      this.getHeavenGateAverageBonusFromRerollCount(nextRerollCount),
    );
    return {
      dirty: ['attr', 'actions', 'tech'],
      messages: [{
        text: `碎灵丹化开命宫旧痕，消耗 ${cost} 点境界修为，天门已重置，逆天改命累计额外增加 1 次（现为 ${nextRerollCount} 次）。`,
        kind: 'quest',
      }],
    };
  }

/** useWangshengPill：执行对应的业务逻辑。 */
  useWangshengPill(player: PlayerState): HeavenGateActionResult {
/** nextRealm：定义该变量以承载业务值。 */
    const nextRealm = this.normalizeRealmState(1, 0);
    this.applyResolvedRealmState(player, nextRealm);
    player.foundation = 0;
    player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
    player.qi = Math.min(Math.round(player.numericStats?.maxQi ?? player.qi), Math.max(0, player.qi));
    player.dead = false;
    return {
      dirty: ['attr', 'actions', 'tech'],
      messages: [{
        text: '往生丹药力尽化前尘，境界已重归凡胎，境界修为与底蕴尽数归零。',
        kind: 'quest',
      }],
    };
  }

/** canUseSpiritualRootSeed：执行对应的业务逻辑。 */
  canUseSpiritualRootSeed(player: PlayerState, tier: SpiritualRootSeedTier): string | null {
    this.initializePlayerProgression(player);
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm || !this.hasReachedHeavenGateRealm(realm.realmLv)) {
      return '当前至少需要叩仙门境界，才能使用灵根幼苗';
    }
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.syncHeavenGateState(player, realm);
    if (!heavenGate?.unlocked) {
      return '当前尚未叩开仙门，暂时不能使用灵根幼苗';
    }
    if (heavenGate.entered) {
      return '当前已入天门，无法再使用灵根幼苗';
    }
/** cost：定义该变量以承载业务值。 */
    const cost = this.getSpiritualRootSeedFoundationCost(realm, heavenGate.averageBonus, tier);
    if (this.getPlayerFoundation(player) < cost) {
      return '当前底蕴不足，无法催化这株灵根幼苗';
    }
    return null;
  }

/** useSpiritualRootSeed：执行对应的业务逻辑。 */
  useSpiritualRootSeed(player: PlayerState, tier: SpiritualRootSeedTier): HeavenGateActionResult {
/** error：定义该变量以承载业务值。 */
    const error = this.canUseSpiritualRootSeed(player, tier);
    if (error) {
      return { error, dirty: [], messages: [] };
    }
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm) {
      return { error: '当前境界异常，无法使用灵根幼苗', dirty: [], messages: [] };
    }
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.syncHeavenGateState(player, realm);
    if (!heavenGate) {
      return { error: '当前尚未叩开仙门，暂时不能使用灵根幼苗', dirty: [], messages: [] };
    }
/** gainedRerollCount：定义该变量以承载业务值。 */
    const gainedRerollCount = this.getSpiritualRootSeedRerollEquivalent(tier);
/** previousRerollCount：定义该变量以承载业务值。 */
    const previousRerollCount = this.getHeavenGateRerollCount(heavenGate.averageBonus);
/** nextRerollCount：定义该变量以承载业务值。 */
    const nextRerollCount = previousRerollCount + gainedRerollCount;
/** cost：定义该变量以承载业务值。 */
    const cost = this.getSpiritualRootSeedFoundationCost(realm, heavenGate.averageBonus, tier);
    this.consumeFoundation(player, cost);
/** roots：定义该变量以承载业务值。 */
    const roots = tier === 'divine'
      ? this.createDivineSpiritualRootSeedRoots()
      : this.createHeavenSpiritualRootSeedRoots();
    player.heavenGate = {
      unlocked: true,
      severed: [],
      roots,
      entered: false,
      averageBonus: this.getHeavenGateAverageBonusFromRerollCount(nextRerollCount),
    };
    this.syncRealmPresentation(player, this.normalizeRealmState(realm.realmLv, realm.progress));
    return {
      dirty: ['attr'],
      messages: [{
/** text：定义该变量以承载业务值。 */
        text: `${tier === 'divine' ? '神品' : '天品'}灵根幼苗扎入命宫，消耗 ${cost} 点底蕴，当前灵根已被重塑，逆天改命累计提升 ${gainedRerollCount} 次（现为 ${nextRerollCount} 次）。`,
        kind: 'quest',
      }],
    };
  }

  /** 学习新功法 */
  learnTechnique(
    player: PlayerState,
    techId: string,
    name: string,
    skills: SkillDef[],
    grade?: TechniqueGrade,
    category?: TechniqueState['category'],
    realmLv = 1,
    layers?: TechniqueLayerDef[],
  ): string | null {
    this.initializePlayerProgression(player);
    if (player.techniques.find((entry) => entry.techId === techId)) {
      return '已学会该功法';
    }

/** technique：定义该变量以承载业务值。 */
    const technique: TechniqueState = {
      techId,
      name,
      level: 1,
      exp: 0,
      expToNext: getTechniqueExpToNext(1, layers),
      realmLv,
      realm: deriveTechniqueRealm(1, layers),
      skills,
      skillsEnabled: true,
      grade,
      category,
      layers,
    };
    player.techniques.push(technique);
    if (!player.cultivatingTechId && player.techniques.length === 1) {
      player.cultivatingTechId = techId;
    }
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    return null;
  }

  /** 每 tick 修炼推进：增加境界经验和功法经验 */
  cultivateTick(player: PlayerState): CultivationResult {
    if (!this.progressionInitialized.has(player)) {
      this.measureCpuSection('cultivation_init', '修炼: 初始化校正', () => {
        this.initializePlayerProgression(player);
      });
    }
/** cultivationBuff：定义该变量以承载业务值。 */
    const cultivationBuff = this.measureCpuSection('cultivation_resolve', '修炼: 主修解析', () => (
      this.getCultivationBuff(player)
    ));
    if (!cultivationBuff) return EMPTY_CULTIVATION_RESULT;
/** cultivationTarget：定义该变量以承载业务值。 */
    const cultivationTarget = this.measureCpuSection('cultivation_resolve', '修炼: 主修解析', () => (
      this.resolveActiveCultivatingTechnique(player)
    ));
    if (!cultivationTarget.technique && player.cultivatingTechId) {
      return this.clearInvalidCultivation(player);
    }
    this.refreshCultivationBuff(cultivationBuff, cultivationTarget.technique?.name, player.realm?.realmLv ?? player.realmLv ?? 1);

/** numericStats：定义该变量以承载业务值。 */
    const numericStats = this.measureCpuSection('cultivation_stats', '修炼: 数值采集', () => (
      this.attrService.getPlayerNumericStats(player)
    ));
/** auraMultiplier：定义该变量以承载业务值。 */
    const auraMultiplier = this.measureCpuSection('cultivation_stats', '修炼: 数值采集', () => (
      this.getCultivationAuraMultiplier(player)
    ));
/** realmExpBonus：定义该变量以承载业务值。 */
    const realmExpBonus = numericStats.playerExpRate / 10000;
/** techniqueExpBonus：定义该变量以承载业务值。 */
    const techniqueExpBonus = numericStats.techniqueExpRate / 10000;
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>(cultivationTarget.dirty);
/** messages：定义该变量以承载业务值。 */
    const messages: TechniqueMessage[] = [...cultivationTarget.messages];

/** realmResult：定义该变量以承载业务值。 */
    const realmResult = this.measureCpuSection('cultivation_realm', '修炼: 境界推进', () => (
      this.advanceRealmProgress(player, Math.max(0, Math.round(numericStats.realmExpPerTick * auraMultiplier)), {
        expBonus: realmExpBonus,
        useFoundation: true,
        overflowToFoundation: true,
      })
    ));
    if (realmResult.changed) {
      for (const flag of realmResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...realmResult.messages);
    }

/** techniqueResult：定义该变量以承载业务值。 */
    const techniqueResult = this.measureCpuSection('cultivation_technique', '修炼: 功法推进', () => (
      this.advanceTechniqueProgress(
        player,
        this.getCultivationTechniqueExp(numericStats.techniqueExpPerTick, auraMultiplier),
        techniqueExpBonus,
      )
    ));
    if (techniqueResult.changed) {
      for (const flag of techniqueResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...techniqueResult.messages);
    }

    return {
      changed: dirty.size > 0,
      dirty: [...dirty],
      messages,
    };
  }

  private measureCpuSection<T>(key: string, label: string, work: () => T): T {
/** startedAt：定义该变量以承载业务值。 */
    const startedAt = process.hrtime.bigint();
    try {
      return work();
    } finally {
      this.performanceService.recordCpuSection(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        key,
        label,
      );
    }
  }

/** hasCultivationBuff：执行对应的业务逻辑。 */
  hasCultivationBuff(player: PlayerState): boolean {
    return Boolean(this.getCultivationBuff(player));
  }

  /** 开始修炼（添加修炼 Buff） */
  startCultivation(player: PlayerState): CultivationResult {
    this.initializePlayerProgression(player);
/** technique：定义该变量以承载业务值。 */
    const technique = this.resolveCultivatingTechnique(player);
    if (!technique && player.cultivatingTechId) {
      return this.clearInvalidCultivation(player);
    }

/** techniqueName：定义该变量以承载业务值。 */
    const techniqueName = technique?.name;
/** sourceRealmLv：定义该变量以承载业务值。 */
    const sourceRealmLv = player.realm?.realmLv ?? player.realmLv ?? 1;
    player.temporaryBuffs ??= [];
/** current：定义该变量以承载业务值。 */
    const current = this.getCultivationBuff(player);
    if (current) {
      this.refreshCultivationBuff(current, techniqueName, sourceRealmLv);
    } else {
      player.temporaryBuffs.push(this.buildCultivationBuffState(techniqueName, sourceRealmLv));
      this.attrService.recalcPlayer(player);
    }

    return {
      changed: true,
      dirty: ['attr', 'actions'],
      messages: [{
        text: this.buildCultivationStartMessage(techniqueName, player.techniques.length > 0),
        kind: 'quest',
      }],
    };
  }

  /** 停止修炼（移除修炼 Buff） */
  stopCultivation(player: PlayerState, reason = '你收束气机，停止了修炼。', kind: TechniqueMessageKind = 'quest'): CultivationResult {
/** removed：定义该变量以承载业务值。 */
    const removed = this.removeCultivationBuff(player);
    if (!removed) {
      return EMPTY_CULTIVATION_RESULT;
    }
    return {
      changed: true,
      dirty: ['attr', 'actions'],
      messages: [{ text: reason, kind }],
    };
  }

  /** 因移动/攻击/受击打断修炼 */
  interruptCultivation(player: PlayerState, reason: 'move' | 'attack' | 'hit'): CultivationResult {
    switch (reason) {
      case 'move':
        return this.stopCultivation(player, '你一动身，周身运转的气机便散了，修炼被打断。', 'system');
      case 'attack':
        return this.stopCultivation(player, '你一出手，运转中的修炼气机顿时散去。', 'combat');
      case 'hit':
        return this.stopCultivation(player, '你受到攻击，修炼气机被强行打断。', 'combat');
      default:
        return EMPTY_CULTIVATION_RESULT;
    }
  }

  /** 击杀怪物后发放境界和功法经验 */
  grantCombatExpFromMonsterKill(player: PlayerState, input: MonsterKillExpInput = {}): CultivationResult {
    this.initializePlayerProgression(player);
/** numericStats：定义该变量以承载业务值。 */
    const numericStats = this.attrService.getPlayerNumericStats(player);
/** techniqueExpBonus：定义该变量以承载业务值。 */
    const techniqueExpBonus = numericStats.techniqueExpRate / 10000;
/** realmExpBonus：定义该变量以承载业务值。 */
    const realmExpBonus = numericStats.playerExpRate / 10000;
/** normalizedMonsterLevel：定义该变量以承载业务值。 */
    const normalizedMonsterLevel = Math.max(1, Math.floor(input.monsterLevel ?? 1));
/** contributionRatio：定义该变量以承载业务值。 */
    const contributionRatio = Math.min(1, Math.max(0, Number.isFinite(input.contributionRatio) ? Number(input.contributionRatio) : 1));
/** expAdjustmentRealmLv：定义该变量以承载业务值。 */
    const expAdjustmentRealmLv = Math.max(
      1,
      Math.floor(input.expAdjustmentRealmLv ?? this.getPlayerRealmLv(player)),
    );
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>();
/** messages：定义该变量以承载业务值。 */
    const messages: TechniqueMessage[] = [];
/** realmBaseExp：定义该变量以承载业务值。 */
    const realmBaseExp = this.getRealmCombatExp(
      normalizedMonsterLevel,
      expAdjustmentRealmLv,
      input.monsterTier,
      input.expMultiplier,
      contributionRatio,
    );

/** realmResult：定义该变量以承载业务值。 */
    const realmResult = this.advanceRealmProgress(player, realmBaseExp, {
      expBonus: realmExpBonus,
      minimumGain: 0,
      useFoundation: true,
      overflowToFoundation: true,
      trackCombatExp: true,
    });
    if (realmResult.changed) {
      for (const flag of realmResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...realmResult.messages);
    }

/** techniqueResult：定义该变量以承载业务值。 */
    const techniqueResult = this.advanceTechniqueCombatExp(
      player,
      this.getTechniqueCombatExp(
        normalizedMonsterLevel,
        expAdjustmentRealmLv,
        input.monsterTier,
        input.expMultiplier,
        contributionRatio,
      ),
      techniqueExpBonus,
      0,
    );
    if (techniqueResult.changed) {
      for (const flag of techniqueResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...techniqueResult.messages);
    }

    if (realmResult.gained > 0 || techniqueResult.gained > 0 || realmResult.combatExpGained > 0 || realmResult.foundationGained > 0) {
/** segments：定义该变量以承载业务值。 */
      const segments: string[] = [];
      if (realmResult.gained > 0) {
        segments.push(`获得 ${realmResult.gained} 点境界修为`);
      }
      if (realmResult.foundationSpent > 0) {
        segments.push(`底蕴额外转化 ${realmResult.foundationSpent} 点境界修为`);
      }
      if (techniqueResult.gained > 0 && techniqueResult.targetLabel) {
        segments.push(`${techniqueResult.targetLabel} 获得 ${techniqueResult.gained} 点${techniqueResult.expLabel}`);
      }
      if (realmResult.combatExpGained > 0) {
        segments.push(`战斗经验增加 ${realmResult.combatExpGained}`);
      }
      if (realmResult.foundationGained > 0) {
        segments.push(`底蕴增加 ${realmResult.foundationGained}`);
      }
      messages.unshift({
/** text：定义该变量以承载业务值。 */
        text: `${input.monsterName ? `${input.isKiller === false ? '参与击杀' : '斩杀'} ${input.monsterName}` : '击败敌人'}，${segments.join('，')}。`,
        kind: 'quest',
      });
    }

    return {
      changed: dirty.size > 0,
      dirty: [...dirty],
      messages,
    };
  }

  /** 收集玩家已解锁的技能行动列表 */
  getSkillActions(player: PlayerState): ActionDef[] {
    this.ensurePlayerProgressionInitialized(player);
/** playerRealmStage：定义该变量以承载业务值。 */
    const playerRealmStage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
/** actions：定义该变量以承载业务值。 */
    const actions: ActionDef[] = [];

    for (const technique of player.techniques) {
      if (technique.skillsEnabled === false) {
        continue;
      }
      for (const skill of technique.skills) {
        const unlockPlayerRealm = skill.unlockPlayerRealm ?? DEFAULT_PLAYER_REALM_STAGE;
        if (technique.level < resolveSkillUnlockLevel(skill) || playerRealmStage < unlockPlayerRealm) {
          continue;
        }
        actions.push({
          id: skill.id,
          name: skill.name,
          type: 'skill',
          desc: skill.desc,
          cooldownLeft: 0,
          range: skill.range,
          requiresTarget: skill.requiresTarget ?? true,
          targetMode: skill.targetMode ?? 'any',
        });
      }
    }

    return actions;
  }

/** setTechniqueSkillsEnabled：执行对应的业务逻辑。 */
  setTechniqueSkillsEnabled(player: PlayerState, techId: string, enabled: boolean): boolean {
    this.initializePlayerProgression(player);
/** technique：定义该变量以承载业务值。 */
    const technique = player.techniques.find((entry) => entry.techId === techId);
    if (!technique) {
      return false;
    }
/** normalizedEnabled：定义该变量以承载业务值。 */
    const normalizedEnabled = enabled !== false;
    if ((technique.skillsEnabled !== false) === normalizedEnabled) {
      return false;
    }
    technique.skillsEnabled = normalizedEnabled;
    return true;
  }

  /** 获取突破行动（境界圆满时可用） */
  getBreakthroughAction(player: PlayerState): ActionDef | null {
    this.ensurePlayerProgressionInitialized(player);
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm) return null;
    if (this.requiresHeavenGateCompletion(player, realm)) {
      return {
        id: 'realm:breakthrough',
        name: '开天门',
        type: 'breakthrough',
        desc: '当前仍有未完成的开天门前置，需先入天门后才能继续后续突破。',
        cooldownLeft: 0,
      };
    }
    if (!realm.breakthroughReady || !realm.breakthrough) return null;
    return {
      id: 'realm:breakthrough',
      name: `突破至 ${realm.breakthrough.targetDisplayName}`,
      type: 'breakthrough',
      desc: realm.breakthrough.blockedReason ?? `当前境界已圆满，点击查看 ${realm.breakthrough.targetDisplayName} 的突破要求。`,
      cooldownLeft: 0,
    };
  }

  /** 尝试突破到下一境界 */
  attemptBreakthrough(player: PlayerState): BreakthroughResult {
    this.initializePlayerProgression(player);
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm) {
      return { error: '当前境界状态异常', dirty: [], messages: [] };
    }
    if (this.requiresHeavenGateCompletion(player, realm)) {
      return {
        error: player.heavenGate?.roots ? '请在开天门界面确认入天门' : '当前仍需先完成开天门并入天门',
        dirty: [],
        messages: [],
      };
    }
    if (!realm.breakthroughReady || !realm.breakthrough) {
      return { error: '你的境界火候未到，尚不能突破', dirty: [], messages: [] };
    }
    return this.completeBreakthrough(player, realm);
  }

/** infuseBodyTrainingWithFoundation：执行对应的业务逻辑。 */
  infuseBodyTrainingWithFoundation(player: PlayerState, requestedFoundation: number): BreakthroughResult {
    this.initializePlayerProgression(player);
/** normalizedRequested：定义该变量以承载业务值。 */
    const normalizedRequested = this.normalizeCounter(requestedFoundation);
    if (normalizedRequested <= 0) {
      return { error: '灌注量无效', dirty: [], messages: [] };
    }
/** consumed：定义该变量以承载业务值。 */
    const consumed = this.consumeFoundation(player, normalizedRequested);
    if (consumed <= 0) {
      return { error: '当前底蕴不足，无法灌注', dirty: [], messages: [] };
    }

/** result：定义该变量以承载业务值。 */
    const result = this.advanceBodyTrainingProgress(
      player,
      consumed * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER,
      { dirty: ['attr'], messages: [] },
    );
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>(result.dirty);
    dirty.add('attr');
    return {
      dirty: [...dirty],
      messages: [{
        text: `你将 ${consumed} 点底蕴灌入肉身，转化为 ${consumed * BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER} 点炼体经验。`,
        kind: 'quest',
      }, ...result.messages],
    };
  }

/** grantCraftRealmExp：执行对应的业务逻辑。 */
  grantCraftRealmExp(player: PlayerState, baseGain: number): CultivationResult {
    this.initializePlayerProgression(player);
/** normalizedBaseGain：定义该变量以承载业务值。 */
    const normalizedBaseGain = Math.max(0, Math.round(Number(baseGain) || 0));
    if (normalizedBaseGain <= 0) {
      return EMPTY_CULTIVATION_RESULT;
    }
/** realmResult：定义该变量以承载业务值。 */
    const realmResult = this.advanceRealmProgress(player, normalizedBaseGain, {
      minimumGain: 0,
      useFoundation: false,
      overflowToFoundation: true,
    });
    return {
      changed: realmResult.changed,
      dirty: realmResult.dirty,
      messages: realmResult.messages,
    };
  }

/** advanceRealmProgress：执行对应的业务逻辑。 */
  private advanceRealmProgress(player: PlayerState, baseGain: number, options: RealmExpAdvanceOptions = {}): RealmExpAdvanceResult {
/** realm：定义该变量以承载业务值。 */
    const realm = player.realm;
    if (!realm || baseGain <= 0) {
      return {
        changed: false,
        gained: 0,
        techniqueEligibleGain: 0,
        foundationSpent: 0,
        foundationGained: 0,
        combatExpGained: 0,
        dirty: [],
        messages: [],
      };
    }

/** uncappedGain：定义该变量以承载业务值。 */
    const uncappedGain = this.applyRateBonus(baseGain, options.expBonus ?? 0, options.minimumGain ?? 1);
/** gain：定义该变量以承载业务值。 */
    const gain = options.trackCombatExp
      ? this.capSingleCombatRealmExpGain(realm, uncappedGain)
      : uncappedGain;
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>();
/** messages：定义该变量以承载业务值。 */
    const messages: TechniqueMessage[] = [];
/** combatExpGained：定义该变量以承载业务值。 */
    const combatExpGained = options.trackCombatExp ? this.addCombatExp(player, gain) : 0;
    if (combatExpGained > 0) {
      dirty.add('attr');
    }

/** room：定义该变量以承载业务值。 */
    const room = realm.progressToNext > 0 && !realm.breakthroughReady
      ? Math.max(0, realm.progressToNext - realm.progress)
      : 0;
    if (room <= 0) {
/** foundationGained：定义该变量以承载业务值。 */
      const foundationGained = options.overflowToFoundation ? this.addOverflowFoundation(player, realm, gain) : 0;
      if (foundationGained > 0) {
        dirty.add('attr');
      }
      return {
        changed: dirty.size > 0,
        gained: 0,
        techniqueEligibleGain: gain,
        foundationSpent: 0,
        foundationGained,
        combatExpGained,
        dirty: [...dirty],
        messages,
      };
    }

/** acceptedBaseGain：定义该变量以承载业务值。 */
    const acceptedBaseGain = Math.min(gain, room);
/** foundationSpent：定义该变量以承载业务值。 */
    const foundationSpent = options.useFoundation
      ? this.consumeFoundation(player, Math.min(
        this.getPlayerFoundation(player),
        gain * FOUNDATION_EXP_BONUS_MULTIPLIER,
        Math.max(0, room - acceptedBaseGain),
      ))
      : 0;
    if (foundationSpent > 0) {
      dirty.add('attr');
    }

/** previousProgress：定义该变量以承载业务值。 */
    const previousProgress = realm.progress;
/** nextState：定义该变量以承载业务值。 */
    const nextState = this.normalizeRealmState(realm.realmLv, realm.progress + acceptedBaseGain + foundationSpent);
/** actualGain：定义该变量以承载业务值。 */
    const actualGain = Math.max(0, nextState.progress - previousProgress);
/** foundationOverflow：定义该变量以承载业务值。 */
    const foundationOverflow = Math.max(0, gain - acceptedBaseGain);
/** foundationGained：定义该变量以承载业务值。 */
    const foundationGained = options.overflowToFoundation ? this.addOverflowFoundation(player, nextState, foundationOverflow) : 0;
    if (foundationGained > 0) {
      dirty.add('attr');
    }

    if (actualGain <= 0 && nextState.breakthroughReady === realm.breakthroughReady) {
      return {
        changed: dirty.size > 0,
        gained: 0,
        techniqueEligibleGain: gain,
        foundationSpent,
        foundationGained,
        combatExpGained,
        dirty: [...dirty],
        messages,
      };
    }

    this.syncRealmPresentation(player, nextState);
    dirty.add('attr');
    dirty.add('actions');
    if (nextState.breakthroughReady && !realm.breakthroughReady && nextState.breakthrough) {
      messages.push({
        text: `你的${nextState.displayName}已圆满，可尝试突破至 ${nextState.breakthrough.targetDisplayName}。`,
        kind: 'quest',
      });
    }

    return {
      changed: true,
      gained: actualGain,
      techniqueEligibleGain: gain,
      foundationSpent,
      foundationGained,
      combatExpGained,
      dirty: [...dirty],
      messages,
    };
  }

/** applyRateBonus：执行对应的业务逻辑。 */
  private applyRateBonus(base: number, bonusRate: number, minimumGain = 1): number {
/** exactGain：定义该变量以承载业务值。 */
    const exactGain = Math.max(minimumGain, base * percentModifierToMultiplier(bonusRate * 100));
/** guaranteed：定义该变量以承载业务值。 */
    const guaranteed = Math.floor(exactGain);
/** remainder：定义该变量以承载业务值。 */
    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
      return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
  }

/** capSingleCombatRealmExpGain：执行对应的业务逻辑。 */
  private capSingleCombatRealmExpGain(realm: Pick<PlayerRealmState, 'progressToNext'>, gain: number): number {
/** normalizedGain：定义该变量以承载业务值。 */
    const normalizedGain = this.normalizeCounter(gain);
/** progressToNext：定义该变量以承载业务值。 */
    const progressToNext = Math.max(0, Math.floor(realm.progressToNext ?? 0));
    if (normalizedGain <= 0 || progressToNext <= 0) {
      return normalizedGain;
    }
    return Math.min(normalizedGain, progressToNext * SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER);
  }

/** advanceTechniqueCombatExp：执行对应的业务逻辑。 */
  private advanceTechniqueCombatExp(player: PlayerState, baseGain: number, expBonus = 0, minimumGain = 1): TechniqueExpAdvanceResult {
    return this.advanceTechniqueProgress(player, baseGain, expBonus, minimumGain);
  }

/** advanceTechniqueProgress：执行对应的业务逻辑。 */
  private advanceTechniqueProgress(player: PlayerState, baseGain: number, expBonus = 0, minimumGain = 1): TechniqueExpAdvanceResult {
    if (!player.cultivatingTechId) {
      if (player.techniques.length > 0) {
/** gain：定义该变量以承载业务值。 */
        const gain = this.applyRateBonus(baseGain, expBonus, minimumGain);
        return this.advanceBodyTrainingProgress(player, gain, { dirty: [], messages: [] });
      }
      return { changed: false, gained: 0, expLabel: '功法经验', dirty: [], messages: [] };
    }

/** resolvedTarget：定义该变量以承载业务值。 */
    const resolvedTarget = this.resolveActiveCultivatingTechnique(player);
/** technique：定义该变量以承载业务值。 */
    const technique = resolvedTarget.technique;
    if (!technique) {
/** cleared：定义该变量以承载业务值。 */
      const cleared = this.clearInvalidCultivation(player);
      return {
        changed: cleared.changed,
        gained: 0,
        expLabel: '功法经验',
        dirty: cleared.dirty,
        messages: cleared.messages,
      };
    }

    if (baseGain <= 0) {
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        targetLabel: technique.name,
        expLabel: '功法经验',
        dirty: resolvedTarget.dirty,
        messages: resolvedTarget.messages,
      };
    }

/** maxLevel：定义该变量以承载业务值。 */
    const maxLevel = getTechniqueMaxLevel(technique.layers);
    if (technique.level >= maxLevel || technique.expToNext <= 0) {
      if (this.areAllTechniquesMaxed(player)) {
/** gain：定义该变量以承载业务值。 */
        const gain = this.applyRateBonus(baseGain, expBonus, minimumGain);
        return this.advanceBodyTrainingProgress(player, gain, resolvedTarget);
      }
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        targetLabel: technique.name,
        expLabel: '功法经验',
        dirty: resolvedTarget.dirty,
        messages: resolvedTarget.messages,
      };
    }

/** techniqueLevelAdjustment：定义该变量以承载业务值。 */
    const techniqueLevelAdjustment = getTechniqueExpLevelAdjustment(this.getPlayerRealmLv(player), technique.realmLv);
/** gain：定义该变量以承载业务值。 */
    const gain = this.applyRateBonus(baseGain * techniqueLevelAdjustment, expBonus, minimumGain);
/** previousLevel：定义该变量以承载业务值。 */
    const previousLevel = technique.level;
/** previousExp：定义该变量以承载业务值。 */
    const previousExp = technique.exp;
/** messages：定义该变量以承载业务值。 */
    const messages: TechniqueMessage[] = [...resolvedTarget.messages];
    technique.exp += gain;

    while (technique.expToNext > 0 && technique.exp >= technique.expToNext && technique.level < maxLevel) {
      technique.exp -= technique.expToNext;
      technique.level += 1;
      technique.expToNext = getTechniqueExpToNext(technique.level, technique.layers);
      technique.realm = deriveTechniqueRealm(technique.level, technique.layers);
      messages.push({
        text: technique.expToNext > 0
          ? `${technique.name} 提升至第 ${technique.level} 层。`
          : `${technique.name} 修至圆满，共第 ${technique.level} 层。`,
        kind: 'quest',
      });
    }

    if (technique.level === previousLevel && technique.exp === previousExp) {
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        targetLabel: technique.name,
        expLabel: '功法经验',
        dirty: resolvedTarget.dirty,
        messages,
      };
    }

/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>(['tech', ...resolvedTarget.dirty]);
    if (technique.level !== previousLevel) {
      this.applyTechniqueBonuses(player);
      this.attrService.recalcPlayer(player);
      dirty.add('attr');
      dirty.add('actions');
    }

/** switchedAfterCompletion：定义该变量以承载业务值。 */
    const switchedAfterCompletion = this.resolveActiveCultivatingTechnique(player);
    if (switchedAfterCompletion.technique && switchedAfterCompletion.technique.techId !== technique.techId) {
      for (const flag of switchedAfterCompletion.dirty) {
        dirty.add(flag);
      }
      messages.push(...switchedAfterCompletion.messages);
    }

    return {
      changed: true,
      gained: gain,
      targetLabel: technique.name,
      expLabel: '功法经验',
      dirty: [...dirty],
      messages,
    };
  }

  private advanceBodyTrainingProgress(
    player: PlayerState,
    gain: number,
/** resolvedTarget：定义该变量以承载业务值。 */
    resolvedTarget: { dirty: TechniqueDirtyFlag[]; messages: TechniqueMessage[] },
  ): TechniqueExpAdvanceResult {
    if (gain <= 0) {
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        targetLabel: '炼体',
        expLabel: '炼体经验',
        dirty: resolvedTarget.dirty,
        messages: resolvedTarget.messages,
      };
    }

/** bodyTraining：定义该变量以承载业务值。 */
    const bodyTraining = normalizeBodyTrainingState(player.bodyTraining);
/** previousLevel：定义该变量以承载业务值。 */
    const previousLevel = bodyTraining.level;
/** previousExp：定义该变量以承载业务值。 */
    const previousExp = bodyTraining.exp;
/** messages：定义该变量以承载业务值。 */
    const messages: TechniqueMessage[] = [...resolvedTarget.messages];
    bodyTraining.exp += gain;

    while (bodyTraining.exp >= bodyTraining.expToNext) {
      bodyTraining.exp -= bodyTraining.expToNext;
      bodyTraining.level += 1;
      bodyTraining.expToNext = getBodyTrainingExpToNext(bodyTraining.level);
      messages.push({
        text: `炼体突破至第 ${bodyTraining.level} 层，体魄、神识、身法、根骨各提升 1 点。`,
        kind: 'quest',
      });
    }

    player.bodyTraining = bodyTraining;
    if (bodyTraining.level === previousLevel && bodyTraining.exp === previousExp) {
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        targetLabel: '炼体',
        expLabel: '炼体经验',
        dirty: resolvedTarget.dirty,
        messages,
      };
    }

/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<TechniqueDirtyFlag>(['tech', ...resolvedTarget.dirty]);
    if (bodyTraining.level !== previousLevel) {
      this.applyTechniqueBonuses(player);
      this.attrService.recalcPlayer(player);
      dirty.add('attr');
      dirty.add('actions');
    }

    return {
      changed: true,
      gained: gain,
      targetLabel: '炼体',
      expLabel: '炼体经验',
      dirty: [...dirty],
      messages,
    };
  }

/** resolveCultivatingTechnique：执行对应的业务逻辑。 */
  private resolveCultivatingTechnique(player: PlayerState): TechniqueState | null {
    if (!player.cultivatingTechId) {
      return null;
    }
    return player.techniques.find((entry) => entry.techId === player.cultivatingTechId) ?? null;
  }

  private resolveActiveCultivatingTechnique(player: PlayerState): { technique: TechniqueState | null; dirty: TechniqueDirtyFlag[]; messages: TechniqueMessage[] } {
/** technique：定义该变量以承载业务值。 */
    const technique = this.resolveCultivatingTechnique(player);
    if (!technique) {
      return { technique: null, dirty: [], messages: [] };
    }
    if (player.autoSwitchCultivation !== true || !this.isTechniqueMaxed(technique)) {
      return { technique, dirty: [], messages: [] };
    }

/** nextTechnique：定义该变量以承载业务值。 */
    const nextTechnique = this.findNextCultivatingTechnique(player, technique.techId);
    if (!nextTechnique) {
      return { technique, dirty: [], messages: [] };
    }

    player.cultivatingTechId = nextTechnique.techId;
/** cultivationBuff：定义该变量以承载业务值。 */
    const cultivationBuff = this.getCultivationBuff(player);
    if (cultivationBuff) {
      this.refreshCultivationBuff(cultivationBuff, nextTechnique.name, player.realm?.realmLv ?? player.realmLv ?? 1);
    }

    return {
      technique: nextTechnique,
      dirty: ['tech', 'actions'],
      messages: [{
        text: `${technique.name} 已修至圆满，已自动切换为主修 ${nextTechnique.name}。`,
        kind: 'quest',
      }],
    };
  }

/** findNextCultivatingTechnique：执行对应的业务逻辑。 */
  private findNextCultivatingTechnique(player: PlayerState, currentTechId: string): TechniqueState | null {
/** currentIndex：定义该变量以承载业务值。 */
    const currentIndex = player.techniques.findIndex((entry) => entry.techId === currentTechId);
    if (currentIndex < 0 || player.techniques.length <= 1) {
      return null;
    }
    for (let offset = 1; offset < player.techniques.length; offset += 1) {
      const candidate = player.techniques[(currentIndex + offset) % player.techniques.length];
      if (candidate && !this.isTechniqueMaxed(candidate)) {
        return candidate;
      }
    }
    return null;
  }

/** isTechniqueMaxed：执行对应的业务逻辑。 */
  private isTechniqueMaxed(technique: Pick<TechniqueState, 'level' | 'layers'>): boolean {
    return technique.level >= getTechniqueMaxLevel(technique.layers);
  }

/** areAllTechniquesMaxed：执行对应的业务逻辑。 */
  private areAllTechniquesMaxed(player: PlayerState): boolean {
    return player.techniques.length > 0 && player.techniques.every((entry) => this.isTechniqueMaxed(entry));
  }

/** getCultivationBuff：执行对应的业务逻辑。 */
  private getCultivationBuff(player: PlayerState): TemporaryBuffState | undefined {
    return player.temporaryBuffs?.find((buff) => buff.buffId === CULTIVATION_BUFF_ID);
  }

/** getCultivationAuraMultiplier：执行对应的业务逻辑。 */
  private getCultivationAuraMultiplier(player: PlayerState): number {
/** auraResources：定义该变量以承载业务值。 */
    const auraResources = this.mapService.getTileAuraResourceValues(player.mapId, player.x, player.y);
/** auraLevel：定义该变量以承载业务值。 */
    const auraLevel = auraResources.length > 0
      ? this.qiProjectionService.getAuraLevelFromResources(
          player,
          auraResources,
          this.mapService.getAuraLevelBaseValue(),
        )
      : this.qiProjectionService.getAuraLevel(
          player,
          this.mapService.getTileAura(player.mapId, player.x, player.y),
          this.mapService.getAuraLevelBaseValue(),
        );
    return 1 + Math.max(0, auraLevel);
  }

/** buildCultivationBuffState：执行对应的业务逻辑。 */
  private buildCultivationBuffState(techniqueName: string | undefined, sourceRealmLv: number): TemporaryBuffState {
    return {
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: this.buildCultivationBuffDescription(techniqueName),
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      remainingTicks: CULTIVATION_BUFF_DURATION + 1,
      duration: CULTIVATION_BUFF_DURATION,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: CULTIVATION_ACTION_ID,
      sourceSkillName: '修炼',
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      stats: {
        realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
        techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
      },
      statMode: 'flat',
    };
  }

/** refreshCultivationBuff：执行对应的业务逻辑。 */
  private refreshCultivationBuff(buff: TemporaryBuffState, techniqueName: string | undefined, sourceRealmLv: number): void {
    buff.name = '修炼中';
    buff.desc = this.buildCultivationBuffDescription(techniqueName);
    buff.shortMark = '修';
    buff.category = 'buff';
    buff.visibility = 'public';
    buff.duration = CULTIVATION_BUFF_DURATION;
    buff.remainingTicks = CULTIVATION_BUFF_DURATION + 1;
    buff.stacks = 1;
    buff.maxStacks = 1;
    buff.sourceSkillId = CULTIVATION_ACTION_ID;
    buff.sourceSkillName = '修炼';
    buff.realmLv = Math.max(1, Math.floor(sourceRealmLv));
    buff.stats = {
      realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
      techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
    };
    buff.statMode = 'flat';
  }

/** buildCultivationStartMessage：执行对应的业务逻辑。 */
  private buildCultivationStartMessage(techniqueName: string | undefined, hasLearnedTechniques: boolean): string {
    if (techniqueName) {
      return `你沉心运转 ${techniqueName}，开始修炼。移动、主动出手或受击都会中断修炼。`;
    }
    if (hasLearnedTechniques) {
      return '你沉心调息，开始修炼。当前未设主修，功法经验会直接转入炼体。移动、主动出手或受击都会中断修炼。';
    }
    return '你沉心调息，开始修炼。移动、主动出手或受击都会中断修炼。';
  }

/** buildCultivationBuffDescription：执行对应的业务逻辑。 */
  private buildCultivationBuffDescription(techniqueName?: string): string {
    if (techniqueName) {
      return `${techniqueName} 正在运转，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。`;
    }
    return '正在调息修炼，每息获得境界修为与功法经验；若未设主修，功法经验会直接转入炼体。移动、主动攻击或受击都会打断修炼。';
  }

/** removeCultivationBuff：执行对应的业务逻辑。 */
  private removeCultivationBuff(player: PlayerState): boolean {
    if (!player.temporaryBuffs || player.temporaryBuffs.length === 0) {
      return false;
    }
/** nextBuffs：定义该变量以承载业务值。 */
    const nextBuffs = player.temporaryBuffs.filter((buff) => buff.buffId !== CULTIVATION_BUFF_ID);
    if (nextBuffs.length === player.temporaryBuffs.length) {
      return false;
    }
    player.temporaryBuffs = nextBuffs;
    this.attrService.recalcPlayer(player);
    return true;
  }

/** clearInvalidCultivation：执行对应的业务逻辑。 */
  private clearInvalidCultivation(player: PlayerState): CultivationResult {
/** hadBuff：定义该变量以承载业务值。 */
    const hadBuff = this.removeCultivationBuff(player);
    if (!player.cultivatingTechId && !hadBuff) {
      return EMPTY_CULTIVATION_RESULT;
    }
    player.cultivatingTechId = undefined;
    return {
      changed: true,
      dirty: hadBuff ? ['tech', 'attr', 'actions'] : ['tech', 'actions'],
      messages: [{ text: '当前主修功法不存在，已清空主修设置。', kind: 'system' }],
    };
  }

  private getRealmCombatExp(
    monsterLevel: number,
    playerRealmLv: number,
    monsterTier?: MonsterTier,
    expMultiplier = 1,
    contributionRatio = 1,
  ): number {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, Math.floor(monsterLevel));
/** expToNext：定义该变量以承载业务值。 */
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(level)?.expToNext ?? 0);
    if (expToNext <= 0) {
      return 0;
    }

/** normalizedMultiplier：定义该变量以承载业务值。 */
    const normalizedMultiplier = Number.isFinite(expMultiplier) ? Math.max(0, expMultiplier) : 1;
/** normalizedContributionRatio：定义该变量以承载业务值。 */
    const normalizedContributionRatio = Math.min(1, Math.max(0, Number.isFinite(contributionRatio) ? Number(contributionRatio) : 1));
/** levelAdjustment：定义该变量以承载业务值。 */
    const levelAdjustment = this.getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
/** monsterLevelDecay：定义该变量以承载业务值。 */
    const monsterLevelDecay = getMonsterLevelExpDecayMultiplier(level);
    return (expToNext * normalizedMultiplier * levelAdjustment * monsterLevelDecay * normalizedContributionRatio) / 1000;
  }

/** getCultivationTechniqueExp：执行对应的业务逻辑。 */
  private getCultivationTechniqueExp(techniqueExpPerTick: number, auraMultiplier: number): number {
    return Math.max(0, Math.round(Math.max(0, techniqueExpPerTick) * Math.max(0, auraMultiplier)));
  }

  private getTechniqueCombatExp(
    monsterLevel: number,
    playerRealmLv: number,
    monsterTier?: MonsterTier,
    expMultiplier = 1,
    contributionRatio = 1,
  ): number {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, Math.floor(monsterLevel));
/** expToNext：定义该变量以承载业务值。 */
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(level)?.expToNext ?? 0);
    if (expToNext <= 0) {
      return 0;
    }

/** normalizedMultiplier：定义该变量以承载业务值。 */
    const normalizedMultiplier = Number.isFinite(expMultiplier) ? Math.max(0, expMultiplier) : 1;
/** normalizedContributionRatio：定义该变量以承载业务值。 */
    const normalizedContributionRatio = Math.min(1, Math.max(0, Number.isFinite(contributionRatio) ? Number(contributionRatio) : 1));
/** levelAdjustment：定义该变量以承载业务值。 */
    const levelAdjustment = this.getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
/** monsterLevelDecay：定义该变量以承载业务值。 */
    const monsterLevelDecay = getMonsterLevelExpDecayMultiplier(level);
    return (expToNext * normalizedMultiplier * levelAdjustment * monsterLevelDecay * normalizedContributionRatio) / 200;
  }

/** getMonsterKillRealmExpAdjustment：执行对应的业务逻辑。 */
  private getMonsterKillRealmExpAdjustment(playerRealmLv: number, monsterLevel: number, monsterTier?: MonsterTier): number {
    return getMonsterKillExpLevelAdjustment(playerRealmLv, monsterLevel, monsterTier);
  }

/** getPlayerRealmLv：执行对应的业务逻辑。 */
  private getPlayerRealmLv(player: PlayerState): number {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
  }

/** initializePlayerSpecialStats：执行对应的业务逻辑。 */
  private initializePlayerSpecialStats(player: PlayerState): void {
    player.foundation = this.normalizeCounter(player.foundation);
    player.combatExp = this.normalizeCounter(player.combatExp);
    player.bodyTraining = normalizeBodyTrainingState(player.bodyTraining);
  }

/** normalizeCounter：执行对应的业务逻辑。 */
  private normalizeCounter(value: unknown): number {
    return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : 0);
  }

/** getPlayerFoundation：执行对应的业务逻辑。 */
  private getPlayerFoundation(player: PlayerState): number {
    return this.normalizeCounter(player.foundation);
  }

/** addOverflowFoundation：执行对应的业务逻辑。 */
  private addOverflowFoundation(player: PlayerState, realm: Pick<PlayerRealmState, 'progressToNext'>, amount: number): number {
/** exactGain：定义该变量以承载业务值。 */
    const exactGain = this.calculateOverflowFoundationGain(player, realm, amount);
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.rollFractionalGain(exactGain);
    if (normalized <= 0) {
      return 0;
    }
    player.foundation = this.getPlayerFoundation(player) + normalized;
    return normalized;
  }

/** addFoundation：执行对应的业务逻辑。 */
  private addFoundation(player: PlayerState, amount: number): number {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
    player.foundation = this.getPlayerFoundation(player) + normalized;
    return normalized;
  }

/** consumeFoundation：执行对应的业务逻辑。 */
  private consumeFoundation(player: PlayerState, amount: number): number {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
/** available：定义该变量以承载业务值。 */
    const available = this.getPlayerFoundation(player);
/** consumed：定义该变量以承载业务值。 */
    const consumed = Math.min(available, normalized);
    player.foundation = available - consumed;
    return consumed;
  }

/** addCombatExp：执行对应的业务逻辑。 */
  private addCombatExp(player: PlayerState, amount: number): number {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
    player.combatExp = this.normalizeCounter(player.combatExp) + normalized;
    return normalized;
  }

/** calculateOverflowFoundationGain：执行对应的业务逻辑。 */
  private calculateOverflowFoundationGain(player: PlayerState, realm: Pick<PlayerRealmState, 'progressToNext'>, amount: number): number {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }

/** referenceProgress：定义该变量以承载业务值。 */
    const referenceProgress = this.normalizeCounter(realm.progressToNext);
    if (referenceProgress <= 0) {
      return normalized;
    }

/** currentFoundation：定义该变量以承载业务值。 */
    const currentFoundation = this.getPlayerFoundation(player);
/** decayRate：定义该变量以承载业务值。 */
    const decayRate = Math.log(2) / (referenceProgress * 10);
/** decaySeed：定义该变量以承载业务值。 */
    const decaySeed = Math.exp(-decayRate * currentFoundation);
    return Math.log1p(decayRate * normalized * decaySeed) / decayRate;
  }

/** rollFractionalGain：执行对应的业务逻辑。 */
  private rollFractionalGain(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
/** guaranteed：定义该变量以承载业务值。 */
    const guaranteed = Math.floor(value);
/** remainder：定义该变量以承载业务值。 */
    const remainder = value - guaranteed;
    if (remainder <= 0) {
      return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
  }

/** createRealmStateFromLevel：执行对应的业务逻辑。 */
  private createRealmStateFromLevel(realmLv: number, progress = 0): PlayerRealmState {
/** normalizedRealmLv：定义该变量以承载业务值。 */
    const normalizedRealmLv = this.clampRealmLv(realmLv);
/** realmEntry：定义该变量以承载业务值。 */
    const realmEntry = this.contentService.getRealmLevelEntry(normalizedRealmLv)
      ?? this.contentService.getRealmLevelEntry(1);
/** stage：定义该变量以承载业务值。 */
    const stage = this.resolveStageForRealmLevel(normalizedRealmLv);
/** config：定义该变量以承载业务值。 */
    const config = PLAYER_REALM_CONFIG[stage];
/** expToNext：定义该变量以承载业务值。 */
    const expToNext = Math.max(0, realmEntry?.expToNext ?? 0);
/** cappedProgress：定义该变量以承载业务值。 */
    const cappedProgress = expToNext > 0 ? Math.max(0, Math.min(progress, expToNext)) : 0;
/** maxRealmLv：定义该变量以承载业务值。 */
    const maxRealmLv = this.getMaxRealmLv();
/** breakthroughReady：定义该变量以承载业务值。 */
    const breakthroughReady = expToNext > 0 && cappedProgress >= expToNext && normalizedRealmLv < maxRealmLv;
/** nextStage：定义该变量以承载业务值。 */
    const nextStage = normalizedRealmLv < maxRealmLv
      ? this.resolveStageForRealmLevel(normalizedRealmLv + 1)
      : undefined;

    return {
      stage,
      realmLv: realmEntry?.realmLv ?? normalizedRealmLv,
      displayName: realmEntry?.displayName ?? '未知境界',
      name: realmEntry?.name ?? '未知境界',
      shortName: realmEntry?.phaseName ?? '',
      path: realmEntry?.path ?? config.path,
      narrative: config.narrative,
      review: realmEntry?.review,
      lifespanYears: realmEntry?.lifespanYears ?? null,
      progress: cappedProgress,
      progressToNext: expToNext,
      breakthroughReady,
      nextStage,
      breakthroughItems: breakthroughReady ? config.breakthroughItems.map((entry) => ({ ...entry })) : [],
      minTechniqueLevel: config.minTechniqueLevel,
      minTechniqueRealm: config.minTechniqueRealm,
    };
  }

/** normalizeRealmState：执行对应的业务逻辑。 */
  private normalizeRealmState(realmLv: number, progress = 0): PlayerRealmState {
    return this.createRealmStateFromLevel(realmLv, Math.max(0, Math.floor(progress)));
  }

/** applyResolvedRealmState：执行对应的业务逻辑。 */
  private applyResolvedRealmState(player: PlayerState, realm: PlayerRealmState): void {
    this.applyRealmBonus(player, realm);
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    this.syncRealmPresentation(player, realm);
  }

  private resolveInitialRealmState(
    player: PlayerState,
/** persisted：定义该变量以承载业务值。 */
    persisted: { stage?: PlayerRealmStage; progress?: number; realmLv?: number },
  ): PlayerRealmState {
/** persistedProgress：定义该变量以承载业务值。 */
    const persistedProgress = persisted.progress ?? player.realm?.progress ?? 0;
/** persistedRealmLv：定义该变量以承载业务值。 */
    const persistedRealmLv = persisted.realmLv ?? player.realm?.realmLv ?? player.realmLv;
    if (typeof persistedRealmLv === 'number' && persistedRealmLv > 0) {
      return this.normalizeRealmState(persistedRealmLv, persistedProgress);
    }

/** stage：定义该变量以承载业务值。 */
    const stage = persisted.stage ?? player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
/** stageProgress：定义该变量以承载业务值。 */
    const stageProgress = Math.max(0, persistedProgress);
/** legacyProgressToNext：定义该变量以承载业务值。 */
    const legacyProgressToNext = Math.max(0, PLAYER_REALM_CONFIG[stage].progressToNext);
/** legacyEntry：定义该变量以承载业务值。 */
    const legacyEntry = this.contentService.resolveRealmLevelEntry(
      stage,
      stageProgress,
      legacyProgressToNext,
      legacyProgressToNext > 0 && stageProgress >= legacyProgressToNext,
    );
/** mappedProgress：定义该变量以承载业务值。 */
    const mappedProgress = legacyProgressToNext > 0
      ? Math.floor((Math.max(0, legacyEntry.expToNext ?? 0) * Math.min(stageProgress, legacyProgressToNext)) / legacyProgressToNext)
      : 0;
    return this.normalizeRealmState(legacyEntry.realmLv, mappedProgress);
  }

/** cloneHeavenGateRoots：执行对应的业务逻辑。 */
  private cloneHeavenGateRoots(roots: HeavenGateRootValues): HeavenGateRootValues {
    return ELEMENT_KEYS.reduce((result, key) => {
      result[key] = Math.max(0, Math.min(100, Math.floor(roots[key] ?? 0)));
      return result;
    }, {} as HeavenGateRootValues);
  }

/** getSpiritualRootAbsorptionEfficiencyBp：执行对应的业务逻辑。 */
  private getSpiritualRootAbsorptionEfficiencyBp(value: number): number {
/** normalized：定义该变量以承载业务值。 */
    const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? Math.floor(value) : 0));
    return normalized * normalized;
  }

/** buildHeavenGateRootQiProjection：执行对应的业务逻辑。 */
  private buildHeavenGateRootQiProjection(roots: HeavenGateRootValues): NonNullable<AttrBonus['qiProjection']> {
    return ELEMENT_KEYS
      .filter((element) => (roots[element] ?? 0) > 0)
      .map((element) => ({
        selector: {
          families: ['aura'],
          elements: [element],
        },
        visibility: 'absorbable',
        efficiencyBpMultiplier: this.getSpiritualRootAbsorptionEfficiencyBp(roots[element] ?? 0),
      }));
  }

/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
  normalizeHeavenGateRoots(value: unknown): HeavenGateRootValues | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value as Record<string, unknown>;
/** roots：定义该变量以承载业务值。 */
    const roots = ELEMENT_KEYS.reduce((result, key) => {
/** next：定义该变量以承载业务值。 */
      const next = Number(raw[key] ?? 0);
      result[key] = Number.isFinite(next) ? Math.max(0, Math.min(100, Math.floor(next))) : 0;
      return result;
    }, {} as HeavenGateRootValues);
    return ELEMENT_KEYS.some((key) => roots[key] > 0) ? roots : null;
  }

/** syncHeavenGateState：执行对应的业务逻辑。 */
  private syncHeavenGateState(player: PlayerState, realm: PlayerRealmState): HeavenGateState | null {
    if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
      return null;
    }
/** persisted：定义该变量以承载业务值。 */
    const persisted = this.normalizeHeavenGateState(player.heavenGate);
/** resolvedRoots：定义该变量以承载业务值。 */
    const resolvedRoots = persisted?.roots
      ? this.cloneHeavenGateRoots(persisted.roots)
      : this.normalizeHeavenGateRoots(player.spiritualRoots);
/** entered：定义该变量以承载业务值。 */
    const entered = persisted?.entered === true || resolvedRoots !== null && player.spiritualRoots !== null;
/** unlocked：定义该变量以承载业务值。 */
    const unlocked = persisted?.unlocked === true || entered || this.hasReachedHeavenGateRealm(realm.realmLv);
    if (!unlocked && !resolvedRoots && (persisted?.severed.length ?? 0) === 0) {
      player.heavenGate = null;
      return null;
    }
/** nextState：定义该变量以承载业务值。 */
    const nextState: HeavenGateState = {
      unlocked,
      severed: persisted?.severed ?? [],
      roots: resolvedRoots,
      entered,
      averageBonus: persisted?.averageBonus ?? 0,
    };
    player.heavenGate = nextState;
    return nextState;
  }

/** hasCompletedHeavenGate：执行对应的业务逻辑。 */
  private hasCompletedHeavenGate(player: PlayerState): boolean {
/** state：定义该变量以承载业务值。 */
    const state = this.normalizeHeavenGateState(player.heavenGate);
    return state?.entered === true || this.normalizeHeavenGateRoots(player.spiritualRoots) !== null;
  }

/** hasReachedHeavenGateRealm：执行对应的业务逻辑。 */
  private hasReachedHeavenGateRealm(realmLv: number): boolean {
    return Number.isFinite(realmLv) && realmLv >= HEAVEN_GATE_REALM_LEVEL;
  }

/** requiresHeavenGateCompletion：执行对应的业务逻辑。 */
  private requiresHeavenGateCompletion(player: PlayerState, realm: PlayerRealmState): boolean {
    return this.hasReachedHeavenGateRealm(realm.realmLv) && !this.hasCompletedHeavenGate(player);
  }

/** getHeavenGateSeverCost：执行对应的业务逻辑。 */
  private getHeavenGateSeverCost(realm: PlayerRealmState): number {
    return Math.max(1, Math.round(realm.progressToNext * HEAVEN_GATE_SEVER_COST_RATIO));
  }

/** getHeavenGateRerollCost：执行对应的业务逻辑。 */
  private getHeavenGateRerollCost(realm: PlayerRealmState): number {
    return Math.max(1, Math.round(realm.progressToNext * HEAVEN_GATE_REROLL_COST_RATIO));
  }

/** getShatterSpiritPillCost：执行对应的业务逻辑。 */
  private getShatterSpiritPillCost(realm: PlayerRealmState): number {
    return Math.max(0, Math.round(Math.max(0, realm.progress) * SHATTER_SPIRIT_PILL_COST_RATIO));
  }

/** getHeavenGateRerollCount：执行对应的业务逻辑。 */
  private getHeavenGateRerollCount(averageBonus: number): number {
    return Math.max(0, Math.floor(Math.max(0, averageBonus) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
  }

/** getHeavenGateAverageBonusFromRerollCount：执行对应的业务逻辑。 */
  private getHeavenGateAverageBonusFromRerollCount(rerollCount: number): number {
    return Math.max(0, Math.floor(rerollCount)) * HEAVEN_GATE_REROLL_AVERAGE_BONUS;
  }

/** getSpiritualRootSeedRerollEquivalent：执行对应的业务逻辑。 */
  private getSpiritualRootSeedRerollEquivalent(tier: SpiritualRootSeedTier): number {
    return SPIRITUAL_ROOT_SEED_REROLL_EQUIVALENTS[tier];
  }

  private getSpiritualRootSeedFoundationCost(
    realm: PlayerRealmState,
    averageBonus: number,
    tier: SpiritualRootSeedTier,
  ): number {
/** rerollCost：定义该变量以承载业务值。 */
    const rerollCost = this.getHeavenGateRerollCost(realm);
/** rerollCount：定义该变量以承载业务值。 */
    const rerollCount = this.getHeavenGateRerollCount(averageBonus);
/** remainingEquivalent：定义该变量以承载业务值。 */
    const remainingEquivalent = Math.max(0, SPIRITUAL_ROOT_SEED_REROLL_EQUIVALENTS[tier] - rerollCount);
    return rerollCost * remainingEquivalent;
  }

  private weightedPickHeavenGateSegment(segments: Array<{ min: number; max: number; weight: number }>): { min: number; max: number; weight: number } {
/** totalWeight：定义该变量以承载业务值。 */
    const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
/** cursor：定义该变量以承载业务值。 */
    let cursor = Math.random() * totalWeight;
    for (const segment of segments) {
      cursor -= segment.weight;
      if (cursor <= 0) {
        return segment;
      }
    }
    return segments[segments.length - 1];
  }

/** randomHeavenGateInt：执行对应的业务逻辑。 */
  private randomHeavenGateInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

/** getHeavenGateExtraPerfectRootKeepChance：执行对应的业务逻辑。 */
  private getHeavenGateExtraPerfectRootKeepChance(averageBonus: number): number {
/** bonus：定义该变量以承载业务值。 */
    const bonus = Math.max(0, averageBonus);
    if (bonus <= 0) {
      return 1;
    }
/** squaredBonus：定义该变量以承载业务值。 */
    const squaredBonus = bonus * bonus;
/** squaredSoftCap：定义该变量以承载业务值。 */
    const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
    return squaredBonus / (squaredBonus + squaredSoftCap);
  }

/** distributeHeavenGateRoots：执行对应的业务逻辑。 */
  private distributeHeavenGateRoots(total: number, remaining: ElementKey[]): HeavenGateRootValues {
/** result：定义该变量以承载业务值。 */
    const result = ELEMENT_KEYS.reduce((state, key) => {
      state[key] = 0;
      return state;
    }, {} as HeavenGateRootValues);
    if (remaining.length === 0) {
      return result;
    }
    if (remaining.length === 1) {
      result[remaining[0]] = Math.max(1, Math.min(100, total));
      return result;
    }
    if (total === remaining.length) {
      for (const key of remaining) {
        result[key] = 1;
      }
      return result;
    }
    if (total === remaining.length * 100) {
      for (const key of remaining) {
        result[key] = 100;
      }
      return result;
    }

/** spread：定义该变量以承载业务值。 */
    const spread = HEAVEN_GATE_DISTRIBUTION_SPREAD[remaining.length] ?? 0.18;
/** scores：定义该变量以承载业务值。 */
    const scores = remaining.map(() => Math.max(0.08, 1 + (Math.random() * 2 - 1) * spread));
/** scoreSum：定义该变量以承载业务值。 */
    const scoreSum = scores.reduce((sum, score) => sum + score, 0);
/** remainder：定义该变量以承载业务值。 */
    const remainder = Math.max(0, total - remaining.length);
/** allocations：定义该变量以承载业务值。 */
    const allocations = remaining.map((element, index) => ({
      element,
      extra: Math.min(99, Math.floor((remainder * scores[index]) / scoreSum)),
      fraction: (remainder * scores[index]) / scoreSum,
    }));
/** allocated：定义该变量以承载业务值。 */
    let allocated = allocations.reduce((sum, entry) => sum + entry.extra, 0);
/** sorted：定义该变量以承载业务值。 */
    const sorted = [...allocations].sort((left, right) => right.fraction - left.fraction);
/** cursor：定义该变量以承载业务值。 */
    let cursor = 0;
    while (allocated < remainder) {
/** target：定义该变量以承载业务值。 */
      const target = sorted[cursor % sorted.length];
      if (target.extra < 99) {
        target.extra += 1;
        allocated += 1;
      }
      cursor += 1;
    }
    for (const entry of sorted) {
      result[entry.element] = 1 + entry.extra;
    }
    return result;
  }

/** softenHeavenGatePerfectRoots：执行对应的业务逻辑。 */
  private softenHeavenGatePerfectRoots(roots: HeavenGateRootValues, averageBonus: number): HeavenGateRootValues {
/** keepChance：定义该变量以承载业务值。 */
    const keepChance = this.getHeavenGateExtraPerfectRootKeepChance(averageBonus);
/** preservedPerfectCount：定义该变量以承载业务值。 */
    let preservedPerfectCount = 0;
    for (const key of ELEMENT_KEYS) {
      if (roots[key] !== 100) {
        continue;
      }
      if (preservedPerfectCount === 0) {
        preservedPerfectCount = 1;
        continue;
      }
      if (Math.random() > keepChance) {
        roots[key] = 99;
        continue;
      }
      preservedPerfectCount += 1;
    }
    return roots;
  }

/** createHeavenSpiritualRootSeedRoots：执行对应的业务逻辑。 */
  private createHeavenSpiritualRootSeedRoots(): HeavenGateRootValues {
/** roots：定义该变量以承载业务值。 */
    const roots = ELEMENT_KEYS.reduce((result, key) => {
      result[key] = Math.random() < 0.5 ? 100 : 99;
      return result;
    }, {} as HeavenGateRootValues);
    if (ELEMENT_KEYS.some((key) => roots[key] === 100)) {
      return roots;
    }
/** guaranteedKey：定义该变量以承载业务值。 */
    const guaranteedKey = ELEMENT_KEYS[this.randomHeavenGateInt(0, ELEMENT_KEYS.length - 1)];
    roots[guaranteedKey] = 100;
    return roots;
  }

/** createDivineSpiritualRootSeedRoots：执行对应的业务逻辑。 */
  private createDivineSpiritualRootSeedRoots(): HeavenGateRootValues {
    return ELEMENT_KEYS.reduce((result, key) => {
      result[key] = 100;
      return result;
    }, {} as HeavenGateRootValues);
  }

/** rollHeavenGateRoots：执行对应的业务逻辑。 */
  private rollHeavenGateRoots(severed: readonly ElementKey[], averageBonus: number): HeavenGateRootValues {
/** remaining：定义该变量以承载业务值。 */
    const remaining = ELEMENT_KEYS.filter((element) => !severed.includes(element));
/** segments：定义该变量以承载业务值。 */
    const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remaining.length] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];
/** segment：定义该变量以承载业务值。 */
    const segment = this.weightedPickHeavenGateSegment(segments);
/** average：定义该变量以承载业务值。 */
    const average = Math.min(100, this.randomHeavenGateInt(segment.min, segment.max) + Math.max(0, averageBonus));
/** roots：定义该变量以承载业务值。 */
    const roots = this.distributeHeavenGateRoots(average * remaining.length, remaining);
    return this.softenHeavenGatePerfectRoots(roots, averageBonus);
  }

  private completeBreakthrough(
    player: PlayerState,
    realm: PlayerRealmState,
    spiritualRoots?: HeavenGateRootValues | null,
  ): BreakthroughResult {
    if (!realm.breakthroughReady || !realm.breakthrough) {
      return { error: '你的境界火候未到，尚不能突破', dirty: [], messages: [] };
    }

/** breakthrough：定义该变量以承载业务值。 */
    const breakthrough = this.resolveBreakthroughRequirements(player, realm.realmLv);
    if (breakthrough.blockedReason) {
      return { error: breakthrough.blockedReason, dirty: [], messages: [] };
    }
/** unmet：定义该变量以承载业务值。 */
    const unmet = breakthrough.requirements.filter((entry) => entry.blocksBreakthrough && !entry.completed);
    if (unmet.length > 0) {
      return { error: '突破条件尚未满足', dirty: [], messages: [] };
    }

    for (const requirement of breakthrough.requirements) {
      if (requirement.def.type !== 'item' || !requirement.completed) continue;
      this.consumeItem(player, requirement.def.itemId, requirement.def.count);
    }
    if (spiritualRoots) {
      player.spiritualRoots = this.cloneHeavenGateRoots(spiritualRoots);
    }

/** nextState：定义该变量以承载业务值。 */
    const nextState = this.createRealmStateFromLevel(realm.breakthrough.targetRealmLv, 0);
/** crossedStage：定义该变量以承载业务值。 */
    const crossedStage = nextState.stage !== realm.stage;
    this.syncRealmPresentation(player, nextState);
    if (crossedStage) {
      this.applyRealmBonus(player, nextState);
    }
    this.attrService.recalcPlayer(player);
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);

    return {
      dirty: ['inv', 'attr', 'actions', 'tech'],
      messages: [{
        text: this.buildBreakthroughMessage(realm.stage, nextState.stage, nextState.displayName),
        kind: 'quest',
      }],
    };
  }

/** applyRealmBonus：执行对应的业务逻辑。 */
  private applyRealmBonus(player: PlayerState, realm: PlayerRealmState): void {
/** nextBonuses：定义该变量以承载业务值。 */
    const nextBonuses = player.bonuses.filter((bonus) => bonus.source !== REALM_STAGE_SOURCE);
/** config：定义该变量以承载业务值。 */
    const config = PLAYER_REALM_CONFIG[realm.stage];
/** hasBonus：定义该变量以承载业务值。 */
    const hasBonus = Object.values(config.attrBonus).some((value) => typeof value === 'number' && value > 0);
    if (hasBonus) {
/** bonus：定义该变量以承载业务值。 */
      const bonus: AttrBonus = {
        source: REALM_STAGE_SOURCE,
        label: realm.name,
        attrs: config.attrBonus,
      };
      nextBonuses.push(bonus);
    }
    player.bonuses = nextBonuses;
  }

/** applyRealmStateMirror：执行对应的业务逻辑。 */
  private applyRealmStateMirror(player: PlayerState, realm: PlayerRealmState): void {
    player.bonuses = player.bonuses.filter((bonus) => bonus.source !== REALM_STATE_SOURCE);
    player.bonuses.push({
      source: REALM_STATE_SOURCE,
      label: realm.name,
      attrs: {},
      meta: {
        stage: realm.stage,
        realmLv: realm.realmLv,
        progress: realm.progress,
      },
    });
  }

  private readPersistedRealmState(player: PlayerState): { stage?: PlayerRealmStage; progress?: number; realmLv?: number } {
/** mirrored：定义该变量以承载业务值。 */
    const mirrored = player.bonuses.find((bonus) => bonus.source === REALM_STATE_SOURCE);
/** stage：定义该变量以承载业务值。 */
    const stage = mirrored?.meta?.stage;
/** realmLv：定义该变量以承载业务值。 */
    const realmLv = mirrored?.meta?.realmLv;
/** progress：定义该变量以承载业务值。 */
    const progress = mirrored?.meta?.progress;
    return {
/** stage：定义该变量以承载业务值。 */
      stage: typeof stage === 'number' ? stage as PlayerRealmStage : undefined,
/** realmLv：定义该变量以承载业务值。 */
      realmLv: typeof realmLv === 'number' ? realmLv : undefined,
/** progress：定义该变量以承载业务值。 */
      progress: typeof progress === 'number' ? progress : undefined,
    };
  }

/** syncRealmPresentation：执行对应的业务逻辑。 */
  private syncRealmPresentation(player: PlayerState, realm: PlayerRealmState): void {
/** nextRealm：定义该变量以承载业务值。 */
    const nextRealm: PlayerRealmState = {
      ...realm,
      breakthrough: this.buildBreakthroughPreview(player, realm),
      heavenGate: this.syncHeavenGateState(player, realm),
    };
    player.realm = nextRealm;
    player.realmLv = nextRealm.realmLv;
    player.realmName = nextRealm.name;
    player.realmStage = nextRealm.shortName || undefined;
    player.realmReview = nextRealm.review;
    player.lifespanYears = nextRealm.lifespanYears;
    player.breakthroughReady = nextRealm.breakthroughReady;
    this.applyRealmStateMirror(player, nextRealm);
  }

  private applyHeavenGateResetState(
    player: PlayerState,
    realm: PlayerRealmState,
    averageBonus: number,
    preserveUnlocked = false,
  ): void {
/** heavenGate：定义该变量以承载业务值。 */
    const heavenGate = this.normalizeHeavenGateState(player.heavenGate);
    player.heavenGate = {
/** unlocked：定义该变量以承载业务值。 */
      unlocked: (preserveUnlocked && heavenGate?.unlocked === true) || this.hasReachedHeavenGateRealm(realm.realmLv),
      severed: [],
      roots: null,
      entered: false,
      averageBonus: Math.max(0, Math.floor(averageBonus)),
    };
    player.spiritualRoots = null;
    this.applyResolvedRealmState(player, realm);
    player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
    player.qi = Math.min(Math.round(player.numericStats?.maxQi ?? player.qi), Math.max(0, player.qi));
    player.dead = false;
  }

  /** 揭示隐藏的突破条件 */
  revealBreakthroughRequirements(player: PlayerState, requirementIds: readonly string[]): boolean {
    if (requirementIds.length === 0) return false;
/** known：定义该变量以承载业务值。 */
    const known = new Set(player.revealedBreakthroughRequirementIds ?? []);
/** previousSize：定义该变量以承载业务值。 */
    const previousSize = known.size;
    for (const requirementId of requirementIds) {
      if (typeof requirementId !== 'string' || !requirementId) continue;
      known.add(requirementId);
    }
    if (known.size === previousSize) {
      return false;
    }
    player.revealedBreakthroughRequirementIds = [...known];
    if (player.realm) {
      this.syncRealmPresentation(player, this.normalizeRealmState(player.realm.realmLv, player.realm.progress));
    }
    return true;
  }

/** buildBreakthroughPreview：执行对应的业务逻辑。 */
  private buildBreakthroughPreview(player: PlayerState, realm: PlayerRealmState): BreakthroughPreviewState | undefined {
    if (!realm.breakthroughReady) return undefined;
/** resolved：定义该变量以承载业务值。 */
    const resolved = this.resolveBreakthroughRequirements(player, realm.realmLv);
/** requirements：定义该变量以承载业务值。 */
    const requirements = resolved.requirements.map((entry) => entry.view);
/** targetEntry：定义该变量以承载业务值。 */
    const targetEntry = this.contentService.getRealmLevelEntry(resolved.config.toRealmLv);
    return {
      targetRealmLv: resolved.config.toRealmLv,
      targetDisplayName: targetEntry?.displayName ?? `realmLv ${resolved.config.toRealmLv}`,
      totalRequirements: resolved.blockingRequirements,
      completedRequirements: resolved.completedBlockingRequirements,
      allCompleted: resolved.canBreakthrough,
      canBreakthrough: resolved.canBreakthrough,
      blockingRequirements: resolved.blockingRequirements,
      completedBlockingRequirements: resolved.completedBlockingRequirements,
      requirements,
      blockedReason: resolved.blockedReason,
    };
  }

  private resolveBreakthroughRequirements(
    player: PlayerState,
    fromRealmLv: number,
  ): {
/** config：定义该变量以承载业务值。 */
    config: BreakthroughConfigEntry;
/** requirements：定义该变量以承载业务值。 */
    requirements: ResolvedBreakthroughRequirement[];
/** canBreakthrough：定义该变量以承载业务值。 */
    canBreakthrough: boolean;
/** blockingRequirements：定义该变量以承载业务值。 */
    blockingRequirements: number;
/** completedBlockingRequirements：定义该变量以承载业务值。 */
    completedBlockingRequirements: number;
    blockedReason?: string;
  } {
/** config：定义该变量以承载业务值。 */
    const config = this.getBreakthroughConfig(fromRealmLv);
    if (config.requirements.length === 0) {
      return {
        config,
        requirements: [this.buildPathSeveredRequirement(fromRealmLv)],
        canBreakthrough: false,
        blockingRequirements: 1,
        completedBlockingRequirements: 0,
        blockedReason: PATH_SEVERED_BREAKTHROUGH_REASON,
      };
    }
/** revealed：定义该变量以承载业务值。 */
    const revealed = new Set(player.revealedBreakthroughRequirementIds ?? []);
/** increaseMultiplier：定义该变量以承载业务值。 */
    const increaseMultiplier = config.requirements.reduce((multiplier, def) => {
      if (!this.isOptionalAttributeIncreaser(def) || this.isBreakthroughRequirementCompleted(player, def)) {
        return multiplier;
      }
      return multiplier * (1 + this.getRequirementIncreaseRate(def));
    }, 1);
/** requirements：定义该变量以承载业务值。 */
    const requirements = config.requirements.map((def) => {
/** blocksBreakthrough：定义该变量以承载业务值。 */
      const blocksBreakthrough = this.doesRequirementBlockBreakthrough(def);
/** completed：定义该变量以承载业务值。 */
      const completed = this.isBreakthroughRequirementCompleted(player, def, increaseMultiplier);
/** hidden：定义该变量以承载业务值。 */
      const hidden = def.hidden === true && !completed && !revealed.has(def.id);
/** view：定义该变量以承载业务值。 */
      const view = this.buildBreakthroughRequirementView(player, def, {
        hidden,
        completed,
        increaseMultiplier,
        blocksBreakthrough,
      });
      return { def, completed, blocksBreakthrough, view };
    });
/** blockingRequirements：定义该变量以承载业务值。 */
    const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough).length;
/** completedBlockingRequirements：定义该变量以承载业务值。 */
    const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough && entry.completed).length;
    return {
      config,
      requirements,
/** canBreakthrough：定义该变量以承载业务值。 */
      canBreakthrough: blockingRequirements === completedBlockingRequirements,
      blockingRequirements,
      completedBlockingRequirements,
    };
  }

/** buildPathSeveredRequirement：执行对应的业务逻辑。 */
  private buildPathSeveredRequirement(fromRealmLv: number): ResolvedBreakthroughRequirement {
/** def：定义该变量以承载业务值。 */
    const def: BreakthroughRequirementDef = {
      id: `missing-config:${fromRealmLv}`,
      type: 'attribute',
      attr: 'comprehension',
      minValue: 1,
      label: PATH_SEVERED_BREAKTHROUGH_LABEL,
    };
    return {
      def,
      completed: false,
      blocksBreakthrough: true,
      view: {
        id: def.id,
        type: def.type,
        label: PATH_SEVERED_BREAKTHROUGH_LABEL,
        completed: false,
        hidden: false,
        blocksBreakthrough: true,
        detail: PATH_SEVERED_BREAKTHROUGH_REASON,
      },
    };
  }

/** getBreakthroughConfig：执行对应的业务逻辑。 */
  private getBreakthroughConfig(fromRealmLv: number): BreakthroughConfigEntry {
/** nextRealmLv：定义该变量以承载业务值。 */
    const nextRealmLv = Math.min(this.getMaxRealmLv(), fromRealmLv + 1);
    return this.contentService.getBreakthroughConfig(fromRealmLv) ?? {
      fromRealmLv,
      toRealmLv: nextRealmLv,
      requirements: [],
    };
  }

  private isBreakthroughRequirementCompleted(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    increaseMultiplier = 1,
  ): boolean {
    switch (requirement.type) {
      case 'item':
        return this.getInventoryCount(player, requirement.itemId) >= requirement.count;
      case 'technique': {
/** qualified：定义该变量以承载业务值。 */
        const qualified = player.techniques.filter((technique) => {
          if (requirement.techniqueId && technique.techId !== requirement.techniqueId) return false;
          if (requirement.minGrade && !this.isTechniqueGradeAtLeast(technique.grade, requirement.minGrade)) return false;
          if (requirement.minLevel && technique.level < requirement.minLevel) return false;
          if (requirement.minRealm !== undefined && technique.realm < requirement.minRealm) return false;
          return true;
        });
        return qualified.length >= (requirement.count ?? 1);
      }
      case 'attribute': {
/** currentValue：定义该变量以承载业务值。 */
        const currentValue = player.finalAttrs?.[requirement.attr] ?? player.baseAttrs[requirement.attr] ?? 0;
        return currentValue >= this.getEffectiveAttributeRequirement(requirement.minValue, increaseMultiplier);
      }
      case 'root':
        return this.getCurrentRootRequirementValue(player, requirement.element) >= requirement.minValue;
      default:
        return false;
    }
  }

/** doesRequirementBlockBreakthrough：执行对应的业务逻辑。 */
  private doesRequirementBlockBreakthrough(requirement: BreakthroughRequirementDef): boolean {
    if (requirement.type === 'attribute') {
      return true;
    }
    return !this.isOptionalAttributeIncreaser(requirement);
  }

/** isOptionalAttributeIncreaser：执行对应的业务逻辑。 */
  private isOptionalAttributeIncreaser(requirement: BreakthroughRequirementDef): boolean {
    return (requirement.type === 'item' || requirement.type === 'technique')
      && this.getRequirementIncreasePct(requirement) > 0;
  }

/** getRequirementIncreasePct：执行对应的业务逻辑。 */
  private getRequirementIncreasePct(requirement: BreakthroughRequirementDef): number {
    if (requirement.type !== 'item' && requirement.type !== 'technique') {
      return 0;
    }
    return Math.max(0, Math.floor(requirement.increaseAttrRequirementPct ?? 0));
  }

/** getRequirementIncreaseRate：执行对应的业务逻辑。 */
  private getRequirementIncreaseRate(requirement: BreakthroughRequirementDef): number {
    return this.getRequirementIncreasePct(requirement) / 100;
  }

/** getEffectiveAttributeRequirement：执行对应的业务逻辑。 */
  private getEffectiveAttributeRequirement(baseValue: number, increaseMultiplier: number): number {
    return Math.max(1, Math.ceil(baseValue * Math.max(1, increaseMultiplier)));
  }

  private buildBreakthroughRequirementView(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    options: {
/** hidden：定义该变量以承载业务值。 */
      hidden: boolean;
/** completed：定义该变量以承载业务值。 */
      completed: boolean;
/** increaseMultiplier：定义该变量以承载业务值。 */
      increaseMultiplier: number;
/** blocksBreakthrough：定义该变量以承载业务值。 */
      blocksBreakthrough: boolean;
    },
  ): BreakthroughRequirementView {
    const { hidden, completed, increaseMultiplier, blocksBreakthrough } = options;
    if (hidden) {
      return {
        id: requirement.id,
        type: requirement.type,
        label: '???',
        completed,
        hidden,
      };
    }
    return {
      id: requirement.id,
      type: requirement.type,
      label: this.formatBreakthroughRequirementLabel(requirement, increaseMultiplier),
      completed,
      hidden,
      optional: !blocksBreakthrough,
      blocksBreakthrough,
      increasePct: this.isOptionalAttributeIncreaser(requirement) ? this.getRequirementIncreasePct(requirement) : undefined,
      detail: this.formatBreakthroughRequirementDetail(player, requirement, completed, increaseMultiplier, blocksBreakthrough),
    };
  }

/** formatBreakthroughRequirementLabel：执行对应的业务逻辑。 */
  private formatBreakthroughRequirementLabel(requirement: BreakthroughRequirementDef, increaseMultiplier = 1): string {
    if (requirement.type !== 'attribute' && requirement.label) return requirement.label;
    switch (requirement.type) {
      case 'item': {
/** itemName：定义该变量以承载业务值。 */
        const itemName = this.contentService.getItem(requirement.itemId)?.name ?? requirement.itemId;
        return `${itemName} x${requirement.count}`;
      }
      case 'technique': {
/** parts：定义该变量以承载业务值。 */
        const parts: string[] = ['至少掌握'];
/** count：定义该变量以承载业务值。 */
        const count = requirement.count ?? 1;
        parts.push(`${count}门`);
        if (requirement.techniqueId) {
          parts.push(this.contentService.getTechnique(requirement.techniqueId)?.name ?? requirement.techniqueId);
        } else if (requirement.minGrade) {
          parts.push(`${TECHNIQUE_GRADE_LABELS[requirement.minGrade]}功法`);
        } else {
          parts.push('功法');
        }
        if (requirement.minLevel) {
          parts.push(`达到 ${requirement.minLevel} 级`);
        }
        if (requirement.minRealm !== undefined) {
          parts.push(`境界达到${this.techniqueRealmLabel(requirement.minRealm)}`);
        }
        return parts.join('');
      }
      case 'attribute': {
/** effectiveValue：定义该变量以承载业务值。 */
        const effectiveValue = this.getEffectiveAttributeRequirement(requirement.minValue, increaseMultiplier);
        return effectiveValue > requirement.minValue
          ? `${this.attrLabel(requirement.attr)}达到 ${effectiveValue}（基础 ${requirement.minValue}）`
          : `${this.attrLabel(requirement.attr)}达到 ${requirement.minValue}`;
      }
      case 'root':
        return requirement.element
          ? `${this.rootLabel(requirement.element)}灵根达到 ${requirement.minValue}`
          : `任意灵根达到 ${requirement.minValue}`;
      default:
        return '???';
    }
  }

  private formatBreakthroughRequirementDetail(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    completed: boolean,
    increaseMultiplier: number,
    blocksBreakthrough: boolean,
  ): string {
    if (requirement.type === 'attribute') {
/** currentValue：定义该变量以承载业务值。 */
      const currentValue = player.finalAttrs?.[requirement.attr] ?? player.baseAttrs[requirement.attr] ?? 0;
/** effectiveValue：定义该变量以承载业务值。 */
      const effectiveValue = this.getEffectiveAttributeRequirement(requirement.minValue, increaseMultiplier);
      return effectiveValue > requirement.minValue
        ? `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${effectiveValue}，基础要求 ${requirement.minValue}`
        : `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${requirement.minValue}`;
    }
    if (requirement.type === 'root') {
/** currentValue：定义该变量以承载业务值。 */
      const currentValue = this.getCurrentRootRequirementValue(player, requirement.element);
      return requirement.element
        ? `当前${this.rootLabel(requirement.element)}灵根 ${currentValue} / ${requirement.minValue}`
        : `当前最高灵根 ${currentValue} / ${requirement.minValue}`;
    }
    if (this.isOptionalAttributeIncreaser(requirement)) {
/** increasePct：定义该变量以承载业务值。 */
      const increasePct = this.getRequirementIncreasePct(requirement);
      if (requirement.type === 'item') {
        return completed
          ? `当前已生效，突破成功后会消耗该材料；若缺少该材料，全部属性要求上浮 ${increasePct}%`
          : `当前未生效；若缺少该材料，全部属性要求上浮 ${increasePct}%`;
      }
      return completed
        ? `当前已生效；若不满足该功法条件，全部属性要求上浮 ${increasePct}%`
        : `当前未生效；若不满足该功法条件，全部属性要求上浮 ${increasePct}%`;
    }
    if (requirement.type === 'item') {
      return completed ? '当前已满足，确认突破后会消耗对应材料。' : '当前尚未满足。';
    }
    return completed ? '当前已满足。' : (blocksBreakthrough ? '当前尚未满足。' : '当前未生效。');
  }

/** isTechniqueGradeAtLeast：执行对应的业务逻辑。 */
  private isTechniqueGradeAtLeast(current: TechniqueGrade | undefined, expected: TechniqueGrade): boolean {
    if (!current) return false;
    return TECHNIQUE_GRADE_ORDER.indexOf(current) >= TECHNIQUE_GRADE_ORDER.indexOf(expected);
  }

/** attrLabel：执行对应的业务逻辑。 */
  private attrLabel(attr: keyof PlayerState['baseAttrs']): string {
    switch (attr) {
      case 'constitution':
        return '体魄';
      case 'spirit':
        return '神识';
      case 'perception':
        return '身法';
      case 'talent':
        return '根骨';
      case 'comprehension':
        return '悟性';
      case 'luck':
        return '气运';
      default:
        return String(attr);
    }
  }

/** rootLabel：执行对应的业务逻辑。 */
  private rootLabel(element: ElementKey): string {
    return ELEMENT_KEY_LABELS[element] ?? String(element);
  }

/** getCurrentRootRequirementValue：执行对应的业务逻辑。 */
  private getCurrentRootRequirementValue(player: PlayerState, element?: ElementKey): number {
/** rootStats：定义该变量以承载业务值。 */
    const rootStats = this.normalizeHeavenGateRoots(player.spiritualRoots);
    if (!rootStats) {
      return 0;
    }
    if (element) {
      return Math.max(0, Math.round(rootStats[element] ?? 0));
    }
    return ELEMENT_KEYS.reduce((maxValue, key) => Math.max(maxValue, Math.round(rootStats[key] ?? 0)), 0);
  }

/** resolveStageForRealmLevel：执行对应的业务逻辑。 */
  private resolveStageForRealmLevel(realmLv: number): PlayerRealmStage {
    for (const stage of [...PLAYER_REALM_ORDER].reverse()) {
      const range = this.contentService.getRealmLevelRange(stage);
      if (realmLv >= range.levelFrom) {
        return stage;
      }
    }
    return DEFAULT_PLAYER_REALM_STAGE;
  }

/** getMaxRealmLv：执行对应的业务逻辑。 */
  private getMaxRealmLv(): number {
/** levelCap：定义该变量以承载业务值。 */
    const levelCap = this.contentService.getRealmLevelsConfig()?.levels?.at(-1)?.realmLv;
/** breakthroughCap：定义该变量以承载业务值。 */
    const breakthroughCap = this.contentService.getMaxConfiguredBreakthroughRealmLv();
    if (typeof levelCap === 'number' && levelCap > 0) {
      return Math.min(levelCap, breakthroughCap);
    }
    return breakthroughCap;
  }

/** clampRealmLv：执行对应的业务逻辑。 */
  private clampRealmLv(realmLv: number): number {
    return Math.max(1, Math.min(this.getMaxRealmLv(), Math.floor(realmLv)));
  }

/** applyTechniqueBonuses：执行对应的业务逻辑。 */
  private applyTechniqueBonuses(player: PlayerState): void {
/** nextBonuses：定义该变量以承载业务值。 */
    const nextBonuses = player.bonuses.filter((bonus) => (
      !bonus.source.startsWith(TECHNIQUE_SOURCE_PREFIX)
      && bonus.source !== HEAVEN_GATE_ROOTS_SOURCE
      && bonus.source !== BODY_TRAINING_SOURCE
    ));
/** attrs：定义该变量以承载业务值。 */
    const attrs = calcTechniqueFinalAttrBonus(player.techniques);
    if (Object.values(attrs).some((value) => value > 0)) {
      nextBonuses.push({
        source: `${TECHNIQUE_SOURCE_PREFIX}aggregate`,
        label: '功法总池',
        attrs,
      });
    }
/** bodyTrainingAttrs：定义该变量以承载业务值。 */
    const bodyTrainingAttrs = calcBodyTrainingAttrBonus(player.bodyTraining?.level ?? 0);
    if (Object.values(bodyTrainingAttrs).some((value) => (value ?? 0) > 0)) {
      nextBonuses.push({
        source: BODY_TRAINING_SOURCE,
        label: '炼体',
        attrs: bodyTrainingAttrs,
      });
    }
/** roots：定义该变量以承载业务值。 */
    const roots = this.normalizeHeavenGateRoots(player.spiritualRoots);
    if (roots) {
      nextBonuses.push({
        source: HEAVEN_GATE_ROOTS_SOURCE,
        label: '先天灵根',
        attrs: {},
        stats: {
          elementDamageBonus: this.cloneHeavenGateRoots(roots),
          elementDamageReduce: this.cloneHeavenGateRoots(roots),
        },
        qiProjection: this.buildHeavenGateRootQiProjection(roots),
      });
    }
    player.bonuses = nextBonuses;
  }

/** syncTechniqueMetadata：执行对应的业务逻辑。 */
  private syncTechniqueMetadata(player: PlayerState): void {
/** normalizedTechniques：定义该变量以承载业务值。 */
    const normalizedTechniques: TechniqueState[] = [];
    for (const technique of player.techniques) {
      const template = this.contentService.getTechnique(technique.techId);
      if (!template) {
        continue;
      }
/** previousExpToNext：定义该变量以承载业务值。 */
      const previousExpToNext = Math.max(0, technique.expToNext);
      technique.name = template.name;
      technique.grade = template.grade;
      technique.category = template.category;
      technique.realmLv = template.realmLv;
      technique.layers = template.layers;
      technique.skills = template.skills;
      technique.skillsEnabled = technique.skillsEnabled !== false;
/** maxLevel：定义该变量以承载业务值。 */
      const maxLevel = getTechniqueMaxLevel(template.layers);
      if (technique.level > maxLevel) {
        technique.level = maxLevel;
      }
      if (technique.level < 1) {
        technique.level = 1;
      }
      technique.realm = deriveTechniqueRealm(technique.level, template.layers);
      technique.expToNext = getTechniqueExpToNext(technique.level, template.layers);
      if (technique.expToNext <= 0) {
        technique.exp = 0;
      } else if (previousExpToNext > 0 && previousExpToNext !== technique.expToNext) {
/** progressRate：定义该变量以承载业务值。 */
        const progressRate = Math.max(0, Math.min(1, technique.exp / previousExpToNext));
        technique.exp = Math.floor(progressRate * technique.expToNext);
      } else if (technique.exp >= technique.expToNext) {
        technique.exp = Math.max(0, technique.expToNext - 1);
      }
      normalizedTechniques.push(technique);
    }

    if (normalizedTechniques.length !== player.techniques.length) {
      player.techniques = normalizedTechniques;
      if (!player.cultivatingTechId || !player.techniques.some((entry) => entry.techId === player.cultivatingTechId)) {
        player.cultivatingTechId = player.techniques[0]?.techId;
      }
    }
  }

/** getInventoryCount：执行对应的业务逻辑。 */
  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

/** consumeItem：执行对应的业务逻辑。 */
  private consumeItem(player: PlayerState, itemId: string, count: number): void {
/** remaining：定义该变量以承载业务值。 */
    let remaining = count;
    while (remaining > 0) {
/** slotIndex：定义该变量以承载业务值。 */
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) return;
/** removed：定义该变量以承载业务值。 */
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) return;
      remaining -= removed.count;
    }
  }

/** techniqueRealmLabel：执行对应的业务逻辑。 */
  private techniqueRealmLabel(realm: TechniqueRealm): string {
    switch (realm) {
      case TechniqueRealm.Entry:
        return '入门';
      case TechniqueRealm.Minor:
        return '小成';
      case TechniqueRealm.Major:
        return '大成';
      case TechniqueRealm.Perfection:
        return '圆满';
    }
  }

/** buildBreakthroughMessage：执行对应的业务逻辑。 */
  private buildBreakthroughMessage(from: PlayerRealmStage, to: PlayerRealmStage, nextName: string): string {
    if (from < PlayerRealmStage.QiRefining && to >= PlayerRealmStage.QiRefining) {
      return `你打破凡武桎梏，正式踏入${nextName}，从江湖武者迈入修仙之门。`;
    }
    return `你成功突破，当前已踏入 ${nextName}。`;
  }
}
