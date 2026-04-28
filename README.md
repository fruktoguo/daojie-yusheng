# 道劫余生 next 主线入口

这个仓库当前只服务于 `next` 主线。

重点是 `packages/client`、`packages/shared`、`packages/server`、`packages/config-editor` 这条主线的运行、验证、cutover 和后续维护。

说明：

- 目录主线已经统一到 `packages/*`
- `legacy/*` 已从工作树移除
- 正式版行为差异默认对照 `main` 分支下同名 `packages/*`；需要静态参考时再看 `参考/main-packages-ref`
- 包名仍保留历史名：`@mud/client`、`@mud/shared`、`@mud/server`
- 这些历史名不再代表目录上还有双线主链

## 核心目录

```text
packages/
  client/          当前前端主线
  shared/          当前协议与共享类型主线
  server/          当前服务端与 replace-ready / shadow 验证主线
  config-editor/   当前配置编辑器主线
docs/              当前计划、设计、审计与运维说明
scripts/           当前 proof、生成、cutover 与辅助脚本
参考/              外部参考与一次性输入，不是默认开发主线
```

## 常用命令

```bash
pnpm dev:client
pnpm dev:server
pnpm build:client
pnpm build
pnpm verify:replace-ready:doctor
pnpm verify:replace-ready
pnpm verify:replace-ready:with-db
pnpm verify:replace-ready:shadow
pnpm verify:replace-ready:acceptance
pnpm verify:replace-ready:full
./start.sh
```

当前主验证入口是 `verify:replace-ready*`。

对照正式版补差时，默认先看：

```bash
pnpm diff:main:stat
pnpm diff:main:client
pnpm diff:main:shared
pnpm diff:main:server
```

## 文档入口

当前状态与计划：

- [docs/next-plan/main.md](./docs/next-plan/main.md)
- [docs/next-plan/09-verification-and-acceptance.md](./docs/next-plan/09-verification-and-acceptance.md)

cutover 与运维：

- [docs/next-plan/10-cutover-execution-checklist.md](./docs/next-plan/10-cutover-execution-checklist.md)
- [docs/next-plan/10-cutover-step-by-step-runbook.md](./docs/next-plan/10-cutover-step-by-step-runbook.md)
- [docs/next-plan/10-cutover-execution-log-template.md](./docs/next-plan/10-cutover-execution-log-template.md)
- [packages/server/REPLACE-RUNBOOK.md](./packages/server/REPLACE-RUNBOOK.md)

审计与内容：

- [docs/protocol-audit.md](./docs/protocol-audit.md)
- [docs/tutorial-mechanics.md](./docs/tutorial-mechanics.md)

## 当前口径

- 根级主验证入口是 `verify:replace-ready*`
- 根级 proof 主入口是 `proof:*`
- `./start.sh` 是默认且唯一的本地启动脚本
- 根级 `docker-compose.yml` 是默认本地 full-stack 入口
- 旧兼容启动入口、legacy compose、archive legacy 脚本和迁移期暂存目录已移除
- 真实切换仍以 cutover 执行记录为准，不能把自动 gate 和人工观察混读
