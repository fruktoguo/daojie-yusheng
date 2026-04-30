import type { MapSceneSnapshot, MapStoreSnapshot } from '../types';

/** 从 store 快照构建一次性渲染场景快照。 */
export class MapScene {
  /** 提取 terrain/entity/overlay 三类数据，供渲染层消费。 */
  build(snapshot: MapStoreSnapshot): MapSceneSnapshot {
    return {
      mapMeta: snapshot.mapMeta,
      player: snapshot.player,
      terrain: {
        tileCache: snapshot.tileCache,
        visibleTiles: snapshot.visibleTiles,
        visibleTileRevision: snapshot.visibleTileRevision,
        visibleTileTransitionStartedAt: snapshot.visibleTileTransitionStartedAt,
        visibleTileTransitionDurationMs: snapshot.visibleTileTransitionDurationMs,
        time: snapshot.time,
      },
      entities: snapshot.entities,
      groundPiles: snapshot.groundPiles,
      overlays: snapshot.overlays,
    };
  }
}


