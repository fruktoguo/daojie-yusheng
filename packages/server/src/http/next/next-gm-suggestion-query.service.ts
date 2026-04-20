import { Inject, Injectable } from '@nestjs/common';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';
/**
 * SuggestionReplyLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionReplyLike {
/**
 * content：内容相关字段。
 */

  content: string;
}
/**
 * SuggestionEntryLike：定义接口结构约束，明确可交付字段含义。
 */


interface SuggestionEntryLike {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * description：description相关字段。
 */

  description: string;  
  /**
 * authorName：author名称名称或显示文本。
 */

  authorName: string;  
  /**
 * replies：reply相关字段。
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
 * page：page相关字段。
 */

  page?: unknown;  
  /**
 * pageSize：数量或计量字段。
 */

  pageSize?: unknown;  
  /**
 * keyword：keyword相关字段。
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
 * @returns 无返回值，完成实例初始化。
 */

  constructor(@Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike) {}  
  /**
 * getSuggestions：读取Suggestion。
 * @param query SuggestionQueryInput | null 参数说明。
 * @returns 无返回值，完成Suggestion的读取/组装。
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
 * clamp：执行clamp相关逻辑。
 * @param value number 参数说明。
 * @param min number 参数说明。
 * @param max number 参数说明。
 * @returns 返回clamp。
 */


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
