/**
 * 任务显示辅助：解析任务目标的显示名称（怪物、功法、境界等）
 */
import { PLAYER_REALM_CONFIG, PlayerRealmStage, QuestObjectiveType } from '@mud/shared';

/** ResolveQuestTargetNameOptions：定义该类型的结构与数据语义。 */
type ResolveQuestTargetNameOptions = {
/** objectiveType：定义该变量以承载业务值。 */
  objectiveType: QuestObjectiveType;
/** title：定义该变量以承载业务值。 */
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

/** normalizeKillQuestTargetName：执行对应的业务逻辑。 */
function normalizeKillQuestTargetName(name?: string | null): string | undefined {
  if (!name) {
    return undefined;
  }
/** sanitized：定义该变量以承载业务值。 */
  const sanitized = name.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : name;
}

/** 判断字符串是否像内部内容 ID（纯 ASCII、含分隔符、无空格） */
export function isLikelyInternalContentId(value?: string | null): boolean {
  if (!value) return false;
/** trimmed：定义该变量以承载业务值。 */
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[\x00-\x7F]+$/.test(trimmed) && /[._-]/.test(trimmed) && !/\s/.test(trimmed);
}

/** 将境界阶段枚举转为中文标签 */
export function resolveRealmStageTargetLabel(stage?: PlayerRealmStage): string | undefined {
  if (stage === undefined) {
    return undefined;
  }
  return PLAYER_REALM_CONFIG[stage]?.name;
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
/** normalizedTargetName：定义该变量以承载业务值。 */
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

