/**
 * GM 世界管理服务。
 * 编排世界运行时查询、地图实例创建/迁移/冻结/重建、玩家迁移、
 * 性能计数器重置、tick/时间配置修改等 GM 操作。
 */
import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { type GmCreateWorldInstanceReq, type GmListPlayersQuery, type GmPlayerListRes, type GmTransferPlayerToInstanceReq, type GmWorldInstanceLinePreset } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../../runtime/map/runtime-map-config.service';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { OutboxDispatcherService } from '../../persistence/outbox-dispatcher.service';
import { MapPersistenceFlushService } from '../../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import {
  buildPublicInstanceId,
  buildManualLineInstanceId,
  buildRuntimeInstancePresetMeta,
  isRuntimeInstanceLinePreset,
  normalizeRuntimeInstancePersistentPolicy,
} from '../../runtime/world/world-runtime.normalization.helpers';
import { NativeGmEditorQueryService } from './native-gm-editor-query.service';
import { NativeGmMapQueryService } from './native-gm-map-query.service';
import { NativeGmMapRuntimeQueryService } from './native-gm-map-runtime-query.service';
import { NativeGmStateQueryService } from './native-gm-state-query.service';
import { NativeGmSuggestionQueryService } from './native-gm-suggestion-query.service';
import { NodeRegistryService } from '../../persistence/node-registry.service';
import { GmMapConfigPersistenceService } from '../../persistence/gm-map-config-persistence.service';
import type { GmMapConfigPayload } from '../../persistence/gm-map-config-persistence.service';
/**
 * ContentTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface ContentTemplateRepositoryLike {
  loadAll(): void;
}
/**
 * RuntimeGmStateServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeGmStateServiceLike {
  buildPerformanceSnapshot(): Record<string, unknown>;
  enableNetworkPerfCounters(): void;
  resetNetworkPerfCounters(): void;
  resetCpuPerfCounters(): void;
  writeHeapSnapshot(): unknown;
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): {  
  /**
 * id：ID标识。
 */
 id: string;  
 /**
 * name：名称名称或显示文本。
 */
 name: string;
 /**
 * source：来源相关字段。
 */
 source: {  
 /**
 * time：时间相关字段。
 */
 time?: Record<string, unknown> } };
  loadAll(): void;
  listSummaries(): Array<{  
  /**
 * id：ID标识。
 */
 id: string }>;
}
/**
 * SuggestionRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionRuntimeServiceLike {
  markCompleted(id: string): Promise<boolean>;
  addReply(id: string, authorId: string, authorType: string, authorName: string, content: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}
/**
 * RuntimeMapConfigServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMapConfigServiceLike {
  restorePersistedMapConfigs?(): Promise<number>;
  updateMapTick(mapId: string, body?: unknown): void;
  updateMapTime(mapId: string, sourceTime: Record<string, unknown>, body?: unknown): void;
  pruneMapConfigs(validMapIds: Set<string>): void;
}
/**
 * NativeGmStateQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeGmStateQueryServiceLike {
  invalidatePlayerListCaches(): void;
  listPlayers(query: GmListPlayersQuery | undefined): Promise<GmPlayerListRes>;
  getState(query: GmListPlayersQuery | undefined, timers: {  
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
 pathfindingPerfStartedAt: number }): Promise<unknown>;
}
/**
 * NativeGmEditorQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeGmEditorQueryServiceLike {
  getEditorCatalog(): unknown;
}
/**
 * NativeGmMapQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeGmMapQueryServiceLike {
  getMaps(): unknown;
}
/**
 * NativeGmMapRuntimeQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeGmMapRuntimeQueryServiceLike {
  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown): unknown;
  getInstanceRuntime(instanceId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown): unknown;
  getInstanceBuildingState(instanceId: string): unknown;
  getInstanceBuildingCellState(instanceId: string, x: unknown, y: unknown): unknown;
  recalculateInstanceBuildingState(instanceId: string): unknown;
  repairInstanceBuildingState(instanceId: string): unknown;
}
/**
 * NativeGmSuggestionQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NativeGmSuggestionQueryServiceLike {
  getSuggestions(query?: unknown): unknown;
}

interface WorldRuntimeCommandIntakeFacadeLike {
  enqueueGmUpdatePlayer(input: unknown): { queued: boolean };
}

interface PlayerRuntimeQueryLike {
  getPlayer(playerId: string): { hp?: number } | null;
  beginTransfer?(player: Record<string, unknown>, targetNodeId: string): void;
}

interface WorldRuntimeGmQueueLike {
  hasPendingRespawns(): boolean;
  hasPendingRespawn(playerId: string): boolean;
}

interface WorldRuntimeServiceLike {
  getRuntimeSummary(): unknown;
  listBuildingOperationAudit?(limit?: number): unknown[];
  getInstanceLeaseStatus(instanceId: string): Promise<unknown>;
  freezeInstanceWriting(instanceId: string, reason?: string): void;
  unfreezeInstanceWriting(instanceId: string): { ok: boolean; reason?: string };
  rebuildPersistentInstance(instanceId: string): Promise<unknown>;
  migrateInstanceToNode(instanceId: string, targetNodeId: string): Promise<{ ok: boolean; reason?: string }>;
  migratePlayerToNode(playerId: string, targetNodeId: string): Promise<{ ok: boolean; reason?: string }>;
  listInstances(): Array<{
    instanceId: string;
    displayName?: string;
    templateId: string;
    templateName?: string;
    mapGroupId?: string;
    mapGroupName?: string;
    mapGroupOrder?: number;
    mapGroupMemberOrder?: number;
    linePreset?: GmWorldInstanceLinePreset;
    lineIndex?: number;
    instanceOrigin?: 'bootstrap' | 'gm_manual';
    defaultEntry?: boolean;
    persistent?: boolean;
    supportsPvp?: boolean;
    canDamageTile?: boolean;
    playerCount?: number;
    tick?: number;
    worldRevision?: number;
    width?: number;
    height?: number;
  }>;
  getInstance(instanceId: string): { instanceId: string } | null;
  getPlayerLocation(playerId: string): { instanceId: string } | null;
  createInstance(input: unknown): { snapshot(): unknown };
  playerRuntimeService: PlayerRuntimeQueryLike;
  worldRuntimeGmQueueService: WorldRuntimeGmQueueLike;
  worldRuntimeCommandIntakeFacadeService: WorldRuntimeCommandIntakeFacadeLike;
}

interface NodeRegistryServiceLike {
  isEnabled(): boolean;
  getNodeId(): string;
  listNodes(): Promise<Array<{
    nodeId: string;
    address: string;
    port: number;
    status: string;
    heartbeatAt: string | null;
    startedAt: string;
    capacityWeight: number;
  }>>;
}

interface OutboxDispatcherServiceLike {
  listRetryQueue(input?: { limit?: number; topicPrefixes?: string[] }): Promise<Array<Record<string, unknown>>>;
}

interface DurableOperationServiceLike {
  getOperationReplay(operationId: string): Promise<{
    operation: Record<string, unknown> | null;
    outboxEvents: Array<Record<string, unknown>>;
    assetAuditLogs: Array<Record<string, unknown>>;
  }>;
}

interface PlayerRuntimeServiceLike {
  getPlayer(playerId: string): Record<string, unknown> | null;
  beginTransfer?(player: Record<string, unknown>, targetNodeId: string): void;
}

interface PlayerPersistenceFlushServiceLike {
  flushPlayer(playerId: string): Promise<void>;
}

interface MapPersistenceFlushServiceLike {
  flushInstance(instanceId: string): Promise<void>;
}
/**
 * NativeGmWorldService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmWorldService {
  private readonly logger = new Logger(NativeGmWorldService.name);

/**
 * networkPerfStartedAt：networkPerfStartedAt相关字段。
 */

  private networkPerfStartedAt = Date.now();  
  /**
 * cpuPerfStartedAt：cpuPerfStartedAt相关字段。
 */

  private cpuPerfStartedAt = Date.now();  
  /**
 * pathfindingPerfStartedAt：pathfindingPerfStartedAt相关字段。
 */

  private pathfindingPerfStartedAt = Date.now();  
  /**
 * outboxDispatcherService：outbox dispatcher service 引用。
 */

  private outboxDispatcherService: OutboxDispatcherServiceLike;  
  /**
 * durableOperationService：强持久化事务服务引用。
 */

  private durableOperationService: DurableOperationServiceLike;
  /**
 * playerPersistenceFlushService：玩家刷盘服务引用。
 */

  /**
* playerPersistenceFlushService：玩家刷盘服务引用。
 */

  private playerPersistenceFlushService: PlayerPersistenceFlushServiceLike;
  /**
 * mapPersistenceFlushService：地图刷盘服务引用。
 */

  private mapPersistenceFlushService: MapPersistenceFlushServiceLike;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository ContentTemplateRepositoryLike 参数说明。
 * @param runtimeGmStateService RuntimeGmStateServiceLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param suggestionRuntimeService SuggestionRuntimeServiceLike 参数说明。
 * @param runtimeMapConfigService RuntimeMapConfigServiceLike 参数说明。
 * @param nextGmStateQueryService NativeGmStateQueryServiceLike 参数说明。
 * @param nextGmEditorQueryService NativeGmEditorQueryServiceLike 参数说明。
 * @param nextGmMapQueryService NativeGmMapQueryServiceLike 参数说明。
 * @param nextGmMapRuntimeQueryService NativeGmMapRuntimeQueryServiceLike 参数说明。
 * @param nextGmSuggestionQueryService NativeGmSuggestionQueryServiceLike 参数说明。
 * @param worldRuntimeService WorldRuntimeServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: ContentTemplateRepositoryLike,
    @Inject(RuntimeGmStateService)
    private readonly runtimeGmStateService: RuntimeGmStateServiceLike,
    @Inject(MapTemplateRepository)
    private readonly mapTemplateRepository: MapTemplateRepositoryLike,
    @Inject(SuggestionRuntimeService)
    private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike,
    @Inject(RuntimeMapConfigService)
    private readonly runtimeMapConfigService: RuntimeMapConfigServiceLike,
    @Inject(NativeGmStateQueryService)
    private readonly nextGmStateQueryService: NativeGmStateQueryServiceLike,
    @Inject(NativeGmEditorQueryService)
    private readonly nextGmEditorQueryService: NativeGmEditorQueryServiceLike,
    @Inject(NativeGmMapQueryService)
    private readonly nextGmMapQueryService: NativeGmMapQueryServiceLike,
    @Inject(NativeGmMapRuntimeQueryService)
    private readonly nextGmMapRuntimeQueryService: NativeGmMapRuntimeQueryServiceLike,
    @Inject(NativeGmSuggestionQueryService)
    private readonly nextGmSuggestionQueryService: NativeGmSuggestionQueryServiceLike,
    @Inject(NodeRegistryService)
    private readonly nodeRegistryService: NodeRegistryServiceLike,
    @Inject(GmMapConfigPersistenceService)
    private readonly gmMapConfigPersistenceService: GmMapConfigPersistenceService,
    @Inject(OutboxDispatcherService)
    outboxDispatcherService: OutboxDispatcherServiceLike,
    @Inject(DurableOperationService)
    durableOperationService: DurableOperationServiceLike,
    @Inject(PlayerPersistenceFlushService)
    playerPersistenceFlushService: PlayerPersistenceFlushServiceLike,
    @Inject(MapPersistenceFlushService)
    mapPersistenceFlushService: MapPersistenceFlushServiceLike,
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider | null,
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimeServiceLike,
  ) {
    this.outboxDispatcherService = outboxDispatcherService;
    this.durableOperationService = durableOperationService;
    this.playerPersistenceFlushService = playerPersistenceFlushService;
    this.mapPersistenceFlushService = mapPersistenceFlushService;
  }

  async onModuleInit(): Promise<void> {
    await this.runtimeMapConfigService.restorePersistedMapConfigs?.();
  }

  /**
 * getState：读取状态。
 * @returns 无返回值，完成状态的读取/组装。
 */


  async getState(query?: GmListPlayersQuery) {
    return this.nextGmStateQueryService.getState(query, {
      networkPerfStartedAt: this.networkPerfStartedAt,
      cpuPerfStartedAt: this.cpuPerfStartedAt,
      pathfindingPerfStartedAt: this.pathfindingPerfStartedAt,
    });
  }

  async listPlayers(query?: GmListPlayersQuery) {
    return this.nextGmStateQueryService.listPlayers(query);
  }

  invalidatePlayerListCaches(): void {
    this.nextGmStateQueryService.invalidatePlayerListCaches();
  }
  /**
 * getRuntimeSummary：读取运行态摘要。
 * @returns 无返回值，完成运行态摘要的读取/组装。
 */

  getRuntimeSummary() {
    return this.worldRuntimeService.getRuntimeSummary();
  }
  /**
 * getInstanceLeaseStatus：读取实例 lease / owner。
 * @param instanceId 实例 ID。
 * @returns 无返回值，完成实例 lease / owner 的读取/组装。
 */

  async getInstanceLeaseStatus(instanceId: string) {
    return this.worldRuntimeService.getInstanceLeaseStatus(instanceId);
  }
  /**
 * freezeInstanceWriting：冻结实例写入。
 * @param instanceId 实例 ID。
 * @returns 无返回值，完成实例写入冻结。
 */

  freezeInstanceWriting(instanceId: string) {
    this.worldRuntimeService.freezeInstanceWriting(instanceId);
  }
  /**
 * unfreezeInstanceWriting：解冻实例写入。
 * @param instanceId 实例 ID。
 * @returns 无返回值，完成实例写入解冻。
 */

  unfreezeInstanceWriting(instanceId: string) {
    return this.worldRuntimeService.unfreezeInstanceWriting(instanceId);
  }
  /**
 * flushPlayerPersistence：强制刷单玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成单玩家刷盘。
 */

  async flushPlayerPersistence(playerId: string) {
    await this.playerPersistenceFlushService.flushPlayer(playerId);
    return { ok: true };
  }
  /**
 * flushInstancePersistence：强制刷单实例。
 * @param instanceId 实例 ID。
 * @returns 无返回值，完成单实例刷盘。
 */

  async flushInstancePersistence(instanceId: string) {
    await this.mapPersistenceFlushService.flushInstance(instanceId);
    return { ok: true };
  }
  /**
 * rebuildPersistentInstance：强制重建某实例。
 * @param instanceId 实例 ID。
 * @returns 无返回值，完成单实例重建。
 */

  async rebuildPersistentInstance(instanceId: string) {
    return this.worldRuntimeService.rebuildPersistentInstance(instanceId);
  }
  /**
 * migrateInstanceToNode：手动迁移实例到指定节点。
 * @param instanceId 实例 ID。
 * @param targetNodeId 目标节点 ID。
 * @returns 无返回值，完成实例迁移准备。
 */

  async migrateInstanceToNode(instanceId: string, targetNodeId: string) {
    return this.worldRuntimeService.migrateInstanceToNode(instanceId, targetNodeId);
  }
  /**
 * migratePlayerToNode：手动迁移玩家到指定节点。
 * @param playerId 玩家 ID。
 * @param targetNodeId 目标节点 ID。
 * @returns 无返回值，完成玩家迁移准备。
 */

  async migratePlayerToNode(playerId: string, targetNodeId: string) {
    return this.worldRuntimeService.migratePlayerToNode(playerId, targetNodeId);
  }
  /**
 * getNodeRegistryHealth：读取节点列表与健康状态。
 * @returns 无返回值，完成节点列表与健康状态的读取/组装。
 */

  async getNodeRegistryHealth() {
    const nodes = await this.nodeRegistryService.listNodes();
    return {
      enabled: this.nodeRegistryService.isEnabled(),
      selfNodeId: this.nodeRegistryService.getNodeId(),
      nodes,
      nodeCount: nodes.length,
      healthyNodeCount: nodes.filter((node) => node.status === 'running').length,
      suspectNodeCount: nodes.filter((node) => node.status === 'suspect').length,
      deadNodeCount: nodes.filter((node) => node.status === 'dead').length,
    };
  }
  /**
 * getOutboxRetryQueue：读取失败重试队列。
 * @returns 无返回值，完成失败重试队列的读取/组装。
 */

  async getOutboxRetryQueue() {
    const rows = await this.outboxDispatcherService.listRetryQueue();
    return {
      queued: rows.length,
      rows,
    };
  }
  /**
 * replayOperation：重放单个 operation_id。
 * @param operationId operation ID。
 * @returns 无返回值，完成 operation replay 的读取/组装。
 */

  async replayOperation(operationId: string) {
    return this.durableOperationService.getOperationReplay(operationId);
  }
  /**
 * getEditorCatalog：读取Editor目录。
 * @returns 无返回值，完成Editor目录的读取/组装。
 */


  getEditorCatalog() {
    return this.nextGmEditorQueryService.getEditorCatalog();
  }
  /**
 * getSuggestions：读取Suggestion。
 * @param query 参数说明。
 * @returns 无返回值，完成Suggestion的读取/组装。
 */


  getSuggestions(query) {
    return this.nextGmSuggestionQueryService.getSuggestions(query);
  }
  /**
 * completeSuggestion：执行completeSuggestion相关逻辑。
 * @param id string 参数说明。
 * @returns 无返回值，直接更新completeSuggestion相关状态。
 */


  async completeSuggestion(id: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const updated = await this.suggestionRuntimeService.markCompleted(id);
    if (!updated) {
      throw new BadRequestException('目标建议不存在');
    }

    return { ok: true };
  }
  /**
 * replySuggestion：执行replySuggestion相关逻辑。
 * @param id string 参数说明。
 * @param body 参数说明。
 * @returns 无返回值，直接更新replySuggestion相关状态。
 */


  async replySuggestion(id: string, body) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
    if (!updated) {
      throw new BadRequestException('回复失败');
    }

    return { ok: true };
  }
  /**
 * removeSuggestion：处理Suggestion并更新相关状态。
 * @param id string 参数说明。
 * @returns 无返回值，直接更新Suggestion相关状态。
 */


  async removeSuggestion(id: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const removed = await this.suggestionRuntimeService.remove(id);
    if (!removed) {
      throw new BadRequestException('目标建议不存在');
    }

    return { ok: true };
  }
  /**
 * getMaps：读取地图。
 * @returns 无返回值，完成地图的读取/组装。
 */


  getMaps() {
    return this.nextGmMapQueryService.getMaps();
  }
  /**
 * getMapRuntime：读取和平公共线兼容运行态。
 * @param mapId string 地图 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param w 参数说明。
 * @param h 参数说明。
 * @param viewerId viewer ID。
 * @returns 无返回值，完成和平公共线兼容运行态的读取/组装。
 */


  async getMapRuntime(mapId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const payload = this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
    return this.enrichRuntimePayloadWithOfflineHangingPlayers(
      payload,
      buildPublicInstanceId(mapId),
      x,
      y,
      w,
      h,
    );
  }
  /**
 * getWorldInstances：读取世界实例列表。
 * @returns 无返回值，完成世界实例列表的读取/组装。
 */


  async getWorldInstances() {
    const runtimeInstances = this.worldRuntimeService
      .listInstances()
      .filter((instance) => !isNonSectRuntimeLineForSectTemplate(instance));
    const runtimePlayerIds = new Set<string>();
    for (const instance of runtimeInstances) {
      for (const player of Array.isArray((instance as { players?: unknown }).players) ? (instance as { players?: Array<{ playerId?: unknown }> }).players ?? [] : []) {
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (playerId) {
          runtimePlayerIds.add(playerId);
        }
      }
    }
    const offlineHangingCounts = await this.loadOfflineHangingCountsByInstance(runtimePlayerIds);
    return {
      instances: runtimeInstances
        .map((instance) => ({
          ...instance,
          playerCount: Math.max(0, Math.trunc(Number(instance.playerCount) || 0))
            + (offlineHangingCounts.get(instance.instanceId) ?? 0),
        }))
        .slice()
        .sort(compareWorldInstanceSummary),
    };
  }
  /**
 * getWorldInstanceRuntime：读取实例运行态。
 * @param instanceId string 实例 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param w 参数说明。
 * @param h 参数说明。
 * @param viewerId viewer ID。
 * @returns 无返回值，完成实例运行态的读取/组装。
 */


  async getWorldInstanceRuntime(instanceId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const payload = this.nextGmMapRuntimeQueryService.getInstanceRuntime(instanceId, x, y, w, h);
    return this.enrichRuntimePayloadWithOfflineHangingPlayers(payload, instanceId, x, y, w, h);
  }

  private async loadOfflineHangingCountsByInstance(runtimePlayerIds: ReadonlySet<string>): Promise<Map<string, number>> {
    const pool = this.databasePoolProvider?.getPool('gm-world-offline-hanging-counts');
    if (!pool) {
      return new Map();
    }
    const excludedPlayerIds = Array.from(runtimePlayerIds).filter((playerId) => playerId.length > 0);
    const result = await pool.query<{ instance_id?: unknown; count?: unknown }>(
      `
        SELECT
          position.instance_id,
          count(*)::bigint AS count
        FROM player_position_checkpoint position
        LEFT JOIN player_presence presence ON presence.player_id = position.player_id
        WHERE position.instance_id IS NOT NULL
          AND position.instance_id <> ''
          AND COALESCE(presence.online, false) IS FALSE
          AND COALESCE(presence.in_world, true) IS TRUE
          AND NOT (position.player_id = ANY($1::varchar[]))
          AND position.player_id NOT LIKE 'gm_bot_%'
        GROUP BY position.instance_id
      `,
      [excludedPlayerIds],
    ).catch(() => ({ rows: [] }));
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const instanceId = typeof row.instance_id === 'string' ? row.instance_id.trim() : '';
      const count = Number(row.count);
      if (instanceId && Number.isFinite(count) && count > 0) {
        counts.set(instanceId, Math.trunc(count));
      }
    }
    return counts;
  }

  private async enrichRuntimePayloadWithOfflineHangingPlayers(
    payload: unknown,
    instanceId: string,
    xInput: unknown,
    yInput: unknown,
    wInput: unknown,
    hInput: unknown,
  ): Promise<unknown> {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }
    const record = payload as {
      entities?: Array<Record<string, unknown>>;
      playerCount?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const entities = Array.isArray(record.entities) ? record.entities : [];
    const runtimePlayerIds = new Set(
      entities
        .filter((entry) => entry?.kind === 'player')
        .map((entry) => (typeof entry?.id === 'string' ? entry.id.trim() : ''))
        .filter((playerId) => playerId.length > 0),
    );
    const viewport = resolveGmRuntimeViewport(xInput, yInput, wInput, hInput, record.width, record.height);
    const offlinePlayers = await this.loadOfflineHangingPlayersInViewport(instanceId, runtimePlayerIds, viewport);
    if (offlinePlayers.length === 0) {
      return payload;
    }
    return {
      ...record,
      playerCount: Math.max(0, Math.trunc(Number(record.playerCount) || 0)) + offlinePlayers.length,
      entities: [...entities, ...offlinePlayers],
    };
  }

  private async loadOfflineHangingPlayersInViewport(
    instanceId: string,
    runtimePlayerIds: ReadonlySet<string>,
    viewport: { startX: number; startY: number; endX: number; endY: number },
  ): Promise<Array<Record<string, unknown>>> {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    const pool = this.databasePoolProvider?.getPool('gm-world-offline-hanging-players');
    if (!pool || !normalizedInstanceId) {
      return [];
    }
    const excludedPlayerIds = Array.from(runtimePlayerIds).filter((playerId) => playerId.length > 0);
    const result = await pool.query<{
      player_id?: unknown;
      x?: unknown;
      y?: unknown;
      player_name?: unknown;
      display_name?: unknown;
      hp?: unknown;
      max_hp?: unknown;
    }>(
      `
        SELECT
          position.player_id,
          position.x,
          position.y,
          COALESCE(identity.player_name, auth.pending_role_name, position.player_id) AS player_name,
          COALESCE(identity.display_name, auth.display_name, identity.player_name, auth.pending_role_name, position.player_id) AS display_name,
          vitals.hp,
          vitals.max_hp
        FROM player_position_checkpoint position
        LEFT JOIN player_presence presence ON presence.player_id = position.player_id
        LEFT JOIN server_player_identity identity ON identity.player_id = position.player_id
        LEFT JOIN server_player_auth auth ON auth.player_id = position.player_id
        LEFT JOIN player_vitals vitals ON vitals.player_id = position.player_id
        WHERE position.instance_id = $1
          AND COALESCE(presence.online, false) IS FALSE
          AND COALESCE(presence.in_world, true) IS TRUE
          AND position.x >= $2::bigint
          AND position.x < $3::bigint
          AND position.y >= $4::bigint
          AND position.y < $5::bigint
          AND NOT (position.player_id = ANY($6::varchar[]))
          AND position.player_id NOT LIKE 'gm_bot_%'
        ORDER BY position.player_id ASC
        LIMIT 500
      `,
      [
        normalizedInstanceId,
        viewport.startX,
        viewport.endX,
        viewport.startY,
        viewport.endY,
        excludedPlayerIds,
      ],
    ).catch(() => ({ rows: [] }));

    return result.rows
      .map((row) => {
        const playerId = typeof row.player_id === 'string' ? row.player_id.trim() : '';
        const x = Math.trunc(Number(row.x));
        const y = Math.trunc(Number(row.y));
        if (!playerId || !Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }
        const displayName = typeof row.display_name === 'string' && row.display_name.trim()
          ? row.display_name.trim()
          : (typeof row.player_name === 'string' && row.player_name.trim() ? row.player_name.trim() : playerId);
        const hp = Number(row.hp);
        const maxHp = Number(row.max_hp);
        return {
          id: playerId,
          x,
          y,
          char: displayName[0] ?? '人',
          color: '#888',
          name: displayName,
          kind: 'player',
          hp: Number.isFinite(hp) ? hp : undefined,
          maxHp: Number.isFinite(maxHp) ? maxHp : undefined,
          dead: Number.isFinite(hp) ? hp <= 0 : false,
          online: false,
          autoBattle: false,
          isBot: false,
        };
      })
      .filter((entry) => entry !== null);
  }

  getWorldInstanceBuildingState(instanceId: string) {
    return this.nextGmMapRuntimeQueryService.getInstanceBuildingState(instanceId);
  }

  getWorldInstanceBuildingCellState(instanceId: string, x: unknown, y: unknown) {
    return this.nextGmMapRuntimeQueryService.getInstanceBuildingCellState(instanceId, x, y);
  }

  getWorldBuildingOperationAudit(limit?: unknown) {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
    return {
      limit: normalizedLimit,
      items: typeof this.worldRuntimeService.listBuildingOperationAudit === 'function'
        ? this.worldRuntimeService.listBuildingOperationAudit(normalizedLimit)
        : [],
    };
  }

  recalculateWorldInstanceBuildingState(instanceId: string) {
    return this.nextGmMapRuntimeQueryService.recalculateInstanceBuildingState(instanceId);
  }

  repairWorldInstanceBuildingState(instanceId: string) {
    return this.nextGmMapRuntimeQueryService.repairInstanceBuildingState(instanceId);
  }
  /**
 * createWorldInstance：创建手动分线实例。
 * @param body GmCreateWorldInstanceReq 参数说明。
 * @returns 无返回值，完成手动分线实例的创建/组装。
 */


  createWorldInstance(body: GmCreateWorldInstanceReq) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const templateId = typeof body?.templateId === 'string' ? body.templateId.trim() : '';
    if (!templateId) {
      throw new BadRequestException('模板 ID 不能为空');
    }
    if (isSectTemplateId(templateId)) {
      throw new BadRequestException('宗门地图由宗门运行时创建，不能按和平/真实线手动扩线');
    }
    const template = this.mapTemplateRepository.getOrThrow(templateId);
    const linePreset = parseRequiredLinePreset(body?.linePreset);
    const persistentPolicy = normalizeRuntimeInstancePersistentPolicy(body?.persistentPolicy);
    const expireAt = normalizeOptionalFutureTimestamp(body?.expireAt);
    const lineIndex = resolveManualLineIndex(this.worldRuntimeService.listInstances(), templateId, linePreset);
    const presetMeta = buildRuntimeInstancePresetMeta({
      templateName: template.name,
      displayName: typeof body?.displayName === 'string' ? body.displayName.trim() : '',
      linePreset,
      lineIndex,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
    });
    const created = this.worldRuntimeService.createInstance({
      instanceId: buildManualLineInstanceId(templateId, linePreset, lineIndex),
      templateId,
      kind: 'public',
      persistent: persistentPolicy !== 'ephemeral',
      persistentPolicy,
      displayName: presetMeta.displayName,
      linePreset: presetMeta.linePreset,
      lineIndex: presetMeta.lineIndex,
      instanceOrigin: presetMeta.instanceOrigin,
      defaultEntry: presetMeta.defaultEntry,
      ...(expireAt ? { destroyAt: new Date(expireAt).toISOString() } : {}),
    });
    return {
      instance: created.snapshot(),
    };
  }
  /**
 * transferPlayerToInstance：把在线玩家迁移到指定实例。
 * @param body GmTransferPlayerToInstanceReq 参数说明。
 * @returns 无返回值，直接更新玩家实例落点相关状态。
 */


  transferPlayerToInstance(body: GmTransferPlayerToInstanceReq) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const instanceId = typeof body?.instanceId === 'string' ? body.instanceId.trim() : '';
    if (!playerId) {
      throw new BadRequestException('玩家 ID 不能为空');
    }
    if (!instanceId) {
      throw new BadRequestException('地图实例 ID 不能为空');
    }
    if (!this.worldRuntimeService.getInstance(instanceId)) {
      throw new BadRequestException('目标实例不存在');
    }
    if (!this.worldRuntimeService.getPlayerLocation(playerId)) {
      throw new BadRequestException('目标玩家未在线');
    }
    const runtimePlayer = this.worldRuntimeService.playerRuntimeService.getPlayer(playerId);
    if (!runtimePlayer) {
      throw new BadRequestException('目标玩家运行态不存在');
    }
    if ((runtimePlayer.hp ?? 1) <= 0 || this.worldRuntimeService.worldRuntimeGmQueueService.hasPendingRespawn(playerId)) {
      throw new BadRequestException('目标玩家当前处于待复生状态，无法迁移实例');
    }
    this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmUpdatePlayer({
      playerId,
      instanceId,
      x: Number.isFinite(body?.x) ? Math.trunc(Number(body.x)) : undefined,
      y: Number.isFinite(body?.y) ? Math.trunc(Number(body.y)) : undefined,
    });
    this.invalidatePlayerListCaches();
    return { ok: true };
  }
  /**
 * updateMapTick：处理地图tick并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新地图tick相关状态。
 */


  async updateMapTick(mapId: string, body) {
    this.mapTemplateRepository.getOrThrow(mapId);
    await this.persistMapConfig(mapId, {
      speed: normalizePersistedMapTickSpeed(body?.speed),
      paused: body?.paused !== undefined ? Boolean(body.paused) : undefined,
    });
    this.runtimeMapConfigService.updateMapTick(mapId, body);
  }
  /**
 * updateMapTime：处理地图时间并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新地图时间相关状态。
 */


  async updateMapTime(mapId: string, body) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    await this.persistMapConfig(mapId, {
      scale: normalizePersistedMapTimeScale(body?.scale),
      offsetTicks: normalizePersistedMapTimeOffsetTicks(body?.offsetTicks),
    });
    this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
  }  
  /**
 * reloadTickConfig：读取reloadtick配置并返回结果。
 * @returns 无返回值，直接更新reloadtick配置相关状态。
 */


  async reloadTickConfig() {
    this.contentTemplateRepository.loadAll();
    this.mapTemplateRepository.loadAll();

    const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
    this.runtimeMapConfigService.pruneMapConfigs(validMapIds);
    await this.prunePersistedMapConfigs(validMapIds);

    return { ok: true };
  }  
  /**
 * clearWorldObservation：执行clear世界Observation相关逻辑。
 * @param viewerId viewer ID。
 * @returns 无返回值，直接更新clear世界Observation相关状态。
 */


  clearWorldObservation(_viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return;
  }  
  /**
 * resetNetworkPerf：执行resetNetworkPerf相关逻辑。
 * @returns 无返回值，直接更新resetNetworkPerf相关状态。
 */


  resetNetworkPerf() {
    this.networkPerfStartedAt = Date.now();
    this.runtimeGmStateService.enableNetworkPerfCounters();
    this.runtimeGmStateService.resetNetworkPerfCounters();
  }  
  /**
 * resetCpuPerf：执行resetCpuPerf相关逻辑。
 * @returns 无返回值，直接更新resetCpuPerf相关状态。
 */


  resetCpuPerf() {
    this.cpuPerfStartedAt = Date.now();
    this.runtimeGmStateService.resetCpuPerfCounters();
  }  
  /**
 * resetPathfindingPerf：读取resetPathfindingPerf并返回结果。
 * @returns 无返回值，直接更新resetPathfindingPerf相关状态。
 */


  resetPathfindingPerf() {
    this.pathfindingPerfStartedAt = Date.now();
  }

  writeHeapSnapshot() {
    return this.runtimeGmStateService.writeHeapSnapshot();
  }

  private async persistMapConfig(mapId: string, partial: GmMapConfigPayload): Promise<void> {
    try {
      await this.gmMapConfigPersistenceService.ensureInitialized();
      if (!this.gmMapConfigPersistenceService.isEnabled()) {
        throw new ServiceUnavailableException('GM 地图配置持久化未启用，无法保证重启后仍生效');
      }
      await this.gmMapConfigPersistenceService.mergeMapConfig(mapId, partial);
    } catch (error: unknown) {
      this.logger.warn(
        `持久化 GM 地图配置失败 mapId=${mapId}`,
        error instanceof Error ? error.message : String(error),
      );
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('GM 地图配置持久化失败，已拒绝本次运行时修改');
    }
  }

  private async prunePersistedMapConfigs(validMapIds: Set<string>): Promise<void> {
    await this.gmMapConfigPersistenceService.pruneMapConfigs(validMapIds).catch((error: unknown) => {
      this.logger.warn(
        '清理 GM 地图配置持久化脏数据失败',
        error instanceof Error ? error.message : String(error),
      );
    });
  }
}

