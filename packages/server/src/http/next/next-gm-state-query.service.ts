import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_BASE_ATTRS, VIEW_RADIUS } from '@mud/shared-next';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { PlayerPersistenceService } from '../../persistence/player-persistence.service';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
import { isNextGmBotPlayerId } from './next-gm.constants';
import { NextManagedAccountService } from './next-managed-account.service';

interface ManagedAccountEntryLike {
  userId?: string;
  username?: string;
}

interface NextManagedAccountServiceLike {
  getManagedAccountIndex(playerIds: string[]): Promise<Map<string, ManagedAccountEntryLike>>;
}

interface RuntimeGmStateServiceLike {
  buildPerformanceSnapshot(): any;
  buildSharedGmStatePerf(): any;
}

interface MapTemplateSummaryLike {
  id: string;
}

interface MapTemplateRepositoryLike {
  listSummaries(): MapTemplateSummaryLike[];
  getOrThrow(mapId: string): { name: string };
}

interface PersistedPlayerEntryLike {
  playerId: string;
  snapshot: any;
  updatedAt: number;
}

interface PlayerPersistenceServiceLike {
  listPlayerSnapshots(): Promise<PersistedPlayerEntryLike[]>;
}

interface PlayerProgressionServiceLike {
  createRealmStateFromLevel(realmLv: number, progress: number): any;
}

interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): any[];
}

interface PerformanceTimerState {
  networkPerfStartedAt: number;
  cpuPerfStartedAt: number;
  pathfindingPerfStartedAt: number;
}

@Injectable()
export class NextGmStateQueryService {
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

  private collectManagedPlayerIds(runtimePlayers, persistedEntries) {
    return [...runtimePlayers.map((entry) => entry.playerId), ...persistedEntries.map((entry) => entry.playerId)];
  }

  private buildManagedPlayers(runtimePlayers, persistedEntries, accountIndex) {
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

  private resolveMapName(mapId: string) {
    try {
      return this.mapTemplateRepository.getOrThrow(mapId).name;
    } catch {
      return mapId;
    }
  }
}

function compareManagedPlayerSummary(left, right) {
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

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

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
