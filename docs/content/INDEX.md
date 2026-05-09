# 内容生产指南索引

本目录是内容填充手册，指导如何添加怪物、技能、地图、物品等游戏内容。

## 内容类型

| 类型 | 指南 | 配置位置 |
|------|------|----------|
| 怪物 | [monsters](monsters.md) | `packages/server/data/content/monsters/` |
| 物品 | [items](items.md) | `packages/server/data/content/items/` |
| 技能/功法 | [skills](skills.md) | `packages/server/data/content/techniques/` |
| 地图 | [maps](maps.md) | `packages/server/data/maps/` |

## 使用说明

- 新增内容指南时复制 `template.md`
- 指南描述"怎么添加内容"，不是内容本身
- 内容配置文件在 `packages/server/data/` 和 `packages/client/src/content/`

## 内容目录结构

```
packages/server/data/
├── content/
│   ├── monsters/          # 怪物配置（按地图分文件）
│   ├── items/             # 物品配置（按境界和类型分目录）
│   ├── techniques/        # 功法和技能配置
│   ├── alchemy/           # 炼丹配方
│   ├── forging/           # 炼器配方
│   ├── quests/            # 任务配置
│   └── ...
└── maps/                  # 地图配置
    ├── *.json             # 单体地图
    └── compose/           # 组合地图
```

## 验证流程

添加内容后的标准验证：

```bash
# 1. 构建服务端（校验配置格式）
pnpm build:server

# 2. 启动开发服务器（检查加载）
pnpm --filter @mud/server start:dev

# 3. 在游戏中测试
# 使用 GM 工具验证内容是否正确加载
```
