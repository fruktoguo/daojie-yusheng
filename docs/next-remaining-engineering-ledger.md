# next 剩余工程账本

更新时间：2026-04-08

## 1. 统一结论

当前 `next` 的整体进度，建议统一按下面四个口径理解：

- 如果只看“正式替换旧前台玩家主链”，当前约还差 `20% - 30%`
- 如果只看 `server-next` 自身独立化，当前约完成 `50% - 60%`
- 如果看“完整替换游戏整体”，当前约完成 `55%`
- 保守口径下，距离“完整替换游戏整体”仍约差 `40% - 45%`

必须同时说明的事实：

- `docs/next-legacy-boundary-audit.md` 当前已回到 `0 / 22`、`0`
- `pnpm --filter @mud/server-next verify:replace-ready` 已于 `2026-04-07` 再次实跑通过
- 这只说明 direct inventory 与本地主证明链已收口
- 这不等于 auth/bootstrap 真源已完成 next-native 替换
- 这不等于 GM/admin/restore 运营面已完全 next 化
- 这不等于“最小包体、最高性能、极高扩展度、系统稳定性”已经全部满足

## 2. 剩余工作总览

当前剩余工作，已经可以压缩成 3 个大块、10 个具体任务：

### 2.1 三个大块

1. `snapshot/player-source -> bootstrap/session` 真源替换本体
2. GM/admin/restore/shadow 与 legacy 删除门槛的证明链闭环
3. 首包 / 热路径 / 扩展边界 / 共享层稳定性的性能尾项

### 2.2 十个具体任务

| ID | 优先级 | 任务 | 当前状态 | 阻塞什么 | 是否可安全并行 |
| --- | --- | --- | --- | --- | --- |
| T1 | `P0` | `snapshot/player-source` 真源收口 | 未完成 | 完整替换、删 legacy `L1` | 否，需单线 |
| T2 | `P0` | `bootstrap/session` 真源收口 | 未完成 | 完整替换、删 legacy `L1` | 否，需单线 |
| T3 | `P0` | next token 真源最终脱离 legacy JWT 语义 | 部分完成 | 完整替换、删 legacy `L1` | 否，需单线 |
| T4 | `P0` | replace-ready 与 acceptance/full 证明链口径彻底写死 | 部分完成 | 正式接班口径、系统稳定性 | 是 |
| T5 | `P0` | GM/admin/restore 的统一自动 proof 与真实环境补证 | 部分完成 | 正式接班口径、删 legacy `L2-L5` | 是，需独立环境 |
| T6 | `P1` | legacy HTTP/GM/socket 外部旧入口退役策略 | 未完成 | 删 legacy `L2-L5` | 部分可并行 |
| T7 | `P1` | `shared-next` 类型/协议稳定化 | 部分完成 | workspace 验证稳定性 | 是 |
| T8 | `P1` | 首包瘦身与静态/低频/高频再拆层 | 未完成 | 最小包体、性能、扩展度 | 是 |
| T9 | `P1` | `WorldProjector/WorldSync` 热路径减重 | 未完成 | 最高性能、扩展度 | 是，低风险尾项可并行 |
| T10 | `P2` | legacy 最终删除与 compat 策略定稿 | 未完成 | 仓库清理完成态 | 否，必须最后做 |

## 3. 按目标拆分还差多少

### 3.1 如果目标是“正式替换旧前台”

当前主要不是前端表层问题，而是后端主链问题。

还差的核心项：

- `snapshot/player-source` 真源仍未完成 next-native 收口
- `bootstrap/session` 仍未完成 next-native 收口
- 默认 `verify:replace-ready` 虽已全绿，但还不等于 shadow/GM/admin 的完整实物验收
- 前台仍有少量首包、局部整刷、字符串键结构等尾项，但已不是 `P0`

结论：

- 距离“正式替换旧前台”，约还差 `20% - 30%`
- 主要卡在服务端主链，不主要卡在 `client-next` 表层 UI

### 3.2 如果目标是“完整替换游戏整体”

当前最大的剩余，不再是“还能扫出多少 direct legacy 命中”，而是：

- 登录 / 鉴权 / 会话 / bootstrap 的真源仍未完全 next-native
- GM/admin/restore 的运营面仍未形成完整自动化与真实环境闭环
- 包体、性能、扩展、稳定性四项目标都未全部达成

结论：

- 距离“完整替换游戏整体”，保守仍差 `40% - 45%`

### 3.3 如果目标是“把 legacy 全删掉”

