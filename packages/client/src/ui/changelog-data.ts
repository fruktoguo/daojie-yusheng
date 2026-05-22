/**
 * 本文件是客户端 DOM UI 的 changelog data 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import { CHANGELOG_ENTRIES } from '../constants/ui/changelog';

export { CHANGELOG_ENTRIES };

/** 单条更新日志记录，包含更新时间、摘要和具体改动。 */
export interface ChangelogEntry {
/**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: string;  
  /**
 * summary：摘要状态或数据块。
 */

  summary: string;  
  /**
 * items：集合字段。
 */

  items: string[];
}

/** getLatestChangelogEntry：读取Latest Changelog条目。 */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG_ENTRIES[0] ?? null;
}



