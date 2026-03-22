import type { MapSafeAreaInsets } from '../types';

const SMOOTH_SPEED = 8;
const CAMERA_DELAY = 1.0;

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

  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(1, cellSize);
  }

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
    if (elapsed < CAMERA_DELAY) {
      return;
    }

    const t = 1 - Math.exp(-SMOOTH_SPEED * dt);
    this.state.x += dx * t;
    this.state.y += dy * t;
  }

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
