/** 通用权限检测、缓存、资源适配与并发保存 smoke。 */
import assert from 'node:assert/strict';

import {
  ACCESS_POLICY_RESOURCE_TYPE,
  EVERYONE_ACCESS_POLICY,
  OWNER_ONLY_ACCESS_POLICY,
  TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT,
  TREASURE_VAULT_ACCESS_POLICY_SLOT,
  cloneAccessPolicy,
  evaluateCompiledAccessPolicy,
  type AccessPolicy,
  type AccessPolicyResourceRef,
} from '@mud/shared';

import { AccessPolicyResourceService } from '../runtime/access/access-policy-resource.service';
import { AccessPolicyRuntimeService } from '../runtime/access/access-policy-runtime.service';
import { normalizePersistedBuildingAccessPolicies } from '../runtime/access/building-access-policy-legacy';
import { BuildingAccessPolicyService } from '../runtime/access/building-access-policy.service';
import { WorldGatewayAccessPolicyHelper } from '../network/world-gateway-access-policy.helper';

const players = new Map<string, any>([
  ['player:owner', {
    playerId: 'player:owner',
    name: '玄门宗主',
    partyId: 'party:1',
    sectId: 'sect:玄门',
    realm: { realmLv: 55 },
    attrs: { finalAttrs: buildAttrs(120) },
  }],
  ['player:visitor', {
    playerId: 'player:visitor',
    name: '青云剑客',
    partyId: 'party:1',
    sectId: 'sect:玄门',
    realm: { realmLv: 42 },
    attrs: { finalAttrs: buildAttrs(80) },
  }],
]);

let relationReadCount = 0;
let attributeRefreshCount = 0;
const runtime = new AccessPolicyRuntimeService(
  {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    ensurePlayerAttributesFresh(playerId: string) {
      assert.equal(playerId, 'player:visitor');
      attributeRefreshCount += 1;
    },
  } as never,
  {
    async findPlayerIdentitiesByPlayerNos(playerNos: readonly number[]) {
      const result = new Map<number, any>();
      if (playerNos.includes(10002)) {
        result.set(10002, {
          playerNo: 10002,
          playerId: 'player:visitor',
          playerName: '青云剑客',
        });
      }
      return result;
    },
  } as never,
  {
    getMemoryUserByPlayerId(playerId: string) {
      return playerId === 'player:visitor'
        ? { pendingRoleName: '青云剑客', playerName: '青云剑客' }
        : { pendingRoleName: '玄门宗主', playerName: '玄门宗主' };
    },
    async listUsers() {
      return [];
    },
  } as never,
  {
    registerRelationChangeListener() {
      return () => undefined;
    },
    async resolveRelationLevel() {
      relationReadCount += 1;
      return 'close_friend';
    },
  } as never,
  {
    worldRuntimeSectService: {
      resolvePlayerSectId(playerId: string) {
        return players.get(playerId)?.sectId ?? null;
      },
      findSectById(sectId: string) {
        return sectId === 'sect:玄门'
          ? {
              members: [
                { playerId: 'player:owner', roleId: 'leader' },
                { playerId: 'player:visitor', roleId: 'elder' },
              ],
            }
          : null;
      },
    },
  } as never,
);

