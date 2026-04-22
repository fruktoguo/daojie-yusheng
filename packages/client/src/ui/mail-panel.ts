import {
  MAIL_PAGE_SIZE_DEFAULT,
  MailDetailView,
  MailFilter,
  MailPageView,
  MailSummaryView,
  renderMailBodyPlain,
  renderMailTitlePlain,
} from '@mud/shared';
import type { SocketSocialEconomySender } from '../network/socket-send-social-economy';
import { getLocalItemTemplate } from '../content/local-templates';
import { detailModalHost } from './detail-modal-host';

/** 转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 复用文本转义逻辑处理 HTML 属性值。 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

/** 创建与 main 当前样式一致的邮件空态节点。 */
function createMailEmptyHint(text: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = 'empty-hint';
  node.textContent = text;
  return node;
}

const MAIL_FILTER_OPTIONS: Array<{
/**
 * id：ID标识。
 */
 id: MailFilter;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
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

/** 邮件附件列表每页显示数量。 */
const MAIL_ATTACHMENT_PAGE_SIZE = 10;
/** 邮件弹窗默认提示。 */
const MAIL_MODAL_HINT_DEFAULT = '点击空白处关闭';
/** 邮件列表空态文案。 */
const MAIL_LIST_EMPTY_TEXT = '当前筛选下暂无邮件';
/** 邮件详情空态文案。 */
const MAIL_DETAIL_EMPTY_TEXT = '请选择一封邮件查看详情';
/** 邮件正文空态文案。 */
const MAIL_BODY_EMPTY_TEXT = '这封邮件没有正文内容。';
/** 邮件附件空态文案。 */
const MAIL_ATTACHMENT_EMPTY_TEXT = '这封邮件没有附件';

/** 邮件面板渲染时需要保留的本地状态。 */
type MailRenderState = {
/**
 * listScrollTop：ScrollTop相关字段。
 */

  listScrollTop: number;  
  /**
 * detailScrollTop：详情ScrollTop相关字段。
 */

  detailScrollTop: number;  
  /**
 * focusSelector：focuSelector相关字段。
 */

  focusSelector: string | null;
};

/** 邮件弹窗标题区所需的附加信息。 */
type MailModalMeta = {
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle: string;  
  /**
 * hint：hint相关字段。
 */

  hint: string;
};

/** 邮件详情区已缓存的 DOM 节点。 */
type MailDetailRefs = {
/**
 * titleNode：titleNode相关字段。
 */

  titleNode: HTMLElement;  
  /**
 * senderNode：senderNode相关字段。
 */

  senderNode: HTMLElement;  
  /**
 * createdAtNode：createdAtNode相关字段。
 */

  createdAtNode: HTMLElement;  
  /**
 * expireNode：expireNode相关字段。
 */

  expireNode: HTMLElement;  
  /**
 * markReadButton：ReadButton相关字段。
 */

  markReadButton: HTMLButtonElement;  
  /**
 * claimButton：claimButton相关字段。
 */

  claimButton: HTMLButtonElement;  
  /**
 * deleteButton：Button相关字段。
 */

  deleteButton: HTMLButtonElement;  
  /**
 * bodyNode：bodyNode相关字段。
 */

  bodyNode: HTMLElement;  
  /**
 * attachmentPagination：attachmentPagination相关字段。
 */

  attachmentPagination: HTMLElement;  
  /**
 * attachmentPageMeta：attachmentPageMeta相关字段。
 */

  attachmentPageMeta: HTMLElement;  
  /**
 * attachmentPrevButton：attachmentPrevButton相关字段。
 */

  attachmentPrevButton: HTMLButtonElement;  
  /**
 * attachmentNextButton：attachmentNextButton相关字段。
 */

  attachmentNextButton: HTMLButtonElement;  
  /**
 * attachmentList：集合字段。
 */

  attachmentList: HTMLElement;  
  /**
 * attachmentEmpty：attachmentEmpty相关字段。
 */

  attachmentEmpty: HTMLElement;
};

/** 邮件面板实现，负责列表、详情与附件分页。 */
export class MailPanel {
  /** 详情弹窗的归属标识。 */
  private static readonly MODAL_OWNER = 'mail-panel';
  /** 当前账号对应的玩家 ID。 */
  private playerId = '';
  /** 邮件摘要统计。 */
  private summary: MailSummaryView = { ...EMPTY_SUMMARY };
  /** 当前邮件分页数据。 */
  private pageData: MailPageView = { ...EMPTY_PAGE };
  /** 当前激活的筛选条件。 */
  private activeFilter: MailFilter = 'all';
  /** 当前选中的邮件 ID。 */
  private selectedMailId: string | null = null;
  /** 列表中已勾选的邮件 ID 集合。 */
  private selectedMailIds = new Set<string>();
  /** 当前邮件详情。 */
  private detail: MailDetailView | null = null;
  /** 附件分页页码。 */
  private attachmentPage = 1;
  /** 面板底部状态提示。 */
  private statusMessage = '';
  /** 是否已绑定事件代理。 */
  private delegatedEventsBound = false;
  /** 邮件详情区缓存的节点引用。 */
  private detailRefs: MailDetailRefs | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param socket Pick<
    SocketSocialEconomySender,
    | 'sendRequestMailSummary'
    | 'sendRequestMailPage'
    | 'sendRequestMailDetail'
    | 'sendMarkMailRead'
    | 'sendClaimMailAttachments'
    | 'sendDeleteMail'
  > 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(private readonly socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestMailSummary'
    | 'sendRequestMailPage'
    | 'sendRequestMailDetail'
    | 'sendMarkMailRead'
    | 'sendClaimMailAttachments'
    | 'sendDeleteMail'
  >) {
    document.getElementById('hud-open-mail')?.addEventListener('click', () => this.open());
  }

  /** 记录当前玩家 ID，并同步角标状态。 */
  setPlayerId(playerId: string): void {
    this.playerId = playerId;
    this.updateHudUnreadState();
  }

  /** 清空面板状态并关闭弹窗。 */
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

  /** 更新邮件摘要并同步角标。 */
  updateSummary(summary: MailSummaryView): void {
    this.summary = summary;
    this.updateHudUnreadState();
    this.render();
  }

  /** 更新邮件列表分页。 */
  updatePage(page: MailPageView): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 更新当前邮件详情。 */
  updateDetail(detail: MailDetailView | null, error?: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 处理标记已读、领取和删除的回包。 */
  handleOpResult(result: {  
  /**
 * operation：operation相关字段。
 */
 operation: 'markRead' | 'claim' | 'delete';  
 /**
 * ok：ok相关字段。
 */
 ok: boolean;  
 /**
 * mailIds：邮件ID相关字段。
 */
 mailIds: string[];  
 /**
 * message：message相关字段。
 */
 message?: string }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 打开邮件详情弹窗。 */
  open(): void {
    this.socket.sendRequestMailSummary();
    this.requestCurrentPage();
    const meta = this.buildModalMeta();
    detailModalHost.open({
      ownerId: MailPanel.MODAL_OWNER,
      variantClass: 'detail-modal--mail',
      title: '飞书台',
      subtitle: meta.subtitle,
      hint: meta.hint,
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (body) => this.bindEvents(body),
    });
  }

  /** 请求当前分页数据。 */
  private requestCurrentPage(): void {
    this.socket.sendRequestMailPage(this.pageData.page || 1, this.pageData.pageSize || MAIL_PAGE_SIZE_DEFAULT, this.activeFilter);
  }

  /** 请求指定邮件的详情。 */
  private requestDetail(mailId: string): void {
    this.socket.sendRequestMailDetail(mailId);
  }

  /** 在邮件未读时主动补一次已读标记。 */
  private markReadIfNeeded(mailId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const item = this.pageData.items.find((entry) => entry.mailId === mailId);
    if (!item || item.read) {
      return;
    }
    this.socket.sendMarkMailRead([mailId]);
  }

  /** 刷新邮件详情弹窗。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detailModalHost.isOpenFor(MailPanel.MODAL_OWNER)) {
      return;
    }
    const body = document.getElementById('detail-modal-body');
    const renderState = body ? this.captureRenderState(body) : null;
    const meta = this.buildModalMeta();
    if (body && this.patchBody(body, meta)) {
      if (renderState) {
        this.restoreRenderState(body, renderState);
      }
      return;
    }
    detailModalHost.open({
      ownerId: MailPanel.MODAL_OWNER,
      variantClass: 'detail-modal--mail',
      title: '飞书台',
      subtitle: meta.subtitle,
      hint: meta.hint,
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (nextBody) => {
        this.bindEvents(nextBody);
        if (renderState) {
          this.restoreRenderState(nextBody, renderState);
        }
      },
    });
  }

  /** 构建邮件详情弹窗的主体 HTML。 */
  private buildBodyHtml(): string {
    const total = this.pageData.total;
    const selectedCount = this.selectedMailIds.size;
    const detail = this.detail && this.selectedMailId === this.detail.mailId ? this.detail : null;
    return `
      <div class="mail-shell">
        <div class="mail-summary-grid">
          <div class="mail-summary-card">
            <div class="mail-summary-label">未读</div>
            <div class="mail-summary-value" data-mail-summary-unread="true">${this.summary.unreadCount}</div>
            <div class="mail-summary-note">打开邮件详情后会进入已读队列。</div>
          </div>
          <div class="mail-summary-card">
            <div class="mail-summary-label">可领取</div>
            <div class="mail-summary-value" data-mail-summary-claimable="true">${this.summary.claimableCount}</div>
            <div class="mail-summary-note">附件领取会走服务端受控流程，不进地图广播。</div>
          </div>
          <div class="mail-summary-card">
            <div class="mail-summary-label">当前筛选</div>
            <div class="mail-summary-value" data-mail-summary-total="true">${total}</div>
            <div class="mail-summary-note" data-mail-summary-page-meta="true">第 ${this.pageData.page} / ${this.pageData.totalPages} 页，已勾选 ${selectedCount} 封。</div>
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
            <div class="mail-list" data-mail-list="true">
              ${this.pageData.items.length > 0
                ? this.pageData.items.map((item) => this.renderListEntry(item)).join('')
                : `<div class="empty-hint">${escapeHtml(MAIL_LIST_EMPTY_TEXT)}</div>`}
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
            <div class="mail-detail" data-mail-detail="true">
              ${detail ? this.renderDetail(detail) : `<div class="empty-hint">${escapeHtml(MAIL_DETAIL_EMPTY_TEXT)}</div>`}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  /** 创建邮件条目的基础节点。 */
  private createMailEntryNode(item: MailPageView['items'][number]): HTMLElement {
    const article = document.createElement('article');
    article.className = 'mail-entry';
    article.tabIndex = 0;
    article.setAttribute('role', 'button');
    article.dataset.mailSelect = item.mailId;

    const label = document.createElement('label');
    label.className = 'mail-entry-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.mailCheck = item.mailId;
    label.append(checkbox);

    const main = document.createElement('div');
    main.className = 'mail-entry-main';

    const head = document.createElement('div');
    head.className = 'mail-entry-head';
    const titleRow = document.createElement('div');
    titleRow.className = 'mail-entry-title-row';
    const title = document.createElement('div');
    title.className = 'mail-entry-title';
    title.dataset.mailEntryTitle = 'true';
    const unreadDot = document.createElement('span');
    unreadDot.className = 'suggestion-inline-dot';
    unreadDot.setAttribute('aria-hidden', 'true');
    unreadDot.dataset.mailEntryUnreadDot = 'true';
    const time = document.createElement('div');
    time.className = 'mail-entry-time';
    time.dataset.mailEntryTime = 'true';
    titleRow.append(title, unreadDot);
    head.append(titleRow, time);

    const meta = document.createElement('div');
    meta.className = 'mail-entry-meta';
    meta.dataset.mailEntryMeta = 'true';

    const summary = document.createElement('div');
    summary.className = 'mail-entry-summary';
    summary.dataset.mailEntrySummary = 'true';

    main.append(head, meta, summary);
    article.append(label, main);
    this.patchMailEntryNode(article, item);
    return article;
  }

  /** 将邮件分页数据写回条目节点。 */
  private patchMailEntryNode(node: HTMLElement, item: MailPageView['items'][number]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const checkbox = node.querySelector<HTMLInputElement>('[data-mail-check]');
    const title = node.querySelector<HTMLElement>('[data-mail-entry-title="true"]');
    const unreadDot = node.querySelector<HTMLElement>('[data-mail-entry-unread-dot="true"]');
    const time = node.querySelector<HTMLElement>('[data-mail-entry-time="true"]');
    const meta = node.querySelector<HTMLElement>('[data-mail-entry-meta="true"]');
    const summary = node.querySelector<HTMLElement>('[data-mail-entry-summary="true"]');
    if (!checkbox || !title || !unreadDot || !time || !meta || !summary) {
      return false;
    }
    const selected = item.mailId === this.selectedMailId;
    const checked = this.selectedMailIds.has(item.mailId);
    const stateChips = [
      item.read ? '已读' : '未读',
      item.hasAttachments ? (item.claimed ? '附件已领' : '可领附件') : '无附件',
    ];
    node.dataset.mailSelect = item.mailId;
    node.classList.toggle('selected', selected);
    checkbox.dataset.mailCheck = item.mailId;
    checkbox.checked = checked;
    title.textContent = item.title;
    unreadDot.hidden = item.read;
    time.textContent = new Date(item.createdAt).toLocaleString();
    meta.replaceChildren(
      ...[
        item.senderLabel,
        ...stateChips,
        ...(item.expireAt ? [`至 ${new Date(item.expireAt).toLocaleString()}`] : []),
      ].map((text) => {
        const span = document.createElement('span');
        span.textContent = text;
        return span;
      }),
    );
    summary.textContent = item.summary || '这封邮件没有额外说明。';
    return true;
  }

  /** 确保详情区结构已就位并缓存节点引用。 */
  private ensureDetailStructure(detailRoot: HTMLElement): MailDetailRefs {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.detailRefs && detailRoot.contains(this.detailRefs.titleNode)) {
      return this.detailRefs;
    }

    const head = document.createElement('div');
    head.className = 'mail-detail-head';
    const headMain = document.createElement('div');
    const titleNode = document.createElement('div');
    titleNode.className = 'mail-detail-title';
    const meta = document.createElement('div');
    meta.className = 'mail-detail-meta';
    const senderNode = document.createElement('span');
    const createdAtNode = document.createElement('span');
    const expireNode = document.createElement('span');
    meta.append(senderNode, createdAtNode, expireNode);
    headMain.append(titleNode, meta);

    const actions = document.createElement('div');
    actions.className = 'mail-detail-actions';
    const markReadButton = document.createElement('button');
    markReadButton.className = 'small-btn ghost';
    markReadButton.type = 'button';
    const claimButton = document.createElement('button');
    claimButton.className = 'small-btn';
    claimButton.type = 'button';
    const deleteButton = document.createElement('button');
    deleteButton.className = 'small-btn danger';
    deleteButton.type = 'button';
    actions.append(markReadButton, claimButton, deleteButton);
    head.append(headMain, actions);

    const bodyNode = document.createElement('div');
    bodyNode.className = 'mail-detail-body';

    const attachmentBlock = document.createElement('div');
    attachmentBlock.className = 'mail-attachment-block';
    const attachmentHead = document.createElement('div');
    attachmentHead.className = 'mail-attachment-head';
    const attachmentTitle = document.createElement('div');
    attachmentTitle.className = 'mail-attachment-title';
    attachmentTitle.textContent = '附件';
    const attachmentPagination = document.createElement('div');
    attachmentPagination.className = 'mail-attachment-pagination';
    const attachmentPrevButton = document.createElement('button');
    attachmentPrevButton.className = 'small-btn ghost';
    attachmentPrevButton.type = 'button';
    attachmentPrevButton.dataset.mailAttachmentPage = 'prev';
    attachmentPrevButton.textContent = '上一页';
    const attachmentPageMeta = document.createElement('span');
    attachmentPageMeta.className = 'mail-attachment-page-meta';
    const attachmentNextButton = document.createElement('button');
    attachmentNextButton.className = 'small-btn ghost';
    attachmentNextButton.type = 'button';
    attachmentNextButton.dataset.mailAttachmentPage = 'next';
    attachmentNextButton.textContent = '下一页';
    attachmentPagination.append(attachmentPrevButton, attachmentPageMeta, attachmentNextButton);
    attachmentHead.append(attachmentTitle, attachmentPagination);

    const attachmentList = document.createElement('div');
    attachmentList.className = 'mail-attachment-list';
    const attachmentEmpty = createMailEmptyHint(MAIL_ATTACHMENT_EMPTY_TEXT);

    attachmentBlock.append(attachmentHead, attachmentList, attachmentEmpty);
    detailRoot.replaceChildren(head, bodyNode, attachmentBlock);

    this.detailRefs = {
      titleNode,
      senderNode,
      createdAtNode,
      expireNode,
      markReadButton,
      claimButton,
      deleteButton,
      bodyNode,
      attachmentPagination,
      attachmentPageMeta,
      attachmentPrevButton,
      attachmentNextButton,
      attachmentList,
      attachmentEmpty,
    };
    return this.detailRefs;
  }

  /** 复用现有详情结构刷新详情内容。 */
  private patchDetailRoot(detailRoot: HTMLElement, detail: MailDetailView | null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!detail) {
      this.detailRefs = null;
      detailRoot.replaceChildren(createMailEmptyHint(MAIL_DETAIL_EMPTY_TEXT));
      return true;
    }

    const refs = this.ensureDetailStructure(detailRoot);
    const title = renderMailTitlePlain(detail.templateId, detail.args, detail.fallbackTitle);
    const body = renderMailBodyPlain(detail.templateId, detail.args, detail.fallbackBody);
    const totalAttachmentPages = Math.max(1, Math.ceil(detail.attachments.length / MAIL_ATTACHMENT_PAGE_SIZE));
    const attachmentPage = Math.min(totalAttachmentPages, Math.max(1, this.attachmentPage));
    this.attachmentPage = attachmentPage;
    const attachmentStart = (attachmentPage - 1) * MAIL_ATTACHMENT_PAGE_SIZE;
    const visibleAttachments = detail.attachments.slice(attachmentStart, attachmentStart + MAIL_ATTACHMENT_PAGE_SIZE);

    refs.titleNode.textContent = title;
    refs.senderNode.textContent = detail.senderLabel;
    refs.createdAtNode.textContent = new Date(detail.createdAt).toLocaleString();
    refs.expireNode.textContent = detail.expireAt ? `到期 ${new Date(detail.expireAt).toLocaleString()}` : '长期保留';
    refs.markReadButton.dataset.mailMarkRead = detail.mailId;
    refs.claimButton.dataset.mailClaim = detail.mailId;
    refs.deleteButton.dataset.mailDelete = detail.mailId;
    refs.markReadButton.textContent = '标已读';
    refs.claimButton.textContent = '领取附件';
    refs.deleteButton.textContent = '删除';
    refs.markReadButton.disabled = detail.read;
    refs.claimButton.disabled = !detail.attachments.length || detail.claimed;
    refs.deleteButton.disabled = !detail.deletable;
    refs.bodyNode.replaceChildren(...(body || MAIL_BODY_EMPTY_TEXT).split('\n').flatMap((line, index, arr) => {
      const nodes: Node[] = [document.createTextNode(line)];
      if (index < arr.length - 1) {
        nodes.push(document.createElement('br'));
      }
      return nodes;
    }));

    refs.attachmentPagination.hidden = detail.attachments.length <= MAIL_ATTACHMENT_PAGE_SIZE;
    refs.attachmentPageMeta.textContent = `第 ${attachmentPage} / ${totalAttachmentPages} 页`;
    refs.attachmentPrevButton.disabled = attachmentPage <= 1;
    refs.attachmentNextButton.disabled = attachmentPage >= totalAttachmentPages;
    refs.attachmentEmpty.hidden = detail.attachments.length > 0;
    refs.attachmentList.hidden = detail.attachments.length === 0;
    refs.attachmentList.replaceChildren(...visibleAttachments.map((attachment) => {
      const item = document.createElement('div');
      item.className = 'mail-attachment-item';
      const name = document.createElement('span');
      name.className = 'mail-attachment-item-name';
      name.textContent = getLocalItemTemplate(attachment.itemId)?.name ?? attachment.itemId;
      const count = document.createElement('strong');
      count.textContent = `x${attachment.count}`;
      item.append(name, count);
      return item;
    }));
    return true;
  }

  /** 复用现有列表结构刷新列表内容。 */
  private patchListRoot(listRoot: HTMLElement): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const existing = new Map<string, HTMLElement>();
    listRoot.querySelectorAll<HTMLElement>('[data-mail-select]').forEach((node) => {
      const mailId = node.dataset.mailSelect;
      if (mailId) {
        existing.set(mailId, node);
      }
    });
    if (this.pageData.items.length === 0) {
      const emptyNode = listRoot.querySelector<HTMLElement>('.empty-hint') ?? createMailEmptyHint(MAIL_LIST_EMPTY_TEXT);
      emptyNode.textContent = MAIL_LIST_EMPTY_TEXT;
      listRoot.replaceChildren(emptyNode);
      return true;
    }
    const orderedNodes = this.pageData.items.map((item) => {
      const node = existing.get(item.mailId) ?? this.createMailEntryNode(item);
      this.patchMailEntryNode(node, item);
      existing.delete(item.mailId);
      return node;
    });
    existing.forEach((node) => node.remove());
    listRoot.replaceChildren(...orderedNodes);
    return true;
  }

  /** 渲染邮件列表条目的静态 HTML。 */
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

  /** 渲染邮件详情的静态 HTML。 */
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
      <div class="mail-detail-body">${escapeHtml(body || MAIL_BODY_EMPTY_TEXT).replaceAll('\n', '<br />')}</div>
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
          : `<div class="empty-hint">${escapeHtml(MAIL_ATTACHMENT_EMPTY_TEXT)}</div>`}
      </div>
    `;
  }

  /** 为弹窗内容绑定一次性事件代理。 */
  private bindEvents(root: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    root.addEventListener('click', (event) => this.handleRootClick(event));
    root.addEventListener('change', (event) => this.handleRootChange(event));
  }

  /** 处理弹窗根节点的点击事件。 */
  private handleRootClick(event: Event): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const filterButton = target.closest<HTMLButtonElement>('[data-mail-filter]');
    if (filterButton) {
      const filter = filterButton.dataset.mailFilter as MailFilter | undefined;
      if (!filter || filter === this.activeFilter) {
        return;
      }
      this.activeFilter = filter;
      this.pageData.page = 1;
      this.selectedMailId = null;
      this.detail = null;
      this.requestCurrentPage();
      return;
    }

    const pageButton = target.closest<HTMLButtonElement>('[data-mail-page-action]');
    if (pageButton) {
      const action = pageButton.dataset.mailPageAction;
      if (action === 'prev' && this.pageData.page > 1) {
        this.pageData.page -= 1;
        this.requestCurrentPage();
      } else if (action === 'next' && this.pageData.page < this.pageData.totalPages) {
        this.pageData.page += 1;
        this.requestCurrentPage();
      }
      return;
    }

    const attachmentPageButton = target.closest<HTMLButtonElement>('[data-mail-attachment-page]');
    if (attachmentPageButton) {
      if (!this.detail) {
        return;
      }
      const totalAttachmentPages = Math.max(1, Math.ceil(this.detail.attachments.length / MAIL_ATTACHMENT_PAGE_SIZE));
      const action = attachmentPageButton.dataset.mailAttachmentPage;
      if (action === 'prev' && this.attachmentPage > 1) {
        this.attachmentPage -= 1;
        this.render();
      } else if (action === 'next' && this.attachmentPage < totalAttachmentPages) {
        this.attachmentPage += 1;
        this.render();
      }
      return;
    }

    if (target.closest('[data-mail-select-page]')) {
      this.selectedMailIds = new Set(this.pageData.items.map((item) => item.mailId));
      this.render();
      return;
    }
    if (target.closest('[data-mail-clear-selection]')) {
      this.selectedMailIds.clear();
      this.render();
      return;
    }
    if (target.closest('[data-mail-batch-claim]')) {
      const ids = [...this.selectedMailIds];
      if (ids.length > 0) {
        this.socket.sendClaimMailAttachments(ids);
      }
      return;
    }
    if (target.closest('[data-mail-batch-delete]')) {
      const ids = [...this.selectedMailIds];
      if (ids.length > 0) {
        this.socket.sendDeleteMail(ids);
      }
      return;
    }

    const markReadButton = target.closest<HTMLButtonElement>('[data-mail-mark-read]');
    if (markReadButton) {
      const mailId = markReadButton.dataset.mailMarkRead;
      if (mailId) {
        this.socket.sendMarkMailRead([mailId]);
      }
      return;
    }
    const claimButton = target.closest<HTMLButtonElement>('[data-mail-claim]');
    if (claimButton) {
      const mailId = claimButton.dataset.mailClaim;
      if (mailId) {
        this.socket.sendClaimMailAttachments([mailId]);
      }
      return;
    }
    const deleteButton = target.closest<HTMLButtonElement>('[data-mail-delete]');
    if (deleteButton) {
      const mailId = deleteButton.dataset.mailDelete;
      if (mailId) {
        this.socket.sendDeleteMail([mailId]);
      }
      return;
    }

    if (target.closest('[data-mail-check]') || target.closest('.mail-entry-check')) {
      return;
    }
    const mailEntry = target.closest<HTMLElement>('[data-mail-select]');
    if (!mailEntry) {
      return;
    }
    const mailId = mailEntry.dataset.mailSelect;
    if (!mailId) {
      return;
    }
    this.selectedMailId = mailId;
    this.detail = null;
    this.attachmentPage = 1;
    this.requestDetail(mailId);
    this.markReadIfNeeded(mailId);
  }

  /** 处理弹窗根节点的勾选变更。 */
  private handleRootChange(event: Event): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const mailId = target.dataset.mailCheck;
    if (!mailId) {
      return;
    }
    if (target.checked) {
      this.selectedMailIds.add(mailId);
    } else {
      this.selectedMailIds.delete(mailId);
    }
    this.render();
  }

  /** 复用邮件壳结构时同步主体内容。 */
  private patchBody(body: HTMLElement, meta: MailModalMeta): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!body.querySelector('.mail-shell')) {
      return false;
    }
    this.patchModalMeta(meta);

    const unreadNode = body.querySelector<HTMLElement>('[data-mail-summary-unread="true"]');
    const claimableNode = body.querySelector<HTMLElement>('[data-mail-summary-claimable="true"]');
    const totalNode = body.querySelector<HTMLElement>('[data-mail-summary-total="true"]');
    const pageMetaNode = body.querySelector<HTMLElement>('[data-mail-summary-page-meta="true"]');
    const listRoot = body.querySelector<HTMLElement>('[data-mail-list="true"]');
    const detailRoot = body.querySelector<HTMLElement>('[data-mail-detail="true"]');
    if (!unreadNode || !claimableNode || !totalNode || !pageMetaNode || !listRoot || !detailRoot) {
      return false;
    }

    const selectedCount = this.selectedMailIds.size;
    unreadNode.textContent = String(this.summary.unreadCount);
    claimableNode.textContent = String(this.summary.claimableCount);
    totalNode.textContent = String(this.pageData.total);
    pageMetaNode.textContent = `第 ${this.pageData.page} / ${this.pageData.totalPages} 页，已勾选 ${selectedCount} 封。`;

    for (const option of MAIL_FILTER_OPTIONS) {
      const button = body.querySelector<HTMLButtonElement>(`[data-mail-filter="${escapeHtmlAttr(option.id)}"]`);
      if (!button) {
        return false;
      }
      button.classList.toggle('active', option.id === this.activeFilter);
    }

    const selectPageButton = body.querySelector<HTMLButtonElement>('[data-mail-select-page]');
    const clearSelectionButton = body.querySelector<HTMLButtonElement>('[data-mail-clear-selection]');
    const batchClaimButton = body.querySelector<HTMLButtonElement>('[data-mail-batch-claim]');
    const batchDeleteButton = body.querySelector<HTMLButtonElement>('[data-mail-batch-delete]');
    const prevPageButton = body.querySelector<HTMLButtonElement>('[data-mail-page-action="prev"]');
    const nextPageButton = body.querySelector<HTMLButtonElement>('[data-mail-page-action="next"]');
    if (!selectPageButton || !clearSelectionButton || !batchClaimButton || !batchDeleteButton || !prevPageButton || !nextPageButton) {
      return false;
    }
    selectPageButton.disabled = this.pageData.items.length === 0;
    clearSelectionButton.disabled = selectedCount === 0;
    batchClaimButton.disabled = selectedCount === 0;
    batchDeleteButton.disabled = selectedCount === 0;
    prevPageButton.disabled = this.pageData.page <= 1;
    nextPageButton.disabled = this.pageData.page >= this.pageData.totalPages;

    if (!this.patchListRoot(listRoot)) {
      return false;
    }

    const detail = this.detail && this.selectedMailId === this.detail.mailId ? this.detail : null;
    return this.patchDetailRoot(detailRoot, detail);
  }

  /** 生成弹窗标题栏文案。 */
  private buildModalMeta(): MailModalMeta {
    return {
      subtitle: `未读 ${this.summary.unreadCount} · 可领取 ${this.summary.claimableCount}`,
      hint: this.statusMessage || MAIL_MODAL_HINT_DEFAULT,
    };
  }

  /** 直接更新弹窗标题栏的摘要和提示。 */
  private patchModalMeta(meta: MailModalMeta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const subtitleNode = document.getElementById('detail-modal-subtitle');
    const hintNode = document.getElementById('detail-modal-hint');
    if (subtitleNode) {
      subtitleNode.textContent = meta.subtitle;
      subtitleNode.classList.toggle('hidden', meta.subtitle.length === 0);
    }
    if (hintNode) {
      hintNode.textContent = meta.hint;
    }
  }

  /** 记录列表滚动、详情滚动和当前焦点。 */
  private captureRenderState(body: HTMLElement): MailRenderState {
    const activeElement = document.activeElement;
    return {
      listScrollTop: body.querySelector<HTMLElement>('.mail-list')?.scrollTop ?? 0,
      detailScrollTop: body.querySelector<HTMLElement>('.mail-detail')?.scrollTop ?? 0,
      focusSelector: activeElement instanceof HTMLElement && body.contains(activeElement)
        ? this.resolveFocusSelector(activeElement)
        : null,
    };
  }

  /** 恢复列表滚动、详情滚动和焦点。 */
  private restoreRenderState(body: HTMLElement, state: MailRenderState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const list = body.querySelector<HTMLElement>('.mail-list');
    const detail = body.querySelector<HTMLElement>('.mail-detail');
    if (list) {
      list.scrollTop = state.listScrollTop;
    }
    if (detail) {
      detail.scrollTop = state.detailScrollTop;
    }
    if (!state.focusSelector) {
      return;
    }
    const focusTarget = body.querySelector<HTMLElement>(state.focusSelector);
    focusTarget?.focus({ preventScroll: true });
  }

  /** 为当前焦点节点生成可复原的选择器。 */
  private resolveFocusSelector(element: HTMLElement): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const datasetEntries: Array<[string, string | undefined, (value: string) => string]> = [
      ['mailFilter', element.dataset.mailFilter, (value) => `[data-mail-filter="${escapeHtmlAttr(value)}"]`],
      ['mailPageAction', element.dataset.mailPageAction, (value) => `[data-mail-page-action="${escapeHtmlAttr(value)}"]`],
      ['mailAttachmentPage', element.dataset.mailAttachmentPage, (value) => `[data-mail-attachment-page="${escapeHtmlAttr(value)}"]`],
      ['mailSelect', element.dataset.mailSelect, (value) => `[data-mail-select="${escapeHtmlAttr(value)}"]`],
      ['mailCheck', element.dataset.mailCheck, (value) => `[data-mail-check="${escapeHtmlAttr(value)}"]`],
      ['mailMarkRead', element.dataset.mailMarkRead, (value) => `[data-mail-mark-read="${escapeHtmlAttr(value)}"]`],
      ['mailClaim', element.dataset.mailClaim, (value) => `[data-mail-claim="${escapeHtmlAttr(value)}"]`],
      ['mailDelete', element.dataset.mailDelete, (value) => `[data-mail-delete="${escapeHtmlAttr(value)}"]`],
    ];
    for (const [, value, buildSelector] of datasetEntries) {
      if (value) {
        return buildSelector(value);
      }
    }
    if (element.hasAttribute('data-mail-select-page')) {
      return '[data-mail-select-page]';
    }
    if (element.hasAttribute('data-mail-clear-selection')) {
      return '[data-mail-clear-selection]';
    }
    if (element.hasAttribute('data-mail-batch-claim')) {
      return '[data-mail-batch-claim]';
    }
    if (element.hasAttribute('data-mail-batch-delete')) {
      return '[data-mail-batch-delete]';
    }
    return null;
  }

  /** 同步 HUD 上的邮件未读角标。 */
  private updateHudUnreadState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const button = document.getElementById('hud-open-mail');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const hasUnread = this.summary.unreadCount > 0 || this.summary.claimableCount > 0;
    button.dataset.hasUnread = hasUnread ? 'true' : 'false';
  }
}
