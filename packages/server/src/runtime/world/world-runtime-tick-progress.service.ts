/**
 * 实例 tick 进度追踪服务
 * 维护每个地图实例的累积 tick 进度，用于帧内步进计算
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
