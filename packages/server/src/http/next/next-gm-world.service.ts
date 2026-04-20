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

interface ContentTemplateRepositoryLike {
  loadAll(): void;
}

interface RuntimeGmStateServiceLike {
  buildPerformanceSnapshot(): Record<string, unknown>;
}

interface MapTemplateRepositoryLike {
  getOrThrow(mapId: string): { id: string; source: { time?: Record<string, unknown> } };
  loadAll(): void;
  listSummaries(): Array<{ id: string }>;
}

interface SuggestionRuntimeServiceLike {
  markCompleted(id: string): Promise<boolean>;
  addReply(id: string, authorId: string, authorType: string, authorName: string, content: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

interface RuntimeMapConfigServiceLike {
  updateMapTick(mapId: string, body?: unknown): void;
  updateMapTime(mapId: string, sourceTime: Record<string, unknown>, body?: unknown): void;
  pruneMapConfigs(validMapIds: Set<string>): void;
}

interface NextGmStateQueryServiceLike {
  getState(timers: { networkPerfStartedAt: number; cpuPerfStartedAt: number; pathfindingPerfStartedAt: number }): Promise<unknown>;
}

interface NextGmEditorQueryServiceLike {
  getEditorCatalog(): unknown;
}

interface NextGmMapQueryServiceLike {
  getMaps(): unknown;
}

interface NextGmMapRuntimeQueryServiceLike {
  getMapRuntime(mapId: string, x?: unknown, y?: unknown, w?: unknown, h?: unknown): unknown;
}

interface NextGmSuggestionQueryServiceLike {
  getSuggestions(query?: unknown): unknown;
}

@Injectable()
export class NextGmWorldService {
  private networkPerfStartedAt = Date.now();
  private cpuPerfStartedAt = Date.now();
  private pathfindingPerfStartedAt = Date.now();
  private worldObserverIds = new Set<string>();

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

  async getState() {
    return this.nextGmStateQueryService.getState({
      networkPerfStartedAt: this.networkPerfStartedAt,
      cpuPerfStartedAt: this.cpuPerfStartedAt,
      pathfindingPerfStartedAt: this.pathfindingPerfStartedAt,
    });
  }

  getEditorCatalog() {
    return this.nextGmEditorQueryService.getEditorCatalog();
  }

  getSuggestions(query) {
    return this.nextGmSuggestionQueryService.getSuggestions(query);
  }

  async completeSuggestion(id: string) {
    const updated = await this.suggestionRuntimeService.markCompleted(id);
    if (!updated) {
      throw new BadRequestException('目标建议不存在');
    }

    return { ok: true };
  }

  async replySuggestion(id: string, body) {
    const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
    if (!updated) {
      throw new BadRequestException('回复失败');
    }

    return { ok: true };
  }

  async removeSuggestion(id: string) {
    const removed = await this.suggestionRuntimeService.remove(id);
    if (!removed) {
      throw new BadRequestException('目标建议不存在');
    }

    return { ok: true };
  }

  getMaps() {
    return this.nextGmMapQueryService.getMaps();
  }

  getMapRuntime(mapId: string, x, y, w, h, viewerId) {
    if (typeof viewerId === 'string' && viewerId.trim()) {
      this.worldObserverIds.add(viewerId.trim());
    }

    return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
  }

  updateMapTick(mapId: string, body) {
    this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTick(mapId, body);
  }

  updateMapTime(mapId: string, body) {
    const template = this.mapTemplateRepository.getOrThrow(mapId);
    this.runtimeMapConfigService.updateMapTime(mapId, template.source.time ?? {}, body);
  }

  reloadTickConfig() {
    this.contentTemplateRepository.loadAll();
    this.mapTemplateRepository.loadAll();

    const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
    this.runtimeMapConfigService.pruneMapConfigs(validMapIds);

    return { ok: true };
  }

  clearWorldObservation(viewerId) {
    const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
    if (!normalized) {
      return;
    }

    this.worldObserverIds.delete(normalized);
  }

  resetNetworkPerf() {
    this.networkPerfStartedAt = Date.now();
  }

  resetCpuPerf() {
    this.cpuPerfStartedAt = Date.now();
  }

  resetPathfindingPerf() {
    this.pathfindingPerfStartedAt = Date.now();
  }
}
