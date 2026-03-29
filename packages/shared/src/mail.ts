import {
  MAIL_BATCH_OPERATION_MAX,
  MAIL_PAGE_SIZE_DEFAULT,
  MAIL_PAGE_SIZE_MAX,
} from './constants/ui/mail';
import type { MailAttachment, MailFilter, MailTemplateArg } from './types';

export type MailTargetScope = 'global' | 'direct';
export type MailCampaignStatus = 'active' | 'cancelled';

export type MailTemplateToken =
  | { kind: 'text'; value: string }
  | { kind: 'arg'; index: number };

export interface MailTemplateDef {
  id: string;
  title: MailTemplateToken[];
  body: MailTemplateToken[];
}

export interface GmMailTemplateOption {
  templateId: string;
  label: string;
  description: string;
}

export const MAIL_FILTERS: MailFilter[] = ['all', 'unread', 'claimable'];

export const MAIL_TEMPLATE_BEGINNER_JOURNEY_ID = 'mail.starter.beginner_journey.v1';

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
      { kind: 'text', value: '附件包含当前全部装备各一件、除神通外的功法书各一本到，以及五枚苦修丹。' },
      { kind: 'text', value: '\n\n' },
      { kind: 'text', value: '若背包已满，请先整理后再领取。' },
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
    description: '发送全部装备各一件、全部非神通功法书各一本到，并附带五枚苦修丹。',
  },
];

export function getMailTemplateDef(templateId: string | null | undefined): MailTemplateDef | null {
  if (!templateId) {
    return null;
  }
  return MAIL_TEMPLATE_DEFS[templateId] ?? null;
}

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

function renderTokensPlain(tokens: MailTemplateToken[], args: MailTemplateArg[]): string {
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

export function renderMailTitlePlain(
  templateId: string | null | undefined,
  args: MailTemplateArg[] | undefined,
  fallbackTitle?: string | null,
): string {
  const template = getMailTemplateDef(templateId);
  if (!template) {
    return fallbackTitle?.trim() || '未命名邮件';
  }
  const rendered = renderTokensPlain(template.title, args ?? []);
  return rendered.trim() || fallbackTitle?.trim() || '未命名邮件';
}

export function renderMailBodyPlain(
  templateId: string | null | undefined,
  args: MailTemplateArg[] | undefined,
  fallbackBody?: string | null,
): string {
  const template = getMailTemplateDef(templateId);
  if (!template) {
    return fallbackBody?.trim() || '';
  }
  const rendered = renderTokensPlain(template.body, args ?? []);
  return rendered.trim() || fallbackBody?.trim() || '';
}

export function buildMailPreviewSnippet(body: string, maxLength = 72): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeMailFilter(filter: unknown): MailFilter {
  return typeof filter === 'string' && MAIL_FILTERS.includes(filter as MailFilter)
    ? filter as MailFilter
    : 'all';
}

export function normalizeMailPageSize(value: unknown): number {
  const requested = Number.isFinite(value) ? Math.floor(Number(value)) : MAIL_PAGE_SIZE_DEFAULT;
  return Math.min(MAIL_PAGE_SIZE_MAX, Math.max(1, requested || MAIL_PAGE_SIZE_DEFAULT));
}

export function normalizeMailBatchIds(ids: unknown): string[] {
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
