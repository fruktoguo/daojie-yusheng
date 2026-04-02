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

type SuggestionListTab = 'all' | 'mine';

const SUGGESTION_PAGE_SIZE = 6;

/** 意见收集面板 */
export class SuggestionPanel {
  private static readonly MODAL_OWNER = 'suggestion-panel';
  private suggestions: Suggestion[] = [];
  private playerId = '';
  private draftTitle = '';
  private draftDescription = '';
  private replyDraft = '';
  private searchKeyword = '';
  private selectedSuggestionId: string | null = null;
  private activeTab: SuggestionListTab = 'all';
  private pageByTab: Record<SuggestionListTab, number> = { all: 1, mine: 1 };
  private lastSuggestionSyncAt = 0;
  private lastRefreshRequestAt = 0;

  constructor(private readonly socket: SocketManager) {
    this.setupGlobalListeners();
  }

  setPlayerId(id: string): void {
    this.playerId = id;
    this.updateHudUnreadState();
  }

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

  private setupGlobalListeners(): void {
    document.getElementById('hud-open-suggestions')?.addEventListener('click', () => {
      this.open();
    });
  }

  open(): void {
    this.requestSuggestionsIfNeeded();
    this.ensureSelection();
    detailModalHost.open({
      ownerId: SuggestionPanel.MODAL_OWNER,
      title: '意见收集',
      subtitle: this.buildSubtitle(),
      variantClass: 'detail-modal--suggestion',
      hint: '点击空白处关闭',
      bodyHtml: this.buildBodyHtml(),
      onAfterRender: (el: HTMLElement) => this.bindEvents(el),
    });
  }

