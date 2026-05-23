# AI 功法生成系统设计

## 1. 系统概述

通过 AI 动态生成合法、平衡、可运营的功法。核心保证：

- **数值安全**：占比预算制 + 归一化，AI 输出权重而非绝对值
- **结构安全**：JSON Schema + 白名单校验，拒绝非法结构
- **热路径零开销**：生成后一次性展开，运行时走与静态功法完全相同的代码路径
- **可复用**：AI 服务层抽象为通用基础设施，后续 AI 功能（NPC 对话、任务生成等）可直接复用

---

## 2. 模块架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        玩家交互层                                 │
│  洞府研修面板 → 协议请求 → Socket Handler                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     功法生成业务层                                 │
│  TechniqueGenerationService                                      │
│  ├─ 资源校验（残页/冷却/速率）                                     │
│  ├─ 任务状态机（pending → draft → published）                     │
│  ├─ Prompt 构造                                                  │
│  ├─ 候选校验（三层防线）                                           │
│  └─ 发布与缓存刷新                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    通用 AI 服务层（可复用）                         │
│  AiTaskExecutionService                                          │
│  ├─ AiTextClient（已有：OpenAI/Anthropic/Compatible）             │
│  ├─ AiProviderConfigService（已有：scope 化多模型）                │
│  ├─ AiRateLimiter（速率限制 + 并发控制）                           │
│  ├─ AiCostMeter（成本计量 + 账单告警）                             │
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
| AiRateLimiter | `ai/ai-rate-limiter.ts`（新增） | 单玩家日额度 + 全服并发上限 |
| AiCostMeter | `ai/ai-cost-meter.ts`（新增） | token 计量 + 日成本告警 |
| AiPromptSanitizer | `ai/ai-prompt-sanitizer.ts`（新增） | 玩家输入清洗 + 注入防御 |
| AiRetryPolicy | `ai/ai-retry-policy.ts`（新增） | 超时/重试/熔断策略 |
| AiTaskExecutionService | `ai/ai-task-execution.service.ts`（新增） | 编排上述模块的统一入口 |

### 3.3 AiTaskExecutionService 接口

```ts
interface AiTaskRequest {
  /** 业务标识，用于计量和审计 */
  taskType: string;
  /** 模型 scope（对应 AiProviderConfig 的 scope） */
  modelScope?: string;
  /** 发起玩家 ID（用于速率限制） */
  playerId: number;
  /** system prompt */
  systemMessage: string;
  /** user prompt（已清洗） */
  userMessage: string;
  /** 期望 JSON 输出 */
  responseFormat?: 'json_object' | 'text';
  /** 温度 */
  temperature?: number;
  /** 单次超时 ms */
  timeoutMs?: number;
  /** 最大重试次数（校验失败时） */
  maxRetries?: number;
}

interface AiTaskResult {
  success: boolean;
  content: string;
  modelName: string;
  promptSnapshot: string;
  attemptCount: number;
  tokenUsage?: { prompt: number; completion: number };
  error?: string;
}
```

### 3.4 AiRateLimiter

```ts
interface AiRateLimiterConfig {
  /** 单玩家每日最大调用次数 */
  playerDailyLimit: number;       // 默认 5
  /** 全服最大并发数 */
  globalConcurrencyLimit: number; // 默认 20
  /** 单玩家最小间隔 ms */
  playerMinIntervalMs: number;    // 默认 60_000
}
```

实现要点：
- 玩家日额度用 Redis `INCR + EXPIRE`（key: `ai:rate:{playerId}:{date}`）
- 全服并发用内存 Semaphore（单实例场景）
- 超限时返回明确错误码，前端展示剩余冷却

### 3.5 AiCostMeter

```ts
interface AiCostRecord {
  taskType: string;
  playerId: number;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;  // 按模型单价估算
  timestamp: number;
}
```

