import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { WorldSessionService } from '../../network/world-session.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import {
  deletePartyCombatSnapshot,
  getPartyCombatSnapshot,
  registerPartyLootCursorSink,
  setPartyCombatSnapshot,
} from './party-combat-registry';
import { PartyManagementRepository } from './party-management.repository';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyPanelService } from './party-panel.service';
import { PartyRecruitmentRepository } from './party-recruitment.repository';
import type { PartyMutationResult, PartyRecord } from './party-runtime.types';

@Injectable()
export class PartyRuntimeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartyRuntimeSyncService.name);
  private runtime: any = null;
  private readonly pendingCursorTargets = new Map<string, number>();
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorFlushPromise: Promise<void> | null = null;
  private destroying = false;

  constructor(
    private readonly membership: PartyMembershipRepository,
    private readonly management: PartyManagementRepository,
    private readonly recruitments: PartyRecruitmentRepository,
    private readonly panel: PartyPanelService,
    private readonly players: PlayerRuntimeService,
    private readonly sessions: WorldSessionService,
  ) {}

  onModuleInit(): void {
    registerPartyLootCursorSink((partyId, cursor) => this.queueCursorFlush(partyId, cursor));
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    registerPartyLootCursorSink(null);
    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
    await this.flushCursors();
    if (this.pendingCursorTargets.size > 0) await this.flushCursors();
  }

  attachWorldRuntime(runtime: any): void {
    this.runtime = runtime;
  }

  async restorePlayerMembership(playerId: string, runtime?: any): Promise<string | null> {
    const party = await this.membership.getPartyByPlayer(playerId);
    this.applyPartyId(playerId, party?.partyId ?? null, runtime);
    if (party) {
      this.publishSnapshot(party);
      const profile = this.panel.resolveProfile(playerId);
      void this.management.refreshMemberProfile(playerId, profile.playerNo, profile.name, profile.realmLv);
    }
    return party?.partyId ?? null;
  }

  async applyMutation(result: PartyMutationResult, runtime?: any, push = true): Promise<void> {
    if (!result.ok) return;
    const activeRuntime = runtime ?? this.runtime;
    const affected = Array.from(new Set([...(result.affectedPlayerIds ?? []), ...(result.removedPlayerIds ?? [])]));
    const party = result.partyId ? await this.membership.getParty(result.partyId) : null;
    const memberIds = new Set(party?.members.map((member) => member.playerId) ?? []);
    if (party) {
      this.publishSnapshot(party);
      if (party.members.length >= 5) void this.recruitments.closeWhenFull(party.partyId);
      for (const member of party.members) this.applyPartyId(member.playerId, party.partyId, activeRuntime);
    } else if (result.partyId) {
      deletePartyCombatSnapshot(result.partyId);
    }
    for (const playerId of affected) {
      if (memberIds.has(playerId)) continue;
      const authoritativeParty = await this.membership.getPartyByPlayer(playerId);
      if (authoritativeParty) {
        this.publishSnapshot(authoritativeParty);
        this.applyPartyId(playerId, authoritativeParty.partyId, activeRuntime);
      } else {
        this.applyPartyId(playerId, null, activeRuntime);
      }
    }
    if (push) await this.pushPanels(affected, activeRuntime);
  }

  async pushPanels(playerIds: Iterable<string>, runtime?: any): Promise<void> {
    const unique = Array.from(new Set(playerIds));
    await Promise.all(unique.map(async (playerId) => {
      const socket = this.sessions.getSocketByPlayerId(playerId);
      if (!socket) return;
      socket.emit(S2C.PartyPanel, await this.panel.build(playerId, runtime ?? this.runtime));
    }));
  }

  private applyPartyId(playerId: string, partyId: string | null, runtime?: any): void {
    const player: any = this.players.getPlayer(playerId);
    if (!player) return;
    const previous = typeof player.partyId === 'string' ? player.partyId : null;
    if (previous === partyId) return;
    if (partyId) player.partyId = partyId;
    else delete player.partyId;
    player.selfRevision = Math.max(0, Number(player.selfRevision) || 0) + 1;
    const activeRuntime = runtime ?? this.runtime;
    const instance = typeof activeRuntime?.getInstanceRuntime === 'function' && player.instanceId
      ? activeRuntime.getInstanceRuntime(player.instanceId)
      : null;
    const instancePlayer = instance?.playersById?.get?.(playerId);
    if (instancePlayer) {
      if (partyId) instancePlayer.partyId = partyId;
      else delete instancePlayer.partyId;
    }
    instance?.markAoiViewChangedAt?.(player.x, player.y);
    activeRuntime?.requestPlayerDeltaSync?.(playerId);
  }

  private publishSnapshot(party: PartyRecord): void {
    const runtimeCursor = getPartyCombatSnapshot(party.partyId)?.lootCursor ?? 0;
    setPartyCombatSnapshot({
      partyId: party.partyId,
      expMode: party.expMode,
      lootMode: party.lootMode,
      friendlyFireEnabled: party.friendlyFireEnabled,
      lootCursor: Math.max(party.lootCursor, runtimeCursor),
      members: party.members.map((member) => ({ playerId: member.playerId, joinedAt: member.joinedAt })),
    });
  }

  private queueCursorFlush(partyId: string, cursor: number): void {
    this.pendingCursorTargets.set(partyId, Math.max(this.pendingCursorTargets.get(partyId) ?? 0, cursor));
    if (this.cursorTimer) return;
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      void this.flushCursors();
    }, 0);
    this.cursorTimer.unref();
  }

  private async flushCursors(): Promise<void> {
    if (this.cursorFlushPromise) return this.cursorFlushPromise;
    const task = this.flushCursorBatch();
    this.cursorFlushPromise = task;
    try {
      await task;
    } finally {
      if (this.cursorFlushPromise === task) this.cursorFlushPromise = null;
      if (!this.destroying && this.pendingCursorTargets.size > 0 && !this.cursorTimer) {
        this.cursorTimer = setTimeout(() => {
          this.cursorTimer = null;
          void this.flushCursors();
        }, 0);
        this.cursorTimer.unref();
      }
    }
  }

  private async flushCursorBatch(): Promise<void> {
    const entries = Array.from(this.pendingCursorTargets.entries());
    this.pendingCursorTargets.clear();
    let failed = false;
    for (const [partyId, cursor] of entries) {
      try {
        await this.management.advanceLootCursor(partyId, cursor);
      } catch (error) {
        failed = true;
        this.pendingCursorTargets.set(partyId, Math.max(this.pendingCursorTargets.get(partyId) ?? 0, cursor));
        this.logger.warn(`队伍掉落游标刷盘失败 party=${partyId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failed && !this.cursorTimer) {
      this.cursorTimer = setTimeout(() => {
        this.cursorTimer = null;
        void this.flushCursors();
      }, 1_000);
      this.cursorTimer.unref();
    }
  }
}
