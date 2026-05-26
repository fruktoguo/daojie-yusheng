/**
 * 世界网关活动 helper。
 *
 * 活动属于低频面板请求，只做鉴权、调用运行时服务并单播结果。
 */
import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { ActivityRuntimeService, normalizeActivityError } from '../runtime/activity/activity-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import { WorldSyncService } from './world-sync.service';

@Injectable()
export class WorldGatewayActivityHelper {
  constructor(
    private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
    private readonly gatewayClientEmitHelper: WorldGatewayClientEmitHelper,
    private readonly activityRuntimeService: ActivityRuntimeService,
    private readonly worldClientEventService: WorldClientEventService,
    private readonly worldSyncService: WorldSyncService,
  ) {}

  async handleRequestActivityStatus(client: Socket, _payload: unknown): Promise<void> {
    const playerId = this.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      await this.emitActivityStatus(client, playerId);
    } catch (error) {
      this.worldClientEventService.emitGatewayError(client, 'REQUEST_ACTIVITY_STATUS_FAILED', error);
    }
  }

  async handleClaimMeritMonthCard(client: Socket, _payload: unknown): Promise<void> {
    const playerId = this.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      await this.activityRuntimeService.claimMeritMonthCard(playerId);
      this.gatewayClientEmitHelper.emitActivityOperationResult(client, {
        operation: 'claimMonthCard',
        ok: true,
      });
      await this.emitActivityStatus(client, playerId);
      this.worldSyncService?.emitDeltaSync?.(playerId, client);
    } catch (error) {
      const normalized = normalizeActivityError(error);
      this.gatewayClientEmitHelper.emitActivityOperationResult(client, {
        operation: 'claimMonthCard',
        ok: false,
        message: normalized.message,
      });
      this.worldClientEventService.emitGatewayError(client, 'CLAIM_MONTH_CARD_FAILED', normalized);
    }
  }

  async handleClaimDailySignIn(client: Socket, _payload: unknown): Promise<void> {
    const playerId = this.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      await this.activityRuntimeService.claimDailySignIn(playerId);
      this.gatewayClientEmitHelper.emitActivityOperationResult(client, {
        operation: 'claimDailySignIn',
        ok: true,
      });
      await this.emitActivityStatus(client, playerId);
      this.worldSyncService?.emitDeltaSync?.(playerId, client);
    } catch (error) {
      const normalized = normalizeActivityError(error);
      this.gatewayClientEmitHelper.emitActivityOperationResult(client, {
        operation: 'claimDailySignIn',
        ok: false,
        message: normalized.message,
      });
      this.worldClientEventService.emitGatewayError(client, 'CLAIM_DAILY_SIGN_IN_FAILED', normalized);
    }
  }

  private async emitActivityStatus(client: Socket, playerId: string): Promise<void> {
    this.gatewayClientEmitHelper.emitActivityStatus(client, await this.activityRuntimeService.getStatus(playerId));
  }
}
