/**
 * player-domain-persistence.build-rows.ts
 *
 * 从 player-domain-persistence.rows.ts 拆出的行构建函数。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { PoolClient } from 'pg';
import type {
  PersistedPlayerSnapshot,
  TechniqueStateRow,
  TechniqueComprehensionRow,
  PersistentBuffStateRow,
  QuestProgressRow,
  CombatPreferencesRow,
  AutoBattleSkillRow,
  AutoUseItemRuleRow,
  ProfessionStateRow,
  AlchemyPresetRow,
  ActiveJobRow,
  TechniqueActivityQueueRow,
  EnhancementRecordRow,
  AttrStateRow,
  TechniqueComprehensionReplaceOptions,
} from './player-domain-persistence.service';
import {
  asRecord,
  cloneJsonValue,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizeOptionalInteger,
  normalizeOptionalNumber,
  normalizeMinimumInteger,
  normalizeMinimumNumber,
  normalizeJsonArray,
  normalizeStringArray,
  normalizeQuestProgressPayload,
  normalizeRuntimeBonuses,
  normalizeRuntimeBonusEntry,
  isDerivedPersistentRuntimeBonusSource,
  normalizePersistedEnhancementItemName,
} from './player-domain-persistence.helpers';
import {
  DEFAULT_COMBAT_ATTACK_INTENSITY,
  normalizeCombatAttackIntensity,
} from '@mud/shared';

export function buildTechniqueStateRows(snapshot: PersistedPlayerSnapshot): TechniqueStateRow[] {
  const techniqueEntries = Array.isArray(snapshot.techniques?.techniques) ? snapshot.techniques.techniques : [];
  const rows: TechniqueStateRow[] = [];
  for (const entry of techniqueEntries) {
    const normalized = asRecord(entry);
    const techId = normalizeRequiredString(normalized?.techId);
    if (!techId) {
      continue;
    }
    const learnTechniqueMaxLevelInput = normalizeOptionalInteger(normalized?.learnTechniqueMaxLevel);
    const learnTechniqueMaxLevel = learnTechniqueMaxLevelInput !== null && learnTechniqueMaxLevelInput > 0
      ? learnTechniqueMaxLevelInput
      : null;
    rows.push({
      techId,
      level: normalizeMinimumInteger(normalized?.level, 1, 1),
      exp: normalizeOptionalNumber(normalized?.exp),
      expToNext: normalizeOptionalNumber(normalized?.expToNext),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      skillsEnabled: normalized?.skillsEnabled !== false,
      rawPayload: {
        ...(learnTechniqueMaxLevel === null ? {} : { learnTechniqueMaxLevel }),
      },
    });
  }
  return rows;
}

export function buildTechniqueComprehensionRows(snapshot: PersistedPlayerSnapshot): TechniqueComprehensionRow[] {
  const entries = Array.isArray(snapshot.techniques?.pendingComprehensions) ? snapshot.techniques.pendingComprehensions : [];
  const rows: TechniqueComprehensionRow[] = [];
  for (const entry of entries) {
    const normalized = asRecord(entry);
    const techId = normalizeRequiredString(normalized?.techId);
    if (!techId) {
      continue;
    }
    const maxLevel = normalizeOptionalInteger(normalized?.maxLevel);
    rows.push({
      techId,
      sourceKind: normalizeOptionalString(normalized?.sourceKind) === 'created' ? 'created' : 'normal',
      progress: normalizeMinimumNumber(normalized?.progress, 0, 0),
      requiredProgress: normalizeMinimumNumber(normalized?.requiredProgress, 1, 1),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      grade: normalizeOptionalString(normalized?.grade),
      category: normalizeOptionalString(normalized?.category),
      creatorPlayerId: normalizeOptionalString(normalized?.creatorPlayerId),
      selfComprehensionAllowed: normalized?.selfComprehensionAllowed !== false,
      createdAtTick: normalizeMinimumInteger(normalized?.createdAtTick, 0, 0),
      updatedAtTick: normalizeMinimumInteger(normalized?.updatedAtTick, 0, 0),
      activeTransferJobId: null,
      activeTransferTeacherId: null,
      rawPayload: {
        ...(maxLevel === null ? {} : { maxLevel }),
      },
    });
  }
  return rows;
}

export function buildTechniqueComprehensionEmptyOverwriteTechIds(
  snapshot: PersistedPlayerSnapshot,
): ReadonlySet<string> {
  return new Set(
    (snapshot.techniques?.pendingComprehensionEmptyOverwriteTechIds ?? [])
      .map((techniqueId) => normalizeRequiredString(techniqueId))
      .filter((techniqueId) => techniqueId.length > 0),
  );
}

export function buildPersistentBuffStateRows(snapshot: PersistedPlayerSnapshot): PersistentBuffStateRow[] {
  const buffEntries = Array.isArray(snapshot.buffs?.buffs) ? snapshot.buffs.buffs : [];
  const rows: PersistentBuffStateRow[] = [];
  for (const entry of buffEntries) {
    const normalized = asRecord(entry);
    const buffId = normalizeRequiredString(normalized?.buffId);
    if (!buffId) {
      continue;
    }
    const sourceSkillId =
      normalizeOptionalString(normalized?.sourceSkillId)
      ?? `buff_source:${buffId}`;
    rows.push({
      buffId,
      sourceSkillId,
      sourceCasterId: normalizeOptionalString(normalized?.sourceCasterId),
      realmLv: normalizeOptionalInteger(normalized?.realmLv),
      remainingTicks: normalizeMinimumInteger(normalized?.remainingTicks, 0, 0),
      duration: normalizeMinimumInteger(normalized?.duration, 0, 0),
      stacks: normalizeMinimumInteger(normalized?.stacks, 1, 1),
      maxStacks: normalizeMinimumInteger(normalized?.maxStacks, 1, 1),
      sustainTicksElapsed: normalizeOptionalInteger(normalized?.sustainTicksElapsed),
      rawPayload: {
        ...normalized,
        buffId,
        sourceSkillId,
      },
    });
  }
  return rows;
}

export function buildQuestProgressRows(snapshot: PersistedPlayerSnapshot): QuestProgressRow[] {
  const questEntries = Array.isArray(snapshot.quests?.entries) ? snapshot.quests.entries : [];
  const rows: QuestProgressRow[] = [];
  for (const entry of questEntries) {
    const normalized = asRecord(entry);
    const questId =
      normalizeRequiredString(normalized?.questId)
      || normalizeRequiredString(normalized?.id);
    if (!questId) {
      continue;
    }
    const status = normalizeOptionalString(normalized?.status) ?? 'active';
    rows.push({
      questId,
      status,
      progressPayload: status === 'completed' ? null : normalizeQuestProgressPayload(normalized?.progress),
      rawPayload: buildQuestProgressRawPayload(normalized ?? {}, questId, status),
    });
  }
  return rows;
}

export function buildQuestProgressRawPayload(
  normalized: Record<string, unknown>,
  questId: string,
  status: string,
): Record<string, unknown> {
  if (status === 'completed') {
    const { progress: _progress, ...rest } = normalized;
    return { ...rest, id: questId, questId, status };
  }
  return { ...normalized, id: questId, questId, status };
}

export function buildEnhancementRecordRows(playerId: string, snapshot: PersistedPlayerSnapshot): EnhancementRecordRow[] {
  const progression = asRecord(snapshot.progression);
  const entries = Array.isArray(progression?.enhancementRecords) ? progression.enhancementRecords : [];
  return buildEnhancementRecordRowsFromEntries(playerId, entries);
}

/**
 * 将运行时形态的强化记录条目归一为 DB 行形态。
 * 运行时记录字段为 `levels`，DB 列名为 `levels_payload`；这里统一负责字段映射、类型清洗和 recordId 兜底。
 * 直接调用 `savePlayerEnhancementRecords` 的链路（如 `CraftPanelRuntimeService.persistEnhancementRecords`）必须先经过此归一，
 * 否则 `levels_payload` 会因 undefined → null 触发 `player_enhancement_record.levels_payload` NOT NULL 约束违反。
 */
