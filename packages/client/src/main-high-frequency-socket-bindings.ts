import { NEXT_S2C, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
/**
 * MainHighFrequencySocketBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainHighFrequencySocketBindingsOptions = {
/**
 * socket：对象字段。
 */

  socket: Pick<SocketManager, 'on'>;  
  /**
 * onBootstrap：对象字段。
 */

  onBootstrap: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Bootstrap>) => void;  
  /**
 * onInitSession：对象字段。
 */

  onInitSession: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.InitSession>) => void;  
  /**
 * onMapEnter：对象字段。
 */

  onMapEnter: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MapEnter>) => void;  
  /**
 * onRealm：对象字段。
 */

  onRealm: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.Realm>) => void;  
  /**
 * onWorldDelta：对象字段。
 */

  onWorldDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.WorldDelta>) => void;  
  /**
 * onSelfDelta：对象字段。
 */

  onSelfDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.SelfDelta>) => void;  
  /**
 * onPanelDelta：对象字段。
 */

  onPanelDelta: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.PanelDelta>) => void;  
  /**
 * onMapStatic：对象字段。
 */

  onMapStatic: (data: NEXT_S2C_EventPayload<typeof NEXT_S2C.MapStatic>) => void;
};
/**
 * bindMainHighFrequencySocketEvents：执行核心业务逻辑。
 * @param options MainHighFrequencySocketBindingsOptions 选项参数。
 * @returns void。
 */


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
