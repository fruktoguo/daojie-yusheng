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
}

export interface WorldSessionBinding {
  playerId: string;
  sessionId: string;
  socketId: string | null;
  resumed: boolean;
  connected: boolean;
  detachedAt: number | null;
  expireAt: number | null;
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
  private readonly expiryTimerByPlayerId = new Map<string, SessionTimer>();
  private readonly expiredBindings = new Map<string, WorldSessionBinding>();
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

    if (previous && previous.connected && previous.socketId && previous.socketId !== client.id) {
      this.bindingBySocketId.delete(previous.socketId);
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
    this.socketsById.delete(socketId);

    const binding = this.bindingBySocketId.get(socketId);
    if (!binding) {
      return null;
    }
    this.bindingBySocketId.delete(socketId);

    const current = this.bindingByPlayerId.get(binding.playerId);
    if (!current || current.socketId !== socketId) {
      return null;
    }

    const detachedAt = Date.now();
    const detachedBinding: WorldSessionBinding = {
      playerId: binding.playerId,
      sessionId: binding.sessionId,
      socketId: null,
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

  consumeExpiredBindings(): WorldSessionBinding[] {
    const bindings = Array.from(this.expiredBindings.values());
    this.expiredBindings.clear();
    return bindings;
  }

  requeueExpiredBinding(binding: Partial<WorldSessionBinding> | null | undefined): boolean {
    const playerId = typeof binding?.playerId === 'string' ? binding.playerId.trim() : '';
    const sessionId = typeof binding?.sessionId === 'string' ? binding.sessionId.trim() : '';
    if (!playerId || !sessionId || binding?.connected) {
      return false;
    }
    this.expiredBindings.set(playerId, {
      playerId,
      sessionId,
      socketId: null,
      resumed: false,
      connected: false,
      detachedAt: Number.isFinite(binding?.detachedAt) ? binding.detachedAt : Date.now(),
      expireAt: Number.isFinite(binding?.expireAt) ? binding.expireAt : Date.now(),
    });
    return true;
  }

  consumePurgedPlayerIds(): string[] {
    const playerIds = Array.from(this.purgedPlayerIds);
    this.purgedPlayerIds.clear();
    return playerIds;
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
      this.purgedPlayerIds.add(normalizedPlayerId);
      return false;
    }
    this.bindingByPlayerId.delete(normalizedPlayerId);
    this.clearExpiry(normalizedPlayerId);
    this.expiredBindings.delete(normalizedPlayerId);
    this.bindingBySessionId.delete(binding.sessionId);
    if (binding.socketId) {
      this.bindingBySocketId.delete(binding.socketId);
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
}
