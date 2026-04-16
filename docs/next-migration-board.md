# next 迁移看板

更新时间：2026-04-16（本轮已同步到 `total=70`）

## 说明

- 本看板按仓库内全部 next 任务锚点聚合。
- 每个“任务桶”对应一个任务编号，而不是单条 TODO。
- `TODO` 数量用于看密度，不直接等于工作量。
- `legacy 基线模块` 表示当前 next 替换时主要参照的旧实现模块。

阻塞级别定义：

- `P0 硬阻塞`
  - 不收掉就不能说 next 真源或主链已可替换 legacy。
- `P1 高阻塞`
  - 不一定当天阻断运行，但会阻断“安全替换”“删 legacy”“正式接班”。
- `P2 中阻塞`
  - 不阻断最小可运行替换，但会明显影响稳定性、维护成本或体验对齐。
- `P3 低阻塞`
  - 收尾治理、命名或文档尾项，不是主替换阻塞。

关联统计摘要见：[next-replacement-progress-checklist.md](./next-replacement-progress-checklist.md)

## 任务桶看板

| 任务桶 | TODO 数量 | legacy 基线模块 | next 当前主落点 | 替换阻塞级别 |
| --- | ---: | --- | --- | --- |
| `ARCH01` | 2 | `legacy/server/src/main.ts`、`legacy/client/vite.config.ts` 的宽松 JS/TS 运行基线 | `packages/server/src/config/env-alias.js`、`packages/server/NEXT-GAP-ANALYSIS.md` | `P2 中阻塞` |
| `ARCH02` | 1 | `legacy/server/src/game/world.service.ts`、`world-runtime-persistence.domain.ts` | `packages/server/src/runtime/world/world-runtime.service.js` | `P1 高阻塞` |
| `ARCH04` | 1 | legacy 包名 / 脚本 / 构建命名体系 | `docs/next-pending-fix-checklist.md` | `P3 低阻塞` |
| `DATA01` | 1 | `legacy/server/data/content/**` | `packages/server/src/runtime/craft/craft-panel-runtime.service.js` | `P1 高阻塞` |
| `PERF01` | 3 | `legacy/server/src/game/world.service.ts`、`tick.service.ts`、`aoi.service.ts` 的热路径基线 | `packages/server/src/network/world-projector.service.js`、`world-sync.service.js`、`runtime/player/player-runtime.service.js` | `P1 高阻塞` |
| `PERSIST02` | 1 | `legacy/server/src/game/world-runtime-persistence.domain.ts` | `packages/server/src/persistence/player-persistence-flush.service.js` | `P2 中阻塞` |
| `PERSIST03` | 1 | `legacy/server/src/game/map-document.domain.ts`、`map.service.shared.ts` | `packages/server/src/persistence/map-persistence-flush.service.js` | `P2 中阻塞` |
| `REFACTOR01` | 1 | `legacy/server/src/game/world.service.ts` | `packages/server/src/runtime/world/world-runtime.service.js` | `P1 高阻塞` |
| `REFACTOR02` | 1 | `legacy/server/src/game/player.service.ts`、`attr.service.ts` | `packages/server/src/runtime/player/player-runtime.service.js` | `P1 高阻塞` |
| `T02` | 2 | `legacy/server/src/database/entities/{user,player}.entity.ts`、`legacy/server/src/game/player-storage.ts` | `packages/server/src/network/world-player-source.service.js`、`world-legacy-player-repository.js` | `P0 硬阻塞` |
| `T03` | 1 | `legacy/server/src/game/player-storage.ts`、`world.service.shared.ts` | `packages/server/src/network/world-session-bootstrap.service.js` | `P0 硬阻塞` |
| `T04` | 2 | `legacy/server/src/game/player-storage.ts`、`world-runtime-persistence.domain.ts` | `packages/server/src/network/world-player-snapshot.service.js`、`packages/server/src/persistence/player-snapshot-compat.js` | `P0 硬阻塞` |
| `T05` | 3 | `legacy/server/src/game/game.gateway.ts`、`legacy/client/src/network/socket.ts` | `packages/client/src/network/socket.ts`、`packages/server/src/network/world-session-bootstrap.service.js`、`world.gateway.js` | `P0 硬阻塞` |
| `T06` | 1 | `legacy/server/src/game/game.gateway.ts`、`legacy/client/src/network/socket.ts` | `packages/server/src/network/world.gateway.js` | `P0 硬阻塞` |
| `T07` | 3 | `legacy/server/src/game/game.gateway.ts`、`account.service.ts` | `packages/server/src/network/{world-session,world-session-reaper}.service.js`、`packages/server/src/tools/session-smoke.js` | `P0 硬阻塞` |
| `T09` | 2 | `legacy/server/src/game/database-backup.service.ts`、`database-backup-process.ts` | `packages/server/src/tools/gm-database-backup-persistence-smoke.js`、`persistence-smoke.js` | `P1 高阻塞` |
| `T10` | 2 | `legacy/server/src/game/database-backup.service.ts`、`database-backup-shared.ts` | `packages/server/src/tools/shadow-gm-database-proof.js`、`gm-database-smoke.js` | `P1 高阻塞` |
| `T13` | 14 | `legacy/server/src/game/gm.controller.ts`、`gm.service.ts`、`database-backup.service.ts` | `packages/server/src/http/next/{next-gm,next-gm-admin,next-gm-auth}.controller.js`、`packages/server/src/http/{next-http.registry.js,next/*}`、`packages/server/src/runtime/gm/runtime-gm-auth.service.js`、`packages/server/src/network/{world-gm-auth,world-gm-socket}.service.js` | `P1 高阻塞` |
| `T15` | 1 | `legacy/server/src/game/game.gateway.ts`、`world.service.ts` | `packages/server/src/network/world-sync.service.js` | `P1 高阻塞` |
| `T16` | 1 | `legacy/server/src/game/world.service.ts` | `packages/server/src/network/world-projector.service.js` | `P1 高阻塞` |
| `T17` | 1 | `legacy/server/src/game/attr.service.ts`、`equipment-effect.service.ts` | `packages/server/src/network/world-projector.service.js` | `P1 高阻塞` |
| `T18` | 1 | `legacy/server/src/game/world.service.ts`、地图/小地图同步链 | `packages/server/src/network/world-sync.service.js` | `P2 中阻塞` |
| `T19` | 1 | `legacy/server/src/game/performance.service.ts`、`pathfinding-benchmark.ts` | `packages/server/src/tools/bench-sync.js` | `P2 中阻塞` |
| `T20` | 1 | `legacy/server/src/game/world.service.ts`、`player.service.ts` | `packages/server/src/network/world-projector.service.js` | `P1 高阻塞` |
| `UI01` | 10 | `legacy/client/src/main.ts`、`styles/panels.css`、各面板拼接式 DOM 路径 | `packages/client/src/ui/detail-modal-host.ts`、`suggestion-panel.ts`、`npc-*`、`panels/{action,gm,market,equipment,world,attr}.ts` | `P2 中阻塞` |
| `UI02` | 1 | `legacy/client/src/main.ts` | `packages/client/src/main.ts` | `P2 中阻塞` |
| `UI03` | 2 | `legacy/client/src/gm.ts`、旧 GM 手工回归口径 | `packages/client/src/gm.ts`、`docs/frontend-refactor/verification.md` | `P2 中阻塞` |
| `UI04` | 2 | `legacy/client/src/gm-world-viewer.ts`、`gm-map-editor.ts` | `packages/client/src/gm-world-viewer.ts`、`gm-map-editor.ts` | `P2 中阻塞` |
| `UI05` | 3 | 旧版背包 / 任务 / 设置面板业务 recipe | `packages/client/src/ui/panels/{inventory,quest,settings}-panel.ts` | `P2 中阻塞` |
| `UI06` | 4 | `legacy/client` 各类详情弹层 / 模板化 modal 装载路径 | `packages/client/src/ui/{tutorial,craft-workbench,mail}.ts`、`packages/client/src/ui/panels/{technique}.ts` | `P2 中阻塞` |

