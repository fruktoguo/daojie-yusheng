# 战斗链路 Smoke 说明

本文说明当前战斗链路相关 smoke、audit 和 bench 各自回答什么问题，避免把局部验证误读成完整商业化替换完成。

## Stable Smoke

### `world-runtime-combat-action-service`

命令：

```bash
pnpm --filter @mud/server smoke:world-runtime-combat-action-service
```

回答：

- `CombatAction`、`CombatTarget`、`CombatOutcome` 基础契约是否可用。
- 玩家普攻是否能通过 `resolvePlayerBasicAttackActionPlan()` 统一产出 `basic_attack` definition、目标收集和地图能力合法性拒绝。
- 玩家普攻 action plan 是否覆盖按 `targetMonsterId` 命中阵法、按地块命中阵法边界、按地块命中容器、死亡怪物结构化拒绝等生产路由语义。
- 玩家技能是否能通过 `resolvePlayerSkillActionPlan()` 在生产执行前完成范围目标收集、即时阶段、吟唱完成阶段和资源/冷却拒绝。
- 玩家技能生产分支是否只消费 action plan 的 `selectedTargets`，并通过统一结果适配器应用玩家、怪物、地块、阵法等权威状态，同时保留旧伤害公式、特效、通知和死亡后续编排。
- 玩家普攻、玩家技能、怪物普攻、怪物技能的生产表现/通知调用是否仍能经旧 `CombatEffect` / notice queue 发出；当前调用入口已由 `emitCombatPresentation()` 包装，但真实网络发包真源没有替换。
- 玩家技能按锚点范围收集地块/阵法/玩家/怪物候选时，旧 UI targetRef 是否只决定锚点和优先目标，不再由旧扫描分支决定最终目标列表。
- 玩家技能多目标 partial success、stale target 诊断、吟唱完成 `skipResourceAndCooldown` 是否保持。
- 怪物技能预警格、无目标、目标跨实例、死亡、视线阻挡是否有结构化拒绝。
- 怪物技能完成阶段是否能通过 `resolveMonsterSkillActionPlan()` 统一产出 action definition、distance anchor、预警格目标和合法性结果。
- 怪物技能吟唱开始是否能通过 `resolveMonsterSkillChantStartPlan()` 统一产出 action definition、预警格、duration、warningColor 和缺 skillId/实例/怪物/技能/死亡等结构化拒绝。
- 怪物技能执行期 stale target 是否通过 `revalidateMonsterSkillTargetForApply()` 统一诊断，避免循环内无原因跳过。
- dry-run 阶段是否记录 phase、duration、heap delta。
- AOI/Notice/Audit/Diagnostic 事件分层是否保持。
- 内部事件查询 helper 是否能查审计、聚合诊断、查怪物技能失败原因和热力点。

不回答：

- 旧生产服务编排、旧 `WorldDelta.fx` / `S2C.Notice` 发包真源是否已经全部删除。
- 玩家普攻掉落、死亡后续是否已经全部改由统一事件/adapter 执行。
- 怪物技能死亡后续是否已经全部改由统一事件/adapter 执行。
- `CombatLayeredEvents` 是否已经替代现有 `WorldDelta.fx` / `S2C.Notice` 发包链路。
- 战斗审计是否已完成数据库复合查询、跨重启查询和击杀/掉落/死亡语义分类。
- pending cast 是否可断线或重启恢复。

### `world-runtime-player-combat`

命令：

```bash
node packages/server/dist/tools/world-runtime-player-combat-smoke.js
```

回答：

- 怪物掉落直入背包是否走 `grantInventoryItems` durable 主链。
- PvP 血精奖励直入背包是否走 `grantInventoryItems` durable 主链。
- 缺少 durable runtime owner/session/服务条件时是否 fail closed，不再回退到运行态背包。
- durable 提交失败时是否回滚运行态背包并落地为地面掉落补偿。
- PvP 击杀时命中的反击目标清理是否仍保持。

不回答：

- 地面拾取、容器拿取、NPC 奖励等其他资产入口是否已经全部 durable 化。
- 战斗审计是否已覆盖真实战斗 tick 的所有击杀/掉落/死亡语义。
- 怪物死亡掉落记录是否已有独立数据库审计表。

### `world-runtime-combat-boundary`

命令：

