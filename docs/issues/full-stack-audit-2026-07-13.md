# 前后端全链路审计台账（2026-07-13）

## 审计口径

- 生产主线：`packages/client`、`packages/shared`、`packages/server`、`packages/config-editor`。
- 当前基线：`main` 分支 `afb9d94d`；相对 `origin/main` ahead 27。
- package manager：`pnpm@10.29.1`。
- 每项结论必须来自机制文档、完整调用链、测试、编译产物或运行数据；仅凭搜索未发现异常不能标记为“确认无问题”。
- `[x]` 只表示该行列出的具体证据范围已完成，不代表相邻系统或整个项目已完成。
- 开始审计时已有未提交的 tick 调度代码、smoke 及相关文档修改；它们随后独立形成 `a5c7b0f6`。本轮未修改、暂存或夹带这些文件。

## 覆盖矩阵

### 基线与边界

- [x] A-01 工作区、分支、近期提交、package scripts、mechanics 索引和现有持久化审计材料已盘点。
- [ ] A-02 `packages/*` 生产模块、入口、后台 worker、smoke/proof/audit 与文档的完整对应关系。
- [ ] A-03 公共 API、依赖方向、文件职责和运行时/网络/持久化/UI 边界审计。
- [x] A-04 NPC 任务写路径 smoke 的 TypeScript 绕过、构造器漂移和错误资产模型已修复；见 FS-022。
- [x] A-05 NPC 商店 smoke 的 TypeScript 绕过、提前成功输出和旧分步资产模型已修复；见 FS-024。
- [x] A-06 阵法运行时 smoke 的 TypeScript 绕过、投影/地块夹具漂移和旧 API 调用已修复；见 FS-027。
- [x] A-07 `world-runtime-craft-smoke` 的建筑夹具缺失 AOI chunk revision 索引问题已修复；见 FS-030。

### 资产、持久化与恢复

- [ ] P-01 玩家身份、会话、presence 三态、快照分域、flush、watermark 与重启恢复。
- [ ] P-02 背包、装备、货币、神器、功法、任务等玩家资产的原子写入、幂等、回滚和回读。
- [ ] P-03 地图实例 catalog、lease/epoch、checkpoint、tile/overlay/container/building 等实例域。
- [ ] P-04 市场、邮件、宗门、宝库、技艺 job、强化、兑换码和 GM 操作的 durable/outbox/audit 链。
- [ ] P-05 retention、archive、cleanup、备份恢复和所有会落库验证的自动清理。
- [x] P-06 密室拆除的活跃 lease/ownership epoch fence 已完成静态审计并修复；验证与提交信息见 FS-001。
- [x] P-07 通用托管实例到期销毁的 catalog lease/epoch CAS、失败保留运行态和旧 writer 隔离已修复；见 FS-002。
- [x] P-08 通天塔空闲实例的 dirty 落盘、统一销毁入口与 catalog CAS 顺序已修复；见 FS-004。
- [x] P-09 普通启动与 GM 恢复错误批量销毁实例 catalog 真源的问题已修复；见 FS-005。
- [x] P-10 普通实例与通天塔恢复先水合后取得 lease 的顺序错误已修复；见 FS-006。
- [x] P-11 启动 catalog 注册可能回退 ownership epoch、长队列水合前 lease 过期的问题已修复；见 FS-007。
- [x] P-12 动态实例从创建到 catalog 注册、lease claim 和可写状态之间的异步空窗已修复；见 FS-008。
- [x] P-13 lease 到期后的 5 秒旧节点写入宽限已移除；见 FS-010。
- [x] P-14 宗门实例 shell、入口、地块和护宗阵在 lease 就绪前被应用的问题已修复；见 FS-011。
- [x] P-15 玩家心跳与断线 presence 的提交确认、单域修订清理和关机失败上报已修复；见 FS-014。
- [x] P-16 玩家集合分域已提交但零行时复活 starter 资产与状态的问题已修复；见 FS-015。
- [x] P-17 GM 全服广播邮件的全快照枚举、逐玩家串行投递和部分提交问题已修复；见 FS-016。
- [x] P-18 兑换码灵石写错真源、拆分资产事务及 pending 重试重复规划问题已修复；见 FS-017。
- [x] P-19 Runtime 钱包/背包管理入口写错资产真源、缺少稳定重放身份且生产降级为易失写的问题已修复；见 FS-020。
- [x] P-20 NPC 任务灵石奖励未进入背包真源、钱包投影按旧模型增量覆盖的问题已修复；见 FS-021。
- [x] P-21 NPC 商店扣款释放格子仍被拒绝、堆叠可溢出且 fallback 分步改资产的问题已修复；见 FS-023。
- [x] P-22 邮件灵石附件按旧钱包增量投影、堆叠可越过数量上限的问题已修复；见 FS-025。
- [x] P-23 布阵、普通阵法补给和护宗大阵一次性注入的玩家资产与阵法后态分步提交问题已修复；见 FS-026。
- [x] P-24 普通阵法与宗门阵法数据库 writer 可越过实例 lease handoff 覆盖/删除新节点后态的问题已修复；见 FS-028。
- [x] P-25 阵法维护每息分步提交玩家灵力、技艺/job 与阵法后态的问题已修复；见 FS-029。

### 服务端权威运行时

- [ ] R-01 tick、实例调度、意图队列、取消/中断、超时和重启后的状态推进。
- [ ] R-02 移动、寻路、占位、跨图传送、AOI、首包与断线重连。
- [ ] R-03 战斗、仇恨、技能、buff、怪物 AI、刷新掉落和 PvP 权限。
- [ ] R-04 建筑、房间、风水、灵气场、技艺 job、NPC、任务、自动化和 Actor。
- [ ] R-05 5000 玩家/10000 实例口径下的索引、队列、定时器、Worker、缓存和热路径分配。
- [x] R-06 通天塔空闲生命周期的失败重试、资源卸载与重启恢复相邻链路已完成专项验证；见 FS-004。
- [x] R-07 启动期 catalog 注册、claim/sync、实例分域水合和塔层 detached cache 顺序已完成专项修复；见 FS-006。
- [x] R-08 在线 bootstrap、控制器、通天塔和跨线迁移的玩家挂接统一等待动态实例 lease，并通过真实运行时 attach gate；见 FS-009。
- [x] R-09 跨线偏好和通天塔当前层只在目标实例接入成功后推进；见 FS-012。

### shared、协议与内容链路

- [ ] S-01 C2S/S2C 类型、运行时校验、鉴权入口、请求幂等与迟到/乱序响应。
- [ ] S-02 bootstrap/static/detail/delta 分层、AOI 范围、字段最小化和客户端消费完整性。
- [ ] S-03 结构化通知 key/变量、i18n 生成与所有服务端玩家可见消息入口。
- [ ] S-04 config-editor → shared schema → 导入校验 → server catalog → client catalog/展示。
- [ ] S-05 新 schema 唯一真源、GM 兼容转换目录和旧格式运行时门禁。
- [x] S-06 兑换与异步导航异常把原始服务端错误文本发给玩家的问题已修复；见 FS-031。
- [x] S-07 待执行指令异常透传未分类服务端错误文本的问题已修复；见 FS-032。
- [x] S-08 通天塔进入、通关与退出通知已迁移为结构化 key/变量，并通过真实运行时烟测；见 FS-033。
- [x] S-09 自动凝练根基的手动开关与 tick 自动关闭通知已统一为结构化 key；见 FS-034。
- [x] S-10 世界迁移的现世/虚境与保持/切换四种成功通知已使用稳定结构化 key；见 FS-035。

### 客户端、UI 与渲染

- [ ] C-01 状态真源与不可变派生、重复状态、全量重建、晚响应和登录/session epoch。
- [ ] C-02 Socket 绑定/解绑、重连、请求生命周期、事件消费和错误反馈。
- [ ] C-03 HUD、面板、弹层、列表、输入、滚动、焦点、展开态和局部 patch 连续性。
- [ ] C-04 浅色、深色、手机、安全区、触控命中、弹层高度和固定按钮遮挡。
- [ ] C-05 Canvas/Pixi 分层、相机、投影、命中测试、缓存失效、资源释放和帧性能。

### 跨链路与安全

- [ ] X-01 鉴权、权限、IDOR、输入边界、速率限制、错误泄露和 GM 高危操作。
- [ ] X-02 并发、重复、乱序、部分失败、COMMIT 结果未知、lease handoff 和旧态覆盖。
- [ ] X-03 首次进入、跨图、断线重连、滚动重启、恢复接管和配置发布后的端到端一致性。
- [ ] X-04 最终最小门禁、专项 proof、with-db、协议/边界审计及未覆盖风险汇总。
- [x] X-05 实例接管 smoke 的阵法双资源夹具、生产默认环境隔离和全应用关闭超时已修复；见 FS-003。
- [x] X-06 动态实例/动作/宗门相关 smoke 的类型绕过、陈旧断言、未定义变量和本地数据库环境串扰已修复；见 FS-013。
- [x] X-07 inventory durable with-db smoke 未注入共享连接池、实际禁用被测服务的问题已修复；见 FS-018。
- [x] X-08 生产显式开启 `/runtime` 控制面但缺少管理 token 时无鉴权放行的问题已修复；见 FS-019。

## 已确认问题

### FS-001 密室拆除可越过远端活跃 lease 销毁实例

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：建筑 / 密室 / 实例目录 / 持久化恢复。
- **影响链路**：外部建筑拆除或启动清理 → `TimeChamberRuntimeService.prepareDeconstruct()` → `instance_catalog` → `instance_time_chamber_state` → 本地实例清理。
- **证据**：修复前 `prepareDeconstruct()` 只检查本进程能看到的在线玩家和玩家位置持久态，随后无条件执行 `UPDATE instance_catalog ... WHERE instance_id = $1`。SQL 未校验 `assigned_node_id`、`lease_token`、`ownership_epoch`，也未在 destroyed 转换时递增 epoch。
- **根本原因**：拆除流程把“本地未发现占用”等同于“本节点拥有目标实例写权”，没有把来源建筑实例和密室独立实例可能分属不同节点纳入生命周期设计；实例状态删除与所有权 fence 没有形成同一事务。
- **为什么错误**：密室实例是独立持久实例，服务端权威写入必须受它自己的 lease/epoch 保护。本地来源实例可写不能证明密室实例仍归本节点；只清空 lease 而不递增 epoch 也无法隔离已经拿到旧 epoch 的 flush writer。
- **触发条件**：密室实例已迁移或被其他节点接管，而外部建筑仍在旧节点处理拆除/启动清理；或者旧运行态与新 lease 短时并存。
- **可能后果**：远端仍有在线玩家时实例目录被标记 destroyed/stopped；玩家无法正常离开或恢复；新节点写入被旧节点生命周期操作破坏；旧 epoch 的排队 flush 可能在销毁后继续回写实例域。
- **修复方式**：拆除事务先 `SELECT ... FOR UPDATE` 锁定目标 catalog 行；活跃 lease 只接受与本地运行态完全一致的 `assignedNodeId / leaseToken / ownershipEpoch`；冲突时失败关闭并保留建筑与密室状态。允许销毁时在同一事务中递增 `ownership_epoch` 和 `metadata_version`、清空 lease、标记 destroyed/stopped，再以密室 `revision` 为条件删除领域状态；事务提交后才清理内存态和调度索引。
- **实际修改**：`time-chamber-runtime.service.ts` 增加运行态可写检查、catalog 行锁、活跃 lease 精确匹配、epoch 递增和密室 revision 删除 fence；`time-chamber-runtime-smoke.ts` 增加远端 lease 拒绝与本地 lease 原子销毁证明；机制文档同步销毁约束。
- **验证结果**：`git diff --check` 通过；`pnpm --filter @mud/server compile` 通过；compiled `time-chamber-runtime-smoke` 通过；真实 PostgreSQL `time-chamber-durable-fuel-smoke` 通过，并证明远端 lease 拒绝、本地 lease 原子销毁、epoch 递增、状态删除和夹具清理；`pnpm verify:quick` 通过。`verify:quick` 只证明日常服务端编译、生产边界与无库 smoke 子集，不替代完整 release/shadow/acceptance 门禁。
- **中文原子提交 hash**：`267b1349`（`fix(persistence): 加固密室拆除实例租约围栏`）。

### FS-002 通用托管实例到期销毁先删运行态再无围栏覆盖 catalog

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：地图实例 / 生命周期 / catalog / lease 与 ownership epoch。
- **影响链路**：实例 `destroyAt` 到期 → `syncAllInstanceLeases()` → `destroyExpiredManagedInstances()` → `destroyManagedInstance()` → 内存运行态与实例各领域缓存 → `instance_catalog`。
- **证据**：修复前 `destroyManagedInstance()` 在确认本地玩家列表为空后，立即把实例改为 destroyed/stopped，并删除实例运行态、tick progress、掉落容器、事件总线和阵法缓存；最后才调用普通 `upsertInstanceCatalog()`。该 upsert 没有匹配当前 `assigned_node_id / lease_token / ownership_epoch`，也没有递增 epoch，且数据库异常会发生在内存清理之后。
- **根本原因**：通用销毁链把 catalog 当成可事后补写的镜像，而不是多节点实例归属与恢复的持久化真源；销毁没有被设计成 ownership 转换，因而遗漏 CAS、epoch 推进和提交顺序。
- **为什么错误**：本地“无玩家”只证明本进程没有玩家，不能证明当前节点仍拥有写权。销毁是终止所有旧写者的所有权变更，必须先由数据库原子确认当前 lease/epoch，并推进 epoch；否则旧节点或迟到 flush 仍可能覆盖新目录状态。
- **触发条件**：实例到达 `destroyAt` 时 lease 已被其他节点接管；本地 runtime 的 token/epoch 落后；catalog 写入暂时失败；或旧 epoch flush payload 仍在队列中。
- **可能后果**：旧节点卸载本地运行态后把远端活跃实例标记 destroyed；数据库失败时 catalog 仍显示 active，随后启动恢复出一个本地已经销毁过的实例；旧 epoch 写任务在销毁后回写地块、容器、建筑或阵法状态；过期实例清理静默失败且难以定位。
- **修复方式**：在 `InstanceCatalogService` 增加单条 `UPDATE ... WHERE instance_id + ownership_epoch + lease pair` 的销毁 CAS；只允许运行态与数据库均无 lease，或精确匹配当前本地 lease。成功时原子设置 destroyed/stopped、清空 lease、递增 `ownership_epoch`、推进 `metadata_version`；运行时只有拿到新 epoch 后才卸载全部本地状态。CAS 冲突、租约不完整、非本地 lease 或能力缺失均失败关闭并保留运行态；周期清理记录明确拒绝原因。
- **实际修改**：`instance-catalog.service.ts` 新增 `destroyInstanceCatalogWithFence()`；`world-runtime-instance-lease.helpers.ts` 调整通用销毁顺序、租约校验、epoch 回填与拒绝日志；`instance-lease-runtime-smoke.ts` 增加真实 PostgreSQL 的远端冲突保留运行态、本地精确 lease 销毁和 epoch `4 → 5` 证明；schema 文档同步 catalog 约束。
- **验证结果**：`git diff --check` 通过；`pnpm --filter @mud/server compile` 通过；compiled `instance-lease-runtime-smoke` 使用真实 PostgreSQL 完整以 0 退出，证明冲突时 catalog/运行态均不变、成功时先递增 epoch 再卸载，且清理后 4 个实例的 catalog/formation 行计数均为 0；compiled `instance-lease-sync-error-smoke`、`instance-lease-periodic-force-reclaim-smoke` 与 `instance-ownership-epoch-replay-smoke` 通过；`pnpm verify:quick` 通过。`verify:quick` 不证明完整 persistence/shadow/acceptance/full 或真实多节点 split-brain。
- **中文原子提交 hash**：`8424735c`（`fix(persistence): 加固通用实例销毁租约围栏`）。

### FS-003 实例 lease 核心 smoke 因夹具与运行环境漂移无法完成证明

- **状态**：已修复、验证并提交。
- **严重级别**：P1（验证门禁失效，不直接改变玩家运行态）。
- **所属功能组**：实例 lease / 接管恢复 / 阵法持久化 / smoke 生命周期。
- **影响链路**：compiled smoke 启动 → 阵法持久化夹具 → 实例接管恢复 → ownership replay 断言 → Nest 全应用关闭 → 退出码。
- **证据**：原 `instance-lease-runtime-smoke` 仍只写 `remaining_aura_budget`；阵法已拆分为 `remaining_qi_budget` 与 `remaining_spirit_stone_budget`，后者默认 0，恢复逻辑会按机制正确判定灵石耗尽并拒绝加载，因此接管断言得到 `undefined`。修正夹具后，旧统一 10 秒超时又会在全应用启动完成前退出；实测完整断言与优雅关闭约需 46 秒。相邻 `instance-lease-periodic-force-reclaim-smoke` 只清除 `SERVER_RUNTIME_ENV`，但工具入口会加载本地 `NODE_ENV`，使“未声明环境按生产口径”用例误走测试环境强制接管分支。
- **根本原因**：阵法 schema 演进未同步跨领域接管夹具；全应用 DB smoke 没有自己的实测超时预算；生产默认策略用例没有隔离 `shouldForceReclaimStaleLease()` 实际读取的全部环境变量。
- **为什么错误**：失败发生在被测 lease/epoch 断言之前或成功输出之后，既不能证明接管安全，也会制造与业务代码无关的红灯；更严重的是，核心 fence 以后即使回归，门禁也可能因为先前固定失败而失去辨识力。
- **可能后果**：实例接管、旧 epoch replay、dirty write 阻断与销毁 fence 长期没有可信的自动化回归证明；CI/本地排查把夹具错误误判成生产故障；开发者可能为“修测试”错误放宽阵法恢复或强制接管规则。
- **修复方式**：夹具同时写入与机制一致的灵力池和灵石池，并在冲突更新时同步两者；将 `smoke-timeout.ts` 收敛为规范 TypeScript，为该全应用 DB smoke 设置 60 秒条目级预算；生产默认用例同时保存、清除并恢复 `SERVER_RUNTIME_ENV` 与 `NODE_ENV`，不依赖调用者环境。
- **实际修改**：更新 `instance-lease-runtime-smoke.ts` 的阵法 seed、销毁 fence proof 与清理列表；规范化 `smoke-timeout.ts` 并增加 `instance-lease-runtime-smoke.js = 60_000`；修正 `instance-lease-periodic-force-reclaim-smoke.ts` 的环境隔离。
- **验证结果**：默认命令下 `instance-lease-runtime-smoke` 约 46 秒以 0 退出；阵法在接管阶段成功恢复，旧 ownership epoch 写入仍被阻断，新增销毁 CAS 证明通过；修正环境隔离后的默认 `instance-lease-periodic-force-reclaim-smoke` 通过，证明生产默认拒绝未到期远端 lease、周期同步不泄漏 force reclaim、显式开发启动恢复仍按 replay → CAS 顺序强制接管；`pnpm verify:quick` 通过。
- **中文原子提交 hash**：`8424735c`（`fix(persistence): 加固通用实例销毁租约围栏`）。

