/**
 * 邮件共享类型：承接附件、模板参数与列表/详情视图。
 */
/** 邮件列表过滤 */
export type MailFilter = 'all' | 'unread' | 'claimable';

/** 邮件附件 */
export interface MailAttachment {
/**
 * itemId：MailAttachment 内部字段。
 */

  itemId: string;  
  /**
 * count：MailAttachment 内部字段。
 */

  count: number;
}

/** 邮件正文模板参数 */
export type MailTemplateArg =
  | {  
  /**
 * kind：对象字段。
 */
 kind: 'text';  
 /**
 * value：对象字段。
 */
 value: string }
  | {  
  /**
 * kind：对象字段。
 */
 kind: 'number';  
 /**
 * value：对象字段。
 */
 value: number }
  | {  
  /**
 * kind：对象字段。
 */
 kind: 'item';  
 /**
 * itemId：对象字段。
 */
 itemId: string;  
 /**
 * label：对象字段。
 */
 label?: string;  
 /**
 * count：对象字段。
 */
 count?: number };

/** 邮件概览摘要 */
export interface MailSummaryView {
/**
 * unreadCount：MailSummaryView 内部字段。
 */

  unreadCount: number;  
  /**
 * claimableCount：MailSummaryView 内部字段。
 */

  claimableCount: number;  
  /**
 * revision：MailSummaryView 内部字段。
 */

  revision: number;
}

/** 邮件列表条目 */
export interface MailListEntryView {
/**
 * mailId：MailListEntryView 内部字段。
 */

  mailId: string;  
  /**
 * title：MailListEntryView 内部字段。
 */

  title: string;  
  /**
 * summary：MailListEntryView 内部字段。
 */

  summary: string;  
  /**
 * senderLabel：MailListEntryView 内部字段。
 */

  senderLabel: string;  
  /**
 * createdAt：MailListEntryView 内部字段。
 */

  createdAt: number;  
  /**
 * expireAt：MailListEntryView 内部字段。
 */

  expireAt?: number | null;  
  /**
 * hasAttachments：MailListEntryView 内部字段。
 */

  hasAttachments: boolean;  
  /**
 * read：MailListEntryView 内部字段。
 */

  read: boolean;  
  /**
 * claimed：MailListEntryView 内部字段。
 */

  claimed: boolean;
}

/** 邮件分页结果 */
export interface MailPageView {
/**
 * items：MailPageView 内部字段。
 */

  items: MailListEntryView[];  
  /**
 * total：MailPageView 内部字段。
 */

  total: number;  
  /**
 * page：MailPageView 内部字段。
 */

  page: number;  
  /**
 * pageSize：MailPageView 内部字段。
 */

  pageSize: number;  
  /**
 * totalPages：MailPageView 内部字段。
 */

  totalPages: number;  
  /**
 * filter：MailPageView 内部字段。
 */

  filter: MailFilter;
}

/** 邮件详情 */
export interface MailDetailView {
/**
 * mailId：MailDetailView 内部字段。
 */

  mailId: string;  
  /**
 * senderLabel：MailDetailView 内部字段。
 */

  senderLabel: string;  
  /**
 * createdAt：MailDetailView 内部字段。
 */

  createdAt: number;  
  /**
 * expireAt：MailDetailView 内部字段。
 */

  expireAt?: number | null;  
  /**
 * templateId：MailDetailView 内部字段。
 */

  templateId?: string | null;  
  /**
 * args：MailDetailView 内部字段。
 */

  args: MailTemplateArg[];  
  /**
 * fallbackTitle：MailDetailView 内部字段。
 */

  fallbackTitle?: string | null;  
  /**
 * fallbackBody：MailDetailView 内部字段。
 */

  fallbackBody?: string | null;  
  /**
 * attachments：MailDetailView 内部字段。
 */

  attachments: MailAttachment[];  
  /**
 * read：MailDetailView 内部字段。
 */

  read: boolean;  
  /**
 * claimed：MailDetailView 内部字段。
 */

  claimed: boolean;  
  /**
 * deletable：MailDetailView 内部字段。
 */

  deletable: boolean;
}
