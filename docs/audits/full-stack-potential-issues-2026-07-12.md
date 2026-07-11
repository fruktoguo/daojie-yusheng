# 前后端全量潜在问题审计（2026-07-12）

> 本文档记录当前 goal 的覆盖证据、已确认问题、修复状态和待确认事项。只有实际读过调用链或运行过对应门禁的条目才会标记完成；未发现不等于已证明无问题。

## 状态约定

- `[x]`：已有当前代码证据，问题已修复并完成对应验证。
- `[ ]`：问题已确认，但尚未完成修复或验证。
- `[?]`：现有证据不足，仍需动态验证、线上数据或产品决定。

## 当前基线

- 工作区基线：`main`，开始审计时工作区干净；本地已有提交 `6135766d`，分支比 `origin/main` 超前 1 个提交，本轮不改写该提交。
- 生产包：`packages/client`、`packages/shared`、`packages/server`、`packages/config-editor`。
- 规模口径：8 核 CPU、16GB 内存、30Mbps 出口、5000 并发玩家、10000 地图实例、地图独立 1Hz tick。
- 历史回归基线：`docs/audits/project-potential-issues-scan-2026-07-06.md` 的 41 项已修问题；本轮按当前代码重新验证，不直接沿用旧结论。

## 覆盖矩阵

| 领域 | 当前状态 | 已有证据 | 仍需完成 |
| --- | --- | --- | --- |
| 客户端应用状态与断线/跨图生命周期 | 进行中 | `pnpm verify:client` 通过；兑换码和离线收益刷新均有请求关联、会话清理及乱序 proof | 逐条复核其余网络派生状态、迟到回包和重置边界 |
| UI 局部更新、焦点、滚动、选区 | 进行中 | 高频 UI continuity proof 通过 | 继续审查未被 proof 覆盖的面板和弹层 |
| 地图渲染、相机、命中与资源释放 | 进行中 | map render lifecycle、spatial cache proof 通过 | 动态检查移动端触控与大视口性能 |
| shared 类型、协议与 protobuf | 进行中 | shared build 与协议审计通过；兑换码和离线收益主动刷新 C2S/S2C 已关联 `requestId` | 完成当前大包体的数据流与消费复核 |
| 服务端网络同步、AOI、首包/增量 | 进行中 | `pnpm verify:quick` runtime smoke 通过；网关 action 已验证单次 delta 和兑换终态关联 | 逐字段检查其余频率、范围、恢复语义 |
| 服务端 runtime、tick、移动、战斗、交互 | 待检查 | server compile、quick runtime smoke 通过 | 按 mechanics 文档审查真实调用链和热路径 |
| 持久化、恢复、强事务与关闭 | 进行中 | server compile 通过；边界审计 forbidden 已清零 | 复核玩家/实例分域、flush、outbox、恢复围栏 |
| 配置编辑器、schema、导入发布 | 进行中 | 构建、content-contract、异步代际 smoke 与浏览器乱序回包验证通过 | 继续复核地图保存、schema 与发布入口 |
| 鉴权、权限、GM 高危操作 | 待检查 | release gate contract 通过 | 复核 scope、审计、二次确认和默认回退值 |
| 错误处理、日志与可观测性 | 待检查 | 尚无全域结论 | 检查吞异常、敏感信息、告警与失败水位 |
| 性能、内存、网络包体 | 进行中 | 文件体积门禁失败；构建产物存在大 chunk 警告 | 区分真实热路径问题、门禁误报和冷路径债务 |
| 浅色、深色、手机与触控 | 待检查 | 构建门禁不证明视觉结果 | 需要浏览器级检查 |
| 测试、构建、清理链与边界门禁 | 进行中 | quick/client/release contract/config build、边界审计通过 | 继续检查其余持久化夹具清理与失真测试 |

## 已发现问题

### FS-001 `[x]` 边界审计把显式清理误判为快照全量重写

