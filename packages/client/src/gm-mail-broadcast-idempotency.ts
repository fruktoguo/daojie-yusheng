import type { GmCreateMailReq } from '@mud/shared';

/**
 * 广播邮件失败重试状态。相同草稿在明确成功前复用 batchId；草稿变化立即换代，
 * 旧请求迟到成功时不能清掉新草稿的幂等键。
 */
export class GmMailBroadcastIdempotencyState {
  private batchId = '';
  private payloadSignature = '';

  constructor(private readonly createBatchId: () => string = createGmMailBroadcastBatchId) {}

  resolve(payload: GmCreateMailReq): string {
    const signature = JSON.stringify(payload);
    if (!this.batchId || this.payloadSignature !== signature) {
      this.batchId = this.createBatchId();
      this.payloadSignature = signature;
    }
    return this.batchId;
  }

  matches(completedBatchId: string, payload: GmCreateMailReq): boolean {
    return completedBatchId === this.batchId && JSON.stringify(payload) === this.payloadSignature;
  }

  complete(completedBatchId: string): boolean {
    if (completedBatchId !== this.batchId) {
      return false;
    }
    this.batchId = '';
    this.payloadSignature = '';
    return true;
  }
}

function createGmMailBroadcastBatchId(): string {
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `broadcast:${Date.now().toString(36)}:${randomPart}`;
}
