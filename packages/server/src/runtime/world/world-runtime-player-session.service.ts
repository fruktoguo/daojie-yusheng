import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';

import { PlayerSessionRouteService } from '../../persistence/player-session-route.service';
import { WorldRuntimeWorldAccessService } from './world-runtime-world-access.service';
import { parseRuntimeInstanceDescriptor } from './world-runtime.normalization.helpers';

interface ConnectPlayerInput {
  playerId: string;
  sessionId?: string | null;
  instanceId?: string | null;
  mapId?: string | null;
  preferredX?: number;
  preferredY?: number;
}

interface RuntimePlayerLocation {
  instanceId: string;
  sessionId?: string;
}

interface ConnectedInstancePlayer {
  sessionId: string;
}

interface InstanceRuntimeLike {
  readonly meta: {
    instanceId: string;
  };
  readonly template: {
    id: string;
  };
  connectPlayer(request: {
    playerId: string;
    sessionId: string;
    preferredX?: number;
    preferredY?: number;
  }): ConnectedInstancePlayer;
  disconnectPlayer(playerId: string): boolean;
  setPlayerMoveSpeed(playerId: string, moveSpeed: number): void;
}

interface PlayerRuntimeLike {
  readonly attrs: {
    numericStats: {
      moveSpeed: number;
    };
  };
}

interface RuntimeSessionLogger {
  debug(message: string): void;
  warn(message: string): void;
}

interface TemplateRepositoryLike {
  has(templateId: string): boolean;
}

interface WorldRuntimePlayerSessionDeps {
  logger: RuntimeSessionLogger;
  templateRepository: TemplateRepositoryLike;
  worldRuntimeGmQueueService: {
    clearPendingRespawn(playerId: string): void;
  };
  worldRuntimeNavigationService: {
    clearNavigationIntent(playerId: string): void;
  };
  worldRuntimeSectService?: {
    ensureSectRuntimeInstanceByTemplateId?(templateId: string, deps: WorldRuntimePlayerSessionDeps): InstanceRuntimeLike | null;
  };
  worldSessionService: {
    purgePlayerSession(playerId: string, reason: string): void;
  };
  playerRuntimeService: {
    ensurePlayer(playerId: string, sessionId: string): PlayerRuntimeLike;
    getPlayer(playerId: string): unknown;
    removePlayerRuntime(playerId: string): void;
    syncFromWorldView(playerId: string, sessionId: string, view: unknown): unknown;
  };
  getPlayerLocation(playerId: string): RuntimePlayerLocation | null;
  setPlayerLocation(playerId: string, location: RuntimePlayerLocation): void;
  clearPlayerLocation(playerId: string): void;
  clearPendingCommand(playerId: string): void;
  getInstanceRuntime(instanceId: string): InstanceRuntimeLike | null;
}

interface ResolveTargetInstanceInput {
  playerId: string;
  requestedInstanceId: string;
  requestedMapId: string;
}

interface WorldRuntimeWorldAccessPort {
  resolveDefaultRespawnMapId(deps: WorldRuntimePlayerSessionDeps): string;
  getOrCreatePublicInstance(mapId: string, deps: WorldRuntimePlayerSessionDeps): InstanceRuntimeLike;
  getOrCreateDefaultLineInstance(
    mapId: string,
    linePreset: 'peaceful' | 'real',
    deps: WorldRuntimePlayerSessionDeps,
  ): InstanceRuntimeLike;
  getPlayerViewOrThrow(playerId: string, deps: WorldRuntimePlayerSessionDeps): unknown;
}

@Injectable()
export class WorldRuntimePlayerSessionService {
  private readonly logger = new Logger(WorldRuntimePlayerSessionService.name);

  constructor(
    @Inject(WorldRuntimeWorldAccessService)
    private readonly worldRuntimeWorldAccessService: WorldRuntimeWorldAccessPort,
    @Optional()
    @Inject(PlayerSessionRouteService)
    private readonly playerSessionRouteService: PlayerSessionRouteService | null = null,
  ) {}

