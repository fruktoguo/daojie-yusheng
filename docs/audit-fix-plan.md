# 道劫余生 审计修复方案

> 基于 audit-report.md 中 73 项问题，逐条给出目标文件和修改方案

---

## P0 — 立即修复

### H-01. JWT Secret 硬编码回退值
- 目标文件：`packages/server/src/auth/auth.module.ts`
- 方案：移除 `|| 'daojie-yusheng-dev-secret'` 回退值，改为启动时检测：
  ```ts
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('必须设置 JWT_SECRET 环境变量');
  ```
- 同步修改：`start.sh:32` 移除 `export JWT_SECRET="${JWT_SECRET:-daojie-yusheng-dev-secret}"`，改为启动前校验

### H-02. GM 默认密码为 admin123
- 目标文件：`packages/server/src/auth/auth.service.ts:214`、`docker-stack.yml:39`、`start.sh:33`
- 方案：移除 `|| 'admin123'` 回退值。首次启动时若无 `GM_PASSWORD` 环境变量且无 `gm-config.json`，生成 `crypto.randomUUID()` 作为初始密码并打印到日志
- `docker-stack.yml` 中 `GM_PASSWORD: ${GM_PASSWORD:-admin123}` 改为 `GM_PASSWORD: ${GM_PASSWORD}`（无默认值）

### H-03. WebSocket GM 操作无权限校验
- 目标文件：`packages/server/src/game/game.gateway.ts:463-473`
- 方案：在 `handleGmMarkSuggestionCompleted` 和 `handleGmRemoveSuggestion` 开头增加 GM 身份校验：
  ```ts
  const gmToken = client.handshake?.auth?.gmToken as string;
  if (!gmToken || !this.authService.validateGmToken(gmToken)) return;
  ```
- 或者将这两个操作移至 `gm.controller.ts` 使用 `@UseGuards(GmAuthGuard)` 保护

### H-04. 登录/注册接口无速率限制
- 目标文件：`packages/server/package.json`（新增依赖）、`packages/server/src/app.module.ts`、`packages/server/src/auth/auth.controller.ts`
- 方案：
  1. `pnpm --filter @mud/server add @nestjs/throttler`
  2. `app.module.ts` imports 中添加 `ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])`
  3. `auth.controller.ts` 的 login/register/gm-login 方法上添加 `@Throttle({ default: { ttl: 60000, limit: 5 } })`

### H-05. CORS 完全开放
- 目标文件：`packages/server/src/main.ts:77`
- 方案：
  ```ts
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });
  ```
- 同步修改：`docker-stack.yml` 和 `docker-compose.yml` 的 server environment 中添加 `CORS_ORIGIN` 变量

### H-06. docker-compose.yml 硬编码密钥
- 目标文件：`docker-compose.yml:5-7,35-36,39-42`
- 方案：所有密钥改为环境变量引用 `${VAR}`，新建 `.env.example` 提供模板（不含真实值）
  ```yaml
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  JWT_SECRET: ${JWT_SECRET}
  GM_PASSWORD: ${GM_PASSWORD}
  DB_PASSWORD: ${DB_PASSWORD}
  ```

### H-07. .env 文件包含真实凭据
- 目标文件：`packages/server/.env`、`.gitignore`
- 方案：
  1. 确认 `.gitignore` 已包含 `.env`（当前已有）
  2. 如果 `.env` 曾被提交过，执行 `git rm --cached packages/server/.env`
  3. 创建 `packages/server/.env.example` 作为模板
  4. 轮换已泄露的密码

### H-08. synchronize: true 生产环境风险
- 目标文件：`packages/server/src/database/database.module.ts:25,37`
- 方案：
  ```ts
  synchronize: process.env.NODE_ENV !== 'production',
  ```
- 后续建立 TypeORM migration 工作流

### H-09. Redis 缓存无 TTL
- 目标文件：`packages/server/src/database/redis.service.ts:36-63`
- 方案：
  1. `setPlayer` 中每次 `hset` 后调用 `this.client.expire(key, 300)` 设置 5 分钟 TTL
  2. `onModuleInit` 中添加启动清理：`await this.client.keys('player:*').then(keys => keys.length > 0 && this.client.del(...keys))`

