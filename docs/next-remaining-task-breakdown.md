# next 剩余任务详单

更新时间：2026-04-11（当前轮次）

这份文档基于并行只读分析整理，目标不是重复“大方向”，而是把 `next` 现在真正还没做完的任务拆成可执行清单。

当前总判断：

- `server-next` 的 direct legacy/perf inventory 已清零，但这不等于底层真源已经 next-native
- 仓库内与 `shadow/backup-dir` 相关的 proof 入口已经补齐，剩的是在真实环境里执行
- 本轮（2026-04-10）已完成一轮真源替换实改：`WorldPlayerAuthService` 已拆成 `next/token` 主链 + `compat` 迁移子链，`WorldPlayerSourceService` 的 compat 接口已显式迁移命名（`*ForMigration`），`WorldPlayerSnapshotService` 侧 compat 读取也统一走迁移语义接口
- 本轮新增主链硬收口：`protocol=next` 时，`authenticatePlayerToken` 直接禁用 compat 迁移回退，identity miss 会在 auth 层直接失败；`WorldGateway` 继续保留 `legacy_runtime` 二次门禁
- 本轮已把 `T01/T03/T05` 从“纯分析阶段”推进到“主链部分收口”：token fallback 已从 authenticated identity 主链移除，authenticated snapshot 不再按 `persistedSource` 放开 compat fallback，带 token 的 next bootstrap 已在 gateway 侧收成 `connect_token` 单线 promise；`hello` 在存在 pending connect-bootstrap 时只等待/让路，但在无 pending 时会被拒绝为 `HELLO_AUTH_BOOTSTRAP_FORBIDDEN`
- `T03/T04` 本轮又多了两条收口边界 proof：`compatIdentityBackfillSnapshotPreseed` 锁住了 compat identity backfill 成功后的 snapshot 前移链，`compatIdentityBackfillSnapshotSeedFailureRejected` 锁住了“identity backfill 成功但 snapshot preseed 首次失败时，当前必须直接拒绝而不是再靠 `legacy_backfill` runtime fallback rescue”
- 本轮也补了几项低风险并行收口：`T11` 文档门禁口径继续统一、`T19` 首包基准骨架落库、`T21` client-next 事件表面开始 next-native 命名化、`T22` shared-next realm 数值模板加了完整性守卫
- 本轮验证结果：`pnpm --filter @mud/server-next compile` 通过；`smoke-suite --case next-auth-bootstrap --require-legacy-auth`（无库链）通过；with-db 链路受本机 `127.0.0.1:5432` 不可达阻塞，待数据库恢复后补跑
- 本轮新增硬收口（runtime compat snapshot）：`legacy_runtime -> compat snapshot` 的 runtime fallback 已代码层彻底关闭，不再提供开关放行路径
- 本轮同步补齐两条 proof：`legacyBackfillFallbackContract` 已验证 no-persistence 默认阻断；`compatRuntimeSnapshotGuardContract` 已验证 `identity_source:next / identity_source:legacy_runtime / migration_runtime:legacy_snapshot` 三种原因均阻断
- 本轮验证结果追加：`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 无库链均实跑通过（2026-04-10 20:54~20:55）
- 本轮补齐 proof 语义对齐：`legacy preseed missing snapshot service` 在 runtime compat 关闭后改为 `native miss-only` 断言，不再误期待 `legacy_preseed_blocked`
- 本轮新增后端真源收口（2026-04-10 21:08~21:10）：
  - `guest hello` 不再允许通过 `sessionId` 接管非 guest 脱机会话（阻断 guest 越权 resume）
  - 握手声明 `legacy` 的 socket 被禁止进入 `hello(next)` 混合协议路径
  - 握手声明 `legacy` 的 socket 被禁止使用 `token/gmToken` 走 bootstrap（协议边界前置拒绝）
  - `WorldSessionService` 新增 `isGuestPlayerId`，用于会话恢复鉴权边界
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 均通过（2026-04-10 21:08~21:10）
- 本轮新增后端真源收口（2026-04-10 21:12~21:13）：
  - 带 `token/gmToken` 的连接若握手协议是未知值，会在连接期直接拒绝（避免 unknown 协议混入 auth 主链）
  - `hello` 链路新增未知协议上下文拒绝，杜绝 `legacy/unknown -> next` 混流
  - `pickSocketRequestedSessionId` 增加长度上限（128），超长 `sessionId` 直接忽略并告警
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:12~21:13）
- 本轮新增后端真源收口（2026-04-10 21:15~21:16）：
  - 带 `token/gmToken` 的连接若未声明握手协议，会在连接期直接拒绝（`AUTH_PROTOCOL_REQUIRED`）
  - `WorldSessionService.registerSocket` 对 `requestedSessionId` 增加 session 层净化：长度上限 128 + 字符白名单（`[A-Za-z0-9:_-]`）
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:15~21:16）
- 本轮新增后端真源收口（2026-04-10 21:17~21:18）：
  - `WorldSessionService.getBindingBySessionId` 也切到同一套 `sessionId` 净化（长度 + 白名单），彻底封住“仅注册时校验、读取时旁路”的漏洞
  - `pickSocketRequestedSessionId` 规则对齐 session 层：长度上限 + 非法字符拒绝并告警
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:17~21:18）
- 本轮新增后端真源收口（2026-04-10 21:19）：
  - `getDetachedBindingBySessionId` 增加过期即时判定：即便 reaper timer 尚未触发，过期 detached session 也会立即失效并回收到 `expiredBindings`
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:19）
- 本轮新增后端真源收口（2026-04-10 21:21~21:22）：
  - 新增 `markLegacyProtocolIfAllowed`，next 连接收到 legacy 事件时不再降级协议，直接拒绝并记录告警
  - `legacy_navigate_quest / legacy_action / legacy_inspect_tile_runtime` 全部接入该守卫
  - `emitLegacy*` 系列发送器改为“仅在允许时标记 legacy”，避免 next 连接被服务端发送路径反向降级
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:21~21:22）
- 本轮新增后端真源收口（2026-04-10 21:27~21:28）：
  - `emitLegacySuggestionUpdate / emitLegacyMail* / emitLegacyMarket* / emitLegacyNpcShop` 全部改成“守卫失败立即返回”，彻底阻断 next socket 上的 legacy 下行发送旁路
  - `next-auth-bootstrap` 新增 `nextProtocolRejectsLegacyEventContract`：验证 next socket 主动发送 legacy `c:ping` 会收到 `LEGACY_EVENT_ON_NEXT_PROTOCOL`，且后续 `n:c:ping` 仍正常返回 `n:s:pong`，证明协议未降级
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:27~21:28）
- 本轮新增后端真源收口（2026-04-10 21:33~21:34）：
  - 补齐一批 legacy 业务事件守卫：`handleRequestMailSummary/RequestSuggestions/RequestMailPage/RequestMailDetail/RequestMarket/MarkMailRead/CreateSuggestion/VoteSuggestion/ReplySuggestion/MarkSuggestionRepliesRead/GmMarkSuggestionCompleted/GmRemoveSuggestion/ClaimMailAttachments/DeleteMail/RequestMarketItemBook/RequestMarketTradeHistory` 现在在 next socket 上会统一拒绝，不再触发 legacy 业务副作用
  - `next-auth-bootstrap` 的 `nextProtocolRejectsLegacyEventContract` 进一步扩展为双事件证明：legacy `c:ping` 与 legacy `c:requestSuggestions` 均被拒绝，并在同 socket 上保持 `n:c:ping -> n:s:pong` 正常
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:33~21:34）
- 本轮新增后端真源收口（2026-04-10 21:35~21:36）：
  - 把第二批“legacy/next 共用处理函数”的入口彻底拆开：`redeem/useItem/dropItem/equip/unequip/cultivate/requestNpcShop/createSellOrder/createBuyOrder/buyMarketItem/sellMarketItem/cancelMarketOrder/claimMarketStorage/buyNpcShopItem` 全部改成 legacy 入口先守卫、next 入口走独立内部执行函数，避免 next wrapper 走 legacy 入口产生协议混流
  - 对应 legacy 入口统一加了 `LEGACY_EVENT_ON_NEXT_PROTOCOL` 拒绝路径，彻底封堵 next socket 触发上述 legacy 业务副作用
- 本轮验证结果追加：`pnpm --filter @mud/server-next compile`、`next-auth-bootstrap-mainline`、`next-auth-bootstrap-migration`、`next-auth-bootstrap` 再次全量通过（2026-04-10 21:35~21:36）
- 本轮新增后端真源收口（2026-04-11 当前轮次）：
  - `WorldPlayerAuthService` 已把 compat identity backfill 的在线协议入口继续收成 `migration-only`；`protocol=legacy` 不再存在 runtime 显式放行后门，运行态成功来源也已从 `legacy_backfill` 正名为 `migration_backfill`
  - `WorldSessionBootstrapService` 已移除 `legacy_backfill -> native snapshot` 的恢复提示语义；authenticated recovery notice 只剩 `token_seed`
  - `next-auth-bootstrap` 对齐成新证明链：legacy 协议 runtime compat backfill 必须拒绝，migration 协议必须允许；snapshot recovery notice proof 只再证明 `token_seed`
  - `WorldGateway.handleHello` 收口：token/gmToken 连接不再允许 `hello` 触发 auth/bootstrap 兜底路径，缺失 connect-bootstrap 时直接拒绝 `HELLO_AUTH_BOOTSTRAP_FORBIDDEN`，保持 `connect_token` 单线入口
  - `next-auth-bootstrap` 增加“连接后立即发送 `hello`”回归，验证 connect bootstrap 进行中不会被 hello 触发重复初始化或旁路 fallback
- `next` 距离“完整替换游戏整体”仍保守约差 `35% - 40%`
- 还没完成的内容，主块可以压成 5 组：
  - `auth/token/bootstrap/snapshot/session` 真源替换
  - GM/admin/restore/shadow 运营面与验收链闭环
  - 最小包体、首包与热路径性能尾项
  - `client-next / shared-next` 协议、扩展与稳定性收口
  - 替换后的 compat 保留策略定稿

按任务粒度看，当前建议跟踪 `25` 个剩余任务：

- `P0` 真源硬阻塞：`8`
- `P1` 证明链与运营面闭环：`6`
- `P1` 性能 / 包体 / 扩展边界：`6`
- `P1` shared / client 稳定性：`3`
- `P2` 替换后 compat 策略：`2`

按“性质”再拆一次：

- 仓库内代码仍需继续改造：`18`
- 主要缺真实环境执行与补证：`4`
- 主要缺策略定稿与门禁化：`3`

按“是否会直接改变运行时主语义”拆：

- 会直接改变 authenticated 主链语义：`7`
- 主要改变 proof / workflow / 文档 / 运维边界：`7`
- 主要改变性能 / 包体 / 扩展结构：`7`
- 主要改变替换后治理策略：`3`

## 零、依赖关系

先做错顺序，后面会反复返工。当前建议的硬依赖如下：

- `T01 -> T02 -> T03 -> T04 -> T05 -> T06 -> T07`
  - 这是 `auth/token/bootstrap/snapshot/session` 真源替换主线
- `T09` 和 `T10`
  - 不依赖真源替换完成，但依赖真实环境和维护窗口
- `T11 -> T12 -> T14 -> T25`
  - 这是“把证明链变成正式门禁”的治理主线
- `T15 -> T16/T17/T18 -> T19 -> T20`
  - 这是“先识别和拆热点，再建立正式性能门禁”的性能主线
- `T22 -> T23`
  - shared 稳定性先补类型基线，再补自动一致性检查
- `T24`
  - 最好放在真源主线和证明链都更稳之后定稿

当前最不该并行混改的组合：

- `T01 + T03 + T05`
- `T02 + T03`
- `T05 + T06 + T07`
- `T16 + T20`
- `T10` 与任何其他 destructive 维护操作

## 零点一、怎么看“还剩多少”

如果按“距离正式接班最关键的未完成量”看，可以粗分成三层：

- 第一层，必须先清掉的硬阻塞：
  - `T01`
  - `T03`
  - `T05`
  - `T07`
- 第二层，必须补齐才适合说“接班可验证”：
  - `T09`
  - `T10`
  - `T11`
  - `T12`
  - `T25`
- 第三层，决定是否满足你最初目标“最小包体 / 最高性能 / 极高扩展度 / 系统稳定性”：
  - `T15`
  - `T16`
  - `T17`
  - `T18`
  - `T19`
  - `T20`
  - `T22`
  - `T23`

当前最接近“还能明显减少剩余百分比”的任务，不是再补 smoke，而是：

1. `T01`
2. `T03`
3. `T05`
4. `T07`
5. `T15`
6. `T16`
7. `T19`
8. `T22`

## 零点二、任务状态快照

这张表不重复长描述，只回答两件事：

- 当前每项到底处于什么状态
- 现在真正该把哪一步往前推

| 任务 | 当前状态 | 下一步收口点 |
| --- | --- | --- |
| `T01` | `已完成待验证` | 把 authenticated next 入场彻底收成仅认 next identity，继续把 compat 收到显式 migration 窗口 |
| `T02` | `准备层已拆名，真源未替换` | 让 `WorldPlayerSourceService` 不再只是 legacy facade |
| `T03` | `已完成待验证` | 继续把 authenticated runtime compat snapshot fallback 压到 migration/no-persistence 专用边界 |
| `T04` | `proof 很强，主链未 next-native` | 把 snapshot 真源完成定义从“能证明”推进到“只读 next native” |
| `T05` | `已完成待验证` | 收完 `connect_token / hello / guest / GM` 四类边界，并把 contract 写成单线行为 |
| `T06` | `未完成` | 把 guest / authenticated / GM 的错误码与恢复 contract 固化 |
| `T07` | `已完成待验证` | 明确单进程 session 是否就是最终真源，并把当前边界从 proof 写成正式设计 |
| `T08` | `已完成待验证` | 让 trace 退回调试/验收角色，不再承担完成定义 |
| `T09` | `仓库命令已齐，缺真实 DB 取证` | 在真实库环境补跑 `backup-persistence` |
| `T10` | `仓库命令已齐，缺维护窗口取证` | 在 shadow 维护窗口补跑 destructive proof |
| `T11` | `已完成待验证` | 继续核齐 README / TESTING / RUNBOOK / workflow / wrapper |
| `T12` | `已完成待验证` | 把自动化边界和人工维护边界正式写死 |
| `T13` | `待定稿` | 决定 GM/admin/restore 是长期 compat 壳还是继续 next 化 |
| `T14` | `已完成待验证` | 补齐真实维护窗口 secrets、手册和执行记录 |
| `T15` | `已落首包 bench 骨架` | 继续拆 `Bootstrap / MapStatic / PanelDelta` 重复字段 |
| `T16` | `热点已定位，结构未下拆` | 把 projector 从整量 capture/diff 切向 slice / revision 驱动 |
| `T17` | `热点已知，invalidiation 机制未建` | 给 attr bonus / panel diff 建 revision 与失效边界 |
| `T18` | `热点已知，缓存方案未定` | 给 minimap marker 建地图级预处理或事件驱动刷新 |
| `T19` | `首包基准已起步，门禁矩阵未成型` | 把 tick / AOI / projector / sync 一起纳入基准 |
| `T20` | `风险已定位，架构约束未落地` | 把新系统扩展路径从巨型 `PlayerState / projector` 切出 slice |
| `T21` | `已完成待验证` | 清掉 client-next 事件表面的旧命名兼容层 |
| `T22` | `已完成待验证` | 把 bootstrap / panel / delta 的 shared 补全规则写硬 |
| `T23` | `已完成待验证` | 继续补 reset / projection / protobuf 等一致性检查，并从单点脚本扩成统一一致性检查 |
| `T24` | `待真源更稳后定稿` | 明确 legacy HTTP / GM / socket 的最终保留范围 |
| `T25` | `已完成待验证` | 把“完整替换完成”的关键项逐条对应到 smoke / runbook / workflow |

## 零点三、本周直接开工顺序

如果当前目标不是继续扩散分析，而是要看到仓库继续实打实往前走，最值得直接开工的是下面 3 批。

### 批次 1：先拿掉“只存在文档里”的不确定性

- 包含：
  - `T11`
  - `T12`
  - `T25`
- 直接产物：
  - `README / TESTING / REPLACE-RUNBOOK` 三份口径对齐
  - “完整替换完成”判定表，逐条映射到 smoke / workflow / 人工 runbook
  - `local / acceptance / full / shadow-destructive` 回答的问题彻底写死
- 为什么先做：
  - 这是最低风险、最高协同收益的收口；先写死口径，后面的真源替换才不会每推进一步就重新争“算不算完成”

### 批次 2：主线程把 auth/bootstrap 真源链和握手 contract 一次收口

- 包含：
  - `T01`
  - `T03`
  - `T05`
  - `T06`
  - `T07`
- 直接产物：
  - next identity 不再默认走 compat runtime backfill
  - authenticated runtime 不再回读 compat snapshot
  - token/gmToken 连接只剩 `connect_token` 单线 bootstrap
  - guest / authenticated / GM 三类握手错误码与恢复 contract 固化
- 为什么第二个做：
  - 这是当前最能真实减少“还差多少”的代码改动，但必须单线做，不能和别的主链重构混在一起

### 批次 3：在主链稳定后并行钉住性能和 shared 尾项

- 包含：
  - `T09`
  - `T10`
  - `T15`
  - `T16`
  - `T19`
  - `T22`
  - `T23`
- 直接产物：
  - 真实环境 proof 清单与执行记录
  - 首包重复字段清单
  - 首包 + tick/projector/AOI 的门禁骨架
  - shared-next 新字段补全检查规则继续硬化
- 为什么第三个做：
  - 这批能在不继续搅动 auth/bootstrap 主线的前提下，把“最小包体 / 稳定性 / 性能 / shared 基线”从口号变成实际护栏

## 一、P0 真源硬阻塞

### T01 移除 authenticated 链路里的 legacy identity fallback

- 当前状态：本轮已把 `authenticatePlayerToken` 主链明确收成 `next -> token`，并把 compat/backfill 主体逻辑拆到独立迁移子路径；`protocol=next` 的 auth 层硬门禁已落地，且 compat identity backfill 的在线协议入口已继续收成只允许 `protocol=migration`，`protocol=legacy` 已不再能命中 runtime backfill；与此同时，运行态成功来源名也已从 `legacy_backfill` 收口成 `migration_backfill`，避免迁移子链继续伪装成 legacy 主链；gateway 侧拦截保留为二次防线。
- 为什么还没完成：`legacy_backfill` 作为持久化身份来源仍存在于迁移窗口内，`WorldPlayerSourceService` 也仍是 legacy facade；也就是说 runtime 入口虽收紧，但迁移子链本身还未完全下线。
- 完成定义：authenticated next socket 入场只接受 next 真源 identity；compat identity 只允许出现在显式迁移/回填路径；并明确迁移窗口后 compat 入口的关停策略与时间点。
- 下一步最小实改：
  - 把 `protocol=next` 下的 compat identity 解析完全从默认代码路径剥离，只保留显式 `migration` 调用点
  - 把 `migration_backfill` 与 `legacy_sync/token_seed` 的持久化来源语义写进注释和 trace，避免后续再次混用
  - 给 auth 层补一条“next miss identity 必须在 auth gate 失败”的独立 proof，不再只从 bootstrap 结果侧旁证
- 最小验证：
  - `pnpm --filter @mud/server-next compile`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
- 退出条件：
  - next 协议 authenticated 入场时，trace 不再出现 runtime compat identity 成功来源
  - 仅 `migration` 协议还能触发 compat identity backfill，且 smoke 有正反两条证明
- 风险：会直接打到所有还没完成 next identity 落库的旧账号。
- 并行性：`不可与其他 auth/bootstrap 真源改动并行混改`
- 相关文件：
   - `../packages/server/src/network/world-player-auth.service.js`
   - `../packages/server/src/persistence/player-identity-persistence.service.js`

### T02 把 `WorldPlayerSourceService` 从 legacy facade 变成 next-native source

- 当前状态：`WorldPlayerSourceService` 仍是 `WorldLegacyPlayerSourceService` 的薄壳，但本轮已显式拆出迁移语义接口（`resolveCompatPlayerIdentityForMigration` / `loadCompatPlayerSnapshotForMigration`），主链调用点已优先走迁移命名，降低误用到 authenticated 主链的风险；另外 `/auth/register|login|refresh` 已可先落 next identity（`legacy_sync`）。
- 为什么还没完成：虽然 next identity 的提前落库入口已经前移，但 socket authenticated 主链仍会在 next identity miss 时继续调用 compat source，`WorldPlayerSourceService` 本身也仍然只是 legacy facade。
- 完成定义：`WorldPlayerSourceService` 变成 next-native provider；legacy source 只在 backfill / import / repair 中使用。
- 下一步最小实改：
  - 把 `WorldPlayerSourceService` 明确切成 `next provider + migration provider` 两段，而不是继续通过 facade 转发
  - 把 legacy HTTP 登录后“预落 next identity/snapshot”的能力前移到 next provider 侧，减少 source 层再依赖 legacy facade
  - 明确列出 migration 入口允许调用的唯一方法名单，避免未来又把 compat 能力加回主链
- 最小验证：
  - `pnpm --filter @mud/server-next compile`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case legacy-auth --case next-auth-bootstrap --require-legacy-auth`
