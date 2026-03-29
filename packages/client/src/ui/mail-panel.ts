import {
  MAIL_PAGE_SIZE_DEFAULT,
  MailDetailView,
  MailFilter,
  MailPageView,
  MailSummaryView,
  renderMailBodyPlain,
  renderMailTitlePlain,
} from '@mud/shared';
import type { SocketManager } from '../network/socket';
import { getLocalItemTemplate } from '../content/local-templates';
import { detailModalHost } from './detail-modal-host';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

const MAIL_FILTER_OPTIONS: Array<{ id: MailFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'unread', label: '未读' },
  { id: 'claimable', label: '可领取' },
];

const EMPTY_SUMMARY: MailSummaryView = {
  unreadCount: 0,
  claimableCount: 0,
  revision: 0,
};

const EMPTY_PAGE: MailPageView = {
  items: [],
  total: 0,
  page: 1,
  pageSize: MAIL_PAGE_SIZE_DEFAULT,
  totalPages: 1,
  filter: 'all',
};

const MAIL_ATTACHMENT_PAGE_SIZE = 10;

export class MailPanel {
  private static readonly MODAL_OWNER = 'mail-panel';
  private playerId = '';
  private summary: MailSummaryView = { ...EMPTY_SUMMARY };
  private pageData: MailPageView = { ...EMPTY_PAGE };
  private activeFilter: MailFilter = 'all';
  private selectedMailId: string | null = null;
  private selectedMailIds = new Set<string>();
  private detail: MailDetailView | null = null;
  private attachmentPage = 1;
  private statusMessage = '';

  constructor(private readonly socket: SocketManager) {
    document.getElementById('hud-open-mail')?.addEventListener('click', () => this.open());
  }

  setPlayerId(playerId: string): void {
    this.playerId = playerId;
    this.updateHudUnreadState();
  }

  clear(): void {
    this.summary = { ...EMPTY_SUMMARY };
    this.pageData = { ...EMPTY_PAGE };
    this.activeFilter = 'all';
    this.selectedMailId = null;
    this.selectedMailIds.clear();
    this.detail = null;
    this.attachmentPage = 1;
    this.statusMessage = '';
    this.updateHudUnreadState();
    detailModalHost.close(MailPanel.MODAL_OWNER);
  }

  updateSummary(summary: MailSummaryView): void {
    this.summary = summary;
    this.updateHudUnreadState();
    this.render();
  }

  updatePage(page: MailPageView): void {
    this.pageData = page;
    this.activeFilter = page.filter;
    const visibleIds = new Set(page.items.map((item) => item.mailId));
    this.selectedMailIds = new Set([...this.selectedMailIds].filter((mailId) => visibleIds.has(mailId)));
    if (this.selectedMailId && !visibleIds.has(this.selectedMailId)) {
      this.selectedMailId = page.items[0]?.mailId ?? null;
      this.detail = null;
      this.attachmentPage = 1;
    }
    if (!this.selectedMailId && page.items.length > 0) {
      this.selectedMailId = page.items[0].mailId;
      this.attachmentPage = 1;
    }
    if (this.selectedMailId) {
      this.requestDetail(this.selectedMailId);
      this.markReadIfNeeded(this.selectedMailId);
    }
    this.render();
  }

  updateDetail(detail: MailDetailView | null, error?: string): void {
    if (!detail) {
      this.detail = null;
      if (error) {
        this.statusMessage = error;
      }
      this.render();
      return;
    }
    if (this.selectedMailId && detail.mailId !== this.selectedMailId) {
      return;
    }
    if (!this.detail || this.detail.mailId !== detail.mailId) {
      this.attachmentPage = 1;
    }
    this.detail = detail;
    this.render();
  }

  handleOpResult(result: { operation: 'markRead' | 'claim' | 'delete'; ok: boolean; mailIds: string[]; message?: string }): void {
    this.statusMessage = result.message ?? (result.ok ? '操作已提交。' : '操作失败。');
    if (result.ok) {
      if (result.operation === 'delete' && this.selectedMailId && result.mailIds.includes(this.selectedMailId)) {
        this.selectedMailId = null;
        this.detail = null;
      }
      this.socket.sendRequestMailSummary();
      this.requestCurrentPage();
      if (this.selectedMailId && result.operation !== 'delete') {
        this.requestDetail(this.selectedMailId);
      }
    }
    this.render();
  }

  open(): void {
    this.socket.sendRequestMailSummary();
    this.requestCurrentPage();
    detailModalHost.open({
      ownerId: MailPanel.MODAL_OWNER,
      variantClass: 'detail-modal--mail',
      title: '飞书台',
      subtitle: `未读 ${this.summary.unreadCount} · 可领取 ${this.summary.claimableCount}`,
      hint: this.statusMessage || '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (body) => this.bindEvents(body),
    });
  }

