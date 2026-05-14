import { StrictMode, memo, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DESKTOP_LAYOUT_DRAG_LIMITS } from '../../constants/ui/responsive';
import { t } from '../../ui/i18n';
import { getViewportScale } from '../../ui/responsive-viewport';

export interface ReactSidePanelTabButton {
  tabName: string;
  label: string;
  className: string;
  active: boolean;
  i18nKey?: string;
}

export interface ReactSidePanelTabGroupState {
  groupId: string;
  activeTabName: string;
  tabs: ReactSidePanelTabButton[];
  panes: ReactSidePanelPane[];
}

export interface ReactSidePanelToggleState {
  label: string;
  title: string;
  expanded: boolean;
  target: ReactSidePanelLayoutTarget;
  getLayoutSize: (target: ReactSidePanelLayoutTarget) => number;
  getShellSize: () => ReactSidePanelShellSize;
  isCollapsed: (target: ReactSidePanelLayoutTarget) => boolean;
  setLayoutSize: (target: ReactSidePanelLayoutTarget, size: number) => void;
  onToggle: (target: ReactSidePanelLayoutTarget) => void;
  onDragCommit: () => void;
  onLayoutChange: () => void;
}

export type ReactSidePanelLayoutTarget = 'left' | 'right' | 'bottom';

export interface ReactSidePanelShellSize {
  width: number;
  height: number;
}

export interface ReactSidePanelLayoutState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
  mobileLayoutActive: boolean;
  buildingModeActive: boolean;
}

export interface ReactSidePanelMobileLayoutState {
  mobileShell: HTMLElement | null;
  active: boolean;
  sections: ReactSidePanelMobileSection[];
}

export interface ReactSidePanelMobileSection {
  element: HTMLElement;
  paneId: string;
  originalParent: HTMLElement;
  originalNextSibling: ChildNode | null;
}

export interface ReactSidePanelPane {
  tabName: string;
  element: HTMLElement;
}

const tabGroupRoots = new WeakMap<HTMLElement, { root: Root; host: HTMLDivElement }>();
const toggleRoots = new WeakMap<HTMLElement, { root: Root; host: HTMLSpanElement }>();
const layoutStateRoots = new WeakMap<HTMLElement, { root: Root; host: HTMLSpanElement }>();
const mobileLayoutRoots = new WeakMap<HTMLElement, { root: Root; host: HTMLSpanElement }>();
const DRAG_START_THRESHOLD_PX = 6;

type LayoutDragState = {
  pointerId: number;
  target: ReactSidePanelLayoutTarget;
  startX: number;
  startY: number;
  startSize: number;
  shellWidth: number;
  shellHeight: number;
  dragged: boolean;
};

export function mountReactSidePanelTabGroup(
  container: HTMLElement,
  state: ReactSidePanelTabGroupState,
  onSelect: (groupId: string, tabName: string) => void,
): void {
  let entry = tabGroupRoots.get(container);
  if (!entry || !entry.host.isConnected) {
    entry?.root.unmount();
    const host = document.createElement('div');
    host.className = 'react-side-panel-tab-host';
    host.style.display = 'contents';
    container.replaceChildren(host);
    entry = { root: createRoot(host), host };
    tabGroupRoots.set(container, entry);
  }
  entry.root.render(
    <StrictMode>
      <SidePanelTabGroup state={state} onSelect={onSelect} />
    </StrictMode>,
  );
}

export function mountReactSidePanelToggle(button: HTMLButtonElement, state: ReactSidePanelToggleState): void {
  let entry = toggleRoots.get(button);
  if (!entry || !entry.host.isConnected) {
    entry?.root.unmount();
    const host = document.createElement('span');
    host.className = 'react-side-panel-toggle-label';
    host.style.display = 'contents';
    button.replaceChildren(host);
    entry = { root: createRoot(host), host };
    toggleRoots.set(button, entry);
  }
  entry.root.render(
    <StrictMode>
      <SidePanelToggle button={button} state={state} />
    </StrictMode>,
  );
}

