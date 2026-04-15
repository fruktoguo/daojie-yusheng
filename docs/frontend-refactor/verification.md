# 前端验证口径

这份文档只回答前端重构完成后应该怎么验，不展开后端 replace-ready 全量运维链。

## 1. 当前最低门槛

前端改动后的最低验证应至少包括：

1. `client-next` 构建通过
2. 没有把 patch-first 面板改回整块重建
3. 没有把 next-only 事件链改回 legacy 监听
4. 样式入口没有断裂

## 2. 当前推荐命令

### 最低验证

```bash
pnpm --filter @mud/client-next build
```

### 仓库主入口

```bash
pnpm build
```

注意：

- `pnpm build` 现在只覆盖 next 主线构建：`config-editor`、`client-next`、`server-next compile`
- 它不再联动 `server-next` 的 smoke
- 如果需要主证明链，应单独执行 `pnpm verify:server-next`

## 3. 与 replace-ready 的关系

前端当前被纳入了根级 `server-next` 主证明链的一部分：

- `client-next build`
- `audit:server-next-protocol`
- server-next smoke

但它不能替代真正的 UI 回归。

## 4. 前端手工回归清单

每轮前端重构，建议至少手工覆盖：

### 主题

- 浅色模式
- 深色模式

### 终端形态

- 桌面布局
- 手机布局

### 交互连续性

- 焦点不丢
- 滚动位置不跳
- 选区不丢
- 已选 tab / 子 tab 不乱跳
- 打开的详情弹层不会因低频更新被整块重建

### 高频联动

- 世界移动时面板不抖动
- 小地图路径和世界行为同步
- 自动战斗与目标切换时 UI 不出现明显错位

## 5. 前端验收时必须写明的内容

交付时应明确说明：

- 哪些区域保持了 patch-first
- 哪些区域仍是模板重建
- 是否检查了浅色 / 深色 / 手机
- 是否执行了 `pnpm --filter @mud/client-next build`
- 如果整仓 `pnpm build` 失败，失败点是不是前端引起
- 如果执行了 `pnpm verify:server-next`，失败点是不是来自后端 smoke / audit

## 6. 当前未闭环项

当前仓库里还没有一套“前端专属人工回归脚本”去自动证明：

- 大量实体
- 长时在线
- 高频地图切换
- 极限交互压力

因此前端仍缺一份专门的性能与体验回归门禁。
