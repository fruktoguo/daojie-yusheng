# 道劫余生 项目全面审查报告

**审查日期**: 2026-05-12  
**审查范围**: packages/shared、packages/server、packages/client、packages/config-editor、构建/CI/CD、Docker 部署

---

## 总览

| 严重程度 | 数量 |
|---------|------|
| 高 | 3 |
| 中 | 18 |
| 低 | 15 |

---

## 一、高严重度问题

### 1.1 GM 默认不安全密码可能暴露到生产环境

- **位置**: `packages/server/src/http/native/native-gm-contract.ts` 行 23
- **内容**: `defaultInsecurePassword: 'admin123'`
- **描述**: GM 鉴权有硬编码的不安全默认密码。虽然有环境变量守卫（`resolveServerAllowInsecureLocalGmPassword` 只在 development/dev/local/test 环境允许），但如果 `NODE_ENV` 未正确设置或被误配，生产环境可能暴露弱密码
- **风险**: 攻击者可用 admin123 获取 GM 权限，操控游戏数据
- **建议**: 生产环境启动时如果未配置 `SERVER_GM_PASSWORD` 且不在开发环境，应直接拒绝启动而非回退默认密码

### 1.2 生产 Redis 无密码保护

- **位置**: `docker-stack.yml` 行 139-151
- **描述**: 生产 docker-stack.yml 中 Redis 服务没有配置密码（无 `requirepass`），且服务端环境变量中没有 `SERVER_REDIS_URL`。对比 `docker-compose.yml`（开发环境）有 `--requirepass` 配置。虽然 Redis 在 overlay 网络内不对外暴露，但同网络内的任何容器都可以无认证访问 Redis
- **风险**: 如果攻击者获得同网络内任何容器的访问权，可直接操作 Redis 数据
- **建议**: 为生产 Redis 添加密码认证，通过环境变量注入；服务端连接时使用带密码的 URL

### 1.3 CI/CD `pnpm install --frozen-lockfile || pnpm install` 回退不安全

- **位置**: `.github/workflows/deploy.yml` 行 41、72、122
- **描述**: 如果 `--frozen-lockfile` 失败（lockfile 与 package.json 不一致），会回退到无锁定的 `pnpm install`，可能在生产构建中引入未经审查的依赖版本变更
- **风险**: 供应链攻击窗口——恶意包版本可能在 lockfile 不一致时被拉入生产构建
- **建议**: 移除 `|| pnpm install` 回退，让 CI 在 lockfile 不一致时直接失败，强制开发者先更新 lockfile

---

## 二、中严重度问题

### 2.1 服务端 626 处 `any` 类型使用

- **位置**: 86 个文件，重点：
  - `src/network/world.gateway.ts` (94 处)
  - `src/runtime/world/world-runtime.service.ts` (75 处)
  - `src/runtime/world/combat/world-runtime-player-combat.service.ts` (30 处)
  - `src/runtime/world/world-runtime-tick-dispatch.service.ts` (全文无类型标注)
  - `src/network/world-sync.service.ts` (构造器注入全部 any)
- **描述**: 核心运行时和网络层大量使用 `any`，完全绕过 TypeScript 类型检查
- **风险**: 编译期无法发现参数传错、字段拼写错误，重构时极易引入隐蔽 bug
- **建议**: 逐步为核心服务定义接口端口类型（如已有的 `PlayerRuntimeFlushPort` 模式），替换 `any` 注入

### 2.2 硬编码开发 JWT 密钥在公开仓库

- **位置**: `packages/server/src/network/world-player-token-codec.service.ts` 行 21
- **内容**: `DEFAULT_DEV_PLAYER_TOKEN_SECRET = 'daojie-yusheng-dev-secret'`
- **描述**: 开发环境回退密钥公开在源码中。代码已有守卫（非开发环境会 throw），但密钥泄露在公开仓库
- **风险**: 如果有人在非标准环境中误用开发密钥，token 可被伪造
- **建议**: 已有正确的生产守卫，可接受。建议在启动日志中明确警告正在使用开发密钥

### 2.3 频率限制 buckets Map 无上限增长

- **位置**: `packages/server/src/http/native/native-auth-rate-limit.service.ts`
- **描述**: `buckets` Map 只在访问时惰性清理过期桶，没有定期 GC。如果攻击者用大量不同 IP 发起请求，Map 会无限增长直到 OOM
- **风险**: 持续攻击可导致服务端内存耗尽
- **建议**: 添加定期清理定时器（如每 5 分钟扫描过期桶），或设置 Map 最大容量上限

