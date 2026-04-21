# next 系统模块 / API / 数据目录总盘点

更新时间：2026-04-16

这份文档的目标不是重复已有 gap 文档，而是把当前仓库里和“完整游戏系统”直接相关的四件事放到同一页里：

1. 当前架构分层
2. 全部主要功能模块
3. 全部主要 API 面
4. 数据目录与 next 收尾待办

如果后续决定不再追求 legacy 行为兼容，而是直接切 next，这份文档也可以作为拆迁移范围、写存档转换器和收尾任务板的总索引。

## 1. 顶层架构

### 1.1 包职责

| 包 | 角色 | 说明 |
| --- | --- | --- |
| `packages/client` | next 前台客户端 | Canvas 2D 地图渲染、Socket 客户端、玩家 HUD、主面板、详情弹层、GM 前台 |
| `packages/server` | next 服务端 | NestJS + Socket.IO 世界服、HTTP API、tick runtime、持久化、GM/管理面、验证脚本 |
| `packages/shared` | next 共享层 | 协议事件名、共享类型、数值结构、常量、地图文档和 protobuf 编解码 |
| `packages/config-editor` | 配置编辑器 | 独立 Vite 工具包，当前体量很小，主要是编辑辅助入口 |
| `legacy/client` | 旧前台 | 旧体验与旧实现参考线 |
| `legacy/server` | 旧服务端 | 旧玩法、旧运行时、旧协议参考线 |
| `legacy/shared` | 旧共享层 | 旧协议和旧共享类型参考线 |

### 1.2 server-next 分层

| 层 | 目录 | 说明 |
| --- | --- | --- |
| 入口层 | `packages/server/src/main.ts` `app.module.ts` | Nest 主模块，注册 HTTP、Socket、runtime、persistence |
| HTTP 层 | `packages/server/src/http/` | 玩家鉴权、账号修改、GM、数据库维护接口 |
| Socket 层 | `packages/server/src/network/` | 世界网关、会话绑定、bootstrap、同步、客户端事件下发 |
| Runtime 层 | `packages/server/src/runtime/` | 世界/tick/实例、玩家、战斗、市场、邮件、建议、兑换码、工坊 |
| 持久化层 | `packages/server/src/persistence/` | 玩家、地图、邮件、市场、建议、兑换码、身份映射、flush |
| 内容加载层 | `packages/server/src/content/` `runtime/map/` | 内容模板、地图模板、地图运行配置 |
| 验证/基准层 | `packages/server/src/tools/` | smoke、shadow、protocol audit、bench、proof |

### 1.3 client-next 分层

| 层 | 目录 | 说明 |
| --- | --- | --- |
| 入口层 | `packages/client/src/main.ts` | 启动、全局状态、事件绑定、主循环拼装 |
| 网络层 | `packages/client/src/network/` | Socket 客户端封装、事件发送和监听 |
| 地图运行时 | `packages/client/src/game-map/` | camera、viewport、scene、interaction、minimap runtime、renderer adapter |
| 渲染层 | `packages/client/src/renderer/` | 文本渲染、tile sprite cache、文本测量缓存 |
| UI 横向层 | `packages/client/src/ui/` | HUD、聊天、登录、邮件、建议、详情弹层、NPC 交互、教程、变更日志 |
| 面板层 | `packages/client/src/ui/panels/` | 属性、背包、装备、功法、行动、任务、市场、设置、世界、GM |
| GM 前台 | `packages/client/src/gm.ts` `gm-map-editor.ts` `gm-world-viewer.ts` | GM 页面、地图编辑器、世界查看器 |
| 内容辅助 | `packages/client/src/content/` | 编辑器目录、本地模板、怪物分布、物品来源等前端辅助内容 |

## 2. 功能模块总清单

### 2.1 账号与接入

- 玩家注册、登录、刷新 token
- 显示名可用性检查
- 玩家改密码、改显示名、改角色名
- GM 登录、GM 改密
- Socket hello / heartbeat / ping / kick
- 会话恢复、顶号、脱机 session 管理

### 2.2 世界与地图

