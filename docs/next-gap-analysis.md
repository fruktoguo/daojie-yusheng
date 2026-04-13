# next 现状缺口分析

更新时间：2026-04-13（当前轮次）

## 一句话结论

`next` 现在已经不再只是“新事件名包着旧链路”。

但这次把 `next` 推上仓库，当前更准确的定位仍然只是阶段性备份和继续协作，不是“已经可以投入生产”的信号。

如需看后续阶段、工作流拆分、完成定义与执行顺序，直接看 [docs/next-remaining-execution-plan.md](/home/yuohira/mud-mmo/docs/next-remaining-execution-plan.md)。

如需看一页摘要版工程账本，直接看 [docs/next-remaining-engineering-ledger.md](/home/yuohira/mud-mmo/docs/next-remaining-engineering-ledger.md)。

如需直接看详细任务、依赖关系与最近轮次进展，直接看 [docs/next-remaining-task-breakdown.md](/home/yuohira/mud-mmo/docs/next-remaining-task-breakdown.md)。

截至目前：

- `client-next` 的玩家主链已经基本切到 next-native
- `client-next` 的 socket 已不再监听任何 legacy 事件名
- `client-next` 的增量 UI/store 骨架已经形成，但 `T21` 的 alias 清理与部分面板的 patch-first 收口仍未完成
- `server-next` 的 `auth/token/bootstrap` 真源替换已经进入“主链部分收口”阶段，不再只是第一刀开工
- `server-next` 的 `snapshot/player-source` 顺序型证明已落地：带库 `next-auth-bootstrap` 已实跑通过“第一次 `legacy_seeded`、第二次 `next(native)`”
- `server-next` 的 `token/identity` 与 `snapshot/player-source` 异常数据护栏也继续收紧：带库场景下如果 next 持久化里已经存在非法 identity/snapshot 记录、compat `users/players` schema 缺失导致 snapshot fallback 不可判真伪，或 compat snapshot 行里的 `mapId` 本身为空，主链现在都会直接报错并记录 trace，不再把坏真源/坏 fallback/坏 placement 静默当成 miss 后继续跑
- 带库 `token_seed` 首登链也已真收掉一条 legacy 依赖：当完整 token claims 已有、但 compat snapshot 不存在时，主链当前会直接 seed next-native starter snapshot，不再因为“必须先有 legacy snapshot”而拒绝认证
- 带库 `compat backfill` 链这轮也已补上同类收口：当 compat identity 仍能解析、但 compat snapshot 已不存在时，主链当前也会直接 seed next-native starter snapshot，而不是继续卡死在 `legacy_preseed_blocked`
- 带库 `compat backfill` 旧链也已真收掉一条 legacy 依赖：当 compat identity 仍能解析、但 compat snapshot 不存在时，主链当前会直接 seed next-native starter snapshot，不再因为缺失 legacy players 行而卡在 `legacy_preseed_blocked`
- `/runtime/auth-trace` 的 `summary` 也已固定出一层稳定观测 schema：除 `typeCounts / sourceCounts` 外，现在还会给出 identity 持久化动作计数、bootstrap 的 `requestedSessionCount`，以及 `bootstrap.linkedSourceCounts / linkedPersistedSourceCounts`
- `protocol=next` 时，compat identity runtime 回退、`legacy_runtime -> compat snapshot` 运行态回退、以及带 token 的 `hello` 兜底 bootstrap 都已继续收紧
- legacy HTTP auth 与 next socket auth 当前已经共用同一套 next token codec；compat online backfill 入口也已继续收成 `migration-only`
- `shared-next` 的协议定义、protocol audit 与数值模板守卫已经形成基础护栏，但 `T22/T23` 仍未达到“新增字段自动全链路硬门禁”
- `local / acceptance / full / shadow-destructive` 四层门禁定义已统一，但 `acceptance/full` 仍未全部落成 workflow/job 级闭环
- 但 `server-next` 的登录、bootstrap、同步投影、HTTP/GM 与运行时真源仍大量依赖 legacy
- 当前统一工程口径已收成：剩余任务 `25` 项，距离“完整替换游戏整体”仍约差 `35% - 40%`

所以结论很明确：

- 可以继续按“前台 next 独立线”推进
- 还不能把整个仓库里的 `legacy` 一把删掉

## 当前可安全并行推进项

截至 `2026-04-13`，当前最适合继续并行推进、且不容易撞上高风险真源替换的，是下面四类：

1. 文档 / 验证链补强。
   包括把 `T11/T12/T25` 的门禁口径写死、同步最新 replace-ready 实测结果，以及把 `docs/next-legacy-boundary-audit.md` 的 inventory 口径固定成统一对外结论。
2. 后端低风险边界收口。
   包括 `replace-ready` 周边脚本、环境变量 alias、一层 compat facade 外提，以及不碰 auth/bootstrap 真源语义的协议 helper 整理。它们能继续压薄耦合，但不能夸大成完整替换已完成。
3. replace-ready 与 shadow / with-db / GM-admin 证明链补强。
   现在更大的缺口已经不再是 direct boundary inventory，而是把已跑绿的 `replace-ready`、`with-db`、`shadow` 与 GM/admin/restore 自动化证明固定成稳定门禁，并继续补 workflow/job 级闭环。
4. `client-next / shared-next` 的收口尾项。
   包括 `T21` 的 next-native 命名清理、面板 patch-first 收口，以及 `T22/T23` 的 shared 字段一致性检查继续硬化。它们不会直接替代真源主线，但能显著减少后续回退空间。

当前不建议拉进这轮“安全并行继续”的内容：

- `server-next` 认证 / token / legacy player source / bootstrap 真源替换主链
- 完整旧天机阁七榜迁移
- 为了协议对称性硬补一条当前前台没有真实入口的冗余链

具体判断：

- 属性详情：这一条当前已经继续收口。`PanelDelta.attr` 现已补齐 `bonuses / specialStats / boneAgeBaseYears / lifeElapsedTicks / lifespanYears / realmProgress / realmProgressToNext / realmBreakthroughReady` 这组低频字段，属性面板不再只靠 bootstrap 时的旧值残留；它仍不属于当前 `P0` 真源替换范围。
- 低频面板尾项：当前剩下更明显的缺口，已经不是“属性字段缺失导致面板不可用”，而是部分面板上下文仍分散在独立事件里，尚未统一成单一 panel-context slice。
  例如：`realm` 仍走独立事件、背包面板仍要额外拼 `Realm / MapStatic / PanelDelta.tech / PanelDelta.attr`、任务面板仍依赖外部 `inventory/mapId` 上下文、观察/实体详情仍是按需 snapshot 而非持续低频 patch。它们都不阻塞 `replace-ready`，但属于后续可继续收口的非 `P0` 文档项。
- 排行榜 / 天机阁：当前只适合进 `P1` 的“基础迁移”，不适合进 `P0`。如果目标是完整替换旧七榜，应继续暂缓，先补 next 玩家击杀/死亡统计真源。

### 当前安全并行矩阵

- 现在就能安全并行推进：
  - `server-next` 文档、replace-ready 脚本、协议审计与门禁口径收口
  - `replace-ready / with-db / shadow` 的门禁口径补强
  - `snapshot/player-source` 的准备层收口与最小带库证明链固化
  - `shared-next` 的协议/类型层稳定化
