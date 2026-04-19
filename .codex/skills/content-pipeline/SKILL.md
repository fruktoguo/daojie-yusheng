---
name: content-pipeline
description: Use this skill when reorganizing or syncing game content in this repo after editing techniques, items, monsters, drops, or editor-visible catalog data. Covers organize-techniques, sync-technique-books, sync-qi-items, and generate-editor-catalog for client.
---

# 内容流水线

这个 skill 只负责“内容改完后该跑哪些同步脚本与生成步骤”。

适用场景：

- 调整了 `packages/server/data/content/techniques/`
- 调整了 `packages/server/data/content/items/`
- 调整了 `packages/server/data/content/monsters/`
- 需要更新编辑器目录或客户端物品/功法可选项
- 需要整理功法文件目录，而不是继续手改散文件

不适用场景：

- 纯分析
- 只改前后端代码，不改内容真源
- 直接编写功法技能本身；那类任务优先用 `technique-skill-generator`

## 真源与生成物

真源：

- `packages/server/data/content/techniques/`
- `packages/server/data/content/items/`
- `packages/server/data/content/monsters/`

生成物，不要手改：

- `packages/client/src/constants/world/editor-catalog.generated.json`

## 选脚本规则

### 1. 功法目录整理

当功法文件增删、重排、搬目录、改品阶或改分类后，优先执行：

```bash
pnpm organize:techniques
```

对应脚本：

- `scripts/organize-techniques.mjs`

### 2. 练气期功法书与怪物掉落同步

当练气期功法、功法书、功法书掉落分配需要回填时，执行：

```bash
pnpm sync:technique-books
```

对应脚本：

- `scripts/sync-technique-books.mjs`

### 3. 练气期装备与丹药来源同步

当练气期装备、消耗品、怪物掉落来源联动需要回填时，执行：

```bash
pnpm sync:qi-items
```

对应脚本：

- `scripts/sync-qi-item-sources.mjs`

### 4. 编辑器目录生成

当内容改动需要让编辑器或客户端可见目录刷新时，执行最小必要生成：

```bash
pnpm generate:editor-catalog
```

对应脚本：

- `scripts/generate-editor-catalog.mjs`

只改旧客户端就只跑旧客户端目录，只改 next 就只跑 next；两边都受影响时再都跑。
当前分支只维护 `packages/client`，不再处理已移除的另一套客户端目录生成。

## 强制流程

1. 先确认你改的是哪类真源内容。
2. 只跑与这次改动直接相关的最小脚本集合。
3. 不要手改任何 `*.generated.json`。
4. 跑完后检查 diff 是否只落在预期生成物与被同步的真源文件。
5. 最后执行最小验证；默认可用 `pnpm build`。

## 交付时必须说明

- 这次跑了哪些同步脚本
- 哪些文件是生成物，哪些是真源
- 是否执行了 `pnpm build`
