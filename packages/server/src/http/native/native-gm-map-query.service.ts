/**
 * GM 地图模板查询服务。
 * 提供地图模板列表和配置摘要，供 GM 面板地图管理页使用。
 */
import { Inject, Injectable } from '@nestjs/common';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';

/** 地图模板摘要结构。 */
interface MapTemplateSummaryLike {
  id: string;
  name: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  width: number;
  height: number;
  routeDomain?: string;
  source: {
    description?: string;
    dangerLevel?: unknown;
    recommendedRealm?: unknown;
    monsterSpawns?: unknown[];
  };
  portals: unknown[];
  npcs: unknown[];
}

/** 地图模板仓储端口。 */
interface MapTemplateRepositoryLike {
  list(): MapTemplateSummaryLike[];
}

/** GM 地图模板查询服务：返回地图列表摘要供 GM 面板使用。 */
@Injectable()
export class NativeGmMapQueryService {
  constructor(@Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike) {}

  /** 获取所有地图模板的摘要列表，按 ID 排序。 */
  getMaps() {
    return {
      maps: this.mapTemplateRepository
        .list()
        .map((template) => ({
          id: template.id,
          name: template.name,
          mapGroupId: template.mapGroupId,
          mapGroupName: template.mapGroupName,
          mapGroupOrder: template.mapGroupOrder,
          mapGroupMemberOrder: template.mapGroupMemberOrder,
          width: template.width,
          height: template.height,
          routeDomain: template.routeDomain,
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
