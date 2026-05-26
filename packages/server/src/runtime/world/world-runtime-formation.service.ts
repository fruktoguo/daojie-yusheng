/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY, FORMATION_AURA_PER_SPIRIT_STONE, FORMATION_DISK_TIER_MULTIPLIERS, FORMATION_SPIRIT_STONE_ITEM_ID, FORMATION_TICKS_PER_DAY, QI_HALF_LIFE_RATE_SCALE, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH, buildQiHalfLifeRateScaled, formatDisplayInteger, getFormationTemplateById, isFormationSetupInput, normalizeFormationAllocation, normalizeFormationSetup, resolveFormationCostConfig, resolveFormationDamagePerAura, resolveFormationLifecycle as resolveSharedFormationLifecycle, resolveFormationMinSpiritStoneCount, resolveFormationQiCost, resolveFormationSetupPlan, resolveFormationStats, resolveFormationVisual } from '@mud/shared';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { ensureBigintColumnType, ensureDoubleColumnType } from '../../persistence/schema-bigint-migration';

const TERRAIN_STABILIZER_EFFECT_KIND = 'terrain_stabilizer';
const TILE_AURA_SOURCE_EFFECT_KIND = 'tile_aura_source';
const BOUNDARY_BARRIER_EFFECT_KIND = 'boundary_barrier';
const INSTANCE_FORMATION_STATE_TABLE = 'instance_formation_state';
const INSTANCE_FORMATION_STATE_BIGINT_COLUMNS = [
    'spirit_stone_count',
    'x',
    'y',
    'eye_x',
    'eye_y',
    'created_at_ms',
    'updated_at_ms',
];
const INSTANCE_FORMATION_STATE_DOUBLE_COLUMNS = [
    'qi_cost',
    'remaining_qi_budget',
    'remaining_spirit_stone_budget',
];
const TERRAIN_DAMAGE_REDUCTION_DENOMINATOR = 100000;
const FORMATION_LIFECYCLE_DEPLOYED = 'deployed';
const FORMATION_LIFECYCLE_PERSISTENT = 'persistent';
const PERSISTENT_FORMATION_ACTIVE_HALF_LIFE_TICKS = FORMATION_TICKS_PER_DAY * 3;
const PERSISTENT_FORMATION_INACTIVE_DECAY_DIVISOR = 10;
const PERSISTENT_FORMATION_ACTIVE_DECAY_RATE_SCALED = buildQiHalfLifeRateScaled(PERSISTENT_FORMATION_ACTIVE_HALF_LIFE_TICKS);
const runtimeFormationProjectionCache = new WeakMap();

/** world-runtime formation：阵法权威运行时，承接布阵、开关、补充与 tick 效果。 */
class WorldRuntimeFormationService {
    logger = new Logger(WorldRuntimeFormationService.name);
    contentTemplateRepository;
    playerRuntimeService;
    formationsByInstanceId = new Map();
    restoredFormationInstanceIds = new Set();
    nextFormationSerial = 1;
    persistencePool = null;
    persistenceReady = false;
    persistenceInitPromise = null;
    databasePoolProvider = null;

