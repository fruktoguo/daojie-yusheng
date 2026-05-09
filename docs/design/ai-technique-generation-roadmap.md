# AI 功法生成系统改造路线图

> 从 jiuzhou 学习成熟设计，改造道劫余生的功法技能系统以支持 AI 生成

---

## 1. 当前系统的核心问题

### 1.1 无法支持 AI 生成的原因

| 问题 | 现状 | 影响 |
|------|------|------|
| **公式表达式树** | `formula: { op: "mul", args: [...] }` | AI 难以生成语法正确的嵌套 AST |
| **技能强绑定功法** | 技能嵌套在功法 JSON 的 `skills[]` 内 | 无法独立生成和管理技能 |
| **纯静态配置** | 只从 JSON 文件加载 | 无法运行时添加新功法 |
| **无持久化层** | 无数据库表存储生成内容 | 生成的功法无处存放 |

### 1.2 需要保留的优势

| 优势 | 说明 |
|------|------|
| **targeting 系统** | `orientedBox`、`line`、`cone` 等空间形状，是格子地图 MMO 核心竞争力 |
| **formula 表达能力** | 图灵完备的数值表达，策划可精确控制 |
| **层级属性系统** | `layers[].attrs` + `expFactor` 完整 |

---

## 2. 从 jiuzhou 学习的核心设计

### 2.1 效果类型枚举化（最关键）

**jiuzhou 的设计**：把所有技能效果归纳为有限的类型枚举，每种类型有明确的字段约束。

```typescript
// jiuzhou 的效果类型枚举
type EffectType =
  | 'damage'      // 伤害
  | 'heal'        // 治疗
  | 'shield'      // 护盾
  | 'buff'        // 增益
  | 'debuff'      // 减益
  | 'control'     // 控制（眩晕/沉默/定身）
  | 'dispel'      // 驱散
  | 'cleanse'     // 净化
  | 'lifesteal'   // 吸血
  | 'mark'        // 印记（叠层机制）
  | 'momentum'    // 势能（连招资源）
  | 'resource'    // 资源调整（灵气/气血）
  | 'delayed_burst' // 延迟爆发
  | 'fate_swap';  // 状态交换

// 每种类型有明确的字段约束
interface DamageEffect {
  type: 'damage';
  scaleAttr: 'wugong' | 'fagong';  // 倍率属性
  scaleRate: number;               // 倍率系数 [0.5, 3.0]
  damageType: 'physical' | 'magic';
  element?: ElementKey;
  hit_count?: number;              // 段数 [1, 20]
}

interface ControlEffect {
  type: 'control';
  controlType: 'stun' | 'silence' | 'root' | 'sleep';
  chance: number;    // 概率 [0, 1]
  duration: number;  // 持续 [1, 3]
}
```

**为什么这样设计**：
- AI 只需要填充参数，不需要构造复杂语法
- 每个字段有明确的取值范围，便于校验
- 新增效果类型只需扩展枚举，不影响现有逻辑

### 2.2 三表分离存储

**jiuzhou 的数据库设计**：

```sql
-- 功法定义表
CREATE TABLE generated_technique_def (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,        -- 武技/心法/法诀/身法
  quality VARCHAR(16) NOT NULL,     -- 黄/玄/地/天
  max_layer INT NOT NULL,
  description TEXT,
  usage_scope VARCHAR(32),          -- player_only/tradeable
  is_published BOOLEAN DEFAULT FALSE,
  created_by_character_id INT,
  model_name VARCHAR(64),           -- 生成时使用的 AI 模型
  created_at TIMESTAMP DEFAULT NOW()
);

-- 技能定义表（独立于功法）
CREATE TABLE generated_skill_def (
  id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL,   -- 关联的功法 ID
  name VARCHAR(64) NOT NULL,
  description TEXT,
  cost_lingqi INT DEFAULT 0,
  cost_qixue INT DEFAULT 0,
  cooldown INT DEFAULT 0,
  target_type VARCHAR(32),
  target_count INT DEFAULT 1,
  effects JSONB NOT NULL,           -- 效果数组
  upgrades JSONB,                   -- 升级改动
  trigger_type VARCHAR(16),         -- active/passive
  FOREIGN KEY (source_id) REFERENCES generated_technique_def(id)
);

-- 功法层级表
CREATE TABLE generated_technique_layer (
  id SERIAL PRIMARY KEY,
  technique_id VARCHAR(64) NOT NULL,
  layer INT NOT NULL,
  cost_spirit_stones INT DEFAULT 0,
  cost_exp INT DEFAULT 0,
  passives JSONB,                   -- 被动属性加成
  unlock_skill_ids TEXT[],
  upgrade_skill_ids TEXT[],
  layer_desc TEXT,
  FOREIGN KEY (technique_id) REFERENCES generated_technique_def(id)
);
```

