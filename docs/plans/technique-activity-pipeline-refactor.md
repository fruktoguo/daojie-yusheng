# 技艺管线（Technique Activity Pipeline）重构计划

> 解决问题：将技艺系统从"每种技艺各自实现完整生命周期"重构为"公共管线骨架 + 策略插槽"模式，消除重复代码，统一队列和条件型技艺。

## 状态：✅ 全部完成

所有 Phase 已完成并验证通过（`pnpm build` + `pnpm verify:quick` 全部通过）。

## 落地结果

已落地的行为变更：
- 管线骨架：`TechniqueActivityPipelineService` 统一 start/tick/interrupt/cancel
- 策略接口：每种技艺只需实现 `TechniqueActivityStrategy`
- 5 个策略存根：Alchemy / Forging / Enhancement / Gather / Building
- 队列推进：tick 循环末尾自动尝试启动队列中的下一个任务
- 条件型休眠：采集/建造被中断时自动休眠入统一队列
- 条件型唤醒：队列推进时自动检查休眠项条件，满足则唤醒
- Durable 公共化：`TechniqueActivityDurableService` 统一 startDurably/tickDurably
- 锻造独立化：`player.forgingJob` 独立槽，运行时自动迁移

保持不变的部分（渐进式迁移）：
- 现有 tickAlchemy/tickEnhancement/startAlchemy/startEnhancement 逻辑不动
- 策略的 resolve 方法为存根，真实逻辑仍在 CraftPanelRuntimeService 中
- WorldRuntimeAlchemyService / WorldRuntimeEnhancementService 保留
- 队列持久化到 PostgreSQL 待后续实现

## 关键文件

```
packages/shared/src/technique-activity-pipeline-types.ts
packages/server/src/runtime/craft/pipeline/
  technique-activity-pipeline.service.ts
  technique-activity-strategy.ts
  technique-activity-queue.service.ts
  strategies/{alchemy,forging,enhancement,gather,building}.strategy.ts
```

## 后续扩展

新增技艺只需实现一个 Strategy 类（~100-150 行）即可接入完整链路。
