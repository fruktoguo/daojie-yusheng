/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 玩家管理服务。
 * 提供玩家详情查询、快照修改、重置、炼体/底蕴/战斗经验调整、
 * 机器人生成/移除、批量回城、无效物品清理和补偿等 GM 操作。
 */
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  ARTIFACT_SLOTS,
  EQUIP_SLOTS,
  DUNGEON_MAX_STAMINA,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  VIEW_RADIUS,
  getBodyTrainingExpToNext,
  mergeItemStackInto,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { resolveCraftSkillExpToNextByLevel } from '../../runtime/craft/craft-skill-exp.helpers';
import { reassignItemInstanceId } from '../../runtime/world/item-instance-id.helpers';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService, type GmAuditLogEntry } from '../../persistence/gm-audit-log-persistence.service';
import { MarketStorageItemIdConversion } from '../../gm/compat-conversions/conversions/market/market-storage-item-id';
import { releasePlayerFlushStartupStall } from '../../persistence/player-flush-startup-stall-release';
import { QuestProgressPayloadConversion } from '../../gm/compat-conversions/conversions/quest/quest-progress-payload';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { ActivityPersistenceService } from '../../persistence/activity-persistence.service';
import { MarketRuntimeService } from '../../runtime/market/market-runtime.service';
import { PlayerProgressionService } from '../../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { createRuntimeTemporaryBuff, materializeRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { NativeManagedAccountService } from './native-managed-account.service';
import { NATIVE_GM_PLAYER_MUTATION_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
import { buildNativeGmPlayerRiskView } from './native-gm-player-risk';
import type { GmActorContext } from './native-gm-actor-context';
import {
  addRecoveryPillMigrationSummary,
  asGmItemRecord,
  buildManagedAccountView,
  clamp,
  cloneRatioDivisors,
  createEmptyRecoveryPillMigrationSummary,
  decodePersistedRawBaseAttrs,
  encodePersistedRawBaseAttrs,
  hasRecoveryPillMigration,
  isLegacyRecoveryPillItemId,
  normalizeGmItemString,
  normalizeRawBaseAttrs,
  normalizeStableGmItemInstanceId,
  resolveManagedPlayerDisplayName,
  resolveManagedPlayerName,
  resolveRecoveryPillMigrationTarget,
  toLegacyArtifactSlots,
  toLegacyEquipmentSlots,
  writeGmItemOwnProperty,
  type RecoveryPillMigrationSummary,
} from './native-gm-player.helpers';
import type {
  ActivityPersistenceServiceLike,
  ContentTemplateRepositoryLike,
  GmPlayerDatabaseTableViewLike,
  GmPlayerScopeOptions,
  MapTemplateRepositoryLike,
  MarketRuntimeServiceLike,
  NativeManagedAccountServiceLike,
  PersistedPlayerEntryLike,
  PlayerDomainPersistenceServiceLike,
  PlayerProgressionServiceLike,
  PlayerRuntimeServiceLike,
  WorldRuntimeServiceLike,
} from './native-gm-player.ports';
import {
applyCounterDeltaImpl,applyCraftSkillSnapshotMutationImpl,applyCraftSkillSnapshotMutationToPersistenceImpl,applyPlayerSnapshotMutationImpl,applyPlayerSnapshotMutationToPersistenceImpl,applyPositionToPersistenceSnapshotImpl,buildBodyTrainingStateImpl,buildStarterPersistenceSnapshotImpl,getGmUpdateProjectionDomainsImpl,hydrateGmTechniqueSnapshotImpl,normalizeGmCraftSkillStateImpl,normalizeGmEditedItemInstanceIdImpl,normalizeGmEquipmentItemForSaveImpl,normalizeGmInventoryItemForSaveImpl,normalizeNonNegativeIntImpl,parseBodyTrainingLevelImpl,parseCounterDeltaImpl,parseNonNegativeIntegerImpl,repairRuntimeSnapshotImpl} from './native-gm-player.snapshot';
import {
calculateCombatExpCompensationForPersistenceImpl,calculateCombatExpCompensationForRuntimeImpl,calculateFoundationCompensationForPersistenceImpl,calculateFoundationCompensationForRuntimeImpl,cleanupAllPlayersInvalidItemsImpl,cleanupInvalidItemsFromSnapshotImpl,compensateAllPlayersCombatExpImpl,compensateAllPlayersFoundationImpl,createMigratedRecoveryPillItemImpl,hasInvalidItemsImpl,isManagedPlayerMissingErrorImpl,isStaminaRefillRuntimePlayerImpl,isValidItemImpl,migrateAllPlayersRecoveryPillsImpl,migrateRecoveryPillItemArrayImpl,migrateRecoveryPillsFromSnapshotImpl,normalizePlayerIdScopeImpl,readMarketStorageCleanupItemIdImpl,refillOnlineAndOfflineHangingPlayersStaminaImpl,refreshOnlinePlayerTechniqueTemplatesImpl,releasePlayerFlushStartupStallImpl,repairMarketStorageItemIdsImpl,repairQuestProgressPayloadsImpl,returnAllPlayersToDefaultSpawnImpl} from './native-gm-player.batch';
import {
buildPlayerAuditEntryImpl,loadManagedMonthCardViewImpl,loadPlayerDatabaseTablesImpl,resolveMapNameImpl,toLegacyPlayerStateFromPersistenceImpl,toLegacyPlayerStateImpl,toManagedMonthCardViewImpl,toManagedPlayerRecordFromPersistenceImpl,toManagedPlayerRecordImpl,toManagedPlayerSummaryImpl} from './native-gm-player.views';

/**
 * GmMutationAuditOptions：调用方传入的 audit hook，落 gm_audit_log。
 *
 * - op：操作类型 key（点分命名）：gm.player.update / gm.player.add_combat_exp 等；
 * - actor：当前请求 actor 上下文，由 controller 从 request.gmActor 提取；
 * - describeBefore / describeAfter：从 persisted snapshot 提取关键字段摘要的纯函数；
 *   不要直接传 persisted 整个对象 —— 只取与本次操作语义相关的字段；
 * - describeDelta：可选，用于把 before/after 比对成 delta 摘要；缺省则不写 delta_jsonb。
 */
export interface GmMutationAuditOptions {
  op: string;
  actor?: GmActorContext | null;
  describeBefore?: (persisted: any) => unknown;
  describeAfter?: (persisted: any) => unknown;
  describeDelta?: (snapshot: { before: unknown; after: unknown }) => unknown;
}

/** 安全调用 describe 函数：异常时返回 { describeError } 占位，不抛。 */
export function safeDescribe<T>(fn: ((arg: T) => unknown) | undefined, arg: T): unknown {
  if (typeof fn !== 'function') {
    return undefined;
  }
  try {
    return fn(arg);
  } catch (error) {
    return { describeError: error instanceof Error ? error.message : String(error) };
  }
}

export const GM_GENERATED_TECHNIQUE_LEGACY_DRAFT_ERROR = '该自创术法仍含旧版草稿字段，请先执行“迁移旧版AI术法草稿”后再添加。';

export const GM_PLAYER_DATABASE_TABLES = [
  'player_presence',
  'player_world_anchor',
  'player_position_checkpoint',
  'player_vitals',
  'player_progression_core',
  'player_attr_state',
  'player_body_training_state',
  'player_wallet',
  'player_merit_month_card',
  'player_merit_month_card_claim',
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

export const GM_PLAYER_DATABASE_TABLE_ORDER_BY: Partial<Record<(typeof GM_PLAYER_DATABASE_TABLES)[number], string>> = {
  player_wallet: 'ORDER BY wallet_type ASC',
  player_merit_month_card_claim: 'ORDER BY claim_date DESC',
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

export const GM_CRAFT_SKILL_KEYS = [
  'alchemySkill',
  'forgingSkill',
  'enhancementSkill',
  'transmissionSkill',
  'formationSkill',
  'gatherSkill',
  'miningSkill',
  'buildingSkill',
] as const;

export const GM_RESET_PLAYER_PERSISTENCE_DOMAINS = [
  'world_anchor',
  'position_checkpoint',
  'vitals',
  'buff',
  'combat_pref',
] as const;
const GM_BODY_TRAINING_PERSISTENCE_DOMAINS = ['body_training', 'progression', 'attr'] as const;
/**
 * NativeGmPlayerService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmPlayerService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository ContentTemplateRepositoryLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param playerDomainPersistenceService PlayerDomainPersistenceServiceLike 参数说明。
 * @param playerProgressionService PlayerProgressionServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @param nextManagedAccountService NativeManagedAccountServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(ContentTemplateRepository)
    readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(MapTemplateRepository)
    readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(PlayerDomainPersistenceService)
    readonly playerDomainPersistenceService: PlayerDomainPersistenceServiceLike,
    @Inject(PlayerProgressionService)
    readonly playerProgressionService: PlayerProgressionServiceLike,
    @Inject(PlayerRuntimeService)
    readonly playerRuntimeService: PlayerRuntimeServiceLike,
    @Inject(MarketRuntimeService)
    readonly marketRuntimeService: MarketRuntimeServiceLike,
    @Inject(WorldRuntimeService)
    readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Inject(NativeManagedAccountService)
    readonly nextManagedAccountService: NativeManagedAccountServiceLike,
    @Inject(DatabasePoolProvider)
    readonly databasePoolProvider: DatabasePoolProvider | null = null,
    @Inject(GmAuditLogPersistenceService)
    readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
    @Optional() @Inject(ActivityPersistenceService)
    readonly activityPersistenceService: ActivityPersistenceServiceLike | null = null,
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
        player: await this.toManagedPlayerRecord(
          runtime,
          this.playerRuntimeService.buildPersistenceSnapshot(playerId),
          account,
          databaseTables,
        ),
      };
    }

    const persisted = await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      return null;
    }

    return {
      player: await this.toManagedPlayerRecordFromPersistence(playerId, persisted, account, databaseTables),
    };
  }
  /**
 * updatePlayer：处理玩家并更新相关状态。
 * @param playerId string 玩家 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


  async updatePlayer(playerId: string, body, actor?: GmActorContext | null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const section = body?.section ?? null;
    const snapshot = body?.snapshot ?? {};

    const runtime = this.playerRuntimeService.snapshot(playerId);
    if (runtime) {
      if (section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmUpdatePlayer({
          playerId,
          instanceId: typeof snapshot.instanceId === 'string' ? snapshot.instanceId : undefined,
          mapId: typeof snapshot.mapId === 'string' ? snapshot.mapId : runtime.templateId,
          x: Number.isFinite(snapshot.x) ? snapshot.x : runtime.x,
          y: Number.isFinite(snapshot.y) ? snapshot.y : runtime.y,
          hp: Number.isFinite(snapshot.hp) ? snapshot.hp : runtime.hp,
          autoBattle: typeof snapshot.autoBattle === 'boolean' ? snapshot.autoBattle : runtime.combat.autoBattle === true,
        });
        // N45：runtime queue 路径只是排队意图，真正落库会异步发生；这里记录 enqueue 事件本身，
        // 让 audit 链可观测到"GM 触发的 runtime queue update"，便于 GM 操作复盘。
        await this.recordGmAuditEntry({
          op: 'gm.player.update',
          targetType: 'player',
          targetId: playerId,
          actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
          before: { section: 'runtime-queue-enqueue' },
          after: {
            instanceId: typeof snapshot.instanceId === 'string' ? snapshot.instanceId : null,
            mapId: typeof snapshot.mapId === 'string' ? snapshot.mapId : runtime.templateId,
            x: Number.isFinite(snapshot.x) ? snapshot.x : runtime.x,
            y: Number.isFinite(snapshot.y) ? snapshot.y : runtime.y,
            hp: Number.isFinite(snapshot.hp) ? snapshot.hp : runtime.hp,
            autoBattle: typeof snapshot.autoBattle === 'boolean' ? snapshot.autoBattle : runtime.combat.autoBattle === true,
          },
          delta: { section, async: true },
          success: true,
          errorMessage: null,
        });
        return;
      }
    }

    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      await this.recordGmAuditEntry({
        op: 'gm.player.update',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: undefined,
        after: undefined,
        delta: { section, snapshot },
        success: false,
        errorMessage: '目标玩家不存在',
      });
      throw new NotFoundException('目标玩家不存在');
    }

    // 仅记录 section + 修改字段名，避免把整份 persisted 复制进 audit_log（payload 过大且含敏感字段）。
    const beforeSummary = {
      section,
      placement: { ...(persisted?.placement ?? {}) },
      vitals: { ...(persisted?.vitals ?? {}) },
    };

    if (section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
      this.applyPositionToPersistenceSnapshot(persisted, snapshot);
    } else {
      this.applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section);
    }

    await this.savePlayerPersistenceSnapshotForGmUpdate(playerId, persisted, section, snapshot);
    if (!runtime || section === NATIVE_GM_PLAYER_MUTATION_CONTRACT.runtimeQueueSection) {
      await this.recordGmAuditEntry({
        op: 'gm.player.update',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: beforeSummary,
        after: {
          section,
          placement: { ...(persisted?.placement ?? {}) },
          vitals: { ...(persisted?.vitals ?? {}) },
        },
        delta: { section, snapshotKeys: Object.keys(snapshot ?? {}) },
        success: true,
        errorMessage: null,
      });
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      await this.recordGmAuditEntry({
        op: 'gm.player.update',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: beforeSummary,
        after: { section },
        success: true,
        errorMessage: null,
      });
      return;
    }

    this.applyPlayerSnapshotMutation(refreshedRuntime, snapshot, section);
    this.repairRuntimeSnapshot(refreshedRuntime);
    refreshedRuntime.selfRevision += 1;
    refreshedRuntime.persistentRevision += 1;
    this.playerRuntimeService.restoreSnapshot(refreshedRuntime);

    await this.recordGmAuditEntry({
      op: 'gm.player.update',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: beforeSummary,
      after: {
        section,
        placement: { ...(persisted?.placement ?? {}) },
        vitals: { ...(persisted?.vitals ?? {}) },
      },
      delta: { section, snapshotKeys: Object.keys(snapshot ?? {}) },
      success: true,
      errorMessage: null,
    });
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


  async resetPersistedPlayer(playerId: string, actor?: GmActorContext | null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const persisted = await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      await this.recordGmAuditEntry({
        op: 'gm.player.reset_persisted',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        success: false,
        errorMessage: '目标玩家不存在',
      });
      throw new NotFoundException('目标玩家不存在');
    }

    const template = this.mapTemplateRepository.getOrThrow('yunlai_town');
    const beforeSummary = {
      placement: { ...(persisted?.placement ?? {}) },
      vitals: { ...(persisted?.vitals ?? {}) },
      buffsRevision: persisted?.buffs?.revision ?? null,
      autoBattle: persisted?.combat?.autoBattle ?? null,
    };

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
    await this.savePlayerPersistenceSnapshotDomains(
      playerId,
      persisted,
      GM_RESET_PLAYER_PERSISTENCE_DOMAINS,
      { allowBuffEmptyOverwrite: true },
    );

    await this.recordGmAuditEntry({
      op: 'gm.player.reset_persisted',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: beforeSummary,
      after: {
        placement: { ...(persisted?.placement ?? {}) },
        vitals: { ...(persisted?.vitals ?? {}) },
        buffsRevision: persisted?.buffs?.revision ?? null,
        autoBattle: persisted?.combat?.autoBattle ?? null,
      },
      success: true,
      errorMessage: null,
    });
  }
  /**
 * resetHeavenGate：执行resetHeavenGate相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新resetHeavenGate相关状态。
 */


  async resetHeavenGate(playerId: string, actor?: GmActorContext | null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      await this.recordGmAuditEntry({
        op: 'gm.player.reset_heaven_gate',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        success: false,
        errorMessage: '目标玩家不存在',
      });
      throw new NotFoundException('目标玩家不存在');
    }
    const beforeSummary = {
      heavenGate: persisted?.progression?.heavenGate ?? null,
      spiritualRoots: persisted?.progression?.spiritualRoots ?? null,
    };

    persisted.progression.heavenGate = null;
    persisted.progression.spiritualRoots = null;
    await this.savePlayerPersistenceSnapshotDomains(playerId, persisted, ['attr']);
    if (!runtime) {
      await this.recordGmAuditEntry({
        op: 'gm.player.reset_heaven_gate',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: beforeSummary,
        after: { heavenGate: null, spiritualRoots: null },
        success: true,
        errorMessage: null,
      });
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      await this.recordGmAuditEntry({
        op: 'gm.player.reset_heaven_gate',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: beforeSummary,
        after: { heavenGate: null, spiritualRoots: null },
        success: true,
        errorMessage: null,
      });
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

    await this.recordGmAuditEntry({
      op: 'gm.player.reset_heaven_gate',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: beforeSummary,
      after: { heavenGate: null, spiritualRoots: null },
      success: true,
      errorMessage: null,
    });
  }
  /**
 * setPlayerBodyTrainingLevel：设置玩家炼体等级。
 * @param playerId string 玩家 ID。
 * @param requestedLevel 参数说明。
 * @returns 无返回值，直接更新玩家炼体等级相关状态。
 */


  async setPlayerBodyTrainingLevel(playerId: string, requestedLevel: unknown, actor?: GmActorContext | null) {
    const level = this.parseBodyTrainingLevel(requestedLevel);
    if (level === null) {
      throw new BadRequestException('炼体等级必须是非负整数');
    }

    const runtime = this.playerRuntimeService.snapshot(playerId);
    if (!runtime) {
      const persisted = await this.loadPlayerPersistenceSnapshot(playerId);
      if (!persisted) {
        await this.recordGmAuditEntry({
          op: 'gm.player.set_body_training_level',
          targetType: 'player',
          targetId: playerId,
          actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
          before: undefined,
          after: undefined,
          delta: { requestedLevel: level },
          success: false,
          errorMessage: '目标玩家不存在',
        });
        throw new NotFoundException('目标玩家不存在');
      }
      const beforeLevel = persisted?.progression?.bodyTraining?.level ?? null;
      persisted.progression.bodyTraining = this.buildBodyTrainingState(persisted.progression.bodyTraining, level);
      await this.savePlayerPersistenceSnapshotDomains(playerId, persisted, ['body_training']);
      await this.recordGmAuditEntry({
        op: 'gm.player.set_body_training_level',
        targetType: 'player',
        targetId: playerId,
        actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { bodyTrainingLevel: beforeLevel },
        after: { bodyTrainingLevel: level },
        delta: { from: beforeLevel, to: level },
        success: true,
        errorMessage: null,
      });
      return;
    }

    const beforePersisted = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
    const beforeLevel = beforePersisted?.progression?.bodyTraining?.level ?? null;

    this.playerRuntimeService.setManagedBodyTrainingLevel(playerId, level);
    const snapshotRevision = this.playerRuntimeService.getPersistenceRevision(playerId);
    const persisted = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }
    await this.savePlayerPersistenceSnapshotDomains(
      playerId,
      persisted,
      GM_BODY_TRAINING_PERSISTENCE_DOMAINS,
    );
    this.playerRuntimeService.markPersisted(
      playerId,
      GM_BODY_TRAINING_PERSISTENCE_DOMAINS,
      snapshotRevision,
    );
    await this.recordGmAuditEntry({
      op: 'gm.player.set_body_training_level',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: { bodyTrainingLevel: beforeLevel },
      after: { bodyTrainingLevel: persisted?.progression?.bodyTraining?.level ?? level },
      delta: { from: beforeLevel, to: level },
      success: true,
      errorMessage: null,
    });
  }
  /**
 * addPlayerFoundation：调整玩家底蕴。
 * @param playerId string 玩家 ID。
 * @param requestedAmount 参数说明。
 * @returns 无返回值，直接更新玩家底蕴相关状态。
 */


  async addPlayerFoundation(playerId: string, requestedAmount: unknown, actor?: GmActorContext | null) {
    const amount = this.parseCounterDelta(requestedAmount, '底蕴增量');

    await this.mutateManagedPlayer(playerId, {
      domains: ['progression'],
      mutatePersisted: (persisted) => {
        persisted.progression.foundation = this.applyCounterDelta(persisted.progression.foundation, amount);
      },
      mutateRuntime: (runtime, persisted) => {
        runtime.foundation = persisted.progression.foundation;
      },
      audit: {
        op: 'gm.player.add_foundation',
        actor: actor ?? null,
        describeBefore: (persisted) => ({ foundation: persisted?.progression?.foundation ?? null }),
        describeAfter: (persisted) => ({ foundation: persisted?.progression?.foundation ?? null }),
        describeDelta: () => ({ amount }),
      },
    });
  }
  /**
 * addPlayerCombatExp：调整玩家战斗经验。
 * @param playerId string 玩家 ID。
 * @param requestedAmount 参数说明。
 * @returns 无返回值，直接更新玩家战斗经验相关状态。
 */


  async addPlayerCombatExp(playerId: string, requestedAmount: unknown, actor?: GmActorContext | null) {
    const amount = this.parseCounterDelta(requestedAmount, '战斗经验增量');

    await this.mutateManagedPlayer(playerId, {
      domains: ['progression'],
      mutatePersisted: (persisted) => {
        persisted.progression.combatExp = this.applyCounterDelta(persisted.progression.combatExp, amount);
      },
      mutateRuntime: (runtime, persisted) => {
        runtime.combatExp = persisted.progression.combatExp;
      },
      audit: {
        op: 'gm.player.add_combat_exp',
        actor: actor ?? null,
        describeBefore: (persisted) => ({ combatExp: persisted?.progression?.combatExp ?? null }),
        describeAfter: (persisted) => ({ combatExp: persisted?.progression?.combatExp ?? null }),
        describeDelta: () => ({ amount }),
      },
    });
  }
  /**
 * setPlayerMonthCardPool：设置玩家功德月卡池。
 * @param playerId string 玩家 ID。
 * @param requestedTotalPool unknown 总池。
 * @param requestedRemainingPool unknown 剩余池。
 * @returns 无返回值，直接更新功德月卡池真源。
 */


  async setPlayerMonthCardPool(
    playerId: string,
    requestedTotalPool: unknown,
    requestedRemainingPool: unknown,
    requestedEternalEnabled?: unknown,
    requestedDailySignInFixedMeritBonus?: unknown,
    actor?: GmActorContext | null,
  ) {
    if (!this.activityPersistenceService?.isEnabled()) {
      throw new BadRequestException('活动持久化不可用，无法修改功德月卡池');
    }
    const totalPoolMerit = this.parseNonNegativeInteger(requestedTotalPool, '月卡功德总池');
    const remainingPoolMerit = this.parseNonNegativeInteger(requestedRemainingPool, '月卡剩余功德');
    const eternalEnabled = typeof requestedEternalEnabled === 'boolean' ? requestedEternalEnabled : undefined;
    const dailySignInFixedMeritBonus = requestedDailySignInFixedMeritBonus === undefined
      ? undefined
      : this.parseNonNegativeInteger(requestedDailySignInFixedMeritBonus, '签到固定池');
    const before = await this.activityPersistenceService.loadMonthCard(playerId);
    const record = await this.activityPersistenceService.setMonthCardPool(
      playerId,
      totalPoolMerit,
      remainingPoolMerit,
      Date.now(),
      { eternalEnabled, dailySignInFixedMeritBonus },
    );
    await this.recordGmAuditEntry({
      op: 'gm.player.set_month_card_pool',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: before ? this.toManagedMonthCardView(before) : null,
      after: this.toManagedMonthCardView(record),
      delta: {
        totalPoolMerit,
        remainingPoolMerit: Math.min(totalPoolMerit, remainingPoolMerit),
        eternalEnabled: record.eternalEnabled,
        dailySignInFixedMeritBonus: record.dailySignInFixedMeritBonus,
      },
      success: true,
      errorMessage: null,
    });
  }

  async activatePlayerEternalBenefit(
    playerId: string,
    requestedCount: unknown,
    actor?: GmActorContext | null,
  ) {
    if (!this.activityPersistenceService?.isEnabled()) {
      throw new BadRequestException('活动持久化不可用，无法激活永恒权益');
    }
    const count = requestedCount === undefined ? 1 : this.parseNonNegativeInteger(requestedCount, '永恒使用次数');
    if (count <= 0) {
      throw new BadRequestException('永恒使用次数必须大于 0');
    }
    const before = await this.activityPersistenceService.loadMonthCard(playerId);
    const after = await this.activityPersistenceService.activateEternalMonthCard(
      playerId,
      Date.now(),
      count * MERIT_ETERNAL_POOL_GRANT,
      count * MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
    );
    await this.recordGmAuditEntry({
      op: 'gm.player.activate_eternal_benefit',
      targetType: 'player',
      targetId: playerId,
      actor: actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before: before ? this.toManagedMonthCardView(before) : null,
      after: this.toManagedMonthCardView(after),
      delta: { count },
      success: true,
      errorMessage: null,
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


  async returnAllPlayersToDefaultSpawn(options?: GmPlayerScopeOptions) {
    return returnAllPlayersToDefaultSpawnImpl(this, options);
  }
  /**
 * cleanupAllPlayersInvalidItems：清理全部非机器人的无效物品。
 * @returns 无返回值，直接更新全部无效物品清理相关状态。
 */


  async cleanupAllPlayersInvalidItems(options?: GmPlayerScopeOptions) {
    return cleanupAllPlayersInvalidItemsImpl(this, options);
  }

  async migrateAllPlayersRecoveryPills(options?: GmPlayerScopeOptions) {
    return migrateAllPlayersRecoveryPillsImpl(this, options);
  }

  /** 将在线和离线挂机玩家的副本体力统一恢复到上限。 */
  async refillOnlineAndOfflineHangingPlayersStamina(options?: GmPlayerScopeOptions) {
    return refillOnlineAndOfflineHangingPlayersStaminaImpl(this, options);
  }

  async repairMarketStorageItemIds() {
    return repairMarketStorageItemIdsImpl(this);
  }

  /**
   * 解除指定玩家的 startup_deterministic_stall 启动隔离。
   * player_market_storage_item 由坊市持久化独立持有、可能含真实资产，本命令只读上报不删除；
   * 解除隔离后历史 market_storage payload 会按外部持有域收敛，不再回写该表。
   * 仅处理该隔离类别；资产归属冲突隔离（startup_asset_conflict）必须人工核对，不在此命令范围。
   */
  async releasePlayerFlushStartupStall(playerIdInput: string,
    options: { dryRun?: boolean } = {},) {
    return releasePlayerFlushStartupStallImpl(this, playerIdInput, options);
  }

  async repairQuestProgressPayloads(mode: 'dry-run' | 'apply', actor?: GmActorContext | null) {
    return repairQuestProgressPayloadsImpl(this, mode, actor);
  }

  refreshOnlinePlayerTechniqueTemplates() {
    return refreshOnlinePlayerTechniqueTemplatesImpl(this);
  }

  async refillManagedPlayerStamina(playerId: string, now: number): Promise<void> {
    await this.mutateManagedPlayer(playerId, {
      domains: ['progression'],
      mutatePersisted: (persisted) => {
        persisted.progression = persisted.progression && typeof persisted.progression === 'object'
          ? persisted.progression
          : {};
        persisted.progression.stamina = DUNGEON_MAX_STAMINA;
        persisted.progression.staminaUpdatedAt = now;
        persisted.savedAt = now;
      },
      mutateRuntime: (runtime) => {
        runtime.stamina = DUNGEON_MAX_STAMINA;
        runtime.staminaUpdatedAt = now;
      },
    });
  }

  isStaminaRefillRuntimePlayer(entry: any) {
    return isStaminaRefillRuntimePlayerImpl(this, entry);
  }
  /**
 * compensateAllPlayersCombatExp：补偿全部非机器人的战斗经验。
 * @returns 无返回值，直接更新全部战斗经验补偿相关状态。
 */


  async compensateAllPlayersCombatExp(options?: GmPlayerScopeOptions) {
    return compensateAllPlayersCombatExpImpl(this, options);
  }
  /**
 * compensateAllPlayersFoundation：补偿全部非机器人的底蕴。
 * @returns 无返回值，直接更新全部底蕴补偿相关状态。
 */


  async compensateAllPlayersFoundation(options?: GmPlayerScopeOptions) {
    return compensateAllPlayersFoundationImpl(this, options);
  }

  normalizeGmInventoryItemForSave(currentItem: unknown, submittedItem: unknown) {
    return normalizeGmInventoryItemForSaveImpl(this, currentItem, submittedItem);
  }

  normalizeGmEquipmentItemForSave(currentItem: unknown, submittedItem: unknown) {
    return normalizeGmEquipmentItemForSaveImpl(this, currentItem, submittedItem);
  }

  normalizeGmEditedItemInstanceId(normalized: Record<string, unknown>,
    submitted: Record<string, unknown>,
    currentItem: unknown,
    itemId: string,) {
    return normalizeGmEditedItemInstanceIdImpl(this, normalized, submitted, currentItem, itemId);
  }
  /**
 * applyPlayerSnapshotMutation：处理玩家快照Mutation并更新相关状态。
 * @param next 参数说明。
 * @param snapshot 参数说明。
 * @param section 参数说明。
 * @returns 无返回值，直接更新玩家快照Mutation相关状态。
 */


  applyPlayerSnapshotMutation(next, snapshot, section) {
    return applyPlayerSnapshotMutationImpl(this, next, snapshot, section);
  }
  /**
 * applyPositionToPersistenceSnapshot：判断位置ToPersistence快照是否满足条件。
 * @param persisted 参数说明。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新位置ToPersistence快照相关状态。
 */


  applyPositionToPersistenceSnapshot(persisted, snapshot) {
    return applyPositionToPersistenceSnapshotImpl(this, persisted, snapshot);
  }
  /**
 * applyPlayerSnapshotMutationToPersistence：判断玩家快照MutationToPersistence是否满足条件。
 * @param persisted 参数说明。
 * @param snapshot 参数说明。
 * @param section 参数说明。
 * @returns 无返回值，直接更新玩家快照MutationToPersistence相关状态。
 */


  applyPlayerSnapshotMutationToPersistence(persisted, snapshot, section) {
    return applyPlayerSnapshotMutationToPersistenceImpl(this, persisted, snapshot, section);
  }

  applyCraftSkillSnapshotMutation(next, snapshot) {
    return applyCraftSkillSnapshotMutationImpl(this, next, snapshot);
  }

  applyCraftSkillSnapshotMutationToPersistence(persisted, snapshot) {
    return applyCraftSkillSnapshotMutationToPersistenceImpl(this, persisted, snapshot);
  }

  normalizeGmCraftSkillState(value: unknown, fallback: unknown) {
    return normalizeGmCraftSkillStateImpl(this, value, fallback);
  }

  /**
 * repairRuntimeSnapshot：执行repair运行态快照相关逻辑。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新repair运行态快照相关状态。
 */


  repairRuntimeSnapshot(snapshot) {
    return repairRuntimeSnapshotImpl(this, snapshot);
  }
  /**
 * hydrateGmTechniqueSnapshot：用服务端模板补全 GM 低频功法快照。
 * @param entry 功法快照。
 * @returns 补全后的功法运行态。
 */


  hydrateGmTechniqueSnapshot(entry) {
    return hydrateGmTechniqueSnapshotImpl(this, entry);
  }

  buildStarterPersistenceSnapshot(playerId: string) {
    return buildStarterPersistenceSnapshotImpl(this, playerId);
  }

  private async loadPlayerPersistenceSnapshot(playerId: string): Promise<any | null> {
    return this.playerDomainPersistenceService.loadProjectedSnapshot(
      playerId,
      (targetPlayerId) => this.buildStarterPersistenceSnapshot(targetPlayerId),
    );
  }

  async savePlayerPersistenceSnapshotDomains(
    playerId: string,
    snapshot: any,
    domains: Iterable<string>,
    options: {
      allowInventoryEmptyOverwrite?: boolean;
      allowEquipmentEmptyOverwrite?: boolean;
      allowArtifactEmptyOverwrite?: boolean;
      allowBuffEmptyOverwrite?: boolean;
    } = {},
  ): Promise<void> {
    await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
      playerId,
      snapshot,
      domains,
      options,
    );
  }

  private async savePlayerPersistenceSnapshotForGmUpdate(
    playerId: string,
    snapshot: any,
    section: unknown,
    submittedSnapshot: any,
  ): Promise<void> {
    const domains = this.getGmUpdateProjectionDomains(section, submittedSnapshot);
    if (domains.length === 0) {
      throw new BadRequestException(`不支持的玩家修改分区：${String(section ?? 'basic')}`);
    }
    await this.savePlayerPersistenceSnapshotDomains(
      playerId,
      snapshot,
      domains,
      {
        allowInventoryEmptyOverwrite: domains.includes('inventory') && Array.isArray(submittedSnapshot?.inventory?.items),
        allowEquipmentEmptyOverwrite: domains.includes('equipment') && submittedSnapshot?.equipment && typeof submittedSnapshot.equipment === 'object',
        allowArtifactEmptyOverwrite: domains.includes('artifact') && submittedSnapshot?.artifacts && typeof submittedSnapshot.artifacts === 'object',
        allowBuffEmptyOverwrite: domains.includes('buff') && Array.isArray(submittedSnapshot?.temporaryBuffs),
      },
    );
  }

  getGmUpdateProjectionDomains(section: unknown, snapshot: any) {
    return getGmUpdateProjectionDomainsImpl(this, section, snapshot);
  }

  async listPlayerPersistenceSnapshots(): Promise<PersistedPlayerEntryLike[]> {
    return this.playerDomainPersistenceService.listProjectedSnapshots(
      (targetPlayerId) => this.buildStarterPersistenceSnapshot(targetPlayerId),
    );
  }

  async listScopedOfflinePlayerPersistenceSnapshots(
    playerIds: string[],
    runtimePlayerIds: Set<string>,
  ): Promise<PersistedPlayerEntryLike[]> {
    const entries: PersistedPlayerEntryLike[] = [];
    for (const playerId of playerIds) {
      if (runtimePlayerIds.has(playerId) || isNativeGmBotPlayerId(playerId)) {
        continue;
      }
      const snapshot = await this.loadPlayerPersistenceSnapshot(playerId);
      if (!snapshot) {
        continue;
      }
      entries.push({ playerId, snapshot });
    }
    return entries;
  }

  normalizePlayerIdScope(options?: GmPlayerScopeOptions) {
    return normalizePlayerIdScopeImpl(this, options);
  }
  /**
 * mutateManagedPlayer：统一处理玩家快照的持久化与运行态回写。
 *
 * N45：增加可选 audit hook —— 调用方传入 actor + op + describeBefore/After/Delta
 * 时，本方法会在落库前后自动落 gm_audit_log。describeBefore/After 失败、audit 落库
 * 失败都不抛出 / 不阻断主操作（gm_audit_log service 内部已做错误吞没）。
 */


  private async mutateManagedPlayer(
    playerId: string,
    input: {
      domains: readonly string[];
      mutatePersisted: (persisted: any) => void;
      mutateRuntime?: (runtime: any, persisted: any) => void;
      audit?: GmMutationAuditOptions;
    },
  ) {
    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      const auditEntry = input.audit
        ? this.buildPlayerAuditEntry(playerId, input.audit, undefined, undefined, false, '目标玩家不存在')
        : null;
      if (auditEntry) {
        await this.recordGmAuditEntry(auditEntry);
      }
      throw new NotFoundException('目标玩家不存在');
    }

    let beforeSummary: unknown = undefined;
    if (input.audit) {
      beforeSummary = safeDescribe(input.audit.describeBefore, persisted);
    }

    let auditError: string | null = null;
    try {
      input.mutatePersisted(persisted);
      await this.savePlayerPersistenceSnapshotDomains(playerId, persisted, input.domains);
    } catch (error) {
      auditError = error instanceof Error ? error.message : String(error);
      if (input.audit) {
        const failed = this.buildPlayerAuditEntry(playerId, input.audit, beforeSummary, undefined, false, auditError);
        await this.recordGmAuditEntry(failed);
      }
      throw error;
    }
    if (!runtime) {
      if (input.audit) {
        const afterSummary = safeDescribe(input.audit.describeAfter, persisted);
        const entry = this.buildPlayerAuditEntry(playerId, input.audit, beforeSummary, afterSummary, true, null);
        await this.recordGmAuditEntry(entry);
      }
      return;
    }

    const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
    if (!refreshedRuntime) {
      if (input.audit) {
        const afterSummary = safeDescribe(input.audit.describeAfter, persisted);
        const entry = this.buildPlayerAuditEntry(playerId, input.audit, beforeSummary, afterSummary, true, null);
        await this.recordGmAuditEntry(entry);
      }
      return;
    }

    if (input.mutateRuntime) {
      input.mutateRuntime(refreshedRuntime, persisted);
    }
    this.repairRuntimeSnapshot(refreshedRuntime);
    refreshedRuntime.selfRevision += 1;
    refreshedRuntime.persistentRevision += 1;
    this.playerRuntimeService.restoreSnapshot(refreshedRuntime);

    if (input.audit) {
      const afterSummary = safeDescribe(input.audit.describeAfter, persisted);
      const entry = this.buildPlayerAuditEntry(playerId, input.audit, beforeSummary, afterSummary, true, null);
      await this.recordGmAuditEntry(entry);
    }
  }

  /** 构建针对玩家的 GM 审计条目；统一 target_type=player。 */
  buildPlayerAuditEntry(playerId: string,
    audit: GmMutationAuditOptions,
    before: unknown,
    after: unknown,
    success: boolean,
    errorMessage: string | null,) {
    return buildPlayerAuditEntryImpl(this, playerId, audit, before, after, success, errorMessage);
  }

  /** 落 gm_audit_log；service 不可用时仅打 warn 不抛。 */
  private async recordGmAuditEntry(entry: GmAuditLogEntry): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry(entry);
    } catch {
      // service 内部已 catch 并打日志；额外保护一层避免 audit 异常冒泡破坏 GM 写流程。
    }
  }
  /**
 * cleanupManagedPlayerInvalidItems：清理单个玩家的无效物品与托管仓。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新单个玩家无效物品清理相关状态。
 */


  async cleanupManagedPlayerInvalidItems(playerId: string) {
    let summary = {
      inventoryStacksRemoved: 0,
      marketStorageStacksRemoved: 0,
      equipmentRemoved: 0,
    };

    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    summary = this.cleanupInvalidItemsFromSnapshot(persisted);
    if (summary.inventoryStacksRemoved > 0 || summary.equipmentRemoved > 0) {
      persisted.savedAt = Date.now();
      const domains: string[] = [];
      if (summary.inventoryStacksRemoved > 0) {
        domains.push('inventory');
      }
      if (summary.equipmentRemoved > 0) {
        domains.push('equipment');
      }
      await this.savePlayerPersistenceSnapshotDomains(playerId, persisted, domains);
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

  async migrateManagedPlayerRecoveryPills(playerId: string): Promise<RecoveryPillMigrationSummary> {
    const summary = createEmptyRecoveryPillMigrationSummary();

    const runtime = this.playerRuntimeService.snapshot(playerId);
    const persisted = runtime
      ? this.playerRuntimeService.buildPersistenceSnapshot(playerId)
      : await this.loadPlayerPersistenceSnapshot(playerId);
    if (!persisted) {
      throw new NotFoundException('目标玩家不存在');
    }

    const snapshotSummary = this.migrateRecoveryPillsFromSnapshot(persisted);
    addRecoveryPillMigrationSummary(summary, snapshotSummary);
    if (snapshotSummary.inventoryStacksMigrated > 0 || snapshotSummary.equipmentMigrated > 0) {
      persisted.savedAt = Date.now();
      const domains: string[] = [];
      if (snapshotSummary.inventoryStacksMigrated > 0) {
        domains.push('inventory');
      }
      if (snapshotSummary.equipmentMigrated > 0) {
        domains.push('equipment');
      }
      await this.savePlayerPersistenceSnapshotDomains(playerId, persisted, domains);
      if (runtime) {
        const refreshedRuntime = this.playerRuntimeService.snapshot(playerId);
        if (refreshedRuntime) {
          const runtimeSummary = this.migrateRecoveryPillsFromSnapshot(refreshedRuntime);
          summary.inventoryStacksMigrated = Math.max(summary.inventoryStacksMigrated, runtimeSummary.inventoryStacksMigrated);
          summary.inventoryItemsMigrated = Math.max(summary.inventoryItemsMigrated, runtimeSummary.inventoryItemsMigrated);
          summary.equipmentMigrated = Math.max(summary.equipmentMigrated, runtimeSummary.equipmentMigrated);
          this.repairRuntimeSnapshot(refreshedRuntime);
          refreshedRuntime.selfRevision += 1;
          refreshedRuntime.persistentRevision += 1;
          this.playerRuntimeService.restoreSnapshot(refreshedRuntime);
        }
      }
    }

    const storageSummary = await this.migrateRecoveryPillsFromMarketStorage(playerId);
    addRecoveryPillMigrationSummary(summary, storageSummary);
    return summary;
  }

  migrateRecoveryPillsFromSnapshot(snapshot: any) {
    return migrateRecoveryPillsFromSnapshotImpl(this, snapshot);
  }

  private async migrateRecoveryPillsFromMarketStorage(playerId: string): Promise<RecoveryPillMigrationSummary> {
    if (typeof this.marketRuntimeService.ensureStorageHydrated === 'function') {
      await this.marketRuntimeService.ensureStorageHydrated(playerId);
    }
    const storage = this.marketRuntimeService.getStorage(playerId);
    const items = Array.isArray(storage?.items) ? storage.items : [];
    const migrated = this.migrateRecoveryPillItemArray(items);
    const summary = createEmptyRecoveryPillMigrationSummary();
    if (!migrated.changed) {
      return summary;
    }

    await this.marketRuntimeService.runExclusiveMarketMutation(playerId, (context) => {
      this.marketRuntimeService.setStorage(playerId, { items: migrated.items }, context);
      return { ok: true };
    });
    summary.marketStorageStacksMigrated = migrated.stacksMigrated;
    summary.marketStorageItemsMigrated = migrated.itemsMigrated;
    return summary;
  }

  migrateRecoveryPillItemArray(items: any[]) {
    return migrateRecoveryPillItemArrayImpl(this, items);
  }

  createMigratedRecoveryPillItem(item: any) {
    return createMigratedRecoveryPillItemImpl(this, item);
  }
  /**
 * cleanupInvalidItemsFromSnapshot：清理背包与装备中的无效物品。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新快照无效物品清理相关状态。
 */


  cleanupInvalidItemsFromSnapshot(snapshot) {
    return cleanupInvalidItemsFromSnapshotImpl(this, snapshot);
  }
  /**
 * cleanupInvalidMarketStorage：清理坊市托管仓中的无效物品。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新托管仓无效物品清理相关状态。
 */


  private async cleanupInvalidMarketStorage(playerId: string) {
    if (typeof this.marketRuntimeService.ensureStorageHydrated === 'function') {
      await this.marketRuntimeService.ensureStorageHydrated(playerId);
    }
    const storage = this.marketRuntimeService.getStorage(playerId);
    const items = Array.isArray(storage?.items) ? storage.items : [];
    const nextItems = items.filter((entry) => this.isValidItem(this.readMarketStorageCleanupItemId(entry)));
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


  isManagedPlayerMissingError(error: unknown) {
    return isManagedPlayerMissingErrorImpl(this, error);
  }
  /**
 * isValidItem：判断道具是否仍存在于内容模板中。
 * @param itemId 参数说明。
 * @returns 无返回值，完成道具有效性的条件判断。
 */


  isValidItem(itemId: unknown) {
    return isValidItemImpl(this, itemId);
  }

  readMarketStorageCleanupItemId(entry: any) {
    return readMarketStorageCleanupItemIdImpl(this, entry);
  }
  /**
 * buildBodyTrainingState：构建炼体状态。
 * @param current 参数说明。
 * @param level number 等级。
 * @returns 无返回值，直接更新炼体状态相关状态。
 */


  buildBodyTrainingState(current, level: number) {
    return buildBodyTrainingStateImpl(this, current, level);
  }
  /**
 * parseBodyTrainingLevel：解析炼体等级输入。
 * @param value 参数说明。
 * @returns 无返回值，完成炼体等级解析。
 */


  parseBodyTrainingLevel(value: unknown) {
    return parseBodyTrainingLevelImpl(this, value);
  }
  /**
 * parseCounterDelta：解析整数增量。
 * @param value 参数说明。
 * @param label string 标签。
 * @returns 无返回值，完成整数增量解析。
 */


  parseCounterDelta(value: unknown, label: string) {
    return parseCounterDeltaImpl(this, value, label);
  }
  /**
 * parseNonNegativeInteger：解析非负整数。
 * @param value 参数说明。
 * @param label string 标签。
 * @returns 返回归一化后的非负整数。
 */


  parseNonNegativeInteger(value: unknown, label: string) {
    return parseNonNegativeIntegerImpl(this, value, label);
  }
  /**
 * applyCounterDelta：把整数增量应用到计数值。
 * @param currentValue 参数说明。
 * @param amount number 增量。
 * @returns 无返回值，直接更新计数值相关状态。
 */


  applyCounterDelta(currentValue: unknown, amount: number) {
    return applyCounterDeltaImpl(this, currentValue, amount);
  }
  /**
 * normalizeNonNegativeInt：归一化非负整数。
 * @param value 参数说明。
 * @returns 无返回值，完成非负整数归一化。
 */


  normalizeNonNegativeInt(value: unknown) {
    return normalizeNonNegativeIntImpl(this, value);
  }
  /**
 * calculateCombatExpCompensationForRuntime：计算运行态战斗经验补偿。
 * @param player 参数说明。
 * @returns 无返回值，完成运行态战斗经验补偿计算。
 */


  calculateCombatExpCompensationForRuntime(player) {
    return calculateCombatExpCompensationForRuntimeImpl(this, player);
  }
  /**
 * calculateCombatExpCompensationForPersistence：计算持久化快照战斗经验补偿。
 * @param snapshot 参数说明。
 * @returns 无返回值，完成持久化战斗经验补偿计算。
 */


  calculateCombatExpCompensationForPersistence(snapshot) {
    return calculateCombatExpCompensationForPersistenceImpl(this, snapshot);
  }
  /**
 * calculateFoundationCompensationForRuntime：计算运行态底蕴补偿。
 * @param player 参数说明。
 * @returns 无返回值，完成运行态底蕴补偿计算。
 */


  calculateFoundationCompensationForRuntime(player) {
    return calculateFoundationCompensationForRuntimeImpl(this, player);
  }
  /**
 * calculateFoundationCompensationForPersistence：计算持久化快照底蕴补偿。
 * @param snapshot 参数说明。
 * @returns 无返回值，完成持久化底蕴补偿计算。
 */


  calculateFoundationCompensationForPersistence(snapshot) {
    return calculateFoundationCompensationForPersistenceImpl(this, snapshot);
  }
  /**
 * hasInvalidItems：判断是否存在无效物品清理结果。
 * @param summary 参数说明。
 * @returns 无返回值，完成无效物品清理结果判断。
 */


  hasInvalidItems(summary: { inventoryStacksRemoved: number; marketStorageStacksRemoved: number; equipmentRemoved: number }) {
    return hasInvalidItemsImpl(this, summary);
  }
  /**
 * toManagedPlayerSummary：执行toManaged玩家摘要相关逻辑。
 * @param snapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家摘要相关状态。
 */


  async toManagedPlayerSummary(snapshot, account = null) {
    return toManagedPlayerSummaryImpl(this, snapshot, account);
  }
  /**
 * toManagedPlayerRecord：执行toManaged玩家Record相关逻辑。
 * @param snapshot 参数说明。
 * @param persistedSnapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家Record相关状态。
 */


  async toManagedPlayerRecord(snapshot, persistedSnapshot, account = null, databaseTables: GmPlayerDatabaseTableViewLike[] = []) {
    return toManagedPlayerRecordImpl(this, snapshot, persistedSnapshot, account, databaseTables);
  }
  /**
 * toManagedPlayerRecordFromPersistence：判断toManaged玩家RecordFromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param persistedSnapshot 参数说明。
 * @param account 参数说明。
 * @returns 无返回值，直接更新toManaged玩家RecordFromPersistence相关状态。
 */


  async toManagedPlayerRecordFromPersistence(playerId,
    persistedSnapshot,
    account = null,
    databaseTables: GmPlayerDatabaseTableViewLike[] = [],) {
    return toManagedPlayerRecordFromPersistenceImpl(this, playerId, persistedSnapshot, account, databaseTables);
  }

  async loadManagedMonthCardView(playerId: string) {
    return loadManagedMonthCardViewImpl(this, playerId);
  }

  toManagedMonthCardView(record: {
    startAt: number;
    expireAt: number;
    totalPoolMerit: number;
    remainingPoolMerit: number;
    eternalEnabled?: boolean;
    dailySignInFixedMeritBonus?: number;
    lastClaimDate: string | null;
  }) {
    return toManagedMonthCardViewImpl(this, record);
  }

  async loadPlayerDatabaseTables(playerId: string) {
    return loadPlayerDatabaseTablesImpl(this, playerId);
  }
  /**
 * toLegacyPlayerState：执行toLegacy玩家状态相关逻辑。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态。
 */


  toLegacyPlayerState(snapshot) {
    return toLegacyPlayerStateImpl(this, snapshot);
  }
  /**
 * toLegacyPlayerStateFromPersistence：判断toLegacy玩家状态FromPersistence是否满足条件。
 * @param playerId 玩家 ID。
 * @param snapshot 参数说明。
 * @returns 返回toLegacy玩家状态FromPersistence。
 */


  toLegacyPlayerStateFromPersistence(playerId, snapshot) {
    return toLegacyPlayerStateFromPersistenceImpl(this, playerId, snapshot);
  }
  /**
 * resolveMapName：规范化或转换地图名称。
 * @param mapId string 地图 ID。
 * @returns 无返回值，直接更新地图名称相关状态。
 */


  resolveMapName(mapId: string) {
    return resolveMapNameImpl(this, mapId);
  }
}
