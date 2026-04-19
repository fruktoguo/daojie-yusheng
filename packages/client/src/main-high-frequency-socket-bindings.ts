import { NEXT_S2C, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import type { SocketManager } from './network/socket';

type MainHighFrequencySocketBindingsOptions = {
  socket: Pick<SocketManager, 'on'>;
  onBootstrap: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Bootstrap>) => void;
  onInitSession: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.InitSession>) => void;
  onMapEnter: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MapEnter>) => void;
  onRealm: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Realm>) => void;
  onWorldDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.WorldDelta>) => void;
  onSelfDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.SelfDelta>) => void;
  onPanelDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.PanelDelta>) => void;
  onMapStatic: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MapStatic>) => void;
};

export function bindMainHighFrequencySocketEvents(options: MainHighFrequencySocketBindingsOptions): void {
  options.socket.on(NEXT_S2C.Realm, options.onRealm);
  options.socket.on(NEXT_S2C.InitSession, options.onInitSession);
  options.socket.on(NEXT_S2C.MapEnter, options.onMapEnter);
  options.socket.on(NEXT_S2C.WorldDelta, options.onWorldDelta);
  options.socket.on(NEXT_S2C.SelfDelta, options.onSelfDelta);
  options.socket.on(NEXT_S2C.PanelDelta, options.onPanelDelta);
  options.socket.on(NEXT_S2C.MapStatic, options.onMapStatic);
  options.socket.on(NEXT_S2C.Bootstrap, options.onBootstrap);
}
