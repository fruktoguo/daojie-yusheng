import { Injectable } from '@nestjs/common';
import type {
  C2S_PublishPartyRecruitmentView,
  C2S_UpdatePartySettingsView,
  PartyPurpose,
} from '@mud/shared';
import { WorldSessionService } from '../../network/world-session.service';
import { PartyApplicationCommandRepository } from './party-application-command.repository';
import { PartyManagementRepository } from './party-management.repository';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyPanelService } from './party-panel.service';
import { PartyRecruitmentRepository } from './party-recruitment.repository';
import type { PartyMutationResult } from './party-runtime.types';

@Injectable()
export class PartyCommandService {
  constructor(
    private readonly membership: PartyMembershipRepository,
    private readonly management: PartyManagementRepository,
    private readonly recruitments: PartyRecruitmentRepository,
    private readonly applications: PartyApplicationCommandRepository,
    private readonly panel: PartyPanelService,
    private readonly sessions: WorldSessionService,
  ) {}

  create(playerId: string): Promise<PartyMutationResult> {
    return this.membership.createParty(this.panel.resolveProfile(playerId));
  }

  async invite(playerId: string, targetPlayerId?: unknown, targetPlayerNo?: unknown): Promise<PartyMutationResult> {
    const targetId = this.resolveOnlineTarget(targetPlayerId, targetPlayerNo);
    if (!targetId || targetId === playerId) return { ok: false, reason: 'target_not_online' };
    const result = await this.membership.createInvite(playerId, targetId);
    return { ...result, affectedPlayerIds: result.ok ? [playerId, targetId] : [playerId] };
  }

  respondInvite(playerId: string, inviteId: unknown, accept: unknown): Promise<PartyMutationResult> {
    const normalized = normalizeId(inviteId);
    if (!normalized) return Promise.resolve({ ok: false, reason: 'invite_not_found' });
    return this.membership.respondInvite(this.panel.resolveProfile(playerId), normalized, accept === true);
  }

  leave(playerId: string): Promise<PartyMutationResult> {
    return this.management.leave(playerId);
  }

  removeMember(playerId: string, targetPlayerId: unknown): Promise<PartyMutationResult> {
    const targetId = normalizeId(targetPlayerId);
    return targetId ? this.management.removeMember(playerId, targetId) : Promise.resolve({ ok: false, reason: 'invalid_target' });
  }

  transferLeader(playerId: string, targetPlayerId: unknown): Promise<PartyMutationResult> {
    const targetId = normalizeId(targetPlayerId);
    return targetId ? this.management.transferLeader(playerId, targetId) : Promise.resolve({ ok: false, reason: 'invalid_target' });
  }

  disband(playerId: string): Promise<PartyMutationResult> {
    return this.management.disband(playerId);
  }

  updateSettings(playerId: string, input: C2S_UpdatePartySettingsView): Promise<PartyMutationResult> {
    const expectedRevision = Math.trunc(Number(input?.expectedRevision));
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return Promise.resolve({ ok: false, reason: 'invalid_revision' });
    return this.management.updateSettings(playerId, expectedRevision, {
      ...(input.expMode === 'equal' || input.expMode === 'contribution' ? { expMode: input.expMode } : {}),
      ...(input.lootMode === 'round_robin' || input.lootMode === 'killer' ? { lootMode: input.lootMode } : {}),
      ...(typeof input.friendlyFireEnabled === 'boolean' ? { friendlyFireEnabled: input.friendlyFireEnabled } : {}),
    });
  }

  publishRecruitment(playerId: string, input: C2S_PublishPartyRecruitmentView): Promise<PartyMutationResult> {
    const expectedRevision = Math.trunc(Number(input?.expectedRevision));
    const purpose = normalizePurpose(input?.purpose);
    const minRealmLv = Math.max(1, Math.trunc(Number(input?.minRealmLv) || 0));
    const maxRealmLv = Math.max(1, Math.trunc(Number(input?.maxRealmLv) || 0));
    const note = normalizeNote(input?.note);
    if (!purpose || minRealmLv > maxRealmLv || maxRealmLv > 10_000 || note === null || expectedRevision < 1) {
      return Promise.resolve({ ok: false, reason: 'invalid_recruitment' });
    }
    return this.recruitments.publish(playerId, expectedRevision, { purpose, minRealmLv, maxRealmLv, note });
  }

  closeRecruitment(playerId: string, expectedRevision: unknown): Promise<PartyMutationResult> {
    const revision = Math.trunc(Number(expectedRevision));
    return revision > 0 ? this.recruitments.close(playerId, revision) : Promise.resolve({ ok: false, reason: 'invalid_revision' });
  }

  async applyRecruitment(playerId: string, listingId: unknown): Promise<PartyMutationResult> {
    const normalized = normalizeId(listingId);
    if (!normalized) return { ok: false, reason: 'recruitment_not_found' };
    const result = await this.recruitments.apply(this.panel.resolveProfile(playerId), normalized);
    return { ...result, affectedPlayerIds: [playerId, ...(result.leaderPlayerId ? [result.leaderPlayerId] : [])] };
  }

  respondApplication(playerId: string, applicationId: unknown, accept: unknown): Promise<PartyMutationResult> {
    const normalized = normalizeId(applicationId);
    return normalized
      ? this.applications.respond(playerId, normalized, accept === true)
      : Promise.resolve({ ok: false, reason: 'application_not_found' });
  }

  private resolveOnlineTarget(playerId: unknown, playerNo: unknown): string {
    const direct = normalizeId(playerId);
    if (direct && this.sessions.getBinding(direct)?.connected) return direct;
    const expectedNo = Math.trunc(Number(playerNo));
    if (!Number.isSafeInteger(expectedNo) || expectedNo <= 0) return '';
    for (const binding of this.sessions.listConnectedBindings()) {
      if (this.panel.resolveProfile(binding.playerId).playerNo === expectedNo) return binding.playerId;
    }
    return '';
  }
}

function normalizeId(value: unknown): string {
  return typeof value === 'string' && value.trim().length <= 160 ? value.trim() : '';
}

function normalizePurpose(value: unknown): PartyPurpose | null {
  return value === 'general' || value === 'leveling' || value === 'boss' || value === 'tower' || value === 'exploration' ? value : null;
}

function normalizeNote(value: unknown): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string') return null;
  const note = value.trim();
  return Array.from(note).length <= 200 && Buffer.byteLength(note, 'utf8') <= 600 ? note : null;
}
