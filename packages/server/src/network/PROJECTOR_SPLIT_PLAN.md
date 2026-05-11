# world-projector.helpers.ts 拆分计划

**源文件**：`world-projector.helpers.ts`（3304 行，~125KB）  
**目标**：按职责拆分为 4 个子模块 + 1 个入口文件，保持向后兼容。

---

## 1. 目标文件结构

```text
packages/server/src/network/
├── projector-types.ts          # 接口、类型别名、常量
├── projector-compare.ts        # isSame* 比较函数
├── projector-clone.ts          # clone* 深拷贝函数
├── projector-diff.ts           # diff* 增量计算函数
└── world-projector.helpers.ts  # build*/capture*/utility + 统一 re-export
```

**依赖方向**（单向）：

```text
projector-types.ts          ← 无内部依赖
projector-compare.ts        ← 依赖 projector-types
projector-clone.ts          ← 依赖 projector-types, projector-compare（部分 clone 内部调用 isSame）
projector-diff.ts           ← 依赖 projector-types, projector-compare, projector-clone
world-projector.helpers.ts  ← 依赖以上全部，承载 build/capture/utility
```

---

## 2. 各文件函数分配

### 2.1 projector-types.ts

**常量数组**：
- `ATTR_DELTA_PATCH_THRESHOLD`
- `ATTRIBUTE_KEYS`
- `NUMERIC_STAT_KEYS`
- `RATIO_DIVISOR_KEYS`
- `ELEMENT_GROUP_KEYS`（如存在）

**类型别名**：
- `DirectionLike`
- `LooseRecord`
- `AttributeKey`
- `NumericStatKey`
- `RatioDivisorKey`
- `ElementGroupKey`
- `ProjectedPatchResult<T>`
- `AttrBonusMetaValue`
- `ProjectedNumericStats`
- `ProjectedRatioDivisors`
- `ProjectedActionEntry`
- `ProjectedElementGroup`
- `ProjectedAttrPatch`
- `ProjectedNumericStatsPatch`
- `ProjectedRatioDivisorsPatch`
- `ProjectedAttrDeltaView`

**接口**（30 个）：
- `AttrBonusMetaRecord`
- `BindingLike`
- `ProjectorInstanceLike`
- `ProjectorVisiblePlayerLike`
- `ProjectorNpcLike`
- `ProjectorMonsterLike`
- `ProjectorPortalLike`
- `ProjectorGroundPileLike`
- `ProjectorContainerLike`
- `ProjectorBuildingLike`
- `ProjectorFormationLike`
- `ProjectorViewLike`
- `ProjectedPlayerEntry`
- `ProjectedNpcEntry`
- `ProjectedMonsterEntry`
- `ProjectedPortalEntry`
- `ProjectedGroundPileEntry`
- `ProjectedContainerEntry`
- `ProjectedBuildingEntry`
- `ProjectedFormationEntry`
- `ProjectedSelfState`
- `ProjectorPlayerLike`
- `ProjectedAttrPanelState`
- `ProjectedActionPanelState`
- `ProjectedPanelState`
- `WorldStateSlice`
- `PlayerStateSlice`
- `ProjectorState`
- `InitialEnvelope`
- `DeltaEnvelope`

---

### 2.2 projector-compare.ts（48 个 isSame* 函数）

