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

## 灵气对修炼的影响

```typescript
auraMultiplier = 地块灵气等级对应的修炼加成
// 灵气等级越高，修炼速度越快
```
