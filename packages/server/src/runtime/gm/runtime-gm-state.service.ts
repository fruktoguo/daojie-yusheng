// @ts-nocheck
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

const shared_1 = require("@mud/shared");

const os = require("os");
const v8 = require("v8");

const next_gm_contract_1 = require("../../http/native/native-gm-contract");

const world_session_service_1 = require("../../network/world-session.service");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_service_1 = require("../world/world-runtime.service");

const next_gm_constants_1 = require("../../http/native/native-gm.constants");

const EMPTY_CPU_BREAKDOWN = [];

const EMPTY_NETWORK_BUCKETS = [];

const EMPTY_PATHFINDING_FAILURES = [];
const EMPTY_MEMORY_ESTIMATE_DOMAINS = [];
const EMPTY_MEMORY_ESTIMATE_INSTANCES = [];
const MEMORY_ESTIMATE_CACHE_TTL_MS = 5000;
const MEMORY_ESTIMATE_TOP_INSTANCE_LIMIT = 8;
const LARGE_NETWORK_PAYLOAD_CAPTURE_THRESHOLD_BYTES = 1024;
const LARGE_NETWORK_PAYLOAD_SAMPLE_LIMIT = 5;
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);
const WORLD_DELTA_ENTITY_KEYS = Object.freeze(['p', 'm', 'n', 'o', 'g', 'c']);
const CPU_BREAKDOWN_LABELS = Object.freeze({
    pendingCommandsMs: '待处理命令',
    systemCommandsMs: '系统命令',
    instanceTicksMs: '实例 tick',
    transfersMs: '跨图迁移',
    monsterActionsMs: '怪物行为',
    playerAdvanceMs: '玩家推进',
    syncFlushMs: '同步广播',
    otherMs: '其余开销',
});
const C2S_NAME_BY_EVENT = buildProtocolNameByEvent(shared_1.C2S);
const S2C_NAME_BY_EVENT = buildProtocolNameByEvent(shared_1.S2C);

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
    /** 网络上行事件累计桶。 */
    networkInBucketByKey = new Map();
    /** 网络下行事件累计桶。 */
    networkOutBucketByKey = new Map();
    /** 最近一次 CPU 百分比采样的进程用时基线。 */
    lastCpuUsage = process.cpuUsage();
    /** 最近一次 CPU 百分比采样的单调时钟基线。 */
    lastCpuTime = process.hrtime.bigint();
    /** 最近一次运行态内存画像缓存。 */
    lastMemoryEstimate = null;
    /** 运行态内存画像缓存过期时间。 */
    lastMemoryEstimateExpiresAt = 0;
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.pendingStatePushPlayerIds.add(normalizedPlayerId);
    }
    /** 批量把待推送的 GM 面板状态发给在线客户端。 */
    flushQueuedStatePushes() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmUpdatePlayer(payload);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的玩家重置请求转交给 world runtime。 */
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmResetPlayer(playerId);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的刷怪请求转交给 world runtime。 */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmSpawnBots(requesterPlayerId, count);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** 把 GM 的批量删 bot 请求转交给 world runtime。 */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueGmRemoveBots(playerIds, all);
        this.queueMutationStatePush(requesterPlayerId);
    }
    /** GM mutation 成功入队后，统一决定是否刷新 GM 面板状态。 */
    queueMutationStatePush(requesterPlayerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!next_gm_contract_1.NATIVE_GM_SOCKET_CONTRACT.pushStateAfterMutation) {
            return;
        }
        this.queueStatePush(requesterPlayerId);
    }
    /** GM 状态下发固定收敛到主线事件。 */
    getGmStateEvent(client) {
        return shared_1.S2C.GmState;
    }
    /** GM 面板协议分支固定为主线唯一通道。 */
    resolveGmStateEmission(client) {
        return {
            protocol: 'mainline',
            emitMainline: true,
            emitLegacy: false,
        };
    }
    /** 读取客户端显式声明的协议版本，仅用于调试观测。 */
    getExplicitProtocol(client) {
        const protocol = client?.data?.protocol;
        return protocol === 'mainline' || protocol === 'legacy' ? protocol : null;
    }
    /** GM 状态最终协议固定收敛到主线。 */
    resolveEffectiveProtocol(client) {
        return 'mainline';
    }
    /** 记录客户端 -> 服务端的 socket 事件流量。 */
    recordNetworkIn(event, payload) {
        this.recordNetworkBucket(this.networkInBucketByKey, 'c2s', event, payload);
    }
    /** 记录服务端 -> 客户端的 socket 事件流量。 */
    recordNetworkOut(event, payload) {
        this.recordNetworkBucket(this.networkOutBucketByKey, 's2c', event, payload);
    }
    /** 清空累计网络统计。 */
    resetNetworkPerfCounters() {
        this.networkInBucketByKey.clear();
        this.networkOutBucketByKey.clear();
    }
    /** 重置 CPU 百分比采样基线，供 GM 面板重新起算。 */
    resetCpuPerfCounters() {
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuTime = process.hrtime.bigint();
    }
    /** 构建运行态内存估算画像，供 GM 面板定位主要占用来源。 */
    buildMemoryEstimate(summary, rssBytes) {

        const now = Date.now();
        if (this.lastMemoryEstimate && now < this.lastMemoryEstimateExpiresAt) {
            return this.lastMemoryEstimate;
        }

        const runtimePlayers = this.playerRuntimeService?.players instanceof Map
            ? this.playerRuntimeService.players
            : null;
        const pendingCombatEffectsByPlayerId = this.playerRuntimeService?.pendingCombatEffectsByPlayerId instanceof Map
            ? this.playerRuntimeService.pendingCombatEffectsByPlayerId
            : null;
        const playerLocations = this.worldRuntimeService?.worldRuntimePlayerLocationService?.playerLocations instanceof Map
            ? this.worldRuntimeService.worldRuntimePlayerLocationService.playerLocations
            : null;
        const sessionBindingsByPlayerId = this.worldSessionService?.bindingByPlayerId instanceof Map
            ? this.worldSessionService.bindingByPlayerId
            : null;
        const sessionBindingsBySessionId = this.worldSessionService?.bindingBySessionId instanceof Map
            ? this.worldSessionService.bindingBySessionId
            : null;
        const sessionBindingsBySocketId = this.worldSessionService?.bindingBySocketId instanceof Map
            ? this.worldSessionService.bindingBySocketId
            : null;
        const expiredBindings = this.worldSessionService?.expiredBindings instanceof Map
            ? this.worldSessionService.expiredBindings
            : null;
        const purgedPlayerIds = this.worldSessionService?.purgedPlayerIds instanceof Set
            ? this.worldSessionService.purgedPlayerIds
            : null;
        const instances = Array.from(this.worldRuntimeService?.listInstanceRuntimes?.() ?? []);

        const domains = [];
        const topInstances = [];
        let instancePlayerBytes = 0;
        let instanceMonsterBytes = 0;
        let instanceTerrainBytes = 0;
        let instanceObjectBytes = 0;
        let totalPlayerCount = normalizeNonNegativeCount(runtimePlayers?.size);
        let monsterCount = 0;

        for (const instance of instances) {
            const instanceId = typeof instance?.meta?.instanceId === 'string'
                ? instance.meta.instanceId.trim()
                : typeof instance?.snapshot === 'function'
                    ? (instance.snapshot()?.instanceId ?? '').trim()
                    : '';
            if (!instanceId) {
                continue;
            }
            const playerBytes = estimateSerializedBytes(instance?.playersById) + estimateSerializedBytes(instance?.playersByHandle);
            const monsterBytes = estimateSerializedBytes(instance?.monstersByRuntimeId) + estimateSerializedBytes(instance?.monsterRuntimeIdByTile);
            const terrainBytes = estimateSerializedBytes(instance?.occupancy)
                + estimateSerializedBytes(instance?.auraByTile)
                + estimateSerializedBytes(instance?.tileResourceBuckets)
                + estimateSerializedBytes(instance?.baseTileResourceBuckets)
                + estimateSerializedBytes(instance?.tileDamageByTile)
                + estimateSerializedBytes(instance?.changedTileResourceEntryCountByKey);
            const objectBytes = estimateSerializedBytes(instance?.npcsById)
                + estimateSerializedBytes(instance?.npcIdByTile)
                + estimateSerializedBytes(instance?.landmarksById)
                + estimateSerializedBytes(instance?.landmarkIdByTile)
                + estimateSerializedBytes(instance?.containersById)
                + estimateSerializedBytes(instance?.containerIdByTile)
                + estimateSerializedBytes(instance?.groundPilesByTile)
                + estimateSerializedBytes(instance?.pendingCommands)
                + estimateSerializedBytes(instance?.freeHandles);
            instancePlayerBytes += playerBytes;
            instanceMonsterBytes += monsterBytes;
            instanceTerrainBytes += terrainBytes;
            instanceObjectBytes += objectBytes;
            const playerCount = normalizeNonNegativeCount(instance?.playersById?.size ?? instance?.playerCount);
            const currentMonsterCount = normalizeNonNegativeCount(instance?.monstersByRuntimeId?.size ?? instance?.monsterCount);
            monsterCount += currentMonsterCount;
            topInstances.push({
                instanceId,
                label: buildMemoryEstimateInstanceLabel(typeof instance?.snapshot === 'function' ? instance.snapshot() : instance?.meta ?? instance),
                bytes: playerBytes + monsterBytes + terrainBytes + objectBytes,
                playerBytes,
                monsterBytes,
                instanceBytes: terrainBytes + objectBytes,
                playerCount,
                monsterCount: currentMonsterCount,
            });
        }

        domains.push(buildMemoryDomainEstimate('player_runtime', '玩家运行态主存储', estimateSerializedBytes(runtimePlayers), totalPlayerCount));
        domains.push(buildMemoryDomainEstimate('player_effects', '玩家待发战斗效果队列', estimateSerializedBytes(pendingCombatEffectsByPlayerId), normalizeNonNegativeCount(pendingCombatEffectsByPlayerId?.size)));
        domains.push(buildMemoryDomainEstimate('player_locations', '玩家位置索引', estimateSerializedBytes(playerLocations), normalizeNonNegativeCount(playerLocations?.size)));
        domains.push(buildMemoryDomainEstimate('session_bindings', '会话绑定索引', estimateSerializedBytes(sessionBindingsByPlayerId)
            + estimateSerializedBytes(sessionBindingsBySessionId)
            + estimateSerializedBytes(sessionBindingsBySocketId)
            + estimateSerializedBytes(expiredBindings)
            + estimateSerializedBytes(purgedPlayerIds), normalizeNonNegativeCount(sessionBindingsByPlayerId?.size)));
        domains.push(buildMemoryDomainEstimate('instance_players', '实例内玩家索引', instancePlayerBytes, totalPlayerCount));
        domains.push(buildMemoryDomainEstimate('instance_monsters', '实例内怪物运行态与占位索引', instanceMonsterBytes, monsterCount));
        domains.push(buildMemoryDomainEstimate('instance_terrain', '实例地块占位与资源桶', instanceTerrainBytes, instances.length));
        domains.push(buildMemoryDomainEstimate('instance_objects', '实例容器、掉落与命令队列', instanceObjectBytes, instances.length));

        const coveredBytes = domains.reduce((sum, entry) => sum + entry.bytes, 0);
        const uncoveredBytes = Math.max(0, rssBytes - coveredBytes);
        domains.push(buildMemoryDomainEstimate('uncovered', '未归类常驻差额', uncoveredBytes, 0));
        domains.sort((left, right) => {
            if (right.bytes !== left.bytes) {
                return right.bytes - left.bytes;
            }
            return left.label.localeCompare(right.label, 'zh-Hans-CN');
        });

        topInstances.sort((left, right) => {
            if (right.bytes !== left.bytes) {
                return right.bytes - left.bytes;
            }
            if (right.monsterBytes !== left.monsterBytes) {
                return right.monsterBytes - left.monsterBytes;
            }
            return left.label.localeCompare(right.label, 'zh-Hans-CN');
        });

        const nextEstimate = {
            mode: 'snapshot_estimate',
            generatedAt: now,
            cacheTtlMs: MEMORY_ESTIMATE_CACHE_TTL_MS,
            rssBytes: roundMetric(rssBytes),
            coveredBytes: roundMetric(coveredBytes),
            uncoveredBytes: roundMetric(uncoveredBytes),
            coveragePercent: rssBytes > 0 ? roundMetric((coveredBytes / rssBytes) * 100) : 0,
            domains: domains.length > 0 ? domains : EMPTY_MEMORY_ESTIMATE_DOMAINS,
            topInstances: topInstances.length > 0
                ? topInstances.slice(0, MEMORY_ESTIMATE_TOP_INSTANCE_LIMIT)
                : EMPTY_MEMORY_ESTIMATE_INSTANCES,
        };
        this.lastMemoryEstimate = nextEstimate;
        this.lastMemoryEstimateExpiresAt = now + MEMORY_ESTIMATE_CACHE_TTL_MS;
        return nextEstimate;
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
                isBot: (0, next_gm_constants_1.isNativeGmBotPlayerId)(player.playerId),
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
    /**
 * buildPerformanceSnapshot：构建并返回目标对象。
 * @returns 无返回值，直接更新Performance快照相关状态。
 */

    buildPerformanceSnapshot() {

        const summary = this.worldRuntimeService.getRuntimeSummary();

        const loadAvg = os.loadavg();

        const memoryUsage = process.memoryUsage();
        const rssBytes = Number(memoryUsage.rss ?? 0);

        const resourceUsage = process.resourceUsage();

        const processUptimeSec = process.uptime();
        const cpuNow = process.hrtime.bigint();
        const cpuUsage = process.cpuUsage(this.lastCpuUsage);
        const elapsedMicros = Number(cpuNow - this.lastCpuTime) / 1000;
        const cpuMicros = cpuUsage.user + cpuUsage.system;

        const now = Date.now();

        const sharedGmStatePerf = this.buildSharedGmStatePerf();
        const networkInBuckets = buildSortedNetworkBuckets(this.networkInBucketByKey);
        const networkOutBuckets = buildSortedNetworkBuckets(this.networkOutBucketByKey);
        const networkInBytes = sumBucketBytes(networkInBuckets);
        const networkOutBytes = sumBucketBytes(networkOutBuckets);
        const cpuBreakdown = buildCpuBreakdown(summary);
        const memoryEstimate = this.buildMemoryEstimate(summary, rssBytes);
        const cpuPercent = elapsedMicros > 0
            ? roundMetric(Math.max(0, Math.min(100, (cpuMicros / elapsedMicros) * 100)))
            : 0;

        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuTime = cpuNow;

        const tickAvgMs = summary.tickPerf?.totalMs?.avg60 ?? summary.lastTickDurationMs;
        return {
            cpuPercent,
            memoryMb: bytesToMb(rssBytes),
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
                breakdown: cpuBreakdown.length > 0 ? cpuBreakdown : EMPTY_CPU_BREAKDOWN,
            },
            memoryEstimate,
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
            networkInBytes,
            networkOutBytes,
            networkInBuckets: networkInBuckets.length > 0 ? networkInBuckets : EMPTY_NETWORK_BUCKETS,
            networkOutBuckets: networkOutBuckets.length > 0 ? networkOutBuckets : EMPTY_NETWORK_BUCKETS,
        };
    }    
    /**
 * buildSharedGmStatePerf：构建并返回目标对象。
 * @returns 无返回值，直接更新SharedGM状态Perf相关状态。
 */

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
    /** 把单个 socket 包累计到对应协议桶。 */
    recordNetworkBucket(bucketByKey, direction, event, payload) {
        const label = resolveNetworkPacketLabel(direction, event, payload);
        if (!label) {
            return;
        }
        const measurement = measureNetworkPayload(event, payload);
        if (measurement.packetBytes <= 0) {
            return;
        }
        const current = bucketByKey.get(label);
        const sample = buildNetworkLargePayloadSample(direction, event, measurement);
        if (current) {
            current.bytes += measurement.packetBytes;
            current.count += 1;
            appendNetworkLargePayloadSample(current, sample);
            return;
        }
        const next = {
            key: label,
            label,
            bytes: measurement.packetBytes,
            count: 1,
        };
        appendNetworkLargePayloadSample(next, sample);
        bucketByKey.set(label, next);
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
export { RuntimeGmStateService };
/**
 * roundMetric：执行roundMetric相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新roundMetric相关状态。
 */

function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
/**
 * bytesToMb：执行byteToMb相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新byteToMb相关状态。
 */

function bytesToMb(value) {
    return roundMetric(value / (1024 * 1024));
}

function normalizeNonNegativeCount(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return 0;
    }
    return Math.max(0, Math.trunc(normalized));
}

