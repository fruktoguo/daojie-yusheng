# 服务端运行时配置

## 位置

`packages/server/data/config.json`

## 用途

控制服务端运行时行为参数，影响 tick 调度、玩家超时、灵气计算等核心逻辑。

## 字段说明

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `minTickInterval` | number | `1000` | 最小 tick 间隔（毫秒），当前为 1Hz |
| `offlinePlayerTimeoutSec` | number | `172800` | 离线玩家超时时间（秒），48小时后清理内存态 |
| `auraLevelBaseValue` | number | `1000` | 灵气等级基准值，用于灵气浓度计算 |

## 当前配置

```json
{
  "minTickInterval": 1000,
  "offlinePlayerTimeoutSec": 172800,
  "auraLevelBaseValue": 1000
}
```

## 修改注意事项

- **minTickInterval**: 不建议低于 500ms，会显著增加服务器负载
- **offlinePlayerTimeoutSec**: 影响内存占用，过长会导致内存膨胀
- **auraLevelBaseValue**: 影响所有灵气相关计算，修改需同步调整数值平衡

## 热更新

此配置在服务端启动时加载，修改后需要重启服务端生效。

## 相关文档

- [服务端环境变量](server-env.md)
