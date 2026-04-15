import { VIEW_RADIUS } from '@mud/shared-next';
import { getCellSize } from '../../display';
import { CameraController } from '../camera/camera-controller';
import { InteractionController } from '../interaction/interaction-controller';
import { MinimapRuntime } from '../minimap/minimap-runtime';
import { TopdownProjection } from '../projection/topdown-projection';
import { CanvasTextRendererAdapter } from '../renderer/canvas-text-renderer-adapter';
import { MapScene } from '../scene/map-scene';
import { MapStore } from '../store/map-store';
import type {
  MapNextSelfDeltaInput,
  MapNextWorldDeltaInput,
  MapRuntimeApi,
  MapRuntimeInteractionCallbacks,
  MapSafeAreaInsets,
  MapSceneSnapshot,
} from '../types';
import { ViewportController } from '../viewport/viewport-controller';
import { DEFAULT_SAFE_AREA } from '../../constants/world/map-runtime';

/** MapRuntime：封装相关状态与行为。 */
export class MapRuntime implements MapRuntimeApi {
  private readonly store = new MapStore();
  private readonly sceneBuilder = new MapScene();
  private readonly viewport = new ViewportController();
  private readonly camera = new CameraController();
  private readonly projection = new TopdownProjection();
  private readonly renderer = new CanvasTextRendererAdapter();
  private readonly minimap = new MinimapRuntime();
  private readonly interaction = new InteractionController(
    () => this.store.getSnapshot(),
    () => this.camera,
    this.projection,
  );

/** host：定义该变量以承载业务值。 */
  private host: HTMLElement | null = null;
/** currentScene：定义该变量以承载业务值。 */
  private currentScene: MapSceneSnapshot = this.sceneBuilder.build(this.store.getSnapshot());
/** frameHandle：定义该变量以承载业务值。 */
  private frameHandle: number | null = null;
  private lastFrameAt = performance.now();
/** safeArea：定义该变量以承载业务值。 */
  private safeArea: MapSafeAreaInsets = { ...DEFAULT_SAFE_AREA };

/** attach：执行对应的业务逻辑。 */
  attach(host: HTMLElement): void {
    this.host = host;
    this.renderer.mount(host);
/** canvas：定义该变量以承载业务值。 */
    const canvas = this.renderer.getCanvas();
    if (canvas) {
      this.interaction.attach(canvas);
    }
    this.resizeRenderer();
    this.syncViewportDerivedState(true);
    this.ensureFrameLoop();
  }

/** detach：执行对应的业务逻辑。 */
  detach(): void {
    this.stopFrameLoop();
    this.interaction.detach();
    this.renderer.unmount();
    this.host = null;
  }

/** destroy：执行对应的业务逻辑。 */
  destroy(): void {
    this.detach();
    this.renderer.destroy();
    this.minimap.clear();
    this.interaction.destroy();
  }

/** setViewportSize：执行对应的业务逻辑。 */
  setViewportSize(width: number, height: number, dpr: number, viewportScale = 1): void {
    this.viewport.setViewportSize(width, height, dpr, viewportScale);
    this.resizeRenderer();
    this.minimap.resize();
    this.syncViewportDerivedState(true);
  }

/** setSafeArea：执行对应的业务逻辑。 */
  setSafeArea(insets: MapSafeAreaInsets): void {
    this.safeArea = { ...insets };
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.syncViewportDerivedState(true);
  }

/** setZoom：执行对应的业务逻辑。 */
  setZoom(_level: number): void {
    this.syncViewportDerivedState(true);
  }

  setProjection(_mode: 'topdown'): void {}

/** setTickDurationMs：执行对应的业务逻辑。 */
  setTickDurationMs(durationMs: number): void {
    this.store.setTickDurationMs(durationMs);
  }

/** applyBootstrap：执行对应的业务逻辑。 */
  applyBootstrap(data: Parameters<MapRuntimeApi['applyBootstrap']>[0]): void {
    this.store.applyBootstrap(data);
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.camera.snap(data.self.x, data.self.y);
    this.syncViewportDerivedState(true);
  }

/** applyMapStatic：执行对应的业务逻辑。 */
  applyMapStatic(data: Parameters<MapRuntimeApi['applyMapStatic']>[0]): void {
    this.store.applyMapStatic(data);
    this.syncSceneFromStore();
  }

/** applyNextWorldDelta：执行对应的业务逻辑。 */
  applyNextWorldDelta(data: MapNextWorldDeltaInput): void {
    for (const effect of data.effects ?? []) {
      this.renderer.enqueueEffect(effect);
    }
    this.store.applyNextWorldDelta(data);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.store.getSnapshot();
    if (snapshot.player) {
      if (snapshot.entityTransition?.snapCamera) {
        this.camera.snap(snapshot.player.x, snapshot.player.y);
      } else {
        this.camera.follow(snapshot.player.x, snapshot.player.y);
      }
    }
    this.syncViewportDerivedState(false);
  }

/** applyNextSelfDelta：执行对应的业务逻辑。 */
  applyNextSelfDelta(data: MapNextSelfDeltaInput): void {
/** previousMapId：定义该变量以承载业务值。 */
    const previousMapId = this.store.getSnapshot().player?.mapId ?? null;
    this.store.applyNextSelfDelta(data);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.store.getSnapshot();
    if (previousMapId && snapshot.player?.mapId !== previousMapId) {
      this.renderer.resetScene();
    }
    if (snapshot.player) {
      if (snapshot.entityTransition?.snapCamera) {
        this.camera.snap(snapshot.player.x, snapshot.player.y);
      } else {
        this.camera.follow(snapshot.player.x, snapshot.player.y);
      }
    }
    this.syncViewportDerivedState(false);
  }

/** reset：执行对应的业务逻辑。 */
  reset(): void {
    this.store.reset();
    this.camera.reset();
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.renderer.resetScene();
    this.minimap.clear();
    this.currentScene = this.sceneBuilder.build(this.store.getSnapshot());
  }

/** setInteractionCallbacks：执行对应的业务逻辑。 */
  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void {
    this.interaction.setCallbacks(callbacks);
  }