- 需要独立环境才能继续：
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:shadow`
  - `pnpm verify:replace-ready:acceptance`
- 当前应继续暂缓：
  - `snapshot/player-source` 与 `bootstrap/session` 真源替换
  - 完整 GM/admin/restore next 化
  - 完整旧七榜迁移

### 当前最值得继续改的文件锚点

如果现在要继续“实打实往前改”，最值得先盯的是下面这些文件：

- [packages/server-next/src/network/world-player-auth.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-player-auth.service.js)
  这里决定 `T01` 是否能把 next 协议 authenticated 入场彻底收成仅认 next identity
- [packages/server-next/src/network/world-session-bootstrap.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-session-bootstrap.service.js)
  这里决定 `T03/T05` 是否能把 snapshot runtime fallback 和 bootstrap 入口彻底收成单线
- [packages/server-next/src/network/world.gateway.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world.gateway.js)
  这里决定 `T05/T06` 的 guest / authenticated / GM 三类握手 contract 能不能真正拆开
- [packages/server-next/src/network/world-session.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-session.service.js)
  这里决定 `T07` 的 session 真源边界最后如何定稿
- [packages/server-next/src/network/world-projector.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-projector.service.js)
  这里是 `T16/T17/T20` 的核心热点，也是“最高性能 / 极高扩展度”最容易继续失血的地方
- [packages/server-next/src/network/world-sync.service.js](/home/yuohira/mud-mmo/packages/server-next/src/network/world-sync.service.js)
  这里是 `T15/T18/T19/T20` 的首包、minimap、AOI、同步门禁集中区
- [packages/shared-next/src/protocol.ts](/home/yuohira/mud-mmo/packages/shared-next/src/protocol.ts)
  这里是 `T15/T22/T23` 的 shared 类型和协议稳定性核心锚点

## 如果目标是“完整替换游戏整体”

### 当前判断

- 以下百分比按不同目标口径粗略估算，只用于定位优先级，不能横向相加，也不能当成统一验收线。
- 现在还不能判定 `next` 已经可以完整替换整个游戏整体。
- 如果只看“替换旧前台玩家主链”，当前约还差 `20% - 30%`。
- 如果看 `server-next` 自身独立化，当前约完成 `50% - 60%`。
- 如果按“完整替换游戏整体”这个最严格口径，当前更合理的综合判断是：
  - 约完成 `60%`
  - 约还差 `35% - 40%`

这里的关键区别必须说清：

- “旧前台玩家主链可切到 next” 不等于 “整个游戏已经可被 next 完整替换”
- 现在更接近前者，还明显没有达到后者

### 为什么整体替换还差这一段

1. `server-next` 的认证 / 会话 / bootstrap 仍继续依赖 legacy JWT、旧 `users/players` 表与 `loadLegacyPlayerSnapshot` 兼容装载。
   但当前已不是“完全没开始替换”状态，而是完成了 `token/identity` 第一刀，并开始把 snapshot provenance 收进 next 持久化层；剩余主块已收缩为 `snapshot/player-source` 与 `bootstrap/session`。
2. 正式替换的证明链仍没有完全闭环，但根级 `pnpm verify:replace-ready` 现已至少覆盖本地 `client-next build + verify:replace-ready + audit:server-next-protocol` 这条主证明链；`pnpm verify:server-next` 当前只保留为兼容别名，wrapper 会先打印 alias 委托关系再转入对应的 `replace-ready` 链。
3. `next-protocol-audit` 的负向门禁虽然已经补上并回绿，但它还没有和 `shadow` 实例实物验收组成完整 replace-ready 门禁。
   现在 `pnpm verify:replace-ready:acceptance` 已经提升成“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口，deploy workflow 也已在部署后补跑 `shadow + gm-compat`；当前未闭环的，已经不是“没有组合入口”或“没有带库门禁”，而是 `shadow/GM-admin` 仍不是所有链路里的统一默认门禁，且完整 GM/admin 人工回归仍缺统一自动证明。
4. `docs/next-legacy-boundary-audit.md` 当前已经把 `P0 auth/bootstrap 真源`、`P0 legacy HTTP/GM/admin`、`P1 world sync compat`、`P1 runtime/persistence compat` 与“目标差距: 性能/扩展”这五组 direct inventory 全部清到 `0`，但这不等于底层真源已替换完成。
5. 后台 GM / HTTP / admin / restore 的运营真源仍未 next 化；但 `shadow destructive` 与 `backup dir` 两条自动 proof 入口现已补齐，当前缺的是维护窗口与真实带库环境执行，不再是仓库内没有命令可跑。
6. `client-next` 虽然主链已基本 next-native，但前台侧也仍存在“够替换、但还不够极致”的扩展性和性能尾项。

### 当前最该先做的三批动作

这部分不再泛讲方向，只写现在最值得直接推进的三批：

1. 先做 `T11 / T12 / T25`。
   先把四层门禁、自动 proof / 人工回归边界、以及“完整替换完成”的 gate 映射写死，避免后面每推进一步都重新争口径。
2. 再主线程单线推进 `T01 / T03 / T05 / T06 / T07`。
   这是当前真正决定“为什么还不能叫完整替换”的主阻塞。
3. 然后并行推进 `T09 / T10 / T15 / T16 / T19 / T22 / T23`。
   这是当前最能把“最小包体 / 最高性能 / 稳定性 / shared 基线”从目标口号变成硬约束的一批。

### direct inventory 清零后，当前真正剩下的是什么

`docs/next-legacy-boundary-audit.md` 已经清到 `0/22`、`0`，所以现在不应该再把主要精力放在“再找一条 direct legacy 命中”上。更真实的剩余缺口已经变成：

1. replace-ready 三层门禁已经基本收敛，但默认/`acceptance`/`full` 的边界仍要继续写死。
   `acceptance` 现在已经覆盖“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”，`full` 也已继续抬高到“强制 with-db + gm-database + shadow + gm-compat”；当前真正缺的是把每一层自动化门禁与“完整 GM/admin/restore 运营面闭环”明确切开，而不是再要求默认入口必须等于最重链路。
2. `snapshot/player-source` 真源仍未真正收紧。
   带库 `next-auth-bootstrap` 已经实跑通过“第一次 `legacy_seeded`、第二次 `next(native)`”顺序证明，这说明 provenance 与顺序护栏已具备；但 legacy fallback 仍在默认主链里，不能据此说 snapshot 真源已 next-native。
   当前已额外收掉七类静默成功链，并补上一类 next 真源宽容归一边界：`legacy_seeded` 写入 next persistence 失败时会直接失败；如果 next 持久化里已经存在非法 snapshot 记录，会直接报错并打 `next_invalid` trace；如果 compat snapshot 查询因为 `users/players` schema 缺失而不可判定，会直接失败并记录 `legacy_source_error`；如果 compat snapshot 行里的 `mapId` 为空，也会直接失败并落到同一条 `legacy_source_error` 护栏，不再静默退回 compat、fresh-player 链或云来镇默认落点；如果 compat `unlockedMinimapIds` 非法，也会直接失败而不是静默压成当前图已解锁；如果带库 `token_seed` 首登缺失 compat snapshot，当前会直接 seed 一份 next-native starter snapshot，而不是继续卡在 legacy preseed；如果带库 `compat backfill` 缺失 compat snapshot，当前也会直接 seed 一份 next-native starter snapshot，而不是继续卡在 `legacy_preseed_blocked`；如果 next snapshot 主体有效、只是 `unlockedMapIds` 扩展字段脏掉，则当前会继续 bootstrap，并在运行时读取时归一成空数组，而不是误判成 `next_invalid`。
3. `bootstrap/session` 真源仍未真正脱 legacy。
   顺序型 smoke 已经把开工前置补齐，但 `WorldGateway / WorldSessionBootstrapService` 一带的主流程还没有进入单线收口。
   这一轮已新补一层 continuity 硬证明：`legacy_runtime` 下，即使 authenticated reconnect 显式携带旧 `sessionId`，`next-auth-bootstrap` smoke 也必须输出 `explicitRequestedResumed=null`、`expectedExplicitRequestedResume=false`，不再靠人工从 sid 旋转结果里间接推断。
4. GM/admin/restore 的完整自动化证明仍不足。
   现在已有最小 compat smoke 和带库 `backup/restore` 回归，但还不是完整运营链路的统一日常门禁。
5. `shared-next` 自身稳定性仍然要继续盯。
   上一轮这里曾因为 `packages/shared-next/src/constants/gameplay/realm.ts` 与 `packages/shared-next/src/numeric.ts` 的 `NumericStats.extraRange / extraArea` 类型不一致，出现过标准链可能被共享层先拦住的风险；但本轮实际强跑 `pnpm --filter @mud/server-next verify:replace-ready` 已恢复可跑并通过，所以它现在更像“需要继续观察的共享层风险源”，而不是当前事实阻塞。
   保守看，这部分更像“证明链稳定性风险”，大约只占整体剩余缺口里的 `5% - 10%`，不是当前最大的结构性缺口。

### 本轮 replace-ready 实测

截至 `2026-04-06`，当前仓库里这轮需要分开看两层验证口径：

- 这轮除了最小验证外，也实际强跑了标准入口 `pnpm --filter @mud/server-next verify:replace-ready`，并已通过；这说明当前工作树里的 `server-next` 标准 replace-ready 主链是通的。
- 为了把 `server-next` 本体与 boundary inventory 单独压实，这轮也补跑了不依赖整条 workspace 门禁的最小验证：
  - `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json`
  - `node packages/server-next/dist/tools/audit/next-legacy-boundary-audit.js`
  - `node packages/server-next/dist/tools/smoke-suite.js --case session --case runtime --case next-auth-bootstrap --case legacy-player-compat --case monster-runtime --require-legacy-auth`
- 其中 boundary audit 最新结果已降到 `0 / 22` 个检查项、`0` 处代码证据；`P0 auth/bootstrap 真源`、`P0 legacy HTTP/GM/admin`、`P1 world sync compat`、`P1 runtime/persistence compat` 与“目标差距: 性能/扩展” inventory 已全部清零
- `pnpm --filter @mud/server-next smoke:next-auth-bootstrap` 这轮也已接入 replace-ready 主链，已覆盖 `protocol: next + legacy HTTP 登录 token` 的当前 compat 入场链，并显式断言 next socket 不混入 legacy `s:*` 事件；该 smoke 也锁定了当前真实语义：带 token 的 next 连接会在连接阶段直接 bootstrap，后续补发 `n:c:hello` 不会重复入场
- 显式开启 `NEXT_AUTH_TRACE_ENABLED=1` 后，`next-auth-bootstrap` smoke 当前还会输出 `snapshotPersistedSource`；无库时会明确返回 `snapshotSequence.supported=false`，而带库时则会把“第一次 `legacy_seeded`、第二次 `next` 且 persistedSource=native`”作为硬门禁，不再把“只打印顺序结果”误写成真源已替换完成
- 这轮还实际补跑了两条 `next-auth-bootstrap` 真源证明链：
  - 无库回归：`snapshotSource=miss`、`snapshotSequence.supported=false`
  - 带库顺序证明：第一次 `snapshotSource=legacy_seeded` / `snapshotPersistedSource=legacy_seeded`，第二次 `snapshotSource=next` / `snapshotPersistedSource=native`