- 退出条件：
  - `WorldPlayerSourceService` 不再直接暴露 legacy facade 风格 API
  - authenticated 主链只依赖 next provider，legacy provider 只被 migration/import/repair 路径引用
- 风险：这是 identity 和 snapshot 的共同上游，切错会同时影响登录与 bootstrap。
- 并行性：`不建议与 T01/T03/T05 并行混改`
- 相关文件：
   - `../packages/server/src/compat/legacy/http/legacy-auth-http.service.js`
   - `../packages/server/src/network/world-player-source.service.js`
   - `../packages/server/src/network/world-legacy-player-source.service.js`

### T03 移除 authenticated snapshot 的 legacy fallback

- 当前状态：本轮已进一步收紧为“compat snapshot fallback 只剩 no-persistence 的 `legacy_runtime`”；在 persistence-enabled authenticated 主链里，`legacy_backfill` 已不再参与 runtime fallback，`compat identity backfill` 一旦出现 snapshot preseed 失败或 identity save 失败，也都会在 identity gate 直接拒绝，不再继续放行。与此同时，运行态 auth trace 成功/失败来源名已收口成 `migration_backfill / migration_preseed_blocked / migration_persist_blocked`，只把 `legacy_backfill` 留在持久化 `persistedSource` 兼容层。`/auth/register|login|refresh` 成功后如果 legacy 库里已有玩家快照，仍会顺手把它预落成 next `native` snapshot；`next-auth-bootstrap` 现在已锁住三条边界 proof：compat identity backfill 成功后的 snapshot preseed 成功链、preseed 失败拒绝链、以及 identity save 失败拒绝链；并且 bootstrap recovery notice 已收成只对 `token_seed` 生效，不再把 `legacy_backfill` 记为恢复成功。
- 为什么还没完成：虽然 persistence-enabled authenticated 主链已经不再把 compat snapshot 当 runtime fallback 用，且 compat preseed 新写入已统一成 `native`，但 authenticated 主链仍不是 next snapshot 单真源，因为首次迁移仍允许通过 compat identity + preseed 前移快照，而 no-persistence 场景下 `legacy_runtime` 仍保留。
- 完成定义：authenticated player 只读取 next snapshot；compat snapshot 只作为一次性 seed / 迁移工具，不再参与 runtime 入场。
- 下一步最小实改：
  - 把 `legacy_runtime` 继续压缩成“仅 no-persistence + 非 replace-ready 退化场景”专用路径，并把代码入口单独命名
  - 把 compat snapshot preseed 的写入和读取职责拆开：写入仍可保留迁移工具语义，读取彻底退出 authenticated runtime
  - 给 snapshot 层补一条“next identity + next snapshot miss + compat snapshot 存在时仍必须失败”的显式 contract，避免回退