  setMoveHandler(handler: ((x: number, y: number) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

/** setPathCells：执行对应的业务逻辑。 */
  setPathCells(cells: Array<{ x: number; y: number }>): void {
    this.store.setPathCells(cells);
    this.syncSceneFromStore();
  }

/** setTargetingOverlay：执行对应的业务逻辑。 */
  setTargetingOverlay(state: Parameters<MapRuntimeApi['setTargetingOverlay']>[0]): void {
    this.store.setTargetingOverlay(state);
    this.syncSceneFromStore();
  }

/** setSenseQiOverlay：执行对应的业务逻辑。 */
  setSenseQiOverlay(state: Parameters<MapRuntimeApi['setSenseQiOverlay']>[0]): void {
    this.store.setSenseQiOverlay(state);
    this.syncSceneFromStore();
  }

  replaceVisibleEntities(
    entities: Parameters<MapRuntimeApi['replaceVisibleEntities']>[0],
/** transition：定义该变量以承载业务值。 */
    transition: Parameters<MapRuntimeApi['replaceVisibleEntities']>[1] = null,
  ): void {
    this.store.replaceVisibleEntities(entities, transition ?? null);
    this.syncSceneFromStore();
  }

/** getMapMeta：处理当前场景中的对应操作。 */
  getMapMeta() {
    return this.store.getMapMeta();
  }

/** getKnownTileAt：处理当前场景中的对应操作。 */
  getKnownTileAt(x: number, y: number) {
    return this.store.getKnownTileAt(x, y);
  }

/** getVisibleTileAt：处理当前场景中的对应操作。 */
  getVisibleTileAt(x: number, y: number) {
    return this.store.getVisibleTileAt(x, y);
  }

/** getGroundPileAt：处理当前场景中的对应操作。 */
  getGroundPileAt(x: number, y: number) {
    return this.store.getGroundPileAt(x, y);
  }

/** resizeRenderer：执行对应的业务逻辑。 */
  private resizeRenderer(): void {
/** viewport：定义该变量以承载业务值。 */
    const viewport = this.viewport.getSnapshot();
    this.renderer.resize(viewport.cssWidth, viewport.cssHeight, viewport.backbufferWidth, viewport.backbufferHeight);
  }

/** syncViewportDerivedState：执行对应的业务逻辑。 */
  private syncViewportDerivedState(resnapCamera: boolean): void {
    this.viewport.syncDisplayMetrics(this.store.getViewRadius() || VIEW_RADIUS);
    this.camera.setCellSize(getCellSize());
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.store.getSnapshot();
    if (resnapCamera && snapshot.player) {
      this.camera.snap(snapshot.player.x, snapshot.player.y);
    }
    this.syncSceneFromStore();
    this.minimap.resize();
  }

/** syncSceneFromStore：执行对应的业务逻辑。 */
  private syncSceneFromStore(): void {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.store.getSnapshot();
    this.currentScene = this.sceneBuilder.build(snapshot);
    this.renderer.syncScene(
      this.currentScene,
      snapshot.entityTransition,
      snapshot.tickTiming.startedAt,
      snapshot.tickTiming.durationMs,
    );
    this.minimap.update(snapshot);
  }

/** ensureFrameLoop：执行对应的业务逻辑。 */
  private ensureFrameLoop(): void {
    if (this.frameHandle !== null) {
      return;
    }
    this.lastFrameAt = performance.now();
/** frame：通过常量导出可复用函数行为。 */
    const frame = () => {
      this.frameHandle = requestAnimationFrame(frame);
/** now：定义该变量以承载业务值。 */
      const now = performance.now();
/** dt：定义该变量以承载业务值。 */
      const dt = (now - this.lastFrameAt) / 1000;
      this.lastFrameAt = now;
      this.camera.update(dt);
/** timing：定义该变量以承载业务值。 */
      const timing = this.store.getTickTiming();
/** progress：定义该变量以承载业务值。 */
      const progress = timing.durationMs > 0
        ? Math.min((now - timing.startedAt) / timing.durationMs, 1)
        : 1;
      this.renderer.render(this.currentScene, this.camera.getState(), this.projection, progress);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

/** stopFrameLoop：执行对应的业务逻辑。 */
  private stopFrameLoop(): void {
    if (this.frameHandle === null) {
      return;
    }
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }
}

/** createMapRuntime：执行对应的业务逻辑。 */
export function createMapRuntime(): MapRuntimeApi {
  return new MapRuntime();
}
