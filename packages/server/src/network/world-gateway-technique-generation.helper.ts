/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */

/**
 * 世界网关功法生成 helper。
 * 处理 C2S.TechniqueGeneration 请求，委托给 TechniqueGenerationService。
 */

import { S2C } from '@mud/shared';
import type { Socket } from 'socket.io';
import type { TechniqueGenerationService } from '../runtime/technique-generation/technique-generation.service';
import type { TechniqueCategory } from '@mud/shared';
import {
  buildTechniqueGenerationRollRange,
  normalizeTechniqueGenerationItemSpend,
} from '../runtime/technique-generation/technique-generation-roll';
import { TECHNIQUE_GENERATION_UNLOCK_REALM_LV } from '../runtime/technique-generation/technique-generation-constants';

interface TechniqueGenerationHelperDeps {
  gatewayGuardHelper: {
    requirePlayerId(client: Socket): string | null | undefined;
  };
  worldClientEventService: {
    emitGatewayError(client: Socket, code: string, error: unknown): void;
  };
  playerRuntimeService: {
    getPlayerRealmLv(playerId: string): number | null;
    getPlayerHighestRealmLv(playerId: string): number | null;
    getPlayer?: (playerId: string) => { lifeElapsedTicks?: number | null; dirtyDomains?: Set<string> } | null;
    listDirtyPlayerDomains?: () => Map<string, Set<string>>;
    getSessionFence?: (playerId: string) => { runtimeOwnerId?: string | null; sessionEpoch?: number | null } | null;
    replaceInventoryItems?: (playerId: string, items: unknown[]) => unknown;
    runExclusiveAssetMutation?: <T>(playerIds: readonly string[], action: () => Promise<T> | T) => Promise<T>;
    addPendingTechniqueComprehensionById?: (playerId: string, techniqueId: string, sourceKind: 'normal' | 'created', creatorPlayerId?: string | null) => boolean;
  };
  playerPersistenceFlushService?: {
    flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean>;
  };
  worldSyncService?: {
    emitDeltaSync(playerId: string, client?: Socket): void;
  };
}

export class WorldGatewayTechniqueGenerationHelper {
  private readonly deps: TechniqueGenerationHelperDeps;
  private techniqueGenerationService: TechniqueGenerationService | null = null;

  constructor(deps: TechniqueGenerationHelperDeps) {
    this.deps = deps;
  }

  setService(service: TechniqueGenerationService): void {
    this.techniqueGenerationService = service;
  }

  async handleTechniqueGeneration(client: Socket, payload: unknown): Promise<unknown> {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return undefined;

    if (!this.techniqueGenerationService) {
      this.deps.worldClientEventService.emitGatewayError(client, 'TECHNIQUE_GENERATION_UNAVAILABLE', new Error('功法领悟系统未就绪'));
      return undefined;
    }

    if (!payload || typeof payload !== 'object') {
      this.deps.worldClientEventService.emitGatewayError(client, 'INVALID_PAYLOAD', new Error('无效请求'));
      return undefined;
    }

    const request = payload as Record<string, unknown>;
    const action = request.action as string;

    switch (action) {
      case 'getStatus':
        return this.handleGetStatus(client, playerId, request);

      case 'generate':
        return this.handleGenerate(client, playerId, request);

      case 'adopt':
        return this.handleAdopt(client, playerId, request);

      case 'discard':
        return this.handleDiscard(client, playerId, request);

      case 'adoptBatch':
        return this.handleAdoptBatch(client, playerId, request);

      case 'discardBatch':
        return this.handleDiscardBatch(client, playerId, request);

      default:
        this.deps.worldClientEventService.emitGatewayError(client, 'UNKNOWN_ACTION', new Error('未知操作'));
        return undefined;
    }
  }

