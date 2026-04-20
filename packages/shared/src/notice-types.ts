/** 通知消息类型。 */
export type NoticeKind = 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';

/** 单条通知消息视图。 */
export interface NoticeItemView {
/**
 * id：NoticeItemView 内部字段。
 */

  id?: number;  
  /**
 * messageId：NoticeItemView 内部字段。
 */

  messageId?: string;  
  /**
 * kind：NoticeItemView 内部字段。
 */

  kind: NoticeKind;  
  /**
 * text：NoticeItemView 内部字段。
 */

  text: string;  
  /**
 * from：NoticeItemView 内部字段。
 */

  from?: string;  
  /**
 * occurredAt：NoticeItemView 内部字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：NoticeItemView 内部字段。
 */

  persistUntilAck?: boolean;
}

/** 通知批次视图。 */
export interface NoticeView {
/**
 * items：NoticeView 内部字段。
 */

  items: NoticeItemView[];
}

/** 系统消息视图。 */
export interface SystemMessageView {
/**
 * id：SystemMessageView 内部字段。
 */

  id?: string;  
  /**
 * text：SystemMessageView 内部字段。
 */

  text: string;  
  /**
 * kind：SystemMessageView 内部字段。
 */

  kind?: NoticeKind;  
  /**
 * from：SystemMessageView 内部字段。
 */

  from?: string;  
  /**
 * occurredAt：SystemMessageView 内部字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：SystemMessageView 内部字段。
 */

  persistUntilAck?: boolean;  
  /**
 * floating：SystemMessageView 内部字段。
 */

  floating?: {  
  /**
 * x：SystemMessageView 内部字段。
 */

    x: number;    
    /**
 * y：SystemMessageView 内部字段。
 */

    y: number;    
    /**
 * text：SystemMessageView 内部字段。
 */

    text: string;    
    /**
 * color：SystemMessageView 内部字段。
 */

    color?: string;
  };
}
