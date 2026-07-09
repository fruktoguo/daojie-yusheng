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

/** 需要已完成 InitSession 的玩家或 GM 业务意图。 */
export type SocketBusinessEventName = Exclude<ClientToServerEventName, SocketLifecycleEventName>;

/** 统一业务发包出口，返回结果让调用方按需停止本地后续操作。 */
export type SocketEmitEvent = <TEvent extends SocketBusinessEventName>(
  event: TEvent,
  payload: ClientToServerEventPayload<TEvent>,
) => SocketSendResult;
/**
 * SocketConnectedGetter：统一结构类型，保证协议与运行时一致性。
 */


export type SocketConnectedGetter = () => boolean;
