import type { NEXT_C2S_EventName, NEXT_C2S_EventPayload } from '@mud/shared-next';
/**
 * SocketEmitEvent：统一结构类型，保证协议与运行时一致性。
 */


export type SocketEmitEvent = <TEvent extends NEXT_C2S_EventName>(
  event: TEvent,
  payload: NEXT_C2S_EventPayload<TEvent>,
) => void;
/**
 * SocketConnectedGetter：统一结构类型，保证协议与运行时一致性。
 */


export type SocketConnectedGetter = () => boolean;