```bash
node packages/server/dist/tools/run-stable-smoke-suite.js --case world-runtime-combat-boundary
```

回答：

- 战斗编排器和 combat runtime helper 是否没有直接 `socket.emit` / `S2C` 发包。
- 战斗编排器和 combat runtime helper 是否没有直接 `pg` / SQL 查询 / 文件 IO。
- 战斗编排器和 combat runtime helper 是否没有引入 `JSON.stringify` / `JSON.parse` 热路径。
- 战斗分层仍保持 AOI、Notice、audit、diagnostic 的边界声明。

不回答：

- 旧生产分支是否已经删除。
- `CombatLayeredEvents` 是否已经替代现有 `WorldDelta.fx` / `S2C.Notice` 发包链路。
- 战斗审计数据库复合查询和跨重启运维查询是否已完成。

### `combat`

命令：

```bash
pnpm --filter @mud/server smoke:combat
```

回答：

- 玩家战斗旧生产路径是否仍可运行。
- 玩家技能、通知、击杀等旧行为是否没有被当前包装破坏。
- 玩家普攻生产入口切到 action plan 路由后，玩家技能生产入口消费 action plan 目标裁定后，旧生产行为是否仍可运行。

不回答：

- 玩家战斗是否已经全量走统一主链路。
- 玩家技能旧目标收集、旧伤害应用和旧 `S2C.Notice` 发包真源是否已经删除。

### `monster-combat`

命令：

```bash
pnpm --filter @mud/server smoke:monster-combat
```

回答：

- 怪物攻击玩家的旧生产路径是否仍稳定。
- 怪物命中和闪避通知是否仍存在。

不回答：

- 怪物 AI 是否只生成统一 `CombatAction`。

### `monster-skill`

命令：

```bash
pnpm --filter @mud/server smoke:monster-skill
```

回答：

- 怪物技能配置、释放、吟唱和预警格结算是否仍可跑通。
- 唤灵真人技能顺序和 fallback 是否符合当前配置预期。

不回答：

- 所有怪物技能资源、冷却、多目标策略是否已经完全统一。

### `world-runtime-monster-los`

命令：

```bash
node packages/server/dist/tools/world-runtime-monster-los-smoke.js
```

回答：

- 妖兽索敌、攻击和视线判断是否不会穿墙。
- 动态阵法边界是否阻挡通行但不遮挡视线。
- 怪物吟唱完成时，即使原 `targetPlayerId` 已离开实例，也会保留锚点和预警格产出技能 action，不在实例 tick 阶段静默丢弃。
- 怪物 pending cast 死亡、过期、配置 revision 不匹配时是否产出 `skill_cancel` 内部 action。
- 怪物 pending cast 是否不写持久化快照，hydrate 时是否显式清空。
- 怪物瞬发/吟唱技能是否在受控 tick 生产阶段预提交元气和冷却，并写入 monster runtime dirty。
- 怪物吟唱 pending cast 是否保存资源/冷却提交快照，完成时是否不重复扣元气。
- 怪物元气不足时是否不产出技能 action 或冷却提交。

不回答：

- 怪物技能表现、玩家通知和死亡后续是否已经完全由统一事件/adapter 执行。
- 怪物 pending cast 是否支持 Redis 恢复。
- 真实 AOI 广播和 protobuf 序列化成本。

### 地块、阵法、容器

命令：

```bash
node packages/server/dist/tools/run-stable-smoke-suite.js --case world-runtime-damageable-tile --case world-runtime-formation --case world-runtime-loot-container
```

回答：

- 地块扣耐久、阵法扣灵力、容器扣次数等旧行为是否仍稳定。
- 当前结果应用适配器和 `applyCombatOutcome(record: true)` 没有改变旧行为，且地块、阵法、容器的最终应用结果会合并回 `CombatOutcome`。
- 玩家普攻生产入口按 action plan 路由后，地块、阵法、容器旧应用分支是否仍稳定。
- 玩家技能生产入口按 action plan 裁定后，地块、阵法和阵法边界旧应用分支是否仍稳定。

不回答：

- 目标类型分支是否已经只保留在结果应用适配器；当前生产服务仍保留旧后续副作用分支，表现/通知调用只是已统一包装到 helper。

### `combat-formula-main-parity`

回答：

- 当前命中伤害公式和参考 main 的关键样本是否保持一致。

不回答：

- 所有技能和所有怪物配置的数值都已经完整回归。