- 为了把这条顺序证明从整条 `with-db` replace-ready 里单独抽出来，这轮还新增了最小带库入口 `pnpm verify:replace-ready:proof:with-db`；它当前是最小带库 `auth/token/bootstrap` 真源证明链入口，只覆盖 `next-auth-bootstrap` 顺序型 smoke 与 `persistence-smoke`
- `pnpm verify:replace-ready:doctor` 本地可通过
- `pnpm verify:replace-ready:with-db` 这轮已在本地独立 PostgreSQL/Redis 环境实跑通过；此前真正卡住它的 `marketTradeHistory` 审计用例已修成“等待成交历史可见”而不是误把瞬时空页判失败
- `gm-database-smoke` 这轮也继续收口到运营实际路径：除了 `backup -> restore` 外，现在还会显式校验并发 `backup/restore` 的单飞拒绝、`GET /gm/database/backups/:backupId/download` 下载内容与 `gm/database/state` 元数据、磁盘备份内容一致，并覆盖 restore 生成的 `pre_import` 检查点备份下载，补上“backup 后新增建议单与 GM 直邮在 restore 后消失，且 mail summary 回到 backup 前基线”的业务态回滚证明，以及服务重启后的 `lastJob / checkpointBackupId / sourceBackupId / appliedAt / finishedAt` 持久化读取
- `pnpm verify:replace-ready:shadow` 这轮也已对本地 `11923` shadow 实例实跑通过，至少证明 `/health`、GM 登录、`/gm/state`、`/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 这组 GM-admin 只读面，以及最小 `n:c:hello` next 会话链路当前可用；runtime 只读断言会在 bootstrap 成功后按玩家真实 `templateId/x/y` 取样，不再只看固定出生图
- 仓库里现已新增 `pnpm verify:replace-ready:shadow:destructive` / `pnpm --filter @mud/server-next smoke:shadow:gm-database`，用于在维护窗口里单独证明已部署 shadow 的 `backup -> download -> restore` destructive 闭环；它默认不并入共享 shadow 只读链，必须显式设置 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- 仓库里现已新增 `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`，用于证明同一 `SERVER_NEXT_GM_DATABASE_BACKUP_DIR` 在服务重建后仍能通过 `gm/database/state` 与 download 读回旧备份；`pnpm verify:replace-ready:full` 也已把这条本地安全 proof 串入最严格自动化链
- `pnpm --filter @mud/server-next smoke:legacy-auth` 这轮也已扩到 legacy 普通玩家 HTTP compat 最小闭环，覆盖 `POST /auth/register /auth/login /auth/refresh /account/password /account/display-name /account/role-name`，并显式验证 account 资料更新后 runtime 身份投影与重新握手 bootstrap 都会跟上最新 `displayName / roleName`
- 它现在在无数据库环境下会先走 compat HTTP `/auth/register`/`/auth/login` 来获取真实 access token，再用该 token 完成 socket bootstrap；带数据库时仍保留 seeded legacy token fixture 来证明 legacy token 兼容链。
- `pnpm --filter @mud/server-next smoke:legacy-player-compat` 这轮也已补上并通过，已覆盖 legacy 普通玩家 socket 的 `navigateQuest / action(loot:open) / sortInventory / destroyItem / ackSystemMessages / chat`，并显式断言握手声明 `protocol: legacy` 后不会混入任何 `n:s:*` next 事件
- `pnpm --filter @mud/server-next smoke:gm-compat` 本轮已通过，除旧 GM socket/HTTP 最小兼容链外，也已覆盖 `/gm/maps`、`/gm/editor-catalog`、`/gm/maps/:mapId/runtime` 三组只读管理面，以及玩家改密、地图 tick/time、邮件、建议单等关键维护写路径，并在结果里输出 `passwordChange / adminRead.currentMap / editorCatalog / runtimeInspection`
- `pnpm --filter @mud/server-next smoke:readiness-gate` 这轮也已补上，用独立自起实例显式锁定 readiness gate 语义：无数据库且未显式旁路时 `/health` 返回 `503` 且新 next socket 会收到 `SERVER_NOT_READY`；只有开启 `SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1` / `SERVER_NEXT_SMOKE_ALLOW_UNREADY=1` 后，本地 smoke 才允许继续跑。这里补的是系统稳定性门禁，不是 auth/bootstrap 真源替换
- `pnpm audit:server-next-boundaries` 对应的最新自动报告已刷新到 `docs/next-legacy-boundary-audit.md`；当前结果是 `0/22`、`0`，这说明主服务里的 direct legacy/perf inventory 已清零，但它不是 replace-ready 验收，也不代表底层真源或整体替换已经完成
- `WorldSyncService` 这轮也不再继续承载 compat 初始/增量同步主体：legacy 同步分支已外提到 `WorldLegacySyncService`，低频协议双发和协议分流已外提到 `WorldSyncProtocolService`。这说明 `world-sync` 主服务已经从“兼容主体”收口成“中性编排层”，但 legacy socket facade 仍存在，不能据此夸大成 next 已彻底摆脱 legacy。
- `WorldGateway` 这轮又继续收了一层纯语义 legacy 边界：连接鉴权异常现在统一回到中性 `AUTH_FAIL`，不再单独对外发 `LEGACY_AUTH_FAILED`；`next-auth-bootstrap` smoke 也补了坏 token 负向断言，显式验证 next socket 在无效 token 下只收到 `AUTH_FAIL`，且不混入任何 legacy `s:*` 事件。这里补的是错误码语义和门禁一致性，不是 auth/bootstrap 真源替换完成
- `WorldSessionBootstrapService` 这轮也继续收了一层 bootstrap 主链 direct legacy 依赖：GM socket token 校验已外提到中性的 `WorldGmAuthService`，`WorldSessionBootstrapService` 不再直接注入 legacy GM HTTP auth；但底层校验目前仍复用 legacy GM HTTP auth 真源，所以这只是 bootstrap 主链的边界收口，不是 GM auth 真源替换完成
- `WorldGateway` 这轮又继续压薄了一层 direct legacy GM compat 依赖：GM socket 的 `getState/spawnBots/removeBots/updatePlayer/resetPlayer` 命令桥，和 tile detail 的 legacy 投影发包，现已外提到中性的 `WorldGmSocketService` / `WorldProtocolProjectionService`；`WorldGateway` 本身不再直接注入 `LegacyGmCompatService`。这里补的是 gateway 边界削薄与协议投影外提，不是 GM compat 或 tile legacy 真源已经移除
- `server-next` 这轮又补了一层后端环境口径归一：`WorldLegacyPlayerSource`、legacy auth、持久化服务、health readiness、protocol audit 与 GM/database 相关 smoke 现在都统一接受 `SERVER_NEXT_DATABASE_URL/DATABASE_URL` 与 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` 这组别名，不再出现“root 脚本判定 ready、服务内部却只认单一环境变量后悄悄降级”的不一致。
- `server-next` 这轮也补齐了剩余 smoke / shadow 周边 URL 入口：`combat / loot / runtime / session / progression / player recovery / player respawn / monster*` 这一组工具现在都统一接受 `SERVER_NEXT_URL`，并通过同一 alias helper 读取；`verify:replace-ready:shadow`、`verify:replace-ready:acceptance`、`smoke:shadow` 这组链路继续保持 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL` 的同义入口口径。这里补的是工具链一致性，不是 shadow 已默认纳入根级主链。
- 这轮环境来源归一又继续扩展到了根级 wrapper：`replace-ready / doctor / with-db / shadow / acceptance` 以及对应 `verify:server-next*` alias 现在都按同一套 database/shadow/GM alias helper 解析来源，不再出现“包内 smoke、root wrapper、自检入口各自手搓一份 alias 判断”的漂移。这里补的是入口一致性，不是证明链新增覆盖面。
- `WorldSyncService` 这轮又补了一层低风险后端收口：`Quests / MapStatic / Realm / LootWindow / Notice` 的 next/legacy 发包现在统一走显式协议 helper，主要收益是把低频协议边界写清、减少散落的重复分流；它不触及 `Bootstrap` 构造、`WorldDelta` 高频主链或 auth/bootstrap 真源替换。
- `auth/bootstrap` 这轮继续补了可观测性，但仍没有改完真源语义：显式设置 `SERVER_NEXT_AUTH_TRACE_ENABLED=1` 或 `NEXT_AUTH_TRACE_ENABLED=1` 后，`WorldPlayerTokenService` / `WorldPlayerAuthService` / `WorldPlayerSnapshotService` / `WorldSessionBootstrapService` 会把 `token / identity / snapshot / bootstrap` 四段记录写入 ring buffer，并通过受 runtime debug guard 保护的 `/runtime/auth-trace` 暴露给 `next-auth-bootstrap` smoke 做断言；默认不开启，不改变正常链路。这有利于后续继续拆 auth/bootstrap 真源，但不代表真源替换已经完成。
- `next-auth-bootstrap` smoke 这轮也补了一条更硬的 identity 一致性门禁：登录得到的 token claims 里的 `playerId / playerName`，现在必须和 `InitSession`、`Bootstrap.self.id` 以及 runtime `player.name` 对齐，避免 token、identity 回填和最终 bootstrap 入场结果漂移后仍被误判为通过。这里补的是证明链严密度，不是 auth/bootstrap 真源替换完成。
- 带库 `next-auth-bootstrap` proof 这轮也继续收紧了 identity 来源门禁：在 `compatIdentityBackfillSnapshotPreseed` 这条 preseed 成功链上，第一次必须显式落到 `legacy_backfill`，第二次必须显式回到 `next`，不再允许 with-db proof 在这条链上悄悄掉回 `legacy_runtime / token` 仍算通过。这补的是 proof 完整性，不是 bootstrap/session 主链已经 next-native。
- `identity` trace 这轮也开始把“来源”和“是否落到 next identity persistence”拆开表达：`source` 当前已扩到 `next / next_invalid / token / token_runtime / legacy_runtime / legacy_backfill / legacy_preseed_blocked / legacy_persist_blocked / miss`，并额外暴露 `persistenceEnabled / persistAttempted / persistSucceeded / persistFailureStage` 这组字段；其中 `legacy_backfill` 现在只代表“identity backfill 成功且 snapshot ensure 已确认成功”，这里的 ensure 已同时覆盖 `legacy_seeded` 与缺 compat snapshot 时的 native starter seed；一旦 snapshot ensure 未确认或 identity 回填保存本身失败，当前都不会再降回 `legacy_runtime` 继续放行，而是直接拒绝；而 `token_runtime` 则只表示“无库退化场景下直接使用 token 自带完整玩家 claims，且未再回查 compat identity”。这里补的是观测真实性和一部分真语义收紧，不是 identity 真源替换完成。
- `snapshot` trace 这轮也更精确了：legacy fallback 命中时，当前已能区分“只是 runtime fallback 的 `legacy_runtime`”和“已成功 seed 到 next persistence 的 `legacy_seeded`”，避免把未落盘的 fallback 误记成已完成 seed。
- 无库 authenticated next 连接这轮也不再默认落到 compat identity：当 token 自带完整玩家 claims 时，主链当前会显式落成 `token_runtime`，并且 `next-auth-bootstrap` smoke 已固定要求 `identityCompatTried=false`、`snapshotFallbackReason=identity_source:token_runtime`。
- 带库 `token_seed` 首登链这轮也真正脱离了“必须先有 compat snapshot 才能放行”的旧依赖：当 next identity 已成功落盘、但 next/compat snapshot 都还不存在时，主链现在会直接按默认地图模板生成 next-native starter snapshot；`next-auth-bootstrap` smoke 已固定要求 `compatIdentityCalls=0`、`compatSnapshotCalls=0`、`persistedSource=native`。这里补的是 token 首登真语义收口，不代表 `next identity / compat backfill` 那条 snapshot 主链也已一起退出 legacy。
- 带库 `compat backfill` 旧链这轮也开始脱离“必须先有 compat snapshot 才能放行”的旧依赖：当 next identity 已删除、compat identity 仍可解析、但 next/compat snapshot 都还不存在时，主链现在也会直接按默认地图模板生成 next-native starter snapshot；仓库内 with-db proof 已固定要求 `identity.source=legacy_backfill`、`snapshotPersistedSource=native`，并要求 starter inventory 在 persisted/runtime 两侧都保留。这里补的是 compat backfill 真语义收口，不代表 `next identity` 缺失 snapshot 的主链异常已经允许静默 starter 降级。
- `WorldLegacyPlayerSourceService` 这轮也补了一层低风险 auth/bootstrap 收口：无数据库 fallback 时，身份解析不再只信 token 里的陈旧 `displayName`，而会优先回读 legacy 内存账号中的 `displayName / pendingRoleName`，避免 `/account/display-name`、`/account/role-name` 更新后，runtime 或下次 bootstrap 又被旧 token 投影覆回去。这里补的是 fallback 身份一致性，不是 next auth/token/bootstrap 真源替换完成。
- `WorldGateway` 这轮也继续压薄了一层 compat 直接依赖：此前 `mail / market / suggestion / npc shop` 这组 legacy handler 的结果发包，已改走 `WorldClientEventService` 的中性 emitter；这轮又把 `legacy navigate quest / legacy action / inspect tile runtime` 的网关入口并到中性 handler 与协议感知 helper，`WorldGateway` 现已不再直接调用 `LegacyGatewayCompatService`。随后 legacy bootstrap 最后一条 pending-logbook 兼容发包也已并到 `WorldClientEventService`，`LegacyGatewayCompatService` 与 `LegacySocketBridgeService` 已从 `server-next` 模块中移除。这里补的是网关边界和 compat 壳体收口，不是 auth/bootstrap 真源替换完成，也不代表 legacy bootstrap / tile runtime 兼容已经可以整体删除。
- `pnpm verify:replace-ready:acceptance` 当前脚本已提升为“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口；这会继续压缩 deploy 后的人工检查面，但它仍没有覆盖更完整的 GM/admin/backup/restore 全量日常门禁
- `pnpm verify:server-next*` 当前只保留为兼容别名；wrapper 会先打印 alias 委托关系，再进入对应的 `replace-ready` 链
- `next-protocol-audit` 这轮又补了两层低风险验证收口：GM 登录现在也走 `SERVER_NEXT_GM_PASSWORD/GM_PASSWORD` alias；独立 runner 会把子进程里的 `SERVER_NEXT_URL` 与 `SERVER_NEXT_SHADOW_URL` 都钉到本次自起审计实例，避免继承外部 shadow URL 串到错误目标
- `pnpm audit:server-next-protocol` 本轮也已随根级 `verify:replace-ready` 跑通；其包内实际执行入口是 `pnpm --filter @mud/server-next audit:next-protocol`

这说明 replace-ready 证明链的“入口与覆盖面”已经比前几轮更完整，而且当前本地主证明链、legacy 普通玩家 compat smoke、独立 with-db 闭环、本地 shadow 实物验收，以及把三者串起来的 acceptance 组合链都已经跑绿；但它仍不能被夸大成“完整替换就绪”，因为更完整的 GM/admin/backup/restore 人工回归仍未闭环，而默认/`acceptance`/`full` 三层只是不同强度的自动化门禁，不应再误读成“默认门禁最后一定要收敛成 acceptance”。

这里也必须把口径压实：

- 根级 `pnpm verify:replace-ready` 现在是“唯一推荐的本地主证明链入口”
- `pnpm verify:replace-ready:acceptance` 现在是“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”的组合入口
- 它不是“完整替换就绪”的同义词
- 新增的 `next-auth-bootstrap` smoke 只是在自动化层把 auth/bootstrap compat 边界锁得更清；它同时也说明当前 token-bearing next 连接仍有“连接阶段直接 bootstrap”这层 compat 语义，不代表 next auth/token/bootstrap 真源已经摆脱 legacy
- `pnpm verify:server-next*` 当前只保留为兼容别名，排障时会先打印 alias 委托关系
- `pnpm --filter @mud/server-next verify:replace-ready*` 当前只是包内 smoke / 排障子集

### 截至 2026-04-06 的门禁缺口

1. 根级 `pnpm verify:replace-ready` 仍不自动覆盖 `shadow`，所以默认主入口通过，不等于已部署实例实物验收通过。
2. 独立 `with-db` workflow 现在仍是 `workflow_dispatch` 手工补充链，但它的角色已经转成隔离排障与单独补证，而不再是 publish/deploy 获得带库门禁的唯一入口。
3. `Publish Server Next Image` 现在也会先过带库 replace-ready；`Deploy Server Next` 则会在此前置基础上追加 `shadow` 与 `gm-compat` 验收，但它们仍不等于完整 GM/admin 人工回归。
4. `pnpm verify:replace-ready:acceptance` 现在虽然已经补到“本地主证明链 + shadow 实物验收 + shadow GM 关键写路径验证”，并且 `gm-compat` 已能额外给出管理只读面摘要，但仍不会神奇补齐完整 GM/admin/backup/restore 人工回归。
5. 当前工作区若缺少 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL` 或 `SERVER_NEXT_SHADOW_URL` / `SERVER_NEXT_URL` 与 `SERVER_NEXT_GM_PASSWORD` / `GM_PASSWORD`，阻塞点是环境，不是脚本缺失。
6. `auth/token/bootstrap` 里真正高风险的 `bootstrap/session` 主链替换当前仍不该并行混改；带库场景下“第一次 `legacy_seeded`、第二次 `next(native)`”的顺序型 smoke 这轮已经实跑通过，下一步应先单线收紧 `snapshot/player-source` 的 legacy fallback，再进入 `bootstrap/session` 真源收口。
7. `auth/token/bootstrap` 的证明链仍有两块没补完：
   - 带数据库 proof 现在已经补上专门的负向门禁：保留 next identity、同时清空 next/legacy snapshot 源后，再次使用同一 token 连接必须直接失败，不得静默造 fresh player 成功入场
   - 带数据库 proof 现在也已经补上非法 next snapshot 负向门禁：保留 next identity 与 next snapshot、再把 next snapshot 文档改成非法 payload 后，同一 token 再连必须直接失败，不得静默吞成 compat fallback、miss 或 fresh player
   - 带数据库 proof 现在也已经补上 next snapshot meta 容错正向门禁：如果 next snapshot 主体仍有效、只是 `payload.__snapshotMeta.persistedSource` 被污染成非法值，同一 token 再连仍必须成功 bootstrap，且 trace 必须显式归一成 `snapshotPersistedSource=native`
   - 带数据库 proof 现在也已经补上 next identity 下 compat `mapId` 坏值被忽略的负向门禁：保留 next identity、清空 next snapshot、再把 compat `mapId` 改成非法空值后，同一 token 再连仍必须直接失败；但失败来源现在必须是 `snapshot.source=miss`，证明主链不会再回落 compat snapshot，更不会再去读 compat 坏 placement
   - 带数据库 proof 现在也已经补上 next identity 下 compat `unlockedMinimapIds` 坏值被忽略的负向门禁：保留 next identity、清空 next snapshot、再把 compat `unlockedMinimapIds` 改成非法值后，同一 token 再连仍必须直接失败；但失败来源现在必须是 `snapshot.source=miss`，证明主链不会再回落 compat snapshot，也不会再去读 compat 坏字段
   - 带数据库 proof 现在也已经补上非法 next identity 负向门禁：如果 next persisted identity 非法，同一 token 再连必须在 snapshot 装载前直接失败，不得再靠 compat/token 静默顶过去
