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
| 客户端应用状态与断线/跨图生命周期 | 进行中 | `pnpm verify:client` 通过 | 逐条复核网络派生状态、迟到回包和重置边界 |
| UI 局部更新、焦点、滚动、选区 | 进行中 | 高频 UI continuity proof 通过 | 继续审查未被 proof 覆盖的面板和弹层 |
| 地图渲染、相机、命中与资源释放 | 进行中 | map render lifecycle、spatial cache proof 通过 | 动态检查移动端触控与大视口性能 |
| shared 类型、协议与 protobuf | 进行中 | shared build 全部契约检查通过 | 完成当前协议审计退出码与大包体复核 |
| 服务端网络同步、AOI、首包/增量 | 待检查 | `pnpm verify:quick` 的 runtime smoke 通过 | 逐字段检查频率、范围、恢复语义 |
| 服务端 runtime、tick、移动、战斗、交互 | 待检查 | server compile、quick runtime smoke 通过 | 按 mechanics 文档审查真实调用链和热路径 |
| 持久化、恢复、强事务与关闭 | 进行中 | server compile 通过；边界审计 forbidden 已清零 | 复核玩家/实例分域、flush、outbox、恢复围栏 |
| 配置编辑器、schema、导入发布 | 进行中 | `pnpm build:config-editor` 与 content-contract smoke 通过 | 复核字体资源警告及所有 raw 保存入口 |
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

## 待进一步验证或用户决定

当前尚无需要产品选择的确定项。以下候选会继续由本轮审计自行收集证据，不提前交给用户决策：

- client/config-editor 构建存在大 chunk 警告；需先确认首屏依赖和动态加载边界，再决定拆包方式。
- 当前协议报告出现约 58KB 的面板/离线报告载荷；需确认事件层级、触发频率和分页上限后再判断是否违反同步红线。

## 已执行验证

| 命令 | 结果 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| `pnpm verify:quick` | 通过 | server compile、生产边界基础 proof、无库 readiness/session/runtime smoke | DB 真源、shadow、完整业务和压力表现 |
| `pnpm verify:client` | 通过 | client typecheck/build、高频 UI、socket gate、空间缓存、地图生命周期等现有 proof | 浏览器视觉、所有面板运行时路径、弱网与移动真机 |
| `pnpm build:config-editor` | 通过但有字体/大 chunk 警告 | 编辑器 typecheck/build、content contract | 字体 URL 实际可用性、所有导入发布场景 |
| `pnpm proof:release-gates` | 通过 | release 脚本与文档契约 | 真实 DB/shadow/acceptance 运行结果 |
| `pnpm proof:file-size-gate` | 失败 | 已确认模块体积门禁失守 | 不直接证明功能错误 |
| `pnpm audit:boundaries` | 修复后通过 | forbidden 命中为 0，runtime template spread 与 registry freeze 检查通过 | 不替代 runtime、DB 恢复和性能压测 |
| `node packages/server/dist/tools/player-domain-empty-overwrite-guard-smoke.js` | 通过 | 真实 DB 中 7 个玩家分域空覆盖守卫、领悟清理边界和本次最终清理链 | 不证明 starter snapshot 入口与 recovery watermark 全链 |
