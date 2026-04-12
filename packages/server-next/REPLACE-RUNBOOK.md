# server-next 替换运行手册

这份文件已从长版运行手册收口为包内兼容入口。

当前 `server-next` 的 shadow 演练、环境变量矩阵、replace-ready 四层门禁、`gm/database/*` 演练步骤，统一看：

- [docs/server-next-operations.md](/home/yuohira/mud-mmo/docs/server-next-operations.md)

快速入口：

- 本地：`pnpm verify:replace-ready`
- shadow：`pnpm verify:replace-ready:shadow`
- 增强验收：`pnpm verify:replace-ready:acceptance`
- 最严格自动化链：`pnpm verify:replace-ready:full`
- 维护窗口 destructive proof：`pnpm verify:replace-ready:shadow:destructive`

说明：

- 当前运行手册只服务于 shadow / replace-ready 线，不等于正式生产切换手册。
- 旧后端正式流量、正式端口和正式部署链仍不以这份文档为准。