### H-10. persistAll 批量落盘无事务保护
- 目标文件：`packages/server/src/game/player.service.ts:265-303`
- 方案：注入 `DataSource`，使用 `queryRunner` 包裹：
  ```ts
  const qr = this.dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.manager.save(PlayerEntity, entities);
    await qr.commitTransaction();
  } catch (e) {
    await qr.rollbackTransaction();
    this.logger.error('批量落盘失败', e);
  } finally {
    await qr.release();
  }
  ```

### H-11. 断线保留期过期后未兜底落盘
- 目标文件：`packages/server/src/game/player.service.ts:396-403`
- 方案：在 `clearExpiredRetainedSessions` 中，删除条目前先尝试 `savePlayer`：
  ```ts
  for (const [userId, entry] of this.retainedSessions) {
    if (now - entry.retainedAt > DISCONNECT_RETAIN_TIME * 1000) {
      await this.savePlayer(entry.playerId).catch(() => {});
      this.retainedSessions.delete(userId);
    }
  }
  ```

### H-12. ensureMapTicks() 方法体为空
- 目标文件：`packages/server/src/game/tick.service.ts:571-572`
- 方案：确认当前代码是否确实为空。如果方法体缺失，补全：
  ```ts
  private ensureMapTicks() {
    for (const mapId of this.mapService.getAllMapIds()) {
      this.startMapTick(mapId);
    }
  }
  ```

### H-13. SettingsPanel.open() 死代码
- 目标文件：`packages/client/src/ui/panels/settings-panel.ts:44-46`
- 方案：确认第 45 行是否为裸 `return;`。如果是，删除该行。当前代码中 `if (!this.options) return;` 是合理的守卫检查，不应删除

### H-14. dropItem count 为 NaN 时物品异常
- 目标文件：`packages/server/src/game/inventory.service.ts:46-48`
- 方案：修改 `removeItem` 开头：
  ```ts
  if (!item || !Number.isFinite(count) || count <= 0) return null;
  ```

### H-15. C2S 消息无输入验证
- 目标文件：`packages/server/src/game/game.gateway.ts:217-385`
- 方案：在每个 handler 的 `enqueueCommand` 前添加校验。建议新建 `packages/server/src/game/input-validation.ts` 工具模块：
  ```ts
  export function isValidSlotIndex(v: unknown): v is number {
    return Number.isInteger(v) && (v as number) >= 0;
  }
  export function isValidCount(v: unknown): v is number {
    return Number.isInteger(v) && (v as number) > 0;
  }
  export function isValidDirection(v: unknown): v is number {
    return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3;
  }
  export function isValidCoord(v: unknown): v is number {
    return Number.isFinite(v);
  }
  ```
  在各 handler 中调用校验，不通过则 return

### H-16. S2C_Init 泄露完整 PlayerState
- 目标文件：`packages/server/src/game/game.gateway.ts:434`、`packages/shared/src/protocol.ts:190-199`
- 方案：在 `sendInit` 中构建精简对象，过滤 `combatTargetId`、`combatTargetLocked`、`idleTicks`、`revealedBreakthroughRequirementIds` 等内部字段：
  ```ts
  const { combatTargetId, combatTargetLocked, idleTicks, ...clientSelf } = player;
  const initData: S2C_Init = { self: clientSelf, ... };
  ```

### H-17. InputThrottle 未使用
- 目标文件：`packages/client/src/main.ts`
- 方案：在 `main.ts` 顶部导入并实例化：
  ```ts
  import { InputThrottle } from './input/throttle';
  const inputThrottle = new InputThrottle();
  ```
  在 `sendMoveCommand` 和 `planPathTo` 调用前检查：
  ```ts
  if (!inputThrottle.canAct()) return;
  inputThrottle.mark();
  ```

### H-18. ratioValue 负值分支不对称
- 目标文件：`packages/shared/src/numeric.ts:374-375`
- 方案：改为对称曲线或添加注释说明设计意图。如果需要对称：
  ```ts
  return value > 0
    ? value / (value + divisor)
    : -(Math.abs(value) / (Math.abs(value) + divisor));
  ```
  如果当前行为是有意的，添加注释说明

---

## P1 — 短期修复

### M-01. Token 无类型区分
- 目标文件：`packages/server/src/auth/auth.service.ts:185-195`
- 方案：JWT payload 中增加 `type: 'access' | 'refresh'`，`validateToken` 中校验 type

### M-02. Refresh Token 无吊销机制
- 目标文件：`packages/server/src/database/entities/user.entity.ts`、`packages/server/src/auth/auth.service.ts`
- 方案：UserEntity 增加 `tokenVersion: number` 字段，签发时写入 payload，refresh 时比对