function buildMemoryDomainEstimate(key, label, bytes, count) {
    const normalizedBytes = roundMetric(Math.max(0, Number(bytes) || 0));
    const normalizedCount = normalizeNonNegativeCount(count);
    return {
        key,
        label,
        bytes: normalizedBytes,
        count: normalizedCount,
        avgBytes: normalizedCount > 0 ? roundMetric(normalizedBytes / normalizedCount) : 0,
    };
}

function buildMemoryEstimateInstanceLabel(instance) {
    const displayName = typeof instance?.displayName === 'string' && instance.displayName.trim()
        ? instance.displayName.trim()
        : typeof instance?.templateName === 'string' && instance.templateName.trim()
            ? instance.templateName.trim()
            : typeof instance?.instanceId === 'string' && instance.instanceId.trim()
                ? instance.instanceId.trim()
                : '未知实例';
    const instanceId = typeof instance?.instanceId === 'string' ? instance.instanceId.trim() : '';
    return instanceId && instanceId !== displayName ? `${displayName} · ${instanceId}` : displayName;
}

function estimateSerializedBytes(value) {
    if (value == null) {
        return 0;
    }
    try {
        return roundMetric(v8.serialize(value).byteLength);
    }
    catch (_error) {
        try {
            return roundMetric(Buffer.byteLength(JSON.stringify(value), 'utf8'));
        }
        catch (_jsonError) {
            return 0;
        }
    }
}

