/**
 * 邮件共享类型：承接附件、模板参数与列表/详情视图。
 */
/** 邮件列表过滤 */
export type MailFilter = 'all' | 'unread' | 'claimable';

/** 邮件附件 */
export interface MailAttachment {
  itemId: string;
  count: number;
}

/** 邮件正文模板参数 */
export type MailTemplateArg =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'item'; itemId: string; label?: string; count?: number };

/** 邮件概览摘要 */
export interface MailSummaryView {
  unreadCount: number;
  claimableCount: number;
  revision: number;
}

/** 邮件列表条目 */
export interface MailListEntryView {
  mailId: string;
  title: string;
  summary: string;
  senderLabel: string;
  createdAt: number;
  expireAt?: number | null;
  hasAttachments: boolean;
  read: boolean;
  claimed: boolean;
}

/** 邮件分页结果 */
export interface MailPageView {
  items: MailListEntryView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filter: MailFilter;
}

/** 邮件详情 */
export interface MailDetailView {
  mailId: string;
  senderLabel: string;
  createdAt: number;
  expireAt?: number | null;
  templateId?: string | null;
  args: MailTemplateArg[];
  fallbackTitle?: string | null;
  fallbackBody?: string | null;
  attachments: MailAttachment[];
  read: boolean;
  claimed: boolean;
  deletable: boolean;
}
