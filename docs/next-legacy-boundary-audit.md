# server-next 剩余 legacy 边界自动审计

更新时间：2026-04-11（当前轮次）

## 一句话结论

- 这份报告只统计仓库里仍可见的 direct legacy 边界与性能热点，不等于 replace-ready 失败，也不代表完整替换已完成。
- 当前自动审计命中 0 / 22 个检查项，共 0 处代码证据。
- 保守口径已更新：`next` 离“完整替换游戏整体”仍约差 `35% - 40%`。

## 2026-04-11 当前轮次解释

这一轮最容易被误读的地方只有一个：

- `0 / 22`、`0` 只说明 direct boundary inventory 已清零
- 不说明 `auth/token/bootstrap/snapshot/session` 真源已经 next-native
- 也不说明 GM/admin/restore 运营面已经完全 next 化

当前更准确的解释是：

1. `server-next` 主服务里的“还能直接摸到的 legacy/perf 边界”已经基本压薄。
2. 现在真正剩下的问题，已经从“还有多少 direct legacy 命中”转成：
   - `T01-T08` 真源主线还没收完
   - `T09-T14` 真实环境补证和门禁制度化还没收完
   - `T15-T23` 的首包、热路径、shared/client 稳定性还没收完
   - `T24-T25` 的 compat 策略与完成 gate 还没定稿

一句话说：这份 audit 现在更像“边界没有继续扩散”的证明，不是“替换已经完成”的证明。

## 汇总

| 类别 | 命中检查项 | 代码证据 |
| --- | ---: | ---: |
| P0 auth/bootstrap 真源 | 0 / 5 | 0 |
| P0 legacy HTTP/GM/admin | 0 / 3 | 0 |
| P1 world sync compat | 0 / 5 | 0 |
| P1 runtime/persistence compat | 0 / 4 | 0 |
| 目标差距: 性能/扩展 | 0 / 5 | 0 |

## 备注

- 运行命令：`pnpm audit:server-next-boundaries` 或 `pnpm --filter @mud/server-next audit:legacy-boundaries`。
- 报告由 `packages/server/src/tools/audit/next-legacy-boundary-audit.js` 自动生成。
- 这份审计的定位是 inventory，不是 replace-ready 验收，也不会替代 `pnpm verify:replace-ready`、`with-db`、`shadow` 或协议审计。
- 当前最适合把它和下面几份文档一起看：
- [next-remaining-task-breakdown.md](next-remaining-task-breakdown.md)
- [next-remaining-execution-plan.md](next-remaining-execution-plan.md)
- [next-gap-analysis.md](./next-gap-analysis.md)

## 当前正确用法

这份 audit 当前最适合回答 3 个问题：

1. `server-next` 主服务里还有没有新长出来的 direct legacy 边界。
2. 某次重构后，是否又把 legacy 依赖重新并回中心服务。
3. “为什么现在还不能叫完整替换”是不是因为 direct boundary 扩散。

这份 audit 当前不适合回答 3 个问题：

1. next auth/bootstrap/session 真源是否已经完全替换。
2. GM/admin/restore 是否已经完成真实环境闭环。
3. 首包、热路径、shared 稳定性是否已经达到目标。

## 下一步最值得继续补的 4 件事

1. 保持这份 audit 继续只做 inventory，不要让它承担 replace-ready 完成定义。
2. 每次 `world.gateway / world-session-bootstrap / world-projector / world-sync` 大改后都复跑一次，防止 direct boundary 回流。
3. 把 audit 的结论继续同步回 [docs/next-remaining-task-breakdown.md](./next-remaining-task-breakdown.md)，避免出现“audit 为绿，但任务口径仍漂移”。
4. 当 `T24/T25` 进入定稿阶段时，再决定这份 audit 是否降级成历史文档，而不是现在就删除。
