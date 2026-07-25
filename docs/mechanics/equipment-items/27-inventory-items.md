# 背包与物品

## 背包常量

源文件: `packages/shared/src/constants/gameplay/inventory.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| DEFAULT_INVENTORY_CAPACITY | 200 | 默认背包容量 |
| GROUND_ITEM_EXPIRE_TICKS | 7200 | 地面物品保留时间（息） |
| DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS | 60 | 即时恢复类消耗品默认冷却 |

## 物品类型

```typescript
ItemType = 'consumable' | 'equipment' | 'artifact' | 'material' | 'quest_item' | 'skill_book'
```

- 可使用类型: `['consumable', 'skill_book']`
- 背包“装备”筛选包含 `equipment` 与 `artifact`，法宝不单独占一个背包筛选页。
- 一键整理类型权重: equipment=0, consumable=1, skill_book=2, quest_item=3, material=4, artifact=5
- 一键整理比较顺序: 品阶降序 → 等级降序 → 类型权重升序 → `itemId` 升序 → `name` 升序 → `enhanceLevel` 升序。`enhanceLevel` 升序表示强化等级越高越靠后。

## 物品堆叠规则

源文件: `packages/shared/src/item-stack.ts`

### 堆叠签名

```typescript
signature = itemId + '#' + enhanceLevel
```

### 规则

- 签名相同则可合并 count
- 实例态字段白名单: `['enhanceLevel']`
- 带 `itemInstanceId` 的装备也按签名合并
- 合并时现有堆叠的 itemInstanceId 胜出，新进入的被丢弃
- 拆出时必须分配新 instanceId

## 入包与满包规则

- 容量判断必须使用完整堆叠签名，不能只按 `itemId`。同 `itemId` 但强化等级或其他实例态字段不同的物品不能误判为可合并。
- 可合并物品始终直接合并到已有堆叠，即使背包槽位已经达到容量上限。
- 持续技艺 job 的完成产出、取消返还、异常停止返还属于任务资产结算：无法合并时也必须强制写入背包，允许背包条目数暂时超过容量，禁止转成地面掉落。
- 玩家在线战斗、击杀等即时获得物品时，满包且无法合并才允许掉到地面；服务端必须同时发送结构化系统通知，明确物品和掉落位置。
- 地面拾取、容器领取、商店购买、邮件领取等具有原始资产容器或主动确认入口的操作，继续按各自容量校验、部分领取或保留原处规则处理，不能因本规则复制资产。

## 物品实例 ID 生成

源文件: `packages/shared/src/item-runtime-types.ts`

- 装备类强制存在 `itemInstanceId`，由服务端 `randomUUID v4` 分配
- 全程不变（装/卸/强化/掉落/拾取/邮件领取）
- 市场挂单脱壳后买家成交会重新分配 ID
- 历史 fallback 值（含":"）视为"未稳定"，水合时 lazy 升级为新 UUID
- 玩家刷盘 payload 的 `itemInstanceId` 若已被其他玩家数据库行占用，必须先隔离，禁止直接改写现有归属。仅当 `itemId`、完整持久化实例态和非锁定状态都一致时，恢复链才可为待重放 payload 换发新 UUID 并重新入队；若旧会话 fence 已被新会话取代，只有在启动前，或离线挂机玩家重新登录且本进程仍持有其未绑定 session 的运行时时，才可在玩家离线、inventory 领域版本高于数据库水位并确认旧 ID 仍属于该受锁运行时后去除旧 fence。登录恢复必须在同一玩家资产锁内同步换发运行时 ID 并标脏；普通 worker、关机 drain、在线玩家或运行时身份不一致时仍继续隔离，任一内容条件不一致时等待人工核对。

## 分页与客户端水合

- 背包分页先在服务端按分类和搜索词过滤，再按 `offset/limit` 截取；单页上限为 30，响应回显 `requestId`、筛选条件和背包 `revision`。
- 分页条目必须携带完整的实例投影。`equipAttrs`、`equipStats`、`equipSpecialStats`、`consumeBuffs`、`contextActions`、`craftEffectStats` 等实例字段以服务端为准，本地内容模板只补齐未随实例保存的静态字段。
- 每个分页或增量物品对象都是该实例的完整视图；可选实例字段缺失表示该实例没有对应覆盖值，客户端不得从原槽位旧物品继承。这样即使同一槽位换成相同 `itemId/enhanceLevel` 的另一实例，也不会串用旧词条。
- 允许进入客户端的物品字段统一由 shared 投影白名单维护，并在编译期校验 `SyncedItemStack` 新字段是否完成投影决策；服务端不得直接展开运行时对象，以免泄露内部字段。
- 背包、装备和法宝的 PanelDelta 快照必须深克隆实例投影。上一帧网络基线不得与权威运行时共享词条、Buff 或动作数组，否则原地变化会同时污染前后帧并让 diff 漏发。
- 分页请求必须携带非空 `requestId`，服务端原样回显；客户端只接受当前 pending 代际且筛选、搜索、offset、limit 全部一致的回包，缺少身份、旧代际或坐标不一致的回包都不得覆盖当前视图。
- 客户端发送的 `knownRevision` 是版本下界：服务端运行态和客户端接收的分页都不得低于该版本。背包增量推进 revision 时，应取消旧 pending 并按新版本重新请求。
- 翻页期间保留最后一份已接受页面，只把分页按钮局部置为 loading，不能退回本地第一页或允许连续点击堆积请求。本地发包门禁拒绝或请求超时必须解除 pending，避免面板永久锁死。

## 来源资产事务

- 地面拾取和容器领取会把来源剩余状态与玩家背包写入同一 durable transaction；失败回滚使用来源 revision/精确逆操作，不覆盖等待数据库期间发生的其他掉落或容器变化。
- 玩家主动丢弃会把背包扣除与地面物品行作为同一事务提交；COMMIT 回包不确定时保持玩家与来源分域锁，数据库恢复可读后重新进入带 operation 身份校验的幂等入口，禁止直接恢复成提交前背包或地面状态。
- 每次玩家丢弃意图必须生成独立的 Durable Operation ID；同一事务内部重试复用该 ID，不得用可在重连后重复的背包 revision 或物品实例 ID 组合推导操作身份。
- 实例普通 flush 与来源资产事务共用分域串行器和 revision token；IO 期间出现的新变化继续保留 dirty，不能被旧快照回标为已持久化。
- 普通物品使用可能在同一同步操作内同时改变 `inventory`、`vitals`、`buff`、`progression`、`attr` 等多个玩家业务域。各域仍以独立瘦 payload 暂存到 `player_flush_ledger`，但消费额度和 claim 必须按 `playerId` 计算：任一投影到期后，同一玩家本轮其他待刷投影（包括仍处于 coalesce 延迟的投影）由同一个 worker 一并认领，未知/历史非投影域不得混入该组。
- 同一玩家已认领的业务投影必须在一个数据库事务内写入；每个域独立比较自己的 recovery watermark，旧域只跳过自身，不得阻断同批其他新域。任一域 SQL 或空覆盖校验失败时整批回滚并按玩家组重试，禁止降级为逐域提交；事务内发现 session fence 已被新会话取代时整批不写，并按 stale-safe 收敛。事务提交后才确认 ledger；确认丢失时允许重放，并由逐域 watermark 安全吸收。
- 来源资产事务必须同时校验当前 `assigned_node_id + lease_token + ownership_epoch`；缺少精确 lease token、epoch 不一致或租约已失效时整笔拒绝，不能只凭节点名或旧 epoch 修改实例资产。
- 地面或容器来源后态提交时，必须在同一数据库事务内以更高版本替换对应 `instance_flush_ledger` payload：新 payload 既包含本次来源后态，也累计同域其他尚未刷盘的脏地块或容器；事务提交会清除旧 claim，但不得清掉这些无关 dirty。
- ground/container worker 在实例 advisory lock 内写真源前，必须再次核对 `ownership_epoch + latest_version + claimed_by + fencing_token` 的精确 claim，且 `claim_until` 尚未过期。已被 durable transaction 取代的旧 payload 只能 no-op，随后旧 ack 也必须失败；当前累计 payload 则可继续回放并在成功后推进 `flushed_version`。
- 拾取成功、部分拿取、失败和 COMMIT 结果确认中的玩家通知都必须携带结构化 key 与变量；服务端纯文本只作为旧客户端和日志 fallback，客户端负责最终文案拼接。

## 物品使用逻辑

- consumable: 检查冷却 → 消耗 → 触发效果（heal/buff/qi恢复）
  - `healAmount`: 固定气血瞬回。
  - `healPercent`: 按玩家当前最大气血比例瞬回。
  - `baselineHealPercent`: 按物品 `level` 对应标准玩家最大气血比例瞬回；配置保留百分比，运行时按 `player-final-attr-baselines.json` 计算实际数值。
  - `qiPercent`: 按玩家当前最大真气比例瞬回。
  - `baselineQiPercent`: 按物品 `level` 对应标准玩家最大灵力比例瞬回；配置保留百分比，运行时按 `player-final-attr-baselines.json` 计算实际数值。
- skill_book: 检查学习条件 → 消耗 → 学习功法/技能
- 地图解锁道具与复活点绑定道具属于持久效果资产操作：事务内必须同时校验玩家 session fence 与来源快照，共同提交背包后态、`map_unlock` 或 `world_anchor` 真源、recovery watermark、outbox 和双资产审计。数据库提交确认后才能替换运行态背包并应用效果；生产环境 durable 服务不可用时失败关闭。
- 持久效果道具消耗背包最后一件非锁定物品时，只有数据库内唯一候选行的 `itemInstanceId/itemId/count/rawPayload` 与本次消耗快照精确一致才允许显式清空；不能为了支持合法空背包而撤掉通用空覆盖保护。
- 玩家主动使用、丢弃、摧毁、装备、布阵、强化、市场上架等资产操作必须以 `itemInstanceId` 定位背包目标；背包数组顺序和 UI 格子只用于展示、排序和面板 patch。
- 灵根种子、碎灵丹和高境界功法书等特殊使用确认如果展示道基、境界经验、天关重抽次数或学习难度，弹窗失效键必须包含对应玩家上下文 revision；玩家状态增量到达后必须局部刷新确认内容，不能继续展示旧成本。普通数量输入不依赖这些状态，不应因无关增量重建或丢失未完成草稿。
- 自动用药: 背包前 12 格内的消耗品可被自动战斗系统使用
- 恢复药效果: 当前恢复丹药统一为基准瞬回 + 120 息自动恢复提升；恢复气血和恢复灵力分别使用 `hp` / `qi` 两组通用冷却，当前恢复药配置为 60 息，同组 60 息内只能服用一枚。
- 恢复药共享冷却由服务端权威计时，并随玩家 Buff 真源持久化；断线重连、进程重启、死亡复生和遁返都不能清除尚未结束的冷却。`inventory.cooldowns` 只是按当前背包条目与权威计时派生的客户端投影，不是恢复真源。

## 功德权益消耗品

源文件:

- `packages/shared/src/activity-types.ts`
- `packages/server/src/runtime/world/world-runtime-use-item.service.ts`
- `packages/server/src/persistence/activity-persistence.service.ts`

### 功德月卡

- 物品 ID：`merit_month_card`
- 使用行为：`activate_merit_month_card`
- 每次使用为功德月卡总池增加 3000 功德，并把领取时间重置为 30 天
- 批量使用时按数量叠加新增功德
- 道具扣除与月卡权益表更新必须经过同一个 durable operation：事务内同时校验玩家 session fence、写入背包真源、月卡总池、recovery watermark、outbox 与资产审计；事务确认后才替换运行态背包，失败不得先扣道具或用内存补发回滚。

### 永恒

- 物品 ID：`merit_eternal`
- 使用行为：`activate_merit_eternal`
- 每次使用为功德月卡总池增加 90000 功德，并把领取时间重置为 30 天
- 激活后永久拥有功德月卡权益：月卡每日领取、每日签到固定池加成、天道商店折扣、离线挂机保留权益
- 每次使用使每日签到固定池增加 1000 功德；后续新增签到加成应继续扩展随机池或固定池，不应把最终签到奖励写死在领取逻辑中
- 天道商店所有物品按 9 折结算
- 只要玩家未被击杀，离线挂机不会因时长耗尽从“离线挂机”转为“离线”
- 永恒道具扣除、总池/固定池增加及永久权益开关必须与背包真源同事务提交；相同 operation 精确重放不得重复叠加权益。

### 活动奖励资产结算

- 功德月卡每日领取、每日签到和邀请奖励领取都必须把“来源记录置为已领取”与功德/灵石背包后态放入同一个 durable operation。
- 结算前可以读取活动状态规划奖励，但事务内必须重新锁定并校验奖励快照；池余额、签到状态或邀请达标行已经变化时整笔回滚并要求重试，不能按旧快照发放。
- 活动 durable operation 必须同时写 inventory 与 activity 两类资产审计。数据库提交确认前不得修改运行态背包；生产环境 durable 服务不可用时失败关闭。
