# 全面项目潜在问题扫描报告（2026-07-06）

> 本文档由本轮多并发 workflow 只读扫描结果整理而成。目标是尽可能覆盖潜在生产风险，但不声称绝对穷尽；后续修复前仍建议对对应调用链做二次复核和最小验证。

## 扫描范围

- `packages/server`：权威运行时、tick、地图实例、移动/占位、战斗、怪物 AI、持久化、GM、市场、邮件、兑换码、审计。
- `packages/shared`：协议、schema、共享类型、配置契约。
- `packages/client`：协议消费、socket 生命周期、地图运行时、UI 状态连续性、移动端与渲染成本。
- `packages/config-editor`：内容编辑、schema 对齐、导入/发布契约。
- `docs/mechanics`：core-loop、combat、growth、technique、economy、other 等机制文档。

## 执行摘要

- 本轮并发扫描共产出 **41** 条候选/确认问题。
- 严重级别分布：critical 2、high 20、medium 17、low 2、info 0。
- workflow 后续交叉验证阶段已产生 103 条投票结果，其中 71 条倾向成立；由于全量验证耗时过长，本文保留扫描阶段全部潜在问题，并用置信度字段区分。
- 高频分类：GM 操作/市场资产一致性 1 条、UI 状态连续性 / 焦点输入保护 1 条、catalog-contract 1 条、draft-compatibility 1 条、legacy-format-boundary 1 条、schema-drift 1 条、schema-validation 1 条、shared-contract 1 条、tick 热路径/AOI 同步 1 条、tick 热路径/怪物 AI 1 条。

## 问题总览表

| 编号 | 严重级别 | 分类 | 标题 | 置信度 | 主要位置 |
|---:|---|---|---|---|---|
| 1 | critical | 管理操作不可恢复 / 生产安全 | 数据库恢复允许在非维护态直接替换生产真源 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-contract.ts`:49 等 8 处 |
| 2 | critical | 经济/市场资产一致性 | 坊市普通挂单/撮合在玩家资产与市场真源之间存在崩溃窗口，可复制或丢失资产 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:155 等 20 处 |
| 3 | high | schema-validation | 配置文件原始编辑入口只校验 JSON 语法，绕过内容 schema 与启动期失败门禁 | confirmed | `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1046 等 9 处 |
| 4 | high | tick 热路径/AOI 同步 | 每 tick 玩家视野同步全量扫描同实例玩家 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:76 等 4 处 |
| 5 | high | tick 热路径/怪物 AI | 怪物目标解析对每只怪物重复全量扫描玩家 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6066 等 5 处 |
| 6 | high | 功法/传法/外部对象占用 | 藏经录入缺少 jobRunId 占用校验，同一藏经台可被多人并发录入并重复获得传法经验 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:410 等 9 处 |
| 7 | high | 地图渲染性能 / 高频 UI 更新 | 地图鼠标移动按事件频率重建目标叠加层，可能拖垮高频渲染并造成输入卡顿 | confirmed | `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:48 等 11 处 |
| 8 | high | 复生/位置一致性 | 复生迁移先断旧实例且未校验目标实例 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-respawn.service.ts`:128 等 4 处 |
| 9 | high | 市场交易/玩家资产持久化 | 坊市即时买卖 durable 结算被硬禁用，市场真源与玩家资产存在提交夹缝 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:758 等 8 处 |
| 10 | high | 恢复态不同步 / 首包语义 | 同图重拉首包把全量 worldDelta 当补丁合并，旧可见实体/地面物残留 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/network/world-projector.service.ts`:81 等 8 处 |
| 11 | high | 持久化测试清理缺陷 | durable-operation-smoke 的 active-job-complete 分支收尾漏清理 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:81 等 7 处 |
| 12 | high | 敏感信息泄露 / 审计安全 | GM 环境变量审计记录敏感值明文或可逆信息 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-environment.controller.ts`:50 等 7 处 |
| 13 | high | 服务端权威/实例租约 | 跨图传送绕过目标实例 attach/lease 门禁 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:35 等 4 处 |
| 14 | high | 玩家资产/兑换码持久化 | 兑换码先核销后发奖，崩溃会永久吞奖励 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md`:31 等 8 处 |
| 15 | high | 生产不友好默认值 / 密钥隔离 | GM 密钥管理主密钥默认复用玩家 Token 密钥 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/config/env-alias.ts`:147 等 6 处 |
| 16 | high | 移动端交互 / 协议消费入口 | 地图点击交互仅绑定鼠标事件，移动端触控无法可靠选目标或移动 | confirmed | `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:39 等 9 处 |
| 17 | high | 统一技艺队列/跨 tick 恢复 | 炼丹/锻造/强化完成时仍调用旧 startNextQueuedCraftJob，会丢弃统一队列中的采集/建造/挖矿/阵法/传法任务 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-craft-tick.service.ts`:173 等 12 处 |
| 18 | high | 缺少审计 / GM 操作追溯 | 大量高危 GM 写入口未直接落 gm_audit_log | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:809 等 11 处 |
| 19 | high | 缺少审计 / 运维破坏面 | 数据库备份、上传、恢复、清理入口缺少 GM 审计 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:133 等 9 处 |
| 20 | high | 跨图传送/状态恢复 | 传送失败路径会遗留玩家 in_transfer 状态 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:42 等 4 处 |
| 21 | high | 队列/玩家意图 | 待执行命令消费期间会吞掉 await 期间新提交的玩家意图 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts`:488 等 4 处 |
| 22 | high | 验证入口覆盖缺口 | 关键市场/邮件 smoke 已存在但未挂入默认门禁 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-suite.ts`:99 等 7 处 |
| 23 | medium | GM 操作/市场资产一致性 | GM 封禁与市场撤单跨真源非原子，崩溃会留下半封禁状态 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/economy/29-market.md`:80 等 7 处 |
| 24 | medium | UI 状态连续性 / 焦点输入保护 | 活动弹层状态回包会整块替换 body，破坏邀请链接输入焦点和选区 | confirmed | `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:78 等 13 处 |
| 25 | medium | catalog-contract | 配置编辑器 item catalog 输出字段少于 shared/client/server 物品契约 | confirmed | `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:250 等 18 处 |
| 26 | medium | draft-compatibility | AI 术法草稿/旧还原字段可被服务端内容加载直接展开，兼容边界未收敛到 GM 转换 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/growth/13-technique-skill.md`:181 等 13 处 |
| 27 | medium | legacy-format-boundary | 地图旧格式/分层格式转换仍在 shared normalizer 中，并被服务端运行时 fallback 读取 | confirmed | `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:622 等 8 处 |
| 28 | medium | schema-drift | 怪物编辑器可编辑的 statTendency 字段少于 shared 运行时倾向字段 | confirmed | `/home/yuohira/mud-mmo-next/packages/shared/src/monster.ts`:626 等 6 处 |
| 29 | medium | 交易/市场 UI 连续性 | 市场主弹层多处交互直接重开整窗，列表滚动、焦点和交易草稿会被打断 | confirmed | `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1388 等 12 处 |
| 30 | medium | 传送/位置权威 | 同实例传送命中 existing 玩家分支时会忽略目标坐标 | plausible | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:654 等 5 处 |
| 31 | medium | 兑换码 / 缺少审计 | 兑换码 GM 管理变更未记录审计，创建/销毁/删除缺少 actor 追踪 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md`:48 等 10 处 |
| 32 | medium | 协议审计盲区 | with-db 发布链路中的协议审计被强制降级为无库模式 | confirmed | `/home/yuohira/mud-mmo-next/scripts/release-with-db.js`:51 等 6 处 |
| 33 | medium | 地图/阵法持久化 | 阵法运行态刷盘 fire-and-forget，失败后缺少脏标记和恢复重试 | plausible | `/home/yuohira/mud-mmo-next/docs/mechanics/equipment-items/28-formation.md`:37 等 9 处 |
| 34 | medium | 地图渲染性能 / 长时间在线 | 地图每帧雾层遍历当前视口全部格子，视口和 DPR 增大时持续占用渲染预算 | confirmed | `/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:420 等 10 处 |
| 35 | medium | 增量同步 / 后置事件丢失 | 同步 worker 服务常驻导致空 envelope tick 跳过 quest/runtime/stat 后置下发 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/app.module.ts`:452 等 9 处 |
| 36 | medium | 审计脚本持久化污染风险 | run-protocol-audit 可写 persistent_documents 但只恢复 GM auth | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:19 等 7 处 |
| 37 | medium | 技艺 job 生命周期/建造经验 | 建造 start 未实现互斥入队，同一玩家可在其他技艺 job 运行时并行建造并获得建造经验 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts`:232 等 11 处 |
| 38 | medium | 权限模型过粗 / 危险接口无保护 | 单一 GM 角色可执行所有高危操作，缺少分级权限和二次确认 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md`:56 等 8 处 |
| 39 | medium | 离线收益/关闭恢复 | 离线收益累计刷盘失败被吞，最终关机可误判成功并释放租约 | confirmed | `/home/yuohira/mud-mmo-next/docs/mechanics/growth/15-offline-gain.md`:13 等 8 处 |
| 40 | low | shared-contract | 物品旧 ID alias 在服务端与客户端各自硬编码且集合不一致 | confirmed | `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:24 等 8 处 |
| 41 | low | 协议消费 / 聊天状态连续性 | 聊天会话按 playerId 持久化，跨地图/跨实例不会隔离附近和战斗日志 | plausible | `/home/yuohira/mud-mmo-next/packages/client/src/main-runtime-state-source.ts`:821 等 10 处 |

## 详细问题

### P01. 数据库恢复允许在非维护态直接替换生产真源

- **状态**：已修复（2026-07-06）：恢复入口强制维护态、灾备 scope、二次确认短语，并要求请求体 backupId 与 expectedChecksum/checksumSha256 精确匹配备份记录后再重算文件 checksum；恢复 start/complete 已写入 GM 审计。
- **严重级别**：critical
- **分类**：管理操作不可恢复 / 生产安全
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-contract.ts`:49; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-contract.ts`:60; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:177; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:517; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:543; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:574; `/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md`:48; `/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md`:58
- **证据**：NATIVE_GM_RESTORE_CONTRACT 定义 restoreMode='replace_server_persistence'，但 requiresMaintenance=false；HTTP 端点 POST database/restore 直接调用 triggerDatabaseRestore；triggerDatabaseRestore 只校验备份存在、DB 可用、格式和 checksum，然后进入 runDatabaseJob 并执行 restorePostgresCustomDump。GM 机制文档同时说明 database/restore 是 GM HTTP 端点，且权限等级是单一 GM 角色。
- **触发场景**：生产服 5000 并发在线时，任意已登录 GM 或被盗用的 GM token 可以在未切维护、未二次确认、未双人复核的情况下触发整库替换。虽然会创建 pre-import 备份并最终 SIGTERM，但恢复窗口内会先 flush/清 session/应用 dump，可能造成在线玩家位置、资产、交易、邮件、市场状态与运行态断层，且误操作的恢复路径本身仍依赖同一高危接口。
- **影响**：整服玩家资产、位置、战斗、交易、邮件、市场真源可被非维护态替换；这是长期在线生产环境中的最高风险运维入口。
- **建议修复方向**：把 requiresMaintenance 改为 true 并在 triggerDatabaseRestore 开始处强制校验维护态；增加二次确认字段（backupId + checksum + confirmation phrase）、可选双人复核/短期恢复令牌；恢复前记录 gm_audit_log，恢复中禁止新的玩家登录和写操作，失败时暴露明确回滚指引。

### P02. 坊市普通挂单/撮合在玩家资产与市场真源之间存在崩溃窗口，可复制或丢失资产

