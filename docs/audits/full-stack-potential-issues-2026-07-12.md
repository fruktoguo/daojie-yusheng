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
| 地图渲染、相机、命中与资源释放 | 进行中 | map render lifecycle、spatial cache proof 通过；Pixi 拥挤遮挡、威胁箭头身份/视口和帧时钟边界已有动态与源码 proof | 动态检查移动端触控与大视口性能 |
| shared 类型、协议与 protobuf | 进行中 | shared build 与协议审计通过；兑换码和离线收益主动刷新 C2S/S2C 已关联 `requestId`；工坊专用面板/任务事件不再复制到空消费 EventBus 字段 | 完成其余大包体的数据流与消费复核 |
| 服务端网络同步、AOI、首包/增量 | 进行中 | `pnpm verify:quick` runtime smoke 通过；网关 action 已验证单次 delta 和兑换终态关联；工坊无效 EventBus 载荷清理后协议总量实测下降 | 逐字段检查其余频率、范围、恢复语义 |
| 服务端 runtime、tick、移动、战斗、交互 | 进行中 | server compile、quick runtime smoke 通过；无库本地主线 18 类 smoke 已完整跑通，怪物战斗/技能/重置夹具已按真实机制校正；宗门队列、资产锁、地图投影与 durable commit 编排边界已从无状态规则和 SQL 中分离 | 继续按 mechanics 文档审查真实调用链、热路径及未被 smoke 覆盖的机制 |
| 持久化、恢复、强事务与关闭 | 进行中 | server compile 通过；边界审计 forbidden 已清零；玩家统计总账回读/flush 已按玩家串行并接入 quick smoke；账号真源及宗门真源在已配置数据库但连接池/初始化失败时均改为 fail-closed；GM 定向玩家修改不再回退整投影写入或全清 dirty domain | 复核其余玩家/实例分域、outbox、恢复围栏；真实 DB 恢复成功路径仍需获准后验证 |
| 配置编辑器、schema、导入发布 | 进行中 | 构建、content-contract、异步代际 smoke 与浏览器乱序回包验证通过 | 继续复核地图保存、schema 与发布入口 |
| 鉴权、权限、GM 高危操作 | 进行中 | 全部 GM controller 已确认受 Guard 保护；改密 token 撤销与启动回读已有 compiled smoke；注册激活 smoke 不再把鉴权要求误判为名称冲突；IP 失败预算和所有 GM 密码入口已统一限流；账号库未就绪会同时阻断 HTTP、GM、Socket 和 readiness；玩家修改未知 section 会被拒绝，已注册操作只写对应 domain | GM 审计 fail-open、高危 scope、GET 密码兼容入口及维护态策略等待产品决定 |
| 错误处理、日志与可观测性 | 进行中 | 已确认 GM 审计写入失败只告警并放行；协议与鉴权 smoke 的假红、跳过和测试替身漂移已分别校正 | 继续检查吞异常、敏感信息、告警与失败水位 |
| 性能、内存、网络包体 | 进行中 | 文件体积门禁只剩 14 个历史 baseline 增幅；本轮发现的无 baseline 新超限已全部拆回阈值内；构建产物仍有大 chunk 警告 | 继续逐个处理 14 个基线增幅，并区分真实热路径问题、门禁误报和冷路径债务 |
| 浅色、深色、手机与触控 | 待检查 | 构建门禁不证明视觉结果 | 需要浏览器级检查 |
| 测试、构建、清理链与边界门禁 | 进行中 | quick/client/release contract/config build、边界审计通过；24 个工具文件的 37 处 Socket.IO 客户端均有 parser 守卫，无库 `verify:release:local` 的 18 类场景通过；鉴权启动和宗门异步 smoke 已修复；GM domain-write 已进入 quick，物品编辑与恢复丹夹具重新对齐当前 domain/模板水合契约 | 继续检查其余持久化夹具清理、DB 分支与失真测试 |

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
- 根本原因：多个运行时、持久化、GM 和客户端面板持续把新职责并回巨型文件；体积门禁当前仍报告 14 个已超限文件继续增长，另有 2 个文件首次超过 3000 行。生成文件和大型 smoke 又与生产模块混在同一口径，增加了噪音。
- 为什么错误：巨型模块扩大冲突面和隐式副作用，难以证明单一职责、事务边界及局部 UI 更新；门禁红灯失去阻止继续膨胀的能力。
- 后果：运行时/持久化改动更容易产生竞态、旧态覆盖、全量刷新或回归遗漏；review 和验证成本持续增加。
- 修复方向：先修正生成物、工具与生产代码的分类口径，再按真实职责拆分当前生产超限模块；不得简单更新 baseline 掩盖增长。
- 当前证据：`pnpm proof:file-size-gate` 仍因 14 个 baseline regression 退出 1；本轮发现的战斗 action、玩家成长、宗门 runtime、GM 玩家服务、协议审计、玩家分域 smoke、背包面板和 Pixi renderer 等无 baseline 新超限均已拆回 3000 行内，当前没有新超限或陈旧 baseline。
- 本轮进展：`world-runtime-combat-action.service.ts` 原先在 3415 行类中同时承载动作编排和约 500 行无状态规范化、目标索引、结果投影及诊断计时辅助；这些逻辑没有服务实例状态或外部调用契约，却扩大了权威编排层的修改面。现已提取为 546 行 `world-runtime-combat-action.helpers.ts`，主服务降到 2955 行并退出 3000 行错误清单；新 helper 同步纳入禁止网络、数据库、文件和 JSON 序列化的战斗热路径边界检查。剩余超限文件仍保持未完成状态，不更新 baseline 掩盖问题。
- 本轮进展：`protocol-audit.ts` 把账号/JWT 辅助和 Markdown 报告投影混在 3135 行主流程中，现提取为 68/87 行两个窄 helper，主文件降到 2953 行并删除旧 baseline；完整 18 类协议审计通过。其余超限文件仍保持未完成状态。
- 本轮进展：`auth-bootstrap-smoke.ts` 的动态导出、自读源码与生成式废注释使文件达到 6668 行，现改为静态导出和三个有类型的函数分类模块，删除无信息注释后降到 6078 行，低于既有 6500 行 baseline；它仍超过 3000 行，后续还需按主线、迁移和持久化证明继续拆分，当前不删除 baseline。
- 本轮进展：`player-domain-persistence-smoke.ts` 把 10 组无库 fake-pool 合同、近 500 行快照夹具和 with-db 编排放在同一文件，现拆为 1007/492 行两个 support 模块，主文件从 3473 行降到 2091 行并退出新超限清单；拆分没有更新 baseline，也没有把 DB 路径的主动跳过记为实库通过。
- 本轮进展：`durable-operation-smoke.ts` 把市场、邮件、钱包、装备和 active job 的 seed/期望夹具继续堆入 with-db 编排，现提取为 1073 行 support 模块，主文件从 5224 行降到 4293 行，回到既有 4724 行 baseline 内；强事务服务本身仍是独立未完成的生产超限项。
- 本轮进展：`player-progression.service.ts` 在权威玩家变更、配置读取和属性重算编排之外，还堆入了约 500 行突破需求、背包计数、功法品阶、灵根归一化和传法速率纯规则。现已提取为窄的 `player-progression-rule.helpers.ts`，主服务降到体积门禁口径的 2815 行并退出新超限清单；配置、玩家变更、属性重算和持久化副作用仍留在权威服务。
- 本轮进展：`world-runtime-sect.service.ts` 把建表/核心投影自愈 SQL、玩家显示/成员/权限归一化与地图资产编排聚合在同一个新超限文件。现已把常量收敛到 `constants/gameplay/sect.ts`，持久化 schema/修复移入 `sect-durable-persistence.ts`，成员与权限辅助收敛到 555 行 domain helper；权威队列、玩家资产锁、地图投影和 durable commit 编排仍留在主服务。主文件在门禁口径为 2926 行，新超限项从 4 个降为 3 个。
- 本轮进展：`native-gm-player.service.ts` 在玩家持久化编排之外还承载模板实例归一化、展示投影、恢复丹映射和全部依赖 port；更严重的是多个定向 GM 操作仍回退整玩家投影。现已把 274 行纯 helper 与 137 行 port 契约独立出来，主服务降到门禁口径 2944 行；同时所有已注册 GM 修改收敛为精确 domain 写入，新超限项从 3 个降为 2 个。
- 本轮进展：`inventory-panel.ts` 把分页列表、物品详情、批量丢弃和阵法布置规则全部聚合在同一面板类中；阵法弹窗独占约 540 行输入联动、共享公式投影、范围预览和提交载荷组装，扩大了普通背包更新的修改面。现已提取 `InventoryFormationDialogController`，继续复用 shared 的 `resolveFormationSetupPlan` 和稳定 `itemInstanceId`，服务端权威结算及面板局部更新语义不变；主面板从 4396 行降到 3838 行。它仍属于 2 个新超限文件之一，后续必须继续拆分详情与批量操作职责，当前不更新 baseline。
- 本轮进展：背包批量丢弃原先在主面板维护打开态、筛选、选中实例和二次确认 4 组状态，并把自己的 render key、库存淘汰和弹窗关闭生命周期混入通用详情弹窗；现已提取 `InventoryBulkDiscardDialogController`，只从当前库存收集仍存在的稳定实例 ID，并在服务端处理前保留二次确认。主面板进一步降到门禁口径 3580 行，但详情/动作规则尚未拆分，仍不更新 baseline。
- 本轮进展：背包单物品的使用、丢弃、摧毁、数量草稿、特殊消耗品提示和二次确认继续占用约 600 行，并把依赖玩家境界/道基/天关的确认文案挂在不含玩家上下文的通用 render key 上；另有约 50 行从未被任何渲染路径调用的功法书概要投影。现已提取 `InventoryItemActionDialogController` 与纯状态对象，删除不可达投影，主面板降到门禁口径 2984 行并退出新超限清单；特殊确认按玩家上下文 revision 失效，普通数量输入不受无关增量打断。当前唯一新超限文件为 Pixi renderer，FS-002 仍未完成。
- 本轮进展：Pixi renderer 的地形静态签名、动态覆盖签名和望气数值投影原本混在主适配器中，且失效域与实际绘制字段不一致。现已提取 90 行 `pixi-terrain-cache-signatures.ts`，主文件降到门禁口径 3729 行；该文件仍是唯一新超限项，后续必须继续拆出 profiling/资源职责，当前不建立 baseline。
- 本轮进展：Pixi profiling 的状态、窗口、全局调试句柄和帧样本聚合原本全部挂在渲染 adapter 上，且关闭诊断时仍在每帧创建测量闭包和 schedule 对象。现已提取 `PixiRenderProfiler` 并改为无闭包时间戳上报；主文件降到门禁口径约 3572 行，仍需继续拆出纯渲染 primitive 才能退出唯一新超限清单。
- 本轮进展：Pixi adapter 中剩余的内部场景类型、纯视觉规则和运行时图包清单归一化分别提取到 144/317/209 行模块；adapter 只保留 Pixi 场景拥有权、资源加载、分块绘制、实体/特效更新和生命周期编排，拆分时门禁口径降到 2971 行。后续加入拥挤/威胁箭头热路径修复后当前为 2987 行，仍低于硬阈值；唯一新超限已清零，未建立或扩大任何 baseline。

### FS-003 `[ ]` server tools 大量绕过 TypeScript 检查并保留 CommonJS 写法

- 严重级别：高。
- 根本原因：历史 smoke/proof/tool 以编译后 JavaScript 形态回填到 `.ts`，169 个文件带 `@ts-nocheck`，其中 144 个 `.ts` 文件仍含 CommonJS `require/module.exports/exports` 写法。
- 为什么错误：这些验证脚本本应用来证明生产契约，却绕过类型检查；接口漂移可能直到运行 smoke 才暴露，未进入默认 suite 的脚本甚至会长期失真，同时违反项目 TypeScript 红线。
- 后果：门禁产生假阳性，重构调用签名后旧 smoke 可能静默失效，关键恢复/资产测试的可信度下降。
- 修复方向：按稳定 suite 与高风险资产/恢复脚本优先，逐组迁移为规范 TypeScript import/export 并移除抑制；每组运行实际 compiled smoke 后原子提交。
- 本轮进展：`player-runtime-dirty-domain-smoke.ts`、`protocol-audit.ts`、`auth-bootstrap-smoke.ts` 及后者三个 support 模块、`world-gateway-inventory-helper-smoke.ts` 已移除 `@ts-nocheck` 并重新进入 server compile；协议审计、鉴权启动、宗门虚拟边界和背包网关 smoke 的 CommonJS 入口已迁移为标准 import/export。当前剩余 161 个 `@ts-nocheck`，含 CommonJS 的 `.ts` 文件降为 137 个。

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

### FS-019 `[x]` 玩家统计总账回读与异步落盘竞态会少算或重复计算

- 严重级别：高。
- 根本原因：`loadPlayerStatisticTotals` 从数据库 SELECT 后直接覆盖 `playerStatisticPersistedDayTotalsByPlayerId`，`flushPendingPlayerStatisticLedger` 则在独立异步链中先对数据库做原子累加，再把同一增量从 runtime map 转移到 persisted map；两条链只分别保证自身顺序，没有同玩家 I/O 串行边界。
- 为什么错误：页面总账由“数据库基线 + 尚未落盘的 runtime 增量”组成，同一笔增量在任意时刻必须只属于一侧。若旧 SELECT 在 flush 转移后落地，会覆盖刚合入的持久缓存并少算；若 SELECT 已读到 flush 后的数据库值、却先于 flush 的内存续段落地，续段会再次叠加同一增量并多算。
- 触发条件：玩家上线 Bootstrap 回读今日/昨日/本周总账时，恰好有 tick 或资产操作触发的 `setTimeout(0)` 总账增量落盘；数据库连接池调度让 SELECT 与事务增量交错完成。
- 后果：设置面板显示的灵石、成长、功法或技艺收支会暂时少一笔或多一笔，后续 `totalsPatch` 又以错误缓存作为上次基线，可能继续覆盖客户端正确值；玩家会据此误判收益或损耗。数据库原子总值仍正确，但运行态投影和浏览器缓存不可信。
- 修复方式：新增按 `playerId` 分片的 `PlayerStatisticLedgerIoQueue`，只串行同一玩家的数据库总账回读与增量落盘；不同玩家仍可并行，tick 内同步累计也不等待数据库。flush 的失败回填、重试调度和 runtime→persisted 转移保持在同一串行区间内。
- 验证：修复前新增 compiled smoke 稳定失败于“回读未完成时已启动增量落盘（1 !== 0）”；修复后 `player-statistic-ledger-io-smoke` 的 load-first 与 flush-first 两种交错均通过，确认数据库 100 基线与运行时 10 增量最终始终为 110，且同一增量只合并一次；另证明不同玩家可并行、单次失败会释放队列。该 smoke 已接入稳定套件、玩家持久化恢复组，`pnpm verify:quick` 已实际通过。

