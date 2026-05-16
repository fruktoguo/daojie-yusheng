# 选择并执行最小验证门禁

请根据本次改动的落点和影响面，按 `AGENTS.md` 第 18 节"Codex 默认门禁选择"挑选最小且足够的验证门禁并执行。

## 决策矩阵

| 改动落点 | 默认门禁 |
|---|---|
| 小型服务端改动（`packages/server/**`，非房间/风水/持久化/协议） | `pnpm verify:quick` |
| 房间 / 风水（`runtime/building/**`） | `pnpm verify:quick` + `pnpm verify:building` |
| 房间 / 风水性能热路径 | 再补 `pnpm verify:building:perf` |
| 客户端 UI 或客户端运行态（`packages/client/**`） | `pnpm verify:client` |
| `packages/shared/**` 或协议层 | `pnpm build:shared` + `pnpm audit:protocol` |
| 持久化 / DB / 真源（`packages/server/src/persistence/**`、迁移、outbox、flush、备份） | `pnpm verify:release:with-db` |
| 合并前 / 大范围修改 | `pnpm verify:standard` |
| 发布前 | `pnpm verify:release` |
| 严格上线前 | `pnpm verify:release:full` |
| 运行时边界审计场景 | 再补 `pnpm audit:boundaries` |
| 影子环境 / 破坏性预演 | `pnpm verify:release:shadow`、`verify:release:shadow:destructive:preflight`、`verify:release:shadow:destructive` |
| 验收 | `pnpm verify:release:acceptance` |
| 部署基线（与 deploy 链路一致性） | `pnpm verify:deploy-baseline` |

## 执行步骤

1. 先用 `git status` + `git diff --stat` 列出本次改动落在哪几个 package、哪几层（runtime / persistence / network / shared / client / config-editor）。
2. 对照上表选定门禁清单，**先告诉我"为什么挑这些、为什么不挑那些"**。
3. 跨多层时按"上层并集 + 必要 db/protocol"取并集，不要漏。
4. 顺序执行命令，每条都等结束、抓真实退出码和最后几行输出。
5. 失败立刻停下来定位根因，不要重复跑同一条希望它"自己好"。
6. 最后给一份总结：每条命令、退出码、耗时、关键产物或错误摘要。

## 不允许

- 不要省略验证直接说"应该没问题"。
- 不要用 `pnpm build` 替代具体门禁（`build` 不覆盖运行时 smoke / proof / audit）。
- 不要为了让门禁通过去篡改测试夹具的清理链或断言；遇到脏数据残留必须告诉我。