- `isSameCraftSkillState`
- `isSameNpcQuestMarker`
- `isSameActionOrder`
- `isSameBuffList`
- `isSameItem`
- `isSameItemSpecialStats`
- `isSameTileResourceGainList`
- `isSameMaterialValues`
- `isSameNumberRecord`
- `isSameTechniqueEntry`
- `isSameActionEntry`
- `isSameBuffEntry`
- `isSameGroundPile`
- `isSameGroundItemEntry`
- `isSameStringList`
- `isSameEquipmentEffectList`
- `isSameEquipmentEffectDef`
- `isSameEquipmentConditionGroup`
- `isSameEquipmentConditionList`
- `isSameEquipmentConditionDef`
- `isSameEquipmentBuffDef`
- `isSameConsumableBuffList`
- `isSameConsumableBuffDef`
- `isSameBuffSustainCostDef`
- `isSameWalletState`
- `isSameAttrBonuses`
- `isSameAttributes`
- `isSameSpecialStats`
- `isSamePartialNumericStats`
- `isSamePartialElementGroup`
- `isSameQiProjectionModifierList`
- `isSameQiProjectionModifier`
- `isSameQiProjectionSelector`
- `isSameAttrBonusMeta`
- `isSameAttrBonusMetaRecord`
- `isSameAttrBonusMetaValue`
- `isSameTechniqueSkillList`
- `isSameTechniqueLayerList`
- `isSameTechniqueAttrCurves`
- `isSameSkillDef`
- `isSameSkillTargetingDef`
- `isSameSkillEffectList`
- `isSameSkillEffectDef`
- `isSameSkillFormula`
- `isSameSkillMonsterCastDef`
- `isSameSkillPlayerCastDef`
- `isSameTechniqueLayerDef`
- `isSameTechniqueAttrCurveSegmentList`

---

### 2.3 projector-clone.ts（31 个 clone* 函数）

- `cloneSyncedItemStack`
- `cloneMaterialValues`
- `cloneEquipmentEffectDef`
- `cloneConsumableBuffDef`
- `cloneEquipmentConditionGroup`
- `cloneEquipmentConditionDef`
- `cloneEquipmentBuffDef`
- `cloneBuffSustainCostDef`
- `cloneTechniqueEntry`
- `cloneSkillDef`
- `cloneSkillTargetingDef`
- `cloneSkillEffectDef`
- `cloneSkillFormula`
- `cloneSkillMonsterCastDef`
- `cloneSkillPlayerCastDef`
- `cloneTechniqueLayerDef`
- `cloneTechniqueAttrCurves`
- `cloneTechniqueAttrCurveSegmentList`
- `cloneAttributes`
- `clonePartialAttributes`
- `cloneSpecialStats`
- `cloneWalletState`
- `cloneAttrBonus`
- `cloneAttrBonusMetaRecord`
- `cloneAttrBonusMetaValue`
- `cloneAttrBonusMetaRecordValue`
- `cloneNumericStats`
- `clonePartialNumericStats`
- `cloneNumericRatioDivisors`
- `cloneQiProjectionModifier`
- `cloneVisibleBuff`

---

### 2.4 projector-diff.ts（20 个 diff* 函数）

- `diffPlayerEntries`
- `diffNpcEntries`
- `diffPortalEntries`
- `diffMonsterEntries`
- `diffGroundPiles`
- `diffContainerEntries`
- `diffBuildingEntries`
- `diffFormationEntries`
- `diffInventorySlots`
- `diffEquipmentSlots`
- `diffTechniqueEntries`
- `diffRemovedTechniqueIds`
- `diffActionEntries`
- `diffRemovedActionIds`
- `diffBuffEntries`
- `diffRemovedBuffIds`
- `diffAttributes`
- `diffNumericStats`
- `diffRatioDivisors`
- `diffElementGroup`

---

### 2.5 world-projector.helpers.ts（保留）

**build* 函数**（15 个）：
- `buildMapEnter`
- `buildFullWorldDelta`
- `buildFullSelfDelta`
- `buildFullPanelDelta`
- `buildBootstrapPanelDelta`
- `buildFullAttrDelta`
- `buildFullActionDelta`
- `buildFullBuffDelta`
- `buildAttrDelta`
- `buildSelfDelta`
- `buildPanelDelta`
- `buildActionOrder`
- `buildAttrBonuses`
- `buildSpecialStatsPatch`
- `buildPortalId`

**capture* 函数**（9 个）：
- `captureWorldState`
- `capturePlayerState`
- `captureInventoryPanelSlice`
- `captureEquipmentPanelSlice`
- `captureTechniquePanelSlice`
- `captureAttrPanelSlice`
- `captureActionPanelSlice`
- `captureBuffPanelSlice`
- `captureProjectorState`

**utility 函数**（13 个）：
- `resolvePlayerSpecialStats`
- `resolveEquipmentSpecialStats`
- `toTechniqueState`
- `resolvePortalRenderChar`
- `resolveBuffPresentationScale`
- `combineProjectorState`
- `normalizeOptionalNonNegativeInteger`
- `normalizeAttrBonusMetaRecord`
- `normalizePlayerIdentityText`
- `resolvePlayerRenderLabel`
- `resolvePlayerRenderChar`
- `normalizePlayerDisplayText`
- `isRuntimePlayerIdLike`
- `resolvePortalDisplayName`

