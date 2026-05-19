# 装备稳定 InstanceID 改造计划

> 解决问题：为装备引入稳定唯一身份（UUID），解决强化/装卸/市场挂单时因 slotIndex 漂移导致的目标错位问题。

## 状态：✅ 全部完成

所有阶段（shared 层 → 工具层 → 持久化层 → 生成入口 → 堆叠合并 → 水合升级 → 协议校验 → 测试验证）已完成。

## 落地结果

### 核心机制
- 装备生成时分配 UUID v4 作为 `itemInstanceId`
- 全程跟随：掉落→拾取→装备→强化→卸下，身份不变
- 市场挂单时脱壳（同质化），买家成交时重新分配
- 带 instanceId 的物品永远独立成 slot，不与同签名堆叠合并

### 乐观一致性校验
- 客户端操作时携带 `expectedItemInstanceId`
- 服务端比对：匹配→继续，不匹配→拒绝并提示"目标已变更"
- `ITEM_INSTANCE_ID_HARD_CHECK` 环境变量控制软/硬校验

### 迁移策略
- 零停机 lazy 升级：玩家上线时旧 fallback ID（含 `:`）自动升级为 UUID
- 无 schema 变更（`item_instance_id` 列已存在）
- 旧客户端不发 expected 时跳过校验

### 验证
- 综合 smoke `item-instance-id-smoke.ts` 覆盖 assignment/enhancement/equip/market/grant
- `pnpm build` / `pnpm verify:quick` / `pnpm verify:client` 通过

### 已知 baseline 风险（与本方案正交）
- `cloneItemPreservingTemplate` 写入冻结模板的 itemId 冲突，属于另一个工作面

## 关键文件

```
packages/shared/src/item-runtime-types.ts          — ItemStack.itemInstanceId
packages/shared/src/item-stack.ts                  — isItemInstanceTracked / canMergeItemStack
packages/server/src/runtime/world/item-instance-id.helpers.ts — assignItemInstanceIdIfNeeded
```
