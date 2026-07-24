/** 玩家专属与妖兽通用移速软衰减边界烟测。 */
import assert from 'node:assert/strict';
import {
  MOVE_SPEED_SOFT_CAP,
  MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  PLAYER_MOVE_SPEED_SOFT_CAP,
  PLAYER_MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  getEffectiveMoveSpeed,
  getEffectivePlayerMoveSpeed,
} from '@mud/shared';

assert.equal(MOVE_SPEED_SOFT_CAP, 500);
assert.equal(MOVE_SPEED_SOFT_CAP_LOG_GAIN, 300);
assert.equal(PLAYER_MOVE_SPEED_SOFT_CAP, 1_000);
assert.equal(PLAYER_MOVE_SPEED_SOFT_CAP_LOG_GAIN, 600);
assert.equal(getEffectivePlayerMoveSpeed(500), 500, '玩家软上限内不得削减移动速度');
assert.equal(getEffectivePlayerMoveSpeed(PLAYER_MOVE_SPEED_SOFT_CAP), PLAYER_MOVE_SPEED_SOFT_CAP);
assert.equal(Math.round(getEffectivePlayerMoveSpeed(300_000)), 5_937, '30 万原始玩家移速应保留约 5937 有效移速');
assert.equal(Math.round(getEffectiveMoveSpeed(300_000)), 3_269, '妖兽等通用移速曲线不得随玩家调整而改变');
assert.equal(
  Math.round(getEffectivePlayerMoveSpeed(PLAYER_MOVE_SPEED_SOFT_CAP * 2) - getEffectivePlayerMoveSpeed(PLAYER_MOVE_SPEED_SOFT_CAP)),
  PLAYER_MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  '玩家软上限后每翻倍只增加固定有效移速，继续约束高端移动成本',
);

console.log(JSON.stringify({
  ok: true,
  case: 'move-speed-scaling',
  playerSoftCap: PLAYER_MOVE_SPEED_SOFT_CAP,
  playerLogGain: PLAYER_MOVE_SPEED_SOFT_CAP_LOG_GAIN,
  playerEffectiveAt300000: Math.round(getEffectivePlayerMoveSpeed(300_000)),
  defaultEffectiveAt300000: Math.round(getEffectiveMoveSpeed(300_000)),
}, null, 2));
