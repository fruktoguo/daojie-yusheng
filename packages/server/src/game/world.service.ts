/**
 * 世界服务 —— 游戏核心逻辑的编排层。
 * 负责战斗结算、技能释放、NPC 交互、任务推进、怪物 AI、
 * 自动战斗、传送、观察系统等所有与"世界规则"相关的行为。
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ActionDef,
  Attributes,
  calcQiCostWithOutputLimit,
  CombatEffect,
  computeAffectedCellsFromAnchor,
  createItemStackSignature,
  createNumericStats,
  DEFAULT_RATIO_DIVISOR,
  distanceSquared,
  Direction,
  ElementKey,
  GameTimeState,
  getDamageTrailColor,
  getRealmGapDamageMultiplier,
  isPointInRange,
  ItemStack,
  NumericRatioDivisors,
  NumericStats,
  NpcQuestMarker,
  ObservationInsight,
  parseTileTargetRef,
  PlayerState,
  PlayerRealmStage,
  Portal,
  QuestState,
  RenderEntity,
  ratioValue,
  SkillDef,
  SkillDamageKind,
  SkillEffectDef,
  SkillFormula,
  SkillFormulaVar,
  TemporaryBuffState,
  VisibleBuffState,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { AoiService } from './aoi.service';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { LootService } from './loot.service';
import { DropConfig, MapService, MonsterSpawnConfig, NpcConfig, QuestConfig } from './map.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';
import { isLikelyInternalContentId, resolveQuestTargetName } from './quest-display';
import { TechniqueService } from './technique.service';
import { TimeService } from './time.service';

type MessageKind = 'system' | 'quest' | 'combat' | 'loot';
type WorldDirtyFlag = 'inv' | 'quest' | 'actions' | 'tech' | 'attr' | 'loot';

interface RuntimeMonster extends MonsterSpawnConfig {
  runtimeId: string;
  mapId: string;
  spawnX: number;
  spawnY: number;
  hp: number;
  alive: boolean;
  respawnLeft: number;
  temporaryBuffs: TemporaryBuffState[];
  damageContributors: Map<string, number>;
  targetPlayerId?: string;
}

interface NpcInteractionState {
  quest?: QuestConfig;
  questState?: QuestState;
}

interface ObservationTargetSnapshot {
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  spirit: number;
  stats: NumericStats;
  ratios: NumericRatioDivisors;
  attrs?: Attributes;
  realmLabel?: string;
}

interface ObservationLineSpec {
  threshold: number;
  label: string;
  value: string;
}

interface NpcPresenceProfile {
  title: string;
  spirit: number;
  hp: number;
  qi: number;
}

/** tick 中产生的消息，最终推送给对应玩家 */
export interface WorldMessage {
  playerId: string;
  text: string;
  kind?: MessageKind;
  floating?: {
    x: number;
    y: number;
    text: string;
    color?: string;
  };
}

/** 世界逻辑执行结果，包含错误、消息、脏标记等 */
export interface WorldUpdate {
  error?: string;
  messages: WorldMessage[];
  dirty: WorldDirtyFlag[];
  dirtyPlayers?: string[];
  usedActionId?: string;
  consumedAction?: boolean;
}

const EMPTY_UPDATE: WorldUpdate = { messages: [], dirty: [] };
const DEFAULT_MONSTER_RATIO_DIVISORS: NumericRatioDivisors = {
  dodge: DEFAULT_RATIO_DIVISOR,
  crit: DEFAULT_RATIO_DIVISOR,
  breakPower: DEFAULT_RATIO_DIVISOR,
  resolvePower: DEFAULT_RATIO_DIVISOR,
  cooldownSpeed: DEFAULT_RATIO_DIVISOR,
  moveSpeed: DEFAULT_RATIO_DIVISOR,
  elementDamageReduce: {
    metal: DEFAULT_RATIO_DIVISOR,
    wood: DEFAULT_RATIO_DIVISOR,
    water: DEFAULT_RATIO_DIVISOR,
    fire: DEFAULT_RATIO_DIVISOR,
    earth: DEFAULT_RATIO_DIVISOR,
  },
};
const OBSERVATION_FULL_RATIO = 1.2;
const OBSERVATION_BLIND_RATIO = 0.2;
const NPC_ROLE_PROFILES: Record<string, { title: string; spirit: number; hp: number; qi: number }> = {
  quest_giver: { title: '引路前辈', spirit: 30, hp: 96, qi: 132 },
  support: { title: '养脉修者', spirit: 26, hp: 82, qi: 120 },
  craft: { title: '炉火匠人', spirit: 18, hp: 108, qi: 74 },
  lore: { title: '守卷旧识', spirit: 28, hp: 72, qi: 118 },
  quest_hint: { title: '路引修者', spirit: 14, hp: 64, qi: 52 },
  warning: { title: '示警修士', spirit: 16, hp: 70, qi: 58 },
  scene: { title: '器物残痕', spirit: 2, hp: 44, qi: 0 },
};

interface CombatSnapshot {
  stats: NumericStats;
  ratios: NumericRatioDivisors;
  realmLv: number;
}

interface ResolvedHit {
  hit: boolean;
  damage: number;
  crit: boolean;
  dodged: boolean;
  resolved: boolean;
  broken: boolean;
  qiCost: number;
}

type ResolvedTarget =
  | { kind: 'monster'; x: number; y: number; monster: RuntimeMonster }
  | { kind: 'player'; x: number; y: number; player: PlayerState }
  | { kind: 'tile'; x: number; y: number; tileType?: string };

interface SkillFormulaContext {
  player: PlayerState;
  skill: SkillDef;
  techLevel: number;
  targetCount: number;
  casterStats: NumericStats;
  target?: ResolvedTarget;
  targetStats?: NumericStats;
}

type BuffTargetEntity =
  | { kind: 'player'; player: PlayerState }
  | { kind: 'monster'; monster: RuntimeMonster };

@Injectable()
export class WorldService {
  private readonly monstersByMap = new Map<string, RuntimeMonster[]>();
  private readonly effectsByMap = new Map<string, CombatEffect[]>();
  private readonly logger = new Logger(WorldService.name);

  constructor(
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly navigationService: NavigationService,
    private readonly techniqueService: TechniqueService,
    private readonly attrService: AttrService,
    private readonly playerService: PlayerService,
    private readonly aoiService: AoiService,
    private readonly lootService: LootService,
    private readonly timeService: TimeService,
  ) {}

  /** 获取玩家视野内的可见实体（容器、NPC、怪物） */
  getVisibleEntities(player: PlayerState, visibleKeys: Set<string>): RenderEntity[] {
    return this.getVisibleEntitiesForMap(player, player.mapId, visibleKeys);
  }

  /** 获取父地图上投影到当前地图视野内的可见实体 */
  getProjectedVisibleEntities(player: PlayerState, sourceMapId: string, visibleKeys: Set<string>): RenderEntity[] {
    return this.getVisibleEntitiesForMap(player, sourceMapId, visibleKeys, (x, y) => {
      const projected = this.mapService.projectPointToMap(player.mapId, sourceMapId, x, y);
      if (!projected) {
        return null;
      }
      if (this.mapService.isPointInMapBounds(player.mapId, projected.x, projected.y)) {
        return null;
      }
      return projected;
    });
  }

  private getVisibleEntitiesForMap(
    viewer: PlayerState,
    sourceMapId: string,
    visibleKeys: Set<string>,
    projectPoint?: (x: number, y: number) => { x: number; y: number } | null,
  ): RenderEntity[] {
    this.ensureMapInitialized(sourceMapId);

    const resolvePoint = (x: number, y: number): { x: number; y: number } | null => {
      const projected = projectPoint ? projectPoint(x, y) : { x, y };
      if (!projected) {
        return null;
      }
      return visibleKeys.has(`${projected.x},${projected.y}`) ? projected : null;
    };

    const containers = this.mapService.getContainers(sourceMapId)
      .flatMap<RenderEntity>((container) => {
        const projected = resolvePoint(container.x, container.y);
        if (!projected) {
          return [];
        }
        return [{
          id: `container:${sourceMapId}:${container.id}`,
          x: projected.x,
          y: projected.y,
          char: '箱',
          color: '#c18b46',
          name: container.name,
          kind: 'container',
          observation: {
            clarity: 'clear',
            verdict: '这是一口可搜索的箱具，翻找后或许会有收获。',
            lines: [
              { label: '类别', value: '可搜索容器' },
              { label: '搜索阶次', value: `${container.grade}` },
            ],
          },
        }];
      });

    const npcs = this.mapService.getNpcs(sourceMapId)
      .flatMap<RenderEntity>((npc) => {
        const projected = resolvePoint(npc.x, npc.y);
        if (!projected) {
          return [];
        }
        return [{
          ...this.buildNpcRenderEntity(viewer, npc, sourceMapId),
          x: projected.x,
          y: projected.y,
        }];
      });

    const monsters = (this.monstersByMap.get(sourceMapId) ?? [])
      .flatMap<RenderEntity>((monster) => {
        if (!monster.alive) {
          return [];
        }
        const projected = resolvePoint(monster.x, monster.y);
        if (!projected) {
          return [];
        }
        return [{
          ...this.buildMonsterRenderEntity(viewer, monster),
          x: projected.x,
          y: projected.y,
        }];
      });

    return [...containers, ...npcs, ...monsters];
  }

  /** 地图重载时重建运行时怪物实例 */
  reloadMapRuntime(mapId: string): void {
    const monsters = this.monstersByMap.get(mapId) ?? [];
    for (const monster of monsters) {
      if (this.mapService.hasOccupant(mapId, monster.x, monster.y, monster.runtimeId)) {
        this.mapService.removeOccupant(mapId, monster.x, monster.y, monster.runtimeId);
      }
    }
    this.monstersByMap.delete(mapId);
    this.effectsByMap.delete(mapId);
    this.ensureMapInitialized(mapId);
  }