- 最小验证：
  - `pnpm --filter @mud/server-next compile`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
- 退出条件：
  - persistence-enabled authenticated 主链不再出现 compat snapshot runtime 读取
  - recovery notice 不再携带 compat backfill 恢复语义
- 风险：会影响所有仍停留在 `legacy_runtime` 或仍依赖 compat preseed 迁移路径的玩家。
- 并行性：`不建议与 T01/T02/T05 并行混改`
- 相关文件：
  - `../packages/server/src/network/world-session-bootstrap.service.js`
  - `../packages/server/src/network/world-player-snapshot.service.js`

### T04 把 snapshot 真源从“proof 完整”推进到“主链 next-native”

- 当前状态：`next-auth-bootstrap` 已经补了大量负向与正向 proof；并且随着 legacy HTTP 登录后开始预落 next `native` snapshot，顺序 proof 已允许“第一次直接命中 next(native)”这类前移后的第一跳。现在 proof 还进一步固定了四条边界：`compatIdentityBackfillSnapshotPreseed` 证明 compat identity backfill 成功后能直接把 snapshot 前移成 next；`compatIdentityBackfillSnapshotSeedFailureRejected` 证明即使 identity backfill 已成功，只要 snapshot preseed 失败，authenticated 主链也不会再靠 runtime fallback 救活；`compatBackfillSaveFailure` 则证明 identity save 失败也已经前移到 identity gate 直接拒绝；新的 protocol gate proof 则证明 compat backfill 在线入口只剩 `migration`。
- 为什么还没完成：当前仍是“已经把 persistence-enabled authenticated runtime fallback 基本收掉，并能证明什么时候 preseed 成功/失败、save 成功/失败，以及 legacy protocol runtime 入口已被切断”，不是“所有 authenticated 主链都只读 native next snapshot”；no-persistence 场景下 `legacy_runtime` 仍保留，且 compat preseed 仍处于迁移期工具语义。
- 完成定义：next snapshot 成为唯一 runtime snapshot 真源；proof 从“允许 compat seed 后直接 next(native)”过渡到“authenticated 主链只接受 native next snapshot，compat seed 只保留显式迁移工具路径”。
- 下一步最小实改：
  - 把 proof 分成“runtime 主链 proof”和“migration 工具 proof”两组，避免完成定义继续被混淆
  - 把 `next(native)` 命中顺序 proof 从“有可能第一次就命中”提升成“authenticated 主链只允许命中”
  - 在文档里明确迁移完成后准备删除的 proof 清单，防止迁移期 proof 永久变成架构依赖
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case persistence --require-legacy-auth`
- 退出条件：
  - 文档与 smoke 都能明确区分 runtime 主链 proof 和 migration 工具 proof
  - authenticated 主链完成定义不再依赖 compat seed 成功
- 风险：需要先处理旧玩家 snapshot 迁移，否则大面积登录失败。
- 并行性：`可与 proof/观测增强并行，不可与主链重写并行混改`
- 相关文件：
  - `../packages/server/src/tools/next-auth-bootstrap-smoke.js`
  - `../packages/server/src/network/world-player-snapshot.service.js`

### T05 把 connect-time token bootstrap compat 语义收成单线

- 当前状态：本轮已把带 token 的 next bootstrap 收成 gateway 内的单次 promise；`hello` 对 token 连接在存在 pending connect-bootstrap 时只等待/让路，不再自行启动 `hello_token` bootstrap；若无 pending connect-bootstrap，则直接拒绝 `HELLO_AUTH_BOOTSTRAP_FORBIDDEN`。无库 `next-auth-bootstrap` smoke 已验证 `helloAfterBootstrap.duplicateInitSession/Bootstrap/MapEnter = 0`，且 trace 里的 `bootstrapEntryPath` 已固定为 `connect_token`。
- 为什么还没完成：guest `hello`、GM socket、requestedSessionId contract 仍与 `T06/T07` 耦合，代码结构上还没彻底拆成最终形态。
- 完成定义：`connect_token`、`hello`、guest `hello`、GM bootstrap 的边界被写死；next 协议 bootstrap 只剩单一真源入口。
- 下一步最小实改：
  - 把 `hello` 里的 authenticated/GM 分支完全挪成拒绝或显式委托，不再保留兜底 bootstrap 迹象
  - 把 `connect_token` 入口的错误码、重复入场、pending 等待语义写成单独 contract 表
  - 把 smoke 分成“连接时 bootstrap”和“guest hello”两组，避免同一脚本里语义纠缠
- 最小验证：
  - `pnpm --filter @mud/server-next compile`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth`
- 退出条件：
  - token/gmToken 连接的 bootstrap trace 只出现 `connect_token`
  - `hello` 不再被用作 authenticated bootstrap 的隐式补救入口
- 风险：会打到现有客户端和 smoke 的握手时序。
- 并行性：`不建议与 T01/T03/T06 并行混改`
- 相关文件：
  - `../packages/server/src/network/world.gateway.js`
  - `../packages/server/src/tools/next-auth-bootstrap-smoke.js`

### T06 把 guest / authenticated / GM bootstrap 规则完全拆开

- 当前状态：guest `requestedPlayerId` fallback 已删，本轮 `handleHello()` 也继续收成 guest-only 入口；带 token 的连接在 pending connect-bootstrap 存在时让路给 `connect_token`，无 pending 时直接拒绝 `HELLO_AUTH_BOOTSTRAP_FORBIDDEN`，guest detached resume 则走单独 helper。
- 为什么还没完成：GM socket 与 authenticated socket 的最终 contract 还没有完全拆成独立入口，错误码和长期维护边界也还没定成最终形态。
- 完成定义：guest、authenticated、GM 三类握手的 requestedSessionId / identity / snapshot / error code contract 明确独立。
- 下一步最小实改：
  - 先把三类握手 contract 写成表：允许字段、允许入口、允许错误码、允许恢复方式
  - 再把 `WorldGateway` 里三类入口拆成三个清晰 helper，避免条件分支继续交错
  - 给 guest forged sid、authenticated 缺 connect-bootstrap、GM token bootstrap 三类场景各补一条独立 proof
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case session --case next-auth-bootstrap --require-legacy-auth`
  - `pnpm --filter @mud/server-next exec node dist/tools/compat/gm-compat-smoke.js`
- 退出条件：
  - `world.gateway.js` 中 guest / authenticated / GM 的 bootstrap 分支可按入口函数直接读懂
  - 文档能用一张 contract 表说明三类握手，不再靠源码推断
- 风险：重构时容易把已经收口的 guest canonical 语义写回退。
- 并行性：`可先做只读 contract 文档；代码改动不建议并行`
- 相关文件：
  - `../packages/server/src/network/world.gateway.js`
  - `../packages/server/src/network/world-session.service.js`

### T07 明确 session 真源与稳定性边界

- 当前状态：`WorldSessionService` 仍是单进程内存 binding，`sessionId` 也是进程内生成；但现在 detached session 已有显式 `expireAt` 生命周期与 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS`，`smoke:session` 也已经锁住 guest forged sid/pid 与过期 sid 不得复用旧人的语义。
  - 过期生命周期默认 `15000ms`，但会在进程启动时通过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 覆盖；`WorldSessionService` 会基于这个值安排 `expireAt` / `purge`，从而保证客人断线后仍可在规定时窗内 resume。
