# 客户端配置

客户端配置分两类：
1. **本地存储配置**：用户偏好，持久化到 localStorage/sessionStorage
2. **运行时常量**：编译期确定，位于 `packages/client/src/constants/`

## 存储键一览

| 存储键 | 存储类型 | 说明 |
|--------|----------|------|
| `mud:map-performance-config:v2` | localStorage | 地图性能配置 |
| `mud:ui-style-config:v1` | localStorage | UI 样式配置 |
| `mud:map-memory:v1` | localStorage | 地图探索记忆 |
| `mud:map-static-cache:v1` | localStorage | 地图静态缓存 |
| `mud:chat-log:v1` | localStorage | 聊天记录缓存 |
| `mud:gm-password:v1` | localStorage | GM 密码（仅 GM 模式） |
| `mud:device-id:v1` | localStorage | 设备唯一标识 |
| `mud:access-token:v1` | sessionStorage | 访问令牌 |
| `mud:refresh-token:v1` | sessionStorage | 刷新令牌 |

## UI 样式配置

存储键：`mud:ui-style-config:v1`

| 字段 | 类型 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| colorMode | `'light' \| 'dark'` | `'dark'` | - | 颜色模式 |
| globalFontOffset | number | `0` | -4 ~ +4 | 全局字体偏移 |
| uiScale | number | `1.0` | 0.5 ~ 2.0 | UI 缩放比例，手机端自动适配 |

## 地图性能配置

存储键：`mud:map-performance-config:v2`

| 字段 | 类型 | 默认值 | 范围 | 说明 |
|------|------|--------|------|------|
| showFpsMonitor | boolean | `false` | - | 显示 FPS 监视器 |
| targetFps | number | `60` | 1 ~ 240 | 目标帧率 |

## 构建环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_URL` | API 服务器地址 | `/api` |
| `VITE_SOCKET_URL` | WebSocket 地址 | 同源 |
| `VITE_BUILD_ID` | 构建标识 | 自动生成 |

## 运行时常量目录

```
packages/client/src/constants/
├── api.ts           # API 相关
├── editor/          # 编辑器
├── input/           # 输入映射
├── ui/              # UI 样式、性能、文本
├── visuals/         # 视觉效果
└── world/           # 世界相关
```

## 调试

- 移动调试：`localStorage.setItem('mud:movement-debug', 'true')`
- 控制台：`window.__MUD_DEBUG__.getConfig()` / `window.__MUD_DEBUG__.getState()`

## 重置配置

```javascript
// 清除所有 mud: 前缀的存储
Object.keys(localStorage)
  .filter(key => key.startsWith('mud:'))
  .forEach(key => localStorage.removeItem(key));
Object.keys(sessionStorage)
  .filter(key => key.startsWith('mud:'))
  .forEach(key => sessionStorage.removeItem(key));
```

## 相关

- [服务端环境变量](server-env.md)
- [服务端运行时配置](server-runtime-config.md)
