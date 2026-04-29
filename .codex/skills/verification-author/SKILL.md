---
name: verification-author
description: Use this skill when adding, fixing, or running verification gates for packages/*, including pnpm build, replace-ready, doctor, with-db, shadow, acceptance, full, smoke, proof, audit, diagnostics, cleanup chains, and explaining what each gate proves or does not prove.
---

# 验证门禁与证明链

用于执行或维护构建、smoke、proof、audit、with-db、shadow、acceptance、full 等验证。目标是让验证回答的问题清楚，并且测试夹具不会留下持久化垃圾。

## 商业级 MMO 口径

- 验证必须覆盖商业级 MMO 关心的主链：权威运行时、网络包体、持久化真源、客户端连续性、配置发布和运维恢复。
- 门禁结论要能用于替换、发布、回滚和事故排查；不能只证明“本机能跑一次”。
- 会产生持久化对象的验证必须自动清理，避免污染长期运营数据。
- 高频链路和大包体风险要有专项验证或明确未覆盖说明。

## 常用入口

- `pnpm build`
- `pnpm verify:replace-ready:doctor`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:shadow`
- `pnpm verify:replace-ready:acceptance`
- `pnpm verify:replace-ready:full`

## 强制流程

1. 先根据改动范围选择最小相关验证，不盲目只跑最大门禁。
2. 涉及协议时检查 shared 类型、服务端发包、客户端消费和协议审计。
3. 涉及持久化时检查数据库真源、回读、恢复和测试数据清理。
4. 涉及 UI 时说明浅色、深色、手机端是否检查。
5. 涉及热路径时说明是否覆盖性能红线，必要时补小型基准或专项检查。
6. 新增验证脚本如果创建账号、角色、实例、邮件、市场、备份等持久对象，必须补自动清理链。

## 门禁解释口径

- `doctor`：回答环境、依赖、配置和基础可运行性问题，不证明完整业务正确性。
- `with-db`：回答数据库链路、迁移、仓储和回读问题，不证明线上流量表现。
- `shadow`：回答替换链路的影子对照问题，不等同于完整用户验收。
- `acceptance`：回答关键用户路径是否可演练，不覆盖所有边界条件。
- `full`：聚合强门禁，但失败时仍要拆回具体子链路定位。

## 硬规则

- 验证失败不能只记录“失败了”，必须定位到门禁回答的问题范围。
- 有持久化夹具就必须有清理策略，不能依赖人工进库。
- 不用单个 `build` 冒充协议、持久化、UI 或性能验证。
- 不把 shadow、with-db、acceptance、full 的结论混读。

## 交付说明

- 执行了哪些验证，结果如何。
- 是否覆盖商业级 MMO 的运行时、网络、持久化、客户端、配置和运维关键风险。
- 每个验证回答什么，不回答什么。
- 未验证项、原因和风险。
- 是否影响 replace-ready 进度和证明链完整性。