- **状态**：已修复（2026-07-06）：即时买入/卖出已恢复 DurableOperationService 主链（见 P09）；本轮新增通用 settleMarketMutation，普通挂售、求购、天道商店与 GM 封禁撤单在 durable 可用时把订单/成交/托管仓、玩家 inventory/wallet、水位、outbox 与审计收敛到同一事务；durable 启用但提交失败会回滚并拒绝成功返回。当前已通过本地市场专项 smoke，带 DB release 验证待数据库环境。
- **严重级别**：critical
- **分类**：经济/市场资产一致性
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:155; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:159; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:160; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:517; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:522; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:657; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:658; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:758; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:759; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:787; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:864; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:865; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:929; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:930; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:951; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:1022; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:1023; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3664; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3688; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3693
- **证据**：普通坊市写路径在运行态先扣玩家资产或发放资产：天道商店扣功德并发货、挂售拆分背包、求购扣货币、直接买入扣货币并发货、直接卖出拆分物品并入账；但 runExclusiveMarketMutation 先调用 marketPersistenceService.persistMutation 持久化订单/仓库/成交历史，再调用 flushAffectedPlayersAfterMutation 刷玩家分域。代码注释也说明玩家 inventory/wallet 仅标 dirty、之后才 flush。若进程在市场 mutation 已落库但玩家 flush 前崩溃，挂售/求购可变成“订单已托管但玩家资产仍在原快照”，成交可变成“订单已成交/删除但买卖双方资产未同步”。buyNow/sellNow 的 Durable 分支被硬编码关闭，无法覆盖该窗口。
- **触发场景**：玩家 A 挂售稀有装备：createSellOrder 在内存中 splitInventoryItemByInstanceId 移除装备并创建 open order；runExclusiveMarketMutation 先持久化 open order，随后才 flush 玩家。若服务在 persistMutation 成功后、flushPlayer 前崩溃，重启后市场订单仍持有该装备，玩家 A 的持久化背包也仍保留原装备，形成复制。求购/成交路径同理会造成预留灵石复制、买家/卖家收支丢失或订单状态与玩家资产半完成。
- **影响**：影响普通坊市、天道商店、立即买入/卖出、挂售/求购撮合等长期运营核心资产链路；在 5000 并发下任何崩溃、kill、节点迁移或 flush 失败窗口都可能产生不可审计的灵石/装备复制或丢失。
- **建议修复方向**：将普通坊市所有会同时改 market 真源与 player inventory/wallet 的路径收敛到 Durable Operation，或把市场订单/成交与玩家分域快照放入同一持久化事务/outbox；禁止 market persist 先于玩家资产持久化提交。至少移除 canUseDurableBuyNow/canUseDurableSellNow=false，并为 createSellOrder/createBuyOrder/天道商店补齐同等事务围栏与崩溃恢复测试。

### P03. 配置文件原始编辑入口只校验 JSON 语法，绕过内容 schema 与启动期失败门禁

- **状态**：已修复（2026-07-06）：raw JSON 保存已扩展到 monsters/items/techniques/technique-buffs/recipes/enhancements/formations/terrain/starter/quests/building-runtime 等路径级门禁，并拒绝 artsStrength/raw* 旧术法草稿字段；地图编辑保存统一序列化为 format:2，服务端地图运行时加载和怪物 fallback 均先执行 format:2 严格门禁，旧格式转换已归入显式迁移工具。
- **严重级别**：high
- **分类**：schema-validation
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1046; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1051; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1295; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1301; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:1193; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:38; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:43; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/technique-template.registry.ts`:53; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/technique-template.registry.ts`:58
- **证据**：配置编辑器的 PUT /api/config-file 最终调用 saveContentFile，saveContentFile 仅 JSON.parse 后格式化写回磁盘，没有按物品、功法、地图或掉落 schema 做领域校验；同一服务还会监听内容目录并触发重启。服务端 registry 加载时遇到非数组或 normalize 返回 null 只是 continue/跳过，并不会聚合错误或使启动失败。
- **触发场景**：运营人员通过配置文件页保存了语法合法但字段不符合内容契约的 items/techniques/monsters JSON；本地 API 自动重启主服后，ItemTemplateRegistry/TechniqueTemplateRegistry 静默跳过非法条目，玩家背包物品、功法书、怪物掉落或技能引用在长期在线环境中变成缺模板/缺掉落/缺技能，而发布过程没有明显失败信号。
- **影响**：影响玩家资产、怪物掉落、功法技能和内容发布可靠性；在 5000 并发长期在线场景中，静默跳过模板会把内容错误放大成线上资产解析失败或玩法缺失。
- **建议修复方向**：把原始 JSON 保存纳入统一内容发布/校验管线：按文件类别调用共享 schema 或对应 registry 的严格校验，保存前返回完整错误；服务端启动期对内容错误 fail-fast 或至少聚合为阻断级错误；raw 文件编辑仅作为草稿，不直接写入生产真源。

### P04. 每 tick 玩家视野同步全量扫描同实例玩家

- **严重级别**：high
- **分类**：tick 热路径/AOI 同步
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:76; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:87; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:2463; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:5595
- **证据**：flushConnectedPlayers 每 tick 遍历所有绑定玩家并调用 getPlayerView；buildPlayerView 内 collectVisiblePlayers 会对当前实例 playersById 全量循环，只靠半径过滤，没有玩家空间索引。任一实例内 P 名玩家同步时会形成 P 次全玩家扫描。
- **触发场景**：公共城镇或活动地图聚集 5000 玩家时，每秒同步阶段仅可见玩家收集就会产生约 5000×5000 次玩家距离/可见性检查，还叠加 FOV 与 envelope 构造，容易超出 1Hz tick budget 并拖慢全服 tick。
- **影响**：在 5000 并发口径下，同步阶段存在 O(P²) 放大，可能导致慢帧、跳帧、同步堆积和断线重拉首包压力。
- **建议修复方向**：为玩家位置建立按 tile/chunk 的 AOI 索引，按可见 tile/邻近 chunk 收集玩家；同时把 view cache 从全实例 worldRevision 改为局部 AOI revision，避免无关变化击穿所有玩家视图。
- **状态**：已修复（2026-07-06）：MapInstanceRuntime 维护玩家 tile 与 chunk 双索引，connect/relocate/move/disconnect/模板重定位路径同步更新；collectVisiblePlayers 改为按 shadowcasting 可见 tile 候选收集玩家，并保留索引计数异常时回退 playersById 全量扫描，确保断线、跨图和首包视图仍以权威实例状态为准。

### P05. 怪物目标解析对每只怪物重复全量扫描玩家

- **严重级别**：high
- **分类**：tick 热路径/怪物 AI
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6066; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6149; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6969; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6980; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:6983
- **证据**：advanceMonsters 每 tick 遍历所有存活怪物；resolveMonsterTarget 对每只怪物先全量扫描 playersById 判断 nearby，再做 collectVisibleTileIndices shadowcasting，随后再次全量扫描 playersById 加被动仇恨和筛目标。
- **触发场景**：一个实例内有大量怪物和玩家时，怪物 AI 目标解析变成 O(M×P) 加 M 次视野投射；5000 玩家或刷怪密集地图会把主动 AI 推进压成 tick 热点，影响战斗结算与同步。
- **影响**：怪物 AI 热路径会随玩家数和怪物数乘法增长，难以支撑多人同图和 10000 地图实例长期在线。
- **建议修复方向**：复用 playerIdsByTile 或新增 chunk AOI 索引，先按 aggro/leash 范围取候选玩家；对无候选怪物跳过 shadowcasting，并缓存/批量计算同区域可见玩家。
- **状态**：已修复（2026-07-06）：resolveMonsterTarget / idle hint 先按 chunk 候选做 aggro/leash 粗筛，无候选时只推进仇恨衰减并跳过 shadowcasting；存在候选后再按可见 tile 索引收集玩家、推进被动仇恨与最高仇恨选择，保持锁定目标、丢视野追击和索引异常 fallback 的正确性。

### P06. 藏经录入缺少 jobRunId 占用校验，同一藏经台可被多人并发录入并重复获得传法经验

- **状态**：已修复（2026-07-06）：藏经录入 start 已拒绝已有 scriptureRecordingJobRunId 的建筑，tick 继续推进时强制校验建筑占用 jobRunId 与当前 job 匹配，完成/取消路径释放占用，避免同一藏经台多 job 并发刷经验。
- **严重级别**：high
- **分类**：功法/传法/外部对象占用
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:410; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:414; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:516; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:723; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:727; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:745; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:750; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:761; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/transmission.strategy.ts`:772
- **证据**：scripture_recording start 校验只拒绝“已有不同功法”或“已完成录入”的建筑，未检查 scriptureRecordingJobRunId 是否已有活跃录入；createScriptureRecordingJob 会直接覆盖 building.scriptureRecordingJobRunId；executeScriptureRecordingTick 只检查 techniqueId 与 recordedAtTick，不校验当前 jobRunId 是否仍匹配建筑占用。随后每个并发 job 都会按同一个 building.scriptureProgress 继续推进，并给各自 recorder 发放 transmissionSkill 经验。
- **触发场景**：玩家 A 在藏经台录入某自创功法，建筑 scriptureRecordingJobRunId=A-job。玩家 B 在 A 未完成时对同一藏经台录入同一功法，由于 validate 只看到同 techId 且 recordedAtTick=0，会通过并覆盖为 B-job。A 的旧 job 后续 tick 不校验 jobRunId，仍会推进同一 building.scriptureProgress 并获得传法经验；B 也可推进并获经验，导致共享外部对象被多 job 并发占用、录入进度被加速、经验重复发放。
- **影响**：影响功法技能与建筑外部对象占用；玩家可通过多人同时录入同一藏经台绕过单 job 生命周期和施工/录入占用语义，加速产出并批量刷传法技艺经验。
- **建议修复方向**：在 validateScriptureRecordingStart 中拒绝 scriptureRecordingJobRunId 非空且未完成的建筑；在 executeScriptureRecordingTick 中强制要求 building.scriptureRecordingJobRunId === job.jobRunId，否则阻塞或取消当前 job；取消/完成/异常恢复路径统一释放该占用，并补充多人并发录入 smoke。

### P07. 地图鼠标移动按事件频率重建目标叠加层，可能拖垮高频渲染并造成输入卡顿

- **状态**：已修复（2026-07-06）：地图 hover 已合并到 rAF，并按格子/实体/可走/可见签名去重，避免同格高频移动重复触发完整 targeting 更新。
- **严重级别**：high
- **分类**：地图渲染性能 / 高频 UI 更新
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:48; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:91; `/home/yuohira/mud-mmo-next/packages/client/src/main-map-interaction-bindings.ts`:504; `/home/yuohira/mud-mmo-next/packages/client/src/main-map-interaction-bindings.ts`:519; `/home/yuohira/mud-mmo-next/packages/client/src/main-targeting-state-source.ts`:592; `/home/yuohira/mud-mmo-next/packages/client/src/main-targeting-state-source.ts`:604; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:285; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:407; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:456; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:2069; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:2112
- **证据**：InteractionController 在 canvas 上直接监听 mousemove，并每次移动都调用 onHover；onHover 会更新 hoveredMapTile、setPendingTargetedActionHover 并立即 syncTargetingOverlay。syncTargetingOverlay 每次 hover 都 computeAffectedCells，并把 overlay 写入 MapRuntime；MapRuntime 只合并到下一帧，但每帧 flush 时会重建 scene。Pixi targeting 层签名包含 hoverX/hoverY 和 visibleTileRevision，并在 rebuildTargetingLayer 中按 origin ± range 双层循环绘制。
- **触发场景**：玩家在战斗/采集/建造选目标时移动鼠标或触控板，mousemove 频率可远高于服务端 1Hz tick。每个 hover 格变化都会触发 affectedCells 计算和 Pixi 目标范围重绘；若技能范围较大或 5000 并发下客户端同屏实体/地图叠加层复杂，用户会感知到地图卡顿、点击延迟、移动端掉帧，进而影响战斗施法、挖矿/建筑放置等关键操作连续性。
- **影响**：高频输入链路把本应局部、节流的 hover 反馈放大为渲染层重建；在商业 MMO 长时间在线和复杂地图场景下容易造成 UI 卡顿、误点、选目标体验断裂。
- **建议修复方向**：将 hover 同步节流到 rAF 或仅在格子坐标变化时触发；对大范围技能缓存 geometry/affectedCells，hover 只更新高亮目标；移动端改用 pointer/touch 统一事件并避免连续 pointermove 触发完整 targeting 重算。

### P08. 复生迁移先断旧实例且未校验目标实例

- **状态**：已修复（2026-07-06）：复生路径已在目标实例 attach/lease readiness 校验通过后再挂接，失败会保留待复生状态；本轮同步复核传送迁移顺序与 rollback smoke。
- **严重级别**：high
- **分类**：复生/位置一致性
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-respawn.service.ts`:128; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-respawn.service.ts`:135; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-respawn.service.ts`:143; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-player-session.service.ts`:181
- **证据**：respawnPlayer 解析 targetInstance 后，如果存在 previous，会先 previousInstance.disconnectPlayer，再 targetInstance.connectPlayer；该路径没有像会话接入一样检查目标实例 attach readiness，也没有在 connect 失败时恢复 previous 占位/位置。
- **触发场景**：玩家死亡后绑定复生点所在实例已 fenced、非本节点可写、被销毁或 connectPlayer 因无可用出生点抛错时，旧实例占位已被清除，而 playerLocation 尚未成功切到新实例，客户端和恢复链会看到玩家位置/占位不一致。
- **影响**：死亡/复生是高频生产恢复路径，失败会留下幽灵 location、丢失占位或把玩家接入不可写实例。
- **建议修复方向**：复生前先校验 target readiness；连接新实例成功并完成位置表更新后再断开旧实例，或使用两阶段迁移和失败回滚。

### P09. 坊市即时买卖 durable 结算被硬禁用，市场真源与玩家资产存在提交夹缝

- **状态**：已修复（2026-07-06）：buyNow/sellNow 的 canUseDurableBuyNow/canUseDurableSellNow 已改为跟随 DurableOperationService.isEnabled()，可用时走 settleMarketBuyNow/settleMarketSellNow，把买卖双方资产、水位、outbox 与审计收敛到 durable 事务；无 durable 环境仅保留本地验证 fallback。
- **严重级别**：high
- **分类**：市场交易/玩家资产持久化
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:758; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:929; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3663; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3688; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3693; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/market/market-runtime.service.ts`:3733; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/durable-operation.service.ts`:1599; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/durable-operation.service.ts`:1807
- **证据**：buyNow 和 sellNow 中 canUseDurableBuyNow / canUseDurableSellNow 被硬编码为 false，导致已实现的 DurableOperationService.settleMarketSellNow / settleMarketBuyNow 路径永远不走。市场 mutation 会先 persistMutation 提交订单、仓库和成交历史，再调用 flushAffectedPlayersAfterMutation 刷玩家 inventory/wallet；单玩家 flush 失败只记录日志，不回滚已提交的市场事务。
- **触发场景**：买家/卖家成交后，server_market_order / trade_history 已提交，但买卖双方玩家资产还只是运行态 dirty；如果 flush 失败后进程崩溃，重启会恢复已成交的市场状态，但玩家背包/灵石从旧分域表恢复，产生物品/灵石复制、丢失或成交历史与资产不一致。
- **影响**：直接影响普通坊市和拍卖一口价/即时成交等高价值交易路径；在 5000 并发下属于高概率长期在线夹缝，且审计记录与玩家真实资产可能对不上。
- **建议修复方向**：启用并补齐 settleMarketBuyNow/settleMarketSellNow，把订单状态、成交历史、买卖双方 inventory/wallet、水位和审计放入同一 durable transaction；至少应在玩家资产 flush 失败时让 mutation 返回失败并保留可恢复 operation/outbox，而不是提交市场真源后继续成功返回。

