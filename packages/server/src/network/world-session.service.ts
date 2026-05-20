/**
 * 世界会话管理服务。
 * 维护 socket-player 绑定关系、断线 detach 窗口、session 复用和过期回收队列。
 * 是网络层会话生命周期的唯一真源（单进程内存）。
 */

import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';

const DEFAULT_SESSION_DETACH_EXPIRE_MS = 15_000;
const MAX_REQUESTED_SESSION_ID_LENGTH = 128;

export const WORLD_SESSION_CONTRACT = Object.freeze({
  sourceOfTruth: 'single_process_memory',
  connectedReuse: 'reuse_current_session_only_when_allowConnectedSessionReuse',
  detachedResume: 'implicit_or_requested_within_detach_window',
  detachExpireEnvKey: 'SERVER_SESSION_DETACH_EXPIRE_MS',
  zeroExpireBehavior: 'expire_immediately_and_enqueue_for_reaper',
});

interface SocketPort {
  id: string;
  emit(event: string, payload: unknown): void;
  disconnect(close?: boolean): void;
  join?(room: string): void | Promise<void>;
  leave?(room: string): void | Promise<void>;
}

interface SocketRoomEmitterPort {
  emit(event: string, payload: unknown): void;
}

interface SocketServerPort {
  to(room: string): SocketRoomEmitterPort;
}

export interface WorldSessionBinding {
  playerId: string;
  sessionId: string;
  socketId: string | null;
  instanceId: string | null;
  sessionEpoch: number | null;
  resumed: boolean;
  connected: boolean;
  detachedAt: number | null;
  expireAt: number | null;
}

/** 死信队列条目：保留 binding 与失败上下文供运维/GM 面板观察。 */
export interface ExpiredBindingDeadLetterEntry {
  binding: WorldSessionBinding;
  firstFailedAt: number;
  lastFailedAt: number;
  attempts: number;
  lastError: string | null;
}

interface RegisterSocketOptions {
  allowImplicitDetachedResume?: boolean;
  allowRequestedDetachedResume?: boolean;
  allowConnectedSessionReuse?: boolean;
}

type SessionTimer = ReturnType<typeof setTimeout>;

function resolveSessionDetachExpireMs(): number {
  const raw = process.env.SERVER_SESSION_DETACH_EXPIRE_MS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.trunc(parsed));
  }
  return DEFAULT_SESSION_DETACH_EXPIRE_MS;
}

/**
 * 过期 binding 重入次数上限：达到上限后 binding 会被移入死信队列，
 * 防止 PlayerPersistenceFlushService.flushPlayer 持续失败时无限 requeue。
 * 默认 10 次（约 10 秒，对应 reaper 1Hz），可通过 env 调整。
 */
