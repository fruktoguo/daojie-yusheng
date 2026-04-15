import { CHANGELOG_ENTRIES } from '../constants/ui/changelog';

export { CHANGELOG_ENTRIES };

/** 单条更新日志记录，包含更新时间、摘要和具体改动。 */
export interface ChangelogEntry {
  updatedAt: string;
  summary: string;
  items: string[];
}

/** getLatestChangelogEntry：读取Latest Changelog条目。 */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG_ENTRIES[0] ?? null;
}



