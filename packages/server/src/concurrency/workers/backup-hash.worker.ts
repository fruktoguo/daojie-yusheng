/**
 * 本文件属于服务端并发工作线程，负责把 CPU 密集任务移出主线程 event loop。
 *
 * 备份文件 SHA-256 校验：整点 pg_dump 产出的 dump 可达数百 MB，
 * 在主线程逐块 hash.update 会持续抢占 event loop，把 1Hz 世界 tick 顶成慢帧。
 * 该 worker 由 native-postgres-backup 按次拉起，算完即退出，不常驻。
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

export interface BackupHashWorkerResult {
  ok: boolean;
  digest?: string;
  error?: string;
}

const port = parentPort;
if (!port) {
  throw new Error('backup-hash.worker 必须在 worker_thread 中运行');
}

const filePath = typeof (workerData as { filePath?: unknown } | null)?.filePath === 'string'
  ? String((workerData as { filePath: string }).filePath).trim()
  : '';

const postResult = (result: BackupHashWorkerResult): void => {
  port.postMessage(result);
};

if (!filePath) {
  postResult({ ok: false, error: 'backup-hash.worker 缺少 filePath' });
} else {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => {
    hash.update(chunk as Buffer);
  });
  stream.on('error', (error: Error) => {
    postResult({ ok: false, error: error.message });
  });
  stream.on('end', () => {
    postResult({ ok: true, digest: hash.digest('hex') });
  });
}
