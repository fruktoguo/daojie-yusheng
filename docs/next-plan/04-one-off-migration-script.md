# 04 一次性迁移脚本

目标：用离线转换代替长期 compat。

当前脚本落点：

- `packages/server/src/tools/migrate-next-mainline-once.js`
- 包内入口：`pnpm --filter @mud/server-next migrate:legacy-next:once`

当前已落地能力：

- 默认 `dry-run`
- 支持 `--write`
- 支持 `--domains=auth,identity,snapshot,mail,market,redeem,suggestion,gm-auth,gm-database`
- 输出迁移摘要与失败清单
- 当前已覆盖 `auth / identity / snapshot / mail / market / redeem / suggestion / gm-auth / gm-database`
- 样本 fixture：`packages/server/src/tools/fixtures/migrate-next-mainline-once/sample-legacy.json`
- 已实际跑通样本 dry-run：
  - `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=src/tools/fixtures/migrate-next-mainline-once/sample-legacy.json --domains=auth,identity,snapshot,mail,market,redeem,suggestion,gm-auth,gm-database`
- 已实际跑通样本正式转换：
  - `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=src/tools/fixtures/migrate-next-mainline-once/sample-legacy.json --domains=auth,identity,snapshot,mail,market,redeem,suggestion,gm-auth,gm-database --write`
  - `pnpm verify:replace-ready:proof:with-db`
- 当前样本 `--write` 摘要：
  - `auth=1`
  - `identity=1`
  - `snapshot=1`
  - `mail=1`
  - `market=3`
  - `redeem=2`
  - `suggestion=1`
  - `gm-auth=1`
  - `gm-database=2`
  - `failed=[]`

## 当前写入目标口径

这份脚本最终不是“生成一个报告”就算完成，而是要把 legacy 数据写入 next 真源。

当前迁移目标应按 [03-required-data-migration-checklist.md](./03-required-data-migration-checklist.md) 固定为：

- 专表
  - `server_next_player_auth`
  - `server_next_player_identity`
  - `server_next_player_snapshot`
- `persistent_documents` scope
  - `server_next_mailboxes_v1`
  - `server_next_market_orders_v1`
  - `server_next_market_trade_history_v1`
  - `server_next_market_storage_v1`
  - `server_next_suggestions_v1`
  - `server_next_redeem_codes_v1`
  - `server_next_gm_auth_v1`
  - `server_next_db_backups_v1`
  - `server_next_db_jobs_v1`

## 任务

- [x] 选定迁移脚本目录和文件命名
- [x] 明确脚本输入来源
- [x] 明确脚本输出目标
- [x] 支持 dry-run
- [x] 支持输出迁移摘要
- [x] 支持输出失败清单
- [x] 支持按数据域分段执行
- [x] 实现账号身份迁移
- [x] 实现角色基础资料迁移
- [x] 实现地图位置与出生点迁移
- [x] 实现邮件迁移
- [x] 实现市场迁移
- [x] 实现兑换码迁移
- [x] 实现建议 / 回复迁移
- [x] 实现 GM 密码记录迁移
- [x] 实现 GM 备份/作业迁移
- [ ] 实现属性 / 数值成长迁移
- [ ] 实现背包 / 装备 / 物品迁移
- [ ] 实现功法 / 技能 / 修炼状态迁移
- [ ] 实现任务迁移
- [x] 实现兑换码与 GM 备份/作业等必要数据迁移
- [x] 补一份样本迁移数据
- [x] 跑通一份样本 dry-run（fixture 样本已落地并实际执行）
- [x] 跑通一份样本正式转换
- [x] 为迁移脚本补最小验证命令

## 输入来源分层

脚本输入必须固定成下面三类之一，不能边跑边临时猜：

### 1. fixture 输入

- `--fixture=...sample-legacy.json`

用途：

- 开发和回归 dry-run
- 样本 write proof

### 2. 本地数据库 / 持久化输入

