"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** DEFAULT_SESSION_DETACH_EXPIRE_MS：定义该变量以承载业务值。 */
const DEFAULT_SESSION_DETACH_EXPIRE_MS = 15_000;
/** MAX_REQUESTED_SESSION_ID_LENGTH：定义该变量以承载业务值。 */
const MAX_REQUESTED_SESSION_ID_LENGTH = 128;
/** resolveSessionDetachExpireMs：执行对应的业务逻辑。 */
function resolveSessionDetachExpireMs() {
/** raw：定义该变量以承载业务值。 */
    const raw = process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS;
/** parsed：定义该变量以承载业务值。 */
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
    }
    return DEFAULT_SESSION_DETACH_EXPIRE_MS;
}
/** sanitizeRequestedSessionId：执行对应的业务逻辑。 */
function sanitizeRequestedSessionId(rawSessionId) {
    if (typeof rawSessionId !== 'string') {
        return '';
    }
/** normalizedSessionId：定义该变量以承载业务值。 */
    const normalizedSessionId = rawSessionId.trim();
    if (!normalizedSessionId || normalizedSessionId.length > MAX_REQUESTED_SESSION_ID_LENGTH) {
        return '';
    }
    if (!/^[A-Za-z0-9:_-]+$/.test(normalizedSessionId)) {
        return '';
    }
    return normalizedSessionId;
}
/** WorldSessionService：定义该变量以承载业务值。 */
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
/** registerSocket：执行对应的业务逻辑。 */
    registerSocket(client, playerId, requestedSessionId, options = undefined) {
        this.socketsById.set(client.id, client);
/** previous：定义该变量以承载业务值。 */
        const previous = this.bindingByPlayerId.get(playerId);
/** requested：定义该变量以承载业务值。 */
        const requested = sanitizeRequestedSessionId(requestedSessionId);
/** hasDetachedBinding：定义该变量以承载业务值。 */
        const hasDetachedBinding = previous && !previous.connected;
/** allowImplicitDetachedResume：定义该变量以承载业务值。 */
        const allowImplicitDetachedResume = options?.allowImplicitDetachedResume !== false;
/** allowRequestedDetachedResume：定义该变量以承载业务值。 */
        const allowRequestedDetachedResume = options?.allowRequestedDetachedResume !== false;
/** allowConnectedSessionReuse：定义该变量以承载业务值。 */
        const allowConnectedSessionReuse = options?.allowConnectedSessionReuse !== false;
/** resumeMatched：定义该变量以承载业务值。 */
        const resumeMatched = hasDetachedBinding && (requested
            ? allowRequestedDetachedResume && requested === previous.sessionId
            : allowImplicitDetachedResume);
/** reuseConnectedSession：定义该变量以承载业务值。 */
        const reuseConnectedSession = previous?.connected === true
            && allowConnectedSessionReuse
            && (!requested || requested === previous.sessionId);
/** sessionId：定义该变量以承载业务值。 */
        const sessionId = resumeMatched
            ? previous.sessionId
            : reuseConnectedSession
                ? previous.sessionId
                : this.createSessionId(playerId);
/** binding：定义该变量以承载业务值。 */
        const binding = {
            playerId,
            sessionId,
            socketId: client.id,
/** resumed：定义该变量以承载业务值。 */
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
/** previousSocket：定义该变量以承载业务值。 */
            const previousSocket = this.socketsById.get(previous.socketId);
            if (previousSocket) {
                previousSocket.emit(shared_1.NEXT_S2C.Kick, { reason: 'replaced' });
                previousSocket.disconnect(true);
            }
        }
        return binding;
    }
