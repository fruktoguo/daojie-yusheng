import assert from 'node:assert/strict';
import {
  S2C,
  normalizeTechniqueUnificationPermissions,
  type TechniqueAggregationMetadata,
  type TechniqueAggregationPanelView,
  type TechniqueAggregationPublishRequest,
  type TechniqueUnificationPlatformView,
} from '@mud/shared';
import { WorldGatewayTechniqueAggregationHelper } from '../network/world-gateway-technique-aggregation.helper';

type RuntimePlayer = {
  playerId: string;
  instanceId: string;
  x: number;
  y: number;
  techniques: { revision: number; techniques: Array<{ techId: string }> };
  pendingTechniqueComprehensions: Array<Record<string, unknown>>;
  eligibleSourceIds: string[];
  inventory: { revision: number; items: Array<Record<string, unknown>> };
  dirtyDomains: Set<string>;
};

class TestSocket {
  readonly emitted: Array<{ event: string; payload: any }> = [];

  constructor(readonly data: { playerId: string }) {}

  emit(event: string, payload: any): void {
    this.emitted.push({ event, payload });
  }

  last<T>(event: string): T {
    const entry = [...this.emitted].reverse().find((candidate) => candidate.event === event);
    assert.ok(entry, `未收到事件 ${event}`);
    return entry.payload as T;
  }
}

