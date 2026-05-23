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

interface TechniqueGenerationHelperDeps {
  gatewayGuardHelper: {
    requirePlayerId(client: Socket): string | null | undefined;
  };
  worldClientEventService: {
    emitGatewayError(client: Socket, code: string, error: unknown): void;
  };
  playerRuntimeService: {
    getPlayerRealmLv(playerId: string): number | null;
    consumeItemByItemId(playerId: string, itemId: string, count: number): boolean;
    learnTechniqueById(playerId: string, techniqueId: string): boolean;
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
        return this.handleGetStatus(playerId);

      case 'generate':
        return this.handleGenerate(client, playerId, request);

      case 'adopt':
        return this.handleAdopt(client, playerId, request);

      case 'discard':
        return this.handleDiscard(playerId, request);

      default:
        this.deps.worldClientEventService.emitGatewayError(client, 'UNKNOWN_ACTION', new Error('未知操作'));
        return undefined;
    }
  }

  private async handleGetStatus(playerId: string): Promise<unknown> {
    const realmLv = this.deps.playerRuntimeService.getPlayerRealmLv(playerId);
    return {
      available: (realmLv ?? 0) >= 31,
      unavailableReason: (realmLv ?? 0) < 31 ? '需筑基期方可领悟' : undefined,
      currentJob: null,
      currentDraft: null,
    };
  }

  private async handleGenerate(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const category = request.category as TechniqueCategory;
    const playerContext = typeof request.playerContext === 'string' ? request.playerContext : undefined;
    const realmLv = this.deps.playerRuntimeService.getPlayerRealmLv(playerId);

    if (!realmLv) {
      return { success: false, error: '玩家状态异常' };
    }

    let result: Awaited<ReturnType<TechniqueGenerationService['requestGeneration']>>;
    try {
      result = await this.techniqueGenerationService!.requestGeneration({
        playerId,
        playerRealmLv: realmLv,
        category,
        playerContext,
        consumeItem: async () => {
          return this.deps.playerRuntimeService.consumeItemByItemId(playerId, 'wudao_yujian', 1);
        },
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
        this.emitGenerationResultWhenReady(client, playerId, result.jobId!, 0).catch(() => undefined);
      });
      return { success: true, jobId: result.jobId, rolledGrade: result.rolledGrade, rolledRealmLv: result.rolledRealmLv };
    }

    client.emit(S2C.TechniqueGenerationResult, {
      jobId: '',
      result: 'failed',
      errorMessage: result.error ?? '功法领悟失败',
    });
    return result;
  }

  private async emitGenerationResultWhenReady(client: Socket, playerId: string, jobId: string, attempt: number): Promise<void> {
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

  private async handleAdopt(client: Socket, playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const jobId = String(request.jobId ?? '');
    const customName = String(request.customName ?? '');

    const result = await this.techniqueGenerationService!.adoptDraft({
      playerId,
      jobId,
      customName,
    });

    if (result.success && result.techniqueId) {
      // 直接学习功法
      const learned = this.deps.playerRuntimeService.learnTechniqueById(playerId, result.techniqueId);
      if (!learned) {
        return { success: false, error: '功法学习失败', errorCode: 'LEARN_FAILED' };
      }
    }

    return result;
  }

  private async handleDiscard(playerId: string, request: Record<string, unknown>): Promise<unknown> {
    const jobId = String(request.jobId ?? '');
    return this.techniqueGenerationService!.discardDraft(playerId, jobId);
  }
}
