# next 原地硬切 loop 指令

```md
# 最终目标

原地硬切 next，只保留 `packages/client`、`packages/server`、`packages/shared` 作为唯一活跃主线。

完成以下事情：

1. 必要历史数据迁移到 next
2. 删除 compat / bridge / parity
3. 收口 client / server / shared 主链
4. 验证门禁以 next 主链为准
5. legacy 退化为归档和迁移来源，不再阻塞开发

---

# 停止条件

只有全部满足才停止：

1. `docs/next-plan/main.md` 和 `01-10` 任务文档全部完成，或明确删项并说明原因
2. `03-required-data-migration-checklist.md` 已补到字段级
3. `04-one-off-migration-script.md` 对应脚本已实际落地并可执行
4. 主要 compat / bridge / parity 已删除
5. `pnpm build` 通过
6. `pnpm verify:replace-ready` 通过
7. 能跑的更高一级门禁都已跑通；跑不了的必须明确是环境阻塞
8. 文档已更新到可以指导后续只按 next 开发
9. 工作区干净

允许提前停止的情况：

- 缺数据库 / shadow / secrets / 外部环境
- 出现必须人工拍板的方向冲突
- 遇到用户已有改动且无法安全自动合并

---

# 验收检查

每轮至少检查：

- `pnpm build`
- `pnpm verify:replace-ready`
- 环境允许时再跑：
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`

还要检查：

- `docs/next-plan/main.md` 与 `01-10` 子任务文档一致
- 新任务只落到 `docs/next-plan/`
- 已完成项打勾
- 协议、客户端、服务端三边一致
- 不存在“协议声明了但服务端没实现”的事件
- 所有“下次还在”的状态都明确正式真源、运行时副本、legacy 来源、转换规则

---

# 限制边界

1. 不新开第三套主线，只能在当前仓库原地推进
2. 不继续做 legacy parity，不再为 legacy 补新功能
3. 不把 Redis、内存态、前端缓存当正式迁移目标
4. 不把运行时可重算数据当必须迁移
5. 必须按 `docs/next-plan/01-10` 顺序推进
6. 不允许偷偷保留长期双路径
7. 每次实改后必须做最小验证
8. 不改 Git 历史，除非用户明确要求

---

# 相关上下文

优先参考：

- `docs/next-plan/README.md`
- `docs/next-plan/main.md`
- `docs/next-plan/01-freeze-legacy-and-boundaries.md`
- `docs/next-plan/02-pin-next-sources-and-protocol.md`
- `docs/next-plan/03-required-data-migration-checklist.md`
- `docs/next-plan/04-one-off-migration-script.md`
- `docs/next-plan/05-remove-compat-and-bridges.md`
- `docs/next-plan/06-server-mainline-refactor.md`
- `docs/next-plan/07-client-mainline-refactor.md`
- `docs/next-plan/08-shared-content-and-map-cleanup.md`
- `docs/next-plan/09-verification-and-acceptance.md`
- `docs/next-plan/10-legacy-archive-and-cutover.md`

补充参考：

- `docs/next-in-place-hard-cut-plan.md`
- `docs/next-system-module-api-inventory.md`
- `docs/next-gap-analysis.md`
- `docs/next-remaining-task-breakdown.md`
- `docs/next-remaining-execution-plan.md`
- `packages/server/TESTING.md`

优先关注代码：

- `packages/shared/src/protocol.ts`
- `packages/server/src/network/world.gateway.js`
- `packages/server/src/network/world-sync.service.js`
- `packages/server/src/network/world-projector.service.js`
- `packages/server/src/runtime/world/world-runtime.service.js`
- `packages/server/src/persistence/*`
- `packages/client/src/network/socket.ts`
- `packages/client/src/main.ts`
- `packages/client/src/ui/panels/*`

当前已知重点：

- 当前策略是原地硬切 next，不是继续兼容迁移
- `SaveAlchemyPreset` / `DeleteAlchemyPreset` 是当前已知协议空洞候选
- `03-required-data-migration-checklist.md` 还要继续补到字段级
- 迁移脚本必须是一次性的
- 所有“下次还在”的状态，正式真源默认必须是数据库

---

# 输出偏好

每轮输出固定 6 段：

1. `当前阶段`
2. `本轮完成`
3. `验证结果`
4. `文档更新`
5. `剩余关键项`
6. `是否继续`

要求：

- 全程中文
- 简洁
- 不写空话
- 不重复解释背景
- 只写让下一轮继续推进所需的信息
- 阻塞就直接写阻塞

---

# 执行策略

每轮必须：

1. 先读 `docs/next-plan/main.md`
2. 只做当前最前面未完成的编号任务
3. 当前任务太大时，只拆当前编号下的子项，不跳号
4. 完成后同步更新对应任务文档勾选状态
5. 每轮至少做一项真实改动，不允许空转
6. 若需要更细文档，优先补到 `docs/next-plan/`
7. 除非阻塞，否则持续推进
```
