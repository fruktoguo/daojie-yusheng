/**
 * 地图实例定时刷盘服务。
 * 按周期收集脏实例列表，通过分域持久化落库，支持 time checkpoint 降频、
 * 妖兽运行态降频、慢刷盘退避和进程关闭前强刷。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { readTrimmedEnv } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushDiagnosticsService } from './flush-diagnostics.service';

/**
 * 地图分域刷盘周期。
 * - 默认 1500ms：和 PlayerPersistenceFlushService 对齐，缩短"实例(掉落、地块伤害、容器、地表覆盖等)未及时落库 -> 主进程崩溃"
 *   的丢数据窗口。
 * - 通过 SERVER_MAP_PERSISTENCE_FLUSH_INTERVAL_MS / MAP_PERSISTENCE_FLUSH_INTERVAL_MS 可以热改回 5000ms。
 * - 注意：本周期只决定 setInterval 的"驱动节奏"，慢 flush 退避(SLOW_FLUSH_BACKOFF_MS)和 deferred 时间锚点
 *   会自行兜住 PG 压力，不会因为节奏变快而连发。
 */
const MAP_PERSISTENCE_FLUSH_INTERVAL_MS = normalizePositiveInteger(
  readTrimmedEnv('SERVER_MAP_PERSISTENCE_FLUSH_INTERVAL_MS', 'MAP_PERSISTENCE_FLUSH_INTERVAL_MS'),
  1_500,
  250,
  60_000,
);
const MAP_PERSISTENCE_FLUSH_BATCH_SIZE = 16;
const MAP_PERSISTENCE_FLUSH_PARALLELISM = 3;
const MAP_PERSISTENCE_FLUSH_RETRY_COUNT = 1;
const MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD = normalizePositiveInteger(
    readTrimmedEnv('SERVER_MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD', 'MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD'),
    2,
    0,
    100,
);
const PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS = 100;
const MAP_PERSISTENCE_TIME_DOMAIN = 'time';
const MAP_PERSISTENCE_MONSTER_RUNTIME_DOMAIN = 'monster_runtime';
const MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS = normalizePositiveInteger(readTrimmedEnv('SERVER_PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS', 'PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS'), 100, PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS, 10_000);
const MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS = normalizePositiveInteger(readTrimmedEnv('SERVER_PERSISTENCE_FLUSH_SLOW_BACKOFF_MS', 'PERSISTENCE_FLUSH_SLOW_BACKOFF_MS'), 5_000, 1_000, 60_000);
const MAP_PERSISTENCE_TIME_CHECKPOINT_INTERVAL_MS = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS'), 300_000, 60_000, 3_600_000);
const MAP_PERSISTENCE_TIME_CHECKPOINT_BATCH_SIZE = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_TIME_CHECKPOINT_FLUSH_BATCH_SIZE', 'MAP_TIME_CHECKPOINT_FLUSH_BATCH_SIZE'), 16, 1, 256);
const MAP_PERSISTENCE_MONSTER_RUNTIME_INTERVAL_MS = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 'MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS'), 60_000, 10_000, 600_000);
const MAP_PERSISTENCE_MONSTER_RUNTIME_SLOW_THRESHOLD_MS = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_MONSTER_RUNTIME_SLOW_THRESHOLD_MS', 'MAP_MONSTER_RUNTIME_SLOW_THRESHOLD_MS'), 1_000, MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS, 60_000);

/**
 * 高频 dirty 合并窗口（毫秒）。
 * - tile_damage / tile_resource 等高频自动变脏的域，在首次标脏后等待合并窗口到期才上报给 flush cycle。
 * - 玩家主动操作标记为 highPriority 的域不受此限制。
 * - 默认 3000ms：在 1.5s flush 周期下，最多延迟 2 个周期落库，换取大幅减少 PG 写入频次。
 */
const MAP_PERSISTENCE_COALESCE_WINDOW_MS = normalizePositiveInteger(
    readTrimmedEnv('SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS', 'MAP_PERSISTENCE_COALESCE_WINDOW_MS'),
    3_000,
    0,
    30_000,
);
/** 受合并窗口约束的域集合。其他域（container_state, building, room 等）始终立即上报。 */
const MAP_PERSISTENCE_COALESCE_DOMAINS = new Set(['tile_damage', 'tile_resource', 'fengshui']);