- 地图模板加载
- 地图实例与世界运行时
- tick 驱动
- AOI 视野同步
- 玩家接入实例、移除实例
- 地块详情、地图静态快照、地图增量 patch
- 小地图、图鉴、可见 marker
- 传送门与跨图进入
- 时间流逝、地图 tick 速率、地图时间配置

### 2.3 移动、交互与导航

- 单步移动
- 点击目标点移动
- 任务自动导航
- 路径规划与高亮
- 传送门使用
- 世界实体详情查询
- 地块详情查询

### 2.4 战斗与动作

- action 使用
- 技能释放
- 玩家受伤、复活
- 妖兽伤害、击败、掉落生成
- 自动战斗技能配置
- 自动用药配置
- 自动战斗目标规则
- 自动战斗目标模式
- 战斗目标锁定与切换

### 2.5 成长与修炼

- 境界数据
- 功法列表、修炼切换
- 功法技能可用性开关
- 身体锻体状态
- 天门相关动作
- 属性详情
- 排行榜、世界摘要

### 2.6 背包、装备与掉落

- 背包增量同步
- 物品使用
- 丢弃物品
- 销毁物品
- 地面拾取
- 背包排序
- 装备 / 卸下装备
- 掉落窗口

### 2.7 NPC、任务与商店

- 任务列表
- NPC 任务列表
- 接任务、交任务
- NPC 商店查看与购买
- 任务导航结果回执

### 2.8 邮件、建议、兑换码

- 邮件摘要 / 分页 / 详情
- 标记已读、领取附件、删除邮件
- 直发邮件、广播邮件
- 建议创建、投票、回复、已读、完成、重开、删除
- 兑换码兑换
- 兑换码组创建、追加、删除

### 2.9 市场

- 市场概览
- 市场列表分页
- 订单簿
- 交易历史
- 创建卖单、买单
- 立即买入、立即卖出
- 取消订单
- 领取市场暂存

### 2.10 工坊

- 炼丹面板
- 炼丹预设保存 / 删除
- 开始炼丹 / 取消炼丹
- 强化面板
- 开始强化 / 取消强化

### 2.11 GM 与运维

- GM 总览状态
- 地图运行态查看
- 玩家详情查看与修改
- 玩家密码 / 账号修改
- 玩家重置
- 天门重置
- 机器人生成 / 移除
- 全员回默认出生点
- 性能统计重置
- 地图 tick / 时间热更新
- tick 配置重载
- 世界观察者清理
- 数据库状态、备份、下载、恢复

### 2.12 前端专属模块

- HUD
- 聊天
- 登录
- 最小地图与大地图弹层
- 邮件面板
- 建议面板
- 世界面板
- 详情弹层
- NPC 商店弹层
- NPC 任务弹层
- 天门弹层
- 技能 tooltip、装备 tooltip、物品 tooltip
- GM 面板、GM 世界查看器、GM 地图编辑器

## 3. HTTP API 总清单

### 3.1 公共与玩家 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/health` | 健康与 readiness |
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/refresh` | 刷新 token |
| `GET` | `/api/auth/display-name/check` | 检查显示名可用性 |
| `POST` | `/api/account/password` | 修改密码 |
| `POST` | `/api/account/display-name` | 修改显示名 |
| `POST` | `/api/account/role-name` | 修改角色名 |

### 3.2 GM / Admin API

GM 鉴权：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/auth/gm/login` | GM 登录 |
| `POST` | `/api/auth/gm/password` | GM 修改密码 |

