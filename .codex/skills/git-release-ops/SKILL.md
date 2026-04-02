---
name: git-release-ops
description: Use this skill when the user explicitly asks to commit, push, split git history, prepare release text, write Conventional Commit messages, or produce player-facing changelog entries for this repo.
---

# Git 与发布整理

这个 skill 只在用户明确要求 Git 写操作、整理提交、发布说明或岁月史书时使用。

## 适用场景

- 用户要求 `git commit`
- 用户要求拆分提交历史
- 用户要求 `git push`
- 用户要求写 Conventional Commit
- 用户要求写更新日志、岁月史书、发布说明

## 强制规则

- 未经用户明确要求，不执行 `git commit`、`git push`、改历史。
- 一个提交只表达一个明确意图。
- 不把功能、重构、格式化、依赖升级、文档清理混在一个提交。
- 标题使用 `type(scope): 简洁动词短句`。
- 不是极小修复时，要写 `Why / What / Checks` 正文。

## 提交类型

- `feat`
- `fix`
- `refactor`
- `perf`
- `docs`
- `style`
- `test`
- `build`
- `chore`

## 发布与更新文案

- 面向玩家的更新记录优先写“玩家感受到什么变化”。
- 除非必须，不堆代码术语、协议名、服务端或客户端分层名。

## 推送与部署提醒

- 本地 `git commit` 不会触发线上更新。
- 默认只有 `push main` 才会触发生产自动部署。
- 推送前应先完成本地验证。

## 交付时必须说明

- 提交是否拆分，为什么这样拆
- 每个提交的主题
- 实际执行过的验证
- 如果已 push，推送到哪个分支
