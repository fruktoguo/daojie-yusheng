# ADR：战斗链路统一分层与过渡迁移

## 状态

已采纳，分阶段迁移中。

## 背景

当前生产主线的战斗行为来自多条旧分支：玩家普攻、玩家技能、怪物普攻、怪物技能、地块、阵法和容器都有各自的入口和结果应用路径。底层命中伤害公式已有复用，但进入公式之前的目标解析、合法性判断、吟唱完成、通知和诊断并不统一。

商业化目标是让战斗在服务端权威运行时内形成一条主链路，同时保持旧玩法数值、通知文案、资源扣除和冷却顺序不漂移。

## 决策

1. 先统一服务端内部模型，不先扩散为新的客户端 S2C 事件名。
2. 所有输入先归一为 `CombatAction`，所有目标归一为 `CombatTarget`，所有结算结果归一为 `CombatOutcome`。
3. 普攻建模为内置 `basic_attack` action，和技能共用目标解析、合法性、命中结算和事件分层。
4. 目标类型只应在结果应用阶段分支；玩家、怪物、地块、阵法、容器各自由适配器写回对应运行态。
5. 事件分为四层：AOI 表现 `world_delta_fx`、玩家通知 `notice`、内部审计 `audit_internal`、内部诊断 `diagnostic_internal`。
6. 过渡期保留旧生产分支，通过 wrapper、outcome 记录、adapter 契约和 smoke 逐步替换。
7. tick 热路径不直接访问数据库、不组装 socket 包、不做协议序列化。
8. 审计持久化和 pending cast 恢复链放在后续持久化阶段，通过 outbox、Redis 或数据库真源实现，不在当前运行时服务内直接写库。

## 当前实现边界

已完成：

- `combat-action.types.ts` 定义内部动作、目标、结果和拒绝原因。
- `WorldRuntimeCombatActionService` 提供 action definition、target collection、target validation、resource/cooldown dry-run、outcome、event 和 diagnostic 构建。
- 玩家和怪物 pending cast 已同形态内存化，并可恢复为 `CombatAction`。
- 怪物技能预警格完成时按当前格子玩家重新收集目标。
- 结果应用适配器已经覆盖玩家、怪物、地块、阵法、容器的可注入契约。
- `packages/server/src/runtime/combat/combat-event-query.ts` 提供内部审计和诊断查询 helper。
- shared 协议门禁确认内部审计/诊断不进入普通客户端 payload。

未完成：

- 旧玩家普攻、玩家技能、怪物普攻、怪物技能生产分支未全量替换。
- 审计事件未通过 outbox 持久化。
- pending cast 未写 Redis/DB，断线重连和重启恢复未完成。
- AOI/通知事件构建器未接管所有生产分支。
- 完整并发性能基准未覆盖 100 玩家和 50 怪物场景。

## 后果

正面影响：

- 新链路可以在不改变旧玩法的前提下逐步接管。
- 拒绝原因机器可读，怪物吟唱落空不再无原因静默。
- 协议层保持稳定，普通客户端不会收到诊断和审计长文本。
- 运行时、协议、持久化、运维查询职责更清晰。

代价：

- 过渡期会同时存在 wrapper 和旧分支，代码重复暂时不会完全消失。
- 计划勾选必须区分“契约/smoke 已有”和“生产分支已切换”。
- 持久化审计和 pending cast 恢复需要单独阶段完成，不能用内部数组查询替代。

## 验证

当前主要验证入口：

- `pnpm --filter @mud/server smoke:world-runtime-combat-action-service`
- `pnpm --filter @mud/server smoke:combat`
- `pnpm --filter @mud/server smoke:monster-combat`
- `pnpm --filter @mud/server smoke:monster-skill`
- `pnpm --filter @mud/server bench:combat`
- `pnpm audit:protocol`
- `pnpm audit:boundaries`
- `pnpm --filter @mud/server proof:production-boundaries`
