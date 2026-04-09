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
/** 默认会话断开过期时间（毫秒）：15秒 */
const DEFAULT_SESSION_DETACH_EXPIRE_MS = 15_000;
/**
 * 从环境变量解析会话断开过期时间
 * @returns 会话断开过期时间（毫秒）
 */
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
    /** 会话ID绑定缓存：sessionId -> SessionBinding */
    bindingBySessionId = new Map();
    /** 玩家过期定时器缓存：playerId -> Timer */
    expiryTimerByPlayerId = new Map();
    /** 已过期的会话绑定：playerId -> SessionBinding */
    expiredBindings = new Map();
    
    // ==================== 清理管理 ====================
    /** 已清理的玩家ID集合 */
    purgedPlayerIds = new Set();
    
    // ==================== 会话序列 ====================
    /** 下一个会话序列号 */
    nextSessionSequence = 1;
    /** 下一个访客玩家序列号 */
    nextGuestPlayerSequence = 1;
    /** 会话断开过期时间（毫秒） */
    sessionDetachExpireMs = resolveSessionDetachExpireMs();
    /**
     * 注册WebSocket连接
     * @param client WebSocket客户端实例
     * @param playerId 玩家ID
     * @param requestedSessionId 请求的会话ID（可选）
     * @param options 注册选项
     * @returns 新的会话绑定
     */
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
    /**
     * 注销WebSocket连接
     * @param socketId 要注销的Socket ID
     * @returns 断开连接后的会话绑定，如果不存在则返回null
     */
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
    /**
     * 获取玩家会话绑定
     * @param playerId 玩家ID
     * @returns 会话绑定，如果不存在则返回null
     */
    getBinding(playerId) {
        return this.bindingByPlayerId.get(playerId) ?? null;
    }
    /**
     * 根据会话ID获取会话绑定
     * @param sessionId 会话ID
     * @returns 会话绑定，如果不存在则返回null
     */
    getBindingBySessionId(sessionId) {
        const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
        if (!normalizedSessionId) {
            return null;
        }
        return this.bindingBySessionId.get(normalizedSessionId) ?? null;
    }
    /**
     * 根据会话ID获取已断开的会话绑定
     * @param sessionId 会话ID
     * @returns 已断开的会话绑定，如果不存在或已连接则返回null
     */
    getDetachedBindingBySessionId(sessionId) {
        const binding = this.getBindingBySessionId(sessionId);
        if (!binding || binding.connected === true) {
            return null;
        }
        return binding;
    }
    /**
     * 根据Socket ID获取会话绑定
     * @param socketId Socket ID
     * @returns 会话绑定，如果不存在则返回null
     */
    getBindingBySocketId(socketId) {
        return this.bindingBySocketId.get(socketId) ?? null;
    }
    /**
     * 创建访客玩家ID
     * @returns 新的访客玩家ID
     */
    createGuestPlayerId() {
        const sequence = this.nextGuestPlayerSequence++;
        return `guest_${Date.now().toString(36)}_${sequence.toString(36)}`;
    }
    /**
     * 根据玩家ID获取WebSocket连接
     * @param playerId 玩家ID
     * @returns WebSocket连接，如果不存在则返回null
     */
    getSocketByPlayerId(playerId) {
        const binding = this.bindingByPlayerId.get(playerId);
        return binding?.socketId ? (this.socketsById.get(binding.socketId) ?? null) : null;
    }
    /**
     * 列出所有已连接的会话绑定
     * @returns 已连接的会话绑定数组
     */
    listBindings() {
        return Array.from(this.bindingByPlayerId.values()).filter((binding) => binding.connected);
    }
    /**
     * 消费所有已过期的会话绑定
     * @returns 已过期的会话绑定数组
     */
    consumeExpiredBindings() {
        const bindings = Array.from(this.expiredBindings.values());
        this.expiredBindings.clear();
        return bindings;
    }
    /**
     * 重新排队已过期的会话绑定
     * @param binding 会话绑定
     * @returns 是否成功重新排队
     */
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
    /**
     * 消费所有已清理的玩家ID
     * @returns 已清理的玩家ID数组
     */
    consumePurgedPlayerIds() {
        const playerIds = Array.from(this.purgedPlayerIds);
        this.purgedPlayerIds.clear();
        return playerIds;
    }
    /**
     * 清理玩家会话
     * @param playerId 玩家ID
     * @param reason 清理原因，默认为'removed'
     * @returns 是否成功清理
     */
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
    /**
     * 清理所有会话
     * @param reason 清理原因，默认为'removed'
     * @returns 被清理的玩家ID数组
     */
    purgeAllSessions(reason = 'removed') {
        const playerIds = Array.from(this.bindingByPlayerId.keys());
        for (const playerId of playerIds) {
            this.purgePlayerSession(playerId, reason);
        }
        return playerIds;
    }
    /**
     * 创建会话ID
     * @param playerId 玩家ID
     * @returns 新的会话ID
     */
    createSessionId(playerId) {
        const sequence = this.nextSessionSequence++;
        return `${playerId}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    }
    /**
     * 安排会话过期定时器
     * @param binding 会话绑定
     */
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
    /**
     * 清除会话过期定时器
     * @param playerId 玩家ID
     */
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
