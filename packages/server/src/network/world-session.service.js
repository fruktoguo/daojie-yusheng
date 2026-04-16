"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSessionService = exports.WORLD_SESSION_CONTRACT = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const DEFAULT_SESSION_DETACH_EXPIRE_MS = 15_000;

const MAX_REQUESTED_SESSION_ID_LENGTH = 128;

const WORLD_SESSION_CONTRACT = Object.freeze({
    sourceOfTruth: 'single_process_memory',
    connectedReuse: 'reuse_current_session_only_when_allowConnectedSessionReuse',
    detachedResume: 'implicit_or_requested_within_detach_window',
    detachExpireEnvKey: 'SERVER_NEXT_SESSION_DETACH_EXPIRE_MS',
    zeroExpireBehavior: 'expire_immediately_and_enqueue_for_reaper',
});
exports.WORLD_SESSION_CONTRACT = WORLD_SESSION_CONTRACT;

/** 世界会话管理入口：管理 socket 与 player 绑定、会话恢复、断线回收。 */
function resolveSessionDetachExpireMs() {

    const raw = process.env.SERVER_NEXT_SESSION_DETACH_EXPIRE_MS;

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.trunc(parsed));
    }
    return DEFAULT_SESSION_DETACH_EXPIRE_MS;
}

/** 清洗客户端提交的 sessionId，限制长度与合法字符。 */
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
    /** socketId -> Socket 实例，供断线清理和广播回查。 */
    socketsById = new Map();
    /** socketId -> 会话绑定。 */
    bindingBySocketId = new Map();
    /** playerId -> 当前会话绑定。 */
    bindingByPlayerId = new Map();
    /** sessionId -> 当前或保留中的会话绑定。 */
    bindingBySessionId = new Map();
    /** playerId -> 过期回收定时器。 */
    expiryTimerByPlayerId = new Map();
    /** 已过期但尚未消费的绑定集合。 */
    expiredBindings = new Map();
    /** 已被主动 purge 的玩家集合。 */
    purgedPlayerIds = new Set();
    /** 递增会话序号，用于生成稳定且可读的 sessionId。 */
    nextSessionSequence = 1;
    /** guest 玩家序号，保证临时身份可唯一区分。 */
    nextGuestPlayerSequence = 1;
    /** 断线保留窗口时长。 */
    sessionDetachExpireMs = resolveSessionDetachExpireMs();

    /** 注册 socket 与 player 绑定，支持断线重连恢复与连接替换。 */
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

    /** 查询玩家当前会话绑定（含在线与离线）。 */
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

    /** 查询断线状态下仍在保留窗口内的会话。 */
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

    /** 查询 socket 对应绑定，供 socket 事件入口做身份映射。 */
    getBindingBySocketId(socketId) {
        return this.bindingBySocketId.get(socketId) ?? null;
    }

    /** 生产 guest 身份。 */
    createGuestPlayerId() {

        const sequence = this.nextGuestPlayerSequence++;
        return `guest_${Date.now().toString(36)}_${sequence.toString(36)}`;
    }

    /** 判断 playerId 是否为临时 guest 账号。 */
    isGuestPlayerId(playerId) {
        return typeof playerId === 'string' && playerId.trim().startsWith('guest_');
    }

    /** 根据 playerId 获取当前 socket，未在线则返回 null。 */
    getSocketByPlayerId(playerId) {

        const binding = this.bindingByPlayerId.get(playerId);
        return binding?.socketId ? (this.socketsById.get(binding.socketId) ?? null) : null;
    }

    /** 列出当前在线会话绑定。 */
    listBindings() {
        return Array.from(this.bindingByPlayerId.values()).filter((binding) => binding.connected);
    }

    /** 消费并清空已回收会话集合。 */
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

    /** 消费并清空被 purge 的玩家集合。 */
    consumePurgedPlayerIds() {

        const playerIds = Array.from(this.purgedPlayerIds);
        this.purgedPlayerIds.clear();
        return playerIds;
    }

    /** 按 playerId 强制 purge 会话并可选记录关闭原因。 */
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

    /** 统一清理所有会话，用于重启切换或管理员命令。 */
    purgeAllSessions(reason = 'removed') {

        const playerIds = Array.from(this.bindingByPlayerId.keys());
        for (const playerId of playerIds) {
            this.purgePlayerSession(playerId, reason);
        }
        return playerIds;
    }

    /** 生成新的 sessionId（按 playerId + 时间 + sequence）。 */
    createSessionId(playerId) {

        const sequence = this.nextSessionSequence++;
        return `${playerId}:${Date.now().toString(36)}:${sequence.toString(36)}`;
    }

    /** 为断线会话建立过期计时，过期后进入待回收列表。 */
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