async function main(): Promise<void> {
  const owner = createPlayer('player:owner', ['gen:a', 'gen:b', 'gen:c']);
  const closeFriend = createPlayer('player:close-friend', ['gen:friend']);
  const innerDisciple = createPlayer('player:inner-disciple', ['gen:inner'], 1);
  const stranger = createPlayer('player:stranger', ['gen:stranger'], 1);
  const players = new Map([owner, closeFriend, innerDisciple, stranger].map((player) => [player.playerId, player]));
  const building: any = {
    id: 'building:unification-1',
    defId: 'technique_unification_platform',
    state: 'active',
    name: '归元统法台',
    ownerPlayerId: owner.playerId,
    x: 10,
    y: 10,
    revision: 1,
  };
  const instance = {
    meta: { instanceId: owner.instanceId, persistent: true },
    tick: 100,
    worldRevision: 1,
    persistentRevision: 1,
    buildingById: new Map([[building.id, building]]),
    dirtyDomains: [] as string[],
    markPersistenceDirtyDomainsHighPriority(domains: string[]) {
      this.dirtyDomains.push(...domains);
    },
    markAoiViewChangedAt() {},
    localBuildingViewCacheById: new Map(),
    updateTechniqueUnificationPlatformState(buildingId: string, input: any) {
      const target = this.buildingById.get(buildingId);
      if (!target || target.defId !== 'technique_unification_platform' || target.state !== 'active') {
        return { ok: false, reason: 'technique_unification_platform_invalid' };
      }
      const familyId = typeof input?.familyId === 'string' ? input.familyId.trim() : '';
      if (!familyId) return { ok: false, reason: 'technique_unification_family_required' };
      if (target.techniqueAggregationFamilyId && target.techniqueAggregationFamilyId !== familyId) {
        return { ok: false, reason: 'technique_unification_platform_already_bound' };
      }
      const nextPermissions = normalizeTechniqueUnificationPermissions(input.permissions);
      const changed = target.techniqueAggregationFamilyId !== familyId
        || JSON.stringify(target.techniqueAggregationPermissions) !== JSON.stringify(nextPermissions);
      if (changed) {
        target.techniqueAggregationFamilyId = familyId;
        target.techniqueAggregationPermissions = nextPermissions;
        target.revision += 1;
        this.markPersistenceDirtyDomainsHighPriority(['building']);
      }
      return { ok: true, building: target, changed };
    },
  };
  const aggregation = new FakeAggregationService();
  const playerFlushes: string[][] = [];
  const instanceFlushes: string[][] = [];
  const pendingOptions: unknown[] = [];
  const replacedInventories: Array<{ playerId: string; items: unknown[] }> = [];
  const helper = new WorldGatewayTechniqueAggregationHelper({
    gatewayGuardHelper: {
      requirePlayerId(client: any) {
        return client?.data?.playerId ?? null;
      },
    } as never,
    playerRuntimeService: {
      getPlayer(playerId: string) {
        return players.get(playerId) ?? null;
      },
      async runExclusiveAssetMutation<T>(_playerIds: readonly string[], action: () => Promise<T> | T): Promise<T> {
        return action();
      },
      getSessionFence() {
        return { runtimeOwnerId: 'runtime:test', sessionEpoch: 1 };
      },
      listDirtyPlayerDomains() {
        return new Map([...players.entries()].map(([playerId, player]) => [playerId, player.dirtyDomains]));
      },
      replaceInventoryItems(playerId: string, items: unknown[]) {
        const player = players.get(playerId);
        if (!player) return null;
        player.inventory.items = Array.isArray(items) ? items.map((item) => ({ ...(item as Record<string, unknown>) })) : [];
        player.inventory.revision += 1;
        replacedInventories.push({ playerId, items: structuredClone(items) });
        return player;
      },
      learnPublishedAggregateTechniqueById(playerId: string, techniqueId: string) {
        const player = players.get(playerId);
        if (!player) return false;
        if (!player.techniques.techniques.some((entry) => entry.techId === techniqueId)) {
          player.techniques.techniques.push({ techId: techniqueId });
          player.techniques.revision += 1;
        }
        return true;
      },
      addPendingTechniqueComprehensionById(
        playerId: string,
        techniqueId: string,
        _sourceKind: string,
        _creatorPlayerId: string | null,
        options: unknown,
      ) {
        const player = players.get(playerId);
        if (!player) return false;
        pendingOptions.push(options);
        player.pendingTechniqueComprehensions.push({
          techId: techniqueId,
          progress: 0,
          requiredProgress: 100,
        });
        player.techniques.revision += 1;
        return true;
      },
      resolveTechniqueLearningConflict() {
        return null;
      },
    } as never,
    worldRuntimeService: {
      getInstanceRuntime(instanceId: string) {
        return instanceId === instance.meta.instanceId ? instance : null;
      },
      async flushInstanceDomains(_instanceId: string, domains: string[]) {
        instanceFlushes.push(domains);
        return { persistedDomains: domains };
      },
      worldRuntimeSectService: {
        resolvePlayerSectId(playerId: string) {
          return playerId === owner.playerId || playerId === innerDisciple.playerId ? 'sect:main' : null;
        },
        findSectById(sectId: string) {
          return sectId === 'sect:main'
            ? {
              members: [
                { playerId: owner.playerId, roleId: 'leader' },
                { playerId: innerDisciple.playerId, roleId: 'inner' },
              ],
            }
            : null;
        },
      },
    } as never,
    socialRuntimeService: {
      async areRelated(left: string, right: string, minimumLevel: string) {
        return minimumLevel === 'close_friend'
          && new Set([left, right]).has(owner.playerId)
          && new Set([left, right]).has(closeFriend.playerId);
      },
    } as never,
    playerPersistenceFlushService: {
      async flushPlayerDomains(playerId: string, domains: string[]) {
        playerFlushes.push(domains);
        const player = players.get(playerId);
        for (const domain of domains) player?.dirtyDomains.delete(domain);
        return { persistedDomains: domains } as never;
      },
    } as never,
    worldClientEventService: {
      markProtocol() {},
      emitGatewayError(_client: unknown, code: string, error: unknown) {
        throw new Error(`${code}:${String(error)}`);
      },
    } as never,
    worldSyncService: { emitDeltaSync() {} } as never,
  });
  helper.setService(aggregation as never);

  const ownerSocket = new TestSocket({ playerId: owner.playerId });
  await helper.handleRequestPanel(ownerSocket as never, { requestId: 'owner-panel', buildingId: building.id });
  const initialPanel = ownerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel);
  assert.equal(initialPanel.platform.isOwner, true);
  assert.equal(initialPanel.platform.learnerState, 'unbound');
  assert.deepEqual(initialPanel.families, []);

  await helper.handlePublish(ownerSocket as never, {
    requestId: 'publish-1',
    operationId: 'operation-1',
    buildingId: building.id,
    customName: '归元正法',
    permissions: {
      read: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: [] },
      revision: { unrestricted: false, friendLevels: [], sectRoles: [] },
    },
    sourceTechniqueIds: ['gen:a', 'gen:b'],
  });
  const boundFamilyId = String(building.techniqueAggregationFamilyId ?? '');
  assert.equal(boundFamilyId, 'family:operation-1');
  assert.deepEqual(building.techniqueAggregationPermissions, {
    read: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: [] },
    revision: { unrestricted: false, friendLevels: [], sectRoles: [] },
  });
  assert.equal(instance.dirtyDomains.includes('building'), true);
  assert.equal(instanceFlushes.length > 0, true);
  assert.equal(playerFlushes.length > 0, true);

  delete building.techniqueAggregationFamilyId;
  delete building.techniqueAggregationPermissions;
  await helper.handleRequestPanel(ownerSocket as never, { requestId: 'recover-panel', buildingId: building.id });
  assert.equal(building.techniqueAggregationFamilyId, boundFamilyId);
  assert.deepEqual(building.techniqueAggregationPermissions, {
    read: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: [] },
    revision: { unrestricted: false, friendLevels: [], sectRoles: [] },
  });

  await helper.handlePublish(ownerSocket as never, {
    requestId: 'publish-2',
    operationId: 'operation-2',
    buildingId: building.id,
    familyId: 'family:forged-switch',
    expectedRevision: 1,
    sourceTechniqueIds: ['gen:c'],
  });
  assert.equal(aggregation.lastPublishRequest?.familyId, boundFamilyId);
  assert.equal(building.techniqueAggregationFamilyId, boundFamilyId);

  const closeFriendSocket = new TestSocket({ playerId: closeFriend.playerId });
  await helper.handleRequestPanel(closeFriendSocket as never, { requestId: 'friend-panel', buildingId: building.id });
  const closeFriendPanel = closeFriendSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel);
  assert.equal(closeFriendPanel.platform.canLearn, true);
  assert.equal(closeFriendPanel.platform.canRevise, false);
  assert.deepEqual(closeFriendPanel.eligibleSources, []);
  await helper.handleLearn(closeFriendSocket as never, { requestId: 'friend-learn', buildingId: building.id });
  assert.deepEqual(pendingOptions.at(-1), { selfComprehensionAllowed: true });
  assert.equal(closeFriend.pendingTechniqueComprehensions.length, 1);
  await helper.handlePublish(closeFriendSocket as never, {
    requestId: 'friend-revision-denied',
    operationId: 'friend-revision-denied',
    buildingId: building.id,
    expectedRevision: 2,
    sourceTechniqueIds: ['gen:friend'],
  });
  assert.equal(
    closeFriendSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED',
  );

  const strangerSocket = new TestSocket({ playerId: stranger.playerId });
  await helper.handleLearn(strangerSocket as never, { requestId: 'stranger-learn', buildingId: building.id });
  assert.equal(
    strangerSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_ACCESS_DENIED',
  );

  await helper.handleUpdatePermissions(ownerSocket as never, {
    requestId: 'read-sect',
    buildingId: building.id,
    scope: 'read',
    policy: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
  });
  const innerSocket = new TestSocket({ playerId: innerDisciple.playerId });
  await helper.handleRequestPanel(innerSocket as never, { requestId: 'inner-panel', buildingId: building.id });
  const innerReadPanel = innerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel);
  assert.equal(innerReadPanel.platform.canLearn, true);
  assert.equal(innerReadPanel.platform.canRevise, false);
  await helper.handleRequestPanel(closeFriendSocket as never, { requestId: 'friend-panel-2', buildingId: building.id });
  assert.equal(closeFriendSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).platform.canLearn, false);

  await helper.handleUpdatePermissions(ownerSocket as never, {
    requestId: 'revision-sect',
    buildingId: building.id,
    scope: 'revision',
    policy: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
  });
  await helper.handleRequestPanel(innerSocket as never, { requestId: 'inner-revision-panel', buildingId: building.id });
  const innerRevisionPanel = innerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel);
  assert.equal(innerRevisionPanel.platform.canLearn, true);
  assert.equal(innerRevisionPanel.platform.canRevise, true);
  assert.deepEqual(innerRevisionPanel.eligibleSources.map((entry) => entry.techId), ['gen:inner']);
  assert.equal(innerRevisionPanel.eligibleSources[0]?.strengthPercent, 108);
  await helper.handlePublish(innerSocket as never, {
    requestId: 'inner-revision',
    operationId: 'inner-revision',
    buildingId: building.id,
    expectedRevision: 2,
    sourceTechniqueIds: ['gen:inner'],
  });
  const collaborativeEntry = aggregation.entries.at(-1);
  assert.equal(collaborativeEntry?.metadata.creatorPlayerId, owner.playerId);
  assert.equal(collaborativeEntry?.metadata.revisionAuthorPlayerId, innerDisciple.playerId);
  assert.equal(collaborativeEntry?.metadata.revision, 3);

  innerDisciple.dirtyDomains.add('inventory');
  await helper.handleRequestPanel(innerSocket as never, { requestId: 'inner-jade-panel', buildingId: building.id });
  assert.equal(
    innerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).jadeItemCount,
    1,
  );
  await helper.handlePublish(innerSocket as never, {
    requestId: 'inner-jade-revision',
    operationId: 'inner-jade-revision',
    buildingId: building.id,
    familyId: 'family:forged-switch',
    expectedRevision: 3,
    recordMode: 'jade',
    sourceTechniqueIds: [],
  });
  const jadeResult = innerSocket.last<any>(S2C.TechniqueAggregationResult);
  assert.equal(jadeResult.ok, true);
  assert.equal(jadeResult.recordMode, 'jade');
  assert.equal(jadeResult.aggregate?.revision, 4);
  assert.equal(jadeResult.aggregate?.jadeEnhancementCount, 1);
  assert.equal(jadeResult.aggregate?.jadeStrengthPercent, 104);
  assert.equal(aggregation.lastPublishRequest?.familyId, boundFamilyId);
  assert.deepEqual(aggregation.lastPublishRequest?.sourceTechniqueIds, []);
  assert.equal(playerFlushes.some((domains) => domains.includes('inventory')), true);
  assert.deepEqual(innerDisciple.inventory.items, []);
  assert.deepEqual(replacedInventories.at(-1), { playerId: innerDisciple.playerId, items: [] });
  const jadeEntry = aggregation.entries.at(-1);
  assert.equal(jadeEntry?.metadata.revisionKind, 'jade');
  assert.deepEqual(jadeEntry?.metadata.sourceTechniqueIds, collaborativeEntry?.metadata.sourceTechniqueIds);

  const strangerInventoryBefore = structuredClone(stranger.inventory.items);
  await helper.handlePublish(strangerSocket as never, {
    requestId: 'stranger-jade-denied',
    operationId: 'stranger-jade-denied',
    buildingId: building.id,
    expectedRevision: 4,
    recordMode: 'jade',
    sourceTechniqueIds: [],
  });
  assert.equal(
    strangerSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED',
  );
  assert.deepEqual(stranger.inventory.items, strangerInventoryBefore);

  await helper.handlePublish(strangerSocket as never, {
    requestId: 'stranger-revision-denied',
    operationId: 'stranger-revision-denied',
    buildingId: building.id,
    expectedRevision: 3,
    sourceTechniqueIds: ['gen:stranger'],
  });
  assert.equal(
    strangerSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED',
  );

  await helper.handleUpdatePermissions(ownerSocket as never, {
    requestId: 'read-open',
    buildingId: building.id,
    scope: 'read',
    policy: { unrestricted: true, friendLevels: ['dao_friend'], sectRoles: ['leader'] },
  });
  await helper.handleRequestPanel(strangerSocket as never, { requestId: 'stranger-panel', buildingId: building.id });
  const strangerPanel = strangerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel);
  assert.equal(strangerPanel.platform.canLearn, true);
  assert.equal(strangerPanel.platform.canRevise, false);
  assert.deepEqual(building.techniqueAggregationPermissions, {
    read: { unrestricted: true, friendLevels: [], sectRoles: [] },
    revision: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
  });

  const nonOwnerPermissionSocket = new TestSocket({ playerId: innerDisciple.playerId });
  await helper.handleUpdatePermissions(nonOwnerPermissionSocket as never, {
    requestId: 'permission-forbidden',
    buildingId: building.id,
    scope: 'revision',
    policy: { unrestricted: false, friendLevels: [], sectRoles: [] },
  });
  assert.equal(
    nonOwnerPermissionSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_PLATFORM_OWNER_REQUIRED',
  );

  process.stdout.write(`${JSON.stringify({
    ok: true,
    case: 'technique-unification-platform',
    familyId: boundFamilyId,
    instanceFlushes: instanceFlushes.length,
    playerFlushes: playerFlushes.length,
  })}\n`);
}

