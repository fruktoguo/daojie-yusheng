"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const DEFAULT_SESSION_DETACH_EXPIRE_MS = 15_000;
const MAX_REQUESTED_SESSION_ID_LENGTH = 128;
function resolveSessionDetachExpireMs() {
    const raw = process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
    }
    return DEFAULT_SESSION_DETACH_EXPIRE_MS;
}
function sanitizeRequestedSessionId(rawSessionId) {
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
let WorldSessionService = class WorldSessionService {
    socketsById = new Map();
    bindingBySocketId = new Map();
    bindingByPlayerId = new Map();
    bindingBySessionId = new Map();
    expiryTimerByPlayerId = new Map();
    expiredBindings = new Map();
    purgedPlayerIds = new Set();
    nextSessionSequence = 1;
    nextGuestPlayerSequence = 1;
    sessionDetachExpireMs = resolveSessionDetachExpireMs();
    registerSocket(client, playerId, requestedSessionId, options = undefined) {
        this.socketsById.set(client.id, client);
        const previous = this.bindingByPlayerId.get(playerId);
        const requested = sanitizeRequestedSessionId(requestedSessionId);
        const hasDetachedBinding = previous && !previous.connected;
        const allowImplicitDetachedResume = options?.allowImplicitDetachedResume !== false;
        const allowRequestedDetachedResume = options?.allowRequestedDetachedResume !== false;
        const allowConnectedSessionReuse = options?.allowConnectedSessionReuse !== false;
        const resumeMatched = hasDetachedBinding && (requested
            ? allowRequestedDetachedResume && requested === previous.sessionId
            : allowImplicitDetachedResume);
        const reuseConnectedSession = previous?.connected === true
            && allowConnectedSessionReuse
            && (!requested || requested === previous.sessionId);
        const sessionId = resumeMatched
            ? previous.sessionId
            : reuseConnectedSession
                ? previous.sessionId
                : this.createSessionId(playerId);
        const binding = {
            playerId,
            sessionId,
            socketId: client.id,
            resumed: resumeMatched === true,
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
                previousSocket.emit(shared_1.NEXT_S2C.Kick, { reason: 'replaced' });
                previousSocket.disconnect(true);
            }
        }
        return binding;
    }
    unregisterSocket(socketId) {
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
        const detachedBinding = {
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
    getBinding(playerId) {
        return this.bindingByPlayerId.get(playerId) ?? null;
    }
    getBindingBySessionId(sessionId) {
        const normalizedSessionId = sanitizeRequestedSessionId(sessionId);
        if (!normalizedSessionId) {
            return null;
        }
        return this.bindingBySessionId.get(normalizedSessionId) ?? null;
    }
    getDetachedBindingBySessionId(sessionId) {
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
    getBindingBySocketId(socketId) {
        return this.bindingBySocketId.get(socketId) ?? null;
    }
    createGuestPlayerId() {
        const sequence = this.nextGuestPlayerSequence++;
        return `guest_${Date.now().toString(36)}_${sequence.toString(36)}`;
    }
    isGuestPlayerId(playerId) {
        return typeof playerId === 'string' && playerId.trim().startsWith('guest_');
    }
    getSocketByPlayerId(playerId) {
        const binding = this.bindingByPlayerId.get(playerId);
        return binding?.socketId ? (this.socketsById.get(binding.socketId) ?? null) : null;
    }
    listBindings() {
        return Array.from(this.bindingByPlayerId.values()).filter((binding) => binding.connected);
    }
    consumeExpiredBindings() {
        const bindings = Array.from(this.expiredBindings.values());
        this.expiredBindings.clear();
        return bindings;
    }
    requeueExpiredBinding(binding) {
        const playerId = typeof binding?.playerId === 'string' ? binding.playerId.trim() : '';
        if (!playerId || binding?.connected) {
            return false;
        }
        this.expiredBindings.set(playerId, {
            ...binding,
            playerId,
            socketId: null,
            resumed: false,
            connected: false,
            detachedAt: Number.isFinite(binding?.detachedAt) ? binding.detachedAt : Date.now(),
            expireAt: Number.isFinite(binding?.expireAt) ? binding.expireAt : Date.now(),
        });
        return true;
    }
    consumePurgedPlayerIds() {
        const playerIds = Array.from(this.purgedPlayerIds);
        this.purgedPlayerIds.clear();
        return playerIds;
    }
    purgePlayerSession(playerId, reason = 'removed') {
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
                socket.emit(shared_1.NEXT_S2C.Kick, { reason });
                socket.disconnect(true);
            }
        }
        this.purgedPlayerIds.add(normalizedPlayerId);
        return true;
    }
    purgeAllSessions(reason = 'removed') {
        const playerIds = Array.from(this.bindingByPlayerId.keys());
        for (const playerId of playerIds) {
            this.purgePlayerSession(playerId, reason);
        }
        return playerIds;
    }
    createSessionId(playerId) {
        const sequence = this.nextSessionSequence++;
        return `${playerId}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    }
    scheduleExpiry(binding) {
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
    clearExpiry(playerId) {
        const timer = this.expiryTimerByPlayerId.get(playerId);
        if (timer) {
            clearTimeout(timer);
            this.expiryTimerByPlayerId.delete(playerId);
        }
    }
};
exports.WorldSessionService = WorldSessionService;
exports.WorldSessionService = WorldSessionService = __decorate([
    (0, common_1.Injectable)()
], WorldSessionService);
//# sourceMappingURL=world-session.service.js.map