### 2.3 静态 + 动态配置合并

**jiuzhou 的加载逻辑**：

```typescript
// staticConfigLoader.ts
export const getTechniqueDefinitions = (): TechniqueDefConfig[] => {
  // 静态 JSON 配置
  const staticDefs = readJsonFile('technique_def.json').techniques;
  // 数据库生成的配置
  const generatedDefs = getGeneratedTechniqueDefinitions();
  // 合并为统一视图
  return [...staticDefs, ...generatedDefs];
};

export const getSkillDefinitions = (): SkillDefConfig[] => {
  const staticDefs = readJsonFile('skill_def.json').skills;
  const generatedDefs = getGeneratedSkillDefinitions();
  return [...staticDefs, ...generatedDefs];
};
```

**关键点**：上层代码无需区分技能来源，统一通过 ID 查询。

### 2.4 内存缓存 + 动态刷新

```typescript
// generatedTechniqueConfigStore.ts
let techniqueCache: Map<string, TechniqueDef> = new Map();
let skillCache: Map<string, SkillDef> = new Map();

// 启动时加载
export async function loadGeneratedTechniqueStore(): Promise<void> {
  const techniques = await db.query('SELECT * FROM generated_technique_def WHERE is_published = true');
  const skills = await db.query('SELECT * FROM generated_skill_def');
  // 写入缓存...
}

// 发布新功法后刷新
export async function refreshGeneratedTechniqueStore(): Promise<void> {
  await loadGeneratedTechniqueStore();
  // 清除 ContentTemplateRepository 的缓存，触发重新合并
  invalidateStaticConfigCache();
}
```

### 2.5 Prompt 约束系统（AI 生成的核心）

**jiuzhou 的 prompt 结构**：

```typescript
const promptInput = {
  task: '生成完整功法定义',
  techniqueType: '武技',
  quality: '玄',
  maxLayer: 5,

  constraints: {
    // 效果类型枚举
    effectTypeEnum: ['damage', 'heal', 'buff', 'debuff', 'control', ...],

    // 每种效果的字段约束
    effectGuideByType: {
      damage: {
        required: ['type'],
        optional: ['scaleAttr', 'scaleRate', 'damageType', 'hit_count'],
        rules: ['scaleRate 建议 0.5~3.0', 'hit_count 建议 1~20'],
        defaultTemplate: { type: 'damage', scaleAttr: 'wugong', scaleRate: 1.2 }
      },
      control: {
        required: ['type', 'controlType'],
        optional: ['chance', 'duration'],
        rules: ['chance 必须 0~1', 'duration 建议 1~3'],
        defaultTemplate: { type: 'control', controlType: 'stun', chance: 0.2 }
      }
    },

    // 数值范围
    numericRanges: {
      scaleRate: [0.5, 3.0],
      duration: [1, 5],
      chance: [0, 1],
      cooldown: [0, 30]
    },

    // 被动属性池
    allowedPassiveKeys: ['wugong', 'fagong', 'wufang', 'fafang', 'baoji', ...],
    passiveValueGuideByKey: { wugong: { perLayer: 50, total: 500 } }
  },

  // 输出校验清单
  outputChecklist: [
    '输出必须是单个 JSON 对象',
    'skills.length 必须在 skillCountRange 内',
    '所有 effect.type 必须在 effectTypeEnum 中',
    'chance 必须是 0~1 浮点数'
  ]
};
```

