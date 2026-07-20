import assert from 'node:assert/strict';
import { C2S } from '@mud/shared';
import * as playerDomainPersistence from '../persistence/player-domain-persistence.service';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../runtime/craft/pipeline/strategies/transmission.strategy';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000020:PASS';
const TECHNIQUE_ID = 'gen_issue_000020';

function createTechnique() {
  return {
    techId: TECHNIQUE_ID,
    name: '传法清理验证功法',
    level: 1,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    realm: 'perfection',
    grade: 'mortal',
    category: 'internal',
    skillsEnabled: true,
    skills: [],
    layers: [{ level: 1, expToNext: 0, attrs: {} }],
  };
}

function createPlayer(playerId: string, x: number, y: number) {
  return {
    playerId,
    displayName: playerId,
    instanceId: 'instance:issue-000020',
    templateId: 'map:issue-000020',
    x,
    y,
    facing: 1,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    foundation: 0,
    combatExp: 0,
    lifeElapsedTicks: 1,
    realm: { realmLv: 1, stage: 'mortal', progress: 0, progressToNext: 100, breakthroughReady: false },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    pendingTechniqueComprehensions: [],
    transmissionSkill: { level: 1, exp: 0, expToNext: 60 },
    transmissionJob: null,
    combat: { cultivationActive: false, autoSwitchCultivation: false, autoBattleSkills: [] },
    notices: { nextId: 1, queue: [] },
    actions: { revision: 1, actions: [], contextActions: [] },
    attrs: {
      revision: 1,
      baseAttrs: {},
      finalAttrs: {},
      numericStats: { realmExpPerTick: 0, techniqueExpPerTick: 0, playerExpRate: 0, techniqueExpRate: 0 },
      ratioDivisors: {},
    },
    buffs: { revision: 1, buffs: [] },
    quests: { revision: 1, quests: [] },
    inventory: { revision: 1, capacity: 30, items: [], lockedItems: [] },
    equipment: { revision: 1, slots: [] },
    artifacts: { revision: 1, slots: [] },
    unlockedMapIds: [],
    pendingLogbookMessages: [],
    runtimeBonuses: [],
    dirtyDomains: new Set<string>(),
    persistentRevision: 0,
  };
}

function createRuntime() {
  const technique = createTechnique();
  const contentTemplateRepository = {
    createTechniqueState(techId: string) {
      return techId === technique.techId
        ? { ...technique, layers: technique.layers.map((layer) => ({ ...layer })) }
        : null;
    },
    getItemName() {
      return null;
    },
    normalizeItem(item: unknown) {
      return item;
    },
  };
  const playerAttributesService = {
    recalculate() {
      return true;
    },
    markPanelDirty() {},
  };
  const runtimeService = new PlayerRuntimeService(
    contentTemplateRepository as never,
    null as never,
    playerAttributesService as never,
    { refreshPreview() {} } as never,
  );
  const teacher = createPlayer('teacher:issue-000020', 0, 0);
  const learner = createPlayer('learner:issue-000020', 0, 1);
  teacher.techniques.techniques.push(technique as never);
  runtimeService.players.set(teacher.playerId, teacher as never);
  runtimeService.players.set(learner.playerId, learner as never);

  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new TransmissionStrategy());
  const ctx = {
    contentTemplateRepository,
    resolveExpToNextByLevel: () => 60,
    getInstanceRuntime: () => null,
    deps: {
      playerRuntimeService: runtimeService,
      getInstanceRuntime: () => null,
      refreshPlayerContextActions() {},
    },
  };
  return { runtimeService, pipeline, ctx, teacher, learner };
}

