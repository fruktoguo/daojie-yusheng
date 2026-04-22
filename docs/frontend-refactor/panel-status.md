# 面板与弹层状态表

这份文档按“渲染方式 / 交互连续性 / 当前问题”来记录 `packages/client` 主要 UI 模块。

状态标签说明：

- `A`
  - 已明显 patch-first，固定壳体 + 局部更新
- `B`
  - 已有局部 patch，但仍混有大段局部重刷
- `C`
  - 仍以模板重建为主

## 主面板

| 模块 | 文件 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 属性 | `ui/panels/attr-panel.ts` | `C` | 仍以大段 `innerHTML` 重建为主 |
| 背包 | `ui/panels/inventory-panel.ts` | `A` | 已有固定壳体、列表 patch、modal patch |
| 装备 | `ui/panels/equipment-panel.ts` | `C` | 面板主体仍偏整块重建 |
| 功法 | `ui/panels/technique-panel.ts` | `A` | 已有 `ensureShell / patchList / patchModal` |
| 炼体 | `ui/panels/body-training-panel.ts` | `A-` | 主体结构已稳定，modal 仍有局部重装 |
| 任务 | `ui/panels/quest-panel.ts` | `A` | 列表与 modal 已拆 patch 路径 |
| 坊市 | `ui/panels/market-panel.ts` | `C/B-` | 面板主体和书册/交易区仍有明显 `innerHTML` |
| 行动 | `ui/panels/action-panel.ts` | `C` | 主面板与部分 modal 仍模板重建为主 |
| 拾取 | `ui/panels/loot-panel.ts` | `B` | modal 入口统一，但主体仍偏模板生成 |
| 设置 | `ui/panels/settings-panel.ts` | `B` | 弹层骨架统一，但兑换结果区仍直接写 `innerHTML` |
| 世界 | `ui/panels/world-panel.ts` | `C` | 三个区域仍以大块 HTML 重建 |
| GM 面板 | `ui/panels/gm-panel.ts` | `C` | 仍是典型拼接式模板 |

## 非主面板 UI

| 模块 | 文件 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 邮件 | `ui/mail-panel.ts` | `A` | 已做列表/详情 patch、节点复用 |
| 建议反馈 | `ui/suggestion-panel.ts` | `B` | 有 patchBody，但线程/列表仍直接重刷 |
| 教程 | `ui/tutorial-panel.ts` | `B` | 布局已接公共壳体，但主体仍模板化 |
| NPC 商店 | `ui/npc-shop-modal.ts` | `B` | 已有 patchBody，但列表/详情仍整块写入 |
| NPC 任务 | `ui/npc-quest-modal.ts` | `B` | 已有 patchBody，但列表/详情仍整块写入 |
| 小地图 | `ui/minimap.ts` | `B/C` | 局部节点 patch 存在，但仍混有模板型弹层 |
| 实体详情 | `ui/entity-detail-modal.ts` | `C` | 仍走一次性 bodyHtml |
| 天门 | `ui/heaven-gate-modal.ts` | `C` | 结构完整但仍主要依赖重渲染 |
| 更新日志 | `ui/changelog-panel.ts` | `C` | 低频内容，仍走模板化装载 |

## 当前最稳的 patch-first 基座

后续前端重构应优先复用这些模块里的做法：

- `inventory-panel.ts`
- `quest-panel.ts`
- `technique-panel.ts`
- `body-training-panel.ts`
- `mail-panel.ts`

它们已经覆盖了几种关键模式：

- 固定 section 壳体
- filter / subtab 局部更新
- 列表节点复用
- detail modal 局部 patch
- `preserveSelection` 保护交互连续性

## 当前最值得继续改的模块

按收益排序，最值得继续改的是：

1. `market-panel.ts`
2. `action-panel.ts`
3. `world-panel.ts`
4. `suggestion-panel.ts`
5. `npc-shop-modal.ts`
6. `npc-quest-modal.ts`

原因：

- 使用频率高
- 模板重建仍明显
- 一旦 patch-first 化，对交互连续性和样式 recipe 压缩收益都很大
