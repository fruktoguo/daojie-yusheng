import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { PlayerSessionRouteService } from '../persistence/player-session-route.service';
import { PlayerPersistenceService, type PersistedPlayerSnapshot } from '../persistence/player-persistence.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSessionRecoveryQueueService } from './world-session-recovery-queue.service';

interface BootstrapRuntimePlayer {
    instanceId?: string | null;
    templateId?: string | null;
    x: number;
    y: number;
}

interface PlayerRuntimePort {
    buildStarterPersistenceSnapshot?(playerId: string): PersistedPlayerSnapshot | null;
    loadOrCreatePlayer(
        playerId: string,
        sessionId: string,
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>,
        options?: {
            forceRebind?: boolean;
            buildStarterSnapshot?: (playerId: string) => PersistedPlayerSnapshot | null;
            onSnapshotLoaded?: (snapshot: PersistedPlayerSnapshot | null) => void;
            sessionEpochFloor?: number | null;
        },
    ): Promise<BootstrapRuntimePlayer>;
    setIdentity(playerId: string, input: {
        name?: string | null;
        displayName?: string | null;
    }): void;
    describePersistencePresence?(playerId: string): {
        online: boolean;
        inWorld: boolean;
        lastHeartbeatAt?: number | null;
        offlineSinceAt?: number | null;
        runtimeOwnerId?: string | null;
        sessionEpoch?: number | null;
        transferState?: string | null;
        transferTargetNodeId?: string | null;
        versionSeed?: number | null;
    } | null;
    markPersisted?(playerId: string): void;
}

interface MailRuntimePort {
    ensurePlayerMailbox(playerId: string): Promise<void>;
    ensureWelcomeMail(playerId: string): Promise<void>;
}

interface PlayerPersistenceSnapshotPort {
    loadPlayerSnapshot(playerId: string): Promise<PersistedPlayerSnapshot | null>;
}

/** 负责 bootstrap 阶段玩家初始化、身份回写与邮箱预热。 */
@Injectable()
export class WorldSessionBootstrapPlayerInitService {
    private readonly logger = new Logger(WorldSessionBootstrapPlayerInitService.name);

    constructor(
        @Optional()
        @Inject(PlayerRuntimeService)
        private readonly playerRuntimeService: PlayerRuntimePort | null = null,
        @Optional()
        @Inject(PlayerDomainPersistenceService)
        private readonly playerDomainPersistenceService: PlayerDomainPersistenceService | null = null,
        @Optional()
        @Inject(PlayerSessionRouteService)
        private readonly playerSessionRouteService: PlayerSessionRouteService | null = null,
        @Optional()
        @Inject(MailRuntimeService)
        private readonly mailRuntimeService: MailRuntimePort | null = null,
        @Optional()
        @Inject(WorldSessionRecoveryQueueService)
        private readonly recoveryQueueService: WorldSessionRecoveryQueueService | null = null,
        @Optional()
        @Inject(PlayerPersistenceService)
        private readonly playerPersistenceService: PlayerPersistenceSnapshotPort | null = null,
    ) {}

