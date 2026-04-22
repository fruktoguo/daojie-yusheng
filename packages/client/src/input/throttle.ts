/**
 * 输入节流 —— 限制玩家操作频率，每 tick 最多一次
 */

import { TICK_INTERVAL } from '@mud/shared';

/**
 * 输入频率节流器。
 * 任何客户端输入都会先经过这里，保证每个服务端节拍周期内最多触发一次操作。
 */
export class InputThrottle {
  /** 上一次提交操作的时间戳（ms），用于和当前时间比较。 */
  private lastAction = 0;

  /** 当前时间是否已超过一个 tick 间隔，可执行新的输入。 */
  canAct(): boolean {
    return Date.now() - this.lastAction >= TICK_INTERVAL;
  }

  /** 记录当前时间作为最近一次已提交动作时间。 */
  mark() {
    this.lastAction = Date.now();
  }
}