  private async handleGetStatus(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    await this.refundNoModelFailedJobs(client, playerId);
    const realmLv = this.deps.playerRuntimeService.getPlayerRealmLv(playerId);
    const highestRealmLv = this.deps.playerRuntimeService.getPlayerHighestRealmLv(playerId) ?? realmLv;
    const itemSpend = normalizeTechniqueGenerationItemSpend(request.itemSpend);
    const mode = request.mode === 'batch' ? 'batch' : 'single';
    const currentStatus = await this.techniqueGenerationService!.getCurrentStatusForPlayer(playerId);
    const unlocked = (highestRealmLv ?? 0) >= TECHNIQUE_GENERATION_UNLOCK_REALM_LV;
    const status = {
      available: unlocked,
      unavailableReason: unlocked ? undefined : '需筑基期方可领悟',
      rollRange: realmLv && unlocked
        ? {
          ...buildTechniqueGenerationRollRange(
            realmLv,
            highestRealmLv ?? realmLv,
            mode === 'batch' ? 1 : itemSpend,
          ),
          itemSpendDefault: itemSpend,
        }
        : undefined,
      currentJob: currentStatus.currentJob,
      currentDraft: currentStatus.currentDraft && currentStatus.currentJob
        ? { jobId: currentStatus.currentJob.jobId, ...currentStatus.currentDraft }
        : null,
      currentBatch: currentStatus.currentBatch,
    };
    client.emit(S2C.TechniqueGenerationStatus, status);
    if (currentStatus.currentJob && (currentStatus.currentJob.status === 'pending' || currentStatus.currentJob.status === 'running')) {
      const activeJobId = currentStatus.currentJob.jobId;
      setImmediate(() => {
        this.emitGenerationResultWhenReady(client, playerId, activeJobId, 0).catch(() => undefined);
      });
    }
    if (currentStatus.currentBatch
      && (currentStatus.currentBatch.status === 'pending' || currentStatus.currentBatch.status === 'running')) {
      const activeJobId = currentStatus.currentBatch.jobs[0]?.jobId ?? '';
      if (activeJobId) {
        setImmediate(() => {
          this.emitGenerationResultWhenReady(
            client,
            playerId,
            activeJobId,
            0,
            currentStatus.currentBatch!.batchId,
          ).catch(() => undefined);
        });
      }
    }
    return status;
  }

  private async handleGenerate(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    await this.refundNoModelFailedJobs(client, playerId);
    const category = request.category as TechniqueCategory;
    const playerContext = typeof request.playerContext === 'string' ? request.playerContext : undefined;
    const itemSpend = normalizeTechniqueGenerationItemSpend(request.itemSpend);
    const mode = request.mode === 'batch' ? 'batch' : 'single';
    const realmLv = this.deps.playerRuntimeService.getPlayerRealmLv(playerId);

    if (!realmLv) {
      return { success: false, error: '玩家状态异常' };
    }
    const highestRealmLv = this.deps.playerRuntimeService.getPlayerHighestRealmLv(playerId) ?? realmLv;

    if (mode === 'batch' && category !== 'internal') {
      return { success: false, error: '批量领悟当前仅支持内功', errorCode: 'CATEGORY_LOCKED' };
    }

    let result: Awaited<ReturnType<TechniqueGenerationService['requestGeneration']>>;
    try {
      result = await this.runExclusivePlayerAssetMutation(playerId, async () => {
        await this.prepareInventoryForDurableMutation(playerId);
        const fence = this.requireTechniqueGenerationSessionFence(playerId);
        const common = {
          playerId,
          playerRealmLv: realmLv,
          playerHighestRealmLv: highestRealmLv,
          playerContext,
          itemSpend,
          ...fence,
          applyInventorySnapshot: async (items: unknown[]) => {
            this.applyCommittedInventorySnapshot(playerId, items);
          },
          settleFailedRefund: async () => (await this.settleFailedConsumedJobs(client, playerId)) > 0,
        };
        return mode === 'batch'
          ? this.techniqueGenerationService!.requestBatchGeneration(common)
          : this.techniqueGenerationService!.requestGeneration({ ...common, category });
      });
    } catch (error: unknown) {
      client.emit(S2C.TechniqueGenerationResult, {
        jobId: '',
        result: 'failed',
        errorMessage: error instanceof Error ? error.message : '功法领悟失败',
      });
      return { success: false, error: '功法领悟失败', errorCode: 'GENERATION_FAILED' };
    }

    if (result.success && result.jobId) {
      setImmediate(() => {
        this.emitGenerationResultWhenReady(client, playerId, result.jobId!, 0, result.batchId).catch(() => undefined);
      });
      return {
        success: true,
        jobId: result.jobId,
        rolledGrade: result.rolledGrade,
        rolledRealmLv: result.rolledRealmLv,
        itemSpend: result.itemSpend,
        batchId: result.batchId,
        batchCount: result.batchCount,
      };
    }

    client.emit(S2C.TechniqueGenerationResult, {
      jobId: '',
      result: 'failed',
      errorMessage: result.error ?? '功法领悟失败',
    });
    return result;
  }

