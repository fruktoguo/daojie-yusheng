# 08 shared 与内容地图收口

目标：把 shared、内容、地图的真源和一致性都压稳。

## 当前基线

shared 当前核心文件体积：

- `packages/shared/src/protocol.ts`
  - `363` 行
- `packages/shared/src/types.ts`
  - `195` 行
- `packages/shared/src/network-protobuf.ts`
  - `79` 行
- `packages/shared/src/network-protobuf-schema.ts`
  - `323` 行
- `packages/shared/src/network-protobuf-wire-helpers.ts`
  - `223` 行
- `packages/shared/src/network-protobuf-payload-codecs.ts`
  - `18` 行
- `packages/shared/src/network-protobuf-tick-codecs.ts`
  - `256` 行
- `packages/shared/src/network-protobuf-update-codecs.ts`
  - `271` 行
- `packages/shared/src/crafting-types.ts`
  - `187` 行
- `packages/shared/src/market-types.ts`
  - `68` 行
- `packages/shared/src/mail-types.ts`
  - `63` 行
- `packages/shared/src/automation-types.ts`
  - `49` 行
- `packages/shared/src/action-combat-types.ts`
  - `59` 行
- `packages/shared/src/quest-types.ts`
  - `76` 行
- `packages/shared/src/attr-detail-types.ts`
  - `17` 行
- `packages/shared/src/entity-detail-types.ts`
  - `96` 行
- `packages/shared/src/synced-panel-types.ts`
  - `177` 行
- `packages/shared/src/world-patch-types.ts`
  - `170` 行
- `packages/shared/src/panel-update-types.ts`
  - `138` 行
- `packages/shared/src/item-runtime-types.ts`
  - `190` 行
- `packages/shared/src/cultivation-types.ts`
  - `110` 行
- `packages/shared/src/skill-types.ts`
  - `176` 行
- `packages/shared/src/world-core-types.ts`
  - `234` 行
- `packages/shared/src/player-runtime-types.ts`
  - `87` 行
- `packages/shared/src/world-view-types.ts`
  - `108` 行
- `packages/shared/src/loot-view-types.ts`
  - `60` 行
- `packages/shared/src/observation-types.ts`
  - `18` 行
- `packages/shared/src/progression-view-types.ts`
  - `38` 行
- `packages/shared/src/detail-view-types.ts`
  - `38` 行
- `packages/shared/src/leaderboard-types.ts`
  - `89` 行
- `packages/shared/src/session-sync-types.ts`
  - `93` 行
- `packages/shared/src/notice-types.ts`
  - `34` 行
- `packages/shared/src/gm-runtime-types.ts`
  - `123` 行
- `packages/shared/src/service-sync-types.ts`
  - `170` 行
- `packages/shared/src/client-core-request-types.ts`
  - `106` 行
- `packages/shared/src/client-service-request-types.ts`
  - `237` 行
- `packages/shared/src/client-social-admin-request-types.ts`
  - `64` 行
- `packages/shared/src/attribute-types.ts`
  - `21` 行
- `packages/shared/src/protocol-envelope-types.ts`
  - `37` 行
- `packages/shared/src/protocol-request-payload-types.ts`
  - `229` 行
- `packages/shared/src/protocol-response-payload-types.ts`
  - `231` 行

shared 当前已有护栏：

- `check-network-protobuf-contract.cjs`
- `check-numeric-stats.cjs`
- `check-protocol-event-maps.cjs`
- `check-protocol-payload-shapes.cjs`

shared 当前默认门禁入口：

- `packages/shared/package.json -> build`
  - 依次执行 `tsc`
  - `check-numeric-stats`
  - `check-protocol-event-maps`
  - `check-protocol-payload-shapes`
  - `check-network-protobuf-contract`
- `packages/server/package.json -> compile`
  - 默认先跑 `pnpm --filter @mud/shared-next build`
- `packages/client/package.json -> prebuild`
  - 默认先跑 `pnpm --filter @mud/shared-next build`
- 根级 `pnpm build`
  - 会经过 `client-next build`
  - 会经过 `server-next compile`
- 根级 `pnpm verify:replace-ready`
  - 会经过 `build:client-next`
  - 会经过 `@mud/server-next verify:replace-ready -> compile`
  - 因此 shared 四道检查默认都会参与 local / with-db gate

内容与地图当前真源目录：

- 内容
  - `/packages/server/data/content/alchemy/recipes.json`
  - `/packages/server/data/content/items/*`
  - `/packages/server/data/content/monsters/*`
  - `/packages/server/data/content/quests/*`
  - `/packages/server/data/content/techniques/*`
  - `/packages/server/data/content/technique-buffs/*`
  - `/packages/server/data/content/enhancements/*`
  - `breakthroughs.json`
  - `realm-levels.json`
  - `resource-nodes.json`
  - `starter-inventory.json`
- 地图
  - `/packages/server/data/maps/*.json`
  - `/packages/server/data/maps/compose/*`

客户端当前可见的 generated / editor 辅助数据：

