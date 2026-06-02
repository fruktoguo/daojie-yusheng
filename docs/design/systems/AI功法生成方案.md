# AI 功法生成方案

通过占比预算制 + JSON Schema 约束，让 AI 生成合法、平衡、可运营的功法。AI 与策划共用同一条战斗结算路径，数值安全由预算分配与真实值反推保证，而非人工审核。

---

## 2. 核心设计：占比预算制

### 2.1 基本思想

游戏业界验证过的设计（炉石法力水晶、LOL 装备点数、DnD CR）：

- 每个功法/技能有一份**固定预算**，由品阶 × 境界决定
- AI 写的数值只是"权重"，不是最终值
- 结算时所有效果项的权重先切成分项预算，再按各项公式反推真实值
- AI 写 `+100000%` 或“1 息冷却”也只是表达倾向，最终实际值仍由预算和转换公式决定

### 2.2 三层防线

| 防线 | 作用 | 实现 |
|------|------|------|
| 结构合法性 | 字段缺失、类型错误、枚举越界 | JSON Schema + ajv 校验 |
| 语义合法性 | `var` 引用、`buffId` 合法、AST 深度上限 | 白名单 + 运行时解析器试跑 |
| 数值合法性 | 预算分配与真实值反推 | 权重自动压回预算，无需审核 |

因为预算系统兜底，**不再需要沙盒战斗对标作为硬门槛**，可降级为异常监控。

---

## 3. 功法四大类分路径

### 3.1 分类与职责

对应仓库现有的 `TechniqueCategory = 'arts' | 'internal' | 'divine' | 'secret'`：

| 类别 | category | 职责 | AI 生成 |
|------|----------|------|---------|
| 术法 | `arts` | 主动技能（damage/heal/buff/debuff/control） | ✅ 开放 |
| 内功 | `internal` | 被动六维属性养成 | ✅ 开放 |
| 神通 | `divine` | 大招 + 悟性特殊属性 | ❌ GM/剧情 |
| 秘术 | `secret` | 规则改写、特殊机制 | ❌ GM/剧情 |

**生成入口硬锁**：`category ∈ { divine, secret }` 的请求直接拒绝。

### 3.2 每类的预算机制概述

- **内功**：六维总量由公式给出，AI 只填"分配到哪几维"和"小幅浮动"
- **术法**：技能总预算由公式给出，AI 填效果结构和权重，服务端展开真实值
- **神通/秘术**：不经 AI，保留 formula 完整表达力供策划/GM 手配

---

## 4. 内功（internal）设计

### 4.1 六维总量公式

```
T = g²·(realmLv + 25) × (1 + r) + 50 × (1 + r)
  = (g²·(realmLv + 25) + 50) × (1 + r)

g      = 品阶索引，取值 1~8（mortal=1, yellow=2, ..., emperor=8）
realmLv = 小境界索引，取值 1~127
r      = 该功法的独特浮动比例，取值 [-0.15, +0.10]，默认 0
```

公式来源：对现有策划功法拟合，误差 ≤ 7%。

### 4.2 六维分配

AI 只输出"占比权重"，不输出绝对数值：

```json
"attrRatio": {
  "strength":    0.37,
  "spirit":      0.31,
  "meridians":   0.32
}
```

服务端解算：

```
weight_sum = Σ attrRatio[i]
T_attr[i]  = T × attrRatio[i] / weight_sum
```

占比自动归一，AI 可填 `0.37/0.31/0.32` 也可以填 `37/31/32` 或 `370/310/320`，结果相同。

### 4.3 浮动 `attrFloat`

从现有策划功法反算（基础 = `g²·(lv+25) + 50`）：

| 品阶 | 样本 r 范围 | 均值 |
|------|-------------|------|
| 凡阶 | [-21.1%, -12.5%] | -16.8% |
| 黄阶 | [-2.9%, +8.6%] | +0.4% |
| 玄阶 | [-12.2%, +3.0%] | -1.6% |
| 地阶 | +0.2% | +0.2% |

规范：`r ∈ [-0.15, +0.10]`，默认 0。超出范围校验器拒绝。

### 4.4 样例（黄阶 Lv23 内功，赤息燃窍功范式）

```
基础 = 4 × 48 + 50 = 242
假设 r = -0.029  →  T = 235

attrRatio: { spirit: 0.31, strength: 0.37, meridians: 0.32 }
spirit     = 235 × 0.31 = 73
strength   = 235 × 0.37 = 87
meridians  = 235 × 0.32 = 75
```

---

## 5. 术法（arts）设计

### 5.1 单技能预算公式

