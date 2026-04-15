/** 调试面板：提供重置出生点等开发调试操作 */
export class DebugPanel {
  /** panel：面板。 */
  private panel = document.getElementById('debug-panel')!;
  /** resetBtn：reset按钮。 */
  private resetBtn = document.getElementById('debug-reset-spawn') as HTMLButtonElement;
  /** onReset：on Reset。 */
  private onReset: (() => void) | null = null;

  constructor() {
    this.resetBtn.addEventListener('click', () => {
      this.onReset?.();
    });
  }

  setCallbacks(onReset: () => void): void {
    this.onReset = onReset;
  }

  /** show：处理显示。 */
  show(): void {
    this.panel.classList.remove('hidden');
  }

  /** hide：处理hide。 */
  hide(): void {
    this.panel.classList.add('hidden');
  }
}



