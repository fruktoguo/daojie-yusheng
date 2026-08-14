import type {
  PartyExpMode,
  PartyLootMode,
  PartyPurpose,
} from '@mud/shared';

export interface PartyMemberProfile {
  playerId: string;
  playerNo?: number;
  name: string;
  realmLv: number;
}

export interface PartyMemberRecord extends PartyMemberProfile {
  partyId: string;
  role: 'leader' | 'member';
  joinedAt: number;
}

export interface PartyRecord {
  partyId: string;
  leaderPlayerId: string;
  expMode: PartyExpMode;
  lootMode: PartyLootMode;
  friendlyFireEnabled: boolean;
  settingsRevision: number;
  revision: number;
  lootCursor: number;
  createdAt: number;
  members: PartyMemberRecord[];
}

export interface PartyInviteRecord {
  inviteId: string;
  partyId: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
}

export interface PartyRecruitmentRecord {
  listingId: string;
  partyId: string;
  leaderPlayerId: string;
  leaderName?: string;
  memberCount?: number;
  purpose: PartyPurpose;
  minRealmLv: number;
  maxRealmLv: number;
  note: string;
  createdAt: number;
  expiresAt: number;
}

export interface PartyApplicationRecord {
  applicationId: string;
  partyId: string;
  profile: PartyMemberProfile;
  createdAt: number;
  expiresAt: number;
}

export interface PartyChatRecord {
  messageId: string;
  partyId: string;
  fromPlayerId: string;
  fromName: string;
  text: string;
  sentAt: number;
}

export interface PartyMutationResult {
  ok: boolean;
  reason?: string;
  partyId?: string;
  affectedPlayerIds?: string[];
  removedPlayerIds?: string[];
  revision?: number;
  settingsRevision?: number;
}

export interface PartyMatchEntry {
  playerId: string;
  partyId?: string;
  purpose: PartyPurpose;
  realmLv: number;
  joinedAt: number;
}

export type QueryClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number }>;
  release?(): void;
};

export type PartyPool = QueryClient & {
  connect(): Promise<QueryClient & { release(): void }>;
};
