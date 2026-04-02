---
name: server-next-verify
description: Use this skill when verifying packages/server-next changes in this repo, including smoke tests, with-db verification, replace-ready acceptance, shadow verification, GM database backup or restore checks, and next protocol audit runs.
---

# server-next 验证

这个 skill 只负责 `packages/server-next` 的验证与替换验收。

适用场景：

- 用户要求验证 `server-next`
- 跑 smoke、with-db、shadow、replace-ready
- 回归 GM database backup / restore
- 做 next 协议审计

常用参考：

- `packages/server-next/TESTING.md`
- `packages/server-next/REPLACE-RUNBOOK.md`
- `docs/next-protocol-audit.md`

## 选入口规则

### 1. 默认单一入口

优先：

```bash
pnpm verify:server-next
```

它会按环境自动选择：

- 无库：`verify:replace-ready`
- 有库：`verify:replace-ready:with-db`

### 2. 只验证 server-next 自身编译

当共享包脏改动阻塞 workspace 编译时，可退回：

```bash
node node_modules/.pnpm/node_modules/typescript/bin/tsc -p packages/server-next/tsconfig.json
```

### 3. 带库闭环

涉及持久化、GM database、restore 时，优先补跑：

```bash
pnpm verify:server-next:with-db
pnpm --filter @mud/server-next smoke:gm-database
```

### 4. 已部署实例 shadow 验证

针对 `11923` 或指定 shadow 地址：

```bash
pnpm verify:server-next:shadow
```

### 5. 协议审计

当任务涉及 next socket 协议覆盖或流量回归时，执行：

```bash
pnpm audit:server-next-protocol
```

## 强制流程

1. 先判断这次是无库、本地带库、还是 shadow 已部署实例。
2. 只跑与任务边界匹配的最小验证入口。
3. 涉及 `gm/database/restore` 时，明确维护态前置条件，不要跳过。
4. 如果没法执行某项验证，必须记录阻塞原因，不要假装通过。

## 交付时必须说明

- 跑的是哪条验证链路
- 是否带数据库
- 是否覆盖 GM database / shadow / 协议审计
- 未跑项与阻塞原因
