# 前后端全链路审计台账（2026-07-13）

## 审计口径

- 生产主线：`packages/client`、`packages/shared`、`packages/server`、`packages/config-editor`。
- 当前基线：`main` 分支 `a5c7b0f6`；相对 `origin/main` ahead 4。
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

### 服务端权威运行时

- [ ] R-01 tick、实例调度、意图队列、取消/中断、超时和重启后的状态推进。
- [ ] R-02 移动、寻路、占位、跨图传送、AOI、首包与断线重连。
- [ ] R-03 战斗、仇恨、技能、buff、怪物 AI、刷新掉落和 PvP 权限。
- [ ] R-04 建筑、房间、风水、灵气场、技艺 job、NPC、任务、自动化和 Actor。
- [ ] R-05 5000 玩家/10000 实例口径下的索引、队列、定时器、Worker、缓存和热路径分配。

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

## 已确认问题

### FS-001 密室拆除可越过远端活跃 lease 销毁实例

- **状态**：已修复并验证，待原子提交。
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
- **中文原子提交 hash**：待提交；下一功能组回填实际 hash。

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
