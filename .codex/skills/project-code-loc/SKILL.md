---
name: project-code-loc
description: Use this skill when you need to count a repository's source-code lines, summarize code volume by extension, and exclude common tool/configuration files, dependency folders, caches, and build outputs.
---

# 项目代码行数统计

这个 skill 用于统计项目源码行数，并默认排除常见配置文件、依赖目录、缓存目录和构建产物。适用于用户要求“统计代码行数”“看一下 LOC”“按语言或扩展名汇总代码量”，但不希望把 `vite.config.ts`、`eslint.config.js`、`jest.config.ts` 这类工程配置文件算进去的场景。对于当前 monorepo，它还会额外把结果拆成 `frontend`、`backend`、`shared`、`other`，并把 `html`、`css`、`scss`、`less` 这类前端结构和样式文件纳入统计。

## 直接流程

1. 优先运行 `scripts/count_code_lines.py`，默认统计当前目录。
2. 默认优先使用 git 已跟踪文件；如果当前目录不是 git 仓库，再回退到文件系统遍历。
3. 回复时至少给出：
   - 统计范围
   - 总文件数
   - 总行数
   - 非空行数
   - 前端 / 后端 / shared / other 分区结果
   - 按扩展名汇总
4. 如果用户只关心某个子目录，直接把该目录作为脚本参数传入。
5. 如果仓库里有额外的生成目录或不想统计的特殊路径，用 `--extra-exclude` 追加排除规则。

## 默认统计规则

- 只统计常见源码扩展名，例如 `ts`、`tsx`、`js`、`jsx`、`mts`、`cts`、`mjs`、`cjs`、`py`、`java`、`go`、`rs`、`c`、`cpp`、`h`、`hpp`、`cs`、`php`、`rb`、`swift`、`kt`、`lua`、`sh`、`sql`、`proto`，以及前端常见的 `html`、`css`、`scss`、`sass`、`less`。
- 默认排除目录：`.git`、`node_modules`、`dist`、`build`、`coverage`、`.next`、`.nuxt`、`.turbo`、`.cache`、`tmp`、`temp`、`vendor`、`out` 等常见非源码目录。
- 默认排除配置文件：
  - `*.config.*`
  - `*.conf.*`
  - `.eslintrc*`、`.prettierrc*`、`.stylelintrc*`、`.babelrc*`、`.commitlintrc*`
  - 常见工具配置文件，例如 `vite.config.ts`、`vitest.config.ts`、`jest.config.ts`、`tailwind.config.ts`、`webpack.config.js`
- 不把 `json`、`yaml`、`toml`、`ini`、lockfile 这类配置或数据文件纳入源码行数。
- 默认区域识别：
  - `packages/client`、`packages/client-next`、`packages/config-editor` 归为 `frontend`
  - `packages/server`、`packages/server-next` 归为 `backend`
  - `packages/shared`、`packages/shared-next` 归为 `shared`
  - 其他路径归为 `other`

## 常用命令

统计当前仓库：

```bash
python3 .codex/skills/project-code-loc/scripts/count_code_lines.py .
```

只统计某个子目录：

```bash
python3 .codex/skills/project-code-loc/scripts/count_code_lines.py packages/server
```

追加自定义排除规则：

```bash
python3 .codex/skills/project-code-loc/scripts/count_code_lines.py . \
  --extra-exclude 'packages/client/src/generated/**' \
  --extra-exclude '**/*.gen.ts'
```

强制遍历文件系统而不是 git 跟踪文件：

```bash
python3 .codex/skills/project-code-loc/scripts/count_code_lines.py . --all-files
```

## 回复要求

- 明确说明是否按 git 已跟踪文件统计，还是按文件系统遍历统计。
- 明确说明默认排除了配置文件与哪些目录。
- 如果在当前仓库统计，默认同时汇报 `frontend`、`backend`、`shared`、`other` 的代码量，以及其中的 `html/css` 分布。
- 如果用户有“不要统计测试”“不要统计声明文件”“只看服务端”这类额外约束，先通过参数或结果口径落实，再汇报结果。
- 如果没有命中任何源码文件，直接说明规则下无可统计文件，不要编造数字。

## 资源

- `scripts/count_code_lines.py`：统计源码文件数、总行数、非空行数，并按扩展名汇总。