export function buildEnhancementRecordRowsFromEntries(
  playerId: string,
  entries: readonly unknown[],
): EnhancementRecordRow[] {
  const rows: EnhancementRecordRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const normalized = asRecord(entries[index]);
    const itemId = normalizeRequiredString(normalized?.itemId);
    if (!itemId) {
      continue;
    }
    const recordId =
      normalizeOptionalString(normalized?.recordId)
      ?? normalizeOptionalString(normalized?.id)
      ?? `enhancement_record:${playerId}:${itemId}:${index}`;
    rows.push({
      recordId,
      itemId,
      itemName: normalizePersistedEnhancementItemName(itemId, normalized?.itemName),
      highestLevel: normalizeMinimumInteger(normalized?.highestLevel, 0, 0),
      levelsPayload: Array.isArray(normalized?.levels) ? normalized.levels.map((entry) => cloneJsonValue(entry)) : [],
      actionStartedAt: normalizeOptionalInteger(normalized?.actionStartedAt),
      actionEndedAt: normalizeOptionalInteger(normalized?.actionEndedAt),
      startLevel: normalizeOptionalInteger(normalized?.startLevel),
      initialTargetLevel: normalizeOptionalInteger(normalized?.initialTargetLevel),
      desiredTargetLevel: normalizeOptionalInteger(normalized?.desiredTargetLevel),
      protectionStartLevel: normalizeOptionalInteger(normalized?.protectionStartLevel),
      status: normalizeOptionalString(normalized?.status),
    });
  }
  return rows;
}