- 严重级别：中。
- 根本原因：`production-boundary-audit.ts` 只按单行 SQL 文本匹配；玩家空背包的显式终止删除，以及 `purgeInstanceState` 的实例销毁清理，与“先整域 DELETE、再全量重插”的危险快照写法使用相同 SQL 形态。建筑、房间和风水五个检查还漏配了其他实例域已经使用的 `purgeInstanceState` 窄豁免。
- 为什么错误：门禁检查的是调用语义，但实现只识别字符串，无法区分终止清理和后续重插。合法路径因此让 `pnpm audit:boundaries` 退出 1，而真正禁止的普通快照重写仍需要继续被拦截。
- 后果：边界门禁长期红灯会掩盖新增违规，维护者可能错误更新 baseline、删除检查或忽略整个报告；也会让发布判断无法区分产品缺陷与审计误报。
- 修复方式：把空背包删除提取到命名明确的 `deletePlayerInventoryForExplicitEmptySnapshot`；审计只允许该函数和 `purgeInstanceState` 中的精确全域删除。非空玩家快照、普通实例保存和新增函数中的同类 SQL 仍会命中 forbidden 检查。
- 验证：`pnpm --filter @mud/server compile` 通过；`pnpm audit:boundaries` 通过，报告 forbidden 命中从 6 降为 0，runtime template spread 为 0 violation，10 个 registry 抽样均冻结。

### FS-002 `[ ]` 文件体积门禁已失守，生产巨型模块继续膨胀

- 严重级别：高。
- 根本原因：多个运行时、持久化、GM 和客户端面板持续把新职责并回巨型文件；`scripts/file-size-baseline.json` 没有阻止 18 个已超限文件继续增长，另有 5 个文件首次超过 3000 行。生成文件和大型 smoke 又与生产模块混在同一口径，增加了噪音。
- 为什么错误：巨型模块扩大冲突面和隐式副作用，难以证明单一职责、事务边界及局部 UI 更新；门禁红灯失去阻止继续膨胀的能力。
- 后果：运行时/持久化改动更容易产生竞态、旧态覆盖、全量刷新或回归遗漏；review 和验证成本持续增加。
- 修复方向：先修正生成物、工具与生产代码的分类口径，再按真实职责拆分当前生产超限模块；不得简单更新 baseline 掩盖增长。
- 当前证据：`pnpm proof:file-size-gate` 退出 1，报告 18 个 baseline regression、5 个新超 3000 行文件。

### FS-003 `[ ]` server tools 大量绕过 TypeScript 检查并保留 CommonJS 写法

- 严重级别：高。
- 根本原因：历史 smoke/proof/tool 以编译后 JavaScript 形态回填到 `.ts`，169 个文件带 `@ts-nocheck`，其中 144 个 `.ts` 文件仍含 CommonJS `require/module.exports/exports` 写法。
- 为什么错误：这些验证脚本本应用来证明生产契约，却绕过类型检查；接口漂移可能直到运行 smoke 才暴露，未进入默认 suite 的脚本甚至会长期失真，同时违反项目 TypeScript 红线。
- 后果：门禁产生假阳性，重构调用签名后旧 smoke 可能静默失效，关键恢复/资产测试的可信度下降。
- 修复方向：按稳定 suite 与高风险资产/恢复脚本优先，逐组迁移为规范 TypeScript import/export 并移除抑制；每组运行实际 compiled smoke 后原子提交。

### FS-004 `[x]` 玩家分域空覆盖 smoke 的异常路径缺少兜底清理

- 严重级别：中。
- 根本原因：smoke 在正常循环末尾会清理当前测试玩家，但最外层 `finally` 只关闭连接；如果 seed、断言、查询或中间清理抛错，已创建的其他测试玩家不会再次清理。
- 为什么错误：该 smoke 会向真实测试数据库写入玩家分域行，清理只覆盖 happy path，不满足成功、失败和中断都不遗留持久对象的门禁约束。
- 后果：失败回归可能污染玩家分域表，后续 smoke 受旧行干扰；长期运行的 CI/验证库会积累垃圾对象，掩盖真实恢复与清理问题。
- 修复方式：预先枚举本次所有测试玩家 ID，在最外层 `finally` 中逐个兜底清理后再关闭连接；主体错误与清理错误使用 `AggregateError` 一并显式抛出，不静默吞掉失败。
- 验证：server compile 通过；`node packages/server/dist/tools/player-domain-empty-overwrite-guard-smoke.js` 在当前数据库环境实际运行通过，7 个域均保持 seed 行不变，两个领悟清理分支符合预期，并执行最终兜底清理。

### FS-005 `[x]` config-editor 构建成功但字体资源不会进入产物