### FS-004 通天塔空闲清理吞掉落盘失败并绕过统一销毁围栏

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：通天塔 / 空闲生命周期 / 实例分域 / catalog lease。
- **影响链路**：世界维护 tick 或玩家退出 → `WorldRuntimeTongtianTowerService.cleanupIdleInstances()` → `flushInstanceDomains()` → 本地实例/tick/loot/event/formation 清理 → `instance_catalog`。
- **证据**：修复前空闲满 3600 息后即使 `flushInstanceDomains()` 抛错也只记录 warning 并继续；随后先把内存实例设为 destroyed/stopped、清掉全部本地索引，最后用普通 `upsertInstanceCatalog()` 无条件写 destroyed。该路径既没有确认落盘后是否仍有 dirty domain，也没有匹配当前 lease/token/epoch 或递增 epoch。
- **根本原因**：通天塔把空闲销毁实现成了独立生命周期，复制了通用实例卸载步骤，却没有复用实例 catalog 的权威销毁事务；“尽力落盘”的异常处理错误地被用于要求“销毁并落盘”的持久实例。
- **为什么错误**：机制明确要求空闲实例“销毁并落盘”，因此落盘失败不能被视为可继续条件；通天塔层又是可被接管、重启恢复的持久实例，销毁必须遵守与其他托管实例相同的 lease/epoch 所有权围栏。本地空层不等于本节点仍拥有 catalog 写权。
- **触发条件**：空闲塔层达到 3600 息时 PostgreSQL/分域写入失败、durable COMMIT 结果未决、落盘后并发产生新 dirty、lease 已迁移或 catalog epoch/token 与内存不一致。
- **可能后果**：最新塔层状态未落盘就被永久卸载；重启后从旧 checkpoint 恢复出过期怪物/地块/容器状态；旧节点可把远端已接管塔层标记 destroyed；旧 epoch flush 在销毁后回写；失败只留下 warning，下一维护周期已没有运行态可重试。
- **修复方式**：空闲清理先要求 `flushInstanceDomains` 能力并完成落盘，异常时保留实例；落盘后通过全局 dirty 清单复查，仍 dirty 时继续保留。只有两道检查都通过才调用同层 `world-runtime-instance-lease.helpers.ts` 的 `destroyManagedInstance()` 权威入口，由其执行在线玩家复查、当前节点 lease 校验、catalog lease/epoch CAS、epoch 递增和提交后的内存卸载；能力缺失、CAS 拒绝或数据库异常均按实例记录原因并等待下轮重试。
- **实际修改**：`world-runtime-tongtian-tower.service.ts` 删除重复的本地卸载与普通 catalog upsert，改为“flush → dirty 复查 → 统一销毁”，并直接复用实例生命周期 helper，未向已经到达生产边界阈值的 `WorldRuntimeService` facade 增加新职责；`tongtian-tower-smoke.ts` 增加落盘异常、落盘后仍 dirty、catalog 冲突和精确 lease/epoch 成功四段证明；机制文档同步失败关闭与 CAS 顺序。
- **验证结果**：`git diff --check` 与 `pnpm --filter @mud/server compile` 通过；compiled `tongtian-tower-smoke` 通过，证明前三种失败均保留原运行态且不提前清理 tick/loot，成功时携带本地 lease 与 epoch `4`、采用 catalog 新 epoch `5` 后卸载；真实 PostgreSQL `tongtian-tower-persistence-smoke` 通过且自清理玩家进度夹具；compiled `world-runtime-tower-restart-recovery-smoke` 通过，证明重启恢复仍先裁定塔层 lease 再恢复离线挂机玩家；`pnpm verify:quick` 完整通过，生产边界检查确认 `world-runtime.service.ts` 仍为阈值内的 1200 行。`verify:quick` 不证明完整 persistence/shadow/acceptance/full 或真实多节点 split-brain。
- **中文原子提交 hash**：`77c0cced`（`fix(persistence): 加固通天塔空闲销毁围栏`）。

### FS-005 世界运行态重建把 catalog 真源批量改成 destroyed/stopped

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：服务启动 / GM 数据库恢复 / 实例 catalog / 生命周期终态。
- **影响链路**：`ServerLifecycleCoordinatorService.recoverWorld()` 或 `NativeDatabaseRestoreCoordinatorService.reloadAfterRestore()` → `WorldRuntimeLifecycleService.rebuildPersistentRuntimeAfterRestore()` → `instance_catalog.updateInstanceStatus()` / `upsertInstanceCatalog()` → catalog 接管与玩家恢复。
- **证据**：修复前 `rebuildPersistentRuntimeAfterRestore()` 默认令 `rewriteCatalogRuntimeStatus = true`；普通启动在未配置环境变量时默认走 eager 并显式传 true，GM 数据库恢复也显式传 true。方法先把 catalog 可恢复条目物化到内存，随后遍历全部本地实例，以仅含 `instance_id` 的无条件 `UPDATE` 写入 `destroyed/stopped`，再用普通 upsert 清空 lease；两次写入都没有匹配当前节点、lease token 或 ownership epoch。
- **根本原因**：早期实现把“丢弃当前进程的旧内存对象并从数据库重建”错误建模为“销毁数据库中的实例”，混淆了本地运行态 reset 与持久化生命周期终态；后来新增轻量/完整恢复选项时只给该旧循环加了开关，又在默认恢复改回 eager 后重新启用了它。
- **为什么错误**：`instance_catalog` 是启动扫描、节点归属和恢复判断的真源，重启或导入后的内存重建不代表实例业务生命周期结束。真正销毁必须由显式流程按 `assigned_node_id + lease_token + ownership_epoch` 做 CAS 并递增 epoch；恢复代码无权根据本地枚举结果越过远端所有权写终态。
- **触发条件**：启用 PostgreSQL 实例 catalog 后进行默认 eager 服务启动，或执行 GM 数据库恢复；只要待恢复 catalog 条目被物化或本地仍有同 ID 运行态，就会进入无围栏重写。
- **可能后果**：仍应恢复的公共、宗门、个人或长生命周期实例在 catalog 中变成终态，后续 `shouldRestoreCatalogEntry()` 直接跳过；实例分域数据留在数据库却失去可恢复目录，形成持久化孤儿；离线挂机玩家因目标实例缺失被隔离；旧节点还能覆盖新节点的活跃 lease，造成双节点接管/卸载错乱。
- **修复方式**：彻底删除 `rewriteCatalogRuntimeStatus` 选项及批量 `updateInstanceStatus + upsertInstanceCatalog` 循环；普通启动和 GM 恢复只 reset 本节点内存结构，catalog 继续作为恢复真源。实例的 `destroyed/stopped` 转换只允许走已有的显式 lease/epoch CAS 销毁入口。
- **实际修改**：`world-runtime-lifecycle.service.ts` 删除恢复期 catalog 终态重写；启动协调器、GM 恢复协调器和接口同步移除该选项；`startup-lifecycle-coordinator-smoke.ts` 证明调用载荷不再携带销毁开关；`world-runtime-lifecycle-smoke.ts` 在 catalog 条目已物化的场景中设置终态写入陷阱，证明轻量重建仍保留 catalog 且不触发该写入；schema 文档补充恢复与销毁边界。
- **验证结果**：`git diff --check` 与 `pnpm --filter @mud/server compile` 通过；compiled `world-runtime-lifecycle-smoke` 通过，catalog 终态写入陷阱未触发且轻量恢复仍保留 catalog shell；compiled `startup-lifecycle-coordinator-smoke` 通过，证明默认 eager 启动仍在 traffic/tick/flush 闸门关闭期间恢复，但调用载荷已不存在销毁开关；compiled `native-database-restore-route-cleanup-smoke` 通过，证明 GM 恢复后的 world/market/mail/GM auth/player auth 重载顺序未变；`pnpm verify:quick` 完整通过，生产边界仍为 `world-runtime.service.ts = 1200` 行。该验证不证明真实多节点滚动启动、完整数据库导入/恢复或 release/shadow/acceptance/full。
- **中文原子提交 hash**：`aee54006`（`fix(persistence): 禁止恢复流程销毁实例目录`）。

### FS-006 启动恢复在取得实例 lease 前水合并可能回写分域

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：服务启动 / 实例接管 / 分域水合 / 通天塔 detached cache。
- **影响链路**：catalog 扫描与公共实例 bootstrap → `restorePublicInstancePersistence()` / `primeLayerInstanceCache()` → 建筑、宝库、密室、阵法等恢复副作用 → `claimRecoverableCatalogInstances()` / `syncInstanceLease()`。
- **证据**：修复前普通 eager 启动在 bootstrap/reset 后先调用 `restorePublicInstancePersistence()`，之后才 claim 可恢复 catalog 并逐实例同步 lease；通天塔 `primeLayerInstanceCache()` 则直接构造 detached runtime 并调用 `hydratePersistentInstanceSnapshot()`，全程没有 lease 裁定。两套水合都会进入建筑保护点清理、宝库物品返还、密室释放、持久态修正和阵法恢复，并非纯只读查询。
- **根本原因**：启动编排把“读数据库构造内存”视为可以发生在所有权裁定之前，却没有追踪水合函数包含的业务清理与回写副作用；同时 `syncInstanceLease()` 在新 claim 成功时隐式水合，导致调用方难以按“先全部 lease、再统一水合”重排而不重复执行。
- **为什么错误**：实例 catalog lease/ownership epoch 是所有实例写入的前置权威。未取得本节点 lease 时，恢复代码既不能删除违规建筑、返还宝库资产，也不能保存阵法/地块修正；否则两个节点可同时基于不同快照执行非幂等副作用。启动链路规范也明确要求 lease 成功后才能 hydrate。
- **触发条件**：默认 eager 启动或 GM 恢复时存在持久实例分域；通天塔 catalog 中存在历史塔层；目标实例仍被远端有效 lease 持有、旧 epoch payload 尚未 replay，或本节点只是续租而非新 claim。
- **可能后果**：旧节点在远端实例上清理建筑或密室；宝库库存被重复/错误返还；旧 epoch 的分域修正覆盖新节点状态；阵法或容器恢复发生两次；catalog 注册异步尚未落地时提前 claim 导致实例被错误隔离；远端塔层被本节点无权水合并缓存。
- **修复方式**：拆出可等待的 `registerManagedInstanceCatalog()`，启动期按 16 并发先完成当前 runtime shell 注册；随后 claim 可恢复实例和逐实例 sync lease，二者都显式传 `hydratePersistentSnapshot: false`，所有成功实例最后统一水合一次，并在每个实例真正水合前即时续租。catalog 启用但 claim/sync 能力缺失时启动失败关闭。通天塔缓存改为临时挂载 catalog 元数据，先 replay/claim/renew lease，再显式水合并摘回 detached cache；冲突或失败时清掉临时状态，通用周期 claim 识别塔层后让路给该缓存流程，GM 重载前先清旧缓存。
- **实际修改**：`world-runtime-instance-lease.helpers.ts` 拆出可等待 catalog 注册并为 lease sync 增加可关闭隐式水合的选项；`world-runtime-lifecycle.service.ts` 删除 reset 前无效实例物化，改为“承接 catalog 元数据 → 注册 → claim → sync → 水合前续租 → hydrate”并增加能力门禁；`world-runtime-tongtian-tower.service.ts` 增加 lease-first 缓存装载、失败清理和重载缓存清理；三类 smoke 分别证明普通 eager 顺序、通天塔成功/冲突分支及 deferred hydration 选项。
- **验证结果**：`git diff --check` 与 `pnpm --filter @mud/server compile` 通过；移除两份本组旧 smoke 的 `@ts-nocheck`/CommonJS 后仍由 TypeScript 正常编译；compiled `world-runtime-lifecycle-smoke` 通过，证明所有实例完成首轮 lease sync 后才开始水合、每个实例水合前再续租、`lease_degraded` 实例不水合，且 epoch `9/11` 在注册前已承接；compiled `tongtian-tower-smoke` 通过，证明塔层按 lease → hydrate 成功，模拟 lease 冲突时不水合且无临时 runtime 残留；compiled `instance-lease-sync-error-smoke`、`startup-lifecycle-coordinator-smoke`、`instance-ownership-epoch-replay-smoke` 通过；真实 PostgreSQL `instance-lease-runtime-smoke` 完整以 `0` 退出并清理夹具；`pnpm verify:quick` 完整通过，生产边界仍为 `world-runtime.service.ts = 1200` 行。上述验证不证明真实双节点同时滚动启动、网络分区下 split-brain，亦不替代完整 shadow/acceptance/full 门禁。
- **中文原子提交 hash**：`08eb28b4`（`fix(persistence): 加固实例启动接管顺序`）。

### FS-007 启动目录注册可把 ownership epoch 回退为零

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：实例 catalog / ownership fence / 启动接管。
- **影响链路**：默认公共实例 bootstrap → `registerManagedInstanceCatalog()` → `InstanceCatalogService.upsertInstanceCatalog()` → `syncInstanceLease()` → 旧 epoch payload replay 与新 lease claim。
- **证据**：公共实例每次启动都以默认 `ownershipEpoch = 0` 创建 shell。修复前 catalog upsert 只在现有 lease 仍有效时保留旧 epoch；lease 已过期或已释放时直接写 `EXCLUDED.ownership_epoch`，而 `metadata_version` 的大小比较没有保护这一列。随后 `syncInstanceLease()` 读取到 catalog 的历史 epoch 与 runtime 的 `0` 不同，会拒绝接管；若 upsert 已先落库，则数据库 fence 本身也被回退。
- **根本原因**：实现把“lease 已失效、允许新节点接管”误解成“ownership 历史可以重置”。启动 shell 只表达本进程尚未取得所有权，它的默认值不是比数据库更权威的新纪元；`ownership_epoch` 与可续租性被错误绑定在同一个 CASE 分支。
- **为什么错误**：ownership epoch 是隔离所有旧 flush writer 的单调 fencing token，任何普通 upsert 都无权降低它。回退会重新放行早期 epoch 的延迟 payload，也会使合法新节点无法用 catalog 当前 epoch 执行 replay + CAS claim，违反持久化真源与旧态覆盖红线。
- **触发条件**：同一实例历史上至少完成过一次接管或销毁，catalog epoch 大于 `0`；服务重启后创建同 ID 默认 shell；旧 lease 已过期、被释放或字段不完整，随后执行目录注册。
- **可能后果**：实例启动后长期处于 fenced/`lease_degraded` 而无法水合；离线挂机玩家无法回到原实例；旧 epoch 的延迟写重新满足数据库 fence，覆盖新资产、建筑、容器或阵法状态；多节点恢复可能围绕错误 epoch 重复争抢。
- **修复方式**：catalog upsert 对 `ownership_epoch` 无条件使用数据库现值与新值的最大值；启动注册前按 `instance_id` 把 catalog 的 lease、epoch 与路由元数据承接到新建 runtime shell，再以正确 epoch 注册和执行 replay/claim。该规则不依赖 lease 是否仍有效。
- **实际修改**：`instance-catalog.service.ts` 将 epoch 更新改为单调 `GREATEST`；`world-runtime-lifecycle.service.ts` 在注册前应用 catalog 元数据；`world-runtime-lifecycle-smoke.ts` 以 epoch `9/11` 的公共/真实线路证明注册与首次 sync 都未看到默认 `0`；`instance-lease-runtime-smoke.ts` 增加真实 PostgreSQL 夹具，证明过期 lease 上用 epoch `0` upsert 后数据库仍保持 epoch `17` 并自动清理夹具。
- **验证结果**：compiled `world-runtime-lifecycle-smoke` 证明 epoch `9/11` 的 catalog 元数据在 upsert 与首次 sync 前已进入 runtime shell；真实 PostgreSQL `instance-lease-runtime-smoke` 证明过期远端 lease 的目录以 epoch `0` upsert 后，`ownership_epoch` 与 `metadata_version` 均保持 `17`，测试完整以 `0` 退出并自动清理；`pnpm --filter @mud/server compile`、`git diff --check` 和 `pnpm verify:quick` 均通过。未验证真实多节点并发 upsert/claim 的锁等待与吞吐上限。
- **中文原子提交 hash**：`08eb28b4`（`fix(persistence): 加固实例启动接管顺序`）。