实现要点：
- 每次调用后异步写入 outbox（不阻塞主流程）
- 日成本累计超阈值 → Logger.warn + 可选暂停入口
- 初期不需要精确计费，估算即可

### 3.6 AiPromptSanitizer

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

### 3.7 AiRetryPolicy

```ts
interface AiRetryConfig {
  maxAttempts: number;        // 默认 2（首次 + 1 次重试）
  retryDelayMs: number;       // 默认 1000
  timeoutMs: number;          // 默认 60_000
  /** 熔断：连续失败 N 次后暂停该 scope */
  circuitBreakerThreshold: number;  // 默认 10
  circuitBreakerCooldownMs: number; // 默认 300_000
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
├── technique-prompt-builder.ts           # Prompt 构造器
├── technique-candidate-validator.ts      # 三层校验器
├── technique-budget-normalizer.ts        # 术法预算归一化
├── technique-generation-constants.ts     # 业务常量
└── technique-generation-outbox.ts        # 审计日志
```

### 4.2 TechniqueGenerationService 核心方法

```ts
@Injectable()
class TechniqueGenerationService {
  /** 发起生成（扣资源 + 建任务） */
  async requestGeneration(params: {
    playerId: number;
    category: 'arts' | 'internal';
    playerContext?: string;
  }): Promise<GenerationJobResult>;

  /** 执行生成（AI 调用 + 校验 + 落草稿） */
  async executeGeneration(jobId: string): Promise<GenerationExecutionResult>;

  /** 玩家确认发布（命名 + 唯一检查 + 刷新缓存） */
  async publishDraft(params: {
    playerId: number;
    jobId: string;
    customName: string;
  }): Promise<PublishResult>;

  /** 放弃草稿（退款） */
  async discardDraft(playerId: number, jobId: string): Promise<void>;

  /** 查询当前状态 */
  async getStatus(playerId: number): Promise<GenerationStatus>;

  /** 过期草稿清理（定时任务调用） */
  async expireStaleJobs(): Promise<number>;
}
```

### 4.3 生成流程时序

```
玩家请求
  │
  ▼
requestGeneration()
  ├─ AiRateLimiter.check(playerId)          → 超限拒绝
  ├─ 校验功法残页余额                         → 不足拒绝
  ├─ 校验冷却时间                             → 冷却中拒绝
  ├─ 扣除功法残页
  └─ INSERT technique_generation_job (status=pending)
  │
  ▼
executeGeneration(jobId)  [可异步/Worker]
  ├─ 读取 job 参数
  ├─ TechniquePromptBuilder.build(category, grade, realmLv, playerContext)
  ├─ AiTaskExecutionService.execute(request)
  │     ├─ AiPromptSanitizer.sanitize(playerContext)
  │     ├─ AiRateLimiter.acquire()
  │     ├─ AiTextClient.call()
  │     ├─ AiCostMeter.record()
  │     └─ AiRetryPolicy.handleFailure()
  ├─ JSON.parse(result.content)
  ├─ TechniqueCandidateValidator.validate(candidate)
  │     ├─ Layer 1: 结构校验（ajv schema）
  │     ├─ Layer 2: 语义校验（白名单/AST 深度）
  │     └─ Layer 3: 数值校验（归一化可执行性）
  ├─ TechniqueBudgetNormalizer.normalize(candidate)  [仅 arts]
  ├─ 组装 TechniqueTemplate
  ├─ INSERT generated_technique (status=draft)
  └─ UPDATE job (status=generated_draft, draft_expire_at=+24h)
  │
  ▼
publishDraft(playerId, jobId, customName)
  ├─ 校验 job 状态 = generated_draft
  ├─ 校验草稿未过期
  ├─ 校验命名规则（长度/敏感词/格式）
  ├─ 校验全服唯一（静态功法 + 已发布生成功法）
  ├─ UPDATE generated_technique (is_published=true, display_name, name_locked)
  ├─ UPDATE job (status=published)
  ├─ GeneratedTechniqueStoreService.refreshAfterPublish()
  └─ 发放功法书道具（或直接学习）
```