function resolveExpiredBindingMaxRetries(): number {
  const raw = process.env.SERVER_SESSION_REAPER_MAX_RETRIES;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return 10;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

const EXPIRED_BINDING_MAX_RETRIES = resolveExpiredBindingMaxRetries();

/** 死信队列最大容量；超出时淘汰最早的条目，防止网络不稳定时无界增长。 */
const EXPIRED_BINDING_DEAD_LETTER_MAX_SIZE = 200;

export function buildWorldInstanceRoomId(instanceId: string): string {
  return `world:instance:${instanceId}`;
}

function sanitizeRequestedSessionId(rawSessionId: unknown): string {
  if (typeof rawSessionId !== 'string') {
    return '';
  }

  const normalizedSessionId = rawSessionId.trim();
  if (!normalizedSessionId || normalizedSessionId.length > MAX_REQUESTED_SESSION_ID_LENGTH) {
    return '';
  }
  if (!/^[A-Za-z0-9:_-]+$/.test(normalizedSessionId)) {
    return '';
  }
  return normalizedSessionId;
}

@Injectable()
export class WorldSessionService {
  private readonly socketsById = new Map<string, SocketPort>();
  private readonly bindingBySocketId = new Map<string, WorldSessionBinding>();
  private readonly bindingByPlayerId = new Map<string, WorldSessionBinding>();
  private readonly bindingBySessionId = new Map<string, WorldSessionBinding>();
  private readonly playerIdsByInstanceId = new Map<string, Set<string>>();
  private socketServer: SocketServerPort | null = null;
  private readonly expiryTimerByPlayerId = new Map<string, SessionTimer>();
  private readonly expiredBindings = new Map<string, WorldSessionBinding>();
  /**
   * 每个 playerId 当前 expired binding 的重入失败计数：每次 reaper 调用 requeueExpiredBinding 时 +1，
   * 进入 expiredBindings 并被成功消费（consumeExpiredBindings + flush 成功不再 requeue）后由
   * resetExpiredBindingRetryCounter 清零。达到 EXPIRED_BINDING_MAX_RETRIES 时 requeue 不再生效，
   * binding 转入 expiredBindingDeadLetter。
   */
  private readonly requeueAttemptsByPlayerId = new Map<string, number>();
  /** 持续失败的 binding 死信队列，供运维/GM 面板观察异常玩家。 */
  private readonly expiredBindingDeadLetter = new Map<string, ExpiredBindingDeadLetterEntry>();
  private readonly purgedPlayerIds = new Set<string>();
  private nextSessionSequence = 1;
  private readonly sessionDetachExpireMs = resolveSessionDetachExpireMs();

  registerSocket(
    client: SocketPort,
    playerId: string,
    requestedSessionId?: string,
    options: RegisterSocketOptions | undefined = undefined,
  ): WorldSessionBinding {
    this.socketsById.set(client.id, client);

    const previous = this.bindingByPlayerId.get(playerId);
    const requested = sanitizeRequestedSessionId(requestedSessionId);
    const hasDetachedBinding = previous && !previous.connected;
    const allowImplicitDetachedResume = options?.allowImplicitDetachedResume !== false;
    const allowRequestedDetachedResume = options?.allowRequestedDetachedResume !== false;
    const allowConnectedSessionReuse = options?.allowConnectedSessionReuse !== false;

    const resumeMatched = Boolean(
      hasDetachedBinding
        && (
          requested
            ? allowRequestedDetachedResume && requested === previous?.sessionId
            : allowImplicitDetachedResume
        ),
    );

    const reuseConnectedSession = previous?.connected === true
      && allowConnectedSessionReuse
      && (!requested || requested === previous.sessionId);

    const sessionId = resumeMatched
      ? previous!.sessionId
      : reuseConnectedSession
        ? previous!.sessionId
        : this.createSessionId(playerId);

    const binding: WorldSessionBinding = {
      playerId,
      sessionId,
      socketId: client.id,
      instanceId: previous?.instanceId ?? null,
      sessionEpoch: previous?.sessionEpoch ?? null,
      resumed: resumeMatched,
      connected: true,
      detachedAt: null,
      expireAt: null,
    };

    this.clearExpiry(playerId);
    this.expiredBindings.delete(playerId);
    if (previous?.sessionId && previous.sessionId !== sessionId) {
      this.bindingBySessionId.delete(previous.sessionId);
    }
    this.bindingBySocketId.set(client.id, binding);
    this.bindingByPlayerId.set(playerId, binding);
    this.bindingBySessionId.set(sessionId, binding);
    if (binding.instanceId) {
      this.addPlayerToInstanceIndex(playerId, binding.instanceId);
      this.joinSocketInstanceRoom(client.id, binding.instanceId);
    }

    if (previous && previous.connected && previous.socketId && previous.socketId !== client.id) {
      this.bindingBySocketId.delete(previous.socketId);
      if (previous.instanceId) {
        this.leaveSocketInstanceRoom(previous.socketId, previous.instanceId);
      }
      const previousSocket = this.socketsById.get(previous.socketId);
      if (previousSocket) {
        previousSocket.emit(S2C.Kick, { reason: 'replaced' });
        previousSocket.disconnect(true);
      }
    }
    return binding;
  }

  normalizeRequestedSessionId(rawSessionId: unknown): string {
    return sanitizeRequestedSessionId(rawSessionId);
  }

  unregisterSocket(socketId: string): WorldSessionBinding | null {
    const binding = this.bindingBySocketId.get(socketId);
    if (!binding) {
      this.socketsById.delete(socketId);
      return null;
    }
    this.bindingBySocketId.delete(socketId);

    const current = this.bindingByPlayerId.get(binding.playerId);
    if (!current || current.socketId !== socketId) {
      if (binding.instanceId) {
        this.leaveSocketInstanceRoom(socketId, binding.instanceId);
      }
      this.socketsById.delete(socketId);
      return null;
    }
    this.removePlayerFromInstanceIndex(binding.playerId, binding.instanceId);
    if (binding.instanceId) {
      this.leaveSocketInstanceRoom(socketId, binding.instanceId);
    }
    this.socketsById.delete(socketId);

    const detachedAt = Date.now();
    const detachedBinding: WorldSessionBinding = {
      playerId: binding.playerId,
      sessionId: binding.sessionId,
      socketId: null,
      instanceId: binding.instanceId,
      sessionEpoch: binding.sessionEpoch ?? null,
      resumed: false,
      connected: false,
      detachedAt,
      expireAt: detachedAt + this.sessionDetachExpireMs,
    };

    this.clearExpiry(binding.playerId);
    this.expiredBindings.delete(binding.playerId);
    if (this.sessionDetachExpireMs <= 0) {
      this.bindingByPlayerId.delete(binding.playerId);
      this.bindingBySessionId.delete(detachedBinding.sessionId);
      this.expiredBindings.set(binding.playerId, detachedBinding);
      return detachedBinding;
    }
    this.bindingByPlayerId.set(binding.playerId, detachedBinding);
    this.bindingBySessionId.set(detachedBinding.sessionId, detachedBinding);
    this.scheduleExpiry(detachedBinding);
    return detachedBinding;
  }

  getBinding(playerId: string): WorldSessionBinding | null {
    return this.bindingByPlayerId.get(playerId) ?? null;
  }

  getBindingBySessionId(sessionId: string): WorldSessionBinding | null {
    const normalizedSessionId = sanitizeRequestedSessionId(sessionId);
    if (!normalizedSessionId) {
      return null;
    }
    return this.bindingBySessionId.get(normalizedSessionId) ?? null;
  }

  getDetachedBindingBySessionId(sessionId: string): WorldSessionBinding | null {
    const binding = this.getBindingBySessionId(sessionId);
    if (!binding || binding.connected === true) {
      return null;
    }
    if (typeof binding.expireAt === 'number' && Number.isFinite(binding.expireAt) && binding.expireAt <= Date.now()) {
      this.bindingBySessionId.delete(binding.sessionId);
      this.bindingByPlayerId.delete(binding.playerId);
      this.clearExpiry(binding.playerId);
      this.expiredBindings.set(binding.playerId, binding);
      return null;
    }
    return binding;
  }

  getBindingBySocketId(socketId: string): WorldSessionBinding | null {
    return this.bindingBySocketId.get(socketId) ?? null;
  }

  getSocketByPlayerId(playerId: string): SocketPort | null {
    const binding = this.bindingByPlayerId.get(playerId);
    return binding?.socketId ? (this.socketsById.get(binding.socketId) ?? null) : null;
  }

  listBindings(): WorldSessionBinding[] {
    return Array.from(this.bindingByPlayerId.values()).filter((binding) => binding.connected);
  }

  listConnectedBindings(): WorldSessionBinding[] {
    return this.listBindings().map((binding) => ({ ...binding }));
  }

  detachConnectedBindingsForShutdown(reason = 'server_shutdown'): WorldSessionBinding[] {
    const connectedBindings = this.listConnectedBindings();
    const detachedBindings: WorldSessionBinding[] = [];
    for (const binding of connectedBindings) {
      const socketId = typeof binding.socketId === 'string' ? binding.socketId : '';
      if (!socketId) {
        continue;
      }
      const socket = this.socketsById.get(socketId) ?? null;
      const detached = this.unregisterSocket(socketId);
      if (socket) {
        socket.emit(S2C.Kick, { reason });
        socket.disconnect(true);
      }
      if (detached && !detached.connected) {
        detachedBindings.push(detached);
      }
    }
    return detachedBindings;
  }

  attachSocketServer(server: SocketServerPort | null | undefined): void {
    if (!server || typeof server.to !== 'function') {
      return;
    }
    this.socketServer = server;
  }

  syncPlayerInstanceRoom(playerId: string, instanceId: unknown): boolean {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    const nextInstanceId = normalizeInstanceId(instanceId);
    if (!normalizedPlayerId) {
      return false;
    }
    const binding = this.bindingByPlayerId.get(normalizedPlayerId);
    if (!binding) {
      return false;
    }
    const previousInstanceId = normalizeInstanceId(binding.instanceId);
    if (previousInstanceId === nextInstanceId) {
      return false;
    }
    if (previousInstanceId) {
      this.removePlayerFromInstanceIndex(normalizedPlayerId, previousInstanceId);
      if (binding.connected && binding.socketId) {
        this.leaveSocketInstanceRoom(binding.socketId, previousInstanceId);
      }
    }
    binding.instanceId = nextInstanceId;
    if (binding.sessionId) {
      const sessionBinding = this.bindingBySessionId.get(binding.sessionId);
      if (sessionBinding) {
        sessionBinding.instanceId = nextInstanceId;
      }
    }
    if (binding.connected && binding.socketId && nextInstanceId) {
      this.addPlayerToInstanceIndex(normalizedPlayerId, nextInstanceId);
      this.joinSocketInstanceRoom(binding.socketId, nextInstanceId);
    }
    return true;
  }

  listInstancePlayerIds(instanceId: unknown): string[] {
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    return Array.from(this.playerIdsByInstanceId.get(normalizedInstanceId) ?? []);
  }

  emitToInstance(instanceId: unknown, event: string, payload: unknown): boolean {
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!normalizedInstanceId || !event || !this.socketServer) {
      return false;
    }
    const emitter = this.socketServer.to(buildWorldInstanceRoomId(normalizedInstanceId));
    if (!emitter || typeof emitter.emit !== 'function') {
      return false;
    }
    emitter.emit(event, payload);
    return true;
  }

  consumeExpiredBindings(): WorldSessionBinding[] {
    const bindings = Array.from(this.expiredBindings.values());
    this.expiredBindings.clear();
    return bindings;
  }

  /**
   * 重入过期 binding 到队列等待下一次 reaper 处理。
   * 引入失败计数：每次重入 +1，达到 EXPIRED_BINDING_MAX_RETRIES 时不再回队，
   * 改为登记到 expiredBindingDeadLetter，避免 flushPlayer 持续失败导致 expiredBindings 永久重排。
   * 调用方可读取返回值：true=已重入，false=已进入死信队列（或 binding 字段非法被忽略）。
   */
  requeueExpiredBinding(
    binding: Partial<WorldSessionBinding> | null | undefined,
    options?: { lastError?: unknown },
  ): boolean {
    const playerId = typeof binding?.playerId === 'string' ? binding.playerId.trim() : '';
    const sessionId = typeof binding?.sessionId === 'string' ? binding.sessionId.trim() : '';
    if (!playerId || !sessionId || binding?.connected) {
      return false;
    }
    const normalizedBinding: WorldSessionBinding = {
      playerId,
      sessionId,
      socketId: null,
      instanceId: normalizeInstanceId(binding?.instanceId),
      sessionEpoch: normalizeSessionEpoch(binding?.sessionEpoch),
      resumed: false,
      connected: false,
      detachedAt: Number.isFinite(binding?.detachedAt) ? (binding!.detachedAt as number) : Date.now(),
      expireAt: Number.isFinite(binding?.expireAt) ? (binding!.expireAt as number) : Date.now(),
    };
    const previousAttempts = this.requeueAttemptsByPlayerId.get(playerId) ?? 0;
    const nextAttempts = previousAttempts + 1;
    if (nextAttempts > EXPIRED_BINDING_MAX_RETRIES) {
      const lastError = formatRequeueLastError(options?.lastError);
      const existingDeadLetter = this.expiredBindingDeadLetter.get(playerId);
      const now = Date.now();
      this.expiredBindingDeadLetter.set(playerId, {
        binding: normalizedBinding,
        firstFailedAt: existingDeadLetter?.firstFailedAt ?? now,
        lastFailedAt: now,
        attempts: nextAttempts,
        lastError,
      });
      // 超出上限时淘汰最早的条目，防止无界增长
      if (this.expiredBindingDeadLetter.size > EXPIRED_BINDING_DEAD_LETTER_MAX_SIZE) {
        const firstKey = this.expiredBindingDeadLetter.keys().next().value;
        if (firstKey !== undefined) {
          this.expiredBindingDeadLetter.delete(firstKey);
        }
      }
      this.requeueAttemptsByPlayerId.delete(playerId);
      return false;
    }
    this.requeueAttemptsByPlayerId.set(playerId, nextAttempts);
    this.expiredBindings.set(playerId, normalizedBinding);
    return true;
  }

  /**
   * 在 reaper 成功 flush 一次 binding 后调用，清掉 retry 计数；
   * 后续若再次失败将从 1 重新累计，避免历史失败次数影响新一轮判断。
   */
  resetExpiredBindingRetryCounter(playerId: string): void {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return;
    }
    this.requeueAttemptsByPlayerId.delete(normalizedPlayerId);
  }

  /** 暴露死信队列内容，供 GM 面板/监控诊断玩家级 flush 长期失败问题。 */
  listExpiredBindingDeadLetter(): ExpiredBindingDeadLetterEntry[] {
    return Array.from(this.expiredBindingDeadLetter.values()).map((entry) => ({
      ...entry,
      binding: { ...entry.binding },
    }));
  }

  /** 取出并清空死信队列：运维确认处理后调用。 */
  drainExpiredBindingDeadLetter(): ExpiredBindingDeadLetterEntry[] {
    const entries = this.listExpiredBindingDeadLetter();
    this.expiredBindingDeadLetter.clear();
    return entries;
  }

  /** 单玩家死信清理：运维手动确认或玩家重新上线时调用。 */
  removeExpiredBindingDeadLetterEntry(playerId: string): boolean {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return false;
    }
    return this.expiredBindingDeadLetter.delete(normalizedPlayerId);
  }

  rememberSessionEpoch(playerId: string, sessionEpoch: number | null | undefined): void {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    const normalizedSessionEpoch = normalizeSessionEpoch(sessionEpoch);
    if (!normalizedPlayerId || normalizedSessionEpoch <= 0) {
      return;
    }

    const activeBinding = this.bindingByPlayerId.get(normalizedPlayerId);
    if (activeBinding) {
      activeBinding.sessionEpoch = normalizedSessionEpoch;
      if (activeBinding.sessionId) {
        const sessionBinding = this.bindingBySessionId.get(activeBinding.sessionId);
        if (sessionBinding) {
          sessionBinding.sessionEpoch = normalizedSessionEpoch;
        }
      }
    }

    const expiredBinding = this.expiredBindings.get(normalizedPlayerId);
    if (expiredBinding) {
      expiredBinding.sessionEpoch = normalizedSessionEpoch;
    }
  }

  consumePurgedPlayerIds(): string[] {
    const playerIds = Array.from(this.purgedPlayerIds);
    this.purgedPlayerIds.clear();
    return playerIds;
  }

  acknowledgePurgedPlayerIds(playerIds: string[]): void {
    for (const playerId of playerIds) {
      const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
      if (!normalizedPlayerId) {
        continue;
      }
      this.purgedPlayerIds.delete(normalizedPlayerId);
    }
  }

  purgePlayerSession(playerId: string, reason = 'removed'): boolean {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return false;
    }

    const binding = this.bindingByPlayerId.get(normalizedPlayerId) ?? null;
    if (!binding) {
      this.clearExpiry(normalizedPlayerId);
      this.expiredBindings.delete(normalizedPlayerId);
      this.requeueAttemptsByPlayerId.delete(normalizedPlayerId);
      this.expiredBindingDeadLetter.delete(normalizedPlayerId);
      this.purgedPlayerIds.add(normalizedPlayerId);
      return false;
    }
    this.bindingByPlayerId.delete(normalizedPlayerId);
    this.removePlayerFromInstanceIndex(normalizedPlayerId, binding.instanceId);
    this.clearExpiry(normalizedPlayerId);
    this.expiredBindings.delete(normalizedPlayerId);
    this.requeueAttemptsByPlayerId.delete(normalizedPlayerId);
    this.expiredBindingDeadLetter.delete(normalizedPlayerId);
    this.bindingBySessionId.delete(binding.sessionId);
    if (binding.socketId) {
      this.bindingBySocketId.delete(binding.socketId);
      if (binding.instanceId) {
        this.leaveSocketInstanceRoom(binding.socketId, binding.instanceId);
      }
      const socket = this.socketsById.get(binding.socketId) ?? null;
      this.socketsById.delete(binding.socketId);
      if (socket) {
        socket.emit(S2C.Kick, { reason });
        socket.disconnect(true);
      }
    }
    this.purgedPlayerIds.add(normalizedPlayerId);
    return true;
  }

  purgeAllSessions(reason = 'removed'): string[] {
    const playerIds = Array.from(this.bindingByPlayerId.keys());
    for (const playerId of playerIds) {
      this.purgePlayerSession(playerId, reason);
    }
    return playerIds;
  }

  private createSessionId(playerId: string): string {
    const sequence = this.nextSessionSequence++;
    return `${playerId}:${Date.now().toString(36)}:${sequence.toString(36)}`;
  }

  private scheduleExpiry(binding: WorldSessionBinding): void {
    this.clearExpiry(binding.playerId);
    const delay = Math.max(0, (binding.expireAt ?? Date.now()) - Date.now());
    const timer = setTimeout(() => {
      const current = this.bindingByPlayerId.get(binding.playerId);
      if (!current || current.connected || current.expireAt !== binding.expireAt) {
        return;
      }
      this.bindingByPlayerId.delete(binding.playerId);
      this.bindingBySessionId.delete(current.sessionId);
      this.expiredBindings.set(binding.playerId, current);
      this.expiryTimerByPlayerId.delete(binding.playerId);
    }, delay);
    timer.unref();
    this.expiryTimerByPlayerId.set(binding.playerId, timer);
  }

  private clearExpiry(playerId: string): void {
    const timer = this.expiryTimerByPlayerId.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimerByPlayerId.delete(playerId);
    }
  }

  private addPlayerToInstanceIndex(playerId: string, instanceId: string | null | undefined): void {
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!playerId || !normalizedInstanceId) {
      return;
    }
    let playerIds = this.playerIdsByInstanceId.get(normalizedInstanceId);
    if (!playerIds) {
      playerIds = new Set<string>();
      this.playerIdsByInstanceId.set(normalizedInstanceId, playerIds);
    }
    playerIds.add(playerId);
  }

  private removePlayerFromInstanceIndex(playerId: string, instanceId: string | null | undefined): void {
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!playerId || !normalizedInstanceId) {
      return;
    }
    const playerIds = this.playerIdsByInstanceId.get(normalizedInstanceId);
    if (!playerIds) {
      return;
    }
    playerIds.delete(playerId);
    if (playerIds.size <= 0) {
      this.playerIdsByInstanceId.delete(normalizedInstanceId);
    }
  }

  private joinSocketInstanceRoom(socketId: string, instanceId: string | null | undefined): void {
    const socket = this.socketsById.get(socketId);
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!socket || !normalizedInstanceId || typeof socket.join !== 'function') {
      return;
    }
    void socket.join(buildWorldInstanceRoomId(normalizedInstanceId));
  }

  private leaveSocketInstanceRoom(socketId: string, instanceId: string | null | undefined): void {
    const socket = this.socketsById.get(socketId);
    const normalizedInstanceId = normalizeInstanceId(instanceId);
    if (!socket || !normalizedInstanceId || typeof socket.leave !== 'function') {
      return;
    }
    void socket.leave(buildWorldInstanceRoomId(normalizedInstanceId));
  }
}

function normalizeInstanceId(instanceId: unknown): string | null {
  if (typeof instanceId !== 'string') {
    return null;
  }
  const normalized = instanceId.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeSessionEpoch(sessionEpoch: unknown): number | null {
  const normalizedSessionEpoch = Number(sessionEpoch);
  if (!Number.isFinite(normalizedSessionEpoch) || normalizedSessionEpoch <= 0) {
    return null;
  }
  return Math.max(1, Math.trunc(normalizedSessionEpoch));
}

function formatRequeueLastError(error: unknown): string | null {
  if (error == null) {
    return null;
  }
  if (error instanceof Error) {
    return error.message || error.name || 'Error';
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  }
  catch {
    return String(error);
  }
}
