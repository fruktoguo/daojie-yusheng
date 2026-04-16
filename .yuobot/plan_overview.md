# Plan Overview

# Plan Overview

- Plan ID: `b75fa78774ba`
- Generated At: `2026-04-16T08:54:43.489Z`
- Follow-up Required: `true`

## Objective

任务目标：\n分析next,把所有没有完成重构部分对比legacy补上todo,和现有的todo一样\n\n结束要求：\n基本上没有遗漏就行,或者一个小时后

## Summary

本轮可按完成收口。主代理在上一轮已完成全量扫描、补齐遗漏 `TODO(next:...)`、并通过 shared/server/client 的最小构建验证；本轮又做了定向漏扫与人工对位，没有再发现需要新增的迁移尾项。按用户“基本上没有遗漏就行”的结束标准，当前结果已满足交付。

## Workstreams

- next 对 legacy 的 TODO 补齐 [done]
  evidence: 前序轮次已补入 14 处源码 `TODO(next:...)`，覆盖 `packages/server/src/http/next/*`、`packages/shared/src/*`、`packages/client/src/ui/*`、`packages/client/src/network/socket.ts`、`packages/server/src/tools/next-auth-bootstrap-smoke/*`。
  next: 无需继续全量补扫，保持后续增量检查口径一致即可。
- 定向漏扫与人工对位 [done]
  evidence: 本轮重点核对了 `packages/client/src/ui/side-panel.ts`、`packages/client/src/game-map/store/map-store.ts`、`packages/server/src/network/world-sync-protocol.service.js`、`packages/server/src/network/world-client-event.service.js`，结论均为已收敛的 next-native 结构或协议分发层，未见明确未完成重构语义。
  next: 默认不再扩扫；若要加保险，只做少量抽样复核。
- 宽口径迁移尾项扫描 [done]
  evidence: 带 `legacy/compat` 语义但缺少 `TODO(next:...)` 的源码文件维持为 0；主代理说明三份看板文档与当前源码口径一致。
  next: 后续新增桥接代码时沿用相同扫描规则。
- 机械验证 [done]
  evidence: 上一轮已完成 `pnpm --filter @mud/shared-next build`、`pnpm --filter @mud/server-next compile`、`pnpm --filter @mud/client-next build`，均通过。
  next: 本目标已无需追加更重验证，除非用户要求行为级对齐检查。

## Risks

- 当前结论基于文本扫描加人工抽查，仍存在小概率隐性遗漏：某些文件可能不带 `legacy/compat` 痕迹但仍承接迁移语义。
- 现有验证覆盖编译与构建，不等于逐条运行时行为都已与 legacy 完全对齐。
- 若后续对任务编号或 TODO 分类口径做统一重整，现有标注可能需要再归并。

## Next Steps

- 按当前结果结束本轮并交付。
- 如果需要更高置信度，仅追加少量人工抽样复核，不建议再做一轮全量扩扫。
- 后续新增 next/legacy 桥接代码时，继续使用当前 `TODO(next:...)` 标注和漏扫口径。

## Review Completion Summary

目标可按当前标准收口。已经完成基于文本扫描与人工对位的迁移尾项排查，并将源码与现有 TODO 看板口径对齐；没有再发现明显遗漏的未完成重构部分需要补 TODO。残余风险仅是 planner 已注明的小概率隐性遗漏。

## Runtime Data

| Key | Value |
| --- | --- |
| Plan Mode | auto |
| Round | 14 |
| Session ID | 019d9563-549a-7550-8e99-c57704a96b28 |
| Latest Review Status | continue |
| Follow-up Required | true |
| Latest Plan Next Explore | 可选：统计 `TODO(next:...)` 在 server/client/shared 的分布，整理成迁移看板，便于后续按模块推进。 |
| Updated At | 2026-04-16T09:01:17.346Z |