- `packages/client/src/content/editor-catalog.ts`
- `packages/client/src/constants/world/item-sources.generated.json`
- `packages/client/src/constants/world/monster-locations.generated.json`
- `packages/client/dist/assets/world-editor-catalog-*.js`

## 任务

- [x] 继续整理 `packages/shared/src/protocol.ts`
- [x] 继续整理 `packages/shared/src/types.ts`
- [x] 继续整理 `packages/shared/src/network-protobuf.ts`
- [x] 给新增协议字段补一致性检查
- [x] 给新增数值字段补完整性检查
- [x] 确保 shared 变更默认受 audit / check 保护
- [x] 重新标注哪些 `packages/server/data/content/*` 是玩法真源
- [x] 重新标注哪些数据是编辑器辅助产物
- [x] 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- [x] 检查 compose 地图结构规范
- [x] 检查室内地图规范
- [x] 检查传送点规范
- [x] 检查 NPC 锚点规范
- [x] 决定哪些客户端 generated 数据继续保留
- [x] 决定哪些客户端 generated 数据可以删掉或重做

## 执行顺序

### 第 1 批：先把 shared 分层固定

- [x] `protocol.ts`
  - 只负责事件、payload、合同层
- [x] `types.ts`
  - 只负责通用共享结构，不继续变成第二份协议文件
- [x] `network-protobuf.ts`
  - 只负责 wire event / protobuf 映射

当前进展：

- 已新增 `packages/shared/src/api-contracts.ts`
  - 把账号、GM、数据库、地图管理、邮件等 HTTP / GM API 合同从 `protocol.ts` 中拆出
- `packages/shared/src/protocol.ts`
  - 当前已去掉一大段非 socket 的 HTTP / GM API 合同
  - 保留 next 事件名、socket payload、事件映射，以及当前仍被 socket 区直接依赖的少量共享类型
  - 本轮已把 `mail / market / crafting / world-view` 相关类型改成直接从各自小文件导入，不再全部经 `types.ts` 总入口转发
- `packages/shared/src/index.ts`
  - 已显式导出 `api-contracts.ts`
- `packages/shared/src/map-document.ts`
  - 已切到 `api-contracts.ts` 读取 GM 地图文档相关合同，不再反向依赖 `protocol.ts` 的地图管理接口
- 已新增 `packages/shared/src/network-protobuf-schema.ts`
  - 把 protobuf schema 文本、`lookupType` 常量和 protobuf 事件白名单从 `network-protobuf.ts` 中拆出
- `packages/shared/src/network-protobuf.ts`
  - 当前已经压到“事件级 wire encode/decode 映射”为主，不再同时承担 schema 常量层
- 已新增 `packages/shared/src/network-protobuf-wire-helpers.ts`
  - 承接 binary normalize、nullable 字段、基础属性/数值/地块/时间等通用 wire helper
- 已新增 `packages/shared/src/network-protobuf-payload-codecs.ts`
  - 承接 `tick / technique update / actions update / attr update` 的 payload codec 细节
- 已新增 `packages/shared/src/network-protobuf-tick-codecs.ts`
  - 承接 `tick` 高频实体补丁与 tick payload 的 codec 细节
- 已新增 `packages/shared/src/network-protobuf-update-codecs.ts`
  - 承接 `technique / actions / attr` 这类 update payload 的 codec 细节
- `packages/shared/scripts/check-network-protobuf-contract.cjs`
  - 已切到 `network-protobuf-schema.ts` 校验 schema、lookup type 与事件白名单
- `packages/shared/scripts/check-numeric-stats.cjs`
  - 已切到 `network-protobuf-schema.ts` 校验 `NumericStatsPayload / NumericRatioDivisorsPayload / ElementStatGroupPayload`
- `packages/shared/scripts/check-protocol-payload-shapes.cjs`
  - 已补成基于 TypeScript type-checker 读取协议接口实际属性，支持跨文件 `extends` 后继续校验 payload shape
- `packages/shared/src/network-protobuf.ts`
  - 本轮已压成更薄的入口聚合层，主文件只保留白名单导出、binary 判断与 encode/decode 入口
- `packages/shared/src/network-protobuf-payload-codecs.ts`
  - 本轮已压成更薄的 codec 聚合层，内部再按 `tick` 与 `update` 分层
- 已新增 `packages/shared/src/crafting-types.ts`
  - 把 `alchemy / enhancement` 的面板态、任务态和候选视图从 `types.ts` 中拆出
- 已新增 `packages/shared/src/market-types.ts`
  - 把 `market storage / listing / order book / trade history / own order` 从 `types.ts` 中拆出
- 已新增 `packages/shared/src/mail-types.ts`
  - 把 `mail summary / page / detail / attachment / template arg` 从 `types.ts` 中拆出
- 已新增 `packages/shared/src/automation-types.ts`
  - 把 `auto battle / auto pill / combat targeting` 这类自动化配置从 `types.ts` 中拆出
- 已新增 `packages/shared/src/action-combat-types.ts`
  - 把 `action / combat effect` 这类行动与战斗表现定义从 `types.ts` 中拆出
