export interface ChangelogEntry {
  updatedAt: string;
  summary: string;
  items: string[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    updatedAt: '2026-03-22 21:58',
    summary: '优化掉线后的挂机体验，并加强地图探索记录的稳定性。',
    items: [
      '角色掉线后不会立刻从世界里消失，可以继续在原地挂机一段时间，超时后才会离开。',
      '后台现在能更清楚地区分在线、离线挂机和已离线的角色，方便排查在线状态问题。',
      '优化地图记忆保存逻辑，减少探索记录被异常覆盖或丢失的情况。',
    ],
  },
];

export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG_ENTRIES[0] ?? null;
}
