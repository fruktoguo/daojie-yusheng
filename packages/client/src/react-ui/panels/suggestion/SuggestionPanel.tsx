/**
 * 本文件负责 建议反馈 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Suggestion, SuggestionReply } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';
import { t } from '../../../ui/i18n';

// ─── Store ───────────────────────────────────────────────────────────────────

interface SuggestionPanelState {
  suggestions: Suggestion[];
  playerId: string;
}

export const { store: suggestionPanelStore, useStore: useSuggestionPanelStore } = createPanelStore<SuggestionPanelState>({
  suggestions: [],
  playerId: '',
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface SuggestionPanelCallbacks {
  onCreateSuggestion: ((title: string, description: string) => void) | null;
  onReplySuggestion: ((suggestionId: string, content: string) => void) | null;
  onVoteSuggestion: ((suggestionId: string, vote: 'up' | 'down') => void) | null;
  onMarkRepliesRead: ((suggestionId: string) => void) | null;
  onRequestRefresh: (() => void) | null;
}

const callbacks: SuggestionPanelCallbacks = {
  onCreateSuggestion: null,
  onReplySuggestion: null,
  onVoteSuggestion: null,
  onMarkRepliesRead: null,
  onRequestRefresh: null,
};

export function setSuggestionPanelCallbacks(cbs: Partial<SuggestionPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 6;
type ListTab = 'all' | 'mine';

// ─── 纯逻辑 ──────────────────────────────────────────────────────────────────

function getLastGmReplyAt(suggestion: Suggestion): number {
  for (let i = suggestion.replies.length - 1; i >= 0; i--) {
    if (suggestion.replies[i]?.authorType === 'gm') {
      return suggestion.replies[i]!.createdAt;
    }
  }
  return 0;
}

function hasUnreadGmReply(suggestion: Suggestion, playerId: string): boolean {
  if (!playerId || suggestion.authorId !== playerId) return false;
  return getLastGmReplyAt(suggestion) > suggestion.authorLastReadGmReplyAt;
}

function canPlayerReply(suggestion: Suggestion, playerId: string): boolean {
  if (!playerId || suggestion.authorId !== playerId) return false;
  const lastReply = suggestion.replies[suggestion.replies.length - 1];
  return lastReply?.authorType === 'gm';
}

function matchesKeyword(suggestion: Suggestion, keyword: string): boolean {
  if (!keyword) return true;
  return [
    suggestion.title,
    suggestion.description,
    suggestion.authorName,
    ...suggestion.replies.flatMap((r) => [r.authorName, r.content]),
  ].some((text) => text.toLocaleLowerCase('zh-CN').includes(keyword));
}

function compareSuggestions(a: Suggestion, b: Suggestion, tab: ListTab, playerId: string): number {
  if (tab === 'mine') {
    const aUnread = hasUnreadGmReply(a, playerId);
    const bUnread = hasUnreadGmReply(b, playerId);
    if (aUnread !== bUnread) return aUnread ? -1 : 1;
  }
  if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
  const aLast = Math.max(a.createdAt, a.replies[a.replies.length - 1]?.createdAt ?? 0);
  const bLast = Math.max(b.createdAt, b.replies[b.replies.length - 1]?.createdAt ?? 0);
  if (bLast !== aLast) return bLast - aLast;
  const aScore = a.upvotes.length - a.downvotes.length;
  const bScore = b.upvotes.length - b.downvotes.length;
  if (bScore !== aScore) return bScore - aScore;
  return b.createdAt - a.createdAt;
}

function formatStatus(status: Suggestion['status']): string {
  return status === 'completed'
    ? t('suggestion.status.completed', undefined)
    : t('suggestion.status.pending', undefined);
}

function formatReplyRole(authorType: SuggestionReply['authorType']): string {
  return authorType === 'gm'
    ? t('suggestion.role.gm', undefined)
    : t('suggestion.role.author', undefined);
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function SuggestionPanel() {
  const { suggestions, playerId } = useSuggestionPanelStore();
  const [activeTab, setActiveTab] = useState<ListTab>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 请求刷新
  useEffect(() => {
    callbacks.onRequestRefresh?.();
  }, []);

  const mySuggestions = useMemo(
    () => playerId ? suggestions.filter((s) => s.authorId === playerId) : [],
    [suggestions, playerId],
  );

  const keyword = searchKeyword.trim().toLocaleLowerCase('zh-CN');

  const visibleSuggestions = useMemo(() => {
    const candidates = activeTab === 'mine' ? mySuggestions : suggestions;
    return candidates
      .filter((s) => matchesKeyword(s, keyword))
      .sort((a, b) => compareSuggestions(a, b, activeTab, playerId));
  }, [suggestions, mySuggestions, activeTab, keyword, playerId]);

  const totalPages = Math.max(1, Math.ceil(visibleSuggestions.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => visibleSuggestions.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [visibleSuggestions, effectivePage],
  );

  // 自动选中
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && visibleSuggestions.some((s) => s.id === selectedId)) return selectedId;
    return visibleSuggestions[0]?.id ?? null;
  }, [selectedId, visibleSuggestions]);

  const selectedSuggestion = useMemo(
    () => suggestions.find((s) => s.id === effectiveSelectedId) ?? null,
    [suggestions, effectiveSelectedId],
  );

  const unreadCount = useMemo(
    () => mySuggestions.filter((s) => hasUnreadGmReply(s, playerId)).length,
    [mySuggestions, playerId],
  );

  const pendingCount = useMemo(
    () => suggestions.filter((s) => s.status === 'pending').length,
    [suggestions],
  );

  const handleTabChange = useCallback((tab: ListTab) => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchKeyword(value);
    setPage(1);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    // 标记已读
    const suggestion = suggestions.find((s) => s.id === id);
    if (suggestion && hasUnreadGmReply(suggestion, playerId)) {
      callbacks.onMarkRepliesRead?.(id);
    }
  }, [suggestions, playerId]);

  return (
    <div className="suggestion-shell">
      <SuggestionSummary
        pendingCount={pendingCount}
        mineCount={mySuggestions.length}
        unreadCount={unreadCount}
      />
      <div className="suggestion-layout ui-three-pane-layout">
        <SuggestionComposePane />
        <SuggestionListPane
          activeTab={activeTab}
          items={pagedItems}
          selectedId={effectiveSelectedId}
          page={effectivePage}
          totalPages={totalPages}
          total={visibleSuggestions.length}
          unreadCount={unreadCount}
          searchKeyword={searchKeyword}
          playerId={playerId}
          onTabChange={handleTabChange}
          onSearch={handleSearch}
          onSelect={handleSelect}
          onPageChange={setPage}
        />
        <SuggestionDetailPane
          suggestion={selectedSuggestion}
          playerId={playerId}
        />
      </div>
    </div>
  );
}

// ─── 概览统计 ────────────────────────────────────────────────────────────────

const SuggestionSummary = memo(function SuggestionSummary({
  pendingCount,
  mineCount,
  unreadCount,
}: {
  pendingCount: number;
  mineCount: number;
  unreadCount: number;
}) {
  return (
    <div className="suggestion-summary-grid ui-stats-grid">
      <div className="suggestion-stat ui-stat-card">
        <div className="suggestion-stat-label ui-stat-card-label">{t('suggestion.summary.pending', undefined)}</div>
        <div className="suggestion-stat-value ui-stat-card-value">{pendingCount}</div>
        <div className="suggestion-stat-note ui-stat-card-note">{t('suggestion.summary.pending-note', undefined)}</div>
      </div>
      <div className="suggestion-stat ui-stat-card">
        <div className="suggestion-stat-label ui-stat-card-label">{t('suggestion.summary.mine', undefined)}</div>
        <div className="suggestion-stat-value ui-stat-card-value">{mineCount}</div>
        <div className="suggestion-stat-note ui-stat-card-note">{t('suggestion.summary.mine-note', undefined)}</div>
      </div>
      <div className="suggestion-stat ui-stat-card">
        <div className="suggestion-stat-label ui-stat-card-label">{t('suggestion.summary.unread', undefined)}</div>
        <div className="suggestion-stat-value ui-stat-card-value">{unreadCount}</div>
        <div className="suggestion-stat-note ui-stat-card-note">{t('suggestion.summary.unread-note', undefined)}</div>
      </div>
    </div>
  );
});

// ─── 提交区 ──────────────────────────────────────────────────────────────────

function SuggestionComposePane() {
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const title = titleRef.current?.value.trim() ?? '';
    const desc = descRef.current?.value.trim() ?? '';
    if (!title) {
      alert(t('suggestion.error.title-required', undefined));
      return;
    }
    if (!desc) {
      alert(t('suggestion.error.description-required', undefined));
      return;
    }
    callbacks.onCreateSuggestion?.(title, desc);
    if (titleRef.current) titleRef.current.value = '';
    if (descRef.current) descRef.current.value = '';
  }, []);

  return (
    <section className="panel-section suggestion-pane suggestion-compose ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">{t('suggestion.compose.title', undefined)}</div>
      <div className="suggestion-compose-copy ui-form-copy">{t('suggestion.compose.copy', undefined)}</div>
      <div className="suggestion-form-grid ui-form-grid">
        <div className="suggestion-field ui-form-field">
          <label className="ui-form-label" htmlFor="suggest-title">{t('suggestion.field.title', undefined)}</label>
          <input
            ref={titleRef}
            id="suggest-title"
            className="ui-input"
            type="text"
            maxLength={50}
            placeholder={t('suggestion.field.title-placeholder', undefined)}
          />
        </div>
        <div className="suggestion-field ui-form-field">
          <label className="ui-form-label" htmlFor="suggest-desc">{t('suggestion.field.description', undefined)}</label>
          <textarea
            ref={descRef}
            id="suggest-desc"
            className="ui-textarea"
            maxLength={500}
            placeholder={t('suggestion.field.description-placeholder', undefined)}
          />
        </div>
      </div>
      <div className="suggestion-compose-actions ui-form-actions ui-action-row">
        <div className="panel-subtext">{t('suggestion.compose.note', undefined)}</div>
        <button className="small-btn" type="button" onClick={handleSubmit}>
          {t('suggestion.action.submit', undefined)}
        </button>
      </div>
    </section>
  );
}

// ─── 列表区 ──────────────────────────────────────────────────────────────────

const SuggestionListPane = memo(function SuggestionListPane({
  activeTab,
  items,
  selectedId,
  page,
  totalPages,
  total,
  unreadCount,
  searchKeyword,
  playerId,
  onTabChange,
  onSearch,
  onSelect,
  onPageChange,
}: {
  activeTab: ListTab;
  items: Suggestion[];
  selectedId: string | null;
  page: number;
  totalPages: number;
  total: number;
  unreadCount: number;
  searchKeyword: string;
  playerId: string;
  onTabChange: (tab: ListTab) => void;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="panel-section suggestion-pane ui-surface-pane ui-surface-pane--stack">
      <div className="suggestion-pane-head ui-pane-head">
        <div className="suggestion-tab-row ui-tab-row">
          <button
            className={`suggestion-tab-btn ui-tab-row-btn ${activeTab === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => onTabChange('all')}
          >
            {t('suggestion.tab.all', undefined)}
          </button>
          <button
            className={`suggestion-tab-btn ui-tab-row-btn ${activeTab === 'mine' ? 'active' : ''}`}
            type="button"
            onClick={() => onTabChange('mine')}
          >
            {t('suggestion.tab.mine', undefined)}
            {unreadCount > 0 && <span className="suggestion-inline-dot" aria-hidden="true">{unreadCount}</span>}
          </button>
        </div>
        <div className="suggestion-pane-note ui-pane-note">{t('suggestion.list.note', undefined)}</div>
      </div>
      <div className="suggestion-toolbar ui-list-toolbar">
        <input
          className="suggestion-search-input ui-search-input"
          type="search"
          maxLength={50}
          placeholder={t('suggestion.search.placeholder', undefined)}
          defaultValue={searchKeyword}
          onChange={(e) => onSearch(e.target.value)}
        />
        <div className="suggestion-toolbar-note ui-list-toolbar-note">
          {t('suggestion.toolbar.page', { total, page, totalPages })}
        </div>
      </div>
      <div className="suggestion-list ui-card-list ui-scroll-panel">
        {items.length === 0 ? (
          <div className="empty-hint">
            {activeTab === 'mine' ? t('suggestion.empty.mine', undefined) : t('suggestion.empty.all', undefined)}
          </div>
        ) : (
          items.map((suggestion) => (
            <SuggestionListEntry
              key={suggestion.id}
              suggestion={suggestion}
              isSelected={suggestion.id === selectedId}
              isUnread={hasUnreadGmReply(suggestion, playerId)}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
      <div className="suggestion-pagination">
        <button
          className="small-btn ghost"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('suggestion.action.prev-page', undefined)}
        </button>
        <button
          className="small-btn ghost"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('suggestion.action.next-page', undefined)}
        </button>
      </div>
    </section>
  );
});

const SuggestionListEntry = memo(function SuggestionListEntry({
  suggestion,
  isSelected,
  isUnread,
  onSelect,
}: {
  suggestion: Suggestion;
  isSelected: boolean;
  isUnread: boolean;
  onSelect: (id: string) => void;
}) {
  const score = suggestion.upvotes.length - suggestion.downvotes.length;
  const lastReply = suggestion.replies[suggestion.replies.length - 1] ?? null;

  const handleClick = useCallback(() => onSelect(suggestion.id), [onSelect, suggestion.id]);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(suggestion.id);
    }
  }, [onSelect, suggestion.id]);

  return (
    <article
      className={`suggestion-entry ui-surface-card ui-surface-card--compact ${suggestion.status === 'completed' ? 'completed' : ''} ${isSelected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="suggestion-entry-head">
        <div className="suggestion-entry-main">
          <div className="suggestion-entry-title-row">
            <div className="suggestion-entry-title">{suggestion.title}</div>
            {isUnread && <span className="suggestion-inline-dot" aria-hidden="true" />}
          </div>
          <div className="quest-meta">{formatStatus(suggestion.status)}</div>
        </div>
        <div className="suggestion-entry-meta">
          <div>{suggestion.authorName}</div>
          <div>{new Date(suggestion.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="suggestion-entry-desc">{suggestion.description}</div>
      <div className="suggestion-entry-foot">
        <div className="suggestion-entry-mini-meta">
          <span>{t('suggestion.entry.replies', { count: suggestion.replies.length })}</span>
          <span>{t('suggestion.entry.score', { score: `${score > 0 ? '+' : ''}${score}` })}</span>
          {lastReply
            ? <span>{t('suggestion.entry.latest', { role: formatReplyRole(lastReply.authorType) })}</span>
            : <span>{t('suggestion.reply.empty', undefined)}</span>}
        </div>
      </div>
    </article>
  );
});

// ─── 详情区 ──────────────────────────────────────────────────────────────────

function SuggestionDetailPane({
  suggestion,
  playerId,
}: {
  suggestion: Suggestion | null;
  playerId: string;
}) {
  if (!suggestion) {
    return (
      <section className="panel-section suggestion-pane ui-surface-pane ui-surface-pane--stack">
        <div className="suggestion-pane-head ui-pane-head">
          <div className="panel-section-title">{t('suggestion.detail.title', undefined)}</div>
          <div className="suggestion-pane-note ui-pane-note">{t('suggestion.detail.note', undefined)}</div>
        </div>
        <div className="suggestion-thread ui-scroll-panel">
          <div className="empty-hint">{t('suggestion.empty.detail', undefined)}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-section suggestion-pane ui-surface-pane ui-surface-pane--stack">
      <div className="suggestion-pane-head ui-pane-head">
        <div className="panel-section-title">{t('suggestion.detail.title', undefined)}</div>
        <div className="suggestion-pane-note ui-pane-note">{t('suggestion.detail.note', undefined)}</div>
      </div>
      <div className="suggestion-thread ui-scroll-panel">
        <SuggestionDetailContent suggestion={suggestion} playerId={playerId} />
      </div>
    </section>
  );
}

const SuggestionDetailContent = memo(function SuggestionDetailContent({
  suggestion,
  playerId,
}: {
  suggestion: Suggestion;
  playerId: string;
}) {
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const score = suggestion.upvotes.length - suggestion.downvotes.length;
  const isUpvoted = suggestion.upvotes.includes(playerId);
  const isDownvoted = suggestion.downvotes.includes(playerId);
  const isAuthor = suggestion.authorId === playerId;
  const canReply = canPlayerReply(suggestion, playerId);
  const hasGmReply = suggestion.replies.some((r) => r.authorType === 'gm');

  const replyHint = canReply
    ? t('suggestion.detail.reply-hint.can', undefined)
    : isAuthor
      ? hasGmReply
        ? t('suggestion.detail.reply-hint.wait-more', undefined)
        : t('suggestion.detail.reply-hint.wait-first', undefined)
      : t('suggestion.detail.reply-hint.not-author', undefined);

  const handleVote = useCallback((vote: 'up' | 'down') => {
    callbacks.onVoteSuggestion?.(suggestion.id, vote);
  }, [suggestion.id]);

  const handleSubmitReply = useCallback(() => {
    const content = replyRef.current?.value.trim() ?? '';
    if (!content) {
      alert(t('suggestion.error.reply-required', undefined));
      return;
    }
    if (!canPlayerReply(suggestion, playerId)) {
      alert(t('suggestion.error.reply-disabled', undefined));
      return;
    }
    callbacks.onReplySuggestion?.(suggestion.id, content);
    if (replyRef.current) replyRef.current.value = '';
  }, [suggestion, playerId]);

  return (
    <>
      <div className="suggestion-thread-head">
        <div>
          <div className="suggestion-thread-title">{suggestion.title}</div>
          <div className="suggestion-thread-meta">
            <span>{suggestion.authorName}</span>
            <span>{new Date(suggestion.createdAt).toLocaleString()}</span>
            <span>{formatStatus(suggestion.status)}</span>
          </div>
        </div>
        <div className={`suggestion-score ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}`}>
          {t('suggestion.detail.score', { score: `${score > 0 ? '+' : ''}${score}` })}
        </div>
      </div>
      <div className="suggestion-thread-desc ui-surface-card ui-surface-card--compact">
        {suggestion.description}
      </div>
      <div className="suggestion-entry-foot suggestion-thread-votes">
        <button
          className={`small-btn ghost suggestion-vote-btn ${isUpvoted ? 'active up' : ''}`}
          type="button"
          onClick={() => handleVote('up')}
        >
          {t('suggestion.action.upvote', { count: suggestion.upvotes.length })}
        </button>
        <button
          className={`small-btn ghost suggestion-vote-btn ${isDownvoted ? 'active down' : ''}`}
          type="button"
          onClick={() => handleVote('down')}
        >
          {t('suggestion.action.downvote', { count: suggestion.downvotes.length })}
        </button>
      </div>
      <div className="suggestion-thread-replies">
        <div className="suggestion-thread-section-title">{t('suggestion.reply.section', undefined)}</div>
        {suggestion.replies.length > 0
          ? suggestion.replies.map((reply, idx) => (
            <SuggestionReplyEntry key={`${reply.createdAt}-${idx}`} reply={reply} />
          ))
          : <div className="empty-hint">{t('suggestion.reply.empty-gm', undefined)}</div>}
      </div>
      {isAuthor && (
        <div className="suggestion-thread-reply-box">
          <div className="suggestion-thread-section-title">{t('suggestion.reply.compose-title', undefined)}</div>
          <div className="suggestion-pane-note ui-pane-note">{replyHint}</div>
          <textarea
            ref={replyRef}
            className="suggestion-reply-textarea"
            maxLength={500}
            placeholder={canReply ? t('suggestion.reply.placeholder.can', undefined) : t('suggestion.reply.placeholder.disabled', undefined)}
            disabled={!canReply}
          />
          <div className="suggestion-compose-actions ui-form-actions">
            <div className="panel-subtext">{t('suggestion.reply.compose-note', undefined)}</div>
            <button
              className="small-btn"
              type="button"
              disabled={!canReply}
              onClick={handleSubmitReply}
            >
              {t('suggestion.action.submit-reply', undefined)}
            </button>
          </div>
        </div>
      )}
    </>
  );
});

const SuggestionReplyEntry = memo(function SuggestionReplyEntry({ reply }: { reply: SuggestionReply }) {
  return (
    <article className={`suggestion-reply-entry ui-surface-card ui-surface-card--compact ${reply.authorType === 'gm' ? 'gm' : 'author'}`}>
      <div className="suggestion-reply-head">
        <div className="suggestion-reply-author">{formatReplyRole(reply.authorType)}</div>
        <div className="suggestion-reply-time">{new Date(reply.createdAt).toLocaleString()}</div>
      </div>
      <div className="suggestion-reply-content">{reply.content}</div>
    </article>
  );
});
