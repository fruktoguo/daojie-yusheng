/**
 * 推进一次已完成渲染后的目标帧时间。
 *
 * 后台标签页恢复时，`now` 可能已经跨过数十万帧；这里按区间数一次跳过，
 * 避免用逐帧 `while` 追赶阻塞主线程。
 */
export function advanceFrameDeadlineAfterRender(
  currentDeadlineMs: number,
  nowMs: number,
  frameIntervalMs: number,
): number {
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const safeInterval = Number.isFinite(frameIntervalMs) && frameIntervalMs > 0
    ? frameIntervalMs
    : 1000 / 60;
  if (!Number.isFinite(currentDeadlineMs)) {
    return safeNow + safeInterval;
  }

  const nextDeadline = currentDeadlineMs + safeInterval;
  if (nextDeadline > safeNow) {
    return nextDeadline;
  }

  const skippedIntervals = Math.floor((safeNow - nextDeadline) / safeInterval) + 1;
  const advancedDeadline = nextDeadline + skippedIntervals * safeInterval;
  return advancedDeadline > safeNow ? advancedDeadline : safeNow + safeInterval;
}
