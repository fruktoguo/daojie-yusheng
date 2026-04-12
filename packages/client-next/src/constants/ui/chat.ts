/**
 * 聊天面板的本地缓存、频道与滚动加载常量。
 */

export const CHAT_LOG_STORAGE_KEY = 'mud:chat-log:v1';
export const CHAT_LOG_MAX_VISIBLE_MESSAGES = 100;
export const CHAT_LOG_LOAD_BATCH_SIZE = 100;
export const CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL = 1_000;
export const CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX = 24;

export const CHAT_CHANNELS = ['system', 'combat', 'grudge', 'nearby', 'world', 'sect'] as const;
/** ChatChannel：定义该类型的结构与数据语义。 */
export type ChatChannel = typeof CHAT_CHANNELS[number];

export const CHAT_MESSAGE_KINDS = ['system', 'chat', 'quest', 'combat', 'loot', 'grudge', 'success', 'warn', 'travel'] as const;
/** ChatMessageKind：定义该类型的结构与数据语义。 */
export type ChatMessageKind = typeof CHAT_MESSAGE_KINDS[number];

export const CHAT_MESSAGE_SCOPES = ['nearby', 'world', 'sect'] as const;
/** ChatMessageScope：定义该类型的结构与数据语义。 */
export type ChatMessageScope = typeof CHAT_MESSAGE_SCOPES[number];

/** ChatStoredMessage：定义该接口的能力与字段约束。 */
export interface ChatStoredMessage {
  id: string;
  at: number;
  text: string;
  from?: string;
  kind: ChatMessageKind;
  scope?: ChatMessageScope;
}

export const DEFAULT_CHAT_CHANNEL: ChatChannel = 'system';

