/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
import { C2S, type ClientToServerEventName, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketSendResult } from './socket-outbound-gate';
/**
 * SocketEmitEvent：统一结构类型，保证协议与运行时一致性。
 */


/** 连接和握手事件只允许由 SocketManager 生命周期发送。 */
export type SocketLifecycleEventName = typeof C2S.Hello | typeof C2S.Heartbeat;

/** 排除连接生命周期事件后的玩家或 GM 业务事件。 */
export type SocketBusinessEventName = Exclude<ClientToServerEventName, SocketLifecycleEventName>;

/** 离线收益确认阻塞首包时，建立底层连接后即可发送的会话引导事件。 */
export type SocketSessionBootstrapEventName =
  | typeof C2S.AckOfflineGainReports
  | typeof C2S.RequestOfflineGainReports;

/** 仅放行解除离线收益阻塞所必需的两个事件，其他业务仍等待 InitSession。 */
export function isSocketSessionBootstrapEvent(
  event: SocketBusinessEventName,
): event is SocketSessionBootstrapEventName {
  return event === C2S.AckOfflineGainReports || event === C2S.RequestOfflineGainReports;
}

/** 统一业务发包出口，返回结果让调用方按需停止本地后续操作。 */
export type SocketEmitEvent = <TEvent extends SocketBusinessEventName>(
  event: TEvent,
  payload: ClientToServerEventPayload<TEvent>,
) => SocketSendResult;
/**
 * SocketConnectedGetter：统一结构类型，保证协议与运行时一致性。
 */


export type SocketConnectedGetter = () => boolean;
