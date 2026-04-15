import { getCellSize } from '../../display';
import type { CameraController } from '../camera/camera-controller';
import type { TopdownProjection } from '../projection/topdown-projection';
import type {
  MapInteractionTarget,
  MapRuntimeInteractionCallbacks,
  MapStoreSnapshot,
} from '../types';

/** 提供当前地图快照的读取函数。 */
type SnapshotProvider = () => MapStoreSnapshot;

/** 处理地图点击与悬停命中，转换为交互目标坐标。 */
export class InteractionController {
  /** 已绑定事件监听的画布引用。 */
  private canvas: HTMLCanvasElement | null = null;
  /** 交互回调集合。 */
  private callbacks: MapRuntimeInteractionCallbacks = {};

  constructor(
    private readonly getSnapshot: SnapshotProvider,
    private readonly getCamera: () => CameraController,
    private readonly projection: TopdownProjection,
  ) {}

  /** 绑定鼠标事件到画布。 */
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

  /** 解绑鼠标事件，避免内存泄漏。 */
  detach(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('mousemove', this.handleMove);
    this.canvas.removeEventListener('mouseleave', this.handleLeave);
    this.canvas = null;
  }

  /** 替换交互回调。 */
  setCallbacks(callbacks: MapRuntimeInteractionCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 销毁时清理监听。 */
  destroy(): void {
    this.detach();
  }

  private readonly handleClick = (event: MouseEvent): void => {
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

  /** 根据鼠标事件反查地图坐标与命中实体/地块。 */
  private resolveTarget(event: MouseEvent): MapInteractionTarget | null {
    if (!this.canvas) {
      return null;
    }

    const snapshot = this.getSnapshot();
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const screenX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const screenY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
    const world = this.projection.screenToWorld(
      screenX,
      screenY,
      this.getCamera().getState(),
      this.canvas.width,
      this.canvas.height,
    );
    const cellSize = Math.max(1, getCellSize());
    const x = Math.floor(world.x / cellSize);
    const y = Math.floor(world.y / cellSize);
    const key = `${x},${y}`;
    const tile = snapshot.tileCache.get(key) ?? null;
    const entity = snapshot.entities.find((entry) => entry.wx === x && entry.wy === y);
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
      known: tile !== null,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }
}



