/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import {
  encodeClientEventPayload,
  C2S,
  ClientToServerEventName,
  ClientToServerEventPayload,
  SOCKET_CONNECT_TIMEOUT_MS,
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY_MAX_MS,
  SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_TRANSPORTS,
} from '@mud/shared';
import { createSocketAdminSender } from './socket-send-admin';
import { createSocketPanelSender } from './socket-send-panel';
import { createSocketRuntimeSender } from './socket-send-runtime';
import { createSocketSocialEconomySender } from './socket-send-social-economy';
import { createSocketServerEventRegistry } from './socket-event-registry';
import { createSocketLifecycleController } from './socket-lifecycle-controller';
import type { SocketAdminSender } from './socket-send-admin';
import type { SocketPanelSender } from './socket-send-panel';
import type { SocketRuntimeSender } from './socket-send-runtime';
import type { SocketSocialEconomySender } from './socket-send-social-economy';
import type { BoundServerEventName, ServerEventCallback } from './socket-server-events';

/** 客户端 Socket.IO 连接管理器，负责连接生命周期、协议编解码和事件分发。 */
export class SocketManager {
  /** 当前持有的 Socket.IO 连接实例。 */
  private socket: Socket | null = null;
  /** 连接使用的访问令牌，便于断线后重连。 */
  private accessToken: string | null = null;
  /** 当前连接使用的目标服务地址，默认为当前 origin。 */
  private serverUrlOverride: string | null = null;
  /** 导航、战斗和运行时动作发包 owner。 */
  private readonly runtimeSender = createSocketRuntimeSender({
    emitEvent: (event, payload) => this.sendEvent(event, payload),
    isConnected: () => this.connected,
  });
  /** 面板与工坊类请求发包 owner。 */
  private readonly panelSender = createSocketPanelSender({
    emitEvent: (event, payload) => this.sendEvent(event, payload),
  });
  /** 社交、邮件和市场发包 owner。 */
  private readonly socialEconomySender = createSocketSocialEconomySender({
    emitEvent: (event, payload) => this.sendEvent(event, payload),
  });
  /** GM 与调试发包 owner。 */
  private readonly adminSender = createSocketAdminSender({
    emitEvent: (event, payload) => this.sendEvent(event, payload),
  });
  /** 服务端事件注册与回调桶 owner。 */
  private readonly serverEvents = createSocketServerEventRegistry({
    getSocket: () => this.socket,
  });
  /** 连接生命周期与心跳 owner。 */
  private readonly lifecycle = createSocketLifecycleController({
    sendHeartbeat: () => this.sendHeartbeat(),
    sendHello: () => this.sendHello(),
    disconnect: () => this.disconnect(),
  });

  /** 建立 WebSocket 连接并绑定所有服务端事件。 */
  connect(token: string, options: { serverUrl?: string | null } = {}): void {
    this.accessToken = token;
    if (typeof options.serverUrl === 'string') {
      this.serverUrlOverride = normalizeServerUrl(options.serverUrl);
    } else if (options.serverUrl === null) {
      this.serverUrlOverride = null;
    }
    this.disposeSocket({ clearToken: false });
    this.socket = this.createSocketConnection(token);
    this.lifecycle.bind(this.socket);
    this.serverEvents.bindSessionEvents();
    this.serverEvents.bindGameplayEvents();
  }

  /** 创建底层 Socket.IO 连接实例。 */
  private createSocketConnection(token: string): Socket {
    return io(this.serverUrlOverride || undefined, {
      auth: { token, protocol: 'mainline' },
      // Swarm rolling updates and reverse proxies can route polling requests
      // to a different task, while a single WebSocket connection avoids SID drift.
      transports: [...SOCKET_TRANSPORTS],
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY_MS,
      reconnectionDelayMax: SOCKET_RECONNECTION_DELAY_MAX_MS,
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
    });
  }

