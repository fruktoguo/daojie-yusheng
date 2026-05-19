# 配置编辑器 UI 重构计划

> 解决问题：将配置编辑器从原生 DOM 操作重写为 React + Tailwind v4，复刻 New API v1 控制台外观，支持主题/密度/圆角切换，保持 GmMapEditor 兼容。

## 目标

| 维度 | 目标 |
|------|------|
| 视觉 | 复刻 New API v1 控制台默认外观（亮色黑白灰，暗色深灰） |
| 主题 | 亮/暗/8预设/5圆角/3密度/2内容宽度/3 sidebar variant |
| 布局 | 桌面 sidebar + inset；移动 Sheet + 单列 |
| 兼容 | `GmMapEditor` 19 个 DOM ID 不变，`local-api.cjs` 15 个端点不变 |
| 工程 | TS 严格，无 `@ts-nocheck`，全部 import/export |

## 技术栈

React 19 + Tailwind v4 + Radix UI (headless) + Lucide + cva + clsx + sonner

不引入：TanStack Table / Router / next-themes / Recharts

## 约束

- 不改 `local-api.cjs`、`GmMapEditor`、`packages/server`、`packages/shared`
- 不改 `monsterRealmBaselines` 导入路径
- 所有组件禁止 `@ts-nocheck/@ts-ignore/@ts-expect-error`

## 实施阶段

### Phase 0：脚手架
- [ ] package.json 新增依赖（React/Tailwind/Radix/Lucide/cva/clsx/sonner）
- [ ] vite.config.ts 加入 `@vitejs/plugin-react` + `@tailwindcss/vite`
- [ ] `src/styles/index.css` + `tokens.css`：全部 token + 亮/暗 + 8 预设
- [ ] `src/lib/cn.ts` + `src/lib/api.ts` + `src/types/api.ts`
- [ ] 验收：`pnpm --filter @mud/config-editor build` 通过

### Phase 1：壳层 + 主题抽屉
- [ ] 15 个基础组件（Button/Card/Input/Table/Select/Tabs/Sheet/Dialog/Toast/Skeleton...）
- [ ] AppShell/AppHeader/AppSidebar/SidebarInset/SidebarProvider
- [ ] ThemeProvider + ConfigDrawer（7 个开关 + localStorage 持久化）
- [ ] HashRouter + 5 个空 Page
- [ ] ServiceStatusPill 接 `/api/server/status`

### Phase 2：5 页业务迁移（按顺序）
- [ ] 2.1 服务控制（StatCard + Dialog）
- [ ] 2.2 配置文件（JSON Textarea + 保存校验）
- [ ] 2.3 怪物模板（Tabs + 复杂表单 + 预览）
- [ ] 2.4 功法技能（嵌套 Select + 修饰行 Table）
- [ ] 2.5 地图编辑（GmMapEditor DOM 兼容 + canvas 自适应）

### Phase 3：清理与回归
- [ ] 删除 `index.legacy.html` 与原 `src/main.ts`
- [ ] `tsc --noEmit` + `build` 通过
- [ ] 产物体积统计

### Phase 4：可选增强（不阻塞主交付）
- [ ] CodeMirror 6 接入 JSON 编辑
- [ ] 列表虚拟化（>80 条）
- [ ] 命令面板 ⌘K
- [ ] 暗色截图回归脚本

## GmMapEditor 兼容策略

- React 渲染 19 个 ID 节点的容器骨架
- `useLayoutEffect` 保证 DOM 先挂载
- `useEffect` 内 `new GmMapEditor(...)`
- React 永远不重渲染 GmMapEditor 占用的子树
- 路由离开时 `display: none` 保持实例存活

## 文件结构

```
packages/config-editor/src/
├── main.tsx
├── styles/{index.css, tokens.css}
├── lib/{cn.ts, api.ts, format.ts}
├── ui/  (15 个基础组件)
├── app/{theme/, shell/, header/, router/, status/}
├── pages/{maps/, monsters/, techniques/, files/, service/}
├── store/{theme-store.ts, monster-store.ts, ...}
└── types/api.ts
```

## 验证

| 验证 | 命令 |
|------|------|
| TS 严格 | `pnpm --filter @mud/config-editor exec tsc -p tsconfig.json` |
| 构建 | `pnpm --filter @mud/config-editor build` |
| 边界审计 | `pnpm audit:boundaries` |
| 人工 smoke | 5 页交互链路（列表/搜索/选中/改字段/保存/重新读取） |
| 视觉 smoke | 1280x800 + 375x812 × 浅/暗 × default + forest-whisper |
