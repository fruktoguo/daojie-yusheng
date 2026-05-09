# MMO 商业级邮件系统设计

## 1. 文档定位

本文档描述 `道劫余生` 当前生产主线面向商业级 MMO 运营要求的邮件系统目标设计。

它回答的是：

- 当前仓库邮件系统离商业级还差什么
- 商业级版本应如何拆分服务端职责、持久化真源、协议和运营链路
- 后续开发应按什么顺序收敛

它不回答的是：

- 本次是否已经完成实现
- 旧线邮件逻辑是否需要作为行为参考
- 具体 UI 视觉稿

## 2. 当前仓库现状

基于当前主线代码，现有邮件系统已经具备基础闭环：

- 服务端有独立邮件运行时：`packages/server/src/runtime/mail/mail-runtime.service.ts`
- 邮件真源已经开始迁到 `player_mail / player_mail_attachment / player_mail_counter`
- 客户端协议已按 `摘要 / 分页 / 详情 / 操作结果` 分层
- GM 已支持单人发信和全服广播发信
- 附件领取、删除条件、背包容量校验都在服务端执行

但它距离商业级 MMO 运营要求还有明显缺口：

- 结构化真源已落地，但旧 `persistent_documents(scope=server_next_mailboxes_v1)` 仍保留兼容镜像，主链还没完全清退
- 广播发信是同步逐人投递，没有任务队列、失败重试、断点续投
- 没有正式的发信批次、收件回执、campaign 级运营真源
- 附件领取虽已接入强持久化事务链，但已读/删除/广播投递还没有全部进入同等级商业链路
- 在线玩家收到新邮件后，没有完整的主动推送链路保证角标及时更新
- 缺少运营侧查询、撤销、冻结、补偿、追责、导出能力

结论是：当前实现适合主线验证和中小规模内测，不足以支撑商业级 MMO 的长期运营。

### 2.1 当前已落地进度（2026-04-22）

已落地：

- `player_mail / player_mail_attachment / player_mail_counter` 结构化表已经接入读写主链
- 邮件附件领取已经接入 `DurableOperationService`，并联动 `durable_operation_log / outbox_event / asset_audit_log`
- GM 数据库备份/恢复已经能够覆盖邮件结构化主线表，而不是只备份旧 mailbox JSON

未完成：

- `mail_campaigns / mail_messages / mail_receipts` 这类运营级批次和回执真源还没有正式落地
- GM 广播仍是请求线程内逐玩家串行投递，不是异步任务投递
- 在线新邮件 push、失败重试、运营报表、批次审计和回放链路还没有完成

## 3. 商业级目标

商业级邮件系统在本项目中的目标应收敛为四条：

1. 玩家视角正确
   - 邮件不会丢、不会重复领、不会误删后重发、不会因刷新或重连导致状态错乱
2. 运营视角可控
   - 谁发的、发给谁、发了多少、谁领取了、谁失败了，都能追踪
3. 工程视角可恢复
   - 进程崩溃、重试、重连、批量发信中断后，可以继续执行或补偿
4. 协议视角可扩展
   - 保持低频分层，不把正文、附件和运营元数据塞进高频同步

## 4. 设计原则

- 邮件“下次还在”，正式真源必须是数据库，不允许只存在运行时缓存
- 玩家邮箱展示是投影，不是唯一真源
- 发信、投递、领取、删除、过期、撤回、审计必须拆开建模
- 单封邮件定义和玩家收件状态分离，避免把整箱当作唯一操作单位
- 协议继续保持 `summary / page / detail / result` 低频分层
- 运营批量发信必须异步化，不在请求线程里逐玩家串行完成
- 附件发货必须具备幂等键，避免重复结算
- 所有 GM / 运营写操作都必须留下审计记录

## 5. 目标持久化模型

当前单 mailbox JSON 文档应演进为以下正式模型。

### 5.1 mail_campaigns

表示一次运营或系统发信批次。

建议字段：

- `campaign_id`
- `source_type`
  - `system`
  - `gm_direct`
  - `gm_broadcast`
  - `compensation`
  - `tutorial`
- `template_id`
- `template_args`
- `fallback_title`
- `fallback_body`
- `attachment_payload`
- `expire_at`
- `created_by`
- `created_at`
- `status`
  - `draft`
  - `queued`
  - `sending`
  - `completed`
  - `partially_failed`
  - `cancelled`

### 5.2 mail_messages