export function buildCombatPreferencesRow(snapshot: PersistedPlayerSnapshot): CombatPreferencesRow | null {
  const combat = asRecord(snapshot.combat);
  if (!combat) {
    return null;
  }
  const targetingRulesPayload = asRecord(combat.combatTargetingRules);
  return {
    autoBattle: combat.autoBattle === true,
    autoRetaliate: combat.autoRetaliate === true,
    autoBattleStationary: combat.autoBattleStationary === true,
    autoBattleTargetingMode: normalizeOptionalString(combat.autoBattleTargetingMode) ?? 'auto',
    retaliatePlayerTargetId: normalizeOptionalString(combat.retaliatePlayerTargetId),
    retaliatePlayerTargetLastAttackTick: normalizeOptionalInteger(combat.retaliatePlayerTargetLastAttackTick),
    combatTargetId: normalizeOptionalString(combat.combatTargetId),
    combatTargetLocked: combat.combatTargetLocked === true,
    allowAoePlayerHit: combat.allowAoePlayerHit === true,
    autoIdleCultivation: combat.autoIdleCultivation === true,
    autoSwitchCultivation: combat.autoSwitchCultivation === true,
    autoRootFoundation: combat.autoRootFoundation === true,
    combatAttackIntensity: normalizeCombatAttackIntensity(combat.combatAttackIntensity ?? DEFAULT_COMBAT_ATTACK_INTENSITY),
    senseQiActive: combat.senseQiActive === true,
    cultivationActive: combat.cultivationActive === true,
    cultivatingTechId: normalizeOptionalString(snapshot.techniques?.cultivatingTechId),
    targetingRulesPayload: targetingRulesPayload ? { ...targetingRulesPayload } : null,
  };
}

export function buildAutoBattleSkillRows(snapshot: PersistedPlayerSnapshot): AutoBattleSkillRow[] {
  const entries = Array.isArray(snapshot.combat?.autoBattleSkills) ? snapshot.combat.autoBattleSkills : [];
  const rows: AutoBattleSkillRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const normalized = asRecord(entries[index]);
    const skillId = normalizeRequiredString(normalized?.skillId);
    if (!skillId) {
      continue;
    }
    rows.push({
      skillId,
      enabled: normalized?.enabled !== false,
      skillEnabled: normalized?.skillEnabled !== false,
      autoBattleOrder: normalizeMinimumInteger(normalized?.autoBattleOrder, index, 0),
    });
  }
  return rows;
}

export function buildAutoUseItemRuleRows(snapshot: PersistedPlayerSnapshot): AutoUseItemRuleRow[] {
  const combat = asRecord(snapshot.combat);
  const entries = Array.isArray(combat?.autoUsePills) ? combat.autoUsePills : [];
  const rows: AutoUseItemRuleRow[] = [];
  for (const entry of entries) {
    const normalized = asRecord(entry);
    const itemId = normalizeRequiredString(normalized?.itemId);
    if (!itemId) {
      continue;
    }
    rows.push({
      itemId,
      conditionPayload: normalizeJsonArray(normalized?.conditions),
    });
  }
  return rows;
}

