# 地图实例持久化：行级增量硬切计划

## 现状

地图实例持久化目前存在两种模式：

- **行级增量（row-level delta）**：只写入变化的行，flush 成本与变化量成正比
- **全域替换（full-domain replace）**：每次 flush 写入整个域的完整快照，成本与域总量成正比

随着地图实例数量和单实例实体密度增长，全域替换会成为持久化瓶颈。本计划目标是将所有域统一迁移到行级增量模式。

---

## 1. 已完成行级增量的域

| 域 | 说明 |
|---|---|
| `monster_runtime` | 怪物运行时状态，按怪物 ID 跟踪脏行 |
| `tile_damage` | 地块破坏状态，按坐标跟踪脏行 |
| `ground_item` | 地面物品，按坐标/物品 ID 跟踪脏行 |

这些域已具备：per-row dirty 标记、delta 构建、增量 flush、smoke 验证。

---

## 2. 仍使用全域替换、需要迁移的域

| 域 | 当前行为 | 迁移优先级 |
|---|---|---|
| `overlay` | 地图覆盖层（建筑视觉、临时地块），`replaceOverlayChunks` 全量替换 | 高 — chunk 数多、变化稀疏 |
| `container_state` | 容器状态（宝箱、采集点），`replaceContainerStates` 全量替换 | 中 — 容器数量有限但变化频繁 |

已完成行级增量的域：`monster_runtime`、`tile_damage`、`ground_item`、`tile_resource`

> 如果后续新增域，默认必须直接使用行级增量模式，不允许新增全域替换。

---

## 3. 迁移模式（全域替换 → 行级增量）

对每个待迁移域，按以下步骤执行：

### a. 添加 per-row 脏标记

- 在域的运行时数据结构中，为每行（每个实体/坐标/节点）维护独立的 dirty flag 或 dirty set
- 脏标记粒度必须是行级，不能只标记"域有变化"
- 变更入口（tick 处理、事件回调）在修改行时设置脏标记

### b. 构建 delta entries

- flush 准备阶段，遍历 dirty set，只为脏行构建持久化条目（insert/update/delete）
- delta 条目格式与现有 `monster_runtime` / `tile_damage` / `ground_item` 保持一致
- 构建完成后清除 dirty set

### c. flush worker 使用 delta

- flush worker 接收 delta entries 而非全量快照
- 使用 upsert/delete 语句而非 delete-all + bulk-insert
- 保证幂等：相同 delta 重复执行结果一致

### d. 验证

- 现有 smoke 测试必须通过，不改变外部行为
- 补充针对增量场景的验证：
  - 单行变更只产生单行写入
  - 无变更时 flush 不产生 IO
  - 崩溃恢复后状态与增量写入一致

---

## 4. 验收标准

- [ ] 所有高/中优先级域完成迁移，flush 路径不再包含全量快照写入
- [ ] 每个迁移域的 dirty set 在无变更 tick 后为空，flush 零 IO 可验证
- [ ] `pnpm verify:quick` 和相关 smoke 测试全部通过
- [ ] flush worker 日志可观测每次写入的行数，便于运维确认增量生效
- [ ] 新增域的模板/脚手架默认包含 per-row dirty 跟踪，不允许退化为全域替换
