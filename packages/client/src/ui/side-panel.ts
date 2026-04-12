/** 页面布局与多组标签页控制器 */
import { DESKTOP_LAYOUT_DRAG_LIMITS } from '../constants/ui/responsive';
import { getViewportScale, shouldUseMobileUi } from './responsive-viewport';

/** MobilePaneId：定义该类型的结构与数据语义。 */
type MobilePaneId =
  | 'mobile-overview'
  | 'mobile-attrs'
  | 'mobile-world'
  | 'mobile-bag'
  | 'mobile-action';

/** LayoutTarget：定义该类型的结构与数据语义。 */
type LayoutTarget = 'left' | 'right' | 'bottom';

/** SidePanelPersistedState：定义该类型的结构与数据语义。 */
type SidePanelPersistedState = {
/** version：定义该变量以承载业务值。 */
  version: 1;
  layoutState?: Partial<Record<`${LayoutTarget}Collapsed`, boolean>>;
  layoutSizes?: Partial<Record<LayoutTarget, number>>;
  activeTabs?: Record<string, string>;
};

/** SIDE_PANEL_STORAGE_KEY：定义该变量以承载业务值。 */
const SIDE_PANEL_STORAGE_KEY = 'mud:side-panel-state:v1';

/** MobileSectionMount：定义该类型的结构与数据语义。 */
type MobileSectionMount = {
/** element：定义该变量以承载业务值。 */
  element: HTMLElement;
/** paneId：定义该变量以承载业务值。 */
  paneId: MobilePaneId;
/** originalParent：定义该变量以承载业务值。 */
  originalParent: HTMLElement;
/** originalNextSibling：定义该变量以承载业务值。 */
  originalNextSibling: ChildNode | null;
};

/** SidePanel：封装相关状态与行为。 */
export class SidePanel {
  private static readonly DRAG_START_THRESHOLD_PX = 6;
/** panel：定义该变量以承载业务值。 */
  private panel: HTMLElement;
/** mobileShell：定义该变量以承载业务值。 */
  private mobileShell: HTMLElement | null;
/** mobileSections：定义该变量以承载业务值。 */
  private mobileSections: MobileSectionMount[];
/** persistedState：定义该变量以承载业务值。 */
  private persistedState: SidePanelPersistedState | null;
  private mobileLayoutActive = false;
  private visible = false;
  private onVisibilityChange: ((visible: boolean) => void) | null = null;
  private onLayoutChange: (() => void) | null = null;
  private onTabChange: ((tabName: string) => void) | null = null;
  private dragState: {
/** target：定义该变量以承载业务值。 */
    target: 'left' | 'right' | 'bottom';
/** pointerId：定义该变量以承载业务值。 */
    pointerId: number;
/** startX：定义该变量以承载业务值。 */
    startX: number;
/** startY：定义该变量以承载业务值。 */
    startY: number;
/** startSize：定义该变量以承载业务值。 */
    startSize: number;
/** shellWidth：定义该变量以承载业务值。 */
    shellWidth: number;
/** shellHeight：定义该变量以承载业务值。 */
    shellHeight: number;
/** dragged：定义该变量以承载业务值。 */
    dragged: boolean;
  } | null = null;
  private layoutState = {
    leftCollapsed: false,
    rightCollapsed: false,
    bottomCollapsed: false,
  };

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
    this.panel = document.getElementById('game-shell')!;
    this.mobileShell = document.getElementById('mobile-ui-shell');
    this.persistedState = this.readPersistedState();
    this.restorePersistedLayoutState();
    this.mobileSections = this.collectMobileSections();
    this.bindTabGroups();
    this.bindLayoutToggles();
    this.bindLayoutTransitionSync();
    this.bindResponsiveLayout();
    this.restorePersistedLayoutSizes();
    this.syncLayoutState();
    this.restorePersistedTabs();
    this.syncResponsiveLayout();
  }

/** show：执行对应的业务逻辑。 */
  show(): void {
    this.panel.classList.remove('hidden');
    this.visible = true;
    this.onVisibilityChange?.(true);
  }

/** hide：执行对应的业务逻辑。 */
  hide(): void {
    this.panel.classList.add('hidden');
    this.visible = false;
    this.onVisibilityChange?.(false);
  }

/** toggle：执行对应的业务逻辑。 */
  toggle(): void {
    if (this.visible) {
      this.hide();
      return;
    }
    this.show();
  }