export function buildProfessionStateRows(snapshot: PersistedPlayerSnapshot): ProfessionStateRow[] {
  const progression = asRecord(snapshot.progression);
  const rows: ProfessionStateRow[] = [];

  const alchemy = asRecord(progression?.alchemySkill);
  if (alchemy) {
    rows.push({
      professionType: 'alchemy',
      level: normalizeMinimumInteger(alchemy.level, 1, 1),
      exp: normalizeOptionalNumber(alchemy.exp),
      expToNext: normalizeOptionalNumber(alchemy.expToNext),
    });
  }

  const gather = asRecord(progression?.gatherSkill);
  if (gather) {
    rows.push({
      professionType: 'gather',
      level: normalizeMinimumInteger(gather.level, 1, 1),
      exp: normalizeOptionalNumber(gather.exp),
      expToNext: normalizeOptionalNumber(gather.expToNext),
    });
  }

  const mining = asRecord(progression?.miningSkill);
  if (mining) {
    rows.push({
      professionType: 'mining',
      level: normalizeMinimumInteger(mining.level, 1, 1),
      exp: normalizeOptionalNumber(mining.exp),
      expToNext: normalizeOptionalNumber(mining.expToNext),
    });
  }

  const building = asRecord(progression?.buildingSkill);
  if (building) {
    rows.push({
      professionType: 'building',
      level: normalizeMinimumInteger(building.level, 1, 1),
      exp: normalizeOptionalNumber(building.exp),
      expToNext: normalizeOptionalNumber(building.expToNext),
    });
  }

  const formation = asRecord(progression?.formationSkill);
  if (formation) {
    rows.push({
      professionType: 'formation',
      level: normalizeMinimumInteger(formation.level, 1, 1),
      exp: normalizeOptionalNumber(formation.exp),
      expToNext: normalizeOptionalNumber(formation.expToNext),
    });
  }

  const transmission = asRecord(progression?.transmissionSkill);
  if (transmission) {
    rows.push({
      professionType: 'transmission',
      level: normalizeMinimumInteger(transmission.level, 1, 1),
      exp: normalizeOptionalNumber(transmission.exp),
      expToNext: normalizeOptionalNumber(transmission.expToNext),
    });
  }

  const forging = asRecord(progression?.forgingSkill);
  if (forging) {
    rows.push({
      professionType: 'forging',
      level: normalizeMinimumInteger(forging.level, 1, 1),
      exp: normalizeOptionalNumber(forging.exp),
      expToNext: normalizeOptionalNumber(forging.expToNext),
    });
  }

  const enhancement = asRecord(progression?.enhancementSkill);
  const enhancementLevel = normalizeMinimumInteger(
    enhancement?.level ?? progression?.enhancementSkillLevel,
    1,
    1,
  );
  rows.push({
    professionType: 'enhancement',
    level: enhancementLevel,
    exp: normalizeOptionalNumber(enhancement?.exp),
    expToNext: normalizeOptionalNumber(enhancement?.expToNext),
  });

  return rows;
}

export function buildAlchemyPresetRows(snapshot: PersistedPlayerSnapshot): AlchemyPresetRow[] {
  const progression = asRecord(snapshot.progression);
  const presets = Array.isArray(progression?.alchemyPresets) ? progression.alchemyPresets : [];
  return presets
    .map((entry, index) => {
      const preset = asRecord(entry);
      const presetId =
        normalizeOptionalString(preset?.presetId)
        ?? normalizeOptionalString(preset?.id)
        ?? `alchemy_preset:${index}`;
      if (!presetId) {
        return null;
      }
      return {
        presetId,
        recipeId: normalizeOptionalString(preset?.recipeId),
        name: normalizeOptionalString(preset?.name) ?? `preset:${index + 1}`,
        ingredients: Array.isArray(preset?.ingredients) ? preset.ingredients : [],
      };
    })
    .filter((entry): entry is AlchemyPresetRow => entry !== null);
}