```
BUDGET_max = 3 + realmLv × 1.4^(g - 1) × majorRealmMultiplier

realmLv = 1~127
realmStage = PLAYER_REALM_STAGE_LEVEL_RANGES 的境界阶段索引，1~33，仅用于命名和境界描述
g       = 品阶索引，1~8
majorRealmMultiplier = 大境界额外增幅，未配置时为 1
```

**每层预算按 realmLv 线性缩放**：

```
BUDGET(layer) = BUDGET_max × layer / maxLayer
```

完整境界对照（每技能满层预算）：

| 品阶/境界 | realmLv | realmStage | BUDGET_max |
|---|---:|---:|---:|
| 凡阶凡俗境 | 1 | 1 | 4.0 |
| 凡阶通脉境 | 12 | 4 | 15.0 |
| 黄阶练气中期 | 23 | 7 | 35.2 |
| 玄阶练气后期 | 30 | 8 | 61.8 |
| 玄阶筑基中期 | 36 | 10 | 73.6 |
| 地阶金丹初期 | 46 | 12 | 129.2 |
| 天阶元婴初期 | 60 | 15 | 233.5 |
| 灵阶化神后期 | 78 | 20 | 422.5 |
| 圣阶合体中期 | 96 | 25 | 725.8 |
| 帝阶飞升 | 127 | 33 | 1341.8 |

**技能数量**：AI 首版每个术法功法只生成 1 个技能，该技能独立享受一份预算。

### 5.2 效果项消耗公式

技能伤害公式：

```
实际值 = 基础属性 × 倍率 × (1 + Σ 修饰百分比)

基础属性：任意战斗属性（攻击/防御/暴击/命中/…），同指数曲线等价
倍率：AI 填，每 100% = 1 点预算
修饰百分比：乘数必须在白名单
```

**技能数值乘区白名单系数**（每 1% 修饰消耗的预算）：

| 乘数属性 | 系数 | 例 |
|---|---:|---|
| 移速 | 10 点/% | +3% × 移速 = 30 点 |
| 境界等级 | 0.05 点/% | +20% × 境界等级 = 1 点 |
| 功法层数 | 0.1 点/% | +10% × 功法层数 = 1 点 |
| 技艺等级 | 0.2 点/% | +5% × 锻造等级 = 1 点 |

**战斗属性**（攻击/防御/暴击等）**不能**作为修饰乘数，防止乘法爆炸链。

### 5.3 Buff 效果消耗公式

Buff 目标属性**不受白名单约束**（允许改战斗属性）。

```
buff_cost = percent × 0.1
          × (1 + 0.5 × (maxStack - 1))             # 叠层系数
          × (1 + 0.5 × (duration - 10) / 10)       # duration 系数, 10 秒起
          × √chance                                 # 概率系数
          × (1 + 0.5 × (stacksPerApply - 1))       # 单次应用层数

percent          = buff 的百分比值（10% → 1 点基础）
maxStack         = buff 最大叠层数，默认 1
duration         = 持续秒数（10 秒免费，每多 10 秒 +50%）
chance           = 施放附加概率 [0, 1]
stacksPerApply   = 单次命中附加层数，默认 1
```

### 5.4 预算分配与真实值反推

```
totalWeight    = Σ abs(itemWeight)
positiveWeight = Σ max(itemWeight, 0)

正权重 itemBudget = BUDGET(layer) × itemWeight / positiveWeight
负权重 itemBudget = BUDGET(layer) × itemWeight / totalWeight
真实值            = convert(itemBudget)
```

每个项目都有独立转换公式：属性基底按属性成本换成倍率，冷却预算换成真实冷却，消耗预算换成灵力消耗倍率，施法距离和范围预算换成真实 targeting 几何。

**关键保证**：AI 输出的是权重，不是最终数值。玩家写“1 息”“范围 32 格”只表示倾向，服务端仍按预算分配和转换公式反推真实值。

正权重瓜分完整正向预算；负权重只折算为对应项目的负预算，不进入正向分母，也不会额外兑换成其它项的正预算。

有上下限的项目先算真实值再钳制；触顶/触底后多出的正预算回流给仍可增长的项目，最终兜底补给无上限的属性基底。

### 5.5 样例（地阶金丹期单技能，BUDGET_max = 120.99，满层）

AI 输出：

```json
{
  "target": { "type": "area", "range": 6, "radius": 6, "targetMode": "tile" },
  "structureStrength": { "cost": -20, "cooldown": 80 },
  "formulaStrength": { "attributeBases": { "spellAtk": 1 } }
}
```

预算分配示意：

