# 五行炼丹炼器公式改造方案

本文定义炼丹、炼器从“材料力量 power”改为“五行匹配”的目标规则、数据契约、运行时边界和实施顺序。它是后续代码实现的设计真源。

## 目标

- 标准丹方/器方由服务端配置决定，属于正式内容真源。
- 玩家投料不再要求辅药/辅材必须是固定物品，只要求五行数值匹配配方目标。
- 主药/主材仍然按物品 ID 精确要求，必须投入。
- 自定义丹方/器方只保存在客户端本地，用于快捷复用、复制、导入、导出；服务端仍负责权威校验。
- 创建任务时计算一次基础五行成功率，并写入 job/queue 快照；后续 tick 不再重复统计材料五行。
- 炼丹等级、炼器等级、工具、装备、buff、建筑等动态成功率修正每次展示和结算时现算。

## 当前需要替换的旧口径

当前炼丹/炼器以材料力量计算基础成功率：

```ts
materialPower = level * gradeValue^2 * count
powerRatio = submittedPower / recipe.fullPower
baseSuccessRate = exactRecipe ? 1 : powerRatio^2
```

该口径只看材料等级、品阶和数量，不看 `materialValues.elements`，需要被新五行公式替换。

## 术语

### 标准配方

服务端内容配置中的正式配方，包括：

- `recipeId`
- `outputItemId`
- `outputCount`
- `level`
- `grade`
- `mainIngredients`
- `requiredAuxElements`
- `baseBrewTicks`

标准配方决定产物、主材要求和目标五行。

### 主药/主材

主药/主材按物品 ID 精确校验：

- 默认只有 1 个。
- 少量特殊配方允许 2 个。
- 主药/主材必须投入，数量必须满足配置。
- 主药/主材同时参与总五行匹配。主药/主材既承担身份校验，也把自身 `materialValues.elements * count` 计入配方目标和当前投入。

### 辅药/辅材

辅药/辅材不再按固定物品 ID 校验。玩家可以投入任意拥有 `materialValues.elements` 的材料，包括正五行和负五行材料。

服务端创建任务时汇总本次总投入五行：

```ts
inputElements[e] = sum(submittedMaterial.materialValues.elements[e] * count)
```

缺失的五行按 0 计。

### 自定义丹方/器方

自定义配方是客户端本地快捷方案，不是服务端资产真源。

它可以保存：

- 目标标准配方 ID。
- 玩家命名。
- 常用主材选择。
- 常用辅料物品和数量。
- 本地备注。

它不能绕过服务端标准配方，也不能在本地定义新产物或降低要求。服务端只接受本次提交的材料选择和标准配方 ID，并重新计算权威结果。

如果以后要做“玩家真正发明新配方”，那是服务器持久化玩法，不属于本轮本地自定义配方。

## 五行匹配公式

五行集合：

```ts
['metal', 'wood', 'water', 'fire', 'earth']
```

配方目标：

```ts
targetElements[e] = mainIngredientElements[e] + (recipe.requiredAuxElements[e] ?? 0)
```

玩家本次总投入：

```ts
inputElements[e] = submittedMainElements[e] + submittedAuxElements[e]
```

目标总量使用绝对值求和，避免负五行互相抵消：

```ts
targetTotalAbs = sum(abs(targetElements[e]))
```

`targetTotalAbs <= 0` 的配方非法，启动期应拒绝加载。

### 非零目标五行

当某一系配方要求不为 0：

```ts
diffRate = abs(inputElements[e] - targetElements[e]) / abs(targetElements[e])
matchRate = clamp(1 - diffRate, 0, 1)
elementScore = matchRate ^ 2
```

例：目标金 20，投入金 18，偏差 10%：

```ts
matchRate = 0.9
elementScore = 0.9 ^ 2 = 0.81
```

### 零目标五行

当某一系配方要求为 0 时，不能除以 0。使用目标五行总量的 20% 作为容差基准：

```ts
zeroBase = max(1, targetTotalAbs * 0.2)
diffRate = abs(inputElements[e]) / zeroBase
matchRate = clamp(1 - diffRate, 0, 1)
elementScore = matchRate ^ 2
```

这里 `inputElements[e]` 可以为正，也可以为负；都按绝对偏差处理。

### 基础五行成功率

