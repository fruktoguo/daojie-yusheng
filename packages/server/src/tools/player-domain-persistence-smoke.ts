import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import {
  PLAYER_DOMAIN_PROJECTED_TABLES,
  PlayerDomainPersistenceService,
} from '../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下 PlayerDomainPersistenceService 能把 presence 与快照投影写进分域表，并推进 recovery watermark',
          excludes: '不证明 bootstrap 已切到分域恢复，也不证明域级 dirty/多 worker/真实 with-db release 全链路',
          completionMapping: 'release:proof:with-db.player-domain-persistence',
        },
        null,
        2,
      ),
    );
    return;
  }

  const playerId = `pd_${Date.now().toString(36)}`;
  const edgePlayerId = `${playerId}_edge`;
  const directPlayerId = `${playerId}_direct`;
  const walletOnlyPlayerId = `${playerId}_wallet`;
  const now = Date.now();
  const service = new PlayerDomainPersistenceService();
  const pool = new Pool({ connectionString: databaseUrl });

  await service.onModuleInit();
  if (!service.isEnabled()) {
    throw new Error('player-domain-persistence service not enabled');
  }

  try {
    await cleanupPlayer(pool, playerId);
    await cleanupPlayer(pool, edgePlayerId);
    await cleanupPlayer(pool, directPlayerId);
    await cleanupPlayer(pool, walletOnlyPlayerId);

    await service.savePlayerPresence(playerId, {
      online: true,
      inWorld: true,
      lastHeartbeatAt: now,
      offlineSinceAt: null,
      runtimeOwnerId: `runtime:${playerId}:1`,
      sessionEpoch: 3,
      transferState: 'idle',
      transferTargetNodeId: null,
      versionSeed: now,
    });

    const snapshot = buildSnapshot(now);
    await service.savePlayerSnapshotProjection(playerId, snapshot);

    const presenceRow = await fetchSingleRow(pool, 'SELECT * FROM player_presence WHERE player_id = $1', [
      playerId,
    ]);
    const anchorRow = await fetchSingleRow(pool, 'SELECT * FROM player_world_anchor WHERE player_id = $1', [
      playerId,
    ]);
    const checkpointRow = await fetchSingleRow(
      pool,
      'SELECT * FROM player_position_checkpoint WHERE player_id = $1',
      [playerId],
    );
    const vitalsRow = await fetchSingleRow(pool, 'SELECT * FROM player_vitals WHERE player_id = $1', [
      playerId,
    ]);
    const progressionCoreRow = await fetchSingleRow(
      pool,
      'SELECT * FROM player_progression_core WHERE player_id = $1',
      [playerId],
    );
    const attrStateRow = await fetchSingleRow(
      pool,
      'SELECT base_attrs_payload, bonus_entries_payload, revealed_breakthrough_requirement_ids, realm_payload, heaven_gate_payload, spiritual_roots_payload FROM player_attr_state WHERE player_id = $1',
      [playerId],
    );
    const bodyTrainingRow = await fetchSingleRow(
      pool,
      'SELECT * FROM player_body_training_state WHERE player_id = $1',
      [playerId],
    );
    const inventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count, slot_index, raw_payload FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const mapUnlockRows = await fetchRows(
      pool,
      'SELECT map_id FROM player_map_unlock WHERE player_id = $1 ORDER BY unlocked_at ASC, map_id ASC',
      [playerId],
    );
    const equipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [playerId],
    );
    const techniqueRows = await fetchRows(
      pool,
      'SELECT tech_id, level, realm_lv, skills_enabled FROM player_technique_state WHERE player_id = $1 ORDER BY realm_lv ASC NULLS LAST, tech_id ASC',
      [playerId],
    );
    const persistentBuffRows = await fetchRows(
      pool,
      'SELECT buff_id, source_skill_id, remaining_ticks, sustain_ticks_elapsed FROM player_persistent_buff_state WHERE player_id = $1 ORDER BY buff_id ASC, source_skill_id ASC',
      [playerId],
    );
    const questRows = await fetchRows(
      pool,
      'SELECT quest_id, status FROM player_quest_progress WHERE player_id = $1 ORDER BY quest_id ASC',
      [playerId],
    );
    const combatPreferenceRow = await fetchSingleRow(
      pool,
      'SELECT auto_battle, auto_battle_targeting_mode, retaliate_player_target_id, sense_qi_active, cultivating_tech_id FROM player_combat_preferences WHERE player_id = $1',
      [playerId],
    );
    const autoBattleSkillRows = await fetchRows(
      pool,
      'SELECT skill_id, enabled, skill_enabled, auto_battle_order FROM player_auto_battle_skill WHERE player_id = $1 ORDER BY auto_battle_order ASC, skill_id ASC',
      [playerId],
    );
    const autoUseRuleRows = await fetchRows(
      pool,
      'SELECT item_id, condition_payload FROM player_auto_use_item_rule WHERE player_id = $1 ORDER BY item_id ASC',
      [playerId],
    );
    const professionRows = await fetchRows(
      pool,
      'SELECT profession_type, level FROM player_profession_state WHERE player_id = $1 ORDER BY profession_type ASC',
      [playerId],
    );
    const presetRows = await fetchRows(
      pool,
      'SELECT preset_id, recipe_id, name FROM player_alchemy_preset WHERE player_id = $1 ORDER BY preset_id ASC',
      [playerId],
    );
    const activeJobRow = await fetchSingleRow(pool, 'SELECT * FROM player_active_job WHERE player_id = $1', [
      playerId,
    ]);
    const enhancementRecordRows = await fetchRows(
      pool,
      'SELECT record_id, item_id, highest_level, status FROM player_enhancement_record WHERE player_id = $1 ORDER BY item_id ASC, record_id ASC',
      [playerId],
    );
    const logbookRows = await fetchRows(
      pool,
      'SELECT message_id, kind, text FROM player_logbook_message WHERE player_id = $1 ORDER BY occurred_at ASC',
      [playerId],
    );
    const watermarkRow = await fetchSingleRow(
      pool,
      'SELECT * FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );

    if (!presenceRow || presenceRow.runtime_owner_id !== `runtime:${playerId}:1` || Number(presenceRow.session_epoch) !== 3) {
      throw new Error(`unexpected player_presence row: ${JSON.stringify(presenceRow)}`);
    }
    if (
      !anchorRow
      || anchorRow.respawn_template_id !== 'bound_respawn_peak'
      || Number(anchorRow.respawn_x) !== 3
      || anchorRow.last_safe_template_id !== 'yunlai_town'
      || anchorRow.preferred_line_preset !== 'real'
    ) {
      throw new Error(`unexpected player_world_anchor row: ${JSON.stringify(anchorRow)}`);
    }
    if (!checkpointRow || checkpointRow.instance_id !== 'public:yunlai_town' || Number(checkpointRow.facing) !== 2) {
      throw new Error(`unexpected player_position_checkpoint row: ${JSON.stringify(checkpointRow)}`);
    }
    if (
      !vitalsRow
      || Number(vitalsRow.hp) !== 88
      || Number(vitalsRow.max_hp) !== 100
      || Number(vitalsRow.qi) !== 33
      || Number(vitalsRow.max_qi) !== 100
    ) {
      throw new Error(`unexpected player_vitals row: ${JSON.stringify(vitalsRow)}`);
    }
    if (
      !progressionCoreRow
      || Number(progressionCoreRow.foundation) !== 2
      || Number(progressionCoreRow.combat_exp) !== 77
      || Number(progressionCoreRow.bone_age_base_years) !== 18
      || Number(progressionCoreRow.life_elapsed_ticks) !== 0
    ) {
      throw new Error(`unexpected player_progression_core row: ${JSON.stringify(progressionCoreRow)}`);
    }
    if (
      !attrStateRow
      || !String(JSON.stringify(attrStateRow.base_attrs_payload ?? '')).includes('constitution')
      || !String(JSON.stringify(attrStateRow.realm_payload ?? '')).includes('qi_refining')
      || !String(JSON.stringify(attrStateRow.heaven_gate_payload ?? '')).includes('averageBonus')
      || !String(JSON.stringify(attrStateRow.spiritual_roots_payload ?? '')).includes('metal')
      || !String(JSON.stringify(attrStateRow.bonus_entries_payload ?? '')).includes('runtime:technique_aggregate')
    ) {
      throw new Error(`unexpected player_attr_state row: ${JSON.stringify(attrStateRow)}`);
    }
    if (
      !bodyTrainingRow
      || Number(bodyTrainingRow.level) !== 3
      || Number(bodyTrainingRow.exp) !== 9
      || Number(bodyTrainingRow.exp_to_next) !== 27
    ) {
      throw new Error(`unexpected player_body_training_state row: ${JSON.stringify(bodyTrainingRow)}`);
    }
    if (
      inventoryRows.length !== 2
      || inventoryRows[0]?.item_id !== 'rat_tail'
      || Number(inventoryRows[1]?.count) !== 5
      || JSON.stringify(inventoryRows[0]?.raw_payload ?? null) !== '{}'
      || JSON.stringify(inventoryRows[1]?.raw_payload ?? null) !== '{}'
    ) {
      throw new Error(`unexpected player_inventory_item rows: ${JSON.stringify(inventoryRows)}`);
    }
    if (
      mapUnlockRows.length !== 3
      || mapUnlockRows.map((entry) => String(entry?.map_id ?? '')).join(',') !== 'bamboo_forest,wildlands,yunlai_town'
    ) {
      throw new Error(`unexpected player_map_unlock rows: ${JSON.stringify(mapUnlockRows)}`);
    }
    if (equipmentRows.length !== 1 || equipmentRows[0]?.slot_type !== 'weapon' || equipmentRows[0]?.item_id !== 'equip.copper_pill_furnace') {
      throw new Error(`unexpected player_equipment_slot rows: ${JSON.stringify(equipmentRows)}`);
    }
    if (
      techniqueRows.length !== 2
      || techniqueRows.map((entry) => `${String(entry?.tech_id ?? '')}:${Number(entry?.level ?? 0)}`).join(',')
        !== 'qi.breathing:3,sword.basic:2'
    ) {
      throw new Error(`unexpected player_technique_state rows: ${JSON.stringify(techniqueRows)}`);
    }
    if (
      persistentBuffRows.length !== 1
      || persistentBuffRows[0]?.buff_id !== 'buff.qi_shield'
      || persistentBuffRows[0]?.source_skill_id !== 'skill.qi.shield'
      || Number(persistentBuffRows[0]?.remaining_ticks ?? 0) !== 15
    ) {
      throw new Error(`unexpected player_persistent_buff_state rows: ${JSON.stringify(persistentBuffRows)}`);
    }
    if (
      questRows.length !== 1
      || questRows[0]?.quest_id !== 'quest.intro.begin'
      || questRows[0]?.status !== 'in_progress'
    ) {
      throw new Error(`unexpected player_quest_progress rows: ${JSON.stringify(questRows)}`);
    }
    if (
      !combatPreferenceRow
      || combatPreferenceRow.auto_battle !== true
      || combatPreferenceRow.auto_battle_targeting_mode !== 'boss'
      || combatPreferenceRow.retaliate_player_target_id !== 'rival_alpha'
      || combatPreferenceRow.sense_qi_active !== true
      || combatPreferenceRow.cultivating_tech_id !== 'qi.breathing'
    ) {
      throw new Error(`unexpected player_combat_preferences row: ${JSON.stringify(combatPreferenceRow)}`);
    }
    if (
      autoBattleSkillRows.length !== 2
      || autoBattleSkillRows[0]?.skill_id !== 'skill.qi.burst'
      || autoBattleSkillRows[1]?.skill_id !== 'skill.sword.slash'
      || autoBattleSkillRows[1]?.skill_enabled !== false
    ) {
      throw new Error(`unexpected player_auto_battle_skill rows: ${JSON.stringify(autoBattleSkillRows)}`);
    }
    if (
      autoUseRuleRows.length !== 1
      || autoUseRuleRows[0]?.item_id !== 'pill.minor_heal'
      || !JSON.stringify(autoUseRuleRows[0]?.condition_payload ?? '').includes('hp_below_ratio')
    ) {
      throw new Error(`unexpected player_auto_use_item_rule rows: ${JSON.stringify(autoUseRuleRows)}`);
    }
    const professionTypes = professionRows.map((entry) => String(entry?.profession_type ?? ''));
    if (professionTypes.join(',') !== 'alchemy,enhancement,gather') {
      throw new Error(`unexpected player_profession_state rows: ${JSON.stringify(professionRows)}`);
    }
    if (presetRows.length !== 1 || presetRows[0]?.recipe_id !== 'qi_pill') {
      throw new Error(`unexpected player_alchemy_preset rows: ${JSON.stringify(presetRows)}`);
    }
    if (
      !activeJobRow
      || activeJobRow.job_type !== 'alchemy'
      || activeJobRow.job_run_id !== 'job-run:alchemy:baseline'
      || Number(activeJobRow.job_version) !== 3
      || Number(activeJobRow.remaining_ticks) !== 4
    ) {
      throw new Error(`unexpected player_active_job row: ${JSON.stringify(activeJobRow)}`);
    }
    if (
      enhancementRecordRows.length !== 1
      || enhancementRecordRows[0]?.record_id !== `enh:${now}:iron_sword`
      || enhancementRecordRows[0]?.item_id !== 'iron_sword'
      || Number(enhancementRecordRows[0]?.highest_level ?? 0) !== 4
    ) {
      throw new Error(`unexpected player_enhancement_record rows: ${JSON.stringify(enhancementRecordRows)}`);
    }
    if (logbookRows.length !== 1 || logbookRows[0]?.kind !== 'system') {
      throw new Error(`unexpected player_logbook_message rows: ${JSON.stringify(logbookRows)}`);
    }
    if (
      !watermarkRow
      || Number(watermarkRow.presence_version) !== now
      || Number(watermarkRow.anchor_version) !== now
      || Number(watermarkRow.vitals_version) !== now
      || Number(watermarkRow.progression_version) !== now
      || Number(watermarkRow.attr_version) !== now
      || Number(watermarkRow.body_training_version) !== now
      || Number(watermarkRow.inventory_version) !== now
      || Number(watermarkRow.map_unlock_version) !== now
      || Number(watermarkRow.equipment_version) !== now
      || Number(watermarkRow.technique_version) !== now
      || Number(watermarkRow.buff_version) !== now
      || Number(watermarkRow.quest_version) !== now
      || Number(watermarkRow.combat_pref_version) !== now
      || Number(watermarkRow.auto_battle_skill_version) !== now
      || Number(watermarkRow.auto_use_item_rule_version) !== now
      || Number(watermarkRow.enhancement_record_version) !== now
      || Number(watermarkRow.active_job_version) !== now
    ) {
      throw new Error(`unexpected player_recovery_watermark row: ${JSON.stringify(watermarkRow)}`);
    }

    const enhancementSnapshot = buildEnhancementSnapshot(now + 50);
    await service.savePlayerSnapshotProjection(playerId, enhancementSnapshot);
    const enhancementJobRow = await fetchSingleRow(
      pool,
      'SELECT job_type, job_run_id, job_version, remaining_ticks FROM player_active_job WHERE player_id = $1',
      [playerId],
    );
    if (
      !enhancementJobRow
      || enhancementJobRow.job_type !== 'enhancement'
      || enhancementJobRow.job_run_id !== 'job-run:enhancement:baseline'
      || Number(enhancementJobRow.job_version) !== 7
      || Number(enhancementJobRow.remaining_ticks) !== 6
    ) {
      throw new Error(`unexpected enhancement player_active_job row: ${JSON.stringify(enhancementJobRow)}`);
    }

    await service.savePlayerPresence(edgePlayerId, {
      online: true,
      inWorld: true,
      lastHeartbeatAt: '' as unknown as number,
      offlineSinceAt: null,
      runtimeOwnerId: `runtime:${edgePlayerId}:1`,
      sessionEpoch: '' as unknown as number,
      transferState: 'idle',
      transferTargetNodeId: null,
      versionSeed: now + 100,
    });
    await service.savePlayerSnapshotProjection(edgePlayerId, buildMalformedProjectionSnapshot(now + 120));

    const edgePresenceRow = await fetchSingleRow(
      pool,
      'SELECT session_epoch, last_heartbeat_at FROM player_presence WHERE player_id = $1',
      [edgePlayerId],
    );
    const edgeCheckpointRow = await fetchSingleRow(
      pool,
      'SELECT x, y, facing FROM player_position_checkpoint WHERE player_id = $1',
      [edgePlayerId],
    );
    const edgeVitalsRow = await fetchSingleRow(
      pool,
      'SELECT hp, max_hp, qi, max_qi FROM player_vitals WHERE player_id = $1',
      [edgePlayerId],
    );
    const edgeProgressionRow = await fetchSingleRow(
      pool,
      'SELECT foundation, combat_exp, bone_age_base_years, life_elapsed_ticks FROM player_progression_core WHERE player_id = $1',
      [edgePlayerId],
    );
    const edgeBodyTrainingRow = await fetchSingleRow(
      pool,
      'SELECT level, exp, exp_to_next FROM player_body_training_state WHERE player_id = $1',
      [edgePlayerId],
    );
    const edgeInventoryRows = await fetchRows(
      pool,
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [edgePlayerId],
    );
    const edgeProfessionRows = await fetchRows(
      pool,
      'SELECT profession_type, level FROM player_profession_state WHERE player_id = $1 ORDER BY profession_type ASC',
      [edgePlayerId],
    );
    const edgeActiveJobRow = await fetchSingleRow(
      pool,
      'SELECT job_type, job_version, paused_ticks, total_ticks, remaining_ticks FROM player_active_job WHERE player_id = $1',
      [edgePlayerId],
    );
    if (!edgePresenceRow || Number(edgePresenceRow.session_epoch) !== 1 || edgePresenceRow.last_heartbeat_at != null) {
      throw new Error(`unexpected empty-string-safe player_presence row: ${JSON.stringify(edgePresenceRow)}`);
    }
    if (!edgeCheckpointRow || Number(edgeCheckpointRow.x) !== 0 || Number(edgeCheckpointRow.y) !== 0 || Number(edgeCheckpointRow.facing) !== 1) {
      throw new Error(`unexpected empty-string-safe player_position_checkpoint row: ${JSON.stringify(edgeCheckpointRow)}`);
    }
    if (
      !edgeVitalsRow
      || Number(edgeVitalsRow.hp) !== 0
      || Number(edgeVitalsRow.max_hp) !== 1
      || Number(edgeVitalsRow.qi) !== 0
      || Number(edgeVitalsRow.max_qi) !== 0
    ) {
      throw new Error(`unexpected empty-string-safe player_vitals row: ${JSON.stringify(edgeVitalsRow)}`);
    }
    if (
      !edgeProgressionRow
      || Number(edgeProgressionRow.foundation) !== 0
      || Number(edgeProgressionRow.combat_exp) !== 0
      || Number(edgeProgressionRow.bone_age_base_years) !== 18
      || Number(edgeProgressionRow.life_elapsed_ticks) !== 0
    ) {
      throw new Error(`unexpected empty-string-safe player_progression_core row: ${JSON.stringify(edgeProgressionRow)}`);
    }
    if (
      !edgeBodyTrainingRow
      || Number(edgeBodyTrainingRow.level) !== 0
      || Number(edgeBodyTrainingRow.exp) !== 0
      || Number(edgeBodyTrainingRow.exp_to_next) !== 1
    ) {
      throw new Error(`unexpected empty-string-safe player_body_training_state row: ${JSON.stringify(edgeBodyTrainingRow)}`);
    }
    if (edgeInventoryRows.length !== 1 || edgeInventoryRows[0]?.item_id !== 'rat_tail' || Number(edgeInventoryRows[0]?.count) !== 1) {
      throw new Error(`unexpected empty-string-safe player_inventory_item rows: ${JSON.stringify(edgeInventoryRows)}`);
    }
    const edgeProfessionMap = new Map(
      edgeProfessionRows.map((entry) => [String(entry.profession_type ?? ''), Number(entry.level ?? 0)]),
    );
    if (edgeProfessionMap.get('alchemy') !== 1 || edgeProfessionMap.get('enhancement') !== 1) {
      throw new Error(`unexpected empty-string-safe player_profession_state rows: ${JSON.stringify(edgeProfessionRows)}`);
    }
    if (
      !edgeActiveJobRow
      || edgeActiveJobRow.job_type !== 'alchemy'
      || Number(edgeActiveJobRow.job_version) <= 0
      || Number(edgeActiveJobRow.paused_ticks) !== 0
      || Number(edgeActiveJobRow.total_ticks) !== 0
      || Number(edgeActiveJobRow.remaining_ticks) !== 0
    ) {
      throw new Error(`unexpected empty-string-safe player_active_job row: ${JSON.stringify(edgeActiveJobRow)}`);
    }

    const directBaseVersion = now + 200;
    await service.savePlayerWorldAnchor(
      directPlayerId,
      {
        respawnTemplateId: 'direct_valley',
        respawnInstanceId: 'inst:direct_valley',
        respawnX: 7,
        respawnY: 8,
        lastSafeTemplateId: 'safe_harbor',
        lastSafeInstanceId: 'inst:safe_harbor',
        lastSafeX: 9,
        lastSafeY: 10,
        preferredLinePreset: 'peaceful',
        lastTransferAt: directBaseVersion,
      },
      { versionSeed: directBaseVersion },
    );
    await service.savePlayerPositionCheckpoint(
      directPlayerId,
      {
        instanceId: 'inst:direct_valley',
        x: 17,
        y: 18,
        facing: 3,
        checkpointKind: 'logout',
      },
      { versionSeed: directBaseVersion + 1 },
    );
    await service.savePlayerVitals(
      directPlayerId,
      {
        hp: 41,
        maxHp: 72,
        qi: 25,
        maxQi: 80,
      },
      { versionSeed: directBaseVersion + 2 },
    );
    await service.savePlayerProgressionCore(
      directPlayerId,
      {
        foundation: 4,
        combatExp: 188,
        boneAgeBaseYears: 21,
        lifeElapsedTicks: 1234,
        lifespanYears: 88,
      },
      { versionSeed: directBaseVersion + 3 },
    );
    await service.savePlayerInventoryItems(
      directPlayerId,
      [
        {
          itemId: 'direct_ore',
          count: 2,
          slotIndex: 5,
          itemInstanceId: `inv:${directPlayerId}:ore`,
          rawPayload: {
            itemId: 'direct_ore',
            count: 2,
            name: '直写矿石',
          },
        },
      ],
      { versionSeed: directBaseVersion + 4 },
    );
    await service.savePlayerMapUnlocks(
      directPlayerId,
      [
        { mapId: 'direct_cave', unlockedAt: directBaseVersion + 41 },
        { mapId: 'direct_valley', unlockedAt: directBaseVersion + 40 },
      ],
      { versionSeed: directBaseVersion + 5 },
    );
    await service.savePlayerEquipmentSlots(
      directPlayerId,
      [
        {
          slot: 'weapon',
          itemInstanceId: `equip:${directPlayerId}:weapon`,
          item: {
            itemId: 'weapon.direct_blade',
            count: 1,
            equipSlot: 'weapon',
            name: '直写长刃',
          },
        },
      ],
      { versionSeed: directBaseVersion + 6 },
    );
    await service.savePlayerCombatPreferences(
      directPlayerId,
      {
        autoBattle: true,
        autoRetaliate: false,
        autoBattleStationary: true,
        autoBattleTargetingMode: 'elite',
        retaliatePlayerTargetId: null,
        combatTargetId: 'monster.alpha',
        combatTargetLocked: true,
        allowAoePlayerHit: false,
        autoIdleCultivation: false,
        autoSwitchCultivation: true,
        senseQiActive: true,
        cultivatingTechId: 'qi.direct_flow',
        targetingRulesPayload: {
          includeEliteMonsters: true,
        },
      },
      { versionSeed: directBaseVersion + 7 },
    );
    await service.savePlayerProfessionState(
      directPlayerId,
      [
        { professionType: 'alchemy', level: 6, exp: 66, expToNext: 120 },
        { professionType: 'enhancement', level: 5, exp: 50, expToNext: 100 },
      ],
      { versionSeed: directBaseVersion + 8 },
    );
    await service.savePlayerAlchemyPresets(
      directPlayerId,
      [
        {
          presetId: 'preset:direct',
          recipeId: 'direct_pill',
          name: '直写丹方',
          ingredients: [{ itemId: 'direct_herb', count: 3 }],
        },
      ],
      { versionSeed: directBaseVersion + 9 },
    );
    await service.savePlayerActiveJob(
      directPlayerId,
      {
        jobRunId: 'job-run:direct:1',
        jobType: 'alchemy',
        status: 'running',
        phase: 'condensing',
        startedAt: directBaseVersion + 9,
        finishedAt: null,
        pausedTicks: 2,
        totalTicks: 20,
        remainingTicks: 6,
        successRate: 0.66,
        speedRate: 1.5,
        jobVersion: 4,
        detailJson: {
          recipeId: 'direct_pill',
          outputItemId: 'direct_pill',
        },
      },
      { versionSeed: directBaseVersion + 10 },
    );
    await service.savePlayerLogbookMessages(
      directPlayerId,
      [
        {
          id: 'direct-log:1',
          kind: 'combat',
          text: '直写日志',
          from: 'system',
          at: directBaseVersion + 11,
          ackedAt: directBaseVersion + 12,
        },
      ],
      { versionSeed: directBaseVersion + 11 },
    );
    await service.savePlayerWallet(
      directPlayerId,
      [
        {
          walletType: 'spirit_stone',
          balance: 120,
          frozenBalance: 8,
          version: directBaseVersion + 12,
        },
        {
          walletType: 'gourds',
          balance: 3,
          frozenBalance: 0,
          version: directBaseVersion + 13,
        },
      ],
      { versionSeed: directBaseVersion + 12 },
    );
    await service.savePlayerMarketStorageItems(
      directPlayerId,
      [
        {
          storageItemId: `market:${directPlayerId}:0`,
          slotIndex: 0,
          itemId: 'spirit_stone',
          count: 9,
          enhanceLevel: null,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 9,
            label: '托管灵石',
          },
        },
      ],
      { versionSeed: directBaseVersion + 14 },
    );
    await service.savePlayerCombatPreferences(directPlayerId, null, {
      versionSeed: directBaseVersion + 15,
    });
    await service.savePlayerActiveJob(directPlayerId, null, {
      versionSeed: directBaseVersion + 16,
    });
    await service.savePlayerWallet(
      walletOnlyPlayerId,
      [
        {
          walletType: 'spirit_stone',
          balance: 66,
          frozenBalance: 4,
          version: directBaseVersion + 17,
        },
      ],
      { versionSeed: directBaseVersion + 17 },
    );

    const directAnchorRow = await fetchSingleRow(
      pool,
      'SELECT respawn_template_id, last_safe_template_id, preferred_line_preset FROM player_world_anchor WHERE player_id = $1',
      [directPlayerId],
    );
    const directCheckpointRow = await fetchSingleRow(
      pool,
      'SELECT instance_id, x, y, facing, checkpoint_kind FROM player_position_checkpoint WHERE player_id = $1',
      [directPlayerId],
    );
    const directVitalsRow = await fetchSingleRow(
      pool,
      'SELECT hp, max_hp, qi, max_qi FROM player_vitals WHERE player_id = $1',
      [directPlayerId],
    );
    const directProgressionRow = await fetchSingleRow(
      pool,
      'SELECT foundation, combat_exp, bone_age_base_years, life_elapsed_ticks, lifespan_years FROM player_progression_core WHERE player_id = $1',
      [directPlayerId],
    );
    const directInventoryRows = await fetchRows(
      pool,
      'SELECT item_instance_id, slot_index, item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [directPlayerId],
    );
    const directMapUnlockRows = await fetchRows(
      pool,
      'SELECT map_id, unlocked_at FROM player_map_unlock WHERE player_id = $1 ORDER BY unlocked_at ASC, map_id ASC',
      [directPlayerId],
    );
    const directEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_instance_id, item_id FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
      [directPlayerId],
    );
    const directCombatPreferenceRow = await fetchSingleRow(
      pool,
      'SELECT player_id FROM player_combat_preferences WHERE player_id = $1',
      [directPlayerId],
    );
    const directProfessionRows = await fetchRows(
      pool,
      'SELECT profession_type, level FROM player_profession_state WHERE player_id = $1 ORDER BY profession_type ASC',
      [directPlayerId],
    );
    const directPresetRows = await fetchRows(
      pool,
      'SELECT preset_id, recipe_id, name FROM player_alchemy_preset WHERE player_id = $1 ORDER BY preset_id ASC',
      [directPlayerId],
    );
    const directActiveJobRow = await fetchSingleRow(
      pool,
      'SELECT player_id FROM player_active_job WHERE player_id = $1',
      [directPlayerId],
    );
    const directLogbookRows = await fetchRows(
      pool,
      'SELECT message_id, kind, text, acked_at FROM player_logbook_message WHERE player_id = $1 ORDER BY occurred_at ASC',
      [directPlayerId],
    );
    const directWalletRows = await fetchRows(
      pool,
      'SELECT wallet_type, balance, frozen_balance, version FROM player_wallet WHERE player_id = $1 ORDER BY wallet_type ASC',
      [directPlayerId],
    );
    const directMarketStorageRows = await fetchRows(
      pool,
      'SELECT storage_item_id, slot_index, item_id, count FROM player_market_storage_item WHERE player_id = $1 ORDER BY slot_index ASC, storage_item_id ASC',
      [directPlayerId],
    );
    const directWatermarkRow = await fetchSingleRow(
      pool,
      'SELECT anchor_version, position_checkpoint_version, vitals_version, progression_version, inventory_version, market_storage_version, map_unlock_version, equipment_version, combat_pref_version, profession_version, alchemy_preset_version, active_job_version, logbook_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [directPlayerId],
    );
    const directLoadedDomains = await service.loadPlayerDomains(directPlayerId);
    const walletOnlyDomains = await service.loadPlayerDomains(walletOnlyPlayerId);

    if (!directAnchorRow || directAnchorRow.respawn_template_id !== 'direct_valley' || directAnchorRow.last_safe_template_id !== 'safe_harbor') {
      throw new Error(`unexpected direct player_world_anchor row: ${JSON.stringify(directAnchorRow)}`);
    }
    if (
      !directCheckpointRow
      || directCheckpointRow.instance_id !== 'inst:direct_valley'
      || Number(directCheckpointRow.x) !== 17
      || directCheckpointRow.checkpoint_kind !== 'logout'
    ) {
      throw new Error(`unexpected direct player_position_checkpoint row: ${JSON.stringify(directCheckpointRow)}`);
    }
    if (
      !directVitalsRow
      || Number(directVitalsRow.hp) !== 41
      || Number(directVitalsRow.max_hp) !== 72
      || Number(directVitalsRow.qi) !== 25
      || Number(directVitalsRow.max_qi) !== 80
    ) {
      throw new Error(`unexpected direct player_vitals row: ${JSON.stringify(directVitalsRow)}`);
    }
    if (
      !directProgressionRow
      || Number(directProgressionRow.foundation) !== 4
      || Number(directProgressionRow.combat_exp) !== 188
      || Number(directProgressionRow.life_elapsed_ticks) !== 1234
      || Number(directProgressionRow.lifespan_years) !== 88
    ) {
      throw new Error(`unexpected direct player_progression_core row: ${JSON.stringify(directProgressionRow)}`);
    }
    if (
      directInventoryRows.length !== 1
      || directInventoryRows[0]?.item_instance_id !== `inv:${directPlayerId}:ore`
      || Number(directInventoryRows[0]?.slot_index ?? 0) !== 5
      || directInventoryRows[0]?.item_id !== 'direct_ore'
    ) {
      throw new Error(`unexpected direct player_inventory_item rows: ${JSON.stringify(directInventoryRows)}`);
    }
    if (
      directMapUnlockRows.map((entry) => String(entry.map_id ?? '')).join(',') !== 'direct_valley,direct_cave'
      || Number(directMapUnlockRows[0]?.unlocked_at ?? 0) !== directBaseVersion + 40
    ) {
      throw new Error(`unexpected direct player_map_unlock rows: ${JSON.stringify(directMapUnlockRows)}`);
    }
    if (
      directEquipmentRows.length !== 1
      || directEquipmentRows[0]?.slot_type !== 'weapon'
      || directEquipmentRows[0]?.item_instance_id !== `equip:${directPlayerId}:weapon`
      || directEquipmentRows[0]?.item_id !== 'weapon.direct_blade'
    ) {
      throw new Error(`unexpected direct player_equipment_slot rows: ${JSON.stringify(directEquipmentRows)}`);
    }
    if (directCombatPreferenceRow !== null) {
      throw new Error(`expected cleared direct player_combat_preferences row, got: ${JSON.stringify(directCombatPreferenceRow)}`);
    }
    if (
      directProfessionRows.map((entry) => `${String(entry.profession_type ?? '')}:${Number(entry.level ?? 0)}`).join(',')
      !== 'alchemy:6,enhancement:5'
    ) {
      throw new Error(`unexpected direct player_profession_state rows: ${JSON.stringify(directProfessionRows)}`);
    }
    if (directPresetRows.length !== 1 || directPresetRows[0]?.recipe_id !== 'direct_pill') {
      throw new Error(`unexpected direct player_alchemy_preset rows: ${JSON.stringify(directPresetRows)}`);
    }
    if (directActiveJobRow !== null) {
      throw new Error(`expected cleared direct player_active_job row, got: ${JSON.stringify(directActiveJobRow)}`);
    }
    if (
      directLogbookRows.length !== 1
      || directLogbookRows[0]?.message_id !== 'direct-log:1'
      || Number(directLogbookRows[0]?.acked_at ?? 0) !== directBaseVersion + 12
    ) {
      throw new Error(`unexpected direct player_logbook_message rows: ${JSON.stringify(directLogbookRows)}`);
    }
    if (
      directWalletRows.length !== 2
      || directWalletRows[0]?.wallet_type !== 'gourds'
      || Number(directWalletRows[1]?.balance ?? 0) !== 120
      || Number(directWalletRows[1]?.frozen_balance ?? 0) !== 8
    ) {
      throw new Error(`unexpected direct player_wallet rows: ${JSON.stringify(directWalletRows)}`);
    }
    if (
      directMarketStorageRows.length !== 1
      || Number(directMarketStorageRows[0]?.slot_index ?? -1) !== 0
      || directMarketStorageRows[0]?.item_id !== 'spirit_stone'
      || Number(directMarketStorageRows[0]?.count ?? 0) !== 9
    ) {
      throw new Error(`unexpected direct player_market_storage_item rows: ${JSON.stringify(directMarketStorageRows)}`);
    }
    if (
      !directWatermarkRow
      || Number(directWatermarkRow.anchor_version) !== directBaseVersion
      || Number(directWatermarkRow.position_checkpoint_version) !== directBaseVersion + 1
      || Number(directWatermarkRow.vitals_version) !== directBaseVersion + 2
      || Number(directWatermarkRow.progression_version) !== directBaseVersion + 3
      || Number(directWatermarkRow.inventory_version) !== directBaseVersion + 4
      || Number(directWatermarkRow.market_storage_version) !== directBaseVersion + 14
      || Number(directWatermarkRow.map_unlock_version) !== directBaseVersion + 5
      || Number(directWatermarkRow.equipment_version) !== directBaseVersion + 6
      || Number(directWatermarkRow.combat_pref_version) !== directBaseVersion + 15
      || Number(directWatermarkRow.profession_version) !== directBaseVersion + 8
      || Number(directWatermarkRow.alchemy_preset_version) !== directBaseVersion + 9
      || Number(directWatermarkRow.active_job_version) !== directBaseVersion + 16
      || Number(directWatermarkRow.logbook_version) !== directBaseVersion + 11
      || Number(directWatermarkRow.wallet_version) !== directBaseVersion + 12
    ) {
      throw new Error(`unexpected direct player_recovery_watermark row: ${JSON.stringify(directWatermarkRow)}`);
    }
    if (
      !directLoadedDomains
      || directLoadedDomains.hasProjectedState !== true
      || directLoadedDomains.walletRows.length !== 2
      || String(directLoadedDomains.walletRows[1]?.wallet_type ?? '') !== 'spirit_stone'
      || Number(directLoadedDomains.walletRows[1]?.balance ?? 0) !== 120
      || directLoadedDomains.marketStorageItems.length !== 1
      || String(directLoadedDomains.marketStorageItems[0]?.item_id ?? '') !== 'spirit_stone'
    ) {
      throw new Error(`unexpected loadPlayerDomains direct result: ${JSON.stringify(directLoadedDomains)}`);
    }
    if (
      !walletOnlyDomains
      || walletOnlyDomains.hasProjectedState !== false
      || walletOnlyDomains.walletRows.length !== 1
      || String(walletOnlyDomains.walletRows[0]?.wallet_type ?? '') !== 'spirit_stone'
      || Number(walletOnlyDomains.walletRows[0]?.balance ?? 0) !== 66
      || walletOnlyDomains.marketStorageItems.length !== 0
    ) {
      throw new Error(`unexpected loadPlayerDomains wallet-only result: ${JSON.stringify(walletOnlyDomains)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          edgePlayerId,
          directPlayerId,
          answers: 'with-db 下 PlayerDomainPersistenceService 已能把 presence、wallet、vitals、progression core、attr、body training、inventory、market storage、map unlock、equipment、technique、persistent buff、quest、combat/auto-*、强化记录与职业作业投影写入当前已落地的分域表，并支持 wallet/market storage 的 loadPlayerDomains 读链与对应 watermark 推进',
          excludes: '不证明 bootstrap 分域恢复、域级 dirty set、分域多 worker、完整玩家全域拆表都已落地',
          completionMapping: 'release:proof:with-db.player-domain-persistence',
          projectedTables: [...PLAYER_DOMAIN_PROJECTED_TABLES],
          attrStatePresent: attrStateRow !== null,
          inventoryCount: inventoryRows.length,
          mapUnlockCount: mapUnlockRows.length,
          equipmentCount: equipmentRows.length,
          techniqueCount: techniqueRows.length,
          persistentBuffCount: persistentBuffRows.length,
          questCount: questRows.length,
          autoBattleSkillCount: autoBattleSkillRows.length,
          autoUseRuleCount: autoUseRuleRows.length,
          professionCount: professionRows.length,
          activeJobType: activeJobRow.job_type,
          enhancementJobType: enhancementJobRow.job_type,
          enhancementRecordCount: enhancementRecordRows.length,
          directDomainWriteSafe: true,
          emptyStringProjectionSafe: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await cleanupPlayer(pool, edgePlayerId).catch(() => undefined);
    await cleanupPlayer(pool, directPlayerId).catch(() => undefined);
    await cleanupPlayer(pool, walletOnlyPlayerId).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
  }
}

function buildSnapshot(now: number): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: now,
    placement: {
      instanceId: 'public:yunlai_town',
      templateId: 'yunlai_town',
      x: 11,
      y: 22,
      facing: 2,
    },
    respawn: {
      instanceId: 'public:bound_respawn_peak',
      templateId: 'bound_respawn_peak',
      x: 3,
      y: 4,
      facing: 2,
    },
    worldPreference: {
      linePreset: 'real',
    },
    vitals: {
      hp: 88,
      maxHp: 100,
      qi: 33,
      maxQi: 100,
    },
    progression: {
      foundation: 2,
      combatExp: 77,
      bodyTraining: {
        level: 3,
        exp: 9,
        expToNext: 27,
      },
      alchemySkill: {
        level: 4,
        exp: 12,
        expToNext: 30,
      },
      gatherSkill: {
        level: 2,
        exp: 4,
        expToNext: 10,
      },
      gatherJob: null,
      alchemyPresets: [
        {
          presetId: 'preset:qi',
          recipeId: 'qi_pill',
          name: '补气丹',
          ingredients: [{ itemId: 'moondew_grass', count: 2 }],
        },
      ],
      alchemyJob: {
        jobRunId: 'job-run:alchemy:baseline',
        jobVersion: 3,
        phase: 'brewing',
        startedAt: now,
        totalTicks: 12,
        remainingTicks: 4,
        pausedTicks: 1,
        successRate: 0.8,
        totalSpeedRate: 1.25,
        recipeId: 'qi_pill',
        outputItemId: 'qi_pill',
        quantity: 2,
      },
      enhancementSkill: null,
      enhancementSkillLevel: 3,
      enhancementJob: null,
      enhancementRecords: [
        {
          recordId: `enh:${now}:iron_sword`,
          itemId: 'iron_sword',
          highestLevel: 4,
          levels: [{ targetLevel: 3, successCount: 2, failureCount: 1 }],
          actionStartedAt: now - 60_000,
          actionEndedAt: now - 10_000,
          startLevel: 2,
          initialTargetLevel: 3,
          desiredTargetLevel: 4,
          protectionStartLevel: 2,
          status: 'completed',
        },
      ],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: {
        stage: 'qi_refining',
        realmLv: 2,
        displayName: '炼气二层',
        name: '炼气二层',
        shortName: '炼气',
        path: '凡道',
        narrative: 'player-domain persistence smoke',
        progress: 12,
        progressToNext: 100,
        breakthroughReady: false,
        nextStage: 'foundation',
        breakthroughItems: [],
        breakthrough: {
          requirements: [{ id: 'realm.req.technique', hidden: false, completed: true }],
        },
      },
      heavenGate: {
        unlocked: true,
        severed: ['metal'],
        roots: null,
        entered: false,
        averageBonus: 12,
      },
      spiritualRoots: {
        metal: 18,
        wood: 12,
        water: 9,
        fire: 7,
        earth: 5,
      },
    },
    attrState: {
      baseAttrs: {
        constitution: 12,
        spirit: 10,
        perception: 8,
        talent: 9,
        strength: 7,
        meridians: 6,
      },
      revealedBreakthroughRequirementIds: ['realm.req.technique', 'realm.req.item'],
    },
    unlockedMapIds: ['yunlai_town', 'wildlands', 'bamboo_forest'],
    inventory: {
      revision: 2,
      capacity: 24,
      items: [
        { itemId: 'rat_tail', count: 3 },
        { itemId: 'spirit_stone', count: 5 },
      ],
    },
    equipment: {
      revision: 2,
      slots: [
        {
          slot: 'weapon',
          item: {
            itemId: 'equip.copper_pill_furnace',
            count: 1,
            name: '铜丹炉',
            type: 'equipment',
            equipSlot: 'weapon',
          },
        },
      ],
    },
    techniques: {
      revision: 3,
      techniques: [
        {
          techId: 'qi.breathing',
          level: 3,
          exp: 12,
          expToNext: 40,
          realmLv: 1,
          skillsEnabled: true,
          name: '引气诀',
        },
        {
          techId: 'sword.basic',
          level: 2,
          exp: 5,
          expToNext: 24,
          realmLv: 2,
          skillsEnabled: false,
          name: '基础剑诀',
        },
      ],
      cultivatingTechId: 'qi.breathing',
    },
    buffs: {
      revision: 2,
      buffs: [
        {
          buffId: 'buff.qi_shield',
          sourceSkillId: 'skill.qi.shield',
          sourceCasterId: 'npc.master',
          realmLv: 2,
          remainingTicks: 15,
          duration: 30,
          stacks: 1,
          maxStacks: 3,
          sustainTicksElapsed: 4,
          name: '气盾',
        },
      ],
    },
    quests: {
      revision: 2,
      entries: [
        {
          id: 'quest.intro.begin',
          status: 'in_progress',
          progress: {
            kills: 2,
            target: 5,
          },
          rewardItemIds: ['pill.minor_heal'],
          rewards: [{ type: 'item', itemId: 'pill.minor_heal', count: 1 }],
        },
      ],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoBattleTargetingMode: 'boss',
      retaliatePlayerTargetId: 'rival_alpha',
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: true,
      combatTargetingRules: {
        hostile: ['monster', 'boss'],
        friendly: ['non_hostile_players'],
        includeNormalMonsters: true,
        includeEliteMonsters: true,
        includeBosses: true,
        includePlayers: false,
      },
      autoUsePills: [
        {
          itemId: 'pill.minor_heal',
          conditions: [
            { type: 'hp_below_ratio', value: 0.45 },
          ],
        },
      ],
      autoBattleSkills: [
        { skillId: 'skill.qi.burst', enabled: true, skillEnabled: true, autoBattleOrder: 0 },
        { skillId: 'skill.sword.slash', enabled: true, skillEnabled: false, autoBattleOrder: 1 },
      ],
    },
    pendingLogbookMessages: [
      {
        id: 'log:1',
        kind: 'system',
        text: 'player-domain smoke',
        at: now,
      },
    ],
    runtimeBonuses: [
      {
        source: 'runtime:technique_aggregate',
        label: '功法合流',
        attrs: {
          constitution: 2,
        },
        stats: {
          attack: 3,
        },
      },
    ],
  };
}

function buildEnhancementSnapshot(now: number): PersistedPlayerSnapshot {
  const snapshot = buildSnapshot(now);
  snapshot.progression.alchemyJob = null;
  snapshot.progression.enhancementJob = {
    jobRunId: 'job-run:enhancement:baseline',
    jobVersion: 7,
    phase: 'enhancing',
    startedAt: now,
    totalTicks: 18,
    remainingTicks: 6,
    pausedTicks: 0,
    successRate: 0.55,
    totalSpeedRate: 1.1,
    targetItemId: 'iron_sword',
    currentLevel: 2,
    targetLevel: 3,
    desiredTargetLevel: 3,
    materials: [{ itemId: 'spirit_stone', count: 2 }],
    roleEnhancementLevel: 2,
  };
  return snapshot;
}

function buildMalformedProjectionSnapshot(now: number): PersistedPlayerSnapshot {
  const snapshot = buildSnapshot(now) as unknown as Record<string, unknown>;
  const placement = snapshot.placement as Record<string, unknown>;
  const vitals = snapshot.vitals as Record<string, unknown>;
  const progression = snapshot.progression as Record<string, unknown>;
  const bodyTraining = progression.bodyTraining as Record<string, unknown>;
  const alchemySkill = progression.alchemySkill as Record<string, unknown>;
  const inventory = snapshot.inventory as Record<string, unknown>;
  const items = inventory.items as Array<Record<string, unknown>>;
  const alchemyJob = progression.alchemyJob as Record<string, unknown>;

  placement.x = '';
  placement.y = '';
  placement.facing = '';
  vitals.hp = '';
  vitals.maxHp = '';
  vitals.qi = '';
  vitals.maxQi = '';
  progression.foundation = '';
  progression.combatExp = '';
  progression.boneAgeBaseYears = '';
  progression.lifeElapsedTicks = '';
  progression.enhancementSkillLevel = '';
  bodyTraining.level = '';
  bodyTraining.exp = '';
  bodyTraining.expToNext = '';
  alchemySkill.level = '';
  items.splice(1);
  items[0] = { itemId: 'rat_tail', count: '' };
  alchemyJob.jobRunId = 'job-run:alchemy:edge';
  alchemyJob.jobVersion = '';
  alchemyJob.phase = '';
  alchemyJob.totalTicks = '';
  alchemyJob.remainingTicks = '';
  alchemyJob.pausedTicks = '';
  alchemyJob.successRate = '';
  alchemyJob.totalSpeedRate = '';

  return snapshot as unknown as PersistedPlayerSnapshot;
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const tableName of PLAYER_DOMAIN_PROJECTED_TABLES) {
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`, [playerId]);
    }
    await client.query('DELETE FROM player_market_storage_item WHERE player_id = $1', [playerId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function fetchSingleRow(pool: Pool, sql: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  const result = await pool.query(sql, params);
  return (result.rows?.[0] as Record<string, unknown> | undefined) ?? null;
}

async function fetchRows(pool: Pool, sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(sql, params);
  return (result.rows ?? []) as Array<Record<string, unknown>>;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
