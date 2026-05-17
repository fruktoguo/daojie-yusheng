# 服务端

`packages/server` 是道劫余生的服务端工作区，负责游戏运行时、网络协议入口、持久化、运维工具和验证脚本。

## 职责

- 提供 NestJS HTTP 服务与 Socket.IO 实时连接
- 维护服务端权威的地图、玩家、战斗、物品、市场、邮件和 GM 状态
- 管理 PostgreSQL 持久化真源、Redis 在线态和恢复流程
- 提供 smoke、proof、audit、with-db、shadow、acceptance、full 等验证入口

## 常用命令

```bash
pnpm build:server
pnpm --filter @mud/server start:dev
pnpm verify:release:doctor
pnpm verify:release:local
pnpm verify:release:with-db
pnpm verify:release:acceptance
pnpm verify:release:full
```

## 文档

- [测试说明](./TESTING.md)
- [运维 Runbook](./RUNBOOK.md)
- [验证与验收](../../docs/next-plan/09-verification-and-acceptance.md)
- [协议审计](../../docs/protocol-audit.md)

## 模板 Registry 边界

服务端模板源 → 实例工厂 → 运行态字段已经收口在统一 Registry。运行态对象不再 `{ ...template }` 模板字段，所有静态字段一律走 prototype 链或 registry 查询。

| Registry | 主入口 | 模板字段（prototype） | 实例 own 白名单 |
|---|---|---|---|
| `ItemTemplateRegistry` | `createItem(itemId, count)` / `normalizeItem(input)` | `name / desc / type / equipSlot / equipAttrs / effects / stack / consumeBuffs` | `itemId / count / enhanceLevel?` |
| `TechniqueTemplateRegistry` | `createTechniqueState(techId)` / `hydrateTechniqueState(input)` | `name / grade / skills / layers / qiProjection` | `techId / level / exp / expToNext / realmLv? / skillsEnabled` |
| `SkillTemplateRegistry` | `getSkill(skillId)` / `getSkillRef(skillId)` | 完整 SkillDef | `skillId / cooldownReadyTick`（仅出现在战斗冷却表） |
| `BuffTemplateRegistry` | `createInstance(buffId, init)` / `hydrate(buffId, payload)` / `createPvP*Buff(realmLv)` | `name / desc / category / attrs / stats / qiProjection / sourceSkillId / sourceSkillName / color` | `buffId / remainingTicks / duration / stacks / maxStacks / realmLv? / sourceRealmLv? / infiniteDuration? / sustainTicksElapsed? / persistOnDeath? / persistOnReturnToSpawn?` |
| `FormationTemplateRegistry` | `getFormationTemplate(formationId)` | 完整 FormationDef | 阵法实例运行态字段（runtime） |
| `MonsterTemplateRegistry` | `createRuntimeMonsterSpawn(...)` | `monsterId / name / char / color / level / tier / baseAttrs / baseNumericStats / ratioDivisors / statFormula / initialBuffs / skills / drops` | `runtimeId / spawnId / x / y / hp / qi / dir / aliveTickAt? / respawnAt? / buffs[] / cooldownReadyTickBySkillId / damageContributors` |
| `DropTableRegistry` | `rollMonsterDrops(...)` / `rollLootPoolItems(...)` | drops / lootPools / 概率折算 | n/a（输出物品列表） |
| `NpcTemplateRegistry` | `getRef(npcId)` / `listInMap(mapId)` / `getLocation(npcId)` | `npcId / id / name / x / y / char / color / dialogue / role / hasShop / shopItems / quests` | n/a（运行态直接复用 frozen 模板引用） |
| `QuestTemplateRegistry` | `getQuestSource(questId)` / `getRewards(questId)` / `getNarrative(questId)` | `title / desc / dialogue / completionText / rewards / 路径文本` | `questId / status / progress / targetCount?`（玩家任务运行态） |
| `ContainerTemplateRegistry` | `getRef(containerId)` / `listInMap(mapId)` / `getDropTable(containerId)` | `id / name / x / y / desc / drops / lootPools / refresh* / variant / grade` | `containerId / activeSearch? / lootState?`（位于 `containerStatesByInstanceId` 而非容器对象本身） |
| `LandmarkTemplateRegistry` | `getRef(landmarkId)` / `listInMap(mapId)` | `id / name / x / y / desc / container?` | n/a |
| `TileTemplateRegistry` | `resolveLayerSeed(template, x, y)` / `shareProjection(instance, x, y, tile)` | tile 层级派生数据 | 实例 `tileProjectionByCoord` 缓存共享投影 |

启动期由 `ContentTemplateRepository` / `MapTemplateRepository` 注入子 Registry 并按依赖顺序 `loadAll`，所有模板会在加载完成后 `Object.freeze`（深冻 `attrs / stats / equipAttrs / formula / qiProjection / drops / lootPools` 等子结构）。如果要在线上紧急关闭冻结，可以设置 `RUNTIME_FREEZE_TEMPLATES=0`。

实例工厂的不变量：

- `createInstance` / `hydrate` 是唯一的实例化入口；运行态对象的 `Object.keys` 必须落在白名单内。
- `JSON.stringify(instance)` 只输出 own keys，模板字段不会进入 jsonb / 协议出网（出网时由显式投影补齐）。
- 同一 `id` 多次 `getRef` 返回同一 frozen 引用；`listInMap` 返回的数组元素与 `getRef` 引用相等。

防回退守护：

- `pnpm audit:boundaries` 调用 `audit-runtime-template-spread`（扫 runtime/network/persistence 路径下的 template spread / Object.assign / structuredClone / JSON.parse(JSON.stringify) 模式）和 `audit-registry-frozen`（启动期断言所有 registry sample 模板 `Object.isFrozen`）。
- `node packages/server/dist/tools/server-memory-retention-smoke.js` 中 `proveUnifiedTemplateRegistryGuards` 验证 buff 实例 own keys 白名单、registry 引用复用、tile projection 共享。
