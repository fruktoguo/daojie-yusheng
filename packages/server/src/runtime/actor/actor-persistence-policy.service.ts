/**
 * ActorPersistencePolicyService：actor 落库策略路由。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §5.5。
 *
 * 设计目标：所有写持久化 / 写运营态的服务（player flush、leaderboard、邮件、市场、
 * outbox、player counters、player domain persistence）在写入前调用本服务的
 * `isPersistenceAllowed(playerId, domain)`，即可短路 ephemeral actor，避免
 * 数据污染。
 *
 * 第 1 批阶段：仅定义 policy 类型与解析逻辑；实际接入 6 个持久化拦截点放到第 2 批。
 *
 * 默认规则（无显式注册时）：
 * - playerId 前缀属于 bot/clone/pet → none / derived / owner-sub（由前缀映射决定）
 * - 其它 → full（真实玩家全字段持久化）
 */

import { Injectable } from '@nestjs/common';

import { EphemeralActorKind, getEphemeralKind } from '@mud/shared';

/** 持久化策略联合类型。 */
export type ActorPersistencePolicy =
  | { readonly kind: 'full' }
  | { readonly kind: 'none' }
  | {
      readonly kind: 'derived_from_owner';
      readonly ownerPlayerId: string;
      readonly derivedSubresource: 'clone';
    }
  | {
      readonly kind: 'owner_sub_resource';
      readonly ownerPlayerId: string;
      readonly derivedSubresource: 'pet';
    };

/**
 * 持久化 domain 类别。
 * - snapshot：玩家整体快照（player-domain-persistence）
 * - inventory / equipment / wallet / counters：维度独立 flush
 * - mail / market / outbox / leaderboard / audit：跨表运营态
 *
 * 第 1 批接入点先约定枚举，下一批由具体服务调用 isPersistenceAllowed 时声明。
 */
export type ActorPersistenceDomain =
  | 'snapshot'
  | 'presence'
  | 'inventory'
  | 'equipment'
  | 'wallet'
  | 'counters'
  | 'mail'
  | 'market'
  | 'outbox'
  | 'leaderboard'
  | 'audit'
  | 'identity'
  | 'session_route';

@Injectable()
export class ActorPersistencePolicyService {
  /** 显式注册的 policy 表（默认空，按前缀回退）。 */
  private readonly policies = new Map<string, ActorPersistencePolicy>();

  /** 注册一个 actor 的 policy（覆盖前缀默认）。 */
  register(playerId: string, policy: ActorPersistencePolicy): void {
    if (typeof playerId !== 'string' || playerId.length === 0) {
      throw new Error('ActorPersistencePolicyService.register: playerId 不能为空');
    }
    this.policies.set(playerId, policy);
  }

  /** 注销 policy（actor 释放时调用）。 */
  unregister(playerId: string): boolean {
    return this.policies.delete(playerId);
  }

  /** 解析 playerId 的 policy；未注册时按前缀回退到默认值。 */
  resolve(playerId: unknown): ActorPersistencePolicy {
    if (typeof playerId !== 'string' || playerId.length === 0) {
      return { kind: 'full' };
    }
    const explicit = this.policies.get(playerId);
    if (explicit) {
      return explicit;
    }
    const kind = getEphemeralKind(playerId);
    return defaultPolicyForKind(kind);
  }

  /**
   * 判断指定 domain 是否允许走持久化。
   * - full：全部允许
   * - none：全部拒绝
   * - derived_from_owner：snapshot/identity/audit 走 owner 派生子表（clone）；其它拒绝
   * - owner_sub_resource：snapshot/identity/audit 走 owner 子表（pet）；其它拒绝
   *
   * 第 1 批阶段：返回值仅为概念决策；具体接入由 §5.5 列出的 6 个服务在第 2 批落地。
   */
  isPersistenceAllowed(playerId: unknown, domain: ActorPersistenceDomain): boolean {
    const policy = this.resolve(playerId);
    switch (policy.kind) {
      case 'full':
        return true;
      case 'none':
        return false;
      case 'derived_from_owner':
      case 'owner_sub_resource':
        return DERIVED_ALLOWED_DOMAINS.has(domain);
      default: {
        const exhaustiveCheck: never = policy;
        throw new Error(`未知 policy.kind ${String(exhaustiveCheck)}`);
      }
    }
  }

  /** 当前已注册的 policy 数量。 */
  size(): number {
    return this.policies.size;
  }
}

/** 派生持久化默认允许的 domain 集合：仅 owner 子表内可见。 */
const DERIVED_ALLOWED_DOMAINS: ReadonlySet<ActorPersistenceDomain> = new Set([
  'snapshot',
  'identity',
  'audit',
]);

/** 由 ephemeral kind 解析默认 policy。 */
function defaultPolicyForKind(kind: EphemeralActorKind | null): ActorPersistencePolicy {
  if (kind === 'bot') {
    return { kind: 'none' };
  }
  // clone / pet 在第 1 批没有 owner 信息可填；下一批由玩法系统在 register 时显式提供。
  // 默认回退 none，强制玩法系统主动 register。
  if (kind === 'clone' || kind === 'pet') {
    return { kind: 'none' };
  }
  return { kind: 'full' };
}
