/**
 * 聊天面板 UI
 * 管理多频道消息展示、角色级本地缓存与向上翻页加载历史
 */

import {
  CHAT_CHANNELS,
  CHAT_LOG_LOAD_BATCH_SIZE,
  CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL,
  CHAT_LOG_MAX_VISIBLE_MESSAGES,
  CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX,
  CHAT_MESSAGE_KINDS,
  CHAT_MESSAGE_SCOPES,
  DEFAULT_CHAT_CHANNEL,
  type ChatChannel,
  type ChatMessageKind,
  type ChatMessageScope,
  type ChatStoredMessage,
} from '../constants/ui/chat';
import {
  appendChannelMessages,
  clearLegacyChatStorage,
  loadOlderChannelMessages,
  loadRecentChannelMessages,
} from './chat-storage';

interface ChatChannelState {
  messages: ChatStoredMessage[];
  messageIds: Set<string>;
  loadedCount: number;
  hasLoadedAll: boolean;
  loadingOlder: boolean;
}

interface ChatAddMessageOptions {
  id?: string;
  at?: number;
  scope?: ChatMessageScope;
}

function isChatChannel(value: unknown): value is ChatChannel {
  return typeof value === 'string' && CHAT_CHANNELS.includes(value as ChatChannel);
}

function isChatMessageKind(value: unknown): value is ChatMessageKind {
  return typeof value === 'string' && CHAT_MESSAGE_KINDS.includes(value as ChatMessageKind);
}

function isChatMessageScope(value: unknown): value is ChatMessageScope {
  return typeof value === 'string' && CHAT_MESSAGE_SCOPES.includes(value as ChatMessageScope);
}

function isChatStoredMessage(value: unknown): value is ChatStoredMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ChatStoredMessage>;
  return typeof candidate.id === 'string'
    && Number.isFinite(candidate.at)
    && typeof candidate.text === 'string'
    && isChatMessageKind(candidate.kind)
    && (candidate.from === undefined || typeof candidate.from === 'string')
    && (candidate.scope === undefined || isChatMessageScope(candidate.scope));
}

function createChannelState(): ChatChannelState {
  return {
    messages: [],
    messageIds: new Set<string>(),
    loadedCount: 0,
    hasLoadedAll: false,
    loadingOlder: false,
  };
}

function sortMessagesByTime(messages: ChatStoredMessage[]): ChatStoredMessage[] {
  return messages.slice().sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.id.localeCompare(right.id);
  });
}

function mergeMessages(
  current: ChatStoredMessage[],
  incoming: ChatStoredMessage[],
): { messages: ChatStoredMessage[]; ids: Set<string> } {
  const merged = new Map<string, ChatStoredMessage>();
  for (const entry of current) {
    merged.set(entry.id, entry);
  }
  for (const entry of incoming) {
    if (!isChatStoredMessage(entry)) {
      continue;
    }
    merged.set(entry.id, entry);
  }
  const messages = sortMessagesByTime([...merged.values()]).slice(-CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL);
  return {
    messages,
    ids: new Set(messages.map((entry) => entry.id)),
  };
}

