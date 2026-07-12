/**
 * 宗门待审批申请分页请求代际状态。
 *
 * 只管理请求身份与回包契约，不持有 DOM 或宗门权威状态，便于独立验证乱序响应。
 */
import {
  SECT_APPLICATION_PAGE_DEFAULT_LIMIT,
  SECT_APPLICATION_PAGE_MAX_LIMIT,
  SECT_APPLICATION_SEARCH_MAX_LENGTH,
  type C2S_RequestSectApplicationPage,
  type S2C_SectApplicationPage,
} from '@mud/shared';

const SECT_APPLICATION_REQUEST_ID_MAX_LENGTH = 80;

export interface SectApplicationPagePendingRequest {
  requestId: string;
  sectId: string;
  search: string;
  offset: number;
  limit: number;
  minimumRevision: number;
}

export type SectApplicationPageResponseDecision = 'accepted' | 'invalid-current' | 'ignored';

export function normalizeSectApplicationPageSearch(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, SECT_APPLICATION_SEARCH_MAX_LENGTH).toLowerCase()
    : '';
}

export function normalizeSectApplicationPageOffset(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeSectApplicationPageLimit(
  value: unknown,
  fallback = SECT_APPLICATION_PAGE_DEFAULT_LIMIT,
): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.min(SECT_APPLICATION_PAGE_MAX_LIMIT, Math.trunc(Number(fallback) || 1)));
  }
  return Math.max(1, Math.min(SECT_APPLICATION_PAGE_MAX_LIMIT, parsed));
}

export function normalizeSectApplicationRevision(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** 优先使用宗门管理摘要中的权威宗门 ID，玩家投影仅作为旧数据回退。 */
export function resolveSectApplicationPageScopeSectId(
  managementSectId: unknown,
  projectedPlayerSectId: unknown,
): string {
  const normalizedManagementSectId = typeof managementSectId === 'string' ? managementSectId.trim() : '';
  if (normalizedManagementSectId) {
    return normalizedManagementSectId;
  }
  return typeof projectedPlayerSectId === 'string' ? projectedPlayerSectId.trim() : '';
}

/** 同一时刻只接受当前请求且不落后于已知宗门版本的响应。 */
export class SectApplicationPageRequestState {
  private sequence = 0;
  private pending: SectApplicationPagePendingRequest | null = null;

  reset(): void {
    this.pending = null;
  }

  getPending(): Readonly<SectApplicationPagePendingRequest> | null {
    return this.pending;
  }

  isPending(): boolean {
    return this.pending !== null;
  }

  begin(input: {
    sectId: string;
    search: string;
    offset: number;
    limit: number;
    minimumRevision: number;
    now?: number;
  }): C2S_RequestSectApplicationPage {
    const now = Number.isFinite(Number(input.now))
      ? Math.max(0, Math.trunc(Number(input.now)))
      : Date.now();
    const requestId = `sect-applications:${now}:${this.sequence += 1}`;
    const pending: SectApplicationPagePendingRequest = {
      requestId: requestId.slice(0, SECT_APPLICATION_REQUEST_ID_MAX_LENGTH),
      sectId: typeof input.sectId === 'string' ? input.sectId.trim() : '',
      search: normalizeSectApplicationPageSearch(input.search),
      offset: normalizeSectApplicationPageOffset(input.offset),
      limit: normalizeSectApplicationPageLimit(input.limit),
      minimumRevision: normalizeSectApplicationRevision(input.minimumRevision),
    };
    this.pending = pending;
    return {
      requestId: pending.requestId,
      search: pending.search,
      offset: pending.offset,
      limit: pending.limit,
    };
  }

  cancel(requestId: string): boolean {
    if (!this.pending || this.pending.requestId !== requestId) {
      return false;
    }
    this.pending = null;
    return true;
  }

  resolve(page: S2C_SectApplicationPage): SectApplicationPageResponseDecision {
    const pending = this.pending;
    const requestId = typeof page.requestId === 'string' ? page.requestId.trim() : '';
    if (!pending || !requestId || requestId !== pending.requestId) {
      return 'ignored';
    }

    this.pending = null;
    if (
      page.sectId !== pending.sectId
      || normalizeSectApplicationPageSearch(page.search) !== pending.search
      || normalizeSectApplicationPageOffset(page.offset) !== pending.offset
      || normalizeSectApplicationPageLimit(page.limit) !== pending.limit
      || normalizeSectApplicationRevision(page.revision) < pending.minimumRevision
    ) {
      return 'invalid-current';
    }
    return 'accepted';
  }
}