### 2.4 玩家 flush 与 tick 的潜在竞态

- **位置**: `packages/server/src/persistence/player-persistence-flush.service.ts` + `packages/server/src/runtime/tick/world-tick.service.ts`
- **描述**: flush 定时器（5s）和 tick 定时器（1s）独立运行。`advanceFrame` 是 async 的，如果 flush 在 tick 的 await 点执行，可能读到中间状态
- **风险**: 持久化快照可能包含不一致的中间状态，恢复时产生数据错误
- **建议**: 在 tick 完成后标记脏域，flush 只读取已完成 tick 后的稳定快照；或在 flush 前检查 tickInFlight

### 2.5 tick 热路径中的 await 调用

- **位置**: `packages/server/src/runtime/world/world-runtime-instance-tick-orchestration.service.ts` 行 ~80, ~100
- **描述**: tick 热路径中有多个 await 调用（`dispatchPendingCommands`、`resolvePendingPlayerSkillCast`、`advanceCraftJobs`）
- **风险**: 如果这些方法内部有数据库 IO 或其他异步操作，会显著增加 tick 延迟，影响所有玩家体验
- **建议**: 确认这些 await 是否真的需要异步；如果只是同步逻辑包装成 async，去掉 await

### 2.6 tick-dispatch 核心调度层完全无类型标注

- **位置**: `packages/server/src/runtime/world/world-runtime-tick-dispatch.service.ts` 全文
- **描述**: 所有方法参数完全无类型标注（`playerId, deps` 等），是纯 JS 风格代码放在 .ts 文件中
- **风险**: 核心调度层缺乏类型安全，任何参数传递错误都无法在编译期发现
- **建议**: 为 deps 定义接口类型，为所有方法参数添加类型标注

### 2.7 客户端事件监听器严重泄漏风险

- **位置**: 全局统计 — `addEventListener` 549 次 vs `removeEventListener` 仅 13 次
- **重点文件**:
  - `src/input/mouse.ts` 行 79-81：匿名箭头函数绑定 click/mousemove/mouseleave，无法移除
  - `src/ui/panels/action-panel.ts`（77 次 addEventListener）
  - `src/ui/panels/inventory-panel.ts`（32 次）
  - `src/game-map/minimap/`（32 次）
- **描述**: 大量 UI 面板注册了事件监听器但从未清理。在断线重连、切图等场景下如果面板被重建，旧监听器会泄漏
- **风险**: 长时间运行后内存持续增长，移动端尤其敏感
- **建议**: 对会被销毁/重建的面板提供 `dispose()` 方法统一清理；MouseInput 改用命名方法引用并提供 `detach()`

### 2.8 客户端 27 处 `as any` 绕过类型系统

- **位置**:
  - `src/ui/panels/market-browse-view.ts` 行 417-439：`(this.panel as any)` 访问属性
  - `src/ui/craft-workbench-modal.ts` 行 384-386：`new CraftAlchemyView(this as any)`
  - `src/ui/panels/market-auction-view.ts` 行 410-413：`(p as any).tradeDialogView`
  - `src/main-notice-state-source.ts` 行 179, 288：`(item as any)._combatGroup`
  - `src/main-panel-runtime-source.ts` 行 60, 65：`runtime: any`
- **描述**: 通过 `as any` 绕过类型系统访问未声明的属性，说明接口定义不完整
- **风险**: 重构时这些隐式依赖极易被破坏且编译器不会报错
- **建议**: 扩展相关接口类型定义，将隐式属性正式纳入类型

### 2.9 escapeHtml 函数在 20+ 个文件中重复定义

- **位置**: market-panel.ts、mail-panel.ts、craft-workbench-modal.ts、npc-shop-modal.ts、entity-detail-modal.ts、skill-tooltip.ts、heaven-gate-modal.ts、floating-tooltip.ts、craft-alchemy-view.ts、npc-quest-modal.ts、loot-panel.ts、body-training-panel.ts、world-panel.ts、suggestion-panel.ts、item-inline-tooltip.ts、market-browse-view.ts、market-auction-view.ts 等
- **描述**: 完全相同的 `escapeHtml` 和 `escapeHtmlAttr` 实现在至少 20 个文件中各自独立定义
- **风险**: 如果某个副本有 bug 修复而其他未同步，会产生不一致的安全行为
- **建议**: 提取到 `src/utils/html-escape.ts` 统一导出

### 2.10 客户端地图交互层只处理鼠标事件

