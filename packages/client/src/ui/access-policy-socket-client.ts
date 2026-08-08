/**
 * 通用权限编辑器的请求关联客户端。
 *
 * 负责低频 load / 玩家序号解析 / save 的超时、迟到回包隔离和错误归一化；
 * 具体业务面板只需要提供资源 ref，再把 callbacks 交给 AccessPolicyEditor。
 */
import {
  S2C,
  type AccessPolicy,
  type AccessPolicyPlayerResultView,
  type AccessPolicyResourceRef,
  type AccessPolicyResourceResultView,
  type AccessPolicyResourceSnapshot,
  type AccessPolicySpecifiedPlayer,
} from '@mud/shared';

import type { SocketManager } from '../network/socket';
import type { AccessPolicyEditorSaveResult } from './access-policy-editor';

const DEFAULT_ACCESS_POLICY_REQUEST_TIMEOUT_MS = 10_000;

type PendingResourceRequest = {
  operation: AccessPolicyResourceResultView['operation'];
  timeout: ReturnType<typeof setTimeout>;
  resolve(result: AccessPolicyResourceResultView): void;
};

type PendingPlayerRequest = {
  timeout: ReturnType<typeof setTimeout>;
  resolve(result: AccessPolicyPlayerResultView): void;
};

export class AccessPolicySocketClient {
  private readonly pendingResources = new Map<string, PendingResourceRequest>();
  private readonly pendingPlayers = new Map<string, PendingPlayerRequest>();
  private readonly unsubscribe: Array<() => void>;
  private requestSequence = 0;
  private disposed = false;

  constructor(
    private readonly socket: SocketManager,
    private readonly requestTimeoutMs = DEFAULT_ACCESS_POLICY_REQUEST_TIMEOUT_MS,
  ) {
    this.unsubscribe = [
      socket.on(S2C.AccessPolicyResourceResult, (result) => this.handleResourceResult(result)),
      socket.on(S2C.AccessPolicyPlayerResult, (result) => this.handlePlayerResult(result)),
    ];
  }

  async load(ref: AccessPolicyResourceRef): Promise<AccessPolicyResourceSnapshot> {
    const result = await this.requestResource('load', (requestId) => this.socket.accessPolicy.request({ requestId, ref }));
    if (!result.ok || !result.snapshot) throw new Error(resolveAccessPolicyClientError(result.reason));
    return result.snapshot;
  }

