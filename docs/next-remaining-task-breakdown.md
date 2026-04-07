# next 剩余任务详单

更新时间：2026-04-07

这份文档基于并行只读分析整理，目标不是重复“大方向”，而是把 `next` 现在真正还没做完的任务拆成可执行清单。

当前总判断：

- `server-next` 的 direct legacy/perf inventory 已清零，但这不等于底层真源已经 next-native
- 仓库内与 `shadow/backup-dir` 相关的 proof 入口已经补齐，剩的是在真实环境里执行
- 本轮已把 `T01/T03/T05` 从“纯分析阶段”推进到“主链部分收口”：token fallback 已从 authenticated identity 主链移除，authenticated snapshot 不再按 `persistedSource` 放开 compat fallback，带 token 的 next bootstrap 已在 gateway 侧收成 `connect_token` 单线 promise，`hello` 对 token 连接只等待/让路
- `T03/T04` 本轮又多了两条收口边界 proof：`compatIdentityBackfillSnapshotPreseed` 锁住了 compat identity backfill 成功后的 snapshot 前移链，`compatIdentityBackfillSnapshotSeedFailureRejected` 锁住了“identity backfill 成功但 snapshot preseed 首次失败时，当前必须直接拒绝而不是再靠 `legacy_backfill` runtime fallback rescue”
- 本轮也补了几项低风险并行收口：`T11` 文档门禁口径继续统一、`T19` 首包基准骨架落库、`T21` client-next 事件表面开始 next-native 命名化、`T22` shared-next realm 数值模板加了完整性守卫
- `next` 距离“完整替换游戏整体”仍保守约差 `40% - 45%`
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

## 一、P0 真源硬阻塞

### T01 移除 authenticated 链路里的 legacy identity fallback

- 当前状态：本轮已移除 authenticated 链路里的 `token fallback`，identity 主顺序现在是 `next -> compat`；但 next identity miss 后，authenticated 链路仍允许继续走 compat backfill。
- 为什么还没完成：这仍然意味着 authenticated 主链可以在“非 native next identity”下继续成功，只是 phantom token identity 已先收掉。
- 完成定义：authenticated next socket 入场只接受 next 真源 identity；compat identity 只允许出现在显式迁移/回填路径；token-only identity 不再能 seed 出正式 authenticated 主链。
- 风险：会直接打到所有还没完成 next identity 落库的旧账号。
- 并行性：`不可与其他 auth/bootstrap 真源改动并行混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-auth.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/persistence/player-identity-persistence.service.js`

### T02 把 `WorldPlayerSourceService` 从 legacy facade 变成 next-native source

- 当前状态：`WorldPlayerSourceService` 仍是 `WorldLegacyPlayerSourceService` 的薄壳；但本轮已把 `/auth/register|login|refresh` 这条 legacy HTTP 链补成“即使还没有玩家行，也会用 access token payload 先落一份 next identity（persistedSource=legacy_sync）”，从而减少 authenticated socket 对 compat backfill 的依赖。
- 为什么还没完成：虽然 next identity 的提前落库入口已经前移，但 socket authenticated 主链仍会在 next identity miss 时继续调用 compat source，`WorldPlayerSourceService` 本身也仍然只是 legacy facade。
- 完成定义：`WorldPlayerSourceService` 变成 next-native provider；legacy source 只在 backfill / import / repair 中使用。
- 风险：这是 identity 和 snapshot 的共同上游，切错会同时影响登录与 bootstrap。
- 并行性：`不建议与 T01/T03/T05 并行混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http/legacy-auth-http.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-source.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-legacy-player-source.service.js`

### T03 移除 authenticated snapshot 的 legacy fallback

