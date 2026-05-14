import { memo, useLayoutEffect } from 'react';
import { createPanelStore } from '../../stores/create-panel-store';

export interface ReactActionPanelState {
  contentKey: string;
  html: string;
}

export const { store: actionPanelStore, useStore: useActionPanelStore } = createPanelStore<ReactActionPanelState>({
  contentKey: '',
  html: '<div class="empty-hint">暂无可用行动</div>',
});

let afterContentRender: (() => void) | null = null;

export function setActionPanelAfterContentRender(callback: (() => void) | null): void {
  afterContentRender = callback;
}

export const ActionPanel = memo(function ActionPanel() {
  const state = useActionPanelStore();

  useLayoutEffect(() => {
    afterContentRender?.();
  }, [state.contentKey, state.html]);

  return (
    <div
      className="react-action-panel-body"
      data-react-action-panel-body="true"
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
});