- `pnpm --filter @mud/server-next smoke:session` 当前不仅验证了客人 resume 的 canonical 感知，还专门显式覆盖过期 resume 的 proof：过期的 detached `sid` 必须返回新的 `sid/pid`，且不得恢复旧人。
- 本轮在与 `smoke:session` 同一链路里也拿下了 `authenticatedSessionProof`（并发 replace / detached resume / expired sid rotate 全数在预期内）与 `sessionReaperProof`（成功与重试两条路径实跑通过），为 session 并发替换与 reaper 清理行为再补了一道高频证据。
- 为什么还没完成：单服单实例下行为边界已经更清晰，但“是否接受单进程 session 真源作为最终答案”以及跨重启/跨进程语义还没有正式定稿。
- 完成定义：明确 session 是否永久采用单进程真源；如果不是，就要补跨重启 / 跨进程策略；`sessionId` 生命周期、detach/expire/purge 规则形成正式设计。
- 下一步最小实改：
  - 先在文档里明确两案取舍：`A=单进程最终真源`，`B=需要跨重启/跨进程 session`
  - 如果选 `A`，就把 restore/restart 后 session 失效写成正式 contract，并同步到 runbook
  - 如果选 `B`，就先定义最小持久化字段与恢复时序，不急着一次性重写实现
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/session-smoke.js`
  - `pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case session --require-legacy-auth`
- 退出条件：
  - session 真源方案在文档里只剩一个正式答案
  - `detach / expire / purge / restore / replace` 的语义可通过 smoke 与 runbook 同时解释
- 风险：会影响 kick、重连、断线恢复、GM restore 清会话。
- 并行性：`可先做设计与证明，不建议直接并行重写`
- 相关文件：
  - `../packages/server/src/network/world-session.service.js`
  - `../packages/server/src/network/world-session-bootstrap.service.js`

### T08 把 auth trace 从“完成定义依赖项”降为“可选观测”

- 当前状态：trace 已很完整，proof 也越来越依赖 trace 才能解释来源。
- 为什么还没完成：trace 解决了“看见发生了什么”，但没有替代“主链结构已经 next-native”。
- 完成定义：trace 继续保留给调试和验收；但完成定义建立在真源结构上，而不是“trace 看起来正确”。
- 风险：过早削弱 trace 会丢失真源替换期的排障抓手。
- 并行性：`可安全并行做观测整理，不能拿它替代真源替换`
- 相关文件：
  - `../packages/server/src/network/world-player-token.service.js`
  - `../packages/server/src/tools/next-auth-bootstrap-smoke.js`

## 二、P1 证明链与运营面闭环

### T09 在真实 DB 环境实跑 `gm-database-backup-persistence`

- 当前状态：仓库内命令已补齐，但当前环境还没做带真实 DB 的正式取证。
- 为什么还没完成：现在只能说“proof 命令已存在”，不能说“backup dir 持久化已在真实环境闭环”。
- 完成定义：在真实 DB 环境跑通 `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`，并把结果回写文档。
- 下一步最小实改：
  - 准备一份固定的真实 DB 取证模板：环境、命令、开始/结束时间、产物路径、结论
  - 把 smoke 输出里真正需要回写文档的字段写死，避免每次只写“通过”
  - 跑完后同步把结论补进 `TESTING` 和这份任务详单
- 最小验证：
  - `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`
- 退出条件：
  - 有一份真实 DB 环境成功取证记录
  - 文档能指出 proof 是在哪个环境、什么时间、用什么配置跑通的
- 风险：可能暴露 backup dir、恢复后状态读取、持久化元数据的新问题。
- 并行性：`可与 shadow destructive proof 分开并行准备`
- 相关文件：
  - `../packages/server/src/tools/gm-database-backup-persistence-smoke.js`
  - `../packages/server/TESTING.md`

### T10 在 shadow 维护窗口实跑 destructive 数据库 proof

- 当前状态：命令与安全门已补齐，但还没在真实 shadow 维护窗口取证。
- 为什么还没完成：当前不能把“仓库里有 `verify:replace-ready:shadow:destructive`”当作“shadow destructive proof 已闭环”。
- 完成定义：在维护窗口下跑通 `pnpm verify:replace-ready:shadow:destructive`，并确认 backup / download / restore / checkpoint metadata 全绿。
- 下一步最小实改：
  - 先把维护窗口前置条件写成 checklist：实例、GM 密码、shadow URL、允许 destructive、回滚预案
  - destructive 实跑结束后，把“跑前基线 / 跑后恢复 / checkpoint 元数据”三块结果固定回写
  - 若首次失败，优先补 runbook，不要先把失败归因成脚本问题
- 最小验证：
  - `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 pnpm verify:replace-ready:shadow:destructive`
- 退出条件：
  - 有一份真实维护窗口 destructive proof 记录
  - runbook 能明确说明谁、何时、如何安全重跑这条链
- 风险：是 destructive 操作，必须串行执行，且会碰到真实 shadow runtime。
- 并行性：`不可与其他 destructive 操作并行`
- 相关文件：
  - `../packages/server/src/tools/shadow-gm-database-proof.js`
  - `../packages/server/REPLACE-RUNBOOK.md`

### T11 把 `local / acceptance / full / shadow-destructive` 四层门禁口径彻底写死

- 当前状态：本轮 README、TESTING、RUNBOOK 已继续统一这四层口径，并补齐 `full` 与 `shadow-destructive` 的依赖、组合顺序和维护窗口提示；剩下主要是 workflow / wrapper 级零星核对，而不是主文档空白。
- 为什么还没完成：现在的主文档误读空间已经缩小，但还没到“所有 wrapper/workflow/别名输出都完全一致”的程度。
- 完成定义：README、TESTING、RUNBOOK、workflow、wrapper 对 `local / acceptance / full / shadow-destructive` 的回答问题完全一致。
- 下一步最小实改：
  - 增加一张四层门禁对照表：目的、是否要求 DB、是否要求 shadow、是否 destructive、适用场景
  - 统一 wrapper 输出文案，避免命令行提示和文档口径不一致
  - 把 `verify:server-next*` alias 在文档中统一降格成兼容别名说明，避免继续被当主入口
- 最小验证：
  - `rg -n "local|acceptance|full|shadow-destructive" packages/server/README.md packages/server/TESTING.md packages/server/REPLACE-RUNBOOK.md .github/workflows/deploy-server-next.yml`
- 退出条件：
  - 任何一个入口文件都能用同一套词解释四层门禁
  - 不再出现“默认门禁 = 完整替换完成”的文案漂移
- 风险：如果口径不稳，后面真源替换每做一步都会被误判完成度。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/server/README.md`
  - `../packages/server/TESTING.md`
  - `../packages/server/REPLACE-RUNBOOK.md`
  - `../.github/workflows/deploy-server-next.yml`

### T12 把 GM/admin/restore 自动化边界与人工回归边界正式分层

- 当前状态：`gm-compat`、`gm-database-smoke`、`shadow` 只读链、`shadow destructive` 都已补齐，自动 proof 分层已经基本成型，仓库里可以直接看出 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat` 这条 proof 链路，文档在说明哪些属于自动化，哪些仍要靠人工演练。
- 为什么还没完成：虽然 automation proof pipeline 的入口都在 README/TESTING/RUNBOOK 里写了，但缺乏真实 shadow/GM 环境复跑与制度化闭环，运营还不能把“命令存在" 直接当作“自动化已经完成”的取证。
- 完成定义：在实物 shadow/GM 上复跑上述自动链路、记录结果，并把自动 proof 与人工维护的边界、gate、回退、维护窗口规程写死在 RUNBOOK/TESTING/SOP，确保每次替换可以按流程复核。
- 下一步最小实改：
  - 新增一张“自动 proof / 人工回归”分层表，明确每项责任归属
  - 把 GM/admin/restore 中仍必须人工观察的项逐条列出来，而不是只说“仍需人工”
  - 给 acceptance/full/shadow-destructive 补一段“未覆盖什么”的固定说明
- 最小验证：
  - 文档核对：`packages/server/TESTING.md`
  - 文档核对：`packages/server/REPLACE-RUNBOOK.md`
- 退出条件：
  - 运营可以仅凭 RUNBOOK/TESTING 分辨“命令能证明什么、不能证明什么”
  - acceptance/full/shadow-destructive 不再被误解成完整人工运营回归
- 风险：运营仍仰赖 legacy 能力，若边界文档和实际执行脱节，会让替换看起来“已完成”却没真正落地。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/server/TESTING.md`
  - `../packages/server/REPLACE-RUNBOOK.md`

### T13 决定 GM/admin/restore 真源是否 next 化，还是长期保留 compat 壳

- 当前状态：自动 proof 入口在补齐，但运营真源本身仍主要复用 legacy HTTP/GM/admin 能力。
- 为什么还没完成：现在还没有最终决定“只证明可用”还是“也要把后台真源整体 next 化”。
- 完成定义：给出明确策略：长期保留 compat 壳，或继续推进后台真源 next 化；并写清迁移顺序。
- 下一步最小实改：
  - 先列一张运营能力清单：登录、GM、admin、restore、地图维护、只读检查点
  - 对每项标记三种目标：`长期 compat`、`迁移后下线`、`需要 next-native`
  - 把最终决策写回执行方案，避免后续每次又从头讨论
- 最小验证：
  - 文档核对：`docs/next-remaining-execution-plan.md`
  - 文档核对：`packages/server/REPLACE-RUNBOOK.md`
- 退出条件：
  - GM/admin/restore 每类能力都有明确长期归宿
  - 之后的代码改动可以按该策略判断是“收口”还是“过度投入”
- 风险：这是产品与运维策略问题，不是纯工程清理。
- 并行性：`可先文档化决策，不必立刻改代码`
- 相关文件：
  - `../packages/server/src/compat/legacy/http`
  - `./next-remaining-execution-plan.md`

### T14 把 deploy workflow 升级到“可选 shadow destructive 补证”

- 当前状态：本轮 `Deploy Server Next` workflow 已新增显式 `run-destructive-proof` 输入，默认关闭；只有手动开启时，才会在 shadow 验证后带 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 跑 `pnpm verify:replace-ready:shadow:destructive`。
- 为什么还没完成：workflow 入口已经具备受控补证能力，但真实维护窗口的 secret / 操作手册 / 实际执行记录还没补齐。
- 完成定义：workflow 支持受控、显式 gated 的 maintenance-window destructive proof，且默认不误触发。
- 下一步最小实改：
  - 把 workflow 输入、环境变量、维护窗口前置条件同步进 runbook
  - 补一段“默认为什么关闭、什么情况下允许开启”的说明，避免误触
  - 完成一次真实演练后，把截图/日志摘要回写到操作文档
- 最小验证：
  - `.github/workflows/deploy-server-next.yml` 文档与输入核对
  - `scripts/replace-ready-shadow-destructive.js` 入口核对
- 退出条件：
  - 维护窗口操作者可以只看 workflow 输入说明和 runbook 就安全执行
  - destructive proof 不会被日常 deploy 路径误带上
- 风险：一旦接错，会把 destructive 操作混进日常 deploy。
- 并行性：`可安全并行设计，接线时需谨慎`
- 相关文件：
  - `../.github/workflows/deploy-server-next.yml`
  - `../scripts/replace-ready-shadow-destructive.js`

## 三、P1 最小包体 / 性能 / 扩展边界

### T15 继续压薄 `Bootstrap + MapStatic + PanelDelta` 首包重复

- 当前状态：steady-state `WorldDelta` 不是最突出的痛点，首包重复更明显。
- 为什么还没完成：`Bootstrap.self`、`MapStatic`、`PanelDelta` 之间仍有重复字段和重复分层。
- 完成定义：首包结构进一步瘦身；静态、低频和面板初始化字段边界明确；文档化“什么放哪一层”。
- 下一步最小实改：
  - 先列一张首包字段对照表：`Bootstrap / MapStatic / PanelDelta(full)` 各自承载什么
  - 把最明显重复的字段先归并出一刀，不一次性大改协议
  - 同步写明“静态 / 低频 / 面板初始化”三层边界，避免后续再次混放
- 最小验证：
  - `pnpm --filter @mud/server-next bench:first-package`
  - `pnpm --filter @mud/shared-next build`
- 退出条件：
  - 文档里有明确字段归属表
  - 首包 bench 能反映至少一项包体或耗时下降
