/**
 * player-domain-persistence.projection.ts
 *
 * 从 player-domain-persistence.service.ts 拆出的快照投影保存函数。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { PoolClient } from 'pg';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
import {
  nextPlayerPersistenceVersion,
  type PlayerPresenceUpsertInput,
  type PlayerWalletUpsertInput,
  type PlayerWorldAnchorUpsertInput,
  type PlayerPositionCheckpointUpsertInput,
  type PlayerVitalsUpsertInput,
  type PlayerProgressionCoreUpsertInput,
  type PlayerSnapshotProjectionDomainWriteOptions,
  type PlayerSnapshotProjectionDomainBatchEntry,
  type PlayerDomainWriteOptions,
  type PersistedInventoryRow,
  type LoadedPlayerDomains,
  type PlayerMarketStorageItemUpsertInput,
} from './player-domain-persistence.service';
import {
  PLAYER_PRESENCE_TABLE,
  PLAYER_SECT_MEMBERSHIP_TABLE,
  PLAYER_WORLD_ANCHOR_TABLE,
  PLAYER_POSITION_CHECKPOINT_TABLE,
  PLAYER_VITALS_TABLE,
  PLAYER_PROGRESSION_CORE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  PLAYER_PROJECTION_WATERMARK_COLUMN_BY_DOMAIN,
  PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS,
  WATERMARK_COLUMNS,
  PLAYER_DOMAIN_PROJECTED_TABLES,
  playerDomainModuleLogger,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizeOptionalInteger,
  normalizeVersionSeed,
  acquirePlayerPersistenceLock,
  assertPlayerSnapshotProjectionFenceCurrent,
  isConvergedPlayerProjectionFenceError,
  isConvergedPlayerPresenceFenceError,
  isSupersededPlayerFlushFenceError,
  isSupersededPlayerAssetFenceError,
  readFenceEpoch,
  querySingleRow,
  queryRows,
  indexRowsByPlayerId,
  indexMultiRowsByPlayerId,
  normalizePlayerIdList,
  type RecoveryWatermarkColumn,
  type RecoveryWatermarkPatch,
} from './player-domain-persistence.helpers';
import {
  normalizeIntegerWithFallback,
  normalizeMinimumNumber,
  normalizeMinimumInteger,
  normalizeWorldPreferenceLinePreset,
  asRecord,
} from './player-domain-persistence.helpers';
import { DUNGEON_MAX_STAMINA } from '@mud/shared';
import {
  buildAttrStateRow,
  buildTechniqueStateRows,
  buildTechniqueComprehensionRows,
  buildTechniqueComprehensionEmptyOverwriteTechIds,
  buildPersistentBuffStateRows,
  buildQuestProgressRows,
  buildCombatPreferencesRow,
  buildAutoBattleSkillRows,
  buildAutoUseItemRuleRows,
  buildProfessionStateRows,
  buildAlchemyPresetRows,
  buildActiveJobRow,
  buildTechniqueActivityQueueRows,
  buildEnhancementRecordRows,
} from './player-domain-persistence.build-rows';
import {
  isExplicitEquipmentSlotProjection,
} from './player-domain-persistence.rows';
import {
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  replacePlayerMapUnlockRows,
  replacePlayerMarketStorageItems,
  replacePlayerEquipmentSlots,
  replacePlayerArtifactSlots,
  replacePlayerTechniqueStates,
  replacePlayerTechniqueComprehensions,
  replacePlayerPersistentBuffStates,
  replacePlayerQuestProgressRows,
  replacePlayerCombatPreferences,
  replacePlayerAutoBattleSkills,
  replacePlayerAutoUseItemRules,
  replacePlayerBodyTrainingState,
  replacePlayerAttrState,
  replacePlayerProfessionStates,
  replacePlayerAlchemyPresets,
  replacePlayerActiveJob,
  replacePlayerTechniqueActivityQueue,
  replacePlayerEnhancementRecords,
  replacePlayerLogbookMessages,
  upsertRecoveryWatermark,
} from './player-domain-persistence.rows';


export async function savePlayerSnapshotProjectionWithClient(
  client: PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
): Promise<void> {
  const normalizedPlayerId = normalizeRequiredString(playerId);
  if (!normalizedPlayerId || !snapshot?.placement?.templateId) {
    return;
  }
  assertCompletePlayerSnapshotProjection(normalizedPlayerId, snapshot);

  const versionSeed = normalizeVersionSeed(snapshot.savedAt);
  const placement = snapshot.placement;
  const respawn = snapshot.respawn ?? placement;
  const vitals = snapshot.vitals;
  const progression = asRecord(snapshot.progression);
  const attrState = buildAttrStateRow(snapshot);
  const bodyTraining = asRecord(progression?.bodyTraining);
  const inventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
  const inventoryLockedItems = Array.isArray(snapshot.inventory?.lockedItems)
    ? snapshot.inventory.lockedItems
    : [];
  const walletBalances = Array.isArray(snapshot.wallet?.balances) ? snapshot.wallet.balances : null;
  const marketStorageItems = Array.isArray(snapshot.marketStorage?.items) ? snapshot.marketStorage.items : null;
  const mapUnlockIds = Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [];
  const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
  const artifactSlots = Array.isArray(snapshot.artifacts?.slots) ? snapshot.artifacts.slots : [];
  const techniqueStates = buildTechniqueStateRows(snapshot);
  const techniqueComprehensions = buildTechniqueComprehensionRows(snapshot);
  const persistentBuffStates = buildPersistentBuffStateRows(snapshot);
  const questProgressRows = buildQuestProgressRows(snapshot);
  const combatPreferences = buildCombatPreferencesRow(snapshot);
  const autoBattleSkills = buildAutoBattleSkillRows(snapshot);
  const autoUseItemRules = buildAutoUseItemRuleRows(snapshot);
  const professions = buildProfessionStateRows(snapshot);
  const presets = buildAlchemyPresetRows(snapshot);
  const activeJob = buildActiveJobRow(normalizedPlayerId, snapshot, versionSeed);
  const techniqueActivityQueue = buildTechniqueActivityQueueRows(snapshot);
  const enhancementRecords = buildEnhancementRecordRows(normalizedPlayerId, snapshot);
  const logbookMessages = Array.isArray(snapshot.pendingLogbookMessages)
    ? snapshot.pendingLogbookMessages
    : [];
  const placementX = normalizeIntegerWithFallback(placement.x, 0);
  const placementY = normalizeIntegerWithFallback(placement.y, 0);
  const placementFacing = normalizeIntegerWithFallback(placement.facing, 1);
  const vitalsHp = normalizeMinimumNumber(vitals?.hp, 0, 0);
  const vitalsMaxHp = normalizeMinimumNumber(vitals?.maxHp, 1, 1);
  const vitalsQi = normalizeMinimumNumber(vitals?.qi, 0, 0);
  const vitalsMaxQi = normalizeMinimumNumber(vitals?.maxQi, 0, 0);
  const foundation = normalizeMinimumNumber(progression?.foundation, 0, 0);
  const rootFoundation = normalizeMinimumNumber(progression?.rootFoundation, 0, 0);
  const combatExp = normalizeMinimumNumber(progression?.combatExp, 0, 0);
  const boneAgeBaseYears = normalizeMinimumInteger(progression?.boneAgeBaseYears, 18, 0);
  const lifeElapsedTicks = normalizeMinimumInteger(progression?.lifeElapsedTicks, 0, 0);

  await client.query(
    `
      INSERT INTO ${PLAYER_WORLD_ANCHOR_TABLE}(
        player_id,
        respawn_template_id,
        respawn_instance_id,
        respawn_x,
        respawn_y,
        last_safe_template_id,
        last_safe_instance_id,
        last_safe_x,
        last_safe_y,
        preferred_line_preset,
        last_transfer_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        respawn_template_id = EXCLUDED.respawn_template_id,
        respawn_instance_id = EXCLUDED.respawn_instance_id,
        respawn_x = EXCLUDED.respawn_x,
        respawn_y = EXCLUDED.respawn_y,
        last_safe_template_id = EXCLUDED.last_safe_template_id,
        last_safe_instance_id = EXCLUDED.last_safe_instance_id,
        last_safe_x = EXCLUDED.last_safe_x,
        last_safe_y = EXCLUDED.last_safe_y,
        preferred_line_preset = EXCLUDED.preferred_line_preset,
        last_transfer_at = EXCLUDED.last_transfer_at,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      normalizeRequiredString(respawn.templateId) || placement.templateId,
      normalizeOptionalString(respawn.instanceId),
      normalizeIntegerWithFallback(respawn.x, 0),
      normalizeIntegerWithFallback(respawn.y, 0),
      placement.templateId,
      normalizeOptionalString(placement.instanceId),
      placementX,
      placementY,
      normalizeWorldPreferenceLinePreset(snapshot.worldPreference?.linePreset),
      versionSeed,
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_VITALS_TABLE}(
        player_id,
        hp,
        max_hp,
        qi,
        max_qi,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        hp = EXCLUDED.hp,
        max_hp = EXCLUDED.max_hp,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      vitalsHp,
      vitalsMaxHp,
      vitalsQi,
      vitalsMaxQi,
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(
        player_id,
        foundation,
        root_foundation,
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        stamina,
        stamina_updated_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        root_foundation = EXCLUDED.root_foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        stamina = EXCLUDED.stamina,
        stamina_updated_at = EXCLUDED.stamina_updated_at,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      foundation,
      rootFoundation,
      combatExp,
      boneAgeBaseYears,
      lifeElapsedTicks,
      normalizeOptionalInteger(progression?.lifespanYears),
      normalizeMinimumInteger(progression?.stamina, DUNGEON_MAX_STAMINA, 0),
      normalizeMinimumInteger(progression?.staminaUpdatedAt, Date.now(), 0),
    ],
  );

  await client.query(
    `
      INSERT INTO ${PLAYER_POSITION_CHECKPOINT_TABLE}(
        player_id,
        instance_id,
        x,
        y,
        facing,
        checkpoint_kind,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        facing = EXCLUDED.facing,
        checkpoint_kind = EXCLUDED.checkpoint_kind,
        updated_at = now()
    `,
    [
      normalizedPlayerId,
      normalizeOptionalString(placement.instanceId) ?? `public:${placement.templateId}`,
      placementX,
      placementY,
      placementFacing,
      'runtime',
    ],
  );

  await replacePlayerBodyTrainingState(client, normalizedPlayerId, bodyTraining);
  await replacePlayerAttrState(client, normalizedPlayerId, attrState);

  await replacePlayerInventoryItems(client, normalizedPlayerId, [...inventoryItems, ...inventoryLockedItems]);
  if (walletBalances) {
    await replacePlayerWalletRows(
      client,
      normalizedPlayerId,
      walletBalances as readonly PlayerWalletUpsertInput[],
      versionSeed,
    );
  }
  await replacePlayerSectMembership(
    client,
    normalizedPlayerId,
    normalizeOptionalString(snapshot.sectId),
    versionSeed,
  );
  if (marketStorageItems) {
    await replacePlayerMarketStorageItems(
      client,
      normalizedPlayerId,
      marketStorageItems as readonly PlayerMarketStorageItemUpsertInput[],
    );
  }
    await replacePlayerMapUnlockRows(client, normalizedPlayerId, mapUnlockIds, versionSeed);

  await replacePlayerEquipmentSlots(client, normalizedPlayerId, equipmentSlots);
  await replacePlayerArtifactSlots(client, normalizedPlayerId, artifactSlots);
  await replacePlayerTechniqueStates(client, normalizedPlayerId, techniqueStates);
  await replacePlayerTechniqueComprehensions(
    client,
    normalizedPlayerId,
    techniqueComprehensions,
    {
      completedTechniqueIds: new Set(techniqueStates.map((row) => row.techId)),
      allowExplicitEmptyOverwrite: snapshot.techniques?.allowPendingComprehensionEmptyOverwrite === true,
      explicitlyRemovedTechniqueIds: buildTechniqueComprehensionEmptyOverwriteTechIds(snapshot),
    },
  );
  await replacePlayerPersistentBuffStates(client, normalizedPlayerId, persistentBuffStates);
  await replacePlayerQuestProgressRows(client, normalizedPlayerId, questProgressRows);
  await replacePlayerCombatPreferences(client, normalizedPlayerId, combatPreferences);
  await replacePlayerAutoBattleSkills(client, normalizedPlayerId, autoBattleSkills);
  await replacePlayerAutoUseItemRules(client, normalizedPlayerId, autoUseItemRules);
  await replacePlayerProfessionStates(client, normalizedPlayerId, professions);
  await replacePlayerAlchemyPresets(client, normalizedPlayerId, presets);
  await replacePlayerActiveJob(client, normalizedPlayerId, activeJob);
  await replacePlayerTechniqueActivityQueue(client, normalizedPlayerId, techniqueActivityQueue);
  await replacePlayerEnhancementRecords(client, normalizedPlayerId, enhancementRecords);
  await replacePlayerLogbookMessages(client, normalizedPlayerId, logbookMessages);

  const watermarkPatch: RecoveryWatermarkPatch = {
    anchor_version: versionSeed,
    position_checkpoint_version: versionSeed,
    vitals_version: versionSeed,
    progression_version: versionSeed,
    attr_version: versionSeed,
    body_training_version: versionSeed,
    inventory_version: versionSeed,
    sect_membership_version: versionSeed,
    map_unlock_version: versionSeed,
    equipment_version: versionSeed,
    artifact_version: versionSeed,
    technique_version: versionSeed,
    buff_version: versionSeed,
    quest_version: versionSeed,
    combat_pref_version: versionSeed,
    auto_battle_skill_version: versionSeed,
    auto_use_item_rule_version: versionSeed,
    profession_version: versionSeed,
    alchemy_preset_version: versionSeed,
    active_job_version: versionSeed,
    enhancement_record_version: versionSeed,
    logbook_version: versionSeed,
  };
  if (walletBalances) {
    watermarkPatch.wallet_version = versionSeed;
  }
  if (marketStorageItems) {
    watermarkPatch.market_storage_version = versionSeed;
  }
  await upsertRecoveryWatermark(client, normalizedPlayerId, watermarkPatch);
}

const PLAYER_SNAPSHOT_PROJECTION_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAIN_SET = new Set<string>(PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS);

export function assertCompletePlayerSnapshotProjection(playerId: string, snapshot: PersistedPlayerSnapshot): void {
  const missing: string[] = [];
  const checks: Array<[string, boolean]> = [
    ['placement.templateId', typeof snapshot?.placement?.templateId === 'string' && snapshot.placement.templateId.trim().length > 0],
    ['vitals', Boolean(snapshot?.vitals && typeof snapshot.vitals === 'object')],
    ['progression', Boolean(snapshot?.progression && typeof snapshot.progression === 'object')],
    ['attrState', Boolean(snapshot?.attrState && typeof snapshot.attrState === 'object')],
    ['inventory.items', Array.isArray(snapshot?.inventory?.items)],
    ['unlockedMapIds', Array.isArray(snapshot?.unlockedMapIds)],
    ['equipment.slots', Array.isArray(snapshot?.equipment?.slots)],
    ['artifacts.slots', Array.isArray(snapshot?.artifacts?.slots)],
    ['techniques.techniques', Array.isArray(snapshot?.techniques?.techniques)],
    ['buffs.buffs', Array.isArray(snapshot?.buffs?.buffs)],
    ['quests.entries', Array.isArray(snapshot?.quests?.entries)],
    ['combat', Boolean(snapshot?.combat && typeof snapshot.combat === 'object')],
    ['pendingLogbookMessages', Array.isArray(snapshot?.pendingLogbookMessages)],
  ];
  for (const [path, ok] of checks) {
    if (!ok) {
      missing.push(path);
    }
  }
  if (missing.length > 0) {
    throw new Error(`player_snapshot_projection_incomplete:${playerId}:${missing.join(',')}`);
  }
}

export async function savePlayerSnapshotProjectionDomainsWithClient(
  client: PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
  domains: Iterable<string>,
  options: PlayerSnapshotProjectionDomainWriteOptions = {},
): Promise<void> {
  const normalizedPlayerId = normalizeRequiredString(playerId);
  if (!normalizedPlayerId || !snapshot?.placement?.templateId) {
    return;
  }

  const rawDomains = normalizeProjectedDirtyDomains(domains);
  if (
    rawDomains.size === 0
    || rawDomains.has(PLAYER_SNAPSHOT_PROJECTION_FALLBACK_DOMAIN)
    || Array.from(rawDomains).some((domain) => !PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAIN_SET.has(domain))
  ) {
    const normalizedDomains = Array.from(rawDomains).sort().join(',') || 'none';
    throw new Error(`player_domain_projection_delta_required:${normalizedPlayerId}:${normalizedDomains}`);
  }

  const versionSeed = normalizeVersionSeed(options.expectedProjectionVersion ?? snapshot.savedAt);
  const placement = snapshot.placement;
  const respawn = snapshot.respawn ?? placement;
  const progression = asRecord(snapshot.progression);
  const watermarkPatch: RecoveryWatermarkPatch = {};

  if (rawDomains.has('world_anchor')) {
    await replacePlayerWorldAnchor(client, normalizedPlayerId, {
      respawnTemplateId: normalizeRequiredString(respawn.templateId),
      respawnInstanceId: normalizeOptionalString(respawn.instanceId),
      respawnX: normalizeIntegerWithFallback(respawn.x, 0),
      respawnY: normalizeIntegerWithFallback(respawn.y, 0),
      lastSafeTemplateId: normalizeRequiredString(placement.templateId),
      lastSafeInstanceId: normalizeOptionalString(placement.instanceId),
      lastSafeX: normalizeIntegerWithFallback(placement.x, 0),
      lastSafeY: normalizeIntegerWithFallback(placement.y, 0),
      preferredLinePreset: normalizeWorldPreferenceLinePreset(snapshot.worldPreference?.linePreset),
      lastTransferAt: versionSeed,
    });
    watermarkPatch.anchor_version = versionSeed;
  }

  if (rawDomains.has('position_checkpoint')) {
    await replacePlayerPositionCheckpoint(client, normalizedPlayerId, {
      instanceId: normalizeOptionalString(placement.instanceId) ?? `public:${placement.templateId}`,
      x: normalizeIntegerWithFallback(placement.x, 0),
      y: normalizeIntegerWithFallback(placement.y, 0),
      facing: normalizeIntegerWithFallback(placement.facing, 1),
      checkpointKind: 'runtime',
    });
    watermarkPatch.position_checkpoint_version = versionSeed;
  }

  if (rawDomains.has('vitals')) {
    await replacePlayerVitals(client, normalizedPlayerId, {
      hp: normalizeMinimumNumber(snapshot.vitals?.hp, 0, 0),
      maxHp: normalizeMinimumNumber(snapshot.vitals?.maxHp, 1, 1),
      qi: normalizeMinimumNumber(snapshot.vitals?.qi, 0, 0),
      maxQi: normalizeMinimumNumber(snapshot.vitals?.maxQi, 0, 0),
    });
    watermarkPatch.vitals_version = versionSeed;
  }

  if (rawDomains.has('progression')) {
    await replacePlayerProgressionCore(client, normalizedPlayerId, {
      foundation: normalizeMinimumNumber(progression?.foundation, 0, 0),
      rootFoundation: normalizeMinimumNumber(progression?.rootFoundation, 0, 0),
      combatExp: normalizeMinimumNumber(progression?.combatExp, 0, 0),
      boneAgeBaseYears: normalizeMinimumInteger(progression?.boneAgeBaseYears, 18, 0),
      lifeElapsedTicks: normalizeMinimumInteger(progression?.lifeElapsedTicks, 0, 0),
      lifespanYears: normalizeOptionalInteger(progression?.lifespanYears),
      stamina: normalizeMinimumInteger(progression?.stamina, DUNGEON_MAX_STAMINA, 0),
      // 旧快照未携带精力时间基准时使用当前时间，不能把持久化版本号误当成毫秒时间戳。
      staminaUpdatedAt: normalizeMinimumInteger(progression?.staminaUpdatedAt, Date.now(), 0),
    });
    watermarkPatch.progression_version = versionSeed;
  }

  if (rawDomains.has('attr')) {
    await replacePlayerAttrState(client, normalizedPlayerId, buildAttrStateRow(snapshot));
    watermarkPatch.attr_version = versionSeed;
  }

  if (rawDomains.has('wallet')) {
    const hasExplicitWalletBalances = Array.isArray(snapshot.wallet?.balances);
    const walletBalances = hasExplicitWalletBalances
      ? (snapshot.wallet.balances as readonly PlayerWalletUpsertInput[])
      : [];
    await replacePlayerWalletRows(
      client,
      normalizedPlayerId,
      walletBalances,
      versionSeed,
      {
        allowEmptyOverwrite: options.allowWalletEmptyOverwrite === true && hasExplicitWalletBalances,
      },
    );
    watermarkPatch.wallet_version = versionSeed;
  }

  if (rawDomains.has('sect_membership')) {
    await replacePlayerSectMembership(
      client,
      normalizedPlayerId,
      normalizeOptionalString(snapshot.sectId),
      versionSeed,
    );
    watermarkPatch.sect_membership_version = versionSeed;
  }

  if (rawDomains.has('market_storage')) {
    await replacePlayerMarketStorageItems(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.marketStorage?.items)
        ? (snapshot.marketStorage.items as readonly PlayerMarketStorageItemUpsertInput[])
        : [],
    );
    watermarkPatch.market_storage_version = versionSeed;
  }

  if (rawDomains.has('body_training')) {
    await replacePlayerBodyTrainingState(client, normalizedPlayerId, asRecord(progression?.bodyTraining));
    watermarkPatch.body_training_version = versionSeed;
  }

  if (rawDomains.has('inventory')) {
    const projectedInventoryItems = Array.isArray(snapshot.inventory?.items) ? snapshot.inventory.items : [];
    const projectedInventoryLockedItems = Array.isArray(snapshot.inventory?.lockedItems)
      ? snapshot.inventory.lockedItems
      : [];
    await replacePlayerInventoryItems(
      client,
      normalizedPlayerId,
      [...projectedInventoryItems, ...projectedInventoryLockedItems],
      { allowEmptyOverwrite: options.allowInventoryEmptyOverwrite === true && Array.isArray(snapshot.inventory?.items) },
    );
    watermarkPatch.inventory_version = versionSeed;
  }

  if (rawDomains.has('map_unlock')) {
    await replacePlayerMapUnlockRows(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.unlockedMapIds) ? snapshot.unlockedMapIds : [],
      versionSeed,
    );
    watermarkPatch.map_unlock_version = versionSeed;
  }

  if (rawDomains.has('equipment')) {
    const equipmentSlots = Array.isArray(snapshot.equipment?.slots) ? snapshot.equipment.slots : [];
    await replacePlayerEquipmentSlots(
      client,
      normalizedPlayerId,
      equipmentSlots,
      {
        allowEmptyOverwrite: options.allowEquipmentEmptyOverwrite === true
          && isExplicitEquipmentSlotProjection(equipmentSlots),
      },
    );
    watermarkPatch.equipment_version = versionSeed;
  }

  if (rawDomains.has('artifact')) {
    const artifactSlots = Array.isArray(snapshot.artifacts?.slots) ? snapshot.artifacts.slots : [];
    await replacePlayerArtifactSlots(
      client,
      normalizedPlayerId,
      artifactSlots,
      {
        allowEmptyOverwrite: (options.allowArtifactEmptyOverwrite === true || options.allowEquipmentEmptyOverwrite === true)
          && Array.isArray(snapshot.artifacts?.slots),
      },
    );
    watermarkPatch.artifact_version = versionSeed;
  }

  if (rawDomains.has('technique')) {
    const techniqueRows = buildTechniqueStateRows(snapshot);
    await replacePlayerTechniqueStates(client, normalizedPlayerId, techniqueRows);
    await replacePlayerTechniqueComprehensions(
      client,
      normalizedPlayerId,
      buildTechniqueComprehensionRows(snapshot),
      {
        completedTechniqueIds: new Set(techniqueRows.map((row) => row.techId)),
        allowExplicitEmptyOverwrite: snapshot.techniques?.allowPendingComprehensionEmptyOverwrite === true,
        explicitlyRemovedTechniqueIds: buildTechniqueComprehensionEmptyOverwriteTechIds(snapshot),
      },
    );
    watermarkPatch.technique_version = versionSeed;
  }

  if (rawDomains.has('buff')) {
    await replacePlayerPersistentBuffStates(
      client,
      normalizedPlayerId,
      buildPersistentBuffStateRows(snapshot),
      { allowBuffEmptyOverwrite: options.allowBuffEmptyOverwrite === true },
    );
    watermarkPatch.buff_version = versionSeed;
  }

  if (rawDomains.has('quest')) {
    await replacePlayerQuestProgressRows(client, normalizedPlayerId, buildQuestProgressRows(snapshot));
    watermarkPatch.quest_version = versionSeed;
  }

  if (rawDomains.has('combat_pref')) {
    await replacePlayerCombatPreferences(client, normalizedPlayerId, buildCombatPreferencesRow(snapshot));
    watermarkPatch.combat_pref_version = versionSeed;
  }

  if (rawDomains.has('auto_battle_skill')) {
    await replacePlayerAutoBattleSkills(client, normalizedPlayerId, buildAutoBattleSkillRows(snapshot));
    watermarkPatch.auto_battle_skill_version = versionSeed;
  }

  if (rawDomains.has('auto_use_item_rule')) {
    await replacePlayerAutoUseItemRules(client, normalizedPlayerId, buildAutoUseItemRuleRows(snapshot));
    watermarkPatch.auto_use_item_rule_version = versionSeed;
  }

  if (rawDomains.has('profession')) {
    await replacePlayerProfessionStates(client, normalizedPlayerId, buildProfessionStateRows(snapshot));
    watermarkPatch.profession_version = versionSeed;
  }

  if (rawDomains.has('alchemy_preset')) {
    await replacePlayerAlchemyPresets(client, normalizedPlayerId, buildAlchemyPresetRows(snapshot));
    watermarkPatch.alchemy_preset_version = versionSeed;
  }

  if (rawDomains.has('active_job')) {
    await replacePlayerActiveJob(client, normalizedPlayerId, buildActiveJobRow(normalizedPlayerId, snapshot, versionSeed));
    await replacePlayerTechniqueActivityQueue(client, normalizedPlayerId, buildTechniqueActivityQueueRows(snapshot));
    watermarkPatch.active_job_version = versionSeed;
  }

  if (rawDomains.has('enhancement_record')) {
    await replacePlayerEnhancementRecords(
      client,
      normalizedPlayerId,
      buildEnhancementRecordRows(normalizedPlayerId, snapshot),
    );
    watermarkPatch.enhancement_record_version = versionSeed;
  }

  if (rawDomains.has('logbook')) {
    await replacePlayerLogbookMessages(
      client,
      normalizedPlayerId,
      Array.isArray(snapshot.pendingLogbookMessages) ? snapshot.pendingLogbookMessages : [],
    );
    watermarkPatch.logbook_version = versionSeed;
  }

  if (Object.keys(watermarkPatch).length > 0) {
    await upsertRecoveryWatermark(client, normalizedPlayerId, watermarkPatch);
  }
}

export async function resolveApplicablePlayerSnapshotProjectionDomains(
  client: PoolClient,
  playerId: string,
  entries: readonly { domain: string; expectedProjectionVersion: unknown }[],
): Promise<Set<string>> {
  const applicableDomains = new Set<string>();
  const versionedEntries: Array<{
    domain: string;
    column: RecoveryWatermarkColumn;
    expectedVersion: number;
  }> = [];
  for (const entry of entries) {
    const column = PLAYER_PROJECTION_WATERMARK_COLUMN_BY_DOMAIN[entry.domain];
    if (!column) {
      throw new Error(`player_projection_watermark_column_missing:${playerId}:${entry.domain}`);
    }
    const expectedVersion = Math.max(0, Math.trunc(Number(entry.expectedProjectionVersion)));
    if (!Number.isFinite(expectedVersion) || expectedVersion <= 0) {
      applicableDomains.add(entry.domain);
      continue;
    }
    versionedEntries.push({ domain: entry.domain, column, expectedVersion });
  }
  if (versionedEntries.length === 0) {
    return applicableDomains;
  }
  const watermarkColumns = Array.from(new Set(versionedEntries.map((entry) => entry.column))).sort();
  const result = await client.query<Record<string, unknown>>(
    `
      SELECT ${watermarkColumns.join(', ')}
      FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const watermark = result.rows[0];
  for (const entry of versionedEntries) {
    const currentVersion = Number(watermark?.[entry.column]);
    if (!watermark || !Number.isFinite(currentVersion) || Math.max(0, Math.trunc(currentVersion)) < entry.expectedVersion) {
      applicableDomains.add(entry.domain);
    }
  }
  return applicableDomains;
}

export async function shouldApplyPlayerRecoveryWatermarkVersion(
  client: PoolClient,
  playerId: string,
  watermarkColumns: readonly RecoveryWatermarkColumn[],
  expectedVersionInput: unknown,
  allowEqual: boolean,
): Promise<boolean> {
  const normalizedExpectedVersion = Math.max(0, Math.trunc(Number(expectedVersionInput)));
  if (!Number.isFinite(normalizedExpectedVersion) || normalizedExpectedVersion <= 0 || watermarkColumns.length === 0) {
    return true;
  }
  const result = await client.query<Record<string, unknown>>(
    `
      SELECT ${watermarkColumns.join(', ')}
      FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const watermark = result.rows[0];
  if (!watermark) {
    return true;
  }
  return watermarkColumns.every((column) => {
    const currentVersion = Number(watermark[column]);
    if (!Number.isFinite(currentVersion)) {
      return true;
    }
    const normalizedCurrentVersion = Math.max(0, Math.trunc(currentVersion));
    return allowEqual
      ? normalizedCurrentVersion <= normalizedExpectedVersion
      : normalizedCurrentVersion < normalizedExpectedVersion;
  });
}

export function normalizeProjectedDirtyDomains(domains: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) {
    if (typeof domain === 'string' && domain.trim()) {
      normalized.add(domain.trim());
    }
  }
  return normalized;
}

export async function replacePlayerWorldAnchor(
  client: PoolClient,
  playerId: string,
  row: PlayerWorldAnchorUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_WORLD_ANCHOR_TABLE}(
        player_id,
        respawn_template_id,
        respawn_instance_id,
        respawn_x,
        respawn_y,
        last_safe_template_id,
        last_safe_instance_id,
        last_safe_x,
        last_safe_y,
        preferred_line_preset,
        last_transfer_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        respawn_template_id = EXCLUDED.respawn_template_id,
        respawn_instance_id = EXCLUDED.respawn_instance_id,
        respawn_x = EXCLUDED.respawn_x,
        respawn_y = EXCLUDED.respawn_y,
        last_safe_template_id = EXCLUDED.last_safe_template_id,
        last_safe_instance_id = EXCLUDED.last_safe_instance_id,
        last_safe_x = EXCLUDED.last_safe_x,
        last_safe_y = EXCLUDED.last_safe_y,
        preferred_line_preset = EXCLUDED.preferred_line_preset,
        last_transfer_at = EXCLUDED.last_transfer_at,
        updated_at = now()
    `,
    [
      playerId,
      normalizeRequiredString(row.respawnTemplateId),
      normalizeOptionalString(row.respawnInstanceId),
      normalizeIntegerWithFallback(row.respawnX, 0),
      normalizeIntegerWithFallback(row.respawnY, 0),
      normalizeRequiredString(row.lastSafeTemplateId),
      normalizeOptionalString(row.lastSafeInstanceId),
      normalizeIntegerWithFallback(row.lastSafeX, 0),
      normalizeIntegerWithFallback(row.lastSafeY, 0),
      normalizeWorldPreferenceLinePreset(row.preferredLinePreset),
      normalizeOptionalInteger(row.lastTransferAt),
    ],
  );
}

export async function replacePlayerSectMembership(
  client: PoolClient,
  playerId: string,
  sectId: string | null,
  versionSeed: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_SECT_MEMBERSHIP_TABLE}(
        player_id,
        sect_id,
        updated_at_ms,
        updated_at
      )
      VALUES ($1, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        sect_id = EXCLUDED.sect_id,
        updated_at_ms = EXCLUDED.updated_at_ms,
        updated_at = now()
      WHERE ${PLAYER_SECT_MEMBERSHIP_TABLE}.updated_at_ms <= EXCLUDED.updated_at_ms
    `,
    [playerId, sectId, versionSeed],
  );
}

export async function replacePlayerPositionCheckpoint(
  client: PoolClient,
  playerId: string,
  row: PlayerPositionCheckpointUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_POSITION_CHECKPOINT_TABLE}(
        player_id,
        instance_id,
        x,
        y,
        facing,
        checkpoint_kind,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        instance_id = EXCLUDED.instance_id,
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        facing = EXCLUDED.facing,
        checkpoint_kind = EXCLUDED.checkpoint_kind,
        updated_at = now()
    `,
    [
      playerId,
      normalizeRequiredString(row.instanceId),
      normalizeIntegerWithFallback(row.x, 0),
      normalizeIntegerWithFallback(row.y, 0),
      normalizeIntegerWithFallback(row.facing, 1),
      normalizeRequiredString(row.checkpointKind),
    ],
  );
}

export async function replacePlayerVitals(
  client: PoolClient,
  playerId: string,
  row: PlayerVitalsUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_VITALS_TABLE}(
        player_id,
        hp,
        max_hp,
        qi,
        max_qi,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        hp = EXCLUDED.hp,
        max_hp = EXCLUDED.max_hp,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        updated_at = now()
    `,
    [
      playerId,
      normalizeMinimumNumber(row.hp, 0, 0),
      normalizeMinimumNumber(row.maxHp, 1, 1),
      normalizeMinimumNumber(row.qi, 0, 0),
      normalizeMinimumNumber(row.maxQi, 0, 0),
    ],
  );
}

export async function replacePlayerProgressionCore(
  client: PoolClient,
  playerId: string,
  row: PlayerProgressionCoreUpsertInput,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_PROGRESSION_CORE_TABLE}(
        player_id,
        foundation,
        root_foundation,
        combat_exp,
        bone_age_base_years,
        life_elapsed_ticks,
        lifespan_years,
        stamina,
        stamina_updated_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        foundation = EXCLUDED.foundation,
        root_foundation = EXCLUDED.root_foundation,
        combat_exp = EXCLUDED.combat_exp,
        bone_age_base_years = EXCLUDED.bone_age_base_years,
        life_elapsed_ticks = EXCLUDED.life_elapsed_ticks,
        lifespan_years = EXCLUDED.lifespan_years,
        stamina = EXCLUDED.stamina,
        stamina_updated_at = EXCLUDED.stamina_updated_at,
        updated_at = now()
    `,
    [
      playerId,
      normalizeMinimumNumber(row.foundation, 0, 0),
      normalizeMinimumNumber(row.rootFoundation, 0, 0),
      normalizeMinimumNumber(row.combatExp, 0, 0),
      normalizeMinimumInteger(row.boneAgeBaseYears, 18, 0),
      normalizeMinimumInteger(row.lifeElapsedTicks, 0, 0),
      normalizeOptionalInteger(row.lifespanYears),
      normalizeMinimumInteger(row.stamina, DUNGEON_MAX_STAMINA, 0),
      normalizeMinimumInteger(row.staminaUpdatedAt, Date.now(), 0),
    ],
  );
}
