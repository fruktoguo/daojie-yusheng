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
 * id：ID标识。
 */
 id: string;  
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
 * getState：读取状态。
 * @returns 无返回值，完成状态的读取/组装。
 */


  async getState() {
    return this.nextGmStateQueryService.getState({
      networkPerfStartedAt: this.networkPerfStartedAt,
      cpuPerfStartedAt: this.cpuPerfStartedAt,
      pathfindingPerfStartedAt: this.pathfindingPerfStartedAt,
    });
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
 * getMapRuntime：读取地图运行态。
 * @param mapId string 地图 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param w 参数说明。
 * @param h 参数说明。
 * @param viewerId viewer ID。
 * @returns 无返回值，完成地图运行态的读取/组装。
 */


  getMapRuntime(mapId: string, x, y, w, h, viewerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof viewerId === 'string' && viewerId.trim()) {
      this.worldObserverIds.add(viewerId.trim());
    }

    return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
  }  
  /**
 * updateMapTick：处理地图tick并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新地图tick相关状态。
 */


  updateMapTick(mapId: string, body) {
    this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTick(mapId, body);
  }  
  /**
 * updateMapTime：处理地图时间并更新相关状态。
 * @param mapId string 地图 ID。
 * @param body 参数说明。
 * @returns 无返回值，直接更新地图时间相关状态。
 */


  updateMapTime(mapId: string, body) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
  }  
  /**
 * reloadTickConfig：读取reloadtick配置并返回结果。
 * @returns 无返回值，直接更新reloadtick配置相关状态。
 */


  reloadTickConfig() {
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
  }  
  /**
 * resetCpuPerf：执行resetCpuPerf相关逻辑。
 * @returns 无返回值，直接更新resetCpuPerf相关状态。
 */


  resetCpuPerf() {
    this.cpuPerfStartedAt = Date.now();
  }  
  /**
 * resetPathfindingPerf：读取resetPathfindingPerf并返回结果。
 * @returns 无返回值，直接更新resetPathfindingPerf相关状态。
 */


  resetPathfindingPerf() {
    this.pathfindingPerfStartedAt = Date.now();
  }
}
