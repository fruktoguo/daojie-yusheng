/**
 * ActorBlueprintRegistryService：ActorBlueprint 的内存注册表（LRU + TTL）。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §5.1。
 *
 * 用途：
 * - bot 客户端登录时根据 blueprintId 拿回蓝图，应用到 player runtime 上。
 * - 分身 / 宠物 玩法系统也可以走相同结构（玩法侧自己持有 blueprintId 即可）。
 *
 * 容量与 TTL：
 * - 容量上限默认 1000，超过则按"最早生成"淘汰最旧条目（简单 LRU）。
 * - TTL 默认 30 分钟，过期惰性删除 + 周期 GC。
 * - 服务重启即全部失效（设计文档接受）。
 *
 * 第 1 批阶段：fromPlayer 暂未实现，注册表仅承担"接受外部传入的合法蓝图 + 缓存"。
 * 第 2 批接入克隆逻辑（参考 packages/server/src/network/projector-clone.ts 的 clone* 函数族）。
 */

import { randomBytes } from 'node:crypto';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { ACTOR_BLUEPRINT_ID_PREFIX, ActorBlueprint } from '@mud/shared';

/** 默认 LRU 容量。 */
const DEFAULT_CAPACITY = 1_000;

/** 默认 TTL（毫秒）：30 分钟。 */
const DEFAULT_TTL_MS = 30 * 60 * 1_000;

/** GC 扫描周期（毫秒）。 */
const GC_INTERVAL_MS = 60_000;

/** 注册表项（含创建时间，便于 LRU 与 GC）。 */
interface BlueprintEntry {
  blueprint: ActorBlueprint;
  expiresAtMs: number;
}

@Injectable()
export class ActorBlueprintRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(ActorBlueprintRegistryService.name);
  private readonly capacity: number;
  private readonly ttlMs: number;
  /** 使用 Map 保留插入顺序，作为 LRU 的"最旧"端。 */
  private readonly entries = new Map<string, BlueprintEntry>();
  private gcTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.capacity = DEFAULT_CAPACITY;
    this.ttlMs = DEFAULT_TTL_MS;
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
    this.entries.clear();
  }

  /**
   * 生成新的 blueprintId。
   * 格式：`bp_<base36 时间戳>_<6 字节 hex 随机后缀>`，避免高并发签发碰撞。
   */
  generateBlueprintId(): string {
    const ts = Date.now().toString(36);
    const rnd = randomBytes(6).toString('hex');
    return `${ACTOR_BLUEPRINT_ID_PREFIX}${ts}_${rnd}`;
  }

  /**
   * 注册一份蓝图。重复 ID 抛错，超容量先淘汰最旧条目。
   * 调用方应保证 blueprint.blueprintId 与 generateBlueprintId 输出一致或合法。
   */
  register(blueprint: ActorBlueprint): ActorBlueprint {
    const blueprintId = blueprint.blueprintId;
    if (typeof blueprintId !== 'string' || blueprintId.length === 0) {
      throw new Error('ActorBlueprintRegistryService.register: blueprintId 不能为空');
    }
    if (this.entries.has(blueprintId)) {
      throw new Error(`ActorBlueprintRegistryService.register: blueprintId ${blueprintId} 已存在`);
    }
    if (this.entries.size >= this.capacity) {
      this.evictOldest();
    }
    const expiresAtMs = Date.now() + this.ttlMs;
    this.entries.set(blueprintId, { blueprint, expiresAtMs });
    return blueprint;
  }

  /** 查询蓝图；过期时惰性删除并返回 null。 */
  get(blueprintId: string): ActorBlueprint | null {
    const entry = this.entries.get(blueprintId);
    if (!entry) {
      return null;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(blueprintId);
      return null;
    }
    return entry.blueprint;
  }

  /** 删除蓝图。 */
  remove(blueprintId: string): boolean {
    return this.entries.delete(blueprintId);
  }

  /** 当前缓存规模。 */
  size(): number {
    return this.entries.size;
  }

  /** 当前容量上限。 */
  getCapacity(): number {
    return this.capacity;
  }

  /** 当前 TTL（毫秒）。 */
  getTtlMs(): number {
    return this.ttlMs;
  }

  /** 淘汰最旧条目（Map 按插入顺序，第一个 key 即最旧）。 */
  private evictOldest(): void {
    const oldestKey = this.entries.keys().next().value;
    if (typeof oldestKey === 'string') {
      this.entries.delete(oldestKey);
    }
  }

  /** 周期清理过期蓝图。 */
  private runGcSweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [blueprintId, entry] of this.entries) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(blueprintId);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.log(`GC 清理过期蓝图 ${removed} 个，剩余 ${this.entries.size}`);
    }
  }
}
