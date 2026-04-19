# next 主线切换执行清单

目标：把 `10` 里仍然必须人工执行的切换前/切换后动作写成固定清单，避免把仓库内 proof、自动 gate 和真实切换操作混在一起。

使用规则：

- 这份清单不替代 `verify:replace-ready*`、`proof:*` 和 `build`
- 所有自动 gate 仍然先按 `09` 跑完，再进入这里
- 这份清单只回答“真实切换当天/切换后 30-60 分钟要人工看什么”
- 每次真实切换都要配一份执行记录，模板见 [10-cutover-execution-log-template.md](./10-cutover-execution-log-template.md)
- 这里的未勾选是“本次切换尚未执行”，不等于仓库主线仍未完成

## 切换前

### 1. gate 与 proof

- [ ] `pnpm build`
- [ ] `pnpm verify:replace-ready`
- [ ] `pnpm verify:replace-ready:with-db`
- [ ] `pnpm verify:replace-ready:acceptance`
- [ ] `pnpm verify:replace-ready:full`
- [ ] `pnpm verify:replace-ready:doctor`
- [ ] `pnpm proof:cutover-readiness`
- [ ] `pnpm proof:cutover-preflight`
- [ ] 如需 destructive：`pnpm verify:replace-ready:shadow:destructive:preflight`

要求：

- `doctor` 必须只剩 `shadow-destructive` 未就绪，或在维护窗口内显式放开 destructive
- 如果计划在本次窗口执行 destructive，再额外确认 `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`
- destructive 只能在 `preflight` 明确返回 `maintenance-active` 后继续

### 2. 环境与入口

- [ ] 当前默认 README/启动入口已指向 next 主线
- [ ] `start-next.sh`、根级 `dev:* / start:* / verify:replace-ready*` 命令可正常使用
- [ ] `legacy/*` 不再被默认启动、默认验证或默认构建流程引用
- [ ] shadow URL、GM 密码、数据库连接与当前切换窗口目标一致

### 3. 运营前置确认

- [ ] 值班负责人已确认切换窗口
- [ ] 回滚负责人已确认可用
- [ ] 数据库备份位置、shadow 目标、GM 凭据已核对
- [ ] 如果本次要跑 destructive，维护窗口状态已显式打开

## 切换中

### 1. 最小只读确认

- [ ] `/health` 可达
- [ ] `gm/maps`
- [ ] `gm/editor-catalog`
- [ ] `gm/maps/:mapId/runtime`
- [ ] `gm/database/state`

要求：

- 先看只读面，确认 next 实例是活的
- 再进入玩家主链与 GM 写路径检查

### 2. 玩家主链最小闭环

- [ ] 登录进入世界
- [ ] 地图移动 / 基本交互
- [ ] 详情弹层 / 任务 / 邮件 / 市场最小可用
- [ ] 断线重连后 bootstrap / delta 继续正常

### 3. GM 最小闭环

- [ ] `gm-next` 只读面返回正常
- [ ] 必要时验证 `gm/database/state`
- [ ] 必要时验证地图运行时只读面

## 切换后 30-60 分钟观察

### 1. 服务端与协议

- [ ] 没有回退到 legacy 入口
- [ ] 没有出现 `legacy` 兼容分支被重新命中的异常迹象
- [ ] next socket 只消费 next 事件，不混入旧事件命名

### 2. GM / 数据库 / 备份

- [ ] `gm/database/state` 的阶段、最近作业信息与当前窗口一致
- [ ] 若执行了 backup/restore，检查点与产物路径已回写
- [ ] 若执行了 destructive，确认回滚预案未被破坏

### 3. 文档回写

- [ ] 在执行记录中补齐：
  - 操作者
  - 时间窗口
  - 目标环境
  - gate 结果
  - 观察结果
  - 是否回滚
- [ ] 如果本轮暴露出新的常见故障，把症状与处理写回：
  - `docs/server-next-operations.md`
  - `packages/server/TESTING.md`
  - `docs/next-plan/09-verification-and-acceptance.md`

## 回滚触发条件

- [ ] 玩家无法稳定登录或进入世界
- [ ] next socket 主链出现系统性事件消费异常
- [ ] `gm/database/state` 与当前窗口动作不一致
- [ ] 关键 GM 只读面不可用
- [ ] 数据库恢复链出现无法解释的异常

说明：

- 一旦命中任一回滚触发条件，本轮执行记录必须写明：
  - 首个异常时间
  - 异常症状
  - 是否已回滚
  - 回滚后状态
