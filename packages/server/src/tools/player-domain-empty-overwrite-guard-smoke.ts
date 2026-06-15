import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import {
  PLAYER_DOMAIN_PROJECTED_TABLES,
  PlayerDomainPersistenceService,
} from '../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';

/**
 * 玩家分域整表清空事故修复（详见 docs/plans/玩家分域整表清空事故修复.md）的纵深防御回归 smoke。
 *
 * 核心目标：保证 7 个关键资产/状态域的 cleanup DELETE 在 incoming=空数组 + PG 中已有 row 时
 * 永远 throw、PG 中数据不被清空。
 *
 * 测试矩阵：
 *   inventory / wallet / equipment / market_storage / technique / buff / quest
 *
 * 每个域的步骤：
 *   1) 先 seed 1 行真实数据；
 *   2) 调对应 service.savePlayer<Domain>(playerId, [], options) 触发 cleanup DELETE；
 *   3) 期望抛出 `replace_<domain>_refused_empty_overwrite`；
 *   4) 验证 PG 中数据仍是 seed 时的 1 行（withTransaction rollback 成功）。
 *
 * 该 smoke 必须在 with-db 环境运行。无 DB 时打印 skipped JSON 但仍 ok=true，让 stable smoke suite
 * 不被环境因素阻断；任何回归会立刻在 with-db 链路上爆出。
 */

const databaseUrl = resolveServerDatabaseUrl();

interface DomainCase {
  tag: string;
  table: string;
  description: string;
  seed: (service: PlayerDomainPersistenceService, playerId: string, versionSeed: number) => Promise<void>;
  attemptEmptyOverwrite: (service: PlayerDomainPersistenceService, playerId: string, versionSeed: number) => Promise<void>;
}

