import { S2C, type ServerToClientEventPayload } from '@mud/shared';
import type { SocketManager } from './network/socket';
/**
 * MainHighFrequencySocketBindingsOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainHighFrequencySocketBindingsOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<SocketManager, 'on'>;  
  /**
 * onBootstrap：onBootstrap相关字段。
 */

  onBootstrap: (data: ServerToClientEventPayload<typeof S2C.Bootstrap>) => void;  
  /**
 * onInitSession：onInitSession相关字段。
 */

  onInitSession: (data: ServerToClientEventPayload<typeof S2C.InitSession>) => void;  
  /**
 * onMapEnter：on地图Enter相关字段。
 */

  onMapEnter: (data: ServerToClientEventPayload<typeof S2C.MapEnter>) => void;  
  /**
 * onRealm：onRealm相关字段。
 */

  onRealm: (data: ServerToClientEventPayload<typeof S2C.Realm>) => void;  
  /**
 * onWorldDelta：on世界Delta相关字段。
 */

  onWorldDelta: (data: ServerToClientEventPayload<typeof S2C.WorldDelta>) => void;  
  /**
 * onSelfDelta：onSelfDelta相关字段。
 */

  onSelfDelta: (data: ServerToClientEventPayload<typeof S2C.SelfDelta>) => void;  
  /**
 * onPanelDelta：on面板Delta相关字段。
 */

  onPanelDelta: (data: ServerToClientEventPayload<typeof S2C.PanelDelta>) => void;  
  /**
 * onMapStatic：on地图Static相关字段。
 */

  onMapStatic: (data: ServerToClientEventPayload<typeof S2C.MapStatic>) => void;
};
/**
 * bindMainHighFrequencySocketEvents：执行bindMainHighFrequencySocket事件相关逻辑。
 * @param options MainHighFrequencySocketBindingsOptions 选项参数。
 * @returns 无返回值，直接更新bindMainHighFrequencySocket事件相关状态。
 */


export function bindMainHighFrequencySocketEvents(options: MainHighFrequencySocketBindingsOptions): void {
  options.socket.on(S2C.Realm, options.onRealm);
  options.socket.on(S2C.InitSession, options.onInitSession);
  options.socket.on(S2C.MapEnter, options.onMapEnter);
  options.socket.on(S2C.WorldDelta, options.onWorldDelta);
  options.socket.on(S2C.SelfDelta, options.onSelfDelta);
  options.socket.on(S2C.PanelDelta, options.onPanelDelta);
  options.socket.on(S2C.MapStatic, options.onMapStatic);
  options.socket.on(S2C.Bootstrap, options.onBootstrap);
}
