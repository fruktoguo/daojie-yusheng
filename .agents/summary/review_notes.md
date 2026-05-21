# Review Notes

对 `.agents/summary/` 下文档的一致性检查、完整性评估、语言支持差距与改进建议。

## 一致性检查

本次生成的六份主题文档（`codebase_info`、`architecture`、`components`、`interfaces`、`data_models`、`workflows`、`dependencies`）与既有文档交叉核对结果：

| 事项 | 结论 | 备注 |
|------|------|------|
| Tick 频率 | 一致（1Hz） | AGENTS.md §8、`docs/architecture/0002-tick-model.md`、本文件 `workflows.md` 均以 1Hz 为准 |
| 真源口径 | 一致 | PostgreSQL 为真源，Redis 为在线态，内存为权威 runtime |
| Socket 事件常量 | 一致 | 以 `shared/src/protocol.ts` 的 `C2S` / `S2C` 为唯一来源，其他文件只引用 |
| 验证门禁层级 | 一致 | 五层门禁（`local` / `with-db` / `acceptance` / `full` / `shadow-destructive`）与 `packages/server/TESTING.md`、AGENTS.md §18 一致 |
| 协议审计入口 | 一致 | `pnpm audit:protocol` → `packages/server/src/tools/protocol-audit.ts` |
| 模块拆分约定 | 一致 | `docs/architecture/service-split-conventions.md` 的三种模式（Helper / Service / Facade）被 `components.md` 和 `architecture.md` 引用 |
| 通知链路 | 一致 | AGENTS.md §22 的结构化通知口径与 `data_models.md` 的 `notice-types.ts` 定位一致 |

### 需要留意的说法差异

1. **Redis 客户端库未在 `dependencies` 显式列出**
   根 `README.md` / AGENTS.md 反复把 Redis 当作在线态真源，但 `packages/server/package.json` 的 `dependencies` 只列了 `pg`，没有 `ioredis` / `redis`。`dependencies.md` 采用"通过 `SERVER_REDIS_URL` 注入、运行期按需引导"的描述以保持事实准确；agent 若需定位具体客户端实现，应从 `SERVER_REDIS_URL` 使用处反查代码。

2. **AOI 与视野半径**
   `docs/architecture/0005-aoi-system.md` 示例给出 `AOI_RADIUS = 15`，但实际代码里视野由 `player-runtime.service.ts` 的 `getViewRadius()` 等动态决定。ADR 是设计意图层，代码以动态值为准。本文件未在 `data_models.md` / `workflows.md` 中固化具体数字，避免与代码漂移。

3. **ADR 示例代码 vs. 实际代码**
   `docs/architecture/0007-reconnection.md` 等 ADR 给出的 TypeScript 片段是示意，不一定匹配当前实现（例如 `SESSION_KEEP_ALIVE_MS = 60000` 为示例值）。本次生成的 `workflows.md` 只给时序图，不引用具体数值。

4. **文档计数**
   `docs/README.md` 的表格列了"12 个 ADR / 6 条链路 / 20+ 设计 / 17 计划 / 9 runbook ..."，这些数字会随文档增减而陈旧。本次生成的文档以 `INDEX.md` 为引用源，不复制这些计数。

## 完整性评估

### 已充分覆盖

- 顶层包结构、技术栈、入口文件
- 服务端运行时、持久化、网络、HTTP 组件
- Shared 协议 / 类型清单
- 客户端 UI / Renderer / State Source 分区
- 主要工作流（登录、tick、意图、战斗、炼丹/强化、市场、持久化、重连、实例迁移、内容发布、验证、部署）
- 外部 / 内部依赖

### 覆盖较浅 / 仅给定位不展开

| 领域 | 原因 | 定位 |
|------|------|------|
| 具体 protobuf schema | 字段级信息与代码漂移风险高 | `shared/src/network-protobuf*.ts` |
| 每个持久化表字段 | 表结构由 `ensure*Table` 动态声明，字段多 | `persistence/*.service.ts` 的 `ensure*Table` 方法 |
| 战斗公式 / 数值平衡 | 属于玩法设计，不属于架构 | `docs/design/balance/`、`runtime/combat/`、`shared/src/numeric.ts` |
| React UI 细节 | 还在渐进原型阶段 | `packages/client/src/react-ui/REACT_UI_REFACTOR_PLAN.md` |
| 宗门 / 通天塔玩法 | 玩法范畴 | `runtime/world/world-runtime-sect.service.ts`、`world-runtime-tongtian-tower.service.ts`、`docs/plans/宗门地图与护宗大阵商业级开发计划.md` |
| Docker / Swarm 配置字段 | 部署细节 | `docker-stack*.yml`、`docker-build-tencent.sh`、`docs/deploy-tencent-ccr.md`、`docs/runbook/deployment.md` |
| 本地开发脚本内部细节 | 运维脚本 | `start.sh` |