```
totalWeight = abs(6) + abs(6) + abs(-20) + abs(80) + abs(1) = 113
positiveWeight = 6 + 6 + 80 + 1 = 93

castRangeBudget = 120.99 × 6 / 93       ≈ 7.81
shapeBudget     = 120.99 × 6 / 93       ≈ 7.81
costBudget      = 120.99 × -20 / 113    ≈ -21.41
cooldownBudget  = 120.99 × 80 / 93      ≈ 104.08
spellAtkBudget  = 120.99 × 1 / 93       ≈ 1.30

rangeBudget 7.81 可购买施法距离 4 格（距离 5 需要 8.29 预算）
shapeBudget 7.81 可购买 area 半径 2（13 格，已用 6.00 预算）
```

实际冷却会先按 `3 * realmLv * 0.95^cooldownBudget` 计算，再被最小 1 息钳制；多出的正预算回流到范围或属性基底，样例中最终 `spellAtkBudget` 约为 `15.06`，不会继续制造 `1.2^80` 级别的预算倍率。

---

## 6. 升级经验与阶段化

### 6.1 统一经验公式

```
expToNext(layer, g, realmLv, category, expDifficulty) =
    BASE(g, realmLv)
  × catFactor[category]
  × K^(layer - 1)
  × stageStepFactor(layer)
  × expDifficulty
  × normFactor

BASE         = g² × (realmLv + 5)
K            = 1.10
catFactor    = { internal: 1.0, arts: 0.5, secret: 1.0, divine: 1.0 }
stageStepFactor:  入门=1, 小成=2, 大成=4
expDifficulty = 默认 1.0, 范围 [0.5, 2.0]
normFactor   = 归一化系数，保证总经验等于理论值
```

**理论总经验**（与阶段无关）：

```
totalExp = BASE × catFactor × (K^maxLayer - 1)/(K - 1) × expDifficulty
```

### 6.2 阶段划分

- `maxLayer` 默认 9，范围 [3, 49]
- 按 1/3 切分，余数归大成

```
入门层数 = floor(maxLayer / 3)
小成层数 = floor(maxLayer / 3)
大成层数 = maxLayer - 2 × floor(maxLayer / 3)
```

| maxLayer | 入门 | 小成 | 大成 |
|---:|:---:|:---:|:---:|
| 3 | 1 | 1 | 1 |
| 9（默认） | 3 | 3 | 3 |
| 10 | 3 | 3 | 4 |
| 12 | 4 | 4 | 4 |
| 49 | 16 | 16 | 17 |

### 6.3 阶段权重与归一化

```
stageWeight = [1, 2, 4]  # 入门:小成:大成

rawLayerExp(L)   = BASE × catFactor × K^(L-1) × stageStepFactor(L) × expDifficulty
rawTotal         = Σ rawLayerExp
normFactor       = totalExp / rawTotal
实际 expToNext(L) = rawLayerExp(L) × normFactor
```

### 6.4 属性的阶段化

```
stageAttrWeight = [1, 2, 4]  # 入门:小成:大成 占总属性的权重

入门总属性 = T × 1/7
小成总属性 = T × 2/7
大成总属性 = T × 4/7

每层每维属性 = 阶段该维总属性 / 该阶段层数 × attrRatio[维]
```

### 6.5 升阶跳跃效果

| 阶段边界 | 经验倍率 | 属性倍率 |
|---|:---:|:---:|
| 入门 → 小成 | ×2.20 | ×2.00 |
| 小成 → 大成 | ×2.20 | ×2.00 |

阶段内部保留 K=1.10 的平滑递增，阶段边界有明显跃迁感。

### 6.6 样例（黄阶 Lv23 内功，9 层）

```
BASE = 4 × 28 = 112
totalExp = 112 × 1.0 × (1.10^9 - 1)/0.1 × 1.0 = 1521
T_attr = 242
```

| 层 | 阶段 | 升级经验 | 每维属性 |
|:---:|:---:|---:|---:|
| 1 | 入门 | 43 | 11.5 |
| 2 | 入门 | 47 | 11.5 |
| 3 | 入门 | 52 | 11.5 |
| 4 | 小成 | 114 | 23.1 |
| 5 | 小成 | 125 | 23.1 |
| 6 | 小成 | 138 | 23.1 |
| 7 | 大成 | 303 | 46.1 |
| 8 | 大成 | 333 | 46.1 |
| 9 | 大成 | 367 | 46.1 |

---

## 7. 新 JSON 规范

### 7.1 字段定义

