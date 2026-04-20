import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_BASE_ATTRS, VIEW_RADIUS } from '@mud/shared-next';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { PlayerPersistenceService } from '../../persistence/player-persistence.service';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
import { isNextGmBotPlayerId } from './next-gm.constants';
import { NextManagedAccountService } from './next-managed-account.service';
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
}
/**
 * NextManagedAccountServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextManagedAccountServiceLike {
  getManagedAccountIndex(playerIds: string[]): Promise<Map<string, ManagedAccountEntryLike>>;
}
/**
 * RuntimeGmStateServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmStateServiceLike {
  buildPerformanceSnapshot(): any;
  buildSharedGmStatePerf(): any;
}
/**
 * MapTemplateSummaryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateSummaryLike {
/**
 * id：ID标识。
 */

  id: string;
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  listSummaries(): MapTemplateSummaryLike[];
  getOrThrow(mapId: string): {  
  /**
 * name：名称名称或显示文本。
 */
 name: string };
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
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: number;
}
/**
 * PlayerPersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerPersistenceServiceLike {
  listPlayerSnapshots(): Promise<PersistedPlayerEntryLike[]>;
}
/**
 * PlayerProgressionServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerProgressionServiceLike {
  createRealmStateFromLevel(realmLv: number, progress: number): any;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): any[];
}
/**
 * PerformanceTimerState：定义接口结构约束，明确可交付字段含义。
 */


interface PerformanceTimerState {
/**
 * networkPerfStartedAt：networkPerfStartedAt相关字段。
 */

  networkPerfStartedAt: number;  
  /**
 * cpuPerfStartedAt：cpuPerfStartedAt相关字段。
 */

  cpuPerfStartedAt: number;  
  /**
 * pathfindingPerfStartedAt：pathfindingPerfStartedAt相关字段。
 */

  pathfindingPerfStartedAt: number;
}
/**
 * NextGmStateQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextGmStateQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param nextManagedAccountService NextManagedAccountServiceLike 参数说明。
 * @param runtimeGmStateService RuntimeGmStateServiceLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerPersistenceService PlayerPersistenceServiceLike 参数说明。
 * @param playerProgressionService PlayerProgressionServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(NextManagedAccountService)
    private readonly nextManagedAccountService: NextManagedAccountServiceLike,
    @Inject(RuntimeGmStateService)
    private readonly runtimeGmStateService: RuntimeGmStateServiceLike,
    @Inject(MapTemplateRepository)
    private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerPersistenceService)
    private readonly playerPersistenceService: PlayerPersistenceServiceLike,
    @Inject(PlayerProgressionService)
    private readonly playerProgressionService: PlayerProgressionServiceLike,
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeServiceLike,
  ) {}  
  /**
 * getState：读取状态。
 * @param timers PerformanceTimerState 参数说明。
 * @returns 无返回值，完成状态的读取/组装。
 */


  async getState(timers: PerformanceTimerState) {
    const perf = this.buildPerformanceSnapshot(timers);
    const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots();
    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    const accountIndex = await this.nextManagedAccountService.getManagedAccountIndex(
      this.collectManagedPlayerIds(runtimePlayers, persistedEntries),
    );
    const players = this.buildManagedPlayers(runtimePlayers, persistedEntries, accountIndex);

    return {
      players,
      mapIds: this.mapTemplateRepository
        .listSummaries()
        .map((entry) => entry.id)
        .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
      botCount: players.reduce((count, snapshot) => count + (snapshot.meta.isBot ? 1 : 0), 0),
      perf,
    };
  }  
  /**
 * collectManagedPlayerIds：执行Managed玩家ID相关逻辑。
 * @param runtimePlayers 参数说明。
 * @param persistedEntries 参数说明。
 * @returns 无返回值，直接更新Managed玩家ID相关状态。
 */


  private collectManagedPlayerIds(runtimePlayers, persistedEntries) {
    return [...runtimePlayers.map((entry) => entry.playerId), ...persistedEntries.map((entry) => entry.playerId)];
  }  
  /**
 * buildManagedPlayers：构建并返回目标对象。
 * @param runtimePlayers 参数说明。
 * @param persistedEntries 参数说明。
 * @param accountIndex 参数说明。
 * @returns 无返回值，直接更新Managed玩家相关状态。
 */


  private buildManagedPlayers(runtimePlayers, persistedEntries, accountIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const players = runtimePlayers
      .map((snapshot) => this.toManagedPlayerSummary(snapshot, accountIndex.get(snapshot.playerId)))
      .sort(compareManagedPlayerSummary);
    const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));

    for (const entry of persistedEntries) {
      if (runtimePlayerIds.has(entry.playerId)) {
        continue;
      }

      players.push(
        this.toManagedPlayerSummaryFromPersistence(
          entry.playerId,
          entry.snapshot,
          entry.updatedAt,
          accountIndex.get(entry.playerId),
        ),
      );
    }

    players.sort(compareManagedPlayerSummary);
    return players;
  }  
  /**
 * buildPerformanceSnapshot：构建并返回目标对象。
 * @param timers PerformanceTimerState 参数说明。
 * @returns 无返回值，直接更新Performance快照相关状态。
 */


  private buildPerformanceSnapshot(timers: PerformanceTimerState) {
    const perf: any = this.runtimeGmStateService.buildPerformanceSnapshot();
    const now = Date.now();
    const sharedGmStatePerf: any = this.runtimeGmStateService.buildSharedGmStatePerf();

    return {
      ...perf,
      cpu: {
        ...perf.cpu,
        profileStartedAt: timers.cpuPerfStartedAt,
        profileElapsedSec: roundMetric(Math.max(0, (now - timers.cpuPerfStartedAt) / 1000)),
      },
      pathfinding: {
        ...perf.pathfinding,
        ...sharedGmStatePerf,
        statsStartedAt: timers.pathfindingPerfStartedAt,
        statsElapsedSec: roundMetric(Math.max(0, (now - timers.pathfindingPerfStartedAt) / 1000)),
      },
      networkStatsStartedAt: timers.networkPerfStartedAt,
      networkStatsElapsedSec: roundMetric(Math.max(0, (now - timers.networkPerfStartedAt) / 1000)),
    };
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
 * toManagedPlayerSummaryFromPersistence：判断toManaged玩家摘要FromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param snapshot 参数说明。
 * @param updatedAt 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家摘要FromPersistence相关状态。
 */


  private toManagedPlayerSummaryFromPersistence(playerId, snapshot, updatedAt, account = null) {
    const player = this.toLegacyPlayerStateFromPersistence(playerId, snapshot);

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
        updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : undefined,
        dirtyFlags: [],
      },
    };
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
      isBot: isNextGmBotPlayerId(snapshot.playerId),
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
      isBot: isNextGmBotPlayerId(playerId),
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
 * compareManagedPlayerSummary：执行compareManaged玩家摘要相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareManaged玩家摘要相关状态。
 */


function compareManagedPlayerSummary(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (left.meta.isBot !== right.meta.isBot) {
    return left.meta.isBot ? 1 : -1;
  }

  if (left.meta.online !== right.meta.online) {
    return left.meta.online ? -1 : 1;
  }

  if (left.mapName !== right.mapName) {
    return left.mapName.localeCompare(right.mapName, 'zh-Hans-CN');
  }

  return left.roleName.localeCompare(right.roleName, 'zh-Hans-CN');
}
/**
 * roundMetric：执行roundMetric相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新roundMetric相关状态。
 */


function roundMetric(value) {
  return Math.round(value * 100) / 100;
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
