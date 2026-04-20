import { Inject, Injectable } from '@nestjs/common';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
/**
 * SuggestionReplyLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionReplyLike {
/**
 * content：SuggestionReplyLike 内部字段。
 */

  content: string;
}
/**
 * SuggestionEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionEntryLike {
/**
 * title：SuggestionEntryLike 内部字段。
 */

  title: string;  
  /**
 * description：SuggestionEntryLike 内部字段。
 */

  description: string;  
  /**
 * authorName：SuggestionEntryLike 内部字段。
 */

  authorName: string;  
  /**
 * replies：SuggestionEntryLike 内部字段。
 */

  replies: SuggestionReplyLike[];
}
/**
 * SuggestionRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionRuntimeServiceLike {
  getAll(): SuggestionEntryLike[];
}
/**
 * SuggestionQueryInput：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionQueryInput {
/**
 * page：SuggestionQueryInput 内部字段。
 */

  page?: unknown;  
  /**
 * pageSize：SuggestionQueryInput 内部字段。
 */

  pageSize?: unknown;  
  /**
 * keyword：SuggestionQueryInput 内部字段。
 */

  keyword?: unknown;
}
/**
 * NextGmSuggestionQueryService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NextGmSuggestionQueryService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param suggestionRuntimeService SuggestionRuntimeServiceLike 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(@Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike) {}  
  /**
 * getSuggestions：按给定条件读取/查询数据。
 * @param query SuggestionQueryInput | null 参数说明。
 * @returns 函数返回值。
 */


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
/**
 * clamp：执行核心业务逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns number。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
