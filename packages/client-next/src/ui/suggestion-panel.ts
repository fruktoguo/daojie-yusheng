import {
  NEXT_C2S,
  type C2S_CreateSuggestion,
  type C2S_MarkSuggestionRepliesRead,
  type C2S_ReplySuggestion,
  type C2S_VoteSuggestion,
  type Suggestion,
  type SuggestionReply,
} from '@mud/shared-next';
import type { SocketManager } from '../network/socket';
import { detailModalHost } from './detail-modal-host';
import { SUGGESTION_PANEL_REFRESH_INTERVAL_MS } from '../constants/ui/suggestion';

/** SuggestionListTab：定义该类型的结构与数据语义。 */
type SuggestionListTab = 'all' | 'mine';
/** SuggestionEditableFieldId：定义该类型的结构与数据语义。 */
type SuggestionEditableFieldId = 'suggest-title' | 'suggest-desc' | 'suggest-reply-content' | 'suggest-search';

/** SUGGESTION_PAGE_SIZE：定义该变量以承载业务值。 */
const SUGGESTION_PAGE_SIZE = 6;
/** SUGGESTION_EDITABLE_FIELD_IDS：定义该变量以承载业务值。 */
const SUGGESTION_EDITABLE_FIELD_IDS = new Set<SuggestionEditableFieldId>([
  'suggest-title',
  'suggest-desc',
  'suggest-reply-content',
  'suggest-search',
]);

/** SuggestionRenderState：定义该类型的结构与数据语义。 */
type SuggestionRenderState = {
/** focusedFieldId：定义该变量以承载业务值。 */
  focusedFieldId: SuggestionEditableFieldId | null;
/** selectionStart：定义该变量以承载业务值。 */
  selectionStart: number | null;
/** selectionEnd：定义该变量以承载业务值。 */
  selectionEnd: number | null;
/** fieldScrollTop：定义该变量以承载业务值。 */
  fieldScrollTop: number;
/** listScrollTop：定义该变量以承载业务值。 */
  listScrollTop: number;
/** threadScrollTop：定义该变量以承载业务值。 */
  threadScrollTop: number;
};

/** SuggestionPageData：定义该类型的结构与数据语义。 */
type SuggestionPageData = {
/** items：定义该变量以承载业务值。 */
  items: Suggestion[];
/** total：定义该变量以承载业务值。 */
  total: number;
/** page：定义该变量以承载业务值。 */
  page: number;
/** totalPages：定义该变量以承载业务值。 */
  totalPages: number;
};

/** SuggestionModalMeta：定义该类型的结构与数据语义。 */
type SuggestionModalMeta = {
/** subtitle：定义该变量以承载业务值。 */
  subtitle: string;
};

