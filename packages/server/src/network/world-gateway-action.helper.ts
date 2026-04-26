import {
  C2S,
  parseTileTargetRef,
  type GridPoint,
  type ClientToServerEventPayload,
} from '@mud/shared';
import type { Socket } from 'socket.io';

interface TileDetailPayload extends GridPoint {
  [key: string]: unknown;
}

interface ProtocolActionResult {
  kind: string;
  npcShop?: unknown;
  npcQuests?: unknown;
}

interface WorldGatewayActionDeps {
  gatewayGuardHelper: {
    requirePlayerId(client: Socket): string | null | undefined;
  };
  worldClientEventService: {
    markProtocol(client: Socket, protocol: 'mainline'): void;
    emitGatewayError(client: Socket, code: string, error: unknown): void;
    getExplicitProtocol(client: Socket): 'mainline' | string;
  };
  gatewayClientEmitHelper: {
    emitNpcShop(client: Socket, payload: unknown): void;
    emitQuests(client: Socket, payload: unknown): void;
  };
  worldProtocolProjectionService: {
    emitTileLootInteraction(client: Socket, playerId: string, payload: TileDetailPayload): void;
  };
  playerRuntimeService: {
    getPlayerOrThrow(playerId: string): GridPoint;
  };
  worldRuntimeService: {
    buildTileDetail(playerId: string, tile: GridPoint): TileDetailPayload;
    buildQuestListView(playerId: string): unknown;
    worldRuntimeCommandIntakeFacadeService: {
      enqueueResetPlayerSpawn(playerId: string, deps: unknown): void;
      enqueueBattleTarget(
        playerId: string,
        locked: boolean,
        targetPlayerId: string | null,
        targetMonsterId: string | null,
        targetX: number | undefined,
        targetY: number | undefined,
        deps: unknown,
      ): void;
      enqueueNpcInteraction(playerId: string, actionId: string, deps: unknown): void;
      executeAction(playerId: string, actionId: string, target: string | undefined, deps: unknown): ProtocolActionResult;
      enqueueRedeemCodes(playerId: string, codes: string[], deps: unknown): void;
      usePortal(playerId: string, deps: unknown): void;
      enqueueCultivate(playerId: string, techId: string | null, deps: unknown): void;
      enqueueCastSkill(
        playerId: string,
        skillId: string,
        targetPlayerId: string | null,
        targetMonsterId: string | null,
        targetRef: string | null,
        deps: unknown,
      ): void;
      enqueueCastSkillTargetRef(playerId: string, actionId: string, target: string, deps: unknown): void;
    };
  };
}

/** 世界 socket 小型 action helper：收敛 redeem / portal / cultivate / cast skill 入口。 */
export class WorldGatewayActionHelper {
  constructor(private readonly gateway: WorldGatewayActionDeps) {}

  private isDirectRuntimeAction(actionId: string): boolean {
    return actionId === 'body_training:infuse' || actionId === 'world:migrate';
  }

  handleRedeemCodes(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RedeemCodes>,
  ): void {
    this.executeRedeemCodes(client, payload);
  }

