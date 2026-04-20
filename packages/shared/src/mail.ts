import {
  MAIL_BATCH_OPERATION_MAX,
  MAIL_PAGE_SIZE_DEFAULT,
  MAIL_PAGE_SIZE_MAX,
} from './constants/ui/mail';
import type { MailAttachment, MailFilter, MailTemplateArg } from './mail-types';

/** 邮件投递范围，区分全服和定向投递。 */
export type MailTargetScope = 'global' | 'direct';
/** 邮件活动状态，表示模板是否仍可继续投递。 */
export type MailCampaignStatus = 'active' | 'cancelled';

/** 邮件模板令牌：文本片段或参数占位符。 */
export type MailTemplateToken =
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
 kind: 'arg';  
 /**
 * index：index相关字段。
 */
 index: number };

/** 邮件模板定义，保存标题和正文的可渲染骨架。 */
export interface MailTemplateDef {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * title：title名称或显示文本。
 */

  title: MailTemplateToken[];  
  /**
 * body：body相关字段。
 */

  body: MailTemplateToken[];
}

/** GM 端邮件模板下拉项。 */
export interface GmMailTemplateOption {
/**
 * templateId：templateID标识。
 */

  templateId: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * description：description相关字段。
 */

  description: string;
}

export const MAIL_FILTERS: MailFilter[] = ['all', 'unread', 'claimable'];

/** 新手邮件模板 ID。 */
export const MAIL_TEMPLATE_BEGINNER_JOURNEY_ID = 'mail.starter.beginner_journey.v1';
/** 天品灵根种子邮件模板 ID。 */
export const MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID = 'mail.item.heaven_root_seed.v1';
/** 神品灵根种子邮件模板 ID。 */
export const MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID = 'mail.item.divine_root_seed.v1';

