# 前端重构文档来源索引

这份文档用于说明 `docs/frontend-refactor/` 里的内容分别从哪里抽出，避免后续再次把前端信息散回零散文档里。

## 1. 代码来源

### 样式结构

来自：

- `packages/client/src/main.ts`
- `packages/client/src/styles/*.css`

主要抽到了：

- `architecture.md`
- `style-system.md`
- `module-inventory.md`

### UI 与面板模块

来自：

- `packages/client/src/ui/`
- `packages/client/src/ui/panels/`
- `packages/client/src/ui/panel-system/`
- `packages/client/src/constants/ui/`

主要抽到了：

- `architecture.md`
- `module-inventory.md`
- `panel-status.md`

### patch-first / 整块重建状态

来自对这些模式的检索：

- `patchList`
- `patchBody`
- `ensureShell`
- `syncDynamic`
- `preserveSelection`
- `innerHTML`
- `replaceChildren`

主要抽到了：

- `panel-status.md`
- `current-state.md`
- `verification.md`

## 2. 文档来源

### `docs/next-plan/main.md`

主要抽出了前端相关部分：

- `packages/client` 当前定位
- 前台剩余短板
- 正式替换旧前台前的前端判断
- replace-ready 与 `build:client` 的关系

对应输出：

- `current-state.md`
- `verification.md`

### 早期前端同步问题排查记录

主要抽出了：

- 前端高频同步边界
- 多源写状态问题
- `WorldDelta / SelfDelta / renderer` 职责边界

对应输出：

- `sync-pitfalls.md`

### `docs/next-in-place-hard-cut-plan.md`

主要抽出了：

- `packages/client` 作为当前主线前端的定位
- 为什么不再继续扩张旧前端 compat

对应输出：

- `architecture.md`
- `current-state.md`

### `docs/server-operations.md`

主要抽出了：

- 前端和 `replace-ready` 的关系
- 前端验证应如何表述，不夸大成完整替换证明

对应输出：

- `verification.md`

## 3. 当前文档集职责边界

`docs/frontend-refactor/` 现在负责：

- 前端结构
- 前端样式分层
- 前端模块清单
- 前端当前状态
- 前端同步陷阱
- 前端验证方式
- 前端后续待办

它不负责：

- `packages/server` 认证 / bootstrap 真源细节
- `packages/shared` 协议合同全量定义
- GM/admin/backup/restore 运维细节
- 旧前端 `legacy/client` 的运行细节

命令口径补充：

- 前端构建主入口统一按 `pnpm build:client` 记录
- `pnpm build:client-next` 若被提及，只应标注为兼容别名