/**
 * normalizePositiveInteger：执行normalize正整数相关逻辑。
 * @param value 参数说明。
 * @param defaultValue 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新normalize正整数相关状态。
 */

function normalizePositiveInteger(value, defaultValue, min, max) {
    if (typeof value === 'string' && value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < min) {
        return min;
    }
    if (normalized > max) {
        return max;
    }
    return normalized;
}

/** 地图快照脏实例定时刷盘服务：按周期落库并支持进程关闭前强刷。 */
@Injectable()
export class MapPersistenceFlushService {
/**
 * worldRuntimeService：世界运行态服务引用。
 */

    worldRuntimeService;
    /**
 * logger：日志器引用。
 */

    logger = new Logger(MapPersistenceFlushService.name);
    /**
 * timer：timer相关字段。
 */

    timer = null;
    /**
* flushPromise：flushPromise相关字段。
 */

    flushPromise = null;
    /**
 * flushThrottleUntilAt：flushThrottleUntilAt相关字段。
 */

    flushThrottleUntilAt = 0;
    /**
 * nextTimeCheckpointFlushAt：下一次 interval 允许写入 time checkpoint 的时间。
 */

    nextTimeCheckpointFlushAt = 0;
    /**
     * nextMonsterRuntimeFlushAt：下一次 interval 允许写入高频妖兽运行态的时间。
     */

