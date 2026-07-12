/**
 * 本文件属于服务端权威运行时，负责动态实例从内存创建到 catalog lease 就绪之间的异步边界。
 * tick 与同步会话挂接只消费最终就绪状态，不直接承担数据库注册或接管编排。
 */
import { Injectable } from '@nestjs/common';

import { syncManagedInstanceRegistration } from './world-runtime-instance-lease.helpers';

interface PendingInstanceLeaseRegistration {
  generation: number;
  instance: unknown;
  task: Promise<void>;
}

@Injectable()
export class WorldRuntimeInstanceLeaseReadinessService {
  private generation = 0;
  private readonly pendingByInstanceId = new Map<string, PendingInstanceLeaseRegistration>();

  schedule(instanceIdInput: string, instance: unknown, runtime: any): Promise<void> {
    const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
    if (!instanceId) {
      return Promise.resolve();
    }
    const generation = this.generation;
    const previousTask = this.pendingByInstanceId.get(instanceId)?.task ?? Promise.resolve();
    const isCurrent = () => (
      generation === this.generation
      && runtime.getInstanceRuntime?.(instanceId) === instance
    );
    const task = previousTask
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrent()) {
          return;
        }
        await syncManagedInstanceRegistration(runtime, instanceId, instance, { isCurrent });
    });
    const pending = { generation, instance, task };
    this.pendingByInstanceId.set(instanceId, pending);
    const cleanup = () => {
      if (this.pendingByInstanceId.get(instanceId) === pending) {
        this.pendingByInstanceId.delete(instanceId);
      }
    };
    void task.then(cleanup, cleanup);
    return task;
  }

  async wait(instanceIdInput: string): Promise<void> {
    const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
    if (!instanceId) {
      return;
    }
    while (true) {
      const pending = this.pendingByInstanceId.get(instanceId);
      if (!pending) {
        return;
      }
      await pending.task;
      if (this.pendingByInstanceId.get(instanceId) === pending) {
        return;
      }
    }
  }

  reset(): void {
    // 只让旧任务失效，不清除串行尾链；同 ID 新 runtime 必须等待已进入数据库的旧 upsert 返回后再覆盖。
    this.generation += 1;
  }

  getPendingCount(): number {
    return this.pendingByInstanceId.size;
  }
}
