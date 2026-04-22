# 07 客户端主链收口

目标：把 `packages/client` 收成稳定的 next 协议接线前台，构建主入口统一按 `build:client` 表述。

当前补充口径：

- 当前阶段客户端只要求完成 next 协议对接、唯一 Socket 消费主链和必要状态桥接。
- UI 视觉、交互细修、面板形态重构、patch-first 深化、主题适配、手机适配都不作为当前 hard cut 阻塞项。
- 客户端 UI 由后续独立设计迭代处理，不在这份文档里作为完成 next 的前置条件。

## 当前基线

客户端当前最重的入口和面板文件已经足够说明需要先把协议接线与状态边界压稳，而不是继续把逻辑堆进 `main.ts`：

- `packages/client/src/main.ts`
  - `28` 行
  - 当前已收成纯 app entry，只保留样式注入与 `initializeMainApp(...)` 调用。
- `packages/client/src/main-app-composition.ts`
  - `8` 行
  - 当前只保留预加载入口和 `assembleMainApp(...)` 委托。
- `packages/client/src/main-app-runtime-assembly.ts`
  - `7` 行
  - 当前只保留 `runtime context -> bootstrap runner` 的薄编排。
- `packages/client/src/main-app-runtime-context.ts`
  - `154` 行
  - 当前只保留 `panel context + runtime owner context` 的薄编排。
- `packages/client/src/main-app-panel-context.ts`
  - `251` 行
  - 当前承接 panel、detail hydration、notice、settings 等冷路径与面板 owner 装配。
- `packages/client/src/main-app-runtime-owner-context.ts`
  - `391` 行
  - 当前承接 runtime、delta、mapRuntime bridge、connection、reset 这组高频 owner 装配。
- `packages/client/src/main-app-bootstrap-runner.ts`
  - `50` 行
  - 当前承接最终 `bootstrapMainApp(...)` 调用与启动动作桥接。
- `packages/client/src/network/socket.ts`
  - `179` 行
  - 当前已收成连接/token/sender 薄入口，唯一消费层和发送面 owner 都已固定。
- `packages/client/src/network/socket-server-events.ts`
  - `49` 行
  - 当前承接服务端事件分组和回调类型边界。
- `packages/client/src/network/socket-event-registry.ts`
  - `57` 行
  - 当前承接服务端事件回调桶与统一绑定。
- `packages/client/src/network/socket-lifecycle-controller.ts`
  - `70` 行
  - 当前承接连接生命周期、心跳和 kick/disconnect/connect_error 分发。
- 当前 `07` 主链口径已固定：
  - `main.ts` 是纯 app entry
  - `socket.ts` 是唯一 socket 事件消费主入口
  - `main-app-panel-context.ts` 承接 panel/cold-path owner
  - `main-app-runtime-owner-context.ts` 承接 runtime/high-frequency owner
  - `GM 工具链继续保留，但不并入玩家主线`
- `packages/client/src/gm.ts`
  - `6262` 行
  - 当前是独立大块，后续应单独判断是否长期保留，不应继续侵入前台主链。
- 主要面板文件：
  - `action-panel.ts` `2846` 行
  - `inventory-panel.ts` `1769` 行
  - `market-panel.ts` `1778` 行
  - `technique-panel.ts` `1387` 行
  - `attr-panel.ts` `1263` 行
  - `quest-panel.ts` `838` 行
  - `settings-panel.ts` `856` 行

客户端还存在几类明确的状态边界：

- 地图与视野
  - `packages/client/src/game-map/*`
- 单实例详情与模态
  - `entity-detail-modal.ts`
  - `detail-modal-host.ts`
  - `npc-shop-modal.ts`
  - `npc-quest-modal.ts`
  - `craft-workbench-modal.ts`
  - `heaven-gate-modal.ts`
- 面板系统与响应式
  - `ui/panel-system/*`
  - `ui/responsive-viewport.ts`
  - `styles/ui-responsive.css`
  - `styles/responsive.css`

## 本阶段原则

- `socket.ts` 是唯一 socket 事件消费主入口。
- `main.ts` 应收成 app entry，不继续承载具体面板和事件细节。
- 当前阶段只处理“协议能接上、状态能走通、必要界面能吃到新数据”。
- 不把 UI 重写、视觉统一、主题/终端适配当成当前阶段的完成条件。

## 任务