### P10. 同图重拉首包把全量 worldDelta 当补丁合并，旧可见实体/地面物残留

- **状态**：已修复（2026-07-06）：服务端初始 full worldDelta 增加 full/reset 标记，客户端收到 full/reset 时会在应用本帧前清空动态实体、地面物与威胁箭头，避免同图后台恢复或断线重拉首包后残留旧 AOI 对象。
- **严重级别**：high
- **分类**：恢复态不同步 / 首包语义
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/network/world-projector.service.ts`:81; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-projector.service.ts`:95; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:45; `/home/yuohira/mud-mmo-next/packages/client/src/main-runtime-state-source.ts`:821; `/home/yuohira/mud-mmo-next/packages/client/src/main-runtime-state-source.ts`:862; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/store/map-store.ts`:701; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/store/map-store.ts`:715; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/store/map-store.ts`:1153
- **证据**：服务端 createInitialEnvelope 明确构造“全量初始 envelope”，并把 buildFullWorldDeltaFromState 放进 worldDelta；emitInitialSync 先发送该 envelope，再发送 aux initial。客户端 handleBootstrap 对同一玩家同一地图的 bootstrap 判定为 isRuntimeSameMapBootstrap 后跳过 applyBootstrapToMapRuntime，不重置地图运行态。随后 MapStore.applyWorldDelta 只有 preloadingDifferentMap 或 instanceChanged 且有实体 patch 时才清空 entities/ground/threat/path；mergeTickEntities 又从 this.entities 复制旧实体，并只删除 removedEntityIds 中的 ID。初始 full worldDelta 没有 full/reset 标记和缺席实体删除列表，因此同图后台/前台重拉或断线重连后，服务端当前全量视野里不存在的旧玩家、怪物、NPC、容器、地面物等会继续留在客户端。
- **触发场景**：玩家在某地图看到怪物 A、地面物 B 或其他玩家 C 后页面进入后台，服务端期间这些对象离开视野、死亡、被拾取或跨图。回到前台后客户端复用本地 PlayerState，服务端下发同 map 首包和 full worldDelta。客户端因同图 bootstrap 不 reset，并把 full worldDelta 当增量 patch 合并，A/B/C 不会被 removedEntityIds 删除，继续显示或参与点击命中，直到后续恰好收到显式 remove、切图或刷新。
- **影响**：长期在线和移动端后台恢复会出现幽灵实体、幽灵掉落、错误观察/攻击/拾取入口，影响战斗目标选择、掉落交互和 AOI 可信度；5000 并发下这类静默不同步会放大为大量无效操作与排查困难。
- **建议修复方向**：为初始/恢复 full worldDelta 增加明确 full/reset 语义，客户端收到后先清空动态集合再应用；或在 InitSession/MapEnter 后的首个 SyncEnvelope 上强制按全量快照替换 entities、groundPiles、containers、threatArrows。保留同图 bootstrap 优化时，也必须单独 reset 动态 AOI 集合，并补充“同图后台恢复后旧实体/地面物消失”的端到端 smoke。

### P11. durable-operation-smoke 的 active-job-complete 分支收尾漏清理

- **状态**：已修复（2026-07-06）：durable-operation-smoke finally 已补清理 activeJobCompletePlayerId 与 leasedActiveJobCompleteInstanceId，避免 active-job-complete 用例残留玩家和实例目录。
- **严重级别**：high
- **分类**：持久化测试清理缺陷
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:81; `/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:104; `/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:287; `/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:3253; `/home/yuohira/mud-mmo-next/packages/server/src/tools/durable-operation-smoke.ts`:3279; `/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-player-cleanup.ts`:59; `/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-player-cleanup.ts`:71
- **证据**：durable-operation-smoke 定义并实际覆盖 activeJobCompletePlayerId / leasedActiveJobCompleteInstanceId，启动前会清理 activeJobCompletePlayerId，但 finally 收尾清理列表只清理到 activeJobPlayerId，未清理 activeJobCompletePlayerId，也未把 leasedActiveJobCompleteInstanceId 纳入 cleanupInstanceCatalog。默认 smoke-player-cleanup 的 player/账号 LIKE 模式也不覆盖 player:durable-active-job-complete:* 这种 ID。
- **触发场景**：在带数据库环境运行 durable-operation-smoke 或 verify:release:with-db 后，active-job-complete 用例产生的 player_active_job、durable_operation_log、asset_audit_log、outbox_event、instance_catalog 等行可能留在共享测试库；后续验证会受到残留作业、lease 或审计行干扰，生产影子库误用时还会污染运营数据。
- **影响**：with-db 验证会遗留强事务与技艺作业相关持久化对象，破坏测试幂等性，并可能在长期共享验证库中积累脏数据。
- **建议修复方向**：在 durable-operation-smoke 的 finally 中补充 cleanupPlayer(pool, activeJobCompletePlayerId) 与 cleanupInstanceCatalog(pool, [leasedActiveJobCompleteInstanceId])；同时把 smoke-player-cleanup 的默认 player/account 模式覆盖到 player:durable-active-job-complete:* 或改为集中登记本次生成的全部 playerId/instanceId 后统一清理。

### P12. GM 环境变量审计记录敏感值明文或可逆信息

- **状态**：已修复（2026-07-06）：环境变量审计改为记录 key/source/persistent/restartRequired/sensitive/valueLength 等摘要，不再落库明文或掩码值。
- **严重级别**：high
- **分类**：敏感信息泄露 / 审计安全
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-environment.controller.ts`:50; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-environment.controller.ts`:56; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-env-registry.ts`:43; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-env-registry.ts`:45; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-env-registry.ts`:77; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-env-management.service.ts`:139; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/gm-audit-log-persistence.service.ts`:167
- **证据**：NativeGmEnvironmentController.set 调 runtimeEnvManagementService.set 后，把 after 记录为 { value: item.value, source, persistent, persist }。buildItem 对 sensitive key 返回 maskSensitiveValue(currentValue)，格式包含长度；注册表中 SERVER_DATABASE_URL、DATABASE_URL、SERVER_GM_AUTH_SECRET、SERVER_REGISTRATION_ACTIVATION_CODES 等被标记 sensitive。gm_audit_log 持久化会把 after JSONB 原样写入 after_jsonb。
- **触发场景**：GM 修改 SERVER_DATABASE_URL、SERVER_GM_AUTH_SECRET、注册激活码等敏感环境变量时，审计表长期保存 value 字段。即使当前 item.value 是掩码，也会泄露 secret 是否存在和精确长度；如果未来 buildItem 或某个未标记敏感项返回明文，审计表会直接持久化明文。拥有审计查询权限或数据库只读权限的人可从 gm_audit_log 获取敏感配置信息。
- **影响**：审计表从追溯通道变成敏感信息扩散面，影响数据库连接串、GM token 密钥、激活码等生产凭据安全。
- **建议修复方向**：环境变量 set/delete 审计禁止记录 value；改为记录 key、source、persistent、restartRequired、sensitive、valueLength 或 hashPrefix（不可逆且带服务端盐）等摘要。对所有 includes PASSWORD/SECRET/TOKEN/_KEY 或 descriptor.sensitive 的 key 强制 after.value='[redacted]'，并补充回归测试。

### P13. 跨图传送绕过目标实例 attach/lease 门禁

- **状态**：已修复（2026-07-06）：跨图传送在 connectPlayer 前统一执行目标实例 attach readiness / lease 检查，拒绝 fenced、degraded、template missing、stopped、destroyed、非本地可写等目标。
- **严重级别**：high
- **分类**：服务端权威/实例租约
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:35; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:64; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:79; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-player-session.service.ts`:181
- **证据**：普通会话接入会调用 instanceReadyForPlayerAttach 并拒绝 fenced、lease_degraded、lease_not_local 等目标；跨图传送只检查 source 租约，随后解析 target 并直接 target.connectPlayer，没有对 target 做同等 attach/lease readiness 校验。
- **触发场景**：传送门 targetInstanceId 指向已 fenced、lease_degraded 或不属于本节点的宗门/副本实例时，当前节点仍可能把玩家写入目标实例运行态，造成多节点权威冲突或位置表与实例占位不一致。
- **影响**：破坏单实例权威与租约边界，可能导致跨图玩家被写入不可写实例、双实例残留或恢复链无法判定真源。
- **建议修复方向**：把 instanceReadyForPlayerAttach/resolveInstanceAttachReady 抽成通用目标实例门禁，传送、复生、GM 迁移等所有非登录接入路径在 connectPlayer 前统一调用。

### P14. 兑换码先核销后发奖，崩溃会永久吞奖励

- **状态**：已修复（2026-07-06）：兑换码持久化从“发奖前直接 used”改为 claimCodeForUse 抢占 pending + operationId，奖励 inventory/wallet durable 成功后再 finalizeCodeUse 转 used；durable 失败时不发 notice、不回退 active，保留 pending 供同 operationId 幂等补偿。
- **严重级别**：high
- **分类**：玩家资产/兑换码持久化
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md`:31; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:375; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:395; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:398; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:427; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/redeem-code-persistence.service.ts`:396; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/redeem-code-persistence.service.ts`:416; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/redeem-code-persistence.service.ts`:445
- **证据**：机制文档要求兑换流程先发放奖励再标记 used；实际 redeemCodes 在发奖前先调用 claimCodeForUseBeforeRewards，随后才分别 grantInventoryRewards / grantWalletReward，最后再 persist 运行态文档。claimCodeForUseBeforeRewards 内部在独立 DB 事务中把 server_redeem_code.status 从 active 更新为 used 并 COMMIT，和后续 durable 发奖事务不是同一个事务。
- **触发场景**：玩家兑换有效码后，进程在 redeem-code 行已提交 used、但 inventory/wallet durable 发奖尚未提交前崩溃；重启后兑换码已不可再用，玩家没有收到奖励。混合奖励时也可能出现部分奖励已发、后续奖励失败而兑换码已用的半完成状态。
- **影响**：直接影响玩家资产和运营兑换活动，造成不可自助恢复的奖励丢失；批量兑换或活动高峰时会放大客服补偿和审计成本。
- **建议修复方向**：把兑换码状态变更、奖励发放、资产审计/outbox 合并进同一个 durable operation；或引入 pending_claim 状态和可恢复 outbox，让重启后按 operationId 幂等补发，确认全部奖励提交后再转 used。

### P15. GM 密钥管理主密钥默认复用玩家 Token 密钥

