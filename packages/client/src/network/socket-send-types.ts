import type { NEXT_C2S_EventName, NEXT_C2S_EventPayload } from '@mud/shared-next';

export type SocketEmitEvent = <TEvent extends NEXT_C2S_EventName>(
  event: TEvent,
  payload: NEXT_C2S_EventPayload<TEvent>,
) => void;

export type SocketConnectedGetter = () => boolean;
