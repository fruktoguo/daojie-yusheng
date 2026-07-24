# 通天塔/副本

## 配置常量

源文件: `packages/server/data/content/tongtian-tower.json`

| 常量 | 值 | 说明 |
|------|-----|------|
| entryMapId | qizhen_crossing | 入口地图（栖真渡） |
| entryX / entryY | 31 / 15 | 入口坐标 |
| exitX / exitY | 31 / 15 | 出口坐标 |
| width / height | 20 / 20 | 每层地图尺寸 |
| spawnX / spawnY | 10 / 10 | 玩家出生点 |
| previousX / previousY | 2 / 10 | 退到上一层坐标 |
| nextX / nextY | 17 / 10 | 前往下一层坐标 |
| exitPortalX / exitPortalY | 10 / 17 | 退出通天塔坐标 |
| spawnIntervalTicks | 60 | 波次间隔（息） |
| layerChangeCooldownSeconds | 60 | 重复通关后的换层冷却（秒） |
| normalMonstersPerPlayer | 4 | 每玩家普通怪数量 |
| eliteMonstersPerPlayer | 1 | 每玩家精英怪数量 |
| idleDestroyTicks | 3600 | 空闲销毁时间（息） |
| monsterId | m_tongtian_shadow | 普通怪模板 |
| eliteMonsterId | m_tongtian_shadow_elite | 精英怪模板 |

## 层数规则

源文件: `packages/server/src/runtime/world/world-runtime-tongtian-tower.service.ts`

```typescript
normalizeLayer(value) = max(1, trunc(Number(value)))
getLayerMonsterLevel(layer) = normalizeLayer(layer)  // 怪物等级 = 层数
```

- 实例 ID 格式: `tower:tongtian:layer:{layer}`
- 模板 ID 格式: `tongtian_tower_layer_{layer}`
- 层数无上限，玩家通关当前层后解锁下一层

## 实例能力

- 通天塔层实例使用 `linePreset: 'peaceful'`
- 显式禁用 PVP：`supportsPvp: false`
- 显式禁用地块攻击：`canDamageTile: false`

## 波次生成公式

```typescript
normalCount = playerCount × normalMonstersPerPlayer  // = 4 × 玩家数
eliteCount = playerCount × eliteMonstersPerPlayer    // = 1 × 玩家数
```

## 怪物生成位置算法

- 以 spawnX/spawnY 为中心，按环形分布
- `ring = 1 + floor(index / 8)`
- 8 方向均匀分布，碰撞时向外扩展搜索

## 通关与奖励

- 当波次所有怪物死亡 → `completeWave()`
- 通关后解锁层 = 当前层 + 1
- 波次开始时在场或波次中途进入的玩家均计为清层参与者
- 所有清层参与者的 `highestLayer` 被提升
- 玩家首次通过当前层时不进入换层冷却，可立即前往上一层或下一层
- 已通过当前层的玩家再次参与清层后，进入 60 秒换层冷却；冷却期间不能前往上一层或下一层，但可以退出通天塔
- 换层冷却按玩家独立判定，并随通天塔进度持久化，重连或重启不能绕过
- 下一波次在 `instance.tick + spawnIntervalTicks` 后生成

## 进入条件

- 必须在栖真渡入口坐标 1 格范围内（Chebyshev 距离 ≤ 1）
- HP > 0（重伤倒地时不能操作）
- 前往下一层需要 `progress.highestLayer >= nextLayer`

## 持久化策略

- 实例标记 `persistent: true`, `persistentPolicy: 'persistent'`
- `instance_catalog.instance_type` 必须为 `tower`；历史 `public` 行不会在运行时自动兼容
- 玩家进度通过 `TongtianTowerPersistenceService` 持久化
- 空闲超过 `idleDestroyTicks`(3600息) 后销毁实例并落盘
- 空闲销毁必须先完成实例 dirty domain 落盘；落盘异常或落盘后仍有 dirty 状态时保留运行态并在后续维护周期重试
- 实际销毁统一进入托管实例生命周期入口，以本节点当前 `assignedNodeId + leaseToken + ownershipEpoch` 对 `instance_catalog` 做 CAS；冲突时不清理内存，成功时先递增 `ownership_epoch` 再卸载实例、tick progress、掉落容器、事件与阵法缓存
- 重启扫描历史塔层时不把全部塔层注册进常驻 tick；缓存装载会临时挂载实例，先按 catalog 的 lease/epoch 完成 replay 与 claim/renew，再且仅再水合一次分域，随后摘回 detached cache。远端 lease 冲突、能力缺失或水合失败时不保留缓存，也不进入通用 catalog claim 路径
- 旧 `public` 塔层必须先调用 GM 兼容转换 `tongtian-tower-catalog-instance-type` 的 `dry-run`，人工确认后再 `apply`；转换会保留原 tombstone，并递增 `ownership_epoch` / `metadata_version`
