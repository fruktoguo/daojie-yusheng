"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeGmStateService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** os：定义该变量以承载业务值。 */
const os = require("os");
/** legacy_protocol_env_1：定义该变量以承载业务值。 */
const legacy_protocol_env_1 = require("../../network/legacy-protocol.env");
/** world_session_service_1：定义该变量以承载业务值。 */
const world_session_service_1 = require("../../network/world-session.service");
/** map_template_repository_1：定义该变量以承载业务值。 */
const map_template_repository_1 = require("../map/map-template.repository");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../player/player-runtime.service");
/** world_runtime_service_1：定义该变量以承载业务值。 */
const world_runtime_service_1 = require("../world/world-runtime.service");
/** legacy_gm_compat_constants_1：定义该变量以承载业务值。 */
const legacy_gm_compat_constants_1 = require("../../compat/legacy/legacy-gm-compat.constants");
/** EMPTY_CPU_BREAKDOWN：定义该变量以承载业务值。 */
const EMPTY_CPU_BREAKDOWN = [];
/** EMPTY_NETWORK_BUCKETS：定义该变量以承载业务值。 */
const EMPTY_NETWORK_BUCKETS = [];
/** EMPTY_PATHFINDING_FAILURES：定义该变量以承载业务值。 */
const EMPTY_PATHFINDING_FAILURES = [];
/** RuntimeGmStateService：定义该变量以承载业务值。 */
let RuntimeGmStateService = class RuntimeGmStateService {
    mapTemplateRepository;
    playerRuntimeService;
    worldRuntimeService;
    worldSessionService;
    pendingStatePushPlayerIds = new Set();
/** 构造函数：执行实例初始化流程。 */
    constructor(mapTemplateRepository, playerRuntimeService, worldRuntimeService, worldSessionService) {
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
    }
/** emitState：执行对应的业务逻辑。 */
    emitState(client) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.buildState();
        client.emit(this.getGmStateEvent(client), payload);
    }
/** queueStatePush：执行对应的业务逻辑。 */
    queueStatePush(playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.pendingStatePushPlayerIds.add(normalizedPlayerId);
    }
/** flushQueuedStatePushes：执行对应的业务逻辑。 */
    flushQueuedStatePushes() {
        if (this.pendingStatePushPlayerIds.size === 0) {
            return;
        }
/** targets：定义该变量以承载业务值。 */
        const targets = Array.from(this.pendingStatePushPlayerIds);
        this.pendingStatePushPlayerIds.clear();
/** payload：定义该变量以承载业务值。 */
        const payload = this.buildState();
        for (const playerId of targets) {
            const socket = this.worldSessionService.getSocketByPlayerId(playerId);
            if (!socket) {
                continue;
            }
            socket.emit(this.getGmStateEvent(socket), payload);
        }
    }
/** enqueueUpdatePlayer：执行对应的业务逻辑。 */
    enqueueUpdatePlayer(payload) {
        this.worldRuntimeService.enqueueLegacyGmUpdatePlayer(payload);
    }
/** enqueueResetPlayer：执行对应的业务逻辑。 */
    enqueueResetPlayer(playerId) {
        this.worldRuntimeService.enqueueLegacyGmResetPlayer(playerId);
    }
/** enqueueSpawnBots：执行对应的业务逻辑。 */
    enqueueSpawnBots(anchorPlayerId, count) {
        this.worldRuntimeService.enqueueLegacyGmSpawnBots(anchorPlayerId, count);
    }
/** enqueueRemoveBots：执行对应的业务逻辑。 */
    enqueueRemoveBots(playerIds, all) {
        this.worldRuntimeService.enqueueLegacyGmRemoveBots(playerIds, all);
    }
/** getGmStateEvent：执行对应的业务逻辑。 */
    getGmStateEvent(client) {
        return this.resolveGmStateEmission(client).emitLegacy ? shared_1.S2C.GmState : shared_1.NEXT_S2C.GmState;
    }
/** resolveGmStateEmission：执行对应的业务逻辑。 */
    resolveGmStateEmission(client) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.resolveEffectiveProtocol(client);
        return {
            protocol,
/** emitNext：定义该变量以承载业务值。 */
            emitNext: protocol !== 'legacy',
/** emitLegacy：定义该变量以承载业务值。 */
            emitLegacy: protocol === 'legacy',
        };
    }
/** getExplicitProtocol：执行对应的业务逻辑。 */
    getExplicitProtocol(client) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = client?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
/** resolveEffectiveProtocol：执行对应的业务逻辑。 */
    resolveEffectiveProtocol(client) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.getExplicitProtocol(client);
        if (protocol === 'legacy' && !(0, legacy_protocol_env_1.isLegacySocketProtocolEnabled)()) {
            return null;
        }
        return protocol;
    }
/** buildState：执行对应的业务逻辑。 */
    buildState() {
/** mapNamesById：定义该变量以承载业务值。 */
        const mapNamesById = new Map(this.mapTemplateRepository.listSummaries().map((entry) => [entry.id, entry.name]));
/** players：定义该变量以承载业务值。 */
        const players = this.playerRuntimeService
            .listPlayerSnapshots()
            .map((player) => {
/** mapId：定义该变量以承载业务值。 */
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
/** dead：定义该变量以承载业务值。 */
                dead: player.hp <= 0,
/** autoBattle：定义该变量以承载业务值。 */
                autoBattle: player.combat.autoBattle === true,
                isBot: (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(player.playerId),
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
/** buildPerformanceSnapshot：执行对应的业务逻辑。 */
    buildPerformanceSnapshot() {
/** summary：定义该变量以承载业务值。 */
        const summary = this.worldRuntimeService.getRuntimeSummary();
/** loadAvg：定义该变量以承载业务值。 */
        const loadAvg = os.loadavg();
/** memoryUsage：定义该变量以承载业务值。 */
        const memoryUsage = process.memoryUsage();
/** resourceUsage：定义该变量以承载业务值。 */
        const resourceUsage = process.resourceUsage();
/** processUptimeSec：定义该变量以承载业务值。 */
        const processUptimeSec = process.uptime();
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
/** sharedGmStatePerf：定义该变量以承载业务值。 */
        const sharedGmStatePerf = this.buildSharedGmStatePerf();
/** tickAvgMs：定义该变量以承载业务值。 */
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
/** buildSharedGmStatePerf：执行对应的业务逻辑。 */
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
/** roundMetric：执行对应的业务逻辑。 */
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
/** bytesToMb：执行对应的业务逻辑。 */
function bytesToMb(value) {
    return roundMetric(value / (1024 * 1024));
}