- **位置**: `src/game-map/interaction/interaction-controller.ts` 行 38-40
- **描述**: 只绑定了 `click`、`mousemove`、`mouseleave`，没有处理 touch 事件。移动端浏览器虽会合成 click，但无触摸悬停反馈、无长按手势、无触摸精度补偿
- **风险**: 移动端玩家体验受限，无法精确选择小目标
- **建议**: 使用 pointer events（pointerdown/pointermove/pointerup）统一处理，考虑触摸命中区域放大

### 2.11 InteractionController 实体查找使用 O(N) 线性搜索

- **位置**: `src/game-map/interaction/interaction-controller.ts` 行 126
- **内容**: `snapshot.entities.find((entry) => entry.wx === x && entry.wy === y)`
- **描述**: 每次 mousemove 事件都做 O(N) 线性搜索。在多实体场景下（50+ 实体），mousemove 频率很高
- **风险**: 低端设备上可能造成交互卡顿
- **建议**: 在 MapStore 中维护 `entityByPosition: Map<string, Entity>` 索引，O(1) 查找

### 2.12 Protobuf Schema 与 TypeScript 类型不完全同步

- **位置**: `packages/shared/src/network-protobuf-schema.ts` vs `packages/shared/src/world-patch-types.ts`
- **描述**: `TickRenderEntityView` 包含约 12 个 formation 相关字段，但 protobuf schema 的 `TickRenderEntityPayload` 中完全没有这些字段。当前 protobuf 编码未启用（`PROTOBUF_S2C_EVENTS` 为空集），不影响运行时
- **风险**: 一旦启用 protobuf 编码，这些字段会丢失
- **建议**: 在 protobuf schema 中补齐 formation 相关字段，或在检查脚本中增加字段覆盖率检查

### 2.13 Docker Stack 无服务启动顺序保证

- **位置**: `docker-stack.yml`
- **描述**: Docker Swarm 模式不支持 `depends_on`，server 和 backup-worker 可能在 postgres/redis 就绪前启动。虽然 server 有 healthcheck 和 restart policy，但首次启动时可能产生多次失败重启
- **风险**: 首次部署或 postgres 重启后，server 可能短暂不可用
- **建议**: 在 server 启动脚本中添加等待 postgres 就绪的逻辑（如 `pg_isready` 循环），或接受当前 restart policy 的自愈行为

### 2.14 Docker Stack 无资源限制

- **位置**: `docker-stack.yml` 全文
- **描述**: 所有服务（server、client、postgres、redis、backup-worker）都没有配置 `resources.limits`（CPU/内存限制）
- **风险**: 单个服务内存泄漏或 CPU 飙升可能影响同主机其他服务
- **建议**: 为每个服务添加合理的资源限制，特别是 server 和 postgres

### 2.15 config-editor 跨包相对路径导入

- **位置**: `packages/config-editor/src/main.ts` 行 41
- **内容**: `import { GmMapEditor } from '../../../packages/client/src/gm-map-editor';`
- **描述**: config-editor 通过三层相对路径直接导入 client 包的源文件，绕过了包边界
- **风险**: client 内部重构（如移动 gm-map-editor.ts）会直接破坏 config-editor 构建；且 config-editor 的 tsconfig 可能无法正确解析 client 的依赖
- **建议**: 将 GmMapEditor 提取为独立的共享模块，或通过 workspace 依赖正式引用

### 2.16 config-editor 单文件 103KB

- **位置**: `packages/config-editor/src/main.ts`（103KB）
- **描述**: 整个配置编辑器的前端逻辑集中在单个 103KB 的 TypeScript 文件中
- **风险**: 维护困难，IDE 性能下降，无法按功能模块懒加载
- **建议**: 按页签（maps/monsters/skills/files/service）拆分为独立模块

### 2.17 客户端巨型文件影响开发效率和加载

- **位置**:
  - `src/gm.ts`（332KB）
  - `src/ui/panels/action-panel.ts`（245KB）
  - `src/gm-map-editor.ts`（174KB）
  - `src/ui/craft-workbench-modal.ts`（172KB）
  - `src/renderer/text.ts`（118KB）
  - `src/styles/panels.css`（316KB）
  - `src/constants/ui/i18n.generated.ts`（431KB）
- **描述**: 多个文件超过 100KB，增加 IDE 解析时间。如果 GM 工具未做懒加载，会增加普通玩家首屏体积
- **风险**: 开发效率下降；普通玩家可能加载不需要的 GM 代码
- **建议**: 确认 GM 工具已做路由级懒加载（dynamic import）；对 action-panel 按子视图拆分

