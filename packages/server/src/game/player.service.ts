/**
 * 玩家服务 —— 管理所有已加载玩家的内存状态、Socket 映射、命令队列、
 * 脏标记系统，以及与 PG/Redis 的存档读写。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  buildDefaultCombatTargetingRules,
  hasCombatTargetingRule,
  normalizeCombatTargetingRules,
  PlayerState,
  PendingLogbookMessage,
  Attributes,
  AttrBonus,
  Inventory,
  EquipmentSlots,
  TechniqueState,
  TemporaryBuffState,
  ActionDef,
  AutoBattleSkillConfig,
  normalizeAutoUsePillConfigs,
  normalizeAutoBattleTargetingMode,
  normalizeAlchemySkillState,
  normalizePlayerAlchemyJob,
  normalizePlayerAlchemyPresets,
  normalizePlayerEnhancementJob,
  QuestState,
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  MonsterTier,
  normalizeBoneAgeBaseYears,
  normalizeLifeElapsedTicks,
  normalizeLifespanYears,
  isRoleNameWithinLimit,
  truncateRoleName,
  DEFAULT_INVISIBLE_ROLE_NAME_BASE,
  DEFAULT_VISIBLE_DISPLAY_NAME,
  hasVisibleNameGrapheme,
  VIEW_RADIUS,
  clonePlainValue,
  isPlainEqual,
  S2C,
  S2C_SystemMsg,
} from '@mud/shared';
import { Socket } from 'socket.io';
import { PlayerEntity } from '../database/entities/player.entity';
import { PlayerCollectionsEntity } from '../database/entities/player-collections.entity';
import { PlayerSettingsEntity } from '../database/entities/player-settings.entity';
import { PlayerPresenceEntity } from '../database/entities/player-presence.entity';
import { UserEntity } from '../database/entities/user.entity';
import { RedisService } from '../database/redis.service';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { resolveQuestTargetName } from './quest-display';
import { EquipmentService } from './equipment.service';
import { TechniqueService } from './technique.service';
import {
  normalizeDisplayName,
  resolveDisplayName,
  validateDisplayName,
} from '../auth/account-validation';
import { MAX_PENDING_LOGBOOK_MESSAGES } from '../constants/gameplay/logbook';
import {
  buildPersistedPlayerCollections,
  hydrateBodyTrainingSnapshot,
  hydrateEquipmentSnapshot,
  hydrateInventorySnapshot,
  hydrateMarketStorageSnapshot,
  hydrateQuestSnapshots,
  hydrateTemporaryBuffSnapshots,
  hydrateTechniqueSnapshots,
} from './player-storage';

/** 即时执行的操作类型（不入队，gateway 收到后直接执行） */
export type ImmediateCommandType = 'equip' | 'unequip' | 'sortInventory' | 'useItem' | 'dropItem' | 'destroyItem' | 'cultivate' | 'updateAutoBattleSkills' | 'updateAutoUsePills' | 'updateCombatTargetingRules' | 'updateAutoBattleTargetingMode' | 'updateTechniqueSkillAvailability';

/** 玩家指令，由客户端消息转化后入队，在 tick 中统一执行 */
export interface PlayerCommand {
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** type：定义该变量以承载业务值。 */
  type: 'move' | 'moveTo' | 'navigateQuest' | 'navigateMapPoint' | 'action' | 'takeLoot' | 'closeLootWindow' | 'stopLootHarvest' | 'debugResetSpawn' | 'buyNpcShopItem' | 'saveAlchemyPreset' | 'deleteAlchemyPreset' | 'startAlchemy' | 'cancelAlchemy' | 'startEnhancement' | 'cancelEnhancement' | 'mailRead' | 'mailClaim' | 'mailDelete' | 'redeemCodes';
/** data：定义该变量以承载业务值。 */
  data: unknown;
/** timestamp：定义该变量以承载业务值。 */
  timestamp: number;
}

/** 数据变更类型标记，用于增量同步 */
export type DirtyFlag = 'attr' | 'inv' | 'equip' | 'tech' | 'actions' | 'loot' | 'quest';

/** PLAYER_PERSIST_CONCURRENCY：定义该变量以承载业务值。 */
const PLAYER_PERSIST_CONCURRENCY = 8;
/** USER_BIGINT_PERSIST_COLUMNS：定义该变量以承载业务值。 */
const USER_BIGINT_PERSIST_COLUMNS = [
  'totalOnlineSeconds',
] as const;
/** PLAYER_BIGINT_PERSIST_COLUMNS：定义该变量以承载业务值。 */
const PLAYER_BIGINT_PERSIST_COLUMNS = [
  'foundation',
  'combatExp',
  'playerKillCount',
  'monsterKillCount',
  'eliteMonsterKillCount',
  'bossMonsterKillCount',
  'deathCount',
] as const;

interface PlayerCorePersistenceSnapshot {
  name: string;
  mapId: string;
  respawnMapId: string;
  x: number;
  y: number;
  facing: number;
  viewRange: number;
  hp: number;
  maxHp: number;
  qi: number;
  dead: boolean;
  foundation: number;
  combatExp: number;
  playerKillCount: number;
  monsterKillCount: number;
  eliteMonsterKillCount: number;
  bossMonsterKillCount: number;
  deathCount: number;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears: number | null;
  baseAttrs: unknown;
  bonuses: unknown;
  questCrossMapNavCooldownUntilLifeTicks: number;
  revealedBreakthroughRequirementIds: unknown;
  heavenGate: unknown | null;
  spiritualRoots: unknown | null;
}

interface PlayerPresencePersistenceSnapshot {
  online: boolean;
  inWorld: boolean;
  lastHeartbeatAt: Date | null;
  offlineSinceAt: Date | null;
}

interface PlayerCollectionsPersistenceSnapshot {
  temporaryBuffs: unknown;
  inventory: unknown;
  marketStorage: unknown;
  equipment: unknown;
  techniques: unknown;
  bodyTraining: unknown;
  quests: unknown;
}

interface PlayerSettingsPersistenceSnapshot {
  unlockedMinimapIds: unknown;
  alchemySkill: unknown;
  gatherSkill: unknown;
  alchemyPresets: unknown;
  alchemyJob: unknown | null;
  enhancementSkillLevel: number;
  enhancementJob: unknown | null;
  enhancementRecords: unknown;
  autoBattle: boolean;
  autoBattleSkills: unknown;
  autoUsePills: unknown;
  combatTargetingRules: unknown;
  autoBattleTargetingMode: string;
  combatTargetId: string | null;
  combatTargetLocked: boolean;
  autoRetaliate: boolean | undefined;
  autoBattleStationary: boolean;
  allowAoePlayerHit: boolean;
  autoIdleCultivation: boolean | undefined;
  autoSwitchCultivation: boolean;
  cultivatingTechId: string | null;
}

interface PlayerPersistedGroups {
  collections: PlayerCollectionsEntity | null;
  settings: PlayerSettingsEntity | null;
  presence: PlayerPresenceEntity | null;
}

/** normalizeUnlockedMinimapIds：执行对应的业务逻辑。 */
function normalizeUnlockedMinimapIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))].sort();
}

/** normalizeNonNegativeCounter：执行对应的业务逻辑。 */
function normalizeNonNegativeCounter(value: unknown): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : 0);
}

/** isPendingLogbookMessage：执行对应的业务逻辑。 */
function isPendingLogbookMessage(value: unknown): value is PendingLogbookMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<PendingLogbookMessage>;
  return typeof candidate.id === 'string'
    && candidate.kind === 'grudge'
    && typeof candidate.text === 'string'
    && (candidate.from === undefined || typeof candidate.from === 'string')
    && Number.isFinite(candidate.at);
}

@Injectable()
/** PlayerService：封装相关状态与行为。 */
export class PlayerService implements OnModuleInit {
/** players：定义该变量以承载业务值。 */
  private players: Map<string, PlayerState> = new Map();
/** commands：定义该变量以承载业务值。 */
  private commands: Map<string, PlayerCommand[]> = new Map();
/** socketMap：定义该变量以承载业务值。 */
  private socketMap: Map<string, Socket> = new Map();
/** userToPlayer：定义该变量以承载业务值。 */
  private userToPlayer: Map<string, string> = new Map();
/** onlineSessionStartedAtByUserId：定义该变量以承载业务值。 */
  private onlineSessionStartedAtByUserId: Map<string, number> = new Map();
/** dirtyFlags：定义该变量以承载业务值。 */
  private dirtyFlags: Map<string, Set<DirtyFlag>> = new Map();
/** pendingLogbookPersistions：定义该变量以承载业务值。 */
  private pendingLogbookPersistions: Map<string, Promise<void>> = new Map();
/** pendingPresencePersistions：定义该变量以承载业务值。 */
  private pendingPresencePersistions: Map<string, Promise<void>> = new Map();
/** lastPersistedCoreSnapshots：定义该变量以承载业务值。 */
  private lastPersistedCoreSnapshots: Map<string, PlayerCorePersistenceSnapshot> = new Map();
/** lastPersistedCollectionsSnapshots：定义该变量以承载业务值。 */
  private lastPersistedCollectionsSnapshots: Map<string, PlayerCollectionsPersistenceSnapshot> = new Map();
/** lastPersistedSettingsSnapshots：定义该变量以承载业务值。 */
  private lastPersistedSettingsSnapshots: Map<string, PlayerSettingsPersistenceSnapshot> = new Map();
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(PlayerCollectionsEntity)
    private readonly playerCollectionsRepo: Repository<PlayerCollectionsEntity>,
    @InjectRepository(PlayerSettingsEntity)
    private readonly playerSettingsRepo: Repository<PlayerSettingsEntity>,
    @InjectRepository(PlayerPresenceEntity)
    private readonly playerPresenceRepo: Repository<PlayerPresenceEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly redisService: RedisService,
    private readonly contentService: ContentService,
    private readonly mapService: MapService,
    private readonly equipmentService: EquipmentService,
    private readonly techniqueService: TechniqueService,
  ) {}

/** onModuleInit：执行对应的业务逻辑。 */
  async onModuleInit(): Promise<void> {
    await this.ensureUserCounterColumnCapacity();
    await this.ensurePlayerCounterColumnCapacity();
    await this.ensureDisplayNameUniquenessPolicy();
    await this.ensureSplitPlayerPersistenceBackfilled();
    await this.normalizePersistedRoleNames();
  }

  /** 标记玩家数据变更 */
  markDirty(playerId: string, flag: DirtyFlag) {
/** set：定义该变量以承载业务值。 */
    let set = this.dirtyFlags.get(playerId);
    if (!set) {
      set = new Set();
      this.dirtyFlags.set(playerId, set);
    }
    set.add(flag);
  }

/** getDirtyFlags：执行对应的业务逻辑。 */
  getDirtyFlags(playerId: string): Set<DirtyFlag> | undefined {
    return this.dirtyFlags.get(playerId);
  }

/** clearDirtyFlags：处理当前场景中的对应操作。 */
  clearDirtyFlags(playerId: string) {
    this.dirtyFlags.delete(playerId);
  }

