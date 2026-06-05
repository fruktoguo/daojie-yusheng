/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import { decodeServerEventPayload, S2C, type ServerToClientEventPayload } from '@mud/shared';
import { endRuntimeProfileMetric, startRuntimeProfileMetric } from './debug/runtime-profiler';
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
  options.socket.on(S2C.WorldDelta, (data) => {
    const startedAt = startRuntimeProfileMetric();
    try {
      options.onWorldDelta(data);
    } finally {
      endRuntimeProfileMetric('socket.worldDelta', startedAt);
    }
  });
  options.socket.on(S2C.SelfDelta, (data) => {
    const startedAt = startRuntimeProfileMetric();
    try {
      options.onSelfDelta(data);
    } finally {
      endRuntimeProfileMetric('socket.selfDelta', startedAt);
    }
  });
  options.socket.on(S2C.PanelDelta, (data) => {
    const startedAt = startRuntimeProfileMetric();
    try {
      options.onPanelDelta(data);
    } finally {
      endRuntimeProfileMetric('socket.panelDelta', startedAt);
    }
  });
  options.socket.on(S2C.MapStatic, options.onMapStatic);
  options.socket.on(S2C.Bootstrap, options.onBootstrap);
  // T-07: 合并 envelope 拆分处理
  options.socket.on(S2C.SyncEnvelope, (data: Record<string, unknown>) => {
    const envelopeStartedAt = startRuntimeProfileMetric();
    try {
      if (data.w) {
        const decodeStartedAt = startRuntimeProfileMetric();
        let worldDelta: ServerToClientEventPayload<typeof S2C.WorldDelta>;
        try {
          worldDelta = decodeServerEventPayload(S2C.WorldDelta, data.w);
        } finally {
          endRuntimeProfileMetric('socket.decodeWorldDelta', decodeStartedAt);
        }
        const handleStartedAt = startRuntimeProfileMetric();
        try {
          options.onWorldDelta(worldDelta);
        } finally {
          endRuntimeProfileMetric('socket.handleWorldDelta', handleStartedAt);
        }
      }
      if (data.s) {
        const decodeStartedAt = startRuntimeProfileMetric();
        let selfDelta: ServerToClientEventPayload<typeof S2C.SelfDelta>;
        try {
          selfDelta = decodeServerEventPayload(S2C.SelfDelta, data.s);
        } finally {
          endRuntimeProfileMetric('socket.decodeSelfDelta', decodeStartedAt);
        }
        const handleStartedAt = startRuntimeProfileMetric();
        try {
          options.onSelfDelta(selfDelta);
        } finally {
          endRuntimeProfileMetric('socket.handleSelfDelta', handleStartedAt);
        }
      }
      if (data.p) {
        const decodeStartedAt = startRuntimeProfileMetric();
        let panelDelta: ServerToClientEventPayload<typeof S2C.PanelDelta>;
        try {
          panelDelta = decodeServerEventPayload(S2C.PanelDelta, data.p);
        } finally {
          endRuntimeProfileMetric('socket.decodePanelDelta', decodeStartedAt);
        }
        const handleStartedAt = startRuntimeProfileMetric();
        try {
          options.onPanelDelta(panelDelta);
        } finally {
          endRuntimeProfileMetric('socket.handlePanelDelta', handleStartedAt);
        }
      }
    } finally {
      endRuntimeProfileMetric('socket.syncEnvelope', envelopeStartedAt);
    }
  });
}