- 当前状态：本轮已进一步收紧为“compat snapshot fallback 只剩 no-persistence 的 `legacy_runtime`”；在 persistence-enabled authenticated 主链里，`legacy_backfill` 已不再参与 runtime fallback，`compat identity backfill` 一旦出现 snapshot preseed 失败或 identity save 失败，也都会在 identity gate 直接拒绝，不再继续放行。与此同时，`/auth/register|login|refresh` 成功后如果 legacy 库里已有玩家快照，仍会顺手把它预落成 next `legacy_seeded` snapshot；`next-auth-bootstrap` 现在已锁住三条边界 proof：compat identity backfill 成功后的 snapshot preseed 成功链、preseed 失败拒绝链、以及 identity save 失败拒绝链。
- 为什么还没完成：虽然 persistence-enabled authenticated 主链已经不再把 compat snapshot 当 runtime fallback 用，但 authenticated 主链仍不是 next snapshot 单真源，因为首次迁移仍允许通过 compat identity + preseed 把 snapshot 前移成 next `legacy_seeded`，而 no-persistence 场景下 `legacy_runtime` 仍保留。
- 完成定义：authenticated player 只读取 next snapshot；compat snapshot 只作为一次性 seed / 迁移工具，不再参与 runtime 入场。
- 风险：会影响所有仍停留在 `legacy_seeded / legacy_runtime` 语义上的玩家。
- 并行性：`不建议与 T01/T02/T05 并行混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session-bootstrap.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-snapshot.service.js`

### T04 把 snapshot 真源从“proof 完整”推进到“主链 next-native”

- 当前状态：`next-auth-bootstrap` 已经补了大量负向与正向 proof；并且随着 legacy HTTP 登录后开始预落 next `legacy_seeded` snapshot，顺序 proof 已允许“第一次直接命中 next，但 `persistedSource=legacy_seeded`”这类前移后的第一跳。现在 proof 还进一步固定了三条边界：`compatIdentityBackfillSnapshotPreseed` 证明 compat identity backfill 成功后能直接把 snapshot 前移成 next；`compatIdentityBackfillSnapshotSeedFailureRejected` 证明即使 identity backfill 已成功，只要 snapshot preseed 失败，authenticated 主链也不会再靠 runtime fallback 救活；`compatBackfillSaveFailure` 则证明 identity save 失败也已经前移到 identity gate 直接拒绝。
- 为什么还没完成：当前仍是“已经把 persistence-enabled authenticated runtime fallback 基本收掉，并能证明什么时候 preseed 成功/失败、save 成功/失败”，不是“所有 authenticated 主链都只读 native next snapshot”；`legacy_seeded` 仍是迁移态，no-persistence 场景下 `legacy_runtime` 仍保留。
- 完成定义：next snapshot 成为唯一 runtime snapshot 真源；proof 从“第一次 compat seed 或 next(legacy_seeded)、第二次 next(native)”过渡到“authenticated 主链只接受 native next snapshot”。
- 风险：需要先处理旧玩家 snapshot 迁移，否则大面积登录失败。
- 并行性：`可与 proof/观测增强并行，不可与主链重写并行混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools/next-auth-bootstrap-smoke.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-snapshot.service.js`

### T05 把 connect-time token bootstrap compat 语义收成单线

- 当前状态：本轮已把带 token 的 next bootstrap 收成 gateway 内的单次 promise；`hello` 对 token 连接只等待/让路，不再自行启动 `hello_token` bootstrap。无库 `next-auth-bootstrap` smoke 已验证 `helloAfterBootstrap.duplicateInitSession/Bootstrap/MapEnter = 0`，且 trace 里的 `bootstrapEntryPath` 已固定为 `connect_token`。
- 为什么还没完成：guest `hello`、GM socket、requestedSessionId contract 仍与 `T06/T07` 耦合，代码结构上还没彻底拆成最终形态。
- 完成定义：`connect_token`、`hello_token`、guest `hello`、GM bootstrap 的边界被写死；next 协议 bootstrap 只剩单一真源入口。
- 风险：会打到现有客户端和 smoke 的握手时序。
- 并行性：`不建议与 T01/T03/T06 并行混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world.gateway.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools/next-auth-bootstrap-smoke.js`