/** buildPersistedCollections：处理当前场景中的对应操作。 */
  private buildPersistedCollections(state: PlayerState) {
    return buildPersistedPlayerCollections(state, this.contentService, this.mapService);
  }

  private buildPlayerCollectionsPersistenceSnapshot(
    persisted: ReturnType<PlayerService['buildPersistedCollections']>,
  ): PlayerCollectionsPersistenceSnapshot {
    return {
      temporaryBuffs: persisted.temporaryBuffs as any,
      inventory: persisted.inventory as any,
      marketStorage: persisted.marketStorage as any,
      equipment: persisted.equipment as any,
      techniques: persisted.techniques as any,
      bodyTraining: persisted.bodyTraining as any,
      quests: persisted.quests as any,
    };
  }

  private buildPlayerSettingsPersistenceSnapshot(state: PlayerState): PlayerSettingsPersistenceSnapshot {
    this.normalizePersistedTechniqueState(state);
    return {
      unlockedMinimapIds: state.unlockedMinimapIds as any,
      alchemySkill: state.alchemySkill as any,
      gatherSkill: state.gatherSkill as any,
      alchemyPresets: (state.alchemyPresets ?? []) as any,
      alchemyJob: clonePlainValue(state.alchemyJob ?? null),
      enhancementSkillLevel: Math.max(1, Math.floor(Number(state.enhancementSkill?.level ?? state.enhancementSkillLevel) || 1)),
      enhancementJob: clonePlainValue(state.enhancementJob ?? null),
      enhancementRecords: (state.enhancementSkill ?? null) as any,
      autoBattle: state.autoBattle,
      autoBattleSkills: state.autoBattleSkills as any,
      autoUsePills: (state.autoUsePills ?? []) as any,
      combatTargetingRules: state.combatTargetingRules as any,
      autoBattleTargetingMode: normalizeAutoBattleTargetingMode(state.autoBattleTargetingMode),
      combatTargetId: state.combatTargetId ?? null,
      combatTargetLocked: state.combatTargetLocked === true,
      autoRetaliate: state.autoRetaliate,
      autoBattleStationary: state.autoBattleStationary === true,
      allowAoePlayerHit: state.allowAoePlayerHit === true,
      autoIdleCultivation: state.autoIdleCultivation,
      autoSwitchCultivation: state.autoSwitchCultivation === true,
      cultivatingTechId: state.cultivatingTechId ?? null,
    };
  }

/** normalizePersistedTechniqueState：执行对应的业务逻辑。 */
  private normalizePersistedTechniqueState(state: PlayerState): void {
    state.heavenGate = this.techniqueService.normalizeHeavenGateState(state.heavenGate);
    state.spiritualRoots = this.techniqueService.normalizeHeavenGateRoots(state.spiritualRoots);
  }

/** toNullableJsonbValue：执行对应的业务逻辑。 */
  private toNullableJsonbValue(value: unknown): any {
    return value === null ? (() => "'null'::jsonb") : value;
  }

/** normalizePendingLogbookMessages：执行对应的业务逻辑。 */
  private normalizePendingLogbookMessages(value: unknown): PendingLogbookMessage[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(isPendingLogbookMessage)
      .slice(-MAX_PENDING_LOGBOOK_MESSAGES)
      .map((entry) => ({ ...entry }));
  }

/** toSystemMessage：执行对应的业务逻辑。 */
  private toSystemMessage(entry: PendingLogbookMessage): S2C_SystemMsg {
    return {
      id: entry.id,
      text: entry.text,
      from: entry.from,
      kind: entry.kind,
      occurredAt: entry.at,
      persistUntilAck: true,
    };
  }

/** schedulePendingLogbookPersistence：执行对应的业务逻辑。 */
  private schedulePendingLogbookPersistence(playerId: string): void {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player || player.isBot) {
      return;
    }
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = (player.pendingLogbookMessages ?? []).map((entry) => ({ ...entry }));
/** previous：定义该变量以承载业务值。 */
    const previous = this.pendingLogbookPersistions.get(playerId) ?? Promise.resolve();
/** task：定义该变量以承载业务值。 */
    const task: Promise<void> = previous
      .catch(() => {})
      .then(async () => {
        await this.playerRepo.update(playerId, {
          pendingLogbookMessages: snapshot as any,
        });
      });
/** trackedTask：定义该变量以承载业务值。 */
    const trackedTask = task.finally(() => {
      if (this.pendingLogbookPersistions.get(playerId) === trackedTask) {
        this.pendingLogbookPersistions.delete(playerId);
      }
    });
    this.pendingLogbookPersistions.set(playerId, trackedTask);
  }

/** buildPlayerCorePersistenceSnapshot：处理当前场景中的对应操作。 */
  private buildPlayerCorePersistenceSnapshot(
    state: PlayerState,
  ): PlayerCorePersistenceSnapshot {
    this.normalizePersistedTechniqueState(state);
    return {
      name: state.name,
      mapId: state.mapId,
      respawnMapId: this.mapService.resolvePlayerRespawnMapId(state.respawnMapId),
      x: state.x,
      y: state.y,
      facing: state.facing,
      viewRange: state.viewRange,
      hp: state.hp,
      maxHp: state.maxHp,
      qi: state.qi,
      dead: state.dead,
      foundation: normalizeNonNegativeCounter(state.foundation),
      combatExp: normalizeNonNegativeCounter(state.combatExp),
      playerKillCount: state.playerKillCount ?? 0,
      monsterKillCount: state.monsterKillCount ?? 0,
      eliteMonsterKillCount: state.eliteMonsterKillCount ?? 0,
      bossMonsterKillCount: state.bossMonsterKillCount ?? 0,
      deathCount: state.deathCount ?? 0,
      boneAgeBaseYears: normalizeBoneAgeBaseYears(state.boneAgeBaseYears),
      lifeElapsedTicks: normalizeLifeElapsedTicks(state.lifeElapsedTicks),
      lifespanYears: normalizeLifespanYears(state.lifespanYears),
      baseAttrs: state.baseAttrs as any,
      bonuses: state.bonuses as any,
      questCrossMapNavCooldownUntilLifeTicks: state.questCrossMapNavCooldownUntilLifeTicks ?? 0,
      revealedBreakthroughRequirementIds: state.revealedBreakthroughRequirementIds as any,
      heavenGate: clonePlainValue(state.heavenGate ?? null),
      spiritualRoots: clonePlainValue(state.spiritualRoots ?? null),
    };
  }

  /** buildPlayerCorePersistencePayload：处理当前场景中的对应操作。 */
  private buildPlayerCorePersistencePayload(snapshot: PlayerCorePersistenceSnapshot) {
    return {
      mapId: snapshot.mapId,
      respawnMapId: snapshot.respawnMapId,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
      viewRange: snapshot.viewRange,
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      dead: snapshot.dead,
      foundation: snapshot.foundation,
      combatExp: snapshot.combatExp,
      playerKillCount: snapshot.playerKillCount,
      monsterKillCount: snapshot.monsterKillCount,
      eliteMonsterKillCount: snapshot.eliteMonsterKillCount,
      bossMonsterKillCount: snapshot.bossMonsterKillCount,
      deathCount: snapshot.deathCount,
      boneAgeBaseYears: snapshot.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.lifeElapsedTicks,
      lifespanYears: snapshot.lifespanYears,
      baseAttrs: snapshot.baseAttrs as any,
      bonuses: snapshot.bonuses as any,
      questCrossMapNavCooldownUntilLifeTicks: snapshot.questCrossMapNavCooldownUntilLifeTicks,
      revealedBreakthroughRequirementIds: snapshot.revealedBreakthroughRequirementIds as any,
      heavenGate: this.toNullableJsonbValue(snapshot.heavenGate),
      spiritualRoots: this.toNullableJsonbValue(snapshot.spiritualRoots),
    };
  }

  private buildPlayerCollectionsPersistencePayload(snapshot: PlayerCollectionsPersistenceSnapshot) {
    return {
      temporaryBuffs: snapshot.temporaryBuffs as any,
      inventory: snapshot.inventory as any,
      marketStorage: snapshot.marketStorage as any,
      equipment: snapshot.equipment as any,
      techniques: snapshot.techniques as any,
      bodyTraining: snapshot.bodyTraining as any,
      quests: snapshot.quests as any,
    };
  }

  private buildPlayerSettingsPersistencePayload(snapshot: PlayerSettingsPersistenceSnapshot) {
    return {
      unlockedMinimapIds: snapshot.unlockedMinimapIds as any,
      alchemySkill: snapshot.alchemySkill as any,
      gatherSkill: snapshot.gatherSkill as any,
      alchemyPresets: snapshot.alchemyPresets as any,
      alchemyJob: this.toNullableJsonbValue(snapshot.alchemyJob),
      enhancementSkillLevel: snapshot.enhancementSkillLevel,
      enhancementJob: this.toNullableJsonbValue(snapshot.enhancementJob),
      enhancementRecords: snapshot.enhancementRecords as any,
      autoBattle: snapshot.autoBattle,
      autoBattleSkills: snapshot.autoBattleSkills as any,
      autoUsePills: snapshot.autoUsePills as any,
      combatTargetingRules: snapshot.combatTargetingRules as any,
      autoBattleTargetingMode: snapshot.autoBattleTargetingMode,
      combatTargetId: snapshot.combatTargetId,
      combatTargetLocked: snapshot.combatTargetLocked,
      autoRetaliate: snapshot.autoRetaliate,
      autoBattleStationary: snapshot.autoBattleStationary,
      allowAoePlayerHit: snapshot.allowAoePlayerHit,
      autoIdleCultivation: snapshot.autoIdleCultivation,
      autoSwitchCultivation: snapshot.autoSwitchCultivation,
      cultivatingTechId: snapshot.cultivatingTechId,
    };
  }

  /** buildPlayerPresencePersistenceSnapshot：处理当前场景中的对应操作。 */
  private buildPlayerPresencePersistenceSnapshot(state: PlayerState): PlayerPresencePersistenceSnapshot {
    return {
      online: state.online === true,
      inWorld: state.inWorld !== false,
      lastHeartbeatAt: state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt) : null,
      offlineSinceAt: state.offlineSinceAt ? new Date(state.offlineSinceAt) : null,
    };
  }

  /** rememberPersistedCoreSnapshot：处理当前场景中的对应操作。 */
  private rememberPersistedCoreSnapshot(playerId: string, snapshot: PlayerCorePersistenceSnapshot): void {
    this.lastPersistedCoreSnapshots.set(playerId, clonePlainValue(snapshot));
  }

  private rememberPersistedCollectionsSnapshot(playerId: string, snapshot: PlayerCollectionsPersistenceSnapshot): void {
    this.lastPersistedCollectionsSnapshots.set(playerId, clonePlainValue(snapshot));
  }

  private rememberPersistedSettingsSnapshot(playerId: string, snapshot: PlayerSettingsPersistenceSnapshot): void {
    this.lastPersistedSettingsSnapshots.set(playerId, clonePlainValue(snapshot));
  }

  /** hasCorePersistenceSnapshotChanged：处理当前场景中的对应操作。 */
  private hasCorePersistenceSnapshotChanged(playerId: string, snapshot: PlayerCorePersistenceSnapshot): boolean {
    return !isPlainEqual(this.lastPersistedCoreSnapshots.get(playerId) ?? null, snapshot);
  }

  private hasCollectionsPersistenceSnapshotChanged(playerId: string, snapshot: PlayerCollectionsPersistenceSnapshot): boolean {
    return !isPlainEqual(this.lastPersistedCollectionsSnapshots.get(playerId) ?? null, snapshot);
  }

  private hasSettingsPersistenceSnapshotChanged(playerId: string, snapshot: PlayerSettingsPersistenceSnapshot): boolean {
    return !isPlainEqual(this.lastPersistedSettingsSnapshots.get(playerId) ?? null, snapshot);
  }

  /** schedulePlayerPresencePersistence：处理当前场景中的对应操作。 */
  private schedulePlayerPresencePersistence(playerId: string): void {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player || player.isBot) {
      return;
    }
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.buildPlayerPresencePersistenceSnapshot(player);
/** previous：定义该变量以承载业务值。 */
    const previous = this.pendingPresencePersistions.get(playerId) ?? Promise.resolve();