GM 主面：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/gm/state` | GM 总览状态 |
| `GET` | `/api/gm/editor-catalog` | 编辑器目录 |
| `GET` | `/api/gm/maps` | 地图列表 |
| `GET` | `/api/gm/maps/:mapId/runtime` | 指定地图运行态窗口 |
| `GET` | `/api/gm/players/:playerId` | 玩家详情 |
| `POST` | `/api/gm/players/:playerId/password` | 改玩家密码 |
| `PUT` | `/api/gm/players/:playerId/account` | 改玩家账号 |
| `PUT` | `/api/gm/players/:playerId` | 改玩家运行态 / 持久态 |
| `POST` | `/api/gm/players/:playerId/reset` | 重置玩家 |
| `POST` | `/api/gm/players/:playerId/heaven-gate/reset` | 重置天门 |
| `POST` | `/api/gm/bots/spawn` | 生成机器人 |
| `POST` | `/api/gm/bots/remove` | 移除机器人 |
| `POST` | `/api/gm/shortcuts/players/return-all-to-default-spawn` | 全员回默认出生点 |
| `POST` | `/api/gm/perf/network/reset` | 重置网络性能统计 |
| `POST` | `/api/gm/perf/cpu/reset` | 重置 CPU 性能统计 |
| `POST` | `/api/gm/perf/pathfinding/reset` | 重置寻路性能统计 |
| `POST` | `/api/gm/players/:playerId/mail` | 发直达邮件 |
| `POST` | `/api/gm/mail/broadcast` | 发广播邮件 |
| `GET` | `/api/gm/redeem-code-groups` | 兑换码组列表 |
| `POST` | `/api/gm/redeem-code-groups` | 创建兑换码组 |
| `GET` | `/api/gm/redeem-code-groups/:groupId` | 兑换码组详情 |
| `PUT` | `/api/gm/redeem-code-groups/:groupId` | 更新兑换码组 |
| `POST` | `/api/gm/redeem-code-groups/:groupId/codes` | 追加兑换码 |
| `DELETE` | `/api/gm/redeem-codes/:codeId` | 删除兑换码 |
| `GET` | `/api/gm/suggestions` | 建议列表 |
| `POST` | `/api/gm/suggestions/:id/complete` | 完成建议 |
| `POST` | `/api/gm/suggestions/:id/replies` | GM 回复建议 |
| `DELETE` | `/api/gm/suggestions/:id` | 删除建议 |
| `PUT` | `/api/gm/maps/:mapId/tick` | 更新地图 tick 配置 |
| `PUT` | `/api/gm/maps/:mapId/time` | 更新地图时间配置 |
| `POST` | `/api/gm/tick-config/reload` | 重载 tick 配置 |
| `DELETE` | `/api/gm/world-observers/:viewerId` | 清理世界观察者 |

GM Admin：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/gm/database/state` | 数据库状态 |
| `POST` | `/api/gm/database/backup` | 触发数据库备份 |
| `GET` | `/api/gm/database/backups/:backupId/download` | 下载数据库备份 |
| `POST` | `/api/gm/database/restore` | 触发数据库恢复 |

### 3.3 Runtime 调试 / 验证 API

`/runtime/*` 主要用于 smoke、调试、proof、shadow 验证，不是前台正式 API 面。

世界与实例：

- `GET /runtime/summary`
- `GET /runtime/templates`
- `GET /runtime/instances`
- `GET /runtime/instances/:instanceId`
- `GET /runtime/instances/:instanceId/monsters`
- `GET /runtime/instances/:instanceId/monsters/:runtimeId`
- `GET /runtime/instances/:instanceId/tiles/:x/:y`
- `POST /runtime/instances/:instanceId/spawn-monster-loot`
- `POST /runtime/instances/:instanceId/monsters/:runtimeId/defeat`
- `POST /runtime/instances/:instanceId/monsters/:runtimeId/damage`

玩家运行态：

- `POST /runtime/players/connect`
- `DELETE /runtime/players/:playerId`
- `POST /runtime/players/:playerId/move`
- `POST /runtime/players/:playerId/use-action`
- `POST /runtime/players/:playerId/portal`
- `GET /runtime/players/:playerId/view`
- `GET /runtime/players/:playerId/detail`
- `GET /runtime/players/:playerId/tile-detail`
- `GET /runtime/players/:playerId/state`
- `POST /runtime/players/:playerId/pending-logbook`
- `POST /runtime/players/:playerId/vitals`
- `POST /runtime/players/:playerId/damage`
- `POST /runtime/players/:playerId/respawn`
- `POST /runtime/players/:playerId/grant-item`
- `POST /runtime/players/:playerId/use-item`
- `POST /runtime/players/:playerId/drop-item`
- `POST /runtime/players/:playerId/take-ground`
- `POST /runtime/players/:playerId/equip`
- `POST /runtime/players/:playerId/unequip`
- `POST /runtime/players/:playerId/cultivate`
- `POST /runtime/players/:playerId/cast-skill`

