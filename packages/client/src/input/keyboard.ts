/**
 * 键盘输入处理 —— 监听方向键，转换为移动指令
 */

import { Direction } from '@mud/shared';
import { KEY_TO_DIRECTION_MAP } from '../constants/input/keyboard';

/** 键盘输入，将方向键映射为移动方向并回调 */
export class KeyboardInput {
  private readonly handleKeyDown: (e: KeyboardEvent) => void;

  constructor(private onPath: (dirs: Direction[]) => void) {
    this.handleKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /** 移除事件监听器，释放资源。 */
  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  /** 将方向键按下转为单步移动方向并提交。 */
  private onKeyDown(e: KeyboardEvent) {
    // 忽略输入框内的按键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const dir = KEY_TO_DIRECTION_MAP[e.key];
    if (dir === undefined) return;
    this.onPath([dir]);
  }
}



