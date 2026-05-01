import { VIEW_RADIUS } from '@mud/shared';
import { getCellSize } from '../../display';
import { CameraController } from '../camera/camera-controller';
import { InteractionController } from '../interaction/interaction-controller';
import { MinimapRuntime } from '../minimap/minimap-runtime';
import { TopdownProjection } from '../projection/topdown-projection';
import { CanvasTextRendererAdapter } from '../renderer/canvas-text-renderer-adapter';
import { MapScene } from '../scene/map-scene';
import { MapStore } from '../store/map-store';
import type {
  MapSelfDeltaInput,
  MapWorldDeltaInput,
  MapRuntimeApi,
  MapRuntimeInteractionCallbacks,
  MapSafeAreaInsets,
  MapSceneSnapshot,
} from '../types';
import { ViewportController } from '../viewport/viewport-controller';
import { DEFAULT_SAFE_AREA } from '../../constants/world/map-runtime';
import { MAP_TARGET_FPS_RANGE } from '../../constants/ui/performance';

/** 地图运行时编排器，驱动 store、场景、投影、渲染、交互与小地图同步。 */
export class MapRuntime implements MapRuntimeApi {
  /** 全局游戏状态快照与增量计算来源。 */
  private readonly store = new MapStore();
  /** 用快照构建渲染场景。 */
  private readonly sceneBuilder = new MapScene();
  /** 覆盖可见范围、像素比和 backbuffer 的视口状态管理。 */
  private readonly viewport = new ViewportController();
  /** 地图摄像机状态管理。 */
  private readonly camera = new CameraController();
  /** 坐标系转换层，提供世界坐标与屏幕坐标映射。 */
  private readonly projection = new TopdownProjection();
  /** 具体渲染器适配层（当前挂接 TextRenderer）。 */
  private readonly renderer = new CanvasTextRendererAdapter();
  /** 小地图运行时视图。 */
  private readonly minimap = new MinimapRuntime();  
  /**
 * interaction：interaction相关字段。
 */

  private readonly interaction = new InteractionController(
    () => this.store.getSnapshot(),
    () => this.camera,
    this.projection,
  );

  /** 当前挂载 DOM 节点，供解绑时回收。 */
  private host: HTMLElement | null = null;
  /** 当前帧渲染使用的场景快照。 */
  private currentScene: MapSceneSnapshot = this.sceneBuilder.build(this.store.getSnapshot());
  /** requestAnimationFrame 循环句柄。 */
  private frameHandle: number | null = null;
  /** 上一帧时间戳，计算插值推进进度。 */
  private lastFrameAt = performance.now();
  private nextFrameAt = performance.now();
  private targetFps = MAP_TARGET_FPS_RANGE.defaultValue;
  private renderFrameObserver: ((frameAtMs: number) => void) | null = null;
  /** 当前可用安全区域。 */
  private safeArea: MapSafeAreaInsets = { ...DEFAULT_SAFE_AREA };

  constructor() {
    this.minimap.setMemoryDeleteHandler((mapIds) => {
      this.store.handleRememberedMapsDeleted(mapIds);
      this.syncSceneFromStore();
    });
  }

