/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 世界管理服务。
 * 编排世界运行时查询、地图实例创建/迁移/冻结/重建、玩家迁移、
 * 性能计数器重置、tick/时间配置修改等 GM 操作。
 */
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { type GmCreateWorldInstanceReq, type GmListPlayersQuery, type GmPlayerListRes, type GmTransferPlayerToInstanceReq, type GmWorldInstanceLinePreset } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../../runtime/map/runtime-map-config.service';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
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
import { NodeRegistryService } from '../../persistence/node-registry.service';
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
  shouldCaptureNetworkPayloadBody(): boolean;
  setNetworkPayloadCaptureEnabled(enabled: boolean): void;
  resetNetworkPerfCounters(): void;
  resetCpuPerfCounters(): void;
  writeHeapSnapshot(options?: { deleteSnapshotAfterSummary?: boolean }): unknown | Promise<unknown>;
  getLatestHeapSnapshotSummary(): unknown;
  triggerManualGc(): unknown | Promise<unknown>;
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
 * RuntimeMapConfigServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMapConfigServiceLike {
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
  resetCpuPerfCounters?(): void;
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
  listInstanceRuntimes(): Iterable<Record<string, unknown>>;
  listInstanceEntries(): Iterable<[string, Record<string, unknown>]>;
  getInstanceCount(): number;
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
 * @param runtimeMapConfigService RuntimeMapConfigServiceLike 参数说明。
 * @param nextGmStateQueryService NativeGmStateQueryServiceLike 参数说明。
 * @param nextGmEditorQueryService NativeGmEditorQueryServiceLike 参数说明。
 * @param nextGmMapQueryService NativeGmMapQueryServiceLike 参数说明。
 * @param nextGmMapRuntimeQueryService NativeGmMapRuntimeQueryServiceLike 参数说明。
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
    @Inject(NodeRegistryService)
    private readonly nodeRegistryService: NodeRegistryServiceLike,
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
    // Phase 6：不再从旧表恢复 GM 配置，tickSpeed 真源已迁移到实例 checkpoint
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

  async cleanupAbnormalTemporaryTiles() {
    let scannedInstances = 0;
    let affectedInstances = 0;
    let removedTemporaryTiles = 0;
    let flushedInstances = 0;
    for (const [entryInstanceId, instance] of this.worldRuntimeService.listInstanceEntries()) {
      const runtime = instance as Record<string, unknown> & {
        tick?: number;
        meta?: { instanceId?: string; persistent?: boolean };
        removeAbnormalTemporaryTiles?: (currentTick?: number) => { scanned?: number; removed?: number };
      };
      if (typeof runtime.removeAbnormalTemporaryTiles !== 'function') {
        continue;
      }
      scannedInstances += 1;
      const result = runtime.removeAbnormalTemporaryTiles(Number.isFinite(Number(runtime.tick)) ? Math.trunc(Number(runtime.tick)) : 0);
      const removed = Math.max(0, Math.trunc(Number(result?.removed) || 0));
      if (removed <= 0) {
        continue;
      }
      affectedInstances += 1;
      removedTemporaryTiles += removed;
      const instanceId = typeof runtime.meta?.instanceId === 'string' && runtime.meta.instanceId.trim()
        ? runtime.meta.instanceId.trim()
        : entryInstanceId;
      if (runtime.meta?.persistent === true) {
        await this.mapPersistenceFlushService.flushInstance(instanceId);
        flushedInstances += 1;
      }
    }
    return {
      ok: true,
      totalPlayers: 0,
      queuedRuntimePlayers: 0,
      updatedOfflinePlayers: 0,
      scannedInstances,
      affectedInstances,
      removedTemporaryTiles,
      flushedInstances,
    };
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
    const normalizedSpeed = normalizePersistedMapTickSpeed(body?.speed);
    const paused = body?.paused !== undefined ? Boolean(body.paused) : undefined;
    // Phase 6：不再写入旧表 server_gm_map_config，tickSpeed 已迁移到实例 checkpoint。
    // 保留 RuntimeMapConfigService 内存缓存更新用于 GM 查询兼容。
    this.runtimeMapConfigService.updateMapTick(mapId, body);
    // 同步更新所有使用该模板的实例的 tickSpeed（真源），并立即落 time checkpoint。
    const affectedInstanceIds = this.applyTickSpeedToInstancesByTemplate(mapId, normalizedSpeed, paused);
    await this.flushTickSpeedCheckpoints(affectedInstanceIds);
  }

  /** 按 instanceId 更新单个实例的 tickSpeed。 */
  async updateInstanceTick(instanceId: string, body: { speed?: unknown; paused?: unknown }): Promise<{ ok: boolean; reason?: string }> {
    if (typeof this.worldRuntimeService.listInstanceRuntimes !== 'function') {
      return { ok: false, reason: 'runtime_not_available' };
    }
    let targetInstance: any = null;
    for (const inst of this.worldRuntimeService.listInstanceRuntimes()) {
      if ((inst as any)?.meta?.instanceId === instanceId) {
        targetInstance = inst;
        break;
      }
    }
    if (!targetInstance) {
      return { ok: false, reason: 'instance_not_found' };
    }
    const normalizedSpeed = normalizePersistedMapTickSpeed(body?.speed);
    let paused: boolean | undefined;
    if (body?.paused !== undefined) {
      paused = Boolean(body.paused);
    } else if (normalizedSpeed !== undefined) {
      paused = normalizedSpeed === 0 ? true : false;
    }
    if (paused === true) {
      targetInstance.tickSpeed = 0;
      targetInstance.paused = true;
    } else if (paused === false) {
      targetInstance.paused = false;
      if (normalizedSpeed !== undefined) {
        targetInstance.tickSpeed = normalizedSpeed;
      } else if (targetInstance.tickSpeed === 0) {
        targetInstance.tickSpeed = 1;
      }
    } else if (normalizedSpeed !== undefined) {
      targetInstance.tickSpeed = normalizedSpeed;
      targetInstance.paused = normalizedSpeed === 0;
    }
    // 标记 time 域为脏以触发 checkpoint 持久化
    if (typeof targetInstance.markPersistenceDirtyDomains === 'function') {
      targetInstance.markPersistenceDirtyDomains(['time']);
    }
    await this.flushTickSpeedCheckpoints([instanceId]);
    return { ok: true };
  }

  /** 将 tickSpeed 应用到所有使用指定模板的实例。 */
  private applyTickSpeedToInstancesByTemplate(templateId: string, speed: number | undefined, paused: boolean | undefined): string[] {
    const affectedInstanceIds: string[] = [];
    if (typeof this.worldRuntimeService.listInstanceRuntimes !== 'function') {
      return affectedInstanceIds;
    }
    for (const instance of this.worldRuntimeService.listInstanceRuntimes()) {
      const inst = instance as any;
      if (inst?.template?.id !== templateId) {
        continue;
      }
      const instanceId = typeof inst?.meta?.instanceId === 'string' && inst.meta.instanceId.trim()
        ? inst.meta.instanceId.trim()
        : '';
      if (instanceId) {
        affectedInstanceIds.push(instanceId);
      }
      if (paused === true) {
        inst.tickSpeed = 0;
        inst.paused = true;
      } else if (paused === false) {
        inst.paused = false;
        if (speed !== undefined) {
          inst.tickSpeed = speed;
        } else if (inst.tickSpeed === 0) {
          inst.tickSpeed = 1;
        }
      } else if (speed !== undefined) {
        inst.tickSpeed = speed;
        inst.paused = speed === 0;
      }
      if (typeof inst.markPersistenceDirtyDomains === 'function') {
        inst.markPersistenceDirtyDomains(['time']);
      }
    }
    return affectedInstanceIds;
  }

  /** GM 改速是运维显式写入，必须立即落 checkpoint，避免重启窗口丢失。 */
  private async flushTickSpeedCheckpoints(instanceIds: string[]): Promise<void> {
    const uniqueInstanceIds = Array.from(new Set(
      instanceIds
        .filter((instanceId) => typeof instanceId === 'string' && instanceId.trim())
        .map((instanceId) => instanceId.trim()),
    ));
    for (const instanceId of uniqueInstanceIds) {
      await this.mapPersistenceFlushService.flushInstance(instanceId);
    }
  }
  /**
 * updateMapTime：处理地图时间并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新地图时间相关状态。
 */


  async updateMapTime(mapId: string, body) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    // Phase 6：不再写入旧表 server_gm_map_config，时间配置保留内存缓存兼容。
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
  setNetworkPayloadCaptureEnabled(enabled: boolean) {
    this.runtimeGmStateService.setNetworkPayloadCaptureEnabled(enabled === true);
  }
  isNetworkPayloadCaptureEnabled(): boolean {
    return this.runtimeGmStateService.shouldCaptureNetworkPayloadBody();
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

  writeHeapSnapshot(options?: { deleteSnapshotAfterSummary?: boolean }) {
    return this.runtimeGmStateService.writeHeapSnapshot(options);
  }

  triggerManualGc() {
    return this.runtimeGmStateService.triggerManualGc();
  }

  getLatestHeapSnapshotSummary() {
    return this.runtimeGmStateService.getLatestHeapSnapshotSummary();
  }

  /** 聚合所有对象管理器的运行时对象数量。 */
  getObjectCounts(): Record<string, unknown> {
    const instances = Array.from(this.worldRuntimeService.listInstanceRuntimes());
    const instanceCount = this.worldRuntimeService.getInstanceCount();
    let totalPlayers = 0;
    let totalMonsters = 0;
    let totalNpcs = 0;
    let totalLandmarks = 0;
    let totalContainers = 0;
    let totalGroundPiles = 0;
    let totalPendingCommands = 0;
    let totalMonsterSpawnGroups = 0;
    const perInstance: Array<{
      instanceId: string;
      players: number;
      monsters: number;
      npcs: number;
      landmarks: number;
      containers: number;
      groundPiles: number;
      pendingCommands: number;
    }> = [];

    for (const instance of instances as Array<Record<string, any>>) {
      const instanceId = instance.meta?.instanceId ?? instance.snapshot?.()?.instanceId ?? '';
      const players = instance.playersById?.size ?? 0;
      const monsters = instance.monstersByRuntimeId?.size ?? 0;
      const npcs = instance.npcsById?.size ?? 0;
      const landmarks = instance.landmarksById?.size ?? 0;
      const containers = instance.containersById?.size ?? 0;
      const groundPiles = instance.groundPilesByTile?.size ?? 0;
      const pendingCommands = instance.pendingCommands?.size ?? 0;
      const monsterSpawnGroups = instance.monsterSpawnGroupsByKey?.size ?? 0;

      totalPlayers += players;
      totalMonsters += monsters;
      totalNpcs += npcs;
      totalLandmarks += landmarks;
      totalContainers += containers;
      totalGroundPiles += groundPiles;
      totalPendingCommands += pendingCommands;
      totalMonsterSpawnGroups += monsterSpawnGroups;

      perInstance.push({ instanceId, players, monsters, npcs, landmarks, containers, groundPiles, pendingCommands });
    }

    // 按怪物数量降序排列，只取前 20 个实例展示细节
    perInstance.sort((a, b) => (b.monsters + b.players) - (a.monsters + a.players));

    return {
      totals: {
        instances: instanceCount,
        players: totalPlayers,
        monsters: totalMonsters,
        npcs: totalNpcs,
        landmarks: totalLandmarks,
        containers: totalContainers,
        groundPiles: totalGroundPiles,
        pendingCommands: totalPendingCommands,
        monsterSpawnGroups: totalMonsterSpawnGroups,
      },
      topInstances: perInstance.slice(0, 20),
    };
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