### M-03. 注册竞态条件
- 目标文件：`packages/server/src/auth/auth.service.ts:58-73`
- 方案：`save` 调用包裹 try-catch，捕获 unique constraint violation 返回友好错误

### M-04/M-05. GM 面板 XSS
- 目标文件：`packages/client/src/ui/panels/gm-panel.ts:102-105,311-319`
- 方案：对 `s.title`、`s.description`、`s.authorName`、`player.name`、`player.mapId` 使用 `escapeHtml()` 转义

### M-06. GM 后台 onclick 注入
- 目标文件：`packages/client/src/gm.ts:264-265`
- 方案：改用 `data-id` 属性 + 事件委托替代 inline onclick

### M-07. 建议系统无长度/频率限制
- 目标文件：`packages/server/src/game/suggestion.service.ts:49-63`
- 方案：`create` 方法开头校验 `title.length <= 50 && description.length <= 500`，维护每用户最后创建时间做频率限制

### M-08. GM 操作无审计日志
- 目标文件：`packages/server/src/game/gm.service.ts`、`packages/server/src/game/gm.controller.ts`
- 方案：在关键操作中添加 `this.logger.log(...)` 记录操作类型、目标、时间

### M-09. GM Token 存储在 sessionStorage
- 目标文件：`packages/client/src/gm.ts:32,120,1192,1232`
- 方案：短期可接受（GM 页面本身需要 XSS 防护），长期考虑 HttpOnly cookie

### M-10. tick 与 WebSocket 竞态
- 目标文件：`packages/server/src/game/game.gateway.ts:196-215`
- 方案：在 `handleDisconnect` 中将 `removeOccupant` 移到 `await savePlayer()` 之前

### M-11. persistAll 与 tick 并发
- 目标文件：`packages/server/src/game/tick.service.ts:113-120`
- 方案：在 `persistAll` 开头对所有玩家状态做 `structuredClone` 快照后再异步写入

### M-12. 地图热重载状态不一致
- 目标文件：`packages/server/src/game/map.service.ts:372-386`
- 方案：热重载后同步清理并重建 `occupantsByMap` 中该地图的占位信息

### M-13. 跨地图移动不触发 tick 启动
- 目标文件：`packages/server/src/game/world.service.ts:1228-1255`
- 方案：在 `resetPlayerToSpawn` 和 `travelThroughPortal` 中，跨地图后调用 `this.tickService?.ensureMapTicks?.()`

### M-14. 客户端无自动重连
- 目标文件：`packages/client/src/network/socket.ts:37-71`
- 方案：Socket.IO connect 配置中添加 `reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 2000`

### M-15. S2C_Init 未经 Protobuf 编码
- 目标文件：`packages/shared/src/network-protobuf.ts:281-286`
- 方案：为 S2C_Init 添加 Protobuf schema（长期任务，先评估包大小）

### M-16. 聊天绕过 tick 队列
- 目标文件：`packages/server/src/game/game.gateway.ts:387-408`
- 方案：当前设计可接受（聊天不涉及游戏状态变更），添加注释说明

### M-17. 建议广播绕过流量统计
- 目标文件：`packages/server/src/game/game.gateway.ts:476-479`
- 方案：改为遍历在线玩家 socket 逐个 emit

### M-18. 命令去重丢弃有效操作
- 目标文件：`packages/server/src/game/player.service.ts:438-447`
- 方案：对 `useItem`/`dropItem`/`takeLoot` 类型不做去重，或用 `playerId:type:slotIndex` 更细粒度 key

### M-19. fromWireNumericStats 缺少字段校验
- 目标文件：`packages/shared/src/network-protobuf.ts:376-395`
- 方案：解码后基于 `createNumericStats()` 做默认值填充再覆盖 wire 字段

### M-20. renderWorld Canvas 状态频繁切换
- 目标文件：`packages/client/src/renderer/text.ts:197-291`
- 方案：按类型批量绘制（先所有背景 → 网格线 → 文字），`ctx.font` 在循环外设置一次

### M-21. 每帧重建 pathHighlight
- 目标文件：`packages/client/src/renderer/text.ts:165-169`、`packages/client/src/main.ts:1945`
- 方案：在 `setPathHighlight` 中加引用比较，仅 cells 变化时重建