  connectPlayer(input: ConnectPlayerInput, deps: WorldRuntimePlayerSessionDeps): unknown {
    const playerId = input.playerId.trim();
    if (!playerId) {
      throw new BadRequestException('playerId is required');
    }

    const sessionId = input.sessionId?.trim() || `session:${playerId}`;
    const requestedInstanceId = normalizeInstanceId(input.instanceId);
    const requestedMapId = normalizeMapId(input.mapId);
    const targetInstance = this.resolveTargetInstance(
      {
        playerId,
        requestedInstanceId,
        requestedMapId,
      },
      deps,
    );

    const previous = deps.getPlayerLocation(playerId);
    if (previous && previous.instanceId !== targetInstance.meta.instanceId) {
      deps.getInstanceRuntime(previous.instanceId)?.disconnectPlayer(playerId);
    }

    const runtimePlayer = targetInstance.connectPlayer({
      playerId,
      sessionId,
      preferredX: input.preferredX,
      preferredY: input.preferredY,
    });
    const playerState = deps.playerRuntimeService.ensurePlayer(playerId, sessionId);
    targetInstance.setPlayerMoveSpeed(playerId, playerState.attrs.numericStats.moveSpeed);
    deps.setPlayerLocation(playerId, {
      instanceId: targetInstance.meta.instanceId,
      sessionId: runtimePlayer.sessionId,
    });
    deps.worldRuntimeGmQueueService.clearPendingRespawn(playerId);
    deps.logger.debug(`玩家 ${playerId} 已附着到实例 ${targetInstance.meta.instanceId}`);
    const view = this.worldRuntimeWorldAccessService.getPlayerViewOrThrow(playerId, deps);
    if (typeof deps.playerRuntimeService.syncFromWorldView === 'function') {
      deps.playerRuntimeService.syncFromWorldView(playerId, runtimePlayer.sessionId, view);
    }
    return view;
  }

  disconnectPlayer(playerId: string, deps: WorldRuntimePlayerSessionDeps): boolean {
    const location = deps.getPlayerLocation(playerId);
    if (!location) {
      return false;
    }

    deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
    deps.clearPendingCommand(playerId);
    deps.worldRuntimeGmQueueService.clearPendingRespawn(playerId);

    const disconnected =
      deps.getInstanceRuntime(location.instanceId)?.disconnectPlayer(playerId) ?? false;
    deps.clearPlayerLocation(playerId);
    return disconnected;
  }

  async assignPlayerRoute(input: {
    playerId: string;
    nodeId: string;
    sessionEpoch: number;
    routeStatus?: string | null;
  }): Promise<void> {
    if (!this.playerSessionRouteService) {
      return;
    }

    await this.playerSessionRouteService.registerRoute({
      playerId: input.playerId,
      nodeId: input.nodeId,
      sessionEpoch: input.sessionEpoch,
      routeStatus: input.routeStatus ?? 'assigned',
    });
  }

  removePlayer(
    playerId: string,
    reason: string = 'removed',
    deps: WorldRuntimePlayerSessionDeps,
  ): boolean {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return false;
    }

    const routeSessionEpoch = resolveSessionEpoch(
      deps.playerRuntimeService.getPlayer(normalizedPlayerId) as { sessionEpoch?: number | null } | null | undefined,
    );