---

## 3. 改造方案

### 3.1 新增 AI 友好的效果格式

**核心思路**：不废弃现有 formula，而是新增一套简化格式，运行时转换。

```typescript
// packages/shared/src/ai-skill-types.ts

/** AI 生成专用的简化效果格式 */
export type AIGeneratedEffect =
  | AIGeneratedDamageEffect
  | AIGeneratedHealEffect
  | AIGeneratedBuffEffect
  | AIGeneratedControlEffect
  | AIGeneratedShieldEffect;

export interface AIGeneratedDamageEffect {
  type: 'damage';
  scaleAttr: 'strength' | 'spirit' | 'constitution';  // 对应你的六维
  scaleRate: number;      // [0.5, 3.0]
  damageKind: 'physical' | 'spell';
  element?: ElementKey;
  hitCount?: number;      // [1, 10]
}

export interface AIGeneratedHealEffect {
  type: 'heal';
  scaleAttr: 'spirit' | 'constitution';
  scaleRate: number;
  target: 'self' | 'ally';
}

export interface AIGeneratedBuffEffect {
  type: 'buff' | 'debuff';
  attrKey: AttrKey;       // 影响的属性
  value: number;          // 数值
  valueMode: 'flat' | 'percent';
  duration: number;       // [1, 10]
}

export interface AIGeneratedControlEffect {
  type: 'control';
  controlType: 'stun' | 'silence' | 'root' | 'slow';
  chance: number;         // [0, 1]
  duration: number;       // [1, 3]
}

export interface AIGeneratedShieldEffect {
  type: 'shield';
  scaleAttr: 'constitution' | 'spirit';
  scaleRate: number;
  duration: number;
}
```

### 3.2 效果格式转换器

```typescript
// packages/shared/src/ai-effect-converter.ts

import type { AIGeneratedEffect } from './ai-skill-types';
import type { SkillEffect, SkillFormula } from './skill-types';

/** 将 AI 生成的简化效果转换为现有的 formula 格式 */
export function convertAIEffectToSkillEffect(effect: AIGeneratedEffect): SkillEffect {
  switch (effect.type) {
    case 'damage':
      return {
        type: 'damage',
        damageKind: effect.damageKind,
        element: effect.element,
        formula: buildScaleFormula(effect.scaleAttr, effect.scaleRate, effect.hitCount),
      };

    case 'heal':
      return {
        type: 'heal',
        target: effect.target,
        formula: buildScaleFormula(effect.scaleAttr, effect.scaleRate),
      };

    case 'buff':
    case 'debuff':
      return {
        type: effect.type,
        attrKey: effect.attrKey,
        value: effect.value,
        valueMode: effect.valueMode,
        duration: effect.duration,
      };

    case 'control':
      return {
        type: 'control',
        controlType: effect.controlType,
        chance: effect.chance,
        duration: effect.duration,
      };

    case 'shield':
      return {
        type: 'shield',
        formula: buildScaleFormula(effect.scaleAttr, effect.scaleRate),
        duration: effect.duration,
      };
  }
}

function buildScaleFormula(attr: string, rate: number, hitCount = 1): SkillFormula {
  const base: SkillFormula = {
    op: 'mul',
    args: [{ var: `caster.${attr}` }, rate],
  };
  if (hitCount > 1) {
    return { op: 'mul', args: [base, hitCount] };
  }
  return base;
}
```

### 3.3 简化的 targeting 预设

