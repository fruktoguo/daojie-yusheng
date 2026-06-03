# 排行榜

## 排行榜类型

源文件: `packages/shared/src/leaderboard-types.ts`

| 榜单 | 排序依据 | 条目类型 |
|------|----------|----------|
| realm | 境界等级+进度+底蕴 | LeaderboardRealmEntry |
| monsterKills | 总击杀/精英/Boss | LeaderboardMonsterKillEntry |
| spiritStones | 可见灵石 + 未成交求购单预留灵石 | LeaderboardSpiritStoneEntry |
| playerKills | 玩家击杀数 | LeaderboardPlayerKillEntry |
| deaths | 死亡次数 | LeaderboardDeathEntry |
| bodyTraining | 体修等级+经验 | LeaderboardBodyTrainingEntry |
| supremeAttrs | 六维属性最高者 | LeaderboardSupremeAttrEntry |
| sects | 宗门成员数 | LeaderboardSectEntry |

## 运行时参数

源文件: `packages/server/src/runtime/player/leaderboard-runtime.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_LEADERBOARD_LIMIT | 10 | 默认显示条数 |
| MAX_LEADERBOARD_LIMIT | 10 | 最大显示条数 |
| LEADERBOARD_REFRESH_INTERVAL_MS | 600000 | 刷新间隔（10分钟） |
| WORLD_SUMMARY_CACHE_TTL_MS | 30000 | 世界摘要缓存（30秒） |

## 排名规则

- 排除 GM Bot 玩家
- 排除账号真源中已封禁的玩家；封禁玩家不进入个人榜、宗门榜成员计数、世界摘要统计，也不计入灵石榜的未成交求购预留灵石。
- 每 10 分钟刷新一次
- 最多显示前 10 名
- 灵石榜按玩家可见灵石加开放求购单中尚未成交的预留灵石排序，避免通过求购锁单隐藏财富

## 世界摘要统计

```typescript
interface WorldSummary {
  totalSpiritStones: number;      // 全服灵石总量（可见灵石 + 坊市托管灵石 + 未成交求购预留灵石）
  actionCounts: {
    cultivation: number;          // 修炼活跃
    combat: number;               // 战斗活跃
    alchemy: number;              // 炼丹活跃
    enhancement: number;          // 强化活跃
  };
  realmCounts: {
    initial: number;              // 初始境界
    mortal: number;               // 凡俗
    qiRefiningOrAbove: number;    // 练气及以上
  };
  killCounts: {
    normalMonsters: number;
    eliteMonsters: number;
    bossMonsters: number;
    playerKills: number;
    playerDeaths: number;
  };
}
```