### FS-008 动态实例在异步 catalog 注册完成前已被视为可写

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：动态实例 / catalog 注册 / lease claim / tick 与持久化写入。
- **影响链路**：宗门、密室、通天塔或其他按需实例创建 → `setInstanceRuntime()` → 后台 `syncManagedInstanceRegistration()` → tick、实例分域写入和玩家挂接。
- **证据**：修复前 `setInstanceRuntime()` 先把新实例放入权威运行态表，再以不可等待的 fire-and-forget 任务注册 catalog 和同步 lease；同时 `isInstanceLeaseWritable()` 在 catalog 已启用但 `assignedNodeId` 或 `leaseToken` 为空时直接返回 `true`。相同 `instanceId` 被新 runtime 替换后，旧后台任务也没有 generation/current-instance 守卫。
- **根本原因**：动态实例创建的同步内存边界与异步数据库所有权边界之间没有显式“未就绪”状态、可等待任务或替换隔离；可写判断又把“尚未分配 lease”误当成单机兼容路径。
- **为什么错误**：catalog 启用即表示所有持久实例写权由数据库 lease 决定。缺少 node/token 的实例不能证明归本节点所有，更不能参与 tick、落盘或玩家资产副作用；旧实例任务也无权为同 ID 的新对象注册或 claim。
- **触发条件**：运行期首次创建宗门、密室或塔层；数据库注册/claim 有延迟；同一实例 ID 在注册任务未完成时被 reset、恢复或替换。
- **可能后果**：无 lease 的实例先推进 tick 或写分域；两个节点同时把同一动态实例当成本地可写；旧任务为已替换 runtime claim lease；玩家进入尚未 hydrate 的实例；宗门入口、密室状态或塔层怪物基于错误所有权被创建。
- **修复方式**：新增 `WorldRuntimeInstanceLeaseReadinessService`，按 `instanceId` 串行 catalog 注册和 lease 同步，使用 generation 与对象恒等守卫隔离 reset/替换；任务可由挂接和领域服务等待。catalog 启用时缺少 node/token 一律不可写；任务失败保持实例不可写，由 attach/tick/领域写入闸门失败关闭。
- **实际修改**：`WorldRuntimeService.setInstanceRuntime()` 改为调度就绪服务并暴露 `waitForInstanceLeaseReady()`；`syncManagedInstanceRegistration()` 改为可等待并在 upsert、claim 前后检查当前对象；密室恢复/创建和通天塔/宗门相邻路径等待就绪；新增 `instance-lease-readiness-smoke.ts` 证明同 ID 任务串行、旧对象不 claim、当前对象只 claim 一次。
- **验证结果**：server compile 通过；compiled `instance-lease-readiness-smoke` 证明缺 lease 初始不可写、旧 runtime 未 claim、当前 runtime claim 一次且等待器直到 claim 后才完成；compiled 通天塔、密室、宗门、启动恢复和 bootstrap smoke 均通过；真实 PostgreSQL `instance-lease-runtime-smoke` 通过；`pnpm verify:quick` 完整通过。未证明 10000 实例同时注册的吞吐和真实跨节点网络分区。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-009 玩家挂接读取了错误依赖形状并绕过真实 attach gate

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：玩家会话 / bootstrap / 动态实例 / 跨图与通天塔。
- **影响链路**：socket bootstrap、离线收益确认、HTTP connect、世界迁移、通天塔进出/换层 → `WorldRuntimePlayerSessionService.connectPlayer()` → 目标实例 attach gate。
- **证据**：`connectPlayer()` 只读取 `deps.worldRuntimeService?.instanceReadyForPlayerAttach()`；生产调用实际把 `WorldRuntimeService` 本身作为 `deps` 传入，并不存在嵌套的 `worldRuntimeService` 字段，因此该分支恒不命中，代码回落到只检查字符串状态的 `resolveInstanceAttachReady()`。动态创建路径又同步调用 `connectPlayer()`，不会等待后台 catalog/lease 任务。
- **根本原因**：会话服务为测试夹具保留的嵌套依赖形状被误当成生产形状；目标实例解析、异步所有权就绪和最终挂接没有形成一个不可拆分的服务入口。
- **为什么错误**：真实 attach gate 还检查启动屏障、本节点 lease/token、严格过期时间和实例是否被 fence；只看 `runtimeStatus` 会让玩家进入未租约、过期或启动尚未开放的实例。进入后再 fence 会留下位置、会话路由和玩家运行态不一致。
- **触发条件**：任何生产 `WorldRuntimeService` 直传调用；尤其是按需创建的塔层、默认分线、宗门/密室目标或启动恢复期间的连接。
- **可能后果**：玩家挂入无所有权实例并参与 tick；首包来自未 hydrate 状态；跨线/塔层操作半成功；后续 lease 同步把仍有玩家的实例隔离为不可写，形成卡图、位置漂移和恢复困难。
- **修复方式**：会话服务优先调用 `deps.instanceReadyForPlayerAttach()`，仅把嵌套形状保留为兼容夹具；新增 `connectPlayerWhenReady()`，先解析/创建精确目标、等待该实例就绪，再以禁止 fallback 的精确 ID 重新进入同步 `connectPlayer()`，由最终挂接点再次执行权威 guard。bootstrap、离线收益确认、HTTP controller、通天塔和世界迁移统一 await 新入口。
- **实际修改**：更新 session bootstrap runtime port 与调用链为异步；controller 改为 await；通天塔动作支持异步挂接；动作执行服务兼容同步普通动作与异步塔/迁服动作；专项 smoke 证明生产直传 guard 被调用且顺序为 wait → guard → connect。
- **验证结果**：compiled `instance-lease-readiness-smoke`、`world-session-bootstrap-instance-fallback-smoke`、`world-runtime-action-execution-smoke`、`tongtian-tower-smoke` 与 `world-runtime-lifecycle-smoke` 通过；`pnpm verify:quick` 的 runtime/socket 主证明链通过。未执行真实双节点 socket 导流或滚动重启验收。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-010 lease 到期后旧节点仍有 5 秒写入宽限

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：实例 lease / split-brain / 写入 fence。
- **影响链路**：实例 tick、动作、持久化 flush、销毁和玩家挂接 → `isInstanceLeaseWritable()`；远端节点 → `InstanceCatalogService.claimInstanceLease()`。
- **证据**：修复前本地可写判断使用 `leaseExpireAt > Date.now() - 5_000`，即 lease 真实到期后继续认可 5 秒；数据库 claim SQL 则在 `lease_expire_at < now()` 时立即允许新节点原子接管。持久化层的独立 catalog guard 也使用严格 `leaseExpireAt > Date.now()`，同一实例存在两套互相冲突的过期语义。
- **根本原因**：用于提前续租和容忍调度抖动的 `INSTANCE_LEASE_RENEW_SKEW_MS` 被反向复用成写权限宽限，没有区分“何时尝试续租”与“所有权何时终止”。
- **为什么错误**：数据库时间点是跨节点 ownership 的权威边界；到期后新节点可能已获得新 token/epoch，旧节点再写任何一息都构成 split-brain。客户端时钟容忍不能延长数据库已经终止的旧所有权。
- **触发条件**：旧节点发生事件循环阻塞、长 GC、数据库暂时不可达或续租延迟，lease 刚到期；另一节点在 5 秒窗口内完成 claim。
- **可能后果**：两个节点同时推进战斗、移动、地块、容器、建筑和玩家状态；旧节点的动作先在内存成功、随后数据库 fence 拒绝，制造客户端已见结果与持久态不一致；销毁和 attach 判断也会接受过期实例。
- **修复方式**：所有运行态写权限和本地过期降级判断改为严格比较 `leaseExpireAt > Date.now()`；续租/接管探测仍可保留调度偏移，但在成功原子 renew/claim 前绝不恢复写入。
- **实际修改**：收紧 `isInstanceLeaseWritable()` 与 `shouldMarkLocalLeaseDegraded()`；专项 smoke 构造未来 lease 与已过期 1 毫秒 lease，证明前者可写、后者立即停写。
- **验证结果**：compiled `instance-lease-readiness-smoke` 的 `beforeExpiryWritable=true / expiredWritable=false`；compiled `instance-lease-sync-error-smoke` 证明到期进入 `lease_degraded` 且续租恢复后才重开写入；真实 PostgreSQL `instance-lease-runtime-smoke` 和 `pnpm verify:quick` 通过。未做真实双节点亚毫秒级 claim/旧写竞态压测。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-011 宗门入口和运行态副作用可发生在实例 lease 就绪前

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：宗门 / 启动恢复 / 动态实例 / 阵法与地图地块。
- **影响链路**：启动 `restoreSects()`、建宗、迁宗 → 创建/查找宗门实例 → 同步宗门地块、挂入口/核心 portal、创建/迁移护宗阵、写宗门资产。
- **证据**：启动恢复在统一 claim 前调用 `restoreSects()`，该方法会 `ensureSectRuntimeInstance()` 后立即同步宗门地块、挂入口与核心 portal，并可能确保护宗阵；建宗和迁宗也在同步 `createInstance()` 返回后立刻进入这些副作用，没有等待后台 catalog/lease。迁宗还会删除旧入口实例的 portal/阵法，却不要求旧入口实例仍归本节点。建宗后续失败时，回滚只删新宗门 runtime，不以 lease/epoch CAS 销毁已注册的 catalog。即使完成批量首轮 sync，10000 实例长队列下早期 lease 也可能在宗门运行态应用前过期。
- **根本原因**：宗门恢复把“注册动态模板/创建实例 shell”和“对权威运行态应用宗门状态”合并在同一方法，没有把 lease-ready 作为入口、地块和阵法副作用的共同前置条件。
- **为什么错误**：宗门入口会改变公共地图可交互结构，宗门地块和护宗阵会影响战斗、资产与持久化；入口实例和宗门实例可能分别归不同节点，必须两者都在本节点可写时才能组成双向 portal 和阵法位置。
- **触发条件**：服务启动/GM 恢复、运行期建宗或迁宗；catalog 注册较慢；入口或宗门实例 lease 被其他节点持有；批量恢复时间超过 lease TTL。
- **可能后果**：旧节点在远端公共图挂/删宗门入口或迁移护宗阵；宗门边界/地块修正从旧快照回写；建宗物品已消耗但实例不可进入；失败建宗留下无人持有但仍占 lease 的 catalog；迁宗一半成功，旧入口、新入口和阵法位置互相不一致。
- **修复方式**：启动 lease 前的 `restoreSects()` 只注册模板和创建 shell，显式 `applyRuntimeState:false`；真正应用时对入口与宗门实例逐一等待动态注册、即时续租且关闭隐式 hydrate，最后再次检查对象仍是当前 runtime 且严格可写，不满足则记录并跳过。建宗在任何 portal、资产和阵法变更前同时校验当前入口与新宗门实例；迁宗同时校验旧入口、目标入口和宗门实例，旧入口缺失或非本节点写权时失败关闭。建宗失败以统一 `destroyManagedInstance()` 的 catalog lease/epoch CAS 回收新实例，拒绝或异常时保留不可写运行态并记录原因，不再无围栏删内存。
- **实际修改**：为 `restoreSects()` 增加运行态应用分相；新增 `prepareSectRuntimeApply()` 的双实例就绪/续租/对象恒等/可写检查；建宗与迁宗改用多实例 `waitForSectInstancesLeaseReady()`；建宗 rollback 复用统一实例销毁围栏；综合宗门 smoke 记录并断言建宗、两次恢复和迁宗的等待次数与顺序，并证明 lease 拒绝时物品、入口和实例表全部回滚。
- **验证结果**：规范 TypeScript 编译通过；默认本地环境下 compiled `world-runtime-sect-smoke` 通过，证明建宗同时等待入口与宗门实例、迁宗校验旧/新入口和宗门实例、恢复同时等待入口与宗门实例，且 lease 拒绝不会消耗物品、挂入口或留下运行态实例；compiled `world-runtime-lifecycle-smoke`、真实 PostgreSQL `instance-lease-runtime-smoke` 与 `pnpm verify:quick` 通过。未做两节点分别持有入口图与宗门图的集群验收。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-012 跨线偏好和通天塔当前层在目标接入前提前推进

- **状态**：已修复、验证并提交。
- **严重级别**：P1。
- **所属功能组**：世界迁移 / 通天塔 / 玩家位置与进度一致性。
- **影响链路**：`world:migrate` 或通天塔上一层/下一层 → 更新玩家偏好/塔层进度 → 连接目标实例。
- **证据**：世界迁移修复前先调用 `updateWorldPreference()`，之后才创建并连接目标分线；通天塔换层先 `updateCurrentLayer()`，再连接目标层。目标实例 lease/attach 失败时，前置状态没有回滚。
- **根本原因**：偏好和塔层进度被当成发起请求时即可提交的意图，而不是目标实例接入成功后的结果；原同步挂接几乎不失败，新增严格 lease gate 后暴露了部分失败窗口。
- **为什么错误**：玩家实际位置是权威结果，默认分线和当前塔层必须与成功位置转换一致。提前推进会让后续重连/跨图按未到达目标恢复，或把玩家送到尚未真正进入的塔层。
- **触发条件**：目标实例被远端 lease 持有、动态注册失败、启动 attach gate 关闭、实例无可用落点或连接过程抛错。
- **可能后果**：玩家仍在旧图但下次跨图默认进入新分线；塔层进度显示已换层而运行态仍在原层；重连后位置跳变；成功通知与真实位置不一致。
- **修复方式**：世界迁移仅在目标连接成功的 finalize 阶段更新偏好并发成功通知；同分线无位置变更时保持即时更新。通天塔先完成目标层连接，再推进 `currentLayer`；连接失败不改变进度。
- **实际修改**：`executeWorldMigration()` 和 `moveLayer()` 调整提交顺序；动作 smoke 增加异步 lease 拒绝用例，明确断言不调用 `updateWorldPreference` 且不发送成功通知；通天塔 smoke 全面 await 异步动作。
- **验证结果**：compiled `world-runtime-action-execution-smoke` 与 `tongtian-tower-smoke` 通过；前者证明 `lease_not_local` 时偏好和成功通知均未推进，后者证明成功换层后进度正确；`pnpm verify:quick` 通过。未模拟玩家连接成功后进度异步落库失败，该链仍由现有 pending write/flush 负责恢复。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-013 动作与宗门综合 smoke 长期被类型绕过和陈旧夹具削弱

- **状态**：已修复、验证并提交。
- **严重级别**：P1。
- **所属功能组**：验证门禁 / TypeScript / 本地环境隔离。
- **影响链路**：动作执行、世界迁移、宗门建/迁宗和宗门地图综合回归。
- **证据**：两份 smoke 均使用 `// @ts-nocheck` 与 CommonJS；动作 smoke 的迁服期望缺少生产已传入的 `relocateExisting:true`，并仍断言偏好先更新；宗门 smoke 在管理摘要断言引用从未定义的 `sect` 变量，调用签名已漂移却未被编译发现。宗门 smoke 还会读取仓库本地数据库环境，在主动 stub 掉 pool 后反而因检测到 URL 而报“宗门持久化暂不可用”。
- **根本原因**：旧 smoke 通过关闭类型检查维持，接口演进后只剩运行时偶然覆盖；验证进程没有隔离本地 `.env` 已注入的数据库配置，导致无库夹具与真实环境互相矛盾。
- **为什么错误**：门禁自身固定失败或断言旧行为后，业务回归与夹具漂移无法区分；开发者可能为通过 smoke 放宽生产规则，或直接停止运行这两条关键综合证明。
- **触发条件**：编译不检查工具文件的真实签名、直接运行宗门 smoke 且本地存在数据库 URL、执行迁服成功断言或走到宗门管理摘要。
- **可能后果**：动态 lease/attach 回归没有可信证明；测试红灯被误判为业务故障；未定义变量直到很晚才暴露；本地和 CI 结果不一致。
- **修复方式**：移除两份 smoke 的类型绕过和 CommonJS，改为规范 TypeScript import；按当前构造器/方法签名补齐夹具，修正迁服载荷和宗门 ID 断言；宗门 smoke 在执行 main 前保存并清除数据库 URL，结束后恢复，确保无库综合测试不受本机配置影响。
- **实际修改**：更新 `world-runtime-action-execution-smoke.ts`、`world-runtime-sect-smoke.ts` 和相关异步断言；补充迁服失败、宗门 lease 等待证明。
- **验证结果**：server compile 在无 `@ts-nocheck` 下通过；默认环境直接运行 compiled `world-runtime-action-execution-smoke` 与 `world-runtime-sect-smoke` 均通过；`pnpm verify:quick` 完整通过。
- **中文原子提交 hash**：`09e7dbf5`（`fix(runtime): 加固动态实例租约就绪门禁`）。

