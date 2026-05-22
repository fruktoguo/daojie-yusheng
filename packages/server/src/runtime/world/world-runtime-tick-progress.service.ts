/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable } from '@nestjs/common';

/** 按实例 ID 追踪 tick 累积进度（0~1 浮点） */
@Injectable()
export class WorldRuntimeTickProgressService {
  readonly instanceTickProgressById = new Map<string, number>();

  getProgress(instanceId: string): number {
    return this.instanceTickProgressById.get(instanceId) ?? 0;
  }

  setProgress(instanceId: string, progress: number): void {
    this.instanceTickProgressById.set(instanceId, progress);
  }

  initializeInstance(instanceId: string): void {
    this.instanceTickProgressById.set(instanceId, 0);
  }

  clearInstance(instanceId: string): void {
    this.instanceTickProgressById.delete(instanceId);
  }

  resetState(): void {
    this.instanceTickProgressById.clear();
  }
}
