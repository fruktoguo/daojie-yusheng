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

当前这一步的重点，不再是发现“README 和运维文档哪里写错了”，而是把已经修过的入口文档彻底纳入切换前/切换后检查。

## 任务

- [x] 列出仍然必须保留的 legacy 文件范围
- [ ] 把不再需要的 legacy 入口从主文档中移除
- [ ] 把不再需要的 legacy 入口从主流程中移除
- [ ] 把 legacy 剩余价值收束为“查规则 / 查旧数据格式 / 迁移来源”
- [ ] 更新顶层说明文档，明确仓库只有 next 是活跃主线
- [ ] 更新部署 / 验证 / 运维文档，移除误导性的旧主线描述
- [ ] 完成一次 next 主线切换前检查
- [ ] 完成一次 next 主线切换后检查
- [x] 记录仍保留的 legacy 归档范围和原因

## 执行顺序

### 第 1 批：先列 legacy 保留白名单

- [x] 保留为归档/参考的 legacy 目录范围
- [x] 保留为迁移来源的 legacy 文件范围
- [x] 保留为审计/比对证据的 legacy 文件范围

至少分成三类：

- 查旧规则
- 查旧数据格式
- 迁移脚本输入来源

这一步不做删除，只做白名单。

### 第 2 批：清理主文档口径

- [x] 更新 `README.md`
- [ ] 更新 `docs/next-in-place-hard-cut-plan.md`
- [ ] 更新 `docs/next-plan/README.md`
- [ ] 确认主文档不再把 legacy 写成“默认落点”或“并行主线”

重点修正：

- 历史 `client-next/shared-next/server-next` 命名
- “还在兼容迁移中”的旧表述
- “legacy 对齐”作为默认完成标准的说法

### 第 3 批：清理验证 / 运维口径

- [x] 更新 `docs/server-next-operations.md`
- [x] 更新 `packages/server/README.md`
- [x] 更新 `packages/server/TESTING.md`
- [x] 更新 `packages/server/REPLACE-RUNBOOK.md`
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

## 当前阻塞

- `packages/server/src/network/world-legacy-player-repository.js` 已删除，legacy `users/players` 显式 migration 查询已内联到 `world-player-source.service.js`。
- auth/snapshot 的 runtime migration bridge 还没完全退出主链。
- GM legacy scope fallback 还没删。
- 工作区仍存在既有文档/运行手册脏改，切换前检查还不能判定完成。

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

## 当前 legacy 保留白名单（2026-04-18）

| 范围 | 保留原因 | 谁还在读 | 计划何时再评估 |
| --- | --- | --- | --- |
| `legacy/server/src/database/entities/*.ts`、`legacy/server/data/runtime/suggestions.json`、`legacy/server/src/game/map.service.ts` | 一次性迁移脚本与迁移清单当前仍需要这些 legacy 真源定义来锁定输入表/文件/导出格式 | `docs/next-plan/03-required-data-migration-checklist.md`、`packages/server/src/tools/migrate-next-mainline-once.js`、人工迁移排查 | `03/04/09` 全部闭环后复查，优先在迁移 proof 固定后缩范围 |
| `legacy/client/src/**`、`legacy/shared/src/**`、`legacy/server/src/game/**` | 作为行为基线、协议基线和 UI/玩法旧规则参考，不再是默认开发落点，但当前 `06/07/08` 收口时仍需对照 | `docs/next-plan/06-server-mainline-refactor.md`、`docs/next-plan/07-client-mainline-refactor.md`、`docs/next-plan/08-shared-content-and-map-cleanup.md`、人工比对排查 | `06/07/08` 达到可交接级别后复查，优先继续收缩到必要子目录 |
| `legacy/client`、`legacy/server`、`legacy/shared` 包根与其显式启动入口 | 仅保留为归档运行/排查入口，不再参与默认 workspace 或默认 next 构建；根级命令也已收口到 `archive:legacy:*` 命名 | `start.sh`、根级 `package.json` 里的 `archive:legacy:*` 命令、人工归档排查 | 当 `10` 的切换前/切换后检查完成后复查，评估是否还能进一步下沉为纯静态归档 |

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
