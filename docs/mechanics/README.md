# 道劫余生 — 游戏机制文档

本目录按系统域分类，覆盖项目中所有游戏系统的数值公式、计算规则和运行逻辑。

---

## 目录结构

```
docs/mechanics/
├── core-loop/        核心循环（Tick、AOI、移动、地图）
├── combat/           战斗域（流程、伤害、威胁、怪物）
├── growth/           角色成长（属性、境界、灵气、功法、Buff、离线）
├── technique/        技艺系统（炼丹、锻造、强化、建造、经验）
├── building-env/     建筑与环境（建筑拓扑、风水、灵气场）
├── equipment-items/  装备与物品（装备、背包、阵法）
├── economy/          社交与经济（市场、邮件、宗门、排行榜）
└── other/            其他系统（副本、NPC、任务、兑换码、GM、Actor）
```

---

## 核心循环 · `core-loop/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [01-tick-scheduling](./core-loop/01-tick-scheduling.md) | Tick 与调度 | 1Hz 频率、tick 阶段划分、实例异速行动、跳帧检测 |
| [02-aoi-sync](./core-loop/02-aoi-sync.md) | AOI 与同步 | Shadowcasting FOV、增量 delta、包体分层 |
| [03-movement-pathfinding](./core-loop/03-movement-pathfinding.md) | 移动与寻路 | 移动点数、软上限衰减、A* 参数、占位规则 |
| [04-map-terrain](./core-loop/04-map-terrain.md) | 地图与地形 | 地块 HP、恢复公式、地形类型、实例生命周期 |

---

## 战斗域 · `combat/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [00-combat-numeric-system](./combat/00-combat-numeric-system.md) | 战斗公式与数值系统总览 | 属性结算、护甲/魔抗减伤、暴击、冷却、灵力消耗、怪物数值 |
| [05-combat-flow](./combat/05-combat-flow.md) | 战斗流程 | 管线顺序、技能施放、吟唱、事件环、自动战斗 |
| [06-damage-calculation](./combat/06-damage-calculation.md) | 伤害计算 | 对抗率公式、破防/闪避/暴击判定、防御减伤、境界差乘区 |
| [07-threat-system](./combat/07-threat-system.md) | 威胁系统 | 仇恨计算、距离衰减、丢失目标衰减、目标选择 |
| [08-monster-ai](./combat/08-monster-ai.md) | 怪物 AI | 行动决策、目标解析、技能选择、属性比例化 |
| [09-monster-spawn-drop](./combat/09-monster-spawn-drop.md) | 怪物刷新与掉落 | 清场加速、掉落概率、地块掉落倍率、击杀经验 |

---

## 角色成长 · `growth/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [10-attributes](./growth/10-attributes.md) | 属性系统 | 六维定义、百分比乘区、属性结算流程、境界缩放 |
| [11-realm-cultivation](./growth/11-realm-cultivation.md) | 境界与修炼 | 34 大境界体系、突破条件、修炼经验、底蕴机制 |
| [12-qi-system](./growth/12-qi-system.md) | 灵气/气海 | 半衰期公式、气机分类、灵力恢复、投影 |
| [13-technique-skill](./growth/13-technique-skill.md) | 功法与技能 | 品阶经验倍率、等级差修正、技能公式 AST |
| [14-buff-system](./growth/14-buff-system.md) | Buff 系统 | 叠加规则、境界衰减、丹药分层、投影 |
| [15-offline-gain](./growth/15-offline-gain.md) | 离线收益 | 服务端持续 tick、收益等价在线、报告条件 |

---

## 技艺系统 · `technique/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [16-alchemy](./technique/16-alchemy.md) | 炼丹 | 成功率赔率空间公式、耗时、灵石消耗、产出 |
| [17-forging](./technique/17-forging.md) | 炼器/锻造 | 与炼丹共用框架、产出数量差异 |
| [18-enhancement](./technique/18-enhancement.md) | 强化 | 分段成功率、失败规则、属性增幅 1.1^n |
| [21-building-craft](./technique/21-building-craft.md) | 建造（技艺） | 条件型技艺、activeBuilder 机制 |
| [22-craft-skill-exp](./technique/22-craft-skill-exp.md) | 制作技能经验 | 统一经验公式、前期补偿、队列系统 |

---

## 建筑与环境 · `building-env/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [23-building-system](./building-env/23-building-system.md) | 建筑系统 | 5 层放置、拓扑标志位、房间检测 BFS |
| [24-fengshui](./building-env/24-fengshui.md) | 风水系统 | 评分公式、五行相生相克、11 级风水等级 |
| [25-aura-system](./building-env/25-aura-system.md) | 灵气场 | 半衰期 86400 息、整数余数模型、等级阈值 |

---

## 装备与物品 · `equipment-items/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [26-equipment](./equipment-items/26-equipment.md) | 装备系统 | 基准值公式、品阶倍率、效果触发器 |
| [27-inventory-items](./equipment-items/27-inventory-items.md) | 背包与物品 | 堆叠签名、容量 200、地面物品过期 |
| [28-formation](./equipment-items/28-formation.md) | 阵法系统 | 灵气预算、半径计算、4 种内置阵法 |

---

## 社交与经济 · `economy/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [29-market](./economy/29-market.md) | 市场交易 | 价格档位、拍卖行上架费、延时窗口 |
| [30-mail](./economy/30-mail.md) | 邮件系统 | 分页、过期机制、LRU 邮箱缓存 |
| [31-sect](./economy/31-sect.md) | 宗门系统 | 角色权限、护宗大阵、领地扩展 |
| [32-leaderboard](./economy/32-leaderboard.md) | 排行榜 | 9 种榜单、10 分钟刷新、世界摘要 |

---

## 其他系统 · `other/`

| 文件 | 系统 | 关键内容 |
|------|------|----------|
| [33-tongtian-tower](./other/33-tongtian-tower.md) | 通天塔/副本 | 无上限层数、波次生成、持久化策略 |
| [34-npc-shop](./other/34-npc-shop.md) | NPC 与商店 | 静态定价、邻近判定、Durable Operation |
| [35-quest](./other/35-quest.md) | 任务系统 | 状态机、6 种目标类型、任务链 |
| [36-redeem](./other/36-redeem.md) | 兑换码 | 频率限制 3s、单次上限 5 码、分组管理 |
| [37-automation](./other/37-automation.md) | 自动化/挂机 | 目标评分、自动用药、静止模式 |
| [38-gm-system](./other/38-gm-system.md) | GM 系统 | scrypt 鉴权、命令列表、HTTP 端点 |
| [39-actor-system](./other/39-actor-system.md) | Actor 系统 | 蓝图 LRU、持久化策略、临时身份 |
