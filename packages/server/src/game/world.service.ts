/**
 * 世界服务 —— 游戏核心逻辑的编排层。
 * 负责战斗结算、技能释放、NPC 交互、任务推进、怪物 AI、
 * 自动战斗、传送、观察系统等所有与"世界规则"相关的行为。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ActionDef,
  Attributes,
  basisPointModifierToMultiplier,
  buildDefaultCombatTargetingRules,
  buildEffectiveTargetingGeometry,
  BuffModifierMode,
  calculateDispersedAuraGainPerTile,
  EQUIP_SLOTS,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  addPartialNumericStats,
  applyNumericStatsPercentMultiplier,
  calcQiCostWithOutputLimit,
  cloneNumericStats,
  CombatEffect,
  resolveTargetingGeometry,
  computeAffectedCellsFromAnchor,
  createNumericStats,
  DEFAULT_RATIO_DIVISOR,
  DISPERSED_AURA_RESOURCE_KEY,
  Direction,
  ElementKey,
  ELEMENT_KEYS,
  ELEMENT_KEY_LABELS,
  gameplayConstants,
  GameTimeState,
  getBasicAttackCombatExperienceDamageMultiplier,
  getFirstGrapheme,
  getDamageTrailColor,
  getBuffRealmEffectivenessMultiplier,
  hasCombatTargetingRule,
  gridDistance,
  isOffsetInRange,
  getRealmGapDamageMultiplier,
  isPointInRange,
  ItemStack,
  MONSTER_TIER_LABELS,
  MonsterInitialBuffDef,
  NumericRatioDivisors,
  NumericStats,
  PartialNumericStats,
  percentModifierToMultiplier,
  normalizeCombatTargetingRules,
  parseTileTargetRef,
  PendingLogbookMessage,
  PlayerState,
  Portal,
  QuestState,
  RenderEntity,
  resolveMonsterNumericStatsFromAttributes,
  type ObservedTileEntityDetail,
  ratioValue,
  SkillDef,
  SkillDamageKind,
  SkillEffectDef,
  SkillFormula,
  SkillFormulaVar,
  SyncedItemStack,
  SyncedNpcShopView,
  TemporaryBuffState,
  TILE_TYPE_LABELS,
  TileType,
  VisibleBuffState,
  signedRatioValue,
} from '@mud/shared';
import * as fs from 'fs';
import { resolveServerDataPath } from '../common/data-path';
import {
  RETURN_TO_SPAWN_ACTION_ID,
  RETURN_TO_SPAWN_COOLDOWN_TICKS,
} from '../constants/gameplay/action';
import {
  BLOOD_ESSENCE_ITEM_ID,
  BLOOD_ESSENCE_SHA_GAIN,
  PVP_SHA_INFUSION_BUFF_ID,
  PVP_SHA_INFUSION_DECAY_TICKS,
  PVP_SHA_INFUSION_SOURCE_ID,
  PVP_SOUL_INJURY_BUFF_ID,
  PVP_SOUL_INJURY_DURATION_TICKS,
  PVP_SOUL_INJURY_SOURCE_ID,
  REFINED_SHA_RESOURCE_KEY,
} from '../constants/gameplay/pvp';
import {
  FIRE_BURN_MARK_BOSS_MULTIPLIER,
  FIRE_BURN_MARK_BUFF_ID,
  FIRE_BURN_MARK_HP_RATIO_PER_STACK,
  FIRE_BURN_MARK_VARIANT_MULTIPLIER,
} from '../constants/gameplay/technique-buffs';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { AttrService } from './attr.service';
import { AoiService } from './aoi.service';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { getBuffSustainCost } from './buff-sustain';
import { ContentService } from './content.service';
import { EquipmentEffectService } from './equipment-effect.service';
import { InventoryService } from './inventory.service';
import { LootService } from './loot.service';
import { ContainerConfig, DropConfig, MapService, MonsterSpawnConfig, NpcConfig, NpcShopItemConfig, QuestConfig } from './map.service';
import { NavigationService } from './navigation.service';
import { PerformanceService } from './performance.service';
import { PlayerService } from './player.service';
import { resolveQuestTargetName } from './quest-display';
import { TechniqueService } from './technique.service';
import { ThreatService } from './threat.service';
import { TimeService } from './time.service';
import { AlchemyService } from './alchemy.service';
import { EnhancementService } from './enhancement.service';
import { TechniqueActivityService } from './technique-activity.service';
import { buildMonsterInitialBuffSourceId } from './temporary-buff-storage';
import {
  DEFAULT_MONSTER_RATIO_DIVISORS,
  EMPTY_UPDATE,
  PLAYER_CROWD_CHAR,
  PLAYER_CROWD_COLOR,
  PLAYER_CROWD_DENSE_COLOR,
  PLAYER_CROWD_DENSE_NAME_THRESHOLD,
  PLAYER_CROWD_RENDER_THRESHOLD,
} from '../constants/world/overview';
import {
  ORE_REWARD_BASE_CHANCE_BPS_BY_TILE,
  ORE_REWARD_BASE_DAMAGE,
  ORE_REWARD_DAMAGE_SCALE,
  ORE_REWARD_ITEM_ID_BY_TILE,
  ORE_REWARD_SOURCE_LABEL_BY_TILE,
} from '../constants/gameplay/terrain';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';
import {
  MONSTER_LOST_SIGHT_CHASE_TICKS,
  MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
  ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER,
  ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD,
} from '../constants/gameplay/monster';
import {
  applyAttributeAdditions,
  applyAttributePercentMultipliers,
  createMonsterAttributeSnapshot,
  DEFENSE_REDUCTION_ATTACK_RATIO,
  DEFENSE_REDUCTION_BASELINE,
  HUANLING_CANMAI_SUOBU_BUFF_ID,
  HUANLING_CANPO_ZHANG_SKILL_ID,
  HUANLING_DIFU_CHENYIN_SKILL_ID,
  HUANLING_DUANHUN_DING_SKILL_ID,
  HUANLING_FAXIANG_BUFF_ID,
  HUANLING_FAXIANG_SKILL_ID,
  HUANLING_LIEFU_WAIHUAN_SKILL_ID,
  HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
  HUANLING_RONGHE_GUANMAI_SKILL_ID,
  HUANLING_RONGMAI_YIN_BUFF_ID,
  HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
  HUANLING_XINGLUO_CANPAN_SKILL_ID,
  HUANLING_ZHENREN_MONSTER_ID,
  INTRO_BODY_TECHNIQUE_BOOK_ID,
  INTRO_BODY_TECHNIQUE_ID,
  INTRO_BODY_TEMPERING_QUEST_ID,
  MAP_MONSTER_RUNTIME_DOCUMENT_KEY,
  MONSTER_ATTR_KEYS,
  NPC_SHOP_RUNTIME_DOCUMENT_KEY,
  RUNTIME_STATE_SCOPE,
  STATIC_CONTEXT_TOGGLE_ACTIONS,
  TERRAIN_MOLTEN_POOL_BURN_BUFF_ID,
} from './world.service.shared';
import {
  applyMonsterBuffStats as applyMonsterBuffStatsHelper,
  collectMonsterBuffAttrBonuses as collectMonsterBuffAttrBonusesHelper,
  getMonsterFinalAttrs as getMonsterFinalAttrsHelper,
  hasMonsterAttributeModifiers as hasMonsterAttributeModifiersHelper,
} from './world-monster-attrs.helpers';
import {
  evaluateSkillFormula as evaluateSkillFormulaHelper,
  SkillFormulaContext,
} from './world-skill-formula.helpers';
import { WorldObservationDomain } from './world-observation.domain';
import { WorldQuestDomain } from './world-quest.domain';
import {
  MonsterSpawnAccelerationState,
  PendingMonsterSkillCast,
  PersistedMonsterRuntimeRecord,
  PersistedMonsterRuntimeSnapshot,
  PersistedMonsterSpawnAccelerationRecord,
  PersistedNpcShopRuntimeRecord,
  PersistedNpcShopRuntimeSnapshot,
  WorldRuntimePersistenceDomain,
} from './world-runtime-persistence.domain';
import { WorldTargetingDomain } from './world-targeting.domain';

/** MessageKind：定义该类型的结构与数据语义。 */
type MessageKind = 'system' | 'quest' | 'combat' | 'loot';
/** WorldDirtyFlag：定义该类型的结构与数据语义。 */
type WorldDirtyFlag = 'inv' | 'quest' | 'actions' | 'tech' | 'attr' | 'loot';

/** RuntimeMonster：定义该接口的能力与字段约束。 */
interface RuntimeMonster extends MonsterSpawnConfig {
/** runtimeId：定义该变量以承载业务值。 */
  runtimeId: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** spawnKey：定义该变量以承载业务值。 */
  spawnKey: string;
/** spawnX：定义该变量以承载业务值。 */
  spawnX: number;
/** spawnY：定义该变量以承载业务值。 */
  spawnY: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** alive：定义该变量以承载业务值。 */
  alive: boolean;
/** respawnLeft：定义该变量以承载业务值。 */
  respawnLeft: number;
/** temporaryBuffs：定义该变量以承载业务值。 */
  temporaryBuffs: TemporaryBuffState[];
/** skillCooldowns：定义该变量以承载业务值。 */
  skillCooldowns: Record<string, number>;
/** damageContributors：定义该变量以承载业务值。 */
  damageContributors: Map<string, number>;
  facing?: Direction;
  targetPlayerId?: string;
  lastSeenTargetX?: number;
  lastSeenTargetY?: number;
  lastSeenTargetTick?: number;
  pendingCast?: PendingMonsterSkillCast;
}

/** ResolvedNpcShopStockState：定义该接口的能力与字段约束。 */
interface ResolvedNpcShopStockState {
/** stateKey：定义该变量以承载业务值。 */
  stateKey: string;
/** stockLimit：定义该变量以承载业务值。 */
  stockLimit: number;
/** refreshWindowStartMs：定义该变量以承载业务值。 */
  refreshWindowStartMs: number;
  refreshAt?: number;
/** soldQuantity：定义该变量以承载业务值。 */
  soldQuantity: number;
/** remainingQuantity：定义该变量以承载业务值。 */
  remainingQuantity: number;
}

/** ResolvedNpcShopItemRuntime：定义该接口的能力与字段约束。 */
interface ResolvedNpcShopItemRuntime {
/** item：定义该变量以承载业务值。 */
  item: ItemStack;
/** unitPrice：定义该变量以承载业务值。 */
  unitPrice: number;
  stock?: ResolvedNpcShopStockState;
}


/** tick 中产生的消息，最终推送给对应玩家 */
export interface WorldMessage {
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** text：定义该变量以承载业务值。 */
  text: string;
  kind?: MessageKind;
  floating?: {
/** x：定义该变量以承载业务值。 */
    x: number;
/** y：定义该变量以承载业务值。 */
    y: number;
/** text：定义该变量以承载业务值。 */
    text: string;
    color?: string;
  };
}

/** 世界逻辑执行结果，包含错误、消息、脏标记等 */
export interface WorldUpdate {
  error?: string;
/** messages：定义该变量以承载业务值。 */
  messages: WorldMessage[];
/** dirty：定义该变量以承载业务值。 */
  dirty: WorldDirtyFlag[];
  dirtyPlayers?: string[];
  usedActionId?: string;
  consumedAction?: boolean;
  playerDefeated?: boolean;
}


/** CombatSnapshot：定义该接口的能力与字段约束。 */
interface CombatSnapshot {
/** attrs：定义该变量以承载业务值。 */
  attrs: Attributes;
/** stats：定义该变量以承载业务值。 */
  stats: NumericStats;
/** ratios：定义该变量以承载业务值。 */
  ratios: NumericRatioDivisors;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** combatExp：定义该变量以承载业务值。 */
  combatExp: number;
}

/** ResolvedHit：定义该接口的能力与字段约束。 */
interface ResolvedHit {
/** hit：定义该变量以承载业务值。 */
  hit: boolean;
/** rawDamage：定义该变量以承载业务值。 */
  rawDamage: number;
/** damage：定义该变量以承载业务值。 */
  damage: number;
/** effectiveDamage：定义该变量以承载业务值。 */
  effectiveDamage: number;
/** crit：定义该变量以承载业务值。 */
  crit: boolean;
/** dodged：定义该变量以承载业务值。 */
  dodged: boolean;
/** resolved：定义该变量以承载业务值。 */
  resolved: boolean;
/** broken：定义该变量以承载业务值。 */
  broken: boolean;
/** qiCost：定义该变量以承载业务值。 */
  qiCost: number;
}


/** MonsterExpParticipant：定义该接口的能力与字段约束。 */
interface MonsterExpParticipant {
/** player：定义该变量以承载业务值。 */
  player: PlayerState;
/** contribution：定义该变量以承载业务值。 */
  contribution: number;
}

/** MonsterLootRecipient：定义该接口的能力与字段约束。 */
interface MonsterLootRecipient {
/** player：定义该变量以承载业务值。 */
  player: PlayerState;
/** weight：定义该变量以承载业务值。 */
  weight: number;
}

/** ResolvedTarget：定义该类型的结构与数据语义。 */
type ResolvedTarget =
  | { kind: 'monster'; x: number; y: number; monster: RuntimeMonster }
  | { kind: 'player'; x: number; y: number; player: PlayerState }
  | { kind: 'container'; x: number; y: number; container: ContainerConfig }
  | { kind: 'tile'; x: number; y: number; tileType?: string };

/** AutoBattleSkillCandidate：定义该接口的能力与字段约束。 */
interface AutoBattleSkillCandidate {
/** action：定义该变量以承载业务值。 */
  action: ActionDef;
/** skill：定义该变量以承载业务值。 */
  skill: SkillDef;
}

/** BuffTargetEntity：定义该类型的结构与数据语义。 */
type BuffTargetEntity =
  | { kind: 'player'; player: PlayerState }
  | { kind: 'monster'; monster: RuntimeMonster };

@Injectable()
/** WorldService：封装相关状态与行为。 */
export class WorldService implements OnModuleInit, OnModuleDestroy {
  private readonly monstersByMap = new Map<string, RuntimeMonster[]>();
  private readonly monsterSpawnGroupsByMap = new Map<string, Map<string, RuntimeMonster[]>>();
  private readonly monsterSpawnAccelerationStatesByMap = new Map<string, Map<string, MonsterSpawnAccelerationState>>();
  private readonly persistedMonstersByMap = new Map<string, Map<string, PersistedMonsterRuntimeRecord>>();
  private readonly persistedMonsterSpawnAccelerationStatesByMap =
    new Map<string, Map<string, PersistedMonsterSpawnAccelerationRecord>>();
  private readonly effectsByMap = new Map<string, CombatEffect[]>();
  private readonly tickDurationMsByMap = new Map<string, number>();
  private readonly npcShopRuntimeStates = new Map<string, PersistedNpcShopRuntimeRecord>();
  private readonly logger = new Logger(WorldService.name);
  private readonly monsterRuntimeStatePath = resolveServerDataPath('runtime', 'map-monster-runtime-state.json');
/** observationDomain：定义该变量以承载业务值。 */
  private readonly observationDomain: WorldObservationDomain;
/** questDomain：定义该变量以承载业务值。 */
  private readonly questDomain: WorldQuestDomain;
/** runtimePersistenceDomain：定义该变量以承载业务值。 */
  private readonly runtimePersistenceDomain: WorldRuntimePersistenceDomain;
/** targetingDomain：定义该变量以承载业务值。 */
  private readonly targetingDomain: WorldTargetingDomain;
  private monsterRuntimeDirty = false;
  private npcShopRuntimeDirty = false;

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
    private readonly equipmentEffectService: EquipmentEffectService,
    private readonly timeService: TimeService,
    private readonly performanceService: PerformanceService,
    private readonly threatService: ThreatService,
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly alchemyService: AlchemyService,
    private readonly enhancementService: EnhancementService,
    private readonly techniqueActivityService: TechniqueActivityService,
  ) {
    this.questDomain = new WorldQuestDomain(
      this.mapService,
      this.contentService,
      this.inventoryService,
      this.lootService,
      this.playerService,
      {
        getCurrentMainQuestId: (player) => this.getCurrentMainQuestId(player),
        getEffectiveDropChance: (player, monster, drop) => this.getEffectiveDropChance(player, monster as RuntimeMonster, drop),
      },
    );
    this.observationDomain = new WorldObservationDomain(
      this.attrService,
      this.mapService,
      this.contentService,
      this.lootService,
      {
        getMonsterCombatSnapshot: (monster) => this.getMonsterCombatSnapshot(monster as RuntimeMonster),
        getMonsterPresentationScale: (monster) => this.getMonsterPresentationScale(monster as RuntimeMonster),
        getTemporaryBuffPresentationScale: (buffs) => this.getTemporaryBuffPresentationScale(buffs),
        getMapRenderableBuffs: (buffs) => this.getMapRenderableBuffs(buffs) ?? [],
        getRenderableBuffs: (buffs) => this.getRenderableBuffs(buffs) ?? [],
        getPlayerRenderableBuffs: (player) => this.getPlayerRenderableBuffs(player) ?? [],
        getEffectiveDropChance: (viewer, monster, drop) => this.getEffectiveDropChance(viewer, monster as RuntimeMonster, drop),
        resolveNpcQuestMarker: (viewer, npc) => this.questDomain.resolveNpcQuestMarker(viewer, npc),
        formatRespawnTicks: (ticks) => this.formatRespawnTicks(ticks),
      },
    );
    this.runtimePersistenceDomain = new WorldRuntimePersistenceDomain(
      this.mapService,
      this.contentService,
      {
        syncMonsterRuntimeResources: (runtime, resourceDelta) => this.syncMonsterRuntimeResources(runtime as RuntimeMonster, resourceDelta),
        findSpawnPosition: (mapId, runtime) => this.findSpawnPosition(mapId, runtime as RuntimeMonster),
        areAllMonstersAlive: (monsters) => this.areAllMonstersAlive(monsters as RuntimeMonster[]),
      },
    );
    this.targetingDomain = new WorldTargetingDomain(
      this.attrService,
      this.contentService,
      this.aoiService,
      this.playerService,
      this.mapService,
      this.lootService,
      this.threatService,
      {
        getMonstersByMap: (mapId) => this.monstersByMap.get(mapId) ?? [],
        canPlayerCastSkill: (player, skill) => this.canPlayerCastSkill(player, skill),
        buildEffectiveSkillRange: (skill, player) => this.buildEffectiveSkillGeometry(skill, this.attrService.getPlayerNumericStats(player)).range,
        canPlayerAutoBattleUseSkillOnTarget: (player, skill, target) => this.canPlayerAutoBattleUseSkillOnTarget(
          player,
          skill,
          target as ResolvedTarget,
        ),
        canPlayerUseHostileEffectOnTarget: (player, target) => this.canPlayerUseHostileEffectOnTarget(player, target as ResolvedTarget),
        canReachAttackPosition: (mapId, actor, target, range, selfOccupancyId, actorType) => this.canReachAttackPosition(
          mapId,
          actor,
          target as ResolvedTarget,
          range,
          selfOccupancyId,
          actorType,
        ),
        getPlayerThreatId: (player) => this.getPlayerThreatId(player),
        getMonsterThreatId: (monster) => this.getMonsterThreatId(monster as RuntimeMonster),
        getExtraAggroRate: (target) => this.getExtraAggroRate(target as PlayerState | RuntimeMonster),
        isMonsterAutoAggroEnabled: (monster, timeState) => this.isMonsterAutoAggroEnabled(monster as RuntimeMonster, timeState),
        clearCombatTarget: (player) => this.clearCombatTarget(player),
      },
    );
  }

/** onModuleInit：执行对应的业务逻辑。 */
  async onModuleInit(): Promise<void> {
    await this.loadPersistedMonsterRuntimeState();
    await this.loadPersistedNpcShopRuntimeState();
  }

/** onModuleDestroy：执行对应的业务逻辑。 */
  async onModuleDestroy(): Promise<void> {
    await this.persistMonsterRuntimeState();
    await this.persistNpcShopRuntimeState();
  }

/** reloadRuntimeStateFromPersistence：执行对应的业务逻辑。 */
  async reloadRuntimeStateFromPersistence(): Promise<void> {
    for (const [mapId, monsters] of this.monstersByMap.entries()) {
      for (const monster of monsters) {
        if (this.mapService.hasOccupant(mapId, monster.x, monster.y, monster.runtimeId)) {
          this.mapService.removeOccupant(mapId, monster.x, monster.y, monster.runtimeId);
        }
      }
    }
    this.monstersByMap.clear();
    this.monsterSpawnGroupsByMap.clear();
    this.monsterSpawnAccelerationStatesByMap.clear();
    this.persistedMonstersByMap.clear();
    this.persistedMonsterSpawnAccelerationStatesByMap.clear();
    this.effectsByMap.clear();
    this.npcShopRuntimeStates.clear();
    this.monsterRuntimeDirty = false;
    this.npcShopRuntimeDirty = false;
    this.threatService.clearAll();
    await this.loadPersistedMonsterRuntimeState();
    await this.loadPersistedNpcShopRuntimeState();
  }

  /** 获取玩家视野内的可见实体（容器、NPC、怪物） */
  getVisibleEntities(player: PlayerState, visibleKeys: Set<string>): RenderEntity[] {
    return this.getVisibleEntitiesForMap(player, player.mapId, visibleKeys);
  }

  /** 获取父地图上投影到当前地图视野内的可见实体 */
  getProjectedVisibleEntities(player: PlayerState, sourceMapId: string, visibleKeys: Set<string>): RenderEntity[] {
    return this.getVisibleEntitiesForMap(player, sourceMapId, visibleKeys, (x, y) => {
/** projected：定义该变量以承载业务值。 */
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

/** setMapTickDurationMs：执行对应的业务逻辑。 */
  setMapTickDurationMs(mapId: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      this.tickDurationMsByMap.delete(mapId);
      return;
    }
    this.tickDurationMsByMap.set(mapId, Math.max(1, Math.round(durationMs)));
  }

/** getMapTickDurationMs：执行对应的业务逻辑。 */
  private getMapTickDurationMs(mapId: string): number {
    return this.tickDurationMsByMap.get(mapId) ?? 1000;
  }

  private getVisibleEntitiesForMap(
    viewer: PlayerState,
    sourceMapId: string,
    visibleKeys: Set<string>,
    projectPoint?: (x: number, y: number) => { x: number; y: number } | null,
  ): RenderEntity[] {
    this.ensureMapInitialized(sourceMapId);

/** resolvePoint：定义该变量以承载业务值。 */
    const resolvePoint = (x: number, y: number): { x: number; y: number } | null => {
/** projected：定义该变量以承载业务值。 */
      const projected = projectPoint ? projectPoint(x, y) : { x, y };
      if (!projected) {
        return null;
      }
      return visibleKeys.has(`${projected.x},${projected.y}`) ? projected : null;
    };

/** containers：定义该变量以承载业务值。 */
    const containers = this.mapService.getContainers(sourceMapId)
      .flatMap<RenderEntity>((container) => {
/** projected：定义该变量以承载业务值。 */
        const projected = resolvePoint(container.x, container.y);
        if (!projected) {
          return [];
        }
/** runtime：定义该变量以承载业务值。 */
        const runtime = container.variant === 'herb'
          ? this.lootService.getContainerRuntimeView(sourceMapId, container)
          : null;
        return [{
          id: `container:${sourceMapId}:${container.id}`,
          x: projected.x,
          y: projected.y,
          char: container.char?.trim() ? container.char.trim().slice(0, 1) : '箱',
          color: container.color?.trim() ? container.color.trim() : '#c18b46',
          name: container.name,
          kind: 'container',
          hp: runtime?.hp,
          maxHp: runtime?.maxHp,
          respawnRemainingTicks: runtime?.respawnRemainingTicks,
          respawnTotalTicks: runtime?.respawnTotalTicks,
        }];
      });

/** npcs：定义该变量以承载业务值。 */
    const npcs = this.mapService.getNpcs(sourceMapId)
      .flatMap<RenderEntity>((npc) => {
/** projected：定义该变量以承载业务值。 */
        const projected = resolvePoint(npc.x, npc.y);
        if (!projected) {
          return [];
        }
        return [{
          ...this.observationDomain.buildNpcRenderEntity(viewer, npc, sourceMapId),
          x: projected.x,
          y: projected.y,
        }];
      });

/** monsters：定义该变量以承载业务值。 */
    const monsters = (this.monstersByMap.get(sourceMapId) ?? [])
      .flatMap<RenderEntity>((monster) => {
        if (!monster.alive) {
          return [];
        }
/** projected：定义该变量以承载业务值。 */
        const projected = resolvePoint(monster.x, monster.y);
        if (!projected) {
          return [];
        }
        return [{
          ...this.observationDomain.buildMonsterRenderEntity(viewer, monster),
          x: projected.x,
          y: projected.y,
        }];
      });

    return [...containers, ...npcs, ...monsters];
  }

  /** 地图重载时重建运行时怪物实例 */
  reloadMapRuntime(mapId: string): void {
/** monsters：定义该变量以承载业务值。 */
    const monsters = this.monstersByMap.get(mapId) ?? [];
    if (monsters.length > 0) {
      this.persistedMonstersByMap.set(mapId, this.runtimePersistenceDomain.captureMonsterRuntimeState(monsters));
/** spawnStates：定义该变量以承载业务值。 */
      const spawnStates = this.runtimePersistenceDomain.captureMonsterSpawnAccelerationState(
        this.monsterSpawnAccelerationStatesByMap.get(mapId)?.values() ?? [],
      );
      if (spawnStates.size > 0) {
        this.persistedMonsterSpawnAccelerationStatesByMap.set(mapId, spawnStates);
      } else {
        this.persistedMonsterSpawnAccelerationStatesByMap.delete(mapId);
      }
      this.monsterRuntimeDirty = true;
    }
    for (const monster of monsters) {
      if (this.mapService.hasOccupant(mapId, monster.x, monster.y, monster.runtimeId)) {
        this.mapService.removeOccupant(mapId, monster.x, monster.y, monster.runtimeId);
      }
      this.threatService.clearThreat(monster.runtimeId);
    }
    this.monstersByMap.delete(mapId);
    this.monsterSpawnGroupsByMap.delete(mapId);
    this.monsterSpawnAccelerationStatesByMap.delete(mapId);
    this.effectsByMap.delete(mapId);
    this.ensureMapInitialized(mapId);
  }

/** clearPlayerMonsterExpContributionRecords：执行对应的业务逻辑。 */
  clearPlayerMonsterExpContributionRecords(playerId: string): void {
    if (!playerId) {
      return;
    }
/** changed：定义该变量以承载业务值。 */
    let changed = false;

    for (const monsters of this.monstersByMap.values()) {
      for (const monster of monsters) {
        if (!monster.damageContributors.has(playerId)) {
          continue;
        }
        monster.damageContributors.delete(playerId);
        changed = true;
      }
    }

    for (const records of this.persistedMonstersByMap.values()) {
      for (const record of records.values()) {
        if (!record.damageContributors || !(playerId in record.damageContributors)) {
          continue;
        }
/** nextDamageContributors：定义该变量以承载业务值。 */
        const nextDamageContributors = { ...record.damageContributors };
        delete nextDamageContributors[playerId];
        record.damageContributors = Object.keys(nextDamageContributors).length > 0
          ? nextDamageContributors
          : undefined;
        changed = true;
      }
    }

    if (changed) {
      this.monsterRuntimeDirty = true;
    }
  }

  /** 构建玩家的渲染实体数据（用于其他玩家视野中的显示） */
  buildPlayerRenderEntity(viewer: PlayerState, target: PlayerState, color: string): RenderEntity {
/** displayName：定义该变量以承载业务值。 */
    const displayName = target.displayName ?? (getFirstGrapheme(target.name) || '@');
    return {
      id: target.id,
      x: target.x,
      y: target.y,
      char: displayName,
      color,
      name: target.name,
      kind: 'player',
      monsterScale: this.getTemporaryBuffPresentationScale(target.temporaryBuffs),
      hp: target.hp,
      maxHp: target.maxHp,
      buffs: this.getPlayerMapRenderableBuffs(target),
    };
  }

  /** 在允许重叠的热点格上，将过多玩家压缩成单个人群实体，降低地图广播与渲染开销。 */
  buildCrowdedPlayerRenderEntities(entities: RenderEntity[], preservePlayerId?: string): RenderEntity[] {
/** grouped：定义该变量以承载业务值。 */
    const grouped = new Map<string, RenderEntity[]>();

    for (const entity of entities) {
      const key = `${entity.x},${entity.y}`;
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(entity);
        continue;
      }
      grouped.set(key, [entity]);
    }

/** aggregated：定义该变量以承载业务值。 */
    const aggregated: RenderEntity[] = [];
    for (const group of grouped.values()) {
      if (group.length < PLAYER_CROWD_RENDER_THRESHOLD) {
        aggregated.push(...group);
        continue;
      }

      aggregated.push(this.buildCrowdRenderEntity(group[0], group.length));

      if (preservePlayerId) {
/** preserved：定义该变量以承载业务值。 */
        const preserved = group.find((entity) => entity.id === preservePlayerId);
        if (preserved) {
          aggregated.push(preserved);
        }
      }
    }

    return aggregated;
  }

/** buildCrowdRenderEntity：执行对应的业务逻辑。 */
  private buildCrowdRenderEntity(anchor: RenderEntity, count: number): RenderEntity {
/** isDenseCrowd：定义该变量以承载业务值。 */
    const isDenseCrowd = count > PLAYER_CROWD_DENSE_NAME_THRESHOLD;
    return {
      id: `crowd:${anchor.x},${anchor.y}`,
      x: anchor.x,
      y: anchor.y,
      char: PLAYER_CROWD_CHAR,
      color: isDenseCrowd ? PLAYER_CROWD_DENSE_COLOR : PLAYER_CROWD_COLOR,
      name: isDenseCrowd ? '人山人海' : `人群${count}`,
      kind: 'crowd',
    };
  }

/** buildCrowdObservationDetail：执行对应的业务逻辑。 */
  private buildCrowdObservationDetail(x: number, y: number, count: number): ObservedTileEntityDetail {
/** isDenseCrowd：定义该变量以承载业务值。 */
    const isDenseCrowd = count > PLAYER_CROWD_DENSE_NAME_THRESHOLD;
    return {
      id: `crowd:${x},${y}`,
      name: isDenseCrowd ? '人山人海' : `人群${count}`,
      kind: 'crowd',
      observation: {
        clarity: 'blurred',
        verdict: '此地人影交叠，气机纷杂，只能分辨出这是一处密集人群。',
        lines: [],
      },
    };
  }

  /** 根据玩家当前位置和状态，构建可用的上下文行动列表 */
  getContextActions(player: PlayerState, options?: { skipQuestSync?: boolean }): ActionDef[] {
    if (!options?.skipQuestSync) {
      this.syncQuestState(player);
    }
/** effectiveViewRange：定义该变量以承载业务值。 */
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);

/** actions：定义该变量以承载业务值。 */
    const actions: ActionDef[] = [...STATIC_CONTEXT_TOGGLE_ACTIONS, {
      id: 'cultivation:toggle',
      name: '当前修炼',
      type: 'toggle',
      desc: '切换当前修炼状态；未设主修时仍可修炼，功法经验会直接转入炼体。',
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
    }, {
      id: RETURN_TO_SPAWN_ACTION_ID,
      name: this.getReturnToSpawnActionName(player),
      type: 'travel',
      desc: this.getReturnToSpawnActionDesc(player),
      cooldownLeft: 0,
    }];

/** breakthroughAction：定义该变量以承载业务值。 */
    const breakthroughAction = this.techniqueService.getBreakthroughAction(player);
    if (breakthroughAction) {
      actions.push(breakthroughAction);
    }
/** alchemyAction：定义该变量以承载业务值。 */
    const alchemyAction = this.alchemyService.getAlchemyAction(player);
    if (alchemyAction) {
      actions.push(alchemyAction);
    }
/** enhancementAction：定义该变量以承载业务值。 */
    const enhancementAction = this.enhancementService.getEnhancementAction(player);
    if (enhancementAction) {
      actions.push(enhancementAction);
    }

/** portal：定义该变量以承载业务值。 */
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (portal && !portal.hidden) {
/** targetMap：定义该变量以承载业务值。 */
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
      const interaction = this.questDomain.getNpcInteractionState(player, npc);
      let name = `交谈：${npc.name}`;
/** desc：定义该变量以承载业务值。 */
      let desc = npc.dialogue;
/** type：定义该变量以承载业务值。 */
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
        name = interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
          ? `传话：${interaction.questState.title}`
          : `任务：${interaction.questState.title}`;
        desc = interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
          ? (interaction.questState.relayMessage?.trim() || interaction.quest?.relayMessage?.trim() || '把口信转达给对方。')
          : this.questDomain.describeQuestProgress(player, interaction.questState, interaction.quest);
        type = 'quest';
      }

      actions.push({
        id: `npc:${npc.id}`,
        name,
        type,
        desc,
        cooldownLeft: 0,
      });

      if (npc.shopItems.length > 0) {
        actions.push({
          id: `npc_shop:${npc.id}`,
          name: `商店：${npc.name}`,
          type: 'interact',
          desc: `查看 ${npc.name} 当前出售的货物。`,
          cooldownLeft: 0,
        });
      }
    }

    return actions;
  }

  buildNpcShopView(player: PlayerState, npcId: string): { shop: SyncedNpcShopView | null; error?: string } {
/** npc：定义该变量以承载业务值。 */
    const npc = this.getAdjacentNpcs(player).find((entry) => entry.id === npcId);
    if (!npc) {
      return { shop: null, error: '你离这位商人太远了' };
    }
    if (npc.shopItems.length === 0) {
      return { shop: null, error: '对方现在没有经营商店' };
    }

/** nowMs：定义该变量以承载业务值。 */
    const nowMs = Date.now();
/** items：定义该变量以承载业务值。 */
    const items = npc.shopItems
      .flatMap((entry) => {
/** resolved：定义该变量以承载业务值。 */
        const resolved = this.resolveNpcShopItemRuntime(npc.id, entry, nowMs);
        if (!resolved) {
          return [];
        }
        return [{
          itemId: entry.itemId,
          item: this.toSyncedItemStack(resolved.item),
          unitPrice: resolved.unitPrice,
          remainingQuantity: resolved.stock?.remainingQuantity,
          stockLimit: resolved.stock?.stockLimit,
          refreshAt: resolved.stock?.refreshAt,
        }];
      })

    if (items.length === 0) {
      return { shop: null, error: '商铺货架还没有可售物品' };
    }

    return {
      shop: {
        npcId: npc.id,
        npcName: npc.name,
        dialogue: npc.dialogue,
        currencyItemId: MARKET_CURRENCY_ITEM_ID,
        currencyItemName: this.questDomain.getShopCurrencyItemName(),
        items,
      },
    };
  }

/** toSyncedItemStack：执行对应的业务逻辑。 */
  private toSyncedItemStack(item: ItemStack): SyncedItemStack {
    if (this.contentService.getItem(item.itemId)) {
      return {
        itemId: item.itemId,
        count: Math.max(1, Math.floor(item.count)),
        name: item.enhanceLevel && item.enhanceLevel > 0 ? item.name : undefined,
        equipAttrs: item.enhanceLevel && item.enhanceLevel > 0 && item.equipAttrs ? structuredClone(item.equipAttrs) : undefined,
        equipStats: item.enhanceLevel && item.enhanceLevel > 0 && item.equipStats ? structuredClone(item.equipStats) : undefined,
        equipValueStats: item.enhanceLevel && item.enhanceLevel > 0 && item.equipValueStats ? structuredClone(item.equipValueStats) : undefined,
        enhanceLevel: item.enhanceLevel,
        alchemySuccessRate: item.alchemySuccessRate,
        alchemySpeedRate: item.alchemySpeedRate,
        enhancementSuccessRate: item.enhancementSuccessRate,
        enhancementSpeedRate: item.enhancementSpeedRate,
        mapUnlockId: item.mapUnlockId,
        mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
        tileAuraGainAmount: item.tileAuraGainAmount,
        allowBatchUse: item.allowBatchUse,
      };
    }
    return {
      itemId: item.itemId,
      count: Math.max(1, Math.floor(item.count)),
      name: item.name,
      type: item.type,
      desc: item.desc,
      groundLabel: item.groundLabel,
      grade: item.grade,
      level: item.level,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs ? structuredClone(item.equipAttrs) : undefined,
      equipStats: item.equipStats ? structuredClone(item.equipStats) : undefined,
      equipValueStats: item.equipValueStats ? structuredClone(item.equipValueStats) : undefined,
      effects: item.effects ? structuredClone(item.effects) : undefined,
      tags: item.tags ? [...item.tags] : undefined,
      enhanceLevel: item.enhanceLevel,
      alchemySuccessRate: item.alchemySuccessRate,
      alchemySpeedRate: item.alchemySpeedRate,
      enhancementSuccessRate: item.enhancementSuccessRate,
      enhancementSpeedRate: item.enhancementSpeedRate,
      mapUnlockId: item.mapUnlockId,
      mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
      tileAuraGainAmount: item.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse,
    };
  }

