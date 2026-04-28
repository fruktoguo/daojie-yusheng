// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeSectService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const pg_1 = require("pg");
const env_alias_1 = require("../../config/env-alias");
const persistent_document_table_1 = require("../../persistence/persistent-document-table");
const runtime_tile_expansion_1 = require("../map/runtime-tile-expansion");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const SECT_PERSISTENCE_SCOPE = 'server_sects_v1';
const SECT_PERSISTENCE_KEY = 'sects';
const SECT_TEMPLATE_PREFIX = 'sect_domain:';
const SECT_INSTANCE_PREFIX = 'sect:';
const SECT_BASE_CLEAR_RADIUS = 1;
const SECT_INNATE_STABILIZER_RADIUS = 8;
const SECT_INITIAL_STONE_MARGIN = 1;
const SECT_EXPAND_CHUNK = 8;
const SECT_SPARSE_EXPAND_RADIUS = 2;
const SECT_CORE_CHAR = '宗';
const SECT_ENTRANCE_CHAR = '门';
const SECT_GUARDIAN_INITIAL_AURA = 100000;
const SECT_MANAGEMENT_DATA_MARKER = '@@sect:';
const SECT_MANAGEMENT_DATA_MARKER_END = '@@';
const SECT_ROLES = [
    { id: 'leader', label: '宗主', assignable: false },
    { id: 'deputy', label: '副宗主', assignable: true },
    { id: 'elder', label: '长老', assignable: true },
    { id: 'inner', label: '内门弟子', assignable: true },
    { id: 'outer', label: '外门弟子', assignable: true },
    { id: 'labor', label: '杂役', assignable: true },
    { id: 'supreme_elder', label: '太上长老', assignable: false },
];
const SECT_ROLE_IDS = new Set(SECT_ROLES.map((entry) => entry.id));
const SECT_ASSIGNABLE_ROLE_IDS = new Set(SECT_ROLES.filter((entry) => entry.assignable).map((entry) => entry.id));
const SECT_PERMISSIONS = [
    { id: 'guardian', label: '护宗大阵' },
    { id: 'member_remove', label: '移除成员' },
    { id: 'member_role', label: '修改职位' },
];
const SECT_PERMISSION_IDS = new Set(SECT_PERMISSIONS.map((entry) => entry.id));
const DEFAULT_SECT_ROLE_PERMISSIONS = {
    leader: { guardian: true, member_remove: true, member_role: true },
    deputy: { guardian: true, member_remove: true, member_role: true },
    elder: { guardian: true, member_remove: false, member_role: false },
    inner: { guardian: false, member_remove: false, member_role: false },
    outer: { guardian: false, member_remove: false, member_role: false },
    labor: { guardian: false, member_remove: false, member_role: false },
    supreme_elder: { guardian: true, member_remove: false, member_role: false },
};

const { buildPublicInstanceId, parseRuntimeInstanceDescriptor } = world_runtime_normalization_helpers_1;

/** world-runtime sect：宗门地图、入口、核心与护宗大阵运行时编排。 */
class WorldRuntimeSectService {
    logger = new common_1.Logger(WorldRuntimeSectService.name);
    contentTemplateRepository;
    templateRepository;
    playerRuntimeService;
    sectsById = new Map();
    playerSectId = new Map();
    restored = false;
    persistencePool = null;
    persistenceReady = false;
    persistenceInitPromise = null;

    constructor(contentTemplateRepository, templateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }

