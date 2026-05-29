/**
 * 本文件属于正式客户端主线，负责 buff 派生表现逻辑。
 *
 * 维护时要保持表现层只解释服务端已同步的结构化 buff 状态，不发明权威持续时间。
 */

type PresentationBuffLike = {
  remainingTicks?: number;
  stacks?: number;
  presentationScale?: number;
  infiniteDuration?: boolean;
};

export function resolvePresentationScaleFromBuffs(buffs: readonly PresentationBuffLike[] | null | undefined): number | undefined {
  let scale = 1;
  for (const buff of buffs ?? []) {
    const remaining = estimateBuffRemainingTicksLocal(buff);
    if (remaining <= 0 || (buff.stacks ?? 0) <= 0) {
      continue;
    }
    const presentationScale = Number(buff.presentationScale);
    if (Number.isFinite(presentationScale) && presentationScale > scale) {
      scale = presentationScale;
    }
  }
  return scale > 1 ? scale : undefined;
}

/** 本地估算 buff 剩余 ticks：无限持续 buff 的 remainingTicks 是服务端活跃哨兵，不按本地时间衰减。 */
function estimateBuffRemainingTicksLocal(buff: PresentationBuffLike): number {
  const remaining = Number(buff.remainingTicks ?? 0);
  if (buff.infiniteDuration === true) {
    return remaining;
  }
  const baseTime = (buff as unknown as Record<string, unknown>)._remainingTicksReceivedAt;
  if (typeof baseTime !== 'number' || baseTime <= 0) {
    return remaining;
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - baseTime) / 1000));
  return Math.max(0, remaining - elapsedSeconds);
}