- [x] 继续整理 `packages/client/src/main.ts`
- [x] 继续整理 `packages/client/src/network/socket.ts`
- [x] 继续整理地图相关协议状态边界
- [x] 收口详情弹层、面板详情请求与结果分发的状态来源
- [x] 收口邮件面板状态来源
- [x] 收口建议面板状态来源
- [x] 收口任务面板状态来源
- [x] 收口市场面板状态来源
- [x] 收口设置面板状态来源
- [x] 检查 GM 页面、GM 世界查看器、地图编辑器是否长期保留
- [x] 明确哪些状态只能由 Socket 增量驱动
- [x] 明确哪些状态允许客户端本地派生缓存

当前明确后置、不阻塞 next cutover 的工作：

- [ ] UI 视觉设计与样式重做
- [ ] 面板 patch-first 深化与重建抖动治理
- [ ] 详情弹层/模态系统的交互细修
- [ ] 浅色模式检查
- [ ] 深色模式检查
- [ ] 手机模式检查

## 执行顺序

### 第 1 批：把 `main.ts` 收成薄编排层

- [x] 把 `main.ts` 收成：
  - 应用启动
  - 模块装配
  - 生命周期编排
  - 最薄事件桥接
- [x] 不再让 `main.ts` 直接承担大量面板 patch 逻辑
- [x] 不再让 `main.ts` 自己成为协议真源

优先抽走的内容：

- 面板状态同步分发
- 地图外的低频协议结果分发
- 模态与详情弹层的数据入口

本轮进展：

- 已新增 `packages/client/src/main-detail-state-source.ts`
  - 统一接住 `LootWindowUpdate / TileDetail / Detail / AttrDetail / AlchemyPanel / EnhancementPanel / Leaderboard / WorldSummary / NpcQuests / Quests / QuestNavigateResult / NpcShop`
- 已新增 `packages/client/src/main-notice-state-source.ts`
  - 统一接住 `Notice -> SystemMsg/chat/toast/path-clear` 分发
- 已新增 `packages/client/src/main-low-frequency-socket-bindings.ts`
  - 把低频结果、notice 和连接生命周期的 `socket.on*` 绑定从 `main.ts` 主体抽离
- 已新增 `packages/client/src/main-runtime-state-source.ts`
  - 统一接住 `Bootstrap / InitSession / MapEnter / Realm / WorldDelta / SelfDelta / PanelDelta / MapStatic` 的高层状态 owner 与 pending-delta 收口
- 已新增 `packages/client/src/main-connection-state-source.ts`
  - 统一接住 `Error / Kick / ConnectError / Disconnect / Pong` 的连接恢复与 UI 反馈编排
- 已新增 `packages/client/src/main-high-frequency-socket-bindings.ts`
  - 把高频 runtime 相关 `socket.on*` 绑定从 `main.ts` 主体抽离
- 已新增 `packages/client/src/main-observe-state-source.ts`
  - 统一接住观察弹层的 tile detail、地面物、传送点、安全区、buff tooltip 与详情请求入口
- 已新增 `packages/client/src/main-reset-state-source.ts`
  - 统一接住 reset 后的 runtime/UI/bridge 复位，不再让 `main.ts` 自己持有整段清空逻辑
- 已新增 `packages/client/src/main-shell-bindings.ts`
  - 统一接住 side-panel/tab、窗口生命周期、observe modal 关闭路径和连接恢复外围绑定
- 已新增 `packages/client/src/main-map-interaction-bindings.ts`
  - 统一接住地图点击目标分流、目标选择确认、hover 更新和 `mapRuntime` 交互绑定
- 已新增 `packages/client/src/main-navigation-state-source.ts`
  - 统一接住路径预览、自动交互挂起、NPC/传送点点击后的靠近与触发、移动发包前的本地路径 owner
- 已新增 `packages/client/src/main-targeting-state-source.ts`
  - 统一接住目标选择状态、targeting overlay、sense-qi hover、hover tile 和目标落点解析
- 已新增 `packages/client/src/main-runtime-delta-state-source.ts`
  - 统一接住 `WorldDelta / SelfDelta / PanelDelta` 的高频组装、跨图复位、movement-frame 后处理和 panel-delta 分发
- 已新增 `packages/client/src/main-panel-delta-state-source.ts`
  - 统一接住 `Attr / Inventory / Equipment / Technique / Actions` 的高频 merge、玩家写回和面板/bridge 同步
