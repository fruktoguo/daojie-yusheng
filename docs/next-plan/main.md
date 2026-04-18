# next 原地硬切任务计划

更新时间：2026-04-18

这份文档是原地硬切的实际执行清单。

使用规则：

- `[ ]` 代表未完成
- `[x]` 代表已完成
- 新任务默认只往这份清单里加，不再另起一套“兼容迁移”计划
- 如果某项不做了，直接删掉，不保留僵尸任务

执行时以这份总表为总索引，以编号任务文档为实际落地清单：

- 第 1 阶段对应 [01 冻结 legacy 与边界收口](./01-freeze-legacy-and-boundaries.md)
- 第 2-3 阶段对应 [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)
- 第 4 阶段对应 [03 必须迁移的数据清单](./03-required-data-migration-checklist.md)
- 第 5 阶段对应 [04 一次性迁移脚本](./04-one-off-migration-script.md)
- 第 6 阶段对应 [05 删除 compat 与桥接层](./05-remove-compat-and-bridges.md)
- 第 7 阶段对应 [06 服务端主链收口](./06-server-mainline-refactor.md)
- 第 8 阶段对应 [07 客户端主链收口](./07-client-mainline-refactor.md)
- 第 9-10 阶段对应 [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)
- 第 11 阶段对应 [09 验证门禁与验收](./09-verification-and-acceptance.md)
- 第 12-13 阶段对应 [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)

## 0. 已完成前置

- [x] 明确不再新开第三套主线，继续在当前仓库原地推进
- [x] 明确 `packages/client`、`packages/server`、`packages/shared` 为唯一主线方向
- [x] 写出 [next 系统模块 / API / 数据目录总盘点](../next-system-module-api-inventory.md)
- [x] 写出 [next 原地硬切执行文档](../next-in-place-hard-cut-plan.md)

## 1. 立刻冻结 legacy

对应任务文档：

- [01 冻结 legacy 与边界收口](./01-freeze-legacy-and-boundaries.md)

- [x] 在文档口径里明确 `legacy/*` 只作为参考和迁移来源，不再承担主开发职责
- [x] 停止新增任何“为了对齐 legacy 行为”的新任务
- [x] 停止向 `legacy/client`、`legacy/server`、`legacy/shared` 落新功能
- [x] 盘点当前还在直接读写 `legacy/*` 的 next 主链入口
- [x] 列出必须暂时保留的 legacy 读取点
- [x] 列出可以直接删除的 legacy / compat / parity 入口

## 2. 钉死 next 真源

对应任务文档：

- [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)

- [x] 确认 `packages/shared/src/protocol.ts` 是唯一 next 协议真源
- [x] 确认 `packages/server/data/*` 是唯一内容和地图真源
- [x] 确认 `packages/server/src/runtime/*` 是唯一服务端运行时主链
- [x] 确认 `packages/client/src/network/socket.ts` 是唯一前台 Socket 主链
- [x] 确认 `packages/client/src/main.ts` 是唯一前台入口主链
- [x] 清掉仍然通过 legacy 文件定义 next 行为的地方

## 3. 先补协议硬缺口

对应任务文档：

- [02 钉死 next 真源与协议主线](./02-pin-next-sources-and-protocol.md)

- [x] 决定 `SaveAlchemyPreset` 保留为 next 正式能力
- [x] 决定 `DeleteAlchemyPreset` 保留为 next 正式能力
- [x] 已在 next 网关和 runtime 补齐实现
- [x] 扫一遍所有 `NEXT_C2S` / `NEXT_S2C`，确认不再有“声明了但没实现”的事件
- [x] 跑一遍协议审计，确认共享协议、客户端、服务端三边一致

## 4. 产出必须迁移的数据清单

对应任务文档：

- [03 必须迁移的数据清单](./03-required-data-migration-checklist.md)

- [x] 列出账号身份相关数据
- [x] 列出角色基础信息相关数据
- [x] 列出地图位置 / 出生点 / 当前实例相关数据
- [x] 列出境界 / 属性 / 数值成长相关数据
- [x] 列出背包 / 装备 / 物品相关数据
- [x] 列出功法 / 技能 / 修炼状态相关数据
- [x] 列出任务相关数据
- [x] 列出邮件相关数据
- [x] 列出市场相关数据
- [x] 列出建议 / 回复相关数据
- [x] 列出兑换码和 GM 必要持久化数据
- [x] 对每个数据域写清 legacy 来源、next 目标、转换规则、默认值、可丢弃项
- [x] 把这份数据清单单独落成文档

补充口径：

- [x] 已明确可重建项：`buff / runtimeBonuses / pendingLogbookMessages`
- [x] 已明确可按条件跳过项：`市场成交历史 / 地图环境快照 / Afdian / GM 备份作业历史`

## 5. 写一次性迁移脚本

对应任务文档：

- [04 一次性迁移脚本](./04-one-off-migration-script.md)

- [x] 选定迁移脚本落点目录
- [x] 支持 dry-run
- [x] 支持输出迁移统计摘要
- [x] 支持输出失败清单
- [x] 支持按数据域分段执行
- [x] 支持从 legacy 来源读取账号与角色数据
- [x] 支持从 legacy 来源读取邮件数据
- [x] 支持从 legacy 来源读取市场数据
- [x] 支持从 legacy 来源读取兑换码数据
- [x] 支持从 legacy 来源读取建议 / 回复数据
- [x] 支持从 legacy 来源读取 GM 密码数据
- [x] 支持从 legacy 来源读取 GM 备份 / 作业数据
- [x] 支持迁移背包 / 装备 / 功法 / 任务 / 邮件 / 市场 / 建议等核心数据
- [x] 支持把结果写入 next 所需持久化结构
- [x] 设计迁移后的最小验证命令
- [x] 补一份样本 fixture 并跑通 dry-run
- [x] 用一份样本数据跑通完整转换

