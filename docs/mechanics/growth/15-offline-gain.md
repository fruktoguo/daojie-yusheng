# 离线收益

## 机制概述

离线收益基于**服务端持续 tick**：玩家离线后服务端仍然每秒执行 tick（修炼、buff 衰减等），离线期间的增量被累积到 offlineGainSession 中。

源文件：`packages/server/src/runtime/player/player-runtime.service.ts`

## 执行流程

1. 玩家断线时记录 `offlineSinceAt = Date.now()`
2. 每 tick 执行 `captureOfflineGainBeforeTick` → 正常 tick → `accumulateOfflineGainAfterTick`
3. 离线期间 tick 产生的境界修为、功法经验、底蕴等增量累积到 `accumulatedPayload`
4. `accumulatedDurationMs += 1000`（每 tick 1 秒）
5. 玩家上线时若离线收益累计时长未满 1 分钟，服务端直接结算并清理离线会话，不弹收益确认层；累计时长满 1 分钟时先保持离线挂机态，不立即结算，并下发 `preview/blocking` 离线收益预览
6. 客户端用不可关闭收益层遮住游戏界面，并每隔数秒请求刷新预览
7. 玩家点击确认后调用 `finalizeOfflineGainSessionForPlayer` 生成最终报告
8. 报告持久化到 DB 或暂存内存，客户端确认后删除，同时玩家切回在线 session

## 确认前阻塞规则

- 只要玩家没有确认收取，离线收益会话继续存在，角色仍按离线挂机 tick 累计收益
- 只有离线收益累计时长达到 1 分钟才进入确认前阻塞；短刷新、短断线不会弹出收益确认层
- 预览报告只用于展示，不写入浏览器历史，不清理云端记录
- 客户端确认时会先尝试把当前报告写入本地历史；若浏览器禁用或拒绝本地存储，仍必须发送确认回执，不能阻塞玩家进入游戏
- 服务端收到确认后才结算离线收益、删除离线收益会话，并把玩家运行态切换为在线；服务端资产和收支总账是正式真源，浏览器历史只是本设备展示缓存
- 未确认的历史报告仍会与当前离线收益预览合并展示，云端保持一条累计记录

## 离线收益内容

离线期间的修炼 tick 正常执行，收益与在线修炼完全一致：

```ts
境界修为: realmExpPerTick × auraMultiplier × (1 + playerExpRate/10000)
功法经验: techniqueExpPerTick × auraMultiplier × (1 + techniqueExpRate/10000)
底蕴溢出转化（同在线公式）
```

## 报告保存条件

- `durationMs >= 60_000`（至少离线 1 分钟）
- 且有实际收益 `hasOfflineGainReportParts(report)`

## 离线时长上限

- 基础最大离线挂机时长：48 小时
- 功德月卡有效期间：最大离线挂机时长提升至 72 小时
- 月卡权益只影响玩家从“离线挂机”转为“离线”的最长保留时间，不改变离线收益效率

## 功德月卡领取池

- 每次使用功德月卡，道具会为月卡总池增加 3000 功德
- 使用后领取时间重置为 30 天，当前剩余池会与新增 3000 功德合并，形成新的总池和剩余池
- 每日领取额按 `floor(月卡总池 / 30)` 计算，并从当前剩余池扣除
- 例：连续使用 10 张月卡时，总池为 30000 功德，每日领取 1000 功德；当前剩余池为 2000 功德时再使用 1 张，总池重算为 5000 功德，每日领取 166 功德

## 设计特点

- 无离线效率衰减
- 离线收益 = 在线挂机收益（完全等价）
- 服务端持续 tick 保证公平性

## 相关源文件

- `packages/server/src/runtime/player/player-runtime.service.ts` — 离线收益核心