/** unregisterSocket：执行对应的业务逻辑。 */
    unregisterSocket(socketId) {
        this.socketsById.delete(socketId);
/** binding：定义该变量以承载业务值。 */
        const binding = this.bindingBySocketId.get(socketId);
        if (!binding) {
            return null;
        }
        this.bindingBySocketId.delete(socketId);
/** current：定义该变量以承载业务值。 */
        const current = this.bindingByPlayerId.get(binding.playerId);
        if (!current || current.socketId !== socketId) {
            return null;
        }
/** detachedAt：定义该变量以承载业务值。 */
        const detachedAt = Date.now();
/** detachedBinding：定义该变量以承载业务值。 */
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
/** getBinding：执行对应的业务逻辑。 */
    getBinding(playerId) {
        return this.bindingByPlayerId.get(playerId) ?? null;
    }
/** getBindingBySessionId：执行对应的业务逻辑。 */
    getBindingBySessionId(sessionId) {
/** normalizedSessionId：定义该变量以承载业务值。 */
        const normalizedSessionId = sanitizeRequestedSessionId(sessionId);
        if (!normalizedSessionId) {
            return null;
        }
        return this.bindingBySessionId.get(normalizedSessionId) ?? null;
    }
/** getDetachedBindingBySessionId：执行对应的业务逻辑。 */
    getDetachedBindingBySessionId(sessionId) {
/** binding：定义该变量以承载业务值。 */
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
/** getBindingBySocketId：执行对应的业务逻辑。 */
    getBindingBySocketId(socketId) {
        return this.bindingBySocketId.get(socketId) ?? null;
    }
/** createGuestPlayerId：执行对应的业务逻辑。 */
    createGuestPlayerId() {
/** sequence：定义该变量以承载业务值。 */
        const sequence = this.nextGuestPlayerSequence++;
        return `guest_${Date.now().toString(36)}_${sequence.toString(36)}`;
    }
/** isGuestPlayerId：执行对应的业务逻辑。 */
    isGuestPlayerId(playerId) {
        return typeof playerId === 'string' && playerId.trim().startsWith('guest_');
    }
/** getSocketByPlayerId：执行对应的业务逻辑。 */
    getSocketByPlayerId(playerId) {
/** binding：定义该变量以承载业务值。 */
        const binding = this.bindingByPlayerId.get(playerId);
        return binding?.socketId ? (this.socketsById.get(binding.socketId) ?? null) : null;
    }
/** listBindings：执行对应的业务逻辑。 */
    listBindings() {
        return Array.from(this.bindingByPlayerId.values()).filter((binding) => binding.connected);
    }
/** consumeExpiredBindings：执行对应的业务逻辑。 */
    consumeExpiredBindings() {
/** bindings：定义该变量以承载业务值。 */
        const bindings = Array.from(this.expiredBindings.values());
        this.expiredBindings.clear();
        return bindings;
    }
/** requeueExpiredBinding：执行对应的业务逻辑。 */
    requeueExpiredBinding(binding) {
/** playerId：定义该变量以承载业务值。 */
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
/** consumePurgedPlayerIds：执行对应的业务逻辑。 */
    consumePurgedPlayerIds() {
/** playerIds：定义该变量以承载业务值。 */
        const playerIds = Array.from(this.purgedPlayerIds);
        this.purgedPlayerIds.clear();
        return playerIds;
    }
/** purgePlayerSession：执行对应的业务逻辑。 */
    purgePlayerSession(playerId, reason = 'removed') {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return false;
        }
/** binding：定义该变量以承载业务值。 */
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
/** socket：定义该变量以承载业务值。 */
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
/** purgeAllSessions：执行对应的业务逻辑。 */
    purgeAllSessions(reason = 'removed') {
/** playerIds：定义该变量以承载业务值。 */
        const playerIds = Array.from(this.bindingByPlayerId.keys());
        for (const playerId of playerIds) {
            this.purgePlayerSession(playerId, reason);
        }
        return playerIds;
    }
/** createSessionId：执行对应的业务逻辑。 */
    createSessionId(playerId) {
/** sequence：定义该变量以承载业务值。 */
        const sequence = this.nextSessionSequence++;
        return `${playerId}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    }
/** scheduleExpiry：执行对应的业务逻辑。 */
    scheduleExpiry(binding) {
        this.clearExpiry(binding.playerId);
/** delay：定义该变量以承载业务值。 */
        const delay = Math.max(0, (binding.expireAt ?? Date.now()) - Date.now());
/** timer：定义该变量以承载业务值。 */
        const timer = setTimeout(() => {
/** current：定义该变量以承载业务值。 */
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
/** clearExpiry：执行对应的业务逻辑。 */
    clearExpiry(playerId) {
/** timer：定义该变量以承载业务值。 */
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