### FS-014 心跳与断线 presence 在落库失败时仍被误判为成功

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：玩家会话 / presence 三态 / 断线恢复 / 关闭链路。
- **影响链路**：socket 心跳或断线 → `WorldGatewayPresenceHelper` → `PlayerDomainPersistenceService.savePlayerPresence()` → `player_presence` / `player_recovery_watermark` → dirty 清理与 `WorldShutdownDrainService` 结果。
- **证据**：修复前心跳入口以 fire-and-forget 发起 `savePlayerPresence()` 后，未等待事务成功就立即写入 5 秒节流时间并调用 `markPersisted()`；该调用没有携带本次捕获的 presence 单域修订，异步 IO 期间发生断线或换绑时也可能清除较新的 dirty。断线入口又在 helper 内捕获并吞掉所有非围栏异常，`WorldGateway.drainDetachedBinding()` 因 promise 正常完成而无条件把 `presencePersisted` 设为 `true`。
- **根本原因**：直接 presence 小事务只把“已发起”当成“已提交”，没有把数据库事务结果与运行态 dirty 的精确修订绑定；helper 与关闭编排器之间也没有保留失败传播合同。
- **为什么错误**：`player_presence` 是在线、离线挂机、离线三态以及 session owner/epoch 的恢复真源。只有数据库提交成功后才能清除对应 dirty；清除时也只能确认发起 IO 前捕获的单域修订。关闭链路必须准确记录 presence 失败，否则会在错误恢复线索上伪报 drain 成功。
- **触发条件**：心跳写入期间 PostgreSQL 短暂失败、连接池超时或事务异常；心跳事务 in-flight 时玩家断线/顶号；关机逐玩家 detach 时 presence 写入失败。
- **可能后果**：数据库继续显示玩家在线或保留旧 owner/heartbeat，进程紧接崩溃时没有 dirty 可重试；较新的离线挂机状态被旧心跳成功回调误清；启动恢复、GM 在线统计和 session route 判断读取陈旧状态；关机结果错误显示 presence 已落盘，运维无法识别需按残留在线态恢复的玩家。
- **修复方式**：心跳按玩家合并 in-flight 写入，只在数据库事务成功后更新节流时间；提交前捕获 `presence` 单域修订和 runtime revision，成功回调再次比较同一单域修订，完全一致时才精确 `markPersisted`，失败则保留 dirty 并允许下一次心跳立即重试。bootstrap 首次 presence 写也采用相同修订比较。断线 helper 仅把更新会话已推进 fence 视为良性收敛，其他错误重新抛给 gateway，由 drain 结果记录 `presencePersisted=false`。
- **实际修改**：更新 `world-gateway-presence.helper.ts` 的心跳提交确认、in-flight 去重、修订清理和断线错误传播；更新 `world-session-bootstrap-player-init.service.ts` 的 revision-aware dirty 清理；扩展 `player-presence-immediate-smoke.ts`，覆盖心跳失败不清 dirty、失败后立即重试、断线失败进入结构化结果，并保留 `在线 / 离线挂机 / 离线` 原语义。
- **验证结果**：`git diff --check` 与 `pnpm --filter @mud/server compile` 通过；compiled `player-presence-immediate-smoke` 通过，故障注入时出现预期错误日志且最终 `ok=true`，证明心跳首次失败未标记 persisted、第二次立即重试成功、心跳 IO 期间的新断线修订未被旧成功回调清除、断线写失败返回 `presencePersisted=false`，原离线收益 blocking 状态仍为 `online=false / inWorld=true`；compiled `player-runtime-session-fence-smoke`、`player-session-route-smoke`、`shutdown-coordinator-order-smoke` 与 `shutdown-failed-flush-keeps-lease-smoke` 通过；`pnpm verify:quick` 完整通过，生产边界仍为 `world-runtime.service.ts = 1200` 行。上述验证不证明真实多节点同时登录、网络分区、完整 with-db/shadow/acceptance/full 或数据库故障恢复耗时。
- **中文原子提交 hash**：`2d25b98d`（`fix(persistence): 加固玩家在线态提交确认`）。

### FS-015 玩家空集合分域恢复会复活 starter 资产与状态

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：玩家分域持久化 / 背包装备 / 功法任务 / 自动化配置 / 重启恢复。
- **影响链路**：玩家消耗、转移、出售、卸下或清空集合状态 → 对应 `player_*` 分域事务提交并推进 `player_recovery_watermark` → 重启、重连或 snapshot miss → `loadProjectedSnapshot()` → starter snapshot 与分域数据合成。
- **证据**：`buildProjectedSnapshotFromDomains()` 以 starter snapshot 作为结构基底，但 `applyProjectedInventory()`、`applyProjectedEquipment()`、`applyProjectedArtifacts()`、`applyProjectedTechniques()`、`applyProjectedQuestProgress()`、自动技能、自动用药、炼丹预设和日志恢复函数均在查询结果为零行时直接返回。数据库中“对应 watermark 版本大于 0、行为零行”已经明确表示该集合成功提交为空，恢复链却把它与“该域从未投影”混为一谈并保留 starter 内容。真实 PostgreSQL 夹具已复现并覆盖这一路径。
- **根本原因**：集合恢复只用行数判断领域是否存在，没有消费已经加载的 recovery watermark；starter 初始化默认值承担了结构基底与新玩家初始资产两种职责，而已有玩家恢复没有明确禁止后者回填。
- **为什么错误**：数据库分域及 watermark 是已有玩家重启恢复的持久化真源。版本已推进后，即使没有行为也是有意义的权威状态；starter 只允许初始化新玩家，不能在恢复时补齐已经被合法消费或清空的资产和玩法状态。
- **触发条件**：玩家将背包最后一项物品消耗、出售或转移；卸下全部装备/神器；清空功法、任务、自动技能、自动用药、炼丹预设或待投递日志；随后发生进程重启、断线重连或 snapshot 主记录缺失并走分域重建。
- **可能后果**：starter 背包物品和锁定物重复生成，形成玩家资产复制；已卸下装备或神器重新出现；已清空的功法、任务与自动化规则复活；客户端首包、运行态和数据库真源互相矛盾，并可能在下一次 flush 把复活状态再次固化。
- **修复方式**：新增统一的集合权威判定：行为非空，或对应 recovery watermark 版本大于 0，均表示该分域可覆盖 starter；权威零行时显式写入空背包/锁定物、空装备与神器槽状态、空功法任务和空自动化/预设/日志集合。watermark 为 0 且无行时仍保留 starter，以维持真正未投影的新玩家兼容语义，不新增旧格式运行时转换分支。
- **实际修改**：`player-domain-persistence.service.ts` 将九类集合恢复接入 watermark-aware 覆盖；`player-domain-recovery-smoke.ts` 增加带 sentinel starter 的真实 PostgreSQL 权威空集合回读与自动清理，并把陈旧的任务对象进度夹具校正为当前 mechanics/shared 定义的数值 `progress` 与 `active` 状态；`server-memory-retention-smoke.ts` 同步验证恢复单一所有者约束，并修正成长规则拆分后 source assertion 应读取 helper 的验证漂移。
- **验证结果**：`git diff --check` 与 `pnpm --filter @mud/server compile` 通过；真实 PostgreSQL compiled `player-domain-recovery-smoke` 通过并自动清理，明确证明背包、锁定物、装备、神器、功法、任务、自动技能、自动用药、炼丹预设和日志十类 starter sentinel 均未复活；真实 PostgreSQL compiled `player-domain-persistence-smoke` 通过；compiled `player-runtime-projection-entry-smoke` 证明运行态只接受分域投影恢复；compiled `server-memory-retention-smoke` 证明当前恢复单一所有者约束与成长规则 helper 引用复用断言均成立；`pnpm verify:quick` 完整通过，生产边界仍为 `world-runtime.service.ts = 1200` 行。未模拟生产快照损坏或数据库人工删行；watermark 已推进但数据被异常删除时仍会按权威空集合恢复，这是以数据库提交真源为准的失败关闭语义。
- **中文原子提交 hash**：`ad70d202`（`fix(persistence): 修复玩家空集合分域恢复`）。

### FS-016 GM 全服广播邮件逐玩家装配快照并串行部分提交

- **状态**：已修复、验证并提交。
- **严重级别**：P0。
- **所属功能组**：GM 邮件 / 玩家枚举 / 邮件持久化 / 5000 玩家容量。
- **影响链路**：GM `POST /mail/broadcast` → `NativeGmMailService.collectBroadcastRecipientPlayerIds()` → 在线运行态与离线分域枚举 → `MailRuntimeService.createDirectMail()` → `player_mail / player_mail_attachment / player_mail_counter / player_recovery_watermark`。
- **证据**：修复前在线收件人通过 `listPlayerSnapshots()` 深拷每个完整玩家运行态后只取 `playerId`；离线收件人调用 `listProjectedSnapshots()`，对每个 recovery watermark 玩家执行二十余张分域表查询、构造 starter 并装配完整快照后也只取 `playerId`。收件人确定后又用 `for ... await` 串行调用定向邮件；每人会写前回读邮箱、写局部真源、提交后再回读邮箱。在 5000 玩家口径下，离线枚举会放大为十万级 SQL，投递是 5000 条串行强持久化链，且每名玩家各自提交。
- **根本原因**：广播复用了“读取完整离线玩家快照”和“发送单封定向邮件”两个低基数接口，没有为“只枚举角色 ID”和“同一内容批量持久化”建立独立边界；`batchId` 只用于响应展示，不参与幂等键或事务。
- **为什么错误**：广播是一个 GM 运维动作，必须在 5000 玩家目标规模下具有有界数据库往返，并且不能向 GM 报错时留下无法识别、无法安全重放的部分收件人状态。只为 ID 深拷玩家资产和逐表水合违反最小数据原则；逐玩家事务也不满足整批操作的原子性和确定性重放要求。
- **触发条件**：GM 未指定 `playerIds` 发全服邮件；玩家数、离线玩家分域或邮箱历史增长；数据库/HTTP 在串行投递中途超时；操作方因未收到响应而重新发送。
- **可能后果**：GM 请求长时间占用 HTTP、连接池和数据库，正常玩家邮件读取/领取与 flush 被挤压；在线玩家完整状态深拷制造瞬时内存和 GC 压力；邮箱缓存被广播遍历污染；中途失败时前半玩家已收到、后半未收到，重试又会让前半重复获得附件，形成运营资产重复或漏发。
- **修复方式**：玩家运行态新增只返回 map key 的 `listPlayerIds()`；玩家分域新增单 SQL `listProjectedPlayerIds()`，只选择具有角色投影水位的 ID，排除仅 identity/presence/mail 的非完整角色。GM 客户端为一次发送生成带 UUID 的 `batchId`，请求失败且草稿未变时复用，草稿变化立即换代，旧请求迟到成功不能清除新批次或重置已编辑草稿；服务端兼容未带 ID 的旧客户端。每名玩家的 `mail_id` 由 `batchId + playerId` 哈希确定；持久化层按跨节点一致的玩家 ID 字符串顺序一次取得 advisory lock，通过集合 SQL 在同一事务内批量写入邮件与附件、重算邮箱计数并推进恢复水位，失败整批回滚，同 batch 重放因确定性主键不重复；同 ID 的正文/附件 hash 或收件人集合 hash 不一致则拒绝并回滚。提交后仅删除本节点已命中的对应邮箱缓存。
- **实际修改**：更新 shared `GmBroadcastMailReq`、客户端 GM 发送链与独立幂等状态模块；更新 `player-runtime.service.ts`、`player-domain-persistence.service.ts`、`native-gm-mail.service.ts`、`mail-runtime.service.ts` 与 `mail-persistence.service.ts`；扩展真实数据库 `mail-structured-mutation-smoke.ts`；新增服务端容量 smoke 和客户端失败重试 proof，并把 proof 接入客户端 build；同步邮件机制文档。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、`pnpm verify:client`、`pnpm audit:protocol` 与最终 `pnpm verify:quick` 通过；客户端 `proof:gm-mail-broadcast-idempotency` 证明相同草稿失败重试复用 ID、草稿变化换代、旧响应不清新代和不重置已编辑草稿，且明确成功后可再次发送相同内容；compiled `native-gm-mail-broadcast-smoke` 以 5000 个离线 ID + 1 个在线 ID 证明只执行 1 次投影 ID 查询和 1 次集合持久化调用，定向邮件调用为 0，重复与 GM bot 被排除，并证明客户端 batch ID 端到端透传；真实 PostgreSQL compiled `mail-structured-mutation-smoke` 以 5000 个自动清理收件人完成邮件、附件、计数和水位整批提交、同 batch 重放，以及正文/附件或收件人集合变化时的冲突回滚，最终实测四次调用共 `952ms`，每名玩家仍只有 1 封邮件、1 份附件、`unread/unclaimed/counterVersion = 1/1/1`；默认 2 人夹具复跑通过；compiled `mail-monotonic-idempotency-smoke` 与 `mail-runtime-durable-required-smoke` 通过。`952ms` 只代表当前本地数据库，不等同于生产 SLA；未做多个 GM 节点用同 batch 并发请求或生产 30Mbps 链路压测。
- **中文原子提交 hash**：`7a50115d`（`fix(mail): 加固全服广播原子投递`）。

### FS-017 兑换码灵石奖励写错真源且 pending 重试会重复规划资产

- **状态**：已修复、完成专项验证并原子提交。
- **严重级别**：P0。
- **所属功能组**：兑换码 / 背包与灵石 / durable operation / 重启补偿。
- **影响链路**：玩家提交兑换码 → `RedeemCodeRuntimeService.redeemCodes()` → `claimCodeForUse()` 抢占 `pending` → `grantInventoryItems()` / `mutatePlayerWallet()` → 运行态 `replaceInventoryItems()` / `creditWallet()` → `finalizeCodeUse()` → 重启恢复。
- **证据**：当前 `PlayerRuntimeService.getWalletBalanceByType()` 直接统计背包物品，`creditWallet()` 也创建物品、修改 `player.inventory.items`、只标记 `inventory` dirty，再由 `refreshWalletCacheFromInventory()` 刷新 wallet；因此 `player_inventory_item` 才是灵石正式真源。修复前兑换码却把普通奖励写 `player_inventory_item`、把 `spirit_stone` 单独写 `player_wallet`，随后运行态 `creditWallet()` 才改背包。一个混合奖励码会经过多个独立 durable operation；奖励提交后若码 finalize 失败，重试又基于已经增加的运行态重新生成 `nextInventoryItems`，与同 operationId 已保存的 payload 不同。原 smoke 只证明“失败后码保持 pending”，没有执行第二次兑换来证明补偿真正可达。
- **根本原因**：兑换码链路保留了旧的“钱包独立真源”假设，没有随灵石收敛为背包真源同步调整；`pending` 只保存玩家和 operationId，没有冻结首次 claim 时的奖励；补偿设计把“可重试”误等同于“重新执行整段规划”。兑换成功后还会调用全量 `saveDocument()`，陈旧节点快照可能覆盖专用 claim/finalize 已写入的非 active raw payload 或回退全局 revision。
- **为什么错误**：要求“下次还在”的灵石必须在奖励事务内写入当前数据库真源。一个兑换码是单一资产授予命令，不能把背包和灵石拆成可部分提交的事务；幂等重放必须复用首次命令身份和奖励快照，不能使用已变化的运行态重新构造 after snapshot。`pending / used / destroyed` 是单调核销状态，全量旧快照不得覆盖专用条件更新。
- **触发条件**：兑换码同时包含普通物品与灵石；灵石 durable 提交后进程崩溃、背包 flush 未完成；普通奖励已提交但后续灵石或 finalize 失败；GM 在 pending 期间修改分组奖励；同一玩家稍后重试 pending 码；旧节点执行全量兑换码文档保存。
- **可能后果**：数据库 `player_wallet` 显示已加灵石但重启从 `player_inventory_item` 恢复时奖励消失；满背包玩家仍被塞入灵石物品，突破容量；混合奖励只发一半；pending 码因 durable replay identity 冲突永久卡死；若重复运行态应用再被 flush，可能重复固化物品；后续奖励修改让同一个码混用两套奖励；旧全量快照破坏 used/pending 的补偿字段和审计身份。
- **修复方式**：所有奖励（含灵石）统一进入一次 `grantInventoryItems`，背包容量按全部奖励计算，wallet 只随真实运行态背包刷新；数据库 claim 从同事务锁定的分组行读取奖励，并在首次 active→pending 时保存 `pendingRewards`，同 operationId 重放始终保留原快照。奖励 operation 已 committed 时，重试跳过容量重规划、durable grant 和运行态应用，只继续 finalize；成功核销后不再用全量文档重复覆盖专用持久化结果。全量保存路径禁止 `pending` 回退 `active`，并把 `used / destroyed` 作为不可覆盖终态，同时保留 GM 显式 `pending → destroyed` 的处置能力；全局 revision 按 `GREATEST(current + 1, incoming)` 单调前进。GM 奖励条目合并重复 itemId，并拒绝非有限、非正数或超过 `2_147_483_647` 的数量。
- **实际修改**：更新 `redeem-code-runtime.service.ts`、`redeem-code-persistence.service.ts` 和兑换码 mechanics；扩展 runtime durable、启动持久化与真实 PostgreSQL claim smoke；新增真实 PostgreSQL 灵石背包真源 smoke。
- **验证结果**：`pnpm --filter @mud/server compile` 与 `pnpm verify:quick` 通过；compiled `redeem-code-runtime-durable-smoke` 证明普通物品与灵石只形成一次 inventory durable call，finalize 首次失败后第二次只补核销，durable 调用、运行态背包替换和成功 notice 均不重复，且 GM 修改分组后结果仍使用首次 pending 奖励；compiled `redeem-code-persistence-startup-smoke`、`world-runtime-redeem-code-smoke` 通过；真实 PostgreSQL compiled `redeem-code-persistence-claim-db-smoke` 证明 active→pending 冻结奖励，分组从灵石 1 改为 99 后同 operationId 仍回读 1，随后 finalize used，陈旧 active 全量保存不能回退终态，而 GM 显式 pending→destroyed 仍可完成；真实 PostgreSQL compiled `redeem-code-inventory-source-db-smoke` 证明灵石只写 `player_inventory_item` 和 inventory watermark、精确重放不重复，`player_wallet` 与 wallet watermark 均为零；真实 PostgreSQL compiled `inventory-grant-durable-smoke` 证明修复后的共享连接池注入下，既有库存 durable 验证仍完整执行。
- **中文原子提交 hash**：`428bdbb9`（`fix(redeem): 加固兑换码资产补偿链`）。

