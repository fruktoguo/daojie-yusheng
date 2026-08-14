import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PARTY_MAX_MEMBERS,
  resolvePlayerFacingContentName,
  type PartyPanelView,
  type PartyRecruitmentView,
  type PartyView,
} from '@mud/shared';
import { NativePlayerAuthStoreService } from '../../http/native/native-player-auth-store.service';
import { WorldSessionService } from '../../network/world-session.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { resolvePlayerDisplayName } from '../player/player-display-name';
import { PartyInviteQueryRepository } from './party-invite-query.repository';
import { PartyMatchService } from './party-match.service';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyRecruitmentRepository } from './party-recruitment.repository';
import type { PartyMemberProfile, PartyRecord, PartyRecruitmentRecord } from './party-runtime.types';

interface IdentityLookup {
  getMemoryUserByPlayerId(playerId: string): any;
}

@Injectable()
export class PartyPanelService {
  constructor(
    private readonly membership: PartyMembershipRepository,
    private readonly invites: PartyInviteQueryRepository,
    private readonly recruitments: PartyRecruitmentRepository,
    private readonly match: PartyMatchService,
    private readonly players: PlayerRuntimeService,
    private readonly sessions: WorldSessionService,
    @Optional() @Inject(NativePlayerAuthStoreService) private readonly identities: IdentityLookup | null = null,
  ) {}

  resolveProfile(playerId: string): PartyMemberProfile {
    const player: any = this.players.getPlayer(playerId);
    const identity = this.identities?.getMemoryUserByPlayerId(playerId) ?? null;
    const playerNo = Number(identity?.playerNo ?? player?.playerNo);
    return {
      playerId,
      ...(Number.isSafeInteger(playerNo) && playerNo > 0 ? { playerNo } : {}),
      name: resolvePlayerDisplayName({
        playerId,
        playerName: identity?.playerName,
        pendingRoleName: identity?.pendingRoleName,
        name: player?.name,
        displayName: identity?.displayName ?? player?.displayName,
      }, { playerId, fallback: playerId }),
      realmLv: Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv) || 1)),
    };
  }

  async build(playerId: string, runtime?: any): Promise<PartyPanelView> {
    const party = await this.membership.getPartyByPlayer(playerId);
    const [incoming, recruitmentRecords, applications] = await Promise.all([
      this.invites.listIncoming(playerId),
      this.recruitments.listActive(),
      party?.leaderPlayerId === playerId ? this.recruitments.listApplications(party.partyId) : Promise.resolve([]),
    ]);
    const recruitmentViews = recruitmentRecords.map((record) => this.toRecruitmentView(record));
    return {
      party: party ? this.toPartyView(party, recruitmentViews, runtime) : null,
      incomingInvites: await Promise.all(incoming.map(async (invite) => {
        const inviteParty = await this.membership.getParty(invite.partyId);
        const leader = inviteParty?.members.find((member) => member.playerId === invite.fromPlayerId);
        return {
          inviteId: invite.inviteId,
          partyId: invite.partyId,
          partyLabel: leader?.name ?? invite.fromPlayerId,
          fromPlayerId: invite.fromPlayerId,
          fromName: leader?.name ?? this.resolveProfile(invite.fromPlayerId).name,
          memberCount: inviteParty?.members.length ?? 0,
          expiresAt: invite.expiresAt,
        };
      })),
      incomingApplications: applications.map((application) => ({
        applicationId: application.applicationId,
        partyId: application.partyId,
        playerId: application.profile.playerId,
        ...(application.profile.playerNo ? { playerNo: application.profile.playerNo } : {}),
        playerName: application.profile.name,
        realmLv: application.profile.realmLv,
        createdAt: application.createdAt,
        expiresAt: application.expiresAt,
      })),
      recruitments: recruitmentViews,
      matchQueue: this.match.view(playerId),
      serverTime: Date.now(),
    };
  }

  private toPartyView(party: PartyRecord, recruitments: PartyRecruitmentView[], runtime?: any): PartyView {
    return {
      partyId: party.partyId,
      leaderPlayerId: party.leaderPlayerId,
      members: party.members.map((member) => {
        const player: any = this.players.getPlayer(member.playerId);
        const online = this.sessions.getBinding(member.playerId)?.connected === true;
        const instanceId = online && typeof player?.instanceId === 'string' ? player.instanceId : '';
        const instance = instanceId && typeof runtime?.getInstanceRuntime === 'function'
          ? runtime.getInstanceRuntime(instanceId)
          : null;
        const maxHp = Number(player?.attrs?.numericStats?.maxHp ?? player?.maxHp);
        const maxQi = Number(player?.attrs?.numericStats?.maxQi ?? player?.maxQi);
        return {
          playerId: member.playerId,
          ...(member.playerNo ? { playerNo: member.playerNo } : {}),
          name: online ? this.resolveProfile(member.playerId).name : member.name,
          role: member.role,
          realmLv: online ? Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv) || member.realmLv)) : member.realmLv,
          online,
          ...(instanceId ? {
            mapId: instanceId,
            mapName: resolvePlayerFacingContentName(instanceId, instanceId, instance?.template?.name, instance?.meta?.displayName),
          } : {}),
          ...(online && Number.isFinite(Number(player?.hp)) ? { hp: Math.max(0, Number(player.hp)) } : {}),
          ...(online && Number.isFinite(maxHp) ? { maxHp: Math.max(0, maxHp) } : {}),
          ...(online && Number.isFinite(Number(player?.qi)) ? { qi: Math.max(0, Number(player.qi)) } : {}),
          ...(online && Number.isFinite(maxQi) ? { maxQi: Math.max(0, maxQi) } : {}),
          joinedAt: member.joinedAt,
        };
      }),
      settings: {
        expMode: party.expMode,
        lootMode: party.lootMode,
        friendlyFireEnabled: party.friendlyFireEnabled,
        revision: party.settingsRevision,
      },
      recruitment: recruitments.find((entry) => entry.partyId === party.partyId) ?? null,
      createdAt: party.createdAt,
      revision: party.revision,
    };
  }

  private toRecruitmentView(record: PartyRecruitmentRecord): PartyRecruitmentView {
    return {
      listingId: record.listingId,
      partyId: record.partyId,
      leaderPlayerId: record.leaderPlayerId,
      leaderName: record.leaderName ?? this.resolveProfile(record.leaderPlayerId).name,
      purpose: record.purpose,
      minRealmLv: record.minRealmLv,
      maxRealmLv: record.maxRealmLv,
      note: record.note,
      memberCount: Math.max(1, Number(record.memberCount) || 1),
      maxMembers: PARTY_MAX_MEMBERS,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }
}
