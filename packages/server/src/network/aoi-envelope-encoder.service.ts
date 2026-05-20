/**
 * AOI Envelope 编码服务。
 * 负责将 envelope POJO 内的 S2C payload 编码为 binary（当前为 JSON → Buffer）。
 * 支持 worker 外移和同步 fallback 两条路径。
 *
 * 编码格式：UTF-8 JSON bytes（后续可替换为 protobuf）。
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
    if (!payload) return null;
    try {
      return Buffer.from(JSON.stringify(payload), 'utf-8');
    } catch {
      return null;
    }
  }

  /** 单 payload worker 编码；失败时回退同步编码。 */
  async encodePayloadAsync(payload: unknown): Promise<Buffer | null> {
    if (!payload) return null;
    if (!this.encodingPool) {
      return this.encodePayloadSync(payload);
    }

    const result = await this.encodingPool.submit<unknown, Buffer>(
      'envelope-encode',
      payload,
      (fallbackPayload) => Buffer.from(JSON.stringify(fallbackPayload), 'utf-8'),
      200,
    );

    if (result.ok && result.result) {
      return Buffer.isBuffer(result.result) ? result.result : Buffer.from(result.result);
    }
    return this.encodePayloadSync(payload);
  }
}
