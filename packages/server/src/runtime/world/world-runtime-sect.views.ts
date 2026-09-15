/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 从 world-runtime-sect.service.ts 抽取的宗门视图、回滚、边界与辅助游离函数。
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
    SECT_APPLICATION_PAGE_DEFAULT_LIMIT,
    SECT_APPLICATION_PAGE_MAX_LIMIT,
    SECT_APPLICATION_SEARCH_MAX_LENGTH,
    TileType,
    isSectMemberRoleLowerThan,
    resolvePlayerFacingContentName,
} from '@mud/shared';
import {
    SECT_BASE_CLEAR_RADIUS,
    SECT_CORE_CHAR,
    SECT_CORE_X,
    SECT_CORE_Y,
    SECT_FOUNDING_CLEAR_RADIUS,
    SECT_INITIAL_STONE_MARGIN,
    SECT_TEMPLATE_PREFIX,
} from '../../constants/gameplay/sect';
import { buildStructuredNotice } from './structured-notice.helpers';
import { destroyManagedInstance } from './world-runtime-instance-lease.helpers';
import {
    findProtectedPlacementConflict,
    formatProtectedPlacementConflictReason,
    iterateSquareProtectedPlacementPoints,
} from './protected-placement.helpers';
import {
    SECT_PERMISSIONS,
    SECT_ROLES,
    buildSectGuardianManagementData,
    canChangeSectMemberRole,
    ensureSectState,
    formatSectGuardianAuraLabel,
    formatSectGuardianStatusLabel,
    getSectRoleLabel,
    hasSectPermission,
    isSectMember,
    normalizeIntegerWithDefault,
    normalizeSectApplications,
    normalizeSectMark,
    normalizeSectMembers,
    normalizeSectRolePermissions,
    resolvePlayerDisplayName,
    resolveSectMemberPresenceLabel,
    resolveSectMemberRealmLv,
    resolveSectTemplateIdForBounds,
} from './world-runtime-sect-domain.helpers';

const SECT_MANAGEMENT_DATA_MARKER = '@@sect:';
const SECT_MANAGEMENT_DATA_MARKER_END = '@@';
export function resolveOptionalSectMemberName(source, playerId) {
    const name = resolvePlayerDisplayName(source, '未知成员');
    return name === normalizeOptionalString(playerId)
        || name === '未知成员' || name === '未知玩家' || name === '未知申请人'
        ? null
        : name;
}

export function resolveSectMemberManagementProfile(member, runtimePlayer, profilesByPlayerId) {
    const playerId = normalizeOptionalString(member?.playerId) || '';
    const cached = profilesByPlayerId?.get?.(playerId) ?? null;
    const runtimeName = resolveOptionalSectMemberName(runtimePlayer, playerId);
    const storedName = resolveOptionalSectMemberName(member, playerId);
    const name = runtimeName || cached?.name || storedName || '未知成员';
    const runtimeRealmLv = resolveSectMemberRealmLv(runtimePlayer);
    const cachedRealmLv = resolveSectMemberRealmLv(cached);
    const realmLv = runtimeRealmLv ?? cachedRealmLv;
    if (playerId && profilesByPlayerId?.set && (name !== '未知成员' || realmLv !== null)) {
        profilesByPlayerId.set(playerId, {
            name: name !== '未知成员' ? name : null,
            realmLv,
        });
    }
    return { name, realmLv };
}

export function buildSectManagementActionDesc(sect, view, deps, guardian, profilesByPlayerId = null) {
    const sectName = resolvePlayerFacingContentName(sect?.sectId, '未知宗门', sect?.name);
    const base = `${sectName} · 印记 ${normalizeOptionalString(sect.mark) || '无'} · 地域 ${formatSectTileCountLabel(sect, view, deps)} · 大阵 ${formatSectGuardianStatusLabel(guardian)} · 灵力 ${formatSectGuardianAuraLabel(guardian)}。`;
    const data = buildSectManagementData(sect, view?.playerId, deps?.playerRuntimeService, guardian, deps?.worldRuntimeFormationService, profilesByPlayerId);
    return `${base}\n${SECT_MANAGEMENT_DATA_MARKER}${encodeURIComponent(JSON.stringify(data))}${SECT_MANAGEMENT_DATA_MARKER_END}`;
}

