/**
 * 聊天面板的本地缓存、频道与滚动加载常量。
 */

export const CHAT_LOG_STORAGE_KEY = 'mud:chat-log:v1';
/** CHAT_LOG_MAX_VISIBLE_MESSAGES：聊天日志最大可见MESSAGES。 */
export const CHAT_LOG_MAX_VISIBLE_MESSAGES = 100;
/** CHAT_LOG_LOAD_BATCH_SIZE：聊天日志LOAD BATCH SIZE。 */
export const CHAT_LOG_LOAD_BATCH_SIZE = 100;
/** CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL：聊天日志最大PERSISTED MESSAGES PER CHANNEL。 */
export const CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL = 1_000;
/** CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX：聊天日志SCROLL TOP LOAD THRESHOLD PX。 */
export const CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX = 24;

export const CHAT_CHANNELS = ['system', 'combat', 'grudge', 'nearby', 'world', 'sect'] as const;
/** ChatChannel：聊天频道标识。 */
export type ChatChannel = typeof CHAT_CHANNELS[number];

export const CHAT_MESSAGE_KINDS = ['system', 'chat', 'quest', 'combat', 'loot', 'grudge', 'success', 'warn', 'travel'] as const;
/** ChatMessageKind：分类枚举。 */
export type ChatMessageKind = typeof CHAT_MESSAGE_KINDS[number];

export const CHAT_MESSAGE_SCOPES = ['nearby', 'world', 'sect'] as const;
/** ChatMessageScope：分类枚举。 */
export type ChatMessageScope = typeof CHAT_MESSAGE_SCOPES[number];

/** ChatStoredMessage：聊天持久化消息。 */
export interface ChatStoredMessage {
/**
 * id：ChatStoredMessage 内部字段。
 */

  id: string;  
  /**
 * at：ChatStoredMessage 内部字段。
 */

  at: number;  
  /**
 * text：ChatStoredMessage 内部字段。
 */

  text: string;  
  /**
 * from：ChatStoredMessage 内部字段。
 */

  from?: string;  
  /**
 * kind：ChatStoredMessage 内部字段。
 */

  kind: ChatMessageKind;  
  /**
 * scope：ChatStoredMessage 内部字段。
 */

  scope?: ChatMessageScope;
}

/** DEFAULT_CHAT_CHANNEL：聊天CHANNEL默认值。 */
export const DEFAULT_CHAT_CHANNEL: ChatChannel = 'system';
