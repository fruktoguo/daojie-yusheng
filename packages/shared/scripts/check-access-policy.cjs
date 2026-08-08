'use strict';

const assert = require('node:assert/strict');
const {
  ACCESS_POLICY_DEPENDENCY,
  compileAccessPolicy,
  evaluateCompiledAccessPolicy,
  normalizeAccessPolicy,
  validateAccessPolicy,
} = require('../dist');

const attrs = {
  constitution: 80,
  spirit: 60,
  perception: 40,
  talent: 30,
  strength: 90,
  meridians: 50,
};
const facts = {
  actorPlayerId: 'player:visitor',
  isOwner: false,
  relationKinds: new Set(['dao_friend']),
  sameSect: true,
  sectRole: 'elder',
  sameParty: false,
  roleName: '青云剑客',
  realmLv: 42,
  finalAttrs: attrs,
};

const policy = {
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'all',
  conditions: [
    { type: 'sect', roles: ['elder'] },
    { type: 'realm', comparison: 'gt', realmLv: 40 },
  ],
  revision: 3,
};
const validated = validateAccessPolicy(policy);
assert.equal(validated.ok, true, '合法的双条件权限必须通过校验');
const compiled = compileAccessPolicy(validated.policy);
assert.equal((compiled.dependencies & ACCESS_POLICY_DEPENDENCY.sect) !== 0, true, '编译结果必须声明宗门依赖');
assert.equal((compiled.dependencies & ACCESS_POLICY_DEPENDENCY.realm) !== 0, true, '编译结果必须声明境界依赖');
assert.equal(evaluateCompiledAccessPolicy(compiled, facts), true, '长老且境界大于阈值时必须放行');
assert.equal(evaluateCompiledAccessPolicy(compiled, { ...facts, sectRole: 'inner' }), false, '且条件任一失败必须拒绝');

const relationOrName = compileAccessPolicy(normalizeAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'any',
  conditions: [
    { type: 'relation', relations: ['close_friend'] },
    { type: 'role_name', match: 'suffix', pattern: '剑客' },
  ],
  revision: 1,
}));
assert.equal(evaluateCompiledAccessPolicy(relationOrName, facts), true, '或条件任一命中必须放行');

const specifiedPlayer = validateAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'any',
  conditions: [{
    type: 'players',
    players: [{ playerNo: 10001, roleName: '青云剑客' }],
  }],
  revision: 1,
});
assert.equal(specifiedPlayer.ok, true, '客户端序号草稿允许尚未解析 playerId');
assert.equal(validateAccessPolicy(specifiedPlayer.policy, { requireResolvedPlayers: true }).ok, false, '权威保存前必须解析稳定 playerId');

const tooMany = validateAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'all',
  conditions: [
    { type: 'party' },
    { type: 'realm', comparison: 'gt', realmLv: 1 },
    { type: 'attribute', attr: 'strength', comparison: 'gt', value: 1 },
  ],
  revision: 1,
});
assert.equal(tooMany.ok, false, '权限条件不得超过两组');

const duplicateTypes = validateAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'any',
  conditions: [
    { type: 'realm', comparison: 'gt', realmLv: 10 },
    { type: 'realm', comparison: 'lt', realmLv: 20 },
  ],
  revision: 1,
});
assert.equal(duplicateTypes.ok, false, '同一权限类别不得重复占用两组条件');

const invalidSectRole = validateAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'any',
  conditions: [{ type: 'sect', roles: ['unknown_role'] }],
  revision: 1,
});
assert.equal(invalidSectRole.ok, false, '非法宗门职位不得被折叠成同宗门全部成员');

const mixedRelationKinds = validateAccessPolicy({
  schemaVersion: 1,
  mode: 'conditional',
  operator: 'any',
  conditions: [{ type: 'relation', relations: ['dao_friend', 'unknown_relation'] }],
  revision: 1,
});
assert.equal(mixedRelationKinds.ok, false, '关系类别包含未知值时必须失败关闭');

const invalidFallback = normalizeAccessPolicy({ schemaVersion: 99, mode: 'everyone' });
assert.equal(invalidFallback.mode, 'owner_only', '损坏或未来版本数据必须失败关闭');

const ownerOnly = compileAccessPolicy(normalizeAccessPolicy(null));
assert.equal(evaluateCompiledAccessPolicy(ownerOnly, facts), false, '仅所有者策略必须拒绝普通玩家');
assert.equal(evaluateCompiledAccessPolicy(ownerOnly, { ...facts, isOwner: true }), true, '所有者始终放行');

console.log(JSON.stringify({ ok: true, case: 'access-policy' }, null, 2));
