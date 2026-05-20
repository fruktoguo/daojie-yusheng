# AI 大模型 API 调用指南

> 本文档基于九州修仙录的实现，详细说明如何在 Node.js/TypeScript 游戏服务端中接入和调用大模型 API。
> 涵盖 OpenAI、Anthropic、DashScope（通义）三大 Provider 的文本生成和图片生成。

---

## 一、依赖安装

```bash
# 文本模型
pnpm add openai                  # OpenAI SDK（也兼容所有 OpenAI 兼容 API）
pnpm add @anthropic-ai/sdk       # Anthropic Claude SDK

# 图片模型（DashScope 用原生 fetch，无需额外依赖）
# OpenAI 图片生成复用 openai SDK
```

---

## 二、OpenAI / OpenAI 兼容 API 调用

### 2.1 基本调用（Chat Completions）

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://api.openai.com/v1',  // 或任何兼容 API 地址
  timeout: 30_000,  // 超时毫秒数
});

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  temperature: 0.85,
  seed: 12345,  // 可选，提高输出稳定性
  messages: [
    { role: 'system', content: '你是一个修仙世界的功法设计师...' },
    { role: 'user', content: '请生成一套火属性攻击功法...' },
  ],
});

const content = completion.choices[0]?.message?.content;
// content 是字符串，需要自行 JSON.parse
```

### 2.2 结构化输出（JSON Schema）

强制模型返回符合 schema 的 JSON，大幅减少解析失败：

```typescript
const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  temperature: 0.85,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'technique_generation',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'skills'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 8 },
          description: { type: 'string', minLength: 20, maxLength: 100 },
          skills: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'damage', 'element'],
              properties: {
                name: { type: 'string' },
                damage: { type: 'number', minimum: 10, maximum: 500 },
                element: { type: 'string', enum: ['fire', 'water', 'earth', 'metal', 'wood'] },
              },
            },
          },
        },
      },
    },
  },
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: '...' },
  ],
});

// 模型返回的 content 一定是合法 JSON（符合 schema）
const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
```

### 2.3 处理返回值的坑点

OpenAI SDK 返回的 `message.content` 可能是字符串，也可能是分段数组：

```typescript
/**
 * 统一提取 content 文本。
 * 某些兼容 API 返回 content 为 Array<{ type: 'text', text: string }>
 */
const normalizeCompletionContent = (rawContent: unknown): string => {
  if (typeof rawContent === 'string') return rawContent;
  if (!Array.isArray(rawContent)) return '';
  return rawContent
    .filter((entry) => entry && typeof entry === 'object' && 'text' in entry)
    .map((entry) => entry.text ?? '')
    .join('');
};

// 使用
const content = normalizeCompletionContent(completion.choices[0]?.message?.content);
```

### 2.4 兼容 API 注意事项

很多第三方服务（DeepSeek、Moonshot、智谱、Gemini 等）都提供 OpenAI 兼容接口：

```typescript
// DeepSeek
const client = new OpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://api.deepseek.com/v1',
});

// 智谱 GLM
const client = new OpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
});

// Gemini（通过 OpenAI 兼容层）
const client = new OpenAI({
  apiKey: 'AIza...',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
});
```

**注意**：不是所有兼容 API 都支持 `response_format.json_schema`，需要做降级处理。

---

## 三、Anthropic Claude API 调用

### 3.1 基本调用

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'sk-ant-...',
  // baseURL 可选，SDK 默认 https://api.anthropic.com
  timeout: 30_000,
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 81920,
  temperature: 0.85,
  system: '你是一个修仙世界的功法设计师...',  // system 是独立参数！
  messages: [
    { role: 'user', content: '请生成一套火属性攻击功法...' },
  ],
});

// 提取文本内容
const content = message.content
  .filter((block) => block.type === 'text')
  .map((block) => block.text)
  .join('');
```

### 3.2 关键差异：system message 位置

```typescript
// ❌ 错误：Anthropic 不允许 system 放在 messages 里
messages: [
  { role: 'system', content: '...' },  // 会报 400 错误！
  { role: 'user', content: '...' },
]

// ✅ 正确：system 是独立的顶层参数
{
  system: '你是一个修仙世界的功法设计师...',
  messages: [
    { role: 'user', content: '...' },
  ],
}
```

### 3.3 启用 Thinking（深度思考）

Claude 支持 extended thinking，适合复杂生成任务：

