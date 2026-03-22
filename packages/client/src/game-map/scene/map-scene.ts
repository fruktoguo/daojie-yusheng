import type { MapSceneSnapshot, MapStoreSnapshot } from '../types';

export class MapScene {
  build(snapshot: MapStoreSnapshot): MapSceneSnapshot {
    return {
      mapMeta: snapshot.mapMeta,
      player: snapshot.player,
      terrain: {
        tileCache: snapshot.tileCache,
        visibleTiles: snapshot.visibleTiles,
        time: snapshot.time,
      },
      entities: snapshot.entities,
      groundPiles: snapshot.groundPiles,
      overlays: snapshot.overlays,
    };
  }
}