    constructor(contentTemplateRepository, playerRuntimeService, databasePoolProvider = null) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.databasePoolProvider = databasePoolProvider;
    }

    dispatchCreateFormation(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const itemInstanceId = resolveInventoryItemInstanceId(payload, this.playerRuntimeService, playerId);
        const diskItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
        const diskTier = resolveFormationDiskTier(diskItem);
        if (!diskItem || !diskTier) {
            throw new BadRequestException('需要使用阵盘布阵');
        }
        const template = this.resolveFormationTemplate(payload?.formationId);
        if (resolveFormationLifecycle(template) === FORMATION_LIFECYCLE_PERSISTENT) {
            throw new BadRequestException(`${template.name}是持续性阵法，不能通过阵盘布置`);
        }
        if (template.placeableByDisk === false) {
            throw new BadRequestException(`${template.name}不能通过阵盘布置`);
        }
        const diskMultiplier = normalizeDiskMultiplier(diskItem);
        const hasSetupPayload = payload?.setup && typeof payload.setup === 'object';
        const plan = hasSetupPayload
            ? resolveFormationSetupPlan(template, diskMultiplier, payload.setup)
            : null;
        const spiritStoneCount = plan
            ? plan.spiritStoneCount
            : normalizePositiveInteger(payload?.spiritStoneCount, '灵石数量');
        const minSpiritStoneCount = resolveFormationMinSpiritStoneCount(template);
        if (!plan && spiritStoneCount < minSpiritStoneCount) {
            throw new BadRequestException(`${template.name}至少需要投入 ${formatInteger(minSpiritStoneCount)} 灵石`);
        }
        const qiCost = plan ? plan.qiCost : resolveFormationQiCost(spiritStoneCount, template);
        const allocation = plan ? plan.setup : normalizeFormationAllocation(payload?.allocation);
        const stats = plan ? plan.stats : resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntime(location.instanceId);
        if (!instance) {
            throw new NotFoundException('当前地图实例不存在');
        }
        assertCanPlaceFormationInInstance(instance);
        const placement = resolveFormationPlacement(playerId, player, location, instance);
        this.assertCanPay(playerId, qiCost, spiritStoneCount);
        this.playerRuntimeService.spendQi(playerId, qiCost);
        this.playerRuntimeService.debitWallet(playerId, FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
        this.playerRuntimeService.consumeInventoryItemByInstanceId(playerId, itemInstanceId, 1);
        const now = Date.now();
        const formation = {
            instanceId: instance.meta.instanceId,
            id: `formation:${instance.meta.instanceId}:${this.nextFormationSerial++}`,
            ownerPlayerId: playerId,
            ownerSectId: resolvePlayerSectId(player),
            formationId: template.id,
            lifecycle: FORMATION_LIFECYCLE_DEPLOYED,
            name: template.name,
            template,
            diskItemId: diskItem.itemId,
            diskTier,
            diskMultiplier,
            spiritStoneCount,
            qiCost,
            x: placement.x,
            y: placement.y,
            eyeInstanceId: instance.meta.instanceId,
            eyeX: placement.x,
            eyeY: placement.y,
            allocation,
            stats,
            active: true,
            remainingQiBudget: stats.totalQiBudget ?? stats.totalAuraBudget,
            remainingSpiritStoneBudget: stats.totalSpiritStoneBudget ?? spiritStoneCount,
            remainingAuraBudget: stats.totalAuraBudget,
            createdAt: now,
            updatedAt: now,
        };
        this.getFormationList(instance.meta.instanceId).push(formation);
        touchInstanceRevision(instance);
        this.persistInstanceFormationsSoon(instance.meta.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${template.name}已布下：半径 ${stats.radius}，强度 ${formatInteger(stats.effectValue)}，灵力 ${formatInteger(stats.totalQiBudget ?? stats.totalAuraBudget)}，灵石 ${formatInteger(stats.totalSpiritStoneBudget ?? spiritStoneCount)}。`,
            kind: 'success',
        });
        if (typeof deps.refreshPlayerContextActions === 'function') {
            deps.refreshPlayerContextActions(playerId);
        }
        return formation;
    }

    upsertSectGuardianFormation(input, deps = null) {
        const template = this.resolveFormationTemplate(input?.formationId ?? 'sect_guardian_barrier');
        if (template.effect?.kind !== BOUNDARY_BARRIER_EFFECT_KIND) {
            throw new BadRequestException('护宗大阵模板必须是边界防护阵法');
        }
        const instanceId = normalizeInstanceId(input?.instanceId);
        if (!instanceId) {
            throw new BadRequestException('地图实例 ID 不能为空');
        }
        const x = firstFiniteInteger(input?.x);
        const y = firstFiniteInteger(input?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new BadRequestException('护宗大阵入口坐标无效');
        }
        const ownerSectId = normalizeOptionalString(input?.ownerSectId ?? input?.sectId);
        const eyeInstanceId = normalizeInstanceId(input?.eyeInstanceId) || instanceId;
        const eyeX = firstFiniteInteger(input?.eyeX, x);
        const eyeY = firstFiniteInteger(input?.eyeY, y);
        const explicitRemainingQiBudget = Number.isFinite(Number(input?.remainingQiBudget ?? input?.remainingAuraBudget))
            ? Math.max(0, Number(input.remainingQiBudget ?? input.remainingAuraBudget))
            : null;
        const explicitRemainingSpiritStoneBudget = Number.isFinite(Number(input?.remainingSpiritStoneBudget))
            ? Math.max(0, Number(input.remainingSpiritStoneBudget))
            : null;
        const inputSpiritStoneCount = Math.trunc(Number(input?.spiritStoneCount) || 0);
        const auraPerSpiritStone = resolveFormationAuraPerSpiritStone(template);
        const fallbackSpiritStoneCount = explicitRemainingSpiritStoneBudget !== null
            ? Math.ceil(explicitRemainingSpiritStoneBudget)
            : explicitRemainingQiBudget !== null
            ? Math.ceil(explicitRemainingQiBudget / auraPerSpiritStone)
            : resolveFormationMinSpiritStoneCount(template);
        const spiritStoneCount = Math.max(1, inputSpiritStoneCount > 0 ? inputSpiritStoneCount : fallbackSpiritStoneCount);
        const diskMultiplier = Number.isFinite(Number(input?.diskMultiplier)) ? Math.max(1, Number(input.diskMultiplier)) : 1;
        const allocation = normalizeFormationAllocation(input?.allocation);
        const stats = resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        if (Number.isFinite(Number(input?.radius))) {
            stats.radius = Math.max(1, Math.trunc(Number(input.radius)));
        }
        const now = Date.now();
        const formationId = normalizeOptionalString(input?.id)
            || `formation:sect_guardian:${ownerSectId || 'public'}:${instanceId}:${x}:${y}`;
        const list = this.getFormationList(instanceId);
        const existing = list.find((entry) => entry.id === formationId);
        const remainingQiBudget = existing
            ? resolveFormationRemainingQiBudget(existing)
            : explicitRemainingQiBudget !== null ? explicitRemainingQiBudget : stats.totalQiBudget ?? stats.totalAuraBudget;
        const remainingSpiritStoneBudget = existing
            ? resolveFormationRemainingSpiritStoneBudget(existing)
            : explicitRemainingSpiritStoneBudget !== null ? explicitRemainingSpiritStoneBudget : stats.totalSpiritStoneBudget ?? spiritStoneCount;
        const active = input?.active !== false && remainingQiBudget > 0 && remainingSpiritStoneBudget > 0;
        const patch = {
            instanceId,
            id: formationId,
            ownerPlayerId: normalizeOptionalString(input?.ownerPlayerId) || '',
            ownerSectId,
            formationId: template.id,
            lifecycle: FORMATION_LIFECYCLE_PERSISTENT,
            name: template.name,
            template,
            diskItemId: '',
            diskTier: 'mortal',
            diskMultiplier,
            spiritStoneCount,
            qiCost: 0,
            x,
            y,
            eyeInstanceId,
            eyeX,
            eyeY,
            allocation,
            stats,
            active,
            remainingQiBudget,
            remainingSpiritStoneBudget,
            remainingAuraBudget: remainingQiBudget,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        if (existing) {
            Object.assign(existing, patch);
        }
        else {
            list.push(patch);
        }
        const formation = existing ?? patch;
        touchRuntimeInstanceRevision(deps, instanceId);
        this.persistFormationSnapshotSoon(formation);
        return formation;
    }

    dispatchSetFormationActive(playerId, payload, deps = null) {
        const formation = this.findOwnedFormation(playerId, payload?.formationInstanceId);
        if (isPersistentFormation(formation)) {
            throw new BadRequestException('持续性阵法需要在阵法管理面板操作');
        }
        formation.active = payload?.active !== false
            && resolveFormationRemainingQiBudget(formation) > 0
            && resolveFormationRemainingSpiritStoneBudget(formation) > 0;
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}已${formation.active ? '开启' : '关闭'}。`,
            kind: 'info',
        });
        return formation;
    }

    dispatchRefillFormation(playerId, payload, deps = null) {
        const formation = this.findOwnedFormation(playerId, payload?.formationInstanceId);
        if (isPersistentFormation(formation)) {
            throw new BadRequestException('持续性阵法需要在阵法管理面板注入灵石或灵力');
        }
        const defaultSpiritStoneCount = Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1));
        const spiritStoneCount = payload && 'spiritStoneCount' in payload
            ? normalizeNonNegativeInteger(payload.spiritStoneCount ?? 0)
            : defaultSpiritStoneCount;
        const qiAmount = payload && ('qiAmount' in payload || 'qiCost' in payload)
            ? normalizeNonNegativeInteger(payload.qiAmount ?? payload.qiCost ?? 0)
            : resolveFormationQiCost(defaultSpiritStoneCount, formation.template);
        if (spiritStoneCount <= 0 && qiAmount <= 0) {
            throw new BadRequestException('至少需要补充灵石或灵力');
        }
        this.assertCanPay(playerId, qiAmount, spiritStoneCount);
        if (qiAmount > 0) {
            this.playerRuntimeService.spendQi(playerId, qiAmount);
        }
        if (spiritStoneCount > 0) {
            this.playerRuntimeService.debitWallet(playerId, FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
        }
        if (spiritStoneCount > 0) {
            setFormationRemainingSpiritStoneBudget(formation, resolveFormationRemainingSpiritStoneBudget(formation) + spiritStoneCount);
        }
        if (qiAmount > 0) {
            setFormationRemainingQiBudget(formation, resolveFormationRemainingQiBudget(formation) + qiAmount);
        }
        if (resolveFormationRemainingQiBudget(formation) > 0 && resolveFormationRemainingSpiritStoneBudget(formation) > 0) {
            formation.active = true;
        }
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}补充灵石 ${formatInteger(spiritStoneCount)}，灵力 ${formatInteger(qiAmount)}。`,
            kind: 'success',
        });
        return formation;
    }

    startFormationMaintenance(player, payload, ctx) {
        const playerId = normalizePlayerId(player);
        if (!playerId) {
            throw new BadRequestException('玩家不存在。');
        }
        const formationInstanceId = normalizeOptionalString(payload?.formationInstanceId);
        if (!formationInstanceId) {
            throw new BadRequestException('阵法实例 ID 不能为空。');
        }
        if (hasActiveFormationMaintenance(player, formationInstanceId)) {
            return {
                ok: true,
                panelChanged: false,
                messages: [{ kind: 'info', text: '正在维护该阵法。' }],
            };
        }
        const activeJob = resolveAnyActiveTechniqueJob(player);
        if (activeJob) {
            const formation = this.findOwnedFormation(playerId, formationInstanceId);
            if (enqueueFormationMaintenance(player, formationInstanceId, formation.name)) {
                markPlayerRuntimeDirty(player, ['active_job'], this.playerRuntimeService);
                return {
                    ok: true,
                    panelChanged: true,
                    messages: [{ kind: 'system', text: '已将阵法维护加入技艺行动队列。' }],
                };
            }
            throw new BadRequestException('技艺行动队列已满。');
        }
        const validation = this.checkFormationMaintenanceCondition(player, { formationInstanceId }, ctx);
        if (!validation.satisfied) {
            throw new BadRequestException(validation.reason || '当前不能维护该阵法。');
        }
        player.formationJob = this.createFormationMaintenanceJob(player, { formationInstanceId }, ctx);
        markPlayerRuntimeDirty(player, ['active_job'], this.playerRuntimeService);
        return {
            ok: true,
            panelChanged: true,
            messages: [{ kind: 'quest', text: `开始维护 ${player.formationJob.formationName}。` }],
        };
    }

    cancelFormationMaintenance(player, _ctx = null) {
        if (!player?.formationJob || Number(player.formationJob.remainingTicks) <= 0) {
            throw new BadRequestException('当前没有进行中的阵法维护。');
        }
        const formationName = player.formationJob.formationName || '阵法';
        player.formationJob = null;
        markPlayerRuntimeDirty(player, ['active_job'], this.playerRuntimeService);
        return {
            ok: true,
            panelChanged: true,
            messages: [{ kind: 'system', text: `已停止维护 ${formationName}。` }],
        };
    }

    createFormationMaintenanceJob(player, validated, ctx) {
        const playerId = normalizePlayerId(player);
        const formation = this.findOwnedFormation(playerId, validated?.formationInstanceId);
        const rate = resolveFormationMaintenanceRate(player);
        return {
            jobRunId: `job:${playerId}:formation:${Date.now()}`,
            jobType: 'formation',
            formationInstanceId: formation.id,
            formationName: formation.name,
            instanceId: formation.instanceId,
            controlInstanceId: normalizeInstanceId(formation.eyeInstanceId) || formation.instanceId,
            controlX: Math.trunc(Number(formation.eyeX) || formation.x),
            controlY: Math.trunc(Number(formation.eyeY) || formation.y),
            phase: 'maintaining',
            startedAt: Date.now(),
            totalTicks: 1,
            remainingTicks: 1,
            pausedTicks: 0,
            successRate: 1,
            spiritStoneCost: 0,
            maintenanceRate: rate,
            jobVersion: 1,
        };
    }

    checkFormationMaintenanceCondition(player, job, _ctx = null) {
        const playerId = normalizePlayerId(player);
        const formationInstanceId = normalizeOptionalString(job?.formationInstanceId);
        if (!playerId || !formationInstanceId) {
            return { satisfied: false, reason: '阵法维护目标无效。', shouldCancel: true };
        }
        let formation = null;
        try {
            formation = this.findOwnedFormation(playerId, formationInstanceId);
        } catch (_error) {
            return { satisfied: false, reason: '阵法已不存在或不属于你。', shouldCancel: true };
        }
        if (!formation || resolveFormationRemainingSpiritStoneBudget(formation) <= 0) {
            return { satisfied: false, reason: '阵法灵石已耗尽。', shouldCancel: true };
        }
        const controlInstanceId = normalizeInstanceId(formation.eyeInstanceId) || formation.instanceId;
        const controlX = Math.trunc(Number(formation.eyeX) || formation.x);
        const controlY = Math.trunc(Number(formation.eyeY) || formation.y);
        const playerInstanceId = normalizeInstanceId(player.instanceId);
        if (playerInstanceId !== controlInstanceId
            || Math.trunc(Number(player.x)) !== controlX
            || Math.trunc(Number(player.y)) !== controlY) {
            return { satisfied: false, reason: '离开阵法控制点位。', shouldCancel: true };
        }
        return { satisfied: true };
    }

    resolveFormationMaintenanceTick(player, job, ctx) {
        const playerId = normalizePlayerId(player);
        if (!playerId) {
            return buildFormationResolveResult(true, []);
        }
        const formation = this.findOwnedFormation(playerId, job.formationInstanceId);
        const rate = resolveFormationMaintenanceRate(player);
        const transfer = Math.min(rate, Math.max(0, Math.floor(Number(player.qi) || 0)));
        if (transfer <= 0) {
            player.formationJob = null;
            markPlayerRuntimeDirty(player, ['active_job'], this.playerRuntimeService);
            return buildFormationResolveResult(true, [{ kind: 'warn', text: `${formation.name}维护中止：自身灵力不足。` }]);
        }
        this.playerRuntimeService.spendQi(playerId, transfer);
        setFormationRemainingQiBudget(formation, resolveFormationRemainingQiBudget(formation) + transfer);
        if (resolveFormationRemainingSpiritStoneBudget(formation) > 0) {
            formation.active = true;
        }
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(ctx?.deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        if (typeof this.playerRuntimeService.recordActivity === 'function') {
            this.playerRuntimeService.recordActivity(playerId, Number(ctx?.deps?.tick) || 0, { interruptCultivation: true });
        }
        job.maintenanceRate = rate;
        job.remainingTicks = 1;
        job.totalTicks = 1;
        job.jobVersion = Math.max(1, Math.floor(Number(job.jobVersion) || 1) + 1);
        markPlayerRuntimeDirty(player, ['active_job'], this.playerRuntimeService);
        return {
            successCount: 1,
            failureCount: 0,
            outputs: [],
            expParams: {
                skillLevel: player.formationSkill?.level ?? 1,
                targetLevel: player.formationSkill?.level ?? 1,
                baseActionTicks: 1,
                successCount: 1,
                failureCount: 0,
                getExpToNextByLevel: ctx.resolveExpToNextByLevel,
            },
            completed: false,
            messages: [],
        };
    }

    dispatchSetPersistentFormationActive(playerId, payload, deps = null) {
        const formation = this.findFormationByInstanceOrId(payload?.instanceId, payload?.formationInstanceId);
        if (!formation) {
            throw new NotFoundException('阵法不存在');
        }
        if (!isPersistentFormation(formation)) {
            throw new BadRequestException('该阵法不是持续性阵法');
        }
        formation.active = payload?.active !== false
            && resolveFormationRemainingQiBudget(formation) > 0
            && resolveFormationRemainingSpiritStoneBudget(formation) > 0;
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}已${formation.active ? '开启' : '关闭'}。`,
            kind: 'info',
        });
        return formation;
    }

    dispatchInjectPersistentFormationEnergy(playerId, payload, deps = null) {
        const formation = this.findFormationByInstanceOrId(payload?.instanceId, payload?.formationInstanceId);
        if (!formation) {
            throw new NotFoundException('阵法不存在');
        }
        if (!isPersistentFormation(formation)) {
            throw new BadRequestException('该阵法不是持续性阵法');
        }
        const spiritStoneCount = normalizeNonNegativeInteger(payload?.spiritStoneCount ?? 0);
        const qiAmount = normalizeNonNegativeInteger(payload?.qiAmount ?? payload?.qiCost ?? resolveFormationQiCost(spiritStoneCount, formation.template));
        if (spiritStoneCount <= 0 && qiAmount <= 0) {
            throw new BadRequestException('至少需要注入灵石或灵力');
        }
        this.assertCanInject(playerId, qiAmount, spiritStoneCount);
        if (qiAmount > 0) {
            this.playerRuntimeService.spendQi(playerId, qiAmount);
        }
        if (spiritStoneCount > 0) {
            this.playerRuntimeService.debitWallet(playerId, FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
            setFormationRemainingSpiritStoneBudget(formation, resolveFormationRemainingSpiritStoneBudget(formation) + spiritStoneCount);
        }
        if (qiAmount > 0) {
            setFormationRemainingQiBudget(formation, resolveFormationRemainingQiBudget(formation) + qiAmount);
        }
        if (resolveFormationRemainingQiBudget(formation) > 0 && resolveFormationRemainingSpiritStoneBudget(formation) > 0) {
            formation.active = true;
        }
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}注入灵石 ${formatInteger(spiritStoneCount)}，灵力 ${formatInteger(qiAmount)}。`,
            kind: 'success',
        });
        return formation;
    }

    advanceInstanceFormations(instance, _worldTick, deps) {
        const formations = this.formationsByInstanceId.get(instance.meta.instanceId);
        if (!formations || formations.length <= 0) {
            return;
        }
        let persistenceDirty = false;
        for (let index = formations.length - 1; index >= 0; index -= 1) {
            const formation = formations[index];
            const tickCost = isPersistentFormation(formation)
                ? resolvePersistentFormationTickCost(formation)
                : resolveFormationTickCost(formation);
            const spiritStoneBefore = resolveFormationRemainingSpiritStoneBudget(formation);
            const qiBefore = resolveFormationRemainingQiBudget(formation);
            const lacksSpiritStone = tickCost.spiritStoneCost > 0 && spiritStoneBefore < tickCost.spiritStoneCost;
            setFormationRemainingSpiritStoneBudget(formation, Math.max(0, spiritStoneBefore - tickCost.spiritStoneCost));
            if (lacksSpiritStone || resolveFormationRemainingSpiritStoneBudget(formation) <= 0) {
                formations.splice(index, 1);
                touchInstanceRevision(instance);
                persistenceDirty = true;
                this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                    text: `${formation.name}灵石耗尽，阵势损毁。`,
                    kind: 'warning',
                });
                continue;
            }
            const wasActive = formation.active !== false;
            const lacksQi = tickCost.qiCost > 0 && qiBefore < tickCost.qiCost;
            setFormationRemainingQiBudget(formation, Math.max(0, qiBefore - tickCost.qiCost));
            if (tickCost.spiritStoneCost > 0 || tickCost.qiCost > 0) {
                formation.updatedAt = Date.now();
            }
            if (lacksQi || resolveFormationRemainingQiBudget(formation) <= 0) {
                if (formation.active !== false) {
                    formation.active = false;
                    formation.updatedAt = Date.now();
                    touchInstanceRevision(instance);
                    persistenceDirty = true;
                    this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                        text: `${formation.name}灵力不足，阵势关闭。`,
                        kind: 'warning',
                    });
                }
                if (Number.isFinite(Number(_worldTick)) && Number(_worldTick) % 60 === 0) {
                    persistenceDirty = true;
                }
                continue;
            }
            if (Number.isFinite(Number(_worldTick)) && Number(_worldTick) % 60 === 0) {
                persistenceDirty = true;
            }
            if (!wasActive || formation.active !== true) {
                continue;
            }
            if (formation.template.effect.kind === TILE_AURA_SOURCE_EFFECT_KIND) {
                this.advanceAuraFormation(instance, formation);
            }
        }
        if (formations.length <= 0) {
            this.formationsByInstanceId.delete(instance.meta.instanceId);
        }
        if (persistenceDirty) {
            this.persistInstanceFormationsSoon(instance.meta.instanceId);
        }
    }

    isTerrainStabilized(instanceId, x, y) {
        const formations = this.formationsByInstanceId.get(instanceId);
        if (!formations || formations.length <= 0) {
            return false;
        }
        for (const formation of formations) {
            if (!isActiveTerrainStabilizerFormation(formation)) {
                continue;
            }
            if (this.containsTile(formation, x, y)) {
                return true;
            }
        }
        return false;
    }

    createTerrainStabilizationChecker(instanceId) {
        const formations = this.formationsByInstanceId.get(instanceId);
        if (!formations || formations.length <= 0) {
            return () => false;
        }
        const snapshots = [];
        for (const formation of formations) {
            if (!isActiveTerrainStabilizerFormation(formation)) {
                continue;
            }
            snapshots.push({
                shape: formation.template.range.shape,
                x: Math.trunc(Number(formation.x)),
                y: Math.trunc(Number(formation.y)),
                radius: Math.max(1, Math.trunc(Number(formation.stats?.radius) || 1)),
            });
        }
        if (snapshots.length <= 0) {
            return () => false;
        }
        return (x, y) => {
            const tileX = Math.trunc(Number(x));
            const tileY = Math.trunc(Number(y));
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
                return false;
            }
            for (const snapshot of snapshots) {
                if (isFormationAffectedCell(snapshot.shape, snapshot.x, snapshot.y, tileX, tileY, snapshot.radius)) {
                    return true;
                }
            }
            return false;
        };
    }

    resolveTerrainDamageReduction(instanceId, x, y) {
        const formations = this.formationsByInstanceId.get(instanceId);
        if (!formations || formations.length <= 0) {
            return 0;
        }
        let reduction = 0;
        for (const formation of formations) {
            if (!isActiveTerrainStabilizerFormation(formation)) {
                continue;
            }
            if (!this.containsTile(formation, x, y)) {
                continue;
            }
            const effectValue = Math.max(0, Number(formation.stats?.effectValue) || 0);
            if (effectValue <= 0) {
                continue;
            }
            reduction = Math.max(reduction, effectValue / (effectValue + TERRAIN_DAMAGE_REDUCTION_DENOMINATOR));
        }
        return Math.max(0, Math.min(0.999999, reduction));
    }

    mitigateTerrainDamage(instanceId, x, y, damage) {
        const normalizedDamage = Math.max(0, Number(damage) || 0);
        if (normalizedDamage <= 0) {
            return 0;
        }
        const reduction = this.resolveTerrainDamageReduction(instanceId, x, y);
        if (reduction <= 0) {
            return normalizedDamage;
        }
        return Math.max(0, normalizedDamage * (1 - reduction));
    }

    resolveFormationSelfDamageReduction(formation) {
        if (!formation
            || formation.active !== true
            || formation.template?.effect?.kind !== BOUNDARY_BARRIER_EFFECT_KIND) {
            return 0;
        }
        const effectValue = Math.max(0, Number(formation.stats?.effectValue) || 0);
        if (effectValue <= 0) {
            return 0;
        }
        return Math.max(0, Math.min(0.999999, effectValue / (effectValue + TERRAIN_DAMAGE_REDUCTION_DENOMINATOR)));
    }

    isBoundaryBarrierBlocked(instanceId, x, y, playerId = null) {
        return Boolean(this.findBoundaryBarrierFormation(instanceId, x, y, playerId));
    }

    getBoundaryBarrierCombatState(instanceId, x, y) {
        const formation = this.findBoundaryBarrierFormation(instanceId, x, y);
        if (!formation) {
            return null;
        }
        return {
            formationId: formation.id,
            id: formation.id,
            name: formation.name,
            x: Math.trunc(x),
            y: Math.trunc(y),
            centerX: formation.x,
            centerY: formation.y,
            remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
            damagePerAura: resolveFormationDamagePerAura(formation.template),
        };
    }

    getAttackableTileCombatState(instanceId, x, y) {
        const boundary = this.getBoundaryBarrierCombatState(instanceId, x, y);
        if (!boundary) {
            return null;
        }
        const hp = Math.max(1, Math.ceil(boundary.remainingAuraBudget * boundary.damagePerAura));
        return {
            kind: 'formation_boundary',
            id: `formation-boundary:${boundary.formationId}:${boundary.x}:${boundary.y}`,
            name: boundary.name,
            x: boundary.x,
            y: boundary.y,
            hp,
            remainingAuraBudget: boundary.remainingAuraBudget,
            damagePerAura: boundary.damagePerAura,
            supportsSkill: true,
        };
    }

    applyDamageToBoundaryBarrier(instanceId, x, y, damage, attackerPlayerId = null, deps = null) {
        const boundary = this.getBoundaryBarrierCombatState(instanceId, x, y);
        if (!boundary) {
            return null;
        }
        const outcome = this.applyDamageToFormation(instanceId, boundary.formationId, damage, attackerPlayerId, deps);
        return outcome ? {
            ...outcome,
            boundary,
        } : null;
    }

    getFormationCombatState(instanceId, formationInstanceId) {
        const formation = this.findFormationInInstance(instanceId, formationInstanceId);
        if (!formation || resolveFormationRemainingQiBudget(formation) <= 0) {
            return null;
        }
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        if (isPersistentFormation(formation) && normalizeInstanceId(formation.eyeInstanceId) !== normalizedInstanceId) {
            return null;
        }
        return {
            id: formation.id,
            name: formation.name,
            x: Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
            y: Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
            remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
            damagePerAura: resolveFormationDamagePerAura(formation.template),
        };
    }

    getAttackableEntityCombatState(instanceId, targetId) {
        const formation = this.getFormationCombatState(instanceId, targetId);
        if (!formation) {
            return null;
        }
        const hp = Math.max(1, Math.ceil(formation.remainingAuraBudget * formation.damagePerAura));
        return {
            kind: 'formation',
            id: formation.id,
            targetRef: formation.id,
            targetMonsterId: formation.id,
            name: formation.name,
            x: formation.x,
            y: formation.y,
            hp,
            remainingAuraBudget: formation.remainingAuraBudget,
            damagePerAura: formation.damagePerAura,
            supportsSkill: true,
        };
    }

    getAttackableFormationEyeCombatStateAtTile(instanceId, x, y) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        const targetX = Math.trunc(Number(x));
        const targetY = Math.trunc(Number(y));
        if (!normalizedInstanceId || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
            return null;
        }
        const candidates = [];
        for (const formations of this.formationsByInstanceId.values()) {
            for (const formation of formations) {
                if (!formation || resolveFormationRemainingQiBudget(formation) <= 0) {
                    continue;
                }
                const eyeInstanceId = normalizeInstanceId(formation.eyeInstanceId ?? formation.instanceId);
                const eyeX = Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x;
                const eyeY = Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y;
                if (eyeInstanceId === normalizedInstanceId && eyeX === targetX && eyeY === targetY) {
                    candidates.push(formation);
                }
            }
        }
        candidates.sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
        const formation = candidates[0] ?? null;
        return formation ? this.getAttackableEntityCombatState(normalizedInstanceId, formation.id) : null;
    }

    applyDamageToFormation(instanceId, formationInstanceId, damage, attackerPlayerId = null, deps = null) {
        const formation = this.findFormationInInstance(instanceId, formationInstanceId);
        if (!formation || resolveFormationRemainingQiBudget(formation) <= 0) {
            return null;
        }
        const normalizedDamage = Math.max(0, Number(damage) || 0);
        const selfDamageReduction = this.resolveFormationSelfDamageReduction(formation);
        const mitigatedDamage = selfDamageReduction > 0
            ? Math.max(0, normalizedDamage * (1 - selfDamageReduction))
            : normalizedDamage;
        const damagePerAura = resolveFormationDamagePerAura(formation.template);
        const auraDamage = mitigatedDamage / damagePerAura;
        if (auraDamage <= 0) {
            return {
                formation,
                appliedDamage: 0,
                auraDamage: 0,
                destroyed: false,
                remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
                damagePerAura,
                selfDamageReduction,
            };
        }
        const appliedAuraDamage = Math.min(resolveFormationRemainingQiBudget(formation), auraDamage);
        const appliedDamage = appliedAuraDamage * damagePerAura;
        setFormationRemainingQiBudget(formation, Math.max(0, resolveFormationRemainingQiBudget(formation) - appliedAuraDamage));
        formation.updatedAt = Date.now();
        const destroyed = resolveFormationRemainingQiBudget(formation) <= 0;
        if (destroyed) {
            setFormationRemainingQiBudget(formation, 0);
            formation.active = false;
            this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                text: `${formation.name}阵眼灵力耗尽，阵势关闭。`,
                kind: 'warning',
            });
            if (typeof deps?.refreshPlayerContextActions === 'function') {
                deps.refreshPlayerContextActions(formation.ownerPlayerId);
                if (attackerPlayerId && attackerPlayerId !== formation.ownerPlayerId) {
                    deps.refreshPlayerContextActions(attackerPlayerId);
                }
            }
        }
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        if (normalizeInstanceId(formation.eyeInstanceId) && normalizeInstanceId(formation.eyeInstanceId) !== formation.instanceId) {
            touchRuntimeInstanceRevision(deps, formation.eyeInstanceId);
        }
        this.persistInstanceFormationsSoon(formation.instanceId);
        return {
            formation,
            appliedDamage,
            auraDamage: appliedAuraDamage,
            destroyed,
            remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
            damagePerAura,
            selfDamageReduction,
            attackerPlayerId,
        };
    }

    listRuntimeFormations(instanceId) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        const result = (this.formationsByInstanceId.get(normalizedInstanceId) ?? [])
            .map((formation) => getRuntimeFormationProjection(formation, 'effect'));
        for (const [sourceInstanceId, formations] of this.formationsByInstanceId.entries()) {
            if (sourceInstanceId === normalizedInstanceId) {
                continue;
            }
            for (const formation of formations) {
                if (!isPersistentFormation(formation) || normalizeInstanceId(formation.eyeInstanceId) !== normalizedInstanceId) {
                    continue;
                }
                result.push(getRuntimeFormationProjection(formation, 'eye'));
            }
        }
        return result;
    }

    listOwnedFormationsAt(instanceId, ownerPlayerId, x, y) {
        return (this.formationsByInstanceId.get(instanceId) ?? [])
            .filter((formation) => formation.ownerPlayerId === ownerPlayerId
            && !isPersistentFormation(formation)
            && formation.x === Math.trunc(x)
            && formation.y === Math.trunc(y))
            .map((formation) => ({
            id: formation.id,
            name: formation.name,
            active: formation.active,
            remainingAuraBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
            remainingQiBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
            remainingSpiritStoneBudget: Math.max(0, Math.floor(resolveFormationRemainingSpiritStoneBudget(formation))),
            radius: formation.stats.radius,
            refillSpiritStoneCount: Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1)),
            refillQiCost: resolveFormationQiCost(Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1)), formation.template),
            refillQiBudget: resolveFormationQiCost(Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1)), formation.template),
        }));
    }

    advanceAuraFormation(instance, formation) {
        const resourceKey = formation.template.effect.resourceKey || DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY;
        const halfLifeTicks = Math.max(1, Math.trunc(formation.template.effect.convergenceHalfLifeTicks ?? FORMATION_TICKS_PER_DAY));
        forEachFormationAffectedRuntimeCell(instance, formation, (x, y) => {
            const current = instance.getTileResource(resourceKey, x, y) ?? 0;
            const target = Math.max(0, formation.stats.effectValue);
            if (current >= target) {
                return;
            }
            const delta = Math.max(1, Math.ceil((target - current) / halfLifeTicks));
            instance.addTileResource(resourceKey, x, y, Math.min(delta, target - current));
        });
    }

    containsTile(formation, x, y) {
        const dx = Math.trunc(x) - formation.x;
        const dy = Math.trunc(y) - formation.y;
        const radius = formation.stats.radius;
        if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
            return false;
        }
        if (formation.template.range.shape === 'circle') {
            return (dx * dx) + (dy * dy) <= radius * radius;
        }
        if (formation.template.range.shape === 'checkerboard') {
            return ((Math.trunc(x) + Math.trunc(y)) % 2) === 0;
        }
        return true;
    }

    containsBoundaryTile(formation, x, y) {
        if (!this.containsTile(formation, x, y)) {
            return false;
        }
        const tileX = Math.trunc(x);
        const tileY = Math.trunc(y);
        const dx = tileX - formation.x;
        const dy = tileY - formation.y;
        const radius = Math.max(1, Math.trunc(Number(formation.stats?.radius) || 1));
        if (formation.template.range.shape === 'circle') {
            return (dx * dx) + (dy * dy) <= radius * radius
                && (
                    ((dx + 1) * (dx + 1)) + (dy * dy) > radius * radius
                    || ((dx - 1) * (dx - 1)) + (dy * dy) > radius * radius
                    || (dx * dx) + ((dy + 1) * (dy + 1)) > radius * radius
                    || (dx * dx) + ((dy - 1) * (dy - 1)) > radius * radius
                );
        }
        if (formation.template.range.shape === 'checkerboard') {
            return Math.abs(dx) === radius || Math.abs(dy) === radius;
        }
        return Math.abs(dx) === radius || Math.abs(dy) === radius;
    }

    findBoundaryBarrierFormation(instanceId, x, y, playerId = null) {
        const formations = this.formationsByInstanceId.get(instanceId);
        if (!formations || formations.length <= 0) {
            return null;
        }
        let selected = null;
        for (const formation of formations) {
            if (formation.active !== true
                || formation.template.effect.kind !== BOUNDARY_BARRIER_EFFECT_KIND
                || resolveFormationRemainingQiBudget(formation) <= 0) {
                continue;
            }
            if (!this.containsBoundaryTile(formation, x, y)) {
                continue;
            }
            if (this.canPlayerPassFormationBoundary(formation, playerId)) {
                continue;
            }
            if (!selected || resolveFormationRemainingQiBudget(formation) > resolveFormationRemainingQiBudget(selected)) {
                selected = formation;
            }
        }
        return selected;
    }

    canPlayerPassFormationBoundary(formation, playerId) {
        if (!formation || !playerId || formation.template?.access?.kind !== 'sect_members') {
            return false;
        }
        const formationSectId = normalizeOptionalString(formation.ownerSectId ?? formation.template?.access?.sectId);
        if (!formationSectId) {
            return false;
        }
        const formationOwnerPlayerId = normalizeOptionalString(formation.ownerPlayerId);
        if (formationOwnerPlayerId && formationOwnerPlayerId === normalizeOptionalString(playerId)) {
            return true;
        }
        let player = null;
        try {
            player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        }
        catch (_error) {
            return false;
        }
        return resolvePlayerSectId(player) === formationSectId;
    }

    getFormationList(instanceId) {
        let formations = this.formationsByInstanceId.get(instanceId);
        if (!formations) {
            formations = [];
            this.formationsByInstanceId.set(instanceId, formations);
        }
        return formations;
    }

    async restoreInstanceFormations(instanceId) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        if (!normalizedInstanceId) {
            return 0;
        }
        const document = await this.loadInstanceFormationDocument(normalizedInstanceId);
        const entries = Array.isArray(document?.formations) ? document.formations : [];
        const restored = [];
        let maxSerial = this.nextFormationSerial - 1;
        for (const entry of entries) {
            const formation = this.restoreFormationEntry(normalizedInstanceId, entry);
            if (!formation) {
                continue;
            }
            restored.push(formation);
            maxSerial = Math.max(maxSerial, extractFormationSerial(formation.id));
        }
        if (restored.length > 0) {
            this.formationsByInstanceId.set(normalizedInstanceId, restored);
            this.nextFormationSerial = Math.max(this.nextFormationSerial, maxSerial + 1);
        } else {
            this.formationsByInstanceId.delete(normalizedInstanceId);
        }
        this.restoredFormationInstanceIds.add(normalizedInstanceId);
        return restored.length;
    }

    restoreFormationEntry(instanceId, entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const formationId = typeof entry.formationId === 'string' ? entry.formationId.trim() : '';
        if (!formationId) {
            return null;
        }
        let template = null;
        try {
            template = this.resolveFormationTemplate(formationId);
        } catch (_error) {
            this.logger.warn(`恢复阵法条目模板解析失败 formationId=${formationId}: ${_error instanceof Error ? _error.message : String(_error)}`);
            return null;
        }
        const diskTier = normalizeFormationDiskTier(entry.diskTier);
        const diskMultiplier = Number.isFinite(Number(entry.diskMultiplier)) ? Math.max(1, Number(entry.diskMultiplier)) : 1;
        const lifecycle = normalizeFormationLifecycle(entry.lifecycle ?? template.lifecycle);
        const rawRemainingQiBudget = Number.isFinite(Number(entry.remainingQiBudget ?? entry.remainingAuraBudget))
            ? Math.max(0, Number(entry.remainingQiBudget ?? entry.remainingAuraBudget))
            : null;
        const rawRemainingSpiritStoneBudget = Number.isFinite(Number(entry.remainingSpiritStoneBudget))
            ? Math.max(0, Number(entry.remainingSpiritStoneBudget))
            : null;
        const rawSpiritStoneCount = Math.max(1, Math.trunc(Number(entry.spiritStoneCount) || 1));
        const minSpiritStoneCount = resolveFormationMinSpiritStoneCount(template);
        const spiritStoneCount = lifecycle === FORMATION_LIFECYCLE_PERSISTENT
            && template.id === 'sect_guardian_barrier'
            && rawSpiritStoneCount <= minSpiritStoneCount
            && rawRemainingQiBudget !== null
            && rawRemainingQiBudget > rawSpiritStoneCount * resolveFormationAuraPerSpiritStone(template)
            ? Math.max(rawSpiritStoneCount, Math.ceil(rawRemainingQiBudget / resolveFormationAuraPerSpiritStone(template)))
            : rawSpiritStoneCount;
        const allocationPayload = entry.allocation && typeof entry.allocation === 'object' ? entry.allocation : {};
        const allocation = typeof isFormationSetupInput === 'function' && isFormationSetupInput(allocationPayload)
            ? normalizeFormationSetup(template, allocationPayload)
            : normalizeFormationAllocation(allocationPayload);
        const stats = resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        if (template.id === 'sect_guardian_barrier') {
            stats.radius = Math.max(1, Math.trunc(Number(entry.radius) || 1));
        }
        const remainingQiBudget = rawRemainingQiBudget !== null ? rawRemainingQiBudget : stats.totalQiBudget ?? stats.totalAuraBudget;
        const remainingSpiritStoneBudget = rawRemainingSpiritStoneBudget !== null ? rawRemainingSpiritStoneBudget : stats.totalSpiritStoneBudget ?? spiritStoneCount;
        if (remainingSpiritStoneBudget <= 0) {
            return null;
        }
        const restoredId = typeof entry.id === 'string' && entry.id.trim()
            ? entry.id.trim()
            : `formation:${instanceId}:${this.nextFormationSerial++}`;
        const x = firstFiniteInteger(entry.x);
        const y = firstFiniteInteger(entry.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        return {
            instanceId,
            id: restoredId,
            ownerPlayerId: typeof entry.ownerPlayerId === 'string' ? entry.ownerPlayerId : '',
            ownerSectId: normalizeOptionalString(entry.ownerSectId),
            formationId: template.id,
            lifecycle,
            name: template.name,
            template,
            diskItemId: typeof entry.diskItemId === 'string' ? entry.diskItemId : '',
            diskTier,
            diskMultiplier,
            spiritStoneCount,
            qiCost: Math.max(0, Math.trunc(Number(entry.qiCost) || 0)),
            x,
            y,
            eyeInstanceId: normalizeInstanceId(entry.eyeInstanceId) || instanceId,
            eyeX: firstFiniteInteger(entry.eyeX, x),
            eyeY: firstFiniteInteger(entry.eyeY, y),
            allocation,
            stats,
            active: remainingQiBudget <= 0 ? false : entry.active !== false,
            remainingQiBudget,
            remainingSpiritStoneBudget,
            remainingAuraBudget: remainingQiBudget,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
        };
    }

    private _formationPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();

    persistInstanceFormationsSoon(instanceId) {
        if (this._formationPersistTimers.has(instanceId)) return;
        this._formationPersistTimers.set(instanceId, setTimeout(() => {
            this._formationPersistTimers.delete(instanceId);
            void this.saveInstanceFormations(instanceId).catch((error) => {
                this.logger.warn(`阵法持久化失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
            });
        }, 5000));
    }

    persistFormationSnapshotSoon(formation) {
        void this.saveFormationSnapshot(formation).catch((error) => {
            this.logger.warn(`阵法单体持久化失败：${formation?.instanceId ?? ''} ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    /**
     * releaseInstance：实例销毁/fencing 卸载收口，清理内存中按 instanceId 索引的阵法状态。
     * 防止 destroyManagedInstance / fenceInstanceRuntime 卸载实例时遗留 formationsByInstanceId 与
     * restoredFormationInstanceIds 条目，避免随实例流转无界增长。
     * 仅在没有持续性阵法（持续性阵法以阵眼实例为准，不应跟随承载实例销毁丢失）时清理；持续性阵法
     * 转入 active=false 的标记，等待持久化层在阵眼销毁路径上单独清理。
     */
    releaseInstance(instanceId) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        if (!normalizedInstanceId) {
            return;
        }
        // 清理 pending persist timer，避免实例销毁后悬挂 timer 持有闭包引用
        const pendingTimer = this._formationPersistTimers.get(normalizedInstanceId);
        if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            this._formationPersistTimers.delete(normalizedInstanceId);
        }
        const formations = this.formationsByInstanceId.get(normalizedInstanceId);
        if (Array.isArray(formations) && formations.length > 0) {
            // 实例已销毁，承载阵法对象再保留也无处广播；统一释放避免悬挂。
            // 持续性阵法的真源在持久化层，此处不写盘，让阵眼路径或下次重启的 reloadInstance 决定恢复策略。
            this.formationsByInstanceId.delete(normalizedInstanceId);
        } else {
            this.formationsByInstanceId.delete(normalizedInstanceId);
        }
        this.restoredFormationInstanceIds.delete(normalizedInstanceId);
    }

    async saveFormationSnapshot(formation) {
        if (!formation) {
            return;
        }
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return;
        }
        await ensureInstanceFormationStateTable(pool);
        const serialized = serializeFormation(formation);
        const normalizedInstanceId = normalizeInstanceId(serialized.instanceId);
        if (!normalizedInstanceId || !serialized.id) {
            return;
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await upsertFormationStateRow(client, normalizedInstanceId, serialized);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async saveInstanceFormations(instanceId) {
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return;
        }
        await ensureInstanceFormationStateTable(pool);
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        if (!normalizedInstanceId) {
            return;
        }
        const canReplaceInstanceRows = this.restoredFormationInstanceIds.has(normalizedInstanceId);
        const formations = (this.formationsByInstanceId.get(normalizedInstanceId) ?? []).map((formation) => serializeFormation(formation));
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (canReplaceInstanceRows) {
                await client.query(`DELETE FROM ${INSTANCE_FORMATION_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
            }
            for (const formation of formations) {
                await upsertFormationStateRow(client, normalizedInstanceId, formation);
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
        if (formations.length === 0) {
            return;
        }
    }

    async loadInstanceFormationDocument(instanceId) {
        const pool = await this.ensurePersistencePool();
        if (!pool) {
            return null;
        }
        await ensureInstanceFormationStateTable(pool);
        const result = await pool.query(`
            SELECT
                formation_instance_id,
                owner_player_id,
                owner_sect_id,
                formation_id,
                lifecycle,
                disk_item_id,
                disk_tier,
                disk_multiplier,
                spirit_stone_count,
                qi_cost,
                x,
                y,
                eye_instance_id,
                eye_x,
                eye_y,
                allocation_payload,
                active,
                remaining_aura_budget,
                remaining_qi_budget,
                remaining_spirit_stone_budget,
                created_at_ms,
                updated_at_ms
            FROM ${INSTANCE_FORMATION_STATE_TABLE}
            WHERE instance_id = $1
            ORDER BY formation_instance_id ASC
        `, [instanceId]);
        return {
            formations: (result.rows ?? []).map((row) => ({
                id: row.formation_instance_id,
                ownerPlayerId: row.owner_player_id,
                ownerSectId: row.owner_sect_id,
                formationId: row.formation_id,
                lifecycle: row.lifecycle,
                diskItemId: row.disk_item_id,
                diskTier: row.disk_tier,
                diskMultiplier: Number(row.disk_multiplier),
                spiritStoneCount: Number(row.spirit_stone_count),
                qiCost: Number(row.qi_cost),
                x: Number(row.x),
                y: Number(row.y),
                eyeInstanceId: row.eye_instance_id,
                eyeX: Number(row.eye_x),
                eyeY: Number(row.eye_y),
                allocation: row.allocation_payload ?? {},
                active: row.active !== false,
                remainingAuraBudget: Number(row.remaining_aura_budget),
                remainingQiBudget: Number(row.remaining_qi_budget),
                remainingSpiritStoneBudget: Number(row.remaining_spirit_stone_budget),
                createdAt: Number(row.created_at_ms),
                updatedAt: Number(row.updated_at_ms),
            })),
        };
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
        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool?.('formation') ?? null;
        if (!sharedPool) {
            this.logger.warn('阵法持久化已禁用：数据库连接池提供者未提供连接池');
            return;
        }
        try {
            await ensureInstanceFormationStateTable(sharedPool);
            this.persistencePool = sharedPool;
            this.persistenceReady = true;
        } catch (error) {
            this.logger.warn(`阵法持久化初始化失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async closePersistencePool() {
        // 清理所有 pending persist timers，避免 pool 释放后 timer 触发错误。
        for (const [instanceId, timer] of this._formationPersistTimers) {
            clearTimeout(timer);
        }
        this._formationPersistTimers.clear();

        if (this.persistenceReady && this.persistencePool) {
            const instanceIds = Array.from(this.formationsByInstanceId.keys());
            for (const instanceId of instanceIds) {
                if (!this.restoredFormationInstanceIds.has(normalizeInstanceId(instanceId))) {
                    continue;
                }
                await this.saveInstanceFormations(instanceId).catch((error) => {
                    this.logger.warn(`关闭前阵法刷盘失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
                });
            }
        }
        // 共享连接池由 DatabasePoolProvider 统一关闭，此处只释放引用。
        this.persistencePool = null;
        this.persistenceReady = false;
    }

    findOwnedFormation(playerId, formationInstanceId) {
        const normalizedId = typeof formationInstanceId === 'string' ? formationInstanceId.trim() : '';
        if (!normalizedId) {
            throw new BadRequestException('阵法实例 ID 不能为空');
        }
        for (const formations of this.formationsByInstanceId.values()) {
            const formation = formations.find((entry) => entry.id === normalizedId);
            if (!formation) {
                continue;
            }
            if (formation.ownerPlayerId !== playerId) {
                throw new ForbiddenException('不能操作他人的阵法');
            }
            return formation;
        }
        throw new NotFoundException('阵法不存在');
    }

    findFormationInInstance(instanceId, formationInstanceId) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        const normalizedId = typeof formationInstanceId === 'string' ? formationInstanceId.trim() : '';
        if (!normalizedInstanceId || !normalizedId) {
            return null;
        }
        const direct = (this.formationsByInstanceId.get(normalizedInstanceId) ?? []).find((entry) => entry.id === normalizedId);
        if (direct) {
            return direct;
        }
        for (const formations of this.formationsByInstanceId.values()) {
            const byEye = formations.find((entry) => entry.id === normalizedId
                && isPersistentFormation(entry)
                && normalizeInstanceId(entry.eyeInstanceId) === normalizedInstanceId);
            if (byEye) {
                return byEye;
            }
        }
        return null;
    }

    findFormationByInstanceOrId(instanceId, formationInstanceId) {
        const normalizedId = typeof formationInstanceId === 'string' ? formationInstanceId.trim() : '';
        if (!normalizedId) {
            return null;
        }
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        if (normalizedInstanceId) {
            return this.findFormationInInstance(normalizedInstanceId, normalizedId);
        }
        for (const formations of this.formationsByInstanceId.values()) {
            const formation = formations.find((entry) => entry.id === normalizedId);
            if (formation) {
                return formation;
            }
        }
        return null;
    }

    resolveFormationTemplate(formationId) {
        const normalizedId = typeof formationId === 'string' ? formationId.trim() : '';
        if (!normalizedId) {
            throw new BadRequestException('阵法 ID 不能为空');
        }
        const configured = typeof this.contentTemplateRepository.getFormationTemplate === 'function'
            ? this.contentTemplateRepository.getFormationTemplate(normalizedId)
            : null;
        const template = configured ?? getFormationTemplateById(normalizedId);
        if (!template) {
            throw new NotFoundException(`阵法不存在：${normalizedId}`);
        }
        return template;
    }

    assertCanPay(playerId, qiCost, spiritStoneCount) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.qi < qiCost) {
            throw new NotFoundException('灵力不足');
        }
        if (!this.playerRuntimeService.canAffordWallet(playerId, FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount)) {
            throw new NotFoundException('灵石不足');
        }
    }

    assertCanInject(playerId, qiAmount, spiritStoneCount) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (qiAmount > 0 && player.qi < qiAmount) {
            throw new NotFoundException('灵力不足');
        }
        if (spiritStoneCount > 0 && !this.playerRuntimeService.canAffordWallet(playerId, FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount)) {
            throw new NotFoundException('灵石不足');
        }
    }
}
export { WorldRuntimeFormationService };

async function ensureInstanceFormationStateTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${INSTANCE_FORMATION_STATE_TABLE} (
            instance_id varchar(100) NOT NULL,
            formation_instance_id varchar(180) NOT NULL,
            owner_player_id varchar(100) NOT NULL,
            owner_sect_id varchar(100) NULL,
            formation_id varchar(100) NOT NULL,
            lifecycle varchar(32) NOT NULL DEFAULT 'deployed',
            disk_item_id varchar(100) NOT NULL,
            disk_tier varchar(32) NOT NULL,
            disk_multiplier double precision NOT NULL DEFAULT 1,
            spirit_stone_count bigint NOT NULL DEFAULT 0,
            qi_cost double precision NOT NULL DEFAULT 0,
            x bigint NOT NULL,
            y bigint NOT NULL,
            eye_instance_id varchar(100) NOT NULL,
            eye_x bigint NOT NULL,
            eye_y bigint NOT NULL,
            allocation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            active boolean NOT NULL DEFAULT true,
            remaining_aura_budget double precision NOT NULL DEFAULT 0,
            remaining_qi_budget double precision NOT NULL DEFAULT 0,
            remaining_spirit_stone_budget double precision NOT NULL DEFAULT 0,
            created_at_ms bigint NOT NULL DEFAULT 0,
            updated_at_ms bigint NOT NULL DEFAULT 0,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (instance_id, formation_instance_id)
        )
    `);
    await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS lifecycle varchar(32) NOT NULL DEFAULT 'deployed'
    `);
    await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS remaining_qi_budget double precision NOT NULL DEFAULT 0
    `);
    await pool.query(`
        ALTER TABLE ${INSTANCE_FORMATION_STATE_TABLE}
        ADD COLUMN IF NOT EXISTS remaining_spirit_stone_budget double precision NOT NULL DEFAULT 0
    `);
    for (const column of INSTANCE_FORMATION_STATE_BIGINT_COLUMNS) {
        await ensureBigintColumnType(pool, INSTANCE_FORMATION_STATE_TABLE, column);
    }
    for (const column of INSTANCE_FORMATION_STATE_DOUBLE_COLUMNS) {
        await ensureDoubleColumnType(pool, INSTANCE_FORMATION_STATE_TABLE, column);
    }
    await pool.query(`
        CREATE INDEX IF NOT EXISTS instance_formation_state_instance_idx
        ON ${INSTANCE_FORMATION_STATE_TABLE}(instance_id, formation_id)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS instance_formation_state_owner_idx
        ON ${INSTANCE_FORMATION_STATE_TABLE}(owner_player_id, owner_sect_id)
    `);
}

function normalizeSlotIndex(input) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException('槽位索引无效');
    }
    return value;
}

function normalizePositiveInteger(input, label) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value <= 0) {
        throw new BadRequestException(`${label}必须大于 0`);
    }
    return value;
}

function normalizeNonNegativeInteger(input) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException('灵力消耗不能为负');
    }
    return value;
}

function resolveFormationPlacement(playerId, player, location, instance) {
    const runtimePosition = typeof instance?.getPlayerPosition === 'function'
        ? instance.getPlayerPosition(playerId)
        : null;
    const x = firstFiniteInteger(runtimePosition?.x, player?.x, location?.x);
    const y = firstFiniteInteger(runtimePosition?.y, player?.y, location?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new BadRequestException('无法确认布阵坐标');
    }
    return { x, y };
}

function firstFiniteInteger(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') {
            continue;
        }
        const normalized = Math.trunc(Number(value));
        if (Number.isFinite(normalized)) {
            return normalized;
        }
    }
    return Number.NaN;
}

function normalizeInstanceId(input) {
    return typeof input === 'string' ? input.trim() : '';
}

function normalizeOptionalString(input) {
    return typeof input === 'string' && input.trim() ? input.trim() : '';
}

function resolvePlayerSectId(player) {
    return normalizeOptionalString(player?.sectId)
        || normalizeOptionalString(player?.sect?.id)
        || normalizeOptionalString(player?.sect?.sectId)
        || normalizeOptionalString(player?.ownerSectId)
        || normalizeOptionalString(player?.guildId)
        || normalizeOptionalString(player?.clanId);
}

function assertCanPlaceFormationInInstance(instance) {
    if (isVirtualPublicWorldInstance(instance)) {
        throw new BadRequestException('虚境不能布置阵法，请前往现世。');
    }
}

function isVirtualPublicWorldInstance(instance) {
    const meta = instance?.meta ?? instance;
    const instanceId = normalizeInstanceId(meta?.instanceId ?? instance?.instanceId);
    const kind = normalizeOptionalString(meta?.kind ?? instance?.kind);
    const linePreset = normalizeOptionalString(meta?.linePreset ?? instance?.linePreset);
    const isPublicWorld = kind === 'public' || instanceId.startsWith('public:') || instanceId.startsWith('line:');
    if (!isPublicWorld) {
        return false;
    }
    return linePreset !== 'real' && !instanceId.startsWith('real:') && !instanceId.includes(':real:');
}

function normalizeFormationDiskTier(input) {
    if (input === 'mortal' || input === 'yellow' || input === 'mystic' || input === 'earth') {
        return input;
    }
    return 'mortal';
}

function normalizeFormationLifecycle(input) {
    return input === FORMATION_LIFECYCLE_PERSISTENT ? FORMATION_LIFECYCLE_PERSISTENT : FORMATION_LIFECYCLE_DEPLOYED;
}

function resolveFormationLifecycle(template) {
    return typeof resolveSharedFormationLifecycle === 'function'
        ? resolveSharedFormationLifecycle(template)
        : normalizeFormationLifecycle(template?.lifecycle);
}

function isPersistentFormation(formation) {
    return normalizeFormationLifecycle(formation?.lifecycle ?? formation?.template?.lifecycle) === FORMATION_LIFECYCLE_PERSISTENT;
}

function isActiveTerrainStabilizerFormation(formation) {
    return formation?.active === true
        && formation?.template?.effect?.kind === TERRAIN_STABILIZER_EFFECT_KIND
        && resolveFormationRemainingQiBudget(formation) > 0
        && resolveFormationRemainingSpiritStoneBudget(formation) > 0;
}

function forEachFormationAffectedRuntimeCell(instance, formation, visitor) {
    const shape = formation?.template?.range?.shape;
    const centerX = Math.trunc(Number(formation?.x));
    const centerY = Math.trunc(Number(formation?.y));
    const radius = Math.max(1, Math.trunc(Number(formation?.stats?.radius) || 1));
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || typeof visitor !== 'function') {
        return;
    }
    const hasRuntimeBounds = typeof instance?.isInBounds === 'function';
    const width = Math.max(0, Math.trunc(Number(instance?.template?.width) || 0));
    const height = Math.max(0, Math.trunc(Number(instance?.template?.height) || 0));
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
            if (!isFormationAffectedCell(shape, centerX, centerY, x, y, radius)) {
                continue;
            }
            if (hasRuntimeBounds) {
                if (instance.isInBounds(x, y) !== true) {
                    continue;
                }
            } else if (x < 0 || y < 0 || x >= width || y >= height) {
                continue;
            }
            visitor(x, y);
        }
    }
}

function isFormationAffectedCell(shape, centerX, centerY, x, y, radius) {
    const dx = Math.trunc(Number(x)) - centerX;
    const dy = Math.trunc(Number(y)) - centerY;
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
        return false;
    }
    if (shape === 'circle') {
        return (dx * dx) + (dy * dy) <= radius * radius;
    }
    if (shape === 'checkerboard') {
        return ((Math.trunc(Number(x)) + Math.trunc(Number(y))) % 2) === 0;
    }
    return true;
}

function resolveFormationTickCost(formation) {
    const stats = formation?.stats ?? {};
    if (formation?.active === false) {
        return {
            qiCost: Math.max(0, Number(stats.tickInactiveQiCost ?? stats.tickInactiveCost) || 0),
            spiritStoneCost: Math.max(0, Number(stats.tickInactiveSpiritStoneCost) || 0),
        };
    }
    return {
        qiCost: Math.max(0, Number(stats.tickActiveQiCost ?? stats.tickActiveCost) || 0),
        spiritStoneCost: Math.max(0, Number(stats.tickActiveSpiritStoneCost) || 0),
    };
}

function resolvePersistentFormationTickCost(formation) {
    const remainingQiBudget = resolveFormationRemainingQiBudget(formation);
    const remainingSpiritStoneBudget = resolveFormationRemainingSpiritStoneBudget(formation);
    const activeRate = PERSISTENT_FORMATION_ACTIVE_DECAY_RATE_SCALED / QI_HALF_LIFE_RATE_SCALE;
    const rate = formation?.active === false
        ? activeRate / PERSISTENT_FORMATION_INACTIVE_DECAY_DIVISOR
        : activeRate;
    return {
        qiCost: remainingQiBudget <= 0 ? 0 : Math.min(remainingQiBudget, remainingQiBudget * rate),
        spiritStoneCost: remainingSpiritStoneBudget <= 0 ? 0 : Math.min(remainingSpiritStoneBudget, remainingSpiritStoneBudget * rate),
    };
}

function resolveFormationRemainingQiBudget(formation) {
    return Math.max(0, Number(formation?.remainingQiBudget ?? formation?.remainingAuraBudget) || 0);
}

function resolveFormationRemainingSpiritStoneBudget(formation) {
    return Math.max(0, Number(formation?.remainingSpiritStoneBudget ?? formation?.spiritStoneCount) || 0);
}

function setFormationRemainingQiBudget(formation, value) {
    const normalized = Math.max(0, Number(value) || 0);
    formation.remainingQiBudget = normalized;
    formation.remainingAuraBudget = normalized;
}

function setFormationRemainingSpiritStoneBudget(formation, value) {
    formation.remainingSpiritStoneBudget = Math.max(0, Number(value) || 0);
}

function buildRuntimeFormationProjection(formation, role = 'effect') {
    const lifecycle = normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle);
    const isEyeProjection = role === 'eye';
    const visual = resolveFormationRuntimeVisual(formation.template);
    return {
        id: formation.id,
        ownerPlayerId: formation.ownerPlayerId,
        ownerSectId: formation.ownerSectId ?? null,
        formationId: formation.formationId,
        lifecycle,
        name: isEyeProjection ? `${formation.name}阵眼` : formation.name,
        x: isEyeProjection && Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
        y: isEyeProjection && Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
        eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
        eyeX: Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
        eyeY: Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
        radius: isEyeProjection ? 1 : formation.stats.radius,
        rangeShape: formation.template.range.shape,
        ...visual,
        active: formation.active,
        blocksBoundary: !isEyeProjection && formation.template.effect.kind === BOUNDARY_BARRIER_EFFECT_KIND,
        damagePerAura: resolveFormationDamagePerAura(formation.template),
        remainingAuraBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
        remainingQiBudget: Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation))),
        remainingSpiritStoneBudget: Math.max(0, Math.floor(resolveFormationRemainingSpiritStoneBudget(formation))),
    };
}

function getRuntimeFormationProjection(formation, role = 'effect') {
    const cacheKey = role === 'eye' ? 'eye' : 'effect';
    const lifecycle = normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle);
    const isEyeProjection = role === 'eye';
    const x = isEyeProjection && Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x;
    const y = isEyeProjection && Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y;
    const eyeX = Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x;
    const eyeY = Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y;
    const remainingAuraBudget = Math.max(0, Math.floor(resolveFormationRemainingQiBudget(formation)));
    const remainingSpiritStoneBudget = Math.max(0, Math.floor(resolveFormationRemainingSpiritStoneBudget(formation)));
    const cachedByRole = runtimeFormationProjectionCache.get(formation);
    const cached = cachedByRole?.[cacheKey];
    if (cached
        && cached.lifecycle === lifecycle
        && cached.name === formation.name
        && cached.ownerPlayerId === formation.ownerPlayerId
        && cached.ownerSectId === (formation.ownerSectId ?? null)
        && cached.formationId === formation.formationId
        && cached.x === x
        && cached.y === y
        && cached.eyeInstanceId === (formation.eyeInstanceId ?? formation.instanceId)
        && cached.eyeX === eyeX
        && cached.eyeY === eyeY
        && cached.radius === (isEyeProjection ? 1 : formation.stats.radius)
        && cached.rangeShape === formation.template.range.shape
        && cached.active === formation.active
        && cached.remainingAuraBudget === remainingAuraBudget
        && cached.remainingSpiritStoneBudget === remainingSpiritStoneBudget) {
        return cached.projection;
    }
    const projection = freezeRuntimeProjection(buildRuntimeFormationProjection(formation, role));
    runtimeFormationProjectionCache.set(formation, {
        ...(cachedByRole ?? {}),
        [cacheKey]: {
            lifecycle,
            name: formation.name,
            ownerPlayerId: formation.ownerPlayerId,
            ownerSectId: formation.ownerSectId ?? null,
            formationId: formation.formationId,
            x,
            y,
            eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
            eyeX,
            eyeY,
            radius: isEyeProjection ? 1 : formation.stats.radius,
            rangeShape: formation.template.range.shape,
            active: formation.active,
            remainingAuraBudget,
            remainingSpiritStoneBudget,
            projection,
        },
    });
    return projection;
}

function freezeRuntimeProjection(projection) {
    if (process.env.NODE_ENV !== 'production') {
        return Object.freeze(projection);
    }
    return projection;
}

function resolveFormationRuntimeVisual(template) {
    const visual: any = typeof resolveFormationVisual === 'function'
        ? resolveFormationVisual(template)
        : { char: '◎', color: '#4da3ff', showText: true, rangeHighlightColor: '#3b82f6' };
    return {
        char: visual.char,
        color: visual.color,
        showText: visual.showText !== false,
        rangeHighlightColor: visual.rangeHighlightColor,
        boundaryChar: visual.boundaryChar,
        boundaryColor: visual.boundaryColor,
        boundaryRangeHighlightColor: visual.boundaryRangeHighlightColor,
        eyeVisibleWithoutSenseQi: visual.eyeVisibleWithoutSenseQi === true,
        rangeVisibleWithoutSenseQi: visual.rangeVisibleWithoutSenseQi === true,
        boundaryVisibleWithoutSenseQi: visual.boundaryVisibleWithoutSenseQi === true,
    };
}

function resolveFormationAuraPerSpiritStone(template) {
    return typeof resolveFormationCostConfig === 'function'
        ? resolveFormationCostConfig(template).auraPerSpiritStone
        : FORMATION_AURA_PER_SPIRIT_STONE;
}

function resolveFormationRefillAuraBudget(formation, spiritStoneCount) {
    if (typeof isFormationSetupInput === 'function' && isFormationSetupInput(formation?.allocation)) {
        return Math.max(1, Math.round(Number(formation?.stats?.totalAuraBudget) || 1));
    }
    return Math.round(Math.max(1, Math.trunc(Number(spiritStoneCount) || 1)) * resolveFormationAuraPerSpiritStone(formation.template) * formation.diskMultiplier);
}

function serializeFormation(formation) {
    return {
        instanceId: formation.instanceId,
        id: formation.id,
        ownerPlayerId: formation.ownerPlayerId,
        ownerSectId: formation.ownerSectId ?? null,
        formationId: formation.formationId,
        lifecycle: normalizeFormationLifecycle(formation.lifecycle ?? formation.template?.lifecycle),
        diskItemId: formation.diskItemId,
        diskTier: formation.diskTier,
        diskMultiplier: formation.diskMultiplier,
        spiritStoneCount: formation.spiritStoneCount,
        qiCost: formation.qiCost,
        x: formation.x,
        y: formation.y,
        eyeInstanceId: formation.eyeInstanceId ?? formation.instanceId,
        eyeX: Number.isFinite(Number(formation.eyeX)) ? Math.trunc(Number(formation.eyeX)) : formation.x,
        eyeY: Number.isFinite(Number(formation.eyeY)) ? Math.trunc(Number(formation.eyeY)) : formation.y,
        allocation: { ...formation.allocation },
        active: formation.active !== false,
        remainingAuraBudget: resolveFormationRemainingQiBudget(formation),
        remainingQiBudget: resolveFormationRemainingQiBudget(formation),
        remainingSpiritStoneBudget: resolveFormationRemainingSpiritStoneBudget(formation),
        radius: Math.max(1, Math.trunc(Number(formation.stats?.radius) || 1)),
        createdAt: formation.createdAt,
        updatedAt: formation.updatedAt,
    };
}

async function upsertFormationStateRow(client, instanceId, formation) {
    await client.query(`
        INSERT INTO ${INSTANCE_FORMATION_STATE_TABLE}(
            instance_id,
            formation_instance_id,
            owner_player_id,
            owner_sect_id,
            formation_id,
            lifecycle,
            disk_item_id,
            disk_tier,
            disk_multiplier,
            spirit_stone_count,
            qi_cost,
            x,
            y,
            eye_instance_id,
            eye_x,
            eye_y,
            allocation_payload,
            active,
            remaining_aura_budget,
            remaining_qi_budget,
            remaining_spirit_stone_budget,
            created_at_ms,
            updated_at_ms,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17::jsonb, $18, $19, $20, $21, $22, $23, now()
        )
        ON CONFLICT (instance_id, formation_instance_id)
        DO UPDATE SET
            owner_player_id = EXCLUDED.owner_player_id,
            owner_sect_id = EXCLUDED.owner_sect_id,
            formation_id = EXCLUDED.formation_id,
            lifecycle = EXCLUDED.lifecycle,
            disk_item_id = EXCLUDED.disk_item_id,
            disk_tier = EXCLUDED.disk_tier,
            disk_multiplier = EXCLUDED.disk_multiplier,
            spirit_stone_count = EXCLUDED.spirit_stone_count,
            qi_cost = EXCLUDED.qi_cost,
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            eye_instance_id = EXCLUDED.eye_instance_id,
            eye_x = EXCLUDED.eye_x,
            eye_y = EXCLUDED.eye_y,
            allocation_payload = EXCLUDED.allocation_payload,
            active = EXCLUDED.active,
            remaining_aura_budget = EXCLUDED.remaining_aura_budget,
            remaining_qi_budget = EXCLUDED.remaining_qi_budget,
            remaining_spirit_stone_budget = EXCLUDED.remaining_spirit_stone_budget,
            created_at_ms = EXCLUDED.created_at_ms,
            updated_at_ms = EXCLUDED.updated_at_ms,
            updated_at = now()
    `, [
        instanceId,
        formation.id,
        formation.ownerPlayerId,
        formation.ownerSectId,
        formation.formationId,
        formation.lifecycle,
        formation.diskItemId,
        formation.diskTier,
        formation.diskMultiplier,
        formation.spiritStoneCount,
        formation.qiCost,
        formation.x,
        formation.y,
        formation.eyeInstanceId,
        formation.eyeX,
        formation.eyeY,
        JSON.stringify(formation.allocation ?? {}),
        formation.active !== false,
        formation.remainingAuraBudget,
        formation.remainingQiBudget,
        formation.remainingSpiritStoneBudget,
        formation.createdAt,
        formation.updatedAt,
    ]);
}

function extractFormationSerial(formationId) {
    const serial = Number.parseInt(String(formationId).split(':').pop() ?? '', 10);
    return Number.isFinite(serial) ? Math.max(0, serial) : 0;
}

function normalizeDiskMultiplier(item) {
    if (Number.isFinite(item?.formationDiskMultiplier)) {
        return Math.max(1, Number(item.formationDiskMultiplier));
    }
    const tier = resolveFormationDiskTier(item);
    return FORMATION_DISK_TIER_MULTIPLIERS[tier] ?? 1;
}

function resolveInventoryItemInstanceId(payload, playerRuntimeService, playerId) {
    const itemInstanceId = normalizeOptionalString(payload?.itemRef?.itemInstanceId)
        || normalizeOptionalString(payload?.itemInstanceId)
        || normalizeOptionalString(payload?.expectedItemInstanceId);
    if (!itemInstanceId) {
        playerRuntimeService.repairInventoryItemInstanceIds(playerId);
        throw new BadRequestException('背包物品身份已修复，请重新选择。');
    }
    return itemInstanceId;
}

function resolveFormationDiskTier(item) {
    if (typeof item?.formationDiskTier === 'string' && item.formationDiskTier.length > 0) {
        return item.formationDiskTier;
    }
    const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
    if (itemId === 'formation_disk.mortal') {
        return 'mortal';
    }
    if (itemId === 'formation_disk.yellow') {
        return 'yellow';
    }
    if (itemId === 'formation_disk.mystic') {
        return 'mystic';
    }
    if (itemId === 'formation_disk.earth') {
        return 'earth';
    }
    return null;
}

function touchRuntimeInstanceRevision(deps, instanceId) {
    const instance = typeof deps?.getInstanceRuntime === 'function'
        ? deps.getInstanceRuntime(instanceId)
        : null;
    touchInstanceRevision(instance);
}

function touchInstanceRevision(instance) {
    if (!instance || !Number.isFinite(Number(instance.worldRevision))) {
        return;
    }
    instance.worldRevision += 1;
}

function normalizePlayerId(player) {
    return normalizeOptionalString(player?.playerId ?? player?.id);
}

function buildFormationResolveResult(completed, messages) {
    return {
        successCount: 0,
        failureCount: 0,
        outputs: [],
        expParams: {
            skillLevel: 1,
            targetLevel: 1,
            baseActionTicks: 0,
            successCount: 0,
            failureCount: 0,
            getExpToNextByLevel: () => 0,
        },
        completed,
        messages,
    };
}

function hasActiveFormationMaintenance(player, formationInstanceId) {
    return Boolean(player?.formationJob
        && Number(player.formationJob.remainingTicks) > 0
        && normalizeOptionalString(player.formationJob.formationInstanceId) === normalizeOptionalString(formationInstanceId));
}

function resolveAnyActiveTechniqueJob(player) {
    const jobs = [
        player?.alchemyJob,
        player?.forgingJob,
        player?.enhancementJob,
        player?.gatherJob,
        player?.buildingJob,
        player?.formationJob,
    ];
    return jobs.find((job) => job && Number(job.remainingTicks) > 0) ?? null;
}

function enqueueFormationMaintenance(player, formationInstanceId, formationName = null) {
    if (!Array.isArray(player.techniqueActivityQueue)) {
        player.techniqueActivityQueue = [];
    }
    const normalizedId = normalizeOptionalString(formationInstanceId);
    if (!normalizedId) {
        return false;
    }
    const exists = player.techniqueActivityQueue.some((entry) => entry?.kind === 'formation'
        && normalizeOptionalString(entry?.payload?.formationInstanceId) === normalizedId
        && entry?.state === 'pending');
    if (exists) {
        return true;
    }
    if (player.techniqueActivityQueue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
        return false;
    }
    player.techniqueActivityQueue.push({
        queueId: `formation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'formation',
        payload: { formationInstanceId: normalizedId },
        label: formationName ? `维护 ${formationName}` : '阵法维护',
        state: 'pending',
        createdAt: Date.now(),
    });
    return true;
}

function resolveFormationMaintenanceRate(player) {
    const output = Math.max(0, Number(player?.attrs?.numericStats?.maxQiOutputPerTick ?? player?.numericStats?.maxQiOutputPerTick) || 0);
    return Math.max(1, Math.floor(Math.sqrt(output)));
}

function markPlayerRuntimeDirty(player, domains, playerRuntimeService) {
    if (player?.dirtyDomains && typeof player.dirtyDomains.add === 'function') {
        for (const domain of domains) {
            player.dirtyDomains.add(domain);
        }
    }
    if (typeof playerRuntimeService?.bumpPersistentRevision === 'function') {
        playerRuntimeService.bumpPersistentRevision(player);
    }
}

function formatInteger(value) {
    return formatDisplayInteger(Math.max(0, Math.floor(Number(value) || 0)));
}