/** buyNpcShopItem：执行对应的业务逻辑。 */
  buyNpcShopItem(player: PlayerState, payload: { npcId: string; itemId: string; quantity: number }): WorldUpdate {
/** npc：定义该变量以承载业务值。 */
    const npc = this.getAdjacentNpcs(player).find((entry) => entry.id === payload.npcId);
    if (!npc) {
      return { ...EMPTY_UPDATE, error: '你离这位商人太远了' };
    }
/** shopItem：定义该变量以承载业务值。 */
    const shopItem = npc.shopItems.find((entry) => entry.itemId === payload.itemId);
    if (!shopItem) {
      return { ...EMPTY_UPDATE, error: '这位商人没有出售该物品' };
    }
    if (!Number.isSafeInteger(payload.quantity) || payload.quantity <= 0) {
      return { ...EMPTY_UPDATE, error: '购买数量无效' };
    }

/** resolved：定义该变量以承载业务值。 */
    const resolved = this.resolveNpcShopItemRuntime(npc.id, shopItem, Date.now());
    if (!resolved) {
      return { ...EMPTY_UPDATE, error: '商品配置异常，暂时无法购买' };
    }
    if (resolved.stock && payload.quantity > resolved.stock.remainingQuantity) {
      return {
        ...EMPTY_UPDATE,
        error: resolved.stock.remainingQuantity > 0
          ? `库存不足，当前仅剩 ${resolved.stock.remainingQuantity} 件`
          : '此物当前已售罄，需等下一轮补货',
      };
    }

/** totalCost：定义该变量以承载业务值。 */
    const totalCost = payload.quantity * resolved.unitPrice;
    if (!Number.isSafeInteger(totalCost) || totalCost <= 0) {
      return { ...EMPTY_UPDATE, error: '购买总价过大，暂时无法结算' };
    }

/** purchasedItem：定义该变量以承载业务值。 */
    const purchasedItem = this.contentService.createItem(shopItem.itemId, payload.quantity);
    if (!purchasedItem) {
      return { ...EMPTY_UPDATE, error: '商品配置异常，暂时无法购买' };
    }
    if (!this.questDomain.canReceiveItems(player, [purchasedItem])) {
      return { ...EMPTY_UPDATE, error: '背包空间不足，无法购买' };
    }

/** currencyName：定义该变量以承载业务值。 */
    const currencyName = this.questDomain.getShopCurrencyItemName();
    if (this.questDomain.getInventoryCount(player, MARKET_CURRENCY_ITEM_ID) < totalCost) {
      return { ...EMPTY_UPDATE, error: `${currencyName}不足` };
    }
/** consumeError：定义该变量以承载业务值。 */
    const consumeError = this.questDomain.consumeInventoryItem(player, MARKET_CURRENCY_ITEM_ID, totalCost, `${currencyName}不足`);
    if (consumeError) {
      return { ...EMPTY_UPDATE, error: consumeError };
    }
    if (!this.inventoryService.addItem(player, purchasedItem)) {
      return { ...EMPTY_UPDATE, error: '背包空间不足，无法购买' };
    }
    if (resolved.stock) {
      this.updateNpcShopSoldQuantity(
        resolved.stock.stateKey,
        resolved.stock.refreshWindowStartMs,
        resolved.stock.soldQuantity + payload.quantity,
      );
    }

    return {
      messages: [{
        playerId: player.id,
        text: `你从 ${npc.name} 处购得 ${purchasedItem.name} x${payload.quantity}，花费 ${currencyName} x${totalCost}。`,
        kind: 'loot',
      }],
      dirty: ['inv'],
    };
  }

  private resolveNpcShopItemRuntime(
    npcId: string,
    shopItem: NpcShopItemConfig,
    nowMs: number,
  ): ResolvedNpcShopItemRuntime | null {
/** item：定义该变量以承载业务值。 */
    const item = this.contentService.createItem(shopItem.itemId, 1);
    if (!item) {
      return null;
    }

/** unitPrice：定义该变量以承载业务值。 */
    const unitPrice = this.resolveNpcShopUnitPrice(shopItem);
    if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0) {
      return null;
    }

    return {
      item,
      unitPrice,
      stock: this.resolveNpcShopStockState(npcId, shopItem, nowMs),
    };
  }

/** resolveNpcShopUnitPrice：执行对应的业务逻辑。 */
  private resolveNpcShopUnitPrice(shopItem: NpcShopItemConfig): number {
    if (shopItem.priceFormula === 'technique_realm_square_grade') {
/** techniqueId：定义该变量以承载业务值。 */
      const techniqueId = this.contentService.getItem(shopItem.itemId)?.learnTechniqueId;
/** technique：定义该变量以承载业务值。 */
      const technique = techniqueId ? this.contentService.getTechnique(techniqueId) : undefined;
      if (technique) {
/** realmLv：定义该变量以承载业务值。 */
        const realmLv = Math.max(1, Math.floor(technique.realmLv ?? 1));
/** gradeIndex：定义该变量以承载业务值。 */
        const gradeIndex = Math.max(0, gameplayConstants.TECHNIQUE_GRADE_ORDER.indexOf(technique.grade ?? 'mortal'));
        return realmLv * realmLv * (gradeIndex + 1);
      }
    }
    return Number.isFinite(shopItem.price) ? Math.max(0, Math.floor(Number(shopItem.price))) : 0;
  }

  private resolveNpcShopStockState(
    npcId: string,
    shopItem: NpcShopItemConfig,
    nowMs: number,
  ): ResolvedNpcShopStockState | undefined {
    if (!Number.isInteger(shopItem.stockLimit) || Number(shopItem.stockLimit) <= 0) {
      return undefined;
    }

/** stockLimit：定义该变量以承载业务值。 */
    const stockLimit = Number(shopItem.stockLimit);
/** refreshWindowStartMs：定义该变量以承载业务值。 */
    const refreshWindowStartMs = this.resolveNpcShopRefreshWindowStart(nowMs, shopItem.refreshSeconds);
/** stateKey：定义该变量以承载业务值。 */
    const stateKey = this.buildNpcShopRuntimeStateKey(npcId, shopItem.itemId);
/** persisted：定义该变量以承载业务值。 */
    const persisted = this.npcShopRuntimeStates.get(stateKey);

/** soldQuantity：定义该变量以承载业务值。 */
    let soldQuantity = 0;
    if (persisted) {
      if (persisted.refreshWindowStartMs === refreshWindowStartMs) {
        soldQuantity = Math.max(0, Math.floor(persisted.soldQuantity));
      } else {
        this.npcShopRuntimeStates.delete(stateKey);
        this.npcShopRuntimeDirty = true;
      }
    }

    return {
      stateKey,
      stockLimit,
      refreshWindowStartMs,
      refreshAt: Number.isInteger(shopItem.refreshSeconds) && Number(shopItem.refreshSeconds) > 0
        ? refreshWindowStartMs + Number(shopItem.refreshSeconds) * 1000
        : undefined,
      soldQuantity,
      remainingQuantity: Math.max(0, stockLimit - soldQuantity),
    };
  }

/** resolveNpcShopRefreshWindowStart：执行对应的业务逻辑。 */
  private resolveNpcShopRefreshWindowStart(nowMs: number, refreshSeconds: number | undefined): number {
    if (!Number.isInteger(refreshSeconds) || Number(refreshSeconds) <= 0) {
      return 0;
    }
/** refreshMs：定义该变量以承载业务值。 */
    const refreshMs = Number(refreshSeconds) * 1000;
    return nowMs - (nowMs % refreshMs);
  }

/** buildNpcShopRuntimeStateKey：执行对应的业务逻辑。 */
  private buildNpcShopRuntimeStateKey(npcId: string, itemId: string): string {
    return `${npcId}:${itemId}`;
  }