/** task：定义该变量以承载业务值。 */
    const task: Promise<void> = previous
      .catch(() => {})
      .then(async () => {
        await this.playerPresenceRepo.save(this.playerPresenceRepo.create({
          playerId,
          ...snapshot,
        }));
        await this.playerRepo.update(playerId, {
          online: snapshot.online,
          inWorld: snapshot.inWorld,
          lastHeartbeatAt: snapshot.lastHeartbeatAt,
          offlineSinceAt: snapshot.offlineSinceAt,
        });
      });
/** trackedTask：定义该变量以承载业务值。 */
    const trackedTask = task.finally(() => {
      if (this.pendingPresencePersistions.get(playerId) === trackedTask) {
        this.pendingPresencePersistions.delete(playerId);
      }
    });
    this.pendingPresencePersistions.set(playerId, trackedTask);
  }

  /** 将玩家状态同步到 Redis 缓存 */
  private syncPlayerCache(state: PlayerState): Promise<void> {
    return this.redisService.setPlayer(state, this.buildPersistedCollections(state));
  }

  private async ensureSplitPlayerPersistenceBackfilled(): Promise<void> {
    const players = await this.playerRepo.find();
    if (players.length === 0) {
      return;
    }
    const playerIds = players.map((player) => player.id);
    const [collectionsRows, settingsRows, presenceRows] = await Promise.all([
      this.playerCollectionsRepo.findBy({ playerId: In(playerIds) }),
      this.playerSettingsRepo.findBy({ playerId: In(playerIds) }),
      this.playerPresenceRepo.findBy({ playerId: In(playerIds) }),
    ]);
    const collectionIds = new Set(collectionsRows.map((row) => row.playerId));
    const settingsIds = new Set(settingsRows.map((row) => row.playerId));
    const presenceIds = new Set(presenceRows.map((row) => row.playerId));

    const collectionsToInsert = players
      .filter((player) => !collectionIds.has(player.id))
      .map((player) => this.playerCollectionsRepo.create({
        playerId: player.id,
        temporaryBuffs: player.temporaryBuffs,
        inventory: player.inventory,
        marketStorage: player.marketStorage,
        equipment: player.equipment,
        techniques: player.techniques,
        bodyTraining: player.bodyTraining,
        quests: player.quests,
      }));
    const settingsToInsert = players
      .filter((player) => !settingsIds.has(player.id))
      .map((player) => {
/** snapshot：定义该变量以承载业务值。 */
        const snapshot: PlayerSettingsPersistenceSnapshot = {
          unlockedMinimapIds: player.unlockedMinimapIds as any,
          alchemySkill: player.alchemySkill as any,
          gatherSkill: player.gatherSkill as any,
          alchemyPresets: (player.alchemyPresets ?? []) as any,
          alchemyJob: clonePlainValue(player.alchemyJob ?? null),
          enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkillLevel) || 1)),
          enhancementJob: clonePlainValue(player.enhancementJob ?? null),
          enhancementRecords: (player.enhancementRecords ?? null) as any,
          autoBattle: player.autoBattle === true,
          autoBattleSkills: (player.autoBattleSkills ?? []) as any,
          autoUsePills: (player.autoUsePills ?? []) as any,
          combatTargetingRules: player.combatTargetingRules as any,
          autoBattleTargetingMode: normalizeAutoBattleTargetingMode(player.autoBattleTargetingMode),
          combatTargetId: player.combatTargetId ?? null,
          combatTargetLocked: player.combatTargetLocked === true,
          autoRetaliate: player.autoRetaliate,
          autoBattleStationary: player.autoBattleStationary === true,
          allowAoePlayerHit: player.allowAoePlayerHit === true,
          autoIdleCultivation: player.autoIdleCultivation,
          autoSwitchCultivation: player.autoSwitchCultivation === true,
          cultivatingTechId: player.cultivatingTechId ?? null,
        };
        return this.playerSettingsRepo.create({
          playerId: player.id,
          ...this.buildPlayerSettingsPersistencePayload(snapshot),
        });
      });
    const presenceToInsert = players
      .filter((player) => !presenceIds.has(player.id))
      .map((player) => this.playerPresenceRepo.create({
        playerId: player.id,
        online: player.online,
        inWorld: player.inWorld,
        lastHeartbeatAt: player.lastHeartbeatAt,
        offlineSinceAt: player.offlineSinceAt,
      }));

    if (collectionsToInsert.length > 0) {
      await this.playerCollectionsRepo.save(collectionsToInsert);
    }
    if (settingsToInsert.length > 0) {
      await this.playerSettingsRepo.save(settingsToInsert);
    }
    if (presenceToInsert.length > 0) {
      await this.playerPresenceRepo.save(presenceToInsert);
    }
  }

  private async loadPlayerPersistedGroups(playerId: string): Promise<PlayerPersistedGroups> {
    const [collections, settings, presence] = await Promise.all([
      this.playerCollectionsRepo.findOne({ where: { playerId } }),
      this.playerSettingsRepo.findOne({ where: { playerId } }),
      this.playerPresenceRepo.findOne({ where: { playerId } }),
    ]);
    return { collections, settings, presence };
  }

  private async loadPlayerPersistedGroupsByIds(playerIds: string[]): Promise<Map<string, PlayerPersistedGroups>> {
    const result = new Map<string, PlayerPersistedGroups>();
    if (playerIds.length === 0) {
      return result;
    }
    const [collectionsRows, settingsRows, presenceRows] = await Promise.all([
      this.playerCollectionsRepo.findBy({ playerId: In(playerIds) }),
      this.playerSettingsRepo.findBy({ playerId: In(playerIds) }),
      this.playerPresenceRepo.findBy({ playerId: In(playerIds) }),
    ]);
    const collectionsById = new Map(collectionsRows.map((row) => [row.playerId, row]));
    const settingsById = new Map(settingsRows.map((row) => [row.playerId, row]));
    const presenceById = new Map(presenceRows.map((row) => [row.playerId, row]));
    for (const playerId of playerIds) {
      result.set(playerId, {
        collections: collectionsById.get(playerId) ?? null,
        settings: settingsById.get(playerId) ?? null,
        presence: presenceById.get(playerId) ?? null,
      });
    }
    return result;
  }

  /** 从 PG 加载玩家存档，写入内存 + Redis */
  async loadPlayer(userId: string): Promise<PlayerState | null> {
    const [entity, user] = await Promise.all([
      this.playerRepo.findOne({ where: { userId } }),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);
    if (!entity) return null;
    if (user) {
      await this.settleRecoveredOnlineSession(user);
    }
    const groups = await this.loadPlayerPersistedGroups(entity.id);
/** state：定义该变量以承载业务值。 */
    const state = this.hydratePlayerState(entity, user
      ? resolveDisplayName(user.displayName, user.username)
      : entity.name, groups);
/** resolvedPosition：定义该变量以承载业务值。 */
    const resolvedPosition = this.resolveRetainedPlayerPosition(state);
    if (resolvedPosition.mapId !== state.mapId || resolvedPosition.x !== state.x || resolvedPosition.y !== state.y) {
      state.mapId = resolvedPosition.mapId;
      state.x = resolvedPosition.x;
      state.y = resolvedPosition.y;
      await this.playerRepo.update(state.id, {
        mapId: state.mapId,
        x: state.x,
        y: state.y,
      });
    }
    this.players.set(state.id, state);
    await this.syncPlayerCache(state);
    const persisted = this.buildPersistedCollections(state);
    this.rememberPersistedCoreSnapshot(state.id, this.buildPlayerCorePersistenceSnapshot(state));
    this.rememberPersistedCollectionsSnapshot(state.id, this.buildPlayerCollectionsPersistenceSnapshot(persisted));
    this.rememberPersistedSettingsSnapshot(state.id, this.buildPlayerSettingsPersistenceSnapshot(state));
    return state;
  }

  /**
   * 启动时恢复仍应留在世界中的玩家。
   * 规则：
   * - `inWorld=true` 的角色都会重新进入运行时；
   * - 重启前残留为 `online=true` 的角色，会在恢复时转为离线挂机；
   * - 若已超过离线超时，则直接按超时离场收口，不再恢复到世界中。
   */
  async restoreRetainedPlayers(offlinePlayerTimeoutMs: number, now = Date.now()): Promise<{
/** restored：定义该变量以承载业务值。 */
    restored: number;
/** expired：定义该变量以承载业务值。 */
    expired: number;
/** recoveredOnline：定义该变量以承载业务值。 */
    recoveredOnline: number;
  }> {
/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find({
      where: { inWorld: true },
      order: {
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });
    if (entities.length === 0) {
      return { restored: 0, expired: 0, recoveredOnline: 0 };
    }

/** users：定义该变量以承载业务值。 */
    const users = await this.userRepo.findBy({
      id: In(entities.map((entity) => entity.userId)),
    });
/** userById：定义该变量以承载业务值。 */
    const userById = new Map(users.map((user) => [user.id, user]));
/** groupsById：定义该变量以承载业务值。 */
    const groupsById = await this.loadPlayerPersistedGroupsByIds(entities.map((entity) => entity.id));

/** restored：定义该变量以承载业务值。 */
    let restored = 0;
/** expired：定义该变量以承载业务值。 */
    let expired = 0;
/** recoveredOnline：定义该变量以承载业务值。 */
    let recoveredOnline = 0;

    for (const entity of entities) {
      const user = userById.get(entity.userId);
      if (user) {
        await this.settleRecoveredOnlineSession(user, now);
      }
/** displayName：定义该变量以承载业务值。 */
      const displayName = user
        ? resolveDisplayName(user.displayName, user.username)
        : entity.name;
/** state：定义该变量以承载业务值。 */
      const state = this.hydratePlayerState(entity, displayName, groupsById.get(entity.id));

      if (state.online === true) {
        recoveredOnline += 1;
      }
      state.online = false;
      state.offlineSinceAt = state.offlineSinceAt ?? now;

      if (state.offlineSinceAt > 0 && now - state.offlineSinceAt >= offlinePlayerTimeoutMs) {
        await this.expireRetainedPlayer(state);
        expired += 1;
        continue;
      }

/** resolvedPosition：定义该变量以承载业务值。 */
      const resolvedPosition = this.resolveRetainedPlayerPosition(state);
      state.mapId = resolvedPosition.mapId;
      state.x = resolvedPosition.x;
      state.y = resolvedPosition.y;
      state.inWorld = true;
      state.idleTicks = 0;

      this.players.set(state.id, state);
      this.userToPlayer.set(entity.userId, state.id);
      this.mapService.addOccupant(state.mapId, state.x, state.y, state.id, 'player');
      await this.persistPlayerCoreState(state, { force: true });
      await this.persistPlayerCollectionsState(state, { force: true });
      await this.persistPlayerSettingsState(state, { force: true });
      await this.persistPlayerPresenceState(state, { force: true });
      await this.syncPlayerCache(state);
      restored += 1;
    }

    return { restored, expired, recoveredOnline };
  }

  /** 创建新玩家并持久化到 PG */
  async createPlayer(state: PlayerState, userId: string): Promise<void> {
    // 用默认值填充新字段
    if (!state.baseAttrs) state.baseAttrs = { ...DEFAULT_BASE_ATTRS };
    if (!state.bonuses) state.bonuses = [];
    if (!state.temporaryBuffs) state.temporaryBuffs = [];
    if (!state.inventory) state.inventory = { items: [], capacity: DEFAULT_INVENTORY_CAPACITY };
    if (!state.marketStorage) state.marketStorage = { items: [] };
    if (!state.equipment) state.equipment = { weapon: null, head: null, body: null, legs: null, accessory: null };
    state.inventory = this.contentService.normalizeInventory(state.inventory);
    state.equipment = this.contentService.normalizeEquipment(state.equipment);
    if (!state.techniques) state.techniques = [];
    if (!state.quests) state.quests = [];
    if (!state.revealedBreakthroughRequirementIds) state.revealedBreakthroughRequirementIds = [];
    this.normalizePersistedTechniqueState(state);
    state.unlockedMinimapIds = normalizeUnlockedMinimapIds(state.unlockedMinimapIds);
    if (state.autoBattle === undefined) state.autoBattle = false;
    if (state.combatTargetLocked === undefined) state.combatTargetLocked = false;
    if (!state.autoBattleSkills) state.autoBattleSkills = [];
    state.autoUsePills = normalizeAutoUsePillConfigs(state.autoUsePills);
    state.autoBattleTargetingMode = normalizeAutoBattleTargetingMode(state.autoBattleTargetingMode);
    if (state.autoRetaliate === undefined) state.autoRetaliate = true;
    if (state.autoBattleStationary === undefined) state.autoBattleStationary = false;
    if (state.allowAoePlayerHit === undefined) state.allowAoePlayerHit = false;
    state.combatTargetingRules = normalizeCombatTargetingRules(
      state.combatTargetingRules,
      buildDefaultCombatTargetingRules({ includeAllPlayersHostile: state.allowAoePlayerHit === true }),
    );
    state.allowAoePlayerHit = hasCombatTargetingRule(state.combatTargetingRules, 'hostile', 'all_players');
    if (state.autoIdleCultivation === undefined) state.autoIdleCultivation = true;
    if (state.autoSwitchCultivation === undefined) state.autoSwitchCultivation = false;
    if (state.online === undefined) state.online = false;
    if (state.inWorld === undefined) state.inWorld = true;
    if (!state.pendingLogbookMessages) state.pendingLogbookMessages = [];
    if (!state.actions) state.actions = [];
    if (state.senseQiActive === undefined) state.senseQiActive = false;
    state.boneAgeBaseYears = normalizeBoneAgeBaseYears(state.boneAgeBaseYears ?? DEFAULT_BONE_AGE_YEARS);
    state.lifeElapsedTicks = normalizeLifeElapsedTicks(state.lifeElapsedTicks);
    state.lifespanYears = normalizeLifespanYears(state.lifespanYears);
    state.questCrossMapNavCooldownUntilLifeTicks = normalizeLifeElapsedTicks(state.questCrossMapNavCooldownUntilLifeTicks);
    state.idleTicks = 0;
    if (state.facing === undefined) state.facing = Direction.South;
    if (!state.viewRange) state.viewRange = VIEW_RADIUS;
    this.techniqueService.initializePlayerProgression(state);
    this.equipmentService.rebuildBonuses(state);
    if (state.hp <= 0) {
      state.hp = state.maxHp;
    }
    if (!Number.isFinite(state.qi) || state.qi < 0) {
      state.qi = 0;
    }
    state.foundation = normalizeNonNegativeCounter(state.foundation);
    state.combatExp = normalizeNonNegativeCounter(state.combatExp);
    state.playerKillCount = normalizeNonNegativeCounter(state.playerKillCount);
    state.monsterKillCount = normalizeNonNegativeCounter(state.monsterKillCount);
    state.eliteMonsterKillCount = normalizeNonNegativeCounter(state.eliteMonsterKillCount);
    state.bossMonsterKillCount = normalizeNonNegativeCounter(state.bossMonsterKillCount);
    state.deathCount = normalizeNonNegativeCounter(state.deathCount);
/** persisted：定义该变量以承载业务值。 */
    const persisted = this.buildPersistedCollections(state);
/** payload：定义该变量以承载业务值。 */
    const coreSnapshot = this.buildPlayerCorePersistenceSnapshot(state);
/** collectionsSnapshot：定义该变量以承载业务值。 */
    const collectionsSnapshot = this.buildPlayerCollectionsPersistenceSnapshot(persisted);
/** settingsSnapshot：定义该变量以承载业务值。 */
    const settingsSnapshot = this.buildPlayerSettingsPersistenceSnapshot(state);
/** payload：定义该变量以承载业务值。 */
    const payload = {
      ...this.buildPlayerCorePersistencePayload(coreSnapshot),
      ...this.buildPlayerCollectionsPersistencePayload(collectionsSnapshot),
      ...this.buildPlayerSettingsPersistencePayload(settingsSnapshot),
      ...this.buildPlayerPresencePersistenceSnapshot(state),
      pendingLogbookMessages: (state.pendingLogbookMessages ?? []) as any,
    };

    await this.playerRepo.createQueryBuilder()
      .insert()
      .into(PlayerEntity)
      .values({
        id: state.id,
        userId,
        name: state.name,
        ...payload,
      })
      .execute();
    await this.playerCollectionsRepo.save(this.playerCollectionsRepo.create({
      playerId: state.id,
      ...this.buildPlayerCollectionsPersistencePayload(collectionsSnapshot),
    }));
    await this.playerSettingsRepo.save(this.playerSettingsRepo.create({
      playerId: state.id,
      ...this.buildPlayerSettingsPersistencePayload(settingsSnapshot),
    }));
    await this.playerPresenceRepo.save(this.playerPresenceRepo.create({
      playerId: state.id,
      ...this.buildPlayerPresencePersistenceSnapshot(state),
    }));
    this.players.set(state.id, state);
    this.rememberPersistedCoreSnapshot(state.id, coreSnapshot);
    this.rememberPersistedCollectionsSnapshot(state.id, collectionsSnapshot);
    this.rememberPersistedSettingsSnapshot(state.id, settingsSnapshot);
    await this.redisService.setPlayer(state, persisted);
  }

  /** 单个玩家落盘到 PG */
  async savePlayer(playerId: string): Promise<void> {
/** state：定义该变量以承载业务值。 */
    const state = this.players.get(playerId);
    if (!state || state.isBot) return;
    await this.persistPlayerCoreState(state, { force: true });
    await this.persistPlayerCollectionsState(state, { force: true });
    await this.persistPlayerSettingsState(state, { force: true });
    await this.persistPlayerPresenceState(state, { force: true });
  }

  async savePlayerCollections(playerId: string): Promise<void> {
    const state = this.players.get(playerId);
    if (!state || state.isBot) return;
    await this.persistPlayerCollectionsState(state, { force: true });
  }

  async saveOfflineMarketStorage(playerId: string, marketStorage: PlayerState['marketStorage']): Promise<void> {
    const entity = await this.playerCollectionsRepo.findOne({ where: { playerId } });
    if (entity) {
      entity.marketStorage = (marketStorage ?? { items: [] }) as any;
      await this.playerCollectionsRepo.save(entity);
    } else {
      await this.playerCollectionsRepo.save(this.playerCollectionsRepo.create({
        playerId,
        marketStorage: (marketStorage ?? { items: [] }) as any,
      }));
    }
    await this.playerRepo.update(playerId, {
      marketStorage: (marketStorage ?? { items: [] }) as any,
    });
  }

  async saveDetachedPlayerState(state: PlayerState): Promise<void> {
    await this.persistPlayerCoreState(state, { force: true });
    await this.persistPlayerCollectionsState(state, { force: true });
    await this.persistPlayerSettingsState(state, { force: true });
    await this.persistPlayerPresenceState(state, { force: true });
  }

  /** 批量落盘所有已加载玩家 */
  async persistAll(): Promise<void> {
/** states：定义该变量以承载业务值。 */
    const states = [...this.players.values()].filter((player) => !player.isBot);
    if (states.length === 0) return;
/** failures：定义该变量以承载业务值。 */
    const failures: string[] = [];
/** persistedCount：定义该变量以承载业务值。 */
    let persistedCount = 0;
    for (let index = 0; index < states.length; index += PLAYER_PERSIST_CONCURRENCY) {
      const batch = states.slice(index, index + PLAYER_PERSIST_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (state) => {
        const [coreChanged, collectionsChanged, settingsChanged] = await Promise.all([
          this.persistPlayerCoreState(state),
          this.persistPlayerCollectionsState(state),
          this.persistPlayerSettingsState(state),
        ]);
        return coreChanged || collectionsChanged || settingsChanged;
      }));
      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          if (result.value) {
            persistedCount += 1;
          }
          return;
        }
/** reason：定义该变量以承载业务值。 */
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push(`${batch[batchIndex]?.id ?? 'unknown'}: ${reason}`);
      });
    }
    if (failures.length > 0) {
      throw new Error(`玩家批量落盘失败 ${failures.length}/${states.length} 项: ${failures.slice(0, 3).join('; ')}`);
    }
    if (persistedCount > 0) {
      this.logger.log(`批量落盘 ${persistedCount}/${states.length} 名玩家`);
    }
  }

  /** 将玩家加入内存并同步 Redis（用于存档恢复后的注册） */
  addPlayer(state: PlayerState) {
    this.players.set(state.id, state);
    if (!state.isBot) {
      const persisted = this.buildPersistedCollections(state);
      this.rememberPersistedCoreSnapshot(state.id, this.buildPlayerCorePersistenceSnapshot(state));
      this.rememberPersistedCollectionsSnapshot(state.id, this.buildPlayerCollectionsPersistenceSnapshot(persisted));
      this.rememberPersistedSettingsSnapshot(state.id, this.buildPlayerSettingsPersistenceSnapshot(state));
    }
    this.syncPlayerCache(state).catch(() => {});
  }

  /** 仅加入内存，不同步 Redis（用于 Bot 等运行时实体） */
  addRuntimePlayer(state: PlayerState) {
    this.players.set(state.id, state);
  }

  /** 移除玩家并清理 Redis 缓存 */
  removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
    this.pendingLogbookPersistions.delete(playerId);
    this.pendingPresencePersistions.delete(playerId);
    this.lastPersistedCoreSnapshots.delete(playerId);
    this.lastPersistedCollectionsSnapshots.delete(playerId);
    this.lastPersistedSettingsSnapshots.delete(playerId);