```typescript
// packages/shared/src/ai-targeting-presets.ts

import type { TargetingDef } from './targeting';

/** AI 生成使用的简化 targeting 预设 */
export type AITargetingPreset =
  | 'self'           // 自身
  | 'single_enemy'   // 单体敌人
  | 'single_ally'    // 单体友方
  | 'front_line'     // 前排 3x1
  | 'back_line'      // 后排 3x1
  | 'cross_3'        // 十字 3 格
  | 'aoe_3x3'        // 3x3 范围
  | 'line_5';        // 直线 5 格

/** 预设转换为完整 targeting 定义 */
export const AI_TARGETING_PRESETS: Record<AITargetingPreset, TargetingDef> = {
  self: { shape: 'point', targetMode: 'self', range: 0 },
  single_enemy: { shape: 'point', targetMode: 'entity', range: 3 },
  single_ally: { shape: 'point', targetMode: 'ally', range: 3 },
  front_line: { shape: 'orientedBox', width: 3, height: 1, range: 1 },
  back_line: { shape: 'orientedBox', width: 3, height: 1, range: 3 },
  cross_3: { shape: 'cross', size: 1, range: 2 },
  aoe_3x3: { shape: 'orientedBox', width: 3, height: 3, range: 2 },
  line_5: { shape: 'line', length: 5, range: 1 },
};

export function resolveAITargeting(preset: AITargetingPreset): TargetingDef {
  return AI_TARGETING_PRESETS[preset] ?? AI_TARGETING_PRESETS.single_enemy;
}
```

### 3.4 数据库表设计

```sql
-- packages/server/src/persistence/migrations/xxx_add_generated_technique_tables.sql

-- 生成功法定义表
CREATE TABLE generated_technique_def (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  grade VARCHAR(16) NOT NULL,           -- mortal/yellow/mystic/earth/heaven
  category VARCHAR(32) NOT NULL,        -- martial/arts/body/auxiliary
  realm_lv INT NOT NULL,
  description TEXT,
  long_desc TEXT,

  -- 生成元数据
  usage_scope VARCHAR(32) DEFAULT 'player_only',  -- player_only/tradeable
  is_published BOOLEAN DEFAULT FALSE,
  created_by_player_id INT,
  model_name VARCHAR(64),
  prompt_snapshot TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 生成技能定义表
CREATE TABLE generated_skill_def (
  id VARCHAR(64) PRIMARY KEY,
  technique_id VARCHAR(64) NOT NULL REFERENCES generated_technique_def(id),
  name VARCHAR(64) NOT NULL,
  description TEXT,

  -- 消耗与冷却
  cost_multiplier DECIMAL(5,2) DEFAULT 1.0,
  cooldown INT DEFAULT 0,
  range INT DEFAULT 1,

  -- AI 生成的简化格式（存储原始数据）
  ai_effects JSONB NOT NULL,
  ai_targeting VARCHAR(32) DEFAULT 'single_enemy',

  -- 转换后的完整格式（运行时使用）
  effects JSONB,
  targeting JSONB,

  unlock_layer INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 生成功法层级表
CREATE TABLE generated_technique_layer (
  id SERIAL PRIMARY KEY,
  technique_id VARCHAR(64) NOT NULL REFERENCES generated_technique_def(id),
  level INT NOT NULL,
  exp_factor INT NOT NULL,
  attrs JSONB,                          -- 属性加成
  special_stats JSONB,                  -- 悟性/幸运等
  qi_projection JSONB,                  -- 气机投影

  UNIQUE(technique_id, level)
);

CREATE INDEX idx_generated_technique_published ON generated_technique_def(is_published);
CREATE INDEX idx_generated_skill_technique ON generated_skill_def(technique_id);
```

### 3.5 内存缓存服务