五系得分相乘：

```ts
baseElementSuccessRate =
  metalScore * woodScore * waterScore * fireScore * earthScore
```

五行不匹配不直接拒绝制造。只要主材、数量、灵石、队列等基础条件满足，就可以创建任务；五行不匹配只会把基础成功率压低，极端情况下可为 0。

## 最终成功率

任务创建时只计算并保存：

```ts
job.baseElementSuccessRate
job.elementMatchSnapshot = {
  targetElements,
  inputElements,
  perElementScore,
  targetTotalAbs,
  zeroBase
}
```

每次展示或每批结算时动态计算最终成功率：

```ts
finalSuccessRate = applyDynamicCraftSuccessModifier(
  job.baseElementSuccessRate,
  recipeLevel,
  currentCraftSkillLevel,
  currentToolSuccessModifier,
  currentBuffSuccessModifier,
  currentBuildingSuccessModifier
)
```

动态修正包括：

- 炼丹等级 / 炼器等级。
- 丹炉 / 炼器工具。
- 装备。
- buff。
- 建筑或环境加成。

这些动态项不写入基础五行快照。玩家更换装备、buff 变化、建筑状态变化后，后续展示和结算应反映当前值。

## 耗时公式

旧的 `powerRatio` 不再作为耗时基准。

建议第一版：

```ts
baseTicks = recipe.baseBrewTicks
adjustedTicks = applyDynamicCraftSpeedModifier(
  baseTicks,
  recipeLevel,
  currentCraftSkillLevel,
  currentToolSpeedModifier,
  currentBuffSpeedModifier,
  currentBuildingSpeedModifier
)
```

也就是说，五行偏差只影响成功率，不影响基础耗时。这样便于调平和解释。

如果后续需要“五行越偏耗时越长”，应新增独立系数，不复用成功率，避免成功率和耗时双重惩罚。

## 标准配方配置结构

建议新结构：

```json
{
  "recipeId": "alchemy.pill.minor_heal",
  "outputItemId": "pill.minor_heal",
  "outputCount": 1,
  "level": 3,
  "grade": "mortal",
  "baseBrewTicks": 12,
  "mainIngredients": [
    {
      "itemId": "mat.moondew_grass",
      "count": 1
    }
  ],
  "requiredAuxElements": {
    "wood": 2,
    "water": 1,
    "earth": 1
  }
}
```

迁移旧配方时：

- `role=main` 的 ingredients 迁移为 `mainIngredients`。
- `role=aux` 的 ingredients 读取对应材料 `materialValues.elements * count`，汇总为 `requiredAuxElements`。
- `fullPower` 不再生成。
- `ingredients` 旧字段不继续作为运行时真源。

启动期校验：

- `mainIngredients.length` 必须为 1 或 2。
- 主材 item 必须存在且为 material。
- `requiredAuxElements` 至少一系非 0。
- `requiredAuxElements` 只允许有限整数，可以为负。
- `baseBrewTicks`、`outputCount`、`level` 必须为正整数。
- 输出物品必须存在。

## 材料五行配置

当前材料五行归一化只保留正整数。为了支持负五行，必须改为：

- 保留有限整数。
- 允许负数。
- 0 可省略。
- 运行期仍读取启动期归一化结构，tick 中不解析 JSON。

建议规范：

```ts
materialValues.elements[e] = finite integer, can be negative, zero omitted
```

## 服务端任务创建流程

标准流程：

```text
1. 校验 recipeId 存在。
2. 校验主材选择满足 mainIngredients。
3. 校验辅料均为拥有五行值的 material。
4. 汇总 inputElements（主材 + 辅材）。
5. 根据 targetElements（主材五行 + requiredAuxElements）计算 baseElementSuccessRate。
6. 检查材料数量充足。
7. 检查灵石充足。
8. 扣除材料和灵石。
9. 创建 job 或 queue item。
10. job/queue item 保存 baseElementSuccessRate 和 elementMatchSnapshot。
```

队列任务在加入队列时就计算基础五行成功率并扣材料。排到执行时不重算五行。

## tick 与结算流程

tick 中不能扫描材料、背包或重新统计五行。

批次完成时：

