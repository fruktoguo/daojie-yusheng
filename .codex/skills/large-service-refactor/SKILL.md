---
name: large-service-refactor
description: Use this skill when refactoring oversized services or scripts in this repo, including giant Nest services, map/runtime services, editor services, orchestration-heavy modules, or large TypeScript files that must be split by responsibility instead of cosmetic file slicing.
---

# 超大服务与脚本重构

这个 skill 用于重构已经明显失控的服务或脚本。目标不是把一个 3000 行文件拆成 6 个同名碎片，而是把状态拥有者、编排层、规则层、查询层、持久化层、协议组装层真正分开。

适用场景：

- 某个 service 或 runtime 文件过大，新增需求前已经很难安全修改
- 一个类同时混着 tick 写状态、查询投影、协议组装、持久化、编辑器逻辑
- 现有实现开始用 `partial class`、`prototype` 挂方法、同名 facade 分文件硬撑复杂度
- 想拆 `map.service`、编辑器服务、配置导入服务、战斗运行时等大模块

## 先判断值不值得拆

先确认这是“复杂度问题”而不只是“文件太长”：

- 是否同时承担编排、规则、查询、持久化、协议组装多种职责
- 是否把热路径和冷路径长期混放
- 是否大量依赖巨型 `this`、隐式共享状态和跨段副作用
- 是否很难单独验证某块逻辑，只能整服务联动推演

如果只是单个纯函数文件偏长，但职责仍然单一，不要为了形式拆。

## 强制流程

1. 先画出当前职责清单，不要先切文件。
2. 标出哪些是：
   - 编排
   - 纯规则
   - 纯查询
   - 纯归一化/快照构建
   - 持久化
   - 运行时状态域
   - 编辑器/导入/catalog/minimap 等冷路径
3. 先拆冷路径和纯逻辑，再拆强状态域，最后再薄化总编排层。
4. 总编排层只保留调用顺序、事务边界、日志、回滚、异常收口。
5. 纯规则、纯查询、纯归一化、纯快照构建，优先抽成无状态 helper/domain/query 模块，并保持显式输入。
6. 强状态逻辑按运行时域拆，例如 occupancy、runtime persistence、portal query、combat runtime、map document lifecycle，而不是继续堆进同一个类。
7. 查询接口与状态修改默认分离；读模型、列表、详情、投影不要和 tick 写状态混在同一大段里。
8. 热路径和冷路径必须拆开；tick、AOI、碰撞、寻路、结算不要和编辑器保存、静态导入、catalog 构建、reload 长期混放。

## 硬规则

- 禁止只做“视觉拆文件”而不降复杂度。
- `partial class` 式分布、`prototype` 挂方法、同名 facade 分文件，只能作为过渡整理，不能当最终目标。
- 不按固定行数平均切文件，按职责和状态边界切。
- 模块边界要体现状态拥有者，不要把状态读写继续分散到多个匿名 helper。
- 新模块依赖必须显式；不要靠回调、闭包和隐式共享上下文继续维持巨型耦合。
- 高耦合热路径不要一开始就全量重写，优先围绕纯逻辑和冷路径减压。

## 常见拆分方向

- `xxx.service.orchestrator.ts`
  只留薄编排
- `xxx.domain.ts`
  放纯规则或领域动作
- `xxx.query.ts`
  放列表、详情、过滤、投影、快照
- `xxx.persistence.ts`
  放数据库/缓存写入与读回
- `xxx.runtime.ts`
  放强状态运行时域
- `xxx.protocol.ts`
  放协议组装与 payload 构建

如果仍需要过渡式拆法，文件名必须直接暴露边界，例如 `map.service.portal.ts`、`map.service.runtime.ts`，不要出现一组没有语义的 `map.service.part1.ts`。

## 交付时必须说明

- 原来混了哪些职责
- 这次拆出了哪些模块，各自拥有何种职责
- 哪些热路径被保留原状，哪些冷路径或纯逻辑先被拆走
- 是否还保留过渡式伪 partial class；如果保留，后续目标是什么
- 做完后状态拥有者、依赖方向、可验证边界是否更清晰