```typescript
// packages/server/src/content/generated-technique-store.service.ts

@Injectable()
export class GeneratedTechniqueStoreService {
  private techniqueCache = new Map<string, TechniqueTemplate>();
  private skillCache = new Map<string, SkillDef>();

  async onModuleInit() {
    await this.loadFromDatabase();
  }

  async loadFromDatabase(): Promise<void> {
    const techniques = await this.db.query(`
      SELECT * FROM generated_technique_def WHERE is_published = true
    `);
    const skills = await this.db.query(`
      SELECT * FROM generated_skill_def
      WHERE technique_id IN (SELECT id FROM generated_technique_def WHERE is_published = true)
    `);
    const layers = await this.db.query(`
      SELECT * FROM generated_technique_layer
      WHERE technique_id IN (SELECT id FROM generated_technique_def WHERE is_published = true)
    `);

    // 构建缓存
    for (const tech of techniques) {
      const techSkills = skills.filter(s => s.technique_id === tech.id);
      const techLayers = layers.filter(l => l.technique_id === tech.id);
      this.techniqueCache.set(tech.id, this.buildTechniqueTemplate(tech, techSkills, techLayers));
    }
  }

  /** 发布新功法后刷新缓存 */
  async refreshCache(): Promise<void> {
    await this.loadFromDatabase();
    // 通知 ContentTemplateRepository 重新合并
    this.contentTemplateRepository.invalidateTechniqueCache();
  }

  getGeneratedTechniques(): TechniqueTemplate[] {
    return [...this.techniqueCache.values()];
  }

  getGeneratedSkills(): SkillDef[] {
    return [...this.skillCache.values()];
  }
}
```

### 3.6 改造 ContentTemplateRepository

```typescript
// packages/server/src/content/content-template.repository.ts

@Injectable()
export class ContentTemplateRepository {
  private techniqueTemplates = new Map<string, TechniqueTemplate>();
  private skillTemplates = new Map<string, SkillDef>();
  private cacheValid = false;

  constructor(
    private generatedStore: GeneratedTechniqueStoreService,
  ) {}

  /** 获取所有功法（静态 + 生成） */
  listTechniqueTemplates(): TechniqueTemplate[] {
    this.ensureCacheValid();
    return [...this.techniqueTemplates.values()];
  }

  /** 按 ID 获取功法 */
  getTechniqueTemplate(id: string): TechniqueTemplate | null {
    this.ensureCacheValid();
    return this.techniqueTemplates.get(id) ?? null;
  }

  /** 使缓存失效，下次访问时重新合并 */
  invalidateTechniqueCache(): void {
    this.cacheValid = false;
  }

  private ensureCacheValid(): void {
    if (this.cacheValid) return;

    // 1. 加载静态 JSON 配置
    const staticTechniques = this.loadStaticTechniques();
    const staticSkills = this.loadStaticSkills();

    // 2. 获取生成的配置
    const generatedTechniques = this.generatedStore.getGeneratedTechniques();
    const generatedSkills = this.generatedStore.getGeneratedSkills();

    // 3. 合并（生成的 ID 前缀为 gen- 避免冲突）
    this.techniqueTemplates.clear();
    for (const t of [...staticTechniques, ...generatedTechniques]) {
      this.techniqueTemplates.set(t.id, t);
    }

    this.skillTemplates.clear();
    for (const s of [...staticSkills, ...generatedSkills]) {
      this.skillTemplates.set(s.id, s);
    }

    this.cacheValid = true;
  }
}
```

---

## 4. AI 生成服务设计

### 4.1 Prompt 约束配置

```typescript
// packages/server/src/runtime/ai/technique-generation-constraints.ts

/** 效果类型枚举 */
export const AI_EFFECT_TYPE_ENUM = [
  'damage', 'heal', 'shield', 'buff', 'debuff', 'control'
] as const;

/** 控制类型枚举 */
export const AI_CONTROL_TYPE_ENUM = ['stun', 'silence', 'root', 'slow'] as const;

/** targeting 预设枚举 */
export const AI_TARGETING_ENUM = [
  'self', 'single_enemy', 'single_ally',
  'front_line', 'aoe_3x3', 'line_5'
] as const;

/** 数值范围约束 */
export const AI_NUMERIC_RANGES = {
  scaleRate: { min: 0.5, max: 3.0 },
  duration: { min: 1, max: 10 },
  chance: { min: 0, max: 1 },
  cooldown: { min: 0, max: 30 },
  hitCount: { min: 1, max: 10 },
  skillCount: { yellow: [2, 3], mystic: [3, 4], earth: [4, 5], heaven: [5, 6] },
} as const;

/** 每种效果类型的字段约束 */
export const AI_EFFECT_SCHEMA = {
  damage: {
    required: ['type', 'scaleAttr', 'scaleRate', 'damageKind'],
    optional: ['element', 'hitCount'],
    rules: [
      'scaleAttr 必须是 strength/spirit/constitution',
      'scaleRate 范围 0.5~3.0',
      'hitCount 范围 1~10',
    ],
    example: { type: 'damage', scaleAttr: 'strength', scaleRate: 1.5, damageKind: 'physical' },
  },
  // ... 其他效果类型
} as const;
```