```typescript
const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 81920,
  temperature: 0.85,
  system: '...',
  thinking: {
    type: 'enabled',
    budget_tokens: 64000,  // 思考预算 token 数
  },
  messages: [
    { role: 'user', content: '...' },
  ],
});

// thinking 内容在 content 中 type='thinking' 的 block 里
// 业务只需要 type='text' 的 block
const textContent = message.content
  .filter((block) => block.type === 'text')
  .map((block) => block.text)
  .join('');
```

### 3.4 结构化输出（output_config）

Anthropic 的结构化输出格式与 OpenAI 不同：

```typescript
// OpenAI 格式
response_format: {
  type: 'json_schema',
  json_schema: { name: 'xxx', schema: {...}, strict: true }
}

// Anthropic 格式（需要转换）
output_config: {
  format: {
    type: 'json_schema',
    schema: {...}  // 直接放 schema 对象
  }
}
```

转换函数：

```typescript
const buildAnthropicOutputConfig = (
  responseFormat?: { type: string; json_schema?: { schema: object } },
) => {
  if (!responseFormat) return undefined;
  if (responseFormat.type !== 'json_schema') return undefined;
  return {
    format: {
      type: 'json_schema' as const,
      schema: responseFormat.json_schema!.schema as Record<string, unknown>,
    },
  };
};
```

### 3.5 不支持结构化输出时的降级

某些模型/版本不支持 `output_config`，可用 assistant prefill 引导 JSON 输出：

```typescript
messages: [
  { role: 'user', content: '请按 JSON 格式返回...' },
  { role: 'assistant', content: '{' },  // prefill 引导直接输出 JSON
]
```

---

## 四、图片生成 API 调用

### 4.1 OpenAI 图片生成

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://api.openai.com/v1',
  maxRetries: 3,
  timeout: 60_000,
});

const response = await client.images.generate({
  model: 'dall-e-3',
  prompt: '中国仙侠风格技能图标，火焰剑气...',
  size: '512x512',
  response_format: 'b64_json',  // 返回 base64 编码图片
});

const base64Image = response.data[0]?.b64_json;
const buffer = Buffer.from(base64Image, 'base64');
// 后续可用 sharp 压缩、存储
```

### 4.2 DashScope（通义万相）图片生成

DashScope 使用专有协议，不走 OpenAI SDK：

```typescript
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const payload = {
  model: 'qwen-image-2.0',
  input: {
    prompt: '中国仙侠风格技能图标，火焰剑气...',
  },
  parameters: {
    size: '512*512',  // 注意：DashScope 用 * 不是 x
    n: 1,
  },
};

const response = await fetch(DASHSCOPE_ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'X-DashScope-Async': 'disable',  // 同步模式
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(60_000),
});

const body = await response.json();

// DashScope 返回结构
// body.output.results[0].b64_image 或 body.output.results[0].url
const imageUrl = body.output?.results?.[0]?.url;
const imageB64 = body.output?.results?.[0]?.b64_image;
```

### 4.3 图片后处理（sharp 压缩）

```typescript
import sharp from 'sharp';

const compressImage = async (buffer: Buffer): Promise<Buffer> => {
  return sharp(buffer)
    .rotate()                    // 自动旋转
    .resize({
      width: 384,
      height: 384,
      fit: 'cover',
      withoutEnlargement: false,
    })
    .webp({ quality: 84 })      // 转 webp 格式
    .toBuffer();
};
```

### 4.4 base64 归一化

某些兼容 API 返回的 base64 可能带 Data URL 前缀：

```typescript
const DATA_URL_PREFIX = /^data:[^;,]+;base64,/i;

const normalizeBase64 = (raw: string): string => {
  return raw.replace(DATA_URL_PREFIX, '').trim();
};

// 使用
const cleanB64 = normalizeBase64(rawB64FromApi);
const buffer = Buffer.from(cleanB64, 'base64');
```

---

## 五、统一封装模式（推荐）

### 5.1 统一调用入口

将多 Provider 差异封装到一个函数里，业务层只调这一个：

```typescript
type TextModelCallResult = {
  modelName: string;
  promptSnapshot: string;  // 完整请求体 JSON（审计用）
  content: string;         // 模型返回的纯文本
};

type TextModelScope = 'technique' | 'partner' | 'wander' | 'stockMarket';

/**
 * 统一文本模型调用入口。
 * 业务层只需指定 scope + prompt，不感知底层是 OpenAI 还是 Anthropic。
 */
