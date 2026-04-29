import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { WorldPlayerSnapshotService } from '../network/world-player-snapshot.service';
import { WorldSessionBootstrapService } from '../network/world-session-bootstrap.service';
import { WorldSessionBootstrapSnapshotService } from '../network/world-session-bootstrap-snapshot.service';

installSmokeTimeout(__filename);

function buildStarterSnapshot(playerId: string): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt: Date.now(),
    placement: {
      instanceId: 'public:yunlai_town',
      templateId: 'yunlai_town',
      x: 10,
      y: 10,
      facing: 2,
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
      enhancementSkillLevel: 0,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    attrState: null,
    runtimeBonuses: [],
    inventory: {
      revision: 1,
      capacity: 24,
      items: [],
    },
    wallet: {
      balances: [],
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
    unlockedMapIds: ['yunlai_town'],
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      autoUsePills: [],
      combatTargetingRules: undefined,
      autoBattleTargetingMode: 'auto',
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoBattleSkills: [],
    },
    worldPreference: {
      linePreset: 'peaceful',
    },
    pendingLogbookMessages: [],
  };
}

function createBootstrapService(loadProjectedSnapshot: (
  playerId: string,
  buildStarter: (playerId: string) => PersistedPlayerSnapshot | null,
) => Promise<PersistedPlayerSnapshot | null>, nativeSectId: string | null = null) {
  const worldPlayerSnapshotService = new WorldPlayerSnapshotService(
    {
      isEnabled() {
        return true;
      },
      loadProjectedSnapshot,
    } as never,
    {
      buildStarterPersistenceSnapshot(playerId: string) {
        return buildStarterSnapshot(playerId);
      },
    } as never,
  );
  const snapshotBootstrapService = new WorldSessionBootstrapSnapshotService(
    null,
    worldPlayerSnapshotService,
    null,
    null,
  );
  return new WorldSessionBootstrapService(
    {} as never,
    worldPlayerSnapshotService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    null,
    null,
    null,
    snapshotBootstrapService,
    null,
    null,
    null,
    null,
  );
}

async function main(): Promise<void> {
  const projectionBootstrapService = createBootstrapService(async (playerId, buildStarter) => {
    const starter = buildStarter(playerId);
    assert.ok(starter, 'expected starter snapshot');
    return {
      ...starter,
      placement: {
        ...starter.placement,
        instanceId: 'public:projected_recovery_map',
        templateId: 'projected_recovery_map',
        x: 21,
        y: 9,
      },
    };
  });
  const projectionResult = await projectionBootstrapService.loadPlayerSnapshotWithTrace(
    'player:bootstrap-facade-trace-projection',
    'proof:bootstrap-facade-trace',
  );
  assert.ok(projectionResult.snapshot, 'expected projected snapshot from bootstrap facade');
  assert.equal(projectionResult.source, 'mainline');
  assert.equal(projectionResult.persistedSource, 'native');
  assert.equal(projectionResult.fallbackReason, 'proof:bootstrap-facade-trace|player_domain_projection');
  assert.equal(projectionResult.snapshot?.placement.templateId, 'projected_recovery_map');
  assert.equal(projectionResult.snapshot?.sectId, undefined);

  const missBootstrapService = createBootstrapService(async () => null);
  const missResult = await missBootstrapService.loadPlayerSnapshotWithTrace(
    'player:bootstrap-facade-trace-miss',
    'proof:bootstrap-facade-trace-miss',
  );
  assert.equal(missResult.snapshot, null);
  assert.equal(missResult.source, 'miss');
  assert.equal(missResult.persistedSource, null);
  assert.equal(missResult.fallbackReason, 'proof:bootstrap-facade-trace-miss');

  console.log(JSON.stringify({
    ok: true,
    answers: 'WorldSessionBootstrapService.loadPlayerSnapshotWithTrace 现在已由 focused smoke 直接证明：最外层 bootstrap facade 在 projection hit 时会保留 player_domain_projection 追加后的 fallbackReason，在 projection miss 时会保留原始 fallbackReason 并返回 miss。',
    excludes: '不证明 hydrateFromSnapshot 已改成直接逐域装配。',
    projectionResult: {
      source: projectionResult.source,
      persistedSource: projectionResult.persistedSource,
      fallbackReason: projectionResult.fallbackReason,
      templateId: projectionResult.snapshot?.placement.templateId ?? null,
    },
    missResult: {
      source: missResult.source,
      persistedSource: missResult.persistedSource,
      fallbackReason: missResult.fallbackReason,
    },
    completionMapping: 'replace-ready:proof:stage5.bootstrap-facade-snapshot-trace-boundary',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