邮件 / 建议 / 市场 / NPC：

- `GET /runtime/players/:playerId/npc-shop/:npcId`
- `GET /runtime/players/:playerId/quests`
- `GET /runtime/players/:playerId/mail/summary`
- `GET /runtime/players/:playerId/mail/page`
- `GET /runtime/players/:playerId/mail/:mailId`
- `GET /runtime/players/:playerId/npc-quests/:npcId`
- `GET /runtime/players/:playerId/market`
- `GET /runtime/players/:playerId/market/item-book`
- `GET /runtime/players/:playerId/market/trade-history`
- `POST /runtime/players/:playerId/npc-shop/:npcId/buy`
- `POST /runtime/players/:playerId/npc-quests/:npcId/accept`
- `POST /runtime/players/:playerId/npc-quests/:npcId/submit`
- `POST /runtime/players/:playerId/mail/mark-read`
- `POST /runtime/players/:playerId/mail/claim`
- `POST /runtime/players/:playerId/mail/delete`
- `POST /runtime/players/:playerId/mail/direct`
- `GET /runtime/suggestions`
- `POST /runtime/players/:playerId/suggestions`
- `POST /runtime/players/:playerId/suggestions/:suggestionId/vote`
- `POST /runtime/players/:playerId/suggestions/:suggestionId/reply`
- `POST /runtime/players/:playerId/suggestions/:suggestionId/read-replies`
- `POST /runtime/suggestions/:suggestionId/complete`
- `POST /runtime/suggestions/:suggestionId/pending`
- `POST /runtime/suggestions/:suggestionId/reply`
- `DELETE /runtime/suggestions/:suggestionId`
- `POST /runtime/players/:playerId/market/create-sell-order`
- `POST /runtime/players/:playerId/market/create-buy-order`
- `POST /runtime/players/:playerId/market/buy`
- `POST /runtime/players/:playerId/market/sell`
- `POST /runtime/players/:playerId/market/cancel-order`
- `POST /runtime/players/:playerId/market/claim-storage`

运行维护：

- `GET /runtime/auth-trace`
- `DELETE /runtime/auth-trace`
- `POST /runtime/persistence/flush`

## 4. Socket API 总清单

### 4.1 C2S 事件

当前核对结果：

- `NEXT_C2S` 共声明 `74` 个事件。
- `server-next` 网关当前实际接入 `72` 个。
- 当前协议清点下，这两条炼制预设事件已经补齐到 next 主链：`SaveAlchemyPreset`、`DeleteAlchemyPreset`。

连接与探活：

- `Hello`
- `Heartbeat`
- `Ping`

移动与世界交互：

- `Move`
- `MoveTo`
- `NavigateQuest`
- `UseAction`
- `UsePortal`
- `RequestDetail`
- `RequestTileDetail`

玩家成长与战斗：

- `Cultivate`
- `CastSkill`
- `HeavenGateAction`
- `UpdateAutoBattleSkills`
- `UpdateAutoUsePills`
- `UpdateCombatTargetingRules`
- `UpdateAutoBattleTargetingMode`
- `UpdateTechniqueSkillAvailability`

背包 / 装备 / 掉落：

- `UseItem`
- `DropItem`
- `DestroyItem`
- `TakeGround`
- `SortInventory`
- `Equip`
- `Unequip`

任务 / NPC / 世界信息：

- `RequestQuests`
- `RequestNpcQuests`
- `AcceptNpcQuest`
- `SubmitNpcQuest`
- `RequestNpcShop`
- `BuyNpcShopItem`
- `RequestAttrDetail`
- `RequestLeaderboard`
- `RequestWorldSummary`

邮件 / 建议 / 兑换码：

- `RequestMailSummary`
- `RequestMailPage`
- `RequestMailDetail`
- `RedeemCodes`
- `MarkMailRead`
- `ClaimMailAttachments`
- `DeleteMail`
- `RequestSuggestions`
- `CreateSuggestion`
- `VoteSuggestion`
- `ReplySuggestion`
- `MarkSuggestionRepliesRead`

