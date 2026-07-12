/**
 * 背包分页请求代际状态。
 *
 * 该模块只管理请求身份和回包契约，不持有 DOM 或玩家权威状态，便于独立证明乱序边界。
 */
import type {
  C2S_RequestInventoryPage,
  InventoryPageFilterView,
  S2C_InventoryPage,
} from '@mud/shared';

const INVENTORY_PAGE_MAX_LIMIT = 30;
const INVENTORY_PAGE_REQUEST_ID_MAX_LENGTH = 80;

export interface InventoryPagePendingRequest {
  requestId: string;
  filter: InventoryPageFilterView;
  search: string;
  offset: number;
  limit: number;
  knownRevision: number | null;
}

export type InventoryPageResponseDecision = 'accepted' | 'invalid-current' | 'ignored';

export function normalizeInventoryPageSearch(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, 64).toLowerCase()
    : '';
}

export function normalizeInventoryPageOffset(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeInventoryPageLimit(value: unknown, fallback = INVENTORY_PAGE_MAX_LIMIT): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Math.min(INVENTORY_PAGE_MAX_LIMIT, Math.trunc(Number(fallback) || 1)));
  }
  return Math.max(1, Math.min(INVENTORY_PAGE_MAX_LIMIT, parsed));
}

export function normalizeInventoryRevision(value: unknown): number | null {
  const revision = Math.trunc(Number(value));
  return Number.isFinite(revision) && revision > 0 ? revision : null;
}

/** 同一时刻只允许一个可接受回包；旧代际和无身份回包始终忽略。 */
export class InventoryPageRequestState {
  private sequence = 0;
  private pending: InventoryPagePendingRequest | null = null;

  reset(): void {
    this.pending = null;
  }

  getPending(): Readonly<InventoryPagePendingRequest> | null {
    return this.pending;
  }

  isPending(): boolean {
    return this.pending !== null;
  }

  begin(input: {
    filter: InventoryPageFilterView;
    search: string;
    offset: number;
    limit: number;
    knownRevision?: number | null;
    now?: number;
  }): C2S_RequestInventoryPage {
    const now = Number.isFinite(Number(input.now)) ? Math.max(0, Math.trunc(Number(input.now))) : Date.now();
    const requestId = `inventory:${now}:${this.sequence += 1}`;
    const pending: InventoryPagePendingRequest = {
      requestId: requestId.slice(0, INVENTORY_PAGE_REQUEST_ID_MAX_LENGTH),
      filter: input.filter,
      search: normalizeInventoryPageSearch(input.search),
      offset: normalizeInventoryPageOffset(input.offset),
      limit: normalizeInventoryPageLimit(input.limit),
      knownRevision: normalizeInventoryRevision(input.knownRevision),
    };
    this.pending = pending;
    return {
      filter: pending.filter,
      search: pending.search,
      offset: pending.offset,
      limit: pending.limit,
      requestId: pending.requestId,
      ...(pending.knownRevision === null ? {} : { knownRevision: pending.knownRevision }),
    };
  }

  cancel(requestId: string): boolean {
    if (!this.pending || this.pending.requestId !== requestId) {
      return false;
    }
    this.pending = null;
    return true;
  }

  resolve(page: S2C_InventoryPage, currentInventoryRevision: number | null): InventoryPageResponseDecision {
    const pending = this.pending;
    const requestId = typeof page.requestId === 'string' ? page.requestId.trim() : '';
    if (!pending || !requestId || requestId !== pending.requestId) {
      return 'ignored';
    }

    this.pending = null;
    const responseRevision = normalizeInventoryRevision(page.revision);
    const minimumRevision = Math.max(
      pending.knownRevision ?? 0,
      normalizeInventoryRevision(currentInventoryRevision) ?? 0,
    );
    if (
      page.filter !== pending.filter
      || normalizeInventoryPageSearch(page.search) !== pending.search
      || normalizeInventoryPageOffset(page.offset) !== pending.offset
      || normalizeInventoryPageLimit(page.limit) !== pending.limit
      || responseRevision === null
      || responseRevision < minimumRevision
    ) {
      return 'invalid-current';
    }
    return 'accepted';
  }
}
