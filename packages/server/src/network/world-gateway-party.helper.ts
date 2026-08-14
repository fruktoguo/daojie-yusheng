import { S2C, type PartyOperationResultView } from '@mud/shared';
import type { Socket } from 'socket.io';
import { PartyRuntimeService } from '../runtime/party/party-runtime.service';
import { WorldSessionService } from './world-session.service';

export class WorldGatewayPartyHelper {
  private readonly admissions = new Map<string, { count: number; since: number }>();
  constructor(
    private readonly parties: PartyRuntimeService,
    private readonly sessions: WorldSessionService,
    private readonly worldRuntime: any,
  ) {
    this.parties.attachWorldRuntime(worldRuntime);
  }

  async requestPanel(client: Socket): Promise<void> {
    const playerId = this.playerId(client);
    if (!playerId) return;
    if (!this.admit(playerId)) {
      client.emit(S2C.PartyOperationResult, { ok: false, operation: 'panel', reason: 'rate_limited' });
      return;
    }
    const panel = await this.parties.buildPanel(playerId, this.worldRuntime);
    client.emit(S2C.PartyPanel, panel);
    client.emit(S2C.PartyOperationResult, { ok: true, operation: 'panel', panel });
  }

  create(client: Socket) { return this.execute(client, 'create', (id) => this.parties.create(id, this.worldRuntime)); }
  invite(client: Socket, payload: any) { return this.execute(client, 'invite', (id) => this.parties.invite(id, payload, this.worldRuntime)); }
  respondInvite(client: Socket, payload: any) { return this.execute(client, 'invite_response', (id) => this.parties.respondInvite(id, payload, this.worldRuntime)); }
  leave(client: Socket) { return this.execute(client, 'leave', (id) => this.parties.leave(id, this.worldRuntime)); }
  removeMember(client: Socket, payload: any) { return this.execute(client, 'remove_member', (id) => this.parties.removeMember(id, payload, this.worldRuntime)); }
  transferLeader(client: Socket, payload: any) { return this.execute(client, 'transfer_leader', (id) => this.parties.transferLeader(id, payload, this.worldRuntime)); }
  disband(client: Socket) { return this.execute(client, 'disband', (id) => this.parties.disband(id, this.worldRuntime)); }
  updateSettings(client: Socket, payload: any) { return this.execute(client, 'settings', (id) => this.parties.updateSettings(id, payload, this.worldRuntime)); }
  publishRecruitment(client: Socket, payload: any) { return this.execute(client, 'recruit_publish', (id) => this.parties.publishRecruitment(id, payload, this.worldRuntime)); }
  closeRecruitment(client: Socket, payload: any) { return this.execute(client, 'recruit_close', (id) => this.parties.closeRecruitment(id, payload, this.worldRuntime)); }
  applyRecruitment(client: Socket, payload: any) { return this.execute(client, 'recruit_apply', (id) => this.parties.applyRecruitment(id, payload, this.worldRuntime)); }
  respondApplication(client: Socket, payload: any) { return this.execute(client, 'application_response', (id) => this.parties.respondApplication(id, payload, this.worldRuntime)); }
  joinMatch(client: Socket, payload: any) { return this.execute(client, 'match_join', (id) => this.parties.joinMatch(id, payload?.purpose, this.worldRuntime)); }
  leaveMatch(client: Socket) { return this.execute(client, 'match_leave', (id) => this.parties.leaveMatch(id, this.worldRuntime)); }
  sendChat(client: Socket, payload: any) { return this.execute(client, 'chat', (id) => this.parties.sendChat(id, payload?.text, this.worldRuntime)); }

  async requestRecruitments(client: Socket, payload: any): Promise<void> {
    const playerId = this.playerId(client);
    if (!playerId) return;
    if (!this.admit(playerId)) {
      client.emit(S2C.PartyOperationResult, { ok: false, operation: 'panel', reason: 'rate_limited' });
      return;
    }
    const panel = await this.parties.buildPanel(playerId, this.worldRuntime);
    if (typeof payload?.purpose === 'string') {
      panel.recruitments = panel.recruitments.filter((entry) => entry.purpose === payload.purpose);
    }
    client.emit(S2C.PartyPanel, panel);
    client.emit(S2C.PartyOperationResult, { ok: true, operation: 'panel', panel });
  }

  async requestChatHistory(client: Socket, payload: any): Promise<void> {
    const playerId = this.playerId(client);
    if (!playerId) return;
    if (!this.admit(playerId)) {
      client.emit(S2C.PartyOperationResult, { ok: false, operation: 'chat', reason: 'rate_limited' });
      return;
    }
    const result = await this.parties.requestChatHistory(playerId, payload);
    if (result.ok && result.history) {
      client.emit(S2C.PartyChatHistory, result.history);
    } else {
      client.emit(S2C.PartyOperationResult, { ok: false, operation: 'chat', reason: result.reason });
    }
  }

  private async execute(
    client: Socket,
    operation: PartyOperationResultView['operation'],
    action: (playerId: string) => Promise<PartyOperationResultView>,
  ): Promise<void> {
    const playerId = this.playerId(client);
    if (!playerId) return;
    if (!this.admit(playerId)) {
      client.emit(S2C.PartyOperationResult, { ok: false, operation, reason: 'rate_limited' });
      return;
    }
    try {
      client.emit(S2C.PartyOperationResult, await action(playerId));
    } catch (error) {
      client.emit(S2C.PartyOperationResult, {
        ok: false,
        operation,
        reason: error instanceof Error ? error.message : 'party_operation_failed',
      });
    }
  }

  private admit(playerId: string): boolean {
    const now = Date.now();
    const current = this.admissions.get(playerId);
    if (!current || now - current.since >= 1_000) {
      this.admissions.set(playerId, { count: 1, since: now });
      if (this.admissions.size > 20_000) this.admissions.delete(this.admissions.keys().next().value);
      return true;
    }
    if (current.count >= 20) return false;
    current.count += 1;
    return true;
  }

  private playerId(client: Socket): string {
    const binding = this.sessions.getBindingBySocketId(client.id);
    return binding?.connected ? binding.playerId : '';
  }
}