## 6. 删除 compat / bridge / parity 层

对应任务文档：

- [05 删除 compat 与桥接层](./05-remove-compat-and-bridges.md)

- [x] 盘点 `packages/server/src/network/` 下仍然存在的 compat / bridge 入口
- [x] 盘点 `packages/server/src/persistence/` 下仍然存在的 compat 读取入口
- [x] 盘点 `packages/client/src/` 下仍然存在的旧协议 alias / 旧 UI 兼容入口
- [x] 删除只为 legacy 让路的旧事件名兼容
- [x] 删除只为 parity 存在的双路径处理分支
- [x] 删除不再需要的 legacy wrapper / facade
- [x] 删除 runtime 中只为了 compat fallback 存在的回退路径
- [x] 删除客户端里只为旧协议 / 旧 UI 结构存在的兼容逻辑
- [x] 每删完一批，就补最小 next 主链验证

## 7. 收口服务端主链

对应任务文档：

- [06 服务端主链收口](./06-server-mainline-refactor.md)

- [ ] 继续拆 `packages/server/src/runtime/world/world-runtime.service.js`
- [ ] 继续拆 `packages/server/src/network/world.gateway.js`
- [ ] 继续拆 `packages/server/src/network/world-sync.service.js`
- [ ] 继续拆 `packages/server/src/network/world-projector.service.js`
- [ ] 把 tick 内状态写入口继续收束
- [ ] 把玩家、地图、战斗、掉落、交互写路径继续分责
- [x] 明确哪些 GM 操作必须走 runtime queue
- [x] 明确哪些 GM 操作允许直改持久态
- [ ] 把玩家从登录到进入世界到持久化的主链整理成单路径

## 8. 收口客户端主链

对应任务文档：

- [07 客户端主链收口](./07-client-mainline-refactor.md)

- 当前口径：
  - 客户端当前阶段只要求完成 next 协议对接、Socket 事件消费收口和必要状态桥接
  - UI 视觉、交互细修、面板重构、patch-first 深挖、浅色/深色/手机样式回归都不作为当前 hard cut 阻塞项
  - 客户端 UI 由后续独立设计迭代处理，不纳入本轮 next 完整性判断
- [ ] 继续整理 `packages/client/src/main.ts`
- [ ] 继续整理 `packages/client/src/network/socket.ts`
- [ ] 检查 GM 页面、GM 世界查看器、地图编辑器是否都还要长期保留
- [ ] 收口详情弹层、邮件、建议、任务、市场、设置等面板的状态来源
- [ ] 明确哪些状态只能由 Socket 增量驱动
- [ ] 明确哪些状态允许客户端本地派生缓存

## 9. 收口共享层

对应任务文档：

- [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)

- [x] 继续整理 `packages/shared/src/protocol.ts`
- [x] 继续整理 `packages/shared/src/types.ts`
- [x] 继续整理 `packages/shared/src/network-protobuf.ts`
- [x] 给新增协议字段补一致性检查
- [x] 给新增数值字段补完整性检查
- [x] 确保 shared 变更默认会被 audit / check 拦住

## 10. 内容与地图整理

对应任务文档：

- [08 shared 与内容地图收口](./08-shared-content-and-map-cleanup.md)

- [x] 重新标注哪些 `packages/server/data/content/*` 是玩法真源
- [x] 重新标注哪些数据是编辑器辅助产物
- [x] 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- [x] 检查 compose 地图、室内地图、传送点、NPC 锚点规范
- [x] 决定哪些客户端 generated 数据可以重做或删掉
- [x] 决定哪些客户端 generated 数据继续保留

## 11. 验证门禁收口

对应任务文档：

- [09 验证门禁与验收](./09-verification-and-acceptance.md)

- [x] 把 `local / with-db / acceptance / full / shadow-destructive` 继续固定为唯一门禁口径
- [x] 给“数据迁移完成”补一条迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [x] 跑通 `pnpm verify:replace-ready:with-db`
- [ ] 跑通 `pnpm verify:replace-ready:acceptance`
- [ ] 跑通 `pnpm verify:replace-ready:full`
- [x] 确认这些门禁都以 next 主链为口径，不再默认证明 legacy 对齐

补充说明：

- 当前仓库已证明 `local` 与 `with-db` 都在本轮实跑通过。
- `acceptance / full / shadow-destructive` 仍应以 `09` 文档里的环境阻塞与当前轮次实跑记录为准，不能沿用历史 `[x]` 口径。

## 12. legacy 归档收尾

对应任务文档：

- [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)

- [x] 列出仍然必须保留的 legacy 文件范围
- [ ] 把不再需要的 legacy 入口从主文档和主流程中移除
- [ ] 把 legacy 剩余价值收束为“查规则 / 查旧数据格式 / 迁移来源”
- [ ] 更新顶层说明文档，明确当前仓库只有 next 是活跃主线

## 13. 硬切完成定义

对应任务文档：

- [10 legacy 归档与最终切换](./10-legacy-archive-and-cutover.md)

- [ ] `packages/*` 成为唯一活跃主线
- [ ] legacy 数据可以稳定迁到 next
- [ ] 玩家主链不再默认走 compat fallback
- [ ] GM 关键面与必要管理面能闭环
- [ ] 协议、运行时、UI 不再为了 legacy 对齐背额外复杂度
- [ ] 验证门禁全部按 next 主链口径通过

## 14. 当前建议顺序

- [x] 先完成“必须迁移的数据清单”
- [ ] 再补协议空洞和最外层 compat 删除
- [ ] 再写一次性迁移脚本
- [ ] 再做 server/client/shared 主链收口
- [ ] 最后跑完整验证门禁并做 legacy 归档