```ts
interface TechniqueTemplate {
  id: string;
  name: string;
  desc?: string;
  category: 'arts' | 'internal' | 'divine' | 'secret';
  grade: TechniqueGrade;
  realmLv: number;

  // 仅 internal 有效
  attrRatio?: Partial<Record<AttrKey, number>>;
  attrFloat?: number;                    // 默认 0，范围 [-0.15, +0.10]

  // 仅 arts 有效
  skills?: SkillDef[];                   // AI 输出的完整技能结构

  maxLayer?: number;                     // 默认 9，范围 [3, 49]
  expDifficulty?: number;                // 默认 1.0，范围 [0.5, 2.0]
}
```

### 7.2 新旧对比

**旧格式（87 行）**：

```json
{
  "id": "chiqi_ranqiao",
  "name": "赤息燃窍功",
  "category": "internal",
  "grade": "yellow",
  "realmLv": 23,
  "layers": [
    { "level": 1,  "expFactor": 72,  "attrs": { "spirit": 6, "strength": 7, "meridians": 6 } },
    { "level": 2,  "expFactor": 80,  "attrs": { "spirit": 6, "strength": 7, "meridians": 6 } },
    { "level": 3,  "expFactor": 88,  "attrs": { "spirit": 6, "strength": 7, "meridians": 6 } },
    /* ... 再 9 层 ... */
  ]
}
```

**新格式（11 行）**：

```json
{
  "id": "chiqi_ranqiao",
  "name": "赤息燃窍功",
  "desc": "赤息入窍，如烈火烹油，烧开周身关隘。",
  "category": "internal",
  "grade": "yellow",
  "realmLv": 23,
  "attrRatio":     { "spirit": 0.31, "strength": 0.37, "meridians": 0.32 },
  "attrFloat":     -0.029,
  "maxLayer":      9,
  "expDifficulty": 1.0
}
```

**瘦身 ~87%**。

### 7.3 默认值规则

| 字段 | 省略时取值 |
|---|---|
| `maxLayer` | 9 |
| `expDifficulty` | 1.0 |
| `attrFloat` | 0 |
| `attrRatio` | `{}`（非 internal 类省略） |
| `desc` | 空 |
| `skills` | 不生效（非 arts 省略） |

极简例：

```json
{ "id": "liuyun", "name": "流云刀谱", "category": "arts", "grade": "yellow", "realmLv": 13 }
```

5 行即可，全部走默认。

### 7.4 运行时展开（服务端启动/加载时）

```ts
function expandTechnique(def: TechniqueTemplate): TechniqueRuntime {
  const g = gradeIdx(def.grade);
  const maxLayer = def.maxLayer ?? 9;
  const expDifficulty = def.expDifficulty ?? 1.0;

  // 阶段分层
  const per = Math.floor(maxLayer / 3);
  const stages = [per, per, maxLayer - 2 * per];

  // 属性展开（仅 internal）
  if (def.category === 'internal') {
    const r = def.attrFloat ?? 0;
    const T = (g * g * (def.realmLv + 25) + 50) * (1 + r);
    const sw = [1, 2, 4];
    const swSum = 7;

    // 每阶段总属性
    const stageTotals = sw.map(w => T * w / swSum);

    // 每层每维
    const ratioSum = Object.values(def.attrRatio ?? {}).reduce((a, b) => a + b, 0);
    for (let L = 1; L <= maxLayer; L++) {
      const s = (L <= stages[0]) ? 0 : (L <= stages[0] + stages[1]) ? 1 : 2;
      const perLayer = stageTotals[s] / stages[s];
      for (const [attr, w] of Object.entries(def.attrRatio ?? {})) {
        attrsPerLayer[L][attr] = Math.round(perLayer * w / ratioSum);
      }
    }
  }

  // 经验展开
  const BASE = g * g * (def.realmLv + 5);
  const catFactor = CAT_FACTOR[def.category];
  const K = 1.10;
  const totalExp = BASE * catFactor * (Math.pow(K, maxLayer) - 1) / (K - 1) * expDifficulty;

  const rawPerLayer: number[] = [];
  for (let L = 1; L <= maxLayer; L++) {
    const s = (L <= stages[0]) ? 0 : (L <= stages[0] + stages[1]) ? 1 : 2;
    const stageStep = [1, 2, 4][s];
    rawPerLayer.push(BASE * catFactor * Math.pow(K, L - 1) * stageStep * expDifficulty);
  }
  const rawTotal = rawPerLayer.reduce((a, b) => a + b, 0);
  const normFactor = totalExp / rawTotal;
  for (let L = 1; L <= maxLayer; L++) {
    expToNext[L] = Math.round(rawPerLayer[L - 1] * normFactor);
  }

  // 技能展开（仅 arts）
  if (def.category === 'arts') {
    for (const skill of def.skills ?? []) {
      // 按 BUDGET(layer) 分配预算并反推真实技能效果
      expandSkillWithBudget(skill, g, def.realmLv, maxLayer);
    }
  }

  return runtime;
}
```

