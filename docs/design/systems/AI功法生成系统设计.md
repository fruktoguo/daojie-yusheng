# AI 功法生成系统设计

## 1. 系统概述

通过 AI 动态生成合法、平衡、可运营的功法。核心保证：

- **数值安全**：占比预算制 + 分项转换，AI 输出权重而非绝对值
- **结构安全**：JSON Schema + 白名单校验，拒绝非法结构
- **热路径零开销**：生成后一次性展开，运行时走与静态功法完全相同的代码路径
- **可复用**：AI 服务层抽象为通用基础设施，后续 AI 功能（NPC 对话、任务生成等）可直接复用

---

## 2. 模块架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        玩家交互层                                 │
│  背包使用悟道玉简 → 功法领悟界面 → Socket Handler                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     功法生成业务层                                 │
│  TechniqueGenerationService                                      │
│  ├─ 前置校验（道具消耗/境界门槛）                                  │
│  ├─ 品阶与境界随机                                                │
│  ├─ 任务状态机（pending → draft → learned）                       │
│  ├─ Prompt 构造                                                  │
│  ├─ 候选校验（三层防线）                                           │
│  └─ 确认学习与缓存刷新                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    通用 AI 服务层（可复用）                         │
│  AiTaskExecutionService                                          │
│  ├─ AiTextClient（已有：OpenAI/Anthropic/Compatible）             │
│  ├─ AiProviderConfigService（已有：scope 化多模型）                │
│  ├─ AiTokenMeter（全服 token 消耗记录）                           │
│  ├─ AiPromptSanitizer（注入过滤）                                 │
│  └─ AiRetryPolicy（超时/重试/熔断）                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        数据层                                     │
│  ├─ generated_technique 表（JSONB 存完整 TechniqueTemplate）      │
│  ├─ technique_generation_job 表（任务状态机）                      │
│  ├─ GeneratedTechniqueStoreService（内存缓存 + 签名刷新）          │
│  └─ ContentTemplateRepository 合并视图                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 通用 AI 服务层（可复用）

### 3.1 设计目标

抽象出与"功法生成"无关的 AI 调用基础设施，后续 AI 功能只需关注 Prompt 和校验逻辑。

### 3.2 模块清单

| 模块 | 文件位置 | 职责 |
|---|---|---|
| AiTextClient | `ai/ai-text-client.ts`（已有） | 统一调用 OpenAI/Anthropic/Compatible |
| AiProviderConfigService | `ai/ai-provider-config.service.ts`（已有） | scope 化模型配置管理 |
| AiTokenMeter | `ai/ai-token-meter.ts`（新增） | 全服 AI token 消耗记录（in/out） |
| AiPromptSanitizer | `ai/ai-prompt-sanitizer.ts`（新增） | 玩家输入清洗 + 注入防御 |
| AiRetryPolicy | `ai/ai-retry-policy.ts`（新增） | 超时/重试/熔断策略 |
| AiTaskExecutionService | `ai/ai-task-execution.service.ts`（新增） | 编排上述模块的统一入口 |

### 3.3 AiTaskExecutionService 接口

```ts
interface AiTaskRequest {
  taskType: string;             // 业务标识（technique_generation / npc_dialogue / ...）
  modelScope?: string;          // 模型 scope
  playerId: number;             // 发起玩家
  systemMessage: string;
  userMessage: string;
  responseFormat?: 'json_object' | 'text';
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;          // 校验失败时最大重试
}

interface AiTaskResult {
  success: boolean;
  content: string;
  modelName: string;
  promptSnapshot: string;
  attemptCount: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  error?: string;
}
```

### 3.4 AiTokenMeter

全服级 token 消耗统计，不做玩家级限额。

