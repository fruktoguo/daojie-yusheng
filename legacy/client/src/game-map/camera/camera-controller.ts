import { CAMERA_DELAY_SECONDS, CAMERA_SMOOTH_SPEED } from '@mud/shared';
import type { MapSafeAreaInsets } from '../types';

/** CameraState：定义该接口的能力与字段约束。 */
export interface CameraState {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** targetX：定义该变量以承载业务值。 */
  targetX: number;
/** targetY：定义该变量以承载业务值。 */
  targetY: number;
/** offsetX：定义该变量以承载业务值。 */
  offsetX: number;
/** offsetY：定义该变量以承载业务值。 */
  offsetY: number;
}

/** CameraController：封装相关状态与行为。 */
export class CameraController {
/** state：定义该变量以承载业务值。 */
  private state: CameraState = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  private cellSize = 1;
/** divergeTime：定义该变量以承载业务值。 */
  private divergeTime: number | null = null;

/** setCellSize：执行对应的业务逻辑。 */
  setCellSize(cellSize: number): void {
    this.cellSize = Math.max(1, cellSize);
  }

/** setSafeArea：执行对应的业务逻辑。 */
  setSafeArea(insets: MapSafeAreaInsets): void {
    this.state.offsetX = (insets.left - insets.right) / 2;
    this.state.offsetY = (insets.top - insets.bottom) / 2;
  }

/** follow：执行对应的业务逻辑。 */
  follow(x: number, y: number): void {
    this.state.targetX = (x + 0.5) * this.cellSize;
    this.state.targetY = (y + 0.5) * this.cellSize;
  }

/** snap：执行对应的业务逻辑。 */
  snap(x: number, y: number): void {
    this.follow(x, y);
    this.state.x = this.state.targetX;
    this.state.y = this.state.targetY;
    this.divergeTime = null;
  }

/** update：执行对应的业务逻辑。 */
  update(dt: number): void {
/** dx：定义该变量以承载业务值。 */
    const dx = this.state.targetX - this.state.x;
/** dy：定义该变量以承载业务值。 */
    const dy = this.state.targetY - this.state.y;
/** dist：定义该变量以承载业务值。 */
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

/** elapsed：定义该变量以承载业务值。 */
    const elapsed = (performance.now() - this.divergeTime) / 1000;
    if (elapsed < CAMERA_DELAY_SECONDS) {
      return;
    }

/** t：定义该变量以承载业务值。 */
    const t = 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt);
    this.state.x += dx * t;
    this.state.y += dy * t;
  }

/** reset：执行对应的业务逻辑。 */
  reset(): void {
    this.state.x = 0;
    this.state.y = 0;
    this.state.targetX = 0;
    this.state.targetY = 0;
    this.divergeTime = null;
  }

/** getState：执行对应的业务逻辑。 */
  getState(): CameraState {
    return this.state;
  }
}