function main(): void {
  const { runtimeService, pipeline, ctx, teacher, learner } = createRuntime();
  const startResult = pipeline.start(learner, 'transmission', {
    learnerPlayerId: learner.playerId,
    teacherPlayerId: teacher.playerId,
    techniqueId: TECHNIQUE_ID,
  }, ctx as never);
  assert.equal(startResult.ok, true, startResult.error);
  assert.equal(learner.pendingTechniqueComprehensions.length, 1);

  teacher.x = 10;
  pipeline.tick(learner, 'transmission', ctx as never);
  assert.equal(learner.transmissionJob?.status, 'blocked');

  const discard = (runtimeService as unknown as {
    discardPendingTechniqueComprehension?: (playerId: string, techniqueId: string) => string;
  }).discardPendingTechniqueComprehension;
  assert.equal(typeof discard, 'function', '生产运行时缺少未领悟功法放弃能力');
  assert.throws(
    () => discard.call(runtimeService, learner.playerId, TECHNIQUE_ID),
    /先取消|进行中/,
    '进行中的传法 job 不得被旁路删除',
  );

  const cancelResult = pipeline.cancel(learner, 'transmission', ctx as never);
  assert.equal(cancelResult.ok, true, cancelResult.error);
  assert.equal(learner.transmissionJob, null);
  assert.equal(learner.pendingTechniqueComprehensions.length, 1, '取消传法必须继续保留已有领悟进度');

  const removedName = discard.call(runtimeService, learner.playerId, TECHNIQUE_ID);
  assert.equal(removedName, '传法清理验证功法');
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.dirtyDomains.has('technique'), true);
  assert.equal((learner as { allowPendingTechniqueComprehensionEmptyOverwrite?: boolean }).allowPendingTechniqueComprehensionEmptyOverwrite, true);

  runtimeService.markPersistenceDirtyDomains(learner as never, ['technique']);
  const coalescedTechniqueRevision = runtimeService.getPersistenceDomainRevision(learner.playerId, 'technique');
  const coalescedSnapshot = runtimeService.buildPersistenceSnapshot(learner.playerId, new Set(['technique']));
  assert.equal(
    coalescedSnapshot?.techniques.allowPendingComprehensionEmptyOverwrite,
    true,
    '放弃最后一条 pending 的授权必须跨越后续 technique 修订与 ledger 合并窗口',
  );
  assert.deepEqual(
    coalescedSnapshot?.techniques.pendingComprehensionEmptyOverwriteTechIds,
    [TECHNIQUE_ID],
    '空删除授权必须绑定本次明确放弃的功法 ID',
  );
  runtimeService.markPersistenceDomainsPersistedByRevision(
    learner.playerId,
    new Map([['technique', coalescedTechniqueRevision ?? 0]]),
    runtimeService.getPersistenceRevision(learner.playerId) ?? 0,
    'issue-000020-proof',
  );
  const persistedSnapshot = runtimeService.buildPersistenceSnapshot(learner.playerId, new Set(['technique']));
  assert.equal(
    persistedSnapshot?.techniques.allowPendingComprehensionEmptyOverwrite,
    false,
    '对应 technique 修订落库后必须撤销一次性空删除授权',
  );

  const canPruneEmpty = (playerDomainPersistence as unknown as {
    canPruneEmptyTechniqueComprehensions?: (
      existingTechniqueIds: readonly string[],
      completedTechniqueIds: ReadonlySet<string> | undefined,
      allowExplicitEmptyOverwrite: boolean,
      explicitlyRemovedTechniqueIds?: ReadonlySet<string>,
    ) => boolean;
  }).canPruneEmptyTechniqueComprehensions;
  assert.equal(typeof canPruneEmpty, 'function', '持久化层缺少显式放弃的窄范围空表清理策略');
  assert.equal(canPruneEmpty(['gen_other'], new Set(), false), false, '普通空快照仍必须触发防误删守卫');
  assert.equal(canPruneEmpty([TECHNIQUE_ID], new Set(), true), true, '显式放弃必须允许删除最后一条 pending 真源');
  assert.equal(
    canPruneEmpty(['gen_other'], new Set(), true, new Set([TECHNIQUE_ID])),
    false,
    '精确放弃授权不得删除其他 pending 功法真源',
  );
  assert.equal(
    canPruneEmpty([TECHNIQUE_ID], new Set(), true, new Set([TECHNIQUE_ID])),
    true,
    '精确放弃授权必须允许删除匹配的 pending 功法真源',
  );
  assert.equal(typeof (C2S as unknown as Record<string, unknown>).DiscardTechniqueComprehension, 'string');

  console.log(MARKER);
}

main();