- 带数据库 proof 现在还已经补上 identity backfill save failed 的两条专项 proof：删除 next identity、保留 compat identity 与 next snapshot，并定向拦截 `server_next_player_identities_v1` 写入后，同一 token 再连当前也必须直接失败；trace 必须显式落成 `identity.source=legacy_persist_blocked`、`persistAttempted=true`、`persistSucceeded=false`、`persistFailureStage=compat_backfill_save_failed`，且不得出现 snapshot/bootstrap，即使 next snapshot 文档仍然存在也不能再靠 compat identity runtime 放行
- 同一组 identity backfill save failed 条件下，如果再同时删除 next/legacy snapshot 源，同一 token 再连同样必须直接失败；trace 仍必须显式落成 `identity.source=legacy_persist_blocked`，且不得出现 snapshot/bootstrap，证明这条阻断已经前移到 identity gate，而不是等到 snapshot=miss 才失败
- 带数据库 proof 现在也已经补上 compat backfill 缺旧 snapshot 时的正向门禁：删除 next identity、清空 next/legacy snapshot、但保留 compat identity 后，同一 token 再连当前必须直接 bootstrap 为 `identity.source=legacy_backfill`、`snapshotPersistedSource=native`，且 starter inventory 在 persisted/runtime 两侧都要保留
- 带数据库 proof 现在还已经补上 next identity 不再回落 compat snapshot 的专项 proof：保留 next identity、删除 next snapshot、保留 compat snapshot 后，同一 token 再连必须直接失败；trace 必须显式落成 `identity.source=next`、`snapshot.source=miss`，且不得出现 bootstrap
- 带数据库 proof 这轮也已补上 compat backfill 缺失 compat snapshot 时的 native starter 正向 proof：删除 next identity、清空 next/legacy snapshot、但 compat identity 仍存在后，同一 token 再连必须直接 bootstrap 为 `identity.source=legacy_backfill`、`snapshotPersistedSource=native`，且 starter inventory 需要在 persisted/runtime 两侧同时存在
- 当前只允许无数据库场景把 `snapshotSource=miss` 作为 compat 入场语义输出；一旦是已鉴权且带数据库的 snapshot proof，`snapshot=miss` 本身就必须判失败
- 目前仍未补齐的是更完整的 snapshot 持久化失败矩阵，以及更多 compat schema/字段异常的系统化 proof；同时 `next identity` 已存在但 `next snapshot` 缺失的 authenticated 主链，当前仍刻意保持 fail-fast，不自动降级成 starter 号，以避免把真实数据缺失静默吞掉；但“非 native next identity + snapshot miss”这条 fresh bootstrap 入口已经被新的负向 proof 收掉