### FS-020 `[x]` 玩家脏域 smoke 仍断言废弃的局部 revision 并脱离默认门禁

- 严重级别：中。
- 根本原因：自动用药、自动战斗技能和日志本直写 smoke 仍假设 `versionSeed === player.persistentRevision === 2`；生产持久化已改为 `nextPlayerPersistenceVersion()` 生成进程内单调的时间版本，以便 recovery watermark 拒绝迟到写。`@ts-nocheck` 又掩盖了 `markPersisted` 兼容无参数全清语义与推断签名不一致，且该 smoke 没有注册到稳定套件。
- 为什么错误：`versionSeed` 是跨异步写的持久化围栏，不是玩家对象的局部修改次数；把实现锁死为 `2` 会在正确的防旧写升级后必然失败。更严重的是脚本在第一个断言就退出，后面几十个 dirty domain、wallet 真源和快照回退断言从未执行。
- 后果：维护者可能误判当前脏域实现错误，或因脚本不在默认门禁而长期不知道它已经失真；真正的域遗漏、全快照回退和直写版本缺失也失去回归保护。
- 修复方式：三处断言改为校验正的安全整数版本，保留“必须传 fencing 版本”的契约而不绑定具体时间值；为 `markPersisted` 补齐与现有无参数兼容语义一致的可选参数类型，移除 smoke 的 `@ts-nocheck`。将用例注册到稳定套件、玩家持久化恢复组及 `verify:quick`。
- 验证：移除抑制后 server compile 首次真实暴露 32 个 `markPersisted` 参数错误；修正公共签名后 compile 通过，compiled `player-runtime-dirty-domain-smoke` 完整跑到底并通过，证明列出的脏域和钱包真源契约仍成立；注册后的 `pnpm verify:quick` 已实际运行该 case 并通过。

### FS-021 `[x]` 工坊静态目录被重复下发并复制进聚合 envelope

- 严重级别：高。
- 根本原因：客户端虽然会把 `knownCatalogVersion` 发给服务端，但 `openAlchemy()` / `openForging()` 每次打开前都强制把版本清零，服务端的目录省略契约因此永远无法在真实 UI 重开时生效。炼丹和炼器又共用一份目录数组及版本号，直接去掉清零会让相同版本号的两类不同目录互相冒充。运行时 patch 还只带 `catalogVersion`；若把“看见版本号”误当成“持有目录”，客户端会在目录为空时要求服务端省略目录。服务端侧，装备和卸装会刷新全部技艺面板；无活跃 job 时 `emitCraftPanelUpdate()` 复用了用户显式请求的完整载荷构造器，于是炼丹、炼器静态目录既直接发送一次，又通过 EventBus `panelPatch` 被复制进下一次 `SyncEnvelope`。
- 为什么错误：静态目录属于低频详情层，只应在客户端确实缺少对应版本时下发；装备变化只需要刷新工具、预设和 job 状态，不能把几十 KB 不变内容同时塞进直发面板和聚合增量。版本号也不是目录所有权证明，必须与已接收的真实内容快照绑定。
- 触发条件：玩家每次打开炼丹或炼器；任意装备/卸装导致全部技艺面板刷新；战斗、制作等流程中发生相同装备变化；或在仅收到运行态 patch 后再次打开面板。
- 后果：修复前协议审计中一次装备直接产生 `15.35KB` 炼丹面板、`48.38KB` 炼器面板和 `67.21KB` 聚合 envelope，连同强化面板约 `132KB`，且面板未打开也会发送；17 个 `AlchemyPanel` 合计 `322.47KB`。按生产 `30Mbps` 出口，约 28 次/秒的此类装备操作就足以占满理论带宽，尚未计算 Socket.IO/TCP 开销和其他玩家同步。若只删除客户端清零而不修缓存语义，还会出现炼丹/炼器目录串型或空目录。
- 修复方式：新增按 `alchemy` / `forging` 隔离的会话目录缓存；只有实际收到目录数组才记录可上报版本，同版本状态 patch 保留缓存，新版本无目录 patch 则使旧缓存失效，会话清理统一释放。打开和外部状态重查都只读取对应类型的真实缓存版本。服务端新增主动刷新专用构造入口：炼丹/炼器用当前目录版本生成完整状态但省略静态目录，活跃 job 继续走原有小 patch；用户显式请求仍在首次缺少目录时正常返回目录，断线重连和首包恢复语义不变。
- 验证：`pnpm verify:client`、server compile、compiled `world-runtime-craft-mutation-smoke` 与 `pnpm audit:protocol` 均通过。客户端动态 proof 覆盖两类目录同版本隔离、仅版本 patch 不建立假缓存、新版本失效、深克隆和会话清理。新协议报告中装备后的两条面板降为 `692B + 665B`，对应 `SyncEnvelope` 降为 `4.72KB`；17 个 `AlchemyPanel` 总量降至 `28.83KB`（减少约 91%）。首次显式炼丹目录请求仍为 `15.35KB`，同版本后续请求为 `692B`，证明按需首包与运行态小包已正确分层。

### FS-022 `[x]` 统一技艺完成度 proof 绑定旧实现且未进入默认门禁

- 严重级别：中。
- 根本原因：`technique-activity-completion-proof` 用源码正则要求四个权威入口直接 `return this.pipeline.*(...)`，但生产入口已在 pipeline 返回后补记玩家技艺/资产统计，再返回同一结果；队列写入也已从 facade 内直接赋值收敛到 `enqueuePlayerTechniqueActivityQueueItem → setPlayerTechniqueActivityQueue`。proof 仍锁定旧代码形状，并且没有注册到 stable smoke suite 或 `verify:quick`。
- 为什么错误：架构门禁应证明生命周期和职责边界，不能要求删除正确的统计副作用或把队列写入重新卷回 facade。未接入默认门禁又使该脚本失效后长期无人感知；只有本轮手动独立运行才在第一个旧正则处退出，后续 strategy、world tick、取消入口、队列、任务视图和 panel patch 断言都没有执行。
- 触发条件：任何维护者独立运行该 proof；或后续真实回归发生但日常只执行 `verify:quick`。
- 后果：正确代码会被误报，维护者可能为“修测试”而删掉统计记账；同时统一技艺 job 可能绕过 pipeline、回写 legacy `queuedJobs`、丢失公共取消入口或退回大面板载荷，而默认快速门禁仍然为绿。
- 修复方式：按方法边界提取 `start/cancel/interrupt/tick` 源码段，逐项锁定“初始化 → 建立统计基线 → 调用对应 pipeline → 统计结算 → 返回”的有序链和未注册 kind fallback；队列断言改为同时验证 facade 委托、统一 helper 和唯一 `techniqueActivityQueue` setter。将 proof 注册为 `technique-activity-completion` stable case，并加入 `verify:quick`。
- 验证：修复前 compiled proof 先失败于旧的直接 return 断言，更新后又真实暴露第二处旧的 facade 赋值断言；两处按当前权威链修正后 compiled proof 完整跑到底并通过。注册后的 `pnpm verify:quick` 实际执行该 case 并通过，同时 server compile、生产边界和原有快速 smoke 均保持通过。

### FS-023 `[x]` 工坊已下发状态又进入客户端空消费的 EventBus 通道

- 严重级别：高。
- 根本原因：`emitCraftPanelUpdate()` 先通过专用 `AlchemyPanel` / `EnhancementPanel` 事件发出完整面板载荷，随后又把同一对象作为通用 `PanelPatch` 写入 `eventBus.panelPatches`。每息技艺 tick 也在已发 `TechniqueActivityTasks` 和专用面板 patch 后，再计算一份 `jobProgress`。客户端两个分支最终分别进入空的 `applyPanelPatch()` / `applyJobProgress()`，真实 UI 只消费专用事件。
- 为什么错误：同一状态不能因为存在“未来可能统一”的协议脚手架就在两条生产通道发送。更严重的是工坊载荷并不符合 `PanelPatch` 声明的 `added/updated/removed` 结构；当前只因调用链大量使用 `any` 而逃过类型检查，即使日后接通通用消费器也不能正确合并。
- 触发条件：装备/卸装刷新三个工坊面板；炼丹、炼器或强化任务每息推进；任务开始、取消和完成。
- 后果：服务端多做对象构建、Map 合并、drain 和序列化，客户端多做包解码与延迟队列调度，却没有任何界面效果。修复前协议审计中，首次装备后的聚合包约 `4.81KB`；活跃炼丹/强化多个每息聚合包为 `1.90–2.14KB`，该成本会按同时在线制作玩家线性增长。
- 修复方式：工坊面板继续使用已有完整生产消费链的专用事件，删除之后的 `queuePlayerPanelPatch` 复制入队；统一任务列表仍作为 job 进度真实展示源，删除 tick 中第二份 `jobProgress` 计算和入队。保留 EventBus 的通知和 AOI 表现等真实生产通道，也不删除通用 API 的独立能力测试；玩家状态增量另经 FS-024 完整复核。
- 验证：server compile、compiled `world-runtime-craft-mutation-smoke` 和纳入 `verify:quick` 的 `technique-activity-completion` proof 均通过；proof 锁定生产工坊链不得再调用两个无效入队 API。无库协议审计全部通过，`SyncEnvelope` 总量从 `110 / 185.57KB` 降至 `107 / 162.14KB`；首次装备后的聚合包从 `4.81KB` 降至 `1.83KB`，炼丹/强化每息样本由 `1.90–2.14KB` 降至 `443–665B`，专用面板和任务事件次数、包体保持不变。

### FS-024 `[x]` 无版本 EventBus 状态增量与 SelfDelta 双重写入且字段契约失真

- 严重级别：高。
- 根本原因：玩家 tick 每息都快照 `player.hp/mp/exp/level`，但当前权威玩家字段是 `hp/qi/combatExp/foundation`，后三个别名在运行时对象上不存在，因此从不会产生增量。Buff tick 结果只返回 `changed/listChanged/vitalsChanged` 等标记，原发射器却读取不存在的 `added/removed`。唯一真实会入队的 `hp` 又已由带 `selfRevision` 的 `SelfDelta` 同步。
- 为什么错误：`SelfDelta` 是高频自身状态权威层，`PanelDelta.attr/buff` 分别承载特殊数值与 Buff patch；再用无 revision 的 EventBus 对同一客户端 `PlayerState` 就地赋值，会制造第二个时序真源。而且 EventBus 被故意延后到 `requestAnimationFrame` 批处理，不具备 SelfDelta 的缓存版本比较。
- 触发条件：玩家每息恢复气血，Buff 持续伤害或持续消耗修改气血；在旧 EventBus 副作用尚未刷新时，下一息战斗或其他权威逻辑又通过 SelfDelta 更新气血。
- 后果：旧副作用可在新 SelfDelta 之后把 HUD 和 React bridge 的气血回滚到上息值，直到下一次气血变化才自愈；灵力、战斗经验、根基和 Buff 增量则看似已设计，实际从未工作。即使玩家没有数值变化，5000 玩家每息也都承担四次无效字段快照、计时和分支调用。
- 修复方式：删除玩家 tick 的无效快照、`emitPlayerStateDeltaIfChanged` 与对应 GM 性能指标；客户端不再向 EventBus consumer 提供 `applyStateDelta`，并删除会就地覆盖玩家对象的 handler 及其无效依赖。气血/灵力继续只由 `SelfDelta`落地，根基/战斗经验和 Buff 继续只由 `PanelDelta` 合并。
- 验证：已完整对照 tick、AOI、属性、灵力和 Buff mechanics 文档；完整 `pnpm verify:quick` 与 `pnpm verify:client` 均通过。前后端 production-boundaries 新门禁同时锁定生产 player runtime 无 `queuePlayerStateDelta`、`SelfDelta` 继续比较 `hp/qi`、`PanelDelta` 继续发 Buff 增删，以及 EventBus 不得回写玩家真源。协议审计通过，在包数从 107 波动到 109 的情况下，`SyncEnvelope` 总量仍从 `162.14KB` 降至 `158.45KB`；两组装备刷新后的聚合包由 `2.63/2.99KB` 降至 `675/569B`。

### FS-025 `[x]` 背包货币投影变化未稳定推进 SelfDelta 修订

- 严重级别：中。
- 根本原因：灵石的资产真源已经收敛到 `inventory.items`，`player.wallet.balances` 只是兼容投影；但原 `syncWalletCacheFromInventory` 只改投影且不返回变化结果。`creditWallet/debitWallet` 两个专用入口在调用后手工递增 `selfRevision`，`grantItem/receiveInventoryItem/consumeInventoryItem/replaceInventoryItems` 等通用背包入口没有递增；境界突破等成长逻辑和统一技艺结算还会直接改背包，连 wallet 投影本身都没有刷新。
- 为什么错误：wallet 位于 `SelfDelta`，而 `buildSelfDelta` 首先以 `selfRevision` 作发送闸门。客户端又按 inventory 与 wallet 两个同源投影的较大值展示持有量；当扣减后的 inventory 小于旧 wallet 时，旧投影会反过来遮住已经正确下发的背包数量。
- 触发条件：任务、邮件、掉落、兑换或 GM 等链路通过通用入包/扣包方法增减灵石；突破材料直接消耗灵石；统一技艺直接产生或消耗被登记为钱包资源的背包物品。
- 后果：灵石资产真源和持久化结果仍正确，但客户端可能长期显示旧余额、错误放开制作或购买按钮，随后又被服务端以余额不足拒绝。通用入口已刷新缓存但漏 revision 时，要等下一次无关自身状态变化才补发；成长/技艺入口连缓存都未刷新时，其他 SelfDelta 也会继续携带旧 wallet。
- 修复方式：新增统一 `refreshWalletCacheFromInventory` 边界，由底层同步函数精确返回变化、合并重复镜像并清理灵石的旧冻结值；只有 wallet 真变化才递增 `selfRevision`。全部通用背包入口改走该边界，新玩家初始背包、水合、成长结果的 inventory 脏域及技艺 `finalizeMutation` 也统一刷新；删除 `creditWallet/debitWallet` 的重复手工 bump，普通物品变化不产生额外 SelfDelta。
- 验证：对照背包与存储 mechanics 文档；完整 `pnpm verify:quick` 通过。compiled `player-runtime-dirty-domain-smoke` 直接调用 `buildSelfDelta`，证明通用灵石发放会携带最新 wallet，并覆盖通用收取、专用增减、成长直接扣包以及普通物品不 bump 的反例；production-boundaries 锁定成长与技艺直接改背包后的刷新边界。受接口扩展影响的 `technique-equipment-effectiveness`、`enhancement-equipped-target-guard`、`world-runtime-alchemy`、`world-runtime-enhancement` 四个 compiled smoke 补齐 mock 后均通过。