```ts
interface AiTokenUsageRecord {
  taskType: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  timestamp: number;
}

class AiTokenMeter {
  /** 每次 AI 调用后记录（异步写 outbox，不阻塞） */
  record(usage: AiTokenUsageRecord): void;

  /** GM 查询：全服累计 / 按天 / 按 taskType */
  async queryUsage(filter?: { from?: Date; to?: Date; taskType?: string }): Promise<{
    totalPromptTokens: number;
    totalCompletionTokens: number;
  }>;
}
```

### 3.5 AiPromptSanitizer

```ts
function sanitizePlayerContext(raw: string): string {
  // 1. 长度截断 ≤ 200 字
  // 2. 剥离控制字符、markdown 代码块标记
  // 3. 拒绝角色扮演指令模式匹配
  // 4. 返回清洗后文本
}
```

拒绝模式（正则匹配后直接返回空字符串）：
- `ignore previous instructions`
- `you are now`
- `system:`
- `<|im_start|>`

### 3.6 AiRetryPolicy

```ts
interface AiRetryConfig {
  maxAttempts: number;                  // 默认 2（首次 + 1 次重试）
  retryDelayMs: number;                 // 默认 1000
  timeoutMs: number;                    // 默认 60_000
  circuitBreakerThreshold: number;      // 连续失败 N 次暂停，默认 10
  circuitBreakerCooldownMs: number;     // 熔断冷却，默认 300_000
}
```

重试策略：
- 超时/网络错误 → 直接重试
- 校验失败 → 带错误信息反馈给 LLM 重试（`retryGuidance`）
- 熔断触发 → 拒绝新请求，等待冷却期

---

## 4. 功法生成业务层

### 4.1 模块结构

```
packages/server/src/runtime/technique-generation/
├── technique-generation.service.ts       # 主服务（状态机编排）
├── technique-generation.types.ts         # 业务类型定义
├── technique-generation-roll.ts          # 品阶/境界随机逻辑
├── technique-prompt-builder.ts           # Prompt 构造器
├── technique-candidate-validator.ts      # 三层校验器
├── technique-budget-normalizer.ts        # 术法预算分配与真实值反推
├── technique-generation-constants.ts     # 业务常量
└── technique-generation-outbox.ts        # 审计日志
```

### 4.2 品阶与境界随机

#### 通用非对称衰减分布模型

realmLv 和品阶共用同一套概率模型：

```
规则：
- 50% 命中基准值
- 剩余 50% 按方向分配：低方向 75%（即总概率 37.5%），高方向 25%（即总概率 12.5%）
- 同方向内越偏离基准概率越低（按几何衰减）
```

设计意图：大概率拿到匹配当前实力的功法，偶尔出低级过渡品，极小概率出高品（机缘感）。

#### realmLv 随机

基准 = 玩家当前 `realmLv`，浮动范围 ±6：

```ts
function rollTechniqueRealmLv(playerRealmLv: number): number {
  const base = playerRealmLv;
  const maxOffset = 6;

  // 50% 命中基准
  if (random() < 0.5) return clamp(base, 1, 127);

  // 剩余 50%：低方向 75%，高方向 25%
  const goHigh = random() < 0.25;
  // 几何衰减：offset 1~6，越大概率越低
  const offset = rollGeometricOffset(maxOffset);

  const result = goHigh ? base + offset : base - offset;
  return clamp(result, 1, 127);
}

// 几何衰减：offset=1 概率最高，每增加 1 概率减半
function rollGeometricOffset(max: number): number {
  for (let i = 1; i <= max; i++) {
    if (random() < 0.5) return i;
  }
  return max;
}
```

#### 基准品阶确定

根据随机出的 `realmLv` 落在哪些品阶区间，按**区间覆盖比例**确定基准品阶：

品阶有效区间（来源：`docs/design/balance/境界等级基准期望六维公式.md`）：

| 品阶 | fromRealmLv | toRealmLv |
|---|---|---|
| 凡阶 | 1 | 18 |
| 黄阶 | 9 | 30 |
| 玄阶 | 19 | 42 |
| 地阶 | 25 | 54 |
| 天阶 | 31 | 86 |
| 灵阶 | 64 | 110 |
| 圣阶 | 98 | 134 |
| 帝阶 | 122 | 158 |

