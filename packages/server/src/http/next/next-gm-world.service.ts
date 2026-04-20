import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
import { RuntimeMapConfigService } from '../../runtime/map/runtime-map-config.service';
import { RuntimeGmStateService } from '../../runtime/gm/runtime-gm-state.service';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
import { NextGmEditorQueryService } from './next-gm-editor-query.service';
import { NextGmMapQueryService } from './next-gm-map-query.service';
import { NextGmMapRuntimeQueryService } from './next-gm-map-runtime-query.service';
import { NextGmStateQueryService } from './next-gm-state-query.service';
import { NextGmSuggestionQueryService } from './next-gm-suggestion-query.service';
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
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): {  
  /**
 * id：MapTemplateRepositoryLike 内部字段。
 */
 id: string;  
 /**
 * source：MapTemplateRepositoryLike 内部字段。
 */
 source: {  
 /**
 * time：MapTemplateRepositoryLike 内部字段。
 */
 time?: Record<string, unknown> } };
  loadAll(): void;
  listSummaries(): Array<{  
  /**
 * id：MapTemplateRepositoryLike 内部字段。
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
  updateMapTick(mapId: string, body?: unknown): void;
  updateMapTime(mapId: string, sourceTime: Record<string, unknown>, body?: unknown): void;
  pruneMapConfigs(validMapIds: Set<string>): void;
}
/**
 * NextGmStateQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextGmStateQueryServiceLike {
  getState(timers: {  
  /**
 * networkPerfStartedAt：NextGmStateQueryServiceLike 内部字段。
 */
 networkPerfStartedAt: number;  
 /**
 * cpuPerfStartedAt：NextGmStateQueryServiceLike 内部字段。
 */
 cpuPerfStartedAt: number;  
 /**
 * pathfindingPerfStartedAt：NextGmStateQueryServiceLike 内部字段。
 */
 pathfindingPerfStartedAt: number }): Promise<unknown>;
}
/**
 * NextGmEditorQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextGmEditorQueryServiceLike {
  getEditorCatalog(): unknown;
}
/**
 * NextGmMapQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextGmMapQueryServiceLike {
  getMaps(): unknown;
}
/**
 * NextGmMapRuntimeQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextGmMapRuntimeQueryServiceLike {
  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown): unknown;
}
/**
 * NextGmSuggestionQueryServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface NextGmSuggestionQueryServiceLike {
  getSuggestions(query?: unknown): unknown;
}
/**
 * NextGmWorldService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextGmWorldService {
/**
 * networkPerfStartedAt：NextGmWorldService 内部字段。
 */

  private networkPerfStartedAt = Date.now();  
  /**
 * cpuPerfStartedAt：NextGmWorldService 内部字段。
 */

  private cpuPerfStartedAt = Date.now();  
  /**
 * pathfindingPerfStartedAt：NextGmWorldService 内部字段。
 */

  private pathfindingPerfStartedAt = Date.now();  
  /**
 * worldObserverIds：NextGmWorldService 内部字段。
 */

  private worldObserverIds = new Set<string>();  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository ContentTemplateRepositoryLike 参数说明。
 * @param runtimeGmStateService RuntimeGmStateServiceLike 参数说明。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @param suggestionRuntimeService SuggestionRuntimeServiceLike 参数说明。
 * @param runtimeMapConfigService RuntimeMapConfigServiceLike 参数说明。
 * @param nextGmStateQueryService NextGmStateQueryServiceLike 参数说明。
 * @param nextGmEditorQueryService NextGmEditorQueryServiceLike 参数说明。
 * @param nextGmMapQueryService NextGmMapQueryServiceLike 参数说明。
 * @param nextGmMapRuntimeQueryService NextGmMapRuntimeQueryServiceLike 参数说明。
 * @param nextGmSuggestionQueryService NextGmSuggestionQueryServiceLike 参数说明。
 * @returns 无返回值（构造函数）。
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
    @Inject(NextGmStateQueryService)
    private readonly nextGmStateQueryService: NextGmStateQueryServiceLike,
    @Inject(NextGmEditorQueryService)
    private readonly nextGmEditorQueryService: NextGmEditorQueryServiceLike,
    @Inject(NextGmMapQueryService)
    private readonly nextGmMapQueryService: NextGmMapQueryServiceLike,
    @Inject(NextGmMapRuntimeQueryService)
    private readonly nextGmMapRuntimeQueryService: NextGmMapRuntimeQueryServiceLike,
    @Inject(NextGmSuggestionQueryService)
    private readonly nextGmSuggestionQueryService: NextGmSuggestionQueryServiceLike,
  ) {}  
  /**
 * getState：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  async getState() {
    return this.nextGmStateQueryService.getState({
      networkPerfStartedAt: this.networkPerfStartedAt,
      cpuPerfStartedAt: this.cpuPerfStartedAt,
      pathfindingPerfStartedAt: this.pathfindingPerfStartedAt,
    });
  }  
  /**
 * getEditorCatalog：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  getEditorCatalog() {
    return this.nextGmEditorQueryService.getEditorCatalog();
  }  
  /**
 * getSuggestions：按给定条件读取/查询数据。
 * @param query 参数说明。
 * @returns 函数返回值。
 */


  getSuggestions(query) {
    return this.nextGmSuggestionQueryService.getSuggestions(query);
  }  
  /**
 * completeSuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @returns 函数返回值。
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
 * replySuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @param body 参数说明。
 * @returns 函数返回值。
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
 * removeSuggestion：执行核心业务逻辑。
 * @param id string 参数说明。
 * @returns 函数返回值。
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
 * getMaps：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


  getMaps() {
    return this.nextGmMapQueryService.getMaps();
  }  
  /**
 * getMapRuntime：按给定条件读取/查询数据。
 * @param mapId string 地图 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param w 参数说明。
 * @param h 参数说明。
 * @param viewerId viewer ID。
 * @returns 函数返回值。
 */


  getMapRuntime(mapId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof viewerId === 'string' && viewerId.trim()) {
      this.worldObserverIds.add(viewerId.trim());
    }

    return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
  }  
  /**
 * updateMapTick：更新/写入相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 函数返回值。
 */


  updateMapTick(mapId: string, body) {
    this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTick(mapId, body);
  }  
  /**
 * updateMapTime：更新/写入相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 函数返回值。
 */


  updateMapTime(mapId: string, body) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
  }  
  /**
 * reloadTickConfig：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  reloadTickConfig() {
    this.contentTemplateRepository.loadAll();
    this.mapTemplateRepository.loadAll();

    const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
    this.runtimeMapConfigService.pruneMapConfigs(validMapIds);

    return { ok: true };
  }  
  /**
 * clearWorldObservation：执行核心业务逻辑。
 * @param viewerId viewer ID。
 * @returns 函数返回值。
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
 * resetNetworkPerf：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  resetNetworkPerf() {
    this.networkPerfStartedAt = Date.now();
  }  
  /**
 * resetCpuPerf：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  resetCpuPerf() {
    this.cpuPerfStartedAt = Date.now();
  }  
  /**
 * resetPathfindingPerf：执行核心业务逻辑。
 * @returns 函数返回值。
 */


  resetPathfindingPerf() {
    this.pathfindingPerfStartedAt = Date.now();
  }
}
