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
   - 缓存机制: worldRevision + playerRevision 未变则复用
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
