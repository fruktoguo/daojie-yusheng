import { Inject, Injectable } from '@nestjs/common';
import { SuggestionRuntimeService } from '../../runtime/suggestion/suggestion-runtime.service';

interface SuggestionReplyLike {
  content: string;
}

interface SuggestionEntryLike {
  title: string;
  description: string;
  authorName: string;
  replies: SuggestionReplyLike[];
}

interface SuggestionRuntimeServiceLike {
  getAll(): SuggestionEntryLike[];
}

interface SuggestionQueryInput {
  page?: unknown;
  pageSize?: unknown;
  keyword?: unknown;
}

@Injectable()
export class NextGmSuggestionQueryService {
  constructor(@Inject(SuggestionRuntimeService) private readonly suggestionRuntimeService: SuggestionRuntimeServiceLike) {}

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
