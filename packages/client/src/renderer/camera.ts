/** 摄像机（兼容旧模块），支持延迟后平滑跟随玩家并提供世界/屏幕坐标转换。 */

import { CAMERA_DELAY_SECONDS, CAMERA_SMOOTH_SPEED, PlayerState } from '@mud/shared-next';
import { getCellSize } from '../display';

/** 游戏摄像机状态，使用缓启动 + 指数衰减平滑。 */
export class Camera {
  /** 摄像机世界坐标 X。 */
  x = 0;
  /** 摄像机世界坐标 Y。 */
  y = 0;
  /** 目标坐标 X，用于插值过渡。 */
  private targetX = 0;
  /** 目标坐标 Y，用于插值过渡。 */
  private targetY = 0;
  /** 延迟计时起点。 */
  private divergeTime: number | null = null;

  /** 设置新目标格子并触发延迟平滑。 */
  follow(player: PlayerState) {
    const cellSize = getCellSize();
    this.targetX = (player.x + 0.5) * cellSize;
    this.targetY = (player.y + 0.5) * cellSize;
  }

  /** 每帧推进插值，避免摄像机抖动。 */
  update(dt: number) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 立即对齐到目标，通常用于瞬移/切图场景。 */
  snap(player: PlayerState) {
    const cellSize = getCellSize();
    this.targetX = (player.x + 0.5) * cellSize;
    this.targetY = (player.y + 0.5) * cellSize;
    this.x = this.targetX;
    this.y = this.targetY;
    this.divergeTime = null;
  }

  /** 将世界坐标转换为屏幕像素坐标。 */
  worldToScreen(wx: number, wy: number, screenW: number, screenH: number): {  
  /**
 * sx：sx相关字段。
 */
 sx: number;  
 /**
 * sy：sy相关字段。
 */
 sy: number } {
    return {
      sx: wx - this.x + screenW / 2,
      sy: wy - this.y + screenH / 2,
    };
  }
}



