# next 原地硬切 loop 指令

```md
# 目标

把仓库收口到 next 单主线，只保留：

- `packages/client`
- `packages/server`
- `packages/shared`

当前 hard cut 的完成标准是：

1. next 真源、协议真源、运行时主链已经固定
2. 必要 legacy 数据可稳定迁到 next 真源
3. compat / bridge / parity 退到可接受范围
4. server / shared 主链达到可继续开发、可替换旧实现
5. client 当前只要求完成 next 协议对接、Socket 单线消费和必要状态桥接
6. 验证门禁以 next 主链为准
7. legacy 退化为归档、规则参考和迁移来源

---

# 当前阶段口径

执行时始终以 `docs/next-plan/main.md` 为总索引，以 `01-10` 子文档为落地清单。

当前默认优先级：

1. `06 服务端主链收口`
2. `08 shared 与内容地图收口`
3. `09 验证门禁与验收`
4. `10 legacy 归档与最终切换`
5. `07 客户端主链收口`

客户端当前补充口径：

- 只要求协议接线、`socket.ts` 唯一消费主链、必要状态桥接
- UI 视觉、交互细修、patch-first 深化、浅色/深色/手机适配都不作为当前 hard cut 阻塞项

---

# 必须遵守

1. 不新开第三套主线，只在当前仓库原地推进
2. 不为了 legacy parity 新增功能
3. 不把 Redis、内存态、前端缓存当正式迁移真源
4. 不把运行期可重建数据当必须迁移项
5. 不偷偷保留长期双路径
6. 不改 Git 历史
7. 不默认执行 `git commit` / `git push`，除非用户明确要求
8. 默认兼容工作区已有脏改，不要求“工作区干净”才算完成
9. 每次实改后必须做与改动面匹配的最小验证
10. 文档口径必须和实际代码状态一致

---

# 单轮执行流程

每一轮都按下面顺序执行：

1. 先读 `docs/next-plan/main.md`
2. 确认当前最靠前、且仍未完成的阻塞项
3. 只处理该阶段下能真正推进的一批子项，不空转，不跳去做无关新活
4. 优先处理可并行但彼此不冲突的子项；不要为了“单刀提交”强行拆碎工作
5. 完成代码或文档改动后，补对应验证
6. 同步更新对应任务文档勾选状态、当前结论和阻塞说明
7. 如果遇到环境阻塞、方向冲突或用户已有改动直接冲突，再停止并明确写出原因

---

# 验证口径

默认不要机械每轮全跑所有门禁，而是按改动面选择。

基础验证：

- `pnpm build`
- `pnpm verify:replace-ready`

按改动面补充：

- 协议 / 发包 / bootstrap / sync：
  - `pnpm --filter @mud/server-next audit:next-protocol`
- compat / legacy 边界收缩：
  - `pnpm --filter @mud/server-next audit:legacy-boundaries`
- auth / snapshot / identity / 持久化主链：
  - `pnpm verify:replace-ready:proof:with-db`
  - 必要时 `pnpm verify:replace-ready:with-db`
- GM / admin / database：
  - `pnpm --filter @mud/server-next smoke:gm-next`
  - 必要时 `pnpm --filter @mud/server-next smoke:gm-database`
- runtime / combat / loot / monster / respawn：
  - `pnpm --filter @mud/server-next smoke:runtime`
  - 按需补 `smoke:combat` / `smoke:loot` / `smoke:monster-*` / `smoke:player-respawn`
- client 协议接线：
  - `pnpm --filter @mud/client-next build`

更高门禁：

- 环境就绪时再跑：
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`
- 跑不了就明确写成环境阻塞，不冒充已完成

---

# 文档要求

每轮都要检查：

- `docs/next-plan/main.md` 与对应子任务文档是否一致
- 已完成项是否已勾选
- 当前阻塞是否写清
- 完成定义是否仍符合当前阶段口径

如果发现旧口径已经失真，要直接改文档，不保留过时要求。

---

# 重点关注文件

优先文档：

- `docs/next-plan/main.md`
- `docs/next-plan/06-server-mainline-refactor.md`
- `docs/next-plan/07-client-mainline-refactor.md`
- `docs/next-plan/08-shared-content-and-map-cleanup.md`
- `docs/next-plan/09-verification-and-acceptance.md`
- `docs/next-plan/10-legacy-archive-and-cutover.md`

优先代码：

- `packages/shared/src/protocol.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/network-protobuf.ts`
- `packages/server/src/network/world.gateway.ts`
- `packages/server/src/network/world-sync.service.ts`
- `packages/server/src/network/world-projector.service.ts`
- `packages/server/src/runtime/world/world-runtime.service.ts`
- `packages/client/src/network/socket.ts`
- `packages/client/src/main.ts`

---

# 停止条件

只有在下面情况之一出现时才停止当前循环：

1. 当前轮目标已经完成，并且文档、验证都已同步
2. 明确遇到环境阻塞：
   - 缺数据库
   - 缺 shadow URL
   - 缺 GM 密码
   - 缺其它 secrets / 外部环境
   能解决就自己解决,尽量不要卡住
3. 出现必须人工拍板的方向冲突
4. 遇到用户已有改动且无法安全兼容

不要因为“还没全做完”就卡在原地，也不要因为“做了一点”就提前宣布 hard cut 完成。

---

# 输出格式

每轮输出固定 6 段：

1. `当前阶段`
2. `本轮完成`
3. `验证结果`
4. `文档更新`
5. `剩余关键项`
6. `是否继续`

要求：

- 全程中文
- 简洁直接
- 不重复背景
- 不写空话
- 阻塞就直接写阻塞
- 明确区分：
  - 代码已完成
  - 文档已同步
  - 验证已通过
  - 因环境未跑
```