const callConfiguredTextModel = async (params: {
  modelScope: TextModelScope;
  systemMessage: string;
  userMessage: string;
  responseFormat?: JsonSchemaResponseFormat;
  seed?: number;
  temperature?: number;
  timeoutMs: number;
}): Promise<TextModelCallResult | null> => {
  const config = readTextModelConfig(params.modelScope);
  if (!config) return null;  // 未配置该 scope，功能不可用

  if (config.provider === 'anthropic') {
    return callAnthropicTextModel(config, params);
  }

  // OpenAI / OpenAI 兼容
  return callOpenAITextModel(config, params);
};
```

### 5.2 配置读取

```typescript
type TextModelConfig = {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  baseURL: string;
  modelName: string;
};

// 每个 scope 独立的环境变量
const TEXT_MODEL_ENV_KEYS = {
  technique: {
    provider: 'AI_TECHNIQUE_MODEL_PROVIDER',
    url: 'AI_TECHNIQUE_MODEL_URL',
    key: 'AI_TECHNIQUE_MODEL_KEY',
    name: 'AI_TECHNIQUE_MODEL_NAME',
  },
  partner: {
    provider: 'AI_PARTNER_MODEL_PROVIDER',
    url: 'AI_PARTNER_MODEL_URL',
    key: 'AI_PARTNER_MODEL_KEY',
    name: 'AI_PARTNER_MODEL_NAME',
  },
  // ...
};

const readTextModelConfig = (scope: TextModelScope): TextModelConfig | null => {
  const envKeys = TEXT_MODEL_ENV_KEYS[scope];
  const apiKey = process.env[envKeys.key]?.trim();
  if (!apiKey) return null;  // 未配置 = 功能禁用

  const provider = (process.env[envKeys.provider]?.trim() === 'anthropic')
    ? 'anthropic' : 'openai';
  const baseURL = process.env[envKeys.url]?.trim() ?? '';
  const modelName = process.env[envKeys.name]?.trim() || 'gpt-4o-mini';

  return { provider, apiKey, baseURL, modelName };
};
```

### 5.3 Gemini 兼容层检测

Gemini 通过 OpenAI 兼容层接入时，某些功能（如 response_format）不支持：

```typescript
const isGeminiOpenAICompatibleModel = (config: { baseURL: string; modelName: string }): boolean => {
  const baseURL = config.baseURL.toLowerCase();
  const modelName = config.modelName.toLowerCase();
  return (
    baseURL.includes('generativelanguage.googleapis.com') ||
    baseURL.includes('aiplatform.googleapis.com') ||
    modelName.includes('gemini')
  );
};

// 使用：Gemini 不支持 json_schema response_format，需要降级
const resolveResponseFormat = (config, responseFormat) => {
  if (isGeminiOpenAICompatibleModel(config)) {
    return undefined;  // 降级为纯文本，靠 prompt 约束 JSON
  }
  return responseFormat;
};
```

---

## 六、错误处理与重试

### 6.1 通用重试模式

```typescript
const MAX_ATTEMPTS = 3;

const callWithRetry = async <T>(
  generateFn: (attempt: number, lastError?: string) => Promise<T>,
  validateFn: (result: T) => { success: true; data: any } | { success: false; reason: string },
): Promise<any> => {
  let lastContent: T | null = null;
  let lastFailureReason = '模型未返回合法内容';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      lastContent = await generateFn(attempt, attempt > 1 ? lastFailureReason : undefined);
    } catch (error) {
      // 结构化输出不支持时降级
      if (isUnsupportedSchemaError(error)) {
        // 下次不传 response_format
        continue;
      }
      throw error;
    }

    const validation = validateFn(lastContent);
    if (validation.success) return validation.data;
    lastFailureReason = validation.reason;
  }

  throw new Error(`AI 生成失败（${MAX_ATTEMPTS} 次重试后）：${lastFailureReason}`);
};
```

### 6.2 修复 Prompt（Repair）

第一次失败后，把错误原因反馈给模型重新生成：

```typescript
const buildRepairSystemMessage = (originalSystem: string): string => {
  return `${originalSystem}\n\n【重要】上一次生成的结果未通过校验，请严格按规则重新生成。`;
};

const buildRepairUserMessage = (
  originalUser: string,
  lastContent: string,
  failureReason: string,
): string => {
  return [
    originalUser,
    '',
    '--- 上次生成结果（未通过校验）---',
    lastContent.slice(0, 500),
    '',
    `--- 校验失败原因 ---`,
    failureReason,
    '',
    '请修正上述问题，严格按 JSON Schema 重新输出完整结果。',
  ].join('\n');
};
```

### 6.3 常见错误类型

```typescript
// 判断是否为"不支持结构化输出"的错误
const isUnsupportedSchemaError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('response_format') ||
    msg.includes('json_schema') ||
    msg.includes('structured output') ||
    msg.includes('not supported')
  );
};