- 已新增 `packages/shared/src/quest-types.ts`
  - 把 `quest state / navigation / pending logbook` 这类任务相关结构从 `types.ts` 中拆出
- `packages/shared/src/types.ts`
  - 当前保留基础世界结构和 `PlayerState` 聚合口
  - 通过 type re-export 继续兼容既有 `from './types'` 消费点
- `packages/shared/src/mail.ts`
  - 已切到直接依赖 `mail-types.ts`
- 已新增 `packages/shared/src/world-view-types.ts`
  - 把 `map minimap / npc-shop / suggestion` 这类共享视图结构从 `types.ts` 中拆出
- 已新增 `packages/shared/src/loot-view-types.ts`
  - 把 `ground item / loot search / loot window` 这类拾取共享视图从 `types.ts` 中拆出
- 已新增 `packages/shared/src/observation-types.ts`
  - 把 `ObservationLine / ObservationClarity / ObservationInsight` 从 `types.ts` 中拆出
- 已新增 `packages/shared/src/progression-view-types.ts`
  - 把 `BreakthroughItemRequirement / BreakthroughRequirementView / BreakthroughPreviewState` 从 `types.ts` 中拆出
- 已新增 `packages/shared/src/detail-view-types.ts`
  - 把 `ObservationLootPreview / ObservedTileEntityDetail` 这类详情投影视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/leaderboard-types.ts`
  - 把 `leaderboard / world summary` 这类低频统计投影视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/attr-detail-types.ts`
  - 把 `AttrDetail` 低频详情投影从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/entity-detail-types.ts`
  - 把 `portal / ground / container / npc / monster / player / tile detail` 这类低频详情投影视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/synced-panel-types.ts`
  - 把 `synced item / inventory snapshot / loot window / market sync / npc shop sync` 这类低频面板同步视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/world-patch-types.ts`
  - 把 `tick entity / visible tile patch / ground item pile patch / world delta / self delta / tick view` 这类高频世界 patch 视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/panel-update-types.ts`
  - 把 `attr update / technique entry / action entry / panel technique/action/attr/buff delta` 这类面板局部更新视图从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/item-runtime-types.ts`
  - 把 `item / inventory / equipment / consumable buff / equipment effect` 这类物品运行时结构从 `types.ts` 中拆出
- 已新增 `packages/shared/src/cultivation-types.ts`
  - 把 `technique realm / player realm / heaven gate / technique state / body training` 这类修炼骨架从 `types.ts` 中拆出
- 已新增 `packages/shared/src/skill-types.ts`
  - 把 `skill formula / skill effect / temporary buff / monster initial buff` 这类技能与 Buff 结构从 `types.ts` 中拆出
- 已新增 `packages/shared/src/world-core-types.ts`
  - 把 `tile / direction / portal / render entity / visible buff / map time / game time` 这类世界基础结构从 `types.ts` 中拆出
- 已新增 `packages/shared/src/player-runtime-types.ts`
  - 把 `PlayerState` 聚合口从 `types.ts` 中拆出，独立承接玩家运行时聚合态
- 已新增 `packages/shared/src/session-sync-types.ts`
  - 把 `bootstrap / init session / map enter / map static / init / realm / pong / quest navigate` 这类会话同步合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/notice-types.ts`
  - 把 `notice item / notice batch / system msg` 这类通知合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/gm-runtime-types.ts`
  - 把 `GM player summary / perf snapshot / CPU/pathfinding/tick/network` 这类 GM 运行统计合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/service-sync-types.ts`
  - 把 `inventory/equipment update / market / npc shop / alchemy / enhancement / tile runtime / mail / suggestion` 这类低频服务同步合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/client-core-request-types.ts`
  - 把 `hello / move / heartbeat / ping / action / auto-battle / chat / heaven-gate` 这类核心请求合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/client-service-request-types.ts`
  - 把 `market / mail / npc / alchemy / enhancement / item / cultivate / cast-skill` 这类业务请求合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/client-social-admin-request-types.ts`
  - 把 `GM 请求 / 建议系统请求` 这类社交与管理请求合同从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/attribute-types.ts`
  - 把 `AttrKey / Attributes / NumericStatPercentages / AttrBonus` 这类属性骨架从 `types.ts` 中拆出
- `packages/shared/src/types.ts`
  - 当前主要保留基础属性、数值键与少量通用共享结构
  - 大块世界结构和 `PlayerState` 聚合口都已外移，只继续通过 re-export 兼容旧引用
- `packages/shared/src/protocol.ts`
  - 本轮已把 `loot` 相关类型改成直接从 `loot-view-types.ts` 导入，继续缩小对 `types.ts` 总入口的依赖面
- `packages/shared/src/protocol.ts`
  - 本轮已把 `leaderboard / world summary` 相关低频投影视图改成直接从 `leaderboard-types.ts` 导入，不再内联定义
- `packages/shared/src/protocol.ts`
  - 本轮已把 `AttrDetail` 低频详情投影改成直接从 `attr-detail-types.ts` 导入，保留协议事件名与 payload 包装不变
