# 客户端配置文档

## 概述

客户端配置分为两类：
1. **本地存储配置**：用户偏好设置，持久化到 localStorage/sessionStorage
2. **运行时常量**：编译期确定的配置，位于 `packages/client/src/constants/`

## 本地存储配置

### 存储键一览

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

---

## UI 样式配置

**存储键**：`mud:ui-style-config:v1`

### 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| colorMode | `'light' \| 'dark'` | `'dark'` | 颜色模式 |
| globalFontOffset | number | `0` | 全局字体偏移量 |
| uiScale | number | `1.0` | UI 缩放比例 |

### 颜色模式

| 模式 | 说明 |
|------|------|
| light | 浅色模式，适合明亮环境 |
| dark | 深色模式，适合暗光环境（默认） |

### 字体偏移

- 范围：`-4` 到 `+4`
- 正值增大字体，负值减小字体
- 影响所有 UI 文本

### UI 缩放

- 范围：`0.5` 到 `2.0`
- 影响整体 UI 大小
- 手机端自动适配

### 代码示例

```typescript
import { 
  getUiStyleConfig, 
  updateUiColorMode,
  updateUiGlobalFontOffset,
  updateUiScale 
} from './ui/ui-style-config';

// 读取当前配置
const config = getUiStyleConfig();

// 切换颜色模式
updateUiColorMode('light');

// 调整字体大小
updateUiGlobalFontOffset(2);

// 调整 UI 缩放
updateUiScale(1.2);
```

---

## 地图性能配置

**存储键**：`mud:map-performance-config:v2`

### 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| showFpsMonitor | boolean | `false` | 是否显示 FPS 监视器 |
| targetFps | number | `60` | 目标帧率 |

### 帧率范围

- 最小值：`1`
- 最大值：`240`
- 默认值：`60`

### FPS 监视器

- 采样间隔：500ms
- 采样窗口：240 帧

### 代码示例

```typescript
import { 
  getMapPerformanceConfig, 
  updateMapPerformanceConfig,
  resetMapPerformanceConfig 
} from './ui/performance-config';

// 读取当前配置
const config = getMapPerformanceConfig();

// 更新配置
updateMapPerformanceConfig({
  showFpsMonitor: true,
  targetFps: 30,
});

// 重置为默认
resetMapPerformanceConfig();
```

---

## 地图探索记忆

**存储键**：`mud:map-memory:v1`

### 功能

- 记录玩家已探索的地块
- 保存小地图标记
- 跨会话持久化

### 数据结构

```typescript
interface MapMemoryData {
  [mapId: string]: {
    explored: Set<string>;  // 已探索坐标 "x,y"
    markers: MapMarker[];   // 玩家标记
  };
}
```

---

## 地图静态缓存

**存储键**：`mud:map-static-cache:v1`

### 功能

- 缓存地图元信息
- 缓存小地图快照
- 减少重复网络请求

### 缓存内容

| 内容 | 说明 |
|------|------|
| MapMeta | 地图基础信息（尺寸、名称等） |
| MinimapSnapshot | 小地图渲染快照 |

---

## 认证令牌

### 访问令牌

**存储键**：`mud:access-token:v1`  
**存储类型**：sessionStorage

- 用于 API 请求认证
- 会话结束后清除

### 刷新令牌

**存储键**：`mud:refresh-token:v1`  
**存储类型**：sessionStorage

- 用于刷新访问令牌
- 会话结束后清除

### 设备标识

**存储键**：`mud:device-id:v1`  
**存储类型**：localStorage

- 唯一标识设备
- 用于多设备管理

---

## 运行时常量

### 位置

```
packages/client/src/constants/
├── api.ts           # API 相关常量
├── editor/          # 编辑器常量
├── input/           # 输入相关常量
├── ui/              # UI 相关常量
│   ├── i18n.generated.ts  # 国际化文本（自动生成）
│   ├── performance.ts     # 性能配置常量
│   ├── style.ts           # 样式配置常量
│   └── text.ts            # 文本样式常量
├── visuals/         # 视觉效果常量
└── world/           # 世界相关常量
```

### API 常量

```typescript
// packages/client/src/constants/api.ts
export const API_BASE_URL = '/api';
export const SOCKET_PATH = '/socket.io';
```

### 输入常量

```typescript
// packages/client/src/constants/input/
export const KEY_BINDINGS = {
  moveUp: ['w', 'ArrowUp'],
  moveDown: ['s', 'ArrowDown'],
  moveLeft: ['a', 'ArrowLeft'],
  moveRight: ['d', 'ArrowRight'],
  interact: ['e', 'Enter'],
  inventory: ['i'],
  skills: ['k'],
  map: ['m'],
  // ...
};
```

---

## 环境变量

客户端构建时可通过环境变量配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| VITE_API_URL | API 服务器地址 | `/api` |
| VITE_SOCKET_URL | WebSocket 地址 | 同源 |
| VITE_BUILD_ID | 构建标识 | 自动生成 |

### 使用方式

```typescript
const apiUrl = import.meta.env.VITE_API_URL || '/api';
```

---

## 调试配置

### 移动调试

**存储键**：`mud:movement-debug`

```typescript
// 启用移动调试
localStorage.setItem('mud:movement-debug', 'true');
```

### 开发者工具

在控制台可访问：

```javascript
// 查看当前配置
window.__MUD_DEBUG__.getConfig();

// 查看运行时状态
window.__MUD_DEBUG__.getState();
```

---

## 配置重置

### 清除所有本地配置

```javascript
// 清除所有 mud: 前缀的存储
Object.keys(localStorage)
  .filter(key => key.startsWith('mud:'))
  .forEach(key => localStorage.removeItem(key));

Object.keys(sessionStorage)
  .filter(key => key.startsWith('mud:'))
  .forEach(key => sessionStorage.removeItem(key));
```

### 重置单项配置

```typescript
// 重置 UI 样式
import { resetUiStyleConfig } from './ui/ui-style-config';
resetUiStyleConfig();

// 重置性能配置
import { resetMapPerformanceConfig } from './ui/performance-config';
resetMapPerformanceConfig();
```

---

## 相关文档

- [服务端环境变量](server-env.md)
- [服务端运行时配置](server-runtime-config.md)