  /** 初始化运行时挂载，接入交互监听并启动渲染循环。 */
  attach(host: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 停止渲染并断开交互、画布引用。 */
  detach(): void {
    this.stopFrameLoop();
    this.interaction.detach();
    this.renderer.unmount();
    this.host = null;
  }

  /** 销毁所有子系统状态。 */
  destroy(): void {
    this.detach();
    this.renderer.destroy();
    this.minimap.clear();
    this.interaction.destroy();
  }

  /** 注入渲染帧观察者，用于把真实渲染节拍回传给外层监控。 */
  setRenderFrameObserver(observer: ((frameAtMs: number) => void) | null): void {
    this.renderFrameObserver = observer;
  }

  /** 设置地图渲染循环的目标 FPS 上限。 */
  setTargetFps(targetFps: number): void {
    this.targetFps = Number.isFinite(targetFps)
      ? Math.max(MAP_TARGET_FPS_RANGE.min, Math.min(MAP_TARGET_FPS_RANGE.max, Math.round(targetFps)))
      : MAP_TARGET_FPS_RANGE.defaultValue;
    this.nextFrameAt = performance.now();
  }

  /** 同步容器尺寸与 DPI，触发画布与小地图重排。 */
  setViewportSize(width: number, height: number, dpr: number, viewportScale = 1): void {
    this.viewport.setViewportSize(width, height, dpr, viewportScale);
    this.resizeRenderer();
    this.minimap.resize();
    this.syncViewportDerivedState(true);
  }

  /** 更新安全区域并将其传递给视口与摄像机。 */
  setSafeArea(insets: MapSafeAreaInsets): void {
    this.safeArea = { ...insets };
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.syncViewportDerivedState(true);
  }

  /** 兼容旧接口：缩放变化时重算视口派生状态。 */
  setZoom(_level: number): void {
    this.syncViewportDerivedState(true);
  }

  /** 当前仅支持 topdown 投影，保留协议位兼容。 */
  setProjection(_mode: 'topdown'): void {}

  /** 透传 tick 周期，用于本地插值时长控制。 */
  setTickDurationMs(durationMs: number): void {
    this.store.setTickDurationMs(durationMs);
  }

  /** 收到首次入场数据后初始化 store 并重置摄像机。 */
  applyBootstrap(data: Parameters<MapRuntimeApi['applyBootstrap']>[0]): void {
    this.store.applyBootstrap(data);
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.camera.snap(data.self.x, data.self.y);
    this.syncViewportDerivedState(true);
  }

  /** 应用地图静态增量并重建渲染场景。 */
  applyMapStatic(data: Parameters<MapRuntimeApi['applyMapStatic']>[0]): void {
    this.store.applyMapStatic(data);
    this.syncSceneFromStore();
  }

  /** 消化世界级增量（实体、地块、效果）并更新场景与镜头。 */
  applyWorldDelta(data: MapWorldDeltaInput): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const effect of data.effects ?? []) {
      this.renderer.enqueueEffect(effect);
    }
    this.store.applyWorldDelta(data);
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

  /** 消化本体增量（移动、生命、地图切换）并同步场景。 */
  applySelfDelta(data: MapSelfDeltaInput): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const previousMapId = this.store.getSnapshot().player?.mapId ?? null;
    this.store.applySelfDelta(data);
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

  /** 重置运行时状态以支持新会话重连或切图。 */
  reset(): void {
    this.store.reset();
    this.camera.reset();
    this.viewport.setSafeArea(this.safeArea);
    this.camera.setSafeArea(this.safeArea);
    this.renderer.resetScene();
    this.minimap.clear();
    this.currentScene = this.sceneBuilder.build(this.store.getSnapshot());
  }

  /** 透传交互回调给 InteractionController。 */
  setInteractionCallbacks(callbacks: MapRuntimeInteractionCallbacks): void {
    this.interaction.setCallbacks(callbacks);
  }  
  /**
 * setMoveHandler：写入MoveHandler。
 * @param handler ((x: number, y: number) => void) | null 参数说明。
 * @returns 无返回值，直接更新MoveHandler相关状态。
 */


  setMoveHandler(handler: ((x: number, y: number) => void) | null): void {
    this.minimap.setMoveHandler(handler);
  }

  /** 覆盖路径高亮并刷新渲染场景。 */
  setPathCells(cells: Array<{  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }>): void {
    this.store.setPathCells(cells);
    this.syncSceneFromStore();
  }

  /** 设置瞄准叠加层并刷新场景。 */
  setTargetingOverlay(state: Parameters<MapRuntimeApi['setTargetingOverlay']>[0]): void {
    this.store.setTargetingOverlay(state);
    this.syncSceneFromStore();
  }

  /** 设置阵法范围叠加层并刷新场景。 */
  setFormationRangeOverlay(state: Parameters<MapRuntimeApi['setFormationRangeOverlay']>[0]): void {
    this.store.setFormationRangeOverlay(state);
    this.syncSceneFromStore();
  }