function parseRequiredLinePreset(input: unknown): GmWorldInstanceLinePreset {
  if (!isRuntimeInstanceLinePreset(input)) {
    throw new BadRequestException('分线预设必须是和平线或真实线');
  }
  return input as GmWorldInstanceLinePreset;
}

function normalizePersistedMapTickSpeed(value: unknown): number | undefined {
  if (!Number.isFinite(Number(value))) return undefined;
  return Math.max(0, Math.min(100, Number(value)));
}

function normalizePersistedMapTimeScale(value: unknown): number | undefined {
  if (!Number.isFinite(Number(value))) return undefined;
  return Math.max(0, Number(value));
}

function normalizePersistedMapTimeOffsetTicks(value: unknown): number | undefined {
  if (!Number.isFinite(Number(value))) return undefined;
  return Math.trunc(Number(value));
}

function isSectTemplateId(templateId: unknown): boolean {
  return typeof templateId === 'string' && templateId.trim().startsWith('sect_domain:');
}

function isSectRuntimeInstanceId(instanceId: unknown): boolean {
  return typeof instanceId === 'string' && instanceId.trim().startsWith('sect:');
}

function isNonSectRuntimeLineForSectTemplate(instance: { templateId?: unknown; instanceId?: unknown }): boolean {
  return isSectTemplateId(instance.templateId) && !isSectRuntimeInstanceId(instance.instanceId);
}