/** userId：定义该变量以承载业务值。 */
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
      this.userToPlayer.delete(userId);
      this.onlineSessionStartedAtByUserId.delete(userId);
    }
    this.redisService.removePlayer(playerId).catch(() => {});
  }

  /** 仅从内存移除，不清理 Redis（用于 Bot 等运行时实体） */
  removeRuntimePlayer(playerId: string) {
    this.players.delete(playerId);
    this.socketMap.delete(playerId);
    this.dirtyFlags.delete(playerId);
    this.pendingLogbookPersistions.delete(playerId);
    this.pendingPresencePersistions.delete(playerId);
    this.lastPersistedCoreSnapshots.delete(playerId);
    this.lastPersistedCollectionsSnapshots.delete(playerId);
    this.lastPersistedSettingsSnapshots.delete(playerId);
/** userId：定义该变量以承载业务值。 */
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
      this.onlineSessionStartedAtByUserId.delete(userId);
    }
  }

/** getPlayer：执行对应的业务逻辑。 */
  getPlayer(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

/** hydrateStoredPlayerForRead：执行对应的业务逻辑。 */
  hydrateStoredPlayerForRead(entity: PlayerEntity): PlayerState {
    return this.hydratePlayerState(entity, entity.name);
  }

/** incrementMonsterKill：执行对应的业务逻辑。 */
  incrementMonsterKill(player: PlayerState, tier?: MonsterTier): void {
    if (player.isBot) {
      return;
    }
    player.monsterKillCount = normalizeNonNegativeCounter(player.monsterKillCount) + 1;
    if (tier === 'variant') {
      player.eliteMonsterKillCount = normalizeNonNegativeCounter(player.eliteMonsterKillCount) + 1;
    } else if (tier === 'demon_king') {
      player.bossMonsterKillCount = normalizeNonNegativeCounter(player.bossMonsterKillCount) + 1;
    }
  }

/** incrementPlayerKill：执行对应的业务逻辑。 */
  incrementPlayerKill(player: PlayerState): void {
    if (player.isBot) {
      return;
    }
    player.playerKillCount = normalizeNonNegativeCounter(player.playerKillCount) + 1;
  }

/** incrementDeathCount：执行对应的业务逻辑。 */
  incrementDeathCount(player: PlayerState): void {
    if (player.isBot) {
      return;
    }
    player.deathCount = normalizeNonNegativeCounter(player.deathCount) + 1;
  }

/** getPlayersByMap：执行对应的业务逻辑。 */
  getPlayersByMap(mapId: string): PlayerState[] {
/** result：定义该变量以承载业务值。 */
    const result: PlayerState[] = [];
    for (const p of this.players.values()) {
      if (p.mapId === mapId && p.inWorld !== false) result.push(p);
    }
    return result;
  }

/** getAllPlayers：执行对应的业务逻辑。 */
  getAllPlayers(): PlayerState[] {
    return [...this.players.values()];
  }

/** getSocket：执行对应的业务逻辑。 */
  getSocket(playerId: string): Socket | undefined {
    return this.socketMap.get(playerId);
  }

/** setSocket：处理当前场景中的对应操作。 */
  setSocket(playerId: string, socket: Socket) {
    this.socketMap.set(playerId, socket);
  }

/** removeSocket：处理当前场景中的对应操作。 */
  removeSocket(playerId: string) {
    this.socketMap.delete(playerId);
  }

  disconnectAllActiveSockets(timestamp = Date.now()): void {
/** activeSockets：定义该变量以承载业务值。 */
    const activeSockets = [...this.socketMap.entries()];
    for (const [playerId, socket] of activeSockets) {
      const player = this.players.get(playerId);
      if (player) {
        this.markPlayerOffline(playerId, timestamp);
      }
      this.socketMap.delete(playerId);
      socket.emit(S2C.Kick);
      socket.disconnect(true);
    }
  }

/** clearRuntimeState：执行对应的业务逻辑。 */
  clearRuntimeState(): void {
    this.players.clear();
    this.commands.clear();
    this.socketMap.clear();
    this.userToPlayer.clear();
    this.onlineSessionStartedAtByUserId.clear();
    this.dirtyFlags.clear();
    this.pendingLogbookPersistions.clear();
    this.pendingPresencePersistions.clear();
    this.lastPersistedCoreSnapshots.clear();
    this.lastPersistedCollectionsSnapshots.clear();
    this.lastPersistedSettingsSnapshots.clear();
  }

/** getPlayerByUserId：执行对应的业务逻辑。 */
  getPlayerByUserId(userId: string): string | undefined {
    return this.userToPlayer.get(userId);
  }

/** getUserIdByPlayerId：执行对应的业务逻辑。 */
  getUserIdByPlayerId(playerId: string): string | undefined {
    for (const [userId, mappedPlayerId] of this.userToPlayer.entries()) {
      if (mappedPlayerId === playerId) {
        return userId;
      }
    }
    return undefined;
  }

/** setUserMapping：处理当前场景中的对应操作。 */
  setUserMapping(userId: string, playerId: string) {
    this.userToPlayer.set(userId, playerId);
  }

/** removeUserMapping：处理当前场景中的对应操作。 */
  removeUserMapping(userId: string) {
    this.userToPlayer.delete(userId);
  }

/** getOnlineSessionStartedAt：执行对应的业务逻辑。 */
  getOnlineSessionStartedAt(userId: string): number | undefined {
    return this.onlineSessionStartedAtByUserId.get(userId);
  }

/** syncPlayerRealtimeState：处理当前场景中的对应操作。 */
  syncPlayerRealtimeState(playerId: string) {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.syncPlayerCache(player).catch(() => {});
  }

/** getPendingLogbookMessages：执行对应的业务逻辑。 */
  getPendingLogbookMessages(playerId: string): PendingLogbookMessage[] {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return [];
    }
    return (player.pendingLogbookMessages ?? []).map((entry) => ({ ...entry }));
  }