- 风险：改动会同时触达 server 投影、shared 类型和 client 初始化逻辑。
- 并行性：`可与纯后端性能分析并行，不能与大规模 protocol 改写混改`
- 相关文件：
  - `../packages/server/src/network/world-projector.service.js`
  - `../packages/server/src/network/world-sync.service.js`
  - `../packages/shared/src/protocol.ts`

### T16 把 `WorldProjector` 从整量 capture/clone + diff 再往下拆

- 当前状态：`world-projector.service.js` 仍明显依赖 `captureWorldState / capturePlayerState / combineProjectorState / diff*` 的整量建模。
- 为什么还没完成：虽然 direct legacy helper 已经清理，但 projector 仍偏“全量快照 + 差量比较”。
- 完成定义：高频链路尽量由局部 patch、revision 驱动和切片投影组成，减少整量 capture/clone。
- 下一步最小实改：
  - 先从只读盘点开始，把 projector 输出切成 3 到 5 个稳定 slice，而不是先改算法
  - 找一块最孤立的 slice 试点 revision 驱动，验证可以不经过整量 combine/diff
  - 为该 slice 增加 micro-bench，先量化收益再扩大
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/bench-sync.js`
  - 试点 slice 对应 smoke 回归
- 退出条件：
  - 至少一块 projector slice 已不再依赖整量 capture/clone 路径
  - bench 能看见该 slice 的分配或耗时下降
- 风险：这里是高频核心，容易引入同步错误。
- 并行性：`只适合做低风险切缝或基准分析，不适合并行大改`
- 相关文件：
  - `../packages/server/src/network/world-projector.service.js`

### T17 降低 `panel/attr bonus` 的每 tick CPU 成本

- 当前状态：`buildAttrBonuses`、面板差量和多组 clone/diff 仍在高频链路里反复运行。
- 为什么还没完成：当前面板与属性投影仍偏“每次重算 + 深克隆 + diff”。
- 完成定义：attr bonus 与 panel diff 具备更明确的 invalidation / cache / revision 机制。
- 下一步最小实改：
  - 先盘点会让 attr/panel 失效的真实事件源，而不是直接上缓存
  - 把 attr bonus 计算和 panel diff 拆成两个独立 revision
  - 先让“无属性变更 tick”跳过 bonus 重算，再考虑更大范围缓存
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/bench-sync.js`
  - 属性、装备、buff、功法相关 smoke 回归
- 退出条件：
  - 文档能说明 attr/panel 各自的 invalidation 事件
  - 无属性变更 tick 下不再重复执行同一套 bonus 重算
- 风险：容易影响属性、装备、buff、功法、动作面板的一致性。
- 并行性：`可和首包瘦身分析并行；代码改动建议单线`
- 相关文件：
  - `../packages/server/src/network/world-projector.service.js`
  - `../packages/server/src/network/world-sync.service.js`

### T18 降低 minimap marker 的构建、过滤、排序成本

- 当前状态：`buildMinimapMarkers`、`buildVisibleMinimapMarkers`、`diffVisibleMinimapMarkers` 仍在 tick 链路里做集合过滤与排序。
- 为什么还没完成：当前 minimap 可见标记仍有每 tick 额外 CPU。
- 完成定义：标记构建与可见计算具备更强缓存、地图级预处理或事件驱动刷新。
- 下一步最小实改：
  - 先确认 marker 的变更源是地图静态、AOI 可见集变化，还是玩家状态变化
  - 把地图静态 marker 预处理和玩家可见 marker 过滤分成两段缓存
  - 如有排序，先证明排序是否真的每 tick 必要
- 最小验证：
  - `pnpm --filter @mud/server-next exec node dist/tools/bench-sync.js`
  - minimap 相关 UI / smoke 回归
- 退出条件：
  - 地图级静态 marker 不再每 tick 重建
  - 可见 marker 过滤与排序至少有一段被缓存或改成按需刷新
- 风险：会影响地图 UI、一致性与视野逻辑。
- 并行性：`可安全并行分析，代码改动建议单线`
- 相关文件：
  - `../packages/server/src/network/world-sync.service.js`

### T19 建立高负载性能门禁与基准

- 当前状态：本轮已补进 `bench:first-package` 骨架，可直接测 `InitSession / Bootstrap / MapStatic` 的首包耗时与包体；但 tick、AOI、投影、panel 热路径仍没有正式基准。
- 为什么还没完成：现在只补了首包基准入口，没有形成 replace-ready 级的完整性能门禁矩阵。
- 完成定义：至少有首包、tick、同步投影、AOI 相关的基准与门禁数据。
- 下一步最小实改：
  - 固定 3 类基准场景：首包、稳定 tick、多人 AOI/投影
  - 给每类场景定义最小输出指标：耗时、分配、包体、tick 次数
  - 先把基准做成独立脚本，再决定哪些纳入 replace-ready
- 最小验证：
  - `pnpm --filter @mud/server-next bench:first-package`
  - `pnpm --filter @mud/server-next exec node dist/tools/bench-sync.js`
- 退出条件：
  - 至少有 3 条可复跑基准命令
  - 每条基准都有固定输入和可比较输出，不再只看临场日志
- 风险：没有基准就容易在后续扩展中无感回退。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/server/package.json`
  - `../packages/server/src/tools`

### T20 把扩展新系统时默认往巨型 `PlayerState / sync/projector` 堆字段的趋势压住

- 当前状态：虽然 direct boundary 已清零，但 `WorldProjectorService / WorldSyncService` 仍是中心耦合点。
- 为什么还没完成：新增系统仍很容易继续往巨型状态结构和中心化投影里堆字段。
- 完成定义：扩展路径被切成稳定 slices；新系统默认不需要改一个巨型 `PlayerState` 和中心化 projector 才能接入。
- 下一步最小实改：
  - 先写一份扩展约束：新增系统优先放在哪里、什么情况下允许改 `PlayerState`
  - 选一个低风险系统做 slice 化试点，证明不必再改中心 projector
  - 把试点经验回写成代码注释或架构文档
- 最小验证：
  - 新试点系统功能 smoke
  - 代码审查时可直接检查是否违反扩展约束
- 退出条件：
  - 仓库里有一条明确的“新增系统接入路径”规范
  - 至少一项新能力已按 slice 路径接入，而不是继续往巨型状态堆字段
- 风险：这是“极高扩展度”目标的关键，否则替换后仍会继续膨胀。
- 并行性：`可先做架构约束与切缝，代码主改动不宜并行`
- 相关文件：
  - `../packages/server/src/network/world-projector.service.js`
  - `../packages/server/src/network/world-sync.service.js`
  - `../packages/shared/src/protocol.ts`

## 四、P1 client-next / shared-next / 稳定性

### T21 把 `client-next` 的事件表面完全 next-native 命名化

- 当前状态：本轮 `socket.ts` 已把 `MapStatic / Realm` 的 next-native 回调数组与 `onMapStatic / onRealm` helper 补出来，旧 `onMapStaticSync / onRealmUpdate` 还保留为兼容 alias。
- 为什么还没完成：运行时事件表面已经开始 next-native 化，但调用方仍可能继续走旧 alias，API 表面还没有完全去 legacy 命名。
- 完成定义：client-next 的事件、回调和状态接口表面完全与 next 协议命名一致。
- 下一步最小实改：
  - 先列出仍保留的 alias 清单，不急着一次性删光
  - 给调用方逐个替换成 next-native 名称，再把 alias 标成 deprecated
  - 最后一刀再删除 alias，而不是先删再全仓修
- 最小验证：
  - `pnpm --filter @mud/client-next build`
  - client-next 网络事件相关 UI 回归
- 退出条件：
  - `socket.ts` 对外只暴露 next-native 命名
  - 调用方不再引用 `onMapStaticSync`、`onRealmUpdate` 之类旧名
- 风险：会影响多个 UI 模块的订阅和初始化调用。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/client/src/network/socket.ts`

### T22 稳定 `shared-next` 的数值、realm、bootstrap/panel/delta 类型基线

- 当前状态：`NumericStats.extraRange / extraArea` 的 helper 补齐后，本轮又在 realm 模板侧加了 `ensureNumericStatsTemplateStats` 守卫，并已通过 `pnpm --filter @mud/shared-next build`；但 shared 字段新增时的全链路一致性仍主要靠人工和编译兜底。
- 为什么还没完成：虽然 realm 数值模板现在有了更硬的结构守卫，但 shared 层还没有把“新增字段必须补初始化 / clone / reset / merge / value / projection”彻底变成统一门禁。
- 完成定义：数值体系、realm 常量、bootstrap/panel/delta shared 类型形成稳定一致的更新约束。
- 下一步最小实改：
  - 先把 shared 新字段 checklist 正式写出来，而不是继续靠口头约定
  - 把 `bootstrap / panel / delta` 各自需要补齐的 helper 列成固定清单
  - 继续把高风险结构变成脚本检查，而不是只靠 build 失败
- 最小验证：
  - `pnpm --filter @mud/shared-next build`
  - `pnpm --filter @mud/shared-next check:numeric-stats`
- 退出条件：
  - shared 新字段补全规则在文档或脚本里有统一定义
  - 数值、realm、bootstrap/panel/delta 至少各有一层自动守卫
