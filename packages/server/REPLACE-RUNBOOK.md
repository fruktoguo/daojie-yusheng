# server-next 替换运行手册

这份文件已从长版运行手册收口为包内兼容入口。

说明：

- 当前目录主线是 `packages/server`
- `server-next` 主要保留为包名与兼容命令名
- 根级主入口现在是 `verify:replace-ready*`

当前 `server-next` 的 shadow 演练、环境变量矩阵、replace-ready 五层门禁、`gm/database/*` 演练步骤，统一看：

- [docs/server-next-operations.md](../../docs/server-next-operations.md)

快速入口：

- 本地：`pnpm verify:replace-ready`
- 最小带库 proof：`pnpm verify:replace-ready:proof:with-db`
- 带库闭环：`pnpm verify:replace-ready:with-db`
- shadow：`pnpm verify:replace-ready:shadow`
- 增强验收：`pnpm verify:replace-ready:acceptance`
- 最严格自动化链：`pnpm verify:replace-ready:full`
- 维护窗口 destructive proof：`pnpm verify:replace-ready:shadow:destructive`

说明：

- 当前运行手册只服务于 shadow / replace-ready 线，不等于正式生产切换手册。
- 旧后端正式流量、正式端口和正式部署链仍不以这份文档为准。
- `local / with-db / acceptance / full / shadow-destructive` 是五层不同门禁，不能混读。
- `verify:server-next*` 只保留为兼容别名。