/** updateNpcShopSoldQuantity：执行对应的业务逻辑。 */
  private updateNpcShopSoldQuantity(stateKey: string, refreshWindowStartMs: number, soldQuantity: number): void {
/** normalizedSoldQuantity：定义该变量以承载业务值。 */
    const normalizedSoldQuantity = Math.max(0, Math.floor(soldQuantity));
    if (normalizedSoldQuantity <= 0) {
      if (this.npcShopRuntimeStates.delete(stateKey)) {
        this.npcShopRuntimeDirty = true;
        void this.persistNpcShopRuntimeState();
      }
      return;
    }

    this.npcShopRuntimeStates.set(stateKey, {
      refreshWindowStartMs: Math.max(0, Math.floor(refreshWindowStartMs)),
      soldQuantity: normalizedSoldQuantity,
    });
    this.npcShopRuntimeDirty = true;
    void this.persistNpcShopRuntimeState();
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

    if (actionId === 'toggle:auto_battle_stationary') {
      player.autoBattleStationary = player.autoBattleStationary === true ? false : true;
      return {
        messages: [{
          playerId: player.id,
/** text：定义该变量以承载业务值。 */
          text: player.autoBattleStationary === true ? '已开启原地战斗。' : '已关闭原地战斗。',
          kind: 'combat',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'toggle:allow_aoe_player_hit') {
/** enabled：定义该变量以承载业务值。 */
      const enabled = player.allowAoePlayerHit !== true;
      this.setPlayerHostileAllPlayersEnabled(player, enabled);
      return {
        messages: [{
          playerId: player.id,
          text: enabled
            ? '已开启全体攻击，现在可以主动攻击其他玩家。'
            : '已关闭全体攻击，现在只会反击主动攻击你的玩家。',
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

    if (actionId === 'toggle:auto_switch_cultivation') {
      player.autoSwitchCultivation = player.autoSwitchCultivation === true ? false : true;
      return {
        messages: [{
          playerId: player.id,
/** text：定义该变量以承载业务值。 */
          text: player.autoSwitchCultivation === true
            ? '已开启功法修满自动切换。'
            : '已关闭功法修满自动切换。',
          kind: 'quest',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'cultivation:toggle') {
/** blockedMessage：定义该变量以承载业务值。 */
      const blockedMessage = !this.techniqueService.hasCultivationBuff(player)
        ? this.techniqueActivityService.buildCultivationBlockedMessage(player)
        : null;
      if (blockedMessage) {
        return {
          error: blockedMessage,
          messages: [],
          dirty: [],
        };
      }
/** result：定义该变量以承载业务值。 */
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
          text: player.senseQiActive ? '你运起感气决，视野中诸地灵气层次渐次显露。' : '你收束感气决，周遭灵光重新隐去。',
          kind: 'system',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'portal:travel') {
      return this.handlePortalTravel(player);
    }

    if (actionId === 'realm:breakthrough') {
/** result：定义该变量以承载业务值。 */
      const result = this.techniqueService.attemptBreakthrough(player);
/** dirty：定义该变量以承载业务值。 */
      const dirty = new Set<WorldDirtyFlag>(result.dirty as WorldDirtyFlag[]);
      if (!result.error) {
        for (const flag of this.syncQuestState(player)) {
          dirty.add(flag);
        }
      }
      return {
        error: result.error,
        messages: result.messages.map((message) => ({
          playerId: player.id,
          text: message.text,
          kind: message.kind,
        })),
        dirty: [...dirty],
      };
    }

    if (!actionId.startsWith('npc:')) {
      return { ...EMPTY_UPDATE, error: '无法执行该交互' };
    }

/** npcId：定义该变量以承载业务值。 */
    const npcId = actionId.slice(4);
/** npc：定义该变量以承载业务值。 */
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
/** mainQuestRepairChanged：定义该变量以承载业务值。 */
    const mainQuestRepairChanged = this.ensureLinearMainQuest(player).changed;
/** changed：定义该变量以承载业务值。 */
    let changed = mainQuestRepairChanged;

    for (const quest of player.quests) {
      if (quest.status === 'completed') continue;
      const config = this.mapService.getQuest(quest.id);
      if (!config) continue;
      changed = this.questDomain.syncQuestNpcLocations(quest) || changed;
/** nextProgress：定义该变量以承载业务值。 */
      const nextProgress = this.questDomain.resolveQuestProgress(player, quest, config);
      if (nextProgress !== quest.progress) {
        quest.progress = nextProgress;
        changed = true;
      }
/** targetName：定义该变量以承载业务值。 */
      const targetName = resolveQuestTargetName({
        objectiveType: config.objectiveType,
        title: quest.title,
        targetName: quest.targetName,
        targetNpcId: quest.targetNpcId || config.targetNpcId,
        targetMonsterId: quest.targetMonsterId || config.targetMonsterId,
        targetTechniqueId: quest.targetTechniqueId || config.targetTechniqueId,
        targetRealmStage: quest.targetRealmStage ?? config.targetRealmStage,
        requiredItemId: quest.requiredItemId ?? config.requiredItemId,
        resolveNpcName: (npcId) => this.mapService.getNpcLocation(npcId)?.name,
        resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
        resolveItemName: (itemId) => this.contentService.getItem(itemId)?.name,
      });
      if (quest.targetName !== targetName) {
        quest.targetName = targetName;
        changed = true;
      }
    }

/** statusChanged：定义该变量以承载业务值。 */
    const statusChanged = this.questDomain.refreshQuestStatuses(player);
    if (changed || statusChanged) {
      return (mainQuestRepairChanged || statusChanged) ? ['quest', 'actions'] : ['quest'];
    }
    return [];
  }

  /** 给仍处于序章前期主线的旧角色补发炼体入门功法，避免早期突破断档。 */
  backfillIntroBodyTechnique(player: PlayerState): boolean {
    if (player.techniques.some((entry) => entry.techId === INTRO_BODY_TECHNIQUE_ID)) {
      return false;
    }
    if (this.questDomain.getInventoryCount(player, INTRO_BODY_TECHNIQUE_BOOK_ID) > 0) {
      return false;
    }

/** currentMainQuestId：定义该变量以承载业务值。 */
    const currentMainQuestId = this.getCurrentMainQuestId(player);
/** currentMainQuestIndex：定义该变量以承载业务值。 */
    const currentMainQuestIndex = currentMainQuestId ? this.mapService.getMainQuestIndex(currentMainQuestId) : undefined;
/** cutoffQuestIndex：定义该变量以承载业务值。 */
    const cutoffQuestIndex = this.mapService.getMainQuestIndex(INTRO_BODY_TEMPERING_QUEST_ID);
    if (
      currentMainQuestIndex === undefined
      || cutoffQuestIndex === undefined
      || currentMainQuestIndex > cutoffQuestIndex
    ) {
      return false;
    }

/** techniqueBook：定义该变量以承载业务值。 */
    const techniqueBook = this.contentService.createItem(INTRO_BODY_TECHNIQUE_BOOK_ID, 1);
    if (techniqueBook && this.inventoryService.addItem(player, techniqueBook)) {
      return true;
    }

/** technique：定义该变量以承载业务值。 */
    const technique = this.contentService.getTechnique(INTRO_BODY_TECHNIQUE_ID);
    if (!technique) {
      return false;
    }
    return this.techniqueService.learnTechnique(
      player,
      technique.id,
      technique.name,
      technique.skills,
      technique.grade,
      technique.category,
      technique.realmLv,
      technique.layers,
    ) === null;
  }

  /** 自动战斗逻辑：寻敌 → 追击 → 释放技能/普攻 */
  performAutoBattle(player: PlayerState): WorldUpdate {
    if (!player.autoBattle || player.dead) return EMPTY_UPDATE;
    if (player.pendingSkillCast) {
      return EMPTY_UPDATE;
    }
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      player.autoBattle = false;
      this.navigationService.clearMoveTarget(player.id);
      this.clearCombatTarget(player);
      return {
        messages: [{
          playerId: player.id,
          text: safeZoneAttackError,
          kind: 'system',
        }],
        dirty: ['actions'],
      };
    }

/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>();
/** effectiveViewRange：定义该变量以承载业务值。 */
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
/** stationaryMode：定义该变量以承载业务值。 */
    const stationaryMode = player.autoBattleStationary === true;
/** availableSkills：定义该变量以承载业务值。 */
    const availableSkills = this.targetingDomain.collectAutoBattleSkillCandidates(player);
/** preferredRange：定义该变量以承载业务值。 */
    const preferredRange = this.targetingDomain.resolveAutoBattlePreferredRange(player, availableSkills);

/** target：定义该变量以承载业务值。 */
    let target: ResolvedTarget | undefined;
/** targetVisible：定义该变量以承载业务值。 */
    let targetVisible = true;

    if (player.combatTargetLocked) {
/** retaliationTargetId：定义该变量以承载业务值。 */
      const retaliationTargetId = player.retaliatePlayerTargetId;
      target = this.targetingDomain.resolveCombatTarget(player) as ResolvedTarget | undefined;
      if (!target) {
        player.autoBattle = false;
        this.clearCombatTarget(player);
        return {
          messages: [{
            playerId: player.id,
            text: retaliationTargetId
              ? '反击目标已经失去踪迹，自动战斗已停止。'
              : '强制攻击目标已经失去踪迹，自动战斗已停止。',
            kind: 'combat',
          }],
          dirty: ['actions'],
        };
      }
      targetVisible = this.targetingDomain.canPlayerSeeTarget(player, target, effectiveViewRange);
    }

    if (!target) {
      target = this.selectPlayerAutoBattleTarget(player, effectiveViewRange, preferredRange, availableSkills, stationaryMode);
      if (!target) {
        this.clearCombatTarget(player);
        return EMPTY_UPDATE;
      }
      player.combatTargetId = this.getTargetRef(target);
      player.combatTargetLocked = false;
      player.retaliatePlayerTargetId = undefined;
      targetVisible = true;
    }

/** targetRef：定义该变量以承载业务值。 */
    const targetRef = this.getTargetRef(target);

    if (targetVisible) {
/** selectedSkill：定义该变量以承载业务值。 */
      const selectedSkill = this.targetingDomain.selectAutoBattleSkillForTarget(player, target, availableSkills);
      if (selectedSkill) {
/** update：定义该变量以承载业务值。 */
        const update = selectedSkill.skill.requiresTarget === false
          ? this.performSkill(player, selectedSkill.skill.id)
          : this.performTargetedSkill(player, selectedSkill.skill.id, targetRef);
/** stopUpdate：定义该变量以承载业务值。 */
        const stopUpdate = this.targetingDomain.stopLockedForceAttackForInvalidTile(player, target, update) as WorldUpdate | null;
        if (stopUpdate) {
          return stopUpdate;
        }
        if (update.consumedAction) {
          return { ...update, usedActionId: selectedSkill.skill.id };
        }
      }

      if (isPointInRange(player, target, 1)) {
        this.faceToward(player, target.x, target.y);
/** update：定义该变量以承载业务值。 */
        const update = this.performBasicAttack(player, target);
        return this.targetingDomain.stopLockedForceAttackForInvalidTile(player, target, update) as WorldUpdate | null ?? update;
      }
    }

    if (stationaryMode) {
      this.faceToward(player, target.x, target.y);
      return EMPTY_UPDATE;
    }

/** facing：定义该变量以承载业务值。 */
    const facing = this.stepPlayerTowardAttackPosition(player, target, preferredRange);
    if (facing !== null) {
      player.facing = facing;
/** cultivation：定义该变量以承载业务值。 */
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
    if (player.pendingSkillCast) {
      return { ...EMPTY_UPDATE, error: '正在吟唱中，无法继续施法。' };
    }
/** skill：定义该变量以承载业务值。 */
    const skill = this.contentService.getSkill(skillId);
    if (!skill) {
      return { ...EMPTY_UPDATE, error: '技能不存在' };
    }
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.ensurePlayerCanStartSkillAttack(player, skill);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
    if (skill.requiresTarget !== false) {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = this.getPlayerSkillWindupTicks(skill);
    if (windupTicks > 0) {
      return this.beginPlayerSkillCast(player, skill, { x: player.x, y: player.y }, undefined, player.autoBattle !== true);
    }
    return this.castSkill(player, skill);
  }

  /** 释放指定目标的技能 */
  performTargetedSkill(player: PlayerState, skillId: string, targetRef?: string): WorldUpdate {
    if (player.pendingSkillCast) {
      return { ...EMPTY_UPDATE, error: '正在吟唱中，无法继续施法。' };
    }
/** skill：定义该变量以承载业务值。 */
    const skill = this.contentService.getSkill(skillId);
    if (!skill) {
      return { ...EMPTY_UPDATE, error: '技能不存在' };
    }
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.ensurePlayerCanStartSkillAttack(player, skill);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '请选择目标' };
    }

/** target：定义该变量以承载业务值。 */
    const target = this.targetingDomain.resolveTargetRef(player, targetRef) as ResolvedTarget | null;
    if (!target) {
      return { ...EMPTY_UPDATE, error: '目标不存在或不可选中' };
    }
    if (target.kind === 'player' && !this.canPlayerDealDamageToPlayer(player, target.player)) {
      return { ...EMPTY_UPDATE, error: '已关闭全体攻击，当前不会主动攻击其他玩家。' };
    }
/** playerStats：定义该变量以承载业务值。 */
    const playerStats = this.attrService.getPlayerNumericStats(player);
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, playerStats);
    if (!isPointInRange(player, target, geometry.range)) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = this.getPlayerSkillWindupTicks(skill);
    if (windupTicks > 0) {
      return this.beginPlayerSkillCast(
        player,
        skill,
        { x: target.x, y: target.y },
        playerStats,
        player.autoBattle !== true,
        targetRef,
      );
    }
    return this.castSkill(player, skill, target, playerStats);
  }

  /** 技能施放核心流程：中断修炼 → 选择目标 → 消耗真气 → 逐效果结算 */
  private castSkill(
    player: PlayerState,
    skill: SkillDef,
    primaryTarget?: ResolvedTarget,
    playerStats?: NumericStats,
  ): WorldUpdate {
    return this.castSkillAtAnchor(
      player,
      skill,
      primaryTarget
        ? { x: primaryTarget.x, y: primaryTarget.y }
        : skill.requiresTarget === false
          ? { x: player.x, y: player.y }
          : undefined,
      {
        primaryTarget,
        playerStats,
      },
    );
  }

  private castSkillAtAnchor(
    player: PlayerState,
    skill: SkillDef,
    anchor?: { x: number; y: number },
    options?: {
      primaryTarget?: ResolvedTarget;
      playerStats?: NumericStats;
      qiCost?: number;
      allowMiss?: boolean;
      showActionLabel?: boolean;
      consumedAction?: boolean;
    },
  ): WorldUpdate {
/** cultivation：定义该变量以承载业务值。 */
    const cultivation = this.techniqueService.interruptCultivation(player, 'attack');
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
/** result：定义该变量以承载业务值。 */
    const result: WorldUpdate = {
      messages: cultivation.messages.map((message) => ({
        playerId: player.id,
        text: message.text,
        kind: message.kind,
      })),
      dirty: [],
      consumedAction: options?.consumedAction ?? true,
    };
    if (anchor) {
      this.faceToward(player, anchor.x, anchor.y);
    }
/** casterStats：定义该变量以承载业务值。 */
    const casterStats = options?.playerStats ?? this.attrService.getPlayerNumericStats(player);
/** selectedTargets：定义该变量以承载业务值。 */
    const selectedTargets = anchor
      ? this.selectSkillTargetsFromAnchor(player, skill, anchor, casterStats, options?.primaryTarget)
      : this.selectSkillTargets(player, skill, options?.primaryTarget, casterStats);
/** hasFriendlyPrimaryTarget：定义该变量以承载业务值。 */
    const hasFriendlyPrimaryTarget = options?.primaryTarget?.kind === 'player'
      && this.canPlayerTreatPlayer(player, options.primaryTarget.player);
    if (skill.requiresTarget !== false && selectedTargets.length === 0 && !hasFriendlyPrimaryTarget && options?.allowMiss !== true) {
      return { ...EMPTY_UPDATE, error: '没有可命中的目标' };
    }

/** qiCost：定义该变量以承载业务值。 */
    const qiCost = options?.qiCost ?? this.consumeQiForSkill(player, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }
    if (options?.showActionLabel !== false) {
      this.pushActionLabelEffect(player.mapId, player.x, player.y, skill.name);
    }

/** casterAttrs：定义该变量以承载业务值。 */
    const casterAttrs = this.attrService.getPlayerFinalAttrs(player);
/** techLevel：定义该变量以承载业务值。 */
    const techLevel = this.getSkillTechniqueLevel(player, skill.id);
/** appliedEffect：定义该变量以承载业务值。 */
    let appliedEffect = false;
/** firstError：定义该变量以承载业务值。 */
    let firstError: string | undefined;

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const damageTargets = this.pickDamageTargets(selectedTargets, options?.primaryTarget);
        if (damageTargets.length === 0) {
          continue;
        }
        for (const target of damageTargets) {
          const targetMonsterCombat = target.kind === 'monster'
            ? this.getMonsterCombatSnapshot(target.monster)
            : undefined;
/** context：定义该变量以承载业务值。 */
          const context: SkillFormulaContext = {
            player,
            skill,
            techLevel,
            targetCount: damageTargets.length,
            casterStats,
            casterAttrs,
            target,
            targetStats: targetMonsterCombat
              ? targetMonsterCombat.stats
              : target.kind === 'player'
                ? this.getPlayerCombatSnapshot(target.player).stats
                : undefined,
            targetAttrs: targetMonsterCombat
              ? targetMonsterCombat.attrs
              : target.kind === 'player'
                ? this.attrService.getPlayerFinalAttrs(target.player)
                : undefined,
          };
/** baseDamage：定义该变量以承载业务值。 */
          const baseDamage = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
/** update：定义该变量以承载业务值。 */
          const update = target.kind === 'monster'
            ? this.attackMonster(player, target.monster, baseDamage, `${skill.name}击中`, effect.damageKind ?? 'spell', effect.element, qiCost)
            : target.kind === 'player'
              ? this.attackPlayer(player, target.player, baseDamage, `${skill.name}击中`, effect.damageKind ?? 'spell', effect.element, qiCost)
              : target.kind === 'container'
                ? this.attackContainer(player, target.container, baseDamage, skill.name, target.container.name, effect.damageKind ?? 'spell', effect.element)
              : this.attackTerrain(player, target.x, target.y, baseDamage, skill.name, this.formatCombatTileLabel(target.tileType), effect.damageKind ?? 'spell', effect.element);
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

/** update：定义该变量以承载业务值。 */
      const update = effect.type === 'buff'
        ? this.applyBuffEffect(player, skill, effect, selectedTargets, options?.primaryTarget, anchor, casterStats)
        : effect.type === 'heal'
          ? this.applyHealEffect(player, skill, effect, techLevel, casterStats, casterAttrs, anchor, options?.primaryTarget)
          : effect.type === 'cleanse'
            ? this.applyCleanseEffect(player, skill, effect, selectedTargets, options?.primaryTarget)
            : this.applyPlayerTerrainEffect(player, skill, effect, anchor);
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
/** castTarget：定义该变量以承载业务值。 */
    const castTarget = options?.primaryTarget ?? selectedTargets[0];
/** equipmentResult：定义该变量以承载业务值。 */
    const equipmentResult = this.equipmentEffectService.dispatch(player, {
      trigger: 'on_skill_cast',
/** targetKind：定义该变量以承载业务值。 */
      targetKind: castTarget?.kind === 'container' ? 'tile' : castTarget?.kind,
      target: this.toEquipmentEffectTarget(castTarget),
    });
    for (const flag of equipmentResult.dirty) {
      dirty.add(flag as WorldDirtyFlag);
    }
    for (const playerId of equipmentResult.dirtyPlayers ?? []) {
      if (playerId === player.id) {
        continue;
      }
      result.dirtyPlayers ??= [];
      if (!result.dirtyPlayers.includes(playerId)) {
        result.dirtyPlayers.push(playerId);
      }
    }
    result.dirty = [...dirty];
    return result;
  }

/** resolvePendingPlayerSkillCast：执行对应的业务逻辑。 */
  resolvePendingPlayerSkillCast(player: PlayerState): WorldUpdate | null {
/** pendingCast：定义该变量以承载业务值。 */
    const pendingCast = player.pendingSkillCast;
    if (!pendingCast) {
      return null;
    }
    if (pendingCast.skipProgressThisTick) {
      pendingCast.skipProgressThisTick = false;
      return { messages: [], dirty: [] };
    }
    pendingCast.remainingTicks -= 1;
    if (pendingCast.remainingTicks > 0) {
      return { messages: [], dirty: [] };
    }
    player.pendingSkillCast = undefined;
/** skill：定义该变量以承载业务值。 */
    const skill = this.contentService.getSkill(pendingCast.skillId);
    if (!skill) {
      return { messages: [], dirty: [] };
    }
/** primaryTarget：定义该变量以承载业务值。 */
    const primaryTarget = pendingCast.targetRef
      ? this.targetingDomain.resolveTargetRef(player, pendingCast.targetRef) as ResolvedTarget | null ?? undefined
      : undefined;
    return this.castSkillAtAnchor(
      player,
      skill,
      { x: pendingCast.targetX, y: pendingCast.targetY },
      {
        primaryTarget,
        qiCost: pendingCast.qiCost,
        allowMiss: true,
        showActionLabel: true,
        consumedAction: false,
      },
    );
  }

/** interruptPendingPlayerSkillCast：执行对应的业务逻辑。 */
  interruptPendingPlayerSkillCast(player: PlayerState, reason?: string): WorldUpdate {
/** pendingCast：定义该变量以承载业务值。 */
    const pendingCast = player.pendingSkillCast;
    if (!pendingCast) {
      return EMPTY_UPDATE;
    }
    player.pendingSkillCast = undefined;
/** skill：定义该变量以承载业务值。 */
    const skill = this.contentService.getSkill(pendingCast.skillId);
    if (!reason) {
      return EMPTY_UPDATE;
    }
    return {
      messages: [{
        playerId: player.id,
        text: `${skill?.name ?? '当前神通'}的吟唱被打断：${reason}`,
        kind: 'combat',
      }],
      dirty: [],
    };
  }

  private beginPlayerSkillCast(
    player: PlayerState,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
    playerStats?: NumericStats,
    skipProgressThisTick = false,
    targetRef?: string,
  ): WorldUpdate {
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = this.getPlayerSkillWindupTicks(skill);
    if (windupTicks <= 0) {
/** primaryTarget：定义该变量以承载业务值。 */
      const primaryTarget = targetRef ? this.targetingDomain.resolveTargetRef(player, targetRef) as ResolvedTarget | null ?? undefined : undefined;
      return this.castSkillAtAnchor(player, skill, anchor, { primaryTarget, playerStats });
    }
/** warningCells：定义该变量以承载业务值。 */
    const warningCells = this.buildPlayerSkillAffectedCells(player, skill, anchor, playerStats);
    if (warningCells.length === 0) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }
/** qiCost：定义该变量以承载业务值。 */
    const qiCost = this.consumeQiForSkill(player, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }
    this.navigationService.clearMoveTarget(player.id);
    player.questNavigation = undefined;
    player.mapNavigation = undefined;
    this.faceToward(player, anchor.x, anchor.y);
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, playerStats ?? this.attrService.getPlayerNumericStats(player));
/** warningOrigin：定义该变量以承载业务值。 */
    const warningOrigin = (geometry.shape ?? 'single') === 'line'
      ? { x: player.x, y: player.y }
      : anchor;
    player.pendingSkillCast = {
      skillId: skill.id,
      targetX: anchor.x,
      targetY: anchor.y,
      targetRef,
      remainingTicks: windupTicks,
      qiCost,
      warningColor: this.getPlayerSkillWarningColor(skill),
      skipProgressThisTick,
    };
/** tickDurationMs：定义该变量以承载业务值。 */
    const tickDurationMs = this.getMapTickDurationMs(player.mapId);
    this.pushActionLabelEffect(player.mapId, player.x, player.y, skill.name, {
      actionStyle: 'chant',
      durationMs: windupTicks * tickDurationMs + 240,
    });
    this.pushEffect(player.mapId, {
      type: 'warning_zone',
      cells: warningCells.map((cell) => ({ x: cell.x, y: cell.y })),
      color: player.pendingSkillCast.warningColor ?? '#ff9a30',
      baseColor: '#ffe0a6',
      originX: warningOrigin.x,
      originY: warningOrigin.y,
      durationMs: windupTicks * tickDurationMs,
    });
    return { messages: [], dirty: [], consumedAction: true };
  }

/** tryActivateAutoRetaliate：执行对应的业务逻辑。 */
  private tryActivateAutoRetaliate(target: PlayerState, dirtyPlayers: Set<string>): void {
    if (
      target.hp <= 0
      || target.autoRetaliate === false
      || target.autoBattle
      // 手动寻路期间保持路径意图优先，避免受击反击把角色切进自动战斗。
      || this.navigationService.hasMoveTarget(target.id)
    ) {
      return;
    }

    target.autoBattle = true;
    target.retaliatePlayerTargetId = undefined;
    dirtyPlayers.add(target.id);
  }

  private tryActivatePlayerAutoRetaliate(
    target: PlayerState,
    attacker: PlayerState,
    dirtyPlayers: Set<string>,
  ): void {
    if (
      target.hp <= 0
      || target.autoRetaliate === false
      || target.autoBattle
      // 手动寻路期间保持路径意图优先，避免受击反击把角色切进自动战斗。
      || this.navigationService.hasMoveTarget(target.id)
    ) {
      return;
    }

    target.autoBattle = true;
    target.combatTargetId = this.getPlayerThreatId(attacker);
    target.combatTargetLocked = true;
    target.retaliatePlayerTargetId = attacker.id;
    dirtyPlayers.add(target.id);
  }

  /** 锁定目标并开启自动战斗 */
  engageTarget(player: PlayerState, targetRef?: string): WorldUpdate {
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }
/** target：定义该变量以承载业务值。 */
    const target = this.targetingDomain.resolveTargetRef(player, targetRef) as ResolvedTarget | null;
    if (!target || target.kind !== 'monster') {
      return { ...EMPTY_UPDATE, error: '只能锁定敌对单位' };
    }

    player.autoBattle = true;
    this.addThreatToTarget(this.getPlayerThreatId(player), player, target, gameplayConstants.DEFAULT_AGGRO_THRESHOLD);
    player.combatTargetId = target.monster.runtimeId;
    player.combatTargetLocked = false;
    player.retaliatePlayerTargetId = undefined;
    this.navigationService.clearMoveTarget(player.id);
/** update：定义该变量以承载业务值。 */
    const update = this.performAutoBattle(player);
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set(update.dirty);
    dirty.add('actions');
    return { ...update, dirty: [...dirty] };
  }

/** forceAttackTarget：执行对应的业务逻辑。 */
  forceAttackTarget(player: PlayerState, targetRef?: string): WorldUpdate {
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '请选择目标' };
    }
/** target：定义该变量以承载业务值。 */
    const target = this.targetingDomain.resolveTargetRef(player, targetRef) as ResolvedTarget | null;
    if (!target) {
      return { ...EMPTY_UPDATE, error: '目标不存在或不可选中' };
    }
    if (target.kind === 'player' && !this.canPlayerDealDamageToPlayer(player, target.player)) {
      return { ...EMPTY_UPDATE, error: '已关闭全体攻击，当前不会主动攻击其他玩家。' };
    }
/** effectiveViewRange：定义该变量以承载业务值。 */
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
    if (!isPointInRange(player, target, effectiveViewRange) || !this.targetingDomain.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return { ...EMPTY_UPDATE, error: '目标超出可锁定范围' };
    }
    if (target.kind === 'tile' && !this.mapService.canDamageTile(player.mapId, target.x, target.y)) {
      return { ...EMPTY_UPDATE, error: '该目标无法被攻击' };
    }

    player.autoBattle = true;
    if (target.kind !== 'tile') {
      this.addThreatToTarget(this.getPlayerThreatId(player), player, target, gameplayConstants.DEFAULT_AGGRO_THRESHOLD);
    }
    player.combatTargetId = this.getTargetRef(target);
    player.combatTargetLocked = true;
    player.retaliatePlayerTargetId = undefined;
    this.navigationService.clearMoveTarget(player.id);
/** update：定义该变量以承载业务值。 */
    const update = this.performAutoBattle(player);
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set(update.dirty);
    dirty.add('actions');
    return { ...update, dirty: [...dirty] };
  }

  private getSkillTargetingModifiers(stats: NumericStats | undefined): { extraRange: number; extraArea: number } {
    return {
      extraRange: Math.max(0, Math.floor(stats?.extraRange ?? 0)),
      extraArea: Math.max(0, Math.floor(stats?.extraArea ?? 0)),
    };
  }

/** buildEffectiveSkillGeometry：处理当前场景中的对应操作。 */
  private buildEffectiveSkillGeometry(skill: SkillDef, stats: NumericStats | undefined) {
/** baseGeometry：定义该变量以承载业务值。 */
    const baseGeometry = {
      range: skill.range,
      shape: skill.targeting?.shape ?? 'single',
      radius: skill.targeting?.radius,
      innerRadius: skill.targeting?.innerRadius,
      width: skill.targeting?.width,
      height: skill.targeting?.height,
    };
/** modifiers：定义该变量以承载业务值。 */
    const modifiers = this.getSkillTargetingModifiers(stats);
    return resolveTargetingGeometry(baseGeometry, {
      finalRange: Math.max(0, Math.floor(baseGeometry.range) + modifiers.extraRange),
      extraArea: modifiers.extraArea,
    });
  }

  private getEffectiveDamageTargetLimit(
    skill: SkillDef,
    buffs: TemporaryBuffState[] | undefined,
  ): number {
/** configuredMaxTargets：定义该变量以承载业务值。 */
    const configuredMaxTargets = skill.targeting?.maxTargets;
    if (!Number.isFinite(configuredMaxTargets) || (configuredMaxTargets ?? 0) <= 0) {
      return 99;
    }
/** baseMaxTargets：定义该变量以承载业务值。 */
    const baseMaxTargets = Math.max(1, Number(configuredMaxTargets));
    if (!skill.effects.some((effect) => effect.type === 'damage')) {
      return baseMaxTargets;
    }
/** hasFaxiang：定义该变量以承载业务值。 */
    const hasFaxiang = (buffs ?? []).some((buff) => (
      buff.buffId === 'buff.huanling_candan_faxiang'
      && buff.remainingTicks > 0
      && buff.stacks > 0
    ));
    return hasFaxiang ? Math.max(baseMaxTargets, baseMaxTargets * 2) : baseMaxTargets;
  }

  private buildPlayerSkillAffectedCells(
    player: PlayerState,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
    playerStats?: NumericStats,
  ): Array<{ x: number; y: number }> {
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, playerStats ?? this.attrService.getPlayerNumericStats(player));
/** shape：定义该变量以承载业务值。 */
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
      return isPointInRange(player, anchor, geometry.range) ? [{ x: anchor.x, y: anchor.y }] : [];
    }
    return computeAffectedCellsFromAnchor(player, anchor, {
      range: geometry.range,
      shape,
      radius: geometry.radius,
      innerRadius: geometry.innerRadius,
      width: geometry.width,
      height: geometry.height,
    });
  }

  private selectSkillTargets(
    player: PlayerState,
    skill: SkillDef,
    primaryTarget?: ResolvedTarget,
    playerStats?: NumericStats,
  ): ResolvedTarget[] {
    if (!primaryTarget) {
      return [];
    }
    return this.selectSkillTargetsFromAnchor(player, skill, { x: primaryTarget.x, y: primaryTarget.y }, playerStats, primaryTarget);
  }

  private selectSkillTargetsFromAnchor(
    player: PlayerState,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
    playerStats?: NumericStats,
    primaryTarget?: ResolvedTarget,
  ): ResolvedTarget[] {
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, playerStats ?? this.attrService.getPlayerNumericStats(player));
/** shape：定义该变量以承载业务值。 */
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
      if (primaryTarget) {
        return this.canPlayerUseHostileEffectOnTarget(player, primaryTarget) ? [primaryTarget] : [];
      }
/** monsters：定义该变量以承载业务值。 */
      const monsters = this.monstersByMap.get(player.mapId) ?? [];
/** players：定义该变量以承载业务值。 */
      const players = this.playerService.getPlayersByMap(player.mapId)
        .filter((entry) => entry.id !== player.id && !entry.dead);
      return this.collectTargetsFromCells(player, monsters, players, [{ x: anchor.x, y: anchor.y }], 1);
    }

/** monsters：定义该变量以承载业务值。 */
    const monsters = this.monstersByMap.get(player.mapId) ?? [];
/** players：定义该变量以承载业务值。 */
    const players = this.playerService.getPlayersByMap(player.mapId)
      .filter((entry) => entry.id !== player.id && !entry.dead);
/** maxTargets：定义该变量以承载业务值。 */
    const maxTargets = this.getEffectiveDamageTargetLimit(skill, player.temporaryBuffs);
/** cells：定义该变量以承载业务值。 */
    const cells = this.buildPlayerSkillAffectedCells(player, skill, anchor, playerStats);
/** targets：定义该变量以承载业务值。 */
    const targets = this.collectTargetsFromCells(player, monsters, players, cells, maxTargets);
    if (
      primaryTarget
      && this.canPlayerUseHostileEffectOnTarget(player, primaryTarget)
      && !targets.some((entry) => this.getTargetRef(entry) === this.getTargetRef(primaryTarget))
    ) {
      targets.unshift(primaryTarget);
      if (targets.length > maxTargets) {
        targets.length = maxTargets;
      }
    }
    return targets;
  }

  private canPlayerAutoBattleUseSkillOnTarget(
    player: PlayerState,
    skill: SkillDef,
    target: ResolvedTarget,
  ): boolean {
/** playerStats：定义该变量以承载业务值。 */
    const playerStats = this.attrService.getPlayerNumericStats(player);
    if (skill.requiresTarget !== false) {
      return isPointInRange(player, target, this.buildEffectiveSkillGeometry(skill, playerStats).range);
    }
    if (!this.isAutoBattleHostileNoTargetSkill(skill)) {
      return true;
    }

/** selectedTargets：定义该变量以承载业务值。 */
    const selectedTargets = this.selectSkillTargetsFromAnchor(
      player,
      skill,
      { x: player.x, y: player.y },
      playerStats,
    );
/** targetRef：定义该变量以承载业务值。 */
    const targetRef = this.getTargetRef(target);
    return selectedTargets.some((entry) => this.getTargetRef(entry) === targetRef);
  }

  private isAutoBattleHostileNoTargetSkill(skill: SkillDef): boolean {
    return skill.effects.some((effect) => {
      if (effect.type === 'damage' || effect.type === 'terrain') {
        return true;
      }
      if (effect.type === 'buff') {
        return effect.target === 'target';
      }
      if (effect.type === 'cleanse') {
        return effect.target === 'target';
      }
      return false;
    });
  }

  private collectTargetsFromCells(
    player: PlayerState,
    monsters: RuntimeMonster[],
    players: PlayerState[],
/** cells：定义该变量以承载业务值。 */
    cells: Array<{ x: number; y: number }>,
    maxTargets: number,
  ): ResolvedTarget[] {
/** resolved：定义该变量以承载业务值。 */
    const resolved: ResolvedTarget[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();

    for (const cell of cells) {
      const monster = monsters.find((entry) => entry.alive && entry.x === cell.x && entry.y === cell.y);
      if (monster && this.canPlayerDealDamageToMonster(player)) {
/** key：定义该变量以承载业务值。 */
        const key = `monster:${monster.runtimeId}`;
        if (!seen.has(key)) {
          resolved.push({ kind: 'monster', x: monster.x, y: monster.y, monster });
          seen.add(key);
          if (resolved.length >= maxTargets) {
            return resolved;
          }
        }
      }

/** targetPlayer：定义该变量以承载业务值。 */
      const targetPlayer = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
      if (targetPlayer && this.canPlayerDealDamageToPlayer(player, targetPlayer)) {
/** key：定义该变量以承载业务值。 */
        const key = `player:${targetPlayer.id}`;
        if (!seen.has(key)) {
          resolved.push({ kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer });
          seen.add(key);
          if (resolved.length >= maxTargets) {
            return resolved;
          }
        }
      }

/** container：定义该变量以承载业务值。 */
      const container = this.mapService.getContainerAt(player.mapId, cell.x, cell.y);
      if (container?.variant === 'herb' && this.canPlayerDealDamageToEnvironment(player)) {
/** runtime：定义该变量以承载业务值。 */
        const runtime = this.lootService.getContainerRuntimeView(player.mapId, container);
        if (!runtime.destroyed && !runtime.respawning) {
/** key：定义该变量以承载业务值。 */
          const key = `container:${container.id}`;
          if (!seen.has(key)) {
            resolved.push({ kind: 'container', x: container.x, y: container.y, container });
            seen.add(key);
            if (resolved.length >= maxTargets) {
              return resolved;
            }
          }
        }
      }

/** tile：定义该变量以承载业务值。 */
      const tile = this.mapService.getTile(player.mapId, cell.x, cell.y);
      if (!tile || !tile.hp || !tile.maxHp) {
        continue;
      }
      if (!this.canPlayerDealDamageToEnvironment(player)) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
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

  private collectFriendlyPlayersFromCells(
    player: PlayerState,
/** cells：定义该变量以承载业务值。 */
    cells: Array<{ x: number; y: number }>,
    maxTargets: number,
  ): Array<Extract<ResolvedTarget, { kind: 'player' }>> {
/** resolved：定义该变量以承载业务值。 */
    const resolved: Array<Extract<ResolvedTarget, { kind: 'player' }>> = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();
/** players：定义该变量以承载业务值。 */
    const players = this.playerService.getPlayersByMap(player.mapId)
      .filter((entry) => !entry.dead);

    for (const cell of cells) {
      const targetPlayer = players.find((entry) => (
        entry.x === cell.x
        && entry.y === cell.y
        && this.canPlayerTreatPlayer(player, entry)
      ));
      if (!targetPlayer) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
      const key = `player:${targetPlayer.id}`;
      if (seen.has(key)) {
        continue;
      }
      resolved.push({ kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer });
      seen.add(key);
      if (resolved.length >= maxTargets) {
        return resolved;
      }
    }

    return resolved;
  }

/** pickDamageTargets：执行对应的业务逻辑。 */
  private pickDamageTargets(selectedTargets: ResolvedTarget[], primaryTarget?: ResolvedTarget): ResolvedTarget[] {
    return selectedTargets.length > 0 ? selectedTargets : [];
  }

  private toEquipmentEffectTarget(target: ResolvedTarget | undefined):
    | { kind: 'player'; player: PlayerState }
    | { kind: 'monster'; monster: RuntimeMonster }
    | { kind: 'tile' }
    | undefined {
    if (!target) {
      return undefined;
    }
    if (target.kind === 'player') {
      return { kind: 'player', player: target.player };
    }
    if (target.kind === 'monster') {
      return { kind: 'monster', monster: target.monster };
    }
    return { kind: 'tile' };
  }

/** normalizeBuffShortMark：执行对应的业务逻辑。 */
  private normalizeBuffShortMark(effect: Extract<SkillEffectDef, { type: 'buff' }>): string {
/** raw：定义该变量以承载业务值。 */
    const raw = effect.shortMark?.trim();
    if (raw) {
      return [...raw][0] ?? raw;
    }
/** fallback：定义该变量以承载业务值。 */
    const fallback = [...effect.name.trim()][0];
    return fallback ?? '气';
  }

  private buildTemporaryBuffState(
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'buff' }>,
    sourceRealmLv: number,
    sourceCasterId?: string,
  ): TemporaryBuffState {
/** maxStacks：定义该变量以承载业务值。 */
    const maxStacks = Math.max(1, effect.maxStacks ?? 1);
/** duration：定义该变量以承载业务值。 */
    const duration = Math.max(1, effect.duration);
/** infiniteDuration：定义该变量以承载业务值。 */
    const infiniteDuration = effect.infiniteDuration === true;
/** initialStacks：定义该变量以承载业务值。 */
    const initialStacks = Math.min(maxStacks, Math.max(1, effect.stacks ?? 1));
    return syncDynamicBuffPresentation({
      buffId: effect.buffId,
      name: effect.name,
      desc: effect.desc,
      baseDesc: effect.desc,
      shortMark: this.normalizeBuffShortMark(effect),
/** category：定义该变量以承载业务值。 */
      category: effect.category ?? (effect.target === 'target' ? 'debuff' : 'buff'),
      visibility: effect.visibility ?? 'public',
      remainingTicks: infiniteDuration ? 1 : duration + 1,
      duration,
      stacks: initialStacks,
      maxStacks,
      sourceSkillId: skill.id,
      sourceCasterId,
      sourceSkillName: skill.name,
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      color: effect.color,
      attrs: effect.attrs,
      attrMode: effect.attrMode,
      stats: effect.stats,
      statMode: effect.statMode,
      qiProjection: effect.qiProjection,
      presentationScale: effect.presentationScale,
      infiniteDuration,
      sustainCost: effect.sustainCost,
      sustainTicksElapsed: effect.sustainCost ? 0 : undefined,
      expireWithBuffId: effect.expireWithBuffId,
      persistOnDeath: effect.persistOnDeath === true,
      persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    });
  }

  private buildMonsterInitialBuffState(
    monster: Pick<RuntimeMonster, 'id' | 'name' | 'level'>,
    effect: MonsterInitialBuffDef,
  ): TemporaryBuffState {
/** maxStacks：定义该变量以承载业务值。 */
    const maxStacks = Math.max(1, effect.maxStacks ?? 1);
/** duration：定义该变量以承载业务值。 */
    const duration = Math.max(1, effect.duration);
/** infiniteDuration：定义该变量以承载业务值。 */
    const infiniteDuration = effect.infiniteDuration === true;
/** initialStacks：定义该变量以承载业务值。 */
    const initialStacks = Math.min(maxStacks, Math.max(1, effect.stacks ?? 1));
    return syncDynamicBuffPresentation({
      buffId: effect.buffId,
      name: effect.name,
      desc: effect.desc,
      baseDesc: effect.desc,
      shortMark: effect.shortMark?.trim() ? [...effect.shortMark.trim()][0] ?? effect.shortMark.trim() : ([...effect.name.trim()][0] ?? '气'),
      category: effect.category ?? 'buff',
      visibility: effect.visibility ?? 'public',
      remainingTicks: infiniteDuration ? 1 : duration + 1,
      duration,
      stacks: initialStacks,
      maxStacks,
      sourceSkillId: buildMonsterInitialBuffSourceId(monster.id, effect.buffId),
      sourceSkillName: `${monster.name}·先天妖势`,
      realmLv: Math.max(1, Math.floor(monster.level ?? 1)),
      color: effect.color,
      attrs: effect.attrs,
      attrMode: effect.attrMode,
      stats: effect.stats,
      statMode: effect.statMode,
      qiProjection: effect.qiProjection,
      presentationScale: effect.presentationScale,
      infiniteDuration,
      sustainCost: effect.sustainCost,
      sustainTicksElapsed: effect.sustainCost ? 0 : undefined,
      expireWithBuffId: effect.expireWithBuffId,
      persistOnDeath: effect.persistOnDeath === true,
      persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    });
  }

/** applyMonsterInitialBuffs：执行对应的业务逻辑。 */
  private applyMonsterInitialBuffs(monster: RuntimeMonster): void {
    if (!monster.initialBuffs || monster.initialBuffs.length === 0) {
      monster.temporaryBuffs = [];
      this.syncMonsterRuntimeResources(monster, { fillHp: true, fillQi: true });
      return;
    }
/** nextBuffs：定义该变量以承载业务值。 */
    const nextBuffs: TemporaryBuffState[] = [];
    for (const effect of monster.initialBuffs) {
      this.applyBuffState(nextBuffs, this.buildMonsterInitialBuffState(monster, effect));
    }
    monster.temporaryBuffs = nextBuffs.filter((buff) => buff.remainingTicks > 0 && buff.stacks > 0);
    this.syncMonsterRuntimeResources(monster, { fillHp: true, fillQi: true });
  }

  private syncMonsterRuntimeResources(
    monster: RuntimeMonster,
    options: {
      fillHp?: boolean;
      fillQi?: boolean;
      previousHp?: number;
      previousQi?: number;
    } = {},
  ): void {
/** combat：定义该变量以承载业务值。 */
    const combat = this.getMonsterCombatSnapshot(monster);
/** nextMaxHp：定义该变量以承载业务值。 */
    const nextMaxHp = Math.max(1, Math.round(combat.stats.maxHp));
/** nextMaxQi：定义该变量以承载业务值。 */
    const nextMaxQi = Math.max(0, Math.round(combat.stats.maxQi));
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = Number.isFinite(options.previousHp) ? Number(options.previousHp) : monster.hp;
/** previousQi：定义该变量以承载业务值。 */
    const previousQi = Number.isFinite(options.previousQi) ? Number(options.previousQi) : monster.qi;
    monster.maxHp = nextMaxHp;
    monster.hp = options.fillHp
      ? nextMaxHp
      : Math.max(0, Math.min(nextMaxHp, Math.round(previousHp)));
    monster.qi = options.fillQi
      ? nextMaxQi
      : Math.max(0, Math.min(nextMaxQi, Math.round(previousQi)));
  }

/** applyBuffState：执行对应的业务逻辑。 */
  private applyBuffState(targetBuffs: TemporaryBuffState[], nextBuff: TemporaryBuffState): TemporaryBuffState {
/** existing：定义该变量以承载业务值。 */
    const existing = targetBuffs.find((entry) => entry.buffId === nextBuff.buffId);
    if (existing) {
      existing.name = nextBuff.name;
      existing.desc = nextBuff.desc;
      existing.baseDesc = nextBuff.baseDesc;
      existing.shortMark = nextBuff.shortMark;
      existing.category = nextBuff.category;
      existing.visibility = nextBuff.visibility;
      existing.remainingTicks = nextBuff.remainingTicks;
      existing.duration = nextBuff.duration;
      existing.stacks = Math.min(nextBuff.maxStacks, existing.stacks + Math.max(1, nextBuff.stacks));
      existing.maxStacks = nextBuff.maxStacks;
      existing.sourceSkillId = nextBuff.sourceSkillId;
      existing.sourceCasterId = nextBuff.sourceCasterId;
      existing.sourceSkillName = nextBuff.sourceSkillName;
      existing.realmLv = nextBuff.realmLv;
      existing.color = nextBuff.color;
      existing.attrs = nextBuff.attrs;
      existing.attrMode = nextBuff.attrMode;
      existing.stats = nextBuff.stats;
      existing.statMode = nextBuff.statMode;
      existing.qiProjection = nextBuff.qiProjection;
      existing.presentationScale = nextBuff.presentationScale;
      existing.infiniteDuration = nextBuff.infiniteDuration;
      existing.sustainCost = nextBuff.sustainCost;
      existing.sustainTicksElapsed = nextBuff.sustainTicksElapsed;
      existing.expireWithBuffId = nextBuff.expireWithBuffId;
      existing.persistOnDeath = nextBuff.persistOnDeath;
      existing.persistOnReturnToSpawn = nextBuff.persistOnReturnToSpawn;
      syncDynamicBuffPresentation(existing);
      return existing;
    }
    targetBuffs.push(syncDynamicBuffPresentation(nextBuff));
    return nextBuff;
  }

  private getPlayerRealmLevel(player: Pick<PlayerState, 'realm' | 'realmLv'>): number {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
  }

  private getPlayerBloodEssenceCount(player: Pick<PlayerState, 'realm' | 'realmLv'>): number {
/** realmLv：定义该变量以承载业务值。 */
    const realmLv = this.getPlayerRealmLevel(player);
    return realmLv * realmLv;
  }

  private buildPvPSoulInjuryBuffState(sourceRealmLv: number): TemporaryBuffState {
    return syncDynamicBuffPresentation({
      buffId: PVP_SOUL_INJURY_BUFF_ID,
      name: '神魂受损',
      desc: '神魂受创，神识 -1%；身死与遁返都不会清除，需静养满一时辰。',
      baseDesc: '神魂受创，神识 -1%；身死与遁返都不会清除，需静养满一时辰。',
      shortMark: '残',
      category: 'debuff',
      visibility: 'public',
      remainingTicks: PVP_SOUL_INJURY_DURATION_TICKS + 1,
      duration: PVP_SOUL_INJURY_DURATION_TICKS,
      stacks: 1,
      maxStacks: 1,
      sourceSkillId: PVP_SOUL_INJURY_SOURCE_ID,
      sourceSkillName: '杀孽',
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      color: '#8a5a64',
      attrs: {
        spirit: -1,
      },
      attrMode: 'percent',
      persistOnDeath: true,
      persistOnReturnToSpawn: true,
    });
  }

  private buildPvPShaInfusionBuffState(sourceRealmLv: number): TemporaryBuffState {
    return syncDynamicBuffPresentation({
      buffId: PVP_SHA_INFUSION_BUFF_ID,
      name: '煞气入体',
      desc: '每层攻击 +1%、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。',
      baseDesc: '每层攻击 +1%、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。',
      shortMark: '煞',
      category: 'buff',
      visibility: 'public',
      remainingTicks: PVP_SHA_INFUSION_DECAY_TICKS + 1,
      duration: PVP_SHA_INFUSION_DECAY_TICKS,
      stacks: 1,
      maxStacks: 999999,
      sourceSkillId: PVP_SHA_INFUSION_SOURCE_ID,
      sourceSkillName: '杀孽',
      realmLv: Math.max(1, Math.floor(sourceRealmLv)),
      color: '#7a2e2e',
      stats: {
        physAtk: 1,
        spellAtk: 1,
        physDef: -2,
        spellDef: -2,
      },
      statMode: 'percent',
      persistOnDeath: true,
    });
  }

  private applyPvPSoulInjury(player: PlayerState): void {
    player.temporaryBuffs ??= [];
    this.applyBuffState(player.temporaryBuffs, this.buildPvPSoulInjuryBuffState(this.getPlayerRealmLevel(player)));
    this.attrService.recalcPlayer(player);
  }

  private addPvPShaInfusionStack(player: PlayerState): number {
    player.temporaryBuffs ??= [];
/** existing：定义该变量以承载业务值。 */
    const existing = player.temporaryBuffs.find((buff) => buff.buffId === PVP_SHA_INFUSION_BUFF_ID);
    if (existing && existing.remainingTicks > 0) {
      existing.name = '煞气入体';
      existing.desc = '每层攻击 +1%、防御 -2%；每十分钟自然消退一层，死亡时会按层数比例折损当前境界修为，不足时继续折损底蕴。';
      existing.baseDesc = existing.desc;
      existing.shortMark = '煞';
      existing.category = 'buff';
      existing.visibility = 'public';
      existing.duration = PVP_SHA_INFUSION_DECAY_TICKS;
      existing.maxStacks = Math.max(999999, existing.maxStacks);
      existing.stacks = Math.min(existing.maxStacks, existing.stacks + 1);
      existing.sourceSkillId = PVP_SHA_INFUSION_SOURCE_ID;
      existing.sourceSkillName = '杀孽';
      existing.realmLv = this.getPlayerRealmLevel(player);
      existing.color = '#7a2e2e';
      existing.stats = {
        physAtk: 1,
        spellAtk: 1,
        physDef: -2,
        spellDef: -2,
      };
      existing.statMode = 'percent';
      existing.persistOnDeath = true;
      syncDynamicBuffPresentation(existing);
      this.attrService.recalcPlayer(player);
      return existing.stacks;
    }
/** created：定义该变量以承载业务值。 */
    const created = this.buildPvPShaInfusionBuffState(this.getPlayerRealmLevel(player));
    player.temporaryBuffs.push(created);
    this.attrService.recalcPlayer(player);
    return created.stacks;
  }

  private applyShaInfusionDeathPenalty(player: PlayerState): {
    stacks: number;
    loss: number;
    consumedProgress: number;
    consumedFoundation: number;
  } {
/** stacks：定义该变量以承载业务值。 */
    const stacks = this.getEntityBuffStacks(player.temporaryBuffs, PVP_SHA_INFUSION_BUFF_ID);
    if (stacks <= 0) {
      return {
        stacks: 0,
        loss: 0,
        consumedProgress: 0,
        consumedFoundation: 0,
      };
    }
    this.techniqueService.initializePlayerProgression(player);
/** progressToNext：定义该变量以承载业务值。 */
    const progressToNext = Math.max(
      0,
      Math.floor(
        player.realm?.progressToNext
          ?? this.contentService.getRealmLevelEntry(this.getPlayerRealmLevel(player))?.expToNext
          ?? 0,
      ),
    );
/** loss：定义该变量以承载业务值。 */
    const loss = Math.max(0, Math.floor((progressToNext * stacks) / 100));
    if (loss <= 0) {
      return {
        stacks,
        loss: 0,
        consumedProgress: 0,
        consumedFoundation: 0,
      };
    }
/** consumed：定义该变量以承载业务值。 */
    const consumed = this.techniqueService.consumeRealmProgressAndFoundation(player, loss);
    return {
      stacks,
      loss,
      consumedProgress: consumed.consumedProgress,
      consumedFoundation: consumed.consumedFoundation,
    };
  }

  private applyPvPKillRewards(
    killer: PlayerState,
    victim: PlayerState,
    deathSite: { mapId: string; x: number; y: number },
    messages: WorldMessage[],
  ): {
    killerDirty: WorldDirtyFlag[];
    victimAttrChanged: boolean;
  } {
    if (killer.isBot || victim.isBot || killer.id === victim.id) {
      return { killerDirty: [], victimAttrChanged: false };
    }

/** killerDirty：定义该变量以承载业务值。 */
    const killerDirty = new Set<WorldDirtyFlag>(['attr']);
/** nextStacks：定义该变量以承载业务值。 */
    const nextStacks = this.addPvPShaInfusionStack(killer);
    messages.push({
      playerId: killer.id,
      text: `杀念入体，煞气入体加深至 ${nextStacks} 层。`,
      kind: 'combat',
    });

/** alreadySoulInjured：定义该变量以承载业务值。 */
    const alreadySoulInjured = this.entityHasActiveBuff(victim.temporaryBuffs, PVP_SOUL_INJURY_BUFF_ID);
    if (alreadySoulInjured) {
      return { killerDirty: [...killerDirty], victimAttrChanged: true };
    }
    this.applyPvPSoulInjury(victim);
    messages.push({
      playerId: victim.id,
      text: '神魂受损，一时辰内神识 -1%；身死与遁返都不会清除。',
      kind: 'combat',
    });

/** bloodEssenceCount：定义该变量以承载业务值。 */
    const bloodEssenceCount = this.getPlayerBloodEssenceCount(victim);
    if (bloodEssenceCount <= 0) {
      return { killerDirty: [...killerDirty], victimAttrChanged: true };
    }
/** reward：定义该变量以承载业务值。 */
    const reward = this.contentService.createItem(BLOOD_ESSENCE_ITEM_ID, bloodEssenceCount);
    if (reward) {
      if (this.inventoryService.addItem(killer, reward)) {
        killerDirty.add('inv');
        messages.push({
          playerId: killer.id,
          text: `你从 ${victim.name} 体内掠得 ${reward.name} x${bloodEssenceCount}。`,
          kind: 'loot',
        });
      } else {
        this.lootService.dropToGround(deathSite.mapId, deathSite.x, deathSite.y, reward);
        killerDirty.add('loot');
        messages.push({
          playerId: killer.id,
          text: `你的背包已满，${reward.name} x${bloodEssenceCount} 掉在了 ${victim.name} 倒下之处。`,
          kind: 'loot',
        });
      }
    }
/** corpseShaGain：定义该变量以承载业务值。 */
    const corpseShaGain = bloodEssenceCount * BLOOD_ESSENCE_SHA_GAIN;
    this.mapService.addTileResourceValue(deathSite.mapId, deathSite.x, deathSite.y, REFINED_SHA_RESOURCE_KEY, corpseShaGain);
    messages.push({
      playerId: killer.id,
      text: `${victim.name} 的尸身余煞在原地凝成 ${corpseShaGain} 点煞气。`,
      kind: 'combat',
    });
    return { killerDirty: [...killerDirty], victimAttrChanged: true };
  }

/** getRenderableBuffs：执行对应的业务逻辑。 */
  private getRenderableBuffs(buffs: TemporaryBuffState[] | undefined): VisibleBuffState[] | undefined {
    if (!buffs || buffs.length === 0) {
      return undefined;
    }
/** visible：定义该变量以承载业务值。 */
    const visible = buffs
      .filter((buff) => buff.remainingTicks > 0 && buff.visibility !== 'hidden')
      .map<VisibleBuffState>((buff) => ({
        buffId: buff.buffId,
        name: buff.name,
        desc: syncDynamicBuffPresentation(buff).desc,
        shortMark: buff.shortMark,
        category: buff.category,
        visibility: buff.visibility,
        remainingTicks: buff.remainingTicks,
        duration: buff.duration,
        stacks: buff.stacks,
        maxStacks: buff.maxStacks,
        sourceSkillId: buff.sourceSkillId,
        sourceSkillName: buff.sourceSkillName,
        realmLv: buff.realmLv,
        color: buff.color,
        attrs: buff.attrs,
        attrMode: buff.attrMode,
        stats: buff.stats,
        statMode: buff.statMode,
        infiniteDuration: buff.infiniteDuration,
      }));
    return visible.length > 0 ? visible : undefined;
  }

/** getMapRenderableBuffs：执行对应的业务逻辑。 */
  private getMapRenderableBuffs(buffs: TemporaryBuffState[] | undefined): VisibleBuffState[] | undefined {
/** visible：定义该变量以承载业务值。 */
    const visible = buffs
      ?.filter((buff) => buff.remainingTicks > 0 && buff.visibility === 'public')
      .map<VisibleBuffState>((buff) => ({
        buffId: buff.buffId,
        name: buff.name,
        shortMark: buff.shortMark,
        category: buff.category,
        visibility: 'public',
        remainingTicks: 0,
        duration: 0,
        stacks: 1,
        maxStacks: 1,
        sourceSkillId: buff.sourceSkillId,
        sourceSkillName: buff.sourceSkillName,
        realmLv: buff.realmLv,
        color: buff.color,
        attrMode: buff.attrMode,
        statMode: buff.statMode,
        infiniteDuration: buff.infiniteDuration,
      }));
    return visible && visible.length > 0 ? visible : undefined;
  }

/** getPlayerRenderableBuffs：执行对应的业务逻辑。 */
  private getPlayerRenderableBuffs(player: PlayerState): VisibleBuffState[] | undefined {
/** visible：定义该变量以承载业务值。 */
    const visible = this.getRenderableBuffs(player.temporaryBuffs) ?? [];
    visible.push(...this.techniqueActivityService.buildVisibleBuffs(player));
    return visible.length > 0 ? visible : undefined;
  }

/** getPlayerMapRenderableBuffs：执行对应的业务逻辑。 */
  private getPlayerMapRenderableBuffs(player: PlayerState): VisibleBuffState[] | undefined {
/** visible：定义该变量以承载业务值。 */
    const visible = this.getMapRenderableBuffs(player.temporaryBuffs) ?? [];
    for (const activityBuff of this.techniqueActivityService.buildVisibleBuffs(player)) {
      visible.push({
        ...activityBuff,
        remainingTicks: 0,
        duration: 0,
        stacks: 1,
        maxStacks: 1,
      });
    }
    return visible.length > 0 ? visible : undefined;
  }

/** getObservedEntitiesAt：执行对应的业务逻辑。 */
  getObservedEntitiesAt(viewer: PlayerState, x: number, y: number): ObservedTileEntityDetail[] {
/** sourceMapId：定义该变量以承载业务值。 */
    let sourceMapId = viewer.mapId;
/** resolvedX：定义该变量以承载业务值。 */
    let resolvedX = x;
/** resolvedY：定义该变量以承载业务值。 */
    let resolvedY = y;

    if (!this.mapService.isPointInMapBounds(sourceMapId, resolvedX, resolvedY)) {
/** parentMapId：定义该变量以承载业务值。 */
      const parentMapId = this.mapService.getOverlayParentMapId(sourceMapId);
      if (!parentMapId) {
        return [];
      }
/** projected：定义该变量以承载业务值。 */
      const projected = this.mapService.projectPointToMap(parentMapId, sourceMapId, resolvedX, resolvedY);
      if (!projected) {
        return [];
      }
      sourceMapId = parentMapId;
      resolvedX = projected.x;
      resolvedY = projected.y;
    }

/** containers：定义该变量以承载业务值。 */
    const containers = this.mapService.getContainers(sourceMapId)
      .filter((container) => container.x === resolvedX && container.y === resolvedY)
      .map<ObservedTileEntityDetail>((container) => this.observationDomain.buildContainerObservationDetail(sourceMapId, container));

/** npcs：定义该变量以承载业务值。 */
    const npcs = this.mapService.getNpcs(sourceMapId)
      .filter((npc) => npc.x === resolvedX && npc.y === resolvedY)
      .map<ObservedTileEntityDetail>((npc) => this.observationDomain.buildNpcObservationDetail(viewer, npc, sourceMapId));

/** monsters：定义该变量以承载业务值。 */
    const monsters = (this.monstersByMap.get(sourceMapId) ?? [])
      .filter((monster) => monster.alive && monster.x === resolvedX && monster.y === resolvedY)
      .map<ObservedTileEntityDetail>((monster) => this.observationDomain.buildMonsterObservationDetail(viewer, monster));

/** playersAtTile：定义该变量以承载业务值。 */
    const playersAtTile = this.playerService.getPlayersByMap(sourceMapId)
      .filter((player) => player.x === resolvedX && player.y === resolvedY);
/** players：定义该变量以承载业务值。 */
    const players = playersAtTile.length >= PLAYER_CROWD_RENDER_THRESHOLD
      ? [this.buildCrowdObservationDetail(resolvedX, resolvedY, playersAtTile.length)]
      : playersAtTile.map<ObservedTileEntityDetail>((player) => this.observationDomain.buildPlayerObservationDetail(viewer, player));

    return [...players, ...containers, ...npcs, ...monsters];
  }

  private applyBuffEffect(
    player: PlayerState,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'buff' }>,
    selectedTargets: ResolvedTarget[],
    primaryTarget?: ResolvedTarget,
    anchor?: { x: number; y: number },
    playerStats?: NumericStats,
  ): WorldUpdate {
/** affected：定义该变量以承载业务值。 */
    const affected: Array<{ target: BuffTargetEntity; buff: TemporaryBuffState }> = [];
/** sourceRealmLv：定义该变量以承载业务值。 */
    const sourceRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    if (effect.target === 'self') {
      player.temporaryBuffs ??= [];
/** current：定义该变量以承载业务值。 */
      const current = this.applyBuffState(player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv, player.id));
      this.attrService.recalcPlayer(player);
      affected.push({ target: { kind: 'player', player }, buff: current });
    } else if (effect.target === 'allies') {
/** targets：定义该变量以承载业务值。 */
      const targets = this.collectFriendlyPlayersFromCells(
        player,
        this.buildPlayerSkillAffectedCells(player, skill, anchor ?? { x: player.x, y: player.y }, playerStats),
        Number.isFinite(skill.targeting?.maxTargets) ? Math.max(1, Number(skill.targeting?.maxTargets)) : 99,
      );
      if (targets.length === 0) {
        return { ...EMPTY_UPDATE, error: '当前技能没有可施加状态的友方目标' };
      }
      for (const target of targets) {
        target.player.temporaryBuffs ??= [];
        const current = this.applyBuffState(target.player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv, player.id));
        this.attrService.recalcPlayer(target.player);
        affected.push({ target: { kind: 'player', player: target.player }, buff: current });
      }
    } else {
/** targets：定义该变量以承载业务值。 */
      const targets = this.pickDamageTargets(selectedTargets, primaryTarget)
        .filter((entry): entry is Extract<ResolvedTarget, { kind: 'monster' | 'player' }> => entry.kind === 'monster' || entry.kind === 'player');
      if (targets.length === 0) {
        return { ...EMPTY_UPDATE, error: '当前技能没有可施加状态的有效目标' };
      }
      for (const target of targets) {
        if (target.kind === 'monster') {
          target.monster.temporaryBuffs ??= [];
/** previousHp：定义该变量以承载业务值。 */
          const previousHp = target.monster.hp;
/** previousQi：定义该变量以承载业务值。 */
          const previousQi = target.monster.qi;
/** current：定义该变量以承载业务值。 */
          const current = this.applyBuffState(target.monster.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv, player.id));
          this.syncMonsterRuntimeResources(target.monster, { previousHp, previousQi });
          affected.push({ target: { kind: 'monster', monster: target.monster }, buff: current });
          continue;
        }
        target.player.temporaryBuffs ??= [];
/** current：定义该变量以承载业务值。 */
        const current = this.applyBuffState(target.player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv, player.id));
        this.attrService.recalcPlayer(target.player);
        affected.push({ target: { kind: 'player', player: target.player }, buff: current });
      }
    }

/** selfDirty：定义该变量以承载业务值。 */
    const selfDirty = affected.some((entry) => entry.target.kind === 'player' && entry.target.player.id === player.id);
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = affected
      .filter((entry): entry is { target: { kind: 'player'; player: PlayerState }; buff: TemporaryBuffState } => (
        entry.target.kind === 'player' && entry.target.player.id !== player.id
      ))
      .map((entry) => entry.target.player.id);
/** targetNames：定义该变量以承载业务值。 */
    const targetNames = affected.map((entry) => {
      if (entry.target.kind === 'monster') {
        return entry.target.monster.name;
      }
      return entry.target.player.id === player.id ? '你' : entry.target.player.name;
    });
/** uniqueNames：定义该变量以承载业务值。 */
    const uniqueNames = [...new Set(targetNames)];
/** summary：定义该变量以承载业务值。 */
    const summary = uniqueNames.join('、');
/** primaryBuff：定义该变量以承载业务值。 */
    const primaryBuff = affected[0]?.buff;