市场：

- `RequestMarket`
- `RequestMarketListings`
- `RequestMarketItemBook`
- `RequestMarketTradeHistory`
- `CreateMarketSellOrder`
- `CreateMarketBuyOrder`
- `BuyMarketItem`
- `SellMarketItem`
- `CancelMarketOrder`
- `ClaimMarketStorage`

工坊：

- `RequestAlchemyPanel`
- `SaveAlchemyPreset`
- `DeleteAlchemyPreset`
- `StartAlchemy`
- `CancelAlchemy`
- `RequestEnhancementPanel`
- `StartEnhancement`
- `CancelEnhancement`

GM：

- `GmGetState`
- `GmSpawnBots`
- `GmRemoveBots`
- `GmUpdatePlayer`
- `GmResetPlayer`
- `GmMarkSuggestionCompleted`
- `GmRemoveSuggestion`

杂项：

- `Chat`
- `AckSystemMessages`
- `DebugResetSpawn`

### 4.2 S2C 事件

会话与首包：

- `Bootstrap`
- `InitSession`
- `MapEnter`
- `MapStatic`
- `Realm`

高频同步：

- `WorldDelta`
- `SelfDelta`
- `PanelDelta`

世界与详情：

- `LootWindowUpdate`
- `Detail`
- `TileDetail`
- `QuestNavigateResult`
- `Notice`

任务 / 邮件 / 建议：

- `Quests`
- `NpcQuests`
- `SuggestionUpdate`
- `MailSummary`
- `MailPage`
- `MailDetail`
- `RedeemCodesResult`
- `MailOpResult`

市场 / NPC / 工坊：

- `MarketUpdate`
- `MarketListings`
- `MarketOrders`
- `MarketStorage`
- `MarketItemBook`
- `MarketTradeHistory`
- `NpcShop`
- `AlchemyPanel`
- `EnhancementPanel`

属性 / 排行 / GM：

- `AttrDetail`
- `Leaderboard`
- `WorldSummary`
- `GmState`

协议控制：

- `Error`
- `Kick`
- `Pong`

## 5. 数据目录总清单

### 5.1 服务端内容数据

根目录：`packages/server/data/content`

| 目录 / 文件 | 当前规模 | 用途 |
| --- | --- | --- |
| `alchemy/recipes.json` | 1 文件 | 炼丹配方 |
| `breakthroughs.json` | 1 文件 | 突破配置 |
| `enhancements/` | 1 文件 | 强化配置 |
| `items/` | 9 文件 | 物品定义 |
| `monster-level-baselines.json` | 1 文件 | 妖兽等级基线 |
| `monsters/` | 15 文件 | 各地图妖兽包 |
| `quests/` | 14 文件 | 主线 / 支线任务 |
| `realm-levels.json` | 1 文件 | 境界等级配置 |
| `resource-nodes.json` | 1 文件 | 资源点配置 |
| `starter-inventory.json` | 1 文件 | 初始背包 |
| `technique-buffs/` | 13 文件 | 功法 buff 定义 |
| `techniques/` | 16 文件 | 功法定义 |

### 5.2 服务端地图数据

根目录：`packages/server/data/maps`

- 根地图文件：`28` 个
- 组合式 compose 子地图：`16` 个

地图数据覆盖的内容包括：

- 城镇、野外、洞窟、遗迹、矿洞、秘境
- 室内楼层
- compose 子块
- 传送入口、NPC、采集、妖兽、空间视觉模式等地图文档内容

### 5.3 客户端生成 / 辅助数据

根目录：

- `packages/client/src/constants/world/editor-catalog.generated.json`
- `packages/client/src/constants/world/item-sources.generated.json`
- `packages/client/src/constants/world/monster-locations.generated.json`
- `packages/client/src/content/*`

作用：

- 编辑器目录
- 物品来源展示
- 怪物分布展示
- 本地模板与延迟加载内容

### 5.4 共享真源与常量

根目录：`packages/shared/src`