### 4.4 Prompt 构造器

```ts
class TechniquePromptBuilder {
  /** 构造内功生成 prompt */
  buildInternalPrompt(params: {
    grade: TechniqueGrade;
    realmLv: number;
    playerContext: string;
  }): { systemMessage: string; userMessage: string };

  /** 构造术法生成 prompt */
  buildArtsPrompt(params: {
    grade: TechniqueGrade;
    realmLv: number;
    playerContext: string;
    allowedBuffKeys: string[];
    allowedFormulaVars: string[];
  }): { systemMessage: string; userMessage: string };

  /** 构造重试 prompt（带错误反馈） */
  buildRetryPrompt(params: {
    originalPrompt: { systemMessage: string; userMessage: string };
    failureReason: string;
    correctionHints: string[];
  }): { systemMessage: string; userMessage: string };
}
```

Prompt 结构：
- system: 角色设定 + JSON Schema 约束 + 白名单枚举
- user: 品阶/类别/境界 + 玩家主题 + 输出格式要求
- 不注入 few-shot（归一化已兜数值）

### 4.5 三层校验器

```ts
class TechniqueCandidateValidator {
  /** 完整校验链 */
  validate(raw: unknown, category: TechniqueCategory): ValidationResult;

  /** Layer 1: 结构合法性 */
  private validateStructure(raw: unknown): ValidationResult;

  /** Layer 2: 语义合法性 */
  private validateSemantics(candidate: RawCandidate): ValidationResult;

  /** Layer 3: 数值合法性 */
  private validateNumerics(candidate: RawCandidate): ValidationResult;
}

type ValidationResult = {
  valid: boolean;
  errors: Array<{ layer: 1 | 2 | 3; field: string; message: string }>;
};
```

各层检查项：

| 层 | 检查内容 |
|---|---|
| 结构 | ajv schema 校验、字段类型、必填项 |
| 语义 | category 不是 divine/secret、attrFloat 范围、SkillFormulaVar 白名单、buffId 合法、AST 深度 ≤ 6 |
| 数值 | attrRatio 权重和 > 0、expDifficulty 范围、归一化可执行（非全零效果） |

### 4.6 术法预算归一化

```ts
class TechniqueBudgetNormalizer {
  /** 按预算归一化技能效果 */
  normalizeSkills(params: {
    skills: SkillDef[];
    grade: TechniqueGrade;
    realmLv: number;
    maxLayer: number;
  }): SkillDef[];
}
```

公式（详见 `AI功法生成方案.md §5`）：
- `BUDGET_max = 3 + (realmLv × 0.1 + stage) × 1.2^(g-1)`
- `scale = BUDGET(layer) / RAW_TOTAL`
- 每项实际值 = 原始权重 × scale

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

**设计决策**：
- `template` JSONB 存完整 `TechniqueTemplate`，与静态功法格式一致
- 冗余 `grade/category/realm_lv` 用于列表筛选，避免 JSONB 索引
- `normalized_name` 唯一索引保证全服命名不重复
- 不拆 skill/layer 子表 — 我们的展开函数在启动期完成

### 5.2 表结构：technique_generation_job

```sql
CREATE TABLE technique_generation_job (
  id                    VARCHAR(64) PRIMARY KEY,
  player_id             INT NOT NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'pending',

  requested_category    VARCHAR(16),
  requested_grade       VARCHAR(16),
  player_context        VARCHAR(200),

  draft_technique_id    VARCHAR(64),
  model_name            VARCHAR(64),
  attempt_count         INT NOT NULL DEFAULT 0,
  cost_fragments        INT NOT NULL DEFAULT 0,

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
pending ──────────► generated_draft ──────────► published
   │                      │
   │                      ├──► expired (草稿超时)
   │                      └──► refunded (玩家放弃)
   │
   └──► failed (AI 调用失败/校验耗尽)
         └──► refunded (自动退款)
```

