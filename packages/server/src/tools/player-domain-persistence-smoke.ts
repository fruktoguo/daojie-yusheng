import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';
import { EQUIP_SLOTS, isLegacyItemInstanceId } from '@mud/shared';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import {
  PLAYER_DOMAIN_PROJECTED_TABLES,
  PlayerDomainPersistenceService,
  type PlayerActiveJobUpsertInput,
} from '../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { runPlayerDomainFakePoolContracts } from './player-domain-persistence-smoke-support/fake-pool-contracts';
import {
  buildEnhancementSnapshot,
  buildMalformedProjectionSnapshot,
  buildSnapshot,
  buildSnapshotWithOnlyActiveJob,
  buildStarterSnapshotForProjectedActiveJob,
} from './player-domain-persistence-smoke-support/fixtures';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  await runPlayerDomainFakePoolContracts();
  await assertCleanupFailureAggregation();

  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '无 DB 时已用 fake pool 验证 inventory/wallet/equipment/map/technique/buff/quest/auto/profession/alchemy/enhancement/logbook 快照保存不再发送裸整玩家 DELETE，inventory 重复 slot 会重排保留全部 item_instance_id，wallet/market_storage/equipment 非法 entry 不会被静默跳过后触发 stale cleanup，auto_battle_skill/auto_use_item_rule 可合法清空偏好列表，并验证单个清理任务失败不会阻断后续收尾且所有错误都会保留；with-db 下 PlayerDomainPersistenceService 能把 presence 与快照投影写进分域表、推进 recovery watermark，并验证运行时显式选项可清空最后一个 inventory/equipment/buff row',
          excludes: '不证明 bootstrap 已切到分域恢复，也不证明域级 dirty/多 worker/真实 with-db release 全链路；当前未连接数据库，因此未实际触发玩家表清理失败与 rollback 失败分支',
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
  const activeJobRecoveryPlayerId = `${playerId}_active_recovery`;
  const buffClearPlayerId = `${playerId}_buff_clear`;
  const inventoryClearPlayerId = `${playerId}_inventory_clear`;
  const equipmentClearPlayerId = `${playerId}_equipment_clear`;
  const autoPreferenceClearPlayerId = `${playerId}_auto_pref_clear`;
  const marketConflictOwnerId = `${playerId}_market_conflict_owner`;
  const projectionFencePlayerId = `${playerId}_projection_fence`;
  const now = Date.now();
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new PlayerDomainPersistenceService(null, databasePoolProvider);
  const pool = new Pool({ connectionString: databaseUrl });
  const testPlayerIds = [
    playerId,
    edgePlayerId,
    directPlayerId,
    walletOnlyPlayerId,
    activeJobRecoveryPlayerId,
    buffClearPlayerId,
    inventoryClearPlayerId,
    equipmentClearPlayerId,
    autoPreferenceClearPlayerId,
    marketConflictOwnerId,
    projectionFencePlayerId,
  ];
  let runFailed = false;
  let runError: unknown;
  let successPayload: Record<string, unknown> | null = null;
  const cleanupErrors: Error[] = [];

  try {
    await service.onModuleInit();
    if (!service.isEnabled()) {
      throw new Error('player-domain-persistence service not enabled');
    }

    await cleanupPlayer(pool, playerId);
    await cleanupPlayer(pool, edgePlayerId);
    await cleanupPlayer(pool, directPlayerId);
    await cleanupPlayer(pool, walletOnlyPlayerId);
    await cleanupPlayer(pool, activeJobRecoveryPlayerId);
    await cleanupPlayer(pool, buffClearPlayerId);
    await cleanupPlayer(pool, inventoryClearPlayerId);
    await cleanupPlayer(pool, equipmentClearPlayerId);
    await cleanupPlayer(pool, autoPreferenceClearPlayerId);
    await cleanupPlayer(pool, marketConflictOwnerId);
    await cleanupPlayer(pool, projectionFencePlayerId);

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
      'SELECT tech_id, level, realm_lv, skills_enabled, raw_payload FROM player_technique_state WHERE player_id = $1 ORDER BY realm_lv ASC NULLS LAST, tech_id ASC',
      [playerId],
    );
    const techniqueComprehensionRows = await fetchRows(
      pool,
      'SELECT tech_id, source_kind, progress, required_progress, self_comprehension_allowed, created_at_tick, updated_at_tick, raw_payload FROM player_technique_comprehension WHERE player_id = $1 ORDER BY realm_lv ASC NULLS LAST, tech_id ASC',
      [playerId],
    );
    const persistentBuffRows = await fetchRows(
      pool,
      'SELECT buff_id, source_skill_id, remaining_ticks, sustain_ticks_elapsed, raw_payload FROM player_persistent_buff_state WHERE player_id = $1 ORDER BY buff_id ASC, source_skill_id ASC',
      [playerId],
    );
    const questRows = await fetchRows(
      pool,
      'SELECT quest_id, status, progress_payload, raw_payload FROM player_quest_progress WHERE player_id = $1 ORDER BY quest_id ASC',
      [playerId],
    );
    const combatPreferenceRow = await fetchSingleRow(
      pool,
      'SELECT auto_battle, auto_battle_targeting_mode, retaliate_player_target_id, retaliate_player_target_last_attack_tick, auto_root_foundation, combat_attack_intensity, sense_qi_active, cultivation_active, cultivating_tech_id FROM player_combat_preferences WHERE player_id = $1',
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
      || String(JSON.stringify(attrStateRow.bonus_entries_payload ?? '')).includes('runtime:technique_aggregate')
      || String(JSON.stringify(attrStateRow.bonus_entries_payload ?? '')).includes('equip-effect:')
      || String(JSON.stringify(attrStateRow.bonus_entries_payload ?? '')).includes('equipment:')
      || String(JSON.stringify(attrStateRow.bonus_entries_payload ?? '')).includes('body_training:')
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
      || JSON.stringify(techniqueRows[0]?.raw_payload ?? null) !== '{}'
      || Number((techniqueRows[1]?.raw_payload as { learnTechniqueMaxLevel?: unknown } | null)?.learnTechniqueMaxLevel ?? 0) !== 2
    ) {
      throw new Error(`unexpected player_technique_state rows: ${JSON.stringify(techniqueRows)}`);
    }
    if (
      techniqueComprehensionRows.length !== 1
      || techniqueComprehensionRows[0]?.tech_id !== 'gen.pending_self'
      || techniqueComprehensionRows[0]?.source_kind !== 'created'
      || Number(techniqueComprehensionRows[0]?.progress ?? 0) !== 7
      || Number(techniqueComprehensionRows[0]?.required_progress ?? 0) !== 300
      || techniqueComprehensionRows[0]?.self_comprehension_allowed !== false
      || Number(techniqueComprehensionRows[0]?.created_at_tick ?? 0) !== 11
      || Number(techniqueComprehensionRows[0]?.updated_at_tick ?? 0) !== 22
      || JSON.stringify(techniqueComprehensionRows[0]?.raw_payload ?? null) !== '{}'
    ) {
      throw new Error(`unexpected player_technique_comprehension rows: ${JSON.stringify(techniqueComprehensionRows)}`);
    }
    if (
      persistentBuffRows.length !== 1
      || persistentBuffRows[0]?.buff_id !== 'buff.qi_shield'
      || persistentBuffRows[0]?.source_skill_id !== 'skill.qi.shield'
      || Number(persistentBuffRows[0]?.remaining_ticks ?? 0) !== 15
      || (persistentBuffRows[0]?.raw_payload as Record<string, unknown> | null)?.visibility !== 'hidden'
      || (persistentBuffRows[0]?.raw_payload as Record<string, unknown> | null)?.persistOnDeath !== true
      || (persistentBuffRows[0]?.raw_payload as Record<string, unknown> | null)?.persistOnReturnToSpawn !== true
    ) {
      throw new Error(`unexpected player_persistent_buff_state rows: ${JSON.stringify(persistentBuffRows)}`);
    }
    if (
      questRows.length !== 2
      || questRows[0]?.quest_id !== 'quest.intro.begin'
      || questRows[0]?.status !== 'in_progress'
      || questRows[1]?.quest_id !== 'quest.intro.done'
      || questRows[1]?.status !== 'completed'
    ) {
      throw new Error(`unexpected player_quest_progress rows: ${JSON.stringify(questRows)}`);
    }
    if (questRows[1]?.progress_payload !== null) {
      throw new Error(`completed quest should not persist progress_payload: ${JSON.stringify(questRows[1])}`);
    }
    const completedQuestRawPayload = questRows[1]?.raw_payload && typeof questRows[1].raw_payload === 'object'
      ? questRows[1].raw_payload as Record<string, unknown>
      : {};
    if (Object.prototype.hasOwnProperty.call(completedQuestRawPayload, 'progress')) {
      throw new Error(`completed quest raw_payload should omit progress: ${JSON.stringify(questRows[1])}`);
    }
    if (
      !combatPreferenceRow
      || combatPreferenceRow.auto_battle !== true
      || combatPreferenceRow.auto_battle_targeting_mode !== 'boss'
      || combatPreferenceRow.retaliate_player_target_id !== 'rival_alpha'
      || Number(combatPreferenceRow.retaliate_player_target_last_attack_tick) !== 3456
      || combatPreferenceRow.auto_root_foundation !== true
      || Number(combatPreferenceRow.combat_attack_intensity) !== 12
      || combatPreferenceRow.sense_qi_active !== true
      || combatPreferenceRow.cultivation_active !== true
      || combatPreferenceRow.cultivating_tech_id !== 'qi.breathing'
    ) {
      throw new Error(`unexpected player_combat_preferences row: ${JSON.stringify(combatPreferenceRow)}`);
    }
    const projectedSnapshot = await service.loadProjectedSnapshot(playerId, () => buildSnapshot(now));
    if (
      !projectedSnapshot
      || projectedSnapshot.combat?.cultivationActive !== true
      || projectedSnapshot.techniques?.cultivatingTechId !== 'qi.breathing'
      || (projectedSnapshot.techniques?.techniques as Array<{
        techId?: unknown;
        learnTechniqueMaxLevel?: unknown;
      }> | undefined)?.find((entry) => entry.techId === 'sword.basic')?.learnTechniqueMaxLevel !== 2
    ) {
      throw new Error(`unexpected projected cultivation state: ${JSON.stringify(projectedSnapshot?.combat ?? null)}`);
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
    if (professionTypes.join(',') !== 'alchemy,building,enhancement,gather') {
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
    if (edgeProfessionMap.get('alchemy') !== 1 || edgeProfessionMap.get('building') !== 1 || edgeProfessionMap.get('enhancement') !== 1) {
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
          enhanceLevel: 3,
          slotIndex: 5,
          itemInstanceId: `direct-inv-${directPlayerId}-ore`,
          rawPayload: {
            itemId: 'direct_ore',
            count: 2,
            name: '直写矿石',
          },
        },
      ],
      { versionSeed: directBaseVersion + 4 },
    );
    await service.savePlayerInventoryItems(
      directPlayerId,
      [
        {
          itemId: 'direct_ore',
          count: 3,
          enhanceLevel: 3,
          slotIndex: 5,
          itemInstanceId: `direct-inv-${directPlayerId}-ore`,
          rawPayload: {
            itemId: 'direct_ore',
            count: 3,
            enhanceLevel: 3,
          },
        },
        {
          itemId: 'direct_stale_relic',
          count: 1,
          slotIndex: 6,
          itemInstanceId: `direct-inv-${directPlayerId}-stale-relic`,
          rawPayload: {
            itemId: 'direct_stale_relic',
            count: 1,
          },
        },
      ],
      { versionSeed: directBaseVersion + 4 },
    );
    await service.savePlayerInventoryItems(
      directPlayerId,
      [
        {
          itemId: 'direct_ore',
          count: 2,
          enhanceLevel: 3,
          slotIndex: 5,
          itemInstanceId: `direct-inv-${directPlayerId}-ore`,
          rawPayload: {
            itemId: 'direct_ore',
            count: 2,
            enhanceLevel: 3,
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
    const directMapWatermarkBeforeVersionFence = await fetchSingleRow(
      pool,
      'SELECT map_unlock_version FROM player_recovery_watermark WHERE player_id = $1',
      [directPlayerId],
    );
    const latestDirectMapVersion = Math.max(
      directBaseVersion + 7,
      Number(directMapWatermarkBeforeVersionFence?.map_unlock_version ?? 0) + 2,
    );
    await service.savePlayerMapUnlocks(
      directPlayerId,
      [{ mapId: 'direct_version_current', unlockedAt: latestDirectMapVersion }],
      { versionSeed: latestDirectMapVersion },
    );
    await service.savePlayerMapUnlocks(
      directPlayerId,
      [{ mapId: 'direct_version_stale', unlockedAt: latestDirectMapVersion - 1 }],
      { versionSeed: latestDirectMapVersion - 1 },
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
            enhanceLevel: 4,
            equipStats: { physAtk: 999 },
          },
        },
      ],
      { versionSeed: directBaseVersion + 6 },
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
            enhanceLevel: 4,
          },
        },
        {
          slot: 'body',
          itemInstanceId: `equip:${directPlayerId}:stale_body`,
          item: {
            itemId: 'armor.stale_robe',
            count: 1,
            equipSlot: 'body',
          },
        },
      ],
      { versionSeed: directBaseVersion + 6 },
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
            enhanceLevel: 4,
            equipStats: { physAtk: 999 },
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
        retaliatePlayerTargetLastAttackTick: null,
        combatTargetId: 'monster.alpha',
        combatTargetLocked: true,
        allowAoePlayerHit: false,
        autoIdleCultivation: false,
        autoSwitchCultivation: true,
        autoRootFoundation: true,
        combatAttackIntensity: 12,
        senseQiActive: true,
        cultivationActive: true,
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
          balance: 99,
          frozenBalance: 1,
          version: directBaseVersion + 12,
        },
        {
          walletType: 'stale_coin',
          balance: 7,
          frozenBalance: 0,
          version: directBaseVersion + 12,
        },
      ],
      { versionSeed: directBaseVersion + 12 },
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
            equipStats: { physAtk: 999 },
          },
        },
      ],
      { versionSeed: directBaseVersion + 14 },
    );
    await service.savePlayerMarketStorageItems(
      directPlayerId,
      [
        {
          storageItemId: `market:${directPlayerId}:0`,
          slotIndex: 0,
          itemId: 'spirit_stone',
          count: 10,
          enhanceLevel: null,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 10,
          },
        },
        {
          storageItemId: `market:${directPlayerId}:1`,
          slotIndex: 1,
          itemId: 'iron_sword',
          count: 1,
          enhanceLevel: 2,
          rawPayload: {
            itemId: 'iron_sword',
            count: 1,
            enhanceLevel: 2,
          },
        },
      ],
      { versionSeed: directBaseVersion + 18 },
    );
    await service.savePlayerMarketStorageItems(
      directPlayerId,
      [
        {
          storageItemId: `market:${directPlayerId}:0-rekeyed`,
          slotIndex: 0,
          itemId: 'spirit_stone',
          count: 11,
          enhanceLevel: null,
          rawPayload: {
            itemId: 'spirit_stone',
            count: 11,
          },
        },
      ],
      { versionSeed: directBaseVersion + 19 },
    );
    await service.savePlayerMarketStorageItems(
      marketConflictOwnerId,
      [
        {
          storageItemId: `market_storage:${marketConflictOwnerId}:0`,
          slotIndex: 0,
          itemId: 'foreign_storage_item',
          count: 1,
          rawPayload: { itemId: 'foreign_storage_item', count: 1 },
        },
      ],
      { versionSeed: directBaseVersion + 20 },
    );
    await pool.query(
      `
        INSERT INTO player_market_storage_item(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
      `,
      [
        `market_storage:${directPlayerId}:9`,
        marketConflictOwnerId,
        9,
        'foreign_storage_item',
        1,
        JSON.stringify({ itemId: 'foreign_storage_item', count: 1 }),
      ],
    );
    let marketStorageCrossOwnerConflictRejected = false;
    try {
      await service.savePlayerMarketStorageItems(
        directPlayerId,
        [
          {
            slotIndex: 9,
            itemId: 'foreign_storage_item',
            count: 1,
            rawPayload: { itemId: 'foreign_storage_item', count: 1 },
          },
        ],
        { versionSeed: directBaseVersion + 21 },
      );
    } catch (error) {
      marketStorageCrossOwnerConflictRejected = error instanceof Error
        && error.message.includes('replacePlayerMarketStorageItems: storage_item_id conflict outside player scope');
    }
    if (!marketStorageCrossOwnerConflictRejected) {
      throw new Error('expected market storage cross-owner storage_item_id conflict rejection');
    }
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

    const buffClearVersion = now + 300;
    await service.savePlayerBuffs(
      buffClearPlayerId,
      [{
        buffId: 'buff.clearable',
        sourceSkillId: 'skill.clearable',
        sourceCasterId: buffClearPlayerId,
        realmLv: 1,
        remainingTicks: 1,
        duration: 1,
        stacks: 1,
        maxStacks: 1,
        sustainTicksElapsed: 0,
        rawPayload: { buffId: 'buff.clearable' },
      }],
      { versionSeed: buffClearVersion },
    );
    const emptyBuffSnapshot = buildSnapshot(buffClearVersion + 1);
    emptyBuffSnapshot.buffs = { revision: 3, buffs: [] };
    let emptyBuffProjectionRefused = false;
    try {
      await service.savePlayerSnapshotProjectionDomains(
        buffClearPlayerId,
        emptyBuffSnapshot,
        ['buff'],
      );
    } catch (error) {
      emptyBuffProjectionRefused = error instanceof Error
        && error.message.includes('replace_persistent_buff_state_refused_empty_overwrite');
    }
    if (!emptyBuffProjectionRefused) {
      throw new Error('expected empty buff projection without explicit runtime option to be refused');
    }
    const buffRowsAfterRefusedProjection = await fetchRows(
      pool,
      'SELECT buff_id FROM player_persistent_buff_state WHERE player_id = $1',
      [buffClearPlayerId],
    );
    if (buffRowsAfterRefusedProjection.length !== 1) {
      throw new Error(`unexpected buff rows after refused empty projection: ${JSON.stringify(buffRowsAfterRefusedProjection)}`);
    }
    await service.savePlayerSnapshotProjectionDomains(
      buffClearPlayerId,
      emptyBuffSnapshot,
      ['buff'],
      { allowBuffEmptyOverwrite: true },
    );
    const buffRowsAfterAllowedProjection = await fetchRows(
      pool,
      'SELECT buff_id FROM player_persistent_buff_state WHERE player_id = $1',
      [buffClearPlayerId],
    );
    if (buffRowsAfterAllowedProjection.length !== 0) {
      throw new Error(`unexpected buff rows after allowed empty projection: ${JSON.stringify(buffRowsAfterAllowedProjection)}`);
    }

    const inventoryClearVersion = now + 320;
    await service.savePlayerInventoryItems(
      inventoryClearPlayerId,
      [{
        itemId: 'clearable_inventory_seed',
        count: 1,
        slotIndex: 0,
        itemInstanceId: `inv:${inventoryClearPlayerId}:0`,
        rawPayload: { itemId: 'clearable_inventory_seed', count: 1 },
      }],
      { versionSeed: inventoryClearVersion },
    );
    const emptyInventorySnapshot = buildSnapshot(inventoryClearVersion + 1);
    emptyInventorySnapshot.inventory = { revision: 5, capacity: 20, items: [] };
    await service.savePlayerSnapshotProjectionDomains(
      inventoryClearPlayerId,
      emptyInventorySnapshot,
      ['inventory'],
      { allowInventoryEmptyOverwrite: true },
    );
    const inventoryRowsAfterAllowedProjection = await fetchRows(
      pool,
      'SELECT item_id FROM player_inventory_item WHERE player_id = $1',
      [inventoryClearPlayerId],
    );
    if (inventoryRowsAfterAllowedProjection.length !== 0) {
      throw new Error(`unexpected inventory rows after allowed empty projection: ${JSON.stringify(inventoryRowsAfterAllowedProjection)}`);
    }

    const equipmentClearVersion = now + 340;
    await service.savePlayerEquipmentSlots(
      equipmentClearPlayerId,
      [{
        slot: 'weapon',
        itemInstanceId: `equip:${equipmentClearPlayerId}:weapon`,
        item: {
          itemId: 'clearable_equipment_seed',
          count: 1,
          equipSlot: 'weapon',
          itemInstanceId: `equip:${equipmentClearPlayerId}:weapon`,
        },
      }],
      { versionSeed: equipmentClearVersion },
    );
    const emptyEquipmentSnapshot = buildSnapshot(equipmentClearVersion + 1);
    emptyEquipmentSnapshot.equipment = {
      revision: 7,
      slots: EQUIP_SLOTS.map((slot) => ({ slot, item: null })),
    };
    await service.savePlayerSnapshotProjectionDomains(
      equipmentClearPlayerId,
      emptyEquipmentSnapshot,
      ['equipment'],
      { allowEquipmentEmptyOverwrite: true },
    );
    const equipmentRowsAfterAllowedProjection = await fetchRows(
      pool,
      'SELECT slot_type FROM player_equipment_slot WHERE player_id = $1',
      [equipmentClearPlayerId],
    );
    if (equipmentRowsAfterAllowedProjection.length !== 0) {
      throw new Error(`unexpected equipment rows after allowed empty projection: ${JSON.stringify(equipmentRowsAfterAllowedProjection)}`);
    }

    const projectionFenceVersion = now + 360;
    await service.savePlayerPresence(projectionFencePlayerId, {
      online: true,
      inWorld: true,
      runtimeOwnerId: `runtime:${projectionFencePlayerId}:10`,
      sessionEpoch: 10,
      lastHeartbeatAt: projectionFenceVersion,
      offlineSinceAt: null,
      versionSeed: projectionFenceVersion,
    });
    const currentProjectionSnapshot = buildSnapshot(projectionFenceVersion);
    currentProjectionSnapshot.inventory = {
      revision: 1,
      capacity: 20,
      items: [{
        itemId: 'current_yujian_absent_marker',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:current`,
      }],
    };
    currentProjectionSnapshot.techniques = {
      revision: 1,
      techniques: [{
        techId: 'current.learned.tech',
        level: 1,
        exp: 0,
        expToNext: 1,
        realmLv: 1,
        skillsEnabled: true,
      }],
      cultivatingTechId: 'current.learned.tech',
      pendingComprehensions: [],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      currentProjectionSnapshot,
      ['inventory', 'technique'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: `runtime:${projectionFencePlayerId}:10`,
        expectedSessionEpoch: 10,
      },
    );
    const staleProjectionSnapshot = buildSnapshot(projectionFenceVersion + 1);
    staleProjectionSnapshot.inventory = {
      revision: 2,
      capacity: 20,
      items: [{
        itemId: 'stale_resurrected_yujian',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:stale`,
      }],
    };
    staleProjectionSnapshot.techniques = {
      revision: 2,
      techniques: [],
      cultivatingTechId: null,
      pendingComprehensions: [],
    };
    let staleProjectionRejected = false;
    try {
      await service.savePlayerSnapshotProjectionDomains(
        projectionFencePlayerId,
        staleProjectionSnapshot,
        ['inventory', 'technique'],
        {
          allowInventoryEmptyOverwrite: true,
          expectedRuntimeOwnerId: `runtime:${projectionFencePlayerId}:9`,
          expectedSessionEpoch: 9,
        },
      );
    } catch (error) {
      staleProjectionRejected = error instanceof Error
        && error.message.includes('player_snapshot_projection_stale_session');
    }
    if (!staleProjectionRejected) {
      throw new Error('expected stale player snapshot projection to be rejected by session fence');
    }
    const fencedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [projectionFencePlayerId],
    );
    const fencedTechniqueRows = await fetchRows(
      pool,
      'SELECT tech_id FROM player_technique_state WHERE player_id = $1 ORDER BY tech_id ASC',
      [projectionFencePlayerId],
    );
    if (
      fencedInventoryRows.length !== 1
      || fencedInventoryRows[0]?.item_id !== 'current_yujian_absent_marker'
      || fencedTechniqueRows.length !== 1
      || fencedTechniqueRows[0]?.tech_id !== 'current.learned.tech'
    ) {
      throw new Error(`stale projection changed fenced player domains: inventory=${JSON.stringify(fencedInventoryRows)} technique=${JSON.stringify(fencedTechniqueRows)}`);
    }

    // 同 epoch + 不同 owner：真实的同 epoch 竞写方（owner 非空）必须仍被 owner 围栏拦下。
    let rivalOwnerRejected = false;
    try {
      await service.savePlayerSnapshotProjectionDomains(
        projectionFencePlayerId,
        buildSnapshot(projectionFenceVersion + 2),
        ['inventory'],
        {
          allowInventoryEmptyOverwrite: true,
          expectedRuntimeOwnerId: `runtime:${projectionFencePlayerId}:10:rival`,
          expectedSessionEpoch: 10,
        },
      );
    } catch (error) {
      rivalOwnerRejected = error instanceof Error
        && error.message.includes('player_snapshot_projection_stale_owner');
    }
    if (!rivalOwnerRejected) {
      throw new Error('expected same-epoch rival runtime owner to be rejected by owner fence');
    }
    let rivalPresenceRejected = false;
    try {
      await service.savePlayerPresence(projectionFencePlayerId, {
        online: false,
        inWorld: true,
        lastHeartbeatAt: null,
        offlineSinceAt: projectionFenceVersion + 2,
        runtimeOwnerId: `runtime:${projectionFencePlayerId}:10:rival`,
        sessionEpoch: 10,
      });
    } catch (error) {
      rivalPresenceRejected = error instanceof Error
        && error.message.includes('player_presence_stale_fence');
    }
    if (!rivalPresenceRejected) {
      throw new Error('expected same-epoch rival presence owner to be rejected before owner replacement');
    }

    // 运行态只提供 epoch、缺少 owner 时必须拒绝，不能伪装成管理/导入的无围栏写入。
    const offlineRestoredSnapshot = buildSnapshot(projectionFenceVersion + 3);
    offlineRestoredSnapshot.inventory = {
      revision: 3,
      capacity: 20,
      items: [{
        itemId: 'offline_restored_marker',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:offline`,
      }],
    };
    let incompleteFenceRejected = false;
    try {
      await service.savePlayerSnapshotProjectionDomains(
        projectionFencePlayerId,
        offlineRestoredSnapshot,
        ['inventory'],
        {
          allowInventoryEmptyOverwrite: true,
          expectedRuntimeOwnerId: null,
          expectedSessionEpoch: 10,
        },
      );
    } catch (error) {
      incompleteFenceRejected = error instanceof Error
        && (
          error.message.includes('player_snapshot_projection_incomplete_fence')
          || error.message.includes('player_snapshot_projection_stale_owner')
        );
    }
    if (!incompleteFenceRejected) {
      throw new Error('expected ownerless runtime projection to be rejected as incomplete fence');
    }

    // 两次并发 claim 必须在同一玩家 advisory lock 下串行递增 DB epoch，且最终返回值与持久态完全一致。
    const claims = await Promise.all([
      service.claimPlayerRuntimeOwnership(projectionFencePlayerId, {
        online: false,
        inWorld: true,
        lastHeartbeatAt: null,
        offlineSinceAt: projectionFenceVersion + 3,
      }),
      service.claimPlayerRuntimeOwnership(projectionFencePlayerId, {
        online: false,
        inWorld: true,
        lastHeartbeatAt: null,
        offlineSinceAt: projectionFenceVersion + 3,
      }),
    ]);
    const claimedEpochs = claims
      .map((claim) => claim?.sessionEpoch ?? 0)
      .sort((left, right) => left - right);
    if (claimedEpochs[0] !== 11 || claimedEpochs[1] !== 12) {
      throw new Error(`runtime ownership claims did not increment atomically: ${JSON.stringify(claims)}`);
    }
    const finalClaim = claims.find((claim) => claim?.sessionEpoch === 12);
    const claimedPresence = await service.loadPlayerPresence(projectionFencePlayerId);
    if (
      !finalClaim
      || claimedPresence?.sessionEpoch !== finalClaim.sessionEpoch
      || claimedPresence.runtimeOwnerId !== finalClaim.runtimeOwnerId
      || claimedPresence.online !== false
      || claimedPresence.inWorld !== true
    ) {
      throw new Error(`runtime ownership claim did not persist exact fence: claims=${JSON.stringify(claims)} presence=${JSON.stringify(claimedPresence)}`);
    }

    const presenceWatermarkBeforeVersionFence = await fetchSingleRow(
      pool,
      'SELECT presence_version FROM player_recovery_watermark WHERE player_id = $1',
      [projectionFencePlayerId],
    );
    const latestPresenceVersion = Math.max(
      projectionFenceVersion + 500,
      Number(presenceWatermarkBeforeVersionFence?.presence_version ?? 0) + 1,
    );
    await service.savePlayerPresence(projectionFencePlayerId, {
      online: false,
      inWorld: true,
      lastHeartbeatAt: null,
      offlineSinceAt: latestPresenceVersion,
      runtimeOwnerId: finalClaim.runtimeOwnerId,
      sessionEpoch: finalClaim.sessionEpoch,
      versionSeed: latestPresenceVersion,
    });
    await service.savePlayerPresence(projectionFencePlayerId, {
      online: true,
      inWorld: true,
      lastHeartbeatAt: latestPresenceVersion - 1,
      offlineSinceAt: null,
      runtimeOwnerId: finalClaim.runtimeOwnerId,
      sessionEpoch: finalClaim.sessionEpoch,
      versionSeed: latestPresenceVersion - 1,
    });
    const versionFencedPresence = await service.loadPlayerPresence(projectionFencePlayerId);
    const presenceWatermark = await fetchSingleRow(
      pool,
      'SELECT presence_version FROM player_recovery_watermark WHERE player_id = $1',
      [projectionFencePlayerId],
    );
    if (
      versionFencedPresence?.online !== false
      || versionFencedPresence.offlineSinceAt !== latestPresenceVersion
      || Number(presenceWatermark?.presence_version) !== latestPresenceVersion
    ) {
      throw new Error(
        `旧版同 fence presence 覆盖了较新真源：presence=${JSON.stringify(versionFencedPresence)} watermark=${JSON.stringify(presenceWatermark)}`,
      );
    }
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      offlineRestoredSnapshot,
      ['inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
      },
    );
    const offlineRestoredRows = await fetchRows(
      pool,
      'SELECT item_id FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [projectionFencePlayerId],
    );
    if (offlineRestoredRows.length !== 1 || offlineRestoredRows[0]?.item_id !== 'offline_restored_marker') {
      throw new Error(`claimed offline projection flush was fenced out: inventory=${JSON.stringify(offlineRestoredRows)}`);
    }

    const latestProjectionVersion = projectionFenceVersion + 1_000;
    const latestProjectionSnapshot = buildSnapshot(latestProjectionVersion);
    latestProjectionSnapshot.inventory = {
      revision: 4,
      capacity: 20,
      items: [{
        itemId: 'latest_projection_marker',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:latest`,
      }],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      latestProjectionSnapshot,
      ['inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
        expectedProjectionVersion: latestProjectionVersion,
      },
    );

    const staleSameFenceSnapshot = buildSnapshot(latestProjectionVersion - 1);
    staleSameFenceSnapshot.inventory = {
      revision: 5,
      capacity: 20,
      items: [{
        itemId: 'stale_same_fence_marker',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:stale-same-fence`,
      }],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      staleSameFenceSnapshot,
      ['inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
        expectedProjectionVersion: latestProjectionVersion - 1,
      },
    );

    const equalVersionSnapshot = buildSnapshot(latestProjectionVersion);
    equalVersionSnapshot.inventory = {
      revision: 6,
      capacity: 20,
      items: [{
        itemId: 'equal_version_replay_marker',
        count: 1,
        itemInstanceId: `inv:${projectionFencePlayerId}:equal-replay`,
      }],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      equalVersionSnapshot,
      ['inventory'],
      {
        allowInventoryEmptyOverwrite: true,
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
        expectedProjectionVersion: latestProjectionVersion,
      },
    );
    const versionFencedInventoryRows = await fetchRows(
      pool,
      'SELECT item_id FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [projectionFencePlayerId],
    );
    const versionFencedWatermark = await fetchSingleRow(
      pool,
      'SELECT inventory_version FROM player_recovery_watermark WHERE player_id = $1',
      [projectionFencePlayerId],
    );
    if (
      versionFencedInventoryRows.length !== 1
      || versionFencedInventoryRows[0]?.item_id !== 'latest_projection_marker'
      || Number(versionFencedWatermark?.inventory_version) !== latestProjectionVersion
    ) {
      throw new Error(
        `旧版或同版 projection 覆盖了较新真源：inventory=${JSON.stringify(versionFencedInventoryRows)} watermark=${JSON.stringify(versionFencedWatermark)}`,
      );
    }

    // equipment/artifact 是独立真源域，必须拥有独立 watermark；较新的装备写不能吞掉稍早但尚未应用的法宝 payload。
    const artifactProjectionVersion = latestProjectionVersion + 10;
    const equipmentProjectionVersion = artifactProjectionVersion + 1;
    const independentEquipmentSnapshot = buildSnapshot(equipmentProjectionVersion);
    independentEquipmentSnapshot.equipment = {
      revision: 20,
      slots: [{
        slot: 'weapon',
        item: {
          itemId: 'equipment_watermark_marker',
          itemInstanceId: `equip:${projectionFencePlayerId}:watermark`,
        },
      }],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      independentEquipmentSnapshot,
      ['equipment'],
      {
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
        expectedProjectionVersion: equipmentProjectionVersion,
      },
    );
    const independentArtifactSnapshot = buildSnapshot(artifactProjectionVersion);
    independentArtifactSnapshot.artifacts = {
      revision: 21,
      slots: [{
        slot: 'artifact_1',
        unlocked: true,
        enabled: true,
        qi: 9,
        maxQi: 12,
        item: {
          itemId: 'artifact_watermark_marker',
          itemInstanceId: `artifact:${projectionFencePlayerId}:watermark`,
        },
      }],
    };
    await service.savePlayerSnapshotProjectionDomains(
      projectionFencePlayerId,
      independentArtifactSnapshot,
      ['artifact'],
      {
        expectedRuntimeOwnerId: finalClaim.runtimeOwnerId,
        expectedSessionEpoch: finalClaim.sessionEpoch,
        expectedProjectionVersion: artifactProjectionVersion,
      },
    );
    const independentEquipmentRow = await fetchSingleRow(
      pool,
      'SELECT item_id FROM player_equipment_slot WHERE player_id = $1 AND slot_type = $2',
      [projectionFencePlayerId, 'weapon'],
    );
    const independentArtifactRow = await fetchSingleRow(
      pool,
      'SELECT item_id FROM player_artifact_slot WHERE player_id = $1 AND slot_type = $2',
      [projectionFencePlayerId, 'artifact_1'],
    );
    const independentWatermark = await fetchSingleRow(
      pool,
      'SELECT equipment_version, artifact_version FROM player_recovery_watermark WHERE player_id = $1',
      [projectionFencePlayerId],
    );
    if (
      independentEquipmentRow?.item_id !== 'equipment_watermark_marker'
      || independentArtifactRow?.item_id !== 'artifact_watermark_marker'
      || Number(independentWatermark?.equipment_version) !== equipmentProjectionVersion
      || Number(independentWatermark?.artifact_version) !== artifactProjectionVersion
    ) {
      throw new Error(
        `equipment/artifact watermark 串扰：equipment=${JSON.stringify(independentEquipmentRow)}`
        + ` artifact=${JSON.stringify(independentArtifactRow)} watermark=${JSON.stringify(independentWatermark)}`,
      );
    }

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
      'SELECT item_instance_id, slot_index, item_id, count, raw_payload FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [directPlayerId],
    );
    const directMapUnlockRows = await fetchRows(
      pool,
      'SELECT map_id, unlocked_at FROM player_map_unlock WHERE player_id = $1 ORDER BY unlocked_at ASC, map_id ASC',
      [directPlayerId],
    );
    const directEquipmentRows = await fetchRows(
      pool,
      'SELECT slot_type, item_instance_id, item_id, raw_payload FROM player_equipment_slot WHERE player_id = $1 ORDER BY slot_type ASC',
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
      'SELECT storage_item_id, slot_index, item_id, count, raw_payload FROM player_market_storage_item WHERE player_id = $1 ORDER BY slot_index ASC, storage_item_id ASC',
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
      || directInventoryRows[0]?.item_instance_id !== `direct-inv-${directPlayerId}-ore`
      || Number(directInventoryRows[0]?.slot_index ?? 0) !== 5
      || directInventoryRows[0]?.item_id !== 'direct_ore'
      || Number((directInventoryRows[0]?.raw_payload as { enhanceLevel?: unknown } | null | undefined)?.enhanceLevel ?? 0) !== 3
    ) {
      throw new Error(`unexpected direct player_inventory_item rows: ${JSON.stringify(directInventoryRows)}`);
    }
    if (
      directMapUnlockRows.length !== 1
      || directMapUnlockRows[0]?.map_id !== 'direct_version_current'
      || Number(directMapUnlockRows[0]?.unlocked_at ?? 0) !== latestDirectMapVersion
    ) {
      throw new Error(`unexpected direct player_map_unlock rows: ${JSON.stringify(directMapUnlockRows)}`);
    }
    const directEquipmentInstanceId = typeof directEquipmentRows[0]?.item_instance_id === 'string'
      ? directEquipmentRows[0].item_instance_id
      : '';
    if (
      directEquipmentRows.length !== 1
      || directEquipmentRows[0]?.slot_type !== 'weapon'
      || !directEquipmentInstanceId
      || isLegacyItemInstanceId(directEquipmentInstanceId)
      || directEquipmentRows[0]?.item_id !== 'weapon.direct_blade'
      || Number((directEquipmentRows[0]?.raw_payload as { enhanceLevel?: unknown } | null | undefined)?.enhanceLevel ?? 0) !== 4
      || Object.prototype.hasOwnProperty.call(directEquipmentRows[0]?.raw_payload ?? {}, 'equipStats')
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
      || directMarketStorageRows[0]?.storage_item_id !== `market_storage:${directPlayerId}:0`
      || Number(directMarketStorageRows[0]?.slot_index ?? -1) !== 0
      || directMarketStorageRows[0]?.item_id !== 'spirit_stone'
      || Number(directMarketStorageRows[0]?.count ?? 0) !== 11
      || Object.keys(directMarketStorageRows[0]?.raw_payload ?? {}).length !== 0
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
      || Number(directWatermarkRow.market_storage_version) !== directBaseVersion + 19
      || Number(directWatermarkRow.map_unlock_version) !== latestDirectMapVersion
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
      || walletOnlyDomains.hasProjectedState !== true
      || walletOnlyDomains.walletRows.length !== 1
      || String(walletOnlyDomains.walletRows[0]?.wallet_type ?? '') !== 'spirit_stone'
      || Number(walletOnlyDomains.walletRows[0]?.balance ?? 0) !== 66
      || walletOnlyDomains.marketStorageItems.length !== 0
    ) {
      throw new Error(`unexpected loadPlayerDomains wallet-only result: ${JSON.stringify(walletOnlyDomains)}`);
    }
    await assertSnapshotActiveJobRows(service, pool, activeJobRecoveryPlayerId, directBaseVersion + 900);
    await assertProjectedActiveJobRecoveryKinds(service, activeJobRecoveryPlayerId, directBaseVersion + 1000);

    await service.savePlayerAutoBattleSkills(
      autoPreferenceClearPlayerId,
      [{ skillId: 'skill.auto_pref_seed', enabled: true, skillEnabled: true, autoBattleOrder: 0 }],
      { versionSeed: now + 500 },
    );
    await service.savePlayerAutoUseItemRules(
      autoPreferenceClearPlayerId,
      [{ itemId: 'pill.auto_pref_seed', conditionPayload: [{ type: 'hp_below_ratio', value: 0.5 }] }],
      { versionSeed: now + 501 },
    );
    await service.savePlayerAutoBattleSkills(autoPreferenceClearPlayerId, [], { versionSeed: now + 502 });
    await service.savePlayerAutoUseItemRules(autoPreferenceClearPlayerId, [], { versionSeed: now + 503 });
    const autoPreferenceRowsAfterClear = await Promise.all([
      fetchRows(pool, 'SELECT skill_id FROM player_auto_battle_skill WHERE player_id = $1', [autoPreferenceClearPlayerId]),
      fetchRows(pool, 'SELECT item_id FROM player_auto_use_item_rule WHERE player_id = $1', [autoPreferenceClearPlayerId]),
    ]);
    if (autoPreferenceRowsAfterClear[0].length !== 0 || autoPreferenceRowsAfterClear[1].length !== 0) {
      throw new Error(`auto preference empty overwrite did not clear rows: ${JSON.stringify(autoPreferenceRowsAfterClear)}`);
    }

    successPayload = {
      ok: true,
      playerId,
      edgePlayerId,
      directPlayerId,
      answers: 'with-db 下 PlayerDomainPersistenceService 已能把 presence、wallet、vitals、progression core、attr、body training、inventory、market storage、map unlock、equipment、technique、persistent buff、quest、combat/auto-*、强化记录、日志与职业作业投影写入当前已落地的分域表，并支持 inventory/wallet/equipment/map/technique/buff/quest/auto/profession/alchemy/enhancement/logbook/market storage 快照 stale 行清理、wallet/market storage/equipment 非法 entry 拒绝静默跳过、运行时显式选项清空最后一个 inventory/equipment/buff row、auto_battle_skill/auto_use_item_rule 清空偏好列表、旧 session projection 不会覆盖当前玩家分域、wallet/market storage 的 loadPlayerDomains 读链与对应 watermark 推进，以及 alchemy/forging/enhancement/transmission/gather/mining/building/formation 旧快照 job 写入 player_active_job、player_active_job 再按统一 job kind 投影恢复到 progression.<kind>Job',
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
      snapshotActiveJobProjectionSafe: true,
      projectedActiveJobRecoverySafe: true,
      emptyStringProjectionSafe: true,
      invalidAssetEntryRejectsSilentPrune: true,
      inventoryEmptyProjectionExplicitOptionSafe: true,
      equipmentEmptyProjectionExplicitOptionSafe: true,
      buffEmptyProjectionExplicitOptionSafe: true,
      autoPreferenceEmptyOverwriteSafe: true,
      marketStorageCrossOwnerConflictRejected,
    };
  } catch (error) {
    runFailed = true;
    runError = error;
  } finally {
    cleanupErrors.push(...await collectCleanupErrors([
      ...testPlayerIds.map((testPlayerId) => ({
        label: `测试玩家清理 playerId=${testPlayerId}`,
        run: () => cleanupPlayer(pool, testPlayerId),
      })),
      {
        label: 'smoke 独立数据库连接池关闭',
        run: () => pool.end(),
      },
      {
        label: 'PlayerDomainPersistenceService 关闭',
        run: () => service.onModuleDestroy(),
      },
      {
        label: 'DatabasePoolProvider 关闭',
        run: () => databasePoolProvider.onModuleDestroy(),
      },
    ]));
  }

  if (runFailed || cleanupErrors.length > 0) {
    throw new AggregateError(
      runFailed ? [runError, ...cleanupErrors] : cleanupErrors,
      runFailed
        ? 'player-domain-persistence smoke 执行失败'
        : 'player-domain-persistence smoke 清理失败',
    );
  }
  if (successPayload === null) {
    throw new Error('player-domain-persistence smoke 未生成成功结果');
  }
  console.log(JSON.stringify(successPayload, null, 2));
}

type CleanupTask = {
  label: string;
  run: () => Promise<unknown>;
};

async function collectCleanupErrors(tasks: CleanupTask[]): Promise<Error[]> {
  const errors: Error[] = [];
  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      errors.push(new Error(
        `${task.label}失败：${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }
  return errors;
}

async function assertCleanupFailureAggregation(): Promise<void> {
  const completedLabels: string[] = [];
  const errors = await collectCleanupErrors([
    {
      label: '第一个清理任务',
      run: async () => {
        completedLabels.push('first');
        throw new Error('first_cleanup_failed');
      },
    },
    {
      label: '中间清理任务',
      run: async () => {
        completedLabels.push('middle');
      },
    },
    {
      label: '最后一个清理任务',
      run: async () => {
        completedLabels.push('last');
        throw new Error('last_cleanup_failed');
      },
    },
  ]);
  if (
    completedLabels.join(',') !== 'first,middle,last'
    || errors.length !== 2
    || !errors[0]?.message.includes('第一个清理任务失败：first_cleanup_failed')
    || !errors[1]?.message.includes('最后一个清理任务失败：last_cleanup_failed')
  ) {
    throw new Error(
      `cleanup aggregation contract failed: completed=${completedLabels.join(',')} errors=${errors.map((error) => error.message).join('|')}`,
    );
  }
}

async function assertProjectedActiveJobRecoveryKinds(
  service: PlayerDomainPersistenceService,
  playerId: string,
  versionSeed: number,
): Promise<void> {
  const jobKinds: Array<PlayerActiveJobUpsertInput['jobType']> = [
    'alchemy',
    'forging',
    'enhancement',
    'transmission',
    'gather',
    'mining',
    'building',
    'formation',
  ];
  const jobFields: Record<PlayerActiveJobUpsertInput['jobType'], string> = {
    alchemy: 'alchemyJob',
    forging: 'forgingJob',
    enhancement: 'enhancementJob',
    transmission: 'transmissionJob',
    gather: 'gatherJob',
    mining: 'miningJob',
    building: 'buildingJob',
    formation: 'formationJob',
  };

  for (const [index, jobType] of jobKinds.entries()) {
    const jobRunId = `job-run:projected:${jobType}:${index}`;
    await service.savePlayerActiveJob(
      playerId,
      {
        jobRunId,
        jobType,
        status: 'running',
        phase: jobType === 'formation' ? 'maintaining' : 'running',
        startedAt: versionSeed + index,
        finishedAt: null,
        pausedTicks: index,
        totalTicks: 30 + index,
        remainingTicks: 10 + index,
        successRate: 0.5 + index / 100,
        speedRate: 1 + index / 10,
        jobVersion: 100 + index,
        detailJson: {
          jobRunId,
          jobType,
          targetId: `target:${jobType}`,
          interruptWaitRemainingTicks: 3 + index,
        },
      },
      { versionSeed: versionSeed + index },
    );

    const projected = await service.loadProjectedSnapshot(
      playerId,
      () => buildStarterSnapshotForProjectedActiveJob(versionSeed),
    );
    if (!projected) {
      throw new Error(`expected projected snapshot for active job ${jobType}`);
    }

    const progression = projected.progression as unknown as Record<string, unknown>;
    const expectedField = jobFields[jobType];
    const projectedJob = progression[expectedField] as Record<string, unknown> | null | undefined;
    if (
      !projectedJob
      || projectedJob.jobRunId !== jobRunId
      || projectedJob.jobType !== jobType
      || projectedJob.targetId !== `target:${jobType}`
      || Number(projectedJob.jobVersion ?? 0) !== 100 + index
      || Number(projectedJob.remainingTicks ?? 0) !== 10 + index
      || Number(projectedJob.interruptWaitRemainingTicks ?? 0) !== 3 + index
    ) {
      throw new Error(`unexpected projected ${jobType} active job: ${JSON.stringify(projectedJob)}`);
    }

    for (const [otherJobType, otherField] of Object.entries(jobFields)) {
      if (otherJobType !== jobType && progression[otherField]) {
        throw new Error(
          `projected active job ${jobType} leaked into ${otherField}: ${JSON.stringify(progression[otherField])}`,
        );
      }
    }
  }
}

async function assertSnapshotActiveJobRows(
  service: PlayerDomainPersistenceService,
  pool: Pool,
  playerId: string,
  versionSeed: number,
): Promise<void> {
  const jobKinds: Array<PlayerActiveJobUpsertInput['jobType']> = [
    'alchemy',
    'forging',
    'enhancement',
    'gather',
    'mining',
    'building',
    'formation',
  ];

  for (const [index, jobType] of jobKinds.entries()) {
    const jobRunId = `job-run:snapshot:${jobType}:${index}`;
    await service.savePlayerSnapshotProjection(
      playerId,
      buildSnapshotWithOnlyActiveJob(jobType, versionSeed + index, jobRunId, 200 + index),
    );

    const row = await fetchSingleRow(
      pool,
      'SELECT job_type, job_run_id, job_version, remaining_ticks, detail_jsonb FROM player_active_job WHERE player_id = $1',
      [playerId],
    );
    const detail = row?.detail_jsonb as Record<string, unknown> | null | undefined;
    if (
      !row
      || row.job_type !== jobType
      || row.job_run_id !== jobRunId
      || Number(row.job_version ?? 0) !== 200 + index
      || Number(row.remaining_ticks ?? 0) !== 20 + index
      || detail?.targetId !== `target:${jobType}`
      || detail?.jobType !== jobType
    ) {
      throw new Error(`unexpected snapshot active job row for ${jobType}: ${JSON.stringify(row)}`);
    }
  }
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
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `测试玩家清理事务和回滚均失败：playerId=${playerId}`,
      );
    }
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