- `packages/shared/src/protocol.ts`
  - 本轮已把实体与地块详情投影视图改成直接从 `entity-detail-types.ts` 导入，不再内联定义
- `packages/shared/src/protocol.ts`
  - 本轮已把 `synced item / loot window / market sync / npc shop sync` 相关面板视图改成直接从 `synced-panel-types.ts` 导入，不再内联定义
- `packages/shared/src/protocol.ts`
  - 本轮已把 `tick / self delta / world delta / visible tile patch / ground item pile patch` 这类高频世界 patch 视图改成直接从 `world-patch-types.ts` 导入，不再内联定义
- `packages/shared/src/protocol.ts`
  - 本轮已把 `attr update / technique entry / action entry / panel delta` 这类局部更新视图改成直接从 `panel-update-types.ts` 导入，不再内联定义
- `packages/shared/src/network-protobuf.ts`
  - 本轮已把 `ObservationInsight` 改成直接从 `observation-types.ts` 导入，不再经 `types.ts` 转发
- `packages/shared/src/network-protobuf-tick-codecs.ts`
  - 本轮已切到直接依赖 `world-patch-types.ts`，不再经 `protocol.ts` 引入 `tick` patch 视图
- `packages/shared/src/network-protobuf-update-codecs.ts`
  - 本轮已切到直接依赖 `panel-update-types.ts`，不再经 `protocol.ts` 引入局部更新条目视图
- `packages/shared/src/panel-update-types.ts / synced-panel-types.ts / loot-view-types.ts / market-types.ts / crafting-types.ts`
  - 本轮已开始直接依赖 `cultivation-types.ts / item-runtime-types.ts / skill-types.ts`，继续缩小对 `types.ts` 总入口的依赖面
- `packages/shared/src/network-protobuf-tick-codecs.ts / network-protobuf-update-codecs.ts / protocol.ts / technique.ts / numeric.ts`
  - 本轮已把一批 `Technique* / PlayerRealm* / Item* / Skill*` 依赖改成直连新小文件，不再全部经 `types.ts` 聚合口转发
- `packages/shared/src/protocol.ts / api-contracts.ts / world-patch-types.ts / network-protobuf-wire-helpers.ts`
  - 本轮已开始直接依赖 `world-core-types.ts / player-runtime-types.ts`，不再继续从 `types.ts` 吞世界基础结构与 `PlayerState`
- `packages/shared/src/protocol.ts`
  - 本轮已把 `bootstrap / map static / init / GM state / error / market / mail / NPC shop / tile runtime / suggestion` 这类低频合同切到 `session-sync-types.ts / notice-types.ts / gm-runtime-types.ts / service-sync-types.ts`
- `packages/shared/src/protocol.ts`
  - 本轮还顺手清掉了重复的 `RedeemCodesResult / LootWindowUpdate / QuestNavigateResult / GmState` 接口定义，避免继续靠 interface merge 维持
- `packages/shared/src/protocol.ts`
  - 本轮已把绝大多数 `NEXT_C2S` 请求合同切到 `client-core-request-types.ts / client-service-request-types.ts / client-social-admin-request-types.ts`，协议文件继续收成事件包装层
- `packages/shared/src/protocol.ts / numeric.ts / skill-types.ts / world-core-types.ts / panel-update-types.ts / player-runtime-types.ts / value.ts`
  - 本轮已开始直接依赖 `attribute-types.ts`，继续减少 shared 内部对 `types.ts` 的真实依赖
- 已新增 `packages/shared/src/protocol-envelope-types.ts`
  - 把 `RealmUpdate / Leaderboard / WorldSummary` 这类不会再嵌套 `NEXT_S2C_*` 包装的低频协议壳从 `protocol.ts` 中拆出
- 已新增 `packages/shared/src/protocol-request-payload-types.ts`
  - 把绝大多数 `NEXT_C2S_*` 请求包装接口从 `protocol.ts` 中整体拆出
- 已新增 `packages/shared/src/protocol-response-payload-types.ts`
  - 把 `LootWindow / QuestNavigate / GmState / Session / Notice / WorldDelta / Tick / Inventory / Market / Quest / Mail / Suggestion` 这类非守卫核心的 `NEXT_S2C_*` 包装接口从 `protocol.ts` 中整体拆出
- `packages/shared/src/client-service-request-types.ts / client-social-admin-request-types.ts`
  - 本轮已补齐 `requestMarket / requestMailSummary / requestQuests / requestAttrDetail / requestWorldSummary / claimMarketStorage / cancelAlchemy / requestEnhancementPanel / cancelEnhancement / sortInventory / requestSuggestions` 这批空载荷请求视图，不再继续留在 `protocol.ts` 做空接口占位
- `packages/shared/src/api-contracts.ts / map-document.ts / monster.ts / technique.ts / combat.ts / direction.ts / terrain.ts / path-codec.ts / item-stack.ts / value.ts`
  - 本轮已全部改成直连各自职责文件，不再从 `types.ts` 总入口回捞
