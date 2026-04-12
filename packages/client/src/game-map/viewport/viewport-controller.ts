import { updateDisplayMetrics } from '../../display';
import type { MapSafeAreaInsets } from '../types';
import { MAX_DPR } from '../../constants/visuals/viewport';

/** ViewportSnapshot：定义该接口的能力与字段约束。 */
export interface ViewportSnapshot {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  viewportScale: number;
  backbufferWidth: number;
  backbufferHeight: number;
  safeArea: MapSafeAreaInsets;
}

/** ViewportController：封装相关状态与行为。 */
export class ViewportController {
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private viewportScale = 1;
  private safeArea: MapSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  setViewportSize(width: number, height: number, dpr: number, viewportScale = 1): void {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.dpr = Math.max(1, Math.min(MAX_DPR, dpr));
    this.viewportScale = Math.max(1, viewportScale);
  }

  setSafeArea(insets: MapSafeAreaInsets): void {
    this.safeArea = insets;
  }

  syncDisplayMetrics(baseRadius: number): void {
    const usableWidth = Math.max(1, this.cssWidth - this.safeArea.left - this.safeArea.right);
    const usableHeight = Math.max(1, this.cssHeight - this.safeArea.top - this.safeArea.bottom);
    const pixelRatio = this.dpr * this.viewportScale;
    updateDisplayMetrics(
      Math.max(1, Math.floor(usableWidth * pixelRatio)),
      Math.max(1, Math.floor(usableHeight * pixelRatio)),
      baseRadius,
    );
  }

  getSnapshot(): ViewportSnapshot {
    return {
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      dpr: this.dpr,
      viewportScale: this.viewportScale,
      backbufferWidth: Math.max(1, Math.floor(this.cssWidth * this.viewportScale * this.dpr)),
      backbufferHeight: Math.max(1, Math.floor(this.cssHeight * this.viewportScale * this.dpr)),
      safeArea: this.safeArea,
    };
  }
}

