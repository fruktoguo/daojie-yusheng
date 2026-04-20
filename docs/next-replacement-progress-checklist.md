# next 替换进度清单

更新时间：2026-04-20（基于实跑与审计，不再按 `TODO` 锚点计数）

## 说明

- 本页统计的是当前仍会阻断或延后 `next` 替换的 blocker 组，不再把 `TODO/FIXME` 清零视为完成。
- 本轮已实跑：
  - `pnpm build`
  - `pnpm verify:server-next`
  - `pnpm --filter @mud/server-next verify:replace-ready`
  - `pnpm audit:server-next-boundaries`
  - `pnpm audit:server-next-protocol`

## 总览

| 区域 | blocker 组数量 | 说明 |
| --- | ---: | --- |
| `packages/server` | 3 | auth/bootstrap 真源、replace-ready 证明链、world sync/perf 尾项仍未收口 |
| `packages/client` | 1 | 主链已 next-native，但 patch-first / alias 尾项仍在 |
| `packages/shared` | 1 | `T22/T23` 级别的新增字段全链路硬门禁仍未完成 |
| `docs` | 1 | 看板与执行方案曾漂移到“待办 0”，本轮已按实跑口径回正 |

## 当前主阻塞

| blocker 组 | 当前主要区域 | 本轮结论 |
| --- | --- | --- |
| auth/token/bootstrap 真源未 fully next-native | `packages/server/src/network` | `next-legacy-boundary-audit` 当前已清到 `0 / 18`；剩余阻塞转为 `world-player-source / world-player-snapshot / world-session-bootstrap` 等真源仍未 fully next-native |
| with-db / acceptance / full / shadow 仍缺本轮实环境复证 | `packages/server` | 本轮仅无库 local gate 复跑为绿，带库与 shadow 仍待环境 |
| world sync / 首包 / projector 尾项 | `packages/server/src/network` | `MapStatic` / `Bootstrap` 仍明显偏重，legacy combat effects 仍在同步链 |
| client patch-first / alias 尾项 | `packages/client/src/ui` | 主 socket 已 next-only，但局部面板仍有整块重绘点 |
| shared 全链路硬门禁尾项 | `packages/shared` | 协议审计和 payload guard 为绿，但还没到“新增字段自动全覆盖” |
| 文档与执行口径同步 | `docs` | 本轮已开始修正，但仍应以实跑审计文件为准 |

## 当前最需要盯的文件带

- `packages/server/src/network/world-player-token-codec.service.ts`
- `packages/server/src/network/world-player-source.service.js`
- `packages/server/src/network/world-player-snapshot.service.js`
- `packages/server/src/network/world-sync.service.js`
- `packages/client/src/ui/panels/action-panel.ts`
- `docs/next-legacy-boundary-audit.md`
- `docs/next-protocol-audit.md`
