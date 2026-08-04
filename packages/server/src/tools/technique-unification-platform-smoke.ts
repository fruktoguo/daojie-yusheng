import assert from 'node:assert/strict';
import {
  S2C,
  normalizeTechniqueUnificationAccessPolicy,
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
  const owner = createPlayer('player:owner');
  const closeFriend = createPlayer('player:close-friend');
  const innerDisciple = createPlayer('player:inner-disciple');
  const stranger = createPlayer('player:stranger');
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
      const nextPolicy = normalizeTechniqueUnificationAccessPolicy(input.accessPolicy);
      const changed = target.techniqueAggregationFamilyId !== familyId
        || JSON.stringify(target.techniqueAggregationAccessPolicy) !== JSON.stringify(nextPolicy);
      if (changed) {
        target.techniqueAggregationFamilyId = familyId;
        target.techniqueAggregationAccessPolicy = nextPolicy;
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
      async flushPlayerDomains(_playerId: string, domains: string[]) {
        playerFlushes.push(domains);
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
    accessPolicy: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: [] },
    sourceTechniqueIds: ['gen:a', 'gen:b'],
  });
  const boundFamilyId = String(building.techniqueAggregationFamilyId ?? '');
  assert.equal(boundFamilyId, 'family:operation-1');
  assert.deepEqual(building.techniqueAggregationAccessPolicy, {
    unrestricted: false,
    friendLevels: ['close_friend'],
    sectRoles: [],
  });
  assert.equal(instance.dirtyDomains.includes('building'), true);
  assert.equal(instanceFlushes.length > 0, true);
  assert.equal(playerFlushes.length > 0, true);

  delete building.techniqueAggregationFamilyId;
  delete building.techniqueAggregationAccessPolicy;
  await helper.handleRequestPanel(ownerSocket as never, { requestId: 'recover-panel', buildingId: building.id });
  assert.equal(building.techniqueAggregationFamilyId, boundFamilyId);
  assert.deepEqual(building.techniqueAggregationAccessPolicy, {
    unrestricted: false,
    friendLevels: ['close_friend'],
    sectRoles: [],
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
  assert.equal(closeFriendSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).platform.canLearn, true);
  await helper.handleLearn(closeFriendSocket as never, { requestId: 'friend-learn', buildingId: building.id });
  assert.deepEqual(pendingOptions.at(-1), { selfComprehensionAllowed: true });
  assert.equal(closeFriend.pendingTechniqueComprehensions.length, 1);

  const strangerSocket = new TestSocket({ playerId: stranger.playerId });
  await helper.handleLearn(strangerSocket as never, { requestId: 'stranger-learn', buildingId: building.id });
  assert.equal(
    strangerSocket.last<any>(S2C.TechniqueAggregationResult).code,
    'TECHNIQUE_AGGREGATE_ACCESS_DENIED',
  );

  await helper.handleUpdateAccess(ownerSocket as never, {
    requestId: 'access-sect',
    buildingId: building.id,
    accessPolicy: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
  });
  const innerSocket = new TestSocket({ playerId: innerDisciple.playerId });
  await helper.handleRequestPanel(innerSocket as never, { requestId: 'inner-panel', buildingId: building.id });
  assert.equal(innerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).platform.canLearn, true);
  await helper.handleRequestPanel(closeFriendSocket as never, { requestId: 'friend-panel-2', buildingId: building.id });
  assert.equal(closeFriendSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).platform.canLearn, false);

  await helper.handleUpdateAccess(ownerSocket as never, {
    requestId: 'access-open',
    buildingId: building.id,
    accessPolicy: { unrestricted: true, friendLevels: ['dao_friend'], sectRoles: ['leader'] },
  });
  await helper.handleRequestPanel(strangerSocket as never, { requestId: 'stranger-panel', buildingId: building.id });
  assert.equal(strangerSocket.last<TechniqueAggregationPanelView>(S2C.TechniqueAggregationPanel).platform.canLearn, true);
  assert.deepEqual(building.techniqueAggregationAccessPolicy, {
    unrestricted: true,
    friendLevels: [],
    sectRoles: [],
  });

  const nonOwnerAccessSocket = new TestSocket({ playerId: innerDisciple.playerId });
  await helper.handleUpdateAccess(nonOwnerAccessSocket as never, {
    requestId: 'access-forbidden',
    buildingId: building.id,
    accessPolicy: { unrestricted: false, friendLevels: [], sectRoles: [] },
  });
  assert.equal(
    nonOwnerAccessSocket.last<any>(S2C.TechniqueAggregationResult).code,
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
    options: { boundFamilyId?: string; platform: TechniqueUnificationPlatformView },
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
      eligibleSources: [],
      families: latest ? [{
        familyId: latest.metadata.familyId,
        latestRevision: latest.metadata.revision,
        latestTechniqueId: latest.techniqueId,
        name: latest.name,
        grade: 'mortal',
        category: 'internal',
        sourceCount: latest.metadata.sourceCount,
        sourceTechniqueIds: [...latest.metadata.sourceTechniqueIds],
        creatorPlayerId: latest.metadata.creatorPlayerId,
        playerCoveredCount: 0,
      }] : [{
        familyId: 'family:must-not-leak',
        latestRevision: 1,
        latestTechniqueId: 'agg:must-not-leak',
        name: '不应出现',
        grade: 'mortal',
        category: 'internal',
        sourceCount: 2,
        sourceTechniqueIds: ['gen:x', 'gen:y'],
        playerCoveredCount: 0,
      }],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: player.techniques.techniques.length,
      platform: options.platform,
    };
  }

  async publish(
    player: RuntimePlayer,
    request: TechniqueAggregationPublishRequest,
    context: { platformInstanceId?: string; platformBuildingId?: string },
  ) {
    this.lastPublishRequest = { ...request };
    const familyId = request.familyId || this.resolveInitialFamilyId(request.operationId);
    const previous = [...this.entries]
      .filter((entry) => entry.metadata.familyId === familyId)
      .sort((left, right) => right.metadata.revision - left.metadata.revision)[0];
    const revision = previous ? previous.metadata.revision + 1 : 1;
    const sourceTechniqueIds = [...new Set([
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
      creatorPlayerId: player.playerId,
      platformInstanceId: context.platformInstanceId,
      platformBuildingId: context.platformBuildingId,
      initialAccessPolicy: request.accessPolicy,
    };
    this.entries.push({ techniqueId, metadata, name: previous?.name ?? request.customName ?? '未名法脉' });
    return {
      ok: true as const,
      template: { id: techniqueId },
      result: {
        requestId: request.requestId,
        operationId: request.operationId,
        ok: true as const,
        aggregate: {
          techniqueId,
          familyId,
          revision,
          name: previous?.name ?? request.customName ?? '未名法脉',
          grade: 'mortal' as const,
          category: 'internal' as const,
          sourceCount: sourceTechniqueIds.length,
          sourceTechniqueIds,
          totalTrainingDifficulty: 100,
          effectMultiplier: 1.1,
        },
      },
    };
  }
}

function createPlayer(playerId: string): RuntimePlayer {
  return {
    playerId,
    instanceId: 'instance:sect-main',
    x: 10,
    y: 10,
    techniques: { revision: 1, techniques: [] },
    pendingTechniqueComprehensions: [],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
