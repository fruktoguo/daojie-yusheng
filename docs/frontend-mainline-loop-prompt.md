# 前端主线对齐 Loop 提示词

下面这段提示词可以反复发送，用来持续推进 `main -> next` 的前端对齐工作。

```text
继续按照 docs/frontend-mainline-gap-audit.md 推进 main 到当前 next 的前端对齐工作。

本轮严格遵守以下规则：

1. 目标
- 逐个处理 docs/frontend-mainline-gap-audit.md 里的缺口。
- UI 结果以 main 分支为基线。
- 逻辑实现必须落在当前 next 架构，不照搬 main 的旧组织方式。

2. 范围
- 默认只处理 packages/client、packages/shared、packages/server 中与当前前端缺口直接相关的部分。
- 优先处理文档里标记为 P0 的模块。
- 如果某个 UI 缺口必须补协议、状态源或服务端配套，允许一并修改，但只改和当前缺口直接相关的最小闭环。

3. 工作方式
- 先对照 main 分支定位当前要补的具体差异，再动手。
- 一次只完成一个明确的小闭环，避免摊大饼。
- 直接实现，不要停留在给方案。
- 不要重复做已经完成的项；做之前先回看 docs/frontend-mainline-gap-audit.md 和当前代码。
- 不要为了追 UI 结果破坏 next 的状态源、增量同步、detail modal、socket-send 分层和 game-map/runtime 分层。

4. UI 与逻辑要求
- UI、文案、默认值、交互顺序优先对齐 main。
- 面板状态优先落在 main-*-state-source.ts。
- 发包优先走 network/socket-send-*.ts。
- 详情交互统一走 detailModalHost。
- 高频更新优先保持局部 patch，不要回退成整面板重建。
- 不要把服务端权威规则下沉到前端。

5. 验证要求
- 每轮至少执行与改动直接相关的最小验证。
- 默认优先跑：
  - pnpm --filter ./packages/client exec tsc --noEmit
  - 如果改了 shared：pnpm --filter ./packages/shared build
  - 如果改了 server 联动：pnpm --filter ./packages/server exec tsc -p tsconfig.json --noEmit
  - 如果改动较大：pnpm --filter ./packages/client build

6. 文档维护
- 每完成一个小闭环，就同步更新 docs/frontend-mainline-gap-audit.md。
- 更新内容至少包括：
  - 哪一项已经完成
  - 哪些点仍未完成
  - 当前优先级是否变化

7. 交付格式
- 先说这轮实际完成了什么。
- 再说验证结果。
- 最后说还剩什么，并直接继续指向 docs/frontend-mainline-gap-audit.md 里的下一个最合理目标。

8. 禁止事项
- 不要提交 git commit，除非我明确要求。
- 不要改无关文档。
- 不要扩展新玩法、新系统、新入口。
- 不要把 main 的旧大文件结构搬回 next。

现在直接开始：
- 先从 docs/frontend-mainline-gap-audit.md 里当前最合理的一个 P0 缺口入手；
- 自行选择一个最小可闭环任务完成；
- 完成后更新审计文档并汇报结果。
```

## 推荐用法

如果你想无脑连续推进，后面每次直接发一句：

```text
继续按 docs/frontend-mainline-loop-prompt.md 执行
```

或者直接把上面的完整提示词重复发给我也可以。