### M-22. 每帧冗余 syncDisplayMetrics
- 目标文件：`packages/client/src/main.ts:1928-1930`
- 方案：仅在 resize 事件或玩家位置变化时调用

### M-23. mousemove 每次调用 getBoundingClientRect
- 目标文件：`packages/client/src/input/mouse.ts:58`
- 方案：缓存 rect 值，仅在 resize 时更新

### M-24. JSON.parse(JSON.stringify) 深拷贝
- 目标文件：多处（`tick.service.ts`、`map.service.ts`、`main.ts`、`map-memory.ts`、`map-static-cache.ts`）
- 方案：替换为 `structuredClone()` 或手动浅拷贝

### M-25. isStructuredEqual 用 JSON.stringify
- 目标文件：`packages/server/src/game/tick.service.ts:1254-1256`
- 方案：安装 `fast-deep-equal` 或对已知结构做字段级比较

### M-26. getUserIdByPlayerId 线性扫描
- 目标文件：`packages/server/src/game/player.service.ts:351-358`
- 方案：维护反向映射 `playerToUser: Map<string, string>`，在 set/remove UserMapping 时同步更新

### M-27. escapeHtml 重复定义
- 目标文件：新建 `packages/client/src/ui/html-utils.ts`，修改 10+ 个引用文件
- 方案：抽取到公共模块，各文件改为 `import { escapeHtml } from '../html-utils'`

### M-28. 标签常量重复定义
- 目标文件：新建 `packages/client/src/ui/labels.ts`，修改 `main.ts`、`minimap.ts`、`skill-tooltip.ts`、`technique-panel.ts`
- 方案：统一到公共模块

### M-29. Escape 键优先级竞争
- 目标文件：涉及 `keyboard.ts`、`main.ts`、`action-panel.ts`、`detail-modal-host.ts`、`minimap.ts`
- 方案：建立统一键盘事件分发层 `packages/client/src/input/key-dispatcher.ts`，按优先级分发

### M-30. SuggestionPanel socket: any
- 目标文件：`packages/client/src/ui/suggestion-panel.ts:12`
- 方案：改为 `SocketManager` 类型或定义最小接口

---

## P2 — 低严重度修复

### L-01. Dockerfile pnpm@latest
- 目标文件：`packages/server/Dockerfile:2`、`packages/client/Dockerfile:2`
- 方案：固定版本 `corepack prepare pnpm@9.15.0 --activate`

### L-02. Dockerfile install 回退
- 目标文件：`packages/server/Dockerfile:8`、`packages/client/Dockerfile:8`
- 方案：移除 `|| pnpm install`，仅保留 `pnpm install --frozen-lockfile`

### L-03. Server Dockerfile 含 devDependencies
- 目标文件：`packages/server/Dockerfile:18`
- 方案：builder 阶段构建后执行 `pnpm prune --prod`，再 COPY node_modules

### L-04. 健康检查未检测依赖
- 目标文件：`packages/server/src/health.controller.ts`
- 方案：注入 `RedisService` 和 `DataSource`，检测连接状态

### L-05. deploy.yml 无构建前验证
- 目标文件：`.github/workflows/deploy.yml`
- 方案：在 build-images 前增加 `pnpm build` 类型检查 job

### L-06. .gitignore 未排除 data/runtime
- 目标文件：`.gitignore`
- 方案：添加 `packages/server/data/runtime/`

### L-07. .dockerignore 未排除 data/runtime
- 目标文件：`.dockerignore`
- 方案：添加 `packages/server/data/runtime`

### L-08. start.sh trap 位置靠后
- 目标文件：`start.sh:54`
- 方案：将 `trap cleanup INT TERM EXIT` 移到启动后台进程之前（约第 42 行）

### L-09. 缺少 packageManager 字段
- 目标文件：`package.json`
- 方案：添加 `"packageManager": "pnpm@9.15.0"`

### L-10. 无 HTTP 安全头
- 目标文件：`packages/server/package.json`、`packages/server/src/main.ts`
- 方案：`pnpm add helmet`，`main.ts` 中 `app.use(helmet())`

### L-11. Redis 无认证
- 目标文件：`packages/server/src/database/redis.service.ts:17-25`、`docker-stack.yml`
- 方案：Redis 配置 `requirepass`，连接 URL 中包含密码

