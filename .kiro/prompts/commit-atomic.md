# 原子化提交（不拆分文件）

请把当前未提交的改动按"原子化"的方式提交。具体口径：

## 必须遵守

1. **同一文件不拆到多个 commit**。一个文件的所有改动整文件提交（`git add <path>`），禁止使用 `git add -p`、`--patch`、子文件粒度的暂存；同样禁止先备份再分次粘贴这种等价拆分手法。
2. **一个 commit 只表达一个清晰的目的**。在文件粒度上聚类：把语义相关、面向同一逻辑变更的文件分到同一 commit；不同目的的文件拆到不同 commit。
3. 使用 Conventional Commits（`feat: / fix: / refactor: / chore: / docs: / test: / build: / ci: / perf:`）。范围（scope）建议用本仓库已使用的：`client / server / shared / config-editor / runtime / network / persistence / protocol / tools / ui / renderer / build`。
4. 标题简短（≤ 70 字符），中文优先。正文写：做了什么、为什么、跑了哪些验证、验证结果。
5. **不要 `--amend` 已推送的 commit、不 force push、不 reset --hard、不 git clean -f、不 branch -D**。本次只做新建 commit。
6. **不要主动 `git push`、不建 PR**，除非我明确要求。
7. 默认跑 hooks，不要 `--no-verify`，除非我明确要求。

## 执行流程

1. 先 `git status` + `git diff --stat` 看清全部待提交内容（含 untracked）。
2. 按文件粒度分组，规划 commit 顺序，**先把分组方案告诉我**：每个 commit 的标题、包含的完整文件清单、目的。
3. 等我确认分组没问题后再开始落 commit；如果我说"直接做"再不等确认。
4. 每个 commit 落之前，按 `AGENTS.md` 第 18 节"Codex 默认门禁选择"挑最小验证门禁跑一次（例如服务端小改用 `pnpm verify:quick`，客户端 UI 改用 `pnpm verify:client`，shared/protocol 改用 `pnpm build:shared && pnpm audit:protocol`），把命令和结果写进 commit body。
5. 若发现某个 commit 涉及 `.env`、密钥、token、credentials、私钥等疑似秘密文件，**先停下来提醒我**，等我确认再提交。
6. 全部落完后用 `git log --oneline -n <数量>` 复述结果。

## 边界

- 我可能已经手动 stage 了一部分内容：**不要 `git reset` 回退**；先告诉我已暂存的清单，让我决定是保留还是合并到分组里。
- 如果某个文件里既有"应进 commit A"也有"应进 commit B"的改动，**直接停下来告诉我冲突**，让我手动决定整文件归属或先回去拆改动；不要为了凑分组私自做子文件粒度拆分。
- 工作区里若有不该入库的临时文件（脚本生成、调试产物、`*.log`、`*.tmp`），先列出来问我是否需要 `.gitignore` 或删除，不要默默带进 commit。
- 全过程不动 git 配置（user.name / user.email / hooks 路径等）。

## 输出要求

落完所有 commit 后，给一份总结：commit 顺序、每个 commit 的标题与文件清单、跑了哪些门禁与结果、是否有跳过项与原因。
