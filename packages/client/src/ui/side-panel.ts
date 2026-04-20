/** 页面布局与多组标签页控制器 */
import { DESKTOP_LAYOUT_DRAG_LIMITS } from '../constants/ui/responsive';
import { getViewportScale, shouldUseMobileUi } from './responsive-viewport';

/** 移动端挂载位标识。 */
type MobilePaneId =
  | 'mobile-overview'
  | 'mobile-attrs'
  | 'mobile-world'
  | 'mobile-bag'
  | 'mobile-action';

/** 桌面布局拖拽目标边。 */
type LayoutTarget = 'left' | 'right' | 'bottom';

/** 侧边栏布局持久化状态。 */
type SidePanelPersistedState = {
/**
 * version：version相关字段。
 */

  version: 1;  
  /**
 * layoutState：layout状态状态或数据块。
 */

  layoutState?: Partial<Record<`${LayoutTarget}Collapsed`, boolean>>;  
  /**
 * layoutSizes：layout规模相关字段。
 */

  layoutSizes?: Partial<Record<LayoutTarget, number>>;  
  /**
 * activeTabs：激活Tab相关字段。
 */

  activeTabs?: Record<string, string>;
};

/** SIDE_PANEL_STORAGE_KEY：SIDE面板存储KEY。 */
const SIDE_PANEL_STORAGE_KEY = 'mud:side-panel-state:v1';

/** 移动端重新挂载的面板节点记录。 */
type MobileSectionMount = {
/**
 * element：element相关字段。
 */

  element: HTMLElement;  
  /**
 * paneId：paneID标识。
 */

  paneId: MobilePaneId;  
  /**
 * originalParent：originalParent相关字段。
 */

  originalParent: HTMLElement;  
  /**
 * originalNextSibling：originalNextSibling相关字段。
 */

  originalNextSibling: ChildNode | null;
};

/** SidePanel：Side面板实现。 */
export class SidePanel {
  /** DRAG_START_THRESHOLD_PX：DRAG START THRESHOLD PX。 */
  private static readonly DRAG_START_THRESHOLD_PX = 6;
  /** panel：面板。 */
  private panel: HTMLElement;
  /** mobileShell：mobile Shell。 */
  private mobileShell: HTMLElement | null;
  /** mobileSections：mobile Sections。 */
  private mobileSections: MobileSectionMount[];
  /** persistedState：persisted状态。 */
  private persistedState: SidePanelPersistedState | null;
  /** mobileLayoutActive：mobile布局活跃。 */
  private mobileLayoutActive = false;
  /** visible：可见。 */
  private visible = false;
  /** onVisibilityChange：on Visibility变更。 */
  private onVisibilityChange: ((visible: boolean) => void) | null = null;
  /** onLayoutChange：on布局变更。 */
  private onLayoutChange: (() => void) | null = null;
  /** onTabChange：on Tab变更。 */
  private onTabChange: ((tabName: string) => void) | null = null;  
  /**
 * dragState：drag状态状态或数据块。
 */

  private dragState: {  
  /**
 * target：目标相关字段。
 */

    target: 'left' | 'right' | 'bottom';    
    /**
 * pointerId：pointerID标识。
 */

    pointerId: number;    
    /**
 * startX：startX相关字段。
 */

    startX: number;    
    /**
 * startY：startY相关字段。
 */

    startY: number;    
    /**
 * startSize：数量或计量字段。
 */

    startSize: number;    
    /**
 * shellWidth：shellWidth相关字段。
 */

    shellWidth: number;    
    /**
 * shellHeight：shellHeight相关字段。
 */

    shellHeight: number;    
    /**
 * dragged：dragged相关字段。
 */

    dragged: boolean;
  } | null = null;  
  /**
 * layoutState：layout状态状态或数据块。
 */

  private layoutState = {
    leftCollapsed: false,
    rightCollapsed: false,
    bottomCollapsed: false,
  };  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


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

  /** show：处理显示。 */
  show(): void {
    this.panel.classList.remove('hidden');
    this.visible = true;
    this.onVisibilityChange?.(true);
  }

  /** hide：处理hide。 */
  hide(): void {
    this.panel.classList.add('hidden');
    this.visible = false;
    this.onVisibilityChange?.(false);
  }

