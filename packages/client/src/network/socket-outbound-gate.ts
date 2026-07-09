/**
 * 客户端 Socket 出站门控。
 *
 * Socket.IO 会在断线时缓存普通 emit。游戏业务意图不能跨会话延迟执行，
 * 因此这里只允许已连接且已完成 InitSession 的会话发出业务事件。
 */

/** 当前 Socket 传输与游戏会话的最小可发送状态。 */
export interface SocketOutboundState {
  connected: boolean;
  sessionReady: boolean;
}

/** 业务事件未进入 Socket.IO 缓冲时，调用方可据此停止本地后续动作。 */
export type SocketSendResult =
  | { accepted: true }
  | { accepted: false; reason: 'not_connected' | 'not_ready' };

/** 根据当前连接状态判定业务意图是否允许发送。 */
export function resolveSocketBusinessSendResult(state: SocketOutboundState): SocketSendResult {
  if (!state.connected) {
    return { accepted: false, reason: 'not_connected' };
  }
  if (!state.sessionReady) {
    return { accepted: false, reason: 'not_ready' };
  }
  return { accepted: true };
}

/**
 * 发送已通过业务会话门控的事件。
 *
 * emit 回调仅在 accepted 时调用，断线或首包未完成时不会把业务包交给 Socket.IO，
 * 从而不会落入其离线缓冲队列。
 */
export function emitSocketBusinessEvent(
  state: SocketOutboundState,
  emit: (() => void) | null,
): SocketSendResult {
  const result = resolveSocketBusinessSendResult(state);
  if (!result.accepted) {
    return result;
  }
  if (!emit) {
    return { accepted: false, reason: 'not_connected' };
  }
  emit();
  return result;
}

/**
 * 发送连接生命周期事件。
 *
 * Hello 仅依赖底层连接，用于请求会话初始化；Heartbeat 还必须等待 InitSession。
 * 二者均不允许在断线时进入 Socket.IO 缓冲。
 */
export function emitSocketLifecycleEvent(
  state: SocketOutboundState,
  requiresSessionReady: boolean,
  emit: (() => void) | null,
): boolean {
  if (!state.connected || (requiresSessionReady && !state.sessionReady) || !emit) {
    return false;
  }
  emit();
  return true;
}
