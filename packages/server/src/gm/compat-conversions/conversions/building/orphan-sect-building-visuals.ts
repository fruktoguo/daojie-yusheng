/**
 * 清理历史建筑占格错位遗留的宗门孤儿门窗投影。
 *
 * 宗门地图生成真源只包含地板与边界石，门窗只能由建筑系统投影。转换同时读取数据库与
 * 本节点权威运行态；apply 只修改持有可写 lease 的持久实例，并通过标准实例分域刷盘回读。
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { StructureType } from '@mud/shared';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import { WorldRuntimeService } from '../../../../runtime/world/world-runtime.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const ORPHAN_SECT_BUILDING_VISUALS_CONVERSION_ID = 'building_orphan_sect_visuals';

const SAMPLE_LIMIT = 10;
// room/fengshui 的持久化入口会连同 building 快照一起保存，必须持有同一组分域锁。
const CONVERSION_DOMAINS = ['building', 'tile_cell', 'tile_damage', 'room', 'fengshui'] as const;
const DOOR_BUILDING_DEF_ID = 'wooden_door';
const WINDOW_BUILDING_DEF_ID = 'wooden_window';

interface OrphanVisualCandidate {
  instanceId: string;
  x: number;
  y: number;
  tileType: string;
  structureType: string;
  hasTileDamage: boolean;
  persisted: boolean;
  runtime: boolean;
}

interface SectBuildingVisualScanResult {
  eligible?: boolean;
  candidates?: Array<{
    instanceId?: string;
    x?: number;
    y?: number;
    tileType?: string;
    structureType?: string;
    hasTileDamage?: boolean;
  }>;
}

interface SectBuildingVisualCleanupResult extends SectBuildingVisualScanResult {
  removedCount?: number;
  clearedTileDamageCount?: number;
}

interface SectBuildingVisualRuntime {
  meta?: {
    instanceId?: string;
    persistent?: boolean;
  };
  scanOrphanSectBuildingVisuals?(): SectBuildingVisualScanResult;
  removeOrphanSectBuildingVisuals?(): SectBuildingVisualCleanupResult;
  markPersistenceDirtyDomainsHighPriority?(domains: readonly string[]): void;
  runExclusivePersistenceDomainMutation?<T>(
    domains: readonly string[],
    action: () => Promise<T> | T,
  ): Promise<T>;
}

interface WorldRuntimeServiceLike {
  listInstanceEntries(): Iterable<[string, SectBuildingVisualRuntime]>;
  isInstanceLeaseWritable?(instance: SectBuildingVisualRuntime): boolean;
  flushInstanceDomains?(
    instanceId: string,
    domains?: readonly string[] | null,
  ): Promise<{ persistedDomains?: string[]; skipped?: boolean }>;
}

interface CandidateSnapshot {
  candidates: OrphanVisualCandidate[];
  runtimeByInstanceId: Map<string, SectBuildingVisualRuntime>;
  runtimeCandidateKeys: Set<string>;
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: ORPHAN_SECT_BUILDING_VISUALS_CONVERSION_ID,
    mode,
    matchedRows: 0,
    convertedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    verifiedRows: 0,
    samples: [],
    errors: [],
  };
}

function buildCandidateKey(instanceId: string, x: number, y: number): string {
  return `${instanceId}\u0000${x}\u0000${y}`;
}

function normalizeCoordinate(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function buildSample(candidate: OrphanVisualCandidate): GmCompatConversionSample {
  return {
    id: `${candidate.instanceId}:${candidate.x},${candidate.y}`,
    name: candidate.structureType === StructureType.Door ? '孤儿木门投影' : '孤儿木窗投影',
    status: 'orphan_building_visual',
    before: {
      instanceId: candidate.instanceId,
      x: candidate.x,
      y: candidate.y,
      tileType: candidate.tileType,
      structureType: candidate.structureType,
      hasTileDamage: candidate.hasTileDamage,
      persisted: candidate.persisted,
      runtime: candidate.runtime,
    },
    after: {
      structureType: null,
      tileDamageCleared: candidate.hasTileDamage,
    },
  };
}

@Injectable()
export class OrphanSectBuildingVisualsConversion {
  private readonly logger = new Logger(OrphanSectBuildingVisualsConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-orphan-sect-building-visuals');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }

    const result = createEmptyResult(options.mode);
    const initial = await this.collectCandidates(pool);
    result.matchedRows = initial.candidates.length;
    result.samples = initial.candidates.slice(0, SAMPLE_LIMIT).map(buildSample);

    const eligibleByInstanceId = new Map<string, OrphanVisualCandidate[]>();
    for (const candidate of initial.candidates) {
      const key = buildCandidateKey(candidate.instanceId, candidate.x, candidate.y);
      const runtime = initial.runtimeByInstanceId.get(candidate.instanceId);
      const leaseWritable = Boolean(
        runtime
        && typeof this.worldRuntimeService.isInstanceLeaseWritable === 'function'
        && this.worldRuntimeService.isInstanceLeaseWritable(runtime),
      );
      if (!runtime
        || runtime.meta?.persistent !== true
        || !leaseWritable
        || typeof runtime.removeOrphanSectBuildingVisuals !== 'function'
        || typeof runtime.markPersistenceDirtyDomainsHighPriority !== 'function'
        || typeof runtime.runExclusivePersistenceDomainMutation !== 'function'
        || typeof this.worldRuntimeService.flushInstanceDomains !== 'function'
        || (!initial.runtimeCandidateKeys.has(key) && candidate.persisted !== true)) {
        result.skippedRows += 1;
        continue;
      }
      const candidates = eligibleByInstanceId.get(candidate.instanceId) ?? [];
      candidates.push(candidate);
      eligibleByInstanceId.set(candidate.instanceId, candidates);
    }

    const eligibleCount = Array.from(eligibleByInstanceId.values())
      .reduce((total, candidates) => total + candidates.length, 0);
    if (result.skippedRows > 0) {
      result.errors.push(
        `${result.skippedRows} 个候选未满足本节点持久运行态、可写 lease 或标准刷盘条件，已跳过`,
      );
    }

    if (options.mode === 'dry-run') {
      result.convertedRows = eligibleCount;
      result.verifiedRows = eligibleCount;
      await this.recordAudit(result, options);
      return result;
    }

    const appliedCandidateByKey = new Map<string, OrphanVisualCandidate>();
    for (const [instanceId, candidates] of eligibleByInstanceId.entries()) {
      const runtime = initial.runtimeByInstanceId.get(instanceId);
      if (!runtime?.runExclusivePersistenceDomainMutation
        || !runtime.removeOrphanSectBuildingVisuals
        || !runtime.markPersistenceDirtyDomainsHighPriority) {
        result.failedRows += candidates.length;
        continue;
      }
      try {
        await runtime.runExclusivePersistenceDomainMutation(CONVERSION_DOMAINS, async () => {
          if (typeof this.worldRuntimeService.isInstanceLeaseWritable !== 'function'
            || !this.worldRuntimeService.isInstanceLeaseWritable(runtime)) {
            throw new Error(`orphan_building_visual_lease_not_writable:${instanceId}`);
          }
          const cleanup = runtime.removeOrphanSectBuildingVisuals?.();
          const removedCount = Math.max(0, Math.trunc(Number(cleanup?.removedCount) || 0));
          const runtimeCandidateCount = candidates.filter((candidate) => initial.runtimeCandidateKeys.has(
            buildCandidateKey(candidate.instanceId, candidate.x, candidate.y),
          )).length;
          if (removedCount !== runtimeCandidateCount) {
            throw new Error(`orphan_building_visual_runtime_count_mismatch:${removedCount}/${runtimeCandidateCount}`);
          }
          // 即使运行态已在前一次失败尝试中修好，也要强制全量重写相关持久化域，保证重试可收敛。
          runtime.markPersistenceDirtyDomainsHighPriority?.(CONVERSION_DOMAINS);
          const flushResult = await this.worldRuntimeService.flushInstanceDomains?.(
            instanceId,
            CONVERSION_DOMAINS,
          );
          if (!flushResult || flushResult.skipped === true) {
            throw new Error(`orphan_building_visual_flush_skipped:${instanceId}`);
          }
        });
        for (const candidate of candidates) {
          appliedCandidateByKey.set(
            buildCandidateKey(candidate.instanceId, candidate.x, candidate.y),
            candidate,
          );
        }
      } catch (error) {
        result.failedRows += candidates.length;
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${instanceId}: ${message}`);
        this.logger.error(`宗门孤儿门窗清理失败：instance=${instanceId} ${message}`);
      }
    }

    const after = await this.collectCandidates(pool);
    const remainingKeys = new Set(after.candidates.map((candidate) => (
      buildCandidateKey(candidate.instanceId, candidate.x, candidate.y)
    )));
    for (const [key, candidate] of appliedCandidateByKey.entries()) {
      if (remainingKeys.has(key)) {
        result.failedRows += 1;
        result.errors.push(`${candidate.instanceId}/${candidate.x},${candidate.y}: apply 后回读仍存在`);
        continue;
      }
      result.convertedRows += 1;
      result.verifiedRows += 1;
    }
    if (result.convertedRows > 0) {
      result.appliedAt = new Date().toISOString();
    }

    this.logger.log(
      `宗门孤儿门窗转换完成：命中 ${result.matchedRows}，清理 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，失败 ${result.failedRows}，回读验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  /** 数据库与权威运行态交叉收集；union 可暴露“只在一侧存在”的恢复异常。 */
  private async collectCandidates(pool: Pool): Promise<CandidateSnapshot> {
    const persistedRows = await this.loadPersistedCandidates(pool);
    const runtimeByInstanceId = new Map<string, SectBuildingVisualRuntime>();
    const runtimeCandidateByKey = new Map<string, OrphanVisualCandidate>();

    for (const [entryInstanceId, runtime] of this.worldRuntimeService.listInstanceEntries()) {
      if (!runtime || typeof runtime.scanOrphanSectBuildingVisuals !== 'function') {
        continue;
      }
      const instanceId = typeof runtime.meta?.instanceId === 'string' && runtime.meta.instanceId.trim()
        ? runtime.meta.instanceId.trim()
        : entryInstanceId;
      runtimeByInstanceId.set(instanceId, runtime);
      const scan = runtime.scanOrphanSectBuildingVisuals();
      for (const entry of Array.isArray(scan?.candidates) ? scan.candidates : []) {
        const x = normalizeCoordinate(entry?.x);
        const y = normalizeCoordinate(entry?.y);
        const structureType = typeof entry?.structureType === 'string' ? entry.structureType : '';
        if (x === null
          || y === null
          || (structureType !== StructureType.Door && structureType !== StructureType.Window)) {
          continue;
        }
        const candidate: OrphanVisualCandidate = {
          instanceId,
          x,
          y,
          tileType: typeof entry?.tileType === 'string' ? entry.tileType : structureType,
          structureType,
          hasTileDamage: entry?.hasTileDamage === true,
          persisted: false,
          runtime: true,
        };
        runtimeCandidateByKey.set(buildCandidateKey(instanceId, x, y), candidate);
      }
    }

    const merged = new Map<string, OrphanVisualCandidate>();
    for (const candidate of persistedRows) {
      merged.set(buildCandidateKey(candidate.instanceId, candidate.x, candidate.y), candidate);
    }
    for (const [key, candidate] of runtimeCandidateByKey.entries()) {
      const persisted = merged.get(key);
      merged.set(key, persisted
        ? {
            ...persisted,
            tileType: candidate.tileType,
            structureType: candidate.structureType,
            hasTileDamage: persisted.hasTileDamage || candidate.hasTileDamage,
            runtime: true,
          }
        : candidate);
    }

    return {
      candidates: Array.from(merged.values()).sort((left, right) => (
        left.instanceId.localeCompare(right.instanceId, 'zh-Hans-CN')
        || left.y - right.y
        || left.x - right.x
      )),
      runtimeByInstanceId,
      runtimeCandidateKeys: new Set(runtimeCandidateByKey.keys()),
    };
  }

  /** 只匹配宗门持久化门窗，且同坐标不存在仍应投影的有效木门/木窗建筑。 */
  private async loadPersistedCandidates(pool: Pool): Promise<OrphanVisualCandidate[]> {
    const rows = await pool.query(
      `SELECT cell.instance_id,
              cell.x,
              cell.y,
              cell.tile_type,
              cell.structure_type,
              EXISTS (
                SELECT 1
                  FROM instance_tile_damage_state damage
                 WHERE damage.instance_id = cell.instance_id
                   AND damage.x = cell.x
                   AND damage.y = cell.y
              ) AS has_tile_damage
         FROM instance_tile_cell cell
        WHERE cell.instance_id LIKE 'sect:%'
          AND cell.structure_type = ANY($1::varchar[])
          AND NOT EXISTS (
                SELECT 1
                  FROM instance_building_state building
                 WHERE building.instance_id = cell.instance_id
                   AND building.x = cell.x
                   AND building.y = cell.y
                   AND building.state NOT IN ('planned', 'building', 'destroyed')
                   AND (
                     (cell.structure_type = $2 AND building.def_id = $4)
                     OR (cell.structure_type = $3 AND building.def_id = $5)
                   )
              )
        ORDER BY cell.instance_id ASC, cell.y ASC, cell.x ASC`,
      [
        [StructureType.Door, StructureType.Window],
        StructureType.Door,
        StructureType.Window,
        DOOR_BUILDING_DEF_ID,
        WINDOW_BUILDING_DEF_ID,
      ],
    );
    const candidates: OrphanVisualCandidate[] = [];
    for (const row of rows.rows as Array<Record<string, unknown>>) {
      const instanceId = typeof row.instance_id === 'string' ? row.instance_id.trim() : '';
      const x = normalizeCoordinate(row.x);
      const y = normalizeCoordinate(row.y);
      const structureType = typeof row.structure_type === 'string' ? row.structure_type : '';
      if (!instanceId
        || x === null
        || y === null
        || (structureType !== StructureType.Door && structureType !== StructureType.Window)) {
        continue;
      }
      candidates.push({
        instanceId,
        x,
        y,
        tileType: typeof row.tile_type === 'string' ? row.tile_type : structureType,
        structureType,
        hasTileDamage: row.has_tile_damage === true,
        persisted: true,
        runtime: false,
      });
    }
    return candidates;
  }

  private async recordAudit(
    result: GmCompatConversionRunResult,
    options: GmCompatConversionRunOptions,
  ): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${ORPHAN_SECT_BUILDING_VISUALS_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: ORPHAN_SECT_BUILDING_VISUALS_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: {
          mode: options.mode,
          instanceScope: 'sect:*',
          structureTypes: [StructureType.Door, StructureType.Window],
        },
        after: {
          matchedRows: result.matchedRows,
          convertedRows: result.convertedRows,
          skippedRows: result.skippedRows,
          failedRows: result.failedRows,
          verifiedRows: result.verifiedRows,
        },
        delta: {
          sampleIds: result.samples.map((sample) => sample.id),
          errors: result.errors.slice(0, 20),
        },
        success: result.failedRows === 0,
        errorMessage: result.failedRows === 0 ? null : result.errors.slice(0, 3).join('; '),
      });
    } catch (error) {
      this.logger.warn(`宗门孤儿门窗转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