### T06 把 guest / authenticated / GM bootstrap 规则完全拆开

- 当前状态：guest `requestedPlayerId` fallback 已删，本轮 `handleHello()` 也继续收成 guest-only 入口，带 token 的连接直接让路给 `connect_token` bootstrap，guest detached resume 则走单独 helper。
- 为什么还没完成：GM socket 与 authenticated socket 的最终 contract 还没有完全拆成独立入口，错误码和长期维护边界也还没定成最终形态。
- 完成定义：guest、authenticated、GM 三类握手的 requestedSessionId / identity / snapshot / error code contract 明确独立。
- 风险：重构时容易把已经收口的 guest canonical 语义写回退。
- 并行性：`可先做只读 contract 文档；代码改动不建议并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world.gateway.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session.service.js`

### T07 明确 session 真源与稳定性边界

- 当前状态：`WorldSessionService` 仍是单进程内存 binding，`sessionId` 也是进程内生成；但现在 detached session 已有显式 `expireAt` 生命周期与 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS`，`smoke:session` 也已经锁住 guest forged sid/pid 与过期 sid 不得复用旧人的语义。
  - 过期生命周期默认 `15000ms`，但会在进程启动时通过 `SERVER_NEXT_SESSION_DETACH_EXPIRE_MS` 覆盖；`WorldSessionService` 会基于这个值安排 `expireAt` / `purge`，从而保证客人断线后仍可在规定时窗内 resume。
- `pnpm --filter @mud/server-next smoke:session` 当前不仅验证了客人 resume 的 canonical 感知，还专门显式覆盖过期 resume 的 proof：过期的 detached `sid` 必须返回新的 `sid/pid`，且不得恢复旧人。
- 本轮在与 `smoke:session` 同一链路里也拿下了 `authenticatedSessionProof`（并发 replace / detached resume / expired sid rotate 全数在预期内）与 `sessionReaperProof`（成功与重试两条路径实跑通过），为 session 并发替换与 reaper 清理行为再补了一道高频证据。
- 为什么还没完成：单服单实例下行为边界已经更清晰，但“是否接受单进程 session 真源作为最终答案”以及跨重启/跨进程语义还没有正式定稿。
- 完成定义：明确 session 是否永久采用单进程真源；如果不是，就要补跨重启 / 跨进程策略；`sessionId` 生命周期、detach/expire/purge 规则形成正式设计。
- 风险：会影响 kick、重连、断线恢复、GM restore 清会话。
- 并行性：`可先做设计与证明，不建议直接并行重写`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session-bootstrap.service.js`

### T08 把 auth trace 从“完成定义依赖项”降为“可选观测”

- 当前状态：trace 已很完整，proof 也越来越依赖 trace 才能解释来源。
- 为什么还没完成：trace 解决了“看见发生了什么”，但没有替代“主链结构已经 next-native”。
- 完成定义：trace 继续保留给调试和验收；但完成定义建立在真源结构上，而不是“trace 看起来正确”。
- 风险：过早削弱 trace 会丢失真源替换期的排障抓手。
- 并行性：`可安全并行做观测整理，不能拿它替代真源替换`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-token.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools/next-auth-bootstrap-smoke.js`

## 二、P1 证明链与运营面闭环

### T09 在真实 DB 环境实跑 `gm-database-backup-persistence`

- 当前状态：仓库内命令已补齐，但当前环境还没做带真实 DB 的正式取证。
- 为什么还没完成：现在只能说“proof 命令已存在”，不能说“backup dir 持久化已在真实环境闭环”。
- 完成定义：在真实 DB 环境跑通 `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`，并把结果回写文档。
- 风险：可能暴露 backup dir、恢复后状态读取、持久化元数据的新问题。
- 并行性：`可与 shadow destructive proof 分开并行准备`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools/gm-database-backup-persistence-smoke.js`
  - `/home/yuohira/mud-mmo/packages/server-next/TESTING.md`

