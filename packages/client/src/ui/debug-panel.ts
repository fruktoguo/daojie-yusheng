/**
 * 本文件是客户端 DOM UI 的 debug panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/** 调试面板：提供重置出生点等开发调试操作 */
export class DebugPanel {
  /** panel：面板。 */
  private panel = document.getElementById('debug-panel')!;
  /** resetBtn：reset按钮。 */
  private resetBtn = document.getElementById('debug-reset-spawn') as HTMLButtonElement;
  /** onReset：on Reset。 */
  private onReset: (() => void) | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.resetBtn.addEventListener('click', () => {
      this.onReset?.();
    });
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onReset () => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


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