- 风险：shared 出问题会先把整个 workspace 验证链打爆。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/shared/src/numeric.ts`
  - `../packages/shared/src/constants/gameplay/realm.ts`
  - `../packages/shared/src/protocol.ts`
  - `../packages/shared/src/value.ts`

### T23 为 shared 字段新增补全“初始化 / 克隆 / 重置 / 序列化 / 投影”一致性检查

- 当前状态：本轮已新增 `packages/shared/scripts/check-numeric-stats.cjs` 和 `pnpm --filter @mud/shared-next check:numeric-stats`，会校验 `NUMERIC_STATS_KEYS`、`createNumericStats`、`cloneNumericStats` 以及 value 映射键的覆盖关系，并已实跑通过。
- 为什么还没完成：现在只对 `NumericStats` 这条共享高风险结构建立了自动检查，`reset / addPartial / protobuf / protocol projection` 等更广的一致性面还没全部纳入。
- 完成定义：新增 shared 字段时，如果漏补配套 helper，会在脚本或测试层尽早失败。
- 下一步最小实改：
  - 把 `NumericStats` 当模板，再扩一条到 `bootstrap/panel/delta` 或 protobuf 映射
  - 让脚本输出缺失项清单，而不是只给通过/失败
  - 把检查命令接进 shared 或 workspace 常用验证链
- 最小验证：
  - `pnpm --filter @mud/shared-next check:numeric-stats`
  - 新增的一致性检查脚本实跑
- 退出条件：
  - 至少两类 shared 结构已有自动一致性检查
  - 新增 shared 字段时，漏补 helper 会在脚本层直接报出缺项
- 风险：没有这个门禁，shared 层会反复成为 replace-ready 的非业务型阻塞。
- 并行性：`可安全并行`
- 相关文件：
  - `../packages/shared/scripts/check-numeric-stats.cjs`
  - `../packages/shared/src`
  - `../legacy/shared/src`

## 五、P2 替换后 compat 策略

### T24 定稿 legacy HTTP / GM / socket compat 的最终保留策略

- 当前状态：当前策略是“先别硬删”，但还没定稿哪些长期保留、哪些降成迁移入口、哪些可以删除。
- 为什么还没完成：在 auth/bootstrap 真源没收完之前，过早定稿只会制造返工。
- 完成定义：明确 GM/admin/HTTP 是否保留为外层 compat 壳；legacy auth 是否仅保留为迁移入口；legacy socket 是否降到只读或最小兼容。
- 下一步最小实改：
  - 按 `HTTP / GM / socket` 三类分别列“长期保留 / 迁移期保留 / 计划删除”
  - 把每类保留的理由写清：运营需要、迁移需要、外部依赖需要
  - 把删除前置条件绑定到 `T01-T07`、`T13`、`T25`，避免过早删
- 最小验证：
  - 文档核对：`docs/next-remaining-execution-plan.md`
  - 文档核对：`docs/next-legacy-removal-checklist.md`
- 退出条件：
  - compat 保留策略有表格，不再停留在“先别删”
  - 后续任何 legacy 删除动作都能指向明确前置条件
- 风险：会影响维护成本、替换心理预期和后续架构边界。
- 并行性：`可先做文档决策，不必立刻删代码`
- 相关文件：
  - `../packages/server/src/compat/legacy`
  - `./next-remaining-execution-plan.md`

### T25 把“完整替换完成”的判定标准从文档口径变成实际门禁

- 当前状态：完成定义已经写在文档里，但还没有全部落成可执行门禁。
- 为什么还没完成：目前还是“有文档判定标准”，不是“每一项都有自动或半自动 gate”。
- 完成定义：完成标准里的关键项都有对应 smoke / workflow / 手工 runbook 条目，不再停留在文字口径。
- 下一步最小实改：
  - 先做一张“完成标准 -> gate -> 责任入口”映射表
  - 把无法自动化的项单独标记为人工 gate，不再和自动 gate 混写
  - 对没有 gate 的完成标准项明确标红，作为下轮优先补项
- 最小验证：
  - 文档核对：`docs/next-remaining-execution-plan.md`
  - 文档核对：`packages/server/TESTING.md`
  - 文档核对：`packages/server/REPLACE-RUNBOOK.md`
- 退出条件：
  - 每一条“完整替换完成”标准都能指向一个具体 gate
  - 文档里不再出现“看起来差不多完成”的主观口径
- 风险：没有门禁化，后续很容易再次出现“感觉差不多可以替换”的口径漂移。
- 并行性：`可安全并行`
- 相关文件：
  - `./next-remaining-execution-plan.md`
  - `../packages/server/TESTING.md`
  - `../packages/server/REPLACE-RUNBOOK.md`

## 六、当前最关键的“还剩多少”

如果按“仓库里还没写的 proof 代码”看：

- 关键代码缺口：`接近 0`
- 剩余主要是：真实环境执行与真源替换

如果按“能不能完整替换游戏整体”看：

- `auth/token/bootstrap/snapshot/session`：`仍是第一阻塞`
- GM/admin/restore/shadow 运营面：`proof 已大幅补齐，但真源与维护口径未定稿`
- 最小包体 / 性能 / 扩展度：`仍明显未达标`
- `shared-next / client-next` 稳定性：`部分满足，但还未到“可放心长期承载替换”`

最关键的优先顺序建议：

1. 先把真实环境 proof 跑完，拿掉“只存在仓库命令”的状态。
2. 单线推进 `authenticated identity fallback -> authenticated snapshot fallback -> bootstrap 单线入口 -> session 真源边界`。
3. 再做首包瘦身、projector/sync 热路径优化和 shared 稳定化。
4. 最后定稿 compat 保留策略。

一句话结论：

现在的 `next` 已经不是“还没开始替换”，也不是“只差最后几条 smoke”；它已经进入“证明链基本齐了，但底层真源替换、运营面真源策略、以及性能/扩展度目标还没真正完成”的阶段。

## 七、建议执行批次

### 批次 A：先把“可验证接班”锁死

- 包含任务：
  - `T09`
  - `T10`
  - `T11`
  - `T12`
  - `T14`
  - `T25`
- 目标：
  - 让“已经有 proof 命令”变成“真实环境已取证”
  - 让 `local / acceptance / full / shadow-destructive` 四层口径稳定
- 适合并行性：
  - 高
- 这批做完后能减少的剩余：
  - 主要是“还不能正式宣称可接班”的不确定性

### 批次 B：单线推进 auth/bootstrap 真源主线

- 包含任务：
  - `T01`
  - `T02`
  - `T03`
  - `T04`
  - `T05`
  - `T06`
  - `T07`
  - `T08`
- 目标：
  - 把 authenticated 主链从 `compat/token/snapshot fallback` 收成 next-native
- 适合并行性：
  - 低
- 这批做完后能减少的剩余：
  - 主要是“为什么现在还不能叫完整替换”的第一阻塞

### 批次 C：把替换质量拉到可接受

- 包含任务：
  - `T15`
  - `T16`
  - `T17`
  - `T18`
  - `T19`
  - `T20`
  - `T21`
  - `T22`
  - `T23`
- 目标：
  - 把“能跑”推进到“包体、性能、扩展性、稳定性都不明显拖后腿”
- 适合并行性：
  - 中
- 这批做完后能减少的剩余：
  - 主要是你最初目标里“最高性能 / 极高扩展度 / 系统稳定性”的差距

### 批次 D：替换后的治理定稿

- 包含任务：
  - `T13`
  - `T24`
- 目标：
  - 定稿后台 compat 壳和 legacy 的最终命运
- 适合并行性：
  - 中
- 这批做完后能减少的剩余：
  - 主要是长期维护成本和架构口径漂移

## 八、执行看板

这一节不重复任务描述，只补最直接的排期信息：

- `收益`
  - `高`：做完后会明显减少“还差多少”
  - `中`：能稳定护栏或减少后续返工
  - `低`：更多是收尾、治理或长期维护收益
- `风险`
  - `高`：直接影响登录、会话、snapshot、数据库恢复或高频同步
  - `中`：影响协议、初始化、运营脚本或共享类型
  - `低`：主要是文档、门禁或低风险整理
- `subagent`
  - `适合`：适合只读分析、文档整理、低风险收口并行
  - `不适合`：最好主线程单线推进

### P0 真源主线看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T01` identity fallback 收口 | 高 | 高 | 不适合 | `../packages/server/src/network/world-player-auth.service.js` |
| `T02` player source next-native 化 | 高 | 高 | 不适合 | `../packages/server/src/network/world-player-source.service.js` |
| `T03` snapshot fallback 收口 | 高 | 高 | 不适合 | `../packages/server/src/network/world-session-bootstrap.service.js` |
| `T04` snapshot 真源主链 next-native 化 | 高 | 高 | 不适合 | `../packages/server/src/network/world-player-snapshot.service.js` |
| `T05` bootstrap 单线入口 | 高 | 高 | 不适合 | `../packages/server/src/network/world.gateway.js` |
| `T06` guest/authenticated/GM bootstrap 拆分 | 中 | 高 | 不适合 | `../packages/server/src/network/world.gateway.js` |
| `T07` session 真源边界定稿 | 高 | 高 | 不适合 | `../packages/server/src/network/world-session.service.js` |
| `T08` trace 降级为可选观测 | 中 | 中 | 适合 | `../packages/server/src/network/world-player-token.service.js` |

### 证明链 / 运营面看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T09` 真实 DB 跑 backup persistence proof | 高 | 中 | 不适合 | `../packages/server/src/tools/gm-database-backup-persistence-smoke.js` |
| `T10` shadow destructive proof 实跑 | 高 | 高 | 不适合 | `../packages/server/src/tools/shadow-gm-database-proof.js` |
| `T11` 四层门禁口径写死 | 中 | 低 | 适合 | `../packages/server/TESTING.md` |
| `T12` 自动化与人工边界分层 | 中 | 低 | 适合 | `../packages/server/REPLACE-RUNBOOK.md` |
| `T13` GM/admin/restore 真源策略定稿 | 中 | 中 | 适合 | `./next-remaining-execution-plan.md` |
| `T14` deploy workflow 可选 destructive 补证 | 中 | 中 | 适合 | `../.github/workflows/deploy-server-next.yml` |

### 性能 / 包体 / 扩展看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T15` 首包重复瘦身 | 高 | 中 | 不适合 | `../packages/server/src/network/world-sync.service.js` |
| `T16` projector 从整量 capture/diff 再下拆 | 高 | 高 | 不适合 | `../packages/server/src/network/world-projector.service.js` |
| `T17` panel/attr bonus 热路径降载 | 中 | 高 | 不适合 | `../packages/server/src/network/world-projector.service.js` |
| `T18` minimap marker 热路径优化 | 中 | 中 | 适合 | `../packages/server/src/network/world-sync.service.js` |
| `T19` 建立高负载基准与门禁 | 高 | 中 | 适合 | `../packages/server/src/tools` |
| `T20` 压住巨型 PlayerState / sync/projector 继续膨胀 | 高 | 高 | 不适合 | `../packages/server/src/network/world-projector.service.js` |

### client / shared 看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T21` client-next API 表面 next-native 命名化 | 中 | 低 | 适合 | `../packages/client/src/network/socket.ts` |
| `T22` shared-next 数值 / realm / bootstrap 类型基线稳定 | 高 | 中 | 适合 | `../packages/shared/src/numeric.ts` |
| `T23` shared 一致性自动检查 | 高 | 中 | 适合 | `../packages/shared/src` |

### compat 策略看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T24` legacy compat 最终保留策略 | 中 | 中 | 适合 | `./next-remaining-execution-plan.md` |
| `T25` 把完成标准从文档变成真实门禁 | 高 | 中 | 适合 | `../packages/server/TESTING.md` |

## 九、最值得立刻做的 10 项

如果目标是最快减少“还剩多少”，当前最值得立刻推进的是：

1. `T09` 真实 DB 跑 `backup-persistence` proof
2. `T10` shadow 维护窗口跑 destructive proof
3. `T11` 四层门禁口径彻底写死
4. `T01` identity fallback 收口
5. `T03` snapshot fallback 收口
6. `T05` bootstrap 单线入口
7. `T07` session 真源边界定稿
8. `T15` 首包重复瘦身
9. `T19` 高负载性能门禁
10. `T22` shared-next 类型基线稳定

## 十、一句话排期建议

最稳的顺序不是“先继续刷代码量”，而是：

1. 先把 `T09/T10/T11` 做掉，收口“能不能证明接班”。
2. 然后主线程单线推进 `T01/T03/T05/T07`，这是最核心的真源硬阻塞。
3. 再把 `T15/T16/T19/T22` 做掉，决定能不能接近你最初要的“最小包体 / 最高性能 / 极高扩展度 / 系统稳定性”。

## 十一、预计工期

这里只给工程排期量级，不把它写成承诺时间。量级定义：

- `XS`
  - 半天到 1 天
  - 主要是文档、脚本、门禁整理或低风险小改
