/**
 * 结构化通知构建辅助函数
 * 负责将通知 key、变量、胶囊配置组装为标准结构化载荷，供服务端统一入队
 */
import type { NoticePillConfig, NoticeKind, StructuredNoticePayload } from '@mud/shared';

/** 结构化通知入队参数。 */
export interface StructuredNoticeInput {
  kind: NoticeKind;
  text: string;
  structured: StructuredNoticePayload;
}

/**
 * 构建结构化通知入队参数。
 * text 作为 fallback 纯文本（兼容旧客户端/日志），structured 为结构化载荷。
 */
export function buildStructuredNotice(
  kind: NoticeKind,
  key: string,
  fallbackText: string,
  opts?: { vars?: Record<string, string | number>; pills?: NoticePillConfig[]; badges?: string[] },
): StructuredNoticeInput {
  return {
    kind,
    text: fallbackText,
    structured: {
      key,
      ...(opts?.vars ? { vars: opts.vars } : undefined),
      ...(opts?.pills ? { pills: opts.pills } : undefined),
      ...(opts?.badges ? { badges: opts.badges } : undefined),
    },
  };
}
