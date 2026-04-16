# next 替换阻塞看板

更新时间：2026-04-16（基于实跑与审计）

| 模块带 | blocker 组数量 | 结论 |
| --- | ---: | --- |
| `packages/server/src/network` | 2 | auth/bootstrap 真源与 world sync compat/perf 仍是主阻塞 |
| `packages/server` proof / ops | 1 | with-db / shadow / acceptance / full 仍缺本轮实环境复证 |
| `packages/client/src/ui` | 1 | patch-first 仍未完全收口 |
| `packages/shared` | 1 | 字段级全链路硬门禁仍未完成 |
| `docs` | 1 | 需要持续维持“实跑口径 > TODO 锚点口径” |

## 直接执行顺序

1. 继续推进 `snapshot/player-source -> bootstrap/session` 真源替换，优先清掉 token codec 与 legacy source 依赖。
2. 在带库与 shadow 条件齐备后，补跑 `verify:server-next:with-db / acceptance / full / shadow:destructive`，把历史证据变成当前证据。
3. 压首包与同步链尾项，先看 `Bootstrap / MapStatic / PanelDelta` 重复分层，再看 `WorldProjector` 与 sync compat 读取。
4. 收掉 `client-next` 的 patch-first 尾项，避免仍有整块重绘面板混在 next 主链里。
5. 补强 `shared-next` 的新增字段全链路硬门禁，避免协议新增再次靠人工补洞。
