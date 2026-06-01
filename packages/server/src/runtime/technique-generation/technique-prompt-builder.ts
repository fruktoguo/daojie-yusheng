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

import type { PlayerRealmStage, TechniqueCategory, TechniqueGrade } from '@mud/shared';
import {
  PLAYER_REALM_ORDER,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
  TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE,
  TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE,
  TECHNIQUE_INTERNAL_STAGE_WEIGHT,
  calcInternalTechniqueAttrTotal,
  calcInternalTechniqueTotalExp,
  getTechniqueGradeIndex,
  resolveTechniqueStageLayers,
} from '@mud/shared';
import { calcArtsBudgetMax } from './technique-budget-normalizer';

export interface TechniquePromptParams {
  category: TechniqueCategory;
  grade: TechniqueGrade;
  realmLv: number;
  maxLayer: number;
  playerContext: string;
  itemSpend?: number;
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
不要输出约束里没有列出的字段；不要输出真实伤害值、真实灵力消耗、真实冷却、真实施法距离、真实影响半径、总预算、effects、buff、heal 或技能公式。`;

const ARTS_TARGET_TYPE_ENUM = ['single', 'line', 'box', 'area'] as const;
const ARTS_DAMAGE_KIND_ENUM = ['physical', 'spell'] as const;
const ARTS_ELEMENT_ENUM = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
const ARTS_TARGET_MODE_ENUM = ['any', 'entity', 'tile'] as const;
const ARTS_STRUCTURE_STRENGTH_KEYS = ['cost', 'cooldown', 'chant'] as const;
const ARTS_PERCENT_BONUS_KEYS = ['techLevel', 'moveSpeed'] as const;

export function buildTechniquePrompt(params: TechniquePromptParams): TechniquePromptOutput {
  const { category } = params;

  const systemMessage = category === 'internal' ? INTERNAL_SYSTEM_PROMPT : ARTS_SYSTEM_PROMPT;
  if (category === 'arts') {
    return {
      systemMessage,
      userMessage: JSON.stringify(buildArtsStrengthPromptInput(params), null, 2),
    };
  }

  return {
    systemMessage,
    userMessage: JSON.stringify(buildInternalPromptInput(params), null, 2),
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
  const generationContext = buildGenerationContext(params);
  const artsBudgetContext = buildArtsBudgetContext(params);
  return {
    task: '生成一个 AI 术法功法强度草稿',
    generationContext,
    budgetContext: artsBudgetContext,
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
        range: `integer，${constants.structure.minRange}到${constants.structure.maxRange}，施法距离权重/倾向，不是真实格数；真实施法距离由服务端按预算反推，常规上限${constants.structure.maxCastRange}格，line 上限${constants.structure.maxLineCastRange}格`,
        width: `integer，可选，line/box 使用，${constants.structure.minRange}到${constants.structure.maxRange}，横向覆盖权重/倾向，不是真实宽度`,
        height: `integer，可选，box 使用，${constants.structure.minRange}到${constants.structure.maxRange}，纵向覆盖权重/倾向，不是真实高度`,
        radius: `integer，可选，area 使用，${constants.structure.minRange}到${constants.structure.maxRange}，范围覆盖权重/倾向，不是真实半径`,
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
      budgetOwnership: '禁止输出 totalBudget/inputBudget/targetBudget；本次实际总预算已在 budgetContext.actualTotalBudget 给出，服务端按各项权重分配并展开真实 SkillDef。',
      structureMeaning: [
        'structureStrength.cost 是灵力消耗权重；正数代表更低灵力消耗，负数代表更高灵力消耗，0表示基础消耗倍率1。',
        `structureStrength.cooldown 是冷却权重；正数代表更短冷却，负数代表更长冷却，0预算的基础冷却为 ${constants.structure.cooldownBaseRealmLvMultiplier} * realmLv 息。`,
        'structureStrength 字段只参与总权重分配；服务端会先按总预算分给每一项，再用各项独立公式换算真实消耗、冷却或吟唱。',
        'structureStrength.chant 预留给吟唱强度；当前可写0。',
        '结构权重、范围权重、距离权重都会和伤害权重竞争总预算。',
        'structureStrength 里的字段都只是强度权重，不是真实运行时数值；不要输出 costMultiplier/cooldown/cooldownTicks。',
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
        'target.range/radius/width/height 都是服务端展开真实 targeting 前的范围权重或覆盖倾向，不是真实格数、真实半径或真实宽高。',
        '玩家主题中的“范围32格”表示希望覆盖强度接近32格，不是 radius=32；请把它压缩为允许区间内的覆盖权重，由服务端换算真实半径。',
        `range 表示施法距离预算倾向：1格为0预算，2格约消耗1*${constants.structure.castRangeBudgetGrowth}预算，3格约消耗2*${constants.structure.castRangeBudgetGrowth}^2预算；不要把它当作最终施法距离。`,
        `影响范围按预算换算覆盖格：每1点实际范围预算约增加${constants.structure.coverageCellsPerBudget}格，line/box/area 会按各自形状向下取整成真实宽度、边长或半径。`,
        'single 视为0覆盖强度；line/box/area 只选择形状和覆盖倾向，真实覆盖格数由服务端展开。',
      ],
      calculationFormulas: artsBudgetContext.formulas,
    },
    forbiddenFields: [
      'id', 'cost', 'costMultiplier', 'cooldown', 'targeting',
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
      'target.range/radius/width/height 只填写权重意图，不填写真实施法距离、真实半径、真实宽高或真实覆盖格数。',
      '属性基底优先按主题选择，例如蛮力/拳掌偏 physAtk 或 breakPower，玄妙法术偏 spellAtk，身法风格可少量使用 dodge/moveSpeed。',
      '不要为了凑强度写过多文本；描述保持修仙风格。',
      '名称、描述、威势措辞必须贴合 generationContext 的品阶、境界阶段和命名尺度，低境界不要写毁天灭地，高境界不要写成凡俗小术。',
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

function buildInternalPromptInput(params: TechniquePromptParams): Record<string, unknown> {
  const generationContext = buildGenerationContext(params);
  const internalBudgetContext = buildInternalBudgetContext(params);
  return {
    task: '生成一个 AI 内功功法强度草稿',
    generationContext,
    budgetContext: internalBudgetContext,
    fixedInputs: {
      grade: params.grade,
      gradeLabel: gradeLabel(params.grade),
      category: 'internal',
      realmLv: params.realmLv,
      maxLayer: params.maxLayer,
      playerTheme: params.playerContext || undefined,
    },
    outputTopLevelSchema: {
      name: 'string，中文，2到8字',
      grade: `必须严格等于 ${params.grade}`,
      category: '必须严格等于 internal',
      realmLv: `必须严格等于 ${params.realmLv}`,
      maxLayer: `必须严格等于 ${params.maxLayer}`,
      expDifficulty: `number，可选，${TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0]}到${TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1]}，默认1`,
      desc: 'string，可选，20到60字',
      attrRatio: 'Record<AttrKey, number>，六维分配权重，正数，服务端归一化',
      attrFloat: `number，可选，${TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0]}到${TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1]}，默认0`,
    },
    attrKeys: {
      constitution: '体魄/肉身/生命承载',
      spirit: '神识/元神/法术根基',
      perception: '感知/身法/灵觉',
      talent: '根骨/资质/悟性',
      strength: '力道/气力/近战根基',
      meridians: '经脉/真元/灵力运转',
    },
    strengthRules: {
      budgetOwnership: '不要输出真实 layers、逐层属性或总属性；服务端按 attrRatio 和 attrFloat 展开。',
      formulaMeaning: [
        'attrRatio 是六维分配权重，不是最终属性数值；权重和不需要凑整。',
        `attrFloat 只允许 ${TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0]} 到 ${TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1]}，通常保持0；只有主题明确偏弱或偏强时才微调。`,
        '至少分配2个维度；主题偏拳掌可重 strength/constitution，玄妙法术可重 spirit/meridians，身法感知可重 perception/talent。',
      ],
      calculationFormulas: internalBudgetContext.formulas,
    },
    forbiddenFields: [
      'id', 'layers', 'layerGains', 'skills', 'effects', 'totalBudget',
      'inputBudget', 'targetBudget', 'attrTotal', 'totalExp',
    ],
    outputChecklist: [
      '只输出单个 JSON 对象，必须可被 JSON.parse 解析。',
      'grade/category/realmLv/maxLayer 必须严格等于 fixedInputs。',
      'attrRatio 至少包含2个合法 attrKeys，值必须为正数。',
      '不要输出真实 layers、逐层属性、技能公式或预算字段。',
      '名称、描述、威势措辞必须贴合 generationContext 的品阶、境界阶段和命名尺度，低境界不要写毁天灭地，高境界不要写成凡俗小术。',
    ],
    outputExample: {
      name: '玄息诀',
      grade: params.grade,
      category: 'internal',
      realmLv: params.realmLv,
      maxLayer: params.maxLayer,
      expDifficulty: 1,
      desc: '纳息归元，温养经脉，使灵力流转更为绵密。',
      attrRatio: { spirit: 3, meridians: 2, perception: 1 },
      attrFloat: 0,
    },
  };
}

function buildGenerationContext(params: TechniquePromptParams): Record<string, unknown> {
  const realmStage = resolveRealmStageInfo(params.realmLv);
  return {
    rolled: true,
    grade: params.grade,
    gradeLabel: gradeLabel(params.grade),
    gradeIndex: getTechniqueGradeIndex(params.grade),
    category: params.category,
    categoryLabel: categoryLabel(params.category),
    realmLv: params.realmLv,
    realmStage: realmStage.stage,
    realmStageIndex: realmStage.stageIndex,
    realmStageLabel: realmStage.label,
    realmStageLevelRange: realmStage.levelRange,
    maxLayer: params.maxLayer,
    itemSpend: params.itemSpend,
    playerTheme: params.playerContext || undefined,
    toneGuidance: buildToneGuidance(params.grade, realmStage.label),
  };
}

function buildInternalBudgetContext(params: TechniquePromptParams): Record<string, unknown> {
  const attrFloatMin = TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0];
  const attrFloatMax = TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1];
  const attrTotalAtDefaultFloat = calcInternalTechniqueAttrTotal(params.grade, params.realmLv, 0);
  const attrTotalMin = calcInternalTechniqueAttrTotal(params.grade, params.realmLv, attrFloatMin);
  const attrTotalMax = calcInternalTechniqueAttrTotal(params.grade, params.realmLv, attrFloatMax);
  const totalExpAtDefaultDifficulty = calcInternalTechniqueTotalExp(
    params.grade,
    params.realmLv,
    params.maxLayer,
    1,
    'internal',
  );
  return {
    budgetType: 'internal_attr_ratio',
    attrTotalAtDefaultFloat: roundPromptNumber(attrTotalAtDefaultFloat),
    attrTotalRangeByAttrFloat: {
      minAttrFloat: attrFloatMin,
      maxAttrFloat: attrFloatMax,
      min: roundPromptNumber(attrTotalMin),
      max: roundPromptNumber(attrTotalMax),
    },
    totalExpAtDefaultDifficulty: Math.round(totalExpAtDefaultDifficulty),
    stageLayers: resolveTechniqueStageLayers(params.maxLayer),
    stageWeight: TECHNIQUE_INTERNAL_STAGE_WEIGHT,
    formulas: [
      'gradeIndex: mortal=1, yellow=2, mystic=3, earth=4, heaven=5, spirit=6, saint=7, emperor=8',
      '满层六维总属性 T = (gradeIndex^2 * (realmLv + 25) + 50) * (1 + attrFloat)',
      '阶段层数按 maxLayer 切为 [入门, 小成, 大成]；阶段属性权重为 [1, 2, 4]',
      '每层每维属性 = 阶段该维总属性 / 阶段层数 * attrRatio[维] / sum(attrRatio)',
      '总经验 = gradeIndex^2 * (realmLv + 5) * categoryFactor * ((1.10^maxLayer - 1) / (1.10 - 1)) * expDifficulty * TECHNIQUE_EXP_BASE * realmLv',
    ],
  };
}

function buildArtsBudgetContext(params: TechniquePromptParams): Record<string, unknown> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS;
  return {
    budgetType: 'arts_weight_allocation',
    actualTotalBudget: roundPromptNumber(calcArtsBudgetMax(params.grade, params.realmLv)),
    budgetAtMaxLayer: roundPromptNumber(calcArtsBudgetMax(params.grade, params.realmLv)),
    formulas: [
      'gradeIndex: mortal=1, yellow=2, mystic=3, earth=4, heaven=5, spirit=6, saint=7, emperor=8',
      '术法满层总预算 BUDGET_max = 3 + (realmLv * 0.1 + realmStageIndex) * 1.4^(gradeIndex - 1) * majorRealmMultiplier',
      '每项实际预算 itemBudget = actualTotalBudget * itemWeight / sum(abs(itemWeight))',
      `灵力消耗倍率 costMultiplier = costBudget >= 0 ? ${constants.structure.costPositivePerBudget}^costBudget : ${constants.structure.costNegativePerBudget}^abs(costBudget)`,
      `冷却 cooldownTicks = round(${constants.structure.cooldownBaseRealmLvMultiplier} * realmLv * (cooldownBudget >= 0 ? ${constants.structure.cooldownPositivePerBudget}^cooldownBudget : ${constants.structure.cooldownNegativePerBudget}^abs(cooldownBudget)))，最小1息`,
      `施法距离：1格为0预算；r格消耗 (r - 1) * ${constants.structure.castRangeBudgetGrowth}^(r - 1)，常规最大${constants.structure.maxCastRange}格，line最大${constants.structure.maxLineCastRange}格`,
      `影响范围：每1点范围预算约增加${constants.structure.coverageCellsPerBudget}个覆盖格，按 single/line/box/area 各自形状向下取整`,
      '属性基底倍率 = 属性实际预算 / 每100%基底成本；spellAtk/physAtk等成本见 attributeBaseCostBy100Percent',
      `层数加成 techLevel 每层比例 = max(0, ${constants.percentBonuses.techLevelScaleBase} * (1 + techLevelBudget))`,
      `移速加成 = caster.stat.moveSpeed * max(0, moveSpeedBudget) * ${constants.percentBonuses.moveSpeedScalePerStrength}`,
      '触顶或触底后未用的正预算会回流到属性基底；不要输出预算字段，服务端自动展开',
    ],
  };
}

function resolveRealmStageInfo(realmLv: number): {
  stage: PlayerRealmStage;
  stageIndex: number;
  label: string;
  levelRange: { from: number; to: number };
} {
  for (let i = PLAYER_REALM_ORDER.length - 1; i >= 0; i -= 1) {
    const stage = PLAYER_REALM_ORDER[i];
    const range = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
    if (range && realmLv >= range.levelFrom) {
      return {
        stage,
        stageIndex: i + 1,
        label: realmStageLabel(stage),
        levelRange: { from: range.levelFrom, to: range.levelTo },
      };
    }
  }
  const fallback = PLAYER_REALM_ORDER[0];
  const range = PLAYER_REALM_STAGE_LEVEL_RANGES[fallback];
  return {
    stage: fallback,
    stageIndex: 1,
    label: realmStageLabel(fallback),
    levelRange: { from: range.levelFrom, to: range.levelTo },
  };
}

function realmStageLabel(stage: PlayerRealmStage): string {
  const labels: Record<PlayerRealmStage, string> = {
    0: '凡人',
    1: '淬体',
    2: '锻骨',
    3: '通脉',
    4: '先天',
    5: '练气前期',
    7: '练气中期',
    8: '练气后期',
    6: '筑基前期',
    9: '筑基中期',
    10: '筑基后期',
    11: '金丹前期',
    12: '金丹中期',
    13: '金丹后期',
    14: '元婴前期',
    15: '元婴中期',
    16: '元婴后期',
    17: '化神前期',
    18: '化神中期',
    19: '化神后期',
    20: '炼虚前期',
    21: '炼虚中期',
    22: '炼虚后期',
    23: '合体前期',
    24: '合体中期',
    25: '合体后期',
    26: '大乘前期',
    27: '大乘中期',
    28: '大乘后期',
    29: '渡劫前期',
    30: '渡劫中期',
    31: '渡劫后期',
    32: '飞升',
  };
  return labels[stage] ?? `境界阶段${stage}`;
}

function buildToneGuidance(grade: TechniqueGrade, realmStageLabelText: string): string[] {
  const gradeIndex = getTechniqueGradeIndex(grade);
  const scale = gradeIndex <= 2
    ? '低阶：名称和描述应偏朴素、基础、可修炼，不使用灭世、碎星、焚天、万劫等过强词。'
    : gradeIndex <= 4
      ? '中阶：可以写灵压、剑光、丹火、阵纹、山河之势，但仍避免宇宙级、毁天灭地级措辞。'
      : '高阶：可以使用天象、法则、虚空、圣意、帝威等强势意象，名称要显得稀有而厚重。';
  return [
    `本次抽中 ${gradeLabel(grade)} / ${realmStageLabelText}，名称和描述必须匹配这个强度层级。`,
    scale,
    '玩家主题只决定风格倾向，不得覆盖 fixedInputs 中的品阶、境界等级和服务端预算。',
  ];
}

function roundPromptNumber(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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
