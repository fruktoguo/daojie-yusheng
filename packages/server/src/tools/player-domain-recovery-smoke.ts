import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { PlayerDomainPersistenceService, PLAYER_DOMAIN_PROJECTED_TABLES } from '../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { PlayerPersistenceService } from '../persistence/player-persistence.service';
import { WorldPlayerSnapshotService } from '../network/world-player-snapshot.service';

const databaseUrl = resolveServerDatabaseUrl();

const STARTER_TEMPLATE_ID = 'yunlai_town';
type ProjectedRecoverySnapshot = PersistedPlayerSnapshot & {
  marketStorage?: {
    items: unknown[];
  };
};

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下，snapshot 缺失时 WorldPlayerSnapshotService 会尝试从当前已落地的 player-domain 分域表回读重建 placement/vitals/progression core/body training 等已投影子域',
          excludes: '不证明玩家全域都已从分表回读；未投影子域仍不属于这条 recovery 证明范围',
          completionMapping: 'replace-ready:proof:with-db.player-domain-recovery',
        },
        null,
        2,
      ),
    );
    return;
  }

  const now = Date.now();
  const playerId = `pdr_${now.toString(36)}`;
  const presenceOnlyPlayerId = `${playerId}_presence`;
  const pool = new Pool({ connectionString: databaseUrl });
  const snapshotPersistence = new PlayerPersistenceService();
  const domainPersistence = new PlayerDomainPersistenceService();

  await snapshotPersistence.onModuleInit();
  await domainPersistence.onModuleInit();
  if (!snapshotPersistence.isEnabled() || !domainPersistence.isEnabled()) {
    throw new Error('player-domain-recovery dependencies not enabled');
  }

  try {
    await cleanupPlayer(pool, playerId);
    await cleanupPlayer(pool, presenceOnlyPlayerId);

    const originalSnapshot = buildSnapshot(now);
    await snapshotPersistence.savePlayerSnapshot(playerId, originalSnapshot, {
      persistedSource: 'native',
      seededAt: now,
    });
    await domainPersistence.savePlayerSnapshotProjection(playerId, originalSnapshot);

    const presenceNow = now + 1;
    await domainPersistence.savePlayerPresence(presenceOnlyPlayerId, {
      online: false,
      inWorld: false,
      lastHeartbeatAt: presenceNow,
      offlineSinceAt: presenceNow,
      runtimeOwnerId: null,
      sessionEpoch: 1,
      transferState: 'idle',
      transferTargetNodeId: null,
      versionSeed: presenceNow,
    });

    await pool.query('DELETE FROM server_player_snapshot WHERE player_id = $1', [playerId]);

    const snapshotService = new WorldPlayerSnapshotService(
      snapshotPersistence,
      domainPersistence,
      {
        buildStarterPersistenceSnapshot(targetPlayerId: string) {
          return buildStarterSnapshot(targetPlayerId);
        },
      },
    );

    const recovered = await snapshotService.loadPlayerSnapshotResult(playerId, 'proof:player-domain-recovery');
    if (!recovered.snapshot) {
      throw new Error(`expected projected snapshot recovery to succeed, got ${JSON.stringify(recovered)}`);
    }
    if (recovered.source !== 'mainline' || recovered.persistedSource !== 'native') {
      throw new Error(`unexpected projected snapshot source: ${JSON.stringify(recovered)}`);
    }
    if (recovered.fallbackReason !== 'proof:player-domain-recovery|player_domain_projection') {
      throw new Error(`unexpected projected snapshot fallbackReason: ${JSON.stringify(recovered)}`);
    }

    const snapshot = recovered.snapshot;
    assertProjectedSubsetParity(originalSnapshot, snapshot);
    if (snapshot.placement.templateId !== STARTER_TEMPLATE_ID || snapshot.placement.x !== 11 || snapshot.placement.facing !== 2) {
      throw new Error(`unexpected recovered placement: ${JSON.stringify(snapshot.placement)}`);
    }
    if (
      snapshot.vitals.hp !== 88
      || snapshot.vitals.maxHp !== 100
      || snapshot.vitals.qi !== 33
      || snapshot.vitals.maxQi !== 100
    ) {
      throw new Error(`unexpected recovered vitals: ${JSON.stringify(snapshot.vitals)}`);
    }
    if (
      snapshot.progression.foundation !== 2
      || snapshot.progression.combatExp !== 77
      || snapshot.progression.boneAgeBaseYears !== 18
      || snapshot.progression.lifeElapsedTicks !== 0
    ) {
      throw new Error(`unexpected recovered progression core: ${JSON.stringify(snapshot.progression)}`);
    }
    if (
      !snapshot.attrState
      || snapshot.attrState.baseAttrs?.['constitution'] !== 12
      || !Array.isArray(snapshot.attrState.revealedBreakthroughRequirementIds)
      || snapshot.attrState.revealedBreakthroughRequirementIds.length !== 2
      || snapshot.progression.realm?.['stage'] !== 'qi_refining'
      || snapshot.progression.heavenGate?.['averageBonus'] !== 12
      || snapshot.progression.spiritualRoots?.['metal'] !== 18
      || !Array.isArray(snapshot.runtimeBonuses)
      || snapshot.runtimeBonuses.length !== 1
    ) {
      throw new Error(`unexpected recovered attr state: ${JSON.stringify({
        attrState: snapshot.attrState,
        realm: snapshot.progression.realm,
        heavenGate: snapshot.progression.heavenGate,
        spiritualRoots: snapshot.progression.spiritualRoots,
        runtimeBonuses: snapshot.runtimeBonuses,
      })}`);
    }
    if (
      snapshot.progression.bodyTraining?.level !== 3
      || snapshot.progression.bodyTraining?.exp !== 9
      || snapshot.progression.bodyTraining?.expToNext !== 27
    ) {
      throw new Error(`unexpected recovered body training: ${JSON.stringify(snapshot.progression.bodyTraining)}`);
    }
    if (snapshot.inventory.items.length !== 2 || snapshot.inventory.items[0]?.['itemId'] !== 'rat_tail') {
      throw new Error(`unexpected recovered inventory: ${JSON.stringify(snapshot.inventory)}`);
    }
    const recoveredWalletBalances = Array.isArray(snapshot.wallet?.balances)
      ? snapshot.wallet.balances.map((entry) => ({
          walletType: String((entry as Record<string, unknown> | null | undefined)?.['walletType'] ?? ''),
          balance: Number((entry as Record<string, unknown> | null | undefined)?.['balance'] ?? 0),
          frozenBalance: Number((entry as Record<string, unknown> | null | undefined)?.['frozenBalance'] ?? 0),
        }))
      : [];
    if (
      recoveredWalletBalances.length !== 2
      || recoveredWalletBalances[0]?.walletType !== 'bound_gold'
      || recoveredWalletBalances[0]?.balance !== 9
      || recoveredWalletBalances[1]?.walletType !== 'spirit_stone'
      || recoveredWalletBalances[1]?.balance !== 123
    ) {
      throw new Error(`unexpected recovered wallet: ${JSON.stringify(snapshot.wallet)}`);
    }
    const recoveredMarketStorageItems = Array.isArray((snapshot as ProjectedRecoverySnapshot).marketStorage?.items)
      ? (snapshot as ProjectedRecoverySnapshot).marketStorage!.items.map((entry) => {
          const item = entry as Record<string, unknown> | null | undefined;
          return {
            storageItemId: String(item?.['storageItemId'] ?? ''),
            itemId: String(item?.['itemId'] ?? ''),
            count: Number(item?.['count'] ?? 0),
            slotIndex: Number(item?.['slotIndex'] ?? -1),
            enhanceLevel: Number(item?.['enhanceLevel'] ?? 0),
          };
        })
      : [];
    if (
      recoveredMarketStorageItems.length !== 2
      || recoveredMarketStorageItems[0]?.storageItemId !== 'storage:qi-pill'
      || recoveredMarketStorageItems[0]?.itemId !== 'qi_pill'
      || recoveredMarketStorageItems[1]?.storageItemId !== 'storage:furnace'
      || recoveredMarketStorageItems[1]?.itemId !== 'equip.copper_pill_furnace'
    ) {
      throw new Error(`unexpected recovered market storage: ${JSON.stringify((snapshot as ProjectedRecoverySnapshot).marketStorage)}`);
    }
    if (
      snapshot.unlockedMapIds.slice().sort().join(',') !== 'bamboo_forest,wildlands,yunlai_town'
    ) {
      throw new Error(`unexpected recovered map unlocks: ${JSON.stringify(snapshot.unlockedMapIds)}`);
    }
    const recoveredWeapon = snapshot.equipment.slots
      .map((entry) => entry as Record<string, unknown>)
      .find((entry) => entry?.slot === 'weapon')?.item as Record<string, unknown> | null | undefined;
    if (!recoveredWeapon || recoveredWeapon['itemId'] !== 'equip.copper_pill_furnace') {
      throw new Error(`unexpected recovered equipment: ${JSON.stringify(snapshot.equipment)}`);
    }
    if (
      snapshot.techniques.cultivatingTechId !== 'qi.breathing'
      || snapshot.techniques.techniques.length !== 2
      || String((snapshot.techniques.techniques[0] as Record<string, unknown>)?.techId ?? '') !== 'qi.breathing'
    ) {
      throw new Error(`unexpected recovered techniques: ${JSON.stringify(snapshot.techniques)}`);
    }
    if (
      !Array.isArray(snapshot.buffs?.buffs)
      || snapshot.buffs.buffs.length !== 1
      || snapshot.buffs.buffs[0]?.['buffId'] !== 'buff.qi_shield'
      || snapshot.buffs.buffs[0]?.['remainingTicks'] !== 15
    ) {
      throw new Error(`unexpected recovered buffs: ${JSON.stringify(snapshot.buffs)}`);
    }
    if (
      snapshot.quests.entries.length !== 1
      || String((snapshot.quests.entries[0] as Record<string, unknown>)?.id ?? '') !== 'quest.intro.begin'
      || String((snapshot.quests.entries[0] as Record<string, unknown>)?.status ?? '') !== 'in_progress'
    ) {
      throw new Error(`unexpected recovered quests: ${JSON.stringify(snapshot.quests)}`);
    }
    if (
      snapshot.combat.autoBattle !== true
      || snapshot.combat.autoBattleTargetingMode !== 'boss'
      || snapshot.combat.retaliatePlayerTargetId !== 'rival_alpha'
      || snapshot.combat.senseQiActive !== true
      || !Array.isArray(snapshot.combat.autoBattleSkills)
      || snapshot.combat.autoBattleSkills.length !== 2
      || !Array.isArray(snapshot.combat.autoUsePills)
      || snapshot.combat.autoUsePills.length !== 1
    ) {
      throw new Error(`unexpected recovered combat preferences: ${JSON.stringify(snapshot.combat)}`);
    }
    if (snapshot.progression.alchemySkill?.['level'] !== 4 || snapshot.progression.enhancementSkillLevel !== 3) {
      throw new Error(`unexpected recovered profession state: ${JSON.stringify(snapshot.progression)}`);
    }
    if (!Array.isArray(snapshot.progression.alchemyPresets) || snapshot.progression.alchemyPresets.length !== 1) {
      throw new Error(`unexpected recovered alchemy presets: ${JSON.stringify(snapshot.progression.alchemyPresets)}`);
    }
    if (
      !snapshot.progression.alchemyJob
      || snapshot.progression.alchemyJob['recipeId'] !== 'qi_pill'
      || snapshot.progression.alchemyJob['jobRunId'] !== 'job-run:alchemy:recovery'
      || Number(snapshot.progression.alchemyJob['jobVersion'] ?? 0) !== 5
    ) {
      throw new Error(`unexpected recovered active job: ${JSON.stringify(snapshot.progression.alchemyJob)}`);
    }
    if (
      !Array.isArray(snapshot.progression.enhancementRecords)
      || snapshot.progression.enhancementRecords.length !== 1
      || snapshot.progression.enhancementRecords[0]?.['itemId'] !== 'iron_sword'
      || Number(snapshot.progression.enhancementRecords[0]?.['highestLevel'] ?? 0) !== 4
    ) {
      throw new Error(`unexpected recovered enhancement records: ${JSON.stringify(snapshot.progression.enhancementRecords)}`);
    }
    if (snapshot.pendingLogbookMessages.length !== 1 || snapshot.pendingLogbookMessages[0]?.id !== 'log:1') {
      throw new Error(`unexpected recovered logbook messages: ${JSON.stringify(snapshot.pendingLogbookMessages)}`);
    }

    const presenceOnly = await snapshotService.loadPlayerSnapshotResult(
      presenceOnlyPlayerId,
      'proof:player-domain-presence-only',
    );
    if (presenceOnly.snapshot || presenceOnly.source !== 'miss') {
      throw new Error(`presence-only player should stay miss, got ${JSON.stringify(presenceOnly)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          answers: 'with-db 下 snapshot miss 已能从 player-domain 当前已落地的 anchor/checkpoint/vitals/progression core/attr/body training/inventory/map unlock/equipment/technique/persistent buff/quest/combat config/profession/preset/job/enhancement record/logbook 子域回读重建，并与旧整档快照当前已落地投影子集保持一致',
          excludes: '不证明未投影子域已迁出旧快照，也不证明玩家全域已经不再依赖 server_player_snapshot',
          completionMapping: 'replace-ready:proof:with-db.player-domain-recovery',
          source: recovered.source,
          persistedSource: recovered.persistedSource,
          fallbackReason: recovered.fallbackReason,
          projectedTables: PLAYER_DOMAIN_PROJECTED_TABLES.filter((tableName) => tableName !== 'player_presence'),
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await cleanupPlayer(pool, presenceOnlyPlayerId).catch(() => undefined);
    await pool.end().catch(() => undefined);
    await snapshotPersistence.onModuleDestroy().catch(() => undefined);
    await domainPersistence.onModuleDestroy().catch(() => undefined);
  }
}

function buildStarterSnapshot(playerId: string): ProjectedRecoverySnapshot {
  return {
    version: 1,
    savedAt: Date.now(),
    placement: {
      instanceId: `public:${STARTER_TEMPLATE_ID}`,
      templateId: STARTER_TEMPLATE_ID,
      x: 1,
      y: 1,
      facing: 1,
    },
    worldPreference: {
      linePreset: 'peaceful',
    },
    vitals: {
      hp: 100,
      maxHp: 100,
      qi: 0,
      maxQi: 100,
    },
    progression: {
      foundation: 0,
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
    attrState: {
      baseAttrs: {
        constitution: 6,
        spirit: 6,
        perception: 6,
        talent: 6,
        comprehension: 6,
        luck: 6,
      },
      revealedBreakthroughRequirementIds: [],
    },
    unlockedMapIds: [STARTER_TEMPLATE_ID],
    inventory: {
      revision: 1,
      capacity: 24,
      items: [],
    },
    wallet: {
      balances: [],
    },
    marketStorage: {
      items: [],
    },
    equipment: {
      revision: 1,
      slots: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    buffs: {
      revision: 1,
      buffs: [],
    },
    quests: {
      revision: 1,
      entries: [],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoBattleTargetingMode: 'auto',
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

function buildSnapshot(now: number): ProjectedRecoverySnapshot {
  return {
    ...buildStarterSnapshot(`starter:${now}`),
    savedAt: now,
    placement: {
      instanceId: `public:${STARTER_TEMPLATE_ID}`,
      templateId: STARTER_TEMPLATE_ID,
      x: 11,
      y: 22,
      facing: 2,
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
        jobRunId: 'job-run:alchemy:recovery',
        jobVersion: 5,
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
        narrative: 'player-domain recovery smoke',
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
        comprehension: 7,
        luck: 6,
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
    wallet: {
      balances: [
        { walletType: 'bound_gold', balance: 9, frozenBalance: 1 },
        { walletType: 'spirit_stone', balance: 123, frozenBalance: 7 },
      ],
    },
    marketStorage: {
      items: [
        {
          storageItemId: 'storage:qi-pill',
          itemId: 'qi_pill',
          count: 2,
          slotIndex: 0,
          enhanceLevel: null,
          rawPayload: { tag: 'recovery-proof' },
        },
        {
          storageItemId: 'storage:furnace',
          itemId: 'equip.copper_pill_furnace',
          count: 1,
          slotIndex: 1,
          enhanceLevel: 2,
          rawPayload: { quality: 'rare' },
        },
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
          conditions: [{ type: 'hp_below_ratio', value: 0.45 }],
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
        text: 'player-domain recovery smoke',
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

function assertProjectedSubsetParity(
  originalSnapshot: PersistedPlayerSnapshot,
  recoveredSnapshot: PersistedPlayerSnapshot,
): void {
  const originalSubset = {
    placement: originalSnapshot.placement,
    vitals: originalSnapshot.vitals,
    progressionCore: {
      foundation: originalSnapshot.progression.foundation,
      combatExp: originalSnapshot.progression.combatExp,
      boneAgeBaseYears: originalSnapshot.progression.boneAgeBaseYears,
      lifeElapsedTicks: originalSnapshot.progression.lifeElapsedTicks,
    },
    attrState: originalSnapshot.attrState,
    realm: originalSnapshot.progression.realm,
    heavenGate: originalSnapshot.progression.heavenGate,
    spiritualRoots: originalSnapshot.progression.spiritualRoots,
    bodyTraining: originalSnapshot.progression.bodyTraining,
    inventory: originalSnapshot.inventory.items.map((entry) => {
      const item = entry as Record<string, unknown> | null | undefined;
      return {
        itemId: String(item?.itemId ?? ''),
        count: Number(item?.count ?? 0),
      };
    }),
    wallet: normalizeComparableWallet((originalSnapshot as ProjectedRecoverySnapshot).wallet),
    marketStorage: normalizeComparableMarketStorage((originalSnapshot as ProjectedRecoverySnapshot).marketStorage),
    unlockedMapIds: originalSnapshot.unlockedMapIds.slice().sort(),
    equipment: normalizeComparableEquipment(originalSnapshot.equipment.slots),
    techniques: normalizeComparableTechniques(originalSnapshot.techniques),
    buffs: normalizeComparableBuffs(originalSnapshot.buffs.buffs),
    quests: normalizeComparableQuests(originalSnapshot.quests.entries),
    combat: normalizeComparableCombat(originalSnapshot.combat),
    alchemySkill: originalSnapshot.progression.alchemySkill,
    enhancementSkillLevel: originalSnapshot.progression.enhancementSkillLevel,
    enhancementRecords: normalizeComparableEnhancementRecords(originalSnapshot.progression.enhancementRecords),
    alchemyPresets: originalSnapshot.progression.alchemyPresets.map((entry) => ({
      presetId: String(entry?.['presetId'] ?? ''),
      recipeId: entry?.['recipeId'] ?? null,
      name: String(entry?.['name'] ?? ''),
      ingredients: Array.isArray(entry?.['ingredients'])
        ? entry['ingredients'].map((ingredient) => ({
            itemId: String((ingredient as Record<string, unknown>)?.['itemId'] ?? ''),
            count: Number((ingredient as Record<string, unknown>)?.['count'] ?? 0),
          }))
        : [],
    })),
    alchemyJob: normalizeComparableAlchemyJob(originalSnapshot.progression.alchemyJob),
    logbook: originalSnapshot.pendingLogbookMessages,
  };
  const recoveredSubset = {
    placement: recoveredSnapshot.placement,
    vitals: recoveredSnapshot.vitals,
    progressionCore: {
      foundation: recoveredSnapshot.progression.foundation,
      combatExp: recoveredSnapshot.progression.combatExp,
      boneAgeBaseYears: recoveredSnapshot.progression.boneAgeBaseYears,
      lifeElapsedTicks: recoveredSnapshot.progression.lifeElapsedTicks,
    },
    attrState: recoveredSnapshot.attrState,
    realm: recoveredSnapshot.progression.realm,
    heavenGate: recoveredSnapshot.progression.heavenGate,
    spiritualRoots: recoveredSnapshot.progression.spiritualRoots,
    bodyTraining: recoveredSnapshot.progression.bodyTraining,
    inventory: recoveredSnapshot.inventory.items.map((entry) => {
      const item = entry as Record<string, unknown> | null | undefined;
      return {
        itemId: String(item?.itemId ?? ''),
        count: Number(item?.count ?? 0),
      };
    }),
    wallet: normalizeComparableWallet((recoveredSnapshot as ProjectedRecoverySnapshot).wallet),
    marketStorage: normalizeComparableMarketStorage((recoveredSnapshot as ProjectedRecoverySnapshot).marketStorage),
    unlockedMapIds: recoveredSnapshot.unlockedMapIds.slice().sort(),
    equipment: normalizeComparableEquipment(recoveredSnapshot.equipment.slots),
    techniques: normalizeComparableTechniques(recoveredSnapshot.techniques),
    buffs: normalizeComparableBuffs(recoveredSnapshot.buffs.buffs),
    quests: normalizeComparableQuests(recoveredSnapshot.quests.entries),
    combat: normalizeComparableCombat(recoveredSnapshot.combat),
    alchemySkill: recoveredSnapshot.progression.alchemySkill,
    enhancementSkillLevel: recoveredSnapshot.progression.enhancementSkillLevel,
    enhancementRecords: normalizeComparableEnhancementRecords(recoveredSnapshot.progression.enhancementRecords),
    alchemyPresets: recoveredSnapshot.progression.alchemyPresets.map((entry) => ({
      presetId: String(entry?.['presetId'] ?? ''),
      recipeId: entry?.['recipeId'] ?? null,
      name: String(entry?.['name'] ?? ''),
      ingredients: Array.isArray(entry?.['ingredients'])
        ? entry['ingredients'].map((ingredient) => ({
            itemId: String((ingredient as Record<string, unknown>)?.['itemId'] ?? ''),
            count: Number((ingredient as Record<string, unknown>)?.['count'] ?? 0),
          }))
        : [],
    })),
    alchemyJob: normalizeComparableAlchemyJob(recoveredSnapshot.progression.alchemyJob),
    logbook: recoveredSnapshot.pendingLogbookMessages,
  };
  const normalizedOriginalSubset = normalizeComparableJson(originalSubset);
  const normalizedRecoveredSubset = normalizeComparableJson(recoveredSubset);
  if (JSON.stringify(normalizedRecoveredSubset) !== JSON.stringify(normalizedOriginalSubset)) {
    throw new Error(
      `expected projected snapshot subset parity with native snapshot, got ${JSON.stringify({
        originalSubset: normalizedOriginalSubset,
        recoveredSubset: normalizedRecoveredSubset,
      })}`,
    );
  }
}

function normalizeComparableWallet(wallet: unknown): Array<Record<string, unknown>> {
  const balances = Array.isArray((wallet as { balances?: unknown[] } | null | undefined)?.balances)
    ? (wallet as { balances: unknown[] }).balances
    : [];
  return balances
    .map((entry) => {
      const balance = entry as Record<string, unknown> | null | undefined;
      return {
        walletType: String(balance?.walletType ?? ''),
        balance: Number(balance?.balance ?? 0),
        frozenBalance: Number(balance?.frozenBalance ?? 0),
      };
    })
    .filter((entry) => entry.walletType.length > 0)
    .sort((left, right) => left.walletType.localeCompare(right.walletType, 'zh-Hans-CN'));
}

function normalizeComparableMarketStorage(marketStorage: unknown): Array<Record<string, unknown>> {
  const items = Array.isArray((marketStorage as { items?: unknown[] } | null | undefined)?.items)
    ? (marketStorage as { items: unknown[] }).items
    : [];
  return items
    .map((entry) => {
      const item = entry as Record<string, unknown> | null | undefined;
      return {
        storageItemId: String(item?.storageItemId ?? ''),
        itemId: String(item?.itemId ?? ''),
        count: Number(item?.count ?? 0),
        slotIndex: Number(item?.slotIndex ?? -1),
        enhanceLevel: item?.enhanceLevel == null ? null : Number(item.enhanceLevel),
      };
    })
    .filter((entry) => entry.storageItemId.length > 0 && entry.itemId.length > 0)
    .sort((left, right) => left.slotIndex - right.slotIndex || left.storageItemId.localeCompare(right.storageItemId, 'zh-Hans-CN'));
}

function normalizeComparableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeComparableJson(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((key) => [key, normalizeComparableJson(record[key])]),
  );
}

function normalizeComparableEquipment(slots: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(slots) ? slots : [])
    .map((entry) => {
      const slot = entry as Record<string, unknown> | null | undefined;
      const item = slot?.item as Record<string, unknown> | null | undefined;
      return {
        slot: String(slot?.slot ?? ''),
        itemId: item ? String(item.itemId ?? '') : null,
        count: item ? Number(item.count ?? 0) : null,
      };
    })
    .filter((entry) => entry.slot.length > 0 && typeof entry.itemId === 'string' && entry.itemId.length > 0)
    .sort((left, right) => left.slot.localeCompare(right.slot, 'zh-Hans-CN'));
}

function normalizeComparableBuffs(buffs: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(buffs) ? buffs : []).map((entry) => {
    const buff = entry as Record<string, unknown> | null | undefined;
    return {
      buffId: String(buff?.buffId ?? ''),
      sourceSkillId: String(buff?.sourceSkillId ?? ''),
      remainingTicks: Number(buff?.remainingTicks ?? 0),
      duration: Number(buff?.duration ?? 0),
      stacks: Number(buff?.stacks ?? 0),
      maxStacks: Number(buff?.maxStacks ?? 0),
      sustainTicksElapsed: Number(buff?.sustainTicksElapsed ?? 0),
    };
  });
}

function normalizeComparableTechniques(techniques: PersistedPlayerSnapshot['techniques']): Record<string, unknown> {
  return {
    cultivatingTechId: techniques.cultivatingTechId ?? null,
    techniques: (Array.isArray(techniques.techniques) ? techniques.techniques : [])
      .map((entry) => {
        const record = entry as Record<string, unknown> | null | undefined;
        return {
          techId: String(record?.techId ?? ''),
          level: Number(record?.level ?? 0),
          exp: Number(record?.exp ?? 0),
          expToNext: Number(record?.expToNext ?? 0),
          realmLv: Number(record?.realmLv ?? 0),
          skillsEnabled: record?.skillsEnabled !== false,
        };
      })
      .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN')),
  };
}

function normalizeComparableQuests(entries: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const record = entry as Record<string, unknown> | null | undefined;
      const progress = record?.progress as Record<string, unknown> | null | undefined;
      return {
        id: String(record?.id ?? record?.questId ?? ''),
        status: String(record?.status ?? ''),
        progress: progress ? { ...progress } : {},
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
}

function normalizeComparableEnhancementRecords(entries: unknown[]): Array<Record<string, unknown>> {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const record = entry as Record<string, unknown> | null | undefined;
    return {
      recordId: String(record?.recordId ?? ''),
      itemId: String(record?.itemId ?? ''),
      highestLevel: Number(record?.highestLevel ?? 0),
      levels: Array.isArray(record?.levels)
        ? record.levels.map((level) => ({
            targetLevel: Number((level as Record<string, unknown>)?.targetLevel ?? 0),
            successCount: Number((level as Record<string, unknown>)?.successCount ?? 0),
            failureCount: Number((level as Record<string, unknown>)?.failureCount ?? 0),
          }))
        : [],
      actionStartedAt: Number(record?.actionStartedAt ?? 0),
      actionEndedAt: Number(record?.actionEndedAt ?? 0),
      startLevel: Number(record?.startLevel ?? 0),
      initialTargetLevel: Number(record?.initialTargetLevel ?? 0),
      desiredTargetLevel: Number(record?.desiredTargetLevel ?? 0),
      protectionStartLevel: Number(record?.protectionStartLevel ?? 0),
      status: String(record?.status ?? ''),
    };
  });
}

function normalizeComparableCombat(combat: PersistedPlayerSnapshot['combat']): Record<string, unknown> {
  const targetingRules = combat.combatTargetingRules
    ? {
        hostile: Array.isArray(combat.combatTargetingRules.hostile) ? [...combat.combatTargetingRules.hostile] : [],
        friendly: Array.isArray(combat.combatTargetingRules.friendly) ? [...combat.combatTargetingRules.friendly] : [],
        includeNormalMonsters: combat.combatTargetingRules.includeNormalMonsters === true,
        includeEliteMonsters: combat.combatTargetingRules.includeEliteMonsters === true,
        includeBosses: combat.combatTargetingRules.includeBosses === true,
        includePlayers: combat.combatTargetingRules.includePlayers === true,
      }
    : null;
  return {
    autoBattle: combat.autoBattle,
    autoRetaliate: combat.autoRetaliate,
    autoBattleStationary: combat.autoBattleStationary,
    autoBattleTargetingMode: combat.autoBattleTargetingMode ?? null,
    retaliatePlayerTargetId: combat.retaliatePlayerTargetId ?? null,
    combatTargetId: combat.combatTargetId ?? null,
    combatTargetLocked: combat.combatTargetLocked,
    allowAoePlayerHit: combat.allowAoePlayerHit,
    autoIdleCultivation: combat.autoIdleCultivation,
    autoSwitchCultivation: combat.autoSwitchCultivation,
    senseQiActive: combat.senseQiActive,
    combatTargetingRules: targetingRules,
    autoBattleSkills: (Array.isArray(combat.autoBattleSkills) ? combat.autoBattleSkills : [])
      .map((entry) => {
        const record = entry as Record<string, unknown> | null | undefined;
        return {
          skillId: String(record?.skillId ?? ''),
          enabled: record?.enabled !== false,
          skillEnabled: record?.skillEnabled !== false,
          autoBattleOrder: Number(record?.autoBattleOrder ?? 0),
        };
      })
      .sort((left, right) => left.autoBattleOrder - right.autoBattleOrder || left.skillId.localeCompare(right.skillId, 'zh-Hans-CN')),
    autoUsePills: (Array.isArray(combat.autoUsePills) ? combat.autoUsePills : [])
      .map((entry) => {
        const record = entry as Record<string, unknown> | null | undefined;
        return {
          itemId: String(record?.itemId ?? ''),
          conditions: Array.isArray(record?.conditions) ? record.conditions.map((condition) => ({ ...(condition as Record<string, unknown>) })) : [],
        };
      })
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
  };
}

function normalizeComparableAlchemyJob(job: unknown): Record<string, unknown> | null {
  if (!job || typeof job !== 'object') {
    return null;
  }
  const record = job as Record<string, unknown>;
  return {
    jobRunId: record.jobRunId ?? null,
    jobVersion: record.jobVersion ?? null,
    phase: record.phase ?? null,
    startedAt: record.startedAt ?? null,
    totalTicks: record.totalTicks ?? null,
    remainingTicks: record.remainingTicks ?? null,
    pausedTicks: record.pausedTicks ?? null,
    successRate: record.successRate ?? null,
    totalSpeedRate: record.totalSpeedRate ?? null,
    recipeId: record.recipeId ?? null,
    outputItemId: record.outputItemId ?? null,
    quantity: record.quantity ?? null,
  };
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM server_player_snapshot WHERE player_id = $1', [playerId]);
    for (const tableName of PLAYER_DOMAIN_PROJECTED_TABLES) {
      await client.query(`DELETE FROM ${quoteIdentifier(tableName)} WHERE player_id = $1`, [playerId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