function buildSortedNetworkBuckets(bucketByKey) {
    return Array.from(bucketByKey.values()).sort((left, right) => {
        if (right.bytes !== left.bytes) {
            return right.bytes - left.bytes;
        }
        if (right.count !== left.count) {
            return right.count - left.count;
        }
        return left.label.localeCompare(right.label, 'zh-Hans-CN');
    }).map((entry) => {
        const bucket = {
            key: entry.key,
            label: entry.label,
            bytes: roundMetric(entry.bytes),
            count: entry.count,
        };
        if (Array.isArray(entry.largePayloadSamples) && entry.largePayloadSamples.length > 0) {
            bucket.largePayloadCount = normalizeNonNegativeCount(entry.largePayloadCount);
            bucket.largePayloadBytes = roundMetric(Math.max(0, Number(entry.largePayloadBytes) || 0));
            bucket.largePayloadSamples = entry.largePayloadSamples.map((sample) => ({
                event: String(sample.event ?? ''),
                bytes: roundMetric(Math.max(0, Number(sample.bytes) || 0)),
                packetBytes: roundMetric(Math.max(0, Number(sample.packetBytes) || 0)),
                recordedAt: Math.max(0, Number(sample.recordedAt) || 0),
                body: String(sample.body ?? ''),
            }));
        }
        return bucket;
    });
}

