# 排行榜

## 排行榜分组

源文件: `packages/shared/src/leaderboard-types.ts`

客户端使用一级分组 + 二级榜单展示，服务端仍通过低频 `n:s:leaderboard` 一次下发完整榜册。

| 一级分组 | 二级榜单 | 排序依据 | 协议字段 |
|----------|----------|----------|----------|
| 战斗 | 斩妖 | 总击杀、Boss、精英击杀 | `monsterKills` |
| 战斗 | 杀伐 | 玩家击杀数 | `playerKills` |
| 战斗 | 身陨 | 死亡次数 | `deaths` |
| 技艺 | 炼丹、炼器、强化、传法、采集、挖矿、营造、阵法 | 技艺等级、当前经验 | `techniques[technique]` |
| 天榜 | 境界 | 境界等级、修为进度、炼体等级、底蕴、炼体经验 | `realm` |
| 天榜 | 炼体 | 炼体等级、炼体经验 | `bodyTraining` |
| 天榜 | 体魄、神识、身法、根骨、力道、经脉 | 对应最终六维属性；同值时按境界与角色名稳定排序 | `attributes[attr]` |
| 人榜 | 宗门 | 宗门成员数 | `sects` |
| 人榜 | 引渡 | 引渡总数、受引渡者达到炼气期、受引渡者达到筑基期各前三 | `invitation` |
| 人榜 | 灵石 | 可见灵石 + 未成交求购单预留灵石 | `spiritStones` |

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
- 常规榜单最多显示前 10 名；六维每个维度、八项技艺每个技艺都各自独立取前 10 名。
- 引渡榜分为“引渡总数 / 引气入道 / 筑基成道”三组，每组固定显示前三名。
- 技艺榜使用 `player_profession_state` 作为离线真源；在线玩家由运行态轻量投影覆盖，按技艺等级、当前经验、角色名排序。
- 灵石榜按玩家可见灵石加开放求购单中尚未成交的预留灵石排序，避免通过求购锁单隐藏财富
- 引渡榜使用活动持久化表 `player_invitation`，排行榜低频刷新时会先用玩家快照补齐受邀玩家最高境界，再聚合展示；封禁玩家不会进入引渡榜，也不会计入被引渡人数

## 击杀计数持久化

- `monsterKillCount`、`eliteMonsterKillCount`、`bossMonsterKillCount` 的数据库真源为 `player_counters`，运行时内存缓存承接当前 tick 内的权威累计值。
- 高频击杀只更新内存脏值，不在战斗 tick 内等待数据库。服务端以 250ms 窗口合并同一玩家、同一计数器的连续变化，每批最多 256 项，通过单条批量 UPSERT 写入最终值。
- 每个脏值携带 revision；数据库写入在途期间出现的新变化不会被旧批次错误确认，后续批次继续写入最新累计值。
- 批次失败后脏值不会移除，按 500ms 起步、最高 30 秒的指数退避自动重试；优雅关机时停止定时器、等待在途批次并继续刷完待写值。

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