- **状态**：已修复（2026-07-06）：生产/非开发环境不再回退复用玩家 Token 密钥，密钥管理主密钥缺失时模块不可用；仅 development/dev/local/test 允许本地回退并告警。
- **严重级别**：high
- **分类**：生产不友好默认值 / 密钥隔离
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/config/env-alias.ts`:147; `/home/yuohira/mud-mmo-next/packages/server/src/config/env-alias.ts`:160; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-secret-store.service.ts`:9; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-secret-store.service.ts`:61; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-secret-store.service.ts`:67; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-secret-store.service.ts`:70
- **证据**：env-alias 注释和实现说明 SERVER_SECRET_ENCRYPTION_KEY 未显式配置时复用玩家 Token 签名密钥；NativeGmSecretStoreService 文件注释也说明未配置时复用玩家 Token 签名密钥，onModuleInit 中只 warn，不拒绝启动，并用 scryptSync(masterKey, 'gm-secret-store-salt', 32) 派生 AES-256-GCM 主密钥。
- **触发场景**：生产环境只配置 SERVER_PLAYER_TOKEN_SECRET 而未配置 SERVER_SECRET_ENCRYPTION_KEY 时，玩家 token 签名密钥同时承担 GM 密钥库加密主密钥职责。任何一次玩家 token 密钥轮换都会导致历史 GM secrets 无法解密；反过来，一旦 token secret 泄露，攻击者可离线解密 server_gm_secrets 中所有密钥。
- **影响**：密钥职责未隔离，扩大单点泄露影响面，并让正常 token 轮换具备破坏 GM 密钥库可用性的副作用。
- **建议修复方向**：生产/非开发环境必须显式配置 SERVER_SECRET_ENCRYPTION_KEY，未配置直接禁用密钥管理写入或启动失败；仅 development/local/test 允许复用并保留 warn。引入 key version 字段与轮换迁移流程，避免未来主密钥轮换造成不可恢复。

### P16. 地图点击交互仅绑定鼠标事件，移动端触控无法可靠选目标或移动

- **状态**：已修复（2026-07-06）：InteractionController 已迁移到 pointerdown/pointermove/pointerleave/pointercancel，并设置/恢复 touch-action，统一鼠标、触控与触控笔入口。
- **严重级别**：high
- **分类**：移动端交互 / 协议消费入口
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:39; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:48; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:49; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:50; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:80; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/interaction/interaction-controller.ts`:91; `/home/yuohira/mud-mmo-next/packages/client/src/main-map-interaction-bindings.ts`:386; `/home/yuohira/mud-mmo-next/packages/client/src/main-map-interaction-bindings.ts`:470; `/home/yuohira/mud-mmo-next/packages/client/src/main-map-interaction-bindings.ts`:502
- **证据**：地图交互控制器注释和实现均为鼠标事件：attach 只 addEventListener('click'/'mousemove'/'mouseleave')，handleClick 类型为 MouseEvent，handleMove 类型为 MouseEvent。主绑定把 onTarget 用于打怪、NPC、传送、可达性校验和 planPathTo，因此移动和战斗入口依赖这些鼠标事件。
- **触发场景**：手机端响应式布局已启用，但地图 canvas 没有 pointerdown/touchstart/touchmove/touchcancel 入口。移动浏览器对 click 合成存在延迟、滚动/缩放竞争和 hover 缺失，玩家可能无法稳定点怪、选施法目标、点击 NPC/传送门或规划移动路径；这会直接影响位置、战斗、任务和交易相关 NPC 商店入口。
- **影响**：移动端核心操作不连续，尤其在战斗和移动链路上会表现为点击无响应、延迟触发或无法显示 hover/感气提示。
- **建议修复方向**：将地图输入统一迁移到 Pointer Events：pointerdown/pointermove/pointerleave/pointercancel，设置合适 touch-action，并区分点击、拖拽、长按/悬浮提示；保留鼠标兼容但不要只依赖 MouseEvent。

### P17. 炼丹/锻造/强化完成时仍调用旧 startNextQueuedCraftJob，会丢弃统一队列中的采集/建造/挖矿/阵法/传法任务

- **状态**：已修复（2026-07-06）：炼丹/锻造 completeAlchemyLikeJob 与强化完成路径不再直接消费统一队列；旧 startNextQueuedCraftJob 保留为空兼容实现，队列统一交给 WorldRuntimeCraftTickService 在所有 active job 清空后通过 TechniqueActivityQueueService.tickQueue 推进，避免 shift 丢弃非炼制类任务。
- **严重级别**：high
- **分类**：统一技艺队列/跨 tick 恢复
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-craft-tick.service.ts`:173; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-craft-tick.service.ts`:179; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:881; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:885; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/enhancement-tick.helpers.ts`:140; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/enhancement-tick.helpers.ts`:142; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1223; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1226; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1234; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1240; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1256; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/craft-panel-runtime.service.ts`:1273
- **证据**：条件型技艺 sleepPayload 会被 WorldRuntimeCraftTickService 写入统一 TechniqueActivityQueueService，允许 gather/building/formation/mining 进入 sleeping 队列；但炼丹/锻造完成调用 completeAlchemyLikeJob，强化完成调用 startNextQueuedCraftJob，而该函数先 queue.shift()，只识别 enhancement/alchemy/forging，其他 kind 生成“未知制造任务暂未接入运行时”。如果队列被 shift 后 result 不成功，队列项已经丢失，且 queue 为空时直接返回 skipped。
- **触发场景**：玩家有一个 sleeping gather 或 building 任务排在队列头，同时炼丹 job 在本 tick 完成。completeAlchemyLikeJob 立即调用 startNextQueuedCraftJob；该函数 shift 掉 gather/building 队列项，因为不在 enhancement/alchemy/forging 三类中而返回 skipped。后续 WorldRuntimeCraftTickService 的通用 queueService.tickQueue 已经没有机会恢复该 sleeping job，玩家的可恢复跨 tick 技艺任务被静默删除。
- **影响**：影响统一技艺 job 生命周期和取消/中断恢复；会导致条件型技艺任务在其他制作完成时丢失，外部对象占用释放/恢复、进度可见性和玩家操作连续性不可靠。
- **建议修复方向**：删除炼丹/锻造/强化完成路径中的旧 startNextQueuedCraftJob，统一交给 WorldRuntimeCraftTickService 的 TechniqueActivityQueueService.tickQueue 启动所有 RuntimeTechniqueActivityKind；或扩展 startNextQueuedCraftJob 使用 pipeline.start 支持全部 kind，且失败时不要 shift 丢弃 sleeping/pending 项，需按 shouldCancel/重试语义处理。

### P18. 大量高危 GM 写入口未直接落 gm_audit_log

- **状态**：已修复（2026-07-06）：GM 主控制器写入口已通过统一审计封装覆盖邮件、世界实例/运行态、兑换码、重启等本组高危路径；本轮补齐 NativeGmAdminController 的 scheduler pause/resume/enable/disable/trigger/drain 写入口审计，扫描范围内高危 GM 写路由已闭环到统一审计口径。
- **严重级别**：high
- **分类**：缺少审计 / GM 操作追溯
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:809; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:834; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:853; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:901; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1018; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1040; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1086; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1180; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/gm-audit-log-persistence.service.ts`:4; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-secret.controller.ts`:13; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-environment.controller.ts`:36
- **证据**：gm_audit_log 服务注释明确目标是覆盖 GM 直改玩家资产/进度/邮件/兑换码/实例运行时等所有写操作；但 rg 结果显示 recordEntry 只在 secret、environment、ai-provider、player service、diagnostics 等少数路径使用。GM 主控制器里 bots/spawn、return-all-to-default-spawn、migrate-recovery-pills、cleanup-abnormal-temporary-tiles、mail/broadcast、redeem-code-groups 创建/追加/删除、server/restart 等写入口未传入 request actor，也未在控制器内调用审计服务。相对地 secret/environment 控制器有显式审计实现，说明项目已有审计模式但未覆盖这些入口。
- **触发场景**：GM 或被盗 token 执行广播邮件补偿、批量迁移玩家物品、生成兑换码、清理世界临时地块、重启服务等操作后，数据库审计表中没有统一的 actor/tokenRev/ip/userAgent/before/after 记录。线上出现资产异常、地图异常或误发邮件时，无法从 gm_audit_log 还原责任人、来源 IP、操作参数和影响范围。
- **影响**：影响玩家资产、邮件、兑换码、世界运行态和服务可用性的管理操作缺少可信审计，削弱事故追责、回滚依据和合规能力。
- **建议修复方向**：为所有 GM 写路由统一接入审计拦截器或薄封装，至少记录 op、targetType、targetId、actor、输入摘要、影响数量、成功/失败和错误信息；批量任务记录 batchId，并由 worker 分页记录执行进度。优先覆盖邮件广播、兑换码管理、数据库备份/恢复/清理、服务器重启、实例冻结/迁移/重建、批量玩家迁移/补偿/清理。

### P19. 数据库备份、上传、恢复、清理入口缺少 GM 审计

- **状态**：已修复（2026-07-06）：backup/upload/download/restore/cleanup 均接入 actor 与 gm.database.* 审计，记录 backupId、fileName、checksum、target、jobId、成功/失败和错误摘要。
- **严重级别**：high
- **分类**：缺少审计 / 运维破坏面
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:133; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:139; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:177; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:189; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:373; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:430; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:517; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.service.ts`:1350; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/gm-audit-log-persistence.service.ts`:118
- **证据**：NativeGmAdminController 的 database/backup、database/upload、database/restore、database/cleanup 路由没有 @Req()，也没有 extractGmActor 或 GmAuditLogPersistenceService 注入；对应 service 只维护 job state/logs/backup metadata，并未调用 gmAuditLogPersistenceService.recordEntry。审计服务设计说明 recordEntry 是 GM 操作审计入口且失败不阻断主操作。
- **触发场景**：管理员下载/上传备份、恢复整库或清理表数据后，只能从任务状态或文件元数据看到动作结果，不能可靠追踪操作 actor、来源 IP、tokenRev 和请求参数。若误上传恶意 dump、误清理 outbox/asset audit 或误恢复旧备份，后续排查无法从统一审计表确认发起人和操作上下文。
- **影响**：涉及全库真源和运营数据保留的最高危入口缺少不可抵赖审计，事故响应和合规审计风险高。
- **建议修复方向**：AdminController 注入 GmAuditLogPersistenceService，所有数据库写路由接收 @Req() 并记录审计。backup/upload/restore/cleanup 至少记录 backupId、fileName、checksum、target/mode/olderThanDays、jobId、success/error；download 也建议记录访问审计，因为备份文件可能包含全量玩家资产与账号数据。

### P20. 传送失败路径会遗留玩家 in_transfer 状态

- **状态**：已修复（2026-07-06）：传送 beginTransfer 延后到目标校验后，connect/location/sync/navigation 统一纳入 try/catch/finally；失败恢复 runtime placement、源实例挂接与位置索引，finally 清理 in_transfer。
- **严重级别**：high
- **分类**：跨图传送/状态恢复
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:42; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:65; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:78; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/player/player-runtime.service.ts`:5443
- **证据**：applyTransfer 在拿到 runtimePlayer 后立即调用 beginTransfer；beginTransfer 会把玩家置为 transferState='in_transfer' 并设置超时。可覆盖异常的 try/catch 只包住 target.connectPlayer，target 解析/创建以及后续 setPlayerLocation、getPlayerViewOrThrow、syncFromWorldView、handleTransfer 任一抛错都不会执行 completeTransfer。
- **触发场景**：运行时传送点指向缺失地图、ensureSectRuntimeInstanceById/getOrCreateDefaultLineInstance 抛错，或目标 connect 后同步视图失败时，玩家会长期停留在 in_transfer 状态，通知被缓冲、写入语义异常，直到超时回滚才可能恢复。
- **影响**：跨图失败会污染玩家 presence/transfer 状态，影响断线恢复、通知投递和后续资产/位置写入。
- **建议修复方向**：在完成目标实例 readiness 校验后再 beginTransfer，或用覆盖 target 解析、连接、断开源实例、位置同步、导航收尾的 try/catch/finally，任何失败都 completeTransfer/显式 rollback 并保持源实例状态一致。

### P21. 待执行命令消费期间会吞掉 await 期间新提交的玩家意图

- **状态**：已修复（2026-07-06）：pending command 消费改为 snapshot + generation 校验，只删除本轮已消费的 command identity；await 期间新提交的同玩家命令保留到下一轮。
- **严重级别**：high
- **分类**：队列/玩家意图
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts`:488; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts`:535; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts`:543; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/command/world-runtime-pending-command.service.ts`:604
- **证据**：dispatchPendingCommands 直接迭代 this.pendingCommands 这个 live Map，并在循环体内 await dispatchCommand；enqueuePendingCommand 会直接 set 同一个 Map；循环结束后无条件 clear。若 await 期间同一玩家提交新命令，该 key 已被迭代过，新命令不会再被处理，随后被 clear 删除。
- **触发场景**：玩家在一个异步技能/物品/交易命令处理期间快速发送移动或下一次攻击，同 playerId 的 pendingCommands 被覆盖为新命令，但当前 Map iterator 不会回到已访问 key，最终 this.pendingCommands.clear() 把玩家最后一次意图吞掉。
- **影响**：破坏“同类可覆盖意图以最后一次为准”的 tick 队列语义，表现为操作丢失、自动战斗/移动卡顿，且难以复现。
- **建议修复方向**：每帧消费前 snapshot 当前 Map 并只删除已消费的 command identity；await 期间新写入的同 playerId 命令保留到下一帧，或使用 generation/version 防止 final clear 清掉新命令。

### P22. 关键市场/邮件 smoke 已存在但未挂入默认门禁

- **状态**：已修复（2026-07-06）：market-runtime-buy-now/sell-now/cancel-order、market-result-affected-player-sync、market-heavenly-dao-shop 与 mail-wallet-attachment 已注册进 smoke suite、领域分组和可并行 standalone 集合。
- **严重级别**：high
- **分类**：验证入口覆盖缺口
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-suite.ts`:99; `/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-suite.ts`:123; `/home/yuohira/mud-mmo-next/packages/server/src/tools/smoke-suite.ts`:717; `/home/yuohira/mud-mmo-next/packages/server/src/tools/market-runtime-buy-now-smoke.ts`:199; `/home/yuohira/mud-mmo-next/packages/server/src/tools/market-runtime-sell-now-smoke.ts`:150; `/home/yuohira/mud-mmo-next/packages/server/src/tools/market-heavenly-dao-shop-smoke.ts`:152; `/home/yuohira/mud-mmo-next/packages/server/package.json`:59
- **证据**：stable smoke suite 的可运行用例由 smokeCases/SMOKE_CASE_GROUPS 决定，并通过 resolveSelectedCases 只从该列表解析；列表中市场相关默认只挂了 fractional-buy-order-cancel、ban-cancel、native ban 等少数用例，而 market-runtime-buy-now、market-runtime-sell-now、market-heavenly-dao-shop 等关键脚本包含真实断言但未进入 suite 或 package 脚本。扫描结果确认 320 个 server *-smoke.ts 中有 171 个既未注册到 suite 也未被 package scripts 引用。
- **触发场景**：修改坊市即时买入、即时卖出或天道商店结算后，开发者运行 pnpm verify:quick、pnpm verify:release:with-db 或默认 smoke:all 均不会执行这些已有回归脚本；买卖双方钱包/背包、拍卖与普通坊市隔离、功德折扣等生产资产链路可能回归但门禁仍绿。
- **影响**：高风险资产交易链路存在“已有 smoke 但门禁不跑”的假阴性，长期在线服可能在市场撮合、资产发放或功德商店折扣回归时无法被 release gate 拦截。
- **建议修复方向**：把 market-runtime-buy-now、market-runtime-sell-now、market-runtime-cancel-order、market-result-affected-player-sync、market-heavenly-dao-shop、mail-wallet-attachment 等已有关键脚本注册进 smoke-suite 的对应 domain group，并在 release-gate 合约中校验关键脚本不可脱钩；对仍需手动运行的报告型脚本显式标注非门禁。

