# GM 链路

## 概述

GM 链路负责游戏管理员的认证、状态监控和管理操作。通过 HTTP API 暴露管理接口，支持玩家管理、地图管理、邮件、市场和诊断等功能。

## 链路流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  GM 认证    │────▶│  Token 签发 │────▶│  管理操作   │────▶│  状态监控   │
│  (scrypt)   │     │  (HMAC)     │     │  (HTTP API) │     │  (面板聚合) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `runtime/gm/runtime-gm-auth.service.ts` | GM 认证（scrypt + HMAC token） |
| `runtime/gm/runtime-gm-state.service.ts` | GM 面板状态聚合 |
| `http/native/native-gm.controller.ts` | GM HTTP 入口 |
| `http/native/native-gm-admin.service.ts` | 管理操作服务 |
| `http/native/native-gm-player.service.ts` | 玩家管理服务 |
| `http/native/native-gm-world.service.ts` | 世界管理服务 |
| `http/native/native-gm-auth.guard.ts` | GM 鉴权守卫 |

## 认证流程

```
RuntimeGmAuthService
  │
  ├─▶ 密码验证
  │     - scrypt 哈希存储
  │     - 密码比对
  │
  ├─▶ Token 签发
  │     - HMAC 签名
  │     - DEFAULT_TOKEN_TTL_SEC = 43200（12 小时）
  │
  └─▶ Token 校验
        - 每次 API 请求验证
        - NativeGmAuthGuard 守卫
```

## 状态监控

```
RuntimeGmStateService 面板快照
  │
  ├─▶ 性能信息
  │     - CPU 使用率
  │     - 内存占用
  │     - Heap snapshot
  │
  ├─▶ 网络信息
  │     - 连接数
  │     - 网络 bucket 统计
  │
  ├─▶ 运行时信息
  │     - 在线玩家数
  │     - 地图实例数
  │     - Tick 耗时
  │
  └─▶ 诊断信息
        - 错误日志
        - 慢查询
```

## 管理操作

| 服务 | 能力 |
|------|------|
| native-gm-admin | 系统级管理 |
| native-gm-player | 玩家查询/修改/封禁 |
| native-gm-world | 地图/实例管理 |
| native-gm-suggestion-query | 建议查询 |

## 关键约束

- **认证**: scrypt 密码哈希 + HMAC token
- **Token 有效期**: 默认 12 小时
- **HTTP 入口**: 所有 GM 操作通过 HTTP API，不走 Socket.IO
- **审计**: GM 操作记录审计日志
- **权限**: 通过 NativeGmAuthGuard 统一鉴权

## 相关文档

- [GM 系统运维手册](../runbook/gm-system.md)
- [GM 运行时标志设计](../design/gm-runtime-flag.md)
