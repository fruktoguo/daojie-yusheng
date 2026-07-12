# 前后端全链路审计台账（2026-07-13）

## 审计口径

- 生产主线：`packages/client`、`packages/shared`、`packages/server`、`packages/config-editor`。
- 当前基线：`main` 分支 `77c0cced`；相对 `origin/main` ahead 7。
- package manager：`pnpm@10.29.1`。
- 每项结论必须来自机制文档、完整调用链、测试、编译产物或运行数据；仅凭搜索未发现异常不能标记为“确认无问题”。
- `[x]` 只表示该行列出的具体证据范围已完成，不代表相邻系统或整个项目已完成。
- 开始审计时已有未提交的 tick 调度代码、smoke 及相关文档修改；它们随后独立形成 `a5c7b0f6`。本轮未修改、暂存或夹带这些文件。

## 覆盖矩阵

### 基线与边界

- [x] A-01 工作区、分支、近期提交、package scripts、mechanics 索引和现有持久化审计材料已盘点。
- [ ] A-02 `packages/*` 生产模块、入口、后台 worker、smoke/proof/audit 与文档的完整对应关系。
- [ ] A-03 公共 API、依赖方向、文件职责和运行时/网络/持久化/UI 边界审计。

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

### 服务端权威运行时

- [ ] R-01 tick、实例调度、意图队列、取消/中断、超时和重启后的状态推进。
- [ ] R-02 移动、寻路、占位、跨图传送、AOI、首包与断线重连。
- [ ] R-03 战斗、仇恨、技能、buff、怪物 AI、刷新掉落和 PvP 权限。
- [ ] R-04 建筑、房间、风水、灵气场、技艺 job、NPC、任务、自动化和 Actor。
- [ ] R-05 5000 玩家/10000 实例口径下的索引、队列、定时器、Worker、缓存和热路径分配。
- [x] R-06 通天塔空闲生命周期的失败重试、资源卸载与重启恢复相邻链路已完成专项验证；见 FS-004。

### shared、协议与内容链路

- [ ] S-01 C2S/S2C 类型、运行时校验、鉴权入口、请求幂等与迟到/乱序响应。
- [ ] S-02 bootstrap/static/detail/delta 分层、AOI 范围、字段最小化和客户端消费完整性。
- [ ] S-03 结构化通知 key/变量、i18n 生成与所有服务端玩家可见消息入口。
- [ ] S-04 config-editor → shared schema → 导入校验 → server catalog → client catalog/展示。
- [ ] S-05 新 schema 唯一真源、GM 兼容转换目录和旧格式运行时门禁。

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

- **状态**：已修复并完成专项验证，待本功能组原子提交。
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
- **中文原子提交 hash**：待本功能组提交后回填。

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
