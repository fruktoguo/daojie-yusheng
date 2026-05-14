# 配置编辑器 UI 重构计划

> **目标**：把 `packages/config-editor` 当前的「单 `index.html` + 单 `main.ts` + 内联深色玻璃拟态」整页 UI，**完全重构**为遵循 `参考/UI设计参考/New-API-v1-设计规范.md` 的现代 SaaS 控制台 UI（Vercel/OpenAI 风格的 shadcn dashboard），同时保持 `local-api.cjs` 协议、`GmMapEditor` 的 DOM 边界、内容文件结构和保存语义完全不变。
>
> **范围限定**：仅作用于 `packages/config-editor`。`packages/client / packages/server / packages/shared / packages/server/data/content` 在本计划中只读不写；所有 5000 并发口径、生产真源、协议规范不受影响。

---

## 0. 结论摘要

- 视觉基调：从「深绿玻璃拟态 + 22px 圆角 + glow 阴影」**整体替换**为「黑白灰为主 + ring-1 描边 + 12-16px 内边距 + OKLCH token + 低对比但清晰」的 shadcn 控制台。
- 技术栈：在 config-editor 内**新增** React 19 + Tailwind CSS v4 + 少量 Radix 原语；保持 `@mud/shared` 链接和现有 Vite 入口；不污染 `packages/client`。
- 布局结构：用 `Header (h-12) + Sidebar (w-52, 可折叠 icon-only) + SidebarInset` 三段壳层替代当前 `topbar + tabbar + workspace` 三段堆叠。
- 页面组织：5 个原 tab 全部下沉为 sidebar 导航项；每页统一 `SectionPageLayout`（标题区 + 内容区 + 可选底部状态条）。
- 主题系统：完整复刻 token 三层（亮/暗/预设）+ 圆角档位 + 密度档位 + 内容宽度 + sidebar variant，写入 `<html>` data 属性，配置抽屉持久化到 `localStorage`。
- 兼容边界：`GmMapEditor` 的全部 DOM ID（`map-list / map-search / map-save / map-canvas / map-status-bar / map-tile-palette / map-inspector-content / map-json / ...`）由 React 树渲染同名节点继续支撑，类构造与外部 API 不变。
- 网络与持久化：`/api/maps | /api/monsters | /api/techniques | /api/config-files | /api/config-file | /api/editor-catalog | /api/server/status | /api/server/restart` 全部 8 类端点协议不变；保存/重启/刷新语义不变。
- 落地节奏：4 个阶段（脚手架 → 壳层 → 页面 → 收尾），每阶段独立可构建可回滚；老 `index.html + main.ts` 在阶段 4 才删除。

---

## 1. 当前现状

### 1.1 工程结构

```
packages/config-editor/
├── index.html              1478 行：内联 ~900 行 CSS + ~580 行 HTML
├── src/main.ts             2505 行：5 页全部直接操作 DOM
├── local-api.cjs           1345 行：Node 原生 http，挂 15 个 /api/*
├── start.sh                启动 shared watch + local-api + Vite
├── package.json            仅依赖 @mud/shared / vite / typescript
└── tsconfig.json           include: ["src", "../../packages/client/src/gm-map-editor.ts"]
```

### 1.2 现有 5 页

| Tab id | 中文名 | 主结构 | DOM 锚点（节选） |
|---|---|---|---|
| `maps` | 地图编辑 | 三栏 `170-210 / 1.1fr / 1fr` | `map-list / map-search / map-save / map-undo / map-reset / map-reload / map-center / map-zoom-* / map-editor-canvas / map-canvas-empty / map-status-bar / map-summary / map-tool-buttons / map-paint-layer-tabs / map-tile-palette / map-inspector-content / map-json / map-apply-json` |
| `monsters` | 怪物模板 | 二栏 `320 / 1fr`，右侧再分编辑/预览 | `monster-list / monster-search / monster-id / monster-name / monster-attrs-editor / monster-stat-percents-editor / monster-equipment-editor / monster-skills / monster-drops-editor / monster-resolved-attrs-preview / monster-computed-stats-preview / monster-status` |
| `skills` | 功法技能 | 二栏 `320 / 1fr` | `technique-list / technique-search / technique-skill-select / technique-effect-select / technique-skill-summary / technique-effect-summary / technique-effect-editor / technique-status` |
| `files` | 配置文件 | 二栏 `320 / 1fr` | `config-file-list / config-file-search / config-file-current-name / config-file-editor / config-file-status` |
| `service` | 服务控制 | 二栏卡片 | `service-running-value / service-running-meta / service-restart / service-refresh / service-mode / service-pid / service-last-restart-at / service-last-restart-reason` |

### 1.3 现状视觉问题

- 背景：`radial-gradient + linear-gradient` 玻璃拟态，明显违反规范第 2.2「不要做成什么样」。
- 圆角：`12 / 16 / 18px` 大圆角到处出现；规范要求 Card `rounded-xl` 单一档位、Button `rounded-lg`、Input `rounded-lg`。
- 强调色：`#75c18f`（修仙翠绿）作为唯一 accent；规范默认 primary 接近黑色（亮）/接近白色（暗），主题预设才上色。
- 边框：固定灰 `rgba(255,255,255,.12)`；规范要求暗色用 `oklch(1 0 0 / 9%)` 透明度边框。
- 高度：按钮 `padding 9-14px` 不固定，输入框无统一高度；规范要求 button h-8 / input h-8。
- 字体：`Noto Sans SC + PingFang SC + 微软雅黑` 列表；规范要求 `Public Sans` + 中文兜底。
- 状态：仅深色单主题，无浅色、无密度、无圆角、无主题预设、无侧栏 variant 切换。

### 1.4 现状交互问题

- 全程页面级 DOM 重建（如 `renderMonsterList()` 直接 `innerHTML = ...`），切换页签时滚动/选区/输入焦点都丢；规范要求"高频 UI 更新优先局部 patch"。
- 5 个 tab 集中在窄 tabbar，移动端无 sidebar 折叠；规范要求 desktop sidebar + mobile Sheet。
- 没有命令面板（⌘K）、没有快捷键、没有空态骨架屏、没有 toast、没有未保存草稿提示。
- 主题/字号/圆角不可调；保存/刷新动作的反馈混在一行 status-bar 文本里。
- 无浅/暗/移动 375 三态适配；canvas 在小屏直接溢出。

