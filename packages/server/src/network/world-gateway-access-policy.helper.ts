/**
 * 通用权限低频请求入口。
 *
 * 网关只负责会话鉴权、限流、请求关联和结果单播；资源归属、保存事务与权限规则
 * 分别由 AccessPolicyResourceService 和业务适配器负责。
 */
import {
  C2S,
  S2C,
  type AccessPolicy,
  type AccessPolicyResourceSnapshot,
  type AccessPolicyResourceResultView,
  type ClientToServerEventPayload,
} from '@mud/shared';
import type { Socket } from 'socket.io';

import type { AccessPolicyResourceService } from '../runtime/access/access-policy-resource.service';
import type { AccessPolicyRuntimeService } from '../runtime/access/access-policy-runtime.service';

const ACCESS_POLICY_REQUEST_ID_MAX_LENGTH = 96;

interface WorldGatewayAccessPolicyDeps {
  gatewayGuardHelper: {
    requireActivePlayerId(client: Socket): string | null | undefined;
    checkRateLimit(client: Socket, eventCategory?: string, maxPerWindow?: number, windowMs?: number): boolean;
  };
  accessPolicyRuntimeService?: AccessPolicyRuntimeService;
  accessPolicyResourceService?: AccessPolicyResourceService;
  logger?: { warn(message: string): void };
}

export class WorldGatewayAccessPolicyHelper {
  constructor(private readonly gateway: WorldGatewayAccessPolicyDeps) {}

  async handleRequestAccessPolicy(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RequestAccessPolicy>,
  ): Promise<void> {
    const requestId = normalizeRequestId(payload?.requestId);
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId || !requestId) return;
    if (!this.allow(client, requestId, 'load', 'access-policy-load', 12)) return;
    try {
      if (!this.gateway.accessPolicyResourceService) {
        client.emit(S2C.AccessPolicyResourceResult, failureResourceResult(requestId, 'load', 'access_policy_service_unavailable'));
        return;
      }
      const result = await this.gateway.accessPolicyResourceService.loadForEditor(playerId, payload.ref);
      client.emit(S2C.AccessPolicyResourceResult, toResourceResult(requestId, 'load', result));
    } catch (error) {
      this.warn('读取权限资源失败', error);
      client.emit(S2C.AccessPolicyResourceResult, failureResourceResult(requestId, 'load', 'access_policy_internal_error'));
    }
  }

  async handleResolveAccessPolicyPlayer(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.ResolveAccessPolicyPlayer>,
  ): Promise<void> {
    const requestId = normalizeRequestId(payload?.requestId);
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId || !requestId) return;
    if (!this.gateway.gatewayGuardHelper.checkRateLimit(client, 'access-policy-player', 12, 5_000)) {
      client.emit(S2C.AccessPolicyPlayerResult, {
        requestId,
        ok: false,
        reason: 'access_policy_rate_limited',
      });
      return;
    }
    try {
      if (!this.gateway.accessPolicyRuntimeService) {
        client.emit(S2C.AccessPolicyPlayerResult, {
          requestId,
          ok: false,
          reason: 'access_policy_service_unavailable',
        });
        return;
      }
      const resolved = await this.gateway.accessPolicyRuntimeService.resolvePlayerNo(payload?.playerNo);
      client.emit(S2C.AccessPolicyPlayerResult, resolved
        ? { requestId, ok: true, player: { playerNo: resolved.playerNo, roleName: resolved.roleName } }
        : { requestId, ok: false, reason: 'access_policy_player_not_found' });
    } catch (error) {
      this.warn('解析权限玩家序号失败', error);
      client.emit(S2C.AccessPolicyPlayerResult, {
        requestId,
        ok: false,
        reason: 'access_policy_internal_error',
      });
    }
  }

  async handleSaveAccessPolicy(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.SaveAccessPolicy>,
  ): Promise<void> {
    const requestId = normalizeRequestId(payload?.requestId);
    const playerId = this.gateway.gatewayGuardHelper.requireActivePlayerId(client);
    if (!playerId || !requestId) return;
    if (!this.allow(client, requestId, 'save', 'access-policy-save', 6)) return;
    try {
      if (!this.gateway.accessPolicyResourceService) {
        client.emit(S2C.AccessPolicyResourceResult, failureResourceResult(requestId, 'save', 'access_policy_service_unavailable'));
        return;
      }
      const result = await this.gateway.accessPolicyResourceService.save(
        playerId,
        payload.ref,
        payload.expectedRevision,
        payload.policy,
      );
      client.emit(S2C.AccessPolicyResourceResult, toResourceResult(requestId, 'save', result));
    } catch (error) {
      this.warn('保存权限资源失败', error);
      client.emit(S2C.AccessPolicyResourceResult, failureResourceResult(requestId, 'save', 'access_policy_internal_error'));
    }
  }

  private allow(
    client: Socket,
    requestId: string,
    operation: AccessPolicyResourceResultView['operation'],
    category: string,
    limit: number,
  ): boolean {
    if (this.gateway.gatewayGuardHelper.checkRateLimit(client, category, limit, 5_000)) return true;
    client.emit(
      S2C.AccessPolicyResourceResult,
      failureResourceResult(requestId, operation, 'access_policy_rate_limited'),
    );
    return false;
  }

  private warn(message: string, error: unknown): void {
    this.gateway.logger?.warn(`${message}：${error instanceof Error ? error.message : String(error)}`);
  }
}

function toResourceResult(
  requestId: string,
  operation: AccessPolicyResourceResultView['operation'],
  result: Awaited<ReturnType<AccessPolicyResourceService['loadForEditor']>>,
): AccessPolicyResourceResultView {
  if (result.ok === true) {
    return {
      requestId,
      operation,
      ok: true,
      snapshot: projectSnapshotForEditor(result.snapshot),
    };
  }
  const failed = result as Exclude<typeof result, { ok: true }>;
  return {
    requestId,
    operation,
    ok: false,
    reason: failed.reason,
    ...(failed.current ? { snapshot: projectSnapshotForEditor(failed.current) } : {}),
    ...(failed.unresolvedPlayerNos?.length ? { unresolvedPlayerNos: failed.unresolvedPlayerNos } : {}),
  };
}

function failureResourceResult(
  requestId: string,
  operation: AccessPolicyResourceResultView['operation'],
  reason: string,
): AccessPolicyResourceResultView {
  return { requestId, operation, ok: false, reason };
}

function normalizeRequestId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= ACCESS_POLICY_REQUEST_ID_MAX_LENGTH
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : '';
}

function projectSnapshotForEditor(snapshot: AccessPolicyResourceSnapshot): AccessPolicyResourceSnapshot {
  const { resourceType, resourceId, slot, policy, revision } = snapshot;
  return { resourceType, resourceId, slot, policy: projectPolicyForEditor(policy), revision };
}

function projectPolicyForEditor(policy: AccessPolicy): AccessPolicy {
  return {
    ...policy,
    conditions: policy.conditions.map((condition) => condition.type === 'players'
      ? {
          type: 'players' as const,
          players: condition.players.map(({ playerNo, roleName }) => ({ playerNo, roleName })),
        }
      : condition),
  };
}
