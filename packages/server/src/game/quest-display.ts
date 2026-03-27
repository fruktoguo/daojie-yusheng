/**
 * 任务显示辅助：解析任务目标的显示名称（怪物、功法、境界等）
 */
import { PlayerRealmStage, QuestObjectiveType } from '@mud/shared';

type ResolveQuestTargetNameOptions = {
  objectiveType: QuestObjectiveType;
  title: string;
  targetName?: string | null;
  targetNpcId?: string | null;
  targetMonsterId?: string | null;
  targetTechniqueId?: string | null;
  targetRealmStage?: PlayerRealmStage;
  requiredItemId?: string | null;
  resolveNpcName?: (npcId: string) => string | undefined;
  resolveMonsterName?: (monsterId: string) => string | undefined;
  resolveTechniqueName?: (techniqueId: string) => string | undefined;
  resolveItemName?: (itemId: string) => string | undefined;
};

function normalizeKillQuestTargetName(name?: string | null): string | undefined {
  if (!name) {
    return undefined;
  }
  const sanitized = name.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : name;
}

/** 判断字符串是否像内部内容 ID（纯 ASCII、含分隔符、无空格） */
export function isLikelyInternalContentId(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[\x00-\x7F]+$/.test(trimmed) && /[._-]/.test(trimmed) && !/\s/.test(trimmed);
}

/** 将境界阶段枚举转为中文标签 */
export function resolveRealmStageTargetLabel(stage?: PlayerRealmStage): string | undefined {
  switch (stage) {
    case PlayerRealmStage.Mortal:
      return '凡胎';
    case PlayerRealmStage.BodyTempering:
      return '养气';
    case PlayerRealmStage.BoneForging:
      return '开阳';
    case PlayerRealmStage.Meridian:
      return '天璇';
    case PlayerRealmStage.Innate:
      return '大宗师';
    case PlayerRealmStage.QiRefining:
      return '练气前期';
    case PlayerRealmStage.Foundation:
      return '筑基前期';
    default:
      return undefined;
  }
}

/** 解析任务目标的显示名称，优先使用人类可读名称 */
export function resolveQuestTargetName({
  objectiveType,
  title,
  targetName,
  targetNpcId,
  targetMonsterId,
  targetTechniqueId,
  targetRealmStage,
  requiredItemId,
  resolveNpcName,
  resolveMonsterName,
  resolveTechniqueName,
  resolveItemName,
}: ResolveQuestTargetNameOptions): string {
  if (objectiveType === 'talk' && targetNpcId) {
    return resolveNpcName?.(targetNpcId) ?? targetName ?? targetNpcId;
  }

  if (objectiveType === 'kill' && targetMonsterId) {
    const normalizedTargetName = normalizeKillQuestTargetName(targetName);
    if (normalizedTargetName && !isLikelyInternalContentId(normalizedTargetName)) {
      return normalizedTargetName;
    }
    return normalizeKillQuestTargetName(resolveMonsterName?.(targetMonsterId)) ?? normalizedTargetName ?? targetMonsterId;
  }

  if (targetName && !isLikelyInternalContentId(targetName)) {
    return targetName;
  }

  if (objectiveType === 'submit_item' && requiredItemId) {
    return resolveItemName?.(requiredItemId) ?? targetName ?? requiredItemId;
  }

  if (objectiveType === 'learn_technique' && targetTechniqueId) {
    return resolveTechniqueName?.(targetTechniqueId) ?? targetName ?? targetTechniqueId;
  }

  if ((objectiveType === 'realm_progress' || objectiveType === 'realm_stage') && targetRealmStage !== undefined) {
    return resolveRealmStageTargetLabel(targetRealmStage) ?? PlayerRealmStage[targetRealmStage];
  }

  return targetName ?? title;
}
