/**
 * 摄像机 —— 跟随玩家平滑移动，提供世界坐标到屏幕坐标的转换
 */

import { CAMERA_DELAY_SECONDS, CAMERA_SMOOTH_SPEED, PlayerState } from '@mud/shared-next';
import { getCellSize } from '../display';

/** 游戏摄像机，带延迟启动的平滑追踪 */
export class Camera {
  x = 0;
  y = 0;
  private targetX = 0;
  private targetY = 0;
  private divergeTime: number | null = null;

  /** 设置追踪目标（不立即跳转，等待延迟后平滑移动） */
  follow(player: PlayerState) {
    const cellSize = getCellSize();
    this.targetX = (player.x + 0.5) * cellSize;
    this.targetY = (player.y + 0.5) * cellSize;
  }

  /** 每帧更新，延迟后以指数衰减 lerp 逼近目标 */
  update(dt: number) {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.divergeTime = null;
      return;
    }

    if (this.divergeTime === null) {
      this.divergeTime = performance.now();
    }

    const elapsed = (performance.now() - this.divergeTime) / 1000;
    if (elapsed < CAMERA_DELAY_SECONDS) return;

    const t = 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt);
    this.x += dx * t;
    this.y += dy * t;
    if (Math.abs(this.x - this.targetX) < 0.1) this.x = this.targetX;
    if (Math.abs(this.y - this.targetY) < 0.1) this.y = this.targetY;
  }

  /** 立即跳转到玩家位置，无平滑过渡 */
  snap(player: PlayerState) {
    const cellSize = getCellSize();
    this.targetX = (player.x + 0.5) * cellSize;
    this.targetY = (player.y + 0.5) * cellSize;
    this.x = this.targetX;
    this.y = this.targetY;
    this.divergeTime = null;
  }

  /** 世界像素坐标转屏幕像素坐标 */
  worldToScreen(wx: number, wy: number, screenW: number, screenH: number): { sx: number; sy: number } {
    return {
      sx: wx - this.x + screenW / 2,
      sy: wy - this.y + screenH / 2,
    };
  }
}
