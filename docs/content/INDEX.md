# 内容生产指南索引

## 内容类型

| 类型 | 指南 | 配置位置 |
|------|------|----------|
| 怪物 | [monsters](monsters.md) | `data/content/monsters/` |
| 物品 | [items](items.md) | `data/content/items/` |
| 技能/功法 | [skills](skills.md) | `data/content/techniques/` |
| 地图 | [maps](maps.md) | `data/maps/` |
| 炼丹 | [alchemy](alchemy.md) | `data/content/alchemy/` |
| 炼器 | [forging](forging.md) | `data/content/forging/` |
| 任务 | [quests](quests.md) | `data/content/quests/` |
| NPC | [npcs](npcs.md) | 嵌入地图配置 |

以上路径均相对于 `packages/server/`。

## 约定

- 新增内容指南时复制 `template.md`
- 指南描述"怎么添加内容"，不是内容本身

## 通用验证流程

```bash
pnpm build:server                      # 校验配置格式
pnpm --filter @mud/server start:dev    # 检查加载
```