/** queuePendingLogbookMessage：执行对应的业务逻辑。 */
  queuePendingLogbookMessage(playerId: string, message: PendingLogbookMessage): void {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player || player.isBot) {
      return;
    }
/** next：定义该变量以承载业务值。 */
    const next = [...(player.pendingLogbookMessages ?? [])];
/** existingIndex：定义该变量以承载业务值。 */
    const existingIndex = next.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) {
      next[existingIndex] = { ...message };
    } else {
      next.push({ ...message });
    }
    player.pendingLogbookMessages = next.slice(-MAX_PENDING_LOGBOOK_MESSAGES);
    this.schedulePendingLogbookPersistence(playerId);

/** socket：定义该变量以承载业务值。 */
    const socket = this.getSocket(playerId);
    if (!socket) {
      return;
    }
    socket.emit(S2C.SystemMsg, this.toSystemMessage(message));
  }

/** ackPendingLogbookMessages：执行对应的业务逻辑。 */
  ackPendingLogbookMessages(playerId: string, ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player || !player.pendingLogbookMessages || player.pendingLogbookMessages.length === 0) {
      return;
    }
/** idSet：定义该变量以承载业务值。 */
    const idSet = new Set(ids.filter((entry) => typeof entry === 'string' && entry.length > 0));
    if (idSet.size === 0) {
      return;
    }
/** next：定义该变量以承载业务值。 */
    const next = player.pendingLogbookMessages.filter((entry) => !idSet.has(entry.id));
    if (next.length === player.pendingLogbookMessages.length) {
      return;
    }
    player.pendingLogbookMessages = next;
    this.schedulePendingLogbookPersistence(playerId);
  }

/** emitPendingLogbookMessages：执行对应的业务逻辑。 */
  emitPendingLogbookMessages(playerId: string): void {
/** socket：定义该变量以承载业务值。 */
    const socket = this.getSocket(playerId);
    if (!socket) {
      return;
    }
    for (const entry of this.getPendingLogbookMessages(playerId)) {
      socket.emit(S2C.SystemMsg, this.toSystemMessage(entry));
    }
  }

  markPlayerOnline(playerId: string, timestamp = Date.now()) {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.online = true;
    player.inWorld = true;
    player.lastHeartbeatAt = timestamp;
    player.offlineSinceAt = undefined;
/** userId：定义该变量以承载业务值。 */
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId && !this.onlineSessionStartedAtByUserId.has(userId)) {
      this.onlineSessionStartedAtByUserId.set(userId, timestamp);
      this.userRepo.createQueryBuilder()
        .update(UserEntity)
        .set({
          currentOnlineStartedAt: new Date(timestamp),
        })
        .where('id = :userId', { userId })
        .execute()
        .catch(() => {});
    }
    this.schedulePlayerPresencePersistence(playerId);
    this.syncPlayerRealtimeState(playerId);
  }

  touchHeartbeat(playerId: string, timestamp = Date.now()) {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.lastHeartbeatAt = timestamp;
    player.online = true;
    player.offlineSinceAt = undefined;
    this.syncPlayerRealtimeState(playerId);
  }

  markPlayerOffline(playerId: string, timestamp = Date.now()) {
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.online = false;
    player.offlineSinceAt = player.offlineSinceAt ?? timestamp;
    this.socketMap.delete(playerId);
/** userId：定义该变量以承载业务值。 */
    const userId = this.getUserIdByPlayerId(playerId);
    if (userId) {
/** startedAt：定义该变量以承载业务值。 */
      const startedAt = this.onlineSessionStartedAtByUserId.get(userId);
      this.onlineSessionStartedAtByUserId.delete(userId);
      if (typeof startedAt === 'number' && startedAt > 0) {
/** sessionSeconds：定义该变量以承载业务值。 */
        const sessionSeconds = this.computeOnlineSessionSeconds(startedAt, timestamp);
/** startedAtIso：定义该变量以承载业务值。 */
        const startedAtIso = new Date(startedAt).toISOString();
        this.userRepo.createQueryBuilder()
          .update(UserEntity)
          .set({
            totalOnlineSeconds: () => `"totalOnlineSeconds" + ${sessionSeconds}`,
            currentOnlineStartedAt: null,
          })
          .where('id = :userId', { userId })
          .andWhere('currentOnlineStartedAt = :startedAt', { startedAt: startedAtIso })
          .execute()
          .catch(() => {});
      }
    }
    this.schedulePlayerPresencePersistence(playerId);
    this.syncPlayerRealtimeState(playerId);
  }

/** updatePlayerDisplayName：执行对应的业务逻辑。 */
  async updatePlayerDisplayName(userId: string, displayName: string): Promise<void> {
/** playerId：定义该变量以承载业务值。 */
    const playerId = this.userToPlayer.get(userId);
    if (!playerId) {
      return;
    }
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.displayName = displayName;
    await this.syncPlayerCache(player);
  }

