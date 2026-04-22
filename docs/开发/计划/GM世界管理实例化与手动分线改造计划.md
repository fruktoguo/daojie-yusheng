# GM 世界管理实例化与手动分线改造计划

> 基于 `docs/map-system-architecture.md` 的实例化方向，以及当前 `packages/*` 主线代码现状制定。
>
> 本计划的目标不是一步到位完成 `instance_catalog`、分布式实例路由和完整实例持久化，而是先把“地图实例”从后台运行时能力推进到“GM 可见、可人工创建、可人工运营”的 next 主线能力。

---

## 现状诊断

当前主线已经有地图实例运行时，但 GM 世界管理仍然不是“实例主语”：

- `packages/client/src/gm-world-viewer.ts` 当前仍请求 `/api/gm/maps`，左侧列表展示的是地图模板，而不是实例。
- `packages/server/src/http/next/next-gm-map-runtime-query.service.ts` 当前仍把 GM 运行态窗口固定到 `public:${mapId}`，只能看默认公共实例。
- `packages/server/src/runtime/world/world-runtime.controller.ts` 已经有 `listInstances()` / `getInstance()` 这类实例只读能力，但 GM 前台没有接这条链。
- `packages/server/src/runtime/instance/map-instance.runtime.ts` 当前实例元数据只有 `instanceId / templateId / kind / persistent / owner*`，还没有“实例名字 / 分线预设 / PVP / 地块攻击”这组 GM 运营字段。
- `packages/server/src/runtime/world/world-runtime-lifecycle.service.ts` 启动阶段仍只会为每张地图创建一个 `public:${templateId}` 公共实例。
- `packages/server/src/runtime/world/world-runtime-player-session.service.ts` 当前玩家恢复与 fallback 仍默认回到公共实例，不存在“按线路自动分配”能力。

可以把当前状态理解成：

- 运行时已经“支持实例”
- GM 仍然“按模板看世界”
- 分线还没有成为正式的产品能力

---

## 本计划的目标

本轮要完成的目标：

- GM 世界管理左侧列表正式改为“实例列表”，不再以地图模板为主语。
- GM 在列表和详情里能直接看到实例名字、`instanceId`、所属模板、人数和分线能力标识。
- 每张地图默认存在两条基础公共线：
  - 和平线：PVE，作为默认公共实例
  - 真实线：允许更真实的世界规则
- 系统不做按人数自动扩线。
- GM 可以在世界管理里手动创建新的和平线或真实线。
- 第一版至少能让 GM 证明“某张地图已经真的分出多条实例”。

---

## 本轮边界

本轮明确不做的内容：

- 不做按在线人数或负载自动创建新实例。
- 不做玩家前台自助切线 UI。
- 不做完整 `instance_catalog` 真源和跨重启实例恢复。
- 不做多节点实例路由、lease、ownership epoch、跨节点迁移。
- 不把地图时间配置和 tick 速率从模板级直接改成实例级。
- 不把宗门、洞府、秘境这类私有实例体系一起并入本轮。

本轮默认采用的口径：

- 默认公共入口仍然是和平线。
- 玩家登录、重连、无效实例 fallback 仍然先回和平公共线。
- 真实线和手动扩出的实例，第一版主要通过 GM 管理和 GM 强制迁移来验证。

---

## 交付定义

本轮完成后，GM 世界管理应达到以下可见结果：

- [x] 左侧列表显示实例，而不是模板。
- [x] 同一地图至少能稳定看到两条默认实例：和平、真实。
- [x] 每条实例都能显示实例名、`instanceId`、地图名、人数、分线预设。
- [x] 每条实例都能显示 `PVP` / `可攻击地块` 两个能力标识。
- [x] GM 可以手动创建新的和平线或真实线。
- [x] 系统不会因为人多自动扩线。
- [x] GM 至少能把一个玩家迁移到指定实例，以验证新实例不是“空壳”。

---

## 阶段 0：冻结语义与命名口径

### 0.1 实例主语收口

- [x] 明确 GM 世界管理、实例列表、实例运行态查看、实例手动创建全部以 `instanceId` 为第一主键。
- [x] 明确地图模板只作为静态底图与归属信息，不再作为世界管理主视图主语。
- [x] 明确“世界管理看到的是实例状态”，不是“地图模板的公共投影”。

### 0.2 分线预设口径

- [x] 冻结两种基础分线预设：
  - `peaceful`：和平线，默认公共实例，PVE
  - `real`：真实线，非默认入口
- [x] 冻结实例能力字段：
  - `supportsPvp`
  - `canDamageTile`
- [x] 明确第一版不从现有战斗/地块规则里临时推导这两个字段，而是把它们收成实例元数据真值。

### 0.3 实例 ID 与展示名规则

