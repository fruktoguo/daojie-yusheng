# 10 legacy 归档与最终切换

目标：完成最后的 legacy 退场和 next 主线接班。

## 当前基线

这一步不是“把 legacy 全删光”，而是把仓库从“next 重构中”切到“next 唯一主线”。

当前还需要被切换的对象至少包括：

- 顶层入口文档
  - `README.md`
- next 计划与说明文档
  - `docs/next-plan/*`
  - `docs/next-in-place-hard-cut-plan.md`
- 运维与验证文档
  - `docs/server-next-operations.md`
  - `packages/server/README.md`
  - `packages/server/TESTING.md`
  - `packages/server/REPLACE-RUNBOOK.md`
- workflow / deploy 口径
  - `.github/workflows/*`

当前顶层 README 还有一个明显历史口径问题：

- 它仍在用 `client-next/shared-next/server-next` 的叫法描述实际 `packages/client`、`packages/shared`、`packages/server`

所以 `10` 不只是“归档 legacy”，还包含把仓库主入口文案彻底改成 next 唯一主线。

## 任务

- [ ] 列出仍然必须保留的 legacy 文件范围
- [ ] 把不再需要的 legacy 入口从主文档中移除
- [ ] 把不再需要的 legacy 入口从主流程中移除
- [ ] 把 legacy 剩余价值收束为“查规则 / 查旧数据格式 / 迁移来源”
- [ ] 更新顶层说明文档，明确仓库只有 next 是活跃主线
- [ ] 更新部署 / 验证 / 运维文档，移除误导性的旧主线描述
- [ ] 完成一次 next 主线切换前检查
- [ ] 完成一次 next 主线切换后检查
- [ ] 记录仍保留的 legacy 归档范围和原因

## 执行顺序

### 第 1 批：先列 legacy 保留白名单

- [ ] 保留为归档/参考的 legacy 目录范围
- [ ] 保留为迁移来源的 legacy 文件范围
- [ ] 保留为审计/比对证据的 legacy 文件范围

至少分成三类：

- 查旧规则
- 查旧数据格式
- 迁移脚本输入来源

这一步不做删除，只做白名单。

### 第 2 批：清理主文档口径

- [ ] 更新 `README.md`
- [ ] 更新 `docs/next-in-place-hard-cut-plan.md`
- [ ] 更新 `docs/next-plan/README.md`
- [ ] 确认主文档不再把 legacy 写成“默认落点”或“并行主线”

重点修正：

- 历史 `client-next/shared-next/server-next` 命名
- “还在兼容迁移中”的旧表述
- “legacy 对齐”作为默认完成标准的说法

### 第 3 批：清理验证 / 运维口径

- [ ] 更新 `docs/server-next-operations.md`
- [ ] 更新 `packages/server/README.md`
- [ ] 更新 `packages/server/TESTING.md`
- [ ] 更新 `packages/server/REPLACE-RUNBOOK.md`
- [ ] 检查 `.github/workflows/*` 是否仍有误导性的旧主线描述

目标：

- 文档里不再出现“legacy 是当前活跃线”的误导
- next gate 和 deploy 口径清晰一致

### 第 4 批：把主流程中 legacy 入口移出

- [ ] 从主任务文档中移除不再需要的 legacy 入口
- [ ] 从主开发命令、默认启动路径、默认验证路径中移除 legacy 主入口
- [ ] 保留 legacy 仅作为显式归档/排查入口

重点确认：

- `./start-next.sh` 与 `./start.sh` 的职责
- 根级推荐命令
- 文档首页推荐入口

### 第 5 批：做切换前检查

- [ ] `docs/next-plan/main.md` 已完成到可切换状态
- [ ] `03/04/05/06/07/08/09` 已达到可交接级别
- [ ] `pnpm build`
- [ ] `pnpm verify:replace-ready`
- [ ] 必要时再补：
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`
- [ ] `05` 中定义的主要 compat 面已退到可接受范围
- [ ] `10` 白名单里的 legacy 范围已确定

### 第 6 批：做切换后检查

- [ ] 仓库主入口文档已统一写成 next 唯一主线
- [ ] 新人按 README 进入，不会先走到 legacy
- [ ] 验证、运维、部署文档不再互相打架
- [ ] 仍保留的 legacy 文件都有保留原因

## legacy 保留模板

每个最终仍保留的 legacy 范围，都要按这个模板记录：

| 范围 | 保留原因 | 谁还在读 | 计划何时再评估 |
| --- | --- | --- | --- |
| `legacy/...` | 查旧规则 / 查旧数据格式 / 迁移输入 | 文档 / 脚本 / 人工排查 | 阶段性复查日期 |

## 切换前检查表

- [ ] next 真源已唯一化
- [ ] 迁移脚本已能把必要数据写入 next 真源
- [ ] 主要 compat 面已不再阻塞主链
- [ ] server/client/shared 主链都已收口到可继续开发
- [ ] 验证门禁口径已固定

## 切换后检查表

- [ ] README 与 docs 首页只指向 next 主线
- [ ] 默认命令只指向 next 主线
- [ ] workflow 文案不再暗示 legacy 是主入口
- [ ] legacy 只剩归档和迁移参考价值

## 本阶段不做的事

- 不在这里顺手重构 runtime 或客户端代码。
- 不在这里删掉所有 legacy 文件。
- 不在没有白名单和切换检查表之前直接宣布“legacy 已经退场”。

## 完成定义

- [ ] `packages/*` 成为唯一活跃主线
- [ ] legacy 只剩归档和迁移参考价值
- [ ] next 主线可以作为后续唯一开发入口
