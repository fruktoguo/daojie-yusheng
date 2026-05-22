/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 坊市交易记录查询服务。
 * 把 GM 控制台传来的"玩家序号 / playerId / 物品名"关键字解析成数据库可用的精确条件，
 * 再调用 MarketPersistenceService.queryTradeHistoryForGm 拉一页数据，最后用
 * PlayerIdentityPersistenceService 批量回填 player_no + 显示名，用 ContentTemplateRepository
 * 把 itemId 解析成中文物品名。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GmMarketTradeItem, GmMarketTradeListQuery, GmMarketTradeListRes } from '@mud/shared';

import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MarketPersistenceService } from '../../persistence/market-persistence.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';

interface MarketPersistenceQueryPort {
  isEnabled(): boolean;
  queryTradeHistoryForGm(input: {
    playerIdMatches?: string[];
    itemIds?: string[];
    page: number;
    pageSize: number;
  }): Promise<{
    items: Array<{
      id: string;
      source: 'market' | 'auction';
      buyerId: string;
      sellerId: string;
      itemId: string;
      quantity: number;
      unitPrice: number;
      createdAt: number;
    }>;
    total: number;
  }>;
}

interface ContentTemplateNameLookupPort {
  getItemName(itemId: string): string | null;
  listItemTemplates(): Array<{ itemId: string; name?: string | null }>;
}

interface PlayerIdentityLookupPort {
  isEnabled(): boolean;
  findPlayerIdsByPlayerNo(playerNo: bigint | number): Promise<string[]>;
  findPlayerIdsByName?(keyword: string, limit?: number): Promise<string[]>;
  listPlayerIdentitiesByPlayerIds(
    playerIds: Iterable<string>,
  ): Promise<Map<string, { playerNo?: number | null; playerName?: string | null; displayName?: string | null } | null>>;
}

interface PlayerIdentityRecordSnippet {
  playerNo?: number | null;
  playerName?: string | null;
  displayName?: string | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
const MAX_ITEM_KEYWORD_MATCHES = 200;

@Injectable()
export class NativeGmMarketTradeService {
  private readonly logger = new Logger(NativeGmMarketTradeService.name);

  constructor(
    @Inject(MarketPersistenceService)
    private readonly marketPersistenceService: MarketPersistenceQueryPort,
    @Inject(ContentTemplateRepository)
    private readonly contentTemplateRepository: ContentTemplateNameLookupPort,
    @Inject(PlayerIdentityPersistenceService)
    private readonly playerIdentityPersistenceService: PlayerIdentityLookupPort,
  ) {}

  /** 列出符合条件的成交记录。空查询返回最近一页；条件解析后无匹配时返回空列表。 */
  async listTrades(query: GmMarketTradeListQuery | null | undefined): Promise<GmMarketTradeListRes> {
    const page = clampPositiveInt(query?.page, 1, 1, 1_000_000);
    const pageSize = clampPositiveInt(query?.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const playerKeyword = typeof query?.playerKeyword === 'string' ? query.playerKeyword.trim() : '';
    const itemKeyword = typeof query?.itemKeyword === 'string' ? query.itemKeyword.trim() : '';

    const baseResponse: GmMarketTradeListRes = {
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
      playerKeyword,
      itemKeyword,
    };

    if (typeof this.marketPersistenceService?.isEnabled === 'function'
      && !this.marketPersistenceService.isEnabled()) {
      return baseResponse;
    }

    const queryInput: {
      playerIdMatches?: string[];
      itemIds?: string[];
      page: number;
      pageSize: number;
    } = { page, pageSize };

    if (playerKeyword) {
      const matchedPlayerIds = await this.resolvePlayerKeywordToIds(playerKeyword);
      // playerKeyword 提供了但解析不到 playerId，直接给空——避免没条件全表扫描。
      queryInput.playerIdMatches = matchedPlayerIds;
      if (matchedPlayerIds.length === 0) {
        return baseResponse;
      }
    }

    if (itemKeyword) {
      const matchedItemIds = this.resolveItemKeywordToIds(itemKeyword);
      queryInput.itemIds = matchedItemIds;
      if (matchedItemIds.length === 0) {
        return baseResponse;
      }
    }

    const { items, total } = await this.marketPersistenceService.queryTradeHistoryForGm(queryInput);
    if (total === 0 || items.length === 0) {
      return { ...baseResponse, total: Math.max(0, total) };
    }

    const involvedPlayerIds = new Set<string>();
    for (const entry of items) {
      if (entry.buyerId) {
        involvedPlayerIds.add(entry.buyerId);
      }
      if (entry.sellerId) {
        involvedPlayerIds.add(entry.sellerId);
      }
    }
    const identityMap = await this.loadIdentityMap(involvedPlayerIds);

    const projected: GmMarketTradeItem[] = items.map((entry) => this.projectItem(entry, identityMap));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      ...baseResponse,
      items: projected,
      total,
      totalPages,
    };
  }

