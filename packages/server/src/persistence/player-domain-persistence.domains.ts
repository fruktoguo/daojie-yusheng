/**
 * player-domain-persistence.domains.ts
 *
 * 从 player-domain-persistence.service.ts 拆出的域加载和投影列表方法。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { PoolClient } from 'pg';
import type { PlayerDomainPersistenceService } from './player-domain-persistence.service';
import type {
  PersistedPlayerSnapshot,
  LoadedPlayerDomains,
  PlayerWorldAnchorLoadRow,
  PlayerPositionCheckpointLoadRow,
  PlayerVitalsLoadRow,
  PlayerProgressionCoreLoadRow,
  PlayerAttrStateLoadRow,
  PlayerBodyTrainingLoadRow,
  PlayerWalletLoadRow,
  PlayerSectMembershipLoadRow,
  PlayerInventoryItemLoadRow,
  PlayerMarketStorageItemLoadRow,
  PlayerMapUnlockLoadRow,
  PlayerEquipmentSlotLoadRow,
  PlayerArtifactSlotLoadRow,
  PlayerTechniqueStateLoadRow,
  PlayerTechniqueComprehensionLoadRow,
  PlayerPersistentBuffStateLoadRow,
  PlayerQuestProgressLoadRow,
  PlayerCombatPreferencesLoadRow,
  PlayerAutoBattleSkillLoadRow,
  PlayerAutoUseItemRuleLoadRow,
  PlayerProfessionStateLoadRow,
  PlayerAlchemyPresetLoadRow,
  PlayerActiveJobLoadRow,
  PlayerTechniqueActivityQueueLoadRow,
  PlayerEnhancementRecordLoadRow,
  PlayerLogbookMessageLoadRow,
  PlayerRecoveryWatermarkLoadRow,
} from './player-domain-persistence.service';
import type { TechniqueTemplateRepositoryPort } from './player-domain-persistence.service';
import {
  PLAYER_WORLD_ANCHOR_TABLE,
  PLAYER_POSITION_CHECKPOINT_TABLE,
  PLAYER_VITALS_TABLE,
  PLAYER_PROGRESSION_CORE_TABLE,
  PLAYER_ATTR_STATE_TABLE,
  PLAYER_BODY_TRAINING_STATE_TABLE,
  PLAYER_WALLET_TABLE,
  PLAYER_SECT_MEMBERSHIP_TABLE,
  PLAYER_INVENTORY_ITEM_TABLE,
  PLAYER_MARKET_STORAGE_ITEM_TABLE,
  PLAYER_MAP_UNLOCK_TABLE,
  PLAYER_EQUIPMENT_SLOT_TABLE,
  PLAYER_ARTIFACT_SLOT_TABLE,
  PLAYER_TECHNIQUE_STATE_TABLE,
  PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
  PLAYER_PERSISTENT_BUFF_STATE_TABLE,
  PLAYER_QUEST_PROGRESS_TABLE,
  PLAYER_COMBAT_PREFERENCES_TABLE,
  PLAYER_AUTO_BATTLE_SKILL_TABLE,
  PLAYER_AUTO_USE_ITEM_RULE_TABLE,
  PLAYER_PROFESSION_STATE_TABLE,
  PLAYER_ALCHEMY_PRESET_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE,
  PLAYER_ENHANCEMENT_RECORD_TABLE,
  PLAYER_LOGBOOK_MESSAGE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS,
  querySingleRow,
  queryRows,
  indexRowsByPlayerId,
  indexMultiRowsByPlayerId,
  normalizeRequiredString,
  normalizeOptionalString,
  applyProjectedPlacement,
  applyProjectedProgressionCore,
  applyProjectedAttrState,
  applyProjectedBodyTraining,
  applyProjectedEquipment,
  applyProjectedArtifacts,
  applyProjectedTechniques,
  applyProjectedPersistentBuffs,
  applyProjectedProfessions,
  applyProjectedCombatPreferences,
  buildProjectedSnapshotFromDomains,
  hasProjectedPlayerDomainState,
  hasAnyLoadedPlayerDomainState,
} from './player-domain-persistence.helpers';

export async function loadPlayerDomainsImpl(
  self: PlayerDomainPersistenceService,
  playerId: string,
): Promise<LoadedPlayerDomains | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!self.pool || !self.enabled || !normalizedPlayerId) {
      return null;
    }

    const client = await self.pool.connect();
    try {
      const worldAnchor = await querySingleRow<PlayerWorldAnchorLoadRow>(
        client,
        `
          SELECT
            respawn_template_id,
            respawn_instance_id,
            respawn_x,
            respawn_y,
            last_safe_template_id,
            last_safe_instance_id,
            last_safe_x,
            last_safe_y,
            preferred_line_preset,
            last_transfer_at
          FROM ${PLAYER_WORLD_ANCHOR_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const positionCheckpoint = await querySingleRow<PlayerPositionCheckpointLoadRow>(
        client,
        `
          SELECT
            instance_id,
            x,
            y,
            facing,
            checkpoint_kind
          FROM ${PLAYER_POSITION_CHECKPOINT_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const vitals = await querySingleRow<PlayerVitalsLoadRow>(
        client,
        `
          SELECT
            hp,
            max_hp,
            qi,
            max_qi
          FROM ${PLAYER_VITALS_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const progressionCore = await querySingleRow<PlayerProgressionCoreLoadRow>(
        client,
        `
          SELECT
            foundation,
            root_foundation,
            combat_exp,
            bone_age_base_years,
            life_elapsed_ticks,
            lifespan_years,
            stamina,
            stamina_updated_at
          FROM ${PLAYER_PROGRESSION_CORE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const attrState = await querySingleRow<PlayerAttrStateLoadRow>(
        client,
        `
          SELECT
            base_attrs_payload,
            bonus_entries_payload,
            revealed_breakthrough_requirement_ids,
            realm_payload,
            heaven_gate_payload,
            spiritual_roots_payload
          FROM ${PLAYER_ATTR_STATE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const bodyTraining = await querySingleRow<PlayerBodyTrainingLoadRow>(
        client,
        `
          SELECT
            level,
            exp,
            exp_to_next
          FROM ${PLAYER_BODY_TRAINING_STATE_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const walletRows = await queryRows<PlayerWalletLoadRow>(
        client,
        `
          SELECT
            wallet_type,
            balance,
            frozen_balance,
            version
          FROM ${PLAYER_WALLET_TABLE}
          WHERE player_id = $1
          ORDER BY wallet_type ASC
        `,
        [normalizedPlayerId],
      );
      const sectMembership = await querySingleRow<PlayerSectMembershipLoadRow>(
        client,
        `
          SELECT
            sect_id,
            updated_at_ms
          FROM ${PLAYER_SECT_MEMBERSHIP_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const inventoryItems = await queryRows<PlayerInventoryItemLoadRow>(
        client,
        `
          SELECT
            item_instance_id,
            item_id,
            count,
            slot_index,
            raw_payload,
            locked_by
          FROM ${PLAYER_INVENTORY_ITEM_TABLE}
          WHERE player_id = $1
          ORDER BY slot_index ASC
        `,
        [normalizedPlayerId],
      );
      const marketStorageItems = await queryRows<PlayerMarketStorageItemLoadRow>(
        client,
        `
          SELECT
            storage_item_id,
            item_id,
            count,
            slot_index,
            enhance_level,
            raw_payload
          FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
          WHERE player_id = $1
          ORDER BY slot_index ASC, storage_item_id ASC
        `,
        [normalizedPlayerId],
      );
      const mapUnlocks = await queryRows<PlayerMapUnlockLoadRow>(
        client,
        `
          SELECT
            map_id,
            unlocked_at
          FROM ${PLAYER_MAP_UNLOCK_TABLE}
          WHERE player_id = $1
          ORDER BY unlocked_at ASC, map_id ASC
        `,
        [normalizedPlayerId],
      );
      const equipmentSlots = await queryRows<PlayerEquipmentSlotLoadRow>(
        client,
        `
          SELECT
            slot_type,
            item_instance_id,
            item_id,
            raw_payload
          FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}
          WHERE player_id = $1
          ORDER BY slot_type ASC
        `,
        [normalizedPlayerId],
      );
      const artifactSlots = await queryRows<PlayerArtifactSlotLoadRow>(
        client,
        `
          SELECT
            slot_type,
            unlocked,
            enabled,
            qi,
            max_qi,
            item_instance_id,
            item_id,
            raw_payload
          FROM ${PLAYER_ARTIFACT_SLOT_TABLE}
          WHERE player_id = $1
          ORDER BY slot_type ASC
        `,
        [normalizedPlayerId],
      );
      const techniqueStates = await queryRows<PlayerTechniqueStateLoadRow>(
        client,
        `
          SELECT
            tech_id,
            level,
            exp,
            exp_to_next,
            realm_lv,
            skills_enabled,
            raw_payload
          FROM ${PLAYER_TECHNIQUE_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY realm_lv ASC NULLS LAST, tech_id ASC
        `,
        [normalizedPlayerId],
      );
      const techniqueComprehensions = await queryRows<PlayerTechniqueComprehensionLoadRow>(
        client,
        `
          SELECT
            tech_id,
            source_kind,
            progress,
            required_progress,
            realm_lv,
            grade,
            category,
            creator_player_id,
            self_comprehension_allowed,
            created_at_tick,
            updated_at_tick,
            active_transfer_job_id,
            active_transfer_teacher_id,
            raw_payload
          FROM ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}
          WHERE player_id = $1
          ORDER BY realm_lv ASC NULLS LAST, tech_id ASC
        `,
        [normalizedPlayerId],
      );
      const persistentBuffStates = await queryRows<PlayerPersistentBuffStateLoadRow>(
        client,
        `
          SELECT
            buff_id,
            source_skill_id,
            source_caster_id,
            realm_lv,
            remaining_ticks,
            duration,
            stacks,
            max_stacks,
            sustain_ticks_elapsed,
            raw_payload
          FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY buff_id ASC, source_skill_id ASC
        `,
        [normalizedPlayerId],
      );
      const questProgressRows = await queryRows<PlayerQuestProgressLoadRow>(
        client,
        `
          SELECT
            quest_id,
            status,
            progress_payload,
            raw_payload
          FROM ${PLAYER_QUEST_PROGRESS_TABLE}
          WHERE player_id = $1
          ORDER BY quest_id ASC
        `,
        [normalizedPlayerId],
      );
      const combatPreferences = await querySingleRow<PlayerCombatPreferencesLoadRow>(
        client,
        `
          SELECT
            auto_battle,
            auto_retaliate,
            auto_battle_stationary,
            auto_battle_targeting_mode,
            retaliate_player_target_id,
            retaliate_player_target_last_attack_tick,
            combat_target_id,
            combat_target_locked,
            allow_aoe_player_hit,
            auto_idle_cultivation,
            auto_switch_cultivation,
            auto_root_foundation,
            combat_attack_intensity,
            sense_qi_active,
            cultivation_active,
            cultivating_tech_id,
            targeting_rules_payload
          FROM ${PLAYER_COMBAT_PREFERENCES_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const autoBattleSkills = await queryRows<PlayerAutoBattleSkillLoadRow>(
        client,
        `
          SELECT
            skill_id,
            enabled,
            skill_enabled,
            auto_battle_order
          FROM ${PLAYER_AUTO_BATTLE_SKILL_TABLE}
          WHERE player_id = $1
          ORDER BY auto_battle_order ASC, skill_id ASC
        `,
        [normalizedPlayerId],
      );
      const autoUseItemRules = await queryRows<PlayerAutoUseItemRuleLoadRow>(
        client,
        `
          SELECT
            item_id,
            condition_payload
          FROM ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}
          WHERE player_id = $1
          ORDER BY item_id ASC
        `,
        [normalizedPlayerId],
      );
      const professionStates = await queryRows<PlayerProfessionStateLoadRow>(
        client,
        `
          SELECT
            profession_type,
            level,
            exp,
            exp_to_next
          FROM ${PLAYER_PROFESSION_STATE_TABLE}
          WHERE player_id = $1
          ORDER BY profession_type ASC
        `,
        [normalizedPlayerId],
      );
      const alchemyPresets = await queryRows<PlayerAlchemyPresetLoadRow>(
        client,
        `
          SELECT
            preset_id,
            recipe_id,
            name,
            ingredients_payload
          FROM ${PLAYER_ALCHEMY_PRESET_TABLE}
          WHERE player_id = $1
          ORDER BY preset_id ASC
        `,
        [normalizedPlayerId],
      );
      const activeJob = await querySingleRow<PlayerActiveJobLoadRow>(
        client,
        `
          SELECT
            job_run_id,
            job_type,
            status,
            phase,
            started_at,
            finished_at,
            paused_ticks,
            total_ticks,
            remaining_ticks,
            success_rate,
            speed_rate,
            job_version,
            detail_jsonb
          FROM ${PLAYER_ACTIVE_JOB_TABLE}
          WHERE player_id = $1
        `,
        [normalizedPlayerId],
      );
      const techniqueActivityQueue = await queryRows<PlayerTechniqueActivityQueueLoadRow>(
        client,
        `
          SELECT
            queue_id,
            kind,
            state,
            label,
            target_label,
            sleep_reason,
            retry_after_ticks,
            created_at,
            queue_order,
            payload_jsonb,
            cancel_ref_jsonb,
            detail_jsonb
          FROM ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}
          WHERE player_id = $1
          ORDER BY queue_order ASC, created_at ASC, queue_id ASC
        `,
        [normalizedPlayerId],
      );
      const enhancementRecords = await queryRows<PlayerEnhancementRecordLoadRow>(
        client,
        `
          SELECT
            record_id AS "recordId",
            item_id AS "itemId",
            item_name AS "itemName",
            highest_level AS "highestLevel",
            levels_payload AS "levelsPayload",
            action_started_at AS "actionStartedAt",
            action_ended_at AS "actionEndedAt",
            start_level AS "startLevel",
            initial_target_level AS "initialTargetLevel",
            desired_target_level AS "desiredTargetLevel",
            protection_start_level AS "protectionStartLevel",
            status
          FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE}
          WHERE player_id = $1
          ORDER BY item_id ASC, record_id ASC
        `,
        [normalizedPlayerId],
      );
      const logbookMessages = await queryRows<PlayerLogbookMessageLoadRow>(
        client,
        `
          SELECT
            message_id,
            kind,
            text,
            from_name,
            occurred_at,
            acked_at,
            structured_payload,
            structured_group_payload
          FROM ${PLAYER_LOGBOOK_MESSAGE_TABLE}
          WHERE player_id = $1
          ORDER BY occurred_at ASC, message_id ASC
        `,
        [normalizedPlayerId],
      );
      const recoveryWatermark = await querySingleRow<PlayerRecoveryWatermarkLoadRow>(
        client,
        `SELECT * FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} WHERE player_id = $1`,
        [normalizedPlayerId],
      );
      const hasProjectedState = hasProjectedPlayerDomainState({
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        sectMembership,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        artifactSlots,
        techniqueStates,
        techniqueComprehensions,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        techniqueActivityQueue,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
      });
      const hasAnyLoadedState = hasAnyLoadedPlayerDomainState({
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        sectMembership,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        artifactSlots,
        techniqueStates,
        techniqueComprehensions,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        techniqueActivityQueue,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
      });

      if (!hasAnyLoadedState) {
        return null;
      }

      return {
        worldAnchor,
        positionCheckpoint,
        vitals,
        progressionCore,
        attrState,
        bodyTraining,
        sectMembership,
        walletRows,
        inventoryItems,
        marketStorageItems,
        mapUnlocks,
        equipmentSlots,
        artifactSlots,
        techniqueStates,
        techniqueComprehensions,
        persistentBuffStates,
        questProgressRows,
        combatPreferences,
        autoBattleSkills,
        autoUseItemRules,
        professionStates,
        alchemyPresets,
        activeJob,
        techniqueActivityQueue,
        enhancementRecords,
        logbookMessages,
        recoveryWatermark,
        hasProjectedState,
      };
    } finally {
      client.release();
    }
  }

export async function loadProjectedSnapshotImpl(
  self: PlayerDomainPersistenceService,
  playerId: string,
  buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
): Promise<PersistedPlayerSnapshot | null> {
    const normalizedPlayerId = normalizeRequiredString(playerId);
    if (!normalizedPlayerId) {
      return null;
    }

    const domains = await self.loadPlayerDomains.bind(self)(normalizedPlayerId);
    if (!domains?.hasProjectedState) {
      return null;
    }

    const starterSnapshot = buildStarterSnapshot(normalizedPlayerId);
    if (!starterSnapshot) {
      return null;
    }

    return buildProjectedSnapshotFromDomains(starterSnapshot, domains, self.contentTemplateRepository);
  }

  /** 只读取已建立角色分域的玩家 ID，供广播等无需快照内容的低频运维链路使用。 */