export function buildActiveJobRow(
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
  versionSeed: number,
): ActiveJobRow | null {
  const progression = asRecord(snapshot.progression);
  const enhancementJob = asRecord(progression?.enhancementJob);
  if (enhancementJob && Object.keys(enhancementJob).length > 0) {
    const startedAt = normalizeOptionalInteger(enhancementJob.startedAt) ?? versionSeed;
    const jobRunId =
      normalizeOptionalString(enhancementJob.jobRunId)
      ?? `job:${playerId}:enhancement:${startedAt}`;
    const jobVersion = Math.max(
      1,
      Math.trunc(
        Number(
          normalizeOptionalInteger(enhancementJob.jobVersion)
          ?? versionSeed,
        ),
      ),
    );
    return {
      jobRunId,
      jobType: 'enhancement',
      status: normalizeJobStatus(enhancementJob),
      phase: normalizeOptionalString(enhancementJob.phase) ?? 'running',
      startedAt,
      finishedAt: normalizeOptionalInteger(enhancementJob.finishedAt),
      pausedTicks: normalizeMinimumInteger(enhancementJob.pausedTicks, 0, 0),
      totalTicks: normalizeMinimumInteger(enhancementJob.totalTicks, 0, 0),
      remainingTicks: normalizeMinimumInteger(enhancementJob.remainingTicks, 0, 0),
      successRate: normalizeOptionalNumber(enhancementJob.successRate) ?? 0,
      speedRate: normalizeOptionalNumber(enhancementJob.totalSpeedRate) ?? 1,
      jobVersion,
      detailJson: {
        ...enhancementJob,
        jobRunId,
        jobVersion,
      },
    };
  }

  const formationJob = asRecord(progression?.formationJob);
  if (formationJob && Object.keys(formationJob).length > 0) {
    const startedAt = normalizeOptionalInteger(formationJob.startedAt) ?? versionSeed;
    const jobRunId =
      normalizeOptionalString(formationJob.jobRunId)
      ?? `job:${playerId}:formation:${startedAt}`;
    const jobVersion = Math.max(
      1,
      Math.trunc(Number(normalizeOptionalInteger(formationJob.jobVersion) ?? versionSeed)),
    );
    return {
      jobRunId,
      jobType: 'formation',
      status: normalizeJobStatus(formationJob),
      phase: normalizeOptionalString(formationJob.phase) ?? 'maintaining',
      startedAt,
      finishedAt: normalizeOptionalInteger(formationJob.finishedAt),
      pausedTicks: normalizeMinimumInteger(formationJob.pausedTicks, 0, 0),
      totalTicks: normalizeMinimumInteger(formationJob.totalTicks, 1, 1),
      remainingTicks: normalizeMinimumInteger(formationJob.remainingTicks, 0, 0),
      successRate: normalizeOptionalNumber(formationJob.successRate) ?? 1,
      speedRate: normalizeOptionalNumber(formationJob.maintenanceRate) ?? 1,
      jobVersion,
      detailJson: {
        ...formationJob,
        jobRunId,
        jobType: 'formation',
        jobVersion,
      },
    };
  }

  const transmissionJob = asRecord(progression?.transmissionJob);
  if (transmissionJob && Object.keys(transmissionJob).length > 0) {
    return buildGenericTechniqueActiveJobRow(playerId, transmissionJob, 'transmission', versionSeed, {
      phase: 'transmitting',
      totalTicks: 1,
      remainingTicks: 0,
      successRate: 1,
      speedRate: 1,
    });
  }

  const gatherJob = asRecord(progression?.gatherJob);
  if (gatherJob && Object.keys(gatherJob).length > 0) {
    return buildGenericTechniqueActiveJobRow(playerId, gatherJob, 'gather', versionSeed, {
      phase: 'gathering',
      totalTicks: 1,
      remainingTicks: 0,
      successRate: 1,
      speedRate: 1,
    });
  }

  const miningJob = asRecord(progression?.miningJob);
  if (miningJob && Object.keys(miningJob).length > 0) {
    return buildGenericTechniqueActiveJobRow(playerId, miningJob, 'mining', versionSeed, {
      phase: 'mining',
      totalTicks: 1,
      remainingTicks: 0,
      successRate: 1,
      speedRate: normalizeOptionalNumber(miningJob.baseDamagePerTick) ?? 1,
    });
  }

  const buildingJob = asRecord(progression?.buildingJob);
  if (buildingJob && Object.keys(buildingJob).length > 0) {
    return buildGenericTechniqueActiveJobRow(playerId, buildingJob, 'building', versionSeed, {
      phase: 'building',
      totalTicks: 1,
      remainingTicks: 0,
      successRate: 1,
      speedRate: 1,
    });
  }

  const forgingJob = asRecord(progression?.forgingJob);
  if (forgingJob && Object.keys(forgingJob).length > 0) {
    return buildAlchemyActiveJobRow(playerId, forgingJob, 'forging', versionSeed);
  }

  const alchemyJob = asRecord(progression?.alchemyJob);
  if (alchemyJob && Object.keys(alchemyJob).length > 0) {
    return buildAlchemyActiveJobRow(playerId, alchemyJob, alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy', versionSeed);
  }

  return null;
}

export function buildTechniqueActivityQueueRows(snapshot: PersistedPlayerSnapshot): TechniqueActivityQueueRow[] {
  const progression = asRecord(snapshot.progression);
  const entries = Array.isArray(progression?.techniqueActivityQueue) ? progression.techniqueActivityQueue : [];
  const rows: TechniqueActivityQueueRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = asRecord(entries[index]);
    const kind = normalizeRequiredString(entry?.kind);
    if (!kind) {
      continue;
    }
    const createdAt = normalizeMinimumInteger(entry?.createdAt, snapshot.savedAt + index, 1);
    const queueId =
      normalizeOptionalString(entry?.queueId)
      ?? normalizeOptionalString(asRecord(entry?.cancelRef)?.queueId)
      ?? `technique_queue:${kind}:${createdAt}:${index}`;
    const cancelRef = asRecord(entry?.cancelRef) ?? {
      kind,
      queueId,
    };
    rows.push({
      queueId,
      kind,
      state: normalizeOptionalString(entry?.state) ?? 'pending',
      label: normalizeOptionalString(entry?.label),
      targetLabel: normalizeOptionalString(entry?.targetLabel),
      sleepReason: normalizeOptionalString(entry?.sleepReason),
      retryAfterTicks: normalizeOptionalInteger(entry?.retryAfterTicks),
      createdAt,
      payloadJson: cloneJsonValue(entry?.payload ?? {}),
      cancelRefJson: cloneJsonValue(cancelRef),
      detailJson: {
        ...entry,
        queueId,
        kind,
        state: normalizeOptionalString(entry?.state) ?? 'pending',
        createdAt,
        payload: cloneJsonValue(entry?.payload ?? {}),
        cancelRef: cloneJsonValue(cancelRef),
      },
    });
  }
  return rows;
}

