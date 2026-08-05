import assert from 'node:assert/strict';
import {
  TECHNIQUE_ATTR_KEYS,
  TechniqueRealm,
  calcTechniqueAttrValues,
  calcTechniqueMaxAttrPercentBonus,
  calculateTechniqueComprehensionRequiredProgress,
  getTechniqueMaxLevel,
  getTechniqueTrainingMaxLevel,
  normalizeTechniqueLearnMaxLevel,
  type TechniqueAggregationMetadata,
  type TechniqueGrade,
  type TechniqueState,
  type TechniqueTemplate,
} from '@mud/shared';
import { TechniqueAggregationService } from '../runtime/technique-generation/technique-aggregation.service';
import { resolvePersistedTechniqueAggregationMetadata } from '../runtime/technique-generation/generated-technique-store.service';
import { TransmissionStrategy } from '../runtime/craft/pipeline/strategies/transmission.strategy';

type PublishedAggregateParams = {
  id: string;
  template: TechniqueTemplate;
  createdByPlayerId: string;
};

class FakeGeneratedTechniqueStore {
  private readonly templates = new Map<string, TechniqueTemplate>();
  private readonly creators = new Map<string, string>();
  private readonly aggregateMetadata = new Map<string, TechniqueAggregationMetadata>();
  private readonly jadeItemCounts = new Map<string, number>();
  private readonly jadeOperations = new Map<string, { techniqueId: string; requestFingerprint: string }>();
  listAggregateMetadataCallCount = 0;
  jadePublishCommitCount = 0;

  register(template: TechniqueTemplate, creatorPlayerId: string): void {
    this.templates.set(template.id, structuredClone(template));
    this.creators.set(template.id, creatorPlayerId);
    const metadata = resolvePersistedTechniqueAggregationMetadata(template, creatorPlayerId);
    if (metadata) this.aggregateMetadata.set(template.id, metadata);
  }

  getById(id: string): TechniqueTemplate | undefined {
    const template = this.templates.get(id);
    return template ? structuredClone(template) : undefined;
  }

  getCreatorPlayerId(id: string): string | undefined {
    return this.creators.get(id);
  }

  getAggregateMetadata(id: string): TechniqueAggregationMetadata | undefined {
    return this.aggregateMetadata.get(id);
  }

  listAggregateMetadata(): Array<{ techniqueId: string; metadata: TechniqueAggregationMetadata }> {
    this.listAggregateMetadataCallCount += 1;
    return [...this.aggregateMetadata.entries()].map(([techniqueId, metadata]) => ({ techniqueId, metadata }));
  }

  getLatestAggregateForFamily(familyId: string): {
    techniqueId: string;
    template: TechniqueTemplate;
    metadata: TechniqueAggregationMetadata;
  } | undefined {
    const latest = this.listAggregateMetadata()
      .filter((entry) => entry.metadata.familyId === familyId)
      .sort((left, right) => right.metadata.revision - left.metadata.revision)[0];
    if (!latest) return undefined;
    const template = this.getById(latest.techniqueId);
    return template ? { techniqueId: latest.techniqueId, template, metadata: latest.metadata } : undefined;
  }

  async publishAggregate(params: PublishedAggregateParams): Promise<'inserted' | 'existing'> {
    if (this.templates.has(params.id)) return 'existing';
    this.register(params.template, params.createdByPlayerId);
    return 'inserted';
  }

  setJadeItemCount(playerId: string, count: number): void {
    this.jadeItemCounts.set(playerId, Math.max(0, Math.trunc(count)));
  }

  async publishJadeAggregate(params: PublishedAggregateParams & {
    playerId: string;
    operationId: string;
    requestFingerprint: string;
  }) {
    const operationKey = `${params.playerId}\u0000${params.operationId}`;
    const existing = this.jadeOperations.get(operationKey);
    if (existing) {
      if (existing.techniqueId !== params.id || existing.requestFingerprint !== params.requestFingerprint) {
        throw new Error('technique_aggregation_jade_operation_replay_identity_conflict');
      }
      return {
        ok: true as const,
        alreadyCommitted: true,
        inventoryItems: this.buildJadeInventory(params.playerId),
      };
    }
    const itemCount = this.jadeItemCounts.get(params.playerId) ?? 0;
    if (itemCount < 1) {
      return {
        ok: false as const,
        alreadyCommitted: false,
        inventoryItems: [],
        errorCode: 'ITEM_NOT_ENOUGH' as const,
      };
    }
    if (this.templates.has(params.id)) throw new Error('technique_aggregation_jade_operation_missing');
    this.jadeItemCounts.set(params.playerId, itemCount - 1);
    this.register(params.template, params.createdByPlayerId);
    this.jadeOperations.set(operationKey, {
      techniqueId: params.id,
      requestFingerprint: params.requestFingerprint,
    });
    this.jadePublishCommitCount += 1;
    return {
      ok: true as const,
      alreadyCommitted: false,
      inventoryItems: this.buildJadeInventory(params.playerId),
    };
  }

