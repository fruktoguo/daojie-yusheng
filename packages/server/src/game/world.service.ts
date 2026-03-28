/**
 * 世界服务 —— 游戏核心逻辑的编排层。
 * 负责战斗结算、技能释放、NPC 交互、任务推进、怪物 AI、
 * 自动战斗、传送、观察系统等所有与"世界规则"相关的行为。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ActionDef,
  Attributes,
  calcQiCostWithOutputLimit,
  cloneNumericStats,
  CombatEffect,
  computeAffectedCellsFromAnchor,
  createItemStackSignature,
  createNumericStats,
  DEFAULT_RATIO_DIVISOR,
  DISPERSED_AURA_RESOURCE_KEY,
  Direction,
  ElementKey,
  estimateMonsterSpiritFromStats,
  gameplayConstants,
  GameTimeState,
  getDamageTrailColor,
  gridDistance,
  isOffsetInRange,
  getRealmGapDamageMultiplier,
  isPointInRange,
  ItemStack,
  MONSTER_TIER_LABELS,
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
  TileType,
  VisibleBuffState,
} from '@mud/shared';
import * as fs from 'fs';
import { resolveServerDataPath } from '../common/data-path';
import { PersistentDocumentService } from '../database/persistent-document.service';
import { AttrService } from './attr.service';
import { AoiService } from './aoi.service';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { ContentService } from './content.service';
import { EquipmentEffectService } from './equipment-effect.service';
import { InventoryService } from './inventory.service';
import { LootService } from './loot.service';
import { ContainerConfig, DropConfig, MapService, MonsterSpawnConfig, NpcConfig, QuestConfig } from './map.service';
import { NavigationService } from './navigation.service';
import { PerformanceService } from './performance.service';
import { PlayerService } from './player.service';
import { isLikelyInternalContentId, resolveQuestTargetName } from './quest-display';
import { TechniqueService } from './technique.service';
import { ThreatService } from './threat.service';
import { TimeService } from './time.service';
import {
  DEFAULT_MONSTER_RATIO_DIVISORS,
  EMPTY_UPDATE,
  NPC_ROLE_PROFILES,
  OBSERVATION_BLIND_RATIO,
  OBSERVATION_FULL_RATIO,
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
} from '../constants/gameplay/terrain';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';

const STATIC_CONTEXT_TOGGLE_ACTIONS: readonly ActionDef[] = [{
  id: 'toggle:auto_battle',
  name: '自动战斗',
  type: 'toggle',
  desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_retaliate',
  name: '自动反击',
  type: 'toggle',
  desc: '控制被攻击时是否自动开战。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_battle_stationary',
  name: '原地战斗',
  type: 'toggle',
  desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
  cooldownLeft: 0,
}, {
  id: 'toggle:allow_aoe_player_hit',
  name: '全体攻击',
  type: 'toggle',
  desc: '控制群体攻击是否会误伤其他玩家。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_idle_cultivation',
  name: '闲置自动修炼',
  type: 'toggle',
  desc: '控制角色闲置一段时间后是否自动开始修炼。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_switch_cultivation',
  name: '修满自动切换',
  type: 'toggle',
  desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
  cooldownLeft: 0,
}, {
  id: 'sense_qi:toggle',
  name: '感气视角',
  type: 'toggle',
  desc: '切换感气视角，观察地块灵气层次与变化。',
  cooldownLeft: 0,
}];

type MessageKind = 'system' | 'quest' | 'combat' | 'loot';
type WorldDirtyFlag = 'inv' | 'quest' | 'actions' | 'tech' | 'attr' | 'loot';

interface RuntimeMonster extends MonsterSpawnConfig {
  runtimeId: string;
  mapId: string;
  spawnX: number;
  spawnY: number;
  hp: number;
  qi: number;
  alive: boolean;
  respawnLeft: number;
  temporaryBuffs: TemporaryBuffState[];
  skillCooldowns: Record<string, number>;
  damageContributors: Map<string, number>;
  facing?: Direction;
  targetPlayerId?: string;
}

interface NpcInteractionState {
  quest?: QuestConfig;
  questState?: QuestState;
  relation?: 'giver' | 'target' | 'submit';
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

interface PersistedMonsterRuntimeRecord {
  runtimeId: string;
  x: number;
  y: number;
  hp: number;
  qi?: number;
  alive: boolean;
  respawnLeft: number;
  temporaryBuffs?: TemporaryBuffState[];
  skillCooldowns?: Record<string, number>;
  damageContributors?: Record<string, number>;
  facing?: Direction;
  targetPlayerId?: string;
}

interface PersistedMonsterRuntimeSnapshot {
  version: 1 | 2;
  maps: Record<string, PersistedMonsterRuntimeRecord[]>;
}

const RUNTIME_STATE_SCOPE = 'runtime_state';
const MAP_MONSTER_RUNTIME_DOCUMENT_KEY = 'map_monster';

function getMonsterDisplayName(name: string, tier: 'mortal_blood' | 'variant' | 'demon_king'): string {
  if (tier !== 'variant') {
    return name;
  }
  const sanitized = name.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : name;
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


interface CombatSnapshot {
  stats: NumericStats;
  ratios: NumericRatioDivisors;
  realmLv: number;
  combatExp: number;
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
  player?: PlayerState;
  monsterCaster?: RuntimeMonster;
  skill: SkillDef;
  techLevel: number;
  targetCount: number;
  casterStats: NumericStats;
  target?: ResolvedTarget;
  targetStats?: NumericStats;
}

interface AutoBattleSkillCandidate {
  action: ActionDef;
  skill: SkillDef;
}

type BuffTargetEntity =
  | { kind: 'player'; player: PlayerState }
  | { kind: 'monster'; monster: RuntimeMonster };

@Injectable()
export class WorldService implements OnModuleInit, OnModuleDestroy {
  private readonly monstersByMap = new Map<string, RuntimeMonster[]>();
  private readonly persistedMonstersByMap = new Map<string, Map<string, PersistedMonsterRuntimeRecord>>();
  private readonly effectsByMap = new Map<string, CombatEffect[]>();
  private readonly logger = new Logger(WorldService.name);
  private readonly monsterRuntimeStatePath = resolveServerDataPath('runtime', 'map-monster-runtime-state.json');
  private monsterRuntimeDirty = false;

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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadPersistedMonsterRuntimeState();
  }

  async onModuleDestroy(): Promise<void> {
    await this.persistMonsterRuntimeState();
  }

  async reloadRuntimeStateFromPersistence(): Promise<void> {
    for (const [mapId, monsters] of this.monstersByMap.entries()) {
      for (const monster of monsters) {
        if (this.mapService.hasOccupant(mapId, monster.x, monster.y, monster.runtimeId)) {
          this.mapService.removeOccupant(mapId, monster.x, monster.y, monster.runtimeId);
        }
      }
    }
    this.monstersByMap.clear();
    this.persistedMonstersByMap.clear();
    this.effectsByMap.clear();
    this.monsterRuntimeDirty = false;
    this.threatService.clearAll();
    await this.loadPersistedMonsterRuntimeState();
  }

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
          char: container.char?.trim() ? container.char.trim().slice(0, 1) : '箱',
          color: container.color?.trim() ? container.color.trim() : '#c18b46',
          name: container.name,
          kind: 'container',
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
    if (monsters.length > 0) {
      this.persistedMonstersByMap.set(mapId, this.captureMonsterRuntimeState(monsters));
      this.monsterRuntimeDirty = true;
    }
    for (const monster of monsters) {
      if (this.mapService.hasOccupant(mapId, monster.x, monster.y, monster.runtimeId)) {
        this.mapService.removeOccupant(mapId, monster.x, monster.y, monster.runtimeId);
      }
      this.threatService.clearThreat(monster.runtimeId);
    }
    this.monstersByMap.delete(mapId);
    this.effectsByMap.delete(mapId);
    this.ensureMapInitialized(mapId);
  }

  /** 构建玩家的渲染实体数据（用于其他玩家视野中的显示） */
  buildPlayerRenderEntity(viewer: PlayerState, target: PlayerState, color: string): RenderEntity {
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
      buffs: this.getMapRenderableBuffs(target.temporaryBuffs),
    };
  }

  /** 在允许重叠的热点格上，将过多玩家压缩成单个人群实体，降低地图广播与渲染开销。 */
  buildCrowdedPlayerRenderEntities(entities: RenderEntity[], preservePlayerId?: string): RenderEntity[] {
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

    const aggregated: RenderEntity[] = [];
    for (const group of grouped.values()) {
      if (group.length < PLAYER_CROWD_RENDER_THRESHOLD) {
        aggregated.push(...group);
        continue;
      }

      aggregated.push(this.buildCrowdRenderEntity(group[0], group.length));

      if (preservePlayerId) {
        const preserved = group.find((entity) => entity.id === preservePlayerId);
        if (preserved) {
          aggregated.push(preserved);
        }
      }
    }

    return aggregated;
  }

  private buildCrowdRenderEntity(anchor: RenderEntity, count: number): RenderEntity {
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

  private buildCrowdObservationDetail(x: number, y: number, count: number): ObservedTileEntityDetail {
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
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);

    const actions: ActionDef[] = [...STATIC_CONTEXT_TOGGLE_ACTIONS, {
      id: 'cultivation:toggle',
      name: '当前修炼',
      type: 'toggle',
      desc: '切换当前主修功法的修炼状态；需先在功法面板选择主修功法。',
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
        name = interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
          ? `传话：${interaction.questState.title}`
          : `任务：${interaction.questState.title}`;
        desc = interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
          ? (interaction.questState.relayMessage?.trim() || interaction.quest?.relayMessage?.trim() || '把口信转达给对方。')
          : this.describeQuestProgress(interaction.questState, interaction.quest);
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
    const npc = this.getAdjacentNpcs(player).find((entry) => entry.id === npcId);
    if (!npc) {
      return { shop: null, error: '你离这位商人太远了' };
    }
    if (npc.shopItems.length === 0) {
      return { shop: null, error: '对方现在没有经营商店' };
    }

    const items = npc.shopItems
      .map((entry) => {
        const item = this.contentService.createItem(entry.itemId, 1);
        if (!item) {
          return null;
        }
        return {
          itemId: entry.itemId,
          item: this.toSyncedItemStack(item),
          unitPrice: entry.price,
        };
      })
      .filter((entry): entry is SyncedNpcShopView['items'][number] => Boolean(entry));

    if (items.length === 0) {
      return { shop: null, error: '商铺货架还没有可售物品' };
    }

    return {
      shop: {
        npcId: npc.id,
        npcName: npc.name,
        dialogue: npc.dialogue,
        currencyItemId: MARKET_CURRENCY_ITEM_ID,
        currencyItemName: this.getShopCurrencyItemName(),
        items,
      },
    };
  }

  private toSyncedItemStack(item: ItemStack): SyncedItemStack {
    if (this.contentService.getItem(item.itemId)) {
      return {
        itemId: item.itemId,
        count: Math.max(1, Math.floor(item.count)),
        mapUnlockId: item.mapUnlockId,
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
      mapUnlockId: item.mapUnlockId,
      tileAuraGainAmount: item.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse,
    };
  }

  buyNpcShopItem(player: PlayerState, payload: { npcId: string; itemId: string; quantity: number }): WorldUpdate {
    const npc = this.getAdjacentNpcs(player).find((entry) => entry.id === payload.npcId);
    if (!npc) {
      return { ...EMPTY_UPDATE, error: '你离这位商人太远了' };
    }
    const shopItem = npc.shopItems.find((entry) => entry.itemId === payload.itemId);
    if (!shopItem) {
      return { ...EMPTY_UPDATE, error: '这位商人没有出售该物品' };
    }
    if (!Number.isSafeInteger(payload.quantity) || payload.quantity <= 0) {
      return { ...EMPTY_UPDATE, error: '购买数量无效' };
    }

    const totalCost = payload.quantity * shopItem.price;
    if (!Number.isSafeInteger(totalCost) || totalCost <= 0) {
      return { ...EMPTY_UPDATE, error: '购买总价过大，暂时无法结算' };
    }

    const purchasedItem = this.contentService.createItem(shopItem.itemId, payload.quantity);
    if (!purchasedItem) {
      return { ...EMPTY_UPDATE, error: '商品配置异常，暂时无法购买' };
    }
    if (!this.canReceiveItems(player, [purchasedItem])) {
      return { ...EMPTY_UPDATE, error: '背包空间不足，无法购买' };
    }

    const currencyName = this.getShopCurrencyItemName();
    if (this.getInventoryCount(player, MARKET_CURRENCY_ITEM_ID) < totalCost) {
      return { ...EMPTY_UPDATE, error: `${currencyName}不足` };
    }
    const consumeError = this.consumeInventoryItem(player, MARKET_CURRENCY_ITEM_ID, totalCost, `${currencyName}不足`);
    if (consumeError) {
      return { ...EMPTY_UPDATE, error: consumeError };
    }
    if (!this.inventoryService.addItem(player, purchasedItem)) {
      return { ...EMPTY_UPDATE, error: '背包空间不足，无法购买' };
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
          text: player.autoBattleStationary === true ? '已开启原地战斗。' : '已关闭原地战斗。',
          kind: 'combat',
        }],
        dirty: ['actions'],
      };
    }

    if (actionId === 'toggle:allow_aoe_player_hit') {
      player.allowAoePlayerHit = player.allowAoePlayerHit === true ? false : true;
      return {
        messages: [{
          playerId: player.id,
          text: player.allowAoePlayerHit === true
            ? '已开启全体攻击，群体攻击现在也会命中玩家。'
            : '已关闭全体攻击，群体攻击将不会命中玩家。',
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
          text: player.autoSwitchCultivation === true
            ? '已开启功法修满自动切换。'
            : '已关闭功法修满自动切换。',
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
      const result = this.techniqueService.attemptBreakthrough(player);
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
    const mainQuestRepairChanged = this.ensureLinearMainQuest(player).changed;
    let changed = mainQuestRepairChanged;

    for (const quest of player.quests) {
      if (quest.status === 'completed') continue;
      const config = this.mapService.getQuest(quest.id);
      if (!config) continue;
      changed = this.syncQuestNpcLocations(quest) || changed;
      const nextProgress = this.resolveQuestProgress(player, quest, config);
      if (nextProgress !== quest.progress) {
        quest.progress = nextProgress;
        changed = true;
      }
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

    const statusChanged = this.refreshQuestStatuses(player);
    if (changed || statusChanged) {
      return (mainQuestRepairChanged || statusChanged) ? ['quest', 'actions'] : ['quest'];
    }
    return [];
  }

  /** 自动战斗逻辑：寻敌 → 追击 → 释放技能/普攻 */
  performAutoBattle(player: PlayerState): WorldUpdate {
    if (!player.autoBattle || player.dead) return EMPTY_UPDATE;
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

    const dirty = new Set<WorldDirtyFlag>();
    const effectiveViewRange = this.timeService.getEffectiveViewRangeFromBuff(player.viewRange, player.temporaryBuffs);
    const stationaryMode = player.autoBattleStationary === true;
    const availableSkills = this.collectAutoBattleSkillCandidates(player);
    const preferredRange = this.resolveAutoBattlePreferredRange(availableSkills);

    let target: ResolvedTarget | undefined;
    let targetVisible = true;

    if (player.combatTargetLocked) {
      target = this.resolveCombatTarget(player);
      if (!target) {
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
      targetVisible = this.canPlayerSeeTarget(player, target, effectiveViewRange);
    }

    if (!target) {
      target = this.selectPlayerAutoBattleTarget(player, effectiveViewRange, preferredRange, availableSkills, stationaryMode);
      if (!target) {
        this.clearCombatTarget(player);
        return EMPTY_UPDATE;
      }
      player.combatTargetId = this.getTargetRef(target);
      player.combatTargetLocked = false;
      targetVisible = true;
    }

    const targetRef = this.getTargetRef(target);

    if (targetVisible) {
      const selectedSkill = this.selectAutoBattleSkillForTarget(player, target, availableSkills);
      if (selectedSkill) {
        const update = this.performTargetedSkill(player, selectedSkill.skill.id, targetRef);
        if (update.consumedAction) {
          return { ...update, usedActionId: selectedSkill.skill.id };
        }
      }

      if (isPointInRange(player, target, 1)) {
        this.faceToward(player, target.x, target.y);
        return this.performBasicAttack(player, target);
      }
    }

    if (stationaryMode) {
      this.faceToward(player, target.x, target.y);
      return EMPTY_UPDATE;
    }

    const facing = this.stepPlayerTowardAttackPosition(player, target, preferredRange);
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
    const safeZoneAttackError = this.ensurePlayerCanStartSkillAttack(player, skill);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
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
    const safeZoneAttackError = this.ensurePlayerCanStartSkillAttack(player, skill);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
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
    const castTarget = primaryTarget ?? selectedTargets[0];
    const equipmentResult = this.equipmentEffectService.dispatch(player, {
      trigger: 'on_skill_cast',
      targetKind: castTarget?.kind,
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

  /** 锁定目标并开启自动战斗 */
  engageTarget(player: PlayerState, targetRef?: string): WorldUpdate {
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
    if (!targetRef) {
      return { ...EMPTY_UPDATE, error: '缺少目标' };
    }
    const target = this.resolveTargetRef(player, targetRef);
    if (!target || target.kind !== 'monster') {
      return { ...EMPTY_UPDATE, error: '只能锁定敌对单位' };
    }

    player.autoBattle = true;
    this.addThreatToTarget(this.getPlayerThreatId(player), player, target, gameplayConstants.DEFAULT_AGGRO_THRESHOLD);
    player.combatTargetId = target.monster.runtimeId;
    player.combatTargetLocked = false;
    this.navigationService.clearMoveTarget(player.id);
    const update = this.performAutoBattle(player);
    const dirty = new Set(update.dirty);
    dirty.add('actions');
    return { ...update, dirty: [...dirty] };
  }

  forceAttackTarget(player: PlayerState, targetRef?: string): WorldUpdate {
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
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
    if (target.kind !== 'tile') {
      this.addThreatToTarget(this.getPlayerThreatId(player), player, target, gameplayConstants.DEFAULT_AGGRO_THRESHOLD);
    }
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
    const canHitPlayersWithGroupSkill = player.allowAoePlayerHit === true;
    const players = canHitPlayersWithGroupSkill
      ? this.playerService.getPlayersByMap(player.mapId)
        .filter((entry) => entry.id !== player.id && !entry.dead)
      : [];
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
    return syncDynamicBuffPresentation({
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
      qiProjection: effect.qiProjection,
    });
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
      existing.qiProjection = nextBuff.qiProjection;
      syncDynamicBuffPresentation(existing);
      return existing;
    }
    targetBuffs.push(syncDynamicBuffPresentation(nextBuff));
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
        color: buff.color,
        attrs: buff.attrs,
        stats: buff.stats,
      }));
    return visible.length > 0 ? visible : undefined;
  }

  private getMapRenderableBuffs(buffs: TemporaryBuffState[] | undefined): VisibleBuffState[] | undefined {
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
        color: buff.color,
      }));
    return visible && visible.length > 0 ? visible : undefined;
  }

  getObservedEntitiesAt(viewer: PlayerState, x: number, y: number): ObservedTileEntityDetail[] {
    let sourceMapId = viewer.mapId;
    let resolvedX = x;
    let resolvedY = y;

    if (!this.mapService.isPointInMapBounds(sourceMapId, resolvedX, resolvedY)) {
      const parentMapId = this.mapService.getOverlayParentMapId(sourceMapId);
      if (!parentMapId) {
        return [];
      }
      const projected = this.mapService.projectPointToMap(parentMapId, sourceMapId, resolvedX, resolvedY);
      if (!projected) {
        return [];
      }
      sourceMapId = parentMapId;
      resolvedX = projected.x;
      resolvedY = projected.y;
    }

    const containers = this.mapService.getContainers(sourceMapId)
      .filter((container) => container.x === resolvedX && container.y === resolvedY)
      .map<ObservedTileEntityDetail>((container) => this.buildContainerObservationDetail(sourceMapId, container));

    const npcs = this.mapService.getNpcs(sourceMapId)
      .filter((npc) => npc.x === resolvedX && npc.y === resolvedY)
      .map<ObservedTileEntityDetail>((npc) => this.buildNpcObservationDetail(viewer, npc, sourceMapId));

    const monsters = (this.monstersByMap.get(sourceMapId) ?? [])
      .filter((monster) => monster.alive && monster.x === resolvedX && monster.y === resolvedY)
      .map<ObservedTileEntityDetail>((monster) => this.buildMonsterObservationDetail(viewer, monster));

    const playersAtTile = this.playerService.getPlayersByMap(sourceMapId)
      .filter((player) => player.x === resolvedX && player.y === resolvedY);
    const players = playersAtTile.length >= PLAYER_CROWD_RENDER_THRESHOLD
      ? [this.buildCrowdObservationDetail(resolvedX, resolvedY, playersAtTile.length)]
      : playersAtTile.map<ObservedTileEntityDetail>((player) => this.buildPlayerObservationDetail(viewer, player));

    return [...players, ...containers, ...npcs, ...monsters];
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
        return context.player?.hp ?? context.monsterCaster?.hp ?? 0;
      case 'caster.maxHp':
        return context.player?.maxHp ?? context.monsterCaster?.maxHp ?? 0;
      case 'caster.qi':
        return context.player?.qi ?? context.monsterCaster?.qi ?? 0;
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
      return context.player?.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks
        ?? context.monsterCaster?.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks
        ?? 0;
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
    return this.movePlayerToInitialSpawn(player, '调试指令已执行，你被送回云来镇出生点。', {
      restoreVitals: true,
      clearBuffs: true,
    });
  }

  relocatePlayerToInitialSpawn(player: PlayerState, reasonText: string): WorldUpdate {
    return this.movePlayerToInitialSpawn(player, reasonText, {
      restoreVitals: false,
      clearBuffs: false,
    });
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

  tickMonsters(mapId: string, players: PlayerState[]): WorldUpdate {
    this.ensureMapInitialized(mapId);
    const monsters = this.monstersByMap.get(mapId) ?? [];
    const allMessages: WorldMessage[] = [];
    const dirtyPlayers = new Set<string>();

    for (const monster of monsters) {
      if (!monster.alive) {
        this.measureCpuSection('monster_respawn', '怪物: 重生处理', () => {
          monster.respawnLeft -= 1;
          if (monster.respawnLeft <= 0) {
            const pos = this.findSpawnPosition(mapId, monster);
            if (pos && this.mapService.isWalkable(mapId, pos.x, pos.y, { actorType: 'monster' })) {
              monster.x = pos.x;
              monster.y = pos.y;
              monster.hp = monster.maxHp;
              monster.qi = Math.max(0, Math.round(monster.numericStats.maxQi));
              monster.alive = true;
              monster.temporaryBuffs = [];
              monster.skillCooldowns = {};
              monster.damageContributors.clear();
              this.threatService.clearThreat(this.getMonsterThreatId(monster));
              monster.targetPlayerId = undefined;
              this.mapService.addOccupant(mapId, monster.x, monster.y, monster.runtimeId, 'monster');
            } else {
              monster.respawnLeft = 1;
            }
          }
        });
        continue;
      }

      if (monster.temporaryBuffs.length > 0) {
        this.measureCpuSection('monster_buffs', '怪物: Buff 推进', () => {
          for (const buff of monster.temporaryBuffs) {
            buff.remainingTicks -= 1;
          }
          monster.temporaryBuffs = monster.temporaryBuffs.filter((buff) => buff.remainingTicks > 0 && buff.stacks > 0);
        });
      }
      this.tickMonsterSkillCooldowns(monster);

      const timeState = this.measureCpuSection('monster_time', '怪物: 时间效果', () => (
        this.timeService.syncMonsterTimeEffects(monster)
      ));
      this.measureCpuSection('monster_recovery', '怪物: 自然恢复', () => {
        this.applyMonsterNaturalRecovery(monster);
      });
      const target = this.measureCpuSection('monster_target', '怪物: 目标选择', () => (
        this.resolveMonsterTarget(monster, players, timeState)
      ));
      if (!target) {
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

      const castedSkill = this.tryCastMonsterSkill(monster, target, mapId, allMessages, dirtyPlayers);
      if (castedSkill) {
        continue;
      }

      if (isPointInRange(monster, target, 1)) {
        const defeated = this.measureCpuSection('monster_attack', '怪物: 攻击结算', () => {
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
          if (resolved.hit && resolved.damage > 0) {
            this.threatService.addThreat({
              ownerId: this.getPlayerThreatId(target),
              targetId: this.getMonsterThreatId(monster),
              baseThreat: resolved.damage,
              targetExtraAggroRate: this.getExtraAggroRate(monster),
              distance: gridDistance(target, monster),
            });
          }
          if (resolved.hit) {
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
          if (target.hp > 0 && target.autoRetaliate !== false && !target.autoBattle) {
            target.autoBattle = true;
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
          return target.hp <= 0;
        });
        if (defeated) {
          this.measureCpuSection('monster_death_post', '怪物: 死亡后处理', () => {
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
    const skill = this.selectMonsterSkill(monster, target);
    if (!skill) {
      return false;
    }
    const update = this.castMonsterSkill(monster, skill, target, mapId);
    if (update.error) {
      return false;
    }
    allMessages.push(...update.messages);
    for (const playerId of update.dirtyPlayers ?? []) {
      dirtyPlayers.add(playerId);
    }
    return true;
  }

  private selectMonsterSkill(monster: RuntimeMonster, target: PlayerState): SkillDef | undefined {
    for (const skillId of monster.skills) {
      const skill = this.contentService.getSkill(skillId);
      if (!skill) {
        continue;
      }
      if (skill.requiresTarget !== false && !isPointInRange(monster, target, skill.range)) {
        continue;
      }
      if (!this.canMonsterCastSkill(monster, skill)) {
        continue;
      }
      return skill;
    }
    return undefined;
  }

  private canMonsterCastSkill(monster: RuntimeMonster, skill: SkillDef): boolean {
    if ((monster.skillCooldowns[skill.id] ?? 0) > 0) {
      return false;
    }
    const actualCost = this.getMonsterSkillQiCost(monster, skill);
    return actualCost !== null && monster.qi >= actualCost;
  }

  private getMonsterSkillQiCost(monster: RuntimeMonster, skill: SkillDef): number | null {
    const numericStats = this.getMonsterCombatSnapshot(monster).stats;
    const plannedCost = Math.max(0, skill.cost);
    const actualCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, numericStats.maxQiOutputPerTick)));
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return null;
    }
    return actualCost;
  }

  private consumeMonsterQiForSkill(monster: RuntimeMonster, skill: SkillDef): number | string {
    const actualCost = this.getMonsterSkillQiCost(monster, skill);
    if (actualCost === null) {
      return '怪物灵力输出速率不足';
    }
    if (monster.qi < actualCost) {
      return '怪物灵力不足';
    }
    monster.qi = Math.max(0, monster.qi - actualCost);
    const dispersedAuraGain = Math.floor(actualCost / 10);
    if (dispersedAuraGain > 0) {
      this.mapService.addTileResourceValue(
        monster.mapId,
        monster.x,
        monster.y,
        DISPERSED_AURA_RESOURCE_KEY,
        dispersedAuraGain,
      );
    }
    monster.skillCooldowns[skill.id] = Math.max(1, Math.round(skill.cooldown));
    return actualCost;
  }

  private getMonsterSkillTechniqueLevel(monster: RuntimeMonster, skill: SkillDef): number {
    const level = Math.max(1, monster.level ?? 1);
    const tierBonus = monster.tier === 'demon_king' ? 2 : monster.tier === 'variant' ? 1 : 0;
    return Math.max(skill.unlockLevel ?? 1, Math.ceil(level * 0.65) + tierBonus);
  }

  private selectMonsterSkillTargets(monster: RuntimeMonster, skill: SkillDef, primaryTarget?: ResolvedTarget): ResolvedTarget[] {
    if (!primaryTarget) {
      return [];
    }
    const targeting = skill.targeting;
    const shape = targeting?.shape ?? 'single';
    if (shape === 'single') {
      return [primaryTarget];
    }

    const players = this.playerService.getPlayersByMap(monster.mapId)
      .filter((entry) => !entry.dead);
    const maxTargets = Math.max(1, targeting?.maxTargets ?? 99);
    if (shape === 'line') {
      const cells = computeAffectedCellsFromAnchor(monster, primaryTarget, {
        range: skill.range,
        shape: 'line',
      });
      return this.collectMonsterSkillTargetsFromCells(players, cells, maxTargets);
    }

    const cells = computeAffectedCellsFromAnchor(monster, primaryTarget, {
      range: skill.range,
      shape: 'area',
      radius: targeting?.radius,
    });
    return this.collectMonsterSkillTargetsFromCells(players, cells, maxTargets);
  }

  private collectMonsterSkillTargetsFromCells(
    players: PlayerState[],
    cells: Array<{ x: number; y: number }>,
    maxTargets: number,
  ): ResolvedTarget[] {
    const resolved: ResolvedTarget[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      const targetPlayer = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
      if (!targetPlayer) {
        continue;
      }
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

  private castMonsterSkill(
    monster: RuntimeMonster,
    skill: SkillDef,
    target: PlayerState,
    mapId: string,
  ): WorldUpdate {
    const primaryTarget: ResolvedTarget = { kind: 'player', x: target.x, y: target.y, player: target };
    const selectedTargets = this.selectMonsterSkillTargets(monster, skill, primaryTarget);
    if (skill.requiresTarget !== false && selectedTargets.length === 0) {
      return { ...EMPTY_UPDATE, error: '目标超出技能范围' };
    }
    const qiCost = this.consumeMonsterQiForSkill(monster, skill);
    if (typeof qiCost === 'string') {
      return { ...EMPTY_UPDATE, error: qiCost };
    }

    this.faceToward(monster, target.x, target.y);
    this.pushActionLabelEffect(mapId, monster.x, monster.y, skill.name);
    const casterStats = this.getMonsterCombatSnapshot(monster).stats;
    const techLevel = this.getMonsterSkillTechniqueLevel(monster, skill);
    const messages: WorldMessage[] = [];
    const dirtyPlayers = new Set<string>();
    let appliedEffect = false;

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const damageTargets = this.pickDamageTargets(selectedTargets, primaryTarget)
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
            target: damageTarget,
            targetStats: this.getPlayerCombatSnapshot(damageTarget.player).stats,
          };
          const baseDamage = Math.max(1, Math.round(this.evaluateSkillFormula(effect.formula, context)));
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

      const update = this.applyMonsterBuffEffect(monster, skill, effect, selectedTargets, primaryTarget);
      messages.push(...update.messages);
      for (const playerId of update.dirtyPlayers ?? []) {
        dirtyPlayers.add(playerId);
      }
      if (!update.error) {
        appliedEffect = true;
      }
    }

    if (!appliedEffect) {
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
    const messages: WorldMessage[] = [];
    const dirtyPlayers = new Set<string>();

    if (effect.target === 'self') {
      monster.temporaryBuffs ??= [];
      const current = this.applyBuffState(monster.temporaryBuffs, this.buildTemporaryBuffState(skill, effect));
      if (primaryTarget?.kind === 'player') {
        const stackText = current.maxStacks > 1 ? `（${current.stacks}层）` : '';
        messages.push({
          playerId: primaryTarget.player.id,
          text: `${monster.name}施展${skill.name}，周身浮现 ${effect.name}${stackText}。`,
          kind: 'combat',
        });
      }
      return { messages, dirty: [], dirtyPlayers: [] };
    }

    const targets = this.pickDamageTargets(selectedTargets, primaryTarget)
      .filter((entry): entry is Extract<ResolvedTarget, { kind: 'player' }> => entry.kind === 'player');
    if (targets.length === 0) {
      return { ...EMPTY_UPDATE, error: '当前技能没有可施加状态的有效目标' };
    }

    for (const target of targets) {
      target.player.temporaryBuffs ??= [];
      const current = this.applyBuffState(target.player.temporaryBuffs, this.buildTemporaryBuffState(skill, effect));
      this.attrService.recalcPlayer(target.player);
      dirtyPlayers.add(target.player.id);
      const stackText = current.maxStacks > 1 ? `（${current.stacks}层）` : '';
      messages.push({
        playerId: target.player.id,
        text: `${monster.name}施展${skill.name}，你受到了 ${effect.name}${stackText}，持续 ${Math.max(1, effect.duration)} 息。`,
        kind: 'combat',
      });
    }

    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
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
    const cultivation = this.techniqueService.interruptCultivation(target, 'hit');
    const resolved = this.resolveHit(
      this.getMonsterCombatSnapshot(monster),
      this.getPlayerCombatSnapshot(target),
      baseDamage,
      damageKind,
      qiCost,
      element,
      (damage) => {
        target.hp = Math.max(0, target.hp - damage);
      },
    );
    const floatColor = getDamageTrailColor(damageKind, element);
    const messages: WorldMessage[] = cultivation.messages.map((message) => ({
      playerId: target.id,
      text: message.text,
      kind: message.kind,
    }));
    const dirtyPlayers = new Set<string>();
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
    if (resolved.hit) {
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
    if (target.hp > 0 && target.autoRetaliate !== false && !target.autoBattle) {
      target.autoBattle = true;
      this.navigationService.clearMoveTarget(target.id);
      dirtyPlayers.add(target.id);
    }

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
    messages.push(this.buildMonsterSkillAttackMessage(monster, target, skill, resolved, floatColor));

    if (target.hp <= 0) {
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

    return { messages, dirty: [], dirtyPlayers: [...dirtyPlayers] };
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
      const dirty: WorldDirtyFlag[] = this.refreshQuestStatuses(player) ? ['quest', 'actions'] : ['quest'];
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
      const nextQuestState = this.tryAcceptNextQuest(player, interaction.questState.nextQuestId);
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
          text: interaction.relation === 'target' && interaction.questState.objectiveType === 'talk'
            ? `${npc.name}：若你有话要带来，直说便是。`
            : `${npc.name}：${this.describeQuestProgress(interaction.questState, interaction.quest)}`,
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

  private createQuestState(player: PlayerState, quest: QuestConfig): QuestState {
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
        .map((reward) => this.createItemFromDrop(reward))
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
    questState.progress = this.resolveQuestProgress(player, questState, quest);
    if (this.canQuestBecomeReady(player, questState, quest)) {
      questState.status = 'ready';
    }
    return questState;
  }

  private ensureLinearMainQuest(player: PlayerState): { changed: boolean; autoAcceptedQuest?: QuestState } {
    const mainQuestChain = this.mapService.getMainQuestChain();
    if (mainQuestChain.length <= 0) {
      return { changed: false };
    }

    let changed = false;
    const expectedMainQuestId = this.getCurrentMainQuestId(player);
    const seenMainQuestIds = new Set<string>();
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

    let autoAcceptedQuest: QuestState | undefined;
    if (expectedMainQuestId && !filteredQuests.some((quest) => quest.id === expectedMainQuestId)) {
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

  private getCurrentMainQuestId(player: PlayerState): string | undefined {
    for (const quest of this.mapService.getMainQuestChain()) {
      const questState = player.quests.find((entry) => entry.id === quest.id);
      if (!questState || questState.status !== 'completed') {
        return quest.id;
      }
    }
    return undefined;
  }

  private tryAcceptNextQuest(player: PlayerState, nextQuestId?: string): QuestState | null {
    let candidateQuestId = nextQuestId;
    const visitedQuestIds = new Set<string>();

    while (candidateQuestId && !visitedQuestIds.has(candidateQuestId)) {
      visitedQuestIds.add(candidateQuestId);
      const existingQuestState = player.quests.find((entry) => entry.id === candidateQuestId);
      if (!existingQuestState) {
        const nextQuest = this.mapService.getQuest(candidateQuestId);
        if (!nextQuest) {
          return null;
        }
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

  private describeQuestAutoAccepted(quest: QuestState): string {
    const mapName = quest.giverMapName ?? quest.targetMapName ?? quest.submitMapName;
    if (quest.objectiveType === 'talk' && quest.targetNpcName) {
      const location = mapName ? `，前往 ${mapName} 寻找 ${quest.targetNpcName}` : `，前往寻找 ${quest.targetNpcName}`;
      return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取${location}。`;
    }
    if (quest.giverName) {
      const location = mapName ? `，可前往 ${mapName} 继续推进` : '';
      return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取${location}。`;
    }
    return `新的${quest.line === 'main' ? '主线' : '任务'}《${quest.title}》已自动接取。`;
  }

  private handlePortalTravel(player: PlayerState): WorldUpdate {
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (!portal) {
      return { ...EMPTY_UPDATE, error: '你需要站在传送阵上才能传送' };
    }
    return this.travelThroughPortal(player, portal);
  }

  travelThroughManualPortalAtCurrentPosition(player: PlayerState, expectedTargetMapId?: string): WorldUpdate | null {
    const portal = this.mapService.getPortalNear(player.mapId, player.x, player.y, 1, { trigger: 'manual' });
    if (!portal) {
      return null;
    }
    if (expectedTargetMapId && portal.targetMapId !== expectedTargetMapId) {
      return null;
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
    if (!this.mapService.isTerrainWalkable(portal.targetMapId, portal.targetX, portal.targetY)) {
      return {
        ...EMPTY_UPDATE,
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
    const equipmentResult = this.equipmentEffectService.dispatch(player, { trigger: 'on_enter_map' });

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
    const attackEquipment = this.equipmentEffectService.dispatch(player, {
      trigger: 'on_attack',
      targetKind: 'monster',
      target: { kind: 'monster', monster },
    });
    for (const flag of attackEquipment.dirty) {
      dirty.add(flag as WorldDirtyFlag);
    }
    this.recordMonsterDamage(monster, player.id, resolved.damage);

    if (monster.hp <= 0) {
      const expRecipients = this.resolveMonsterExpRecipients(monster, player);
      const expReferenceRealmLv = this.resolveMonsterExpReferenceRealmLv(monster, player);
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

      this.distributeMonsterKillExp(monster, player, expRecipients, expReferenceRealmLv, dirty, messages);

      for (const drop of monster.drops) {
        if (Math.random() > this.getEffectiveDropChance(player, drop)) continue;
        const loot = this.createItemFromDrop(drop);
        if (!loot) continue;
        this.deliverMonsterLoot(player, monster, loot, dirty, messages);
      }

      if (this.refreshQuestStatuses(player)) {
        dirty.add('quest');
        dirty.add('actions');
      }

      const killEquipment = this.equipmentEffectService.dispatch(player, {
        trigger: 'on_kill',
        targetKind: 'monster',
        target: { kind: 'monster', monster },
      });
      for (const flag of killEquipment.dirty) {
        dirty.add(flag as WorldDirtyFlag);
      }
    }

    return { messages, dirty: [...dirty] };
  }

  private recordMonsterDamage(monster: RuntimeMonster, playerId: string, damage: number): void {
    if (damage <= 0) {
      return;
    }
    monster.damageContributors.set(playerId, (monster.damageContributors.get(playerId) ?? 0) + damage);
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

  private resolveMonsterExpReferenceRealmLv(monster: RuntimeMonster, killer: PlayerState): number {
    let maxDamage = 0;
    let referencePlayer: PlayerState | undefined;
    for (const [playerId, damage] of monster.damageContributors.entries()) {
      if (damage <= maxDamage) {
        continue;
      }
      const participant = this.playerService.getPlayer(playerId);
      if (!participant) {
        continue;
      }
      maxDamage = damage;
      referencePlayer = participant;
    }
    return Math.max(1, Math.floor(referencePlayer?.realm?.realmLv ?? referencePlayer?.realmLv ?? killer.realm?.realmLv ?? killer.realmLv ?? 1));
  }

  private distributeMonsterKillExp(
    monster: RuntimeMonster,
    killer: PlayerState,
    recipients: PlayerState[],
    expReferenceRealmLv: number,
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
        expReferenceRealmLv,
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

    if (resolved.hit && resolved.damage > 0) {
      this.threatService.addThreat({
        ownerId: this.getPlayerThreatId(target),
        targetId: this.getPlayerThreatId(attacker),
        baseThreat: resolved.damage,
        targetExtraAggroRate: this.getExtraAggroRate(attacker),
        distance: gridDistance(target, attacker),
      });
    }

    if (target.hp > 0 && target.autoRetaliate !== false && !target.autoBattle) {
      target.autoBattle = true;
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
    const attackStat = damageKind === 'physical' ? attacker.stats.physAtk : attacker.stats.spellAtk;
    const rawDamage = monster.combatModel === 'value_stats'
      ? Math.max(1, Math.round(attackStat))
      : monster.attack + attackStat;
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

    const combatAdvantage = this.getCombatExperienceAdvantage(attacker.combatExp, defender.combatExp);
    const hitStat = attacker.stats.hit * (broken ? 2 : 1) * (1 + combatAdvantage.attackerBonus);
    const defenderDodge = defender.stats.dodge * (1 + combatAdvantage.defenderBonus);
    const dodgeGap = Math.max(0, defenderDodge - hitStat);
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
    const tag = this.buildCombatDetailTag(resolved, `目标气血 ${this.formatCombatHp(monster.hp, monster.maxHp)}`);
    const text = resolved.hit
      ? `${prefix} ${monster.name}${tag}，造成 ${resolved.damage} 点伤害。`
      : `${monster.name}身形一晃，避开了你的攻势${tag}。`;
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
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(player.hp, player.maxHp)}`);
    const text = resolved.hit
      ? `${monster.name}扑击你${tag}，造成 ${resolved.damage} 点伤害。`
      : `${monster.name}扑了个空，你险险避开${tag}。`;
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
  ): WorldMessage {
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(player.hp, player.maxHp)}`);
    const text = resolved.hit
      ? `${monster.name}施展${skill.name}${tag}，造成 ${resolved.damage} 点伤害。`
      : `${monster.name}施展${skill.name}，却被你险险避开${tag}。`;
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
    const tag = this.buildCombatDetailTag(resolved, `对方气血 ${this.formatCombatHp(target.hp, target.maxHp)}`);
    const text = resolved.hit
      ? `${prefix} ${target.name}${tag}，造成 ${resolved.damage} 点伤害。`
      : `${target.name}身形一晃，避开了你的攻势${tag}。`;
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
    const tag = this.buildCombatDetailTag(resolved, `你剩余气血 ${this.formatCombatHp(target.hp, target.maxHp)}`);
    const text = resolved.hit
      ? `${attacker.name}袭向你${tag}，造成 ${resolved.damage} 点伤害。`
      : `${attacker.name}的攻势被你险险避开${tag}。`;
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

  private buildCombatDetailTag(resolved: ResolvedHit, hpText: string): string {
    const details: string[] = [];
    if (resolved.broken) details.push('破招');
    if (resolved.crit) details.push('暴击');
    if (resolved.resolved) details.push('化解');
    if (resolved.qiCost > 0) details.push(`耗气 ${resolved.qiCost}`);
    details.push(hpText);
    return `（${details.join(' / ')}）`;
  }

  private formatCombatHp(current: number, max: number): string {
    return `${Math.max(0, Math.round(current))}/${Math.max(1, Math.round(max))}`;
  }

  private getPlayerCombatSnapshot(player: PlayerState): CombatSnapshot {
    return {
      stats: this.attrService.getPlayerNumericStats(player),
      ratios: this.attrService.getPlayerRatioDivisors(player),
      realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1)),
      combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
    };
  }

  private getCombatExperienceAdvantage(attackerExp: number, defenderExp: number): { attackerBonus: number; defenderBonus: number } {
    const attackerBonus = this.getCombatExperienceBonus(attackerExp, defenderExp);
    const defenderBonus = this.getCombatExperienceBonus(defenderExp, attackerExp);
    return { attackerBonus, defenderBonus };
  }

  private getCombatExperienceBonus(currentExp: number, oppositeExp: number): number {
    const baseline = gameplayConstants.COMBAT_EXPERIENCE_ADVANTAGE_BASELINE;
    const normalizedCurrent = Math.max(0, Math.floor(currentExp)) + baseline;
    const normalizedOpposite = Math.max(0, Math.floor(oppositeExp)) + baseline;
    if (normalizedCurrent <= normalizedOpposite) {
      return 0;
    }
    const ratio = normalizedCurrent / normalizedOpposite;
    const threshold = Math.max(2, gameplayConstants.COMBAT_EXPERIENCE_ADVANTAGE_THRESHOLD);
    return Math.min(1, Math.max(0, (ratio - 1) / (threshold - 1)));
  }

  private getMonsterCombatExpEquivalent(monster: RuntimeMonster, level: number): number {
    const normalizedLevel = Number.isFinite(monster.level) ? Math.max(1, Math.floor(monster.level ?? 1)) : level;
    const realmEntry = this.contentService.getRealmLevelEntry(normalizedLevel);
    if (!realmEntry) {
      return 0;
    }
    const gradeIndex = Math.max(0, gameplayConstants.TECHNIQUE_GRADE_ORDER.indexOf(realmEntry.grade ?? 'mortal'));
    const gradeFactor = (gradeIndex + 1) / 4;
    return Math.max(0, Math.floor(Math.max(0, realmEntry.expToNext ?? 0) * gradeFactor));
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
    const stats = monster.numericStats ? cloneNumericStats(monster.numericStats) : createNumericStats();
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    if (!monster.numericStats) {
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
    }
    this.applyMonsterBuffStats(stats, monster.temporaryBuffs);
    return {
      stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      realmLv: level,
      combatExp: this.getMonsterCombatExpEquivalent(monster, level),
    };
  }

  private applyMonsterNaturalRecovery(monster: RuntimeMonster): void {
    const stats = this.getMonsterCombatSnapshot(monster).stats;
    if (monster.hp < monster.maxHp && stats.hpRegenRate > 0) {
      const heal = Math.max(1, Math.round(monster.maxHp * (stats.hpRegenRate / 10000)));
      monster.hp = Math.min(monster.maxHp, monster.hp + heal);
    }
    const maxQi = Math.max(0, Math.round(stats.maxQi));
    if (maxQi > 0 && monster.qi < maxQi && stats.qiRegenRate > 0) {
      const recover = Math.max(1, Math.round(maxQi * (stats.qiRegenRate / 10000)));
      monster.qi = Math.min(maxQi, monster.qi + recover);
    }
  }

  private buildMonsterRenderEntity(viewer: PlayerState, monster: RuntimeMonster): RenderEntity {
    return {
      id: monster.runtimeId,
      x: monster.x,
      y: monster.y,
      char: monster.char,
      color: monster.color,
      name: getMonsterDisplayName(monster.name, monster.tier),
      kind: 'monster',
      monsterTier: monster.tier,
      hp: monster.hp,
      maxHp: monster.maxHp,
      buffs: this.getMapRenderableBuffs(monster.temporaryBuffs),
    };
  }

  private buildNpcRenderEntity(viewer: PlayerState, npc: NpcConfig, mapId: string): RenderEntity {
    const profile = this.buildNpcPresenceProfile(npc, mapId);
    const npcQuestMarker = this.resolveNpcQuestMarker(viewer, npc);
    return {
      id: `npc:${npc.id}`,
      x: npc.x,
      y: npc.y,
      char: npc.char,
      color: npc.color,
      name: npc.name,
      kind: 'npc',
      hp: profile.hp,
      maxHp: profile.hp,
      npcQuestMarker,
    };
  }

  private buildPlayerObservationDetail(viewer: PlayerState, target: PlayerState): ObservedTileEntityDetail {
    const snapshot = this.createPlayerObservationSnapshot(target);
    return {
      id: target.id,
      name: target.name,
      kind: 'player',
      hp: target.hp,
      maxHp: target.maxHp,
      qi: target.qi,
      maxQi: snapshot.maxQi,
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        this.buildObservationLineSpecs(snapshot, true),
        viewer.id === target.id,
      ),
      buffs: this.getRenderableBuffs(target.temporaryBuffs),
    };
  }

  private buildMonsterObservationDetail(viewer: PlayerState, monster: RuntimeMonster): ObservedTileEntityDetail {
    const snapshot = this.createMonsterObservationSnapshot(monster);
    const lineSpecs = [
      ...this.buildObservationLineSpecs(snapshot, true),
      { threshold: 0.28, label: '血脉层次', value: MONSTER_TIER_LABELS[monster.tier] ?? '凡血' },
    ];
    return {
      id: monster.runtimeId,
      name: getMonsterDisplayName(monster.name, monster.tier),
      kind: 'monster',
      monsterTier: monster.tier,
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        lineSpecs,
      ),
      buffs: this.getRenderableBuffs(monster.temporaryBuffs),
    };
  }

  private buildNpcObservationDetail(viewer: PlayerState, npc: NpcConfig, mapId: string): ObservedTileEntityDetail {
    const profile = this.buildNpcPresenceProfile(npc, mapId);
    const snapshot = this.createNpcObservationSnapshot(profile);
    const lineSpecs = [
      { threshold: 0.3, label: '身份', value: profile.title },
      ...this.buildObservationLineSpecs(snapshot, false),
    ];
    return {
      id: `npc:${npc.id}`,
      name: npc.name,
      kind: 'npc',
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      npcQuestMarker: this.resolveNpcQuestMarker(viewer, npc),
      observation: this.buildObservationInsight(
        viewer,
        snapshot,
        lineSpecs,
      ),
    };
  }

  private buildContainerObservationDetail(mapId: string, container: ContainerConfig): ObservedTileEntityDetail {
    return {
      id: `container:${mapId}:${container.id}`,
      name: container.name,
      kind: 'container',
      observation: {
        clarity: 'clear',
        verdict: container.desc?.trim() || `这处${container.name}可以搜索，翻找后或许会有收获。`,
        lines: [
          { label: '类别', value: '可搜索陈设' },
          { label: '名称', value: container.name },
          { label: '搜索阶次', value: `${container.grade}` },
        ],
      },
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
    const spirit = Math.max(1, Math.round(monster.attrs?.spirit ?? this.estimateMonsterSpirit(monster, combat.stats)));
    const maxQi = Math.max(24, Math.round(combat.stats.maxQi > 0 ? combat.stats.maxQi : (spirit * 2 + (monster.level ?? 1) * 8)));
    return {
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: Math.max(0, Math.min(maxQi, Math.round(monster.qi))),
      maxQi,
      spirit,
      stats: combat.stats,
      ratios: combat.ratios,
      attrs: { ...monster.attrs },
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

  private estimateMonsterSpirit(monster: RuntimeMonster, stats?: NumericStats): number {
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    return estimateMonsterSpiritFromStats(stats ?? this.getMonsterCombatSnapshot(monster).stats, level);
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
    return this.contentService.getRealmLevelEntry(level)?.displayName ?? `Lv.${level}`;
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
    const actualCost = this.getSkillQiCost(player, skill);
    if (actualCost === null) {
      return '当前灵力输出速率不足，无法稳定施展该技能';
    }
    if (player.qi < actualCost) {
      return `灵力不足，需要 ${actualCost} 点灵力`;
    }
    player.qi = Math.max(0, player.qi - actualCost);
    const dispersedAuraGain = Math.floor(actualCost / 10);
    if (dispersedAuraGain > 0) {
      this.mapService.addTileResourceValue(
        player.mapId,
        player.x,
        player.y,
        DISPERSED_AURA_RESOURCE_KEY,
        dispersedAuraGain,
      );
    }
    return actualCost;
  }

  private canPlayerCastSkill(player: PlayerState, skill: SkillDef): boolean {
    const actualCost = this.getSkillQiCost(player, skill);
    return actualCost !== null && player.qi >= actualCost;
  }

  private getSkillQiCost(player: PlayerState, skill: SkillDef): number | null {
    const numericStats = this.attrService.getPlayerNumericStats(player);
    const plannedCost = Math.max(0, skill.cost);
    const actualCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, numericStats.maxQiOutputPerTick)));
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return null;
    }
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
      const targetName = resolveQuestTargetName({
        objectiveType: quest.objectiveType,
        title: quest.title,
        targetName: quest.targetName,
        targetMonsterId: quest.targetMonsterId,
        resolveMonsterName: () => monsterName,
      });
      if (quest.targetName !== targetName) {
        quest.targetName = targetName;
      }
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
      const canBecomeReady = this.canQuestBecomeReady(player, quest, config);
      if (quest.status === 'active' && canBecomeReady) {
        quest.status = 'ready';
        changed = true;
      } else if (quest.status === 'ready' && !canBecomeReady) {
        quest.status = 'active';
        changed = true;
      }
    }
    return changed;
  }

  private canQuestBecomeReady(player: PlayerState, quest: QuestState, config: QuestConfig): boolean {
    if (quest.progress < quest.required) {
      return false;
    }
    return !config.requiredItemId || this.getInventoryCount(player, config.requiredItemId) >= (config.requiredItemCount ?? 1);
  }

  private resolveQuestProgress(player: PlayerState, questState: QuestState, config: QuestConfig): number {
    switch (config.objectiveType) {
      case 'talk':
        return questState.progress;
      case 'submit_item':
        return config.requiredItemId
          ? Math.min(questState.required, this.getInventoryCount(player, config.requiredItemId))
          : questState.progress;
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

    const persistedStates = this.persistedMonstersByMap.get(mapId);
    const monsters: RuntimeMonster[] = [];
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      for (let index = 0; index < spawn.maxAlive; index++) {
        const runtime: RuntimeMonster = {
          ...spawn,
          runtimeId: this.buildMonsterRuntimeId(mapId, spawn.id, spawn.x, spawn.y, index),
          mapId,
          spawnX: spawn.x,
          spawnY: spawn.y,
          hp: spawn.maxHp,
          qi: Math.max(0, Math.round(spawn.numericStats.maxQi)),
          alive: true,
          respawnLeft: 0,
          temporaryBuffs: [],
          skillCooldowns: {},
          damageContributors: new Map(),
          targetPlayerId: undefined,
        };
        const persisted = persistedStates?.get(runtime.runtimeId);
        if (persisted) {
          this.applyPersistedMonsterState(mapId, runtime, persisted);
        } else {
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
        monsters.push(runtime);
      }
    }

    if (persistedStates) {
      this.monsterRuntimeDirty = true;
    }
    this.monstersByMap.set(mapId, monsters);
  }

  private syncQuestNpcLocations(quest: QuestState): boolean {
    let changed = false;
    if (
      (
        !quest.giverMapName
        || quest.giverX === undefined
        || quest.giverY === undefined
        || (quest.giverMapId && quest.giverMapName === quest.giverMapId)
      )
      && quest.giverId
    ) {
      const giverLocation = this.mapService.getNpcLocation(quest.giverId);
      if (giverLocation) {
        quest.giverMapId = giverLocation.mapId;
        quest.giverMapName = giverLocation.mapName;
        quest.giverX = giverLocation.x;
        quest.giverY = giverLocation.y;
        changed = true;
      }
    }

    if (quest.targetNpcId) {
      const targetLocation = this.mapService.getNpcLocation(quest.targetNpcId);
      if (targetLocation && (
        quest.targetMapId !== targetLocation.mapId
        || quest.targetMapName !== targetLocation.mapName
        || quest.targetX !== targetLocation.x
        || quest.targetY !== targetLocation.y
        || quest.targetNpcName !== targetLocation.name
      )) {
        quest.targetMapId = targetLocation.mapId;
        quest.targetMapName = targetLocation.mapName;
        quest.targetX = targetLocation.x;
        quest.targetY = targetLocation.y;
        quest.targetNpcName = targetLocation.name;
        changed = true;
      }
    }

    if (quest.submitNpcId) {
      const submitLocation = this.mapService.getNpcLocation(quest.submitNpcId);
      if (submitLocation && (
        quest.submitMapId !== submitLocation.mapId
        || quest.submitMapName !== submitLocation.mapName
        || quest.submitX !== submitLocation.x
        || quest.submitY !== submitLocation.y
        || quest.submitNpcName !== submitLocation.name
      )) {
        quest.submitMapId = submitLocation.mapId;
        quest.submitMapName = submitLocation.mapName;
        quest.submitX = submitLocation.x;
        quest.submitY = submitLocation.y;
        quest.submitNpcName = submitLocation.name;
        changed = true;
      }
    }
    return changed;
  }

  private isQuestTargetNpc(quest: QuestState, npc: NpcConfig, currentMapId: string): boolean {
    return quest.targetNpcId === npc.id
      && (!quest.targetMapId || quest.targetMapId === currentMapId);
  }

  private isQuestSubmitNpc(quest: QuestState, npc: NpcConfig, currentMapId: string): boolean {
    return quest.submitNpcId === npc.id
      && quest.submitMapId === currentMapId;
  }

  private getNpcInteractionState(player: PlayerState, npc: NpcConfig): NpcInteractionState {
    const readySubmitQuest = player.quests.find((entry) => (
      entry.status === 'ready'
      && this.isQuestSubmitNpc(entry, npc, player.mapId)
    ));
    if (readySubmitQuest) {
      return {
        quest: this.mapService.getQuest(readySubmitQuest.id),
        questState: readySubmitQuest,
        relation: 'submit',
      };
    }

    const activeTargetQuest = player.quests.find((entry) => (
      entry.status === 'active'
      && entry.objectiveType === 'talk'
      && this.isQuestTargetNpc(entry, npc, player.mapId)
    ));
    if (activeTargetQuest) {
      return {
        quest: this.mapService.getQuest(activeTargetQuest.id),
        questState: activeTargetQuest,
        relation: 'target',
      };
    }

    const currentMainQuestId = this.getCurrentMainQuestId(player);
    if (currentMainQuestId) {
      const currentMainQuest = npc.quests.find((quest) => quest.id === currentMainQuestId);
      if (currentMainQuest) {
        const questState = player.quests.find((entry) => entry.id === currentMainQuest.id);
        if (questState && questState.status !== 'completed') {
          return { quest: currentMainQuest, questState, relation: 'giver' };
        }
        if (!questState) {
          return { quest: currentMainQuest, relation: 'giver' };
        }
      }
    }

    for (const quest of npc.quests) {
      if (quest.line === 'main' && currentMainQuestId && quest.id !== currentMainQuestId) {
        continue;
      }
      const questState = player.quests.find((entry) => entry.id === quest.id);
      if (questState && questState.status !== 'completed') {
        return { quest, questState, relation: 'giver' };
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
          return { quest, relation: 'giver' };
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
    if (interaction.questState?.status === 'active' && interaction.relation !== 'submit') {
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

  private deliverMonsterLoot(
    player: PlayerState,
    monster: RuntimeMonster,
    loot: ItemStack,
    dirty: Set<WorldDirtyFlag>,
    messages: WorldMessage[],
  ): void {
    if (this.inventoryService.addItem(player, loot)) {
      messages.push({
        playerId: player.id,
        text: `你拾取了 ${loot.name} x${loot.count}。`,
        kind: 'loot',
      });
      dirty.add('inv');
      return;
    }
    this.lootService.dropToGround(monster.mapId, monster.x, monster.y, loot);
    messages.push({
      playerId: player.id,
      text: `${loot.name} 掉落在 (${monster.x}, ${monster.y}) 的地面上，但你的背包已满。`,
      kind: 'loot',
    });
  }

  private consumeInventoryItem(
    player: PlayerState,
    itemId: string,
    count: number,
    errorMessage = '任务物品不足，暂时无法交付',
  ): string | null {
    let remaining = count;
    while (remaining > 0) {
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) {
        return errorMessage;
      }
      const stack = this.inventoryService.getItem(player, slotIndex);
      if (!stack) {
        return errorMessage;
      }
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) {
        return errorMessage;
      }
      remaining -= removed.count;
    }
    return null;
  }

  private getShopCurrencyItemName(): string {
    return this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
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
      case 'talk':
        parts.push(questState.progress >= questState.required ? '口信已传达' : '尚未把口信带到');
        break;
      case 'submit_item':
        parts.push(`当前持有 ${questState.progress}/${questState.required}`);
        break;
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

  private findNearestPlayer(monster: RuntimeMonster, players: PlayerState[], viewRange: number): PlayerState | undefined {
    let best: PlayerState | undefined;
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

  private resolveMonsterTarget(monster: RuntimeMonster, players: PlayerState[], timeState: GameTimeState): PlayerState | undefined {
    this.refreshMonsterThreats(monster, players, timeState);
    const ownerId = this.getMonsterThreatId(monster);
    const targetId = this.threatService.getHighestAttackableThreatTarget(ownerId, (candidateId) => {
      const target = this.resolveThreatPlayerForMonster(monster, candidateId);
      if (!target) {
        return false;
      }
      return this.canMonsterAttackTarget(monster, target, timeState);
    });
    if (!targetId) {
      monster.targetPlayerId = undefined;
      return undefined;
    }

    const target = this.resolveThreatPlayerForMonster(monster, targetId);
    monster.targetPlayerId = target?.id;
    return target ?? undefined;
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
    const respawnPlacement = this.mapService.resolveDefaultPlayerSpawnPosition(player.id);
    this.navigationService.clearMoveTarget(player.id);
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

  private findNextAttackApproachStep(
    mapId: string,
    actor: { x: number; y: number },
    target: ResolvedTarget,
    range: number,
    occupancyId: string,
    actorType: 'player' | 'monster',
  ): { x: number; y: number } | null {
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
      const leftDistance = gridDistance(left, target);
      const rightDistance = gridDistance(right, target);
      return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
    });
    return goals;
  }

  private moveActorTo(
    mapId: string,
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

  private resolveFacing(fromX: number, fromY: number, toX: number, toY: number): Direction {
    if (toX > fromX) return Direction.East;
    if (toX < fromX) return Direction.West;
    if (toY > fromY) return Direction.South;
    return Direction.North;
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

  private isMonsterWithinWanderRange(monster: RuntimeMonster, x: number, y: number): boolean {
    const radius = Math.max(0, monster.wanderRadius);
    return isOffsetInRange(x - monster.spawnX, y - monster.spawnY, radius);
  }

  private stepMonsterIdleRoam(monster: RuntimeMonster): Direction | null {
    const radius = Math.max(0, monster.wanderRadius);
    if (radius <= 0) {
      return null;
    }
    const directions = [
      { dx: 1, dy: 0, facing: Direction.East },
      { dx: -1, dy: 0, facing: Direction.West },
      { dx: 0, dy: 1, facing: Direction.South },
      { dx: 0, dy: -1, facing: Direction.North },
    ];
    const startIndex = Math.floor(Math.random() * directions.length);
    for (let offset = 0; offset < directions.length; offset += 1) {
      const direction = directions[(startIndex + offset) % directions.length]!;
      const nextX = monster.x + direction.dx;
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

  private getPlayerThreatId(player: PlayerState): string {
    return `player:${player.id}`;
  }

  private getMonsterThreatId(monster: RuntimeMonster): string {
    return monster.runtimeId;
  }

  getVisibleThreatArrowRefs(mapIds: string[], visibleEntityIds: Set<string>): Array<{ ownerId: string; targetId: string }> {
    const refs: Array<{ ownerId: string; targetId: string }> = [];
    const seen = new Set<string>();

    const pushRef = (ownerId: string, targetId?: string): void => {
      if (!targetId || !visibleEntityIds.has(ownerId) || !visibleEntityIds.has(targetId) || ownerId === targetId) {
        return;
      }
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

  private getExtraAggroRate(target: PlayerState | RuntimeMonster): number {
    return target.numericStats?.extraAggroRate ?? 0;
  }

  private getAggroThreshold(_owner: PlayerState | RuntimeMonster): number {
    return gameplayConstants.DEFAULT_AGGRO_THRESHOLD;
  }

  private addThreatToTarget(
    ownerId: string,
    ownerPosition: { x: number; y: number },
    target: ResolvedTarget,
    baseThreat: number,
  ): void {
    if (target.kind === 'tile') {
      return;
    }
    const targetId = target.kind === 'monster'
      ? this.getMonsterThreatId(target.monster)
      : this.getPlayerThreatId(target.player);
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
    this.refreshPlayerThreats(player, effectiveViewRange);
    const ownerId = this.getPlayerThreatId(player);
    const threshold = this.getAggroThreshold(player);
    const targetId = this.threatService.getHighestAttackableThreatTarget(ownerId, (candidateId) => {
      if (this.threatService.getThreat(ownerId, candidateId) < threshold) {
        return false;
      }
      const target = this.resolveThreatTargetForPlayer(player, candidateId);
      if (!target || target.kind === 'tile') {
        return false;
      }
      return stationaryMode
        ? this.canPlayerCastAutoBattleSkillFromCurrentPosition(player, target, effectiveViewRange, availableSkills)
        : this.canPlayerAttackTarget(player, target, effectiveViewRange, preferredRange);
    });
    if (!targetId) {
      return undefined;
    }
    return this.resolveThreatTargetForPlayer(player, targetId) ?? undefined;
  }

  private collectAutoBattleSkillCandidates(player: PlayerState): AutoBattleSkillCandidate[] {
    const skillActionMap = new Map(
      player.actions
        .filter((action) => action.type === 'skill')
        .map((action) => [action.id, action] as const),
    );

    return player.autoBattleSkills
      .filter((entry) => entry.enabled && entry.skillEnabled !== false)
      .map((entry) => skillActionMap.get(entry.skillId))
      .filter((action): action is ActionDef => action !== undefined && action.skillEnabled !== false && action.cooldownLeft === 0)
      .map((action) => {
        const skill = this.contentService.getSkill(action.id);
        return skill ? { action, skill } : null;
      })
      .filter((entry): entry is AutoBattleSkillCandidate => entry !== null)
      .filter((entry) => this.canPlayerCastSkill(player, entry.skill));
  }

  private resolveAutoBattlePreferredRange(skills: AutoBattleSkillCandidate[]): number {
    return skills.reduce((maxRange, entry) => Math.max(maxRange, Math.max(1, entry.skill.range)), 1);
  }

  private selectAutoBattleSkillForTarget(
    player: PlayerState,
    target: ResolvedTarget,
    skills: AutoBattleSkillCandidate[],
  ): AutoBattleSkillCandidate | undefined {
    return skills.find((entry) => isPointInRange(player, target, entry.skill.range));
  }

  private canPlayerCastAutoBattleSkillFromCurrentPosition(
    player: PlayerState,
    target: ResolvedTarget,
    effectiveViewRange: number,
    skills: AutoBattleSkillCandidate[],
  ): boolean {
    if (target.kind === 'tile') {
      return false;
    }
    if (!this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return false;
    }
    return isPointInRange(player, target, 1)
      || skills.some((entry) => isPointInRange(player, target, entry.skill.range));
  }

  private refreshPlayerThreats(player: PlayerState, effectiveViewRange: number): void {
    const ownerId = this.getPlayerThreatId(player);
    for (const monster of this.monstersByMap.get(player.mapId) ?? []) {
      if (!monster.alive) continue;
      if (!this.canPlayerSeeTarget(player, { kind: 'monster', x: monster.x, y: monster.y, monster }, effectiveViewRange)) {
        continue;
      }
      this.threatService.addThreat({
        ownerId,
        targetId: this.getMonsterThreatId(monster),
        baseThreat: gameplayConstants.DEFAULT_PASSIVE_THREAT_PER_TICK,
        targetExtraAggroRate: this.getExtraAggroRate(monster),
        distance: gridDistance(player, monster),
      });
    }

    for (const entry of this.threatService.getThreatEntries(ownerId)) {
      const target = this.resolveThreatTargetForPlayer(player, entry.targetId);
      if (!target || target.kind === 'tile' || !this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
        this.threatService.decayThreat(ownerId, entry.targetId, player.maxHp);
      }
    }
  }

  private resolveThreatTargetForPlayer(player: PlayerState, targetId: string): ResolvedTarget | null {
    return this.resolveTargetRef(player, targetId);
  }

  private canPlayerAttackTarget(
    player: PlayerState,
    target: ResolvedTarget,
    effectiveViewRange: number,
    range: number,
  ): boolean {
    if (target.kind === 'tile') {
      return false;
    }
    if (!this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return false;
    }
    return this.canReachAttackPosition(player.mapId, player, target, range, player.id, 'player');
  }

  private refreshMonsterThreats(
    monster: RuntimeMonster,
    players: PlayerState[],
    timeState: GameTimeState,
  ): void {
    const ownerId = this.getMonsterThreatId(monster);
    const scanRange = Math.max(0, Math.min(monster.aggroRange, timeState.effectiveViewRange));

    if (this.isMonsterAutoAggroEnabled(monster, timeState)) {
      for (const player of players) {
        if (!this.canMonsterSeeTarget(monster, player, timeState, scanRange)) {
          continue;
        }
        this.threatService.addThreat({
          ownerId,
          targetId: this.getPlayerThreatId(player),
          baseThreat: gameplayConstants.DEFAULT_PASSIVE_THREAT_PER_TICK,
          targetExtraAggroRate: this.getExtraAggroRate(player),
          distance: gridDistance(monster, player),
        });
      }
    }

    for (const entry of this.threatService.getThreatEntries(ownerId)) {
      const target = this.resolveThreatPlayerForMonster(monster, entry.targetId);
      if (!target || !this.canMonsterSeeTarget(monster, target, timeState, scanRange)) {
        this.threatService.decayThreat(ownerId, entry.targetId, monster.maxHp);
      }
    }
  }

  private resolveThreatPlayerForMonster(monster: RuntimeMonster, targetId: string): PlayerState | null {
    if (!targetId.startsWith('player:')) {
      return null;
    }
    const playerId = targetId.slice('player:'.length);
    const player = this.playerService.getPlayer(playerId);
    if (!player || player.dead || player.mapId !== monster.mapId) {
      return null;
    }
    return player;
  }

  private canMonsterSeeTarget(
    monster: RuntimeMonster,
    target: PlayerState,
    timeState: GameTimeState,
    scanRange: number,
  ): boolean {
    if (target.dead || target.mapId !== monster.mapId) {
      return false;
    }
    if (!isPointInRange(monster, target, scanRange)) {
      return false;
    }
    return this.aoiService.inViewAt(
      monster.mapId,
      monster.x,
      monster.y,
      timeState.effectiveViewRange,
      target.x,
      target.y,
      monster.runtimeId,
    );
  }

  private canMonsterAttackTarget(
    monster: RuntimeMonster,
    target: PlayerState,
    timeState: GameTimeState,
  ): boolean {
    const scanRange = Math.max(0, Math.min(monster.aggroRange, timeState.effectiveViewRange));
    if (!this.canMonsterSeeTarget(monster, target, timeState, scanRange)) {
      return false;
    }
    return this.canReachAttackPosition(
      monster.mapId,
      monster,
      { kind: 'player', x: target.x, y: target.y, player: target },
      1,
      monster.runtimeId,
      'monster',
    );
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
    const dirty = new Set<WorldDirtyFlag>(cultivation.dirty as WorldDirtyFlag[]);
    const result = this.mapService.damageTile(player.mapId, x, y, damage);
    if (!result) {
      return { ...EMPTY_UPDATE, error: '该目标无法被攻击' };
    }
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
      text: `-${appliedDamage}`,
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
        text: `${skillName}击中${targetName}，造成 ${appliedDamage} 点伤害。`,
        kind: 'combat',
      },
    ];
    if (ORE_REWARD_ITEM_ID_BY_TILE[result.targetType]) {
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

  private tryGrantOreReward(
    player: PlayerState,
    x: number,
    y: number,
    tileType: TileType,
    appliedDamage: number,
  ): WorldUpdate {
    const chanceBps = this.getOreRewardChanceBps(tileType, appliedDamage);
    if (chanceBps <= 0 || Math.random() * 10000 >= chanceBps) {
      return EMPTY_UPDATE;
    }

    const rewardItemId = ORE_REWARD_ITEM_ID_BY_TILE[tileType];
    if (!rewardItemId) {
      return EMPTY_UPDATE;
    }

    const reward = this.contentService.createItem(rewardItemId, 1);
    if (!reward) {
      this.logger.warn(`${tileType} 奖励物品缺失: ${rewardItemId}`);
      return EMPTY_UPDATE;
    }

    if (this.inventoryService.addItem(player, reward)) {
      return {
        messages: [{
          playerId: player.id,
          text: `${reward.name} 从矿脉中震落而出 x${reward.count}。`,
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

  private getOreRewardChanceBps(tileType: TileType, appliedDamage: number): number {
    const baseChanceBps = ORE_REWARD_BASE_CHANCE_BPS_BY_TILE[tileType] ?? 0;
    if (baseChanceBps <= 0) {
      return 0;
    }
    const normalizedDamage = Math.max(0, Math.floor(appliedDamage));
    if (normalizedDamage < ORE_REWARD_BASE_DAMAGE) {
      return Math.min(10000, Math.max(1, Math.round(baseChanceBps / 2)));
    }

    let chanceBps = baseChanceBps;
    let nextThreshold = ORE_REWARD_BASE_DAMAGE;
    while (normalizedDamage >= nextThreshold * ORE_REWARD_DAMAGE_SCALE) {
      chanceBps += baseChanceBps;
      nextThreshold *= ORE_REWARD_DAMAGE_SCALE;
    }
    return Math.min(10000, chanceBps);
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

  private faceToward(entity: { x: number; y: number; facing?: Direction }, targetX: number, targetY: number) {
    const dx = targetX - entity.x;
    const dy = targetY - entity.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      entity.facing = dx > 0 ? Direction.East : Direction.West;
      return;
    }
    if (dy !== 0) {
      entity.facing = dy > 0 ? Direction.South : Direction.North;
    }
  }

  private performBasicAttack(player: PlayerState, target: ResolvedTarget): WorldUpdate {
    const safeZoneAttackError = this.getSafeZoneAttackBlockError(player);
    if (safeZoneAttackError) {
      return { ...EMPTY_UPDATE, error: safeZoneAttackError };
    }
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

  private ensurePlayerCanStartSkillAttack(player: PlayerState, skill: SkillDef): string | undefined {
    if (!this.isHostileSkill(skill)) {
      return undefined;
    }
    return this.getSafeZoneAttackBlockError(player);
  }

  private isHostileSkill(skill: SkillDef): boolean {
    return skill.effects.some((effect) => effect.type === 'damage' || (effect.type === 'buff' && effect.target === 'target'));
  }

  private getSafeZoneAttackBlockError(player: Pick<PlayerState, 'mapId' | 'x' | 'y'>): string | undefined {
    return this.mapService.isPointInSafeZone(player.mapId, player.x, player.y)
      ? '安全区内无法发起攻击。'
      : undefined;
  }

  private movePlayerToInitialSpawn(
    player: PlayerState,
    messageText: string,
    options: { restoreVitals: boolean; clearBuffs: boolean },
  ): WorldUpdate {
    const spawn = this.mapService.resolveDefaultPlayerSpawnPosition(player.id);
    this.navigationService.clearMoveTarget(player.id);
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.mapId = spawn.mapId;
    player.x = spawn.x;
    player.y = spawn.y;
    player.facing = Direction.South;
    if (options.clearBuffs) {
      player.temporaryBuffs = [];
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

  async persistMonsterRuntimeState(): Promise<void> {
    if (!this.monsterRuntimeDirty) {
      return;
    }

    try {
      const snapshot: PersistedMonsterRuntimeSnapshot = {
        version: 2,
        maps: {},
      };

      const mapIds = new Set<string>([
        ...this.persistedMonstersByMap.keys(),
        ...this.monstersByMap.keys(),
      ]);

      for (const mapId of [...mapIds].sort((left, right) => left.localeCompare(right, 'zh-CN'))) {
        const allowedRuntimeIds = this.buildAllowedMonsterRuntimeIds(mapId);
        if (allowedRuntimeIds.size === 0) {
          continue;
        }

        const current = this.monstersByMap.get(mapId);
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
      }

      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_MONSTER_RUNTIME_DOCUMENT_KEY, snapshot);
      this.monsterRuntimeDirty = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`怪物运行时持久化到 PostgreSQL 失败: ${message}`);
    }
  }

  private async loadPersistedMonsterRuntimeState(): Promise<void> {
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

      let restoredCount = 0;
      for (const [mapId, rawRecords] of Object.entries(snapshot.maps)) {
        if (!Array.isArray(rawRecords)) {
          continue;
        }

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

      if (restoredCount > 0) {
        this.logger.log(`已恢复怪物运行时状态：${restoredCount} 个实例`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`读取怪物运行时持久化数据失败: ${message}`);
    }
  }

  private async importLegacyMonsterRuntimeStateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.monsterRuntimeStatePath)) {
      return;
    }

    try {
      const snapshot = JSON.parse(fs.readFileSync(this.monsterRuntimeStatePath, 'utf-8')) as PersistedMonsterRuntimeSnapshot;
      await this.persistentDocumentService.save(RUNTIME_STATE_SCOPE, MAP_MONSTER_RUNTIME_DOCUMENT_KEY, snapshot);
      this.logger.log('已从旧怪物运行时 JSON 导入 PostgreSQL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`导入旧怪物运行时 JSON 失败: ${message}`);
    }
  }

  private buildAllowedMonsterRuntimeIds(mapId: string): Set<string> {
    const result = new Set<string>();
    for (const spawn of this.mapService.getMonsterSpawns(mapId)) {
      for (let index = 0; index < spawn.maxAlive; index += 1) {
        result.add(this.buildMonsterRuntimeId(mapId, spawn.id, spawn.x, spawn.y, index));
      }
    }
    return result;
  }

  private buildMonsterRuntimeId(
    mapId: string,
    spawnId: string,
    spawnX: number,
    spawnY: number,
    index: number,
  ): string {
    return `monster:${mapId}:${spawnId}:${spawnX}:${spawnY}:${index}`;
  }

  private captureMonsterRuntimeState(monsters: RuntimeMonster[]): Map<string, PersistedMonsterRuntimeRecord> {
    const result = new Map<string, PersistedMonsterRuntimeRecord>();
    for (const monster of monsters) {
      result.set(monster.runtimeId, this.captureMonsterRuntimeRecord(monster));
    }
    return result;
  }

  private captureMonsterRuntimeRecord(monster: RuntimeMonster): PersistedMonsterRuntimeRecord {
    return {
      runtimeId: monster.runtimeId,
      x: monster.x,
      y: monster.y,
      hp: monster.hp,
      qi: monster.qi,
      alive: monster.alive,
      respawnLeft: monster.respawnLeft,
      temporaryBuffs: monster.temporaryBuffs.length > 0
        ? JSON.parse(JSON.stringify(monster.temporaryBuffs)) as TemporaryBuffState[]
        : undefined,
      skillCooldowns: Object.keys(monster.skillCooldowns).length > 0
        ? { ...monster.skillCooldowns }
        : undefined,
      damageContributors: monster.damageContributors.size > 0
        ? Object.fromEntries([...monster.damageContributors.entries()].map(([playerId, damage]) => [playerId, damage]))
        : undefined,
      facing: monster.facing,
      targetPlayerId: monster.targetPlayerId,
    };
  }

  private applyPersistedMonsterState(
    mapId: string,
    runtime: RuntimeMonster,
    persisted: PersistedMonsterRuntimeRecord,
  ): void {
    runtime.hp = Math.max(0, Math.min(runtime.maxHp, Math.round(persisted.hp)));
    runtime.qi = Math.max(0, Math.min(Math.max(0, Math.round(runtime.numericStats.maxQi)), Math.round(persisted.qi ?? runtime.qi)));
    runtime.facing = persisted.facing;
    runtime.targetPlayerId = typeof persisted.targetPlayerId === 'string' ? persisted.targetPlayerId : undefined;
    runtime.temporaryBuffs = (persisted.temporaryBuffs ?? [])
      .map((buff) => this.normalizePersistedTemporaryBuffState(buff))
      .filter((buff): buff is TemporaryBuffState => buff !== null);
    runtime.skillCooldowns = Object.fromEntries(
      Object.entries(persisted.skillCooldowns ?? {})
        .filter(([, ticks]) => Number.isFinite(ticks) && Number(ticks) > 0)
        .map(([skillId, ticks]) => [skillId, Math.max(1, Math.round(Number(ticks)))])
    );
    runtime.damageContributors = new Map<string, number>(
      Object.entries(persisted.damageContributors ?? {})
        .filter(([, damage]) => Number.isFinite(damage) && Number(damage) > 0)
        .map(([playerId, damage]) => [playerId, Math.max(1, Math.round(Number(damage)))]),
    );

    const canRestoreAlive = persisted.alive === true && runtime.hp > 0;
    const preferredX = Number.isInteger(persisted.x) ? Number(persisted.x) : runtime.spawnX;
    const preferredY = Number.isInteger(persisted.y) ? Number(persisted.y) : runtime.spawnY;
    if (canRestoreAlive && this.mapService.isWalkable(mapId, preferredX, preferredY, { actorType: 'monster' })) {
      runtime.x = preferredX;
      runtime.y = preferredY;
      runtime.alive = true;
      runtime.respawnLeft = 0;
      this.mapService.addOccupant(mapId, runtime.x, runtime.y, runtime.runtimeId, 'monster');
      return;
    }

    const fallbackPos = canRestoreAlive ? this.findSpawnPosition(mapId, runtime) : null;
    if (canRestoreAlive && fallbackPos && this.mapService.isWalkable(mapId, fallbackPos.x, fallbackPos.y, { actorType: 'monster' })) {
      runtime.x = fallbackPos.x;
      runtime.y = fallbackPos.y;
      runtime.alive = true;
      runtime.respawnLeft = 0;
      this.mapService.addOccupant(mapId, runtime.x, runtime.y, runtime.runtimeId, 'monster');
      return;
    }

    runtime.x = preferredX;
    runtime.y = preferredY;
    runtime.alive = false;
    runtime.respawnLeft = Math.max(1, Number.isFinite(persisted.respawnLeft) ? Math.round(persisted.respawnLeft) : runtime.respawnTicks);
  }

  private normalizePersistedMonsterRuntimeRecord(raw: unknown): PersistedMonsterRuntimeRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<PersistedMonsterRuntimeRecord>;
    if (
      typeof candidate.runtimeId !== 'string'
      || !Number.isInteger(candidate.x)
      || !Number.isInteger(candidate.y)
      || !Number.isFinite(candidate.hp)
      || typeof candidate.alive !== 'boolean'
      || !Number.isFinite(candidate.respawnLeft)
    ) {
      return null;
    }

    return {
      runtimeId: candidate.runtimeId,
      x: Number(candidate.x),
      y: Number(candidate.y),
      hp: Math.max(0, Math.round(Number(candidate.hp))),
      qi: Number.isFinite(candidate.qi) ? Math.max(0, Math.round(Number(candidate.qi))) : undefined,
      alive: candidate.alive,
      respawnLeft: Math.max(0, Math.round(Number(candidate.respawnLeft))),
      temporaryBuffs: Array.isArray(candidate.temporaryBuffs)
        ? candidate.temporaryBuffs
            .map((buff) => this.normalizePersistedTemporaryBuffState(buff))
            .filter((buff): buff is TemporaryBuffState => buff !== null)
        : undefined,
      skillCooldowns: candidate.skillCooldowns && typeof candidate.skillCooldowns === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.skillCooldowns)
              .filter(([, ticks]) => Number.isFinite(ticks) && Number(ticks) > 0)
              .map(([skillId, ticks]) => [skillId, Math.max(1, Math.round(Number(ticks)))])
          )
        : undefined,
      damageContributors: candidate.damageContributors && typeof candidate.damageContributors === 'object'
        ? Object.fromEntries(
            Object.entries(candidate.damageContributors)
              .filter(([, damage]) => Number.isFinite(damage) && Number(damage) > 0)
              .map(([playerId, damage]) => [playerId, Math.max(1, Math.round(Number(damage)))]),
          )
        : undefined,
      facing: candidate.facing,
      targetPlayerId: typeof candidate.targetPlayerId === 'string' ? candidate.targetPlayerId : undefined,
    };
  }

  private normalizePersistedTemporaryBuffState(raw: unknown): TemporaryBuffState | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

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
    })) as TemporaryBuffState;
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