- [x] 冻结默认和平公共线 ID：`public:${templateId}`
- [x] 冻结默认真实线 ID：`real:${templateId}`
- [x] 冻结 GM 手动扩线 ID：`line:${templateId}:${preset}:${index}`
- [x] 冻结默认展示名生成规则：
  - 和平公共线：`${mapName}·和平`
  - 默认真实线：`${mapName}·真实`
  - 手动和平线：`${mapName}·和平-${index}`
  - 手动真实线：`${mapName}·真实-${index}`
- [x] 收口实例 ID 解析 helper，禁止在恢复链、GM 链、运行态查询链里继续手写 `public:${mapId}` 或直接字符串截断推模板。

### 0.4 兼容策略

- [x] 保留“和平公共线 = 默认 fallback 落点”的兼容语义。
- [x] 保留旧 `/api/gm/maps/:mapId/runtime` 作为兼容壳，默认只映射到和平公共线，待 GM 前台切换完成后再决定是否继续保留。
- [x] 保留 `packages/server/src/runtime/world/world-runtime.controller.ts` 现有 `/runtime/instances` 只读面，优先复用而不是重复造一套实例查询逻辑。

---

## 阶段 1：实例元数据正式进入运行时主链

### 1.1 扩充实例元数据

- [x] 在 `MapInstanceRuntime` 的 `meta` 中新增：
  - `displayName`
  - `linePreset`
  - `lineIndex`
  - `instanceOrigin`
  - `supportsPvp`
  - `canDamageTile`
- [x] 明确 `kind` 不再承担“和平/真实线”语义，避免继续把“实例生命周期分类”和“GM 运营分线分类”混为一谈。
- [x] 为手动实例补上 `instanceOrigin='gm_manual'`，为启动默认实例补上 `instanceOrigin='bootstrap'`。

### 1.2 扩充实例快照

- [x] 扩充实例 `snapshot()` 返回结构，让实例列表天然带出：
  - `instanceId`
  - `displayName`
  - `templateId`
  - `linePreset`
  - `lineIndex`
  - `supportsPvp`
  - `canDamageTile`
  - `instanceOrigin`
  - `playerCount`
  - `tick`
  - `worldRevision`
- [x] 明确 GM 实例列表优先吃实例快照，不再重新拼模板摘要。

### 1.3 预设工厂与解析 helper

- [x] 新建“实例预设 -> 元数据”工厂函数，统一和平/真实线的默认字段生成逻辑。
- [x] 新建“实例 ID -> 描述对象”解析 helper，统一提取 `templateId / preset / index`。
- [x] 将默认显示名生成逻辑收成 helper，避免 GM、runtime、后续持久化各自拼装。

---

## 阶段 2：启动默认分线与运行时创建能力

### 2.1 启动默认实例

- [x] 修改 `WorldRuntimeLifecycleService.bootstrapPublicInstances()`，从“每图一个公共实例”改为“每图两条默认公共线”。
- [x] 启动时为每张地图创建：
  - `public:${templateId}` 和平公共线
  - `real:${templateId}` 默认真实线
- [x] 两条默认实例都纳入实例注册表和 runtime summary。
- [x] 明确和平公共线继续 `persistent: true`。
- [x] 明确真实线第一版是否 `persistent: true`：
  - 推荐第一版也保持 `persistent: true`，避免重启前后语义完全不同
  - 但不纳入正式 `instance_catalog` 目录化设计

### 2.2 禁止自动扩线

- [x] 明确玩家接入、重连、顶号恢复、复生、跨图 fallback 都不触发“按人数自动创建实例”。
- [x] 检查 `connectPlayer()`、`resolveTargetInstance()`、默认 respawn/fallback 链，确保只会回到和平公共线，不会因为满员或人多自动新建线路。
- [x] 为“不自动扩线”补一条 focused smoke / proof。

### 2.3 运行时手动建线能力

- [x] 在 world runtime 主链提供“按模板 + preset 手动创建实例”的明确入口。
- [x] 创建逻辑统一走实例工厂，不允许 GM 直接拼裸实例对象。
- [x] 创建时自动分配：
  - 稳定 `instanceId`
  - `displayName`
  - `linePreset`
  - `lineIndex`
  - `supportsPvp`
  - `canDamageTile`
- [x] 同模板同预设下，`lineIndex` 自动递增，不覆盖已有实例。
- [x] 创建失败时返回明确错误：
  - 模板不存在
  - `instanceId` 冲突
  - 预设非法

---

## 阶段 3：GM 服务端实例管理接口

### 3.1 列表与详情接口

- [x] 新增 `GET /api/gm/world/instances`：
  - 返回实例列表，而不是模板列表
  - 每项至少包含实例元数据、人数、tick、版本、基础尺寸
- [x] 新增 `GET /api/gm/world/instances/:instanceId/runtime`：
  - 返回指定实例运行态窗口
  - 取代旧 `GET /api/gm/maps/:mapId/runtime` 作为世界管理主接口
