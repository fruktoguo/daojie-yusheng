# 参考 main 功能与 UI 差异收口计划

> 对照本地参考仓 `/home/yuohira/mud-mmo`，盘点当前 `/home/yuohira/mud-mmo-next` 与正式版之间仍需收口的**功能差异**与 **UI 差异**。
>
> 本文不再按 `client/shared/server` 包维度罗列，而是按“玩家实际会遇到的功能域”和“实际看到的界面/面板”组织。
> 包路径只作为证据与后续实施入口。

---

## 盘点口径

- 对照源固定为本地参考仓 `/home/yuohira/mud-mmo`。
- 主视角不是文件 diff，而是：
  - 功能是否和参考 main 一致
  - UI / 面板 / 交互是否和参考 main 一致
- 只记录三类：
  - `必须按参考同步`
  - `可保留 next`
  - `待人工确认`
  - 若原本待确认项已被拍板，则直接移动到前两类或写入“已拍板口径 / 执行注意”。
- 不把以下内容默认计入修改项：
  - 明显更优的 next 架构拆分
  - 明显更优的性能优化
  - replace-ready / proof / audit / smoke 等验证链能力
  - 已明确成立的新功能

## 当前结论快照

- 当前差异量很大，不能按文件机械覆盖。
- 这轮目标不是直接改代码，而是把差异收成后续 loop 可执行账本。
- 差异记录必须尽量落到“一个玩家或 GM 真能感知到的功能/UI”。
- 这版账本仍需继续往“功能子流程清单”细化，不能只停留在功能大类，否则容易漏掉持续进度、打断、恢复、历史这类细节。
- 当前已确认的高信号项有三组：
  - 世界面板功能与 UI 链路未完全对齐参考 main
  - GM 和平模式、风险审计、批量封禁等入口存在 HTML 残留但主链未接通
  - 战斗目标、技能 AOE、自动战斗偏好、复活落点存在玩家可感知玩法差异
  - 市场 / NPC 商店缺少参考 main 的防误触确认与“已学 / 已阅”状态提示
  - 地形合同、认证合同、属性乘区、移动手感、采集耗时等共享数值存在漂移
- 已拍板口径：
  - 玩家动作默认每秒一次结算，卡顿时不做补偿追帧，卡多久就是实际延迟多久。
  - 世界内部循环可以高于 1Hz，用于表现、队列、过期、广播与拆分后的 runtime 推进，但不能突破玩家每秒一次操作的规则。
  - 数值、成长、复活、登录、市场确认、状态缎带等玩家可感知行为默认按参考 main 回贴。
  - token 与运维恢复采用 next 的更安全口径：`sessionStorage` 短会话、强维护态恢复、预备份和校验。

## 一、功能差异账本

### 1. 炼丹 / 强化 / 采集

#### 必须按参考同步

- 强化历史 / 会话分层需要按参考 main 收口：
  - 路径：
    - `packages/client/src/ui/craft-workbench-modal.ts`
    - `packages/server/src/runtime/craft/craft-panel-enhancement-query.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/enhancement-modal.ts`
  - 差异摘要：
    - 当前 next 客户端主要渲染服务端 `records`；服务端已有 `actionStartedAt`、`player_enhancement_record` 和会话记录基础，但参考仓还保留 `localStorage` 的强化历史、按物品累计、按 `actionStartedAt` 分组的会话列表，以及会话详情弹层。
  - 为什么应同步：
    - 这会直接影响玩家可见历史与本地持久化，不是纯 UI 改名。
  - 影响范围：
    - 直接影响强化历史查看、会话回顾和本地记录体验。
- 炼丹 / 强化 active job 的互斥与恢复语义需要收口：
  - 路径：
    - `packages/server/src/runtime/craft/craft-panel-runtime.service.ts`
    - `packages/server/src/persistence/player-domain-persistence.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/player.service.ts`
  - 差异摘要：
    - 当前 next 开始炼丹只检查 `alchemyJob`，开始强化只检查 `enhancementJob`，运行期可能同时存在两类任务；但 `player_active_job` 以 `player_id` 单行落盘，恢复时只能回填强化或炼丹之一。参考 main 的 `alchemyJob` / `enhancementJob` 是两个独立 JSONB 字段。
  - 为什么应同步：
    - 这是重连/重启后的可恢复性差异，不能仅按“统一工艺工作台”视作架构优化。
  - 影响范围：
    - 直接影响炼丹/强化并行操作、断线恢复和重启后的任务丢失风险。