### 1.5 必须保留的契约

| 契约 | 出处 | 重构后约束 |
|---|---|---|
| 15 个 `/api/*` 端点请求/响应结构 | `local-api.cjs` 1190-1330 行 | **不变**，仅前端改 fetch 包装 |
| `GmMapEditor` 构造签名 + 19 个 DOM ID | `packages/client/src/gm-map-editor.ts` | **不变**，React 渲染同名节点 |
| `monsterRealmBaselines` 等 server data 直接 import | `src/main.ts` 顶部 | **不变**，仍然类型化 import |
| 保存怪物 → 同步更新地图模板引用 | `local-api.cjs` PUT `/api/monsters` | **不变**，前端只显示 `updatedMapCount` |
| 服务托管模式 / 自动重启 | `local-api.cjs` `/api/server/*` | **不变** |

---

## 2. 总体目标

| 维度 | 目标 | 验收口径 |
|---|---|---|
| 视觉 | 100% 复刻 New API v1 控制台默认外观 | 默认亮色为黑白灰，暗色非纯黑而是深灰，sidebar 比内容区更深一档；与规范第 21 节 9 项视觉验收清单逐条对齐 |
| 主题 | 亮 / 暗 / 8 预设 / 5 圆角档 / 3 密度档 / 2 内容宽度 / 3 sidebar variant | 配置抽屉每个开关切换后立即作用于 `<html>` data 属性，刷新页面后从 localStorage 恢复 |
| 布局 | 桌面 sidebar + inset 内容；移动 Sheet + 单列 | desktop ≥ 1024 三段壳，mobile 375 sidebar 折成 Sheet，内容单列堆叠 |
| 组件 | Button/Card/Table/Input/Select/Tabs/Sheet/Drawer/Toast/Skeleton/Pagination/Switch/Tooltip 全部按规范实现 | 任意按钮高度 32px，Card `rounded-xl ring-1 bg-card`，Input h-8，表格行 hover `bg-muted/50` |
| 页面 | 5 页全部按 SectionPageLayout 重写，复用规范统计卡片 / 数据卡片 / Form / Toolbar | 5 页交互链路与原版一一对应；地图页 canvas 嵌入 inset 内部不溢出 |
| 兼容 | `GmMapEditor` 不需修改 | `pnpm --filter @mud/config-editor build` 通过且地图编辑链路在浏览器人工 smoke 通过 |
| 工程 | TS 严格 + 无 `@ts-nocheck`/`@ts-ignore`/`@ts-expect-error` + 全部 import/export | `tsc -p` 通过，`grep -R "@ts-(nocheck|ignore|expect-error)" packages/config-editor/src` 为空 |

---

## 3. 技术栈选型

### 3.1 引入清单

| 包 | 版本基线 | 用途 | 备注 |
|---|---|---|---|
| `react` | `^19.2.0`（与 `packages/client` 对齐） | 渲染 | dependency |
| `react-dom` | `^19.2.0` | 挂载 | dependency |
| `@types/react` / `@types/react-dom` | `^19.2.x` | TS | devDependency |
| `tailwindcss` | `^4.0.0` | 工具类 + 主题 | devDependency；用 v4 而非 v3，规范严格基于 v4 `@theme inline` 语法 |
| `@tailwindcss/vite` | `^4.0.0` | Vite 插件 | devDependency |
| `tw-animate-css` | `^1.x` | 动画工具类 | devDependency |
| `@fontsource-variable/public-sans` | `^5.x` | 字体 | dependency |
| `clsx` | `^2.x` | 类名拼接 | dependency |
| `class-variance-authority` | `^0.7.x` | variant | dependency |
| `tailwind-merge` | `^2.x` | className 合并去重 | dependency |
| `lucide-react` | `^0.4xx` | 图标 | dependency |
| `@radix-ui/react-dialog` | `^1.x` | Sheet / Drawer / Modal 头无障碍 | dependency |
| `@radix-ui/react-tabs` | `^1.x` | 地图编辑 inspector 三 tab | dependency |
| `@radix-ui/react-select` | `^2.x` | 表单下拉 | dependency |
| `@radix-ui/react-tooltip` | `^1.x` | hover 提示 | dependency |
| `@radix-ui/react-switch` | `^1.x` | 主题/密度切换 | dependency |
| `sonner` | `^1.x` | toast | dependency |

> 不引入：TanStack Table（页面无超大表格，自建即可）/ Recharts / VChart（无图表需求）/ next-themes（自写 ThemeProvider）/ TanStack Router（保留多 tab/sidebar 路由用 URL hash 即可，避免引入路由库）。

### 3.2 原则

- 这是离线本地工具，引入 React + Tailwind 不影响生产 5000 并发口径，也不进入 `packages/client` bundle。
- 不抄 shadcn 源码：参考其 API 形态，按规范第 8-15 节用 cva 自实现 `Button / Card / Table / Input / Select / Tabs / Sheet / Drawer / Toast / Skeleton`。
- 所有组件挂 `data-slot="..."`，与规范第 9.1 / 10 / 11 节保持一致，便于全局样式选择器命中。
- 使用 Radix 仅取 headless 行为（focus trap、Esc 关闭、portal、ARIA），样式 100% 自写。

---

## 4. 设计 Token 系统

### 4.1 落地位置

新建 `packages/config-editor/src/styles/index.css`，作为唯一 CSS 入口；`main.tsx` 顶部 import。

### 4.2 三层 token

第一层：**语义变量**（亮/暗），与规范第 3.2 / 3.3 完全一致，包含 `--background / --foreground / --card / --popover / --primary / --secondary / --muted / --accent / --destructive / --success / --warning / --info / --neutral / --border / --input / --ring / --chart-1~5 / --sidebar* / --skeleton-*`，全部用 OKLCH。

第二层：**Tailwind 映射**，按规范第 3.4 在 `@theme inline { ... }` 内把语义变量映射到 `--color-*` 与 `--radius-*`。

第三层：**主题预设**，按规范第 4.3 用 `[data-theme-preset]:not([data-theme-preset='default'])` 让 card / popover / muted / accent / border / input / sidebar 都被 primary `color-mix` 染色。

### 4.3 默认调色