  async resolvePlayerNo(playerNo: number): Promise<AccessPolicySpecifiedPlayer | null> {
    const requestId = this.nextRequestId('player');
    const response = new Promise<AccessPolicyPlayerResultView>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPlayers.delete(requestId);
        resolve({ requestId, ok: false, reason: 'access_policy_request_timeout' });
      }, this.requestTimeoutMs);
      this.pendingPlayers.set(requestId, { timeout, resolve });
    });
    const sent = this.socket.accessPolicy.resolvePlayer({ requestId, playerNo });
    if (!sent.accepted) {
      this.finishPlayerRequest(requestId, { requestId, ok: false, reason: `access_policy_socket_${sent.reason}` });
    }
    const result = await response;
    if (result.ok && result.player) return result.player;
    if (result.reason === 'access_policy_player_not_found') return null;
    throw new Error(resolveAccessPolicyClientError(result.reason));
  }

  async save(
    ref: AccessPolicyResourceRef,
    policy: AccessPolicy,
    expectedRevision: number,
  ): Promise<AccessPolicyEditorSaveResult> {
    const result = await this.requestResource('save', (requestId) => this.socket.accessPolicy.save({
      requestId,
      ref,
      expectedRevision,
      policy,
    }));
    return result.ok && result.snapshot
      ? { ok: true, policy: result.snapshot.policy }
      : {
          ok: false,
          reason: result.reason,
          ...(result.snapshot ? { currentPolicy: result.snapshot.policy } : {}),
          ...(result.unresolvedPlayerNos?.length ? { unresolvedPlayerNos: result.unresolvedPlayerNos } : {}),
        };
  }

  createEditorCallbacks(ref: AccessPolicyResourceRef): {
    resolvePlayerNo: (playerNo: number) => Promise<AccessPolicySpecifiedPlayer | null>;
    save: (policy: AccessPolicy, expectedRevision: number) => Promise<AccessPolicyEditorSaveResult>;
  } {
    return {
      resolvePlayerNo: (playerNo) => this.resolvePlayerNo(playerNo),
      save: (policy, expectedRevision) => this.save(ref, policy, expectedRevision),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    for (const [requestId, pending] of this.pendingResources) {
      this.finishResourceRequest(requestId, {
        requestId,
        operation: pending.operation,
        ok: false,
        reason: 'access_policy_client_disposed',
      });
    }
    for (const [requestId] of this.pendingPlayers) {
      this.finishPlayerRequest(requestId, { requestId, ok: false, reason: 'access_policy_client_disposed' });
    }
  }

  private requestResource(
    operation: AccessPolicyResourceResultView['operation'],
    send: (requestId: string) => { accepted: true } | { accepted: false; reason: string },
  ): Promise<AccessPolicyResourceResultView> {
    const requestId = this.nextRequestId(operation);
    const response = new Promise<AccessPolicyResourceResultView>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingResources.delete(requestId);
        resolve({ requestId, operation, ok: false, reason: 'access_policy_request_timeout' });
      }, this.requestTimeoutMs);
      this.pendingResources.set(requestId, { operation, timeout, resolve });
    });
    const sent = send(requestId);
    if (!sent.accepted) {
      this.finishResourceRequest(requestId, {
        requestId,
        operation,
        ok: false,
        reason: `access_policy_socket_${sent.reason}`,
      });
    }
    return response;
  }

  private handleResourceResult(result: AccessPolicyResourceResultView): void {
    const pending = this.pendingResources.get(result?.requestId);
    if (!pending || pending.operation !== result.operation) return;
    this.finishResourceRequest(result.requestId, result);
  }

  private handlePlayerResult(result: AccessPolicyPlayerResultView): void {
    if (!this.pendingPlayers.has(result?.requestId)) return;
    this.finishPlayerRequest(result.requestId, result);
  }

  private finishResourceRequest(requestId: string, result: AccessPolicyResourceResultView): void {
    const pending = this.pendingResources.get(requestId);
    if (!pending) return;
    this.pendingResources.delete(requestId);
    clearTimeout(pending.timeout);
    pending.resolve(result);
  }

  private finishPlayerRequest(requestId: string, result: AccessPolicyPlayerResultView): void {
    const pending = this.pendingPlayers.get(requestId);
    if (!pending) return;
    this.pendingPlayers.delete(requestId);
    clearTimeout(pending.timeout);
    pending.resolve(result);
  }

  private nextRequestId(operation: string): string {
    if (this.disposed) throw new Error('通用权限请求客户端已释放。');
    this.requestSequence = (this.requestSequence + 1) % Number.MAX_SAFE_INTEGER;
    return `access-policy:${operation}:${Date.now().toString(36)}:${this.requestSequence.toString(36)}`;
  }
}

function resolveAccessPolicyClientError(reason: string | undefined): string {
  switch (reason) {
    case 'access_policy_manage_denied':
      return '当前角色没有管理该权限的资格。';
    case 'access_policy_resource_not_found':
      return '权限资源不存在或已经失效。';
    case 'access_policy_resource_unsupported':
      return '该功能尚未接入通用权限系统。';
    case 'access_policy_rate_limited':
      return '权限操作过于频繁，请稍后再试。';
    case 'access_policy_request_timeout':
      return '权限请求超时，请检查连接后重试。';
    case 'access_policy_socket_not_connected':
    case 'access_policy_socket_not_ready':
      return '当前连接尚未就绪。';
    default:
      return '权限请求失败。';
  }
}
