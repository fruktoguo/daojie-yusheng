import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MailDetailView, MailFilter, MailPageView, MailSummaryView } from '@mud/shared';
import { isReactPanelEnabled } from '../../bridge/panel-flags';
import {
  MailPanel,
  mailPanelStore,
  setMailPanelCallbacks,
} from './MailPanel';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function shouldUseReactMailPanel(): boolean {
  return isReactPanelEnabled('mail');
}

export function syncReactMailPanelState(input: {
  summary: MailSummaryView;
  pageData: MailPageView;
  detail: MailDetailView | null;
  statusMessage: string;
  selectedMailId: string | null;
  selectedMailIds: string[];
  attachmentPage: number;
}): void {
  mailPanelStore.patchState(input);
}

export function setReactMailPanelCallbacks(callbacks: {
  onRequestPage?: (filter: MailFilter, page: number) => void;
  onSelectMail?: (mailId: string) => void;
  onToggleCheck?: (mailId: string) => void;
  onSelectPage?: () => void;
  onClearSelection?: () => void;
  onSetAttachmentPage?: (page: number) => void;
  onMarkRead?: (mailIds: string[]) => void;
  onClaim?: (mailIds: string[]) => void;
  onDelete?: (mailIds: string[]) => void;
}): void {
  setMailPanelCallbacks(callbacks);
}

export function mountReactMailPanel(body: HTMLElement, signal?: AbortSignal): void {
  unmountReactMailPanel();
  host = document.createElement('div');
  host.className = 'react-panel-host';
  host.dataset.reactPanel = 'mail';
  body.replaceChildren(host);
  root = createRoot(host);
  root.render(
    <StrictMode>
      <MailPanel />
    </StrictMode>,
  );
  signal?.addEventListener('abort', unmountReactMailPanel, { once: true });
}

export function unmountReactMailPanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
}
