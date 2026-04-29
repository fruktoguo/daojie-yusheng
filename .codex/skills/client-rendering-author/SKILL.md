---
name: client-rendering-author
description: Use this skill when changing packages/client map rendering, Canvas 2D drawing, camera, viewport, projection, hit testing, map interaction, render caches, frame performance, or renderer abstractions.
---

# 客户端地图与渲染

用于修改地图、Canvas 2D、相机、投影、视口、命中检测和渲染缓存。目标是保持画面正确、交互稳定和渲染成本可控。

## 商业级 MMO 口径

- 渲染链路必须能承受多人同屏、实体频繁变化、地图长期停留和移动端性能限制。
- 地图渲染要与网络 delta 和客户端派生状态配合，不能把局部世界变化放大全图重绘。
- 画面正确性、命中检测和服务端权威坐标必须一致；表现插值不得污染权威状态。
- 性能优化要可解释、可回归，避免为了单点效果破坏整体渲染架构。

## 强制流程

1. 先判断改动影响渲染层、地图交互层还是应用状态层。
2. 优先复用现有 camera、viewport、tile projection、renderer 抽象和缓存。
3. 地图静态层、动态实体层、选择/hover/overlay 层尽量分离更新。
4. 高频变化只重绘受影响区域或受影响层；不要因一个实体变化重建全部地图状态。
5. 命中检测必须与实际投影一致，手机端触控命中范围要单独考虑。
6. 视觉表现可以预测或插值，但权威位置和结算仍以服务端同步为准。

## 性能红线

- 渲染帧内避免全量解析协议数据。
- 不在每帧创建大量短命对象、重复全图查询或重复绑定事件。
- 地图静态资源、图块定义、样式表必须缓存或预解析。
- 不把 DOM UI 的整面板刷新绑定到地图高频渲染节奏上。

## 交付说明

- 改动影响哪些渲染层或交互层。
- 是否满足商业级 MMO 的多人同屏、长时间运行和移动端渲染性能要求。
- 是否复用现有 renderer/camera/viewport 能力。
- 高频更新是否避免全量重绘或全量重算。
- 是否检查桌面、深色/浅色相关表现和手机端触控路径。
