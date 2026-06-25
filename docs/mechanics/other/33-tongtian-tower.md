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
- 所有参与玩家的 `highestLayer` 被提升
- 下一波次在 `instance.tick + spawnIntervalTicks` 后生成

## 进入条件

- 必须在栖真渡入口坐标 1 格范围内（Chebyshev 距离 ≤ 1）
- HP > 0（重伤倒地时不能操作）
- 前往下一层需要 `progress.highestLayer >= nextLayer`

## 持久化策略

- 实例标记 `persistent: true`, `persistentPolicy: 'persistent'`
- 玩家进度通过 `TongtianTowerPersistenceService` 持久化
- 空闲超过 `idleDestroyTicks`(3600息) 后销毁实例并落盘
