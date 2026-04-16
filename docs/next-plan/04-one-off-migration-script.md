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
- [ ] 跑通一份样本正式转换
- [x] 为迁移脚本补最小验证命令

## 完成定义

- [ ] 同一份 legacy 数据可以稳定转成 next 真源
- [ ] 迁移失败能明确定位
