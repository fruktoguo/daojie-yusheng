/**
 * AI 生成功法目标模式冷路径归一化。
 *
 * 普通伤害术法默认打实体；只有明确表达地形、建筑或临时障碍破坏时才保留 tile。
 */
import type { TechniqueCategory } from '@mud/shared';

export interface GeneratedTechniqueTargetModeContext {
  category: TechniqueCategory;
  playerContext?: string;
}

export function normalizeGeneratedTechniqueTargetModes(
  candidate: Record<string, unknown>,
  context: GeneratedTechniqueTargetModeContext,
): Record<string, unknown> {
  if (context.category !== 'arts' || !Array.isArray(candidate.skills)) {
    return candidate;
  }
  return {
    ...candidate,
    skills: candidate.skills.map((skill) => normalizeGeneratedArtsSkillTargetMode(skill, candidate, context.playerContext)),
  };
}

function normalizeGeneratedArtsSkillTargetMode(
  rawSkill: unknown,
  candidate: Record<string, unknown>,
  playerContext: string | undefined,
): unknown {
  if (!rawSkill || typeof rawSkill !== 'object' || Array.isArray(rawSkill)) {
    return rawSkill;
  }
  const skill = rawSkill as Record<string, unknown>;
  const rawTarget = skill.target;
  if (!rawTarget || typeof rawTarget !== 'object' || Array.isArray(rawTarget)) {
    return rawSkill;
  }
  const target = rawTarget as Record<string, unknown>;
  if (target.targetMode !== 'tile' || shouldKeepGeneratedArtsTileTargetMode(candidate, skill, playerContext)) {
    return rawSkill;
  }
  return {
    ...skill,
    target: {
      ...target,
      targetMode: 'entity',
    },
  };
}

function shouldKeepGeneratedArtsTileTargetMode(
  candidate: Record<string, unknown>,
  skill: Record<string, unknown>,
  playerContext: string | undefined,
): boolean {
  const text = [
    playerContext,
    candidate.name,
    candidate.desc,
    skill.name,
    skill.desc,
  ].filter((value): value is string => typeof value === 'string').join(' ');
  return /地块|地形|土地|建筑|墙|城墙|石头|岩石|矿|采矿|开荒|扩地|拓地|破坏|拆除|摧毁|阵法|屏障|护宗|障碍|临时/.test(text);
}
