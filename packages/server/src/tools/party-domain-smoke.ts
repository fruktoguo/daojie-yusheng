import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { S2C } from '@mud/shared';
import { PartyChatService } from '../runtime/party/party-chat.service';
import { PartyMatchRunnerService } from '../runtime/party/party-match-runner.service';
import { PartyMatchService } from '../runtime/party/party-match.service';
import { PartyRuntimeService } from '../runtime/party/party-runtime.service';
import { PartyRuntimeSyncService } from '../runtime/party/party-runtime-sync.service';
import type { PartyMemberProfile, PartyMutationResult, PartyRecord } from '../runtime/party/party-runtime.types';
import { resolveToolDistRoot } from './stable-dist';

class MemoryMembership {
  private sequence = 0;
  private readonly parties = new Map<string, PartyRecord>();
  private readonly playerParty = new Map<string, string>();

  async createParty(member: PartyMemberProfile): Promise<PartyMutationResult> {
    if (this.playerParty.has(member.playerId)) return { ok: false, reason: 'already_in_party' };
    const partyId = `party-${++this.sequence}`;
    const record = party(partyId, member.playerId, [member.playerId]);
    record.members[0] = { ...member, partyId, role: 'leader', joinedAt: Date.now() };
    this.parties.set(partyId, record);
    this.playerParty.set(member.playerId, partyId);
    return { ok: true, partyId, affectedPlayerIds: [member.playerId] };
  }

  async addMatchedMember(partyId: string, member: PartyMemberProfile): Promise<PartyMutationResult> {
    if (this.playerParty.has(member.playerId)) return { ok: false, reason: 'already_in_party' };
    await Promise.resolve();
    if (this.playerParty.has(member.playerId)) return { ok: false, reason: 'already_in_party' };
    const record = this.parties.get(partyId);
    if (!record || record.members.length >= 5) return { ok: false, reason: 'party_full' };
    this.playerParty.set(member.playerId, partyId);
    record.members.push({ ...member, partyId, role: 'member', joinedAt: Date.now() });
    return { ok: true, partyId, affectedPlayerIds: record.members.map((entry) => entry.playerId) };
  }

  async getParty(partyId: string) { return this.parties.get(partyId) ?? null; }
  async getPartyByPlayer(playerId: string) { const id = this.playerParty.get(playerId); return id ? this.getParty(id) : null; }
}