- 严重级别：中。
- 根本原因：Public Sans 通过 Tailwind 处理的 CSS `@import` 引入，Vite 没有接管依赖 CSS 中的相对字体 URL。最终 CSS 保留 `./files/public-sans-*.woff2`，但 `dist` 没有 `assets/files` 或任何字体文件。
- 为什么错误：构建只给 warning 并返回成功，CSS 中的相对 URL 会在部署时解析为 `/assets/files/*.woff2`，这些请求必然 404；开发机依赖目录里存在字体文件不能证明生产产物可用。
- 后果：配置编辑器在所有主题和设备上回退系统字体，排版宽度、表格密度和按钮文本可能变化；更严重的是构建门禁无法发现其他 CSS 静态资源丢失。
- 修复方式：由 `main.tsx` 直接导入 `@fontsource-variable/public-sans`，让 Vite 解析并发射哈希字体资源；新增构建后 CSS URL 完整性检查，任何缺失的本地资源都会让 build 失败。
- 验证：`pnpm build:config-editor` 通过，构建发射 3 个哈希命名的 `woff2`，新增门禁确认 CSS 的 3 个本地 URL 均有对应产物；Chrome 147 通过 CDP 实测页面完成挂载，`document.fonts.check('16px "Public Sans Variable"')` 为 `true`，实际使用的 latin 字体返回 `200 font/woff2`，无字体失败请求。

### FS-006 `[x]` config-editor 未声明站点图标导致每次加载产生 404

- 严重级别：低。
- 根本原因：配置编辑器 `index.html` 未声明 favicon，浏览器按默认约定请求 `/favicon.ico`；编辑器复用了 client 的 public 目录，但该目录没有根级 favicon。
- 为什么错误：这是确定不存在的 URL，不是可选资源延迟加载；每次新会话都会制造一次无意义请求和错误日志，干扰真实静态资源故障排查。
- 后果：浏览器标签缺少项目标识，预览/部署访问产生 `404` 噪音；监控若按 4xx 统计会被无效请求污染。
- 修复方式：在 HTML 中显式引用项目已有的 `packages/client/favicon.ico`，交由 Vite 解析、发射和重写，避免复制第二份品牌资源。
- 验证：`pnpm build:config-editor` 发射 `dist/assets/favicon-BDKqQ5Up.ico` 并把 HTML 链接重写为该哈希 URL；Chrome 147 在 `390×844`、DPR 2、深色模式下通过 CDP 实测链接存在，主动请求返回 `200 image/x-icon`，且页面重载不再请求默认 `/favicon.ico`。

### FS-007 `[x]` config-editor 异步旧回包会覆盖当前选择或错误回写草稿

- 严重级别：高。
- 根本原因：文件、功法、怪物和地图目录请求没有请求代际或取消控制；功法、怪物保存完成后又直接使用当时闭包中的 key 回写当前页面。Promise 返回前，用户已经可能选择另一条目、继续编辑、切换目录页签或离开页面。
- 为什么错误：异步响应只证明某次请求完成，不证明它仍对应当前页面上下文。旧 A 请求晚于新 B 请求返回时直接 `setState`，会把时间顺序误当成业务顺序；写请求即使不能安全取消，也必须把发包时的 key 和草稿快照与当前上下文比对后再回写。
- 触发条件：快速连续选择两个配置文件；列表或目录请求延迟、乱序；保存功法/怪物期间继续编辑、切页或重复点击；地图目录筛选切换时目录请求仍在途。
- 后果：界面标题与内容错配、A 的服务端规范化结果覆盖 B 或覆盖保存后继续输入的新草稿、错误 key 被后续保存、地图目录按旧页签过滤，以及组件卸载后的无效状态更新。配置内容因此可能被写入错误条目。
- 修复方式：新增绑定 React 生命周期的 `LatestRequestGuard`，只读请求启动新代际时取消旧请求，组件停用后拒绝全部旧回包；写请求不传取消信号，而是捕获 key 与草稿快照，只在当前条目和草稿均未变化时采用服务端规范化结果。同步增加保存/加载互斥、重复提交抑制、脏草稿重载确认，并让地图目录回包重新查询当前 DOM 且校验 effect 生命周期。
- 验证：`pnpm --filter @mud/config-editor exec tsc -p tsconfig.json`、`pnpm --filter @mud/config-editor test:request-generation`、`pnpm build:config-editor` 均通过；Chrome 147 通过 CDP 让 A 文件响应故意晚于 B，最终标题与正文仍为 B，且拒绝重载后正文和 B 请求次数均未变化。

### FS-008 `[x]` 怪物初始 Buff 修改未进入脏状态