表示一封可被多个玩家共享定义的邮件消息体。

适用场景：

- 广播邮件
- 补偿邮件
- 系统活动邮件

建议字段：

- `message_id`
- `campaign_id`
- `template_id`
- `template_args`
- `fallback_title`
- `fallback_body`
- `attachment_payload`
- `expire_at`
- `created_at`

说明：

- 若是单人定向信，也可以直接一封消息对应一个收件人
- 若是广播信，可多个收件人共享同一 `message_id`

### 5.3 mail_receipts

表示“某个玩家收到了哪封邮件，以及状态如何”，这是玩家邮箱列表的主要真源。

建议字段：

- `receipt_id`
- `player_id`
- `message_id`
- `campaign_id`
- `delivery_status`
  - `pending`
  - `delivered`
  - `delivery_failed`
- `delivered_at`
- `first_seen_at`
- `read_at`
- `claimed_at`
- `deleted_at`
- `expire_at`
- `claim_operation_id`
- `version`

关键说明：

- 玩家是否已读、已领、已删，不再写回整箱 JSON
- 邮件列表、未读数、可领取数都基于 `mail_receipts`
- 这是玩家邮箱主视图的真源

### 5.4 mail_claim_operations

表示一次附件领取结算操作，用于幂等和恢复。

建议字段：

- `operation_id`
- `receipt_id`
- `player_id`
- `status`
  - `pending`
  - `applied`
  - `failed`
- `attachment_payload`
- `inventory_result_snapshot`
- `error_code`
- `created_at`
- `finished_at`

说明：

- 每个 receipt 只能绑定一次成功领取操作
- 崩溃恢复时，优先检查该表，而不是重新发货

### 5.5 mail_audit_logs

表示运营和 GM 的审计链。

建议字段：

- `audit_id`
- `actor_type`
- `actor_id`
- `action`
  - `create_campaign`
  - `enqueue_delivery`
  - `retry_delivery`
  - `cancel_campaign`
  - `claim_mail`
  - `delete_mail`
- `target_type`
- `target_id`
- `payload`
- `created_at`

## 6. 服务端职责拆分

目标上不应再由一个邮件运行时服务同时承担全部职责。

建议拆分如下：

### 6.1 `runtime/mail/mail-query.service`

负责：

- 汇总未读数、可领取数
- 拉取分页列表
- 拉取详情
- 只做读投影，不负责发货与投递

### 6.2 `runtime/mail/mail-command.service`

负责：

- 标记已读
- 删除邮件
- 发起领取附件

它只接受命令，不负责直接拼 UI 视图。

### 6.3 `runtime/mail/mail-delivery.service`

负责：

- 创建 `receipt`
- 批量投递
- 投递失败记录
- 重试策略

### 6.4 `runtime/mail/mail-claim.service`

负责：

- 校验是否可领
- 创建 `claim_operation`
- 调用背包/物品结算
- 将 receipt 状态推进为 `claimed`
- 失败恢复

### 6.5 `http/native/native-gm-mail.service`

继续作为 GM 入口，但只负责：

- 参数归一
- 权限校验后的发起
- 返回 `campaign_id / batch_id`

不再在 HTTP 请求里直接逐玩家串行发信。

## 7. 投递流程设计

### 7.1 单人发信

1. GM / 系统创建 message
2. 创建对应 player 的 receipt
3. 若玩家在线，推送新的 `mailSummary`
4. 记录审计日志

### 7.2 全服广播发信

1. 创建 campaign
2. 冻结本次收件人集合
3. 投递任务进入队列
4. Worker 分批生成 receipts
5. 成功与失败分别记账
6. 在线玩家收到 summary 增量通知
7. campaign 状态汇总为 `completed` 或 `partially_failed`

关键要求：

- “本次广播发给谁”必须冻结，不要边跑边读在线玩家快照
- 重试必须按未成功 receipt 重试，不是整批重跑
- 广播取消只影响未投递部分，不回滚已投递 receipt

## 8. 附件领取一致性设计

这是商业级邮件系统的关键点。

当前项目邮件附件大多是物品发放，因此领取流程必须和库存结算对齐。

推荐流程：

1. 锁定目标 receipt
2. 校验 `claimed_at / deleted_at / expire_at`
3. 创建 `claim_operation(status=pending)`
4. 调用背包结算服务，以 `operation_id` 作为幂等键
5. 结算成功后，更新 `receipt.claimed_at`
6. 写入 `claim_operation(status=applied)`
7. 推送 `mailOpResult + mailSummary`

