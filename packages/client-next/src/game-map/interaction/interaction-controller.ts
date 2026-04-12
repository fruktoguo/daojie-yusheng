import { getCellSize } from '../../display';
import type { CameraController } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type {
  MapInteractionTarget,
  MapRuntimeInteractionCallbacks,
  MapStoreSnapshot,
} from '../types';

/** SnapshotProvider：定义该类型的结构与数据语义。 */
type SnapshotProvider = () => MapStoreSnapshot;

/** InteractionController：封装相关状态与行为。 */
export class InteractionController {
/** canvas：定义该变量以承载业务值。 */
  private canvas: HTMLCanvasElement | null = null;
/** callbacks：定义该变量以承载业务值。 */
  private callbacks: MapRuntimeInteractionCallbacks = {};

  constructor(
    private readonly getSnapshot: SnapshotProvider,
    private readonly getCamera: () => CameraController,
    private readonly projection: TopdownProjection,
  ) {}

/** attach：执行对应的业务逻辑。 */
  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) {
      return;
    }
    this.detach();
    this.canvas = canvas;
    canvas.addEventListener('click', this.handleClick);
    canvas.addEventListener('mousemove', this.handleMove);
    canvas.addEventListener('mouseleave', this.handleLeave);
  }

/** detach：执行对应的业务逻辑。 */
  detach(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('mousemove', this.handleMove);
    this.canvas.removeEventListener('mouseleave', this.handleLeave);
    this.canvas = null;
  }

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: MapRuntimeInteractionCallbacks): void {
    this.callbacks = callbacks;
  }

/** destroy：执行对应的业务逻辑。 */
  destroy(): void {
    this.detach();
  }

  private readonly handleClick = (event: MouseEvent): void => {
/** target：定义该变量以承载业务值。 */
    const target = this.resolveTarget(event);
    if (target) {
      this.callbacks.onTarget?.(target);
    }
  };

  private readonly handleMove = (event: MouseEvent): void => {
    this.callbacks.onHover?.(this.resolveTarget(event));
  };

  private readonly handleLeave = (): void => {
    this.callbacks.onHover?.(null);
  };

/** resolveTarget：执行对应的业务逻辑。 */
  private resolveTarget(event: MouseEvent): MapInteractionTarget | null {
    if (!this.canvas) {
      return null;
    }

/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.getSnapshot();
/** rect：定义该变量以承载业务值。 */
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

/** screenX：定义该变量以承载业务值。 */
    const screenX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
/** screenY：定义该变量以承载业务值。 */
    const screenY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
/** world：定义该变量以承载业务值。 */
    const world = this.projection.screenToWorld(
      screenX,
      screenY,
      this.getCamera().getState(),
      this.canvas.width,
      this.canvas.height,
    );
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = Math.max(1, getCellSize());
/** x：定义该变量以承载业务值。 */
    const x = Math.floor(world.x / cellSize);
/** y：定义该变量以承载业务值。 */
    const y = Math.floor(world.y / cellSize);
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y}`;
/** tile：定义该变量以承载业务值。 */
    const tile = snapshot.tileCache.get(key) ?? null;
/** entity：定义该变量以承载业务值。 */
    const entity = snapshot.entities.find((entry) => entry.wx === x && entry.wy === y);
/** inMapBounds：定义该变量以承载业务值。 */
    const inMapBounds = snapshot.mapMeta
      ? x >= 0 && x < snapshot.mapMeta.width && y >= 0 && y < snapshot.mapMeta.height
      : false;

    if (!inMapBounds && !tile && !entity) {
      return null;
    }

    return {
      x,
      y,
      entityId: entity?.id,
      entityKind: entity?.kind,
      walkable: tile?.walkable ?? false,
      visible: snapshot.visibleTiles.has(key),
/** known：定义该变量以承载业务值。 */
      known: tile !== null,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }
}