export const MAIL_TEMPLATE_DEFS: Record<string, MailTemplateDef> = {
  'mail.welcome.v1': {
    id: 'mail.welcome.v1',
    title: [{ kind: 'text', value: '初入尘世' }],
    body: [
      { kind: 'text', value: '欢迎来到道劫余生。此地险路多，先收好这份起步资粮。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '邮件附件可直接收入背包；若背包已满，请先整理后再领取。' },
    ],
  },
  'mail.system.notice.v1': {
    id: 'mail.system.notice.v1',
    title: [{ kind: 'text', value: '系统通知' }],
    body: [{ kind: 'arg', index: 0 }],
  },
  'mail.reward.compensation.v1': {
    id: 'mail.reward.compensation.v1',
    title: [{ kind: 'text', value: '补偿发放' }],
    body: [
      { kind: 'text', value: '因 ' },
      { kind: 'arg', index: 0 },
      { kind: 'text', value: '，你收到了一份补偿，请查收附件。' },
    ],
  },
  'mail.reward.generic.v1': {
    id: 'mail.reward.generic.v1',
    title: [{ kind: 'text', value: '奖励到账' }],
    body: [{ kind: 'arg', index: 0 }],
  },
  [MAIL_TEMPLATE_BEGINNER_JOURNEY_ID]: {
    id: MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
    title: [{ kind: 'text', value: '初入道途' }],
    body: [
      { kind: 'text', value: '道途初启，先收好这份行装。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '附件包含当前开放阶段可获取的常用装备一套、非神通功法书各一本到，以及五枚苦修丹。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '若背包已满，请先整理后再领取。' },
    ],
  },
  [MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID]: {
    id: MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
    title: [{ kind: 'text', value: '天品灵根幼苗' }],
    body: [
      { kind: 'text', value: '司命台封存了一株天品灵根幼苗，请查收附件。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '此物会将五行灵根先定为 99，再逐系以五成概率催至 100，且至少保底一系圆满；同时逆天改命累计额外增加 10 次。使用时会按你当前逆天改命积累折减所需底蕴。' },
    ],
  },
  [MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID]: {
    id: MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
    title: [{ kind: 'text', value: '神品灵根幼苗' }],
    body: [
      { kind: 'text', value: '司命台封存了一株神品灵根幼苗，请查收附件。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '此物会将五行灵根全部定为 100，同时逆天改命累计额外增加 100 次。使用时同样会按你当前逆天改命积累折减所需底蕴。' },
    ],
  },
} as const;

export const GM_MAIL_TEMPLATE_OPTIONS: GmMailTemplateOption[] = [
  {
    templateId: '',
    label: '自定义邮件',
    description: '自填标题、正文和附件。',
  },
  {
    templateId: MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
    label: '初入道途',
    description: '发送常用装备一套、当前开放阶段非神通功法书各一本到，并附带五枚苦修丹。',
  },
  {
    templateId: MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
    label: '天品灵根幼苗',
    description: '固定附带一株天品灵根幼苗。',
  },
  {
    templateId: MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
    label: '神品灵根幼苗',
    description: '固定附带一株神品灵根幼苗。',
  },
];

/** 根据模板 ID 取回邮件模板定义。 */
export function getMailTemplateDef(templateId: string | null | undefined): MailTemplateDef | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!templateId) {
    return null;
  }
  return MAIL_TEMPLATE_DEFS[templateId] ?? null;
}

/** 把邮件模板参数转成可拼接的纯文本。 */
function stringifyMailArg(arg: MailTemplateArg): string {
  switch (arg.kind) {
    case 'text':
      return arg.value;
    case 'number':
      return Number.isFinite(arg.value) ? String(arg.value) : '0';
    case 'item':
      return arg.label?.trim() || arg.itemId;
    default:
      return '';
  }
}

/** 按参数替换渲染邮件模板 token。 */
function renderTokensPlain(tokens: MailTemplateToken[], args: MailTemplateArg[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let output = '';
  for (const token of tokens) {
    if (token.kind === 'text') {
      output += token.value;
      continue;
    }
    const arg = args[token.index];
    if (!arg) {
      continue;
    }
    output += stringifyMailArg(arg);
  }
  return output;
}

/** 渲染邮件标题文本，带默认兜底。 */
export function renderMailTitlePlain(
  templateId: string | null | undefined,
  args: MailTemplateArg[] | undefined,
  fallbackTitle?: string | null,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const template = getMailTemplateDef(templateId);
  if (!template) {
    return fallbackTitle?.trim() || '未命名邮件';
  }
  const rendered = renderTokensPlain(template.title, args ?? []);
  return rendered.trim() || fallbackTitle?.trim() || '未命名邮件';
}

/** 渲染邮件正文文本，带默认兜底。 */
export function renderMailBodyPlain(
  templateId: string | null | undefined,
  args: MailTemplateArg[] | undefined,
  fallbackBody?: string | null,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const template = getMailTemplateDef(templateId);
  if (!template) {
    return fallbackBody?.trim() || '';
  }
  const rendered = renderTokensPlain(template.body, args ?? []);
  return rendered.trim() || fallbackBody?.trim() || '';
}

/** 从正文生成适合列表展示的预览摘要。 */
export function buildMailPreviewSnippet(body: string, maxLength = 72): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/** 将邮件筛选条件归一到合法枚举。 */
export function normalizeMailFilter(filter: unknown): MailFilter {
  return typeof filter === 'string' && MAIL_FILTERS.includes(filter as MailFilter)
    ? filter as MailFilter
    : 'all';
}

/** 将邮件分页大小收敛到允许范围内。 */
export function normalizeMailPageSize(value: unknown): number {
  const requested = Number.isFinite(value) ? Math.floor(Number(value)) : MAIL_PAGE_SIZE_DEFAULT;
  return Math.min(MAIL_PAGE_SIZE_MAX, Math.max(1, requested || MAIL_PAGE_SIZE_DEFAULT));
}

/** 清洗邮件批量操作 ID 列表，并限制最大数量。 */
export function normalizeMailBatchIds(ids: unknown): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Array.isArray(ids)) {
    return [];
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const entry of ids) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    unique.push(trimmed);
    seen.add(trimmed);
    if (unique.length >= MAIL_BATCH_OPERATION_MAX) {
      break;
    }
  }
  return unique;
}
