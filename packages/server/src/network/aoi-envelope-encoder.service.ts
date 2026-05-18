/**
 * AOI Envelope 编码服务。
 * 负责将 envelope POJO 编码为 binary（当前为 JSON → Buffer）。
 * 支持 worker 外移和同步 fallback 两条路径。
 *
 * 编码格式：UTF-8 JSON bytes（后续可替换为 protobuf）。
 * 客户端通过 isBinaryPayload 判断后走 JSON.parse(Buffer) 解码。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';

/** 编码后的 envelope 包 */
export interface EncodedEnvelope {
  /** worldDelta 的 binary 编码（如有） */
  worldDelta?: Buffer;
  /** selfDelta 的 binary 编码（如有） */
  selfDelta?: Buffer;
  /** panelDelta 的 binary 编码（如有） */
  panelDelta?: Buffer;
  /** mapEnter 的 binary 编码（如有） */
  mapEnter?: Buffer;
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
  private readonly logger = new Logger(AoiEnvelopeEncoderService.name);
  private enabled: boolean;
  private grayPercent: number;

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
    if (!this.enabled) return false;
    if (this.grayPercent >= 100) return true;
    if (this.grayPercent <= 0) return false;
    return (hashPlayerId(playerId) % 100) < this.grayPercent;
  }

  /**
   * 同步编码 envelope 为 binary。
   * 当 worker 不可用或作为 fallback 时使用。
   */
  encodeSync(envelope: unknown): Buffer | null {
    if (!envelope) return null;
    try {
      return Buffer.from(JSON.stringify(envelope), 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 异步编码 envelope 为 binary（通过 worker pool）。
   * 超时或失败时自动 fallback 到同步路径。
   */
  async encodeAsync(envelope: unknown): Promise<Buffer | null> {
    if (!envelope) return null;
    if (!this.encodingPool?.isEnabled()) {
      return this.encodeSync(envelope);
    }

    const result = await this.encodingPool.submit<unknown, Buffer>(
      'envelope-encode',
      envelope,
      (payload) => Buffer.from(JSON.stringify(payload), 'utf-8'),
      200, // 200ms deadline
    );

    if (result.ok && result.result) {
      return result.result;
    }
    // fallback
    return this.encodeSync(envelope);
  }
}

/** 简单的 playerId hash，用于灰度分流 */
function hashPlayerId(playerId: string): number {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = ((hash << 5) - hash + playerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
