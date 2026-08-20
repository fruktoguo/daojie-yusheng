/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 功法生成业务类型定义。
 */

import type { Attributes, SkillDef, TechniqueCategory, TechniqueGrade } from '@mud/shared';

export type TechniqueGenerationJobStatus =
  | 'pending'
  | 'running'
  | 'generated_draft'
  | 'learned'
  | 'discarded'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type TechniqueGenerationMode = 'single' | 'batch';

export interface GenerationJobResult {
  success: boolean;
  jobId?: string;
  rolledGrade?: TechniqueGrade;
  rolledRealmLv?: number;
  itemSpend?: number;
  budgetPercent?: number;
  totalBudget?: number;
  batchId?: string;
  batchCount?: number;
  jobIds?: string[];
  error?: string;
  errorCode?: string;
}

export interface GenerationExecutionResult {
  success: boolean;
  techniqueId?: string;
  error?: string;
}

export interface AdoptResult {
  success: boolean;
  techniqueId?: string;
  techniqueName?: string;
  error?: string;
  errorCode?: string;
}

export interface BatchAdoptResult {
  success: boolean;
  batchId?: string;
  techniqueIds?: string[];
  techniqueNames?: string[];
  error?: string;
  errorCode?: string;
}

export interface DiscardRefundResult {
  itemSpend: number;
  refundRatio: number;
  refundAmount: number;
  refundCurrencyItemId: string;
}

export interface DiscardResult {
  success: boolean;
  refund?: DiscardRefundResult;
  error?: string;
  errorCode?: string;
}

export interface TechniquePreview {
  techniqueId: string;
  suggestedName: string;
  grade: TechniqueGrade;
  category: TechniqueCategory;
  realmLv: number;
  desc: string;
  fullLevelAttrs?: Partial<Attributes>;
  skills?: SkillDef[];
  maxLayer: number;
  expDifficulty: number;
  modelName?: string;
  budgetPercent?: number;
  totalBudget?: number;
}

export interface TechniqueBatchPreview extends TechniquePreview {
  jobId: string;
}

export interface TechniqueGenerationBatchStatus {
  batchId: string;
  status: Extract<TechniqueGenerationJobStatus, 'pending' | 'running' | 'generated_draft'>;
  count: number;
  createdAt: string;
  draftExpireAt?: string;
  jobs: Array<{
    jobId: string;
    rolledGrade: TechniqueGrade;
    rolledRealmLv: number;
  }>;
  drafts: TechniqueBatchPreview[];
}

export interface GenerationStatus {
  available: boolean;
  unavailableReason?: string;
  currentJob: {
    jobId: string;
    status: TechniqueGenerationJobStatus;
    category: string;
    rolledGrade: TechniqueGrade;
    rolledRealmLv: number;
    createdAt: string;
    draftExpireAt?: string;
  } | null;
  currentDraft: TechniquePreview | null;
  currentBatch: TechniqueGenerationBatchStatus | null;
}