  private requestCurrentPage(): void {
    this.socket.sendRequestMailPage(this.pageData.page || 1, this.pageData.pageSize || MAIL_PAGE_SIZE_DEFAULT, this.activeFilter);
  }

  private requestDetail(mailId: string): void {
    this.socket.sendRequestMailDetail(mailId);
  }

  private markReadIfNeeded(mailId: string): void {
    const item = this.pageData.items.find((entry) => entry.mailId === mailId);
    if (!item || item.read) {
      return;
    }
    this.socket.sendMarkMailRead([mailId]);
  }

  private render(): void {
    if (!detailModalHost.isOpenFor(MailPanel.MODAL_OWNER)) {
      return;
    }
    detailModalHost.open({
      ownerId: MailPanel.MODAL_OWNER,
      variantClass: 'detail-modal--mail',
      title: '飞书台',
      subtitle: `未读 ${this.summary.unreadCount} · 可领取 ${this.summary.claimableCount}`,
      hint: this.statusMessage || '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (body) => this.bindEvents(body),
    });
  }

  private buildBodyHtml(): string {
    const total = this.pageData.total;
    const selectedCount = this.selectedMailIds.size;
    const detail = this.detail && this.selectedMailId === this.detail.mailId ? this.detail : null;
    return `
      <div class="mail-shell">
        <div class="mail-summary-grid">
          <div class="mail-summary-card">
            <div class="mail-summary-label">未读</div>
            <div class="mail-summary-value">${this.summary.unreadCount}</div>
            <div class="mail-summary-note">打开邮件详情后会进入已读队列。</div>
          </div>
          <div class="mail-summary-card">
            <div class="mail-summary-label">可领取</div>
            <div class="mail-summary-value">${this.summary.claimableCount}</div>
            <div class="mail-summary-note">附件领取会走服务端受控流程，不进地图广播。</div>
          </div>
          <div class="mail-summary-card">
            <div class="mail-summary-label">当前筛选</div>
            <div class="mail-summary-value">${total}</div>
            <div class="mail-summary-note">第 ${this.pageData.page} / ${this.pageData.totalPages} 页，已勾选 ${selectedCount} 封。</div>
          </div>
        </div>

        <div class="mail-layout">
          <section class="panel-section mail-pane mail-pane--list">
            <div class="mail-pane-head">
              <div class="panel-section-title">邮件列表</div>
              <div class="mail-pane-note">按需拉取，不在登录首包塞整箱正文</div>
            </div>
            <div class="mail-toolbar">
              <div class="mail-filter-row">
                ${MAIL_FILTER_OPTIONS.map((option) => `
                  <button class="mail-filter-btn ${option.id === this.activeFilter ? 'active' : ''}" data-mail-filter="${escapeHtmlAttr(option.id)}" type="button">${escapeHtml(option.label)}</button>
                `).join('')}
              </div>
              <div class="mail-batch-row">
                <button class="small-btn ghost" data-mail-select-page type="button" ${this.pageData.items.length === 0 ? 'disabled' : ''}>全选本页</button>
                <button class="small-btn ghost" data-mail-clear-selection type="button" ${selectedCount === 0 ? 'disabled' : ''}>清空勾选</button>
                <button class="small-btn" data-mail-batch-claim type="button" ${selectedCount === 0 ? 'disabled' : ''}>领取勾选</button>
                <button class="small-btn danger" data-mail-batch-delete type="button" ${selectedCount === 0 ? 'disabled' : ''}>删除勾选</button>
              </div>
            </div>
            <div class="mail-list">
              ${this.pageData.items.length > 0
                ? this.pageData.items.map((item) => this.renderListEntry(item)).join('')
                : '<div class="empty-hint">当前筛选下暂无邮件</div>'}
            </div>
            <div class="suggestion-pagination">
              <button class="small-btn ghost" data-mail-page-action="prev" type="button" ${this.pageData.page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="small-btn ghost" data-mail-page-action="next" type="button" ${this.pageData.page >= this.pageData.totalPages ? 'disabled' : ''}>下一页</button>
            </div>
          </section>

          <section class="panel-section mail-pane mail-pane--detail">
            <div class="mail-pane-head">
              <div class="panel-section-title">邮件详情</div>
              <div class="mail-pane-note">单实例详情弹层</div>
            </div>
            <div class="mail-detail">
              ${detail ? this.renderDetail(detail) : '<div class="empty-hint">请选择一封邮件查看详情</div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  private renderListEntry(item: MailPageView['items'][number]): string {
    const selected = item.mailId === this.selectedMailId;
    const checked = this.selectedMailIds.has(item.mailId);
    const stateChips = [
      item.read ? '已读' : '未读',
      item.hasAttachments ? (item.claimed ? '附件已领' : '可领附件') : '无附件',
    ];
    return `
      <article class="mail-entry ${selected ? 'selected' : ''}" data-mail-select="${escapeHtmlAttr(item.mailId)}" tabindex="0" role="button">
        <label class="mail-entry-check">
          <input data-mail-check="${escapeHtmlAttr(item.mailId)}" type="checkbox" ${checked ? 'checked' : ''} />
        </label>
        <div class="mail-entry-main">
          <div class="mail-entry-head">
            <div class="mail-entry-title-row">
              <div class="mail-entry-title">${escapeHtml(item.title)}</div>
              ${!item.read ? '<span class="suggestion-inline-dot" aria-hidden="true"></span>' : ''}
            </div>
            <div class="mail-entry-time">${new Date(item.createdAt).toLocaleString()}</div>
          </div>
          <div class="mail-entry-meta">
            <span>${escapeHtml(item.senderLabel)}</span>
            ${stateChips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}
            ${item.expireAt ? `<span>至 ${escapeHtml(new Date(item.expireAt).toLocaleString())}</span>` : ''}
          </div>
          <div class="mail-entry-summary">${escapeHtml(item.summary || '这封邮件没有额外说明。')}</div>
        </div>
      </article>
    `;
  }

  private renderDetail(detail: MailDetailView): string {
    const title = renderMailTitlePlain(detail.templateId, detail.args, detail.fallbackTitle);
    const body = renderMailBodyPlain(detail.templateId, detail.args, detail.fallbackBody);
    const totalAttachmentPages = Math.max(1, Math.ceil(detail.attachments.length / MAIL_ATTACHMENT_PAGE_SIZE));
    const attachmentPage = Math.min(totalAttachmentPages, Math.max(1, this.attachmentPage));
    this.attachmentPage = attachmentPage;
    const attachmentStart = (attachmentPage - 1) * MAIL_ATTACHMENT_PAGE_SIZE;
    const visibleAttachments = detail.attachments.slice(attachmentStart, attachmentStart + MAIL_ATTACHMENT_PAGE_SIZE);
    return `
      <div class="mail-detail-head">
        <div>
          <div class="mail-detail-title">${escapeHtml(title)}</div>
          <div class="mail-detail-meta">
            <span>${escapeHtml(detail.senderLabel)}</span>
            <span>${escapeHtml(new Date(detail.createdAt).toLocaleString())}</span>
            ${detail.expireAt ? `<span>到期 ${escapeHtml(new Date(detail.expireAt).toLocaleString())}</span>` : '<span>长期保留</span>'}
          </div>
        </div>
        <div class="mail-detail-actions">
          <button class="small-btn ghost" data-mail-mark-read="${escapeHtmlAttr(detail.mailId)}" type="button" ${detail.read ? 'disabled' : ''}>标已读</button>
          <button class="small-btn" data-mail-claim="${escapeHtmlAttr(detail.mailId)}" type="button" ${!detail.attachments.length || detail.claimed ? 'disabled' : ''}>领取附件</button>
          <button class="small-btn danger" data-mail-delete="${escapeHtmlAttr(detail.mailId)}" type="button" ${!detail.deletable ? 'disabled' : ''}>删除</button>
        </div>
      </div>
      <div class="mail-detail-body">${escapeHtml(body || '这封邮件没有正文内容。').replaceAll('\n', '<br />')}</div>
      <div class="mail-attachment-block">
        <div class="mail-attachment-head">
          <div class="mail-attachment-title">附件</div>
          ${detail.attachments.length > MAIL_ATTACHMENT_PAGE_SIZE ? `
            <div class="mail-attachment-pagination">
              <button class="small-btn ghost" data-mail-attachment-page="prev" type="button" ${attachmentPage <= 1 ? 'disabled' : ''}>上一页</button>
              <span class="mail-attachment-page-meta">第 ${attachmentPage} / ${totalAttachmentPages} 页</span>
              <button class="small-btn ghost" data-mail-attachment-page="next" type="button" ${attachmentPage >= totalAttachmentPages ? 'disabled' : ''}>下一页</button>
            </div>
          ` : ''}
        </div>
        ${detail.attachments.length > 0
          ? `<div class="mail-attachment-list">${visibleAttachments.map((attachment) => `
              <div class="mail-attachment-item">
                <span class="mail-attachment-item-name">${escapeHtml(getLocalItemTemplate(attachment.itemId)?.name ?? attachment.itemId)}</span>
                <strong>x${attachment.count}</strong>
              </div>
            `).join('')}</div>`
          : '<div class="empty-hint">这封邮件没有附件</div>'}
      </div>
    `;
  }

  private bindEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>('[data-mail-filter]').forEach((button) => button.addEventListener('click', () => {
      const filter = button.dataset.mailFilter as MailFilter | undefined;
      if (!filter || filter === this.activeFilter) {
        return;
      }
      this.activeFilter = filter;
      this.pageData.page = 1;
      this.selectedMailId = null;
      this.detail = null;
      this.requestCurrentPage();
    }));

    root.querySelectorAll<HTMLButtonElement>('[data-mail-page-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.mailPageAction;
      if (action === 'prev' && this.pageData.page > 1) {
        this.pageData.page -= 1;
        this.requestCurrentPage();
      } else if (action === 'next' && this.pageData.page < this.pageData.totalPages) {
        this.pageData.page += 1;
        this.requestCurrentPage();
      }
    }));

    root.querySelectorAll<HTMLButtonElement>('[data-mail-attachment-page]').forEach((button) => button.addEventListener('click', () => {
      if (!this.detail) {
        return;
      }
      const totalAttachmentPages = Math.max(1, Math.ceil(this.detail.attachments.length / MAIL_ATTACHMENT_PAGE_SIZE));
      const action = button.dataset.mailAttachmentPage;
      if (action === 'prev' && this.attachmentPage > 1) {
        this.attachmentPage -= 1;
        this.render();
      } else if (action === 'next' && this.attachmentPage < totalAttachmentPages) {
        this.attachmentPage += 1;
        this.render();
      }
    }));

    root.querySelectorAll<HTMLElement>('[data-mail-select]').forEach((node) => {
      node.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === 'checkbox') {
          return;
        }
        const mailId = node.dataset.mailSelect;
        if (!mailId) {
          return;
        }
        this.selectedMailId = mailId;
        this.detail = null;
        this.attachmentPage = 1;
        this.requestDetail(mailId);
        this.markReadIfNeeded(mailId);
      });
    });

    root.querySelectorAll<HTMLInputElement>('[data-mail-check]').forEach((checkbox) => checkbox.addEventListener('change', () => {
      const mailId = checkbox.dataset.mailCheck;
      if (!mailId) {
        return;
      }
      if (checkbox.checked) {
        this.selectedMailIds.add(mailId);
      } else {
        this.selectedMailIds.delete(mailId);
      }
      this.render();
    }));

    root.querySelector('[data-mail-select-page]')?.addEventListener('click', () => {
      this.selectedMailIds = new Set(this.pageData.items.map((item) => item.mailId));
      this.render();
    });

    root.querySelector('[data-mail-clear-selection]')?.addEventListener('click', () => {
      this.selectedMailIds.clear();
      this.render();
    });

    root.querySelector('[data-mail-batch-claim]')?.addEventListener('click', () => {
      const ids = [...this.selectedMailIds];
      if (ids.length === 0) {
        return;
      }
      this.socket.sendClaimMailAttachments(ids);
    });

    root.querySelector('[data-mail-batch-delete]')?.addEventListener('click', () => {
      const ids = [...this.selectedMailIds];
      if (ids.length === 0) {
        return;
      }
      this.socket.sendDeleteMail(ids);
    });

    root.querySelectorAll<HTMLButtonElement>('[data-mail-mark-read]').forEach((button) => button.addEventListener('click', () => {
      const mailId = button.dataset.mailMarkRead;
      if (mailId) {
        this.socket.sendMarkMailRead([mailId]);
      }
    }));

    root.querySelectorAll<HTMLButtonElement>('[data-mail-claim]').forEach((button) => button.addEventListener('click', () => {
      const mailId = button.dataset.mailClaim;
      if (mailId) {
        this.socket.sendClaimMailAttachments([mailId]);
      }
    }));

    root.querySelectorAll<HTMLButtonElement>('[data-mail-delete]').forEach((button) => button.addEventListener('click', () => {
      const mailId = button.dataset.mailDelete;
      if (mailId) {
        this.socket.sendDeleteMail([mailId]);
      }
    }));
  }

  private updateHudUnreadState(): void {
    const button = document.getElementById('hud-open-mail');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const hasUnread = this.summary.unreadCount > 0 || this.summary.claimableCount > 0;
    button.dataset.hasUnread = hasUnread ? 'true' : 'false';
  }
}
