import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { type GmCreateWorldInstanceReq, type GmListPlayersQuery, type GmTransferPlayerToInstanceReq, type GmWorldInstanceLinePreset } from '@mud/shared';
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
import {
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
  resetNetworkPerfCounters(): void;
  resetCpuPerfCounters(): void;
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
 * worldObserverIds：世界ObserverID相关字段。
 */

  private worldObserverIds = new Set<string>();  
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


  getMapRuntime(mapId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof viewerId === 'string' && viewerId.trim()) {
      this.worldObserverIds.add(viewerId.trim());
    }

    return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
  }
  /**
 * getWorldInstances：读取世界实例列表。
 * @returns 无返回值，完成世界实例列表的读取/组装。
 */


  getWorldInstances() {
    return {
      instances: this.worldRuntimeService
        .listInstances()
        .filter((instance) => !isNonSectRuntimeLineForSectTemplate(instance))
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


  getWorldInstanceRuntime(instanceId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof viewerId === 'string' && viewerId.trim()) {
      this.worldObserverIds.add(viewerId.trim());
    }

    return this.nextGmMapRuntimeQueryService.getInstanceRuntime(instanceId, x, y, w, h);
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


  clearWorldObservation(viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
    if (!normalized) {
      return;
    }

    this.worldObserverIds.delete(normalized);
  }  
  /**
 * resetNetworkPerf：执行resetNetworkPerf相关逻辑。
 * @returns 无返回值，直接更新resetNetworkPerf相关状态。
 */


  resetNetworkPerf() {
    this.networkPerfStartedAt = Date.now();
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

function compareWorldInstanceSummary(
  left: {
    templateName?: string;
    templateId?: string;
    linePreset?: GmWorldInstanceLinePreset;
    lineIndex?: number;
    displayName?: string;
  },
  right: {
    templateName?: string;
    templateId?: string;
    linePreset?: GmWorldInstanceLinePreset;
    lineIndex?: number;
    displayName?: string;
  },
): number {
  const leftTemplate = left.templateName || left.templateId || '';
  const rightTemplate = right.templateName || right.templateId || '';
  const templateOrder = leftTemplate.localeCompare(rightTemplate, 'zh-Hans-CN');
  if (templateOrder !== 0) {
    return templateOrder;
  }
  const presetWeight = (value: GmWorldInstanceLinePreset | undefined) => (value === 'real' ? 1 : 0);
  const presetOrder = presetWeight(left.linePreset) - presetWeight(right.linePreset);
  if (presetOrder !== 0) {
    return presetOrder;
  }
  const leftIndex = Number.isFinite(left.lineIndex) ? Math.trunc(Number(left.lineIndex)) : 0;
  const rightIndex = Number.isFinite(right.lineIndex) ? Math.trunc(Number(right.lineIndex)) : 0;
  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return (left.displayName || '').localeCompare(right.displayName || '', 'zh-Hans-CN');
}
