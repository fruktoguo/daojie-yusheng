import { Inject, Injectable } from '@nestjs/common';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';

interface MapTemplateSummaryLike {
  id: string;
  name: string;
  width: number;
  height: number;
  source: {
    description?: string;
    dangerLevel?: unknown;
    recommendedRealm?: unknown;
    monsterSpawns?: unknown[];
  };
  portals: unknown[];
  npcs: unknown[];
}

interface MapTemplateRepositoryLike {
  list(): MapTemplateSummaryLike[];
}

@Injectable()
export class NextGmMapQueryService {
  constructor(@Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike) {}

  getMaps() {
    return {
      maps: this.mapTemplateRepository
        .list()
        .map((template) => ({
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
        }))
        .sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN')),
    };
  }
}
