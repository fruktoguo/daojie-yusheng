# next 替换阻塞看板

更新时间：2026-04-22（基于实跑与审计）

| 模块带 | blocker 组数量 | 结论 |
| --- | ---: | --- |
| `packages/server/src/network` | 2 | bootstrap 编排残余与 world sync compat/perf 仍是主阻塞 |
| `packages/server` proof / ops | 1 | `with-db` 已有当前证据，`acceptance / full / shadow:destructive` 仍缺当前环境复证 |
| `packages/client/src/ui` | 1 | patch-first 仍未完全收口 |
| `packages/shared` | 1 | 字段级全链路硬门禁仍未完成 |
| `docs` | 1 | 需要持续维持“实跑口径 > TODO 锚点口径” |

## 直接执行顺序

1. 继续推进 `bootstrap/session` 编排拆分，`context/contract`、`runtime attach / snapshot recovery`、`post-bootstrap emit`、`player-init`、`finalize`、`session bind / preflight` 已落到独立 helper/service；下一步优先拆 `activation` 残余编排。
2. 在 shadow 条件齐备后，补跑 `verify:replace-ready:acceptance / full / shadow:destructive`，把剩余历史证据变成当前证据。
3. 继续压首包与同步链尾项：
   - 已完成一小步：首连 `PanelDelta` 改为 revision-only 占位，不再重复整包 inventory / equipment / technique / attr / action / buff 快照。
  - 已完成一小步：`protocol-audit` 已按当前首包合同改为从 `Bootstrap.self` 校验 attr surface，不再错误等待 bootstrap 后额外 `PanelDelta`。
   - 已完成一小步：`attr delta` 与 `specialStats delta` 已改成 shared/client/server 全链路 partial patch，`WorldProjector` 不再靠 `PanelAttrDelta` 强转兜底。
   - 已完成一小步：`WorldProjector` 的 item / effect / technique 比较链已改成专用 helper，技能、效果、成长曲线和深 clone 已回到显式协议边界。
   - 已完成一小步：`world-session-bootstrap` 已去掉编译壳和 `@ts-nocheck`，bootstrap client 上下文、snapshot recovery 上下文、session 输入边界已回到显式 TS。
   - 已完成一小步：`world-session-bootstrap-context.helper.ts` 与 `world-session-bootstrap-contract.service.ts` 已落地，requested sessionId / contract policy / session reuse 不再和 bootstrap 编排硬缠在同一段里。
   - 已完成一小步：`world-session-bootstrap-post-emit.service.ts` 已落地，snapshot recovery notice / suggestion update / mail summary / pending logbook messages 不再直接堆在 bootstrap 主编排段里。
   - 已完成一小步：`world-session-bootstrap-player-init.service.ts` 与 `world-session-bootstrap-finalize.service.ts` 已落地，`loadOrCreatePlayer + setIdentity + mailbox/welcome-mail` 以及 bootstrap 日志/trace 收口不再直接压在主编排段里。
   - 已完成一小步：`world-session-bootstrap-session-bind.service.ts` 已落地，authenticated bootstrap 的 identity 回写、contract violation 判定、requestedSessionId 裁定与 `registerSocket + client.data` 回写已从主编排段拆出。
   - 已完成一小步：GM `bodyTraining` 修改链已回到运行时权威入口，在线玩家会先走 `PlayerRuntimeService.setManagedBodyTrainingLevel()`，再持久化并 `markPersisted`，不再只改快照后期待 runtime 被动追平。
   - 已完成一小步：`gm-database` restore 已改成分块批量写入 `persistent_documents`，并补了 backup/restore 阶段日志；当前 blocker 已从“外层 240s/420s 超时”前移到“需要最新根级 with-db 复证”。
   - 已完成一小步：最新工作树下 `pnpm verify:replace-ready:with-db` 已通过，`build:client -> server with-db smoke -> audit:protocol` 重新闭环。
   - 已完成一小步：移动视野下的 `tile/minimap marker` patch 已从 `MapStatic` 拆到 `WorldDelta`；`MapStatic` 只再承担首包/换图全量静态层，GM 流量榜不会再把移动时地块 patch 记进 `s2c_MapStatic`。
   - 下一步再看 `Bootstrap / MapStatic` 剩余分层与 `acceptance / full / shadow:destructive` 的当前证据。
4. 收掉 `client-next` 的 patch-first 尾项，避免仍有整块重绘面板混在 next 主链里。
5. 补强 `shared-next` 的新增字段全链路硬门禁，避免协议新增再次靠人工补洞。