const DOMAIN_CASES: DomainCase[] = [
  {
    tag: 'inventory',
    table: 'player_inventory_item',
    description: 'inventory 整玩家 cleanup',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerInventoryItems(
        playerId,
        [
          {
            itemId: 'guard_inventory_seed',
            count: 1,
            slotIndex: 0,
            itemInstanceId: `inv:${playerId}:0`,
            rawPayload: { itemId: 'guard_inventory_seed', count: 1 },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerInventoryItems(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'wallet',
    table: 'player_wallet',
    description: 'wallet 整玩家 cleanup',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerWallet(
        playerId,
        [
          { walletType: 'spirit_stone', balance: 100, frozenBalance: 0, version: versionSeed },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerWallet(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'equipment',
    table: 'player_equipment_slot',
    description: 'equipment 整玩家 cleanup',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerEquipmentSlots(
        playerId,
        [
          {
            slot: 'weapon',
            itemInstanceId: `equip:${playerId}:weapon`,
            item: {
              itemId: 'guard_equip_seed',
              enhanceLevel: 0,
              itemInstanceId: `equip:${playerId}:weapon`,
            },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerEquipmentSlots(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'market_storage',
    table: 'player_market_storage_item',
    description: 'market_storage 整玩家 cleanup',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerMarketStorageItems(
        playerId,
        [
          {
            itemId: 'guard_market_storage_seed',
            count: 1,
            slotIndex: 0,
            storageItemId: `market_storage:${playerId}:0`,
            rawPayload: { itemId: 'guard_market_storage_seed', count: 1 },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerMarketStorageItems(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'technique',
    table: 'player_technique_state',
    description: 'technique 整玩家 cleanup（共用 prunePlayerRowsBySnapshotKeys helper）',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerTechniques(
        playerId,
        [
          {
            techId: 'guard_technique_seed',
            level: 1,
            exp: 0,
            expToNext: 100,
            realmLv: 1,
            skillsEnabled: true,
            rawPayload: { techId: 'guard_technique_seed' },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerTechniques(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'persistent_buff_state',
    table: 'player_persistent_buff_state',
    description: 'persistent_buff 整玩家 cleanup（共用 prunePlayerRowsBySnapshotKeys helper）',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerBuffs(
        playerId,
        [
          {
            buffId: 'guard_buff_seed',
            sourceSkillId: 'guard_skill_seed',
            sourceCasterId: playerId,
            realmLv: 1,
            remainingTicks: 60,
            duration: 60,
            stacks: 1,
            maxStacks: 1,
            sustainTicksElapsed: 0,
            rawPayload: { buffId: 'guard_buff_seed' },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerBuffs(playerId, [], { versionSeed });
    },
  },
  {
    tag: 'quest_progress',
    table: 'player_quest_progress',
    description: 'quest_progress 整玩家 cleanup（共用 prunePlayerRowsBySnapshotKeys helper）',
    seed: async (service, playerId, versionSeed) => {
      await service.savePlayerQuests(
        playerId,
        [
          {
            questId: 'guard_quest_seed',
            status: 'in_progress',
            progressPayload: { step: 0 },
            rawPayload: { questId: 'guard_quest_seed', startedAt: versionSeed },
          },
        ],
        { versionSeed },
      );
    },
    attemptEmptyOverwrite: async (service, playerId, versionSeed) => {
      await service.savePlayerQuests(playerId, [], { versionSeed });
    },
  },
];

interface CaseResult {
  tag: string;
  table: string;
  description: string;
  seedRowCount: number;
  threwExpectedError: boolean;
  errorMessage: string | null;
  rowCountAfterAttempt: number;
  rowCountUnchanged: boolean;
}

interface CompletedComprehensionPruneResult {
  playerId: string;
  techniqueStateRows: number;
  techniqueComprehensionRows: number;
  completedPendingDeleted: boolean;
}

interface BlockedComprehensionPruneResult {
  playerId: string;
  threwExpectedError: boolean;
  errorMessage: string | null;
  techniqueComprehensionRows: number;
  pendingPreserved: boolean;
}

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers:
            '本 smoke 是 docs/plans/玩家分域整表清空事故修复.md 的纵深回归校验。with-db 环境下会逐域验证 cleanup DELETE 在空 incoming + PG 已有 row 时的 throw + rollback。',
          excludes: '不证明 ensureNativeStarterSnapshot 入口防御与 watermark guard，那条由独立单元/集成测试覆盖。',
          completionMapping: 'release:proof:with-db.player-domain-empty-overwrite-guard',
        },
        null,
        2,
      ),
    );
    return;
  }

  const playerIdBase = `pd_guard_${Date.now().toString(36)}`;
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new PlayerDomainPersistenceService(null, databasePoolProvider);
  const pool = new Pool({ connectionString: databaseUrl });

  await service.onModuleInit();
  if (!service.isEnabled()) {
    throw new Error('player-domain-persistence service not enabled');
  }

  const results: CaseResult[] = [];
  const failures: string[] = [];
  let completedComprehensionPrune: CompletedComprehensionPruneResult | null = null;
  let blockedComprehensionPrune: BlockedComprehensionPruneResult | null = null;

  try {
    for (const domainCase of DOMAIN_CASES) {
      const playerId = `${playerIdBase}_${domainCase.tag}`;
      await cleanupPlayer(pool, playerId);

      const versionSeed = Date.now();
      try {
        await domainCase.seed(service, playerId, versionSeed);
      } catch (error) {
        await cleanupPlayer(pool, playerId).catch(() => undefined);
        throw new Error(
          `seed failed for tag=${domainCase.tag}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const seedRowCount = await countDomainRows(pool, domainCase.table, playerId);
      if (seedRowCount <= 0) {
        await cleanupPlayer(pool, playerId).catch(() => undefined);
        throw new Error(`seed for tag=${domainCase.tag} produced 0 rows; cannot validate guard`);
      }

      let threwExpectedError = false;
      let errorMessage: string | null = null;
      try {
        await domainCase.attemptEmptyOverwrite(service, playerId, versionSeed + 1);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        threwExpectedError = errorMessage.includes(`replace_${domainCase.tag}_refused_empty_overwrite`)
          || errorMessage.includes('refused_empty_overwrite');
      }

      const rowCountAfterAttempt = await countDomainRows(pool, domainCase.table, playerId);
      const rowCountUnchanged = rowCountAfterAttempt === seedRowCount;

      const result: CaseResult = {
        tag: domainCase.tag,
        table: domainCase.table,
        description: domainCase.description,
        seedRowCount,
        threwExpectedError,
        errorMessage,
        rowCountAfterAttempt,
        rowCountUnchanged,
      };
      results.push(result);
      await cleanupPlayer(pool, playerId).catch(() => undefined);

      if (!threwExpectedError) {
        failures.push(
          `tag=${domainCase.tag} did not throw refused_empty_overwrite (errorMessage=${errorMessage ?? '<none>'})`,
        );
      }
      if (!rowCountUnchanged) {
        failures.push(
          `tag=${domainCase.tag} table=${domainCase.table} row count changed: seed=${seedRowCount} after=${rowCountAfterAttempt}`,
        );
      }
    }

    completedComprehensionPrune = await assertCompletedTechniqueComprehensionCanPrune(
      service,
      pool,
      `${playerIdBase}_technique_comprehension_completed`,
    );
    blockedComprehensionPrune = await assertUnmatchedTechniqueComprehensionStillBlocked(
      service,
      pool,
      `${playerIdBase}_technique_comprehension_blocked`,
    );

    if (failures.length > 0) {
      throw new Error(`empty-overwrite guard failures:\n  - ${failures.join('\n  - ')}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          case: 'player-domain-empty-overwrite-guard',
          domainResults: results,
          completedComprehensionPrune,
          blockedComprehensionPrune,
          answers:
            '玩家分域 cleanup DELETE 在 incoming=[] + PG 已有 row 时，已被 refuseEmptyOverwriteIfRowsExist 守卫拒绝；withTransaction rollback 后 PG 中 row 数与 seed 一致。未领悟功法完成后 pendingComprehensions 合法归零时允许删除旧 pending 行；tech_id 未匹配已学功法时仍拒绝清空 pending。',
          excludes:
            '不证明 ensureNativeStarterSnapshot 入口的 load 失败拒绝写 starter / hasRecoveryWatermark guard，这两层由 world-player-snapshot.service 自身的逻辑路径覆盖。',
          completionMapping: 'release:proof:with-db.player-domain-empty-overwrite-guard',
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end().catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
  }
}

async function assertUnmatchedTechniqueComprehensionStillBlocked(
  service: PlayerDomainPersistenceService,
  pool: Pool,
  playerId: string,
): Promise<BlockedComprehensionPruneResult> {
  await cleanupPlayer(pool, playerId);
  const pendingTechId = 'guard_unmatched_pending_technique';
  const seedSnapshot = buildTechniqueProjectionSnapshot(playerId, [], [
    {
      techId: pendingTechId,
      sourceKind: 'created',
      selfComprehensionAllowed: true,
      progress: 12,
      requiredProgress: 100,
      realmLv: 1,
      grade: 'mortal',
      category: 'internal',
      createdAtTick: 10,
      updatedAtTick: 20,
    },
  ]);
  await service.savePlayerSnapshotProjectionDomains(playerId, seedSnapshot, ['technique']);

  let threwExpectedError = false;
  let errorMessage: string | null = null;
  try {
    await service.savePlayerSnapshotProjectionDomains(
      playerId,
      buildTechniqueProjectionSnapshot(
        playerId,
        [
          {
            techId: 'guard_unrelated_learned_technique',
            level: 1,
            exp: 0,
            expToNext: 100,
            realmLv: 1,
            skillsEnabled: true,
          },
        ],
        [],
      ),
      ['technique'],
    );
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    threwExpectedError = errorMessage.includes('replace_technique_comprehension_refused_empty_overwrite');
  }

  const techniqueComprehensionRows = await countDomainRows(pool, 'player_technique_comprehension', playerId);
  const result = {
    playerId,
    threwExpectedError,
    errorMessage,
    techniqueComprehensionRows,
    pendingPreserved: threwExpectedError && techniqueComprehensionRows === 1,
  };
  await cleanupPlayer(pool, playerId).catch(() => undefined);
  if (!result.pendingPreserved) {
    throw new Error(
      `unmatched comprehension prune was not blocked: errorMessage=${errorMessage ?? '<none>'} rows=${techniqueComprehensionRows}`,
    );
  }
  return result;
}

async function assertCompletedTechniqueComprehensionCanPrune(
  service: PlayerDomainPersistenceService,
  pool: Pool,
  playerId: string,
): Promise<CompletedComprehensionPruneResult> {
  await cleanupPlayer(pool, playerId);
  const pendingTechId = 'guard_completed_pending_technique';
  const seedSnapshot = buildTechniqueProjectionSnapshot(playerId, [], [
    {
      techId: pendingTechId,
      sourceKind: 'created',
      selfComprehensionAllowed: true,
      progress: 99,
      requiredProgress: 100,
      realmLv: 1,
      grade: 'mortal',
      category: 'internal',
      createdAtTick: 10,
      updatedAtTick: 20,
    },
  ]);
  await service.savePlayerSnapshotProjectionDomains(playerId, seedSnapshot, ['technique']);
  const seedPendingRows = await countDomainRows(pool, 'player_technique_comprehension', playerId);
  if (seedPendingRows !== 1) {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    throw new Error(`completed comprehension prune seed expected 1 pending row, got ${seedPendingRows}`);
  }

  const completedSnapshot = buildTechniqueProjectionSnapshot(
    playerId,
    [
      {
        techId: pendingTechId,
        level: 1,
        exp: 0,
        expToNext: 100,
        realmLv: 1,
        skillsEnabled: true,
      },
    ],
    [],
  );
  await service.savePlayerSnapshotProjectionDomains(playerId, completedSnapshot, ['technique']);

  const techniqueStateRows = await countDomainRows(pool, 'player_technique_state', playerId);
  const techniqueComprehensionRows = await countDomainRows(pool, 'player_technique_comprehension', playerId);
  const result = {
    playerId,
    techniqueStateRows,
    techniqueComprehensionRows,
    completedPendingDeleted: techniqueStateRows === 1 && techniqueComprehensionRows === 0,
  };
  await cleanupPlayer(pool, playerId).catch(() => undefined);
  if (!result.completedPendingDeleted) {
    throw new Error(
      `completed comprehension prune failed: techniqueStateRows=${techniqueStateRows} techniqueComprehensionRows=${techniqueComprehensionRows}`,
    );
  }
  return result;
}

function buildTechniqueProjectionSnapshot(
  playerId: string,
  techniques: unknown[],
  pendingComprehensions: unknown[],
): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: Date.now(),
    placement: {
      instanceId: `public:guard:${playerId}`,
      templateId: 'yunlai_town',
      x: 0,
      y: 0,
      facing: 1,
    },
    respawn: {
      instanceId: `public:guard:${playerId}`,
      templateId: 'yunlai_town',
      x: 0,
      y: 0,
      facing: 1,
    },
    vitals: { hp: 100, maxHp: 100, qi: 100, maxQi: 100 },
    progression: {
      foundation: 0,
      rootFoundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: [],
    inventory: { revision: 1, capacity: 20, items: [], lockedItems: [] },
    equipment: { revision: 1, slots: [] },
    artifacts: { revision: 0, slots: [] },
    techniques: {
      revision: 1,
      techniques,
      cultivatingTechId: techniques.length > 0 ? 'guard_completed_pending_technique' : null,
      pendingComprehensions,
    },
    buffs: { revision: 1, buffs: [] },
    quests: { revision: 1, entries: [] },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      autoRootFoundation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
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

async function countDomainRows(pool: Pool, tableName: string, playerId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS row_count FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`,
    [playerId],
  );
  const value = result.rows?.[0]?.row_count;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
