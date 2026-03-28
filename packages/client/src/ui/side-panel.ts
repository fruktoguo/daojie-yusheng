/** 页面布局与多组标签页控制器 */
import { DESKTOP_LAYOUT_DRAG_LIMITS } from '../constants/ui/responsive';
import { getViewportScale, shouldUseMobileUi } from './responsive-viewport';

type MobilePaneId =
  | 'mobile-overview'
  | 'mobile-attrs'
  | 'mobile-world'
  | 'mobile-bag'
  | 'mobile-action';

type MobileSectionMount = {
  element: HTMLElement;
  paneId: MobilePaneId;
  originalParent: HTMLElement;
  originalNextSibling: ChildNode | null;
};

export class SidePanel {
  private static readonly DRAG_START_THRESHOLD_PX = 6;
  private panel: HTMLElement;
  private mobileShell: HTMLElement | null;
  private mobileSections: MobileSectionMount[];
  private mobileLayoutActive = false;
  private visible = false;
  private onVisibilityChange: ((visible: boolean) => void) | null = null;
  private onLayoutChange: (() => void) | null = null;
  private dragState: {
    target: 'left' | 'right' | 'bottom';
    pointerId: number;
    startX: number;
    startY: number;
    startSize: number;
    shellWidth: number;
    shellHeight: number;
    dragged: boolean;
  } | null = null;
  private layoutState = {
    leftCollapsed: false,
    rightCollapsed: false,
    bottomCollapsed: false,
  };

  constructor() {
    this.panel = document.getElementById('game-shell')!;
    this.mobileShell = document.getElementById('mobile-ui-shell');
    this.mobileSections = this.collectMobileSections();
    this.bindTabGroups();
    this.bindLayoutToggles();
    this.bindLayoutTransitionSync();
    this.bindResponsiveLayout();
    this.syncLayoutState();
    this.syncResponsiveLayout();
  }