  handleUseAction(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.UseAction>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    this.gateway.worldClientEventService.markProtocol(client, 'mainline');
    try {
      this.handleProtocolAction(client, playerId, payload);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'USE_ACTION_FAILED', error);
    }
  }

  private handleProtocolAction(
    client: Socket,
    playerId: string,
    payload: ClientToServerEventPayload<typeof C2S.UseAction>,
  ): void {
    const actionId = this.resolveActionId(payload);
    if (actionId === 'debug:reset_spawn' || actionId === 'travel:return_spawn') {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueResetPlayerSpawn(playerId, this.gateway.worldRuntimeService);
      return;
    }

    if (actionId === 'loot:open') {
      const tile = typeof payload?.target === 'string' ? parseTileTargetRef(payload.target) : null;
      if (!tile) {
        throw new Error('拿取需要指定目标格子');
      }

      const player = this.gateway.playerRuntimeService.getPlayerOrThrow(playerId);
      if (Math.max(Math.abs(player.x - tile.x), Math.abs(player.y - tile.y)) > 1) {
        throw new Error('拿取范围只有 1 格。');
      }

      this.gateway.worldProtocolProjectionService.emitTileLootInteraction(
        client,
        playerId,
        this.gateway.worldRuntimeService.buildTileDetail(playerId, tile),
      );
      return;
    }

    if (actionId === 'battle:engage' || actionId === 'battle:force_attack') {
      const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
      const tile = target ? parseTileTargetRef(target) : null;
      const targetPlayerId = target.startsWith('player:') ? target.slice('player:'.length) : null;
      const targetMonsterId = target && !target.startsWith('player:') && !tile ? target : null;
      if (targetMonsterId) {
        this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueBattleTarget(
          playerId,
          actionId === 'battle:force_attack',
          null,
          targetMonsterId,
          undefined,
          undefined,
          this.gateway.worldRuntimeService,
        );
        return;
      }

      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueBattleTarget(
        playerId,
        actionId === 'battle:force_attack',
        targetPlayerId,
        null,
        tile?.x,
        tile?.y,
        this.gateway.worldRuntimeService,
      );
      return;
    }

    if (actionId.startsWith('npc:')) {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueNpcInteraction(playerId, actionId, this.gateway.worldRuntimeService);
      return;
    }

    const target = typeof payload?.target === 'string' ? payload.target.trim() : '';
    if (this.isDirectRuntimeAction(actionId)) {
      this.emitProtocolActionResult(
        client,
        playerId,
        this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.executeAction(playerId, actionId, target, this.gateway.worldRuntimeService),
      );
      return;
    }

    if (target) {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCastSkillTargetRef(playerId, actionId, target, this.gateway.worldRuntimeService);
      return;
    }

    this.emitProtocolActionResult(
      client,
      playerId,
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.executeAction(playerId, actionId, undefined, this.gateway.worldRuntimeService),
    );
  }

  private resolveActionId(payload: ClientToServerEventPayload<typeof C2S.UseAction>): string {
    const actionId =
      typeof payload?.actionId === 'string' && payload.actionId.trim()
        ? payload.actionId.trim()
        : typeof payload?.type === 'string'
          ? payload.type.trim()
          : '';
    if (!actionId) {
      throw new Error('actionId is required');
    }
    return actionId;
  }

  private emitProtocolActionResult(
    client: Socket,
    playerId: string,
    result: ProtocolActionResult,
  ): void {
    if (result.kind === 'npcShop' && result.npcShop) {
      this.gateway.gatewayClientEmitHelper.emitNpcShop(client, result.npcShop);
      return;
    }

    if (result.kind !== 'npcQuests') {
      return;
    }

    this.gateway.gatewayClientEmitHelper.emitQuests(
      client,
      this.gateway.worldRuntimeService.buildQuestListView(playerId),
    );
  }

  private executeRedeemCodes(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.RedeemCodes>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    try {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueRedeemCodes(playerId, payload?.codes ?? [], this.gateway.worldRuntimeService);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REDEEM_CODES_FAILED', error);
    }
  }

  handleUsePortal(client: Socket): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    try {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.usePortal(playerId, this.gateway.worldRuntimeService);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'PORTAL_FAILED', error);
    }
  }

  private executeCultivate(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.Cultivate>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    try {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCultivate(playerId, payload?.techId ?? null, this.gateway.worldRuntimeService);
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'CULTIVATE_FAILED', error);
    }
  }

  handleCultivate(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.Cultivate>,
  ): void {
    this.executeCultivate(client, payload);
  }

  handleCastSkill(
    client: Socket,
    payload: ClientToServerEventPayload<typeof C2S.CastSkill>,
  ): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }

    try {
      this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCastSkill(
        playerId,
        payload?.skillId,
        payload?.targetPlayerId ?? null,
        payload?.targetMonsterId ?? null,
        payload?.targetRef ?? null,
        this.gateway.worldRuntimeService,
      );
    } catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'CAST_SKILL_FAILED', error);
    }
  }
}