- `packages/shared/src`
  - 现在已经没有任何真实 `from './types'` 消费，内部只剩 `index.ts` 保留兼容导出
- `packages/shared/src/protocol.ts`
  - 当前只剩事件常量、事件名联合、payload map，以及 shared 守卫强依赖的少数本地包装壳
- `packages/shared/scripts/check-network-protobuf-contract.cjs`
  - 当前会显式要求 `NEXT_S2C_Tick / NEXT_S2C_AttrUpdate / NEXT_S2C_TechniqueUpdate / NEXT_S2C_ActionsUpdate` 继续留在 `protocol.ts`，因此这四个 helper 接口本轮保留为主文件本地壳
- 已新增 `packages/shared/scripts/check-shared-entry-boundaries.cjs`
  - 当前会显式要求：
    - `protocol.ts` 只能保留 `NEXT_C2S / NEXT_S2C` 常量、接口、类型和导出声明
    - `types.ts` 只能保留纯兼容 re-export，不允许重新长回本地类型定义
    - `network-protobuf.ts` 只能保留 4 个入口函数与聚合导出，不允许重新塞回 schema 常量或大段 codec 细节
- `packages/shared/src/types.ts`
  - 本轮已压成纯兼容 re-export barrel，不再保留任何本地类型定义或中间 import 聚合逻辑
- `packages/shared/src/protocol-response-payload-types.ts`
  - 本轮已继续承接 `NpcShop / portal-ground-container-npc-monster-player detail / TileDetail` 这批此前仍留在主文件里的非守卫详情壳
- `packages/shared/src/protocol.ts`
  - 当前只剩 `14` 个 `NEXT_*` 本地接口，已经进一步逼近“守卫接口 + payload map”入口层
- `packages/shared/src/protocol.ts`
  - 本轮已把 payload map 统一切成 `RequestPayloads.* / ResponsePayloads.*` 命名空间引用，主文件不再维持大段逐项 payload 导入
- `packages/client/src/constants/world/editor-catalog.generated.json`
  - 当前已确认需要继续保留，原因不是玩法运行时依赖，而是客户端本地编辑目录 fallback 与预览补齐链仍在消费
- `packages/client/src/content/editor-catalog.ts / content/local-templates.ts`
  - 当前已明确口径：只作为 GM `/api/gm/editor-catalog` 失败时的本地 fallback 与预览辅助视图，不是玩法真源
- `packages/client/src/constants/world/item-sources.generated.json`
  - 当前已确认需要继续保留，原因是 `content/item-sources.ts` 仍在运行时按需加载，供背包/装备 tooltip 与来源说明链路使用
- `packages/client/src/constants/world/monster-locations.generated.json`
  - 当前已确认需要继续保留，原因是 `content/monster-locations.ts` 与 `next/primitives/UiInlineReferenceText.tsx` 仍在运行时按需加载，供怪物地点参考文本链路使用
- `packages/client/dist/assets/world-editor-catalog-*.js`
  - 当前口径已明确为构建产物，不作为“是否保留 generated 真源”的决策对象

当前结论：