- 已新增 `packages/client/src/main-runtime-monitor-source.ts`
  - 统一接住 FPS 监控、当前时间显示、心跳采样、重连恢复与版本刷新前提示
- 已新增 `packages/client/src/main-startup-bindings.ts`
  - 统一接住应用启动期的 panel/HUD/window 绑定、工坊/NPC 商店/聊天/调试 wiring、缩放控件和 QQ 群按钮绑定
- 已新增 `packages/client/src/main-ui-state-source.ts`
  - 统一接住 toast、HUD/world chrome、zoom chrome、viewport shell 与信息半径推导
- 已新增 `packages/client/src/main-panel-runtime-source.ts`
  - 统一接住 `panelSystem.store` 的 runtime/capabilities bridge、runtime shellVisible/mapId/connected 写回与 reset
- 已新增 `packages/client/src/main-breakthrough-state-source.ts`
  - 统一接住突破/天门弹层 owner、灵气等级基准写回与目标选择侧的灵气文案
- 已新增 `packages/client/src/main-detail-hydration-source.ts`
  - 统一接住详情链上的 `cloneJson / LootWindow / NpcShop / SyncedItemStack` hydration 冷路径转换
- 已新增 `packages/client/src/main-map-runtime-bridge-source.ts`
  - 统一接住 targeting/navigation/mapRuntime 查询、观察开关、键盘移动入口与 viewport 尺寸桥接
- 已新增 `packages/client/src/main-bootstrap-assembly.ts`
  - 统一接住应用入口 bootstrap、shell/map/socket 绑定装配与最终启动序列
- 已新增 `packages/client/src/main-runtime-view-types.ts`
  - 统一接住前台运行时实体视图类型与 `player/crowd` 判定 helper，避免 `main.ts`、delta owner、targeting/navigation bridge 各自定义一份
- 已新增 `packages/client/src/main-root-runtime-source.ts`
  - 统一接住 `myPlayer / latestEntities / latestEntityMap` 根状态 owner、可见实体只读访问和显示名/角色名写回
- 已新增 `packages/client/src/main-dom-elements.ts`
  - 统一接住主入口的 DOM 引用采集与 QQ 群入口常量，不再让 `main.ts` 自己堆满一整排 `getElementById/querySelector`
- 已新增 `packages/client/src/main-frontend-modules.ts`
  - 统一接住 `SocketManager / mapRuntime / panelSystem / LoginUI / HUD / ChatUI / 各面板与模态` 的入口资源创建
- 已新增 `packages/client/src/main-app-composition.ts`
  - 统一接住预加载入口与 `assembleMainApp(...)` 委托
- 已新增 `packages/client/src/main-app-runtime-assembly.ts`
  - 统一接住 `runtime context -> bootstrap runner` 的薄编排
- 已新增 `packages/client/src/main-app-runtime-context.ts`
  - 统一接住 `panel context + runtime owner context` 的薄编排
- 已新增 `packages/client/src/main-app-bootstrap-runner.ts`
  - 统一接住最终 `bootstrapMainApp(...)` 调用与启动动作桥接
- 已新增 `packages/client/src/main-app-panel-context.ts`
  - 统一接住 panel、detail hydration、notice、settings 等冷路径 owner 装配
- 已新增 `packages/client/src/main-app-runtime-owner-context.ts`
  - 统一接住 runtime、delta、mapRuntime bridge、connection、reset 这组高频 owner 装配
