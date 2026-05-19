# 服务端运行时配置

文件位置：`packages/server/data/config.json`

控制 tick 调度、玩家超时、灵气计算等核心运行时参数。

## 字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `minTickInterval` | number | `1000` | 最小 tick 间隔（ms），当前 1Hz |
| `offlinePlayerTimeoutSec` | number | `172800` | 离线玩家超时（秒），48h 后清理内存态 |
| `auraLevelBaseValue` | number | `1000` | 灵气等级基准值，用于浓度计算 |

## 注意事项

- `minTickInterval`：不建议低于 500ms，会显著增加服务器负载
- `offlinePlayerTimeoutSec`：过长导致内存膨胀
- `auraLevelBaseValue`：影响所有灵气相关计算，修改需同步调整数值平衡

修改后需重启服务端生效（无热更新）。

## 相关

- [服务端环境变量](server-env.md)