- 默认亮色：纯黑白灰（规范第 3.2 原值），不再使用任何修仙绿。
- 默认暗色：深灰（规范第 3.3 原值）。
- 主题预设：完整保留规范第 4.1 的 8 个（default / underground / rose-garden / lake-view / sunset-glow / forest-whisper / ocean-breeze / lavender-dream），其中 `forest-whisper` 作为「修仙绿」入口供老用户选用，**默认仍为 default**。

### 4.4 字体

```css
:root {
  --font-sans: 'Public Sans Variable', 'Inter', -apple-system, BlinkMacSystemFont,
    'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
body { font-family: var(--font-sans); font-feature-settings: 'cv11', 'ss01'; }
.tabular { font-variant-numeric: tabular-nums; }
```

### 4.5 半径与密度

| 维度 | data 属性 | 取值 |
|---|---|---|
| 圆角 | `[data-theme-radius]` | `none / sm / md / lg / xl`，`--radius` 映射 `0 / 0.3 / 0.5 / 0.75 / 1rem` |
| 密度 | `[data-theme-scale]` | `sm / md / lg`，作用于 `--text-*` 与 `--spacing` |
| 内容宽度 | `[data-theme-content-layout]` | `default / centered`，`@media (min-width: 1280px)` 时 centered 限 `max-width: 1280px` |
| Sidebar variant | `[data-theme-sidebar]` | `sidebar / floating / inset`，规范第 6.3 |

### 4.6 验收

- DevTools 改 `<html data-theme-preset="rose-garden">` 后所有 card / sidebar / border 立即被玫红轻染。
- `:root` 与 `.dark` 切换时 `body` 不闪烁（同帧应用 transition）。
- 所有组件 className 仅用语义类（`bg-card / text-muted-foreground / border-border / ring-1`），不直接写 `gray-700` 等具体色阶。

---

## 5. 全局 Layout 壳层

### 5.1 骨架（与规范第 6.1 一致）

```tsx
<body data-theme-sidebar="inset" data-theme-content-layout="default">
  <ThemeProvider>
    <SidebarProvider className="flex-col">
      <AppHeader />                    {/* h-12 */}
      <div className="flex min-h-0 w-full flex-1">
        <AppSidebar />                 {/* 桌面 13rem，icon-only 2.75rem，移动 Sheet */}
        <SidebarInset>                 {/* 圆角 + 阴影 + 间距 inset */}
          <RouterOutlet />             {/* 5 个页面 */}
        </SidebarInset>
      </div>
      <Toaster />
    </SidebarProvider>
  </ThemeProvider>
</body>
```

### 5.2 Header

```tsx
<header className="sticky top-0 z-40 h-[var(--app-header-height,3rem)] w-full
  shrink-0 bg-transparent">
  <div className="flex h-full items-center gap-1.5 px-2 sm:gap-2 sm:px-3">
    <SidebarTrigger variant="ghost" className="size-8" />
    <SystemBrand />                     {/* 「道劫余生 · 配置编辑器」，inline 不再独占 18px */}
    <ServiceStatusPill />               {/* 替代旧 service-summary，实时显示托管/未托管/PID */}
    <div className="ms-auto flex items-center gap-1 sm:gap-2">
      <CommandSearchButton />           {/* ⌘K 占位，先做 UI 后做行为 */}
      <ThemeModeToggle />               {/* light / dark / system */}
      <ConfigDrawerTrigger />           {/* 调色板图标，max-md:hidden */}
    </div>
  </div>
</header>
```

### 5.3 Sidebar

| 项 | 图标（lucide） | 路由 hash |
|---|---|---|
| 地图编辑 | `Map` | `#/maps` |
| 怪物模板 | `Skull` | `#/monsters` |
| 功法技能 | `Sparkles` | `#/skills` |
| 配置文件 | `FileJson2` | `#/files` |
| 服务控制 | `ServerCog` | `#/service` |

底部固定区放：版本号 + 「打开本地 API 文档」链接 + 配置抽屉入口（移动端用）。

```tsx
<aside data-slot="sidebar" data-state="expanded" className="
  bg-sidebar text-sidebar-foreground border-sidebar-border
  border-r flex flex-col w-[var(--sidebar-width,13rem)]
  data-[state=collapsed]:w-[var(--sidebar-width-icon,2.75rem)]
  transition-[width] duration-200 ease-out">
  <SidebarBrand />
  <SidebarMenu>
    {NAV.map(item => (
      <SidebarItem key={item.id} active={current === item.id}
        icon={item.icon} label={item.label} href={item.href} />
    ))}
  </SidebarMenu>
  <SidebarFooter />
</aside>
```

Sidebar item 规则（规范第 6.3）：`h-8 text-sm p-2 rounded-md icon-1rem`，active = `bg-sidebar-accent font-medium`。

### 5.4 SidebarInset

```tsx
<main data-slot="sidebar-inset" className="
  bg-background relative flex w-full flex-1 flex-col
  md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0
  md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm">
  <Outlet />
</main>
```

### 5.5 路由

- 不引入 router 库，自写 `useHashRoute()` hook：监听 `hashchange`，把 `#/maps | #/monsters | #/skills | #/files | #/service` 映射到 5 个 `lazy()` 加载页面。
- 默认路由 `#/maps`。
- 状态保存到 sessionStorage，刷新后回到上一次页面。

---

## 6. SectionPageLayout 与页内规范

每页统一外壳（规范第 7.1）：

```tsx
<main data-slot="section-page" className="flex min-h-0 flex-1 flex-col overflow-hidden">
  <div className="shrink-0 px-3 pt-3 pb-2.5 sm:px-4 sm:pt-5 sm:pb-3">
    <Breadcrumb items={[...]} />
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:gap-x-4 sm:mt-3">
      <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">{title}</h2>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-x-4">
        {actions /* 主操作右上 */}
      </div>
    </div>
  </div>
  <div className="min-h-0 flex-1 overflow-auto px-3 pt-1 pb-3 sm:px-4 sm:pt-1.5 sm:pb-4 space-y-3 sm:space-y-4">
    {children}
  </div>
  <PageStatusBar />
</main>
```

页内 Card 规则：`bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden p-0`，Header 用 `px-4 py-3 border-b`，Content 用 `p-4`。

---

## 7. 复刻组件清单

`packages/config-editor/src/ui/` 自写以下组件（每个一个文件，全部 TS + 类型化 props，命名带 `data-slot`）：

### 7.1 基础

