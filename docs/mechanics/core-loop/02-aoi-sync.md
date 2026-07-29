# AOI 与同步系统

## 核心常量

| 常量 | 值 | 源文件 |
|------|-----|--------|
| DEFAULT_VIEW_RADIUS | 10 格 | `packages/server/src/runtime/instance/map-instance.runtime.ts` |
| GAME_RANGE_DISTANCE_METRIC | 'euclidean' | `packages/shared/src/constants/gameplay/distance.ts` |

## FOV 算法

源文件: `packages/server/src/runtime/instance/fov.helpers.ts`

- 算法: 标准 8 八分区递归 Shadowcasting
- 范围判定: `dx² + dy² ≤ radius²`（欧氏距离）
- 阻挡视线地块: wall, cloud, tree, bamboo, cliff, stone, spirit_ore, black_iron_ore, broken_sword_heap, house_eave, house_corner, screen_wall

## 广播规则

- 能单播就不 AOI，能 AOI 就不全图，能全图也不全服
- AOI 只广播视野范围内必要变化
- 高频同步必须最小字段、最小范围、最小频率

## 增量同步策略

源文件: `packages/server/src/runtime/world/world-sync.service.ts`

### 同步流程（flushConnectedPlayers）

```
1. 遍历所有已绑定 session 的玩家
2. getPlayerView(playerId) → buildPlayerView(playerId, radius=10)
   - 使用 shadowcasting 收集视野内可见地块
   - 缓存机制: 视野覆盖的 AOI chunk revision + playerRevision 未变则复用
   - 玩家/怪物移动同时标记移动前后 chunk；远处 chunk 变化不会让全实例玩家重算视野
   - 地形、建筑和临时地块按所在 chunk 失效 FOV，只有整张实例重建才全局失效
3. 生成 envelope（增量 delta）
4. 支持 Worker 编码路径: flushPendingEmitsViaWorker()
5. 辅助同步: 任务/战利品/运行时事件/统计记录
```

### 包体分层

| 层级 | 用途 | 频率 |
|------|------|------|
| initSession | 首次连接全量 | 一次性 |
| mapEnter | 跨图全量 | 跨图时 |
| selfDelta | 自身增量（坐标/朝向/mapId等） | 每 tick |
| worldDelta.p[] | 视野内其他玩家增量 | 每 tick |
| auxDelta | 低频辅助数据 | 按需 |

### 同步原则

- 能发 `id / revision / enum / patch / add / remove` 的，不发完整对象
- 除首次进入、跨图、断线重连、版本变更等重建场景外，默认优先增量/差量同步
- 客户端能从首包、静态表、本地缓存或上下文恢复的信息，不在高频包重复带
- 协议变更必须能解释字段属于哪一层、谁接收、频率多高、生命周期多长
- 客户端把当前 `Socket` 实例作为入站会话代际。手动重连、换 token 或跨节点重定向创建新实例后，旧实例迟到的业务包、`InitSession`、`Kick`、`disconnect` 和 `connect_error` 必须在解码及状态消费前丢弃；同一实例内部的 Socket.IO 自动重连仍按正常会话恢复处理。
- 客户端主动 `disconnect` 的生命周期通知不触发自动恢复；跨节点重定向不能留下跨连接的“忽略下一次断线”状态，否则新连接未来的真实掉线会失去清理、UI 离线态和恢复调度。
- 公共聊天历史不混入每 tick envelope。客户端完成本机历史恢复后单独发送复合游标，服务端按世界、宗门、实例/AOI 返回低频增量包；每次请求使用关联 ID 隔离跨图或重连后晚到的旧响应。
- 玩家宗门变化只通过低频 `selfDelta.sid` 下发，客户端据此切换宗门聊天本地作用域；未变化时不携带该字段，不增加常规 tick 包体。