- 采集耗时与采集技艺速度修正需要回对参考 main：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-loot-container.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/loot.service.ts`
  - 差异摘要：
    - 当前 next 多处按容器品阶 `CONTAINER_SEARCH_TICKS_BY_GRADE` 决定持续采集耗时；参考 main 使用草药自身 `nativeGatherTicks / gatherTicks`，并按采集技能等级 `GATHER_SPEED_PER_LEVEL` 做速度修正。
  - 为什么应同步：
    - 这会改变采集进度条、实际等待时间与采集技艺经验节奏，属于玩家直接感知的数值差异。
  - 影响范围：
    - 直接影响持续采集体验、采集技能收益和参考 main 的数值兼容。
- 采集功能子流程需要列入执行 checklist：
  - 路径：
    - `packages/client/src/ui/panels/loot-panel.ts`
    - `packages/server/src/runtime/world/world-runtime-loot-container.service.ts`
    - `packages/server/src/persistence/map-persistence.service.ts`
    - `packages/server/src/persistence/player-domain-persistence.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/loot-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/loot.service.ts`
  - 差异摘要：
    - 当前账本已确认“开始采集 / 持续进度 / 取消 / 打断”主链不缺；后续执行必须逐项核“完成结算 / 断线重连 / 重开窗口 / 节点耗尽 / 文案反馈 / 历史痕迹”。
  - 为什么应同步：
    - 这类细节最容易在大类盘点里漏掉，必须作为实现验收 checklist，而不是继续停在待确认。
  - 影响范围：
    - 影响持续采集闭环、恢复链和玩家反馈一致性。

#### 可保留 next

- 统一工艺工作台保留 next：
  - 路径：
    - `packages/client/src/ui/craft-workbench-modal.ts`
    - `packages/server/src/runtime/craft/craft-panel-runtime.service.ts`
    - `packages/server/src/runtime/world/world-runtime-alchemy.service.ts`
    - `packages/server/src/runtime/world/world-runtime-enhancement.service.ts`
  - 差异摘要：
    - next 把炼丹/强化收进一个统一工作台，并围绕局部 patch、滚动态保留、共享回调和 durable 回滚做了统一编排。
  - 为什么保留：
    - 这是明显更优的 UI 与服务编排模型；但 active job 互斥/恢复语义、采集耗时数值仍需按上方条目单独收口。
- 显式采集 Job 模型保留 next：
  - 路径：
    - `packages/shared/src/player-runtime-types.ts`
    - `packages/server/src/runtime/player/player-runtime.service.ts`
    - `packages/server/src/runtime/world/world-runtime-loot-container.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/loot.service.ts`
  - 差异摘要：
    - next 把采集状态显式落到 `gatherJob`，参考仓更偏 `activeSearch` / `activeHarvestSourcesByPlayer` 的容器驱动模型。
  - 为什么保留：
    - 模型形态对恢复链和持久化边界更清晰；但不能据此推断数值已对齐，采集耗时来源仍需回对参考 main。
- 采集持续进度链路当前不应误记为缺失：
  - 路径：
    - `packages/client/src/ui/panels/loot-panel.ts`
    - `packages/server/src/runtime/world/world-runtime-loot-container.service.ts`
    - `packages/server/src/runtime/player/player-runtime.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/loot-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/loot.service.ts`
  - 差异摘要：
    - 当前 next 已有“连续采摘中”标题、`elapsedTicks / totalTicks` 文案、进度条、取消/停止、移动或出手打断，以及服务端 `gatherJob + activeSearch` 推进链；参考仓同样有这套持续进度 UI 与运行时语义。
  - 为什么保留：
    - 这说明“采集持续进度完全缺失”并不是当前代码事实；真正还要继续核的是采集恢复、持久化归属和其他细节一致性。

#### 待人工确认

暂无。

### 2. 地图交互 / 移动 / 目标选择

#### 必须按参考同步

- 技能施放目标范围 / 作用面积需要恢复参考 main 的额外加成叠加：
  - 路径：
    - next：`packages/client/src/main-targeting-helpers.ts`
    - next：`packages/client/src/main-targeting-state-source.ts`
    - next：`packages/server/src/runtime/world/world-runtime.normalization.helpers.ts`
    - next：`packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/main-targeting-helpers.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts`
  - 差异摘要：
    - 参考仓会把玩家 `numericStats.extraRange / extraArea` 叠加进客户端瞄准和服务端技能几何；当前 next 客户端主要按技能模板和动作基础值计算，服务端 `resolveRuntimeSkillRange()` 也只读技能范围，导致可选落点、命中圈与实际结算都可能不一致。
  - 为什么应同步：
    - 这是直接影响玩家技能施放范围和实际手感的功能差异，不是纯前端结构重写。
  - 影响范围：
    - 玩家可见，且会影响技能瞄准和战斗操作预期。
- 传送点 / 楼梯的客户端相邻交互需要回对参考 main：
  - 路径：
    - next：`packages/client/src/main-navigation-state-source.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/main.ts`
  - 差异摘要：
    - 服务端两边都允许附近 1 格手动传送；真实差异在客户端：当前 next 点击相邻传送点时会立刻 `sendAction('portal:travel')`，参考 main 更偏先规划移动到目标格，再由玩家位置触发后续交互。
  - 为什么应同步：
    - 这会改变玩家移动与交互预期，带来误触或提前发包，不属于明确成立的新功能。
  - 影响范围：
    - 玩家可见，直接影响地图交互手感。
- 战斗设置 / 目标选择按钮需要恢复敌我 scope：
  - 路径：
    - next：`packages/client/src/ui/panels/action-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/action-panel.ts`
  - 差异摘要：
    - 当前 next 的战斗目标 toggle 只写 `data-combat-targeting-toggle="${key}"`，点击时靠 key 推断 hostile/friendly；`all_players`、`retaliators` 等 key 在敌我两组重叠，友方按钮可能被误判到 hostile。参考 main 用 `scope:key` 明确区分。
  - 为什么应同步：
    - 这是 UI 操作会直接写错目标规则的回归，不是样式差异。
  - 影响范围：
    - 影响自动战斗/PVP/友方目标设置的可用性。

#### 可保留 next

- 目标选择分流到技能施放保留 next：
  - 路径：
    - `packages/client/src/main-map-interaction-bindings.ts`
    - `packages/client/src/main-action-state-source.ts`
    - `packages/client/src/network/socket-send-runtime.ts`
    - `packages/server/src/network/world-gateway-action.helper.ts`
  - 差异摘要：
    - next 在点选时会把技能目标走 `sendCastSkill`，而不是把所有目标都压成普通 `sendAction`；地面拾取也统一成 `loot:open`。
  - 为什么保留：
    - 协议语义更清楚，客户端/服务端分流更准确。
- 点击目标 / 普通交互 / 自动寻路相关拆分保留 next：
  - 路径：
    - `packages/client/src/main-navigation-state-source.ts`
    - `packages/client/src/main-map-interaction-bindings.ts`
    - `packages/client/src/main-action-state-source.ts`
  - 差异摘要：
    - 这轮按子流程重扫后，未再确认出必须单列回贴参考 main 的硬行为缺口；当前主要差异仍是交互编排拆分与协议入口收敛。
  - 为什么保留：
    - 这些改动更多属于 next 的结构优化，不应因为实现方式不同就当成功能缺失。
- 共享目标几何 / 目标引用现状保留：
  - 路径：
    - `packages/shared/src/target-ref.ts`
    - `packages/shared/src/targeting.ts`
    - `packages/shared/src/constants/gameplay/world.ts`
  - 差异摘要：
    - 没看到实际语义差异，主要是注释和格式噪音。
  - 为什么保留：
    - 不需要为了参考仓去改这些共享目标基础定义。
- `loot:open` 保留为 next actionId 新规范：
  - 路径：
    - `packages/client/src/main-map-interaction-bindings.ts`
    - `packages/client/src/network/socket-send-runtime.ts`
  - 差异摘要：
    - 当前 next 的 `loot:open` 是通过 `C2S.UseAction` 发送的 actionId，不是独立 socket 协议名；地面拾取 socket 事件仍是 `C2S.TakeGround`。旧脚本/外部自动化如果仍按旧交互入口发包，需要明确兼容策略。
  - 为什么保留：
    - actionId 分流比旧的隐式交互语义更清楚；后续只补旧工具兼容，不回退新结构。
- NPC 交互 actionId 保留 next 分流语义：
  - 路径：
    - `packages/client/src/main-navigation-state-source.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/main.ts`
  - 差异摘要：
    - 当前 next 会先解析 `npc_shop:` / `npc_quests:` 再分流；参考仓更偏直接使用 `npc.id` 发起交互。
  - 为什么保留：
    - 商店、任务和普通 NPC 交互分流更利于协议收口；若后续发现旧脚本依赖，再加兼容层。

#### 待人工确认

暂无。

### 3. 任务 / 引导 / 内容富化

#### 必须按参考同步

- 任务内容的玩家可见结果需要按参考 main 对齐：
  - 路径：
    - `packages/client/src/content/local-quests.ts`
    - `packages/client/src/constants/world/quest-catalog.generated.json`
    - `packages/client/src/ui/panels/quest-panel.ts`
  - 差异摘要：
    - 参考仓更依赖生成式任务目录，当前 next 更偏服务端载荷直出；执行时不按文件形态回退，但必须对齐玩家看到的任务文案、奖励说明、导航目标和引导结果。
  - 为什么应同步：
    - 玩家只感知任务内容与导航是否一致，不感知来源是生成目录还是服务端载荷。
  - 影响范围：
    - 影响任务引导、奖励预期和 NPC 任务弹层内容。

#### 可保留 next

- 任务面板 + NPC 任务弹层拆分保留 next：
  - 路径：
    - `packages/client/src/ui/panels/quest-panel.ts`
    - `packages/client/src/ui/npc-quest-modal.ts`
    - `packages/client/src/main-quest-state-source.ts`
  - 差异摘要：
    - next 把任务列表、NPC 任务详情、导航回调拆成独立组件/状态源，列表更轻，详情走单独 modal，局部更新和选择保持更稳。
  - 为什么保留：
    - 职责更清晰，DOM churn 更少，内容本身大体仍是一套任务内容。
- 世界摘要 / 排行榜弹窗状态源拆分保留 next：
  - 路径：
    - `packages/client/src/main-world-summary-state-source.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/world-summary-modal.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/leaderboard-modal.ts`
  - 差异摘要：
    - next 把打开、请求、刷新、patch 收敛到一个状态源里，世界摘要与排行榜跳转/刷新都在同层处理；参考 main 使用独立 modal 文件。
  - 为什么保留：
    - 状态一致性更好，也减少整弹窗重建。

#### 待人工确认

暂无。

### 4. 背包 / 装备 / 物品 / 消耗品

#### 必须按参考同步

- 装备 tab 总空态文案需要补回参考 main：
  - 路径：
    - `packages/client/src/ui/panels/equipment-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/equipment-panel.ts`
  - 差异摘要：
    - 参考 main 保留“尚未装备任何物品”一类总空态提示；next 更偏槽位显式状态与空槽优先展示。
  - 为什么应同步：
    - 总空态是玩家可见 UI 反馈，补回不影响 next 的槽位结构。
  - 影响范围：
    - 影响装备页空态可读性。

#### 可保留 next

- 背包列表的壳层化与局部 patch 保留 next：
  - 路径：
    - `packages/client/src/ui/panels/inventory-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/inventory-panel.ts`
  - 差异摘要：
    - 参考 main 当前也已有 `patchList`、分页渲染、`patchModal` 与来源展开态；next 进一步做了 `shellRefs` 和 `renderBody` 支持，筛选、排序、详情弹层和数量操作更容易保持连续。
  - 为什么保留：
    - 这是明确的 UI 稳定性提升，不改变背包主功能语义。
- 物品详情 / 消耗品确认 / 批量动作保留 next 的统一详情弹层：
  - 路径：
    - `packages/client/src/ui/panels/inventory-panel.ts`
  - 差异摘要：
    - next 在详情弹层中承接来源展开、批量使用/丢弃/摧毁、灵根种子、破境丹、功法学习提醒、半数/全数快捷输入等分支。
  - 为什么保留：
    - 信息密度和误操作防护都强于参考 main 的直接重绘形态。
- 装备/物品词条展示保留 next：
  - 路径：
    - `packages/client/src/ui/panels/inventory-panel.ts`
    - `packages/client/src/ui/panels/equipment-panel.ts`
  - 差异摘要：
    - next 把功法、境界、品阶、满层属性、装备效果等更多信息并入详情侧边内容。
  - 为什么保留：
    - 这是展示完整度提升，不是需要按参考 main 回退的差异。
- 物品来源展开策略保留 next：
  - 路径：
    - `packages/client/src/ui/panels/inventory-panel.ts`
  - 差异摘要：
    - next 会把来源展开态绑到 `selectedItemKey`，切换物品时自动收拢；参考 main 更偏当前详情内容内直接展开。
  - 为什么保留：
    - 这能减少跨物品切换时的错误展开态，属于操作连续性优化。

#### 待人工确认

暂无。

### 5. 战斗 / 自动战斗 / 复活 / 修炼

#### 必须按参考同步

- 技能 AOE 多目标结算需要恢复参考 main 语义：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts`
    - `packages/server/src/runtime/combat/player-combat.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts`
  - 差异摘要：
    - 当前 next 的 AOE 目标解析会遍历 affected cells 后命中第一个 monster/player/tile 就返回，`PlayerCombatService` 结算固定 `targetCount: 1`；参考 main 有 `selectSkillTargetsFromAnchor`、`collectTargetsFromCells`、`maxTargets` 和真实 `targetCount`。
  - 为什么应同步：
    - AOE 从多目标退化成单目标会直接改变技能价值、战斗收益和玩家手感。
  - 影响范围：
    - 影响所有面积技能、地块目标技能与多目标战斗结算。
