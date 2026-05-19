# 怪物 AI 链路

## 概述

怪物 AI 链路负责怪物的行为决策、目标追踪、攻击执行和死亡复活的完整流程。怪物 AI 在每个 tick 中由地图实例驱动。

## 链路流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  目标解析   │────▶│  行为决策   │────▶│  动作执行   │────▶│  死亡/复活  │
│  (仇恨感知) │     │  (追击/闲逛)│     │  (攻击/移动)│     │  (倒计时)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `runtime/instance/map-instance-monster-advancer.ts` | 纯函数：AI 目标解析、移动决策、闲逛、追击 |
| `runtime/instance/map-instance.runtime.ts` | 实例 tick 中调用 advancer + 技能释放 + 复活 |
| `runtime/world/world-runtime-respawn.service.ts` | 怪物复活调度 |
| `runtime/world/world-runtime-monster-action-apply.service.ts` | 怪物行动落地 |

## 每 Tick 行为（advanceMonsters）

### 1. 死亡怪物处理

```
怪物 alive = false
  │
  ├─▶ 取消 pendingCast
  ├─▶ respawnLeft--
  └─▶ respawnLeft = 0 → respawnMonster()
        - 找出生点附近空地
        - alive = true, 满血满气
        - 重新应用初始 buff
```

### 2. 存活怪物 AI

```
每 tick 对每个存活怪物：
  │
  ├─▶ buff tick + 派生属性重算 + HP/QI 自然恢复
  │
  ├─▶ 若有 pendingCast（蓄力中）
  │     - 检查取消条件
  │     - remainingTicks--
  │     - 到 0 → 释放技能
  │
  ├─▶ resolveMonsterTarget() 目标解析
  │     - 优先保持当前仇恨目标（视野内 + leash 范围内）
  │     - 否则在 aggroRange 内找最近可见玩家
  │
  ├─▶ 有目标：
  │     - 选技能 → 蓄力/释放
  │     - 距离不够 → 朝目标移动
  │
  └─▶ 无目标：
        - 丢失视野 3 tick 内追击最后已知位置
        - 超出 wanderRadius → 回归出生点
        - 否则 35% 概率随机闲逛一步
```

## 击败与复活

### 击败

```
markMonsterDefeated()
  │
  ├─▶ alive = false, hp/qi = 0
  ├─▶ 设置 respawnLeft（含加速机制）
  ├─▶ 清仇恨 / 清 buff
  └─▶ 触发掉落结算
```

### 清场加速

```
同 spawnKey 组全灭后：
  respawnSpeedBonusPercent 递增
  → 缩短下次复活间隔
```

## 关键参数

| 参数 | 说明 |
|------|------|
| `aggroRange` | 仇恨感知半径，结合 shadowcasting 视野 |
| `leashRange` | 目标超出出生点此范围则脱战 |
| `wanderRadius` | 闲逛不超出出生点此半径 |
| `attackCooldownTicks` | 攻击冷却 |
| `MONSTER_LOST_SIGHT_CHASE_TICKS` | 丢失视野后最多追 3 tick |

## 关键约束

- **距离计算**: 切比雪夫距离（8 方向等距）
- **视野**: 基于 shadowcasting 算法
- **脱战**: 目标超出 leashRange 自动脱战回归
- **纯函数**: advancer 是纯函数模块，不持有状态
- **频率**: 每 tick 执行一次 AI 决策

## 相关文档

- [战斗链路](战斗链路.md)
- [Tick 模型](../architecture/0002-tick-model.md)