- 当前 `main.ts` 的低频结果分发不再直接散落在主文件底部
- 当前 `main.ts` 的 bootstrap/runtime/connection 绑定也不再直接散落在主文件中段与尾部
- 当前 `main.ts` 的观察弹层渲染和 reset 复位也已脱离主文件主体
- 当前 `main.ts` 的 shell 绑定和 map interaction 绑定也已脱离主文件主体
- 当前 `main.ts` 的路径状态、自动交互挂起和移动/靠近预览 owner 也已脱离主文件主体
- 当前 `main.ts` 的目标选择状态、targeting overlay 和感气 hover owner 也已脱离主文件主体
- 当前 `main.ts` 的 `WorldDelta / SelfDelta / PanelDelta` 高频 delta owner 也已脱离主文件主体
- 当前 `main.ts` 的 `Attr / Inventory / Equipment / Technique / Actions` 高频 merge owner 也已脱离主文件主体
- 当前 `main.ts` 的 FPS/时间/心跳/重连监控 owner 也已脱离主文件主体
- 当前 `main.ts` 的启动期 panel/HUD/window 绑定和外链按钮 wiring 也已脱离主文件主体
- 当前 `main.ts` 的 toast/HUD/world chrome/zoom shell owner 也已脱离主文件主体
- 当前 `main.ts` 的 `panelSystem.store` runtime bridge 也已脱离主文件主体
- 当前 `main.ts` 的突破/天门弹层 owner 也已脱离主文件主体
- 当前 `main.ts` 的详情 hydration 冷路径也已脱离主文件主体
- 当前 `main.ts` 的 targeting/navigation/mapRuntime bridge 也已脱离主文件主体
- 当前 `main.ts` 的应用入口 bootstrap、shell/map/socket 绑定装配与最终启动序列也已脱离主文件主体
- 当前 `main.ts` 的 `myPlayer / latestEntities / latestEntityMap` 根状态 owner 也已脱离主文件主体
- 当前 `main.ts` 的 DOM 引用采集和前台资源创建也已脱离主文件主体
- 当前 `main.ts` 已退成纯 app entry，不再直接承担主链装配与状态源 wiring
- 当前前台入口已固定成：
  - `main.ts -> initializeMainApp(...)`
  - `main-app-composition.ts -> scheduleDeferredLocalContentPreload() + assembleMainApp(...)`
  - `main-app-runtime-assembly.ts -> createMainAppRuntimeContext(...) + runMainAppBootstrap(...)`
  - `main-app-runtime-context.ts -> panel context + runtime owner context 薄编排`
  - `main-app-panel-context.ts -> panel/cold-path owner 装配`
  - `main-app-runtime-owner-context.ts -> runtime/high-frequency owner 装配`
- 已新增 `packages/client/scripts/check-client-mainline-boundaries.js`
  - 固定检查：
    - `main.ts <= 850`
    - `main-app-composition.ts <= 80`
    - `main-app-runtime-assembly.ts <= 80`
    - `main-app-runtime-context.ts <= 220`
    - `main-app-panel-context.ts <= 320`
    - `main-app-runtime-owner-context.ts <= 450`
    - `socket.ts <= 700`
    - `main.ts` 不再直接监听 socket 或直接绑定 startup/shell/map/socket 交互
    - `main.ts` 不再直接依赖共享协议类型、状态源 owner、DOM 查询和前台资源创建细节
    - `main-app-composition.ts` 只保留预加载入口和 `assembleMainApp(...)` 委托
    - `main-app-runtime-assembly.ts` 只保留 `runtime context -> bootstrap runner` 调度
    - `main-app-runtime-context.ts` 只保留 `panel context + runtime owner context` 调度
    - `main-app-panel-context.ts` 继续承接 panel/cold-path owner 装配
    - `main-app-runtime-owner-context.ts` 继续承接 runtime/delta/panel/mapRuntime bridge owner 装配
    - `socket.ts` 内部的事件分组、回调桶和生命周期/心跳不再混放在主文件
    - `socket.ts` 继续保留泛型 `on(...)` 消费入口与四组 sender owner
    - `gm.ts / gm-map-editor.ts / gm-world-viewer.ts / gm-panel.ts` 继续作为隔离 GM 工具链保留，且不被 `main.ts` 直接依赖
- `packages/client/package.json` 的 `build` 已接入 `proof:mainline-boundaries`
- 当前 proof 基线：
  - `main.ts = 28`
  - `main-app-composition.ts = 8`
  - `main-app-runtime-assembly.ts = 7`
  - `main-app-runtime-context.ts = 154`
  - `main-app-panel-context.ts = 251`
  - `main-app-runtime-owner-context.ts = 391`
  - `socket.ts = 179`

最小验证：

- `pnpm build:client`
- `pnpm build`

### 第 2 批：固定 `socket.ts` 为唯一消费层

- [x] 所有 `NEXT_S2C` 监听统一收在 `packages/client/src/network/socket.ts`
- [x] `main.ts` 及各面板不再直接各自监听 socket
- [x] 把事件消费明确分成：
  - 首包 / 低频静态
  - 高频 delta
  - 详情 / 请求返回
  - 结果 / notice / error

重点事件：

- `Bootstrap / InitSession / MapEnter / MapStatic`
- `WorldDelta / SelfDelta / PanelDelta`
- `Detail / TileDetail / AttrDetail`
- `Mail* / Market* / SuggestionUpdate / NpcShop`

