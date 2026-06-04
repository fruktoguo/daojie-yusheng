# 宗门系统

## 核心常量

源文件: `packages/server/src/runtime/world/world-runtime-sect.service.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| SECT_BASE_CLEAR_RADIUS | 1 | 基础清理半径 |
| SECT_FOUNDING_CLEAR_RADIUS | 2 | 建宗清理半径 |
| SECT_ENTRANCE_INTERACTION_RADIUS | 2 | 入口交互半径 |
| SECT_INITIAL_STONE_MARGIN | 1 | 初始石材边距 |
| SECT_EXPAND_CHUNK | 8 | 扩展块大小 |
| SECT_INNATE_STABILIZER_RADIUS | 8 | 固有稳定器半径 |
| SECT_GUARDIAN_INITIAL_AURA | 100000 | 护宗大阵初始灵力 |

## 宗门角色与权限

源文件: `packages/shared/src/sect-types.ts`

### 角色

| 角色 | 中文 |
|------|------|
| leader | 宗主 |
| deputy | 副宗主 |
| elder | 长老 |
| inner | 内门弟子 |
| outer | 外门弟子 |
| labor | 杂役 |
| supreme_elder | 太上长老 |

### 权限

| 权限 | 说明 |
|------|------|
| guardian | 护宗大阵操作 |
| member_remove | 移除成员 |
| member_role | 修改职位 |

### 默认权限分配

- leader/deputy: 全部权限
- elder/supreme_elder: 仅 guardian
- inner/outer/labor: 无权限

## 宗门状态

```typescript
SectStatus = 'active' | 'dissolved' | 'locked'
```

## 宗门功能

- 建宗: 在指定位置创建宗门领地
- 宗门地图: 独立持久实例，非虚境完整权限，允许 PVP、地块攻击和阵法相关玩法
- 扩展: 通过击败地块扩展领地
- 护宗大阵: 初始灵力 100000，提供边界屏障
- 成员管理: 邀请/移除/职位变更