### FS-026 `[x]` 制作持久化 smoke 混淆全局 fencing 版本且未接入门禁

- 严重级别：中。
- 根本原因：`craft-persistence-dirty-domain-smoke` 把 `nextPlayerPersistenceVersion()` 生成的进程内单调 fencing seed 错当成玩家对象的局部 `persistentRevision`，硬断言二者相等；脚本又未注册到 stable smoke suite 或任何常用验证入口。
- 为什么错误：`versionSeed` 必须跨同毫秒、多业务写保持全局单调，数值通常接近当前毫秒时间，不可能等于测试里重置为 `1/2` 的本地 revision。测试在炼丹 tick 的首个持久化断言就退出，后续逐批扣料、强化 wallet、`enhancement_record`、active job 清理和唯一 job version 实现检查都没有执行；未接入门禁又让这种失效长期不可见。
- 触发条件：单独运行该 compiled smoke；或者未来代码变更依赖它证明制作 dirty-domain 与直写 fencing 契约。
- 后果：手动运行稳定假红，但日常门禁仍假绿；关键制作资产/任务持久化回归失去有效证明，开发者可能误以为脚本后半段已覆盖。
- 修复方式：统一校验每个 `versionSeed` 是正的安全整数，不再绑定玩家局部 revision，也不固化不同持久化域的调用顺序；补齐 FS-025 新增的 wallet 刷新 mock。将脚本注册为 `craft-persistence-dirty-domain` stable standalone case，加入持久化分组和 `verify:quick`。
- 验证：完整 `pnpm verify:quick` 通过，门禁输出明确选中并通过 `craft-persistence-dirty-domain`；脚本完整运行到最终输出，证明修正后的版本断言与后半段制作持久化检查均实际执行。

### FS-027 `[x]` 背包实例引用 smoke 未等待异步资产互斥且脱离门禁

- 严重级别：中。
- 根本原因：地面单件/批量丢弃在引入玩家资产互斥和地面来源互斥后改为异步 `Promise` 链，`inventory-item-instance-ref-smoke` 仍按旧同步契约调用并立即断言；该脚本只有独立 package 命令，没有注册到 stable smoke suite 或常用门禁。
- 为什么错误：资产互斥回调在微任务中执行，未 `await` 时 `dropped` 仍为空，测试会在生产逻辑真正运行前固定失败。首个失败又会让后续批量丢弃、装备、强化、市场出售、阵法和排序引用检查全部跳过，不能据此判断 `itemInstanceId` 链路是否正确。
- 触发条件：单独运行 `inventory-item-instance-ref-smoke`；或者资产互斥实现让回调不再同步开始。
- 后果：手动 smoke 假红，而日常快速门禁对此完全无感；背包重排后按实例 ID 操作错误物品、强化错件或市场错卖等高价值资产回归缺少持续证明。
- 修复方式：把单件与批量丢弃用例改为异步函数，逐层 `await` 权威操作后再断言，并由 `main` 等待完成。注册 `inventory-item-instance-ref` stable standalone case，并纳入 `verify:quick`。
- 验证：完整 `pnpm verify:quick` 通过，stable runner 明确选中并通过 `inventory-item-instance-ref`；整支脚本运行到末尾，证明重排后的使用、单件/批量丢弃、装备、强化、市场出售、阵法及排序均按稳定实例 ID 命中。

### FS-028 `[x]` GM 改密后旧 token 不会立即撤销且重启后可重新生效

- 严重级别：高。
- 根本原因：`changePassword` 只把新密码记录写入数据库，没有替换 `RuntimeGmAuthService.memoryRecord`；`onModuleInit` 只建表并标记持久化可用，没有回读当前记录。token 校验又只在 `memoryRecord` 存在时比较 payload 的 `rev`。此外登录、改密与数据库恢复后的回读可以并发，较晚完成的旧登录会把旧记录重新写回内存。
- 为什么错误：`rev` 是改密撤销已签发 GM token 的唯一版本围栏。数据库已经提交新密码时，内存仍保留旧 `rev` 会继续接受旧 token；进程重启后内存为空，比较被完全跳过。异步 scrypt 和数据库查询未串行时，即使单次改密更新了内存，旧登录也可能随后覆盖它。
- 触发条件：GM 修改密码后未再用新密码登录；改密后重启服务；登录与改密并发；数据库恢复回读与登录/改密重叠。
- 后果：本应撤销的旧 GM 凭据可继续拥有数据库恢复/清理、密钥、环境变量和服务重启等全部能力，最长持续到 12 小时 token TTL；重启还可能让已经失效的 token 再次通过，扩大泄露凭据的利用窗口。
- 修复方式：GM 持久化初始化时回读当前密码记录；改密数据库提交成功后立即原子替换内存记录；用服务内串行队列统一登录、改密和恢复回读，失败也释放队列，杜绝异步旧记录回写。
- 验证：完整 `pnpm verify:quick` 通过，stable runner 明确选中并通过 `gm-auth-token-revocation`；compiled smoke 覆盖改密即时 `rev_mismatch`、旧密码拒绝、登录/改密互斥及重启回读。既有 compiled `registration-activation-smoke` 也通过，GM 密码验证兼容入口未回归。

### FS-029 `[x]` 客户端可伪造代理链首地址绕过认证限流并污染 GM 审计 IP

- 严重级别：高。
- 根本原因：生产 Nginx 使用 `$proxy_add_x_forwarded_for`，会保留客户端传入的 `X-Forwarded-For` 并在右侧追加真实连接地址；`resolveNativeRequestIp` 在直连来源属于可信代理时却固定读取列表第一项，没有验证中间代理链。
- 为什么错误：`X-Forwarded-For` 的左侧内容可能由客户端自行提供，只有从服务端一侧向左逐跳剥离已配置可信代理，遇到的第一个非可信地址才能作为来源。直接信任链首把“代理传来的头”错误等同于“代理验证过的头”。
- 触发条件：攻击者请求携带自定义 `X-Forwarded-For`，再经过当前 Nginx 反向代理；服务端直连地址命中默认 RFC1918/loopback 或显式可信代理配置。
- 后果：攻击者可为每次失败登录伪造不同 IP，绕过 `NativeAuthRateLimitService` 的 IP 维度；注册与登录 IP、GM actor 审计记录也会写入攻击者选择的地址，削弱异常追踪和账号关联判断。
- 修复方式：解析全部合法转发地址，从最靠近服务端的右侧开始跳过可信代理，返回第一个非可信来源；只有整条链均可信时才回退最左地址。保留 `SERVER_TRUST_PROXY=1` 的显式全信任兼容语义，未命中可信直连时仍完全忽略代理头。
- 验证：当前编译产物已复现 `198.51.100.99, 203.0.113.55` 被错误解析为攻击者提供的首地址；完整 `pnpm verify:quick` 通过，stable runner 明确选中并通过 `native-request-ip`，覆盖伪造链首、多级可信代理、直连忽略头部以及显式关闭/全信任语义。

### FS-030 `[x]` 服务端 Socket.IO smoke 未使用生产 msgpack parser

- 严重级别：高（验证真实性）。
- 根本原因：生产 Socket.IO 服务使用 `socket.io-msgpack-parser`，24 个工具文件中的 37 处 `io(...)` 客户端仍使用默认 parser；工具代码没有统一创建入口，现有生产边界检查也没有校验两端 parser 契约。
- 为什么错误：Socket.IO 自定义 parser 是双端协议的一部分，不能只在服务端启用。默认 parser 无法可靠解释生产端的 msgpack 帧，连接即使建立，事件也可能解析失败或得到与真实客户端不同的载荷。
- 触发条件：运行任何通过 Socket.IO 连接真实编译服务的 smoke、protocol audit、首包 bench、关闭路径或调试工具。
- 后果：主线 smoke 会假红、漏收事件或挂到超时；更危险的是开发者可能为迁就错误夹具去修改正确的生产协议，使 release 门禁不能代表客户端真实连接方式。
- 修复方式：为全部 37 个客户端显式配置同一 `msgpackParser`；在递归 production-boundaries 中统计每个 `io(...)` 调用并要求 parser 数量完全一致，防止新工具再次漏配。
- 验证：`pnpm --filter @mud/server compile` 通过；`check-production-boundaries` 报告 24 个工具文件、37 处 Socket.IO 调用全部覆盖；无库 `pnpm verify:release:local` 的 18 类稳定场景全部通过。

### FS-031 `[x]` smoke 只监听拆分 delta，忽略生产 `SyncEnvelope`

- 严重级别：高（验证真实性）。
- 根本原因：生产同步会把 `WorldDelta`、`SelfDelta`、`PanelDelta` 合并进 `S2C.SyncEnvelope`，多个 smoke 仍只监听历史拆分事件；各脚本还分别手写 Buffer/JSON 解码，未复用 shared 的事件 payload 解码契约。
- 为什么错误：承载层合并不改变业务 delta 语义，但只监听旧事件会把“服务端正确发在 envelope 中”误判为“没有发”；直接断言原始 Buffer 还会把编码差异误判为业务字段缺失。
- 触发条件：服务端在拥塞控制或批量同步路径发送 `SyncEnvelope`，尤其是 progression、combat、loot、GM、持久化和怪物场景等待增量时。
- 后果：功能正常却稳定超时或假红；release 门禁无法覆盖当前生产同步主线，也可能掩盖 envelope 内真实字段回归。
- 修复方式：在 `smoke-payload.ts` 提供统一 `bindSmokeSyncEvents`，同时订阅拆分事件和 envelope，使用 `decodeServerEventPayload` 解码后按 `w/s/p` 路由；迁移所有有 delta 断言的 smoke，并新增“直接监听拆分 delta 必须同时支持 envelope”的边界守卫。
- 验证：production-boundaries 的直接消费者检查通过；combat、loot、progression、GM、持久化、怪物及玩家恢复/复活场景均在完整无库 release 套件中通过。

### FS-032 `[x]` 注册 smoke 把激活码要求误判为账号冲突并重试到限流

- 严重级别：中（验证真实性与环境稳定性）。
- 根本原因：同一来源注册过账号后，后续注册需要激活码；公共 smoke 注册助手既不提供激活码，又用包含“账号”等宽泛文本和任意注册 500 错误判断名称冲突，因而把 `REGISTRATION_ACTIVATION_REQUIRED` 当成可换名重试的问题。
- 为什么错误：激活码是来源注册策略，不会因更换用户名、角色名或显示名而消失；重复提交只会累加认证失败计数。把鉴权要求归类为唯一性冲突违反了错误码语义。
- 触发条件：一组 smoke 在同一 server/来源地址上依次创建两个以上玩家，或持久环境已有该来源的注册记录。
- 后果：后续场景循环换名仍失败，最终触发 429；整组 release smoke 假红，并向持久环境制造无意义注册尝试。
- 修复方式：每次 suite、每个 case 生成隔离的 64 个 smoke 专用单次激活码，同时注入服务端允许集合和仅由 smoke helper 消费的变量；冲突分类明确排除 `REGISTRATION_ACTIVATION_REQUIRED`，只重试真实账号/角色/显示名重复。
- 验证：无库 `verify:release:local` 连续执行 18 类场景均完成注册和清理；auth-bootstrap、GM、redeem 场景正常退出，未再出现激活要求被换名重试或 429。

### FS-033 `[x]` progression smoke 的 Socket 生命周期存在抢跑与失败泄漏

- 严重级别：中（验证稳定性）。
- 根本原因：socket 按默认 `autoConnect: true` 创建，连接过程可能在事件监听和 `Hello` 初始化前开始；连接成功/失败/超时监听没有统一清理，异常路径也不保证关闭活跃 socket。
- 为什么错误：测试必须先建立完整观察面再触发被测流程。连接抢跑会漏掉初始化事件，遗留监听或 socket 则会让失败用例继续持有句柄、污染后续清理和套件退出。
- 触发条件：本机连接建立很快、连接失败后重试、任一 progression 中间断言抛错或套件连续运行。
- 后果：`playerId/sessionId` 偶发为空、用例超时而非给出真实功能结果，失败进程迟迟不退出，后续用例还可能受到残留会话影响。
- 修复方式：改为 `autoConnect: false`，装好全部监听后显式 `connect()`；连接成功、失败和超时共用一次性 cleanup，最终清理无条件移除监听并关闭活跃 socket。
- 验证：重新编译后聚焦 `progression` stable case 通过并正常退出；完整无库 release 套件也通过该场景。

### FS-034 `[x]` progression smoke 把同 tick 灵气自然流转误判为注入失败

- 严重级别：中（验证真实性）。
- 根本原因：用例要求地块灵气严格等于 `auraBefore + 100`，但 GM 注入命令结算后同一 1Hz tick 仍会推进地块灵气自然流转；断言忽略了机制文档规定的 tick 副作用。
- 为什么错误：比较浮点严格相等且假设命令是该 tick 唯一写入者，与真实权威运行时不符。实际完整注入后观测值可为约 `99.9992`，并非少发奖励。
- 触发条件：注入后等待状态期间跨过一次灵气自然流转，或浮点运算产生小数误差。
- 后果：正确的 progression 链被判失败；若为迎合测试停掉自然流转，反而会破坏真实玩法。
- 修复方式：保留消耗灵石与灵气增加的双重证明，将阈值改为至少增加 99 点，只容纳最多 1 点同 tick 流转误差，仍能抓住未完整注入 100 点的明显回归。
- 验证：收紧后的聚焦 `progression` case 通过，最终地块灵气为 `99.9991977`，所有学习、属性、装备、修炼、治疗、Buff、地图解锁和灵石消费 patch 同时通过。

### FS-035 `[x]` loot smoke 仍按易变背包槽位发送物品引用

