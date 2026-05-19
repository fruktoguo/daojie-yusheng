/**
 * AOI Envelope 编码服务。
 * 负责将 envelope POJO 内的 S2C payload 编码为 binary（当前为 JSON → Buffer）。
 * 支持 worker 外移和同步 fallback 两条路径。
 *
 * 编码格式：UTF-8 JSON bytes（后续可替换为 protobuf）。
 * 客户端通过 isBinaryPayload 判断后走 JSON.parse(Buffer) 解码。
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

/** 特性开关：是否启用 AOI envelope worker 编码 */
function isAoiEnvelopeWorkerEnabled(): boolean {
  return process.env.SERVER_AOI_ENVELOPE_WORKER_ENABLED === 'true';
}

/** 灰度比例（0-100），按 playerId hash 决定是否走 worker 路径 */
function getAoiEnvelopeWorkerGrayPercent(): number {
  const raw = Number(process.env.SERVER_AOI_ENVELOPE_WORKER_GRAY_PERCENT);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 100;
}

@Injectable()
export class AoiEnvelopeEncoderService {
  private readonly enabled: boolean;
  private readonly grayPercent: number;

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
  ) {
    this.enabled = isAoiEnvelopeWorkerEnabled();
    this.grayPercent = getAoiEnvelopeWorkerGrayPercent();
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.enabled && Boolean(this.encodingPool?.isEnabled());
  }

  /** 判断指定玩家是否走 worker 编码路径（灰度控制） */
  shouldUseWorkerForPlayer(playerId: string): boolean {
    if (!this.isEnabled()) return false;
    if (this.grayPercent >= 100) return true;
    if (this.grayPercent <= 0) return false;
    return (hashPlayerId(playerId) % 100) < this.grayPercent;
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
    if (!this.encodingPool?.isEnabled()) {
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
    if (!this.encodingPool?.isEnabled()) {
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

/** 简单的 playerId hash，用于灰度分流 */
function hashPlayerId(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i += 1) {
    hash = ((hash << 5) - hash + playerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
