import { PlayerRealmStage, QuestObjectiveType } from '@mud/shared';

type ResolveQuestTargetNameOptions = {
  objectiveType: QuestObjectiveType;
  title: string;
  targetName?: string | null;
  targetMonsterId?: string | null;
  targetTechniqueId?: string | null;
  targetRealmStage?: PlayerRealmStage;
  resolveMonsterName?: (monsterId: string) => string | undefined;
  resolveTechniqueName?: (techniqueId: string) => string | undefined;
};

export function isLikelyInternalContentId(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[\x00-\x7F]+$/.test(trimmed) && /[._-]/.test(trimmed) && !/\s/.test(trimmed);
}

export function resolveQuestTargetName({
  objectiveType,
  title,
  targetName,
  targetMonsterId,
  targetTechniqueId,
  targetRealmStage,
  resolveMonsterName,
  resolveTechniqueName,
}: ResolveQuestTargetNameOptions): string {
  if (targetName && !isLikelyInternalContentId(targetName)) {
    return targetName;
  }

  if (objectiveType === 'kill' && targetMonsterId) {
    return resolveMonsterName?.(targetMonsterId) ?? targetName ?? targetMonsterId;
  }

  if (objectiveType === 'learn_technique' && targetTechniqueId) {
    return resolveTechniqueName?.(targetTechniqueId) ?? targetName ?? targetTechniqueId;
  }

  if ((objectiveType === 'realm_progress' || objectiveType === 'realm_stage') && targetRealmStage !== undefined) {
    return PlayerRealmStage[targetRealmStage];
  }

  return targetName ?? title;
}
