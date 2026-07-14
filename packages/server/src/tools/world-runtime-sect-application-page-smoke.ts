/**
 * 用途：验证宗门待审批申请由服务端按权限、搜索和分页返回，且不会混入已处理申请。
 */
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SECT_MEMBER_ROLE_HIERARCHY, SECT_PERMISSION_IDS } from '@mud/shared';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';
import {
  SECT_PERMISSIONS,
  SECT_ROLES,
  buildDefaultSectRolePermissions,
  normalizeSectApplications,
  normalizeSectRolePermissions,
  upsertSectApplication,
} from '../runtime/world/world-runtime-sect-domain.helpers';

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
assert.deepEqual(
  SECT_ROLES.map((role) => role.id),
  [...SECT_MEMBER_ROLE_HIERARCHY],
  '服务端职位顺序必须与共享层级契约一致',
);
assert.deepEqual(
  SECT_PERMISSIONS.map((permission) => permission.id),
  [...SECT_PERMISSION_IDS],
  '服务端职位权限必须覆盖共享六项契约',
);
assert.equal(SECT_ROLES.find((role) => role.id === 'supreme_elder')?.assignable, true);
const restoredPermissions = normalizeSectRolePermissions({
  deputy: { guardian: true, member_remove: true, member_role: true },
  supreme_elder: { guardian: false, member_remove: false, member_role: false },
});
assert.ok(
  SECT_PERMISSION_IDS.every((permissionId) => restoredPermissions.deputy[permissionId] === true),
  '旧快照中的副宗主应补齐新增的默认权限',
);
assert.ok(
  SECT_PERMISSION_IDS.every((permissionId) => restoredPermissions.supreme_elder[permissionId] === true),
  '太上长老恢复后必须固定拥有全部权限',
);
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
  sectInstanceId: 'sect-domain:test',
  coreX: 0,
  coreY: 0,
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

const manageAction = service.buildSectCoreActions({
  playerId: 'leader',
  self: { x: 0, y: 0 },
  instance: { instanceId: 'sect-domain:test' },
}, { playerRuntimeService }).find((action) => action.id === 'sect:manage');
assert.ok(manageAction, '宗门核心必须提供管理入口');
const manageData = JSON.parse(decodeURIComponent(/@@sect:(.*)@@/.exec(manageAction.desc)?.[1] ?? ''));
assert.equal(manageData.sectId, 'sect:test', '管理摘要必须提供申请分页使用的权威宗门 ID');
assert.deepEqual(manageData.roles.map((role) => role.id), [...SECT_MEMBER_ROLE_HIERARCHY]);
assert.equal(manageData.roles.find((role) => role.id === 'supreme_elder')?.assignable, true);
assert.equal(manageData.members.find((member) => member.playerId === 'outer')?.canChangeRole, true);

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
  '无 member_approve 权限的成员不得读取申请列表',
);
const sect = service.findSectById('sect:test');
sect.rolePermissions.outer.member_approve = true;
assert.equal(
  service.buildSectApplicationPage('outer', { requestId: 'sect-page:reviewer' }).total,
  26,
  '同意入宗权限应独立允许读取申请列表',
);
assert.equal(
  service.resolveSectInstancePermission('outer', 'sect-domain:test', 'member_role'),
  false,
  '同意入宗权限不得隐式授予修改职位权限',
);
assert.equal(
  service.resolveSectInstancePermission('outer', 'sect-domain:test', 'building_create'),
  false,
  '宗门建筑权限必须独立裁定',
);
assert.throws(
  () => service.buildSectApplicationPage('leader', { requestId: '' }),
  (error) => error instanceof BadRequestException,
  '空请求 ID 必须被拒绝',
);

const reappliedSect = {
  members: [],
  applications: [{
    playerId: 'applicant:reapply',
    name: '旧名',
    status: 'rejected',
    appliedAt: 10,
    updatedAt: 20,
    reviewedAt: 20,
    reviewerPlayerId: 'leader',
  }],
};
const reapplied = upsertSectApplication(reappliedSect, {
  playerId: 'applicant:reapply',
  name: '新名',
}, 30);
assert.equal(reappliedSect.applications.length, 1, '被拒后重新申请必须复用同一条玩家记录');
assert.deepEqual(reapplied, {
  playerId: 'applicant:reapply',
  name: '新名',
  status: 'pending',
  appliedAt: 30,
  updatedAt: 30,
  reviewedAt: null,
  reviewerPlayerId: null,
});
assert.equal(
  normalizeSectApplications(reappliedSect.applications, []).find((entry) => entry.playerId === 'applicant:reapply')?.status,
  'pending',
  '持久化归一化后必须保留重新申请的 pending 状态',
);

console.log(JSON.stringify({ ok: true, case: 'world-runtime-sect-application-page' }, null, 2));