- [x] 新增“按模板聚合”的响应字段或前台分组信息，避免实例多起来后 GM 列表失控。

### 3.2 创建接口

- [x] 新增 `POST /api/gm/world/instances`：
  - 输入：`templateId`、`linePreset`、可选 `displayName`
  - 输出：新实例摘要
- [x] 创建接口只允许创建“和平线 / 真实线”两种公共运营实例，不开放任意 owner/party/sect 语义。
- [x] 若未提供 `displayName`，服务端自动生成默认实例名。

### 3.3 玩家迁移接口

- [x] 新增最低限度 GM 玩家迁移入口：
  - 把指定玩家迁移到指定 `instanceId`
  - 作为验证真实线和手动扩线的最低可用能力
- [x] 迁移接口至少校验：
  - 目标实例存在
  - 玩家在线
  - 玩家当前不在非法状态
- [x] 第一版允许 GM 强制迁移，不要求前台玩家自助切线。

### 3.4 兼容接口策略

- [x] 旧 `GET /api/gm/maps` 暂时保留给地图编辑与其他模板用途，不再作为世界管理实例列表数据源。
- [x] 旧 `GET /api/gm/maps/:mapId/runtime` 改成明确说明“和平公共线兼容视图”，避免误读成“地图完整运行态”。

---

## 阶段 4：Shared 协议与 GM 合同更新

### 4.1 新增实例管理协议

- [x] 在 `packages/shared` 中新增或补充 GM 实例管理相关合同：
  - `GmWorldInstanceSummary`
  - `GmWorldInstanceListRes`
  - `GmWorldInstanceRuntimeRes`
  - `GmCreateWorldInstanceReq`
  - `GmTransferPlayerToInstanceReq`
- [x] 让 GM 实例合同显式带出：
  - `instanceId`
  - `displayName`
  - `templateId`
  - `templateName`
  - `linePreset`
  - `lineIndex`
  - `instanceOrigin`
  - `supportsPvp`
  - `canDamageTile`
  - `playerCount`

### 4.2 旧合同退场

- [x] 逐步把 `GmMapSummary` 从“世界管理主列表”退回到“地图模板列表”语义。
- [x] 逐步把 `GmMapRuntimeRes` 从“地图公共运行态”退回到旧兼容接口语义。
- [x] 新世界管理主视图只使用实例合同，不再拿模板合同做二次脑补。

---

## 阶段 5：GM 前台世界管理切到实例视角

### 5.1 左侧列表改造

- [x] `gm-world-viewer` 左侧列表从模板列表切换为实例列表。
- [x] 列表项主标题显示实例名，副标题显示 `instanceId`。
- [x] 列表项补充显示：
  - 所属地图名
  - 当前人数
  - 分线预设
  - `PVP` 标识
  - `地块攻击` 标识
  - `默认线 / 手动线` 标识
- [x] 列表按 `templateId` 分组展示，优先保证“同地图的和平/真实/手动扩线”能一眼看全。

### 5.2 运行态查看改造

- [x] 当前选中键从 `mapId` 改为 `instanceId`。
- [x] 世界查看器运行态轮询改为请求实例运行态接口。
- [x] 选中实例后，相机、选中格、选中实体行为保持现有体验，不因实例切换逻辑重构而破坏交互连续性。

### 5.3 信息面板改造

- [x] 信息面板顶部从“地图信息”改为“实例信息”。
- [x] 直接显示：
  - 实例名
  - `instanceId`
  - 所属模板名 / `templateId`
  - 分线预设
  - `PVP`
  - `可攻击地块`
  - 当前人数
  - tick / world revision
- [x] 若当前实例是和平公共线，明确显示“默认公共入口”标识。

### 5.4 手动扩线操作区

- [x] 在世界管理页新增“创建实例”操作区。
- [x] 允许选择：
  - 模板
  - 分线预设
  - 可选实例名字
- [x] 创建完成后立即刷新实例列表，并自动可见新实例。

### 5.5 玩家迁移操作区

- [x] 在实例详情或玩家快捷操作里提供“迁移到当前实例”能力。
- [x] 操作成功后实例人数和玩家位置相关显示要能立即反映变化。

---

## 阶段 6：运行时规则与默认入口收口

### 6.1 默认入口规则

- [x] 明确登录、重连、实例失效 fallback 一律回到和平公共线。
- [x] 明确真实线不是默认入口，除非后续专门开放切线策略。
- [x] 明确跨图 portal 第一版仍按现有地图语义工作，不自动把玩家送入真实线或手动扩出的线。

### 6.2 PVP 与地块攻击能力的实例化