### P23. GM 封禁与市场撤单跨真源非原子，崩溃会留下半封禁状态

- **状态**：已修复（2026-07-06）：banManagedPlayerAccount 现在把封禁状态作为 market_ban_cancel_orders 的 banUser 输入交给 DurableOperationService；durable 可用时撤单、冻结资产返还与 auth bannedAt 同一事务提交，成功后仅替换内存 auth；durable 不可用时保留先撤单后 saveUser 的安全 fallback，撤单失败不写入封禁真源。
- **严重级别**：medium
- **分类**：GM 操作/市场资产一致性
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/economy/29-market.md`:80; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-managed-account.service.ts`:320; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-managed-account.service.ts`:330; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-managed-account.service.ts`:332; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-managed-account.service.ts`:334; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-managed-account.service.ts`:427; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-player-auth-store.service.ts`:681
- **证据**：市场机制文档要求封禁账号时自动取消开放订单，撤单失败时封禁失败并尝试回滚。实际 banManagedPlayerAccount 先 authStore.saveUser 持久化 bannedAt，再调用 cancelOpenOrdersForBannedPlayer；只有 catch 到撤单异常后才用第二次 saveUser 回滚，二者之间没有事务或 durable operation 边界。
- **触发场景**：GM 发起封禁后，账号表已写入 bannedAt，但进程在调用市场撤单前或撤单过程中崩溃；重启后账号保持封禁，普通求购/挂售/寄拍和冻结资产仍按旧状态存在。若撤单失败后的回滚 saveUser 也失败，也会留下账号状态与市场资产状态不一致。
- **影响**：影响 GM 风控、封禁资产处置和玩家交易资产返还；会导致被封账号仍有开放市场风险，或 GM 面板显示与市场真实状态冲突。
- **建议修复方向**：将封禁状态变更和市场撤单资产返还收敛为一个可恢复 durable operation；至少在账号表保存前先冻结/撤单并写入操作日志，使用 pending_ban 状态和恢复任务处理 crash 后的未完成封禁。

### P24. 活动弹层状态回包会整块替换 body，破坏邀请链接输入焦点和选区

- **状态**：已修复（2026-07-06）：DetailModalHost patch/open 现在捕获并恢复 body 内 activeElement、input/textarea 选区与子滚动容器滚动位置，低侵入保护活动弹层刷新连续性。
- **严重级别**：medium
- **分类**：UI 状态连续性 / 焦点输入保护
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:78; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:82; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:85; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:108; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:109; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:250; `/home/yuohira/mud-mmo-next/packages/client/src/ui/activity-panel.ts`:318; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:245; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:247; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:249; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:322; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:325; `/home/yuohira/mud-mmo-next/packages/client/src/ui/selection-preserver.ts`:143
- **证据**：ActivityPanel.handleStatus 在弹层打开时调用 detailModalHost.patch 并传 renderBody；ActivityPanel.render 首行 body.replaceChildren()，后续会重新创建邀请页 input 和 tab 按钮。detailModalHost 的 preserveSelection 只保存文本选区和 body 自身滚动，而 patchBodyFromRenderer 会用 scratch 承接后 this.body.replaceChildren(...scratch.childNodes)，不会恢复 input 焦点、selectionStart/selectionEnd 或子滚动容器。
- **触发场景**：玩家打开活动中心的邀请页，选中/复制邀请链接或正在操作 tab/按钮时，服务端活动状态刷新或领取结果触发 handleStatus，整个 body 被替换。用户可见表现是输入焦点丢失、链接选区消失、复制操作被打断，移动端还会收起键盘或重置触控位置。
- **影响**：低频但用户可感知的面板断裂；活动/月卡/邀请属于商业化入口，焦点和复制链路不稳定会影响转化体验。
- **建议修复方向**：为活动面板实现稳定壳体和局部 patch：只更新指标、按钮 disabled/text 和红点；保存并恢复 activeElement、input selection、tab 内滚动；避免在 handleStatus 常规刷新时调用整块 renderBody。

### P25. 配置编辑器 item catalog 输出字段少于 shared/client/server 物品契约

- **状态**：已修复（2026-07-06）：新增 shared 的 buildGmEditorItemOptionFromTemplate 作为单一 catalog builder，config-editor /api/editor-catalog 与服务端 ItemTemplateRegistry.listItemTemplates 均复用该口径，覆盖 materialCategory/materialValues/equipBaselinePercents 编译结果、equipSpecialStats、consumeBuffs、mapUnlockIds、respawnBindMapId、tileResourceGains、useBehavior、spiritualRootSeedTier、learnTechniqueId/MaxLevel 等字段。
- **严重级别**：medium
- **分类**：catalog-contract
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:250; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:267; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:277; `/home/yuohira/mud-mmo-next/packages/config-editor/local-api.cjs`:286; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:700; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:701; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:729; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:738; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:755; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:763; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:766; `/home/yuohira/mud-mmo-next/packages/shared/src/api-contracts.ts`:2021; `/home/yuohira/mud-mmo-next/packages/shared/src/api-contracts.ts`:2164; `/home/yuohira/mud-mmo-next/packages/shared/src/api-contracts.ts`:2174; `/home/yuohira/mud-mmo-next/packages/shared/src/api-contracts.ts`:2184; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:187; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:209; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:213
- **证据**：local-api 的 listEditorItems 只输出 itemId/name/type/grade/level/equipSlot/equipAttrs/equipStats/equipValueStats/craftEffectStats/effects/tags/contextActions/mapUnlockId/tileAuraGainAmount/allowBatchUse 等字段；服务端 normalizeItemTemplate 还会解析 materialCategory/materialValues/equipBaselinePercents/equipSpecialStats/consumeBuffs/mapUnlockIds/respawnBindMapId/tileResourceGains/useBehavior/spiritualRootSeedTier；shared 的 GmEditorItemOption 与客户端 resolvePreviewItem 也声明/消费这些字段。
- **触发场景**：运营在配置编辑器里检查或通过怪物装备 catalog 选择物品时，看到的是裁剪后的物品契约；带 equipBaselinePercents 的装备不会按服务端同口径编译成 equipStats，mapUnlockIds、respawnBindMapId、tileResourceGains、useBehavior 等资产行为字段也不会进入编辑器 catalog 视图，导致内容审核和怪物数值预览与线上运行时不一致。
- **影响**：影响物品资产展示、怪物装备数值预览、地图解锁/复活绑定/地块资源类物品的内容生产准确性；属于编辑器/共享/服务端/客户端 catalog 契约漂移。
- **建议修复方向**：让 config-editor 的 /api/editor-catalog 复用服务端 ItemTemplateRegistry.listItemTemplates 或共享的严格 catalog builder；字段集以 shared GmEditorItemOption 为单一契约，并覆盖 equipBaselinePercents 编译结果、materialValues、consumeBuffs、mapUnlockIds、respawnBindMapId、tileResourceGains、useBehavior 等字段。

### P26. AI 术法草稿/旧还原字段可被服务端内容加载直接展开，兼容边界未收敛到 GM 转换

- **状态**：已修复（2026-07-06）：静态功法内容已通过显式迁移工具展开为正式 SkillDef，复扫确认 artsStrength/rawRange/rawTargeting/rawFormula/rawCandidate 残留为 0；config-editor raw JSON 保存继续拒绝旧草稿字段；服务端静态内容 loader 与 generatedStore fallback 均先拒绝 artsStrength/raw* 旧字段，不再在运行时按当前公式静默重算。
- **严重级别**：medium
- **分类**：draft-compatibility
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/growth/13-technique-skill.md`:181; `/home/yuohira/mud-mmo-next/docs/mechanics/growth/13-technique-skill.md`:183; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:21; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:33; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:44; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:260; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:378; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:400; `/home/yuohira/mud-mmo-next/packages/shared/src/technique-arts-strength.ts`:1211; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:1453; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template-utils.ts`:1454; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/technique-template.registry.ts`:184; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/technique-template.registry.ts`:186
- **证据**：mechanics 文档说明正式运行时应保存展开后的 SkillDef，战斗 tick 不读取 AI 权重草稿；公式调整后应通过 GM 快捷指令从 rawCandidate 迁移旧版 AI 术法草稿。实际代码中 shared technique-arts-strength 仍定义 rawRange/rawTargeting/rawFormula、structureStrength.costMultiplier/cooldownTicks 等兼容/显式还原输入；服务端 normalizeSkill 只要发现 raw.artsStrength 就在内容加载时调用 expandTechniqueArtsStrengthContentSkill 展开；TechniqueTemplateRegistry 对 generatedStore fallback 也会重新 normalizeTechniqueTemplate。
- **触发场景**：已发布或静态内容中若仍保存 artsStrength/raw* 草稿字段，服务端重启或 generated template fallback 会按当前公式代码重新展开技能；一次公式重构可能无审计地改变已发布技能射程、范围、消耗、冷却或公式，而不是经 GM 迁移命令显式转换并回读验证。
- **影响**：影响功法技能、战斗数值和玩家资产稳定性；旧草稿兼容逻辑散落在 shared 解析器和服务端内容加载中，存在发布后被公式代码漂移重算的风险。
- **建议修复方向**：生产内容加载阶段拒绝 artsStrength/rawRange/rawTargeting/rawFormula 等草稿字段，或仅允许白名单 seed/static 目录并打出审计；生成/旧版 AI 草稿迁移统一收敛到 GM 一键转换，转换后持久化展开 SkillDef，再由运行时加载。

### P27. 地图旧格式/分层格式转换仍在 shared normalizer 中，并被服务端运行时 fallback 读取

- **状态**：已修复（2026-07-06）：6 个旧格式 compose 地图已通过显式迁移工具转换为 format:2，复扫确认旧 tiles/layeredCells/terrainRows/surfaceRows/structureRows/interactableRows 残留为 0；config-editor 地图保存统一输出 format:2；服务端 MapTemplateRepository 与 ContentTemplateRepository 怪物 fallback 读取地图前执行 assertRuntimeMapDocumentV2，运行时只接受发布后新真源。
- **严重级别**：medium
- **分类**：legacy-format-boundary
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:622; `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:656; `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:756; `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:1711; `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:1715; `/home/yuohira/mud-mmo-next/packages/shared/src/map-document.ts`:1747; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template.repository.ts`:196; `/home/yuohira/mud-mmo-next/packages/server/src/content/content-template.repository.ts`:198
- **证据**：shared normalizeEditableMapDocument 会调用 preprocessFormatV2，并且同一文件保留 buildLayeredRowsFromLegacyTiles、layeredCells/terrainRows/surfaceRows/structureRows 多格式合并逻辑；preprocessFormatV2 对 format:2 做字符层解码，非 format:2 原样返回继续走 legacy tiles。服务端 ContentTemplateRepository.buildFallbackMonsterRuntimeStatesForMap 在运行时从地图 JSON 读取 raw 后直接调用 normalizeEditableMapDocument。
- **触发场景**：线上地图文件仍混有 legacy tiles/layeredCells/format:2 等多种形态时，服务端 fallback 刷怪链路会在运行时内容加载过程中执行编辑器格式转换和旧格式补齐；后续修改编辑器 normalizer 或临时格式兼容逻辑，可能改变刷怪点、地形可走性或传送点同步，而不是通过受审计的一键 GM 转换先生成新真源格式。
- **影响**：影响地图实例、怪物刷新、地形/传送点解释和长期运行稳定性；旧格式兼容散落在 shared 通用 normalizer 中，破坏“运行时只接受新真源格式”的边界。
- **建议修复方向**：拆分 editor/import normalizer 与 server runtime loader：运行时只接受发布后的 format:2 新真源并做严格校验；legacy tiles/layeredCells 转换移动到统一 GM 兼容转换目录，显式触发、审计、回读验证后再进入运行时加载。

