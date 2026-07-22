import type { SyncFlushBreakdownSample } from './world-sync-flush-breakdown';
import { runMeasuredSyncFlushStep } from './world-sync-flush-breakdown';

interface ContextActionsSyncCursor {
    instanceId: string | null;
    tick: number;
    x: number;
    y: number;
    questRevision: number;
    equipmentRevision: number;
    techniqueRevision: number;
}

/** 周期同步复用同一逻辑息的上下文动作，显式同步仍由调用方强制刷新。 */
export class WorldSyncContextActionsCache {
    private readonly cursorByPlayerId = new Map<string, ContextActionsSyncCursor>();

    refresh(
        playerId: string,
        view: any,
        worldRuntimeService: any,
        playerRuntimeService: any,
        breakdown: SyncFlushBreakdownSample | undefined,
        reuseWithinTick: boolean,
    ): void {
        const nextCursor = buildContextActionsSyncCursor(playerId, view, worldRuntimeService, playerRuntimeService);
        const previousCursor = this.cursorByPlayerId.get(playerId);
        if (reuseWithinTick && previousCursor && nextCursor && isSameContextActionsSyncCursor(previousCursor, nextCursor)) {
            return;
        }
        runMeasuredSyncFlushStep(
            breakdown,
            'contextActionsMs',
            'contextActionsCount',
            () => worldRuntimeService.refreshPlayerContextActions(playerId, view),
        );
        if (nextCursor) {
            this.cursorByPlayerId.set(playerId, nextCursor);
        } else {
            this.cursorByPlayerId.delete(playerId);
        }
    }

    update(playerId: string, view: any, worldRuntimeService: any, playerRuntimeService: any): void {
        const cursor = buildContextActionsSyncCursor(playerId, view, worldRuntimeService, playerRuntimeService);
        if (cursor) {
            this.cursorByPlayerId.set(playerId, cursor);
        }
    }

    clear(playerId: string): void {
        this.cursorByPlayerId.delete(playerId);
    }
}

function buildContextActionsSyncCursor(
    playerId: string,
    view: any,
    worldRuntimeService: any,
    playerRuntimeService: any,
): ContextActionsSyncCursor | null {
    const resolvedTick = typeof worldRuntimeService?.resolveCurrentTickForPlayerId === 'function'
        ? worldRuntimeService.resolveCurrentTickForPlayerId(playerId)
        : view?.tick;
    const tick = Number(resolvedTick);
    if (!Number.isFinite(tick)) {
        return null;
    }
    const player = playerRuntimeService.getPlayer?.(playerId);
    return {
        instanceId: typeof view?.instance?.instanceId === 'string' ? view.instance.instanceId : null,
        tick: Math.trunc(tick),
        x: Math.trunc(Number(view?.self?.x) || 0),
        y: Math.trunc(Number(view?.self?.y) || 0),
        questRevision: Math.trunc(Number(player?.quests?.revision) || 0),
        equipmentRevision: Math.trunc(Number(player?.equipment?.revision) || 0),
        techniqueRevision: Math.trunc(Number(player?.techniques?.revision) || 0),
    };
}

function isSameContextActionsSyncCursor(left: ContextActionsSyncCursor, right: ContextActionsSyncCursor): boolean {
    return left.instanceId === right.instanceId
        && left.tick === right.tick
        && left.x === right.x
        && left.y === right.y
        && left.questRevision === right.questRevision
        && left.equipmentRevision === right.equipmentRevision
        && left.techniqueRevision === right.techniqueRevision;
}