  private async resolvePlayerKeywordToIds(keyword: string): Promise<string[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }
    if (/^\d+$/u.test(trimmed)) {
      const playerNo = safeParseBigInt(trimmed);
      if (playerNo === null) {
        return [];
      }
      try {
        const ids = await this.playerIdentityPersistenceService.findPlayerIdsByPlayerNo(playerNo);
        return ids.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
      } catch (error) {
        this.logger.error(
          `按玩家序号反查 playerId 失败 keyword="${trimmed}" ${error instanceof Error ? error.stack : String(error)}`,
        );
        return [];
      }
    }
    // 非纯数字：同时尝试"原样当 playerId 精确匹配"和"display_name / player_name / username 模糊反查"，
    // 合并去重。让 GM 既能粘 playerId、又能输入角色名/显示名/账号名直接搜。
    const collected = new Set<string>([trimmed]);
    const lookupByName = this.playerIdentityPersistenceService.findPlayerIdsByName;
    if (typeof lookupByName === 'function') {
      try {
        const ids = await lookupByName.call(this.playerIdentityPersistenceService, trimmed);
        for (const id of ids ?? []) {
          if (typeof id === 'string' && id.length > 0) {
            collected.add(id);
          }
        }
      } catch (error) {
        this.logger.error(
          `按角色名/显示名反查 playerId 失败 keyword="${trimmed}" ${error instanceof Error ? error.stack : String(error)}`,
        );
      }
    }
    return Array.from(collected);
  }

  private resolveItemKeywordToIds(keyword: string): string[] {
    const lower = keyword.toLowerCase();
    if (!lower) {
      return [];
    }
    let templates: Array<{ itemId: string; name?: string | null }> = [];
    try {
      templates = this.contentTemplateRepository.listItemTemplates() ?? [];
    } catch (error) {
      this.logger.error(
        `读取物品模板失败 keyword="${keyword}" ${error instanceof Error ? error.stack : String(error)}`,
      );
      return [];
    }
    const matched: string[] = [];
    for (const template of templates) {
      if (matched.length >= MAX_ITEM_KEYWORD_MATCHES) {
        break;
      }
      const itemId = typeof template?.itemId === 'string' ? template.itemId.trim() : '';
      if (!itemId) {
        continue;
      }
      const name = typeof template?.name === 'string' ? template.name.trim() : '';
      const itemIdLower = itemId.toLowerCase();
      const nameLower = name.toLowerCase();
      if (itemIdLower === lower || nameLower === lower) {
        matched.unshift(itemId); // 精确匹配置顶
        continue;
      }
      if (itemIdLower.includes(lower) || nameLower.includes(lower)) {
        matched.push(itemId);
      }
    }
    return Array.from(new Set(matched));
  }

  private async loadIdentityMap(playerIds: Set<string>): Promise<Map<string, PlayerIdentityRecordSnippet>> {
    const result = new Map<string, PlayerIdentityRecordSnippet>();
    if (playerIds.size === 0) {
      return result;
    }
    if (typeof this.playerIdentityPersistenceService?.isEnabled === 'function'
      && !this.playerIdentityPersistenceService.isEnabled()) {
      return result;
    }
    try {
      const map = await this.playerIdentityPersistenceService.listPlayerIdentitiesByPlayerIds(playerIds);
      if (!map) {
        return result;
      }
      for (const [playerId, record] of map.entries()) {
        if (typeof playerId !== 'string' || !playerId) {
          continue;
        }
        if (record) {
          result.set(playerId, {
            playerNo: record.playerNo ?? null,
            playerName: record.playerName ?? null,
            displayName: record.displayName ?? null,
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `批量加载玩家身份失败：${error instanceof Error ? error.stack : String(error)}`,
      );
    }
    return result;
  }

  private projectItem(
    entry: {
      id: string;
      source: 'market' | 'auction';
      buyerId: string;
      sellerId: string;
      itemId: string;
      quantity: number;
      unitPrice: number;
      createdAt: number;
    },
    identityMap: Map<string, PlayerIdentityRecordSnippet>,
  ): GmMarketTradeItem {
    const buyer = identityMap.get(entry.buyerId);
    const seller = identityMap.get(entry.sellerId);
    const itemName = this.contentTemplateRepository.getItemName(entry.itemId) ?? entry.itemId;
    const totalCost = roundDecimal(entry.unitPrice * entry.quantity, 2);
    return {
      id: entry.id,
      source: entry.source,
      buyerId: entry.buyerId,
      sellerId: entry.sellerId,
      buyerNo: buyer?.playerNo ?? null,
      sellerNo: seller?.playerNo ?? null,
      buyerName: buyer?.displayName ?? buyer?.playerName ?? null,
      sellerName: seller?.displayName ?? seller?.playerName ?? null,
      itemId: entry.itemId,
      itemName,
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      totalCost,
      createdAt: entry.createdAt,
    };
  }
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const truncated = Math.trunc(numeric);
  if (truncated < min || truncated > max) {
    return Math.min(max, Math.max(min, fallback));
  }
  return truncated;
}

function safeParseBigInt(text: string): bigint | null {
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

function roundDecimal(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
