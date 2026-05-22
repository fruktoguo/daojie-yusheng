/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 建议查询服务。
 * 提供分页、关键词过滤的建议列表查询，供 GM 面板展示玩家反馈。
 */
import { Inject, Injectable } from '@nestjs/common';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';

/** 建议回复结构。 */
interface SuggestionReplyLike {
  content: string;
}

/** 建议条目结构。 */
interface SuggestionEntryLike {
  title: string;
  description: string;
  authorName: string;
  replies: SuggestionReplyLike[];
}

/** 建议运行时服务端口。 */
interface SuggestionRuntimeServiceLike {
  getAll(): SuggestionEntryLike[];
}

/** 建议查询输入参数。 */
interface SuggestionQueryInput {
  page?: unknown;
  pageSize?: unknown;
  keyword?: unknown;
}

/** GM 建议查询服务：分页、关键词过滤的建议列表。 */
@Injectable()
export class NativeGmSuggestionQueryService {
  constructor(@Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike) {}

  /** 按分页和关键词过滤返回建议列表。 */
  getSuggestions(query?: SuggestionQueryInput | null) {
    const page = Math.max(1, Math.trunc(Number(query?.page) || 1));
    const pageSize = clamp(Math.trunc(Number(query?.pageSize) || 10), 1, 50);
    const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';
    const normalizedKeyword = keyword.toLowerCase();
    const filtered = this.suggestionRuntimeService.getAll().filter((entry) => {
      if (!normalizedKeyword) {
        return true;
      }

      return (
        entry.title.toLowerCase().includes(normalizedKeyword)
        || entry.description.toLowerCase().includes(normalizedKeyword)
        || entry.authorName.toLowerCase().includes(normalizedKeyword)
        || entry.replies.some((reply) => reply.content.toLowerCase().includes(normalizedKeyword))
      );
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = clamp(page, 1, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      keyword,
    };
  }
}
/** 将数值限制在 [min, max] 范围内。 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
