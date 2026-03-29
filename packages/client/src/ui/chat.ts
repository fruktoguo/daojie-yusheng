/**
 * 聊天面板 UI
 * 管理多频道消息展示、角色级本地缓存与向上翻页加载历史
 */

import {
  CHAT_CHANNELS,
  CHAT_LOG_LOAD_BATCH_SIZE,
  CHAT_LOG_MAX_PERSISTED_MESSAGES,
  CHAT_LOG_MAX_VISIBLE_MESSAGES,
  CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX,
  CHAT_LOG_STORAGE_KEY,
  CHAT_LOG_STORAGE_VERSION,
  CHAT_MESSAGE_KINDS,
  CHAT_MESSAGE_SCOPES,
  DEFAULT_CHAT_CHANNEL,
  type ChatChannel,
  type ChatMessageKind,
  type ChatMessageScope,
  type ChatStoredMessage,
} from '../constants/ui/chat';

interface ChatStorageEnvelope {
  version: typeof CHAT_LOG_STORAGE_VERSION;
  logsByScope: Record<string, ChatStoredMessage[]>;
}

interface ChatChannelState {
  loadedCount: number;
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

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadStoredEnvelope(): ChatStorageEnvelope {
  const storage = getStorage();
  if (!storage) {
    return {
      version: CHAT_LOG_STORAGE_VERSION,
      logsByScope: {},
    };
  }
  try {
    const raw = storage.getItem(CHAT_LOG_STORAGE_KEY);
    if (!raw) {
      return {
        version: CHAT_LOG_STORAGE_VERSION,
        logsByScope: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<ChatStorageEnvelope>;
    if (parsed.version !== CHAT_LOG_STORAGE_VERSION || !parsed.logsByScope || typeof parsed.logsByScope !== 'object') {
      return {
        version: CHAT_LOG_STORAGE_VERSION,
        logsByScope: {},
      };
    }
    const logsByScope: Record<string, ChatStoredMessage[]> = {};
    for (const [scopeId, entries] of Object.entries(parsed.logsByScope)) {
      if (!Array.isArray(entries)) {
        continue;
      }
      const normalized = entries
        .filter(isChatStoredMessage)
        .slice(-CHAT_LOG_MAX_PERSISTED_MESSAGES)
        .map((entry) => ({ ...entry }));
      if (normalized.length > 0) {
        logsByScope[scopeId] = normalized;
      }
    }
    return {
      version: CHAT_LOG_STORAGE_VERSION,
      logsByScope,
    };
  } catch {
    return {
      version: CHAT_LOG_STORAGE_VERSION,
      logsByScope: {},
    };
  }
}

function persistStoredEnvelope(envelope: ChatStorageEnvelope): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(CHAT_LOG_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch (error) {
    console.warn('[chat] 本地消息缓存写入失败。', error);
    return false;
  }
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
  private storageEnvelope = loadStoredEnvelope();
  private onSend: ((message: string) => void) | null = null;
  private activeChannel: ChatChannel = DEFAULT_CHAT_CHANNEL;
  private currentScopeId: string | null = null;
  private messages: ChatStoredMessage[] = [];
  private messageSequence = 0;
  private persistedMessageIds = new Set<string>();

  constructor() {
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
      this.channelStates.set(channel, { loadedCount: 0 });
      log.addEventListener('scroll', () => this.handleLogScroll(channel));
    });

    this.switchChannel(DEFAULT_CHAT_CHANNEL);
    this.renderAllChannels();
  }

  setCallback(onSend: (message: string) => void): void {
    this.onSend = onSend;
  }

  setPersistenceScope(scopeId: string | null): void {
    const normalizedScope = typeof scopeId === 'string' && scopeId.trim().length > 0
      ? scopeId.trim()
      : null;
    this.currentScopeId = normalizedScope;
    this.input.value = '';
    if (!normalizedScope) {
      this.messages = [];
      this.persistedMessageIds.clear();
      this.resetLoadedCounts();
      this.renderAllChannels();
      return;
    }

    const scoped = this.storageEnvelope.logsByScope[normalizedScope] ?? [];
    this.messages = scoped
      .slice(-CHAT_LOG_MAX_PERSISTED_MESSAGES)
      .map((entry) => ({ ...entry }));
    this.persistedMessageIds = new Set(this.messages.map((entry) => entry.id));
    this.resetLoadedCounts();
    this.renderAllChannels({ stickToBottom: true });
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

  addMessage(
    text: string,
    from?: string,
    kind: ChatMessageKind = 'system',
    options?: ChatMessageScope | ChatAddMessageOptions,
  ): boolean {
    const trimmed = text.trim();
    if (!trimmed || !this.currentScopeId) {
      return false;
    }

    const resolvedOptions = typeof options === 'string'
      ? { scope: options }
      : options;
    const resolvedId = resolvedOptions?.id ?? `${Date.now()}:${this.messageSequence++}`;
    const existing = this.messages.find((entry) => entry.id === resolvedId);
    if (existing) {
      if (this.persistedMessageIds.has(resolvedId)) {
        return true;
      }
      this.storageEnvelope.logsByScope[this.currentScopeId] = this.messages.map((message) => ({ ...message }));
      if (persistStoredEnvelope(this.storageEnvelope)) {
        this.persistedMessageIds.add(resolvedId);
        return true;
      }
      return false;
    }

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
    this.messages.push(entry);
    if (this.messages.length > CHAT_LOG_MAX_PERSISTED_MESSAGES) {
      this.messages = this.messages.slice(-CHAT_LOG_MAX_PERSISTED_MESSAGES);
      this.persistedMessageIds = new Set(
        [...this.persistedMessageIds].filter((messageId) => this.messages.some((message) => message.id === messageId)),
      );
    }
    this.storageEnvelope.logsByScope[this.currentScopeId] = this.messages.map((message) => ({ ...message }));
    const persisted = persistStoredEnvelope(this.storageEnvelope);
    if (persisted) {
      this.persistedMessageIds.add(entry.id);
    }

    for (const channel of this.resolveChannels(entry)) {
      const state = this.channelStates.get(channel);
      if (!state) {
        continue;
      }
      const total = this.getChannelMessages(channel).length;
      const log = this.logs.get(channel);
      const stickToBottom = channel !== this.activeChannel || this.isLogNearBottom(log);
      if (stickToBottom || state.loadedCount <= CHAT_LOG_MAX_VISIBLE_MESSAGES) {
        state.loadedCount = Math.min(total, state.loadedCount + 1);
      }
      if (channel === this.activeChannel || stickToBottom) {
        this.renderChannel(channel, { stickToBottom });
      }
    }
    return persisted;
  }

  private resetLoadedCounts(): void {
    for (const channel of CHAT_CHANNELS) {
      const state = this.channelStates.get(channel);
      if (!state) {
        continue;
      }
      state.loadedCount = Math.min(this.getChannelMessages(channel).length, CHAT_LOG_MAX_VISIBLE_MESSAGES);
    }
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

  private getChannelMessages(channel: ChatChannel): ChatStoredMessage[] {
    return this.messages.filter((entry) => {
      if (channel === 'system') {
        return entry.kind !== 'chat' && entry.kind !== 'combat' && entry.kind !== 'grudge';
      }
      if (channel === 'combat') {
        return entry.kind === 'combat';
      }
      if (channel === 'grudge') {
        return entry.kind === 'grudge';
      }
      if (channel === 'nearby') {
        return entry.kind === 'chat' && (entry.scope ?? 'nearby') === 'nearby';
      }
      if (channel === 'world') {
        return entry.kind === 'chat';
      }
      return entry.kind === 'chat' && entry.scope === 'sect';
    });
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
    const entries = this.getChannelMessages(channel);
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

  private handleLogScroll(channel: ChatChannel): void {
    if (channel !== this.activeChannel) {
      return;
    }
    const log = this.logs.get(channel);
    const state = this.channelStates.get(channel);
    if (!log || !state || log.scrollTop > CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX) {
      return;
    }
    const total = this.getChannelMessages(channel).length;
    if (state.loadedCount >= total) {
      return;
    }
    const previousScrollHeight = log.scrollHeight;
    const previousScrollTop = log.scrollTop;
    state.loadedCount = Math.min(total, state.loadedCount + CHAT_LOG_LOAD_BATCH_SIZE);
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
}
