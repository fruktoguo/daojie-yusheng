/** 离线收益主动刷新请求的会话级关联状态。 */
export class OfflineGainRefreshState {
  private sequence = 0;
  private activeRequestId: string | null = null;

  /** 开始一代新刷新；上一代未完成请求会立即失效。 */
  begin(now = Date.now()): string {
    this.sequence = this.sequence >= Number.MAX_SAFE_INTEGER ? 1 : this.sequence + 1;
    const requestId = `offline-gain:${Math.max(0, Math.trunc(now))}:${this.sequence}`;
    this.activeRequestId = requestId;
    return requestId;
  }

  /** 发包被门控拒绝时，只撤销仍属于当前代际的请求。 */
  cancel(requestId: string): void {
    if (requestId === this.activeRequestId) {
      this.activeRequestId = null;
    }
  }

  /**
   * 服务端主动推送没有 requestId，应继续接收；主动刷新只接收当前代际一次。
   */
  acceptResponse(requestId: unknown): boolean {
    if (requestId === undefined) {
      return true;
    }
    if (typeof requestId !== 'string' || requestId !== this.activeRequestId) {
      return false;
    }
    this.activeRequestId = null;
    return true;
  }

  /** 会话结束、停止刷新或确认开始时，使所有在途刷新失效。 */
  reset(): void {
    this.activeRequestId = null;
  }
}
