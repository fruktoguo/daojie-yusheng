import { CAMERA_DELAY_SECONDS, CAMERA_SMOOTH_SPEED } from '@mud/shared-next';
import type { MapSafeAreaInsets } from '../types';

/** 摄像机状态快照。 */
export interface CameraState {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * targetX：目标X相关字段。
 */

  targetX: number;  
  /**
 * targetY：目标Y相关字段。
 */

  targetY: number;  
  /**
 * offsetX：offsetX相关字段。
 */

  offsetX: number;  
  /**
 * offsetY：offsetY相关字段。
 */

  offsetY: number;
}

/** 摄像机控制器，负责平滑跟随与偏移。 */
export class CameraController {
/**
 * state：状态状态或数据块。
 */

  private state: CameraState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  /** 世界绘制时当前格子像素尺寸。 */
  private cellSize = 1;
  /** 延迟跟随起始时间。 */
  private divergeTime: number | null = null;

  /** 更新格子像素尺寸（从配置变化时透传）。 */
  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(1, cellSize);
  }

  /** 同步安全区域偏移，修正 HUD/视口可用区域。 */
  setSafeArea(insets: MapSafeAreaInsets): void {
    this.state.offsetX = (insets.left - insets.right) / 2;
    this.state.offsetY = (insets.top - insets.bottom) / 2;
  }

  /** 设置新的追踪目标（先缓慢靠拢）。 */
  follow(x: number, y: number): void {
    this.state.targetX = (x + 0.5) * this.cellSize;
    this.state.targetY = (y + 0.5) * this.cellSize;
  }

  /** 立即对齐到目标位置（不做平滑过渡）。 */
  snap(x: number, y: number): void {
    this.follow(x, y);
    this.state.x = this.state.targetX;
    this.state.y = this.state.targetY;
    this.divergeTime = null;
  }

  /** 逐帧推进摄像机位置。 */
  update(dt: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const dx = this.state.targetX - this.state.x;
    const dy = this.state.targetY - this.state.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      this.state.x = this.state.targetX;
      this.state.y = this.state.targetY;
      this.divergeTime = null;
      return;
    }

    if (this.divergeTime === null) {
      this.divergeTime = performance.now();
    }

    const elapsed = (performance.now() - this.divergeTime) / 1000;
    if (elapsed < CAMERA_DELAY_SECONDS) {
      return;
    }

    const t = 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt);
    this.state.x += dx * t;
    this.state.y += dy * t;
  }

  /** 重置摄像机到初始状态。 */
  reset(): void {
    this.state.x = 0;
    this.state.y = 0;
    this.state.targetX = 0;
    this.state.targetY = 0;
    this.divergeTime = null;
  }

  /** 输出当前摄像机状态用于投影层。 */
  getState(): CameraState {
    return this.state;
  }
}



