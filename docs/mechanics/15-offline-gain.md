# 离线收益

## 机制概述

离线收益基于**服务端持续 tick**：玩家离线后服务端仍然每秒执行 tick（修炼、buff 衰减等），离线期间的增量被累积到 offlineGainSession 中。

源文件：`packages/server/src/runtime/player/player-runtime.service.ts`

## 执行流程

1. 玩家断线时记录 `offlineSinceAt = Date.now()`
2. 每 tick 执行 `captureOfflineGainBeforeTick` → 正常 tick → `accumulateOfflineGainAfterTick`
3. 离线期间 tick 产生的境界修为、功法经验、底蕴等增量累积到 `accumulatedPayload`
4. `accumulatedDurationMs += 1000`（每 tick 1 秒）
5. 玩家上线时调用 `finalizeOfflineGainSessionForPlayer` 生成报告
6. 报告持久化到 DB 或暂存内存，客户端确认后删除

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

## 设计特点

- 无离线时长上限限制
- 无离线效率衰减
- 离线收益 = 在线挂机收益（完全等价）
- 服务端持续 tick 保证公平性

## 相关源文件

- `packages/server/src/runtime/player/player-runtime.service.ts` — 离线收益核心
