/**
 * 用途：验证宗门待审批申请由服务端按权限、搜索和分页返回，且不会混入已处理申请。
 */
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';
import { buildDefaultSectRolePermissions } from '../runtime/world/world-runtime-sect-domain.helpers';

const players = new Map([
  ['leader', { id: 'leader', playerId: 'leader', name: '宗主', sectId: 'sect:test' }],
  ['outer', { id: 'outer', playerId: 'outer', name: '外门', sectId: 'sect:test' }],
]);

const playerRuntimeService = {
  getPlayer(playerId: string) {
    return players.get(playerId) ?? null;
  },
  getPlayerOrThrow(playerId: string) {
    const player = players.get(playerId);
    if (!player) {
      throw new Error('玩家不存在');
    }
    return player;
  },
};

const service = new WorldRuntimeSectService({}, {}, playerRuntimeService);
const pendingApplications = Array.from({ length: 25 }, (_, index) => ({
  playerId: `applicant:${String(index + 1).padStart(2, '0')}`,
  name: `申请人${String(index + 1).padStart(2, '0')}`,
  status: 'pending',
  appliedAt: index + 1,
  updatedAt: index + 1,
}));
pendingApplications.push({
  playerId: 'applicant:special',
  name: '青云散人',
  status: 'pending',
  appliedAt: 100,
  updatedAt: 100,
});

service.sectsById.set('sect:test', {
  sectId: 'sect:test',
  name: '测试宗门',
  status: 'active',
  leaderPlayerId: 'leader',
  createdAt: 1,
  updatedAt: 12345,
  rolePermissions: buildDefaultSectRolePermissions(),
  members: [
    { playerId: 'leader', name: '宗主', roleId: 'leader', joinedAt: 1 },
    { playerId: 'outer', name: '外门', roleId: 'outer', joinedAt: 2 },
  ],
  applications: [
    ...pendingApplications,
    {
      playerId: 'applicant:rejected',
      name: '已退回申请',
      status: 'rejected',
      appliedAt: 0,
      updatedAt: 0,
    },
  ],
});

const firstPage = service.buildSectApplicationPage('leader', {
  requestId: 'sect-page:1',
  offset: 0,
  limit: 20,
});
assert.equal(firstPage.sectId, 'sect:test');
assert.equal(firstPage.total, 26);
assert.equal(firstPage.items.length, 20);
assert.equal(firstPage.items[0]?.playerId, 'applicant:01');
assert.equal(firstPage.revision, 12345);
assert.equal(firstPage.items.some((entry) => entry.playerId === 'applicant:rejected'), false);

const secondPage = service.buildSectApplicationPage('leader', {
  requestId: 'sect-page:2',
  offset: 20,
  limit: 20,
});
assert.equal(secondPage.items.length, 6);
assert.equal(secondPage.items.at(-1)?.playerId, 'applicant:special');

const nameSearch = service.buildSectApplicationPage('leader', {
  requestId: 'sect-page:3',
  search: '  青云  ',
  limit: 20,
});
assert.equal(nameSearch.search, '青云');
assert.deepEqual(nameSearch.items.map((entry) => entry.playerId), ['applicant:special']);

const idSearch = service.buildSectApplicationPage('leader', {
  requestId: 'sect-page:4',
  search: 'SPECIAL',
  limit: 999,
});
assert.equal(idSearch.limit, 50);
assert.deepEqual(idSearch.items.map((entry) => entry.name), ['青云散人']);

assert.throws(
  () => service.buildSectApplicationPage('outer', { requestId: 'sect-page:denied' }),
  (error) => error instanceof ForbiddenException,
  '无 member_role 权限的成员不得读取申请列表',
);
assert.throws(
  () => service.buildSectApplicationPage('leader', { requestId: '' }),
  (error) => error instanceof BadRequestException,
  '空请求 ID 必须被拒绝',
);

console.log(JSON.stringify({ ok: true, case: 'world-runtime-sect-application-page' }, null, 2));
