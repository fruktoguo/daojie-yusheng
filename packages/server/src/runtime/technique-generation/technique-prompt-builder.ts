/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 功法生成 Prompt 构造器。
 *
 * 职责：根据 category/grade/realmLv/playerContext 构造 system + user prompt。
 * 不注入 few-shot（归一化已兜数值），只描述结构约束。
 */

import type { TechniqueCategory, TechniqueGrade } from '@mud/shared';
import {
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
} from '@mud/shared';

export interface TechniquePromptParams {
  category: TechniqueCategory;
  grade: TechniqueGrade;
  realmLv: number;
  maxLayer: number;
  playerContext: string;
}

export interface TechniquePromptOutput {
  systemMessage: string;
  userMessage: string;
}

const INTERNAL_SYSTEM_PROMPT = `你是修仙游戏的功法设计师。根据玩家需求生成一个完整的内功功法 JSON。
严格遵循下方约束，不要生成约束里不允许的字段。

输出格式：单个 JSON 对象，可被 JSON.parse 直接解析。

必填字段：
- name: string（中文，2~8字）
- grade: string（品阶，必须等于指定值）
- category: "internal"
- realmLv: number（必须等于指定值）
- attrRatio: Record<AttrKey, number>（六维分配权重，正数，服务端归一化）
- maxLayer: number（层数，3~49）
- expDifficulty: number（经验难度，0.5~2.0，默认 1.0）

可选字段：
- desc: string（功法描述，20~60字）
- attrFloat: number（属性浮动，-0.15~0.10，默认 0）

AttrKey 枚举：constitution / spirit / perception / talent / strength / meridians

规则：
- attrRatio 的值只是权重比例，服务端会自动归一化，不需要凑整
- 至少分配 2 个维度的权重
- 功法名称和描述要有修仙风格，避免现代用语`;

const ARTS_SYSTEM_PROMPT = `你是修仙游戏的术法强度设计器。请严格输出单个 JSON 对象，不要输出代码块或解释文本。
你只能填写强度导向的术法草稿，服务端会把强度草稿归一化并展开成正式 SkillDef。
不要输出约束里没有列出的字段；不要输出真实伤害值、总预算、effects、buff、heal 或技能公式。`;

const ARTS_TARGET_TYPE_ENUM = ['single', 'line', 'box', 'area'] as const;
const ARTS_DAMAGE_KIND_ENUM = ['physical', 'spell'] as const;
const ARTS_ELEMENT_ENUM = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
const ARTS_TARGET_MODE_ENUM = ['any', 'entity', 'tile'] as const;
const ARTS_STRUCTURE_STRENGTH_KEYS = ['cost', 'cooldown', 'chant'] as const;
const ARTS_PERCENT_BONUS_KEYS = ['techLevel', 'moveSpeed'] as const;

export function buildTechniquePrompt(params: TechniquePromptParams): TechniquePromptOutput {
  const { category, grade, realmLv, maxLayer, playerContext } = params;

  const systemMessage = category === 'internal' ? INTERNAL_SYSTEM_PROMPT : ARTS_SYSTEM_PROMPT;
  if (category === 'arts') {
    return {
      systemMessage,
      userMessage: JSON.stringify(buildArtsStrengthPromptInput(params), null, 2),
    };
  }

  const userParts: string[] = [
    `生成一个${gradeLabel(grade)}${categoryLabel(category)}功法。`,
    `品阶: ${grade}`,
    `境界等级: ${realmLv}`,
    `总层数: ${maxLayer}`,
  ];

  if (playerContext) {
    userParts.push(`玩家主题描述: ${playerContext}`);
  }

  userParts.push('请直接输出 JSON，不要包含代码块标记或解释文本。');

  return {
    systemMessage,
    userMessage: userParts.join('\n'),
  };
}

