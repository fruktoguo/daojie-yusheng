/**
 * 统法台功法统合网络入口。
 *
 * 该 helper 负责 socket 鉴权、统法台位置与参阅/修订权限校验，以及建筑法脉绑定；
 * 功法编纂规则与不可变版本发布仍由 TechniqueAggregationService 保持权威。
 */
import {
  DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
  S2C,
  TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID,
  type TechniqueAggregationErrorView,
  type TechniqueAggregationLearnRequest,
  type TechniqueAggregationPanelView,
  type TechniqueAggregationPreviewRequest,
  type TechniqueAggregationPublishRequest,
  type TechniqueAggregationResultView,
  type TechniqueUnificationPermissions,
  type TechniqueUnificationLearnerState,
  type TechniqueUnificationPlatformView,
  normalizeTechniqueUnificationPermissions,
} from '@mud/shared';
import type { Socket } from 'socket.io';
import type { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import type { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import type { BuildingAccessPolicyService } from '../runtime/access/building-access-policy.service';
import type { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import type { WorldClientEventService } from './world-client-event.service';
import type { WorldGatewayGuardHelper } from './world-gateway-guard.helper';
import type { WorldSyncService } from './world-sync.service';
import type { TechniqueAggregationService } from '../runtime/technique-generation/technique-aggregation.service';

const AGGREGATION_RANGE = 1;

type AggregationBuildingCheck = {
  ok: true;
  player: any;
  building: any;
  instance: any;
} | {
  ok: false;
  error: TechniqueAggregationErrorView;
};

interface TechniqueAggregationGatewayDeps {
  gatewayGuardHelper: Pick<WorldGatewayGuardHelper, 'requirePlayerId'>;
  playerRuntimeService: Pick<
    PlayerRuntimeService,
    | 'getPlayer'
    | 'learnPublishedAggregateTechniqueById'
    | 'addPendingTechniqueComprehensionById'
    | 'resolveTechniqueLearningConflict'
  > & {
    runExclusiveAssetMutation?: <T>(playerIds: readonly string[], action: () => Promise<T> | T) => Promise<T>;
  };
  worldRuntimeService: Pick<WorldRuntimeService, 'getInstanceRuntime' | 'flushInstanceDomains'>;
  buildingAccessPolicyService?: Pick<
    BuildingAccessPolicyService,
    'buildTechniquePlatformResource' | 'evaluateTechniquePlatform' | 'resolveTechniquePlatformPolicies'
  >;
  playerPersistenceFlushService?: Pick<PlayerPersistenceFlushService, 'flushPlayerDomains'>;
  worldClientEventService: Pick<WorldClientEventService, 'markProtocol' | 'emitGatewayError'>;
  worldSyncService: Pick<WorldSyncService, 'emitDeltaSync'>;
}

export class WorldGatewayTechniqueAggregationHelper {
  private readonly platformMutationTails = new Map<string, Promise<void>>();
  private aggregationService: TechniqueAggregationService | null = null;

  constructor(private readonly deps: TechniqueAggregationGatewayDeps) {}

  setService(service: TechniqueAggregationService): void {
    this.aggregationService = service;
  }

  async handleRequestPanel(client: Socket, payload: TechniqueAggregationPreviewRequest): Promise<void> {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return;
    this.deps.worldClientEventService.markProtocol(client, 'mainline');
    const request = this.normalizePreviewRequest(payload);
    try {
      const check = this.checkBuilding(playerId, request.buildingId);
      if ('error' in check) {
        client.emit(S2C.TechniqueAggregationPanel, this.errorPanel(request, check.error));
        return;
      }
      if (!this.aggregationService) {
        client.emit(S2C.TechniqueAggregationPanel, this.errorPanel(
          request,
          this.error('TECHNIQUE_AGGREGATE_NOT_READY'),
          check,
        ));
        return;
      }
      const panel = await this.runExclusivePlatformMutation(check, async () => {
        const current = this.checkBuilding(playerId, request.buildingId);
        if ('error' in current) return this.errorPanel(request, current.error);
        await this.recoverPlatformBinding(current);
        return this.buildPanel(current, request);
      });
      client.emit(S2C.TechniqueAggregationPanel, panel);
    } catch (error) {
      this.deps.worldClientEventService.emitGatewayError(client, 'TECHNIQUE_AGGREGATION_PANEL_FAILED', error);
      client.emit(S2C.TechniqueAggregationPanel, this.errorPanel(
        request,
        this.error('TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE'),
      ));
    }
  }

  async handlePublish(client: Socket, payload: TechniqueAggregationPublishRequest): Promise<void> {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return;
    this.deps.worldClientEventService.markProtocol(client, 'mainline');
    const request = this.normalizePublishRequest(payload);
    const check = this.checkBuilding(playerId, request.buildingId);
    if ('error' in check) {
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(request, check.error, 'publish'));
      return;
    }
    if (!this.aggregationService) {
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(
        request,
        this.error('TECHNIQUE_AGGREGATE_NOT_READY'),
        'publish',
      ));
      return;
    }
    try {
      const outcome = await this.runExclusivePlatformMutation(check, async () => {
        const publishAndApply = async () => {
          const current = this.checkBuilding(playerId, request.buildingId);
          if ('error' in current) {
            return { ok: false as const, result: this.resultFromError(request, current.error, 'publish') };
          }
          await this.recoverPlatformBinding(current);
          const boundFamilyId = normalizeText(current.building.techniqueAggregationFamilyId);
          const isOwner = this.isPlatformOwner(current.building, playerId);
          const access = boundFamilyId
            ? await this.resolvePlatformAccess(current.building, playerId)
            : { read: false, revision: isOwner };
          const revisionPermissionGranted = access.revision;
          if ((!boundFamilyId && !isOwner) || (boundFamilyId && !revisionPermissionGranted)) {
            return {
              ok: false as const,
              result: this.resultFromError(
                request,
                this.error(boundFamilyId
                  ? 'TECHNIQUE_AGGREGATE_REVISION_PERMISSION_DENIED'
                  : 'TECHNIQUE_AGGREGATE_PLATFORM_OWNER_REQUIRED'),
                'publish',
              ),
            };
          }
          if (!boundFamilyId && request.familyId) {
            return {
              ok: false as const,
              result: this.resultFromError(
                request,
                this.error('TECHNIQUE_AGGREGATE_PLATFORM_MISMATCH'),
                'publish',
              ),
            };
          }
          const isInitialReplay = Boolean(
            boundFamilyId
            && !request.familyId
            && request.operationId
            && this.aggregationService!.resolveInitialFamilyId(request.operationId, playerId) === boundFamilyId,
          );
          const authoritativeRequest: TechniqueAggregationPublishRequest = {
            ...request,
            familyId: isInitialReplay ? undefined : boundFamilyId || undefined,
          };
          const initialPermissions = this.resolvePlatformPolicies(current.building);
          const published = await this.aggregationService!.publish(current.player, authoritativeRequest, {
            platformInstanceId: current.instance.meta.instanceId,
            platformBuildingId: current.building.id,
            platformOwnerPlayerId: normalizeText(current.building.ownerPlayerId),
            revisionPermissionGranted,
            initialPermissions,
          });
          if (!published.ok || !published.result.aggregate) {
            return published;
          }
          if (boundFamilyId && published.result.aggregate.familyId !== boundFamilyId) {
            return {
              ok: false as const,
              result: this.resultFromError(
                request,
                this.error('TECHNIQUE_AGGREGATE_PLATFORM_ALREADY_BOUND'),
                'publish',
              ),
            };
          }
          if (!boundFamilyId) {
            this.bindPlatform(
              current,
              published.result.aggregate.familyId,
              published.result.aggregate.name,
              initialPermissions,
            );
          }
          const learned = this.deps.playerRuntimeService.learnPublishedAggregateTechniqueById(
            playerId,
            published.result.aggregate.techniqueId,
          );
          if (!learned) {
            return {
              ok: false as const,
              result: this.resultFromError(
                request,
                this.error('TECHNIQUE_AGGREGATE_LEARN_REJECTED'),
                'publish',
              ),
            };
          }
          await this.deps.playerPersistenceFlushService?.flushPlayerDomains(playerId, [
            'technique',
            'attr',
            'auto_battle_skill',
            'combat_pref',
          ]);
          await this.flushPlatform(current);
          return {
            ...published,
            result: { ...published.result, operation: 'publish' as const },
          };
        };
        return this.runExclusivePlayerMutation(playerId, publishAndApply);
      });
      client.emit(S2C.TechniqueAggregationResult, outcome.result);
      if (!outcome.ok || !outcome.result.aggregate) return;
      this.deps.worldSyncService.emitDeltaSync(playerId, client);
      await this.emitCurrentPanel(client, playerId, request);
    } catch (error) {
      this.deps.worldClientEventService.emitGatewayError(client, 'TECHNIQUE_AGGREGATION_FAILED', error);
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(
        request,
        this.error('TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE'),
        'publish',
      ));
    }
  }

  async handleLearn(client: Socket, payload: TechniqueAggregationLearnRequest): Promise<void> {
    const playerId = this.deps.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) return;
    this.deps.worldClientEventService.markProtocol(client, 'mainline');
    const request = this.normalizeLearnRequest(payload);
    const check = this.checkBuilding(playerId, request.buildingId);
    if ('error' in check) {
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(request, check.error, 'learn'));
      return;
    }
    if (!this.aggregationService) {
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(
        request,
        this.error('TECHNIQUE_AGGREGATE_NOT_READY'),
        'learn',
      ));
      return;
    }
    try {
      const result = await this.runExclusivePlatformMutation(check, async () => {
        const learnAndPersist = async (): Promise<TechniqueAggregationResultView> => {
          const current = this.checkBuilding(playerId, request.buildingId);
          if ('error' in current) return this.resultFromError(request, current.error, 'learn');
          await this.recoverPlatformBinding(current);
          const familyId = normalizeText(current.building.techniqueAggregationFamilyId);
          if (!familyId) {
            return this.resultFromError(request, this.error('TECHNIQUE_AGGREGATE_PLATFORM_UNBOUND'), 'learn');
          }
          if (!(await this.resolvePlatformAccess(current.building, playerId)).read) {
            return this.resultFromError(request, this.error('TECHNIQUE_AGGREGATE_ACCESS_DENIED'), 'learn');
          }
          const latest = this.resolveLatestFamilyEntry(familyId);
          if (!latest) {
            return this.resultFromError(request, this.error('TECHNIQUE_AGGREGATE_NOT_READY'), 'learn');
          }
          const player = current.player;
          const alreadyLearned = (player.techniques?.techniques ?? [])
            .some((entry: any) => normalizeText(entry?.techId) === latest.techniqueId);
          const alreadyPending = (player.pendingTechniqueComprehensions ?? [])
            .some((entry: any) => normalizeText(entry?.techId) === latest.techniqueId);
          if (!alreadyLearned && !alreadyPending) {
            const conflict = this.deps.playerRuntimeService.resolveTechniqueLearningConflict(player, latest.techniqueId);
            if (conflict) return this.resultFromError(request, conflict, 'learn');
            const added = this.deps.playerRuntimeService.addPendingTechniqueComprehensionById(
              playerId,
              latest.techniqueId,
              'created',
              latest.metadata.creatorPlayerId ?? null,
              { selfComprehensionAllowed: true },
            );
            if (!added) {
              return this.resultFromError(request, this.error('TECHNIQUE_AGGREGATE_LEARN_REJECTED'), 'learn');
            }
          }
          await this.deps.playerPersistenceFlushService?.flushPlayerDomains(playerId, [
            'technique',
            'auto_battle_skill',
            'combat_pref',
          ]);
          return { requestId: request.requestId, ok: true, operation: 'learn' };
        };
        return this.runExclusivePlayerMutation(playerId, learnAndPersist);
      });
      client.emit(S2C.TechniqueAggregationResult, result);
      if (!result.ok) return;
      this.deps.worldSyncService.emitDeltaSync(playerId, client);
      await this.emitCurrentPanel(client, playerId, request);
    } catch (error) {
      this.deps.worldClientEventService.emitGatewayError(client, 'TECHNIQUE_AGGREGATION_LEARN_FAILED', error);
      client.emit(S2C.TechniqueAggregationResult, this.resultFromError(
        request,
        this.error('TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE'),
        'learn',
      ));
    }
  }

  private async emitCurrentPanel(
    client: Socket,
    playerId: string,
    request: TechniqueAggregationPreviewRequest,
  ): Promise<void> {
    const check = this.checkBuilding(playerId, request.buildingId);
    if ('error' in check || !this.aggregationService) return;
    client.emit(S2C.TechniqueAggregationPanel, await this.buildPanel(check, request));
  }

  private async buildPanel(
    check: Extract<AggregationBuildingCheck, { ok: true }>,
    request: TechniqueAggregationPreviewRequest,
  ): Promise<TechniqueAggregationPanelView> {
    const familyId = normalizeText(check.building.techniqueAggregationFamilyId);
    const isOwner = this.isPlatformOwner(check.building, check.player.playerId);
    const access = familyId
      ? await this.resolvePlatformAccess(check.building, check.player.playerId)
      : { read: false, revision: isOwner };
    const canLearn = access.read;
    const canRevise = access.revision;
    const platform = this.buildPlatformView(check, isOwner, canLearn, canRevise);
    const panel = this.aggregationService!.buildPanel(check.player, request, {
      includeEligibleSources: canRevise,
      ...(familyId ? { boundFamilyId: familyId } : {}),
      platform,
    });
    if (!familyId) panel.families = [];
    return panel;
  }

  private buildPlatformView(
    check: Extract<AggregationBuildingCheck, { ok: true }>,
    isOwner: boolean,
    canLearn: boolean,
    canRevise: boolean,
  ): TechniqueUnificationPlatformView {
    const familyId = normalizeText(check.building.techniqueAggregationFamilyId);
    const latest = familyId ? this.resolveLatestFamilyEntry(familyId) : null;
    const learner = latest ? this.resolveLearnerState(check.player, latest.techniqueId, latest.metadata.revision) : null;
    return {
      buildingId: check.building.id,
      displayName: normalizeText(check.building.name) || '统法台',
      ...(normalizeText(check.building.ownerPlayerId) ? { ownerPlayerId: normalizeText(check.building.ownerPlayerId) } : {}),
      isOwner,
      ...(familyId ? { familyId } : {}),
      accessPolicyResource: this.deps.buildingAccessPolicyService?.buildTechniquePlatformResource(check.building.id) ?? {
        resourceType: 'technique_unification_platform',
        resourceId: check.building.id,
      },
      canLearn,
      canRevise,
      learnerState: latest ? learner?.state ?? 'available' : 'unbound',
      ...(latest ? {
        latestTechniqueId: latest.techniqueId,
        latestRevision: latest.metadata.revision,
      } : {}),
      ...(learner?.pendingProgress !== undefined ? { pendingProgress: learner.pendingProgress } : {}),
      ...(learner?.pendingRequiredProgress !== undefined
        ? { pendingRequiredProgress: learner.pendingRequiredProgress }
        : {}),
    };
  }

  private resolveLearnerState(
    player: any,
    latestTechniqueId: string,
    latestRevision: number,
  ): {
    state: TechniqueUnificationLearnerState;
    pendingProgress?: number;
    pendingRequiredProgress?: number;
  } {
    const learned = (player?.techniques?.techniques ?? []).find((entry: any) => {
      const metadata = this.aggregationService?.getMetadataById(normalizeText(entry?.techId));
      const latestMetadata = this.aggregationService?.getMetadataById(latestTechniqueId);
      return metadata && latestMetadata
        && metadata.familyId === latestMetadata.familyId
        && metadata.revision >= latestRevision;
    });
    if (learned) return { state: 'learned' };
    const pending = (player?.pendingTechniqueComprehensions ?? []).find((entry: any) => {
      const metadata = this.aggregationService?.getMetadataById(normalizeText(entry?.techId));
      const latestMetadata = this.aggregationService?.getMetadataById(latestTechniqueId);
      return metadata && latestMetadata
        && metadata.familyId === latestMetadata.familyId
        && metadata.revision >= latestRevision;
    });
    if (!pending) return { state: 'available' };
    return {
      state: 'pending',
      pendingProgress: Math.max(0, Number(pending.progress) || 0),
      pendingRequiredProgress: Math.max(1, Number(pending.requiredProgress) || 1),
    };
  }

  private async recoverPlatformBinding(check: Extract<AggregationBuildingCheck, { ok: true }>): Promise<void> {
    if (!this.aggregationService) return;
    const currentFamilyId = normalizeText(check.building.techniqueAggregationFamilyId);
    if (currentFamilyId) {
      const latest = this.aggregationService.getLatestAggregateForFamily(currentFamilyId);
      if (!latest) return;
      const changed = this.bindPlatform(
        check,
        currentFamilyId,
        latest.template.name,
        this.resolvePlatformPolicies(check.building),
      );
      if (changed) await this.flushPlatform(check);
      return;
    }
    const recovered = this.aggregationService.findLatestAggregateForPlatform(
      check.instance.meta.instanceId,
      check.building.id,
    );
    if (!recovered) return;
    const changed = this.bindPlatform(
      check,
      recovered.metadata.familyId,
      recovered.template.name,
      recovered.metadata.initialPermissions,
    );
    if (changed) await this.flushPlatform(check);
  }

  private bindPlatform(
    check: Extract<AggregationBuildingCheck, { ok: true }>,
    familyId: string,
    techniqueName?: string,
    accessPolicies?: TechniqueUnificationPermissions,
  ): boolean {
    const currentFamilyId = normalizeText(check.building.techniqueAggregationFamilyId);
    if (currentFamilyId && currentFamilyId !== familyId) {
      throw new Error(`technique_unification_platform_already_bound:${check.building.id}`);
    }
    return this.writePlatformState(check, familyId, techniqueName, accessPolicies);
  }

  private writePlatformState(
    check: Extract<AggregationBuildingCheck, { ok: true }>,
    familyId: string,
    techniqueName?: string,
    accessPolicies?: TechniqueUnificationPermissions,
  ): boolean {
    const mutation = check.instance.updateTechniqueUnificationPlatformState?.(
      check.building.id,
      { familyId, techniqueName, accessPolicies },
    );
    if (!mutation?.ok) {
      throw new Error(`${mutation?.reason ?? 'technique_unification_platform_runtime_unavailable'}:${check.building.id}`);
    }
    return mutation.changed === true;
  }

  private async flushPlatform(check: Extract<AggregationBuildingCheck, { ok: true }>): Promise<void> {
    const result = await this.deps.worldRuntimeService.flushInstanceDomains?.(
      check.instance.meta.instanceId,
      ['building'],
    );
    if (check.instance.meta.persistent === true && result?.skipped === true) {
      throw new Error(`technique_unification_platform_flush_skipped:${check.building.id}`);
    }
  }

  private resolveLatestFamilyEntry(familyId: string) {
    return this.aggregationService?.getLatestAggregateForFamily(familyId) ?? null;
  }

  private resolvePlatformPolicies(building: any): TechniqueUnificationPermissions {
    return this.deps.buildingAccessPolicyService?.resolveTechniquePlatformPolicies(building)
      ?? normalizeTechniqueUnificationPermissions(building?.accessPolicies, DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS);
  }

  private async resolvePlatformAccess(building: any, playerId: string): Promise<{ read: boolean; revision: boolean }> {
    return this.deps.buildingAccessPolicyService?.evaluateTechniquePlatform(playerId, building)
      ?? { read: false, revision: this.isPlatformOwner(building, playerId) };
  }

  private isPlatformOwner(building: any, playerId: string): boolean {
    return normalizeText(building?.ownerPlayerId) === normalizeText(playerId);
  }

  private checkBuilding(playerId: string, buildingIdInput: unknown): AggregationBuildingCheck {
    const player = this.deps.playerRuntimeService.getPlayer(playerId);
    if (!player) return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_PERMISSION_DENIED') };
    const buildingId = normalizeText(buildingIdInput);
    if (!buildingId) return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_REQUIRED') };
    const instance = this.deps.worldRuntimeService.getInstanceRuntime(player.instanceId);
    const building = instance?.buildingById?.get?.(buildingId) ?? null;
    if (!building || building.defId !== TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID || building.state !== 'active') {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_INVALID') };
    }
    const dx = Math.abs(Math.floor(Number(player.x) || 0) - Math.floor(Number(building.x) || 0));
    const dy = Math.abs(Math.floor(Number(player.y) || 0) - Math.floor(Number(building.y) || 0));
    if (Math.max(dx, dy) > AGGREGATION_RANGE) {
      return { ok: false, error: this.error('TECHNIQUE_AGGREGATE_BUILDING_OUT_OF_RANGE') };
    }
    return { ok: true, player, building, instance };
  }

  private normalizePreviewRequest(payload: TechniqueAggregationPreviewRequest): TechniqueAggregationPreviewRequest {
    return {
      requestId: normalizeText(payload?.requestId) || undefined,
      buildingId: normalizeText(payload?.buildingId) || undefined,
    };
  }

  private normalizePublishRequest(payload: TechniqueAggregationPublishRequest): TechniqueAggregationPublishRequest {
    return {
      requestId: normalizeText(payload?.requestId) || undefined,
      operationId: normalizeText(payload?.operationId) || undefined,
      buildingId: normalizeText(payload?.buildingId) || undefined,
      familyId: normalizeText(payload?.familyId) || undefined,
      expectedRevision: Number.isFinite(Number(payload?.expectedRevision))
        ? Math.trunc(Number(payload.expectedRevision))
        : undefined,
      customName: typeof payload?.customName === 'string' ? payload.customName : undefined,
      sourceTechniqueIds: Array.isArray(payload?.sourceTechniqueIds)
        ? payload.sourceTechniqueIds.map(normalizeText).filter(Boolean)
        : [],
    };
  }

  private normalizeLearnRequest(payload: TechniqueAggregationLearnRequest): TechniqueAggregationLearnRequest {
    return {
      requestId: normalizeText(payload?.requestId) || undefined,
      buildingId: normalizeText(payload?.buildingId) || undefined,
    };
  }

  private errorPanel(
    request: TechniqueAggregationPreviewRequest,
    error: TechniqueAggregationErrorView,
    check?: Extract<AggregationBuildingCheck, { ok: true }>,
  ): TechniqueAggregationPanelView {
    return {
      requestId: request.requestId,
      buildingId: request.buildingId,
      revision: Math.max(1, Number(check?.player?.techniques?.revision) || 1),
      eligibleSources: [],
      families: [],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: 0,
      platform: {
        buildingId: normalizeText(request.buildingId) || 'unknown',
        displayName: normalizeText(check?.building?.name) || '统法台',
        isOwner: false,
        accessPolicyResource: this.deps.buildingAccessPolicyService?.buildTechniquePlatformResource(
          normalizeText(request.buildingId) || 'unknown',
        ) ?? {
          resourceType: 'technique_unification_platform',
          resourceId: normalizeText(request.buildingId) || 'unknown',
        },
        canLearn: false,
        canRevise: false,
        learnerState: 'unbound',
      },
      error,
    };
  }

  private error(code: TechniqueAggregationErrorView['code']): TechniqueAggregationErrorView {
    return { code, messageKey: 'technique.aggregation.' + code.toLowerCase() };
  }

  private resultFromError(
    request: { requestId?: string; operationId?: string },
    error: TechniqueAggregationErrorView,
    operation: NonNullable<TechniqueAggregationResultView['operation']>,
  ): TechniqueAggregationResultView {
    return {
      requestId: request.requestId,
      operationId: request.operationId,
      ok: false,
      operation,
      code: error.code,
      messageKey: error.messageKey,
      vars: error.vars,
      conflictAggregateIds: error.conflictAggregateIds,
      conflictSourceTechniqueIds: error.conflictSourceTechniqueIds,
      invalidTechniqueIds: error.invalidTechniqueIds,
    };
  }

  private runExclusivePlayerMutation<T>(playerId: string, action: () => Promise<T> | T): Promise<T> {
    return this.deps.playerRuntimeService.runExclusiveAssetMutation
      ? this.deps.playerRuntimeService.runExclusiveAssetMutation([playerId], action)
      : Promise.resolve(action());
  }

  private runExclusivePlatformMutation<T>(
    check: Extract<AggregationBuildingCheck, { ok: true }>,
    action: () => Promise<T>,
  ): Promise<T> {
    const key = `${normalizeText(check.instance?.meta?.instanceId)}\u0000${normalizeText(check.building?.id)}`;
    const previous = this.platformMutationTails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.platformMutationTails.set(key, tail);
    return previous
      .catch(() => undefined)
      .then(action)
      .finally(() => {
        release();
        if (this.platformMutationTails.get(key) === tail) this.platformMutationTails.delete(key);
      });
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
