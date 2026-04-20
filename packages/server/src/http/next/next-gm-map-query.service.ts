import { Inject, Injectable } from '@nestjs/common';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
/**
 * MapTemplateSummaryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateSummaryLike {
/**
 * id：MapTemplateSummaryLike 内部字段。
 */

  id: string;  
  /**
 * name：MapTemplateSummaryLike 内部字段。
 */

  name: string;  
  /**
 * width：MapTemplateSummaryLike 内部字段。
 */

  width: number;  
  /**
 * height：MapTemplateSummaryLike 内部字段。
 */

  height: number;  
  /**
 * source：MapTemplateSummaryLike 内部字段。
 */

  source: {  
  /**
 * description：MapTemplateSummaryLike 内部字段。
 */

    description?: string;    
    /**
 * dangerLevel：MapTemplateSummaryLike 内部字段。
 */

    dangerLevel?: unknown;    
    /**
 * recommendedRealm：MapTemplateSummaryLike 内部字段。
 */

    recommendedRealm?: unknown;    
    /**
 * monsterSpawns：MapTemplateSummaryLike 内部字段。
 */

    monsterSpawns?: unknown[];
  };  
  /**
 * portals：MapTemplateSummaryLike 内部字段。
 */

  portals: unknown[];  
  /**
 * npcs：MapTemplateSummaryLike 内部字段。
 */

  npcs: unknown[];
}
/**
 * MapTemplateRepositoryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateRepositoryLike {
  list(): MapTemplateSummaryLike[];
}
/**
 * NextGmMapQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextGmMapQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param mapTemplateRepository MapTemplateRepositoryLike 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(@Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike) {}  
  /**
 * getMaps：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */


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
