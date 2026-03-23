# 技术架构文档

## 1. 整体架构

```
客户端 (Browser)          服务端 (NestJS)           存储层
┌──────────────┐     ┌─────────────────────┐    ┌──────────┐
│ Canvas 渲染   │     │  Socket.IO Gateway  │    │ Redis    │
│ 输入处理      │◄───►│  Auth Module        │◄──►│ 实时状态  │
│ 网络通信      │ WS  │  Game Module        │    └──────────┘
│ UI 层        │     │    ├ TickService     │    ┌──────────┐
└──────────────┘     │    ├ MapService      │◄──►│ PostgreSQL│
                     │    ├ PlayerService   │    │ 持久数据  │
                     │    └ AoiService      │    └──────────┘
                     └─────────────────────┘
```

### shared 共享层组织

- 共享协议定义位于 `packages/shared/src/protocol.ts`
- 共享常量按 `packages/shared/src/constants/` 下的分类目录组织
- 顶层分类优先使用符合非开发者认知的 `gameplay`、`network`、`ui`、`visuals`
- `packages/shared/src/constants.ts` 当前作为兼容层保留，用于承接旧导入路径；新增共享常量应优先落到对应分类目录

### 单端私有常量组织

- 客户端私有常量集中在 `packages/client/src/constants/`
- 服务端私有常量集中在 `packages/server/src/constants/`
- 客户端目录优先按 `ui`、`visuals`、`world`、`editor`、`input` 拆分
- 服务端目录优先按 `auth`、`storage`、`gameplay`、`world` 拆分
- 划分原则依旧优先贴近非开发者认知，例如视觉、交互、存储、玩法配置，而不是按技术实现碎片化散放
- 仅单端使用的键位映射、缩放参数、缓存键、运行时哨兵值等，不进入 shared

## 2. 服务端模块职责

### AuthModule
- `AuthController` — HTTP 接口：POST /auth/register, POST /auth/login
- `AuthService` — 注册（bcrypt哈希）、登录（验证+签发JWT）、token校验
- `AuthGuard` — 预留（当前 WebSocket 连接在 `GameGateway` 内手动校验 JWT）

### GameModule
- `GameGateway` — Socket.IO 网关，处理连接/断开/消息路由，顶号逻辑
- `TickService` — 每张地图的 tick 循环引擎（动态 setTimeout，目标 1000ms）
- `MapService` — 地图加载、格子查询、碰撞检测、传送点处理（portal）
- `PlayerService` — 玩家状态管理、操作指令队列、上下线
- `AoiService` — 视野计算、变更推送列表生成

### DatabaseModule
- TypeORM 连接 PostgreSQL
- ioredis 连接 Redis
- Entity 定义：User, Player
- 落盘定时任务：内存态玩家数据 → PostgreSQL（Redis 为旁路缓存）

## 3. Tick 引擎详细设计

```
每张地图独立运行：

MapTickLoop {
  interval: 1000ms

  onTick():
    1. commands = playerService.drainCommands(mapId)
    2. for cmd in commands:
         result = executeCommand(cmd)  // 移动/动作/交互
         if result.ok:
           applyStateChange(result.changes)
    3. changes = collectChanges()
    4. for player in map.players:
         visibleChanges = aoiService.filter(player, changes)
         player.socket.emit('s:tick', visibleChanges)
    5. clearTickChanges()
}
```

### 指令执行优先级
- 同 tick 内多个玩家移动到同一格子：先到先得（按指令时间戳）
- 玩家每 tick 只保留最后一条指令

## 4. 网络协议细节

### 连接流程
```
1. 客户端 HTTP POST /auth/login → 获取 JWT
2. 客户端 Socket.IO connect，handshake 携带 JWT
3. 服务端 `GameGateway` 校验 JWT
4. 校验通过 → 检查是否已有该账号的连接
   - 有 → 向旧连接发 s:kick，断开旧连接
   - 无 → 正常
5. 加载角色数据，加入对应地图
6. 发送初始视野数据 `s:init`（全量）
```

