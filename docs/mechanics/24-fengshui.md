# 风水系统

## 核心常量

源文件: `packages/shared/src/constants/gameplay/fengshui.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| FENGSHUI_SCORE_MIN | -1000 | 风水分下限 |
| FENGSHUI_SCORE_MAX | 1000 | 风水分上限 |
| FENGSHUI_BASE_SCORE | 0 | 基础分 |
| FENGSHUI_FIRST_PASS_SCORE_SCALE | 3 | 子分缩放系数 |
| ROOM_ROLE_MIN_CONFIDENCE | 60 | 角色识别最低置信度 |
| ROOM_ROLE_MIN_LEAD | 30 | 角色识别最低领先值 |
| LARGE_SEMI_OUTDOOR_ROOM_AREA | 256 | 大型半户外面积阈值 |

## 风水等级阈值

| 等级 | 最低分 | 中文 |
|------|--------|------|
| paradise | 900 | 洞天福地 |
| blessed | 750 | 福地 |
| great_good | 600 | 大吉 |
| good | 400 | 吉 |
| minor_good | 200 | 小吉 |
| plain | 0 | 平 |
| minor_bad | -200 | 小凶 |
| bad | -400 | 凶 |
| great_bad | -600 | 大凶 |
| disaster | -800 | 灾 |
| calamity | -1000 | 劫 |

## 五行相生相克

```
相生: 木→火→土→金→水→木
相克: 木克土, 土克水, 水克火, 火克金, 金克木
```

## 房间角色默认五行

| 角色 | 五行 |
|------|------|
| courtyard | 木 |
| meditation | 水 |
| alchemy | 火 |
| artifact | 金 |
| storage | 土 |
| bedroom | 木 |
| sect_hall | 土 |
| generic/outdoor/formation_core | neutral |

## 风水计算公式

源文件: `packages/server/src/runtime/building/fengshui-calculator.service.ts`

```
score = BASE(0)
  + enclosureScore (封闭+80 / 开放-120 / 无门-80)
  + shapeScore (面积6-64: +40 / 屋顶≥80%: +30 / 稳定≥12: +20)
  + roleScore (角色特征匹配: +30~+60)
  + elementScore (相生+45 / 同属+25 / 相克-40~-60)
  + qiScore (密度≥80: +40 / <20: -30 / 泄漏: -min(80, leak×10) / 亲和: +min(60, affinity×10))
  + comfortScore (舒适≥12: +30 / ≤-6: -30)
  + shaScore (煞暴露>15: -90 / >5: -50 / >0: -20 / 已化解: +20 / 有屏风: +20)
  + formationScore

所有子分 ×3 (FENGSHUI_FIRST_PASS_SCORE_SCALE)
generic 角色上限 520
最终: clamp(score - integrityPenalty, -1000, 1000)
```

## 风水加成

风水等级影响:
- 修炼效率加成
- 灵气场密度
- 建筑耐久
