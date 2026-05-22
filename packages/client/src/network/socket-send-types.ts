/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
import type { ClientToServerEventName, ClientToServerEventPayload } from '@mud/shared';
/**
 * SocketEmitEvent：统一结构类型，保证协议与运行时一致性。
 */


export type SocketEmitEvent = <TEvent extends ClientToServerEventName>(
  event: TEvent,
  payload: ClientToServerEventPayload<TEvent>,
) => void;
/**
 * SocketConnectedGetter：统一结构类型，保证协议与运行时一致性。
 */


export type SocketConnectedGetter = () => boolean;