/** updatePlayerRoleName：执行对应的业务逻辑。 */
  async updatePlayerRoleName(userId: string, roleName: string): Promise<void> {
/** playerId：定义该变量以承载业务值。 */
    const playerId = this.userToPlayer.get(userId);
    if (!playerId) {
      return;
    }
/** player：定义该变量以承载业务值。 */
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    player.name = roleName;
    await this.syncPlayerCache(player);
  }

  /** 将玩家指令入队到对应地图的命令队列 */
  enqueueCommand(mapId: string, cmd: PlayerCommand) {
/** list：定义该变量以承载业务值。 */
    const list = this.commands.get(mapId) ?? [];
    list.push(cmd);
    this.commands.set(mapId, list);
  }

  /** 取出并清空命令队列，同 type+playerId 去重保留最后一条 */
  drainCommands(mapId: string): PlayerCommand[] {
/** list：定义该变量以承载业务值。 */
    const list = this.commands.get(mapId) ?? [];
    this.commands.set(mapId, []);
    // 按 type+playerId 去重，保留最后一条
    const map = new Map<string, PlayerCommand>();
    for (const cmd of list) {
      map.set(`${cmd.playerId}:${cmd.type}`, cmd);
    }
    return [...map.values()];
  }

  /** 规范化任务数据：补全目标名称、NPC 位置、奖励信息等 */
  private normalizeQuests(quests: QuestState[]): QuestState[] {
    return quests.map((quest) => {
/** targetNpcLocation：定义该变量以承载业务值。 */
      const targetNpcLocation = quest.targetNpcId ? this.mapService.getNpcLocation(quest.targetNpcId) : undefined;
/** submitNpcLocation：定义该变量以承载业务值。 */
      const submitNpcLocation = quest.submitNpcId ? this.mapService.getNpcLocation(quest.submitNpcId) : undefined;
      return {
        ...quest,
/** line：定义该变量以承载业务值。 */
        line: quest.line === 'main' || quest.line === 'daily' || quest.line === 'encounter'
          ? quest.line
          : 'side',
        objectiveType: quest.objectiveType ?? 'kill',
      targetName: resolveQuestTargetName({
        objectiveType: quest.objectiveType ?? 'kill',
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
        targetMonsterId: quest.targetMonsterId ?? '',
        rewardItemId: quest.rewardItemId ?? quest.rewardItemIds?.[0] ?? '',
        rewardItemIds: Array.isArray(quest.rewardItemIds)
          ? [...quest.rewardItemIds]
          : quest.rewardItemId
            ? [quest.rewardItemId]
            : [],
        rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
        requiredItemId: quest.requiredItemId,
        requiredItemCount: quest.requiredItemCount,
        giverMapId: quest.giverMapId,
/** giverMapName：定义该变量以承载业务值。 */
        giverMapName: quest.giverMapId && (!quest.giverMapName || quest.giverMapName === quest.giverMapId)
          ? this.mapService.getMapMeta(quest.giverMapId)?.name ?? quest.giverMapName
          : quest.giverMapName,
        giverX: quest.giverX,
        giverY: quest.giverY,
        targetMapId: targetNpcLocation?.mapId ?? quest.targetMapId,
        targetMapName: targetNpcLocation?.mapName ?? (
          quest.targetMapId && (!quest.targetMapName || quest.targetMapName === quest.targetMapId)
            ? this.mapService.getMapMeta(quest.targetMapId)?.name ?? quest.targetMapName
            : quest.targetMapName
        ),
        targetX: targetNpcLocation?.x ?? quest.targetX,
        targetY: targetNpcLocation?.y ?? quest.targetY,
        targetNpcName: targetNpcLocation?.name ?? quest.targetNpcName,
        submitMapId: submitNpcLocation?.mapId ?? quest.submitMapId,
        submitMapName: submitNpcLocation?.mapName ?? (
          quest.submitMapId && (!quest.submitMapName || quest.submitMapName === quest.submitMapId)
            ? this.mapService.getMapMeta(quest.submitMapId)?.name ?? quest.submitMapName
            : quest.submitMapName
        ),
        submitX: submitNpcLocation?.x ?? quest.submitX,
        submitY: submitNpcLocation?.y ?? quest.submitY,
        submitNpcName: submitNpcLocation?.name ?? quest.submitNpcName,
      };
    });
  }

  /** 校验并过滤临时 Buff 数组，剔除字段不完整或已失效的条目 */
  private normalizeTemporaryBuffs(value: unknown): TemporaryBuffState[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.cloneJson<TemporaryBuffState>(entry))
      .filter((buff): buff is TemporaryBuffState => (
        Boolean(buff)
        && typeof buff.buffId === 'string'
        && buff.buffId.length > 0
        && typeof buff.name === 'string'
        && buff.name.length > 0
        && typeof buff.shortMark === 'string'
        && buff.shortMark.length > 0
        && typeof buff.sourceSkillId === 'string'
        && buff.sourceSkillId.length > 0
        && Number.isFinite(buff.remainingTicks)
        && Number.isFinite(buff.duration)
        && Number.isFinite(buff.stacks)
        && Number.isFinite(buff.maxStacks)
        && buff.remainingTicks > 0
        && buff.stacks > 0
        && buff.maxStacks > 0
      ));
  }

/** cloneJson：执行对应的业务逻辑。 */
  private cloneJson<T>(value: T): T {
    return clonePlainValue(value);
  }

  private normalizePersistedInventoryCapacity(value: unknown): { inventory: Record<string, unknown>; changed: boolean } {
/** isRecord：定义该变量以承载业务值。 */
    const isRecord = Boolean(value) && typeof value === 'object' && !Array.isArray(value);
/** source：定义该变量以承载业务值。 */
    const source = isRecord ? value as Record<string, unknown> : {};
/** numericCapacity：定义该变量以承载业务值。 */
    const numericCapacity = typeof source.capacity === 'number' && Number.isFinite(source.capacity)
      ? Math.trunc(source.capacity)
      : null;
/** parsedCapacity：定义该变量以承载业务值。 */
    const parsedCapacity = numericCapacity ?? (
      typeof source.capacity === 'string' && source.capacity.trim().length > 0 && Number.isFinite(Number(source.capacity))
        ? Math.trunc(Number(source.capacity))
        : null
    );
/** nextCapacity：定义该变量以承载业务值。 */
    const nextCapacity = Math.max(DEFAULT_INVENTORY_CAPACITY, parsedCapacity ?? 0);
/** items：定义该变量以承载业务值。 */
    const items = Array.isArray(source.items) ? source.items : [];
    return {
      inventory: {
        ...source,
        items,
        capacity: nextCapacity,
      },
/** changed：定义该变量以承载业务值。 */
      changed: !isRecord || !Array.isArray(source.items) || numericCapacity !== nextCapacity,
    };
  }

/** ensureDisplayNameUniquenessPolicy：执行对应的业务逻辑。 */
  private async ensureDisplayNameUniquenessPolicy(): Promise<void> {
/** rows：定义该变量以承载业务值。 */
    const rows = await this.userRepo.query(`
      SELECT con.conname
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      INNER JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON TRUE
      INNER JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = key.attnum
      WHERE rel.relname = 'users'
        AND con.contype = 'u'
      GROUP BY con.conname
      HAVING array_agg(attr.attname::text ORDER BY key.ordinality) = ARRAY['displayName']::text[]
    `);
    for (const row of rows as Array<{ conname?: unknown }>) {
      const constraintName = typeof row?.conname === 'string' ? row.conname.trim() : '';
      if (!constraintName) {
        continue;
      }
      await this.userRepo.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS ${this.quotePgIdentifier(constraintName)}`);
    }
    await this.userRepo.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_display_name_unique_except_person"
      ON "users" ("displayName")
      WHERE "displayName" IS NOT NULL AND "displayName" <> '${DEFAULT_VISIBLE_DISPLAY_NAME}'
    `);
  }

/** quotePgIdentifier：执行对应的业务逻辑。 */
  private quotePgIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

/** ensureUserCounterColumnCapacity：执行对应的业务逻辑。 */
  private async ensureUserCounterColumnCapacity(): Promise<void> {
/** rows：定义该变量以承载业务值。 */
    const rows = await this.userRepo.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
        AND column_name = ANY($1::text[])
    `, [USER_BIGINT_PERSIST_COLUMNS]);

/** columnsNeedingUpgrade：定义该变量以承载业务值。 */
    const columnsNeedingUpgrade = new Set(
      (rows as Array<{ column_name?: unknown; data_type?: unknown }>)
        .filter((row) => row.data_type === 'integer' && typeof row.column_name === 'string')
        .map((row) => row.column_name as string),
    );

    if (columnsNeedingUpgrade.size === 0) {
      return;
    }

    for (const columnName of USER_BIGINT_PERSIST_COLUMNS) {
      if (!columnsNeedingUpgrade.has(columnName)) {
        continue;
      }
      await this.userRepo.query(`
        ALTER TABLE "users"
        ALTER COLUMN ${this.quotePgIdentifier(columnName)} TYPE bigint
      `);
    }

    this.logger.warn(`已将 users 表计数字段升级为 bigint: ${[...columnsNeedingUpgrade].join(', ')}`);
  }

/** ensurePlayerCounterColumnCapacity：执行对应的业务逻辑。 */
  private async ensurePlayerCounterColumnCapacity(): Promise<void> {
/** rows：定义该变量以承载业务值。 */
    const rows = await this.playerRepo.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'players'
        AND column_name = ANY($1::text[])
    `, [PLAYER_BIGINT_PERSIST_COLUMNS]);

/** columnsNeedingUpgrade：定义该变量以承载业务值。 */
    const columnsNeedingUpgrade = new Set(
      (rows as Array<{ column_name?: unknown; data_type?: unknown }>)
        .filter((row) => row.data_type === 'integer' && typeof row.column_name === 'string')
        .map((row) => row.column_name as string),
    );

    if (columnsNeedingUpgrade.size === 0) {
      return;
    }

    for (const columnName of PLAYER_BIGINT_PERSIST_COLUMNS) {
      if (!columnsNeedingUpgrade.has(columnName)) {
        continue;
      }
      await this.playerRepo.query(`
        ALTER TABLE "players"
        ALTER COLUMN ${this.quotePgIdentifier(columnName)} TYPE bigint
      `);
    }

    this.logger.warn(`已将 players 表计数字段升级为 bigint: ${[...columnsNeedingUpgrade].join(', ')}`);
  }

