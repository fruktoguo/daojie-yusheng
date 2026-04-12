import { VIEW_RADIUS } from '@mud/shared';
import { getCellSize } from '../../display';
import { CameraController } from '../camera/camera-controller';
import { InteractionController } from '../interaction/interaction-controller';
import { MinimapRuntime } from '../minimap/minimap-runtime';
import { TopdownProjection } from '../projection/topdown-projection';
import { LegacyCanvasTextRendererAdapter } from '../renderer/legacy-canvas-text-renderer-adapter';
import { MapScene } from '../scene/map-scene';
import { MapStore } from '../store/map-store';
import type {
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
  private readonly renderer = new LegacyCanvasTextRendererAdapter();
  private readonly minimap = new MinimapRuntime();
  private readonly interaction = new InteractionController(
    () => this.store.getSnapshot(),
    () => this.camera,
    this.projection,
  );

  private host: HTMLElement | null = null;
  private currentScene: MapSceneSnapshot = this.sceneBuilder.build(this.store.getSnapshot());
  private frameHandle: number | null = null;
  private lastFrameAt = performance.now();

  attach(host: HTMLElement): void {
    this.host = host;
    this.renderer.mount(host);
    const canvas = this.renderer.getCanvas();
    if (canvas) {
      this.interaction.attach(canvas);
    }
    this.resizeRenderer();
    this.syncViewportDerivedState(true);
    this.ensureFrameLoop();
  }

  detach(): void {
    this.stopFrameLoop();
    this.interaction.detach();
    this.renderer.unmount();
    this.host = null;
  }

  destroy(): void {
    this.detach();
    this.renderer.destroy();
    this.minimap.clear();
    this.interaction.destroy();
  }

  setViewportSize(width: number, height: number, dpr: number, viewportScale = 1): void {
    this.viewport.setViewportSize(width, height, dpr, viewportScale);
    this.resizeRenderer();
    this.minimap.resize();
    this.syncViewportDerivedState(true);
  }

  setSafeArea(insets: MapSafeAreaInsets): void {
    this.viewport.setSafeArea(insets);
    this.camera.setSafeArea(insets);
    this.syncViewportDerivedState(true);
  }

  setZoom(_level: number): void {
    this.syncViewportDerivedState(true);
  }

  setProjection(_mode: 'topdown'): void {}

  applyInit(data: Parameters<MapRuntimeApi['applyInit']>[0]): void {
    this.store.applyInit(data);
    this.camera.setSafeArea(DEFAULT_SAFE_AREA);
    this.camera.snap(data.self.x, data.self.y);
    this.syncViewportDerivedState(true);
  }

  applyMapStaticSync(data: Parameters<MapRuntimeApi['applyMapStaticSync']>[0]): void {
    this.store.applyMapStaticSync(data);
    this.syncSceneFromStore();
  }

  applyTick(data: Parameters<MapRuntimeApi['applyTick']>[0]): void {
    const previousMapId = this.store.getSnapshot().player?.mapId ?? null;
    for (const effect of data.fx ?? []) {
      this.renderer.enqueueEffect(effect);
    }
    this.store.applyTick(data);
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

  reset(): void {
    this.store.reset();
    this.camera.reset();
    this.renderer.resetScene();
    this.minimap.clear();
    this.currentScene = this.sceneBuilder.build(this.store.getSnapshot());
  }

  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void {
    this.interaction.setCallbacks(callbacks);
  }

  setMoveHandler(handler: ((target: { mapId: string; x: number; y: number; isCurrentMap: boolean }) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

  setPathCells(cells: Array<{ x: number; y: number }>): void {
    this.store.setPathCells(cells);
    this.syncSceneFromStore();
  }

  setTargetingOverlay(state: Parameters<MapRuntimeApi['setTargetingOverlay']>[0]): void {
    this.store.setTargetingOverlay(state);
    this.syncSceneFromStore();
  }

  setSenseQiOverlay(state: Parameters<MapRuntimeApi['setSenseQiOverlay']>[0]): void {
    this.store.setSenseQiOverlay(state);
    this.syncSceneFromStore();
  }

  replaceVisibleEntities(
    entities: Parameters<MapRuntimeApi['replaceVisibleEntities']>[0],
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

  private resizeRenderer(): void {
    const viewport = this.viewport.getSnapshot();
    this.renderer.resize(viewport.cssWidth, viewport.cssHeight, viewport.backbufferWidth, viewport.backbufferHeight);
  }

  private syncViewportDerivedState(resnapCamera: boolean): void {
    this.viewport.syncDisplayMetrics(this.store.getViewRadius() || VIEW_RADIUS);
    this.camera.setCellSize(getCellSize());
    const snapshot = this.store.getSnapshot();
    if (resnapCamera && snapshot.player) {
      this.camera.snap(snapshot.player.x, snapshot.player.y);
    }
    this.syncSceneFromStore();
    this.minimap.resize();
  }

  private syncSceneFromStore(): void {
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

  private ensureFrameLoop(): void {
    if (this.frameHandle !== null) {
      return;
    }
    this.lastFrameAt = performance.now();
/** frame：通过常量导出可复用函数行为。 */
    const frame = () => {
      this.frameHandle = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = (now - this.lastFrameAt) / 1000;
      this.lastFrameAt = now;
      this.camera.update(dt);
      const timing = this.store.getTickTiming();
      const progress = timing.durationMs > 0
        ? Math.min((now - timing.startedAt) / timing.durationMs, 1)
        : 1;
      this.renderer.render(this.currentScene, this.camera.getState(), this.projection, progress);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

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

