/** 离线收益阻塞确认的纯状态机，不承载服务端权威结算。 */
export class OfflineGainConfirmationState {
  private phase: 'idle' | 'pending' | 'retryable' = 'idle';
  private activeReportIds: string[] = [];
  private settledReportIds = new Set<string>();
  private settledAt = 0;

  /** 已发出确认且正在等待服务端首包。 */
  isPending(): boolean {
    return this.phase === 'pending';
  }

  /** 已经发出过确认，Bootstrap 即使迟到也仍可完成本次交互。 */
  hasActiveAttempt(): boolean {
    return this.phase !== 'idle';
  }

  /** 终止登录或切换账号时清除全部会话级状态。 */
  reset(): void {
    this.phase = 'idle';
    this.activeReportIds = [];
    this.settledReportIds.clear();
    this.settledAt = 0;
  }

  /** 发包成功后进入等待态；等待中的重复点击不会生成第二次请求。 */
  begin(reportIds: readonly string[]): boolean {
    const normalizedReportIds = normalizeReportIds(reportIds);
    if (this.phase === 'pending' || normalizedReportIds.length === 0) {
      return false;
    }
    this.phase = 'pending';
    this.activeReportIds = normalizedReportIds;
    return true;
  }

  /** 等待超时后保留已发出事实，但允许玩家重新确认。 */
  markRetryable(): boolean {
    if (this.phase !== 'pending') {
      return false;
    }
    this.phase = 'retryable';
    return true;
  }

  /** 收到并处理 Bootstrap 后完成确认，并记录需要抑制的迟到预览。 */
  settle(now = Date.now()): string[] {
    if (!this.hasActiveAttempt()) {
      return [];
    }
    const settledReportIds = [...this.activeReportIds];
    this.phase = 'idle';
    this.activeReportIds = [];
    this.settledReportIds = new Set(settledReportIds);
    this.settledAt = Math.max(0, Math.trunc(now));
    return settledReportIds;
  }

  /**
   * Socket 请求可能乱序完成：成功首包后的短时间内忽略所有旧阻塞预览；此后仅忽略同一报告。
   * 新的合法离线确认至少需要累计一分钟，因此 30 秒窗口不会吞掉下一次真实会话。
   */
  shouldSuppressBlockingPreview(reportIds: readonly string[], now = Date.now()): boolean {
    if (this.settledAt <= 0) {
      return false;
    }
    const normalizedReportIds = normalizeReportIds(reportIds);
    const elapsedMs = Math.max(0, Math.trunc(now) - this.settledAt);
    if (elapsedMs <= 30_000) {
      return true;
    }
    if (
      normalizedReportIds.length > 0
      && normalizedReportIds.every((reportId) => this.settledReportIds.has(reportId))
    ) {
      return true;
    }
    this.settledReportIds.clear();
    this.settledAt = 0;
    return false;
  }
}

function normalizeReportIds(reportIds: readonly string[]): string[] {
  return Array.from(new Set(reportIds.map((reportId) => reportId.trim()).filter(Boolean)));
}
