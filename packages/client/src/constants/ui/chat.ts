/**
 * 聊天面板的本地缓存、频道与滚动加载常量。
 */

export const CHAT_LOG_STORAGE_KEY = 'mud:chat-log:v1';
export const CHAT_LOG_STORAGE_VERSION = 1;
export const CHAT_LOG_MAX_VISIBLE_MESSAGES = 100;
export const CHAT_LOG_LOAD_BATCH_SIZE = 100;
export const CHAT_LOG_MAX_PERSISTED_MESSAGES = 10_000;
export const CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX = 24;

export const CHAT_CHANNELS = ['system', 'combat', 'nearby', 'world', 'sect'] as const;
export type ChatChannel = typeof CHAT_CHANNELS[number];

export const CHAT_MESSAGE_KINDS = ['system', 'chat', 'quest', 'combat', 'loot'] as const;
export type ChatMessageKind = typeof CHAT_MESSAGE_KINDS[number];

export const CHAT_MESSAGE_SCOPES = ['nearby', 'world', 'sect'] as const;
export type ChatMessageScope = typeof CHAT_MESSAGE_SCOPES[number];

export interface ChatStoredMessage {
  id: string;
  at: number;
  text: string;
  from?: string;
  kind: ChatMessageKind;
  scope?: ChatMessageScope;
}

export const DEFAULT_CHAT_CHANNEL: ChatChannel = 'system';
