/**
 * attr-panel.tooltips.ts
 *
 * 从 attr-panel.ts 拆出的提示域实现：提示样式注入、提示事件绑定、详情请求、
 * 提示内容刷新和提示目标解析。所有函数以 AttrPanel 实例为第一参数
 * （self），由主类方法以一行委托壳调用，不改变任何 DOM id/class、事件
 * 绑定或面板行为。
 */
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import {
  NUMERIC_TOOLTIP_DESCRIPTIONS,
  NUMERIC_TOOLTIP_LABELS,
  PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS,
  PLAYER_SPECIAL_TOOLTIP_LABELS,
  TOOLTIP_STYLE_ID,
  type AttrTab,
} from '../../constants/ui/attr-panel';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../../utils/number';
import { t } from '../i18n';
import type { AttrPanel } from './attr-panel';
import { splitTooltipLines } from './attr-panel';

export function ensureTooltipStyleImpl(self: AttrPanel): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (document.getElementById(TOOLTIP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    style.textContent = `
      .attr-tooltip {
        position: fixed;
        pointer-events: none;
        font-size: var(--font-size-13);
        color: var(--ink-black);
        z-index: 2000;
        transition: opacity 120ms ease, transform 120ms ease;
        opacity: 0;
        transform: translateY(-8px);
        font-family: var(--font-role-body);
        min-width: 0;
      }
      .attr-tooltip.visible {
        opacity: 1;
      }
      .attr-tooltip .floating-tooltip-shell {
        display: block;
        max-width: min(320px, calc(100vw - 24px));
      }
      .attr-tooltip .floating-tooltip-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        line-height: 1.35;
        min-width: 140px;
        max-width: min(320px, calc(100vw - 24px));
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--attr-tooltip-border);
        background: var(--surface-card-strong);
        box-shadow: 0 8px 24px var(--attr-tooltip-shadow);
      }
      .attr-tooltip .floating-tooltip-body strong {
        font-weight: var(--font-weight-semibold);
        display: block;
        margin-bottom: 4px;
      }
      .attr-tooltip .floating-tooltip-line {
        display: block;
      }
      .attr-tooltip .floating-tooltip-detail {
        font-size: var(--font-size-12);
        line-height: 1.4;
        color: var(--ink-grey);
      }
      .attr-tooltip .attr-tooltip-primary {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .attr-tooltip .attr-tooltip-primary {
        color: var(--ink-black);
        font-weight: var(--font-weight-semibold);
      }
      .attr-tooltip .attr-tooltip-primary-value {
        color: var(--attr-tooltip-primary-value);
      }
      .attr-tooltip .attr-tooltip-section {
        display: inline-flex;
        align-items: center;
        margin-top: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: var(--font-size-11);
        font-weight: var(--font-weight-semibold);
      }
      .attr-tooltip .attr-tooltip-section.fixed {
        color: var(--attr-tooltip-fixed-ink);
        background: var(--attr-tooltip-fixed-bg);
      }
      .attr-tooltip .attr-tooltip-section.percent {
        color: var(--attr-tooltip-percent-ink);
        background: var(--attr-tooltip-percent-bg);
      }
      .attr-tooltip .attr-tooltip-child {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        padding-left: 12px;
      }
      .attr-tooltip .attr-tooltip-child.fixed .attr-tooltip-child-label {
        color: var(--attr-tooltip-fixed-child-label);
      }
      .attr-tooltip .attr-tooltip-child.percent .attr-tooltip-child-label {
        color: var(--attr-tooltip-percent-child-label);
      }
      .attr-tooltip .attr-tooltip-child-value {
        color: var(--ink-black);
      }
      .attr-tooltip .attr-tooltip-note {
        display: block;
        margin-top: 4px;
        color: var(--ink-grey);
      }
      .attr-radar-shell {
        display: grid;
        gap: 10px;
        padding: 14px 16px 18px;
        border-radius: 10px;
        border: 1px solid var(--attr-radar-shell-border);
        background: var(--surface-gradient-tooltip);
        box-shadow: var(--attr-radar-shell-shadow);
      }
      .attr-radar-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      .attr-radar-title {
        font-family: var(--font-role-title);
        font-size: var(--font-size-role-title-16);
        color: var(--ink-black);
      }
      .attr-radar-scale {
        font-size: var(--font-size-11);
        color: var(--ink-grey);
      }
      .attr-radar {
        width: 100%;
        max-width: 320px;
        height: 320px;
        margin: 0 auto;
        display: block;
        overflow: visible;
      }
      .attr-radar-body {
        position: relative;
      }
      .attr-radar-floating-stat {
        position: absolute;
        top: 8px;
        right: 10px;
        z-index: 1;
        display: inline-grid;
        grid-template-columns: 24px minmax(0, max-content);
        align-items: center;
        gap: 7px;
        min-width: 64px;
        height: 30px;
        padding: 0;
        color: var(--ink-grey);
        font-size: var(--font-size-12);
        line-height: 1;
        cursor: help;
        transition: color 0.16s ease, text-shadow 0.16s ease, transform 0.16s ease;
      }
      .attr-radar-floating-stat:hover,
      .attr-radar-floating-stat:focus-visible {
        color: var(--stamp-red);
        text-shadow: 0 1px 8px var(--attr-radar-hover-shadow);
        outline: none;
      }
      .attr-radar-floating-icon {
        width: 22px;
        height: 22px;
        justify-self: center;
        align-self: center;
        background-image: url('/assets/attr-icons/attribute-icons-atlas.png');
        background-repeat: no-repeat;
        background-size: 176px 154px;
        background-position:
          calc(var(--attr-icon-col) * -22px)
          calc(var(--attr-icon-row) * -22px);
        filter: drop-shadow(0 2px 4px var(--attr-radar-icon-shadow));
        pointer-events: none;
      }
      .attr-radar-floating-label {
        display: none;
      }
      .attr-radar-floating-value {
        display: flex;
        align-items: center;
        height: 24px;
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-strong);
        color: var(--ink-black);
        line-height: 24px;
        white-space: nowrap;
      }
      .attr-radar-floating-stat[data-radar-summary-card="rootFoundation"] .attr-radar-floating-value {
        transform: translateY(2px);
      }
      .attr-radar-extra-grid {
        margin-top: 12px;
      }
      .attr-radar-ring {
        fill: none;
        stroke: var(--radar-grid-stroke);
        stroke-width: 1;
      }
      .attr-radar-axis {
        stroke: var(--radar-grid-stroke-strong);
        stroke-width: 1.5;
      }
      .attr-radar-area {
        transition: opacity 160ms ease;
        opacity: 0.9;
      }
      .attr-radar-dot {
        stroke: var(--attr-radar-dot-stroke);
      }
      .attr-radar-label {
        display: none;
      }
      .attr-radar-value {
        display: none;
      }
      .attr-radar-icon-node {
        position: absolute;
        z-index: 2;
        display: inline-grid;
        grid-template-columns: 24px minmax(0, max-content);
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 64px;
        height: 32px;
        padding: 0;
        transform: translate(-50%, -50%);
        cursor: help;
        pointer-events: auto;
      }
      .attr-radar-icon-node:hover,
      .attr-radar-icon-node:focus-visible {
        text-shadow: 0 1px 8px var(--attr-radar-hover-shadow);
        outline: none;
      }
      .attr-radar-icon {
        width: 22px;
        height: 22px;
        justify-self: center;
        align-self: center;
        background-image: url('/assets/attr-icons/attribute-icons-atlas.png');
        background-repeat: no-repeat;
        background-size: 176px 154px;
        background-position:
          calc(var(--attr-icon-col) * -22px)
          calc(var(--attr-icon-row) * -22px);
        filter: drop-shadow(0 2px 4px var(--attr-radar-icon-shadow));
        pointer-events: none;
      }
      .attr-radar-icon-value {
        display: flex;
        align-items: center;
        height: 22px;
        font-size: var(--font-size-12);
        font-weight: var(--font-weight-strong);
        line-height: 22px;
        color: var(--ink-black);
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  /** bindTooltipEvents：绑定提示事件。 */
export function bindTooltipEventsImpl(self: AttrPanel): void {
    const tapMode = prefersPinnedTooltipInteraction();
    self.pane.addEventListener('click', (event) => {
      if (!tapMode) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-craft-open]') || target.closest('[data-craft-bind]')) {
        return;
      }
      const tooltipNode = target.closest<HTMLElement>('[data-tooltip-title]');
      if (!tooltipNode) {
        return;
      }
      requestDetailIfNeededImpl(self, );
      if (self.tooltip.isPinnedTo(tooltipNode)) {
        clearTooltipTargetImpl(self, );
        self.tooltip.hide(true);
        return;
      }
      self.tooltipTarget = tooltipNode;
      self.tooltipTargetKey = resolveTooltipTargetKeyImpl(self, tooltipNode);
      const title = tooltipNode.getAttribute('data-tooltip-title') ?? '';
      const detail = tooltipNode.getAttribute('data-tooltip-detail') ?? '';
      self.tooltip.showPinned(tooltipNode, title, splitTooltipLines(detail), event.clientX, event.clientY, { allowHtml: true });
      event.preventDefault();
      event.stopPropagation();
    }, true);

    self.pane.addEventListener('pointermove', (event) => {
      if (tapMode && self.tooltip.isPinned()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        if (self.tooltipTarget) {
          clearTooltipTargetImpl(self, );
          self.tooltip.hide();
        }
        return;
      }

      const tooltipNode = target.closest('[data-tooltip-title]');
      if (!tooltipNode) {
        if (self.tooltipTarget) {
          clearTooltipTargetImpl(self, );
          self.tooltip.hide();
        }
        return;
      }
      requestDetailIfNeededImpl(self, );

      if (self.tooltipTarget !== tooltipNode) {
        self.tooltipTarget = tooltipNode;
        self.tooltipTargetKey = resolveTooltipTargetKeyImpl(self, tooltipNode);
        const title = tooltipNode.getAttribute('data-tooltip-title') ?? '';
        const detail = tooltipNode.getAttribute('data-tooltip-detail') ?? '';
        self.tooltip.show(title, splitTooltipLines(detail), event.clientX, event.clientY, { allowHtml: true });
        return;
      }

      self.tooltip.move(event.clientX, event.clientY);
    });

    self.pane.addEventListener('pointerleave', () => {
      clearTooltipTargetImpl(self, );
      self.tooltip.hide();
    });

    self.pane.addEventListener('pointerdown', () => {
      if (!self.tooltipTarget) {
        return;
      }
      clearTooltipTargetImpl(self, );
      self.tooltip.hide();
    });
  }

  /** requestDetailIfNeeded：按需触发低频详情请求。 */
export function requestDetailIfNeededImpl(self: AttrPanel): void {
    if (!self.latestData) {
      return;
    }
    if (self.detailData && !self.detailStale) {
      return;
    }
    if (self.detailRequested) {
      return;
    }
    self.detailRequested = true;
    self.callbacks?.onRequestDetail?.();
  }

  /** refreshActiveTooltipContent：详情异步回包后刷新当前已打开的 hover 内容。 */
export function refreshActiveTooltipContentImpl(self: AttrPanel): void {
    if (!self.tooltipTarget) {
      return;
    }
    const target = resolveCurrentTooltipTargetImpl(self, );
    if (!target) {
      clearTooltipTargetImpl(self, );
      self.tooltip.hide(true);
      return;
    }
    self.tooltipTarget = target;
    const title = target.getAttribute('data-tooltip-title') ?? '';
    const detail = target.getAttribute('data-tooltip-detail') ?? '';
    self.tooltip.updateContent(title, splitTooltipLines(detail), { allowHtml: true });
  }

export function clearTooltipTargetImpl(self: AttrPanel): void {
    self.tooltipTarget = null;
    self.tooltipTargetKey = null;
    cancelScheduledTooltipRefreshImpl(self, );
  }

export function resolveTooltipTargetKeyImpl(self: AttrPanel, target: Element): string | null {
    const explicitKey = target.getAttribute('data-tooltip-key');
    if (explicitKey) {
      return explicitKey;
    }
    const attributes = [
      'data-numeric-card',
      'data-radar-extra-card',
      'data-radar-summary-card',
      'data-craft-skill',
      'data-radar-icon-node',
      'data-radar-node',
    ];
    for (const attr of attributes) {
      const value = target.getAttribute(attr);
      if (value) {
        return value;
      }
    }
    return null;
  }

export function resolveCurrentTooltipTargetImpl(self: AttrPanel): Element | null {
    if (self.tooltipTarget?.isConnected) {
      return self.tooltipTarget;
    }
    if (!self.tooltipTargetKey) {
      return null;
    }
    const activePane = self.pane.querySelector<HTMLElement>(`[data-attr-pane="${self.activeTab}"]`);
    const scope = activePane ?? self.pane;
    for (const candidate of scope.querySelectorAll<HTMLElement>('[data-tooltip-title]')) {
      if (resolveTooltipTargetKeyImpl(self, candidate) === self.tooltipTargetKey) {
        return candidate;
      }
    }
    return null;
  }

export function scheduleActiveTooltipRefreshImpl(self: AttrPanel): void {
    if (!self.tooltipTarget) {
      return;
    }
    cancelScheduledTooltipRefreshImpl(self, );
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);
    self.tooltipRefreshFrame = schedule(() => {
      self.tooltipRefreshFrame = null;
      refreshActiveTooltipContentImpl(self, );
    });
  }

export function cancelScheduledTooltipRefreshImpl(self: AttrPanel): void {
    if (self.tooltipRefreshFrame === null) {
      return;
    }
    if (typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(self.tooltipRefreshFrame);
    } else {
      window.clearTimeout(self.tooltipRefreshFrame);
    }
    self.tooltipRefreshFrame = null;
}
