# 02 钉死 next 真源与协议主线

目标：让 `packages/*` 内部不再存在“谁才是真源”的歧义。

## 当前基线

当前 next 主线里，最容易漂移的是三类真源：

- 协议真源
  - `packages/shared/src/protocol.ts` `2638` 行
  - `packages/shared/src/types.ts` `1481` 行
  - `packages/shared/src/network-protobuf.ts` `1072` 行
- 运行时真源
  - `packages/server/src/runtime/*`
  - `packages/server/src/network/world.gateway.js`
- 内容与地图真源
  - `packages/server/data/content/*`
  - `packages/server/data/maps/*`

当前仓库里已经有 shared 护栏脚本：

- `packages/shared/scripts/check-network-protobuf-contract.cjs`
- `packages/shared/scripts/check-numeric-stats.cjs`
- `packages/shared/scripts/check-protocol-event-maps.cjs`
- `packages/shared/scripts/check-protocol-payload-shapes.cjs`

协议侧当前还有一个明确事实：

- [docs/next-protocol-audit.md](../next-protocol-audit.md) 已经能覆盖大部分 next socket 事件面
- 高流量热点仍集中在：
  - `Bootstrap`
  - `MapStatic`
  - `PanelDelta`
- 所以这一阶段不只是“确认谁是真源”，还要避免其它文件重新偷偷定义这些事件的行为和含义

## 真源矩阵

| 范围 | 唯一真源 | 不应再承担真源职责的地方 |
| --- | --- | --- |
| next socket 事件与 payload 合同 | `packages/shared/src/protocol.ts` | `legacy/shared/*`、客户端本地事件常量、服务端临时 payload 形状 |
| 共享基础类型 | `packages/shared/src/types.ts` | 客户端/服务端各自复制的局部同名 type |
| wire event / protobuf 映射 | `packages/shared/src/network-protobuf.ts` | 服务端私有 emit key、客户端本地 alias |
| 服务端权威运行时 | `packages/server/src/runtime/*` | `legacy/server/*`、临时 compat helper |
| 客户端 socket 主入口 | `packages/client/src/network/socket.ts` | `main.ts` 内散落的临时监听或旧 alias |
| 客户端前台启动主入口 | `packages/client/src/main.ts` | 其它页面入口、GM 页面零散 bootstrap |
| 内容真源 | `packages/server/data/content/*` | 客户端 generated 副本、legacy 内容目录 |
| 地图真源 | `packages/server/data/maps/*` | 客户端缓存、编辑器导出中间态、legacy 地图目录 |

## 任务

- [x] 确认 `packages/shared/src/protocol.ts` 是唯一协议真源
- [x] 确认 `packages/shared/src/types.ts` 是唯一共享类型真源
- [x] 确认 `packages/server/data/content/*` 是唯一内容真源
- [x] 确认 `packages/server/data/maps/*` 是唯一地图真源
- [x] 确认 `packages/server/src/runtime/*` 是唯一服务端运行时主链
- [x] 确认 `packages/client/src/network/socket.ts` 是唯一前台 Socket 主链
- [x] 确认 `packages/client/src/main.ts` 是唯一前台入口主链
- [x] 盘点仍通过 legacy 文件定义 next 行为的入口
- [x] 清掉“next 行为由 legacy 文件决定”的残留路径
- [x] 盘点 `NEXT_C2S` 声明与 `world.gateway.js` 实现差异
- [x] 盘点 `NEXT_S2C` 声明与客户端监听差异
- [x] 决定 `SaveAlchemyPreset` 保留为 next 正式能力
- [x] 决定 `DeleteAlchemyPreset` 保留为 next 正式能力
- [x] 已补齐服务端实现
- [x] 跑一次协议审计，确认 client/server/shared 三边一致

## 执行顺序

### 第 1 批：先把“唯一真源”写死

- [x] 在这份文档里把协议、共享类型、内容、地图、运行时、客户端入口的唯一真源表述固定
- [x] 检查顶层文档是否还在用 `client-next/shared-next/server-next` 这种历史命名描述实际 `packages/*`
- [x] 把“由 legacy 决定 next 行为”的情况视为 bug，不再视为正常桥接
- [x] 用 `pnpm --filter @mud/server-next proof:next-content-map-sources` 固定内容 / 地图真源入口

最小验证：

- 手工核对 [README.md](/home/yuohira/mud-mmo-next/README.md:1)
- 手工核对 [docs/next-in-place-hard-cut-plan.md](/home/yuohira/mud-mmo-next/docs/next-in-place-hard-cut-plan.md:1)

### 第 2 批：盘点 next 行为仍受 legacy 影响的入口

- [x] 扫描 `packages/server/src/network/*`、`packages/server/src/runtime/*`
- [x] 扫描 `packages/client/src/*`
- [x] 扫描 `packages/shared/src/*`
- [x] 只记录会影响 next 行为定义的入口，不把纯 inventory/audit 统计进来
- [x] 用 `pnpm --filter @mud/server-next proof:next-runtime-network-no-legacy-source` 固定 server runtime/network 不 direct 读取 `legacy/*`
- [x] 用 `pnpm proof:next-client-shared-no-legacy-source` 固定 client/shared 不 direct 读取 `legacy/*`

应优先记入清单的类型：

- next 事件名或 payload 字段仍由 legacy 常量或 legacy 协议导出决定
- next 主链逻辑仍显式读取 `legacy/*`
- next 内容或地图仍从 legacy 目录取真源
- 客户端主链仍通过旧 alias 监听 next 事件

输出结果：