---

## 8. AI 生成流程

### 8.1 端到端流程

```
1. 玩家触发  → 品阶、类别、境界、主题描述
     ↓
2. 前置校验 → 资源消耗、速率限制、playerContext 注入过滤
     ↓
3. 构造 Prompt → 从 TS 类型导出的 JSON Schema + 白名单枚举 + 任务描述
     ↓
4. 调用 LLM (structured output) → 直接输出合法 JSON
     ↓
5. 三层校验
   a. 结构 (ajv 按 schema)
   b. 语义 (白名单引用、AST 深度 ≤ 6、预算分配可执行)
   c. 业务 (类别不是 divine/secret、浮动在 ±15%/+10% 内)
     ↓
6. 预算展开 → 按预算公式生成运行时数据
     ↓
7. 写入 draft 草稿表
     ↓
8. 玩家预览 + 命名 + 确认
     ↓
9. 高品阶 → GM 审核队列
     ↓
10. 发布 (is_published=true)
     ↓
11. 合并进 ContentTemplateRepository 缓存
```

### 8.2 Schema 导出

从 `packages/shared/src/*.ts` 的 TS 类型导出 JSON Schema 作为 LLM 的约束：

- **工具选型**：`ts-json-schema-generator`（非侵入，构建期生成产物入仓）
- **产物**：`packages/shared/src/schema-export/generated/technique-template.schema.json`
- **更新时机**：类型变动时在 CI 重新生成

### 8.3 Prompt 结构

```
system:
  你是修仙游戏的功法设计师。根据玩家需求生成一个完整的功法 JSON。
  严格遵循下方 schema，不要生成 schema 里不允许的字段。

context:
  - 品阶:    yellow
  - 类别:    arts | internal
  - 境界:    realmLv=23
  - 玩家主题: {已清洗的 playerContext}
  - 允许的战斗属性: attack / spellAtk / crit / hit / ...
  - 允许的修饰乘数: 移速 / 功法层数 / 境界等级 / 技艺等级
  - 允许的 buffId: {从 BuffRegistry 枚举}

response_format:
  { "type": "json_schema", "schema": <TechniqueTemplate schema> }

user:
  生成一个 {品阶}{类别}功法，适合 realmLv {N} 的玩家。
  主题：{playerContext}
```

**不注入策划 few-shot**：预算展开已兜数值，Prompt 只需描述结构即可。

### 8.4 三层校验

```ts
// 1. 结构
const ajv = new Ajv();
const validate = ajv.compile(techniqueSchema);
if (!validate(json)) return reject('schema violation', validate.errors);

// 2. 语义
if (json.category === 'divine' || json.category === 'secret') reject();
if (json.attrFloat < -0.15 || json.attrFloat > 0.10) reject();
for (const skill of json.skills ?? []) {
  if (astDepth(skill.formula) > 6) reject('AST too deep');
  for (const varNode of collectVars(skill.formula)) {
    if (!WHITELIST_VARS.has(varNode)) reject();
  }
  for (const buffId of collectBuffs(skill)) {
    if (!buffRegistry.has(buffId)) reject();
  }
}

// 3. 业务
const runtime = expandTechnique(json);
// 预算展开过程里已经自动把超额权重压回预算，不会失败
// 但若完全没有有效效果（全 0），拒绝
if (runtime.effectiveBudgetUsed < 0.1) reject('empty technique');
```

校验失败带错误信息反馈给 LLM 重试一次，再失败则拒绝。

---

## 9. 数据层

### 9.1 表结构

```sql
CREATE TABLE generated_technique (
  id                    VARCHAR(64) PRIMARY KEY,
  template              JSONB NOT NULL,          -- 完整 TechniqueTemplate
  schema_version        INT NOT NULL,            -- 演进迁移依据

  status                VARCHAR(16) NOT NULL,    -- draft / pending_review / published / rejected
  usage_scope           VARCHAR(16) DEFAULT 'player_only',  -- 初期锁此值

  created_by_player_id  INT,
  model_name            VARCHAR(64),
  prompt_snapshot       TEXT,                    -- 审计用
  validation_report     JSONB,                   -- 校验结果快照

  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  published_at          TIMESTAMP
);

CREATE INDEX idx_generated_technique_status ON generated_technique(status);
CREATE INDEX idx_generated_technique_owner  ON generated_technique(created_by_player_id);
```

