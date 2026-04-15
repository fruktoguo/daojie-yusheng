/**
 * 输入节流 —— 限制玩家操作频率，每 tick 最多一次
 */

import { TICK_INTERVAL } from '@mud/shared';

/** 输入节流，每 tick 最多一次操作 */
export class InputThrottle {
  private lastAction = 0;


  canAct(): boolean {
    return Date.now() - this.lastAction >= TICK_INTERVAL;
  }


  mark() {
    this.lastAction = Date.now();
  }
}

