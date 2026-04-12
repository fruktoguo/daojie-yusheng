import { Minimap } from '../../ui/minimap';
import type { MapStoreSnapshot } from '../types';

/** MinimapSceneInput：定义该类型的结构与数据语义。 */
type MinimapSceneInput = Parameters<Minimap['updateScene']>[0];

/** MinimapRuntime：封装相关状态与行为。 */
export class MinimapRuntime {
  private readonly minimap = new Minimap();

  setMoveHandler(handler: ((x: number, y: number) => void) | null): void {
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

  clear(): void {
    this.minimap.clear();
  }
}