**建表落点**：走现有 `deploy-database-preflight` 的 ensure schema 链路，不引入新 migration 机制。

### 9.2 缓存服务

```ts
@Injectable()
export class GeneratedTechniqueStoreService {
  private cache = new Map<string, TechniqueTemplate>();

  async onModuleInit() { await this.loadPublished(); }

  async loadPublished(): Promise<void> {
    const rows = await this.pool.query(
      "SELECT template FROM generated_technique WHERE status = 'published'"
    );
    this.cache.clear();
    for (const row of rows) {
      const tpl = row.template as TechniqueTemplate;
      this.cache.set(tpl.id, tpl);
    }
  }

  async refreshAfterPublish(): Promise<void> {
    await this.loadPublished();
    this.contentTemplateRepository.invalidateTechniqueCache();
  }

  listAll(): TechniqueTemplate[] { return [...this.cache.values()]; }
}
```

### 9.3 `ContentTemplateRepository` 合并视图

在现有 Repository 上加只读合并方法，**不扩散 `invalidate` 语义到 40 个调用点**：

```ts
listTechniqueTemplates(): TechniqueTemplate[] {
  this.ensureCacheValid();
  return [...this.staticTechniques, ...this.generatedStore.listAll()];
}
```

### 9.4 热路径红线

- 运行时战斗、tick、AOI、广播必须**共享同一个 `TechniqueTemplate` 运行时展开结构**
- 禁止在战斗路径解析原始 `attrRatio` / `skills` JSON
- 生成功法加载后一次性展开进 runtime，之后走与静态功法完全相同的代码路径

### 9.5 多实例一致性

未来上 Docker Swarm 多实例时：

- 使用 Redis pub/sub 广播 `technique_published` 事件
- 或通过 outbox 事件分发到各实例触发 `refreshAfterPublish`

初期单实例场景不需要。

---

## 10. 安全与运营

### 10.1 LLM 账单熔断

- **单玩家日额度**：默认 5 次/天
- **全服并发上限**：默认 20 并发
- **单次调用超时**：60 秒
- **预算告警**：日成本超阈值 → 告警 + 暂停生成入口
- **全链路成本计量**：prompt tokens + completion tokens + 模型单价

### 10.2 玩家侧资源门槛

生成功法必须绑定资源消耗，防白嫖：

- 洞府研修专用入口
- 消耗"功法残页"道具 + 灵石
- 每日生成次数上限
- 连续生成冷却

### 10.3 Prompt 注入防御

`playerContext` 进入 system prompt 前必须：

- 长度截断（≤ 200 字）
- 剥离控制字符、markdown 代码块标记
- 拒绝角色扮演指令（`ignore previous instructions` / `you are now` 等）
- 全量落审计日志

### 10.4 使用范围分阶段

```
usage_scope = 'player_only'  // 初期硬锁
usage_scope = 'tradeable'    // 二阶段开放
```

**初期禁止交易、邮寄、上架市场**，避免 AI 生成功法经过经济链路失衡。二阶段需要单独评审。

### 10.5 版本化与回滚

- `schema_version` 字段跟踪每次规则升级
- 升级时批量迁移或下架老版本功法
- 支持按 `schema_version` 批量下架异常版本

### 10.6 审计日志

- 生成、审核、发布、撤销、交易（二阶段）全部落 outbox
- 内容：`playerId`, `modelName`, `promptSnapshot`, `validationReport`, 时间戳
- 保留期：90 天

---

## 11. 存量迁移

### 11.1 迁移工具

位置：`packages/server/src/tools/migrate-techniques-to-new-format.ts`

功能：读取 `packages/server/data/content/techniques/**/*.json`，转换为新格式并校验。

### 11.2 内功迁移逻辑

```ts
function migrateInternal(old: LegacyTechnique): TechniqueTemplate {
  // 1. 汇总满层六维
  const totalAttrs = sumLayersAttrs(old.layers);
  const grandTotal = Object.values(totalAttrs).reduce((a, b) => a + b, 0);

  // 2. 反算 attrFloat
  const g = gradeIdx(old.grade);
  const base = g * g * (old.realmLv + 25) + 50;
  const attrFloat = grandTotal / base - 1;

  // 3. 反算 attrRatio
  const attrRatio: Record<string, number> = {};
  for (const [k, v] of Object.entries(totalAttrs)) {
    if (v > 0) attrRatio[k] = v / grandTotal;
  }

  return {
    id: old.id,
    name: old.name,
    desc: old.desc,
    category: 'internal',
    grade: old.grade,
    realmLv: old.realmLv,
    attrRatio,
    attrFloat: Math.max(-0.15, Math.min(0.10, attrFloat)),
    maxLayer: old.layers.length,
    expDifficulty: 1.0,   // 经验曲线重置为公式生成
  };
}
```

