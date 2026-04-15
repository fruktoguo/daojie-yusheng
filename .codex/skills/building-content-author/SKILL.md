---
name: building-content-author
description: Use this skill when creating or updating building content in this repo, including town blocks, house/interior maps, compose submaps, building-linked portals, landmarks, NPC anchors, and architecture layout data stored in map JSON.
---

# 建筑内容编写

这个 skill 用于直接编写正式建筑内容。当前仓库没有独立 `buildings/` 真源，建筑内容落在地图 JSON 与 compose 子图里。

适用场景：

- 新增城镇建筑、院落、铺面、塔楼、地窖、室内层
- 调整某片街区、建筑群或单栋房屋布局
- 新增或修改建筑入口、楼梯、室内外传送
- 修正建筑相关的 `landmarks`、`npcs`、`resources`、`safeZones`

## 真源位置

建筑正式真源：

- `legacy/server/data/maps/*.json`
- `legacy/server/data/maps/compose/**/*.json`

常用参考：

- 同区域相邻地图与同主题建筑子图
- `docs/story/凡人/yunlai-town-layout.md`
- `docs/story/凡人/fanren-map-redesign.md`
- `legacy/shared/src/map-document.ts`

## 强制流程

1. 先定位目标是主地图区块、独立室内图，还是 compose 建筑子图。
2. 至少阅读同城镇、同区域、同功能的相邻地图或子图样例。
3. 先改 `tiles`，并检查每一行长度都等于 `width`、总行数等于 `height`。
4. 再按需要补改 `portals`、`spawnPoint`、`landmarks`、`npcs`、`resources`、`safeZones`。
5. 检查所有坐标都在地图范围内，所有 `targetMapId`、NPC id、地标引用都有效。
6. 最后执行 `pnpm build`。

## 硬规则

- 不要在地图文件里发明新字段或未验证的地形字符；先复用现有图例与结构。
- 室内外出入口、楼梯和门洞必须双向检查，避免落点越界、落到阻挡格或制造死链。
- 没有明确需求时，不顺手改整座城或整批建筑。
- 建筑命名、密度、朝向、材质感要和所属区域设计稿保持一致，不要单栋风格跑偏。
- 如果建筑承担 NPC、任务、容器、资源点功能，必须同时检查这些点位和相关引用是否仍成立。
- `routeDomain`、`terrainProfileId`、时间与光照参数优先沿用同区域样例，没有明确需求不要乱改。

## 交付时必须说明

- 改了哪张地图、哪几个建筑或子图
- 是否涉及传送点、NPC、地标或资源点联动
- 是否检查了坐标、门洞和跨图落点
- 是否执行了 `pnpm build`
