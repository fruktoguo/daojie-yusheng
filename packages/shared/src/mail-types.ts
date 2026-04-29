/**
 * 邮件共享类型：承接附件、模板参数与列表/详情视图。
 */
/** 邮件列表过滤 */
export type MailFilter = 'all' | 'unread' | 'claimable';

/** 邮件附件 */
export interface MailAttachment {
/**
 * itemId：道具ID标识。
 */

  itemId: string;  
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 邮件正文模板参数 */
export type MailTemplateArg =
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'text';  
 /**
 * value：值数值。
 */
 value: string }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'number';  
 /**
 * value：值数值。
 */
 value: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'item';  
 /**
 * itemId：道具ID标识。
 */
 itemId: string;  
 /**
 * label：label名称或显示文本。
 */
 label?: string;  
 /**
 * count：数量或计量字段。
 */
 count?: number };

/** 邮件概览摘要 */
export interface MailSummaryView {
/**
 * unreadCount：数量或计量字段。
 */

  unreadCount: number;  
  /**
 * claimableCount：数量或计量字段。
 */

  claimableCount: number;  
  /**
 * revision：revision相关字段。
 */

  revision: number;
}

/** 邮件列表条目 */
export interface MailListEntryView {
/**
 * mailId：邮件ID标识。
 */

  mailId: string;  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * summary：摘要状态或数据块。
 */

  summary: string;  
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel: string;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;  
  /**
 * expireAt：expireAt相关字段。
 */

  expireAt?: number | null;  
  /**
 * hasAttachments：启用开关或状态标识。
 */

  hasAttachments: boolean;  
  /**
 * read：read相关字段。
 */

  read: boolean;  
  /**
 * claimed：claimed相关字段。
 */

  claimed: boolean;
}

/** 邮件分页结果 */
export interface MailPageView {
/**
 * items：集合字段。
 */

  items: MailListEntryView[];  
  /**
 * total：数量或计量字段。
 */

  total: number;  
  /**
 * page：page相关字段。
 */

  page: number;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize: number;  
  /**
 * totalPages：totalPage相关字段。
 */

  totalPages: number;  
  /**
 * filter：filter相关字段。
 */

  filter: MailFilter;
}

/** 邮件详情 */
export interface MailDetailView {
/**
 * mailId：邮件ID标识。
 */

  mailId: string;  
  /**
 * senderLabel：senderLabel名称或显示文本。
 */

  senderLabel: string;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: number;  
  /**
 * expireAt：expireAt相关字段。
 */

  expireAt?: number | null;  
  /**
 * templateId：templateID标识。
 */

  templateId?: string | null;  
  /**
 * args：arg相关字段。
 */

  args: MailTemplateArg[];  
  /**
 * fallbackTitle：fallbackTitle名称或显示文本。
 */

  fallbackTitle?: string | null;  
  /**
 * fallbackBody：fallbackBody相关字段。
 */

  fallbackBody?: string | null;  
  /**
 * attachments：attachment相关字段。
 */

  attachments: MailAttachment[];  
  /**
 * read：read相关字段。
 */

  read: boolean;  
  /**
 * claimed：claimed相关字段。
 */

  claimed: boolean;  
  /**
 * deletable：缓存或索引容器。
 */

  deletable: boolean;
}