function sumBucketBytes(buckets) {
    return roundMetric(buckets.reduce((sum, bucket) => sum + bucket.bytes, 0));
}

function normalizeNetworkEventKey(event) {
    return typeof event === 'string' ? event.trim() : '';
}

function buildProtocolNameByEvent(eventMap) {
    return new Map(Object.entries(eventMap).map(([name, event]) => [event, name]));
}

function resolveNetworkPacketLabel(direction, event, payload) {
    const eventKey = normalizeNetworkEventKey(event);
    if (!eventKey) {
        return '';
    }
    const protocolName = direction === 'c2s'
        ? C2S_NAME_BY_EVENT.get(eventKey)
        : S2C_NAME_BY_EVENT.get(eventKey);
    if (protocolName) {
        if (direction === 's2c' && eventKey === shared_1.S2C.WorldDelta) {
            return direction + "_" + resolveWorldDeltaPacketLabel(protocolName, payload);
        }
        return direction + "_" + protocolName;
    }
    return direction + "_" + eventKey.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function resolveWorldDeltaPacketLabel(protocolName, payload) {
    const tags = [];
    if (hasWorldDeltaEntityPayload(payload)) {
        tags.push('entity');
    }
    if (hasWorldDeltaTilePayload(payload)) {
        tags.push('tile');
    }
    if (hasWorldDeltaMinimapPayload(payload)) {
        tags.push('minimap');
    }
    if (hasWorldDeltaThreatPayload(payload)) {
        tags.push('threat');
    }
    if (hasNonEmptyArray(payload?.path)) {
        tags.push('path');
    }
    if (hasNonEmptyArray(payload?.fx)) {
        tags.push('fx');
    }
    if (payload?.time !== undefined || typeof payload?.dt === 'number' || typeof payload?.auraLevelBaseValue === 'number') {
        tags.push('time');
    }
    return tags.length > 0 ? `${protocolName}(${tags.join('+')})` : protocolName;
}

function hasWorldDeltaEntityPayload(payload) {
    return WORLD_DELTA_ENTITY_KEYS.some((key) => hasNonEmptyArray(payload?.[key]));
}

function hasWorldDeltaTilePayload(payload) {
    return hasNonEmptyArray(payload?.v) || hasNonEmptyArray(payload?.tp);
}

function hasWorldDeltaMinimapPayload(payload) {
    return hasNonEmptyArray(payload?.vma) || hasNonEmptyArray(payload?.vmr);
}

function hasWorldDeltaThreatPayload(payload) {
    return hasNonEmptyArray(payload?.threatArrows)
        || hasNonEmptyArray(payload?.threatArrowAdds)
        || hasNonEmptyArray(payload?.threatArrowRemoves);
}

function hasNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}