/** isVisible：执行对应的业务逻辑。 */
  isVisible(): boolean {
    return this.visible;
  }

  setVisibilityChangeCallback(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  setLayoutChangeCallback(callback: () => void): void {
    this.onLayoutChange = callback;
  }

  setTabChangeCallback(callback: (tabName: string) => void): void {
    this.onTabChange = callback;
  }

/** switchTab：执行对应的业务逻辑。 */
  switchTab(tabName: string): void {
/** groups：定义该变量以承载业务值。 */
    const groups = this.panel.querySelectorAll<HTMLElement>('[data-tab-group]');
    groups.forEach(group => {
/** hasTarget：定义该变量以承载业务值。 */
      const hasTarget = this.getGroupTabs(group)
        .some(button => button.dataset.tab === tabName);
      if (hasTarget) {
        this.switchGroupTab(group, tabName);
      }
    });
  }

/** bindTabGroups：执行对应的业务逻辑。 */
  private bindTabGroups(): void {
/** groups：定义该变量以承载业务值。 */
    const groups = this.panel.querySelectorAll<HTMLElement>('[data-tab-group]');
    groups.forEach(group => {
      this.getGroupTabs(group).forEach(button => {
        button.addEventListener('click', () => {
/** tabName：定义该变量以承载业务值。 */
          const tabName = button.dataset.tab;
          if (!tabName) return;
          this.switchGroupTab(group, tabName);
        });
      });
    });
  }

/** bindLayoutToggles：执行对应的业务逻辑。 */
  private bindLayoutToggles(): void {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-layout-toggle]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
/** target：定义该变量以承载业务值。 */
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

/** viewportScale：定义该变量以承载业务值。 */
        const viewportScale = getViewportScale(window);
/** deltaX：定义该变量以承载业务值。 */
        const deltaX = (event.clientX - this.dragState.startX) / viewportScale;
/** deltaY：定义该变量以承载业务值。 */
        const deltaY = (event.clientY - this.dragState.startY) / viewportScale;
/** primaryDelta：定义该变量以承载业务值。 */
        const primaryDelta = this.dragState.target === 'bottom' ? Math.abs(deltaY) : Math.abs(deltaX);
        if (!this.dragState.dragged && primaryDelta < SidePanel.DRAG_START_THRESHOLD_PX) {
          return;
        }

        this.dragState.dragged = true;
        if (this.dragState.target === 'left') {
/** next：定义该变量以承载业务值。 */
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
/** next：定义该变量以承载业务值。 */
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
/** next：定义该变量以承载业务值。 */
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

/** finishPointer：通过常量导出可复用函数行为。 */
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
          this.persistCurrentLayoutSizes();
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

/** bindResponsiveLayout：执行对应的业务逻辑。 */
  private bindResponsiveLayout(): void {
/** refresh：通过常量导出可复用函数行为。 */
    const refresh = () => {
      this.syncResponsiveLayout();
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
  }

/** bindLayoutTransitionSync：执行对应的业务逻辑。 */
  private bindLayoutTransitionSync(): void {
    this.panel.addEventListener('transitionend', (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
/** isShellColumnTransition：定义该变量以承载业务值。 */
      const isShellColumnTransition = event.target === this.panel && event.propertyName === 'grid-template-columns';
/** isCenterRowTransition：定义该变量以承载业务值。 */
      const isCenterRowTransition = event.target.id === 'layout-center' && event.propertyName === 'grid-template-rows';
      if (!isShellColumnTransition && !isCenterRowTransition) {
        return;
      }
      this.onLayoutChange?.();
    });
  }

/** collectMobileSections：执行对应的业务逻辑。 */
  private collectMobileSections(): MobileSectionMount[] {
    return [...this.panel.querySelectorAll<HTMLElement>('[data-mobile-section]')]
      .map((element) => {
/** paneId：定义该变量以承载业务值。 */
        const paneId = this.resolveMobilePaneId(element.dataset.mobileSection);
/** originalParent：定义该变量以承载业务值。 */
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

/** resolveMobilePaneId：执行对应的业务逻辑。 */
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

/** shouldUseMobileLayout：执行对应的业务逻辑。 */
  private shouldUseMobileLayout(): boolean {
    return shouldUseMobileUi(window);
  }

/** syncResponsiveLayout：执行对应的业务逻辑。 */
  private syncResponsiveLayout(): void {
/** nextMobileLayoutActive：定义该变量以承载业务值。 */
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

/** mountMobileSections：执行对应的业务逻辑。 */
  private mountMobileSections(): void {
    if (!this.mobileShell) {
      return;
    }
    this.mobileSections.forEach((entry) => {
/** pane：定义该变量以承载业务值。 */
      const pane = this.mobileShell?.querySelector<HTMLElement>(`[data-pane="${entry.paneId}"]`);
      if (!pane || entry.element.parentElement === pane) {
        return;
      }
      pane.appendChild(entry.element);
    });
  }

/** restoreDesktopSections：执行对应的业务逻辑。 */
  private restoreDesktopSections(): void {
    this.mobileSections.forEach((entry) => {
      if (entry.element.parentElement === entry.originalParent) {
        return;
      }
/** referenceNode：定义该变量以承载业务值。 */
      const referenceNode = entry.originalNextSibling?.parentNode === entry.originalParent
        ? entry.originalNextSibling
        : null;
      entry.originalParent.insertBefore(entry.element, referenceNode);
    });
  }

/** toggleLayout：执行对应的业务逻辑。 */
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

/** syncLayoutState：执行对应的业务逻辑。 */
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
    this.persistCurrentLayoutState();
  }

/** syncToggleButton：执行对应的业务逻辑。 */
  private syncToggleButton(target: 'left' | 'right' | 'bottom', state: { text: string; title: string }): void {
/** button：定义该变量以承载业务值。 */
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

/** isCollapsed：执行对应的业务逻辑。 */
  private isCollapsed(target: 'left' | 'right' | 'bottom'): boolean {
    return target === 'left'
      ? this.layoutState.leftCollapsed
      : target === 'right'
        ? this.layoutState.rightCollapsed
        : this.layoutState.bottomCollapsed;
  }

/** clamp：执行对应的业务逻辑。 */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

/** getLayoutSize：执行对应的业务逻辑。 */
  private getLayoutSize(target: 'left' | 'right' | 'bottom'): number {
/** selector：定义该变量以承载业务值。 */
    const selector = target === 'left'
      ? '#layout-left'
      : target === 'right'
        ? '#layout-right'
        : '#layout-center-bottom';
/** element：定义该变量以承载业务值。 */
    const element = this.panel.querySelector<HTMLElement>(selector);
    if (!element) {
      return 0;
    }
    return target === 'bottom' ? element.offsetHeight : element.offsetWidth;
  }

/** switchGroupTab：执行对应的业务逻辑。 */
  private switchGroupTab(group: HTMLElement, tabName: string): void {
    this.getGroupTabs(group).forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });
    this.getGroupPanes(group).forEach(pane => {
      pane.classList.toggle('active', pane.dataset.pane === tabName);
    });
    this.persistGroupActiveTab(group, tabName);
    this.onTabChange?.(tabName);
  }

/** getGroupTabs：执行对应的业务逻辑。 */
  private getGroupTabs(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-tab]')]
      .filter((button) => button.closest<HTMLElement>('[data-tab-group]') === group);
  }

/** getGroupPanes：执行对应的业务逻辑。 */
  private getGroupPanes(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-pane]')]
      .filter((pane) => pane.closest<HTMLElement>('[data-tab-group]') === group);
  }

/** restorePersistedLayoutState：执行对应的业务逻辑。 */
  private restorePersistedLayoutState(): void {
/** persistedLayoutState：定义该变量以承载业务值。 */
    const persistedLayoutState = this.persistedState?.layoutState;
    if (!persistedLayoutState) {
      return;
    }
    this.layoutState.leftCollapsed = persistedLayoutState.leftCollapsed === true;
    this.layoutState.rightCollapsed = persistedLayoutState.rightCollapsed === true;
    this.layoutState.bottomCollapsed = persistedLayoutState.bottomCollapsed === true;
  }

/** restorePersistedLayoutSizes：执行对应的业务逻辑。 */
  private restorePersistedLayoutSizes(): void {
/** layoutSizes：定义该变量以承载业务值。 */
    const layoutSizes = this.persistedState?.layoutSizes;
    if (!layoutSizes) {
      return;
    }
/** leftSize：定义该变量以承载业务值。 */
    const leftSize = this.normalizeStoredLayoutSize('left', layoutSizes.left);
/** rightSize：定义该变量以承载业务值。 */
    const rightSize = this.normalizeStoredLayoutSize('right', layoutSizes.right);
/** bottomSize：定义该变量以承载业务值。 */
    const bottomSize = this.normalizeStoredLayoutSize('bottom', layoutSizes.bottom);
    if (leftSize !== null) {
      this.panel.style.setProperty('--layout-left-size', `${leftSize}px`);
    }
    if (rightSize !== null) {
      this.panel.style.setProperty('--layout-right-size', `${rightSize}px`);
    }
    if (bottomSize !== null) {
      this.panel.style.setProperty('--layout-bottom-size', `${bottomSize}px`);
    }
  }

/** restorePersistedTabs：执行对应的业务逻辑。 */
  private restorePersistedTabs(): void {
/** activeTabs：定义该变量以承载业务值。 */
    const activeTabs = this.persistedState?.activeTabs;
    if (!activeTabs) {
      return;
    }
    this.panel.querySelectorAll<HTMLElement>('[data-tab-group]').forEach((group) => {
/** groupId：定义该变量以承载业务值。 */
      const groupId = group.dataset.tabGroup;
      if (!groupId) {
        return;
      }
/** tabName：定义该变量以承载业务值。 */
      const tabName = activeTabs[groupId];
      if (!tabName) {
        return;
      }
/** hasTarget：定义该变量以承载业务值。 */
      const hasTarget = this.getGroupTabs(group).some((button) => button.dataset.tab === tabName)
        && this.getGroupPanes(group).some((pane) => pane.dataset.pane === tabName);
      if (!hasTarget) {
        return;
      }
      this.switchGroupTab(group, tabName);
    });
  }

/** persistCurrentLayoutState：执行对应的业务逻辑。 */
  private persistCurrentLayoutState(): void {
    this.persistedState = {
      version: 1,
      ...this.persistedState,
      layoutState: {
        leftCollapsed: this.layoutState.leftCollapsed,
        rightCollapsed: this.layoutState.rightCollapsed,
        bottomCollapsed: this.layoutState.bottomCollapsed,
      },
    };
    this.writePersistedState();
  }

/** persistCurrentLayoutSizes：执行对应的业务逻辑。 */
  private persistCurrentLayoutSizes(): void {
    this.persistedState = {
      version: 1,
      ...this.persistedState,
      layoutSizes: {
        left: this.getLayoutSize('left'),
        right: this.getLayoutSize('right'),
        bottom: this.getLayoutSize('bottom'),
      },
    };
    this.writePersistedState();
  }

/** persistGroupActiveTab：执行对应的业务逻辑。 */
  private persistGroupActiveTab(group: HTMLElement, tabName: string): void {
/** groupId：定义该变量以承载业务值。 */
    const groupId = group.dataset.tabGroup;
    if (!groupId) {
      return;
    }
    this.persistedState = {
      version: 1,
      ...this.persistedState,
      activeTabs: {
        ...(this.persistedState?.activeTabs ?? {}),
        [groupId]: tabName,
      },
    };
    this.writePersistedState();
  }

/** normalizeStoredLayoutSize：执行对应的业务逻辑。 */
  private normalizeStoredLayoutSize(target: LayoutTarget, value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (target === 'left') {
      return this.clamp(Math.round(value), DESKTOP_LAYOUT_DRAG_LIMITS.leftMin, DESKTOP_LAYOUT_DRAG_LIMITS.leftMax);
    }
    if (target === 'right') {
      return this.clamp(Math.round(value), DESKTOP_LAYOUT_DRAG_LIMITS.rightMin, DESKTOP_LAYOUT_DRAG_LIMITS.rightMax);
    }
    return this.clamp(Math.round(value), DESKTOP_LAYOUT_DRAG_LIMITS.bottomMin, DESKTOP_LAYOUT_DRAG_LIMITS.bottomMax);
  }

/** readPersistedState：执行对应的业务逻辑。 */
  private readPersistedState(): SidePanelPersistedState | null {
    try {
/** raw：定义该变量以承载业务值。 */
      const raw = window.localStorage.getItem(SIDE_PANEL_STORAGE_KEY);
      if (!raw) {
        return null;
      }
/** parsed：定义该变量以承载业务值。 */
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
        return null;
      }
      return parsed as SidePanelPersistedState;
    } catch {
      return null;
    }
  }

/** writePersistedState：执行对应的业务逻辑。 */
  private writePersistedState(): void {
    if (!this.persistedState) {
      return;
    }
    try {
      window.localStorage.setItem(SIDE_PANEL_STORAGE_KEY, JSON.stringify(this.persistedState));
    } catch {
      // 本地存储不可用时保留当前会话内状态。
    }
  }
}