    async initializeBootstrapPlayer(input: {
        playerId: string;
        sessionId: string;
        name?: string | null;
        displayName?: string | null;
        loadSnapshot: () => Promise<PersistedPlayerSnapshot | null>;
        forceRuntimeSessionRebind?: boolean;
    }): Promise<BootstrapRuntimePlayer> {
        if (!this.playerRuntimeService) {
            throw new Error('bootstrap_player_runtime_service_unavailable');
        }
        const recoveryPriority = classifyRecoveryPriority(input.playerId);
        const persistedPresence = typeof this.playerDomainPersistenceService?.loadPlayerPresence === 'function'
            ? await this.playerDomainPersistenceService.loadPlayerPresence(input.playerId)
            : null;
        const sessionEpochFloor = Number.isFinite(persistedPresence?.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
            : 0;
        const starterSnapshotBuilder = this.playerRuntimeService?.buildStarterPersistenceSnapshot
            ? (playerId: string) => this.playerRuntimeService!.buildStarterPersistenceSnapshot!(playerId)
            : null;
        let loadedSnapshot: PersistedPlayerSnapshot | null = null;
        const loadSnapshot = async () => {
            const snapshot = await input.loadSnapshot();
            loadedSnapshot = snapshot;
            return snapshot;
        };
        let player: BootstrapRuntimePlayer;
        try {
            player = await this.runThroughRecoveryQueue(
                input.playerId,
                recoveryPriority,
                async () =>
                    this.playerRuntimeService!.loadOrCreatePlayer(input.playerId, input.sessionId, loadSnapshot, {
                        forceRebind: input.forceRuntimeSessionRebind === true,
                        buildStarterSnapshot: starterSnapshotBuilder ?? undefined,
                        onSnapshotLoaded: (snapshot) => {
                            loadedSnapshot = snapshot;
                        },
                        sessionEpochFloor: sessionEpochFloor > 0 ? sessionEpochFloor : undefined,
                    }),
            );
        } catch (error: unknown) {
            if (!isRecoveryTimeoutError(error)) {
                throw error;
            }
            const persistedSnapshot = await this.loadPersistedSnapshotAfterRecoveryTimeout(input.playerId);
            if (persistedSnapshot) {
                console.warn(`bootstrap 恢复超时，改用已持久化快照兜底：playerId=${input.playerId}`);
                loadedSnapshot = persistedSnapshot;
                player = await this.playerRuntimeService.loadOrCreatePlayer(
                    input.playerId,
                    input.sessionId,
                    async () => persistedSnapshot,
                    {
                        forceRebind: input.forceRuntimeSessionRebind === true,
                        onSnapshotLoaded: (snapshot) => {
                            loadedSnapshot = snapshot;
                        },
                        sessionEpochFloor: sessionEpochFloor > 0 ? sessionEpochFloor : undefined,
                    },
                );
            }
            else {
                console.warn(`bootstrap 恢复超时，切换到 fallback 出生点：playerId=${input.playerId}`);
                const fallbackSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(input.playerId);
                if (!fallbackSnapshot) {
                    throw error;
                }
                loadedSnapshot = fallbackSnapshot;
                player = await this.playerRuntimeService.loadOrCreatePlayer(
                    input.playerId,
                    input.sessionId,
                    async () => fallbackSnapshot,
                    {
                        forceRebind: input.forceRuntimeSessionRebind === true,
                        onSnapshotLoaded: (snapshot) => {
                            loadedSnapshot = snapshot;
                        },
                        sessionEpochFloor: sessionEpochFloor > 0 ? sessionEpochFloor : undefined,
                    },
                );
                if (typeof this.playerDomainPersistenceService?.isEnabled === 'function'
                    && this.playerDomainPersistenceService.isEnabled()) {
                    await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
                        input.playerId,
                        fallbackSnapshot,
                        [
                            'world_anchor',
                            'position_checkpoint',
                            'vitals',
                            'progression',
                            'attr',
                            'wallet',
                            'inventory',
                            'map_unlock',
                            'equipment',
                            'technique',
                            'body_training',
                            'buff',
                            'quest',
                            'combat_pref',
                            'auto_battle_skill',
                            'auto_use_item_rule',
                            'profession',
                            'alchemy_preset',
                            'active_job',
                            'enhancement_record',
                            'logbook',
                        ],
                    );
                }
            }
        }
        this.playerRuntimeService.setIdentity(input.playerId, {
            name: input.name,
            displayName: input.displayName,
        });
        const presence = this.playerRuntimeService.describePersistencePresence?.(input.playerId) ?? null;
        if (presence) {
            if (typeof this.playerDomainPersistenceService?.savePlayerPresence === 'function') {
                await this.playerDomainPersistenceService.savePlayerPresence(input.playerId, {
                    ...presence,
                    online: true,
                    inWorld: Boolean(player.templateId),
                    offlineSinceAt: null,
                    versionSeed: Date.now(),
                });
            }
            this.playerRuntimeService.markPersisted?.(input.playerId);
            const routeSessionEpoch = Number.isFinite(presence.sessionEpoch)
                ? Math.max(1, Math.trunc(Number(presence.sessionEpoch)))
                : 0;
            if (routeSessionEpoch > 0) {
                await this.playerSessionRouteService?.registerLocalRoute({
                    playerId: input.playerId,
                    sessionEpoch: routeSessionEpoch,
                });
            }
        }
        if (
            loadedSnapshot
            && typeof this.playerDomainPersistenceService?.isEnabled === 'function'
            && this.playerDomainPersistenceService.isEnabled()
        ) {
            await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
                input.playerId,
                loadedSnapshot,
                [
                    'world_anchor',
                    'position_checkpoint',
                    'vitals',
                    'progression',
                    'attr',
                    'wallet',
                    'inventory',
                    'map_unlock',
                    'equipment',
                    'technique',
                    'body_training',
                    'buff',
                    'quest',
                    'combat_pref',
                    'auto_battle_skill',
                    'auto_use_item_rule',
                    'profession',
                    'alchemy_preset',
                    'active_job',
                    'enhancement_record',
                    'logbook',
                ],
            );
        }
        await this.mailRuntimeService?.ensurePlayerMailbox(input.playerId);
        await this.mailRuntimeService?.ensureWelcomeMail(input.playerId);
        return player;
    }

    private async loadPersistedSnapshotAfterRecoveryTimeout(playerId: string): Promise<PersistedPlayerSnapshot | null> {
        if (!this.playerPersistenceService) {
            return null;
        }
        try {
            const snapshot = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
            return snapshot?.placement?.templateId ? snapshot : null;
        } catch (error: unknown) {
            this.logger.warn(
                `bootstrap 超时后读取持久化快照失败：playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    private async runThroughRecoveryQueue<T>(
        playerId: string,
        priority: 'vip' | 'recent' | 'normal',
        task: () => Promise<T>,
    ): Promise<T> {
        if (!this.recoveryQueueService) {
            return task();
        }
        return this.recoveryQueueService.enqueue({
            key: `bootstrap:${playerId}`,
            priority,
            run: task,
        });
    }
}

function classifyRecoveryPriority(playerId: string): 'vip' | 'recent' | 'normal' {
    const normalized = typeof playerId === 'string' ? playerId.trim().toLowerCase() : '';
    if (!normalized) {
        return 'normal';
    }
    if (normalized.includes('vip')) {
        return 'vip';
    }
    if (normalized.includes('recent')) {
        return 'recent';
    }
    return 'normal';
}

function isRecoveryTimeoutError(error: unknown): boolean {
    if (typeof error === 'string') {
        return error.startsWith('recovery_timeout:');
    }
    if (!error || typeof error !== 'object') {
        return false;
    }
    const message = error instanceof Error ? error.message : ('message' in error ? String((error as { message?: unknown }).message ?? '') : '');
    return message.startsWith('recovery_timeout:');
}