/** stackText：定义该变量以承载业务值。 */
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

  private applyHealEffect(
    player: PlayerState,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'heal' }>,
    techLevel: number,
    casterStats: NumericStats,
    casterAttrs: Attributes,
    anchor?: { x: number; y: number },
    primaryTarget?: ResolvedTarget,
  ): WorldUpdate {
/** targets：定义该变量以承载业务值。 */
    const targets = effect.target === 'self'
      ? [{ kind: 'player', x: player.x, y: player.y, player }] as Array<Extract<ResolvedTarget, { kind: 'player' }>>
      : effect.target === 'allies'
        ? this.collectFriendlyPlayersFromCells(
          player,
          this.buildPlayerSkillAffectedCells(player, skill, anchor ?? { x: player.x, y: player.y }, casterStats),
          Number.isFinite(skill.targeting?.maxTargets) ? Math.max(1, Number(skill.targeting?.maxTargets)) : 99,
        )
        : (primaryTarget?.kind === 'player' && this.canPlayerTreatPlayer(player, primaryTarget.player) ? [primaryTarget] : []);
    if (targets.length === 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有可治疗的有效目标' };
    }

/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** healedTargets：定义该变量以承载业务值。 */
    const healedTargets: PlayerState[] = [];
/** selfHealed：定义该变量以承载业务值。 */
    let selfHealed = false;
/** rawTotalHeal：定义该变量以承载业务值。 */
    let rawTotalHeal = 0;
/** totalHeal：定义该变量以承载业务值。 */
    let totalHeal = 0;

    for (const target of targets) {
      const targetCombat = this.getPlayerCombatSnapshot(target.player);
      const context: SkillFormulaContext = {
        player,
        skill,
        techLevel,
        targetCount: targets.length,
        casterStats,
        casterAttrs,
        target,
        targetStats: targetCombat.stats,
        targetAttrs: this.attrService.getPlayerFinalAttrs(target.player),
      };
/** amount：定义该变量以承载业务值。 */
      const amount = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
/** previousHp：定义该变量以承载业务值。 */
      const previousHp = target.player.hp;
      target.player.hp = Math.min(target.player.maxHp, target.player.hp + amount);
/** actualHeal：定义该变量以承载业务值。 */
      const actualHeal = target.player.hp - previousHp;
      if (actualHeal <= 0) {
        continue;
      }
      rawTotalHeal += amount;
      totalHeal += actualHeal;
      healedTargets.push(target.player);
      if (target.player.id === player.id) {
        selfHealed = true;
      } else {
        dirtyPlayers.add(target.player.id);
      }
    }

    if (totalHeal <= 0) {
      return { ...EMPTY_UPDATE, error: '目标气血已满，未产生治疗效果' };
    }
/** messageViewerIds：定义该变量以承载业务值。 */
    const messageViewerIds = new Set<string>([player.id, ...healedTargets.map((target) => target.id)]);
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [...messageViewerIds].map((viewerId) => {
/** visibleTargetNames：定义该变量以承载业务值。 */
      const visibleTargetNames = [...new Set(healedTargets.map((target) => this.formatCombatPlayerLabel(target, viewerId)))];
/** visibleHpStates：定义该变量以承载业务值。 */
      const visibleHpStates = [...new Set(healedTargets.map((target) => (
        `${this.formatCombatPlayerLabel(target, viewerId)} ${this.formatCombatHp(target.hp, target.maxHp)}`
      )))];
      return {
        playerId: viewerId,
/** text：定义该变量以承载业务值。 */
        text: `${this.formatCombatActionClause(viewerId === player.id ? '你' : player.name, visibleTargetNames.join('、'), skill.name)}${this.buildCombatTag([`目标气血 ${visibleHpStates.join('；')}`])}，造成 ${this.formatCombatHealBreakdown(rawTotalHeal, totalHeal)}。`,
        kind: 'combat',
      };
    });

    return {
      messages,
      dirty: selfHealed ? ['attr'] : [],
      dirtyPlayers: [...dirtyPlayers],
    };
  }

  private removeBuffsByCategory(
    buffs: TemporaryBuffState[] | undefined,
    category: 'buff' | 'debuff',
    removeCount: number,
  ): TemporaryBuffState[] {
    if (!buffs || buffs.length === 0 || removeCount <= 0) {
      return [];
    }
/** removable：定义该变量以承载业务值。 */
    const removable = buffs
      .filter((entry) => entry.remainingTicks > 0 && entry.category === category)
      .sort((left, right) => {
        if (right.remainingTicks !== left.remainingTicks) {
          return right.remainingTicks - left.remainingTicks;
        }
        if (right.stacks !== left.stacks) {
          return right.stacks - left.stacks;
        }
        return left.buffId.localeCompare(right.buffId, 'zh-CN');
      })
      .slice(0, removeCount);
    if (removable.length === 0) {
      return [];
    }
/** buffIds：定义该变量以承载业务值。 */
    const buffIds = new Set(removable.map((entry) => entry.buffId));
    for (let index = buffs.length - 1; index >= 0; index -= 1) {
      if (buffIds.has(buffs[index].buffId)) {
        buffs.splice(index, 1);
      }
    }
    return removable;
  }

  private applyCleanseEffect(
    player: PlayerState,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'cleanse' }>,
    selectedTargets: ResolvedTarget[],
    primaryTarget?: ResolvedTarget,
  ): WorldUpdate {
/** removeCount：定义该变量以承载业务值。 */
    const removeCount = Math.max(1, effect.removeCount ?? 1);
/** category：定义该变量以承载业务值。 */
    const category = effect.category === 'buff' ? 'buff' : 'debuff';
/** targets：定义该变量以承载业务值。 */
    const targets = effect.target === 'self'
      ? [{ kind: 'player', x: player.x, y: player.y, player }] as Array<Extract<ResolvedTarget, { kind: 'player' | 'monster' }>>
      : this.pickDamageTargets(selectedTargets, primaryTarget)
        .filter((entry): entry is Extract<ResolvedTarget, { kind: 'player' | 'monster' }> => (
          entry.kind === 'player' || entry.kind === 'monster'
        ));
    if (targets.length === 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有可净化的有效目标' };
    }

/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** cleanedNames：定义该变量以承载业务值。 */
    const cleanedNames: string[] = [];
/** removedBuffNames：定义该变量以承载业务值。 */
    const removedBuffNames: string[] = [];
/** selfChanged：定义该变量以承载业务值。 */
    let selfChanged = false;

    for (const target of targets) {
      if (target.kind === 'monster') {
        const previousHp = target.monster.hp;
/** previousQi：定义该变量以承载业务值。 */
        const previousQi = target.monster.qi;
/** removed：定义该变量以承载业务值。 */
        const removed = this.removeBuffsByCategory(target.monster.temporaryBuffs, category, removeCount);
        if (removed.length === 0) {
          continue;
        }
        this.syncMonsterRuntimeResources(target.monster, { previousHp, previousQi });
        cleanedNames.push(target.monster.name);
        removedBuffNames.push(...removed.map((entry) => entry.name));
        continue;
      }

/** removed：定义该变量以承载业务值。 */
      const removed = this.removeBuffsByCategory(target.player.temporaryBuffs, category, removeCount);
      if (removed.length === 0) {
        continue;
      }
      this.attrService.recalcPlayer(target.player);
      cleanedNames.push(target.player.id === player.id ? '你' : target.player.name);
      removedBuffNames.push(...removed.map((entry) => entry.name));
      if (target.player.id === player.id) {
        selfChanged = true;
      } else {
        dirtyPlayers.add(target.player.id);
      }
    }

    if (cleanedNames.length === 0) {
      return { ...EMPTY_UPDATE, error: category === 'debuff' ? '目标没有可移除的减益' : '目标没有可移除的增益' };
    }

    return {
      messages: [{
        playerId: player.id,
        text: `${skill.name}生效，${[...new Set(cleanedNames)].join('、')}被净去 ${removedBuffNames.join('、')}。`,
        kind: 'combat',
      }],
      dirty: selfChanged ? ['attr'] : [],
      dirtyPlayers: [...dirtyPlayers],
    };
  }

/** getSkillTechniqueLevel：执行对应的业务逻辑。 */
  private getSkillTechniqueLevel(player: PlayerState, skillId: string): number {
    for (const technique of player.techniques) {
      if (technique.skills.some((entry) => entry.id === skillId)) {
        return Math.max(1, technique.level);
      }
    }
    return 1;
  }

/** evaluateSkillFormula：执行对应的业务逻辑。 */
  private evaluateSkillFormula(formula: SkillFormula, context: SkillFormulaContext): number {
    return evaluateSkillFormulaHelper(formula, context, {
      getPlayerMaxQi: (player) => this.attrService.getPlayerNumericStats(player).maxQi,
    });
  }

/** resetPlayerToSpawn：执行对应的业务逻辑。 */
  resetPlayerToSpawn(player: PlayerState): WorldUpdate {
    this.logger.log(`重置玩家到出生点: ${player.id} (${player.mapId}:${player.x},${player.y})`);
    return this.movePlayerToInitialSpawn(player, this.getReturnToSpawnSuccessText(player), {
      restoreVitals: true,
      clearBuffs: true,
    });
  }

/** relocatePlayerToInitialSpawn：执行对应的业务逻辑。 */
  relocatePlayerToInitialSpawn(player: PlayerState, reasonText: string): WorldUpdate {
    return this.movePlayerToInitialSpawn(player, reasonText, {
      restoreVitals: false,
      clearBuffs: false,
    });
  }

/** removePlayerFromWorld：执行对应的业务逻辑。 */
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
      player.pendingSkillCast = undefined;
      this.navigationService.clearMoveTarget(player.id);
      this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
      player.autoBattle = false;
      this.threatService.clearThreat(this.getPlayerThreatId(player));
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

/** tickMonsters：执行对应的业务逻辑。 */
  tickMonsters(mapId: string, players: PlayerState[]): WorldUpdate {
    this.ensureMapInitialized(mapId);
/** monsters：定义该变量以承载业务值。 */
    const monsters = this.monstersByMap.get(mapId) ?? [];
/** currentTick：定义该变量以承载业务值。 */
    const currentTick = this.timeService.getTotalTicks(mapId);
/** allMessages：定义该变量以承载业务值。 */
    const allMessages: WorldMessage[] = [];
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();

    for (const monster of monsters) {
      if (!monster.alive) {
        this.measureCpuSection('monster_respawn', '怪物: 重生处理', () => {
          monster.respawnLeft -= 1;
          if (monster.respawnLeft <= 0) {
/** pos：定义该变量以承载业务值。 */
            const pos = this.findSpawnPosition(mapId, monster);
            if (pos && this.mapService.isWalkable(mapId, pos.x, pos.y, { actorType: 'monster' })) {
              monster.x = pos.x;
              monster.y = pos.y;
              monster.hp = monster.maxHp;
              monster.qi = Math.max(0, Math.round(monster.numericStats.maxQi));
              monster.alive = true;
              this.applyMonsterInitialBuffs(monster);
              monster.skillCooldowns = {};
              monster.pendingCast = undefined;
              monster.damageContributors.clear();
              this.threatService.clearThreat(this.getMonsterThreatId(monster));
              this.clearMonsterTargetPursuit(monster);
              this.mapService.addOccupant(mapId, monster.x, monster.y, monster.runtimeId, 'monster');
              this.handleMonsterRespawn(monster);
            } else {
              monster.respawnLeft = 1;
            }
          }
        });
        continue;
      }

/** fireBurnBuff：定义该变量以承载业务值。 */
      const fireBurnBuff = monster.temporaryBuffs.find((buff) => (
        buff.buffId === FIRE_BURN_MARK_BUFF_ID
        && buff.remainingTicks > 0
        && buff.stacks > 0
      ));
      if (fireBurnBuff) {
        this.measureCpuSection('monster_fire_burn', '怪物: 灼脉结算', () => {
/** tierMultiplier：定义该变量以承载业务值。 */
          const tierMultiplier = this.getFireBurnMarkTierMultiplier(monster.tier);
/** burnDamage：定义该变量以承载业务值。 */
          const burnDamage = Math.max(
            1,
            Math.round(monster.hp * fireBurnBuff.stacks * FIRE_BURN_MARK_HP_RATIO_PER_STACK * tierMultiplier),
          );
/** update：定义该变量以承载业务值。 */
          const update = this.applyBuffDotDamageToMonster(
            monster,
            burnDamage,
            'fire',
            fireBurnBuff.sourceSkillName ?? fireBurnBuff.name,
            fireBurnBuff.sourceCasterId,
          );
          allMessages.push(...update.messages);
        });
        if (!monster.alive) {
          continue;
        }
      }

      if (monster.temporaryBuffs.length > 0) {
        this.measureCpuSection('monster_buffs', '怪物: Buff 推进', () => {
/** previousHp：定义该变量以承载业务值。 */
          const previousHp = monster.hp;
/** previousQi：定义该变量以承载业务值。 */
          const previousQi = monster.qi;
/** previousBuffCount：定义该变量以承载业务值。 */
          const previousBuffCount = monster.temporaryBuffs.length;
/** nextBuffs：定义该变量以承载业务值。 */
          const nextBuffs: TemporaryBuffState[] = [];
          for (const buff of monster.temporaryBuffs) {
            const sustainCost = getBuffSustainCost(buff);
            if (sustainCost !== null && buff.sustainCost) {
/** currentResource：定义该变量以承载业务值。 */
              const currentResource = buff.sustainCost.resource === 'hp' ? monster.hp : monster.qi;
              if (currentResource < sustainCost) {
                continue;
              }
              if (buff.sustainCost.resource === 'hp') {
                monster.hp = Math.max(0, monster.hp - sustainCost);
              } else {
                monster.qi = Math.max(0, monster.qi - sustainCost);
              }
              buff.sustainTicksElapsed = Math.max(0, Math.floor(buff.sustainTicksElapsed ?? 0)) + 1;
              syncDynamicBuffPresentation(buff);
            }
            if (!buff.infiniteDuration) {
              buff.remainingTicks -= 1;
            }
            if (buff.remainingTicks > 0 && buff.stacks > 0) {
              nextBuffs.push(buff);
            }
          }
/** activeBuffIds：定义该变量以承载业务值。 */
          const activeBuffIds = new Set(nextBuffs.map((buff) => buff.buffId));
          monster.temporaryBuffs = nextBuffs.filter((buff) => !buff.expireWithBuffId || activeBuffIds.has(buff.expireWithBuffId));
          if (monster.temporaryBuffs.length !== previousBuffCount) {
            this.syncMonsterRuntimeResources(monster, { previousHp, previousQi });
          }
        });
      }
      this.tickMonsterSkillCooldowns(monster);

/** timeState：定义该变量以承载业务值。 */
      const timeState = this.measureCpuSection('monster_time', '怪物: 时间效果', () => (
        this.timeService.syncMonsterTimeEffects(monster)
      ));
      this.measureCpuSection('monster_recovery', '怪物: 自然恢复', () => {
        this.applyMonsterNaturalRecovery(monster);
      });
/** pendingUpdate：定义该变量以承载业务值。 */
      const pendingUpdate = this.measureCpuSection('monster_pending_skill', '怪物: 前摇技能', () => (
        this.resolvePendingMonsterSkillCast(monster, mapId)
      ));
      if (pendingUpdate) {
        allMessages.push(...pendingUpdate.messages);
        for (const playerId of pendingUpdate.dirtyPlayers ?? []) {
          dirtyPlayers.add(playerId);
        }
        continue;
      }
/** target：定义该变量以承载业务值。 */
      const target = this.measureCpuSection('monster_target', '怪物: 目标选择', () => (
        this.resolveMonsterTarget(monster, players, timeState, currentTick)
      ));
      if (!target) {
/** lostSightTarget：定义该变量以承载业务值。 */
        const lostSightTarget = this.resolveMonsterLostSightChaseTarget(monster, currentTick);
        if (lostSightTarget) {
          this.measureCpuSection('monster_chase_memory', '怪物: 丢视野追击', () => {
            this.stepMonsterTowardLastSeenPosition(monster, lostSightTarget.x, lostSightTarget.y);
          });
          continue;
        }

        this.clearMonsterTargetPursuit(monster);
        if (!this.isMonsterWithinWanderRange(monster, monster.x, monster.y)) {
          this.measureCpuSection('monster_return', '怪物: 回巢移动', () => {
            this.stepToward(mapId, monster, monster.spawnX, monster.spawnY, monster.runtimeId);
          });
        } else if (monster.wanderRadius > 0 && Math.random() < 0.35) {
          this.measureCpuSection('monster_roam', '怪物: 闲逛移动', () => {
            this.stepMonsterIdleRoam(monster);
          });
        }
        continue;
      }

/** castedSkill：定义该变量以承载业务值。 */
      const castedSkill = this.tryCastMonsterSkill(monster, target, mapId, allMessages, dirtyPlayers);
      if (castedSkill) {
        continue;
      }

      if (isPointInRange(monster, target, 1)) {
/** defeated：定义该变量以承载业务值。 */
        const defeated = this.measureCpuSection('monster_attack', '怪物: 攻击结算', () => {
/** cultivation：定义该变量以承载业务值。 */
          const cultivation = this.techniqueService.interruptCultivation(target, 'hit');
/** resolved：定义该变量以承载业务值。 */
          const resolved = this.resolveMonsterAttack(monster, target);
/** monsterElement：定义该变量以承载业务值。 */
          const monsterElement = this.inferMonsterElement(monster);
/** effectColor：定义该变量以承载业务值。 */
          const effectColor = getDamageTrailColor(monsterElement ? 'spell' : 'physical', monsterElement);
          if (cultivation.changed) {
            dirtyPlayers.add(target.id);
          }
          if (resolved.hit && resolved.damage > 0) {
            this.threatService.addThreat({
              ownerId: this.getPlayerThreatId(target),
              targetId: this.getMonsterThreatId(monster),
              baseThreat: resolved.damage,
              targetExtraAggroRate: this.getExtraAggroRate(monster),
              distance: gridDistance(target, monster),
            });
          }
          this.pushActionLabelEffect(mapId, monster.x, monster.y, '攻击');
          if (resolved.hit) {
/** hitEquipment：定义该变量以承载业务值。 */
            const hitEquipment = this.equipmentEffectService.dispatch(target, {
              trigger: 'on_hit',
              targetKind: 'monster',
              target: { kind: 'monster', monster },
            });
            if (hitEquipment.dirty.length > 0) {
              dirtyPlayers.add(target.id);
            }
            for (const playerId of hitEquipment.dirtyPlayers ?? []) {
              dirtyPlayers.add(playerId);
            }
          }
          this.tryActivateAutoRetaliate(target, dirtyPlayers);
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
          allMessages.push(this.buildMonsterAttackMessage(
            monster,
            target,
            resolved,
            effectColor,
            monsterElement ? 'spell' : 'physical',
            monsterElement,
            cultivation.changed ? ['打断修炼'] : [],
          ));
          return target.hp <= 0;
        });
        if (defeated) {
          this.measureCpuSection('monster_death_post', '怪物: 死亡后处理', () => {
            this.registerPlayerDefeat(target);
/** deathPenalty：定义该变量以承载业务值。 */
            const deathPenalty = this.applyShaInfusionDeathPenalty(target);
            if (target.online === false) {
/** mapName：定义该变量以承载业务值。 */
              const mapName = this.mapService.getMapMeta(target.mapId)?.name ?? target.mapId;
              this.queueOfflineCombatLogbookMessage(target, `你在离线期间被${monster.name}在${mapName}击倒。`, {
                from: monster.name,
              });
            }
            allMessages.push({
              playerId: target.id,
/** text：定义该变量以承载业务值。 */
              text: target.online === false
                ? '你在离线中被击倒，已退出当前世界。'
                : '你被击倒，已被护山阵法送回复活点。',
              kind: 'combat',
            });
            if (deathPenalty.consumedProgress > 0 || deathPenalty.consumedFoundation > 0) {
              allMessages.push({
                playerId: target.id,
                text: `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`,
                kind: 'combat',
              });
            }
            if (target.online === false) {
              this.removePlayerFromWorld(target, 'death');
            } else {
              this.respawnPlayer(target);
            }
            dirtyPlayers.add(target.id);
          });
        }
      } else {
        this.measureCpuSection('monster_chase', '怪物: 追击移动', () => {
          this.stepMonsterTowardAttackPosition(monster, target, 1);
        });
      }
    }

    if (monsters.length > 0) {
      this.monsterRuntimeDirty = true;
    }
    return { messages: allMessages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

/** tickMonsterSkillCooldowns：执行对应的业务逻辑。 */
  private tickMonsterSkillCooldowns(monster: RuntimeMonster): void {
    if (!monster.skillCooldowns || Object.keys(monster.skillCooldowns).length === 0) {
      return;
    }
    for (const skillId of Object.keys(monster.skillCooldowns)) {
      const next = Math.max(0, Math.round(monster.skillCooldowns[skillId] ?? 0) - 1);
      if (next > 0) {
        monster.skillCooldowns[skillId] = next;
      } else {
        delete monster.skillCooldowns[skillId];
      }
    }
  }

  private tryCastMonsterSkill(
    monster: RuntimeMonster,
    target: PlayerState,
    mapId: string,
    allMessages: WorldMessage[],
    dirtyPlayers: Set<string>,
  ): boolean {
/** skill：定义该变量以承载业务值。 */
    const skill = this.selectMonsterSkill(monster, target);
    if (!skill) {
      return false;
    }
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = this.getMonsterSkillWindupTicks(skill);
/** update：定义该变量以承载业务值。 */
    const update = windupTicks > 0
      ? this.beginMonsterSkillCast(monster, skill, target, mapId)
      : this.castMonsterSkill(monster, skill, target, mapId);
    if (update.error) {
      return false;
    }
    allMessages.push(...update.messages);
    for (const playerId of update.dirtyPlayers ?? []) {
      dirtyPlayers.add(playerId);
    }
    return true;
  }

/** getMonsterSkillWindupTicks：执行对应的业务逻辑。 */
  private getMonsterSkillWindupTicks(skill: SkillDef): number {
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = skill.monsterCast?.windupTicks;
    return Number.isFinite(windupTicks)
      ? Math.max(0, Math.floor(Number(windupTicks)))
      : 0;
  }

/** getPlayerSkillWindupTicks：执行对应的业务逻辑。 */
  private getPlayerSkillWindupTicks(skill: SkillDef): number {
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = skill.playerCast?.windupTicks;
    return Number.isFinite(windupTicks)
      ? Math.max(0, Math.floor(Number(windupTicks)))
      : 0;
  }

/** getMonsterSkillWarningColor：执行对应的业务逻辑。 */
  private getMonsterSkillWarningColor(skill: SkillDef): string | undefined {
    return typeof skill.monsterCast?.warningColor === 'string' && skill.monsterCast.warningColor.trim().length > 0
      ? skill.monsterCast.warningColor.trim()
      : undefined;
  }

/** getPlayerSkillWarningColor：执行对应的业务逻辑。 */
  private getPlayerSkillWarningColor(skill: SkillDef): string | undefined {
    return typeof skill.playerCast?.warningColor === 'string' && skill.playerCast.warningColor.trim().length > 0
      ? skill.playerCast.warningColor.trim()
      : undefined;
  }

/** selectMonsterSkill：执行对应的业务逻辑。 */
  private selectMonsterSkill(monster: RuntimeMonster, target: PlayerState): SkillDef | undefined {
/** monsterStats：定义该变量以承载业务值。 */
    const monsterStats = this.getMonsterCombatSnapshot(monster).stats;
    if (monster.id === HUANLING_ZHENREN_MONSTER_ID) {
      return this.selectHuanlingZhenrenSkill(monster, target, monsterStats);
    }
    for (const skillId of monster.skills) {
      const skill = this.contentService.getSkill(skillId);
      if (!skill) {
        continue;
      }
/** geometry：定义该变量以承载业务值。 */
      const geometry = this.buildEffectiveSkillGeometry(skill, monsterStats);
      if (skill.requiresTarget !== false && !isPointInRange(monster, target, geometry.range)) {
        continue;
      }
      if (!this.canMonsterCastSkill(monster, skill, monsterStats)) {
        continue;
      }
      return skill;
    }
    return undefined;
  }

  private selectHuanlingZhenrenSkill(
    monster: RuntimeMonster,
    target: PlayerState,
    monsterStats: NumericStats,
  ): SkillDef | undefined {
/** distance：定义该变量以承载业务值。 */
    const distance = gridDistance(monster, target);
/** hpRatio：定义该变量以承载业务值。 */
    const hpRatio = monsterStats.maxHp > 0 ? monster.hp / monsterStats.maxHp : 1;
/** hasFaxiang：定义该变量以承载业务值。 */
    const hasFaxiang = this.entityHasActiveBuff(monster.temporaryBuffs, HUANLING_FAXIANG_BUFF_ID);
/** targetYinStacks：定义该变量以承载业务值。 */
    const targetYinStacks = this.getEntityBuffStacks(target.temporaryBuffs, HUANLING_RONGMAI_YIN_BUFF_ID);
/** targetBurnStacks：定义该变量以承载业务值。 */
    const targetBurnStacks = this.getEntityBuffStacks(target.temporaryBuffs, TERRAIN_MOLTEN_POOL_BURN_BUFF_ID);
/** targetLocked：定义该变量以承载业务值。 */
    const targetLocked = this.entityHasActiveBuff(target.temporaryBuffs, HUANLING_CANMAI_SUOBU_BUFF_ID);
/** targetPrimed：定义该变量以承载业务值。 */
    const targetPrimed = targetYinStacks + targetBurnStacks;

    if (!hasFaxiang && hpRatio <= 0.75) {
/** phaseAwaken：定义该变量以承载业务值。 */
      const phaseAwaken = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_FAXIANG_SKILL_ID,
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (phaseAwaken) {
        return phaseAwaken;
      }
    }

    if (hpRatio <= 0.25) {
/** desperation：定义该变量以承载业务值。 */
      const desperation = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
      ]);
      if (desperation) {
        return desperation;
      }
    }

    if (hpRatio <= 0.5) {
/** collapse：定义该变量以承载业务值。 */
      const collapse = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
      ]);
      if (collapse) {
        return collapse;
      }
    }

    if (!hasFaxiang) {
      return this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_DUANHUN_DING_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
    }

    if (targetLocked || targetPrimed >= 4) {
/** finisher：定义该变量以承载业务值。 */
      const finisher = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (finisher) {
        return finisher;
      }
    }

    if (distance <= 2) {
/** closeControl：定义该变量以承载业务值。 */
      const closeControl = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (closeControl) {
        return closeControl;
      }
    }

    if (distance >= 4) {
/** longRangePressure：定义该变量以承载业务值。 */
      const longRangePressure = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (longRangePressure) {
        return longRangePressure;
      }
    }

    if (!targetLocked) {
/** setup：定义该变量以承载业务值。 */
      const setup = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (setup) {
        return setup;
      }
    }

    if (targetPrimed >= 2) {
/** cashOut：定义该变量以承载业务值。 */
      const cashOut = this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (cashOut) {
        return cashOut;
      }
    }

    return this.pickFirstCastableMonsterSkill(monster, target, monsterStats, [
      HUANLING_DIFU_CHENYIN_SKILL_ID,
      HUANLING_LIEFU_WAIHUAN_SKILL_ID,
      HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
      HUANLING_XINGLUO_CANPAN_SKILL_ID,
      HUANLING_RONGHE_GUANMAI_SKILL_ID,
      HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
      HUANLING_DUANHUN_DING_SKILL_ID,
      HUANLING_CANPO_ZHANG_SKILL_ID,
    ]);
  }

  private pickFirstCastableMonsterSkill(
    monster: RuntimeMonster,
    target: PlayerState,
    monsterStats: NumericStats,
    skillIds: string[],
  ): SkillDef | undefined {
    for (const skillId of skillIds) {
      if (!monster.skills.includes(skillId)) {
        continue;
      }
/** skill：定义该变量以承载业务值。 */
      const skill = this.contentService.getSkill(skillId);
      if (!skill) {
        continue;
      }
/** geometry：定义该变量以承载业务值。 */
      const geometry = this.buildEffectiveSkillGeometry(skill, monsterStats);
      if (skill.requiresTarget !== false && !isPointInRange(monster, target, geometry.range)) {
        continue;
      }
      if (!this.canMonsterCastSkill(monster, skill, monsterStats)) {
        continue;
      }
      return skill;
    }
    return undefined;
  }

/** entityHasActiveBuff：执行对应的业务逻辑。 */
  private entityHasActiveBuff(buffs: TemporaryBuffState[] | undefined, buffId: string, minStacks = 1): boolean {
    return (buffs ?? []).some((buff) => (
      buff.buffId === buffId
      && buff.remainingTicks > 0
      && buff.stacks >= minStacks
    ));
  }

/** getEntityBuffStacks：执行对应的业务逻辑。 */
  private getEntityBuffStacks(buffs: TemporaryBuffState[] | undefined, buffId: string): number {
    return (buffs ?? []).find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
  }

  private buildMonsterSkillAffectedCells(
    monster: RuntimeMonster,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
  ): Array<{ x: number; y: number }> {
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, this.getMonsterCombatSnapshot(monster).stats);
/** shape：定义该变量以承载业务值。 */
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
      return isPointInRange(monster, anchor, geometry.range) ? [{ x: anchor.x, y: anchor.y }] : [];
    }
    return computeAffectedCellsFromAnchor(monster, anchor, {
      range: geometry.range,
      shape,
      radius: geometry.radius,
      innerRadius: geometry.innerRadius,
      width: geometry.width,
      height: geometry.height,
    });
  }

  private selectMonsterSkillTargetsFromAnchor(
    monster: RuntimeMonster,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
  ): ResolvedTarget[] {
/** cells：定义该变量以承载业务值。 */
    const cells = this.buildMonsterSkillAffectedCells(monster, skill, anchor);
    if (cells.length === 0) {
      return [];
    }
/** players：定义该变量以承载业务值。 */
    const players = this.playerService.getPlayersByMap(monster.mapId)
      .filter((entry) => !entry.dead);
/** maxTargets：定义该变量以承载业务值。 */
    const maxTargets = this.getEffectiveDamageTargetLimit(skill, monster.temporaryBuffs);
    return this.collectMonsterSkillTargetsFromCells(players, cells, maxTargets);
  }

/** canMonsterCastSkill：执行对应的业务逻辑。 */
  private canMonsterCastSkill(monster: RuntimeMonster, skill: SkillDef, numericStats?: NumericStats): boolean {
    if ((monster.skillCooldowns[skill.id] ?? 0) > 0) {
      return false;
    }
    if (!this.matchesMonsterEquipmentConditions(monster, skill.monsterCast?.conditions)) {
      return false;
    }
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = this.getMonsterSkillQiCost(monster, skill, numericStats);
    return actualCost !== null && monster.qi >= actualCost;
  }

/** getMonsterSkillQiCost：执行对应的业务逻辑。 */
  private getMonsterSkillQiCost(monster: RuntimeMonster, skill: SkillDef, numericStats?: NumericStats): number | null {
/** stats：定义该变量以承载业务值。 */
    const stats = numericStats ?? this.getMonsterCombatSnapshot(monster).stats;
/** plannedCost：定义该变量以承载业务值。 */
    const plannedCost = Math.max(0, skill.cost);
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, stats.maxQiOutputPerTick)));
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return null;
    }
    return actualCost;
  }

/** consumeMonsterQiForSkill：执行对应的业务逻辑。 */
  private consumeMonsterQiForSkill(monster: RuntimeMonster, skill: SkillDef): number | string {
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = this.getMonsterSkillQiCost(monster, skill);
    if (actualCost === null) {
      return '怪物灵力输出速率不足';
    }
    if (monster.qi < actualCost) {
      return '怪物灵力不足';
    }
/** cooldownRate：定义该变量以承载业务值。 */
    const cooldownRate = signedRatioValue(
      this.getMonsterCombatSnapshot(monster).stats.cooldownSpeed,
      DEFAULT_MONSTER_RATIO_DIVISORS.cooldownSpeed,
    );
/** cooldownMultiplier：定义该变量以承载业务值。 */
    const cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100);
    monster.qi = Math.max(0, monster.qi - actualCost);
    this.addDispersedAuraAround(monster.mapId, monster.x, monster.y, actualCost);
    monster.skillCooldowns[skill.id] = Math.max(1, Math.ceil(skill.cooldown * cooldownMultiplier));
    return actualCost;
  }

/** getMonsterSkillTechniqueLevel：执行对应的业务逻辑。 */
  private getMonsterSkillTechniqueLevel(monster: RuntimeMonster, skill: SkillDef): number {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, monster.level ?? 1);
/** tierBonus：定义该变量以承载业务值。 */
    const tierBonus = monster.tier === 'demon_king' ? 2 : monster.tier === 'variant' ? 1 : 0;
    return Math.max(skill.unlockLevel ?? 1, Math.ceil(level * 0.65) + tierBonus);
  }

/** selectMonsterSkillTargets：执行对应的业务逻辑。 */
  private selectMonsterSkillTargets(monster: RuntimeMonster, skill: SkillDef, primaryTarget?: ResolvedTarget): ResolvedTarget[] {
    if (!primaryTarget) {
      return [];
    }
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, this.getMonsterCombatSnapshot(monster).stats);
/** shape：定义该变量以承载业务值。 */
    const shape = geometry.shape ?? 'single';
    if (shape === 'single') {
      return [primaryTarget];
    }

/** players：定义该变量以承载业务值。 */
    const players = this.playerService.getPlayersByMap(monster.mapId)
      .filter((entry) => !entry.dead);
/** maxTargets：定义该变量以承载业务值。 */
    const maxTargets = this.getEffectiveDamageTargetLimit(skill, monster.temporaryBuffs);
/** cells：定义该变量以承载业务值。 */
    const cells = computeAffectedCellsFromAnchor(monster, primaryTarget, {
      range: geometry.range,
      shape,
      radius: geometry.radius,
      innerRadius: geometry.innerRadius,
      width: geometry.width,
      height: geometry.height,
    });
    return this.collectMonsterSkillTargetsFromCells(players, cells, maxTargets);
  }

  private collectMonsterSkillTargetsFromCells(
    players: PlayerState[],
/** cells：定义该变量以承载业务值。 */
    cells: Array<{ x: number; y: number }>,
    maxTargets: number,
  ): ResolvedTarget[] {
/** resolved：定义该变量以承载业务值。 */
    const resolved: ResolvedTarget[] = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();
    for (const cell of cells) {
      const targetPlayer = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
      if (!targetPlayer) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
      const key = `player:${targetPlayer.id}`;
      if (seen.has(key)) {
        continue;
      }
      resolved.push({ kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer });
      seen.add(key);
      if (resolved.length >= maxTargets) {
        break;
      }
    }
    return resolved;
  }

  private beginMonsterSkillCast(
    monster: RuntimeMonster,
    skill: SkillDef,
    target: PlayerState,
    mapId: string,
  ): WorldUpdate {
/** windupTicks：定义该变量以承载业务值。 */
    const windupTicks = this.getMonsterSkillWindupTicks(skill);
    if (windupTicks <= 0) {
      return this.castMonsterSkill(monster, skill, target, mapId);
    }
/** anchor：定义该变量以承载业务值。 */
    const anchor = { x: target.x, y: target.y };
/** warningCells：定义该变量以承载业务值。 */
    const warningCells = this.buildMonsterSkillAffectedCells(monster, skill, anchor);
    if (warningCells.length === 0) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }
/** qiCost：定义该变量以承载业务值。 */
    const qiCost = this.consumeMonsterQiForSkill(monster, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }
    this.faceToward(monster, anchor.x, anchor.y);
/** geometry：定义该变量以承载业务值。 */
    const geometry = this.buildEffectiveSkillGeometry(skill, this.getMonsterCombatSnapshot(monster).stats);
/** warningOrigin：定义该变量以承载业务值。 */
    const warningOrigin = (geometry.shape ?? 'single') === 'line'
      ? { x: monster.x, y: monster.y }
      : anchor;
    monster.pendingCast = {
      skillId: skill.id,
      targetX: anchor.x,
      targetY: anchor.y,
      remainingTicks: windupTicks,
      qiCost,
      warningColor: this.getMonsterSkillWarningColor(skill),
    };
/** tickDurationMs：定义该变量以承载业务值。 */
    const tickDurationMs = this.getMapTickDurationMs(mapId);
    this.pushActionLabelEffect(mapId, monster.x, monster.y, skill.name, {
      actionStyle: 'chant',
      durationMs: windupTicks * tickDurationMs + 240,
    });
    this.pushEffect(mapId, {
      type: 'warning_zone',
      cells: warningCells.map((cell) => ({ x: cell.x, y: cell.y })),
      color: monster.pendingCast.warningColor ?? '#ff3030',
      baseColor: '#ff8a8a',
      originX: warningOrigin.x,
      originY: warningOrigin.y,
      durationMs: windupTicks * tickDurationMs,
    });
    return { messages: [], dirty: [], dirtyPlayers: [] };
  }

/** resolvePendingMonsterSkillCast：执行对应的业务逻辑。 */
  private resolvePendingMonsterSkillCast(monster: RuntimeMonster, mapId: string): WorldUpdate | null {
/** pendingCast：定义该变量以承载业务值。 */
    const pendingCast = monster.pendingCast;
    if (!pendingCast) {
      return null;
    }
    pendingCast.remainingTicks -= 1;
    if (pendingCast.remainingTicks > 0) {
      return { messages: [], dirty: [], dirtyPlayers: [] };
    }
    monster.pendingCast = undefined;
/** skill：定义该变量以承载业务值。 */
    const skill = this.contentService.getSkill(pendingCast.skillId);
    if (!skill) {
      return { messages: [], dirty: [], dirtyPlayers: [] };
    }
    return this.castMonsterSkillAtAnchor(
      monster,
      skill,
      { x: pendingCast.targetX, y: pendingCast.targetY },
      mapId,
      { qiCost: pendingCast.qiCost, allowMiss: true, showActionLabel: true },
    );
  }

  private castMonsterSkill(
    monster: RuntimeMonster,
    skill: SkillDef,
    target: PlayerState,
    mapId: string,
  ): WorldUpdate {
    return this.castMonsterSkillAtAnchor(monster, skill, { x: target.x, y: target.y }, mapId);
  }

  private castMonsterSkillAtAnchor(
    monster: RuntimeMonster,
    skill: SkillDef,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
    mapId: string,
    options?: {
      qiCost?: number;
      allowMiss?: boolean;
      showActionLabel?: boolean;
    },
  ): WorldUpdate {
/** selectedTargets：定义该变量以承载业务值。 */
    const selectedTargets = this.selectMonsterSkillTargetsFromAnchor(monster, skill, anchor);
    if (skill.requiresTarget !== false && selectedTargets.length === 0 && options?.allowMiss !== true) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }
/** qiCost：定义该变量以承载业务值。 */
    const qiCost = options?.qiCost ?? this.consumeMonsterQiForSkill(monster, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }

    this.faceToward(monster, anchor.x, anchor.y);
    if (options?.showActionLabel !== false) {
      this.pushActionLabelEffect(mapId, monster.x, monster.y, skill.name);
    }
/** monsterCombat：定义该变量以承载业务值。 */
    const monsterCombat = this.getMonsterCombatSnapshot(monster);
/** casterStats：定义该变量以承载业务值。 */
    const casterStats = monsterCombat.stats;
/** casterAttrs：定义该变量以承载业务值。 */
    const casterAttrs = monsterCombat.attrs;
/** techLevel：定义该变量以承载业务值。 */
    const techLevel = this.getMonsterSkillTechniqueLevel(monster, skill);
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [];
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** appliedEffect：定义该变量以承载业务值。 */
    let appliedEffect = false;

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const damageTargets = selectedTargets
          .filter((entry): entry is Extract<ResolvedTarget, { kind: 'player' }> => entry.kind === 'player');
        if (damageTargets.length === 0) {
          continue;
        }
        for (const damageTarget of damageTargets) {
          const context: SkillFormulaContext = {
            monsterCaster: monster,
            skill,
            techLevel,
            targetCount: damageTargets.length,
            casterStats,
            casterAttrs,
            target: damageTarget,
            targetStats: this.getPlayerCombatSnapshot(damageTarget.player).stats,
            targetAttrs: this.attrService.getPlayerFinalAttrs(damageTarget.player),
          };
/** baseDamage：定义该变量以承载业务值。 */
          const baseDamage = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
/** update：定义该变量以承载业务值。 */
          const update = this.attackPlayerFromMonsterSkill(
            monster,
            damageTarget.player,
            skill,
            baseDamage,
            effect.damageKind ?? 'spell',
            effect.element,
            qiCost,
          );
          messages.push(...update.messages);
          for (const playerId of update.dirtyPlayers ?? []) {
            dirtyPlayers.add(playerId);
          }
          if (!update.error) {
            appliedEffect = true;
          }
        }
        continue;
      }

/** update：定义该变量以承载业务值。 */
      const update = effect.type === 'buff'
        ? this.applyMonsterBuffEffect(monster, skill, effect, selectedTargets, selectedTargets[0])
        : effect.type === 'heal'
          ? this.applyMonsterHealEffect(monster, skill, effect, techLevel, casterStats, casterAttrs, selectedTargets)
          : effect.type === 'cleanse'
            ? this.applyMonsterCleanseEffect(monster, skill, effect, selectedTargets)
            : this.applyMonsterTerrainEffect(monster, skill, effect, anchor, mapId, selectedTargets[0]);
      messages.push(...update.messages);
      for (const playerId of update.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
      if (!update.error) {
        appliedEffect = true;
      }
    }

    if (!appliedEffect && options?.allowMiss !== true) {
      return { ...EMPTY_UPDATE, error: '怪物技能未命中有效目标' };
    }
    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

  private applyMonsterBuffEffect(
    monster: RuntimeMonster,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'buff' }>,
    selectedTargets: ResolvedTarget[],
    primaryTarget?: ResolvedTarget,
  ): WorldUpdate {
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [];
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** sourceRealmLv：定义该变量以承载业务值。 */
    const sourceRealmLv = Math.max(1, Math.floor(monster.level ?? 1));

    if (effect.target === 'self') {
      monster.temporaryBuffs ??= [];
/** previousHp：定义该变量以承载业务值。 */
      const previousHp = monster.hp;
/** previousQi：定义该变量以承载业务值。 */
      const previousQi = monster.qi;
/** current：定义该变量以承载业务值。 */
      const current = this.applyBuffState(monster.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv));
      this.syncMonsterRuntimeResources(monster, { previousHp, previousQi });
      if (primaryTarget?.kind === 'player') {
/** stackText：定义该变量以承载业务值。 */
        const stackText = current.maxStacks > 1 ? `（${current.stacks}层）` : '';
        messages.push({
          playerId: primaryTarget.player.id,
          text: `${monster.name}施展${skill.name}，周身浮现 ${effect.name}${stackText}。`,
          kind: 'combat',
        });
      }
      return { messages, dirty: [], dirtyPlayers: [] };
    }