async function main(): Promise<void> {
assertLegacyBuildingPolicyMigration();
const unregisterProvider = runtime.registerRelationProvider({
  id: 'smoke-master-apprentice',
  relationKinds: ['master', 'apprentice'],
  async resolve(ownerPlayerId, actorPlayerId) {
    return ownerPlayerId === 'player:owner' && actorPlayerId === 'player:visitor' ? ['master'] : [];
  },
});

const relationPolicy = buildPolicy(1, [
  { type: 'relation', relations: ['master'] },
]);
const prepared = runtime.prepare(relationPolicy);
assert.equal(runtime.prepare(relationPolicy), prepared, '同一水合策略必须复用编译结果');
assert.deepEqual(
  await runtime.evaluate({ ...relationPolicy, schemaVersion: 999 }, evaluationContext()),
  { ok: false, allowed: false, reason: 'access_policy_invalid' },
  '未经校验或未来版本策略必须失败关闭',
);
const relationEvaluation = await runtime.evaluate(prepared, evaluationContext());
assert.equal(relationEvaluation.allowed, true, '扩展师徒关系必须可参与检测');
assert.equal((await runtime.evaluate(relationPolicy, evaluationContext())).allowed, true, '原始策略入口必须命中编译缓存');
assert.equal(relationReadCount, 1, '相同双方的道友关系读取必须命中缓存');
runtime.invalidateRelationFacts('player:owner', 'player:visitor');
assert.equal((await runtime.evaluate(relationPolicy, evaluationContext())).allowed, true);
assert.equal(relationReadCount, 2, '关系变更后必须立即失效缓存');

const combined = await runtime.evaluateMany([
  buildPolicy(1, [
    { type: 'sect', roles: ['elder'] },
    { type: 'realm', comparison: 'gt', realmLv: 40 },
  ], 'all'),
  buildPolicy(1, [
    { type: 'role_name', match: 'suffix', pattern: '剑客' },
    { type: 'attribute', attr: 'strength', comparison: 'gt', value: 70 },
  ], 'all'),
  buildPolicy(1, [{ type: 'party' }]),
], evaluationContext());
assert.equal(combined.ok, true);
assert.deepEqual(combined.allowed, [true, true, true], '同一资源多项权限必须共享事实并分别裁定');
assert.equal(attributeRefreshCount, 1, '多项属性权限检测只允许刷新一次属性事实');

const resolved = await runtime.resolvePlayerNo(10002);
assert.deepEqual(resolved, { playerNo: 10002, playerId: 'player:visitor', roleName: '青云剑客' });

const resourceService = new AccessPolicyResourceService(runtime);
await assertBuildingAccessPolicyAdapters(resourceService);
const ref: AccessPolicyResourceRef = { resourceType: 'smoke_resource', resourceId: 'resource:1', slot: 'use' };
const withdrawRef: AccessPolicyResourceRef = { ...ref, slot: 'withdraw' };
let resourceState = {
  resourceType: ref.resourceType,
  resourceId: ref.resourceId,
  title: '测试宝箱',
  ownerPlayerId: 'player:owner',
  policies: {} as Record<string, AccessPolicy>,
};
let activeCommits = 0;
let maxActiveCommits = 0;
resourceService.registerAdapter({
  resourceType: ref.resourceType,
  slots: [
    {
      slot: ref.slot,
      label: '可看和可放',
      description: '查看内容并放入物品。',
      defaultPolicy: cloneAccessPolicy(EVERYONE_ACCESS_POLICY),
    },
    {
      slot: withdrawRef.slot,
      label: '可拿',
      description: '从资源中取出物品。',
      defaultPolicy: cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY),
    },
  ],
  async load(_actorPlayerId, resourceId) {
    return resourceId === ref.resourceId
      ? { ...resourceState, policies: { ...resourceState.policies } }
      : null;
  },
  canManage(actorPlayerId, current) {
    return actorPlayerId === current.ownerPlayerId;
  },
  async commit(_actorPlayerId, _current, commitRef, nextPolicy, expectedRevision) {
    activeCommits += 1;
    maxActiveCommits = Math.max(maxActiveCommits, activeCommits);
    try {
      await delay(10);
      const currentPolicy = resourceState.policies[commitRef.slot]
        ?? (commitRef.slot === ref.slot ? EVERYONE_ACCESS_POLICY : OWNER_ONLY_ACCESS_POLICY);
      if (currentPolicy.revision !== expectedRevision) throw new Error('access_policy_revision_conflict');
      resourceState = {
        ...resourceState,
        policies: {
          ...resourceState.policies,
          [commitRef.slot]: cloneAccessPolicy(nextPolicy),
        },
      };
      return { ...resourceState, policies: { ...resourceState.policies } };
    } finally {
      activeCommits -= 1;
    }
  },
});

const denied = await resourceService.loadForEditor('player:visitor', ref);
assert.deepEqual(denied, { ok: false, reason: 'access_policy_manage_denied' });
const loaded = await resourceService.loadForEditor('player:owner', ref);
assert.equal(loaded.ok, true);
assert.equal(loaded.ok === true ? loaded.snapshot.policy.mode : '', 'everyone', '缺失槽位必须使用资源声明的开放默认策略');
const loadedSet = await resourceService.loadSetForEditor('player:owner', {
  resourceType: ref.resourceType,
  resourceId: ref.resourceId,
});
assert.equal(loadedSet.ok, true);
assert.deepEqual(loadedSet.ok === true
  ? loadedSet.snapshot.slots.map((slot) => [slot.slot, slot.policy.mode])
  : [], [['use', 'everyone'], ['withdraw', 'owner_only']], '同一资源必须一次返回全部槽位及各自默认策略');