  /** 构建玩家的渲染实体数据（用于其他玩家视野中的显示） */
  buildPlayerRenderEntity(viewer: PlayerState, target: PlayerState, color: string): RenderEntity {
    const snapshot = this.createPlayerObservationSnapshot(target);
    const displayName = target.displayName ?? [...target.name][0] ?? '@';
    return {
      id: target.id,
      x: target.x,
      y: target.y,
      char: displayName,
      color,
      name: target.name,
      kind: 'player',
      hp: target.hp,
      maxHp: target.maxHp,
      qi: target.qi,
      maxQi: snapshot.maxQi,
      buffs: this.getRenderableBuffs(target.temporaryBuffs),
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        this.buildObservationLineSpecs(snapshot, true),
        viewer.id === target.id,
      ),
    };
  }

  /** 根据玩家当前位置和状态，构建可用的上下文行动列表 */
  getContextActions(player: PlayerState): ActionDef[] {
    this.syncQuestState(player);
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);

    const actions: ActionDef[] = [{
      id: 'toggle:auto_battle',
      name: player.autoBattle ? '停止自动战斗' : '开启自动战斗',
      type: 'toggle',
      desc: player.autoBattle ? '停止自动追击与释放技能。' : '自动追击附近妖兽并释放技能。',
      cooldownLeft: 0,
    }, {
      id: 'toggle:auto_retaliate',
      name: player.autoRetaliate === false ? '受击不开战' : '受击自动开战',
      type: 'toggle',
      desc: player.autoRetaliate === false ? '被攻击时不会自动开启自动战斗。' : '被攻击时自动开启自动战斗。',
      cooldownLeft: 0,
    }, {
      id: 'toggle:auto_idle_cultivation',
      name: player.autoIdleCultivation === false ? '闲置自动修炼已关' : '闲置自动修炼已开',
      type: 'toggle',
      desc: player.autoIdleCultivation === false
        ? '关闭后，角色闲置 60 息也不会自动开始修炼。'
        : '开启后，无行为和移动持续 60 息会自动开始修炼。',
      cooldownLeft: 0,
    }, {
      id: 'cultivation:toggle',
      name: this.techniqueService.hasCultivationBuff(player) ? '停止修炼' : '开始修炼',
      type: 'toggle',
      desc: player.cultivatingTechId
        ? (this.techniqueService.hasCultivationBuff(player)
          ? '收束当前运转的气机，停止修炼。'
          : '运转当前主修功法，每息获得境界与功法经验。')
        : '需先在功法面板选择主修功法，才能开始修炼。',
      cooldownLeft: 0,
    }, {
      id: 'sense_qi:toggle',
      name: player.senseQiActive ? '关闭感气视角' : '施展感气决',
      type: 'toggle',
      desc: player.senseQiActive
        ? '收束神识回响，退出感气视角。'
        : '展开感气视角，直接感知地块灵气浓淡与具体数值。',
      cooldownLeft: 0,
    }, {
      id: 'battle:force_attack',
      name: '强制攻击',
      type: 'toggle',
      desc: '指定任意目标为攻击目标，并开启自动战斗持续追击。',
      cooldownLeft: 0,
      requiresTarget: true,
      targetMode: 'any',
      range: effectiveViewRange,
    }];

    const breakthroughAction = this.techniqueService.getBreakthroughAction(player);
    if (breakthroughAction) {
      actions.push(breakthroughAction);
    }

    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (portal && !portal.hidden) {
      const targetMap = this.mapService.getMapMeta(portal.targetMapId);
      actions.push({
        id: 'portal:travel',
        name: `传送至：${targetMap?.name ?? portal.targetMapId}`,
        type: 'travel',
        desc: targetMap
          ? `踏入对应界门，前往 ${targetMap.name} 的传送阵。`
          : '穿过传送阵前往下一张地图。',
        cooldownLeft: 0,
      });
    }

    for (const npc of this.getAdjacentNpcs(player)) {
      const interaction = this.getNpcInteractionState(player, npc);
      let name = `交谈：${npc.name}`;
      let desc = npc.dialogue;
      let type: ActionDef['type'] = 'interact';

      if (interaction.quest && !interaction.questState) {
        name = `接取：${interaction.quest.title}`;
        desc = interaction.quest.desc;
        type = 'quest';
      } else if (interaction.questState?.status === 'ready') {
        name = `交付：${interaction.questState.title}`;
        desc = interaction.questState.rewardText;
        type = 'quest';
      } else if (interaction.questState?.status === 'active') {
        name = `任务：${interaction.questState.title}`;
        desc = this.describeQuestProgress(interaction.questState, interaction.quest);
        type = 'quest';
      }

      actions.push({
        id: `npc:${npc.id}`,
        name,
        type,
        desc,
        cooldownLeft: 0,
      });
    }

    return actions;
  }

  /** 处理无目标交互（开关自动战斗、传送、NPC 对话等） */
  handleInteraction(player: PlayerState, actionId: string): WorldUpdate {
    if (actionId === 'battle:engage') {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }

    if (actionId === 'toggle:auto_battle') {
      player.autoBattle = !player.autoBattle;
      if (!player.autoBattle) {
        this.clearCombatTarget(player);
      }
      if (player.autoBattle) {
        this.navigationService.clearMoveTarget(player.id);
      }
      return {
        messages: [{
          playerId: player.id,
          text: player.autoBattle ? '已开启自动战斗。' : '已关闭自动战斗。',
          kind: 'combat',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'toggle:auto_retaliate') {
      player.autoRetaliate = player.autoRetaliate === false ? true : false;
      return {
        messages: [{
          playerId: player.id,
          text: player.autoRetaliate ? '已开启受击自动开战。' : '已关闭受击自动开战。',
          kind: 'combat',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'toggle:auto_idle_cultivation') {
      player.autoIdleCultivation = player.autoIdleCultivation === false ? true : false;
      player.idleTicks = 0;
      return {
        messages: [{
          playerId: player.id,
          text: player.autoIdleCultivation ? '已开启闲置自动修炼。' : '已关闭闲置自动修炼。',
          kind: 'quest',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'cultivation:toggle') {
      const result = this.techniqueService.hasCultivationBuff(player)
        ? this.techniqueService.stopCultivation(player)
        : this.techniqueService.startCultivation(player);
      return {
        error: result.error,
        messages: result.messages.map((message) => ({
          playerId: player.id,
          text: message.text,
          kind: message.kind,
        })),
        dirty: result.dirty,
      };
    }

    if (actionId === 'sense_qi:toggle') {
      player.senseQiActive = player.senseQiActive === true ? false : true;
      return {
        messages: [{
          playerId: player.id,
          text: player.senseQiActive ? '你运起感气决，视野中诸地灵气浓淡尽显。' : '你收束感气决，周遭灵光重新隐去。',
          kind: 'system',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'portal:travel') {
      return this.handlePortalTravel(player);
    }

    if (actionId === 'realm:breakthrough') {
      const result = this.techniqueService.attemptBreakthrough(player);
      return {
        error: result.error,
        messages: result.messages.map((message) => ({
          playerId: player.id,
          text: message.text,
          kind: message.kind,
        })),
        dirty: result.dirty,
      };
    }

    if (!actionId.startsWith('npc:')) {
      return { ...EMPTY_UPDATE, error: '无法执行该交互' };
    }

    const npcId = actionId.slice(4);
    const npc = this.getAdjacentNpcs(player).find((entry) => entry.id === npcId);
    if (!npc) {
      return { ...EMPTY_UPDATE, error: '你离目标太远了' };
    }

    return this.handleNpcInteraction(player, npc);
  }

  /** 处理需要指定目标的交互（强制攻击等） */
  handleTargetedInteraction(player: PlayerState, actionId: string, targetRef?: string): WorldUpdate {
    if (actionId === 'battle:force_attack') {
      return this.forceAttackTarget(player, targetRef);
    }
    return { ...EMPTY_UPDATE, error: '该行动不支持指定目标' };
  }

  /** 同步玩家任务进度，检测完成条件并刷新状态 */
  syncQuestState(player: PlayerState): WorldDirtyFlag[] {
    let changed = false;

    for (const quest of player.quests) {
      if (quest.status === 'completed') continue;
      const config = this.mapService.getQuest(quest.id);
      if (!config) continue;
      if (
        (
          !quest.giverMapName
          || quest.giverX === undefined
          || quest.giverY === undefined
          || (quest.giverMapId && quest.giverMapName === quest.giverMapId)
        )
        && quest.giverId
      ) {
        const npcLocation = this.mapService.getNpcLocation(quest.giverId);
        if (npcLocation) {
          quest.giverMapId = npcLocation.mapId;
          quest.giverMapName = npcLocation.mapName;
          quest.giverX = npcLocation.x;
          quest.giverY = npcLocation.y;
          changed = true;
        }
      }
      const nextProgress = this.resolveQuestProgress(player, quest, config);
      if (nextProgress !== quest.progress) {
        quest.progress = nextProgress;
        changed = true;
      }
      const targetName = resolveQuestTargetName({
        objectiveType: config.objectiveType,
        title: quest.title,
        targetName: quest.targetName,
        targetMonsterId: quest.targetMonsterId || config.targetMonsterId,
        targetTechniqueId: quest.targetTechniqueId || config.targetTechniqueId,
        targetRealmStage: quest.targetRealmStage ?? config.targetRealmStage,
        resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
      });
      if (quest.targetName !== targetName) {
        quest.targetName = targetName;
        changed = true;
      }
    }

    const statusChanged = this.refreshQuestStatuses(player);
    if (changed || statusChanged) {
      return statusChanged ? ['quest', 'actions'] : ['quest'];
    }
    return [];
  }

  /** 自动战斗逻辑：寻敌 → 追击 → 释放技能/普攻 */
  performAutoBattle(player: PlayerState): WorldUpdate {
    if (!player.autoBattle || player.dead) return EMPTY_UPDATE;

    let target = this.resolveCombatTarget(player);
    const dirty = new Set<WorldDirtyFlag>();
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);

    if (target && !this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      target = undefined;
      this.clearCombatTarget(player);
    }

    if (!target) {
      if (player.combatTargetLocked) {
        player.autoBattle = false;
        this.clearCombatTarget(player);
        return {
          messages: [{
            playerId: player.id,
            text: '强制攻击目标已经失去踪迹，自动战斗已停止。',
            kind: 'combat',
          }],
          dirty: ['actions'],
        };
      }
      const fallback = this.findNearestLivingMonster(player, effectiveViewRange);
      if (!fallback) {
        this.clearCombatTarget(player);
        return EMPTY_UPDATE;
      }
      target = { kind: 'monster', x: fallback.x, y: fallback.y, monster: fallback };
      player.combatTargetId = fallback.runtimeId;
    }

    const skillActionMap = new Map(
      player.actions
        .filter((action) => action.type === 'skill')
        .map((action) => [action.id, action] as const),
    );
    const availableSkill = player.autoBattleSkills
      .filter((entry) => entry.enabled)
      .map((entry) => skillActionMap.get(entry.skillId))
      .find((action): action is ActionDef => action !== undefined && action.cooldownLeft === 0);
    const availableSkillDef = availableSkill ? this.contentService.getSkill(availableSkill.id) : null;
    const targetRef = this.getTargetRef(target);

    if (availableSkillDef && targetRef && isPointInRange(player, target, availableSkillDef.range)) {
      const update = this.performTargetedSkill(player, availableSkillDef.id, targetRef);
      if (update.consumedAction) {
        return { ...update, usedActionId: availableSkillDef.id };
      }
      if (isPointInRange(player, target, 1)) {
        return this.performBasicAttack(player, target);
      }
    }

    if (isPointInRange(player, target, 1)) {
      this.faceToward(player, target.x, target.y);
      return this.performBasicAttack(player, target);
    }

    const facing = this.stepToward(player.mapId, player, target.x, target.y, player.id);
    if (facing !== null) {
      player.facing = facing;
      const cultivation = this.techniqueService.interruptCultivation(player, 'move');
      if (cultivation.changed) {
        for (const flag of cultivation.dirty) {
          dirty.add(flag as WorldDirtyFlag);
        }
        return {
          messages: cultivation.messages.map((message) => ({
            playerId: player.id,
            text: message.text,
            kind: message.kind,
          })),
          dirty: [...dirty],
        };
      }
    }
    return dirty.size > 0 ? { messages: [], dirty: [...dirty] } : EMPTY_UPDATE;
  }

  /** 释放无目标技能 */
  performSkill(player: PlayerState, skillId: string): WorldUpdate {
    const skill = this.contentService.getSkill(skillId);
    if (!skill) {
      return { ...EMPTY_UPDATE, error: '技能不存在' };
    }
    if (skill.requiresTarget !== false) {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }
    return this.castSkill(player, skill);
  }

  /** 释放指定目标的技能 */
  performTargetedSkill(player: PlayerState, skillId: string, targetRef?: string): WorldUpdate {
    const skill = this.contentService.getSkill(skillId);
    if (!skill) {
      return { ...EMPTY_UPDATE, error: '技能不存在' };
    }
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '请选择目标' };
    }

    const target = this.resolveTargetRef(player, targetRef);
    if (!target) {
      return { ...EMPTY_UPDATE, error: '目标不存在或不可选中' };
    }
    if (!isPointInRange(player, target, skill.range)) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }

    return this.castSkill(player, skill, target);
  }

  /** 技能施放核心流程：中断修炼 → 选择目标 → 消耗真气 → 逐效果结算 */
  private castSkill(player: PlayerState, skill: SkillDef, primaryTarget?: ResolvedTarget): WorldUpdate {
    const cultivation = this.techniqueService.interruptCultivation(player, 'attack');
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
    const result: WorldUpdate = {
      messages: cultivation.messages.map((message) => ({
        playerId: player.id,
        text: message.text,
        kind: message.kind,
      })),
      dirty: [],
      consumedAction: true,
    };
    if (primaryTarget) {
      this.faceToward(player, primaryTarget.x, primaryTarget.y);
    }
    const selectedTargets = this.selectSkillTargets(player, skill, primaryTarget);
    if (skill.requiresTarget !== false && selectedTargets.length === 0) {
      return { ...EMPTY_UPDATE, error: '没有可命中的目标' };
    }

    const qiCost = this.consumeQiForSkill(player, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }
    this.pushActionLabelEffect(player.mapId, player.x, player.y, skill.name);

    const casterStats = this.attrService.getPlayerNumericStats(player);
    const techLevel = this.getSkillTechniqueLevel(player, skill.id);
    let appliedEffect = false;
    let firstError: string | undefined;

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const damageTargets = this.pickDamageTargets(selectedTargets, primaryTarget);
        if (damageTargets.length === 0) {
          continue;
        }
        for (const target of damageTargets) {
          const context: SkillFormulaContext = {
            player,
            skill,
            techLevel,
            targetCount: damageTargets.length,
            casterStats,
            target,
            targetStats: target.kind === 'monster'
              ? this.getMonsterCombatSnapshot(target.monster).stats
              : target.kind === 'player'
                ? this.getPlayerCombatSnapshot(target.player).stats
                : undefined,
          };
          const baseDamage = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
          const update = target.kind === 'monster'
            ? this.attackMonster(player, target.monster, baseDamage, `${skill.name}击中`, effect.damageKind ?? 'spell', effect.element, qiCost)
            : target.kind === 'player'
              ? this.attackPlayer(player, target.player, baseDamage, `${skill.name}击中`, effect.damageKind ?? 'spell', effect.element, qiCost)
              : this.attackTerrain(player, target.x, target.y, baseDamage, skill.name, target.tileType ?? '目标', effect.damageKind ?? 'spell', effect.element);
          result.messages.push(...update.messages);
          for (const flag of update.dirty) {
            dirty.add(flag);
          }
          for (const playerId of update.dirtyPlayers ?? []) {
            if (playerId === player.id) {
              continue;
            }
            result.dirtyPlayers ??= [];
            if (!result.dirtyPlayers.includes(playerId)) {
              result.dirtyPlayers.push(playerId);
            }
          }
          if (update.error) {
            firstError ??= update.error;
          } else {
            appliedEffect = true;
          }
        }
        continue;
      }

      const update = this.applyBuffEffect(player, skill, effect, selectedTargets, primaryTarget);
      result.messages.push(...update.messages);
      for (const flag of update.dirty) {
        dirty.add(flag);
      }
      for (const playerId of update.dirtyPlayers ?? []) {
        if (playerId === player.id) {
          continue;
        }
        result.dirtyPlayers ??= [];
        if (!result.dirtyPlayers.includes(playerId)) {
          result.dirtyPlayers.push(playerId);
        }
      }
      if (update.error) {
        firstError ??= update.error;
      } else {
        appliedEffect = true;
      }
    }

    if (!appliedEffect && firstError) {
      result.error = firstError;
    }
    result.dirty = [...dirty];
    return result;
  }

  /** 锁定目标并开启自动战斗 */
  engageTarget(player: PlayerState, targetRef?: string): WorldUpdate {
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }
    const target = this.resolveTargetRef(player, targetRef);
    if (!target || target.kind !== 'monster') {
      return { ...EMPTY_UPDATE, error: '只能锁定敌对单位' };
    }

    player.autoBattle = true;
    player.combatTargetId = target.monster.runtimeId;
    player.combatTargetLocked = false;
    this.navigationService.clearMoveTarget(player.id);
    const update = this.performAutoBattle(player);
    const dirty = new Set(update.dirty);
    dirty.add('actions');
    return { ...update, dirty: [...dirty] };
  }

  forceAttackTarget(player: PlayerState, targetRef?: string): WorldUpdate {
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '请选择目标' };
    }
    const target = this.resolveTargetRef(player, targetRef);
    if (!target) {
      return { ...EMPTY_UPDATE, error: '目标不存在或不可选中' };
    }
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
    if (!isPointInRange(player, target, effectiveViewRange) || !this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return { ...EMPTY_UPDATE, error: '目标超出可锁定范围' };
    }

    player.autoBattle = true;
    player.combatTargetId = this.getTargetRef(target);
    player.combatTargetLocked = true;
    this.navigationService.clearMoveTarget(player.id);
    const update = this.performAutoBattle(player);
    const dirty = new Set(update.dirty);
    dirty.add('actions');
    return { ...update, dirty: [...dirty] };
  }

  private selectSkillTargets(player: PlayerState, skill: SkillDef, primaryTarget?: ResolvedTarget): ResolvedTarget[] {
    if (!primaryTarget) {
      return [];
    }
    const targeting = skill.targeting;
    const shape = targeting?.shape ?? 'single';
    if (shape === 'single') {
      return [primaryTarget];
    }

    const monsters = this.monstersByMap.get(player.mapId) ?? [];
    const players = this.playerService.getPlayersByMap(player.mapId)
      .filter((entry) => entry.id !== player.id && !entry.dead);
    const maxTargets = Math.max(1, targeting?.maxTargets ?? 99);
    if (shape === 'line') {
      const cells = computeAffectedCellsFromAnchor(player, primaryTarget, {
        range: skill.range,
        shape: 'line',
      });
      return this.collectTargetsFromCells(player, monsters, players, cells, maxTargets);
    }

    const cells = computeAffectedCellsFromAnchor(player, primaryTarget, {
      range: skill.range,
      shape: 'area',
      radius: targeting?.radius,
    });
    return this.collectTargetsFromCells(player, monsters, players, cells, maxTargets);
  }

  private collectTargetsFromCells(
    player: PlayerState,
    monsters: RuntimeMonster[],
    players: PlayerState[],
    cells: Array<{ x: number; y: number }>,
    maxTargets: number,
  ): ResolvedTarget[] {
    const resolved: ResolvedTarget[] = [];
    const seen = new Set<string>();

    for (const cell of cells) {
      const monster = monsters.find((entry) => entry.alive && entry.x === cell.x && entry.y === cell.y);
      if (monster) {
        const key = `monster:${monster.runtimeId}`;
        if (!seen.has(key)) {
          resolved.push({ kind: 'monster', x: monster.x, y: monster.y, monster });
          seen.add(key);
          if (resolved.length >= maxTargets) {
            return resolved;
          }
        }
      }

      const targetPlayer = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
      if (targetPlayer) {
        const key = `player:${targetPlayer.id}`;
        if (!seen.has(key)) {
          resolved.push({ kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer });
          seen.add(key);
          if (resolved.length >= maxTargets) {
            return resolved;
          }
        }
      }

      const tile = this.mapService.getTile(player.mapId, cell.x, cell.y);
      if (!tile || !tile.hp || !tile.maxHp) {
        continue;
      }
      const key = `tile:${cell.x}:${cell.y}`;
      if (seen.has(key)) {
        continue;
      }
      resolved.push({ kind: 'tile', x: cell.x, y: cell.y, tileType: tile.type });
      seen.add(key);
      if (resolved.length >= maxTargets) {
        return resolved;
      }
    }

    return resolved;
  }

  private pickDamageTargets(selectedTargets: ResolvedTarget[], primaryTarget?: ResolvedTarget): ResolvedTarget[] {
    if (selectedTargets.length > 0) {
      return selectedTargets;
    }
    return primaryTarget ? [primaryTarget] : [];
  }

  private normalizeBuffShortMark(effect: Extract<SkillEffectDef, { type: 'buff' }>): string {
    const raw = effect.shortMark?.trim();
    if (raw) {
      return [...raw][0] ?? raw;
    }
    const fallback = [...effect.name.trim()][0];
    return fallback ?? '气';
  }

  private buildTemporaryBuffState(skill: SkillDef, effect: Extract<SkillEffectDef, { type: 'buff' }>): TemporaryBuffState {
    const maxStacks = Math.max(1, effect.maxStacks ?? 1);
    const duration = Math.max(1, effect.duration);
    return {
      buffId: effect.buffId,
      name: effect.name,
      desc: effect.desc,
      shortMark: this.normalizeBuffShortMark(effect),
      category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
      visibility: effect.visibility ?? 'public',
      remainingTicks: duration + 1,
      duration,
      stacks: 1,
      maxStacks,
      sourceSkillId: skill.id,
      sourceSkillName: skill.name,
      color: effect.color,
      attrs: effect.attrs,
      stats: effect.stats,
    };
  }

  private applyBuffState(targetBuffs: TemporaryBuffState[], nextBuff: TemporaryBuffState): TemporaryBuffState {
    const existing = targetBuffs.find((entry) => entry.buffId === nextBuff.buffId);
    if (existing) {
      existing.name = nextBuff.name;
      existing.desc = nextBuff.desc;
      existing.shortMark = nextBuff.shortMark;
      existing.category = nextBuff.category;
      existing.visibility = nextBuff.visibility;
      existing.remainingTicks = nextBuff.remainingTicks;
      existing.duration = nextBuff.duration;
      existing.stacks = Math.min(nextBuff.maxStacks, existing.stacks + 1);
      existing.maxStacks = nextBuff.maxStacks;
      existing.sourceSkillId = nextBuff.sourceSkillId;
      existing.sourceSkillName = nextBuff.sourceSkillName;
      existing.color = nextBuff.color;
      existing.attrs = nextBuff.attrs;
      existing.stats = nextBuff.stats;
      return existing;
    }
    targetBuffs.push(nextBuff);
    return nextBuff;
  }

  private getRenderableBuffs(buffs: TemporaryBuffState[] | undefined): VisibleBuffState[] | undefined {
    if (!buffs || buffs.length === 0) {
      return undefined;
    }
    const visible = buffs
      .filter((buff) => buff.remainingTicks > 0 && buff.visibility !== 'hidden')
      .map<VisibleBuffState>((buff) => ({
        buffId: buff.buffId,
        name: buff.name,
        desc: buff.desc,
        shortMark: buff.shortMark,
        category: buff.category,
        visibility: buff.visibility,
        remainingTicks: buff.remainingTicks,
        duration: buff.duration,
        stacks: buff.stacks,
        maxStacks: buff.maxStacks,
        sourceSkillId: buff.sourceSkillId,
        sourceSkillName: buff.sourceSkillName,
        color: buff.color,
        attrs: buff.attrs,
        stats: buff.stats,
      }));
    return visible.length > 0 ? visible : undefined;
  }

  private applyBuffEffect(
    player: PlayerState,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'buff' }>,
    selectedTargets: ResolvedTarget[],
    primaryTarget?: ResolvedTarget,
  ): WorldUpdate {
    const affected: Array<{ target: BuffTargetEntity; buff: TemporaryBuffState }> = [];
    if (effect.target === 'self') {
      player.temporaryBuffs ??= [];
      const current = this.applyBuffState(player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect));
      this.attrService.recalcPlayer(player);
      affected.push({ target: { kind: 'player', player }, buff: current });
    } else {
      const targets = this.pickDamageTargets(selectedTargets, primaryTarget)
        .filter((entry): entry is Extract<ResolvedTarget, { kind: 'monster' | 'player' }> => entry.kind === 'monster' || entry.kind === 'player');
      if (targets.length === 0) {
        return { ...EMPTY_UPDATE, error: '当前技能没有可施加状态的有效目标' };
      }
      for (const target of targets) {
        if (target.kind === 'monster') {
          target.monster.temporaryBuffs ??= [];
          const current = this.applyBuffState(target.monster.temporaryBuffs, this.buildTemporaryBuffState(skill, effect));
          affected.push({ target: { kind: 'monster', monster: target.monster }, buff: current });
          continue;
        }
        target.player.temporaryBuffs ??= [];
        const current = this.applyBuffState(target.player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect));
        this.attrService.recalcPlayer(target.player);
        affected.push({ target: { kind: 'player', player: target.player }, buff: current });
      }
    }

    const selfDirty = affected.some((entry) => entry.target.kind === 'player' && entry.target.player.id === player.id);
    const dirtyPlayers = affected
      .filter((entry): entry is { target: { kind: 'player'; player: PlayerState }; buff: TemporaryBuffState } => (
        entry.target.kind === 'player' && entry.target.player.id !== player.id
      ))
      .map((entry) => entry.target.player.id);
    const targetNames = affected.map((entry) => {
      if (entry.target.kind === 'monster') {
        return entry.target.monster.name;
      }
      return entry.target.player.id === player.id ? '你' : entry.target.player.name;
    });
    const uniqueNames = [...new Set(targetNames)];
    const summary = uniqueNames.join('、');
    const primaryBuff = affected[0]?.buff;
    const stackText = primaryBuff && primaryBuff.maxStacks > 1 ? `（${primaryBuff.stacks}层）` : '';
    return {
      messages: [{
        playerId: player.id,
        text: `${skill.name}生效，${summary}获得了 ${effect.name}${stackText}，持续 ${Math.max(1, effect.duration)} 息。`,
        kind: 'combat',
      }],
      dirty: selfDirty ? ['attr'] : [],
      dirtyPlayers,
    };
  }

  private getSkillTechniqueLevel(player: PlayerState, skillId: string): number {
    for (const technique of player.techniques) {
      if (technique.skills.some((entry) => entry.id === skillId)) {
        return Math.max(1, technique.level);
      }
    }
    return 1;
  }

  private evaluateSkillFormula(formula: SkillFormula, context: SkillFormulaContext): number {
    if (typeof formula === 'number') {
      return formula;
    }
    if ('var' in formula) {
      return this.resolveSkillFormulaVar(formula.var, context) * (formula.scale ?? 1);
    }
    if (formula.op === 'clamp') {
      const value = this.evaluateSkillFormula(formula.value, context);
      const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : this.evaluateSkillFormula(formula.min, context);
      const max = formula.max === undefined ? Number.POSITIVE_INFINITY : this.evaluateSkillFormula(formula.max, context);
      return Math.min(max, Math.max(min, value));
    }

    const values = formula.args.map((entry) => this.evaluateSkillFormula(entry, context));
    switch (formula.op) {
      case 'add':
        return values.reduce((sum, value) => sum + value, 0);
      case 'sub':
        return values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0);
      case 'mul':
        return values.reduce((sum, value) => sum * value, 1);
      case 'div':
        return values.slice(1).reduce((sum, value) => (value === 0 ? sum : sum / value), values[0] ?? 0);
      case 'min':
        return values.length > 0 ? Math.min(...values) : 0;
      case 'max':
        return values.length > 0 ? Math.max(...values) : 0;
      default:
        return 0;
    }
  }

  private resolveSkillFormulaVar(variable: SkillFormulaVar, context: SkillFormulaContext): number {
    const parsedBuffVar = this.parseBuffStackVariable(variable);
    if (parsedBuffVar) {
      return this.resolveBuffStackVariable(parsedBuffVar.side, parsedBuffVar.buffId, context);
    }
    switch (variable) {
      case 'techLevel':
        return context.techLevel;
      case 'targetCount':
        return context.targetCount;
      case 'caster.hp':
        return context.player.hp;
      case 'caster.maxHp':
        return context.player.maxHp;
      case 'caster.qi':
        return context.player.qi;
      case 'caster.maxQi':
        return Math.max(0, Math.round(context.casterStats.maxQi));
      case 'target.hp':
        return context.target?.kind === 'monster'
          ? context.target.monster.hp
          : context.target?.kind === 'player'
            ? context.target.player.hp
            : 0;
      case 'target.maxHp':
        return context.target?.kind === 'monster'
          ? context.target.monster.maxHp
          : context.target?.kind === 'player'
            ? context.target.player.maxHp
            : 0;
      case 'target.qi':
        return context.target?.kind === 'player' ? context.target.player.qi : 0;
      case 'target.maxQi':
        return context.target?.kind === 'player'
          ? Math.max(0, Math.round(this.attrService.getPlayerNumericStats(context.target.player).maxQi))
          : 0;
      default:
        if (variable.startsWith('caster.stat.')) {
          const key = variable.slice('caster.stat.'.length) as keyof NumericStats;
          return typeof context.casterStats[key] === 'number' ? context.casterStats[key] as number : 0;
        }
        if (variable.startsWith('target.stat.')) {
          const key = variable.slice('target.stat.'.length) as keyof NumericStats;
          const targetStats = context.targetStats;
          return targetStats && typeof targetStats[key] === 'number' ? targetStats[key] as number : 0;
        }
        return 0;
    }
  }

  private parseBuffStackVariable(variable: SkillFormulaVar): { side: 'caster' | 'target'; buffId: string } | null {
    if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
      return {
        side: 'caster',
        buffId: variable.slice('caster.buff.'.length, -'.stacks'.length),
      };
    }
    if (variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
      return {
        side: 'target',
        buffId: variable.slice('target.buff.'.length, -'.stacks'.length),
      };
    }
    return null;
  }

  private resolveBuffStackVariable(side: 'caster' | 'target', buffId: string, context: SkillFormulaContext): number {
    if (side === 'caster') {
      return context.player.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
    }
    if (context.target?.kind === 'player') {
      return context.target.player.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
    }
    if (context.target?.kind === 'monster') {
      return context.target.monster.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
    }
    return 0;
  }

  resetPlayerToSpawn(player: PlayerState): WorldUpdate {
    this.logger.log(`重置玩家到出生点: ${player.id} (${player.mapId}:${player.x},${player.y})`);
    const spawn = this.mapService.getSpawnPoint('spawn') ?? { x: player.x, y: player.y };
    const pos = this.findNearbyWalkable('spawn', spawn.x, spawn.y, 4) ?? spawn;
    this.navigationService.clearMoveTarget(player.id);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.mapId = 'spawn';
    player.x = pos.x;
    player.y = pos.y;
    player.facing = Direction.South;
    player.temporaryBuffs = [];
    this.attrService.recalcPlayer(player);
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);
    player.dead = false;
    player.autoBattle = false;
    this.clearCombatTarget(player);
    this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');

    return {
      messages: [{
        playerId: player.id,
        text: '调试指令已执行，你被送回云来镇出生点。',
        kind: 'system',
      }],
      dirty: ['actions'],
    };
  }

  removePlayerFromWorld(player: PlayerState, reason: 'death' | 'timeout'): void {
    if (player.inWorld === false) {
      return;
    }

    this.techniqueService.stopCultivation(
      player,
      reason === 'death'
        ? '你在离线中被击倒，当前修炼已终止。'
        : '你离线过久，已退出世界，当前修炼随之中止。',
      'system',
    );

    if (reason === 'death') {
      this.restorePlayerAfterDefeat(player, false);
    } else {
      this.navigationService.clearMoveTarget(player.id);
      this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
      player.autoBattle = false;
      this.clearCombatTarget(player);
    }

    player.inWorld = false;
    player.online = false;
    player.idleTicks = 0;
    this.playerService.removeSocket(player.id);
    this.playerService.syncPlayerRealtimeState(player.id);
    void this.playerService.savePlayer(player.id).catch((error: Error) => {
      this.logger.error(`玩家退出世界落盘失败: ${player.id} ${error.message}`);
    });
  }

  tickMonsters(mapId: string, players: PlayerState[]): WorldUpdate {
    this.ensureMapInitialized(mapId);
    const monsters = this.monstersByMap.get(mapId) ?? [];
    const allMessages: WorldMessage[] = [];
    const dirtyPlayers = new Set<string>();

    for (const monster of monsters) {
      if (!monster.alive) {
        monster.respawnLeft -= 1;
        if (monster.respawnLeft <= 0) {
          const pos = this.findSpawnPosition(mapId, monster);
          if (pos && this.mapService.isWalkable(mapId, pos.x, pos.y, { actorType: 'monster' })) {
            monster.x = pos.x;
            monster.y = pos.y;
            monster.hp = monster.maxHp;
            monster.alive = true;
            monster.temporaryBuffs = [];
            monster.damageContributors.clear();
            monster.targetPlayerId = undefined;
            this.mapService.addOccupant(mapId, monster.x, monster.y, monster.runtimeId, 'monster');
          } else {
            monster.respawnLeft = 1;
          }
        }
        continue;
      }

      if (monster.temporaryBuffs.length > 0) {
        for (const buff of monster.temporaryBuffs) {
          buff.remainingTicks -= 1;
        }
        monster.temporaryBuffs = monster.temporaryBuffs.filter((buff) => buff.remainingTicks > 0 && buff.stacks > 0);
      }

      const timeState = this.timeService.syncMonsterTimeEffects(monster);
      let target = this.resolveMonsterTarget(monster, players, timeState);
      if (!target) {
        if (monster.x !== monster.spawnX || monster.y !== monster.spawnY) {
          this.stepToward(mapId, monster, monster.spawnX, monster.spawnY, monster.runtimeId);
        }
        continue;
      }

      if (isPointInRange(monster, target, 1)) {
        const cultivation = this.techniqueService.interruptCultivation(target, 'hit');
        const resolved = this.resolveMonsterAttack(monster, target);
        const monsterElement = this.inferMonsterElement(monster);
        const effectColor = getDamageTrailColor(monsterElement ? 'spell' : 'physical', monsterElement);
        for (const message of cultivation.messages) {
          allMessages.push({
            playerId: target.id,
            text: message.text,
            kind: message.kind,
          });
        }
        if (cultivation.changed) {
          dirtyPlayers.add(target.id);
        }
        if (target.hp > 0 && target.autoRetaliate !== false && !target.autoBattle) {
          target.autoBattle = true;
          target.combatTargetId = monster.runtimeId;
          target.combatTargetLocked = false;
          this.navigationService.clearMoveTarget(target.id);
          dirtyPlayers.add(target.id);
        }
        this.pushEffect(mapId, {
          type: 'attack',
          fromX: monster.x,
          fromY: monster.y,
          toX: target.x,
          toY: target.y,
          color: effectColor,
        });
        this.pushEffect(mapId, {
          type: 'float',
          x: target.x,
          y: target.y,
          text: resolved.hit ? `-${resolved.damage}` : '闪',
          color: effectColor,
        });
        allMessages.push(this.buildMonsterAttackMessage(monster, target, resolved, effectColor));
        if (target.hp <= 0) {
          allMessages.push({
            playerId: target.id,
            text: target.online === false
              ? '你在离线中被击倒，已退出当前世界。'
              : '你被击倒，已被护山阵法送回复活点。',
            kind: 'combat',
          });
          if (target.online === false) {
            this.removePlayerFromWorld(target, 'death');
          } else {
            this.respawnPlayer(target);
          }
          dirtyPlayers.add(target.id);
        }
      } else {
        this.stepToward(mapId, monster, target.x, target.y, monster.runtimeId);
      }
    }

    return { messages: allMessages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

  private handleNpcInteraction(player: PlayerState, npc: NpcConfig): WorldUpdate {
    this.syncQuestState(player);
    const interaction = this.getNpcInteractionState(player, npc);

    if (!interaction.quest) {
      return {
        messages: [{ playerId: player.id, text: `${npc.name}：${npc.dialogue}`, kind: 'quest' }],
        dirty: [],
      };
    }

    if (!interaction.questState) {
      const questState: QuestState = {
        id: interaction.quest.id,
        title: interaction.quest.title,
        desc: interaction.quest.desc,
        line: interaction.quest.line,
        chapter: interaction.quest.chapter,
        story: interaction.quest.story,
        status: 'active',
        objectiveType: interaction.quest.objectiveType,
        objectiveText: interaction.quest.objectiveText,
        progress: 0,
        required: interaction.quest.required,
        targetName: resolveQuestTargetName({
          objectiveType: interaction.quest.objectiveType,
          title: interaction.quest.title,
          targetName: interaction.quest.targetName,
          targetMonsterId: interaction.quest.targetMonsterId,
          targetTechniqueId: interaction.quest.targetTechniqueId,
          targetRealmStage: interaction.quest.targetRealmStage,
          resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
          resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
        }),
        targetTechniqueId: interaction.quest.targetTechniqueId,
        targetRealmStage: interaction.quest.targetRealmStage,
        rewardText: interaction.quest.rewardText,
        targetMonsterId: interaction.quest.targetMonsterId ?? '',
        rewardItemId: interaction.quest.rewardItemId,
        rewardItemIds: [...interaction.quest.rewardItemIds],
        rewards: interaction.quest.rewards
          .map((reward) => this.createItemFromDrop(reward))
          .filter((item): item is ItemStack => Boolean(item)),
        nextQuestId: interaction.quest.nextQuestId,
        giverId: npc.id,
        giverName: npc.name,
        giverMapId: player.mapId,
        giverMapName: this.mapService.getMapMeta(player.mapId)?.name ?? '未知地界',
        giverX: npc.x,
        giverY: npc.y,
      };
      questState.progress = this.resolveQuestProgress(player, questState, interaction.quest);
      player.quests.push(questState);
      this.syncQuestState(player);
      return {
        messages: [{
          playerId: player.id,
          text: `${npc.name}：${interaction.quest.story ?? interaction.quest.desc}`,
          kind: 'quest',
        }],
        dirty: ['quest', 'actions'],
      };
    }

    if (interaction.questState.status === 'ready') {
      const rewards = this.buildRewardItems(interaction.quest);
      if (!this.canReceiveItems(player, rewards)) {
        return { ...EMPTY_UPDATE, error: '背包空间不足，无法领取奖励' };
      }

      const dirty: WorldDirtyFlag[] = ['quest', 'actions'];
      if (interaction.quest.requiredItemId && (interaction.quest.requiredItemCount ?? 1) > 0) {
        const err = this.consumeInventoryItem(player, interaction.quest.requiredItemId, interaction.quest.requiredItemCount ?? 1);
        if (err) {
          return { ...EMPTY_UPDATE, error: err };
        }
        dirty.push('inv');
      }

      for (const reward of rewards) {
        this.inventoryService.addItem(player, reward);
      }
      if (rewards.length > 0) {
        dirty.push('inv');
      }
      const unlockedBreakthroughRequirements = this.techniqueService.revealBreakthroughRequirements(
        player,
        interaction.quest.unlockBreakthroughRequirementIds ?? [],
      );
      if (unlockedBreakthroughRequirements) {
        dirty.push('attr');
      }
      interaction.questState.status = 'completed';
      return {
        messages: [{
          playerId: player.id,
          text: `${npc.name}：做得不错，这是你的奖励 ${interaction.quest.rewardText}。`,
          kind: 'quest',
        }],
        dirty,
      };
    }

    if (interaction.questState.status === 'active') {
      return {
        messages: [{
          playerId: player.id,
          text: `${npc.name}：${this.describeQuestProgress(interaction.questState, interaction.quest)}`,
          kind: 'quest',
        }],
        dirty: ['actions'],
      };
    }

    return {
      messages: [{ playerId: player.id, text: `${npc.name}：${npc.dialogue}`, kind: 'quest' }],
      dirty: ['actions'],
    };
  }

  private handlePortalTravel(player: PlayerState): WorldUpdate {
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (!portal) {
      return { ...EMPTY_UPDATE, error: '你需要站在传送阵上才能传送' };
    }
    return this.travelThroughPortal(player, portal);
  }

  tryAutoTravel(player: PlayerState): WorldUpdate | null {
    const portal = this.mapService.getPortalAt(player.mapId, player.x, player.y, { trigger: 'auto' });
    if (!portal) {
      return null;
    }
    return this.travelThroughPortal(player, portal);
  }

  private travelThroughPortal(player: PlayerState, portal: Portal): WorldUpdate {
    const targetMapMeta = this.mapService.getMapMeta(portal.targetMapId);
    if (!targetMapMeta) {
      return {
        ...EMPTY_UPDATE,
        error: portal.kind === 'stairs' ? '楼梯通往的目标地图不存在' : '传送失败：目标地图不存在',
      };
    }
    if (!this.mapService.isWalkable(portal.targetMapId, portal.targetX, portal.targetY, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      return {
        ...EMPTY_UPDATE,
        error: portal.kind === 'stairs' ? '楼梯落点被占用或不可到达' : '传送失败：目标传送阵被占用或不可到达',
      };
    }

    this.navigationService.clearMoveTarget(player.id);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.mapId = portal.targetMapId;
    player.x = portal.targetX;
    player.y = portal.targetY;
    player.autoBattle = false;
    this.clearCombatTarget(player);
    this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');

    const text = portal.kind === 'stairs'
      ? `你踏上楼梯，来到 ${targetMapMeta.name}。`
      : `你启动界门，抵达 ${targetMapMeta.name} 的传送阵。`;
    return {
      messages: [{ playerId: player.id, text, kind: 'quest' }],
      dirty: ['actions', 'loot'],
    };
  }

  private attackMonster(
    player: PlayerState,
    monster: RuntimeMonster,
    baseDamage: number,
    prefix: string,
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    qiCost = 0,
    activeAttackBehavior = false,
  ): WorldUpdate {
    const cultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(player, 'attack')
      : { changed: false, dirty: [], messages: [] };
    const resolved = this.resolvePlayerAttack(player, monster, baseDamage, damageKind, element, qiCost);
    const effectColor = getDamageTrailColor(damageKind, element);

    this.pushEffect(player.mapId, {
      type: 'attack',
      fromX: player.x,
      fromY: player.y,
      toX: monster.x,
      toY: monster.y,
      color: effectColor,
    });
    this.pushEffect(player.mapId, {
      type: 'float',
      x: monster.x,
      y: monster.y,
      text: resolved.hit ? `-${resolved.damage}` : '闪',
      color: effectColor,
    });
    const messages: WorldMessage[] = [
      ...cultivation.messages.map((message) => ({
        playerId: player.id,
        text: message.text,
        kind: message.kind,
      })),
      this.buildPlayerAttackMessage(player, monster, prefix, resolved, effectColor),
    ];
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
    this.recordMonsterDamage(monster, player.id, resolved.damage);

    if (monster.hp <= 0) {
      const expRecipients = this.resolveMonsterExpRecipients(monster, player);
      monster.alive = false;
      monster.respawnLeft = Math.max(1, monster.respawnTicks);
      monster.temporaryBuffs = [];
      monster.damageContributors.clear();
      monster.targetPlayerId = undefined;
      this.mapService.removeOccupant(monster.mapId, monster.x, monster.y, monster.runtimeId);
      messages.push({
        playerId: player.id,
        text: `${monster.name} 被你斩杀。`,
        kind: 'combat',
      });

      for (const flag of this.advanceQuestProgress(player, monster.id, monster.name)) {
        dirty.add(flag);
      }

      this.distributeMonsterKillExp(monster, player, expRecipients, dirty, messages);

      for (const drop of monster.drops) {
        if (Math.random() > this.getEffectiveDropChance(player, drop)) continue;
        const loot = this.createItemFromDrop(drop);
        if (!loot) continue;
        if (this.inventoryService.addItem(player, loot)) {
          messages.push({
            playerId: player.id,
            text: `你拾取了 ${loot.name} x${loot.count}。`,
            kind: 'loot',
          });
          dirty.add('inv');
        } else {
          this.lootService.dropToGround(monster.mapId, monster.x, monster.y, loot);
          messages.push({
            playerId: player.id,
            text: `${loot.name} 掉落在 (${monster.x}, ${monster.y}) 的地面上，但你的背包已满。`,
            kind: 'loot',
          });
        }
      }

      if (this.refreshQuestStatuses(player)) {
        dirty.add('quest');
        dirty.add('actions');
      }
    }

    return { messages, dirty: [...dirty] };
  }

  private recordMonsterDamage(monster: RuntimeMonster, playerId: string, damage: number): void {
    if (damage <= 0) {
      return;
    }
    monster.damageContributors.set(playerId, (monster.damageContributors.get(playerId) ?? 0) + damage);
    monster.targetPlayerId = playerId;
  }

  private resolveMonsterExpRecipients(monster: RuntimeMonster, killer: PlayerState): PlayerState[] {
    const recipients: PlayerState[] = [];
    for (const [playerId, damage] of monster.damageContributors.entries()) {
      if (damage <= 0) {
        continue;
      }
      const participant = this.playerService.getPlayer(playerId);
      if (participant) {
        recipients.push(participant);
      }
    }
    if (recipients.length > 0) {
      return recipients;
    }
    return [killer];
  }

  private distributeMonsterKillExp(
    monster: RuntimeMonster,
    killer: PlayerState,
    recipients: PlayerState[],
    killerDirty: Set<WorldDirtyFlag>,
    messages: WorldMessage[],
  ): void {
    const participantCount = Math.max(1, recipients.length);
    for (const participant of recipients) {
      const combatExp = this.techniqueService.grantCombatExpFromMonsterKill(participant, {
        monsterLevel: monster.level,
        monsterName: monster.name,
        expMultiplier: monster.expMultiplier,
        participantCount,
        isKiller: participant.id === killer.id,
      });
      if (combatExp.changed) {
        for (const flag of combatExp.dirty) {
          if (participant.id === killer.id) {
            killerDirty.add(flag as WorldDirtyFlag);
          } else {
            this.playerService.markDirty(participant.id, flag as WorldDirtyFlag);
          }
        }
      }
      for (const message of combatExp.messages) {
        messages.push({
          playerId: participant.id,
          text: message.text,
          kind: message.kind,
        });
      }
    }
  }

  private attackPlayer(
    attacker: PlayerState,
    target: PlayerState,
    baseDamage: number,
    prefix: string,
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    qiCost = 0,
    activeAttackBehavior = false,
  ): WorldUpdate {
    const attackerCultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(attacker, 'attack')
      : { changed: false, dirty: [], messages: [] };
    const targetCultivation = this.techniqueService.interruptCultivation(target, 'hit');
    const resolved = this.resolvePlayerVsPlayerAttack(attacker, target, baseDamage, damageKind, element, qiCost);
    const effectColor = getDamageTrailColor(damageKind, element);

    this.pushEffect(attacker.mapId, {
      type: 'attack',
      fromX: attacker.x,
      fromY: attacker.y,
      toX: target.x,
      toY: target.y,
      color: effectColor,
    });
    this.pushEffect(attacker.mapId, {
      type: 'float',
      x: target.x,
      y: target.y,
      text: resolved.hit ? `-${resolved.damage}` : '闪',
      color: effectColor,
    });

    const dirty = new Set<WorldDirtyFlag>((attackerCultivation.dirty as WorldDirtyFlag[]));
    const dirtyPlayers = new Set<string>();
    if (targetCultivation.changed) {
      dirtyPlayers.add(target.id);
    }
    const messages: WorldMessage[] = [
      ...attackerCultivation.messages.map((message) => ({
        playerId: attacker.id,
        text: message.text,
        kind: message.kind,
      })),
      ...targetCultivation.messages.map((message) => ({
        playerId: target.id,
        text: message.text,
        kind: message.kind,
      })),
      this.buildPlayerVsPlayerAttackMessage(attacker, target, prefix, resolved, effectColor),
      this.buildPlayerUnderAttackMessage(attacker, target, resolved, effectColor),
    ];

    if (target.hp > 0 && target.autoRetaliate !== false && !target.autoBattle) {
      target.autoBattle = true;
      target.combatTargetId = `player:${attacker.id}`;
      target.combatTargetLocked = false;
      this.navigationService.clearMoveTarget(target.id);
      dirtyPlayers.add(target.id);
    }

    if (target.hp <= 0) {
      messages.push({
        playerId: attacker.id,
        text: `${target.name} 被你击倒。`,
        kind: 'combat',
      });
      messages.push({
        playerId: target.id,
        text: target.online === false
          ? '你在离线中被击倒，已退出当前世界。'
          : '你被击倒，已被护山阵法送回复活点。',
        kind: 'combat',
      });
      if (target.online === false) {
        this.removePlayerFromWorld(target, 'death');
      } else {
        this.respawnPlayer(target);
      }
      dirtyPlayers.add(target.id);
    }

    return { messages, dirty: [...dirty], dirtyPlayers: [...dirtyPlayers] };
  }

  private resolvePlayerAttack(
    player: PlayerState,
    monster: RuntimeMonster,
    baseDamage: number,
    damageKind: SkillDamageKind,
    element: ElementKey | undefined,
    qiCost = 0,
  ): ResolvedHit {
    const attacker = this.getPlayerCombatSnapshot(player);
    const defender = this.getMonsterCombatSnapshot(monster);
    const rawDamage = baseDamage;
    return this.resolveHit(attacker, defender, rawDamage, damageKind, qiCost, element, (damage) => {
      monster.hp = Math.max(0, monster.hp - damage);
    });
  }

  private resolvePlayerVsPlayerAttack(
    attacker: PlayerState,
    defender: PlayerState,
    baseDamage: number,
    damageKind: SkillDamageKind,
    element: ElementKey | undefined,
    qiCost = 0,
  ): ResolvedHit {
    return this.resolveHit(
      this.getPlayerCombatSnapshot(attacker),
      this.getPlayerCombatSnapshot(defender),
      baseDamage,
      damageKind,
      qiCost,
      element,
      (damage) => {
        defender.hp = Math.max(0, defender.hp - damage);
      },
    );
  }

  private resolveMonsterAttack(monster: RuntimeMonster, player: PlayerState): ResolvedHit {
    const attacker = this.getMonsterCombatSnapshot(monster);
    const defender = this.getPlayerCombatSnapshot(player);
    const element = this.inferMonsterElement(monster);
    const damageKind: SkillDamageKind = element ? 'spell' : 'physical';
    const rawDamage = monster.attack + (damageKind === 'physical' ? attacker.stats.physAtk : attacker.stats.spellAtk);
    return this.resolveHit(attacker, defender, rawDamage, damageKind, 0, element, (damage) => {
      player.hp = Math.max(0, player.hp - damage);
    });
  }

  private resolveHit(
    attacker: CombatSnapshot,
    defender: CombatSnapshot,
    baseDamage: number,
    damageKind: SkillDamageKind,
    qiCost: number,
    element: ElementKey | undefined,
    applyDamage: (damage: number) => void,
  ): ResolvedHit {
    const breakOverflow = Math.max(0, attacker.stats.breakPower - defender.stats.resolvePower);
    const breakChance = ratioValue(breakOverflow, attacker.ratios.breakPower);
    const broken = breakOverflow > 0 && Math.random() < breakChance;

    const hitStat = attacker.stats.hit * (broken ? 2 : 1);
    const dodgeGap = Math.max(0, defender.stats.dodge - hitStat);
    const dodged = dodgeGap > 0 && Math.random() < ratioValue(dodgeGap, defender.ratios.dodge);
    if (dodged) {
      return {
        hit: false,
        damage: 0,
        crit: false,
        dodged: true,
        resolved: false,
        broken,
        qiCost,
      };
    }

    const resolveGap = Math.max(0, defender.stats.resolvePower - attacker.stats.breakPower);
    const resolved = !broken && resolveGap > 0 && Math.random() < ratioValue(resolveGap, defender.ratios.resolvePower);
    const critStat = attacker.stats.crit * (broken ? 2 : 1);
    const crit = critStat > 0 && Math.random() < ratioValue(critStat, attacker.ratios.crit);

    let damage = Math.max(1, Math.round(baseDamage));
    if (element) {
      damage = Math.max(1, Math.round(damage * (1 + Math.max(0, attacker.stats.elementDamageBonus[element]) / 100)));
    }

    let defense = damageKind === 'physical' ? defender.stats.physDef : defender.stats.spellDef;
    if (resolved) {
      defense *= 2;
    }
    let reduction = Math.max(0, ratioValue(defense, DEFAULT_RATIO_DIVISOR));
    if (element) {
      const elementReduce = Math.max(0, ratioValue(defender.stats.elementDamageReduce[element], defender.ratios.elementDamageReduce[element]));
      reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * (1 - Math.min(0.95, reduction))));

    if (crit) {
      damage = Math.max(1, Math.round(damage * ((200 + Math.max(0, attacker.stats.critDamage) / 10) / 100)));
    }
    damage = Math.max(1, Math.round(damage * getRealmGapDamageMultiplier(attacker.realmLv, defender.realmLv)));

    applyDamage(damage);
    return {
      hit: true,
      damage,
      crit,
      dodged: false,
      resolved,
      broken,
      qiCost,
    };
  }

  private buildPlayerAttackMessage(
    player: PlayerState,
    monster: RuntimeMonster,
    prefix: string,
    resolved: ResolvedHit,
    floatColor: string,
  ): WorldMessage {
    const suffix: string[] = [];
    if (resolved.broken) suffix.push('破招');
    if (resolved.crit) suffix.push('暴击');
    if (resolved.resolved) suffix.push('化解');
    const tag = suffix.length > 0 ? `（${suffix.join(' / ')}）` : '';
    const text = resolved.hit
      ? `${prefix} ${monster.name}${tag}，造成 ${resolved.damage} 点伤害。`
      : `${monster.name}身形一晃，避开了你的攻势。`;
    return {
      playerId: player.id,
      text,
      kind: 'combat',
      floating: {
        x: monster.x,
        y: monster.y,
        text: resolved.hit ? `-${resolved.damage}` : '闪',
        color: floatColor,
      },
    };
  }

  private buildMonsterAttackMessage(
    monster: RuntimeMonster,
    player: PlayerState,
    resolved: ResolvedHit,
    floatColor: string,
  ): WorldMessage {
    const suffix: string[] = [];
    if (resolved.broken) suffix.push('破招');
    if (resolved.crit) suffix.push('暴击');
    if (resolved.resolved) suffix.push('化解');
    const tag = suffix.length > 0 ? `（${suffix.join(' / ')}）` : '';
    const text = resolved.hit
      ? `${monster.name}扑击你${tag}，造成 ${resolved.damage} 点伤害。`
      : `${monster.name}扑了个空，你险险避开。`;
    return {
      playerId: player.id,
      text,
      kind: 'combat',
      floating: {
        x: player.x,
        y: player.y,
        text: resolved.hit ? `-${resolved.damage}` : '闪',
        color: floatColor,
      },
    };
  }

  private buildPlayerVsPlayerAttackMessage(
    attacker: PlayerState,
    target: PlayerState,
    prefix: string,
    resolved: ResolvedHit,
    floatColor: string,
  ): WorldMessage {
    const suffix: string[] = [];
    if (resolved.broken) suffix.push('破招');
    if (resolved.crit) suffix.push('暴击');
    if (resolved.resolved) suffix.push('化解');
    const tag = suffix.length > 0 ? `（${suffix.join(' / ')}）` : '';
    const text = resolved.hit
      ? `${prefix} ${target.name}${tag}，造成 ${resolved.damage} 点伤害。`
      : `${target.name}身形一晃，避开了你的攻势。`;
    return {
      playerId: attacker.id,
      text,
      kind: 'combat',
      floating: {
        x: target.x,
        y: target.y,
        text: resolved.hit ? `-${resolved.damage}` : '闪',
        color: floatColor,
      },
    };
  }

  private buildPlayerUnderAttackMessage(
    attacker: PlayerState,
    target: PlayerState,
    resolved: ResolvedHit,
    floatColor: string,
  ): WorldMessage {
    const suffix: string[] = [];
    if (resolved.broken) suffix.push('破招');
    if (resolved.crit) suffix.push('暴击');
    if (resolved.resolved) suffix.push('化解');
    const tag = suffix.length > 0 ? `（${suffix.join(' / ')}）` : '';
    const text = resolved.hit
      ? `${attacker.name}袭向你${tag}，造成 ${resolved.damage} 点伤害。`
      : `${attacker.name}的攻势被你险险避开。`;
    return {
      playerId: target.id,
      text,
      kind: 'combat',
      floating: {
        x: target.x,
        y: target.y,
        text: resolved.hit ? `-${resolved.damage}` : '闪',
        color: floatColor,
      },
    };
  }

  private getPlayerCombatSnapshot(player: PlayerState): CombatSnapshot {
    return {
      stats: this.attrService.getPlayerNumericStats(player),
      ratios: this.attrService.getPlayerRatioDivisors(player),
      realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1)),
    };
  }

  private applyMonsterBuffStats(stats: NumericStats, buffs: TemporaryBuffState[] | undefined): void {
    if (!buffs || buffs.length === 0) {
      return;
    }
    for (const buff of buffs) {
      if (buff.remainingTicks <= 0 || buff.stacks <= 0 || !buff.stats) {
        continue;
      }
      const stacks = Math.max(1, buff.stacks);
      if (buff.stats.maxHp !== undefined) stats.maxHp += buff.stats.maxHp * stacks;
      if (buff.stats.maxQi !== undefined) stats.maxQi += buff.stats.maxQi * stacks;
      if (buff.stats.physAtk !== undefined) stats.physAtk += buff.stats.physAtk * stacks;
      if (buff.stats.spellAtk !== undefined) stats.spellAtk += buff.stats.spellAtk * stacks;
      if (buff.stats.physDef !== undefined) stats.physDef += buff.stats.physDef * stacks;
      if (buff.stats.spellDef !== undefined) stats.spellDef += buff.stats.spellDef * stacks;
      if (buff.stats.hit !== undefined) stats.hit += buff.stats.hit * stacks;
      if (buff.stats.dodge !== undefined) stats.dodge += buff.stats.dodge * stacks;
      if (buff.stats.crit !== undefined) stats.crit += buff.stats.crit * stacks;
      if (buff.stats.critDamage !== undefined) stats.critDamage += buff.stats.critDamage * stacks;
      if (buff.stats.breakPower !== undefined) stats.breakPower += buff.stats.breakPower * stacks;
      if (buff.stats.resolvePower !== undefined) stats.resolvePower += buff.stats.resolvePower * stacks;
      if (buff.stats.maxQiOutputPerTick !== undefined) stats.maxQiOutputPerTick += buff.stats.maxQiOutputPerTick * stacks;
      if (buff.stats.qiRegenRate !== undefined) stats.qiRegenRate += buff.stats.qiRegenRate * stacks;
      if (buff.stats.hpRegenRate !== undefined) stats.hpRegenRate += buff.stats.hpRegenRate * stacks;
      if (buff.stats.cooldownSpeed !== undefined) stats.cooldownSpeed += buff.stats.cooldownSpeed * stacks;
      if (buff.stats.auraCostReduce !== undefined) stats.auraCostReduce += buff.stats.auraCostReduce * stacks;
      if (buff.stats.auraPowerRate !== undefined) stats.auraPowerRate += buff.stats.auraPowerRate * stacks;
      if (buff.stats.playerExpRate !== undefined) stats.playerExpRate += buff.stats.playerExpRate * stacks;
      if (buff.stats.techniqueExpRate !== undefined) stats.techniqueExpRate += buff.stats.techniqueExpRate * stacks;
      if (buff.stats.realmExpPerTick !== undefined) stats.realmExpPerTick += buff.stats.realmExpPerTick * stacks;
      if (buff.stats.techniqueExpPerTick !== undefined) stats.techniqueExpPerTick += buff.stats.techniqueExpPerTick * stacks;
      if (buff.stats.lootRate !== undefined) stats.lootRate += buff.stats.lootRate * stacks;
      if (buff.stats.rareLootRate !== undefined) stats.rareLootRate += buff.stats.rareLootRate * stacks;
      if (buff.stats.viewRange !== undefined) stats.viewRange += buff.stats.viewRange * stacks;
      if (buff.stats.moveSpeed !== undefined) stats.moveSpeed += buff.stats.moveSpeed * stacks;
      if (buff.stats.elementDamageBonus) {
        for (const key of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
          if (buff.stats.elementDamageBonus[key] !== undefined) {
            stats.elementDamageBonus[key] += buff.stats.elementDamageBonus[key]! * stacks;
          }
        }
      }
      if (buff.stats.elementDamageReduce) {
        for (const key of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
          if (buff.stats.elementDamageReduce[key] !== undefined) {
            stats.elementDamageReduce[key] += buff.stats.elementDamageReduce[key]! * stacks;
          }
        }
      }
    }
  }

  private getMonsterCombatSnapshot(monster: RuntimeMonster): CombatSnapshot {
    const stats = createNumericStats();
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    stats.physAtk = monster.attack;
    stats.spellAtk = Math.max(1, Math.round(monster.attack * 0.9));
    stats.physDef = Math.max(0, Math.round(monster.maxHp * 0.18 + level * 2));
    stats.spellDef = Math.max(0, Math.round(monster.maxHp * 0.14 + level * 2));
    stats.hit = 12 + level * 8;
    stats.dodge = level * 4;
    stats.crit = level * 2;
    stats.critDamage = level * 6;
    stats.breakPower = level * 3;
    stats.resolvePower = level * 3;
    this.applyMonsterBuffStats(stats, monster.temporaryBuffs);
    return {
      stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      realmLv: level,
    };
  }

  private buildMonsterRenderEntity(viewer: PlayerState, monster: RuntimeMonster): RenderEntity {
    this.timeService.syncMonsterTimeEffects(monster);
    const snapshot = this.createMonsterObservationSnapshot(monster);
    return {
      id: monster.runtimeId,
      x: monster.x,
      y: monster.y,
      char: monster.char,
      color: monster.color,
      name: monster.name,
      kind: 'monster',
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      buffs: this.getRenderableBuffs(monster.temporaryBuffs),
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        this.buildObservationLineSpecs(snapshot, false),
      ),
    };
  }

  private buildNpcRenderEntity(viewer: PlayerState, npc: NpcConfig, mapId: string): RenderEntity {
    const profile = this.buildNpcPresenceProfile(npc, mapId);
    const snapshot = this.createNpcObservationSnapshot(profile);
    const lineSpecs = [
      { threshold: 0.3, label: '身份', value: profile.title },
      ...this.buildObservationLineSpecs(snapshot, false),
    ];
    const npcQuestMarker = this.resolveNpcQuestMarker(viewer, npc);
    return {
      id: `npc:${npc.id}`,
      x: npc.x,
      y: npc.y,
      char: npc.char,
      color: npc.color,
      name: npc.name,
      kind: 'npc',
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      npcQuestMarker,
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        lineSpecs,
      ),
    };
  }

  private createPlayerObservationSnapshot(player: PlayerState): ObservationTargetSnapshot {
    const stats = this.attrService.getPlayerNumericStats(player);
    const ratios = this.attrService.getPlayerRatioDivisors(player);
    const attrs = this.attrService.getPlayerFinalAttrs(player);
    const maxQi = Math.max(0, Math.round(stats.maxQi));
    return {
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      maxQi,
      spirit: Math.max(1, attrs.spirit),
      stats,
      ratios,
      attrs: { ...attrs },
      realmLabel: this.describePlayerRealm(player),
    };
  }

  private createMonsterObservationSnapshot(monster: RuntimeMonster): ObservationTargetSnapshot {
    const combat = this.getMonsterCombatSnapshot(monster);
    const spirit = this.estimateMonsterSpirit(monster);
    const maxQi = Math.max(24, Math.round(spirit * 2 + (monster.level ?? 1) * 8));
    const hpRatio = monster.maxHp > 0 ? monster.hp / monster.maxHp : 0;
    return {
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: Math.max(0, Math.round(maxQi * hpRatio)),
      maxQi,
      spirit,
      stats: combat.stats,
      ratios: combat.ratios,
      attrs: this.deriveAttrsFromStats(combat.stats, spirit),
      realmLabel: this.describeMonsterRealm(monster),
    };
  }

  private createNpcObservationSnapshot(profile: NpcPresenceProfile): ObservationTargetSnapshot {
    const stats = createNumericStats();
    stats.maxHp = profile.hp;
    stats.maxQi = profile.qi;
    stats.physAtk = Math.max(4, Math.round(profile.hp * 0.18 + profile.spirit * 0.6));
    stats.spellAtk = Math.max(4, Math.round(profile.qi * 0.2 + profile.spirit * 0.7));
    stats.physDef = Math.max(3, Math.round(profile.hp * 0.12 + profile.spirit * 0.4));
    stats.spellDef = Math.max(3, Math.round(profile.qi * 0.14 + profile.spirit * 0.45));
    stats.hit = Math.max(8, Math.round(profile.spirit * 0.9));
    stats.dodge = Math.max(0, Math.round(profile.spirit * 0.45));
    stats.crit = Math.max(0, Math.round(profile.spirit * 0.28));
    stats.critDamage = Math.max(0, Math.round(profile.spirit * 5));
    stats.breakPower = Math.max(0, Math.round(profile.spirit * 0.35));
    stats.resolvePower = Math.max(0, Math.round(profile.spirit * 0.42));
    stats.maxQiOutputPerTick = Math.max(0, Math.round(profile.qi * 0.22));
    stats.qiRegenRate = Math.max(0, Math.round(profile.spirit * 18));
    stats.hpRegenRate = Math.max(0, Math.round(profile.spirit * 12));
    stats.viewRange = 8 + Math.round(profile.spirit * 0.08);
    stats.moveSpeed = Math.max(0, Math.round(profile.spirit * 0.2));
    return {
      hp: profile.hp,
      maxHp: profile.hp,
      qi: profile.qi,
      maxQi: profile.qi,
      spirit: Math.max(1, profile.spirit),
      stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      attrs: this.deriveAttrsFromStats(stats, profile.spirit),
    };
  }

  private buildObservationLineSpecs(
    snapshot: ObservationTargetSnapshot,
    includeResources: boolean,
  ): ObservationLineSpec[] {
    const lines: ObservationLineSpec[] = [];
    if (includeResources) {
      lines.push(
        { threshold: 0.18, label: '生命', value: this.formatCurrentMax(snapshot.hp, snapshot.maxHp) },
        { threshold: 0.24, label: '灵力', value: this.formatCurrentMax(snapshot.qi, snapshot.maxQi) },
      );
    }

    lines.push(
      { threshold: 0.32, label: '物理攻击', value: this.formatWhole(snapshot.stats.physAtk) },
      { threshold: 0.36, label: '物理防御', value: this.formatWhole(snapshot.stats.physDef) },
      { threshold: 0.4, label: '法术攻击', value: this.formatWhole(snapshot.stats.spellAtk) },
      { threshold: 0.44, label: '法术防御', value: this.formatWhole(snapshot.stats.spellDef) },
      { threshold: 0.52, label: '命中', value: this.formatWhole(snapshot.stats.hit) },
      { threshold: 0.56, label: '闪避', value: this.formatRatio(snapshot.stats.dodge, snapshot.ratios.dodge) },
      { threshold: 0.64, label: '暴击', value: this.formatRatio(snapshot.stats.crit, snapshot.ratios.crit) },
      { threshold: 0.68, label: '暴击伤害', value: this.formatCritDamage(snapshot.stats.critDamage) },
      { threshold: 0.74, label: '破招', value: this.formatRatio(snapshot.stats.breakPower, snapshot.ratios.breakPower) },
      { threshold: 0.78, label: '化解', value: this.formatRatio(snapshot.stats.resolvePower, snapshot.ratios.resolvePower) },
      { threshold: 0.84, label: '最大灵力输出速率', value: `${this.formatWhole(snapshot.stats.maxQiOutputPerTick)} / 息` },
      { threshold: 0.87, label: '灵力回复', value: `${this.formatRate(snapshot.stats.qiRegenRate)} / 息` },
      { threshold: 0.89, label: '生命回复', value: `${this.formatRate(snapshot.stats.hpRegenRate)} / 息` },
    );

    if (snapshot.realmLabel) {
      lines.push({ threshold: 0.9, label: '境界', value: snapshot.realmLabel });
    }

    if (snapshot.attrs) {
      lines.push(
        { threshold: 0.92, label: '体魄', value: this.formatWhole(snapshot.attrs.constitution) },
        { threshold: 0.94, label: '神识', value: this.formatWhole(snapshot.attrs.spirit) },
        { threshold: 0.96, label: '身法', value: this.formatWhole(snapshot.attrs.perception) },
        { threshold: 0.98, label: '根骨', value: this.formatWhole(snapshot.attrs.talent) },
        { threshold: 0.99, label: '悟性', value: this.formatWhole(snapshot.attrs.comprehension) },
        { threshold: 1, label: '气运', value: this.formatWhole(snapshot.attrs.luck) },
      );
    }

    return lines;
  }

  private buildObservationInsight(
    viewer: PlayerState,
    snapshot: ObservationTargetSnapshot,
    lineSpecs: ObservationLineSpec[],
    selfView = false,
  ): ObservationInsight {
    const viewerSpirit = Math.max(1, this.attrService.getPlayerFinalAttrs(viewer).spirit);
    const progress = selfView ? 1 : this.computeObservationProgress(viewerSpirit, snapshot.spirit);
    return {
      clarity: this.resolveObservationClarity(progress),
      verdict: this.buildObservationVerdict(progress, selfView),
      lines: lineSpecs.map((line) => ({
        label: line.label,
        value: progress >= line.threshold ? line.value : '???',
      })),
    };
  }

  private computeObservationProgress(viewerSpirit: number, targetSpirit: number): number {
    if (targetSpirit <= 0) return 1;
    const ratio = viewerSpirit / targetSpirit;
    if (ratio <= OBSERVATION_BLIND_RATIO) return 0;
    if (ratio >= OBSERVATION_FULL_RATIO) return 1;
    return Math.max(0, Math.min(1, (ratio - OBSERVATION_BLIND_RATIO) / (OBSERVATION_FULL_RATIO - OBSERVATION_BLIND_RATIO)));
  }

  private resolveObservationClarity(progress: number): ObservationInsight['clarity'] {
    if (progress <= 0) return 'veiled';
    if (progress < 0.34) return 'blurred';
    if (progress < 0.68) return 'partial';
    if (progress < 1) return 'clear';
    return 'complete';
  }

  private buildObservationVerdict(progress: number, selfView: boolean): string {
    if (selfView) {
      return '神识内照，经络与底蕴尽现。';
    }
    if (progress <= 0) {
      return '对方气机晦涩，神识难以穿透。';
    }
    if (progress < 0.34) {
      return '仅能捕捉几缕外泄气机，难辨真底。';
    }
    if (progress < 0.68) {
      return '攻守轮廓渐明，深层底蕴仍藏于雾中。';
    }
    if (progress < 1) {
      return '神识已触及其根底，大半虚实可辨。';
    }
    return '神识压过其身，诸般底细尽入眼底。';
  }

  private buildNpcPresenceProfile(npc: NpcConfig, mapId: string): NpcPresenceProfile {
    const preset = NPC_ROLE_PROFILES[npc.role ?? ''] ?? { title: '过路修者', spirit: 12, hp: 60, qi: 56 };
    const actualDanger = this.mapService.getMapMeta(mapId)?.dangerLevel ?? 1;
    return {
      title: preset.title,
      spirit: Math.max(1, preset.spirit + actualDanger * 18),
      hp: Math.max(1, preset.hp + actualDanger * 24),
      qi: Math.max(0, preset.qi + actualDanger * 20),
    };
  }

  private estimateMonsterSpirit(monster: RuntimeMonster): number {
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    return Math.max(6, Math.round(level * 12 + monster.attack * 0.8 + monster.maxHp * 0.18));
  }

  private deriveAttrsFromStats(stats: NumericStats, spirit: number): Attributes {
    return {
      constitution: Math.max(1, Math.round(stats.maxHp / 18)),
      spirit: Math.max(1, Math.round(spirit)),
      perception: Math.max(1, Math.round((stats.hit + stats.dodge) / 14)),
      talent: Math.max(1, Math.round((stats.physAtk + stats.physDef) / 18)),
      comprehension: Math.max(1, Math.round((stats.spellAtk + stats.spellDef) / 18)),
      luck: Math.max(1, Math.round((stats.crit + stats.breakPower) / 12)),
    };
  }

  private describePlayerRealm(player: PlayerState): string {
    if (player.realm?.name) {
      return player.realm.shortName ? `${player.realm.name} · ${player.realm.shortName}` : player.realm.name;
    }
    if (player.realmName) {
      return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
    }
    return '行功未明';
  }

  private describeMonsterRealm(monster: RuntimeMonster): string {
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    if (level >= 8) return '凶阶妖躯';
    if (level >= 5) return '悍阶妖躯';
    if (level >= 3) return '成形妖躯';
    return '初成妖躯';
  }

  private formatCurrentMax(current: number, max: number): string {
    return `${this.formatWhole(current)} / ${this.formatWhole(max)}`;
  }

  private formatWhole(value: number): string {
    return `${Math.max(0, Math.round(value))}`;
  }

  private formatRate(value: number): string {
    const percent = Math.max(0, value) / 100;
    return `${percent.toFixed(percent % 1 === 0 ? 0 : percent % 0.1 === 0 ? 1 : 2)}%`;
  }

  private formatCritDamage(value: number): string {
    const total = 200 + Math.max(0, value) / 10;
    return `${total.toFixed(total % 1 === 0 ? 0 : total % 0.1 === 0 ? 1 : 2)}%`;
  }

  private formatRatio(value: number, divisor: number): string {
    return `${(Math.max(0, ratioValue(value, divisor)) * 100).toFixed(2)}%`;
  }

  private consumeQiForSkill(player: PlayerState, skill: SkillDef): number | string {
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const plannedCost = Math.max(0, skill.cost);
    const actualCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, numericStats.maxQiOutputPerTick)));
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return '当前灵力输出速率不足，无法稳定施展该技能';
    }
    if (player.qi < actualCost) {
      return `灵力不足，需要 ${actualCost} 点灵力`;
    }
    player.qi = Math.max(0, player.qi - actualCost);
    return actualCost;
  }

  private getEffectiveDropChance(player: PlayerState, drop: DropConfig): number {
    const stats = this.attrService.getPlayerNumericStats(player);
    const commonBonus = Math.max(0, stats.lootRate) / 10000;
    const rareBonus = drop.chance <= 0.2 ? Math.max(0, stats.rareLootRate) / 10000 : 0;
    return Math.min(1, drop.chance * (1 + commonBonus + rareBonus));
  }

  private inferMonsterElement(monster: RuntimeMonster): ElementKey | undefined {
    const source = `${monster.id}:${monster.name}`;
    if (source.includes('火') || source.includes('焰') || source.includes('血羽')) return 'fire';
    if (source.includes('寒') || source.includes('冰') || source.includes('霜') || source.includes('泽')) return 'water';
    if (source.includes('竹') || source.includes('木') || source.includes('藤')) return 'wood';
    if (source.includes('矿') || source.includes('金') || source.includes('刀') || source.includes('刃') || source.includes('星')) return 'metal';
    if (source.includes('石') || source.includes('骨') || source.includes('魂') || source.includes('谷')) return 'earth';
    return undefined;
  }

  drainEffects(mapId: string): CombatEffect[] {
    const effects = this.effectsByMap.get(mapId) ?? [];
    this.effectsByMap.set(mapId, []);
    return effects;
  }

  private advanceQuestProgress(player: PlayerState, monsterId: string, monsterName: string): WorldDirtyFlag[] {
    let changed = false;
    for (const quest of player.quests) {
      if (quest.status !== 'active' || quest.objectiveType !== 'kill' || quest.targetMonsterId !== monsterId) continue;
      quest.progress = Math.min(quest.required, quest.progress + 1);
      quest.targetName = monsterName;
      changed = true;
    }

    if (changed && this.refreshQuestStatuses(player)) {
      return ['quest', 'actions'];
    }
    return changed ? ['quest'] : [];
  }

  private refreshQuestStatuses(player: PlayerState): boolean {
    let changed = false;
    for (const quest of player.quests) {
      const config = this.mapService.getQuest(quest.id);
      if (!config) continue;
      const hasKillProgress = quest.progress >= quest.required;
      const hasItems = !config?.requiredItemId || this.getInventoryCount(player, config.requiredItemId) >= (config.requiredItemCount ?? 1);
      if (quest.status === 'active' && hasKillProgress && hasItems) {
        quest.status = 'ready';
        changed = true;
      } else if (quest.status === 'ready' && !hasItems) {
        quest.status = 'active';
        changed = true;
      }
    }
    return changed;
  }

  private resolveQuestProgress(player: PlayerState, questState: QuestState, config: QuestConfig): number {
    switch (config.objectiveType) {
      case 'learn_technique':
        return player.techniques.some((entry) => entry.techId === config.targetTechniqueId)
          ? questState.required
          : 0;
      case 'realm_progress': {
        if (config.targetRealmStage === undefined || !player.realm) return 0;
        if (player.realm.stage > config.targetRealmStage) {
          return questState.required;
        }
        if (player.realm.stage < config.targetRealmStage) {
          return 0;
        }
        return Math.min(questState.required, player.realm.progress);
      }
      case 'realm_stage':
        return config.targetRealmStage !== undefined && player.realm && player.realm.stage >= config.targetRealmStage
          ? questState.required
          : 0;
      case 'kill':
      default:
        return questState.progress;
    }
  }

  private ensureMapInitialized(mapId: string) {
    if (this.monstersByMap.has(mapId)) return;

    const monsters: RuntimeMonster[] = [];
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      for (let index = 0; index < spawn.maxAlive; index++) {
        const runtime: RuntimeMonster = {
          ...spawn,
          runtimeId: `monster:${mapId}:${spawn.id}:${index}`,
          mapId,
          spawnX: spawn.x,
          spawnY: spawn.y,
          hp: spawn.maxHp,
          alive: true,
          respawnLeft: 0,
          temporaryBuffs: [],
          damageContributors: new Map(),
          targetPlayerId: undefined,
        };
        const pos = this.findSpawnPosition(mapId, runtime);
        if (pos && this.mapService.isWalkable(mapId, pos.x, pos.y, { actorType: 'monster' })) {
          runtime.x = pos.x;
          runtime.y = pos.y;
          this.mapService.addOccupant(mapId, runtime.x, runtime.y, runtime.runtimeId, 'monster');
        } else {
          runtime.x = spawn.x;
          runtime.y = spawn.y;
          runtime.alive = false;
          runtime.respawnLeft = runtime.respawnTicks;
        }
        monsters.push(runtime);
      }
    }

    this.monstersByMap.set(mapId, monsters);
  }

  private getNpcInteractionState(player: PlayerState, npc: NpcConfig): NpcInteractionState {
    for (const quest of npc.quests) {
      const questState = player.quests.find((entry) => entry.id === quest.id);
      if (questState && questState.status !== 'completed') {
        return { quest, questState };
      }
      if (!questState) {
        const hasLaterProgress = npc.quests
          .slice(npc.quests.indexOf(quest) + 1)
          .some((candidate) => player.quests.some((entry) => entry.id === candidate.id));
        if (hasLaterProgress) {
          continue;
        }
        const previousIncomplete = npc.quests
          .slice(0, npc.quests.indexOf(quest))
          .some((candidate) => player.quests.find((entry) => entry.id === candidate.id)?.status !== 'completed');
        if (!previousIncomplete) {
          return { quest };
        }
        break;
      }
    }
    return {};
  }

  private resolveNpcQuestMarker(player: PlayerState, npc: NpcConfig): NpcQuestMarker | undefined {
    const interaction = this.getNpcInteractionState(player, npc);
    if (interaction.quest && !interaction.questState) {
      return { line: interaction.quest.line, state: 'available' };
    }
    if (interaction.questState?.status === 'ready') {
      return { line: interaction.questState.line, state: 'ready' };
    }
    if (interaction.questState?.status === 'active') {
      return { line: interaction.questState.line, state: 'active' };
    }
    return undefined;
  }

  private buildRewardItems(quest: QuestConfig): ItemStack[] {
    const rewards = quest.rewards.length > 0
      ? quest.rewards
      : quest.rewardItemIds.map((itemId) => ({
          itemId,
          name: itemId,
          type: 'material' as const,
          count: 1,
          chance: 1,
        }));
    return rewards
      .map((reward) => this.createItemFromDrop(reward))
      .filter((item): item is ItemStack => Boolean(item));
  }

  private buildQuestStateRewards(quest: QuestState): ItemStack[] {
    if (quest.rewards?.length) {
      return quest.rewards
        .map((reward) => this.contentService.createItem(reward.itemId, reward.count) ?? { ...reward })
        .filter((item): item is ItemStack => Boolean(item));
    }
    const rewardIds = quest.rewardItemIds?.length ? quest.rewardItemIds : [quest.rewardItemId];
    return rewardIds
      .map((itemId) => this.contentService.createItem(itemId))
      .filter((item): item is ItemStack => Boolean(item));
  }

  private canReceiveItems(player: PlayerState, items: ItemStack[]): boolean {
    const simulated = player.inventory.items.map((item) => ({ ...item }));
    for (const item of items) {
      const signature = createItemStackSignature(item);
      const existing = simulated.find((entry) => createItemStackSignature(entry) === signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      if (simulated.length >= player.inventory.capacity) {
        return false;
      }
      simulated.push({ ...item });
    }
    return true;
  }

  private createItemFromDrop(drop: DropConfig): ItemStack | null {
    return this.contentService.createItem(drop.itemId, drop.count) ?? {
      itemId: drop.itemId,
      name: drop.name,
      type: drop.type,
      count: drop.count,
      desc: drop.name,
    };
  }

  private consumeInventoryItem(player: PlayerState, itemId: string, count: number): string | null {
    let remaining = count;
    while (remaining > 0) {
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) {
        return '任务物品不足，暂时无法交付';
      }
      const stack = this.inventoryService.getItem(player, slotIndex);
      if (!stack) {
        return '任务物品不足，暂时无法交付';
      }
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) {
        return '任务物品不足，暂时无法交付';
      }
      remaining -= removed.count;
    }
    return null;
  }

  private getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((total, item) => total + item.count, 0);
  }

  private describeQuestProgress(questState: QuestState, questConfig?: QuestConfig): string {
    const objective = questState.objectiveText ?? questConfig?.objectiveText ?? questState.desc;
    const parts = [objective];
    switch (questState.objectiveType) {
      case 'learn_technique':
        parts.push(questState.progress >= questState.required
          ? `已参悟 ${questState.targetName}`
          : `尚未参悟 ${questState.targetName}`);
        break;
      case 'realm_stage':
        parts.push(`境界进度 ${questState.progress}/${questState.required}`);
        if (questConfig?.targetRealmStage !== undefined) {
          parts.push(`目标境界 ${this.getRealmStageName(questConfig.targetRealmStage)}`);
        }
        break;
      case 'realm_progress':
      case 'kill':
      default:
        parts.push(`当前进度 ${questState.progress}/${questState.required}`);
        break;
    }
    if (questConfig?.requiredItemId) {
      const itemName = this.contentService.getItem(questConfig.requiredItemId)?.name
        ?? (isLikelyInternalContentId(questConfig.requiredItemId) ? '任务物品' : questConfig.requiredItemId);
      parts.push(`提交物品 ${itemName} x${questConfig.requiredItemCount ?? 1}`);
    }
    return parts.join('，');
  }

  private getRealmStageName(stage: PlayerRealmStage): string {
    return this.contentService.getRealmStageStartEntry(stage)?.displayName ?? '未知境界';
  }

  private findNearestLivingMonster(player: PlayerState, maxDistance: number): RuntimeMonster | undefined {
    this.ensureMapInitialized(player.mapId);
    let best: RuntimeMonster | undefined;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const monster of this.monstersByMap.get(player.mapId) ?? []) {
      if (!monster.alive) continue;
      const distanceSq = distanceSquared(player, monster);
      if (distanceSq > maxDistance * maxDistance) continue;
      if (!this.aoiService.inView(player, monster.x, monster.y, maxDistance)) continue;
      if (distanceSq < bestDistance) {
        best = monster;
        bestDistance = distanceSq;
      }
    }
    return best;
  }

  private findNearestPlayer(monster: RuntimeMonster, players: PlayerState[], viewRange: number): PlayerState | undefined {
    let best: PlayerState | undefined;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const player of players) {
      if (player.dead || player.mapId !== monster.mapId) continue;
      const distanceSq = distanceSquared(player, monster);
      if (distanceSq > viewRange * viewRange) continue;
      if (!this.aoiService.inViewAt(monster.mapId, monster.x, monster.y, viewRange, player.x, player.y, monster.runtimeId)) continue;
      if (distanceSq < bestDistance) {
        best = player;
        bestDistance = distanceSq;
      }
    }
    return best;
  }

  private resolveMonsterTarget(monster: RuntimeMonster, players: PlayerState[], timeState: GameTimeState): PlayerState | undefined {
    if (monster.targetPlayerId) {
      const target = players.find((player) => (
        player.id === monster.targetPlayerId
        && !player.dead
        && player.mapId === monster.mapId
      ));
      if (target && this.aoiService.inViewAt(monster.mapId, monster.x, monster.y, timeState.effectiveViewRange, target.x, target.y, monster.runtimeId)) {
        return target;
      }
      monster.targetPlayerId = undefined;
    }

    if (!this.isMonsterAutoAggroEnabled(monster, timeState)) {
      return undefined;
    }

    const target = this.findNearestPlayer(monster, players, timeState.effectiveViewRange);
    if (target) {
      monster.targetPlayerId = target.id;
    }
    return target;
  }

  private isMonsterAutoAggroEnabled(monster: RuntimeMonster, timeState: GameTimeState): boolean {
    switch (monster.aggroMode) {
      case 'retaliate':
        return false;
      case 'day_only':
        return !this.timeService.isNightAggroWindow(timeState);
      case 'night_only':
        return this.timeService.isNightAggroWindow(timeState);
      case 'always':
      default:
        return true;
    }
  }

  private respawnPlayer(player: PlayerState) {
    this.restorePlayerAfterDefeat(player, true);
  }

  private restorePlayerAfterDefeat(player: PlayerState, occupy: boolean) {
    const spawn = this.mapService.getSpawnPoint(player.mapId) ?? { x: player.x, y: player.y };
    const pos = this.findNearbyWalkable(player.mapId, spawn.x, spawn.y, 4) ?? spawn;
    this.navigationService.clearMoveTarget(player.id);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.x = pos.x;
    player.y = pos.y;
    player.facing = Direction.South;
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);
    player.dead = false;
    player.autoBattle = false;
    this.clearCombatTarget(player);
    if (occupy) {
      this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');
    }
  }

  private stepToward(
    mapId: string,
    actor: { x: number; y: number },
    targetX: number,
    targetY: number,
    occupancyId: string,
  ): Direction | null {
    const dx = targetX - actor.x;
    const dy = targetY - actor.y;
    const options = Math.abs(dx) >= Math.abs(dy)
      ? [
          { x: actor.x + Math.sign(dx), y: actor.y, facing: dx >= 0 ? Direction.East : Direction.West },
          { x: actor.x, y: actor.y + Math.sign(dy), facing: dy >= 0 ? Direction.South : Direction.North },
        ]
      : [
          { x: actor.x, y: actor.y + Math.sign(dy), facing: dy >= 0 ? Direction.South : Direction.North },
          { x: actor.x + Math.sign(dx), y: actor.y, facing: dx >= 0 ? Direction.East : Direction.West },
        ];

    for (const option of options) {
      if (option.x === actor.x && option.y === actor.y) continue;
      if (!this.mapService.isWalkable(mapId, option.x, option.y, { actorType: 'monster' })) continue;
      this.mapService.removeOccupant(mapId, actor.x, actor.y, occupancyId);
      actor.x = option.x;
      actor.y = option.y;
      this.mapService.addOccupant(mapId, actor.x, actor.y, occupancyId, 'monster');
      return option.facing;
    }
    return null;
  }

  private getAdjacentNpcs(player: PlayerState): NpcConfig[] {
    return this.mapService.getNpcs(player.mapId)
      .filter((npc) => isPointInRange(player, npc, 1));
  }

  private findSpawnPosition(mapId: string, monster: RuntimeMonster): { x: number; y: number } | null {
    const candidates: Array<{ x: number; y: number }> = [];
    const radius = Math.max(0, monster.radius);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = monster.spawnX + dx;
        const ny = monster.spawnY + dy;
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (this.mapService.isWalkable(mapId, nx, ny, { actorType: 'monster' })) {
          candidates.push({ x: nx, y: ny });
        }
      }
    }
    if (candidates.length === 0 && this.mapService.isWalkable(mapId, monster.spawnX, monster.spawnY, { actorType: 'monster' })) {
      return { x: monster.spawnX, y: monster.spawnY };
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findNearbyWalkable(mapId: string, x: number, y: number, maxRadius = 3): { x: number; y: number } | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.mapService.isWalkable(mapId, nx, ny, { actorType: 'player' })) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  private resolveCombatTarget(player: PlayerState): ResolvedTarget | undefined {
    if (!player.combatTargetId) return undefined;
    const target = this.resolveTargetRef(player, player.combatTargetId);
    if (!target) {
      this.clearCombatTarget(player);
      return undefined;
    }
    return target;
  }

  private canPlayerSeeTarget(player: PlayerState, target: ResolvedTarget, effectiveViewRange: number): boolean {
    if (!isPointInRange(player, target, effectiveViewRange)) {
      return false;
    }
    return this.aoiService.inView(player, target.x, target.y, effectiveViewRange);
  }

  private resolveTargetRef(
    player: PlayerState,
    targetRef: string,
  ): ResolvedTarget | null {
    if (targetRef.startsWith('monster:')) {
      const monster = (this.monstersByMap.get(player.mapId) ?? []).find((entry) => entry.runtimeId === targetRef && entry.alive);
      if (!monster) return null;
      return { kind: 'monster', x: monster.x, y: monster.y, monster };
    }

    if (targetRef.startsWith('player:')) {
      const playerId = targetRef.slice('player:'.length);
      const targetPlayer = this.playerService.getPlayer(playerId);
      if (!targetPlayer || targetPlayer.id === player.id || targetPlayer.mapId !== player.mapId || targetPlayer.dead) {
        return null;
      }
      return { kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer };
    }

    const tileTarget = parseTileTargetRef(targetRef);
    if (tileTarget) {
      const { x, y } = tileTarget;
      const tile = this.mapService.getTile(player.mapId, x, y);
      if (!tile || this.mapService.isTileDestroyed(player.mapId, x, y)) return null;
      return { kind: 'tile', x, y, tileType: tile.type };
    }

    return null;
  }

  private attackTerrain(
    player: PlayerState,
    x: number,
    y: number,
    damage: number,
    skillName: string,
    targetName: string,
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    activeAttackBehavior = false,
  ): WorldUpdate {
    const cultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(player, 'attack')
      : { changed: false, dirty: [], messages: [] };
    const result = this.mapService.damageTile(player.mapId, x, y, damage);
    if (!result) {
      return { ...EMPTY_UPDATE, error: '该目标无法被攻击' };
    }

    this.pushEffect(player.mapId, {
      type: 'attack',
      fromX: player.x,
      fromY: player.y,
      toX: x,
      toY: y,
      color: getDamageTrailColor(damageKind, element),
    });
    this.pushEffect(player.mapId, {
      type: 'float',
      x,
      y,
      text: `-${damage}`,
      color: getDamageTrailColor(damageKind, element),
    });

    const messages: WorldMessage[] = [
      ...cultivation.messages.map((message) => ({
        playerId: player.id,
        text: message.text,
        kind: message.kind,
      })),
      {
        playerId: player.id,
        text: `${skillName}击中${targetName}，造成 ${damage} 点伤害。`,
        kind: 'combat',
      },
    ];
    if (result.destroyed) {
      messages.push({
        playerId: player.id,
        text: `${targetName} 被击毁了。`,
        kind: 'combat',
      });
    }
    return { messages, dirty: cultivation.dirty as WorldDirtyFlag[] };
  }

  private pushEffect(mapId: string, effect: CombatEffect) {
    const list = this.effectsByMap.get(mapId) ?? [];
    list.push(effect);
    this.effectsByMap.set(mapId, list);
  }

  private pushActionLabelEffect(mapId: string, x: number, y: number, text: string) {
    this.pushEffect(mapId, {
      type: 'float',
      x,
      y,
      text,
      color: '#efe3c2',
      variant: 'action',
    });
  }

  private faceToward(player: PlayerState, targetX: number, targetY: number) {
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      player.facing = dx > 0 ? Direction.East : Direction.West;
      return;
    }
    if (dy !== 0) {
      player.facing = dy > 0 ? Direction.South : Direction.North;
    }
  }

  private performBasicAttack(player: PlayerState, target: ResolvedTarget): WorldUpdate {
    const combat = this.getPlayerCombatSnapshot(player);
    const useSpellAttack = combat.stats.spellAtk > combat.stats.physAtk;
    const damageKind: SkillDamageKind = useSpellAttack ? 'spell' : 'physical';
    const baseDamage = Math.max(1, Math.round(useSpellAttack ? combat.stats.spellAtk : combat.stats.physAtk));
    this.pushActionLabelEffect(player.mapId, player.x, player.y, '攻击');
    if (target.kind === 'monster') {
      return this.attackMonster(player, target.monster, baseDamage, '你攻击命中', damageKind, undefined, 0, true);
    }
    if (target.kind === 'player') {
      return this.attackPlayer(player, target.player, baseDamage, '你攻击命中', damageKind, undefined, 0, true);
    }
    return this.attackTerrain(player, target.x, target.y, baseDamage, '你攻击', target.tileType ?? '目标', damageKind, undefined, true);
  }

  private getTargetRef(target: ResolvedTarget): string {
    if (target.kind === 'monster') {
      return target.monster.runtimeId;
    }
    if (target.kind === 'player') {
      return `player:${target.player.id}`;
    }
    return `tile:${target.x}:${target.y}`;
  }

  private clearCombatTarget(player: PlayerState): void {
    player.combatTargetId = undefined;
    player.combatTargetLocked = false;
  }

  /** 获取指定地图的所有运行时怪物（GM 世界管理用） */
  getRuntimeMonstersForGm(mapId: string): {
    id: string; x: number; y: number; char: string; color: string;
    name: string; hp: number; maxHp: number; alive: boolean;
    targetPlayerId?: string; respawnLeft: number;
  }[] {
    this.ensureMapInitialized(mapId);
    return (this.monstersByMap.get(mapId) ?? []).map((m) => ({
      id: m.runtimeId,
      x: m.x,
      y: m.y,
      char: m.char || '妖',
      color: m.color || '#d27a7a',
      name: m.name || m.id,
      hp: m.hp,
      maxHp: m.maxHp ?? m.hp,
      alive: m.alive,
      targetPlayerId: m.targetPlayerId,
      respawnLeft: m.respawnLeft,
    }));
  }
}