### L-12. 数据库默认凭据
- 目标文件：`packages/server/src/database/database.module.ts:32-35`
- 方案：移除默认值，启动时校验环境变量存在

### L-13. 用户名最小长度 1
- 目标文件：`packages/server/src/auth/account-validation.ts:6`
- 方案：`ACCOUNT_MIN_LENGTH = 3`

### L-14. 聊天无频率限制
- 目标文件：`packages/server/src/game/game.gateway.ts:387-408`
- 方案：维护 `lastChatTime: Map<string, number>`，每秒最多 1 条

### L-15. 投票无频率限制
- 目标文件：`packages/server/src/game/game.gateway.ts:454-461`
- 方案：同上，维护节流 Map

### L-16/L-17. Entity jsonb 类型宽松 + as any
- 目标文件：`packages/server/src/database/entities/player.entity.ts:56-96`、`packages/server/src/game/player.service.ts`
- 方案：为 jsonb 字段定义精确接口类型，消除 `as any`

### L-18. Redis 连接失败不阻止启动
- 目标文件：`packages/server/src/database/redis.service.ts:26-28`
- 方案：改为 `onModuleInit` 中连接，失败时 `throw` 阻止启动

### L-19. AuthGuard 未使用
- 目标文件：`packages/server/src/auth/auth.guard.ts`
- 方案：删除或在 Gateway 中使用

### L-20. main.ts 全局变量无封装
- 目标文件：`packages/client/src/main.ts:1203-1234`
- 方案：封装为 `GameState` 类（长期重构任务）

### L-21. 缺少全局 ExceptionFilter
- 目标文件：新建 `packages/server/src/common/global-exception.filter.ts`、`packages/server/src/main.ts`
- 方案：实现 `ExceptionFilter`，`app.useGlobalFilters(new GlobalExceptionFilter())`

### L-22. IRenderer 接口不完整
- 目标文件：`packages/client/src/renderer/types.ts:27-50`
- 方案：补充 `setPathHighlight`、`addFloatingText` 的 `variant` 参数到接口

### L-23. sendDebugResetSpawn 发两次
- 目标文件：`packages/client/src/network/socket.ts:160-163`
- 方案：删除冗余的 `C2S.Action` 发送，只保留 `C2S.DebugResetSpawn`

### L-24. viewCenterX/Y 死代码
- 目标文件：`packages/client/src/main.ts:1222-1224,1934-1939`
- 方案：删除 `viewCenterX`、`viewCenterY`、`VIEW_LERP_SPEED` 及 gameLoop 中的 lerp 计算

### L-25. TECHNIQUE_GRADE_ATTR_DECAY_K 未使用
- 目标文件：`packages/shared/src/technique.ts:64`
- 方案：删除该常量

---

## 数据配置修复

### D-01. books.json ID 命名不一致
- 目标文件：`packages/server/data/content/items/books.json` + 所有引用处
- 方案：统一为 `book.xxx` 点号前缀，全局搜索替换 `book_wind_step` → `book.wind_step` 等

### D-02. consumables.json 前缀不一致
- 目标文件：`packages/server/data/content/items/consumables.json` + 引用处
- 方案：统一为 `pill.xxx` 前缀

### D-03. breakthroughs.json 缺少 17→18
- 目标文件：`packages/server/data/content/breakthroughs.json`
- 方案：确认是否为自动晋升设计，如需补充则添加 17→18 条目

### D-04. 两套突破体系冲突
- 目标文件：`packages/shared/src/constants.ts:271-369`、`packages/server/data/content/breakthroughs.json`
- 方案：确认当前生效版本，标记废弃的那套为 `@deprecated`

### D-05. expFactor=0 约定未文档化
- 目标文件：项目文档（如 AGENTS.md 或新建数据格式说明）
- 方案：补充说明"功法最后一层 expFactor=0 表示满级"

### D-06. Buff 价值计算未考虑 maxStacks
- 目标文件：`packages/shared/src/value.ts:549-575`
- 方案：在 `calculateBuffValue` 中引入 `maxStacks` 因子：
  ```ts
  const stackMultiplier = Math.sqrt(effect.maxStacks ?? 1);
  quantifiedValue *= stackMultiplier;
  ```

### D-07. QuestState 三个奖励字段重叠
- 目标文件：`packages/shared/src/types.ts:637-640`
- 方案：长期统一为 `rewards: ItemStack[]`，废弃 `rewardItemId` 和 `rewardItemIds`（需迁移）