当前还远没到全删阶段。

必须先过 [docs/next-legacy-removal-checklist.md](/home/yuohira/mud-mmo/docs/next-legacy-removal-checklist.md) 的 `L1-L5`：

- `L1` 真源替换完成：未完成
- `L2` 外部旧入口退役：未完成
- `L3` 自动 proof 全绿：部分完成
- `L4` 真实环境确认无人使用旧入口：未完成
- `L5` 观察窗口结束：未完成

结论：

- 现在不能全删 legacy
- 现在只能继续清理 `D/E` 类验证脚本和低耦合残留
- `A/B/C` 类运行主链与外部兼容入口还不能硬删

## 4. 详细任务账本

### T1. `snapshot/player-source` 真源收口

#### 为什么它还没完成

- 带库顺序型 proof 已经能证明“第一次 `legacy_seeded`、第二次 `next(native)`”
- 但 legacy snapshot fallback 仍在默认主链里
- 这意味着 provenance 与护栏已经有了，真源替换本体还没做完

#### 当前已完成

- `token/identity` 读优先级已收正为 `next -> compat -> token fallback`
- 非法 next identity / next snapshot / compat schema 缺失 / compat 坏 `mapId` / compat 坏 `unlockedMinimapIds` 等异常分支已加负向护栏
- `snapshot.source=miss` 在带数据库 authenticated proof 下已不再允许静默 fresh bootstrap

#### 还剩的具体工程项

1. 继续缩小默认主链里仍允许命中 legacy snapshot 的正常 fallback 面
2. 明确 next snapshot 真源装载路径，不再把 compat snapshot 当默认保底主分支
3. 补更完整的 snapshot 持久化失败矩阵 proof
4. 补更多 compat schema/字段异常的系统化 proof

#### 为什么它是 `P0`

- 它直接阻塞 `L1`
- 它直接阻塞“authenticated 主链是否已 next-native”
- 它直接决定 legacy player source 能不能退出主链

#### 并行策略

- 不安全并行
- 必须单线推进

### T2. `bootstrap/session` 真源收口

#### 为什么它还没完成

- 当前 guest canonical 路线已经收口
- 但 authenticated token-bearing 连接仍保留 compat 语义
- `bootstrap/session` 主流程还没有摆脱 legacy player source 与 legacy snapshot 装载思路

#### 这一轮刚收紧的内容

- `legacy_runtime` 下的 continuity 语义已进一步收口
- 当前已不再允许：
  - connected 旧 sid 复用
  - detached implicit resume
  - 显式携带旧 `sessionId` 的 requested resume
- `next-auth-bootstrap` smoke 现在会显式输出：
  - `explicitRequestedSid`
  - `explicitRequestedResumed`
  - `expectedExplicitRequestedResume`
- 最新无库实跑结果已证明 `legacy_runtime` 下 `explicitRequestedResumed=null`、`expectedExplicitRequestedResume=false`

#### 还剩的具体工程项

1. 把 authenticated bootstrap 主路径从 compat 装载降级为 next-native 装载
2. 明确 detached/resume/entryPath 在 next-native 下剩余未收口的固定语义
3. 让 bootstrap success/failure 更直接反映 next 真源命中，而不是 fallback 跑通
4. 把少量残留 bootstrap/协议兼容语义继续外提到更薄的 compat 壳

#### 为什么它是 `P0`

- 它是正式替换旧前台前的硬阻塞
- 它直接决定 next socket 会话是否真正独立

#### 并行策略

- 不安全并行
- 必须在 `T1` 基本收稳后单线推进

### T3. next token 真源最终脱离 legacy JWT 语义

#### 当前状态

- legacy HTTP auth 与 next socket auth 已共用一套 next token codec
- 但底层 token 规则仍未彻底摆脱 legacy JWT 兼容语义

#### 还剩的具体工程项

1. 定义 next token 的最终签发、校验、失效与错误码语义
2. 把 legacy JWT 从默认主规则降为显式兼容/迁移入口
3. 让 token proof 明确区分 next-native 与 compat token path

#### 为什么它是 `P0`

- 它是 `auth/token/bootstrap` 真源替换的一部分
- 不做完就不能说“主链已经 next-native”

#### 并行策略

- 不安全并行
- 不能与 `T1/T2` 同时混改

### T4. replace-ready / acceptance / full 口径彻底写死

#### 当前已完成