```ts
function resolveBaseGrade(realmLv: number): TechniqueGrade {
  // 1. 筛选 realmLv 落在 [from, to] 内的所有品阶
  const hits = TECHNIQUE_GRADE_REALM_BANDS
    .filter(band => realmLv >= band.fromRealmLv && realmLv <= band.toRealmLv);

  // 2. 计算每个命中品阶的"覆盖权重"
  //    权重 = 1 / 区间宽度（区间越窄说明越精准匹配）
  //    或用 realmLv 在区间内的归一化位置做加权
  const weighted = hits.map(band => ({
    grade: band.grade,
    weight: 1 / (band.toRealmLv - band.fromRealmLv + 1),
  }));

  // 3. 按权重选出基准品阶（取权重最高的）
  return weighted.sort((a, b) => b.weight - a.weight)[0].grade;
}
```

示例：realmLv=35
- 玄阶 [19,42] 宽度 24 → 权重 1/24
- 地阶 [25,54] 宽度 30 → 权重 1/30
- 天阶 [31,86] 宽度 56 → 权重 1/56
- 基准 = 玄阶（区间最窄，最精准匹配）

#### 品阶浮动

在基准品阶上下浮动 ±2 档，使用同一套非对称衰减分布：

```ts
function rollTechniqueGrade(realmLv: number): TechniqueGrade {
  const baseGrade = resolveBaseGrade(realmLv);
  const baseIndex = TECHNIQUE_GRADE_ORDER.indexOf(baseGrade);

  // 50% 命中基准
  if (random() < 0.5) return baseGrade;

  // 剩余 50%：低方向 75%，高方向 25%
  const goHigh = random() < 0.25;
  // 几何衰减：offset 1~2
  const offset = random() < 0.5 ? 1 : 2;

  const targetIndex = goHigh ? baseIndex + offset : baseIndex - offset;
  return TECHNIQUE_GRADE_ORDER[clamp(targetIndex, 0, TECHNIQUE_GRADE_ORDER.length - 1)];
}
```

#### 概率分布示例（基准=地阶）

| 品阶 | 概率 | 说明 |
|---|---|---|
| 黄阶 | ~9.4% | 低方向 offset=2 |
| 玄阶 | ~18.8% | 低方向 offset=1 |
| **地阶** | **50%** | 基准 |
| 天阶 | ~6.3% | 高方向 offset=1 |
| 灵阶 | ~3.1% | 高方向 offset=2 |

（低方向总计 ~28.1%，高方向总计 ~9.4%，不含 clamp 边界修正）

### 4.3 TechniqueGenerationService 核心方法

```ts
@Injectable()
class TechniqueGenerationService {
  /** 发起生成（消耗悟道玉简 + 建任务 + 异步执行） */
  async requestGeneration(params: {
    playerId: number;
    category: 'internal' | 'arts';
    playerContext?: string;
  }): Promise<GenerationJobResult>;

  /** 执行生成（AI 调用 + 校验 + 落草稿）[异步 Worker] */
  async executeGeneration(jobId: string): Promise<GenerationExecutionResult>;

  /** 玩家确认采纳 → 直接学习 */
  async adoptDraft(params: {
    playerId: number;
    jobId: string;
    customName: string;
  }): Promise<AdoptResult>;

  /** 放弃草稿 */
  async discardDraft(playerId: number, jobId: string): Promise<void>;

  /** 查询当前状态 */
  async getStatus(playerId: number): Promise<GenerationStatus>;

  /** 过期草稿清理（定时任务） */
  async expireStaleJobs(): Promise<number>;
}
```

### 4.4 生成流程时序

