import { Minimap } from '../../ui/minimap';
import type { MapStoreSnapshot } from '../types';

/** 小地图 scene.updateScene 所需入参类型。 */
type MinimapSceneInput = Parameters<Minimap['updateScene']>[0];

/** 小地图运行时，负责从快照组装并推送增量给 UI 小地图。 */
export class MinimapRuntime {
  /** 底层小地图实例。 */
  private readonly minimap = new Minimap();  
  /**
 * setMoveHandler：写入MoveHandler。
 * @param handler ((x: number, y: number) => void) | null 参数说明。
 * @returns 无返回值，直接更新MoveHandler相关状态。
 */


  setMoveHandler(handler: ((x: number, y: number) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

  /** 将 map store 的快照适配为小地图输入并触发更新。 */
  update(snapshot: MapStoreSnapshot): void {
    const scene: MinimapSceneInput = snapshot.minimap.mapMeta
      ? {
          mapMeta: snapshot.minimap.mapMeta,
          snapshot: snapshot.minimap.snapshot,
          // 复用 Store 引用，避免每 tick 进行 Map/Set/数组的深拷贝开销。
          rememberedMarkers: snapshot.minimap.rememberedMarkers,
          visibleMarkers: snapshot.minimap.visibleMarkers,
          tileCache: snapshot.minimap.tileCache,
          visibleTiles: snapshot.minimap.visibleTiles,
          visibleEntities: snapshot.minimap.visibleEntities,
          groundPiles: snapshot.minimap.groundPiles,
          player: snapshot.minimap.player,
          viewRadius: snapshot.minimap.viewRadius,
          memoryVersion: snapshot.minimap.memoryVersion,
        }
      : null;
    this.minimap.updateScene(scene);
  }

  /** 同步小地图内部尺寸。 */
  resize(): void {
    this.minimap.resize();
  }

  /** 清理小地图状态。 */
  clear(): void {
    this.minimap.clear();
  }
}



