/**
 * 玩家传功任务、强化工件引用与制造队列历史结构的一键兼容转换。
 *
 * 历史存档中可能存在：
 * 1. pendingComprehensions 中的 activeTransferJob（需迁移为 progression.transmissionJob）
 * 2. enhancementJob.item 直接内联物品快照（需迁入 inventory.lockedItems 并关联 itemInstanceId）
 * 3. alchemyJob / forgingJob / enhancementJob 中的 queuedJobs（需合并入 techniqueActivityQueue）
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { DatabasePoolProvider } from '../../../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../../../persistence/gm-audit-log-persistence.service';
import type {
  GmCompatConversionRunOptions,
  GmCompatConversionRunResult,
  GmCompatConversionSample,
} from '../../types';

export const PLAYER_TECHNIQUE_JOBS_CONVERSION_ID = 'player_technique_jobs';

const PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';
const SAMPLE_LIMIT = 10;
const TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 10;

interface SnapshotCandidateRow {
  player_id: string;
  payload: Record<string, any>;
}

interface PlayerJobCandidate {
  playerId: string;
  reasons: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  updatedPayload: Record<string, unknown>;
}

function createEmptyResult(mode: GmCompatConversionRunOptions['mode']): GmCompatConversionRunResult {
  return {
    ok: true,
    conversionId: PLAYER_TECHNIQUE_JOBS_CONVERSION_ID,
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

function buildSample(candidate: PlayerJobCandidate): GmCompatConversionSample {
  return {
    id: candidate.playerId,
    name: `玩家技艺与传功任务 (${candidate.reasons.join(', ')})`,
    status: 'convertible_legacy_player_jobs',
    before: candidate.before,
    after: candidate.after,
  };
}

@Injectable()
export class PlayerTechniqueJobsConversion {
  private readonly logger = new Logger(PlayerTechniqueJobsConversion.name);

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider,
    @Optional()
    @Inject(GmAuditLogPersistenceService)
    private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
  ) {}

  async run(options: GmCompatConversionRunOptions): Promise<GmCompatConversionRunResult> {
    const pool = this.databasePoolProvider.getPool('gm-compat-player-technique-jobs');
    if (!pool) {
      throw new ServiceUnavailableException('database_unavailable');
    }

    const result = createEmptyResult(options.mode);
    const rows = await this.loadRows(pool);
    result.matchedRows = rows.length;

    const candidates: PlayerJobCandidate[] = [];
    for (const row of rows) {
      const candidate = analyzePlayerSnapshot(row);
      if (candidate) {
        candidates.push(candidate);
      } else {
        result.skippedRows += 1;
      }
    }

    result.samples = candidates.slice(0, SAMPLE_LIMIT).map(buildSample);

    if (options.mode === 'dry-run') {
      result.convertedRows = candidates.length;
      result.verifiedRows = candidates.length;
      await this.recordAudit(result, options);
      return result;
    }

    if (candidates.length === 0) {
      result.appliedAt = new Date().toISOString();
      await this.recordAudit(result, options);
      return result;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const candidate of candidates) {
        await client.query(
          `
            UPDATE ${PLAYER_SNAPSHOT_TABLE}
               SET payload = $2::jsonb,
                   updated_at = now()
             WHERE player_id = $1
          `,
          [candidate.playerId, JSON.stringify(candidate.updatedPayload)],
        );
      }
      await client.query('COMMIT');
      result.convertedRows = candidates.length;
      result.verifiedRows = candidates.length;
      result.appliedAt = new Date().toISOString();
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      result.convertedRows = 0;
      result.failedRows = candidates.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
      this.logger.error(`玩家技艺与传功任务转换失败并已回滚：${result.errors[result.errors.length - 1]}`);
      await this.recordAudit(result, options);
      return result;
    } finally {
      client.release();
    }

    this.logger.log(
      `玩家技艺与传功任务转换完成：扫描 ${result.matchedRows}，转换 ${result.convertedRows}，`
      + `跳过 ${result.skippedRows}，验证 ${result.verifiedRows}`,
    );
    await this.recordAudit(result, options);
    return result;
  }

  private async loadRows(pool: Pool): Promise<SnapshotCandidateRow[]> {
    const result = await pool.query(
      `
        SELECT player_id, payload
          FROM ${PLAYER_SNAPSHOT_TABLE}
         ORDER BY player_id ASC
      `,
    );
    return result.rows as SnapshotCandidateRow[];
  }

  private async recordAudit(result: GmCompatConversionRunResult, options: GmCompatConversionRunOptions): Promise<void> {
    if (!this.gmAuditLogPersistenceService) {
      return;
    }
    try {
      await this.gmAuditLogPersistenceService.recordEntry({
        op: `gm.compat.${PLAYER_TECHNIQUE_JOBS_CONVERSION_ID}.${options.mode}`,
        targetType: 'compat_conversion',
        targetId: PLAYER_TECHNIQUE_JOBS_CONVERSION_ID,
        actor: options.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
        before: { mode: options.mode },
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
      this.logger.warn(`玩家技艺与传功任务转换审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function analyzePlayerSnapshot(row: SnapshotCandidateRow): PlayerJobCandidate | null {
  const payload = row.payload && typeof row.payload === 'object' ? JSON.parse(JSON.stringify(row.payload)) : null;
  if (!payload) return null;

  const reasons: string[] = [];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  let changed = false;

  // 1. Legacy transmission job in pendingComprehensions
  const pending = Array.isArray(payload.techniques?.pendingComprehensions) ? payload.techniques.pendingComprehensions : [];
  for (const entry of pending) {
    if (entry?.activeTransferJob && typeof entry.activeTransferJob === 'object') {
      reasons.push('legacy_transfer_job');
      before.legacyTransferJob = entry.activeTransferJob;
      if (!payload.progression) payload.progression = {};
      if (!payload.progression.transmissionJob) {
        const transfer = entry.activeTransferJob;
        const techId = typeof entry.techId === 'string' ? entry.techId.trim() : '';
        const requiredProgress = Math.max(1, Math.floor(Number(entry.requiredProgress) || 1));
        const progress = Math.max(0, Number(entry.progress) || 0);
        const remaining = Math.max(0, Math.ceil(requiredProgress - Math.min(requiredProgress, progress)));
        payload.progression.transmissionJob = {
          jobRunId: typeof transfer.jobId === 'string' && transfer.jobId.trim() ? transfer.jobId.trim() : randomUUID(),
          jobType: 'transmission',
          jobVersion: 1,
          techniqueId: techId,
          techniqueName: entry.name ?? '未知功法',
          teacherPlayerId: transfer.teacherPlayerId,
          teacherName: transfer.teacherName,
          range: transfer.range ?? 2,
          realmLv: entry.realmLv ?? 1,
          grade: entry.grade,
          category: entry.category,
          status: transfer.status ?? 'active',
          blockedReason: transfer.blockedReason,
          phase: Number(transfer.interruptWaitRemainingTicks ?? 0) > 0 ? 'paused' : 'transmitting',
          startedAt: transfer.startedAtTick ?? 0,
          totalTicks: requiredProgress,
          remainingTicks: remaining,
          workTotalTicks: requiredProgress,
          workRemainingTicks: remaining,
          pausedTicks: transfer.interruptWaitRemainingTicks ?? 0,
          interruptWaitRemainingTicks: transfer.interruptWaitRemainingTicks,
        };
        after.transmissionJob = payload.progression.transmissionJob;
      }
      delete entry.activeTransferJob;
      changed = true;
      break;
    }
  }

  // 2. Legacy enhancementJob.item
  const enhancementJob = payload.progression?.enhancementJob;
  if (enhancementJob && typeof enhancementJob === 'object' && enhancementJob.item && typeof enhancementJob.item === 'object') {
    const legacyItem = enhancementJob.item;
    const hasInstanceId = typeof enhancementJob.itemInstanceId === 'string' && enhancementJob.itemInstanceId.length > 0;
    if (!hasInstanceId) {
      reasons.push('legacy_enhancement_item');
      before.legacyEnhancementItem = legacyItem;
      const instanceId = typeof legacyItem.itemInstanceId === 'string' && legacyItem.itemInstanceId.length > 0
        ? legacyItem.itemInstanceId
        : randomUUID();
      if (!payload.inventory) payload.inventory = { revision: 1, capacity: 48, items: [] };
      if (!Array.isArray(payload.inventory.lockedItems)) payload.inventory.lockedItems = [];
      payload.inventory.lockedItems.push({
        ...legacyItem,
        itemInstanceId: instanceId,
        itemId: String(legacyItem.itemId ?? enhancementJob.targetItemId ?? ''),
        count: Math.max(1, Math.trunc(Number(legacyItem.count) || 1)),
        lockedBy: `enhancement:${enhancementJob.jobRunId ?? 'legacy'}`,
        lockedAt: Date.now(),
      });
      enhancementJob.itemInstanceId = instanceId;
      delete enhancementJob.item;
      after.enhancementJobItemInstanceId = instanceId;
      changed = true;
    }
  }

  // 3. Legacy queuedJobs in alchemy/forging/enhancement
  if (!payload.progression) payload.progression = {};
  const currentQueue = Array.isArray(payload.progression.techniqueActivityQueue)
    ? [...payload.progression.techniqueActivityQueue]
    : [];
  const seen = new Set(currentQueue.map((entry: any) => entry?.queueId));
  for (const job of [payload.progression.alchemyJob, payload.progression.forgingJob, payload.progression.enhancementJob]) {
    if (job && typeof job === 'object' && Array.isArray(job.queuedJobs) && job.queuedJobs.length > 0) {
      reasons.push('legacy_craft_queued_jobs');
      before.queuedJobs = job.queuedJobs;
      for (const item of job.queuedJobs) {
        if (currentQueue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) break;
        if (!item || seen.has(item.queueId)) continue;
        currentQueue.push(item);
        seen.add(item.queueId);
      }
      delete job.queuedJobs;
      after.techniqueActivityQueue = currentQueue;
      changed = true;
    }
  }
  if (reasons.includes('legacy_craft_queued_jobs')) {
    payload.progression.techniqueActivityQueue = currentQueue;
  }

  if (!changed) return null;

  return {
    playerId: row.player_id,
    reasons,
    before,
    after,
    updatedPayload: payload,
  };
}
