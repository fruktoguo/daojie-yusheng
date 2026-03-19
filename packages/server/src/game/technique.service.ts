import { Injectable } from '@nestjs/common';
import {
  ActionDef,
  AttrBonus,
  Attributes,
  CULTIVATE_EXP_PER_TICK,
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_CONFIG,
  PLAYER_REALM_ORDER,
  PlayerRealmStage,
  PlayerRealmState,
  PlayerState,
  TECHNIQUE_EXP_TABLE,
  TechniqueRealm,
  TechniqueState,
  SkillDef,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';

type TechniqueDirtyFlag = 'inv' | 'tech' | 'attr' | 'actions';
type TechniqueMessageKind = 'system' | 'quest' | 'combat' | 'loot';

interface TechniqueMessage {
  text: string;
  kind?: TechniqueMessageKind;
}

interface CultivationResult {
  changed: boolean;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

interface BreakthroughResult {
  error?: string;
  dirty: TechniqueDirtyFlag[];
  messages: TechniqueMessage[];
}

const EMPTY_CULTIVATION: CultivationResult = { changed: false, dirty: [], messages: [] };
const REALM_STAGE_SOURCE = 'realm:stage';
const REALM_STATE_SOURCE = 'realm:state';
const TECHNIQUE_SOURCE_PREFIX = 'technique:';

@Injectable()
export class TechniqueService {
  constructor(
    private readonly attrService: AttrService,
    private readonly inventoryService: InventoryService,
    private readonly contentService: ContentService,
  ) {}

  initializePlayerProgression(player: PlayerState): void {
    const previousHp = player.hp;
    const previousMaxHp = player.maxHp;
    const persisted = this.readPersistedRealmState(player);
    const stage = persisted.stage ?? player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const progress = persisted.progress ?? player.realm?.progress ?? 0;
    const normalized = this.createRealmState(stage, progress);
    player.realm = normalized;
    player.realmName = normalized.name;
    player.realmStage = normalized.shortName;
    player.breakthroughReady = normalized.breakthroughReady;

    this.syncTechniqueMetadata(player);
    this.applyRealmBonus(player, normalized);
    this.applyTechniqueBonuses(player);
    this.applyRealmStateMirror(player, normalized);
    this.attrService.recalcPlayer(player);

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

  learnTechnique(player: PlayerState, techId: string, name: string, skills: SkillDef[], attrGrowth?: Partial<Attributes>): string | null {
    this.initializePlayerProgression(player);
    if (player.techniques.find((entry) => entry.techId === techId)) {
      return '已学会该功法';
    }

    const technique: TechniqueState = {
      techId,
      name,
      level: 1,
      exp: 0,
      expToNext: TECHNIQUE_EXP_TABLE[TechniqueRealm.Entry],
      realm: TechniqueRealm.Entry,
      skills,
      attrGrowth,
    };
    player.techniques.push(technique);
    this.applyTechniqueBonuses(player);
    this.attrService.recalcPlayer(player);
    return null;
  }

  cultivateTick(player: PlayerState): CultivationResult {
    this.initializePlayerProgression(player);
    if (!player.cultivatingTechId) return EMPTY_CULTIVATION;
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const techniqueExpBonus = Math.max(0, numericStats.techniqueExpRate) / 10000;
    const realmExpBonus = Math.max(0, numericStats.playerExpRate) / 10000;

    const technique = player.techniques.find((entry) => entry.techId === player.cultivatingTechId);
    if (!technique) {
      player.cultivatingTechId = undefined;
      return {
        changed: true,
        dirty: ['tech', 'actions'],
        messages: [{ text: '当前修炼的功法不存在，已停止修炼。', kind: 'system' }],
      };
    }

    const dirty = new Set<TechniqueDirtyFlag>(['tech']);
    const messages: TechniqueMessage[] = [];
    let techniqueLeveledUp = false;

    if (technique.realm !== TechniqueRealm.Perfection && technique.expToNext > 0) {
      technique.exp += this.applyRateBonus(CULTIVATE_EXP_PER_TICK, techniqueExpBonus);
      while (technique.expToNext > 0 && technique.exp >= technique.expToNext && technique.realm !== TechniqueRealm.Perfection) {
        technique.exp -= technique.expToNext;
        technique.level += 1;
        technique.realm += 1;
        technique.expToNext = TECHNIQUE_EXP_TABLE[technique.realm] ?? 0;
        techniqueLeveledUp = true;
        messages.push({
          text: `${technique.name} 突破至${this.techniqueRealmLabel(technique.realm)}。`,
          kind: 'quest',
        });
        dirty.add('actions');
      }
    }

    if (techniqueLeveledUp) {
      this.applyTechniqueBonuses(player);
      this.attrService.recalcPlayer(player);
      dirty.add('attr');
    }

    const realmProgress = this.advanceRealmProgress(player, technique, realmExpBonus);
    if (realmProgress.changed) {
      dirty.add('attr');
      dirty.add('actions');
      messages.push(...realmProgress.messages);
    }

    return {
      changed: dirty.size > 0,
      dirty: [...dirty],
      messages,
    };
  }

  getSkillActions(player: PlayerState): ActionDef[] {
    this.initializePlayerProgression(player);
    const playerRealmStage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const actions: ActionDef[] = [];

    for (const technique of player.techniques) {
      for (const skill of technique.skills) {
        const unlockPlayerRealm = skill.unlockPlayerRealm ?? DEFAULT_PLAYER_REALM_STAGE;
        if (technique.realm < skill.unlockRealm || playerRealmStage < unlockPlayerRealm) {
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

  getBreakthroughAction(player: PlayerState): ActionDef | null {
    this.initializePlayerProgression(player);
    const realm = player.realm;
    if (!realm?.breakthroughReady || realm.nextStage === undefined) return null;

    const nextConfig = PLAYER_REALM_CONFIG[realm.nextStage];
    const requirementText = realm.breakthroughItems
      .map((entry) => {
        const name = this.contentService.getItem(entry.itemId)?.name ?? entry.itemId;
        return `${name} x${entry.count}`;
      })
      .join('、');

    return {
      id: 'realm:breakthrough',
      name: `突破至 ${nextConfig.shortName}`,
      type: 'breakthrough',
      desc: requirementText
        ? `满足修行条件，可消耗 ${requirementText} 冲击下一境。`
        : '满足修行条件，可直接冲击下一境。',
      cooldownLeft: 0,
    };
  }

  attemptBreakthrough(player: PlayerState): BreakthroughResult {
    this.initializePlayerProgression(player);
    const realm = player.realm;
    if (!realm) {
      return { error: '当前境界状态异常', dirty: [], messages: [] };
    }
    if (!realm.breakthroughReady || realm.nextStage === undefined) {
      return { error: '你的境界火候未到，尚不能突破', dirty: [], messages: [] };
    }

    const techniqueGateError = this.validateTechniqueGate(player, realm);
    if (techniqueGateError) {
      return { error: techniqueGateError, dirty: [], messages: [] };
    }

    const missing = realm.breakthroughItems
      .filter((entry) => this.getInventoryCount(player, entry.itemId) < entry.count)
      .map((entry) => `${this.contentService.getItem(entry.itemId)?.name ?? entry.itemId} x${entry.count}`);
    if (missing.length > 0) {
      return {
        error: `突破所需材料不足：${missing.join('、')}`,
        dirty: [],
        messages: [],
      };
    }

    for (const requirement of realm.breakthroughItems) {
      this.consumeItem(player, requirement.itemId, requirement.count);
    }

    const nextState = this.createRealmState(realm.nextStage, 0);
    player.realm = nextState;
    player.realmName = nextState.name;
    player.realmStage = nextState.shortName;
    player.breakthroughReady = nextState.breakthroughReady;
    this.applyRealmBonus(player, nextState);
    this.attrService.recalcPlayer(player);
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);

    return {
      dirty: ['inv', 'attr', 'actions', 'tech'],
      messages: [{
        text: this.buildBreakthroughMessage(realm.stage, nextState.stage, nextState.name),
        kind: 'quest',
      }],
    };
  }

  private advanceRealmProgress(player: PlayerState, technique: TechniqueState, expBonus = 0): { changed: boolean; messages: TechniqueMessage[] } {
    const realm = player.realm;
    if (!realm || realm.breakthroughReady || realm.progressToNext <= 0) {
      return { changed: false, messages: [] };
    }

    const baseGain = 1 + technique.realm + Math.floor(technique.level / 3);
    const gain = this.applyRateBonus(baseGain, expBonus);
    const previousProgress = realm.progress;
    realm.progress = Math.min(realm.progressToNext, realm.progress + gain);
    realm.breakthroughReady = realm.progress >= realm.progressToNext;
    player.breakthroughReady = realm.breakthroughReady;

    if (realm.progress === previousProgress) {
      return { changed: false, messages: [] };
    }

    const messages: TechniqueMessage[] = [];
    if (realm.breakthroughReady) {
      const nextName = realm.nextStage !== undefined
        ? PLAYER_REALM_CONFIG[realm.nextStage].name
        : '更高境界';
      messages.push({
        text: `你的${realm.name}已圆满，可尝试突破至 ${nextName}。`,
        kind: 'quest',
      });
    }

    return { changed: true, messages };
  }

  private applyRateBonus(base: number, bonusRate: number): number {
    const exactGain = Math.max(1, base * (1 + Math.max(0, bonusRate)));
    const guaranteed = Math.floor(exactGain);
    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
      return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
  }

  private validateTechniqueGate(player: PlayerState, realm: PlayerRealmState): string | null {
    const highest = this.getHighestTechnique(player);
    if (!highest) {
      return '至少需要掌握一门功法才能冲境';
    }
    if (highest.level < realm.minTechniqueLevel) {
      return `至少需要一门功法达到 ${realm.minTechniqueLevel} 级`;
    }
    if (realm.minTechniqueRealm !== undefined && highest.realm < realm.minTechniqueRealm) {
      return `至少需要一门功法达到${this.techniqueRealmLabel(realm.minTechniqueRealm)}`;
    }
    return null;
  }

  private createRealmState(stage: PlayerRealmStage, progress = 0): PlayerRealmState {
    const config = PLAYER_REALM_CONFIG[stage];
    const index = PLAYER_REALM_ORDER.indexOf(stage);
    const nextStage = index >= 0 && index < PLAYER_REALM_ORDER.length - 1
      ? PLAYER_REALM_ORDER[index + 1]
      : undefined;
    const cappedProgress = config.progressToNext > 0
      ? Math.min(progress, config.progressToNext)
      : 0;

    return {
      stage,
      name: config.name,
      shortName: config.shortName,
      path: config.path,
      narrative: config.narrative,
      progress: cappedProgress,
      progressToNext: config.progressToNext,
      breakthroughReady: config.progressToNext > 0 ? cappedProgress >= config.progressToNext : false,
      nextStage,
      breakthroughItems: config.breakthroughItems.map((entry) => ({ ...entry })),
      minTechniqueLevel: config.minTechniqueLevel,
      minTechniqueRealm: config.minTechniqueRealm,
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
        progress: realm.progress,
      },
    });
  }

  private readPersistedRealmState(player: PlayerState): { stage?: PlayerRealmStage; progress?: number } {
    const mirrored = player.bonuses.find((bonus) => bonus.source === REALM_STATE_SOURCE);
    const stage = mirrored?.meta?.stage;
    const progress = mirrored?.meta?.progress;
    return {
      stage: typeof stage === 'number' ? stage as PlayerRealmStage : undefined,
      progress: typeof progress === 'number' ? progress : undefined,
    };
  }

  private applyTechniqueBonuses(player: PlayerState): void {
    const nextBonuses = player.bonuses.filter((bonus) => !bonus.source.startsWith(TECHNIQUE_SOURCE_PREFIX));
    for (const technique of player.techniques) {
      const growth = technique.attrGrowth ?? this.contentService.getTechnique(technique.techId)?.attrGrowth;
      if (!growth) continue;
      const attrs = this.scaleTechniqueAttrGrowth(growth, technique.level);
      if (!Object.values(attrs).some((value) => value > 0)) continue;
      nextBonuses.push({
        source: `${TECHNIQUE_SOURCE_PREFIX}${technique.techId}`,
        label: `${technique.name} ${technique.level} 层`,
        attrs,
      });
    }
    player.bonuses = nextBonuses;
  }

  private syncTechniqueMetadata(player: PlayerState): void {
    for (const technique of player.techniques) {
      const template = this.contentService.getTechnique(technique.techId);
      if (!template) continue;
      technique.attrGrowth = template.attrGrowth;
    }
  }

  private scaleTechniqueAttrGrowth(base: Partial<Attributes>, level: number): AttrBonus['attrs'] {
    return {
      constitution: (base.constitution ?? 0) * level,
      spirit: (base.spirit ?? 0) * level,
      perception: (base.perception ?? 0) * level,
      talent: (base.talent ?? 0) * level,
      comprehension: (base.comprehension ?? 0) * level,
      luck: (base.luck ?? 0) * level,
    };
  }

  private getHighestTechnique(player: PlayerState): TechniqueState | undefined {
    return [...player.techniques].sort((left, right) => {
      if (right.realm !== left.realm) return right.realm - left.realm;
      return right.level - left.level;
    })[0];
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
