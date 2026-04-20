import { Inject, Injectable } from '@nestjs/common';
import { MapTemplateRepository } from '../../runtime/map/map-template.repository';
/**
 * MapTemplateSummaryLike：定义接口结构约束，明确可交付字段含义。
 */


interface MapTemplateSummaryLike {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * width：width相关字段。
 */

  width: number;  
  /**
 * height：height相关字段。
 */

  height: number;  
  /**
 * source：来源相关字段。
 */

  source: {  
  /**
 * description：description相关字段。
 */

    description?: string;    
    /**
 * dangerLevel：danger等级数值。
 */

    dangerLevel?: unknown;    
    /**
 * recommendedRealm：recommendedRealm相关字段。
 */

    recommendedRealm?: unknown;    
    /**
 * monsterSpawns：怪物Spawn相关字段。
 */

    monsterSpawns?: unknown[];
  };  
  /**
 * portals：portal相关字段。
 */

  portals: unknown[];  
  /**
 * npcs：NPC相关字段。
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
 * @returns 无返回值，完成实例初始化。
 */

  constructor(@Inject(MapTemplateRepository) private readonly mapTemplateRepository: MapTemplateRepositoryLike) {}  
  /**
 * getMaps：读取地图。
 * @returns 无返回值，完成地图的读取/组装。
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
