/**
 * 客户端 Socket 出站门控。
 *
 * Socket.IO 会在断线时缓存普通 emit。游戏业务意图不能跨会话延迟执行，
 * 因此普通业务只允许已连接且已完成 InitSession 的会话发出；解除离线收益首包阻塞的
 * 受控引导事件可显式降低为仅要求当前连接，仍禁止进入 Socket.IO 离线缓冲。
 */

/** 当前 Socket 传输与游戏会话的最小可发送状态。 */
export interface SocketOutboundState {
  connected: boolean;
  sessionReady: boolean;
}

/** 业务事件的会话门控要求；默认必须完成 InitSession。 */
export interface SocketBusinessGateOptions {
  requiresSessionReady?: boolean;
}

/** 业务事件未进入 Socket.IO 缓冲时，调用方可据此停止本地后续动作。 */
export type SocketSendResult =
  | { accepted: true }
  | { accepted: false; reason: 'not_connected' | 'not_ready' };

/** 根据当前连接状态判定业务意图是否允许发送。 */
export function resolveSocketBusinessSendResult(
  state: SocketOutboundState,
  options: SocketBusinessGateOptions = {},
): SocketSendResult {
  if (!state.connected) {
    return { accepted: false, reason: 'not_connected' };
  }
  if (options.requiresSessionReady !== false && !state.sessionReady) {
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
  options: SocketBusinessGateOptions = {},
): SocketSendResult {
  const result = resolveSocketBusinessSendResult(state, options);
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
