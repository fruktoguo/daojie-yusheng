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

真实切换当天的人工执行单和记录模板固定在：

- [10-cutover-execution-checklist.md](./10-cutover-execution-checklist.md)
- [10-cutover-execution-log-template.md](./10-cutover-execution-log-template.md)

## 任务

- [x] 列出仍然必须保留的 legacy 文件范围
- [x] 把不再需要的 legacy 入口从主文档中移除
- [x] 把不再需要的 legacy 入口从主流程中移除
- [x] 把 legacy 剩余价值收束为“查规则 / 查旧数据格式 / 迁移来源”
- [x] 更新顶层说明文档，明确仓库只有 next 是活跃主线
- [x] 更新部署 / 验证 / 运维文档，移除误导性的旧主线描述
- [ ] 完成一次 next 主线切换前检查
- [ ] 完成一次 next 主线切换后检查
- [x] 记录仍保留的 legacy 归档范围和原因
- [x] 固定仓库内 next cutover / readiness proof
- [x] 固定真实切换前/切换后人工执行清单与记录模板

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
- [x] 更新 `docs/next-in-place-hard-cut-plan.md`
- [x] 更新 `docs/next-plan/README.md`
- [x] 确认主文档不再把 legacy 写成“默认落点”或“并行主线”

重点修正：

- 历史 `client-next/shared-next/server-next` 命名
- “还在兼容迁移中”的旧表述
- “legacy 对齐”作为默认完成标准的说法

### 第 3 批：清理验证 / 运维口径

- [x] 更新 `docs/server-next-operations.md`
- [x] 更新 `packages/server/README.md`
- [x] 更新 `packages/server/TESTING.md`
- [x] 更新 `packages/server/REPLACE-RUNBOOK.md`
- [x] 检查 `.github/workflows/*` 是否仍有误导性的旧主线描述

目标：

- 文档里不再出现“legacy 是当前活跃线”的误导
- next gate 和 deploy 口径清晰一致

### 第 4 批：把主流程中 legacy 入口移出

- [x] 从主任务文档中移除不再需要的 legacy 入口
- [x] 从主开发命令、默认启动路径、默认验证路径中移除 legacy 主入口
- [x] 保留 legacy 仅作为显式归档/排查入口

重点确认：

- `./start-next.sh` 与 `./start.sh` 的职责
- 根级推荐命令
- 文档首页推荐入口

### 第 5 批：做切换前检查

- [x] 仓库内 cutover/readiness proof 已固定
- [x] 仓库内 cutover/preflight proof 已固定
- [x] 仓库内 cutover/operations proof 已固定
- [x] `docs/next-plan/main.md` 已完成到可切换状态
- [x] `03/04/05/06/07` 已达到可交接级别
- [x] `09` 已收成“默认 gate 已跑通，destructive 仍单独保留”的固定口径
- [x] `08/09/10` 的仓库内最终切换检查已固定
- [ ] 真实切换前/后观察仍需继续收尾
- [x] `pnpm build`
- [x] `pnpm verify:replace-ready`
- [x] 当前轮次已补：
  - `pnpm verify:replace-ready:shadow:destructive:preflight`
  - `pnpm verify:replace-ready:shadow:destructive`
- [x] `05` 中定义的主要 compat 面已退到可接受范围
- [x] `10` 白名单里的 legacy 范围已确定

## 当前阻塞

- `packages/server/src/network/world-legacy-player-repository.js` 已删除，legacy `users/players` 显式 migration 查询已内联到 `world-player-source.service.js`。
- auth/snapshot 当前剩余 bridge 已收缩到 `token_seed -> native` 的 bootstrap-owned recovery / required normalization；已加载 `legacy_backfill / legacy_sync` 身份不再进入 next auth 主链。
- `09` 的 `local / with-db / acceptance / full` 已全部实跑通过；`shadow-destructive` 也已在本机 maintenance-active shadow 上补过一轮证据；当前只剩真实切换前后观察未完成。
- 切换后检查还缺真实新人入口与运维/部署观察窗口，当前只能先固定仓库内 proof 与文档口径。

### 第 6 批：做切换后检查

- [x] 仓库主入口文档已统一写成 next 唯一主线
- [x] 新人按 README 进入，不会先走到 legacy
- [x] 验证、运维、部署文档不再互相打架
- [x] 仍保留的 legacy 文件都有保留原因