- 严重级别：中（验证真实性）。
- 根本原因：生产背包操作已经以稳定 `itemInstanceId` 为权威引用，loot smoke 仍从数组位置构造废弃的 `slotIndex` 请求，和当前协议及背包重排语义脱节。
- 为什么错误：数组槽位是客户端展示投影，会随拾取、合并、排序和删除变化，不能唯一标识玩家资产；测试使用废弃字段无法证明生产客户端真实发送的路径。
- 触发条件：loot 场景使用或丢弃拾取物，尤其在背包已经重排或服务端不再接受 `slotIndex` 时。
- 后果：正常的稳定引用实现被测试判失败；或测试假绿但生产的 `itemInstanceId` 路径完全未覆盖，错用/错丢资产风险不可见。
- 修复方式：从背包结果读取目标物品的 `itemInstanceId`，只发送当前 `itemRef` 契约，不再依赖槽位。
- 验证：聚焦 loot smoke 与完整无库 release 套件均通过；此前接入门禁的 `inventory-item-instance-ref` 继续证明重排后的全套资产操作。

### FS-036 `[x]` 怪物战斗与技能 smoke 的准备阶段会污染被测状态

- 严重级别：中（验证真实性）。
- 根本原因：用例先把玩家放到怪物身边再学习技能、调整属性和关闭自动战斗；准备期间怪物会真实攻击玩家，打断技能领悟，并提前消耗目标的灵力、冷却、仇恨与生命。技能用例还固定选择 `m_swamp_lizard`，其现有数值无法支付任一配置技能的真实灵力成本。
- 为什么错误：被测窗口开始前，玩家和目标必须处于可解释的初始状态。让权威 tick 在夹具准备期间推进战斗，会把“准备被打断/资源已消耗”误判为“战斗或技能逻辑失效”；选择机制上不可能施法的目标也无法证明施法链。
- 触发条件：怪物在玩家准备期间进入仇恨范围；目标提前普攻/施法；固定怪物技能成本高于其最大灵力；并行 tick 恰好跨过准备步骤。
- 后果：领悟、仇恨、技能冷却和伤害断言随机失败，错误诊断指向生产战斗逻辑；真实回归与夹具污染混在一起，结果不可复现。
- 修复方式：先在安全城镇完成学习、属性与自动战斗设置，再选择存活、满血、无仇恨、无冷却且付得起远程技能成本的新鲜怪物并传送到附近；monster-skill 默认改用 `ancient_ruins` 的可施法候选，同时保留 D-009 对不可施法内容的独立归档。
- 验证：聚焦 monster-combat 和 monster-skill 均通过；完整无库 release 套件中的 monster runtime/combat/AI/skill/reset/loot 六类场景全部通过。

### FS-037 `[x]` monster-reset smoke 选择运行时不会恢复生命的目标

- 严重级别：中（验证真实性）。
- 根本原因：用例只要求 `hpRegenRate > 0`，生产恢复逻辑却按 `Math.round(hpRegenRate)` 结算；介于 0 和 0.5 的正数在运行时每 tick 实际恢复 0，仍会被测试选为目标。
- 为什么错误：测试候选条件必须与生产消费公式一致。检查原始浮点正数无法证明取整后的有效恢复量，等待该目标回血必然超时。
- 触发条件：场景中首个空闲、存活怪物的 `hpRegenRate` 为正但四舍五入为 0。
- 后果：怪物重置机制正常却固定假红；开发者可能错误修改恢复公式或内容数值来迁就测试。
- 修复方式：候选谓词与运行时统一为 `Math.round(hpRegenRate) > 0`，同时要求目标空闲、存活且可扣减至少 1 点生命。
- 验证：聚焦 monster-reset smoke 通过，完整无库 release 套件同样通过。

### FS-038 `[x]` 任意一次成功登录会清空同 IP 对所有账号的失败预算

- 严重级别：高。
- 根本原因：`NativeAuthRateLimitService.recordSuccess` 同时删除主体桶和 IP 桶；IP 桶聚合的是该来源在同一认证 scope 下对所有主体的失败，但成功请求无需与此前失败的目标主体相同。
- 为什么错误：主体成功只能证明当前凭据合法，不能证明同 IP 对其他账号的尝试不是暴力攻击。攻击者可先对多个目标试错，再用自己的有效账号成功登录清空 IP 累计，如此循环，使声明的 `maxIpFailures` 永远达不到。
- 触发条件：攻击者拥有一个普通有效账号，在对不同受害账号尝试密码之间穿插自己的成功登录；注册或刷新 scope 也存在相同的跨主体清零语义。
- 后果：IP 维度从“限制来源总失败量”退化为只限制连续失败；攻击者仍可对每个主体轮换尝试，显著放大撞库和凭据填充吞吐。主体桶无法替代 IP 桶，因为目标账号可以持续轮换。
- 修复方式：成功请求只清除其规范化主体桶，保留该 scope 的 IP 失败历史直到滑动窗口自然过期；不改变既有阈值、封禁时长或主体成功后的容错语义。
- 验证：修复前用当前编译产物复现“5 次跨账号失败 → 自有账号成功 → 7 次跨账号失败”仍未封禁；修复后同一 12 次总失败在成功请求之后仍触发 429。新增断言已进入 `registration-activation` stable case，完整 `pnpm verify:quick` 通过。

### FS-039 `[x]` 激活码签发按调用方文本拆分同一 GM 密码的主体限流

- 严重级别：高。
- 根本原因：GM 登录用固定主体 `gm`，`/gm/registration-activation-code` 虽然校验同一个 GM 密码，却把 `registration-activation:${sourceText}` 作为主体；`sourceText` 完全由未鉴权调用方控制。
- 为什么错误：限流主体应对应被猜测的凭据，而不是请求业务参数。攻击者每次更换来源文本即可获得新的 4 次主体预算；再更换 IP 就能同时绕过 IP 桶，与 GM 登录入口的失败也互不累计。
- 触发条件：从多个来源 IP 对激活码 POST/兼容 GET 发起错误 GM 密码请求，并为每次请求使用不同 `text/qq`。
- 后果：拥有数据库恢复、密钥、环境变量和服务控制权的单一 GM 密码可被分布式高速猜测；激活码入口还成为绕过正常 GM 登录全局主体封禁的旁路。
- 修复方式：提取固定 `GM_AUTH_RATE_LIMIT_SUBJECT`，GM 登录和所有激活码签发入口统一使用 `gm` 主体；业务来源文本只参与激活码映射，不参与凭据限流键。
- 验证：修复前复现四个不同 IP、四个不同来源文本的失败后第五次仍可进入密码校验；修复后两次 GM 登录失败加两次激活码失败即封禁固定主体，第五次在调用密码服务前返回 429。`registration-activation` 已加入 `verify:quick`，全套 quick smoke 通过。

### FS-040 `[x]` 账号数据库初始化失败会退回易失内存真源且 readiness 仍为绿色

- 严重级别：严重。
- 根本原因：`NativePlayerAuthStoreService.onModuleInit` 在数据库连接、建表或全量加载失败后关闭连接池并继续运行，后续 `saveUser` 等方法自动走内存分支；`health-readiness` 又把 auth 固定写成 `ready: true`，且整体 readiness 不依赖真实账号库状态。
- 为什么错误：数据库已经配置时，账号正式真源只能是数据库，初始化失败不能被解释为“主动选择无数据库本地模式”。内存注册会签发可用 token，后续身份/初始快照还可能写入其他持久化表，但账号本身重启即丢，形成无法登录的孤儿玩家数据。健康检查宣告可用还会让负载均衡继续送入真实流量。
- 触发条件：启动时 PostgreSQL 暂时不可达、账号表建表/迁移失败、权限不足、查询超时或任一账号/激活码全量加载失败。
- 后果：已有用户统一表现为“不存在”，新注册看似成功却在重启后消失；多副本中还可能只有部分节点进入空账号世界。封禁镜像缺失时，绕过 readiness 的 Socket 路径也无法可靠拒绝已封禁账号。
- 修复方式：显式区分“完全未配置数据库的本地内存模式”和“已配置但未就绪的故障模式”；后者的账号查询、注册、自助修改和 GM 账号操作统一返回 503，Socket token 鉴权 fail-closed。把 `NativePlayerAuthStoreService.isEnabled()` 注入 auth readiness，并纳入整体 readiness 判定。
- 验证：新增 `native-auth-persistence-failure` 用不可达本地端口复现真实连接失败，证明 `isOperational=false`、账号写入返回 503、内存索引保持为空、`readiness.auth.reason=init_incomplete_or_failed` 且整体不就绪；完整 `pnpm verify:quick` 通过，无数据库显式本地模式的注册、session 和 runtime smoke 未回归。

### FS-041 `[x]` 数据库恢复后账号库在连接池缺失时静默跳过重载

- 严重级别：高。
- 根本原因：数据库恢复协调器明确调用 `NativePlayerAuthStoreService.reloadFromPersistence()`，但该方法遇到 `pool=null` 或 `enabled=false` 直接返回成功。账号库若在启动时失败、连接池已关闭或恢复过程使池失效，就不会重新建连，也不会向恢复任务报告失败。
- 为什么错误：恢复完成必须重建账号和激活码内存镜像，不能把“没有执行”当成“重载成功”。否则恢复接口可返回成功，而运行节点继续持有空索引或恢复前旧索引，与刚恢复的数据库真源分叉。
- 触发条件：账号库初始连接失败后通过 GM 恢复数据库；恢复前后专用 auth pool 被关闭/失效；或重载查询任一步失败。
- 后果：恢复后的账号仍无法登录、封禁和名称唯一性判断使用旧数据，需人工重启才能恢复；更严重时旧镜像会接受已在备份中撤销或变更的账号状态。
- 修复方式：`reloadFromPersistence` 在数据库已配置但池不可用时重新创建带既有超时配置的专用池、确保表存在并完整读取账号与激活码后再替换索引；重连或重载失败时关闭池、保持 fail-closed 并向恢复协调器抛错，禁止假成功。
- 验证：故障 smoke 在初次连接失败后再次调用 reload，确认它真实发起第二次连接且把 `ECONNREFUSED` 冒泡，而不是静默返回；`pnpm verify:quick` 通过。当前无获准真实 DB 恢复环境，因此尚不声称成功恢复后的表回读已做实库验证。

### FS-042 `[x]` 文件体积门禁把新巨型文件标成错误却仍可能返回成功

- 严重级别：高。
- 根本原因：`check-file-size-gate.js` 会把所有超过 3000 行的文件加入 `errors` 并打印 `NEW - needs baseline or split`，但最终退出码只检查 `regressions`；没有 baseline 的新超限文件不属于 regression。已拆回阈值内的文件也不会让旧 baseline 失效，陈旧豁免会继续允许其重新膨胀。
- 为什么错误：CI 的颜色与报告语义相反；“error”不阻断合并，且已偿还的技术债仍保留隐形增长额度。只要历史 regression 恰好清零，新巨型文件或旧文件重新越线都可能在门禁绿灯下进入主线。
- 后果：体积门禁无法阻止职责重新聚合，维护者会误以为新增超限已受保护；巨型模块的冲突面、隐式副作用与验证成本继续增长。
- 修复方式：把无 baseline 的新超限文件和不再对应超限文件的陈旧 baseline 一并纳入阻断条件；增加 `--contract-proof` 自验证，明确证明新超限与陈旧豁免都会失败。移除已降到 3000 行内的战斗 action、GM admin 和 world projector 三个陈旧 baseline，使其未来再次越线时立即按新文件阻断。
- 验证：`pnpm proof:file-size-gate:contract` 通过；真实 `pnpm proof:file-size-gate` 仍按预期退出 1；后续完成宗门与 GM 玩家服务拆分后，最新结果列出 14 个 baseline regression 与 2 个无 baseline 新超限文件，未再出现陈旧 baseline。

### FS-043 `[x]` 主协议审计绕过类型检查且把冷路径投影混入用例编排

- 严重级别：高。
- 根本原因：`protocol-audit.ts` 是历史 JavaScript 编译形态回填文件，保留 `@ts-nocheck`、7 个 CommonJS `require`、手写默认参数兼容和宽泛推断数组；账号命名、JWT 解析、玩家显示名与 Markdown 渲染又和 18 类 Socket 用例共处一个 3135 行文件。
- 为什么错误：发布门禁本应用来发现协议签名漂移，却主动跳过 TypeScript。实际移除抑制后立即暴露 13 处错误：有库事件无法加入被窄化的无库数组，3 个带旧式缺省参数的调用和 2 个可选验证器调用也不符合推断签名。冷路径报告和身份辅助继续堆在编排文件中，还让体积门禁长期失败。
- 后果：协议事件新增、审计 helper 签名变化或有库分支调整可能只在运行到特定 case 时才失败；未执行的分支无法得到编译保护，发布审计本身成为假安全感来源。巨型文件也提高修改冲突与报告投影误改业务用例的风险。
- 修复方式：改为标准 ES import，删除 `@ts-nocheck`；给预期 C2S/S2C 集合显式声明可扩展字符串数组，并用 TypeScript 默认参数表达原有运行语义。把账号/JWT 无状态规则和显示名/Markdown 投影分别提取到有类型 helper，主文件降到 2953 行并删除陈旧体积 baseline。
- 验证：`pnpm --filter @mud/server compile` 通过；先用 stable runner 聚焦运行 `bootstrap-runtime`，再运行完整 `pnpm audit:protocol`，无库隔离服务的 18 类用例、逐包覆盖报告和关闭 drain 全部通过；`pnpm proof:file-size-gate` 已不再把协议审计列入 3000 行错误或 regression。

### FS-044 `[x]` 鉴权启动 smoke 动态执行自身源码且测试替身已偏离生产构造器

- 严重级别：高。
- 根本原因：`auth-bootstrap-smoke.ts` 与三个 support 文件是历史编译后 JavaScript 回填，保留 `@ts-nocheck`、CommonJS 导出和大量无信息生成注释；主文件还读取自身源码、用正则提取函数名并通过 `eval` 重建导出分类。`WorldSessionBootstrapService` 拆分依赖后，smoke 仍按旧位置注入 runtime session 替身，并漏掉 post-bootstrap 所需的离线收益读取端口。
- 为什么错误：鉴权、快照恢复和会话围栏是发布主证明链，验证脚本却绕开编译器并在运行时反射自身文本。生产构造器调整不会触发编译错误，错误对象会被静默注入 `contextHelper`；只跑生产默认的无库配置时，该 case 又会因内存回退关闭而返回 `skipped`，进一步掩盖实际断言没有执行。
- 后果：真正打开内存态功能链时，恢复通知依次出现 `rememberAuthenticatedSnapshotRecovery is not a function`、`bootstrap_runtime_connect_player_unavailable` 和缺失 `loadPendingOfflineGainReports`，在核心协议断言前即崩溃；门禁可能把“脚本启动或主动跳过”误当成鉴权合同有效。动态 `eval` 还使重命名、打包与静态分析结果不可靠，并让 6668 行文件继续膨胀。
- 修复方式：全部改为标准 ES import/export 并恢复 TypeScript 检查；用静态函数表保留原有 `__helpers`、`__fixtures`、`__contractVerifiers`、`__all` 和直接导出合同，三个分类器改成有类型的独立模块。为 bootstrap smoke 新增命名依赖组装器，把 runtime session 端口放回 `worldRuntimeService`，按当前生产端口补齐会话、同步、通知与离线收益替身；同时删除无信息注释和重复环境判断，主文件降到 6078 行。
- 验证：`pnpm --filter @mud/server compile` 通过；编译产物静态导出校验确认 99 个总函数、50 个 helper、28 个 fixture、21 个 verifier 以及历史直接导出均存在。显式清空数据库、Pooler 与 Redis，并只在 test 环境打开内存回退后，stable `auth-bootstrap` case 完整执行并通过恢复通知、恢复 trace、bootstrap 关联、token seed、session 策略和主线协议拒绝旧事件等断言；`pnpm proof:file-size-gate` 不再把该文件列为 baseline regression，后续拆分后最新门禁仍因其他 14 个增幅和 2 个新超限文件按预期失败。未执行任何数据库写入路径。

