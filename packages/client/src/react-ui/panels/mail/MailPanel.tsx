/**
 * React 版邮件面板
 * 三栏布局：摘要统计、列表（筛选+分页+批量操作）、详情（正文+附件分页）
 */
import { memo, useCallback, useMemo } from 'react';
import type { MailDetailView, MailFilter, MailPageView, MailSummaryView } from '@mud/shared';
import { MAIL_PAGE_SIZE_DEFAULT, renderMailBodyPlain, renderMailTitlePlain } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { getLocalItemTemplate } from '../../../content/local-templates';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface MailPanelState {
  summary: MailSummaryView;
  pageData: MailPageView;
  detail: MailDetailView | null;
  statusMessage: string;
  selectedMailId: string | null;
  selectedMailIds: string[];
  attachmentPage: number;
}

const EMPTY_SUMMARY: MailSummaryView = { unreadCount: 0, claimableCount: 0, revision: 0 };
const EMPTY_PAGE: MailPageView = { items: [], total: 0, page: 1, pageSize: MAIL_PAGE_SIZE_DEFAULT, totalPages: 1, filter: 'all' };

export const { store: mailPanelStore, useStore: useMailPanelStore } = createPanelStore<MailPanelState>({
  summary: EMPTY_SUMMARY,
  pageData: EMPTY_PAGE,
  detail: null,
  statusMessage: '',
  selectedMailId: null,
  selectedMailIds: [],
  attachmentPage: 1,
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface MailPanelCallbacks {
  onRequestPage: ((filter: MailFilter, page: number) => void) | null;
  onSelectMail: ((mailId: string) => void) | null;
  onToggleCheck: ((mailId: string) => void) | null;
  onSelectPage: (() => void) | null;
  onClearSelection: (() => void) | null;
  onSetAttachmentPage: ((page: number) => void) | null;
  onMarkRead: ((mailIds: string[]) => void) | null;
  onClaim: ((mailIds: string[]) => void) | null;
  onDelete: ((mailIds: string[]) => void) | null;
}

const callbacks: MailPanelCallbacks = {
  onRequestPage: null,
  onSelectMail: null,
  onToggleCheck: null,
  onSelectPage: null,
  onClearSelection: null,
  onSetAttachmentPage: null,
  onMarkRead: null,
  onClaim: null,
  onDelete: null,
};

export function setMailPanelCallbacks(cbs: Partial<MailPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAIL_ATTACHMENT_PAGE_SIZE = 10;
const UNKNOWN_MAIL_ATTACHMENT_ITEM_NAME = '未知物品';

function resolveMailAttachmentItemName(itemId: string): string {
  return getLocalItemTemplate(itemId)?.name ?? UNKNOWN_MAIL_ATTACHMENT_ITEM_NAME;
}

const MAIL_FILTER_OPTIONS: Array<{ id: MailFilter; label: string }> = [
  { id: 'all', label: t('mail.filter.all', undefined) },
  { id: 'unread', label: t('mail.filter.unread', undefined) },
  { id: 'claimable', label: t('mail.filter.claimable', undefined) },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export const MailPanel = memo(function MailPanel() {
  const { summary, pageData, detail, statusMessage, selectedMailId, selectedMailIds, attachmentPage } = useMailPanelStore();
  const selectedMailIdSet = useMemo(() => new Set(selectedMailIds), [selectedMailIds]);

  const activeDetail = detail && detail.mailId === selectedMailId ? detail : null;

  const handleSelectMail = useCallback((mailId: string) => {
    callbacks.onSelectMail?.(mailId);
  }, []);

  const handleFilter = useCallback((filter: MailFilter) => {
    callbacks.onRequestPage?.(filter, 1);
  }, []);

  const handlePage = useCallback((direction: 'prev' | 'next') => {
    const { page, filter } = mailPanelStore.getState().pageData;
    const nextPage = direction === 'prev' ? page - 1 : page + 1;
    callbacks.onRequestPage?.(filter, nextPage);
  }, []);

  const handleToggleCheck = useCallback((mailId: string) => {
    callbacks.onToggleCheck?.(mailId);
  }, []);

  const handleSelectPage = useCallback(() => {
    callbacks.onSelectPage?.();
  }, []);

  const handleClearSelection = useCallback(() => {
    callbacks.onClearSelection?.();
  }, []);

  const handleBatchClaim = useCallback(() => {
    if (selectedMailIds.length > 0) callbacks.onClaim?.(selectedMailIds);
  }, [selectedMailIds]);

  const handleBatchDelete = useCallback(() => {
    if (selectedMailIds.length > 0) callbacks.onDelete?.(selectedMailIds);
  }, [selectedMailIds]);

  return (
    <div className="mail-shell">
      <MailSummarySection summary={summary} total={pageData.total} pageData={pageData} selectedCount={selectedMailIds.length} />
      <div className="mail-layout">
        <MailListSection
          pageData={pageData}
          selectedMailId={selectedMailId}
          selectedMailIds={selectedMailIdSet}
          onSelectMail={handleSelectMail}
          onToggleCheck={handleToggleCheck}
          onFilter={handleFilter}
          onPage={handlePage}
          onSelectPage={handleSelectPage}
          onClearSelection={handleClearSelection}
          onBatchClaim={handleBatchClaim}
          onBatchDelete={handleBatchDelete}
        />
        <MailDetailSection
          detail={activeDetail}
          attachmentPage={attachmentPage}
          onAttachmentPage={(page) => callbacks.onSetAttachmentPage?.(page)}
        />
      </div>
      {statusMessage && <div className="account-settings-status ui-status-text">{statusMessage}</div>}
    </div>
  );
});

// ─── Summary Section ─────────────────────────────────────────────────────────

const MailSummarySection = memo(function MailSummarySection({ summary, total, pageData, selectedCount }: {
  summary: MailSummaryView;
  total: number;
  pageData: MailPageView;
  selectedCount: number;
}) {
  const pageMeta = selectedCount > 0
    ? t('mail.summary.page-meta-selected', { page: pageData.page, totalPages: pageData.totalPages, selected: selectedCount })
    : t('mail.summary.page-meta', { page: pageData.page, totalPages: pageData.totalPages });

  return (
    <div className="mail-summary-grid">
      <div className="mail-summary-card">
        <div className="mail-summary-label">{t('mail.summary.unread', undefined)}</div>
        <div className="mail-summary-value">{summary.unreadCount}</div>
        <div className="mail-summary-note">{t('mail.summary.unread-note', undefined)}</div>
      </div>
      <div className="mail-summary-card">
        <div className="mail-summary-label">{t('mail.summary.claimable', undefined)}</div>
        <div className="mail-summary-value">{summary.claimableCount}</div>
        <div className="mail-summary-note">{t('mail.summary.claimable-note', undefined)}</div>
      </div>
      <div className="mail-summary-card">
        <div className="mail-summary-label">{t('mail.summary.current-filter', undefined)}</div>
        <div className="mail-summary-value">{total}</div>
        <div className="mail-summary-note">{pageMeta}</div>
      </div>
    </div>
  );
});

// ─── List Section ────────────────────────────────────────────────────────────

const MailListSection = memo(function MailListSection({
  pageData, selectedMailId, selectedMailIds,
  onSelectMail, onToggleCheck, onFilter, onPage,
  onSelectPage, onClearSelection, onBatchClaim, onBatchDelete,
}: {
  pageData: MailPageView;
  selectedMailId: string | null;
  selectedMailIds: Set<string>;
  onSelectMail: (mailId: string) => void;
  onToggleCheck: (mailId: string) => void;
  onFilter: (filter: MailFilter) => void;
  onPage: (direction: 'prev' | 'next') => void;
  onSelectPage: () => void;
  onClearSelection: () => void;
  onBatchClaim: () => void;
  onBatchDelete: () => void;
}) {
  const selectedCount = selectedMailIds.size;

  return (
    <section className="panel-section mail-pane mail-pane--list">
      <div className="mail-pane-head">
        <div className="panel-section-title">{t('mail.list.title', undefined)}</div>
        <div className="mail-pane-note">{t('mail.list.note', undefined)}</div>
      </div>
      <div className="mail-toolbar">
        <div className="mail-filter-row">
          {MAIL_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={`mail-filter-btn${option.id === pageData.filter ? ' active' : ''}`}
              type="button"
              onClick={() => onFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mail-batch-row">
          <button className="small-btn ghost" type="button" disabled={pageData.items.length === 0} onClick={onSelectPage}>{t('mail.action.select-page', undefined)}</button>
          <button className="small-btn ghost" type="button" disabled={selectedCount === 0} onClick={onClearSelection}>{t('mail.action.clear-selection', undefined)}</button>
          <button className="small-btn" type="button" disabled={selectedCount === 0} onClick={onBatchClaim}>{t('mail.action.claim-selected', undefined)}</button>
          <button className="small-btn danger" type="button" disabled={selectedCount === 0} onClick={onBatchDelete}>{t('mail.action.delete-selected', undefined)}</button>
        </div>
      </div>
      <div className="mail-list">
        {pageData.items.length > 0
          ? pageData.items.map((item) => (
            <MailListEntry
              key={item.mailId}
              item={item}
              selected={item.mailId === selectedMailId}
              checked={selectedMailIds.has(item.mailId)}
              onSelect={onSelectMail}
              onToggleCheck={onToggleCheck}
            />
          ))
          : <div className="empty-hint">{t('mail.empty.list', undefined)}</div>}
      </div>
      <div className="suggestion-pagination">
        <button className="small-btn ghost" type="button" disabled={pageData.page <= 1} onClick={() => onPage('prev')}>{t('mail.action.prev-page', undefined)}</button>
        <button className="small-btn ghost" type="button" disabled={pageData.page >= pageData.totalPages} onClick={() => onPage('next')}>{t('mail.action.next-page', undefined)}</button>
      </div>
    </section>
  );
});

// ─── List Entry ──────────────────────────────────────────────────────────────

const MailListEntry = memo(function MailListEntry({ item, selected, checked, onSelect, onToggleCheck }: {
  item: MailPageView['items'][number];
  selected: boolean;
  checked: boolean;
  onSelect: (mailId: string) => void;
  onToggleCheck: (mailId: string) => void;
}) {
  const stateChips = useMemo(() => [
    item.read ? t('mail.state.read', undefined) : t('mail.state.unread', undefined),
    item.hasAttachments
      ? (item.claimed ? t('mail.state.claimed', undefined) : t('mail.state.claimable', undefined))
      : t('mail.state.no-attachments', undefined),
  ], [item.read, item.hasAttachments, item.claimed]);

  return (
    <article className={`mail-entry${selected ? ' selected' : ''}`} tabIndex={0} role="button" onClick={() => onSelect(item.mailId)}>
      <label className="mail-entry-check" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={() => onToggleCheck(item.mailId)} />
      </label>
      <div className="mail-entry-main">
        <div className="mail-entry-head">
          <div className="mail-entry-title-row">
            <div className="mail-entry-title">{item.title}</div>
            <span className="suggestion-inline-dot" aria-hidden="true" hidden={item.read} />
          </div>
          <div className="mail-entry-time">{new Date(item.createdAt).toLocaleString()}</div>
        </div>
        <div className="mail-entry-meta">
          <span>{item.senderLabel}</span>
          {stateChips.map((chip) => <span key={chip}>{chip}</span>)}
          {item.expireAt && <span>{t('mail.expire.until', { time: new Date(item.expireAt).toLocaleString() })}</span>}
        </div>
        <div className="mail-entry-summary">{item.summary || t('mail.summary.empty', undefined)}</div>
      </div>
    </article>
  );
});

// ─── Detail Section ──────────────────────────────────────────────────────────

const MailDetailSection = memo(function MailDetailSection({ detail, attachmentPage, onAttachmentPage }: {
  detail: MailDetailView | null;
  attachmentPage: number;
  onAttachmentPage: (page: number) => void;
}) {
  if (!detail) {
    return (
      <section className="panel-section mail-pane mail-pane--detail">
        <div className="mail-pane-head">
          <div className="panel-section-title">{t('mail.detail.title', undefined)}</div>
          <div className="mail-pane-note">{t('mail.detail.note', undefined)}</div>
        </div>
        <div className="mail-detail">
          <div className="empty-hint">{t('mail.empty.detail', undefined)}</div>
        </div>
      </section>
    );
  }

  const title = renderMailTitlePlain(detail.templateId, detail.args, detail.fallbackTitle);
  const body = renderMailBodyPlain(detail.templateId, detail.args, detail.fallbackBody);
  const totalAttachmentPages = Math.max(1, Math.ceil(detail.attachments.length / MAIL_ATTACHMENT_PAGE_SIZE));
  const safePage = Math.min(totalAttachmentPages, Math.max(1, attachmentPage));
  const attachmentStart = (safePage - 1) * MAIL_ATTACHMENT_PAGE_SIZE;
  const visibleAttachments = detail.attachments.slice(attachmentStart, attachmentStart + MAIL_ATTACHMENT_PAGE_SIZE);

  return (
    <section className="panel-section mail-pane mail-pane--detail">
      <div className="mail-pane-head">
        <div className="panel-section-title">{t('mail.detail.title', undefined)}</div>
        <div className="mail-pane-note">{t('mail.detail.note', undefined)}</div>
      </div>
      <div className="mail-detail">
        <div className="mail-detail-head">
          <div>
            <div className="mail-detail-title">{title}</div>
            <div className="mail-detail-meta">
              <span>{detail.senderLabel}</span>
              <span>{new Date(detail.createdAt).toLocaleString()}</span>
              <span>{detail.expireAt ? t('mail.expire.at', { time: new Date(detail.expireAt).toLocaleString() }) : t('mail.expire.permanent', undefined)}</span>
            </div>
          </div>
          <div className="mail-detail-actions">
            <button className="small-btn ghost" type="button" disabled={detail.read} onClick={() => callbacks.onMarkRead?.([detail.mailId])}>{t('mail.action.mark-read', undefined)}</button>
            <button className="small-btn" type="button" disabled={!detail.attachments.length || detail.claimed} onClick={() => callbacks.onClaim?.([detail.mailId])}>{t('mail.action.claim', undefined)}</button>
            <button className="small-btn danger" type="button" disabled={!detail.deletable} onClick={() => callbacks.onDelete?.([detail.mailId])}>{t('mail.action.delete', undefined)}</button>
          </div>
        </div>
        <div className="mail-detail-body">
          {(body || t('mail.empty.body', undefined)).split('\n').map((line, i, arr) => (
            <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
          ))}
        </div>
        <div className="mail-attachment-block">
          <div className="mail-attachment-head">
            <div className="mail-attachment-title">{t('mail.attachment.title', undefined)}</div>
            {detail.attachments.length > MAIL_ATTACHMENT_PAGE_SIZE && (
              <div className="mail-attachment-pagination">
                <button className="small-btn ghost" type="button" disabled={safePage <= 1} onClick={() => onAttachmentPage(safePage - 1)}>{t('mail.action.prev-page', undefined)}</button>
                <span className="mail-attachment-page-meta">{t('mail.attachment.page-meta', { page: safePage, totalPages: totalAttachmentPages })}</span>
                <button className="small-btn ghost" type="button" disabled={safePage >= totalAttachmentPages} onClick={() => onAttachmentPage(safePage + 1)}>{t('mail.action.next-page', undefined)}</button>
              </div>
            )}
          </div>
          {detail.attachments.length > 0 ? (
            <div className="mail-attachment-list">
              {visibleAttachments.map((attachment, idx) => (
                <div key={`${attachment.itemId}-${idx}`} className="mail-attachment-item">
                  <span className="mail-attachment-item-name" title={resolveMailAttachmentItemName(attachment.itemId)}>{resolveMailAttachmentItemName(attachment.itemId)}</span>
                  <strong>x{attachment.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-hint">{t('mail.empty.attachments', undefined)}</div>
          )}
        </div>
      </div>
    </section>
  );
});