## 当前高密度任务桶

按 `TODO` 数量排序，当前最密的 9 个任务桶是：

| 任务桶 | TODO 数量 | 当前主阻塞 |
| --- | ---: | --- |
| `T13` | 14 | GM/admin/restore 与 GM HTTP 面长期形态未定稿 |
| `UI01` | 10 | 主面板 patch-first 还没收完 |
| `UI06` | 4 | modal/bodyHtml 模板装载尾项仍有剩余 |
## 当前最需要盯的 legacy 基线带

- `legacy/server/src/auth/*`
- `legacy/server/src/game/game.gateway.ts`
- `legacy/server/src/game/world.service.ts`
- `legacy/server/src/game/player-storage.ts`
- `legacy/server/src/game/gm.controller.ts`
- `legacy/server/src/game/gm.service.ts`
- `legacy/server/src/game/database-backup*.ts`
- `legacy/shared/src/protocol.ts`
- `legacy/shared/src/constants.ts`
- `legacy/client/src/main.ts`
- `legacy/client/src/gm.ts`
- `legacy/client/src/network/socket.ts`

## 直接结论

- 如果按“阻塞 next 完整替换 legacy”的优先级看，最该先清的是：
  1. `T01-T07`
  2. `T13`
  3. `T15-T20`
  4. `UI01/UI06`

- 如果按“当前 TODO 密度最高”的区域看，最该盯的是：
  1. `packages/server/src/network`
  2. `packages/server/src/http/next`
  3. `packages/server/src/tools`
  4. `packages/client/src/ui`