### FS-018 inventory durable 数据库 smoke 实际禁用了被测服务

- **状态**：已修复、完成真实数据库复跑并随兑换码资产补偿组原子提交。
- **严重级别**：P1（验证门禁失效，不直接修改玩家数据）。
- **所属功能组**：durable operation / 共享数据库连接池 / with-db 验证。
- **影响链路**：`inventory-grant-durable-smoke` 构造 `DurableOperationService` → `onModuleInit()` → `DatabasePoolProvider.getPool('durable-operation')` → 资产事务证明。
- **证据**：服务构造器已经接收 `NodeRegistryService + DatabasePoolProvider`，并在没有 provider 时明确记录“数据库连接池提供者未提供连接池”、保持 disabled；现有 smoke 仍只传第一个参数。按当前代码直接执行会在首个 `grantInventoryItems()` 抛出 `durable_operation_service_disabled`，不能证明文档所称的真实 PostgreSQL 围栏、幂等和多表提交。
- **根本原因**：连接池架构改为统一 provider 后，非 Nest 的独立工具夹具没有同步构造依赖，也没有断言 `service.isEnabled()`。
- **为什么错误**：with-db smoke 的目标就是执行真实事务；若被测服务在初始化阶段已禁用，后续失败只说明夹具错误，无法作为 durable 主链回归证据，并会让新增同类证明复制错误装配。
- **触发条件**：直接运行 compiled `inventory-grant-durable-smoke`，或按它的旧构造方式编写新的 durable 数据库工具。
- **可能后果**：关键资产门禁长期不可用；开发者可能把 `durable_operation_service_disabled` 误判为生产逻辑回归；CI 即使保留脚本也无法覆盖真实事务。
- **修复方式**：独立工具显式创建共享 `DatabasePoolProvider`，作为第二构造参数注入 durable 服务，并在 finally 中由 provider 统一关闭；业务查询用的独立 pool 仍单独清理。
- **实际修改**：修正 `inventory-grant-durable-smoke.ts`，新 `redeem-code-inventory-source-db-smoke.ts` 使用同一装配约定。
- **验证结果**：两条 compiled 工具均连接真实 PostgreSQL 并通过；原 inventory 工具重新证明 session/instance fence、地面来源、背包、水位、outbox、audit 和幂等重放，新工具证明兑换码灵石背包真源，所有夹具均在 finally 清理。
- **中文原子提交 hash**：`428bdbb9`（`fix(redeem): 加固兑换码资产补偿链`）。

### FS-019 生产 Runtime 调试控制面缺少 token 时反而无鉴权放行

- **状态**：已修复、完成专项验证并原子提交。
- **严重级别**：P0。
- **所属功能组**：Runtime HTTP / 管理鉴权 / 玩家资产与世界运维安全。
- **影响链路**：部署环境设置 `SERVER_RUNTIME_HTTP=1` → `RuntimeHttpAccessGuard.resolveRuntimeHttpAccessPolicy()` → `/runtime/*` 全部路由 → 玩家连接、位置、背包、钱包、市场、邮件、实例和 flush 操作。
- **证据**：修复前策略只记录 `enabled` 与可空 `token`；显式开启后 `canActivate()` 遇到 `token === null` 直接返回 `true`。`WorldRuntimeController` 整体使用该守卫，且其中存在 `wallet/credit`、`wallet/debit`、`grant-item`、市场下单/成交、邮件发送及持久化 flush 等高权限写入口。代码与文档中均没有第二层玩家鉴权或 GM token 守卫。
- **根本原因**：控制面设计把“没有配置 token”当成“无需鉴权”，未区分本地 smoke 的临时便利与生产显式启用；环境判定只看 `NODE_ENV` / npm lifecycle，且没有让明确的 `production / staging` 声明优先失败关闭。相邻 smoke 编排还会从本机 `.runtime/server.local.env` 继承生产运行环境，旧守卫无条件放行掩盖了测试环境污染。
- **为什么错误**：高权限管理控制面必须默认关闭，并在生产启用时强制拥有独立凭据；缺少安全配置不能退化成匿名访问。一次错误环境变量或端口暴露不应直接授予任意玩家资产和世界状态修改权限。
- **触发条件**：生产或预发布进程配置任一 `SERVER_RUNTIME_HTTP*` 启用开关，但遗漏或传入空的 `SERVER_RUNTIME_ADMIN_TOKEN / SERVER_RUNTIME_HTTP_TOKEN`；随后该端口能被非可信网络访问。继承 `smoke:*` lifecycle 变量还可能扩大误判风险。
- **可能后果**：未授权调用者可查询世界运行态，给任意玩家增减资产、移动或删除玩家运行态、操纵市场/邮件，触发 flush 等运维动作；造成资产增发或销毁、状态破坏、隐私泄露和拒绝服务，且操作可能进入 durable/audit 主链而长期固化。
- **修复方式**：策略显式区分 `misconfigured` 与正常关闭；`production / prod / staging` 声明优先于 npm lifecycle，生产显式开启但无 token 时保持关闭并返回明确 503。只有 `test / verify / smoke` 环境允许无 token；配置 token 后才允许生产访问，并用 `timingSafeEqual` 比较凭据。独立 smoke 覆盖生产缺 token、生产带 token、production 不受 smoke lifecycle 绕过、测试豁免、正确/错误 Bearer token。稳定 smoke 编排和各 case 子进程默认强制 `SERVER_RUNTIME_ENV=test`，只接受专用 `SERVER_SMOKE_RUNTIME_ENV` 或单用例显式覆盖，不再继承宿主机生产值。
- **实际修改**：更新 `runtime-http-access.guard.ts` 与稳定 smoke 编排入口 `run-stable-smoke-suite.ts`，并在修改编排入口时移除其遗留 `@ts-nocheck`；新增 `runtime-http-access-guard-smoke.ts`；同步 GM mechanics 的独立 Runtime 调试控制面边界。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与最终 `pnpm verify:quick` 通过；compiled `runtime-http-access-guard-smoke` 证明生产/预发布缺 token 失败关闭、生产带 token 正常启用、production 声明不受 `smoke:*` lifecycle 绕过、测试无 token 豁免，以及正确/错误 Bearer token 分支；无数据库 compiled stable `runtime` smoke 通过，证明临时 HTTP 服务在隔离后的 test 环境仍可完成真实路由调用。首次 `verify:quick` 在修复 smoke 环境隔离前按预期失败于 runtime 503，证明新守卫没有被旧测试配置绕过；隔离修复后全门禁复跑通过。
- **中文原子提交 hash**：`0c6df9ba`（`fix(security): 加固运行时调试控制面鉴权`）。

### FS-020 Runtime 资产管理入口写错真源且生产 durable 失效时静默降级

- **状态**：已修复、完成专项/真实数据库验证并原子提交。
- **严重级别**：P0。
- **所属功能组**：Runtime HTTP / 背包与灵石 / durable operation / 管理操作幂等。
- **影响链路**：`/runtime/players/:playerId/wallet/credit|debit` 或 `grant-item` → 玩家资产串行区 → `DurableOperationService.mutatePlayerWallet()` / `grantInventoryItems()` → 运行态 `creditWallet()` / `debitWallet()` / `replaceInventoryItems()` → flush 与重启恢复。
- **证据**：运行态 `getWalletBalanceByType()`、`creditWallet()` 和 `debitWallet()` 均以背包物品为真源，且只标记 `inventory` dirty；修复前 wallet HTTP 却先只替换数据库 `player_wallet`，随后运行态方法修改 `player.inventory.items`，两侧不是同一状态。wallet 与 grant-item 入口在 durable service disabled 时还会直接调用运行态方法并返回成功。operation ID 使用 `Date.now()` 在服务端临时生成，调用方不能在丢失响应后复用；现有 wallet route smoke 甚至构造“wallet 有 10 灵石、背包为空”的不可能运行态，只断言旧钱包事务而掩盖真源分裂。
- **根本原因**：管理路由沿用旧的独立钱包真源模型，没有随灵石收敛为背包货币同步迁移；“测试无数据库可用”的 fallback 未受环境边界约束，泄漏到生产；幂等只停留在 durable service 内部，HTTP 命令没有调用方稳定身份，也没有校验重放参数。
- **为什么错误**：管理资产操作与玩法发奖必须写同一数据库真源，且数据库不可用时不能用易失内存成功响应掩盖未持久化。强事务的幂等键必须由请求方在重试间保持稳定；相同键若参数变化必须冲突，而不是重复执行或静默接受另一条命令。
- **触发条件**：通过 Runtime 控制面增减灵石；数据库可用时进程在 `player_wallet` 提交后、背包 flush 前重启；数据库不可用时执行钱包或发物；HTTP 响应在提交后丢失并由调用方重试；同 requestId 被误用于不同数量或物品。
- **可能后果**：灵石在当前进程显示成功但重启后消失，或数据库钱包投影与背包真源长期分裂；生产数据库故障期间管理操作被误报成功并在重启时全部丢失；网络重试重复增发/扣除资产；错误复用幂等键产生不可解释的运营账实差异。
- **修复方式**：wallet credit/debit 改为规划完整背包 after snapshot，并通过一次 `grantInventoryItems` 以 `grant/remove` 动作写 `player_inventory_item`、inventory watermark、outbox 和 audit，提交后统一 `replaceInventoryItems()` 刷新 wallet 投影。wallet 与 grant-item 接受并返回稳定 `requestId / operationId`；生产强制调用方提供 requestId，提交前回读 operation，精确重放直接返回当前运行态，source 参数不同则拒绝。生产 durable 不可用时失败关闭，仅明确 test/verify/smoke 环境保留运行态 fallback；数量上限、背包容量、余额不足、session 与实例 lease fence 均在提交前校验。
- **实际修改**：更新 `world-runtime.controller.ts` 与 Runtime HTTP 环境判定导出；重写 `world-runtime-wallet-route-smoke.ts` 的背包真源夹具、输入/容量、重放/冲突和生产失败关闭断言；修复相邻 `world-runtime-inventory-route-smoke.ts` 的 durable 装配和当前 source identity；扩展 `player-asset-entry-serialization-audit.ts`，静态禁止该入口回退 `mutatePlayerWallet`；同步 GM mechanics。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与最终 `pnpm verify:quick` 通过；compiled `world-runtime-wallet-route-smoke` 证明灵石 `10 → 14 → 11` 全程只形成两次 inventory durable call，相同 requestId 的 credit 和 grant-item 均不重复，参数冲突、零数量、超上限、非法 requestId、满背包、生产缺 requestId 和生产 durable disabled 均拒绝，运行态 fallback 调用为 0；compiled `world-runtime-inventory-route-smoke` 证明 source identity、session/instance fence 和 durable 失败不改运行态；compiled `player-asset-entry-serialization-audit` 证明 wallet 管理入口按 replay → inventory durable → runtime apply 串行且源代码不再调用 `mutatePlayerWallet`；compiled `strong-persistence-lease-report` 通过；真实 PostgreSQL compiled `inventory-grant-durable-smoke` 证明 inventory、watermark、outbox、audit 与来源变更同事务、精确重放不重复、拒绝不污染真源。
- **中文原子提交 hash**：`d511cd0a`（`fix(runtime): 加固运行时资产管理入口`）。

### FS-021 NPC 任务灵石奖励未进入背包真源

- **状态**：已修复、完成专项/真实数据库验证并原子提交。
- **严重级别**：P0。
- **所属功能组**：NPC 任务 / 奖励结算 / 背包与灵石 / durable operation。
- **影响链路**：玩家提交 ready 任务 → `WorldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuestLocked()` → 奖励分类 → `DurableOperationService.submitNpcQuestRewards()` → `player_inventory_item / player_wallet / player_quest_progress` → 运行态背包与钱包投影 → 重启恢复。
- **证据**：修复前任务写路径把 `spirit_stone` 从 `inventoryRewards` 中剔除，`nextInventoryItems` 只包含提交物品扣除结果和普通奖励；灵石只通过 `applyQuestWalletRewards()` 累加进 `nextWalletBalances` 并写 `player_wallet`。durable 提交后运行态先以不含灵石的快照执行 `replaceInventoryItems()`，再用 `replaceWalletBalances()` 强行显示灵石。当前玩家钱包读取、加减和恢复均以背包中的 `spirit_stone` 为真源，二者语义直接冲突。原 mechanics 还明确写着灵石奖励“不占背包格”，与当前物品化货币模型不符。
- **根本原因**：任务强事务实现停留在旧的独立钱包模型；灵石迁移为背包货币后，只调整了 `PlayerRuntimeService`，没有同步任务奖励规划、容量校验、durable after snapshot、运行态应用和机制文档。钱包投影还按“旧余额 + 奖励”计算，任务若提交灵石物品也不会反映扣除结果。
- **为什么错误**：任务奖励、提交物品和任务完成态必须同成同败，且所有要求重启后仍存在的资产必须写当前数据库真源。用 `player_wallet` 制造一个背包中不存在的余额只会让当前进程暂时显示成功；投影不能反向覆盖真源，也不能绕过背包容量和物品数量上限。
- **触发条件**：提交含灵石奖励的任务；提交物品本身是灵石；玩家没有灵石堆且背包已满；灵石堆接近 `2_147_483_647`；任务 durable 提交后进程重启或玩家重新登录。
- **可能后果**：任务界面与钱包即时显示已经获得灵石，但重启/重连从 `player_inventory_item` 恢复后奖励消失；`player_wallet` 与背包长期账实不符；满背包仍可领取本应占新格的灵石；提交灵石任务后钱包投影保留旧余额；堆叠溢出时出现截断或超界资产；审计记录显示任务成功而玩家实际未获得可恢复奖励。
- **修复方式**：不再区分普通奖励和钱包奖励；先在玩家资产串行区内克隆当前背包，按提交物品扣除，再用共享物品堆叠签名合入全部奖励并分配必要的 `itemInstanceId`，校验容量和数量上限。由最终背包快照精确派生 `spirit_stone` 钱包投影，连同任务状态在一次 durable 事务内提交；提交成功后只 `replaceInventoryItems()`，由运行态背包刷新钱包缓存，禁止 `replaceWalletBalances()` 反向覆盖。无 durable 测试路径也复用同一快照规划，避免两套结算语义。
- **实际修改**：更新 `world-runtime-npc-quest-write.service.ts`、任务 mechanics、任务写路径 smoke、真实数据库 `npc-quest-reward-durable-smoke.ts` 与玩家资产串行静态审计。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与最终 `pnpm verify:quick` 通过；compiled `world-runtime-npc-quest-write-smoke` 证明提交物品扣除、普通奖励和灵石奖励形成同一 next inventory，钱包投影精确为背包灵石数量，durable 返回前不修改运行态，提交后不再调用 `replaceWalletBalances`；compiled `player-asset-entry-serialization-audit` 证明顺序为 inventory plan → wallet projection → durable → runtime apply；真实 PostgreSQL compiled `npc-quest-reward-durable-smoke` 证明拒绝不污染真源、session/instance lease fence、精确重放，以及包含 `rat_tail x2 + spirit_stone x3` 的背包真源、钱包投影、任务行、水位、outbox、audit 同事务提交并自动清理夹具。
- **中文原子提交 hash**：`45fff28d`（`fix(quest): 加固任务奖励背包真源`）。

### FS-022 NPC 任务写路径 smoke 通过 TypeScript 绕过隐藏构造器漂移

- **状态**：已修复、完成编译/专项验证并随 FS-021 原子提交。
- **严重级别**：P1（验证盲区，不直接修改玩家数据）。
- **所属功能组**：NPC 任务 / TypeScript 门禁 / smoke 可信度。
- **影响链路**：`world-runtime-npc-quest-write-smoke.ts` → server compile → `WorldRuntimeNpcQuestWriteService` 构造器与任务资产结算断言。
- **证据**：该 smoke 使用 `// @ts-nocheck` 和 CommonJS；它把含 `createQuestStateFromSource()` 的对象作为第二构造参数传入，但生产构造器第二参数早已是 `DurableOperationService`。类型检查被关闭后这一漂移长期未暴露。测试夹具同时把灵石只放进 wallet、断言 durable 后调用 `replaceWalletBalances()`，恰好把 FS-021 的错误行为固化为“正确期望”。
- **根本原因**：服务职责和构造器变更后，旧 smoke 没有同步迁移；`@ts-nocheck` 让 TypeScript 无法校验依赖位置和夹具字段，CommonJS 写法也绕开项目的 TypeScript 模块规范。
- **为什么错误**：资产 smoke 应证明当前生产依赖和真源语义，不能用失效构造器与不可能状态制造绿灯。若测试把 bug 写成期望，后续修复反而会被错误阻止；若继续关闭类型检查，依赖签名再次漂移也不会在编译期失败。
- **触发条件**：修改任务写服务构造器、钱包/背包真源或 durable 结算顺序；单独运行旧 smoke 时仍可能因依赖恰好未被访问而通过。
- **可能后果**：任务资产回归缺少可信门禁；测试声称覆盖 durable，实际使用的是错位依赖；灵石丢失、运行态提前应用或调用顺序错误被长期掩盖。
- **修复方式**：移除 `@ts-nocheck` 与 CommonJS，改为规范 TypeScript import；删除错位的第二构造参数；补齐真实 wallet 派生夹具，把期望改为灵石进入背包、durable 前不应用、提交后仅替换背包。首次恢复类型检查即准确发现错位 `createQuestStateFromSource` 和缺失 wallet 字段，修正后 server compile 与 compiled smoke 均通过。
- **实际修改**：更新 `world-runtime-npc-quest-write-smoke.ts`，并由静态资产审计补充生产源代码顺序断言。
- **验证结果**：移除 TypeScript 绕过后的 `pnpm --filter @mud/server compile` 通过；compiled `world-runtime-npc-quest-write-smoke` 与 `player-asset-entry-serialization-audit` 通过。
- **中文原子提交 hash**：`45fff28d`（随 FS-021）。