## 最初目标达成度

### 本轮已实跑证据

截至 `2026-04-11`，当前仍可直接引用、且最近轮次没有被推翻的关键验证是：

- `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json`
- `node packages/server-next/dist/tools/audit/next-legacy-boundary-audit.js`
- `node packages/server-next/dist/tools/smoke-suite.js --case session --case runtime --case next-auth-bootstrap --case legacy-player-compat --case monster-runtime --require-legacy-auth`

当前可直接据此固定的口径是：

- `server-next` 当前源码可独立编过 `tsc`
- latest boundary audit 当前为绿，且已刷新到 `docs/next-legacy-boundary-audit.md`；当前结果是 `0/22` 个检查项、`0` 处代码证据
- `session / runtime / next-auth-bootstrap / legacy-player-compat / monster-runtime` 这一组最小 smoke 当前为绿，说明这轮后端收口没有把 `server-next` 主链打坏
- 标准 `pnpm --filter @mud/server-next verify:replace-ready` 这轮已经重新确认可跑并通过；共享层当前更应被视为需要继续稳定的风险源，而不是现时阻塞点
- 这只能证明“server-next 本体与 direct inventory 当前稳定可复跑”；不能把它夸大成 auth/bootstrap 真源已经完整替换完成

### 结论总表

- 最小包体：`部分满足`
- 最高性能：`未满足`
- 极高扩展度：`部分满足`
- 系统稳定性：`部分满足`
- 完整替换游戏整体：`未满足`，保守仍差 `35% - 40%`

