"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextGmWorldService = void 0;

const common_1 = require("@nestjs/common");

const content_template_repository_1 = require("../../content/content-template.repository");

const map_template_repository_1 = require("../../runtime/map/map-template.repository");

const runtime_map_config_service_1 = require("../../runtime/map/runtime-map-config.service");

const runtime_gm_state_service_1 = require("../../runtime/gm/runtime-gm-state.service");

const suggestion_runtime_service_1 = require("../../runtime/suggestion/suggestion-runtime.service");

const next_gm_state_query_service_1 = require("./next-gm-state-query.service");

const next_gm_editor_query_service_1 = require("./next-gm-editor-query.service");

const next_gm_map_query_service_1 = require("./next-gm-map-query.service");

const next_gm_map_runtime_query_service_1 = require("./next-gm-map-runtime-query.service");

const next_gm_suggestion_query_service_1 = require("./next-gm-suggestion-query.service");

let NextGmWorldService = class NextGmWorldService {
    contentTemplateRepository;
    runtimeGmStateService;
    mapTemplateRepository;
    suggestionRuntimeService;
    runtimeMapConfigService;
    nextGmStateQueryService;
    nextGmEditorQueryService;
    nextGmMapQueryService;
    nextGmMapRuntimeQueryService;
    nextGmSuggestionQueryService;
    networkPerfStartedAt = Date.now();
    cpuPerfStartedAt = Date.now();
    pathfindingPerfStartedAt = Date.now();
    worldObserverIds = new Set();
    constructor(contentTemplateRepository, runtimeGmStateService, mapTemplateRepository, suggestionRuntimeService, runtimeMapConfigService, nextGmStateQueryService, nextGmEditorQueryService, nextGmMapQueryService, nextGmMapRuntimeQueryService, nextGmSuggestionQueryService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.runtimeGmStateService = runtimeGmStateService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.runtimeMapConfigService = runtimeMapConfigService;
        this.nextGmStateQueryService = nextGmStateQueryService;
        this.nextGmEditorQueryService = nextGmEditorQueryService;
        this.nextGmMapQueryService = nextGmMapQueryService;
        this.nextGmMapRuntimeQueryService = nextGmMapRuntimeQueryService;
        this.nextGmSuggestionQueryService = nextGmSuggestionQueryService;
    }
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
    async completeSuggestion(id) {

        const updated = await this.suggestionRuntimeService.markCompleted(id);
        if (!updated) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    async replySuggestion(id, body) {

        const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
        if (!updated) {
            throw new common_1.BadRequestException('回复失败');
        }
        return { ok: true };
    }
    async removeSuggestion(id) {

        const removed = await this.suggestionRuntimeService.remove(id);
        if (!removed) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    getMaps() {
        return this.nextGmMapQueryService.getMaps();
    }
    getMapRuntime(mapId, x, y, w, h, viewerId) {
        if (typeof viewerId === 'string' && viewerId.trim()) {
            this.worldObserverIds.add(viewerId.trim());
        }
        return this.nextGmMapRuntimeQueryService.getMapRuntime(mapId, x, y, w, h);
    }
    updateMapTick(mapId, body) {
        this.mapTemplateRepository.getOrThrow(mapId);
        this.runtimeMapConfigService.updateMapTick(mapId, body);
    }
    updateMapTime(mapId, body) {

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
};
exports.NextGmWorldService = NextGmWorldService;
exports.NextGmWorldService = NextGmWorldService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        runtime_gm_state_service_1.RuntimeGmStateService,
        map_template_repository_1.MapTemplateRepository,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        runtime_map_config_service_1.RuntimeMapConfigService,
        next_gm_state_query_service_1.NextGmStateQueryService,
        next_gm_editor_query_service_1.NextGmEditorQueryService,
        next_gm_map_query_service_1.NextGmMapQueryService,
        next_gm_map_runtime_query_service_1.NextGmMapRuntimeQueryService,
        next_gm_suggestion_query_service_1.NextGmSuggestionQueryService])
], NextGmWorldService);
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
