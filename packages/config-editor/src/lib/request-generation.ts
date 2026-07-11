/**
 * 管理“只接受最新一次”的只读请求代际。
 *
 * 新请求会取消上一请求；组件停用时会让所有旧回包失效。保存类请求不得复用该取消语义，
 * 因为服务端可能已经完成写入，只能在页面层用请求上下文判断是否回写当前草稿。
 */
export type LatestRequest = Readonly<{
  generation: number;
  signal: AbortSignal;
}>;

export class LatestRequestGuard {
  private active = false;
  private generation = 0;
  private controller: AbortController | null = null;

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.invalidate();
  }

  begin(): LatestRequest {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.generation += 1;
    return {
      generation: this.generation,
      signal: controller.signal,
    };
  }

  isCurrent(request: LatestRequest): boolean {
    return this.active
      && request.generation === this.generation
      && !request.signal.aborted;
  }

  invalidate(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
}

/** 保存完成后，只有条目和发包时的草稿都未变化，才允许用服务端规范化结果替换当前草稿。 */
export function shouldReplaceEditorDraftAfterSave(
  requestKey: string,
  requestDraftSnapshot: string,
  currentKey: string | null,
  currentDraftSnapshot: string | null,
): boolean {
  return requestKey === currentKey && requestDraftSnapshot === currentDraftSnapshot;
}