export function syncReactSidePanelLayoutState(panel: HTMLElement, state: ReactSidePanelLayoutState): void {
  let entry = layoutStateRoots.get(panel);
  if (!entry || !entry.host.isConnected) {
    entry?.root.unmount();
    const host = document.createElement('span');
    host.className = 'react-side-panel-layout-state-host';
    host.hidden = true;
    panel.appendChild(host);
    entry = { root: createRoot(host), host };
    layoutStateRoots.set(panel, entry);
  }
  entry.root.render(
    <StrictMode>
      <SidePanelLayoutStateEffect panel={panel} state={state} />
    </StrictMode>,
  );
}

export function syncReactSidePanelMobileLayout(panel: HTMLElement, state: ReactSidePanelMobileLayoutState): void {
  let entry = mobileLayoutRoots.get(panel);
  if (!entry || !entry.host.isConnected) {
    entry?.root.unmount();
    const host = document.createElement('span');
    host.className = 'react-side-panel-mobile-layout-host';
    host.hidden = true;
    panel.appendChild(host);
    entry = { root: createRoot(host), host };
    mobileLayoutRoots.set(panel, entry);
  }
  entry.root.render(
    <StrictMode>
      <SidePanelMobileLayoutEffect state={state} />
    </StrictMode>,
  );
}

const SidePanelTabGroup = memo(function SidePanelTabGroup({
  state,
  onSelect,
}: {
  state: ReactSidePanelTabGroupState;
  onSelect: (groupId: string, tabName: string) => void;
}) {
  const [activeTabName, setActiveTabName] = useState(state.activeTabName);

  useEffect(() => {
    setActiveTabName(state.activeTabName);
  }, [state.activeTabName]);

  useEffect(() => {
    for (const pane of state.panes) {
      pane.element.classList.toggle('active', pane.tabName === activeTabName);
    }
  }, [activeTabName, state.panes]);

  return (
    <>
      {state.tabs.map((tab) => (
        <button
          key={tab.tabName}
          className={`${tab.className}${tab.tabName === activeTabName ? ' active' : ''}`.trim()}
          data-tab={tab.tabName}
          data-i18n={tab.i18nKey}
          type="button"
          onClick={() => {
            setActiveTabName(tab.tabName);
            onSelect(state.groupId, tab.tabName);
          }}
        >
          {tab.i18nKey ? t(tab.i18nKey, undefined) : tab.label}
        </button>
      ))}
    </>
  );
});