### 11.3 术法迁移逻辑

术法的 `skills[]` 结构保留，但需要按新预算重新展开：

```ts
function migrateArts(old: LegacyTechnique): TechniqueTemplate {
  return {
    id: old.id,
    name: old.name,
    desc: old.desc,
    category: 'arts',
    grade: old.grade,
    realmLv: old.realmLv,
    skills: old.layers?.[0]?.skills ?? [],  // 取第 1 层的技能结构
    maxLayer: old.layers?.length ?? 9,
    expDifficulty: 1.0,
  };
}
```

### 11.4 经验曲线重置

**不复刻现有 expFactor**，统一用新公式生成。影响：

- 黄阶练气 Lv23 功法：现有满层 1400 → 新公式 1521（+8.6%）
- 玄阶练气 Lv23 功法：现有满层 3720 → 新公式 4017（+8.0%）
- 地阶练气 Lv27 功法：现有满层 6004 → 新公式 8161（+35.9%）
- 凡阶功法：数值约翻 3 倍（现有曲线偏低）

玩家侧需要告知："本次版本更新对功法修炼曲线进行了规范化，整体升级经验有调整"。

### 11.5 迁移校验

迁移脚本跑完后自动校验：

- 每本功法满层总六维变化 ≤ 15%
- 每本功法六维分布与老版本的 cosine similarity ≥ 0.9
- 经验曲线按新公式生成，不比对
- 输出 diff 报告供策划审核

---

## 12. 实施路线图

总计约 **7 周**。

### 阶段 0（1 周）：LLM 调用基础设施

- 统一 LLM 客户端封装（`packages/server/src/runtime/ai/`）
  - Structured Output 支持
  - 超时、重试、失败熔断
  - 成本计量、账单告警
  - Prompt 注入过滤
- 全服并发/单玩家速率限制
- 审计日志落 outbox

### 阶段 1（2 周）：预算系统实现

- 常量表 `packages/shared/src/constants/gameplay/power-budget.ts`：
  - `POWER_BUDGET_ATTR_COEF`（属性系数表）
  - `POWER_BUDGET_STAGE_WEIGHT = [1, 2, 4]`
  - `CAT_EXP_FACTOR`
- 预算分配解析器：
  - 技能权重 → itemBudget → 真实值
  - 触顶/触底预算回流
  - Buff 系数链
- UI 反向渲染：`attrRatio + attrFloat → 显示值`
- 战斗路径接入新运行时结构，不改变 `SkillDef` 外形

### 阶段 2（1 周）：存量迁移

- 迁移工具（`tools/migrate-techniques-to-new-format.ts`）
- 迁移校验报告
- 老 layers 字段在启动期自动转换（过渡期兼容）
- 整轮 smoke 覆盖

### 阶段 3（1 周）：Schema 导出 + 校验器

- `ts-json-schema-generator` 集成
- 三层校验链路
- 失败反馈重试机制（最多 1 次）

### 阶段 4（0.5 周）：数据层

- `generated_technique` 表建 + preflight
- `GeneratedTechniqueStoreService` + 缓存刷新
- `ContentTemplateRepository` 合并视图

### 阶段 5（1 周）：玩家交互与审核

- 生成入口（洞府研修面板走 `react-ui`，三端适配）
- 生成预览 + 命名 + 发布流程
- GM 审核队列
- 功法残页/灵石消耗链路

### 阶段 6（0.5 周）：验证套件与门禁

- `pnpm --filter @mud/server smoke:ai-technique-generation`：全链路 + 自动清理
- `pnpm --filter @mud/server proof:ai-technique-balance`：沙盒对标异常监控（软告警）
- `pnpm audit:protocol` 纳入新协议
- 接入 `pnpm verify:quick` 可选档位

---

## 13. 决策封顶清单