export function buildGenericTechniqueActiveJobRow(
  playerId: string,
  job: Record<string, unknown>,
  jobType: 'gather' | 'mining' | 'building' | 'transmission',
  versionSeed: number,
  defaults: {
    phase: string;
    totalTicks: number;
    remainingTicks: number;
    successRate: number;
    speedRate: number;
  },
): ActiveJobRow {
  const startedAt = normalizeOptionalInteger(job.startedAt) ?? versionSeed;
  const jobRunId =
    normalizeOptionalString(job.jobRunId)
    ?? `job:${playerId}:${jobType}:${startedAt}`;
  const rawJobType = normalizeOptionalString(job.jobType);
  const persistedJobType = jobType === 'transmission'
    && (rawJobType === 'scripture_recording' || rawJobType === 'scripture_contemplation')
    ? rawJobType
    : jobType;
  const jobVersion = Math.max(
    1,
    Math.trunc(Number(normalizeOptionalInteger(job.jobVersion) ?? versionSeed)),
  );
  return {
    jobRunId,
    jobType,
    status: normalizeJobStatus(job),
    phase: normalizeOptionalString(job.phase) ?? defaults.phase,
    startedAt,
    finishedAt: normalizeOptionalInteger(job.finishedAt),
    pausedTicks: normalizeMinimumInteger(job.pausedTicks, 0, 0),
    totalTicks: normalizeMinimumInteger(job.totalTicks, defaults.totalTicks, defaults.totalTicks),
    remainingTicks: normalizeMinimumInteger(job.remainingTicks, defaults.remainingTicks, defaults.remainingTicks),
    successRate: normalizeOptionalNumber(job.successRate) ?? defaults.successRate,
    speedRate: normalizeOptionalNumber(job.totalSpeedRate) ?? defaults.speedRate,
    jobVersion,
    detailJson: {
      ...job,
      jobRunId,
      jobType: persistedJobType,
      jobVersion,
    },
  };
}