### FS-023 NPC 商店容量判定时序错误且商品堆叠无数量上限

- **状态**：已修复、完成专项/真实数据库回归并原子提交。
- **严重级别**：P0（资产部分提交与数量越界）/ P1（错误拒绝正常购买）。
- **所属功能组**：NPC 商店 / 背包与灵石 / durable operation / 容量与数量边界。
- **影响链路**：购买请求 → `WorldRuntimeNpcShopQueryService.validatePurchaseForNpc()` → 玩家有界命令队列 → `WorldRuntimeNpcShopService.dispatchBuyNpcShopItemLocked()` → 背包预演 → `DurableOperationService.purchaseNpcShopItem()` 或无库 fallback → 运行态背包。
- **证据**：修复前查询层先在原背包上调用 `canReceiveInventoryItem()`，未考虑本次扣款可能耗尽唯一灵石堆并释放一个格子；因此满背包玩家即使付款后恰好有空位也会被拒绝。写路径虽先从克隆背包扣灵石再放商品，但合堆时直接执行 `existing.count += incoming.count`，既不校验 `2_147_483_647` 上限，也不在最终 after snapshot 上重新校验容量。durable disabled 路径则完全绕过预演，依次调用 `debitWallet()` 和 `receiveInventoryItem()`；后者遇到堆叠溢出会截断到上限，玩家却已支付完整价格，两个调用之间失败还会只扣款不发物。
- **根本原因**：容量校验停留在“发物前的当前背包”而不是“扣款后的最终背包”；durable 与 fallback 各自维护不同结算步骤；商品堆叠逻辑没有复用玩家背包的数量上限约束。旧查询验证只回答“现在能不能放”，没有表达本次事务会先释放货币格子的事实。
- **为什么错误**：NPC 购买是单一资产命令，扣款、释放货币格、商品入包和钱包投影必须基于同一个 after snapshot。容量只能在事务顺序确定后判定；任何分支都不能让付款成功而商品被截断、漏发或未发。运行态与数据库还必须接受相同的单堆整数边界。
- **触发条件**：背包已满且购买价格恰好等于全部灵石余额；购买可与现有堆叠合并的商品且合并后超过 `2_147_483_647`；durable service 未启用时购买；分步 fallback 在扣款后、发物前抛错或进程终止。
- **可能后果**：玩家明明能用付款释放的格子却无法购买；超大购买生成超过运行时约束的数据库数量；无库路径扣除完整灵石但只得到截断数量，甚至完全没得到商品；任务刷新与通知可能基于半完成资产；后续同步、序列化或数值运算出现越界与账实差异。
- **修复方式**：查询层先确认余额；当前背包无法直接收取时，仅当本次会耗尽灵石余额、确定释放货币格才放行进入权威预演。写路径无论 durable 是否启用都先在玩家资产串行区克隆背包，扣除灵石后按共享堆叠签名合入商品，校验最终容量和 `2_147_483_647` 上限，再派生钱包投影。durable 路径提交同一 after snapshot；无库测试路径也只执行一次 `replaceInventoryItems()`，删除先扣款后发物的分步逻辑。
- **实际修改**：更新 NPC 商店查询/写服务、mechanics、`world-runtime-npc-shop-smoke.ts` 与玩家资产串行静态审计。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与最终 `pnpm verify:quick` 通过；compiled `world-runtime-npc-shop-smoke` 证明付款耗尽灵石时满背包请求可进入结算并以商品替换释放的格子、durable 使用 `spirit_stone:15 + qi_pill:1` after snapshot、无库 fallback 只替换一次 `qi_pill:1`，以及 `qi_pill` 已达 `2_147_483_647` 时购买被拒绝且运行态调用为 0；compiled `player-asset-entry-serialization-audit` 证明 inventory plan → wallet projection → durable → runtime apply 顺序且源代码不再调用分步 `debitWallet`；compiled `strong-persistence-lease-report` 通过；真实 PostgreSQL compiled `durable-operation-smoke` 完整通过，复证 NPC shop 的 session/instance lease fence、拒绝回滚、幂等重放、背包/钱包/水位/outbox/audit 同事务，并自动清理夹具。
- **中文原子提交 hash**：`d4d1e0a6`（`fix(shop): 加固商店购买资产预演`）。

### FS-024 NPC 商店 smoke 在异步断言完成前输出成功且关闭类型检查

- **状态**：已修复、完成编译/专项验证并随 FS-023 原子提交。
- **严重级别**：P1（验证盲区，不直接修改玩家数据）。
- **所属功能组**：NPC 商店 / TypeScript 门禁 / smoke 可信度。
- **影响链路**：`world-runtime-npc-shop-smoke.ts` → server compile → 查询/入队/结算专项证明。
- **证据**：旧文件使用 `// @ts-nocheck` 与 CommonJS，多个构造器传入不完整依赖而不受类型校验；主流程调用 `testDispatch().then(() => undefined)` 后立即打印 `{ ok: true }`，没有等待异步结算完成，也没有显式 catch 设置失败退出码。夹具还把无库购买建模为 `debitWallet + receiveInventoryItem`，把 FS-023 的分步资产风险写成期望，并缺失真实 inventory capacity。
- **根本原因**：早期脚本式 smoke 未迁移到规范 TypeScript 和受控 async main；服务构造器/资产真源演进后，测试依赖和断言没有同步，`@ts-nocheck` 继续掩盖所有错位。
- **为什么错误**：成功输出必须发生在所有异步断言完成之后；否则日志消费者可能先记录绿灯，而真正错误随后以 unhandled rejection 出现或被编排器误读。资产 smoke 也必须使用当前 after-snapshot 模型，不能把已删除的风险路径固定为正确行为。
- **触发条件**：异步 dispatch 在首个 await 后失败；服务构造器或依赖接口变化；结算从分步 mutation 迁移为快照应用。
- **可能后果**：CI/人工日志错误判断 NPC 商店通过；类型漂移直到运行时才暴露；容量、围栏、资产应用顺序回归无法由专项门禁可靠阻止。
- **修复方式**：移除 `@ts-nocheck` 与 CommonJS，使用局部 test-double 工厂显式收口 `as never`；补齐容量、钱包和背包真源夹具；把主流程改为 `async main()` 串行等待并在 catch 中设置非零退出码；断言同步更新为一次 after-snapshot 应用、付款释放格和数量上限拒绝。
- **实际修改**：更新 `world-runtime-npc-shop-smoke.ts`。
- **验证结果**：首次恢复类型检查即发现九处不完整构造依赖，收口 test-double 工厂后 `pnpm --filter @mud/server compile` 通过；compiled smoke 等待全部异步断言后以 0 退出并只输出一次成功结果。
- **中文原子提交 hash**：`d4d1e0a6`（随 FS-023）。

### FS-025 邮件灵石附件用旧钱包增量覆盖背包真源且堆叠可越界

- **状态**：已修复、完成编译、专项与真实数据库验证并原子提交。
- **严重级别**：P0（资产投影账实不符）/ P1（附件数量越界）。
- **所属功能组**：邮件 / 附件领取 / 背包与灵石 / durable operation / 资产投影。
- **影响链路**：玩家批量领取附件 → `MailRuntimeService.resolveAttachmentItems()` → `buildNextInventoryItems()` → `claimAttachmentsDurably()` → `DurableOperationService.claimMailAttachments()` → `player_inventory_item / player_wallet / player_mail_attachment / player_mail_counter` → 运行态背包与重启恢复。
- **证据**：邮件附件解析原本已经把 `spirit_stone` 放入 `nextInventoryItems`，但 durable 领取同时调用 `mergeWalletCredits(currentSnapshot.wallet.balances, walletCredits)`，以可能陈旧的旧钱包投影再加本次附件数量。若背包真源已有 10、旧钱包只有 1、附件为 10，事务会把背包写成 20、钱包写成 11；运行态随后又从背包显示 20，数据库两张表在同一次成功事务内就产生矛盾。背包预演合并已有堆时还直接执行数量相加，没有检查单堆 `2_147_483_647` 上限；`canReceiveAllAttachments()` 只区分容量不足，无法拒绝数量越界。
- **根本原因**：灵石收敛为背包物品真源后，邮件仍保留旧的“钱包余额 + 附件增量”模型；任务、商店和邮件各自复制钱包折叠/投影代码，导致同一资产迁移只修到部分入口。附件预演也只实现格子容量约束，遗漏与玩家背包、任务和商店一致的整数上限。
- **为什么错误**：`player_wallet` 只能是最终背包的单向精确投影，不能把可能陈旧的投影当作资产真源继续累加。邮件领取又是完整批次资产事务，任一附件超出可表示数量时必须整批拒绝，不能写入运行时无法稳定处理的计数，也不能只领取其他附件后把邮件标记已领取。
- **触发条件**：`player_wallet` 与背包灵石已经因历史写路径或恢复时序产生差异后领取灵石附件；同一灵石堆或普通物品堆接近 `2_147_483_647` 后再领取附件；批量邮件同时包含普通物品和越界堆叠。
- **可能后果**：当前进程显示的灵石与数据库钱包余额不同；依赖 `player_wallet` 的回读、审计或相邻运营链得到错误余额；重启/恢复后不同入口观察到不一致资产；超大附件生成越界堆叠，后续序列化、加减、持久化或客户端数值显示发生截断；批次领取若缺少统一拒绝语义会形成部分发放和不可重领邮件。
- **修复方式**：新增玩家域共享 `buildWalletBalancesFromInventory()`，折叠旧钱包行但只从最终背包精确重建指定货币条目；任务、商店和邮件统一复用，删除邮件 `mergeWalletCredits()`。邮件 resolver 只标记批次是否含钱包物品，durable 计划从 `nextInventoryItems` 派生 `nextWalletBalances`，与背包、邮件领取态、计数、水位、outbox 和 audit 同事务提交。附件预演在已有堆合并和新堆加入时都校验正整数及 `2_147_483_647` 上限，越界与容量不足分别失败关闭，整批保持未领取。
- **实际修改**：新增 `wallet-inventory-projection.helpers.ts` 并让 NPC 任务、NPC 商店、邮件三条资产链共用；更新邮件运行时、邮件 mechanics、邮件附件专项 smoke、真实数据库 durable smoke 夹具/断言与玩家资产串行静态审计。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与最终 `pnpm verify:quick` 通过；compiled `mail-wallet-attachment-smoke` 证明“背包 10、旧钱包 1、附件 10”时 durable 钱包计划精确为 20 而不是 11，并证明单堆已达上限时拒绝；compiled `mail-runtime-durable-required-smoke`、`world-runtime-npc-quest-write-smoke`、`world-runtime-npc-shop-smoke` 与 `player-asset-entry-serialization-audit` 通过，证明共享投影未改变相邻任务/商店语义且邮件不再保留旧增量函数；真实 PostgreSQL compiled `durable-operation-smoke` 以 0 退出，证明运行态初始背包 10、陈旧钱包 1、附件 +1 后，数据库和运行态背包/钱包均精确为 11，邮件领取态、计数、幂等重放及清理链同时通过。
- **中文原子提交 hash**：`3834b238`（`fix(mail): 加固附件领取钱包投影`）。

### FS-026 阵法资源命令先扣玩家资产再异步保存阵法后态

- **状态**：已修复、完成编译、专项与真实数据库验证并原子提交。
- **严重级别**：P0（玩家资产与阵法真源可部分提交）。
- **所属功能组**：阵法 / 背包与灵石 / 玩家灵力 / 实例 lease / durable operation。
- **影响链路**：tick 内布阵或补给命令、宗门管理动作 → `WorldRuntimeFormationService.dispatchCreateFormation() / dispatchRefillFormation() / dispatchInjectPersistentFormationEnergy()` → 玩家背包/钱包/灵力与地图灵力扩散 → 阵法运行态 → `instance_formation_state`。
- **证据**：修复前布阵依次执行 `spendQi()`、地图 `disperseQiAt()`、`debitWallet()`、`consumeInventoryItemByInstanceId()`，随后才把阵法放入运行态并调用不等待结果的 `persistFormationSnapshotSoon()`；普通补给和护宗大阵一次性注入也先扣玩家资产、直接修改阵法资源池，再异步保存阵法。玩家快照与阵法行由不同 writer、不同事务推进，命令处理器和宗门动作均不等待阵法资源提交结果，也没有把玩家 session、实例 lease/epoch 与阵法 revision 放在同一个资产提交围栏中。
- **根本原因**：阵法最初把持久化实现为运行态快照的最终一致性镜像，后续加入阵盘、灵石和玩家灵力消耗时仍沿用“先改内存、稍后落阵法”的模型；玩家资产 durable operation 没有提供阵法领域写入钩子，普通阵法 writer 与宗门 durable writer 的 advisory lock 也没有被资源命令复用。
- **为什么错误**：布阵和一次性补给是单个不可拆分的资产命令。阵盘、灵石、玩家灵力与获得的阵法资源必须同成同败；地图实例又可能在命令执行期间迁移，旧节点不能只凭本地对象继续写入。阵法补给还会与每 tick 衰减、开关和管理操作竞争，旧资源池快照不得覆盖已经更新的阵法行。
- **触发条件**：扣除资产后阵法数据库写入失败或进程崩溃；玩家快照 flush 与阵法异步 writer 只成功一个；命令执行时实例 lease 已转移或 epoch 变化；同一阵法在等待玩家资产锁期间被 tick/管理操作推进；阵法实例 ID 与数据库已有行碰撞；客户端或队列重试已提交请求。
- **可能后果**：玩家失去阵盘、灵石或灵力但阵法在重启后消失；阵法获得资源但玩家扣款未能恢复；旧节点在 lease handoff 后污染新节点真源；补给用旧 `updatedAt` 覆盖较新的衰减/管理结果；重复请求二次扣款；命令先返回成功而稍后的阵法保存失败，只留下难以关联的 warning。
- **修复方式**：布阵、普通补给和护宗大阵一次性注入全部改为先克隆并规划最终 `inventory / wallet / vitals / formation`，在玩家资产串行区与阵法持久化串行区内调用新的 `commitFormationResourceMutation()`。事务先校验玩家 `runtime_owner_id + session_epoch`、实例 `assigned_node_id + ownership_epoch + 未过期 lease`，再用与普通/宗门阵法 writer 相同的 advisory lock 校验“新建必须不存在”或“数据库 revision 不得新于运行态基线”，最后同事务写阵法、玩家三个投影域、恢复水位、outbox、资产 audit 和 operation log。只有 durable 成功后才一次性替换背包、设置灵力、扩散地图灵力并应用阵法运行态；tick 命令和宗门动作显式等待提交。生产数据库已配置但 durable 不可用时失败关闭，仅明确的测试/开发环境保留无库 fallback。
- **实际修改**：更新 `durable-operation.service.ts`、`sect-durable-persistence.ts`、`world-runtime-formation.service.ts`、玩家命令/动作/宗门调用点、阵法 mechanics 与玩家资产串行静态审计；新增无库入口 smoke 和真实 PostgreSQL durable smoke。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与 `pnpm verify:quick` 通过；compiled `formation-resource-durable-entry-smoke` 证明 durable 返回前不修改玩家、地图或阵法运行态，失败不扣资产，生产缺失 durable 时失败关闭；真实 PostgreSQL compiled `formation-resource-durable-smoke` 证明错误 epoch、阵法 ID 冲突和旧 formation revision 均整笔拒绝且不污染真源，成功与精确重放把 inventory/wallet/vitals/formation/watermark/outbox/audit/operation 同事务提交并自动清理；compiled `world-runtime-formation-smoke`、`world-runtime-action-execution-smoke`、`world-runtime-sect-smoke`、`inventory-item-instance-ref-smoke`、`player-asset-entry-serialization-audit`、`sect-runtime-durable-reconciliation-smoke` 与 `sect-durable-mutation-smoke` 通过。
- **中文原子提交 hash**：`211f038a`（`fix(formation): 加固阵法资源原子提交`）。

### FS-027 阵法核心 smoke 关闭类型检查并固化过期契约