function formatStamp(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildLineText(entry: ChatStoredMessage): string {
  return `${formatStamp(entry.at)} ${entry.from ? `[${entry.from}] ` : ''}${entry.text}`;
}

export class ChatUI {
  private panel = document.getElementById('chat-panel')!;
  private input = document.getElementById('chat-input') as HTMLInputElement;
  private sendBtn = document.getElementById('chat-send')!;
  private tabs = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-channel]')];
  private panes = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-pane]')];
  private logs = new Map<ChatChannel, HTMLElement>();
  private channelStates = new Map<ChatChannel, ChatChannelState>();
  private onSend: ((message: string) => void) | null = null;
  private activeChannel: ChatChannel = DEFAULT_CHAT_CHANNEL;
  private currentScopeId: string | null = null;
  private messageSequence = 0;
  private persistedMessageKeys = new Set<string>();
  private pendingPersistence = new Map<string, Promise<boolean>>();
  private scopeLoadToken = 0;

  constructor() {
    clearLegacyChatStorage();
    this.sendBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.submit();
      } else if (event.key === 'Escape') {
        this.input.blur();
      }
    });

    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const channel = tab.dataset.chatChannel;
        if (!isChatChannel(channel)) {
          return;
        }
        this.switchChannel(channel);
      });
    });

    this.panes.forEach((pane) => {
      const channel = pane.dataset.chatPane;
      const log = pane.querySelector<HTMLElement>('.chat-log');
      if (!isChatChannel(channel) || !log) {
        return;
      }
      this.logs.set(channel, log);
      this.channelStates.set(channel, createChannelState());
      log.addEventListener('scroll', () => this.handleLogScroll(channel));
    });

    this.switchChannel(DEFAULT_CHAT_CHANNEL);
    this.renderAllChannels();
  }

  setCallback(onSend: (message: string) => void): void {
    this.onSend = onSend;
  }

  setPersistenceScope(scopeId: string | null): void {
    this.scopeLoadToken += 1;
    const normalizedScope = typeof scopeId === 'string' && scopeId.trim().length > 0
      ? scopeId.trim()
      : null;
    this.currentScopeId = normalizedScope;
    this.input.value = '';
    this.persistedMessageKeys.clear();
    this.pendingPersistence.clear();
    for (const channel of CHAT_CHANNELS) {
      this.channelStates.set(channel, createChannelState());
    }
    if (!normalizedScope) {
      this.renderAllChannels();
      return;
    }
    this.renderAllChannels({ stickToBottom: true });
    void this.hydrateRecentMessages(normalizedScope, this.scopeLoadToken);
  }

  show(): void {
    this.panel.classList.remove('hidden');
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  clear(): void {
    this.setPersistenceScope(null);
  }

  async addMessage(
    text: string,
    from?: string,
    kind: ChatMessageKind = 'system',
    options?: ChatMessageScope | ChatAddMessageOptions,
  ): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || !this.currentScopeId) {
      return false;
    }

    const resolvedOptions = typeof options === 'string'
      ? { scope: options }
      : options;
    const scopeId = this.currentScopeId;
    const resolvedId = resolvedOptions?.id ?? `${Date.now()}:${this.messageSequence++}`;
    const messageKey = this.buildMessageKey(scopeId, resolvedId);
    const now = Date.now();
    const resolvedScope = resolvedOptions?.scope ?? (kind === 'chat' ? 'nearby' : undefined);
    const entry: ChatStoredMessage = {
      id: resolvedId,
      at: resolvedOptions?.at ?? now,
      text: trimmed,
      from,
      kind,
      scope: resolvedScope,
    };
    const channels = this.resolveChannels(entry);
    const duplicateInAllChannels = channels.every((channel) => this.channelStates.get(channel)?.messageIds.has(resolvedId));
    if (duplicateInAllChannels) {
      if (this.persistedMessageKeys.has(messageKey)) {
        return true;
      }
      const pendingPersistence = this.pendingPersistence.get(messageKey);
      if (pendingPersistence) {
        return pendingPersistence;
      }
      return false;
    }

    for (const channel of channels) {
      const state = this.channelStates.get(channel);
      if (!state) {
        continue;
      }
      if (!state.messageIds.has(entry.id)) {
        state.messages.push(entry);
        const merged = mergeMessages([], state.messages);
        state.messages = merged.messages;
        state.messageIds = merged.ids;
      }
      const total = state.messages.length;
      const log = this.logs.get(channel);
      const stickToBottom = channel !== this.activeChannel || this.isLogNearBottom(log);
      if (stickToBottom || state.loadedCount <= CHAT_LOG_MAX_VISIBLE_MESSAGES) {
        state.loadedCount = Math.min(total, state.loadedCount + 1);
      }
      if (channel === this.activeChannel || stickToBottom) {
        this.renderChannel(channel, { stickToBottom });
      }
    }

    const persistencePromise = appendChannelMessages(scopeId, entry, channels)
      .then((persisted) => {
        if (persisted) {
          this.persistedMessageKeys.add(messageKey);
        }
        return persisted;
      })
      .finally(() => {
        this.pendingPersistence.delete(messageKey);
      });
    this.pendingPersistence.set(messageKey, persistencePromise);
    return persistencePromise;
  }

  private resolveChannels(entry: ChatStoredMessage): ChatChannel[] {
    if (entry.kind === 'combat') {
      return ['combat'];
    }
    if (entry.kind === 'grudge') {
      return ['grudge'];
    }
    if (entry.kind === 'chat') {
      if (entry.scope === 'sect') {
        return ['sect', 'world'];
      }
      if (entry.scope === 'world') {
        return ['world'];
      }
      return ['nearby', 'world'];
    }
    return ['system'];
  }

  private renderAllChannels(options?: { stickToBottom?: boolean }): void {
    for (const channel of CHAT_CHANNELS) {
      this.renderChannel(channel, { stickToBottom: options?.stickToBottom === true });
    }
  }

  private renderChannel(
    channel: ChatChannel,
    options?: {
      stickToBottom?: boolean;
      preserveScrollFromLoadMore?: boolean;
      previousScrollHeight?: number;
      previousScrollTop?: number;
    },
  ): void {
    const log = this.logs.get(channel);
    const state = this.channelStates.get(channel);
    if (!log || !state) {
      return;
    }
    const entries = state.messages;
    state.loadedCount = Math.min(entries.length, Math.max(0, state.loadedCount));
    const visible = entries.slice(Math.max(0, entries.length - state.loadedCount));
    const fragment = document.createDocumentFragment();
    for (const entry of visible) {
      const line = document.createElement('div');
      line.className = `chat-line chat-kind-${entry.kind}`;
      line.textContent = buildLineText(entry);
      fragment.appendChild(line);
    }
    log.replaceChildren(fragment);

    if (options?.preserveScrollFromLoadMore) {
      const previousScrollHeight = options.previousScrollHeight ?? 0;
      const previousScrollTop = options.previousScrollTop ?? 0;
      log.scrollTop = Math.max(0, log.scrollHeight - previousScrollHeight + previousScrollTop);
      return;
    }
    if (options?.stickToBottom) {
      log.scrollTop = log.scrollHeight;
    }
  }

  private async handleLogScroll(channel: ChatChannel): Promise<void> {
    if (channel !== this.activeChannel) {
      return;
    }
    const log = this.logs.get(channel);
    const state = this.channelStates.get(channel);
    if (!log || !state || log.scrollTop > CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX || state.loadingOlder || state.hasLoadedAll) {
      return;
    }
    const oldestEntry = state.messages[0];
    if (!oldestEntry) {
      state.hasLoadedAll = true;
      return;
    }
    const scopeId = this.currentScopeId;
    if (!scopeId) {
      return;
    }
    state.loadingOlder = true;
    const previousScrollHeight = log.scrollHeight;
    const previousScrollTop = log.scrollTop;
    const loadToken = this.scopeLoadToken;
    const olderEntries = await loadOlderChannelMessages(
      scopeId,
      channel,
      oldestEntry,
      CHAT_LOG_LOAD_BATCH_SIZE,
    );
    state.loadingOlder = false;
    if (loadToken !== this.scopeLoadToken || scopeId !== this.currentScopeId) {
      return;
    }
    if (olderEntries.length === 0) {
      state.hasLoadedAll = true;
      return;
    }
    const merged = mergeMessages(olderEntries, state.messages);
    state.messages = merged.messages;
    state.messageIds = merged.ids;
    for (const entry of olderEntries) {
      this.persistedMessageKeys.add(this.buildMessageKey(scopeId, entry.id));
    }
    state.loadedCount = Math.min(state.messages.length, state.loadedCount + olderEntries.length);
    if (olderEntries.length < CHAT_LOG_LOAD_BATCH_SIZE) {
      state.hasLoadedAll = true;
    }
    this.renderChannel(channel, {
      preserveScrollFromLoadMore: true,
      previousScrollHeight,
      previousScrollTop,
    });
  }

  private switchChannel(channel: ChatChannel): void {
    this.activeChannel = channel;
    this.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.chatChannel === channel);
    });
    this.panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.chatPane === channel);
    });
    this.renderChannel(channel, { stickToBottom: true });
  }

  private isLogNearBottom(log: HTMLElement | undefined): boolean {
    if (!log) {
      return true;
    }
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 24;
  }

  private submit(): void {
    const message = this.input.value.trim();
    if (!message) {
      return;
    }
    this.onSend?.(message);
    this.input.value = '';
  }

  private buildMessageKey(scopeId: string, messageId: string): string {
    return `${scopeId}\n${messageId}`;
  }

  private async hydrateRecentMessages(scopeId: string, loadToken: number): Promise<void> {
    const loadedByChannel = await Promise.all(
      CHAT_CHANNELS.map(async (channel) => ({
        channel,
        entries: await loadRecentChannelMessages(scopeId, channel, CHAT_LOG_MAX_VISIBLE_MESSAGES),
      })),
    );
    if (loadToken !== this.scopeLoadToken || scopeId !== this.currentScopeId) {
      return;
    }

    for (const { channel, entries } of loadedByChannel) {
      const state = this.channelStates.get(channel);
      if (!state) {
        continue;
      }
      const merged = mergeMessages(state.messages, entries);
      state.messages = merged.messages;
      state.messageIds = merged.ids;
      state.loadedCount = Math.min(state.messages.length, Math.max(state.loadedCount, entries.length));
      state.hasLoadedAll = entries.length < CHAT_LOG_LOAD_BATCH_SIZE;
      for (const entry of entries) {
        this.persistedMessageKeys.add(this.buildMessageKey(scopeId, entry.id));
      }
    }

    this.renderAllChannels({ stickToBottom: true });
  }
}