- 旧 `persistent_documents`
- legacy 专表或 legacy `users/players`
- 其它已锁定的 legacy 表

用途：

- 本机真实转换
- shadow 前置演练

### 3. 导出快照输入

- legacy SQL dump
- JSON 导出

用途：

- 不直连旧环境时的离线迁移

## 执行顺序

### 第 1 批：先把身份主链写稳

- [ ] `auth`
- [ ] `identity`
- [ ] `snapshot`

原因：

- 这是 next 登录、bootstrap、入图、持久化的最小主链。

最小验证：

- `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=... --domains=auth,identity,snapshot`
- `pnpm verify:replace-ready:proof:with-db`
- `pnpm --filter @mud/server-next smoke:persistence`

### 第 2 批：补玩家核心进度与资产

- [ ] `progression / attrs`
- [ ] `inventory / equipment / items`
- [ ] `techniques / skills / cultivating`
- [ ] `quests`

这是当前 `04` 最大缺口；不补齐，runtime bridge 无法真正退役。

最小验证：

- `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=... --domains=snapshot`
- `pnpm --filter @mud/server-next smoke:progression`
- `pnpm --filter @mud/server-next smoke:runtime`

### 第 3 批：补社区与运营域

- [ ] `mail`
- [ ] `market`
- [ ] `suggestion`
- [ ] `redeem`
- [ ] `gm-auth`
- [ ] `gm-database`

最小验证：

- `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=... --domains=mail,market,redeem,suggestion,gm-auth,gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database`
- `pnpm --filter @mud/server-next smoke:gm-database:backup-persistence`

### 第 4 批：跑正式写入 proof

- [x] 用 fixture 跑一次 `--write`
- [ ] 用本地测试库跑一次 `--write`
- [x] 迁移后立即执行 next proof 链
- [x] 记录写入数量、失败数量、失败样本、未覆盖域

最小验证：

- `pnpm --filter @mud/server-next migrate:legacy-next:once -- --fixture=... --domains=... --write`
- `pnpm verify:replace-ready:with-db`
- `pnpm verify:replace-ready:acceptance`

## write 模式检查表

- [ ] `--write` 只写 next 真源，不回写 legacy
- [ ] 同一 domain 能单独重跑
- [ ] 每个 domain 都能单独输出成功/失败摘要
- [ ] 失败条目可定位到：
  - domain
  - legacy key / id
  - 失败原因
- [ ] write 前先打印：
  - 输入来源
  - domains
  - dry-run 还是 write
  - 目标 scope / 表

## 每个 domain 完成前必须回答

- 输入来源是什么
- 写入哪个 next 表 / scope
- 跳过非法记录时怎么记失败清单
- 默认值怎么补
- 迁完后用哪条 smoke / verify 证明 next 能直接消费

## 正式转换 proof 链

样本正式转换不等于完成，完成必须按这条链跑：

1. `migrate-next-mainline-once --write`
2. `pnpm verify:replace-ready:proof:with-db`
3. `pnpm --filter @mud/server-next smoke:persistence`
4. 视域补跑：
   - `smoke:gm-database`
   - `smoke:progression`
   - `smoke:runtime`
5. 如要证明接班，再进：
   - `pnpm verify:replace-ready:with-db`
   - `pnpm verify:replace-ready:acceptance`

## 失败处理规则

- 单条记录非法
  - 记入失败清单，继续迁其它条目。
- domain 级结构错误
  - 中止该 domain，保留已完成 domain 摘要。
- write 目标不可用
  - 直接失败，不允许“只记 dry-run 结果”冒充完成。
- 迁后 smoke 失败
  - 归类为“转换结果不可消费”，不算迁移完成。

## 本阶段不做的事

- 不把 runtime compat 当长期迁移方案。
- 不把 `dry-run` 结果当作正式完成。
- 不在脚本里新增长期 bridge/fallback。

## 完成定义

- [ ] 同一份 legacy 数据可以稳定转成 next 真源
- [ ] 迁移失败能明确定位
