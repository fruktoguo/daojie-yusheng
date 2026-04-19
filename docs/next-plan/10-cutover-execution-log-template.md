# next 主线切换执行记录模板

> 每次真实切换前后都新建一份记录，按这份模板填写。  
> 这不是自动 proof 输出，而是人工执行与观察记录。

## 基本信息

- 执行日期：
- 时间窗口：
- 环境：
- 执行人：
- 回滚负责人：
- 是否维护窗口：
- 是否包含 destructive：

## 切换前 gate

- `pnpm build`：
- `pnpm verify:replace-ready`：
- `pnpm verify:replace-ready:with-db`：
- `pnpm verify:replace-ready:acceptance`：
- `pnpm verify:replace-ready:full`：
- `pnpm verify:replace-ready:doctor`：
- `pnpm proof:cutover-readiness`：
- `pnpm proof:cutover-preflight`：
- `pnpm verify:replace-ready:shadow:destructive:preflight`：

## 环境确认

- shadow URL：
- 数据库目标：
- GM 凭据来源：
- 是否核对 `start-next.sh` / 默认入口：
- 是否核对维护窗口状态：

## 切换中观察

### 只读面

- `/health`：
- `gm/maps`：
- `gm/editor-catalog`：
- `gm/maps/:mapId/runtime`：
- `gm/database/state`：

### 玩家主链

- 登录：
- 进入世界：
- 地图移动：
- 基本交互：
- 详情/任务/邮件/市场：
- 断线重连：

### GM 面

- `gm-next`：
- `gm/database/state`：
- 其他：

## 切换后 30-60 分钟观察

- 是否发现 legacy 回退迹象：
- 是否发现 next socket 异常事件：
- 是否发现数据库阶段异常：
- 是否发现 GM 只读面异常：
- 其他异常：

## destructive / 备份恢复

- 是否执行 destructive：
- `SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1`：
- destructive preflight 结果：
- backup 结果：
- download 结果：
- restore 结果：
- checkpoint / sourceBackupId / appliedAt：

## 结论

- 是否成功：
- 是否回滚：
- 首个异常时间：
- 首个异常症状：
- 处理动作：
- 后续跟进：