没有一项可以诚实地说“已经全部满足你最开始设定的目标”。

补充口径：replace-ready 当前已经固定成 `local / acceptance / full` 三层门禁。现在真正剩下的，不是再把默认门禁强行并成 `acceptance`，而是继续补齐 `GM/admin/restore` 证明链，并避免把默认本地门禁误读成完整替换证明。

### 1. 最小包体：部分满足

当前 next 的 steady state 高频链路已经明显优于旧链：

- `WorldDelta / SelfDelta / PanelDelta` 已经是增量同步
- `client-next` socket 主链也已经只消费 next 事件
- 面板同步不再依赖旧的整组 legacy update 监听链

但还不能叫“全部达到最小包体”，主要因为：

1. 首包仍然偏肥。
   `Bootstrap` 已经带 `mapMeta / minimap / visibleMinimapMarkers / minimapLibrary`，随后又继续发 `MapStatic`，存在首包与低频静态重复分发。
2. `Bootstrap.self` 仍是完整 `PlayerState` 级别的大对象，而不是进一步按静态 / 低频 / 高频拆薄。
3. `Bootstrap` 后通常还会继续跟 `PanelDelta(full)` 和 `Quests`，整体首屏同步还没有压到最小。
4. 传输层仍然是 Socket.IO 的 JSON 对象主线，不是 next 自己的更窄线宽二进制主协议；当前 protobuf 也还没有成为 next 主同步链的正式包体方案。

### 2. 最高性能：未满足

现在已经明显比旧链更好，但离“最高性能”还有实质差距。

服务端侧的主要短板：

1. 每个 tick 仍会为每个连接构建完整视图和 delta，热路径总计算量依然重。
2. `buildPlayerView` 仍承担 FOV、扫描、排序等大块工作，自动战斗还会再做一遍相近构建。
3. `server-next` 的 direct 性能热点 inventory 虽已清零，但这只说明最显眼的字符串化 / 比较热点已收口，不代表热路径已经达到极限性能。
4. 传输层仍以 Socket.IO JSON 对象为主，`Bootstrap.self` 与首屏同步体积也还没有拆到最薄。
5. 前后台都还没有看到针对高负载地图、大量实体、长时在线会话的极限性能门禁证据。

前台侧的主要短板：

1. `MapStore` 仍大量使用 `${x},${y}` 作为 tile / pile key，这属于“可维护但不够极致”的实现。
2. `client-next` 的核心面板虽然已做 patch，但观察弹层主体、若干 modal 与部分列表更新仍在用 `innerHTML` 整块重建。
3. 前台还没有证据证明已经做过针对高负载地图、大量实体、长时在线会话的极限性能门禁。

### 3. 极高扩展度：部分满足

已经有不错基础，但还不到“极高扩展度”。

正向部分：

- `client-next` 的协议主链已经 next-only，主入口清晰
- 协议已拆成 `Bootstrap / MapStatic / Realm / WorldDelta / SelfDelta / PanelDelta`
- 前台已有面板注册表、桌面/移动端布局分层、交互状态保留能力

但限制也很明显：

1. `WorldProjectorService / WorldSyncService` 仍集中承载大量手写 clone / diff / capture 逻辑，新增系统时耦合成本仍高。
2. `Bootstrap.self` 继续复用巨型 `PlayerState`，会把新字段继续推向“大而全首包”。
3. `RenderEntity` 仍较强依赖 `char / color` 这一类当前渲染语义，抽象层还不够彻底。
4. `client-next` 虽然已有 panel registry，但不是所有面板都达到了统一的局部 patch 与交互连续性标准；部分面板仍是“结构变了就整体重建”。

### 4. 系统稳定性：部分满足

这一项当前最接近“可用但不够可替换”。

已有基础：

- `verify:replace-ready`
- `verify:replace-ready:with-db`
- `verify:replace-ready:shadow`
- `audit:server-next-protocol`
- smoke / persistence / GM database / restore 一组基础脚本已经存在

但还不能据此判定“可正式整体替换”，因为：

