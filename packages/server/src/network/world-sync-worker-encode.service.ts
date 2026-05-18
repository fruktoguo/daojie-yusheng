/**
 * AOI Envelope Worker 编码委托服务。
 * 当 SERVER_AOI_ENVELOPE_WORKER_ENABLED=true 时，
 * 通过 EncodingWorkerPool 异步编码 envelope 并 emit。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { WorkerPoolToggleService } from '../concurrency/worker-pool-toggle.service';
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
  private readonly logger = new Logger(WorldSyncWorkerEncodeService.name);
  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingWorkerPool?: EncodingWorkerPoolService,
    @Optional() @Inject(WorkerPoolToggleService)
    private readonly toggleService?: WorkerPoolToggleService,
    @Inject(WorldSyncProtocolService)
    private readonly worldSyncProtocolService?: WorldSyncProtocolService,
  ) {}

  /** 是否应使用 worker 异步编码路径（通过 GM toggle 动态控制） */
  shouldUseWorkerEncode(): boolean {
    return this.toggleService?.isAoiEnvelopeEnabled() === true
      && Boolean(this.encodingWorkerPool?.isEnabled());
  }

  /**
   * 批量发送 envelope 并通过 worker pool 异步编码（用于指标统计）。
   * 发送本身是同步的（保证顺序），worker 编码在后台异步执行不影响发送时序。
   */
  flushPendingEmitsViaWorker(pendingEmits: PendingEnvelopeEmit[]): void {
    if (pendingEmits.length === 0 || !this.worldSyncProtocolService) return;
    const protocol = this.worldSyncProtocolService;

    // 同步发送所有 envelope（保证顺序和时序）
    for (const { socket, envelope, postEmitFn } of pendingEmits) {
      protocol.sendEnvelope(socket, envelope);
      postEmitFn();
    }

    // 后台异步提交 worker 编码任务（仅用于指标统计和预热）
    if (this.encodingWorkerPool?.isEnabled()) {
      for (const { envelope } of pendingEmits) {
        if (envelope) {
          this.encodingWorkerPool.submit(
            'envelope-encode',
            envelope,
            (payload) => Buffer.from(JSON.stringify(payload), 'utf-8'),
            200,
          ).catch(() => { /* 静默忽略，不影响已发送的数据 */ });
        }
      }
    }
  }
}
