# 按计划推进（plan-drive）

本仓库 `docs/plans/**` 下的计划 md 是当前生产主线的执行依据。请按本提示词的口径，把指定计划"读懂 → 拆段 → 评估并行安全 → 受控推进 → 回写勾选 → 给交付说明"完整跑通，**不要只停在方案层**。

## 入参约定

我会以以下任意形式给出目标：

- 显式路径：`docs/plans/xxx.md` 或绝对路径
- 计划关键词：例如"内存克隆"、"地图地块多层"、"运行时事件总线"
- 不指定：默认读 `docs/plans/INDEX.md`，挑选 **进行中、最高优先级、未阻塞** 的一项

不要在我没确认前直接对多个计划同时下手。

## 0. 强制前置：读

1. 列出候选计划文件（如果是关键词匹配，列 1–3 个最相关的）。
2. 先读 `docs/plans/INDEX.md` 与目标计划全文，再读计划提到的关键源码（按 `AGENTS.md` 第 5、6 节落点定位）。
3. 同步比对计划清单与代码现状：
   - 计划里 `[x]` 但代码里没体现 → 标"账实不符"，停下来问我。
   - 计划里 `[ ]` 但代码已实现 → 标"待回写"，提议勾选。
4. 在 `git status` / `git diff --stat` 里确认是否已有用户改动；**有则在其上叠加，禁止回滚或覆盖**。

## 1. 拆段与落点判定

对计划中"下一步要推进的任务"，逐项给出：

- 落点：`client / shared / server / config-editor` 中的哪一层（参考 `AGENTS.md` §5–§7）。
- 是否命中红线热路径：tick / AOI / 广播 / 寻路 / 战斗 / 渲染帧 / UI 高频更新 / 协议 / 持久化真源 / 部署基线。
- 预计触碰的 smoke / proof / audit / bench 入口。
- 预计 shared 协议、protobuf、envelope、持久化表、迁移、outbox 是否会动。
- 风险等级：低（单文件局部）/ 中（跨层联动）/ 高（协议、持久化、删除、部署）。

只给"地图"，不要在这一步动代码。

## 2. 并行安全评估（多 agent 启用门）

**默认串行**。只有满足以下全部条件，才允许用 `subagent` 工具或 `/spawn` 起多 agent 并行：

- 各任务落在 **不同主包** 或 **明显不重叠的目录**（例：`runtime/mail` vs `react-ui` 某面板）。
- 不写入同一文件、不修改同一函数；产物路径不重叠。
- 不同时改 `packages/shared/**`、`*-protocol*`、`network-protobuf*`、持久化迁移、`docker-stack*.yml`、`deploy-*.sh`、`docker-build-*.sh`、`AGENTS.md`、`docs/plans/main.md`、目标计划文件本身。
- 不同时进入同一条 tick / AOI / 广播 / 战斗结算热路径。
- 各分支跑的门禁互相独立，不会串扰持久化或 Redis 在线态测试夹具。

**必须串行**（不允许多 agent 并行）：

- 任意 `packages/shared/**` 协议字段或常量改动。
- 任意持久化迁移、表结构、outbox / flush 边界、Redis key 规约改动。
- 删除文件、移动模块、大范围重命名。
- 任何会改变 `docs/plans/INDEX.md` 或同一计划文件勾选状态的写回（这一步永远在主 agent 上做）。
- 任何 git 写操作（commit / push / branch）。

**输出形如**：

```
DAG:
  A (server runtime/mail 单写)   ──┐
  B (client react-ui 邮件面板) ───┼─→ C (主 agent 汇总 + 勾选 + 验证总结)
  独占串行: D (shared 协议字段新增)
```

并把"为什么这样划分、为什么 D 必须串行"写清楚，等我确认再起多 agent。

## 3. 多 agent 编排规则（仅在 §2 通过后）

优先使用 `subagent` 工具的 `blocking` 模式做 DAG 编排：

- 每个并行 stage 用 `yolo` 或 `kiro_default` 角色都可以；产物文件、验证命令、门禁清单写进 `prompt_template`。
- **每个 stage 必须自己跑最小门禁**（参考 `verify-pick`），不要把验证拖到最后。
- stage 之间通过 `depends_on` 串好；汇总 stage 由主 agent 收口，做账实比对、勾选回写、交付说明。
- 不允许在并行 stage 里执行：写 `docs/plans/**`、改 `packages/shared/**`、改持久化、`git commit/push`、推镜像。

`/spawn` 适合临时旁路调研（例：让一个 agent 边读边整理一份参考清单），不适合做"会改代码的并行分支"——因为它无法在主 agent 里以 DAG 方式 join。**如果某 stage 会写代码，优先用 `subagent` 工具，不用 `/spawn`**。

## 4. 受控推进

按 DAG 顺序执行。每完成一个节点：

1. 跑该节点对应的最小门禁（按 `verify-pick` 的决策矩阵）。
2. 协议变更：补 `pnpm audit:protocol`；持久化变更：补 `pnpm verify:release:with-db`；客户端 UI：覆盖浅色 / 深色 / 手机三态自检（按 §10）。
3. 失败立刻停。如果同一思路连续两次失败，**不要继续打补丁**，停下来诊断根因再换路线（按系统规则中"failure loop recognition"）。
4. 推进过程中如果发现需要扩协议、扩持久化、删除模块、改部署基线，**立即停下来问我**。

## 5. 计划回写

在主 agent 上完成：

- 对计划文件中已完成项把 `[ ]` 改为 `[x]`，保持原行其它内容；不要顺手重排章节、不要"美化"原文。
- 如果整段任务不再做，直接删掉对应行，不要保留僵尸条目（与 `docs/plans/main.md` 的使用规则一致）。
- 如果出现新发现的子任务，新增在原有清单末尾，明确标注来源（"由 plan-drive 推进发现"）。
- 必要时同步更新 `docs/plans/INDEX.md` 的进度百分比。
- **不要主动 commit / push**，除非我明确要求。

## 6. 交付说明（每次都要给）

按 `AGENTS.md` §19 的结构：

1. 实际完成了什么：DAG 哪些 stage 跑通、动了哪些文件。
2. 跑了哪些门禁、退出码、关键日志摘要；UI 改动是否覆盖浅 / 深 / 手机；协议 / 持久化 / 部署是否触发对应审计。
3. 剩余风险与未覆盖项；计划文件勾选差异；是否有"账实不符"待我裁定。
4. 是否需要后续 commit 拆分（指向 `commit-atomic` 提示词）或发布（指向 `release-precheck` 提示词）。

## 全程红线（不允许）

- 不主动扩展计划范围，不顺手改无关模块（`AGENTS.md` §1、§3）。
- 不把"看起来差不多"的任务合到一个 stage 里硬上多 agent。
- 不绕过最小门禁直接说"应该没问题"。
- 不写回 `[x]` 给"实际未完成 / 未验证"的项。
- 不动 git 配置；不 `--amend` 已推送 commit；不 force push；不 `reset --hard`；不 `clean -f`；不 `branch -D`。
- 不为了"更现代"引入用户可感知行为变化（`AGENTS.md` §3）。
- 不在 `.ts` 文件里写 CJS 风格、不新增 `// @ts-nocheck` 等抑制注释（`AGENTS.md` §3）。

## 一句话执行口径

**先读计划，再判落点，再判并行安全，再分 DAG，再受控推进，最后回写勾选 + 给交付说明；高风险操作和并行启用全部需要我点头。**