```text
1. 读取 job.baseElementSuccessRate。
2. 读取当前技能等级、装备、buff、工具、建筑加成。
3. 动态计算 finalSuccessRate。
4. 按 finalSuccessRate 判定本批每件产物是否成功。
5. 发放产物、技艺经验，推进队列。
```

## 客户端 UI

炼丹和炼器共用五行投料面板。

标准配方详情显示：

- 产物。
- 主药/主材要求。
- 目标总五行。
- 当前投入总五行。
- 五系匹配百分比。
- 基础五行成功率。
- 动态修正后的预计成功率。

投料区：

- 主材槽：只允许符合主材要求的物品。
- 辅材槽：允许任意有五行值的材料。
- 五行差额实时显示，支持负值。
- 零目标五行显示容差基准：目标总量的 20%。

本地自定义方案：

- 保存当前投料方案。
- 覆盖保存。
- 删除。
- 复制 JSON。
- 导入 JSON。
- 导出全部。

本地存储 key 建议：

```ts
craft.customRecipes.v1
```

导入导出格式建议：

```json
{
  "version": 1,
  "kind": "alchemy",
  "name": "回春散便宜投料",
  "recipeId": "alchemy.pill.minor_heal",
  "mainSelections": [
    {
      "itemId": "mat.moondew_grass",
      "count": 1
    }
  ],
  "auxSelections": [
    {
      "itemId": "rat_tail",
      "count": 2
    }
  ],
  "note": ""
}
```

导入时客户端只做格式校验和物品存在提示；服务端仍在开始任务时权威校验。

## 协议变化

启动或打开面板时的低频 catalog 需要新增：

- `mainIngredients`
- `requiredAuxElements`
- `recipeLevel`
- `recipeGrade`

开始任务请求需要区分：

- `mainSelections`
- `auxSelections`
- `quantity`
- `queueMode`

任务视图和队列视图需要带：

- `baseElementSuccessRate`
- `currentSuccessRate`
- `elementMatchSnapshot`

这些是面板/任务详情低频数据，不进入 AOI 或世界高频同步。

## 持久化与恢复

如果当前 job/queue 会进入玩家快照，则必须保存：

- `baseElementSuccessRate`
- `elementMatchSnapshot`
- `mainSelections`
- `auxSelections`
- `recipeId`
- `quantity`

恢复后不得重算五行，因为材料已经扣除。动态成功率在恢复后的展示和批次结算时按当前状态现算。

## 兼容迁移

第一阶段不做运行时旧格式兼容分支。

应提供一次性内容迁移脚本或生成工具：

```text
旧 recipes.ingredients -> 新 mainIngredients + requiredAuxElements
```

迁移后正式运行时只接受新格式。

## 验证计划

最小验证应覆盖：

- shared 五行公式单元测试。
- 配方加载校验：主材数量、负五行、零目标、非法输出。
- 旧配方迁移结果检查。
- 服务端开始任务：标准配方主材必需，辅材任意但按五行算分。
- 队列任务：创建时快照基础五行成功率，执行时不重算。
- 动态修正：同一 job 更换工具或技能等级变化后，展示/结算最终成功率变化。
- 客户端本地自定义方案导入导出。
- `pnpm build:shared`
- `pnpm audit:protocol`
- `pnpm verify:client`
- 服务端专项 smoke：炼丹和炼器各至少一条成功率快照用例。

## 实施顺序

1. 新增 shared 五行公式 helper 和类型。
2. 修改材料五行归一化，支持负五行。
3. 修改配方 schema 和加载器，生成 `mainIngredients` 与 `requiredAuxElements` catalog。
4. 写旧配方迁移脚本，迁移 alchemy/forging 配方 JSON。
5. 修改服务端 start/queue/job snapshot。
6. 修改 tick 结算动态成功率计算。
7. 修改协议类型和面板 payload。
8. 修改客户端炼丹/炼器投料 UI。
9. 加本地自定义方案保存、复制、导入、导出。
10. 补 smoke、构建和协议审计。

## 明确不做

- 不让客户端本地自定义方案决定产物或降低服务端配方要求。
- 不在 tick 中重新统计材料五行。
- 不把完整自定义方案同步给其他玩家或 AOI。
- 不在运行时代码里长期兼容旧 `ingredients` 配方格式。
- 不把五行偏差同时惩罚成功率和耗时，第一版只影响成功率。