### P28. 怪物编辑器可编辑的 statTendency 字段少于 shared 运行时倾向字段

- **状态**：已修复（2026-07-06）：MONSTER_TENDENCY_NUMERIC_KEYS 已从 shared 导出，config-editor MonstersPage 改为直接引用 shared 字段列表，避免编辑器 statTendency 字段与运行时倾向字段漂移。
- **严重级别**：medium
- **分类**：schema-drift
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/shared/src/monster.ts`:626; `/home/yuohira/mud-mmo-next/packages/shared/src/monster.ts`:644; `/home/yuohira/mud-mmo-next/packages/shared/src/monster.ts`:645; `/home/yuohira/mud-mmo-next/packages/config-editor/src/pages/monsters/MonstersPage.tsx`:37; `/home/yuohira/mud-mmo-next/packages/config-editor/src/pages/monsters/MonstersPage.tsx`:55; `/home/yuohira/mud-mmo-next/packages/config-editor/src/pages/monsters/MonstersPage.tsx`:57
- **证据**：shared MONSTER_TENDENCY_NUMERIC_KEYS 包含 realmExpPerTick 与 techniqueExpPerTick；config-editor 的 STAT_TENDENCY_KEYS 只列到 viewRange/moveSpeed，未暴露这两个经验/成长字段。
- **触发场景**：内容团队需要调整怪物带来的境界/功法成长相关倾向时，配置编辑器不会展示这些字段；如果字段已经存在，编辑器只能在 JSON 层隐式保留，无法在数值 tab 中审查和维护，容易造成怪物成长经济链路与服务端实际计算口径不一致。
- **影响**：影响怪物成长收益、功法/境界经济调参可见性；属于 config-editor 与 shared 怪物 schema 的明确字段漂移。
- **建议修复方向**：将 STAT_TENDENCY_KEYS 从 shared 导出或由 shared 提供 editor 元数据，配置编辑器不要手写字段列表；至少补齐 realmExpPerTick、techniqueExpPerTick，并为成长收益字段添加明确分组和校验说明。

### P29. 市场主弹层多处交互直接重开整窗，列表滚动、焦点和交易草稿会被打断

- **状态**：已修复（2026-07-06）：DetailModalHost 已在 open/patch 全局恢复焦点、输入选区与子滚动位置；MarketPanel 普通市场、我的订单、托管仓与交易历史回包均按当前 tab 局部 patch，历史分页/撤单/领取仓库改为委托事件处理，避免回包和分页重建整窗打断滚动、焦点或交易草稿。
- **严重级别**：medium
- **分类**：交易/市场 UI 连续性
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1388; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1391; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1397; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1398; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1423; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1498; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1540; `/home/yuohira/mud-mmo-next/packages/client/src/ui/panels/market-panel.ts`:1558; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:175; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:193; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:322; `/home/yuohira/mud-mmo-next/packages/client/src/ui/detail-modal-host.ts`:325
- **证据**：MarketPanel.renderModal 每次调用 detailModalHost.open，并在 renderBody 中 replaceElementHtml(body, this.renderModalBody(...))。同一弹层内 tab 切换、交易历史分页等事件会直接 this.renderModal()。detailModalHost.open 即使 owner 相同也会重新 prepare body render signal 并通过 patchBodyFromRenderer 替换整个 body。
- **触发场景**：玩家在市场查看列表、切换交易历史页或查看商品详情时，renderModal 重开整窗导致列表滚动位置、当前按钮焦点、详情区域滚动和可能存在的交易输入状态被重置。市场/交易属于资产链路，用户在高频价格刷新或快速分页时可能误以为选择丢失、重复点击购买/出售，体验上出现明显断裂。
- **影响**：资产相关 UI 的局部 patch 不足，容易造成滚动跳顶、焦点丢失和误操作风险；长期在线时市场列表越复杂越明显。
- **建议修复方向**：仿照邮件/NPC 商店做稳定壳体：市场列表、详情、交易历史和 trade dialog 分区 patch；renderModal 仅首次 open，后续使用 detailModalHost.patch 更新标题并局部更新 body；捕获并恢复滚动、activeElement、输入选区和当前选中 item。

### P30. 同实例传送命中 existing 玩家分支时会忽略目标坐标

- **状态**：已修复（2026-07-06）：MapInstanceRuntime.connectPlayer 的 existing 玩家分支已支持 preferredX/preferredY relocate；传送 smoke 覆盖同实例/跨实例目标坐标写入。
- **严重级别**：medium
- **分类**：传送/位置权威
- **置信度**：plausible
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:654; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:663; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/instance/map-instance.runtime.ts`:5498; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:79; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-transfer.service.ts`:92
- **证据**：buildTransfer 携带 targetX/targetY；applyTransfer 对 target.connectPlayer 传 preferredX/preferredY，但当 target 与 source 是同一实例时会跳过 source.disconnectPlayer。MapInstanceRuntime.connectPlayer 对已在实例内的玩家只更新 sessionId 并直接返回 existing，完全忽略 preferredX/preferredY。
- **触发场景**：运行时动态传送门或同图传送配置把玩家从当前实例某点传到同实例另一坐标时，connectPlayer 命中 existing 分支，玩家不会移动到 targetX/targetY；客户端可能收到抵达通知，但服务端权威坐标仍停留在原地。
- **影响**：同实例传送会出现位置权威与玩法意图不一致，可能卡住导航、传送门链路或动态副本/宗门内短距传送。
- **建议修复方向**：applyTransfer 在 target===source 时调用 relocatePlayer 或专用 same-instance teleport 流程；connectPlayer existing 分支不应承担迁移语义，避免隐藏忽略 preferred 坐标。

### P31. 兑换码 GM 管理变更未记录审计，创建/销毁/删除缺少 actor 追踪

- **状态**：已修复（2026-07-06）：兑换码分组创建/更新/删除、追加码、销毁码等 GM mutation 已接入 actor 与 gm.redeem* 审计，避免记录完整兑换码明文列表。
- **严重级别**：medium
- **分类**：兑换码 / 缺少审计
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md`:48; `/home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md`:50; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1040; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1063; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1074; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1086; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1097; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:126; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:201; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/redeem/redeem-code-runtime.service.ts`:237
- **证据**：兑换码文档说明 GM 可删除尚未产生使用记录的兑换码分组。控制器提供 create/update/delete/append/destroy 兑换码管理路由，但这些方法不接收 @Req()、不传 actor、不调用审计服务；RedeemCodeRuntimeService 的 createGroup/deleteGroup/destroyCode 只更新兑换码状态和持久化文档，没有 actor 字段或审计写入。
- **触发场景**：运营人员生成高价值兑换码、追加码、销毁码或删除未使用分组后，系统只能看到兑换码状态变化，不能可靠知道谁创建/销毁、来源 IP、奖励内容摘要和数量。发生礼包外泄、内部滥发或误删时，无法从兑换码真源与 gm_audit_log 关联责任人。
- **影响**：兑换码直接影响玩家资产发放；缺少 GM 审计会降低滥用检测和事故回溯能力。
- **建议修复方向**：RedeemCodeRuntimeService 的 GM mutation API 增加 actor/audit 参数，create/update/delete/append/destroy 全量记录 gm.redeem.* 审计；记录 groupId、奖励摘要、数量、deletedCodeCount、codeId/status，避免记录完整兑换码明文列表到审计表。

### P32. with-db 发布链路中的协议审计被强制降级为无库模式

- **状态**：已修复（2026-07-06）：协议审计入口已拆分 local/with-db；local 继续清空 DB 环境，with-db 保留 DB 环境，release-with-db 已改为调用 audit:protocol:with-db。
- **严重级别**：medium
- **分类**：协议审计盲区
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/scripts/release-with-db.js`:51; `/home/yuohira/mud-mmo-next/scripts/release-with-db.js`:54; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-stable-protocol-audit.ts`:21; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-stable-protocol-audit.ts`:25; `/home/yuohira/mud-mmo-next/packages/server/src/tools/protocol-audit.ts`:924; `/home/yuohira/mud-mmo-next/packages/server/src/tools/protocol-audit.ts`:1017
- **证据**：release-with-db 明确把 audit:protocol 纳入带库发布链路，但 run-stable-protocol-audit 在启动审计时强制清空 DATABASE_URL / SERVER_DATABASE_URL，并跳过本地 env 自动加载；同时 protocol-audit 自身仍包含需要数据库时写 persistent_documents 的 token seed 路径。结果是 with-db gate 中的协议审计实际始终按无库模式运行，无法验证数据库身份/快照 seed、presence fencing 等 DB 协议路径。
- **触发场景**：协议或登录首包改动影响数据库回填身份、玩家快照或 session fence 时，pnpm verify:release:with-db 仍会显示 audit:protocol 通过，因为 stable audit 已把 DB 环境置空；生产带库连接、断线重连或跨端会话恢复才暴露问题。
- **影响**：带库 release gate 对协议层的证明口径被降级为无库审计，无法覆盖玩家身份、快照、presence/session fencing 等生产关键恢复链路。
- **建议修复方向**：拆分 audit:protocol:local 与 audit:protocol:with-db：local 继续清空 DB，with-db 保留 SERVER_DATABASE_URL 并使用隔离测试账号/实例；在 release-with-db 中调用 with-db 版本，并为 protocol-audit 的 DB seed 增加显式清理和 scope 前缀。

### P33. 阵法运行态刷盘 fire-and-forget，失败后缺少脏标记和恢复重试

- **状态**：已修复（2026-07-06）：阵法实例保存、单体快照和删除失败会保留 dirty/removal retry；flushAllNow 会覆盖 pending timer、dirty instance 与删除重试，成功后清理重试状态。
- **严重级别**：medium
- **分类**：地图/阵法持久化
- **置信度**：plausible
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/equipment-items/28-formation.md`:37; `/home/yuohira/mud-mmo-next/docs/mechanics/equipment-items/28-formation.md`:136; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:580; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:598; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:617; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:1221; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:1229; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:1235; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-formation.service.ts`:1241
- **证据**：阵法机制要求每 tick 结算灵力池/灵石池，固脉阵会影响地块稳定和恢复。advance 过程中资源扣减、active 关闭和每 60 tick checkpoint 只设置 persistenceDirty，随后 persistInstanceFormationsSoon 延迟 5 秒写库；定时器、单体快照和删除持久化都使用 void ...catch 仅记录 warn，没有把失败保留为 dirty 或加入 shutdown 状态。final flush 能覆盖正常关机，但不能覆盖崩溃和持续 DB 失败。
- **触发场景**：固脉阵/其他阵法在 tick 中灵石耗尽、active 变更或预算衰减后，DB 写入失败或进程在 5 秒延迟窗口内崩溃；重启时从旧 formation_state 恢复，可能让已关闭/耗尽阵法继续生效，造成地块复生暂停、临时地块不消散或阵法资源回退。
- **影响**：影响地图长期状态、地形破坏恢复、阵法资源消耗和玩家资产消耗一致性；在 10000 地图实例下 warn-only 会让单实例持久化失败难以被最终关机/监控准确拦截。
- **建议修复方向**：为阵法引入明确 dirty domain/flush ledger，失败后保留待重试状态并纳入 WorldShutdownDrainService finalFlushFailed；对资源 tick 可按实例维护 lastPersistedRevision/dirtySince，避免 timer catch 后静默丢失。

### P34. 地图每帧雾层遍历当前视口全部格子，视口和 DPR 增大时持续占用渲染预算