async function main(): Promise<void> {
  const distRoot = resolveToolDistRoot(__dirname);
  const schemaCode = readFileSync(resolve(distRoot, 'runtime/party/party-schema.js'), 'utf8');
  const membershipCode = readFileSync(resolve(distRoot, 'runtime/party/party-membership.repository.js'), 'utf8');
  const managementCode = readFileSync(resolve(distRoot, 'runtime/party/party-management.repository.js'), 'utf8');
  const recruitmentCode = readFileSync(resolve(distRoot, 'runtime/party/party-recruitment.repository.js'), 'utf8');
  const projectorCode = readFileSync(resolve(distRoot, 'network/world-projector.helpers.js'), 'utf8');
  assert.match(schemaCode, /player_id varchar\(100\) PRIMARY KEY/);
  assert.match(schemaCode, /player_party_audit/);
  assert.match(membershipCode, /lockPartyPlayer/);
  assert.match(membershipCode, /PARTY_INVITE_TTL_MS/);
  assert.match(membershipCode, /writePartyAudit/);
  assert.match(managementCode, /revision_conflict/);
  assert.match(managementCode, /leader_required/);
  assert.doesNotMatch(managementCode, /auto.*leader/i);
  assert.match(recruitmentCode, /PARTY_RECRUITMENT_TTL_MS/);
  assert.match(recruitmentCode, /realm_out_of_range/);
  assert.match(projectorCode, /pid:\s*self\.partyId/);

  const store = new MemoryMembership();
  const partyA = await store.createParty(profile('leader-a', 1));
  const partyB = await store.createParty(profile('leader-b', 2));
  const doubleJoin = await Promise.all([
    store.addMatchedMember(partyA.partyId!, profile('target', 3)),
    store.addMatchedMember(partyB.partyId!, profile('target', 3)),
  ]);
  assert.equal(doubleJoin.filter((entry) => entry.ok).length, 1);

  const matchStore = new MemoryMembership();
  const queue = new PartyMatchService();
  const sessions = fakeSessions(['early', 'late']);
  const panel = { resolveProfile: (id: string) => profile(id, id === 'early' ? 4 : 7) };
  const runner = new PartyMatchRunnerService(queue, matchStore as any, panel as any, sessions as any);
  queue.join({ playerId: 'early', purpose: 'general', realmLv: 4, joinedAt: 1 });
  queue.join({ playerId: 'late', purpose: 'general', realmLv: 7, joinedAt: 2 });
  await runner.run(async () => undefined);
  const formed = await matchStore.getPartyByPlayer('early');
  assert.equal(formed?.leaderPlayerId, 'early');
  assert.equal(formed?.members.length, 2);

  const offlineQueue = new PartyMatchService();
  const offlineRunner = new PartyMatchRunnerService(
    offlineQueue,
    new MemoryMembership() as any,
    panel as any,
    fakeSessions(['online']) as any,
  );
  offlineQueue.join({ playerId: 'online', purpose: 'general', realmLv: 4, joinedAt: 1 });
  offlineQueue.join({ playerId: 'offline', purpose: 'general', realmLv: 4, joinedAt: 2 });
  await offlineRunner.run(async () => undefined);
  assert.equal(offlineQueue.get('offline'), null);

  const emitted = new Map<string, Array<{ event: string; payload: any }>>();
  const chatSessions = fakeSessions(['chat-a', 'chat-b', 'outsider'], emitted);
  const chatParty = party('chat-party', 'chat-a', ['chat-a', 'chat-b']);
  let currentChatParty = chatParty;
  const chatMembership = {
    getPartyByPlayer: async (id: string) => currentChatParty.members.some((member) => member.playerId === id) ? currentChatParty : null,
    getParty: async (partyId: string) => currentChatParty.partyId === partyId ? currentChatParty : null,
  };
  let messageSequence = 0;
  const chatRepository = {
    create: async (entry: PartyMemberProfile, text: string) => ({ ok: true, message: { messageId: `m${++messageSequence}`, partyId: 'chat-party', fromPlayerId: entry.playerId, fromName: entry.name, text, sentAt: messageSequence } }),
    history: async () => ({ ok: true, partyId: 'chat-party', messages: [] }),
    prune: async () => undefined,
  };
  const chat = new PartyChatService(chatRepository as any, chatMembership as any, chatSessions as any);
  assert.equal((await chat.send(profile('chat-a', 1), 'hello')).ok, true);
  assert.equal(emitted.get('chat-a')?.some((entry) => entry.event === S2C.PartyChatMessage), true);
  assert.equal(emitted.get('chat-b')?.some((entry) => entry.event === S2C.PartyChatMessage), true);
  assert.equal(emitted.get('outsider')?.length ?? 0, 0);
  currentChatParty = party('chat-party', 'chat-a', ['chat-a']);
  assert.equal((await chat.send(profile('chat-a', 1), 'after leave')).ok, true);
  assert.equal(emitted.get('chat-b')?.length, 1);
  chat.onModuleDestroy();

  const queuedSolo = new PartyMatchService();
  queuedSolo.join({ playerId: 'queued-solo', purpose: 'general', realmLv: 1, joinedAt: 1 });
  let queuedSoloParty: PartyRecord | null = null;
  const runtimeService = new PartyRuntimeService(
    {} as any,
    { build: async () => ({}), resolveProfile: (id: string) => profile(id, 1) } as any,
    {} as any,
    queuedSolo,
    { run: async () => undefined } as any,
    { getPartyByPlayer: async () => queuedSoloParty } as any,
    { applyMutation: async () => undefined } as any,
    fakeSessions([]) as any,
  );
  await (runtimeService as any).finish(
    'invite_response',
    'queued-solo',
    Promise.resolve({ ok: true, affectedPlayerIds: ['queued-solo'] }),
  );
  assert.notEqual(queuedSolo.get('queued-solo'), null);
  queuedSoloParty = party('joined-party', 'queued-solo', ['queued-solo']);
  await (runtimeService as any).finish(
    'invite_response',
    'queued-solo',
    Promise.resolve({ ok: true, affectedPlayerIds: ['queued-solo'], partyId: 'joined-party' }),
  );
  assert.equal(queuedSolo.get('queued-solo'), null);

  const runtimePlayers = new Map<string, any>([['recover', { playerId: 'recover', selfRevision: 0 }]]);
  let recoverParty: PartyRecord | null = party('recover-party', 'recover', ['recover']);
  const sync = new PartyRuntimeSyncService(
    { getPartyByPlayer: async () => recoverParty, getParty: async () => recoverParty } as any,
    { refreshMemberProfile: async () => undefined, advanceLootCursor: async () => undefined } as any,
    { closeWhenFull: async () => undefined } as any,
    { resolveProfile: () => profile('recover', 5), build: async () => ({}) } as any,
    { getPlayer: (id: string) => runtimePlayers.get(id) } as any,
    fakeSessions([]) as any,
  );
  sync.onModuleInit();
  assert.equal(await sync.restorePlayerMembership('recover'), 'recover-party');
  assert.equal(runtimePlayers.get('recover').partyId, 'recover-party');
  recoverParty = null;
  await sync.restorePlayerMembership('recover');
  assert.equal(runtimePlayers.get('recover').partyId, undefined);
  await sync.onModuleDestroy();
  console.log(JSON.stringify({ ok: true, case: 'party-domain', assertions: 25 }));
}

function profile(playerId: string, realmLv: number): PartyMemberProfile { return { playerId, name: playerId, realmLv }; }
function party(partyId: string, leaderPlayerId: string, playerIds: string[]): PartyRecord {
  return {
    partyId, leaderPlayerId, expMode: 'contribution', lootMode: 'killer', friendlyFireEnabled: false,
    settingsRevision: 1, revision: 1, lootCursor: 0, createdAt: 1,
    members: playerIds.map((playerId, index) => ({ ...profile(playerId, 1), partyId, role: playerId === leaderPlayerId ? 'leader' : 'member', joinedAt: index + 1 })),
  };
}
function fakeSessions(playerIds: string[], emitted: Map<string, Array<{ event: string; payload: any }>> = new Map()) {
  const connected = new Set(playerIds);
  return {
    getBinding: (playerId: string) => connected.has(playerId) ? { playerId, connected: true } : null,
    getSocketByPlayerId: (playerId: string) => connected.has(playerId) ? { emit(event: string, payload: any) { const events = emitted.get(playerId) ?? []; events.push({ event, payload }); emitted.set(playerId, events); } } : null,
  };
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