export function buildSectManagementData(sect, playerId, playerRuntimeService = null, guardian = null, formationService = null, profilesByPlayerId = null) {
    ensureSectState(sect, playerRuntimeService);
    const selfPlayerId = normalizeOptionalString(playerId) || '';
    const canEditPermissions = sect.leaderPlayerId === selfPlayerId;
    const canReviewApplications = hasSectPermission(sect, selfPlayerId, 'member_approve');
    const canChangeRoles = hasSectPermission(sect, selfPlayerId, 'member_role');
    const canLeave = selfPlayerId !== '' && sect.leaderPlayerId !== selfPlayerId && isSectMember(sect, selfPlayerId);
    const selfPlayer = selfPlayerId ? playerRuntimeService?.getPlayer?.(selfPlayerId) : null;
    const selfMember = sect.members.find((member) => member.playerId === selfPlayerId) ?? null;
    const projectedRoles = SECT_ROLES.map((role) => ({
        ...role,
        assignable: role.assignable
            && Boolean(selfMember)
            && isSectMemberRoleLowerThan(role.id, selfMember?.roleId),
    }));
    return {
        v: 4,
        sectId: sect.sectId,
        selfPlayerId,
        canEditPermissions,
        canTransfer: canEditPermissions,
        canDissolve: canEditPermissions,
        canLeave,
        canReviewApplications,
        canManageGuardian: hasSectPermission(sect, selfPlayerId, 'guardian'),
        guardian: buildSectGuardianManagementData(guardian, formationService, selfPlayer),
        canRemoveMembers: hasSectPermission(sect, selfPlayerId, 'member_remove'),
        canChangeRoles,
        roles: projectedRoles,
        permissions: SECT_PERMISSIONS,
        rolePermissions: normalizeSectRolePermissions(sect.rolePermissions),
        members: sect.members.map((member) => {
            const runtimePlayer = playerRuntimeService?.getPlayer?.(member.playerId);
            const profile = resolveSectMemberManagementProfile(member, runtimePlayer, profilesByPlayerId);
            return {
                playerId: member.playerId,
                name: profile.name,
                roleId: member.roleId,
                roleLabel: getSectRoleLabel(member.roleId),
                realmLv: profile.realmLv,
                statusLabel: resolveSectMemberPresenceLabel(runtimePlayer),
                self: member.playerId === selfPlayerId,
                leader: member.playerId === sect.leaderPlayerId,
                canChangeRole: canChangeRoles && canChangeSectMemberRole(sect, selfPlayerId, member),
            };
        }),
        applicationTotal: countPendingSectApplications(sect),
        applicationRevision: normalizeSectApplicationRevision(sect.updatedAt),
    };
}

export function buildSectApplicationPageView(sect, payload) {
    const requestId = normalizeSectApplicationPageRequestId(payload?.requestId);
    const search = normalizeSectApplicationPageSearch(payload?.search);
    const offset = normalizeSectApplicationPageOffset(payload?.offset);
    const limit = normalizeSectApplicationPageLimit(payload?.limit);
    const items = [];
    let total = 0;
    for (const application of Array.isArray(sect?.applications) ? sect.applications : []) {
        if (application?.status !== 'pending' || !matchesSectApplicationPageSearch(application, search)) {
            continue;
        }
        if (total >= offset && items.length < limit) {
            items.push({
                playerId: normalizeOptionalString(application.playerId),
                name: resolvePlayerDisplayName({
                    playerId: application.playerId,
                    name: application.name,
                }, '未知申请人'),
                appliedAt: Number.isFinite(Number(application.appliedAt))
                    ? Math.max(0, Math.trunc(Number(application.appliedAt)))
                    : 0,
            });
        }
        total += 1;
    }
    return {
        requestId,
        sectId: sect.sectId,
        search,
        offset,
        limit,
        total,
        revision: normalizeSectApplicationRevision(sect.updatedAt),
        items,
    };
}

export function countPendingSectApplications(sect) {
    let total = 0;
    for (const application of Array.isArray(sect?.applications) ? sect.applications : []) {
        if (application?.status === 'pending') {
            total += 1;
        }
    }
    return total;
}