状态转换规则：
- `pending → generated_draft`：AI 生成成功 + 校验通过
- `pending → failed`：AI 调用异常或校验耗尽重试
- `generated_draft → published`：玩家确认命名发布
- `generated_draft → expired`：超过 `draft_expire_at`
- `generated_draft → refunded`：玩家主动放弃
- `failed → refunded`：自动退款（部分或全额）

### 5.4 缓存服务

```ts
@Injectable()
class GeneratedTechniqueStoreService {
  private cache = new Map<string, TechniqueTemplate>();
  private lastSignature: { count: number; maxUpdatedAt: string } | null = null;

  /** 启动期加载 */
  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** 签名比对 + 按需重载 */
  async reload(): Promise<void> {
    const sig = await this.loadSignature();
    if (this.isSignatureEqual(sig)) return;

    const rows = await this.pool.query(
      `SELECT id, template FROM generated_technique
       WHERE is_published = true AND status = 'published'`
    );
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.id, row.template as TechniqueTemplate);
    }
    this.lastSignature = sig;
  }

  /** 发布后主动刷新 */
  async refreshAfterPublish(): Promise<void> {
    this.lastSignature = null;
    await this.reload();
  }

  getById(id: string): TechniqueTemplate | undefined {
    return this.cache.get(id);
  }

  listAll(): TechniqueTemplate[] {
    return [...this.cache.values()];
  }

  private async loadSignature() {
    const result = await this.pool.query(`
      SELECT COUNT(*)::int AS count,
             MAX(updated_at)::text AS max_updated_at
      FROM generated_technique
      WHERE is_published = true
    `);
    return result.rows[0];
  }

  private isSignatureEqual(sig: { count: number; max_updated_at: string }): boolean {
    return this.lastSignature !== null
      && this.lastSignature.count === sig.count
      && this.lastSignature.maxUpdatedAt === sig.max_updated_at;
  }
}
```

### 5.5 与 ContentTemplateRepository 合并

```ts
// TechniqueTemplateRegistry 中新增
listTechniqueTemplates(): TechniqueTemplateRecord[] {
  return [
    ...Array.from(this.techniqueTemplates.values()),
    ...this.generatedStore.listAll().map(normalizeTechniqueTemplate),
  ];
}

tryGetRef(techniqueId: string): TechniqueTemplateRecord | undefined {
  return this.techniqueTemplates.get(techniqueId)
    ?? this.generatedStore.getById(techniqueId);
}
```

**关键保证**：
- 生成功法缓存在 `onModuleInit` 时加载，早于玩家恢复
- `hydrate(techId)` 对生成功法和静态功法走同一路径
- 运行时展开后挂到 `TechniqueState.layers`，战斗/属性结算无感知

---

## 6. 玩家交互与协议

### 6.1 协议定义

```ts
// 请求
type TechniqueGenerationRequest =
  | { action: 'getStatus' }
  | { action: 'generate'; category: 'arts' | 'internal'; playerContext?: string }
  | { action: 'publish'; jobId: string; customName: string }
  | { action: 'discard'; jobId: string };

// 响应
type TechniqueGenerationResponse = {
  status: GenerationStatus;
  draft?: TechniquePreview;
  error?: { code: string; message: string };
};

// 状态推送（生成完成时服务端主动推送）
type TechniqueGenerationNotify = {
  type: 'technique_generation_complete';
  jobId: string;
  result: 'success' | 'failed';
  preview?: TechniquePreview;
  errorMessage?: string;
};
```

### 6.2 GenerationStatus 结构