export async function listProjectedPlayerIdsImpl(
  self: PlayerDomainPersistenceService,
): Promise<string[]> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const result = await self.pool.query<{ player_id?: unknown }>(
      `
        SELECT player_id
        FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
        WHERE GREATEST(${PLAYER_PROJECTED_STATE_WATERMARK_COLUMNS.join(', ')}) > 0
        ORDER BY player_id ASC
      `,
    );
    return result.rows
      .map((row) => normalizeRequiredString(row.player_id))
      .filter((playerId) => playerId.length > 0);
  }

export async function listProjectedSnapshotsImpl(
  self: PlayerDomainPersistenceService,
  buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const result = await self.pool.query<{ player_id?: unknown; updated_at_ms?: unknown }>(
      `
        SELECT player_id, (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
        FROM ${PLAYER_RECOVERY_WATERMARK_TABLE}
        ORDER BY player_id ASC
      `,
    );
    const rows = result.rows ?? [];
    const entries: Array<{ playerId: string; snapshot: PersistedPlayerSnapshot; updatedAt: number }> = [];
    const BATCH_SIZE = 50;
    const CONCURRENCY = 4;
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const tasks = batch.map((row) => async () => {
        const playerId = normalizeRequiredString(row.player_id);
        if (!playerId) return null;
        const snapshot = await self.loadProjectedSnapshot.bind(self)(playerId, buildStarterSnapshot);
        if (!snapshot) return null;
        return {
          playerId,
          snapshot,
          updatedAt: Math.max(0, Math.trunc(Number(row.updated_at_ms ?? snapshot.savedAt ?? 0))),
        };
      });
      // 按 CONCURRENCY 并发执行当前批次
      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        const chunk = tasks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map((fn) => fn()));
        for (const entry of results) {
          if (entry) entries.push(entry);
        }
      }
    }
    return entries;
  }

  /**
   * 批量查询排行榜所需的最小字段集。
   * 用固定数量的全表/条件查询替代逐个玩家的 loadPlayerDomains（20+ 表/玩家），
   * 跳过 quests、logbook、map_unlocks、auto_battle_skills 等排行榜不需要的表。
   * 返回的 snapshot 形状与 buildLeaderboardProjectionFromSnapshot 兼容。
   */