- `local / acceptance / full` 三层门禁已经形成稳定口径
- `verify:replace-ready` 已是唯一推荐的本地主证明链入口
- `verify:server-next*` 已退为兼容别名
- `verify:replace-ready:doctor` 已能提前暴露环境缺口

#### 还剩的具体工程项

1. 持续同步 README / TESTING / workflow / docs 的统一表述
2. 避免“默认门禁通过 = 完整替换就绪”的误读重新出现
3. 继续把 with-db / shadow / acceptance / full 的边界写死为可复跑的稳定口径

#### 为什么它是 `P0`

- 它直接决定“怎么证明可接班”
- 它是后续高风险真源替换的护栏

#### 并行策略

- 可安全并行
- 适合和低风险文档/脚本/审计任务并行推进

### T5. GM/admin/restore 与真实环境 proof 闭环

#### 当前已完成

- `gm-compat-smoke` 已覆盖 GM 关键写路径与管理只读面摘要
- `gm-database-smoke` 已覆盖 `backup / download / restore`、`pre_import`、状态一致性、部分业务态回滚证明
- `verify:replace-ready:shadow:destructive` 与 backup dir 持久化 proof 已有仓库内入口

#### 还剩的具体工程项

1. 明确哪些属于自动化门禁，哪些仍保留人工回归
2. 在真实带库 / maintenance window / shadow 环境继续补证
3. 完成 `L4` 的旧入口无人使用观测
4. 完成 `L5` 的稳定观察窗口

#### 为什么它是 `P0`

- 不完成就不能说“可正式接班”
- 不完成就不能安全删 legacy 外部入口

#### 并行策略

- 可以并行
- 但很多项依赖独立环境，不是单靠代码仓库能收口

### T6. legacy HTTP/GM/socket 外部旧入口退役策略

#### 当前还不能删的核心族

- `compat-http.registry.js`
- `src/compat/legacy/http/*`
- `legacy-gm-compat.service.js`
- `legacy-session-bootstrap.service.js`
- 以及 `docs/next-legacy-removal-checklist.md` 中 `L2` 标记的整组文件

#### 还剩的具体工程项

1. 明确旧客户端、旧 GM、旧运营脚本是否还依赖这些入口
2. 决定是彻底退役，还是暂保留外层 compat 壳
3. 保证 compat 不再反向污染 runtime 真源和 next 主链

#### 为什么它是 `P1`

- 它阻塞删 legacy
- 但不一定阻塞“前台先正式切到 next”

#### 并行策略

- 部分可并行
- 代码分桶、文档、观测和调用方盘点可以先做

### T7. `shared-next` 类型/协议稳定化

#### 当前状态

- 它已不是当前事实阻塞
- 但仍是 workspace 级风险源

#### 还剩的具体工程项

1. 继续补 shared 类型一致性约束
2. 把“新增字段必须同时补初始化/克隆/重置/投影”的规则固定下来
3. 避免未来再次出现 shared 层先拦住 replace-ready 的情况

#### 为什么它是 `P1`

- 它不直接决定替换完成
- 但会持续影响验证稳定性与扩展效率

#### 并行策略

- 可安全并行

### T8. 首包瘦身与包体再拆层

#### 当前短板

- `Bootstrap` 与 `MapStatic` 仍有重复静态信息
- `Bootstrap.self` 仍是巨型 `PlayerState`
- `Bootstrap` 后通常还跟 `PanelDelta(full)` 与 `Quests`
- 传输主线仍是 Socket.IO JSON，而不是更窄的主协议包体

#### 还剩的具体工程项

1. 继续拆首包中的静态/低频/高频
2. 评估 `Bootstrap.self` 的 slice 化
3. 继续减少重复静态字段与大对象首屏投递

#### 为什么它是 `P1`

- 它不阻塞基本替换
- 但直接决定“最小包体”能否成立

#### 并行策略

- 可安全并行
- 但要避免和 auth/bootstrap 真源重写同轮混改

### T9. `WorldProjector/WorldSync` 热路径减重

#### 当前短板

- 每 tick/每连接仍偏向整量 capture/clone 后再 diff
- `buildPlayerView` 仍承担 FOV、扫描、排序等重计算
- 自动战斗还会叠加相近构建
- 前后台都缺少高负载极限性能门禁证据

#### 还剩的具体工程项

1. 降低每 tick / 每连接的整量视图重建
2. 减少高频对象克隆与排序
3. 继续压薄投影与同步层的中心耦合
4. 建立更硬的高负载性能门禁或基准

