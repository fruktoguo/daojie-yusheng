import { updateDisplayMetrics } from '../../display';
import type { MapSafeAreaInsets } from '../types';

const MAX_DPR = 2;

export interface ViewportSnapshot {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  backbufferWidth: number;
  backbufferHeight: number;
  safeArea: MapSafeAreaInsets;
}

export class ViewportController {
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private safeArea: MapSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  setViewportSize(width: number, height: number, dpr: number): void {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.dpr = Math.max(1, Math.min(MAX_DPR, dpr));
  }

  setSafeArea(insets: MapSafeAreaInsets): void {
    this.safeArea = insets;
  }

  syncDisplayMetrics(baseRadius: number): void {
    const usableWidth = Math.max(1, this.cssWidth - this.safeArea.left - this.safeArea.right);
    const usableHeight = Math.max(1, this.cssHeight - this.safeArea.top - this.safeArea.bottom);
    updateDisplayMetrics(
      Math.max(1, Math.floor(usableWidth * this.dpr)),
      Math.max(1, Math.floor(usableHeight * this.dpr)),
      baseRadius,
    );
  }

  getSnapshot(): ViewportSnapshot {
    return {
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      dpr: this.dpr,
      backbufferWidth: Math.max(1, Math.floor(this.cssWidth * this.dpr)),
      backbufferHeight: Math.max(1, Math.floor(this.cssHeight * this.dpr)),
      safeArea: this.safeArea,
    };
  }
}