```
玩家在背包使用"悟道玉简"
  │
  ▼
打开功法领悟界面（独立面板）
  ├─ 选择分类 tab：内功 / 术法 / [神通] / [秘术]（后两者灰色锁定）
  ├─ 输入提示词（可选，≤200字）
  └─ 点击"开始领悟"
  │
  ▼
requestGeneration()
  ├─ 校验玩家境界 ≥ 筑基期（realmLv ≥ 31）     → 不满足拒绝
  ├─ 校验并消耗悟道玉简（背包扣除 1 个）         → 不足拒绝
  ├─ rollTechniqueRealmLv(playerRealmLv)        → 随机功法 realmLv
  ├─ rollTechniqueGrade(rolledRealmLv)          → 随机品阶
  └─ INSERT technique_generation_job (status=pending)
  │
  ▼
executeGeneration(jobId)  [异步 Worker / setImmediate]
  ├─ 读取 job 参数（category, grade, realmLv, playerContext）
  ├─ TechniquePromptBuilder.build(...)
  ├─ AiTaskExecutionService.execute(request)
  │     ├─ AiPromptSanitizer.sanitize(playerContext)
  │     ├─ AiTextClient.call()
  │     ├─ AiTokenMeter.record()
  │     └─ AiRetryPolicy（失败重试 1 次）
  ├─ JSON.parse(result.content)
  ├─ TechniqueCandidateValidator.validate(candidate)
  │     ├─ Layer 1: 结构校验（ajv schema）
  │     ├─ Layer 2: 语义校验（白名单/AST 深度）
  │     └─ Layer 3: 数值校验（预算分配可执行性）
  ├─ TechniqueBudgetNormalizer.normalize(candidate)  [仅 arts]
  ├─ 组装 TechniqueTemplate
  ├─ INSERT generated_technique (status=draft)
  ├─ UPDATE job (status=generated_draft, draft_expire_at=+24h)
  └─ 推送 notify 给玩家
  │
  ▼
玩家预览草稿
  ├─ 满意 → 输入自定义名称 → adoptDraft()
  │     ├─ 校验命名规则
  │     ├─ 校验全服唯一
  │     ├─ UPDATE generated_technique (is_published=true, display_name)
  │     ├─ UPDATE job (status=learned)
  │     ├─ GeneratedTechniqueStoreService.refreshAfterPublish()
  │     └─ 直接将功法加入玩家 techniques[]（等同学习）
  └─ 不满意 → discardDraft()（无退款，玉简已消耗）
```

### 4.5 三层校验器

```ts
class TechniqueCandidateValidator {
  validate(raw: unknown, category: TechniqueCategory): ValidationResult;
  private validateStructure(raw: unknown): ValidationResult;
  private validateSemantics(candidate: RawCandidate): ValidationResult;
  private validateNumerics(candidate: RawCandidate): ValidationResult;
}
```

| 层 | 检查内容 |
|---|---|
| 结构 | ajv schema 校验、字段类型、必填项 |
| 语义 | category 限制（仅 internal/arts）、attrFloat 范围、SkillFormulaVar 白名单、buffId 合法、AST 深度 ≤ 6 |
| 数值 | attrRatio 权重和 > 0、expDifficulty 范围、预算分配可执行（非全零效果） |

### 4.6 术法预算分配

公式（详见 `docs/design/balance/术法预算量化设计.md`）：
- `BUDGET_max = 3 + realmLv × 0.5 × 1.4^(g-1) × majorRealmMultiplier`
- `BUDGET(layer) = BUDGET_max × layer / maxLayer`
- `totalWeight = Σ abs(itemWeight)`，`positiveWeight = Σ max(itemWeight, 0)`
- 正权重：`itemBudget = BUDGET(layer) × itemWeight / positiveWeight`
- 负权重：`itemBudget = BUDGET(layer) × itemWeight / totalWeight`
- 每项真实值由该项转换公式反推，冷却、消耗、施法距离、范围覆盖和公式基底各自处理上下限。
- 负权重只折算本项负预算，不进入正向分母，也不额外兑换成其它项正预算。
- 每个转换方法返回真实值、已使用预算和未使用预算；触顶或离散档位暂时用不完的正预算由上层预算分配器按固定轮次平均回流到仍可增长的项目。