### 2.18 main-runtime-monitor-source 定时器无统一 dispose

- **位置**: `packages/client/src/main-runtime-monitor-source.ts` 行 ~810
- **描述**: `initialize()` 中创建了 `currentTimeIntervalId`、`connectionRecoveryTimer`、`pingTimer` 等多个定时器，但没有提供统一的 `dispose()` 方法
- **风险**: 如果需要热重载或模块替换，定时器会泄漏
- **建议**: 添加 `dispose()` 方法统一清理所有定时器

---

## 三、低严重度问题

### 3.1 shared 包构建不清理 dist 目录

- **位置**: `packages/shared/package.json` build 脚本
- **描述**: build 脚本直接运行 `tsc`，不先清理 `dist/`。已删除的源文件（如旧的 `types.ts`）的编译产物残留在 dist 中
- **建议**: 在 build 脚本开头加 `rimraf dist &&`

### 3.2 protobufjs 依赖使用 caret 范围

- **位置**: `packages/shared/package.json` 行 18
- **内容**: `"protobufjs": "^7.5.4"`
- **描述**: 核心序列化依赖使用 caret 范围而非精确版本
- **建议**: 改为精确版本 `"7.5.4"`（当前已有 lockfile 保护，风险可控）

### 3.3 network-protobuf.ts 编解码函数为空壳

- **位置**: `packages/shared/src/network-protobuf.ts` 行 63-89
- **描述**: `encodeServerEventPayload`、`decodeServerEventPayload`、`encodeClientEventPayload` 三个函数无论事件是否在 protobuf 集合中，都直接返回原始 payload
- **建议**: 在函数注释中明确说明"当前主线未启用 protobuf 二进制传输，为预留接口"

### 3.4 shared 包缺少 `"exports"` 字段

- **位置**: `packages/shared/package.json`
- **描述**: 只有 `"main"` 和 `"types"` 字段，消费者理论上可以直接 `import from '@mud/shared/dist/xxx'` 绕过入口
- **建议**: 添加 `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`

### 3.5 服务端 180 个工具文件使用 `// @ts-nocheck`

- **位置**: `packages/server/src/tools/` 目录下 180 个 smoke/bench/audit 文件
- **描述**: 所有工具/测试文件完全禁用类型检查
- **建议**: 按 AGENTS.md 规范，修改时逐步迁移为规范 TS

### 3.6 服务端频率限制硬编码为统一 60 次/秒

- **位置**: `packages/server/src/network/world.gateway.ts` 行 ~130
- **内容**: `this.gatewayGuardHelper.checkRateLimit(client, event, 60, 1000)`
- **描述**: 所有事件统一 60 次/秒限制，无法按事件类型差异化配置
- **建议**: 考虑按事件类型配置不同限流阈值（如移动 vs 聊天 vs 交易）

### 3.7 服务端 flush 间隔/批次参数硬编码

- **位置**: `packages/server/src/persistence/player-persistence-flush.service.ts` 行 17-19
- **内容**: `FLUSH_INTERVAL_MS = 5000, BATCH_SIZE = 24, PARALLELISM = 4`
- **描述**: 核心持久化参数硬编码，运维调优需改代码
- **建议**: 通过环境变量支持运行时配置

### 3.8 map-document.ts 使用 JSON.parse(JSON.stringify()) 深拷贝

- **位置**: `packages/shared/src/map-document.ts` 行 47
- **描述**: `clone<T>` 函数使用 JSON 中转深拷贝，同文件已有 `clonePlainValue` 替代方案
- **建议**: 可选择性迁移到 `clonePlainValue`，优先级低（仅用于编辑器冷路径）

### 3.9 渲染循环中的字符串键拼接

- **位置**: `packages/client/src/renderer/text.ts` 行 ~1150
- **描述**: 每帧渲染的双重循环中，每个格子都执行 `` `${gx},${gy}` `` 字符串拼接查找 tileCache。大视野下每帧产生 900+ 临时字符串
- **建议**: 可考虑数值索引（`y * width + x`），但 V8 内联缓存通常能处理

### 3.10 mousemove 中每次调用 getBoundingClientRect

- **位置**: `src/input/mouse.ts` 行 107、`src/game-map/interaction/interaction-controller.ts` 行 107
- **描述**: 每次 mousemove 事件都调用 `canvas.getBoundingClientRect()`
- **建议**: 在 resize 时缓存 rect，mousemove 时直接使用缓存值

