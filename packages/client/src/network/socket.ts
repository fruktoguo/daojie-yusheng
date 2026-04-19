/**
 * Socket.IO 网络管理器 —— 封装客户端与服务端的双向通信，提供类型安全的事件收发接口
 */

import { io, Socket } from 'socket.io-client';
import {
  encodeClientEventPayload,
  NEXT_C2S,
  NEXT_C2S_EventName,
  NEXT_C2S_EventPayload,
  SOCKET_CONNECT_TIMEOUT_MS,
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY_MAX_MS,
  SOCKET_RECONNECTION_DELAY_MS,
  SOCKET_TRANSPORTS,
} from '@mud/shared-next';
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
  connect(token: string): void {
    this.accessToken = token;
    this.disposeSocket({ clearToken: false });
    this.socket = this.createSocketConnection(token);
    this.lifecycle.bind(this.socket);
    this.serverEvents.bindSessionEvents();
    this.serverEvents.bindGameplayEvents();
  }

  /** 创建底层 Socket.IO 连接实例。 */
  private createSocketConnection(token: string): Socket {
    return io({
      auth: { token, protocol: 'next' },
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
  private sendEvent<TEvent extends NEXT_C2S_EventName>(
    event: TEvent,
    payload: NEXT_C2S_EventPayload<TEvent>,
  ): void {
    this.socket?.emit(event, encodeClientEventPayload(event, payload));
  }

  /** 断开当前连接并清理 token。 */
  disconnect(): void {
    this.disposeSocket({ clearToken: true });
  }

  /** 使用已有 token 重新发起连接。 */
  reconnect(token?: string): boolean {
    const nextToken = token ?? this.accessToken;
    if (!nextToken) {
      return false;
    }
    this.connect(nextToken);
    return true;
  }

  /** 释放 Socket 实例并按需清除 token。 */
  private disposeSocket(options: { clearToken: boolean }): void {
    if (options.clearToken) {
      this.accessToken = null;
    }
    this.lifecycle.dispose();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** 向服务端发送心跳包。 */
  private sendHeartbeat(): void {
    this.sendEvent(NEXT_C2S.Heartbeat, { clientAt: Date.now() });
  }

  /** 发送握手消息，完成客户端就绪声明。 */
  private sendHello(): void {
    this.sendEvent(NEXT_C2S.Hello, {});
  }

  onKick(cb: () => void): void {
    this.lifecycle.onKick(cb);
  }

  onDisconnect(cb: (reason: string) => void): void {
    this.lifecycle.onDisconnect(cb);
  }

  onConnectError(cb: (message: string) => void): void {
    this.lifecycle.onConnectError(cb);
  }

  /** 透传通用发包接口。 */
  emit<TEvent extends NEXT_C2S_EventName>(
    event: TEvent,
    payload: NEXT_C2S_EventPayload<TEvent>,
  ): void {
    this.sendEvent(event, payload);
  }

  /** 当前连接是否处于已连接状态。 */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get runtime(): SocketRuntimeSender {
    return this.runtimeSender;
  }

  get panel(): SocketPanelSender {
    return this.panelSender;
  }

  get socialEconomy(): SocketSocialEconomySender {
    return this.socialEconomySender;
  }

  get admin(): SocketAdminSender {
    return this.adminSender;
  }
}
