# Review Round 8

- Session ID: `019d9563-549a-7550-8e99-c57704a96b28`
- Main Exit Code: `0`
- Review Status: `done`

已完成一轮面向 next 迁移补漏的结构化核对：新增 14 处源码 `TODO(next:...)`，覆盖 `packages/server/src/http/next`、`packages/shared/src`、`packages/client/src/ui`、`packages/client/src/network`、以及部分 next smoke 工具；同时对若干大模块做了人工对位核查但未发现需要新增 TODO 的明显缺口。宽口径 legacy/compat 扫描复核为空，当前仓库 `TODO(next:...)` 总数为 117。
