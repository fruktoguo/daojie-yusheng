import { CHANGELOG_ENTRIES } from '../constants/ui/changelog';

export { CHANGELOG_ENTRIES };

/** ChangelogEntry：定义该接口的能力与字段约束。 */
export interface ChangelogEntry {
  updatedAt: string;
  summary: string;
  items: string[];
}

/** getLatestChangelogEntry：执行对应的业务逻辑。 */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG_ENTRIES[0] ?? null;
}

