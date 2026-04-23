import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_BASE_ATTRS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  EQUIP_SLOTS,
  VIEW_RADIUS,
  getBodyTrainingExpToNext,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { PlayerPersistenceService } from '../../persistence/player-persistence.service';
import { MarketRuntimeService } from '../../runtime/market/market-runtime.service';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { NativeManagedAccountService } from './native-managed-account.service';
import { NATIVE_GM_PLAYER_MUTATION_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
/**
 * ManagedAccountEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface ManagedAccountEntryLike {
/**
 * userId：userID标识。
 */

  userId?: string;  
  /**
 * username：username名称或显示文本。
 */

  username?: string;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt?: string;  
  /**
 * totalOnlineSeconds：totalOnlineSecond相关字段。
 */

  totalOnlineSeconds?: number;  
  /**
 * currentOnlineStartedAt：currentOnlineStartedAt相关字段。
 */

  currentOnlineStartedAt?: string;
}
/**
 * ContentTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface ContentTemplateRepositoryLike {
  getItemName(itemId: string): string | null;
  normalizeItem(input: unknown): unknown;
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): any;
}
/**
 * PersistedPlayerEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface PersistedPlayerEntryLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: any;
}
/**
 * PlayerPersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerPersistenceServiceLike {
  loadPlayerSnapshot(playerId: string): Promise<any | null>;
  savePlayerSnapshot(playerId: string, snapshot: any): Promise<void>;
  listPlayerSnapshots(): Promise<PersistedPlayerEntryLike[]>;
}
/**
 * PlayerProgressionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerProgressionServiceLike {
  createRealmStateFromLevel(realmLv: number, progress: number): any;
  initializePlayer(snapshot: any): void;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  snapshot(playerId: string): any;
  buildPersistenceSnapshot(playerId: string): any;
  restoreSnapshot(snapshot: any): void;
  listPlayerSnapshots(): any[];
  rebuildActionState(snapshot: any, tick: number): void;
  markPersisted(playerId: string): void;
  setManagedBodyTrainingLevel(playerId: string, level: number): any;
}
/**
 * MarketRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface MarketRuntimeServiceLike {
  getStorage(playerId: string): { items: any[] };
  runExclusiveMarketMutation(playerId: string, action: (context: any) => Promise<any> | any): Promise<any>;
  setStorage(playerId: string, storage: { items: any[] }, context: any): void;
}
/**
 * WorldRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldRuntimeServiceLike {
  worldRuntimeCommandIntakeFacadeService: {
    enqueueGmUpdatePlayer(input: unknown): void;
    enqueueGmResetPlayer(playerId: string): void;
    enqueueGmSpawnBots(anchorPlayerId: string, count: number): void;
    enqueueGmRemoveBots(playerIds: string[], all: boolean): void;
  };
}
/**
 * NativeManagedAccountServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeManagedAccountServiceLike {
  getManagedAccountIndex(playerIds: string[]): Promise<Map<string, ManagedAccountEntryLike>>;
}

interface GmPlayerDatabaseTableViewLike {
  table: string;
  rowCount: number;
  payload: unknown;
}

const GM_PLAYER_DATABASE_TABLES = [
  'server_player_snapshot',
  'player_presence',
  'player_world_anchor',
  'player_position_checkpoint',
  'player_vitals',
  'player_progression_core',
  'player_attr_state',
  'player_body_training_state',
  'player_wallet',
  'player_inventory_item',
  'player_market_storage_item',
  'player_map_unlock',
  'player_equipment_slot',
  'player_technique_state',
  'player_persistent_buff_state',
  'player_quest_progress',
  'player_combat_preferences',
  'player_auto_battle_skill',
  'player_auto_use_item_rule',
  'player_profession_state',
  'player_alchemy_preset',
  'player_active_job',
  'player_enhancement_record',
  'player_logbook_message',
  'player_recovery_watermark',
  'player_mail',
  'player_mail_attachment',
  'player_mail_counter',
] as const;

const GM_PLAYER_DATABASE_TABLE_ORDER_BY: Partial<Record<(typeof GM_PLAYER_DATABASE_TABLES)[number], string>> = {
  player_wallet: 'ORDER BY wallet_type ASC',
  player_inventory_item: 'ORDER BY slot_index ASC NULLS LAST, item_id ASC',
  player_market_storage_item: 'ORDER BY slot_index ASC NULLS LAST, storage_item_id ASC NULLS LAST, item_id ASC',
  player_map_unlock: 'ORDER BY unlocked_at ASC NULLS LAST, map_id ASC',
  player_equipment_slot: 'ORDER BY slot_type ASC',
  player_technique_state: 'ORDER BY realm_lv ASC NULLS LAST, tech_id ASC',
  player_persistent_buff_state: 'ORDER BY buff_id ASC',
  player_quest_progress: 'ORDER BY quest_id ASC',
  player_auto_battle_skill: 'ORDER BY auto_battle_order ASC, skill_id ASC',
  player_auto_use_item_rule: 'ORDER BY item_id ASC',
  player_profession_state: 'ORDER BY profession_type ASC',
  player_alchemy_preset: 'ORDER BY preset_id ASC',
  player_enhancement_record: 'ORDER BY item_id ASC, record_id ASC',
  player_logbook_message: 'ORDER BY occurred_at DESC, message_id ASC',
  player_mail: 'ORDER BY created_at DESC NULLS LAST, mail_id ASC',
  player_mail_attachment: 'ORDER BY mail_id ASC, attachment_id ASC',
};
/**
 * NativeGmPlayerService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmPlayerService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository ContentTemplateRepositoryLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerPersistenceService PlayerPersistenceServiceLike 参数说明。
 * @param playerProgressionService PlayerProgressionServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @param nextManagedAccountService NativeManagedAccountServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(MapTemplateRepository)
    private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerPersistenceService)
    private readonly playerPersistenceService: PlayerPersistenceServiceLike,
    @Inject(PlayerProgressionService)
    private readonly playerProgressionService: PlayerProgressionServiceLike,
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(MarketRuntimeService)
    private readonly marketRuntimeService: MarketRuntimeServiceLike,
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(NativeManagedAccountService)
    private readonly nextManagedAccountService: NativeManagedAccountServiceLike,
    private readonly databasePoolProvider: DatabasePoolProvider | null = null,
  ) {}  
  /**
 * hasRuntimePlayer：判断运行态玩家是否满足条件。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，完成运行态玩家的条件判断。
 */


  hasRuntimePlayer(playerId: string) {
    return Boolean(this.playerRuntimeService.snapshot(playerId));
  }
  /**
 * getPlayerDetail：读取玩家详情。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，完成玩家详情的读取/组装。
 */


  async getPlayerDetail(playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const account = (await this.nextManagedAccountService.getManagedAccountIndex([playerId])).get(playerId);
    const databaseTables = await this.loadPlayerDatabaseTables(playerId);

    const runtime = this.playerRuntimeService.snapshot(playerId);
    if (runtime) {
      return {
        player: this.toManagedPlayerRecord(
          runtime,
          this.playerRuntimeService.buildPersistenceSnapshot(playerId),
          account,
          databaseTables,
        ),
      };
    }

    const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      return null;
    }

    return {
      player: this.toManagedPlayerRecordFromPersistence(playerId, persisted, account, databaseTables),
    };
  }
  /**
 * updatePlayer：处理玩家并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


  async updatePlayer(playerId: string, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const section = body?.section ?? null;
    const snapshot = body?.snapshot ?? {};

    const runtime = this.playerRuntimeService.snapshot(playerId);
    if (runtime) {
      if (section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmUpdatePlayer({
          playerId,
          mapId: typeof snapshot.mapId === 'string' ? snapshot.mapId : runtime.templateId,
          x: Number.isFinite(snapshot.x) ? snapshot.x : runtime.x,
          y: Number.isFinite(snapshot.y) ? snapshot.y : runtime.y,
          hp: Number.isFinite(snapshot.hp) ? snapshot.hp : runtime.hp,
          autoBattle: typeof snapshot.autoBattle === 'boolean' ? snapshot.autoBattle : runtime.combat.autoBattle === true,
        });
        return;
      }
    }

    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    if (section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
      this.applyPositionToPersistenceSnapshot(persisted, snapshot);
    } else {
      this.applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section);
    }

    await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    if (!runtime || section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      return;
    }

    this.applyPlayerSnapshotMutation(refreshedRuntime, snapshot, section);
    this.repairRuntimeSnapshot(refreshedRuntime);
    refreshedRuntime.selfRevision += 1;
    refreshedRuntime.persistentRevision += 1;
    this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
  }  
  /**
 * resetPlayer：执行reset玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新reset玩家相关状态。
 */


  resetPlayer(playerId: string) {
    this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmResetPlayer(playerId);
  }  
  /**
 * resetPersistedPlayer：判断resetPersisted玩家是否满足条件。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新resetPersisted玩家相关状态。
 */


  async resetPersistedPlayer(playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    const template = this.mapTemplateRepository.getOrThrow('yunlai_town');
    persisted.placement.templateId = template.id;
    persisted.placement.x = template.spawnX;
    persisted.placement.y = template.spawnY;
    persisted.placement.facing = Direction.South;
    persisted.vitals.hp = persisted.vitals.maxHp;
    persisted.vitals.qi = persisted.vitals.maxQi;
    persisted.buffs.buffs = [];
    persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
    persisted.combat.autoBattle = false;
    persisted.combat.combatTargetId = null;
    persisted.combat.combatTargetLocked = false;
    await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
  }  
  /**
 * resetHeavenGate：执行resetHeavenGate相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新resetHeavenGate相关状态。
 */


  async resetHeavenGate(playerId: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    persisted.progression.heavenGate = null;
    persisted.progression.spiritualRoots = null;
    await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    if (!runtime) {
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      return;
    }

    refreshedRuntime.heavenGate = null;
    refreshedRuntime.spiritualRoots = null;
    if (refreshedRuntime.realm) {
      refreshedRuntime.realm.heavenGate = undefined;
    }
    this.repairRuntimeSnapshot(refreshedRuntime);
    refreshedRuntime.selfRevision += 1;
    refreshedRuntime.persistentRevision += 1;
    this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
  }  
  /**
 * setPlayerBodyTrainingLevel：设置玩家炼体等级。
 * @param playerId string 玩家 ID。
 * @param requestedLevel 参数说明。
 * @returns 无返回值，直接更新玩家炼体等级相关状态。
 */


  async setPlayerBodyTrainingLevel(playerId: string, requestedLevel: unknown) {
    const level = this.parseBodyTrainingLevel(requestedLevel);
    if (level === null) {
      throw new BadRequestException('炼体等级必须是非负整数');
    }

    const runtime = this.playerRuntimeService.snapshot(playerId);
    if (!runtime) {
      const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
      if (!persisted) {
        throw new NotFoundException('目标玩家不存在');
      }
      persisted.progression.bodyTraining = this.buildBodyTrainingState(persisted.progression.bodyTraining, level);
      await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
      return;
    }

    this.playerRuntimeService.setManagedBodyTrainingLevel(playerId, level);
    const persisted = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }
    await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    this.playerRuntimeService.markPersisted(playerId);
  }  
  /**
 * addPlayerFoundation：调整玩家底蕴。
 * @param playerId string 玩家 ID。
 * @param requestedAmount 参数说明。
 * @returns 无返回值，直接更新玩家底蕴相关状态。
 */


  async addPlayerFoundation(playerId: string, requestedAmount: unknown) {
    const amount = this.parseCounterDelta(requestedAmount, '底蕴增量');

    await this.mutateManagedPlayer(playerId, {
      mutatePersisted: (persisted) => {
        persisted.progression.foundation = this.applyCounterDelta(persisted.progression.foundation, amount);
      },
      mutateRuntime: (runtime, persisted) => {
        runtime.foundation = persisted.progression.foundation;
      },
    });
  }  
  /**
 * addPlayerCombatExp：调整玩家战斗经验。
 * @param playerId string 玩家 ID。
 * @param requestedAmount 参数说明。
 * @returns 无返回值，直接更新玩家战斗经验相关状态。
 */


  async addPlayerCombatExp(playerId: string, requestedAmount: unknown) {
    const amount = this.parseCounterDelta(requestedAmount, '战斗经验增量');

    await this.mutateManagedPlayer(playerId, {
      mutatePersisted: (persisted) => {
        persisted.progression.combatExp = this.applyCounterDelta(persisted.progression.combatExp, amount);
      },
      mutateRuntime: (runtime, persisted) => {
        runtime.combatExp = persisted.progression.combatExp;
      },
    });
  }  
  /**
 * spawnBots：执行spawnBot相关逻辑。
 * @param anchorPlayerId string anchorPlayer ID。
 * @param count number 数量。
 * @returns 无返回值，直接更新spawnBot相关状态。
 */


  spawnBots(anchorPlayerId: string, count: number) {
    this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmSpawnBots(anchorPlayerId, count);
  }  
  /**
 * removeBots：处理Bot并更新相关状态。
 * @param playerIds string[] player ID 集合。
 * @param all boolean 参数说明。
 * @returns 无返回值，直接更新Bot相关状态。
 */


  removeBots(playerIds: string[], all: boolean) {
    this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmRemoveBots(playerIds, all);
  }  
  /**
 * returnAllPlayersToDefaultSpawn：执行returnAll玩家To默认Spawn相关逻辑。
 * @returns 无返回值，直接更新returnAll玩家ToDefaultSpawn相关状态。
 */


  async returnAllPlayersToDefaultSpawn() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const template = this.mapTemplateRepository.getOrThrow('yunlai_town');

    const runtimePlayers = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId));

    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const runtime of runtimePlayers) {
      this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmResetPlayer(runtime.playerId);
    }

    let updatedOfflinePlayers = 0;
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId)) {
        continue;
      }

      entry.snapshot.placement.templateId = template.id;
      entry.snapshot.placement.x = template.spawnX;
      entry.snapshot.placement.y = template.spawnY;
      entry.snapshot.placement.facing = Direction.South;
      entry.snapshot.vitals.hp = entry.snapshot.vitals.maxHp;
      entry.snapshot.vitals.qi = entry.snapshot.vitals.maxQi;
      entry.snapshot.buffs.buffs = [];
      entry.snapshot.buffs.revision = Math.max(1, (entry.snapshot.buffs.revision ?? 1) + 1);
      entry.snapshot.combat.autoBattle = false;
      entry.snapshot.combat.combatTargetId = null;
      entry.snapshot.combat.combatTargetLocked = false;
      await this.playerPersistenceService.savePlayerSnapshot(entry.playerId, entry.snapshot);
      updatedOfflinePlayers += 1;
    }

    return {
      ok: true,
      totalPlayers: runtimePlayers.length + updatedOfflinePlayers,
      queuedRuntimePlayers: runtimePlayers.length,
      updatedOfflinePlayers,
      targetMapId: template.id,
      targetX: template.spawnX,
      targetY: template.spawnY,
    };
  }  
  /**
 * cleanupAllPlayersInvalidItems：清理全部非机器人的无效物品。
 * @returns 无返回值，直接更新全部无效物品清理相关状态。
 */


  async cleanupAllPlayersInvalidItems() {
    const runtimePlayers = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalInvalidInventoryStacksRemoved = 0;
    let totalInvalidMarketStorageStacksRemoved = 0;
    let totalInvalidEquipmentRemoved = 0;

    for (const runtime of runtimePlayers) {
      let summary;
      try {
        summary = await this.cleanupManagedPlayerInvalidItems(runtime.playerId);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!this.hasInvalidItems(summary)) {
        continue;
      }
      queuedRuntimePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      let summary;
      try {
        summary = await this.cleanupManagedPlayerInvalidItems(entry.playerId);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      if (!this.hasInvalidItems(summary)) {
        continue;
      }
      updatedOfflinePlayers += 1;
      totalInvalidInventoryStacksRemoved += summary.inventoryStacksRemoved;
      totalInvalidMarketStorageStacksRemoved += summary.marketStorageStacksRemoved;
      totalInvalidEquipmentRemoved += summary.equipmentRemoved;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalInvalidInventoryStacksRemoved,
      totalInvalidMarketStorageStacksRemoved,
      totalInvalidEquipmentRemoved,
    };
  }  
  /**
 * compensateAllPlayersCombatExp：补偿全部非机器人的战斗经验。
 * @returns 无返回值，直接更新全部战斗经验补偿相关状态。
 */


  async compensateAllPlayersCombatExp() {
    const runtimePlayers = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalCombatExpGranted = 0;

    for (const runtime of runtimePlayers) {
      const amount = this.calculateCombatExpCompensationForRuntime(runtime);
      if (amount <= 0) {
        continue;
      }

      try {
        await this.addPlayerCombatExp(runtime.playerId, amount);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      queuedRuntimePlayers += 1;
      totalCombatExpGranted += amount;
    }

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      const amount = this.calculateCombatExpCompensationForPersistence(entry.snapshot);
      if (amount <= 0) {
        continue;
      }

      try {
        await this.addPlayerCombatExp(entry.playerId, amount);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      updatedOfflinePlayers += 1;
      totalCombatExpGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalCombatExpGranted,
    };
  }  
  /**
 * compensateAllPlayersFoundation：补偿全部非机器人的底蕴。
 * @returns 无返回值，直接更新全部底蕴补偿相关状态。
 */


  async compensateAllPlayersFoundation() {
    const runtimePlayers = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId));
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    let queuedRuntimePlayers = 0;
    let updatedOfflinePlayers = 0;
    let totalFoundationGranted = 0;

    for (const runtime of runtimePlayers) {
      const amount = this.calculateFoundationCompensationForRuntime(runtime);
      if (amount <= 0) {
        continue;
      }

      try {
        await this.addPlayerFoundation(runtime.playerId, amount);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      queuedRuntimePlayers += 1;
      totalFoundationGranted += amount;
    }

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId) || isNativeGmBotPlayerId(entry.playerId)) {
        continue;
      }

      const amount = this.calculateFoundationCompensationForPersistence(entry.snapshot);
      if (amount <= 0) {
        continue;
      }

      try {
        await this.addPlayerFoundation(entry.playerId, amount);
      } catch (error) {
        if (this.isManagedPlayerMissingError(error)) {
          continue;
        }
        throw error;
      }
      updatedOfflinePlayers += 1;
      totalFoundationGranted += amount;
    }

    return {
      ok: true,
      totalPlayers: queuedRuntimePlayers + updatedOfflinePlayers,
      queuedRuntimePlayers,
      updatedOfflinePlayers,
      totalFoundationGranted,
    };
  }  
  /**
 * applyPlayerSnapshotMutation：处理玩家快照Mutation并更新相关状态。
 * @param next 参数说明。
 * @param snapshot 参数说明。
 * @param section 参数说明。
 * @returns 无返回值，直接更新玩家快照Mutation相关状态。
 */


  private applyPlayerSnapshotMutation(next, snapshot, section) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (section === null || section === 'basic') {
      if (typeof snapshot.name === 'string' && snapshot.name.trim()) {
        next.name = snapshot.name.trim();
      }
      if (typeof snapshot.displayName === 'string' && snapshot.displayName.trim()) {
        next.displayName = snapshot.displayName.trim();
      }
      if (Number.isFinite(snapshot.maxHp)) {
        next.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
      }
      if (Number.isFinite(snapshot.maxQi)) {
        next.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
      }
      if (Number.isFinite(snapshot.hp)) {
        next.hp = clamp(Math.trunc(snapshot.hp), 0, next.maxHp);
      }
      if (Number.isFinite(snapshot.qi)) {
        next.qi = clamp(Math.trunc(snapshot.qi), 0, next.maxQi);
      }
      if (typeof snapshot.dead === 'boolean') {
        next.hp = snapshot.dead ? 0 : Math.max(1, next.hp);
      }
      if (typeof snapshot.autoBattle === 'boolean') {
        next.combat.autoBattle = snapshot.autoBattle;
      }
      if (typeof snapshot.autoRetaliate === 'boolean') {
        next.combat.autoRetaliate = snapshot.autoRetaliate;
      }
      if (typeof snapshot.autoBattleStationary === 'boolean') {
        next.combat.autoBattleStationary = snapshot.autoBattleStationary;
      }
      if (typeof snapshot.allowAoePlayerHit === 'boolean') {
        next.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
      }
      if (typeof snapshot.autoIdleCultivation === 'boolean') {
        next.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
      }
      if (typeof snapshot.autoSwitchCultivation === 'boolean') {
        next.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
      }
      if (typeof snapshot.senseQiActive === 'boolean') {
        next.combat.senseQiActive = snapshot.senseQiActive;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        next.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
      if (Array.isArray(snapshot.temporaryBuffs)) {
        next.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
        next.buffs.revision += 1;
      }
    }

    if (section === 'realm') {
      if (snapshot.baseAttrs && typeof snapshot.baseAttrs === 'object') {
        next.attrs.baseAttrs = { ...DEFAULT_BASE_ATTRS, ...snapshot.baseAttrs };
      }
      if (Number.isFinite(snapshot.foundation)) {
        next.foundation = Math.max(0, Math.trunc(snapshot.foundation));
      }
      if (Number.isFinite(snapshot.combatExp)) {
        next.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
      }

      const realmLv = Number.isFinite(snapshot.realmLv) ? Math.trunc(snapshot.realmLv) : next.realm?.realmLv ?? 1;

      const progress = Number.isFinite(snapshot.realm?.progress)
        ? Math.trunc(snapshot.realm.progress)
        : next.realm?.progress ?? 0;
      next.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
    }

    if (section === 'techniques') {
      if (Array.isArray(snapshot.techniques)) {
        next.techniques.techniques = snapshot.techniques
          .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
          .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
          .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        next.techniques.revision += 1;
      }
      if (
        snapshot.cultivatingTechId === undefined ||
        snapshot.cultivatingTechId === null ||
        typeof snapshot.cultivatingTechId === 'string'
      ) {
        next.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        next.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
    }

    if (section === 'items') {
      if (snapshot.inventory && typeof snapshot.inventory === 'object') {
        if (Number.isFinite(snapshot.inventory.capacity)) {
          next.inventory.capacity = Math.max(DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
        }
        if (Array.isArray(snapshot.inventory.items)) {
          next.inventory.items = snapshot.inventory.items
            .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
            .map((entry) =>
              this.contentTemplateRepository.normalizeItem({
                ...entry,
                itemId: entry.itemId.trim(),
                count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
              }),
            );
          next.inventory.revision += 1;
        }
      }
      if (snapshot.equipment && typeof snapshot.equipment === 'object') {
        for (const slot of EQUIP_SLOTS) {
          if (!(slot in snapshot.equipment)) {
            continue;
          }

          const record = next.equipment.slots.find((entry) => entry.slot === slot);
          if (!record) {
            continue;
          }

          const item = snapshot.equipment[slot];
          record.item = item && typeof item.itemId === 'string' && item.itemId.trim()
            ? this.contentTemplateRepository.normalizeItem({
                ...item,
                itemId: item.itemId.trim(),
                count: 1,
              })
            : null;
        }
        next.equipment.revision += 1;
      }
    }

    if (section === 'quests' && Array.isArray(snapshot.quests)) {
      next.quests.quests = snapshot.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      }));
      next.quests.revision += 1;
    }
  }  
  /**
 * applyPositionToPersistenceSnapshot：判断位置ToPersistence快照是否满足条件。
 * @param persisted 参数说明。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新位置ToPersistence快照相关状态。
 */


  private applyPositionToPersistenceSnapshot(persisted, snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof snapshot.mapId === 'string' && snapshot.mapId.trim()) {
      this.mapTemplateRepository.getOrThrow(snapshot.mapId.trim());
      persisted.placement.templateId = snapshot.mapId.trim();
    }

    const template = this.mapTemplateRepository.getOrThrow(persisted.placement.templateId);
    if (Number.isFinite(snapshot.x)) {
      persisted.placement.x = clamp(Math.trunc(snapshot.x), 0, Math.max(0, template.width - 1));
    }
    if (Number.isFinite(snapshot.y)) {
      persisted.placement.y = clamp(Math.trunc(snapshot.y), 0, Math.max(0, template.height - 1));
    }
    if (Number.isFinite(snapshot.facing)) {
      persisted.placement.facing = Math.trunc(snapshot.facing);
    }
    if (Number.isFinite(snapshot.hp)) {
      persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
    }
    if (typeof snapshot.autoBattle === 'boolean') {
      persisted.combat.autoBattle = snapshot.autoBattle;
    }
  }  
  /**
 * applyPlayerSnapshotMutationToPersistence：判断玩家快照MutationToPersistence是否满足条件。
 * @param persisted 参数说明。
 * @param snapshot 参数说明。
 * @param section 参数说明。
 * @returns 无返回值，直接更新玩家快照MutationToPersistence相关状态。
 */


  private applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (section === null || section === 'basic') {
      if (Number.isFinite(snapshot.maxHp)) {
        persisted.vitals.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
        if (persisted.vitals.hp > persisted.vitals.maxHp) {
          persisted.vitals.hp = persisted.vitals.maxHp;
        }
      }
      if (Number.isFinite(snapshot.maxQi)) {
        persisted.vitals.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
        if (persisted.vitals.qi > persisted.vitals.maxQi) {
          persisted.vitals.qi = persisted.vitals.maxQi;
        }
      }
      if (Number.isFinite(snapshot.hp)) {
        persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
      }
      if (Number.isFinite(snapshot.qi)) {
        persisted.vitals.qi = clamp(Math.trunc(snapshot.qi), 0, persisted.vitals.maxQi);
      }
      if (typeof snapshot.dead === 'boolean') {
        persisted.vitals.hp = snapshot.dead ? 0 : Math.max(1, persisted.vitals.hp);
      }
      if (typeof snapshot.autoBattle === 'boolean') {
        persisted.combat.autoBattle = snapshot.autoBattle;
      }
      if (typeof snapshot.autoRetaliate === 'boolean') {
        persisted.combat.autoRetaliate = snapshot.autoRetaliate;
      }
      if (typeof snapshot.autoBattleStationary === 'boolean') {
        persisted.combat.autoBattleStationary = snapshot.autoBattleStationary;
      }
      if (typeof snapshot.allowAoePlayerHit === 'boolean') {
        persisted.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
      }
      if (typeof snapshot.autoIdleCultivation === 'boolean') {
        persisted.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
      }
      if (typeof snapshot.autoSwitchCultivation === 'boolean') {
        persisted.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
      }
      if (typeof snapshot.senseQiActive === 'boolean') {
        persisted.combat.senseQiActive = snapshot.senseQiActive;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
      if (Array.isArray(snapshot.temporaryBuffs)) {
        persisted.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
        persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
      }
    }

    if (section === 'realm') {
      if (Number.isFinite(snapshot.foundation)) {
        persisted.progression.foundation = Math.max(0, Math.trunc(snapshot.foundation));
      }
      if (Number.isFinite(snapshot.combatExp)) {
        persisted.progression.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
      }

      const realmLv = Number.isFinite(snapshot.realmLv)
        ? Math.trunc(snapshot.realmLv)
        : persisted.progression.realm?.realmLv ?? 1;

      const progress = Number.isFinite(snapshot.realm?.progress)
        ? Math.trunc(snapshot.realm.progress)
        : persisted.progression.realm?.progress ?? 0;
      persisted.progression.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
    }

    if (section === 'techniques') {
      if (Array.isArray(snapshot.techniques)) {
        persisted.techniques.techniques = snapshot.techniques
          .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
          .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
          .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        persisted.techniques.revision = Math.max(1, (persisted.techniques.revision ?? 1) + 1);
      }
      if (
        snapshot.cultivatingTechId === undefined ||
        snapshot.cultivatingTechId === null ||
        typeof snapshot.cultivatingTechId === 'string'
      ) {
        persisted.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
      }
      if (Array.isArray(snapshot.autoBattleSkills)) {
        persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
          .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
          .map((entry) => ({
            skillId: entry.skillId.trim(),
            enabled: entry.enabled !== false,
            skillEnabled: entry.skillEnabled !== false,
            autoBattleOrder: Number.isFinite(entry.autoBattleOrder)
              ? Math.max(0, Math.trunc(entry.autoBattleOrder))
              : undefined,
          }));
      }
    }

    if (section === 'items') {
      if (snapshot.inventory && typeof snapshot.inventory === 'object') {
        if (Number.isFinite(snapshot.inventory.capacity)) {
          persisted.inventory.capacity = Math.max(DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
        }
        if (Array.isArray(snapshot.inventory.items)) {
          persisted.inventory.items = snapshot.inventory.items
            .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
            .map((entry) => ({
              ...entry,
              itemId: entry.itemId.trim(),
              count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
            }));
          persisted.inventory.revision = Math.max(1, (persisted.inventory.revision ?? 1) + 1);
        }
      }
      if (snapshot.equipment && typeof snapshot.equipment === 'object') {
        const nextSlots = [];
        for (const slot of EQUIP_SLOTS) {
          const item = snapshot.equipment[slot];
          nextSlots.push({
            slot,
            item:
              item && typeof item.itemId === 'string' && item.itemId.trim()
                ? {
                    ...item,
                    itemId: item.itemId.trim(),
                    count: 1,
                  }
                : null,
          });
        }
        persisted.equipment.slots = nextSlots;
        persisted.equipment.revision = Math.max(1, (persisted.equipment.revision ?? 1) + 1);
      }
    }

    if (section === 'quests' && Array.isArray(snapshot.quests)) {
      persisted.quests.entries = snapshot.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      }));
      persisted.quests.revision = Math.max(1, (persisted.quests.revision ?? 1) + 1);
    }
  }  
  /**
 * repairRuntimeSnapshot：执行repair运行态快照相关逻辑。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新repair运行态快照相关状态。
 */


  private repairRuntimeSnapshot(snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (snapshot.maxHp < 1) {
      snapshot.maxHp = 1;
    }
    if (snapshot.maxQi < 0) {
      snapshot.maxQi = 0;
    }
    snapshot.hp = clamp(snapshot.hp, 0, snapshot.maxHp);
    snapshot.qi = clamp(snapshot.qi, 0, snapshot.maxQi);
    if (snapshot.realm) {
      snapshot.realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.realm.realmLv, snapshot.realm.progress);
    }
    this.playerProgressionService.initializePlayer(snapshot);
    this.playerRuntimeService.rebuildActionState(snapshot, 0);
  }  
  /**
 * mutateManagedPlayer：统一处理玩家快照的持久化与运行态回写。
 * @param playerId string 玩家 ID。
 * @param input 参数说明。
 * @returns 无返回值，直接更新玩家快照变更相关状态。
 */


  private async mutateManagedPlayer(
    playerId: string,
    input: {
      mutatePersisted: (persisted: any) => void;
      mutateRuntime?: (runtime: any, persisted: any) => void;
    },
  ) {
    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    input.mutatePersisted(persisted);
    await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    if (!runtime) {
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      return;
    }

    if (input.mutateRuntime) {
      input.mutateRuntime(refreshedRuntime, persisted);
    }
    this.repairRuntimeSnapshot(refreshedRuntime);
    refreshedRuntime.selfRevision += 1;
    refreshedRuntime.persistentRevision += 1;
    this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
  }  
  /**
 * cleanupManagedPlayerInvalidItems：清理单个玩家的无效物品与托管仓。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新单个玩家无效物品清理相关状态。
 */


  private async cleanupManagedPlayerInvalidItems(playerId: string) {
    let summary = {
      inventoryStacksRemoved: 0,
      marketStorageStacksRemoved: 0,
      equipmentRemoved: 0,
    };

    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.playerPersistenceService.loadPlayerSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    summary = this.cleanupInvalidItemsFromSnapshot(persisted);
    if (summary.inventoryStacksRemoved > 0 || summary.equipmentRemoved > 0) {
      await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
      if (runtime) {
        const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
        if (refreshedRuntime) {
          const runtimeSummary = this.cleanupInvalidItemsFromSnapshot(refreshedRuntime);
          summary.inventoryStacksRemoved = Math.max(summary.inventoryStacksRemoved, runtimeSummary.inventoryStacksRemoved);
          summary.equipmentRemoved = Math.max(summary.equipmentRemoved, runtimeSummary.equipmentRemoved);
          this.repairRuntimeSnapshot(refreshedRuntime);
          refreshedRuntime.selfRevision += 1;
          refreshedRuntime.persistentRevision += 1;
          this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
        }
      }
    }

    const storageSummary = await this.cleanupInvalidMarketStorage(playerId);
    summary.marketStorageStacksRemoved = storageSummary.marketStorageStacksRemoved;
    return summary;
  }  
  /**
 * cleanupInvalidItemsFromSnapshot：清理背包与装备中的无效物品。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新快照无效物品清理相关状态。
 */


  private cleanupInvalidItemsFromSnapshot(snapshot) {
    const inventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
    const nextInventoryItems = inventoryItems.filter((entry) => this.isValidItem(entry?.itemId));
    const inventoryStacksRemoved = inventoryItems.length - nextInventoryItems.length;
    if (inventoryStacksRemoved > 0 && snapshot.inventory) {
      snapshot.inventory.items = nextInventoryItems;
      if (Number.isFinite(snapshot.inventory.revision)) {
        snapshot.inventory.revision = Math.max(1, Math.trunc(snapshot.inventory.revision) + 1);
      }
    }

    let equipmentRemoved = 0;
    const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
    for (const entry of equipmentSlots) {
      if (!entry?.item || this.isValidItem(entry.item.itemId)) {
        continue;
      }
      entry.item = null;
      equipmentRemoved += 1;
    }
    if (equipmentRemoved > 0 && snapshot.equipment && Number.isFinite(snapshot.equipment.revision)) {
      snapshot.equipment.revision = Math.max(1, Math.trunc(snapshot.equipment.revision) + 1);
    }

    return {
      inventoryStacksRemoved,
      marketStorageStacksRemoved: 0,
      equipmentRemoved,
    };
  }  
  /**
 * cleanupInvalidMarketStorage：清理坊市托管仓中的无效物品。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新托管仓无效物品清理相关状态。
 */


  private async cleanupInvalidMarketStorage(playerId: string) {
    const storage = this.marketRuntimeService.getStorage(playerId);
    const items = Array.isArray(storage?.items) ? storage.items : [];
    const nextItems = items.filter((entry) => this.isValidItem(entry?.item?.itemId));
    const marketStorageStacksRemoved = items.length - nextItems.length;
    if (marketStorageStacksRemoved <= 0) {
      return { marketStorageStacksRemoved: 0 };
    }

    await this.marketRuntimeService.runExclusiveMarketMutation(playerId, (context) => {
      this.marketRuntimeService.setStorage(playerId, { items: nextItems }, context);
      return { ok: true };
    });
    return { marketStorageStacksRemoved };
  }  
  /**
 * isManagedPlayerMissingError：批量快捷执行期间，玩家在枚举后被回收时直接跳过，避免整批 404。
 * @param error 参数说明。
 * @returns 无返回值，完成错误类型判断。
 */


  private isManagedPlayerMissingError(error: unknown) {
    if (error instanceof NotFoundException) {
      return true;
    }
    return error instanceof Error && error.message.includes('目标玩家不存在');
  }
  /**
 * isValidItem：判断道具是否仍存在于内容模板中。
 * @param itemId 参数说明。
 * @returns 无返回值，完成道具有效性的条件判断。
 */


  private isValidItem(itemId: unknown) {
    return typeof itemId === 'string' && itemId.trim().length > 0 && this.contentTemplateRepository.getItemName(itemId.trim()) !== null;
  }  
  /**
 * buildBodyTrainingState：构建炼体状态。
 * @param current 参数说明。
 * @param level number 等级。
 * @returns 无返回值，直接更新炼体状态相关状态。
 */


  private buildBodyTrainingState(current, level: number) {
    const normalizedLevel = Math.max(0, Math.trunc(level));
    const preservedExp = this.normalizeNonNegativeInt(current?.exp);
    const expToNext = getBodyTrainingExpToNext(normalizedLevel);

    return normalizeBodyTrainingState({
      level: normalizedLevel,
      exp: Math.min(preservedExp, Math.max(0, expToNext - 1)),
    });
  }  
  /**
 * parseBodyTrainingLevel：解析炼体等级输入。
 * @param value 参数说明。
 * @returns 无返回值，完成炼体等级解析。
 */


  private parseBodyTrainingLevel(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) {
      return null;
    }
    return Math.trunc(numeric);
  }  
  /**
 * parseCounterDelta：解析整数增量。
 * @param value 参数说明。
 * @param label string 标签。
 * @returns 无返回值，完成整数增量解析。
 */


  private parseCounterDelta(value: unknown, label: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
      throw new BadRequestException(`${label}必须是整数`);
    }
    return Math.trunc(numeric);
  }  
  /**
 * applyCounterDelta：把整数增量应用到计数值。
 * @param currentValue 参数说明。
 * @param amount number 增量。
 * @returns 无返回值，直接更新计数值相关状态。
 */


  private applyCounterDelta(currentValue: unknown, amount: number) {
    return Math.max(0, this.normalizeNonNegativeInt(currentValue) + amount);
  }  
  /**
 * normalizeNonNegativeInt：归一化非负整数。
 * @param value 参数说明。
 * @returns 无返回值，完成非负整数归一化。
 */


  private normalizeNonNegativeInt(value: unknown) {
    return Math.max(0, Math.trunc(Number(value) || 0));
  }  
  /**
 * calculateCombatExpCompensationForRuntime：计算运行态战斗经验补偿。
 * @param player 参数说明。
 * @returns 无返回值，完成运行态战斗经验补偿计算。
 */


  private calculateCombatExpCompensationForRuntime(player) {
    const realmExpToNext = this.normalizeNonNegativeInt(player.realm?.progressToNext);
    const bodyTrainingExpToNext = normalizeBodyTrainingState(player.bodyTraining).expToNext;
    return realmExpToNext + this.normalizeNonNegativeInt(bodyTrainingExpToNext);
  }  
  /**
 * calculateCombatExpCompensationForPersistence：计算持久化快照战斗经验补偿。
 * @param snapshot 参数说明。
 * @returns 无返回值，完成持久化战斗经验补偿计算。
 */


  private calculateCombatExpCompensationForPersistence(snapshot) {
    const realm = this.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );
    const bodyTraining = normalizeBodyTrainingState(snapshot.progression?.bodyTraining);
    return this.normalizeNonNegativeInt(realm.progressToNext) + this.normalizeNonNegativeInt(bodyTraining.expToNext);
  }  
  /**
 * calculateFoundationCompensationForRuntime：计算运行态底蕴补偿。
 * @param player 参数说明。
 * @returns 无返回值，完成运行态底蕴补偿计算。
 */


  private calculateFoundationCompensationForRuntime(player) {
    return this.normalizeNonNegativeInt(player.realm?.progressToNext) * 5;
  }  
  /**
 * calculateFoundationCompensationForPersistence：计算持久化快照底蕴补偿。
 * @param snapshot 参数说明。
 * @returns 无返回值，完成持久化底蕴补偿计算。
 */


  private calculateFoundationCompensationForPersistence(snapshot) {
    const realm = this.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );
    return this.normalizeNonNegativeInt(realm.progressToNext) * 5;
  }  
  /**
 * hasInvalidItems：判断是否存在无效物品清理结果。
 * @param summary 参数说明。
 * @returns 无返回值，完成无效物品清理结果判断。
 */


  private hasInvalidItems(summary: { inventoryStacksRemoved: number; marketStorageStacksRemoved: number; equipmentRemoved: number }) {
    return summary.inventoryStacksRemoved > 0
      || summary.marketStorageStacksRemoved > 0
      || summary.equipmentRemoved > 0;
  }  
  /**
 * toManagedPlayerSummary：执行toManaged玩家摘要相关逻辑。
 * @param snapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家摘要相关状态。
 */


  private toManagedPlayerSummary(snapshot, account = null) {
    const player = this.toLegacyPlayerState(snapshot);

    return {
      id: player.id,
      name: player.name,
      roleName: player.name,
      displayName: player.displayName ?? player.name,
      accountName: account?.username,
      mapId: player.mapId,
      mapName: this.resolveMapName(player.mapId),
      realmLv: player.realmLv ?? 1,
      realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      meta: {
        userId: account?.userId,
        isBot: player.isBot === true,
        online: player.online === true,
        inWorld: player.inWorld !== false,
        dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
      },
    };
  }  
  /**
 * toManagedPlayerRecord：执行toManaged玩家Record相关逻辑。
 * @param snapshot 参数说明。
 * @param persistedSnapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家Record相关状态。
 */


  private toManagedPlayerRecord(snapshot, persistedSnapshot, account = null, databaseTables: GmPlayerDatabaseTableViewLike[] = []) {
    const summary = this.toManagedPlayerSummary(snapshot, account);

    return {
      ...summary,
      account: buildManagedAccountView(account, summary.meta.online === true),
      snapshot: this.toLegacyPlayerState(snapshot),
      persistedSnapshot: persistedSnapshot ?? null,
      databaseTables,
    };
  }  
  /**
 * toManagedPlayerRecordFromPersistence：判断toManaged玩家RecordFromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param persistedSnapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家RecordFromPersistence相关状态。
 */


  private toManagedPlayerRecordFromPersistence(
    playerId,
    persistedSnapshot,
    account = null,
    databaseTables: GmPlayerDatabaseTableViewLike[] = [],
  ) {
    const player = this.toLegacyPlayerStateFromPersistence(playerId, persistedSnapshot);

    return {
      id: player.id,
      name: player.name,
      roleName: player.name,
      displayName: player.displayName ?? player.name,
      accountName: account?.username,
      mapId: player.mapId,
      mapName: this.resolveMapName(player.mapId),
      realmLv: player.realmLv ?? 1,
      realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      meta: {
        userId: account?.userId,
        isBot: player.isBot === true,
        online: false,
        inWorld: false,
        dirtyFlags: [],
      },
      account: buildManagedAccountView(account, false),
      snapshot: player,
      persistedSnapshot,
      databaseTables,
    };
  }  

  private async loadPlayerDatabaseTables(playerId: string): Promise<GmPlayerDatabaseTableViewLike[]> {
    const pool = this.databasePoolProvider?.getPool('gm-player-detail');
    if (!pool) {
      return [];
    }

    const databaseTables: GmPlayerDatabaseTableViewLike[] = [];
    for (const table of GM_PLAYER_DATABASE_TABLES) {
      const orderByClause = GM_PLAYER_DATABASE_TABLE_ORDER_BY[table] ?? '';
      try {
        const result = await pool.query<{ payload?: unknown }>(
          `
            SELECT to_jsonb(t) AS payload
            FROM (
              SELECT *
              FROM ${table}
              WHERE player_id = $1
              ${orderByClause}
            ) AS t
          `,
          [playerId],
        );
        const rows = Array.isArray(result.rows)
          ? result.rows.map((row) => row?.payload ?? null)
          : [];
        databaseTables.push({
          table,
          rowCount: rows.length,
          payload: rows.length === 0 ? null : rows.length === 1 ? rows[0] : rows,
        });
      } catch (error: unknown) {
        databaseTables.push({
          table,
          rowCount: 0,
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return databaseTables;
  }
  /**
 * toLegacyPlayerState：执行toLegacy玩家状态相关逻辑。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态。
 */


  private toLegacyPlayerState(snapshot): any {
    return {
      id: snapshot.playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
      isBot: isNativeGmBotPlayerId(snapshot.playerId),
      online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
      inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
      senseQiActive: snapshot.combat.senseQiActive === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      cultivationActive: snapshot.combat.cultivationActive === true,
      realmLv: snapshot.realm?.realmLv ?? 1,
      realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
      realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
      realmReview: snapshot.realm?.review,
      breakthroughReady: snapshot.realm?.breakthroughReady === true,
      heavenGate: snapshot.heavenGate,
      spiritualRoots: snapshot.spiritualRoots,
      boneAgeBaseYears: snapshot.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.lifeElapsedTicks,
      lifespanYears: snapshot.lifespanYears,
      mapId: snapshot.templateId,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
      viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      dead: snapshot.hp <= 0,
      foundation: snapshot.foundation,
      combatExp: snapshot.combatExp,
      bodyTraining: normalizeBodyTrainingState(snapshot.bodyTraining),
      baseAttrs: { ...snapshot.attrs.baseAttrs },
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
      finalAttrs: { ...snapshot.attrs.finalAttrs },
      numericStats: { ...snapshot.attrs.numericStats },
      ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: snapshot.inventory.items.map((entry) => ({ ...entry })),
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
      actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
      quests: snapshot.quests.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      })),
      autoBattle: snapshot.combat.autoBattle === true,
      autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm: snapshot.realm
        ? {
            ...snapshot.realm,
            heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
            breakthrough: snapshot.realm.breakthrough
              ? {
                  ...snapshot.realm.breakthrough,
                  requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                    ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                    : [],
                }
              : snapshot.realm.breakthrough,
          }
        : undefined,
    };
  }  
  /**
 * toLegacyPlayerStateFromPersistence：判断toLegacy玩家状态FromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态FromPersistence。
 */


  private toLegacyPlayerStateFromPersistence(playerId, snapshot): any {
    const realm = this.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );

    return {
      id: playerId,
      name: playerId,
      displayName: playerId,
      isBot: isNativeGmBotPlayerId(playerId),
      mapId: snapshot.placement.templateId,
      x: snapshot.placement.x,
      y: snapshot.placement.y,
      facing: snapshot.placement.facing,
      viewRange: VIEW_RADIUS,
      hp: snapshot.vitals.hp,
      maxHp: snapshot.vitals.maxHp,
      qi: snapshot.vitals.qi,
      dead: snapshot.vitals.hp <= 0,
      autoBattle: snapshot.combat.autoBattle === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      senseQiActive: snapshot.combat.senseQiActive === true,
      realmLv: realm.realmLv,
      realmName: realm.displayName,
      realmStage: realm.stage,
      realmReview: realm.review,
      breakthroughReady: realm.breakthroughReady,
      heavenGate: snapshot.progression.heavenGate ?? null,
      spiritualRoots: snapshot.progression.spiritualRoots ?? null,
      boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
      lifespanYears: snapshot.progression.lifespanYears,
      foundation: snapshot.progression.foundation,
      combatExp: snapshot.progression.combatExp,
      bodyTraining: normalizeBodyTrainingState(snapshot.progression.bodyTraining),
      baseAttrs: { ...DEFAULT_BASE_ATTRS },
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      techniques: Array.isArray(snapshot.techniques.techniques)
        ? snapshot.techniques.techniques.map((entry) => ({ ...entry }))
        : [],
      actions: [],
      quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
      autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills)
        ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry }))
        : [],
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm,
    };
  }  
  /**
 * resolveMapName：规范化或转换地图名称。
 * @param mapId string 地图 ID。
 * @returns 无返回值，直接更新地图名称相关状态。
 */


  private resolveMapName(mapId: string) {
    try {
      return this.mapTemplateRepository.getOrThrow(mapId).name;
    } catch {
      return mapId;
    }
  }
}
/**
 * buildManagedAccountView：构建并返回目标对象。
 * @param account 参数说明。
 * @param online 参数说明。
 * @returns 无返回值，直接更新ManagedAccount视图相关状态。
 */


