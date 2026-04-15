/**
 * 聊天面板 UI
 * 管理多频道消息展示、角色级本地缓存与向上翻页加载历史
 */

import { getDamageTrailColor, type ElementKey, type SkillDamageKind } from '@mud/shared';
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
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
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

interface ParsedCombatDamageSegment {
  before: string;
  connector: string;
  rawAmount: string;
  actualAmount: string;
  after: string;
  details: string[];
  pillText: string;
  suffixText: string;
  tooltipTitle: string;
  tooltipLines: string[];
  color: string;
}

const COMBAT_DAMAGE_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，造成 原始 (?<raw>\d+) - 实际 (?<actual>\d+) - (?:(?<element>金|木|水|火|土)行)?(?<kind>物理|法术) 伤害(?<after>.*)$/;
const COMBAT_HEAL_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，造成 原始 (?<raw>\d+) - 实际 (?<actual>\d+) 治疗(?<after>.*)$/;
const COMBAT_RESULT_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，结果 (?<result>闪避)(?<after>.*)$/;
const COMBAT_HEAL_PILL_COLOR = '#1d6e42';
const COMBAT_RESULT_PILL_COLOR = '#6a7282';

const COMBAT_DAMAGE_ELEMENT_LABEL_TO_KEY: Record<string, ElementKey> = {
  金: 'metal',
  木: 'wood',
  水: 'water',
  火: 'fire',
  土: 'earth',
};

/** isChatChannel：判断并返回条件结果。 */
function isChatChannel(value: unknown): value is ChatChannel {
  return typeof value === 'string' && CHAT_CHANNELS.includes(value as ChatChannel);
}

/** isChatMessageKind：判断并返回条件结果。 */
function isChatMessageKind(value: unknown): value is ChatMessageKind {
  return typeof value === 'string' && CHAT_MESSAGE_KINDS.includes(value as ChatMessageKind);
}

/** isChatMessageScope：判断并返回条件结果。 */
function isChatMessageScope(value: unknown): value is ChatMessageScope {
  return typeof value === 'string' && CHAT_MESSAGE_SCOPES.includes(value as ChatMessageScope);
}

/** isChatStoredMessage：判断并返回条件结果。 */
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

