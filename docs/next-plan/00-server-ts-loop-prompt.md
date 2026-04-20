# server 全面 TS 化 loop 指令

```md
# 目标

把 `packages/server` 渐进式全面迁移为 TypeScript 源码，最终目标是：

1. `packages/server/src` 下业务真源不再依赖手写 `.js` 源文件
2. 保持当前 next 主链行为、协议、持久化、GM/admin、shadow/replace-ready 验证口径不变
3. 不通过长期保留 `同名 .js + .ts` 双份真源来“假装完成迁移”
4. 每轮都能继续编译并通过与改动面匹配的最小验证

---

# 工作范围

默认只处理：

- `packages/server/src/**`
- 必要时联动：
  - `packages/shared/src/**`
  - `docs/next-plan/main.md`
  - `docs/next-plan/06-server-mainline-refactor.md`
  - 与验证直接相关的 `scripts/**`

默认不处理：

- `legacy/**`
- `packages/client/**`
- `packages/server/dist/**`

---

# 迁移原则

1. 不是“换扩展名”就算完成，必须把导入、类型、编译和验证一起收好
2. 默认按**职责成组**迁移，不按随机文件数平均切
3. 优先迁移 next 主链高价值源文件：
   - `config`
   - `http/next`
   - `network`
   - `runtime`
   - `tools`
4. 迁移后优先使用 ES import/export 和 TS 类型，不保留 CommonJS 风格残余，除非外部约束必须
5. 不为了 TS 化顺手改玩法、协议语义、UI 行为、GM 能力
6. 不新开 bridge，不制造长期 `.js -> .ts` 双路径
7. 可以临时为了过渡保留极少量兼容壳，但本轮要说明它们为什么还没删

---

# 单轮执行流程

每一轮严格按下面顺序执行：

1. 先读：
   - `AGENTS.md`
   - `docs/next-plan/main.md`
   - 本文件
2. 用下面命令盘点当前剩余 JS 真源：
   - `rg --files packages/server/src | rg '\\.js$'`
3. 选一组**同职责、同链路**的 `.js` 文件作为本轮目标，尽量一轮多做，但不要跨太多不相干区域
4. 先把这组文件迁成 `.ts`
5. 修正所有受影响的导入、类型、脚本和编译配置
6. 跑与改动面匹配的最小验证
7. 更新文档中的当前结论与剩余范围
8. 然后继续下一批，直到出现真实阻塞

---

# 每轮必须做的事

## A. 盘点

每轮先输出：

- 当前剩余 `.js` 文件总数
- 本轮准备迁移的文件清单
- 为什么这批适合成组迁移

## B. 迁移

迁移时必须：

- 用 `apply_patch` 修改文件
- 保持 TypeScript strict 兼容
- 保证 `tsconfig`、导入路径、运行入口和 smoke 不被破坏
- 如果 `.js` 改成 `.ts` 后需要同步改引用，必须同轮一起改完

## C. 验证

每轮至少跑：

- `pnpm --filter @mud/server-next compile`

按改动面补：

- `pnpm --filter @mud/server-next smoke:runtime`
- `pnpm --filter @mud/server-next smoke:gm-next`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm verify:replace-ready`
- `pnpm verify:replace-ready:with-db`

能少跑就按改动面少跑，但不能不验证。

## D. 文档

如果本轮实质推进了 TS 迁移，要同步更新：

- `docs/next-plan/main.md`
- 必要时 `docs/next-plan/06-server-mainline-refactor.md`

至少写清：

- 当前还剩多少 `.js` 真源
- 本轮迁了哪一簇
- 是否还有必须暂留的 `.js`

---

# 停止条件

只有在下面情况之一出现时才停止：

1. 本轮目标批次已经完成，且验证、文档同步完成
2. 遇到真实阻塞：
   - 编译配置阻塞
   - 某第三方包只接受 `.js`
   - 必须人工决定的导入/模块边界冲突
3. 用户已有脏改与本轮迁移直接冲突，无法安全兼容

不要因为“这一轮已经改了不少”就提前停在半状态。

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
- 明确写出：
  - 本轮迁了哪些 `.js -> .ts`
  - 还剩哪些 `.js`
  - 哪些验证通过
  - 哪些因环境没跑
```