---

## 5. 数据层

### 5.1 表结构：generated_technique

```sql
CREATE TABLE generated_technique (
  id                    VARCHAR(64) PRIMARY KEY,
  generation_id         VARCHAR(64) NOT NULL,
  template              JSONB NOT NULL,
  schema_version        INT NOT NULL DEFAULT 1,

  status                VARCHAR(16) NOT NULL DEFAULT 'draft',
  usage_scope           VARCHAR(16) NOT NULL DEFAULT 'player_only',
  is_published          BOOLEAN NOT NULL DEFAULT false,
  published_at          TIMESTAMPTZ,

  display_name          VARCHAR(64),
  normalized_name       VARCHAR(64),
  name_locked           BOOLEAN NOT NULL DEFAULT false,

  created_by_player_id  INT NOT NULL,
  model_name            VARCHAR(64),
  prompt_snapshot       TEXT,
  validation_report     JSONB,

  grade                 VARCHAR(16),
  category              VARCHAR(16),
  realm_lv              INT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_gen_tech_normalized_name
  ON generated_technique(normalized_name)
  WHERE is_published = true AND normalized_name IS NOT NULL;
CREATE INDEX idx_gen_tech_status
  ON generated_technique(status, created_at DESC);
CREATE INDEX idx_gen_tech_owner
  ON generated_technique(created_by_player_id, created_at DESC);
CREATE INDEX idx_gen_tech_published
  ON generated_technique(is_published, created_at DESC)
  WHERE is_published = true;
```

### 5.2 表结构：technique_generation_job

```sql
CREATE TABLE technique_generation_job (
  id                    VARCHAR(64) PRIMARY KEY,
  player_id             INT NOT NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'pending',

  requested_category    VARCHAR(16),
  rolled_grade          VARCHAR(16),
  rolled_realm_lv       INT,
  player_context        VARCHAR(200),

  draft_technique_id    VARCHAR(64),
  model_name            VARCHAR(64),
  attempt_count         INT NOT NULL DEFAULT 0,

  draft_expire_at       TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ,

  error_code            VARCHAR(32),
  error_message         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gen_job_player
  ON technique_generation_job(player_id, created_at DESC);
CREATE INDEX idx_gen_job_status
  ON technique_generation_job(status, created_at DESC);
```

### 5.3 任务状态机

```
pending ──────────► generated_draft ──────────► learned
   │                      │
   │                      ├──► expired (草稿超时)
   │                      └──► discarded (玩家放弃)
   │
   └──► failed (AI 调用失败/校验耗尽)
```

### 5.4 缓存服务

```ts
@Injectable()
class GeneratedTechniqueStoreService {
  private cache = new Map<string, TechniqueTemplate>();
  private lastSignature: { count: number; maxUpdatedAt: string } | null = null;

  async onModuleInit(): Promise<void> { await this.reload(); }

  async reload(): Promise<void> {
    const sig = await this.loadSignature();
    if (this.isSignatureEqual(sig)) return;
    const rows = await this.pool.query(
      `SELECT id, template FROM generated_technique
       WHERE is_published = true`
    );
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.id, row.template as TechniqueTemplate);
    }
    this.lastSignature = sig;
  }

  async refreshAfterPublish(): Promise<void> {
    this.lastSignature = null;
    await this.reload();
  }

  getById(id: string): TechniqueTemplate | undefined { return this.cache.get(id); }
  listAll(): TechniqueTemplate[] { return [...this.cache.values()]; }
}
```

### 5.5 与 TechniqueTemplateRegistry 合并

```ts
tryGetRef(techniqueId: string): TechniqueTemplateRecord | undefined {
  return this.techniqueTemplates.get(techniqueId)
    ?? this.generatedStore.getById(techniqueId);
}
```

