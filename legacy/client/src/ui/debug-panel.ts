/** 调试面板：提供重置出生点等开发调试操作 */
export class DebugPanel {
  private panel = document.getElementById('debug-panel')!;
  private resetBtn = document.getElementById('debug-reset-spawn') as HTMLButtonElement;
  private onReset: (() => void) | null = null;

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    this.resetBtn.addEventListener('click', () => {
      this.onReset?.();
    });
  }

  setCallbacks(onReset: () => void): void {
    this.onReset = onReset;
  }

/** show：执行对应的业务逻辑。 */
  show(): void {
    this.panel.classList.remove('hidden');
  }

/** hide：执行对应的业务逻辑。 */
  hide(): void {
    this.panel.classList.add('hidden');
  }
}