| 组件 | 文件 | 关键约束 |
|---|---|---|
| Button | `ui/Button.tsx` | cva variants `default / outline / secondary / ghost / destructive / link`；sizes `xs/sm/default/lg/icon-xs/icon-sm/icon/icon-lg`；规范第 8 节 |
| Card | `ui/Card.tsx` | 子组件 CardHeader / CardTitle / CardDescription / CardContent / CardFooter，规范第 9 节，`ring-1` 优先于 border |
| Input | `ui/Input.tsx` | h-8 + `rounded-lg` + `aria-invalid` 红圈，规范第 11 节 |
| Textarea | `ui/Textarea.tsx` | min-h-32，等宽字体仅 JSON 编辑器使用 |
| Label | `ui/Label.tsx` | `text-sm font-medium` |
| Select | `ui/Select.tsx` | 包 Radix Select + popover 样式 |
| Switch | `ui/Switch.tsx` | 包 Radix Switch |
| Tabs | `ui/Tabs.tsx` | 包 Radix Tabs，TabList = `inline-flex h-9 rounded-lg bg-muted p-1` |
| Tooltip | `ui/Tooltip.tsx` | 包 Radix Tooltip |
| Sheet | `ui/Sheet.tsx` | 包 Radix Dialog，侧滑面板 |
| Dialog | `ui/Dialog.tsx` | 居中弹窗 |
| Toast | `ui/Toast.tsx` | 转包 sonner，按规范色 |
| Skeleton | `ui/Skeleton.tsx` | 规范第 13 节 shimmer，`prefers-reduced-motion` 兜底 |
| Separator | `ui/Separator.tsx` | `border-border` |
| Badge | `ui/Badge.tsx` | 用 `bg-muted text-muted-foreground` 等 6 套 |

### 7.2 数据展示

| 组件 | 文件 | 用途 |
|---|---|---|
| Table | `ui/Table.tsx` | 规范第 10 节，含 `tableRowEnter` 动画与 `nth-child` stagger，全部用 `data-slot` |
| StatCard | `ui/StatCard.tsx` | 规范第 12.1 统计卡 |
| EmptyState | `ui/EmptyState.tsx` | icon + title + description + 主操作 |
| ScrollArea | `ui/ScrollArea.tsx` | 自写薄壳，统一滚动条样式（规范第 19 `scrollbar-width: thin`） |
| KbdHint | `ui/KbdHint.tsx` | `<kbd>` 风格 |

### 7.3 业务

| 组件 | 文件 | 用途 |
|---|---|---|
| AppShell / AppHeader / AppSidebar / SidebarInset / SidebarProvider | `app/shell/*` | 第 5 节壳层 |
| ConfigDrawer | `app/ConfigDrawer.tsx` | 规范第 15 节配置抽屉 |
| ThemeProvider | `app/theme/ThemeProvider.tsx` | 读写 `<html>` data 属性 + localStorage |
| BrowserRouter（hash 版） | `app/router/HashRouter.tsx` | 简化路由 |
| ServiceStatusPill | `app/header/ServiceStatusPill.tsx` | header 状态胶囊 |
| CommandSearchButton | `app/header/CommandSearchButton.tsx` | ⌘K 占位 |

> 注：每个组件都禁止使用 `// @ts-nocheck / @ts-ignore / @ts-expect-error`；所有 props 必须类型完整。

---

## 8. ConfigDrawer 规范

完整复刻规范第 15 节：

```
Sheet (right, max-w-md)
├─ SheetHeader → 「外观与布局」
├─ ScrollArea
│   ├─ Section "主题模式"      → light / dark / system （3 列）
│   ├─ Section "颜色预设"      → 8 色块（4 列），右上 CircleCheck
│   ├─ Section "圆角"          → none / sm / md / lg / xl （5 列）
│   ├─ Section "密度"          → 紧凑 / 标准 / 舒适 （3 列）
│   ├─ Section "侧栏样式"      → inset / floating / sidebar （3 列）
│   ├─ Section "内容宽度"      → 充满 / 居中（≤1280）
│   └─ Section "方向"          → LTR / RTL（首期可锁定 LTR）
└─ SheetFooter
    └─ Button variant="outline" → 「重置为默认」
```

选择卡片视觉（规范第 15.3）：

```tsx
<div className="ring-border relative h-12 rounded-md ring-[1px] transition
  group-data-checked:ring-primary group-data-checked:shadow-md
  group-focus-visible:ring-2 group-hover:ring-primary/60">
  <CircleCheck className="fill-primary absolute top-0 right-0 z-10 size-5
    translate-x-1/2 -translate-y-1/2 stroke-white group-data-unchecked:hidden" />
</div>
```

持久化键：`config-editor.theme.v1 = { mode, preset, radius, scale, sidebar, content, dir }`，写入 `localStorage`，刷新后立即恢复。

---

## 9. 各页面重构方案

### 9.1 地图编辑（最复杂）

桌面布局：

```
┌──────────────────────────────────────────────────────────────────┐
│ Title「地图编辑」   actions: [刷新目录]                          │
├───────────────┬───────────────────────────────┬──────────────────┤
│ Card 地图册   │ Card 画布                     │ Card 检视/JSON   │
│ - 搜索 input  │ - Toolbar (8 个 button)       │ - Tabs           │
│ - Tabs:       │ - canvas 居中                 │   ├ 概览与工具   │
│   主图/散图   │ - status-bar (h-6)            │   ├ 检视/拼图    │
│ - 列表（虚拟）│                                │   └ JSON         │
└───────────────┴───────────────────────────────┴──────────────────┘
```

兼容策略（关键）：

```tsx
// 在 React 树里渲染 GmMapEditor 期望的 ID 节点，类不需要改
<>
  <input id="map-search" data-slot="input" className="..." />
  <div id="map-list" data-slot="map-list" className="..." />
  <button id="map-save"   ...>保存</button>
  <button id="map-undo"   ...>撤销</button>
  <button id="map-reset"  ...>放弃修改</button>
  <button id="map-reload" ...>重新载入</button>
  <button id="map-center" ...>视角居中</button>
  <button id="map-zoom-out" ...>缩小</button>
  <button id="map-zoom-in"  ...>放大</button>
  <button id="map-refresh-list" ...>刷新</button>

  <div id="map-editor-host" data-slot="map-canvas-host" className="...">
    <canvas id="map-editor-canvas" />
    <div id="map-canvas-empty" data-slot="empty-hint">从左侧选择地图。</div>
  </div>

  <div id="map-status-bar" data-slot="status-bar" />

  <div id="map-editor-empty" />
  <div id="map-editor-panel" hidden>
    <div id="map-summary" />
    <div id="map-tool-buttons" />
    <div id="map-paint-layer-tabs" />
    <div id="map-tile-palette" />
    <div id="map-inspector-content" />
    <textarea id="map-json" />
    <button id="map-apply-json" />
  </div>
</>
```