- `S`
  - 1 到 3 天
  - 单模块内的中小改动，或一条 proof/验证链闭环
- `M`
  - 3 到 7 天
  - 涉及 2 到 4 个模块、需要验证和回归
- `L`
  - 1 到 2 周
  - 涉及主链真源、协议层、或高频核心路径
- `XL`
  - 2 周以上
  - 跨模块体系化替换或带迁移/策略定稿的大项

### 各任务预计工期

| 任务 | 工期 | 备注 |
| --- | --- | --- |
| `T01` | `L` | 直接打 authenticated identity 主链 |
| `T02` | `XL` | 本质是 source 真源替换，不只是改顺序 |
| `T03` | `L` | 直接打 snapshot 主链 |
| `T04` | `XL` | 需要和旧玩家 snapshot 迁移一起考虑 |
| `T05` | `M` | 主要是入口 contract 收线 |
| `T06` | `M` | 更偏结构整理与 contract 固化 |
| `T07` | `L` | 真正难点是边界定稿，不只是改代码 |
| `T08` | `S` | 主要是 trace 定位与完成定义调整 |
| `T09` | `S` | 主要取决于 DB 环境准备 |
| `T10` | `S` | 主要取决于维护窗口和 shadow 条件 |
| `T11` | `XS` | 文档 / wrapper / workflow 口径统一 |
| `T12` | `XS` | 运营边界写死为主 |
| `T13` | `M` | 有策略讨论成分 |
| `T14` | `S` | workflow 受控接线 |
| `T15` | `M` | 首包字段梳理 + client/server/shared 同步 |
| `T16` | `XL` | 高频核心，必须小步推进 |
| `T17` | `M` | 属性/面板 invalidation 体系化 |
| `T18` | `S` | marker 逻辑可局部优化 |
| `T19` | `M` | 需要工具、样例场景和阈值 |
| `T20` | `XL` | 是架构收口，不是点修 |
| `T21` | `S` | client-next 网络表面收口 |
| `T22` | `M` | shared 基线稳定需要多处同步 |
| `T23` | `M` | 需要形成一致性检查方案 |
| `T24` | `S` | 主要是策略定稿和文档化 |
| `T25` | `M` | 要把标准转成真实 gate，不只是补文档 |

## 十二、前置条件

很多任务不是“想做就能做”，尤其是主链真源和 destructive proof。这里写死每项最关键的前置条件。

| 任务 | 前置条件 |
| --- | --- |
| `T01` | 至少先明确 next identity 落库覆盖面；最好已有 `T11` 的统一门禁口径 |
| `T02` | 必须先明确 next player source 的正式真源落点；否则只会变成 facade 换名 |
| `T03` | 必须先确认 next snapshot 文档结构稳定，且 `missingSnapshotRejected` 这类 proof 已稳定 |
| `T04` | 最好先完成 `T03` 的主链收口方案，并准备旧玩家 snapshot 迁移策略 |
| `T05` | 最好先把 `connect_token / hello / guest / GM` 当前 contract 在文档中写清 |
| `T06` | 最好先明确 `T05` 的唯一 bootstrap 入口语义 |
| `T07` | 必须先回答“单进程真源是否可接受”；否则无法收敛成正式设计 |
| `T08` | 不要求真源先改完，但至少要有稳定的 trace 使用边界 |
| `T09` | 真实 DB 环境可用；当前 `server-next` 编译和 smoke 为绿 |
| `T10` | shadow 地址、GM 密码、维护窗口、`SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 全部就位 |
| `T11` | 当前 README / TESTING / RUNBOOK / workflow 口径先全部收集出来 |
| `T12` | 至少把现有自动化 proof 清单列齐，不然人工边界无法定义 |
| `T13` | 最好先完成 `T11/T12`，不然策略讨论没有稳定边界 |
| `T14` | 最好先人工跑通 `T10` 一次，再考虑接入 workflow |
| `T15` | 需要先清点 `Bootstrap / MapStatic / PanelDelta` 重复字段 |
| `T16` | 最好先有 `T19` 的基准框架，不然收益不可量化 |
| `T17` | 需要先梳理 attr/panel revision 与 invalidation 源 |
| `T18` | 需要先确认 marker 当前正确性，再做缓存或预处理 |
| `T19` | 需要确定至少一套稳定的基准场景和负载样本 |
| `T20` | 需要先明确哪些 slice 可以从巨型 `PlayerState` 中拆出 |
| `T21` | 需要先盘点 client-next 仍残留的 legacy 风格命名表面 |
| `T22` | 当前 shared-next build 能稳定通过，便于小步收口 |
| `T23` | 需要先明确 shared 字段补全 checklist |
| `T24` | 最好放在 `T01-T07` 更稳定之后 |
| `T25` | 至少先完成 `T11/T12`，否则标准还没写死，无法门禁化 |

## 十三、可安全并行矩阵

这里不按“能不能一起开工”泛讲，而是按你后面多 agent 执行时最需要的三种关系写死：

- `可并行`
  - 可以安全并行推进，最多共享只读上下文
- `可并行但要避开同一写集`
  - 可以一起做，但不能同时改同一批核心文件
- `不要并行`
  - 必须单线

### A 组：真源主线

| 任务 | 并行关系 | 说明 |
| --- | --- | --- |
| `T01` | 不要并行 | 会改 authenticated identity 主链 |
| `T02` | 不要并行 | 会动 player source 总入口 |
| `T03` | 不要并行 | 会改 authenticated snapshot 主链 |
| `T04` | 不要并行 | 会牵动 snapshot 真源完成定义 |
| `T05` | 不要并行 | 会改 bootstrap 入口 contract |
| `T06` | 可并行但要避开同一写集 | 可以做文档化或小切缝，但别和 `T05` 同改 `world.gateway.js` |
| `T07` | 不要并行 | 会牵动 session 设计和运行时边界 |
| `T08` | 可并行 | 只要不改真源主逻辑，可单独整理 trace |

### B 组：证明链与运营面

| 任务 | 并行关系 | 说明 |
| --- | --- | --- |
| `T09` | 可并行 | 和 `T10` 可分环境准备并行 |
| `T10` | 不要并行 | destructive proof 必须串行 |
| `T11` | 可并行 | 文档与 wrapper 口径整理 |
| `T12` | 可并行 | 人工/自动边界整理 |
| `T13` | 可并行 | 主要是策略与文档，不必等代码改完 |
| `T14` | 可并行但要避开同一写集 | 可与 `T11` 并行，但别同时改同一 workflow |

### C 组：性能 / 包体 / 扩展

| 任务 | 并行关系 | 说明 |
| --- | --- | --- |
| `T15` | 可并行但要避开同一写集 | 可先做字段盘点与 client/shared 配套分析 |
| `T16` | 不要并行 | projector 是高频核心 |
| `T17` | 可并行但要避开同一写集 | 可与 `T18` 并行，但别同时改 `world-projector.service.js` |
| `T18` | 可并行 | marker 优化相对独立 |
| `T19` | 可并行 | 基准工具和门禁适合并行铺设 |
| `T20` | 不要并行 | 属于架构边界重整 |

### D 组：client / shared / 策略

| 任务 | 并行关系 | 说明 |
| --- | --- | --- |
| `T21` | 可并行 | client 网络表面收口相对独立 |
| `T22` | 可并行但要避开同一写集 | 可与 `T23` 分头，但别同时改同一 shared 文件 |
| `T23` | 可并行 | 更偏检查与治理 |
| `T24` | 可并行 | 策略定稿为主 |
| `T25` | 可并行但要避开同一写集 | 可与 `T11/T12` 协同，但别同时改同一 runbook/testing |

## 十四、适合多 agent 的安全切法

如果后面要安全多 agent 并行，建议只按下面这些切：

- Agent A
  - `T11`
  - `T12`
  - `T25`
  - 只碰文档、wrapper、testing/runbook
- Agent B
  - `T09`
  - `T14`
  - 只碰 proof 脚本与 workflow，且不做 destructive 实跑
- Agent C
  - `T19`
  - `T23`
  - 只碰基准和检查工具
- Agent D
  - `T21`
  - `T22`
  - 只碰 `client-next / shared-next`
- 主线程
  - `T01`
  - `T03`
  - `T05`
  - `T07`
  - 这 4 个硬阻塞必须由主线程单线推进

## 十五、本轮实改与验证（2026-04-10 21:41~21:42）

### 15.1 实际代码改动

- 文件：`packages/server/src/tools/next-auth-bootstrap-smoke.js`
- 改动：扩展 `verifyNextSocketRejectsLegacyEventContract`，由“2 个 legacy 事件拒绝证明”升级为“5 个事件批量拒绝证明”：
  - `c:ping`
  - `c:requestSuggestions`
  - `c:requestMailSummary`
  - `c:requestMarket`
  - `c:requestMarketTradeHistory`
- 保留并继续验证 `n:c:ping -> n:s:pong` 正常链路，确保“拒绝 legacy”不会破坏 next 正常协议。

### 15.2 回归结果

- 通过：`pnpm --filter @mud/server-next compile`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth`
- 关键证明输出（`next-auth-bootstrap`）：
  - `nextProtocolRejectsLegacyEventContract.rejectedEvents` 包含 5 个 legacy 事件，全部返回 `LEGACY_EVENT_ON_NEXT_PROTOCOL`
  - `nextProtocolRejectsLegacyEventContract.nextPongCount = 1`
  - `nextProtocolRejectsLegacyEventContract.legacyEvents = []`

### 15.3 对剩余任务的影响

- 本轮进一步收紧了 `T05/T06` 的“协议入口收口证明链”，降低回退风险。
- 主阻塞任务仍是：`T01/T03/T05/T07`（真源替换主链），数量不变，仍需主线程继续实改。

## 十六、本轮实改与验证（2026-04-10 21:45~21:46）

### 16.1 实际代码改动

- 文件：`packages/server/src/tools/next-auth-bootstrap-smoke.js`
- 改动：继续扩展 `verifyNextSocketRejectsLegacyEventContract`，把拒绝证明从“少量读请求”升级为“读 + 写 + 交易 + 邮件 + 建议 + 商店”的批量覆盖。
- 本轮新增覆盖事件包括：
  - 邮件链：`c:requestMailPage`、`c:requestMailDetail`、`c:markMailRead`、`c:claimMailAttachments`、`c:deleteMail`
  - 建议链：`c:createSuggestion`、`c:voteSuggestion`、`c:replySuggestion`、`c:markSuggestionRepliesRead`、`c:gmMarkSuggestionCompleted`、`c:gmRemoveSuggestion`
  - 市场链：`c:requestMarketItemBook`、`c:createMarketSellOrder`、`c:createMarketBuyOrder`、`c:buyMarketItem`、`c:sellMarketItem`、`c:cancelMarketOrder`、`c:claimMarketStorage`
  - 物品/养成/NPC：`c:useItem`、`c:dropItem`、`c:equip`、`c:unequip`、`c:cultivate`、`c:requestNpcShop`、`c:buyNpcShopItem`
  - 以及 `c:redeemCodes`
