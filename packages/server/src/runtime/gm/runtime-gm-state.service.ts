/** GM 状态聚合器：把玩家、地图与运行时性能信息拼成 GM 面板快照。 */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { C2S, S2C } from '@mud/shared';
import { Session } from 'node:inspector';
import { cpus, loadavg, uptime } from 'os';
import { getHeapSnapshot, getHeapSpaceStatistics } from 'v8';
import { NATIVE_GM_SOCKET_CONTRACT } from '../../http/native/native-gm-contract';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
import { WorldSessionService } from '../../network/world-session.service';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeService } from '../world/world-runtime.service';
import { StartupBarrierService } from '../../lifecycle/startup-barrier.service';
import { ShutdownStatusService } from '../../lifecycle/shutdown-status.service';
import { StartupStatusService } from '../../lifecycle/startup-status.service';
import {
  diffHeapSnapshotSummaries,
  summarizeHeapSnapshotFromStream,
  type HeapSnapshotSummary,
} from '../../tools/heap-snapshot-summary';
import { WorkerPoolMetricsService } from '../../concurrency/worker-pool-metrics.service';
import { FlushDiagnosticsService } from '../../persistence/flush-diagnostics.service';

const EMPTY_CPU_BREAKDOWN = [];

const EMPTY_NETWORK_BUCKETS = [];

const EMPTY_PATHFINDING_FAILURES = [];
const EMPTY_MEMORY_ESTIMATE_DOMAINS = [];
const EMPTY_MEMORY_ESTIMATE_INSTANCES = [];
const EMPTY_HEAP_SPACE_SNAPSHOTS = [];
const MEMORY_ESTIMATE_CACHE_TTL_MS = 5000;
const MEMORY_ESTIMATE_TOP_INSTANCE_LIMIT = 8;
const MANUAL_GC_COOLDOWN_MS = 60_000;
/**
 * 网络诊断 bucket label 的数量硬上限，防止 resolveNetworkPacketLabel 漏网或新协议事件
 * 接入时让 networkInBucketByKey/networkOutBucketByKey 无限增长。已收敛到 unknown 后
 * 正常情况下不会超过协议枚举大小，这里的上限只作为兜底。
 */
const MAX_NETWORK_PERF_BUCKET_LABELS = 256;
/** 默认 5 分钟滚动一次网络诊断 bucket，最小 60 秒，避免频繁清零影响诊断窗口。 */
const NETWORK_PERF_ROLLING_RESET_DEFAULT_MS = 5 * 60 * 1000;
const NETWORK_PERF_ROLLING_RESET_MIN_MS = 60 * 1000;
function resolveNetworkPerfRollingResetIntervalMs() {
    const raw = process.env.SERVER_GM_NETWORK_PERF_RESET_INTERVAL_MS;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return NETWORK_PERF_ROLLING_RESET_DEFAULT_MS;
    }
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return NETWORK_PERF_ROLLING_RESET_DEFAULT_MS;
    }
    return Math.max(NETWORK_PERF_ROLLING_RESET_MIN_MS, Math.trunc(parsed));
}
/**
 * Heap snapshot 摘要解析的 top N 长度。
 * 完全在进程内通过 v8.getHeapSnapshot() 读取流式 chunks 并解析，**不落盘**，
 * 在容器/受限文件系统下也能用，对运行进程的内存压力仅是 stringPool（约 50~200 MB 临时）。
 */
const HEAP_SNAPSHOT_SUMMARY_TOP_LIMIT = Math.max(20, Math.min(120, Math.trunc(Number(process.env.SERVER_HEAP_SNAPSHOT_TOP_LIMIT) || 60)));
const LARGE_NETWORK_PAYLOAD_CAPTURE_THRESHOLD_BYTES = 1024;
const LARGE_NETWORK_PAYLOAD_SAMPLE_LIMIT = 5;
const NETWORK_PAYLOAD_ESTIMATE_MAX_DEPTH = 16;
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
    'syncFlush.getSocketMs': '同步·取连接',
    'syncFlush.getViewMs': '同步·取视野',
    'syncFlush.roomSyncMs': '同步·房间归属',
    'syncFlush.contextActionsMs': '同步·上下文动作',
    'syncFlush.playerStateMs': '同步·玩家投影',
    'syncFlush.envelopeMs': '同步·主包构造',
    'syncFlush.auxSyncMs': '同步·辅助状态',
    'syncFlush.emitEnvelopeMs': '同步·Socket 发包',
    'syncFlush.questSyncMs': '同步·任务状态',
    'syncFlush.runtimeEventsMs': '同步·运行时事件',
    'syncFlush.statisticRecordsMs': '同步·统计记录',
    'syncFlush.clearCachesMs': '同步·缓存清理',
    otherMs: '其余开销',
});
const SYNC_FLUSH_BREAKDOWN_DEFS = Object.freeze([
    { key: 'getSocketMs', countKey: 'getSocketCount' },
    { key: 'getViewMs', countKey: 'getViewCount' },
    { key: 'roomSyncMs', countKey: 'roomSyncCount' },
    { key: 'contextActionsMs', countKey: 'contextActionsCount' },
    { key: 'playerStateMs', countKey: 'playerStateCount' },
    { key: 'envelopeMs', countKey: 'envelopeCount' },
    { key: 'auxSyncMs', countKey: 'auxSyncCount' },
    { key: 'emitEnvelopeMs', countKey: 'emitEnvelopeCount' },
    { key: 'questSyncMs', countKey: 'questSyncCount' },
    { key: 'runtimeEventsMs', countKey: 'runtimeEventsCount' },
    { key: 'statisticRecordsMs', countKey: 'statisticRecordsCount' },
    { key: 'clearCachesMs', countKey: 'clearCachesCount' },
]);
const C2S_NAME_BY_EVENT = buildProtocolNameByEvent(C2S);
const S2C_NAME_BY_EVENT = buildProtocolNameByEvent(S2C);