- React 只**渲染容器骨架**，里面具体子节点继续由 `GmMapEditor` 自己生成；`GmMapEditor.constructor` 在挂载后用 `useEffect` 实例化一次，组件卸载时调用 `editor.dispose?.()`（如果未来添加）。
- `setAppStatus(message, isError)` 改为：在 React 侧暴露 `useAppStatus()`，把 message/isError 同时写入 `#app-status-bar` 文本与全局 toast。
- Canvas 大小：`map-editor-host` 用 `aspect-[4/3] w-full max-h-[60vh]`，里面 canvas 用 `w-full h-full` + ResizeObserver 重置内部尺寸；移动端单列时 inspector 折到画布下方。

#### 9.1.1 列表虚拟化

地图、怪物、功法的列表条目可能上百条。按规范第 10 节使用紧凑表格 + `tableRowEnter` 动画的同时，**列表超过 80 条**时切换为简单虚拟化（自写 `VirtualList` 或用 `react-virtuoso` ——首期不引入，先按全量渲染压到 80 条上限）。

### 9.2 怪物模板

桌面布局：

```
┌──────────────────────────────────────────────────────────────────┐
│ Title「怪物模板」  actions: [刷新列表] [保存] [重新读取]         │
├───────────────┬──────────────────────────────────────────────────┤
│ Card 模板目录 │ Tabs: [基础] [六维] [基础属性] [装备] [掉落]     │
│ - 搜索        │ Card 当前怪物 meta（id / 文件 / 影响地图数）     │
│ - 列表        │ Card 表单（按 tab 切换）                         │
│               │ Card 「实际数值预览」 right-aligned panel        │
└───────────────┴──────────────────────────────────────────────────┘
```

- 把现有「左编辑 / 右预览」二栏从「整页双 column」改为：单页 + 顶部 Tabs，预览始终在右侧 `lg:sticky top-4` 卡片中显示，移动端折到底部。
- 表单字段类型：`Form / FormField / FormControl / FormDescription / FormMessage` 自写包装，复用 `Input / Select`。
- 数值预览：StatCard grid（3 列）+ Table（六维实际值、`numericStats` 完整面板），表格行渐入动画启用。
- 「未保存修改」检测：表单 onChange 切 `isDirty`；切换列表项时如果 `isDirty=true` 弹 Dialog 二次确认。
- 保存反馈：toast「已保存。同步更新 N 张地图模板引用。」按 `LocalMonsterSaveRes.updatedMapCount` 渲染。

### 9.3 功法技能

桌面布局：

```
┌──────────────────────────────────────────────────────────────────┐
│ Title「功法技能」  actions: [刷新] [保存] [重新读取]             │
├───────────────┬──────────────────────────────────────────────────┤
│ Card 功法目录 │ Card 当前功法 meta                               │
│ - 搜索        │ Card 「切换目标」（技能 Select + Buff Select）   │
│ - 列表        │ Card 「技能信息 / 当前效果」 二列摘要            │
│               │ Card 「Buff 修饰编辑」（key+value+mode 行编辑）  │
└───────────────┴──────────────────────────────────────────────────┘
```

- Buff 修饰行用 Table 展示：列「修饰键 / 值 / 模式（flat/percent）/ 操作」，行尾「删除」`Button variant="ghost" size="icon-sm"`，底部「+ 新增修饰」`Button variant="outline" size="sm"`。
- 模式 toggle：`Tabs` 或 `RadioGroup`（flat / percent），值输入根据模式自动显示后缀（`%` / 数字）。
- 切换技能/Buff 时滚动位置保留（`useRef + scrollTop` 显式保存）。

### 9.4 配置文件

桌面布局：

```
┌──────────────────────────────────────────────────────────────────┐
│ Title「配置文件」 actions: [刷新] [保存] [重新读取] [折叠树状视图]│
├───────────────┬──────────────────────────────────────────────────┤
│ Card 文件目录 │ Card 当前文件 meta（路径 + 类别 badge）          │
│ - 搜索        │ Textarea 编辑器（min-h-[55vh]，等宽字体）        │
│ - 列表        │ Status: 「JSON 校验通过 / 第 N 行错误」          │
└───────────────┴──────────────────────────────────────────────────┘
```

- 文本域：等宽字体 + `tab-size: 2`，保存时本地先 `JSON.parse` 校验：失败 → 红色 toast + `aria-invalid` 红圈，不发请求。
- 「未保存修改」点选下一个文件时，弹 Dialog 二次确认。
- 阶段 4 之后再考虑接入 `@codemirror/view` 升级（不在本计划必交付项）。

### 9.5 服务控制

桌面布局（规范第 12.1 统计卡片）：

```
┌──────────────────────────────────────────────────────────────────┐
│ Title「服务控制」 actions: [刷新状态] [手动重启托管服务]         │
├──────────────────────────────────────────────────────────────────┤
│ StatCard grid (1 / 2 / 4 列响应式)                              │
│  ┌──────────┬──────────┬──────────┬──────────┐                  │
│  │ 运行状态 │ 启动命令 │ 当前 PID │ 最近重启 │                  │
│  └──────────┴──────────┴──────────┴──────────┘                  │
├──────────────────────────────────────────────────────────────────┤
│ Card 「行为说明」（5 条说明列表，icon + 文本）                  │
│ Card 「最近重启原因」（pre 文本）                                │
└──────────────────────────────────────────────────────────────────┘
```

- 状态卡片色：`运行中 → success`、`已停止 → muted`、`异常 → destructive`。
- 重启按钮带二次确认 Dialog（默认勾选「确认要重启托管服务」）。
- `service-running-meta` 文本如「最近一次成功重启：xx 秒前」每 3 秒由 React 轮询计算；后端 polling 仍保持 3 秒一次（与现状一致）。

---

## 10. 文件结构