- **状态**：已修复（2026-07-06）：Pixi 雾层由单个 Graphics 全视口重绘改为 16x16 terrain fog chunk Graphics 缓存；稳定相机/同状态命中全局 signature，视口移动只创建或重绘新进入 chunk，fade transition 保留 32ms 桶节流，避免每帧清空并重画全部可见格。
- **严重级别**：medium
- **分类**：地图渲染性能 / 长时间在线
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:420; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/runtime/map-runtime.ts`:463; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1086; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1623; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1689; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1690; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1694; `/home/yuohira/mud-mmo-next/packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts`:1695; `/home/yuohira/mud-mmo-next/packages/client/src/constants/ui/performance.ts`:42; `/home/yuohira/mud-mmo-next/packages/client/src/constants/ui/performance.ts`:45
- **证据**：MapRuntime 持续 requestAnimationFrame 渲染，默认 targetFps 为 60。每帧 render 会调用 updateTerrainChunks，随后 rebuildTerrainFogLayer；该函数 clear 整个 terrainFogLayer，并在 startCX..endCX、startCY..endCY 的每个 16x16 chunk 内逐格循环，按每格 rect 填充雾层。
- **触发场景**：在大屏、缩放后视口较大或移动端高 DPR 下，当前视口覆盖的 chunk 数增多；即使 AOI 只有半径 10，雾层仍按屏幕可见范围逐格重画。玩家长时间在线、移动频繁或视野淡入淡出时，地图帧预算持续被全视口雾层占用，可能导致地图滑动不稳、战斗特效掉帧、点击反馈延迟。
- **影响**：客户端单机性能成为瓶颈，与服务端 1Hz/AOI 增量同步优化目标不匹配；低端移动设备尤其容易出现用户可感知卡顿。
- **建议修复方向**：将雾层拆为 chunk 缓存或仅在 visibleTileRevision/相机跨 chunk/过渡未结束时更新；对稳定相机复用 Graphics/RenderTexture；对移动端降低 targetFps 或雾层粒度，并以 profiler 指标验证。

### P35. 同步 worker 服务常驻导致空 envelope tick 跳过 quest/runtime/stat 后置下发

- **状态**：已修复（2026-07-06）：flushConnectedPlayers 改为尊重 shouldUseWorkerEncode；worker 关闭或 envelope 为空时仍执行 auxDeferred、quest、runtime events 与 statistic records 后置同步。
- **严重级别**：medium
- **分类**：增量同步 / 后置事件丢失
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/app.module.ts`:452; `/home/yuohira/mud-mmo-next/packages/server/src/app.module.ts`:453; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:97; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:99; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:103; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:108; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:177; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync.service.ts`:184; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-sync-worker-encode.service.ts`:42
- **证据**：AppModule 固定注册 AoiEnvelopeEncoderService 和 WorldSyncWorkerEncodeService。flushConnectedPlayers 只按 this.workerEncodeService 是否存在进入“worker”分支，而不是调用 shouldUseWorkerEncode；该分支只有 envelope 非空时才 pendingEmits.push，并把 auxDeferred、emitQuestSyncIfChanged、emitPendingRuntimeEvents、emitPendingPlayerStatisticRecords 放入 postEmitFn。若 createDeltaEnvelope 返回 null，则 postEmitFn 完全不会执行。对照非 worker 路径 syncDeltaForPlayer，无论 envelope 是否为空，都会继续 emitEnvelope 后执行 auxDeferred、quest、runtime events 和 statistic records。WorldSyncWorkerEncodeService.shouldUseWorkerEncode 当前还显式返回 false，但调用方没有使用该开关。
- **触发场景**：玩家 idle 或场景无 world/self/panel 变化时，createDeltaEnvelope 返回 null；同一 tick 内如果只有任务 revision、拾取窗口外的 quest 同步、legacy notice、GM state push 或玩家统计记录需要下发，worker 分支不会入队 postEmitFn，客户端不会收到这些低频状态，直到之后发生一次无关移动/战斗/面板变化产生 envelope 才可能被带出。
- **影响**：会造成“静默延迟同步”：任务、通知、统计记录、部分运行时事件在安静 tick 中不刷新，表现为客户端状态偶发落后服务端。对长期在线玩家和低频面板尤其难复现，也会掩盖 shouldUseWorkerEncode=false 的配置意图。
- **建议修复方向**：flushConnectedPlayers 应以 workerEncodeService.shouldUseWorkerEncode() 为准决定是否走 worker 分支；无论 envelope 是否为空，都必须执行 postEmitFn，可在 envelope 为空时立即调用，或入队 no-op emit。增加回归测试：构造 envelope=null 但 quest/runtime notice/statistic 待下发的 tick，验证客户端仍收到对应 S2C。

### P36. run-protocol-audit 可写 persistent_documents 但只恢复 GM auth

- **状态**：已修复（2026-07-06）：run-protocol-audit 已按 local/with-db 构造子进程环境；local 默认清空 DB，with-db 会 snapshot/restore protocol-audit 写入的 server_player_identities_v1 与 server_player_snapshots_v1 scopes，避免 persistent_documents 污染。
- **严重级别**：medium
- **分类**：审计脚本持久化污染风险
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:19; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:50; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:73; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:224; `/home/yuohira/mud-mmo-next/packages/server/src/tools/run-protocol-audit.ts`:227; `/home/yuohira/mud-mmo-next/packages/server/src/tools/protocol-audit.ts`:924; `/home/yuohira/mud-mmo-next/packages/server/src/tools/protocol-audit.ts`:939
- **证据**：run-protocol-audit 的 runAudit 子进程继承 process.env，未清空 DATABASE_URL / SERVER_DATABASE_URL；同一入口只对 server_gm_auth 做快照、删除与恢复保护。protocol-audit 在有数据库时会 INSERT/UPSERT persistent_documents 的 server_player_identities_v1 与 server_player_snapshots_v1，但 run-protocol-audit 没有对应 persistent_documents 快照或删除逻辑。
- **触发场景**：开发或 CI 直接运行 dist/tools/run-protocol-audit.js 且环境中带有真实或共享 DATABASE_URL 时，协议审计会向 persistent_documents 写入 token_seed 身份/快照；脚本结束后只恢复 GM 密码记录，残留的身份/快照可能污染后续持久化恢复、迁移审计或旧文档桶退休判断。
- **影响**：协议审计本身可能违反“会创建持久化对象必须自动清理”的验证基线，在共享库或影子环境中留下旧 persistent_documents 数据。
- **建议修复方向**：run-protocol-audit 应与 stable 入口一致默认屏蔽 DB，或在允许 DB 模式时为 protocol-audit 写入的 persistent_documents scope/key 做 before snapshot + finally restore/delete；同时在输出中明确 DB 审计模式与清理结果。

### P37. 建造 start 未实现互斥入队，同一玩家可在其他技艺 job 运行时并行建造并获得建造经验

- **状态**：已修复（2026-07-06）：BuildingStrategy 增加 queueStart，当玩家已有炼丹/锻造/强化/传法/采集/挖矿/阵法等其他 active 技艺 job 时，建造 start 不再直接 dispatch 建造 job，而是写入 techniqueActivityQueue，由统一 tick 在所有 active job 清空后推进；旧 direct dispatch 仍建议保留防御性 active-kind 检查作为后续加固项。
- **严重级别**：medium
- **分类**：技艺 job 生命周期/建造经验
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts`:232; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/technique-activity-pipeline.service.ts`:238; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/building.strategy.ts`:37; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/building.strategy.ts`:47; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/building.strategy.ts`:56; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-building.service.ts`:127; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-building.service.ts`:140; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-craft-tick.service.ts`:94; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/world/world-runtime-craft-tick.service.ts`:95; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/building-tick.helpers.ts`:54; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/craft/pipeline/strategies/building-tick.helpers.ts`:67
- **证据**：pipeline.start 只有在 strategy.queueStart 存在时才会把活动互斥转换为队列；BuildingStrategy 没有 queueStart，consumeResources 会直接 dispatchStartBuildingConstruction 创建 buildingJob。建造 dispatch 只检查 player.buildingJob 是否已有任务，未检查炼丹/锻造/强化/传法/采集/挖矿/阵法等任一活跃技艺。WorldRuntimeCraftTickService 每 tick 遍历 listActiveTechniqueActivityKinds 并推进所有活跃 kind，因此同一玩家一旦同时拥有 buildingJob 和其他 job，两者都会跨 tick 推进。
- **触发场景**：玩家正在炼丹或强化时触发 startBuilding。由于 BuildingStrategy 不入队，dispatchStartBuildingConstruction 只要 buildingJob 为空就创建建造 job。后续 craft tick 同时推进炼丹/强化和建造，建造每 tick 扣减共享 buildRemainingTicks 并在 applyBuildingConstructionProgress 中发放 buildingSkill 经验，绕过“有活跃任务则入队列”的通用生命周期约束。
- **影响**：影响技艺成长经济链路；玩家可并行获得制作/强化/建造等跨 tick 收益，破坏 job 队列、打断等待、取消入口和经验节奏的一致性。
- **建议修复方向**：为 BuildingStrategy 增加 queueStart 或在通用 pipeline.start 中统一检查任一 active RuntimeTechniqueActivityKind；dispatchStartBuildingConstruction 也应防御性检查 hasAnyActiveTechniqueActivity（允许自身恢复除外）。补充“炼丹/强化进行中 startBuilding 应入队不并行推进”的回归测试。

### P38. 单一 GM 角色可执行所有高危操作，缺少分级权限和二次确认

- **状态**：已修复本组高危面（2026-07-06）：GM token 不再默认签发全部高危 scopes；登录只能从 SERVER_GM_TOKEN_SCOPES/GM_TOKEN_SCOPES 或请求显式 scopes 获取，并校验 SERVER_GM_ALLOWED_SCOPES/GM_ALLOWED_SCOPES；灾备、密钥、环境变量、重启等接口继续要求对应 scope 与二次确认短语。
- **严重级别**：medium
- **分类**：权限模型过粗 / 危险接口无保护
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md`:56; `/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md`:58; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-auth.guard.ts`:31; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-auth.guard.ts`:32; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-gm-auth.service.ts`:211; `/home/yuohira/mud-mmo-next/packages/server/src/runtime/gm/runtime-gm-auth.service.ts`:218; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm.controller.ts`:1180; `/home/yuohira/mud-mmo-next/packages/server/src/http/native/native-gm-admin.controller.ts`:177
- **证据**：GM 机制文档明确“单一 GM 角色，无分级权限”。Guard 只从 Authorization 提取 Bearer token 并调用 validateAndExtractAccessToken；token payload 只校验 role === 'gm'，没有 permission/scope/role level。相同 GM token 可访问 server/restart、database/restore 等高危端点。
- **触发场景**：客服/内容运营/技术运维共享同一 GM 权限模型时，任一低职责人员或泄露 token 均可执行整库恢复、服务器重启、兑换码生成、环境变量修改、广播邮件等高危操作。即使所有端点有 token 鉴权，也无法阻止横向越权和误操作。
- **影响**：权限绕过不是无鉴权绕过，而是授权粒度缺失；对玩家资产、服务可用性和运营数据的破坏半径过大。
- **建议修复方向**：在 token payload 中加入 subject、roleLevel/scopes、issuedAt、mfa/dualControl 标记；按端点分级：只读、客服、内容、经济、系统、灾备。数据库恢复、密钥读取、环境变量持久化、server/restart 等要求二次确认或短期 elevated token。

### P39. 离线收益累计刷盘失败被吞，最终关机可误判成功并释放租约