  /** 设置感气叠加层并刷新场景。 */
  setSenseQiOverlay(state: Parameters<MapRuntimeApi['setSenseQiOverlay']>[0]): void {
    this.store.setSenseQiOverlay(state);
    this.syncSceneFromStore();
  }  
  /**
 * replaceVisibleEntities：判断可见Entity是否满足条件。
 * @param entities Parameters<MapRuntimeApi['replaceVisibleEntities']>[0] 参数说明。
 * @param transition Parameters<MapRuntimeApi['replaceVisibleEntities']>[1] 参数说明。
 * @returns 无返回值，直接更新可见Entity相关状态。
 */


  replaceVisibleEntities(
    entities: Parameters<MapRuntimeApi['replaceVisibleEntities']>[0],
    transition: Parameters<MapRuntimeApi['replaceVisibleEntities']>[1] = null,
  ): void {
    this.store.replaceVisibleEntities(entities, transition ?? null);
    this.syncSceneFromStore();
  }

  /** 获取当前地图元数据快照。 */
  getMapMeta() {
    return this.store.getMapMeta();
  }

  /** 获取指定坐标的已知地块。 */
  getKnownTileAt(x: number, y: number) {
    return this.store.getKnownTileAt(x, y);
  }

  /** 获取当前视野内可见地块。 */
  getVisibleTileAt(x: number, y: number) {
    return this.store.getVisibleTileAt(x, y);
  }

  /** 获取坐标处的地面物品堆。 */
  getGroundPileAt(x: number, y: number) {
    return this.store.getGroundPileAt(x, y);
  }

  /** 按视口快照同步主画布尺寸。 */
  private resizeRenderer(): void {
    const viewport = this.viewport.getSnapshot();
    this.renderer.resize(viewport.cssWidth, viewport.cssHeight, viewport.backbufferWidth, viewport.backbufferHeight);
  }

  /** 重新同步视口参数并重建场景快照。 */
  private syncViewportDerivedState(resnapCamera: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.viewport.syncDisplayMetrics(this.store.getViewRadius() || VIEW_RADIUS);
    this.camera.setCellSize(getCellSize());
    const snapshot = this.store.getSnapshot();
    if (resnapCamera && snapshot.player) {
      this.camera.snap(snapshot.player.x, snapshot.player.y);
    }
    this.syncSceneFromStore();
    this.minimap.resize();
  }

  /** 从 Store 构建最新场景并推送到渲染器与小地图。 */
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

  /** 启动浏览器 rAF 帧循环并驱动插值渲染。 */
  private ensureFrameLoop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.frameHandle !== null) {
      return;
    }
    this.lastFrameAt = performance.now();
    this.nextFrameAt = this.lastFrameAt;
    const frame = () => {
      this.frameHandle = requestAnimationFrame(frame);
      const now = performance.now();
      const minFrameIntervalMs = 1000 / Math.max(MAP_TARGET_FPS_RANGE.min, this.targetFps);
      if (now < this.nextFrameAt) {
        return;
      }
      const dt = (now - this.lastFrameAt) / 1000;
      this.lastFrameAt = now;
      this.nextFrameAt += minFrameIntervalMs;
      while (this.nextFrameAt <= now) {
        this.nextFrameAt += minFrameIntervalMs;
      }
      this.camera.update(dt);
      const timing = this.store.getTickTiming();
      const progress = timing.durationMs > 0
        ? Math.min((now - timing.startedAt) / timing.durationMs, 1)
        : 1;
      this.renderer.render(this.currentScene, this.camera.getState(), this.projection, progress);
      this.renderFrameObserver?.(now);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  /** 停止帧循环。 */
  private stopFrameLoop(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.frameHandle === null) {
      return;
    }
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }
}

/** 创建地图运行时实例。 */
export function createMapRuntime(): MapRuntimeApi {
  return new MapRuntime();
}