@Injectable()
export class RuntimeGmStateService {
    /** 地图模板仓库，用于把地图 ID 还原成可读名称。 */
    mapTemplateRepository;
    /** 玩家运行时仓库，提供在线玩家快照。 */
    playerRuntimeService;
    /** 世界运行时，提供 tick 与路径规划性能摘要。 */
    worldRuntimeService;
    /** 当前在线连接映射，供状态推送时按玩家查 socket。 */
    worldSessionService;
    /** 运行时事件总线，GM 状态推送标记写入此处。 */
    runtimeEventBusService;
    /** Worker Pool 指标服务（可选，WorkerPoolModule 未加载时为 null）。 */
    workerPoolMetricsService: WorkerPoolMetricsService | null;
    /** 刷盘诊断采集器（可选）。 */
    flushDiagnosticsService: FlushDiagnosticsService | null;
    /** 启动状态服务（可选，供 GM 面板展示 phase 和降级原因）。 */
    startupStatusService: StartupStatusService | null;
    /** 关闭状态服务（可选，供 GM 面板展示 draining phase 和关闭结果）。 */
    shutdownStatusService: ShutdownStatusService | null;
    /** 启动闸门服务（可选，供 GM 面板展示 traffic/tick/flush 等闸门）。 */
    startupBarrierService: StartupBarrierService | null;
    /** 网络上行事件累计桶。 */
    networkInBucketByKey = new Map();
    /** 网络下行事件累计桶。 */
    networkOutBucketByKey = new Map();
    /** GM 手动启动的网络诊断开关；环境变量开启时不依赖此状态。 */
    networkPerfManuallyEnabled = false;
    /** GM 手动覆盖的大包包体采样开关；null 时才回退环境变量。 */
    networkPayloadCaptureManualOverride: boolean | null = null;
    /** 滚动 reset 调度计时器，避免长期诊断累积；onModuleDestroy 清理。 */
    networkPerfRollingResetTimer = null;
    /** 上一次 reset 时间戳，供监控/GM 面板观察当前窗口起点。 */
    lastNetworkPerfResetAt = Date.now();
    /** 最近一次 CPU 百分比采样的进程用时基线。 */
    lastCpuUsage = process.cpuUsage();
    /** 最近一次 CPU 百分比采样的单调时钟基线。 */
    lastCpuTime = process.hrtime.bigint();
    /** 最近一次运行态内存画像缓存。 */
    lastMemoryEstimate = null;
    /** 运行态内存画像缓存过期时间。 */
    lastMemoryEstimateExpiresAt = 0;
    /** 最近一次 heap snapshot 摘要（in-memory 保留，给 GET 端点直接读，避免落盘）。 */
    lastHeapSnapshotSummary: HeapSnapshotSummary | null = null;
    /** 最近一次 heap snapshot 摘要生成时间戳。 */
    lastHeapSnapshotSummaryAt = 0;
    /** 手动 GC 上次执行时间，用于防止 GM 连续触发 stop-the-world。 */
    lastManualGcAt = 0;
    /** 手动 GC 并发保护。 */
    manualGcInProgress = false;
    /** 最近 60 次同步广播内部阶段耗时，用于拆出同步热点。 */
    syncFlushBreakdownHistoryByKey = createSyncFlushBreakdownHistoryByKey();
    /** 缓存依赖并接入 GM 状态推送链路。 */
    constructor(
        mapTemplateRepository: MapTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
        worldRuntimeService: WorldRuntimeService,
        worldSessionService: WorldSessionService,
        runtimeEventBusService: RuntimeEventBusService,
        @Optional() @Inject(WorkerPoolMetricsService) workerPoolMetricsService?: WorkerPoolMetricsService,
        @Optional() @Inject(FlushDiagnosticsService) flushDiagnosticsService?: FlushDiagnosticsService,
        @Optional() @Inject(StartupStatusService) startupStatusService?: StartupStatusService,
        @Optional() @Inject(ShutdownStatusService) shutdownStatusService?: ShutdownStatusService,
        @Optional() @Inject(StartupBarrierService) startupBarrierService?: StartupBarrierService,
    ) {
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
        this.worldSessionService = worldSessionService;
        this.runtimeEventBusService = runtimeEventBusService;
        this.workerPoolMetricsService = workerPoolMetricsService ?? null;
        this.flushDiagnosticsService = flushDiagnosticsService ?? null;
        this.startupStatusService = startupStatusService ?? null;
        this.shutdownStatusService = shutdownStatusService ?? null;
        this.startupBarrierService = startupBarrierService ?? null;
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
        this.runtimeEventBusService?.queueGmStatePush(normalizedPlayerId);
    }
    /** 批量把待推送的 GM 面板状态发给在线客户端（由 WorldSyncService 在 drain 时调用）。 */
    flushQueuedStatePushes() {
        // No-op: GM 状态推送已迁移到 EventBus，由 WorldSyncService 在 drainPlayer 时处理 gmStatePush 标记。
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

        if (!NATIVE_GM_SOCKET_CONTRACT.pushStateAfterMutation) {
            return;
        }
        this.queueStatePush(requesterPlayerId);
    }
    /** GM 状态下发固定收敛到主线事件。 */
    getGmStateEvent(client) {
        return S2C.GmState;
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
        if (!this.shouldRecordNetworkPerf()) {
            return;
        }
        this.recordNetworkBucket(this.networkInBucketByKey, 'c2s', event, payload);
    }
    /** 记录服务端 -> 客户端的 socket 事件流量。 */
    recordNetworkOut(event, payload) {
        if (!this.shouldRecordNetworkPerf()) {
            return;
        }
        this.recordNetworkBucket(this.networkOutBucketByKey, 's2c', event, payload);
    }
    /** 记录一次 flushConnectedPlayers 内部耗时分布。 */
    recordSyncFlushBreakdown(sample) {
        for (const def of SYNC_FLUSH_BREAKDOWN_DEFS) {
            const history = this.syncFlushBreakdownHistoryByKey.get(def.key);
            if (!history) {
                continue;
            }
            pushSyncFlushBreakdownMetric(
                history,
                Number(sample?.[def.key] ?? 0),
                Number(sample?.[def.countKey] ?? 0),
            );
        }
    }
    /** GM 网络性能统计是热路径诊断能力，生产默认关闭，需要显式开关。 */
    shouldRecordNetworkPerf() {
        return this.networkPerfManuallyEnabled || isNetworkPerfRecordingEnabled();
    }
    /** 是否记录大包详情样本。 */
    shouldCaptureNetworkPayloadBody() {
        if (this.networkPayloadCaptureManualOverride !== null) {
            return this.networkPayloadCaptureManualOverride === true;
        }
        return isNetworkPayloadBodyCaptureEnabled();
    }
    /** 由 GM 面板显式启动网络性能统计；只记录事件字节桶，不默认抓取大包 body。 */
    enableNetworkPerfCounters() {
        this.networkPerfManuallyEnabled = true;
        this.ensureNetworkPerfRollingReset();
    }
    /** 由 GM 面板显式切换大包 body 采样。开启后才会对大包做 JSON.stringify 截断留样。 */
    setNetworkPayloadCaptureEnabled(enabled) {
        this.networkPayloadCaptureManualOverride = enabled === true;
        if (this.networkPayloadCaptureManualOverride) {
            this.networkPerfManuallyEnabled = true;
            this.ensureNetworkPerfRollingReset();
        }
    }
    /** 清空累计网络统计。 */
    resetNetworkPerfCounters() {
        this.networkInBucketByKey.clear();
        this.networkOutBucketByKey.clear();
        this.lastNetworkPerfResetAt = Date.now();
    }
    /**
     * 启动按时间窗滚动 reset 调度，避免 networkInBucketByKey/networkOutBucketByKey 长期累积：
     * 默认 5 分钟轮转一次，可通过 SERVER_GM_NETWORK_PERF_RESET_INTERVAL_MS 调整（最小 60 秒）。
     * 仅当 GM 面板手动启用或 env 强制启用时才创建定时器；定时器 unref 不阻塞进程退出。
     * onModuleDestroy / 重复调用时通过 clearInterval 防止泄漏。
     */
    ensureNetworkPerfRollingReset() {
        if (this.networkPerfRollingResetTimer) {
            return;
        }
        if (!this.shouldRecordNetworkPerf()) {
            return;
        }
        const intervalMs = resolveNetworkPerfRollingResetIntervalMs();
        if (intervalMs <= 0) {
            return;
        }
        this.networkPerfRollingResetTimer = setInterval(() => {
            try {
                this.resetNetworkPerfCounters();
            }
            catch (error) {
                // 监控诊断路径异常不影响主线，但记录以便排查
                if (error instanceof Error) {
                    console.error('[GM状态] 重置网络性能计数器错误：', error.message);
                }
            }
        }, intervalMs);
        if (typeof this.networkPerfRollingResetTimer?.unref === 'function') {
            this.networkPerfRollingResetTimer.unref();
        }
    }
    /** NestJS 启动钩子：env 显式开启网络诊断时自动起 rolling reset。 */
    onModuleInit() {
        if (isNetworkPerfRecordingEnabled()) {
            this.ensureNetworkPerfRollingReset();
        }
    }
    /** NestJS 销毁钩子：清掉 rolling reset 定时器，避免热重启泄漏。 */
    onModuleDestroy() {
        if (this.networkPerfRollingResetTimer) {
            clearInterval(this.networkPerfRollingResetTimer);
            this.networkPerfRollingResetTimer = null;
        }
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
        const pendingCombatEffectsByPlayerId = null;
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
        let instanceOccupancyBytes = 0;
        let instanceAuraBytes = 0;
        let instanceTileResourceBucketsBytes = 0;
        let instanceBaseTileResourceBucketsBytes = 0;
        let instanceTileDamageBytes = 0;
        let instanceChangedTileResourceBytes = 0;
        let instanceNpcsBytes = 0;
        let instanceNpcIndexBytes = 0;
        let instanceLandmarksBytes = 0;
        let instanceLandmarkIndexBytes = 0;
        let instanceContainersBytes = 0;
        let instanceContainerIndexBytes = 0;
        let instanceGroundPilesBytes = 0;
        let instancePendingCommandsBytes = 0;
        let instanceFreeHandlesBytes = 0;
        let totalPlayerCount = normalizeNonNegativeCount(runtimePlayers?.size);
        let monsterCount = 0;

        for (const instance of instances as any[]) {
            const instanceId = typeof instance?.meta?.instanceId === 'string'
                ? instance.meta.instanceId.trim()
                : typeof instance?.snapshot === 'function'
                    ? (instance.snapshot()?.instanceId ?? '').trim()
                    : '';
            if (!instanceId) {
                continue;
            }
            const playerBytes = estimateRuntimeCollectionBytes(instance?.playersById, 96)
                + estimateRuntimeCollectionBytes(instance?.playersByHandle, 48);
            const monsterBytes = estimateRuntimeCollectionBytes(instance?.monstersByRuntimeId, 8192)
                + estimateRuntimeCollectionBytes(instance?.monsterRuntimeIdByTile, 64);
            const occupancyBytes = estimateRuntimeCollectionBytes(instance?.occupancy, 64);
            const auraBytes = estimateRuntimeCollectionBytes(instance?.auraByTile, 96);
            const tileResBucketsBytes = estimateRuntimeCollectionBytes(instance?.tileResourceBuckets, 128);
            const baseTileResBucketsBytes = estimateRuntimeCollectionBytes(instance?.baseTileResourceBuckets, 128);
            const tileDamageBytes = estimateRuntimeCollectionBytes(instance?.tileDamageByTile, 64);
            const changedTileResBytes = estimateRuntimeCollectionBytes(instance?.changedTileResourceEntryCountByKey, 64);
            const terrainBytes = occupancyBytes + auraBytes + tileResBucketsBytes
                + baseTileResBucketsBytes + tileDamageBytes + changedTileResBytes;
            const npcsBytes = estimateRuntimeCollectionBytes(instance?.npcsById, 512);
            const npcIndexBytes = estimateRuntimeCollectionBytes(instance?.npcIdByTile, 64);
            const landmarksBytes = estimateRuntimeCollectionBytes(instance?.landmarksById, 512);
            const landmarkIndexBytes = estimateRuntimeCollectionBytes(instance?.landmarkIdByTile, 64);
            const containersBytes = estimateRuntimeCollectionBytes(instance?.containersById, 1024);
            const containerIndexBytes = estimateRuntimeCollectionBytes(instance?.containerIdByTile, 64);
            const groundPilesBytes = estimateRuntimeCollectionBytes(instance?.groundPilesByTile, 512);
            const pendingCommandsBytes = estimateRuntimeCollectionBytes(instance?.pendingCommands, 256);
            const freeHandlesBytes = estimateRuntimeCollectionBytes(instance?.freeHandles, 32);
            const objectBytes = npcsBytes + npcIndexBytes + landmarksBytes + landmarkIndexBytes
                + containersBytes + containerIndexBytes + groundPilesBytes
                + pendingCommandsBytes + freeHandlesBytes;
            instancePlayerBytes += playerBytes;
            instanceMonsterBytes += monsterBytes;
            instanceTerrainBytes += terrainBytes;
            instanceObjectBytes += objectBytes;
            instanceOccupancyBytes += occupancyBytes;
            instanceAuraBytes += auraBytes;
            instanceTileResourceBucketsBytes += tileResBucketsBytes;
            instanceBaseTileResourceBucketsBytes += baseTileResBucketsBytes;
            instanceTileDamageBytes += tileDamageBytes;
            instanceChangedTileResourceBytes += changedTileResBytes;
            instanceNpcsBytes += npcsBytes;
            instanceNpcIndexBytes += npcIndexBytes;
            instanceLandmarksBytes += landmarksBytes;
            instanceLandmarkIndexBytes += landmarkIndexBytes;
            instanceContainersBytes += containersBytes;
            instanceContainerIndexBytes += containerIndexBytes;
            instanceGroundPilesBytes += groundPilesBytes;
            instancePendingCommandsBytes += pendingCommandsBytes;
            instanceFreeHandlesBytes += freeHandlesBytes;
            const playerCount = normalizeNonNegativeCount(instance?.playersById?.size ?? instance?.playerCount);
            const currentMonsterCount = normalizeNonNegativeCount(instance?.monstersByRuntimeId?.size ?? instance?.monsterCount);
            monsterCount += currentMonsterCount;
            topInstances.push({
                instanceId,
                label: buildMemoryEstimateInstanceLabel(instance?.meta ?? instance),
                bytes: playerBytes + monsterBytes + terrainBytes + objectBytes,
                playerBytes,
                monsterBytes,
                instanceBytes: terrainBytes + objectBytes,
                playerCount,
                monsterCount: currentMonsterCount,
            });
        }

        const instanceCount = instances.length;
        domains.push(buildMemoryDomainEstimate('player_runtime', '玩家运行态轻量估算', estimatePlayerRuntimeBytes(runtimePlayers), totalPlayerCount));
        domains.push(buildMemoryDomainEstimate('player_effects', '玩家待发战斗效果队列', estimateRuntimeCollectionBytes(pendingCombatEffectsByPlayerId, 192), normalizeNonNegativeCount(pendingCombatEffectsByPlayerId?.size)));
        domains.push(buildMemoryDomainEstimate('player_locations', '玩家位置索引', estimateRuntimeCollectionBytes(playerLocations, 96), normalizeNonNegativeCount(playerLocations?.size)));
        domains.push(buildMemoryDomainEstimate('session_bindings', '会话绑定索引', estimateRuntimeCollectionBytes(sessionBindingsByPlayerId, 192)
            + estimateRuntimeCollectionBytes(sessionBindingsBySessionId, 192)
            + estimateRuntimeCollectionBytes(sessionBindingsBySocketId, 192)
            + estimateRuntimeCollectionBytes(expiredBindings, 192)
            + estimateRuntimeCollectionBytes(purgedPlayerIds, 64), normalizeNonNegativeCount(sessionBindingsByPlayerId?.size)));
        domains.push(buildMemoryDomainEstimate('instance_players', '实例内玩家索引', instancePlayerBytes, totalPlayerCount));
        domains.push(buildMemoryDomainEstimate('instance_monsters', '实例内怪物运行态与占位索引', instanceMonsterBytes, monsterCount));
        // 地块层细分（原 instance_terrain 拆开）
        domains.push(buildMemoryDomainEstimate('instance_occupancy', '实例地块玩家/怪物占位索引', instanceOccupancyBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_aura', '实例风水/灵气分布', instanceAuraBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_tile_resources', '实例地块当前资源桶', instanceTileResourceBucketsBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_base_tile_resources', '实例地块基础资源桶', instanceBaseTileResourceBucketsBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_tile_damage', '实例地块破坏值索引', instanceTileDamageBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_changed_tile_resources', '实例地块资源变更计数', instanceChangedTileResourceBytes, instanceCount));
        // 实例对象层细分（原 instance_objects 拆开）
        domains.push(buildMemoryDomainEstimate('instance_npcs', '实例 NPC 数据', instanceNpcsBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_npc_index', '实例 NPC 位置索引', instanceNpcIndexBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_landmarks', '实例地标数据', instanceLandmarksBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_landmark_index', '实例地标位置索引', instanceLandmarkIndexBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_containers', '实例容器数据', instanceContainersBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_container_index', '实例容器位置索引', instanceContainerIndexBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_ground_piles', '实例地面掉落堆', instanceGroundPilesBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_pending_commands', '实例 pending 命令队列', instancePendingCommandsBytes, instanceCount));
        domains.push(buildMemoryDomainEstimate('instance_free_handles', '实例空闲句柄池', instanceFreeHandlesBytes, instanceCount));
        // GM 自身诊断状态
        const gmNetworkBucketsBytes = estimateGmNetworkBucketsBytes(this.networkInBucketByKey, this.networkOutBucketByKey);
        const gmBucketCount = (this.networkInBucketByKey?.size ?? 0) + (this.networkOutBucketByKey?.size ?? 0);
        domains.push(buildMemoryDomainEstimate('gm_network_buckets', 'GM 网络诊断 bucket 与大包样本', gmNetworkBucketsBytes, gmBucketCount));
        // process / V8 真实分块（吃掉以前的 uncovered 大头）
        const memoryUsageNow = process.memoryUsage();
        const arrayBuffersBytes = Number(memoryUsageNow.arrayBuffers ?? 0) || 0;
        const externalBytes = Number(memoryUsageNow.external ?? 0) || 0;
        const heapTotalBytesNow = Number(memoryUsageNow.heapTotal ?? 0) || 0;
        const heapUsedBytesNow = Number(memoryUsageNow.heapUsed ?? 0) || 0;
        const externalNonArrayBufferBytes = Math.max(0, externalBytes - arrayBuffersBytes);
        const heapCommittedUnusedBytes = Math.max(0, heapTotalBytesNow - heapUsedBytesNow);
        const processNativeOtherBytes = Math.max(0, rssBytes - heapTotalBytesNow - externalBytes);
        domains.push(buildMemoryDomainEstimate('process_array_buffers', '原生 Buffer/ArrayBuffer (socket.io/pg/redis/protobuf/log 缓冲)', arrayBuffersBytes, 0));
        domains.push(buildMemoryDomainEstimate('process_external_native', '其他 C++ native 对象 (V8 模块/native addon)', externalNonArrayBufferBytes, 0));
        domains.push(buildMemoryDomainEstimate('v8_heap_committed_unused', 'V8 已申请未使用堆 (空闲页)', heapCommittedUnusedBytes, 0));
        domains.push(buildMemoryDomainEstimate('process_native_other', '进程其他 (代码段/线程栈/共享库/分配器碎片)', processNativeOtherBytes, 0));
        // V8 已用堆中未被运行时估算覆盖的部分（推断 JS 对象未归类的大小）
        const trackedJsBytes = domains.reduce((sum, entry) => {
            switch (entry.key) {
                case 'process_array_buffers':
                case 'process_external_native':
                case 'v8_heap_committed_unused':
                case 'process_native_other':
                case 'gm_network_buckets':
                    return sum;
                default:
                    return sum + entry.bytes;
            }
        }, 0);
        const v8HeapUsedUnattributedBytes = Math.max(0, heapUsedBytesNow - trackedJsBytes);
        domains.push(buildMemoryDomainEstimate('v8_heap_used_unattributed', 'V8 已用堆中未归类 JS 对象 (NestJS DI/模板/缓存/未列容器)', v8HeapUsedUnattributedBytes, 0));

        const coveredBytes = domains.reduce((sum, entry) => sum + entry.bytes, 0);
        const uncoveredBytes = Math.max(0, rssBytes - coveredBytes);
        domains.push(buildMemoryDomainEstimate('uncovered', '未归类常驻差额 (理论 ≈ 0)', uncoveredBytes, 0));
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
            heapSpaces: buildHeapSpaceSnapshots(),
        };
        this.lastMemoryEstimate = nextEstimate;
        this.lastMemoryEstimateExpiresAt = now + MEMORY_ESTIMATE_CACHE_TTL_MS;
        return nextEstimate;
    }
    /**
     * 在进程内通过 v8.getHeapSnapshot() 拿到 heap snapshot 流，直接边接收边解析；
     * **完全不落盘**——容器/受限文件系统下零依赖、零权限要求。
     *
     * 调用代价：
     *   - V8 在调用瞬间会让 JS 主线程暂停（GB 级 heap 通常 5~30 秒）
     *   - 解析期间内存峰值约 50~200 MB（stringPool）
     *
     * 返回：
     *   - { ok, summary, durationMs, generatedAt }
     *   - summary 同步存到 `lastHeapSnapshotSummary`，给 GET 端点直接读
     *   - 失败时返回 { ok:false, reason, error } 而不是抛异常
     */
    async writeHeapSnapshot(_options: { deleteSnapshotAfterSummary?: boolean } = {}) {
        const startedAt = Date.now();
        let summary: HeapSnapshotSummary;
        try {
            const stream = getHeapSnapshot();
            summary = await summarizeHeapSnapshotFromStream(stream as unknown as NodeJS.ReadableStream, {
                topLimit: HEAP_SNAPSHOT_SUMMARY_TOP_LIMIT,
            });
        } catch (err) {
            const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            return {
                ok: false as const,
                reason: 'heap_snapshot_failed',
                error: reason,
                hint: 'V8 拒绝生成 heap snapshot；通常发生在内存吃紧或权限受限时，先重启进程或扩容 max-old-space-size 再试',
            };
        }

        // 与上一次 summary 计算 diff
        const previousSummary = this.lastHeapSnapshotSummary;
        const finalSummary: HeapSnapshotSummary & { diffSincePrevious?: ReturnType<typeof diffHeapSnapshotSummaries> & { previousAtMs: number } } = { ...summary };
        if (previousSummary) {
            finalSummary.diffSincePrevious = {
                ...diffHeapSnapshotSummaries(previousSummary, summary, 30),
                previousAtMs: previousSummary.generatedAtMs,
            };
        }
        this.lastHeapSnapshotSummary = finalSummary;
        this.lastHeapSnapshotSummaryAt = Date.now();

        return {
            ok: true as const,
            generatedAt: startedAt,
            durationMs: roundMetric(Date.now() - startedAt),
            summary: finalSummary,
        };
    }

    /** 读取最近一次 heap snapshot summary（GET 端点用），如果尚未生成返回 null。 */
    getLatestHeapSnapshotSummary(): { fileName: string; bytes: number; summary: HeapSnapshotSummary } | null {
        if (!this.lastHeapSnapshotSummary) {
            return null;
        }
        const summary = this.lastHeapSnapshotSummary;
        const text = JSON.stringify(summary);
        return {
            fileName: `in-memory-${this.lastHeapSnapshotSummaryAt}.summary.json`,
            bytes: text.length,
            summary,
        };
    }

    /** 手动触发一次 full GC，用于运维确认 heapUsed 是否主要由可回收对象占用。 */
    async triggerManualGc() {
        const now = Date.now();
        if (this.manualGcInProgress) {
            return {
                ok: false,
                reason: 'in_progress',
                hint: '已有一次手动 GC 正在执行，请稍后再试。',
                cooldownMs: MANUAL_GC_COOLDOWN_MS,
                cooldownRemainingMs: 0,
            };
        }
        const elapsedSinceLast = now - this.lastManualGcAt;
        if (this.lastManualGcAt > 0 && elapsedSinceLast < MANUAL_GC_COOLDOWN_MS) {
            return {
                ok: false,
                reason: 'cooldown',
                hint: `手动 GC 冷却中，剩余 ${Math.ceil((MANUAL_GC_COOLDOWN_MS - elapsedSinceLast) / 1000)} 秒。`,
                cooldownMs: MANUAL_GC_COOLDOWN_MS,
                cooldownRemainingMs: MANUAL_GC_COOLDOWN_MS - elapsedSinceLast,
            };
        }
        this.manualGcInProgress = true;
        const before = buildMemoryUsageBytesSnapshot();
        const startedAt = Date.now();
        try {
            await collectGarbageOnce();
            const after = buildMemoryUsageBytesSnapshot();
            this.lastManualGcAt = Date.now();
            return {
                ok: true,
                triggeredAt: this.lastManualGcAt,
                durationMs: this.lastManualGcAt - startedAt,
                cooldownMs: MANUAL_GC_COOLDOWN_MS,
                before,
                after,
                delta: diffMemoryUsageBytesSnapshot(before, after),
            };
        }
        catch (error) {
            const after = buildMemoryUsageBytesSnapshot();
            return {
                ok: false,
                reason: 'gc_failed',
                error: error instanceof Error ? error.message : String(error),
                hint: 'Node 当前进程无法通过 global.gc 或 inspector 触发 GC。',
                cooldownMs: MANUAL_GC_COOLDOWN_MS,
                before,
                after,
                delta: diffMemoryUsageBytesSnapshot(before, after),
            };
        }
        finally {
            this.manualGcInProgress = false;
        }
    }
    /** 汇总在线玩家、地图列表和性能数据，生成 GM 面板快照。 */
    buildState() {

        const mapNamesById = new Map(this.mapTemplateRepository.listSummaries().map((entry) => [entry.id, entry.name]));

        const players = (typeof this.playerRuntimeService.listGmPlayerSummaries === 'function'
            ? this.playerRuntimeService.listGmPlayerSummaries()
            : this.playerRuntimeService.listPlayerSnapshots())
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
                isBot: isNativeGmBotPlayerId(player.playerId),
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

    buildPerformanceSnapshot(options: { includeMemoryEstimate?: boolean } = {}) {

        const summary = this.worldRuntimeService.getRuntimeSummary();
        const includeMemoryEstimate = options?.includeMemoryEstimate === true;

        const loadAvg = loadavg();

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
        const cpuBreakdown = buildCpuBreakdown(summary, this.syncFlushBreakdownHistoryByKey);
        const memoryEstimate = includeMemoryEstimate
            ? this.buildMemoryEstimate(summary, rssBytes)
            : buildSkippedMemoryEstimate(rssBytes);
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
                cores: cpus().length,
                loadAvg1m: roundMetric(loadAvg[0] ?? 0),
                loadAvg5m: roundMetric(loadAvg[1] ?? 0),
                loadAvg15m: roundMetric(loadAvg[2] ?? 0),
                processUptimeSec: roundMetric(processUptimeSec),
                systemUptimeSec: roundMetric(uptime()),
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
            networkStatsEnabled: this.shouldRecordNetworkPerf(),
            networkPayloadCaptureEnabled: this.shouldCaptureNetworkPayloadBody(),
            networkStatsStartedAt: now,
            networkStatsElapsedSec: 0,
            networkInBytes,
            networkOutBytes,
            networkInBuckets: networkInBuckets.length > 0 ? networkInBuckets : EMPTY_NETWORK_BUCKETS,
            networkOutBuckets: networkOutBuckets.length > 0 ? networkOutBuckets : EMPTY_NETWORK_BUCKETS,
            startup: this.startupStatusService ? {
                ...this.startupStatusService.getSnapshot(),
                barrier: this.startupBarrierService?.getSnapshot() ?? null,
            } : null,
            shutdown: this.shutdownStatusService ? this.shutdownStatusService.getSnapshot() : null,
            workerPool: this.workerPoolMetricsService?.getAllMetrics() ?? null,
            flushDiagnostics: this.flushDiagnosticsService?.getSnapshot() ?? null,
            flushStats: this.flushDiagnosticsService ? {
                player: this.flushDiagnosticsService.getPlayerStats(),
                map: this.flushDiagnosticsService.getMapStats(),
            } : null,
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
        const sample = buildNetworkLargePayloadSample(this.shouldCaptureNetworkPayloadBody(), direction, event, payload, measurement);
        if (current) {
            current.bytes += measurement.packetBytes;
            current.count += 1;
            appendNetworkLargePayloadSample(current, sample);
            return;
        }
        // 新 label 首次出现：先做硬上限保护，避免恶意/异常事件让 bucket 无界增长。
        // resolveNetworkPacketLabel 已经收敛到协议枚举 + WorldDelta tag 组合 + unknown，
        // 这里再加一道兜底防线，确保任何遗漏路径都不会撑爆 GM 状态。
        if (bucketByKey.size >= MAX_NETWORK_PERF_BUCKET_LABELS) {
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

function buildSkippedMemoryEstimate(rssBytes) {
    const normalizedRssBytes = roundMetric(Math.max(0, Number(rssBytes) || 0));
    return {
        mode: 'skipped',
        generatedAt: 0,
        cacheTtlMs: 0,
        rssBytes: normalizedRssBytes,
        coveredBytes: 0,
        uncoveredBytes: normalizedRssBytes,
        coveragePercent: 0,
        domains: EMPTY_MEMORY_ESTIMATE_DOMAINS,
        topInstances: EMPTY_MEMORY_ESTIMATE_INSTANCES,
        heapSpaces: EMPTY_HEAP_SPACE_SNAPSHOTS,
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

function estimatePlayerRuntimeBytes(players) {
    if (!(players instanceof Map) || players.size <= 0) {
        return 0;
    }
    let bytes = 0;
    for (const player of players.values()) {
        bytes += 4096;
        bytes += estimateCollectionBytes(player?.inventory?.items, 256);
        bytes += estimateCollectionBytes(player?.equipment?.slots, 192);
        bytes += estimateCollectionBytes(player?.techniques?.techniques, 192);
        bytes += estimateCollectionBytes(player?.actions?.actions, 160);
        bytes += estimateCollectionBytes(player?.quests?.quests, 256);
        bytes += estimateCollectionBytes(player?.buffs?.buffs, 160);
        bytes += estimatePlainObjectBytes(player?.attrs?.finalAttrs, 64);
        bytes += estimatePlainObjectBytes(player?.attrs?.numericStats, 64);
        bytes += estimatePlainObjectBytes(player?.attrs?.ratioDivisors, 48);
        bytes += estimateCollectionBytes(player?.pendingLogbookMessages, 192);
    }
    return roundMetric(bytes);
}

function estimateCollectionBytes(value, bytesPerEntry) {
    if (Array.isArray(value)) {
        return value.length * bytesPerEntry;
    }
    if (value instanceof Map || value instanceof Set) {
        return value.size * bytesPerEntry;
    }
    return 0;
}

function estimatePlainObjectBytes(value, bytesPerField) {
    if (!value || typeof value !== 'object') {
        return 0;
    }
    return Object.keys(value).length * bytesPerField;
}

function estimateRuntimeCollectionBytes(value, bytesPerEntry) {
    if (value == null) {
        return 0;
    }
    if (Array.isArray(value)) {
        return roundMetric(value.length * bytesPerEntry);
    }
    if (value instanceof Map || value instanceof Set) {
        return roundMetric(value.size * bytesPerEntry);
    }
    if (typeof value === 'object') {
        return roundMetric(Object.keys(value).length * bytesPerEntry);
    }
    return 0;
}

/**
 * 估算 GM 自身网络诊断 bucket 与大包样本的字节占用。
 * 每个 bucket 头部 256B；每个 largePayloadSamples 元素 256B 元数据 +
 * UTF-16 代价的 body.length * 2。largePayloadSamples 是已知潜在泄漏点，
 * 长期开启网络诊断时应该看得到这一项膨胀。
 */
function estimateGmNetworkBucketsBytes(inMap, outMap) {
    let bytes = 0;
    for (const map of [inMap, outMap]) {
        if (!(map instanceof Map)) {
            continue;
        }
        for (const bucket of map.values() as Iterable<any>) {
            bytes += 256;
            const samples = bucket?.largePayloadSamples;
            if (Array.isArray(samples)) {
                for (const sample of samples) {
                    const bodyLen = typeof sample?.body === 'string' ? sample.body.length : 0;
                    bytes += 256 + bodyLen * 2;
                }
            }
        }
    }

    return roundMetric(bytes);
}

function buildHeapSpaceSnapshots() {
    try {
        return getHeapSpaceStatistics().map((space) => ({
            name: String(space.space_name ?? ''),
            sizeBytes: roundMetric(Number(space.space_size ?? 0)),
            usedBytes: roundMetric(Number(space.space_used_size ?? 0)),
            availableBytes: roundMetric(Number(space.space_available_size ?? 0)),
            physicalBytes: roundMetric(Number(space.physical_space_size ?? 0)),
        }));
    }
    catch (_error) {
        return [];
    }
}

function buildSortedNetworkBuckets(bucketByKey) {
    return (Array.from(bucketByKey.values()) as any[]).sort((left, right) => {
        if (right.bytes !== left.bytes) {
            return right.bytes - left.bytes;
        }
        if (right.count !== left.count) {
            return right.count - left.count;
        }
        return left.label.localeCompare(right.label, 'zh-Hans-CN');
    }).map((entry) => {
        const bucket: any = {
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
        if (direction === 's2c' && eventKey === S2C.WorldDelta) {
            return direction + "_" + resolveWorldDeltaPacketLabel(protocolName, payload);
        }
        return direction + "_" + protocolName;
    }
    // 拒绝把未识别事件的 raw key 作为 label 写入 bucket：
    // 客户端可以通过 socket 发任意自定义事件名，未做收敛会导致 bucket 标签 cardinality 无界增长。
    // 统一收敛到 `<direction>_unknown` 防止恶意/误用事件名撑爆诊断状态。
    return direction + "_unknown";
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
        };
    }
    if (eventKey === S2C.GmState) {
        return {
            eventKey,
            packetBytes: 0,
            payloadBytes: 0,
        };
    }
    const payloadBytes = estimateNetworkPayloadBytes(payload);
    return {
        eventKey,
        packetBytes: Buffer.byteLength(eventKey, 'utf8') + payloadBytes,
        payloadBytes,
    };
}

function buildNetworkLargePayloadSample(captureEnabled, direction, event, payload, measurement) {
    if (!captureEnabled) {
        return null;
    }
    if (direction === 's2c' && measurement.eventKey === S2C.GmState) {
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
        body: formatNetworkPayloadBody(payload),
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

function formatNetworkPayloadBody(payload) {
    try {
        return JSON.stringify(payload ?? null, null, 2) ?? 'null';
    }
    catch (_error) {
        return '';
    }
}

function estimateNetworkPayloadBytes(payload) {
    const seen = new WeakSet();
    return Math.max(0, Math.trunc(estimateNetworkPayloadValueBytes(payload, 0, seen)));
}

function estimateNetworkPayloadValueBytes(value, depth, seen) {
    if (value == null) {
        return 4;
    }
    const valueType = typeof value;
    if (valueType === 'string') {
        return Buffer.byteLength(value, 'utf8') + 2;
    }
    if (valueType === 'number' || valueType === 'bigint' || valueType === 'boolean') {
        return Buffer.byteLength(String(value), 'utf8');
    }
    if (valueType !== 'object') {
        return 0;
    }
    if (seen.has(value)) {
        return 0;
    }
    if (depth >= NETWORK_PAYLOAD_ESTIMATE_MAX_DEPTH) {
        return 2;
    }
    seen.add(value);
    if (Array.isArray(value)) {
        let bytes = 2;
        for (const entry of value) {
            bytes += 1 + estimateNetworkPayloadValueBytes(entry, depth + 1, seen);
        }
        return bytes;
    }
    let bytes = 2;
    for (const [key, entry] of Object.entries(value)) {
        bytes += Buffer.byteLength(key, 'utf8') + 3 + estimateNetworkPayloadValueBytes(entry, depth + 1, seen);
    }
    return bytes;
}

function isNetworkPerfRecordingEnabled() {
    return isTruthyEnvValue(process.env.SERVER_GM_NETWORK_PERF_ENABLED);
}

function isNetworkPayloadBodyCaptureEnabled() {
    return isTruthyEnvValue(process.env.SERVER_GM_NETWORK_CAPTURE_PAYLOADS) && isDevelopmentLikeEnv();
}

function isDevelopmentLikeEnv() {
    const runtimeEnv = String(process.env.SERVER_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
    return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}

function isTruthyEnvValue(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function buildMemoryUsageBytesSnapshot() {
    const memory = process.memoryUsage();
    return {
        rssBytes: Math.max(0, Math.trunc(Number(memory.rss ?? 0) || 0)),
        heapUsedBytes: Math.max(0, Math.trunc(Number(memory.heapUsed ?? 0) || 0)),
        heapTotalBytes: Math.max(0, Math.trunc(Number(memory.heapTotal ?? 0) || 0)),
        externalBytes: Math.max(0, Math.trunc(Number(memory.external ?? 0) || 0)),
        arrayBuffersBytes: Math.max(0, Math.trunc(Number(memory.arrayBuffers ?? 0) || 0)),
    };
}

function diffMemoryUsageBytesSnapshot(before, after) {
    return {
        rssBytes: after.rssBytes - before.rssBytes,
        heapUsedBytes: after.heapUsedBytes - before.heapUsedBytes,
        heapTotalBytes: after.heapTotalBytes - before.heapTotalBytes,
        externalBytes: after.externalBytes - before.externalBytes,
        arrayBuffersBytes: after.arrayBuffersBytes - before.arrayBuffersBytes,
    };
}

async function collectGarbageOnce(): Promise<void> {
    const exposedGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
    if (typeof exposedGc === 'function') {
        exposedGc();
        return;
    }
    await collectGarbageWithInspector();
}

function collectGarbageWithInspector(): Promise<void> {
    return new Promise((resolve, reject) => {
        const session = new Session();
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            session.disconnect();
            reject(new Error('inspector HeapProfiler.collectGarbage timed out'));
        }, 15_000);
        timer.unref?.();
        const finish = (error?: Error | null) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (error) {
                session.disconnect();
                reject(error);
                return;
            }
            resolve();
            setImmediate(() => {
                session.disconnect();
            });
        };
        session.connect();
        session.post('HeapProfiler.enable', (enableError) => {
            if (enableError) {
                finish(enableError);
                return;
            }
            session.post('HeapProfiler.collectGarbage', (error) => {
                finish(error);
            });
        });
    });
}

function buildCpuBreakdown(summary, syncFlushBreakdownHistoryByKey = null) {
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
        rows.push(...buildSyncFlushBreakdownRows(syncFlushBreakdownHistoryByKey, totalWindowMs));
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

function createSyncFlushBreakdownHistoryByKey() {
    const result = new Map();
    for (const def of SYNC_FLUSH_BREAKDOWN_DEFS) {
        result.set(def.key, []);
    }
    return result;
}

function pushSyncFlushBreakdownMetric(history, totalMs, count) {
    history.push({
        totalMs: roundMetric(Math.max(0, Number(totalMs) || 0)),
        count: Math.max(0, Math.trunc(Number(count) || 0)),
    });
    if (history.length > 60) {
        history.splice(0, history.length - 60);
    }
}

function buildSyncFlushBreakdownRows(syncFlushBreakdownHistoryByKey, totalWindowMs) {
    if (!(syncFlushBreakdownHistoryByKey instanceof Map)) {
        return [];
    }
    const rows = [];
    for (const def of SYNC_FLUSH_BREAKDOWN_DEFS) {
        const history = syncFlushBreakdownHistoryByKey.get(def.key);
        if (!Array.isArray(history) || history.length === 0) {
            continue;
        }
        let totalMs = 0;
        let count = 0;
        for (const entry of history) {
            totalMs += Number(entry?.totalMs ?? 0);
            count += Number(entry?.count ?? 0);
        }
        if (!(totalMs > 0) && count <= 0) {
            continue;
        }
        const key = `syncFlush.${def.key}`;
        rows.push({
            key,
            label: CPU_BREAKDOWN_LABELS[key] ?? key,
            totalMs: roundMetric(totalMs),
            count: Math.max(0, Math.trunc(count)),
            avgMs: count > 0 ? roundMetric(totalMs / count) : 0,
            percent: totalWindowMs > 0 ? roundMetric((totalMs / totalWindowMs) * 100) : 0,
        });
    }
    return rows;
}