- `protocol.ts` 里最明显的一块“HTTP / GM API 合同混入 socket 协议文件”的职责混杂，已经开始实拆，不再只是文档计划
- `network-protobuf.ts` 目前已经完成第一步真实收口：schema 常量层与 wire 映射层不再混在同一个文件里
- `network-protobuf.ts` 目前已经完成第二步真实收口：通用 wire helper 与 payload codec 细节也已下沉到独立文件
- `network-protobuf.ts` 目前已经完成第三步真实收口：payload codec 已继续拆成 `tick` 与 `update` 两层，主入口和 codec 聚合都已明显变薄
- `types.ts` 目前已经完成第一步真实收口：`crafting / market / mail` 三块明显偏领域合同的结构已经外移
- `types.ts` 目前已经完成第二步真实收口：`minimap / npc-shop / suggestion` 这类共享视图结构也已外移
- `protocol.ts` 目前已经完成第一步 import 面收口：拆出的领域类型不再全部从 `types.ts` 总入口集中导入
- `types.ts` 目前已经完成第三步真实收口：`loot` 相关共享视图也已外移
- `types.ts` 目前已经完成第四步真实收口：`observation / breakthrough preview` 这类显示型结构也已外移
- `types.ts` 目前已经完成第五步真实收口：`quest / automation / action-combat` 三组明显非基础骨架结构也已外移
- `types.ts` 目前已经完成第六步真实收口：`item / inventory / equipment / consumable buff / equipment effect` 这一整组运行时结构也已外移
- `types.ts` 目前已经完成第七步真实收口：`technique / player realm / heaven gate / skill / temporary buff` 这一整组修炼骨架也已外移
- `types.ts` 目前已经完成第八步真实收口：`tile / direction / portal / render entity / visible buff / map time / game time` 这一整组世界基础结构也已外移
- `types.ts` 目前已经完成第九步真实收口：`PlayerState` 聚合口也已外移到独立文件
- `protocol.ts` 目前已经完成第二步 import 面收口：详情投影视图与观察结构已开始直连各自小文件
- `protocol.ts` 目前已经完成第三步 import 面收口：排行榜与世界汇总这类低频统计投影也已直连独立小文件
- `protocol.ts` 目前已经完成第四步 import 面收口：`AttrDetail` 这类按需属性详情也已直连独立小文件
- `protocol.ts` 目前已经完成第五步 import 面收口：实体与地块详情投影也已直连独立小文件
- `protocol.ts` 目前已经完成第六步 import 面收口：低频面板同步视图也已继续外移，协议层更接近只保留事件包装与合同边界
- `protocol.ts` 目前已经完成第七步 import 面收口：高频世界 patch 视图也已外移，`tick / world delta / self delta` 与局部 patch 不再大段内联
- `protocol.ts` 目前已经完成第八步 import 面收口：面板局部更新与面板增量壳也已外移，协议层进一步收成事件包装与 payload 合同边界
- `protocol.ts` 目前已经完成第九步 import 面收口：会话同步、通知、GM 运行统计与大批低频服务同步合同也已外移，协议层主体明显压薄
- `protocol.ts` 目前已经完成第十步 import 面收口：绝大多数 `NEXT_C2S` 请求合同也已外移，协议层主体进一步压到事件名、payload map 与少量最终包装壳
- `types.ts` 目前已经完成第十步真实收口：属性骨架也已外移，主文件继续朝纯兼容聚合口收缩
- `protocol.ts` 目前已经完成第十一步 import 面收口：低频统计与境界回包壳已继续外移，同时空载荷请求不再留在协议文件内占位
- `types.ts` 目前已经完成第十一步真实收口：shared 内部对 `types.ts` 的真实依赖已经清空，只剩兼容聚合导出职责
- `protocol.ts` 目前已经完成第十二步 import 面收口：请求包装与大部分响应包装已整体外移，主文件已经明显收成“事件常量 + payload map + 守卫接口”入口层
- `types.ts` 目前已经完成第十二步真实收口：主文件已经收成纯兼容转发口，职责只剩保留历史 `./types` 导入路径
- `protocol.ts` 目前已经完成第十三步 import 面收口：非守卫详情壳与 `NpcShop` 也已继续外移，主文件只保留真正被 shared 门禁点名要求的本地包装接口
- `protocol.ts` 目前已经完成第十四步 import 面收口：payload map 也已统一切成 request/response 命名空间引用，主文件进一步收成协议入口层
- `08` 第 1 批当前已正式关账：`protocol.ts / types.ts / network-protobuf.ts` 的职责边界已经收成目标形态，并且 boundary check 已接进 shared 默认 build，后续一旦职责回流会直接红门禁
- `08` 第 6 批目前已有明确结论：`editor-catalog / item-sources / monster-locations` 三类 generated 数据当前都需要继续保留，但定位都已收紧到 fallback、参考文本或预览辅助，不是玩法真源
- 后续如果还继续碰这三份文件，目标应该是协议演进或 protobuf 启用本身，而不是再次回到“把 shared 分层固定”这件事

禁止继续发生的事：

- 在客户端或服务端本地重复复制 shared 结构
- 用本地 alias 反向定义 shared 协议
- 把运行时派生字段偷偷塞回共享合同

最小验证：

- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm build`

### 第 2 批：把 shared 守卫补成默认门禁

- [x] 新增协议字段时必须同时过：
  - `check-protocol-event-maps`
  - `check-protocol-payload-shapes`
  - `check-network-protobuf-contract`
- [x] 新增数值字段时必须同时过：
  - `check-numeric-stats`
- [x] 明确哪些 shared 变更需要额外补 protocol audit

最小验证：

- `pnpm --filter @mud/server-next audit:next-protocol`
- `pnpm verify:replace-ready`

当前结论：

- `packages/shared/package.json -> build` 已把四道 shared 守卫接成默认检查链
- `packages/server/package.json -> compile` 与 `packages/client/package.json -> prebuild` 都会先跑 `@mud/shared-next build`
- 根级 `pnpm build`、`pnpm verify:replace-ready`、`pnpm verify:replace-ready:with-db` 都会隐式覆盖 shared 四道检查
- 这表示“新增协议字段 / 数值字段默认受 audit / check 保护”这一条当前已成立，不需要再额外补一套平行门禁

以下 shared 变更仍必须额外补 `pnpm --filter @mud/server-next audit:next-protocol`：

- 修改 `packages/shared/src/protocol.ts` 的事件名、payload 结构、事件归属层
- 修改 `packages/shared/src/network-protobuf.ts` 的 wire event、protobuf message、schema lookup 或编码映射
- 修改会影响 server/client 消费面的 `NEXT_C2S` / `NEXT_S2C` 契约
- 修改 bootstrap / map static / detail / world delta / self delta / panel delta 的分层边界
- 修改任何高频链路字段，尤其是 `WorldDelta` / `SelfDelta` / `PanelDelta`

以下 shared 变更可以以 `@mud/shared-next build` 为最小默认检查，再按需要补更高门禁：

- 纯类型整理，不改变事件合同
- 纯数值键补全或数值模板对齐
- 不改变 payload 形状的注释、命名整理、导出收口

### 第 3 批：把内容真源分类写死

- [x] 标出玩法真源：
  - items
  - monsters
  - quests
  - techniques
  - technique-buffs
  - alchemy
  - enhancements
  - breakthroughs
  - realm-levels
  - resource-nodes
  - starter-inventory
- [x] 标出编辑器辅助产物：
  - editor catalog
  - 客户端 generated 缓存
- [x] 不允许客户端 generated 数据反向成为服务端真源

当前分类结论：

- 服务端玩法真源固定为 `packages/server/data/content/*`
  - `items/*`：物品、装备、消耗品、材料等正式玩法定义
  - `monsters/*`：妖兽、掉落、技能等正式玩法定义
  - `quests/*`：主线/支线任务正式定义
  - `techniques/*`：功法、技能、修炼条目正式定义
  - `technique-buffs/*`：功法 Buff 模板正式定义
  - `alchemy/recipes.json`：炼丹配方正式定义
  - `enhancements/*`：强化规则正式定义
  - `breakthroughs.json`：突破配置正式定义
  - `realm-levels.json`：境界等级与 grade band 正式定义
  - `resource-nodes.json`：资源点正式定义
  - `starter-inventory.json`：初始背包正式定义
- 地图真源固定为 `packages/server/data/maps/*.json` 与 `packages/server/data/maps/compose/*`
- 客户端与 GM 可见的 editor/generated 数据都不是玩法真源，只能从服务端真源派生

编辑器辅助产物与 generated 缓存当前口径：

- `packages/client/src/constants/world/editor-catalog.generated.json`
  - 由 `scripts/generate-editor-catalog.mjs` 从 `packages/server/data/content/*` 生成
  - 属于客户端/GM 编辑器辅助缓存，不是内容真源
- `packages/client/src/content/editor-catalog.ts`
  - 当前已同时承接 `LOCAL_EDITOR_CATALOG` 静态快照导出与 GM / 编辑器读取适配，不是内容真源
- `packages/client/dist/assets/world-editor-catalog-*.js`
  - 只是构建产物，不是仓库内应维护的源文件，更不能反向定义玩法数据

强制约束：

- 任何客户端 generated 数据都不能反向作为服务端内容输入
- 任何编辑器目录缺失、落后或损坏，都应该回到 `packages/server/data/content/*` 重生，而不是直接改客户端 generated 产物
- GM `/api/gm/editor-catalog` 与客户端本地 editor catalog 都只能视作展示/编辑辅助视图，不是正式玩法真源

### 第 4 批：跑内容引用一致性清单

- [x] 任务 -> NPC / 地图 / 怪物 / 物品 / 功法引用
- [x] 怪物包 -> 地图 / 掉落 / 物品引用
- [x] 功法 -> skill / buff / 数值模板引用
- [x] 物品 -> 技能 / buff / 消耗效果 / 地图解锁引用
- [x] 炼丹 / 强化 -> 配方 / 材料 / 结果物品引用

这一步不要求顺手改内容平衡，只要求把引用闭环压稳。

当前已落地的最小自动检查：

- `pnpm --filter @mud/server-next audit:content-reference-consistency`
  - 已覆盖：monster drops / equipment / skill 引用、item mapUnlockId、breakthrough item requirement、resource-node item/drop 引用
  - 已覆盖：map `monsterSpawns` 对 monster content 的模板引用，兼容旧地图直接写 monster `id` 和新地图 `id + templateId` 双格式
  - 已覆盖：item 的 `learnTechniqueId`、`mapUnlockIds`、`consumeBuffs.valueStats`、装备 `effects[].stats/valueStats/buff.valueStats` 外链与数值键合法性
  - 已覆盖：quest 的 `nextQuestId / targetMapId / giverMapId / submitMapId / targetNpcId / giverNpcId / submitNpcId / targetMonsterId / targetTechniqueId / requiredItemId / reward.itemId` 引用，以及 quest 的 map->npc / map->monster 挂点一致性
  - 已覆盖：technique `effects[].buffRef` 引用，以及 `technique-buffs.valueStats` / technique inline `stats` / `valueStats` 的数值键合法性
  - 已覆盖：炼丹 `ingredients[].itemId / outputItemId` 与强化 `targetItemId` 的物品引用闭环
  - 尚未覆盖：更细粒度的 formula var / terrain / runtime 特殊引用

### 第 5 批：跑地图结构清单

- [x] compose 地图规范
- [x] 室内地图规范
- [x] 传送点规范
- [x] NPC 锚点规范
- [ ] 室内/洞窟/副图与主图连通关系

至少要明确：

- 地图 id 命名
- portal 指向是否合法
- 室内图是否有明确回到主图路径
- NPC 是否落在合法地图与坐标

当前已落地的最小自动检查：

- `pnpm --filter @mud/server-next audit:content-map-consistency`
  - 已覆盖：map id 唯一性、地图文件名与 `map.id` 对齐、tiles 尺寸、spawnPoint、portal 源/目标坐标、NPC 锚点、landmark、monster spawn 坐标合法性
  - 已覆盖：compose 子图目录/命名前缀规范（`compose/<group>/<group>_*.json`）以及 compose 子图不直接承载 `parentMapId`
  - 已覆盖：室内图 `parentMapId / floorLevel / parentOrigin / 回到父图路径 / id 前缀` 基础规范

当前仍未自动覆盖：

- 洞窟/副图到主图的更高层级路线设计是否“合理”
- compose 子图之间的推荐推进顺序是否符合关卡设计
- 某些非 `parentMapId` 独立副图与主图之间是否还需要额外的叙事或玩法连通约束

### 第 6 批：决定 generated 数据的去留

- [x] 继续保留的 generated 数据
  - 明确生成来源、更新命令、消费方
- [x] 可以删掉或重做的 generated 数据
  - 明确为什么不再需要
- [x] 重点确认：
  - `packages/client/src/content/editor-catalog.ts`
  - 其它客户端构建产物中的 world/editor catalog

当前结论：

- 当前继续保留：
  - `packages/client/src/constants/world/editor-catalog.generated.json`
    - 生成来源：`scripts/generate-editor-catalog.mjs`
    - 更新命令：`pnpm generate:editor-catalog` 或客户端 `prebuild`
    - 消费方：`packages/client/src/content/editor-catalog.ts`、GM/地图编辑器相关本地目录读取
- 当前继续保留：
  - `packages/client/src/constants/world/item-sources.generated.json`
    - 生成来源：`packages/client/scripts/generate-item-sources.mjs`
    - 更新命令：`pnpm generate:item-sources` 或客户端 `prebuild`
    - 消费方：`packages/client/src/content/item-sources.ts`、装备/背包 tooltip 与来源说明链路
- 当前继续保留：
  - `packages/client/src/constants/world/monster-locations.generated.json`
    - 生成来源：`packages/client/scripts/generate-item-sources.mjs`
    - 更新命令：`pnpm generate:item-sources` 或客户端 `prebuild`
    - 消费方：`packages/client/src/content/monster-locations.ts`、`packages/client/src/next/primitives/UiInlineReferenceText.tsx`
- 当前继续保留：
  - `packages/client/src/content/editor-catalog.ts`
    - 角色：本地 editor catalog 适配层
    - 原因：当前 `gm.ts` 等调用面仍依赖 `getLocalEditorCatalog()`，直接删除会扩大到 `07` 客户端主链
- 当前已完成重做并删掉：
  - `packages/client/src/constants/world/editor-catalog.ts`
    - 角色：只负责把 `editor-catalog.generated.json` 薄转发成 `LOCAL_EDITOR_CATALOG`
    - 处理：已并回 `packages/client/src/content/editor-catalog.ts`，不再保留额外 wrapper
- 当前不作为真源、也不应纳入仓库治理目标：
  - `packages/client/dist/assets/world-editor-catalog-*.js`
    - 这是构建输出，不是要维护的 generated 真源
  - `packages/client/dist/assets/world-item-sources-*.js`
    - 这是构建输出，不是要维护的 generated 真源
  - `packages/client/dist/assets/world-monster-locations-*.js`
    - 这是构建输出，不是要维护的 generated 真源

后续仍待决定：

- 是否把客户端本地 editor catalog 完全收束为“仅 GM/editor 场景使用”
- 是否把部分本地目录消费改成统一走 GM HTTP `/api/gm/editor-catalog`
- 在不阻塞 `07` 的前提下，是否把 `packages/client/src/content/editor-catalog.ts` 进一步下沉或替换

## 文件级检查表

### shared

- [x] `protocol.ts` 不再承载隐式运行时逻辑
- [x] `types.ts` 不再成为第二份事件合同
- [x] `network-protobuf.ts` 与 `protocol.ts` 没有漂移

### content

- [x] 每个内容目录都能回答“它是不是玩法真源”
- [ ] 没有客户端 generated 副本反向定义服务端内容

### maps

- [x] 每张地图都能回答 portal / npc / 室内层级是否合法
- [x] compose 规则不再靠隐式约定

补充：

- 当前 portal / NPC 锚点合法性已由 `audit:content-map-consistency` 做自动检查。
- 当前 compose 子图命名、室内图 `parentMapId` 基础规范也已接入 `audit:content-map-consistency`。
- 当前 `network-protobuf.ts` 与 `protocol.ts` 的漂移已由 shared build 内的 `check-network-protobuf-contract.cjs` 和既有 `proof:next-protobuf-drift` 双重覆盖。

## 本阶段不做的事

- 不在这里顺手重构客户端面板状态流，那是 `07`。
- 不在这里顺手重构服务端 runtime 架构，那是 `06`。
- 不在这里顺手新增内容或改数值平衡。

## 完成定义

- [ ] shared 不再成为隐形不稳定源
- [ ] 内容、地图、引用关系完成一次系统性清理