class FakeAggregationService {
  readonly entries: Array<{ techniqueId: string; metadata: TechniqueAggregationMetadata; name: string }> = [];
  lastPublishRequest: TechniqueAggregationPublishRequest | null = null;

  resolveInitialFamilyId(operationId: unknown): string {
    return `family:${String(operationId)}`;
  }

  listMetadata() {
    return this.entries.map((entry) => ({ techniqueId: entry.techniqueId, metadata: entry.metadata }));
  }

  getMetadataById(techniqueId: string) {
    return this.entries.find((entry) => entry.techniqueId === techniqueId)?.metadata;
  }

  findLatestAggregateForPlatform(instanceId: string, buildingId: string) {
    return [...this.entries]
      .filter((entry) => entry.metadata.platformInstanceId === instanceId && entry.metadata.platformBuildingId === buildingId)
      .sort((left, right) => right.metadata.revision - left.metadata.revision)[0];
  }

  buildPanel(
    player: RuntimePlayer,
    request: { requestId?: string; buildingId?: string },
    options: {
      boundFamilyId?: string;
      includeEligibleSources?: boolean;
      platform: TechniqueUnificationPlatformView;
    },
  ): TechniqueAggregationPanelView {
    const latest = options.boundFamilyId
      ? [...this.entries]
        .filter((entry) => entry.metadata.familyId === options.boundFamilyId)
        .sort((left, right) => right.metadata.revision - left.metadata.revision)[0]
      : undefined;
    return {
      requestId: request.requestId,
      buildingId: request.buildingId,
      revision: player.techniques.revision,
      eligibleSources: options.includeEligibleSources === false
        ? []
        : player.eligibleSourceIds.map((techId, index) => ({
          techId,
          name: `自创内功${index + 1}`,
          grade: 'mortal' as const,
          category: 'internal' as const,
          realmLv: index % 2 === 0 ? 3 : 2,
          strengthPercent: 108,
          level: 9,
          maxLevel: 9,
          fullyMastered: true,
          covered: false,
        })),
      families: latest ? [{
        familyId: latest.metadata.familyId,
        latestRevision: latest.metadata.revision,
        latestTechniqueId: latest.techniqueId,
        name: latest.name,
        grade: 'mortal',
        category: 'internal',
        realmLv: 3,
        sourceCount: latest.metadata.sourceCount,
        sourceTechniqueIds: [...latest.metadata.sourceTechniqueIds],
        jadeEnhancementCount: latest.metadata.jadeEnhancementCount ?? 0,
        creatorPlayerId: latest.metadata.creatorPlayerId,
        playerCoveredCount: 0,
      }] : [{
        familyId: 'family:must-not-leak',
        latestRevision: 1,
        latestTechniqueId: 'agg:must-not-leak',
        name: '不应出现',
        grade: 'mortal',
        category: 'internal',
        realmLv: 1,
        sourceCount: 2,
        sourceTechniqueIds: ['gen:x', 'gen:y'],
        jadeEnhancementCount: 0,
        playerCoveredCount: 0,
      }],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: player.techniques.techniques.length,
      jadeItemCount: player.inventory.items.reduce((sum, item) => (
        item.itemId === 'wudao_yujian' ? sum + Math.max(0, Number(item.count) || 0) : sum
      ), 0),
      platform: options.platform,
    };
  }