## legacy 保留模板

每个最终仍保留的 legacy 范围，都要按这个模板记录：

| 范围 | 保留原因 | 谁还在读 | 计划何时再评估 |
| --- | --- | --- | --- |
| `legacy/...` | 查旧规则 / 查旧数据格式 / 迁移输入 | 文档 / 脚本 / 人工排查 | 阶段性复查日期 |

## 当前 legacy 保留白名单（2026-04-18）

| 范围 | 保留原因 | 谁还在读 | 计划何时再评估 |
| --- | --- | --- | --- |
| `legacy/server/src/database/entities/*.ts`、`legacy/server/data/runtime/suggestions.json`、`legacy/server/src/game/map.service.ts` | 一次性迁移脚本与迁移清单当前仍需要这些 legacy 真源定义来锁定输入表/文件/导出格式 | `docs/next-plan/03-required-data-migration-checklist.md`、`packages/server/src/tools/migrate-next-mainline-once.js`、人工迁移排查 | `03/04/09` 全部闭环后复查，优先在迁移 proof 固定后缩范围 |
| `legacy/client/src/**`、`legacy/shared/src/**`、`legacy/server/src/game/**` | 作为归档行为基线、协议旧格式与 UI/玩法旧规则参考；不再进入默认开发、默认验证或默认启动流程，只在人工排查与历史对照时查看 | `docs/next-plan/06-server-mainline-refactor.md`、`docs/next-plan/07-client-mainline-refactor.md`、`docs/next-plan/08-shared-content-and-map-cleanup.md`、人工对照排查 | `09/10` 闭环后复查，优先继续收缩到必要子目录 |
| `legacy/client`、`legacy/server`、`legacy/shared` 包根与其显式启动入口 | 仅保留为归档运行/排查入口，不再参与默认 workspace 或默认 next 构建；根级命令也已收口到 `archive:legacy:*` 命名 | `start.sh`、根级 `package.json` 里的 `archive:legacy:*` 命令、人工归档排查 | 当 `10` 的切换前/切换后检查完成后复查，评估是否还能进一步下沉为纯静态归档 |

## 切换前检查表

- [x] next 真源已唯一化
- [x] 迁移脚本已能把必要数据写入 next 真源
- [x] 主要 compat 面已不再阻塞主链
- [x] server/client/shared 主链都已收口到可继续开发
- [x] 验证门禁口径已固定
- [x] 已有独立的人工执行清单与记录模板

## 切换后检查表

- [x] README 与 docs 首页只指向 next 主线
- [x] 默认命令只指向 next 主线
- [x] workflow 文案不再暗示 legacy 是主入口
- [x] legacy 只剩归档和迁移参考价值
- [x] 已有独立的切换后观察记录模板

## 本轮仓库内 proof

- [x] `proof:cutover-readiness`
  - 固定检查根级默认脚本、README / `next-plan` 入口、server 运维文档、workflow 与 `10/main` 文档口径
  - 固定 legacy 只允许以 `archive:legacy:*`、`./start.sh` 和白名单/迁移/审计文档的形式继续出现
  - 不回答 shadow/acceptance/full 的真实环境是否 ready；那部分继续由 `09` 负责
- [x] `proof:cutover-preflight`
  - 固定检查 `03/04/05/06/07` 的完成定义继续为绿
  - 固定检查 `08` 的完成定义也继续为绿
  - 固定检查 `09` 继续保持“`local/with-db/shadow/acceptance/full` 已过，仅 `shadow-destructive` 仍维护窗口保留”
  - 固定检查总表只再把真实切换前/后观察与可选 destructive proof 保留为剩余 blocker
- [x] `proof:cutover-operations`
  - 固定检查切换执行清单与执行记录模板存在
  - 固定检查 `10/main/server-next-operations/REPLACE-RUNBOOK` 都继续引用这两份人工执行文档
  - 固定检查 `10` 仍把“真实切换前/后检查”保留为人工未完成项，不会被仓库内 proof 冒充完成

## 本阶段不做的事

- 不在这里顺手重构 runtime 或客户端代码。
- 不在这里删掉所有 legacy 文件。
- 不在没有白名单和切换检查表之前直接宣布“legacy 已经退场”。

## 完成定义

- [x] `packages/*` 成为唯一活跃主线
- [x] legacy 只剩归档和迁移参考价值
- [x] next 主线可以作为后续唯一开发入口