```ts
type GenerationStatus = {
  unlocked: boolean;              // 是否解锁洞府研修
  unlockRequirement?: string;     // 解锁条件描述

  fragmentBalance: number;        // 功法残页余额
  fragmentCost: number;           // 单次消耗

  cooldownUntil: string | null;   // 冷却结束时间 ISO
  cooldownRemainingSeconds: number;

  currentJob: {
    jobId: string;
    status: TechniqueGenerationJobStatus;
    category: string;
    createdAt: string;
    draftExpireAt?: string;
  } | null;

  currentDraft: TechniquePreview | null;

  dailyRemaining: number;         // 今日剩余次数
  dailyLimit: number;             // 每日上限
};
```

### 6.3 TechniquePreview 结构

```ts
type TechniquePreview = {
  techniqueId: string;
  suggestedName: string;          // AI 建议名
  grade: TechniqueGrade;
  category: TechniqueCategory;
  realmLv: number;
  desc: string;

  // 内功预览
  attrRatio?: Partial<Record<AttrKey, number>>;
  attrTotal?: number;

  // 术法预览
  skills?: Array<{
    name: string;
    desc: string;
    cooldown: number;
    effects: string[];  // 效果文本描述列表
  }>;

  maxLayer: number;
  expDifficulty: number;
};
```

### 6.4 交互流程（前端视角）

```
1. 打开洞府研修面板 → getStatus
   ├─ 未解锁 → 显示解锁条件
   ├─ 冷却中 → 显示倒计时
   ├─ 有草稿 → 显示预览 + 命名/放弃按钮
   └─ 可生成 → 显示生成入口

2. 点击"开始领悟" → generate
   ├─ 选择类别（内功/术法）
   ├─ 输入主题描述（可选，≤200字）
   └─ 确认消耗 → 进入等待状态

3. 等待生成（10~30秒）
   ├─ 轮询 getStatus 或等待 notify 推送
   └─ 生成完成 → 显示预览

4. 预览草稿
   ├─ 满意 → 输入自定义名称 → publish
   └─ 不满意 → discard（部分退款）

5. 发布成功 → 功法书进入背包 → 使用后学习
```

---

## 7. 安全与运营

### 7.1 资源门槛

| 项目 | 配置 | 说明 |
|---|---|---|
| 解锁条件 | 境界 ≥ 练气中期 | 新手保护 |
| 消耗道具 | 功法残页 × N | 防白嫖 |
| 每日上限 | 5 次/天 | 控制 LLM 成本 |
| 生成冷却 | 可配置（默认 1h） | 防刷 |
| 草稿有效期 | 24h | 防囤积 |

### 7.2 LLM 成本控制

| 措施 | 实现 |
|---|---|
| 单玩家日额度 | AiRateLimiter（Redis INCR） |
| 全服并发上限 | 内存 Semaphore（默认 20） |
| 单次超时 | 60s 硬超时 |
| 日成本告警 | AiCostMeter 累计 → Logger.warn |
| 熔断 | 连续 10 次失败 → 暂停 5 分钟 |

### 7.3 Prompt 注入防御

- 玩家输入 `playerContext` 进入 prompt 前必须经过 `AiPromptSanitizer`
- 长度截断 ≤ 200 字
- 剥离控制字符、markdown 代码块
- 正则拒绝角色扮演指令
- 全量落审计日志（`prompt_snapshot` 字段）

### 7.4 使用范围

```
初期：usage_scope = 'player_only'
  - 仅创建者可学习
  - 不可交易、邮寄、上架市场
  - 不可赠送

二阶段：usage_scope = 'tradeable'（需单独评审）
  - 通过功法书道具流通
  - 市场上架需额外审核
```

### 7.5 版本化与回滚

- `schema_version` 字段跟踪规则版本
- 规则升级时可按版本批量：
  - 重新展开（公式变更）
  - 下架（严重平衡问题）
  - 迁移（字段结构变更）
- 支持 GM 命令按 `schema_version` 批量操作

### 7.6 审计日志