  private buildJadeInventory(playerId: string) {
    const count = this.jadeItemCounts.get(playerId) ?? 0;
    return count > 0 ? [{
      itemId: 'wudao_yujian',
      itemInstanceId: `jade:${playerId}`,
      count,
      slotIndex: 0,
      rawPayload: { itemId: 'wudao_yujian', count },
    }] : [];
  }
}

function createSourceTemplate(
  id: string,
  name: string,
  options: {
    grade?: TechniqueGrade;
    category?: TechniqueTemplate['category'];
    budgetPercent?: number;
    expToNext: number;
    constitutionPerLayer: number;
  },
): TechniqueTemplate {
  return {
    id,
    name,
    grade: options.grade ?? 'mortal',
    category: options.category ?? 'internal',
    realmLv: 1,
    budgetPercent: options.budgetPercent ?? 1,
    maxLayer: 2,
    layers: [
      {
        level: 1,
        expToNext: options.expToNext,
        attrs: { constitution: options.constitutionPerLayer },
      },
      {
        level: 2,
        expToNext: 0,
        attrs: { constitution: options.constitutionPerLayer },
      },
    ],
    skills: [],
  };
}

function toRuntimeTechnique(template: TechniqueTemplate, level = getTechniqueMaxLevel(template.layers as never, 1)): TechniqueState {
  const layers = structuredClone(template.layers) as TechniqueState['layers'];
  const maxLevel = getTechniqueMaxLevel(layers, 1);
  return {
    techId: template.id,
    name: template.name,
    level,
    exp: 0,
    expToNext: level >= maxLevel ? 0 : Number(layers?.[level - 1]?.expToNext ?? 0),
    realmLv: template.realmLv,
    realm: level >= maxLevel ? TechniqueRealm.Perfection : TechniqueRealm.Entry,
    skillsEnabled: true,
    skills: [],
    grade: template.grade,
    category: template.category,
    layers,
  };
}

function createPlayer(playerId: string, techniques: TechniqueState[], jadeItemCount = 0) {
  return {
    playerId,
    realm: { realmLv: 1 },
    transmissionSkill: { level: 1 },
    techniques: {
      revision: 1,
      techniques,
      cultivatingTechId: techniques[0]?.techId ?? null,
    },
    pendingTechniqueComprehensions: [] as Array<Record<string, unknown>>,
    transmissionJob: null,
    inventory: {
      revision: 1,
      items: jadeItemCount > 0 ? [{
        itemId: 'wudao_yujian',
        itemInstanceId: `jade:${playerId}`,
        count: jadeItemCount,
        slotIndex: 0,
      }] : [],
    },
  };
}

