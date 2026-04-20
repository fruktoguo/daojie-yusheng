/** 通知消息类型。 */
export type NoticeKind = 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';

/** 单条通知消息视图。 */
export interface NoticeItemView {
/**
 * id：ID标识。
 */

  id?: number;  
  /**
 * messageId：messageID标识。
 */

  messageId?: string;  
  /**
 * kind：kind相关字段。
 */

  kind: NoticeKind;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * from：from相关字段。
 */

  from?: string;  
  /**
 * occurredAt：occurredAt相关字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：persistUntilAck相关字段。
 */

  persistUntilAck?: boolean;
}

/** 通知批次视图。 */
export interface NoticeView {
/**
 * items：集合字段。
 */

  items: NoticeItemView[];
}

/** 系统消息视图。 */
export interface SystemMessageView {
/**
 * id：ID标识。
 */

  id?: string;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: NoticeKind;  
  /**
 * from：from相关字段。
 */

  from?: string;  
  /**
 * occurredAt：occurredAt相关字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：persistUntilAck相关字段。
 */

  persistUntilAck?: boolean;  
  /**
 * floating：floating相关字段。
 */

  floating?: {  
  /**
 * x：x相关字段。
 */

    x: number;    
    /**
 * y：y相关字段。
 */

    y: number;    
    /**
 * text：text名称或显示文本。
 */

    text: string;    
    /**
 * color：color相关字段。
 */

    color?: string;
  };
}
