import { Injectable } from '@nestjs/common';
import { PARTY_MAX_MEMBERS } from '@mud/shared';
import { WorldSessionService } from '../../network/world-session.service';
import { PartyMatchService } from './party-match.service';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyPanelService } from './party-panel.service';
import type { PartyMatchEntry, PartyMutationResult } from './party-runtime.types';

@Injectable()
export class PartyMatchRunnerService {
  private running = false;

  constructor(
    private readonly queue: PartyMatchService,
    private readonly membership: PartyMembershipRepository,
    private readonly panel: PartyPanelService,
    private readonly sessions: WorldSessionService,
  ) {}

  async run(onMutation: (result: PartyMutationResult) => Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.pruneInvalidEntries();
      const now = Date.now();
      for (const anchor of this.queue.list()) {
        if (!this.queue.get(anchor.playerId)) continue;
        if (anchor.partyId) {
          await this.fillExistingParty(anchor, now, onMutation);
        } else {
          await this.formParty(anchor, now, onMutation);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private isOnline(playerId: string): boolean {
    return this.sessions.getBinding(playerId)?.connected === true;
  }

  private async pruneInvalidEntries(): Promise<void> {
    for (const entry of this.queue.list()) {
      if (!this.isOnline(entry.playerId)) {
        this.queue.leave(entry.playerId);
        continue;
      }
      const party = await this.membership.getPartyByPlayer(entry.playerId);
      if (!entry.partyId && party) this.queue.leave(entry.playerId);
      if (entry.partyId && (!party || party.partyId !== entry.partyId || party.leaderPlayerId !== entry.playerId || party.members.length >= PARTY_MAX_MEMBERS)) {
        this.queue.leave(entry.playerId);
      }
    }
  }

  private async fillExistingParty(anchor: PartyMatchEntry, now: number, onMutation: (result: PartyMutationResult) => Promise<void>): Promise<void> {
    if (!this.isOnline(anchor.playerId)) return this.queue.leave(anchor.playerId);
    let party = await this.membership.getParty(anchor.partyId!);
    if (!party) return this.queue.leave(anchor.playerId);
    for (const candidate of this.queue.list()) {
      if (party.members.length >= PARTY_MAX_MEMBERS) break;
      if (!this.isOnline(candidate.playerId)) {
        this.queue.leave(candidate.playerId);
        continue;
      }
      if (candidate.partyId || !this.queue.compatible(anchor, candidate, now)) continue;
      const result = await this.membership.addMatchedMember(party.partyId, this.panel.resolveProfile(candidate.playerId));
      if (!result.ok) continue;
      this.queue.leave(candidate.playerId);
      await onMutation(result);
      const refreshedParty = await this.membership.getParty(party.partyId);
      if (!refreshedParty) {
        this.queue.leave(anchor.playerId);
        return;
      }
      party = refreshedParty;
    }
    if (party.members.length >= PARTY_MAX_MEMBERS) this.queue.leave(anchor.playerId);
  }

  private async formParty(anchor: PartyMatchEntry, now: number, onMutation: (result: PartyMutationResult) => Promise<void>): Promise<void> {
    if (!this.isOnline(anchor.playerId)) return this.queue.leave(anchor.playerId);
    const compatible = this.queue.list().filter((entry) => {
      if (entry.partyId || entry.playerId === anchor.playerId) return false;
      if (!this.isOnline(entry.playerId)) {
        this.queue.leave(entry.playerId);
        return false;
      }
      return this.queue.compatible(anchor, entry, now);
    });
    if (compatible.length === 0) return;
    const created = await this.membership.createParty(this.panel.resolveProfile(anchor.playerId), 'match');
    if (!created.ok || !created.partyId) {
      this.queue.leave(anchor.playerId);
      return;
    }
    this.queue.leave(anchor.playerId);
    await onMutation(created);
    let party = await this.membership.getParty(created.partyId);
    for (const candidate of compatible) {
      if (!party || party.members.length >= PARTY_MAX_MEMBERS) break;
      if (!this.isOnline(candidate.playerId)) {
        this.queue.leave(candidate.playerId);
        continue;
      }
      const added = await this.membership.addMatchedMember(created.partyId, this.panel.resolveProfile(candidate.playerId));
      if (!added.ok) continue;
      this.queue.leave(candidate.playerId);
      await onMutation(added);
      party = await this.membership.getParty(created.partyId);
    }
    if (party && party.members.length < PARTY_MAX_MEMBERS) {
      this.queue.join({ ...anchor, partyId: party.partyId });
    }
  }
}