| 维度 | 最终决策 |
|---|---|
| 功法分类 | 术法/内功 开放 AI；神通/秘术 锁死 |
| 内功属性公式 | `T = (g²·(realmLv+25) + 50) × (1 + attrFloat)` |
| 属性浮动 r | 默认 0，范围 `[-0.15, +0.10]` |
| 六维分配 | `attrRatio` 权重，服务端归一 |
| 技能预算公式 | `BUDGET_max = 3 + realmLv·1.4^(g-1)·majorRealmMultiplier` |
| 技能数量 | 首版每功法 1 个 |
| 技能倍率 | 每 100% = 1 点 |
| 技能修饰乘数白名单 | 移速 10 / 境界 0.05 / 功法层 0.1 / 技艺 0.2 点/% |
| Buff 公式 | `percent × 0.1 × 叠层 × duration × √chance × 应用层数` |
| Buff 目标 | 任意战斗属性（不受白名单约束） |
| 术法预算展开 | 权重切分为 itemBudget，再按各项转换公式反推真实值 |
| 经验 BASE | `g² × (realmLv + 5)` |
| 经验 K | 1.10 |
| catFactor | `internal:1.0, arts:0.5, secret:1.0, divine:1.0` |
| maxLayer | 默认 9，范围 `[3, 49]` |
| 阶段划分 | 1/3 切分，余数归大成 |
| 阶段权重 | `[1, 2, 4]` |
| expDifficulty | 默认 1.0，范围 `[0.5, 2.0]` |
| 存量迁移 | 属性反算 attrFloat+attrRatio；经验曲线重置 |
| tradeable | 初期锁 `player_only` |
| schema_version | 从 1 起步，升级时批量迁移 |

---

## 14. 附录

### 14.1 完整公式速查

```
# 内功总六维
T = (g² × (realmLv + 25) + 50) × (1 + attrFloat)

# 技能总预算（满层）
BUDGET_max = 3 + realmLv × 1.4^(g - 1) × majorRealmMultiplier
BUDGET(L)  = BUDGET_max × L / maxLayer

# Buff 消耗
buff_cost = percent × 0.1
          × (1 + 0.5 × (maxStack - 1))
          × (1 + 0.5 × (duration - 10) / 10)
          × √chance
          × (1 + 0.5 × (stacksPerApply - 1))

# 技能修饰乘数（白名单外拒绝）
cost_per_percent = {
  移速:          10.0,
  境界等级:      0.05,
  功法层数:      0.1,
  技艺等级:      0.2,
}

# 技能预算分配
totalWeight    = Σ abs(itemWeight)
positiveWeight = Σ max(itemWeight, 0)
正权重 itemBudget(i) = BUDGET(L) × itemWeight(i) / positiveWeight
负权重 itemBudget(i) = BUDGET(L) × itemWeight(i) / totalWeight
真实效果值            = convertByItem(itemBudget)

# 经验
BASE      = g² × (realmLv + 5)
catFactor = { internal: 1.0, arts: 0.5, secret: 1.0, divine: 1.0 }
K         = 1.10
totalExp  = BASE × catFactor × (K^maxLayer - 1) / (K - 1) × expDifficulty

# 阶段
stageLayers    = [floor(n/3), floor(n/3), n - 2·floor(n/3)]  # 入门/小成/大成
stageStep      = [1, 2, 4]                                    # 经验 & 属性权重

# 每层经验（归一化后）
rawExp(L)      = BASE × catFactor × K^(L-1) × stageStep[s(L)] × expDifficulty
normFactor     = totalExp / Σ rawExp
expToNext(L)   = rawExp(L) × normFactor

# 每层每维属性
T_per_stage[s] = T × stageStep[s] / 7
attrs(L)[attr] = T_per_stage[s(L)] / stageLayers[s(L)] × attrRatio[attr] / Σ attrRatio
```

### 14.2 白名单枚举

**战斗属性**（可作为 `base.attr`、buff 目标，不作修饰乘数）：

```
attack / spellAtk / physDef / spellDef
maxHp / maxQi
crit / antiCrit / hit / dodge / critDamage
breakPower / resolvePower
```

**修饰乘数白名单**（仅作 `scaleAttr` 修饰）：

```
moveSpeed              # 10  点/%
realmLv                # 0.05 点/%
techniqueLayer         # 0.1  点/%
craftLv.alchemy        # 0.2  点/%
craftLv.forge
craftLv.fengshui
...（可扩展，新增必须同步系数表）
```

**Buff 目标属性**（不受白名单约束）：

任意战斗属性 + 移速（但每 1% = 1 点基础，不走白名单系数）。

### 14.3 相关文档

- [功法加成设计](./功法加成设计.md) — 策划人工调配数据（本方案的历史输入）
- [基准基础属性值](../balance/基准基础属性值.md) — 指数属性曲线验证
- [境界等级基准期望六维公式](../balance/境界等级基准期望六维公式.md) — 内功公式依据
- `packages/shared/src/constants/gameplay/realm.ts` — `PLAYER_REALM_STAGE_LEVEL_RANGES`（境界阶段索引来源）
- `packages/shared/src/constants/gameplay/technique.ts` — `TECHNIQUE_GRADE_ORDER`（品阶索引来源）
