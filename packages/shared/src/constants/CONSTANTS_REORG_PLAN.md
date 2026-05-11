# 常量整理计划

## 现状

`constants/` 目录已按 `gameplay/`、`network/`、`ui/`、`visuals/` 四个分组组织，结构清晰。
但仍有部分常量散落在 `shared/src/` 根级业务类型文件中，与类型定义混合。

## 散落常量清单

| 源文件 | 常量数量 | 建议归属 | 说明 |
|--------|----------|----------|------|
| `formation-types.ts` | 27 | `constants/gameplay/formation.ts` | 阵法灵石、灵气、持续时间等游戏数值常量 |
| `enhancement.ts` | 12 | `constants/gameplay/enhancement.ts` | 强化等级、成功率、消耗等游戏数值常量 |
| `technique.ts` | 8 | 已有 `constants/gameplay/technique.ts` 覆盖大部分，剩余可合并 | schema 版本、层数范围等 |
| `combat-event-types.ts` | 6 | `constants/gameplay/combat.ts` 或 `constants/network/combat.ts` | 协议层字段预算、分层标识 |
| `mail.ts` | 6 | `constants/gameplay/mail.ts`（新建）| 邮件模板 ID、过滤器列表 |
| `qi.ts` | 7 | 已有 `constants/gameplay/qi.ts` 覆盖大部分，剩余可合并 | 默认资源描述符 |
| `value.ts` | 7 | `constants/gameplay/attributes.ts` 扩展 | 属性点换算表 |
| `automation-types.ts` | 5 | `constants/gameplay/combat.ts` 扩展 | 自动战斗默认配置 |
| `craft-skill.ts` | 4 | `constants/gameplay/craft.ts`（新建）| 制作技能等级常量 |
| `alchemy.ts` | 3 | `constants/gameplay/craft.ts`（新建）| 炼丹基础常量 |
| `market-price.ts` | 3 | `constants/gameplay/market.ts`（新建）| 市场价格计算常量 |
| `network-protobuf-schema.ts` | 6 | 保持原位 | protobuf 类型引用，非纯常量 |

## 已组织良好（无需变动）

- `constants/gameplay/` — 20 个文件，覆盖核心玩法数值
- `constants/network/` — 3 个文件，覆盖连接、会话、账号
- `constants/ui/` — 5 个文件，覆盖标签、运行时、会话、邮件、存储
- `constants/visuals/` — 5 个文件，覆盖地形、灵气、战斗、相机、小地图

## 建议操作优先级

### 高优先（常量数量多、与类型混合严重）

1. `formation-types.ts` → 提取 27 个常量到 `constants/gameplay/formation.ts`
2. `enhancement.ts` → 提取 12 个常量到 `constants/gameplay/enhancement.ts`

### 中优先（少量常量，可在下次修改时顺手迁移）

3. `mail.ts` → 新建 `constants/gameplay/mail.ts`
4. `value.ts` → 合并到 `constants/gameplay/attributes.ts`
5. `combat-event-types.ts` → 合并到 `constants/gameplay/combat.ts`

### 低优先（常量与类型紧密耦合，拆分收益有限）

6. `technique.ts` → 合并到已有 `constants/gameplay/technique.ts`
7. `qi.ts` → 合并到已有 `constants/gameplay/qi.ts`
8. `automation-types.ts`、`craft-skill.ts`、`alchemy.ts`、`market-price.ts` → 按需新建

## 执行原则

- 提取后原文件改为从 `constants/` re-export，保持外部 import 兼容
- 不改变常量的值或语义
- 每次提取后运行 `pnpm build:shared` 确认编译通过
- `network-protobuf-schema.ts` 中的 `lookupType` 结果不是纯常量，保持原位
