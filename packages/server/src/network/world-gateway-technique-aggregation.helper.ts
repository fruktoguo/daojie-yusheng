/**
 * 炼法台功法统合网络入口。
 *
 * 该 helper 只做 socket 鉴权、炼法台位置校验和低频结果投影；统合规则与
 * 模板发布仍由 TechniqueAggregationService 保持服务端权威。
 */
import { S2C, type TechniqueAggregationErrorView, type TechniqueAggregationPublishRequest, type TechniqueAggregationPreviewRequest } from '@mud/shared';
import type { Socket } from 'socket.io';
import type { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import type { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import type { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import type { WorldClientEventService } from './world-client-event.service';
import type { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import type { WorldSyncService } from './world-sync.service';
import type { TechniqueAggregationService } from '../runtime/technique-generation/technique-aggregation.service';

const AGGREGATION_RANGE = 1;

type AggregationBuildingCheck = {
  ok: true;
  player: any;
  building: any;
} | {
  ok: false;
  error: TechniqueAggregationErrorView;
};

export class WorldGatewayTechniqueAggregationHelper {
  private readonly deps: {
    gatewayGuardHelper: Pick<WorldGatewayGuardHelper, 'requirePlayerId'>;
    playerRuntimeService: Pick<PlayerRuntimeService, 'getPlayer' | 'learnPublishedAggregateTechniqueById'> & {
      runExclusiveAssetMutation?: <T>(playerIds: readonly string[], action: () => Promise<T> | T) => Promise<T>;
    };
    worldRuntimeService: Pick<WorldRuntimeService, 'getInstanceRuntime'>;
    playerPersistenceFlushService?: Pick<PlayerPersistenceFlushService, 'flushPlayerDomains'>;
    worldClientEventService: Pick<WorldClientEventService, 'markProtocol' | 'emitGatewayError'>;
    worldSyncService: Pick<WorldSyncService, 'emitDeltaSync'>;
  };
  private aggregationService: TechniqueAggregationService | null = null;

  constructor(deps: WorldGatewayTechniqueAggregationHelper['deps']) {
    this.deps = deps;
  }

  setService(service: TechniqueAggregationService): void {
    this.aggregationService = service;
  }

  handleRequestPanel(client: Socket, payload: TechniqueAggregationPreviewRequest): void {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return;
    this.deps.worldClientEventService.markProtocol(client, 'mainline');
    const request = this.normalizePreviewRequest(payload);
    const check = this.checkBuilding(playerId, request.buildingId);
    if ('error' in check) {
      client.emit(S2C.TechniqueAggregationPanel, {
        requestId: request.requestId,
        buildingId: request.buildingId,
        revision: 1,
        eligibleSources: [],
        families: [],
        totalCoveredLeafCount: 0,
        learnedAggregateCount: 0,
        error: check.error,
      });
      return;
    }
    if (!this.aggregationService) {
      client.emit(S2C.TechniqueAggregationPanel, {
        requestId: request.requestId,
        buildingId: request.buildingId,
        revision: Math.max(1, Number(check.player?.techniques?.revision) || 1),
        eligibleSources: [],
        families: [],
        totalCoveredLeafCount: 0,
        learnedAggregateCount: 0,
        error: this.error('TECHNIQUE_AGGREGATE_NOT_READY'),
      });
      return;
    }
    client.emit(S2C.TechniqueAggregationPanel, this.aggregationService.buildPanel(check.player, request));
  }

  async handlePublish(client: Socket, payload: TechniqueAggregationPublishRequest): Promise<void> {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return;
    this.deps.worldClientEventService.markProtocol(client, 'mainline');
    const request = this.normalizePublishRequest(payload);
    const check = this.checkBuilding(playerId, request.buildingId);
    if ('error' in check) {
      client.emit(S2C.TechniqueAggregationResult, {
        requestId: request.requestId,
        operationId: request.operationId,
        ok: false,
        code: check.error.code,
        messageKey: check.error.messageKey,
        vars: check.error.vars,
        conflictAggregateIds: check.error.conflictAggregateIds,
        conflictSourceTechniqueIds: check.error.conflictSourceTechniqueIds,
        invalidTechniqueIds: check.error.invalidTechniqueIds,
      });
      return;
    }
    if (!this.aggregationService) {
      client.emit(S2C.TechniqueAggregationResult, {
        requestId: request.requestId,
        operationId: request.operationId,
        ok: false,
        code: 'TECHNIQUE_AGGREGATE_NOT_READY',
        messageKey: 'technique.aggregation.technique_aggregate_not_ready',
      });
      return;
    }
    try {
      const publishAndApply = async () => {
        // 玩家意图进入资产锁前可能已经移动或建筑失效，锁内必须按最新世界态复验。
        const lockedCheck = this.checkBuilding(playerId, request.buildingId);
        if ('error' in lockedCheck) {
          return {
            ok: false as const,
            result: this.resultFromError(request, lockedCheck.error),
          };
        }
        const outcome = await this.aggregationService!.publish(lockedCheck.player, request);
        if (!outcome.ok || !outcome.result.aggregate) {
          return outcome;
        }
        const learned = this.deps.playerRuntimeService.learnPublishedAggregateTechniqueById(
          playerId,
          outcome.result.aggregate.techniqueId,
        );
        if (!learned) {
          return {
            ok: false as const,
            result: {
              ...outcome.result,
              ok: false,
              code: 'TECHNIQUE_AGGREGATE_OPERATION_REPLAYED',
              messageKey: 'technique.aggregation.technique_aggregate_operation_replayed',
            },
          };
        }
        await this.deps.playerPersistenceFlushService?.flushPlayerDomains(playerId, [
          'technique',
          'attr',
          'auto_battle_skill',
          'combat_pref',
        ]);
        return outcome;
      };
      const outcome = await (this.deps.playerRuntimeService.runExclusiveAssetMutation
        ? this.deps.playerRuntimeService.runExclusiveAssetMutation([playerId], publishAndApply)
        : publishAndApply());
      client.emit(S2C.TechniqueAggregationResult, outcome.result);
      if (!outcome.ok || !outcome.result.aggregate) {
        return;
      }
      this.deps.worldSyncService.emitDeltaSync(playerId, client);
      const currentPlayer = this.deps.playerRuntimeService.getPlayer(playerId);
      if (currentPlayer) {
        client.emit(S2C.TechniqueAggregationPanel, this.aggregationService.buildPanel(currentPlayer, request));
      }
    } catch (error) {
      this.deps.worldClientEventService.emitGatewayError(client, 'TECHNIQUE_AGGREGATION_FAILED', error);
    }
  }

  private checkBuilding(playerId: string, buildingIdInput: unknown): AggregationBuildingCheck {
    const player = this.deps.playerRuntimeService.getPlayer(playerId);
    if (!player) {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_PERMISSION_DENIED') };
    }
    const buildingId = normalizeText(buildingIdInput);
    if (!buildingId) {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_REQUIRED') };
    }
    const instance = this.deps.worldRuntimeService.getInstanceRuntime(player.instanceId);
    const building = instance?.buildingById?.get?.(buildingId) ?? null;
    if (!building || building.defId !== 'technique_refining_table') {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_INVALID') };
    }
    if (building.state !== 'active') {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_INVALID') };
    }
    const dx = Math.abs(Math.floor(Number(player.x) || 0) - Math.floor(Number(building.x) || 0));
    const dy = Math.abs(Math.floor(Number(player.y) || 0) - Math.floor(Number(building.y) || 0));
    if (Math.max(dx, dy) > AGGREGATION_RANGE) {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_OUT_OF_RANGE') };
    }
    return { ok: true, player, building };
  }

  private normalizePreviewRequest(payload: TechniqueAggregationPreviewRequest): TechniqueAggregationPreviewRequest {
    return {
      requestId: normalizeText(payload?.requestId) || undefined,
      buildingId: normalizeText(payload?.buildingId) || undefined,
    };
  }

  private normalizePublishRequest(payload: TechniqueAggregationPublishRequest): TechniqueAggregationPublishRequest {
    return {
      requestId: normalizeText(payload?.requestId) || undefined,
      operationId: normalizeText(payload?.operationId) || undefined,
      buildingId: normalizeText(payload?.buildingId) || undefined,
      familyId: normalizeText(payload?.familyId) || undefined,
      expectedRevision: Number.isFinite(Number(payload?.expectedRevision))
        ? Math.trunc(Number(payload.expectedRevision))
        : undefined,
      sourceTechniqueIds: Array.isArray(payload?.sourceTechniqueIds)
        ? payload.sourceTechniqueIds.map(normalizeText).filter(Boolean)
        : [],
    };
  }

  private error(code: TechniqueAggregationErrorView['code']): TechniqueAggregationErrorView {
    return {
      code,
      messageKey: 'technique.aggregation.' + code.toLowerCase(),
    };
  }

  private resultFromError(
    request: TechniqueAggregationPublishRequest,
    error: TechniqueAggregationErrorView,
  ) {
    return {
      requestId: request.requestId,
      operationId: request.operationId,
      ok: false as const,
      code: error.code,
      messageKey: error.messageKey,
      vars: error.vars,
      conflictAggregateIds: error.conflictAggregateIds,
      conflictSourceTechniqueIds: error.conflictSourceTechniqueIds,
      invalidTechniqueIds: error.invalidTechniqueIds,
    };
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
