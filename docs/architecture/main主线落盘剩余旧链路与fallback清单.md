# main 主线落盘硬切后旧链路边界清单

## 1. 文档定位

本文记录 `mud-mmo-next` 在 2026-04-28 数据层硬切后的旧落盘链路边界。说明：

- 正式 runtime 已经不能再触发哪些旧链路
- 仓库里仍保留哪些离线迁移、历史导入或审计工具
- 哪些直接运行态写法只是 durable 成功后的内存回填，不再算 fallback

## 2. 核心结论

> 旧快照、旧业务文档和 direct asset fallback 已从正式 runtime 主线移除；仓库残留只允许服务于离线转换、历史 JSON 备份导入、审计和少量迁移 smoke。

具体边界：

- 玩家恢复、GM 查询、GM 广播收件人枚举、durable asset 写入不再依赖 `server_player_snapshot`。
- 地图 runtime 不再读写旧 map snapshot。
- 兑换码、建议、GM auth、GM 地图配置、宗门、市场订单/成交历史/托管仓、数据库备份/任务状态已迁到专表。
- 兑换码奖励、战斗掉落、PvP 奖励、NPC 任务奖励、GM 钱包/发物缺 durable 条件时返回硬错误，不再 direct fallback。

## 3. 已删除的 direct fallback 规则

- 钱包/背包奖励必须走 `DurableOperationService` 对应方法。
- durable 条件不满足时抛错，不再直写运行态资产。
- 背包满导致地面掉落是玩法结果，不是绕过持久化的 fallback。
- GM 钱包变更和发物路由都要求 session fencing、instance lease 与 durable service。

## 4. 仍允许存在的"直接运行态写法"

仓库里 `receiveInventoryItem()` / `creditWallet()` 等只在以下场景允许：

- durable 事务已提交，随后把结果同步回运行态内存。
- 背包满导致地面掉落，且该地面物品属于实例分域持久化真源。
- 新号初始化、GM 显式修复或离线迁移工具在受控流程里写入正式结构化表。

如果出现"durable 不可用 → 直接写运行态并继续成功返回"，即视为硬切回退，门禁必须失败。

## 5. 验证入口

旧真源退役静态门禁：

```bash
pnpm --filter @mud/server audit:persistence-retirement
```

重点证明：

- 主线不再使用旧整档快照或 `persistent_documents` 真源。
- durable operation 不再维护旧玩家整档表。
- 会话恢复不再回读或补种旧 `server_player_snapshot`。

仍需单独证明：`verify:release:with-db / shadow / acceptance / full` 全套门禁、迁移演练和容量压测。