  /** toggle：处理toggle。 */
  toggle(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.visible) {
      this.hide();
      return;
    }
    this.show();
  }

  /** isVisible：判断是否可见。 */
  isVisible(): boolean {
    return this.visible;
  }  
  /**
 * setVisibilityChangeCallback：写入可见性ChangeCallback。
 * @param callback (visible: boolean) => void 参数说明。
 * @returns 无返回值，直接更新可见性ChangeCallback相关状态。
 */


  setVisibilityChangeCallback(callback: (visible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }  
  /**
 * setLayoutChangeCallback：写入LayoutChangeCallback。
 * @param callback () => void 参数说明。
 * @returns 无返回值，直接更新LayoutChangeCallback相关状态。
 */


  setLayoutChangeCallback(callback: () => void): void {
    this.onLayoutChange = callback;
  }  
  /**
 * setTabChangeCallback：写入TabChangeCallback。
 * @param callback (tabName: string) => void 参数说明。
 * @returns 无返回值，直接更新TabChangeCallback相关状态。
 */


  setTabChangeCallback(callback: (tabName: string) => void): void {
    this.onTabChange = callback;
  }

  /** switchTab：处理switch Tab。 */
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

  /** bindTabGroups：绑定Tab分组。 */
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

  /** bindLayoutToggles：绑定布局Toggles。 */
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

      /** finishPointer：完成Pointer。 */
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

  /** bindResponsiveLayout：绑定Responsive布局。 */
  private bindResponsiveLayout(): void {
    /** refresh：处理refresh。 */
    const refresh = () => {
      this.syncResponsiveLayout();
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
  }

  /** bindLayoutTransitionSync：绑定布局Transition同步。 */
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

  /** collectMobileSections：收集Mobile Sections。 */
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

  /** resolveMobilePaneId：解析Mobile Pane ID。 */
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

  /** shouldUseMobileLayout：判断是否使用Mobile布局。 */
  private shouldUseMobileLayout(): boolean {
    return shouldUseMobileUi(window);
  }

  /** syncResponsiveLayout：同步Responsive布局。 */
  private syncResponsiveLayout(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** mountMobileSections：处理mount Mobile Sections。 */
  private mountMobileSections(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** restoreDesktopSections：处理restore Desktop Sections。 */
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

  /** toggleLayout：处理toggle布局。 */
  private toggleLayout(target: 'left' | 'right' | 'bottom'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** syncLayoutState：同步布局状态。 */
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

  /** syncToggleButton：同步Toggle按钮。 */
  private syncToggleButton(target: 'left' | 'right' | 'bottom', state: {  
  /**
 * text：text名称或显示文本。
 */
 text: string;  
 /**
 * title：title名称或显示文本。
 */
 title: string }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** isCollapsed：判断是否Collapsed。 */
  private isCollapsed(target: 'left' | 'right' | 'bottom'): boolean {
    return target === 'left'
      ? this.layoutState.leftCollapsed
      : target === 'right'
        ? this.layoutState.rightCollapsed
        : this.layoutState.bottomCollapsed;
  }

  /** clamp：处理clamp。 */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** getLayoutSize：读取布局Size。 */
  private getLayoutSize(target: 'left' | 'right' | 'bottom'): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** switchGroupTab：处理switch分组Tab。 */
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

  /** getGroupTabs：读取分组标签页。 */
  private getGroupTabs(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-tab]')]
      .filter((button) => button.closest<HTMLElement>('[data-tab-group]') === group);
  }

  /** getGroupPanes：读取分组Panes。 */
  private getGroupPanes(group: HTMLElement): HTMLElement[] {
    return [...group.querySelectorAll<HTMLElement>('[data-pane]')]
      .filter((pane) => pane.closest<HTMLElement>('[data-tab-group]') === group);
  }

  /** restorePersistedLayoutState：处理restore Persisted布局状态。 */
  private restorePersistedLayoutState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const persistedLayoutState = this.persistedState?.layoutState;
    if (!persistedLayoutState) {
      return;
    }
    this.layoutState.leftCollapsed = persistedLayoutState.leftCollapsed === true;
    this.layoutState.rightCollapsed = persistedLayoutState.rightCollapsed === true;
    this.layoutState.bottomCollapsed = persistedLayoutState.bottomCollapsed === true;
  }

  /** restorePersistedLayoutSizes：处理restore Persisted布局Sizes。 */
  private restorePersistedLayoutSizes(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const layoutSizes = this.persistedState?.layoutSizes;
    if (!layoutSizes) {
      return;
    }
    const leftSize = this.normalizeStoredLayoutSize('left', layoutSizes.left);
    const rightSize = this.normalizeStoredLayoutSize('right', layoutSizes.right);
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

  /** restorePersistedTabs：处理restore Persisted标签页。 */
  private restorePersistedTabs(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const activeTabs = this.persistedState?.activeTabs;
    if (!activeTabs) {
      return;
    }
    this.panel.querySelectorAll<HTMLElement>('[data-tab-group]').forEach((group) => {
      const groupId = group.dataset.tabGroup;
      if (!groupId) {
        return;
      }
      const tabName = activeTabs[groupId];
      if (!tabName) {
        return;
      }
      const hasTarget = this.getGroupTabs(group).some((button) => button.dataset.tab === tabName)
        && this.getGroupPanes(group).some((pane) => pane.dataset.pane === tabName);
      if (!hasTarget) {
        return;
      }
      this.switchGroupTab(group, tabName);
    });
  }

  /** persistCurrentLayoutState：持久化当前布局状态。 */
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

  /** persistCurrentLayoutSizes：持久化当前布局Sizes。 */
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

  /** persistGroupActiveTab：持久化分组活跃Tab。 */
  private persistGroupActiveTab(group: HTMLElement, tabName: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** normalizeStoredLayoutSize：规范化Stored布局Size。 */
  private normalizeStoredLayoutSize(target: LayoutTarget, value: unknown): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** readPersistedState：处理read Persisted状态。 */
  private readPersistedState(): SidePanelPersistedState | null {
    try {
      const raw = window.localStorage.getItem(SIDE_PANEL_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
        return null;
      }
      return parsed as SidePanelPersistedState;
    } catch {
      return null;
    }
  }

  /** writePersistedState：处理write Persisted状态。 */
  private writePersistedState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