### T10 在 shadow 维护窗口实跑 destructive 数据库 proof

- 当前状态：命令与安全门已补齐，但还没在真实 shadow 维护窗口取证。
- 为什么还没完成：当前不能把“仓库里有 `verify:replace-ready:shadow:destructive`”当作“shadow destructive proof 已闭环”。
- 完成定义：在维护窗口下跑通 `pnpm verify:replace-ready:shadow:destructive`，并确认 backup / download / restore / checkpoint metadata 全绿。
- 风险：是 destructive 操作，必须串行执行，且会碰到真实 shadow runtime。
- 并行性：`不可与其他 destructive 操作并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools/shadow-gm-database-proof.js`
  - `/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md`

### T11 把 `local / acceptance / full / shadow-destructive` 四层门禁口径彻底写死

- 当前状态：本轮 README、TESTING、RUNBOOK 已继续统一这四层口径，并补齐 `full` 与 `shadow-destructive` 的依赖、组合顺序和维护窗口提示；剩下主要是 workflow / wrapper 级零星核对，而不是主文档空白。
- 为什么还没完成：现在的主文档误读空间已经缩小，但还没到“所有 wrapper/workflow/别名输出都完全一致”的程度。
- 完成定义：README、TESTING、RUNBOOK、workflow、wrapper 对 `local / acceptance / full / shadow-destructive` 的回答问题完全一致。
- 风险：如果口径不稳，后面真源替换每做一步都会被误判完成度。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/README.md`
  - `/home/yuohira/mud-mmo/packages/server-next/TESTING.md`
  - `/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md`
  - `/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml`

### T12 把 GM/admin/restore 自动化边界与人工回归边界正式分层

- 当前状态：`gm-compat`、`gm-database-smoke`、`shadow` 只读链、`shadow destructive` 都已补齐，自动 proof 分层已经基本成型，仓库里可以直接看出 `with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat` 这条 proof 链路，文档在说明哪些属于自动化，哪些仍要靠人工演练。
- 为什么还没完成：虽然 automation proof pipeline 的入口都在 README/TESTING/RUNBOOK 里写了，但缺乏真实 shadow/GM 环境复跑与制度化闭环，运营还不能把“命令存在" 直接当作“自动化已经完成”的取证。
- 完成定义：在实物 shadow/GM 上复跑上述自动链路、记录结果，并把自动 proof 与人工维护的边界、gate、回退、维护窗口规程写死在 RUNBOOK/TESTING/SOP，确保每次替换可以按流程复核。
- 风险：运营仍仰赖 legacy 能力，若边界文档和实际执行脱节，会让替换看起来“已完成”却没真正落地。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/TESTING.md`
  - `/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md`

### T13 决定 GM/admin/restore 真源是否 next 化，还是长期保留 compat 壳

- 当前状态：自动 proof 入口在补齐，但运营真源本身仍主要复用 legacy HTTP/GM/admin 能力。
- 为什么还没完成：现在还没有最终决定“只证明可用”还是“也要把后台真源整体 next 化”。
- 完成定义：给出明确策略：长期保留 compat 壳，或继续推进后台真源 next 化；并写清迁移顺序。
- 风险：这是产品与运维策略问题，不是纯工程清理。
- 并行性：`可先文档化决策，不必立刻改代码`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy/http`
  - `/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md`

### T14 把 deploy workflow 升级到“可选 shadow destructive 补证”

- 当前状态：本轮 `Deploy Server Next` workflow 已新增显式 `run-destructive-proof` 输入，默认关闭；只有手动开启时，才会在 shadow 验证后带 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1` 跑 `pnpm verify:replace-ready:shadow:destructive`。
- 为什么还没完成：workflow 入口已经具备受控补证能力，但真实维护窗口的 secret / 操作手册 / 实际执行记录还没补齐。
- 完成定义：workflow 支持受控、显式 gated 的 maintenance-window destructive proof，且默认不误触发。
- 风险：一旦接错，会把 destructive 操作混进日常 deploy。
- 并行性：`可安全并行设计，接线时需谨慎`
- 相关文件：
  - `/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml`
  - `/home/yuohira/mud-mmo/scripts/replace-ready-shadow-destructive.js`