### 4.2 Prompt 构建器

```typescript
// packages/server/src/runtime/ai/technique-prompt-builder.ts

export function buildTechniqueGenerationPrompt(params: {
  grade: TechniqueGrade;
  category: TechniqueCategory;
  realmLv: number;
  playerContext?: string;  // 玩家输入的主题/风格
}): { system: string; user: string } {
  const skillRange = AI_NUMERIC_RANGES.skillCount[params.grade];

  const system = `你是一个修仙游戏的功法设计师。请根据用户需求生成一个完整的功法定义。

## 输出格式
输出必须是单个 JSON 对象，包含以下字段：
- name: 功法名称（2-6个汉字）
- description: 简短描述（20字以内）
- skills: 技能数组（${skillRange[0]}~${skillRange[1]}个）
- layers: 层级数组（固定10层）

## 技能格式约束
每个技能必须包含：
- id: 唯一标识（英文下划线格式）
- name: 技能名称（2-4个汉字）
- effects: 效果数组，每个效果的 type 必须是：${AI_EFFECT_TYPE_ENUM.join('/')}
- targeting: 必须是：${AI_TARGETING_ENUM.join('/')}
- cooldown: 冷却回合数（0~30）

## 效果字段约束
${Object.entries(AI_EFFECT_SCHEMA).map(([type, schema]) =>
  `### ${type}\n必填：${schema.required.join(', ')}\n可选：${schema.optional.join(', ')}\n规则：${schema.rules.join('；')}`
).join('\n\n')}

## 数值范围
- scaleRate: ${AI_NUMERIC_RANGES.scaleRate.min}~${AI_NUMERIC_RANGES.scaleRate.max}
- duration: ${AI_NUMERIC_RANGES.duration.min}~${AI_NUMERIC_RANGES.duration.max}
- chance: ${AI_NUMERIC_RANGES.chance.min}~${AI_NUMERIC_RANGES.chance.max}

## 输出校验清单
1. 输出必须是合法 JSON
2. skills.length 必须在 ${skillRange[0]}~${skillRange[1]}
3. 所有 effect.type 必须在枚举中
4. 所有数值必须在规定范围内`;

  const user = `请生成一个${params.grade}阶${params.category}功法，适合${params.realmLv}级玩家。
${params.playerContext ? `玩家期望的风格/主题：${params.playerContext}` : ''}`;

  return { system, user };
}
```

### 4.3 生成结果校验器