const SidePanelToggle = memo(function SidePanelToggle({
  button,
  state,
}: {
  button: HTMLButtonElement;
  state: ReactSidePanelToggleState;
}) {
  const [dragState, setDragState] = useState<LayoutDragState | null>(null);

  useEffect(() => {
    button.title = state.title;
    button.setAttribute('aria-label', state.title);
    button.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
  }, [button, state.expanded, state.title]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const shellSize = state.getShellSize();
      setDragState({
        pointerId: event.pointerId,
        target: state.target,
        startX: event.clientX,
        startY: event.clientY,
        startSize: state.getLayoutSize(state.target),
        shellWidth: shellSize.width,
        shellHeight: shellSize.height,
        dragged: false,
      });
      document.body.classList.add('layout-resizing');
      button.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        if (state.isCollapsed(current.target)) {
          return current;
        }
        const viewportScale = getViewportScale(window);
        const deltaX = (event.clientX - current.startX) / viewportScale;
        const deltaY = (event.clientY - current.startY) / viewportScale;
        const primaryDelta = current.target === 'bottom' ? Math.abs(deltaY) : Math.abs(deltaX);
        if (!current.dragged && primaryDelta < DRAG_START_THRESHOLD_PX) {
          return current;
        }
        const next = { ...current, dragged: true };
        if (current.target === 'left') {
          const size = clamp(
            current.startSize + deltaX,
            DESKTOP_LAYOUT_DRAG_LIMITS.leftMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.leftMax,
              current.shellWidth * DESKTOP_LAYOUT_DRAG_LIMITS.leftMaxViewportRatio,
            ),
          );
          state.setLayoutSize('left', size);
        } else if (current.target === 'right') {
          const size = clamp(
            current.startSize - deltaX,
            DESKTOP_LAYOUT_DRAG_LIMITS.rightMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.rightMax,
              current.shellWidth * DESKTOP_LAYOUT_DRAG_LIMITS.rightMaxViewportRatio,
            ),
          );
          state.setLayoutSize('right', size);
        } else {
          const size = clamp(
            current.startSize - deltaY,
            DESKTOP_LAYOUT_DRAG_LIMITS.bottomMin,
            Math.min(
              DESKTOP_LAYOUT_DRAG_LIMITS.bottomMax,
              current.shellHeight * DESKTOP_LAYOUT_DRAG_LIMITS.bottomMaxViewportRatio,
            ),
          );
          state.setLayoutSize('bottom', size);
        }
        state.onLayoutChange();
        return next;
      });
    };
    const handlePointerUp = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        document.body.classList.remove('layout-resizing');
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        if (current.dragged) {
          state.onDragCommit();
          state.onLayoutChange();
          return null;
        }
        state.onToggle(current.target);
        event.preventDefault();
        return null;
      });
    };
    const handlePointerCancel = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }
        document.body.classList.remove('layout-resizing');
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
        return null;
      });
    };
    button.addEventListener('pointerdown', handlePointerDown);
    button.addEventListener('pointermove', handlePointerMove);
    button.addEventListener('pointerup', handlePointerUp);
    button.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      button.removeEventListener('pointerdown', handlePointerDown);
      button.removeEventListener('pointermove', handlePointerMove);
      button.removeEventListener('pointerup', handlePointerUp);
      button.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [
    button,
    state.getLayoutSize,
    state.getShellSize,
    state.isCollapsed,
    state.onDragCommit,
    state.onLayoutChange,
    state.onToggle,
    state.setLayoutSize,
    state.target,
  ]);

  return <>{state.label}</>;
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const SidePanelLayoutStateEffect = memo(function SidePanelLayoutStateEffect({
  panel,
  state,
}: {
  panel: HTMLElement;
  state: ReactSidePanelLayoutState;
}) {
  useEffect(() => {
    panel.dataset.leftCollapsed = state.leftCollapsed ? 'true' : 'false';
    panel.dataset.rightCollapsed = state.rightCollapsed ? 'true' : 'false';
    panel.dataset.bottomCollapsed = state.bottomCollapsed ? 'true' : 'false';
    panel.dataset.mobileLayout = state.mobileLayoutActive ? 'true' : 'false';
    panel.dataset.buildingMode = state.buildingModeActive ? 'true' : 'false';
  }, [
    panel,
    state.bottomCollapsed,
    state.buildingModeActive,
    state.leftCollapsed,
    state.mobileLayoutActive,
    state.rightCollapsed,
  ]);

  return null;
});

const SidePanelMobileLayoutEffect = memo(function SidePanelMobileLayoutEffect({
  state,
}: {
  state: ReactSidePanelMobileLayoutState;
}) {
  useEffect(() => {
    if (state.active && state.mobileShell) {
      for (const entry of state.sections) {
        const pane = state.mobileShell.querySelector<HTMLElement>(`[data-pane="${entry.paneId}"]`);
        if (!pane || entry.element.parentElement === pane) {
          continue;
        }
        pane.appendChild(entry.element);
      }
      return;
    }
    for (const entry of state.sections) {
      if (entry.element.parentElement === entry.originalParent) {
        continue;
      }
      const referenceNode = entry.originalNextSibling?.parentNode === entry.originalParent
        ? entry.originalNextSibling
        : null;
      entry.originalParent.insertBefore(entry.element, referenceNode);
    }
  }, [state.active, state.mobileShell, state.sections]);

  return null;
});
