import { Inject, Injectable, Optional } from '@nestjs/common';

import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import type { BootstrapClientLike } from './world-session-bootstrap-context.helper';
import {
    BootstrapRecoveryNoticeResult,
    WorldSessionBootstrapSnapshotService,
} from './world-session-bootstrap-snapshot.service';

interface SuggestionRuntimePort {
    getAll(): unknown[];
}

interface WorldClientEventPort {
    emitPendingLogbookNotice(client: BootstrapClientLike, notice: unknown): void;
    emitSuggestionUpdate(client: BootstrapClientLike, suggestions: unknown[]): void;
    emitMailSummaryForPlayer(client: BootstrapClientLike, playerId: string): Promise<void>;
    emitPendingLogbookMessages(client: BootstrapClientLike, playerId: string): void;
}

/** 负责 bootstrap 初始同步后的 notice、建议、邮件与日志书下发。 */
@Injectable()
export class WorldSessionBootstrapPostEmitService {
    constructor(
        @Optional()
        @Inject(WorldSessionBootstrapSnapshotService)
        private readonly snapshotBootstrapService: WorldSessionBootstrapSnapshotService | null = null,
        @Optional()
        @Inject(SuggestionRuntimeService)
        private readonly suggestionRuntimeService: SuggestionRuntimePort | null = null,
        @Optional()
        @Inject(WorldClientEventService)
        private readonly worldClientEventService: WorldClientEventPort | null = null,
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
        this.worldClientEventService?.emitSuggestionUpdate(client, this.suggestionRuntimeService?.getAll() ?? []);
        await this.worldClientEventService?.emitMailSummaryForPlayer(client, playerId);
        this.worldClientEventService?.emitPendingLogbookMessages(client, playerId);
        return bootstrapRecovery;
    }
}