/** targets：定义该变量以承载业务值。 */
    const targets = this.pickDamageTargets(selectedTargets, primaryTarget)
      .filter((entry): entry is Extract<ResolvedTarget, { kind: 'player' }> => entry.kind === 'player');
    if (targets.length === 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有可施加状态的有效目标' };
    }

    for (const target of targets) {
      target.player.temporaryBuffs ??= [];
      const current = this.applyBuffState(target.player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect, sourceRealmLv));
      this.attrService.recalcPlayer(target.player);
      dirtyPlayers.add(target.player.id);
/** stackText：定义该变量以承载业务值。 */
      const stackText = current.maxStacks > 1 ? `（${current.stacks}层）` : '';
      messages.push({
        playerId: target.player.id,
        text: `${monster.name}施展${skill.name}，你受到了 ${effect.name}${stackText}，持续 ${Math.max(1, effect.duration)} 息。`,
        kind: 'combat',
      });
    }

    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

  private applyPlayerTerrainEffect(
    player: PlayerState,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'terrain' }>,
    anchor?: { x: number; y: number },
  ): WorldUpdate {
    if (!anchor) {
      return { ...EMPTY_UPDATE, error: '当前技能缺少地形作用点' };
    }
/** cells：定义该变量以承载业务值。 */
    const cells = this.buildPlayerSkillAffectedCells(player, skill, anchor);
/** changed：定义该变量以承载业务值。 */
    const changed = cells.filter((cell) => this.mapService.transformTile(
      player.mapId,
      cell.x,
      cell.y,
      effect.terrainType,
      effect.duration,
      effect.allowedOriginalTypes,
    ));
    if (changed.length === 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有改变任何地形' };
    }
    return {
      messages: [{
        playerId: player.id,
        text: `${skill.name}改写了 ${changed.length} 处地形。`,
        kind: 'combat',
      }],
      dirty: [],
    };
  }

  private applyMonsterTerrainEffect(
    monster: RuntimeMonster,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'terrain' }>,