恢复规则：

- 若结算成功但 `receipt.claimed_at` 未写入，恢复任务根据 `claim_operation` 回补状态
- 若 `claim_operation` 已存在且为 `applied`，重复请求直接返回成功，不再重复发货
- 若背包空间不足，直接失败，不创建成功发货记录

## 9. 协议设计

当前协议方向基本正确，应继续保持，不建议重新做成大一统整包。

### 9.1 保留的低频事件

- `MailSummary`
- `MailPage`
- `MailDetail`
- `MailOpResult`

### 9.2 建议新增的低频事件

- `MailSummaryPatch`
  - 在线收到新邮件时只更新摘要
- `MailDeliveryNotice`
  - 可选，用于提示“收到新邮件”
- `MailCampaignResult`
  - GM 端查看批次投递结果

### 9.3 不应进入高频包的内容

- 邮件正文全文
- 附件详情大对象
- 运营批次元数据
- 审计日志
- 全量邮箱列表

## 10. 在线通知设计

商业级 MMO 邮件系统不应只靠“玩家手动点开邮箱后重新请求”来刷新。

建议规则：

- 玩家登录 bootstrap 后下发一次 `MailSummary`
- 玩家自己执行 `已读 / 领取 / 删除` 后，回包并刷新 `MailSummary`
- 新邮件成功投递到在线玩家时，服务端主动推送 `MailSummaryPatch`
- 客户端若邮箱面板当前打开，再主动刷新当前分页

这样可以保证：

- 角标及时更新
- 不把邮件正文推成常驻流量
- 面板打开时仍保持低频按需更新

## 11. 运营后台能力

商业级 MMO 必须有最小运营控制面。

至少要支持：

- 单人发信
- 批量广播发信
- 按条件筛选收件人
  - 全服
  - 在线
  - 离线
  - 新注册
  - 指定标签玩家
- 查看 campaign 状态
- 查看投递失败明细
- 重试未成功投递
- 导出投递结果
- 查询单玩家邮件历史
- 查询领取状态和领取时间
- 查询 GM 操作审计

## 12. 风险与边界

### 12.1 不建议继续依赖单 mailbox JSON 的原因

- 难以索引
- 难以修复单条异常邮件
- 难以做广播批次审计
- 难以做大规模失败重试
- 难以保证附件领取幂等恢复

### 12.2 不建议在 HTTP 请求里直接串行全服发信

- 时延不可控
- 失败中断难恢复
- 无法分片
- 无法重试
- 无法清晰观察进度

### 12.3 不建议把邮件做成高频面板同步

- 正文和附件属于低频详情
- 高并发下没有必要把整页邮箱常驻推送
- 会污染现有协议分层

## 13. 演进路线

### 阶段 1：补齐可用性缺口

- 修欢迎邮件等“自动补发判定”问题
- 在线投递后补 `MailSummary` 主动推送
- 为领取附件补 `operation_id` 幂等键
- 补 GM 发信审计日志

目标：

- 先把“会错、会丢、会重复”的问题收住

### 阶段 2：拆真源

- 从 mailbox JSON 迁到 `mail_messages + mail_receipts`
- 保留兼容读路径，逐步迁移旧邮箱数据
- 以 receipt 视图替换当前整箱列表逻辑

目标：

- 把真源从“单文档”升级为“可索引、可审计、可恢复”

### 阶段 3：运营级广播投递

- 引入 campaign 和异步投递 worker
- 支持失败重试、批次进度、结果导出
- 在线玩家增量提醒

目标：

- 支撑大规模活动、补偿、全服发奖

### 阶段 4：正式验收

- 补 with-db 验证
- 补广播中断恢复 smoke
- 补重复领取幂等 smoke
- 补 campaign 审计查询 smoke

目标：

- 让邮件系统具备 release gate 层面的证明链

## 14. 最终结论

本项目的商业级邮件系统，不应继续停留在“玩家邮箱 JSON 文档 + 直接写入 + 手动请求刷新”的层面。

正确方向是：

- 用数据库表级真源承载邮件消息、收件状态、领取操作和审计链
- 用异步投递承载广播邮件
- 用幂等领取承载附件发货
- 用低频协议分层承载客户端展示

只有这样，邮件系统才真正符合商业级 MMO 对正确性、运营性、可恢复性和可审计性的要求。