  private requestSuggestionsIfNeeded(): void {
    if (!this.socket.connected) {
      return;
    }

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

  private buildBodyHtml(): string {
    const pendingCount = this.suggestions.filter((suggestion) => suggestion.status === 'pending').length;
    const mySuggestions = this.getMySuggestions();
    const unreadCount = mySuggestions.filter((suggestion) => this.hasUnreadGmReply(suggestion)).length;
    const pageData = this.getPagedSuggestions(this.activeTab);
    const selectedSuggestion = this.getSelectedSuggestion();

    return `
      <div class="suggestion-shell">
        <div class="suggestion-summary-grid">
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">待处理</div>
            <div class="suggestion-stat-value">${pendingCount}</div>
            <div class="suggestion-stat-note">尚未归档的意见会优先排在列表前方。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">我的意见</div>
            <div class="suggestion-stat-value">${mySuggestions.length}</div>
            <div class="suggestion-stat-note">只展示你自己发起的意见与后续往来记录。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">开发者未读回复</div>
            <div class="suggestion-stat-value">${unreadCount}</div>
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
                <button class="suggestion-tab-btn ${this.activeTab === 'mine' ? 'active' : ''}" data-suggestion-tab="mine" type="button">
                  我的意见
                  ${unreadCount > 0 ? `<span class="suggestion-inline-dot" aria-hidden="true">${unreadCount}</span>` : ''}
                </button>
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
              <div class="suggestion-toolbar-note">
                共 ${pageData.total} 条，第 ${pageData.page} / ${pageData.totalPages} 页
              </div>
            </div>
            <div class="suggestion-list" data-list-kind="${escapeHtmlAttr(this.activeTab)}">
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
            <div class="suggestion-thread" data-thread-kind="detail">
              ${selectedSuggestion ? this.renderSuggestionDetail(selectedSuggestion) : '<div class="empty-hint">请选择一条意见查看详情与回复记录</div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  private renderSuggestionListEntry(suggestion: Suggestion): string {
    const score = suggestion.upvotes.length - suggestion.downvotes.length;
    const lastReply = suggestion.replies[suggestion.replies.length - 1] ?? null;
    const isSelected = suggestion.id === this.selectedSuggestionId;
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

  private renderSuggestionDetail(suggestion: Suggestion): string {
    const score = suggestion.upvotes.length - suggestion.downvotes.length;
    const isUpvoted = suggestion.upvotes.includes(this.playerId);
    const isDownvoted = suggestion.downvotes.includes(this.playerId);
    const isAuthor = suggestion.authorId === this.playerId;
    const canReply = this.canCurrentPlayerReply(suggestion);
    const hasGmReply = suggestion.replies.some((reply) => reply.authorType === 'gm');
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

  private renderReply(reply: SuggestionReply): string {
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

  private bindEvents(el: HTMLElement): void {
    const titleInput = el.querySelector<HTMLInputElement>('#suggest-title');
    const descInput = el.querySelector<HTMLTextAreaElement>('#suggest-desc');
    const replyInput = el.querySelector<HTMLTextAreaElement>('#suggest-reply-content');
    const searchInput = el.querySelector<HTMLInputElement>('#suggest-search');
    const submitButton = el.querySelector<HTMLButtonElement>('#btn-submit-suggest');
    const submitReplyButton = el.querySelector<HTMLButtonElement>('#btn-submit-suggest-reply');

    titleInput?.addEventListener('input', () => {
      this.draftTitle = titleInput.value;
    });
    descInput?.addEventListener('input', () => {
      this.draftDescription = descInput.value;
    });
    replyInput?.addEventListener('input', () => {
      this.replyDraft = replyInput.value;
    });
    searchInput?.addEventListener('input', () => {
      this.searchKeyword = searchInput.value;
      this.pageByTab[this.activeTab] = 1;
      this.ensureSelection();
      this.render();
    });

    submitButton?.addEventListener('click', () => {
      if (!titleInput || !descInput) {
        return;
      }
      const title = titleInput.value.trim();
      const description = descInput.value.trim();

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
      titleInput.value = '';
      descInput.value = '';
    });

    submitReplyButton?.addEventListener('click', () => {
      const selectedSuggestion = this.getSelectedSuggestion();
      if (!selectedSuggestion || !replyInput) {
        return;
      }
      const content = replyInput.value.trim();
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
      replyInput.value = '';
    });

    el.querySelectorAll<HTMLElement>('.suggestion-vote-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = btn.dataset.id;
        const vote = btn.dataset.vote;
        if (!id || (vote !== 'up' && vote !== 'down')) {
          return;
        }
        this.socket.emit(NEXT_C2S.VoteSuggestion, { suggestionId: id, vote } as C2S_VoteSuggestion);
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-suggestion-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.suggestionTab;
        if (tab !== 'all' && tab !== 'mine') {
          return;
        }
        this.activeTab = tab;
        this.ensureSelection();
        this.render();
      });
    });

    el.querySelectorAll<HTMLElement>('[data-suggestion-select]').forEach((node) => {
      const selectSuggestion = () => {
        const suggestionId = node.dataset.suggestionSelect;
        if (!suggestionId) {
          return;
        }
        this.selectedSuggestionId = suggestionId;
        this.replyDraft = '';
        this.markSuggestionReadIfNeeded(suggestionId);
        this.render();
      };
      node.addEventListener('click', selectSuggestion);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectSuggestion();
        }
      });
    });

    el.querySelectorAll<HTMLButtonElement>('[data-suggestion-page-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.suggestionPageAction;
        const pageData = this.getPagedSuggestions(this.activeTab);
        if (action === 'prev' && pageData.page > 1) {
          this.pageByTab[this.activeTab] -= 1;
        }
        if (action === 'next' && pageData.page < pageData.totalPages) {
          this.pageByTab[this.activeTab] += 1;
        }
        this.ensureSelection();
        this.render();
      });
    });
  }

  private render(): void {
    if (!detailModalHost.isOpenFor(SuggestionPanel.MODAL_OWNER)) {
      return;
    }

    const body = document.getElementById('detail-modal-body');
    if (!body) {
      return;
    }

    this.captureDraft(body);
    this.ensureSelection();
    const listScrollTop = body.querySelector<HTMLElement>(`[data-list-kind="${this.activeTab}"]`)?.scrollTop ?? 0;
    const threadScrollTop = body.querySelector<HTMLElement>('[data-thread-kind="detail"]')?.scrollTop ?? 0;

    const subtitle = document.getElementById('detail-modal-subtitle');
    if (subtitle) {
      subtitle.textContent = this.buildSubtitle();
      subtitle.classList.toggle('hidden', !subtitle.textContent);
    }
    body.innerHTML = this.buildBodyHtml();
    this.bindEvents(body);

    const list = body.querySelector<HTMLElement>(`[data-list-kind="${this.activeTab}"]`);
    const thread = body.querySelector<HTMLElement>('[data-thread-kind="detail"]');
    if (list) {
      list.scrollTop = listScrollTop;
    }
    if (thread) {
      thread.scrollTop = threadScrollTop;
    }
  }

  private captureDraft(body: HTMLElement): void {
    this.draftTitle = body.querySelector<HTMLInputElement>('#suggest-title')?.value ?? this.draftTitle;
    this.draftDescription = body.querySelector<HTMLTextAreaElement>('#suggest-desc')?.value ?? this.draftDescription;
    this.replyDraft = body.querySelector<HTMLTextAreaElement>('#suggest-reply-content')?.value ?? this.replyDraft;
    this.searchKeyword = body.querySelector<HTMLInputElement>('#suggest-search')?.value ?? this.searchKeyword;
  }

  private buildSubtitle(): string {
    const myUnreadCount = this.getMySuggestions().filter((suggestion) => this.hasUnreadGmReply(suggestion)).length;
    return `待处理 ${this.suggestions.filter((suggestion) => suggestion.status === 'pending').length} · 我的意见 ${this.getMySuggestions().length} · 未读回复 ${myUnreadCount}`;
  }

  private getMySuggestions(): Suggestion[] {
    if (!this.playerId) {
      return [];
    }
    return this.suggestions.filter((suggestion) => suggestion.authorId === this.playerId);
  }

  private getVisibleSuggestions(tab: SuggestionListTab): Suggestion[] {
    const keyword = this.searchKeyword.trim().toLocaleLowerCase('zh-CN');
    const candidates = (tab === 'mine' ? this.getMySuggestions() : this.suggestions)
      .filter((suggestion) => this.matchesSuggestionKeyword(suggestion, keyword));
    candidates.sort((left, right) => this.compareSuggestions(left, right, tab));
    return candidates;
  }

  private getPagedSuggestions(tab: SuggestionListTab): {
    items: Suggestion[];
    total: number;
    page: number;
    totalPages: number;
  } {
    const items = this.getVisibleSuggestions(tab);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / SUGGESTION_PAGE_SIZE));
    const page = Math.min(totalPages, Math.max(1, this.pageByTab[tab]));
    const start = (page - 1) * SUGGESTION_PAGE_SIZE;
    this.pageByTab[tab] = page;
    return {
      items: items.slice(start, start + SUGGESTION_PAGE_SIZE),
      total,
      page,
      totalPages,
    };
  }

  private compareSuggestions(left: Suggestion, right: Suggestion, tab: SuggestionListTab): number {
    if (tab === 'mine') {
      const leftUnread = this.hasUnreadGmReply(left);
      const rightUnread = this.hasUnreadGmReply(right);
      if (leftUnread !== rightUnread) {
        return leftUnread ? -1 : 1;
      }
    }

    if (left.status !== right.status) {
      return left.status === 'pending' ? -1 : 1;
    }

    const leftLastActivityAt = Math.max(left.createdAt, left.replies[left.replies.length - 1]?.createdAt ?? 0);
    const rightLastActivityAt = Math.max(right.createdAt, right.replies[right.replies.length - 1]?.createdAt ?? 0);
    if (rightLastActivityAt !== leftLastActivityAt) {
      return rightLastActivityAt - leftLastActivityAt;
    }

    const leftScore = left.upvotes.length - left.downvotes.length;
    const rightScore = right.upvotes.length - right.downvotes.length;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return right.createdAt - left.createdAt;
  }

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

  private ensureSelection(): void {
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

  private clampPages(): void {
    (['all', 'mine'] as SuggestionListTab[]).forEach((tab) => {
      const totalPages = Math.max(1, Math.ceil(this.getVisibleSuggestions(tab).length / SUGGESTION_PAGE_SIZE));
      this.pageByTab[tab] = Math.min(totalPages, Math.max(1, this.pageByTab[tab]));
    });
  }

  private getSelectedSuggestion(): Suggestion | null {
    return this.suggestions.find((suggestion) => suggestion.id === this.selectedSuggestionId) ?? null;
  }

  private canCurrentPlayerReply(suggestion: Suggestion): boolean {
    if (!this.playerId || suggestion.authorId !== this.playerId) {
      return false;
    }
    const lastReply = suggestion.replies[suggestion.replies.length - 1];
    return lastReply?.authorType === 'gm';
  }

  private hasUnreadGmReply(suggestion: Suggestion): boolean {
    if (!this.playerId || suggestion.authorId !== this.playerId) {
      return false;
    }
    const lastGmReplyAt = this.getLastGmReplyAt(suggestion);
    return lastGmReplyAt > suggestion.authorLastReadGmReplyAt;
  }

  private getLastGmReplyAt(suggestion: Suggestion): number {
    for (let index = suggestion.replies.length - 1; index >= 0; index -= 1) {
      const reply = suggestion.replies[index];
      if (reply?.authorType === 'gm') {
        return reply.createdAt;
      }
    }
    return 0;
  }

  private markSuggestionReadIfNeeded(suggestionId: string): void {
    const suggestion = this.suggestions.find((entry) => entry.id === suggestionId);
    if (!suggestion || !this.hasUnreadGmReply(suggestion)) {
      return;
    }
    suggestion.authorLastReadGmReplyAt = this.getLastGmReplyAt(suggestion);
    this.updateHudUnreadState();
    this.socket.emit(NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId } as C2S_MarkSuggestionRepliesRead);
  }

  private updateHudUnreadState(): void {
    const button = document.getElementById('hud-open-suggestions');
    if (!button) {
      return;
    }
    const hasUnread = this.getMySuggestions().some((suggestion) => this.hasUnreadGmReply(suggestion));
    button.toggleAttribute('data-has-unread', hasUnread);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(input: string): string {
  return escapeHtml(input);
}