### 3.11 version-reload 的 visibilitychange 监听器永不清理

- **位置**: `packages/client/src/version-reload.ts` 行 155
- **描述**: 注册了 `visibilitychange` 事件但没有提供清理机制
- **建议**: 返回清理函数或提供 `stop()` 方法

### 3.12 SocketServerEventRegistry 的回调桶无 clear 方法

- **位置**: `packages/client/src/network/socket-event-registry.ts` 行 25-35
- **描述**: `callbacks` 对象只有 `push` 操作，没有 `off()` 或 `clear()` 方法
- **建议**: 添加 `clear()` 方法以支持未来的热重载场景

### 3.13 server Dockerfile 复制了全部 node_modules

- **位置**: `packages/server/Dockerfile` 行 20
- **内容**: `COPY --from=builder /app/node_modules ./node_modules`
- **描述**: 复制了根级 node_modules（包含所有 workspace 依赖），而非只复制 server 需要的生产依赖
- **建议**: 使用 `pnpm deploy` 或 `pnpm prune --prod` 只打包生产依赖，减小镜像体积

### 3.14 GM state 中 JSON.stringify 计算包体大小

- **位置**: `packages/server/src/runtime/gm/runtime-gm-state.service.ts` 行 564
- **内容**: `Buffer.byteLength(JSON.stringify(value), 'utf8')`
- **描述**: GM 性能观测中序列化每个网络事件来计算字节数
- **建议**: 考虑采样或只在 GM 明确请求时开启

### 3.15 local-api.cjs 使用 CommonJS 风格

- **位置**: `packages/config-editor/local-api.cjs`（44KB）
- **描述**: 配置编辑器的本地 API 桥接层使用 CommonJS（`require()`），与项目 ESM 主线不一致
- **建议**: 按 AGENTS.md 规范，修改时逐步迁移为 ESM

---

## 四、正面发现（无问题确认）

### 安全
- SQL 全部参数化查询，无注入风险 ✓
- 认证有完整的 rate limiting（IP + 主体双维度）✓
- 客户端严格遵循"只收集意图和呈现状态"原则，未发现越权行为 ✓
- 客户端寻路仅用于路径预览，移动由服务端权威执行 ✓

### 架构
- 服务端权威设计正确，客户端无任何状态变更权限 ✓
- tick 循环有正确的重入保护（`tickInFlight`）和优雅关闭 ✓
- 会话管理有完整的 detach/expire/purge 生命周期 ✓
- 数据库连接池有正确的关闭钩子 ✓
- 战斗管线设计为纯函数、零分配，性能友好 ✓
- Docker 部署有 healthcheck、rollback、restart policy ✓

### 代码质量
- shared 包零 `any` 使用、零 `@ts-ignore` ✓
- shared 包 index.ts 覆盖所有 91 个源文件的导出，无遗漏 ✓
- 协议 PayloadMap 完整性由自动化脚本保证 ✓
- 枚举无冲突，常量按域分组 ✓
- tsconfig.base.json 配置合理（strict: true, ES2022, NodeNext）✓
- 服务端所有 setInterval 都有对应的 clearInterval 清理 ✓
- DOM patch 机制成熟，保护焦点/滚动/选区 ✓
- 渲染层有 LRU 淘汰、帧率限制、FPS 监控 ✓
- InteractionController 有正确的 attach/detach 生命周期 ✓

### 运维
- 完善的验证体系（smoke/bench/audit/proof 多层次）✓
- 生产部署有两条独立链路（腾讯云 CCR + GitHub Actions GHCR）✓
- 部署后有自动化路由探测验证 ✓
- 数据库有 backup-worker 独立服务 ✓

---

## 五、优先修复建议

### 立即修复（影响生产安全）
1. **1.1** GM 默认密码：生产环境未配置时拒绝启动
2. **1.2** Redis 密码：为生产 Redis 添加认证
3. **1.3** CI 回退：移除 `|| pnpm install`

### 短期修复（1-2 周）
4. **2.3** 频率限制 Map 上限
5. **2.4** flush/tick 竞态保护
6. **2.9** escapeHtml 提取为公共模块
7. **2.15** config-editor 跨包导入重构

### 中期改善（1-2 月）
8. **2.1** 服务端核心层 any 类型逐步替换
9. **2.7** 客户端事件监听器清理机制
10. **2.10** 移动端 pointer events 支持
11. **2.17** 巨型文件拆分和懒加载确认

---

*报告生成完毕。共发现 3 个高严重度、18 个中严重度、15 个低严重度问题。*
