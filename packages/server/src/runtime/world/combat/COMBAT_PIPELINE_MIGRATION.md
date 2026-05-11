# 战斗 CombatAction 统一管线迁移追踪

## 目标

所有战斗行为（玩家普攻、玩家技能、怪物普攻、怪物技能、吟唱）统一流经 `CombatAction` 主链路，旧生产分支完全退役。

目标链路：

```text
战斗意图 → 统一 CombatAction → 目标解析 → 合法性判断 → 资源/冷却/吟唱
→ 命中与效果结算 → 按目标类型应用结果 → 表现/通知/审计/诊断
```

## 已完成

以下工作已落地（对应重构计划阶段 0-14 全部勾选）：

- **ADR 已采纳**：`docs/architecture/ADR-战斗链路统一分层与过渡迁移.md`
- **统一类型定义**：`combat-action.types.ts` 定义 `CombatAction`、`CombatTarget`、`CombatOutcome`、`CombatRejectReason`、`CombatActionPhase`
- **统一编排服务**：`WorldRuntimeCombatActionService` 覆盖动作定义解析、目标收集、合法性校验、资源/冷却 dry-run、结构化拒绝、outcome 记录、事件构建
- **Wrapper 与 Adapter**：
  - `WorldRuntimeCombatCommandService.dispatchBasicAttack()` 先包装为 `CombatAction`，再通过过渡回调委托旧 `WorldRuntimeBasicAttackService`
  - `dispatchCastSkill()` 同理包装后委托旧技能服务
  - 结果应用经 `applyCombatOutcome()` 和目标适配器落到玩家/怪物/地块/阵法/容器权威状态
- **目标裁定统一**：玩家普攻、玩家技能、怪物技能的生产目标收集已消费统一 action plan（`resolvePlayerBasicAttackActionPlan`、`resolvePlayerSkillActionPlan`、`resolveMonsterSkillActionPlan`）
- **表现收敛**：`emitCombatPresentation()` 统一包装所有战斗表现和通知
- **审计 Outbox**：`CombatAuditOutboxService` 异步 flush 到 `outbox_event` + `asset_audit_log`
- **Smoke/Bench 覆盖**：`smoke:combat-matrix`、`bench:combat`、`world-runtime-combat-boundary-smoke` 等已覆盖核心契约

## 剩余迁移步骤

虽然阶段 10-14 的勾选项已完成，但 ADR 和链路文档明确指出以下过渡态仍在生产运行：

### 1. 旧生产服务薄编排器收敛

- [ ] `WorldRuntimeBasicAttackService` 仍承担命中公式调用和死亡后续编排，需收敛为纯 adapter 或删除
- [ ] `WorldRuntimePlayerSkillDispatchService` 中 `dispatchSkillTargets()` 仍保留目标类型编排和表现过渡职责，需收敛
- [ ] `WorldRuntimeMonsterActionApplyService` 中旧伤害/通知/死亡副作用仍保留，需迁入统一链路

### 2. 旧入口路由切换

- [ ] `WorldRuntimePlayerCommandService` 中 `basicAttack`、`castSkill` 命令路由应直接进入统一管线，不再经过 `WorldRuntimeCombatCommandService` 的过渡回调分支
- [ ] `WorldRuntimeCombatCommandService.dispatchBasicAttack()` 中的 fallback 路径（直接调旧服务）应删除
- [ ] `WorldRuntimeCombatCommandService.dispatchCastSkill()` 同理

### 3. 持久化与恢复链

- [ ] Pending cast 写入 Redis/DB，支持断线重连和服务重启恢复
- [ ] 击杀、掉落、经验、死亡等语义化审计分类和数据库复合查询

### 4. 性能验证补齐

- [ ] 100 玩家 + 50 怪物并发场景完整性能基准

## 验收标准

迁移完成时必须满足：

1. **无旧分支生产路径**：`WorldRuntimeBasicAttackService`、旧 `dispatchSkillTargets()` 和旧 `applyMonsterSkill` 中不再有生产结算逻辑，只保留空壳或已删除
2. **统一入口**：`WorldRuntimePlayerCommandService` 的 `basicAttack`/`castSkill` 命令直接路由到统一 `CombatAction` 管线，无 fallback
3. **结构化拒绝全覆盖**：任何 action 被拒绝都有 `CombatRejectReason`，无静默 return
4. **Outcome 全记录**：所有进入结算的目标（含闪避、免疫、0 伤害）都产生 `CombatOutcome`
5. **持久化恢复**：pending cast 可从 Redis 恢复为同形态 `CombatAction` 或结构化取消
6. **热路径合规**：战斗编排器不直接访问数据库、不组装 socket 包、不做 JSON 序列化
7. **Smoke 全绿**：`smoke:combat-matrix`、`smoke:combat`、`smoke:monster-combat`、`smoke:monster-skill`、`bench:combat` 全部通过
8. **数值不漂移**：迁移前后同输入同输出，命中/伤害/通知文案保持一致

## 相关文档

- ADR：`docs/architecture/ADR-战斗链路统一分层与过渡迁移.md`
- 重构计划：`docs/plans/战斗链路商业化重构计划.md`
- 链路说明：`docs/chains/战斗链路.md`
- 运维手册：`docs/runbook/战斗链路运维手册.md`
- Smoke 说明：`docs/runbook/战斗链路-smoke说明.md`