**re-export**：统一从子模块 re-export 全部公开符号。

---

## 3. 迁移步骤

### Step 1：创建 projector-types.ts

1. 从源文件提取所有 `interface`、`type`、常量数组定义
2. 补齐 `@mud/shared` 的 import
3. 全部 `export`
4. 源文件改为 `import { ... } from './projector-types'`
5. 验证：`pnpm build:server`

### Step 2：创建 projector-compare.ts

1. 从源文件剪切全部 `isSame*` 函数
2. 添加 `import` from `./projector-types` 和 `@mud/shared`
3. 全部 `export`
4. 源文件改为 `import { ... } from './projector-compare'`
5. 验证：`pnpm build:server`

### Step 3：创建 projector-clone.ts

1. 从源文件剪切全部 `clone*` 函数
2. 添加 `import` from `./projector-types`、`./projector-compare`、`@mud/shared`
3. 全部 `export`
4. 源文件改为 `import { ... } from './projector-clone'`
5. 验证：`pnpm build:server`

### Step 4：创建 projector-diff.ts

1. 从源文件剪切全部 `diff*` 函数
2. 添加 `import` from `./projector-types`、`./projector-compare`、`./projector-clone`、`@mud/shared`
3. 全部 `export`
4. 源文件改为 `import { ... } from './projector-diff'`
5. 验证：`pnpm build:server`

### Step 5：整理 world-projector.helpers.ts

1. 确认剩余内容只有 build*/capture*/utility 函数
2. 文件顶部添加统一 re-export：
   ```ts
   export * from './projector-types';
   export * from './projector-compare';
   export * from './projector-clone';
   export * from './projector-diff';
   ```
3. 保留现有 `export { ... }` 块中的所有符号继续导出
4. 验证：`pnpm build:server`

### Step 6：最终验证

```bash
pnpm build:server
pnpm verify:quick
pnpm audit:protocol
```

---

## 4. 向后兼容 re-export 策略

**核心原则**：`world-projector.helpers.ts` 的公开 API 不变。

当前唯一消费者是 `world-projector.service.ts`，它从 `'./world-projector.helpers'` 导入以下符号：

```ts
import {
    buildBootstrapPanelDelta,
    buildFullPanelDelta,
    buildFullSelfDelta,
    buildFullWorldDelta,
    buildMapEnter,
    buildPanelDelta,
    buildSelfDelta,
    capturePlayerState,
    captureProjectorState,
    captureWorldState,
    combineProjectorState,
    diffBuildingEntries,
    diffContainerEntries,
    diffFormationEntries,
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
} from './world-projector.helpers';
```

拆分后，这些符号通过 `world-projector.helpers.ts` 的 `export * from './projector-diff'` 等语句继续对外暴露，**消费者无需任何修改**。

未来新代码可以直接从子模块精确导入，减少编译依赖范围：

```ts
import { diffPlayerEntries } from './projector-diff';
import { cloneSyncedItemStack } from './projector-clone';
```

---

## 5. 注意事项

- 部分 `isSame*` 函数内部互相调用（如 `isSameSkillDef` 调用 `isSameSkillEffectList`），拆分时保持在同一文件内，无需跨文件引用
- 部分 `diff*` 函数内部调用 `isSame*` 和 `clone*`，需要从对应子模块 import
- `normalizeAttrBonusMetaRecord` 被 `isSameAttrBonusMetaRecord` 调用，应放入 `projector-compare.ts` 或作为其内部依赖从 helpers 导入——建议随 compare 一起移动
- 外部依赖 `cloneAutoUsePillList`、`isSameAutoUsePillList` 等来自 `../runtime/player/` 的函数保持原有 import 路径不变
- `ProjectedNumericStats` 等类型别名依赖 `cloneNumericStats` 的返回类型，需要在 types 中用 `ReturnType` 或在 clone 中先定义再 re-export 到 types——建议在 types 中改为显式接口定义以解除循环
