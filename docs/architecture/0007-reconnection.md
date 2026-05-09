# 断线重连机制

## 概述

断线重连机制确保玩家在网络波动时能够无缝恢复游戏状态，是 MMO 游戏用户体验的关键保障。

## 决策背景

### 问题

- 移动网络不稳定，频繁断线
- 断线后重新登录体验差
- 战斗中断线可能导致角色死亡

### 决策

实现客户端自动重连 + 服务端状态保持机制，短时间断线后可无缝恢复。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    服务端                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Session   │  │   Player    │  │   State     │ │
│  │   Manager   │  │   Runtime   │  │   Buffer    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
         │                │                │
         │    断线保持     │    状态缓存    │
         ▼                ▼                ▼
┌─────────────────────────────────────────────────────┐
│                    客户端                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Reconnect  │  │   State     │  │    UI       │ │
│  │   Handler   │  │   Sync      │  │   Restore   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 断线检测

### 客户端检测

```typescript
// 心跳超时检测
const HEARTBEAT_INTERVAL = 5000;  // 5 秒
const HEARTBEAT_TIMEOUT = 15000;  // 15 秒

let lastHeartbeat = Date.now();

setInterval(() => {
  if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
    onDisconnect('heartbeat_timeout');
  }
}, HEARTBEAT_INTERVAL);

socket.on('pong', () => {
  lastHeartbeat = Date.now();
});
```

### 服务端检测

```typescript
// Socket.IO 内置心跳
const io = new Server({
  pingInterval: 5000,
  pingTimeout: 10000,
});

socket.on('disconnect', (reason) => {
  onPlayerDisconnect(playerId, reason);
});
```

## 断线后服务端行为

### 会话保持

```typescript
const SESSION_KEEP_ALIVE_MS = 60000; // 60 秒

function onPlayerDisconnect(playerId: string, reason: string) {
  const session = sessions.get(playerId);
  if (!session) return;

  // 1. 标记为断线状态
  session.status = 'disconnected';
  session.disconnectedAt = Date.now();

  // 2. 设置超时清理
  session.cleanupTimer = setTimeout(() => {
    onSessionTimeout(playerId);
  }, SESSION_KEEP_ALIVE_MS);

  // 3. 暂停非关键操作
  pausePlayerActions(playerId);

  // 4. 通知其他玩家
  broadcastPlayerStatus(playerId, 'offline');
}
```

### 状态缓存

断线期间缓存发给玩家的消息：

```typescript
class StateBuffer {
  private buffer: Map<string, Message[]> = new Map();
  private maxSize = 1000;

  push(playerId: string, message: Message) {
    let messages = this.buffer.get(playerId);
    if (!messages) {
      messages = [];
      this.buffer.set(playerId, messages);
    }

    messages.push(message);

    // 限制缓存大小
    if (messages.length > this.maxSize) {
      messages.shift();
    }
  }

  flush(playerId: string): Message[] {
    const messages = this.buffer.get(playerId) || [];
    this.buffer.delete(playerId);
    return messages;
  }
}
```

## 重连流程

### 客户端重连

```typescript
async function reconnect() {
  let attempts = 0;
  const maxAttempts = 5;
  const baseDelay = 1000;

  while (attempts < maxAttempts) {
    try {
      // 1. 尝试连接
      await socket.connect();

      // 2. 发送重连请求
      const result = await socket.emit('reconnect', {
        playerId,
        sessionToken,
        lastSeq: lastReceivedSeq,
      });

      if (result.success) {
        // 3. 同步状态
        await syncState(result.statePatch);
        return true;
      }
    } catch (error) {
      attempts++;
      // 指数退避
      await sleep(baseDelay * Math.pow(2, attempts));
    }
  }

  // 重连失败，需要重新登录
  return false;
}
```

### 服务端处理重连

```typescript
async function handleReconnect(
  socket: Socket,
  data: ReconnectRequest
): Promise<ReconnectResponse> {
  const { playerId, sessionToken, lastSeq } = data;

  // 1. 验证 session
  const session = sessions.get(playerId);
  if (!session || session.token !== sessionToken) {
    return { success: false, reason: 'invalid_session' };
  }

  // 2. 检查是否在保持期内
  if (session.status !== 'disconnected') {
    return { success: false, reason: 'session_not_disconnected' };
  }

  // 3. 取消清理定时器
  clearTimeout(session.cleanupTimer);

  // 4. 恢复会话
  session.status = 'connected';
  session.socket = socket;

  // 5. 获取缓存的消息
  const bufferedMessages = stateBuffer.flush(playerId);

  // 6. 计算状态差异
  const statePatch = calculateStatePatch(playerId, lastSeq);

  // 7. 恢复玩家操作
  resumePlayerActions(playerId);

  // 8. 通知其他玩家
  broadcastPlayerStatus(playerId, 'online');

  return {
    success: true,
    statePatch,
    bufferedMessages,
  };
}
```

## 状态同步

### 增量同步

```typescript
interface StatePatch {
  // 玩家自身状态变化
  player?: Partial<PlayerState>;

  // 视野内实体变化
  entities?: {
    enter: Entity[];
    leave: string[];
    update: EntityPatch[];
  };

  // 背包变化
  inventory?: InventoryPatch;

  // 任务变化
  quests?: QuestPatch;
}
```

### 全量同步

如果断线时间过长或状态差异过大，执行全量同步：

```typescript
function shouldFullSync(
  disconnectDuration: number,
  patchSize: number
): boolean {
  // 断线超过 30 秒
  if (disconnectDuration > 30000) return true;

  // 差异数据过大
  if (patchSize > 10000) return true;

  return false;
}
```

## 战斗中断线

战斗中断线需要特殊处理：

```typescript
function onCombatPlayerDisconnect(player: Player) {
  // 1. 标记为 AI 托管
  player.aiControlled = true;

  // 2. 设置简单 AI 行为
  player.aiStrategy = 'defensive'; // 防御为主

  // 3. 设置托管超时
  setTimeout(() => {
    if (player.aiControlled) {
      // 超时后尝试脱战
      tryDisengage(player);
    }
  }, 30000);
}

function onCombatPlayerReconnect(player: Player) {
  // 取消 AI 托管
  player.aiControlled = false;

  // 同步战斗状态
  sendCombatState(player);
}
```

## 客户端 UI 处理

```typescript
// 断线时显示重连提示
function showReconnectUI() {
  // 显示半透明遮罩
  overlay.show();

  // 显示重连状态
  statusText.text = '正在重连...';

  // 显示重连进度
  progressBar.show();
}

// 重连成功
function onReconnectSuccess() {
  overlay.hide();
  toast.show('已重新连接');
}

// 重连失败
function onReconnectFailed() {
  overlay.hide();
  dialog.show({
    title: '连接断开',
    message: '无法重新连接，请重新登录',
    buttons: ['重新登录'],
  });
}
```

## 监控指标

| 指标 | 正常范围 | 告警阈值 |
|------|----------|----------|
| 断线率 | < 1% | > 5% |
| 重连成功率 | > 95% | < 80% |
| 平均重连时间 | < 3s | > 10s |
| 会话超时率 | < 5% | > 20% |

## 相关文档

- [网络同步分层](0003-network-sync-layers.md)
- [登录链路](../chains/登录链路.md)
- [故障排查手册](../runbook/incident-response.md)