- 严重级别：高。
- 根本原因：`initialBuffsText` 是独立于 `draft` 的 JSON 文本状态，但 `dirty` 只比较 `draft` 与 `savedJson`；只有点击保存时才把文本解析回 payload。
- 为什么错误：保存按钮完全依赖 `dirty`，因此一个可持久化字段被排除在保存判定之外。页面显示“已编辑”，状态机却认为“无修改”。
- 触发条件：只修改“初始 Buff”页签内容，不同时修改怪物其他字段。
- 后果：保存按钮保持禁用；切换怪物、重载或离开页面时该修改可能无提示丢失，内容生产者也无法单独清空或调整出生 Buff。
- 修复方式：为格式化后的 `initialBuffsText` 建立独立已保存基线并纳入 `dirty`；选择、重载和成功保存时同步基线；保存期间继续编辑时保留新文本，不让旧保存响应覆盖。
- 验证：请求代际 smoke 覆盖保存期间草稿变化；Chrome 147 真实挂载怪物页，未修改时“保存”禁用，只把非空 `initialBuffs` 改为 `[]` 后按钮立即启用。

### FS-009 `[x]` 服务状态轮询可乱序回退并持续弹出错误通知

- 严重级别：中。
- 根本原因：页面和页头都用固定 `setInterval` 启动异步状态请求，没有 single-flight 或代际控制；服务页面每次后台轮询失败都弹 toast，且保留上一次成功状态。重启按钮也没有同步防重入。
- 为什么错误：网络请求耗时可能超过轮询间隔，旧成功或旧失败会在新结果之后落地；后台健康探测是持续状态，不应把同一故障每三秒转换成一次破坏操作连续性的通知。
- 触发条件：服务端不可达、响应超过 3 秒、网络抖动，或用户连续点击重启。
- 后果：页面显示与真实运行态相反、故障期间通知无限堆积、操作者误判服务已恢复；重复重启指令还可能扩大中断窗口。
- 修复方式：每次轮询取消并失效上一代请求；失败时明确显示“状态不可用”并仅在用户主动刷新时 toast；后台轮询静默更新内联错误；重启增加同步 ref 防重入和卸载后的回写失效保护。
- 验证：TypeScript、请求代际 smoke 与 config-editor 完整 build 均通过；smoke 证明新请求会取消旧请求、停用组件后旧响应无效且 StrictMode 再激活可恢复。

### FS-010 `[x]` 配置草稿只保护条目切换，跨页与离站仍会静默丢失

- 严重级别：高。
- 根本原因：文件、功法、怪物和地图编辑器分别在“重载/切换当前条目”按钮中调用 `confirm`，但哈希路由只监听 URL 并直接卸载页面；侧栏切页、浏览器后退/前进、刷新和关闭标签页都不读取各编辑器的 dirty 状态。地图编辑器的 dirty 又是类内部私有字段，宿主无法统一判断。
- 为什么错误：草稿是否安全离开是路由与页面之间的生命周期契约，不能只散落在少数按钮事件里。相同的未保存状态从不同入口离开却得到不同结果，会让用户无法预测数据是否保留。
- 触发条件：修改任一文件、功法、怪物或地图后，点击侧栏其他页面，使用浏览器历史导航，刷新页面或关闭标签页。
- 后果：已编辑但未持久化的配置无提示丢失；地图和内容配置通常修改量较大，丢失后只能人工重做，也可能让操作者误以为改动已写入服务端。
- 修复方式：把 route 真源和导航动作统一收敛到 `HashRouter` context，页面注册实时 blocker；站内导航与外部 hash 变化使用同一确认逻辑，拒绝时恢复当前 hash，`beforeunload` 对所有活跃 blocker 统一拦截。移动端侧栏只在导航真正接受后关闭。地图编辑器新增只读 `hasUnsavedChanges()`，不暴露或复制草稿真源。
- 验证：`pnpm build:config-editor`、`pnpm verify:client` 均通过；Chrome 147 通过 CDP 验证文件草稿拒绝站内导航后 hash 和正文不变，拒绝直接 hash 导航后自动恢复，合成 `beforeunload` 被取消，确认后页面才卸载；另用真实 `GmMapEditor` 挂载最小地图并应用 JSON，地图 dirty 状态同样拒绝离页，确认后才进入服务页。

### FS-011 `[x]` 拍卖成交记录竞态标识漏掉查询范围