const playerDraft = buildPolicy(1, [{
  type: 'players',
  players: [{ playerNo: 10002, roleName: '客户端伪造名字' }],
}]);
const [firstSave, staleSave] = await Promise.all([
  resourceService.save('player:owner', ref, 1, playerDraft),
  resourceService.save('player:owner', ref, 1, playerDraft),
]);
assert.equal(firstSave.ok, true, '首个保存必须成功');
assert.equal(staleSave.ok, false, '相同旧版本的并发保存必须冲突');
assert.equal(staleSave.ok === false ? staleSave.reason : '', 'access_policy_revision_conflict');
assert.equal(staleSave.ok === false ? staleSave.current?.revision : 0, 2, '并发冲突必须带回当前权威版本');
assert.equal(maxActiveCommits, 1, '同一资源保存必须在进程内串行执行');
assert.equal(resourceState.policies.use.revision, 2);
assert.equal(resourceState.policies.withdraw, undefined, '保存一个槽位不得写入或改变其他槽位');
const savedPlayer = resourceState.policies.use.conditions[0];
assert.equal(savedPlayer?.type, 'players');
assert.deepEqual(savedPlayer?.type === 'players' ? savedPlayer.players[0] : null, {
  playerNo: 10002,
  playerId: 'player:visitor',
  roleName: '青云剑客',
}, '服务端保存必须按序号重新解析稳定身份，不能信任客户端名字');

const emittedPackets: Array<{ event: string; payload: any }> = [];
const gatewayHelper = new WorldGatewayAccessPolicyHelper({
  gatewayGuardHelper: {
    requireActivePlayerId: () => 'player:owner',
    checkRateLimit: () => true,
  },
  accessPolicyRuntimeService: runtime,
  accessPolicyResourceService: resourceService,
});
await gatewayHelper.handleSaveAccessPolicy({
  emit(event: string, payload: any) {
    emittedPackets.push({ event, payload });
  },
} as never, {
  requestId: 'smoke-conflict',
  ref,
  expectedRevision: 1,
  policy: playerDraft,
});
const conflictPacket = emittedPackets.at(-1)?.payload;
assert.equal(conflictPacket?.ok, false);
assert.equal(conflictPacket?.reason, 'access_policy_revision_conflict');
assert.equal(conflictPacket?.snapshot?.revision, 2, '冲突回包必须包含当前权威快照');
assert.equal(conflictPacket?.snapshot?.policy?.conditions?.[0]?.players?.[0]?.playerId, undefined, '客户端快照不得泄露稳定 playerId');

await gatewayHelper.handleRequestAccessPolicySet({
  emit(event: string, payload: any) {
    emittedPackets.push({ event, payload });
  },
} as never, {
  requestId: 'smoke-set',
  ref: { resourceType: ref.resourceType, resourceId: ref.resourceId },
});
const setPacket = emittedPackets.at(-1)?.payload;
assert.equal(setPacket?.ok, true);
assert.deepEqual(setPacket?.snapshot?.slots?.map((slot: any) => slot.label), ['可看和可放', '可拿']);
assert.equal(setPacket?.snapshot?.slots?.[0]?.policy?.conditions?.[0]?.players?.[0]?.playerId, undefined, '资源组回包不得泄露稳定 playerId');

const invalidRef = await resourceService.loadForEditor('player:owner', {
  resourceType: 'x'.repeat(65),
  resourceId: 'resource:1',
  slot: 'use',
});
assert.deepEqual(invalidRef, { ok: false, reason: 'access_policy_resource_request_invalid' });

const benchmarkFacts = relationEvaluation.ok ? relationEvaluation.facts : null;
assert.ok(benchmarkFacts);
const startedAt = performance.now();
let allowedCount = 0;
for (let index = 0; index < 250_000; index += 1) {
  if (evaluateCompiledAccessPolicy(prepared, benchmarkFacts)) allowedCount += 1;
}
const elapsedMs = performance.now() - startedAt;
assert.equal(allowedCount, 250_000);
assert.ok(elapsedMs < 5_000, `25 万次纯检测耗时异常：${elapsedMs.toFixed(2)}ms`);

unregisterProvider();
runtime.onModuleDestroy();

