import type { MapSceneSnapshot, MapStoreSnapshot } from '../types';

/** MapScene：封装相关状态与行为。 */
export class MapScene {
/** build：执行对应的业务逻辑。 */
  build(snapshot: MapStoreSnapshot): MapSceneSnapshot {
    return {
      mapMeta: snapshot.mapMeta,
      player: snapshot.player,
      terrain: {
        tileCache: snapshot.tileCache,
        visibleTiles: snapshot.visibleTiles,
        visibleTileRevision: snapshot.visibleTileRevision,
        time: snapshot.time,
      },
      entities: snapshot.entities,
      groundPiles: snapshot.groundPiles,
      overlays: snapshot.overlays,
    };
  }
}

