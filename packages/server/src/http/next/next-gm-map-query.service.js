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
exports.NextGmMapQueryService = void 0;
const common_1 = require("@nestjs/common");
const map_template_repository_1 = require("../../runtime/map/map-template.repository");
let NextGmMapQueryService = class NextGmMapQueryService {
    mapTemplateRepository;
    constructor(mapTemplateRepository) {
        this.mapTemplateRepository = mapTemplateRepository;
    }
    getMaps() {
        return {
            maps: this.mapTemplateRepository.list().map((template) => ({
                id: template.id,
                name: template.name,
                width: template.width,
                height: template.height,
                description: template.source.description,
                dangerLevel: template.source.dangerLevel,
                recommendedRealm: template.source.recommendedRealm,
                portalCount: template.portals.length,
                npcCount: template.npcs.length,
                monsterSpawnCount: template.source.monsterSpawns?.length ?? 0,
            })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN')),
        };
    }
};
exports.NextGmMapQueryService = NextGmMapQueryService;
exports.NextGmMapQueryService = NextGmMapQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [map_template_repository_1.MapTemplateRepository])
], NextGmMapQueryService);