// 判断是否为超时
const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message.includes('timeout');
};

// 判断是否为限流
const isRateLimitError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.message.includes('429') || error.message.includes('rate limit');
};
```

---

## 七、成本与性能优化

### 7.1 Token 节省技巧

| 技巧 | 说明 |
|------|------|
| **JSON Schema** | 减少模型输出无关解释文字 |
| **精简 system prompt** | 避免重复规则，用简洁指令 |
| **seed 参数** | 相同输入产生相似输出，便于缓存 |
| **小模型优先** | gpt-4o-mini 成本是 gpt-4o 的 1/10 |
| **预生成模式** | 一次调用生成多个结果（如云游 3 选项） |

### 7.2 并发控制

```typescript
// Worker 线程池限制同时进行的 AI 请求数
const AI_WORKER_COUNT = parseInt(process.env.AI_WORKER_COUNT || '10');

// 避免瞬间打满 API 限流
// 使用 Worker 线程池天然限制并发
```

### 7.3 超时策略

```typescript
// 统一超时：30 分钟（AI 生成可能很慢）
const AI_GENERATION_TIMEOUT_MS = 30 * 60 * 1000;

// 图片生成超时：60 秒
const IMAGE_GENERATION_TIMEOUT_MS = 60 * 1000;

// 使用 AbortController 实现超时
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch(url, { signal: controller.signal, ... });
} finally {
  clearTimeout(timer);
}
```

---

## 八、完整示例：游戏内功法生成

```typescript
import OpenAI from 'openai';

// 1. 配置
const config = {
  apiKey: process.env.AI_TECHNIQUE_MODEL_KEY!,
  baseURL: process.env.AI_TECHNIQUE_MODEL_URL!,
  modelName: process.env.AI_TECHNIQUE_MODEL_NAME || 'gpt-4o-mini',
};

// 2. 构造 prompt
const systemMessage = `你是修仙世界的功法设计师。根据玩家境界和属性倾向，生成一套完整功法。
规则：
- 功法名 2-8 个中文字
- 描述 20-100 字
- 技能 1-4 个
- 每个技能伤害值在品质允许范围内
- 必须严格返回 JSON`;

const userMessage = `玩家境界：金丹期
属性倾向：火属性攻击
品质：地级
灵感词：焚天`;

// 3. 调用
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: 30_000,
});

const completion = await client.chat.completions.create({
  model: config.modelName,
  temperature: 0.85,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'technique_generation',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'type', 'skills'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 8 },
          description: { type: 'string', minLength: 20, maxLength: 100 },
          type: { type: 'string', enum: ['attack', 'support', 'guard'] },
          skills: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'description', 'damage', 'element', 'targetType'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 6 },
                description: { type: 'string', minLength: 10, maxLength: 60 },
                damage: { type: 'number', minimum: 50, maximum: 300 },
                element: { type: 'string', enum: ['fire', 'water', 'earth', 'metal', 'wood'] },
                targetType: { type: 'string', enum: ['single_enemy', 'all_enemy', 'self'] },
              },
            },
          },
        },
      },
    },
  },
  messages: [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ],
});

// 4. 解析结果
const content = completion.choices[0]?.message?.content ?? '';
const technique = JSON.parse(content);

// 5. 服务端二次校验（不信任模型输出）
if (technique.skills.some((s: any) => s.damage > 300)) {
  throw new Error('技能伤害超出品质上限');
}

// 6. 记录审计信息
const auditRecord = {
  modelName: config.modelName,
  promptSnapshot: JSON.stringify({ systemMessage, userMessage }),
  result: technique,
  createdAt: new Date(),
};
```

---

## 九、安全注意事项

| 风险 | 防护措施 |
|------|---------|
| **Prompt 注入** | 玩家输入（灵感词/底模）放在 user message 末尾，system 中明确声明忽略越权指令 |
| **数值越界** | 服务端硬校验所有数值范围，不信任模型输出 |
| **内容安全** | 生成的名称/描述需过敏感词过滤 |
| **成本失控** | Worker 并发限制 + 玩家侧冷却/材料消耗 |
| **API Key 泄露** | Key 只存环境变量，不入代码/日志 |
| **超时堆积** | 统一超时 + Worker 池限制，防止请求无限排队 |


