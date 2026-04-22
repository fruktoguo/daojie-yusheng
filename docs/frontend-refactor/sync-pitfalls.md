# 前端运行时同步陷阱

这份文档收口了前端同步问题排查里真正还值得长期保留的边界，只保留 `packages/client` 需要长期记住的同步规则。

## 1. 根本问题不是单个动画，而是状态所有权

前端同步问题通常不在“某个动画函数写错”，而在以下边界没收死：

- 哪条链是空间位置真源
- 哪条链是自我状态真源
- 哪条链只负责低频面板
- 哪条链只负责表现层动画

## 2. 前端最容易踩的四类坑

### 2.1 同一状态被多源写入

典型冲突：

- `WorldDelta.p`
- `SelfDelta`
- `main.ts` 外层玩家态
- `MapStore.player`
- renderer 内部插值状态

只要两处以上同时写坐标，就会出现：

- 瞬移一息
- 慢一拍
- 动画被压平

### 2.2 非空间更新误触空间动画

如果把所有 `WorldDelta` 都当成“位移动画开始”，下面这些非空间字段就会错误重置动画时钟：

- `threatArrows`
- `fx`
- `path`
- 其他辅助更新

### 2.3 SelfDelta 越权写地图实体

当前前端应坚持：

- 空间位置主要由 `WorldDelta.p` 驱动
- `SelfDelta` 只处理自我状态、地图切换、HP/QI、朝向等

不要再让 `SelfDelta` 伪装成完整实体 patch 去覆盖地图插值状态。

### 2.4 面板状态和世界状态时序错位

常见问题：

- 面板状态已切换，但世界行为晚一拍
- 世界行为已发生，但面板没跟上

这类问题很容易在：

- 自动战斗
- 目标锁定
- 技能可用性
- 任务导航
- 小地图路径

几条链之间互相覆盖。

## 3. 前端排查顺序

遇到同步问题时，前端应按这个顺序查：

1. 服务端是否真的推进状态
2. 协议包里到底发了什么
3. 前端是否从多条链重复写状态
4. renderer 是否把非空间更新也当成空间更新

## 4. 前端代码定位点

优先检查：

- `packages/client/src/main.ts`
- `packages/client/src/game-map/store/map-store.ts`
- `packages/client/src/renderer/text.ts`
- `packages/client/src/game-map/renderer/canvas-text-renderer-adapter.ts`

UI 联动排查时，再看：

- `packages/client/src/ui/panels/action-panel.ts`
- `packages/client/src/ui/panels/world-panel.ts`
- `packages/client/src/ui/minimap.ts`

## 5. 前端侧长期规则

后续任何前端重构都应继续遵守：

- 空间变化只从明确的空间真源进入插值链
- 非空间更新不能重置运动时钟
- 面板 patch 不得反向写世界真源
- 高低频同步职责必须继续分层
- UI 只展示服务端规则，不替服务端做正确性判定
