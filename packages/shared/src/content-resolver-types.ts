/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * ContentResolver 协议类型 —— 客户端按需查询动态内容模板的请求/响应载荷。
 *
 * 设计要点：
 * - 支持批量查询，单次每域最多 50 个 ID
 * - 响应使用精确的已有类型，不引入宽松 Record
 * - 支持"完整模板"和"精简摘要"两种粒度（通过 detail 字段区分）
 */

import type { GmEditorBuffOption, GmEditorItemOption, GmEditorTechniqueOption } from './api-contracts';
import type { QuestState } from './quest-types';
import type { SkillDef } from './skill-types';

// ─── 请求 ───────────────────────────────────────────────────────────────────

/** 内容模板批量查询请求（C2S）。每域最多 50 个 ID。 */
export interface C2S_RequestContentTemplates {
  /** 物品 ID 列表。 */
  items?: string[];
  /** 功法 ID 列表。 */
  techniques?: string[];
  /** 技能 ID 列表。 */
  skills?: string[];
  /** Buff ID 列表。 */
  buffs?: string[];
  /** 任务 ID 列表。 */
  quests?: string[];
}

// ─── 响应 ───────────────────────────────────────────────────────────────────

/** 内容模板批量查询响应（S2C）。只包含服务端能查到的条目，查不到的 ID 不出现在响应中。 */
export interface S2C_ContentTemplates {
  /** 物品模板列表。 */
  items?: GmEditorItemOption[];
  /** 功法模板列表。 */
  techniques?: GmEditorTechniqueOption[];
  /** 技能模板列表。 */
  skills?: SkillDef[];
  /** Buff 模板列表。 */
  buffs?: GmEditorBuffOption[];
  /** 任务模板列表。 */
  quests?: QuestState[];
}

// ─── 精简摘要（用于高频场景的部分缓存） ─────────────────────────────────────

/**
 * 内容模板精简摘要 —— 从服务端高频下发数据中提取的最小展示字段。
 * 当 UI 只需要名字/品质/类型时使用此摘要，无需拉取完整模板。
 * L2 缓存中同时存储 full 和 partial 两种状态。
 */
export interface ContentTemplateSummary {
  /** 唯一标识（itemId / techId / skillId / buffId / questId）。 */
  id: string;
  /** 显示名称。 */
  name: string;
  /** 品质/等阶（可选）。 */
  grade?: string;
  /** 物品类型（可选，仅物品域）。 */
  type?: string;
  /** 是否为完整模板（false 表示仅有精简摘要，需要时可触发 L3 查询补全）。 */
  complete: boolean;
}