最小验证：

- `pnpm build:client`
- `pnpm --filter @mud/server audit:protocol`

当前进展：

- `socket.ts` 继续保持唯一事件消费主入口
- `main-low-frequency-socket-bindings.ts` 与 `main-high-frequency-socket-bindings.ts` 只做注册分发，不让面板或模态自行监听 socket
- `SocketManager` 已新增泛型 `on(NEXT_S2C.*, cb)` 入口
- `socket.ts` 内部的 session/gameplay server event 绑定已改成按事件组循环注册，不再堆满一整排硬编码 `bindServerEvent(...)`
- `main-high-frequency-socket-bindings.ts` 与 `main-low-frequency-socket-bindings.ts` 已全部改为走泛型 `socket.on(...)`，原先那批 `onBootstrap / onWorldDelta / onMailSummary / onNpcShop ...` 协议特化订阅壳已从 `socket.ts` 删除
- 已新增：
  - `packages/client/src/network/socket-send-runtime.ts`
  - `packages/client/src/network/socket-send-panel.ts`
  - `packages/client/src/network/socket-send-social-economy.ts`
  - `packages/client/src/network/socket-send-admin.ts`
- 已新增：
  - `packages/client/src/network/socket-server-events.ts`
  - `packages/client/src/network/socket-event-registry.ts`
  - `packages/client/src/network/socket-lifecycle-controller.ts`
- `socket.ts` 的发送面已按：
  - 导航/战斗与运行时动作
  - 面板与工坊请求
  - 社交/邮件/市场
  - GM/调试
  四组 sender owner 收口，`SocketManager` 只保留连接/token、泛型 `on/emit` 和 sender getter
- 当前主链和前台面板已经开始直接依赖：
  - `runtime sender`
  - `panel sender`
  - `social-economy sender`
  - `admin sender`
  不再继续让 `main.ts`、`MailPanel`、`SuggestionPanel`、`startup bindings` 都直接盯 `SocketManager` 上的一长排 `sendX`
- `main-runtime-monitor-source.ts` 现在也直接依赖 `runtimeSender.sendPing(...)`
  - `SocketManager` 上原先那层 `sendPing` 薄委托已删除
- `socket.ts` 现在主要保留：
  - 连接 / token 入口
  - 泛型 `on(...)`
  - 泛型 `emit(...)`
  - 四组 sender getter
- 连接生命周期、心跳和事件回调桶都已从 `socket.ts` 主文件移出：
  - `socket-server-events.ts`
  - `socket-event-registry.ts`
  - `socket-lifecycle-controller.ts`
- GM 页面、GM 世界查看器、地图编辑器本轮已明确继续保留，但作为独立 GM 工具链存在，不并入玩家主线，也不作为当前 next cutover 阻塞项

### 第 3 批：收口地图与面板协议边界

- [x] 地图运行态继续只由：
  - `game-map/*`
  - `map-static-cache.ts`
  - `map-memory.ts`
  管理
- [x] 面板运行态继续只由 panel system / 面板模块管理
- [x] 不让地图状态和面板状态继续在 `main.ts` 里交叉污染

特别注意：

- 地图高频状态只消费增量，不回退成大对象重刷
- 当前阶段只保证协议状态正确落到客户端，不要求顺手重做地图/UI 表现层

当前进展：

- `Bootstrap / WorldDelta / SelfDelta / PanelDelta / MapStatic / Realm` 的高层状态 owner 已从 `main.ts` 抽到 `main-runtime-state-source.ts`
- `WorldDelta / SelfDelta / PanelDelta` 的高频 delta owner 已从 `main.ts` 抽到 `main-runtime-delta-state-source.ts`
- 地图高频 patch 的最终合并仍经 `mapRuntime` 落地，但高层 delta 组装、跨图复位和 movement-frame 后处理不再由主文件裸持有
- `Attr / Inventory / Equipment / Technique / Actions` 的高频 merge、玩家写回和面板/bridge 同步已从 `main.ts` 抽到 `main-panel-delta-state-source.ts`
- 观察弹层与 tile detail 结果落点已统一到 `main-observe-state-source.ts`
- reset 后的 UI/bridge/runtime 复位已统一到 `main-reset-state-source.ts`
- 路径预览、自动交互挂起、NPC/传送点点击后的靠近与触发已统一到 `main-navigation-state-source.ts`
- 目标选择状态、targeting overlay、sense-qi hover 与目标落点解析已统一到 `main-targeting-state-source.ts`
- 当前这些地图相关协议 owner 已不再出现在 `main.ts` 和 `main-app-composition.ts`，统一收口在 `main-app-runtime-context.ts` + 各对应 owner 文件中

