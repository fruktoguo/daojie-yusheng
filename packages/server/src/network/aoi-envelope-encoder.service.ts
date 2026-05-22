/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';

/**
 * 预编码 envelope 包占位。
 * 注意：JSON → Buffer 实测包体更大且没有优化收益，当前必须保持 null，
 * 让发送路径回退为原始 JSON 对象；不要在未完成 protobuf/压缩收益验证前改回 Buffer。
 */
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

  /** 单 payload 同步编码。当前显式禁用 Buffer，保持 JSON 对象直发。 */
  encodePayloadSync(_payload: unknown): Buffer | null {
    return null;
  }

  /** 单 payload worker 编码。当前显式禁用 Buffer，保持 JSON 对象直发。 */
  async encodePayloadAsync(_payload: unknown): Promise<Buffer | null> {
    return null;
  }
}
