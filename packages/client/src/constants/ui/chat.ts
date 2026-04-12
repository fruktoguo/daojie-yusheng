/**
 * 聊天面板的本地缓存、频道与滚动加载常量。
 */

export const CHAT_LOG_STORAGE_KEY = 'mud:chat-log:v1';
/** CHAT_LOG_MAX_VISIBLE_MESSAGES：定义该变量以承载业务值。 */
export const CHAT_LOG_MAX_VISIBLE_MESSAGES = 100;
/** CHAT_LOG_LOAD_BATCH_SIZE：定义该变量以承载业务值。 */
export const CHAT_LOG_LOAD_BATCH_SIZE = 100;
/** CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL：定义该变量以承载业务值。 */
export const CHAT_LOG_MAX_PERSISTED_MESSAGES_PER_CHANNEL = 1_000;
/** CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX：定义该变量以承载业务值。 */
export const CHAT_LOG_SCROLL_TOP_LOAD_THRESHOLD_PX = 24;

/** CHAT_CHANNELS：定义该变量以承载业务值。 */
export const CHAT_CHANNELS = ['system', 'combat', 'grudge', 'nearby', 'world', 'sect'] as const;
/** ChatChannel：定义该类型的结构与数据语义。 */
export type ChatChannel = typeof CHAT_CHANNELS[number];

/** CHAT_MESSAGE_KINDS：定义该变量以承载业务值。 */
export const CHAT_MESSAGE_KINDS = ['system', 'chat', 'quest', 'combat', 'loot', 'grudge'] as const;
/** ChatMessageKind：定义该类型的结构与数据语义。 */
export type ChatMessageKind = typeof CHAT_MESSAGE_KINDS[number];

/** CHAT_MESSAGE_SCOPES：定义该变量以承载业务值。 */
export const CHAT_MESSAGE_SCOPES = ['nearby', 'world', 'sect'] as const;
/** ChatMessageScope：定义该类型的结构与数据语义。 */
export type ChatMessageScope = typeof CHAT_MESSAGE_SCOPES[number];

/** ChatStoredMessage：定义该接口的能力与字段约束。 */
export interface ChatStoredMessage {
/** id：定义该变量以承载业务值。 */
  id: string;
/** at：定义该变量以承载业务值。 */
  at: number;
/** text：定义该变量以承载业务值。 */
  text: string;
  from?: string;
/** kind：定义该变量以承载业务值。 */
  kind: ChatMessageKind;
  scope?: ChatMessageScope;
}

/** DEFAULT_CHAT_CHANNEL：定义该变量以承载业务值。 */
export const DEFAULT_CHAT_CHANNEL: ChatChannel = 'system';