最小验证：

- `pnpm build:client`
- 手工回归：
  - 地图移动
  - 小地图路径
  - 观察详情

### 第 4 批：按面板逐个收口状态来源

- [x] `action-panel.ts`
  - 首刀已完成：`ActionPanel` 的 callbacks、init/update/syncDynamic/clear 已从 `main.ts` 抽到 `packages/client/src/main-action-state-source.ts`，高频 actions 合并与 `myPlayer` 写回仍留在 `main.ts`
- [x] `inventory-panel.ts`
  - 已完成：inventory 状态来源与编排已从 `main.ts` 抽到 `packages/client/src/main-inventory-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`InventoryPanel` 保持原有 patch-first 更新路径
- [x] `market-panel.ts`
  - 只消费 market 相关低频结果与增量更新
  - 已完成：market 低频状态来源、`MarketPanel` 创建与结果分发已从 `main.ts` 抽到 `packages/client/src/main-market-state-source.ts`，`main.ts` 保留 socket 事件注册，`socket.ts` 仍保持唯一消费主入口，`MarketPanel` 内部渲染与请求行为保持不变
- [x] `mail-panel.ts`
  - 已完成：mail 低频状态来源与结果分发已从 `main.ts` 抽到 `packages/client/src/main-mail-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`MailPanel` 保持原有内部请求、渲染与 patch 行为
- [x] `quest-panel.ts`
  - 只消费 quest 相关状态
  - 已完成：quest 状态源与低频编排已从 `main.ts` 抽到 `packages/client/src/main-quest-state-source.ts`，后续 `NpcQuests / Quests / QuestNavigateResult` 的低频监听与结果分发也已收进 `main-detail-state-source.ts` 与 `main-low-frequency-socket-bindings.ts`，`socket.ts` 仍保持唯一事件消费层，`QuestPanel` 保持 patch-first
- [x] `world-panel.ts` 的低频详情链
  - 已完成：world leaderboard / world-summary 的低频状态来源、`WorldPanel` 回调 wiring 与详情弹层刷新已从 `main.ts` 抽到 `packages/client/src/main-world-summary-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`WorldPanel` 本体渲染不变
- [x] `settings-panel.ts`
  - 已完成：settings 低频编排与状态来源已从 `main.ts` 抽到 `packages/client/src/main-settings-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`SettingsPanel` 保持原有渲染/交互行为
- [x] `suggestion-panel.ts`
  - 已完成：suggestion 低频状态来源与结果分发已从 `main.ts` 抽到 `packages/client/src/main-suggestion-state-source.ts`，`socket.ts` 仍保持唯一事件消费层，`SuggestionPanel` 保持原有内部请求、渲染与交互行为
- [x] `attr-panel.ts` / `technique-panel.ts`
  - 区分按需详情与高频自我状态
  - 首刀已完成：attr 按需详情链 `sendRequestAttrDetail / onAttrDetail / applyAttrDetail` 已从 `main.ts` 抽到 `packages/client/src/main-attr-detail-state-source.ts`，高频 attr 自我状态仍留在 `main.ts`
  - 第二刀已完成：`TechniquePanel` 的 callbacks、init/update/syncDynamic/clear 已从 `main.ts` 抽到 `packages/client/src/main-technique-state-source.ts`，高频 technique 合并与 `myPlayer` 写回仍留在 `main.ts`

最小验证：

- `pnpm build:client`
- 手工回归：
  - 打开面板后触发低频刷新
  - 确认协议返回能落到正确面板状态

### 第 5 批：收口详情请求与模态数据入口

- [x] `detail-modal-host.ts`、`entity-detail-modal.ts`、`npc-shop-modal.ts`、`npc-quest-modal.ts`、`craft-workbench-modal.ts` 的详情请求入口继续统一走 `socket.ts` / `main.ts` 主链
- [x] 不让详情请求结果回流成各模块自行监听 socket
- [x] 当前阶段只保证详情数据来源单线，不要求顺手重做弹层交互与样式

当前进展：