每次生成操作写入 outbox：
- `playerId`、`modelName`、`promptSnapshot`
- `validationReport`（校验结果快照）
- `attemptCount`、`tokenUsage`
- 时间戳、最终状态

保留期：90 天。

---

## 8. 与现有系统的集成点

### 8.1 玩家功法存储

玩家学习 AI 生成功法后：
- `TechniqueState.techId` = `generated_technique.id`
- 存档格式与静态功法完全一致
- 恢复时通过合并视图的 `tryGetRef(techId)` 找到模板

### 8.2 战斗系统

- 生成功法展开后的 `layers` / `skills` 与静态功法结构相同
- 战斗结算直接读 `TechniqueState.skills`，无需区分来源
- 术法预算归一化保证数值在品阶预算内

### 8.3 属性系统

- `calcTechniqueFinalAttrBonus()` 遍历所有 `TechniqueState`
- 生成功法的 `grade` 参与品阶软衰减，与静态功法同池计算
- 无需特殊处理

### 8.4 配置编辑器

- `config-editor` 的功法列表接口增加 `source: 'static' | 'generated'` 标记
- GM 可查看/禁用生成功法，但不可编辑 template 内容
- 禁用操作：`UPDATE generated_technique SET status = 'disabled'`

### 8.5 建表落点

走现有 `deploy-database-preflight` 的 ensure schema 链路：
- 在 `ensureGeneratedTechniqueTables(pool)` 中执行 CREATE TABLE IF NOT EXISTS
- 不引入新 migration 机制

---

## 9. 实施路线图

### Phase 0：通用 AI 服务层（1 周）

- `ai/ai-rate-limiter.ts`
- `ai/ai-cost-meter.ts`
- `ai/ai-prompt-sanitizer.ts`
- `ai/ai-retry-policy.ts`
- `ai/ai-task-execution.service.ts`
- smoke 测试

### Phase 1：数据层（0.5 周）

- `generated_technique` 表 + preflight
- `technique_generation_job` 表 + preflight
- `GeneratedTechniqueStoreService`
- `TechniqueTemplateRegistry` 合并视图
- smoke 测试

### Phase 2：校验与归一化（1 周）

- `technique-candidate-validator.ts`（三层校验）
- `technique-budget-normalizer.ts`（术法预算归一化）
- JSON Schema 导出（`ts-json-schema-generator`）
- 单元测试

### Phase 3：生成业务层（1.5 周）

- `TechniqueGenerationService`（状态机编排）
- `TechniquePromptBuilder`（Prompt 构造）
- 异步执行链路（可选 Worker）
- 过期清理定时任务
- 全链路 smoke

### Phase 4：协议与前端（1 周）

- Socket handler 注册
- 协议类型定义（shared）
- 洞府研修面板（react-ui，三端适配）
- 生成等待 → 预览 → 命名 → 发布流程

### Phase 5：运营工具（0.5 周）

- GM 审核/禁用接口
- 成本报表查询
- 按 schema_version 批量操作
- 接入 `pnpm verify:quick`

---

## 10. 决策记录

| 维度 | 决策 | 理由 |
|---|---|---|
| 存储方案 | 单表 JSONB | 与静态功法格式一致，零 JOIN，展开在启动期完成 |
| 不拆 skill/layer 子表 | 我们的 template 已是紧凑格式 | 避免三表 JOIN + 三段 INSERT 的复杂度 |
| 缓存刷新 | 签名比对 | 避免无变化时全量 IO |
| AI 服务层独立 | 通用抽象 | 后续 NPC 对话/任务生成可复用 |
| 初期锁 player_only | 不可交易 | 避免经济链路失衡 |
| 草稿 24h 过期 | 参考 jiuzhou | 防囤积 + 简化状态管理 |
| 不做沙盒战斗对标 | 归一化已兜底 | 降级为异常监控即可 |
| 建表走 preflight | 现有链路 | 不引入新 migration 机制 |