```
packages/config-editor/
├── index.html                      最小化：只挂 #root
├── public/
│   └── (无)
├── src/
│   ├── main.tsx                    入口：ReactDOM.createRoot + ThemeProvider + Router
│   ├── styles/
│   │   ├── index.css               @import tailwindcss + tw-animate-css + tokens
│   │   └── tokens.css              :root + .dark + 8 个预设
│   ├── lib/
│   │   ├── api.ts                  request<T>() / 类型化端点封装
│   │   ├── cn.ts                   clsx + twMerge
│   │   ├── format.ts               数字/百分比/时间格式化
│   │   └── i18n.ts                 中文文案常量
│   ├── ui/                         15 个基础组件
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── Label.tsx
│   │   ├── Select.tsx
│   │   ├── Switch.tsx
│   │   ├── Tabs.tsx
│   │   ├── Tooltip.tsx
│   │   ├── Sheet.tsx
│   │   ├── Dialog.tsx
│   │   ├── Toast.tsx
│   │   ├── Table.tsx
│   │   ├── Badge.tsx
│   │   ├── Skeleton.tsx
│   │   ├── Separator.tsx
│   │   ├── ScrollArea.tsx
│   │   ├── EmptyState.tsx
│   │   └── StatCard.tsx
│   ├── app/
│   │   ├── theme/
│   │   │   ├── ThemeProvider.tsx
│   │   │   ├── theme-config.ts     预设/圆角/密度枚举
│   │   │   └── ConfigDrawer.tsx
│   │   ├── shell/
│   │   │   ├── AppShell.tsx
│   │   │   ├── AppHeader.tsx
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── SidebarProvider.tsx
│   │   │   └── SidebarInset.tsx
│   │   ├── header/
│   │   │   ├── ServiceStatusPill.tsx
│   │   │   ├── ThemeModeToggle.tsx
│   │   │   └── CommandSearchButton.tsx
│   │   ├── router/
│   │   │   ├── HashRouter.tsx
│   │   │   └── routes.ts
│   │   └── status/
│   │       └── PageStatusBar.tsx
│   ├── pages/
│   │   ├── maps/
│   │   │   ├── MapsPage.tsx
│   │   │   ├── MapList.tsx
│   │   │   ├── MapCanvasFrame.tsx       渲染 GmMapEditor 期望的 ID 节点
│   │   │   ├── MapInspectorTabs.tsx
│   │   │   └── useGmMapEditor.ts        useEffect 实例化 GmMapEditor
│   │   ├── monsters/
│   │   │   ├── MonstersPage.tsx
│   │   │   ├── MonsterList.tsx
│   │   │   ├── MonsterForm.tsx
│   │   │   ├── MonsterPreviewPanel.tsx
│   │   │   ├── editors/
│   │   │   │   ├── AttrsEditor.tsx
│   │   │   │   ├── StatPercentsEditor.tsx
│   │   │   │   ├── EquipmentEditor.tsx
│   │   │   │   └── DropsEditor.tsx
│   │   │   └── useMonsterStore.ts
│   │   ├── techniques/
│   │   │   ├── TechniquesPage.tsx
│   │   │   ├── TechniqueList.tsx
│   │   │   ├── EffectEditor.tsx
│   │   │   └── useTechniqueStore.ts
│   │   ├── files/
│   │   │   ├── FilesPage.tsx
│   │   │   ├── FileList.tsx
│   │   │   └── JsonEditor.tsx
│   │   └── service/
│   │       ├── ServicePage.tsx
│   │       └── ServiceStatusCards.tsx
│   ├── store/
│   │   ├── createStore.ts          createExternalStore（与 client 一致的范式）
│   │   ├── theme-store.ts
│   │   ├── service-store.ts
│   │   ├── monster-store.ts
│   │   ├── technique-store.ts
│   │   ├── files-store.ts
│   │   └── maps-store.ts
│   └── types/
│       └── api.ts                  从原 main.ts 抽出来的所有 LocalXxxRes/Record 类型
├── local-api.cjs                   不变
├── start.sh                        不变
├── tsconfig.json                   include: ["src", "../../packages/client/src/gm-map-editor.ts"]
├── vite.config.ts                  + @tailwindcss/vite + react()
└── package.json                    新增 react / tailwindcss / radix / lucide / clsx / cva / sonner
```

---

## 11. 兼容性与契约对齐

### 11.1 GmMapEditor 边界

- `MapCanvasFrame` 必须**先于** `useGmMapEditor` 渲染（用 `useLayoutEffect` 保证 DOM 已挂载）。
- React 永远**不重渲染** `GmMapEditor` 占用的子树：`MapCanvasFrame` 内的容器节点全部加 `data-gm-managed="true"`，并用 `dangerouslySetInnerHTML={ { __html: '' } }` 占位，靠 `useEffect` 把 `GmMapEditor` 实例挂上去；后续如果需要 React 重布局，只动外层 Card 而非 `id="map-*"` 节点。
- 路由从 `#/maps` 离开时调用 `editor.detach?.()`（按需要在阶段 3 给 `GmMapEditor` 加；最小路径下不调用，靠 `display: none` 保持实例存活，避免重复 fetch）。

### 11.2 网络与状态

- `lib/api.ts` 输出严格类型化的 `request<T>(path, init)` + `endpoints.maps.list() / endpoints.maps.get(id) / endpoints.maps.put(id, payload) / endpoints.monsters.list() / endpoints.monsters.put(payload) / endpoints.techniques.list() / endpoints.techniques.put(payload) / endpoints.editorCatalog.get() / endpoints.configFiles.list() / endpoints.configFile.get(path) / endpoints.configFile.put(path, content) / endpoints.server.status() / endpoints.server.restart()`。
- 不更改 `local-api.cjs` 的请求/响应字段。

### 11.3 数据模型

- 把 `src/main.ts` 顶部所有 `LocalXxxRes / LocalXxxRecord / MonsterTemplateDrop / LocalTechniqueXxx` 等类型迁到 `src/types/api.ts` 原样保留，所有 React 组件 import 同一份类型源；不允许在 `.ts(x)` 里另起类型副本。

### 11.4 服务端 / 共享层

- 不改 `packages/server`、`packages/shared`、`packages/server/data/content`。
- 不改 `monsterRealmBaselines` 的导入路径（继续 `../../server/data/content/realm-attr-baselines.json`）。

---