关键保证：
- 缓存在 `onModuleInit` 时加载，早于玩家恢复
- `hydrate(techId)` 对生成功法和静态功法走同一路径
- 运行时展开后挂到 `TechniqueState.layers`，战斗/属性结算无感知

---

## 6. 玩家交互与协议

### 6.1 入口

玩家在背包中使用"悟道玉简"道具 → 打开独立的**功法领悟界面**。

界面包含：
- **分类 Tab**：内功 / 术法 / 神通（锁定） / 秘术（锁定）
- **提示词输入框**：可选，≤200 字，描述想要的功法主题/风格
- **开始领悟按钮**
- **预览区域**：生成完成后展示草稿详情
- **操作按钮**：采纳（需命名）/ 放弃

### 6.2 协议定义

```ts
// 请求
type TechniqueGenerationRequest =
  | { action: 'getStatus' }
  | { action: 'generate'; category: 'internal' | 'arts'; playerContext?: string }
  | { action: 'adopt'; jobId: string; customName: string }
  | { action: 'discard'; jobId: string };

// 响应
type TechniqueGenerationResponse = {
  status: GenerationStatus;
  draft?: TechniquePreview;
  error?: { code: string; message: string };
};

// 服务端推送（生成完成时）
type TechniqueGenerationNotify = {
  type: 'technique_generation_complete';
  jobId: string;
  result: 'success' | 'failed';
  preview?: TechniquePreview;
  errorMessage?: string;
};
```

### 6.3 GenerationStatus

```ts
type GenerationStatus = {
  available: boolean;             // 是否可用（境界 + 有玉简）
  unavailableReason?: string;     // 不可用原因

  currentJob: {
    jobId: string;
    status: string;
    category: string;
    rolledGrade: TechniqueGrade;
    rolledRealmLv: number;
    createdAt: string;
    draftExpireAt?: string;
  } | null;

  currentDraft: TechniquePreview | null;
};
```

### 6.4 TechniquePreview

```ts
type TechniquePreview = {
  techniqueId: string;
  suggestedName: string;
  grade: TechniqueGrade;
  category: TechniqueCategory;
  realmLv: number;
  desc: string;

  // 内功
  attrRatio?: Partial<Record<AttrKey, number>>;
  attrTotal?: number;

  // 术法
  skills?: Array<{
    name: string;
    desc: string;
    cooldown: number;
    effects: string[];
  }>;

  maxLayer: number;
  expDifficulty: number;
};
```

### 6.5 交互流程

```
1. 背包使用悟道玉简 → 打开功法领悟界面 → getStatus
   ├─ 境界不足 → 提示"需筑基期方可领悟"
   └─ 可用 → 显示分类选择 + 提示词输入

2. 选择分类 + 输入提示词 → 点击"开始领悟" → generate
   └─ 进入等待状态（10~30秒）

3. 等待生成
   ├─ 轮询 getStatus 或等待 notify 推送
   └─ 完成 → 显示预览（品阶/境界/属性/技能）

4. 预览草稿
   ├─ 满意 → 输入自定义名称 → adopt → 直接学习，功法加入已学列表
   └─ 不满意 → discard → 关闭界面（玉简已消耗，不退还）
```

---

## 7. 安全与运营

### 7.1 门槛

| 项目 | 配置 |
|---|---|
| 解锁条件 | 境界 ≥ 筑基前期（realmLv ≥ 31） |
| 消耗道具 | 悟道玉简 × 1 |
| 生成次数 | 无上限（受道具获取速率自然限制） |

### 7.2 Token 消耗记录

- 每次 AI 调用后通过 `AiTokenMeter` 异步记录 promptTokens + completionTokens
- GM 可查询全服累计消耗、按天/按 taskType 分组统计
- 不做玩家级限额，不做成本告警（由道具获取速率自然控制）

### 7.3 Prompt 注入防御