/** normalizePersistedRoleNames：执行对应的业务逻辑。 */
  private async normalizePersistedRoleNames(): Promise<void> {
    const [players, users] = await Promise.all([
      this.playerRepo.find({
        select: {
          id: true,
          userId: true,
          name: true,
          inventory: true,
          createdAt: true,
        },
      }),
      this.userRepo.find({
        select: {
          id: true,
          username: true,
          displayName: true,
          createdAt: true,
        },
      }),
    ]);
    if (players.length === 0 && users.length === 0) {
      return;
    }

/** userById：定义该变量以承载业务值。 */
    const userById = new Map(users.map((user) => [user.id, user]));
/** effectiveDisplayNameByUserId：定义该变量以承载业务值。 */
    const effectiveDisplayNameByUserId = new Map<string, string>();
/** userDisplayUpdates：定义该变量以承载业务值。 */
    const userDisplayUpdates: Array<{ id: string; displayName: string | null }> = [];
/** defaultDisplayAssignedCount：定义该变量以承载业务值。 */
    let defaultDisplayAssignedCount = 0;
/** displayNameNormalizedCount：定义该变量以承载业务值。 */
    let displayNameNormalizedCount = 0;
    for (const user of users) {
      const normalizedStoredDisplayName = typeof user.displayName === 'string'
        ? normalizeDisplayName(user.displayName)
        : '';
/** nextStoredDisplayName：定义该变量以承载业务值。 */
      let nextStoredDisplayName = user.displayName;
      if (normalizedStoredDisplayName) {
/** displayNameError：定义该变量以承载业务值。 */
        const displayNameError = validateDisplayName(normalizedStoredDisplayName);
        if (displayNameError) {
          nextStoredDisplayName = DEFAULT_VISIBLE_DISPLAY_NAME;
          defaultDisplayAssignedCount += 1;
        } else if (normalizedStoredDisplayName !== user.displayName) {
          nextStoredDisplayName = normalizedStoredDisplayName;
          displayNameNormalizedCount += 1;
        }
      } else if (resolveDisplayName(user.displayName, user.username) === DEFAULT_VISIBLE_DISPLAY_NAME) {
        nextStoredDisplayName = DEFAULT_VISIBLE_DISPLAY_NAME;
        defaultDisplayAssignedCount += 1;
      }
      if (nextStoredDisplayName !== user.displayName) {
        userDisplayUpdates.push({ id: user.id, displayName: nextStoredDisplayName });
      }
      effectiveDisplayNameByUserId.set(
        user.id,
        resolveDisplayName(nextStoredDisplayName, user.username),
      );
    }
/** occupiedNames：定义该变量以承载业务值。 */
    const occupiedNames = new Set<string>();
    for (const user of users) {
      occupiedNames.add(user.username);
      occupiedNames.add(effectiveDisplayNameByUserId.get(user.id) ?? resolveDisplayName(user.displayName, user.username));
    }

/** StartupPlayerEntry：定义该类型的结构与数据语义。 */
    type StartupPlayerEntry = {
/** id：定义该变量以承载业务值。 */
      id: string;
/** userId：定义该变量以承载业务值。 */
      userId: string;
/** originalName：定义该变量以承载业务值。 */
      originalName: string;
/** normalizedName：定义该变量以承载业务值。 */
      normalizedName: string;
/** createdAt：定义该变量以承载业务值。 */
      createdAt: Date | null;
/** createdAtSource：定义该变量以承载业务值。 */
      createdAtSource: number;
/** requiresAnonymousRename：定义该变量以承载业务值。 */
      requiresAnonymousRename: boolean;
    };

/** entries：定义该变量以承载业务值。 */
    const entries: StartupPlayerEntry[] = players.map((player) => {
/** trimmedName：定义该变量以承载业务值。 */
      const trimmedName = player.name.normalize('NFC').trim();
/** requiresAnonymousRename：定义该变量以承载业务值。 */
      const requiresAnonymousRename = !hasVisibleNameGrapheme(trimmedName);
/** normalizedName：定义该变量以承载业务值。 */
      const normalizedName = requiresAnonymousRename
        ? DEFAULT_INVISIBLE_ROLE_NAME_BASE
        : truncateRoleName(trimmedName);
/** user：定义该变量以承载业务值。 */
      const user = userById.get(player.userId);
/** createdAt：定义该变量以承载业务值。 */
      const createdAt = this.resolvePlayerCreatedAt(player.id, player.createdAt, user?.createdAt ?? null);
      return {
        id: player.id,
        userId: player.userId,
        originalName: player.name,
        normalizedName: normalizedName || player.name,
        createdAt,
        createdAtSource: createdAt?.getTime() ?? 0,
        requiresAnonymousRename,
      };
    });

/** groupedByName：定义该变量以承载业务值。 */
    const groupedByName = new Map<string, StartupPlayerEntry[]>();
    for (const entry of entries) {
      if (entry.requiresAnonymousRename) {
        continue;
      }
/** bucket：定义该变量以承载业务值。 */
      const bucket = groupedByName.get(entry.normalizedName) ?? [];
      bucket.push(entry);
      groupedByName.set(entry.normalizedName, bucket);
    }
/** playerById：定义该变量以承载业务值。 */
    const playerById = new Map(players.map((player) => [player.id, player]));

    for (const [name, bucket] of groupedByName.entries()) {
      if (bucket.length === 1) {
        occupiedNames.add(name);
      }
    }

/** normalizedCount：定义该变量以承载业务值。 */
    let normalizedCount = 0;
/** duplicateRenamedCount：定义该变量以承载业务值。 */
    let duplicateRenamedCount = 0;
/** anonymousRoleRenamedCount：定义该变量以承载业务值。 */
    let anonymousRoleRenamedCount = 0;
/** createdAtBackfilledCount：定义该变量以承载业务值。 */
    let createdAtBackfilledCount = 0;
/** inventoryCapacityBackfilledCount：定义该变量以承载业务值。 */
    let inventoryCapacityBackfilledCount = 0;
/** updates：定义该变量以承载业务值。 */
    const updates: Array<{ id: string; changes: Pick<Partial<PlayerEntity>, 'name' | 'createdAt' | 'inventory'> }> = [];

/** duplicateGroups：定义该变量以承载业务值。 */
    const duplicateGroups = [...groupedByName.entries()]
      .filter(([, bucket]) => bucket.length > 1)
      .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'));

    for (const [, bucket] of duplicateGroups) {
      bucket.sort((left, right) => (
        left.createdAtSource - right.createdAtSource
        || left.id.localeCompare(right.id)
      ));
      occupiedNames.add(bucket[0]!.normalizedName);

/** suffix：定义该变量以承载业务值。 */
      let suffix = 2;
      for (let index = 1; index < bucket.length; index += 1) {
        const entry = bucket[index]!;
        const renamed = this.allocateDuplicateRoleName(entry.normalizedName, suffix, occupiedNames);
        suffix = renamed.nextSuffix;
        entry.normalizedName = renamed.name;
        occupiedNames.add(renamed.name);
      }
    }

/** anonymousEntries：定义该变量以承载业务值。 */
    const anonymousEntries = entries
      .filter((entry) => entry.requiresAnonymousRename)
      .sort((left, right) => (
        left.createdAtSource - right.createdAtSource
        || left.id.localeCompare(right.id)
      ));
/** anonymousSuffix：定义该变量以承载业务值。 */
    let anonymousSuffix = 1;
    for (const entry of anonymousEntries) {
      const renamed = this.allocateDuplicateRoleName(DEFAULT_INVISIBLE_ROLE_NAME_BASE, anonymousSuffix, occupiedNames, 1);
      anonymousSuffix = renamed.nextSuffix;
      entry.normalizedName = renamed.name;
      occupiedNames.add(renamed.name);
    }

    for (const entry of entries) {
      const changes: Partial<PlayerEntity> = {};
      if (entry.normalizedName !== entry.originalName) {
        changes.name = entry.normalizedName;
        if (entry.requiresAnonymousRename) {
          anonymousRoleRenamedCount += 1;
        } else if (truncateRoleName(entry.originalName.normalize('NFC').trim()) === entry.normalizedName) {
          normalizedCount += 1;
        } else {
          duplicateRenamedCount += 1;
        }
      }
/** player：定义该变量以承载业务值。 */
      const player = playerById.get(entry.id);
      if (player && !player.createdAt && entry.createdAt) {
        changes.createdAt = entry.createdAt;
        createdAtBackfilledCount += 1;
      }
      if (player) {
/** normalizedInventory：定义该变量以承载业务值。 */
        const normalizedInventory = this.normalizePersistedInventoryCapacity(player.inventory);
        if (normalizedInventory.changed) {
          changes.inventory = normalizedInventory.inventory;
          inventoryCapacityBackfilledCount += 1;
        }
      }
      if (Object.keys(changes).length > 0) {
        updates.push({ id: entry.id, changes });
      }
    }

    for (const update of userDisplayUpdates) {
      await this.userRepo.update(update.id, { displayName: update.displayName });
    }
    for (const update of updates) {
      await this.playerRepo.update(update.id, update.changes as any);
    }

    if (defaultDisplayAssignedCount > 0) {
      this.logger.warn(`启动时已将 ${defaultDisplayAssignedCount} 个无效显示名修正为 ${DEFAULT_VISIBLE_DISPLAY_NAME}`);
    }
    if (displayNameNormalizedCount > 0) {
      this.logger.log(`启动时已规范化 ${displayNameNormalizedCount} 个显示名的 Unicode 形式`);
    }
    if (normalizedCount > 0) {
      this.logger.log(`启动时已裁切 ${normalizedCount} 个超长角色名`);
    }
    if (duplicateRenamedCount > 0) {
      this.logger.warn(`启动时已为 ${duplicateRenamedCount} 个重名角色自动追加序号`);
    }
    if (anonymousRoleRenamedCount > 0) {
      this.logger.warn(`启动时已将 ${anonymousRoleRenamedCount} 个透明角色自动改名为 ${DEFAULT_INVISIBLE_ROLE_NAME_BASE}#序号`);
    }
    if (createdAtBackfilledCount > 0) {
      this.logger.log(`启动时已回填 ${createdAtBackfilledCount} 个旧角色的创建时间`);
    }
    if (inventoryCapacityBackfilledCount > 0) {
      this.logger.log(`启动时已将 ${inventoryCapacityBackfilledCount} 个角色的背包容量回填到 ${DEFAULT_INVENTORY_CAPACITY}`);
    }
  }

/** resolvePlayerCreatedAt：执行对应的业务逻辑。 */
  private resolvePlayerCreatedAt(playerId: string, createdAt: Date | null | undefined, userCreatedAt: Date | null): Date | null {
    if (createdAt instanceof Date && Number.isFinite(createdAt.getTime()) && createdAt.getTime() > 0) {
      return createdAt;
    }
/** timestampFromId：定义该变量以承载业务值。 */
    const timestampFromId = this.parsePlayerCreatedAtFromId(playerId);
    if (timestampFromId > 0) {
      return new Date(timestampFromId);
    }
    if (userCreatedAt instanceof Date && Number.isFinite(userCreatedAt.getTime()) && userCreatedAt.getTime() > 0) {
      return userCreatedAt;
    }
    return null;
  }

