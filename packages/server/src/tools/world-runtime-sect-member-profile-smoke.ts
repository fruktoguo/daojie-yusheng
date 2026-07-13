/**
 * 用途：验证宗门成员列表会批量水合完全离线玩家的角色名与境界，且不会回退显示内部 ID。
 */
import assert from 'node:assert/strict';

import { loadSectMemberProfiles } from '../persistence/sect-member-profile-read-model';
import { buildDefaultSectRolePermissions } from '../runtime/world/world-runtime-sect-domain.helpers';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';

const leaderId = 'p_534a9449-5b37-452b-ac43-58525ffd9d91_1774413056413';
const offlineMemberId = 'p_11f594a1-1e9a-4c94-8c5f-dfb62a36adeb_1774441114228';
const applicantId = 'p_314e4e88-8492-4382-8e2b-243ee98f6065_1774440967099';
const historicalApplicantId = 'p_b78d69d7-41e5-4887-bc88-ea1efc36f20e_1774440556000';
const sectId = 'sect:test:member-profile';
const sectInstanceId = 'sect:test:member-profile:main';

async function main(): Promise<void> {
  let readModelQueryCount = 0;
  const readModelProfiles = await loadSectMemberProfiles({
    async query(_sql: string, params: unknown[]) {
      readModelQueryCount += 1;
      assert.deepEqual(params, [[offlineMemberId]]);
      return {
        rows: [{
          player_id: offlineMemberId,
          player_name: '离线成员真名',
          display_name: '离',
          username: 'offline-user',
          realm_payload: JSON.stringify({ realmLv: 37 }),
        }],
      };
    },
  } as unknown as Parameters<typeof loadSectMemberProfiles>[0], [offlineMemberId, offlineMemberId]);
  assert.equal(readModelQueryCount, 1);
  assert.equal(readModelProfiles.get(offlineMemberId)?.playerName, '离线成员真名');
  assert.equal(readModelProfiles.get(offlineMemberId)?.realmLv, 37);

  const players = new Map<string, Record<string, unknown>>([
    [leaderId, {
      playerId: leaderId,
      name: '当前宗主',
      displayName: '主',
      sessionId: 'session:leader',
      sectId,
      realm: { realmLv: 42 },
    }],
  ]);
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    getPlayerOrThrow(playerId: string) {
      const player = players.get(playerId);
      if (!player) throw new Error(`missing player ${playerId}`);
      return player;
    },
  };
  let profileBatchCount = 0;
  const service = new WorldRuntimeSectService({}, {}, playerRuntimeService);
  service.loadPersistedSectMemberProfiles = async (playerIds: string[]) => {
    profileBatchCount += 1;
    assert.deepEqual(new Set(playerIds), new Set([leaderId, offlineMemberId, applicantId]));
    return new Map([
      [leaderId, { playerId: leaderId, playerName: '持久化宗主', displayName: null, username: null, realmLv: 41 }],
      [offlineMemberId, { playerId: offlineMemberId, playerName: '离线成员真名', displayName: null, username: null, realmLv: 37 }],
      [applicantId, { playerId: applicantId, playerName: '离线申请人', displayName: null, username: null, realmLv: 30 }],
    ]);
  };
  const sect = {
    sectId,
    sectInstanceId,
    sectTemplateId: 'sect_domain:test:member-profile',
    entranceInstanceId: 'real:test',
    entranceTemplateId: 'test',
    entranceX: 0,
    entranceY: 0,
    coreX: 0,
    coreY: 0,
    mapMinX: -1,
    mapMaxX: 1,
    mapMinY: -1,
    mapMaxY: 1,
    name: '测试宗门',
    mark: '测',
    status: 'active',
    leaderPlayerId: leaderId,
    founderPlayerId: leaderId,
    createdAt: 1,
    updatedAt: 2,
    rolePermissions: buildDefaultSectRolePermissions(),
    members: [
      { playerId: leaderId, name: '未知成员', roleId: 'leader', joinedAt: 1 },
      { playerId: offlineMemberId, name: offlineMemberId, roleId: 'inner', joinedAt: 2 },
    ],
    applications: [
      { playerId: applicantId, name: '未知申请人', status: 'pending', appliedAt: 3, updatedAt: 3 },
      { playerId: historicalApplicantId, name: '历史申请人', status: 'rejected', appliedAt: 2, updatedAt: 3 },
    ],
  };

  await service.hydrateSectMemberProfiles([sect]);
  assert.equal(profileBatchCount, 1, '角色名与境界必须一次批量读取');
  assert.equal(sect.members[0]?.name, '当前宗主', '运行时角色名应优先于启动期持久化缓存');
  assert.equal(sect.members[1]?.name, '离线成员真名', '完全离线成员必须从身份真源补齐角色名');
  assert.equal(sect.applications[0]?.name, '离线申请人', '离线申请人也必须从身份真源补齐角色名');
  assert.equal(service.sectMemberProfilesByPlayerId.has(historicalApplicantId), false, '已结束申请不得占用资料缓存');

  service.sectsById.set(sectId, sect);
  const buildManagementData = () => {
    const action = service.buildSectCoreActions({
      playerId: leaderId,
      self: { x: 0, y: 0 },
      instance: { instanceId: sectInstanceId },
    }, { playerRuntimeService }).find((entry) => entry.id === 'sect:manage');
    assert.ok(action, '宗门核心必须提供管理入口');
    return JSON.parse(decodeURIComponent(/@@sect:(.*)@@/.exec(action.desc)?.[1] ?? ''));
  };

  const firstData = buildManagementData();
  const offlineMember = firstData.members.find((entry) => entry.playerId === offlineMemberId);
  assert.equal(offlineMember?.name, '离线成员真名');
  assert.equal(offlineMember?.realmLv, 37);
  assert.equal(offlineMember?.statusLabel, '离线');
  assert.equal(firstData.members.find((entry) => entry.playerId === leaderId)?.realmLv, 42, '运行时境界应优先于持久化缓存');

  players.set(offlineMemberId, {
    playerId: offlineMemberId,
    name: '改名后的成员',
    displayName: '改',
    sessionId: null,
    sectId,
    realm: { realmLv: 38 },
  });
  const runtimeUpdated = buildManagementData().members.find((entry) => entry.playerId === offlineMemberId);
  assert.equal(runtimeUpdated?.name, '改名后的成员');
  assert.equal(runtimeUpdated?.realmLv, 38);
  assert.equal(runtimeUpdated?.statusLabel, '离线挂机');

  players.delete(offlineMemberId);
  const cachedAfterUnload = buildManagementData().members.find((entry) => entry.playerId === offlineMemberId);
  assert.equal(cachedAfterUnload?.name, '改名后的成员', '玩家卸载后应沿用最后一次真实角色名');
  assert.equal(cachedAfterUnload?.realmLv, 38, '玩家卸载后应沿用最后一次真实境界');
  assert.equal(cachedAfterUnload?.statusLabel, '离线');

  sect.members = sect.members.filter((member) => member.playerId !== offlineMemberId);
  service.releaseSectMemberProfileIfUnused(offlineMemberId);
  assert.equal(service.sectMemberProfilesByPlayerId.has(offlineMemberId), false, '离宗后必须释放无引用资料缓存');

  console.log(JSON.stringify({ ok: true, case: 'world-runtime-sect-member-profile' }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
