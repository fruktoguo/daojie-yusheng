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
  DEFAULT_PLAYER_REALM_STAGE,
  deriveTechniqueRealm,
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
}

const EMPTY_CULTIVATION: CultivationResult = { changed: false, dirty: [], messages: [] };
const REALM_STAGE_SOURCE = 'realm:stage';
const REALM_STATE_SOURCE = 'realm:state';
const TECHNIQUE_SOURCE_PREFIX = 'technique:';
const CULTIVATION_BUFF_ID = 'cultivation:active';
const CULTIVATION_ACTION_ID = 'cultivation:toggle';
const CULTIVATION_BUFF_DURATION = 1;
const CULTIVATION_REALM_EXP_PER_TICK = 2;
const CULTIVATION_TECHNIQUE_EXP_PER_TICK = 10;
const MONSTER_KILL_TECHNIQUE_EXP_MULTIPLIER = 5;

@Injectable()
export class TechniqueService {
  constructor(
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly contentService: ContentService,
    private readonly mapService: MapService,
  ) {}

  /** 初始化玩家境界与功法进度（加载时、持久化前调用） */
  initializePlayerProgression(player: PlayerState): void {
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
      player.hp = player.maxHp;
      return;
    }

    if (player.hp <= 0) {
      player.hp = Math.min(player.maxHp, Math.max(1, previousHp));
    }
  }

  preparePlayerForPersistence(player: PlayerState): void {
    this.initializePlayerProgression(player);
  }

  /** 学习新功法 */
  learnTechnique(
    player: PlayerState,
    techId: string,
    name: string,
    skills: SkillDef[],
    grade?: TechniqueGrade,
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
      realm: deriveTechniqueRealm(1, layers),
      skills,
      grade,
      layers,
    };
    player.techniques.push(technique);
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    return null;
  }

  /** 每 tick 修炼推进：增加境界经验和功法经验 */
  cultivateTick(player: PlayerState): CultivationResult {
    this.initializePlayerProgression(player);
    const technique = this.resolveCultivatingTechnique(player);
    if (!technique) {
      return this.clearInvalidCultivation(player);
    }
    const cultivationBuff = this.getCultivationBuff(player);
    if (!cultivationBuff) return EMPTY_CULTIVATION;
    this.refreshCultivationBuff(cultivationBuff, technique.name);

    const numericStats = this.attrService.getPlayerNumericStats(player);
    const auraMultiplier = this.getCultivationAuraMultiplier(player);
    const realmExpBonus = Math.max(0, numericStats.playerExpRate) / 10000;
    const techniqueExpBonus = Math.max(0, numericStats.techniqueExpRate) / 10000;
    const dirty = new Set<TechniqueDirtyFlag>();
    const messages: TechniqueMessage[] = [];

    const realmResult = this.advanceRealmProgress(
      player,
      Math.max(0, Math.round(numericStats.realmExpPerTick * auraMultiplier)),
      realmExpBonus,
    );
    if (realmResult.changed) {
      dirty.add('attr');
      dirty.add('actions');
      messages.push(...realmResult.messages);
    }

    const techniqueResult = this.advanceTechniqueProgress(
      player,
      Math.max(0, Math.round(numericStats.techniqueExpPerTick * auraMultiplier)),
      techniqueExpBonus,
    );
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
      return EMPTY_CULTIVATION;
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
        return EMPTY_CULTIVATION;
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
    const playerRealmLv = this.getPlayerRealmLv(player);
    const dirty = new Set<TechniqueDirtyFlag>();
    const messages: TechniqueMessage[] = [];
    const realmBaseExp = this.getRealmCombatExp(normalizedMonsterLevel, playerRealmLv, input.expMultiplier, participantCount);

    const realmResult = this.advanceRealmProgress(
      player,
      realmBaseExp,
      realmExpBonus,
    );
    if (realmResult.changed) {
      dirty.add('attr');
      dirty.add('actions');
      messages.push(...realmResult.messages);
    }

    const techniqueResult = this.advanceTechniqueCombatExp(
      player,
      this.getTechniqueCombatExp(realmBaseExp),
      techniqueExpBonus,
    );
    if (techniqueResult.changed) {
      for (const flag of techniqueResult.dirty) {
        dirty.add(flag);
      }
      messages.push(...techniqueResult.messages);
    }

    if (realmResult.gained > 0 || techniqueResult.gained > 0) {
      const segments: string[] = [];
      if (realmResult.gained > 0) {
        segments.push(`获得 ${realmResult.gained} 点境界经验`);
      }
      if (techniqueResult.gained > 0 && techniqueResult.techniqueName) {
        segments.push(`${techniqueResult.techniqueName} 获得 ${techniqueResult.gained} 点功法经验`);
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
    this.initializePlayerProgression(player);
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
    this.initializePlayerProgression(player);
    const realm = player.realm;
    if (!realm?.breakthroughReady || !realm.breakthrough) return null;
    return {
      id: 'realm:breakthrough',
      name: `突破至 ${realm.breakthrough.targetDisplayName}`,
      type: 'breakthrough',
      desc: `当前境界已圆满，点击查看 ${realm.breakthrough.targetDisplayName} 的突破要求。`,
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
    if (!realm.breakthroughReady || !realm.breakthrough) {
      return { error: '你的境界火候未到，尚不能突破', dirty: [], messages: [] };
    }

    const breakthrough = this.resolveBreakthroughRequirements(player, realm.realmLv);
    const unmet = breakthrough.requirements.filter((entry) => entry.blocksBreakthrough && !entry.completed);
    if (unmet.length > 0) {
      return { error: '突破条件尚未满足', dirty: [], messages: [] };
    }

    for (const requirement of breakthrough.requirements) {
      if (requirement.def.type !== 'item' || !requirement.completed) continue;
      this.consumeItem(player, requirement.def.itemId, requirement.def.count);
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

  private advanceRealmProgress(player: PlayerState, baseGain: number, expBonus = 0, minimumGain = 1): { changed: boolean; gained: number; messages: TechniqueMessage[] } {
    const realm = player.realm;
    if (!realm || realm.progressToNext <= 0 || realm.breakthroughReady || baseGain <= 0) {
      return { changed: false, gained: 0, messages: [] };
    }

    const gain = this.applyRateBonus(baseGain, expBonus, minimumGain);
    const previousProgress = realm.progress;
    const nextState = this.normalizeRealmState(realm.realmLv, realm.progress + gain);
    const actualGain = Math.max(0, nextState.progress - previousProgress);

    if (actualGain <= 0 && nextState.breakthroughReady === realm.breakthroughReady) {
      return { changed: false, gained: 0, messages: [] };
    }

    this.syncRealmPresentation(player, nextState);

    const messages: TechniqueMessage[] = [];
    if (nextState.breakthroughReady && !realm.breakthroughReady && nextState.breakthrough) {
      messages.push({
        text: `你的${nextState.displayName}已圆满，可尝试突破至 ${nextState.breakthrough.targetDisplayName}。`,
        kind: 'quest',
      });
    }

    return { changed: true, gained: actualGain, messages };
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

    const technique = this.resolveCultivatingTechnique(player);
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
      return { changed: false, gained: 0, techniqueName: technique.name, dirty: [], messages: [] };
    }

    const gain = this.applyRateBonus(baseGain, expBonus, minimumGain);
    const previousLevel = technique.level;
    const previousExp = technique.exp;
    const messages: TechniqueMessage[] = [];
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
      return { changed: false, gained: 0, techniqueName: technique.name, dirty: [], messages: [] };
    }

    const dirty = new Set<TechniqueDirtyFlag>(['tech']);
    if (technique.level !== previousLevel) {
      this.applyTechniqueBonuses(player);
      this.attrService.recalcPlayer(player);
      dirty.add('attr');
      dirty.add('actions');
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

  private getCultivationBuff(player: PlayerState): TemporaryBuffState | undefined {
    return player.temporaryBuffs?.find((buff) => buff.buffId === CULTIVATION_BUFF_ID);
  }

  private getCultivationAuraMultiplier(player: PlayerState): number {
    const aura = this.mapService.getTileAura(player.mapId, player.x, player.y);
    return 1 + Math.max(0, aura);
  }

  private buildCultivationBuffState(techniqueName: string): TemporaryBuffState {
    return {
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: `${techniqueName} 正在运转，每息获得境界与功法经验，移动、主动攻击或受击都会打断修炼。`,
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
        techniqueExpPerTick: CULTIVATION_TECHNIQUE_EXP_PER_TICK,
      },
    };
  }

  private refreshCultivationBuff(buff: TemporaryBuffState, techniqueName: string): void {
    buff.name = '修炼中';
    buff.desc = `${techniqueName} 正在运转，每息获得境界与功法经验，移动、主动攻击或受击都会打断修炼。`;
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
      techniqueExpPerTick: CULTIVATION_TECHNIQUE_EXP_PER_TICK,
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
      return EMPTY_CULTIVATION;
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

  private getTechniqueCombatExp(realmCombatExp: number): number {
    return realmCombatExp * MONSTER_KILL_TECHNIQUE_EXP_MULTIPLIER;
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
    };
    player.realm = nextRealm;
    player.realmLv = nextRealm.realmLv;
    player.realmName = nextRealm.name;
    player.realmStage = nextRealm.shortName || undefined;
    player.realmReview = nextRealm.review;
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
    const config = this.getBreakthroughConfig(realm.realmLv);
    const resolved = this.resolveBreakthroughRequirements(player, realm.realmLv);
    const requirements = resolved.requirements.map((entry) => entry.view);
    const targetEntry = this.contentService.getRealmLevelEntry(config.toRealmLv);
    return {
      targetRealmLv: config.toRealmLv,
      targetDisplayName: targetEntry?.displayName ?? `realmLv ${config.toRealmLv}`,
      totalRequirements: resolved.blockingRequirements,
      completedRequirements: resolved.completedBlockingRequirements,
      allCompleted: resolved.canBreakthrough,
      canBreakthrough: resolved.canBreakthrough,
      blockingRequirements: resolved.blockingRequirements,
      completedBlockingRequirements: resolved.completedBlockingRequirements,
      requirements,
    };
  }

  private resolveBreakthroughRequirements(
    player: PlayerState,
    fromRealmLv: number,
  ): {
    requirements: ResolvedBreakthroughRequirement[];
    canBreakthrough: boolean;
    blockingRequirements: number;
    completedBlockingRequirements: number;
  } {
    const config = this.getBreakthroughConfig(fromRealmLv);
    const revealed = new Set(player.revealedBreakthroughRequirementIds ?? []);
    const reductionMultiplier = config.requirements.reduce((multiplier, def) => {
      if (!this.isOptionalBreakthroughReducer(def) || !this.isBreakthroughRequirementCompleted(player, def)) {
        return multiplier;
      }
      const reductionRate = this.getRequirementReductionRate(def);
      return multiplier * (1 - reductionRate);
    }, 1);
    const requirements = config.requirements.map((def) => {
      const blocksBreakthrough = this.doesRequirementBlockBreakthrough(def);
      const completed = this.isBreakthroughRequirementCompleted(player, def, reductionMultiplier);
      const hidden = def.hidden === true && !completed && !revealed.has(def.id);
      const view = this.buildBreakthroughRequirementView(player, def, {
        hidden,
        completed,
        reductionMultiplier,
        blocksBreakthrough,
      });
      return { def, completed, blocksBreakthrough, view };
    });
    const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough).length;
    const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough && entry.completed).length;
    return {
      requirements,
      canBreakthrough: blockingRequirements === completedBlockingRequirements,
      blockingRequirements,
      completedBlockingRequirements,
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
    reductionMultiplier = 1,
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
        return currentValue >= this.getEffectiveAttributeRequirement(requirement.minValue, reductionMultiplier);
      }
      default:
        return false;
    }
  }

  private doesRequirementBlockBreakthrough(requirement: BreakthroughRequirementDef): boolean {
    if (requirement.type === 'attribute') {
      return true;
    }
    return !this.isOptionalBreakthroughReducer(requirement);
  }

  private isOptionalBreakthroughReducer(requirement: BreakthroughRequirementDef): boolean {
    return (requirement.type === 'item' || requirement.type === 'technique')
      && this.getRequirementReductionPct(requirement) > 0;
  }

  private getRequirementReductionPct(requirement: BreakthroughRequirementDef): number {
    if (requirement.type !== 'item' && requirement.type !== 'technique') {
      return 0;
    }
    return Math.max(0, Math.min(95, Math.floor(requirement.reduceAttrRequirementPct ?? 0)));
  }

  private getRequirementReductionRate(requirement: BreakthroughRequirementDef): number {
    return this.getRequirementReductionPct(requirement) / 100;
  }

  private getEffectiveAttributeRequirement(baseValue: number, reductionMultiplier: number): number {
    return Math.max(1, Math.ceil(baseValue * Math.max(0.05, reductionMultiplier)));
  }

  private buildBreakthroughRequirementView(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    options: {
      hidden: boolean;
      completed: boolean;
      reductionMultiplier: number;
      blocksBreakthrough: boolean;
    },
  ): BreakthroughRequirementView {
    const { hidden, completed, reductionMultiplier, blocksBreakthrough } = options;
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
      label: this.formatBreakthroughRequirementLabel(requirement, reductionMultiplier),
      completed,
      hidden,
      optional: !blocksBreakthrough,
      blocksBreakthrough,
      detail: this.formatBreakthroughRequirementDetail(player, requirement, completed, reductionMultiplier, blocksBreakthrough),
    };
  }

  private formatBreakthroughRequirementLabel(requirement: BreakthroughRequirementDef, reductionMultiplier = 1): string {
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
        const effectiveValue = this.getEffectiveAttributeRequirement(requirement.minValue, reductionMultiplier);
        return `${this.attrLabel(requirement.attr)}达到 ${effectiveValue}（基础 ${requirement.minValue}）`;
      }
      default:
        return '???';
    }
  }

  private formatBreakthroughRequirementDetail(
    player: PlayerState,
    requirement: BreakthroughRequirementDef,
    completed: boolean,
    reductionMultiplier: number,
    blocksBreakthrough: boolean,
  ): string {
    if (requirement.type === 'attribute') {
      const currentValue = player.finalAttrs?.[requirement.attr] ?? player.baseAttrs[requirement.attr] ?? 0;
      const effectiveValue = this.getEffectiveAttributeRequirement(requirement.minValue, reductionMultiplier);
      const reducedPercent = Math.max(0, Math.round((1 - reductionMultiplier) * 100));
      return reducedPercent > 0
        ? `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${effectiveValue}，基础要求 ${requirement.minValue}，已乘算减免 ${reducedPercent}%`
        : `当前${this.attrLabel(requirement.attr)} ${currentValue} / ${effectiveValue}，基础要求 ${requirement.minValue}`;
    }
    if (this.isOptionalBreakthroughReducer(requirement)) {
      const reductionPct = this.getRequirementReductionPct(requirement);
      if (requirement.type === 'item') {
        return completed
          ? `当前已生效，突破成功后会消耗该材料，并将全部属性要求按乘算降低 ${reductionPct}%`
          : `当前未生效；若备齐该材料，突破时会消耗，并将全部属性要求按乘算降低 ${reductionPct}%`;
      }
      return completed
        ? `当前已生效，已将全部属性要求按乘算降低 ${reductionPct}%`
        : `当前未生效；若满足该功法条件，可将全部属性要求按乘算降低 ${reductionPct}%`;
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
    const nextBonuses = player.bonuses.filter((bonus) => !bonus.source.startsWith(TECHNIQUE_SOURCE_PREFIX));
    const attrs = calcTechniqueFinalAttrBonus(player.techniques);
    if (Object.values(attrs).some((value) => value > 0)) {
      nextBonuses.push({
        source: `${TECHNIQUE_SOURCE_PREFIX}aggregate`,
        label: '功法总池',
        attrs,
      });
    }
    player.bonuses = nextBonuses;
  }

  private syncTechniqueMetadata(player: PlayerState): void {
    for (const technique of player.techniques) {
      const template = this.contentService.getTechnique(technique.techId);
      if (!template) continue;
      technique.name = template.name;
      technique.grade = template.grade;
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