- 严重级别：中。
- 根本原因：客户端请求拍卖成交记录时允许 `scope=all|mine`，服务端又异步查询持久化历史；但 `pendingTradeHistoryKey` 只记录 `source|page`，回包校验也只比较这两个字段，遗漏 `scope`。
- 为什么错误：同一来源和页码下，“全服成交”和“我的成交”是两份不同数据。筛选范围没有进入请求身份，旧范围回包会被误认成当前请求；而回包处理还会把 `auctionHistoryScope` 改回旧值。
- 触发条件：在网络或数据库响应较慢时快速切换“全服/我的”，尤其两次请求都位于第 1 页。
- 后果：选中标签和列表一起回退到旧范围，玩家看到的不是最后一次选择；重复切换时会表现为列表闪回，破坏筛选与分页的可预测性。
- 修复方式：请求与回包统一使用 `source|scope|page` 三元 key；任何范围不匹配的迟到响应在写入状态前直接丢弃。
- 验证：`pnpm verify:client` 通过；高频 UI continuity proof 新增双向断言，锁定请求 key 和响应 key 都必须包含 `scope`。

### FS-012 `[x]` 会话清理漏关传法台弹层与异步任务

- 严重级别：高。
- 根本原因：`MarketPanel.clear()` 显式关闭普通坊市、拍卖、拍卖上架和天道商店，却遗漏 `MarketTransmissionView.modalOwner`。传法台的搜索防抖 timer、独立上架监听器和投影签名只在弹层用户关闭的 `onClose` 中释放；`detailModalHost.close()` 的程序化关闭语义又不会调用该回调。
- 为什么错误：登出/踢下线属于强制会话边界，所有带玩家身份的 UI、计时器和监听都必须同步失效，不能依赖用户随后手动关窗。
- 触发条件：传法台或残卷上架层打开时登出、被踢下线、认证过期或重置游戏状态；搜索防抖尚未触发时风险更明显。
- 后果：登录页或新账号会话上仍可能显示上一玩家的传法台列表、`isMine` 标识和残卷信息；旧防抖回调还会在清理后发起请求，造成跨会话 UI 污染与无效网络流量。
- 修复方式：为传法台子视图增加统一 `clear()`，显式取消搜索 timer、abort 内联监听、清空投影和上架 open 状态、隐藏 tooltip，并强制关闭所属弹层；`MarketPanel.clear()` 在重置玩家数据前调用该入口。用户关闭与会话清理复用同一释放函数。
- 验证：`pnpm verify:client` 通过；高频 UI continuity proof 锁定市场会话清理必须调用传法台 `clear()`，且该入口必须释放临时状态并关闭正确 owner。

### FS-013 `[x]` 登录/注册允许重复提交写请求

- 严重级别：高。
- 根本原因：认证代际只会让旧回包失效，`handleSubmit()` 没有 single-flight 守卫，提交按钮和模式页签在请求期间也仍可操作。现有 proof 甚至把连续点击发出两条请求当成正常行为，只验证最后一个回包接管客户端。
- 为什么错误：迟到回包隔离只是客户端状态安全，不能撤回已到达服务端的副作用。注册是写操作，必须在发包前去重。
- 触发条件：双击注册/登录按钮，或者在弱网期间重复点击。
- 后果：第一条注册可能已成功创建账号，但被新代际丢弃；第二条随后以“账号已存在”失败，最终界面显示失败而账号实际已创建。重复登录也会无意义增加鉴权与令牌签发压力。
- 修复方式：`handleSubmit()` 在已有显式认证时同步返回；从发包前到请求结束禁用提交按钮和登录/注册页签，登出或清理会话会立即恢复操作态。代际仍保留，用于隔离已在途中且无法取消的旧回包。
- 验证：`prove-login-auth-epoch` 新增登录与注册连续点击用例，确认每次只会发出一条网络请求，认证期间控件禁用，成功、失败或登出后正常恢复。

### FS-014 `[x]` 本地图片覆盖存在半提交与旧读图回写

