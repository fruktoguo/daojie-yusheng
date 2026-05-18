/**
 * AOI Envelope Worker 编码委托服务。
 * 当 SERVER_AOI_ENVELOPE_WORKER_ENABLED=true 时，
 * 通过 EncodingWorkerPool 异步编码 envelope 并 emit。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';

/** 待发送的 envelope 条目 */
export interface PendingEnvelopeEmit {
  socket: unknown;
  envelope: unknown;
  playerId: string;
  player: unknown;
  postEmitFn: () => void;
}

@Injectable()
export class WorldSyncWorkerEncodeService {
  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingWorkerPool?: EncodingWorkerPoolService,
    @Inject(WorldSyncProtocolService)
    private readonly worldSyncProtocolService?: WorldSyncProtocolService,
  ) {}

  /** 是否应使用 worker 异步编码路径 */
  shouldUseWorkerEncode(): boolean {
    return process.env.SERVER_AOI_ENVELOPE_WORKER_ENABLED === 'true'
      && Boolean(this.encodingWorkerPool?.isEnabled());
  }

  /**
   * 批量通过 worker pool 编码 envelope 并 emit。
   * 编码在 worker 中异步执行，完成后按顺序 emit。
   * 失败时 fallback 到主线程同步发送。
   */
  flushPendingEmitsViaWorker(pendingEmits: PendingEnvelopeEmit[]): void {
    if (pendingEmits.length === 0) return;
    const pool = this.encodingWorkerPool!;
    const protocol = this.worldSyncProtocolService!;

    // 批量提交编码任务
    const tasks = pendingEmits.map(({ envelope }) =>
      pool.submit<unknown, Buffer>(
        'envelope-encode',
        envelope,
        (payload) => Buffer.from(JSON.stringify(payload), 'utf-8'),
        200,
      ),
    );

    // 异步等待编码完成后 emit
    Promise.all(tasks).then((results) => {
      for (let i = 0; i < results.length; i++) {
        const { socket, envelope } = pendingEmits[i];
        // 无论 worker 成功与否，都用原始 envelope 发送
        // （binary 编码由 WorldSyncProtocolService.maybeEncodeBinary 处理）
        protocol.sendEnvelope(socket, envelope);
        pendingEmits[i].postEmitFn();
      }
    }).catch(() => {
      // 全部失败 fallback
      for (const { socket, envelope, postEmitFn } of pendingEmits) {
        protocol.sendEnvelope(socket, envelope);
        postEmitFn();
      }
    });
  }
}
