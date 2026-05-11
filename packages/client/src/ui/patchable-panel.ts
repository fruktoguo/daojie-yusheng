import { captureFocus, restoreFocus, captureScroll, restoreScroll } from './dom-patch';

/**
 * PatchablePanel<TState> — 面板增量更新框架
 *
 * 提供统一的 captureState / shouldPatch / applyPatch 生命周期。
 * 新面板继承此类，旧面板逐步迁移。
 */
export abstract class PatchablePanel<TState> {
  protected container: HTMLElement | null = null;
  protected previousState: TState | null = null;

  /** 捕获当前状态快照 */
  abstract captureState(): TState;

  /** 判断是否需要 patch */
  abstract shouldPatch(prev: TState, next: TState): boolean;

  /** 应用增量更新 */
  abstract applyPatch(container: HTMLElement, prev: TState, next: TState): void;

  /** 完整渲染（首次或强制重建） */
  abstract renderFull(container: HTMLElement, state: TState): void;

  /** 统一更新入口 */
  update(): void {
    const next = this.captureState();
    if (!this.container || !this.previousState) {
      if (this.container) {
        this.renderFull(this.container, next);
      }
      this.previousState = next;
      return;
    }
    if (this.shouldPatch(this.previousState, next)) {
      const focusSnapshot = captureFocus(this.container);
      const scrollSnapshots = captureScroll(this.container);
      this.applyPatch(this.container, this.previousState, next);
      restoreScroll(this.container, scrollSnapshots);
      restoreFocus(this.container, focusSnapshot);
    }
    this.previousState = next;
  }

  /** 强制全量重建 */
  forceRender(): void {
    const state = this.captureState();
    if (this.container) {
      this.renderFull(this.container, state);
    }
    this.previousState = state;
  }

  /** 挂载到 DOM */
  mount(container: HTMLElement): void {
    this.container = container;
    this.forceRender();
  }

  /** 卸载 */
  unmount(): void {
    this.container = null;
    this.previousState = null;
  }
}
