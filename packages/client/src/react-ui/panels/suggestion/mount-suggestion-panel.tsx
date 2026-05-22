/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Suggestion } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  SuggestionPanel,
  setSuggestionPanelCallbacks,
  suggestionPanelStore,
} from './SuggestionPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactSuggestionPanel(): boolean {
  return isReactPanelEnabled('suggestion');
}

export function syncReactSuggestionPanelState(input: {
  suggestions: Suggestion[];
  playerId: string;
}): void {
  suggestionPanelStore.patchState(input);
}

export function setReactSuggestionPanelCallbacks(callbacks: {
  onCreateSuggestion?: (title: string, description: string) => void;
  onReplySuggestion?: (suggestionId: string, content: string) => void;
  onVoteSuggestion?: (suggestionId: string, vote: 'up' | 'down') => void;
  onMarkRepliesRead?: (suggestionId: string) => void;
  onRequestRefresh?: () => void;
}): void {
  setSuggestionPanelCallbacks(callbacks);
}

export function mountReactSuggestionPanel(body: HTMLElement, signal?: AbortSignal): void {
  unmountReactSuggestionPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'suggestion';
  body.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <SuggestionPanel />
    </StrictMode>,
  );
  signal?.addEventListener('abort', unmountReactSuggestionPanel, { once: true });
}

export function unmountReactSuggestionPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}
