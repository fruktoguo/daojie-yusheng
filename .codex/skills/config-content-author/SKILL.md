---
name: config-content-author
description: Use this skill when changing packages/config-editor, shared config schemas, content catalogs, game data import/export, validation rules, startup-time config parsing, runtime config access, or editor-to-server content pipelines.
---

# 配置内容与编辑器链路

用于修改配置编辑器、配置 schema、内容 catalog、导入导出和服务端启动期配置解析。目标是配置在冷路径完成校验和解析，运行时直接读取稳定结构。

## 商业级 MMO 口径

- 配置链路必须支撑大量内容、版本演进、运营发布、回滚和线上问题追溯。
- schema、导入导出和服务端加载要保持同一契约，不能让编辑器能保存但服务端不可运行。
- 运行时配置必须是预校验、预解析、可索引结构，不能把内容复杂度推入 tick 热路径。
- 影响玩家资产、掉落、战斗、地图或经济的配置要可审计、可回放、可验证。

## 强制流程

1. 先判断变更属于编辑器体验、配置 schema、导入导出、服务端加载还是运行时读取。
2. schema 是跨工具契约，修改时同步检查编辑器、shared 类型、服务端加载和运行时消费。
3. 配置解析、校验、索引构建必须在启动期或导入期完成。
4. 运行时只能读取预解析结构，不在 tick 中解析 JSON、查 schema 或拼字符串键。
5. 编辑器草稿、发布版本、导入文件和服务端正式配置要区分真源。
6. 配置错误要尽量在编辑器或启动期暴露，不拖到运行时。

## 硬规则

- 不把编辑器临时格式直接当服务端运行时结构。
- 不在高频运行时路径中做配置文件解析或 schema 校验。
- 不复制分散的常量；跨端共享常量应收敛到 `packages/shared/src/constants/*` 或既有共享位置。
- 不让导入导出绕过校验链制造不可恢复配置。

## 交付说明

- 改动影响编辑器、schema、导入导出、服务端加载中的哪些环节。
- 是否满足商业级 MMO 的内容规模、版本发布、回滚、审计和运行期性能要求。
- 配置是否启动期解析、运行期直读。
- 是否同步了 shared 类型或常量。
- 是否执行了编辑器、服务端或构建验证。
