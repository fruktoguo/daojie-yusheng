/**
 * GM 坊市交易记录与 AI 功法生成领域契约。
 *
 * 包含 GM 查询坊市交易记录、GM 管理 AI 生成功法列表/详情/任务，
 * 以及功法生成任务的摘要与分页结构。
 */

import type { TechniqueCategory, TechniqueGrade } from '../cultivation-types';
/** GM 坊市交易记录查询条件。 */
export interface GmMarketTradeListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端会限制范围。 */
  pageSize?: number;
  /** 玩家关键字：纯数字识别为 player_no（玩家序号），其它当作 playerId 精确匹配。 */
  playerKeyword?: string;
  /** 物品关键字：服务端按 contentTemplateRepository.getItemName 反查匹配的 itemId 集合。 */
  itemKeyword?: string;
}

/** GM 坊市交易记录条目，按交易完成时间倒序返回。 */
export interface GmMarketTradeItem {
  /** 成交记录 ID。 */
  id: string;
  /** 成交来源：常规坊市挂单 / 拍卖行。 */
  source: 'market' | 'auction';
  /** 买家 playerId。 */
  buyerId: string;
  /** 卖家 playerId。 */
  sellerId: string;
  /** 买家玩家序号（player_no），可能为空（旧账号未回填）。 */
  buyerNo?: number | null;
  /** 卖家玩家序号。 */
  sellerNo?: number | null;
  /** 买家显示名。 */
  buyerName?: string | null;
  /** 卖家显示名。 */
  sellerName?: string | null;
  /** 物品 ID。 */
  itemId: string;
  /** 物品中文名（服务端从模板表解析）。 */
  itemName: string;
  /** 成交数量。 */
  quantity: number;
  /** 成交单价（灵石/件）。 */
  unitPrice: number;
  /** 成交总价 = quantity × unitPrice，由服务端预算好。 */
  totalCost: number;
  /** 成交完成时间（毫秒 epoch）。 */
  createdAt: number;
}

/** GM 坊市交易记录响应。 */
export interface GmMarketTradeListRes {
  items: GmMarketTradeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 解析后的玩家关键字（去除首尾空白；空字符串表示无条件）。 */
  playerKeyword: string;
  /** 解析后的物品关键字。 */
  itemKeyword: string;
}

/** GM AI 生成功法列表查询条件。 */
export interface GmGeneratedTechniqueListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端固定限制到最多 50。 */
  pageSize?: number;
  /** 名称、ID、生成 ID 或创建者玩家 ID 关键字。 */
  keyword?: string;
  /** 功法类别过滤。 */
  category?: TechniqueCategory | 'all';
  /** 功法品阶过滤。 */
  grade?: TechniqueGrade | 'all';
  /** 境界等级过滤。 */
  realmLv?: number;
  /** 生成记录状态过滤。 */
  status?: string;
  /** 创建者玩家 ID 精确过滤。 */
  createdByPlayerId?: string;
  /** 仅返回已发布功法；用于 GM 给玩家添加可学习自创功法。 */
  publishedOnly?: boolean;
}

/** GM AI 生成功法列表摘要。列表响应不携带大 JSON。 */
export interface GmGeneratedTechniqueSummary {
  id: string;
  generationId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  name: string;
  grade?: string | null;
  category?: string | null;
  realmLv?: number | null;
  status: string;
  isPublished: boolean;
  createdByPlayerId: string;
  /** 玩家功法管理里禁止直接添加的原因；为空表示可添加。 */
  playerAddDisabledReason?: string | null;

}

/** GM AI 生成功法分页信息。 */
export interface GmGeneratedTechniqueListPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** GM AI 生成功法列表响应。 */
export interface GmGeneratedTechniqueListRes {
  techniques: GmGeneratedTechniqueSummary[];
  page: GmGeneratedTechniqueListPage;
}

/** GM AI 生成功法详情响应，rawJson 保留数据库记录原貌供管理端查看。 */
export interface GmGeneratedTechniqueDetailRes {
  technique: GmGeneratedTechniqueSummary & {
    schemaVersion: number;
    usageScope: string;
    modelName?: string | null;
    /** 玩家自定义提示词快照，不包含通用 system/user prompt 全量请求。 */
    promptSnapshot?: string | null;
    validationReport?: unknown;
    template: unknown;
    rawJson: unknown;
  };
}

/** GM AI 生成功法任务列表查询条件。 */
export interface GmTechniqueGenerationJobListQuery {
  /** 页码，从 1 开始。 */
  page?: number;
  /** 每页条数，服务端固定限制到最多 50。 */
  pageSize?: number;
}

/** GM AI 生成功法任务摘要。 */
export interface GmTechniqueGenerationJobSummary {
  id: string;
  playerId: string;
  playerName?: string | null;
  playerDisplayName?: string | null;
  status: string;
  requestedCategory?: string | null;
  rolledGrade?: string | null;
  rolledRealmLv?: number | null;
  draftTechniqueId?: string | null;
  modelName?: string | null;
  attemptCount: number;
  itemConsumed: boolean;
  itemSpend: number;
  consumedAt?: string | null;
  itemRefunded: boolean;
  refundedAt?: string | null;
  draftExpireAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GM AI 生成功法任务列表响应。 */
export interface GmTechniqueGenerationJobListRes {
  jobs: GmTechniqueGenerationJobSummary[];
  page: GmGeneratedTechniqueListPage;
}

/** GM AI 生成功法任务详情响应。 */
export interface GmTechniqueGenerationJobDetailRes {
  job: GmTechniqueGenerationJobSummary & {
    playerContext?: string | null;
    rawJson: unknown;
  };
}

