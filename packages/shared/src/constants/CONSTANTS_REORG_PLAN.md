# 常量整理计划

## 现状

`constants/` 目录已按 `gameplay/`、`network/`、`ui/`、`visuals/` 四个分组组织，结构清晰。
散落常量已按优先级完成提取。

## 已完成提取

| 源文件 | 目标 | 状态 |
|--------|------|------|
| `formation-types.ts` (27) | `constants/gameplay/formation.ts` | ✅ 已提取 |
| `enhancement.ts` (10) | `constants/gameplay/enhancement.ts` | ✅ 已提取 |
| `mail.ts` (4) | `constants/gameplay/mail.ts` | ✅ 已提取 |
| `craft-skill.ts` (4) | `constants/gameplay/craft.ts` | ✅ 已提取 |
| `alchemy.ts` (3) | `constants/gameplay/craft.ts` | ✅ 已提取 |
| `market-price.ts` (3) | `constants/gameplay/market.ts` | ✅ 已提取 |

## 保留原位（不迁移）

| 源文件 | 原因 |
|--------|------|
| `network-protobuf-schema.ts` | protobuf 类型引用，非纯常量 |
| `value.ts` | 常量与价值计算逻辑紧密耦合，拆分收益有限 |
| `combat-event-types.ts` | 协议层 spec 对象与类型紧密耦合 |
| `technique.ts` | 内部生成常量，与 schema 逻辑耦合 |
| `qi.ts` | 资源描述符依赖同文件函数 |
| `automation-types.ts` | 默认配置数组与类型紧密耦合 |

## 已组织良好（无需变动）

- `constants/gameplay/` — 25 个文件，覆盖核心玩法数值
- `constants/network/` — 3 个文件，覆盖连接、会话、账号
- `constants/ui/` — 5 个文件，覆盖标签、运行时、会话、邮件、存储
- `constants/visuals/` — 5 个文件，覆盖地形、灵气、战斗、相机、小地图

## 执行原则

- 提取后原文件改为从 `constants/` import，不再 re-export（避免 index.ts 双重导出）
- 不改变常量的值或语义
- 每次提取后运行 `pnpm build:shared` 确认编译通过
- `network-protobuf-schema.ts` 中的 `lookupType` 结果不是纯常量，保持原位