/** formatStamp：格式化输出字符串用于展示。 */
function formatStamp(at: number): string {
  const date = new Date(at);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildLineText(entry: ChatStoredMessage): string {
  return `${formatStamp(entry.at)} ${entry.from ? `[${entry.from}] ` : ''}${entry.text}`;
}

/** parseCombatDamageSegment：解析参数并返回标准化结果。 */
function parseCombatDamageSegment(text: string): ParsedCombatDamageSegment | null {
  const damageMatch = COMBAT_DAMAGE_PATTERN.exec(text);
  if (damageMatch?.groups) {
    const damageKind: SkillDamageKind = damageMatch.groups.kind === '物理' ? 'physical' : 'spell';
    const elementLabel = damageMatch.groups.element;
    const element = elementLabel ? COMBAT_DAMAGE_ELEMENT_LABEL_TO_KEY[elementLabel] : undefined;
    const damageTypeLabel = `${elementLabel ? `${elementLabel}行` : ''}${damageMatch.groups.kind ?? ''}`;
    return {
      before: damageMatch.groups.before ?? '',
      connector: '，造成 ',
      rawAmount: damageMatch.groups.raw ?? '0',
      actualAmount: damageMatch.groups.actual ?? '0',
      after: damageMatch.groups.after ?? '',
      details: (damageMatch.groups.details ?? '')
        .split(' / ')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      pillText: `${damageMatch.groups.actual ?? '0'}`,
      suffixText: '伤害',
      tooltipTitle: `${damageTypeLabel}伤害`,
      tooltipLines: [
        `实际伤害 ${damageMatch.groups.actual ?? '0'}`,
        `原始伤害 ${damageMatch.groups.raw ?? '0'}`,
      ],
      color: getDamageTrailColor(damageKind, element),
    };
  }
  const healMatch = COMBAT_HEAL_PATTERN.exec(text);
  if (healMatch?.groups) {
    const details = (healMatch.groups.details ?? '')
      .split(' / ')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return {
      before: healMatch.groups.before ?? '',
      connector: '，造成 ',
      rawAmount: healMatch.groups.raw ?? '0',
      actualAmount: healMatch.groups.actual ?? '0',
      after: healMatch.groups.after ?? '',
      details,
      pillText: `${healMatch.groups.actual ?? '0'}`,
      suffixText: '治疗',
      tooltipTitle: '治疗',
      tooltipLines: [
        `实际治疗 ${healMatch.groups.actual ?? '0'}`,
        `原始治疗 ${healMatch.groups.raw ?? '0'}`,
      ],
      color: COMBAT_HEAL_PILL_COLOR,
    };
  }
  const resultMatch = COMBAT_RESULT_PATTERN.exec(text);
  if (!resultMatch?.groups) {
    return null;
  }
  const details = (resultMatch.groups.details ?? '')
    .split(' / ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const resultLabel = resultMatch.groups.result ?? '结果';
  return {
    before: resultMatch.groups.before ?? '',
    connector: '，结果 ',
    rawAmount: '0',
    actualAmount: resultLabel,
    after: resultMatch.groups.after ?? '',
    details,
    pillText: resultLabel,
    suffixText: '',
    tooltipTitle: '战斗结果',
    tooltipLines: [resultLabel],
    color: COMBAT_RESULT_PILL_COLOR,
  };
}


function toAlphaColor(hex: string, alpha: number): string {
  const normalized = hex.trim();
  const value = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (value.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildLineFragment(entry: ChatStoredMessage): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const linePrefix = `${formatStamp(entry.at)} ${entry.from ? `[${entry.from}] ` : ''}`;
  const parsedDamage = entry.kind === 'combat' ? parseCombatDamageSegment(entry.text) : null;
  if (!parsedDamage) {
    fragment.append(linePrefix + entry.text);
    return fragment;
  }

  fragment.append(linePrefix + parsedDamage.before + parsedDamage.connector);
  const damagePill = document.createElement('span');
  const color = parsedDamage.color;
  damagePill.className = 'chat-damage-pill';
  damagePill.textContent = parsedDamage.pillText;
  damagePill.setAttribute('aria-label', `${parsedDamage.tooltipTitle}${parsedDamage.actualAmount}，原始 ${parsedDamage.rawAmount}`);
  damagePill.dataset.chatDamageTooltipTitle = parsedDamage.tooltipTitle;
  damagePill.dataset.chatDamageTooltipLines = [
    ...parsedDamage.tooltipLines,
    ...parsedDamage.details,
  ].join('\n');
  damagePill.style.setProperty('--chat-damage-pill-color', color);
  damagePill.style.setProperty('--chat-damage-pill-bg', toAlphaColor(color, 0.16));
  damagePill.style.setProperty('--chat-damage-pill-border', toAlphaColor(color, 0.36));
  damagePill.style.setProperty('--chat-damage-pill-shadow', toAlphaColor(color, 0.22));
  fragment.appendChild(damagePill);
  if (parsedDamage.suffixText) {
    fragment.append(` ${parsedDamage.suffixText}`);
  }
  if (parsedDamage.after) {
    fragment.append(parsedDamage.after);
  }
  return fragment;
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
  private logbookVisible = false;
  private readonly damageTooltip = new FloatingTooltip();
  private readonly damageTooltipTapMode = prefersPinnedTooltipInteraction();
  private hoveredDamageTooltipTarget: HTMLElement | null = null;

/** constructor：初始化实例并完成构造。 */
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
      this.bindDamageTooltip(log);
    });

    this.switchChannel(DEFAULT_CHAT_CHANNEL);
    this.renderAllChannels();
  }

  setCallback(onSend: (message: string) => void): void {
    this.onSend = onSend;
  }

/** setPersistenceScope：设置并同步相关状态。 */
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

/** show：显示当前视图。 */
  show(): void {
    this.panel.classList.remove('hidden');
  }

/** hide：隐藏当前视图。 */
  hide(): void {
    this.panel.classList.add('hidden');
  }

/** clear：清理并清空临时数据。 */
  clear(): void {
    this.setPersistenceScope(null);
  }

/** setLogbookVisible：设置并同步相关状态。 */
  setLogbookVisible(visible: boolean): void {
    if (this.logbookVisible === visible) {
      return;
    }
    this.logbookVisible = visible;
    if (!visible) {
      for (const channel of CHAT_CHANNELS) {
        const state = this.channelStates.get(channel);
        if (!state) {
          continue;
        }
        this.trimChannelState(state, CHAT_LOG_MAX_VISIBLE_MESSAGES);
        this.clearChannel(channel);
      }
      return;
    }
    this.clearInactiveChannels();
    this.renderChannel(this.activeChannel, { stickToBottom: true });
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
      if (!this.logbookVisible) {
        this.trimChannelState(state, CHAT_LOG_MAX_VISIBLE_MESSAGES);
        continue;
      }
      const total = state.messages.length;
      if (channel !== this.activeChannel) {
        state.loadedCount = Math.min(total, Math.max(state.loadedCount, CHAT_LOG_MAX_VISIBLE_MESSAGES));
        continue;
      }
      const log = this.logs.get(channel);
      const stickToBottom = this.isLogNearBottom(log);
      if (stickToBottom || state.loadedCount <= CHAT_LOG_MAX_VISIBLE_MESSAGES) {
        state.loadedCount = Math.min(total, state.loadedCount + 1);
      }
      this.renderChannel(channel, { stickToBottom });
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

/** renderAllChannels：渲染当前界面内容。 */
  private renderAllChannels(options?: { stickToBottom?: boolean }): void {
    for (const channel of CHAT_CHANNELS) {
      if (channel === this.activeChannel) {
        this.renderChannel(channel, { stickToBottom: options?.stickToBottom === true });
        continue;
      }
      this.clearChannel(channel);
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
      line.replaceChildren(buildLineFragment(entry));
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

/** bindDamageTooltip：绑定回调。 */
  private bindDamageTooltip(log: HTMLElement): void {
    const resolvePill = (target: EventTarget | null): HTMLElement | null => (
      target instanceof Element
        ? target.closest<HTMLElement>('[data-chat-damage-tooltip-title]')
        : null
    );
/** showDamageTooltip：显示当前视图。 */
    const showDamageTooltip = (pill: HTMLElement, clientX: number, clientY: number, pinned = false) => {
      const title = pill.dataset.chatDamageTooltipTitle ?? '伤害';
      const lines = (pill.dataset.chatDamageTooltipLines ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (pinned) {
        this.damageTooltip.showPinned(pill, title, lines, clientX, clientY);
      } else {
        this.damageTooltip.show(title, lines, clientX, clientY);
      }
      this.hoveredDamageTooltipTarget = pill;
    };

    log.addEventListener('click', (event) => {
      if (!this.damageTooltipTapMode) {
        return;
      }
      const pill = resolvePill(event.target);
      if (!pill) {
        return;
      }
      if (this.damageTooltip.isPinnedTo(pill)) {
        this.hoveredDamageTooltipTarget = null;
        this.damageTooltip.hide(true);
        return;
      }
      showDamageTooltip(pill, event.clientX, event.clientY, true);
      event.preventDefault();
      event.stopPropagation();
    }, true);

    log.addEventListener('pointermove', (event) => {
      const pill = resolvePill(event.target);
      if (!pill) {
        if (!this.damageTooltipTapMode || !this.damageTooltip.isPinned()) {
          this.hoveredDamageTooltipTarget = null;
          this.damageTooltip.hide();
        }
        return;
      }
      if (this.damageTooltipTapMode && this.damageTooltip.isPinned()) {
        return;
      }
      if (this.hoveredDamageTooltipTarget === pill) {
        this.damageTooltip.move(event.clientX, event.clientY);
        return;
      }
      showDamageTooltip(pill, event.clientX, event.clientY);
    });

    log.addEventListener('pointerleave', () => {
      this.hoveredDamageTooltipTarget = null;
      this.damageTooltip.hide();
    });
  }

/** handleLogScroll：处理输入事件。 */
  private async handleLogScroll(channel: ChatChannel): Promise<void> {
    if (!this.logbookVisible || channel !== this.activeChannel) {
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

/** switchChannel：切换当前标签或模式。 */
  private switchChannel(channel: ChatChannel): void {
    const previousChannel = this.activeChannel;
    this.activeChannel = channel;
    this.tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.chatChannel === channel);
    });
    this.panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.chatPane === channel);
    });
    if (previousChannel !== channel) {
      this.clearChannel(previousChannel);
    }
    if (this.logbookVisible) {
      this.clearInactiveChannels();
      this.renderChannel(channel, { stickToBottom: true });
    }
  }

/** isLogNearBottom：判断并返回条件结果。 */
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

    if (!this.logbookVisible) {
      for (const channel of CHAT_CHANNELS) {
        const state = this.channelStates.get(channel);
        if (!state) {
          continue;
        }
        this.trimChannelState(state, CHAT_LOG_MAX_VISIBLE_MESSAGES);
      }
      return;
    }

    this.renderAllChannels({ stickToBottom: true });
  }


  private trimChannelState(state: ChatChannelState, maxMessages: number): void {
    if (state.messages.length > maxMessages) {
      state.messages = state.messages.slice(-maxMessages);
      state.messageIds = new Set(state.messages.map((entry) => entry.id));
      state.hasLoadedAll = false;
    }
    state.loadedCount = Math.min(state.messages.length, maxMessages);
  }

/** clearChannel：清理并清空临时数据。 */
  private clearChannel(channel: ChatChannel): void {
    this.logs.get(channel)?.replaceChildren();
  }

/** clearInactiveChannels：清理并清空临时数据。 */
  private clearInactiveChannels(): void {
    for (const channel of CHAT_CHANNELS) {
      if (channel !== this.activeChannel) {
        this.clearChannel(channel);
      }
    }
  }
}