function measureNetworkPayload(event, payload) {
    const eventKey = normalizeNetworkEventKey(event);
    if (!eventKey) {
        return {
            eventKey: '',
            packetBytes: 0,
            payloadBytes: 0,
            serializedPayload: '',
        };
    }
    try {
        const serialized = JSON.stringify(payload ?? null);
        const serializedPayload = serialized ?? 'null';
        const payloadBytes = Buffer.byteLength(serializedPayload, 'utf8');
        return {
            eventKey,
            packetBytes: Buffer.byteLength(eventKey, 'utf8') + payloadBytes,
            payloadBytes,
            serializedPayload,
        };
    }
    catch (_error) {
        return {
            eventKey,
            packetBytes: Buffer.byteLength(eventKey, 'utf8'),
            payloadBytes: 0,
            serializedPayload: '',
        };
    }
}

function buildNetworkLargePayloadSample(direction, event, measurement) {
    if (!isDevelopmentLikeEnv()) {
        return null;
    }
    if (direction === 's2c' && measurement.eventKey === shared_1.S2C.GmState) {
        return null;
    }
    if (measurement.payloadBytes <= LARGE_NETWORK_PAYLOAD_CAPTURE_THRESHOLD_BYTES) {
        return null;
    }
    return {
        event: normalizeNetworkEventKey(event),
        bytes: measurement.payloadBytes,
        packetBytes: measurement.packetBytes,
        recordedAt: Date.now(),
        body: formatNetworkPayloadBody(measurement.serializedPayload),
    };
}

