# Draft: next Replacement Wave 1

## Requirements (confirmed)
- 对 server-next 的 next 阶段进度做事实导向复盘，并形成可执行下一步计划。
- 将 `server-next` 的验证闭环和文档口径对齐，优先把 `T01/T03/T05/T06/T07` 真源链作为阻塞主线。
- 所有子代理执行风格约束：`5.3-codex-spark`。

## Technical Decisions
- 采用“先收口口径，再单线真源，最后并行尾项”的执行顺序：`T11/T12/T25 -> T01/T03/T05/T06/T07 -> P0/P1/P2 并行尾项`。
- 以 `server-next` 的现有自研 smoke 验证链为主测试框架，沿用四层门禁（local / acceptance / full / shadow-destructive）。
- `docs + server-next/README + TESTING` 的口径必须第一时间对齐，禁止文档与脚本命名不一致。

## Research Findings
- `packages/server-next/README.md`、`packages/server-next/TESTING.md`、`.github/workflows/verify-server-next-with-db.yml` 已确认当前替换定位与验证策略。
- `docs/next-remaining-task-breakdown.md` 与 `docs/next-remaining-execution-plan.md` 已确认任务链与阻塞顺序，关键主线为认证/会话/快照。
- `docs/next-legacy-removal-checklist.md` 与 `docs/next-legacy-boundary-audit.md` 提供 L1-L5 与清理边界约束，禁止盲删。
- `bg_0049ffb0` 的 explore 输出已完成，补齐了关键文件清单与可执行批次建议。

## Open Questions
- 是否现在以“单次执行一轮固定验收”方式推进，还是并行跑可独立的性能与运维尾项？
- shadow-destructive 是否允许在本次周期内触发？（涉及回滚与风险控制）

## Scope Boundaries
- INCLUDE: `docs/next-*`, `packages/server-next/README|TESTING|package.json`, `server-next-operations`、`workflow` 门禁对齐，任务 `T01~T25` 的执行分派与验收。
- EXCLUDE: 未在 Next 迁移链中的功能重构、非 server-next 领域的现有 gameplay 业务重写。