## 三、P1 最小包体 / 性能 / 扩展边界

### T15 继续压薄 `Bootstrap + MapStatic + PanelDelta` 首包重复

- 当前状态：steady-state `WorldDelta` 不是最突出的痛点，首包重复更明显。
- 为什么还没完成：`Bootstrap.self`、`MapStatic`、`PanelDelta` 之间仍有重复字段和重复分层。
- 完成定义：首包结构进一步瘦身；静态、低频和面板初始化字段边界明确；文档化“什么放哪一层”。
- 风险：改动会同时触达 server 投影、shared 类型和 client 初始化逻辑。
- 并行性：`可与纯后端性能分析并行，不能与大规模 protocol 改写混改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js`
  - `/home/yuohira/mud-mmo/packages/shared-next/src/protocol.ts`

### T16 把 `WorldProjector` 从整量 capture/clone + diff 再往下拆

- 当前状态：`world-projector.service.js` 仍明显依赖 `captureWorldState / capturePlayerState / combineProjectorState / diff*` 的整量建模。
- 为什么还没完成：虽然 direct legacy helper 已经清理，但 projector 仍偏“全量快照 + 差量比较”。
- 完成定义：高频链路尽量由局部 patch、revision 驱动和切片投影组成，减少整量 capture/clone。
- 风险：这里是高频核心，容易引入同步错误。
- 并行性：`只适合做低风险切缝或基准分析，不适合并行大改`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js`

### T17 降低 `panel/attr bonus` 的每 tick CPU 成本

- 当前状态：`buildAttrBonuses`、面板差量和多组 clone/diff 仍在高频链路里反复运行。
- 为什么还没完成：当前面板与属性投影仍偏“每次重算 + 深克隆 + diff”。
- 完成定义：attr bonus 与 panel diff 具备更明确的 invalidation / cache / revision 机制。
- 风险：容易影响属性、装备、buff、功法、动作面板的一致性。
- 并行性：`可和首包瘦身分析并行；代码改动建议单线`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js`

### T18 降低 minimap marker 的构建、过滤、排序成本

- 当前状态：`buildMinimapMarkers`、`buildVisibleMinimapMarkers`、`diffVisibleMinimapMarkers` 仍在 tick 链路里做集合过滤与排序。
- 为什么还没完成：当前 minimap 可见标记仍有每 tick 额外 CPU。
- 完成定义：标记构建与可见计算具备更强缓存、地图级预处理或事件驱动刷新。
- 风险：会影响地图 UI、一致性与视野逻辑。
- 并行性：`可安全并行分析，代码改动建议单线`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js`

### T19 建立高负载性能门禁与基准

- 当前状态：本轮已补进 `bench:first-package` 骨架，可直接测 `InitSession / Bootstrap / MapStatic` 的首包耗时与包体；但 tick、AOI、投影、panel 热路径仍没有正式基准。
- 为什么还没完成：现在只补了首包基准入口，没有形成 replace-ready 级的完整性能门禁矩阵。
- 完成定义：至少有首包、tick、同步投影、AOI 相关的基准与门禁数据。
- 风险：没有基准就容易在后续扩展中无感回退。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/package.json`
  - `/home/yuohira/mud-mmo/packages/server-next/src/tools`

### T20 把扩展新系统时默认往巨型 `PlayerState / sync/projector` 堆字段的趋势压住