  private async emitGenerationResultWhenReady(
    client: Socket,
    playerId: string,
    jobId: string,
    attempt: number,
    batchId?: string,
  ): Promise<void> {
    if (batchId) {
      const previews = await this.techniqueGenerationService!.getBatchPreviews(playerId, batchId);
      if (previews.length === 0 && attempt < 120) {
        setTimeout(() => {
          this.emitGenerationResultWhenReady(client, playerId, jobId, attempt + 1, batchId).catch(() => undefined);
        }, 1000);
        return;
      }
      client.emit(S2C.TechniqueGenerationResult, previews.length > 0 ? {
        jobId,
        batchId,
        result: 'success',
        previews,
      } : {
        jobId,
        batchId,
        result: 'failed',
        errorMessage: '批量领悟超时，请稍后重试',
      });
      return;
    }
    const result = await this.techniqueGenerationService!.getPreview(playerId, jobId);
    if (!result && attempt < 120) {
      setTimeout(() => {
        this.emitGenerationResultWhenReady(client, playerId, jobId, attempt + 1).catch(() => undefined);
      }, 1000);
      return;
    }
    client.emit(S2C.TechniqueGenerationResult, result ? {
      jobId,
      result: 'success',
      preview: result,
    } : {
      jobId,
      result: 'failed',
      errorMessage: '功法领悟超时，请稍后重试',
    });
  }

