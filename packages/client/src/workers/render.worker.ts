/**
 * 客户端渲染 Web Worker（OffscreenCanvas）。
 * 接收主线程的渲染指令，在 OffscreenCanvas 上执行 2D 渲染。
 * 主线程通过 transferControlToOffscreen() 移交 canvas 控制权。
 *
 * 降级：OffscreenCanvas 不支持时回退到主线程渲染。
 * 调试：?disableRenderWorker=1 强制回退。
 */

/** 渲染指令类型 */
interface RenderCommand {
  type: 'init' | 'frame' | 'resize' | 'clear';
  canvas?: OffscreenCanvas;
  width?: number;
  height?: number;
  /** 帧数据（tile sprites、实体位置等） */
  frameData?: unknown;
}

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = (event: MessageEvent<RenderCommand>) => {
  const cmd = event.data;
  switch (cmd.type) {
    case 'init':
      handleInit(cmd);
      break;
    case 'frame':
      handleFrame(cmd);
      break;
    case 'resize':
      handleResize(cmd);
      break;
    case 'clear':
      handleClear();
      break;
  }
};

function handleInit(cmd: RenderCommand): void {
  if (cmd.canvas) {
    canvas = cmd.canvas;
    ctx = canvas.getContext('2d');
    self.postMessage({ type: 'ready' });
  }
}

function handleFrame(cmd: RenderCommand): void {
  if (!ctx || !canvas) return;
  // TODO: Phase 6 完整实现——接收 tile/entity 渲染数据并绘制
  // 当前为骨架：清屏 + 通知主线程帧完成
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  self.postMessage({ type: 'frame_done' });
}

function handleResize(cmd: RenderCommand): void {
  if (!canvas) return;
  if (cmd.width) canvas.width = cmd.width;
  if (cmd.height) canvas.height = cmd.height;
}

function handleClear(): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
