/**
 * 聊天面板 UI
 * 管理多频道消息展示、角色级本地缓存与向上翻页加载历史
 */

import { formatDisplayNumber, getDamageTrailColor, type ElementKey, type SkillDamageKind } from '@mud/shared';
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
import { patchElementChildren, patchElementHtml } from './dom-patch';
import {
  appendChannelMessages,
  clearLegacyChatStorage,
  loadOlderChannelMessages,
  loadRecentChannelMessages,
} from './chat-storage';

/** 单个聊天频道的本地状态。 */
interface ChatChannelState {
/**
 * messages：message相关字段。
 */

  messages: ChatStoredMessage[];  
  /**
 * messageIds：messageID相关字段。
 */

  messageIds: Set<string>;  
  /**
 * loadedCount：数量或计量字段。
 */

  loadedCount: number;  
  /**
 * hasLoadedAll：启用开关或状态标识。
 */

  hasLoadedAll: boolean;  
  /**
 * loadingOlder：loadingOlder相关字段。
 */

  loadingOlder: boolean;
}

/** 追加聊天消息时可覆盖的消息元数据。 */
interface ChatAddMessageOptions {
/**
 * id：ID标识。
 */

  id?: string;  
  /**
 * at：at相关字段。
 */

  at?: number;  
  /**
 * scope：scope相关字段。
 */

  scope?: ChatMessageScope;
}

/** 解析后的战斗伤害或治疗文本片段。 */
interface ParsedCombatDamageSegment {
/**
 * before：before相关字段。
 */

  before: string;  
  /**
 * connector：connector相关字段。
 */

  connector: string;  
  /**
 * rawAmount：数量或计量字段。
 */

  rawAmount: string;  
  /**
 * actualAmount：数量或计量字段。
 */

  actualAmount: string;  
  /**
 * after：after相关字段。
 */

  after: string;  
  /**
 * details：详情相关字段。
 */

  details: string[];  
  /**
 * pillText：pillText名称或显示文本。
 */

  pillText: string;  
  /**
 * suffixText：suffixText名称或显示文本。
 */

  suffixText: string;  
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;  
  /**
 * tooltipLines：提示Line相关字段。
 */

  tooltipLines: string[];  
  /**
 * color：color相关字段。
 */

  color: string;
}

const COMBAT_DAMAGE_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，造成 原始 (?<raw>[^\s]+) - 实际 (?<actual>[^\s]+) - (?:(?<element>金|木|水|火|土)行)?(?<kind>物理|法术) 伤害(?<after>.*)$/;
const COMBAT_HEAL_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，造成 原始 (?<raw>[^\s]+) - 实际 (?<actual>[^\s]+) 治疗(?<after>.*)$/;
const COMBAT_RESULT_PATTERN = /^(?<before>.*?)(?:（(?<details>[^）]+)）)?，结果 (?<result>闪避)(?<after>.*)$/;
/** 治疗数值胶囊的颜色。 */
const COMBAT_HEAL_PILL_COLOR = '#1d6e42';
/** 闪避结果胶囊的颜色。 */
const COMBAT_RESULT_PILL_COLOR = '#6a7282';

const COMBAT_DAMAGE_ELEMENT_LABEL_TO_KEY: Record<string, ElementKey> = {
  金: 'metal',
  木: 'wood',
  水: 'water',
  火: 'fire',
  土: 'earth',
};

/** 判断值是否属于已知聊天频道。 */
function isChatChannel(value: unknown): value is ChatChannel {
  return typeof value === 'string' && CHAT_CHANNELS.includes(value as ChatChannel);
}

/** 判断值是否属于已知聊天消息类型。 */
function isChatMessageKind(value: unknown): value is ChatMessageKind {
  return typeof value === 'string' && CHAT_MESSAGE_KINDS.includes(value as ChatMessageKind);
}

/** 判断值是否属于已知聊天消息范围。 */
function isChatMessageScope(value: unknown): value is ChatMessageScope {
  return typeof value === 'string' && CHAT_MESSAGE_SCOPES.includes(value as ChatMessageScope);
}