  /** 泛型注册服务端事件订阅，维持 socket.ts 为唯一消费主入口。 */
  on<TEvent extends BoundServerEventName>(
    event: TEvent,
    cb: ServerEventCallback<TEvent>,
  ): void {
    this.serverEvents.on(event, cb);
  }

  /** 向服务端发送事件，自动编码载荷。 */
  private sendEvent<TEvent extends ClientToServerEventName>(
    event: TEvent,
    payload: ClientToServerEventPayload<TEvent>,
  ): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

  /** 断开当前连接并清理 token。 */
  disconnect(): void {
    this.disposeSocket({ clearToken: true });
  }

  /** 使用已有 token 重新发起连接。 */
  reconnect(token?: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextToken = token ?? this.accessToken;
    if (!nextToken) {
      return false;
    }
    this.connect(nextToken);
    return true;
  }

  /** 切换到指定服务地址并复用已有 token 重连。 */
  redirectToServer(serverUrl: string, token?: string): boolean {
    const nextToken = token ?? this.accessToken;
    const normalizedServerUrl = normalizeServerUrl(serverUrl);
    if (!nextToken || !normalizedServerUrl) {
      return false;
    }
    this.connect(nextToken, { serverUrl: normalizedServerUrl });
    return true;
  }

  /** 释放 Socket 实例并按需清除 token。 */
  private disposeSocket(options: {  
  /**
 * clearToken：clearToken标识。
 */
 clearToken: boolean }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (options.clearToken) {
      this.accessToken = null;
    }
    this.lifecycle.dispose();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** 向服务端发送心跳包。 */
  private sendHeartbeat(): void {
    this.sendEvent(C2S.Heartbeat, { clientAt: Date.now() });
  }

  /** 发送握手消息，完成客户端就绪声明。 */
  private sendHello(): void {
    this.sendEvent(C2S.Hello, {});
  }  
  /**
 * onKick：执行onKick相关逻辑。
 * @param cb () => void 参数说明。
 * @returns 无返回值，直接更新onKick相关状态。
 */


  onKick(cb: () => void): void {
    this.lifecycle.onKick(cb);
  }  
  /**
 * onDisconnect：判断onDisconnect是否满足条件。
 * @param cb (reason: string) => void 参数说明。
 * @returns 无返回值，直接更新onDisconnect相关状态。
 */


  onDisconnect(cb: (reason: string) => void): void {
    this.lifecycle.onDisconnect(cb);
  }  
  /**
 * onConnectError：执行onConnectError相关逻辑。
 * @param cb (message: string) => void 参数说明。
 * @returns 无返回值，直接更新onConnectError相关状态。
 */


  onConnectError(cb: (message: string) => void): void {
    this.lifecycle.onConnectError(cb);
  }

  /** 透传通用发包接口。 */
  emit<TEvent extends ClientToServerEventName>(
    event: TEvent,
    payload: ClientToServerEventPayload<TEvent>,
  ): void {
    this.sendEvent(event, payload);
  }

  /** 当前连接是否处于已连接状态。 */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }  
  /**
 * runtime：读取运行态。
 * @returns 返回运行态。
 */


  get runtime(): SocketRuntimeSender {
    return this.runtimeSender;
  }  
  /**
 * panel：读取面板。
 * @returns 返回面板。
 */


  get panel(): SocketPanelSender {
    return this.panelSender;
  }  
  /**
 * socialEconomy：读取socialEconomy。
 * @returns 返回socialEconomy。
 */


  get socialEconomy(): SocketSocialEconomySender {
    return this.socialEconomySender;
  }  
  /**
 * admin：读取admin。
 * @returns 返回admin。
 */


  get admin(): SocketAdminSender {
    return this.adminSender;
  }
}

function normalizeServerUrl(serverUrl: string | null | undefined): string | null {
  if (typeof serverUrl !== 'string') {
    return null;
  }
  const normalized = serverUrl.trim();
  return normalized.length > 0 ? normalized.replace(/\/+$/, '') : null;
}
