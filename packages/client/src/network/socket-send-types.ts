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
