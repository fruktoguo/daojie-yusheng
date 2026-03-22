/** 页面布局与多组标签页控制器 */
export class SidePanel {
  private panel: HTMLElement;
  private visible = false;
  private onVisibilityChange: ((visible: boolean) => void) | null = null;
  private onLayoutChange: (() => void) | null = null;
  private dragState: {
    target: 'left' | 'right' | 'bottom';
    pointerId: number;
    startX: number;
    startY: number;
    shellRect: DOMRect;
    dragged: boolean;
  } | null = null;
  private layoutState = {
    leftCollapsed: false,
    rightCollapsed: false,
    bottomCollapsed: false,
  };

  constructor() {
    this.panel = document.getElementById('game-shell')!;
    this.bindTabGroups();
    this.bindLayoutToggles();
    this.syncLayoutState();
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
          shellRect: this.panel.getBoundingClientRect(),
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

        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        if (!this.dragState.dragged && Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) {
          return;
        }

        this.dragState.dragged = true;
        if (this.dragState.target === 'left') {
          const next = this.clamp(event.clientX - this.dragState.shellRect.left, 220, Math.min(520, this.dragState.shellRect.width * 0.4));
          this.panel.style.setProperty('--layout-left-size', `${next}px`);
        } else if (this.dragState.target === 'right') {
          const next = this.clamp(this.dragState.shellRect.right - event.clientX, 240, Math.min(680, this.dragState.shellRect.width * 0.5));
          this.panel.style.setProperty('--layout-right-size', `${next}px`);
        } else {
          const next = this.clamp(this.dragState.shellRect.bottom - event.clientY, 140, Math.min(480, this.dragState.shellRect.height * 0.55));
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