主要真源：

- `protocol.ts`
- `types.ts`
- `numeric.ts`
- `map-document.ts`
- `network-protobuf.ts`
- `constants/gameplay/*`
- `constants/network/*`
- `constants/ui/*`
- `constants/visuals/*`

### 5.5 运行期目录

- `packages/server/.runtime/`：server-next 运行期文件、GM 备份目录
- `packages/.runtime/`：仓库级运行期目录

## 6. next 需要做的工作

下面这份待办按“如果现在要把 next 当唯一主线来收尾”来写，不再默认把 legacy 行为对齐当成第一目标。

### 6.1 架构收口

- 明确 `packages/client`、`packages/server`、`packages/shared` 为唯一主线
- 停止新增基于 legacy parity 的横向对照工作
- 把现有分散文档收成“总盘点 + 执行计划 + 验证门禁”三层
- 明确哪些 runtime/debug API 只保留给 smoke，不再当长期产品面

### 6.2 数据迁移

- 先定义“必须迁移的数据真源”而不是先写转换脚本
- 至少覆盖账号、角色身份、位置、境界、属性、背包、装备、功法、任务、邮件、市场、建议、兑换码
- 明确哪些内容数据直接复用 `packages/server/data/*`
- 写一次性 legacy 存档转换脚本
- 给转换脚本补 dry-run、统计摘要、失败清单和回滚策略

### 6.3 服务端 runtime

- 继续拆 `world-runtime.service.js` 的超大职责
- 明确 tick 内允许写状态的入口
- 把玩家、地图、战斗、掉落、交互的写路径继续收束
- 继续压缩高频链路里的重复组装和重复序列化
- 明确哪些 GM 操作应走 runtime queue，哪些允许直改持久态

### 6.4 协议与同步

- 把 `protocol.ts` 作为唯一 next 协议真源
- `SaveAlchemyPreset`、`DeleteAlchemyPreset` 已补齐到 next gateway/runtime；这组已不再是协议空洞
- 继续拆清首包静态、低频静态、按需详情和高频动态
- 继续缩 `Bootstrap / MapStatic / PanelDelta / WorldDelta` 的重复字段
- 统一事件字段命名和面板增量约定
- 让新增字段默认受 protocol audit 和一致性检查保护

### 6.5 客户端 UI / 渲染

- 把主面板、弹层、HUD 的 patch-first 收口继续推进
- 明确哪些状态只能由 Socket 增量驱动，哪些允许客户端派生缓存
- 收掉 UI 里仍依赖大块重建的区域
- 明确 GM 页面、GM 地图编辑器、世界查看器是否继续长期保留
- 补一次浅色 / 深色 / 手机模式的系统性盘点

### 6.6 内容与地图

- 把内容文件夹按“玩法真源 / 编辑器辅助 / 展示生成物”重新标注
- 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- 把 compose 地图、室内地图、传送点、NPC 锚点的规范写死

### 6.7 验证与发布门禁

- 继续把 `local / with-db / acceptance / full / shadow-destructive` 五层 gate 固化
- 把客户端 build、协议审计、runtime smoke、with-db、shadow、GM 验证挂到统一 replace-ready 口径
- 明确“自动 proof 通过”和“真实可替换上线”不是一回事
- 给数据迁移额外加一条迁移 proof 链

## 7. 建议的执行顺序

如果你决定按“硬切 next，不再追求旧实现兼容”推进，建议顺序是：

1. 先冻结 legacy 范围，不再给 legacy 补新行为。
2. 把这份盘点文档作为唯一总索引。
3. 单独产出“必须迁移的数据清单”。
4. 写 legacy -> next 存档转换脚本。
5. 按模块收尾 `server/client/shared` 主链。
6. 最后再做 shadow / with-db / acceptance / full 门禁闭环。

## 8. 相关文档

- `docs/next-plan/main.md`
- `docs/next-in-place-hard-cut-plan.md`
- `docs/next-plan/10-legacy-archive-and-cutover.md`
- `docs/server-next-operations.md`
- `docs/frontend-refactor/README.md`
- `docs/frontend-refactor/module-inventory.md`