```typescript
// packages/server/src/runtime/ai/technique-generation-validator.ts

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: AIGeneratedTechnique;
}

export function validateGeneratedTechnique(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['输出不是有效的 JSON 对象'] };
  }

  const obj = raw as Record<string, unknown>;

  // 校验必填字段
  if (typeof obj.name !== 'string' || obj.name.length < 2) {
    errors.push('name 必须是 2 字以上的字符串');
  }

  if (!Array.isArray(obj.skills) || obj.skills.length === 0) {
    errors.push('skills 必须是非空数组');
  }

  // 校验每个技能
  for (const [i, skill] of (obj.skills as unknown[]).entries()) {
    const skillErrors = validateSkill(skill, i);
    errors.push(...skillErrors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 清洗并返回
  return { valid: true, errors: [], sanitized: sanitizeTechnique(obj) };
}

function validateSkill(skill: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `skills[${index}]`;

  if (!skill || typeof skill !== 'object') {
    return [`${prefix} 不是有效对象`];
  }

  const s = skill as Record<string, unknown>;

  // 校验 effects
  if (!Array.isArray(s.effects)) {
    errors.push(`${prefix}.effects 必须是数组`);
  } else {
    for (const [j, effect] of s.effects.entries()) {
      const effectErrors = validateEffect(effect, `${prefix}.effects[${j}]`);
      errors.push(...effectErrors);
    }
  }

  // 校验 targeting
  if (!AI_TARGETING_ENUM.includes(s.targeting as any)) {
    errors.push(`${prefix}.targeting 必须是 ${AI_TARGETING_ENUM.join('/')}`);
  }

  return errors;
}

function validateEffect(effect: unknown, prefix: string): string[] {
  const errors: string[] = [];
  const e = effect as Record<string, unknown>;

  if (!AI_EFFECT_TYPE_ENUM.includes(e.type as any)) {
    errors.push(`${prefix}.type 必须是 ${AI_EFFECT_TYPE_ENUM.join('/')}`);
    return errors;
  }

  const schema = AI_EFFECT_SCHEMA[e.type as keyof typeof AI_EFFECT_SCHEMA];

  // 校验必填字段
  for (const field of schema.required) {
    if (e[field] === undefined) {
      errors.push(`${prefix}.${field} 是必填字段`);
    }
  }

  // 校验数值范围
  if (typeof e.scaleRate === 'number') {
    const range = AI_NUMERIC_RANGES.scaleRate;
    if (e.scaleRate < range.min || e.scaleRate > range.max) {
      errors.push(`${prefix}.scaleRate 必须在 ${range.min}~${range.max}`);
    }
  }

  return errors;
}
```

### 4.4 AI 生成服务

```typescript
// packages/server/src/runtime/ai/technique-generation.service.ts

@Injectable()
export class TechniqueGenerationService {
  constructor(
    private db: DatabaseService,
    private generatedStore: GeneratedTechniqueStoreService,
    private aiClient: AITextClientService,
  ) {}

  async generateTechnique(params: {
    playerId: number;
    grade: TechniqueGrade;
    category: TechniqueCategory;
    realmLv: number;
    playerContext?: string;
  }): Promise<GenerationResult> {
    const { system, user } = buildTechniqueGenerationPrompt(params);

    // 1. 调用 AI 生成
    const response = await this.aiClient.call({
      systemMessage: system,
      userMessage: user,
      responseFormat: { type: 'json_object' },
      timeoutMs: 60_000,
    });

    // 2. 解析并校验
    const parsed = JSON.parse(response.content);
    const validation = validateGeneratedTechnique(parsed);

    if (!validation.valid) {
      // 重试一次，带上错误信息
      return this.retryWithFeedback(params, validation.errors);
    }

    // 3. 转换为完整格式
    const technique = this.convertToFullFormat(validation.sanitized!, params);

    // 4. 写入数据库（草稿状态）
    const techniqueId = await this.persistDraft(technique, params.playerId);

    return { success: true, techniqueId, preview: technique };
  }

  /** 发布功法（玩家确认后） */
  async publishTechnique(techniqueId: string, customName?: string): Promise<void> {
    await this.db.query(`
      UPDATE generated_technique_def
      SET is_published = true, name = COALESCE($2, name), updated_at = NOW()
      WHERE id = $1
    `, [techniqueId, customName]);

    // 刷新缓存
    await this.generatedStore.refreshCache();
  }

  private convertToFullFormat(ai: AIGeneratedTechnique, params: GenerationParams) {
    return {
      id: `gen-${randomUUID()}`,
      name: ai.name,
      grade: params.grade,
      category: params.category,
      realmLv: params.realmLv,
      layers: ai.layers.map(l => ({
        level: l.level,
        expFactor: this.calcExpFactor(params.grade, l.level),
        attrs: l.attrs,
      })),
      skills: ai.skills.map(s => ({
        id: `gen-skill-${randomUUID()}`,
        name: s.name,
        effects: s.effects.map(convertAIEffectToSkillEffect),
        targeting: resolveAITargeting(s.targeting),
        cooldown: s.cooldown,
      })),
    };
  }
}
```

