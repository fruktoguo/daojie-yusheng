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

const ARTS_SYSTEM_PROMPT = `你是修仙游戏的功法设计师。根据玩家需求生成一个完整的术法功法 JSON。
严格遵循下方约束，不要生成约束里不允许的字段。

输出格式：单个 JSON 对象，可被 JSON.parse 直接解析。

必填字段：
- name: string（中文，2~8字）
- grade: string（品阶，必须等于指定值）
- category: "arts"
- realmLv: number（必须等于指定值）
- skills: SkillDef[]（1~2个技能）
- maxLayer: number（层数，3~49）
- expDifficulty: number（经验难度，0.5~2.0，默认 1.0）

可选字段：
- desc: string（功法描述，20~60字）

SkillDef 结构：
- id: string（临时占位，后端会重写）
- name: string（技能名，中文）
- desc: string（技能描述）
- cooldown: number（冷却息数，0~10）
- cost: number（灵力消耗倍率）
- range: number（射程，1~5）
- targeting: { shape: "single" | "line" | "area", range: number }
- effects: SkillEffect[]（效果列表）
- unlockLevel: number（解锁层数，1~maxLayer）

SkillEffect 类型：
- { type: "damage", value: number, damageKind: "physical"|"spell" }
- { type: "heal", value: number }
- { type: "buff", buffId: string, duration: number, value: number }

规则：
- 技能效果的 value 只是权重，服务端会按预算归一化
- 功法名称和描述要有修仙风格
- 每个技能至少有 1 个 effect`;

export function buildTechniquePrompt(params: TechniquePromptParams): TechniquePromptOutput {
  const { category, grade, realmLv, maxLayer, playerContext } = params;

  const systemMessage = category === 'internal' ? INTERNAL_SYSTEM_PROMPT : ARTS_SYSTEM_PROMPT;

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
  return {
    systemMessage: original.systemMessage,
    userMessage: `${original.userMessage}\n\n【重要修正】上次生成失败，原因：${failureReason}\n请修正后重新输出完整 JSON。`,
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
