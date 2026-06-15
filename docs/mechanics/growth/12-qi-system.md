# 灵气/气海系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| QI_PROJECTION_BP_SCALE | 10000 | `packages/shared/src/constants/gameplay/qi.ts` |
| DEFAULT_QI_EFFICIENCY_BP | 10000（= 1.0） | 同上 |
| QI_HALF_LIFE_RATE_SCALE | 1,000,000,000 | 同上 |
| BASE_MAX_QI | 50 | `packages/shared/src/constants/gameplay/combat.ts` |
| BASE_MAX_QI_OUTPUT_PER_TICK | 10 | 同上 |
| BASE_QI_REGEN_RATE | 50（万分比） | 同上 |

## 气机分类

- **家族**：aura(灵气), demonic(魔气), sha(煞气)
- **形态**：refined(凝练), dispersed(逸散)
- **属性**：neutral, metal, wood, water, fire, earth
- **可见性**：hidden, observable, absorbable

## 半衰期公式

```ts
buildQiHalfLifeRateScaled(halfLifeTicks):
  return max(1, round((1 - 0.5^(1/halfLifeTicks)) × 1,000,000,000))
```

### 逸散灵气

- `DISPERSED_AURA_HALF_LIFE_TICKS = 100`
- `DISPERSED_AURA_MIN_DECAY_PER_TICK = 1`

## 灵力面板

- 灵力上限受 talent(+1%/点) 和 meridians(+1%/点) 百分比加成
- 每 tick 恢复：`max(1, round(maxQi × (qiRegenRate / 10000)))`
- 每 tick 最大输出：`maxQiOutputPerTick`（超出部分递增惩罚）
- 启用且已装备法宝的槽位，每 tick 最多抽取 `floor(maxQiOutputPerTick / 10)` 点玩家当前灵力注入法宝，并扣除等额玩家灵力；法宝已满或玩家当前灵力不足时按实际注入量结算

## 灵气投影（qi-projection）

Buff 可携带 `qiProjection` 字段，影响玩家灵气相关属性：
- 修改灵气效率
- 修改灵气恢复速率
- 修改灵气上限

投影层合成虚拟 buff（不写回运行时真源）。

## 相关源文件

- `packages/shared/src/constants/gameplay/qi.ts` — 灵气常量
- `packages/shared/src/constants/gameplay/combat.ts` — 基础面板
- `packages/server/src/runtime/player/player-buff-projection.helpers.ts` — 投影
