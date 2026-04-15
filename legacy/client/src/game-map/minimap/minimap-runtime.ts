import { Minimap } from '../../ui/minimap';
import type { MapStoreSnapshot } from '../types';

type MinimapSceneInput = Parameters<Minimap['updateScene']>[0];

export class MinimapRuntime {
  private readonly minimap = new Minimap();

  setMoveHandler(handler: ((target: { mapId: string; x: number; y: number; isCurrentMap: boolean }) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

  update(snapshot: MapStoreSnapshot): void {
    const scene: MinimapSceneInput = snapshot.minimap.mapMeta
      ? {
          mapMeta: snapshot.minimap.mapMeta,
          snapshot: snapshot.minimap.snapshot,
          // Reuse references from MapStore snapshot to avoid per-tick Map/Set/array cloning.
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


  resize(): void {
    this.minimap.resize();
  }

/** clear：清理并清空临时数据。 */
  clear(): void {
    this.minimap.clear();
  }
}