/** 判断值是否为合法的已存储聊天消息。 */
function isChatStoredMessage(value: unknown): value is ChatStoredMessage {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 创建频道初始状态。 */
function createChannelState(): ChatChannelState {
  return {
    messages: [],
    messageIds: new Set<string>(),
    loadedCount: 0,
    hasLoadedAll: false,
    loadingOlder: false,
  };
}

/** 按时间和 ID 对消息排序。 */
function sortMessagesByTime(messages: ChatStoredMessage[]): ChatStoredMessage[] {
  return messages.slice().sort((left, right) => {
    if (left.at !== right.at) {
      return left.at - right.at;
    }
    return left.id.localeCompare(right.id);
  });
}

/** 合并当前消息与新消息，并保留时间顺序。 */
function mergeMessages(
  current: ChatStoredMessage[],
  incoming: ChatStoredMessage[],
): {
/**
 * messages：message相关字段。
 */
 messages: ChatStoredMessage[];
 /**
 * ids：ID相关字段。
 */
 ids: Set<string> } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 格式化消息时间戳。 */
function formatStamp(at: number): string {
  const date = new Date(at);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/** 格式化战斗日志里的数值，兼容历史缓存中的纯数字文本。 */
function formatCombatLogAmount(rawValue: string): string {
  const value = rawValue.trim();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  return formatDisplayNumber(numeric, {
    maximumFractionDigits: 0,
    compactMaximumFractionDigits: 1,
  });
}

/** 生成用于日志或缓存的纯文本消息行。 */
function buildLineText(entry: ChatStoredMessage): string {
  return `${formatStamp(entry.at)} ${entry.from ? `[${entry.from}] ` : ''}${entry.text}`;
}

/** 解析战斗伤害、治疗与结果文本中的高亮片段。 */
function parseCombatDamageSegment(text: string): ParsedCombatDamageSegment | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const damageMatch = COMBAT_DAMAGE_PATTERN.exec(text);
  if (damageMatch?.groups) {
    const damageKind: SkillDamageKind = damageMatch.groups.kind === '物理' ? 'physical' : 'spell';
    const elementLabel = damageMatch.groups.element;
    const element = elementLabel ? COMBAT_DAMAGE_ELEMENT_LABEL_TO_KEY[elementLabel] : undefined;
    const damageTypeLabel = `${elementLabel ? `${elementLabel}行` : ''}${damageMatch.groups.kind ?? ''}`;
    const rawAmount = formatCombatLogAmount(damageMatch.groups.raw ?? '0');
    const actualAmount = formatCombatLogAmount(damageMatch.groups.actual ?? '0');
    return {
      before: damageMatch.groups.before ?? '',
      connector: '，造成 ',
      rawAmount,
      actualAmount,
      after: damageMatch.groups.after ?? '',
      details: (damageMatch.groups.details ?? '')
        .split(' / ')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      pillText: actualAmount,
      suffixText: '伤害',
      tooltipTitle: `${damageTypeLabel}伤害`,
      tooltipLines: [
        `实际伤害 ${actualAmount}`,
        `原始伤害 ${rawAmount}`,
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
    const rawAmount = formatCombatLogAmount(healMatch.groups.raw ?? '0');
    const actualAmount = formatCombatLogAmount(healMatch.groups.actual ?? '0');
    return {
      before: healMatch.groups.before ?? '',
      connector: '，造成 ',
      rawAmount,
      actualAmount,
      after: healMatch.groups.after ?? '',
      details,
      pillText: actualAmount,
      suffixText: '治疗',
      tooltipTitle: '治疗',
      tooltipLines: [
        `实际治疗 ${actualAmount}`,
        `原始治疗 ${rawAmount}`,
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

/** 将颜色字符串和透明度合成 rgba 表达式。 */
function toAlphaColor(hex: string, alpha: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 构建聊天行中的可交互片段。 */
function buildLineFragment(entry: ChatStoredMessage): DocumentFragment {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 聊天界面实现，负责频道切换、消息缓存与滚动状态。 */
export class ChatUI {
  /** 聊天面板根节点。 */
  private panel = document.getElementById('chat-panel')!;
  /** 消息输入框。 */
  private input = document.getElementById('chat-input') as HTMLInputElement;
  /** 发送按钮。 */
  private sendBtn = document.getElementById('chat-send')!;
  /** 频道标签页节点集合。 */
  private tabs = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-channel]')];
  /** 各频道内容容器。 */
  private panes = [...this.panel.querySelectorAll<HTMLElement>('[data-chat-pane]')];
  /** 各频道消息列表。 */
  private logs = new Map<ChatChannel, HTMLElement>();
  /** 各频道的缓存与加载状态。 */
  private channelStates = new Map<ChatChannel, ChatChannelState>();
  /** 发送消息的外部回调。 */
  private onSend: ((message: string) => void) | null = null;
  /** 当前激活的聊天频道。 */
  private activeChannel: ChatChannel = DEFAULT_CHAT_CHANNEL;
  /** 当前聊天范围 ID。 */
  private currentScopeId: string | null = null;
  /** 用于避免重复消息 ID 的序列号。 */
  private messageSequence = 0;
  /** 已写入本地缓存的消息键。 */
  private persistedMessageKeys = new Set<string>();
  /** 待提交到本地缓存的消息。 */
  private pendingPersistence = new Map<string, Promise<boolean>>();
  /** 范围加载令牌，用于丢弃过期结果。 */
  private scopeLoadToken = 0;
  /** 日志簿是否处于可见状态。 */
  private logbookVisible = false;
  /** 伤害提示浮层。 */
  private readonly damageTooltip = new FloatingTooltip();
  /** 伤害提示是否处于触控锁定模式。 */
  private readonly damageTooltipTapMode = prefersPinnedTooltipInteraction();
  /** 当前悬停的伤害提示目标。 */
  private hoveredDamageTooltipTarget: HTMLElement | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


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
  /**
 * setCallback：写入Callback。
 * @param onSend (message: string) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallback(onSend: (message: string) => void): void {
    this.onSend = onSend;
  }

  /** 设置当前消息持久化范围。 */
  setPersistenceScope(scopeId: string | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 显示聊天面板。 */
  show(): void {
    this.panel.classList.remove('hidden');
  }

  /** 隐藏聊天面板。 */
  hide(): void {
    this.panel.classList.add('hidden');
  }

  /** 清空所有频道状态。 */
  clear(): void {
    this.setPersistenceScope(null);
  }

  /** 切换日志簿可见性。 */
  setLogbookVisible(visible: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * addMessage：处理Message并更新相关状态。
 * @param text string 参数说明。
 * @param from string 参数说明。
 * @param kind ChatMessageKind 参数说明。
 * @param options ChatMessageScope | ChatAddMessageOptions 选项参数。
 * @returns 返回 Promise，完成后得到Message。
 */


  async addMessage(
    text: string,
    from?: string,
    kind: ChatMessageKind = 'system',
    options?: ChatMessageScope | ChatAddMessageOptions,
  ): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 解析当前要显示的频道集合。 */
  private resolveChannels(entry: ChatStoredMessage): ChatChannel[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 刷新全部频道的标签和内容。 */
  private renderAllChannels(options?: {  
  /**
 * stickToBottom：stickToBottom相关字段。
 */
 stickToBottom?: boolean }): void {
    for (const channel of CHAT_CHANNELS) {
      if (channel === this.activeChannel) {
        this.renderChannel(channel, { stickToBottom: options?.stickToBottom === true });
        continue;
      }
      this.clearChannel(channel);
    }
  }  
  /**
 * renderChannel：执行Channel相关逻辑。
 * @param channel ChatChannel 参数说明。
 * @param options {
      stickToBottom?: boolean;
      preserveScrollFromLoadMore?: boolean;
      previousScrollHeight?: number;
      previousScrollTop?: number;
    } 选项参数。
 * @returns 无返回值，直接更新Channel相关状态。
 */


  private renderChannel(
    channel: ChatChannel,
    options?: {    
    /**
 * stickToBottom：stickToBottom相关字段。
 */

      stickToBottom?: boolean;      
      /**
 * preserveScrollFromLoadMore：preserveScrollFromLoadMore相关字段。
 */

      preserveScrollFromLoadMore?: boolean;      
      /**
 * previousScrollHeight：previouScrollHeight相关字段。
 */

      previousScrollHeight?: number;      
      /**
 * previousScrollTop：previouScrollTop相关字段。
 */

      previousScrollTop?: number;
    },
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      line.dataset.chatMessageId = entry.id;
      patchElementChildren(line, buildLineFragment(entry));
      fragment.appendChild(line);
    }
    patchElementChildren(log, Array.from(fragment.childNodes));

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

  /** 绑定伤害提示的悬停与触控交互。 */
  private bindDamageTooltip(log: HTMLElement): void {
    const resolvePill = (target: EventTarget | null): HTMLElement | null => (
      target instanceof Element
        ? target.closest<HTMLElement>('[data-chat-damage-tooltip-title]')
        : null
    );
    /** 展示伤害提示。 */
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

  /** 处理日志列表滚动，接近顶部时继续加载历史。 */
  private async handleLogScroll(channel: ChatChannel): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 切换当前频道。 */
  private switchChannel(channel: ChatChannel): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 判断日志列表是否接近底部。 */
  private isLogNearBottom(log: HTMLElement | undefined): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!log) {
      return true;
    }
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 24;
  }

  /** 提交当前输入框内容。 */
  private submit(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const message = this.input.value.trim();
    if (!message) {
      return;
    }
    this.onSend?.(message);
    this.input.value = '';
  }

  /** 构建消息的持久化键。 */
  private buildMessageKey(scopeId: string, messageId: string): string {
    return `${scopeId}\n${messageId}`;
  }

  /** 从本地缓存恢复最近消息。 */
  private async hydrateRecentMessages(scopeId: string, loadToken: number): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 裁剪频道缓存，保持消息数量上限。 */
  private trimChannelState(state: ChatChannelState, maxMessages: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (state.messages.length > maxMessages) {
      state.messages = state.messages.slice(-maxMessages);
      state.messageIds = new Set(state.messages.map((entry) => entry.id));
      state.hasLoadedAll = false;
    }
    state.loadedCount = Math.min(state.messages.length, maxMessages);
  }

  /** 清空单个频道的消息缓存。 */
  private clearChannel(channel: ChatChannel): void {
    const log = this.logs.get(channel);
    if (log) {
      patchElementHtml(log, '');
    }
  }

  /** 清理当前不活跃频道的缓存状态。 */
  private clearInactiveChannels(): void {
    for (const channel of CHAT_CHANNELS) {
      if (channel !== this.activeChannel) {
        this.clearChannel(channel);
      }
    }
  }
}
