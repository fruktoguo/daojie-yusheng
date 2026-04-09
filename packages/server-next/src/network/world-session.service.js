"use strict";
/**
 * 世界会话服务
 * 
 * 负责管理玩家会话的生命周期，包括：
 * - WebSocket连接管理
 * - 会话绑定管理
 * - 会话过期处理
 * - 会话恢复
 * - 会话清理
 */
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
function resolveSessionDetachExpireMs() {
    const raw = process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
    }
    return DEFAULT_SESSION_DETACH_EXPIRE_MS;
}
let WorldSessionService = class WorldSessionService {
    // ==================== 会话管理 ====================
    /** WebSocket连接缓存：socketId -> Socket */
    socketsById = new Map();
    /** 会话绑定缓存：socketId -> SessionBinding */
    bindingBySocketId = new Map();
    /** 玩家会话绑定缓存：playerId -> SessionBinding */
    bindingByPlayerId = new Map();
    bindingBySessionId = new Map();
    expiryTimerByPlayerId = new Map();
    /** 已过期的会话绑定：playerId -> SessionBinding */
    expiredBindings = new Map();
    
    // ==================== 清理管理 ====================
    /** 已清理的玩家ID集合 */
    purgedPlayerIds = new Set();
    
    // ==================== 会话序列 ====================
    /** 下一个会话序列号 */
    nextSessionSequence = 1;
    nextGuestPlayerSequence = 1;
    sessionDetachExpireMs = resolveSessionDetachExpireMs();
    registerSocket(client, playerId, requestedSessionId, options = undefined) {
        this.socketsById.set(client.id, client);
        
        // 获取之前的会话绑定
        const previous = this.bindingByPlayerId.get(playerId);
        
        // 清理请求的会话ID
        const requested = requestedSessionId?.trim() || '';
        const hasDetachedBinding = previous && !previous.connected;
        const allowImplicitDetachedResume = options?.allowImplicitDetachedResume !== false;
        const allowRequestedDetachedResume = options?.allowRequestedDetachedResume !== false;
        const allowConnectedSessionReuse = options?.allowConnectedSessionReuse !== false;
        const resumeMatched = hasDetachedBinding && (requested
            ? allowRequestedDetachedResume && requested === previous.sessionId
            : allowImplicitDetachedResume);
        const reuseConnectedSession = previous?.connected === true && allowConnectedSessionReuse;
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
        
        // 清除过期定时器
        this.clearExpiry(playerId);
        
        // 移除过期绑定
        this.expiredBindings.delete(playerId);
        if (previous?.sessionId && previous.sessionId !== sessionId) {
            this.bindingBySessionId.delete(previous.sessionId);
        }
        this.bindingBySocketId.set(client.id, binding);
        this.bindingByPlayerId.set(playerId, binding);
        this.bindingBySessionId.set(sessionId, binding);
        if (previous && previous.connected && previous.socketId && previous.socketId !== client.id) {
            // 移除旧的会话绑定
            this.bindingBySocketId.delete(previous.socketId);
            
            // 获取之前的WebSocket连接
            const previousSocket = this.socketsById.get(previous.socketId);
            if (previousSocket) {
                // 发送踢出消息
                previousSocket.emit(shared_1.NEXT_S2C.Kick, { reason: 'replaced' });
                // 断开之前的连接
                previousSocket.disconnect(true);
            }
        }
        
        // 返回新的会话绑定
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
        this.bindingByPlayerId.set(binding.playerId, detachedBinding);
        this.bindingBySessionId.set(detachedBinding.sessionId, detachedBinding);
        this.scheduleExpiry(detachedBinding);
        return detachedBinding;
    }
    getBinding(playerId) {
        return this.bindingByPlayerId.get(playerId) ?? null;
    }
    getBindingBySessionId(sessionId) {
        const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
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
        return binding;
    }
    getBindingBySocketId(socketId) {
        return this.bindingBySocketId.get(socketId) ?? null;
    }
    createGuestPlayerId() {
        const sequence = this.nextGuestPlayerSequence++;
        return `guest_${Date.now().toString(36)}_${sequence.toString(36)}`;
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
