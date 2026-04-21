# 前端重构文档

这组文档专门描述 `packages/client` 当前前端结构、已完成的 UI 公共化收口，以及后续需要继续压缩的方向。

## 文档列表

- `architecture.md`
  - 前端入口、样式层、UI 目录、面板系统与弹层系统的整体结构。
- `current-state.md`
  - 当前 `client-next` 的真实定位、已完成收口与剩余短板。
- `style-system.md`
  - 当前样式分层、公共层职责、业务层残留原因，以及后续继续减量的方法。
- `panel-status.md`
  - 各面板与主要弹层的 patch-first 状态、整刷情况和后续改造优先级。
- `sync-pitfalls.md`
  - 前端运行时同步陷阱，从高频动态链里抽出来的长期边界规则。
- `verification.md`
  - 前端重构后的验证口径、构建门槛与手工回归要求。
- `module-inventory.md`
  - 现有前端模块清单，按 styles / ui / panels / panel-system / constants 分组列出。
- `migration-backlog.md`
  - 下一阶段前端重构待办，按优先级给出收口路径。
- `source-index.md`
  - 说明本目录各文档分别从哪些现有 docs 和代码结构中抽出。

## 关联现有文档

前端这里不再保留独立历史归档文档，相关同步边界已经收口到本目录文档里：

- `./sync-pitfalls.md`
- `../next-legacy-boundary-audit.md`
- `../next-plan/10-legacy-archive-and-cutover.md`

## 当前范围

本目录只覆盖 `client-next` 前端，不覆盖：

- `legacy/client` 旧前端
- `server-next` 运行时与协议设计
- `shared-next` 类型与协议合同