### FS-045 `[x]` 玩家分域持久化 smoke 吞掉失败清理并在清理前输出成功

- 严重级别：高。
- 根本原因：`player-domain-persistence-smoke.ts` 在一个 3473 行文件中同时承载 with-db 主编排、10 组无库 fake-pool 合同和近 500 行快照夹具；异步初始化位于 `try/finally` 之外，最终清理 11 个测试玩家、关闭独立 pool、service 和 provider 时全部使用 `.catch(() => undefined)`。成功 JSON 又在进入 `finally` 之前输出，事务清理中的 `ROLLBACK` 失败也被静默丢弃。
- 为什么错误：该 smoke 会创建 wallet、inventory、equipment、active job、watermark 等持久对象，清理是测试合同而不是可忽略的附属步骤。初始化失败同样必须关闭已创建资源；某个玩家清理失败不能阻止其他玩家继续清理，但所有失败又必须让门禁退出非零。先输出 `ok: true` 会让日志消费者在真正收尾结果未知时得到相反结论。
- 后果：数据库异常或 schema 漂移时，smoke 可能遗留带随机 ID 的玩家资产和分域行，污染后续回归、唯一约束及恢复水位；主体错误、rollback 错误和资源关闭错误均不可见，CI 可能只保留误导性的成功 JSON。巨型文件还让无库合同和实库副作用边界难以独立审查，并已绕过新文件 3000 行门禁。
- 修复方式：把 10 组 fake-pool 合同和快照夹具拆为 1007/492 行的独立 support 模块，with-db 编排主文件降到 2091 行。把初始化纳入受保护执行段；无论主体是否失败都顺序执行全部玩家和资源清理，收集带任务标签的错误，并用 `AggregateError` 与主体异常一起抛出；清理事务和 rollback 同时失败时保留两者。只有主体与全部清理均成功后才输出成功 JSON，并在无库路径增加“前一清理失败仍执行后续任务且保留全部错误”的动态合同。
- 验证：`pnpm --filter @mud/server compile` 通过；显式清空数据库、Pooler 与 Redis 后运行 compiled smoke，10 组 fake-pool 投影合同和清理聚合合同实际执行通过，随后仅 with-db 分支按预期标记跳过。`pnpm proof:file-size-gate` 已把无 baseline 新超限从 6 个降到 5 个；当前未连接数据库，因此不声称玩家表删除、rollback 失败和实库资源关闭分支已动态触发。

### FS-046 `[x]` 强事务 smoke 吞掉资产清理和 rollback 失败

- 严重级别：高。
- 根本原因：`durable-operation-smoke.ts` 在 5224 行主文件中同时承载十三条强事务主链、市场/邮件/钱包/装备/作业 fixture 和快照 builder；服务初始化位于受保护执行段之外。最终清理实例目录、16 名玩家、独立 pool、邮件持久化、两个强事务服务和 provider 时全部吞掉异常，13 个 seed/cleanup 事务也会忽略 `ROLLBACK` 失败，且成功 JSON 在清理前输出。
- 为什么错误：该 smoke 写入玩家资产、邮件附件、market storage、active job、operation log、outbox、audit、watermark 和 instance lease。任一失败路径都必须继续清理其余对象，同时让主体错误、清理错误和 rollback 错误全部可见；否则强事务证明本身违反了它要验证的原子性和可恢复性要求。初始化阶段失败也不应绕过资源关闭。
- 后果：数据库抖动、约束漂移或断言失败时可能遗留资产、租约、outbox 和审计行，污染后续幂等键、fencing 与恢复测试；日志可先出现 `ok: true`，而实际 cleanup 已失败。rollback 原因丢失后还无法区分业务错误与连接失效，增加生产事故复现难度。
- 修复方式：把市场、邮件、钱包、装备和 active job 的 seed/期望 builder 提取为 1073 行 fixture 模块，主编排降到 4293 行并回到 4724 行 baseline 内。把三个服务初始化移入受保护执行段；无论主体是否失败都执行全部 22 个收尾任务并带标签聚合错误，成功 JSON 只在全部收尾成功后输出。所有 13 个事务统一通过 `rollbackAndThrow`：回滚成功重抛原错误，回滚失败则用 `AggregateError` 同时保留两者；无库路径增加清理不中断合同。
- 验证：`pnpm --filter @mud/server compile` 通过；显式清空数据库、Pooler 与 Redis 后运行 compiled smoke，清理聚合合同实际执行通过，仅强事务 with-db 分支按预期跳过。`pnpm proof:file-size-gate` 不再把该 smoke 列为 baseline regression，剩余增幅从 15 个降到 14 个；当前未连接数据库，因此不声称十三条资产事务、真实 rollback 或清理表路径已动态执行。

### FS-047 `[x]` 玩家成长权威服务混入大量无状态规则并突破文件门禁

- 严重级别：中。
- 根本原因：`PlayerProgressionService` 在一个 3295 行文件中同时承担境界配置加载、玩家状态变更、属性重算和持久化标记，以及约 500 行不依赖服务实例的突破要求、背包计数、功法品阶、灵根与传法速率计算。
- 为什么错误：纯规则和有副作用的权威编排没有边界，要求或数值调整必须在巨型类中 review，难以单独验证规则是否会触发玩家变更。该文件又已成为无 baseline 的新超限项，说明权威边界还在继续聚合职责。
- 后果：突破、天门、功法领悟或战斗经验改动会扩大冲突面，容易误触玩家属性重算、脏域与持久化副作用；新的纯判定也难以在不构造完整服务的情况下聚焦测试。
- 修复方式：把突破要求、背包计数、功法品阶、灵根归一化、输入值收敛和传法速率提取到 `player-progression-rule.helpers.ts`，只导出主服务需要的窄函数。配置加载、玩家变更、属性重算和持久化副作用继续留在服务中，不改入参、调用顺序或数值公式。
- 验证：`pnpm --filter @mud/server compile` 和完整 `pnpm verify:quick` 通过；显式无 DB/Redis 的 compiled `progression` stable case 通过登录、面板、功法、装备、修炼、治疗、Buff、地图解锁与灵石增量链；`pnpm proof:file-size-gate` 确认主服务为 2815 行并将新超限项从 5 个降为 4 个。随后宗门和 GM 玩家服务拆分将当前新超限项继续降为 2 个；本组未执行数据库写入路径。

### FS-048 `[x]` 宗门持久化配置故障会降级到内存并放行资产变更

- 严重级别：高。
- 根本原因：`WorldRuntimeSectService` 在已经配置数据库时，仍会在连接池缺失、建表或核心投影修复失败后只记录日志并继续运行；durable commit 返回 `false` 后，创建宗门、迁移入口和成员关系等调用方会保留内存变更并安排一次尽力持久化。部分链路此前已经扣除建宗令或迁移令。
- 为什么错误：数据库一旦被配置就是宗门、成员和传送入口的正式真源；只有完全未配置数据库的显式本地模式才可以使用进程内状态。把真源不可用误当成“暂时没有持久化能力”会破坏资产操作的原子性，也绕过外层已经具备的内存和背包回滚合同。
- 后果：数据库故障期间，单进程会展示已成立的宗门、成员或传送入口并可能消耗玩家道具，但进程重启后全部丢失；多节点还会看到不同的宗门真相，产生重复入宗、重复建宗或入口冲突。失败的初始化 Promise 若永久缓存，还会使数据库恢复后该进程继续不可恢复。
- 修复方式：把建表和核心投影修复收敛到 `sect-durable-persistence.ts`；数据库已配置但 provider 不返回连接池、schema 初始化或修复失败时统一抛出 `ServiceUnavailableException`，让启动恢复或当前变更失败并触发既有资产/内存回滚。失败的初始化 Promise 在 `finally` 中清空，下一次操作会重新请求连接池；完全没有数据库配置的本地模式保持原行为。
- 验证：server compile、完整 `pnpm verify:quick`、`pnpm audit:boundaries` 及宗门 reconciliation/main/core-normalization 等聚焦 compiled smoke 通过；fake provider 证明“配置数据库但无池”连续两次均拒绝且第二次会重新取池。当前没有执行真实数据库建表、核心修复或多节点恢复，因此不把这些路径记为已动态证明。

### FS-049 `[x]` 宗门核心持久化自愈会吞掉回滚失败

- 严重级别：高。
- 根本原因：核心坐标、入口或快照修复事务失败后，旧实现对 `ROLLBACK` 使用 `.catch(() => undefined)`，随后按正常连接释放；主 SQL 错误成为唯一可见异常。
- 为什么错误：回滚失败通常意味着连接中断、事务状态未知或数据库本身异常，不能作为普通业务失败隐藏，更不能把可能仍处于异常事务状态的 client 放回连接池。核心自愈负责正式宗门投影，错误链必须完整保留。
- 后果：运维日志无法区分修复 SQL 失败和连接已失效，池中复用异常 client 可能让后续宗门读写连锁失败；最坏情况下数据库中的宗门核心、入口和地图快照处于不一致状态，却只留下误导性的首个错误。
- 修复方式：持久化模块统一执行修复事务；主操作和回滚同时失败时抛出包含两者的 `AggregateError`，并以销毁语义释放 client。仅主操作失败且回滚成功时保留原错误并正常释放。
- 验证：`sect-durable-mutation-smoke` 的 fake client 分别覆盖“主失败、回滚成功、正常 release”和“主失败、回滚失败、聚合两项错误并 destroy release”；server compile、完整 `pnpm verify:quick` 均通过。未用真实数据库制造连接中断。

### FS-050 `[x]` 宗门主 smoke 用同步断言和未等待调用验证异步入口

- 严重级别：高。
- 根本原因：`world-runtime-sect-smoke.ts` 对返回 Promise 的创建/迁移入口使用 `assert.throws`，并对大量 `executeSectAction` 调用不做 `await`；受保护区域断言还保留旧错误文本。虚拟边界 smoke 同时带 `@ts-nocheck`、CommonJS 入口和过时的视野 revision `+1` 预期。
- 为什么错误：同步断言只检查函数调用当下，无法捕获 Promise rejection；未等待的成员、权限、继任和解散变更会彼此竞态，脚本可能在真实断言完成前推进或以未处理 rejection 结束。`@ts-nocheck` 又使生产签名变化无法在编译期暴露。
- 后果：宗门权限、成员顺序、宗主继任、解散和道具回滚等高风险路径看似有 smoke，实际没有按权威队列顺序完成验证；测试可能产生假红、假绿或在错误位置崩溃，掩盖真正的资产回归。
- 修复方式：所有异步入口改为显式 `await`，拒绝路径使用 `await assert.rejects` 并对齐当前机制文本；虚拟边界 smoke 迁移为标准 TypeScript import/export，按真实的“阵基激活 + 被毁变 Floor”两次可视边界变化断言 revision `+2`。
- 验证：server compile、完整 `pnpm verify:quick` 通过；`world-runtime-sect-smoke`、virtual-boundary-sync、durable-mutation、durable-reconciliation、core-normalization、derived-runtime-state、formation、use-item、building-room-fengshui 和 instance-read-facade 共 10 项聚焦 compiled smoke 均执行到结尾并通过。

### FS-051 `[x]` GM 定向玩家修改会整投影覆盖并误清全部脏域

- 严重级别：高。
- 根本原因：离线重置、天门重置、炼体、底蕴/战斗经验补偿和批量回城虽然只修改少数字段，却统一调用 `savePlayerSnapshotProjection` 保存完整玩家投影；在线炼体在数据库 I/O 完成后又调用无 domain、无快照 revision 的 `markPersisted(playerId)`。数据库事务只在写入时加玩家锁，读取和构建快照发生在锁外。
- 为什么错误：正式真源已经按 `vitals`、`progression`、`inventory`、`technique` 等领域拆分，定向 GM 操作必须只覆盖实际修改的领域。完整快照可能在构建后变旧；无参数 `markPersisted` 还会把 I/O 期间新产生但尚未落库的其他 dirty domain 一并当成成功。
- 后果：玩家在线战斗、获得物品、推进功法或后台 flush 与 GM 操作交错时，旧快照可能把新生命、背包、功法、任务等数据回退；脏标记被误清后下一轮 flush 不会补写，形成永久资产或进度丢失。批量快捷指令会把风险放大到整个作用域。
- 修复方式：移除 GM service 对完整投影写入 API 的依赖；重置只写 `world_anchor/position_checkpoint/vitals/buff/combat_pref`，天门只写 `attr`，离线炼体只写 `body_training`，底蕴和战斗经验只写 `progression`，普通编辑沿既有 section 映射写精确 domain。在线炼体按当前运行时规则写 `body_training/progression/attr`，并把构建快照时的 `persistentRevision` 与精确 domain 一起传给 `markPersisted`，I/O 期间的新变更继续保持 dirty。
- 验证：新增 `native-gm-player-domain-write` compiled smoke 并接入 `verify:quick`，动态覆盖 7 次写入、空 Buff 明确覆盖、在线炼体 revision 确认和“完整投影 API 一旦被调用立即失败”的守卫；完整 `pnpm verify:quick` 与边界审计通过。当前无真实数据库，因此未动态制造 tick/flush 与 GM HTTP 并发。

### FS-052 `[x]` 未知 GM 玩家修改分区会静默执行完整快照写入

