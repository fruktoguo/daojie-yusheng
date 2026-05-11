/**
 * 地图实例运行时状态容器
 * 以泛型 Map 存储所有活跃实例的运行时对象，提供增删查遍历接口
 */
import { Injectable } from '@nestjs/common';

/** 泛型实例状态容器，TInstance 为具体实例运行时类型 */
@Injectable()
export class WorldRuntimeInstanceStateService<TInstance = unknown> {
  readonly instances = new Map<string, TInstance>();

  getInstanceRuntime(instanceId: string): TInstance | null {
    return this.instances.get(instanceId) ?? null;
  }

  setInstanceRuntime(instanceId: string, instance: TInstance): void {
    this.instances.set(instanceId, instance);
  }

  deleteInstanceRuntime(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  listInstanceRuntimes(): IterableIterator<TInstance> {
    return this.instances.values();
  }

  listInstanceEntries(): IterableIterator<[string, TInstance]> {
    return this.instances.entries();
  }

  getInstanceCount(): number {
    return this.instances.size;
  }

  resetState(): void {
    this.instances.clear();
  }
}