function appendNetworkLargePayloadSample(bucket, sample) {
    if (!sample) {
        return;
    }
    bucket.largePayloadCount = normalizeNonNegativeCount(bucket.largePayloadCount) + 1;
    bucket.largePayloadBytes = Math.max(0, Number(bucket.largePayloadBytes) || 0) + sample.bytes;
    const samples = Array.isArray(bucket.largePayloadSamples) ? bucket.largePayloadSamples : [];
    samples.unshift(sample);
    bucket.largePayloadSamples = samples.slice(0, LARGE_NETWORK_PAYLOAD_SAMPLE_LIMIT);
}

function formatNetworkPayloadBody(serializedPayload) {
    if (!serializedPayload) {
        return '';
    }
    try {
        return JSON.stringify(JSON.parse(serializedPayload), null, 2);
    }
    catch (_error) {
        return serializedPayload;
    }
}

function isDevelopmentLikeEnv() {
    const runtimeEnv = String(process.env.SERVER_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
    return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}

function buildCpuBreakdown(summary) {
    const phaseSummaries = summary?.tickPerf?.phaseSummaries;
    const totalWindowMs = Number(summary?.tickPerf?.totalMs?.avg60 ?? 0) * Number(phaseSummaries?.pendingCommandsMs?.sampleCount ?? 0);
    const rows = [];
    let coveredTotalMs = 0;
    for (const key of [
        'pendingCommandsMs',
        'systemCommandsMs',
        'instanceTicksMs',
        'transfersMs',
        'monsterActionsMs',
        'playerAdvanceMs',
    ]) {
        const phaseSummary = phaseSummaries?.[key];
        const totalMs = Number(phaseSummary?.totalMs ?? 0);
        if (!(totalMs > 0)) {
            continue;
        }
        coveredTotalMs += totalMs;
        rows.push({
            key,
            label: CPU_BREAKDOWN_LABELS[key] ?? key,
            totalMs: roundMetric(totalMs),
            count: Number(phaseSummary?.count ?? 0),
            avgMs: roundMetric(Number(phaseSummary?.avgMs ?? 0)),
            percent: totalWindowMs > 0 ? roundMetric((totalMs / totalWindowMs) * 100) : 0,
        });
    }
    const syncFlushSummary = summary?.tickPerf?.syncFlushMs;
    const syncFlushCount = Number(syncFlushSummary?.count ?? 0);
    const syncFlushTotalMs = roundMetric(Number(syncFlushSummary?.avg60 ?? 0) * syncFlushCount);
    if (syncFlushTotalMs > 0) {
        coveredTotalMs += syncFlushTotalMs;
        rows.push({
            key: 'syncFlushMs',
            label: CPU_BREAKDOWN_LABELS.syncFlushMs,
            totalMs: syncFlushTotalMs,
            count: syncFlushCount,
            avgMs: roundMetric(Number(syncFlushSummary?.avg60 ?? 0)),
            percent: totalWindowMs > 0 ? roundMetric((syncFlushTotalMs / totalWindowMs) * 100) : 0,
        });
    }
    const otherTotalMs = roundMetric(Math.max(0, totalWindowMs - coveredTotalMs));
    if (otherTotalMs > 0) {
        rows.push({
            key: 'otherMs',
            label: CPU_BREAKDOWN_LABELS.otherMs,
            totalMs: otherTotalMs,
            count: Number(phaseSummaries?.pendingCommandsMs?.sampleCount ?? 0),
            avgMs: Number(phaseSummaries?.pendingCommandsMs?.sampleCount ?? 0) > 0
                ? roundMetric(otherTotalMs / Number(phaseSummaries.pendingCommandsMs.sampleCount))
                : 0,
            percent: totalWindowMs > 0 ? roundMetric((otherTotalMs / totalWindowMs) * 100) : 0,
        });
    }
    return rows;
}