function resolveManualLineIndex(
  instances: Array<{ templateId?: string; linePreset?: GmWorldInstanceLinePreset; lineIndex?: number }>,
  templateId: string,
  linePreset: GmWorldInstanceLinePreset,
): number {
  let nextIndex = 2;
  for (const instance of instances) {
    if (instance.templateId !== templateId || instance.linePreset !== linePreset) {
      continue;
    }
    const lineIndex = Number.isFinite(instance.lineIndex) ? Math.trunc(Number(instance.lineIndex)) : 0;
    if (lineIndex >= nextIndex) {
      nextIndex = lineIndex + 1;
    }
  }
  return nextIndex;
}

function normalizeOptionalFutureTimestamp(input: unknown): number | null {
  if (!Number.isFinite(Number(input))) {
    return null;
  }
  const timestamp = Math.trunc(Number(input));
  if (timestamp <= Date.now()) {
    throw new BadRequestException('过期时间必须是未来时间戳');
  }
  return timestamp;
}

function resolveGmRuntimeViewport(
  xInput: unknown,
  yInput: unknown,
  wInput: unknown,
  hInput: unknown,
  widthInput: unknown,
  heightInput: unknown,
): { startX: number; startY: number; endX: number; endY: number } {
  const width = Math.max(1, Math.trunc(Number(widthInput) || 1));
  const height = Math.max(1, Math.trunc(Number(heightInput) || 1));
  const viewWidth = Math.min(20, Math.max(1, Math.trunc(Number(wInput) || 20)));
  const viewHeight = Math.min(20, Math.max(1, Math.trunc(Number(hInput) || 20)));
  const startX = Math.min(Math.max(0, Math.trunc(Number(xInput) || 0)), Math.max(0, width - 1));
  const startY = Math.min(Math.max(0, Math.trunc(Number(yInput) || 0)), Math.max(0, height - 1));
  return {
    startX,
    startY,
    endX: Math.min(width, startX + viewWidth),
    endY: Math.min(height, startY + viewHeight),
  };
}

