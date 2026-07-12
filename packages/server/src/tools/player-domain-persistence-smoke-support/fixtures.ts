import type { PlayerActiveJobUpsertInput } from '../../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../../persistence/player-persistence.service';

export function buildSnapshotWithOnlyActiveJob(
  jobType: PlayerActiveJobUpsertInput['jobType'],
  now: number,
  jobRunId: string,
  jobVersion: number,
): PersistedPlayerSnapshot {
  const snapshot = buildStarterSnapshotForProjectedActiveJob(now);
  const progression = snapshot.progression as unknown as Record<string, unknown>;
  const commonJob = {
    jobRunId,
    jobType,
    jobVersion,
    phase: jobType === 'formation' ? 'maintaining' : 'running',
    startedAt: now,
    totalTicks: 40 + (jobVersion - 200),
    remainingTicks: 20 + (jobVersion - 200),
    pausedTicks: jobVersion - 200,
    successRate: 0.5,
    totalSpeedRate: 1.25,
    targetId: `target:${jobType}`,
  };

  if (jobType === 'formation') {
    progression.formationJob = {
      ...commonJob,
      maintenanceRate: 1.5,
      formationId: 'formation:active-job-smoke',
    };
    return snapshot;
  }
  if (jobType === 'mining') {
    progression.miningJob = {
      ...commonJob,
      baseDamagePerTick: 3,
      tileKey: 'mine:1:2',
    };
    return snapshot;
  }
  if (jobType === 'gather') {
    progression.gatherJob = {
      ...commonJob,
      containerId: 'loot:active-job-smoke',
    };
    return snapshot;
  }
  if (jobType === 'building') {
    progression.buildingJob = {
      ...commonJob,
      buildingId: 'building:active-job-smoke',
    };
    return snapshot;
  }
  if (jobType === 'enhancement') {
    progression.enhancementJob = {
      ...commonJob,
      targetItemId: 'iron_sword',
      currentLevel: 2,
      targetLevel: 3,
    };
    return snapshot;
  }
  if (jobType === 'forging') {
    progression.forgingJob = {
      ...commonJob,
      recipeId: 'forge_active_job_smoke',
      outputItemId: 'forge_active_job_smoke',
    };
    return snapshot;
  }

  progression.alchemyJob = {
    ...commonJob,
    recipeId: 'alchemy_active_job_smoke',
    outputItemId: 'alchemy_active_job_smoke',
  };
  return snapshot;
}

export function buildStarterSnapshotForProjectedActiveJob(now: number): PersistedPlayerSnapshot {
  const snapshot = buildSnapshot(now);
  snapshot.progression.alchemyJob = null;
  snapshot.progression.forgingJob = null;
  snapshot.progression.enhancementJob = null;
  snapshot.progression.gatherJob = null;
  snapshot.progression.miningJob = null;
  snapshot.progression.buildingJob = null;
  snapshot.progression.formationJob = null;
  return snapshot;
}

export function buildSnapshot(now: number): PersistedPlayerSnapshot {
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
      buildingSkill: {
        level: 1,
        exp: 0,
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
    artifacts: {
      revision: 0,
      slots: [],
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
          learnTechniqueMaxLevel: 2,
        },
      ],
      cultivatingTechId: 'qi.breathing',
      pendingComprehensions: [
        {
          techId: 'gen.pending_self',
          name: '待悟自创功法',
          sourceKind: 'created',
          creatorPlayerId: 'creator:pending_self',
          selfComprehensionAllowed: false,
          progress: 7,
          requiredProgress: 300,
          realmLv: 1,
          grade: 'mortal',
          category: 'internal',
          createdAtTick: 11,
          updatedAtTick: 22,
          activeTransferJob: {
            jobId: 'legacy-transfer-should-not-persist',
            teacherPlayerId: 'teacher:legacy',
            startedAtTick: 11,
            status: 'running',
            range: 2,
          },
        },
      ],
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
        {
          id: 'quest.intro.done',
          status: 'completed',
          progress: {
            kills: 5,
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
      retaliatePlayerTargetLastAttackTick: 3456,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      autoRootFoundation: true,
      combatAttackIntensity: 12,
      senseQiActive: true,
      cultivationActive: true,
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
      {
        source: 'equip-effect:accessory:equip.sealed_path_token:sealed-path-march',
        label: '+20 封路令:sealed-path-march',
        stats: {
          realmExpPerTick: 7,
          techniqueExpPerTick: 14,
        },
      },
      {
        source: 'equipment:accessory',
        stats: {
          realmExpPerTick: 13.46,
        },
      },
      {
        source: 'body_training:aggregate',
        attrs: {
          constitution: 12,
        },
      },
    ],
  };
}

export function buildEnhancementSnapshot(now: number): PersistedPlayerSnapshot {
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

export function buildMalformedProjectionSnapshot(now: number): PersistedPlayerSnapshot {
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