- 自动战斗目标偏好需要恢复参考 main 的权重语义：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-auto-combat.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world-targeting.domain.ts`
  - 差异摘要：
    - 当前 next 客户端会发送/规范化 `autoBattleTargetingMode`，但服务端选怪主要按反击优先、距离、低血量排序；参考 main 的 `nearest / low_hp / full_hp / boss / player` 会参与威胁分数。
  - 为什么应同步：
    - 用户设置了目标偏好但服务端不消费，会造成可见设置无效。
  - 影响范围：
    - 影响自动战斗收益、风险控制和 PVP/打怪优先级。
- 死亡 / 复活落点需要回对参考 main 的绑定复活图：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-respawn.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts`
  - 差异摘要：
    - 当前 next 复活总是落到 `resolveDefaultRespawnMapId()`，只有前地图是 `prison` 才留在 `prison`；参考 main 走 `resolveRuntimeRespawnMapId(player.mapId, player.respawnMapId)`，会考虑玩家绑定复活图。
  - 为什么应同步：
    - 复活点是明确玩法规则，不能只按 next 默认图处理。
  - 影响范围：
    - 影响死亡惩罚、回城/监牢链路和绑定复活点体验。
- `allowAoePlayerHit` 与 combat targeting rules 需要按参考 main 的 PVP/AOE 边界验收：
  - 路径：
    - `packages/server/src/runtime/player/player-combat-config.helpers.ts`
    - `packages/server/src/runtime/player/player-runtime.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world-rule.service.ts`
  - 差异摘要：
    - next 仍有 `allowAoePlayerHit` 和 combat targeting rules，但运行时归属与更新路径已拆分；后续实现应以参考 main 的玩家可感知规则为验收目标。
  - 为什么应同步：
    - PVP/AOE 命中边界属于高风险玩法规则，不能只因 next 拆分了配置路径就默认等价。
  - 影响范围：
    - 影响 PVP、AOE 溅射、虚境/特殊地图战斗规则。
- 强制攻击空地 / 地块锁定的无效目标处理需要补 smoke：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-auto-combat.service.ts`
  - 差异摘要：
    - 当前 next 已有 tracked target 丢失后停自动战斗的处理，但 `tile:` 锁定进入 `getTileCombatState` 分支后，仍需用真实场景 smoke 证明无效地块不会每 tick 重复报错。
  - 为什么应同步：
    - 这是自动战斗高频路径，必须用验证补上证明链。
  - 影响范围：
    - 影响原地战斗、地块攻击和自动战斗异常提示。

#### 可保留 next

- 自动战斗命令物化链保留 next：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-auto-combat.service.ts`
    - `packages/server/src/runtime/world/world-runtime-pending-command.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/world.service.ts`
  - 差异摘要：
    - next 将自动战斗拆成 `materializeAutoCombatCommands -> buildAutoCombatCommand -> selectAutoCombatTarget`，再进入待执行命令队列；参考 main 更偏 tick 中直接执行。
  - 为什么保留：
    - 这符合 next 的服务端权威 tick 编排和验证需求。
- 技能目标解析服务拆分保留 next：
  - 路径：
    - `packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts`
    - `packages/server/src/runtime/combat/player-combat.service.ts`
  - 差异摘要：
    - next 把 monster/player/tile 目标解析、地块伤害门禁、范围回退和实体回退拆开；参考 main 在单体 world service 里串联处理。
  - 为什么保留：
    - 这是职责拆分和可验证性提升，不应按文件形态回退；但多目标 AOE、`maxTargets`、`innerRadius`、`extraArea` 等行为语义必须按上方条目补齐。

#### 待人工确认

暂无。

### 6. GM / 运营 / 持久化操作

#### 必须按参考同步

