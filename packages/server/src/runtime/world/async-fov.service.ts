/**
 * 异步 FOV 计算服务。
 * 从 MapInstanceRuntime 提取 blocksSightMask，通过 EncodingWorkerPool 异步执行 FOV。
 * 用于批量玩家 FOV 计算的并行化。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../../concurrency/encoding-worker-pool.service';
import type { FovPayload, FovResult } from '../../concurrency/worker-task.types';
import { collectVisibleTileIndices } from '../instance/fov.helpers';

/** FOV 计算所需的实例最小接口 */
interface FovInstancePort {
  template: { width: number; height: number };
  meta?: { instanceId?: string };
  blocksSight?(tileIndex: number): boolean;
}

@Injectable()
export class AsyncFovService {
  /** 缓存的 blocksSightMask，按 instanceId 复用 */
  private maskCache = new Map<string, { revision: number; mask: Uint8Array }>();

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
  ) {}

  /**
   * 异步 FOV 计算。Worker 可用时通过 pool 执行，否则同步 fallback。
   */
  async computeFovAsync(
    instance: FovInstancePort,
    originX: number,
    originY: number,
    radius: number,
    revision?: number,
  ): Promise<Set<number>> {
    const width = instance.template.width;
    const height = instance.template.height;

    if (!this.encodingPool) {
      return this.computeFovSync(instance, originX, originY, radius);
    }

    const mask = this.getOrBuildMask(instance, revision ?? 0);
    const payload: FovPayload = {
      blocksSightMask: mask,
      width,
      height,
      originX,
      originY,
      radius,
    };

    const result = await this.encodingPool.submit<FovPayload, FovResult>(
      'fov',
      payload,
      (p) => ({ visibleIndices: new Uint32Array(this.computeFovSync(instance, p.originX, p.originY, p.radius)) }),
      200,
    );

    if (result.ok && result.result) {
      return new Set(result.result.visibleIndices);
    }
    return this.computeFovSync(instance, originX, originY, radius);
  }

  /** 同步 FOV 计算（fallback） */
  private computeFovSync(
    instance: FovInstancePort,
    originX: number,
    originY: number,
    radius: number,
  ): Set<number> {
    const width = instance.template.width;
    const height = instance.template.height;
    return collectVisibleTileIndices(
      width,
      height,
      originX,
      originY,
      radius,
      (index: number) => instance.blocksSight?.(index) ?? false,
    );
  }

  private getOrBuildMask(instance: FovInstancePort, revision: number): Uint8Array {
    const instanceId = instance.meta?.instanceId ?? 'unknown';
    const cached = this.maskCache.get(instanceId);
    if (cached && cached.revision === revision) {
      return cached.mask;
    }

    const width = instance.template.width;
    const height = instance.template.height;
    const total = width * height;
    const mask = new Uint8Array(total);

    for (let i = 0; i < total; i += 1) {
      mask[i] = instance.blocksSight?.(i) ? 1 : 0;
    }

    this.maskCache.set(instanceId, { revision, mask });
    if (this.maskCache.size > 50) {
      const firstKey = this.maskCache.keys().next().value;
      if (firstKey) this.maskCache.delete(firstKey);
    }
    return mask;
  }
}