- **状态**：已修复、完成编译与专项验证并随 FS-026 原子提交。
- **严重级别**：P1（验证盲区，不直接修改玩家数据）。
- **所属功能组**：阵法 / 世界投影 / 地块恢复 / TypeScript 门禁。
- **影响链路**：`world-runtime-formation-smoke.ts` → server compile → 阵法创建、补给、投影、地块恢复、持久化重试与数据库恢复证明。
- **证据**：旧 smoke 使用 `// @ts-nocheck` 和 CommonJS，因而未暴露四组契约漂移：世界投影夹具缺少地图 `name/kind/width/height` 与玩家 `facing`；协议地块缺少必填 `occupiedBy/modifiedAt`；玩家夹具缺少 `formationJob/techniqueActivityQueue`；`advanceTileRecovery()` 已增加 provider 参数但测试仍按旧签名调用。测试还直接访问阵法服务私有持久化集合和 timer，无法由类型系统约束访问边界。
- **根本原因**：早期脚本式 smoke 没有随 server 工具迁移到规范 TypeScript；生产投影、技艺 pipeline 和地块恢复 API 演进时，关闭类型检查使夹具只在恰好执行到对应分支时才可能暴露错误。
- **为什么错误**：阵法 smoke 同时承担协议投影、运行时资源与持久化恢复的关键证明；它若不参与编译，生产接口删改、必填字段变化或测试依赖错位都不会阻断门禁。直接依赖私有字段而不显式声明测试观察面，也会让重构错误表现为不清晰的运行时异常。
- **触发条件**：投影必填字段、地块协议、技艺活动结构、恢复 API 或阵法持久化内部实现再次变化；CI 只执行 TypeScript compile 而未逐个运行该 smoke。
- **可能后果**：编译绿灯不能证明阵法关键测试仍可运行；测试可能用生产中不可能出现的对象得到错误结论；协议和恢复行为回归延迟到运行时，且维护者可能为旧夹具错误放宽生产类型或接口。
- **修复方式**：移除 `@ts-nocheck`、CommonJS 和动态 `require`，改为规范 ES/TypeScript import；补齐真实投影、方向和地块字段，更新地块恢复 API 参数与技艺玩家夹具；仅为持久化重试断言定义最小的测试内部观察接口，经 `unknown` 显式收口后访问，避免在生产类上扩大公开 API。首次恢复类型检查暴露的全部错误均通过修正夹具和调用点解决，没有重新引入类型绕过。
- **实际修改**：更新 `world-runtime-formation-smoke.ts`。
- **验证结果**：移除 TypeScript 绕过后 `pnpm --filter @mud/server compile` 通过；compiled `world-runtime-formation-smoke` 完整通过，并继续证明阵法投影、双资源消耗、地块稳定、护宗阵、持久化 dirty 重试与数据库恢复链。
- **中文原子提交 hash**：`211f038a`（随 FS-026）。

### FS-028 阵法数据库 writer 未校验实例 lease handoff

- **状态**：已修复、完成编译、专项与真实数据库验证并原子提交。
- **严重级别**：P0（旧节点可覆盖或删除新节点阵法真源）。
- **所属功能组**：阵法 / 宗门护宗阵 / 实例 catalog / lease 与 ownership epoch / 持久化恢复。
- **影响链路**：阵法 tick 衰减、阵眼受击、开关/强度管理、启动违规阵法清理、宗门创建/迁移/转让/解散 → 单体/批量/删除或宗门跨域 formation writer → `instance_formation_state` 与 `instance_catalog`。
- **证据**：普通 `saveFormationSnapshot()`、`saveInstanceFormations()` 与 `deleteFormationSnapshot()` 只持有阵法 advisory lock，并以 `updated_at_ms` 防止较旧快照覆盖；事务从不读取 `instance_catalog`。宗门 `persistDurableSectMutation()` 同样先取得阵法锁后直接删写阵法行，没有接收或校验任何实例 lease。`updatedAt` 来自各进程本地 `Date.now()`，旧节点在 handoff 后继续 tick、受击或处理迟到操作时完全可能生成比新节点更大的版本。宗门迁移的阵法写还会按全局 `formation_instance_id` 删除旧行，但只携带新阵法位置，无法证明对原山门实例仍有写权。
- **根本原因**：阵法行自身只有时间版本，没有持久化 ownership epoch；早期 writer 把“运行时已检查可写”当成足以覆盖异步数据库提交的授权。阵法保存会在同步检查后跨越连接池、队列和事务 await，期间 lease 可以到期或迁移；宗门 durable 事务则只围栏玩家和宗门 revision，没有把跨实例阵法视为需要独立 catalog fence 的领域写。
- **为什么错误**：实例运行态的本地 lease 检查只能证明检查瞬间可写，不能授权稍后执行的数据库事务。所有实例域 writer 必须在实际写入的同一事务中锁定 catalog 行，并匹配捕获时的 node、token 和 epoch，同时确认 lease 未过期。仅比较墙钟时间不能表达所有权，时钟偏差和旧节点继续运行都会让错误 writer 看起来“更新”。
- **触发条件**：阵法异步保存已排队时实例 lease 到期、迁移或被强制接管；旧节点 tick/战斗/管理动作在 fence 生效前生成更晚 `updatedAt`；宗门迁移后旧山门由其他节点接管；启动清理或 shutdown flush 使用已失效的本地实例对象；生产调用未提供显式 fence。
- **可能后果**：旧节点覆盖新节点已经衰减、补给、受击或调整后的阵法资源；旧节点删除新节点仍存在的阵法；宗门迁移只验证新位置却跨节点删除旧位置行；重启恢复得到错误资源池、开关、位置或阵眼归属；同一护宗阵在节点间反复跳变，且由于旧写带更大时间戳，新节点的正确旧版本后态反而无法修复。
- **修复方式**：阵法运行态在发生 mutation 时从实际实例捕获不可变的 `instanceId / assignedNodeId / leaseToken / ownershipEpoch`，并随 dirty、单体保存和删除请求传递；普通 writer 在事务内先 `SELECT instance_catalog ... FOR UPDATE`，精确匹配 fence、确认 lease 未过期且实例未 destroyed/fenced/stopped，再按固定顺序取得阵法 advisory lock 和写行。生产数据库环境缺失 fence 时失败关闭。宗门跨域 formation write 新增实例 fence 集合，事务按 instanceId 排序先锁所有 catalog 行、再锁阵法；护宗阵写同时包含山门与阵眼实例，迁移额外包含原山门，解散也验证两端。所有 writer 统一采用“实例 catalog 行锁 → 阵法 advisory lock”的数据库锁顺序，避免与资源 durable operation 形成死锁环。
- **实际修改**：新增共享 `instance-lease-write-fence.ts`，并让 `durable-operation.service.ts` 复用同一 catalog 行锁与 lease 状态校验；更新 `world-runtime-formation.service.ts`、`sect-durable-persistence.ts`、`world-runtime-sect.service.ts`、阵法 mechanics、宗门 durable/reconciliation smoke 与阵法核心 smoke；新增真实 PostgreSQL `formation-persistence-lease-fence-smoke.ts`。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与 `pnpm verify:quick` 通过；真实 PostgreSQL compiled `formation-persistence-lease-fence-smoke` 证明 handoff 后普通单体、批量、删除和宗门跨域 writer 均拒绝旧 node/token/epoch 且数据库后态不变，新 fence 可以继续保存/删除，生产缺失 fence 时失败关闭，夹具自动清理；compiled `durable-operation-smoke` 完整通过，证明共享围栏抽取未改变邮件、市场、商店、钱包、装备与技艺 job 的强事务语义；compiled `world-runtime-formation-smoke`、`world-runtime-sect-smoke`、`sect-runtime-durable-reconciliation-smoke`、`sect-durable-mutation-smoke`、`formation-resource-durable-entry-smoke`、真实 PostgreSQL `formation-resource-durable-smoke`、`inventory-grant-durable-smoke` 与 `npc-quest-reward-durable-smoke` 通过，证明相邻资源原子事务未回归，宗门 smoke 额外断言 catalog 行锁早于阵法 advisory lock。
- **中文原子提交 hash**：`8bbf225b`。

### FS-029 阵法维护 tick 分步写入玩家与阵法资产

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P0（玩家资产与阵法资源池可在崩溃/失败后永久分裂）。
- **所属功能组**：阵法维护 / 通用技艺 job / 玩家灵力与技艺 / 阵法资源 / Durable Operation。
- **影响链路**：`WorldRuntimeCraftTickService.advanceCraftJobs()` → `FormationStrategy` → `resolveFormationMaintenanceTick()` → `PlayerRuntimeService.spendQi()`、阵法灵力池与技艺/job 运行态修改 → 玩家分域 flush 与阵法异步 writer。
- **证据**：维护 helper 在同一个同步函数里先直接扣 `player.qi`，再增加 `formation.remainingQiBudget`、推进 `formationJob.jobVersion` 和阵法技艺经验，随后仅调用不带 fence 的 `persistInstanceFormationsSoon(instanceId)`。玩家 `vitals / profession / active_job` 由 1.5 秒分域 flush 独立写入，阵法 writer 则由另一连接、队列和事务保存；两边没有共同 operation ID、事务、CAS 或失败补偿。FS-028 加入生产 fence 后，该调用也没有传入实例 node/token/epoch，恢复后的首个维护 tick 会因缺失 fence 被普通阵法 writer 拒绝。
- **根本原因**：阵法维护早期被当成“普通进度 tick”，但它实际每息同时完成玩家灵力支出、阵法灵力入账、技艺经验授予和 job 推进，是跨玩家域与实例域的资产转换。通用技艺 pipeline 只负责生命周期和 dirty domain，没有自动提供跨领域原子提交；调用方也没有像强化资产边界那样增加 durable 编排。
- **为什么错误**：dirty/flush 只能保证各表最终有机会保存，不能保证两个独立事务要么全成要么全败。玩家灵力与阵法灵力是一笔守恒转换，必须共享玩家 session fence、实例 lease fence、job version、formation revision 和同一 COMMIT；在 COMMIT 前修改可被查询/同步的运行态同样会暴露未落库结果。
- **触发条件**：任一维护 tick 后服务崩溃；玩家 flush 成功而阵法保存失败，或反向发生；实例 handoff 后旧维护任务继续 tick；同一 job 的迟到/重复 tick；阵法更新与维护并发；durable COMMIT 结果未知；生产从数据库恢复阵法后首次维护。
- **可能后果**：玩家被扣灵但阵法未增加，或阵法凭空增加而玩家未扣灵；技艺经验/job version 与实际资源转换不一致；重启后重复结算或跳过一息；旧节点跨 lease 写阵法；客户端在数据库失败前短暂看到未提交资源；持续维护会累积不可对账的资产差额。
- **修复方式**：craft tick 对 `formation` 显式路由到阵法 durable 编排，但领域计算仍调用同一 `FormationStrategy`/pipeline；在玩家资产锁与阵法锁内同步计算后态并立即恢复提交前运行态，再提交专用 `commitFormationMaintenanceMutation()`。事务先校验玩家 presence 与实例 node/token/epoch/expiry，再以 job run/version 和 formation `updatedAt` CAS 写入阵法、`vitals / profession / active_job`、watermark、outbox 与 audit；成功后一次性重新应用玩家、技艺/job、阵法和实例 revision，失败恢复完整前态。非生产 fallback 的普通维护保存改由阵法服务捕获并传递 lease fence，阵法 `updatedAt` 同时改为单调递增。
- **实际修改**：更新 `durable-operation.service.ts`、`formation-maintenance-tick.helpers.ts`、`world-runtime-craft-tick.service.ts`、`world-runtime-formation.service.ts` 与阵法 mechanics；新增 `formation-maintenance-durable-entry-smoke.ts`，扩展阵法资源 entry/真实 PostgreSQL smoke 覆盖 lease token、job CAS、原子提交、精确重放与回滚清理。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与 `pnpm verify:quick` 通过；compiled `formation-maintenance-durable-entry-smoke` 证明真实 formation strategy/pipeline 在 durable 返回前不会暴露玩家灵力、阵法池、技艺经验、job version 或实例 revision，成功后一次应用且失败完整恢复；真实 PostgreSQL compiled `formation-resource-durable-smoke` 证明 `vitals / profession / active_job / formation / watermark / outbox / audit` 同事务、精确重放不重复、陈旧 job version 拒绝且真源不变；compiled `formation-resource-durable-entry-smoke`、`world-runtime-formation-smoke`、真实 PostgreSQL `formation-persistence-lease-fence-smoke` 与 `durable-operation-smoke` 通过。尚未证明 5000 名玩家同时维护时的数据库吞吐与 tick 延迟，该容量证据仍属于 R-05/X-04 后续专项基准，不能据此声称已完成全量性能覆盖。
- **中文原子提交 hash**：`5e71e3f7`。

