/**
 * AOI Envelope Worker 编码委托服务。
 * 当 runtime flag 开启时，通过 EncodingWorkerPool 异步编码 envelope payload 并按原顺序 emit。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { WorkerPoolToggleService } from '../concurrency/worker-pool-toggle.service';
import { AoiEnvelopeEncoderService, type EncodedEnvelope } from './aoi-envelope-encoder.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';

/** 待发送的 envelope 条目 */
export interface PendingEnvelopeEmit {
  socket: unknown;
  envelope: unknown;
  playerId: string;
  player: unknown;
  postEmitFn: () => void;
}

interface EncodedPendingEnvelopeEmit extends PendingEnvelopeEmit {
  encoded: EncodedEnvelope | null;
}

@Injectable()
export class WorldSyncWorkerEncodeService {
  private readonly logger = new Logger(WorldSyncWorkerEncodeService.name);

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingWorkerPool?: EncodingWorkerPoolService,
    @Optional() @Inject(WorkerPoolToggleService)
    private readonly toggleService?: WorkerPoolToggleService,
    @Optional() @Inject(AoiEnvelopeEncoderService)
    private readonly aoiEnvelopeEncoder?: AoiEnvelopeEncoderService,
    @Inject(WorldSyncProtocolService)
    private readonly worldSyncProtocolService?: WorldSyncProtocolService,
  ) {}

  /** 是否应使用 worker 异步编码路径（通过 GM toggle 动态控制） */
  shouldUseWorkerEncode(): boolean {
    return this.toggleService?.isAoiEnvelopeEnabled() === true
      && Boolean(this.encodingWorkerPool?.isEnabled())
      && Boolean(this.aoiEnvelopeEncoder?.isEnabled());
  }

  /**
   * 批量编码并发送 envelope。
   * worker 路径会先把 JSON binary 编码卸载到 EncodingWorkerPool，随后按 pendingEmits 原顺序 emit。
   */
  async flushPendingEmitsViaWorker(pendingEmits: PendingEnvelopeEmit[]): Promise<void> {
    if (pendingEmits.length === 0 || !this.worldSyncProtocolService) return;
    const protocol = this.worldSyncProtocolService;
    const encoder = this.aoiEnvelopeEncoder;

    if (!encoder || !this.shouldUseWorkerEncode()) {
      this.flushPendingEmitsSynchronously(protocol, pendingEmits);
      return;
    }

    const encodedEmits = await Promise.all(
      pendingEmits.map(async (pending): Promise<EncodedPendingEnvelopeEmit> => {
        if (!encoder.shouldUseWorkerForPlayer(pending.playerId)) {
          return { ...pending, encoded: null };
        }
        try {
          return {
            ...pending,
            encoded: await encoder.encodeEnvelopeAsync(pending.envelope as Record<string, unknown>),
          };
        } catch (error: unknown) {
          this.logger.warn(
            `AOI envelope worker 编码失败，回退同步发送：playerId=${pending.playerId} error=${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            ...pending,
            encoded: encoder.encodeEnvelopeSync(pending.envelope as Record<string, unknown>),
          };
        }
      }),
    );

    for (const pending of encodedEmits) {
      if (pending.encoded) {
        protocol.sendEncodedEnvelope(pending.socket, pending.envelope, pending.encoded);
      } else {
        protocol.sendEnvelope(pending.socket, pending.envelope);
      }
      pending.postEmitFn();
    }
  }

  private flushPendingEmitsSynchronously(
    protocol: WorldSyncProtocolService,
    pendingEmits: PendingEnvelopeEmit[],
  ): void {
    for (const { socket, envelope, postEmitFn } of pendingEmits) {
      protocol.sendEnvelope(socket, envelope);
      postEmitFn();
    }
  }
}
