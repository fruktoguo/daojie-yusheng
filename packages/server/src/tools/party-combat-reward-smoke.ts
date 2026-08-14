import assert from 'node:assert/strict';
import {
  deletePartyCombatSnapshot,
  registerPartyLootCursorSink,
  setPartyCombatSnapshot,
} from '../runtime/party/party-combat-registry';
import {
  clearPartyMonsterSupport,
  clearPartyPlayerSupport,
  recordPartyMemberSupport,
  resolvePartyExperienceParticipants,
  resolvePartyLootRecipients,
} from '../runtime/party/party-reward-runtime';
import { resolveCombatRelation } from '../runtime/player/player-combat-config.helpers';
import { buildMonsterLootDeliverySourceRef } from '../runtime/world/combat/world-runtime-player-combat.service';

const members = [
  { playerId: 'a', joinedAt: 1 },
  { playerId: 'b', joinedAt: 2 },
];
const players = new Map<string, any>([
  ['a', player('a', 'party-1', 5, 5, true)],
  ['b', player('b', 'party-1', 7, 5, true)],
  ['c', player('c', undefined, 6, 5, true)],
  ['d', player('d', 'party-1', 5, 6, true)],
]);
const instance = { meta: { instanceId: 'instance-1' }, tick: 0 };
const monster = { runtimeId: 'monster-1', x: 5, y: 5 };
const firstKillSource = buildMonsterLootDeliverySourceRef(instance, monster, 0);
assert.equal(firstKillSource, buildMonsterLootDeliverySourceRef(instance, monster, 0));
instance.tick = 1;
assert.notEqual(firstKillSource, buildMonsterLootDeliverySourceRef(instance, monster, 0));
instance.tick = 0;

setPartyCombatSnapshot({
  partyId: 'party-1',
  expMode: 'equal',
  lootMode: 'round_robin',
  friendlyFireEnabled: false,
  lootCursor: 0,
  members,
});

const attacker = players.get('a');
const target = players.get('b');
attacker.combat.combatTargetingRules = {
  hostile: ['party', 'all_players'],
  friendly: ['party'],
  autoRetaliateAgainst: ['all_players'],
};
assert.notEqual(resolveCombatRelation(attacker, { kind: 'player', target }).relation, 'hostile');

setPartyCombatSnapshot({
  partyId: 'party-1',
  expMode: 'equal',
  lootMode: 'round_robin',
  friendlyFireEnabled: true,
  lootCursor: 0,
  members,
});
assert.equal(resolveCombatRelation(attacker, { kind: 'player', target }).relation, 'hostile');
attacker.combat.combatTargetingRules.hostile = ['all_players'];
assert.notEqual(resolveCombatRelation(attacker, { kind: 'player', target }).relation, 'hostile');

const raw = [
  { playerId: 'a', contribution: 0.8, realmLv: 1 },
  { playerId: 'b', contribution: 0.2, realmLv: 1 },
  { playerId: 'c', contribution: 1, realmLv: 1 },
];
const equal = resolvePartyExperienceParticipants(raw, instance, monster, (id) => players.get(id));
assert.equal(equal.find((entry) => entry.playerId === 'a')?.contribution, 0.5);
assert.equal(equal.find((entry) => entry.playerId === 'b')?.contribution, 0.5);
assert.equal(equal.reduce((sum, entry) => sum + entry.contribution, 0), 2);

setPartyCombatSnapshot({
  partyId: 'party-1',
  expMode: 'equal',
  lootMode: 'round_robin',
  friendlyFireEnabled: true,
  lootCursor: 0,
  members: [...members, { playerId: 'd', joinedAt: 3 }],
});
instance.tick = 10;
recordPartyMemberSupport('instance-1', 'd', 'a', 10);
const supported = resolvePartyExperienceParticipants(raw, instance, monster, (id) => players.get(id));
assert.equal(supported.find((entry) => entry.playerId === 'd')?.contribution, 1 / 3);
assert.equal(supported.filter((entry) => ['a', 'b', 'd'].includes(entry.playerId)).length, 3);
clearPartyPlayerSupport('instance-1', 'd');
const supportCleared = resolvePartyExperienceParticipants(raw, instance, monster, (id) => players.get(id));
assert.equal(supportCleared.some((entry) => entry.playerId === 'd'), false);

setPartyCombatSnapshot({
  partyId: 'party-1',
  expMode: 'equal',
  lootMode: 'round_robin',
  friendlyFireEnabled: true,
  lootCursor: 0,
  members,
});

const persistedCursors: number[] = [];
registerPartyLootCursorSink((_partyId, cursor) => { persistedCursors.push(cursor); });
const recipients = resolvePartyLootRecipients('a', 3, raw, instance, monster, (id) => players.get(id));
assert.deepEqual(recipients, ['a', 'b', 'a']);
assert.equal(recipients.length, 3);
assert.deepEqual(persistedCursors, [3]);
assert.deepEqual(resolvePartyLootRecipients('a', 1, raw, instance, monster, (id) => players.get(id)), ['b']);
assert.deepEqual(persistedCursors, [3, 4]);

players.get('b').hp = 0;
const aliveOnly = resolvePartyExperienceParticipants(raw, instance, monster, (id) => players.get(id));
assert.equal(aliveOnly.find((entry) => entry.playerId === 'a')?.contribution, 1);
assert.equal(aliveOnly.some((entry) => entry.playerId === 'b'), false);

registerPartyLootCursorSink(null);
clearPartyMonsterSupport('instance-1', 'monster-1');
deletePartyCombatSnapshot('party-1');
console.log(JSON.stringify({ ok: true, case: 'party-combat-reward', assertions: 17 }));

function player(playerId: string, partyId: string | undefined, x: number, y: number, alive: boolean): any {
  return {
    playerId,
    partyId,
    instanceId: 'instance-1',
    x,
    y,
    hp: alive ? 100 : 0,
    realm: { realmLv: 1 },
    combat: {
      allowAoePlayerHit: false,
      combatTargetingRules: {
        hostile: ['all_players'],
        friendly: ['party'],
        autoRetaliateAgainst: ['all_players'],
      },
    },
  };
}