    dispatchCreateSect(playerId, slotIndex, item, deps, payload = null) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (normalizeOptionalString(player.sectId)) {
            throw new common_1.BadRequestException('你已经有所属宗门');
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const entranceInstance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const descriptor = parseRuntimeInstanceDescriptor(location.instanceId);
        assertCanCreateSectAtInstance(entranceInstance, descriptor);
        if (entranceInstance.meta.kind !== 'public' && descriptor?.instanceOrigin !== 'public') {
            throw new common_1.BadRequestException('当前地点无法开辟宗门入口');
        }
        if (entranceInstance.getPortalAtTile(player.x, player.y)) {
            throw new common_1.BadRequestException('当前位置已有传送入口');
        }
        const sectId = buildSectId(playerId);
        const sectName = normalizeSectName(payload?.sectName, player);
        const sectMark = normalizeSectMark(payload?.sectMark, sectName);
        const bounds = buildInitialSectBounds();
        const templateId = buildSectTemplateId(sectId, bounds);
        const instanceId = buildSectInstanceId(sectId);
        const coreX = -bounds.minX;
        const coreY = -bounds.minY;
        const now = Date.now();
        const sect = {
            sectId,
            name: sectName,
            mark: sectMark,
            founderPlayerId: playerId,
            leaderPlayerId: playerId,
            status: 'active',
            entranceInstanceId: location.instanceId,
            entranceTemplateId: entranceInstance.template.id,
            entranceX: player.x,
            entranceY: player.y,
            sectInstanceId: instanceId,
            sectTemplateId: templateId,
            coreX,
            coreY,
            expansionRadius: Math.max(
                Math.abs(bounds.minX),
                Math.abs(bounds.maxX),
                Math.abs(bounds.minY),
                Math.abs(bounds.maxY),
            ),
            mapMinX: bounds.minX,
            mapMaxX: bounds.maxX,
            mapMinY: bounds.minY,
            mapMaxY: bounds.maxY,
            members: [buildSectMemberEntry(player, 'leader', now)],
            rolePermissions: buildDefaultSectRolePermissions(),
            createdAt: now,
            updatedAt: now,
        };
        this.registerSectTemplate(sect);
        const sectInstance = this.ensureSectRuntimeInstance(sect, deps);
        this.attachSectPortals(sect, entranceInstance, sectInstance);
        this.sectsById.set(sectId, sect);
        this.playerSectId.set(playerId, sectId);
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
        if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(playerId, sectId);
        } else {
            player.sectId = sectId;
        }
        this.ensureGuardianFormation(sect, deps);
        touchRuntimeInstanceRevision(deps, entranceInstance.meta.instanceId);
        touchRuntimeInstanceRevision(deps, sectInstance.meta.instanceId);
        this.persistSectsSoon();
        deps.queuePlayerNotice(playerId, `建宗令化作山门，你开辟了${sect.name}。`, 'success');
        deps.refreshQuestStates?.(playerId);
        return sect;
    }

    ensureSectRuntimeInstanceById(instanceId, deps) {
        const sect = this.findSectByInstanceId(instanceId);
        return sect ? this.ensureSectRuntimeInstance(sect, deps) : null;
    }

    ensureSectRuntimeInstanceByTemplateId(templateId, deps) {
        const normalized = normalizeOptionalString(templateId);
        if (!normalized || !normalized.startsWith(SECT_TEMPLATE_PREFIX)) {
            return null;
        }
        const parsed = parseSectTemplateDescriptor(normalized);
        const sect = this.findSectByTemplateId(normalized) || this.findSectById(parsed?.sectId);
        return sect ? this.ensureSectRuntimeInstance(sect, deps) : null;
    }

    ensureSectRuntimeInstance(sect, deps) {
        const existing = deps.getInstanceRuntime(sect.sectInstanceId);
        if (existing) {
            return existing;
        }
        this.registerSectTemplate(sect);
        return deps.createInstance({
            instanceId: sect.sectInstanceId,
            templateId: sect.sectTemplateId,
            kind: 'sect',
            persistent: true,
            linePreset: 'peaceful',
            lineIndex: 1,
            instanceOrigin: 'sect',
            defaultEntry: false,
            ownerSectId: sect.sectId,
            displayName: sect.name,
            routeDomain: `sect:${sect.sectId}`,
            shardKey: sect.sectInstanceId,
        });
    }

    registerSectTemplate(sect) {
        if (this.templateRepository.has(sect.sectTemplateId)) {
            return this.templateRepository.getOrThrow(sect.sectTemplateId);
        }
        return this.templateRepository.registerRuntimeMapTemplate(buildSectMapDocument(sect));
    }

    attachSectPortals(sect, entranceInstance, sectInstance) {
        entranceInstance.addRuntimePortal?.({
            x: sect.entranceX,
            y: sect.entranceY,
            kind: 'sect_entrance',
            trigger: 'manual',
            targetMapId: sect.sectTemplateId,
            targetInstanceId: sect.sectInstanceId,
            targetX: sect.coreX,
            targetY: sect.coreY,
            name: `${sect.name}山门`,
            char: normalizeOptionalString(sect.mark) || SECT_ENTRANCE_CHAR,
            color: '#c8a15a',
            sectId: sect.sectId,
        });
        sectInstance.addRuntimePortal?.({
            x: sect.coreX,
            y: sect.coreY,
            kind: 'sect_core',
            trigger: 'manual',
            targetMapId: sect.entranceTemplateId,
            targetInstanceId: sect.entranceInstanceId,
            targetX: sect.entranceX,
            targetY: sect.entranceY,
            name: `${sect.name}宗门核心`,
            char: SECT_CORE_CHAR,
            color: '#d8c37a',
            sectId: sect.sectId,
        });
    }

    ensureGuardianFormation(sect, deps) {
        if (typeof deps.worldRuntimeFormationService?.upsertSectGuardianFormation !== 'function') {
            return null;
        }
        ensureSectState(sect, this.playerRuntimeService);
        return deps.worldRuntimeFormationService.upsertSectGuardianFormation({
            formationId: 'sect_guardian_barrier',
            id: `formation:sect_guardian:${sect.sectId}`,
            ownerSectId: sect.sectId,
            ownerPlayerId: sect.leaderPlayerId,
            instanceId: sect.entranceInstanceId,
            x: sect.entranceX,
            y: sect.entranceY,
            eyeInstanceId: sect.sectInstanceId,
            eyeX: sect.coreX,
            eyeY: sect.coreY,
            radius: 1,
            spiritStoneCount: Math.ceil(SECT_GUARDIAN_INITIAL_AURA / shared_1.FORMATION_AURA_PER_SPIRIT_STONE),
            remainingAuraBudget: SECT_GUARDIAN_INITIAL_AURA,
            active: true,
        }, deps);
    }

    buildSectCoreActions(view, deps = null) {
        const sect = this.findSectByInstanceId(view?.instance?.instanceId);
        if (!sect || sect.status === 'dissolved' || chebyshevDistance(view.self.x, view.self.y, sect.coreX, sect.coreY) > 1) {
            return [];
        }
        ensureSectState(sect, this.playerRuntimeService);
        const player = this.playerRuntimeService.getPlayer(view.playerId);
        const sameSect = normalizeOptionalString(player?.sectId) === sect.sectId && isSectMember(sect, view.playerId);
        if (!sameSect) {
            return [];
        }
        const guardian = resolveSectGuardianFormation(sect, deps);
        return [{
            id: 'sect:manage',
            name: '管理宗门',
            type: 'interact',
            desc: buildSectManagementActionDesc(sect, view, deps, guardian),
            cooldownLeft: 0,
        }];
    }

    executeSectAction(playerId, actionId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const sect = this.findSectById(player.sectId);
        if (!sect || sect.status === 'dissolved') {
            throw new common_1.BadRequestException('你尚未加入宗门');
        }
        ensureSectState(sect, this.playerRuntimeService);
        if (!isSectMember(sect, playerId)) {
            throw new common_1.ForbiddenException('你不在该宗门成员名册中');
        }
        if (actionId === 'sect:manage') {
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        const guardianId = `formation:sect_guardian:${sect.sectId}`;
        if (actionId === 'sect:guardian:toggle') {
            assertSectPermission(sect, playerId, 'guardian');
            const formation = deps.worldRuntimeFormationService.findFormationInInstance(sect.entranceInstanceId, guardianId);
            deps.worldRuntimeFormationService.dispatchSetPersistentFormationActive(playerId, {
                instanceId: sect.entranceInstanceId,
                formationInstanceId: guardianId,
                active: !(formation?.active !== false),
            }, deps);
            deps.queuePlayerNotice(playerId, '护宗大阵状态已切换。', 'success');
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:guardian:inject:')) {
            assertSectPermission(sect, playerId, 'guardian');
            const [, , , stoneText = '0'] = actionId.split(':');
            const formation = deps.worldRuntimeFormationService.findFormationInInstance(sect.entranceInstanceId, guardianId)
                ?? this.ensureGuardianFormation(sect, deps);
            deps.worldRuntimeFormationService.dispatchInjectPersistentFormationEnergy(playerId, {
                instanceId: sect.entranceInstanceId,
                formationInstanceId: formation?.id ?? guardianId,
                spiritStoneCount: normalizeNonNegativeInteger(stoneText),
            }, deps);
            deps.queuePlayerNotice(playerId, '护宗大阵灵力已注入。', 'success');
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'sect:guardian:refill') {
            assertSectPermission(sect, playerId, 'guardian');
            const formation = deps.worldRuntimeFormationService.findFormationInInstance(sect.entranceInstanceId, guardianId);
            if (!formation) {
                this.ensureGuardianFormation(sect, deps);
            } else {
                deps.worldRuntimeFormationService.dispatchInjectPersistentFormationEnergy(playerId, {
                    instanceId: sect.entranceInstanceId,
                    formationInstanceId: guardianId,
                    spiritStoneCount: Math.ceil(SECT_GUARDIAN_INITIAL_AURA / shared_1.FORMATION_AURA_PER_SPIRIT_STONE),
                }, deps);
            }
            deps.queuePlayerNotice(playerId, '护宗大阵已补充灵力。', 'success');
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:member:remove:')) {
            assertSectPermission(sect, playerId, 'member_remove');
            const targetPlayerId = decodeActionPart(actionId.slice('sect:member:remove:'.length));
            this.removeSectMember(sect, targetPlayerId, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:member:role:')) {
            assertSectPermission(sect, playerId, 'member_role');
            const parts = actionId.split(':');
            const targetPlayerId = decodeActionPart(parts[3] ?? '');
            const roleId = normalizeSectRoleId(parts[4], { requireAssignable: true });
            this.changeSectMemberRole(sect, targetPlayerId, roleId, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:transfer:')) {
            assertSectLeader(sect, playerId);
            const targetPlayerId = decodeActionPart(actionId.slice('sect:transfer:'.length));
            this.transferSectLeadership(sect, targetPlayerId, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'sect:dissolve') {
            assertSectLeader(sect, playerId);
            this.dissolveSect(sect, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:permission:toggle:')) {
            assertSectLeader(sect, playerId);
            const parts = actionId.split(':');
            const roleId = normalizeSectRoleId(parts[3], { allowSupreme: true });
            const permissionId = normalizeSectPermissionId(parts[4]);
            this.toggleSectRolePermission(sect, roleId, permissionId, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        throw new common_1.BadRequestException(`Unsupported sect action: ${actionId}`);
    }

    removeSectMember(sect, targetPlayerId, operatorPlayerId, deps) {
        const targetId = normalizeOptionalString(targetPlayerId);
        if (!targetId || targetId === sect.leaderPlayerId) {
            throw new common_1.BadRequestException('不能移除宗主');
        }
        if (targetId === operatorPlayerId) {
            throw new common_1.BadRequestException('不能移除自己');
        }
        const before = sect.members.length;
        sect.members = sect.members.filter((entry) => entry.playerId !== targetId);
        if (sect.members.length === before) {
            throw new common_1.NotFoundException('该成员不在宗门名册中');
        }
        this.playerSectId.delete(targetId);
        this.clearPlayerSectIdIfLoaded(targetId, sect.sectId);
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        deps.queuePlayerNotice?.(operatorPlayerId, '已移除宗门成员。', 'success');
        deps.refreshQuestStates?.(targetId);
    }

    changeSectMemberRole(sect, targetPlayerId, roleId, operatorPlayerId, deps) {
        const targetId = normalizeOptionalString(targetPlayerId);
        const member = targetId ? sect.members.find((entry) => entry.playerId === targetId) : null;
        if (!member) {
            throw new common_1.NotFoundException('该成员不在宗门名册中');
        }
        if (targetId === sect.leaderPlayerId || member.roleId === 'leader') {
            throw new common_1.BadRequestException('宗主职位只能通过转让改变');
        }
        member.roleId = roleId;
        member.name = resolvePlayerDisplayName(this.playerRuntimeService.getPlayer?.(targetId), member.name || targetId);
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        deps.queuePlayerNotice?.(operatorPlayerId, `已将 ${member.name} 调整为 ${getSectRoleLabel(roleId)}。`, 'success');
    }

    transferSectLeadership(sect, targetPlayerId, operatorPlayerId, deps) {
        const targetId = normalizeOptionalString(targetPlayerId);
        if (!targetId || targetId === operatorPlayerId) {
            throw new common_1.BadRequestException('请选择其他成员接任宗主');
        }
        const target = sect.members.find((entry) => entry.playerId === targetId);
        if (!target) {
            throw new common_1.NotFoundException('接任者不在宗门名册中');
        }
        const previousLeader = sect.members.find((entry) => entry.playerId === operatorPlayerId);
        if (previousLeader) {
            previousLeader.roleId = 'deputy';
        }
        target.roleId = 'leader';
        target.name = resolvePlayerDisplayName(this.playerRuntimeService.getPlayer?.(targetId), target.name || targetId);
        sect.leaderPlayerId = targetId;
        sect.updatedAt = Date.now();
        this.ensureGuardianFormation(sect, deps);
        this.persistSectsSoon();
        deps.queuePlayerNotice?.(operatorPlayerId, `已将宗主之位转让给 ${target.name}。`, 'success');
        deps.queuePlayerNotice?.(targetId, `你已接任 ${sect.name} 宗主。`, 'success');
    }

    dissolveSect(sect, operatorPlayerId, deps) {
        const memberIds = sect.members.map((entry) => entry.playerId);
        for (const memberId of memberIds) {
            this.playerSectId.delete(memberId);
            this.clearPlayerSectIdIfLoaded(memberId, sect.sectId);
            deps.refreshQuestStates?.(memberId);
        }
        const entranceInstance = deps.getInstanceRuntime?.(sect.entranceInstanceId);
        const sectInstance = deps.getInstanceRuntime?.(sect.sectInstanceId);
        removeSectRuntimePortals(entranceInstance, sect.sectId);
        removeSectRuntimePortals(sectInstance, sect.sectId);
        const guardianId = `formation:sect_guardian:${sect.sectId}`;
        try {
            deps.worldRuntimeFormationService?.dispatchSetPersistentFormationActive?.(operatorPlayerId, {
                instanceId: sect.entranceInstanceId,
                formationInstanceId: guardianId,
                active: false,
            }, deps);
        }
        catch (_error) {
            // 解散宗门时大阵已缺失不阻断宗门真源删除。
        }
        this.sectsById.delete(sect.sectId);
        this.persistSectsSoon();
        deps.queuePlayerNotice?.(operatorPlayerId, `${sect.name}已解散。`, 'warning');
    }

    toggleSectRolePermission(sect, roleId, permissionId, playerId, deps) {
        if (roleId === 'leader') {
            throw new common_1.BadRequestException('宗主权限固定拥有全部管理权');
        }
        const rolePermissions = normalizeSectRolePermissions(sect.rolePermissions);
        const nextRolePermissions = rolePermissions[roleId] ?? {};
        nextRolePermissions[permissionId] = !nextRolePermissions[permissionId];
        rolePermissions[roleId] = nextRolePermissions;
        sect.rolePermissions = rolePermissions;
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        deps.queuePlayerNotice?.(playerId, `${getSectRoleLabel(roleId)}权限已更新。`, 'success');
    }

    clearPlayerSectIdIfLoaded(playerId, sectId) {
        const loaded = this.playerRuntimeService.getPlayer?.(playerId);
        if (!loaded || normalizeOptionalString(loaded.sectId) !== sectId) {
            return;
        }
        if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(playerId, null);
        } else {
            loaded.sectId = null;
        }
    }

    expandSectBounds(sect, dirs, deps) {
        if (!sect || !dirs || typeof dirs !== 'object') {
            return false;
        }
        const previousCoreX = sect.coreX;
        const previousCoreY = sect.coreY;
        const previousBounds = normalizeSectBounds(sect);
        const nextBounds = {
            minX: previousBounds.minX - Math.max(0, Math.trunc(Number(dirs.left) || 0)),
            maxX: previousBounds.maxX + Math.max(0, Math.trunc(Number(dirs.right) || 0)),
            minY: previousBounds.minY - Math.max(0, Math.trunc(Number(dirs.up) || 0)),
            maxY: previousBounds.maxY + Math.max(0, Math.trunc(Number(dirs.down) || 0)),
        };
        if (nextBounds.minX === previousBounds.minX
            && nextBounds.maxX === previousBounds.maxX
            && nextBounds.minY === previousBounds.minY
            && nextBounds.maxY === previousBounds.maxY) {
            return false;
        }
        sect.mapMinX = nextBounds.minX;
        sect.mapMaxX = nextBounds.maxX;
        sect.mapMinY = nextBounds.minY;
        sect.mapMaxY = nextBounds.maxY;
        sect.coreX = -nextBounds.minX;
        sect.coreY = -nextBounds.minY;
        sect.expansionRadius = Math.max(
            Math.abs(nextBounds.minX),
            Math.abs(nextBounds.maxX),
            Math.abs(nextBounds.minY),
            Math.abs(nextBounds.maxY),
        );
        sect.sectTemplateId = buildSectTemplateId(sect.sectId, nextBounds);
        sect.updatedAt = Date.now();
        const template = this.registerSectTemplate(sect);
        const sectInstance = deps.getInstanceRuntime(sect.sectInstanceId);
        if (sectInstance && typeof sectInstance.replaceTemplateForSectExpansion === 'function') {
            sectInstance.replaceTemplateForSectExpansion(template);
            const entranceInstance = deps.getInstanceRuntime(sect.entranceInstanceId);
            if (entranceInstance) {
                this.attachSectPortals(sect, entranceInstance, sectInstance);
            }
            const dx = sect.coreX - previousCoreX;
            const dy = sect.coreY - previousCoreY;
            if (dx !== 0 || dy !== 0) {
                deps.queuePlayerNotice?.(sect.leaderPlayerId, `宗门核心坐标随地脉边界偏移至 (${sect.coreX}, ${sect.coreY})。`, 'info');
            }
        }
        this.persistSectsSoon();
        return true;
    }

    expandSectForDestroyedTile(instanceId, x, y, deps) {
        const sect = this.findSectByInstanceId(instanceId);
        if (!sect) {
            return false;
        }
        const instance = deps.getInstanceRuntime?.(sect.sectInstanceId);
        if (!instance || instance.meta?.instanceId !== instanceId) {
            return false;
        }
        const tx = Math.trunc(Number(x));
        const ty = Math.trunc(Number(y));
        if (!Number.isFinite(tx) || !Number.isFinite(ty) || typeof instance.activateRuntimeTile !== 'function') {
            return false;
        }
        const tileState = typeof instance.getTileCombatState === 'function'
            ? instance.getTileCombatState(tx, ty)
            : null;
        if (tileState?.destroyed !== true || tileState?.tileType !== shared_1.TileType.Stone) {
            return false;
        }
        if (!isRuntimeBoundaryTile(instance, tx, ty)) {
            return false;
        }
        const shape = (0, runtime_tile_expansion_1.createSquareExpansionShape)(SECT_SPARSE_EXPAND_RADIUS);
        const result = (0, runtime_tile_expansion_1.expandRuntimeTiles)(instance, tx, ty, shape, SECT_TILE_GENERATOR, { sect });
        const created = result.created;
        if (created > 0) {
            deps.queuePlayerNotice?.(sect.leaderPlayerId, `${sect.name}边界被凿开，地脉显化了 ${created} 处新地块。`, 'info');
        }
        return created > 0;
    }

    expandSect(sect, deps) {
        const previousCoreX = sect.coreX;
        const previousCoreY = sect.coreY;
        const expanded = this.expandSectBounds(sect, {
            left: SECT_EXPAND_CHUNK,
            right: SECT_EXPAND_CHUNK,
            up: SECT_EXPAND_CHUNK,
            down: SECT_EXPAND_CHUNK,
        }, deps);
        if (expanded && (sect.coreX !== previousCoreX || sect.coreY !== previousCoreY)) {
            deps.queuePlayerNotice?.(sect.leaderPlayerId, `宗门地脉已向四方显化，核心坐标为 (${sect.coreX}, ${sect.coreY})。`, 'info');
        }
        return expanded;
    }

    isSectInnateStabilized(instanceId, x, y) {
        const sect = this.findSectByInstanceId(instanceId);
        if (!sect) {
            return false;
        }
        return Math.abs(Math.trunc(Number(x)) - sect.coreX) <= SECT_INNATE_STABILIZER_RADIUS
            && Math.abs(Math.trunc(Number(y)) - sect.coreY) <= SECT_INNATE_STABILIZER_RADIUS;
    }

    findSectById(sectId) {
        const normalized = normalizeOptionalString(sectId);
        return normalized ? this.sectsById.get(normalized) ?? null : null;
    }

    findSectByInstanceId(instanceId) {
        const normalized = normalizeOptionalString(instanceId);
        if (!normalized) {
            return null;
        }
        for (const sect of this.sectsById.values()) {
            if (sect.sectInstanceId === normalized) {
                return sect;
            }
        }
        return null;
    }

    findSectByTemplateId(templateId) {
        const normalized = normalizeOptionalString(templateId);
        if (!normalized) {
            return null;
        }
        for (const sect of this.sectsById.values()) {
            if (sect.sectTemplateId === normalized) {
                return sect;
            }
        }
        return null;
    }

    async restoreSectTemplates(deps) {
        const document = await this.loadSectDocument();
        const entries = Array.isArray(document?.sects) ? document.sects : [];
        for (const entry of entries) {
            const sect = normalizeSectEntry(entry);
            if (!sect) {
                continue;
            }
            ensureSectState(sect, this.playerRuntimeService);
            this.sectsById.set(sect.sectId, sect);
            for (const member of sect.members) {
                this.playerSectId.set(member.playerId, sect.sectId);
            }
            this.registerSectTemplate(sect);
        }
        this.restored = true;
        return this.sectsById.size;
    }

    restoreCatalogSectTemplate(entry) {
        const templateId = normalizeOptionalString(entry?.template_id);
        if (!templateId || !templateId.startsWith(SECT_TEMPLATE_PREFIX)) {
            return false;
        }
        if (this.templateRepository.has(templateId)) {
            return true;
        }
        const parsed = parseSectTemplateDescriptor(templateId);
        if (!parsed) {
            return false;
        }
        const existing = this.findSectById(parsed.sectId);
        const sect = existing ?? {
            sectId: parsed.sectId,
            name: `${parsed.sectId}宗`,
            mark: SECT_CORE_CHAR,
            founderPlayerId: '',
            leaderPlayerId: '',
            status: 'active',
            entranceInstanceId: '',
            entranceTemplateId: 'yunlai_town',
            entranceX: 0,
            entranceY: 0,
            sectInstanceId: normalizeOptionalString(entry?.instance_id) || buildSectInstanceId(parsed.sectId),
            sectTemplateId: templateId,
            coreX: -parsed.bounds.minX,
            coreY: -parsed.bounds.minY,
            expansionRadius: Math.max(Math.abs(parsed.bounds.minX), Math.abs(parsed.bounds.maxX), Math.abs(parsed.bounds.minY), Math.abs(parsed.bounds.maxY)),
            mapMinX: parsed.bounds.minX,
            mapMaxX: parsed.bounds.maxX,
            mapMinY: parsed.bounds.minY,
            mapMaxY: parsed.bounds.maxY,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.templateRepository.registerRuntimeMapTemplate(buildSectMapDocument({
            ...sect,
            sectTemplateId: templateId,
            mapMinX: parsed.bounds.minX,
            mapMaxX: parsed.bounds.maxX,
            mapMinY: parsed.bounds.minY,
            mapMaxY: parsed.bounds.maxY,
            coreX: -parsed.bounds.minX,
            coreY: -parsed.bounds.minY,
        }));
        return true;
    }

    async restoreSects(deps) {
        if (!this.restored) {
            await this.restoreSectTemplates(deps);
        }
        for (const sect of this.sectsById.values()) {
            this.registerSectTemplate(sect);
            const entranceInstance = deps.getInstanceRuntime(sect.entranceInstanceId);
            const sectInstance = this.ensureSectRuntimeInstance(sect, deps);
            if (entranceInstance && sectInstance) {
                this.attachSectPortals(sect, entranceInstance, sectInstance);
                this.ensureGuardianFormation(sect, deps);
            }
        }
        return this.sectsById.size;
    }

    persistSectsSoon() {
        void this.saveSectDocument().catch((error) => {
            this.logger.warn(`宗门持久化失败：${error instanceof Error ? error.message : String(error)}`);
        });
    }

    async saveSectDocument() {
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return;
        }
        const sects = Array.from(this.sectsById.values(), (sect) => ({ ...sect }))
            .sort((left, right) => left.sectId.localeCompare(right.sectId, 'zh-Hans-CN'));
        await pool.query(`
            INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
            VALUES ($1, $2, $3::jsonb, now())
            ON CONFLICT (scope, key)
            DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [SECT_PERSISTENCE_SCOPE, SECT_PERSISTENCE_KEY, JSON.stringify({ sects })]);
    }

    async loadSectDocument() {
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return null;
        }
        const result = await pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [SECT_PERSISTENCE_SCOPE, SECT_PERSISTENCE_KEY]);
        return result.rows?.[0]?.payload ?? null;
    }

    async ensurePersistencePool() {
        if (this.persistenceReady && this.persistencePool) {
            return this.persistencePool;
        }
        if (this.persistenceInitPromise) {
            await this.persistenceInitPromise;
            return this.persistenceReady ? this.persistencePool : null;
        }
        this.persistenceInitPromise = this.initializePersistencePool();
        await this.persistenceInitPromise;
        this.persistenceInitPromise = null;
        return this.persistenceReady ? this.persistencePool : null;
    }

    async initializePersistencePool() {
        const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
        if (!databaseUrl.trim()) {
            return;
        }
        const pool = new pg_1.Pool({ connectionString: databaseUrl });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(pool);
            this.persistencePool = pool;
            this.persistenceReady = true;
        } catch (error) {
            await pool.end().catch(() => undefined);
            this.logger.warn(`宗门持久化初始化失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async closePersistencePool() {
        const pool = this.persistencePool;
        this.persistencePool = null;
        this.persistenceReady = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
}
exports.WorldRuntimeSectService = WorldRuntimeSectService;
export { WorldRuntimeSectService };

function buildSectId(playerId) {
    const normalized = normalizeOptionalString(playerId)?.replace(/[^a-zA-Z0-9:_-]+/g, '_') || 'player';
    return `sect:${normalized}:${Date.now().toString(36)}`;
}

function buildSectInstanceId(sectId) {
    return `${SECT_INSTANCE_PREFIX}${sectId}:main`;
}

function buildSectTemplateId(sectId, boundsInput) {
    const bounds = normalizeBoundsObject(boundsInput) ?? buildInitialSectBounds();
    return `${SECT_TEMPLATE_PREFIX}${sectId}:x${bounds.minX}_${bounds.maxX}:y${bounds.minY}_${bounds.maxY}`;
}

function buildDefaultSectName(player) {
    const raw = normalizeOptionalString(player?.displayName) || normalizeOptionalString(player?.name) || '无名';
    return `${raw}宗`;
}

function normalizeSectName(input, player) {
    const fallback = buildDefaultSectName(player);
    const raw = normalizeOptionalString(input) || fallback;
    const sanitized = raw.replace(/\s+/g, '').trim();
    if (!sanitized) {
        return fallback;
    }
    const count = typeof shared_1.getGraphemeCount === 'function' ? (0, shared_1.getGraphemeCount)(sanitized) : Array.from(sanitized).length;
    if (count < 2 || count > 12) {
        throw new common_1.BadRequestException('宗门名称需为 2 到 12 个字');
    }
    if (/[<>`"'\\]/.test(sanitized)) {
        throw new common_1.BadRequestException('宗门名称包含不可用字符');
    }
    return sanitized;
}

function normalizeSectMark(input, fallbackText) {
    const hasExplicitInput = normalizeOptionalString(input) !== null;
    const raw = normalizeOptionalString(input) || normalizeOptionalString(fallbackText) || SECT_CORE_CHAR;
    const normalized = raw.replace(/\s+/g, '').trim();
    const first = typeof shared_1.getFirstGrapheme === 'function' ? (0, shared_1.getFirstGrapheme)(normalized) : (Array.from(normalized)[0] ?? '');
    if (!first || /[\s<>`"'\\]/.test(first)) {
        throw new common_1.BadRequestException('宗门印记需为一个可见字符');
    }
    const count = typeof shared_1.getGraphemeCount === 'function' ? (0, shared_1.getGraphemeCount)(normalized) : Array.from(normalized).length;
    if (hasExplicitInput && count !== 1) {
        throw new common_1.BadRequestException('宗门印记只能是一个字');
    }
    return first;
}

function normalizeNonNegativeInteger(input) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value < 0) {
        throw new common_1.BadRequestException('注入数量不能为负');
    }
    return value;
}

function resolveSectGuardianFormation(sect, deps) {
    const guardianId = `formation:sect_guardian:${sect.sectId}`;
    return typeof deps?.worldRuntimeFormationService?.findFormationInInstance === 'function'
        ? deps.worldRuntimeFormationService.findFormationInInstance(sect.entranceInstanceId, guardianId)
        : null;
}

function formatSectGuardianStatusLabel(formation) {
    if (!formation) {
        return '未建立';
    }
    if (formation.active === false || Number(formation.remainingAuraBudget) <= 0) {
        return '停摆';
    }
    return '开启';
}

function formatSectGuardianAuraLabel(formation) {
    const value = Math.max(0, Math.floor(Number(formation?.remainingAuraBudget) || 0));
    return formatInteger(value);
}

function formatInteger(value) {
    const normalized = Math.max(0, Math.floor(Number(value) || 0));
    return normalized.toLocaleString('zh-CN');
}

function buildSectManagementActionDesc(sect, view, deps, guardian) {
    const base = `${sect.name} · 印记 ${normalizeOptionalString(sect.mark) || '无'} · 地域 ${formatSectTileCountLabel(sect, view, deps)} · 大阵 ${formatSectGuardianStatusLabel(guardian)} · 灵力 ${formatSectGuardianAuraLabel(guardian)}。`;
    const data = buildSectManagementData(sect, view?.playerId);
    return `${base}\n${SECT_MANAGEMENT_DATA_MARKER}${encodeURIComponent(JSON.stringify(data))}${SECT_MANAGEMENT_DATA_MARKER_END}`;
}

function buildSectManagementData(sect, playerId) {
    ensureSectState(sect);
    const selfPlayerId = normalizeOptionalString(playerId) || '';
    const canEditPermissions = sect.leaderPlayerId === selfPlayerId;
    return {
        v: 1,
        selfPlayerId,
        canEditPermissions,
        canTransfer: canEditPermissions,
        canDissolve: canEditPermissions,
        canManageGuardian: hasSectPermission(sect, selfPlayerId, 'guardian'),
        canRemoveMembers: hasSectPermission(sect, selfPlayerId, 'member_remove'),
        canChangeRoles: hasSectPermission(sect, selfPlayerId, 'member_role'),
        roles: SECT_ROLES,
        permissions: SECT_PERMISSIONS,
        rolePermissions: normalizeSectRolePermissions(sect.rolePermissions),
        members: sect.members.map((member) => ({
            playerId: member.playerId,
            name: member.name,
            roleId: member.roleId,
            roleLabel: getSectRoleLabel(member.roleId),
            self: member.playerId === selfPlayerId,
            leader: member.playerId === sect.leaderPlayerId,
        })),
    };
}

function ensureSectState(sect, playerRuntimeService = null) {
    if (!sect) {
        return sect;
    }
    sect.rolePermissions = normalizeSectRolePermissions(sect.rolePermissions);
    sect.members = normalizeSectMembers(sect.members, {
        sectId: sect.sectId,
        leaderPlayerId: sect.leaderPlayerId,
        leaderName: sect.leaderPlayerId,
        createdAt: sect.createdAt,
    });
    const leader = sect.members.find((entry) => entry.playerId === sect.leaderPlayerId);
    if (leader) {
        leader.roleId = 'leader';
        const runtimeLeader = playerRuntimeService?.getPlayer?.(leader.playerId);
        leader.name = resolvePlayerDisplayName(runtimeLeader, leader.name || leader.playerId);
    }
    for (const member of sect.members) {
        if (member.playerId !== sect.leaderPlayerId && member.roleId === 'leader') {
            member.roleId = 'deputy';
        }
        const runtimePlayer = playerRuntimeService?.getPlayer?.(member.playerId);
        if (runtimePlayer) {
            member.name = resolvePlayerDisplayName(runtimePlayer, member.name);
        }
    }
    return sect;
}

function normalizeSectMembers(input, fallback) {
    const now = Number.isFinite(Number(fallback?.createdAt)) ? Number(fallback.createdAt) : Date.now();
    const members = [];
    const seen = new Set();
    const entries = Array.isArray(input) ? input : [];
    for (const entry of entries) {
        const playerId = normalizeOptionalString(entry?.playerId);
        if (!playerId || seen.has(playerId)) {
            continue;
        }
        seen.add(playerId);
        members.push({
            playerId,
            name: normalizeOptionalString(entry?.name) || playerId,
            roleId: normalizeSectRoleId(entry?.roleId ?? entry?.role, { allowSupreme: true, fallback: 'outer' }),
            joinedAt: Number.isFinite(Number(entry?.joinedAt)) ? Number(entry.joinedAt) : now,
        });
    }
    const leaderPlayerId = normalizeOptionalString(fallback?.leaderPlayerId);
    if (leaderPlayerId && !seen.has(leaderPlayerId)) {
        members.unshift({
            playerId: leaderPlayerId,
            name: normalizeOptionalString(fallback?.leaderName) || leaderPlayerId,
            roleId: 'leader',
            joinedAt: now,
        });
    }
    for (const member of members) {
        if (member.playerId === leaderPlayerId) {
            member.roleId = 'leader';
        }
    }
    return members.sort((left, right) => roleSortWeight(left.roleId) - roleSortWeight(right.roleId) || left.joinedAt - right.joinedAt || left.playerId.localeCompare(right.playerId));
}

function buildSectMemberEntry(player, roleId, joinedAt = Date.now()) {
    return {
        playerId: normalizeOptionalString(player?.playerId) || '',
        name: resolvePlayerDisplayName(player, normalizeOptionalString(player?.playerId) || '未知成员'),
        roleId: normalizeSectRoleId(roleId, { allowSupreme: true, fallback: 'outer' }),
        joinedAt,
    };
}

function resolvePlayerDisplayName(player, fallback = '') {
    return normalizeOptionalString(player?.displayName)
        || normalizeOptionalString(player?.name)
        || normalizeOptionalString(player?.playerId)
        || normalizeOptionalString(fallback)
        || '未知成员';
}

function normalizeSectRolePermissions(input) {
    const next = buildDefaultSectRolePermissions();
    if (!input || typeof input !== 'object') {
        return next;
    }
    for (const role of SECT_ROLES) {
        const source = input[role.id];
        if (!source || typeof source !== 'object') {
            continue;
        }
        for (const permission of SECT_PERMISSIONS) {
            next[role.id][permission.id] = source[permission.id] === true;
        }
    }
    next.leader = { ...DEFAULT_SECT_ROLE_PERMISSIONS.leader };
    return next;
}

function buildDefaultSectRolePermissions() {
    return Object.fromEntries(SECT_ROLES.map((role) => [role.id, { ...(DEFAULT_SECT_ROLE_PERMISSIONS[role.id] ?? {}) }]));
}

function normalizeSectRoleId(input, options = {}) {
    const fallback = options.fallback || 'outer';
    const normalized = normalizeOptionalString(input) || fallback;
    if (!SECT_ROLE_IDS.has(normalized)) {
        if (options.fallback) {
            return fallback;
        }
        throw new common_1.BadRequestException('未知宗门职位');
    }
    if (options.requireAssignable === true && !SECT_ASSIGNABLE_ROLE_IDS.has(normalized)) {
        throw new common_1.BadRequestException(normalized === 'supreme_elder' ? '太上长老暂时无法任命' : '该职位不能直接任命');
    }
    if (normalized === 'supreme_elder' && options.allowSupreme !== true && options.requireAssignable !== true) {
        return options.fallback || 'outer';
    }
    return normalized;
}

function normalizeSectPermissionId(input) {
    const normalized = normalizeOptionalString(input);
    if (!normalized || !SECT_PERMISSION_IDS.has(normalized)) {
        throw new common_1.BadRequestException('未知宗门权限');
    }
    return normalized;
}

function getSectRoleLabel(roleId) {
    return SECT_ROLES.find((entry) => entry.id === roleId)?.label ?? '外门弟子';
}

function roleSortWeight(roleId) {
    const index = SECT_ROLES.findIndex((entry) => entry.id === roleId);
    return index >= 0 ? index : 999;
}

function isSectMember(sect, playerId) {
    const normalized = normalizeOptionalString(playerId);
    return Boolean(normalized && Array.isArray(sect?.members) && sect.members.some((entry) => entry.playerId === normalized));
}

function hasSectPermission(sect, playerId, permissionId) {
    const normalized = normalizeOptionalString(playerId);
    if (!normalized || !sect) {
        return false;
    }
    if (sect.leaderPlayerId === normalized) {
        return true;
    }
    const member = Array.isArray(sect.members) ? sect.members.find((entry) => entry.playerId === normalized) : null;
    if (!member) {
        return false;
    }
    const rolePermissions = normalizeSectRolePermissions(sect.rolePermissions);
    return rolePermissions[member.roleId]?.[permissionId] === true;
}

function assertSectLeader(sect, playerId) {
    if (sect.leaderPlayerId !== playerId) {
        throw new common_1.ForbiddenException('只有宗主可以执行该操作');
    }
}

function assertSectPermission(sect, playerId, permissionId) {
    if (!hasSectPermission(sect, playerId, permissionId)) {
        throw new common_1.ForbiddenException('当前职位没有该宗门权限');
    }
}

function decodeActionPart(value) {
    try {
        return decodeURIComponent(String(value ?? ''));
    }
    catch (_error) {
        return String(value ?? '');
    }
}

function removeSectRuntimePortals(instance, sectId) {
    if (!instance || !Array.isArray(instance.runtimePortals)) {
        return false;
    }
    const before = instance.runtimePortals.length;
    instance.runtimePortals = instance.runtimePortals.filter((portal) => portal?.sectId !== sectId);
    if (instance.runtimePortals.length === before) {
        return false;
    }
    instance.worldRevision += 1;
    instance.persistentRevision += 1;
    instance.markPersistenceDirtyDomains?.(['overlay']);
    return true;
}

function buildSectMapDocument(sect) {
    const bounds = normalizeSectBounds(sect);
    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const centerX = -bounds.minX;
    const centerY = -bounds.minY;
    const tiles = [];
    for (let y = 0; y < height; y += 1) {
        let row = '';
        for (let x = 0; x < width; x += 1) {
            const logicalX = bounds.minX + x;
            const logicalY = bounds.minY + y;
            if (x === centerX && y === centerY) {
                row += 'P';
            } else if (Math.abs(logicalX) <= SECT_BASE_CLEAR_RADIUS && Math.abs(logicalY) <= SECT_BASE_CLEAR_RADIUS) {
                row += '.';
            } else {
                row += 'o';
            }
        }
        tiles.push(row);
    }
    return {
        id: normalizeOptionalString(sect.sectTemplateId) || buildSectTemplateId(sect.sectId, bounds),
        name: sect.name,
        width,
        height,
        routeDomain: `sect:${sect.sectId}`,
        terrainProfileId: 'sect_stone_domain',
        terrainRealmLv: 1,
        sectMap: true,
        sectId: sect.sectId,
        sectMark: normalizeOptionalString(sect.mark) || SECT_CORE_CHAR,
        sectCoreX: centerX,
        sectCoreY: centerY,
        sectMapMinX: bounds.minX,
        sectMapMaxX: bounds.maxX,
        sectMapMinY: bounds.minY,
        sectMapMaxY: bounds.maxY,
        tiles,
        spawnPoint: { x: centerX, y: centerY },
        portals: [],
        npcs: [],
        monsters: [],
        safeZones: [],
        landmarks: [],
        containers: [],
        auras: [],
    };
}

function normalizeSectEntry(entry) {
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
    const templateId = normalizeOptionalString(entry.sectTemplateId) || buildSectTemplateId(sectId, bounds);
        return {
            sectId,
            name: normalizeOptionalString(entry.name) || `${sectId}宗`,
            mark: normalizeSectMark(entry.mark, normalizeOptionalString(entry.name) || sectId),
            founderPlayerId: normalizeOptionalString(entry.founderPlayerId) || leaderPlayerId,
        leaderPlayerId,
        status: entry.status === 'dissolved' ? 'dissolved' : 'active',
        entranceInstanceId,
        entranceTemplateId: normalizeOptionalString(entry.entranceTemplateId) || 'yunlai_town',
        entranceX: Math.trunc(Number(entry.entranceX) || 0),
        entranceY: Math.trunc(Number(entry.entranceY) || 0),
        sectInstanceId,
        sectTemplateId: templateId,
        coreX: Math.trunc(Number(entry.coreX) || -bounds.minX),
        coreY: Math.trunc(Number(entry.coreY) || -bounds.minY),
        expansionRadius: Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)),
        mapMinX: bounds.minX,
        mapMaxX: bounds.maxX,
        mapMinY: bounds.minY,
        mapMaxY: bounds.maxY,
        members: normalizeSectMembers(entry.members, {
            sectId,
            leaderPlayerId,
            leaderName: normalizeOptionalString(entry.leaderName) || leaderPlayerId,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        }),
        rolePermissions: normalizeSectRolePermissions(entry.rolePermissions),
        createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
    };
}

function buildInitialSectBounds() {
    const radius = SECT_BASE_CLEAR_RADIUS + SECT_INITIAL_STONE_MARGIN;
    return { minX: -radius, maxX: radius, minY: -radius, maxY: radius };
}

function normalizeSectBounds(sect) {
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

function normalizeBoundsObject(input) {
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

function parseSectTemplateDescriptor(templateId) {
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
    return null;
}

function formatSectTileCountLabel(sect, view, deps) {
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

function getRuntimeTileCount(instance) {
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

function assertCanCreateSectAtInstance(instance, descriptor) {
    const meta = instance?.meta ?? {};
    const kind = normalizeOptionalString(meta.kind ?? instance?.kind);
    const linePreset = normalizeOptionalString(meta.linePreset ?? instance?.linePreset ?? descriptor?.linePreset);
    if (kind === 'public' && linePreset === 'real') {
        return;
    }
    throw new common_1.BadRequestException('只能在大地图现世线建立宗门。');
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
}

function chebyshevDistance(ax, ay, bx, by) {
    return Math.max(Math.abs(Math.trunc(Number(ax)) - Math.trunc(Number(bx))), Math.abs(Math.trunc(Number(ay)) - Math.trunc(Number(by))));
}

function touchRuntimeInstanceRevision(deps, instanceId) {
    const instance = deps.getInstanceRuntime?.(instanceId);
    if (instance) {
        instance.worldRevision += 1;
    }
}

function isRuntimeBoundaryTile(instance, x, y) {
    if (!instance || typeof instance.isInBounds !== 'function') {
        return false;
    }
    const tx = Math.trunc(Number(x));
    const ty = Math.trunc(Number(y));
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || instance.isInBounds(tx, ty) !== true) {
        return false;
    }
    return instance.isInBounds(tx - 1, ty) !== true
        || instance.isInBounds(tx + 1, ty) !== true
        || instance.isInBounds(tx, ty - 1) !== true
        || instance.isInBounds(tx, ty + 1) !== true;
}

function resolveSectGeneratedTileType(sect, x, y) {
    const coreX = Math.trunc(Number(sect?.coreX) || 0);
    const coreY = Math.trunc(Number(sect?.coreY) || 0);
    const ring = Math.max(Math.abs(Math.trunc(Number(x)) - coreX), Math.abs(Math.trunc(Number(y)) - coreY));
    return ring <= SECT_BASE_CLEAR_RADIUS ? shared_1.TileType.Floor : shared_1.TileType.Stone;
}

const SECT_TILE_GENERATOR = {
    generate(x, y, context, out) {
        out.tileType = resolveSectGeneratedTileType(context?.sect, x, y);
    },
};

function updateSectRuntimeBoundsForTile(sect, x, y) {
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