export function buildAlchemyActiveJobRow(
  playerId: string,
  job: Record<string, unknown>,
  jobType: 'alchemy' | 'forging',
  versionSeed: number,
): ActiveJobRow {
  const startedAt = normalizeOptionalInteger(job.startedAt) ?? versionSeed;
  const jobRunId =
    normalizeOptionalString(job.jobRunId)
    ?? `job:${playerId}:${jobType}:${startedAt}`;
  const jobVersion = Math.max(
    1,
    Math.trunc(
      Number(
        normalizeOptionalInteger(job.jobVersion)
        ?? versionSeed,
      ),
    ),
  );
  return {
    jobRunId,
    jobType,
    status: normalizeJobStatus(job),
    phase: normalizeOptionalString(job.phase) ?? 'running',
    startedAt,
    finishedAt: normalizeOptionalInteger(job.finishedAt),
    pausedTicks: normalizeMinimumInteger(job.pausedTicks, 0, 0),
    totalTicks: normalizeMinimumInteger(job.totalTicks, 0, 0),
    remainingTicks: normalizeMinimumInteger(job.remainingTicks, 0, 0),
    successRate: normalizeOptionalNumber(job.successRate) ?? 0,
    speedRate: normalizeOptionalNumber(job.totalSpeedRate) ?? 1,
    jobVersion,
    detailJson: {
      ...job,
      jobRunId,
      jobType,
      jobVersion,
    },
  };
}

export function normalizeJobStatus(job: Record<string, unknown>): string {
  const explicitStatus = normalizeOptionalString(job.status);
  if (explicitStatus) {
    return explicitStatus;
  }
  if ((normalizeOptionalInteger(job.remainingTicks) ?? 1) <= 0) {
    return 'completed';
  }
  if ((normalizeOptionalInteger(job.pausedTicks) ?? 0) > 0 && job.phase === 'paused') {
    return 'paused';
  }
  return 'running';
}


export function buildAttrStateRow(snapshot: PersistedPlayerSnapshot): AttrStateRow | null {
  const progression = asRecord(snapshot.progression);
  const attrState = asRecord(snapshot.attrState);
  const baseAttrsPayload = asRecord(attrState?.baseAttrs);
  const bonusEntriesPayload = Array.isArray(snapshot.runtimeBonuses)
    ? snapshot.runtimeBonuses.filter((entry) => !isDerivedPersistentRuntimeBonusSource(String(entry?.source ?? '')))
    : [];
  const revealedBreakthroughRequirementIds = normalizeStringArray(
    attrState?.revealedBreakthroughRequirementIds,
  );
  const realmPayload = asRecord(progression?.realm);
  const heavenGatePayload = asRecord(progression?.heavenGate);
  const spiritualRootsPayload = asRecord(progression?.spiritualRoots);
  if (
    !baseAttrsPayload
    && bonusEntriesPayload.length === 0
    && revealedBreakthroughRequirementIds.length === 0
    && !realmPayload
    && !heavenGatePayload
    && !spiritualRootsPayload
  ) {
    return null;
  }
  return {
    baseAttrsPayload: baseAttrsPayload ? { ...baseAttrsPayload } : null,
    bonusEntriesPayload: bonusEntriesPayload.map((entry) => cloneJsonValue(entry)),
    revealedBreakthroughRequirementIds,
    realmPayload: realmPayload ? { ...realmPayload } : null,
    heavenGatePayload: heavenGatePayload ? { ...heavenGatePayload } : null,
    spiritualRootsPayload: spiritualRootsPayload ? { ...spiritualRootsPayload } : null,
  };
}