---

## 5. 实施路线图

### 阶段一：基础设施（1-2 周）

| 任务 | 说明 |
|------|------|
| 新增 AI 效果类型定义 | `packages/shared/src/ai-skill-types.ts` |
| 新增效果转换器 | `packages/shared/src/ai-effect-converter.ts` |
| 新增 targeting 预设 | `packages/shared/src/ai-targeting-presets.ts` |
| 创建数据库表 | 三张生成表 + 迁移脚本 |
| 新增缓存服务 | `GeneratedTechniqueStoreService` |

### 阶段二：配置合并（1 周）

| 任务 | 说明 |
|------|------|
| 改造 ContentTemplateRepository | 支持静态 + 动态合并 |
| 添加缓存失效机制 | 发布后自动刷新 |
| 验证战斗系统兼容性 | 确保生成的技能能正常执行 |

### 阶段三：AI 生成服务（2 周）

| 任务 | 说明 |
|------|------|
| 实现 Prompt 约束系统 | 效果枚举 + 字段约束 + 数值范围 |
| 实现 Prompt 构建器 | 根据品阶/类型生成 prompt |
| 实现结果校验器 | 多层校验 + 错误收集 |
| 实现生成服务 | 调用 AI + 校验 + 持久化 |
| 实现重试机制 | 失败时带纠错信息重试 |

### 阶段四：玩家交互（1 周）

| 任务 | 说明 |
|------|------|
| 添加生成入口 | 洞府研修 / 功法残页消耗 |
| 添加预览界面 | 展示生成的功法草稿 |
| 添加发布流程 | 玩家命名 + 确认发布 |
| 添加功法书物品 | 可交易的功法书道具 |

---

## 6. 关键决策点

### 6.1 保留 formula 还是全面切换？

**建议：双轨并行**

- 策划手工配置的高品质功法：继续使用 formula 表达式树
- AI 生成的量产功法：使用简化效果格式，运行时转换

**理由**：
- formula 的表达能力是你的优势，不应放弃
- AI 生成需要约束，简化格式更可控
- 转换层隔离了两种格式，互不影响

### 6.2 targeting 如何处理？

**建议：预设 + 策划后调**

- AI 生成时使用简化预设（`aoe_3x3`、`line_5` 等）
- 策划可以在发布前调整为更精确的 targeting
- 保留完整 targeting 系统的扩展能力

### 6.3 数值平衡如何保证？

**建议：多层防护**

1. **Prompt 约束**：明确数值范围
2. **校验器**：超出范围直接拒绝
3. **品阶系数**：不同品阶有不同的数值上限
4. **策划审核**：高品质功法需人工审核后发布

---

## 7. 与 jiuzhou 的差异化

| 维度 | jiuzhou | 道劫余生（改造后） |
|------|---------|-------------------|
| 效果系统 | 纯枚举分发 | 枚举 + formula 双轨 |
| targeting | 简单枚举 | 预设 + 完整空间系统 |
| 数值表达 | 固定字段 | 简化格式 → formula 转换 |
| 适用场景 | 无空间策略 | 格子地图空间策略 |

**你的优势**：保留了 targeting 空间系统和 formula 表达能力，AI 生成只是补充，不是替代。

---

## 附录：文件清单

```
packages/shared/src/
├── ai-skill-types.ts           # AI 效果类型定义
├── ai-effect-converter.ts      # 效果格式转换器
├── ai-targeting-presets.ts     # targeting 预设

packages/server/src/
├── persistence/migrations/
│   └── xxx_add_generated_technique_tables.sql
├── content/
│   └── generated-technique-store.service.ts
├── runtime/ai/
│   ├── technique-generation-constraints.ts
│   ├── technique-prompt-builder.ts
│   ├── technique-generation-validator.ts
│   └── technique-generation.service.ts
```