- 合并后该 contract 已可在 next socket 上一次性证明 30+ 个 legacy 业务事件都会被 `LEGACY_EVENT_ON_NEXT_PROTOCOL` 拒绝。

### 16.2 回归结果

- 通过：`pnpm --filter @mud/server-next compile`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth`
- 关键证明输出（`next-auth-bootstrap`）：
  - `nextProtocolRejectsLegacyEventContract.rejectedEvents` 已包含新增业务事件，全部返回 `LEGACY_EVENT_ON_NEXT_PROTOCOL`
  - `nextProtocolRejectsLegacyEventContract.nextPongCount = 1`
  - `nextProtocolRejectsLegacyEventContract.legacyEvents = []`

### 16.3 对剩余任务的影响

- `T05/T06`（协议入口收口 + 合约防回退）继续收敛，且防回退覆盖面显著扩大。
- 主阻塞任务数量仍为 4：`T01/T03/T05/T07`。

## 十七、本轮实改与验证（2026-04-10 21:55~21:58）

### 17.1 实际代码改动

- 文件：`packages/server/src/network/world-player-auth.service.js`
- 改动：新增 next-token-runtime 严格开关
  - 新增环境开关读取：`SERVER_NEXT_AUTH_BLOCK_TOKEN_RUNTIME_ON_NEXT_PROTOCOL` / `NEXT_AUTH_BLOCK_TOKEN_RUNTIME_ON_NEXT_PROTOCOL`
  - `allowTokenRuntimeIdentity` 调整为“默认兼容、开关开启后 next 协议禁用 token_runtime”
- 文件：`packages/server/src/network/world.gateway.js`
- 改动：next 身份白名单与上面开关联动
  - 默认保持现网兼容（next 可继续接纳 `token_runtime`）
  - 开关开启后，next 仅允许 `next/token`，并拒绝 `token_runtime`
- 文件：`packages/server/src/tools/next-auth-bootstrap-smoke.js`
- 改动：补充“开关前后行为”防回退证明（写入 `legacyBackfillFallbackContract`）
  - 默认：`next + token_runtime` 仍可通过（兼容口径）
  - 开关开启：`next + token_runtime` 必须被拒绝（真源收口口径）

### 17.2 回归结果

- 通过：`pnpm --filter @mud/server-next compile`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-mainline --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap-migration --require-legacy-auth`
- 通过：`pnpm --filter @mud/server-next exec node dist/tools/smoke-suite.js --case next-auth-bootstrap --require-legacy-auth`
- 关键新增证明输出（`legacyBackfillFallbackContract`）：
  - `tokenRuntimeNextProtocolIdentityDefaultSource = token_runtime`
  - `tokenRuntimeNextProtocolIdentityStrictSource = null`

### 17.3 对剩余任务的影响

- `T01/T03` 已新增“可灰度开启”的真源收口闸门，后续可先在 shadow/acceptance 环境打开，避免一次性硬切风险。
- `T05` 防回退证明链增强（不仅证明现状，还证明“开关开启后的目标行为”）。
- 主阻塞任务数量仍为 4：`T01/T03/T05/T07`（数量未变，但 `T01/T03` 的实施风险下降）。

## 十八、全量扫描汇总（2026-04-11）

这一次不是再看单个 smoke 或单个 boundary，而是按：

- 文档账本
- `server-next auth/bootstrap/session`
- `snapshot/player-source/persistence`
- GM/admin/restore/proof
- `client-next`
- `shared-next / sync / projector / perf`

做了一轮完整扫描。

先把总判断写死：

- 当前剩余项不是“零散小尾巴”，而是 `T01-T25` 这 `25` 项明确任务
- 如果只看旧前台玩家主链，当前大约还差 `20% - 30%`
- 如果看“完整替换游戏整体”，当前大约还差 `35% - 40%`
- `direct legacy/perf inventory = 0` 只说明边界压薄很多，不说明 auth/bootstrap/session 已经 next-native

### 18.1 剩余任务总表

按当前统一口径，剩余任务仍完整保留为：

- `P0` 真源主线：`T01-T08`
- `P1` 证明链与运营面：`T09-T14`
- `P1` 最小包体 / 性能 / 扩展：`T15-T20`
- `P1` client / shared / 稳定性：`T21-T23`
- `P2` compat 策略与完成门禁：`T24-T25`

也就是说，这轮扫描没有发现“可以把哪一整组任务删掉”的新证据；变化主要是对每组剩余项的代码级定位更明确了。

### 18.2 当前最大的真实阻塞

当前最关键的阻塞仍然只有三大块：

1. `authenticated identity -> snapshot -> bootstrap -> session` 真源主链还没完全收成 next-native
2. GM/admin/restore 的 proof 虽然已经很多，但真实环境补证、长期策略和门禁边界还没彻底定稿
3. 首包 / `WorldProjector` / `WorldSync` / `shared-next` 这组性能与稳定性尾项还没收完

换句话说：

- 现在不是“还缺更多 boundary 清理”
- 而是“proof 基本齐了，但真源替换、运营面定稿和性能目标还没完成”

### 18.3 代码级最实锤的未完成锚点

#### A. auth / bootstrap / snapshot / session

- [packages/server/src/network/world-player-auth.service.js](../packages/server/src/network/world-player-auth.service.js)
  仍保留 `resolveMigrationIdentity`、`loadMigrationSnapshot`、`shouldPreferCompatBackfill`、`authenticateViaCompatMigration`，说明 identity 主链仍有 migration/backfill 语义
- [packages/server/src/network/world-player-snapshot.service.js](../packages/server/src/network/world-player-snapshot.service.js)
  仍保留 `ensureCompatBackfillSnapshot` 与 migration snapshot 装载，说明 snapshot 还处于“next 持久化 + compat 迁移工具”过渡态
- [packages/server/src/network/world-player-source.service.js](../packages/server/src/network/world-player-source.service.js)
  现在只是把 compat source 改名为 migration source，不是已经 next-native
- `packages/server/src/network/world-legacy-player-source.service.js`
  仍真实读取 legacy `users/players` 与 legacy HTTP fallback
- [packages/server/src/network/world.gateway.js](../packages/server/src/network/world.gateway.js)
  `connect_token` 已基本单线化，但 guest / authenticated / GM 仍没完全拆成最终独立 contract
- [packages/server/src/network/world-session.service.js](../packages/server/src/network/world-session.service.js)
  仍是单进程内存 binding；`sessionId` 仍是进程内生成，不具备跨重启/跨进程真源语义

#### B. GM / admin / restore / proof

- [packages/server/src/network/world-gm-auth.service.js](../packages/server/src/network/world-gm-auth.service.js)
  GM token 校验外提了，但底层仍复用 legacy GM HTTP auth 真源
- [packages/server/src/tools/gm-database-backup-persistence-smoke.js](../packages/server/src/tools/gm-database-backup-persistence-smoke.js)
  仓库内 proof 已具备，但真实 DB 环境还没正式取证
- [packages/server/src/tools/shadow-gm-database-proof.js](../packages/server/src/tools/shadow-gm-database-proof.js)
  destructive shadow proof 入口已具备，但维护窗口实跑记录仍缺
- [docs/server-next-operations.md](./server-next-operations.md)
  `local / acceptance / full / shadow-destructive` 已写成四层，但自动化门禁与人工回归边界还没彻底制度化

#### C. sync / projector / first-package / perf

- [packages/server/src/network/world-sync.service.js](../packages/server/src/network/world-sync.service.js)
  仍同时承载 next 初始化、next delta、legacy sync 分流、minimap marker、realm、loot window 等多种职责
- [packages/server/src/network/world-projector.service.js](../packages/server/src/network/world-projector.service.js)
  仍是 `capture* + combine + diff*` 的整量建模思路，不是稳定 slices 驱动
- [packages/server/src/tools/bench-first-package.js](../packages/server/src/tools/bench-first-package.js)
  目前只能测 `InitSession / Bootstrap / MapStatic` 首包，不足以构成 replace-ready 级性能门禁
- [packages/server/src/tools/bench-sync.js](../packages/server/src/tools/bench-sync.js)
  已有投影基准骨架，但仍偏局部 micro-bench，不是完整高负载门禁

#### D. client-next / shared-next

- [packages/client/src/network/socket.ts](../packages/client/src/network/socket.ts)
  线上事件面基本 next-native，但仍保留 `onMapStaticSync`、`onRealmUpdate` 这类 alias 表面
- [packages/client/src/ui/auth-api.ts](../packages/client/src/ui/auth-api.ts)
  登录、注册、刷新、改密码、改显示名、改角色名仍依赖 legacy `/auth/*` 与 `/account/*`
- [packages/client/src/main.ts](../packages/client/src/main.ts)
  仍大量把 next panel 数据适配回旧命名 `S2C_*` 结构再喂 UI
- [packages/client/src/ui/panels/attr-panel.ts](../packages/client/src/ui/panels/attr-panel.ts)
  仍有“灵根信息尚未同步”“灵脉信息尚未同步”“特殊属性尚未同步”等明确占位
- [packages/shared/src/protocol.ts](../packages/shared/src/protocol.ts)
  类型基础已经成型，但新增字段时仍主要靠人工补齐 clone/reset/projection 一致性

### 18.4 这轮扫描对各任务组的结论

#### 对 `T01-T08`

- 文档判断成立：这是当前第一阻塞
- 其中最核心的四项仍是：`T01 / T03 / T05 / T07`
- 当前 proof 很强，但主要证明的是“边界被收紧”，不是“migration/compat 已退出架构主线”

#### 对 `T09-T14`

- `T09 / T10` 更像“真实环境补证没做完”，不是仓库命令缺失
- `T11 / T12 / T13 / T14` 仍有门禁、长期策略、workflow 和维护窗口边界没完全写死

#### 对 `T15-T20`

- 首包重复和 `WorldProjector` 的整量 diff 仍是最明确的性能尾项
- minimap marker、panel/attr bonus、基准门禁都还没形成长期稳定方案

#### 对 `T21-T23`

- `client-next` 玩家 socket 主链已经很接近 next-native
- 但账号链、GM/admin 前台和面板数据适配层还没彻底摆脱 compat 结构
- `shared-next` 当前更像“稳定性风险源”，不是主链第一阻塞，但也还没到可完全放心长期承载的程度

#### 对 `T24-T25`

- legacy 最终保留策略仍不能提前拍板
- “完整替换完成”的判定标准也还没全部门禁化
- 这就是为什么当前还不能直接删掉仓库里的 `legacy/compat`

### 18.5 批次建议保持不变

这轮全量扫描后，最稳的执行顺序仍然不变：

1. 先做 `T09 / T10 / T11`，先把“能不能证明接班”收口
2. 再主线程单线推进 `T01 / T03 / T05 / T07`
3. 然后做 `T15 / T16 / T19 / T22`
4. 最后再定 `T13 / T24 / T25`

也就是说，这轮扫描没有把优先级推翻，而是把它进一步坐实了。
