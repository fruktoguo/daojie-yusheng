/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { S2C } from '@mud/shared';

import { ActivityRuntimeService } from '../runtime/activity/activity-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import type { BootstrapClientLike } from './world-session-bootstrap-context.helper';
import {
    BootstrapRecoveryNoticeResult,
    WorldSessionBootstrapSnapshotService,
} from './world-session-bootstrap-snapshot.service';

interface WorldClientEventPort {
    emitPendingLogbookNotice(client: BootstrapClientLike, notice: unknown): void;
    emitActivityStatus(client: BootstrapClientLike, status: unknown): void;
    emitMailSummaryForPlayer(client: BootstrapClientLike, playerId: string): Promise<void>;
    emitPendingLogbookMessages(client: BootstrapClientLike, playerId: string): void;
}

interface ActivityRuntimePort {
    getStatus(playerId: string): Promise<unknown>;
}

interface PlayerRuntimePort {
    loadPendingOfflineGainReports(playerId: string): Promise<unknown[]>;
    loadPlayerStatisticTotals?(playerId: string): Promise<unknown>;
}

/** 负责 bootstrap 初始同步后的 notice、建议、邮件与日志书下发。 */
@Injectable()
export class WorldSessionBootstrapPostEmitService {
    constructor(
        @Optional()
        @Inject(WorldSessionBootstrapSnapshotService)
        private readonly snapshotBootstrapService: WorldSessionBootstrapSnapshotService | null = null,
        @Optional()
        @Inject(ActivityRuntimeService)
        private readonly activityRuntimeService: ActivityRuntimePort | null = null,
        @Optional()
        @Inject(WorldClientEventService)
        private readonly worldClientEventService: WorldClientEventPort | null = null,
        @Optional()
        @Inject(PlayerRuntimeService)
        private readonly playerRuntimeService: PlayerRuntimePort | null = null,
    ) {}

    async emitPostBootstrapState(client: BootstrapClientLike, playerId: string): Promise<BootstrapRecoveryNoticeResult | null> {
        const bootstrapRecovery = this.snapshotBootstrapService?.emitAuthenticatedSnapshotRecoveryNotice(client, playerId) ?? null;
        if (bootstrapRecovery?.queuedNotice && client?.data) {
            const existingPrefilledIds = client.data.prefilledPendingLogbookMessageIds instanceof Set
                ? client.data.prefilledPendingLogbookMessageIds
                : new Set<string>();
            existingPrefilledIds.add(bootstrapRecovery.queuedNotice.id);
            client.data.prefilledPendingLogbookMessageIds = existingPrefilledIds;
        }
        if (bootstrapRecovery?.queuedNotice) {
            this.worldClientEventService?.emitPendingLogbookNotice(client, bootstrapRecovery.queuedNotice);
        }
        const activityStatus = await this.activityRuntimeService?.getStatus(playerId);
        if (activityStatus) {
            this.worldClientEventService?.emitActivityStatus(client, activityStatus);
        }
        await this.worldClientEventService?.emitMailSummaryForPlayer(client, playerId);
        this.worldClientEventService?.emitPendingLogbookMessages(client, playerId);
        const offlineGainReports = await this.playerRuntimeService?.loadPendingOfflineGainReports(playerId) ?? [];
        const statisticTotals = await this.playerRuntimeService?.loadPlayerStatisticTotals?.(playerId) ?? null;
        if ((offlineGainReports.length > 0 || statisticTotals) && typeof (client as BootstrapClientLike & { emit?: (event: string, payload: unknown) => void }).emit === 'function') {
            (client as BootstrapClientLike & { emit: (event: string, payload: unknown) => void }).emit(S2C.OfflineGainReports, {
                reports: offlineGainReports,
                ...(statisticTotals ? { totals: statisticTotals } : {}),
            });
        }
        return bootstrapRecovery;
    }
}