- **状态**：已修复（2026-07-06）：离线收益累积即使没有普通 dirty player 也会刷新；shutdown/final flush 中离线收益写入失败会汇总并抛出，阻止关机误判成功释放 lease。
- **严重级别**：medium
- **分类**：离线收益/关闭恢复
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/docs/mechanics/growth/15-offline-gain.md`:13; `/home/yuohira/mud-mmo-next/docs/mechanics/growth/15-offline-gain.md`:26; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts`:277; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts`:408; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts`:547; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts`:561; `/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts`:568; `/home/yuohira/mud-mmo-next/packages/server/src/network/world-shutdown-drain.service.ts`:103
- **证据**：离线收益机制要求 offlineGainSession 持续累计 accumulatedPayload，并在确认前保持云端记录。PlayerPersistenceFlushService.runFlushCycle 在正常/关机刷盘末尾调用 flushOfflineGainAccumulated；该方法逐玩家 updatePlayerOfflineGainAccumulated，失败只 warn，不抛出，不向 final flush 暴露失败。WorldShutdownDrainService 只根据 playerPersistenceFlushService.flushAllNow 是否抛错决定 finalFlushFailed。
- **触发场景**：玩家离线挂机期间 accumulatedPayload 已在内存增长；关机 final flush 中某个玩家 offline gain update 因 DB 超时或连接错误失败，但异常被内部吞掉，shutdown 继续释放 lease/注销节点。重启后玩家从旧 offline_gain_session 恢复，丢失最近累计收益，且关闭状态显示可能仍是成功或仅有 warn 日志。
- **影响**：影响离线挂机收益、月卡/永恒权益体验和长期在线恢复可信度；玩家会看到离线期间收益少算，且缺少明确失败水位用于补偿。
- **建议修复方向**：让 flushOfflineGainAccumulated 返回失败列表并在 shutdown/final flush 中冒泡；失败时保留 lease 或进入 degraded 状态。对 accumulatedPayload 写入增加 dirty/retry 标记和恢复审计，避免 warn-only。

### P40. 物品旧 ID alias 在服务端与客户端各自硬编码且集合不一致

- **状态**：已修复（2026-07-06）：物品旧 ID alias 已收敛到 shared 的 ITEM_TEMPLATE_ALIASES/resolveItemTemplateAliasId，服务端 ItemTemplateRegistry 与客户端 local-templates 均改为复用同一解析入口。
- **严重级别**：low
- **分类**：shared-contract
- **置信度**：confirmed
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:24; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:25; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:60; `/home/yuohira/mud-mmo-next/packages/server/src/content/registries/item-template.registry.ts`:166; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:54; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:55; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:103; `/home/yuohira/mud-mmo-next/packages/client/src/content/local-templates.ts`:106
- **证据**：服务端 ItemTemplateRegistry 的 ITEM_TEMPLATE_ALIASES 包含 equip.copper_array_plate -> formation_disk.mortal 以及两个 fate_stone 旧 ID；客户端 local-templates 的 CLIENT_ITEM_TEMPLATE_ALIASES 只包含两个 fate_stone 旧 ID。服务端 normalizeItem/createItem 会走 resolveItemTemplateId，客户端 getLocalItemTemplate 走自己的 CLIENT_ITEM_TEMPLATE_ALIASES。
- **触发场景**：持久化数据、GM 清理工具或外部导入仍出现 equip.copper_array_plate 时，服务端能把它解析到 formation_disk.mortal，但客户端本地 catalog fallback 无法同样解析；若该旧 ID 进入客户端展示或离线预览路径，会显示缺模板/错误名称，而服务端认为它是合法物品。
- **影响**：影响旧资产展示、GM 审计和客户端本地预览一致性；当前风险低于服务端资产结算，但属于旧格式兼容散落和跨端契约漂移。
- **建议修复方向**：把 item template alias 收敛到 packages/shared 的单一只读映射，并由服务端 registry、客户端 local template、GM 清理/迁移工具共同引用；同时把旧 ID 迁移作为 GM 一键转换，减少运行时 alias 分支。

### P41. 聊天会话按 playerId 持久化，跨地图/跨实例不会隔离附近和战斗日志

- **状态**：已修复（2026-07-06）：客户端聊天持久化 scope 已从单 playerId 扩展为 playerId|mapId|instanceId，并进一步按频道拆分：world/sect/system 随玩家保留，nearby/combat/grudge 按 mapId+instanceId+channel 隔离；IndexedDB 写入、最近消息恢复、向上翻页和去重键已统一使用频道 scope。
- **严重级别**：low
- **分类**：协议消费 / 聊天状态连续性
- **置信度**：plausible
- **文件位置**：`/home/yuohira/mud-mmo-next/packages/client/src/main-runtime-state-source.ts`:821; `/home/yuohira/mud-mmo-next/packages/client/src/main-runtime-state-source.ts`:872; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1110; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1117; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1120; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1124; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1279; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1285; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1596; `/home/yuohira/mud-mmo-next/packages/client/src/ui/chat.ts`:1597
- **证据**：Bootstrap 后 setChatPersistenceScope 只传 player.id。ChatUI.setPersistenceScope 若 normalizedScope 与 currentScopeId 相同会直接 return，不会因 mapId/instanceId 变化清理频道状态；buildMessageKey 也只由 scopeId 和 messageId 组成。聊天频道中 nearby 和 combat 分别按 entry.kind/entry.scope 分类，但没有地图或实例维度。
- **触发场景**：玩家跨图、传送到不同实例或断线重连回同一玩家 ID 时，附近聊天和战斗日志仍使用同一个 playerId 作用域。用户可能在新地图看到旧地图附近消息/战斗记录，误判当前周围玩家、仇恨或战斗状态；如果消息 ID 由不同实例复用，还可能触发去重误判。
- **影响**：不会直接改权威状态，但会造成跨地图上下文污染，影响位置、战斗和社交感知连续性。
- **建议修复方向**：将聊天持久化 scope 至少扩展为 playerId + mapId + instanceId，或对 nearby/combat 使用地图实例级 scope、world/sect 使用账号级 scope；Bootstrap/SelfDelta mapChanged 时同步切换或清理相应频道。

## 验证建议

- 对 high/critical 问题优先补最小复现 proof 或 smoke，再做修复，避免只凭静态证据直接重构。
- 市场、邮件、GM、持久化恢复、跨图/断线重连类问题应配套崩溃点注入或 flush 前后断点验证。
- 协议/AOI/首包类问题应同时跑 `pnpm build:shared`、`pnpm audit:protocol` 与客户端专项验证。
- 服务端运行时与持久化类修复建议至少跑 `pnpm verify:quick`；涉及 DB 真源时升级到 `pnpm verify:release:with-db`。
- 文档中 `needs-verification` 的项应先做调用链复核，确认真实生产路径后再进入修复队列。

## 覆盖缺口

- 已读取相关机制文档：GM 系统文档 /home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md、兑换码系统文档 /home/yuohira/mud-mmo-next/docs/mechanics/other/36-redeem.md。
- 已读取并核对主要真实代码入口：GM 鉴权守卫、GM 鉴权服务、GM 主控制器、GM 管理控制器、GM 管理服务、GM 审计持久化、密钥管理、环境变量管理、兑换码运行时、CORS 与 env alias。
- 未把仅凭文件名或路由名推测的问题列入 findings；下列发现均包含代码 file:line 证据。
- 鉴权层总体确认：GM HTTP 控制器通过 @UseGuards(NativeGmAuthGuard) 保护，Guard 校验 Bearer token 并挂载 actor；默认 GM 密码在非显式本地降级时会启动失败，未列为问题。
- CORS 总体确认：非开发环境缺少白名单会启动失败，未列为问题。
- 已读取机制文档：docs/mechanics/technique/16-alchemy.md、17-forging.md、18-enhancement.md、21-building-craft.md、22-craft-skill-exp.md；docs/mechanics/growth/13-technique-skill.md、14-buff-system.md、15-offline-gain.md；docs/mechanics/economy/29-market.md、30-mail.md、31-sect.md、32-leaderboard.md。
- 已读取真实代码链路：技艺 pipeline/queue/strategy、炼丹/锻造/强化/建造/传法 tick 与 cancel、世界技艺 tick/interrupt、建造实例状态、命令路由、邮件领取、市场交易、离线收益与 buff tick 相关实现。
- 邮件附件领取链路已检查到 Durable Operation 路径，当前扫描未形成可证明的重复领取 finding；buff 与离线收益链路本轮未发现足够 file:line 证据支撑资产/经验重复发放 finding。
- 市场服务存在大量中文拼接通知，但本轮 findings 仅列入资产一致性、job 生命周期、跨 tick/取消/中断相关缺陷；通知结构化问题未单独列入。
- 本次为只读审计，未修改文件、未运行会产生持久化写入的验证命令。
- 已读取机制文档：/home/yuohira/mud-mmo-next/docs/mechanics/core-loop/01-tick-scheduling.md、/home/yuohira/mud-mmo-next/docs/mechanics/core-loop/02-aoi-sync.md、/home/yuohira/mud-mmo-next/docs/mechanics/economy/29-market.md、/home/yuohira/mud-mmo-next/docs/mechanics/economy/30-mail.md、/home/yuohira/mud-mmo-next/docs/mechanics/other/38-gm-system.md。
- 已审计根验证入口、server package 脚本、stable smoke suite、DB 清理工具、市场/邮件/兑换码/GM/协议审计相关 smoke 与 audit 代码。
- 未把仅凭文件名推断的覆盖缺口列入 findings；无 file:line 证据的候选问题仅保留在本 coverageNotes 中。
- 仓库内存在大量未挂入默认门禁的 smoke/proof 脚本；本次只把已确认会影响关键链路覆盖或持久化清理的样本列为发现。
- 只读扫描已覆盖机制文档：/home/yuohira/mud-mmo-next/docs/mechanics/core-loop/01-tick-scheduling.md、02-aoi-sync.md、03-movement-pathfinding.md，确认 1Hz tick、AOI 只发视野内必要变化、首包/跨图全量且默认增量的设计口径。
- 已读取服务端同步主链路：world-sync.service.ts、world-sync-envelope.service.ts、world-projector.service.ts、world-sync-aux-state.service.ts、world-sync-map-static-aux.service.ts、world-session.service.ts、world-session-bootstrap*.service.ts、world-client-event.service.ts、world-sync-worker-encode.service.ts、aoi-envelope-encoder.service.ts。
- 已读取客户端消费主链路：socket.ts、socket-lifecycle-controller.ts、socket-event-registry.ts、socket-server-events.ts、main-bootstrap-assembly.ts、main-high-frequency-socket-bindings.ts、main-runtime-state-source.ts、main-runtime-delta-state-source.ts、main-runtime-monitor-source.ts、game-map/store/map-store.ts、game-map/runtime/map-runtime.ts。
- 未执行动态压测或端到端运行；以下 findings 均基于静态真实代码 file:line 证据。未能形成 file:line 因果链的猜测未列入 findings。
- 已按只读方式扫描 packages/shared、packages/config-editor，并补充读取 packages/server/src/content 与 packages/client/src/content 的实际消费链路；未修改文件、未运行写入型命令。
- 已阅读相关机制文档：docs/mechanics/README.md、core-loop/04-map-terrain.md、combat/09-monster-spawn-drop.md、growth/13-technique-skill.md、technique/16-alchemy.md。
- 重点覆盖了地图格式转换、怪物模板解析、物品/功法 catalog、配置编辑器本地 API、客户端本地 catalog fallback、服务端内容 registry 与旧格式兼容边界。
- 未把仅凭文件名或单点搜索无法确认的问题列入 findings；若只是潜在缺少测试但没有直接 file:line 证据，已省略。
- 已只读审计 docs/mechanics/core-loop/01-tick-scheduling.md、02-aoi-sync.md、03-movement-pathfinding.md、04-map-terrain.md 与 docs/mechanics/combat/05-combat-flow.md、07-threat-system.md、08-monster-ai.md、09-monster-spawn-drop.md。
- 已覆盖 packages/server 的 tick 调度、实例 tick 编排、MapInstanceRuntime 移动/占位/怪物 AI/传送、WorldSync 同步、待执行命令队列、传送、复生与玩家会话接入关键链路。
- 未修改代码、未运行写入型命令；以下 findings 仅列入有真实代码 file:line 证据的问题。
- 未把缺少可定位代码证据的假设列入 findings；部分配置数据抽样用于验证同图传送风险，但静态地图中未发现同 id targetMapId 的普通传送点。
- 已读取机制文档：tick 调度、AOI 同步、移动寻路、地图地形、邮件系统，确认客户端侧应按 1Hz 增量/差量同步、AOI 最小包、移动点数和服务端权威裁定来消费协议。
- 已覆盖 packages/client/src 下正式客户端主线的高频协议绑定、运行态 delta 消费、地图 store/runtime/renderer/interaction、聊天、邮件、活动、NPC 商店、市场弹层、响应式与深色模式令牌。
- 邮件面板、NPC 商店和部分背包面板已有滚动/焦点保护或节点复用逻辑，未在这些已保护路径上列为问题。
- 本次为只读扫描，未修改文件、未运行构建或端到端验证；以下 findings 均基于真实代码 file:line 证据。
- 只读扫描完成，未修改仓库文件；重点阅读了 /home/yuohira/mud-mmo-next/docs/mechanics/economy/29-market.md、30-mail.md、other/36-redeem.md、38-gm-system.md、growth/15-offline-gain.md、equipment-items/28-formation.md、core-loop/03-movement-pathfinding.md。
- 重点代码覆盖：/home/yuohira/mud-mmo-next/packages/server/src/persistence/player-persistence-flush.service.ts、map-persistence-flush.service.ts、market-persistence.service.ts、mail-persistence.service.ts、redeem-code-persistence.service.ts、durable-operation.service.ts，以及 runtime 下 market/mail/redeem/world-formation/NPC-shop/player 等链路。
- 重新核对了 memory 中同类根因的当前实现：PlayerRuntimeService.markPersisted 已改为按 persistedDomains/persistedRevision 精确清理；WorldShutdownDrainService 当前 final_flushing 已覆盖 player/map/tongtian/sect/formation。
- 未列入 findings 的问题不代表完全无风险；本轮只输出已读真实代码并能给出 file:line 证据的缺陷。

## 后续处理优先级

1. 先处理会造成玩家资产、整库恢复、市场托管、邮件领取、跨图/断线恢复不一致的 high/critical 项。
2. 再补验证入口覆盖，把已有但未挂入门禁的关键 smoke 纳入稳定 suite。
3. 最后处理 UI 连续性、配置契约、通知结构化、文档/机制一致性等中低风险项。