- 严重级别：中。
- 根本原因：`persistOverrides()` 在写 `localStorage` 之前就替换模块内快照；配额不足或存储被禁用时只抛错，不回滚内存。同一资源 key 的多次 `FileReader` 又没有代际，读取完成顺序被错当成用户操作顺序；“恢复默认”也不会取消已在途中的读图。
- 为什么错误：该功能声明的真源是当前设备的 `localStorage`，内存态不能在真源写入失败后单独向前推进；异步文件读取必须服从最后一次用户意图。
- 触发条件：选择较大图片导致本地配额溢出；快速为同一资源连选两张不同大小的图；或在文件仍读取时点击“恢复默认”。
- 后果：设置面板与当前渲染会话可能看到未真正持久化的图片，刷新页面后突然丢失；较慢的旧文件还可以覆盖新选择，甚至在恢复默认后重新出现。
- 修复方式：先完成 `localStorage` 写入，成功后才原子发布内存快照和渲染刷新事件；存储不可用与配额失败统一显式报错。每个资源 key 增加写入代际，新选图或恢复默认会使旧 `FileReader` 结果失效；被取代的 Promise 静默收口，不覆盖新状态文案。
- 验证：地图渲染生命周期 proof 新增可控 `FileReader` 与失败存储，实际验证配额失败不改内存/不发事件、后选图胜出且旧回包被丢弃、恢复默认后旧读图不得复活。

### FS-015 `[x]` 兑换码跨 tick 结果没有请求身份，可结算到错误操作

- 严重级别：高。
- 根本原因：C2S 只发 `codes`，S2C 只发 `result`；客户端只保留一个无身份的 `pendingRedeemCodesRequest`。旧请求超时后可以启动新请求，但旧结果迟到时会直接取出当前 pending 并结算。手动退出的 `io client disconnect` 分支又提前返回，通用 reset 没有清理该 pending；发包层还忽略会话门控的 `accepted=false`。服务端入队或执行失败也不发这次请求的终态。
- 为什么错误：兑换码会改变玩家资产，且必须入队到下一息执行。客户端的 Promise 结果必须与服务端实际执行的同一条意图一一对应，不能用“当前恰好有一个等待者”代替请求关联。
- 触发条件：服务端执行超过 12 秒后重试；旧结果在新请求等待期到达；手动退出/被踢时正在兑换；或已连接检查与真正 emit 之间的会话状态发生变化。
- 后果：A 兑换的成功/失败明细可被 B 操作展示，玩家因此误判资产是否入账并重复提交；发包被拒绝或服务端明确失败后仍锁住按钮 12 秒；旧账号等待态还会跨越会话边界。
- 修复方式：协议强制客户端生成的唯一 `requestId`，并从网关、命令入队、tick 消费一直传到成功或失败 S2C；客户端只结算 ID 严格相等的结果。同一 ID 且同一内容的传输重试只保留一个队列条目，同 ID 异内容显式拒绝。发包门控拒绝立即 reject，所有 reset 统一撤销 timer 并终止 pending。
- 验证：`pnpm build:shared`、`pnpm verify:client`、server compile 通过；新增客户端可控超时 proof，证明旧 A 结果不能结算 B、会话清理立即 reject、门控拒绝不留假 pending；compiled `world-runtime-redeem-code`、`world-runtime-pending-command-queue`、`world-gateway-action-helper`、`world-runtime-player-command` 等七个相关 smoke 通过。

### FS-016 `[x]` 网关低频动作的特殊分支重复发送 delta

- 严重级别：中。
- 根本原因：`handleProtocolAction` 在通用 `executeAction` 后已经发送一次 `emitDeltaSync`，自动凝练根基和通天塔分支在持久化后又发一次，`portal:travel` 也在末尾再发一次。新增通用同步时没有删除历史特判。
- 为什么错误：这些都是单次低频意图，同一动作只需要一个面向当前 socket 的最终增量。需要强制落盘的分支还应先完成 flush，再发唯一结果，不应先暴露一个未落盘的中间时序。
- 后果：传送、通天塔和自动凝练开关每次操作都会增加一个重复包和一轮无效客户端 patch；持久化较慢时，客户端还可先看到未完成 flush 的状态。在多玩家同时低频操作时会放大不必要的组包和带宽开销。
- 修复方式：将分支统一为“执行动作 → 如有必要先 flush → 单播一次 delta”；删除传送与特殊分支的第二次同步。
- 验证：compiled `world-gateway-action-helper-smoke` 通过，分别锁定世界迁移、炼体、传送、自动凝练与通天塔的单次 delta，且需要落盘的动作保持 flush 在 sync 之前。

### FS-017 `[x]` 写侧 compiled smoke 已与生产路径和稳定物品引用契约脱节