    nextMonsterRuntimeFlushAt = Date.now() + MAP_PERSISTENCE_MONSTER_RUNTIME_INTERVAL_MS;
    /** 数据库连接池提供者。 */
    databasePoolProvider: any = null;
    /** 刷盘诊断采集器。 */
    flushDiagnostics: any = null;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeService 参数说明。
 * @param mapPersistenceService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldRuntimeService) worldRuntimeService: any,
        @Optional() @Inject(DatabasePoolProvider) databasePoolProvider?: any,
        @Optional() @Inject(FlushDiagnosticsService) flushDiagnostics?: any,
    ) {
        this.worldRuntimeService = worldRuntimeService;
        this.databasePoolProvider = databasePoolProvider ?? null;
        this.flushDiagnostics = flushDiagnostics ?? null;
    }
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    onModuleInit() {
        this.timer = setInterval(() => {
            void this.flushDirtyInstances();
        }, MAP_PERSISTENCE_FLUSH_INTERVAL_MS);
        this.timer.unref();
        this.logger.log(`地图持久化刷新已启动，间隔 ${MAP_PERSISTENCE_FLUSH_INTERVAL_MS}ms，妖兽运行态降频 ${MAP_PERSISTENCE_MONSTER_RUNTIME_INTERVAL_MS}ms`);
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** 应用关闭前强制刷盘一次，避免脏快照丢失。 */
    async beforeApplicationShutdown() {
        await this.flushAllNow();
    }

    /** 执行一次全量脏实例刷盘。 */
    async flushAllNow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled()) {
            return;
        }
        if (this.flushPromise) {
            await this.flushPromise;
        }
        await this.runFlushCycle('shutdown');
    }
    /**
 * flushInstance：执行flush实例相关逻辑。
 * @param instanceId 实例 ID。
 * @returns 无返回值，直接更新flush实例相关状态。
 */

    async flushInstance(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled()) {
            return;
        }
        if (typeof this.worldRuntimeService.flushInstanceDomains === 'function') {
            await this.worldRuntimeService.flushInstanceDomains(instanceId);
            return;
        }
        throw new Error(`instance_domain_flush_unavailable:${instanceId}`);
    }
    /**
 * flushDirtyInstances：执行刷新DirtyInstance相关逻辑。
 * @returns 无返回值，直接更新flushDirtyInstance相关状态。
 */

    async flushDirtyInstances() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isDomainPersistenceEnabled()
            || this.flushPromise
            || isRestoreFreezeActive()
            || this.isFlushThrottleActive()) {
            return;
        }
        if (this.isFlushPoolBackpressureActive()) {
            this.flushThrottleUntilAt = Date.now() + MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS;
            this.logger.warn(`地图 flush 因 flush pool 等待排队而退避：waiting>=${MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD}`);
            return;
        }
        await this.runFlushCycle('interval');
    }

    /** 采集 dirty map 并持久化，失败仅记录错误不中断主循环。 */
    async runFlushCycle(reason) {
        const domainPersistenceEnabled = this.isDomainPersistenceEnabled();
        if (!domainPersistenceEnabled) {
            return;
        }
        const startedAt = performance.now();
        let dirtyInstanceCount = 0;
        let persistedInstanceCount = 0;
        let skippedInstanceCount = 0;
        let coalescedDomainCount = 0;
        const persistedDomainCounts = new Map();

        const promise = (async () => {

            const rawDirtyDomainEntries = domainPersistenceEnabled && typeof this.worldRuntimeService.listDirtyPersistentInstanceDomains === 'function'
                ? this.worldRuntimeService.listDirtyPersistentInstanceDomains()
                : [];
            const now = Date.now();
            const timeCheckpointDue = reason !== 'interval' || now >= this.nextTimeCheckpointFlushAt;
            const monsterRuntimeDue = reason !== 'interval' || now >= this.nextMonsterRuntimeFlushAt;
            const dirtyDomainSelection = selectFlushDomainEntries(rawDirtyDomainEntries, reason, timeCheckpointDue, monsterRuntimeDue, MAP_PERSISTENCE_TIME_CHECKPOINT_BATCH_SIZE);
            coalescedDomainCount = dirtyDomainSelection.coalescedDomainCount ?? 0;
            const dirtyDomainEntries = dirtyDomainSelection.entries;
            const dirtyInstanceIds = dirtyDomainEntries.map((entry) => entry.instanceId);
            dirtyInstanceCount = dirtyInstanceIds.length;
            if (dirtyInstanceIds.length === 0) {
                return;
            }

            // ─── Phase 2: 按 domain 分组批量写入 tile_damage / tile_resource ───
            const batchableDomains = new Set(['tile_damage', 'tile_resource']);
            const persistence = this.worldRuntimeService?.instanceDomainPersistenceService;
            const hasBatchApi = persistence
                && typeof persistence.saveTileDamageDeltaBatch === 'function'
                && typeof persistence.saveTileResourceDeltaBatch === 'function'
                && typeof persistence.saveInstanceRecoveryWatermarkBatch === 'function'
                && typeof this.worldRuntimeService.buildDomainDeltaBatch === 'function';

            // 收集可批量写入的 domain→instanceIds 映射，并从 per-instance entries 中剥离
            const batchDomainInstanceIds: Map<string, string[]> = new Map();
            const remainingDomainEntries: Array<{ instanceId: string; domains: string[] }> = [];

            if (hasBatchApi) {
                for (const entry of dirtyDomainEntries) {
                    const batchDomains: string[] = [];
                    const remainDomains: string[] = [];
                    for (const domain of entry.domains) {
                        if (batchableDomains.has(domain)) {
                            batchDomains.push(domain);
                        } else {
                            remainDomains.push(domain);
                        }
                    }
                    for (const domain of batchDomains) {
                        let ids = batchDomainInstanceIds.get(domain);
                        if (!ids) { ids = []; batchDomainInstanceIds.set(domain, ids); }
                        ids.push(entry.instanceId);
                    }
                    if (remainDomains.length > 0) {
                        remainingDomainEntries.push({ instanceId: entry.instanceId, domains: remainDomains });
                    }
                }
            } else {
                // 无 batch API 时全部走 per-instance 路径
                remainingDomainEntries.push(...dirtyDomainEntries);
            }

            // 执行批量写入
            const deltaConstructStart = performance.now();
            for (const [domain, instanceIds] of batchDomainInstanceIds) {
                try {
                    const deltas = this.worldRuntimeService.buildDomainDeltaBatch(domain, instanceIds);
                    if (!Array.isArray(deltas) || deltas.length === 0) continue;
                    if (domain === 'tile_damage') {
                        await persistence.saveTileDamageDeltaBatch(deltas.map((d) => ({
                            instanceId: d.instanceId, upserts: d.upserts, deletes: d.deletes,
                        })));
                    } else if (domain === 'tile_resource') {
                        await persistence.saveTileResourceDeltaBatch(deltas.map((d) => ({
                            instanceId: d.instanceId, upserts: d.upserts, deletes: d.deletes,
                        })));
                    }
                    // 批量写 watermark
                    const watermarkBatch = deltas
                        .filter((d) => d.watermarkPayload)
                        .map((d) => ({ instanceId: d.instanceId, payload: d.watermarkPayload }));
                    if (watermarkBatch.length > 0) {
                        await persistence.saveInstanceRecoveryWatermarkBatch(watermarkBatch);
                    }
                    // 标记已持久化
                    this.worldRuntimeService.markDomainBatchPersisted(domain, deltas.map((d) => d.instanceId));
                    recordPersistedDomains(persistedDomainCounts, deltas.map(() => domain));
                    persistedInstanceCount += deltas.length;
                } catch (error) {
                    this.logger.error(`地图批量持久化失败（${reason}） domain=${domain}`, error instanceof Error ? error.stack : String(error));
                }
            }
            const deltaConstructMs = performance.now() - deltaConstructStart;

            // ─── 剩余 domain 走原有 per-instance 路径 ───
            if (remainingDomainEntries.length > 0) {
                const prioritizedInstanceIds = prioritizeMapFlushTargets(remainingDomainEntries.map((e) => e.instanceId));
                const remainingEntryByInstanceId = new Map(remainingDomainEntries.map((entry) => [entry.instanceId, entry]));
                const batches = chunkValues(prioritizedInstanceIds, MAP_PERSISTENCE_FLUSH_BATCH_SIZE);
                for (const batch of batches) {
                    await runConcurrent(batch, MAP_PERSISTENCE_FLUSH_PARALLELISM, async (instanceId) => {
                        const domainEntry = remainingEntryByInstanceId.get(instanceId);
                        if (typeof this.worldRuntimeService.flushInstanceDomains === 'function') {
                            const result = await this.worldRuntimeService.flushInstanceDomains(instanceId, domainEntry?.domains ?? null);
                            if (result?.skipped === true) {
                                skippedInstanceCount += 1;
                                return;
                            }
                            const persistedDomains = Array.isArray(result?.persistedDomains)
                                ? result.persistedDomains
                                : (Array.isArray(domainEntry?.domains) ? domainEntry.domains : ['domain']);
                            recordPersistedDomains(persistedDomainCounts, persistedDomains);
                        }
                        persistedInstanceCount += 1;
                    }, (instanceId, error) => {
                        this.logger.error(`地图持久化刷新失败（${reason}） instanceId=${instanceId}`, error instanceof Error ? error.stack : String(error));
                    });
                }
            }

            if (reason === 'interval' && dirtyDomainSelection.includesTimeCheckpoint === true) {
                this.nextTimeCheckpointFlushAt = Date.now() + (dirtyDomainSelection.hasDeferredTimeCheckpoint === true
                    ? MAP_PERSISTENCE_FLUSH_INTERVAL_MS
                    : MAP_PERSISTENCE_TIME_CHECKPOINT_INTERVAL_MS);
            }
            if (reason === 'interval' && dirtyDomainSelection.includesMonsterRuntime === true) {
                this.nextMonsterRuntimeFlushAt = Date.now() + MAP_PERSISTENCE_MONSTER_RUNTIME_INTERVAL_MS;
            }
        })();
        this.flushPromise = promise;
        try {
            await promise;
        }
        finally {
            if (this.flushPromise === promise) {
                this.flushPromise = null;
            }
            if (reason === 'interval') {
                const durationMs = performance.now() - startedAt;
                this.updateFlushThrottle(durationMs, dirtyInstanceCount, persistedInstanceCount, skippedInstanceCount, persistedDomainCounts);
                // 上报诊断
                if (dirtyInstanceCount > 0 && this.flushDiagnostics) {
                    const domainCountsObj: Record<string, number> = {};
                    for (const [k, v] of persistedDomainCounts) {
                        domainCountsObj[k] = v;
                    }
                    this.flushDiagnostics.reportMapFlush({
                        dirtyInstanceCount,
                        persistedInstanceCount,
                        domainCounts: domainCountsObj,
                        coalescedDomainCount,
                        deltaConstructMs: 0,
                        dbWriteMs: Math.round(durationMs),
                        watermarkMs: 0,
                        totalMs: Math.round(durationMs),
                        timestamp: Date.now(),
                    });
                }
            }
        }
    }

    isFlushThrottleActive() {
        return Date.now() < this.flushThrottleUntilAt;
    }

    isFlushPoolBackpressureActive() {
        const stats = this.databasePoolProvider?.getPoolStats?.('flush');
        return Boolean(stats && stats.waitingCount >= MAP_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD);
    }

    isDomainPersistenceEnabled() {
        const service = this.worldRuntimeService?.instanceDomainPersistenceService;
        return Boolean(service && typeof service.isEnabled === 'function' && service.isEnabled());
    }

    isLegacySnapshotWriteEnabled() {
        return false;
    }

    updateFlushThrottle(durationMs, dirtyInstanceCount = 0, persistedInstanceCount = 0, skippedInstanceCount = 0, persistedDomainCounts = new Map()) {
        const slowThresholdMs = resolveSlowFlushThresholdMs(persistedDomainCounts);
        if (durationMs < slowThresholdMs) {
            return;
        }
        this.flushThrottleUntilAt = Date.now() + MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS;
        const domainCounts = formatDomainCounts(persistedDomainCounts);
        this.logger.warn(`地图最终一致刷盘触发降级退避：durationMs=${Math.trunc(durationMs)} thresholdMs=${slowThresholdMs} backoffMs=${MAP_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS} dirtyInstanceCount=${dirtyInstanceCount} persistedInstanceCount=${persistedInstanceCount} skippedInstanceCount=${skippedInstanceCount}${domainCounts ? ` domainCounts=${domainCounts}` : ''}`);
    }
}
/**
 * isRestoreFreezeActive：判断RestoreFreeze激活是否满足条件。
 * @returns 无返回值，完成RestoreFreeze激活的条件判断。
 */

