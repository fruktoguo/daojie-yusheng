# 01 冻结 legacy 与边界收口

目标：先把“什么是主线、什么只是参考”钉死，避免后续任务继续回到兼容迁移。

## 当前结论

- `packages/*` 已在 [next 原地硬切执行文档](../next-in-place-hard-cut-plan.md) 和 [main](./main.md) 中明确为唯一活跃主线。
- `legacy/*` 已明确退化为参考、迁移来源、归档，不再承担默认开发职责。
- 这一阶段现在完成的是“边界钉死 + 入口盘点”，不是代码层面的 compat 删除；真正删除动作继续放在 `05`、`06`、`09`。

## 任务

- [x] 在顶层和主要文档里统一写明 `packages/*` 是唯一活跃主线
- [x] 在文档里统一写明 `legacy/*` 只作为参考、迁移来源、归档
- [x] 停止新增任何以 parity 为目标的任务
- [x] 停止向 `legacy/client` 落新功能
- [x] 停止向 `legacy/server` 落新功能
- [x] 停止向 `legacy/shared` 落新功能
- [x] 盘点 `packages/client` 中仍直接读取 `legacy/*` 的位置
- [x] 盘点 `packages/server` 中仍直接读取 `legacy/*` 的位置
- [x] 盘点 `packages/shared` 中仍依赖旧协议或旧共享结构的入口
- [x] 标出“必须暂时保留”的 legacy 读取点
- [x] 标出“可以直接删除”的 legacy / compat / parity 入口
- [x] 把盘点结果补回 `main.md` 的第 1 节对应项

## 盘点口径

- 以 `packages/*` 为主线，扫描 `legacy` / `compat` / `persistent_documents_only` / `replace_persistent_documents` / `server_next_legacy_*` 等关键字。
- 结合 [server-next 剩余 legacy 边界自动审计](../next-legacy-boundary-audit.md) 的现有结论，避免只靠手工猜测。
- 这里只盘“next 主线仍然直接触达 legacy/compat 的入口”，不把纯注释、历史文档和旧目录本身计入。

## 盘点结果

### `packages/client`

- 当前没有发现直接读取 `legacy/*` 文件或旧协议实现的主链入口。
- 现存命中主要是 GM 数据库页文案：
  - `packages/client/src/gm.ts`
  - `scope === 'persistent_documents_only'`
  - `restoreMode === 'replace_persistent_documents'`
- 这属于 next GM 备份/恢复的当前产品文案，不属于 legacy 运行时依赖。

### `packages/shared`

- 当前没有发现 shared 主链继续依赖旧版共享协议定义或 `legacy/shared/*` 的运行时入口。
- 现存命中只有两类：
  - `packages/shared/scripts/check-network-protobuf-contract.cjs`
    - 用来阻止 next 高频事件重新暴露 legacy event key，属于边界守卫，应保留。
  - `packages/shared/src/protocol.ts`
    - `persistent_documents_only` / `replace_persistent_documents`
    - 这是 next GM 数据库恢复协议字段，不是 legacy 共享结构回退。

### `packages/server`

- 当前仍然存在真正的 legacy/compat 边界，主要集中在 4 组：

| 组 | 文件 | 当前角色 | 后续去向 |
| --- | --- | --- | --- |
| 显式迁移数据源 | `packages/server/src/network/world-player-source.service.js` | 直接查 legacy `users` / `players` 表，只供显式 migration 使用 | `04` 完成一次性迁移脚本、`05` 删 compat 后退场 |
| 鉴权与快照回填 | `packages/server/src/network/world-player-source.service.js`、`world-player-auth.service.ts`、`world-player-snapshot.service.js` | next 主链 miss 时，受显式开关控制地读取 legacy 身份/快照 | 待 `04`、`05`、`06` 收口 |
| GM 历史 scope 读取 | `packages/server/src/http/next/next-gm-admin.service.js`、`next-gm-contract.js`、`packages/server/src/runtime/gm/runtime-gm-auth.service.js` | 读取 `server_next_legacy_*` scope 或旧 GM 密码记录，保证历史数据可迁 | `03/04` 锁定 GM 迁移后，进入 `05` 删除 |
| 运行时残余 compat | `packages/server/src/network/world-sync.service.js`、`packages/server/src/runtime/player/player-runtime.service.js`、`packages/server/src/persistence/player-persistence.service.js` | next 同步仍读 legacy combat effects，快照/bonus 仍兼容 `legacy:vitals_baseline` 标签 | 进入 `05/06` 逐步清除 |

