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

const CraftWorkbenchTabs = memo(function CraftWorkbenchTabs({
  tabsKey,
  tabsHtml,
}: {
  tabsKey: string;
  tabsHtml: string;
}) {
  return (
    <nav
      className="craft-workbench-tabs"
      data-craft-workbench-tabs="true"
      data-craft-tabs-key={tabsKey}
      dangerouslySetInnerHTML={{ __html: tabsHtml }}
    />
  );
});

const CraftWorkbenchHeader = memo(function CraftWorkbenchHeader({
  headerKey,
  headerHtml,
}: {
  headerKey: string;
  headerHtml: string;
}) {
  return (
    <div
      className="craft-workbench-header"
      data-craft-workbench-header="true"
      data-craft-header-key={headerKey}
      dangerouslySetInnerHTML={{ __html: headerHtml }}
    />
  );
});

const CraftWorkbenchContent = memo(function CraftWorkbenchContent({
  contentHtml,
}: {
  contentHtml: string;
}) {
  return (
    <div
      className="craft-workbench-content"
      data-craft-workbench-content="true"
      dangerouslySetInnerHTML={{ __html: contentHtml }}
    />
  );
});

export const CraftWorkbenchPanel = memo(function CraftWorkbenchPanel() {
  const state = useCraftWorkbenchStore();

  useLayoutEffect(() => {
    afterContentRender?.();
  }, [state.contentHtml]);

  return (
    <div className="craft-workbench-shell" data-craft-workbench-shell="true" data-react-craft-mode={state.activeMode ?? 'none'}>
      <aside className="craft-workbench-sidebar">
        <CraftWorkbenchTabs tabsKey={state.tabsKey} tabsHtml={state.tabsHtml} />
      </aside>
      <section className="craft-workbench-main" data-craft-workbench-main="true">
        <CraftWorkbenchHeader headerKey={state.headerKey} headerHtml={state.headerHtml} />
        <CraftWorkbenchContent contentHtml={state.contentHtml} />
      </section>
    </div>
  );
});
