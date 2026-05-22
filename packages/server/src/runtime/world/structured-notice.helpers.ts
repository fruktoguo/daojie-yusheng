/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
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