1. 根级 `verify:replace-ready` 现在已经覆盖 `client-next build`、本地 replace-ready smoke、协议负向断言；在提供 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL` 时，还会转入 `with-db` 并覆盖带库 restore 自动回归，但仍不覆盖完整 `shadow` 实例实物验收。
2. CI/workflow 当前已经把带库 replace-ready 挂到 publish/deploy 前置，但还不是完整 replace-ready 证明。
3. shadow 自动化仍偏薄，很多业务回归仍依赖人工观察。
4. GM socket / GM HTTP 当前已补上最小 compat smoke，`gm-compat-smoke` 也已补到 `gm/maps / editor-catalog / map runtime` 只读管理面与地图 tick/time、邮件、建议单等关键维护写路径，`gm-database-smoke` 也已覆盖 `backup|download|restore`、下载内容与 state/磁盘一致性，以及 `pre_import` 检查点下载；但 GM admin 整体仍没有一套 next replace-ready 级别的统一自动证明。
5. `DATABASE_URL / SERVER_NEXT_DATABASE_URL` 的入口口径这轮已对齐，不再存在根脚本与 smoke 是否带库判断不一致的问题。
6. 现在新增的 `verify:replace-ready:doctor` 只能解决“先暴露环境缺口”，不能替代带库与 shadow 的真实替换验收。
7. 即便这轮已经把 publish/deploy 的前置门禁抬到带库 replace-ready，并补了独立 `with-db` workflow 与最小 `GM compat` smoke，完整 GM/admin/backup/restore 统一证明仍未完成，不宜夸大成“完整替换就绪”。
8. 这轮补的环境变量 alias 一致性，只能算“后端配置与验证口径更一致”，不能夸大成 auth/bootstrap 真源已经完成替换。

## 前台侧补充判断

`client-next` 当前更适合被描述为“主链已经基本 ready，但还没达到极致目标”。

- 协议主链上，`socket.ts` 已明确只绑定 `NEXT_S2C.*` 事件，并在连接时声明 `protocol: 'next'`
- `main.ts` 已经围绕 `WorldDelta / SelfDelta / PanelDelta` 做状态合并和局部同步
- 主要面板已经明显往 patch / preserve-interaction 方向收口
- 桌面 / 手机 / 深浅色三条 UI 线也已经有明确结构，不是事后硬补

但前台仍有这些尾项：

1. 观察弹层主体、部分 modal、部分面板更新仍用 `innerHTML` 整块重建。
   但 `mail-panel`、`npc-shop-modal`、`suggestion-panel` 与 `npc-quest-modal` 这几类低频 detail modal 已经收口为“根事件委托 + 局部 patch 列表/详情区”；`observe modal` 这轮也已经把 buff tooltip / 实体详情点击改成一次性委托，所以这里当前更主要的 UI 尾项，是 observe body 本体和若干仍整刷的 detail/list 区，而不是重复绑事件本身。
2. `MapStore` 与若干前台 store 仍保留字符串键 map/set 结构，不是最极致的数据布局。
3. 面板系统虽已成型，但并不是所有面板都声明或兑现了 `preservesInteractionState`。
4. 这轮分析只做了代码审查，没有实际完成一轮浅色 / 深色 / 手机的手工回归验证，所以这里只能说“代码上已有覆盖基础”，还不能说“体验上全部验完”。
5. `side-panel` 这类纯前台交互状态现在已经补做本地恢复，但它仍属于缓存层收口，不是正式持久化真源，也不改变整体替换完成度判断。

## 如果目标是“正式替换旧前台”

### 当前判断

- `client-next` 代码主链已经基本 ready，不再是正式替换的主要阻塞
- 真正的 `P0` 在 `server-next` 的登录 / 会话 / bootstrap，以及替换验收证明链
- 当前更准确的进度判断是：
  - 距离“正式替换旧前台”：约还差 `20% - 30%`
  - 距离“后端真正独立、可大幅移除 legacy”：仍明显更远

### P0：正式替换旧前台前必须解决

1. `next` socket 的认证 / 会话 / bootstrap 仍由 legacy 主链驱动。
   当前 `WorldGateway.handleConnection / handleHello` 已改为依赖中性的 `WorldSessionBootstrapService`，而 `WorldSessionBootstrapService` 现在也只再依赖 `WorldPlayerAuthService / WorldPlayerSnapshotService / WorldClientEventService` 这类中性入口；其中 `WorldPlayerAuthService / WorldPlayerSnapshotService` 已不再直接注入 `LegacyAuthService`，而是继续拆成 `WorldPlayerTokenService + WorldLegacyPlayerSourceService` 两段。现在 token 校验和旧库读取已经分开，但底层 token 规则与旧库读取仍继续依赖 legacy JWT 语义、旧 `users/players` 表以及 `loadLegacyPlayerSnapshot` 兼容装载。
2. `next` 网关行为层虽然已不再由 legacy compat service 承担，但 legacy 协议投影与 bootstrap 兼容语义仍未完全外置。
   `quest navigate`、`chat`、`ack system messages`、bootstrap 待确认 logbook、以及 `WorldGateway` 里的 common error 发包都已经开始改走中性事件服务；`mail / market / suggestion / npc shop` 这组 legacy handler 的结果发包，以及 `legacy navigate quest / legacy action / inspect tile runtime` 这组网关入口，这轮也已继续收口到中性 handler 与协议感知 helper。`LegacyGatewayCompatService` 与 `LegacySocketBridgeService` 现已移除；当前剩下的，主要是 `WorldGateway` / `LegacyGmCompatService` 里仍在承担的 legacy tile runtime 投影，以及少量 bootstrap/协议兼容语义，还没有彻底外置。
3. 正式替换证明链还没闭环。
   根级 `pnpm verify:replace-ready` 现在已经覆盖 `client-next build`、`audit:server-next-protocol` 和本地 smoke；仅在提供 `DATABASE_URL` / `SERVER_NEXT_DATABASE_URL` 时，才会转入 with-db 并覆盖带库 restore 自动回归，但仍不覆盖 `shadow` 实例实物验收；`pnpm verify:server-next` 当前只保留为兼容别名，wrapper 会先打印 alias 委托关系。
4. `next` 协议审计已经补上“禁止 next 连接额外收到 legacy 事件”的负向断言，且 `market storage` 用例也已修正为按运行时真实背包容量构造前置。
   但这条审计仍只是 replace-ready 证明链的一环，现在只和本地 `client-next build`、replace-ready smoke 与带库 restore 自动回归串起来了；`shadow` 仍未统一进同一门禁。

### P1：替换后应尽快继续收口

1. `WorldSyncService` 的 compat 初始/增量主体虽然已外提，但 `WorldLegacySyncService` 这层 legacy sync facade 仍在，后续应继续压薄成更纯的兼容壳。
2. `loadLegacyPlayerSnapshot` 仍是 bootstrap 热路径里的自动 fallback，最好降级成显式迁移入口。
3. `runtime/persistence` 对旧快照字段和旧 runtime bonus source tag 的兼容回读仍在主装载流程里。

### 可延后

1. legacy HTTP / GM controller 之外，少量 legacy tile runtime projector 或低频协议包装可以在替换后暂时保留。
2. legacy HTTP / GM controller 与 admin/backup/restore 面可以先作为外层 compat 壳保留。
   但前提是不再把 legacy 语义反向渗进 runtime 真源和 socket 主链。

## 当前最新进度

### 已完成的关键收口

- `pnpm verify:replace-ready` 这轮本地已通过；此前 `gm-compat-smoke` 的 HTTP GM update 超时问题已经修稳，`pnpm verify:server-next` 当前只保留为兼容别名，wrapper 会先打印 alias 委托关系。
- `pnpm verify:replace-ready:doctor` 当前可通过，并会显式报告 `local / with-db / proof with-db / shadow / acceptance / full` 各链分别缺哪些环境变量；`pnpm verify:server-next:doctor` 当前也只是同一条链的兼容别名。
- 根级 `pnpm verify:replace-ready` 这轮也已串行覆盖 `pnpm audit:server-next-protocol`；其包内实际执行入口 `pnpm --filter @mud/server-next audit:next-protocol` 也已通过并生成/刷新报告到 `docs/next-protocol-audit.md`。
- `client-next` 的高频主链已经直接消费 next：
  - `NEXT_S2C.Bootstrap`
  - `NEXT_S2C.MapStatic`
  - `NEXT_S2C.Realm`
  - `NEXT_S2C.WorldDelta`
  - `NEXT_S2C.SelfDelta`
  - `NEXT_S2C.PanelDelta`
- `client-next` 的 `PanelDelta` 已不再回退到旧的 `handleAttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 监听链。
- `client-next` 的 `WorldDelta / SelfDelta` socket 主链已不再经过 `handleTick(buildLegacyTick...)`。
- `client-next` 的 bootstrap 入口已从 `handleInit(S2C_Init)` 收口为 next 语义的 `handleBootstrap / applyBootstrap`。
- `shared-next` / `shared` 的 `NEXT_S2C_Bootstrap` 已不再是 `S2C_Init` 类型别名，首包类型名已经在共享协议层独立出来。
- `shared-next` / `shared` 中这批 next 低频 payload 也已从 legacy 类型别名拆成独立 next 接口：
  - `NEXT_S2C_LootWindowUpdate`
  - `NEXT_S2C_QuestNavigateResult`
  - `NEXT_S2C_RedeemCodesResult`
  - `NEXT_S2C_GmState`
  - `NEXT_S2C_MapStatic`
  - `NEXT_S2C_Realm`
- `client-next` 的 `sendAction` 已不再 fallback 到 `C2S.Action`，现在只走：
  - `NEXT_C2S.UseAction`
  - `NEXT_C2S.UsePortal`
- `client-next` 的 `socket.ts` 已不再监听任何 legacy 事件名，包含此前残留的 `S2C.Kick`。
- `client-next` 的地图运行时渲染适配层命名也已收口为中性语义，`MapRuntime` 不再继续引用 `LegacyCanvasTextRendererAdapter`。
- `client-next` 的本地地图记忆迁移命名也已改成版本兼容语义，`main.ts` 的 next notice -> UI 转换已收口到中性消息 ID helper。
- `shared-next` 的 `NEXT_S2C_NoticeItem` 也已把旧的 `legacyId` 协议兼容字段收口为中性语义的 `messageId`。
- `server-next` 的 `WorldSyncService` 已从 compat 主体收口成中性编排层：legacy 初始/增量同步主体已外提到 `WorldLegacySyncService`，`protocol=next` 的连接不会再走旧的 compat 主体实现；主服务本身只保留 next 编排与少量低频辅助同步。
- `WorldSyncService` 的 next 增量 `MapStatic` 路径已不再为可见标记计算整张 legacy 可视瓦片矩阵，改成只构建可见坐标 key 集合，先收掉一段 hot path 的 legacy 投影开销。
- `WorldSyncService` 的 next `Bootstrap / MapStatic` 首包路径已不再直接调用：
  - `buildLegacyVisibleTiles`
  - `buildLegacyRenderEntities`
  - `buildLegacyMinimapLibrary`
  这批 legacy 包装 helper 已从 `world-sync` 内部删除，next/legacy 同步路径统一直接走中性 helper。
- `WorldSyncService` 的时间状态主计算也已切到中性 helper：
  - `buildGameTimeState`
  - `normalizeMapTimeConfig`
  - `resolveDarknessStacks`
  `world-sync` 内部旧的 `buildLegacyTimeState / normalizeLegacyMapTimeConfig / resolveLegacyDarknessStacks` 包装也已删除。
