import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  PARTY_MAX_MEMBERS,
  S2C,
  type PartyOperation,
  type PartyOperationResultView,
  type PartyPurpose,
} from '@mud/shared';
import { WorldSessionService } from '../../network/world-session.service';
import { PartyChatService } from './party-chat.service';
import { PartyCommandService } from './party-command.service';
import { PartyMatchRunnerService } from './party-match-runner.service';
import { PartyMatchService } from './party-match.service';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyPanelService } from './party-panel.service';
import { PartyRuntimeSyncService } from './party-runtime-sync.service';
import type { PartyMutationResult } from './party-runtime.types';

interface Admission { count: number; since: number; }

@Injectable()
export class PartyRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartyRuntimeService.name);
  private matchTimer: ReturnType<typeof setInterval> | null = null;
  private readonly admissions = new Map<string, Admission>();

  constructor(
    private readonly commands: PartyCommandService,
    private readonly panelService: PartyPanelService,
    private readonly chat: PartyChatService,
    private readonly queue: PartyMatchService,
    private readonly matchRunner: PartyMatchRunnerService,
    private readonly membership: PartyMembershipRepository,
    private readonly sync: PartyRuntimeSyncService,
    private readonly sessions: WorldSessionService,
  ) {}

  onModuleInit(): void {
    this.matchTimer = setInterval(() => void this.runMatching(), 30_000);
    this.matchTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.matchTimer) clearInterval(this.matchTimer);
  }

  attachWorldRuntime(runtime: any): void { this.sync.attachWorldRuntime(runtime); }
  restorePlayerMembership(playerId: string, runtime?: any): Promise<string | null> { return this.sync.restorePlayerMembership(playerId, runtime); }
  buildPanel(playerId: string, runtime?: any) { return this.panelService.build(playerId, runtime); }

  handlePlayerDisconnected(playerId: string): void {
    this.queue.leave(playerId);
  }

  async arePlayersInSameParty(leftPlayerId: string, rightPlayerId: string): Promise<boolean> {
    const left = typeof leftPlayerId === 'string' ? leftPlayerId.trim() : '';
    const right = typeof rightPlayerId === 'string' ? rightPlayerId.trim() : '';
    if (!left || !right || left === right) return false;
    const [leftParty, rightParty] = await Promise.all([
      this.membership.getPartyByPlayer(left),
      this.membership.getPartyByPlayer(right),
    ]);
    return Boolean(leftParty?.partyId && leftParty.partyId === rightParty?.partyId);
  }

  create(playerId: string, runtime?: any) { return this.finish('create', playerId, this.commands.create(playerId), runtime); }
  invite(playerId: string, payload: any, runtime?: any) { return this.finish('invite', playerId, this.commands.invite(playerId, payload?.targetPlayerId, payload?.targetPlayerNo), runtime); }
  respondInvite(playerId: string, payload: any, runtime?: any) { return this.finish('invite_response', playerId, this.commands.respondInvite(playerId, payload?.inviteId, payload?.accept), runtime); }
  leave(playerId: string, runtime?: any) { return this.finish('leave', playerId, this.commands.leave(playerId), runtime); }
  removeMember(playerId: string, payload: any, runtime?: any) { return this.finish('remove_member', playerId, this.commands.removeMember(playerId, payload?.targetPlayerId), runtime); }
  transferLeader(playerId: string, payload: any, runtime?: any) { return this.finish('transfer_leader', playerId, this.commands.transferLeader(playerId, payload?.targetPlayerId), runtime); }
  disband(playerId: string, runtime?: any) { return this.finish('disband', playerId, this.commands.disband(playerId), runtime); }
  updateSettings(playerId: string, payload: any, runtime?: any) { return this.finish('settings', playerId, this.commands.updateSettings(playerId, payload), runtime); }
  publishRecruitment(playerId: string, payload: any, runtime?: any) { return this.finish('recruit_publish', playerId, this.commands.publishRecruitment(playerId, payload), runtime); }
  closeRecruitment(playerId: string, payload: any, runtime?: any) { return this.finish('recruit_close', playerId, this.commands.closeRecruitment(playerId, payload?.expectedRevision), runtime); }
  applyRecruitment(playerId: string, payload: any, runtime?: any) { return this.finish('recruit_apply', playerId, this.commands.applyRecruitment(playerId, payload?.listingId), runtime); }
  respondApplication(playerId: string, payload: any, runtime?: any) { return this.finish('application_response', playerId, this.commands.respondApplication(playerId, payload?.applicationId, payload?.accept), runtime); }

  async joinMatch(playerId: string, purpose: PartyPurpose, runtime?: any): Promise<PartyOperationResultView> {
    if (!this.admit(playerId)) return this.result('match_join', false, 'rate_limited');
    const validPurpose = purpose === 'general' || purpose === 'leveling' || purpose === 'boss' || purpose === 'tower' || purpose === 'exploration';
    if (!validPurpose || !this.sessions.getBinding(playerId)?.connected) return this.result('match_join', false, 'invalid_match_request');
    const party = await this.membership.getPartyByPlayer(playerId);
    if (party && (party.leaderPlayerId !== playerId || party.members.length >= PARTY_MAX_MEMBERS)) return this.result('match_join', false, party.members.length >= PARTY_MAX_MEMBERS ? 'party_full' : 'leader_required');
    const profile = this.panelService.resolveProfile(playerId);
    this.queue.join({ playerId, ...(party ? { partyId: party.partyId } : {}), purpose, realmLv: profile.realmLv, joinedAt: Date.now() });
    void this.runMatching(runtime);
    await this.sync.pushPanels([playerId], runtime);
    return this.result('match_join', true, undefined, await this.panelService.build(playerId, runtime));
  }

  async leaveMatch(playerId: string, runtime?: any): Promise<PartyOperationResultView> {
    this.queue.leave(playerId);
    await this.sync.pushPanels([playerId], runtime);
    return this.result('match_leave', true, undefined, await this.panelService.build(playerId, runtime));
  }

  async sendChat(playerId: string, text: unknown, runtime?: any): Promise<PartyOperationResultView> {
    const sent = await this.chat.send(this.panelService.resolveProfile(playerId), text);
    return this.result('chat', sent.ok, sent.reason, sent.ok ? await this.panelService.build(playerId, runtime) : undefined);
  }

  requestChatHistory(playerId: string, payload: any) {
    return this.chat.history(playerId, payload?.cursor, payload?.requestId);
  }

  async requestRecruitments(playerId: string, purpose: unknown, runtime?: any) {
    const panel = await this.panelService.build(playerId, runtime);
    return typeof purpose === 'string' ? panel.recruitments.filter((entry) => entry.purpose === purpose) : panel.recruitments;
  }

  private async finish(
    operation: PartyOperation,
    playerId: string,
    mutationPromise: Promise<PartyMutationResult>,
    runtime?: any,
  ): Promise<PartyOperationResultView> {
    const mutation = await mutationPromise;
    await this.sync.applyMutation(mutation, runtime);
    await this.pushAffectedPanels(mutation.affectedPlayerIds ?? [], runtime, playerId);
    if (mutation.ok) {
      for (const affectedId of mutation.affectedPlayerIds ?? []) {
        const queued = this.queue.get(affectedId);
        if (!queued) continue;
        const party = await this.membership.getPartyByPlayer(affectedId);
        const joinedParty = Boolean(party && !queued.partyId);
        const changedParty = Boolean(queued.partyId && party?.partyId !== queued.partyId);
        if (joinedParty || changedParty) this.queue.leave(affectedId);
      }
    }
    const panel = await this.panelService.build(playerId, runtime);
    return this.result(operation, mutation.ok, mutation.reason, panel);
  }

  private async runMatching(runtime?: any): Promise<void> {
    await this.matchRunner.run(async (mutation) => {
      await this.sync.applyMutation(mutation, runtime);
      await this.pushAffectedPanels(mutation.affectedPlayerIds ?? [], runtime);
    });
  }

  private async pushAffectedPanels(
    playerIds: readonly string[],
    runtime?: any,
    excludePlayerId?: string,
): Promise<void> {
    const uniquePlayerIds = [...new Set(playerIds)].filter((playerId) => playerId && playerId !== excludePlayerId);
    await Promise.all(uniquePlayerIds.map(async (playerId) => {
      try {
        const socket = this.sessions.getSocketByPlayerId(playerId);
        if (!socket) return;
        const panel = await this.panelService.build(playerId, runtime);
        socket.emit(S2C.PartyPanel, panel);
      } catch (error) {
        this.logger.warn(`队伍面板推送失败 player=${playerId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }

  private result(operation: PartyOperation, ok: boolean, reason?: string, panel?: any): PartyOperationResultView {
    return { ok, operation, ...(reason ? { reason } : {}), ...(panel ? { panel } : {}) };
  }

  private admit(playerId: string): boolean {
    const now = Date.now();
    const admission = this.admissions.get(playerId);
    if (!admission || now - admission.since >= 1_000) {
      this.admissions.set(playerId, { count: 1, since: now });
      if (this.admissions.size > 20_000) this.admissions.delete(this.admissions.keys().next().value);
      return true;
    }
    if (admission.count >= 20) return false;
    admission.count += 1;
    return true;
  }
}
