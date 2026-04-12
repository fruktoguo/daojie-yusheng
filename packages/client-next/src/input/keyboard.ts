/**
 * 键盘输入处理 —— 监听方向键，转换为移动指令
 */

import { Direction } from '@mud/shared-next';
import { KEY_TO_DIRECTION_MAP } from '../constants/input/keyboard';

/** 键盘输入，将方向键映射为移动方向并回调 */
export class KeyboardInput {
  constructor(private onPath: (dirs: Direction[]) => void) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

/** onKeyDown：处理当前场景中的对应操作。 */
  private onKeyDown(e: KeyboardEvent) {
    // 忽略输入框内的按键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const dir = KEY_TO_DIRECTION_MAP[e.key];
    if (dir === undefined) return;
    this.onPath([dir]);
  }
}