- 当前状态：虽然 direct boundary 已清零，但 `WorldProjectorService / WorldSyncService` 仍是中心耦合点。
- 为什么还没完成：新增系统仍很容易继续往巨型状态结构和中心化投影里堆字段。
- 完成定义：扩展路径被切成稳定 slices；新系统默认不需要改一个巨型 `PlayerState` 和中心化 projector 才能接入。
- 风险：这是“极高扩展度”目标的关键，否则替换后仍会继续膨胀。
- 并行性：`可先做架构约束与切缝，代码主改动不宜并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js`
  - `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js`
  - `/home/yuohira/mud-mmo/packages/shared-next/src/protocol.ts`

## 四、P1 client-next / shared-next / 稳定性

### T21 把 `client-next` 的事件表面完全 next-native 命名化

- 当前状态：本轮 `socket.ts` 已把 `MapStatic / Realm` 的 next-native 回调数组与 `onMapStatic / onRealm` helper 补出来，旧 `onMapStaticSync / onRealmUpdate` 还保留为兼容 alias。
- 为什么还没完成：运行时事件表面已经开始 next-native 化，但调用方仍可能继续走旧 alias，API 表面还没有完全去 legacy 命名。
- 完成定义：client-next 的事件、回调和状态接口表面完全与 next 协议命名一致。
- 风险：会影响多个 UI 模块的订阅和初始化调用。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/client-next/src/network/socket.ts`

### T22 稳定 `shared-next` 的数值、realm、bootstrap/panel/delta 类型基线

- 当前状态：`NumericStats.extraRange / extraArea` 的 helper 补齐后，本轮又在 realm 模板侧加了 `ensureNumericStatsTemplateStats` 守卫，并已通过 `pnpm --filter @mud/shared-next build`；但 shared 字段新增时的全链路一致性仍主要靠人工和编译兜底。
- 为什么还没完成：虽然 realm 数值模板现在有了更硬的结构守卫，但 shared 层还没有把“新增字段必须补初始化 / clone / reset / merge / value / projection”彻底变成统一门禁。
- 完成定义：数值体系、realm 常量、bootstrap/panel/delta shared 类型形成稳定一致的更新约束。
- 风险：shared 出问题会先把整个 workspace 验证链打爆。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/shared-next/src/numeric.ts`
  - `/home/yuohira/mud-mmo/packages/shared-next/src/constants/gameplay/realm.ts`
  - `/home/yuohira/mud-mmo/packages/shared-next/src/protocol.ts`
  - `/home/yuohira/mud-mmo/packages/shared-next/src/value.ts`

### T23 为 shared 字段新增补全“初始化 / 克隆 / 重置 / 序列化 / 投影”一致性检查

