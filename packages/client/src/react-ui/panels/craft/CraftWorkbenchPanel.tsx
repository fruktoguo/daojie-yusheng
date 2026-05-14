import { memo, useLayoutEffect } from 'react';
import { createPanelStore } from '../../stores/create-panel-store';

export interface ReactCraftWorkbenchState {
  activeMode: 'alchemy' | 'forging' | 'enhancement' | null;
  tabsKey: string;
  tabsHtml: string;
  headerKey: string;
  headerHtml: string;
  contentKey: string;
  contentHtml: string;
}

export const { store: craftWorkbenchStore, useStore: useCraftWorkbenchStore } = createPanelStore<ReactCraftWorkbenchState>({
  activeMode: null,
  tabsKey: '',
  tabsHtml: '',
  headerKey: '',
  headerHtml: '',
  contentKey: '',
  contentHtml: '',
});

let afterContentRender: (() => void) | null = null;

export function setCraftWorkbenchAfterContentRender(callback: (() => void) | null): void {
  afterContentRender = callback;
}

export const CraftWorkbenchPanel = memo(function CraftWorkbenchPanel() {
  const state = useCraftWorkbenchStore();

  useLayoutEffect(() => {
    afterContentRender?.();
  }, [state.contentKey]);

  return (
    <div className="craft-workbench-shell" data-craft-workbench-shell="true" data-react-craft-mode={state.activeMode ?? 'none'}>
      <aside className="craft-workbench-sidebar">
        <nav
          className="craft-workbench-tabs"
          data-craft-workbench-tabs="true"
          data-craft-tabs-key={state.tabsKey}
          dangerouslySetInnerHTML={{ __html: state.tabsHtml }}
        />
      </aside>
      <section className="craft-workbench-main" data-craft-workbench-main="true">
        <div
          className="craft-workbench-header"
          data-craft-workbench-header="true"
          data-craft-header-key={state.headerKey}
          dangerouslySetInnerHTML={{ __html: state.headerHtml }}
        />
        <div
          className="craft-workbench-content"
          data-craft-workbench-content="true"
          dangerouslySetInnerHTML={{ __html: state.contentHtml }}
        />
      </section>
    </div>
  );
});
