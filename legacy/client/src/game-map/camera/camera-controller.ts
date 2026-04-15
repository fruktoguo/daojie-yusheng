import { CAMERA_DELAY_SECONDS, CAMERA_SMOOTH_SPEED } from '@mud/shared';
import type { MapSafeAreaInsets } from '../types';

export interface CameraState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  offsetX: number;
  offsetY: number;
}

export class CameraController {
  private state: CameraState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  private cellSize = 1;
  private divergeTime: number | null = null;

/** setCellSize：设置并同步相关状态。 */
  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(1, cellSize);
  }

/** setSafeArea：设置并同步相关状态。 */
  setSafeArea(insets: MapSafeAreaInsets): void {
    this.state.offsetX = (insets.left - insets.right) / 2;
    this.state.offsetY = (insets.top - insets.bottom) / 2;
  }


  follow(x: number, y: number): void {
    this.state.targetX = (x + 0.5) * this.cellSize;
    this.state.targetY = (y + 0.5) * this.cellSize;
  }


  snap(x: number, y: number): void {
    this.follow(x, y);
    this.state.x = this.state.targetX;
    this.state.y = this.state.targetY;
    this.divergeTime = null;
  }

  update(dt: number): void {
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

/** reset：重置为初始状态。 */
  reset(): void {
    this.state.x = 0;
    this.state.y = 0;
    this.state.targetX = 0;
    this.state.targetY = 0;
    this.divergeTime = null;
  }

  getState(): CameraState {
    return this.state;
  }
}

