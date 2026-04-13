---
name: runtime-performance-author
description: Use this skill when optimizing or reviewing hot runtime paths in this repo, including tick, AOI, pathfinding, combat, attribute settlement, broadcast assembly, allocation pressure, serialization pressure, and startup-time config parsing.
---

# 运行时性能与热路径

这个 skill 用于处理高频链路和启动期配置加载。核心目标是先减少重复计算，再减少重复分配，再减少重复序列化；不要在热路径里偷用 JSON 和字符串技巧堆正确性。

适用场景：

- 修改 tick、AOI、广播、寻路、碰撞、属性结算、战斗运行时
- 发现某条链路有明显序列化热点、临时对象过多、字符串键泛滥
- 新增配置加载、静态表解析、启动期 catalog 构建
- 评审某段逻辑是否误把冷路径模式带进热路径

## 热路径识别

默认把这些视为热路径：

- 地图 tick
- AOI 计算与广播
- 寻路、碰撞、占用查询
- 战斗、属性结算、buff 处理
- 高频协议组包

编辑器保存、静态导入、catalog 构建、reload、minimap 生成通常是冷路径，处理方式可以不同。

## 强制流程

1. 先确认这段逻辑是热路径还是冷路径。
2. 如果是热路径，先找重复计算，再看重复分配，最后看重复序列化。
3. 优先使用原生数据结构和纯数据运算，不要先上 JSON 或字符串签名比较。
4. 配置文件解析放在服务端启动阶段完成，运行期直接读取原生结构。
5. tick 循环里避免数据库 IO；实时态可用 Redis，但也不要在热路径里做不必要的外部往返。
6. 需要查重、索引、占用映射时，优先设计稳定结构，不临时拼装字符串键。

## 硬规则

- tick、AOI、广播、寻路、属性结算等热路径禁止依赖 `JSON.stringify`、`JSON.parse`、字符串签名比较、字符串键临时拼装。
- 先减少重复计算，再减少重复分配，再减少重复序列化。
- 配置解析必须在启动阶段完成，运行期直接读取原生结构。
- Redis 用于在线态与实时态，避免在 tick 循环中做数据库 IO。
- 不要把冷路径的“可读性式实现”直接搬进热路径。

## 实现偏好

- 能复用预解析结果的，不要运行期反复解析。
- 能复用索引和缓存视图的，不要每 tick 全表扫描。
- 能增量更新的，不要整包重算。
- 能复用对象池或稳定容器时，可以优先减少短命对象洪峰。
- 只有在热点确实成立时才引入更复杂结构，避免为了想象中的性能问题过度设计。

## 交付时必须说明

- 改动是否位于热路径
- 主要减掉的是重复计算、重复分配还是重复序列化
- 是否仍有 JSON/stringify/parse、字符串签名比较、临时字符串键等热点残留
- 配置是否已改为启动期解析、运行期直读
