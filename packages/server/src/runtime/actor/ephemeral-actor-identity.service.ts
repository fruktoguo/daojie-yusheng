/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import {
  EPHEMERAL_BOT_ID_PREFIX,
  EPHEMERAL_CLONE_ID_PREFIX,
  EPHEMERAL_ID_PREFIXES,
  EPHEMERAL_PET_ID_PREFIX,
  EphemeralActorIdentity,
  EphemeralActorKind,
  getEphemeralKind,
  isEphemeralPlayerId,
} from '@mud/shared';

/** GC 扫描周期（毫秒）：每 60 秒清扫一次过期 identity。 */
const GC_INTERVAL_MS = 60_000;

/** 单 owner 同时活跃的 ephemeral identity 默认上限（防泄漏）。 */
const DEFAULT_OWNER_QUOTA = 5_000;

/** 蓝图与 ephemeral identity 派发请求体。 */
export interface EphemeralActorIssueInput {
  /** 已生成好的 playerId（含正确前缀）。 */
  playerId: string;
  /** 类型分类。 */
  kind: EphemeralActorKind;
  /** 主玩家 ID；bot 为 null。 */
  ownerPlayerId: string | null;
  /** 关联蓝图 ID；可选。 */
  blueprintId: string | null;
  /** 失效时间（毫秒）。 */
  expiresAtMs: number;
  /** 推荐 spawn 地图模板 ID。 */
  preferredMapId: string;
  /** 推荐 spawn X 坐标。 */
  preferredX: number;
  /** 推荐 spawn Y 坐标。 */
  preferredY: number;
}

@Injectable()
export class EphemeralActorIdentityService implements OnModuleDestroy {
  private readonly logger = new Logger(EphemeralActorIdentityService.name);
  /** playerId -> identity 主表。 */
  private readonly registry = new Map<string, EphemeralActorIdentity>();
  /** owner -> playerIds 反向索引；bot 走 `__no_owner__` 桶。 */
  private readonly ownerIndex = new Map<string, Set<string>>();
  /** GC 定时器引用，模块销毁时清理。 */
  private gcTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.gcTimer = setInterval(() => this.runGcSweep(), GC_INTERVAL_MS);
    if (typeof this.gcTimer.unref === 'function') {
      this.gcTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.registry.clear();
    this.ownerIndex.clear();
  }

  /** 注册一个 ephemeral identity，前缀必须与 kind 一致。 */
  issue(input: EphemeralActorIssueInput): EphemeralActorIdentity {
    const playerId = (input.playerId ?? '').trim();
    if (!playerId) {
      throw new Error('EphemeralActorIdentityService.issue: playerId 不能为空');
    }
    const expectedPrefix = this.resolvePrefix(input.kind);
    if (!playerId.startsWith(expectedPrefix)) {
      throw new Error(
        `EphemeralActorIdentityService.issue: playerId ${playerId} 缺少前缀 ${expectedPrefix}`,
      );
    }
    if (this.registry.has(playerId)) {
      throw new Error(`EphemeralActorIdentityService.issue: playerId ${playerId} 已存在`);
    }
    const ownerKey = input.ownerPlayerId ?? '__no_owner__';
    const ownerSet = this.ensureOwnerBucket(ownerKey);
    if (ownerSet.size >= DEFAULT_OWNER_QUOTA) {
      throw new Error(
        `EphemeralActorIdentityService.issue: owner ${ownerKey} 超过上限 ${DEFAULT_OWNER_QUOTA}`,
      );
    }

    const identity: EphemeralActorIdentity = {
      playerId,
      kind: input.kind,
      ownerPlayerId: input.ownerPlayerId,
      blueprintId: input.blueprintId,
      issuedAtMs: Date.now(),
      expiresAtMs: input.expiresAtMs,
      preferredMapId: input.preferredMapId,
      preferredX: input.preferredX,
      preferredY: input.preferredY,
    };
    this.registry.set(playerId, identity);
    ownerSet.add(playerId);
    return identity;
  }