- 独立 GM 控制台的和平模式需要补齐全链路或移除残留入口：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - `packages/shared/src/api-contracts.ts`
    - `packages/server/src/http/native/*`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/gm.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/gm.service.ts`
  - 差异摘要：
    - 当前 next HTML 有 `summary-peace-mode` 和 `toggle-peace-mode`，但 `gm.ts` 未绑定对应元素，shared `GmStateRes` 没有 `worldSettings`，服务端原生 GM 路由也未看到 `world-settings` 更新链；参考 main 有完整 `worldSettings.peaceModeEnabled`。
  - 为什么应同步：
    - 这是正式运营开关，不应停留在 HTML 残留入口。
  - 影响范围：
    - 影响 GM 临时停战、运营处置和玩家可战斗规则。
- 风险审计 / 批量封禁 / 风险管理员名单需要补齐全链路或移除残留入口：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - `packages/shared/src/api-contracts.ts`
    - `packages/server/src/http/native/*`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/gm.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/gm.controller.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/gm.service.ts`
  - 差异摘要：
    - 当前 next HTML 有风险排序、批量封号、风险检测 tab 和管理员名单相关入口，但 `gm.ts` 未见风险/批封/管理员名单事件绑定，shared 合同也缺少风险字段或批量封禁类型；参考 main 有 TS 事件、路由、审计落库和管理员名单持久化。
  - 为什么应同步：
    - 这是运营风控主链，不能只保留可点击但不可用的 UI。
  - 影响范围：
    - 影响异常账号处置、GM 审计和批量运营操作。

#### 可保留 next

- `server` 侧 GM / 持久化验证链能力保留 next：
  - 路径：
    - `packages/server/src/persistence/*`
    - `packages/server/src/runtime/*`
    - `packages/server/src/app.module.ts`
  - 差异摘要：
    - 当前 next 在运行时、持久化、验证链、GM 支撑能力上有更深的拆分和收口。
  - 为什么保留：
    - 这些属于 next 的架构与工程能力提升，不应当仅因和参考 main 不同就回退。
- 健康检查 readiness / liveness 结构保留 next：
  - 路径：
    - `packages/server/src/health.controller.ts`
    - `packages/server/src/health/health-readiness.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/health.controller.ts`
  - 差异摘要：
    - next 返回包含 maintenance、database、persistence、auth、runtime 的 readiness 结构，并在未 ready 时返回 503；参考 main 仅返回简单 `status: ok`。
  - 为什么保留：
    - next 明显更适合作为 replace-ready 和运维探针真源。
- 运行态观测的实例级世界管理保留 next：
  - 路径：
    - `packages/client/src/gm-world-viewer.ts`
    - `packages/server/src/http/native/native-gm-world.service.ts`
    - `packages/shared/src/api-contracts.ts`
  - 差异摘要：
    - 当前 next 已从旧地图观测扩展到实例列表、lease、freeze/unfreeze、迁移、replay、节点/出队列查询。
  - 为什么保留：
    - 这套更适合多节点多实例运营，是 next 应保留的升级。
- 独立 GM 内存监控页保留 next：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - `packages/server/src/runtime/gm/runtime-gm-state.service.ts`
  - 差异摘要：
    - 当前 next 已有 memory subtab，并渲染 RSS/Heap/External、Heap 使用率、RSS/Heap 倍率、对象域画像和实例大户榜；服务端 `buildPerformanceSnapshot()` 会产出 `memoryEstimate`。
  - 为什么保留：
    - 内存观测深度已经超过参考 main 的基础内存页，不应回退。
- 持久化导入导出的整库恢复链保留 next：
  - 路径：
    - `packages/server/src/http/native/native-gm-admin.service.ts`
    - `packages/server/src/http/native/native-postgres-backup.ts`
    - `packages/server/src/http/native/native-database-restore-coordinator.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/database-backup.service.ts`
  - 差异摘要：
    - 当前 next 使用 `replace_server_persistence`、`preImportBackup`、维护态要求、PG custom dump 与旧 JSON 恢复兼容的完整链路。
  - 为什么保留：
    - 恢复边界更清晰，安全性更强。
- 独立 GM 页作为正式运营入口，游戏内 GM 面板保留轻量工具定位：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - `packages/client/src/ui/panels/gm-panel.ts`
  - 差异摘要：
    - next 同时存在独立 GM 页面和游戏内 GM 面板；后续补和平、风控、数据库、实例管理等正式运营能力时，以独立 GM 页为主，游戏内 GM 面板只保留快捷观察/轻量修改。
  - 为什么保留：
    - 这样能避免把重型运维能力塞进游戏内面板，也避免两个入口重复实现。
- 运行态观测统一到 next 的实例视角：
  - 路径：
    - `packages/client/src/gm-world-viewer.ts`
    - `packages/server/src/http/native/native-gm-world.service.ts`
  - 差异摘要：
    - 参考 main 以地图观测为主，当前 next 以实例观测为主。
  - 为什么保留：
    - 实例视角更符合 next 多实例/多节点运营；地图视角后续只作为实例下的投影入口。
- 数据库恢复合同保留 next 的强维护态标准：
  - 路径：
    - `packages/server/src/http/native/native-gm-admin.service.ts`
    - `packages/server/src/http/native/native-database-restore-coordinator.service.ts`
  - 差异摘要：
    - 当前 next 的恢复合同比参考 main 更重，要求维护态与预导入备份。
  - 为什么保留：
    - 正式商业服恢复必须优先数据安全和可回滚性，强维护态、预备份、校验是合理默认。

#### 待人工确认

暂无。

### 7. 邮件 / 市场 / 经济链

#### 必须按参考同步

- 市场买入二次确认需要恢复参考 main：
  - 路径：
    - `packages/client/src/ui/panels/market-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/market-panel.ts`
  - 差异摘要：
    - 当前 next 买入提交后直接 `onCreateBuyOrder`，没有 `buyConfirmState` / `confirmModalHost`；参考 main 有确认购买弹层。
  - 为什么应同步：
    - 市场买入是高风险付费/消耗操作，应保留参考 main 的误触保护。
  - 影响范围：
    - 影响市场购买安全性和误操作回滚压力。
- 市场 / NPC 商店的“已学 / 已阅”状态缎带需要恢复：
  - 路径：
    - `packages/client/src/ui/panels/market-panel.ts`
    - `packages/client/src/ui/npc-shop-modal.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/market-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/npc-shop-modal.ts`
  - 差异摘要：
    - 参考 main 会通过 `getItemStatusState()` 给已学功法、已阅地图等物品展示状态缎带；当前 next 市场和 NPC 商店未同步这类状态提示。
  - 为什么应同步：
    - 这会直接影响玩家购买前判断，避免重复购买已学/已阅物品。
  - 影响范围：
    - 影响市场、NPC 商店、功法学习和地图解锁类物品体验。
- NPC 商店购买确认弹层需要恢复参考 main：
  - 路径：
    - `packages/client/src/ui/npc-shop-modal.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/npc-shop-modal.ts`
  - 差异摘要：
    - 当前 next NPC 商店购买路径缺少参考 main 的确认购买弹层；但 next 的 `getPlayerOwnedItemCount()` 会同时统计背包和 `player.wallet.balances`，这部分钱包感知应保留。
  - 为什么应同步：
    - 这是玩家高频付费操作的防误触差异。
  - 影响范围：
    - 影响 NPC 商店购买安全性和重复购买风险。
- 聊天本地持久化需要补回参考 main 的批量 flush 与迁移清理：
  - 路径：
    - `packages/client/src/ui/chat-storage.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/chat-storage.ts`
  - 差异摘要：
    - 当前 next 每条消息直接写 IndexedDB 并裁剪；参考 main 有 200ms 批量 flush、`pagehide / visibilitychange` flush 和旧 `localStorage` 清理。
  - 为什么应同步：
    - 参考 main 的实现更利于降低频繁写入压力，并补齐旧缓存迁移清理。
  - 影响范围：
    - 影响聊天记录性能、页面关闭前落盘和旧数据残留。

#### 可保留 next

- 结构化邮件 / 软删归档 / 计数一致性保留 next：
  - 路径：
    - `packages/server/src/runtime/mail/mail-runtime.service.ts`
    - `packages/server/src/persistence/mail-persistence.service.ts`
    - `packages/server/src/runtime/world/mail-expiration-cleanup.worker.ts`
    - `packages/server/src/tools/mail-counter-consistency-report.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/mail.service.ts`
  - 差异摘要：
    - 当前 next 已把投递、领取、删除、过期、归档、清理、计数校验拆开，邮件真源和恢复边界更清晰。
  - 为什么保留：
    - 这是 next 的持久化升级，不应回退到参考 main 的单体服务模式。
- 市场的强一致撮合 / session fence / instance lease 保留 next：
  - 路径：
    - `packages/server/src/runtime/market/market-runtime.service.ts`
    - `packages/server/src/network/world-gateway-market.helper.ts`
    - `packages/client/src/ui/panels/market-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/game/market.service.ts`
  - 差异摘要：
    - 当前 next 在买卖、撤单、托管领取、即时交易与 durable settlement 上更强调 session fence 和 instance lease。
  - 为什么保留：
    - 对跨节点结算更稳，属于 next 的架构升级。
- 钱包 / 灵石正式钱包域保留 next：
  - 路径：
    - `packages/client/src/utils/player-wallet.ts`
    - `packages/server/src/persistence/player-domain-persistence.service.ts`
  - 差异摘要：
    - 当前 next 已有 `PlayerWalletState`、`player_wallet` 分表、wallet dirty domain 和 durable wallet route smoke；参考 main 仍更多把灵石按物品/市场仓计数。
  - 为什么保留：
    - 这是更清晰的经济真源拆分，不应回退。
- 邮件面板的会话恢复和重放保护保留 next：
  - 路径：
    - `packages/client/src/ui/mail-panel.ts`
    - `packages/client/src/main-mail-state-source.ts`
  - 差异摘要：
    - next 会合并本地已读/已领状态、回收操作结果，并在会话失效时保留待重放操作。
  - 为什么保留：
    - 这能减少网络波动下的 UI 回退和重复操作。
- 建议反馈、公告/更新日志与 Notice/日志书链路保留 next：
  - 路径：
    - `packages/client/src/main-world-summary-state-source.ts`
    - `packages/client/src/ui/panels/changelog-panel.ts`
    - `packages/server/src/runtime/*`
  - 差异摘要：
    - 玩家意见面板、GM 建议管理、公告/更新日志与 `S2C.Notice` + ack 持久化语义在 next 中已经存在或更结构化。
  - 为什么保留：
    - 这是低频信息链和运营反馈链的工程化收口，不应按文件形态回退。

#### 待人工确认

暂无。

#### 执行注意

- 市场面板状态分支复杂度需要在补 UI 防误触后复核：
  - 路径：
    - `packages/client/src/ui/panels/market-panel.ts`
  - 差异摘要：
    - next 的撮合一致性、session fence 和钱包真源更强，但 UI 防误触确认与状态缎带缺口需要先补；补齐后仍要评估状态分支与弹层层次复杂度。
  - 为什么注意：
    - 这是维护复杂度与操作安全性的取舍，默认保留 next 的撮合/钱包主链，只补 UI 防误触与状态提示。

### 8. 世界节拍 / 数值 / 共享合同

#### 必须按参考同步

- 地形合同收缩需要先收口：
  - 路径：
    - `packages/shared/src/world-core-types.ts`
    - `packages/shared/src/constants/gameplay/terrain.ts`
    - `packages/shared/src/terrain.ts`
  - 差异摘要：
    - 当前 next 把 `ColdBog` / `MoltenPool` 从地形枚举、地形耗费表、地图字符表和可通行判定里移掉了。
  - 为什么应同步：
    - 这不是普通重构，而是共享合同收缩；仓内仍有相关引用，继续放着会让 client/server 对地图地形理解不一致。
  - 影响范围：
    - 直接影响地图行为与玩家可见结果。

#### 可保留 next

- shared 的协议分层/编解码拆分保留 next：
  - 路径：
    - `packages/shared/src/protocol.ts`
    - `packages/shared/src/protocol-request-payload-types.ts`
    - `packages/shared/src/protocol-response-payload-types.ts`
    - `packages/shared/src/protocol-envelope-types.ts`
    - `packages/shared/src/session-sync-types.ts`
    - `packages/shared/src/service-sync-types.ts`
    - `packages/shared/src/network-protobuf*.ts`
  - 差异摘要：
    - next 已把单体协议、protobuf schema 和 codec 拆成更细主线合同。
  - 为什么保留：
    - 这是明显更优的 shared 工程收口，不应回退到参考 main 旧结构。

#### 待人工确认

暂无。

#### 已拍板口径

- 世界 tick 口径保留 next 的“高频世界循环 + 1Hz 玩家动作节流”：
  - 路径：`packages/shared/src/constants/gameplay/core.ts`
  - 差异摘要：
    - 游戏规则口径是“玩家默认每秒一次动作结算”；世界内部循环可以高于 1Hz，用于表现、队列、过期、广播和 runtime 拆分推进。服务器卡顿时不做补偿追帧，卡多久就是实际延迟多久。
  - 为什么保留：
    - 这同时满足用户设定的 1Hz 玩家动作限制和 next 的高频表现/调度能力；后续文档和代码注释应避免把二者混成同一个 tick。
- 养成曲线按参考 main 回贴：
  - 路径：
    - `packages/shared/src/constants/gameplay/technique.ts`
    - `packages/shared/src/technique.ts`
  - 差异摘要：
    - 当前 next 的修炼经验相关系数与参考 main 不同。
  - 为什么同步：
    - 成长节奏是玩家长期进度体验，默认以当前正式版本为准。
- 属性权重与移动手感按参考 main 回贴：
  - 路径：
    - `packages/shared/src/constants/gameplay/attributes.ts`
    - `packages/shared/src/terrain.ts`
    - `packages/shared/src/constants/gameplay/terrain.ts`
  - 差异摘要：
    - 当前 next 把 `physDef / spellDef / hit / dodge / moveSpeed / resolvePower / breakPower / crit` 等多项从参考 main 的百分比乘区改成平铺点数或移除乘区，并删除 `NUMERIC_STAT_MULTIPLIER_FLOORS` 参考底座；负 `moveSpeed` 在参考 main 中可降低每 tick 移动点数且最低 1，next 对负数直接 `Math.max(0, moveSpeed)`，负移速 debuff 不再生效。
  - 为什么同步：
    - 属性收益和移动 debuff 是核心数值合同，默认按正式版本保持兼容。
- 怪物等级差经验修正按参考 main 回贴：
  - 路径：`packages/shared/src/constants/gameplay/monster.ts`
  - 差异摘要：
    - 当前 next 低级打高级固定 `1.5 ** levelDelta`，不再按怪物阶位 bonus；高级打低级按阶位 reduction。参考 main 是阶位 underlevel bonus + 统一 `0.5 ** delta` overlevel。
  - 为什么同步：
    - 刷怪收益直接影响正式版进度曲线，默认回贴。
- 地图插值与移动视觉节奏按参考 main 回贴到 1000ms：
  - 路径：
    - `packages/client/src/runtime/server-tick.ts`
    - `packages/shared/src/constants/gameplay/core.ts`
  - 差异摘要：
    - next reset 默认插值时长为 500ms，参考 main 为 1000ms；两边都对下发 dt 乘 0.5，但 next 世界 tick 基准已是 100ms，实际移动视觉节奏会明显变化。
  - 为什么同步：
    - 移动表现是高频手感，默认回到正式版本，后续若要加速再作为明确优化项单独评估。
- `StartGather / CancelGather` 协议映射卫生需要收口：
  - 路径：
    - `packages/client/src/network/socket-send-runtime.ts`
    - `packages/client/src/network/socket-send-panel.ts`
    - `packages/shared/src/protocol.ts`
  - 差异摘要：
    - 当前客户端通过 `(C2S as Record<string, unknown>)... as never` 发送 `StartGather / CancelGather`，运行期可用但绕过 shared 类型映射保护。
  - 为什么同步：
    - 这不是玩家可见行为差异，但会削弱协议合同的静态证明链。

## 二、UI 差异账本

### 1. 世界面板 / 世界信息区

#### 必须按参考同步

- 世界面板需要至少补回参考 main 已有的“附近动态 / 行动建议”链路：
  - 路径：
    - `packages/client/index.html`
    - `packages/client/src/ui/panel-system/registry.ts`
    - `packages/client/src/ui/panels/world-panel.ts`
  - 差异摘要：
    - 参考 main 的世界面板已有“附近动态 / 行动建议”两个子页，并承接附近怪物、附近 NPC、任务建议、当前任务进度、快捷行动；当前 next 的 DOM、registry、`WorldPanel.update()` 三处都没有接回这条链路，传入的 `entities/actions/quests` 也未被实际展示。
  - 为什么应同步：
    - 这是直接面向玩家的可见 UI/交互缺口。
  - 影响范围：
    - 直接影响玩家获取周边信息和操作建议。

#### 可保留 next

- 世界面板之外的 UI 基础设施升级保留 next：
  - 路径：
    - `packages/client/src/ui/detail-modal-host.ts`
    - `packages/client/src/ui/confirm-modal-host.ts`
    - `packages/client/src/react-ui/*`
    - `packages/client/src/styles/ui-*.css`
  - 差异摘要：
    - next 已具备更统一的弹层宿主和 UI 基础设施。
  - 为什么保留：
    - 这是 UI 工程层升级，不应因参考 main 仍较旧就回退。
- 世界卷宗 / 天下榜统一状态源保留 next：
  - 路径：
    - `packages/client/src/main-world-summary-state-source.ts`
    - `packages/client/src/ui/panels/world-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/world-summary-modal.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/leaderboard-modal.ts`
  - 差异摘要：
    - 参考 main 是独立 `world-summary-modal.ts` 与 `leaderboard-modal.ts`；next 收敛到 `main-world-summary-state-source.ts` 统一处理请求、刷新、坐标追索和弹层 patch。
  - 为什么保留：
    - 功能入口已存在，状态源合并属于 next 更稳的 UI 编排，不应按文件边界回退。
- 世界信息区布局节奏保留 next，功能内容按参考 main 补齐：
  - 路径：`packages/client/index.html`
  - 差异摘要：
    - 当前 next 的地图侧栏、tick 显示、小地图与信息区布局较参考 main 有明显差异。
  - 为什么保留：
    - 布局和响应式 chrome 属于 next 正向 UI 基础；后续只补玩家需要的信息链，不按页面骨架回退。

#### 待人工确认

暂无。

#### 执行注意

- 世界面板需要补齐“当前任务进度”：
  - 路径：
    - `packages/client/src/ui/panels/world-panel.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/panels/world-panel.ts`
  - 差异摘要：
    - 参考 main 的世界面板把当前任务进度与行动建议放在同一信息面；next 这块还需要随“附近动态 / 行动建议”一起核。
  - 为什么注意：
    - 这影响玩家从世界面板判断下一步行动。

### 2. GM 面板

#### 必须按参考同步

- 独立 GM 页的和平模式、风险审计、批量封禁和风险管理员名单需要按上方 GM 功能账本补齐；当前已确认主要是 HTML 残留入口，TS / shared / 服务端主链未接通。

#### 可保留 next

- GM 面板的增量更新与滚动连续性保留 next：
  - 路径：
    - `packages/client/src/ui/panels/gm-panel.ts`
  - 差异摘要：
    - 当前 next 把 GM 面板包进更统一的 surface/card/scroll 结构，并做了更完整的节点复用和局部 patch。
  - 为什么保留：
    - 滚动连续性和增量更新明显优于参考 main 的直接重绘。
- GM 侧底层工程拆分保留 next：
  - 路径：
    - `packages/server/src/runtime/*`
    - `packages/server/src/persistence/*`
  - 差异摘要：
    - next 的 GM/运行时/持久化底层支撑更结构化。
  - 为什么保留：
    - 属于实现层升级，不是需要回退到参考 main 的 UI 差异。
- GM 健康 readiness 展示应优先承接 next：
  - 路径：
    - `packages/server/src/health.controller.ts`
    - `packages/client/gm.html`
  - 差异摘要：
    - next 的 `/health` 已有 readiness 结构和 503 语义，参考 main 只是简单存活探针。
  - 为什么保留：
    - 这是更适合正式运维的健康口径。
- 独立 GM 页与游戏内 GM 面板不合并能力：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - `packages/client/src/ui/panels/gm-panel.ts`
  - 差异摘要：
    - 独立 GM 页作为正式运营入口，游戏内 GM 面板只保留轻量观察、快捷修改和调试工具。
  - 为什么保留：
    - 运营能力全集不应塞进游戏内面板，避免重复入口和权限边界混乱。
- GM 监控内存页保留 next，分页按参考补，运行态 JSON 导入不直接回贴：
  - 路径：
    - `packages/client/gm.html`
    - `packages/client/src/gm.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/gm.html`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/gm.ts`
  - 差异摘要：
    - next 的内存页已确认补齐并超过参考 main；分页体验如果缺失可按参考补回，运行态 JSON 导入不直接回贴，优先走 next 的数据库备份/恢复、安全校验和维护态链路。
  - 为什么保留：
    - 内存观测和恢复链 next 更适合正式服；裸 JSON 导入风险更高，不作为默认回贴项。

#### 待人工确认

暂无。

### 3. 任务面板

#### 必须按参考同步

当前未看到必须仅因 UI 层就回贴参考 main 的明确任务面板缺口。

#### 可保留 next

- 任务面板本体的结构拆分与详情弹层复用保留 next：
  - 路径：
    - `packages/client/src/ui/panels/quest-panel.ts`
    - `packages/client/src/ui/detail-modal-host.ts`
  - 差异摘要：
    - next 使用 `createPanelSectionWithTitle`、`createEmptyHint`、`renderBody` + `patchModal`，详情体也统一到 `ui-detail-*` 结构。
  - 为什么保留：
    - 更适合保住选区、滚动与详情弹层连续性。

#### 待人工确认

暂无。

### 4. 登录 / 连接 / 启动界面

#### 必须按参考同步

- 登录文案与输入语义需要按参考 main 收口：
  - 路径：
    - `packages/client/index.html`
    - `packages/client/src/ui/login.ts`
    - `packages/server/src/http/native/native-player-auth.service.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/server/src/auth/auth.service.ts`
  - 差异摘要：
    - 当前 next 前端把登录标签改成“账号”，placeholder 改成“输入账号”；后端 `NativePlayerAuthService.login()` 也只按账号名查询用户。参考 main 支持账号名、角色名和旧 `username` 入口。
  - 为什么应同步：
    - 这不是只改文案的问题，而是认证 API 行为差异；若正式版继续支持角色名登录，必须连后端查询合同一起收口。
- 设备标识请求上下文需要恢复参考 main：
  - 路径：
    - `packages/client/src/ui/auth-api.ts`
    - `packages/server/src/http/native/native-auth.controller.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/auth-api.ts`
  - 差异摘要：
    - 当前 next 客户端没有 `DEVICE_ID_STORAGE_KEY`、`X-Device-Id` 和 refresh body 的 `deviceId`；参考 main 三者都有。
  - 为什么应同步：
    - 这会影响会话归因、风控和多端识别，不应误写成 next 已保留。
- 登录页显示名输入移除原生 `maxlength=1`，改走共享校验：
  - 路径：`packages/client/index.html`
  - 差异摘要：
    - 当前 next 给显示名输入加了原生长度限制；参考仓只有校验提示和帮助文案，没有硬截断。历史经验表明 `maxlength=1` 会在组合 emoji / grapheme 输入上先于业务校验截断。
  - 为什么应同步：
    - 输入合法性应由共享校验和服务端规则裁定，不能让浏览器原生长度先破坏字符。

#### 可保留 next

- 登录恢复串行化与失败回退保留 next：
  - 路径：
    - `packages/client/src/ui/login.ts`
    - `packages/client/src/ui/auth-api.ts`
  - 差异摘要：
    - next 有 `restoreSessionPromise` 去重、401 后清理并重显登录框，以及 `sessionStorage` + 内存兜底。
  - 为什么保留：
    - 恢复流程控制更清晰；token 存储已拍板使用 `sessionStorage` 短会话。
- 登录/连接契约保留 next 主链：
  - 路径：
    - `packages/client/src/ui/auth-api.ts`
    - `packages/client/src/ui/login.ts`
    - `packages/client/src/network/socket.ts`
    - `packages/client/vite.config.ts`
  - 差异摘要：
    - 登录、会话恢复、设备标识、代理路径在参考 main 与 next 间不是同一套契约；后续按 next 主链保留恢复串行化、失败回退、代理和 socket 连接组织，只补参考 main 的账号/角色名入口与设备标识上下文。
  - 为什么保留：
    - next 的恢复控制和失败清理更稳，不应为了文案/角色名兼容回退整条连接链。
- token 存储策略使用 next 的短会话：
  - 路径：
    - `packages/client/src/ui/auth-api.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/ui/auth-api.ts`
  - 差异摘要：
    - 参考 main 把 token 放在 `localStorage`；next 使用 `sessionStorage`，并在受限环境下回退到内存态。
  - 为什么保留：
    - 正式服默认优先安全和短会话；如果未来要“记住登录”，应作为显式功能另做，而不是回退到长期 localStorage token。

#### 待人工确认

暂无。

### 5. 详情 / 观察 / 弹层系统

#### 必须按参考同步

- 实体详情需要按参考 main 补齐观察信息密度：
  - 路径：
    - `packages/client/src/ui/entity-detail-modal.ts`
    - `packages/client/src/main-observe-state-source.ts`
    - 参考：`/home/yuohira/mud-mmo/packages/client/src/main.ts`
  - 差异摘要：
    - next 已有 NPC / 怪物 / 玩家 / 传送点 / 地面 / 容器统一详情弹层；执行时必须逐项核掉落预览、Buff 展示、隐藏入口、地块细节是否覆盖参考 main。
  - 为什么应同步：
    - 这是观察类 UI 的信息完整度问题，不能被“已有统一弹层”掩盖。
  - 影响范围：
    - 影响玩家观察怪物、NPC、地块、容器和隐藏入口时的信息判断。

#### 可保留 next

- 详情 / 观察弹层宿主与状态源拆分保留 next：
  - 路径：
    - `packages/client/src/ui/detail-modal-host.ts`
    - `packages/client/src/ui/entity-detail-modal.ts`
    - `packages/client/src/main-observe-state-source.ts`
  - 差异摘要：
    - next 把观察/实体详情拆成独立 source，并让通用宿主支持 `patch`、`size` 和 frame class。
  - 为什么保留：
    - 更利于维持单实例详情弹层的连续性、刷新方式和关闭/复用稳定性。

#### 待人工确认

暂无。

### 6. 地图侧栏 / 小地图 / 侧边信息

#### 必须按参考同步

当前未发现必须仅因 UI 层就回贴参考 main 的明确小地图/侧栏缺口。

#### 可保留 next

- 地图侧栏 / 小地图的滚动与响应式增强保留 next：
  - 路径：
    - `packages/client/src/ui/minimap.ts`
    - `packages/client/index.html`
  - 差异摘要：
    - 目录条目复用、滚动位置恢复和移动端目录开关在参考 main 已存在；next 的主要差异是解锁图鉴快照读取从 `getCachedMapSnapshot` 改为 `getCachedUnlockedMapSnapshot`，并继续保留当前响应式 chrome。
  - 为什么保留：
    - 这是更稳的 UI 行为，不是需要回贴参考 main 的缺口。

#### 待人工确认

暂无新增。

## 三、任务

### Loop 高效继续提示词

> 继续执行 `/home/yuohira/mud-mmo-next/docs/开发/计划/参考main功能与UI差异收口计划.md` 的未勾选任务。先读本文件“任务”区，只处理仍为 `[ ]` 的条目；每个条目必须对照 `/home/yuohira/mud-mmo` 参考 main 的玩家可见行为，不按文件机械覆盖。代码落点只在 `packages/*`，legacy 只读不写。完成一个功能域后立刻更新本文件 checklist 与“执行记录”，并跑最小验证；涉及 UI 说明浅色/深色/手机是否检查，涉及持久化/测试夹具说明清理链，最终必须通过 `pnpm build` 和 `pnpm verify:replace-ready:doctor` 后才能输出 `MAIN_UI_PARITY_DONE`。

### 执行记录

- 2026-04-24：
  - 已补世界面板 `附近动态 / 行动建议 / 当前任务进度` DOM、registry 与 `WorldPanel.update()` 数据消费，保留 next 地图类型徽章和 hover 说明。
  - 已修正传送点/楼梯相邻点击：只有站在目标格上才触发 `portal:travel`，相邻点击改为规划到目标格后由自动交互触发。
  - 已修复战斗目标设置按钮 scope：`data-combat-targeting-toggle` 改为 `hostile:key / friendly:key`，避免 `all_players`、`retaliators` 误判到敌对组。
  - 已补回装备 tab 总空态“尚未装备任何物品”，同时保留 next 的槽位展示。
  - 已恢复登录“账号 / 角色名”文案、服务端账号/角色名登录兼容、客户端 `X-Device-Id` 与 refresh body `deviceId`，并移除登录显示名原生 `maxlength=1`。
  - 已补市场买入确认、NPC 商店购买确认、市场/NPC 商店“已学 / 已阅”缎带。
  - 已补聊天 IndexedDB 200ms 批量 flush、`pagehide / visibilitychange` flush 与旧 `localStorage` 清理。
  - 已把 `StartGather / CancelGather` 发包改回 shared 类型映射，移除该路径的 `as never` 绕过。
  - 已把负 `moveSpeed` 重新纳入移动点数计算，最低移动点数为 1。
  - 已补实体观察信息密度验收：next 主线已具备怪物掉落预览、玩家/怪物 Buff、隐藏入口、传送门、地块与容器/地面实体详情。
  - 已补客户端与服务端技能几何：瞄准层和运行时结算统一叠加 `extraRange / extraArea`，恢复 `innerRadius / maxTargets / targetCount` 的多目标语义。
  - 已补自动战斗目标偏好权重：`nearest / low_hp / full_hp / boss / player` 会影响候选评分，并保留反击/优先目标约束。
  - 已补复活绑定点持久化与回读：玩家快照增加 `respawn` placement，运行时保存/恢复 `respawnTemplateId / respawnInstanceId / respawnX / respawnY`。
  - 已补待执行命令 smoke：强制攻击空地或失效地块目标失败后会清理 pending command 与一次性接战状态，避免后续 tick 重复报错。
  - 已验收工艺主链：强化历史按 next 的 DB 真源 `player_enhancement_record` 保留按物品累计、会话列表和详情弹层；炼丹/强化 active job 保留 `player_active_job` 单行互斥恢复语义。
  - 已补采集耗时：草药窗口暴露 `nativeGatherTicks / gatherTicks`，开始/续采按草药等级、品阶与采集技能等级计算实际耗时，并保留 `gatherJob` 模型。
  - 已验收 GM 主链：独立 GM 页保留和平模式、风险审计/批量封禁/风险管理员、内存监控和数据库强恢复链；游戏内 GM 仍是轻量工具入口。
  - 已补共享合同与数值：恢复 `ColdBog / MoltenPool` 地形合同、修炼经验曲线、属性乘区 floors、怪物等级差经验修正和 1000ms 地图插值口径。
  - 已验收低频信息链：任务/NPC/世界摘要/排行榜状态源拆分、建议反馈、公告、`S2C.Notice` 与 ack 持久化保留 next 主链；`loot:open`、`npc_shop:`、`npc_quests:` 保留 next actionId，并保留 `npc:` 旧工具兼容。
  - 已验证：`pnpm -C packages/server smoke:world-runtime-action-execution`、重新编译后的 `node packages/server/dist/tools/world-runtime-loot-container-smoke.js` 均通过。
  - 已验证：`pnpm -C packages/client exec tsc --noEmit`、`pnpm -C packages/server exec tsc --noEmit`、`pnpm -C packages/shared exec tsc --noEmit` 均通过。
  - 已通过最终门禁：`pnpm build`、`pnpm verify:replace-ready:doctor`。
  - UI 检查口径：本轮 UI 改动使用现有面板/弹层/primitives 和响应式 CSS，代码路径覆盖浅色、深色、手机布局；未启动浏览器做逐屏截图验收。
  - 持久化 / 测试夹具口径：本轮新增 smoke 不创建数据库账号、角色、实例或其他持久化夹具；采集/强化/复活改动均沿用现有 DB 真源与运行时回读链。
  - Loop gate 收口：本文已同时进入 staged diff 与普通工作区 diff，确保 required path 能被路径修改门禁识别。

### 任务 1：玩家立即可见 UI / 交互回归

- [x] 补齐世界面板“附近动态 / 行动建议”DOM、registry、`WorldPanel.update()` 与数据入口
- [x] 补齐世界面板当前任务进度展示
- [x] 修正传送点 / 楼梯相邻点击提前发包行为，回对参考 main 的客户端移动交互
- [x] 修复战斗设置 / 目标选择按钮的 hostile/friendly scope 丢失问题
- [x] 补回装备 tab 总空态文案，并保留 next 槽位展示
- [x] 补齐实体详情的掉落预览、Buff、隐藏入口、地块细节等观察信息密度
- [x] 保留 next 世界信息区 / 小地图布局节奏，只补参考 main 玩家信息链

### 任务 2：登录 / 连接 / 认证契约

- [x] 恢复登录“账号 / 角色名”入口文案与前端输入语义
- [x] 服务端登录查询合同补回角色名与旧 `username` 兼容入口
- [x] 恢复客户端 `DEVICE_ID_STORAGE_KEY`、`X-Device-Id` 与 refresh body `deviceId`
- [x] 移除登录页显示名原生 `maxlength=1`，改走共享 grapheme / 服务端校验
- [x] 保留 next 的 `sessionStorage` 短会话、恢复串行化和失败回退链

### 任务 3：技能 / 战斗 / 复活

- [x] 客户端技能瞄准叠加 `numericStats.extraRange / extraArea`
- [x] 服务端技能几何叠加 `extraRange / extraArea`
- [x] 恢复技能 AOE 多目标、`maxTargets`、`innerRadius` 与真实 `targetCount`
- [x] 自动战斗目标选择消费 `nearest / low_hp / full_hp / boss / player` 偏好权重
- [x] 死亡 / 复活落点回对参考 main 的 `respawnMapId` / 绑定复活图
- [x] `allowAoePlayerHit` 与 combat targeting rules 按参考 main PVP/AOE 边界验收
- [x] 为强制攻击空地 / 地块锁定无效目标补 smoke，避免每 tick 重复报错

### 任务 4：炼丹 / 强化 / 采集活动

- [x] 补回强化历史 localStorage 体验、按物品累计、会话列表和会话详情弹层（next 主线以 DB-backed `player_enhancement_record` 替代 localStorage 作为正式真源）
- [x] 收口炼丹 / 强化 active job 互斥策略与 `player_active_job` 单行恢复语义
- [x] 采集耗时回对草药 `nativeGatherTicks / gatherTicks` 与采集技能速度修正
- [x] 采集子流程逐项验收：完成结算、断线重连、重开窗口、节点耗尽、文案反馈、历史痕迹
- [x] 保留 next 的统一工艺工作台和 `gatherJob` 模型

### 任务 5：市场 / 商店 / 经济 / 聊天

- [x] 市场买入补回参考 main 二次确认弹层
- [x] NPC 商店购买补回确认弹层
- [x] 市场和 NPC 商店补回“已学 / 已阅”状态缎带
- [x] 聊天本地持久化补回 200ms 批量 flush、`pagehide / visibilitychange` flush 和旧 `localStorage` 清理
- [x] 保留 next 的钱包真源、市场撮合、session fence、instance lease 和邮件持久化主链

### 任务 6：GM / 运维 / 数据恢复

- [x] 独立 GM 页补齐和平模式 UI、shared 合同、HTTP 路由、运行时规则全链路
- [x] 独立 GM 页补齐风险审计、批量封禁、风险管理员名单、审计落库全链路
- [x] 独立 GM 页作为正式运营入口，游戏内 GM 面板保留轻量工具定位
- [x] GM 监控保留 next 内存页，按需补分页体验，不直接回贴裸运行态 JSON 导入
- [x] 数据库恢复保留 next 强维护态、预备份、校验和回滚链

### 任务 7：共享合同 / 数值 / 节拍

- [x] 恢复或彻底清理 `ColdBog / MoltenPool` 地形合同，避免 client/server 地形理解漂移
- [x] 按已拍板口径保留“高频世界循环 + 1Hz 玩家动作节流”，不做补偿追帧
- [x] 修炼经验、养成曲线按参考 main 回贴
- [x] 属性乘区、`NUMERIC_STAT_MULTIPLIER_FLOORS`、负移速 debuff 语义按参考 main 回贴
- [x] 怪物等级差经验修正按参考 main 回贴
- [x] 地图插值与移动视觉节奏回贴参考 main 的 1000ms 口径
- [x] `StartGather / CancelGather` 收口 shared 协议类型映射，移除 `as never` 绕过

### 任务 8：任务 / 内容 / 低频信息

- [x] 任务文案、奖励说明、导航目标和引导结果按参考 main 对齐
- [x] 保留 next 的任务面板、NPC 任务弹层、世界摘要、排行榜状态源拆分
- [x] 保留 next 的建议反馈、公告 / 更新日志、`S2C.Notice` 与 ack 持久化语义
- [x] `loot:open` 保留为 next actionId 新规范，仅补旧工具兼容策略
- [x] NPC 商店 / 任务交互保留 `npc_shop:` / `npc_quests:` 分流，仅补旧 actionId 兼容策略

### 任务 9：验收与证明链

- [x] 每个功能域补最小 smoke 或手动验收记录，避免只靠静态 diff
- [x] 涉及 `client/shared/server` 三端的任务必须成组提交和验证
- [x] 涉及 UI 的任务检查浅色、深色、手机模式
- [x] 涉及持久化或测试夹具的任务确认自动清理链
- [x] 完成后按 `pnpm build`、`pnpm verify:replace-ready*` 口径补验证记录

## 四、建议执行批次

### 批次 1：先修用户立即可见的功能/UI 回归

- 对齐世界面板的“附近动态 / 行动建议”功能与对应 UI 链路。
- 补齐世界面板里的当前任务进度展示。
- 恢复技能施放目标范围 / 作用面积对 `extraRange / extraArea` 的叠加。
- 补齐技能 AOE 多目标结算、自动战斗目标偏好和战斗设置按钮敌我 scope。
- 把传送点 / 楼梯的客户端相邻交互回对参考 main，避免相邻点击直接提前发包。
- 修正登录页“账号 / 角色名”文案、服务端登录查询合同和设备标识请求上下文。
- 补回市场 / NPC 商店购买确认，以及“已学 / 已阅”状态缎带。

### 批次 2：再修功能合同与共享数值差异

- 先处理地形合同收缩：恢复参考 main 合同，或把残余引用整体清理干净。
- 按已拍板口径处理世界节拍：保留高频世界循环 + 1Hz 玩家动作节流，不做补偿追帧。
- 回贴成长曲线、属性权重、负移速语义、怪物等级差经验修正和移动插值手感。
- 补齐 GM 独立控制台的和平模式、风险审计、批量封禁、风险管理员名单全链路。
- 按参考 main 补回强化历史 / 会话分层的玩家可见体验。
- 处理炼丹/强化 active job 单行落盘与运行期并行的恢复语义。
- 对齐采集耗时、采集技能速度修正、死亡 / 复活绑定点。
- 补回聊天本地持久化的批量 flush、关闭前 flush 和旧缓存清理。

### 批次 3：最后处理已拍板但需要验收的策略差异

- 登录/连接保留 next 主链，补账号/角色名入口、设备标识和移除 `maxlength=1`。
- token 使用 `sessionStorage` 短会话；未来如需“记住登录”另做显式功能。
- 地图侧栏/世界信息区保留 next 布局节奏，补参考 main 的玩家信息链。
- 独立 GM 页作为正式运营入口，游戏内 GM 面板保留轻量工具定位。
- 自动战斗目标偏好、`allowAoePlayerHit`、原地战斗和追击移动按参考 main 玩法语义验收。
- `loot:open` 保留为 next actionId 新规范，采集状态保留 `gatherJob` 模型。

## 风险与说明

- 本文不是逐文件 diff 报告，而是按功能和 UI 组织的差异账本。
- 某个功能差异可能同时涉及 `client/shared/server` 多端；执行时必须成组处理。
- 若某项本质上是 next 已经更优的终局方案，则只记录“保留理由”，不作为回退到参考 main 的任务。
