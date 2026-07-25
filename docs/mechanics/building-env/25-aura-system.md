# 灵气场（Aura）系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/aura.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_AURA_LEVEL_BASE_VALUE | 1000 | 灵气等级基础值 |
| TILE_AURA_HALF_LIFE_TICKS | 86400 息（≈24小时） | 地块灵气半衰期 |
| TILE_AURA_HALF_LIFE_RATE_SCALE | 1,000,000,000 | 半衰期比例常量精度 |
| TILE_AURA_HALF_LIFE_RATE_SCALED | ≈8023 | 计算值 |

## 灵气等级公式

```typescript
// 灵气等级阈值递增: 每级 ×1.5
level_1: 1000
level_2: 1500
level_3: 2250
level_4: 3375
...
level_n: 1000 × 1.5^(n-1)
```

## 半衰期流转公式

源文件: `packages/server/src/runtime/instance/map-instance.runtime.ts`

```typescript
// 每 tick 执行:
diff = |current - base|
rate = RATE_SCALED / RATE_SCALE
step = diff × rate
step = min(step, diff)
next = current > base ? current - step : current + step
```

### 物理含义

- 每息衰减/回补比例 ≈ `1 - 0.5^(1/86400)` ≈ 0.000008023
- 经过 86400 息后，差值缩小为原来的 50%
- 地块灵气运行态、持久化回读和增量落盘均按 double 数值保存，历史整数灵气会原样作为 double 读回，不会清空或重置。

## 灵气流转触发条件

- 仅对 "natural aura flow resource" 类型的资源桶生效
- 当 current ≠ base 时加入流转索引集合
- 当 current = base 时移出索引，停止计算

## 灵气来源

- 地图基础灵气（base value）
- 聚灵阵效果（tile_aura_source）
- 灵脉/灵泉等地标
- 玩家修炼消耗（逸散）
- 配置了 `tileAuraGainAmount` 或 `tileResourceGains` 的消耗品主动注入

### 消耗品注入的资产一致性

- 玩家在地块使用灵石、血精石等资源消耗品时，背包扣除与 `instance_tile_resource_state` 后态必须在同一个 durable operation 中提交。
- 事务同时校验玩家 `runtime_owner_id + session_epoch` 与实例 `assigned_node_id + lease_token + ownership_epoch`；任一围栏失效时，背包和地块资源都不改变。
- 事务会接管该实例 `tile_resource` 域尚未真实落库的累计 delta，并写入更高版本的 flush ledger barrier；已经认领的旧 payload 在取得实例 advisory lock 后必须再次校验 claim，不能迟到覆盖玩家操作后的资源值。
- 服务端收到明确 COMMIT 成功，或通过同一 `operationId` 回读确认成功后，才把背包与地块资源后态一次性应用到运行态。普通失败保持两域不变；COMMIT 结果未决期间阻止相关玩家和实例 flush 越过事务边界。
- 事务等待期间如果自然流转等逻辑又改变了同一资源域，本次物品增量仍由 durable 真源保存；并发产生的额外运行态变化继续保留为累计 dirty，由后续增量 flush 收敛，不能用旧快照清除。

## 望气显示口径

- 地块 `aura` 是灵气绝对值，客户端必须先按当前地图的 `levelBaseValue` 调用 `getAuraLevel` 换算为等级，再进入颜色映射。
- 地块存在多类气机资源时，优先使用服务端给出的 `level`；缺少等级时才按 `effectiveValue/value` 换算，最终以等级最高的资源家族和等级着色。
- 灵气绝对值在同一等级区间内随半衰期流转时，望气颜色不变；只有最终家族或等级变化才需要让覆盖层缓存失效。

## 灵气对修炼的影响

```typescript
auraMultiplier = 地块灵气等级对应的修炼加成
// 灵气等级越高，修炼速度越快
```