function isRestoreFreezeActive() {

    const value = process.env.SERVER_RUNTIME_RESTORE_ACTIVE;
    return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}
/**
 * prioritizeMapFlushTargets：读取prioritize地图刷新目标并返回结果。
 * @param instanceIds instance ID 集合。
 * @returns 无返回值，直接更新prioritize地图Flush目标相关状态。
 */

function prioritizeMapFlushTargets(instanceIds) {
    return [...instanceIds].sort((left, right) => {
        const leftPriority = left.includes('container:') ? 0 : 1;
        const rightPriority = right.includes('container:') ? 0 : 1;
        return leftPriority - rightPriority || left.localeCompare(right);
    });
}
function selectFlushDomainEntries(entries, reason, timeCheckpointDue, monsterRuntimeDue, timeCheckpointBatchSize = MAP_PERSISTENCE_TIME_CHECKPOINT_BATCH_SIZE) {
    if (!Array.isArray(entries) || entries.length === 0 || reason !== 'interval') {
        return {
            entries: Array.isArray(entries) ? entries : [],
            includesTimeCheckpoint: hasTimeCheckpointDomain(entries),
            includesMonsterRuntime: hasMonsterRuntimeDomain(entries),
            hasDeferredTimeCheckpoint: false,
            coalescedDomainCount: 0,
        };
    }
    const selected = [];
    let includesTimeCheckpoint = false;
    let includesMonsterRuntime = false;
    let selectedTimeCheckpointCount = 0;
    let hasDeferredTimeCheckpoint = false;
    let coalescedDomainCount = 0;
    const now = Date.now();
    const coalesceWindowMs = MAP_PERSISTENCE_COALESCE_WINDOW_MS;
    const normalizedTimeCheckpointBatchSize = Math.max(1, Math.trunc(Number(timeCheckpointBatchSize) || MAP_PERSISTENCE_TIME_CHECKPOINT_BATCH_SIZE));
    for (const entry of entries) {
        const instanceId = typeof entry?.instanceId === 'string' ? entry.instanceId.trim() : '';
        const domainMeta = entry?.domainMeta ?? {};
        const domains = Array.isArray(entry?.domains)
            ? entry.domains.filter((domain) => {
                if (typeof domain !== 'string' || !domain.trim()) {
                    return false;
                }
                const normalizedDomain = domain.trim();
                if (normalizedDomain === MAP_PERSISTENCE_TIME_DOMAIN) {
                    if (timeCheckpointDue === true && selectedTimeCheckpointCount < normalizedTimeCheckpointBatchSize) {
                        selectedTimeCheckpointCount += 1;
                        includesTimeCheckpoint = true;
                        return true;
                    }
                    if (timeCheckpointDue === true) {
                        hasDeferredTimeCheckpoint = true;
                    }
                    return false;
                }
                if (normalizedDomain === MAP_PERSISTENCE_MONSTER_RUNTIME_DOMAIN) {
                    if (monsterRuntimeDue === true) {
                        includesMonsterRuntime = true;
                        return true;
                    }
                    return false;
                }
                // ─── 合并窗口过滤 ───
                if (coalesceWindowMs > 0 && MAP_PERSISTENCE_COALESCE_DOMAINS.has(normalizedDomain)) {
                    const meta = domainMeta[normalizedDomain];
                    const isHighPriority = meta?.highPriority === true;
                    if (!isHighPriority) {
                        const firstMarkedAt = typeof meta?.firstMarkedAt === 'number' ? meta.firstMarkedAt : 0;
                        const elapsed = firstMarkedAt > 0 ? now - firstMarkedAt : coalesceWindowMs;
                        if (elapsed < coalesceWindowMs) {
                            coalescedDomainCount += 1;
                            return false;
                        }
                    }
                }
                return true;
            })
            : [];
        if (instanceId && domains.length > 0) {
            selected.push({ instanceId, domains });
        }
    }
    return { entries: selected, includesTimeCheckpoint, includesMonsterRuntime, hasDeferredTimeCheckpoint, coalescedDomainCount };
}
function hasTimeCheckpointDomain(entries) {
    return Array.isArray(entries)
        && entries.some((entry) => Array.isArray(entry?.domains)
            && entry.domains.some((domain) => typeof domain === 'string' && domain.trim() === MAP_PERSISTENCE_TIME_DOMAIN));
}
function hasMonsterRuntimeDomain(entries) {
    return Array.isArray(entries)
        && entries.some((entry) => Array.isArray(entry?.domains)
            && entry.domains.some((domain) => typeof domain === 'string' && domain.trim() === MAP_PERSISTENCE_MONSTER_RUNTIME_DOMAIN));
}
function recordPersistedDomains(counts, domains) {
    for (const domain of Array.isArray(domains) ? domains : []) {
        const normalizedDomain = typeof domain === 'string' && domain.trim() ? domain.trim() : 'unknown';
        counts.set(normalizedDomain, (counts.get(normalizedDomain) ?? 0) + 1);
    }
}
function formatDomainCounts(counts) {
    if (!(counts instanceof Map) || counts.size === 0) {
        return '';
    }
    return Array.from(counts.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([domain, count]) => `${domain}:${count}`)
        .join(',');
}
function resolveSlowFlushThresholdMs(persistedDomainCounts) {
    if (persistedDomainCounts instanceof Map && persistedDomainCounts.has(MAP_PERSISTENCE_MONSTER_RUNTIME_DOMAIN)) {
        return Math.max(MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS, MAP_PERSISTENCE_MONSTER_RUNTIME_SLOW_THRESHOLD_MS);
    }
    return MAP_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS;
}
/**
 * chunkValues：执行chunk值相关逻辑。
 * @param values 参数说明。
 * @param chunkSize 参数说明。
 * @returns 无返回值，直接更新chunk值相关状态。
 */