#### 为什么它是 `P1`

- 它直接决定“最高性能”“极高扩展度”能否达标
- 但不是当前最先阻塞替换的主因

#### 并行策略

- 低风险尾项可并行
- 热路径结构性大改不应与 `T1/T2/T3` 同轮混做

### T10. legacy 最终删除与 compat 策略定稿

#### 现在为什么还不能做

- `L1-L5` 未满足
- 运行主链与外部兼容入口都还没完成退出

#### 最终才该做的事

1. 决定哪些 compat 壳保留
2. 决定哪些 legacy 文件删除
3. 决定哪些只保留迁移入口
4. 最后再删 compat smoke / boundary audit 类脚本

#### 为什么它是 `P2`

- 它必须最后做
- 现在提前硬删会直接制造回归风险

## 5. 对最初四项目标的达成度

### 最小包体：`部分满足`

已满足的部分：

- `WorldDelta / SelfDelta / PanelDelta` 已是增量同步
- `client-next` 主链已 next-only

未满足的核心：

- 首包仍偏肥
- 静态与低频层仍有重复
- `Bootstrap.self` 仍偏大
- 传输主线仍不是更窄的 next 主协议

### 最高性能：`未满足`

核心原因：

- 热路径总计算量仍重
- projector/sync 仍偏整量 capture/clone/diff
- 缺高负载极限门禁

### 极高扩展度：`部分满足`

已满足的部分：

- 协议主链分层已成形
- 前台已有 panel registry 与多端布局基础

未满足的核心：

- `WorldProjectorService / WorldSyncService` 中心耦合仍高
- `Bootstrap.self` 巨型对象仍会放大新增字段成本
- 部分 UI/渲染抽象仍不够彻底

### 系统稳定性：`部分满足`

已满足的部分：

- `replace-ready`
- `with-db`
- `shadow`
- 协议审计
- readiness/GM database/smoke 基础链

未满足的核心：

- 默认门禁不等于完整替换验收
- shadow/GM/admin/restore 仍未形成完整统一证明
- 真实环境与观察窗口仍未走完

## 6. 删 legacy 的剩余门槛

### 当前判断

| 门槛 | 当前状态 | 说明 |
| --- | --- | --- |
| `L1` | 未完成 | `snapshot/player-source`、`bootstrap/session`、token 真源仍未完全退出 legacy |
| `L2` | 未完成 | legacy HTTP/GM/socket 外部入口仍在 |
| `L3` | 部分完成 | 本地与部分 with-db/shadow proof 已有，但不等于全部环境闭环 |
| `L4` | 未完成 | 还缺真实环境“无人使用旧入口”确认 |
| `L5` | 未完成 | 还缺稳定观察窗口 |

### 当前还能安全做的

- 继续清理验证/审计脚本分桶
- 继续复核低耦合孤儿残留
- 继续把“运行主链阻塞”和“验证脚本”分开治理

### 当前不要做的

- 因为 boundary audit 已清零就整批删 legacy
- 在 `L1` 未过前把运行主链 compat 文件一把拔掉
- 在 `L2-L5` 未过前删除 compat HTTP registry 与旧 controller

## 7. 推荐执行顺序

### 第一阶段

- `T4` replace-ready / acceptance / full 口径继续写死
- `T5` GM/admin/restore/shadow 补证继续收口

目标：

- 先把“怎么证明可以接班”彻底写清

### 第二阶段

- `T1` `snapshot/player-source` 真源收口
- `T2` `bootstrap/session` 真源收口
- `T3` token 真源最终脱离 legacy 语义

目标：

- 解决真正的 `P0` 主链阻塞

### 第三阶段

- `T7` shared 稳定化
- `T8` 首包瘦身
- `T9` 热路径减重

目标：

- 把“能替换”推进到“替换后足够好”

### 第四阶段

- `T6` legacy 外部入口退役策略定稿
- `T10` legacy 最终删除与 compat 策略定稿

目标：

- 最后再谈删 legacy，而不是现在硬删

## 8. 一句话回答“现在还差多少”

如果要一句话说完：

- 离“正式替换旧前台”还差 `20% - 30%`
- 离“完整替换游戏整体”还差 `40% - 45%`
- 离“全删 legacy”还明显不是最后一步

现在最大的剩余，已经明确收缩到：

- `snapshot/player-source`
- `bootstrap/session`
- GM/admin/restore/shadow 的真实闭环
- 首包/热路径/扩展边界的性能尾项