  async publish(
    player: RuntimePlayer,
    request: TechniqueAggregationPublishRequest,
    context: {
      platformInstanceId?: string;
      platformBuildingId?: string;
      platformOwnerPlayerId?: string;
      revisionPermissionGranted?: boolean;
      jadePersistenceFence?: {
        expectedRuntimeOwnerId: string;
        expectedSessionEpoch: number;
      };
    },
  ) {
    this.lastPublishRequest = { ...request };
    const familyId = request.familyId || this.resolveInitialFamilyId(request.operationId);
    const previous = [...this.entries]
      .filter((entry) => entry.metadata.familyId === familyId)
      .sort((left, right) => right.metadata.revision - left.metadata.revision)[0];
    const revision = previous ? previous.metadata.revision + 1 : 1;
    const recordMode = request.recordMode === 'jade' ? 'jade' : 'sources';
    const sourceTechniqueIds = recordMode === 'jade'
      ? [...(previous?.metadata.sourceTechniqueIds ?? [])]
      : [...new Set([
        ...(previous?.metadata.sourceTechniqueIds ?? []),
        ...request.sourceTechniqueIds,
      ])].sort();
    const techniqueId = `agg:${familyId}:v${revision}`;
    const metadata: TechniqueAggregationMetadata = {
      schemaVersion: 1,
      familyId,
      revision,
      ...(previous ? { previousRevision: previous.metadata.revision } : {}),
      sourceTechniqueIds,
      sourceCount: sourceTechniqueIds.length,
      creatorPlayerId: previous?.metadata.creatorPlayerId ?? context.platformOwnerPlayerId ?? player.playerId,
      revisionAuthorPlayerId: player.playerId,
      revisionKind: recordMode,
      revisionOperationId: request.operationId,
      jadeEnhancementCount: Math.max(0, previous?.metadata.jadeEnhancementCount ?? 0) + (recordMode === 'jade' ? 1 : 0),
      platformInstanceId: context.platformInstanceId,
      platformBuildingId: context.platformBuildingId,
      initialPermissions: previous?.metadata.initialPermissions
        ?? normalizeTechniqueUnificationPermissions(request.permissions),
    };
    this.entries.push({ techniqueId, metadata, name: previous?.name ?? request.customName ?? '未名法脉' });
    return {
      ok: true as const,
      template: { id: techniqueId },
      result: {
        requestId: request.requestId,
        operationId: request.operationId,
        ok: true as const,
        recordMode,
        aggregate: {
          techniqueId,
          familyId,
          revision,
          name: previous?.name ?? request.customName ?? '未名法脉',
          grade: 'mortal' as const,
          category: 'internal' as const,
          sourceCount: sourceTechniqueIds.length,
          sourceTechniqueIds,
          jadeEnhancementCount: metadata.jadeEnhancementCount ?? 0,
          ...(recordMode === 'jade' ? { jadeStrengthPercent: 104 } : {}),
          totalTrainingDifficulty: 100,
          effectMultiplier: 1.1,
        },
      },
      ...(recordMode === 'jade' ? { committedInventoryItems: [] } : {}),
    };
  }
}

function createPlayer(playerId: string, eligibleSourceIds: string[] = [], jadeItemCount = 0): RuntimePlayer {
  return {
    playerId,
    instanceId: 'instance:sect-main',
    x: 10,
    y: 10,
    techniques: { revision: 1, techniques: [] },
    pendingTechniqueComprehensions: [],
    eligibleSourceIds,
    inventory: {
      revision: 1,
      items: jadeItemCount > 0 ? [{
        itemId: 'wudao_yujian',
        itemInstanceId: `jade:${playerId}`,
        count: jadeItemCount,
        slotIndex: 0,
      }] : [],
    },
    dirtyDomains: new Set(),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
