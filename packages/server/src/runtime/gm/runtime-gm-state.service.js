"use strict";
/** GM 状态聚合器：把玩家、地图与运行时性能信息拼成 GM 面板快照。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeGmStateService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const os = require("os");

const next_gm_contract_1 = require("../../http/next/next-gm-contract");

const world_session_service_1 = require("../../network/world-session.service");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_service_1 = require("../world/world-runtime.service");

const next_gm_constants_1 = require("../../http/next/next-gm.constants");

const EMPTY_CPU_BREAKDOWN = [];

const EMPTY_NETWORK_BUCKETS = [];

const EMPTY_PATHFINDING_FAILURES = [];

let RuntimeGmStateService = class RuntimeGmStateService {
    /** 地图模板仓库，用于把地图 ID 还原成可读名称。 */
    mapTemplateRepository;
    /** 玩家运行时仓库，提供在线玩家快照。 */
    playerRuntimeService;
    /** 世界运行时，提供 tick 与路径规划性能摘要。 */
    worldRuntimeService;
    /** 当前在线连接映射，供状态推送时按玩家查 socket。 */
    worldSessionService;
    /** 等待下次 flush 的 GM 状态推送目标。 */
    pendingStatePushPlayerIds = new Set();
    /** 缓存依赖并接入 GM 状态推送链路。 */
    constructor(mapTemplateRepository, playerRuntimeService, worldRuntimeService, worldSessionService) {
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
    }
    /** 立即向单个客户端下发 GM 状态快照。 */
    emitState(client) {

        const payload = this.buildState();
        client.emit(this.getGmStateEvent(client), payload);
    }
    /** 标记某个玩家下次需要收到 GM 面板刷新。 */
    queueStatePush(playerId) {

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.pendingStatePushPlayerIds.add(normalizedPlayerId);
    }
    /** 批量把待推送的 GM 面板状态发给在线客户端。 */
    flushQueuedStatePushes() {
        if (this.pendingStatePushPlayerIds.size === 0) {
            return;
        }

        const targets = Array.from(this.pendingStatePushPlayerIds);
        this.pendingStatePushPlayerIds.clear();

        const payload = this.buildState();
        for (const playerId of targets) {
            const socket = this.worldSessionService.getSocketByPlayerId(playerId);
            if (!socket) {
                continue;
            }
            socket.emit(this.getGmStateEvent(socket), payload);
        }
    }
    /** 把 GM 的玩家变更请求转交给 world runtime 统一处理。 */
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.worldRuntimeService.enqueueGmUpdatePlayer(payload);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的玩家重置请求转交给 world runtime。 */
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.worldRuntimeService.enqueueGmResetPlayer(playerId);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的刷怪请求转交给 world runtime。 */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.worldRuntimeService.enqueueGmSpawnBots(requesterPlayerId, count);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的批量删 bot 请求转交给 world runtime。 */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.worldRuntimeService.enqueueGmRemoveBots(playerIds, all);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** GM mutation 成功入队后，统一决定是否刷新 GM 面板状态。 */
    queueMutationStatePush(requesterPlayerId) {
        if (!next_gm_contract_1.NEXT_GM_SOCKET_CONTRACT.pushStateAfterMutation) {
            return;
        }
        this.queueStatePush(requesterPlayerId);
    }
    /** GM 状态下发固定收敛到 next 事件。 */
    getGmStateEvent(client) {
        return shared_1.NEXT_S2C.GmState;
    }
    /** GM 面板协议分支固定为 next-only。 */
    resolveGmStateEmission(client) {
        return {
            protocol: 'next',
            emitNext: true,
            emitLegacy: false,
        };
    }
    /** 读取客户端显式声明的协议版本，仅用于调试观测。 */
    getExplicitProtocol(client) {
        const protocol = client?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
    /** GM 状态最终协议固定收敛到 next。 */
    resolveEffectiveProtocol(client) {
        return 'next';
    }
    /** 汇总在线玩家、地图列表和性能数据，生成 GM 面板快照。 */
    buildState() {

        const mapNamesById = new Map(this.mapTemplateRepository.listSummaries().map((entry) => [entry.id, entry.name]));

        const players = this.playerRuntimeService
            .listPlayerSnapshots()
            .map((player) => {

            const mapId = typeof player.templateId === 'string' ? player.templateId : '';
            return {
                id: player.playerId,
                name: player.name,
                roleName: player.name,
                displayName: player.displayName,
                accountName: undefined,
                mapId,
                mapName: mapNamesById.get(mapId) ?? mapId,
                x: Math.trunc(player.x),
                y: Math.trunc(player.y),
                hp: Math.trunc(player.hp),
                maxHp: Math.trunc(player.maxHp),

                dead: player.hp <= 0,

                autoBattle: player.combat.autoBattle === true,
                isBot: (0, next_gm_constants_1.isNextGmBotPlayerId)(player.playerId),
            };
        })
            .sort((left, right) => {
            if (left.isBot !== right.isBot) {
                return left.isBot ? 1 : -1;
            }
            if (left.mapName !== right.mapName) {
                return left.mapName.localeCompare(right.mapName, 'zh-Hans-CN');
            }
            return left.roleName.localeCompare(right.roleName, 'zh-Hans-CN');
        });
        return {
            players,
            mapIds: this.mapTemplateRepository.listSummaries().map((entry) => entry.id).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
            botCount: players.reduce((count, player) => count + (player.isBot ? 1 : 0), 0),
            perf: this.buildPerformanceSnapshot(),
        };
    }
    buildPerformanceSnapshot() {

        const summary = this.worldRuntimeService.getRuntimeSummary();

        const loadAvg = os.loadavg();

        const memoryUsage = process.memoryUsage();

        const resourceUsage = process.resourceUsage();

        const processUptimeSec = process.uptime();

        const now = Date.now();

        const sharedGmStatePerf = this.buildSharedGmStatePerf();

        const tickAvgMs = summary.tickPerf?.totalMs?.avg60 ?? summary.lastTickDurationMs;
        return {
            cpuPercent: 0,
            memoryMb: bytesToMb(memoryUsage.rss),
            tickMs: summary.lastTickDurationMs,
            tick: {
                lastMapId: null,
                lastMs: summary.lastTickDurationMs,
                windowElapsedSec: 0,
                windowTickCount: 0,
                windowTotalMs: 0,
                windowAvgMs: tickAvgMs,
                windowBusyPercent: roundMetric(Math.max(0, Math.min(100, (tickAvgMs / 1000) * 100))),
            },
            cpu: {
                cores: os.cpus().length,
                loadAvg1m: roundMetric(loadAvg[0] ?? 0),
                loadAvg5m: roundMetric(loadAvg[1] ?? 0),
                loadAvg15m: roundMetric(loadAvg[2] ?? 0),
                processUptimeSec: roundMetric(processUptimeSec),
                systemUptimeSec: roundMetric(os.uptime()),
                userCpuMs: roundMetric(resourceUsage.userCPUTime / 1000),
                systemCpuMs: roundMetric(resourceUsage.systemCPUTime / 1000),
                rssMb: bytesToMb(memoryUsage.rss),
                heapUsedMb: bytesToMb(memoryUsage.heapUsed),
                heapTotalMb: bytesToMb(memoryUsage.heapTotal),
                externalMb: bytesToMb(memoryUsage.external),
                profileStartedAt: Math.max(0, now - Math.round(processUptimeSec * 1000)),
                profileElapsedSec: roundMetric(processUptimeSec),
                breakdown: EMPTY_CPU_BREAKDOWN,
            },
            pathfinding: {
                statsStartedAt: now,
                statsElapsedSec: 0,
                ...sharedGmStatePerf,
                enqueued: 0,
                dispatched: 0,
                completed: 0,
                succeeded: 0,
                failed: 0,
                cancelled: 0,
                droppedPending: 0,
                droppedStaleResults: 0,
                avgQueueMs: 0,
                maxQueueMs: 0,
                avgRunMs: 0,
                maxRunMs: 0,
                avgExpandedNodes: 0,
                maxExpandedNodes: 0,
                failureReasons: EMPTY_PATHFINDING_FAILURES,
            },
            networkStatsStartedAt: now,
            networkStatsElapsedSec: 0,
            networkInBytes: 0,
            networkOutBytes: 0,
            networkInBuckets: EMPTY_NETWORK_BUCKETS,
            networkOutBuckets: EMPTY_NETWORK_BUCKETS,
        };
    }
    buildSharedGmStatePerf() {
        return {
            workerCount: 0,
            runningWorkers: 0,
            idleWorkers: 0,
            peakRunningWorkers: 0,
            queueDepth: 0,
            peakQueueDepth: 0,
        };
    }
};
exports.RuntimeGmStateService = RuntimeGmStateService;
exports.RuntimeGmStateService = RuntimeGmStateService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        world_runtime_service_1.WorldRuntimeService,
        world_session_service_1.WorldSessionService])
], RuntimeGmStateService);
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
function bytesToMb(value) {
    return roundMetric(value / (1024 * 1024));
}