async function main(): Promise<void> {
  const unsortedLayers = [
    { level: 3, expToNext: 0, attrs: {} },
    { level: 1, expToNext: 10, attrs: {} },
    { level: 2, expToNext: 20, attrs: {} },
  ];
  assert.equal(getTechniqueMaxLevel(unsortedLayers, 1), 3);
  assert.equal(getTechniqueTrainingMaxLevel({
    level: 1,
    layers: unsortedLayers,
    learnTechniqueMaxLevel: 2,
  }), 2);
  assert.equal(normalizeTechniqueLearnMaxLevel(3, unsortedLayers, 1), undefined);

  const creatorPlayerId = 'player:aggregation-creator';
  const collaboratorPlayerId = 'player:aggregation-collaborator';
  const store = new FakeGeneratedTechniqueStore();
  const sourceA = createSourceTemplate('gen_aggregation_a', '归元诀', {
    budgetPercent: 0.8,
    expToNext: 100,
    constitutionPerLayer: 10,
  });
  const sourceB = createSourceTemplate('gen_aggregation_b', '守一功', {
    budgetPercent: 1.2,
    expToNext: 300,
    constitutionPerLayer: 20,
  });
  const sourceC = createSourceTemplate('gen_aggregation_c', '抱朴经', {
    expToNext: 200,
    constitutionPerLayer: 30,
  });
  const mismatchedGrade = createSourceTemplate('gen_aggregation_yellow', '黄阶试法', {
    grade: 'yellow',
    expToNext: 100,
    constitutionPerLayer: 10,
  });
  const artsSource = createSourceTemplate('gen_aggregation_arts', '试法术', {
    category: 'arts',
    expToNext: 100,
    constitutionPerLayer: 10,
  });
  const collaborationA = createSourceTemplate('gen_collaboration_a', '两仪真诀', {
    expToNext: 120,
    constitutionPerLayer: 11,
  });
  const collaborationB = createSourceTemplate('gen_collaboration_b', '太和内经', {
    expToNext: 180,
    constitutionPerLayer: 13,
  });
  const collaborationC = createSourceTemplate('gen_collaboration_c', '同参玄功', {
    expToNext: 160,
    constitutionPerLayer: 17,
  });
  const jadeSourceA = createSourceTemplate('gen_jade_aggregation_a', '清虚内经', {
    expToNext: 120,
    constitutionPerLayer: 12,
  });
  const jadeSourceB = createSourceTemplate('gen_jade_aggregation_b', '太素玄功', {
    expToNext: 180,
    constitutionPerLayer: 18,
  });
  const jadeSourceC = createSourceTemplate('gen_jade_aggregation_c', '养一道典', {
    expToNext: 160,
    constitutionPerLayer: 16,
  });
  for (const template of [sourceA, sourceB, sourceC, mismatchedGrade, artsSource]) {
    store.register(template, creatorPlayerId);
  }
  store.register(collaborationA, creatorPlayerId);
  store.register(collaborationB, creatorPlayerId);
  store.register(collaborationC, collaboratorPlayerId);
  store.register(jadeSourceA, creatorPlayerId);
  store.register(jadeSourceB, creatorPlayerId);
  store.register(jadeSourceC, creatorPlayerId);
  const repository = {
    createTechniqueState(techniqueId: string): TechniqueState | null {
      const template = store.getById(techniqueId);
      return template ? toRuntimeTechnique(template, 1) : null;
    },
  };
  const service = new TechniqueAggregationService(repository as never, store as never);
  const creator = createPlayer(creatorPlayerId, [
    toRuntimeTechnique(sourceA),
    toRuntimeTechnique(sourceB),
    toRuntimeTechnique(sourceC),
    toRuntimeTechnique(mismatchedGrade),
    toRuntimeTechnique(artsSource),
  ]);

  const panel = service.buildPanel(creator, { requestId: 'panel-1', buildingId: 'refining-1' });
  assert.deepEqual(
    new Set(panel.eligibleSources.map((entry) => entry.techId)),
    new Set([sourceA.id, sourceB.id, sourceC.id, mismatchedGrade.id]),
  );
  assert.equal(panel.eligibleSources.every((entry) => entry.fullyMastered), true);
  assert.equal(panel.eligibleSources.find((entry) => entry.techId === sourceA.id)?.strengthPercent, 80);
  assert.equal(panel.eligibleSources.find((entry) => entry.techId === sourceB.id)?.strengthPercent, 120);

  const invalidNameResult = await service.publish(creator, {
    operationId: 'invalid-name',
    customName: '一',
    sourceTechniqueIds: [sourceA.id, sourceB.id],
  });
  assert.equal(invalidNameResult.ok, false);
  assert.equal(invalidNameResult.result.code, 'TECHNIQUE_AGGREGATE_NAME_INVALID');

  const nonOwner = createPlayer('player:not-owner', [toRuntimeTechnique(sourceA), toRuntimeTechnique(sourceB)]);
  const nonOwnerResult = await service.publish(nonOwner, {
    operationId: 'non-owner',
    customName: '无主法脉',
    sourceTechniqueIds: [sourceA.id, sourceB.id],
  });
  assert.equal(nonOwnerResult.ok, false);
  assert.equal(nonOwnerResult.result.code, 'TECHNIQUE_AGGREGATE_SOURCE_NOT_OWNER');
  assert.deepEqual(nonOwnerResult.result.invalidTechniqueIds, [sourceA.id]);

  const notMastered = createPlayer(creatorPlayerId, [toRuntimeTechnique(sourceA, 1), toRuntimeTechnique(sourceB)]);
  const notMasteredResult = await service.publish(notMastered, {
    operationId: 'not-mastered',
    customName: '未成法脉',
    sourceTechniqueIds: [sourceA.id, sourceB.id],
  });
  assert.equal(notMasteredResult.ok, false);
  assert.equal(notMasteredResult.result.code, 'TECHNIQUE_AGGREGATE_SOURCE_NOT_MASTERED');

  const categoryResult = await service.publish(creator, {
    operationId: 'category-invalid',
    customName: '异术法脉',
    sourceTechniqueIds: [sourceA.id, artsSource.id],
  });
  assert.equal(categoryResult.ok, false);
  assert.equal(categoryResult.result.code, 'TECHNIQUE_AGGREGATE_SOURCE_CATEGORY_INVALID');

  const gradeResult = await service.publish(creator, {
    operationId: 'grade-invalid',
    customName: '杂阶法脉',
    sourceTechniqueIds: [sourceA.id, mismatchedGrade.id],
  });
  assert.equal(gradeResult.ok, false);
  assert.equal(gradeResult.result.code, 'TECHNIQUE_AGGREGATE_SOURCE_GRADE_MISMATCH');

  const collaborationOwner = createPlayer(creatorPlayerId, [
    toRuntimeTechnique(collaborationA),
    toRuntimeTechnique(collaborationB),
  ]);
  const collaborationFirst = await service.publish(collaborationOwner, {
    operationId: 'collaboration-family',
    customName: '同参道典',
    sourceTechniqueIds: [collaborationA.id, collaborationB.id],
  }, {
    platformInstanceId: 'instance:collaboration',
    platformBuildingId: 'unification-platform-collaboration',
    platformOwnerPlayerId: creatorPlayerId,
  });
  assert.equal(collaborationFirst.ok, true);
  assert.ok(collaborationFirst.ok && collaborationFirst.result.aggregate);
  if (!collaborationFirst.ok || !collaborationFirst.result.aggregate) {
    throw new Error('协作法脉首卷发布失败');
  }
  const collaborator = createPlayer(collaboratorPlayerId, [toRuntimeTechnique(collaborationC)]);
  const deniedRevision = await service.publish(collaborator, {
    operationId: 'collaboration-revision-denied',
    familyId: collaborationFirst.result.aggregate.familyId,
    expectedRevision: 1,
    sourceTechniqueIds: [collaborationC.id],
  }, {
    platformInstanceId: 'instance:collaboration',
    platformBuildingId: 'unification-platform-collaboration',
    platformOwnerPlayerId: creatorPlayerId,
    revisionPermissionGranted: false,
  });
  assert.equal(deniedRevision.ok, false);
  assert.equal(deniedRevision.result.code, 'TECHNIQUE_AGGREGATE_PERMISSION_DENIED');
  const collaborativeRevision = await service.publish(collaborator, {
    operationId: 'collaboration-revision-allowed',
    familyId: collaborationFirst.result.aggregate.familyId,
    expectedRevision: 1,
    sourceTechniqueIds: [collaborationC.id],
  }, {
    platformInstanceId: 'instance:collaboration',
    platformBuildingId: 'unification-platform-collaboration',
    platformOwnerPlayerId: creatorPlayerId,
    revisionPermissionGranted: true,
  });
  assert.equal(collaborativeRevision.ok, true);
  assert.ok(collaborativeRevision.ok && collaborativeRevision.result.aggregate);
  if (!collaborativeRevision.ok || !collaborativeRevision.result.aggregate) {
    throw new Error('协作法脉续录失败');
  }
  assert.deepEqual(
    collaborativeRevision.result.aggregate.sourceTechniqueIds,
    [collaborationA.id, collaborationB.id, collaborationC.id].sort(),
  );
  const collaborativeMetadata = store.getAggregateMetadata(collaborativeRevision.result.aggregate.techniqueId);
  assert.equal(collaborativeMetadata?.creatorPlayerId, creatorPlayerId);
  assert.equal(collaborativeMetadata?.revisionAuthorPlayerId, collaboratorPlayerId);

  const jadeOwner = createPlayer(creatorPlayerId, [
    toRuntimeTechnique(jadeSourceA),
    toRuntimeTechnique(jadeSourceB),
  ], 1);
  store.setJadeItemCount(creatorPlayerId, 1);
  const jadeFamilyFirst = await service.publish(jadeOwner, {
    operationId: 'jade-family-first',
    customName: '太素衡真录',
    sourceTechniqueIds: [jadeSourceA.id, jadeSourceB.id],
  }, {
    platformInstanceId: 'instance:jade',
    platformBuildingId: 'unification-platform-jade',
    platformOwnerPlayerId: creatorPlayerId,
  });
  assert.equal(jadeFamilyFirst.ok, true);
  assert.ok(jadeFamilyFirst.ok && jadeFamilyFirst.result.aggregate);
  if (!jadeFamilyFirst.ok || !jadeFamilyFirst.result.aggregate) {
    throw new Error('玉简法脉首卷发布失败');
  }
  const jadeFamilyPanel = service.buildPanel(jadeOwner, {}, {
    boundFamilyId: jadeFamilyFirst.result.aggregate.familyId,
  });
  assert.equal(jadeFamilyPanel.jadeItemCount, 1);
  assert.equal(jadeFamilyPanel.families[0]?.realmLv, 1);
  assert.equal(jadeFamilyPanel.families[0]?.jadeEnhancementCount, 0);
  const jadeFirstTemplate = store.getById(jadeFamilyFirst.result.aggregate.techniqueId);
  assert.ok(jadeFirstTemplate);
  const jadeFirstRuntime = toRuntimeTechnique(jadeFirstTemplate!);
  const jadeFirstAttrs = calcTechniqueAttrValues(jadeFirstRuntime.level, jadeFirstRuntime.layers);

  const originalRandom = Math.random;
  Math.random = () => 0.5;
  let jadeRevision;
  try {
    jadeRevision = await service.publish(jadeOwner, {
      operationId: 'jade-family-enhancement-1',
      familyId: jadeFamilyFirst.result.aggregate.familyId,
      expectedRevision: 1,
      recordMode: 'jade',
      sourceTechniqueIds: [],
    }, {
      platformInstanceId: 'instance:jade',
      platformBuildingId: 'unification-platform-jade',
      platformOwnerPlayerId: creatorPlayerId,
      revisionPermissionGranted: true,
      jadePersistenceFence: {
        expectedRuntimeOwnerId: 'runtime:test',
        expectedSessionEpoch: 1,
      },
    });
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(jadeRevision.ok, true);
  assert.ok(jadeRevision.ok && jadeRevision.result.aggregate);
  if (!jadeRevision.ok || !jadeRevision.result.aggregate) {
    throw new Error('悟道玉简录法失败');
  }
  assert.equal(jadeRevision.result.recordMode, 'jade');
  assert.equal(jadeRevision.result.aggregate.revision, 2);
  assert.equal(jadeRevision.result.aggregate.jadeEnhancementCount, 1);
  assert.equal(jadeRevision.result.aggregate.jadeStrengthPercent, 100);
  assert.deepEqual(
    jadeRevision.result.aggregate.sourceTechniqueIds,
    jadeFamilyFirst.result.aggregate.sourceTechniqueIds,
  );
  assert.equal(
    jadeRevision.result.aggregate.totalTrainingDifficulty,
    jadeFamilyFirst.result.aggregate.totalTrainingDifficulty,
  );
  assert.deepEqual(jadeRevision.committedInventoryItems, []);
  assert.equal(store.jadePublishCommitCount, 1);
  const jadeRevisionTemplate = store.getById(jadeRevision.result.aggregate.techniqueId);
  assert.ok(jadeRevisionTemplate);
  const jadeRevisionRuntime = toRuntimeTechnique(jadeRevisionTemplate!);
  const jadeRevisionAttrs = calcTechniqueAttrValues(jadeRevisionRuntime.level, jadeRevisionRuntime.layers);
  const jadeDeltas = TECHNIQUE_ATTR_KEYS.map((key) => (
    Math.round((Number(jadeRevisionAttrs[key] ?? 0) - Number(jadeFirstAttrs[key] ?? 0)) * 1000) / 1000
  ));
  assert.equal(jadeDeltas.every((value) => value > 0), true);
  assert.equal(new Set(jadeDeltas).size, 1, '悟道玉简应将增益均衡分配至六维');
  const jadeMetadata = store.getAggregateMetadata(jadeRevision.result.aggregate.techniqueId);
  assert.equal(jadeMetadata?.revisionKind, 'jade');
  assert.equal(jadeMetadata?.revisionOperationId, 'jade-family-enhancement-1');
  assert.equal(jadeMetadata?.sourceCount, 2);
  assert.equal(Object.keys(jadeMetadata?.jadeBonusAttrs ?? {}).length, TECHNIQUE_ATTR_KEYS.length);

  const jadeReplay = await service.publish(jadeOwner, {
    operationId: 'jade-family-enhancement-1',
    familyId: jadeFamilyFirst.result.aggregate.familyId,
    expectedRevision: 1,
    recordMode: 'jade',
    sourceTechniqueIds: [],
  }, {
    platformInstanceId: 'instance:jade',
    platformBuildingId: 'unification-platform-jade',
    platformOwnerPlayerId: creatorPlayerId,
    revisionPermissionGranted: true,
    jadePersistenceFence: {
      expectedRuntimeOwnerId: 'runtime:test',
      expectedSessionEpoch: 1,
    },
  });
  assert.equal(jadeReplay.ok, true);
  assert.equal(jadeReplay.result.aggregate?.techniqueId, jadeRevision.result.aggregate.techniqueId);
  assert.deepEqual(jadeReplay.ok ? jadeReplay.committedInventoryItems : undefined, []);
  assert.equal(store.jadePublishCommitCount, 1, '幂等重放不可再次扣除悟道玉简');

  jadeOwner.techniques.techniques = [jadeRevisionRuntime, toRuntimeTechnique(jadeSourceC)];
  const jadeSourceRevision = await service.publish(jadeOwner, {
    operationId: 'jade-family-source-revision',
    familyId: jadeFamilyFirst.result.aggregate.familyId,
    expectedRevision: 2,
    recordMode: 'sources',
    sourceTechniqueIds: [jadeSourceC.id],
  }, {
    platformInstanceId: 'instance:jade',
    platformBuildingId: 'unification-platform-jade',
    platformOwnerPlayerId: creatorPlayerId,
    revisionPermissionGranted: true,
  });
  assert.equal(jadeSourceRevision.ok, true);
  assert.ok(jadeSourceRevision.ok && jadeSourceRevision.result.aggregate);
  if (!jadeSourceRevision.ok || !jadeSourceRevision.result.aggregate) {
    throw new Error('玉简法脉续录源法失败');
  }
  assert.equal(jadeSourceRevision.result.aggregate.revision, 3);
  assert.equal(jadeSourceRevision.result.aggregate.jadeEnhancementCount, 1);
  assert.equal(
    jadeSourceRevision.result.aggregate.totalTrainingDifficulty,
    jadeFamilyFirst.result.aggregate.totalTrainingDifficulty + 80,
  );
  const jadeSourceMetadata = store.getAggregateMetadata(jadeSourceRevision.result.aggregate.techniqueId);
  assert.deepEqual(jadeSourceMetadata?.jadeBonusAttrs, jadeMetadata?.jadeBonusAttrs);

  const jadeNotEnough = await service.publish(jadeOwner, {
    operationId: 'jade-family-enhancement-empty',
    familyId: jadeFamilyFirst.result.aggregate.familyId,
    expectedRevision: 3,
    recordMode: 'jade',
    sourceTechniqueIds: [],
  }, {
    platformInstanceId: 'instance:jade',
    platformBuildingId: 'unification-platform-jade',
    platformOwnerPlayerId: creatorPlayerId,
    revisionPermissionGranted: true,
    jadePersistenceFence: {
      expectedRuntimeOwnerId: 'runtime:test',
      expectedSessionEpoch: 1,
    },
  });
  assert.equal(jadeNotEnough.ok, false);
  assert.equal(jadeNotEnough.result.code, 'TECHNIQUE_AGGREGATE_JADE_ITEM_NOT_ENOUGH');
  assert.equal(store.jadePublishCommitCount, 1);

  const first = await service.publish(creator, {
    requestId: 'publish-v1',
    operationId: 'aggregation-family-main',
    customName: '归一真经',
    permissions: {
      read: {
        unrestricted: false,
        friendLevels: ['close_friend'],
        sectRoles: ['elder', 'inner'],
      },
      revision: {
        unrestricted: false,
        friendLevels: [],
        sectRoles: [],
      },
    },
    sourceTechniqueIds: [sourceA.id, sourceB.id],
  }, {
    platformInstanceId: 'instance:sect-main',
    platformBuildingId: 'unification-platform-1',
  });
  assert.equal(first.ok, true);
  assert.ok(first.ok && first.result.aggregate);
  if (!first.ok || !first.result.aggregate) throw new Error('首版统合发布失败');
  assert.equal(first.result.aggregate.revision, 1);
  assert.equal(first.result.aggregate.totalTrainingDifficulty, 200);
  assert.equal(first.result.aggregate.effectMultiplier, 1.1);
  assert.equal(first.result.aggregate.name, '归一真经');
  assert.equal(first.template.aggregate?.platformBuildingId, 'unification-platform-1');
  assert.deepEqual(first.template.aggregate?.initialPermissions, {
    read: {
      unrestricted: false,
      friendLevels: ['close_friend'],
      sectRoles: ['elder', 'inner'],
    },
    revision: {
      unrestricted: false,
      friendLevels: [],
      sectRoles: [],
    },
  });
  const firstTemplate = store.getById(first.result.aggregate.techniqueId);
  assert.ok(firstTemplate);
  const firstRuntime = toRuntimeTechnique(firstTemplate!);
  assert.equal(calcTechniqueAttrValues(firstRuntime.level, firstRuntime.layers).constitution, 66);
  assert.deepEqual(calcTechniqueMaxAttrPercentBonus([firstRuntime]), {});

  const firstReplayCreator = createPlayer(creatorPlayerId, [firstRuntime]);
  const firstReplay = await service.publish(firstReplayCreator, {
    requestId: 'publish-v1-replay',
    operationId: 'aggregation-family-main',
    customName: '归一真经',
    sourceTechniqueIds: [sourceA.id, sourceB.id],
  }, {
    platformInstanceId: 'instance:sect-main',
    platformBuildingId: 'unification-platform-1',
  });
  assert.equal(firstReplay.ok, true);
  assert.equal(firstReplay.result.aggregate?.techniqueId, firstRuntime.techId);
  const mismatchedReplay = await service.publish(creator, {
    operationId: 'aggregation-family-main',
    customName: '归一真经',
    sourceTechniqueIds: [sourceA.id, sourceC.id],
  }, {
    platformInstanceId: 'instance:sect-main',
    platformBuildingId: 'unification-platform-1',
  });
  assert.equal(mismatchedReplay.ok, false);
  assert.equal(mismatchedReplay.result.code, 'TECHNIQUE_AGGREGATE_ALREADY_EXISTS');

  const overlapResult = await service.publish(creator, {
    operationId: 'overlap-family',
    customName: '重合法脉',
    sourceTechniqueIds: [sourceA.id, sourceC.id],
  });
  assert.equal(overlapResult.ok, false);
  assert.equal(overlapResult.result.code, 'TECHNIQUE_AGGREGATE_OVERLAP');
  assert.deepEqual(overlapResult.result.conflictSourceTechniqueIds, [sourceA.id]);
  assert.equal(overlapResult.result.vars?.aggregateTechniqueNames, '归一真经');
  assert.equal(overlapResult.result.vars?.sourceTechniqueNames, '归元诀');

  const halfCoveredLearner = createPlayer('player:half-covered', [toRuntimeTechnique(sourceA)]);
  halfCoveredLearner.pendingTechniqueComprehensions.push({
    techId: firstRuntime.techId,
    progress: 0,
    requiredProgress: 999,
  });
  const fullRequirement = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: firstRuntime.realmLv,
    grade: firstRuntime.grade,
    learnerRealmLv: 1,
    learnerTransmissionLevel: 1,
    teacherTransmissionLevel: 1,
  });
  const pendingOnlyLearner = createPlayer('player:pending-only', []);
  pendingOnlyLearner.pendingTechniqueComprehensions.push({
    techId: firstRuntime.techId,
    progress: 99,
    requiredProgress: fullRequirement,
  });
  assert.equal(
    service.resolveComprehensionRequirement(pendingOnlyLearner, firstRuntime, fullRequirement),
    fullRequirement,
  );
  store.listAggregateMetadataCallCount = 0;
  assert.equal(
    service.resolveComprehensionRequirement(halfCoveredLearner, firstRuntime, fullRequirement),
    Math.max(1, Math.ceil(fullRequirement / 2)),
  );
  halfCoveredLearner.pendingTechniqueComprehensions.push({ techId: sourceC.id });
  assert.equal(
    service.resolveComprehensionRequirement(halfCoveredLearner, firstRuntime, fullRequirement),
    Math.max(1, Math.ceil(fullRequirement / 2)),
  );
  assert.equal(store.listAggregateMetadataCallCount, 0);

  creator.techniques.techniques = [firstRuntime, toRuntimeTechnique(sourceC)];
  const second = await service.publish(creator, {
    requestId: 'publish-v2',
    operationId: 'aggregation-family-update',
    familyId: first.result.aggregate.familyId,
    expectedRevision: 1,
    sourceTechniqueIds: [sourceC.id],
  }, {
    platformInstanceId: 'instance:sect-main',
    platformBuildingId: 'unification-platform-1',
  });
  assert.equal(second.ok, true);
  assert.ok(second.ok && second.result.aggregate);
  if (!second.ok || !second.result.aggregate) throw new Error('第二版统合发布失败');
  assert.equal(second.result.aggregate.revision, 2);
  assert.deepEqual(second.result.aggregate.sourceTechniqueIds, [sourceA.id, sourceB.id, sourceC.id].sort());
  assert.equal(second.result.aggregate.totalTrainingDifficulty, 300);
  assert.equal(service.resolveLatestTechniqueId(firstRuntime.techId), second.result.aggregate.techniqueId);

  const secondReplayCreator = createPlayer(creatorPlayerId, [
    toRuntimeTechnique(store.getById(second.result.aggregate.techniqueId)!),
  ]);
  const secondReplay = await service.publish(secondReplayCreator, {
    requestId: 'publish-v2-replay',
    operationId: 'aggregation-family-update',
    familyId: first.result.aggregate.familyId,
    expectedRevision: 1,
    sourceTechniqueIds: [sourceC.id],
  }, {
    platformInstanceId: 'instance:sect-main',
    platformBuildingId: 'unification-platform-1',
  });
  assert.equal(secondReplay.ok, true);
  assert.equal(secondReplay.result.aggregate?.techniqueId, second.result.aggregate.techniqueId);

  const secondTemplate = store.getById(second.result.aggregate.techniqueId);
  assert.ok(secondTemplate);
  const secondRuntime = toRuntimeTechnique(secondTemplate!);
  const replacingPlayer = createPlayer('player:replacement', [
    toRuntimeTechnique(sourceA),
    toRuntimeTechnique(sourceB),
    firstRuntime,
    secondRuntime,
    toRuntimeTechnique(mismatchedGrade),
  ]);
  replacingPlayer.pendingTechniqueComprehensions.push(
    { techId: sourceC.id },
    { techId: firstRuntime.techId },
  );
  const removed = service.applyCompletionReplacement(replacingPlayer, secondRuntime.techId);
  assert.deepEqual(new Set(removed), new Set([sourceA.id, sourceB.id, sourceC.id, firstRuntime.techId]));
  assert.deepEqual(
    replacingPlayer.techniques.techniques.map((entry) => entry.techId).sort(),
    [mismatchedGrade.id, secondRuntime.techId].sort(),
  );
  assert.equal(replacingPlayer.pendingTechniqueComprehensions.length, 0);

  const conflictPlayer = createPlayer('player:conflict', [secondRuntime]);
  const directConflict = service.resolveLearningConflict(conflictPlayer, sourceA.id);
  assert.equal(directConflict?.code, 'TECHNIQUE_AGGREGATE_OVERLAP');
  assert.deepEqual(directConflict?.conflictAggregateIds, [secondRuntime.techId]);
  assert.deepEqual(directConflict?.conflictSourceTechniqueIds, [sourceA.id]);
  assert.equal(directConflict?.vars?.sourceTechniqueNames, sourceA.name);
  assert.equal(service.resolveLearningConflict(conflictPlayer, firstRuntime.techId)?.code, 'TECHNIQUE_AGGREGATE_REVISION_INVALID');

  const oldVersionTeacher = {
    ...createPlayer('player:old-version-teacher', [firstRuntime]),
    instanceId: 'instance:aggregation-version',
    x: 0,
    y: 0,
    lifeElapsedTicks: 1,
    dirtyDomains: new Set<string>(),
  };
  const latestLearner = {
    ...createPlayer('player:latest-learner', []),
    instanceId: oldVersionTeacher.instanceId,
    x: 0,
    y: 0,
    lifeElapsedTicks: 1,
    dirtyDomains: new Set<string>(),
  };
  const scriptureBuilding = {
    id: 'building:aggregation-scripture',
    defId: 'scripture_platform',
    instanceId: oldVersionTeacher.instanceId,
    x: 0,
    y: 0,
    state: 'active',
    scriptureTechniqueId: firstRuntime.techId,
    scriptureTechniqueName: firstRuntime.name,
    scriptureProgress: 1,
    scriptureRequiredProgress: 1,
    scriptureRealmLv: firstRuntime.realmLv,
    scriptureGrade: firstRuntime.grade,
    scriptureCategory: firstRuntime.category,
    scriptureRecorderPlayerId: oldVersionTeacher.playerId,
    scriptureRecordingJobRunId: null,
    scriptureRecordedAtTick: 1,
    revision: 1,
    updatedAtTick: 1,
  };
  const instance = {
    buildingById: new Map([[scriptureBuilding.id, scriptureBuilding]]),
    localBuildingViewCacheById: new Map(),
    markPersistenceDirtyDomainsHighPriority() {},
    persistentRevision: 1,
  };
  const runtime = {
    getPlayer(playerId: string) {
      return playerId === oldVersionTeacher.playerId ? oldVersionTeacher : playerId === latestLearner.playerId ? latestLearner : null;
    },
    resolveLatestTechniqueId(techniqueId: string) {
      return service.resolveLatestTechniqueId(techniqueId);
    },
    resolveTechniqueLearningConflict(player: any, techniqueId: string) {
      return service.resolveLearningConflict(player, techniqueId);
    },
    techniqueAggregationService: service,
  };
  const transmissionContext = {
    contentTemplateRepository: repository,
    resolveExpToNextByLevel: () => 100,
    getInstanceRuntime: () => instance,
    deps: {
      playerRuntimeService: runtime,
      getInstanceRuntime: () => instance,
      refreshPlayerContextActions() {},
    },
  };
  const transmission = new TransmissionStrategy();
  const directValidation = transmission.validateStart(latestLearner, {
    learnerPlayerId: latestLearner.playerId,
    teacherPlayerId: oldVersionTeacher.playerId,
    techniqueId: firstRuntime.techId,
  }, transmissionContext as never);
  assert.equal(directValidation.ok, true, 'error' in directValidation ? directValidation.error : undefined);
  assert.equal(directValidation.validated?.techniqueId, secondRuntime.techId);

  const scriptureValidation = transmission.validateStart(latestLearner, {
    mode: 'scripture_contemplation',
    learnerPlayerId: latestLearner.playerId,
    techniqueId: firstRuntime.techId,
    buildingId: scriptureBuilding.id,
  }, transmissionContext as never);
  assert.equal(scriptureValidation.ok, true, 'error' in scriptureValidation ? scriptureValidation.error : undefined);
  if (!scriptureValidation.ok) throw new Error('旧版藏经台无法解析最新版统合功法');
  assert.equal(scriptureValidation.validated.techniqueId, secondRuntime.techId);
  const scriptureJob = transmission.createJob(latestLearner, scriptureValidation.validated, transmissionContext as never);
  transmission.setActiveJob(latestLearner, scriptureJob);
  transmission.executeTick(latestLearner, transmissionContext as never);
  assert.notEqual(latestLearner.transmissionJob?.status, 'blocked');
  assert.equal(latestLearner.pendingTechniqueComprehensions[0]?.techId, secondRuntime.techId);

  console.log(JSON.stringify({
    ok: true,
    case: 'technique-aggregation',
    firstRevision: first.result.aggregate.revision,
    latestRevision: second.result.aggregate.revision,
    sourceCount: second.result.aggregate.sourceCount,
    totalTrainingDifficulty: second.result.aggregate.totalTrainingDifficulty,
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
