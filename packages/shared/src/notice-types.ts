/** 通知消息类型。 */
export type NoticeKind = 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';

/** 单条通知消息视图。 */
export interface NoticeItemView {
  id?: number;
  messageId?: string;
  kind: NoticeKind;
  text: string;
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
}

/** 通知批次视图。 */
export interface NoticeView {
  items: NoticeItemView[];
}

/** 系统消息视图。 */
export interface SystemMessageView {
  id?: string;
  text: string;
  kind?: NoticeKind;
  from?: string;
  occurredAt?: number;
  persistUntilAck?: boolean;
  floating?: {
    x: number;
    y: number;
    text: string;
    color?: string;
  };
}