function chunkValues(values, chunkSize) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(values) || values.length === 0) {
        return [];
    }
    const normalizedChunkSize = Math.max(1, Math.trunc(chunkSize));
    const chunks = [];
    for (let index = 0; index < values.length; index += normalizedChunkSize) {
        chunks.push(values.slice(index, index + normalizedChunkSize));
    }
    return chunks;
}
/**
 * runConcurrent：执行runConcurrent相关逻辑。
 * @param values 参数说明。
 * @param parallelism 参数说明。
 * @param worker 参数说明。
 * @param onError 参数说明。
 * @returns 无返回值，直接更新runConcurrent相关状态。
 */

async function runConcurrent(values, parallelism, worker, onError) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedParallelism = Math.max(1, Math.trunc(parallelism));
    for (let index = 0; index < values.length; index += normalizedParallelism) {
        const slice = values.slice(index, index + normalizedParallelism);
        const results = await Promise.allSettled(slice.map((value) => worker(value)));
        results.forEach((result, resultIndex) => {
            if (result.status === 'rejected') {
                onError?.(slice[resultIndex], result.reason);
            }
        });
    }
}
/**
 * retryFlush：执行retry刷新相关逻辑。
 * @param retryCount 参数说明。
 * @param work 参数说明。
 * @returns 无返回值，直接更新retryFlush相关状态。
 */

async function retryFlush(retryCount, work) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const attempts = Math.max(0, Math.trunc(retryCount)) + 1;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await work();
            return;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}
