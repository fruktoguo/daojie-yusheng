# server 替换运行手册

这份文件已从长版运行手册收口为包内兼容入口。

说明：

- 当前目录主线是 `packages/server`
- `server` 主要保留为包名与兼容命令名
- 根级主入口现在是 `verify:replace-ready*`

当前 `server` 的 shadow 演练、环境变量矩阵、replace-ready 五层门禁、`gm/database/*` 演练步骤，统一看：

- [docs/next-plan/10-cutover-execution-checklist.md](../../docs/next-plan/10-cutover-execution-checklist.md)
- [docs/next-plan/10-cutover-execution-log-template.md](../../docs/next-plan/10-cutover-execution-log-template.md)
- [docs/next-plan/10-cutover-step-by-step-runbook.md](../../docs/next-plan/10-cutover-step-by-step-runbook.md)

自动化辅助脚本：

- `scripts/cutover-auto-preflight.sh`
- `scripts/cutover-auto-postcheck.sh`
- `scripts/cutover-auto-all.sh`

快速入口：

- 本地：`pnpm verify:replace-ready`
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
- 切换前自动 gate：`bash ./scripts/cutover-auto-preflight.sh`
- 切换后机器只读检查：`bash ./scripts/cutover-auto-postcheck.sh`
- 切换前后自动链：`bash ./scripts/cutover-auto-all.sh`
- 最小带库 proof：`pnpm verify:replace-ready:proof:with-db`
- 带库闭环：`pnpm verify:replace-ready:with-db`
- shadow：`pnpm verify:replace-ready:shadow`
- 维护窗口 destructive preflight：`pnpm verify:replace-ready:shadow:destructive:preflight`
- 增强验收：`pnpm verify:replace-ready:acceptance`
- 最严格自动化链：`pnpm verify:replace-ready:full`
- 维护窗口 destructive proof：`pnpm verify:replace-ready:shadow:destructive`

说明：

- 当前运行手册只服务于 shadow / replace-ready 线，不等于正式生产切换手册。
- 旧后端正式流量、正式端口和正式部署链仍不以这份文档为准。
- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读。
- 当前只使用 `verify:replace-ready*`；旧兼容验证入口已移除。
- 本地 shadow `.sh` 会自动加载本地 env；只有显式切远程 target 时，才需要手工覆盖 URL/密码。
