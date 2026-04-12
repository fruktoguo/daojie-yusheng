import { Minimap } from '../../ui/minimap';
import type { MapStoreSnapshot } from '../types';

/** MinimapSceneInput：定义该类型的结构与数据语义。 */
type MinimapSceneInput = Parameters<Minimap['updateScene']>[0];

/** MinimapRuntime：封装相关状态与行为。 */
export class MinimapRuntime {
  private readonly minimap = new Minimap();

  setMoveHandler(handler: ((target: { mapId: string; x: number; y: number; isCurrentMap: boolean }) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

/** update：执行对应的业务逻辑。 */
  update(snapshot: MapStoreSnapshot): void {
/** scene：定义该变量以承载业务值。 */
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

/** resize：执行对应的业务逻辑。 */
  resize(): void {
    this.minimap.resize();
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.minimap.clear();
  }
}