/** anchor：定义该变量以承载业务值。 */
    anchor: { x: number; y: number },
    mapId: string,
    primaryTarget?: ResolvedTarget,
  ): WorldUpdate {
/** cells：定义该变量以承载业务值。 */
    const cells = this.buildMonsterSkillAffectedCells(monster, skill, anchor);
/** changedCount：定义该变量以承载业务值。 */
    let changedCount = 0;
    for (const cell of cells) {
      if (this.mapService.transformTile(
        mapId,
        cell.x,
        cell.y,
        effect.terrainType,
        effect.duration,
        effect.allowedOriginalTypes,
      )) {
        changedCount += 1;
      }
    }
    if (changedCount <= 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有改变任何地形' };
    }

/** recipientIds：定义该变量以承载业务值。 */
    const recipientIds = new Set<string>();
/** playersByMap：定义该变量以承载业务值。 */
    const playersByMap = this.playerService.getPlayersByMap(mapId).filter((entry) => !entry.dead);
/** affectedCellKeys：定义该变量以承载业务值。 */
    const affectedCellKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    for (const player of playersByMap) {
      if (affectedCellKeys.has(`${player.x},${player.y}`)) {
        recipientIds.add(player.id);
      }
    }
    if (primaryTarget?.kind === 'player') {
      recipientIds.add(primaryTarget.player.id);
    }

    return {
      messages: [...recipientIds].map((playerId) => ({
        playerId,
        text: `${monster.name}施展${skill.name}，洞府地势骤变。`,
        kind: 'combat' as const,
      })),
      dirty: [],
      dirtyPlayers: [],
    };
  }

  private attackPlayerFromMonsterSkill(
    monster: RuntimeMonster,
    target: PlayerState,
    skill: SkillDef,
    baseDamage: number,
    damageKind: SkillDamageKind,
    element: ElementKey | undefined,
    qiCost = 0,
  ): WorldUpdate {
/** cultivation：定义该变量以承载业务值。 */
    const cultivation = this.techniqueService.interruptCultivation(target, 'hit');
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = target.hp;
/** resolved：定义该变量以承载业务值。 */
    const resolved = this.resolveHit(
      this.getMonsterCombatSnapshot(monster),
      this.getPlayerCombatSnapshot(target),
      baseDamage,
      damageKind,
      qiCost,
      element,
      (damage) => {
        target.hp = Math.max(0, target.hp - damage);
        return Math.max(0, previousHp - target.hp);
      },
    );
/** floatColor：定义该变量以承载业务值。 */
    const floatColor = getDamageTrailColor(damageKind, element);
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [];
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
    if (cultivation.changed) {
      dirtyPlayers.add(target.id);
    }
    if (resolved.hit && resolved.effectiveDamage > 0) {
      this.threatService.addThreat({
        ownerId: this.getPlayerThreatId(target),
        targetId: this.getMonsterThreatId(monster),
        baseThreat: resolved.effectiveDamage,
        targetExtraAggroRate: this.getExtraAggroRate(monster),
        distance: gridDistance(target, monster),
      });
    }
    if (resolved.hit) {
/** hitEquipment：定义该变量以承载业务值。 */
      const hitEquipment = this.equipmentEffectService.dispatch(target, {
        trigger: 'on_hit',
        targetKind: 'monster',
        target: { kind: 'monster', monster },
      });
      if (hitEquipment.dirty.length > 0) {
        dirtyPlayers.add(target.id);
      }
      for (const playerId of hitEquipment.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }
    this.tryActivateAutoRetaliate(target, dirtyPlayers);

    this.pushEffect(monster.mapId, {
      type: 'attack',
      fromX: monster.x,
      fromY: monster.y,
      toX: target.x,
      toY: target.y,
      color: floatColor,
    });
    this.pushEffect(monster.mapId, {
      type: 'float',
      x: target.x,
      y: target.y,
      text: resolved.hit ? `-${resolved.damage}` : '闪',
      color: floatColor,
    });
    messages.push(this.buildMonsterSkillAttackMessage(
      monster,
      target,
      skill,
      resolved,
      floatColor,
      damageKind,
      element,
      cultivation.changed ? ['打断修炼'] : [],
    ));

    if (target.hp <= 0) {
      this.registerPlayerDefeat(target);
/** deathPenalty：定义该变量以承载业务值。 */
      const deathPenalty = this.applyShaInfusionDeathPenalty(target);
      if (target.online === false) {
/** mapName：定义该变量以承载业务值。 */
        const mapName = this.mapService.getMapMeta(target.mapId)?.name ?? target.mapId;
        this.queueOfflineCombatLogbookMessage(target, `你在离线期间被${monster.name}以${skill.name}在${mapName}击倒。`, {
          from: monster.name,
        });
      }
      messages.push({
        playerId: target.id,
/** text：定义该变量以承载业务值。 */
        text: target.online === false
          ? '你在离线中被击倒，已退出当前世界。'
          : '你被击倒，已被护山阵法送回复活点。',
        kind: 'combat',
      });
      if (deathPenalty.consumedProgress > 0 || deathPenalty.consumedFoundation > 0) {
        messages.push({
          playerId: target.id,
          text: `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`,
          kind: 'combat',
        });
      }
      if (target.online === false) {
        this.removePlayerFromWorld(target, 'death');
      } else {
        this.respawnPlayer(target);
      }
      dirtyPlayers.add(target.id);
    }

    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

/** handleNpcInteraction：执行对应的业务逻辑。 */
  private handleNpcInteraction(player: PlayerState, npc: NpcConfig): WorldUpdate {
    this.syncQuestState(player);
/** interaction：定义该变量以承载业务值。 */
    const interaction = this.questDomain.getNpcInteractionState(player, npc);

    if (!interaction.quest) {
      return {
        messages: [{ playerId: player.id, text: `${npc.name}：${npc.dialogue}`, kind: 'quest' }],
        dirty: [],
      };
    }

    if (!interaction.questState) {
/** acceptRequirementText：定义该变量以承载业务值。 */
      const acceptRequirementText = this.questDomain.getQuestAcceptRequirementText(player, interaction.quest);
      if (acceptRequirementText) {
        return {
          messages: [{
            playerId: player.id,
            text: `${npc.name}：${interaction.quest.title} 还不是你现在能接的活，先把境界练到 ${acceptRequirementText} 再来。`,
            kind: 'quest',
          }],
          dirty: [],
        };
      }
/** questState：定义该变量以承载业务值。 */
      const questState = this.createQuestState(player, interaction.quest);
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

    if (
      interaction.questState.status === 'active'
      && interaction.questState.objectiveType === 'talk'
      && interaction.relation === 'target'
    ) {
      interaction.questState.progress = interaction.questState.required;
/** dirty：定义该变量以承载业务值。 */
      const dirty: WorldDirtyFlag[] = this.questDomain.refreshQuestStatuses(player) ? ['quest', 'actions'] : ['quest'];
/** relayText：定义该变量以承载业务值。 */
      const relayText = interaction.questState.relayMessage?.trim() || interaction.quest.relayMessage?.trim();
      return {
        messages: [{
          playerId: player.id,
          text: relayText
            ? `你向 ${npc.name} 传达了口信：“${relayText}”`
            : `你向 ${npc.name} 传达了来意。`,
          kind: 'quest',
        }],
        dirty,
      };
    }

    if (interaction.questState.status === 'ready') {
/** rewards：定义该变量以承载业务值。 */
      const rewards = this.questDomain.buildRewardItems(interaction.quest);
      if (!this.questDomain.canReceiveItems(player, rewards)) {
        return { ...EMPTY_UPDATE, error: '背包空间不足，无法领取奖励' };
      }

/** dirty：定义该变量以承载业务值。 */
      const dirty: WorldDirtyFlag[] = ['quest', 'actions'];
      if (interaction.quest.requiredItemId && (interaction.quest.requiredItemCount ?? 1) > 0) {
/** err：定义该变量以承载业务值。 */
        const err = this.questDomain.consumeInventoryItem(player, interaction.quest.requiredItemId, interaction.quest.requiredItemCount ?? 1);
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
/** unlockedBreakthroughRequirements：定义该变量以承载业务值。 */
      const unlockedBreakthroughRequirements = this.techniqueService.revealBreakthroughRequirements(
        player,
        interaction.quest.unlockBreakthroughRequirementIds ?? [],
      );
      if (unlockedBreakthroughRequirements) {
        dirty.push('attr');
      }
      interaction.questState.status = 'completed';
/** nextQuestState：定义该变量以承载业务值。 */
      const nextQuestState = this.tryAcceptNextQuest(player, interaction.questState.nextQuestId);
/** nextQuestNotice：定义该变量以承载业务值。 */
      const nextQuestNotice = nextQuestState ? this.describeQuestAutoAccepted(nextQuestState) : undefined;
      return {
        messages: [
          {
            playerId: player.id,
            text: `${npc.name}：做得不错，这是你的奖励 ${interaction.quest.rewardText}。`,
            kind: 'quest',
          },
          ...(nextQuestNotice
            ? [{
                playerId: player.id,
                text: nextQuestNotice,
                kind: 'quest' as const,
              }]
            : []),
        ],
        dirty,
      };
    }

    if (interaction.questState.status === 'active') {
      return {
        messages: [{
          playerId: player.id,
/** text：定义该变量以承载业务值。 */
          text: interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
            ? `${npc.name}：若你有话要带来，直说便是。`
            : `${npc.name}：${this.questDomain.describeQuestProgress(player, interaction.questState, interaction.quest)}`,
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

/** createQuestState：执行对应的业务逻辑。 */
  private createQuestState(player: PlayerState, quest: QuestConfig): QuestState {
/** questState：定义该变量以承载业务值。 */
    const questState: QuestState = {
      id: quest.id,
      title: quest.title,
      desc: quest.desc,
      line: quest.line,
      chapter: quest.chapter,
      story: quest.story,
      status: 'active',
      objectiveType: quest.objectiveType,
      objectiveText: quest.objectiveText,
      progress: 0,
      required: quest.required,
      targetName: resolveQuestTargetName({
        objectiveType: quest.objectiveType,
        title: quest.title,
        targetName: quest.targetName,
        targetNpcId: quest.targetNpcId,
        targetMonsterId: quest.targetMonsterId,
        targetTechniqueId: quest.targetTechniqueId,
        targetRealmStage: quest.targetRealmStage,
        requiredItemId: quest.requiredItemId,
        resolveNpcName: (npcId) => this.mapService.getNpcLocation(npcId)?.name,
        resolveMonsterName: (monsterId) => this.mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => this.contentService.getTechnique(techniqueId)?.name,
        resolveItemName: (itemId) => this.contentService.getItem(itemId)?.name,
      }),
      targetTechniqueId: quest.targetTechniqueId,
      targetRealmStage: quest.targetRealmStage,
      rewardText: quest.rewardText,
      targetMonsterId: quest.targetMonsterId ?? '',
      rewardItemId: quest.rewardItemId,
      rewardItemIds: [...quest.rewardItemIds],
      rewards: quest.rewards
        .map((reward) => this.questDomain.createItemFromDrop(reward))
        .filter((item): item is ItemStack => Boolean(item)),
      nextQuestId: quest.nextQuestId,
      requiredItemId: quest.requiredItemId,
      requiredItemCount: quest.requiredItemCount,
      giverId: quest.giverId,
      giverName: quest.giverName,
      giverMapId: quest.giverMapId,
      giverMapName: quest.giverMapName,
      giverX: quest.giverX,
      giverY: quest.giverY,
      targetMapId: quest.targetMapId,
      targetMapName: quest.targetMapName,
      targetX: quest.targetX,
      targetY: quest.targetY,
      targetNpcId: quest.targetNpcId,
      targetNpcName: quest.targetNpcName,
      submitNpcId: quest.submitNpcId,
      submitNpcName: quest.submitNpcName,
      submitMapId: quest.submitMapId,
      submitMapName: quest.submitMapName,
      submitX: quest.submitX,
      submitY: quest.submitY,
      relayMessage: quest.relayMessage,
    };
    questState.progress = this.questDomain.resolveQuestProgress(player, questState, quest);
    if (this.questDomain.canQuestBecomeReady(player, questState, quest)) {
      questState.status = 'ready';
    }
    return questState;
  }

  private ensureLinearMainQuest(player: PlayerState): { changed: boolean; autoAcceptedQuest?: QuestState } {
/** mainQuestChain：定义该变量以承载业务值。 */
    const mainQuestChain = this.mapService.getMainQuestChain();
    if (mainQuestChain.length <= 0) {
      return { changed: false };
    }

/** changed：定义该变量以承载业务值。 */
    let changed = false;
/** expectedMainQuestId：定义该变量以承载业务值。 */
    const expectedMainQuestId = this.getCurrentMainQuestId(player);
/** seenMainQuestIds：定义该变量以承载业务值。 */
    const seenMainQuestIds = new Set<string>();
/** filteredQuests：定义该变量以承载业务值。 */
    const filteredQuests: QuestState[] = [];

    for (const quest of player.quests) {
      const mainQuestIndex = this.mapService.getMainQuestIndex(quest.id);
      if (mainQuestIndex === undefined) {
        filteredQuests.push(quest);
        continue;
      }

      if (seenMainQuestIds.has(quest.id)) {
        changed = true;
        continue;
      }
      seenMainQuestIds.add(quest.id);

      if (quest.status === 'completed' || (expectedMainQuestId && quest.id === expectedMainQuestId)) {
        filteredQuests.push(quest);
        continue;
      }

      changed = true;
    }

/** autoAcceptedQuest：定义该变量以承载业务值。 */
    let autoAcceptedQuest: QuestState | undefined;
    if (expectedMainQuestId && !filteredQuests.some((quest) => quest.id === expectedMainQuestId)) {
/** expectedQuest：定义该变量以承载业务值。 */
      const expectedQuest = this.mapService.getQuest(expectedMainQuestId);
      if (expectedQuest) {
        autoAcceptedQuest = this.createQuestState(player, expectedQuest);
        filteredQuests.push(autoAcceptedQuest);
        changed = true;
      }
    }

    if (changed) {
      player.quests = filteredQuests;
    }

    return { changed, autoAcceptedQuest };
  }

/** getCurrentMainQuestId：执行对应的业务逻辑。 */
  private getCurrentMainQuestId(player: PlayerState): string | undefined {
    for (const quest of this.mapService.getMainQuestChain()) {
      const questState = player.quests.find((entry) => entry.id === quest.id);
      if (!questState || questState.status !== 'completed') {
        return quest.id;
      }
    }
    return undefined;
  }

/** tryAcceptNextQuest：执行对应的业务逻辑。 */
  private tryAcceptNextQuest(player: PlayerState, nextQuestId?: string): QuestState | null {
/** candidateQuestId：定义该变量以承载业务值。 */
    let candidateQuestId = nextQuestId;
/** visitedQuestIds：定义该变量以承载业务值。 */
    const visitedQuestIds = new Set<string>();

    while (candidateQuestId && !visitedQuestIds.has(candidateQuestId)) {
      visitedQuestIds.add(candidateQuestId);
/** existingQuestState：定义该变量以承载业务值。 */
      const existingQuestState = player.quests.find((entry) => entry.id === candidateQuestId);
      if (!existingQuestState) {
/** nextQuest：定义该变量以承载业务值。 */
        const nextQuest = this.mapService.getQuest(candidateQuestId);
        if (!nextQuest) {
          return null;
        }
/** nextQuestState：定义该变量以承载业务值。 */
        const nextQuestState = this.createQuestState(player, nextQuest);
        player.quests.push(nextQuestState);
        this.syncQuestState(player);
        return nextQuestState;
      }
      if (existingQuestState.status !== 'completed') {
        return null;
      }
      candidateQuestId = this.mapService.getQuest(candidateQuestId)?.nextQuestId;
    }

    return null;
  }

/** describeQuestAutoAccepted：执行对应的业务逻辑。 */
  private describeQuestAutoAccepted(quest: QuestState): string {
/** mapName：定义该变量以承载业务值。 */
    const mapName = quest.giverMapName ?? quest.targetMapName ?? quest.submitMapName;
    if (quest.objectiveType === 'talk' && quest.targetNpcName) {
/** location：定义该变量以承载业务值。 */
      const location = mapName ? `，前往 ${mapName} 寻找 ${quest.targetNpcName}` : `，前往寻找 ${quest.targetNpcName}`;
      return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取${location}。`;
    }
    if (quest.giverName) {
/** location：定义该变量以承载业务值。 */
      const location = mapName ? `，可前往 ${mapName} 继续推进` : '';
      return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取${location}。`;
    }
    return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取。`;
  }

/** handlePortalTravel：执行对应的业务逻辑。 */
  private handlePortalTravel(player: PlayerState): WorldUpdate {
/** portal：定义该变量以承载业务值。 */
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (!portal) {
      return { ...EMPTY_UPDATE, error: '你需要站在传送阵上才能传送' };
    }
    return this.travelThroughPortal(player, portal);
  }

/** travelThroughManualPortalAtCurrentPosition：执行对应的业务逻辑。 */
  travelThroughManualPortalAtCurrentPosition(player: PlayerState, expectedTargetMapId?: string): WorldUpdate | null {
/** portal：定义该变量以承载业务值。 */
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (!portal) {
      return null;
    }
    if (expectedTargetMapId && portal.targetMapId !== expectedTargetMapId) {
      return null;
    }
    return this.travelThroughPortal(player, portal);
  }

/** tryAutoTravel：执行对应的业务逻辑。 */
  tryAutoTravel(player: PlayerState): WorldUpdate | null {
/** portal：定义该变量以承载业务值。 */
    const portal = this.mapService.getPortalAt(player.mapId, player.x, player.y, { trigger: 'auto' });
    if (!portal) {
      return null;
    }
    return this.travelThroughPortal(player, portal);
  }

/** travelThroughPortal：执行对应的业务逻辑。 */
  private travelThroughPortal(player: PlayerState, portal: Portal): WorldUpdate {
/** targetMapMeta：定义该变量以承载业务值。 */
    const targetMapMeta = this.mapService.getMapMeta(portal.targetMapId);
    if (!targetMapMeta) {
      return {
        ...EMPTY_UPDATE,
/** error：定义该变量以承载业务值。 */
        error: portal.kind === 'stairs' ? '楼梯通往的目标地图不存在' : '传送失败：目标地图不存在',
      };
    }
    if (!this.mapService.isTerrainWalkable(portal.targetMapId, portal.targetX, portal.targetY)) {
      return {
        ...EMPTY_UPDATE,
/** error：定义该变量以承载业务值。 */
        error: portal.kind === 'stairs' ? '楼梯落点不可到达' : '传送失败：目标传送阵不可到达',
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
/** equipmentResult：定义该变量以承载业务值。 */
    const equipmentResult = this.equipmentEffectService.dispatch(player, { trigger: 'on_enter_map' });

/** text：定义该变量以承载业务值。 */
    const text = portal.kind === 'stairs'
      ? `你踏上楼梯，来到 ${targetMapMeta.name}。`
      : `你启动界门，抵达 ${targetMapMeta.name} 的传送阵。`;
    return {
      messages: [{ playerId: player.id, text, kind: 'quest' }],
      dirty: [...new Set<WorldDirtyFlag>(['actions', 'loot', ...(equipmentResult.dirty as WorldDirtyFlag[])])],
    };
  }

  private attackMonster(
    player: PlayerState,
    monster: RuntimeMonster,
    baseDamage: number,
    prefix: string,
/** damageKind：定义该变量以承载业务值。 */
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    qiCost = 0,
    activeAttackBehavior = false,
    basicAttackCombatExpScaling = false,
  ): WorldUpdate {
/** cultivation：定义该变量以承载业务值。 */
    const cultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(player, 'attack')
      : { changed: false, dirty: [], messages: [] };
/** resolved：定义该变量以承载业务值。 */
    const resolved = this.resolvePlayerAttack(
      player,
      monster,
      baseDamage,
      damageKind,
      element,
      qiCost,
      basicAttackCombatExpScaling,
    );
/** effectColor：定义该变量以承载业务值。 */
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
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [
      this.buildPlayerAttackMessage(
        player,
        monster,
        prefix,
        resolved,
        effectColor,
        damageKind,
        element,
        cultivation.changed ? ['打断修炼'] : [],
      ),
    ];
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
/** attackEquipment：定义该变量以承载业务值。 */
    const attackEquipment = this.equipmentEffectService.dispatch(player, {
      trigger: 'on_attack',
      targetKind: 'monster',
      target: { kind: 'monster', monster },
    });
    for (const flag of attackEquipment.dirty) {
      dirty.add(flag as WorldDirtyFlag);
    }
    this.recordMonsterDamage(monster, player.id, resolved.effectiveDamage);

    if (monster.hp <= 0) {
      this.handleMonsterDefeatByPlayer(monster, player, messages, dirty);
    }

    return { messages, dirty: [...dirty] };
  }

  private handleMonsterDefeatByPlayer(
    monster: RuntimeMonster,
    killer: PlayerState,
    messages: WorldMessage[],
    killerDirty?: Set<WorldDirtyFlag>,
    killText?: string,
  ): void {
/** localDirty：定义该变量以承载业务值。 */
    const localDirty = killerDirty ?? new Set<WorldDirtyFlag>();
    this.playerService.incrementMonsterKill(killer, monster.tier);
/** expParticipants：定义该变量以承载业务值。 */
    const expParticipants = this.resolveMonsterExpParticipants(monster, killer);
/** highestSettlementRealmLv：定义该变量以承载业务值。 */
    const highestSettlementRealmLv = this.resolveMonsterHighestSettlementRealmLv(expParticipants, killer);
/** respawnTicks：定义该变量以承载业务值。 */
    const respawnTicks = this.resolveMonsterRespawnTicks(monster);
    monster.alive = false;
    monster.respawnLeft = respawnTicks;
    monster.temporaryBuffs = [];
    monster.pendingCast = undefined;
    monster.damageContributors.clear();
    this.clearMonsterTargetPursuit(monster);
    this.mapService.removeOccupant(monster.mapId, monster.x, monster.y, monster.runtimeId);
    this.handleMonsterDefeat(monster);
    messages.push({
      playerId: killer.id,
      text: killText ?? `${monster.name} 被你斩杀。`,
      kind: 'combat',
    });

    for (const flag of this.questDomain.advanceQuestProgress(killer, monster.id, monster.name)) {
      localDirty.add(flag);
    }

    this.distributeMonsterKillExp(monster, killer, expParticipants, highestSettlementRealmLv, localDirty, messages);

/** monsterLootRecipients：定义该变量以承载业务值。 */
    const monsterLootRecipients = this.resolveMonsterLootRecipients(expParticipants, killer);
    for (const loot of this.questDomain.rollMonsterDrops(killer, monster)) {
      const recipient = this.pickMonsterLootRecipient(monsterLootRecipients, killer);
      this.questDomain.deliverMonsterLoot(recipient, monster, loot, killer.id, localDirty, messages);
    }

    if (this.questDomain.refreshQuestStatuses(killer)) {
      localDirty.add('quest');
      localDirty.add('actions');
    }

/** killEquipment：定义该变量以承载业务值。 */
    const killEquipment = this.equipmentEffectService.dispatch(killer, {
      trigger: 'on_kill',
      targetKind: 'monster',
      target: { kind: 'monster', monster },
    });
    for (const flag of killEquipment.dirty) {
      localDirty.add(flag as WorldDirtyFlag);
    }

    if (!killerDirty) {
      this.markDirtyFlagsForPlayer(killer.id, localDirty);
    }
  }

  private applyMonsterHealEffect(
    monster: RuntimeMonster,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'heal' }>,
    techLevel: number,
    casterStats: NumericStats,
    casterAttrs: Attributes,
    selectedTargets: ResolvedTarget[],
  ): WorldUpdate {
/** targets：定义该变量以承载业务值。 */
    const targets = effect.target === 'self'
      ? [{ kind: 'monster', x: monster.x, y: monster.y, monster }] as Array<Extract<ResolvedTarget, { kind: 'monster' | 'player' }>>
      : selectedTargets.filter((entry): entry is Extract<ResolvedTarget, { kind: 'player' }> => entry.kind === 'player');
    if (targets.length === 0) {
      return { messages: [], dirty: [], dirtyPlayers: [] };
    }

/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [];
/** healedEntries：定义该变量以承载业务值。 */
    const healedEntries: Array<{
/** kind：定义该变量以承载业务值。 */
      kind: 'monster' | 'player';
      playerId?: string;
/** name：定义该变量以承载业务值。 */
      name: string;
/** hp：定义该变量以承载业务值。 */
      hp: number;
/** maxHp：定义该变量以承载业务值。 */
      maxHp: number;
    }> = [];
/** rawTotalHeal：定义该变量以承载业务值。 */
    let rawTotalHeal = 0;
/** totalHeal：定义该变量以承载业务值。 */
    let totalHeal = 0;

    for (const target of targets) {
      const context: SkillFormulaContext = {
        monsterCaster: monster,
        skill,
        techLevel,
        targetCount: targets.length,
        casterStats,
        casterAttrs,
        target,
/** targetStats：定义该变量以承载业务值。 */
        targetStats: target.kind === 'monster'
          ? this.getMonsterCombatSnapshot(target.monster).stats
          : this.getPlayerCombatSnapshot(target.player).stats,
/** targetAttrs：定义该变量以承载业务值。 */
        targetAttrs: target.kind === 'monster'
          ? this.getMonsterCombatSnapshot(target.monster).attrs
          : this.attrService.getPlayerFinalAttrs(target.player),
      };
/** amount：定义该变量以承载业务值。 */
      const amount = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
      if (target.kind === 'monster') {
/** previousHp：定义该变量以承载业务值。 */
        const previousHp = target.monster.hp;
        target.monster.hp = Math.min(target.monster.maxHp, target.monster.hp + amount);
/** actualHeal：定义该变量以承载业务值。 */
        const actualHeal = target.monster.hp - previousHp;
        if (actualHeal <= 0) {
          continue;
        }
        rawTotalHeal += amount;
        totalHeal += actualHeal;
        healedEntries.push({
          kind: 'monster',
          name: target.monster.name,
          hp: target.monster.hp,
          maxHp: target.monster.maxHp,
        });
        continue;
      }
/** previousHp：定义该变量以承载业务值。 */
      const previousHp = target.player.hp;
      target.player.hp = Math.min(target.player.maxHp, target.player.hp + amount);
/** actualHeal：定义该变量以承载业务值。 */
      const actualHeal = target.player.hp - previousHp;
      if (actualHeal <= 0) {
        continue;
      }
      rawTotalHeal += amount;
      totalHeal += actualHeal;
      healedEntries.push({
        kind: 'player',
        playerId: target.player.id,
        name: target.player.name,
        hp: target.player.hp,
        maxHp: target.player.maxHp,
      });
      dirtyPlayers.add(target.player.id);
    }

    if (totalHeal <= 0) {
      return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
    }
/** messageViewerIds：定义该变量以承载业务值。 */
    const messageViewerIds = new Set<string>();
    for (const entry of healedEntries) {
      if (entry.kind === 'player' && typeof entry.playerId === 'string') {
        messageViewerIds.add(entry.playerId);
      }
    }
    for (const viewerId of messageViewerIds) {
      const visibleTargetNames = [...new Set(healedEntries.map((entry) => (
        entry.kind === 'player' && entry.playerId === viewerId ? '你' : entry.name
      )))];
/** visibleHpStates：定义该变量以承载业务值。 */
      const visibleHpStates = [...new Set(healedEntries.map((entry) => (
        `${entry.kind === 'player' && entry.playerId === viewerId ? '你' : entry.name} ${this.formatCombatHp(entry.hp, entry.maxHp)}`
      )))];
      messages.push({
        playerId: viewerId,
        text: `${this.formatCombatActionClause(monster.name, visibleTargetNames.join('、'), skill.name)}${this.buildCombatTag([`目标气血 ${visibleHpStates.join('；')}`])}，造成 ${this.formatCombatHealBreakdown(rawTotalHeal, totalHeal)}。`,
        kind: 'combat',
      });
    }
    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
  }

  private applyMonsterCleanseEffect(
    monster: RuntimeMonster,
    skill: SkillDef,
    effect: Extract<SkillEffectDef, { type: 'cleanse' }>,
    selectedTargets: ResolvedTarget[],
  ): WorldUpdate {
/** category：定义该变量以承载业务值。 */
    const category = effect.category === 'buff' ? 'buff' : 'debuff';
/** removeCount：定义该变量以承载业务值。 */
    const removeCount = Math.max(1, effect.removeCount ?? 1);
    if (effect.target === 'self') {
/** previousHp：定义该变量以承载业务值。 */
      const previousHp = monster.hp;
/** previousQi：定义该变量以承载业务值。 */
      const previousQi = monster.qi;
/** removed：定义该变量以承载业务值。 */
      const removed = this.removeBuffsByCategory(monster.temporaryBuffs, category, removeCount);
      if (removed.length === 0) {
        return { messages: [], dirty: [], dirtyPlayers: [] };
      }
      this.syncMonsterRuntimeResources(monster, { previousHp, previousQi });
/** targetPlayer：定义该变量以承载业务值。 */
      const targetPlayer = selectedTargets.find((entry): entry is Extract<ResolvedTarget, { kind: 'player' }> => entry.kind === 'player');
      return {
        messages: targetPlayer ? [{
          playerId: targetPlayer.player.id,
          text: `${monster.name}施展${skill.name}，净去 ${removed.map((entry) => entry.name).join('、')}。`,
          kind: 'combat',
        }] : [],
        dirty: [],
        dirtyPlayers: [],
      };
    }
    return { messages: [], dirty: [], dirtyPlayers: [] };
  }

/** markDirtyFlagsForPlayer：执行对应的业务逻辑。 */
  private markDirtyFlagsForPlayer(playerId: string, flags: Iterable<WorldDirtyFlag>): void {
    for (const flag of flags) {
      this.playerService.markDirty(playerId, flag);
    }
  }

/** resolveMonsterDotKiller：执行对应的业务逻辑。 */
  private resolveMonsterDotKiller(monster: RuntimeMonster, sourceCasterId?: string): PlayerState | null {
    if (typeof sourceCasterId === 'string' && sourceCasterId.length > 0) {
/** directSource：定义该变量以承载业务值。 */
      const directSource = this.playerService.getPlayer(sourceCasterId);
      if (directSource) {
        return directSource;
      }
    }
/** bestPlayer：定义该变量以承载业务值。 */
    let bestPlayer: PlayerState | null = null;
/** bestDamage：定义该变量以承载业务值。 */
    let bestDamage = 0;
    for (const [playerId, damage] of monster.damageContributors) {
      if (damage <= bestDamage) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        continue;
      }
      bestPlayer = player;
      bestDamage = damage;
    }
    return bestPlayer;
  }

/** resolvePlayerDotKiller：执行对应的业务逻辑。 */
  private resolvePlayerDotKiller(player: PlayerState, sourceCasterId?: string): PlayerState | null {
    if (typeof sourceCasterId !== 'string' || sourceCasterId.length === 0) {
      return null;
    }
/** directSource：定义该变量以承载业务值。 */
    const directSource = this.playerService.getPlayer(sourceCasterId);
    if (!directSource || directSource.id === player.id) {
      return null;
    }
    return directSource;
  }

  private queueOfflineCombatLogbookMessage(
    player: PlayerState,
    text: string,
    options?: { from?: string; kind?: PendingLogbookMessage['kind'] },
  ): void {
    if (player.online !== false || player.isBot) {
      return;
    }
    this.playerService.queuePendingLogbookMessage(player.id, {
      id: randomUUID(),
      kind: options?.kind ?? 'combat',
      from: options?.from,
      at: Date.now(),
      text,
    });
  }

/** recordMonsterDamage：执行对应的业务逻辑。 */
  private recordMonsterDamage(monster: RuntimeMonster, playerId: string, damage: number): void {
    if (damage <= 0) {
      return;
    }
    monster.damageContributors.set(playerId, (monster.damageContributors.get(playerId) ?? 0) + damage);
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      return;
    }
    this.threatService.addThreat({
      ownerId: this.getMonsterThreatId(monster),
      targetId: this.getPlayerThreatId(player),
      baseThreat: damage,
      targetExtraAggroRate: this.getExtraAggroRate(player),
      distance: gridDistance(monster, player),
    });
  }

/** resolveMonsterExpParticipants：执行对应的业务逻辑。 */
  private resolveMonsterExpParticipants(monster: RuntimeMonster, killer: PlayerState): MonsterExpParticipant[] {
/** participants：定义该变量以承载业务值。 */
    const participants: MonsterExpParticipant[] = [];
    for (const [playerId, contribution] of monster.damageContributors.entries()) {
      if (contribution <= 0) {
        continue;
      }
/** player：定义该变量以承载业务值。 */
      const player = this.playerService.getPlayer(playerId);
      if (player) {
        participants.push({
          player,
          contribution,
        });
      }
    }
    if (participants.length > 0) {
      return participants;
    }
    return [{
      player: killer,
      contribution: 1,
    }];
  }

/** resolveMonsterHighestSettlementRealmLv：执行对应的业务逻辑。 */
  private resolveMonsterHighestSettlementRealmLv(participants: MonsterExpParticipant[], killer: PlayerState): number {
/** highestRealmLv：定义该变量以承载业务值。 */
    let highestRealmLv = this.getNormalizedPlayerRealmLv(killer);
    for (const participant of participants) {
      highestRealmLv = Math.max(highestRealmLv, this.getNormalizedPlayerRealmLv(participant.player));
    }
    return highestRealmLv;
  }

/** getNormalizedPlayerRealmLv：执行对应的业务逻辑。 */
  private getNormalizedPlayerRealmLv(player: PlayerState): number {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
  }

  private resolveMonsterLootRecipients(
    participants: MonsterExpParticipant[],
    killer: PlayerState,
  ): MonsterLootRecipient[] {
/** totalContribution：定义该变量以承载业务值。 */
    const totalContribution = participants.reduce((sum, participant) => sum + participant.contribution, 0);
    if (totalContribution <= 0) {
      return [{ player: killer, weight: 1 }];
    }

/** recipients：定义该变量以承载业务值。 */
    const recipients: MonsterLootRecipient[] = [];
    for (const participant of participants) {
      const contributionWeight = 0.7 * (participant.contribution / totalContribution);
      const weight = participant.player.id === killer.id
        ? 0.3 + contributionWeight
        : contributionWeight;
      if (weight > 0) {
        recipients.push({
          player: participant.player,
          weight,
        });
      }
    }

    if (recipients.length > 0) {
      return recipients;
    }

    return [{ player: killer, weight: 1 }];
  }

/** pickMonsterLootRecipient：执行对应的业务逻辑。 */
  private pickMonsterLootRecipient(recipients: MonsterLootRecipient[], killer: PlayerState): PlayerState {
    if (recipients.length === 0) {
      return killer;
    }

/** totalWeight：定义该变量以承载业务值。 */
    let totalWeight = 0;
    for (const recipient of recipients) {
      totalWeight += recipient.weight;
    }
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      return killer;
    }

/** roll：定义该变量以承载业务值。 */
    let roll = Math.random() * totalWeight;
    for (const recipient of recipients) {
      roll -= recipient.weight;
      if (roll <= 0) {
        return recipient.player;
      }
    }

    return recipients[recipients.length - 1]!.player;
  }

  private distributeMonsterKillExp(
    monster: RuntimeMonster,
    killer: PlayerState,
    participants: MonsterExpParticipant[],
    highestSettlementRealmLv: number,
    killerDirty: Set<WorldDirtyFlag>,
    messages: WorldMessage[],
  ): void {
/** totalContribution：定义该变量以承载业务值。 */
    const totalContribution = participants.reduce((sum, participant) => sum + participant.contribution, 0);
/** killerRealmLv：定义该变量以承载业务值。 */
    const killerRealmLv = this.getNormalizedPlayerRealmLv(killer);
    for (const participantEntry of participants) {
      const participant = participantEntry.player;
      const contributionRatio = totalContribution > 0 ? participantEntry.contribution / totalContribution : 1;
/** expAdjustmentRealmLv：定义该变量以承载业务值。 */
      const expAdjustmentRealmLv = Math.max(
        highestSettlementRealmLv,
        killerRealmLv,
        this.getNormalizedPlayerRealmLv(participant),
      );
/** combatExp：定义该变量以承载业务值。 */
      const combatExp = this.techniqueService.grantCombatExpFromMonsterKill(participant, {
        monsterLevel: monster.level,
        monsterName: monster.name,
        monsterTier: monster.tier,
        expMultiplier: monster.expMultiplier,
        contributionRatio,
        expAdjustmentRealmLv,
/** isKiller：定义该变量以承载业务值。 */
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
/** damageKind：定义该变量以承载业务值。 */
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    qiCost = 0,
    activeAttackBehavior = false,
    basicAttackCombatExpScaling = false,
  ): WorldUpdate {
/** attackerCultivation：定义该变量以承载业务值。 */
    const attackerCultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(attacker, 'attack')
      : { changed: false, dirty: [], messages: [] };
/** targetCultivation：定义该变量以承载业务值。 */
    const targetCultivation = this.techniqueService.interruptCultivation(target, 'hit');
/** resolved：定义该变量以承载业务值。 */
    const resolved = this.resolvePlayerVsPlayerAttack(
      attacker,
      target,
      baseDamage,
      damageKind,
      element,
      qiCost,
      basicAttackCombatExpScaling,
    );
/** effectColor：定义该变量以承载业务值。 */
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

/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>((attackerCultivation.dirty as WorldDirtyFlag[]));
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();
/** attackEquipment：定义该变量以承载业务值。 */
    const attackEquipment = this.equipmentEffectService.dispatch(attacker, {
      trigger: 'on_attack',
      targetKind: 'player',
      target: { kind: 'player', player: target },
    });
    for (const flag of attackEquipment.dirty) {
      dirty.add(flag as WorldDirtyFlag);
    }
    for (const playerId of attackEquipment.dirtyPlayers ?? []) {
      dirtyPlayers.add(playerId);
    }
    if (resolved.hit) {
/** hitEquipment：定义该变量以承载业务值。 */
      const hitEquipment = this.equipmentEffectService.dispatch(target, {
        trigger: 'on_hit',
        targetKind: 'player',
        target: { kind: 'player', player: attacker },
      });
      if (hitEquipment.dirty.length > 0) {
        dirtyPlayers.add(target.id);
      }
      for (const playerId of hitEquipment.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
    }
    if (targetCultivation.changed) {
      dirtyPlayers.add(target.id);
    }
/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [
      this.buildPlayerVsPlayerAttackMessage(
        attacker,
        target,
        prefix,
        resolved,
        effectColor,
        damageKind,
        element,
        attackerCultivation.changed ? ['打断修炼'] : [],
      ),
      this.buildPlayerUnderAttackMessage(
        attacker,
        target,
        prefix,
        resolved,
        effectColor,
        damageKind,
        element,
        targetCultivation.changed ? ['打断修炼'] : [],
      ),
    ];

    if (resolved.hit && resolved.damage > 0) {
      this.threatService.addThreat({
        ownerId: this.getPlayerThreatId(target),
        targetId: this.getPlayerThreatId(attacker),
        baseThreat: resolved.damage,
        targetExtraAggroRate: this.getExtraAggroRate(attacker),
        distance: gridDistance(target, attacker),
      });
    }

    this.tryActivatePlayerAutoRetaliate(target, attacker, dirtyPlayers);

    if (target.hp <= 0) {
/** deathSite：定义该变量以承载业务值。 */
      const deathSite = { mapId: target.mapId, x: target.x, y: target.y };
      this.registerPlayerDefeat(target, attacker);
/** deathPenalty：定义该变量以承载业务值。 */
      const deathPenalty = this.applyShaInfusionDeathPenalty(target);
      if (deathPenalty.consumedProgress > 0 || deathPenalty.consumedFoundation > 0) {
        messages.push({
          playerId: target.id,
          text: `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`,
          kind: 'combat',
        });
      }
/** pvpRewards：定义该变量以承载业务值。 */
      const pvpRewards = this.applyPvPKillRewards(attacker, target, deathSite, messages);
      for (const flag of pvpRewards.killerDirty) {
        dirty.add(flag);
      }
      if (pvpRewards.victimAttrChanged) {
        dirtyPlayers.add(target.id);
      }
      if (!attacker.isBot && !target.isBot) {
/** mapName：定义该变量以承载业务值。 */
        const mapName = this.mapService.getMapMeta(target.mapId)?.name ?? target.mapId;
        this.playerService.queuePendingLogbookMessage(target.id, {
          id: randomUUID(),
          kind: 'grudge',
          from: attacker.name,
          at: Date.now(),
/** text：定义该变量以承载业务值。 */
          text: target.online === false
            ? `你在离线期间被${attacker.name}在${mapName}击倒。`
            : `你被${attacker.name}在${mapName}击倒。`,
        });
      }
      messages.push({
        playerId: attacker.id,
        text: `${target.name} 被你击倒。`,
        kind: 'combat',
      });
      messages.push({
        playerId: target.id,
/** text：定义该变量以承载业务值。 */
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
/** killEquipment：定义该变量以承载业务值。 */
      const killEquipment = this.equipmentEffectService.dispatch(attacker, {
        trigger: 'on_kill',
        targetKind: 'player',
        target: { kind: 'player', player: target },
      });
      for (const flag of killEquipment.dirty) {
        dirty.add(flag as WorldDirtyFlag);
      }
      for (const playerId of killEquipment.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
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
    basicAttackCombatExpScaling = false,
  ): ResolvedHit {
/** attacker：定义该变量以承载业务值。 */
    const attacker = this.getPlayerCombatSnapshot(player);
/** defender：定义该变量以承载业务值。 */
    const defender = this.getMonsterCombatSnapshot(monster);
/** rawDamage：定义该变量以承载业务值。 */
    const rawDamage = baseDamage;
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = monster.hp;
/** damageMultiplier：定义该变量以承载业务值。 */
    const damageMultiplier = basicAttackCombatExpScaling
      ? getBasicAttackCombatExperienceDamageMultiplier(attacker.combatExp, defender.combatExp)
      : 1;
    return this.resolveHit(
      attacker,
      defender,
      rawDamage,
      damageKind,
      qiCost,
      element,
      (damage) => {
        monster.hp = Math.max(0, monster.hp - damage);
        return Math.max(0, previousHp - monster.hp);
      },
      damageMultiplier,
    );
  }

  private resolvePlayerVsPlayerAttack(
    attacker: PlayerState,
    defender: PlayerState,
    baseDamage: number,
    damageKind: SkillDamageKind,
    element: ElementKey | undefined,
    qiCost = 0,
    basicAttackCombatExpScaling = false,
  ): ResolvedHit {
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = defender.hp;
/** attackerSnapshot：定义该变量以承载业务值。 */
    const attackerSnapshot = this.getPlayerCombatSnapshot(attacker);
/** defenderSnapshot：定义该变量以承载业务值。 */
    const defenderSnapshot = this.getPlayerCombatSnapshot(defender);
/** damageMultiplier：定义该变量以承载业务值。 */
    const damageMultiplier = basicAttackCombatExpScaling
      ? getBasicAttackCombatExperienceDamageMultiplier(attackerSnapshot.combatExp, defenderSnapshot.combatExp)
      : 1;
    return this.resolveHit(
      attackerSnapshot,
      defenderSnapshot,
      baseDamage,
      damageKind,
      qiCost,
      element,
      (damage) => {
        defender.hp = Math.max(0, defender.hp - damage);
        return Math.max(0, previousHp - defender.hp);
      },
      damageMultiplier,
    );
  }

/** resolveMonsterAttack：执行对应的业务逻辑。 */
  private resolveMonsterAttack(monster: RuntimeMonster, player: PlayerState): ResolvedHit {
/** attacker：定义该变量以承载业务值。 */
    const attacker = this.getMonsterCombatSnapshot(monster);
/** defender：定义该变量以承载业务值。 */
    const defender = this.getPlayerCombatSnapshot(player);
/** element：定义该变量以承载业务值。 */
    const element = this.inferMonsterElement(monster);
/** damageKind：定义该变量以承载业务值。 */
    const damageKind: SkillDamageKind = element ? 'spell' : 'physical';
/** attackStat：定义该变量以承载业务值。 */
    const attackStat = damageKind === 'physical' ? attacker.stats.physAtk : attacker.stats.spellAtk;
/** rawDamage：定义该变量以承载业务值。 */
    const rawDamage = monster.combatModel === 'value_stats'
      ? Math.max(1, Math.round(attackStat))
      : monster.attack + attackStat;
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = player.hp;
    return this.resolveHit(attacker, defender, rawDamage, damageKind, 0, element, (damage) => {
      player.hp = Math.max(0, player.hp - damage);
      return Math.max(0, previousHp - player.hp);
    });
  }

  private resolveHit(
    attacker: CombatSnapshot,
    defender: CombatSnapshot,
    baseDamage: number,
    damageKind: SkillDamageKind,
    qiCost: number,
    element: ElementKey | undefined,
    applyDamage: (damage: number) => number,
    damageMultiplier = 1,
  ): ResolvedHit {
/** breakWins：定义该变量以承载业务值。 */
    const breakWins = attacker.stats.breakPower > defender.stats.resolvePower;
/** resolveWins：定义该变量以承载业务值。 */
    const resolveWins = defender.stats.resolvePower > attacker.stats.breakPower;
/** breakChance：定义该变量以承载业务值。 */
    const breakChance = breakWins
      ? this.getOpposedCombatRate(attacker.stats.breakPower, defender.stats.resolvePower)
      : 0;
/** broken：定义该变量以承载业务值。 */
    const broken = breakChance > 0 && Math.random() < breakChance;

/** combatAdvantage：定义该变量以承载业务值。 */
    const combatAdvantage = this.getCombatExperienceAdvantage(attacker.combatExp, defender.combatExp);
/** hitStat：定义该变量以承载业务值。 */
    const hitStat = attacker.stats.hit * (broken ? 2 : 1) * (1 + combatAdvantage.attackerBonus);
/** defenderDodge：定义该变量以承载业务值。 */
    const defenderDodge = defender.stats.dodge * (1 + combatAdvantage.defenderBonus);
/** dodgeChance：定义该变量以承载业务值。 */
    const dodgeChance = this.getOpposedCombatRate(defenderDodge, hitStat);
/** dodged：定义该变量以承载业务值。 */
    const dodged = dodgeChance > 0 && Math.random() < dodgeChance;
    if (dodged) {
      return {
        hit: false,
        rawDamage: 0,
        damage: 0,
        effectiveDamage: 0,
        crit: false,
        dodged: true,
        resolved: false,
        broken,
        qiCost,
      };
    }

/** resolveChance：定义该变量以承载业务值。 */
    const resolveChance = resolveWins
      ? this.getOpposedCombatRate(defender.stats.resolvePower, attacker.stats.breakPower)
      : 0;
/** resolved：定义该变量以承载业务值。 */
    const resolved = resolveChance > 0 && Math.random() < resolveChance;
/** critStat：定义该变量以承载业务值。 */
    const critStat = attacker.stats.crit * (broken ? 2 : 1);
/** critChance：定义该变量以承载业务值。 */
    const critChance = this.getOpposedCombatRate(critStat, defender.stats.antiCrit);
/** crit：定义该变量以承载业务值。 */
    const crit = critChance > 0 && Math.random() < critChance;

/** damage：定义该变量以承载业务值。 */
    let damage = Math.max(1, Math.round(baseDamage));
    if (element) {
      damage = Math.max(1, Math.round(damage * percentModifierToMultiplier(attacker.stats.elementDamageBonus[element])));
    }

/** defense：定义该变量以承载业务值。 */
    let defense = damageKind === 'physical' ? defender.stats.physDef : defender.stats.spellDef;
    if (resolved) {
      defense *= 2;
    }
/** rawDamage：定义该变量以承载业务值。 */
    let rawDamage = damage;
/** defenseAttackBasis：定义该变量以承载业务值。 */
    const defenseAttackBasis = damageKind === 'physical' ? attacker.stats.physAtk : attacker.stats.spellAtk;
/** reduction：定义该变量以承载业务值。 */
    let reduction = this.getDefenseReductionRate(defense, defenseAttackBasis);
    if (element) {
/** elementReduce：定义该变量以承载业务值。 */
      const elementReduce = Math.max(0, ratioValue(defender.stats.elementDamageReduce[element], defender.ratios.elementDamageReduce[element]));
      reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * (1 - reduction)));

    if (crit) {
/** critMultiplier：定义该变量以承载业务值。 */
      const critMultiplier = (200 + Math.max(0, attacker.stats.critDamage) / 10) / 100;
      rawDamage = Math.max(1, Math.round(rawDamage * critMultiplier));
      damage = Math.max(1, Math.round(damage * critMultiplier));
    }
/** realmGapMultiplier：定义该变量以承载业务值。 */
    const realmGapMultiplier = getRealmGapDamageMultiplier(attacker.realmLv, defender.realmLv);
    rawDamage = Math.max(1, Math.round(rawDamage * realmGapMultiplier));
    damage = Math.max(1, Math.round(damage * realmGapMultiplier));
    rawDamage = Math.max(1, Math.round(rawDamage * damageMultiplier));
    damage = Math.max(1, Math.round(damage * damageMultiplier));

/** effectiveDamage：定义该变量以承载业务值。 */
    const effectiveDamage = Math.max(0, applyDamage(damage));
    return {
      hit: true,
      rawDamage,
      damage,
      effectiveDamage,
      crit,
      dodged: false,
      resolved,
      broken,
      qiCost,
    };
  }

/** getOpposedCombatRate：执行对应的业务逻辑。 */
  private getOpposedCombatRate(value: number, opposingValue: number): number {
/** normalizedValue：定义该变量以承载业务值。 */
    const normalizedValue = Math.max(0, value);
    if (normalizedValue <= 0) {
      return 0;
    }
    return Math.max(0, ratioValue(normalizedValue, Math.max(1, Math.max(0, opposingValue) + DEFAULT_RATIO_DIVISOR)));
  }

/** getDefenseReductionRate：执行对应的业务逻辑。 */
  private getDefenseReductionRate(defense: number, attackBasis: number): number {
/** normalizedDefense：定义该变量以承载业务值。 */
    const normalizedDefense = Math.max(0, defense);
    if (normalizedDefense <= 0) {
      return 0;
    }
/** normalizedAttackBasis：定义该变量以承载业务值。 */
    const normalizedAttackBasis = Math.max(0, attackBasis);
/** reductionBasis：定义该变量以承载业务值。 */
    const reductionBasis = Math.max(1, normalizedAttackBasis * DEFENSE_REDUCTION_ATTACK_RATIO + DEFENSE_REDUCTION_BASELINE);
    return Math.max(0, ratioValue(normalizedDefense, reductionBasis));
  }

  private resolveElementalDotDamage(
    defender: CombatSnapshot,
    baseDamage: number,
    element: ElementKey,
    applyDamage: (damage: number) => number,
  ): number {
/** damage：定义该变量以承载业务值。 */
    let damage = Math.max(1, Math.round(baseDamage));
/** elementReduce：定义该变量以承载业务值。 */
    const elementReduce = Math.max(
      0,
      ratioValue(defender.stats.elementDamageReduce[element], defender.ratios.elementDamageReduce[element]),
    );
    damage = Math.max(1, Math.round(damage * (1 - Math.min(0.95, elementReduce))));
    return Math.max(0, applyDamage(damage));
  }

/** getFireBurnMarkTierMultiplier：执行对应的业务逻辑。 */
  private getFireBurnMarkTierMultiplier(tier?: RuntimeMonster['tier']): number {
    if (tier === 'demon_king') {
      return FIRE_BURN_MARK_BOSS_MULTIPLIER;
    }
    if (tier === 'variant') {
      return FIRE_BURN_MARK_VARIANT_MULTIPLIER;
    }
    return 1;
  }

  applyBuffDotDamageToMonster(
    monster: RuntimeMonster,
    baseDamage: number,
    element: ElementKey,
    sourceName: string,
    sourceCasterId?: string,
  ): WorldUpdate {
    if (baseDamage <= 0 || !monster.alive || monster.hp <= 0) {
      return EMPTY_UPDATE;
    }

/** previousHp：定义该变量以承载业务值。 */
    const previousHp = monster.hp;
/** actualDamage：定义该变量以承载业务值。 */
    const actualDamage = this.resolveElementalDotDamage(
      this.getMonsterCombatSnapshot(monster),
      baseDamage,
      element,
      (damage) => {
        monster.hp = Math.max(0, monster.hp - damage);
        return Math.max(0, previousHp - monster.hp);
      },
    );
/** effectColor：定义该变量以承载业务值。 */
    const effectColor = getDamageTrailColor('spell', element);
    if (actualDamage > 0) {
      this.pushEffect(monster.mapId, {
        type: 'float',
        x: monster.x,
        y: monster.y,
        text: `-${actualDamage}`,
        color: effectColor,
      });
    }

/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [];
/** killer：定义该变量以承载业务值。 */
    const killer = this.resolveMonsterDotKiller(monster, sourceCasterId);
    if (killer && actualDamage > 0) {
      this.recordMonsterDamage(monster, killer.id, actualDamage);
    }
    if (monster.hp <= 0) {
      if (killer) {
        this.handleMonsterDefeatByPlayer(
          monster,
          killer,
          messages,
          undefined,
          `${monster.name} 被${sourceName}烧杀。`,
        );
      } else {
/** respawnTicks：定义该变量以承载业务值。 */
        const respawnTicks = this.resolveMonsterRespawnTicks(monster);
        monster.alive = false;
        monster.respawnLeft = respawnTicks;
        monster.temporaryBuffs = [];
        monster.pendingCast = undefined;
        monster.damageContributors.clear();
        this.clearMonsterTargetPursuit(monster);
        this.mapService.removeOccupant(monster.mapId, monster.x, monster.y, monster.runtimeId);
        this.handleMonsterDefeat(monster);
      }
    }

    return { messages, dirty: [] };
  }

  applyTerrainDotDamageToPlayer(
    player: PlayerState,
    baseDamage: number,
    element: ElementKey,
    sourceName: string,
    sourceCasterId?: string,
  ): WorldUpdate {
    if (baseDamage <= 0 || player.inWorld === false || player.hp <= 0) {
      return EMPTY_UPDATE;
    }

/** cultivation：定义该变量以承载业务值。 */
    const cultivation = this.techniqueService.interruptCultivation(player, 'hit');
/** previousHp：定义该变量以承载业务值。 */
    const previousHp = player.hp;
/** actualDamage：定义该变量以承载业务值。 */
    const actualDamage = this.resolveElementalDotDamage(
      this.getPlayerCombatSnapshot(player),
      baseDamage,
      element,
      (damage) => {
        player.hp = Math.max(0, player.hp - damage);
        return Math.max(0, previousHp - player.hp);
      },
    );
/** effectColor：定义该变量以承载业务值。 */
    const effectColor = getDamageTrailColor('spell', element);
    if (actualDamage > 0) {
      this.pushEffect(player.mapId, {
        type: 'float',
        x: player.x,
        y: player.y,
        text: `-${actualDamage}`,
        color: effectColor,
      });
    }

/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = cultivation.messages.map((message) => ({
      playerId: player.id,
      text: message.text,
      kind: message.kind,
    }));
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>(['attr', ...(cultivation.dirty as WorldDirtyFlag[])]);
/** playerDefeated：定义该变量以承载业务值。 */
    let playerDefeated = false;
/** dirtyPlayers：定义该变量以承载业务值。 */
    const dirtyPlayers = new Set<string>();

    if (player.hp <= 0) {
/** killer：定义该变量以承载业务值。 */
      const killer = this.resolvePlayerDotKiller(player, sourceCasterId);
/** deathSite：定义该变量以承载业务值。 */
      const deathSite = { mapId: player.mapId, x: player.x, y: player.y };
      this.registerPlayerDefeat(player, killer ?? undefined);
/** deathPenalty：定义该变量以承载业务值。 */
      const deathPenalty = this.applyShaInfusionDeathPenalty(player);
      if (deathPenalty.consumedProgress > 0 || deathPenalty.consumedFoundation > 0) {
        messages.push({
          playerId: player.id,
          text: `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`,
          kind: 'combat',
        });
      }
      if (killer) {
/** pvpRewards：定义该变量以承载业务值。 */
        const pvpRewards = this.applyPvPKillRewards(killer, player, deathSite, messages);
        for (const flag of pvpRewards.killerDirty) {
          this.playerService.markDirty(killer.id, flag);
        }
        if (pvpRewards.victimAttrChanged) {
          dirtyPlayers.add(player.id);
        }
/** mapName：定义该变量以承载业务值。 */
        const mapName = this.mapService.getMapMeta(player.mapId)?.name ?? player.mapId;
        if (!killer.isBot && !player.isBot) {
          this.playerService.queuePendingLogbookMessage(player.id, {
            id: randomUUID(),
            kind: 'grudge',
            from: killer.name,
            at: Date.now(),
/** text：定义该变量以承载业务值。 */
            text: player.online === false
              ? `你在离线期间被${killer.name}以${sourceName}在${mapName}击倒。`
              : `你被${killer.name}以${sourceName}在${mapName}击倒。`,
          });
        }
        messages.push({
          playerId: killer.id,
          text: `${player.name} 被你击倒。`,
          kind: 'combat',
        });
        messages.push({
          playerId: player.id,
/** text：定义该变量以承载业务值。 */
          text: player.online === false
            ? `你在离线期间被${killer.name}以${sourceName}在${mapName}击倒。`
            : `你被${killer.name}以${sourceName}在${mapName}击倒。`,
          kind: 'combat',
        });
      }
      if (!killer && player.online === false) {
/** mapName：定义该变量以承载业务值。 */
        const mapName = this.mapService.getMapMeta(player.mapId)?.name ?? player.mapId;
        this.queueOfflineCombatLogbookMessage(player, `你在离线期间被${sourceName}在${mapName}击倒。`);
      }
      messages.push({
        playerId: player.id,
/** text：定义该变量以承载业务值。 */
        text: player.online === false
          ? `你在离线中被${sourceName}灼杀，已退出当前世界。`
          : `你被${sourceName}灼倒，已被护山阵法送回复活点。`,
        kind: 'combat',
      });
      if (player.online === false) {
        this.removePlayerFromWorld(player, 'death');
      } else {
        this.respawnPlayer(player);
      }
      dirty.add('actions');
      dirty.add('quest');
      playerDefeated = true;
    }

    return {
      messages,
      dirty: [...dirty],
      dirtyPlayers: [...dirtyPlayers],
      playerDefeated,
    };
  }

  private buildPlayerAttackMessage(
    player: PlayerState,
    monster: RuntimeMonster,
    prefix: string,
    resolved: ResolvedHit,
    floatColor: string,
    damageKind: SkillDamageKind,
    element?: ElementKey,
/** extraDetails：定义该变量以承载业务值。 */
    extraDetails: string[] = [],
  ): WorldMessage {
/** tag：定义该变量以承载业务值。 */
    const tag = this.buildCombatDetailTag(resolved, `目标气血 ${this.formatCombatHp(monster.hp, monster.maxHp)}`, extraDetails);
/** actionLabel：定义该变量以承载业务值。 */
    const actionLabel = this.resolveCombatActionLabel(prefix) ?? '攻击';
/** text：定义该变量以承载业务值。 */
    const text = resolved.hit
      ? `${this.formatCombatActionClause('你', monster.name, actionLabel)}${tag}，造成 ${this.formatCombatDamageBreakdown(resolved.rawDamage, resolved.effectiveDamage, damageKind, element)} 伤害。`
      : `${this.formatCombatActionClause('你', monster.name, actionLabel)}${tag}，结果 闪避。`;
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
    damageKind: SkillDamageKind,
    element?: ElementKey,
/** extraDetails：定义该变量以承载业务值。 */
    extraDetails: string[] = [],
  ): WorldMessage {
/** tag：定义该变量以承载业务值。 */
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(player.hp, player.maxHp)}`, extraDetails);
/** actionLabel：定义该变量以承载业务值。 */
    const actionLabel = '攻击';
/** text：定义该变量以承载业务值。 */
    const text = resolved.hit
      ? `${this.formatCombatActionClause(monster.name, '你', actionLabel)}${tag}，造成 ${this.formatCombatDamageBreakdown(resolved.rawDamage, resolved.effectiveDamage, damageKind, element)} 伤害。`
      : `${this.formatCombatActionClause(monster.name, '你', actionLabel)}${tag}，结果 闪避。`;
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

  private buildMonsterSkillAttackMessage(
    monster: RuntimeMonster,
    player: PlayerState,
    skill: SkillDef,
    resolved: ResolvedHit,
    floatColor: string,
    damageKind: SkillDamageKind,
    element?: ElementKey,
/** extraDetails：定义该变量以承载业务值。 */
    extraDetails: string[] = [],
  ): WorldMessage {
/** tag：定义该变量以承载业务值。 */
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(player.hp, player.maxHp)}`, extraDetails);
/** text：定义该变量以承载业务值。 */
    const text = resolved.hit
      ? `${this.formatCombatActionClause(monster.name, '你', skill.name)}${tag}，造成 ${this.formatCombatDamageBreakdown(resolved.rawDamage, resolved.effectiveDamage, damageKind, element)} 伤害。`
      : `${this.formatCombatActionClause(monster.name, '你', skill.name)}${tag}，结果 闪避。`;
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
    damageKind: SkillDamageKind,
    element?: ElementKey,
/** extraDetails：定义该变量以承载业务值。 */
    extraDetails: string[] = [],
  ): WorldMessage {
/** tag：定义该变量以承载业务值。 */
    const tag = this.buildCombatDetailTag(resolved, `对方气血 ${this.formatCombatHp(target.hp, target.maxHp)}`, extraDetails);
/** actionLabel：定义该变量以承载业务值。 */
    const actionLabel = this.resolveCombatActionLabel(prefix) ?? '攻击';
/** targetLabel：定义该变量以承载业务值。 */
    const targetLabel = this.formatCombatPlayerLabel(target, attacker.id);
/** text：定义该变量以承载业务值。 */
    const text = resolved.hit
      ? `${this.formatCombatActionClause('你', targetLabel, actionLabel)}${tag}，造成 ${this.formatCombatDamageBreakdown(resolved.rawDamage, resolved.effectiveDamage, damageKind, element)} 伤害。`
      : `${this.formatCombatActionClause('你', targetLabel, actionLabel)}${tag}，结果 闪避。`;
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
    prefix: string,
    resolved: ResolvedHit,
    floatColor: string,
    damageKind: SkillDamageKind,
    element?: ElementKey,
/** extraDetails：定义该变量以承载业务值。 */
    extraDetails: string[] = [],
  ): WorldMessage {
/** tag：定义该变量以承载业务值。 */
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(target.hp, target.maxHp)}`, extraDetails);
/** actionLabel：定义该变量以承载业务值。 */
    const actionLabel = this.resolveCombatActionLabel(prefix) ?? '攻击';
/** text：定义该变量以承载业务值。 */
    const text = resolved.hit
      ? `${this.formatCombatActionClause(attacker.name, '你', actionLabel)}${tag}，造成 ${this.formatCombatDamageBreakdown(resolved.rawDamage, resolved.effectiveDamage, damageKind, element)} 伤害。`
      : `${this.formatCombatActionClause(attacker.name, '你', actionLabel)}${tag}，结果 闪避。`;
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

/** buildCombatTag：执行对应的业务逻辑。 */
  private buildCombatTag(details: string[]): string {
/** normalized：定义该变量以承载业务值。 */
    const normalized = details
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return normalized.length > 0 ? `（${normalized.join(' / ')}）` : '';
  }

/** buildCombatDetailTag：执行对应的业务逻辑。 */
  private buildCombatDetailTag(resolved: ResolvedHit, hpText: string, extraDetails: string[] = []): string {
/** details：定义该变量以承载业务值。 */
    const details: string[] = [];
    if (resolved.broken) details.push('破招');
    if (resolved.crit) details.push('暴击');
    if (resolved.resolved) details.push('化解');
    if (resolved.qiCost > 0) details.push(`耗气 ${resolved.qiCost}`);
    details.push(hpText);
    details.push(...extraDetails);
    return this.buildCombatTag(details);
  }

/** formatCombatActionClause：执行对应的业务逻辑。 */
  private formatCombatActionClause(casterLabel: string, targetLabel: string, actionLabel: string): string {
    return actionLabel === '攻击'
      ? `${casterLabel}对${targetLabel}发起攻击`
      : `${casterLabel}对${targetLabel}施展${actionLabel}`;
  }

  private formatCombatDamageBreakdown(
    rawDamage: number,
    actualDamage: number,
    damageKind: SkillDamageKind,
    element?: ElementKey,
  ): string {
    return `原始 ${Math.max(0, Math.round(rawDamage))} - 实际 ${Math.max(0, Math.round(actualDamage))} - ${this.formatCombatDamageType(damageKind, element)}`;
  }

/** formatCombatDamageType：执行对应的业务逻辑。 */
  private formatCombatDamageType(damageKind: SkillDamageKind, element?: ElementKey): string {
/** elementLabel：定义该变量以承载业务值。 */
    const elementLabel = element ? `${ELEMENT_KEY_LABELS[element] ?? element}行` : '';
    return damageKind === 'physical' ? `${elementLabel}物理` : `${elementLabel}法术`;
  }

/** formatCombatHealBreakdown：执行对应的业务逻辑。 */
  private formatCombatHealBreakdown(rawHeal: number, actualHeal: number): string {
    return `原始 ${Math.max(0, Math.round(rawHeal))} - 实际 ${Math.max(0, Math.round(actualHeal))} 治疗`;
  }

/** formatCombatPlayerLabel：执行对应的业务逻辑。 */
  private formatCombatPlayerLabel(player: PlayerState, viewerPlayerId?: string): string {
    return viewerPlayerId && player.id === viewerPlayerId ? '你' : player.name;
  }

/** formatCombatTileLabel：执行对应的业务逻辑。 */
  private formatCombatTileLabel(tileType?: string): string {
    if (!tileType) {
      return '地块';
    }
    return TILE_TYPE_LABELS[tileType as TileType] ?? tileType;
  }

/** resolveCombatActionLabel：执行对应的业务逻辑。 */
  private resolveCombatActionLabel(prefix: string): string | null {
/** normalized：定义该变量以承载业务值。 */
    const normalized = prefix.trim();
    if (!normalized) {
      return null;
    }
    if (normalized === '你攻击命中') {
      return '攻击';
    }
    if (normalized.endsWith('击中') || normalized.endsWith('命中')) {
      return normalized.slice(0, -2).trim() || null;
    }
    return normalized;
  }

/** formatCombatHp：执行对应的业务逻辑。 */
  private formatCombatHp(current: number, max: number): string {
    return `${Math.max(0, Math.round(current))}/${Math.max(1, Math.round(max))}`;
  }

/** getPlayerCombatSnapshot：执行对应的业务逻辑。 */
  private getPlayerCombatSnapshot(player: PlayerState): CombatSnapshot {
    return {
      attrs: this.attrService.getPlayerFinalAttrs(player),
      stats: this.attrService.getPlayerNumericStats(player),
      ratios: this.attrService.getPlayerRatioDivisors(player),
      realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1)),
      combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
    };
  }

  private getCombatExperienceAdvantage(attackerExp: number, defenderExp: number): { attackerBonus: number; defenderBonus: number } {
/** attackerBonus：定义该变量以承载业务值。 */
    const attackerBonus = this.getCombatExperienceBonus(attackerExp, defenderExp);
/** defenderBonus：定义该变量以承载业务值。 */
    const defenderBonus = this.getCombatExperienceBonus(defenderExp, attackerExp);
    return { attackerBonus, defenderBonus };
  }

/** getCombatExperienceBonus：执行对应的业务逻辑。 */
  private getCombatExperienceBonus(currentExp: number, oppositeExp: number): number {
/** baseline：定义该变量以承载业务值。 */
    const baseline = gameplayConstants.COMBAT_EXPERIENCE_ADVANTAGE_BASELINE;
/** normalizedCurrent：定义该变量以承载业务值。 */
    const normalizedCurrent = Math.max(0, Math.floor(currentExp)) + baseline;
/** normalizedOpposite：定义该变量以承载业务值。 */
    const normalizedOpposite = Math.max(0, Math.floor(oppositeExp)) + baseline;
    if (normalizedCurrent <= normalizedOpposite) {
      return 0;
    }
/** ratio：定义该变量以承载业务值。 */
    const ratio = normalizedCurrent / normalizedOpposite;
/** threshold：定义该变量以承载业务值。 */
    const threshold = Math.max(2, gameplayConstants.COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD);
    return Math.min(1, Math.max(0, (ratio - 1) / (threshold - 1)));
  }

/** getMonsterCombatExpEquivalent：执行对应的业务逻辑。 */
  private getMonsterCombatExpEquivalent(monster: RuntimeMonster, level: number): number {
/** normalizedLevel：定义该变量以承载业务值。 */
    const normalizedLevel = Number.isFinite(monster.level) ? Math.max(1, Math.floor(monster.level ?? 1)) : level;
/** realmEntry：定义该变量以承载业务值。 */
    const realmEntry = this.contentService.getRealmLevelEntry(normalizedLevel);
    if (!realmEntry) {
      return 0;
    }
/** gradeIndex：定义该变量以承载业务值。 */
    const gradeIndex = Math.max(0, gameplayConstants.TECHNIQUE_GRADE_ORDER.indexOf(realmEntry.grade ?? 'mortal'));
/** gradeFactor：定义该变量以承载业务值。 */
    const gradeFactor = (gradeIndex + 1) / 4;
    return Math.max(0, Math.floor(Math.max(0, realmEntry.expToNext ?? 0) * gradeFactor));
  }

/** collectMonsterEquipmentPassiveBonuses：执行对应的业务逻辑。 */
  private collectMonsterEquipmentPassiveBonuses(monster: RuntimeMonster): {
/** flatAttrs：定义该变量以承载业务值。 */
    flatAttrs: Attributes;
/** percentAttrs：定义该变量以承载业务值。 */
    percentAttrs: Attributes;
/** flatStats：定义该变量以承载业务值。 */
    flatStats: NumericStats;
/** percentStats：定义该变量以承载业务值。 */
    percentStats: NumericStats;
  } {
/** flatAttrs：定义该变量以承载业务值。 */
    const flatAttrs = createMonsterAttributeSnapshot();
/** percentAttrs：定义该变量以承载业务值。 */
    const percentAttrs = createMonsterAttributeSnapshot();
/** flatStats：定义该变量以承载业务值。 */
    const flatStats = createNumericStats();
/** percentStats：定义该变量以承载业务值。 */
    const percentStats = createNumericStats();

    for (const slot of EQUIP_SLOTS) {
      const item = monster.equipment[slot];
      if (!item?.effects?.length) {
        continue;
      }
      for (const effect of item.effects) {
        if (effect.type !== 'stat_aura' && effect.type !== 'progress_boost') {
          continue;
        }
        if (!this.matchesMonsterEquipmentConditions(monster, effect.conditions)) {
          continue;
        }
        if (effect.attrs) {
/** attrBucket：定义该变量以承载业务值。 */
          const attrBucket = this.resolveBuffModifierMode(effect.attrMode) === 'flat' ? flatAttrs : percentAttrs;
          applyAttributeAdditions(attrBucket, effect.attrs);
        }
        if (effect.stats) {
/** statBucket：定义该变量以承载业务值。 */
          const statBucket = this.resolveBuffModifierMode(effect.statMode) === 'flat' ? flatStats : percentStats;
          addPartialNumericStats(statBucket, effect.stats);
        }
      }
    }

    return {
      flatAttrs,
      percentAttrs,
      flatStats,
      percentStats,
    };
  }

  private matchesMonsterEquipmentConditions(
    monster: RuntimeMonster,
    group: EquipmentConditionGroup | undefined,
  ): boolean {
    if (!group || group.items.length === 0) {
      return true;
    }
/** mode：定义该变量以承载业务值。 */
    const mode = group.mode ?? 'all';
    if (mode === 'any') {
      return group.items.some((condition) => this.matchesMonsterEquipmentCondition(monster, condition));
    }
    return group.items.every((condition) => this.matchesMonsterEquipmentCondition(monster, condition));
  }

  private matchesMonsterEquipmentCondition(
    monster: RuntimeMonster,
    condition: EquipmentConditionDef,
  ): boolean {
    switch (condition.type) {
      case 'time_segment':
        return condition.in.includes(this.timeService.buildMonsterTimeState(monster).phase);
      case 'map':
        return this.mapService.matchesMapCondition(monster.mapId, condition.mapIds);
      case 'hp_ratio': {
/** maxHp：定义该变量以承载业务值。 */
        const maxHp = Math.max(1, Math.round(monster.maxHp));
/** ratio：定义该变量以承载业务值。 */
        const ratio = maxHp > 0 ? monster.hp / maxHp : 0;
        return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
      }
      case 'qi_ratio': {
/** maxQi：定义该变量以承载业务值。 */
        const maxQi = Math.max(0, Math.round(monster.numericStats?.maxQi ?? 0));
/** ratio：定义该变量以承载业务值。 */
        const ratio = maxQi > 0 ? monster.qi / maxQi : 0;
        return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
      }
      case 'is_cultivating':
        return condition.value === false;
      case 'has_buff':
        return (monster.temporaryBuffs ?? []).some((buff) => (
          buff.buffId === condition.buffId
          && buff.remainingTicks > 0
          && buff.stacks >= (condition.minStacks ?? 1)
        ));
      case 'target_kind':
        return false;
      default:
        return true;
    }
  }

/** applyMonsterBuffStats：执行对应的业务逻辑。 */
  private applyMonsterBuffStats(stats: NumericStats, buffs: TemporaryBuffState[] | undefined, targetRealmLv: number): void {
    applyMonsterBuffStatsHelper(
      stats,
      buffs,
      targetRealmLv,
      (mode) => this.resolveBuffModifierMode(mode),
      (partialStats, factor) => this.scaleNumericStats(partialStats, factor),
    );
  }

/** hasMonsterAttributeModifiers：执行对应的业务逻辑。 */
  private hasMonsterAttributeModifiers(attrs: Pick<Attributes, keyof Attributes>): boolean {
    return hasMonsterAttributeModifiersHelper(attrs);
  }

  private collectMonsterBuffAttrBonuses(
    monster: RuntimeMonster,
    targetRealmLv: number,
  ): {
/** flatAttrs：定义该变量以承载业务值。 */
    flatAttrs: Attributes;
/** percentAttrs：定义该变量以承载业务值。 */
    percentAttrs: Attributes;
  } {
    return collectMonsterBuffAttrBonusesHelper(
      monster.temporaryBuffs,
      targetRealmLv,
      (mode) => this.resolveBuffModifierMode(mode),
    );
  }

  private getMonsterFinalAttrs(
    monster: RuntimeMonster,
    passiveBonuses: ReturnType<WorldService['collectMonsterEquipmentPassiveBonuses']>,
    buffBonuses: ReturnType<WorldService['collectMonsterBuffAttrBonuses']>,
  ): Attributes {
    return getMonsterFinalAttrsHelper(monster.attrs, passiveBonuses, buffBonuses);
  }

/** getMonsterCombatSnapshot：执行对应的业务逻辑。 */
  private getMonsterCombatSnapshot(monster: RuntimeMonster): CombatSnapshot {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
/** passiveBonuses：定义该变量以承载业务值。 */
    const passiveBonuses = this.collectMonsterEquipmentPassiveBonuses(monster);
/** buffAttrBonuses：定义该变量以承载业务值。 */
    const buffAttrBonuses = this.collectMonsterBuffAttrBonuses(monster, level);
/** finalAttrs：定义该变量以承载业务值。 */
    const finalAttrs = this.getMonsterFinalAttrs(monster, passiveBonuses, buffAttrBonuses);
/** hasPassiveAttrBonuses：定义该变量以承载业务值。 */
    const hasPassiveAttrBonuses = this.hasMonsterAttributeModifiers(passiveBonuses.flatAttrs)
      || this.hasMonsterAttributeModifiers(passiveBonuses.percentAttrs);
/** hasBuffAttrBonuses：定义该变量以承载业务值。 */
    const hasBuffAttrBonuses = this.hasMonsterAttributeModifiers(buffAttrBonuses.flatAttrs)
      || this.hasMonsterAttributeModifiers(buffAttrBonuses.percentAttrs);

/** stats：定义该变量以承载业务值。 */
    let stats: NumericStats;
    if (hasPassiveAttrBonuses || hasBuffAttrBonuses) {
      stats = resolveMonsterNumericStatsFromAttributes({
        attrs: finalAttrs,
        equipment: monster.equipment,
        level: monster.level,
        statPercents: monster.statPercents,
        grade: monster.grade,
        tier: monster.tier,
      });
    } else {
      stats = monster.numericStats ? cloneNumericStats(monster.numericStats) : createNumericStats();
    }

    if (!monster.numericStats && !hasPassiveAttrBonuses) {
      stats.physAtk = monster.attack;
      stats.spellAtk = Math.max(1, Math.round(monster.attack * 0.9));
      stats.physDef = Math.max(0, Math.round(monster.maxHp * 0.18 + level * 2));
      stats.spellDef = Math.max(0, Math.round(monster.maxHp * 0.14 + level * 2));
      stats.hit = 12 + level * 8;
      stats.dodge = level * 4;
      stats.crit = level * 2;
      stats.antiCrit = level * 2;
      stats.critDamage = level * 6;
      stats.breakPower = level * 3;
      stats.resolvePower = level * 3;
    }

    addPartialNumericStats(stats, passiveBonuses.flatStats);
    applyNumericStatsPercentMultiplier(stats, passiveBonuses.percentStats);
    this.applyMonsterBuffStats(stats, monster.temporaryBuffs, level);
    return {
      attrs: finalAttrs,
      stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      realmLv: level,
      combatExp: this.getMonsterCombatExpEquivalent(monster, level),
    };
  }

/** resolveBuffModifierMode：执行对应的业务逻辑。 */
  private resolveBuffModifierMode(mode: BuffModifierMode | undefined): BuffModifierMode {
    return mode === 'flat' ? 'flat' : 'percent';
  }

/** getTemporaryBuffPresentationScale：执行对应的业务逻辑。 */
  private getTemporaryBuffPresentationScale(buffs: TemporaryBuffState[] | undefined): number {
/** scale：定义该变量以承载业务值。 */
    let scale = 1;
    for (const buff of buffs ?? []) {
      if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
        continue;
      }
      if (Number.isFinite(buff.presentationScale) && Number(buff.presentationScale) > scale) {
        scale = Number(buff.presentationScale);
      }
    }
    return scale;
  }

/** getMonsterPresentationScale：执行对应的业务逻辑。 */
  private getMonsterPresentationScale(monster: RuntimeMonster): number {
    return this.getTemporaryBuffPresentationScale(monster.temporaryBuffs);
  }

/** scaleNumericStats：执行对应的业务逻辑。 */
  private scaleNumericStats(stats: PartialNumericStats | undefined, factor: number): PartialNumericStats | undefined {
    if (!stats || factor === 0) {
      return undefined;
    }
/** result：定义该变量以承载业务值。 */
    const result: PartialNumericStats = {};
    for (const key of [
      'maxHp',
      'maxQi',
      'physAtk',
      'spellAtk',
      'physDef',
      'spellDef',
      'hit',
      'dodge',
      'crit',
      'antiCrit',
      'critDamage',
      'breakPower',
      'resolvePower',
      'maxQiOutputPerTick',
      'qiRegenRate',
      'hpRegenRate',
      'cooldownSpeed',
      'auraCostReduce',
      'auraPowerRate',
      'playerExpRate',
      'techniqueExpRate',
      'realmExpPerTick',
      'techniqueExpPerTick',
      'lootRate',
      'rareLootRate',
      'viewRange',
      'moveSpeed',
      'extraAggroRate',
      'extraRange',
      'extraArea',
    ] as const) {
/** value：定义该变量以承载业务值。 */
      const value = stats[key];
      if (value === undefined) continue;
      result[key] = value * factor;
    }
    if (stats.elementDamageBonus) {
/** next：定义该变量以承载业务值。 */
      const next: NonNullable<PartialNumericStats['elementDamageBonus']> = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageBonus[key];
        if (value === undefined) continue;
        next[key] = value * factor;
      }
      if (Object.keys(next).length > 0) {
        result.elementDamageBonus = next;
      }
    }
    if (stats.elementDamageReduce) {
/** next：定义该变量以承载业务值。 */
      const next: NonNullable<PartialNumericStats['elementDamageReduce']> = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageReduce[key];
        if (value === undefined) continue;
        next[key] = value * factor;
      }
      if (Object.keys(next).length > 0) {
        result.elementDamageReduce = next;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

/** applyMonsterNaturalRecovery：执行对应的业务逻辑。 */
  private applyMonsterNaturalRecovery(monster: RuntimeMonster): void {
/** stats：定义该变量以承载业务值。 */
    const stats = this.getMonsterCombatSnapshot(monster).stats;
    if (monster.hp < monster.maxHp && stats.hpRegenRate > 0) {
/** heal：定义该变量以承载业务值。 */
      const heal = Math.max(1, Math.round(monster.maxHp * (stats.hpRegenRate / 10000)));
      monster.hp = Math.min(monster.maxHp, monster.hp + heal);
    }
/** maxQi：定义该变量以承载业务值。 */
    const maxQi = Math.max(0, Math.round(stats.maxQi));
    if (maxQi > 0 && monster.qi < maxQi && stats.qiRegenRate > 0) {
/** recover：定义该变量以承载业务值。 */
      const recover = Math.max(1, Math.round(maxQi * (stats.qiRegenRate / 10000)));
      monster.qi = Math.min(maxQi, monster.qi + recover);
    }
  }

/** consumeQiForSkill：执行对应的业务逻辑。 */
  private consumeQiForSkill(player: PlayerState, skill: SkillDef): number | string {
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = this.getSkillQiCost(player, skill);
    if (actualCost === null) {
      return '当前灵力输出速率不足，无法稳定施展该技能';
    }
    if (player.qi < actualCost) {
      return `灵力不足，需要 ${actualCost} 点灵力`;
    }
    player.qi = Math.max(0, player.qi - actualCost);
    this.addDispersedAuraAround(player.mapId, player.x, player.y, actualCost);
    return actualCost;
  }

/** addDispersedAuraAround：执行对应的业务逻辑。 */
  private addDispersedAuraAround(mapId: string, centerX: number, centerY: number, qiCost: number): void {
/** dispersedAuraGainPerTile：定义该变量以承载业务值。 */
    const dispersedAuraGainPerTile = calculateDispersedAuraGainPerTile(qiCost);
    if (dispersedAuraGainPerTile <= 0) {
      return;
    }
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        this.mapService.addTileResourceValue(
          mapId,
          centerX + offsetX,
          centerY + offsetY,
          DISPERSED_AURA_RESOURCE_KEY,
          dispersedAuraGainPerTile,
        );
      }
    }
  }

/** canPlayerCastSkill：执行对应的业务逻辑。 */
  private canPlayerCastSkill(player: PlayerState, skill: SkillDef): boolean {
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = this.getSkillQiCost(player, skill);
    return actualCost !== null && player.qi >= actualCost;
  }

/** getSkillQiCost：执行对应的业务逻辑。 */
  private getSkillQiCost(player: PlayerState, skill: SkillDef): number | null {
/** numericStats：定义该变量以承载业务值。 */
    const numericStats = this.attrService.getPlayerNumericStats(player);
/** plannedCost：定义该变量以承载业务值。 */
    const plannedCost = Math.max(0, skill.cost);
/** actualCost：定义该变量以承载业务值。 */
    const actualCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, numericStats.maxQiOutputPerTick)));
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return null;
    }
    return actualCost;
  }