### FS-030 `world-runtime-craft-smoke` 建筑夹具缺失 AOI revision 索引

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P1（综合技艺验证门禁无法完整运行，不直接修改生产数据）。
- **所属功能组**：技艺综合 smoke / 建筑运行时 / AOI chunk revision。
- **影响链路**：compiled `world-runtime-craft-smoke` → `testBuildingActiveBuilderAllowsCooperativePlayers()` → `MapInstanceRuntime.startBuildingConstruction()` → `markAoiViewChangedAt()` → `setChunkRevision()`。
- **证据**：当前 compiled smoke 在阵法维护断言之后进入协作建造夹具时，以 `TypeError: Cannot read properties of undefined (reading 'get')` 终止；栈顶为 `setChunkRevision()` 读取未初始化的 chunk revision 行索引。失败发生在本组阵法代码之外，且 `formation-maintenance-durable-entry-smoke` 与阵法核心 smoke 均独立通过。
- **根本原因**：测试用 `Object.create(MapInstanceRuntime.prototype)` 创建不完整对象，只手工填充 tick、revision、玩家和建筑字段，完全绕过类字段初始化；生产运行时新增 `aoiRevisionByChunkRow`、`aoiSightRevisionByChunkRow` 等实例级索引后，综合 smoke 的建筑夹具没有同步到生产构造契约。
- **为什么错误**：综合 smoke 应以生产可成立的运行态对象验证技艺链；缺失必需索引会让测试在目标断言前崩溃，既不能证明建筑协作，也会遮挡后续技艺回归。
- **触发条件**：运行 compiled `world-runtime-craft-smoke` 并进入协作建造用例。
- **可能后果**：CI/人工验证无法覆盖该 smoke 后半段；建筑、队列或技艺生命周期回归可能被长期遮挡；维护者可能误判为本次相邻业务改动导致。
- **修复方式**：建筑协作用例改为通过 `new MapInstanceRuntime(...)` 和完整的最小地图模板创建实例，让 AOI、地块、建筑拓扑、缓存和持久化修订字段全部走生产初始化；测试只注入当前用例所需的玩家和半成品，并新增两次施工切换均推进 AOI、`worldRevision`、`persistentRevision` 的断言，避免未来再次以补单字段的方式掩盖构造契约漂移。
- **实际修改**：更新 `world-runtime-craft-smoke.ts`，新增 `createCraftSmokeMapInstance()` 生产构造夹具，移除该用例的 prototype 伪实例，并补 AOI 与双 revision 边界断言；没有修改生产建造、AOI 或技艺逻辑。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile` 与 `pnpm verify:quick` 通过；compiled `world-runtime-craft-smoke` 完整以 0 退出，原先崩溃点及其后的共享施工、条件休眠、strategy helper、统一 pipeline 与阵法失败分支均完成断言。该修复只恢复并加固既有综合 smoke，不证明 R-04 全部建筑运行时或 R-05 容量指标。
- **中文原子提交 hash**：`299ce586`。

### FS-031 兑换与异步导航异常泄露服务端错误文本

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P1（内部错误信息泄露、协议语义不稳定；不直接修改玩家资产）。
- **所属功能组**：兑换码 / 异步寻路 / 待执行导航命令 / 结构化通知 / 客户端 i18n。
- **影响链路**：`WorldRuntimeRedeemCodeService.dispatchRedeemCodes()` 或 `WorldRuntimeNavigationService.materializeNavigationCommandBatch()` 捕获异常 → `error.message` → `queuePlayerNotice()` → Notice 协议 → 客户端日志/浮层。
- **证据**：兑换 durable 调用失败时，catch 既把 `message` 写服务端 warn，又原样作为玩家通知；导航的 Worker/同步寻路结果回收与 `enqueuePendingCommand()` 两个 catch 也直接发送同一 `message`。这些异常可来自 PostgreSQL、durable operation、Worker、队列或程序错误，现有接口没有保证文本只含玩家可见内容。故障注入 `database host=internal-db...`、`worker host=path-worker-3...` 与 `storage key=private...` 时，旧实现会把完整文本送入 Notice。
- **根本原因**：异常边界把“运维诊断日志”和“玩家反馈”复用了同一个自由文本字段，缺少从内部异常到稳定玩家语义的显式映射；兑换结果虽已有 `execution_failed` 协议码，旁路 Notice 仍绕过了结构化规则；导航也没有区分确定性业务拒绝与未知基础设施故障。
- **为什么错误**：内部异常文本不属于客户端协议，可能包含节点名、数据库主机、存储键、内部地图 ID 或实现细节；它也没有稳定 key，无法由客户端语言包统一渲染。后端原样透传违反“后端传 key/变量、前端拼接文本”的通知边界，并把日志数据暴露给不可信客户端。
- **触发条件**：兑换 durable/数据库异常；异步寻路 Worker 或 fallback 抛错；导航结果正常但待执行命令入队抛错；确定性越界/不可达拒绝进入异步回收 catch。
- **可能后果**：玩家可见内部拓扑或实现细节，增加安全侦察面；不同异常库升级后文案漂移；前端无法本地化或稳定聚合；原始异常可能过长并污染通知队列。兑换结果同时已有错误码时还会形成两套不一致的失败语义。
- **修复方式**：原始异常只保留在服务端日志；兑换 catch 固定发送 `notice.redeem.execution-failed`，并继续回显同一 request ID 与 `execution_failed`；导航把越界、任务不可达、一般不可达映射为独立稳定 key，未知 Worker/队列/程序异常统一映射为 `notice.navigation.failed`。所有玩家通知均携带结构化载荷，客户端 CSV 作为中文真源并重新生成类型常量。
- **实际修改**：更新 `world-runtime-redeem-code.service.ts`、`world-runtime-navigation.service.ts`、中文 i18n CSV 与生成产物；把旧 CommonJS/`@ts-nocheck` 兑换 smoke 改为规范 TypeScript，并新增 `world-runtime-navigation-notice-smoke.ts`，分别注入数据库、Worker、队列与确定性越界故障，断言敏感原文只在服务端日志存在。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、`pnpm verify:quick` 与 `pnpm verify:client` 通过；compiled `world-runtime-redeem-code-smoke` 与 `world-runtime-navigation-notice-smoke` 证明原始内部文本不进入玩家通知、结构化 key 正确、request ID/error code 不变且失败导航意图被清理；客户端门禁证明 3842 条语言包生成、TypeScript、Vite 构建、请求生命周期、UI 连续性、Socket 出站闸门与地图渲染 proof 未回归。待执行指令的独立原始错误旁路仍见 FS-032，不能据此标记 S-03 全覆盖。
- **中文原子提交 hash**：`666292e3`。

### FS-032 待执行指令失败仍透传未分类异常文本

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P1（内部标识/异常信息可能泄露，且玩家通知不满足结构化协议）。
- **所属功能组**：待执行指令 / 战斗与技艺拒绝 / 结构化通知 / 诊断日志。
- **影响链路**：`WorldRuntimePendingCommandService.dispatchPendingCommands()` catch → `normalizePendingCommandNoticeMessage()` → `queuePlayerNotice(playerId, noticeMessage, 'warn')`。
- **证据**：归一化函数只抑制妖兽 runtime ID、背包实例 ID、无出生点 instance ID、英文技能范围与一个 JavaScript TypeError 前缀，其余输入最终直接 `return message`；现有 smoke 明确断言未知 `Error('boom')` 和 `技能 skill.iron_bone_art 尚在冷却` 被原样发送，后者已经暴露内部 skill ID。该 catch 的异常来源覆盖实例指令、玩家指令、自动战斗重试、装备、物品、技艺和导航，不存在“错误文本天然可公开”的统一契约。
- **根本原因**：早期实现以字符串黑名单逐个遮挡已发现的内部标识，没有建立按 command kind 与拒绝类别映射稳定 notice key 的正向白名单；新的指令或异常格式默认落入原文透传。
- **为什么错误**：黑名单无法覆盖未知数据库/程序错误和未来标识格式，且把服务端自由文本当成协议；技能 ID、实例 ID 或堆栈片段都可能随着错误来源变化再次外泄。
- **触发条件**：任一待执行命令抛出未命中现有少量抑制规则的异常；手动技能处于冷却、元气不足或目标异常；基础设施错误从下层冒泡。
- **可能后果**：内部 ID/实现细节泄露、通知不可本地化、错误文本漂移或过长、相同业务拒绝在不同入口显示不同文案；仅新增一个异常源即可绕过当前黑名单。
- **修复方式**：按 `command.kind + 已确认拒绝类别` 建立结构化 key 正向映射：导航、手动战斗、技能冷却/元气、技艺任务与受保护地块物品各自使用稳定语义；未知异常统一显示通用失败，完整原文只写诊断日志；内部 runtime/item/instance ID 和 JavaScript 程序错误继续静默，自动战斗常态目标失效规则不变。
- **实际修改**：更新 `world-runtime-pending-command.service.ts`、客户端中文 i18n CSV 与生成产物；把 `world-runtime-pending-command-smoke.ts` 从 CommonJS/`@ts-nocheck` 迁为规范 TypeScript，补未知数据库异常、技能内部 ID、跨图内部 map ID、技艺队列、受保护区域物品与结构化 key 断言。迁移过程中还发现该 smoke 仍假设“portal 覆盖 move”和“计数按玩家数”，已按当前生产队列契约修正为 movement 可替换、portal 进入有界一次性队列、计数按真实命令条目数，并移除两个被 JavaScript 静默覆盖的重复 `getInstanceRuntime` 属性。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、`pnpm verify:quick` 与 `pnpm verify:client` 通过；compiled `world-runtime-pending-command-smoke` 完整以 0 退出，证明未知异常不泄露、导航/战斗/技艺/物品拒绝均携带结构化 key、技能与地图内部 ID 不进入玩家通知、自动战斗目标失效和内部程序错误保持静默，同时当前队列所有权/计数契约有真实断言；客户端门禁证明 3859 条语言包生成、TypeScript/Vite、UI 连续性、Socket 出站与地图渲染生命周期未回归。
- **中文原子提交 hash**：`c997822d`。

### FS-033 通天塔状态通知由服务端直接拼接玩家文案

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P2（协议与本地化边界错误，不直接影响塔层进度或玩家资产）。
- **所属功能组**：通天塔 / 玩家通知 / 客户端 i18n / 运行时烟测。
- **影响链路**：进入、通关或退出通天塔 → `WorldRuntimeTongtianTowerService` → `queuePlayerNotice()` → Notice 协议 → 客户端日志与浮层。
- **证据**：进入层、完成当前波次和退出塔层三条生产路径分别使用模板字符串或固定中文直接构造 `text`，调用 `queuePlayerNotice()` 时没有第六个结构化载荷参数；客户端语言包不存在对应 key。现有 `tongtian-tower-smoke` 仅收集 `playerId/text/kind`，因此即使生产通知长期缺少 key 和 vars 也不会失败。
- **根本原因**：通天塔功能早于结构化通知 helper 建立，后续进度、实例租约和恢复链持续演进时没有把玩家文案迁移到客户端真源；测试夹具也把旧的三参数接口固化为正确契约。
- **为什么错误**：服务端应只提供稳定消息 key 与层数、目标地图名等结构化数据，中文拼接必须由客户端语言包负责。自由文本没有协议身份，无法稳定本地化、聚合或统一改文案，也让同一信息在旧客户端 fallback 与新客户端渲染之间缺少可验证契约。
- **触发条件**：玩家进入任意通天塔层；本波参与者击杀全部虚影并解锁下一层；玩家退出通天塔返回出口地图。
- **可能后果**：修改通天塔玩家文案必须发布服务端；不同客户端语言或渲染入口无法复用；服务端 fallback 与客户端展示可能漂移；新增变量或富文本时只能继续解析中文。该问题不泄露内部异常，也不改变当前塔层参与者、解锁或位置语义。
- **修复方式**：三条路径统一调用 `buildStructuredNotice()`，分别发送 `notice.tower.entered`、`notice.tower.layer-cleared` 和 `notice.tower.exited`；层数、解锁层和实际出口地图名作为 vars，数字与地图名使用 pill 元数据；服务端中文仅保留为旧客户端/日志 fallback。客户端 CSV 新增三条中文真源并重新生成类型常量。
- **实际修改**：更新通天塔运行时服务、客户端中文 i18n CSV/生成产物和 `tongtian-tower-smoke.ts`；烟测夹具开始捕获结构化 key/vars，并断言进入和退出变量正确、通关通知只发给该波参与者而不发给中途加入者。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、`pnpm verify:client` 与 `pnpm verify:quick` 通过；compiled `tongtian-tower-smoke` 证明进入第 1 层发送 `{ layer: 1 }`，第 1 层通关只向首波参与者发送 `{ layer: 1, unlockedLayer: 2 }`，退出返回栖真渡发送 `{ mapName: '栖真渡' }`，且既有塔层 lease、恢复、冷却和空闲销毁断言未回归；客户端门禁证明 3862 条语言包生成、TypeScript/Vite、UI 连续性、请求生命周期、Socket 出站和地图渲染 proof 未回归，最小总门禁的 server compile、生产边界与无库 smoke 子集完整通过。
- **中文原子提交 hash**：`5ada4dec`。

### FS-034 自动凝练根基存在动作与 tick 两条纯文本通知旁路

- **状态**：已修复、验证并完成中文原子提交。
- **严重级别**：P2（协议与本地化边界错误，不改变凝练结算或持久化语义）。
- **所属功能组**：境界修炼 / 自动凝练根基 / 玩家 tick / 动作入口 / 结构化通知。
- **影响链路**：玩家手动开启/关闭自动凝练 → `WorldRuntimeActionExecutionService.executeAction()`；或每息自动凝练达到当前境界上限 → `PlayerRuntimeService.disableAutoRootFoundationAtCap()` → EventBus/本地通知队列 → Notice 协议 → 客户端。
- **证据**：动作入口根据开启、主动关闭和到达上限三种状态直接选择中文字符串，以三参数调用 `queuePlayerNotice()`；玩家 tick 检测到上限后则自行创建只含 `id/kind/text` 的 notice 并直写 EventBus/本地队列，完全绕过同类进度通知已使用的 `queuePlayerStructuredNotice()`。因此同一“达到上限并自动关闭”语义在按钮入口和 tick 入口有两套纯文本实现，客户端语言包没有稳定 key。
- **根本原因**：自动凝练开关与上限关闭分别演进在 world action 层和 player runtime 层，结构化通知迁移只覆盖了相邻修炼结果，没有沿“手动入口 → 权威 tick → 自动关闭 → EventBus”完整追踪；player runtime 还重复实现了通知入队细节。
- **为什么错误**：客户端应通过稳定 key 渲染玩家文案；同一业务状态不能因触发来源不同而一个走 world helper、另一个直接拼接 EventBus entry。重复入队实现还容易遗漏结构化载荷、优先级和后续队列约束。
- **触发条件**：手动开启或关闭自动凝练；开启时已经达到当前上限；自动凝练一息后达到上限并由 tick 自动关闭。
- **可能后果**：客户端无法本地化或稳定聚合自动凝练状态；文案修改需发服务端；手动与自动关闭可能漂移；后续通知队列契约变化时，player runtime 的旁路可能再次漏字段。资产、根基上限、材料消耗和 `combat_pref` dirty domain 本身不受影响。
- **修复方式**：定义开启、主动关闭、达到上限三个独立 key，避免把不可本地化的状态枚举作为中文变量；动作入口统一使用 `buildStructuredNotice()`。player runtime 的 tick 自动关闭复用现有 `queuePlayerStructuredNotice()`，发送与动作入口相同的上限 key，不再手写 EventBus entry。客户端 CSV 成为三条中文真源。
- **实际修改**：更新动作执行服务、玩家运行时、客户端中文 i18n CSV/生成产物、动作综合 smoke 与玩家 dirty-domain smoke；动作 smoke 覆盖开启、主动关闭、开启时已达上限三种 key，dirty-domain smoke 覆盖自动凝练结算后由 tick 关闭的 key。专项运行还暴露动作 smoke 仍期待 FS-032 之前的原始“目标无效”通知，已按当前协议修正为通用文案和 `notice.command.failed`，防止既有修复造成假红。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、compiled `world-runtime-action-execution-smoke`、compiled `player-runtime-dirty-domain-smoke`、`pnpm verify:client` 与 `pnpm verify:quick` 通过；动作专项证明开启、主动关闭、开启时已达上限及相邻待执行指令 key，dirty-domain 专项证明自动凝练后根基、材料、偏好 dirty domain 不变且自动关闭携带 `notice.action.auto-root-foundation-cap`；客户端门禁证明 3865 条语言包生成、TypeScript/Vite、UI 连续性、请求生命周期、Socket 出站和地图渲染 proof 未回归，最小总门禁包含该 dirty-domain smoke 并完整通过 server compile、生产边界和无库 smoke 子集。
- **中文原子提交 hash**：`afb9d94d`。

### FS-035 世界迁移成功状态由服务端拼接四种自由文本

- **状态**：已修复并完成编译、专项、客户端与最小总门禁验证，待本组中文原子提交。
- **严重级别**：P2（协议与本地化边界错误，不改变世界偏好或跨实例接入顺序）。
- **所属功能组**：世界迁移 / 分线偏好 / 动作入口 / 结构化通知。
- **影响链路**：玩家在手动界门附近选择现世或虚境 → `executeWorldMigration()` 校验 → 同线更新偏好，或等待目标实例连接成功后更新偏好 → `buildWorldMigrationNotice()` → 三参数 `queuePlayerNotice()` → 客户端。
- **证据**：世界迁移已正确在目标实例连接成功后才提交偏好，但成功提示仍由 `buildWorldMigrationNotice()` 返回四种中文字符串；调用方只传 `text/kind`，客户端语言包没有对应 key。四个分支分别是现世保持、现世切换完成、虚境保持和虚境切换完成。
- **根本原因**：FS-012 修复了迁移提交时序，却把 notice builder 保留为字符串函数；审计当时聚焦位置与偏好权威性，没有继续追踪 Notice 的结构化消费边界。
- **为什么错误**：分线预设和“保持/完成”都是稳定协议语义，应由 key 表达，不能让客户端从中文句子反推。把中文世界名作为变量同样会让服务端承担本地化，因此需要四个明确 key，而不是一个 key 加中文或不可翻译的状态变量。
- **触发条件**：玩家选择当前已在的分线；或从虚境切入现世、从现世切入虚境并成功连接目标实例。
- **可能后果**：迁移文案必须随服务端发布；多语言客户端无法独立渲染；日志/浮层难以稳定聚合同类迁移；旧客户端 fallback 与新客户端文案可能漂移。连接失败仍不会更新偏好或发送成功通知，这一既有安全语义不受影响。
- **修复方式**：让 builder 返回 `buildStructuredNotice()` 结果，按现世/虚境和保持/完成组合选择四个稳定 key；两条调用路径都发送第六个结构化载荷，中文仅作 fallback。客户端 CSV 新增四条真源，不发送中文世界名或状态变量。
- **实际修改**：更新动作执行服务、客户端中文 i18n CSV/生成产物和动作综合 smoke；smoke 覆盖四个 key，并继续保留目标实例 lease 失败时不提交偏好、不发送成功通知的断言。
- **验证结果**：`git diff --check`、`pnpm --filter @mud/server compile`、compiled `world-runtime-action-execution-smoke`、`pnpm verify:client` 与 `pnpm verify:quick` 通过；专项证明四种成功分支分别发送预期 key，现世切换的连接输入、偏好提交顺序以及 lease 拒绝失败关闭语义未回归；客户端门禁证明 3869 条语言包生成、TypeScript/Vite、UI 连续性、请求生命周期、Socket 出站和地图渲染 proof 未回归，最小总门禁的 server compile、生产边界与无库 smoke 子集完整通过。
- **中文原子提交 hash**：待本组提交后回填（计划提交：`fix(notice): 结构化世界迁移状态通知`）。

## 2026-07-14 待用户决定

### D-001 拆除密室时剩余燃料是否返还

- **已确认事实**：灵石通过 durable operation 转换为密室燃料；当前机制在拆除时删除整条密室状态，数据库燃料与尚未消耗的内存缓冲均不返还。
- **缺失证据 / 无法确定原因**：现有机制文档明确了“删除密室状态”，但没有明确说明拆除是否意味着玩家主动放弃剩余燃料，也没有定义不足一枚灵石的零头处理规则。这属于玩家资产产品口径，不能由代码审计自行决定。
- **方案 A**：维持不返还，但拆除前必须展示剩余燃料并要求明确确认。实现简单，不引入反复建造套利；玩家可能误操作损失大量燃料。
- **方案 B**：按当前内容配置向下取整返还灵石，零头销毁。玩家损失较小，但配置变更前后兑换率和内存预留燃料的归属需要固定规则与审计。
- **方案 C**：有剩余燃料时拒绝拆除，要求先消耗完或执行单独的“放弃燃料并拆除”操作。资产语义最明确，但操作成本最高。
- **推荐方案**：方案 C。它不需要把已消耗/预留燃料逆向折算为灵石，也不会因配置变更产生套利；玩家必须显式决定是否放弃。
- **暂不处理的后果**：当前拆除会永久销毁全部剩余燃料，且服务端没有独立确认语义。
- **需要用户决定**：选择 A、B 或 C；若选择 B，还需确定零头和历史兑换率口径。

### D-002 玩家单次允许提交 5 个还是 50 个兑换码

- **已确认事实**：`MAX_BATCH_REDEEM_CODES` 常量和原 mechanics 表写 50，输入归一化最多保留 50 个；但 `redeemCodes()` 随后对超过 5 个直接报错，mechanics 索引也写“单次上限 5 码”，因此当前真实玩家行为是 5。客户端文案只说支持多个，没有公开具体数值。
- **缺失证据 / 无法确定原因**：没有产品说明能证明 50 是目标批量能力还是仅用于防御性解析上限，也没有运营侧一次发放大量码后的玩家使用场景。把入口改成 50 会显著增加单请求持锁和数据库事务次数；把常量改成 5 则会正式放弃可能预留的批量能力。
- **方案 A**：统一为 5。把归一化上限、服务端错误和 mechanics 全部收敛到 5；单请求成本最小，符合当前线上行为和索引说明。
- **方案 B**：统一为 50。移除 5 码硬限制；需要把逐码串行 durable 操作的请求时限、全局兑换码 mutation queue 和错误结果包体一起做容量验证。
- **方案 C**：通过生产友好的服务端配置控制，默认 5、最大 50，并在客户端显示当前限制。更灵活，但新增配置契约和运维复杂度。
- **推荐方案**：方案 A。当前实现、索引和 3 秒频限都更接近小批量交互；在没有 50 码真实需求和容量证据时，不应扩大单请求资产操作面。
- **暂不处理的后果**：实际仍只允许 5 个；代码保留 50 的内部常量，后续维护者可能再次误读并改出行为漂移。
- **需要用户决定**：选择 A、B 或 C；若选择 B，还需确认是否接受一次请求最长跨越 50 个 durable operation。
