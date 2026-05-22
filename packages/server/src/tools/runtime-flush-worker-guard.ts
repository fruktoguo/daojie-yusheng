/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { isInlineFlushTaskRuntimeMode } from '../persistence/flush-task-runtime-mode';

export function assertFullAppFlushWorkerAllowed(workerName: string): void {
  if (!isInlineFlushTaskRuntimeMode()) {
    return;
  }
  const raw = process.env.SERVER_ALLOW_FULL_APP_FLUSH_WORKER ?? process.env.ALLOW_FULL_APP_FLUSH_WORKER;
  if (typeof raw === 'string' && /^(1|true|yes|on)$/iu.test(raw.trim())) {
    return;
  }
  throw new Error(
    `${workerName} 会启动完整 AppModule，不能作为生产独立 flush worker 使用；` +
    '当前生产模式为 SERVER_FLUSH_TASK_RUNTIME_MODE=inline。若仅用于诊断，请显式设置 SERVER_ALLOW_FULL_APP_FLUSH_WORKER=1。',
  );
}