/** getEffectiveDropChance：执行对应的业务逻辑。 */
  private getEffectiveDropChance(player: PlayerState, monster: RuntimeMonster, drop: DropConfig): number {
/** stats：定义该变量以承载业务值。 */
    const stats = this.attrService.getPlayerNumericStats(player);
/** baseChance：定义该变量以承载业务值。 */
    const baseChance = Math.max(0, Math.min(1, drop.chance));
    if (baseChance <= 0) {
      return 0;
    }
/** totalRateBp：定义该变量以承载业务值。 */
    const totalRateBp = stats.lootRate + (baseChance <= 0.001 ? stats.rareLootRate : 0);
/** killEquivalent：定义该变量以承载业务值。 */
    const killEquivalent = basisPointModifierToMultiplier(totalRateBp);
    if (!Number.isFinite(killEquivalent) || killEquivalent <= 0) {
      return 0;
    }
/** effectiveChance：定义该变量以承载业务值。 */
    const effectiveChance = 1 - Math.pow(1 - baseChance, killEquivalent);
    return effectiveChance * this.getOrdinaryMonsterSpiritStoneDropMultiplier(player, monster, drop);
  }

  private getOrdinaryMonsterSpiritStoneDropMultiplier(
    player: PlayerState,
    monster: RuntimeMonster,
    drop: DropConfig,
  ): number {
    if (drop.itemId !== MARKET_CURRENCY_ITEM_ID || !this.isOrdinaryMonster(monster)) {
      return 1;
    }
/** playerRealmLv：定义该变量以承载业务值。 */
    const playerRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
/** monsterRealmLv：定义该变量以承载业务值。 */
    const monsterRealmLv = Math.max(1, Math.floor(monster.level ?? Math.round(monster.attack / 6)));
    return playerRealmLv - monsterRealmLv >= ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD
      ? ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER
      : 1;
  }

/** inferMonsterElement：执行对应的业务逻辑。 */
  private inferMonsterElement(monster: RuntimeMonster): ElementKey | undefined {
/** source：定义该变量以承载业务值。 */
    const source = `${monster.id}:${monster.name}`;
    if (source.includes('火') || source.includes('焰') || source.includes('血羽')) return 'fire';
    if (source.includes('寒') || source.includes('冰') || source.includes('霜') || source.includes('泽')) return 'water';
    if (source.includes('竹') || source.includes('木') || source.includes('藤')) return 'wood';
    if (source.includes('矿') || source.includes('金') || source.includes('刀') || source.includes('刃') || source.includes('星')) return 'metal';
    if (source.includes('石') || source.includes('骨') || source.includes('魂') || source.includes('谷')) return 'earth';
    return undefined;
  }

/** drainEffects：执行对应的业务逻辑。 */
  drainEffects(mapId: string): CombatEffect[] {
/** effects：定义该变量以承载业务值。 */
    const effects = this.effectsByMap.get(mapId) ?? [];
    this.effectsByMap.set(mapId, []);
    return effects;
  }

/** ensureMapInitialized：处理当前场景中的对应操作。 */
  private ensureMapInitialized(mapId: string) {
    if (this.monstersByMap.has(mapId)) return;

/** persistedStates：定义该变量以承载业务值。 */
      const persistedStates = this.persistedMonstersByMap.get(mapId);
/** persistedSpawnStates：定义该变量以承载业务值。 */
    const persistedSpawnStates = this.persistedMonsterSpawnAccelerationStatesByMap.get(mapId);
/** monsters：定义该变量以承载业务值。 */
    const monsters: RuntimeMonster[] = [];
/** monsterGroups：定义该变量以承载业务值。 */
    const monsterGroups = new Map<string, RuntimeMonster[]>();
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      const spawnKey = this.runtimePersistenceDomain.buildMonsterSpawnKey(mapId, spawn.id, spawn.x, spawn.y);
      for (let index = 0; index < spawn.maxAlive; index++) {
        const runtime: RuntimeMonster = {
          ...spawn,
          runtimeId: this.runtimePersistenceDomain.buildMonsterRuntimeId(mapId, spawn.id, spawn.x, spawn.y, index),
          mapId,
          spawnKey,
          spawnX: spawn.x,
          spawnY: spawn.y,
          hp: spawn.maxHp,
          qi: Math.max(0, Math.round(spawn.numericStats.maxQi)),
          alive: true,
          respawnLeft: 0,
          temporaryBuffs: [],
          skillCooldowns: {},
          pendingCast: undefined,
          damageContributors: new Map(),
          targetPlayerId: undefined,
          lastSeenTargetX: undefined,
          lastSeenTargetY: undefined,
          lastSeenTargetTick: undefined,
        };
/** persisted：定义该变量以承载业务值。 */
        const persisted = persistedStates?.get(runtime.runtimeId);
        if (persisted) {
          this.runtimePersistenceDomain.applyPersistedMonsterState(mapId, runtime, persisted);
        } else {
          this.applyMonsterInitialBuffs(runtime);
/** pos：定义该变量以承载业务值。 */
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
        }
/** group：定义该变量以承载业务值。 */
        const group = monsterGroups.get(spawnKey);
        if (group) {
          group.push(runtime);
        } else {
          monsterGroups.set(spawnKey, [runtime]);
        }
        monsters.push(runtime);
      }
    }

/** accelerationStates：定义该变量以承载业务值。 */
    const accelerationStates = new Map<string, MonsterSpawnAccelerationState>();
/** currentTick：定义该变量以承载业务值。 */
    const currentTick = this.timeService.getTotalTicks(mapId);
    for (const [spawnKey, group] of monsterGroups.entries()) {
      const sample = group[0];
      if (!sample || !this.isOrdinaryMonster(sample)) {
        continue;
      }
/** persistedState：定义该变量以承载业务值。 */
      const persistedState = persistedSpawnStates?.get(spawnKey);
      accelerationStates.set(
        spawnKey,
        persistedState
          ? this.runtimePersistenceDomain.applyPersistedMonsterSpawnAccelerationState(persistedState)
          : this.runtimePersistenceDomain.createDefaultMonsterSpawnAccelerationState(spawnKey, group, currentTick),
      );
    }

    if (persistedStates || persistedSpawnStates) {
      this.monsterRuntimeDirty = true;
    }
    this.monstersByMap.set(mapId, monsters);
    this.monsterSpawnGroupsByMap.set(mapId, monsterGroups);
    if (accelerationStates.size > 0) {
      this.monsterSpawnAccelerationStatesByMap.set(mapId, accelerationStates);
    } else {
      this.monsterSpawnAccelerationStatesByMap.delete(mapId);
    }
  }

/** findNearestLivingMonster：执行对应的业务逻辑。 */
  private findNearestLivingMonster(player: PlayerState, maxDistance: number): RuntimeMonster | undefined {
    this.ensureMapInitialized(player.mapId);
/** best：定义该变量以承载业务值。 */
    let best: RuntimeMonster | undefined;
/** bestDistance：定义该变量以承载业务值。 */
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const monster of this.monstersByMap.get(player.mapId) ?? []) {
      if (!monster.alive) continue;
      const distance = gridDistance(player, monster);
      if (!isPointInRange(player, monster, maxDistance)) continue;
      if (!this.aoiService.inView(player, monster.x, monster.y, maxDistance)) continue;
      if (distance < bestDistance) {
        best = monster;
        bestDistance = distance;
      }
    }
    return best;
  }

/** findNearestPlayer：执行对应的业务逻辑。 */
  private findNearestPlayer(monster: RuntimeMonster, players: PlayerState[], viewRange: number): PlayerState | undefined {
/** best：定义该变量以承载业务值。 */
    let best: PlayerState | undefined;
/** bestDistance：定义该变量以承载业务值。 */
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const player of players) {
      if (player.dead || player.mapId !== monster.mapId) continue;
      const distance = gridDistance(player, monster);
      if (!isPointInRange(player, monster, viewRange)) continue;
      if (!this.aoiService.inViewAt(monster.mapId, monster.x, monster.y, viewRange, player.x, player.y, monster.runtimeId)) continue;
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  private resolveMonsterTarget(
    monster: RuntimeMonster,
    players: PlayerState[],
    timeState: GameTimeState,
    currentTick: number,
  ): PlayerState | undefined {
    this.targetingDomain.refreshMonsterThreats(monster, players, timeState);
/** ownerId：定义该变量以承载业务值。 */
    const ownerId = this.getMonsterThreatId(monster);
/** targetId：定义该变量以承载业务值。 */
    const targetId = this.threatService.getHighestAttackableThreatTarget(ownerId, (candidateId) => {
/** target：定义该变量以承载业务值。 */
      const target = this.targetingDomain.resolveThreatPlayerForMonster(monster, candidateId);
      if (!target) {
        return false;
      }
      return this.targetingDomain.canMonsterAttackTarget(monster, target, timeState);
    });
    if (!targetId) {
      return undefined;
    }

/** target：定义该变量以承载业务值。 */
    const target = this.targetingDomain.resolveThreatPlayerForMonster(monster, targetId);
    if (target) {
      this.rememberMonsterTargetSight(monster, target, currentTick);
    }
    return target ?? undefined;
  }

  private rememberMonsterTargetSight(
    monster: RuntimeMonster,
    target: PlayerState,
    currentTick: number,
  ): void {
    monster.targetPlayerId = target.id;
    monster.lastSeenTargetX = target.x;
    monster.lastSeenTargetY = target.y;
    monster.lastSeenTargetTick = currentTick;
  }

/** clearMonsterTargetPursuit：执行对应的业务逻辑。 */
  private clearMonsterTargetPursuit(monster: RuntimeMonster): void {
    monster.targetPlayerId = undefined;
    monster.lastSeenTargetX = undefined;
    monster.lastSeenTargetY = undefined;
    monster.lastSeenTargetTick = undefined;
  }

  private resolveMonsterLostSightChaseTarget(
    monster: RuntimeMonster,
    currentTick: number,
  ): { x: number; y: number } | null {
/** targetPlayerId：定义该变量以承载业务值。 */
    const targetPlayerId = monster.targetPlayerId;
/** lastSeenTick：定义该变量以承载业务值。 */
    const lastSeenTick = monster.lastSeenTargetTick;
/** lastSeenX：定义该变量以承载业务值。 */
    const lastSeenX = monster.lastSeenTargetX;
/** lastSeenY：定义该变量以承载业务值。 */
    const lastSeenY = monster.lastSeenTargetY;
    if (
      typeof targetPlayerId !== 'string'
      || !Number.isInteger(lastSeenTick)
      || !Number.isInteger(lastSeenX)
      || !Number.isInteger(lastSeenY)
    ) {
      return null;
    }

/** normalizedLastSeenTick：定义该变量以承载业务值。 */
    const normalizedLastSeenTick = Number(lastSeenTick);
/** normalizedLastSeenX：定义该变量以承载业务值。 */
    const normalizedLastSeenX = Number(lastSeenX);
/** normalizedLastSeenY：定义该变量以承载业务值。 */
    const normalizedLastSeenY = Number(lastSeenY);

    if (currentTick > normalizedLastSeenTick + MONSTER_LOST_SIGHT_CHASE_TICKS) {
      return null;
    }

/** target：定义该变量以承载业务值。 */
    const target = this.playerService.getPlayer(targetPlayerId);
    if (!target || target.dead || target.mapId !== monster.mapId) {
      return null;
    }

    if (isPointInRange(monster, { x: normalizedLastSeenX, y: normalizedLastSeenY }, 1)) {
      return null;
    }

    return { x: normalizedLastSeenX, y: normalizedLastSeenY };
  }

/** isMonsterAutoAggroEnabled：执行对应的业务逻辑。 */
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

/** respawnPlayer：处理当前场景中的对应操作。 */
  private respawnPlayer(player: PlayerState) {
    this.restorePlayerAfterDefeat(player, true);
  }

/** registerPlayerDefeat：执行对应的业务逻辑。 */
  private registerPlayerDefeat(player: PlayerState, killer?: PlayerState): void {
    this.playerService.incrementDeathCount(player);
    if (killer && killer.id !== player.id) {
      this.playerService.incrementPlayerKill(killer);
    }
  }

/** restorePlayerAfterDefeat：处理当前场景中的对应操作。 */
  private restorePlayerAfterDefeat(player: PlayerState, occupy: boolean) {
/** respawnPlacement：定义该变量以承载业务值。 */
    const respawnPlacement = this.mapService.resolveDefaultPlayerSpawnPosition(player.id, player.respawnMapId);
    player.pendingSkillCast = undefined;
    this.navigationService.clearMoveTarget(player.id);
    player.questNavigation = undefined;
    player.mapNavigation = undefined;
    if (player.temporaryBuffs?.length) {
      player.temporaryBuffs = player.temporaryBuffs.filter((buff) => (
        buff.persistOnDeath === true || buff.category !== 'debuff'
      ));
    }
    this.attrService.recalcPlayer(player);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.mapId = respawnPlacement.mapId;
    player.x = respawnPlacement.x;
    player.y = respawnPlacement.y;
    player.facing = Direction.South;
    player.hp = player.maxHp;
    player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);
    player.dead = false;
    player.autoBattle = false;
    this.threatService.clearThreat(this.getPlayerThreatId(player));
    this.clearCombatTarget(player);
    if (occupy) {
      this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');
    }
    this.equipmentEffectService.dispatch(player, { trigger: 'on_enter_map' });
  }

  private stepToward(
    mapId: string,
/** actor：定义该变量以承载业务值。 */
    actor: { x: number; y: number },
    targetX: number,
    targetY: number,
    occupancyId: string,
  ): Direction | null {
/** dx：定义该变量以承载业务值。 */
    const dx = targetX - actor.x;
/** dy：定义该变量以承载业务值。 */
    const dy = targetY - actor.y;
/** options：定义该变量以承载业务值。 */
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
      if (this.moveActorTo(mapId, actor, option.x, option.y, occupancyId, 'monster')) {
        return option.facing;
      }
    }
    return null;
  }

  private stepPlayerTowardAttackPosition(
    player: PlayerState,
    target: ResolvedTarget,
    range: number,
  ): Direction | null {
/** next：定义该变量以承载业务值。 */
    const next = this.findNextAttackApproachStep(
      player.mapId,
      player,
      target,
      range,
      player.id,
      'player',
    );
    if (!next || (next.x === player.x && next.y === player.y)) {
      return null;
    }

    if (!this.moveActorTo(player.mapId, player, next.x, next.y, player.id, 'player')) {
      return null;
    }
    return player.facing ?? null;
  }

  private stepMonsterTowardAttackPosition(
    monster: RuntimeMonster,
    target: PlayerState,
    range: number,
  ): Direction | null {
/** next：定义该变量以承载业务值。 */
    const next = this.findNextAttackApproachStep(
      monster.mapId,
      monster,
      { kind: 'player', x: target.x, y: target.y, player: target },
      range,
      monster.runtimeId,
      'monster',
    );
    if (!next || (next.x === monster.x && next.y === monster.y)) {
      return null;
    }
    if (!this.moveActorTo(monster.mapId, monster, next.x, next.y, monster.runtimeId, 'monster')) {
      return null;
    }
    return monster.facing ?? null;
  }

  private stepMonsterTowardLastSeenPosition(
    monster: RuntimeMonster,
    lastSeenX: number,
    lastSeenY: number,
  ): Direction | null {
/** next：定义该变量以承载业务值。 */
    const next = this.findNextAttackApproachStep(
      monster.mapId,
      monster,
      { kind: 'tile', x: lastSeenX, y: lastSeenY },
      1,
      monster.runtimeId,
      'monster',
    );
    if (!next || (next.x === monster.x && next.y === monster.y)) {
      return null;
    }
    if (!this.moveActorTo(monster.mapId, monster, next.x, next.y, monster.runtimeId, 'monster')) {
      return null;
    }
    return monster.facing ?? null;
  }

  private findNextAttackApproachStep(
    mapId: string,
/** actor：定义该变量以承载业务值。 */
    actor: { x: number; y: number },
    target: ResolvedTarget,
    range: number,
    occupancyId: string,
    actorType: 'player' | 'monster',
  ): { x: number; y: number } | null {
/** goals：定义该变量以承载业务值。 */
    const goals = this.collectAttackApproachGoals(mapId, target, Math.max(1, range), occupancyId, actorType);
    if (goals.length === 0) {
      return null;
    }
    return this.navigationService.findNextStepTowardClosestGoal(
      mapId,
      actor.x,
      actor.y,
      goals,
      occupancyId,
      actorType,
    );
  }

  private canReachAttackPosition(
    mapId: string,
/** actor：定义该变量以承载业务值。 */
    actor: { x: number; y: number },
    target: ResolvedTarget,
    range: number,
    occupancyId: string,
    actorType: 'player' | 'monster',
  ): boolean {
    if (isPointInRange(actor, target, Math.max(1, range))) {
      return true;
    }
    return this.findNextAttackApproachStep(mapId, actor, target, range, occupancyId, actorType) !== null;
  }

  private collectAttackApproachGoals(
    mapId: string,
    target: ResolvedTarget,
    range: number,
    occupancyId: string,
    actorType: 'player' | 'monster',
  ): Array<{ x: number; y: number }> {
/** goals：定义该变量以承载业务值。 */
    const goals: Array<{ x: number; y: number }> = [];
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const x = target.x + dx;
        const y = target.y + dy;
        if (!isOffsetInRange(dx, dy, range)) {
          continue;
        }
        if (!this.mapService.canOccupy(mapId, x, y, { occupancyId, actorType })) {
          continue;
        }
        goals.push({ x, y });
      }
    }
    goals.sort((left, right) => {
/** leftDistance：定义该变量以承载业务值。 */
      const leftDistance = gridDistance(left, target);
/** rightDistance：定义该变量以承载业务值。 */
      const rightDistance = gridDistance(right, target);
      return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
    });
    return goals;
  }

  private moveActorTo(
    mapId: string,
/** actor：定义该变量以承载业务值。 */
    actor: { x: number; y: number; facing?: Direction },
    x: number,
    y: number,
    occupancyId: string,
    actorType: 'player' | 'monster',
  ): boolean {
    if (!this.mapService.isWalkable(mapId, x, y, { occupancyId, actorType })) {
      return false;
    }
    this.mapService.removeOccupant(mapId, actor.x, actor.y, occupancyId);
    actor.facing = this.resolveFacing(actor.x, actor.y, x, y);
    actor.x = x;
    actor.y = y;
    this.mapService.addOccupant(mapId, actor.x, actor.y, occupancyId, actorType);
    return true;
  }