## 必须暂时保留的入口

- `packages/server/src/network/world-player-source.service.js`
  - 这是当前唯一明确隔离出来的 legacy 数据库读取仓库。
  - 在 `04` 没把账号/玩家快照一次性迁完之前，不能直接删。
- `packages/server/src/network/world-player-source.service.js`
  - 已经把 compat 入口限制成“显式 migration 才能触发”，当前仍是最小安全壳。
- `packages/server/src/network/world-player-auth.service.ts`
  - 仍负责 token -> identity、persistedSource 归一与 next 协议下 legacy persistedSource 拒绝；真正的 migration source/snapshot 残余已收束到 `world-player-source.service.js` / `world-player-snapshot.service.js`。
- `packages/server/src/network/world-player-snapshot.service.js`
  - 仍负责显式 migration 快照补种与 starter snapshot 收口。
- `packages/server/src/http/next/next-gm-admin.service.js`
  - 仍在读取 legacy Afdian / 备份 / 作业 metadata scope。
- `packages/server/src/runtime/gm/runtime-gm-auth.service.js`
  - 仍需兼容历史 GM 密码记录 scope，直到 GM 数据迁移完成。
- `packages/server/src/tools/next-auth-bootstrap-smoke.js`
  - 这是当前验证链里证明 migration-only 入口已被显式限制的测试，不应先删。
- `packages/server/src/tools/audit/next-legacy-boundary-audit.js`
  - 这是 inventory 审计，不是 bridge，本阶段应保留。

## 可以直接删除或判定不再新增的入口

- 任何新的 `legacy/*` 功能实现
  - 从这一阶段开始直接禁止，不再新增。
- 任何新的 parity 任务、双路径补丁、旧事件名兼容
  - 直接判死刑，不再加入任务账本。
- `packages/server/src/network/world-player-source.service.js` 中仅用于兼容命名的 wrapper 方法
  - 这批 alias 已并回 `resolvePlayerIdentityForMigration / loadPlayerSnapshotForMigration`
  - 后续不应再重新引入新的 compat 命名包装层。
- `packages/server/src/http/next/next-gm-admin.service.js` / `next-gm-contract.js` 中的 `server_next_legacy_*` scope fallback
  - 一旦 `03/04` 把 GM 认证、备份、作业 metadata 完整迁到 native scope，就应直接删除，而不是继续保留双读。
- `packages/server/src/network/world-sync.service.js` 中 next envelope 对 legacy combat effects 的直接读取
  - 这是明确的 compat 债，应在 `06` 里优先替换，不再继续扩散。
- `packages/server/src/runtime/player/player-runtime.service.js` 与 `packages/server/src/persistence/player-persistence.service.js` 对 `legacy:vitals_baseline` 的规范化兼容
  - 在旧快照迁移完成后应直接删掉 legacy label 兼容，不再继续保留。

## 边界说明

- `packages/client` 和 `packages/shared` 目前已经基本没有 direct legacy 读取，后续重点不在“再盘一次”，而在避免重新引入。
- 当前主要 legacy 边界都在 `packages/server`，而且已经从“默认回退”收紧成“显式 migration / 审计 / 验证”三类。
- 这意味着 `01` 已完成，但不代表 compat 已删除；真正的删桥工作仍以后续 `05`、`06` 为准。

## 完成定义

- [x] 新任务默认不再把 legacy 当落点
- [x] 文档口径不再写“先和 legacy 对齐再说”
- [x] 已有 legacy 依赖点完成一次全量盘点