  show(): void {
    this.panel.classList.remove('hidden');
    this.visible = true;
    this.onVisibilityChange?.(true);
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.visible = false;
    this.onVisibilityChange?.(false);
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
      return;
    }
    this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setVisibilityChangeCallback(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  setLayoutChangeCallback(callback: () => void): void {
    this.onLayoutChange = callback;
  }

  switchTab(tabName: string): void {
    const groups = this.panel.querySelectorAll<HTMLElement>('[data-tab-group]');
    groups.forEach(group => {
      const hasTarget = this.getGroupTabs(group)
        .some(button => button.dataset.tab === tabName);
      if (hasTarget) {
        this.switchGroupTab(group, tabName);
      }
    });
  }

  private bindTabGroups(): void {
    const groups = this.panel.querySelectorAll<HTMLElement>('[data-tab-group]');
    groups.forEach(group => {
      this.getGroupTabs(group).forEach(button => {
        button.addEventListener('click', () => {
          const tabName = button.dataset.tab;
          if (!tabName) return;
          this.switchGroupTab(group, tabName);
        });
      });
    });
  }

  private bindLayoutToggles(): void {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-layout-toggle]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        const target = button.dataset.layoutToggle;
        if (target !== 'left' && target !== 'right' && target !== 'bottom') {
          return;
        }
        this.dragState = {
          target,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startSize: this.getLayoutSize(target),
          shellWidth: this.panel.clientWidth,
          shellHeight: this.panel.clientHeight,
          dragged: false,
        };
        document.body.classList.add('layout-resizing');
        button.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      button.addEventListener('pointermove', (event) => {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
          return;
        }
        if (this.isCollapsed(this.dragState.target)) {
          return;
        }

        const viewportScale = getViewportScale(window);
        const deltaX = (event.clientX - this.dragState.startX) / viewportScale;
        const deltaY = (event.clientY - this.dragState.startY) / viewportScale;
        const primaryDelta = this.dragState.target === 'bottom' ? Math.abs(deltaY) : Math.abs(deltaX);
        if (!this.dragState.dragged && primaryDelta < SidePanel.DRAG_START_THRESHOLD_PX) {
          return;
        }

        this.dragState.dragged = true;
        if (this.dragState.target === 'left') {
          const next = this.clamp(
            this.dragState.startSize + deltaX,
            DESKTOP_LAYOUT_DRAG_LIMITS.leftMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.leftMax,
              this.dragState.shellWidth * DESKTOP_LAYOUT_DRAG_LIMITS.leftMaxViewportRatio,
            ),
          );
          this.panel.style.setProperty('--layout-left-size', `${next}px`);
        } else if (this.dragState.target === 'right') {
          const next = this.clamp(
            this.dragState.startSize - deltaX,
            DESKTOP_LAYOUT_DRAG_LIMITS.rightMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.rightMax,
              this.dragState.shellWidth * DESKTOP_LAYOUT_DRAG_LIMITS.rightMaxViewportRatio,
            ),
          );
          this.panel.style.setProperty('--layout-right-size', `${next}px`);
        } else {
          const next = this.clamp(
            this.dragState.startSize - deltaY,
            DESKTOP_LAYOUT_DRAG_LIMITS.bottomMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.bottomMax,
              this.dragState.shellHeight * DESKTOP_LAYOUT_DRAG_LIMITS.bottomMaxViewportRatio,
            ),
          );
          this.panel.style.setProperty('--layout-bottom-size', `${next}px`);
        }
        this.onLayoutChange?.();
      });

      const finishPointer = (event: PointerEvent) => {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
          return;
        }
        const { target, dragged } = this.dragState;
        this.dragState = null;
        document.body.classList.remove('layout-resizing');
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        if (dragged) {
          this.onLayoutChange?.();
          return;
        }
        this.toggleLayout(target);
        event.preventDefault();
      };

      button.addEventListener('pointerup', finishPointer);
      button.addEventListener('pointercancel', (event) => {
        if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
          return;
        }
        this.dragState = null;
        document.body.classList.remove('layout-resizing');
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
      });
    });
  }

  private bindResponsiveLayout(): void {
    const refresh = () => {
      this.syncResponsiveLayout();
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
  }

  private bindLayoutTransitionSync(): void {
    this.panel.addEventListener('transitionend', (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      const isShellColumnTransition = event.target === this.panel && event.propertyName === 'grid-template-columns';
      const isCenterRowTransition = event.target.id === 'layout-center' && event.propertyName === 'grid-template-rows';
      if (!isShellColumnTransition && !isCenterRowTransition) {
        return;
      }
      this.onLayoutChange?.();
    });
  }

  private collectMobileSections(): MobileSectionMount[] {
    return [...this.panel.querySelectorAll<HTMLElement>('[data-mobile-section]')]
      .map((element) => {
        const paneId = this.resolveMobilePaneId(element.dataset.mobileSection);
        const originalParent = element.parentElement;
        if (!paneId || !originalParent) {
          return null;
        }
        return {
          element,
          paneId,
          originalParent,
          originalNextSibling: element.nextSibling,
        } satisfies MobileSectionMount;
      })
      .filter((entry): entry is MobileSectionMount => entry !== null);
  }

  private resolveMobilePaneId(section?: string): MobilePaneId | null {
    switch (section) {
      case 'overview':
        return 'mobile-overview';
      case 'attrs':
        return 'mobile-attrs';
      case 'world':
        return 'mobile-world';
      case 'bag':
        return 'mobile-bag';
      case 'action':
        return 'mobile-action';
      default:
        return null;
    }
  }

  private shouldUseMobileLayout(): boolean {
    return shouldUseMobileUi(window);
  }

  private syncResponsiveLayout(): void {
    const nextMobileLayoutActive = this.shouldUseMobileLayout();
    if (nextMobileLayoutActive === this.mobileLayoutActive) {
      return;
    }
    this.mobileLayoutActive = nextMobileLayoutActive;
    this.panel.dataset.mobileLayout = nextMobileLayoutActive ? 'true' : 'false';
    if (nextMobileLayoutActive) {
      this.mountMobileSections();
    } else {
      this.restoreDesktopSections();
    }
    this.onLayoutChange?.();
  }

  private mountMobileSections(): void {
    if (!this.mobileShell) {
      return;
    }
    this.mobileSections.forEach((entry) => {
      const pane = this.mobileShell?.querySelector<HTMLElement>(`[data-pane="${entry.paneId}"]`);
      if (!pane || entry.element.parentElement === pane) {
        return;
      }
      pane.appendChild(entry.element);
    });
  }

  private restoreDesktopSections(): void {
    this.mobileSections.forEach((entry) => {
      if (entry.element.parentElement === entry.originalParent) {
        return;
      }
      const referenceNode = entry.originalNextSibling?.parentNode === entry.originalParent
        ? entry.originalNextSibling
        : null;
      entry.originalParent.insertBefore(entry.element, referenceNode);
    });
  }

  private toggleLayout(target: 'left' | 'right' | 'bottom'): void {
    if (target === 'left') {
      this.layoutState.leftCollapsed = !this.layoutState.leftCollapsed;
    } else if (target === 'right') {
      this.layoutState.rightCollapsed = !this.layoutState.rightCollapsed;
    } else {
      this.layoutState.bottomCollapsed = !this.layoutState.bottomCollapsed;
    }
    this.syncLayoutState();
    this.onLayoutChange?.();
  }

  private syncLayoutState(): void {
    this.panel.dataset.leftCollapsed = this.layoutState.leftCollapsed ? 'true' : 'false';
    this.panel.dataset.rightCollapsed = this.layoutState.rightCollapsed ? 'true' : 'false';
    this.panel.dataset.bottomCollapsed = this.layoutState.bottomCollapsed ? 'true' : 'false';

    this.syncToggleButton('left', this.layoutState.leftCollapsed
      ? { text: '>', title: '展开左侧区域' }
      : { text: '<', title: '收起左侧区域' });
    this.syncToggleButton('right', this.layoutState.rightCollapsed
      ? { text: '<', title: '展开右侧区域' }
      : { text: '>', title: '收起右侧区域' });
    this.syncToggleButton('bottom', this.layoutState.bottomCollapsed
      ? { text: '^', title: '展开下方面板' }
      : { text: 'v', title: '收起下方面板' });
  }

  private syncToggleButton(target: 'left' | 'right' | 'bottom', state: { text: string; title: string }): void {
    const button = this.panel.querySelector<HTMLButtonElement>(`[data-layout-toggle="${target}"]`);
    if (!button) {
      return;
    }
    button.textContent = state.text;
    button.title = state.title;
    button.setAttribute('aria-label', state.title);
    button.setAttribute('aria-expanded', (
      target === 'left'
        ? (!this.layoutState.leftCollapsed)
        : target === 'right'
          ? (!this.layoutState.rightCollapsed)
          : (!this.layoutState.bottomCollapsed)
    ) ? 'true' : 'false');
  }

  private isCollapsed(target: 'left' | 'right' | 'bottom'): boolean {
    return target === 'left'
      ? this.layoutState.leftCollapsed
      : target === 'right'
        ? this.layoutState.rightCollapsed
        : this.layoutState.bottomCollapsed;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getLayoutSize(target: 'left' | 'right' | 'bottom'): number {
    const selector = target === 'left'
      ? '#layout-left'
      : target === 'right'
        ? '#layout-right'
        : '#layout-center-bottom';
    const element = this.panel.querySelector<HTMLElement>(selector);
    if (!element) {
      return 0;
    }
    return target === 'bottom' ? element.offsetHeight : element.offsetWidth;
  }

  private switchGroupTab(group: HTMLElement, tabName: string): void {
    this.getGroupTabs(group).forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });
    this.getGroupPanes(group).forEach(pane => {
      pane.classList.toggle('active', pane.dataset.pane === tabName);
    });
  }

  private getGroupTabs(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-tab]')]
      .filter((button) => button.closest<HTMLElement>('[data-tab-group]') === group);
  }

  private getGroupPanes(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-pane]')]
      .filter((pane) => pane.closest<HTMLElement>('[data-tab-group]') === group);
  }
}