function compareWorldInstanceSummary(
  left: {
    templateName?: string;
    templateId?: string;
    mapGroupName?: string;
    mapGroupOrder?: number;
    mapGroupMemberOrder?: number;
    linePreset?: GmWorldInstanceLinePreset;
    lineIndex?: number;
    displayName?: string;
  },
  right: {
    templateName?: string;
    templateId?: string;
    mapGroupName?: string;
    mapGroupOrder?: number;
    mapGroupMemberOrder?: number;
    linePreset?: GmWorldInstanceLinePreset;
    lineIndex?: number;
    displayName?: string;
  },
): number {
  const presetWeight = (value: GmWorldInstanceLinePreset | undefined) => (value === 'real' ? 1 : 0);
  const presetOrder = presetWeight(left.linePreset) - presetWeight(right.linePreset);
  if (presetOrder !== 0) {
    return presetOrder;
  }
  const groupOrder = (Number(left.mapGroupOrder) || 1000) - (Number(right.mapGroupOrder) || 1000);
  if (groupOrder !== 0) {
    return groupOrder;
  }
  const leftGroup = left.mapGroupName || left.templateName || left.templateId || '';
  const rightGroup = right.mapGroupName || right.templateName || right.templateId || '';
  const groupNameOrder = leftGroup.localeCompare(rightGroup, 'zh-Hans-CN');
  if (groupNameOrder !== 0) {
    return groupNameOrder;
  }
  const memberOrder = (Number(left.mapGroupMemberOrder) || 0) - (Number(right.mapGroupMemberOrder) || 0);
  if (memberOrder !== 0) {
    return memberOrder;
  }
  const leftIndex = Number.isFinite(left.lineIndex) ? Math.trunc(Number(left.lineIndex)) : 0;
  const rightIndex = Number.isFinite(right.lineIndex) ? Math.trunc(Number(right.lineIndex)) : 0;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return (left.displayName || '').localeCompare(right.displayName || '', 'zh-Hans-CN');
}