- 严重级别：高。
- 根本原因：`applyPlayerSnapshotMutationToPersistence` 对未知 `section` 不执行任何字段修改，`getGmUpdateProjectionDomains` 返回空集合，旧保存逻辑随后把“没有可识别 domain”解释为回退完整玩家投影。
- 为什么错误：客户端类型不能替代 HTTP 运行时校验；未知输入应明确拒绝。用完整写入兜底既掩盖调用方协议漂移，又把一个无效请求扩大为全玩家领域覆盖。
- 后果：旧客户端、手工请求或拼写错误会收到成功，运维误以为修改生效；同时可能触发 FS-051 的旧态覆盖、无意义 watermark 推进和大量跨表写入。
- 修复方式：domain 写入成为 GM 玩家服务的必需 port，不再提供完整投影 fallback；section 无法映射到任何允许 domain 时抛出 `BadRequestException`，不执行持久化或运行态回写。
- 验证：`native-gm-player-domain-write` smoke 对 `section=unknown` 使用 `assert.rejects`，确认错误文本、零次 domain 写入和零次完整投影写入；server compile 与完整 quick 门禁通过。

### FS-053 `[x]` GM 物品与恢复丹 smoke 偏离当前 domain 和模板水合契约

- 严重级别：中。
- 根本原因：物品编辑 smoke 仍断言 `items` 只保存 inventory/equipment，漏掉生产映射中的 artifact；恢复丹 smoke 用 `JSON.stringify/parse` 构造持久化和运行态替身，丢失模板原型上的 grade/level 等静态字段，导致共享堆叠签名把同一恢复丹误判成不同堆叠。独立持久化边界 smoke 还继续搜索已移除的整投影方法。
- 为什么错误：这些 smoke 验证的正是 GM 资产边界，却用与生产水合行为不同的对象和过期 domain 期望。测试失败无法区分生产 bug 与替身失真，测试未运行时又会保留错误架构结论。
- 后果：职责拆分或模板实例优化后出现假红，维护者可能错误修改生产堆叠规则；反过来，artifact 漏存或 GM 再次回退整投影时，旧断言也不能提供可信保护。
- 修复方式：物品编辑期望对齐 `inventory/equipment/artifact`；恢复丹替身在每次运行态/持久化/托管仓回读时通过 `ContentTemplateRepository.normalizeItem` 恢复模板属性，再验证堆叠与 domain；独立持久化 proof 改为要求分域方法并显式禁止 `savePlayerSnapshotProjection`。
- 验证：compiled `native-gm-player-technique-refresh`、`native-gm-cleanup-invalid-items`、`recovery-pill-migration` 和 `flush-independent-persistence` 均执行通过；前两项分别证明物品实例 ID/domain 映射与无效物品清理，恢复丹用例证明在线/离线背包、装备和托管仓迁移合并，边界 proof 锁定 GM 分域直写。

### FS-054 `[x]` 背包分页与增量水合会丢失或串用实例字段

- 严重级别：高。
- 根本原因：服务端分页投影只复制身份、名称、类型、品阶和功法书等少数字段，遗漏共享协议已经声明的 `equipSpecialStats`、`consumeBuffs`、`contextActions`、`craftEffectStats` 等实例态；高频 PanelDelta 对背包、装备和法宝又只做对象浅展开，嵌套词条仍与权威运行时共享引用。客户端水合同时维护另一份手写字段表，同样漏接三类字段，并按 `itemId + enhanceLevel` 从原槽位继承缺失值。`resolvePreviewItem` 还让模板 `equipSpecialStats` 反向覆盖实例值。
- 为什么错误：同模板、同强化等级的两件物品仍是不同资产实例，制作词条、特殊属性、Buff 和上下文动作都可能不同。槽位只是展示顺序，不能成为实例字段真源；本地模板也只能提供静态默认值，不能覆盖服务端实例投影。
- 后果：登录、翻页或增量换位后，详情可能不显示真实悟性/幸运、消耗 Buff、技艺加成和操作入口；相同模板的新物品还可能继承旧物品词条。嵌套对象若在 revision 推进前后原地变化，上一帧基线也会被改掉，diff 可能误判“无变化”而漏发。资产操作虽然仍由 `itemInstanceId` 防止命中错误实例，但玩家会依据错误详情作出装备、分解或交易判断。
- 修复方式：在 shared 建立覆盖全部 `SyncedItemStack` key 的显式投影白名单，新增字段漏登记会在编译期失败，投影时深克隆并拒绝运行时内部字段；背包分页和背包/装备/法宝 PanelDelta 切片统一复用该投影。客户端把每个回包视为完整实例视图，只用本地模板补静态字段，不再从旧槽位继承；实例特殊属性改为服务端值优先。背包网关 smoke 同步迁移为规范 TypeScript，并把分页字段完整性和引用隔离接入 `verify:quick`；生产边界门禁禁止物品浅展开回归。
- 验证：`pnpm build:shared`、`pnpm verify:client`、完整 `pnpm verify:quick` 均通过；新增客户端水合 proof 动态覆盖旧槽位不继承、特殊属性/Buff/上下文动作保留和深克隆，compiled 网关 smoke 覆盖过滤、搜索、30 条上限、请求回显、revision、完整实例投影及内部字段拒绝。`pnpm proof:file-size-gate` 已运行，仍因 FS-002 记录的 14 个 baseline regression 与 2 个新超限文件退出 1，本组没有新增超限。未连接真实弱网，不能替代长延迟翻页和实际包体压测。

### FS-055 `[x]` 背包分页请求缺少完整代际与失败生命周期

- 严重级别：中高。
- 根本原因：客户端只在回包和当前快照“同时存在非空 requestId”时才比较身份，没有要求当前 pending、筛选坐标和 revision 下界全部匹配；翻页又直接把快照改成目标 offset 和空 items，但没有立即 patch loading。网络发送器丢弃本地出站门禁结果，也没有超时释放 pending。服务端虽然声明 `knownRevision` 用于过期保护，实际完全未读取，且会为缺少 requestId 的请求生成无法关联的回包。
- 为什么错误：分页回包是低频异步查询结果，筛选、搜索、页码和背包 revision 任一变化都会产生新代际。没有唯一可接受 pending 就无法证明回包仍属于当前视图；把“已接受页面”和“正在请求目标页”塞进同一快照，也破坏了展示基线与请求状态的边界。
- 后果：弱网、重连或快速翻页时，缺身份/旧坐标回包可能覆盖当前页；点击下一页后列表会短暂退回本地第一页，按钮仍可连续点击并堆积请求。若 socket 尚未可写或回包丢失，面板会永久停在 loading，后续普通 update 也不再补发。多节点或异常路由下的旧 revision 还可能把客户端背包视图倒退。
- 修复方式：新增独立 `InventoryPageRequestState`，当前只保留一个 pending，严格校验 requestId、filter、search、offset、limit 和 revision 下界；已接受页与 pending 分离，翻页期间保留旧页并局部禁用按钮。发送器返回出站是否接受，本地拒绝和 10 秒超时都精确撤销本代 pending；背包 revision 推进会取消旧请求。shared 将 requestId 收紧为必填，服务端拒绝缺失/超长身份和领先于运行态的 knownRevision。
- 验证：新增纯状态机 proof 覆盖乱序、无身份、坐标不一致、版本回退、正确回包和本地发送失败；`pnpm verify:client`、`pnpm build:shared`、`pnpm audit:protocol` 与完整 `pnpm verify:quick` 均通过。compiled `world-gateway-inventory-helper` smoke 动态证明服务端对缺失 requestId 和领先 revision fail-closed。未注入真实网络延迟和断网，不替代浏览器弱网实测；Vite 仍有既有大 chunk 和 protobuf `eval` 警告。

### FS-056 `[x]` 特殊物品使用确认不会随玩家成本上下文更新

- 严重级别：中。
- 根本原因：灵根种子、碎灵丹和高境界功法书的确认文案依赖 `realm`、`foundation`、`heavenGate.averageBonus` 等玩家状态；这些字段已进入 `buildPlayerContextKey` 并会触发面板更新，但动作弹窗的 render key 只包含物品身份、数量、动作类型和输入草稿，不包含玩家上下文代际。
- 为什么错误：`patchModal()` 以 render key 相等作为“不重绘”依据。依赖数据变化却不进入失效键，会让界面缓存与它实际读取的数据边界不一致；服务端继续按最新状态权威结算，客户端提示因此不能代表即将执行的结果。
- 触发条件：玩家停留在特殊使用确认弹窗时，收到境界经验、道基、天关平均加成或境界等级增量，例如另一条结算先完成或状态在同一会话中被刷新。
- 后果：界面可能继续显示旧的道基/经验消耗、剩余值、重抽次数或功法难度警告；玩家依据过期信息确认后，服务端可能按不同成本执行或拒绝，形成高风险决策误导，但不会绕过服务端资产校验。
- 修复方式：把单物品操作状态和渲染收口到 `InventoryItemActionDialogController`，纯状态对象区分普通数量弹窗与上下文相关的特殊确认；只有特殊确认把 `playerContextRevision` 纳入 render key，普通输入继续保留焦点和未完成草稿。使用、丢弃和摧毁仍只提交当前 `itemInstanceId`，摧毁保留独立二次确认。
- 验证：新增 `proof:inventory-action-dialog-lifecycle`，动态证明实例不串用、普通上下文更新不打断输入、特殊上下文更新必定改变代际、空草稿保留和摧毁确认状态入键；client TypeScript、生产边界 proof 与完整 `verify:client` 结果见验证表。未连接真实服务端，不证明服务端并发资产事务和实际视觉文案。

### FS-057 `[x]` 望气颜色混用绝对值与等级且漏掉资源变化失效

- 严重级别：中高。
- 根本原因：Canvas 与 Pixi 都把地块 `aura` 绝对值直接作为颜色等级，却把资源 `level` 或由资源值换算出的等级与它比较；Pixi 覆盖层签名只记录 `tile.aura`，没有记录实际参与着色的资源家族、`level/effectiveValue/value`，并把 `hpVisible=undefined` 与显式 `true` 合并成同一个签名。
- 为什么错误：灵气机制以 `1000 × 1.5^(n-1)` 的绝对值阈值换算等级，视觉常量 `maxAuraLevel=6` 明确要求输入等级。缓存签名必须覆盖渲染函数真正读取且会改变像素的全部语义，同时保留 `hpVisible` 的三态含义。
- 后果：基础灵气达到 1000 后会被误当成上千级并直接映射为最高强度颜色，煞气/魔气资源的真实等级通常也永远无法超过这个错误基线；资源数量不变但家族或等级更新时，Pixi 继续显示旧颜色；满生命地块把 `hpVisible` 从未指定改为强制显示时也可能不出现生命条。
- 修复方式：在 shared 建立唯一的 `resolveSenseQiOverlaySignal`，先把地块绝对灵气换算为等级，再选择等级最高的有效气机资源；Canvas 与 Pixi 共同复用。Pixi 动态签名按最终家族/等级而非原始浮点值失效，并精确区分生命条可见性三态，因此同一等级内的半衰期微小变化不会重建，真正的颜色或生命条变化不会漏掉。
- 验证：shared build 通过；地图生命周期 proof 动态覆盖 `2250 → 3 级`、更强煞气/魔气选择、同等级半衰期不失效、等级/家族变化失效和 `hpVisible` 三态。Canvas 与 Pixi 均经 client TypeScript 检查，完整客户端门禁结果见验证表。

### FS-058 `[x]` 动态地块状态会销毁重建 Pixi 静态 GPU 分块缓存

- 严重级别：中高。
- 根本原因：Pixi 静态分块签名和 MapStore 的静态 chunk revision 同时混入 `hp/maxHp/hpVisible/aura/resources`；但静态分块实际只绘制地形底色、运行时贴图、双网格边缘和字形，生命条与望气属于独立覆盖层。小地图只绘制地块类型，也会被这些动态字段推动基础画布版本。
- 为什么错误：缓存失效域必须与实际消费字段一致。战斗生命值和灵气半衰期属于运行态高频变化，不应触发 `cacheAsTexture(false)`、销毁所有静态子节点、重建 16×16 分块并重新生成 GPU 纹理，也不应重画只关心地形类型的小地图。
- 后果：可破坏地块战斗、灵气流转或资源变化会同时放大为相邻静态分块的字符串扫描、Pixi 对象分配、纹理回收和重新上传；多人同屏或移动端会增加主线程抖动、GC 与显存带宽，严重时造成掉帧，而画面静态部分并没有变化。
- 修复方式：提取 `pixi-terrain-cache-signatures.ts` 作为地形缓存边界；静态签名只保留 `type/terrainType/surfaceType/structureType/interactableKinds` 和渲染配置，MapStore 也只用这些字段推进静态 chunk revision。生命条、可见性和望气信号由覆盖层独立签名负责，地图记忆仍照常保存动态资源但不推动仅绘制地形类型的小地图基础缓存。
- 验证：空间缓存 proof 锁定 MapStore 静态签名不得重新混入动态字段；地图生命周期 proof 动态证明生命、灵气和资源改变不影响静态签名，而地形分层字段改变必定失效。完整客户端门禁结果见验证表；当前没有 GPU trace 或低端真机长时间灵气流转压测，不把静态证明等同于实测帧率收益。

### FS-059 `[x]` Pixi profiler 在关闭时仍制造帧分配且销毁后保留渲染器闭包

- 严重级别：中高。
- 根本原因：adapter 用 `profileMeasure(key, () => ...)` 包裹每帧相机、地形、实体、特效和 Pixi render 等十余个阶段，即使 profiler 关闭也会先创建箭头函数；每帧还无条件构造带对象展开的 `activeSchedule`。开启 profiler 后，`window.__mudPixiProfileReset` 捕获整个 adapter；`destroy()` 先 `resetScene()` 创建新诊断状态，只销毁窗口却没有删除全局重置闭包和快照。
- 为什么错误：可选诊断设施关闭时不应持续向 60 FPS 热路径引入短命函数和对象；生命周期拥有者销毁时必须释放所有全局入口。全局闭包只要仍可达，就会连带保留地图分块、实体、纹理引用和 Pixi 场景树。
- 后果：正常玩家即使从未开启 profiler，也会承受稳定的帧级分配和额外 `performance.now()`/函数调用成本，增加移动端 GC 抖动；曾开启诊断的会话在地图运行时销毁后仍可能无法回收整套渲染器对象图，并向控制台暴露已失效的重置入口。
- 修复方式：提取 `PixiRenderProfiler`，统一拥有启停、runtime profiler、窗口、样本和两个 `window` 句柄；adapter 改为显式 `start/end`，不再传测量闭包，且只有 `isActive()` 时才计算活跃时长、展开 schedule、记录和发布帧样本。销毁统一关闭底层 profiler、停止定时探针、销毁窗口并删除全局快照与重置入口。
- 验证：地图生命周期 proof 通过 Vite 实际加载 profiler，动态验证默认关闭、启用/发布/重置、销毁后三个全局/运行态入口全部释放；源码守卫禁止 adapter 恢复测量闭包，并要求帧快照位于 active 守卫内。完整客户端门禁结果见验证表。