- 哪些入口已在 `01/05` 里归为“临时允许”
- 哪些入口应直接删除
- 当前 direct legacy source 扫描未命中 `packages/client/src/*` 与 `packages/shared/src/*`；客户端旧 alias / 事件消费差异继续留在 `NEXT_S2C` 对齐阶段处理
- 当前只保留两组真实 residual：`client` 的观察类本地动作桥，以及 `server` 的 migration-only / compat 边界（不再包括 auth / identity / snapshot 启动自动回填）；纯 inventory / audit 输出不再单列为待收口入口

### 第 3 批：对齐 `NEXT_C2S` 到 `world.gateway.js`

- [x] 列出 `NEXT_C2S` 中所有事件
- [x] 对照 `packages/server/src/network/world.gateway.js`
- [x] 标记三类结果：
  - 已声明且已实现
  - 已声明但未实现
  - 服务端有处理但 shared 未声明
- [x] 用 `pnpm --filter @mud/server-next audit:next-protocol` 固定 `EXPECTED_C2S` 与 gateway coverage，未覆盖事件直接失败

重点优先看：

- craft：`Alchemy / Enhancement`
- 市场 / 邮件 / 建议 / 任务
- GM / debug / player controls
- 详情 / tile / attr / leaderboards

最小验证：

- `pnpm --filter @mud/server-next build`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 4 批：对齐 `NEXT_S2C` 到客户端监听

- [x] 列出 `NEXT_S2C` 中所有事件
- [x] 对照 `packages/client/src/network/socket.ts`
- [x] 对照 `packages/client/src/main.ts`
- [x] 标记三类结果：
  - 已声明且已监听
  - 已声明但客户端未消费
  - 客户端依赖了 shared 未声明的事件
- [x] 用 `pnpm proof:next-client-s2c-consumption` 固定客户端监听面对齐，当前未消费事件为 `GmState`

重点优先看：

- `Bootstrap / InitSession / MapEnter / MapStatic`
- `WorldDelta / SelfDelta / PanelDelta`
- `Mail* / Market* / SuggestionUpdate / Detail / TileDetail / NpcShop`

最小验证：

- `pnpm --filter @mud/client-next build`
- `pnpm --filter @mud/server-next audit:next-protocol`

### 第 5 批：清掉“next 行为由 legacy 决定”的残留路径

- [ ] 删除 next 代码里仍通过 legacy 文件决定行为的地方
- [ ] 删除 shared/client/server 间重复的本地事件定义
- [ ] 删除只为“旧协议也这样”存在的 next 行为分支

当前剩余收口重点：

- [x] `client:take` synthetic 动作已收口为真实动作 `loot:open`
- [ ] `client:observe` 仍是前台本地观察动作
- [x] server `auth / identity / snapshot` 启动自动 backfill 已删除，主链不再靠 legacy `persistent_documents` 自动回填 next 真源
- [ ] `world-player-source.service.js` 仍保留显式 migration-only snapshot 查询入口
- [ ] next 玩家 token codec 仍复用 compat JWT 验签 / 载荷解码

这一步不负责删所有 compat，只负责：

- 把 next 真源唯一化
- 让 `05` 后续删 compat 时不再碰到“删掉后 next 根本没真源”的问题

最小验证：

- `pnpm build`
- `pnpm verify:replace-ready`
- `pnpm --filter @mud/server-next audit:next-protocol`

## 文件级检查表

### shared

- [x] `protocol.ts` 不再被其它本地事件表“反向定义”
- [x] `types.ts` 不再被客户端/服务端重复复制同名结构
- [x] `network-protobuf.ts` 不再和 `protocol.ts` 存在漂移

补充证明：

- [x] 用 `pnpm proof:next-shared-types-source` 固定 `packages/shared/src/types.ts` 为共享类型唯一命名真源
- [x] 用 `pnpm proof:next-protobuf-drift` 固定高频 protobuf payload、schema lookup、wire 函数与空事件集约束
- [x] 用 `pnpm proof:next-protocol-source` 固定生产主链不再本地定义 `NEXT_C2S/NEXT_S2C` 或写死 `n:c:*` / `n:s:*` 事件字面量

### server

- [x] `world.gateway.js` 不再消费 shared 未声明事件
- [x] `runtime/*` 不再通过 legacy 文件决定 next 行为
- [x] `server/data/*` 不再由 legacy 内容或地图目录兜底

- [x] 用 `pnpm proof:next-server-runtime-mainline` 固定 runtime 只依赖显式允许的 next 适配边界，不再旁路到 legacy/compat/player-source 主链
- [x] 用 `pnpm --filter @mud/server-next audit:next-protocol` 固定 gateway 只消费 shared 已声明且已覆盖的 next 事件

### client

- [x] `socket.ts` 成为唯一 socket 监听主入口
- [x] `main.ts` 不再自己持有散落事件契约
- [x] 主要 UI 更新都只消费 next 协议，不消费旧 alias

- [x] 用 `pnpm proof:next-client-s2c-consumption` 固定 `socket.ts` / `main.ts` 的 next 监听面对齐
- [x] 用 `pnpm proof:next-client-no-legacy-alias` 固定生产前台不再写死 legacy socket alias

## 本阶段不做的事

- 不在这里顺手做 `05` 的 compat 删除。
- 不在这里顺手做 `07` 的 UI patch-first 重构。
- 不在这里重做协议设计；这里只负责把真源唯一化和空洞补齐。

## 完成定义

- [x] 不再存在“共享协议声明了但服务端没实现”的空洞
- [x] 不再通过 legacy 文件决定 next 主链行为

- [x] 用 `pnpm proof:next-no-legacy-file-behavior` 固定 client/server/shared 生产主链不再 direct 命中 `legacy/*` 文件路径（`tools/` 显式排除）