- 玩家 `playerContext` 经过 `AiPromptSanitizer` 清洗
- 长度截断 ≤ 200 字
- 剥离控制字符、markdown 代码块
- 正则拒绝角色扮演指令
- 全量落审计日志（`prompt_snapshot` 字段）

### 7.4 使用范围

```
初期：usage_scope = 'player_only'
  - 生成后直接学习，绑定创建者
  - 不可交易、邮寄、上架市场

二阶段（需单独评审）：
  - 可能开放功法书道具化流通
```

### 7.5 版本化

- `schema_version` 跟踪规则版本
- 升级时可按版本批量重新展开/下架/迁移
- GM 命令支持按 `schema_version` 批量操作
- 已发布 AI 术法的数据库模板保存的是展开后的 `SkillDef`，不是每次读取时动态按权重重算；预算、冷却、范围等公式变更只影响之后的新生成和重新展开。
- 存量术法公式同步的运营顺序固定为：先点 GM 快捷指令“迁移旧版AI术法草稿”，按当前代码从 `validation_report.artsStrength.rawCandidate` 重新展开并回写 `generated_technique.template.skills`；再点“刷新在线玩家功法模板”，让在线玩家身上的已学功法重新水合为最新技能。
- 离线玩家在下次登录恢复功法时读取最新模板，不需要单独批量修改玩家存档。公式常量调整时，GM 按钮本身不需要随公式改动而改动，除非草稿 schema 或按钮职责发生变化。

---

## 8. 与现有系统的集成点

### 8.1 玩家功法存储

采纳后直接学习：
- `TechniqueState.techId` = `generated_technique.id`
- 存档格式与静态功法完全一致
- 恢复时通过合并视图 `tryGetRef(techId)` 找到模板

### 8.2 战斗 / 属性系统

- 展开后的 `layers` / `skills` 与静态功法结构相同
- `calcTechniqueFinalAttrBonus()` 无需区分来源
- 术法预算分配与真实值反推保证数值在品阶预算内

### 8.3 道具系统

- 新增"悟道玉简"道具定义（`data/content/items/`）
- 使用效果：打开功法领悟界面（客户端处理）
- 物品来源后续单独配置

### 8.4 建表落点

走现有 `deploy-database-preflight` 的 ensure schema 链路。

---

## 9. 实施路线图

| Phase | 内容 | 周期 |
|---|---|---|
| 0 | 通用 AI 服务层（TokenMeter / Sanitizer / RetryPolicy / TaskExecution） | 1 周 |
| 1 | 数据层（两张表 + preflight + 缓存服务 + Registry 合并） | 0.5 周 |
| 2 | 校验与预算展开（三层校验 + 术法预算 + Schema 导出） | 1 周 |
| 3 | 生成业务层（Service + PromptBuilder + 品阶随机 + 异步执行） | 1.5 周 |
| 4 | 协议与前端（handler + 功法领悟界面 + 三端适配） | 1 周 |
| 5 | 运营工具（GM 查询/禁用 + token 报表） | 0.5 周 |

---

## 10. 决策记录

| 维度 | 决策 | 理由 |
|---|---|---|
| 存储 | 单表 JSONB | 与静态功法格式一致，零 JOIN |
| 入口 | 背包使用悟道玉简 | 道具消耗自然限速，无需额外限额 |
| 品阶 | 随机（realmLv 决定可选范围） | 增加惊喜感，高品阶稀有 |
| realmLv | 玩家当前 ±6 | 保证功法与玩家实力匹配 |
| 采纳后 | 直接学习 | 简化流程，无需功法书中间道具 |
| 分类开放 | 内功 + 术法 | 神通/秘术锁死不开放 AI |
| 解锁 | 筑基期 | 新手保护 + 确保有足够功法体验 |
| 无次数限制 | 由道具获取控制 | 简化系统，运营通过道具投放调节 |
| AI 服务层独立 | 通用抽象 | 后续 AI 功能可复用 |
