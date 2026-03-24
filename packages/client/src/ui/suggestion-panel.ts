import { Suggestion, C2S, C2S_CreateSuggestion, C2S_VoteSuggestion } from '@mud/shared';
import type { SocketManager } from '../network/socket';
import { detailModalHost } from './detail-modal-host';
import { SUGGESTION_PANEL_REFRESH_INTERVAL_MS } from '../constants/ui/suggestion';

/** 意见收集面板 */
export class SuggestionPanel {
  private static readonly MODAL_OWNER = 'suggestion-panel';
  private suggestions: Suggestion[] = [];
  private playerId: string = '';
  private draftTitle = '';
  private draftDescription = '';
  private lastSuggestionSyncAt = 0;
  private lastRefreshRequestAt = 0;

  constructor(private readonly socket: SocketManager) {
    this.setupGlobalListeners();
  }

  setPlayerId(id: string) {
    this.playerId = id;
  }

  updateSuggestions(suggestions: Suggestion[]) {
    this.suggestions = suggestions;
    this.lastSuggestionSyncAt = Date.now();
    this.render();
  }

  private setupGlobalListeners() {
    document.getElementById('hud-open-suggestions')?.addEventListener('click', () => {
      this.open();
    });
  }

  open(): void {
    this.requestSuggestionsIfNeeded();
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
    const pending = this.getPendingSuggestions();
    const completed = this.getCompletedSuggestions();
    const totalVotes = this.suggestions.reduce((sum, suggestion) => (
      sum + suggestion.upvotes.length + suggestion.downvotes.length
    ), 0);

    return `
      <div class="suggestion-shell">
        <div class="suggestion-summary-grid">
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">待处理</div>
            <div class="suggestion-stat-value">${pending.length}</div>
            <div class="suggestion-stat-note">按当前分值高低排序，方便优先处理。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">已完成</div>
            <div class="suggestion-stat-value">${completed.length}</div>
            <div class="suggestion-stat-note">保留已落地的意见，便于回看与归档。</div>
          </div>
          <div class="suggestion-stat">
            <div class="suggestion-stat-label">总互动</div>
            <div class="suggestion-stat-value">${totalVotes}</div>
            <div class="suggestion-stat-note">包含当前所有赞同与反对投票。</div>
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
              <div class="panel-subtext">提交后会实时同步给在线玩家与 GM 管理侧。</div>
              <button id="btn-submit-suggest" class="small-btn" type="button">提交意见</button>
            </div>
          </section>

          <section class="panel-section suggestion-pane">
            <div class="suggestion-pane-head">
              <div class="panel-section-title">待处理</div>
              <div class="suggestion-pane-note">按分值排序</div>
            </div>
            <div class="suggestion-list" data-list-kind="pending">
              ${pending.length > 0 ? pending.map((suggestion) => this.renderSuggestion(suggestion)).join('') : '<div class="empty-hint">暂无待处理的意见</div>'}
            </div>
          </section>

          <section class="panel-section suggestion-pane">
            <div class="suggestion-pane-head">
              <div class="panel-section-title">已完成</div>
              <div class="suggestion-pane-note">按完成时间倒序</div>
            </div>
            <div class="suggestion-list" data-list-kind="completed">
              ${completed.length > 0 ? completed.map((suggestion) => this.renderSuggestion(suggestion)).join('') : '<div class="empty-hint">暂无已完成的意见</div>'}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  private renderSuggestion(s: Suggestion): string {
    const score = s.upvotes.length - s.downvotes.length;
    const isUpvoted = s.upvotes.includes(this.playerId);
    const isDownvoted = s.downvotes.includes(this.playerId);
    const scoreClass = score > 0 ? 'positive' : score < 0 ? 'negative' : '';
    const statusText = s.status === 'completed' ? '已完成' : '待处理';

    return `
      <article class="suggestion-entry ${s.status === 'completed' ? 'completed' : ''}">
        <div class="suggestion-entry-head">
          <div>
            <div class="suggestion-entry-title">${escapeHtml(s.title)}</div>
            <div class="quest-meta">${statusText}</div>
          </div>
          <div class="suggestion-entry-meta">
            <div>${escapeHtml(s.authorName)}</div>
            <div>${new Date(s.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="suggestion-entry-desc">${escapeHtml(s.description)}</div>
        <div class="suggestion-entry-foot">
          <button class="small-btn ghost suggestion-vote-btn ${isUpvoted ? 'active up' : ''}" data-id="${escapeHtmlAttr(s.id)}" data-vote="up" type="button">
            赞同 ${s.upvotes.length}
          </button>
          <button class="small-btn ghost suggestion-vote-btn ${isDownvoted ? 'active down' : ''}" data-id="${escapeHtmlAttr(s.id)}" data-vote="down" type="button">
            反对 ${s.downvotes.length}
          </button>
          <div class="suggestion-score ${scoreClass}">
            分值: ${score > 0 ? '+' : ''}${score}
          </div>
        </div>
      </article>
    `;
  }

  private bindEvents(el: HTMLElement): void {
    const titleInput = el.querySelector<HTMLInputElement>('#suggest-title');
    const descInput = el.querySelector<HTMLTextAreaElement>('#suggest-desc');
    const submitButton = el.querySelector<HTMLButtonElement>('#btn-submit-suggest');
    if (titleInput && descInput) {
      titleInput.addEventListener('input', () => {
        this.draftTitle = titleInput.value;
      });
      descInput.addEventListener('input', () => {
        this.draftDescription = descInput.value;
      });
    }

    submitButton?.addEventListener('click', () => {
      if (!titleInput || !descInput) {
        return;
      }
      const title = titleInput.value.trim();
      const description = descInput.value.trim();

      if (!title) return alert('请输入标题');
      if (!description) return alert('请输入建议描述');

      this.socket.emit(C2S.CreateSuggestion, { title, description } as C2S_CreateSuggestion);

      this.draftTitle = '';
      this.draftDescription = '';
      titleInput.value = '';
      descInput.value = '';
    });

    el.querySelectorAll<HTMLElement>('.suggestion-vote-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const vote = btn.dataset.vote;
        if (!id || (vote !== 'up' && vote !== 'down')) {
          return;
        }
        this.socket.emit(C2S.VoteSuggestion, { suggestionId: id, vote } as C2S_VoteSuggestion);
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
    const pendingScrollTop = body.querySelector<HTMLElement>('[data-list-kind="pending"]')?.scrollTop ?? 0;
    const completedScrollTop = body.querySelector<HTMLElement>('[data-list-kind="completed"]')?.scrollTop ?? 0;

    const subtitle = document.getElementById('detail-modal-subtitle');
    if (subtitle) {
      subtitle.textContent = this.buildSubtitle();
      subtitle.classList.toggle('hidden', !subtitle.textContent);
    }
    body.innerHTML = this.buildBodyHtml();
    this.bindEvents(body);

    const pendingList = body.querySelector<HTMLElement>('[data-list-kind="pending"]');
    const completedList = body.querySelector<HTMLElement>('[data-list-kind="completed"]');
    if (pendingList) {
      pendingList.scrollTop = pendingScrollTop;
    }
    if (completedList) {
      completedList.scrollTop = completedScrollTop;
    }
  }

  private getPendingSuggestions(): Suggestion[] {
    return this.suggestions
      .filter((suggestion) => suggestion.status === 'pending')
      .sort((left, right) => {
        const leftScore = left.upvotes.length - left.downvotes.length;
        const rightScore = right.upvotes.length - right.downvotes.length;
        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }
        return right.createdAt - left.createdAt;
      });
  }

  private getCompletedSuggestions(): Suggestion[] {
    return this.suggestions
      .filter((suggestion) => suggestion.status === 'completed')
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  private buildSubtitle(): string {
    return `待处理 ${this.getPendingSuggestions().length} · 已完成 ${this.getCompletedSuggestions().length}`;
  }

  private captureDraft(body: HTMLElement): void {
    this.draftTitle = body.querySelector<HTMLInputElement>('#suggest-title')?.value ?? this.draftTitle;
    this.draftDescription = body.querySelector<HTMLTextAreaElement>('#suggest-desc')?.value ?? this.draftDescription;
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
