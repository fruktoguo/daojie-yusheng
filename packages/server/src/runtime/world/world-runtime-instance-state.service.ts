/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
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
