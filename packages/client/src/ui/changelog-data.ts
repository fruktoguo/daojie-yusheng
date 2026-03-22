export interface ChangelogEntry {
  updatedAt: string;
  summary: string;
  items: string[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    updatedAt: '2026-03-23 06:42',
    summary: '界面布局、地图氛围和功法成长体验迎来一轮集中打磨。',
    items: [
      '游戏界面现在支持左右侧栏与下方面板收拢、拖拽调节，宽屏下查看背包、任务和功法也更舒展。',
      '地图的昼夜表现更有层次了，清晨、黄昏和深夜的氛围差异更明显，时间推移也会过渡得更自然。',
      '整理背包、穿脱装备、切换主修和自动战斗等操作会更快生效，少了一拍等待感。',
      '页面休眠或网络波动后，连接恢复更积极了；灵网延迟会持续显示，关闭大地图后小地图也会立刻回来。',
      '功法修炼门槛按品阶重新校准，已学功法的经验进度也会同步到新的成长节奏中。',
    ],
  },
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