/** parsePlayerCreatedAtFromId：执行对应的业务逻辑。 */
  private parsePlayerCreatedAtFromId(playerId: string): number {
/** lastUnderscoreIndex：定义该变量以承载业务值。 */
    const lastUnderscoreIndex = playerId.lastIndexOf('_');
    if (lastUnderscoreIndex <= 0 || lastUnderscoreIndex >= playerId.length - 1) {
      return 0;
    }
/** suffix：定义该变量以承载业务值。 */
    const suffix = playerId.slice(lastUnderscoreIndex + 1);
    if (!/^\d{10,}$/.test(suffix)) {
      return 0;
    }
/** parsed：定义该变量以承载业务值。 */
    const parsed = Number.parseInt(suffix, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private allocateDuplicateRoleName(
    baseName: string,
    startSuffix: number,
    occupiedNames: Set<string>,
    minimumSuffix = 2,
  ): { name: string; nextSuffix: number } {
/** suffix：定义该变量以承载业务值。 */
    let suffix = Math.max(minimumSuffix, Math.floor(startSuffix));
    while (true) {
/** suffixText：定义该变量以承载业务值。 */
      const suffixText = `#${suffix}`;
/** candidate：定义该变量以承载业务值。 */
      const candidate = this.appendRoleNameSuffix(baseName, suffixText);
      if (!occupiedNames.has(candidate)) {
        return {
          name: candidate,
          nextSuffix: suffix + 1,
        };
      }
      suffix += 1;
    }
  }

/** appendRoleNameSuffix：执行对应的业务逻辑。 */
  private appendRoleNameSuffix(baseName: string, suffix: string): string {
/** trimmedBase：定义该变量以承载业务值。 */
    let trimmedBase = baseName;
    while (trimmedBase.length > 0 && !isRoleNameWithinLimit(`${trimmedBase}${suffix}`)) {
      trimmedBase = [...trimmedBase].slice(0, -1).join('');
    }
    return `${trimmedBase}${suffix}`;
  }

/** hydratePlayerState：执行对应的业务逻辑。 */
  private hydratePlayerState(
    entity: PlayerEntity,
    displayName: string,
    groups?: Partial<PlayerPersistedGroups> | null,
  ): PlayerState {
/** legacyEnhancementSkillLevel：定义该变量以承载业务值。 */
    const legacyEnhancementSkillLevel = Math.max(1, Math.floor(Number(groups?.settings?.enhancementSkillLevel ?? entity.enhancementSkillLevel) || 1));
/** enhancementSkillFallbackExpToNext：定义该变量以承载业务值。 */
    const enhancementSkillFallbackExpToNext = Math.max(0, this.contentService.getRealmLevelEntry(legacyEnhancementSkillLevel)?.expToNext ?? 60);
/** collections：定义该变量以承载业务值。 */
    const collections = groups?.collections ?? null;
/** settings：定义该变量以承载业务值。 */
    const settings = groups?.settings ?? null;
/** presence：定义该变量以承载业务值。 */
    const presence = groups?.presence ?? null;
/** state：定义该变量以承载业务值。 */
    const state: PlayerState = {
      id: entity.id,
      name: entity.name,
      displayName,
      mapId: entity.mapId,
      respawnMapId: this.mapService.resolvePlayerRespawnMapId(entity.respawnMapId),
      x: entity.x,
      y: entity.y,
      senseQiActive: false,
      facing: (entity.facing as Direction | null) ?? Direction.South,
      viewRange: entity.viewRange ?? VIEW_RADIUS,
      hp: entity.hp,
      maxHp: entity.maxHp,
      qi: entity.qi ?? 0,
      dead: entity.dead,
      foundation: normalizeNonNegativeCounter(entity.foundation),
      combatExp: normalizeNonNegativeCounter(entity.combatExp),
      playerKillCount: normalizeNonNegativeCounter(entity.playerKillCount),
      monsterKillCount: normalizeNonNegativeCounter(entity.monsterKillCount),
      eliteMonsterKillCount: normalizeNonNegativeCounter(entity.eliteMonsterKillCount),
      bossMonsterKillCount: normalizeNonNegativeCounter(entity.bossMonsterKillCount),
      deathCount: normalizeNonNegativeCounter(entity.deathCount),
      boneAgeBaseYears: normalizeBoneAgeBaseYears(entity.boneAgeBaseYears),
      lifeElapsedTicks: normalizeLifeElapsedTicks(entity.lifeElapsedTicks),
      lifespanYears: normalizeLifespanYears(entity.lifespanYears),
      baseAttrs: (entity.baseAttrs ?? { ...DEFAULT_BASE_ATTRS }) as Attributes,
      bonuses: (entity.bonuses ?? []) as AttrBonus[],
      temporaryBuffs: this.normalizeTemporaryBuffs(hydrateTemporaryBuffSnapshots(collections?.temporaryBuffs ?? entity.temporaryBuffs, this.contentService)),
      inventory: hydrateInventorySnapshot(collections?.inventory ?? entity.inventory, this.contentService),
      marketStorage: hydrateMarketStorageSnapshot(collections?.marketStorage ?? entity.marketStorage, this.contentService),
      equipment: hydrateEquipmentSnapshot(collections?.equipment ?? entity.equipment, this.contentService),
      techniques: hydrateTechniqueSnapshots(collections?.techniques ?? entity.techniques),
      bodyTraining: hydrateBodyTrainingSnapshot(collections?.bodyTraining ?? entity.bodyTraining),
      quests: this.normalizeQuests(hydrateQuestSnapshots(collections?.quests ?? entity.quests, this.mapService, this.contentService)),
      questCrossMapNavCooldownUntilLifeTicks: normalizeLifeElapsedTicks(entity.questCrossMapNavCooldownUntilLifeTicks),
      revealedBreakthroughRequirementIds: Array.isArray(entity.revealedBreakthroughRequirementIds)
        ? entity.revealedBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : [],
      heavenGate: this.techniqueService.normalizeHeavenGateState(entity.heavenGate),
      spiritualRoots: this.techniqueService.normalizeHeavenGateRoots(entity.spiritualRoots),
      unlockedMinimapIds: normalizeUnlockedMinimapIds(settings?.unlockedMinimapIds ?? entity.unlockedMinimapIds),
      alchemySkill: normalizeAlchemySkillState(
        settings?.alchemySkill ?? entity.alchemySkill,
        this.contentService.getRealmLevelEntry(1)?.expToNext ?? 60,
      ),
      gatherSkill: normalizeAlchemySkillState(
        settings?.gatherSkill ?? entity.gatherSkill,
        this.contentService.getRealmLevelEntry(1)?.expToNext ?? 60,
      ),
      alchemyPresets: normalizePlayerAlchemyPresets(settings?.alchemyPresets ?? entity.alchemyPresets),
      alchemyJob: normalizePlayerAlchemyJob(settings?.alchemyJob ?? entity.alchemyJob),
      enhancementSkill: normalizeAlchemySkillState(
        Array.isArray(settings?.enhancementRecords ?? entity.enhancementRecords)
          ? {
              level: legacyEnhancementSkillLevel,
              exp: 0,
              expToNext: enhancementSkillFallbackExpToNext,
            }
          : settings?.enhancementRecords ?? entity.enhancementRecords,
        enhancementSkillFallbackExpToNext,
      ),
      enhancementSkillLevel: legacyEnhancementSkillLevel,
      enhancementJob: normalizePlayerEnhancementJob(settings?.enhancementJob ?? entity.enhancementJob),
      enhancementRecords: [],
      autoBattle: settings?.autoBattle ?? entity.autoBattle ?? false,
      autoBattleSkills: ((settings?.autoBattleSkills ?? entity.autoBattleSkills) ?? []) as AutoBattleSkillConfig[],
      autoUsePills: normalizeAutoUsePillConfigs(settings?.autoUsePills ?? entity.autoUsePills),
      combatTargetingRules: normalizeCombatTargetingRules(
        settings?.combatTargetingRules ?? entity.combatTargetingRules,
        buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (settings?.allowAoePlayerHit ?? entity.allowAoePlayerHit) === true }),
      ),
      autoBattleTargetingMode: normalizeAutoBattleTargetingMode(settings?.autoBattleTargetingMode ?? entity.autoBattleTargetingMode),
      combatTargetId: settings?.combatTargetId ?? entity.combatTargetId ?? undefined,
/** combatTargetLocked：定义该变量以承载业务值。 */
      combatTargetLocked: settings?.combatTargetLocked ?? entity.combatTargetLocked === true,
      autoRetaliate: settings?.autoRetaliate ?? entity.autoRetaliate ?? true,
/** autoBattleStationary：定义该变量以承载业务值。 */
      autoBattleStationary: settings?.autoBattleStationary ?? entity.autoBattleStationary === true,
      allowAoePlayerHit: hasCombatTargetingRule(
        normalizeCombatTargetingRules(
          settings?.combatTargetingRules ?? entity.combatTargetingRules,
          buildDefaultCombatTargetingRules({ includeAllPlayersHostile: (settings?.allowAoePlayerHit ?? entity.allowAoePlayerHit) === true }),
        ),
        'hostile',
        'all_players',
      ),
      autoIdleCultivation: settings?.autoIdleCultivation ?? entity.autoIdleCultivation ?? true,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
      autoSwitchCultivation: settings?.autoSwitchCultivation ?? entity.autoSwitchCultivation === true,
      cultivationActive: false,
      actions: [],
      cultivatingTechId: settings?.cultivatingTechId ?? entity.cultivatingTechId ?? undefined,
      pendingLogbookMessages: this.normalizePendingLogbookMessages(entity.pendingLogbookMessages),
      idleTicks: 0,
      online: presence?.online ?? entity.online ?? false,
      inWorld: presence?.inWorld ?? entity.inWorld ?? false,
      lastHeartbeatAt: (presence?.lastHeartbeatAt ?? entity.lastHeartbeatAt)?.getTime(),
      offlineSinceAt: (presence?.offlineSinceAt ?? entity.offlineSinceAt)?.getTime(),
    };
    this.techniqueService.initializePlayerProgression(state);
    this.equipmentService.rebuildBonuses(state);
    return state;
  }

  private resolveRetainedPlayerPosition(player: PlayerState): { mapId: string; x: number; y: number } {
/** placement：定义该变量以承载业务值。 */
    const placement = this.mapService.resolvePlayerPlacement(player.mapId, player.x, player.y, player.id);
    return { mapId: placement.mapId, x: placement.x, y: placement.y };
  }

/** expireRetainedPlayer：执行对应的业务逻辑。 */
  private async expireRetainedPlayer(state: PlayerState): Promise<void> {
    this.techniqueService.stopCultivation(
      state,
      '你离线过久，已退出世界，当前修炼随之中止。',
      'system',
    );
    state.online = false;
    state.inWorld = false;
    state.autoBattle = false;
    state.combatTargetId = undefined;
    state.combatTargetLocked = false;
    state.retaliatePlayerTargetId = undefined;
    state.idleTicks = 0;
    await this.persistPlayerCoreState(state, { force: true });
    await this.persistPlayerCollectionsState(state, { force: true });
    await this.persistPlayerSettingsState(state, { force: true });
    await this.persistPlayerPresenceState(state, { force: true });
    await this.syncPlayerCache(state);
  }

/** persistPlayerPresenceState：执行对应的业务逻辑。 */
  private async persistPlayerPresenceState(state: PlayerState, _options?: { force?: boolean }): Promise<void> {
    const snapshot = this.buildPlayerPresencePersistenceSnapshot(state);
    await this.playerPresenceRepo.save(this.playerPresenceRepo.create({
      playerId: state.id,
      ...snapshot,
    }));
    await this.playerRepo.createQueryBuilder()
      .update(PlayerEntity)
      .set({
        online: snapshot.online,
        inWorld: snapshot.inWorld,
        lastHeartbeatAt: snapshot.lastHeartbeatAt,
        offlineSinceAt: snapshot.offlineSinceAt,
      })
      .where('id = :id', { id: state.id })
      .execute();
  }

/** persistPlayerCollectionsState：执行对应的业务逻辑。 */
  private async persistPlayerCollectionsState(state: PlayerState, options?: { force?: boolean }): Promise<boolean> {
    const persisted = this.buildPersistedCollections(state);
    const snapshot = this.buildPlayerCollectionsPersistenceSnapshot(persisted);
    if (options?.force !== true && !this.hasCollectionsPersistenceSnapshotChanged(state.id, snapshot)) {
      return false;
    }
    await this.playerCollectionsRepo.save(this.playerCollectionsRepo.create({
      playerId: state.id,
      ...this.buildPlayerCollectionsPersistencePayload(snapshot),
    }));
    await this.playerRepo.createQueryBuilder()
      .update(PlayerEntity)
      .set({
        ...this.buildPlayerCollectionsPersistencePayload(snapshot),
      })
      .where('id = :id', { id: state.id })
      .execute();
    this.rememberPersistedCollectionsSnapshot(state.id, snapshot);
    return true;
  }

/** persistPlayerSettingsState：执行对应的业务逻辑。 */
  private async persistPlayerSettingsState(state: PlayerState, options?: { force?: boolean }): Promise<boolean> {
    const snapshot = this.buildPlayerSettingsPersistenceSnapshot(state);
    if (options?.force !== true && !this.hasSettingsPersistenceSnapshotChanged(state.id, snapshot)) {
      return false;
    }
    await this.playerSettingsRepo.save(this.playerSettingsRepo.create({
      playerId: state.id,
      ...this.buildPlayerSettingsPersistencePayload(snapshot),
    }));
    await this.playerRepo.createQueryBuilder()
      .update(PlayerEntity)
      .set({
        ...this.buildPlayerSettingsPersistencePayload(snapshot),
      })
      .where('id = :id', { id: state.id })
      .execute();
    this.rememberPersistedSettingsSnapshot(state.id, snapshot);
    return true;
  }

/** persistPlayerCoreState：执行对应的业务逻辑。 */
  private async persistPlayerCoreState(state: PlayerState, options?: { force?: boolean }): Promise<boolean> {
    this.techniqueService.preparePlayerForPersistence(state);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.buildPlayerCorePersistenceSnapshot(state);
    if (options?.force !== true && !this.hasCorePersistenceSnapshotChanged(state.id, snapshot)) {
      return false;
    }
/** payload：定义该变量以承载业务值。 */
    const payload = this.buildPlayerCorePersistencePayload(snapshot);
    await this.playerRepo.createQueryBuilder()
      .update(PlayerEntity)
      .set({
        name: snapshot.name,
        ...payload,
      })
      .where('id = :id', { id: state.id })
      .execute();
    this.rememberPersistedCoreSnapshot(state.id, snapshot);
    return true;
  }

  private computeOnlineSessionSeconds(startedAt: number | Date | null | undefined, endedAt = Date.now()): number {
/** startTimestamp：定义该变量以承载业务值。 */
    const startTimestamp = startedAt instanceof Date ? startedAt.getTime() : startedAt ?? 0;
    if (!Number.isFinite(startTimestamp) || startTimestamp <= 0) {
      return 0;
    }
    return Math.max(0, Math.floor((endedAt - startTimestamp) / 1000));
  }

  private async settleRecoveredOnlineSession(user: UserEntity, now = Date.now()): Promise<void> {
    if (!user.currentOnlineStartedAt) {
      return;
    }
/** recoveredSeconds：定义该变量以承载业务值。 */
    const recoveredSeconds = this.computeOnlineSessionSeconds(user.currentOnlineStartedAt, now);
    user.totalOnlineSeconds = Math.max(0, Math.floor(user.totalOnlineSeconds ?? 0)) + recoveredSeconds;
    user.currentOnlineStartedAt = null;
    await this.userRepo.save(user);
  }
}