/** resolveFacing：执行对应的业务逻辑。 */
  private resolveFacing(fromX: number, fromY: number, toX: number, toY: number): Direction {
    if (toX > fromX) return Direction.East;
    if (toX < fromX) return Direction.West;
    if (toY > fromY) return Direction.South;
    return Direction.North;
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

/** getAdjacentNpcs：执行对应的业务逻辑。 */
  private getAdjacentNpcs(player: PlayerState): NpcConfig[] {
    return this.mapService.getNpcs(player.mapId)
      .filter((npc) => isPointInRange(player, npc, 1));
  }

  private findSpawnPosition(mapId: string, monster: RuntimeMonster): { x: number; y: number } | null {
/** candidates：定义该变量以承载业务值。 */
    const candidates: Array<{ x: number; y: number }> = [];
/** radius：定义该变量以承载业务值。 */
    const radius = Math.max(0, monster.radius);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = monster.spawnX + dx;
        const ny = monster.spawnY + dy;
        if (!isOffsetInRange(dx, dy, radius)) continue;
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

/** isMonsterWithinWanderRange：执行对应的业务逻辑。 */
  private isMonsterWithinWanderRange(monster: RuntimeMonster, x: number, y: number): boolean {
/** radius：定义该变量以承载业务值。 */
    const radius = Math.max(0, monster.wanderRadius);
    return isOffsetInRange(x - monster.spawnX, y - monster.spawnY, radius);
  }

/** stepMonsterIdleRoam：执行对应的业务逻辑。 */
  private stepMonsterIdleRoam(monster: RuntimeMonster): Direction | null {
/** radius：定义该变量以承载业务值。 */
    const radius = Math.max(0, monster.wanderRadius);
    if (radius <= 0) {
      return null;
    }
/** directions：定义该变量以承载业务值。 */
    const directions = [
      { dx: 1, dy: 0, facing: Direction.East },
      { dx: -1, dy: 0, facing: Direction.West },
      { dx: 0, dy: 1, facing: Direction.South },
      { dx: 0, dy: -1, facing: Direction.North },
    ];
/** startIndex：定义该变量以承载业务值。 */
    const startIndex = Math.floor(Math.random() * directions.length);
    for (let offset = 0; offset < directions.length; offset += 1) {
      const direction = directions[(startIndex + offset) % directions.length]!;
      const nextX = monster.x + direction.dx;
/** nextY：定义该变量以承载业务值。 */
      const nextY = monster.y + direction.dy;
      if (!this.isMonsterWithinWanderRange(monster, nextX, nextY)) {
        continue;
      }
      if (this.moveActorTo(monster.mapId, monster, nextX, nextY, monster.runtimeId, 'monster')) {
        return direction.facing;
      }
    }
    return null;
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

/** getPlayerThreatId：执行对应的业务逻辑。 */
  private getPlayerThreatId(player: PlayerState): string {
    return `player:${player.id}`;
  }

/** getMonsterThreatId：执行对应的业务逻辑。 */
  private getMonsterThreatId(monster: RuntimeMonster): string {
    return monster.runtimeId;
  }

  getVisibleThreatArrowRefs(mapIds: string[], visibleEntityIds: Set<string>): Array<{ ownerId: string; targetId: string }> {
/** refs：定义该变量以承载业务值。 */
    const refs: Array<{ ownerId: string; targetId: string }> = [];
/** seen：定义该变量以承载业务值。 */
    const seen = new Set<string>();

/** pushRef：定义该变量以承载业务值。 */
    const pushRef = (ownerId: string, targetId?: string): void => {
      if (!targetId || !visibleEntityIds.has(ownerId) || !visibleEntityIds.has(targetId) || ownerId === targetId) {
        return;
      }
/** key：定义该变量以承载业务值。 */
      const key = `${ownerId}->${targetId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      refs.push({ ownerId, targetId });
    };

    for (const mapId of mapIds) {
      if (!mapId) {
        continue;
      }
      for (const player of this.playerService.getPlayersByMap(mapId)) {
        const targetRef = player.combatTargetId;
        if (!targetRef) {
          continue;
        }
/** targetId：定义该变量以承载业务值。 */
        const targetId = targetRef.startsWith('player:')
          ? targetRef.slice('player:'.length)
          : targetRef.startsWith('monster:')
            ? targetRef
            : undefined;
        pushRef(player.id, targetId);
      }
      for (const monster of this.monstersByMap.get(mapId) ?? []) {
        if (!monster.alive) {
          continue;
        }
        pushRef(monster.runtimeId, monster.targetPlayerId);
      }
    }

    return refs;
  }

/** getExtraAggroRate：执行对应的业务逻辑。 */
  private getExtraAggroRate(target: PlayerState | RuntimeMonster): number {
    return target.numericStats?.extraAggroRate ?? 0;
  }

/** getAggroThreshold：执行对应的业务逻辑。 */
  private getAggroThreshold(_owner: PlayerState | RuntimeMonster): number {
    return gameplayConstants.DEFAULT_AGGRO_THRESHOLD;
  }

  private addThreatToTarget(
    ownerId: string,
/** ownerPosition：定义该变量以承载业务值。 */
    ownerPosition: { x: number; y: number },
    target: ResolvedTarget,
    baseThreat: number,
  ): void {
    if (target.kind === 'tile' || target.kind === 'container') {
      return;
    }
/** targetId：定义该变量以承载业务值。 */
    const targetId = target.kind === 'monster'
      ? this.getMonsterThreatId(target.monster)
      : this.getPlayerThreatId(target.player);
/** targetEntity：定义该变量以承载业务值。 */
    const targetEntity = target.kind === 'monster' ? target.monster : target.player;
    this.threatService.addThreat({
      ownerId,
      targetId,
      baseThreat,
      targetExtraAggroRate: this.getExtraAggroRate(targetEntity),
      distance: gridDistance(ownerPosition, target),
    });
  }

  private selectPlayerAutoBattleTarget(
    player: PlayerState,
    effectiveViewRange: number,
    preferredRange: number,
    availableSkills: AutoBattleSkillCandidate[],
    stationaryMode: boolean,
  ): ResolvedTarget | undefined {
    this.targetingDomain.refreshPlayerThreats(player, effectiveViewRange);
/** ownerId：定义该变量以承载业务值。 */
    const ownerId = this.getPlayerThreatId(player);
/** threshold：定义该变量以承载业务值。 */
    const threshold = this.getAggroThreshold(player);
    return this.findPlayerAutoBattleTargetByThreat(
      player,
      this.threatService.getThreatEntries(ownerId),
      threshold,
      (target) => (
        stationaryMode
          ? this.targetingDomain.canPlayerCastAutoBattleSkillFromCurrentPosition(player, target, effectiveViewRange, availableSkills)
          : this.targetingDomain.canPlayerAttackTarget(player, target, effectiveViewRange, preferredRange)
      ),
    );
  }

  private findPlayerAutoBattleTargetByThreat(
    player: PlayerState,
    threatEntries: ReturnType<ThreatService['getThreatEntries']>,
    threshold: number,
    predicate: (target: ResolvedTarget) => boolean,
  ): ResolvedTarget | undefined {
/** candidates：定义该变量以承载业务值。 */
    const candidates: Array<{
/** target：定义该变量以承载业务值。 */
      target: ResolvedTarget;
/** threatValue：定义该变量以承载业务值。 */
      threatValue: number;
/** distance：定义该变量以承载业务值。 */
      distance: number;
/** hpRatio：定义该变量以承载业务值。 */
      hpRatio: number;
    }> = [];

    for (const entry of threatEntries) {
      if (entry.value < threshold) {
        continue;
      }
/** target：定义该变量以承载业务值。 */
      const target = this.targetingDomain.resolveThreatTargetForPlayer(player, entry.targetId) as ResolvedTarget | null;
      if (!target || target.kind === 'tile') {
        continue;
      }
      if (target.kind === 'player' && !this.canPlayerDealDamageToPlayer(player, target.player)) {
        continue;
      }
      if (!predicate(target)) {
        continue;
      }
      candidates.push({
        target,
        threatValue: entry.value,
        distance: gridDistance(player, target),
        hpRatio: this.targetingDomain.getResolvedTargetHpRatio(target),
      });
    }
    if (candidates.length === 0) {
      return undefined;
    }

/** bestTarget：定义该变量以承载业务值。 */
    let bestTarget: ResolvedTarget | undefined;
/** bestScore：定义该变量以承载业务值。 */
    let bestScore = Number.NEGATIVE_INFINITY;
/** nearestDistance：定义该变量以承载业务值。 */
    const nearestDistance = candidates.reduce((min, candidate) => Math.min(min, candidate.distance), Number.POSITIVE_INFINITY);
/** lowestHpRatio：定义该变量以承载业务值。 */
    const lowestHpRatio = candidates.reduce((min, candidate) => Math.min(min, candidate.hpRatio), Number.POSITIVE_INFINITY);
/** highestHpRatio：定义该变量以承载业务值。 */
    const highestHpRatio = candidates.reduce((max, candidate) => Math.max(max, candidate.hpRatio), Number.NEGATIVE_INFINITY);

    for (const candidate of candidates) {
      const score = this.getDynamicThreatSelectionScore(candidate.distance, candidate.threatValue)
        * this.targetingDomain.getPlayerTargetingThreatMultiplier(
          player,
          candidate.target,
          candidate.distance,
          candidate.hpRatio,
          nearestDistance,
          lowestHpRatio,
          highestHpRatio,
        );
      if (score > bestScore) {
        bestTarget = candidate.target;
        bestScore = score;
      }
    }
    return bestTarget;
  }

  private getDynamicThreatSelectionScore(
    distance: number,
    threatValue: number,
  ): number {
/** distanceMultiplier：定义该变量以承载业务值。 */
    const distanceMultiplier = distance <= 1
      ? 1
      : Math.pow(gameplayConstants.THREAT_DISTANCE_FALLOFF_PER_TILE, distance - 1);
    return threatValue * distanceMultiplier;
  }

  private attackTerrain(
    player: PlayerState,
    x: number,
    y: number,
    damage: number,
    skillName: string,
    targetName: string,
/** damageKind：定义该变量以承载业务值。 */
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    activeAttackBehavior = false,
  ): WorldUpdate {
/** cultivation：定义该变量以承载业务值。 */
    const cultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(player, 'attack')
      : { changed: false, dirty: [], messages: [] };
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
/** rawDamage：定义该变量以承载业务值。 */
    const rawDamage = Math.max(0, Math.round(damage));
/** result：定义该变量以承载业务值。 */
    const result = this.mapService.damageTile(player.mapId, x, y, rawDamage);
    if (!result) {
      return { ...EMPTY_UPDATE, error: '该目标无法被攻击' };
    }
/** appliedDamage：定义该变量以承载业务值。 */
    const appliedDamage = result.appliedDamage;

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
      text: `-${rawDamage}`,
      color: getDamageTrailColor(damageKind, element),
    });

/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [
      {
        playerId: player.id,
        text: `${this.formatCombatActionClause('你', targetName, skillName)}${this.buildCombatTag(cultivation.changed ? ['打断修炼'] : [])}，造成 ${this.formatCombatDamageBreakdown(rawDamage, appliedDamage, damageKind, element)} 伤害。`,
        kind: 'combat',
      },
    ];
    if (ORE_REWARD_ITEM_ID_BY_TILE[result.targetType]) {
/** reward：定义该变量以承载业务值。 */
      const reward = this.tryGrantOreReward(player, x, y, result.targetType, appliedDamage);
      messages.push(...reward.messages);
      for (const flag of reward.dirty) {
        dirty.add(flag);
      }
    }
    if (result.destroyed) {
      messages.push({
        playerId: player.id,
        text: `${targetName} 被击毁了。`,
        kind: 'combat',
      });
    }
    return { messages, dirty: [...dirty] };
  }

  private attackContainer(
    player: PlayerState,
    container: ContainerConfig,
    damage: number,
    skillName: string,
    targetName: string,
/** damageKind：定义该变量以承载业务值。 */
    damageKind: SkillDamageKind = 'physical',
    element?: ElementKey,
    activeAttackBehavior = false,
  ): WorldUpdate {
/** cultivation：定义该变量以承载业务值。 */
    const cultivation = activeAttackBehavior
      ? this.techniqueService.interruptCultivation(player, 'attack')
      : { changed: false, dirty: [], messages: [] };
/** dirty：定义该变量以承载业务值。 */
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
/** rawDamage：定义该变量以承载业务值。 */
    const rawDamage = Math.max(0, Math.round(damage));
/** result：定义该变量以承载业务值。 */
    const result = this.lootService.damageContainer(player.mapId, container.id, rawDamage);
    if (!result) {
      return { ...EMPTY_UPDATE, error: '该目标无法被攻击' };
    }

    this.pushEffect(player.mapId, {
      type: 'attack',
      fromX: player.x,
      fromY: player.y,
      toX: container.x,
      toY: container.y,
      color: getDamageTrailColor(damageKind, element),
    });
    this.pushEffect(player.mapId, {
      type: 'float',
      x: container.x,
      y: container.y,
      text: `-${rawDamage}`,
      color: getDamageTrailColor(damageKind, element),
    });

/** messages：定义该变量以承载业务值。 */
    const messages: WorldMessage[] = [
      {
        playerId: player.id,
        text: `${this.formatCombatActionClause('你', targetName, skillName)}${this.buildCombatTag(cultivation.changed ? ['打断修炼'] : [])}，造成 ${this.formatCombatDamageBreakdown(rawDamage, result.appliedDamage, damageKind, element)} 伤害。`,
        kind: 'combat',
      },
    ];
    if (result.destroyed) {
      messages.push({
        playerId: player.id,
        text: `${targetName} 被摧毁了。`,
        kind: 'combat',
      });
    }
    return {
      messages,
      dirty: [...dirty],
      dirtyPlayers: result.dirtyPlayers,
    };
  }

  private tryGrantOreReward(
    player: PlayerState,
    x: number,
    y: number,
    tileType: TileType,
    appliedDamage: number,
  ): WorldUpdate {
/** chanceBps：定义该变量以承载业务值。 */
    const chanceBps = this.getOreRewardChanceBps(tileType, appliedDamage);
    if (chanceBps <= 0 || Math.random() * 10000 >= chanceBps) {
      return EMPTY_UPDATE;
    }

/** rewardItemId：定义该变量以承载业务值。 */
    const rewardItemId = ORE_REWARD_ITEM_ID_BY_TILE[tileType];
    if (!rewardItemId) {
      return EMPTY_UPDATE;
    }

/** reward：定义该变量以承载业务值。 */
    const reward = this.contentService.createItem(rewardItemId, 1);
    if (!reward) {
      this.logger.warn(`${tileType} 奖励物品缺失: ${rewardItemId}`);
      return EMPTY_UPDATE;
    }

    if (this.inventoryService.addItem(player, reward)) {
/** sourceLabel：定义该变量以承载业务值。 */
      const sourceLabel = ORE_REWARD_SOURCE_LABEL_BY_TILE[tileType] ?? '资源堆';
      return {
        messages: [{
          playerId: player.id,
          text: `${reward.name} 从${sourceLabel}中震落而出 x${reward.count}。`,
          kind: 'loot',
        }],
        dirty: ['inv'],
      };
    }

    this.lootService.dropToGround(player.mapId, x, y, reward);
    return {
      messages: [{
        playerId: player.id,
        text: `${reward.name} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`,
        kind: 'loot',
      }],
      dirty: ['loot'],
    };
  }

/** getOreRewardChanceBps：执行对应的业务逻辑。 */
  private getOreRewardChanceBps(tileType: TileType, appliedDamage: number): number {
/** baseChanceBps：定义该变量以承载业务值。 */
    const baseChanceBps = ORE_REWARD_BASE_CHANCE_BPS_BY_TILE[tileType] ?? 0;
    if (baseChanceBps <= 0) {
      return 0;
    }
/** normalizedDamage：定义该变量以承载业务值。 */
    const normalizedDamage = Math.max(0, Math.floor(appliedDamage));
    if (normalizedDamage < ORE_REWARD_BASE_DAMAGE) {
      return Math.min(10000, Math.max(1, Math.round(baseChanceBps / 2)));
    }

/** chanceBps：定义该变量以承载业务值。 */
    let chanceBps = baseChanceBps;
/** nextThreshold：定义该变量以承载业务值。 */
    let nextThreshold = ORE_REWARD_BASE_DAMAGE;
    while (normalizedDamage >= nextThreshold * ORE_REWARD_DAMAGE_SCALE) {
      chanceBps += baseChanceBps;
      nextThreshold *= ORE_REWARD_DAMAGE_SCALE;
    }
    return Math.min(10000, chanceBps);
  }

/** pushEffect：处理当前场景中的对应操作。 */
  private pushEffect(mapId: string, effect: CombatEffect) {
/** list：定义该变量以承载业务值。 */
    const list = this.effectsByMap.get(mapId) ?? [];
    list.push(effect);
    this.effectsByMap.set(mapId, list);
  }

  private pushActionLabelEffect(
    mapId: string,
    x: number,
    y: number,
    text: string,
    options?: {
      actionStyle?: 'default' | 'divine' | 'chant';
      durationMs?: number;
    },
  ) {
    this.pushEffect(mapId, {
      type: 'float',
      x,
      y,
      text,
      color: '#efe3c2',
      variant: 'action',
      actionStyle: options?.actionStyle,
      durationMs: options?.durationMs,
    });
  }

/** faceToward：处理当前场景中的对应操作。 */
  private faceToward(entity: { x: number; y: number; facing?: Direction }, targetX: number, targetY: number) {
/** dx：定义该变量以承载业务值。 */
    const dx = targetX - entity.x;
/** dy：定义该变量以承载业务值。 */
    const dy = targetY - entity.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      entity.facing = dx > 0 ? Direction.East : Direction.West;
      return;
    }
    if (dy !== 0) {
      entity.facing = dy > 0 ? Direction.South : Direction.North;
    }
  }

/** performBasicAttack：执行对应的业务逻辑。 */
  private performBasicAttack(player: PlayerState, target: ResolvedTarget): WorldUpdate {
/** safeZoneAttackError：定义该变量以承载业务值。 */
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
/** combat：定义该变量以承载业务值。 */
    const combat = this.getPlayerCombatSnapshot(player);
/** useSpellAttack：定义该变量以承载业务值。 */
    const useSpellAttack = combat.stats.spellAtk > combat.stats.physAtk;
/** damageKind：定义该变量以承载业务值。 */
    const damageKind: SkillDamageKind = useSpellAttack ? 'spell' : 'physical';
/** baseDamage：定义该变量以承载业务值。 */
    const baseDamage = Math.max(1, Math.round(useSpellAttack ? combat.stats.spellAtk : combat.stats.physAtk));
    this.pushActionLabelEffect(player.mapId, player.x, player.y, '攻击');
    if (target.kind === 'monster') {
      if (!this.canPlayerDealDamageToMonster(player)) {
        return { ...EMPTY_UPDATE, error: '当前敌对判定未包含妖兽单位。' };
      }
      return this.attackMonster(player, target.monster, baseDamage, '你攻击命中', damageKind, undefined, 0, true, true);
    }
    if (target.kind === 'player') {
      if (!this.canPlayerDealDamageToPlayer(player, target.player)) {
        return { ...EMPTY_UPDATE, error: '当前敌对判定未包含该玩家。' };
      }
      return this.attackPlayer(player, target.player, baseDamage, '你攻击命中', damageKind, undefined, 0, true, true);
    }
    if (target.kind === 'container') {
      if (!this.canPlayerDealDamageToEnvironment(player)) {
        return { ...EMPTY_UPDATE, error: '当前敌对判定未包含场景地块。' };
      }
      return this.attackContainer(player, target.container, baseDamage, '你攻击', target.container.name, damageKind, undefined, true);
    }
    if (!this.canPlayerDealDamageToEnvironment(player)) {
      return { ...EMPTY_UPDATE, error: '当前敌对判定未包含场景地块。' };
    }
    return this.attackTerrain(player, target.x, target.y, baseDamage, '你攻击', this.formatCombatTileLabel(target.tileType), damageKind, undefined, true);
  }

/** formatRespawnTicks：执行对应的业务逻辑。 */
  private formatRespawnTicks(ticks: number | undefined): string {
/** totalSeconds：定义该变量以承载业务值。 */
    const totalSeconds = Math.max(0, Math.round(Number(ticks) || 0));
/** minutes：定义该变量以承载业务值。 */
    const minutes = Math.floor(totalSeconds / 60);
/** seconds：定义该变量以承载业务值。 */
    const seconds = totalSeconds % 60;
    if (minutes <= 0) {
      return `${Math.max(1, seconds)} 息`;
    }
    return `${minutes} 分 ${seconds.toString().padStart(2, '0')} 息`;
  }

/** getTargetRef：执行对应的业务逻辑。 */
  private getTargetRef(target: ResolvedTarget): string {
    if (target.kind === 'monster') {
      return target.monster.runtimeId;
    }
    if (target.kind === 'player') {
      return `player:${target.player.id}`;
    }
    if (target.kind === 'container') {
      return `container:${target.container.id}`;
    }
    return `tile:${target.x}:${target.y}`;
  }

/** clearCombatTarget：执行对应的业务逻辑。 */
  private clearCombatTarget(player: PlayerState): void {
    player.combatTargetId = undefined;
    player.combatTargetLocked = false;
    player.retaliatePlayerTargetId = undefined;
  }

/** getPlayerCombatTargetingRules：处理当前场景中的对应操作。 */
  private getPlayerCombatTargetingRules(player: PlayerState) {
    return normalizeCombatTargetingRules(
      player.combatTargetingRules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: player.allowAoePlayerHit === true }),
    );
  }

/** setPlayerCombatTargetingRules：执行对应的业务逻辑。 */
  private setPlayerCombatTargetingRules(player: PlayerState, nextRules: PlayerState['combatTargetingRules']): void {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeCombatTargetingRules(
      nextRules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: player.allowAoePlayerHit === true }),
    );
    player.combatTargetingRules = normalized;
    player.allowAoePlayerHit = hasCombatTargetingRule(normalized, 'hostile', 'all_players');
  }

/** setPlayerHostileAllPlayersEnabled：执行对应的业务逻辑。 */
  private setPlayerHostileAllPlayersEnabled(player: PlayerState, enabled: boolean): void {
/** rules：定义该变量以承载业务值。 */
    const rules = this.getPlayerCombatTargetingRules(player);
/** hostile：定义该变量以承载业务值。 */
    const hostile = rules.hostile.filter((entry) => entry !== 'all_players') as typeof rules.hostile;
    if (enabled) {
      hostile.push('all_players');
    }
    this.setPlayerCombatTargetingRules(player, {
      ...rules,
      hostile,
    });
  }

/** canPlayerDealDamageToMonster：执行对应的业务逻辑。 */
  private canPlayerDealDamageToMonster(player: PlayerState): boolean {
    return hasCombatTargetingRule(this.getPlayerCombatTargetingRules(player), 'hostile', 'monster');
  }

/** canPlayerDealDamageToEnvironment：执行对应的业务逻辑。 */
  private canPlayerDealDamageToEnvironment(player: PlayerState): boolean {
    return hasCombatTargetingRule(this.getPlayerCombatTargetingRules(player), 'hostile', 'terrain');
  }

/** canPlayerDealDamageToPlayer：执行对应的业务逻辑。 */
  private canPlayerDealDamageToPlayer(attacker: PlayerState, target: PlayerState): boolean {
    if (attacker.id === target.id) {
      return false;
    }
/** rules：定义该变量以承载业务值。 */
    const rules = this.getPlayerCombatTargetingRules(attacker);
    return hasCombatTargetingRule(rules, 'hostile', 'all_players')
      || (hasCombatTargetingRule(rules, 'hostile', 'retaliators') && attacker.retaliatePlayerTargetId === target.id);
  }

/** canPlayerTreatPlayer：执行对应的业务逻辑。 */
  private canPlayerTreatPlayer(player: PlayerState, target: PlayerState): boolean {
    if (target.id === player.id) {
      return true;
    }
/** rules：定义该变量以承载业务值。 */
    const rules = this.getPlayerCombatTargetingRules(player);
    if (hasCombatTargetingRule(rules, 'friendly', 'all_players')) {
      return true;
    }
    if (hasCombatTargetingRule(rules, 'friendly', 'retaliators') && player.retaliatePlayerTargetId === target.id) {
      return true;
    }
    return hasCombatTargetingRule(rules, 'friendly', 'non_hostile_players')
      && !this.canPlayerDealDamageToPlayer(player, target);
  }

/** canPlayerUseHostileEffectOnTarget：执行对应的业务逻辑。 */
  private canPlayerUseHostileEffectOnTarget(player: PlayerState, target: ResolvedTarget): boolean {
    if (target.kind === 'monster') {
      return this.canPlayerDealDamageToMonster(player);
    }
    if (target.kind === 'player') {
      return this.canPlayerDealDamageToPlayer(player, target.player);
    }
    return this.canPlayerDealDamageToEnvironment(player);
  }

/** ensurePlayerCanStartSkillAttack：执行对应的业务逻辑。 */
  private ensurePlayerCanStartSkillAttack(player: PlayerState, skill: SkillDef): string | undefined {
    if (!this.isHostileSkill(skill)) {
      return undefined;
    }
    return this.getSafeZoneAttackBlockError(player);
  }

/** isHostileSkill：执行对应的业务逻辑。 */
  private isHostileSkill(skill: SkillDef): boolean {
    return skill.effects.some((effect) => (
      effect.type === 'damage'
      || effect.type === 'terrain'
      || (effect.type === 'buff' && effect.target === 'target')
    ));
  }

/** getSafeZoneAttackBlockError：执行对应的业务逻辑。 */
  private getSafeZoneAttackBlockError(player: Pick<PlayerState, 'mapId' | 'x' | 'y'>): string | undefined {
    return this.mapService.isPointInSafeZone(player.mapId, player.x, player.y)
      ? '安全区内无法发起攻击。'
      : undefined;
  }

  private movePlayerToInitialSpawn(
    player: PlayerState,
    messageText: string,
/** options：定义该变量以承载业务值。 */
    options: { restoreVitals: boolean; clearBuffs: boolean },
  ): WorldUpdate {
/** spawn：定义该变量以承载业务值。 */
    const spawn = this.mapService.resolveDefaultPlayerSpawnPosition(player.id, player.respawnMapId);
    player.pendingSkillCast = undefined;
    this.navigationService.clearMoveTarget(player.id);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.mapId = spawn.mapId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.facing = Direction.South;
    if (options.clearBuffs) {
      player.temporaryBuffs = (player.temporaryBuffs ?? []).filter((buff) => buff.persistOnReturnToSpawn === true);
    }
    this.attrService.recalcPlayer(player);
    if (options.restoreVitals) {
      player.hp = player.maxHp;
      player.qi = Math.round(player.numericStats?.maxQi ?? player.qi);
      player.dead = false;
    }
    player.autoBattle = false;
    this.threatService.clearThreat(this.getPlayerThreatId(player));
    this.clearCombatTarget(player);
    this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');
/** equipmentResult：定义该变量以承载业务值。 */
    const equipmentResult = this.equipmentEffectService.dispatch(player, { trigger: 'on_enter_map' });

    return {
      messages: [{
        playerId: player.id,
        text: messageText,
        kind: 'system',
      }],
      dirty: [...new Set<WorldDirtyFlag>(['actions', ...(equipmentResult.dirty as WorldDirtyFlag[])])],
    };
  }

/** getReturnToSpawnTargetName：执行对应的业务逻辑。 */
  private getReturnToSpawnTargetName(player: Pick<PlayerState, 'respawnMapId'>): string {
/** mapId：定义该变量以承载业务值。 */
    const mapId = this.mapService.resolvePlayerRespawnMapId(player.respawnMapId);
    return this.mapService.getMapMeta(mapId)?.name ?? '落脚处';
  }

/** getReturnToSpawnActionName：执行对应的业务逻辑。 */
  private getReturnToSpawnActionName(player: Pick<PlayerState, 'respawnMapId'>): string {
    return `遁返${this.getReturnToSpawnTargetName(player)}`;
  }

/** getReturnToSpawnActionDesc：执行对应的业务逻辑。 */
  private getReturnToSpawnActionDesc(player: Pick<PlayerState, 'respawnMapId'>): string {
    return `催动归引灵符，立刻遁返${this.getReturnToSpawnTargetName(player)}落脚处，之后需调息 ${RETURN_TO_SPAWN_COOLDOWN_TICKS} 息。`;
  }

/** getReturnToSpawnSuccessText：执行对应的业务逻辑。 */
  private getReturnToSpawnSuccessText(player: Pick<PlayerState, 'respawnMapId'>): string {
    return `归引灵符化作清光，你已遁返${this.getReturnToSpawnTargetName(player)}落脚处。`;
  }

/** persistMonsterRuntimeState：执行对应的业务逻辑。 */
  async persistMonsterRuntimeState(): Promise<void> {
    if (!this.monsterRuntimeDirty) {
      return;
    }

    try {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot: PersistedMonsterRuntimeSnapshot = {
        version: 4,
        maps: {},
        spawnAccelerationStates: {},
      };

/** mapIds：定义该变量以承载业务值。 */
      const mapIds = new Set<string>([
        ...this.persistedMonstersByMap.keys(),
        ...this.persistedMonsterSpawnAccelerationStatesByMap.keys(),
        ...this.monstersByMap.keys(),
        ...this.monsterSpawnAccelerationStatesByMap.keys(),
      ]);

      for (const mapId of [...mapIds].sort((left, right) => left.localeCompare(right, 'zh-CN'))) {
        const allowedRuntimeIds = this.buildAllowedMonsterRuntimeIds(mapId);
        const allowedSpawnKeys = this.buildAllowedMonsterSpawnKeys(mapId);
        if (allowedRuntimeIds.size === 0) {
          continue;
        }

/** current：定义该变量以承载业务值。 */
        const current = this.monstersByMap.get(mapId);
/** records：定义该变量以承载业务值。 */
        const records = current
          ? current
              .filter((monster) => allowedRuntimeIds.has(monster.runtimeId))
              .map((monster) => this.captureMonsterRuntimeRecord(monster))
          : [...(this.persistedMonstersByMap.get(mapId)?.values() ?? [])]
              .filter((record) => allowedRuntimeIds.has(record.runtimeId))
              .map((record) => JSON.parse(JSON.stringify(record)) as PersistedMonsterRuntimeRecord);

        if (records.length === 0) {
          continue;
        }

        records.sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-CN'));
        snapshot.maps[mapId] = records;

        if (allowedSpawnKeys.size > 0) {
/** spawnStateRecords：定义该变量以承载业务值。 */
          const spawnStateRecords = this.monsterSpawnAccelerationStatesByMap.has(mapId)
            ? [...(this.monsterSpawnAccelerationStatesByMap.get(mapId)?.values() ?? [])]
                .filter((state) => allowedSpawnKeys.has(state.spawnKey))
                .map((state) => this.captureMonsterSpawnAccelerationRecord(state))
            : [...(this.persistedMonsterSpawnAccelerationStatesByMap.get(mapId)?.values() ?? [])]
                .filter((state) => allowedSpawnKeys.has(state.spawnKey))
                .map((state) => ({ ...state }));
          if (spawnStateRecords.length > 0) {
            spawnStateRecords.sort((left, right) => left.spawnKey.localeCompare(right.spawnKey, 'zh-CN'));
            snapshot.spawnAccelerationStates![mapId] = spawnStateRecords;
          }
        }
      }

      if (Object.keys(snapshot.spawnAccelerationStates ?? {}).length === 0) {
        delete snapshot.spawnAccelerationStates;
      }
      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_MONSTER_RUNTIME_DOCUMENT_KEY, snapshot);
      this.monsterRuntimeDirty = false;
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`怪物运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

/** loadPersistedMonsterRuntimeState：执行对应的业务逻辑。 */
  private async loadPersistedMonsterRuntimeState(): Promise<void> {
/** snapshot：定义该变量以承载业务值。 */
    let snapshot = await this.persistentDocumentService.get<Partial<PersistedMonsterRuntimeSnapshot>>(
      RUNTIME_STATE_SCOPE,
      MAP_MONSTER_RUNTIME_DOCUMENT_KEY,
    );
    if (!snapshot) {
      await this.importLegacyMonsterRuntimeStateIfNeeded();
      snapshot = await this.persistentDocumentService.get<Partial<PersistedMonsterRuntimeSnapshot>>(
        RUNTIME_STATE_SCOPE,
        MAP_MONSTER_RUNTIME_DOCUMENT_KEY,
      );
    }
    if (!snapshot) {
      return;
    }

    try {
      if (!snapshot?.maps || typeof snapshot.maps !== 'object') {
        this.logger.warn('怪物运行时持久化数据格式非法，已忽略');
        return;
      }

/** restoredCount：定义该变量以承载业务值。 */
      let restoredCount = 0;
      for (const [mapId, rawRecords] of Object.entries(snapshot.maps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }

/** records：定义该变量以承载业务值。 */
        const records = new Map<string, PersistedMonsterRuntimeRecord>();
        for (const rawRecord of rawRecords) {
          const record = this.normalizePersistedMonsterRuntimeRecord(rawRecord);
          if (!record) {
            continue;
          }
          records.set(record.runtimeId, record);
        }
        if (records.size === 0) {
          continue;
        }
        this.persistedMonstersByMap.set(mapId, records);
        restoredCount += records.size;
      }

      if (snapshot.spawnAccelerationStates && typeof snapshot.spawnAccelerationStates === 'object') {
        for (const [mapId, rawRecords] of Object.entries(snapshot.spawnAccelerationStates)) {
          if (!Array.isArray(rawRecords)) {
            continue;
          }

/** records：定义该变量以承载业务值。 */
          const records = new Map<string, PersistedMonsterSpawnAccelerationRecord>();
          for (const rawRecord of rawRecords) {
            const record = this.normalizePersistedMonsterSpawnAccelerationRecord(rawRecord);
            if (!record) {
              continue;
            }
            records.set(record.spawnKey, record);
          }

          if (records.size > 0) {
            this.persistedMonsterSpawnAccelerationStatesByMap.set(mapId, records);
          }
        }
      }

      if (restoredCount > 0) {
        this.logger.log(`已恢复怪物运行时状态：${restoredCount} 个实例`);
      }
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取怪物运行时持久化数据失败: ${message}`);
    }
  }

/** importLegacyMonsterRuntimeStateIfNeeded：执行对应的业务逻辑。 */
  private async importLegacyMonsterRuntimeStateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.monsterRuntimeStatePath)) {
      return;
    }

    try {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot = JSON.parse(fs.readFileSync(this.monsterRuntimeStatePath, 'utf-8')) as PersistedMonsterRuntimeSnapshot;
      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_MONSTER_RUNTIME_DOCUMENT_KEY, snapshot);
      this.logger.log('已从旧怪物运行时 JSON 导入 PostgreSQL');
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`导入旧怪物运行时 JSON 失败: ${message}`);
    }
  }

/** persistNpcShopRuntimeState：执行对应的业务逻辑。 */
  private async persistNpcShopRuntimeState(): Promise<void> {
    if (!this.npcShopRuntimeDirty) {
      return;
    }

    try {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot: PersistedNpcShopRuntimeSnapshot = {
        version: 1,
        items: {},
      };
      for (const [key, record] of [...this.npcShopRuntimeStates.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))) {
        if (record.soldQuantity <= 0) {
          continue;
        }
        snapshot.items[key] = {
          refreshWindowStartMs: Math.max(0, Math.floor(record.refreshWindowStartMs)),
          soldQuantity: Math.max(0, Math.floor(record.soldQuantity)),
        };
      }
      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, NPC_SHOP_RUNTIME_DOCUMENT_KEY, snapshot);
      this.npcShopRuntimeDirty = false;
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`NPC 商店运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

/** loadPersistedNpcShopRuntimeState：执行对应的业务逻辑。 */
  private async loadPersistedNpcShopRuntimeState(): Promise<void> {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = await this.persistentDocumentService.get<Partial<PersistedNpcShopRuntimeSnapshot>>(
      RUNTIME_STATE_SCOPE,
      NPC_SHOP_RUNTIME_DOCUMENT_KEY,
    );
    if (!snapshot) {
      return;
    }

    try {
      if (!snapshot.items || typeof snapshot.items !== 'object') {
        this.logger.warn('NPC 商店运行时持久化数据格式非法，已忽略');
        return;
      }

/** restoredCount：定义该变量以承载业务值。 */
      let restoredCount = 0;
      for (const [key, rawRecord] of Object.entries(snapshot.items)) {
        const record = this.normalizePersistedNpcShopRuntimeRecord(rawRecord);
        if (!record) {
          continue;
        }
        this.npcShopRuntimeStates.set(key, record);
        restoredCount += 1;
      }

      if (restoredCount > 0) {
        this.logger.log(`已恢复 NPC 商店运行时状态：${restoredCount} 条库存记录`);
      }
    } catch (error) {
/** message：定义该变量以承载业务值。 */
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取 NPC 商店运行时持久化数据失败: ${message}`);
    }
  }

/** normalizePersistedNpcShopRuntimeRecord：执行对应的业务逻辑。 */
  private normalizePersistedNpcShopRuntimeRecord(raw: unknown): PersistedNpcShopRuntimeRecord | null {
    return this.runtimePersistenceDomain.normalizePersistedNpcShopRuntimeRecord(raw);
  }

/** buildAllowedMonsterRuntimeIds：执行对应的业务逻辑。 */
  private buildAllowedMonsterRuntimeIds(mapId: string): Set<string> {
    return this.runtimePersistenceDomain.buildAllowedMonsterRuntimeIds(mapId);
  }

/** buildAllowedMonsterSpawnKeys：执行对应的业务逻辑。 */
  private buildAllowedMonsterSpawnKeys(mapId: string): Set<string> {
    return this.runtimePersistenceDomain.buildAllowedMonsterSpawnKeys(mapId);
  }

  private buildMonsterSpawnKey(
    mapId: string,
    spawnId: string,
    spawnX: number,
    spawnY: number,
  ): string {
    return this.runtimePersistenceDomain.buildMonsterSpawnKey(mapId, spawnId, spawnX, spawnY);
  }

  private buildMonsterRuntimeId(
    mapId: string,
    spawnId: string,
    spawnX: number,
    spawnY: number,
    index: number,
  ): string {
    return this.runtimePersistenceDomain.buildMonsterRuntimeId(mapId, spawnId, spawnX, spawnY, index);
  }

/** captureMonsterRuntimeState：执行对应的业务逻辑。 */
  private captureMonsterRuntimeState(monsters: RuntimeMonster[]): Map<string, PersistedMonsterRuntimeRecord> {
    return this.runtimePersistenceDomain.captureMonsterRuntimeState(monsters);
  }

/** captureMonsterSpawnAccelerationState：执行对应的业务逻辑。 */
  private captureMonsterSpawnAccelerationState(mapId: string): Map<string, PersistedMonsterSpawnAccelerationRecord> {
    return this.runtimePersistenceDomain.captureMonsterSpawnAccelerationState(
      this.monsterSpawnAccelerationStatesByMap.get(mapId)?.values() ?? [],
    );
  }

/** captureMonsterRuntimeRecord：执行对应的业务逻辑。 */
  private captureMonsterRuntimeRecord(monster: RuntimeMonster): PersistedMonsterRuntimeRecord {
    return this.runtimePersistenceDomain.captureMonsterRuntimeRecord(monster);
  }

  private captureMonsterSpawnAccelerationRecord(
    state: MonsterSpawnAccelerationState,
  ): PersistedMonsterSpawnAccelerationRecord {
    return this.runtimePersistenceDomain.captureMonsterSpawnAccelerationRecord(state);
  }

  private applyPersistedMonsterState(
    mapId: string,
    runtime: RuntimeMonster,
    persisted: PersistedMonsterRuntimeRecord,
  ): void {
    this.runtimePersistenceDomain.applyPersistedMonsterState(mapId, runtime, persisted);
  }

  private createDefaultMonsterSpawnAccelerationState(
    spawnKey: string,
    monsters: RuntimeMonster[],
    currentTick: number,
  ): MonsterSpawnAccelerationState {
    return this.runtimePersistenceDomain.createDefaultMonsterSpawnAccelerationState(spawnKey, monsters, currentTick);
  }

  private applyPersistedMonsterSpawnAccelerationState(
    persisted: PersistedMonsterSpawnAccelerationRecord,
  ): MonsterSpawnAccelerationState {
    return this.runtimePersistenceDomain.applyPersistedMonsterSpawnAccelerationState(persisted);
  }

/** normalizePersistedMonsterRuntimeRecord：执行对应的业务逻辑。 */
  private normalizePersistedMonsterRuntimeRecord(raw: unknown): PersistedMonsterRuntimeRecord | null {
    return this.runtimePersistenceDomain.normalizePersistedMonsterRuntimeRecord(raw);
  }

/** normalizePendingMonsterSkillCast：执行对应的业务逻辑。 */
  private normalizePendingMonsterSkillCast(raw: unknown): PendingMonsterSkillCast | undefined {
    return this.runtimePersistenceDomain.normalizePendingMonsterSkillCast(raw);
  }

  private normalizePersistedMonsterSpawnAccelerationRecord(
    raw: unknown,
  ): PersistedMonsterSpawnAccelerationRecord | null {
    return this.runtimePersistenceDomain.normalizePersistedMonsterSpawnAccelerationRecord(raw);
  }

/** isOrdinaryMonster：执行对应的业务逻辑。 */
  private isOrdinaryMonster(monster: Pick<RuntimeMonster, 'tier'>): boolean {
    return monster.tier === 'mortal_blood';
  }

/** areAllMonstersAlive：执行对应的业务逻辑。 */
  private areAllMonstersAlive(monsters: RuntimeMonster[]): boolean {
    for (const monster of monsters) {
      if (!monster.alive) {
        return false;
      }
    }
    return monsters.length > 0;
  }

/** areAllMonstersDefeated：执行对应的业务逻辑。 */
  private areAllMonstersDefeated(monsters: RuntimeMonster[]): boolean {
    for (const monster of monsters) {
      if (monster.alive) {
        return false;
      }
    }
    return monsters.length > 0;
  }

/** getMonsterSpawnGroup：执行对应的业务逻辑。 */
  private getMonsterSpawnGroup(monster: RuntimeMonster): RuntimeMonster[] {
    return this.monsterSpawnGroupsByMap.get(monster.mapId)?.get(monster.spawnKey) ?? [monster];
  }

/** getMonsterSpawnAccelerationState：执行对应的业务逻辑。 */
  private getMonsterSpawnAccelerationState(monster: RuntimeMonster): MonsterSpawnAccelerationState | undefined {
    if (!this.isOrdinaryMonster(monster)) {
      return undefined;
    }

/** mapStates：定义该变量以承载业务值。 */
    let mapStates = this.monsterSpawnAccelerationStatesByMap.get(monster.mapId);
    if (!mapStates) {
      mapStates = new Map<string, MonsterSpawnAccelerationState>();
      this.monsterSpawnAccelerationStatesByMap.set(monster.mapId, mapStates);
    }

/** state：定义该变量以承载业务值。 */
    let state = mapStates.get(monster.spawnKey);
    if (!state) {
      state = this.createDefaultMonsterSpawnAccelerationState(
        monster.spawnKey,
        this.getMonsterSpawnGroup(monster),
        this.timeService.getTotalTicks(monster.mapId),
      );
      mapStates.set(monster.spawnKey, state);
    }

    return state;
  }

/** normalizeMonsterRespawnSpeedBonusPercent：执行对应的业务逻辑。 */
  private normalizeMonsterRespawnSpeedBonusPercent(value: number): number {
    return this.runtimePersistenceDomain.normalizeMonsterRespawnSpeedBonusPercent(value);
  }

/** resolveMonsterRespawnTicks：执行对应的业务逻辑。 */
  private resolveMonsterRespawnTicks(monster: RuntimeMonster): number {
/** bonus：定义该变量以承载业务值。 */
    const bonus = this.getMonsterSpawnAccelerationState(monster)?.respawnSpeedBonusPercent ?? 0;
    return this.resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, bonus);
  }

/** resolveMonsterRespawnTicksWithBonus：执行对应的业务逻辑。 */
  private resolveMonsterRespawnTicksWithBonus(respawnTicks: number, bonusPercent: number): number {
    return this.runtimePersistenceDomain.resolveMonsterRespawnTicksWithBonus(respawnTicks, bonusPercent);
  }

/** handleMonsterRespawn：执行对应的业务逻辑。 */
  private handleMonsterRespawn(monster: RuntimeMonster): void {
/** state：定义该变量以承载业务值。 */
    const state = this.getMonsterSpawnAccelerationState(monster);
    if (!state) {
      return;
    }

/** group：定义该变量以承载业务值。 */
    const group = this.getMonsterSpawnGroup(monster);
    if (!this.areAllMonstersAlive(group)) {
      return;
    }

    state.clearDeadlineTick = this.timeService.getTotalTicks(monster.mapId)
      + this.resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, state.respawnSpeedBonusPercent);
  }

/** handleMonsterDefeat：执行对应的业务逻辑。 */
  private handleMonsterDefeat(monster: RuntimeMonster): void {
/** state：定义该变量以承载业务值。 */
    const state = this.getMonsterSpawnAccelerationState(monster);
    if (!state) {
      return;
    }

/** group：定义该变量以承载业务值。 */
    const group = this.getMonsterSpawnGroup(monster);
    if (!this.areAllMonstersDefeated(group)) {
      return;
    }

/** currentTick：定义该变量以承载业务值。 */
    const currentTick = this.timeService.getTotalTicks(monster.mapId);
/** clearedInTime：定义该变量以承载业务值。 */
    const clearedInTime = state.clearDeadlineTick > 0 && currentTick <= state.clearDeadlineTick;
/** nextBonusPercent：定义该变量以承载业务值。 */
    const nextBonusPercent = clearedInTime
      ? Math.min(
          MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
          state.respawnSpeedBonusPercent + MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
        )
      : 0;
    state.respawnSpeedBonusPercent = nextBonusPercent;
    state.clearDeadlineTick = 0;

/** respawnTicks：定义该变量以承载业务值。 */
    const respawnTicks = this.resolveMonsterRespawnTicksWithBonus(monster.respawnTicks, nextBonusPercent);
    for (const entry of group) {
      if (!entry.alive) {
        entry.respawnLeft = respawnTicks;
      }
    }
  }

/** normalizePersistedTemporaryBuffState：执行对应的业务逻辑。 */
  private normalizePersistedTemporaryBuffState(raw: unknown): TemporaryBuffState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

/** candidate：定义该变量以承载业务值。 */
    const candidate = raw as Partial<TemporaryBuffState>;
    if (
      typeof candidate.buffId !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.shortMark !== 'string'
      || typeof candidate.category !== 'string'
      || typeof candidate.visibility !== 'string'
      || !Number.isFinite(candidate.remainingTicks)
      || !Number.isFinite(candidate.duration)
      || !Number.isFinite(candidate.stacks)
      || !Number.isFinite(candidate.maxStacks)
      || typeof candidate.sourceSkillId !== 'string'
    ) {
      return null;
    }

    return JSON.parse(JSON.stringify({
      ...candidate,
      remainingTicks: Math.max(0, Math.round(Number(candidate.remainingTicks))),
      duration: Math.max(1, Math.round(Number(candidate.duration))),
      stacks: Math.max(0, Math.round(Number(candidate.stacks))),
      maxStacks: Math.max(1, Math.round(Number(candidate.maxStacks))),
      presentationScale: Number.isFinite(candidate.presentationScale) ? Number(candidate.presentationScale) : undefined,
    })) as TemporaryBuffState;
  }

  /** 获取指定地图的所有运行时怪物（GM 世界管理用） */
  getRuntimeMonstersForGm(mapId: string): {
/** id：定义该变量以承载业务值。 */
    id: string; x: number; y: number; char: string; color: string;
/** name：定义该变量以承载业务值。 */
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