### FS-060 `[x]` Pixi adapter 聚合图包解析、纯视觉规则与场景拥有权

- 严重级别：中。
- 根本原因：2970 余行有状态 Pixi adapter 之前还内嵌近 650 行内部对象结构、清单容错解析、sprite lookup、颜色转换、名字牌/阵法/风水签名和文字样式规则；这些逻辑不访问 renderer、stage 或 GPU 资源，却只能随着完整 adapter 一起 review 和验证。
- 为什么错误：adapter 应负责场景对象拥有权与绘制编排，启动期内容解析、无状态视觉投影和内部数据结构属于不同变化轴。把它们混在同一个无 baseline 新超限文件中会让任何图包字段或配色调整都扩大到资源释放、异步初始化和每帧渲染生命周期。
- 后果：图包格式、名字牌、阵法覆盖或颜色规则的小改动容易与 Pixi 初始化/销毁冲突，review 难以确认是否误触场景状态；纯规则也难以不构造 WebGL 环境而单独验证，文件继续膨胀后会重新让体积门禁失去阻断能力。
- 修复方式：`pixi-runtime-image-manifest.ts` 只负责清单容错、图层优先级、atlas/dual-grid 元数据和本地覆盖投影；`pixi-render-primitives.ts` 只负责纯签名、颜色、文字和几何规则；`pixi-render-state.ts` 只声明场景内部类型。adapter 通过窄导入复用，继续唯一拥有 Pixi 容器、纹理、异步代际和绘制顺序。
- 验证：client TypeScript 通过；地图生命周期 proof 通过 Vite 动态验证 atlas/meta/dual-grid 归一化、structure 图层优先级、颜色与坐标签名，并用源码守卫阻止三类职责回流；`pnpm proof:file-size-gate` 确认 adapter 为 2971 行、无 baseline 新超限为 0，门禁只因既有 14 个 baseline 增幅按预期退出 1。完整客户端门禁结果见验证表。

### FS-061 `[x]` Pixi 实体遮挡与威胁箭头使用上一帧状态并在每帧制造冗余分配

- 严重级别：中高。
- 根本原因：拥挤实体第一遍扫描依赖 `view.root.visible`，该值尚未按本帧相机和插值位置重算；坐标以 `${x},${y}` 写入新建的字符串 `Set`，每个实体又单独调用 `performance.now()`。威胁箭头虽然在服务端按 AOI 构造、在 `MapStore` 按当前实体索引过滤，Pixi 仍把 `Map` miss 转成实体数组并线性查找；颜色只判断发起方是不是 `player`，没有判断是不是本地玩家，也不排除本帧不可见的两端。
- 为什么错误：相机和实体可见性属于当前帧派生，不能读取上一帧渲染结果；同一个 frame 的动画应该使用同一个时钟。渲染器实体 `Map` 的 key 与 `anim.id` 在 `syncEntities` 中是同一身份，继续全量兜底既不增加可恢复性又破坏 O(1) 查找。威胁箭头的“自己”语义取决于本地玩家 ID，而不是通用实体类型。
- 后果：相机跳转、快速平移或 crowd 跨越视口时，同格玩家可能短暂重复出现或被错误隐藏一帧；其他玩家主动攻击时会被错误绘成“自己的”威胁颜色，视口外两端还可能形成穿过屏幕的无主箭头。多人同屏下，每帧坐标字符串、Set、实体数组、逐实体时钟和重复颜色解析会持续增加 GC 与主线程成本。
- 修复方式：新增可复用、支持负坐标的二维 `PixiFrameGridPointSet`，每帧回收行集合；crowd 用当前插值坐标与统一视口函数建立遮挡索引，所有可见实体共用一次 `frameNow`，不可见实体暂停无效表现 patch。威胁箭头只从实体 `Map` 直接读取可见两端，以 `arrow.ownerId === localPlayerId` 选择颜色，并预解析 Pixi 颜色常量。
- 验证：地图生命周期 proof 通过 Vite 动态覆盖负坐标、跨帧重置、容器复用和实体边缘视口判定；源码守卫锁定本地玩家身份、不可见端点过滤、统一时钟、直接实体索引，并禁止恢复上一帧 crowd 判定和数组线性兜底。完整 `pnpm verify:client` 通过；`pnpm proof:file-size-gate` 确认 adapter 当前为 2987 行且无新超限，仍只因既有 14 个 baseline 增幅退出 1。未做 WebGL 实机多人拥挤截图和长时间帧分配 profile，不把静态/构建 proof 当作真机帧率数据。

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

### D-003 `[?]` 工坊目录冷启动仍通过 Socket.IO 下发

- 当前证据：FS-021 已消除面板重开和装备刷新中的重复目录；新协议审计中首次显式炼丹请求仍为 `15.35KB`，同一构造链的炼器目录约 `48KB`。这些包现在只在当前会话确实没有对应目录时按需发送，不再进入 tick、装备刷新或重复打开链路。
- 潜在后果：大量玩家在发布或重连后同时首次打开工坊，仍会形成可观的冷启动流量；继续使用 Socket.IO 能保持实现简单和服务端内容真源，但无法利用浏览器/CDN 的标准静态资源长期缓存。
- 无法直接确定的原因：是否进一步优化取决于内容热更新方式、允许的目录陈旧窗口、CDN/版本发布策略和工坊冷开 SLA；把目录打进客户端、落入持久浏览器缓存或改成 HTTP immutable artifact 都会改变内容发布与失效边界，不能只凭单包大小擅自选择。
- 可选方案：① 推荐：以内容 hash 发布 immutable HTTP 目录产物，由版本清单驱动浏览器/CDN 缓存，Socket.IO 只同步版本和运行态；② 保持服务端响应，但将已验证目录持久化到 IndexedDB，并以 hash 握手失效；③ 保持当前会话级缓存，接受每次新会话首次打开的单次冷包。
- 2026-07-13 需要决定：工坊目录是否要求独立热更新，以及可接受的首次打开包体/延迟目标。

### D-004 `[?]` EventBus 仍保留五组尚未完成端到端接线的协议脚手架

- 当前证据：FS-023/FS-024 清理后，`panelPatches`、`jobProgress` 和 `stateDelta` 仅剩 EventBus 通用 API、分发器、bench 与 smoke，没有生产入队或真正客户端落地方；`techniqueDirty` 同样没有生产调用方，`feedbacks` 只有未被业务调用的 world facade。客户端对应的面板、任务进度和即时反馈 handler 仍是空实现，`techniqueDirty` 也被显式忽略；通知和 AOI 表现则已有真实生产消费链。
- 潜在后果：目前不产生网络流量，但共享类型、服务端队列、客户端分发器、指标、bench 和 smoke 都需持续维护；新业务可能看到 API 就直接入队，再次形成“发了但没人用”的假接线。
- 无法直接确定的原因：这五组能力可能是已排期的 UI 基础设施；直接删除会改变共享协议，直接接通又会新增用户可见交互，都超出纯技术修复。
- 可选方案：① 推荐：没有明确产品计划时删除五组休眠协议及其 bench/smoke，真正开发功能时再按实际 UI 契约设计；② 确认功能后逐组完成生产端到端接线和用户可见验证；③ 暂时保留，但以边界 proof 禁止在没有真实客户端消费者时新增生产入队方。
- 2026-07-13 需要决定：这五组 EventBus 能力是明确保留的近期规划，还是应当删除的历史脚手架。

### D-005 `[?]` GM 高危 scope、确认短语与数据库维护态门槛全部处于声明但不执行状态

- 当前证据：数据库恢复/清理、密钥读写删除、运行时环境变量变更与服务重启都调用了统一 `assertGmHighRiskOperationAllowed`，但该函数明确是 no-op；登录默认签发全部四类高危 scope，请求还能自行选择已允许 scope；`NATIVE_GM_RESTORE_CONTRACT.requiresMaintenance` 固定为 `false`。因此当前真实安全边界只有同一个 GM 密码 token，scope 与确认短语不会拒绝任何已鉴权请求。
- 潜在后果：浏览器 token 被盗、误粘贴请求或单次操作失误即可直接读取密钥、覆盖环境、清库、恢复数据库或终止服务；审计日志只能事后追踪，不能降低操作发生概率。反过来，强制维护态或短语也可能拖慢单人紧急恢复并与现有 GM UI/自动化不兼容。
- 无法直接确定的原因：mechanics 明确写着“单一 GM 角色、密码 token 具备全部能力”，说明当前 no-op 可能是有意的运营策略；改为分级 scope、二次确认或维护态会改变线上运维流程与灾难恢复 SLA，不能作为纯代码 bug 擅自启用。
- 可选方案：① 推荐：至少对数据库恢复/清理、密钥明文读取和服务重启强制服务端确认短语，并让 token scope 成为真实授权；数据库恢复要求维护态，提供审计可见的紧急豁免；② 保持单角色，但只启用确认短语和维护态，不做多角色；③ 保持现状，明确接受“持 token 即全权”的风险并加强 token 隔离、短 TTL 与外层网络访问控制。
- 2026-07-13 需要决定：是否保留单 token 全权策略；若不保留，需要确认首批强制保护的操作、维护态豁免流程和 GM UI 兼容窗口。

### D-006 `[?]` 生产可信代理默认覆盖全部 RFC1918 私网而非实际代理节点

- 当前证据：未配置 `SERVER_TRUSTED_PROXIES` 时，服务端默认信任 loopback、`10/8`、`172.16/12`、`192.168/16`；这能直接兼容动态 Docker 网段，但范围远大于单个 Nginx 实例。FS-029 已修复公网客户端在标准追加链中的链首伪造，却无法区分“同一私网中的真实代理”与“可直接访问服务端的其他私网客户端”。
- 潜在后果：若服务端端口可被同 VPC、宿主机或其他容器直接访问，这些来源仍可伪造代理头；改成默认不信任又会让所有经 Nginx 的用户共享代理 IP，造成限流误封和审计失真。
- 无法直接确定的原因：仓库无法证明生产网络 ACL、容器网段是否固定、服务端端口是否仅对 Nginx 开放；精确默认值属于部署拓扑事实，不能凭代码猜测。
- 可选方案：① 推荐：生产显式设置仅包含实际 Nginx/Caddy 节点或固定代理子网的 `SERVER_TRUSTED_PROXIES`，同时用网络 ACL 禁止其他来源直连 server；② 保持 RFC1918 默认并确认 server 端口只对代理容器开放；③ 设置 `off`，仅适用于没有反向代理或不需要来源 IP 的部署。
- 2026-07-13 需要决定：确认正式服代理地址/子网与 server 端口暴露范围，随后把精确配置纳入部署检查。

### D-007 `[?]` GM 持久审计不可用或写入失败时所有高危写操作继续放行

- 当前证据：`GmAuditLogPersistenceService.recordEntry` 明确采用 fail-open：未配置数据库、表初始化失败、连接池未就绪或单次 `INSERT` 失败时只记 warn/error 并返回；玩家、密钥、数据库、环境变量和管理 controller/service 还在外层吞掉审计异常。代码注释一方面声明 GM 写必须落 `gm_audit_log`，另一方面又要求审计不能阻断主操作。
- 潜在后果：数据库审计链路故障期间仍可修改玩家资产、密钥、环境、数据库或服务状态，但正式真源没有不可抵赖记录；日志也可能与同一数据库故障、容器重启或轮转一起丢失。改为统一 fail-closed 又会在审计表短暂抖动时阻断紧急恢复和止损操作。
- 无法直接确定的原因：这是审计完整性与灾难恢复可用性的运营取舍；不同操作的容忍度不应相同，仓库无法替用户决定哪些紧急操作允许带“审计欠账”执行。
- 可选方案：① 推荐：玩家资产、密钥明文/写入、清库/恢复和服务重启默认 fail-closed；只为灾难恢复提供显式 break-glass 模式，将最小脱机审计写入独立持久介质并在数据库恢复后补录；② 只对资产和密钥 fail-closed，普通诊断/低风险配置保留 fail-open；③ 保持全部 fail-open，但建立强告警、审计可用性 readiness 和外部日志不可变存储。
- 2026-07-13 需要决定：高危操作的 fail-closed 清单、break-glass 授权方式，以及审计数据库不可用时是否允许数据库恢复本身继续执行。

### D-008 `[?]` 注册激活码兼容 GET 会把 GM 密码放入 URL

- 当前证据：`GET /api/auth/gm/registration-activation-code` 接受 `password`、`text/qq` query，并用 GM 密码直接登录；源码注释已承认 POST 才能避免密码进入访问日志。仓库内生产客户端和 protocol audit 使用 POST，GET 仅由兼容 smoke 直接调用，无法证明外部调用方是否仍依赖它。
- 潜在后果：完整 URL 可能进入 Nginx/access log、APM、浏览器历史、代理缓存、Referer 或运维截图，使拥有全部 GM 权限的明文密码扩散到远超凭据系统的存储面；立即删除则可能打断只会拼 URL 的外部机器人。
- 无法直接确定的原因：GET 是否仍有仓库外调用方属于生产集成事实；直接移除属于公共 API 破坏性变更，保留则持续承担明确凭据泄露风险。
- 可选方案：① 推荐：给外部调用方短迁移窗口后删除 GET，只保留 POST body；自动化改用短期、最小 scope token，而非长期 GM 密码；② GET 改为只接受一次性受限 token，并禁止密码参数；③ 暂时保留，要求网关对该路径彻底关闭 query/access/APM 记录，但仍不能消除浏览器和中间代理暴露。
- 2026-07-13 需要决定：确认仓库外是否仍有 GET 调用方及迁移期限；若没有，下一组可直接删除端点和兼容 smoke。

### D-009 `[?]` 18 个配置了技能的怪物在当前灵力成本规则下永远无法施放任何技能