### 未覆盖（有意）

- `参考/` 目录：按 AGENTS.md §1，这是外部参考，不是主线开发对象
- `docs/story/` 剧情 / 世界观：与代码结构无关，不进入 summary
- `docs/plans/` 未完成计划的具体方案：属于变动中的设计草案
- 具体数值（lines of code、字节大小、文件具体行号）：SOP 明确要求不包含这类易过期指标

## 语言支持差距

本项目是纯 TypeScript + JavaScript 栈：

- **TypeScript**：分析工具完整覆盖，符号、类型、引用都能解析。
- **JavaScript / CJS**：根 `scripts/` 与 `packages/config-editor/local-api.cjs` 属于脚本 / 工具层，没有深入解析每一行，但通过 `package.json` 脚本引用链可以追溯。
- **Shell**：`start.sh` / `docker-build-tencent.sh` 未做内部控制流分析，只在 `workflows.md` / `dependencies.md` 给出定位。
- **SQL**：没有 `.sql` 源文件；表结构在 TypeScript 的 `ensure*Table()` 字符串模板中声明。本文件选择"指向 service + 方法名"而不是复制表结构，以避免代码变更后失同步。
- **CSS**：`packages/client/src/styles/` 仅在 `components.md` 列出文件清单，没有深入 token / 变量分析。

没有其它语言（Rust / Python / Go 等）参与生产主线，因此没有额外的语言支持空白。

## 内部一致性风险点（给未来维护者）

1. **旧版 player-persistence 与分域 player-domain-persistence 并存**
   `persistence/player-persistence.service.ts`、`player-persistence-flush.service.ts`、`player-flush-ledger.service.ts` 是早期快照版；`player-domain-persistence.service.ts` 是分域版。两者当前同时存在，由 `players_dirty_domains` 驱动的新分域链路是主线，快照版是兼容层。改动玩家持久化时必须读 AGENTS.md §13、`docs/plans/商业级数据落盘改造计划.md` 和 `docs/architecture/main主线落盘剩余旧链路与fallback清单.md`。

2. **DOM UI 与 React UI 并存**
   `packages/client/src/ui/` 是现有 DOM UI 主线；`react-ui/` 是渐进原型。AGENTS.md §10 要求 React UI 不得绕过现有 store / 网络边界，不要让两侧维护两套互相冲突的真源。

3. **Durable Operation 与非 Durable 路径**
   涉及资产的写入应走 `durable-operation.service.ts`；但代码里还有一部分旧路径直接写库（ground-item、部分 loot 已迁移，仍在迁移中）。检查改动时，看运行时服务是否调用 `DurableOperationService` 的 `withAssets` 方法是判断依据。

4. **Legacy / Compat 事件与身份**
   `auth-bootstrap-smoke.ts` 中大量 `Legacy*` / `*Compat*` 函数表明存在老客户端协议兼容路径；移除时需跑 `audit:protocol` 和 `auth-bootstrap` smoke。

## 文档改进建议

1. **增量维护**：本次生成的 `.agents/summary/` 下文档，建议在大改某个子系统（例如新增一个 `runtime/<domain>/`）时同步更新对应 section；小改（bug fix、字段微调）不需要动。
2. **与 `docs/` 的定位分离**：`.agents/summary/` 面向 AI agent 做导航；`docs/` 面向人类做设计 / 运维。两边不要复制内容，只做相互引用。
3. **协议变更后**：`shared/src/protocol.ts` 事件列表变更时，`interfaces.md` 的 C2S / S2C 分组需要同步补充。可以考虑在 CI 中加一个 proof 脚本，校验 `interfaces.md` 是否覆盖了所有事件名（当前尚未实现，属于未来优化）。
4. **运行时服务新增**：`app.module.ts` 注册的服务膨胀后，`components.md` 的对应表需要补充。可由同一个 proof 脚本做未登记 service 的提醒。
5. **表结构导出**：如果未来希望在 `data_models.md` 保留具体字段而不过期，可写一个 dev 工具从 persistence service 的 `ensure*Table` 调用抽取 DDL，导出到机器可读 JSON，再注入文档。当前未做，以手写引用代替。

## 结论

- **一致性**：与既有 `docs/`、`AGENTS.md`、`packages/*/package.json` 一致，没有发现冲突描述。
- **完整性**：覆盖了 AI agent 定位代码所需的主要结构；玩法数值、表字段、protobuf schema 属于细节层，只给出代码定位。
- **主要风险**：旧版 / 分域持久化并存、DOM UI / React UI 并存、Durable Op 迁移中。这些是项目当前阶段的已知遗留，不是文档缺陷。