/** 构造重试 prompt（追加错误反馈） */
export function buildRetryPrompt(
  original: TechniquePromptOutput,
  failureReason: string,
): TechniquePromptOutput {
  const retryGuidance = {
    previousFailureReason: failureReason,
    instruction: '请优先修正上述失败原因，并重新输出完整 JSON；不要只输出局部字段。',
  };
  try {
    const parsed = JSON.parse(original.userMessage) as Record<string, unknown>;
    return {
      systemMessage: original.systemMessage,
      userMessage: JSON.stringify({ ...parsed, retryGuidance }, null, 2),
    };
  } catch {
    // 内功 prompt 仍是自然语言，保留原有追加方式。
  }
  return {
    systemMessage: original.systemMessage,
    userMessage: `${original.userMessage}\n\n【重要修正】上次生成失败，原因：${failureReason}\n请修正后重新输出完整 JSON。`,
  };
}

function buildArtsStrengthPromptInput(params: TechniquePromptParams): Record<string, unknown> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS;
  return {
    task: '生成一个 AI 术法功法强度草稿',
    fixedInputs: {
      grade: params.grade,
      gradeLabel: gradeLabel(params.grade),
      category: 'arts',
      realmLv: params.realmLv,
      maxLayer: params.maxLayer,
      playerTheme: params.playerContext || undefined,
    },
    outputTopLevelSchema: {
      name: 'string，中文，2到8字',
      grade: `必须严格等于 ${params.grade}`,
      category: '必须严格等于 arts',
      realmLv: `必须严格等于 ${params.realmLv}`,
      maxLayer: `必须严格等于 ${params.maxLayer}`,
      expDifficulty: 'number，可选，0.5到2.0，默认1',
      desc: 'string，可选，20到60字',
      skills: '数组，必须且只能有1个 TechniqueArtsStrengthSkill',
    },
    skillSchema: {
      name: 'string，技能名，中文',
      desc: 'string，技能描述',
      unlockLevel: `integer，1到${params.maxLayer}`,
      damageKind: ARTS_DAMAGE_KIND_ENUM,
      element: ARTS_ELEMENT_ENUM,
      target: {
        type: ARTS_TARGET_TYPE_ENUM,
        range: `integer，${constants.structure.minRange}到${constants.structure.maxRange}`,
        width: `integer，可选，line/box 使用，${constants.structure.minWidth}到${constants.structure.maxWidth}`,
        height: `integer，可选，box 使用，${constants.structure.minWidth}到${constants.structure.maxWidth}`,
        radius: `integer，可选，area 使用，${constants.structure.minRadius}到${constants.structure.maxRadius}`,
        targetMode: ARTS_TARGET_MODE_ENUM,
      },
      structureStrength: Object.fromEntries(ARTS_STRUCTURE_STRENGTH_KEYS.map((key) => [
        key,
        `number，权重，${constants.weights.min}到${constants.weights.max}，0表示默认`,
      ])),
      formulaStrength: {
        attributeBases: `对象，key 必须来自 allowedAttributeBaseStats，数量 ${constants.attributeBases.minCount} 到 ${constants.attributeBases.maxCount} 个，value 为伤害构成权重，0到${constants.attributeBases.maxScale}；0或负数等于不参与`,
        percentBonuses: `对象，可选，只允许 techLevel 和 moveSpeed；value 为权重，${constants.weights.min}到${constants.weights.max}；省略等于0`,
      },
    },
    allowedAttributeBaseStats: [...TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS],
    attributeBaseCostBy100Percent: TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS,
    allowedPercentBonusKeys: [...ARTS_PERCENT_BONUS_KEYS],
    strengthRules: {
      budgetOwnership: '禁止输出 totalBudget/inputBudget/targetBudget；总预算由服务端按品阶、境界等级和玉简数量动态计算，并按各项权重分配。',
      structureMeaning: [
        'structureStrength.cost 是灵力消耗权重；正数代表更低灵力消耗，负数代表更高灵力消耗，0表示基础消耗倍率1。',
        `structureStrength.cooldown 是冷却权重；正数代表更短冷却，负数代表更长冷却，0表示${constants.structure.baseCooldownTicks}息。`,
        `结构权重直接作为指数参与预算换算：正数按 ${constants.structure.positiveBudgetPerStrength}^权重，负数按 ${constants.structure.negativeBudgetPerStrength}^绝对值，不再做额外缩放。`,
        'structureStrength.chant 预留给吟唱强度；当前可写0。',
        '结构权重、范围权重、距离权重都会和伤害权重竞争总预算。',
      ],
      formulaMeaning: [
        'attributeBases 是伤害固定值基底的分配权重，不是最终伤害数值。',
        '伤害权重只允许正数；0或负数表示完全不参与，不要输出。',
        '如果玩家主题要求最低伤害、威力分散、只要范围，伤害构成给一个最小正权重即可，例如 { spellAtk: 1 }，再把范围/距离/结构权重拉高。',
        '如果玩家主题要求高伤害，才把主伤害属性权重提高到 60 到 100。',
        `techLevel 默认0，表示每层增加${Math.round(constants.percentBonuses.techLevelScaleBase * 100)}%总伤害；通常不要写正值。`,
        `moveSpeed: 1 表示额外加入 caster.stat.moveSpeed * ${constants.percentBonuses.moveSpeedScalePerStrength} 的总百分比加成。`,
      ],
      rangeMeaning: [
        `single 视为0范围强度。`,
        `line/box/area 按覆盖格数约每${constants.structure.areaCellsPerStrength}格折算1点范围强度。`,
        `施法距离超过${constants.structure.baseCastRange}格后，每额外1格折算${constants.structure.rangeStrengthPerExtraTile}强度。`,
      ],
    },
    forbiddenFields: [
      'id', 'cost', 'costMultiplier', 'cooldown', 'range', 'targeting',
      'effects', 'value', 'formula', 'buff', 'buffId', 'heal',
      'maxTargets', 'totalBudget', 'inputBudget', 'targetBudget',
      'damageValue', 'baseDamage',
    ],
    outputChecklist: [
      '只输出单个 JSON 对象，必须可被 JSON.parse 解析。',
      `grade/category/realmLv/maxLayer 必须严格等于 fixedInputs。`,
      'skills.length 必须等于1。',
      'skills[0] 只能描述一个 damage 术法，不允许 heal/buff/debuff/control。',
      '不得输出 forbiddenFields 中的任何字段。',
      'formulaStrength.attributeBases 至少1个、最多5个 key，key 必须来自 allowedAttributeBaseStats。',
      'formulaStrength.attributeBases 的值必须是正权重；最低伤害也要写 1，不能写 0 或负数。',
      '属性基底优先按主题选择，例如蛮力/拳掌偏 physAtk 或 breakPower，玄妙法术偏 spellAtk，身法风格可少量使用 dodge/moveSpeed。',
      '不要为了凑强度写过多文本；描述保持修仙风格。',
    ],
    outputExample: {
      name: '分光诀',
      grade: params.grade,
      category: 'arts',
      realmLv: params.realmLv,
      maxLayer: params.maxLayer,
      expDifficulty: 1,
      desc: '凝锋成线，催动金行锐气直贯前方，破敌护体真元。',
      skills: [
        {
          name: '分光一线',
          desc: '锋芒成线，直破前方三步。',
          unlockLevel: 1,
          damageKind: 'physical',
          element: 'metal',
          target: { type: 'line', range: 3, width: 1, targetMode: 'tile' },
          structureStrength: { cooldown: 1 },
          formulaStrength: {
            attributeBases: { physAtk: 4 },
          },
        },
      ],
    },
  };
}

function gradeLabel(grade: TechniqueGrade): string {
  const map: Record<TechniqueGrade, string> = {
    mortal: '凡阶', yellow: '黄阶', mystic: '玄阶', earth: '地阶',
    heaven: '天阶', spirit: '灵阶', saint: '圣阶', emperor: '帝阶',
  };
  return map[grade] ?? grade;
}

function categoryLabel(category: TechniqueCategory): string {
  const map: Record<TechniqueCategory, string> = {
    internal: '内功', arts: '术法', divine: '神通', secret: '秘术',
  };
  return map[category] ?? category;
}