- [x] 将 `supportsPvp` 视为实例级显式能力，不再让 GM 只能靠安全区或历史玩法猜测。
- [x] 将 `canDamageTile` 视为实例级显式能力，不再让 GM 只能靠“这个实例里地块有耐久系统”间接判断。
- [x] 在玩家攻击、技能、地块受击链路中补入实例级能力守卫：
  - 不支持 PVP 的实例禁止玩家互攻
  - 不允许地块攻击的实例禁止 `damageTile`
- [x] 保持安全区规则继续生效；安全区是“实例内局部禁攻”，不替代实例级 `supportsPvp=false` 的全局禁攻语义。

### 6.3 真实线的最低规则定义

- [x] 冻结默认真实线能力：
  - `supportsPvp = true`
  - `canDamageTile = true`
- [x] 冻结默认和平线能力：
  - `supportsPvp = false`
  - `canDamageTile = false`
- [x] 第一版不做更细颗粒度规则矩阵，先把这两条主能力立住。

---

## 阶段 7：验证与证明链

### 7.1 Focused smoke

- [x] 新增启动默认分线 smoke：
  - 每张地图启动后至少有 `public:${templateId}` 与 `real:${templateId}`
- [x] 新增 GM 实例列表 smoke：
  - 列表确实返回实例，不是模板
- [x] 新增 GM 实例运行态 smoke：
  - 指定 `instanceId` 可读取运行态窗口
- [x] 新增 GM 手动扩线 smoke：
  - 创建同模板新实例成功
  - 元数据正确
  - 不覆盖已有实例
- [x] 新增“禁止自动扩线” smoke：
  - 多玩家接入不会自动生成新实例
- [x] 新增实例能力守卫 smoke：
  - 和平线禁止 PVP
  - 和平线禁止地块攻击
  - 真实线允许对应行为

### 7.2 现有链路回归

- [x] 补跑与实例读取、玩家接入、传送、复生相关的 focused smokes。
- [x] 检查 `connectPlayer()` / `resolveTargetInstance()` / fallback 行为未打坏和平公共线默认入口。
- [x] 检查 GM 世界管理轮询切换到实例接口后，不影响原有地图编辑等模板接口。

### 7.3 交付前验证

- [x] `pnpm build`
- [x] 至少一轮与实例主链直接相关的 focused smokes
- [x] 如本轮改动触及 `client/shared/server` 三端，补跑一轮根级 `pnpm verify:replace-ready`
  - 已在最新代码状态下重新执行并通过
- [x] 手工验证 GM 世界管理：
  - 能看到和平/真实两条默认实例
  - 能手动新建实例
  - 能看到实例名字与标识
  - 能把玩家迁移进目标实例
  - 已于 2026-04-22 在本地 `http://127.0.0.1:15173/gm.html` 实测通过：登录 GM 后可见默认双线，已手动创建 `line:yunlai_town:real:2`，并将在线玩家 `p_45ee04fa-8723-40f4-96c8-03a8014fd8f1` 迁入该实例，实例列表与详情中的 `playerCount` 已同步更新为 `1`

---

## 阶段 8：文档与兼容收口

### 8.1 文档同步

- [x] 更新 `docs/map-system-architecture.md` 的“当前主链”部分，说明默认已落地和平/真实双线，而不是“每图只有一个公共实例”。
- [x] 更新 `docs/next-system-module-api-inventory.md`，补上 GM 实例管理接口与合同。
- [x] 如旧 `gm/maps/:mapId/runtime` 继续保留，明确标注其兼容定位，避免继续误导为“实例视图”。

### 8.2 代码注释与边界

- [x] 在实例 ID helper、实例预设工厂、GM 实例服务中补上简洁中文注释，固定“公共和平线 / 默认真实线 / 手动扩线”的口径。
- [x] 删除或替换掉继续把“模板 = 世界管理主语”的陈旧注释与命名。

---

## 本轮完成标准

以下条件同时满足，才算本计划首轮完成：

- [x] GM 世界管理主列表已经彻底改成实例列表。
- [x] 默认和平/真实双线已在启动主链中落地。
- [x] GM 可以直接看到实例名字、实例标识和分线能力标识。
- [x] GM 可以手动创建新的和平线或真实线。
- [x] 系统不会自动扩线。
- [x] 玩家默认仍进入和平公共线。
- [x] 至少具备最低限度的 GM 强制迁移能力，可验证新实例不是空壳。
- [x] 已补最小必要验证，并明确当前仍未做 `instance_catalog` 和跨重启实例恢复。

---

## 后续阶段（不纳入本轮交付）

- [ ] `instance_catalog` 正式真源
- [ ] 手动创建实例跨重启恢复
- [ ] 玩家前台自助切线
- [ ] 线路容量、负载、自动扩线策略
- [ ] 宗门/洞府/秘境专属实例类型
- [ ] 多节点实例 ownership / lease / fencing
- [ ] 跨节点玩家迁移与玩家会话路由
