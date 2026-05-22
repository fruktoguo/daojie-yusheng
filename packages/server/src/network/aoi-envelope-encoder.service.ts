/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';

/** 编码后的 envelope 包；仅包含需要以二进制下发的 S2C payload。 */
export interface EncodedEnvelope {
  worldDelta?: Buffer | null;
  selfDelta?: Buffer | null;
  panelDelta?: Buffer | null;
  mapEnter?: Buffer | null;
}

interface EnvelopeLike {
  worldDelta?: unknown;
  selfDelta?: unknown;
  panelDelta?: unknown;
  mapEnter?: unknown;
}

@Injectable()
export class AoiEnvelopeEncoderService {
  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
  ) {}

  /** 是否启用 */
  isEnabled(): boolean {
    return Boolean(this.encodingPool);
  }

  /** 判断指定玩家是否走 worker 编码路径。 */
  shouldUseWorkerForPlayer(_playerId: string): boolean {
    return Boolean(this.encodingPool);
  }

  /** 同步编码 envelope 内各 S2C payload。 */
  encodeEnvelopeSync(envelope: EnvelopeLike): EncodedEnvelope {
    return {
      mapEnter: this.encodePayloadSync(envelope?.mapEnter),
      worldDelta: this.encodePayloadSync(envelope?.worldDelta),
      selfDelta: this.encodePayloadSync(envelope?.selfDelta),
      panelDelta: this.encodePayloadSync(envelope?.panelDelta),
    };
  }

  /** 通过 worker pool 异步编码 envelope 内各 S2C payload。 */
  async encodeEnvelopeAsync(envelope: EnvelopeLike): Promise<EncodedEnvelope> {
    if (!this.encodingPool) {
      return this.encodeEnvelopeSync(envelope);
    }

    const [mapEnter, worldDelta, selfDelta, panelDelta] = await Promise.all([
      this.encodePayloadAsync(envelope?.mapEnter),
      this.encodePayloadAsync(envelope?.worldDelta),
      this.encodePayloadAsync(envelope?.selfDelta),
      this.encodePayloadAsync(envelope?.panelDelta),
    ]);

    return { mapEnter, worldDelta, selfDelta, panelDelta };
  }

  /** 单 payload 同步编码。 */
  encodePayloadSync(payload: unknown): Buffer | null {
    if (payload === null || payload === undefined) {
      return null;
    }
    try {
      return Buffer.from(JSON.stringify(payload), 'utf-8');
    } catch {
      return null;
    }
  }

  /** 单 payload worker 编码。 */
  async encodePayloadAsync(payload: unknown): Promise<Buffer | null> {
    if (payload === null || payload === undefined) {
      return null;
    }
    if (!this.encodingPool) {
      return this.encodePayloadSync(payload);
    }
    const result = await this.encodingPool.submit<unknown, Buffer>(
      'envelope-encode',
      payload,
      (value) => Buffer.from(JSON.stringify(value), 'utf-8'),
      500,
    );
    if (result.ok && result.result) {
      return Buffer.from(result.result);
    }
    return this.encodePayloadSync(payload);
  }
}
