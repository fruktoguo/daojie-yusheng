---
name: prod-gm-api
description: 连接本项目正式服（https://dj.faith.wang）的 GM API，用于查看服务端日志、查询运行时/数据库状态、查玩家、执行只读 SQL 诊断以及必要的运维操作，辅助开发与线上验证。当需要"看正式服日志/线上报错""查正式服玩家或数据""确认某改动在生产的实际表现""线上运行态/在线数/tick""只读查库"或类似排查、验证、复现线上问题时使用。
---

# 正式服 GM API（道劫余生）

通过统一助手脚本 `scripts/gm-api.sh` 调用正式服 GM API，帮助开发和线上验证。
**这是与正式服交互的唯一入口，不要手写 curl 拼 token。**

- 正式服域名：`https://dj.faith.wang`（GM 面板 `https://dj.faith.wang/gm.html`，API 前缀 `/api/gm`、`/api/auth/gm`）
- 鉴权：脚本自动从 `prod.env`（gitignored）读取 `GM_PASSWORD`，`POST /api/auth/gm/login` 换取 Bearer token，缓存到 `.runtime/.gm-api-token`（600 权限，11h 复用，401 自动重登）。**密码不出现在任何入库文件里，不要打印、不要写进代码或文档。**

## 调用方式

```bash
bash scripts/gm-api.sh <子命令> [参数]
```

### 常用只读命令（默认安全，可直接用于排查/验证）

| 命令 | 作用 |
|---|---|
| `bash scripts/gm-api.sh state` | 全服运行态总览：在线数、玩家统计、地图列表、tick、CPU、内存、流量 |
| `bash scripts/gm-api.sh logs [limit] [before]` | 服务端控制台日志缓冲（默认 100 条，`before=<seq>` 向前翻页，返回 `nextBeforeSeq`） |
| `bash scripts/gm-api.sh players [search]` | 玩家列表（可搜索用户名/角色名） |
| `bash scripts/gm-api.sh player <id>` | 单玩家详情 |
| `bash scripts/gm-api.sh workers` | worker / outbox / 备份心跳汇总 |
| `bash scripts/gm-api.sh dbstate` | 数据库连接状态与备份列表 |
| `bash scripts/gm-api.sh presence` | 在线玩家（presence all） |
| `bash scripts/gm-api.sh tables` | 列出所有数据库表及占用 |
| `bash scripts/gm-api.sh diag "<command>"` | 诊断指令（见下） |
| `bash scripts/gm-api.sh sql "SELECT ..."` | 只读 SQL（服务端强制只读围栏 + statement_timeout + LIMIT） |

### 诊断指令（`diag "<command>"`，全部只读）

先跑 `diag "help"` 看完整清单。常用：
- `tables` / `table <name> [limit]` — 表结构/采样
- `presence` / `presence all` — 在线态
- `player <id|username>` — 玩家身份+在线+快照+钱包
- `inventory <id>` / `equipment <id>` / `techniques <id>` / `quests <id>` — 玩家子系统
- `outbox` — outbox 事件队列
- `sql <SELECT...>` — 自由只读查询（等价 `sql` 子命令）

> 排查线上问题的推荐顺序：`logs` 看报错 → `diag "help"` 找对应查询 → `player <id>` / `sql` 定位数据 → 对照 `docs/mechanics/` 机制文档确认预期。真实表名以 `tables` 输出为准（例如 `player_flush_ledger`、`outbox_event`、`outbox_consumer_dedupe` 等；不存在名为 `players` 的表）。

### 通用出口（脚本未封装的端点）

```bash
bash scripts/gm-api.sh get  /api/gm/<path>
bash scripts/gm-api.sh post /api/gm/<path> '<json>'
bash scripts/gm-api.sh raw  <METHOD> /api/gm/<path> '<json>'
bash scripts/gm-api.sh token          # 打印当前有效 token（供特殊场景）
```

常见可 GET 的只读端点：`/api/gm/runtime-flags`、`/api/gm/game-config`、`/api/gm/maps`、`/api/gm/maps/:mapId/runtime`、`/api/gm/world/summary`、`/api/gm/world/instances`、`/api/gm/market/trades`、`/api/gm/database/table-stats`、`/api/gm/database/state`、`/api/gm/environment/check`。

## 安全红线（务必遵守）

1. **默认只做只读排查。** `logs`/`state`/`players`/`diag`/`sql`/`get` 这类只读操作可直接执行。
2. **任何写操作 / 高危操作，执行前必须先向用户说明并取得明确确认。** 包括但不限于：
   - 改玩家（`PUT/POST /api/gm/players/*`：改密、封禁、重置、发邮件、加属性/经验、月卡）
   - 世界写操作（`freeze/unfreeze/flush/rebuild/migrate`、`POST /api/gm/world/instances`）
   - GM 快捷指令 `apply`（`/api/gm/shortcuts/**/apply`，尤其 compat 转换类）
   - tick/维护/重启（`PUT .../tick`、`POST /api/gm/maintenance`、`POST /api/gm/server/restart`）
   - 数据库 `backup/restore/cleanup`，`diag "exec <SQL>"`（写库）
   - secrets / environment / ai-provider 的增删改
3. **转换类快捷指令一律先 `dry-run` 再 `apply`**，把 dry-run 结果给用户确认后才 apply。
4. 只读 SQL 用 `sql`/`diag "sql ..."`；**绝不用 `diag "exec ..."` 除非用户明确要求写库**。
5. 不要把 token、密码、玩家隐私数据外发或写入会入库的文件。

## 环境变量（一般无需设置）

- `GM_BASE_URL`：默认 `https://dj.faith.wang`（临时指向本地/测试服时覆盖）
- `GM_ENV_FILE`：密码来源文件，默认仓库根 `prod.env`
- `GM_PASSWORD`：直接从环境变量取密码（优先于文件），避免依赖 `prod.env`

## 参考

- 助手脚本：`scripts/gm-api.sh`
- 端点实现：`packages/server/src/http/native/native-gm.controller.ts`、`native-gm-admin.controller.ts`、`native-gm-diagnostics.service.ts`
- 鉴权：`packages/server/src/runtime/gm/runtime-gm-auth.service.ts`
- 运维手册：`docs/runbook/gm-system.md`（注意其中个别 curl 路径已过时，以本 skill 与控制器为准）
