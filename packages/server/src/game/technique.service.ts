/**
 * 功法与境界系统：修炼推进、功法升级、突破判定、技能解锁
 */
import { Injectable } from '@nestjs/common';
import {
  ActionDef,
  AttrBonus,
  BreakthroughPreviewState,
  BreakthroughRequirementView,
  calcTechniqueFinalAttrBonus,
  CULTIVATE_EXP_PER_TICK,
  DEFAULT_PLAYER_REALM_STAGE,
  deriveTechniqueRealm,
  ELEMENT_KEYS,
  ELEMENT_KEY_LABELS,
  ElementKey,
  HeavenGateRootValues,
  HeavenGateState,
  getTechniqueExpToNext,
  getTechniqueMaxLevel,
  PLAYER_REALM_CONFIG,
  PLAYER_REALM_ORDER,
  PlayerRealmStage,
  PlayerRealmState,
  PlayerState,
  TemporaryBuffState,
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_GRADE_ORDER,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
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

type TechniqueDirtyFlag = 'inv' | 'tech' | 'attr' | 'actions';
type TechniqueMessageKind = 'system' | 'quest' | 'combat' | 'loot';

interface TechniqueMessage {
  text: string;
  kind?: TechniqueMessageKind;
}

interface CultivationResult {
  error?: string;
  changed: boolean;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

interface BreakthroughResult {
  error?: string;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

interface HeavenGateActionResult {
  error?: string;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

interface ResolvedBreakthroughRequirement {
  def: BreakthroughRequirementDef;
  completed: boolean;
  blocksBreakthrough: boolean;
  view: BreakthroughRequirementView;
}

interface MonsterKillExpInput {
  monsterLevel?: number;
  monsterName?: string;
  expMultiplier?: number;
  participantCount?: number;
  isKiller?: boolean;
  expReferenceRealmLv?: number;
}

interface RealmExpAdvanceOptions {
  expBonus?: number;
  minimumGain?: number;
  useFoundation?: boolean;
  overflowToFoundation?: boolean;
  trackCombatExp?: boolean;
}

const HEAVEN_GATE_REALM_LEVEL = 18;
const HEAVEN_GATE_MAX_SEVERED = 4;
const HEAVEN_GATE_ROOTS_SOURCE = 'heaven_gate:roots';
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
const HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP = 174;
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
const HEAVEN_GATE_DISTRIBUTION_SPREAD: Record<number, number> = {
  5: 0.18,
  4: 0.28,
  3: 0.4,
  2: 0.58,
  1: 0,
};

interface RealmExpAdvanceResult {
  changed: boolean;
  gained: number;
  techniqueEligibleGain: number;
  foundationSpent: number;
  foundationGained: number;
  combatExpGained: number;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

const FOUNDATION_EXP_MULTIPLIER = 3;
const FOUNDATION_EXP_BONUS_MULTIPLIER = FOUNDATION_EXP_MULTIPLIER - 1;

@Injectable()
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
    const previousHp = player.hp;
    const previousMaxHp = player.maxHp;
    const persisted = this.readPersistedRealmState(player);
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

  preparePlayerForPersistence(player: PlayerState): void {
    this.initializePlayerProgression(player);
  }

  normalizeHeavenGateState(value: unknown): HeavenGateState | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const severed = Array.isArray(raw.severed)
      ? [...new Set(raw.severed.filter((entry): entry is ElementKey => typeof entry === 'string' && ELEMENT_KEYS.includes(entry as ElementKey)))]
        .slice(0, HEAVEN_GATE_MAX_SEVERED)
      : [];
    const roots = this.normalizeHeavenGateRoots(raw.roots);
    const entered = raw.entered === true;
    const averageBonus = Math.max(0, Math.floor(Number(raw.averageBonus ?? 0) || 0));
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
    const realm = player.realm;
    if (!realm || !this.hasReachedHeavenGateRealm(realm.realmLv)) {
      return { error: '当前境界不可开天门', dirty: [], messages: [] };
    }

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
      const cost = this.getHeavenGateSeverCost(realm);
      if (realm.progress < cost) {
        return { error: '当前境界修为不足', dirty: [], messages: [] };
      }
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
          text: `${action === 'sever' ? '斩断' : '补回'}${ELEMENT_KEY_LABELS[element]}灵根，消耗 ${cost} 点境界修为。`,
          kind: 'quest',
        }],
      };
    }

    if (action === 'open') {
      if (heavenGate.entered) {
        return { error: '当前已入天门，无法再重开天门', dirty: [], messages: [] };
      }
      const roots = this.rollHeavenGateRoots(heavenGate.severed, heavenGate.averageBonus);
      player.heavenGate = {
        unlocked: true,
        severed: [...heavenGate.severed],
        roots,
        entered: false,
        averageBonus: heavenGate.averageBonus,
      };
      this.syncRealmPresentation(player, this.normalizeRealmState(realm.realmLv, realm.progress));
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

  setRealmLevel(player: PlayerState, realmLv: number): void {
    this.setRealmState(player, realmLv, 0);
  }

  setRealmProgress(player: PlayerState, progress: number): void {
    this.initializePlayerProgression(player);
    const currentRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    this.applyResolvedRealmState(player, this.normalizeRealmState(currentRealmLv, progress));
  }

  setRealmState(player: PlayerState, realmLv: number, progress = 0): void {
    this.initializePlayerProgression(player);
    this.applyResolvedRealmState(player, this.normalizeRealmState(realmLv, progress));
  }

  resetHeavenGateForTesting(player: PlayerState): void {
    this.initializePlayerProgression(player);
    player.heavenGate = {
      unlocked: true,
      severed: [],
      roots: null,
      entered: false,
      averageBonus: 0,
    };
    player.spiritualRoots = null;
    const readyState = this.normalizeRealmState(
      HEAVEN_GATE_REALM_LEVEL,
      this.createRealmStateFromLevel(HEAVEN_GATE_REALM_LEVEL, Number.MAX_SAFE_INTEGER).progressToNext,
    );
    this.applyResolvedRealmState(player, readyState);
    player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
    player.qi = Math.min(Math.round(player.numericStats?.maxQi ?? player.qi), Math.max(0, player.qi));
    player.dead = false;
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

    const technique: TechniqueState = {
      techId,
      name,
      level: 1,
      exp: 0,
      expToNext: getTechniqueExpToNext(1, layers),
      realmLv,
      realm: deriveTechniqueRealm(1, layers),
      skills,
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
    const cultivationBuff = this.measureCpuSection('cultivation_resolve', '修炼: 主修解析', () => (
      this.getCultivationBuff(player)
    ));
    if (!cultivationBuff) return EMPTY_CULTIVATION_RESULT;
    const cultivationTarget = this.measureCpuSection('cultivation_resolve', '修炼: 主修解析', () => (
      this.resolveActiveCultivatingTechnique(player)
    ));
    if (!cultivationTarget.technique) {
      return this.clearInvalidCultivation(player);
    }
    const technique = cultivationTarget.technique;
    this.refreshCultivationBuff(cultivationBuff, technique.name);

    const numericStats = this.measureCpuSection('cultivation_stats', '修炼: 数值采集', () => (
      this.attrService.getPlayerNumericStats(player)
    ));
    const auraMultiplier = this.measureCpuSection('cultivation_stats', '修炼: 数值采集', () => (
      this.getCultivationAuraMultiplier(player)
    ));
    const realmExpBonus = Math.max(0, numericStats.playerExpRate) / 10000;
    const techniqueExpBonus = Math.max(0, numericStats.techniqueExpRate) / 10000;
    const dirty = new Set<TechniqueDirtyFlag>(cultivationTarget.dirty);
    const messages: TechniqueMessage[] = [...cultivationTarget.messages];

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

  hasCultivationBuff(player: PlayerState): boolean {
    return Boolean(this.getCultivationBuff(player));
  }

  /** 开始修炼（添加修炼 Buff） */
  startCultivation(player: PlayerState): CultivationResult {
    this.initializePlayerProgression(player);
    const technique = this.resolveCultivatingTechnique(player);
    if (!technique) {
      if (player.cultivatingTechId) {
        return this.clearInvalidCultivation(player);
      }
      return {
        error: '请先在功法面板选择一门主修功法',
        changed: false,
        dirty: [],
        messages: [],
      };
    }

    player.temporaryBuffs ??= [];
    const current = this.getCultivationBuff(player);
    if (current) {
      this.refreshCultivationBuff(current, technique.name);
    } else {
      player.temporaryBuffs.push(this.buildCultivationBuffState(technique.name));
      this.attrService.recalcPlayer(player);
    }

    return {
      changed: true,
      dirty: ['attr', 'actions'],
      messages: [{
        text: `你沉心运转 ${technique.name}，开始修炼。移动、主动出手或受击都会中断修炼。`,
        kind: 'quest',
      }],
    };
  }

  /** 停止修炼（移除修炼 Buff） */
  stopCultivation(player: PlayerState, reason = '你收束气机，停止了修炼。', kind: TechniqueMessageKind = 'quest'): CultivationResult {
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
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const techniqueExpBonus = Math.max(0, numericStats.techniqueExpRate) / 10000;
    const realmExpBonus = Math.max(0, numericStats.playerExpRate) / 10000;
    const normalizedMonsterLevel = Math.max(1, Math.floor(input.monsterLevel ?? 1));
    const participantCount = Math.max(1, Math.floor(input.participantCount ?? 1));
    const expReferenceRealmLv = Math.max(
      1,
      Math.floor(input.expReferenceRealmLv ?? this.getPlayerRealmLv(player)),
    );
    const dirty = new Set<TechniqueDirtyFlag>();
    const messages: TechniqueMessage[] = [];
    const realmBaseExp = this.getRealmCombatExp(
      normalizedMonsterLevel,
      expReferenceRealmLv,
      input.expMultiplier,
      participantCount,
    );

    const realmResult = this.advanceRealmProgress(player, realmBaseExp, {
      expBonus: realmExpBonus,
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

    const techniqueResult = this.advanceTechniqueCombatExp(
      player,
      this.getTechniqueCombatExp(
        normalizedMonsterLevel,
        expReferenceRealmLv,
        input.expMultiplier,
        participantCount,
      ),
      techniqueExpBonus,
    );
    if (techniqueResult.changed) {
      for (const flag of techniqueResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...techniqueResult.messages);
    }

    if (realmResult.gained > 0 || techniqueResult.gained > 0 || realmResult.combatExpGained > 0 || realmResult.foundationGained > 0) {
      const segments: string[] = [];
      if (realmResult.gained > 0) {
        segments.push(`获得 ${realmResult.gained} 点境界修为`);
      }
      if (realmResult.foundationSpent > 0) {
        segments.push(`底蕴额外转化 ${realmResult.foundationSpent} 点境界修为`);
      }
      if (techniqueResult.gained > 0 && techniqueResult.techniqueName) {
        segments.push(`${techniqueResult.techniqueName} 获得 ${techniqueResult.gained} 点功法经验`);
      }
      if (realmResult.combatExpGained > 0) {
        segments.push(`战斗经验增加 ${realmResult.combatExpGained}`);
      }
      if (realmResult.foundationGained > 0) {
        segments.push(`底蕴增加 ${realmResult.foundationGained}`);
      }
      messages.unshift({
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
    const playerRealmStage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const actions: ActionDef[] = [];

    for (const technique of player.techniques) {
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

  /** 获取突破行动（境界圆满时可用） */
  getBreakthroughAction(player: PlayerState): ActionDef | null {
    this.ensurePlayerProgressionInitialized(player);
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

  private advanceRealmProgress(player: PlayerState, baseGain: number, options: RealmExpAdvanceOptions = {}): RealmExpAdvanceResult {
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

    const gain = this.applyRateBonus(baseGain, options.expBonus ?? 0, options.minimumGain ?? 1);
    const dirty = new Set<TechniqueDirtyFlag>();
    const messages: TechniqueMessage[] = [];
    const combatExpGained = options.trackCombatExp ? this.addCombatExp(player, gain) : 0;
    if (combatExpGained > 0) {
      dirty.add('attr');
    }

    const room = realm.progressToNext > 0 && !realm.breakthroughReady
      ? Math.max(0, realm.progressToNext - realm.progress)
      : 0;
    if (room <= 0) {
      const foundationGained = options.overflowToFoundation ? this.addFoundation(player, gain) : 0;
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

    const acceptedBaseGain = Math.min(gain, room);
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

    const previousProgress = realm.progress;
    const nextState = this.normalizeRealmState(realm.realmLv, realm.progress + acceptedBaseGain + foundationSpent);
    const actualGain = Math.max(0, nextState.progress - previousProgress);
    const foundationGained = options.overflowToFoundation ? this.addFoundation(player, Math.max(0, gain - acceptedBaseGain)) : 0;
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

  private applyRateBonus(base: number, bonusRate: number, minimumGain = 1): number {
    const exactGain = Math.max(minimumGain, base * (1 + Math.max(0, bonusRate)));
    const guaranteed = Math.floor(exactGain);
    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
      return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
  }

  private advanceTechniqueCombatExp(player: PlayerState, baseGain: number, expBonus = 0): { changed: boolean; gained: number; techniqueName?: string; dirty: TechniqueDirtyFlag[]; messages: TechniqueMessage[] } {
    return this.advanceTechniqueProgress(player, baseGain, expBonus);
  }

  private advanceTechniqueProgress(player: PlayerState, baseGain: number, expBonus = 0, minimumGain = 1): { changed: boolean; gained: number; techniqueName?: string; dirty: TechniqueDirtyFlag[]; messages: TechniqueMessage[] } {
    if (!player.cultivatingTechId) {
      return { changed: false, gained: 0, dirty: [], messages: [] };
    }

    const resolvedTarget = this.resolveActiveCultivatingTechnique(player);
    const technique = resolvedTarget.technique;
    if (!technique) {
      const cleared = this.clearInvalidCultivation(player);
      return {
        changed: cleared.changed,
        gained: 0,
        dirty: cleared.dirty,
        messages: cleared.messages,
      };
    }

    const maxLevel = getTechniqueMaxLevel(technique.layers);
    if (technique.level >= maxLevel || technique.expToNext <= 0 || baseGain <= 0) {
      return {
        changed: resolvedTarget.dirty.length > 0,
        gained: 0,
        techniqueName: technique.name,
        dirty: resolvedTarget.dirty,
        messages: resolvedTarget.messages,
      };
    }

    const gain = this.applyRateBonus(baseGain, expBonus, minimumGain);
    const previousLevel = technique.level;
    const previousExp = technique.exp;
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
        techniqueName: technique.name,
        dirty: resolvedTarget.dirty,
        messages,
      };
    }

    const dirty = new Set<TechniqueDirtyFlag>(['tech', ...resolvedTarget.dirty]);
    if (technique.level !== previousLevel) {
      this.applyTechniqueBonuses(player);
      this.attrService.recalcPlayer(player);
      dirty.add('attr');
      dirty.add('actions');
    }

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
      techniqueName: technique.name,
      dirty: [...dirty],
      messages,
    };
  }

  private resolveCultivatingTechnique(player: PlayerState): TechniqueState | null {
    if (!player.cultivatingTechId) {
      return null;
    }
    return player.techniques.find((entry) => entry.techId === player.cultivatingTechId) ?? null;
  }

  private resolveActiveCultivatingTechnique(player: PlayerState): { technique: TechniqueState | null; dirty: TechniqueDirtyFlag[]; messages: TechniqueMessage[] } {
    const technique = this.resolveCultivatingTechnique(player);
    if (!technique) {
      return { technique: null, dirty: [], messages: [] };
    }
    if (player.autoSwitchCultivation !== true || !this.isTechniqueMaxed(technique)) {
      return { technique, dirty: [], messages: [] };
    }

    const nextTechnique = this.findNextCultivatingTechnique(player, technique.techId);
    if (!nextTechnique) {
      return { technique, dirty: [], messages: [] };
    }

    player.cultivatingTechId = nextTechnique.techId;
    const cultivationBuff = this.getCultivationBuff(player);
    if (cultivationBuff) {
      this.refreshCultivationBuff(cultivationBuff, nextTechnique.name);
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

  private findNextCultivatingTechnique(player: PlayerState, currentTechId: string): TechniqueState | null {
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

  private isTechniqueMaxed(technique: Pick<TechniqueState, 'level' | 'layers'>): boolean {
    return technique.level >= getTechniqueMaxLevel(technique.layers);
  }

  private getCultivationBuff(player: PlayerState): TemporaryBuffState | undefined {
    return player.temporaryBuffs?.find((buff) => buff.buffId === CULTIVATION_BUFF_ID);
  }

  private getCultivationAuraMultiplier(player: PlayerState): number {
    const auraValue = this.mapService.getTileAura(player.mapId, player.x, player.y);
    const auraLevel = this.qiProjectionService.getAuraLevel(
      player,
      auraValue,
      this.mapService.getAuraLevelBaseValue(),
    );
    return 1 + Math.max(0, auraLevel);
  }

  private buildCultivationBuffState(techniqueName: string): TemporaryBuffState {
    return {
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: `${techniqueName} 正在运转，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。`,
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      remainingTicks: CULTIVATION_BUFF_DURATION + 1,
      duration: CULTIVATION_BUFF_DURATION,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: CULTIVATION_ACTION_ID,
      sourceSkillName: '修炼',
      stats: {
        realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
        techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
      },
    };
  }

  private refreshCultivationBuff(buff: TemporaryBuffState, techniqueName: string): void {
    buff.name = '修炼中';
    buff.desc = `${techniqueName} 正在运转，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。`;
    buff.shortMark = '修';
    buff.category = 'buff';
    buff.visibility = 'public';
    buff.duration = CULTIVATION_BUFF_DURATION;
    buff.remainingTicks = CULTIVATION_BUFF_DURATION + 1;
    buff.stacks = 1;
    buff.maxStacks = 1;
    buff.sourceSkillId = CULTIVATION_ACTION_ID;
    buff.sourceSkillName = '修炼';
    buff.stats = {
      realmExpPerTick: CULTIVATION_REALM_EXP_PER_TICK,
      techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
    };
  }

  private removeCultivationBuff(player: PlayerState): boolean {
    if (!player.temporaryBuffs || player.temporaryBuffs.length === 0) {
      return false;
    }
    const nextBuffs = player.temporaryBuffs.filter((buff) => buff.buffId !== CULTIVATION_BUFF_ID);
    if (nextBuffs.length === player.temporaryBuffs.length) {
      return false;
    }
    player.temporaryBuffs = nextBuffs;
    this.attrService.recalcPlayer(player);
    return true;
  }

  private clearInvalidCultivation(player: PlayerState): CultivationResult {
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
    expMultiplier = 1,
    participantCount = 1,
  ): number {
    const level = Math.max(1, Math.floor(monsterLevel));
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(level)?.expToNext ?? 0);
    if (expToNext <= 0) {
      return 0;
    }

    const normalizedMultiplier = Number.isFinite(expMultiplier) ? Math.max(0, expMultiplier) : 1;
    const normalizedParticipantCount = Math.max(1, Math.floor(participantCount));
    const levelAdjustment = this.getMonsterKillRealmExpAdjustment(playerRealmLv, level);
    return (expToNext * normalizedMultiplier * levelAdjustment) / (1000 * normalizedParticipantCount);
  }

  private getCultivationTechniqueExp(techniqueExpPerTick: number, auraMultiplier: number): number {
    return Math.max(0, Math.round(Math.max(0, techniqueExpPerTick) * Math.max(0, auraMultiplier)));
  }

  private getTechniqueCombatExp(
    monsterLevel: number,
    playerRealmLv: number,
    expMultiplier = 1,
    participantCount = 1,
  ): number {
    const level = Math.max(1, Math.floor(monsterLevel));
    const expToNext = Math.max(0, this.contentService.getRealmLevelEntry(level)?.expToNext ?? 0);
    if (expToNext <= 0) {
      return 0;
    }

    const normalizedMultiplier = Number.isFinite(expMultiplier) ? Math.max(0, expMultiplier) : 1;
    const normalizedParticipantCount = Math.max(1, Math.floor(participantCount));
    const levelAdjustment = this.getMonsterKillRealmExpAdjustment(playerRealmLv, level);
    return (expToNext * normalizedMultiplier * levelAdjustment) / (200 * normalizedParticipantCount);
  }

  private getMonsterKillRealmExpAdjustment(playerRealmLv: number, monsterLevel: number): number {
    const normalizedPlayerLevel = Math.max(1, Math.floor(playerRealmLv));
    const normalizedMonsterLevel = Math.max(1, Math.floor(monsterLevel));
    if (normalizedPlayerLevel < normalizedMonsterLevel) {
      return 1.5 ** (normalizedMonsterLevel - normalizedPlayerLevel);
    }
    if (normalizedPlayerLevel > normalizedMonsterLevel) {
      return 0.5 ** (normalizedPlayerLevel - normalizedMonsterLevel);
    }
    return 1;
  }

  private getPlayerRealmLv(player: PlayerState): number {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
  }

  private initializePlayerSpecialStats(player: PlayerState): void {
    player.foundation = this.normalizeCounter(player.foundation);
    player.combatExp = this.normalizeCounter(player.combatExp);
  }

  private normalizeCounter(value: unknown): number {
    return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : 0);
  }

  private getPlayerFoundation(player: PlayerState): number {
    return this.normalizeCounter(player.foundation);
  }

  private addFoundation(player: PlayerState, amount: number): number {
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
    player.foundation = this.getPlayerFoundation(player) + normalized;
    return normalized;
  }

  private consumeFoundation(player: PlayerState, amount: number): number {
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
    const available = this.getPlayerFoundation(player);
    const consumed = Math.min(available, normalized);
    player.foundation = available - consumed;
    return consumed;
  }

  private addCombatExp(player: PlayerState, amount: number): number {
    const normalized = this.normalizeCounter(amount);
    if (normalized <= 0) {
      return 0;
    }
    player.combatExp = this.normalizeCounter(player.combatExp) + normalized;
    return normalized;
  }

  private createRealmStateFromLevel(realmLv: number, progress = 0): PlayerRealmState {
    const normalizedRealmLv = this.clampRealmLv(realmLv);
    const realmEntry = this.contentService.getRealmLevelEntry(normalizedRealmLv)
      ?? this.contentService.getRealmLevelEntry(1);
    const stage = this.resolveStageForRealmLevel(normalizedRealmLv);
    const config = PLAYER_REALM_CONFIG[stage];
    const expToNext = Math.max(0, realmEntry?.expToNext ?? 0);
    const cappedProgress = expToNext > 0 ? Math.max(0, Math.min(progress, expToNext)) : 0;
    const maxRealmLv = this.getMaxRealmLv();
    const breakthroughReady = expToNext > 0 && cappedProgress >= expToNext && normalizedRealmLv < maxRealmLv;
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

  private normalizeRealmState(realmLv: number, progress = 0): PlayerRealmState {
    return this.createRealmStateFromLevel(realmLv, Math.max(0, Math.floor(progress)));
  }

  private applyResolvedRealmState(player: PlayerState, realm: PlayerRealmState): void {
    this.applyRealmBonus(player, realm);
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    this.syncRealmPresentation(player, realm);
  }

  private resolveInitialRealmState(
    player: PlayerState,
    persisted: { stage?: PlayerRealmStage; progress?: number; realmLv?: number },
  ): PlayerRealmState {
    const persistedProgress = persisted.progress ?? player.realm?.progress ?? 0;
    const persistedRealmLv = persisted.realmLv ?? player.realm?.realmLv ?? player.realmLv;
    if (typeof persistedRealmLv === 'number' && persistedRealmLv > 0) {
      return this.normalizeRealmState(persistedRealmLv, persistedProgress);
    }

    const stage = persisted.stage ?? player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const stageProgress = Math.max(0, persistedProgress);
    const legacyProgressToNext = Math.max(0, PLAYER_REALM_CONFIG[stage].progressToNext);
    const legacyEntry = this.contentService.resolveRealmLevelEntry(
      stage,
      stageProgress,
      legacyProgressToNext,
      legacyProgressToNext > 0 && stageProgress >= legacyProgressToNext,
    );
    const mappedProgress = legacyProgressToNext > 0
      ? Math.floor((Math.max(0, legacyEntry.expToNext ?? 0) * Math.min(stageProgress, legacyProgressToNext)) / legacyProgressToNext)
      : 0;
    return this.normalizeRealmState(legacyEntry.realmLv, mappedProgress);
  }

  private cloneHeavenGateRoots(roots: HeavenGateRootValues): HeavenGateRootValues {
    return ELEMENT_KEYS.reduce((result, key) => {
      result[key] = Math.max(0, Math.min(100, Math.floor(roots[key] ?? 0)));
      return result;
    }, {} as HeavenGateRootValues);
  }

  normalizeHeavenGateRoots(value: unknown): HeavenGateRootValues | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const roots = ELEMENT_KEYS.reduce((result, key) => {
      const next = Number(raw[key] ?? 0);
      result[key] = Number.isFinite(next) ? Math.max(0, Math.min(100, Math.floor(next))) : 0;
      return result;
    }, {} as HeavenGateRootValues);
    return ELEMENT_KEYS.some((key) => roots[key] > 0) ? roots : null;
  }

  private syncHeavenGateState(player: PlayerState, realm: PlayerRealmState): HeavenGateState | null {
    if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
      player.heavenGate = null;
      return null;
    }
    const persisted = this.normalizeHeavenGateState(player.heavenGate);
    const resolvedRoots = persisted?.roots
      ? this.cloneHeavenGateRoots(persisted.roots)
      : this.normalizeHeavenGateRoots(player.spiritualRoots);
    const entered = persisted?.entered === true || resolvedRoots !== null && player.spiritualRoots !== null;
    const unlocked = persisted?.unlocked === true || entered || this.hasReachedHeavenGateRealm(realm.realmLv);
    if (!unlocked && !resolvedRoots && (persisted?.severed.length ?? 0) === 0) {
      player.heavenGate = null;
      return null;
    }
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

  private hasCompletedHeavenGate(player: PlayerState): boolean {
    const state = this.normalizeHeavenGateState(player.heavenGate);
    return state?.entered === true || this.normalizeHeavenGateRoots(player.spiritualRoots) !== null;
  }

  private hasReachedHeavenGateRealm(realmLv: number): boolean {
    return Number.isFinite(realmLv) && realmLv >= HEAVEN_GATE_REALM_LEVEL;
  }

  private requiresHeavenGateCompletion(player: PlayerState, realm: PlayerRealmState): boolean {
    return this.hasReachedHeavenGateRealm(realm.realmLv) && !this.hasCompletedHeavenGate(player);
  }

  private getHeavenGateSeverCost(realm: PlayerRealmState): number {
    return Math.max(1, Math.round(realm.progressToNext * 0.1));
  }

  private getHeavenGateRerollCost(realm: PlayerRealmState): number {
    return Math.max(1, Math.round(realm.progressToNext * 0.25));
  }

  private weightedPickHeavenGateSegment(segments: Array<{ min: number; max: number; weight: number }>): { min: number; max: number; weight: number } {
    const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
    let cursor = Math.random() * totalWeight;
    for (const segment of segments) {
      cursor -= segment.weight;
      if (cursor <= 0) {
        return segment;
      }
    }
    return segments[segments.length - 1];
  }

  private randomHeavenGateInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getHeavenGateExtraPerfectRootKeepChance(averageBonus: number): number {
    const bonus = Math.max(0, averageBonus);
    if (bonus <= 0) {
      return 1;
    }
    const squaredBonus = bonus * bonus;
    const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
    return squaredBonus / (squaredBonus + squaredSoftCap);
  }

  private distributeHeavenGateRoots(total: number, remaining: ElementKey[]): HeavenGateRootValues {
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

    const spread = HEAVEN_GATE_DISTRIBUTION_SPREAD[remaining.length] ?? 0.18;
    const scores = remaining.map(() => Math.max(0.08, 1 + (Math.random() * 2 - 1) * spread));
    const scoreSum = scores.reduce((sum, score) => sum + score, 0);
    const remainder = Math.max(0, total - remaining.length);
    const allocations = remaining.map((element, index) => ({
      element,
      extra: Math.min(99, Math.floor((remainder * scores[index]) / scoreSum)),
      fraction: (remainder * scores[index]) / scoreSum,
    }));
    let allocated = allocations.reduce((sum, entry) => sum + entry.extra, 0);
    const sorted = [...allocations].sort((left, right) => right.fraction - left.fraction);
    let cursor = 0;
    while (allocated < remainder) {
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

  private softenHeavenGatePerfectRoots(roots: HeavenGateRootValues, averageBonus: number): HeavenGateRootValues {
    const keepChance = this.getHeavenGateExtraPerfectRootKeepChance(averageBonus);
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

  private rollHeavenGateRoots(severed: readonly ElementKey[], averageBonus: number): HeavenGateRootValues {
    const remaining = ELEMENT_KEYS.filter((element) => !severed.includes(element));
    const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remaining.length] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];
    const segment = this.weightedPickHeavenGateSegment(segments);
    const average = Math.min(100, this.randomHeavenGateInt(segment.min, segment.max) + Math.max(0, averageBonus));
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

    const breakthrough = this.resolveBreakthroughRequirements(player, realm.realmLv);
    if (breakthrough.blockedReason) {
      return { error: breakthrough.blockedReason, dirty: [], messages: [] };
    }
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

    const nextState = this.createRealmStateFromLevel(realm.breakthrough.targetRealmLv, 0);
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

  private applyRealmBonus(player: PlayerState, realm: PlayerRealmState): void {
    const nextBonuses = player.bonuses.filter((bonus) => bonus.source !== REALM_STAGE_SOURCE);
    const config = PLAYER_REALM_CONFIG[realm.stage];
    const hasBonus = Object.values(config.attrBonus).some((value) => typeof value === 'number' && value > 0);
    if (hasBonus) {
      const bonus: AttrBonus = {
        source: REALM_STAGE_SOURCE,
        label: realm.name,
        attrs: config.attrBonus,
      };
      nextBonuses.push(bonus);
    }
    player.bonuses = nextBonuses;
  }

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
    const mirrored = player.bonuses.find((bonus) => bonus.source === REALM_STATE_SOURCE);
    const stage = mirrored?.meta?.stage;
    const realmLv = mirrored?.meta?.realmLv;
    const progress = mirrored?.meta?.progress;
    return {
      stage: typeof stage === 'number' ? stage as PlayerRealmStage : undefined,
      realmLv: typeof realmLv === 'number' ? realmLv : undefined,
      progress: typeof progress === 'number' ? progress : undefined,
    };
  }

  private syncRealmPresentation(player: PlayerState, realm: PlayerRealmState): void {
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

  /** 揭示隐藏的突破条件 */
  revealBreakthroughRequirements(player: PlayerState, requirementIds: readonly string[]): boolean {
    if (requirementIds.length === 0) return false;
    const known = new Set(player.revealedBreakthroughRequirementIds ?? []);
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

  private buildBreakthroughPreview(player: PlayerState, realm: PlayerRealmState): BreakthroughPreviewState | undefined {
    if (!realm.breakthroughReady) return undefined;
    const resolved = this.resolveBreakthroughRequirements(player, realm.realmLv);
    const requirements = resolved.requirements.map((entry) => entry.view);
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
    config: BreakthroughConfigEntry;
    requirements: ResolvedBreakthroughRequirement[];
    canBreakthrough: boolean;
    blockingRequirements: number;
    completedBlockingRequirements: number;
    blockedReason?: string;
  } {
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
    const revealed = new Set(player.revealedBreakthroughRequirementIds ?? []);
    const increaseMultiplier = config.requirements.reduce((multiplier, def) => {
      if (!this.isOptionalAttributeIncreaser(def) || this.isBreakthroughRequirementCompleted(player, def)) {
        return multiplier;
      }
      return multiplier * (1 + this.getRequirementIncreaseRate(def));
    }, 1);
    const requirements = config.requirements.map((def) => {
      const blocksBreakthrough = this.doesRequirementBlockBreakthrough(def);
      const completed = this.isBreakthroughRequirementCompleted(player, def, increaseMultiplier);
      const hidden = def.hidden === true && !completed && !revealed.has(def.id);
      const view = this.buildBreakthroughRequirementView(player, def, {
        hidden,
        completed,
        increaseMultiplier,
        blocksBreakthrough,
      });
      return { def, completed, blocksBreakthrough, view };
    });
    const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough).length;
    const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough && entry.completed).length;
    return {
      config,
      requirements,
      canBreakthrough: blockingRequirements === completedBlockingRequirements,
      blockingRequirements,
      completedBlockingRequirements,
    };
  }

  private buildPathSeveredRequirement(fromRealmLv: number): ResolvedBreakthroughRequirement {
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

  private getBreakthroughConfig(fromRealmLv: number): BreakthroughConfigEntry {
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
        const currentValue = player.finalAttrs?.[requirement.attr] ?? player.baseAttrs[requirement.attr] ?? 0;
        return currentValue >= this.getEffectiveAttributeRequirement(requirement.minValue, increaseMultiplier);
      }
      case 'root':
        return this.getCurrentRootRequirementValue(player, requirement.element) >= requirement.minValue;
      default:
        return false;
    }
  }

  private doesRequirementBlockBreakthrough(requirement: BreakthroughRequirementDef): boolean {
    if (requirement.type === 'attribute') {
      return true;
    }
    return !this.isOptionalAttributeIncreaser(requirement);
  }

  private isOptionalAttributeIncreaser(requirement: BreakthroughRequirementDef): boolean {
    return (requirement.type === 'item' || requirement.type === 'technique')
      && this.getRequirementIncreasePct(requirement) > 0;
  }

  private getRequirementIncreasePct(requirement: BreakthroughRequirementDef): number {
    if (requirement.type !== 'item' && requirement.type !== 'technique') {
      return 0;
    }
    return Math.max(0, Math.floor(requirement.increaseAttrRequirementPct ?? 0));
  }

  private getRequirementIncreaseRate(requirement: BreakthroughRequirementDef): number {
    return this.getRequirementIncreasePct(requirement) / 100;
  }

  private getEffectiveAttributeRequirement(baseValue: number, increaseMultiplier: number): number {
    return Math.max(1, Math.ceil(baseValue * Math.max(1, increaseMultiplier)));
  }

  private buildBreakthroughRequirementView(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    options: {
      hidden: boolean;
      completed: boolean;
      increaseMultiplier: number;
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

  private formatBreakthroughRequirementLabel(requirement: BreakthroughRequirementDef, increaseMultiplier = 1): string {
    if (requirement.type !== 'attribute' && requirement.label) return requirement.label;
    switch (requirement.type) {
      case 'item': {
        const itemName = this.contentService.getItem(requirement.itemId)?.name ?? requirement.itemId;
        return `${itemName} x${requirement.count}`;
      }
      case 'technique': {
        const parts: string[] = ['至少掌握'];
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
      const currentValue = player.finalAttrs?.[requirement.attr] ?? player.baseAttrs[requirement.attr] ?? 0;
      const effectiveValue = this.getEffectiveAttributeRequirement(requirement.minValue, increaseMultiplier);
      return effectiveValue > requirement.minValue
        ? `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${effectiveValue}，基础要求 ${requirement.minValue}`
        : `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${requirement.minValue}`;
    }
    if (requirement.type === 'root') {
      const currentValue = this.getCurrentRootRequirementValue(player, requirement.element);
      return requirement.element
        ? `当前${this.rootLabel(requirement.element)}灵根 ${currentValue} / ${requirement.minValue}`
        : `当前最高灵根 ${currentValue} / ${requirement.minValue}`;
    }
    if (this.isOptionalAttributeIncreaser(requirement)) {
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

  private isTechniqueGradeAtLeast(current: TechniqueGrade | undefined, expected: TechniqueGrade): boolean {
    if (!current) return false;
    return TECHNIQUE_GRADE_ORDER.indexOf(current) >= TECHNIQUE_GRADE_ORDER.indexOf(expected);
  }

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

  private rootLabel(element: ElementKey): string {
    return ELEMENT_KEY_LABELS[element] ?? String(element);
  }

  private getCurrentRootRequirementValue(player: PlayerState, element?: ElementKey): number {
    const rootStats = this.normalizeHeavenGateRoots(player.spiritualRoots);
    if (!rootStats) {
      return 0;
    }
    if (element) {
      return Math.max(0, Math.round(rootStats[element] ?? 0));
    }
    return ELEMENT_KEYS.reduce((maxValue, key) => Math.max(maxValue, Math.round(rootStats[key] ?? 0)), 0);
  }

  private resolveStageForRealmLevel(realmLv: number): PlayerRealmStage {
    for (const stage of [...PLAYER_REALM_ORDER].reverse()) {
      const range = this.contentService.getRealmLevelRange(stage);
      if (realmLv >= range.levelFrom) {
        return stage;
      }
    }
    return DEFAULT_PLAYER_REALM_STAGE;
  }

  private getMaxRealmLv(): number {
    const levels = this.contentService.getRealmLevelsConfig()?.levels ?? [];
    const maxRealmLv = levels[levels.length - 1]?.realmLv;
    return typeof maxRealmLv === 'number' && maxRealmLv > 0 ? maxRealmLv : 1;
  }

  private clampRealmLv(realmLv: number): number {
    return Math.max(1, Math.min(this.getMaxRealmLv(), Math.floor(realmLv)));
  }

  private applyTechniqueBonuses(player: PlayerState): void {
    const nextBonuses = player.bonuses.filter((bonus) => (
      !bonus.source.startsWith(TECHNIQUE_SOURCE_PREFIX) && bonus.source !== HEAVEN_GATE_ROOTS_SOURCE
    ));
    const attrs = calcTechniqueFinalAttrBonus(player.techniques);
    if (Object.values(attrs).some((value) => value > 0)) {
      nextBonuses.push({
        source: `${TECHNIQUE_SOURCE_PREFIX}aggregate`,
        label: '功法总池',
        attrs,
      });
    }
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
      });
    }
    player.bonuses = nextBonuses;
  }

  private syncTechniqueMetadata(player: PlayerState): void {
    for (const technique of player.techniques) {
      const template = this.contentService.getTechnique(technique.techId);
      if (!template) continue;
      const previousExpToNext = Math.max(0, technique.expToNext);
      technique.name = template.name;
      technique.grade = template.grade;
      technique.category = template.category;
      technique.realmLv = template.realmLv;
      technique.layers = template.layers;
      technique.skills = template.skills;
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
        const progressRate = Math.max(0, Math.min(1, technique.exp / previousExpToNext));
        technique.exp = Math.floor(progressRate * technique.expToNext);
      } else if (technique.exp >= technique.expToNext) {
        technique.exp = Math.max(0, technique.expToNext - 1);
      }
    }
  }

  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.count, 0);
  }

  private consumeItem(player: PlayerState, itemId: string, count: number): void {
    let remaining = count;
    while (remaining > 0) {
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) return;
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) return;
      remaining -= removed.count;
    }
  }

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

  private buildBreakthroughMessage(from: PlayerRealmStage, to: PlayerRealmStage, nextName: string): string {
    if (from < PlayerRealmStage.QiRefining && to >= PlayerRealmStage.QiRefining) {
      return `你打破凡武桎梏，正式踏入${nextName}，从江湖武者迈入修仙之门。`;
    }
    return `你成功突破，当前已踏入 ${nextName}。`;
  }
}