## 12. 阶段拆分

### Phase 0｜脚手架（1 个 PR 粒度）

- [ ] 在 `packages/config-editor/package.json` 新增 React/Tailwind/Radix/Lucide/cva/clsx/twMerge/sonner/fontsource 依赖，固定 minor 版本。
- [ ] 替换 `vite.config.ts`：加入 `@vitejs/plugin-react` + `@tailwindcss/vite`。
- [ ] 替换 `index.html` 为最小骨架（`<div id="root"></div>` + `<script type="module" src="/src/main.tsx">`）。原 `index.html` 移到 `index.legacy.html` 备份，**暂不删**（用于阶段 3 字段对照）。
- [ ] 新建 `src/main.tsx`、`src/styles/index.css`、`src/styles/tokens.css`，按规范第 3 / 4 节落地全部 token + 默认亮/暗 + 8 预设。
- [ ] 新建 `src/lib/cn.ts`、`src/lib/api.ts`（先包装 `fetch`，端点函数列表占位）。
- [ ] 新建 `src/types/api.ts`，把原 `main.ts` 的 `LocalXxxRes` / `MonsterTemplateRecord` / `LocalTechnique*` 等类型整体搬迁。
- [ ] 验收：`pnpm --filter @mud/config-editor build` 通过；`pnpm --filter @mud/config-editor dev` 启动后页面是空白根 + 一个 demo `<Button>` + 切换亮/暗后台色；`tsc -p` 0 错误；`grep -R "@ts-(nocheck|ignore|expect-error)" packages/config-editor/src` 为空。

### Phase 1｜壳层 + 主题抽屉（2-3 个 PR 粒度）

- [ ] 实现 `ui/` 全部 15 个基础组件（Button/Card/Input/Textarea/Label/Select/Switch/Tabs/Tooltip/Sheet/Dialog/Toast/Table/Badge/Skeleton/Separator/ScrollArea/EmptyState/StatCard）。
- [ ] 实现 `app/shell/` 五件套（AppShell / AppHeader / AppSidebar / SidebarInset / SidebarProvider）+ 移动端 Sheet 折叠 + Ctrl/Cmd+B 切换。
- [ ] 实现 `app/theme/ThemeProvider` + `ConfigDrawer`：复刻规范第 15 节全部 7 个开关 + 重置按钮 + localStorage 持久化。
- [ ] 实现 `app/router/HashRouter` + 5 个空 Page（仅 `<SectionPageLayout title=...>占位</SectionPageLayout>`）。
- [ ] 实现 `app/header/ServiceStatusPill` 接 `/api/server/status` 3 秒轮询，显示 4 状态：`未托管`、`运行中`、`已停止`、`异常`。
- [ ] 验收：
  - 桌面 1280x800、移动 375x812 两套截图（亮 + 暗 + forest-whisper 预设各 1 张）放进 PR。
  - 切换密度 / 圆角 / sidebar variant 视觉立即生效，刷新后保留。
  - `pnpm --filter @mud/config-editor build` 通过。
  - `pnpm verify:quick` 不受影响（本期不动 server，但允许跑一次确认）。

### Phase 2｜5 页业务迁移（按文档顺序逐页 5 个 PR）

每页 PR 模板：

1. 实现该页 Page + List + Detail 子组件 + store + 表单 + 校验。
2. **保持原版 5 个 tab 页签共存**：通过 query / sidebar item 双入口，新页面默认走 React，老页面通过 `?legacy=1` 仍可访问 `index.legacy.html` 做对照（仅 dev mode）。
3. 走交互 smoke：
   - 列表加载 + 搜索 + 选中 + 刷新
   - 详情读 + 改 + 保存 + 重新读取
   - 未保存提示（怪物 / 功法 / 文件三页必有）
   - 主操作 toast（成功/失败两种）
4. 截图差异对照：每个新页配 1 张截图 + 1 张老页对照图。

子顺序与里程碑：

- [ ] 2.1 服务控制（最简单，先打通 toast / Dialog / ConfirmDialog 链路 + StatCard 模板）
- [ ] 2.2 配置文件（验证 list + JSON Textarea + 保存校验 + 未保存提示）
- [ ] 2.3 怪物模板（验证 Tabs + 复杂表单 + StatCard 预览 + Drop 行编辑）
- [ ] 2.4 功法技能（验证嵌套 Select + 修饰行 Table + flat/percent 模式切换）
- [ ] 2.5 地图编辑（最复杂，验证 GmMapEditor DOM 边界 + canvas 自适应 + Inspector Tabs）

### Phase 3｜清理与回归（1 个 PR）

- [ ] 删除 `index.legacy.html` 与原 `src/main.ts`（确认 5 页全部走 React）。
- [ ] 删除 `tsconfig.json` 里对 `gm-map-editor.ts` 的直接 include（保留通过 import 引入）。
- [ ] 删除原 service polling timer 相关老代码。
- [ ] `git grep` 确认 `@mud/config-editor` 内已无 `document.getElementById` 直接调用（除 `useGmMapEditor` 内部预留接口）。
- [ ] 运行 `tsc --noEmit` 通过；运行 `pnpm --filter @mud/config-editor build` 通过；产物体积统计入 PR 描述（基线值与新值）。

### Phase 4｜可选增强（不阻塞主交付）

- [ ] CodeMirror 6 接入「配置文件」JSON 编辑（替换 textarea）。
- [ ] 列表虚拟化（>80 条自动启用）。
- [ ] 命令面板 ⌘K：跨页搜索地图 / 怪物 / 功法 / 文件。
- [ ] 表单字段级 undo（Ctrl+Z 在编辑区单字段层面回滚）。
- [ ] 暗色截图回归脚本（基于 Vite preview + headless Chrome，与 `packages/client` 现有 `verify:react-equipment` 同模式）。

> Phase 4 全部为加强项，本计划交付以 Phase 0-3 为准。

---

## 13. 验证基线

按 AGENTS.md 第 18 节，配置编辑器属于「内容生产链路」，最小验证如下：