    if (typeof deps.worldSessionService?.purgePlayerSession === 'function') {
      deps.worldSessionService.purgePlayerSession(normalizedPlayerId, reason);
    }
    if (this.playerSessionRouteService) {
      void this.playerSessionRouteService.clearLocalRoute(normalizedPlayerId, routeSessionEpoch).catch((error) => {
        this.logger.error(
          `清理玩家会话路由失败：${normalizedPlayerId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }
    deps.worldRuntimeNavigationService.clearNavigationIntent(normalizedPlayerId);
    deps.clearPendingCommand(normalizedPlayerId);
    deps.worldRuntimeGmQueueService.clearPendingRespawn(normalizedPlayerId);

    const disconnected = this.disconnectPlayer(normalizedPlayerId, deps);
    const runtimePlayer = deps.playerRuntimeService.getPlayer(normalizedPlayerId);
    if (!runtimePlayer) {
      return disconnected;
    }

    deps.playerRuntimeService.removePlayerRuntime(normalizedPlayerId);
    return true;
  }

  private resolveTargetInstance(
    input: ResolveTargetInstanceInput,
    deps: WorldRuntimePlayerSessionDeps,
  ): InstanceRuntimeLike {
    const requestedSectTemplateId = resolveSectTemplateIdFromSessionRequest(input, deps);
    if (requestedSectTemplateId && typeof deps.worldRuntimeSectService?.ensureSectRuntimeInstanceByTemplateId === 'function') {
      const sectInstance = deps.worldRuntimeSectService.ensureSectRuntimeInstanceByTemplateId(requestedSectTemplateId, deps);
      if (sectInstance) {
        return sectInstance;
      }
    }

    const requestedInstance = input.requestedInstanceId
      ? deps.getInstanceRuntime(input.requestedInstanceId)
      : null;
    if (requestedInstance) {
      if (input.requestedMapId && requestedInstance.template.id !== input.requestedMapId) {
        deps.logger.warn(
          `玩家 ${input.playerId} 请求的 instanceId/templateId 不一致，已优先采用 instanceId：instanceId=${input.requestedInstanceId} templateId=${input.requestedMapId} resolvedTemplateId=${requestedInstance.template.id}`,
        );
      }
      return requestedInstance;
    }

    const publicMapIdFromInstance = resolvePublicMapIdFromInstanceId(
      input.requestedInstanceId,
      deps,
    );
    const targetMapId =
      input.requestedMapId
      || publicMapIdFromInstance
      || this.worldRuntimeWorldAccessService.resolveDefaultRespawnMapId(deps);
    if (!targetMapId) {
      throw new NotFoundException('No map template available');
    }

    if (input.requestedInstanceId && !publicMapIdFromInstance) {
      deps.logger.warn(
        `玩家 ${input.playerId} 恢复落点 instanceId 未命中现有实例，且无法映射为公共实例，已退回 mapId：instanceId=${input.requestedInstanceId} templateId=${targetMapId}`,
      );
    }
    return this.worldRuntimeWorldAccessService.getOrCreateDefaultLineInstance(
      targetMapId,
      resolvePlayerWorldPreferenceLinePreset(input.playerId, deps),
      deps,
    );
  }
}

function normalizeInstanceId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMapId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolvePublicMapIdFromInstanceId(
  instanceId: string,
  deps: Pick<WorldRuntimePlayerSessionDeps, 'templateRepository'>,
): string {
  const descriptor = parseRuntimeInstanceDescriptor(instanceId);
  if (!descriptor?.defaultEntry || descriptor.linePreset !== 'peaceful') {
    return '';
  }
  const templateId = descriptor.templateId;
  if (!templateId || !deps.templateRepository.has(templateId)) {
    return '';
  }
  return templateId;
}

function resolveSectTemplateIdFromSessionRequest(
  input: ResolveTargetInstanceInput,
  deps: Pick<WorldRuntimePlayerSessionDeps, 'templateRepository'>,
): string {
  if (input.requestedMapId?.startsWith('sect_domain:')) {
    return input.requestedMapId;
  }
  const descriptor = parseRuntimeInstanceDescriptor(input.requestedInstanceId);
  const templateId = descriptor?.templateId;
  if (templateId?.startsWith('sect_domain:') && deps.templateRepository.has(templateId)) {
    return templateId;
  }
  return '';
}

function resolvePlayerWorldPreferenceLinePreset(
  playerId: string,
  deps: Pick<WorldRuntimePlayerSessionDeps, 'playerRuntimeService'>,
): 'peaceful' | 'real' {
  const player = deps.playerRuntimeService.getPlayer(playerId) as
    | { worldPreference?: { linePreset?: unknown } }
    | null;
  return player?.worldPreference?.linePreset === 'real' ? 'real' : 'peaceful';
}

function resolveSessionEpoch(player: { sessionEpoch?: number | null } | null | undefined): number | undefined {
  const sessionEpoch = Number(player?.sessionEpoch ?? 0);
  if (!Number.isFinite(sessionEpoch) || sessionEpoch <= 0) {
    return undefined;
  }
  return Math.max(1, Math.trunc(sessionEpoch));
}
