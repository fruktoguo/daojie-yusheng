/** 调试面板：提供重置出生点等开发调试操作 */
export class DebugPanel {
  private panel = document.getElementById('debug-panel')!;
  private resetBtn = document.getElementById('debug-reset-spawn') as HTMLButtonElement;
  private onReset: (() => void) | null = null;

/** constructor：初始化实例并完成构造。 */
  constructor() {
    this.resetBtn.addEventListener('click', () => {
      this.onReset?.();
    });
  }

  setCallbacks(onReset: () => void): void {
    this.onReset = onReset;
  }

/** show：显示当前视图。 */
  show(): void {
    this.panel.classList.remove('hidden');
  }

/** hide：隐藏当前视图。 */
  hide(): void {
    this.panel.classList.add('hidden');
  }
}