- 严重级别：中。
- 根本原因：`world-runtime-player-command-smoke.ts` 仍 `require` 已迁入 `command/` 的旧模块路径，使用/装备命令仍构造旧 `slotIndex`，而生产调度已读取 `itemInstanceId`。`world-runtime-gameplay-write-facade-smoke.ts` 又用同步 `assert.throws` 验证 async 拒绝。这些文件的 `@ts-nocheck` 让 server compile 无法发现漂移。
- 为什么错误：smoke 是重构后验证命令路由和资产引用的证据；模块在启动前就找不到，或用已废弃字段得到 `undefined`，都意味着它没有在证明当前生产链。
- 后果：玩家命令调度和 lease 围栏的回归无法实际运行；默认 compile 仍绿，给出虚假安全感，也进一步印证 FS-003 中工具层绕过 TypeScript 的系统性风险。
- 修复方式：指向当前 `command/world-runtime-player-command.service`，用稳定 `itemInstanceId` 构造使用/装备命令并更新断言；对 async lease 拒绝改用 `await assert.rejects`。同步让兑换码 smoke 传递当前 `requestId` 契约。
- 验证：compiled `world-runtime-player-command-smoke`、`world-runtime-gameplay-write-facade-smoke`、`world-runtime-write-entry-smoke`、`world-runtime-command-intake-facade-smoke` 均实际运行通过。

### FS-018 `[x]` 离线收益轮询旧回包可让预览和本机历史倒退

- 严重级别：高。
- 根本原因：阻塞确认层每 3 秒启动一次异步预览查询，但 C2S/S2C 都没有请求身份，客户端也不记录最新代际；上一轮数据库/运行时查询可以晚于下一轮完成，并直接覆盖模块级 `blockingReports`。服务端在两段异步查询结束后也没有复核 socket 是否仍绑定原玩家。
- 为什么错误：离线挂机仍按 1Hz tick 累积，后发请求天然应包含不早于先发请求的时长和收益；网络完成顺序不等于业务新旧顺序。确认按钮又会先把当前 `blockingReports` 写入浏览器历史，再向服务端发送结算回执，因此旧视图不仅会闪回，还会成为错误的本机历史快照。
- 触发条件：任一预览查询超过 3 秒、数据库或网络抖动导致相邻请求乱序，或查询期间同一 socket 被重新绑定到其他玩家。
- 后果：确认层显示的时长、修为和物品可能倒退；玩家在旧回包落地后确认，会把少记的收益报告保存到本机历史，而服务端最终资产和权威总账仍按最新 session 结算，造成展示历史与正式真源不一致。换绑后若旧查询继续回包，还可能向新会话投递旧玩家预览。
- 修复方式：主动刷新请求强制携带唯一 `requestId`，服务端限制长度并逐条回显校验后的 ID；客户端只消费当前最新代际一次，旧代际、重复回包、发包门控拒绝、确认开始及会话重置后的在途结果全部失效。服务端异步读取结束后再次校验 socket 玩家绑定；Bootstrap、tick 等没有 `requestId` 的服务端主动下发保持原语义。
- 验证：`pnpm build:shared`、server compile、`pnpm verify:client`、`pnpm audit:protocol` 均通过；新增 compiled `world-gateway-offline-gain-refresh-smoke` 实际制造“新请求先返回、旧请求后返回”和“查询中换绑玩家”，确认回显身份准确且旧玩家结果不再投递；socket gate 动态证明客户端拒绝旧代际、重复回包、门控失败和 reset 后回包，同时仍接受无 ID 的主动首包。

## 待进一步验证或用户决定

### D-001 `[?]` 客户端初始包同时装载 React 面板与 legacy 回退实现

- 当前证据：Chrome 147 在 `390×844`、DPR 2 的冷启动登录页测得本地 JavaScript 传输量约 `1.04MB`，全部资源解码量约 `5.4MB`；`index.html` 预加载 `main-panels`，入口同步创建面板，默认 feature flags 同时保留 16 个 React 面板及 legacy DOM 实现。
- 潜在后果：未登录用户也承担大量管理/玩法面板的下载、解析和编译成本；低端手机首屏延迟与峰值内存增大，双实现还扩大行为漂移和维护面。
- 无法直接确定的原因：legacy 分支可能仍承担线上回退、灰度或故障恢复职责；删除范围和登录后动态边界会改变运维恢复方式，不能只按包体数字擅自裁撤。
- 可选方案：① 推荐：确认各 React 面板稳定性后移除对应 legacy 实现，并把非登录首屏面板改为鉴权成功后的动态加载；② 保留回退，但明确接受首包与双维护成本，并新增两套行为一致性门禁；③ 仅做 chunk 拆分，降低首屏成本但继续承担双实现债务。
- 2026-07-13 需要决定：legacy 回退是否仍是生产要求，以及允许移除的面板清单；决定后才能制定不会削弱恢复能力的拆分顺序。