- `Detail / TileDetail / AttrDetail / NpcShop / AlchemyPanel / EnhancementPanel / LootWindowUpdate` 的结果分发已统一进 `main-detail-state-source.ts`
- `socket.ts` 继续作为唯一 socket 事件消费主入口，`main-low-frequency-socket-bindings.ts` 只负责注册绑定，不让各模态或面板自行监听 socket

最小验证：

- `pnpm build:client`
- 手工回归：
  - 打开详情弹层
  - 触发一次低频刷新
  - 确认详情请求结果仍能正确落到当前界面

### 第 6 批：明确客户端本地派生边界

- [x] 只能由 Socket 增量驱动的状态：
  - 世界对象与位置
  - 玩家权威状态
  - 面板运行态 revision
  - 邮件/市场/建议等服务端文档状态
- [x] 允许客户端本地派生缓存的状态：
  - 当前 tab / 子 tab
  - 面板展开态
  - 当前排序/筛选
  - 当前详情弹层打开目标
  - 响应式布局状态

命令口径补充：

- 根级客户端构建主入口统一使用 `pnpm build:client`
- `pnpm build:client` 仅作为兼容别名保留，文档不再把它当主入口

不允许本地派生替代服务端权威的：

- 移动合法性
- 碰撞
- 战斗/结算
- 权限与邮件/市场真实状态

当前定稿口径：

- 只能由 Socket 增量驱动：
  - `Bootstrap / InitSession / MapEnter / MapStatic / Realm`
  - `WorldDelta / SelfDelta / PanelDelta`
  - `Detail / TileDetail / AttrDetail`
  - `Mail* / Market* / SuggestionUpdate / NpcShop / Quest*`
  - 玩家权威属性、背包、装备、功法、动作、世界对象、位置、掉落窗、排行榜和世界总览结果
- 允许客户端本地派生缓存：
  - 当前选中的 tab / 子 tab
  - 面板展开态与详情弹层打开目标
  - hover tile、targeting hover、路径预览 cells、observe modal 当前查看目标
  - 响应式 viewport、局部筛选/排序、tooltip 显示态
- 明确仍由服务端权威控制：
  - 移动合法性、碰撞、路径最终结果、战斗/结算、NPC/邮件/市场真实状态

### 第 7 批：后置的 UI 设计与终端形态回归

- [ ] 浅色模式
- [ ] 深色模式
- [ ] 手机模式

这批明确后置，不阻塞当前 next cutover。

至少检查：

- 文本对比度
- 弹层尺寸
- 面板关闭路径
- 点击命中范围
- 滚动路径

最小验证：

- `pnpm build:client`
- 参考 [docs/frontend-refactor/verification.md](../frontend-refactor/verification.md)

## 客户端保留/归档检查

- [x] 判断 `packages/client/src/gm.ts` 是否继续作为长期客户端主链的一部分
- [x] 判断 `gm-map-editor.ts` / `gm-map-editor-helpers.ts` 是否继续长期保留
- [x] 判断 `content/editor-catalog.ts` 是否继续作为客户端 generated 数据保留

这一步只做“是否保留”的判断，不在这里做内容/地图真源清理，真源清理由 `08` 负责。

## 收口检查表

- [x] `main.ts` 不再承担大量具体面板逻辑
- [x] `socket.ts` 成为唯一 socket 事件消费主入口
- [x] 地图、详情、面板的协议状态来源已收口到单线
- [x] 主要面板不再依赖旧协议或旧 UI 兼容逻辑
- [x] 已明确哪些 UI 工作后置，不阻塞当前 next cutover

## 本阶段不做的事

- 不在这里重做协议定义，协议真源由 `02/08` 负责。
- 不在这里处理内容或地图真源清理。
- 不在这里推进 UI 视觉设计、样式重写、主题统一或手机适配收口。
- 不把 patch-first 深化、交互细修、详情弹层体验统一作为当前阶段阻塞项。

## 完成定义

- [x] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑
- [x] `socket.ts` 成为唯一 socket 事件消费主入口
- [x] `main.ts` 与各状态源已能稳定承接 next 协议结果
- [x] 客户端达到“能和 next 新协议正常对接”的可切换状态

## 章节结论

- `07` 的 next 前台主链收口已完成。
- 当前未勾项仅剩明确后置的 UI 视觉、交互细修与终端适配检查，不再作为 next cutover 阻塞条件。