## 协议和边界

### `pnpm audit:protocol`

回答：

- shared/server/client 协议载荷是否仍兼容。
- 战斗内部 audit/diagnostic 类型是否没有进入普通 S2C payload。
- AOI 表现事件是否仍保持小字段和小包体边界。
- 战斗服务侧表现/通知 helper 是否仍只包装旧 `CombatEffect` / notice queue，不直接发 socket。

不回答：

- 战斗审计是否已持久化。

### `pnpm audit:boundaries`

回答：

- 本轮边界审计是否发现新的明显跨层直连。

不回答：

- 所有旧战斗分支是否已经清理完成。

### `persistence-retirement-audit`

回答：

- 旧整档快照、通用文档桶、钱包 fallback 等已退役主线是否没有被重新引用。
- 战斗掉落和 PvP 奖励是否没有恢复缺 durable 条件时的运行态背包 fallback。

不回答：

- 新 outbox、审计表、with-db 恢复链是否已经实现。

## 静态检查

### 生产表现/通知入口搜索

命令：

```bash
rg -n "pushAttackEffect|pushDamageFloatEffect|pushCombatTextFloatEffect|pushActionLabelEffect|pushCombatEffect\\(|queuePlayerNotice\\?\\(|queuePlayerNotice\\(" packages/server/src/runtime/world/world-runtime-basic-attack.service.ts packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts packages/server/src/runtime/world/world-runtime-monster-action-apply.service.ts packages/server/src/runtime/world/world-runtime-combat-presentation.helpers.ts
```

回答：

- 三个生产战斗服务是否仍有绕过 `emitCombatPresentation()` 的 attack、damage float、combat text、action label、warning zone 或玩家战斗通知调用。
- `world-runtime-combat-presentation.helpers.ts` 是否是这些旧表现/通知方法的唯一包装点。

不回答：

- `CombatLayeredEvents` 是否已经成为生产网络真源。
- AOI 真实序列化广播耗时和客户端展示是否已完成全链路验收。

## 性能

### `pnpm --filter @mud/server bench:combat`

回答：

- `PlayerCombatService.castSkill` 单目标直接结算耗时。
- `WorldRuntimeCombatActionService` dry-run 单目标耗时。
- 100 候选目标收集耗时。
- 单目标合法性判断耗时。
- 单目标底层命中结算耗时。
- 100 个内部战斗事件对象构建耗时。
- 100 玩家普攻核心批处理的公式和事件构建耗时。
- 50 怪物技能核心批处理的合法性、命中和事件构建耗时。

不回答：

- 100 玩家同时普攻的完整地图实例 tick 是否小于 50ms。
- 50 怪物同时释放技能的完整地图实例 tick 是否小于 100ms。
- AOI 广播 100 个事件序列化是否小于 10ms。
- 完整生产主链路是否已经替换旧分支。

## with-db 边界

当前战斗链路已经新增战斗审计 outbox/asset audit 基础落库，因此持久化相关验收需要纳入 with-db smoke；但它仍不等于完整战斗审计语义、跨重启查询或 Redis pending cast 恢复已经完成。

### `combat-audit-outbox`

命令：

```bash
pnpm --filter @mud/server smoke:combat-audit-outbox
```

回答：

- 有数据库环境时，成功 `CombatAuditEvent` 是否先同步进入 `CombatAuditOutboxService` 内存队列。
- `flushOnce()` 是否能异步写入 `outbox_event(topic=combat.audit.recorded)`。
- 同一事件是否能写入 `asset_audit_log(asset_type=combat)`。
- `asset_audit_log` 中的战斗审计是否能按玩家、实例、目标和时间范围查询。
- 服务销毁并重建后，数据库审计记录是否仍可回读。
- smoke 创建的审计和 outbox 行是否按 operationId 自动清理。

不回答：

- 真实战斗 tick 是否已经覆盖所有击杀、掉落、经验、死亡、资产变更语义。
- outbox worker 是否已经消费 `combat.audit.recorded` topic 并投递到外部系统。
- pending cast 是否支持 Redis/DB 恢复。

后续只有在以下能力实现后，才应补 with-db：

- 审计查询接口或运维工具。
- pending cast Redis/DB 恢复。
- 玩家死亡惩罚、怪物掉落、地块破坏等持久化恢复链专项验证。
