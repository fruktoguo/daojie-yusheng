# next 主线切换逐步执行手册

目标：把真实切换前、切换中、切换后观察收成一份按顺序执行的 runbook，减少值班时临场拼步骤。

配套文档：

- 执行清单：[10-cutover-execution-checklist.md](./10-cutover-execution-checklist.md)
- 执行记录模板：[10-cutover-execution-log-template.md](./10-cutover-execution-log-template.md)
- 本地 destructive 样例记录：[10-cutover-execution-log-2026-04-20-local-shadow-destructive.md](./10-cutover-execution-log-2026-04-20-local-shadow-destructive.md)

## 0. 使用范围

这份 runbook 只回答：

- 真实切换前先做什么
- 切换窗口里按什么顺序操作
- 切换后先看什么

它不替代：

- `verify:replace-ready*`
- `proof:*`
- 维护窗口审批流程

## 1. 切换前 30-60 分钟

### 1.1 先确认本轮目标

1. 确认本轮目标环境
2. 确认本轮 shadow URL / 数据库 / GM 凭据
3. 确认是否要执行 destructive
4. 确认值班负责人和回滚负责人

记录要求：

- 先把这些内容写进执行记录模板的“基本信息”和“环境确认”
- 确认默认本地入口为 `./start.sh`；旧 `start-*` 兼容壳不应继续存在

### 1.2 先跑自动 gate

按顺序执行：

1. `pnpm build`
2. `pnpm verify:replace-ready`
3. `pnpm verify:replace-ready:with-db`
4. `pnpm verify:replace-ready:acceptance`
5. `pnpm verify:replace-ready:full`
6. `pnpm verify:replace-ready:doctor`
7. `pnpm proof:cutover-readiness`
8. `pnpm proof:cutover-preflight`

如果要先把机器可做的部分一口气跑掉，也可以直接改用：

1. `bash ./scripts/cutover-auto-preflight.sh`

判定：

- 如果 `doctor` 不是预期状态，先停，不进入切换窗口
- 如果 `build / acceptance / full` 任一失败，先停，不进入切换窗口

### 1.3 如果本轮包含 destructive

执行：

1. 显式设置 `SERVER_SHADOW_ALLOW_DESTRUCTIVE=1`
2. 运行 `pnpm verify:replace-ready:shadow:destructive:preflight`

如果是本地 shadow 演练，也可以直接改用：

1. `bash ./scripts/shadow-local-destructive-preflight.sh`

判定：

- 只有 preflight 明确返回 `maintenance=active` 时，才允许继续 destructive
- 如果 preflight 失败，直接停在这里

## 2. 切换窗口开始后

### 2.1 先看只读面

按顺序检查：

1. `/health`
2. `gm/maps`
3. `gm/editor-catalog`
4. `gm/maps/:mapId/runtime`
5. `gm/database/state`

机器可验证的只读部分也可以直接落盘：

1. `bash ./scripts/cutover-auto-postcheck.sh`

要求：

- 先确认 next 实例是活的
- 再确认 GM 只读面可用

### 2.2 再看玩家最小闭环

按顺序检查：

1. 登录
2. 进入世界
3. 地图移动
4. 基本交互
5. 详情弹层 / 任务 / 邮件 / 市场
6. 断线重连后的 bootstrap / delta

### 2.3 如果本轮需要 destructive

在只读面和玩家最小闭环都没出异常后，再执行：

1. `pnpm verify:replace-ready:shadow:destructive`

如果是本地 shadow 演练，也可以直接改用：

1. `bash ./scripts/shadow-local-destructive.sh`
2. 记录：
   - `backupId`
   - `checkpointBackupId`
   - `sourceBackupId`
   - `appliedAt`
   - `finishedAt`

执行后立即检查：

1. `gm/database/state`
2. backup 下载
3. restore 结果
4. checkpoint metadata

## 3. 切换后 30-60 分钟

### 3.1 协议与入口

检查：

1. 没有回退到 legacy 入口
2. 没有出现明显 `legacy` compat 重新命中
3. next socket 没混入旧事件命名

### 3.2 GM / 数据库 / 备份

检查：

1. `gm/database/state` 阶段与当前窗口动作一致
2. 如果执行了 destructive，checkpoint 与产物路径已回写
3. 如果执行了 destructive，回滚预案仍有效

### 3.3 文档回写

把结果回写到执行记录：

1. 操作者
2. 时间窗口
3. 目标环境
4. gate 结果
5. 观察结果
6. 是否回滚
7. 异常症状和处理动作

如果本轮暴露新故障，再回写到：

- `docs/server-operations.md`
- `packages/server/TESTING.md`
- `docs/next-plan/09-verification-and-acceptance.md`

## 4. 停止条件

命中任一条件立即停：

1. 玩家无法稳定登录或进入世界
2. next socket 主链出现系统性异常
3. `gm/database/state` 与当前窗口动作不一致
4. 关键 GM 只读面不可用
5. 数据库恢复链出现无法解释的异常

停下后必须记录：

1. 首个异常时间
2. 首个异常症状
3. 是否已回滚
4. 回滚后状态

## 5. 完成标志

一次真实切换可以认为完成，至少需要同时满足：

1. 自动 gate 全绿
2. 切换窗口中的只读面检查通过
3. 玩家最小闭环通过
4. GM 只读面通过
5. 若本轮执行 destructive，则 destructive 结果和 checkpoint metadata 均已回写
6. 执行记录已落盘