- `loot window` 这一条链已新增 next 语义包装入口：`openLootWindow / buildLootWindowSyncState / getLootWindowTarget` 已成为同步层与 runtime 的主调用名，本轮又继续删掉了一批零引用 legacy 包装。
- `WorldSyncService` 里 `MinimapMarkers / VisibleMinimapMarkers / GameTimeState / ThreatArrows / TickPayload / AttrUpdate / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate` 已补上中性 helper 入口，next 主路径不再继续直接挂 `buildLegacy*` 名称；其中 `Inventory / Equipment / Technique / Actions` 这四组已经进一步反转为“中性名是主实现”。
- `WorldSyncService` 的 next `Bootstrap.self` 投影现在也改走中性 helper：`buildAttrBonuses / buildEquipmentRecord / toTechniqueState / toActionDefinition / toItemStackState / cloneTechniqueSkill`，此前对应的本地 legacy 包装已从 `world-sync` 删除。
- `WorldSyncService` 里动作 ID 的兼容映射现在也抽成了中性 helper `normalizeActionEntry`，next `Bootstrap.self.actions` 和 legacy actions diff 复用同一主入口，旧的 `toLegacyActionEntry` 本地包装也已删除。
- `WorldSyncService` 的 legacy delta 内核也继续收口了一层：`captureSyncSnapshot / buildTickPayload / diffRenderEntities` 现在是主实现，旧的 `captureLegacySnapshot / buildLegacyTickPayload / diffLegacyRenderEntities` 本地包装已删除。
- `WorldSyncService` 的同步缓存和属性投影主名也继续收口：`syncStateByPlayerId / buildAttrUpdate / captureAttrState` 现在是内部主实现，旧的 `legacyStateByPlayerId / buildLegacyAttrUpdate / captureLegacyAttrState` 命名已退出主路径，其中本地包装也已删除。
- `WorldSyncService` 的 legacy 初始/增量同步方法内部现在也直接走中性 helper，不再继续直接调用 `buildLegacyVisibleTiles / buildLegacyRenderEntities / buildLegacyMinimapLibrary`；这些本地包装也已从 `world-sync` 删除。
- `WorldSyncService / PlayerRuntimeService / WorldRuntimeService / LegacyGatewayCompatService` 的 `loot window` 旧入口也继续收口：`emitLegacyLootWindow / openLegacyLootWindow / clearLegacyLootWindow / buildLegacyLootWindow` 这批零引用包装已删除，调用面统一走中性入口。
- `WorldSyncService / WorldTickService` 对地图时间与 tick 速度的取数现在也改走中性入口 `mapRuntimeConfigService / getMapTimeConfig / getMapTickSpeed`，主逻辑不再直接挂 `legacyGmHttpCompatService.getMapTimeConfig/getMapTickSpeed`。
- `WorldSyncService` 内部 next/legacy 双发判定也已经从分散的 `shouldEmitNextPayload / shouldEmitLegacyPayload` 收口到单一协议分流入口，减少重复协议判断。
- `player-runtime` 已补上 next 语义主入口：
  - `getPendingLogbookMessages`
  - `queuePendingLogbookMessage`
  - `acknowledgePendingLogbookMessages`
  - `deferVitalRecoveryUntilTick`
  旧的 legacy 方法现退为兼容壳，外部调用已开始切到新名。
- `server-next` 的玩家运行时真源已继续收口：
  - `legacyLootWindow` -> `lootWindowTarget`
  - `legacyCompat.pendingLogbookMessages` -> `pendingLogbookMessages`
  - `legacyCompat.suppressVitalRecoveryUntilTick` -> `vitalRecoveryDeferredUntilTick`
  - `legacyBonuses` -> `runtimeBonuses`
  - 持久化与 legacy 导入仍兼容回读旧字段
- `player-runtime / player-persistence` 对旧快照字段的回读也已继续收口到 compat helper，`legacyCompat.pendingLogbookMessages / legacyBonuses` 不再直接散落在主装载流程；`runtime:vitals_baseline` 的展示标签也已改成中性语义。

### 当前粗略完成度

- 以下百分比同样是按不同目标口径给出的粗略估算，只用于判断优先级，不能横向比较或加总。
- `client-next` 主链独立度：约 `80% - 85%`
- `server-next` 独立化：约 `50% - 60%`
- 想整体移除仓库中的 `legacy`：约 `25% - 35%`

### 这意味着什么

现在阻碍“彻底去掉 legacy”的主因，已经不再是客户端收发主链，而是服务端同步投影内核更深层的 legacy builder、登录体系、runtime 真源以及后台 HTTP/GM 面。

## 现在还不能整体去掉 legacy 的原因

### 1. client-next 的内部命名清洗已基本完成

`client-next/src` 里的主要 `legacy` 命名边角已经收口完成，包括：

- 地图运行时渲染适配器命名
- 本地地图记忆迁移命名
- chat / UI style 的旧存储迁移命名
- technique panel 的 fallback 层命名
- notice 消息 ID 的兼容字段命名

这意味着客户端这边剩下的重点已经不再是内部命名清洗，而是继续维持 next 主链独立，并避免新的 compat 反向渗回主路径。

### 2. server-next 的登录 / 会话 / bootstrap 仍压在 legacy 服务上

当前 `WorldGateway` 连接、Hello、GM token 校验、玩家 bootstrap、快照装载，仍依赖：

- `WorldSessionBootstrapService`
- `WorldPlayerAuthService`
- `WorldPlayerSnapshotService`
- `WorldPlayerTokenService`
- `WorldLegacyPlayerSourceService`
- `WorldClientEventService`
- `LegacyGatewayCompatService`

这意味着 `next` 连接虽然已经独立声明 `protocol=next`，但会话体系还不是 next 自己的。

### 3. server-next 的同步投影内核已明显收口，但 legacy sync facade 仍在

当前 `WorldSyncService` 已不再直接保留 compat 初始/增量同步主体，`WorldSync compat` 这组审计命中也已清零；主要变化是：

- legacy 初始/增量同步主体已外提到 `WorldLegacySyncService`
- `Quests / MapStatic / Realm / LootWindow / Notice` 的协议分流已外提到 `WorldSyncProtocolService`
- `protocol === 'legacy'` 的协议分流语义和 `LegacyGmHttpCompatService` 这类 compat 依赖仍在
- legacy compat 目录与少量 runtime 逻辑里仍有部分 `emitLegacy* / buildLegacy* / resolveLegacy*` 名称

所以服务端同步内核虽然已经从主服务里切掉了 compat 主体，但 legacy 支路还没有被降到最薄边界。

另外，`next-protocol-audit` 现在已经带上“next 连接不得额外收到 legacy 事件”的负向断言，并且 `market storage` 场景也已按真实容量修正前置；当前缺的不是断言本身，而是把它稳定纳入统一 replace-ready 门禁。

### 4. server-next 的 runtime / persistence 仍把 legacy 状态当正式真源

当前 runtime / persistence 的玩家真源字段名已基本收口到 next / 中性语义：

- `lootWindowTarget`
- `pendingLogbookMessages`
- `vitalRecoveryDeferredUntilTick`
- `runtimeBonuses`

旧快照和旧库导入仍兼容回读 `legacyCompat.*` / `legacyBonuses`，但 runtime 真源字段名本身已不再继续使用这些 legacy 命名。

只要这些字段还在 runtime 和持久化真源里长期存在，legacy 就还不是纯外层兼容面。

### 5. 后台 HTTP / GM 面仍是 legacy 主导

当前 `P0 legacy HTTP/GM/admin` 的 direct boundary inventory 已清零，但这不等于后台和运营面已经完全 next 化。

更准确的说法是：

- 网关和主服务里的直接 legacy HTTP/GM/admin 依赖已经基本收口
- 运营真源、控制面能力和完整自动化证明仍主要复用 legacy 能力

所以即便玩家前台先独立，后台和运营面也还没有脱离 legacy。

## 现在最值得继续做的事

### 第一阶段：把“前台 next 独立线”彻底做实

建议顺序：

1. 先继续收敛 `replace-ready / with-db / shadow / acceptance` 的门禁、脚本和文档口径，并把最小带库真源证明链固定下来。
2. 再单线推进 `snapshot/player-source` 真源收紧，缩小 legacy fallback 的默认触发面。
3. 然后进入 `bootstrap/session` 真源收口，避免与其他 auth/token 改动并行混做。

做到这一步，可以认为“玩家前台 next 线的后端 P0 已开始真正收口”。

### 第二阶段：再决定后端兼容面的策略

之后再明确：

- 是保留 legacy HTTP / GM 作为外层兼容壳
- 还是继续推进 next auth / next GM / next HTTP

在这之前，不建议再继续扩新的 compat。

## 当前建议口径

建议统一用下面这句描述现状：

> `client-next` 的玩家主链已经基本 next-native；真正阻塞正式替换旧前台的，已经主要收缩到 `server-next` 的登录/会话/bootstrap 主链、部分 next handler 仍借 compat 壳，以及替换验收证明链尚未闭环。