- 当前证据：对 97 个怪物模板逐个以运行时 `calcQiCostWithOutputLimit`、生成后的 `maxQiOutputPerTick` 和 `maxQi` 计算，以下 18 个没有任何一项已配技能可支付：`m_ruin_guardian`、`m_wild_boar`、`m_swamp_lizard`、`m_wild_bandit`、`m_mire_spider`、`m_dust_vulture`、`m_spirit_wolf`、`m_bamboo_serpent`、`m_bamboo_sprite`、`m_bamboo_mantis`、`m_void_hunter`、`m_fallen_palace_lord`、`m_mine_ghoul`、`m_crystal_bat`、`m_town_rat_south`、`m_town_rat_refuse`、`m_gate_thug`、`m_night_blade`。例如 `m_swamp_lizard` 的技能基础成本 18、实际输出上限 2，折算成本 346，高于最大灵力 15；`m_wild_bandit` 的 `cloud_blade` 折算成本 256060，高于最大灵力 13。
- 潜在后果：这些怪物虽然内容上声明了技能，生产 AI 永远只能走普攻/移动分支；战斗难度、表现和掉落区域体验与配置意图不符。简单放宽通用公式会同时改变全部玩家和怪物技能成本，影响面远大于 18 个模板。
- 无法直接确定的原因：无法从代码判定是怪物 `maxQi/maxQiOutputPerTick` 偏低、技能配错、生成倾向缩放异常，还是设计上希望怪物沿用另一套成本规则；任一修复都会改变实际战斗平衡。
- 可选方案：① 推荐：先在内容启动校验中阻止“有技能但无一可施放”的模板，再逐个为怪物配置可负担的专用技能或校正灵力/输出倾向；② 给怪物定义明确且有文档/基线的专用成本倍率；③ 提高这 18 个怪物的最大灵力和输出，但需重新测伤害频率、难度和掉落效率。不要直接改通用玩家成本公式。
- 2026-07-13 需要决定：怪物是否应与玩家共用完整输出惩罚公式，以及优先采用“调内容”还是“怪物专用成本规则”；决定后需补内容校验和 18 个模板的基线 smoke。

以下候选仍属于本轮可以继续用代码和运行证据判定的技术项，不提前作为产品决策：

- 当前无已发现但尚未完成技术判定的候选；后续覆盖扫描发现的新候选会继续追加。

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
| 玩家统计总账 I/O 竞态 smoke | 通过 | 同玩家 load/flush 双向串行，持久基线与运行时增量只合并一次 | 不证明跨节点迁移或真实数据库长事务下的吞吐 |
| 玩家运行时 dirty-domain compiled smoke | 通过 | 直写 fencing 版本存在，核心玩家域精确标脏且不会退回全 snapshot | 不证明真实数据库 recovery watermark 的并发拒绝 |
| 工坊目录缓存动态 proof 与 compiled mutation smoke | 通过 | 按类型缓存、版本失效、会话清理；主动面板刷新不再使用目录载荷 | 不证明跨发布持久缓存或真实弱网冷开体验 |
| compiled `technique-activity-completion-proof` | 修复并接入 `verify:quick` 后通过 | 八类 strategy 注册、四段 pipeline 生命周期顺序、统一队列、任务视图、world facade 和面板 patch 边界 | 不替代各技艺玩法结果与 DB active job CAS smoke |
| 工坊 EventBus 生产边界与 compiled mutation smoke | 通过 | 专用面板/任务状态不再进入客户端空消费通道，且真实面板刷新仍正常发送 | 不决定五组休眠 EventBus 协议的最终去留 |
| 玩家状态同步前后端 production-boundaries | 通过 | player runtime 不再入队无版本状态，`hp/qi` 只由 SelfDelta、特殊数值/Buff 只由 PanelDelta 落地 | 不代替真实弱网与多息拥塞下的长时间测试 |
| 玩家 wallet 投影 compiled smoke 与 production-boundaries | 通过 | 通用/专用/成长背包变更只在灵石投影实际变化时推进 SelfDelta，普通物品不产生额外自身包；技艺结算刷新边界已锁定 | 不替代真实 DB durable 提交后的前端交互回归 |
| compiled `craft-persistence-dirty-domain-smoke` | 修复并注册后通过 | 炼丹预设/active job/强化记录/职业脏域、逐批扣料、wallet 扣费与 fencing seed 均执行到脚本末尾 | 无 DB，不证明真实表的 stale fencing 拒绝与崩溃恢复 |
| compiled `inventory-item-instance-ref-smoke` | 修复并注册后通过 | 背包重排后的使用、单件/批量丢弃、装备、强化、市场、阵法与排序均按稳定实例 ID 命中 | 无 DB，不证明 durable commit、断电恢复和真实客户端弱网重放 |
| compiled `gm-auth-token-revocation-smoke` | 新增并通过 | 改密即时撤销、登录/改密串行以及进程重启回读当前 `rev` | 内存假池，不证明多 HTTP 节点间的撤销传播与真实 DB 故障 |
| compiled `native-request-ip-smoke` | 修复并注册后通过 | 可信代理链解析、伪造链首拒绝、直连忽略头部与显式关闭/全信任语义 | 不证明正式服网络 ACL 与实际代理 CIDR 配置 |
| `pnpm audit:protocol` | 通过 | 无库主线服务实际启动、18 类场景的 C2S/S2C 事件覆盖与逐包字节统计；工坊重复目录、67KB envelope 和空消费 EventBus 载荷已消失；关闭 drain 完成 | 无数据库，因此未运行兑换码 DB 用例；也不直接证明 5000 并发带宽和压测结果 |
| `node packages/server/src/tools/check-production-boundaries.ts` | 修复后通过 | 24 个工具文件中的 37 处 Socket.IO 客户端全部显式使用 msgpack parser；直接 delta 消费方均覆盖 `SyncEnvelope` | 不证明外部仓库脚本或未执行场景的业务断言 |
| 无库 `pnpm verify:release:local` | 通过 | client build、server compile、production-boundaries、18 类稳定主线场景和 compiled protocol audit 均完成；含怪物六类、progression、combat、loot、认证、GM、兑换、恢复与关闭 drain | 明确不证明 persistence、shadow、acceptance、full、destructive；auth/GM/redeem 的 DB 分支因无数据库而跳过 |
| 聚焦 compiled `progression` stable case | 收紧断言后通过 | Socket 生命周期、envelope 解码及同 tick 灵气流转下仍完整注入接近 100 点；最终值 `99.9991977` | 不证明真实数据库持久化与长期多 tick 灵气演化 |
| `pnpm verify:quick`（加入 `registration-activation` 后） | 通过 | server/shared 编译、production-boundaries、release contract 及 12 个 quick case；证明成功请求不再清空 IP 失败预算，GM 密码跨入口共享主体预算 | 无 DB，不证明多节点间内存限流共享、真实代理/CDN 地址聚合及长期攻击流量 |
| `pnpm verify:quick`（加入 `native-auth-persistence-failure` 后） | 通过 | server/shared 编译、production-boundaries、release contract 及 13 个 quick case；证明账号库配置后连接失败会 503、readiness 降级、重载真实重连并冒泡失败 | 无真实 DB，不证明成功重连后的实表全量回读、数据库恢复事务或多节点镜像失效传播 |
| 战斗 action 边界拆分专项验证 | server compile 与 `combat-e2e-outcome-matrix`、`world-runtime-combat-action-service`、`world-runtime-combat-boundary` 三项 compiled smoke 通过 | 无状态 helper 拆分后动作定义、目标选择、结果应用、脏域、事件与热路径禁用项保持原契约；主服务为 2955 行 | `proof:file-size-gate` 仍因其他历史增幅文件失败，不证明其余巨型模块已完成拆分 |
| 协议审计 TypeScript 与职责拆分验证 | server compile、聚焦 `bootstrap-runtime` stable audit、完整 `pnpm audit:protocol` 均通过 | 主审计已受类型检查；18 类用例、账号/JWT 辅助、显示名、Markdown 投影、逐包统计和关闭 drain 保持可执行；主文件为 2953 行 | 无数据库，因此未执行 GM/兑换与持久化 seed 的 with-db 分支 |
| 鉴权启动 smoke TypeScript 与替身契约验证 | server compile、99 项编译产物导出兼容检查及显式无 DB/Redis 的完整 `auth-bootstrap` stable case 均通过 | `@ts-nocheck`、CommonJS、自读源码和 `eval` 已移除；当前 bootstrap 构造器、runtime 连接、恢复通知、trace、session 与主线协议断言真实执行；主文件为 6078 行 | 未运行数据库持久化、migration/compat 实表和多节点会话恢复分支；文件仍超过 3000 行 |
| 玩家分域持久化 smoke 拆分与清理合同 | server compile、显式无 DB/Redis 的 compiled smoke 通过 fake-pool 与清理聚合合同；文件体积门禁确认主文件退出错误清单 | 资产投影无裸整玩家删除、重复 slot 重排、非法 entry 拒绝和空偏好清理等 10 组无库合同仍执行；任一清理失败不会阻断后续任务且错误不会吞掉；主文件为 2091 行 | with-db 分支按预期跳过，未动态证明真实表清理、rollback 失败、watermark 或恢复投影 |
| 强事务 smoke 拆分与清理合同 | server compile、显式无 DB/Redis 的 compiled smoke 清理聚合合同通过；文件体积门禁确认主文件回到 baseline 内 | fixture 与编排边界已拆分；22 个收尾任务不中断且错误显式聚合，13 个事务不再吞 rollback 失败；主文件为 4293 行 | with-db 分支按预期跳过，未动态证明邮件/市场/钱包/装备/作业强事务、真实 rollback、outbox 和审计表清理 |
| 玩家成长权威边界拆分 | server compile、完整 `pnpm verify:quick` 和显式无 DB/Redis 的 compiled `progression` stable case 通过；文件体积门禁确认主服务退出错误清单 | 突破、功法、灵根、传法与输入归一化纯规则已离开有副作用的服务；完整成长主链与 quick 回归仍执行；主服务为门禁口径 2815 行 | 无数据库，不证明成长状态持久化、断电恢复、多玩家并发或长期数值演化 |
| 宗门持久化与运行时边界 | server compile、完整 `pnpm verify:quick`、`pnpm audit:boundaries` 和 10 项宗门相关 compiled smoke 通过；文件体积门禁确认主服务退出错误清单 | fake pool/provider 下的数据库配置 fail-closed、初始化重试、回滚错误聚合、主异步流程、核心归一化、虚拟边界、阵法/道具/房间风水联动和 2926 行职责边界 | 未连接真实数据库，不证明建表/核心修复/启动回读的实表语义、多节点一致性、长时间 tick 或连接中断恢复 |
| GM 玩家分域写入与服务边界 | server compile、完整 `pnpm verify:quick`、边界审计、4 项 GM 玩家 compiled smoke 和文件体积门禁已运行 | 7 条 GM 写入均为精确 domain、未知 section 拒绝、在线炼体 revision 确认、物品/恢复丹模板水合与 2944 行服务边界；新超限项降为 2 个 | 无真实 DB/HTTP 并发，不证明跨节点 GM、tick/flush 竞争和数据库故障时的实表最终值；高危审计 fail-open 仍待用户决定 |
| 背包实例投影与客户端水合 | `build:shared`、完整 `verify:client`、完整 `verify:quick` 及两端专项 proof/smoke 通过 | shared 字段覆盖、服务端分页完整投影、内部字段隔离、客户端不继承旧槽位及实例值优先均有确定性保护 | 不证明正式服历史异常物品、弱网长延迟翻页、实际包体分布和移动端视觉 |
| 背包分页请求生命周期 | 状态机 proof、完整 `verify:client`、`build:shared`、`audit:protocol`、完整 `verify:quick` 与 compiled 网关 smoke 通过 | 旧/无身份/错坐标/低 revision 回包拒绝，发送失败与超时解锁，服务端 requestId/knownRevision fail-closed | 未做浏览器弱网、socket 真断连、多节点路由与长时间重复翻页压测；既有构建警告未变 |
| 背包阵法弹窗职责拆分 | client TypeScript、生产边界 proof 与完整 `verify:client` 通过；文件体积门禁按预期仍退出 1 | 阵法共享公式、实例引用、范围预览清理和提交载荷已由窄控制器承载；主面板降至 3838 行且未更新 baseline | 其余详情与批量操作仍在巨型面板中；未做真实浏览器触控、焦点与长列表滚动回归 |
| 背包批量丢弃弹窗职责拆分 | client TypeScript、生产边界 proof 与完整 `verify:client` 通过；文件体积门禁按预期仍退出 1 | 筛选、选择、二次确认、缺失实例淘汰与单次关闭由专用控制器承载；总面板降至门禁口径 3580 行 | 无真实服务端并发和网络重放；详情/动作职责仍需继续拆分，文件体积门禁尚未恢复，其他 14 个 baseline regression 未变 |
| 背包单物品动作弹窗与上下文失效 | 专项状态 proof、client TypeScript、生产边界 proof 与完整 `pnpm verify:client` 通过；文件体积门禁确认主面板降至 2984 行 | 稳定实例身份、数量草稿、摧毁二次确认及特殊使用上下文失效均有确定性保护；背包面板退出新超限清单 | 无真实服务端资产并发、触控/焦点视觉回归；门禁仍因 14 个 baseline regression 退出 1 |
| 望气投影与 Pixi 地形缓存失效域 | `pnpm build:shared`、地图 lifecycle/spatial-cache proof 和完整 `pnpm verify:client` 通过；文件体积门禁按预期退出 1 | 绝对灵气统一换算等级，Canvas/Pixi 共用信号；资源/生命条变化精确失效动态层且不再销毁静态 GPU 分块 | 未做 WebGL GPU trace、低端真机半衰期长跑和视觉截图；14 个 baseline regression 仍未处理 |
| Pixi profiler 热路径与销毁生命周期 | 动态 profiler lifecycle proof、client TypeScript 与完整 `pnpm verify:client` 通过；文件体积门禁按预期退出 1 | 关闭时不再创建测量闭包/帧快照，启停和销毁可完整释放窗口、定时探针及全局闭包 | 未做 Chrome heap snapshot 与长时间 profiler 压测 |
| Pixi adapter 职责边界 | 图包/视觉 primitive 动态 proof、client TypeScript、完整 `pnpm verify:client` 与文件体积门禁对应检查通过 | adapter 降至 2971 行并退出唯一新超限，清单解析、纯视觉规则和场景类型形成窄边界 | 14 个历史 baseline 增幅仍使总体门禁退出 1；既有构建警告未变 |
| Pixi 实体与威胁箭头每帧状态 | 动态空间索引 proof、源码边界守卫、完整 `pnpm verify:client` 通过；文件体积门禁确认 adapter 当前 2987 行且无新超限 | crowd 遮挡使用当前帧插值/视口，实体动画共用帧时钟；威胁箭头按本地玩家身份着色、只读可见索引且不再分配数组兜底 | 未做真实多人 crowd 视觉回归、Chrome allocation profile 和移动真机帧率压测；既有 14 个 baseline 增幅未变 |