### D-002 `[?]` 客户端登录首屏依赖外部 Google Fonts

- 当前证据：同一次冷启动观测到外部字体 CSS 约 `152KB`、字体资源约 `0.36MB`；标题、正文和玩家信息等多处样式依赖这些字体角色。
- 潜在后果：外部域名不可达或跨境链路抖动时产生额外 DNS/TLS 与阻塞成本，字体回退会改变文本宽度和布局；自托管则会增加仓库/镜像体积与字体子集维护成本。
- 无法直接确定的原因：这是品牌视觉、部署网络和资源治理的共同取舍；直接删除或替换会产生用户可见排版变化。
- 可选方案：① 推荐：确认字形范围后自托管 WOFF2 子集并预加载首屏必要字重；② 保持外部托管，但为失败和超时建立明确回退并接受依赖；③ 统一改用系统字体，资源最小但视觉变化最大。
- 2026-07-13 需要决定：品牌字体是否必须保留，以及生产是否允许依赖 Google Fonts。

以下候选仍属于本轮可以继续用代码和运行证据判定的技术项，不提前作为产品决策：

- 当前无库协议审计实测到工坊首次投影中单个 `SyncEnvelope` 为 `67.22KB`，单个 `AlchemyPanel` 为 `48.38KB`；需完整追踪字段产生、包体分层、触发频率、客户端消费和断线恢复后，再判断是否应分页或拆包。

## 已执行验证

| 命令 | 结果 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| `pnpm verify:quick` | 通过 | server compile、生产边界基础 proof、无库 readiness/session/runtime smoke | DB 真源、shadow、完整业务和压力表现 |
| `pnpm verify:client` | 通过 | client typecheck/build、高频 UI、socket gate、空间缓存、地图生命周期等现有 proof | 浏览器视觉、所有面板运行时路径、弱网与移动真机 |
| `pnpm build:config-editor` | 通过；仅保留 MapsPage 大 chunk 警告 | 编辑器 typecheck、请求代际 smoke、build、CSS 资源完整性、content contract | 所有导入发布场景和长期弱网行为 |
| Chrome 147 config-editor CDP 验证 | 通过 | 字体/favicon 产物、文件乱序回包、脏草稿拒绝重载、怪物初始 Buff dirty 状态 | 真实后端写入、长时间网络抖动和多用户并发 |
| `pnpm proof:release-gates` | 通过 | release 脚本与文档契约 | 真实 DB/shadow/acceptance 运行结果 |
| `pnpm proof:file-size-gate` | 失败 | 已确认模块体积门禁失守 | 不直接证明功能错误 |
| `pnpm audit:boundaries` | 修复后通过 | forbidden 命中为 0，runtime template spread 与 registry freeze 检查通过 | 不替代 runtime、DB 恢复和性能压测 |
| `node packages/server/dist/tools/player-domain-empty-overwrite-guard-smoke.js` | 通过 | 真实 DB 中 7 个玩家分域空覆盖守卫、领悟清理边界和本次最终清理链 | 不证明 starter snapshot 入口与 recovery watermark 全链 |
| `pnpm build:shared` | 通过 | 兑换码协议请求/响应映射、payload shape、protobuf 契约与 shared 边界 | 不证明真实 tick 排队和 DB 发奖 |
| 兑换码与网关 compiled 专项 smoke | 通过 | `requestId` 端到端传递、成功/失败终态、队列重试幂等、单次 delta 和当前命令路由 | 不证明真实 DB 兑换码领取与全量协议审计 |
| 离线收益刷新 compiled smoke 与客户端状态 proof | 通过 | 乱序回包逐条关联、客户端只接收最新代际、换绑后拒绝旧玩家结果、主动首包兼容 | 不证明真实 DB 在长时间抖动下的响应分布与本机存储配额 |
| `pnpm audit:protocol` | 通过 | 无库主线服务实际启动、18 类场景的 C2S/S2C 事件覆盖与逐包字节统计；关闭 drain 完成 | 无数据库，因此未运行兑换码 DB 用例；也不直接证明 5000 并发带宽和压测结果 |
