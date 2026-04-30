# server 验证与运维运行手册

这份文件是 `packages/server` 的包内运维入口。

当前目录主线是 `packages/server`。根级 `verify:release*` 是当前验证命令族；旧阶段的 `replace-ready` 命令入口已经退役，不代表项目仍处在替换或切换阶段。

## 快速入口

- 快速反馈：`pnpm verify:quick`
- 提交前标准门禁：`pnpm verify:standard`
- 发布前组合门禁：`pnpm verify:release`
- 本地：`pnpm verify:release:local`
- 本地 shadow reset：`bash ./scripts/shadow-local-reset.sh`
- 本地 shadow 启动：`bash ./scripts/shadow-local-up.sh`
- 本地 shadow 状态：`bash ./scripts/shadow-local-status.sh`
- 本地 shadow 只读验证：`bash ./scripts/shadow-local-verify.sh`
- 本地 shadow acceptance：`bash ./scripts/shadow-local-acceptance.sh`
- 本地 shadow full：`bash ./scripts/shadow-local-full.sh`
- 本地 shadow 常用全链：`bash ./scripts/shadow-local-all.sh`
- 本地 shadow 维护态开启：`bash ./scripts/shadow-local-maintenance-on.sh`
- 本地 shadow destructive preflight：`bash ./scripts/shadow-local-destructive-preflight.sh`
- 本地 shadow destructive 全链：`bash ./scripts/shadow-local-destructive.sh`
- 本地 shadow 维护态关闭：`bash ./scripts/shadow-local-maintenance-off.sh`
- 本地 shadow 停止：`bash ./scripts/shadow-local-down.sh`
- 最小带库 proof：`pnpm verify:release:proof:with-db`
- 带库闭环：`pnpm verify:release:with-db`
- shadow：`pnpm verify:release:shadow`
- 维护窗口 destructive preflight：`pnpm verify:release:shadow:destructive:preflight`
- 增强验收：`pnpm verify:release:acceptance`
- 最严格自动化链：`pnpm verify:release:full`
- 维护窗口 destructive proof：`pnpm verify:release:shadow:destructive`

## 说明

- 当前运行手册服务于 shadow / release 验证线，不是独立的正式部署手册。
- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读。
- `quick / standard / release` 是执行便利入口，不替代五层 gate 的证明边界。
- 当前文档只使用 `verify:release*`；旧阶段自动切换入口已移除。
- 本地 shadow `.sh` 会自动加载本地 env；只有显式切远程 target 时，才需要手工覆盖 URL/密码。
- destructive proof 必须在维护窗口里执行，不能用历史通过记录替代本轮证据。