- 当前状态：本轮已新增 `packages/shared-next/scripts/check-numeric-stats.cjs` 和 `pnpm --filter @mud/shared-next check:numeric-stats`，会校验 `NUMERIC_STATS_KEYS`、`createNumericStats`、`cloneNumericStats` 以及 value 映射键的覆盖关系，并已实跑通过。
- 为什么还没完成：现在只对 `NumericStats` 这条共享高风险结构建立了自动检查，`reset / addPartial / protobuf / protocol projection` 等更广的一致性面还没全部纳入。
- 完成定义：新增 shared 字段时，如果漏补配套 helper，会在脚本或测试层尽早失败。
- 风险：没有这个门禁，shared 层会反复成为 replace-ready 的非业务型阻塞。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/shared-next/scripts/check-numeric-stats.cjs`
  - `/home/yuohira/mud-mmo/packages/shared-next/src`
  - `/home/yuohira/mud-mmo/packages/shared/src`

## 五、P2 替换后 compat 策略

### T24 定稿 legacy HTTP / GM / socket compat 的最终保留策略

- 当前状态：当前策略是“先别硬删”，但还没定稿哪些长期保留、哪些降成迁移入口、哪些可以删除。
- 为什么还没完成：在 auth/bootstrap 真源没收完之前，过早定稿只会制造返工。
- 完成定义：明确 GM/admin/HTTP 是否保留为外层 compat 壳；legacy auth 是否仅保留为迁移入口；legacy socket 是否降到只读或最小兼容。
- 风险：会影响维护成本、替换心理预期和后续架构边界。
- 并行性：`可先做文档决策，不必立刻删代码`
- 相关文件：
  - `/home/yuohira/mud-mmo/packages/server-next/src/compat/legacy`
  - `/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md`

### T25 把“完整替换完成”的判定标准从文档口径变成实际门禁

- 当前状态：完成定义已经写在文档里，但还没有全部落成可执行门禁。
- 为什么还没完成：目前还是“有文档判定标准”，不是“每一项都有自动或半自动 gate”。
- 完成定义：完成标准里的关键项都有对应 smoke / workflow / 手工 runbook 条目，不再停留在文字口径。
- 风险：没有门禁化，后续很容易再次出现“感觉差不多可以替换”的口径漂移。
- 并行性：`可安全并行`
- 相关文件：
  - `/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md`
  - `/home/yuohira/mud-mmo/packages/server-next/TESTING.md`
  - `/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md`

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
| `T01` identity fallback 收口 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-auth.service.js` |
| `T02` player source next-native 化 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-source.service.js` |
| `T03` snapshot fallback 收口 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session-bootstrap.service.js` |
| `T04` snapshot 真源主链 next-native 化 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-snapshot.service.js` |
| `T05` bootstrap 单线入口 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world.gateway.js` |
| `T06` guest/authenticated/GM bootstrap 拆分 | 中 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world.gateway.js` |
| `T07` session 真源边界定稿 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-session.service.js` |
| `T08` trace 降级为可选观测 | 中 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-token.service.js` |

### 证明链 / 运营面看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T09` 真实 DB 跑 backup persistence proof | 高 | 中 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/tools/gm-database-backup-persistence-smoke.js` |
| `T10` shadow destructive proof 实跑 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/tools/shadow-gm-database-proof.js` |
| `T11` 四层门禁口径写死 | 中 | 低 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/TESTING.md` |
| `T12` 自动化与人工边界分层 | 中 | 低 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/REPLACE-RUNBOOK.md` |
| `T13` GM/admin/restore 真源策略定稿 | 中 | 中 | 适合 | `/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md` |
| `T14` deploy workflow 可选 destructive 补证 | 中 | 中 | 适合 | `/home/yuohira/mud-mmo/.github/workflows/deploy-server-next.yml` |

### 性能 / 包体 / 扩展看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T15` 首包重复瘦身 | 高 | 中 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js` |
| `T16` projector 从整量 capture/diff 再下拆 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js` |
| `T17` panel/attr bonus 热路径降载 | 中 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js` |
| `T18` minimap marker 热路径优化 | 中 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js` |
| `T19` 建立高负载基准与门禁 | 高 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/src/tools` |
| `T20` 压住巨型 PlayerState / sync/projector 继续膨胀 | 高 | 高 | 不适合 | `/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js` |

### client / shared 看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T21` client-next API 表面 next-native 命名化 | 中 | 低 | 适合 | `/home/yuohira/mud-mmo/packages/client-next/src/network/socket.ts` |
| `T22` shared-next 数值 / realm / bootstrap 类型基线稳定 | 高 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/shared-next/src/numeric.ts` |
| `T23` shared 一致性自动检查 | 高 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/shared-next/src` |

### compat 策略看板

| 任务 | 收益 | 风险 | subagent | 首改文件 |
| --- | --- | --- | --- | --- |
| `T24` legacy compat 最终保留策略 | 中 | 中 | 适合 | `/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md` |
| `T25` 把完成标准从文档变成真实门禁 | 高 | 中 | 适合 | `/home/yuohira/mud-mmo/packages/server-next/TESTING.md` |

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