function buildManagedAccountView(account, online) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!account?.userId || !account.username) {
    return undefined;
  }

  let totalOnlineSeconds = Number.isFinite(account.totalOnlineSeconds)
    ? Math.max(0, Math.trunc(account.totalOnlineSeconds))
    : 0;
  if (online && typeof account.currentOnlineStartedAt === 'string' && account.currentOnlineStartedAt) {
    const sessionStartedAt = Date.parse(account.currentOnlineStartedAt);
    if (Number.isFinite(sessionStartedAt)) {
      totalOnlineSeconds += Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
    }
  }

  return {
    userId: account.userId,
    username: account.username,
    createdAt: typeof account.createdAt === 'string' && account.createdAt ? account.createdAt : new Date(0).toISOString(),
    totalOnlineSeconds,
  };
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clamp相关状态。
 */


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
/**
 * toLegacyEquipmentSlots：执行toLegacy装备Slot相关逻辑。
 * @param slots 参数说明。
 * @returns 无返回值，直接更新toLegacy装备Slot相关状态。
 */


function toLegacyEquipmentSlots(slots) {
  const bySlot = new Map(slots.map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));

  return {
    weapon: bySlot.get('weapon') ?? null,
    head: bySlot.get('head') ?? null,
    body: bySlot.get('body') ?? null,
    legs: bySlot.get('legs') ?? null,
    accessory: bySlot.get('accessory') ?? null,
  };
}
/**
 * cloneTemporaryBuff：构建TemporaryBuff。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新TemporaryBuff相关状态。
 */


function cloneTemporaryBuff(entry) {
  return {
    ...entry,
    attrs: entry.attrs ? { ...entry.attrs } : undefined,
    stats: entry.stats ? { ...entry.stats } : undefined,
    qiProjection: Array.isArray(entry.qiProjection)
      ? entry.qiProjection.map((projection) => ({ ...projection }))
      : undefined,
  };
}
/**
 * cloneRatioDivisors：判断RatioDivisor是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，直接更新RatioDivisor相关状态。
 */


function cloneRatioDivisors(source) {
  return {
    dodge: source.dodge,
    crit: source.crit,
    breakPower: source.breakPower,
    resolvePower: source.resolvePower,
    cooldownSpeed: source.cooldownSpeed,
    moveSpeed: source.moveSpeed,
    elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
  };
}