| 验证 | 命令 | 范围 |
|---|---|---|
| TS 严格 | `pnpm --filter @mud/config-editor exec tsc -p tsconfig.json` | 0 错误，无 `@ts-nocheck/@ts-ignore/@ts-expect-error` |
| 构建 | `pnpm --filter @mud/config-editor build` | 通过 |
| 共享层 | `pnpm build:shared` | 通过（确认 token 改造未影响下游） |
| 协议审计 | `pnpm audit:protocol` | 通过（本计划不动协议，应为完全 noop） |
| 边界审计 | `pnpm audit:boundaries` | 通过（client/shared/server/config-editor 边界保持） |
| 客户端门禁 | `pnpm verify:client` | 通过（config-editor 不应影响 client，但确认 `gm-map-editor.ts` 的可见行为不变） |
| 人工 smoke | 浏览器 5 页交互链路 | 列表加载 / 搜索 / 选中 / 改字段 / 保存 / 重新读取 / 未保存提示 / 服务重启确认 |
| 视觉 smoke | 1280x800 + 375x812 × 浅/暗 × default + forest-whisper | 4 套截图与规范第 21 节验收清单逐条对齐 |

测试夹具：本计划不引入持久化测试夹具，无需自动清理链。

---

## 14. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| `GmMapEditor` 强依赖 19 个 DOM ID，React 误重渲染会导致 canvas 实例失效 | 地图页崩溃 | `MapCanvasFrame` 用 `useLayoutEffect` 一次性渲染容器并挂 `data-gm-managed`，`useEffect` 内只 `new GmMapEditor(...)`；React 永远不修改 `id="map-*"` 节点；阶段 2.5 单独 PR 走人工 smoke |
| 引入 Tailwind v4 与现有 vite + ts 配置冲突 | 编译失败 | 采用 `@tailwindcss/vite` 官方 plugin（v4 推荐路径），不在 `postcss.config` 里手配；Phase 0 预先 spike 一个 hello world，确认通过 |
| 加入 React 19 后包体明显增大 | 本地工具加载变慢 | 开 Vite production build splitChunks，按页 lazy import；可接受：本地工具，30Mbps 出口不适用 |
| 主题预设的 `color-mix(oklch)` 在旧浏览器不兼容 | 染色失效 | 仅声明支持 Chrome 111+ / Safari 16.4+ / Firefox 113+；不兼容时退化为纯灰 token（无染色，但不影响功能） |
| 5 页迁移过程中老/新 UI 同时维护 | 双倍工作量 | 每页 PR 先迁完才合并，期间通过 sidebar/legacy hash 共存；阶段 3 一次性删除 legacy；总周期不超过 5 个工作日的迁移代码量 |
| 未保存草稿在切换 sidebar 时丢失 | 数据丢失 | 每页 store 监听 `beforeunload + hashchange + sidebar click`，dirty 时弹 Dialog；保留旧版「重新读取」按钮语义 |
| Radix/Lucide/cva 包数量增多带来供应链风险 | 安全 | 全部固定 patch 版本（不用 `^x.y`）；`pnpm install` 后审 lockfile；只引上述白名单包 |
| 老 `local-api.cjs` 在 Node 原生 http 下手写 routing，前端字段命名漂移会导致回归 | 保存失败 | `lib/api.ts` 类型与 `local-api.cjs` 字段一一对照；阶段 2 每页 PR 必带 list/get/put 三段断言（fetch 真实端点） |

回滚预案：

- Phase 0 失败 → 回滚 `package.json + vite.config.ts + index.html` 三文件即可。
- Phase 1 失败 → 不影响业务，回滚 `src/app + src/ui` + `index.html` 主入口。
- Phase 2 任一页失败 → 仅回滚该页对应 `pages/*` 子目录，sidebar 切回 legacy hash 即可继续工作。
- Phase 3 失败 → 把 `index.legacy.html / src/main.ts` 从 git 历史恢复（删除前在该 PR 内单独 commit，便于 revert）。

---

## 15. 工时与排期估算

| 阶段 | 范围 | 单人估算 |
|---|---|---|
| Phase 0 | 脚手架 + token | 0.5 天 |
| Phase 1 | 15 组件 + shell + 主题抽屉 | 2.5 天 |
| Phase 2.1 | 服务控制 | 0.5 天 |
| Phase 2.2 | 配置文件 | 0.5 天 |
| Phase 2.3 | 怪物模板 | 1.5 天 |
| Phase 2.4 | 功法技能 | 1.0 天 |
| Phase 2.5 | 地图编辑 + GmMapEditor 兼容 | 1.5 天 |
| Phase 3 | 清理 + 回归 | 0.5 天 |
| **合计** | | **约 8.5 个工作日** |

> 上述估算不含 Phase 4 可选项。如需 CodeMirror / 命令面板 / 截图回归脚本，每项再 0.5–1 天。

---

## 16. AGENTS 合规自检

- [x] 落点正确：仅改 `packages/config-editor`，不影响 `client / shared / server / data/content`。
- [x] 不主动新增玩法、不破坏既有协议（`local-api.cjs` 与内容文件结构不变）。
- [x] TS 规范：禁止 `// @ts-nocheck/@ts-ignore/@ts-expect-error`；新增组件必须 import/export。
- [x] 商业级口径：本工具是离线本地工具，不进入 5000 并发热路径，但 token / 组件命名遵循生产风格，便于将来回吃到 `packages/client`。
- [x] UI 适配：浅 / 暗 / 移动 375 三态强制；ConfigDrawer 保留密度切换满足触控密度需求。
- [x] 持久化：仅 localStorage（主题 + 上次访问页面），属于会话介质，不涉及 PostgreSQL/Redis 真源。
- [x] 验证：交付前必须给最小验证（第 13 节），覆盖 TS/构建/边界审计/客户端门禁/人工 smoke。
- [x] Git：实施时不主动 commit/push/建 PR，由实施 Agent 等用户指令再处理。

---

## 17. 不做事项（明确划界）

- 不重写 `local-api.cjs`（保持 Node 原生 http + CJS 单文件，是工具的稳定后端）。
- 不重写 `GmMapEditor`（保持现有 DOM ID 绑定模式）。
- 不重写 `packages/server/data/content/*` 任何 JSON 文件结构。
- 不引入路由库（用 hash 路由）。
- 不引入 React Query / TanStack Table / next-themes（自写 store + ThemeProvider）。
- 不实现深色玻璃拟态、不保留旧翠绿强调色为默认主题（forest-whisper 预设保留作为可选）。
- 不实现服务托管侧的新功能（仅复刻当前 `/api/server/*` 行为）。
- 不实现内容文件新增/删除（仅编辑现有，与现状一致）。