### 消息格式（紧凑）
```typescript
// 客户端发送
{ d: 0|1|2|3 }              // move: 0=N 1=S 2=E 3=W
{ message: string }         // c:chat

// 服务端 tick 推送
{
  p: [[id,x,y,char,color],...],  // 视野内玩家列表
  t: [[x,y,type],...],           // 变更的地形（当前实现保留，默认空）
  e: [[id,x,y,type],...],        // 视野内实体（当前实现保留，默认空）
  v: Tile[][],                   // 当前视野 tile 快照
  dt: number                     // 实际 tick 间隔（毫秒）
}

// 服务端文本消息（系统提示/聊天）
{
  text: string,
  kind?: 'system' | 'chat',
  from?: string
}
```

## 5. 前端架构

```
main.ts — 入口，初始化各模块

network/
  socket.ts      — Socket.IO 连接管理、消息收发
  protocol.ts    — 消息编解码

renderer/
  types.ts       — IRenderer 接口定义
  text.ts        — TextRenderer 实现（纯字符 Canvas）
  camera.ts      — 视口/摄像机（跟随玩家）

input/
  keyboard.ts    — 键盘监听，方向键/WASD 映射为指令
  throttle.ts    — 输入节流（1次/秒）

ui/
  login.ts       — 登录/注册界面（DOM）
  hud.ts         — 游戏内 HUD（坐标、HP等）
```

### 渲染循环
- requestAnimationFrame 驱动渲染（60fps 视觉流畅）
- 游戏状态由服务端 tick 更新（1Hz）
- 渲染帧之间可做插值动画（可选，后期优化）

## 6. 扩展性考虑

### 水平扩展路径（当前不实现，预留设计空间）
- 单进程瓶颈时：每张地图可拆为独立 worker/进程
- Socket.IO 支持 Redis adapter 做多进程广播
- 数据库读写分离

### 功能扩展点
- 战斗系统：在 tick 指令执行中加入战斗逻辑
- 物品系统：背包数据存 PostgreSQL，装备状态缓存 Redis
- NPC/怪物：作为 Entity 参与 tick 循环，AI 逻辑在服务端
- 聊天系统：独立频道，不走 tick，直接转发

## 8. 地图内容数据层（当前配置）

当前 `packages/server/data/maps/*.json` 已按“风险分层推进”组织：
- `spawn`（云来镇，安全区）
- `bamboo_forest`（青竹林，初阶野外）
- `black_iron_mine`（玄铁矿洞，中阶高压）
- `ancient_ruins`（断碑遗迹，中阶高压）
- `beast_valley`（噬魂兽谷，高危终点）
- `wildlands`（荒野，侧线探索）

地图字段已扩展用于驱动后续玩法系统：
- `npcs`：任务发放、剧情提示、危险预警
- `monsterSpawns`：刷怪范围/强度/掉落（含技能书）
- `landmarks`：关键信息点与关卡导引
- `dangerLevel`、`recommendedRealm`：内容分层与自动战斗参数参考

## 7. 运行与配置（当前实现）

### 服务端环境变量
- PostgreSQL：优先读取 `DATABASE_URL`，未设置时回退到 `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE`
- Redis：优先读取 `REDIS_URL`，未设置时回退到 `REDIS_HOST/REDIS_PORT`

### Docker Compose
- `server` 服务使用 `DATABASE_URL` 与 `REDIS_URL` 注入数据库连接
- `client` 通过 Nginx 反向代理 `/auth` 与 `/socket.io` 到 `server:3000`

### 本地启动（start.sh local）
- 启动前先构建一次 `@mud/shared`
- 同时启动 `@mud/shared` 的 watch 构建，持续更新 `packages/shared/dist`
- 并行启动 Nest 开发服务与 Vite 开发服务