console.log(JSON.stringify({
  ok: true,
  case: 'access-policy-runtime',
  relationReadCount,
  maxActiveCommits,
  evaluationIterations: 250_000,
  evaluationElapsedMs: Number(elapsedMs.toFixed(2)),
}, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function buildPolicy(
  revision: number,
  conditions: AccessPolicy['conditions'],
  operator: AccessPolicy['operator'] = 'any',
): AccessPolicy {
  return {
    schemaVersion: 1,
    mode: 'conditional',
    operator,
    conditions,
    revision,
  };
}

function evaluationContext() {
  return { actorPlayerId: 'player:visitor', ownerPlayerId: 'player:owner' };
}

function assertLegacyBuildingPolicyMigration(): void {
  const treasurePolicies = normalizePersistedBuildingAccessPolicies({
    treasureVaultPermissions: {
      view: ['all', 'sect'],
      deposit: ['party'],
      withdraw: ['close_friend'],
    },
  }, 'treasure_vault');
  assert.deepEqual(treasurePolicies?.[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit], {
    schemaVersion: 1,
    mode: 'conditional',
    operator: 'any',
    conditions: [{ type: 'party' }],
    revision: 1,
  }, '旧查看/存入权限合并时必须采用安全交集');
  assert.deepEqual(treasurePolicies?.[TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw], {
    schemaVersion: 1,
    mode: 'conditional',
    operator: 'any',
    conditions: [{ type: 'relation', relations: ['close_friend'] }],
    revision: 1,
  });

  const failClosedTreasurePolicies = normalizePersistedBuildingAccessPolicies({
    treasureVaultPermissions: {
      view: ['party', 'sect', 'dao_friend'],
      deposit: ['party', 'sect', 'dao_friend'],
      withdraw: ['all'],
    },
  }, 'treasure_vault');
  assert.equal(
    failClosedTreasurePolicies?.[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit]?.mode,
    'owner_only',
    '无法压入两类条件的旧宝库权限必须失败关闭，不能扩大访问范围',
  );

  const techniquePolicies = normalizePersistedBuildingAccessPolicies({
    techniqueAggregationPermissions: {
      read: {
        unrestricted: false,
        friendLevels: ['close_friend'],
        sectRoles: ['elder', 'inner'],
      },
      revision: {
        unrestricted: false,
        friendLevels: [],
        sectRoles: [],
      },
    },
  }, 'technique_unification_platform');
  assert.deepEqual(
    techniquePolicies?.[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read]?.conditions.map((entry) => entry.type),
    ['relation', 'sect'],
    '旧统法台关系与宗门权限必须迁移为两类通用条件',
  );
  assert.equal(
    techniquePolicies?.[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision]?.mode,
    'owner_only',
  );

  const explicitPolicyWins = normalizePersistedBuildingAccessPolicies({
    accessPolicies: {
      read: EVERYONE_ACCESS_POLICY,
    },
    techniqueAggregationPermissions: {
      read: { unrestricted: false, friendLevels: [], sectRoles: [] },
    },
  }, 'technique_unification_platform');
  assert.equal(
    explicitPolicyWins?.[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read]?.mode,
    'everyone',
    '新通用策略必须优先于旧字段，避免双写真源回退',
  );

  const partialLegacyPolicies = normalizePersistedBuildingAccessPolicies({
    treasureVaultPermissions: { withdraw: ['all'] },
  }, 'treasure_vault');
  assert.equal(
    partialLegacyPolicies?.[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit]?.mode,
    'everyone',
    '旧宝库缺失查看/存入字段时必须保留原有开放默认值',
  );
  const partialTechniquePolicies = normalizePersistedBuildingAccessPolicies({
    techniqueAggregationPermissions: {
      revision: { unrestricted: false, friendLevels: [], sectRoles: [] },
    },
  }, 'technique_unification_platform');
  assert.equal(
    partialTechniquePolicies?.[TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read]?.mode,
    'everyone',
    '旧统法台缺失参阅字段时必须保留原有开放默认值',
  );

  const corruptedExplicitPolicy = normalizePersistedBuildingAccessPolicies({
    accessPolicies: {
      [TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit]: { mode: 'everyone' },
    },
  }, 'treasure_vault');
  assert.equal(
    corruptedExplicitPolicy?.[TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit]?.mode,
    'owner_only',
    '损坏的显式通用策略必须失败关闭，不能回落到业务开放默认值',
  );
}

async function assertBuildingAccessPolicyAdapters(resourceService: AccessPolicyResourceService): Promise<void> {
  const instanceId = 'instance:access-policy-smoke';
  const vault = {
    id: 'building:vault',
    defId: 'treasure_vault',
    state: 'active',
    name: '测试宝库',
    ownerPlayerId: 'player:owner',
    ownerSectId: 'sect:玄门',
    x: 5,
    y: 5,
    revision: 1,
  } as any;
  const platform = {
    id: 'building:platform',
    defId: 'technique_unification_platform',
    state: 'active',
    name: '测试统法台',
    ownerPlayerId: 'player:owner',
    x: 5,
    y: 5,
    revision: 1,
  } as any;
  let flushCount = 0;
  const instance = {
    meta: { instanceId, persistent: true },
    buildingById: new Map([[vault.id, vault], [platform.id, platform]]),
    updateBuildingAccessPolicyState(buildingId: string, slot: string, policy: AccessPolicy, expectedRevision: number) {
      const building = this.buildingById.get(buildingId);
      if (!building) return { ok: false, reason: 'access_policy_resource_not_found' };
      const currentRevision = building.accessPolicies?.[slot]?.revision ?? 1;
      if (currentRevision !== expectedRevision) {
        return { ok: false, reason: 'access_policy_revision_conflict' };
      }
      building.accessPolicies = {
        ...(building.accessPolicies ?? {}),
        [slot]: cloneAccessPolicy(policy),
      };
      building.revision += 1;
      return { ok: true, building, changed: true };
    },
  };
  const buildingService = new BuildingAccessPolicyService(
    runtime,
    resourceService,
    {
      getPlayer(playerId: string) {
        const player = players.get(playerId);
        return player ? { ...player, instanceId, x: 5, y: 5 } : null;
      },
    } as never,
    {
      getInstanceRuntime(requestedInstanceId: string) {
        return requestedInstanceId === instanceId ? instance : null;
      },
      async flushInstanceDomains(requestedInstanceId: string, domains: string[]) {
        assert.equal(requestedInstanceId, instanceId);
        assert.deepEqual(domains, ['building']);
        flushCount += 1;
        return { persistedDomains: domains, skipped: false };
      },
    } as never,
  );
  buildingService.onModuleInit();
  try {
    const vaultLocator = buildingService.buildTreasureVaultResource(vault.id);
    const vaultSet = await resourceService.loadSetForEditor('player:owner', vaultLocator);
    assert.equal(vaultSet.ok, true);
    assert.deepEqual(vaultSet.ok === true
      ? vaultSet.snapshot.slots.map((slot) => [slot.slot, slot.label, slot.policy.mode])
      : [], [
      ['view_deposit', '可看和可放', 'everyone'],
      ['withdraw', '可拿', 'owner_only'],
    ], '宝库必须通过通用资源适配器声明两个独立默认槽位');
    assert.deepEqual(
      await resourceService.loadSetForEditor('player:visitor', vaultLocator),
      { ok: false, reason: 'access_policy_manage_denied' },
      '非建造者不得打开建筑权限编辑器',
    );

    const saveWithdraw = await resourceService.save('player:owner', {
      ...vaultLocator,
      slot: TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw,
    }, 1, cloneAccessPolicy(EVERYONE_ACCESS_POLICY));
    assert.equal(saveWithdraw.ok, true, '宝库通用权限必须在建筑域刷盘后保存成功');
    assert.equal(flushCount, 1);
    assert.equal(vault.accessPolicies.withdraw.revision, 2);
    assert.deepEqual(
      await buildingService.evaluateTreasureVault('player:visitor', vault),
      { viewDeposit: true, withdraw: true },
      '宝库查看/存入与取出必须分别消费通用策略',
    );

    const platformSet = await resourceService.loadSetForEditor(
      'player:owner',
      buildingService.buildTechniquePlatformResource(platform.id),
    );
    assert.equal(platformSet.ok, true);
    assert.deepEqual(platformSet.ok === true
      ? platformSet.snapshot.slots.map((slot) => [slot.slot, slot.label, slot.policy.mode])
      : [], [
      ['read', '参阅', 'everyone'],
      ['revision', '修订', 'owner_only'],
    ], '统法台必须通过通用资源适配器声明参阅与修订槽位');
    assert.deepEqual(
      await buildingService.evaluateTechniquePlatform('player:visitor', platform),
      { read: true, revision: false },
    );
  } finally {
    buildingService.onModuleDestroy();
  }
  assert.equal(
    await resourceService.loadSetForEditor('player:owner', {
      resourceType: ACCESS_POLICY_RESOURCE_TYPE.treasureVault,
      resourceId: vault.id,
    }).then((result) => result.ok),
    false,
    '模块销毁时必须注销建筑权限适配器',
  );
}

function buildAttrs(value: number) {
  return {
    constitution: value,
    spirit: value,
    perception: value,
    talent: value,
    strength: value,
    meridians: value,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
