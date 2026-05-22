/**
 * 本文件负责 行动 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useLayoutEffect } from 'react';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

export interface ReactActionPanelState {
  contentKey: string;
  html: string;
}

export const { store: actionPanelStore, useStore: useActionPanelStore } = createPanelStore<ReactActionPanelState>({
  contentKey: '',
  html: `<div class="empty-hint">${t('action.empty-hint')}</div>`,
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