export function normalizeSectApplicationRevision(value) {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeSectApplicationPageRequestId(value) {
    const requestId = typeof value === 'string' ? value.trim() : '';
    if (!requestId || requestId.length > 80) {
        throw new BadRequestException('宗门申请分页请求 ID 无效');
    }
    return requestId;
}

export function normalizeSectApplicationPageSearch(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim().slice(0, SECT_APPLICATION_SEARCH_MAX_LENGTH).toLowerCase();
}

export function normalizeSectApplicationPageOffset(value) {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeSectApplicationPageLimit(value) {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return SECT_APPLICATION_PAGE_DEFAULT_LIMIT;
    }
    return Math.max(1, Math.min(SECT_APPLICATION_PAGE_MAX_LIMIT, parsed));
}

export function matchesSectApplicationPageSearch(application, search) {
    if (!search) {
        return true;
    }
    const playerId = normalizeOptionalString(application?.playerId).toLowerCase();
    const name = normalizeOptionalString(application?.name).toLowerCase();
    return playerId.includes(search) || name.includes(search);
}

export function decodeActionPart(value) {
    try {
        return decodeURIComponent(String(value ?? ''));
    }
    catch (_error) {
        return String(value ?? '');
    }
}

export function collectDurableSectAffectedInstanceIds(input, additionalInstanceIds = []) {
    const instanceIds = [...(Array.isArray(additionalInstanceIds) ? additionalInstanceIds : [])];
    for (const write of input?.sectWrites ?? []) {
        if (write?.snapshot) {
            instanceIds.push(write.snapshot.entranceInstanceId, write.snapshot.sectInstanceId);
        }
    }
    for (const write of input?.formationWrites ?? []) {
        instanceIds.push(write?.instanceId, write?.snapshot?.eyeInstanceId);
    }
    return Array.from(new Set(instanceIds.map(normalizeOptionalString).filter(Boolean))).sort();
}

export function captureSectCreationRollback(service, playerId, player, entranceInstance, sectInstanceId, deps) {
    return {
        player: captureSectPlayerRollback(player),
        mappedSectId: normalizeOptionalString(service.playerSectId.get(playerId)),
        entranceInstance: captureSectPortalInstanceRollback(entranceInstance),
        sectInstanceExisted: Boolean(deps.getInstanceRuntime?.(sectInstanceId)),
    };
}

export function captureSectMembershipRollback(service, sectIds, playerIds) {
    const sects = [];
    for (const sectId of Array.from(new Set(sectIds ?? []))) {
        const sect = service.findSectById(sectId);
        const snapshot = normalizeSectEntry(sect);
        if (snapshot) {
            sects.push({ sect, snapshot });
        }
    }
    const players = [];
    for (const playerId of Array.from(new Set(playerIds ?? []))) {
        const player = service.playerRuntimeService.getPlayer?.(playerId) ?? null;
        players.push({
            playerId,
            player,
            rollback: player ? captureSectPlayerRollback(player) : null,
            mappedSectId: normalizeOptionalString(service.playerSectId.get(playerId)),
        });
    }
    return { sects, players };
}

export function restoreSectMembershipRollback(service, rollback) {
    for (const entry of rollback.sects) {
        for (const key of Object.keys(entry.sect)) {
            delete entry.sect[key];
        }
        Object.assign(entry.sect, entry.snapshot);
        service.sectsById.set(entry.snapshot.sectId, entry.sect);
        service.deletedSectSnapshotsById.delete(entry.snapshot.sectId);
    }
    for (const entry of rollback.players) {
        if (entry.player && entry.rollback) {
            restoreSectPlayerRollback(
                entry.playerId,
                entry.player,
                entry.rollback,
                service.playerRuntimeService,
            );
        }
        if (entry.mappedSectId) {
            service.playerSectId.set(entry.playerId, entry.mappedSectId);
        } else {
            service.playerSectId.delete(entry.playerId);
        }
    }
}

export async function restoreSectCreationRollback(input) {
    const formationId = `formation:sect_guardian:${input.sectId}`;
    input.deps.worldRuntimeFormationService?.removeFormationFromInstance?.(
        input.entranceInstance?.meta?.instanceId,
        formationId,
        input.deps,
        { deferPersistence: true },
    );
    restoreSectPortalInstanceRollback(input.entranceInstance, input.rollback.entranceInstance);
    if (!input.rollback.sectInstanceExisted) {
        try {
            const destroyed = await destroyManagedInstance(input.deps, input.instanceId, 'sect_creation_rollback');
            if (destroyed?.ok !== true && destroyed?.reason !== 'instance_not_found') {
                input.service.logger.warn(`建宗失败后的实例销毁被拒绝：${input.instanceId} reason=${destroyed?.reason ?? 'unknown'}`);
            }
        } catch (error) {
            input.service.logger.warn(`建宗失败后的实例销毁异常：${input.instanceId} ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    input.service.sectsById.delete(input.sectId);
    restoreSectPlayerRollback(input.playerId, input.player, input.rollback.player, input.service.playerRuntimeService);
    if (input.rollback.mappedSectId) {
        input.service.playerSectId.set(input.playerId, input.rollback.mappedSectId);
    } else {
        input.service.playerSectId.delete(input.playerId);
    }
}

export function captureSectRelocationRollback(input) {
    const instances = [];
    const seen = new Set();
    for (const instance of [input.previousEntranceInstance, input.entranceInstance, input.sectInstance]) {
        const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
        if (!instanceId || seen.has(instanceId)) {
            continue;
        }
        seen.add(instanceId);
        instances.push({ instance, rollback: captureSectPortalInstanceRollback(instance) });
    }
    return {
        player: captureSectPlayerRollback(input.player),
        sect: normalizeSectEntry(input.sect),
        instances,
        previousGuardian: cloneSectGuardian(input.previousGuardian),
    };
}

export function restoreSectRelocationRollback(input) {
    const snapshot = input.rollback.sect;
    if (snapshot) {
        for (const key of Object.keys(input.sect)) {
            delete input.sect[key];
        }
        Object.assign(input.sect, snapshot);
        input.service.sectsById.set(snapshot.sectId, input.sect);
    }
    restoreSectPlayerRollback(input.playerId, input.player, input.rollback.player, input.service.playerRuntimeService);
    for (const entry of input.rollback.instances) {
        restoreSectPortalInstanceRollback(entry.instance, entry.rollback);
    }
    const formationId = `formation:sect_guardian:${input.sect.sectId}`;
    for (const entry of input.rollback.instances) {
        input.deps.worldRuntimeFormationService?.removeFormationFromInstance?.(
            entry.instance?.meta?.instanceId,
            formationId,
            input.deps,
            { deferPersistence: true },
        );
    }
    if (input.rollback.previousGuardian && snapshot) {
        input.service.ensureGuardianFormation(snapshot, input.deps, input.rollback.previousGuardian, { deferPersistence: true });
    }
}

export function captureSectPlayerRollback(player) {
    return {
        sectId: normalizeOptionalString(player?.sectId),
        inventoryItems: Array.isArray(player?.inventory?.items)
            ? player.inventory.items.map((item) => ({ ...item }))
            : [],
        inventoryRevision: Math.max(0, Math.trunc(Number(player?.inventory?.revision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
        persistedRevision: Math.max(0, Math.trunc(Number(player?.persistedRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}

export function restoreSectPlayerRollback(playerId, player, rollback, playerRuntimeService) {
    playerRuntimeService.replaceInventoryItems?.(playerId, rollback.inventoryItems);
    player.inventory.revision = rollback.inventoryRevision;
    player.sectId = rollback.sectId;
    player.persistentRevision = rollback.persistentRevision;
    player.persistedRevision = rollback.persistedRevision;
    player.selfRevision = rollback.selfRevision;
    player.dirtyDomains = new Set(rollback.dirtyDomains);
}

export function captureSectPortalInstanceRollback(instance) {
    if (!instance) {
        return null;
    }
    return {
        runtimePortals: Array.isArray(instance.runtimePortals)
            ? instance.runtimePortals.map((portal) => ({ ...portal }))
            : [],
        worldRevision: Math.max(0, Math.trunc(Number(instance.worldRevision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(instance.persistentRevision ?? 0))),
        dirtyDomains: instance.dirtyDomains instanceof Set ? Array.from(instance.dirtyDomains) : [],
    };
}

export function restoreSectPortalInstanceRollback(instance, rollback) {
    if (!instance || !rollback) {
        return;
    }
    instance.runtimePortals = rollback.runtimePortals.map((portal) => ({ ...portal }));
    instance.worldRevision = rollback.worldRevision;
    instance.persistentRevision = rollback.persistentRevision;
    instance.dirtyDomains = new Set(rollback.dirtyDomains);
    instance.markAoiViewChangedGlobally?.();
}

export function cloneSectGuardian(formation) {
    if (!formation || typeof formation !== 'object') {
        return null;
    }
    return {
        ...formation,
        allocation: formation.allocation && typeof formation.allocation === 'object'
            ? { ...formation.allocation }
            : formation.allocation,
        stats: formation.stats && typeof formation.stats === 'object'
            ? { ...formation.stats }
            : formation.stats,
    };
}

export function removeSectRuntimePortals(instance, sectId) {
    if (!instance || !Array.isArray(instance.runtimePortals)) {
        return false;
    }
    const removedPortals = instance.runtimePortals.filter((portal) => portal?.sectId === sectId);
    if (removedPortals.length === 0) {
        return false;
    }
    instance.runtimePortals = instance.runtimePortals.filter((portal) => portal?.sectId !== sectId);
    for (const portal of removedPortals) {
        instance.markAoiViewChangedAt?.(portal.x, portal.y);
    }
    instance.worldRevision += 1;
    instance.persistentRevision += 1;
    instance.markPersistenceDirtyDomains?.(['overlay']);
    return true;
}

export function hasExpectedSectRuntimePortal(instance, expected) {
    if (!instance || !Array.isArray(instance.runtimePortals)) {
        return false;
    }
    return instance.runtimePortals.some((portal) => portal?.sectId === expected.sectId
        && portal?.kind === expected.kind
        && portal?.trigger === 'manual'
        && Math.trunc(Number(portal?.x)) === Math.trunc(Number(expected.x))
        && Math.trunc(Number(portal?.y)) === Math.trunc(Number(expected.y))
        && normalizeOptionalString(portal?.targetMapId) === normalizeOptionalString(expected.targetMapId)
        && normalizeOptionalString(portal?.targetInstanceId) === normalizeOptionalString(expected.targetInstanceId)
        && Math.trunc(Number(portal?.targetX)) === Math.trunc(Number(expected.targetX))
        && Math.trunc(Number(portal?.targetY)) === Math.trunc(Number(expected.targetY)));
}

export function syncSectRuntimeDomainTiles(sect, instance) {
    if (!sect || !instance || typeof instance.activateRuntimeTile !== 'function') {
        return false;
    }
    const bounds = normalizeSectBounds(sect);
    let changed = false;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
        for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
            const tileType = Math.abs(x - SECT_CORE_X) <= SECT_BASE_CLEAR_RADIUS
                && Math.abs(y - SECT_CORE_Y) <= SECT_BASE_CLEAR_RADIUS
                ? TileType.Floor
                : TileType.Stone;
            const activated = instance.activateRuntimeTile(x, y, tileType);
            if (activated?.created === true && activated.tileIndex >= 0 && typeof instance.markStaticTileSyncDirtyByIndex === 'function') {
                instance.markStaticTileSyncDirtyByIndex(activated.tileIndex, { sightBlockingChanged: activated.created === true && tileType === TileType.Stone });
            }
            if (activated?.created === true) {
                changed = true;
            }
        }
    }
    return changed;
}

export function buildSectMapDocument(sect) {
    const bounds = normalizeSectBounds(sect);
    return {
        id: resolveSectTemplateIdForBounds(sect.sectId, sect.sectTemplateId, bounds),
        name: sect.name,
        width: 1,
        height: 1,
        routeDomain: `sect:${sect.sectId}`,
        terrainProfileId: 'sect_stone_domain',
        mapLv: 1,
        sectMap: true,
        sectId: sect.sectId,
        sectMark: normalizeOptionalString(sect.mark) || SECT_CORE_CHAR,
        sectCoreX: SECT_CORE_X,
        sectCoreY: SECT_CORE_Y,
        sectMapMinX: bounds.minX,
        sectMapMaxX: bounds.maxX,
        sectMapMinY: bounds.minY,
        sectMapMaxY: bounds.maxY,
        tiles: ['P'],
        spawnPoint: { x: SECT_CORE_X, y: SECT_CORE_Y },
        portals: [],
        npcs: [],
        monsters: [],
        safeZones: [],
        landmarks: [],
        containers: [],
        auras: [],
    };
}

export function normalizeSectEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const sectId = normalizeOptionalString(entry.sectId);
    const leaderPlayerId = normalizeOptionalString(entry.leaderPlayerId);
    const entranceInstanceId = normalizeOptionalString(entry.entranceInstanceId);
    const sectInstanceId = normalizeOptionalString(entry.sectInstanceId);
    if (!sectId || !leaderPlayerId || !entranceInstanceId || !sectInstanceId) {
        return null;
    }
    const parsedTemplate = parseSectTemplateDescriptor(normalizeOptionalString(entry.sectTemplateId) || '');
    const fallbackRadius = Math.max(1, Math.trunc(Number(entry.expansionRadius) || 1));
    const fallbackBounds = parsedTemplate?.bounds ?? {
        minX: -fallbackRadius,
        maxX: fallbackRadius,
        minY: -fallbackRadius,
        maxY: fallbackRadius,
    };
    const bounds = normalizeBoundsObject({
        minX: entry.mapMinX,
        maxX: entry.mapMaxX,
        minY: entry.mapMinY,
        maxY: entry.mapMaxY,
    }) ?? fallbackBounds;
    const templateId = resolveSectTemplateIdForBounds(sectId, entry.sectTemplateId, bounds);
    const sectName = resolvePlayerFacingContentName(sectId, '未知宗门', entry.name);
    const leaderName = resolvePlayerDisplayName(null, normalizeOptionalString(entry.leaderName) || leaderPlayerId);
        return {
            sectId,
            name: sectName,
            mark: normalizeSectMark(entry.mark, sectName),
            founderPlayerId: normalizeOptionalString(entry.founderPlayerId) || leaderPlayerId,
        leaderPlayerId,
        status: entry.status === 'dissolved' || entry.status === 'locked' ? entry.status : 'active',
        entranceInstanceId,
        entranceTemplateId: normalizeOptionalString(entry.entranceTemplateId) || 'yunlai_town',
        entranceX: Math.trunc(Number(entry.entranceX) || 0),
        entranceY: Math.trunc(Number(entry.entranceY) || 0),
        sectInstanceId,
        sectTemplateId: templateId,
        coreX: SECT_CORE_X,
        coreY: SECT_CORE_Y,
        expansionRadius: Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)),
        mapMinX: bounds.minX,
        mapMaxX: bounds.maxX,
        mapMinY: bounds.minY,
        mapMaxY: bounds.maxY,
        members: normalizeSectMembers(entry.members, {
            sectId,
            leaderPlayerId,
            leaderName,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        }),
        applications: normalizeSectApplications(entry.applications, normalizeSectMembers(entry.members, {
            sectId,
            leaderPlayerId,
            leaderName,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        })),
        rolePermissions: normalizeSectRolePermissions(entry.rolePermissions),
        lastEntranceRelocatedAt: normalizeIntegerWithDefault(entry.lastEntranceRelocatedAt, 0),
        entranceRelocationCooldownUntil: normalizeIntegerWithDefault(entry.entranceRelocationCooldownUntil, 0),
        createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
    };
}

export function buildInitialSectBounds() {
    const radius = SECT_BASE_CLEAR_RADIUS + SECT_INITIAL_STONE_MARGIN;
    return { minX: -radius, maxX: radius, minY: -radius, maxY: radius };
}

export function normalizeSectBounds(sect) {
    const parsedTemplate = parseSectTemplateDescriptor(normalizeOptionalString(sect?.sectTemplateId) || '');
    const fallbackRadius = Math.max(SECT_BASE_CLEAR_RADIUS + SECT_INITIAL_STONE_MARGIN, Math.trunc(Number(sect?.expansionRadius) || 0));
    return normalizeBoundsObject({
        minX: sect?.mapMinX,
        maxX: sect?.mapMaxX,
        minY: sect?.mapMinY,
        maxY: sect?.mapMaxY,
    }) ?? parsedTemplate?.bounds ?? {
        minX: -fallbackRadius,
        maxX: fallbackRadius,
        minY: -fallbackRadius,
        maxY: fallbackRadius,
    };
}

export function normalizeBoundsObject(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const minX = Math.trunc(Number(input.minX));
    const maxX = Math.trunc(Number(input.maxX));
    const minY = Math.trunc(Number(input.minY));
    const maxY = Math.trunc(Number(input.maxY));
    if (![minX, maxX, minY, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) {
        return null;
    }
    return { minX, maxX, minY, maxY };
}

export function parseSectTemplateDescriptor(templateId) {
    const normalized = normalizeOptionalString(templateId);
    if (!normalized || !normalized.startsWith(SECT_TEMPLATE_PREFIX)) {
        return null;
    }
    const body = normalized.slice(SECT_TEMPLATE_PREFIX.length);
    const boundsMatch = /:x(-?\d+)_(-?\d+):y(-?\d+)_(-?\d+)$/.exec(body);
    if (boundsMatch) {
        const sectId = body.slice(0, boundsMatch.index);
        const bounds = normalizeBoundsObject({
            minX: boundsMatch[1],
            maxX: boundsMatch[2],
            minY: boundsMatch[3],
            maxY: boundsMatch[4],
        });
        return sectId && bounds ? { sectId, bounds } : null;
    }
    const radiusMatch = /:r(\d+)$/.exec(body);
    if (radiusMatch) {
        const sectId = body.slice(0, radiusMatch.index);
        const radius = Math.max(1, Math.trunc(Number(radiusMatch[1]) || 1));
        return sectId ? { sectId, bounds: { minX: -radius, maxX: radius, minY: -radius, maxY: radius } } : null;
    }
    return body ? { sectId: body, bounds: buildInitialSectBounds() } : null;
}

export function formatSectTileCountLabel(sect, view, deps) {
    const instanceId = normalizeOptionalString(view?.instance?.instanceId) || normalizeOptionalString(sect?.sectInstanceId);
    const instance = instanceId && typeof deps?.getInstanceRuntime === 'function'
        ? deps.getInstanceRuntime(instanceId)
        : null;
    const count = getRuntimeTileCount(instance);
    if (count > 0) {
        return `${count}格`;
    }
    const bounds = normalizeSectBounds(sect);
    return `${Math.max(0, (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1))}格`;
}

export function getRuntimeTileCount(instance) {
    if (!instance) {
        return 0;
    }
    if (instance.tilePlane && typeof instance.tilePlane.getCellCount === 'function') {
        return Math.max(0, Math.trunc(Number(instance.tilePlane.getCellCount()) || 0));
    }
    if (typeof instance.forEachRuntimeTile === 'function') {
        let count = 0;
        instance.forEachRuntimeTile(() => { count += 1; });
        return count;
    }
    return 0;
}

export function assertCanCreateSectAtInstance(instance, descriptor) {
    const meta = instance?.meta ?? {};
    const kind = normalizeOptionalString(meta.kind ?? instance?.kind);
    const linePreset = normalizeOptionalString(meta.linePreset ?? instance?.linePreset ?? descriptor?.linePreset);
    if (kind === 'public' && linePreset === 'real') {
        return;
    }
    throw new BadRequestException('只能在大地图现世线建立宗门。');
}

export function assertSectFoundingAreaClear(sects, instance, instanceId, centerX, centerY, ignoredSectId = null) {
    const x0 = Math.trunc(Number(centerX));
    const y0 = Math.trunc(Number(centerY));
    const ignored = normalizeOptionalString(ignoredSectId);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
        throw new BadRequestException('当前位置无法开辟宗门入口');
    }
    const conflict = findProtectedPlacementConflict(
        instance,
        iterateSquareProtectedPlacementPoints(x0, y0, SECT_FOUNDING_CLEAR_RADIUS),
        { ignoredPortalSectId: ignored },
    );
    if (conflict.ok !== true) {
        throw new BadRequestException(`宗门山门五格阵基内${formatProtectedPlacementConflictReason(conflict.reason)}`);
    }
    const normalizedInstanceId = normalizeOptionalString(instanceId);
    for (const sect of Array.isArray(sects) ? sects : []) {
        if (!sect || sect.status === 'dissolved' || normalizeOptionalString(sect.entranceInstanceId) !== normalizedInstanceId) {
            continue;
        }
        if (ignored && normalizeOptionalString(sect.sectId) === ignored) {
            continue;
        }
        if (chebyshevDistance(x0, y0, sect.entranceX, sect.entranceY) <= SECT_FOUNDING_CLEAR_RADIUS) {
            throw new BadRequestException('宗门山门五格阵基内不能有其他宗门');
        }
    }
}

export function logSectEntranceProtectedPlacementConflict(logger, sect, instance) {
    if (!sect || !instance) {
        return;
    }
    const x = Math.trunc(Number(sect.entranceX));
    const y = Math.trunc(Number(sect.entranceY));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
    }
    const conflict = findProtectedPlacementConflict(
        instance,
        iterateSquareProtectedPlacementPoints(x, y, SECT_FOUNDING_CLEAR_RADIUS),
        { ignoredPortalSectId: normalizeOptionalString(sect.sectId) },
    );
    if (conflict.ok !== true) {
        logger?.warn?.(`启动发现宗门山门五格阵基保护点位冲突，暂不清理：${normalizeOptionalString(sect.sectId) ?? ''} ${formatProtectedPlacementConflictReason(conflict.reason)} (${conflict.x},${conflict.y})`);
    }
}

export function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
}

export function createSectShutdownSignal(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((next) => {
        resolve = next;
    });
    return { promise, resolve };
}

export function resolveNextSectUpdatedAt(sect, now = Date.now()) {
    const previous = normalizeIntegerWithDefault(sect?.updatedAt, 0);
    const wallClock = normalizeIntegerWithDefault(now, Date.now());
    return Math.max(previous + 1, wallClock);
}

export function advanceSectUpdatedAt(sect, now = Date.now()) {
    if (!sect || typeof sect !== 'object') {
        return 0;
    }
    const next = resolveNextSectUpdatedAt(sect, now);
    sect.updatedAt = next;
    return next;
}

export function chebyshevDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(Math.trunc(Number(ax)) - Math.trunc(Number(bx))), Math.abs(Math.trunc(Number(ay)) - Math.trunc(Number(by))));
}

export function formatDurationMs(ms) {
    const totalSeconds = Math.max(0, Math.ceil(Number(ms) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) {
        return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
    }
    if (hours > 0) {
        return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }
    return `${Math.max(1, minutes)}分钟`;
}

export function touchRuntimeInstanceRevision(deps, instanceId) {
    const instance = deps.getInstanceRuntime?.(instanceId);
    if (instance) {
        instance.worldRevision += 1;
    }
}

export function queueStructuredSectNotice(deps, playerId, kind, key, fallbackText, opts = undefined) {
    if (!normalizeOptionalString(playerId)) {
        return;
    }
    const notice = buildStructuredNotice(kind, key, fallbackText, opts);
    deps.queuePlayerNotice?.(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
}

export function isRuntimeBoundaryTile(instance, x, y) {
    if (!instance || typeof instance.isInBounds !== 'function') {
        return false;
    }
    const tx = Math.trunc(Number(x));
    const ty = Math.trunc(Number(y));
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || instance.isInBounds(tx, ty) !== true) {
        return false;
    }
    let boundary = false;
    forEachRuntimeBoundaryGap(instance, tx, ty, () => {
        boundary = true;
    });
    return boundary;
}

export function forEachRuntimeBoundaryGap(instance, x, y, visitor) {
    if (!instance || typeof instance.isInBounds !== 'function' || typeof visitor !== 'function') {
        return;
    }
    const tx = Math.trunc(Number(x));
    const ty = Math.trunc(Number(y));
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || instance.isInBounds(tx, ty) !== true) {
        return;
    }
    for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = tx + dx;
            const nextY = ty + dy;
            if (instance.isInBounds(nextX, nextY) !== true) {
                visitor(nextX, nextY);
            }
        }
    }
}

export function updateSectRuntimeBoundsForTile(sect, x, y) {
    const coreX = Math.trunc(Number(sect?.coreX) || 0);
    const coreY = Math.trunc(Number(sect?.coreY) || 0);
    const logicalX = Math.trunc(Number(x)) - coreX;
    const logicalY = Math.trunc(Number(y)) - coreY;
    const bounds = normalizeSectBounds(sect);
    sect.mapMinX = Math.min(bounds.minX, logicalX);
    sect.mapMaxX = Math.max(bounds.maxX, logicalX);
    sect.mapMinY = Math.min(bounds.minY, logicalY);
    sect.mapMaxY = Math.max(bounds.maxY, logicalY);
    sect.expansionRadius = Math.max(
        Math.abs(sect.mapMinX),
        Math.abs(sect.mapMaxX),
        Math.abs(sect.mapMinY),
        Math.abs(sect.mapMaxY),
    );
}

export function markSectExpansionTilesForSync(instance, previousBounds, nextBounds, openedX, openedY) {
    if (!instance || typeof instance.markStaticTileSyncDirtyByIndex !== 'function' || typeof instance.toTileIndex !== 'function') {
        return;
    }
    markRuntimeTileForStaticSync(instance, openedX, openedY, true);
    for (let y = nextBounds.minY; y <= nextBounds.maxY; y += 1) {
        for (let x = nextBounds.minX; x <= nextBounds.maxX; x += 1) {
            if (x >= previousBounds.minX && x <= previousBounds.maxX && y >= previousBounds.minY && y <= previousBounds.maxY) {
                continue;
            }
            markRuntimeTileForStaticSync(instance, x, y, true);
        }
    }
}

export function markRuntimeTileForStaticSync(instance, x, y, sightBlockingChanged = false) {
    const tileIndex = instance.toTileIndex(Math.trunc(Number(x)), Math.trunc(Number(y)));
    if (!Number.isFinite(tileIndex) || tileIndex < 0) {
        return;
    }
    instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged });
}

export function areSectBoundsEqual(left, right) {
    return left?.minX === right?.minX
        && left?.maxX === right?.maxX
        && left?.minY === right?.minY
        && left?.maxY === right?.maxY;
}

export function readSectTemplateBounds(template) {
    const source = template?.source && typeof template.source === 'object' ? template.source : null;
    return normalizeBoundsObject({
        minX: source?.sectMapMinX,
        maxX: source?.sectMapMaxX,
        minY: source?.sectMapMinY,
        maxY: source?.sectMapMaxY,
    });
}

export function areSectTemplateBoundsEqual(template, bounds) {
    const normalizedBounds = normalizeBoundsObject(bounds);
    const templateBounds = readSectTemplateBounds(template);
    return Boolean(templateBounds && normalizedBounds && areSectBoundsEqual(templateBounds, normalizedBounds));
}

export async function waitForSectInstancesLeaseReady(instances, deps) {
    const currentInstances: any[] = [];
    const seenInstanceIds = new Set<string>();
    for (const instance of Array.isArray(instances) ? instances : []) {
        const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
        if (!instanceId || seenInstanceIds.has(instanceId)) {
            continue;
        }
        seenInstanceIds.add(instanceId);
        currentInstances.push(instance);
        await deps.waitForInstanceLeaseReady?.(instanceId);
    }
    if (currentInstances.length === 0) {
        throw new ServiceUnavailableException('宗门实例尚未就绪');
    }
    const writable = currentInstances.every((instance) => {
        const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
        return deps.getInstanceRuntime?.(instanceId) === instance
            && (typeof deps.isInstanceLeaseWritable !== 'function' || deps.isInstanceLeaseWritable(instance));
    });
    if (!writable) {
        throw new ServiceUnavailableException('宗门实例租约尚未就绪');
    }
}

export async function prepareSectRuntimeApply(sect, entranceInstance, sectInstance, deps, logger) {
    if (!entranceInstance || !sectInstance) {
        logger.warn(`宗门运行态应用跳过：${sect.sectId} 入口或宗门实例不存在`);
        return false;
    }
    const instances: any[] = [];
    const seenInstanceIds = new Set<string>();
    for (const instance of [entranceInstance, sectInstance]) {
        const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
        if (!instanceId || seenInstanceIds.has(instanceId)) {
            continue;
        }
        seenInstanceIds.add(instanceId);
        instances.push(instance);
    }
    try {
        for (const instance of instances) {
            const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
            await deps.waitForInstanceLeaseReady?.(instanceId);
            if (deps.instanceCatalogService?.isEnabled?.()) {
                if (typeof deps.syncInstanceLease !== 'function') {
                    return false;
                }
                await deps.syncInstanceLease(instanceId, { hydratePersistentSnapshot: false });
            }
        }
    } catch (error) {
        logger.warn(`宗门运行态应用前续租失败：${sect.sectId} ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
    const writable = instances.every((instance) => {
        const instanceId = normalizeOptionalString(instance?.meta?.instanceId);
        return deps.getInstanceRuntime?.(instanceId) === instance
            && (typeof deps.isInstanceLeaseWritable !== 'function' || deps.isInstanceLeaseWritable(instance));
    });
    if (!writable) {
        logger.warn(`宗门运行态应用跳过：${sect.sectId} 入口或宗门实例租约不可写`);
    }
    return writable;
}
