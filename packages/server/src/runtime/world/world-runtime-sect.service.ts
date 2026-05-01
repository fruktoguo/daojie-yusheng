// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeSectService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const pg_1 = require("pg");
const env_alias_1 = require("../../config/env-alias");
const runtime_tile_expansion_1 = require("../map/runtime-tile-expansion");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const SECT_TABLE = 'server_sect';
const SECT_TEMPLATE_PREFIX = 'sect_domain:';
const SECT_INSTANCE_PREFIX = 'sect:';
const SECT_BASE_CLEAR_RADIUS = 1;
const SECT_FOUNDING_CLEAR_RADIUS = 2;
const SECT_ENTRANCE_INTERACTION_RADIUS = 2;
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
    _mailRuntimeService;
    sectsById = new Map();
    playerSectId = new Map();
    restored = false;
    persistencePool = null;
    persistenceReady = false;
    persistenceInitPromise = null;

    constructor(contentTemplateRepository, templateRepository, playerRuntimeService, mailRuntimeService = null) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this._mailRuntimeService = mailRuntimeService;
    }

    dispatchCreateSect(playerId, slotIndex, item, deps, payload = null) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (normalizeOptionalString(player.sectId)) {
            throw new common_1.BadRequestException('你已经有所属宗门');
        }
        const sectId = buildSectId(playerId);
        const sectName = normalizeSectName(payload?.sectName, player);
        const sectMark = normalizeSectMark(payload?.sectMark, sectName);
        assertSectMarkAvailable(this.sectsById.values(), sectMark);
        const location = deps.getPlayerLocationOrThrow(playerId);
        const entranceInstance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const descriptor = parseRuntimeInstanceDescriptor(location.instanceId);
        assertCanCreateSectAtInstance(entranceInstance, descriptor);
        if (entranceInstance.meta.kind !== 'public' && descriptor?.instanceOrigin !== 'public') {
            throw new common_1.BadRequestException('当前地点无法开辟宗门入口');
        }
        assertSectFoundingAreaClear(Array.from(this.sectsById.values()), entranceInstance, location.instanceId, player.x, player.y);
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
        const sameSect = isSectMember(sect, view.playerId);
        if (!sameSect) {
            return [];
        }
        if (player && normalizeOptionalString(player.sectId) !== sect.sectId) {
            this.playerRuntimeService.setPlayerSectId?.(view.playerId, sect.sectId);
            this.playerSectId.set(view.playerId, sect.sectId);
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
        if (actionId.startsWith('sect:apply:')) {
            return this.applyJoinSect(playerId, actionId.slice('sect:apply:'.length), deps);
        }
        if (actionId.startsWith('sect:enter:')) {
            return this.enterSectFromEntrance(playerId, actionId.slice('sect:enter:'.length), deps);
        }
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
        if (actionId === 'sect:leave') {
            this.leaveSect(sect, playerId, deps);
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
        if (actionId.startsWith('sect:application:approve:')) {
            assertSectPermission(sect, playerId, 'member_role');
            const targetPlayerId = decodeActionPart(actionId.slice('sect:application:approve:'.length));
            this.approveSectApplication(sect, targetPlayerId, playerId, deps);
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId.startsWith('sect:application:reject:')) {
            assertSectPermission(sect, playerId, 'member_role');
            const targetPlayerId = decodeActionPart(actionId.slice('sect:application:reject:'.length));
            this.rejectSectApplication(sect, targetPlayerId, playerId, deps);
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
        throw new common_1.BadRequestException(`不支持的宗门动作：${actionId}`);
    }

    buildSectEntranceActions(view, deps = null) {
        const player = this.playerRuntimeService.getPlayer(view?.playerId);
        if (!player) {
            return [];
        }
        const playerSectId = normalizeOptionalString(player.sectId);
        const instanceId = normalizeOptionalString(view?.instance?.instanceId);
        if (!instanceId || !Array.isArray(view?.localPortals)) {
            return [];
        }
        const actions = [];
        const seen = new Set();
        for (const portal of view.localPortals) {
            const sectId = normalizeOptionalString(portal?.sectId);
            if (!sectId || portal?.kind !== 'sect_entrance' || seen.has(sectId)) {
                continue;
            }
            if (chebyshevDistance(view.self?.x, view.self?.y, portal.x, portal.y) > SECT_ENTRANCE_INTERACTION_RADIUS) {
                continue;
            }
            const sect = this.findSectById(sectId);
            if (!sect || sect.status === 'dissolved' || sect.entranceInstanceId !== instanceId) {
                continue;
            }
            ensureSectState(sect, this.playerRuntimeService);
            if (playerSectId === sect.sectId || isSectMember(sect, view.playerId)) {
                if (normalizeOptionalString(player.sectId) !== sect.sectId) {
                    this.playerRuntimeService.setPlayerSectId?.(view.playerId, sect.sectId);
                    this.playerSectId.set(view.playerId, sect.sectId);
                }
                actions.push({
                    id: `sect:enter:${encodeURIComponent(sect.sectId)}`,
                    name: `返回宗门：${sect.name}`,
                    type: 'travel',
                    desc: `从${sect.name}山门回到宗门核心。`,
                    cooldownLeft: 0,
                });
                seen.add(sectId);
                continue;
            }
            seen.add(sectId);
            actions.push({
                id: `sect:apply:${encodeURIComponent(sect.sectId)}`,
                name: `递拜帖：申请加入${sect.name}`,
                type: 'interact',
                desc: `你在${sect.name}护宗大阵前整理衣冠，向守阵执事递上拜帖。若愿受门规，便以外门弟子身份入山。`,
                cooldownLeft: 0,
            });
        }
        return actions;
    }

    enterSectFromEntrance(playerId, encodedSectId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const sectId = decodeActionPart(encodedSectId);
        const sect = this.findSectById(sectId);
        if (!sect || sect.status === 'dissolved') {
            throw new common_1.NotFoundException('山门气机已散，无法返回宗门');
        }
        ensureSectState(sect, this.playerRuntimeService);
        if (!isSectMember(sect, playerId)) {
            throw new common_1.ForbiddenException('你尚未列入该宗门名册');
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        if (location.instanceId !== sect.entranceInstanceId) {
            throw new common_1.BadRequestException('需要在该宗门山门前返回宗门');
        }
        if (chebyshevDistance(player.x, player.y, sect.entranceX, sect.entranceY) > SECT_ENTRANCE_INTERACTION_RADIUS) {
            throw new common_1.BadRequestException('需要靠近护宗大阵前的山门传送点');
        }
        if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(playerId, sect.sectId);
        } else {
            player.sectId = sect.sectId;
        }
        this.playerSectId.set(playerId, sect.sectId);
        deps.applyTransfer?.({
            playerId,
            sessionId: location.sessionId,
            fromInstanceId: sect.entranceInstanceId,
            targetMapId: sect.sectTemplateId,
            targetInstanceId: sect.sectInstanceId,
            targetX: sect.coreX,
            targetY: sect.coreY,
            reason: 'manual_portal',
        });
        deps.queuePlayerNotice?.(playerId, `你穿过${sect.name}山门，返回宗门核心。`, 'travel');
        return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
    }

    applyJoinSect(playerId, encodedSectId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const sectId = decodeActionPart(encodedSectId);
        const sect = this.findSectById(sectId);
        if (!sect || sect.status === 'dissolved') {
            throw new common_1.NotFoundException('山门气机已散，无法递交拜帖');
        }
        ensureSectState(sect, this.playerRuntimeService);
        if (isSectMember(sect, playerId)) {
            if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
                this.playerRuntimeService.setPlayerSectId(playerId, sect.sectId);
            } else {
                player.sectId = sect.sectId;
            }
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        if (location.instanceId !== sect.entranceInstanceId) {
            throw new common_1.BadRequestException('需要在该宗门山门前递交拜帖');
        }
        if (chebyshevDistance(player.x, player.y, sect.entranceX, sect.entranceY) > SECT_ENTRANCE_INTERACTION_RADIUS) {
            throw new common_1.BadRequestException('需要靠近护宗大阵前的山门传送点');
        }
        const application = upsertSectApplication(sect, player, Date.now());
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        this.deliverSectMail(playerId, {
            senderLabel: sect.name,
            fallbackTitle: `已向${sect.name}递交拜帖`,
            fallbackBody: `你的入宗申请已递交给${sect.name}宗主审批。审批通过后，你会收到入宗邮件并获得山门通行权限。`,
        }, deps);
        if (sect.leaderPlayerId !== playerId && this.playerRuntimeService.getPlayer?.(sect.leaderPlayerId)) {
            deps.queuePlayerNotice?.(sect.leaderPlayerId, `${application.name}递交了加入${sect.name}的拜帖，待审批。`, 'info');
        }
        this.deliverSectMail(sect.leaderPlayerId, {
            senderLabel: '宗门执事',
            fallbackTitle: `${application.name}申请加入${sect.name}`,
            fallbackBody: `${application.name}在山门前递交拜帖。请前往宗门核心的“管理宗门 -> 管理事务”审批。`,
        }, deps);
        deps.queuePlayerNotice?.(playerId, `拜帖已递交给${sect.name}宗主审批。`, 'success');
        deps.refreshPlayerContextActions?.(playerId);
        return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
    }

    approveSectApplication(sect, targetPlayerId, operatorPlayerId, deps) {
        const targetId = normalizeOptionalString(targetPlayerId);
        const application = targetId ? findPendingSectApplication(sect, targetId) : null;
        if (!application) {
            throw new common_1.NotFoundException('未找到待审批拜帖');
        }
        const applicant = this.playerRuntimeService.getPlayer?.(targetId) ?? null;
        if (applicant) {
            this.leaveCurrentSectBeforeJoin(targetId, sect.sectId, deps);
        }
        if (!isSectMember(sect, targetId)) {
            sect.members.push(buildSectMemberEntry(applicant ?? { playerId: targetId, name: application.name }, 'outer', Date.now()));
            sect.members = normalizeSectMembers(sect.members, {
                sectId: sect.sectId,
                leaderPlayerId: sect.leaderPlayerId,
                leaderName: sect.leaderPlayerId,
                createdAt: sect.createdAt,
            });
        }
        application.status = 'approved';
        application.reviewedAt = Date.now();
        application.reviewerPlayerId = operatorPlayerId;
        sect.updatedAt = Date.now();
        this.playerSectId.set(targetId, sect.sectId);
        if (applicant && typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(targetId, sect.sectId);
            deps.refreshQuestStates?.(targetId);
            deps.refreshPlayerContextActions?.(targetId);
            deps.queuePlayerNotice?.(targetId, `${sect.name}已准你入山，护宗大阵会放行同门。`, 'success');
        }
        this.persistSectsSoon();
        this.deliverSectMail(targetId, {
            senderLabel: sect.name,
            fallbackTitle: `${sect.name}已准你入山`,
            fallbackBody: `你的拜帖已通过审批，现列为${sect.name}外门弟子。前往山门附近即可返回宗门核心，护宗大阵会识别你的同门身份。`,
        }, deps);
        deps.queuePlayerNotice?.(operatorPlayerId, `已准 ${application.name} 入宗。`, 'success');
    }

    rejectSectApplication(sect, targetPlayerId, operatorPlayerId, deps) {
        const targetId = normalizeOptionalString(targetPlayerId);
        const application = targetId ? findPendingSectApplication(sect, targetId) : null;
        if (!application) {
            throw new common_1.NotFoundException('未找到待审批拜帖');
        }
        application.status = 'rejected';
        application.reviewedAt = Date.now();
        application.reviewerPlayerId = operatorPlayerId;
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        this.deliverSectMail(targetId, {
            senderLabel: sect.name,
            fallbackTitle: `${sect.name}退回了你的拜帖`,
            fallbackBody: `你的入宗申请未通过审批，可稍后重新递交拜帖。`,
        }, deps);
        deps.queuePlayerNotice?.(operatorPlayerId, `已退回 ${application.name} 的拜帖。`, 'success');
    }

    leaveSect(sect, playerId, deps) {
        if (sect.leaderPlayerId === playerId) {
            throw new common_1.BadRequestException('宗主不能直接离开宗门，请先转让宗主之位或解散宗门');
        }
        const before = sect.members.length;
        sect.members = sect.members.filter((entry) => entry.playerId !== playerId);
        if (sect.members.length === before) {
            throw new common_1.NotFoundException('你不在该宗门成员名册中');
        }
        const player = this.playerRuntimeService.getPlayer?.(playerId);
        if (typeof this.playerRuntimeService.setPlayerSectId === 'function') {
            this.playerRuntimeService.setPlayerSectId(playerId, null);
        } else if (player) {
            player.sectId = null;
        }
        this.playerSectId.delete(playerId);
        sect.updatedAt = Date.now();
        this.persistSectsSoon();
        deps.refreshQuestStates?.(playerId);
        deps.refreshPlayerContextActions?.(playerId);
        deps.queuePlayerNotice?.(playerId, `你已离开${sect.name}。`, 'success');
        if (sect.leaderPlayerId && this.playerRuntimeService.getPlayer?.(sect.leaderPlayerId)) {
            deps.queuePlayerNotice?.(sect.leaderPlayerId, `${resolvePlayerDisplayName(player, playerId)}已离开${sect.name}。`, 'info');
        }
    }

    deliverSectMail(playerId, input, deps = null) {
        if (!normalizeOptionalString(playerId) || typeof this._mailRuntimeService?.createDirectMail !== 'function') {
            return;
        }
        void this._mailRuntimeService.createDirectMail(playerId, {
            senderLabel: input.senderLabel,
            fallbackTitle: input.fallbackTitle,
            fallbackBody: input.fallbackBody,
            attachments: [],
        }).then(() => {
            const socket = deps?.worldSessionService?.getSocketByPlayerId?.(playerId);
            if (socket && typeof deps?.worldClientEventService?.emitMailSummaryForPlayer === 'function') {
                void deps.worldClientEventService.emitMailSummaryForPlayer(socket, playerId);
            }
        }).catch((error) => {
            this.logger.warn(`宗门邮件发送失败：${error instanceof Error ? error.message : String(error)}`);
        });
    }

    leaveCurrentSectBeforeJoin(playerId, targetSectId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentSectId = normalizeOptionalString(player?.sectId) || normalizeOptionalString(this.playerSectId.get(playerId));
        if (!currentSectId || currentSectId === targetSectId) {
            return null;
        }
        const currentSect = this.findSectById(currentSectId);
        if (!currentSect || currentSect.status === 'dissolved') {
            this.playerSectId.delete(playerId);
            return null;
        }
        ensureSectState(currentSect, this.playerRuntimeService);
        if (currentSect.leaderPlayerId === playerId || currentSect.members.some((entry) => entry.playerId === playerId && entry.roleId === 'leader')) {
            throw new common_1.BadRequestException('宗主不能直接改投其他宗门，请先转让宗主之位或解散原宗门');
        }
        const before = currentSect.members.length;
        currentSect.members = currentSect.members.filter((entry) => entry.playerId !== playerId);
        if (currentSect.members.length !== before) {
            currentSect.updatedAt = Date.now();
            if (this.playerRuntimeService.getPlayer?.(currentSect.leaderPlayerId)) {
                deps.queuePlayerNotice?.(currentSect.leaderPlayerId, `${resolvePlayerDisplayName(player, playerId)}已离开${currentSect.name}。`, 'info');
            }
        }
        this.playerSectId.delete(playerId);
        return currentSect;
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

    buildSectMemberCountLeaderboard(limit = 10) {
        const effectiveLimit = Number.isFinite(Number(limit))
            ? Math.max(1, Math.floor(Number(limit)))
            : 10;
        return Array.from(this.sectsById.values())
            .filter((sect) => sect?.status === 'active')
            .map((sect) => {
                ensureSectState(sect, this.playerRuntimeService);
                const leader = sect.members.find((member) => member.playerId === sect.leaderPlayerId);
                return {
                    rank: 0,
                    sectId: sect.sectId,
                    sectName: normalizeOptionalString(sect.name) || sect.sectId,
                    mark: normalizeOptionalString(sect.mark),
                    memberCount: Array.isArray(sect.members) ? sect.members.length : 0,
                    leaderPlayerId: normalizeOptionalString(sect.leaderPlayerId),
                    leaderName: normalizeOptionalString(leader?.name) || normalizeOptionalString(sect.leaderPlayerId) || '未知宗主',
                    createdAt: Number.isFinite(Number(sect.createdAt)) ? Number(sect.createdAt) : 0,
                };
            })
            .sort((left, right) => (right.memberCount - left.memberCount
                || left.createdAt - right.createdAt
                || left.sectName.localeCompare(right.sectName, 'zh-Hans-CN')
                || left.sectId.localeCompare(right.sectId)))
            .slice(0, effectiveLimit)
            .map((entry, index) => ({
                rank: index + 1,
                sectId: entry.sectId,
                sectName: entry.sectName,
                mark: entry.mark,
                memberCount: entry.memberCount,
                leaderPlayerId: entry.leaderPlayerId,
                leaderName: entry.leaderName,
            }));
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
        await pool.query('BEGIN');
        try {
            await pool.query(`DELETE FROM ${SECT_TABLE}`);
            for (const sect of sects) {
                await pool.query(`
                    INSERT INTO ${SECT_TABLE}(
                        sect_id,
                        name,
                        mark,
                        founder_player_id,
                        leader_player_id,
                        status,
                        entrance_instance_id,
                        entrance_template_id,
                        entrance_x,
                        entrance_y,
                        sect_instance_id,
                        sect_template_id,
                        created_at_ms,
                        updated_at_ms,
                        raw_payload,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, now())
                `, [
                    sect.sectId,
                    normalizeOptionalString(sect.name) || '',
                    normalizeOptionalString(sect.mark) || SECT_CORE_CHAR,
                    normalizeOptionalString(sect.founderPlayerId) || '',
                    normalizeOptionalString(sect.leaderPlayerId) || '',
                    normalizeOptionalString(sect.status) || 'active',
                    normalizeOptionalString(sect.entranceInstanceId) || '',
                    normalizeOptionalString(sect.entranceTemplateId) || '',
                    normalizeIntegerWithDefault(sect.entranceX, 0),
                    normalizeIntegerWithDefault(sect.entranceY, 0),
                    normalizeOptionalString(sect.sectInstanceId) || '',
                    normalizeOptionalString(sect.sectTemplateId) || '',
                    normalizeIntegerWithDefault(sect.createdAt, Date.now()),
                    normalizeIntegerWithDefault(sect.updatedAt, Date.now()),
                    JSON.stringify(sect),
                ]);
            }
            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
    }

    async loadSectDocument() {
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return null;
        }
        const result = await pool.query(`
            SELECT raw_payload
            FROM ${SECT_TABLE}
            ORDER BY created_at_ms ASC, sect_id ASC
        `);
        const sects = (result.rows ?? [])
            .map((row) => row?.raw_payload)
            .filter((entry) => entry && typeof entry === 'object');
        return sects.length > 0 ? { sects } : null;
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
            await ensureSectTable(pool);
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

async function ensureSectTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${SECT_TABLE} (
                sect_id varchar(180) PRIMARY KEY,
                name varchar(120) NOT NULL,
                mark varchar(16) NOT NULL,
                founder_player_id varchar(100) NOT NULL,
                leader_player_id varchar(100) NOT NULL,
                status varchar(32) NOT NULL,
                entrance_instance_id varchar(180) NOT NULL,
                entrance_template_id varchar(120) NOT NULL,
                entrance_x bigint NOT NULL DEFAULT 0,
                entrance_y bigint NOT NULL DEFAULT 0,
                sect_instance_id varchar(180) NOT NULL,
                sect_template_id varchar(180) NOT NULL,
                created_at_ms bigint NOT NULL,
                updated_at_ms bigint NOT NULL,
                raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS server_sect_leader_idx
            ON ${SECT_TABLE}(leader_player_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS server_sect_template_idx
            ON ${SECT_TABLE}(sect_template_id)
        `);
    } finally {
        client.release();
    }
}

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

function assertSectMarkAvailable(sects, mark) {
    const normalizedMark = normalizeOptionalString(mark);
    if (!normalizedMark) {
        throw new common_1.BadRequestException('宗门印记需为一个可见字符');
    }
    for (const sect of sects) {
        if (normalizeOptionalString(sect?.status) === 'dissolved') {
            continue;
        }
        if (normalizeOptionalString(sect?.mark) === normalizedMark) {
            throw new common_1.BadRequestException('宗门印记已被占用');
        }
    }
}

function normalizeNonNegativeInteger(input) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value < 0) {
        throw new common_1.BadRequestException('注入数量不能为负');
    }
    return value;
}

function normalizeIntegerWithDefault(input, fallback) {
    const value = Math.trunc(Number(input));
    if (Number.isFinite(value)) {
        return value;
    }
    return Math.trunc(Number(fallback ?? 0));
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
    const data = buildSectManagementData(sect, view?.playerId, deps?.playerRuntimeService);
    return `${base}\n${SECT_MANAGEMENT_DATA_MARKER}${encodeURIComponent(JSON.stringify(data))}${SECT_MANAGEMENT_DATA_MARKER_END}`;
}

function buildSectManagementData(sect, playerId, playerRuntimeService = null) {
    ensureSectState(sect, playerRuntimeService);
    const selfPlayerId = normalizeOptionalString(playerId) || '';
    const canEditPermissions = sect.leaderPlayerId === selfPlayerId;
    const canReviewApplications = hasSectPermission(sect, selfPlayerId, 'member_role');
    const canLeave = selfPlayerId !== '' && sect.leaderPlayerId !== selfPlayerId && isSectMember(sect, selfPlayerId);
    return {
        v: 1,
        selfPlayerId,
        canEditPermissions,
        canTransfer: canEditPermissions,
        canDissolve: canEditPermissions,
        canLeave,
        canReviewApplications,
        canManageGuardian: hasSectPermission(sect, selfPlayerId, 'guardian'),
        canRemoveMembers: hasSectPermission(sect, selfPlayerId, 'member_remove'),
        canChangeRoles: hasSectPermission(sect, selfPlayerId, 'member_role'),
        roles: SECT_ROLES,
        permissions: SECT_PERMISSIONS,
        rolePermissions: normalizeSectRolePermissions(sect.rolePermissions),
        members: sect.members.map((member) => {
            const runtimePlayer = playerRuntimeService?.getPlayer?.(member.playerId);
            return {
                playerId: member.playerId,
                name: member.name,
                roleId: member.roleId,
                roleLabel: getSectRoleLabel(member.roleId),
                realmLv: resolveSectMemberRealmLv(runtimePlayer),
                statusLabel: resolveSectMemberPresenceLabel(runtimePlayer),
                self: member.playerId === selfPlayerId,
                leader: member.playerId === sect.leaderPlayerId,
            };
        }),
        applications: sect.applications
            .filter((entry) => entry.status === 'pending')
            .map((entry) => ({
                playerId: entry.playerId,
                name: entry.name,
                appliedAt: entry.appliedAt,
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
    sect.applications = normalizeSectApplications(sect.applications, sect.members);
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

function normalizeSectApplications(input, members = []) {
    const memberIds = new Set((Array.isArray(members) ? members : []).map((entry) => entry.playerId));
    const applications = [];
    const seen = new Set();
    for (const entry of Array.isArray(input) ? input : []) {
        const playerId = normalizeOptionalString(entry?.playerId ?? entry?.applicantPlayerId);
        if (!playerId || seen.has(playerId) || memberIds.has(playerId)) {
            continue;
        }
        seen.add(playerId);
        const status = entry?.status === 'approved' || entry?.status === 'rejected' ? entry.status : 'pending';
        applications.push({
            playerId,
            name: normalizeOptionalString(entry?.name ?? entry?.playerName) || playerId,
            status,
            appliedAt: Number.isFinite(Number(entry?.appliedAt)) ? Number(entry.appliedAt) : Date.now(),
            updatedAt: Number.isFinite(Number(entry?.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
            reviewedAt: Number.isFinite(Number(entry?.reviewedAt)) ? Number(entry.reviewedAt) : null,
            reviewerPlayerId: normalizeOptionalString(entry?.reviewerPlayerId) || null,
        });
    }
    return applications.sort((left, right) => left.appliedAt - right.appliedAt || left.playerId.localeCompare(right.playerId));
}

function findPendingSectApplication(sect, playerId) {
    const normalized = normalizeOptionalString(playerId);
    return normalized
        ? (sect.applications ?? []).find((entry) => entry.playerId === normalized && entry.status === 'pending') ?? null
        : null;
}

function upsertSectApplication(sect, player, now = Date.now()) {
    ensureSectState(sect);
    const playerId = normalizeOptionalString(player?.playerId) || normalizeOptionalString(player?.id);
    if (!playerId) {
        throw new common_1.BadRequestException('申请人无效');
    }
    const existing = findPendingSectApplication(sect, playerId);
    if (existing) {
        existing.name = resolvePlayerDisplayName(player, existing.name);
        existing.updatedAt = now;
        return existing;
    }
    const application = {
        playerId,
        name: resolvePlayerDisplayName(player, playerId),
        status: 'pending',
        appliedAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewerPlayerId: null,
    };
    sect.applications.push(application);
    return application;
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
    const playerId = normalizeOptionalString(player?.playerId) || normalizeOptionalString(player?.id) || '';
    return {
        playerId,
        name: resolvePlayerDisplayName(player, playerId || '未知成员'),
        roleId: normalizeSectRoleId(roleId, { allowSupreme: true, fallback: 'outer' }),
        joinedAt,
    };
}

function resolvePlayerDisplayName(player, fallback = '') {
    return normalizeOptionalString(player?.name)
        || normalizeOptionalString(player?.displayName)
        || normalizeOptionalString(player?.playerId)
        || normalizeOptionalString(fallback)
        || '未知成员';
}

function resolveSectMemberPresenceLabel(player) {
    if (!player) {
        return '离线';
    }
    return typeof player.sessionId === 'string' && player.sessionId.trim()
        ? '在线'
        : '离线挂机';
}

function resolveSectMemberRealmLv(player) {
    const value = Number(player?.realm?.realmLv ?? player?.realmLv);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
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
        applications: normalizeSectApplications(entry.applications, normalizeSectMembers(entry.members, {
            sectId,
            leaderPlayerId,
            leaderName: normalizeOptionalString(entry.leaderName) || leaderPlayerId,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
        })),
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

function assertSectFoundingAreaClear(sects, instance, instanceId, centerX, centerY) {
    const x0 = Math.trunc(Number(centerX));
    const y0 = Math.trunc(Number(centerY));
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
        throw new common_1.BadRequestException('当前位置无法开辟宗门入口');
    }
    for (let y = y0 - SECT_FOUNDING_CLEAR_RADIUS; y <= y0 + SECT_FOUNDING_CLEAR_RADIUS; y += 1) {
        for (let x = x0 - SECT_FOUNDING_CLEAR_RADIUS; x <= x0 + SECT_FOUNDING_CLEAR_RADIUS; x += 1) {
            if (typeof instance?.isInBounds === 'function' && instance.isInBounds(x, y) !== true) {
                continue;
            }
            if (typeof instance?.getPortalAtTile === 'function' && instance.getPortalAtTile(x, y)) {
                throw new common_1.BadRequestException('宗门山门五格阵基内不能有传送点');
            }
            if (hasNpcAtTile(instance, x, y)) {
                throw new common_1.BadRequestException('宗门山门五格阵基内不能有场景人物');
            }
            if (typeof instance?.getSafeZoneAtTile === 'function' && instance.getSafeZoneAtTile(x, y)) {
                throw new common_1.BadRequestException('宗门山门五格阵基内不能有安全区');
            }
        }
    }
    const normalizedInstanceId = normalizeOptionalString(instanceId);
    for (const sect of Array.isArray(sects) ? sects : []) {
        if (!sect || sect.status === 'dissolved' || normalizeOptionalString(sect.entranceInstanceId) !== normalizedInstanceId) {
            continue;
        }
        if (chebyshevDistance(x0, y0, sect.entranceX, sect.entranceY) <= SECT_FOUNDING_CLEAR_RADIUS) {
            throw new common_1.BadRequestException('宗门山门五格阵基内不能有其他宗门');
        }
    }
}

function hasNpcAtTile(instance, x, y) {
    if (!instance) {
        return false;
    }
    if (typeof instance.toTileIndex === 'function' && instance.npcIdByTile instanceof Map) {
        try {
            return instance.npcIdByTile.has(instance.toTileIndex(x, y));
        } catch (_error) {
            return false;
        }
    }
    if (instance.npcsById instanceof Map) {
        for (const npc of instance.npcsById.values()) {
            if (Math.trunc(Number(npc?.x)) === x && Math.trunc(Number(npc?.y)) === y) {
                return true;
            }
        }
    }
    return false;
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