  /** 查询 identity；如果已过期会被惰性删除并返回 null。 */
  get(playerId: string): EphemeralActorIdentity | null {
    const entry = this.registry.get(playerId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs > 0 && entry.expiresAtMs <= Date.now()) {
      this.release(playerId);
      return null;
    }
    return entry;
  }

  /** 注销一个 identity。 */
  release(playerId: string): boolean {
    const entry = this.registry.get(playerId);
    if (!entry) {
      return false;
    }
    this.registry.delete(playerId);
    const ownerKey = entry.ownerPlayerId ?? '__no_owner__';
    const ownerSet = this.ownerIndex.get(ownerKey);
    if (ownerSet) {
      ownerSet.delete(playerId);
      if (ownerSet.size === 0) {
        this.ownerIndex.delete(ownerKey);
      }
    }
    return true;
  }

  /** 列出当前全部活跃 identity（不含已过期）。 */
  listAll(): EphemeralActorIdentity[] {
    const now = Date.now();
    const result: EphemeralActorIdentity[] = [];
    for (const identity of this.registry.values()) {
      if (identity.expiresAtMs > 0 && identity.expiresAtMs <= now) {
        continue;
      }
      result.push(identity);
    }
    return result;
  }

  /** 列出指定 owner 派发的 identity；ownerPlayerId 为 null 时返回 bot。 */
  listByOwner(ownerPlayerId: string | null): EphemeralActorIdentity[] {
    const ownerKey = ownerPlayerId ?? '__no_owner__';
    const set = this.ownerIndex.get(ownerKey);
    if (!set || set.size === 0) {
      return [];
    }
    const result: EphemeralActorIdentity[] = [];
    const now = Date.now();
    for (const playerId of set) {
      const identity = this.registry.get(playerId);
      if (!identity) continue;
      if (identity.expiresAtMs > 0 && identity.expiresAtMs <= now) continue;
      result.push(identity);
    }
    return result;
  }

  /** 全链路识别工具：基于前缀，无需查表。 */
  isEphemeral(playerId: unknown): boolean {
    return isEphemeralPlayerId(playerId);
  }

  /** 全链路识别工具：返回 ephemeral kind 或 null。 */
  getKind(playerId: unknown): EphemeralActorKind | null {
    return getEphemeralKind(playerId);
  }

  /** 当前注册表规模（含未过期 + 待 GC 项）。 */
  size(): number {
    return this.registry.size;
  }

  /** 全部 ephemeral 前缀只读引用。 */
  getPrefixes(): readonly string[] {
    return EPHEMERAL_ID_PREFIXES;
  }

  /** 由 kind 解析出强制前缀。 */
  private resolvePrefix(kind: EphemeralActorKind): string {
    switch (kind) {
      case 'bot':
        return EPHEMERAL_BOT_ID_PREFIX;
      case 'clone':
        return EPHEMERAL_CLONE_ID_PREFIX;
      case 'pet':
        return EPHEMERAL_PET_ID_PREFIX;
      default: {
        const exhaustiveCheck: never = kind;
        throw new Error(`EphemeralActorIdentityService: 未知 kind ${String(exhaustiveCheck)}`);
      }
    }
  }

  /** 获取或创建 owner 桶。 */
  private ensureOwnerBucket(ownerKey: string): Set<string> {
    let bucket = this.ownerIndex.get(ownerKey);
    if (!bucket) {
      bucket = new Set();
      this.ownerIndex.set(ownerKey, bucket);
    }
    return bucket;
  }

  /** 主动扫描并清理过期 identity，避免长期运行时内存泄漏。 */
  private runGcSweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [playerId, identity] of this.registry) {
      if (identity.expiresAtMs > 0 && identity.expiresAtMs <= now) {
        this.registry.delete(playerId);
        const ownerKey = identity.ownerPlayerId ?? '__no_owner__';
        const ownerSet = this.ownerIndex.get(ownerKey);
        if (ownerSet) {
          ownerSet.delete(playerId);
          if (ownerSet.size === 0) {
            this.ownerIndex.delete(ownerKey);
          }
        }
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.log(`垃圾回收清理过期临时身份 ${removed} 个，剩余 ${this.registry.size}`);
    }
  }
}
