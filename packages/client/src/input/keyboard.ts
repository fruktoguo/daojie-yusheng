/**
 * 键盘输入处理 —— 监听方向键，转换为移动指令
 */

import { Direction } from '@mud/shared';
import { KEY_TO_DIRECTION_MAP } from '../constants/input/keyboard';

/** 键盘输入，将方向键映射为移动方向并回调 */
export class KeyboardInput {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param onPath (dirs: Direction[]) => void 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(private onPath: (dirs: Direction[]) => void) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  /** 将方向键按下转为单步移动方向并提交。 */
  private onKeyDown(e: KeyboardEvent) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    // 忽略输入框内的按键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const dir = KEY_TO_DIRECTION_MAP[e.key];
    if (dir === undefined) return;
    this.onPath([dir]);
  }
}