  private async handleAdoptBatch(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const batchId = String(request.batchId ?? '');
    let result: Awaited<ReturnType<TechniqueGenerationService['adoptBatchDraft']>>;
    try {
      result = await this.runExclusivePlayerAssetMutation(playerId, async () => {
        await this.prepareTechniqueForDurableMutation(playerId);
        const fence = this.requireTechniqueGenerationSessionFence(playerId);
        const player = this.deps.playerRuntimeService.getPlayer?.(playerId);
        return this.techniqueGenerationService!.adoptBatchDraft({
          playerId,
          batchId,
          learnerRealmLv: this.deps.playerRuntimeService.getPlayerRealmLv(playerId) ?? 1,
          currentTick: Math.max(0, Math.trunc(Number(player?.lifeElapsedTicks) || 0)),
          ...fence,
          applyPendingComprehensions: async (techniqueIds) => {
            const addPending = this.deps.playerRuntimeService.addPendingTechniqueComprehensionById;
            if (typeof addPending !== 'function') return;
            for (const techniqueId of techniqueIds) {
              addPending.call(this.deps.playerRuntimeService, playerId, techniqueId, 'created', playerId);
            }
          },
        });
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '批量功法采纳失败';
      client.emit(S2C.TechniqueGenerationResult, { jobId: '', batchId, result: 'failed', errorMessage });
      return { success: false, error: errorMessage, errorCode: 'ADOPT_FAILED' };
    }
    client.emit(S2C.TechniqueGenerationResult, result.success ? {
      jobId: '',
      batchId,
      result: 'learned',
      techniqueIds: result.techniqueIds,
      techniqueNames: result.techniqueNames,
    } : {
      jobId: '',
      batchId,
      result: 'failed',
      errorMessage: result.error ?? '批量功法采纳失败',
    });
    if (result.success) this.deps.worldSyncService?.emitDeltaSync(playerId, client);
    return result;
  }

  private async handleDiscardBatch(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const batchId = String(request.batchId ?? '');
    let result: Awaited<ReturnType<TechniqueGenerationService['discardBatchDraft']>>;
    try {
      result = await this.runExclusivePlayerAssetMutation(playerId, async () => {
        await this.prepareInventoryForDurableMutation(playerId);
        const fence = this.requireTechniqueGenerationSessionFence(playerId);
        return this.techniqueGenerationService!.discardBatchDraft({
          playerId,
          batchId,
          ...fence,
          applyInventorySnapshot: async (items) => this.applyCommittedInventorySnapshot(playerId, items),
        });
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '批量功法放弃失败';
      client.emit(S2C.TechniqueGenerationResult, { jobId: '', batchId, result: 'failed', errorMessage });
      return { success: false, error: errorMessage };
    }
    client.emit(S2C.TechniqueGenerationResult, {
      jobId: '',
      batchId,
      result: result.success ? 'discarded' : 'failed',
      errorMessage: result.success ? undefined : result.error ?? '批量功法放弃失败',
      discardRefund: result.success ? result.refund : undefined,
    });
    if (result.success) this.deps.worldSyncService?.emitDeltaSync(playerId, client);
    return result;
  }

  private async refundNoModelFailedJobs(client: Socket, playerId: string): Promise<void> {
    if (!this.techniqueGenerationService || typeof this.techniqueGenerationService.refundFailedConsumedJobsForPlayer !== 'function') {
      return;
    }
    const refunded = await this.settleFailedConsumedJobs(client, playerId);
    void refunded;
  }

  private async handleAdopt(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const jobId = String(request.jobId ?? '');
    const customName = String(request.customName ?? '');

    let result: Awaited<ReturnType<TechniqueGenerationService['adoptDraft']>>;
    try {
      result = await this.runExclusivePlayerAssetMutation(playerId, async () => {
        await this.prepareTechniqueForDurableMutation(playerId);
        const fence = this.requireTechniqueGenerationSessionFence(playerId);
        const player = this.deps.playerRuntimeService.getPlayer?.(playerId);
        return this.techniqueGenerationService!.adoptDraft({
          playerId,
          jobId,
          customName,
          learnerRealmLv: this.deps.playerRuntimeService.getPlayerRealmLv(playerId) ?? 1,
          currentTick: Math.max(0, Math.trunc(Number(player?.lifeElapsedTicks) || 0)),
          ...fence,
          applyPendingComprehension: async (techniqueId) => (
            typeof this.deps.playerRuntimeService.addPendingTechniqueComprehensionById === 'function'
              ? this.deps.playerRuntimeService.addPendingTechniqueComprehensionById(playerId, techniqueId, 'created', playerId)
              : false
          ),
        });
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '功法采纳失败';
      client.emit(S2C.TechniqueGenerationResult, {
        jobId,
        result: 'failed',
        errorMessage,
      });
      return { success: false, error: errorMessage, errorCode: 'ADOPT_FAILED' };
    }

    if (result.success && result.techniqueId) {
      client.emit(S2C.TechniqueGenerationResult, {
        jobId,
        result: 'learned',
        techniqueId: result.techniqueId,
        techniqueName: result.techniqueName,
      });
      this.deps.worldSyncService?.emitDeltaSync(playerId, client);
      return result;
    }

    client.emit(S2C.TechniqueGenerationResult, {
      jobId,
      result: 'failed',
      errorMessage: result.error ?? '功法采纳失败',
    });
    return result;
  }

  private async handleDiscard(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const jobId = String(request.jobId ?? '');
    let result: Awaited<ReturnType<TechniqueGenerationService['discardDraft']>>;
    try {
      result = await this.runExclusivePlayerAssetMutation(playerId, async () => {
        await this.prepareInventoryForDurableMutation(playerId);
        const fence = this.requireTechniqueGenerationSessionFence(playerId);
        return this.techniqueGenerationService!.discardDraft({
          playerId,
          jobId,
          ...fence,
          applyInventorySnapshot: async (items) => {
            this.applyCommittedInventorySnapshot(playerId, items);
          },
        });
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '功法放弃失败';
      client.emit(S2C.TechniqueGenerationResult, {
        jobId,
        result: 'failed',
        errorMessage,
      });
      return { success: false, error: errorMessage };
    }
    client.emit(S2C.TechniqueGenerationResult, {
      jobId,
      result: result.success ? 'discarded' : 'failed',
      errorMessage: result.success ? undefined : result.error ?? '功法放弃失败',
      discardRefund: result.success ? result.refund : undefined,
    });
    if (result.success) {
      this.deps.worldSyncService?.emitDeltaSync(playerId, client);
    }
    return result;
  }

  private async settleFailedConsumedJobs(client: Socket, playerId: string): Promise<number> {
    return this.runExclusivePlayerAssetMutation(playerId, async () => {
      await this.prepareInventoryForDurableMutation(playerId);
      const fence = this.requireTechniqueGenerationSessionFence(playerId);
      const refunded = await this.techniqueGenerationService!.refundFailedConsumedJobsForPlayer({
        playerId,
        ...fence,
        applyInventorySnapshot: async (items) => {
          this.applyCommittedInventorySnapshot(playerId, items);
        },
      });
      if (refunded > 0) {
        this.deps.worldSyncService?.emitDeltaSync(playerId, client);
      }
      return refunded;
    });
  }

  private async runExclusivePlayerAssetMutation<T>(playerId: string, action: () => Promise<T>): Promise<T> {
    const coordinator = this.deps.playerRuntimeService.runExclusiveAssetMutation;
    return typeof coordinator === 'function'
      ? coordinator.call(this.deps.playerRuntimeService, [playerId], action)
      : action();
  }

  private async prepareInventoryForDurableMutation(playerId: string): Promise<void> {
    await this.prepareDomainForDurableMutation(playerId, 'inventory');
  }

  private async prepareTechniqueForDurableMutation(playerId: string): Promise<void> {
    await this.prepareDomainForDurableMutation(playerId, 'technique');
  }

  private async prepareDomainForDurableMutation(playerId: string, domain: string): Promise<void> {
    const dirtyDomains = this.deps.playerRuntimeService.listDirtyPlayerDomains?.().get(playerId)
      ?? this.deps.playerRuntimeService.getPlayer?.(playerId)?.dirtyDomains
      ?? null;
    const flushDomain = dirtyDomains?.has('snapshot')
      ? 'snapshot'
      : dirtyDomains?.has(domain) ? domain : null;
    if (!flushDomain) {
      return;
    }
    const flush = this.deps.playerPersistenceFlushService?.flushPlayerDomains;
    if (typeof flush !== 'function') {
      throw new Error(`technique_generation_dirty_${domain}_flush_unavailable`);
    }
    const flushed = await flush.call(this.deps.playerPersistenceFlushService, playerId, [flushDomain]);
    if (!flushed) {
      throw new Error(`technique_generation_dirty_${domain}_flush_failed`);
    }
  }

  private requireTechniqueGenerationSessionFence(playerId: string): {
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
  } {
    const fence = this.deps.playerRuntimeService.getSessionFence?.(playerId);
    const expectedRuntimeOwnerId = typeof fence?.runtimeOwnerId === 'string' ? fence.runtimeOwnerId.trim() : '';
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(fence?.sessionEpoch) || 0));
    if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
      throw new Error('technique_generation_session_fence_unavailable');
    }
    return { expectedRuntimeOwnerId, expectedSessionEpoch };
  }

  private applyCommittedInventorySnapshot(playerId: string, items: unknown[]): void {
    if (typeof this.deps.playerRuntimeService.replaceInventoryItems !== 'function') {
      throw new Error('technique_generation_inventory_runtime_sync_unavailable');
    }
    this.deps.playerRuntimeService.replaceInventoryItems(playerId, items);
  }
}