export async function listLeaderboardSnapshotsImpl(
  self: PlayerDomainPersistenceService,
  buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  currencyItemId: string,
): Promise<Array<{ playerId: string; snapshot: PersistedPlayerSnapshot }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const client = await self.pool.connect();
    try {
      // 1. 获取所有玩家 ID
      const watermarkResult = await client.query<{ player_id?: unknown }>(
        `SELECT player_id FROM ${PLAYER_RECOVERY_WATERMARK_TABLE} ORDER BY player_id ASC`,
      );
      const playerIds = (watermarkResult.rows ?? [])
        .map((row) => normalizeRequiredString(row.player_id))
        .filter((id) => id.length > 0);
      if (playerIds.length === 0) {
        return [];
      }

      // 2. 批量查询所有排行榜所需表
      const [
        worldAnchorRows,
        checkpointRows,
        progressionRows,
        attrStateRows,
        bodyTrainingRows,
        professionRows,
        walletRows,
        inventorySpiritStoneRows,
        equipmentRows,
        artifactRows,
        techniqueRows,
        buffRows,
        combatRows,
        activeJobRows,
      ] = await Promise.all([
        self.pool.query<{ player_id?: unknown } & PlayerWorldAnchorLoadRow>(
          `SELECT player_id, respawn_template_id, last_safe_template_id, last_safe_instance_id, last_safe_x, last_safe_y, respawn_instance_id, respawn_x, respawn_y FROM ${PLAYER_WORLD_ANCHOR_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerPositionCheckpointLoadRow>(
          `SELECT player_id, instance_id, x, y, facing FROM ${PLAYER_POSITION_CHECKPOINT_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerProgressionCoreLoadRow>(
          `SELECT player_id, foundation, root_foundation FROM ${PLAYER_PROGRESSION_CORE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerAttrStateLoadRow>(
          `SELECT player_id, base_attrs_payload, bonus_entries_payload, realm_payload FROM ${PLAYER_ATTR_STATE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerBodyTrainingLoadRow>(
          `SELECT player_id, level, exp, exp_to_next FROM ${PLAYER_BODY_TRAINING_STATE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerProfessionStateLoadRow>(
          `SELECT player_id, profession_type, level, exp, exp_to_next FROM ${PLAYER_PROFESSION_STATE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown; wallet_type?: unknown; balance?: unknown }>(
          `SELECT player_id, wallet_type, balance FROM ${PLAYER_WALLET_TABLE} WHERE wallet_type = $1`,
          [currencyItemId],
        ),
        self.pool.query<{ player_id?: unknown; total_count?: unknown }>(
          `SELECT player_id, SUM(count)::bigint AS total_count FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE item_id = $1 GROUP BY player_id`,
          [currencyItemId],
        ),
        self.pool.query<{ player_id?: unknown } & PlayerEquipmentSlotLoadRow>(
          `SELECT player_id, slot_type, item_instance_id, item_id, raw_payload FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerArtifactSlotLoadRow>(
          `SELECT player_id, slot_type, unlocked, enabled, qi, max_qi, item_instance_id, item_id, raw_payload FROM ${PLAYER_ARTIFACT_SLOT_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerTechniqueStateLoadRow>(
          `SELECT player_id, tech_id, level, exp, exp_to_next, realm_lv, skills_enabled, raw_payload FROM ${PLAYER_TECHNIQUE_STATE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerPersistentBuffStateLoadRow>(
          `SELECT player_id, buff_id, source_skill_id, source_caster_id, realm_lv, remaining_ticks, duration, stacks, max_stacks, sustain_ticks_elapsed, raw_payload FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown } & PlayerCombatPreferencesLoadRow>(
          `SELECT player_id, auto_battle, combat_target_id, cultivating_tech_id FROM ${PLAYER_COMBAT_PREFERENCES_TABLE}`,
        ),
        self.pool.query<{ player_id?: unknown; job_type?: unknown }>(
          `SELECT player_id, job_type FROM ${PLAYER_ACTIVE_JOB_TABLE}`,
        ),
      ]);

      // 3. 按 playerId 索引
      const worldAnchorByPid = indexRowsByPlayerId(worldAnchorRows.rows);
      const checkpointByPid = indexRowsByPlayerId(checkpointRows.rows);
      const progressionByPid = indexRowsByPlayerId(progressionRows.rows);
      const attrStateByPid = indexRowsByPlayerId(attrStateRows.rows);
      const bodyTrainingByPid = indexRowsByPlayerId(bodyTrainingRows.rows);
      const professionsByPid = indexMultiRowsByPlayerId(professionRows.rows);
      const walletByPid = indexRowsByPlayerId(walletRows.rows);
      const invSpiritByPid = indexRowsByPlayerId(inventorySpiritStoneRows.rows);
      const equipByPid = indexMultiRowsByPlayerId(equipmentRows.rows);
      const artifactByPid = indexMultiRowsByPlayerId(artifactRows.rows);
      const techByPid = indexMultiRowsByPlayerId(techniqueRows.rows);
      const buffByPid = indexMultiRowsByPlayerId(buffRows.rows);
      const combatByPid = indexRowsByPlayerId(combatRows.rows);
      const activeJobByPid = indexRowsByPlayerId(activeJobRows.rows);

      // 4. 组装每个玩家的轻量 snapshot（按片让出事件循环，避免阻塞 world tick）
      const entries: Array<{ playerId: string; snapshot: PersistedPlayerSnapshot }> = [];
      const SNAPSHOT_ASSEMBLY_BATCH = 200;
      for (let i = 0; i < playerIds.length; i += SNAPSHOT_ASSEMBLY_BATCH) {
        const sliceEnd = Math.min(playerIds.length, i + SNAPSHOT_ASSEMBLY_BATCH);
        for (let j = i; j < sliceEnd; j += 1) {
          const playerId = playerIds[j];
          const starterSnapshot = buildStarterSnapshot(playerId);
          if (!starterSnapshot) {
            continue;
          }
          const snapshot = starterSnapshot;
          // placement
          const worldAnchor = worldAnchorByPid.get(playerId) ?? null;
          const checkpoint = checkpointByPid.get(playerId) ?? null;
          applyProjectedPlacement(snapshot, worldAnchor, checkpoint);
          // progression
          applyProjectedProgressionCore(snapshot, progressionByPid.get(playerId) ?? null);
          // attr state (realm, baseAttrs, runtimeBonuses)
          applyProjectedAttrState(snapshot, attrStateByPid.get(playerId) ?? null);
          // body training
          applyProjectedBodyTraining(snapshot, bodyTrainingByPid.get(playerId) ?? null);
          // 八项技艺等级与经验
          applyProjectedProfessions(snapshot, professionsByPid.get(playerId) ?? []);
          // equipment
          applyProjectedEquipment(snapshot, equipByPid.get(playerId) ?? [], self.contentTemplateRepository);
          applyProjectedArtifacts(snapshot, artifactByPid.get(playerId) ?? [], self.contentTemplateRepository);
          // techniques
          applyProjectedTechniques(snapshot, techByPid.get(playerId) ?? [], self.contentTemplateRepository);
          // buffs
          applyProjectedPersistentBuffs(snapshot, buffByPid.get(playerId) ?? []);
          // combat preferences (排行榜只需 autoBattle, combatTargetId, cultivatingTechId)
          applyProjectedCombatPreferences(snapshot, combatByPid.get(playerId) ?? null);
          // wallet/inventory 灵石计数；市场仓由市场资产汇总统一读取，避免重复查询。
          const walletRow = walletByPid.get(playerId);
          const walletBalance = walletRow ? Math.max(0, Math.trunc(Number(walletRow.balance) || 0)) : 0;
          const invCount = Math.max(0, Math.trunc(Number(invSpiritByPid.get(playerId)?.total_count) || 0));
          snapshot.wallet = {
            balances: walletBalance > 0 || invCount > 0
            ? [{ walletType: currencyItemId, balance: walletBalance, count: invCount }] as any
              : []
          };
          snapshot.inventory = {
            ...snapshot.inventory, items: invCount > 0
            ? [{ itemId: currencyItemId, count: invCount }] as any
              : []
          };
          // active job (排行榜只需判断 alchemy/enhancement 存在性)
          const jobRow = activeJobByPid.get(playerId);
          const jobType = jobRow ? normalizeOptionalString(jobRow.job_type) : null;
          snapshot.progression.alchemyJob = (jobType === 'alchemy' ? {} : null) as any;
          snapshot.progression.forgingJob = (jobType === 'forging' ? {} : null) as any;
          snapshot.progression.enhancementJob = (jobType === 'enhancement' ? {} : null) as any;
          snapshot.progression.formationJob = (jobType === 'formation' ? {} : null) as any;
          // 排行榜不需要的字段保持 starter 默认值
          entries.push({ playerId, snapshot });
        }
        // 每完成一片让一次事件循环，给 world tick 等高优先级回调留出执行窗口。
        if (sliceEnd < playerIds.length) {
          await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
        }
      }
      return entries;
    } finally {
      client.release();
    }
  }