/** 意见收集面板 */
export class SuggestionPanel {
  private static readonly MODAL_OWNER = 'suggestion-panel';
/** suggestions：定义该变量以承载业务值。 */
  private suggestions: Suggestion[] = [];
  private playerId = '';
  private draftTitle = '';
  private draftDescription = '';
  private replyDraft = '';
  private searchKeyword = '';
/** selectedSuggestionId：定义该变量以承载业务值。 */
  private selectedSuggestionId: string | null = null;
/** activeTab：定义该变量以承载业务值。 */
  private activeTab: SuggestionListTab = 'all';
/** pageByTab：定义该变量以承载业务值。 */
  private pageByTab: Record<SuggestionListTab, number> = { all: 1, mine: 1 };
  private lastSuggestionSyncAt = 0;
  private lastRefreshRequestAt = 0;
  private delegatedEventsBound = false;

/** constructor：处理当前场景中的对应操作。 */
  constructor(private readonly socket: SocketManager) {
    this.setupGlobalListeners();
  }

/** setPlayerId：执行对应的业务逻辑。 */
  setPlayerId(id: string): void {
    this.playerId = id;
    this.updateHudUnreadState();
  }

/** updateSuggestions：执行对应的业务逻辑。 */
  updateSuggestions(suggestions: Suggestion[]): void {
    this.suggestions = suggestions;
    this.lastSuggestionSyncAt = Date.now();

    if (this.selectedSuggestionId && !this.suggestions.some((suggestion) => suggestion.id === this.selectedSuggestionId)) {
      this.selectedSuggestionId = null;
    }
    this.ensureSelection();
    this.clampPages();
    this.updateHudUnreadState();
    this.render();
  }

/** setupGlobalListeners：执行对应的业务逻辑。 */
  private setupGlobalListeners(): void {
    document.getElementById('hud-open-suggestions')?.addEventListener('click', () => {
      this.open();
    });
  }

/** open：执行对应的业务逻辑。 */
  open(): void {
    this.requestSuggestionsIfNeeded();
    this.ensureSelection();
/** meta：定义该变量以承载业务值。 */
    const meta = this.buildModalMeta();
    detailModalHost.open({
      ownerId: SuggestionPanel.MODAL_OWNER,
      title: '意见收集',
      subtitle: meta.subtitle,
      variantClass: 'detail-modal--suggestion',
      hint: '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (el: HTMLElement) => this.bindEvents(el),
    });
  }

/** requestSuggestionsIfNeeded：执行对应的业务逻辑。 */
  private requestSuggestionsIfNeeded(): void {
    if (!this.socket.connected) {
      return;
    }

/** now：定义该变量以承载业务值。 */
    const now = Date.now();
    if (now - this.lastRefreshRequestAt < SUGGESTION_PANEL_REFRESH_INTERVAL_MS) {
      return;
    }

    if (this.suggestions.length > 0 && now - this.lastSuggestionSyncAt < SUGGESTION_PANEL_REFRESH_INTERVAL_MS) {
      return;
    }

    this.lastRefreshRequestAt = now;
    this.socket.sendRequestSuggestions();
  }

/** buildBodyHtml：执行对应的业务逻辑。 */
  private buildBodyHtml(): string {
/** pendingCount：定义该变量以承载业务值。 */
    const pendingCount = this.suggestions.filter((suggestion) => suggestion.status === 'pending').length;
/** mySuggestions：定义该变量以承载业务值。 */
    const mySuggestions = this.getMySuggestions();
/** unreadCount：定义该变量以承载业务值。 */
    const unreadCount = mySuggestions.filter((suggestion) => this.hasUnreadGmReply(suggestion)).length;
/** pageData：定义该变量以承载业务值。 */
    const pageData = this.getPagedSuggestions(this.activeTab);
/** selectedSuggestion：定义该变量以承载业务值。 */
    const selectedSuggestion = this.getSelectedSuggestion();

    return `
      <div class="suggestion-shell">
        <div class="suggestion-summary-grid">
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">待处理</div>
            <div class="suggestion-stat-value" data-suggestion-summary-pending="true">${pendingCount}</div>
            <div class="suggestion-stat-note">尚未归档的意见会优先排在列表前方。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">我的意见</div>
            <div class="suggestion-stat-value" data-suggestion-summary-mine="true">${mySuggestions.length}</div>
            <div class="suggestion-stat-note">只展示你自己发起的意见与后续往来记录。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">开发者未读回复</div>
            <div class="suggestion-stat-value" data-suggestion-summary-unread="true">${unreadCount}</div>
            <div class="suggestion-stat-note">进入对应意见详情后，红点会随已读状态一并消失。</div>
          </div>
        </div>

        <div class="suggestion-layout">
          <section class="panel-section suggestion-pane suggestion-compose">
            <div class="panel-section-title">提交意见</div>
            <div class="suggestion-compose-copy">写清目标、场景和预期结果，便于后续排期与实现。标题建议简短，描述里补充问题背景。</div>
            <div class="suggestion-form-grid">
              <div class="suggestion-field">
                <label for="suggest-title">标题</label>
                <input id="suggest-title" type="text" maxlength="50" placeholder="例如：背包支持按类型筛选" value="${escapeHtmlAttr(this.draftTitle)}" />
              </div>
              <div class="suggestion-field">
                <label for="suggest-desc">详细描述</label>
                <textarea id="suggest-desc" maxlength="500" placeholder="描述遇到的问题、希望的改动方式，以及它会改善什么体验。">${escapeHtml(this.draftDescription)}</textarea>
              </div>
            </div>
            <div class="suggestion-compose-actions">
              <div class="panel-subtext">提交后会实时同步给在线玩家与开发者管理侧。</div>
              <button id="btn-submit-suggest" class="small-btn" type="button">提交意见</button>
            </div>
          </section>

          <section class="panel-section suggestion-pane">
            <div class="suggestion-pane-head">
              <div class="suggestion-tab-row">
                <button class="suggestion-tab-btn ${this.activeTab === 'all' ? 'active' : ''}" data-suggestion-tab="all" type="button">全部意见</button>
                <button class="suggestion-tab-btn ${this.activeTab === 'mine' ? 'active' : ''}" data-suggestion-tab="mine" type="button">${this.renderMineTabLabel(unreadCount)}</button>
              </div>
              <div class="suggestion-pane-note">搜索与分页</div>
            </div>
            <div class="suggestion-toolbar">
              <input
                id="suggest-search"
                class="suggestion-search-input"
                type="search"
                maxlength="50"
                placeholder="搜索标题、描述或回复内容"
                value="${escapeHtmlAttr(this.searchKeyword)}"
              />
              <div class="suggestion-toolbar-note" data-suggestion-toolbar-note="true">
                共 ${pageData.total} 条，第 ${pageData.page} / ${pageData.totalPages} 页
              </div>
            </div>
            <div class="suggestion-list" data-suggestion-list="true" data-list-kind="${escapeHtmlAttr(this.activeTab)}">
              ${pageData.items.length > 0
                ? pageData.items.map((suggestion) => this.renderSuggestionListEntry(suggestion)).join('')
                : `<div class="empty-hint">${this.activeTab === 'mine' ? '暂无符合条件的我的意见' : '暂无符合条件的意见'}</div>`}
            </div>
            <div class="suggestion-pagination">
              <button class="small-btn ghost" data-suggestion-page-action="prev" type="button" ${pageData.page <= 1 ? 'disabled' : ''}>上一页</button>
              <button class="small-btn ghost" data-suggestion-page-action="next" type="button" ${pageData.page >= pageData.totalPages ? 'disabled' : ''}>下一页</button>
            </div>
          </section>

          <section class="panel-section suggestion-pane">
            <div class="suggestion-pane-head">
              <div class="panel-section-title">意见详情</div>
              <div class="suggestion-pane-note">单实例会话视图</div>
            </div>
            <div class="suggestion-thread" data-suggestion-thread="true" data-thread-kind="detail">
              ${selectedSuggestion ? this.renderSuggestionDetail(selectedSuggestion) : '<div class="empty-hint">请选择一条意见查看详情与回复记录</div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

/** renderSuggestionListEntry：执行对应的业务逻辑。 */
  private renderSuggestionListEntry(suggestion: Suggestion): string {
/** score：定义该变量以承载业务值。 */
    const score = suggestion.upvotes.length - suggestion.downvotes.length;
/** lastReply：定义该变量以承载业务值。 */
    const lastReply = suggestion.replies[suggestion.replies.length - 1] ?? null;
/** isSelected：定义该变量以承载业务值。 */
    const isSelected = suggestion.id === this.selectedSuggestionId;
/** unread：定义该变量以承载业务值。 */
    const unread = this.hasUnreadGmReply(suggestion);
    return `
      <article
        class="suggestion-entry ${suggestion.status === 'completed' ? 'completed' : ''} ${isSelected ? 'selected' : ''}"
        data-suggestion-select="${escapeHtmlAttr(suggestion.id)}"
        role="button"
        tabindex="0"
      >
        <div class="suggestion-entry-head">
          <div class="suggestion-entry-main">
            <div class="suggestion-entry-title-row">
              <div class="suggestion-entry-title">${escapeHtml(suggestion.title)}</div>
              ${unread ? '<span class="suggestion-inline-dot" aria-hidden="true"></span>' : ''}
            </div>
            <div class="quest-meta">${suggestion.status === 'completed' ? '已完成' : '待处理'}</div>
          </div>
          <div class="suggestion-entry-meta">
            <div>${escapeHtml(suggestion.authorName)}</div>
            <div>${new Date(suggestion.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="suggestion-entry-desc">${escapeHtml(suggestion.description)}</div>
        <div class="suggestion-entry-foot">
          <div class="suggestion-entry-mini-meta">
            <span>回复 ${suggestion.replies.length}</span>
            <span>分值 ${score > 0 ? '+' : ''}${score}</span>
            ${lastReply ? `<span>最新 ${escapeHtml(lastReply.authorType === 'gm' ? '开发者' : '发起人')}</span>` : '<span>暂无回复</span>'}
          </div>
        </div>
      </article>
    `;
  }

/** renderSuggestionDetail：执行对应的业务逻辑。 */
  private renderSuggestionDetail(suggestion: Suggestion): string {
/** score：定义该变量以承载业务值。 */
    const score = suggestion.upvotes.length - suggestion.downvotes.length;
/** isUpvoted：定义该变量以承载业务值。 */
    const isUpvoted = suggestion.upvotes.includes(this.playerId);
/** isDownvoted：定义该变量以承载业务值。 */
    const isDownvoted = suggestion.downvotes.includes(this.playerId);
/** isAuthor：定义该变量以承载业务值。 */
    const isAuthor = suggestion.authorId === this.playerId;
/** canReply：定义该变量以承载业务值。 */
    const canReply = this.canCurrentPlayerReply(suggestion);
/** hasGmReply：定义该变量以承载业务值。 */
    const hasGmReply = suggestion.replies.some((reply) => reply.authorType === 'gm');
/** replyHint：定义该变量以承载业务值。 */
    const replyHint = canReply
      ? '开发者已回复，你现在可以继续补充。'
      : suggestion.authorId === this.playerId
        ? hasGmReply
          ? '等待开发者再次回复后，你才能继续追加下一条。'
          : '这条意见需要先等开发者回复后，才能继续追加补充。'
        : '只有发起人可在开发者回复后继续补充。';

    return `
      <div class="suggestion-thread-head">
        <div>
          <div class="suggestion-thread-title">${escapeHtml(suggestion.title)}</div>
          <div class="suggestion-thread-meta">
            <span>${escapeHtml(suggestion.authorName)}</span>
            <span>${new Date(suggestion.createdAt).toLocaleString()}</span>
            <span>${suggestion.status === 'completed' ? '已完成' : '待处理'}</span>
          </div>
        </div>
        <div class="suggestion-score ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}">
          分值: ${score > 0 ? '+' : ''}${score}
        </div>
      </div>
      <div class="suggestion-thread-desc">${escapeHtml(suggestion.description)}</div>
      <div class="suggestion-entry-foot suggestion-thread-votes">
        <button class="small-btn ghost suggestion-vote-btn ${isUpvoted ? 'active up' : ''}" data-id="${escapeHtmlAttr(suggestion.id)}" data-vote="up" type="button">
          赞同 ${suggestion.upvotes.length}
        </button>
        <button class="small-btn ghost suggestion-vote-btn ${isDownvoted ? 'active down' : ''}" data-id="${escapeHtmlAttr(suggestion.id)}" data-vote="down" type="button">
          反对 ${suggestion.downvotes.length}
        </button>
      </div>
      <div class="suggestion-thread-replies">
        <div class="suggestion-thread-section-title">回复记录</div>
        ${suggestion.replies.length > 0
          ? suggestion.replies.map((reply) => this.renderReply(reply)).join('')
          : '<div class="empty-hint">开发者还没有回复这条意见</div>'}
      </div>
      ${isAuthor ? `
        <div class="suggestion-thread-reply-box">
          <div class="suggestion-thread-section-title">继续补充</div>
          <div class="suggestion-pane-note">${escapeHtml(replyHint)}</div>
          <textarea
            id="suggest-reply-content"
            class="suggestion-reply-textarea"
            maxlength="500"
            placeholder="${escapeHtmlAttr(canReply ? '补充你的问题场景、截图描述或验收预期' : '当前不可补充')}"
            ${canReply ? '' : 'disabled'}
          >${escapeHtml(this.replyDraft)}</textarea>
          <div class="suggestion-compose-actions">
            <div class="panel-subtext">补充内容会追加到当前意见会话，不会单独生成新意见。</div>
            <button id="btn-submit-suggest-reply" class="small-btn" type="button" ${canReply ? '' : 'disabled'}>发送补充</button>
          </div>
        </div>
      ` : ''}
    `;
  }

/** renderReply：执行对应的业务逻辑。 */
  private renderReply(reply: SuggestionReply): string {
/** roleLabel：定义该变量以承载业务值。 */
    const roleLabel = reply.authorType === 'gm' ? '开发者' : '发起人';
    return `
      <article class="suggestion-reply-entry ${reply.authorType === 'gm' ? 'gm' : 'author'}">
        <div class="suggestion-reply-head">
          <div class="suggestion-reply-author">${escapeHtml(roleLabel)}</div>
          <div class="suggestion-reply-time">${new Date(reply.createdAt).toLocaleString()}</div>
        </div>
        <div class="suggestion-reply-content">${escapeHtml(reply.content)}</div>
      </article>
    `;
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(el: HTMLElement): void {
    if (this.delegatedEventsBound) {
      return;
    }
    this.delegatedEventsBound = true;
    el.addEventListener('input', (event) => this.handleInput(event));
    el.addEventListener('click', (event) => this.handleClick(event));
    el.addEventListener('keydown', (event) => this.handleKeyDown(event));
  }

/** render：执行对应的业务逻辑。 */
  private render(): void {
    if (!detailModalHost.isOpenFor(SuggestionPanel.MODAL_OWNER)) {
      return;
    }

/** body：定义该变量以承载业务值。 */
    const body = document.getElementById('detail-modal-body');
    if (!body) {
      return;
    }

    this.captureDraft(body);
    this.ensureSelection();
/** renderState：定义该变量以承载业务值。 */
    const renderState = this.captureRenderState(body);
    if (!this.patchBody(body)) {
/** meta：定义该变量以承载业务值。 */
      const meta = this.buildModalMeta();
      detailModalHost.open({
        ownerId: SuggestionPanel.MODAL_OWNER,
        title: '意见收集',
        subtitle: meta.subtitle,
        variantClass: 'detail-modal--suggestion',
        hint: '点击空白处关闭',
        bodyHtml: this.buildBodyHtml(),
        onAfterRender: (el: HTMLElement) => this.bindEvents(el),
      });
    }
    this.restoreRenderState(body, renderState);
  }

/** captureRenderState：执行对应的业务逻辑。 */
  private captureRenderState(body: HTMLElement): SuggestionRenderState {
/** activeElement：定义该变量以承载业务值。 */
    const activeElement = document.activeElement;
/** listScrollTop：定义该变量以承载业务值。 */
    const listScrollTop = body.querySelector<HTMLElement>(`[data-list-kind="${this.activeTab}"]`)?.scrollTop ?? 0;
/** threadScrollTop：定义该变量以承载业务值。 */
    const threadScrollTop = body.querySelector<HTMLElement>('[data-thread-kind="detail"]')?.scrollTop ?? 0;
    if (
      !(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      || !body.contains(activeElement)
      || !SUGGESTION_EDITABLE_FIELD_IDS.has(activeElement.id as SuggestionEditableFieldId)
    ) {
      return {
        focusedFieldId: null,
        selectionStart: null,
        selectionEnd: null,
        fieldScrollTop: 0,
        listScrollTop,
        threadScrollTop,
      };
    }
    return {
      focusedFieldId: activeElement.id as SuggestionEditableFieldId,
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
      fieldScrollTop: activeElement instanceof HTMLTextAreaElement ? activeElement.scrollTop : 0,
      listScrollTop,
      threadScrollTop,
    };
  }

/** restoreRenderState：执行对应的业务逻辑。 */
  private restoreRenderState(body: HTMLElement, state: SuggestionRenderState): void {
/** list：定义该变量以承载业务值。 */
    const list = body.querySelector<HTMLElement>(`[data-list-kind="${this.activeTab}"]`);
/** thread：定义该变量以承载业务值。 */
    const thread = body.querySelector<HTMLElement>('[data-thread-kind="detail"]');
    if (list) {
      list.scrollTop = state.listScrollTop;
    }
    if (thread) {
      thread.scrollTop = state.threadScrollTop;
    }
    if (!state.focusedFieldId) {
      return;
    }
/** field：定义该变量以承载业务值。 */
    const field = body.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${state.focusedFieldId}`);
    if (!field || field.disabled) {
      return;
    }
    try {
      field.focus({ preventScroll: true });
    } catch {
      field.focus();
    }
    if (typeof state.selectionStart === 'number' && typeof state.selectionEnd === 'number') {
      try {
        field.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch {
        // ignore unsupported selection restoration
      }
    }
    if (field instanceof HTMLTextAreaElement) {
      field.scrollTop = state.fieldScrollTop;
    }
  }

/** captureDraft：执行对应的业务逻辑。 */
  private captureDraft(body: HTMLElement): void {
    this.draftTitle = body.querySelector<HTMLInputElement>('#suggest-title')?.value ?? this.draftTitle;
    this.draftDescription = body.querySelector<HTMLTextAreaElement>('#suggest-desc')?.value ?? this.draftDescription;
    this.replyDraft = body.querySelector<HTMLTextAreaElement>('#suggest-reply-content')?.value ?? this.replyDraft;
    this.searchKeyword = body.querySelector<HTMLInputElement>('#suggest-search')?.value ?? this.searchKeyword;
  }

/** buildSubtitle：执行对应的业务逻辑。 */
  private buildSubtitle(): string {
/** myUnreadCount：定义该变量以承载业务值。 */
    const myUnreadCount = this.getMySuggestions().filter((suggestion) => this.hasUnreadGmReply(suggestion)).length;
    return `待处理 ${this.suggestions.filter((suggestion) => suggestion.status === 'pending').length} · 我的意见 ${this.getMySuggestions().length} · 未读回复 ${myUnreadCount}`;
  }

/** buildModalMeta：执行对应的业务逻辑。 */
  private buildModalMeta(): SuggestionModalMeta {
    return {
      subtitle: this.buildSubtitle(),
    };
  }

/** renderMineTabLabel：执行对应的业务逻辑。 */
  private renderMineTabLabel(unreadCount: number): string {
    return `我的意见${unreadCount > 0 ? `<span class="suggestion-inline-dot" aria-hidden="true">${unreadCount}</span>` : ''}`;
  }

/** patchBody：执行对应的业务逻辑。 */
  private patchBody(body: HTMLElement): boolean {
    if (!body.querySelector('.suggestion-shell')) {
      return false;
    }

/** pendingNode：定义该变量以承载业务值。 */
    const pendingNode = body.querySelector<HTMLElement>('[data-suggestion-summary-pending="true"]');
/** mineNode：定义该变量以承载业务值。 */
    const mineNode = body.querySelector<HTMLElement>('[data-suggestion-summary-mine="true"]');
/** unreadNode：定义该变量以承载业务值。 */
    const unreadNode = body.querySelector<HTMLElement>('[data-suggestion-summary-unread="true"]');
/** toolbarNoteNode：定义该变量以承载业务值。 */
    const toolbarNoteNode = body.querySelector<HTMLElement>('[data-suggestion-toolbar-note="true"]');
/** listRoot：定义该变量以承载业务值。 */
    const listRoot = body.querySelector<HTMLElement>('[data-suggestion-list="true"]');
/** threadRoot：定义该变量以承载业务值。 */
    const threadRoot = body.querySelector<HTMLElement>('[data-suggestion-thread="true"]');
/** allTabButton：定义该变量以承载业务值。 */
    const allTabButton = body.querySelector<HTMLButtonElement>('[data-suggestion-tab="all"]');
/** mineTabButton：定义该变量以承载业务值。 */
    const mineTabButton = body.querySelector<HTMLButtonElement>('[data-suggestion-tab="mine"]');
/** prevPageButton：定义该变量以承载业务值。 */
    const prevPageButton = body.querySelector<HTMLButtonElement>('[data-suggestion-page-action="prev"]');
/** nextPageButton：定义该变量以承载业务值。 */
    const nextPageButton = body.querySelector<HTMLButtonElement>('[data-suggestion-page-action="next"]');
    if (!pendingNode || !mineNode || !unreadNode || !toolbarNoteNode || !listRoot || !threadRoot || !allTabButton || !mineTabButton || !prevPageButton || !nextPageButton) {
      return false;
    }

/** pendingCount：定义该变量以承载业务值。 */
    const pendingCount = this.suggestions.filter((suggestion) => suggestion.status === 'pending').length;
/** mySuggestions：定义该变量以承载业务值。 */
    const mySuggestions = this.getMySuggestions();
/** unreadCount：定义该变量以承载业务值。 */
    const unreadCount = mySuggestions.filter((suggestion) => this.hasUnreadGmReply(suggestion)).length;
/** pageData：定义该变量以承载业务值。 */
    const pageData = this.getPagedSuggestions(this.activeTab);
/** selectedSuggestion：定义该变量以承载业务值。 */
    const selectedSuggestion = this.getSelectedSuggestion();

    pendingNode.textContent = String(pendingCount);
    mineNode.textContent = String(mySuggestions.length);
    unreadNode.textContent = String(unreadCount);
    toolbarNoteNode.textContent = `共 ${pageData.total} 条，第 ${pageData.page} / ${pageData.totalPages} 页`;

    allTabButton.classList.toggle('active', this.activeTab === 'all');
    mineTabButton.classList.toggle('active', this.activeTab === 'mine');
    mineTabButton.innerHTML = this.renderMineTabLabel(unreadCount);

    listRoot.dataset.listKind = this.activeTab;
    listRoot.innerHTML = pageData.items.length > 0
      ? pageData.items.map((suggestion) => this.renderSuggestionListEntry(suggestion)).join('')
      : `<div class="empty-hint">${this.activeTab === 'mine' ? '暂无符合条件的我的意见' : '暂无符合条件的意见'}</div>`;
    threadRoot.innerHTML = selectedSuggestion
      ? this.renderSuggestionDetail(selectedSuggestion)
      : '<div class="empty-hint">请选择一条意见查看详情与回复记录</div>';

    prevPageButton.disabled = pageData.page <= 1;
    nextPageButton.disabled = pageData.page >= pageData.totalPages;
    this.patchModalMeta(this.buildModalMeta());
    return true;
  }

/** patchModalMeta：执行对应的业务逻辑。 */
  private patchModalMeta(meta: SuggestionModalMeta): void {
/** subtitle：定义该变量以承载业务值。 */
    const subtitle = document.getElementById('detail-modal-subtitle');
    if (subtitle) {
      subtitle.textContent = meta.subtitle;
      subtitle.classList.toggle('hidden', meta.subtitle.length === 0);
    }
  }

/** handleInput：执行对应的业务逻辑。 */
  private handleInput(event: Event): void {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (target.id === 'suggest-title') {
      this.draftTitle = target.value;
      return;
    }
    if (target.id === 'suggest-desc') {
      this.draftDescription = target.value;
      return;
    }
    if (target.id === 'suggest-reply-content') {
      this.replyDraft = target.value;
      return;
    }
    if (target.id === 'suggest-search') {
      this.searchKeyword = target.value;
      this.pageByTab[this.activeTab] = 1;
      this.ensureSelection();
      this.render();
    }
  }

/** handleClick：执行对应的业务逻辑。 */
  private handleClick(event: Event): void {
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

/** submitButton：定义该变量以承载业务值。 */
    const submitButton = target.closest<HTMLButtonElement>('#btn-submit-suggest');
    if (submitButton) {
/** title：定义该变量以承载业务值。 */
      const title = this.draftTitle.trim();
/** description：定义该变量以承载业务值。 */
      const description = this.draftDescription.trim();
      if (!title) {
        alert('请输入标题');
        return;
      }
      if (!description) {
        alert('请输入建议描述');
        return;
      }
      this.socket.emit(NEXT_C2S.CreateSuggestion, { title, description } as C2S_CreateSuggestion);
      this.draftTitle = '';
      this.draftDescription = '';
/** body：定义该变量以承载业务值。 */
      const body = document.getElementById('detail-modal-body');
/** titleInput：定义该变量以承载业务值。 */
      const titleInput = body?.querySelector<HTMLInputElement>('#suggest-title');
/** descInput：定义该变量以承载业务值。 */
      const descInput = body?.querySelector<HTMLTextAreaElement>('#suggest-desc');
      if (titleInput) {
        titleInput.value = '';
      }
      if (descInput) {
        descInput.value = '';
      }
      return;
    }

/** submitReplyButton：定义该变量以承载业务值。 */
    const submitReplyButton = target.closest<HTMLButtonElement>('#btn-submit-suggest-reply');
    if (submitReplyButton) {
/** selectedSuggestion：定义该变量以承载业务值。 */
      const selectedSuggestion = this.getSelectedSuggestion();
/** content：定义该变量以承载业务值。 */
      const content = this.replyDraft.trim();
      if (!selectedSuggestion) {
        return;
      }
      if (!content) {
        alert('请输入回复内容');
        return;
      }
      if (!this.canCurrentPlayerReply(selectedSuggestion)) {
        alert('当前还不能回复，请等待开发者回复后再补充。');
        return;
      }
      this.socket.emit(NEXT_C2S.ReplySuggestion, {
        suggestionId: selectedSuggestion.id,
        content,
      } as C2S_ReplySuggestion);
      this.replyDraft = '';
/** body：定义该变量以承载业务值。 */
      const body = document.getElementById('detail-modal-body');
/** replyInput：定义该变量以承载业务值。 */
      const replyInput = body?.querySelector<HTMLTextAreaElement>('#suggest-reply-content');
      if (replyInput) {
        replyInput.value = '';
      }
      return;
    }

/** voteButton：定义该变量以承载业务值。 */
    const voteButton = target.closest<HTMLElement>('.suggestion-vote-btn');
    if (voteButton) {
      event.stopPropagation();
/** id：定义该变量以承载业务值。 */
      const id = voteButton.dataset.id;
/** vote：定义该变量以承载业务值。 */
      const vote = voteButton.dataset.vote;
      if (!id || (vote !== 'up' && vote !== 'down')) {
        return;
      }
      this.socket.emit(NEXT_C2S.VoteSuggestion, { suggestionId: id, vote } as C2S_VoteSuggestion);
      return;
    }

/** tabButton：定义该变量以承载业务值。 */
    const tabButton = target.closest<HTMLButtonElement>('[data-suggestion-tab]');
    if (tabButton) {
/** tab：定义该变量以承载业务值。 */
      const tab = tabButton.dataset.suggestionTab;
      if (tab !== 'all' && tab !== 'mine') {
        return;
      }
      this.activeTab = tab;
      this.ensureSelection();
      this.render();
      return;
    }

/** pageButton：定义该变量以承载业务值。 */
    const pageButton = target.closest<HTMLButtonElement>('[data-suggestion-page-action]');
    if (pageButton) {
/** action：定义该变量以承载业务值。 */
      const action = pageButton.dataset.suggestionPageAction;
/** pageData：定义该变量以承载业务值。 */
      const pageData = this.getPagedSuggestions(this.activeTab);
      if (action === 'prev' && pageData.page > 1) {
        this.pageByTab[this.activeTab] -= 1;
      }
      if (action === 'next' && pageData.page < pageData.totalPages) {
        this.pageByTab[this.activeTab] += 1;
      }
      this.ensureSelection();
      this.render();
      return;
    }

/** suggestionEntry：定义该变量以承载业务值。 */
    const suggestionEntry = target.closest<HTMLElement>('[data-suggestion-select]');
    if (!suggestionEntry) {
      return;
    }
/** suggestionId：定义该变量以承载业务值。 */
    const suggestionId = suggestionEntry.dataset.suggestionSelect;
    if (!suggestionId) {
      return;
    }
    this.selectSuggestion(suggestionId);
  }

/** handleKeyDown：执行对应的业务逻辑。 */
  private handleKeyDown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
/** suggestionEntry：定义该变量以承载业务值。 */
    const suggestionEntry = target.closest<HTMLElement>('[data-suggestion-select]');
/** suggestionId：定义该变量以承载业务值。 */
    const suggestionId = suggestionEntry?.dataset.suggestionSelect;
    if (!suggestionId) {
      return;
    }
    event.preventDefault();
    this.selectSuggestion(suggestionId);
  }

/** selectSuggestion：执行对应的业务逻辑。 */
  private selectSuggestion(suggestionId: string): void {
    this.selectedSuggestionId = suggestionId;
    this.replyDraft = '';
    this.markSuggestionReadIfNeeded(suggestionId);
    this.render();
  }

/** getMySuggestions：执行对应的业务逻辑。 */
  private getMySuggestions(): Suggestion[] {
    if (!this.playerId) {
      return [];
    }
    return this.suggestions.filter((suggestion) => suggestion.authorId === this.playerId);
  }

/** getVisibleSuggestions：执行对应的业务逻辑。 */
  private getVisibleSuggestions(tab: SuggestionListTab): Suggestion[] {
/** keyword：定义该变量以承载业务值。 */
    const keyword = this.searchKeyword.trim().toLocaleLowerCase('zh-CN');
/** candidates：定义该变量以承载业务值。 */
    const candidates = (tab === 'mine' ? this.getMySuggestions() : this.suggestions)
      .filter((suggestion) => this.matchesSuggestionKeyword(suggestion, keyword));
    candidates.sort((left, right) => this.compareSuggestions(left, right, tab));
    return candidates;
  }

/** getPagedSuggestions：执行对应的业务逻辑。 */
  private getPagedSuggestions(tab: SuggestionListTab): {
/** items：定义该变量以承载业务值。 */
    items: Suggestion[];
/** total：定义该变量以承载业务值。 */
    total: number;
/** page：定义该变量以承载业务值。 */
    page: number;
/** totalPages：定义该变量以承载业务值。 */
    totalPages: number;
  } {
/** items：定义该变量以承载业务值。 */
    const items = this.getVisibleSuggestions(tab);
/** total：定义该变量以承载业务值。 */
    const total = items.length;
/** totalPages：定义该变量以承载业务值。 */
    const totalPages = Math.max(1, Math.ceil(total / SUGGESTION_PAGE_SIZE));
/** page：定义该变量以承载业务值。 */
    const page = Math.min(totalPages, Math.max(1, this.pageByTab[tab]));
/** start：定义该变量以承载业务值。 */
    const start = (page - 1) * SUGGESTION_PAGE_SIZE;
    this.pageByTab[tab] = page;
    return {
      items: items.slice(start, start + SUGGESTION_PAGE_SIZE),
      total,
      page,
      totalPages,
    };
  }

/** compareSuggestions：执行对应的业务逻辑。 */
  private compareSuggestions(left: Suggestion, right: Suggestion, tab: SuggestionListTab): number {
    if (tab === 'mine') {
/** leftUnread：定义该变量以承载业务值。 */
      const leftUnread = this.hasUnreadGmReply(left);
/** rightUnread：定义该变量以承载业务值。 */
      const rightUnread = this.hasUnreadGmReply(right);
      if (leftUnread !== rightUnread) {
        return leftUnread ? -1 : 1;
      }
    }

    if (left.status !== right.status) {
      return left.status === 'pending' ? -1 : 1;
    }

/** leftLastActivityAt：定义该变量以承载业务值。 */
    const leftLastActivityAt = Math.max(left.createdAt, left.replies[left.replies.length - 1]?.createdAt ?? 0);
/** rightLastActivityAt：定义该变量以承载业务值。 */
    const rightLastActivityAt = Math.max(right.createdAt, right.replies[right.replies.length - 1]?.createdAt ?? 0);
    if (rightLastActivityAt !== leftLastActivityAt) {
      return rightLastActivityAt - leftLastActivityAt;
    }

/** leftScore：定义该变量以承载业务值。 */
    const leftScore = left.upvotes.length - left.downvotes.length;
/** rightScore：定义该变量以承载业务值。 */
    const rightScore = right.upvotes.length - right.downvotes.length;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return right.createdAt - left.createdAt;
  }

/** matchesSuggestionKeyword：执行对应的业务逻辑。 */
  private matchesSuggestionKeyword(suggestion: Suggestion, keyword: string): boolean {
    if (!keyword) {
      return true;
    }

    return [
      suggestion.title,
      suggestion.description,
      suggestion.authorName,
      ...suggestion.replies.flatMap((reply) => [reply.authorName, reply.content]),
    ].some((text) => text.toLocaleLowerCase('zh-CN').includes(keyword));
  }

/** ensureSelection：执行对应的业务逻辑。 */
  private ensureSelection(): void {
/** visibleSuggestions：定义该变量以承载业务值。 */
    const visibleSuggestions = this.getVisibleSuggestions(this.activeTab);
    if (visibleSuggestions.length === 0) {
      this.selectedSuggestionId = null;
      return;
    }

    if (this.selectedSuggestionId && visibleSuggestions.some((suggestion) => suggestion.id === this.selectedSuggestionId)) {
      return;
    }

    this.selectedSuggestionId = visibleSuggestions[0]?.id ?? null;
  }

/** clampPages：执行对应的业务逻辑。 */
  private clampPages(): void {
    (['all', 'mine'] as SuggestionListTab[]).forEach((tab) => {
/** totalPages：定义该变量以承载业务值。 */
      const totalPages = Math.max(1, Math.ceil(this.getVisibleSuggestions(tab).length / SUGGESTION_PAGE_SIZE));
      this.pageByTab[tab] = Math.min(totalPages, Math.max(1, this.pageByTab[tab]));
    });
  }

/** getSelectedSuggestion：执行对应的业务逻辑。 */
  private getSelectedSuggestion(): Suggestion | null {
    return this.suggestions.find((suggestion) => suggestion.id === this.selectedSuggestionId) ?? null;
  }

/** canCurrentPlayerReply：执行对应的业务逻辑。 */
  private canCurrentPlayerReply(suggestion: Suggestion): boolean {
    if (!this.playerId || suggestion.authorId !== this.playerId) {
      return false;
    }
/** lastReply：定义该变量以承载业务值。 */
    const lastReply = suggestion.replies[suggestion.replies.length - 1];
    return lastReply?.authorType === 'gm';
  }

/** hasUnreadGmReply：执行对应的业务逻辑。 */
  private hasUnreadGmReply(suggestion: Suggestion): boolean {
    if (!this.playerId || suggestion.authorId !== this.playerId) {
      return false;
    }
/** lastGmReplyAt：定义该变量以承载业务值。 */
    const lastGmReplyAt = this.getLastGmReplyAt(suggestion);
    return lastGmReplyAt > suggestion.authorLastReadGmReplyAt;
  }

/** getLastGmReplyAt：执行对应的业务逻辑。 */
  private getLastGmReplyAt(suggestion: Suggestion): number {
    for (let index = suggestion.replies.length - 1; index >= 0; index -= 1) {
      const reply = suggestion.replies[index];
      if (reply?.authorType === 'gm') {
        return reply.createdAt;
      }
    }
    return 0;
  }

/** markSuggestionReadIfNeeded：执行对应的业务逻辑。 */
  private markSuggestionReadIfNeeded(suggestionId: string): void {
/** suggestion：定义该变量以承载业务值。 */
    const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
    if (!suggestion || !this.hasUnreadGmReply(suggestion)) {
      return;
    }
    suggestion.authorLastReadGmReplyAt = this.getLastGmReplyAt(suggestion);
    this.updateHudUnreadState();
    this.socket.emit(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId } as C2S_MarkSuggestionRepliesRead);
  }

/** updateHudUnreadState：执行对应的业务逻辑。 */
  private updateHudUnreadState(): void {
/** button：定义该变量以承载业务值。 */
    const button = document.getElementById('hud-open-suggestions');
    if (!button) {
      return;
    }
/** hasUnread：定义该变量以承载业务值。 */
    const hasUnread = this.getMySuggestions().some((suggestion) => this.hasUnreadGmReply(suggestion));
    button.toggleAttribute('data-has-unread', hasUnread);
  }
}

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** escapeHtmlAttr：执行对应的业务逻辑。 */
function escapeHtmlAttr(input: string): string {
  return escapeHtml(input);
}

