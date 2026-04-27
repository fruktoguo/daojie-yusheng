// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeFormationService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const pg_1 = require("pg");
const env_alias_1 = require("../../config/env-alias");

const TERRAIN_STABILIZER_EFFECT_KIND = 'terrain_stabilizer';
const TILE_AURA_SOURCE_EFFECT_KIND = 'tile_aura_source';
const BOUNDARY_BARRIER_EFFECT_KIND = 'boundary_barrier';
const INSTANCE_FORMATION_STATE_TABLE = 'instance_formation_state';
const TERRAIN_DAMAGE_REDUCTION_DENOMINATOR = 100000;
const FORMATION_LIFECYCLE_DEPLOYED = 'deployed';
const FORMATION_LIFECYCLE_PERSISTENT = 'persistent';

/** world-runtime formation：阵法权威运行时，承接布阵、开关、补充与 tick 效果。 */
class WorldRuntimeFormationService {
    logger = new common_1.Logger(WorldRuntimeFormationService.name);
    contentTemplateRepository;
    playerRuntimeService;
    formationsByInstanceId = new Map();
    nextFormationSerial = 1;
    persistencePool = null;
    persistenceReady = false;
    persistenceInitPromise = null;

    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }

    dispatchCreateFormation(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const slotIndex = normalizeSlotIndex(payload?.slotIndex);
        const diskItem = player.inventory?.items?.[slotIndex] ?? null;
        const diskTier = resolveFormationDiskTier(diskItem);
        if (!diskItem || !diskTier) {
            throw new common_1.BadRequestException('需要使用阵盘布阵');
        }
        const template = this.resolveFormationTemplate(payload?.formationId);
        if (resolveFormationLifecycle(template) === FORMATION_LIFECYCLE_PERSISTENT) {
            throw new common_1.BadRequestException(`${template.name}是持续性阵法，不能通过阵盘布置`);
        }
        if (template.placeableByDisk === false) {
            throw new common_1.BadRequestException(`${template.name}不能通过阵盘布置`);
        }
        const spiritStoneCount = normalizePositiveInteger(payload?.spiritStoneCount, '灵石数量');
        const minSpiritStoneCount = shared_1.resolveFormationMinSpiritStoneCount(template);
        if (spiritStoneCount < minSpiritStoneCount) {
            throw new common_1.BadRequestException(`${template.name}至少需要投入 ${formatInteger(minSpiritStoneCount)} 灵石`);
        }
        const qiCost = shared_1.resolveFormationQiCost(spiritStoneCount);
        const diskMultiplier = normalizeDiskMultiplier(diskItem);
        const allocation = shared_1.normalizeFormationAllocation(payload?.allocation);
        const stats = shared_1.resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntime(location.instanceId);
        if (!instance) {
            throw new common_1.NotFoundException('当前地图实例不存在');
        }
        assertCanPlaceFormationInInstance(instance);
        const placement = resolveFormationPlacement(playerId, player, location, instance);
        this.assertCanPay(playerId, qiCost, spiritStoneCount);
        this.playerRuntimeService.spendQi(playerId, qiCost);
        this.playerRuntimeService.debitWallet(playerId, shared_1.FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
        this.playerRuntimeService.consumeInventoryItem(playerId, slotIndex, 1);
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
            remainingAuraBudget: stats.totalAuraBudget,
            createdAt: now,
            updatedAt: now,
        };
        this.getFormationList(instance.meta.instanceId).push(formation);
        touchInstanceRevision(instance);
        this.persistInstanceFormationsSoon(instance.meta.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${template.name}已布下：半径 ${stats.radius}，强度 ${formatInteger(stats.effectValue)}，总灵力 ${formatInteger(stats.totalAuraBudget)}。`,
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
            throw new common_1.BadRequestException('护宗大阵模板必须是边界防护阵法');
        }
        const instanceId = normalizeInstanceId(input?.instanceId);
        if (!instanceId) {
            throw new common_1.BadRequestException('instanceId is required');
        }
        const x = firstFiniteInteger(input?.x);
        const y = firstFiniteInteger(input?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            throw new common_1.BadRequestException('护宗大阵入口坐标无效');
        }
        const ownerSectId = normalizeOptionalString(input?.ownerSectId ?? input?.sectId);
        const eyeInstanceId = normalizeInstanceId(input?.eyeInstanceId) || instanceId;
        const eyeX = firstFiniteInteger(input?.eyeX, x);
        const eyeY = firstFiniteInteger(input?.eyeY, y);
        const spiritStoneCount = Math.max(1, Math.trunc(Number(input?.spiritStoneCount) || shared_1.resolveFormationMinSpiritStoneCount(template)));
        const diskMultiplier = Number.isFinite(Number(input?.diskMultiplier)) ? Math.max(1, Number(input.diskMultiplier)) : 1;
        const allocation = shared_1.normalizeFormationAllocation(input?.allocation);
        const stats = shared_1.resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        if (Number.isFinite(Number(input?.radius))) {
            stats.radius = Math.max(1, Math.trunc(Number(input.radius)));
        }
        const now = Date.now();
        const formationId = normalizeOptionalString(input?.id)
            || `formation:sect_guardian:${ownerSectId || 'public'}:${instanceId}:${x}:${y}`;
        const list = this.getFormationList(instanceId);
        const existing = list.find((entry) => entry.id === formationId);
        const remainingAuraBudget = Number.isFinite(Number(input?.remainingAuraBudget))
            ? Math.max(0, Number(input.remainingAuraBudget))
            : stats.totalAuraBudget;
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
            active: input?.active !== false,
            remainingAuraBudget,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        if (existing) {
            Object.assign(existing, patch);
        }
        else {
            list.push(patch);
        }
        touchRuntimeInstanceRevision(deps, instanceId);
        this.persistInstanceFormationsSoon(instanceId);
        return existing ?? patch;
    }

    dispatchSetFormationActive(playerId, payload, deps = null) {
        const formation = this.findOwnedFormation(playerId, payload?.formationInstanceId);
        if (isPersistentFormation(formation)) {
            throw new common_1.BadRequestException('持续性阵法需要在阵法管理面板操作');
        }
        formation.active = payload?.active !== false;
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
            throw new common_1.BadRequestException('持续性阵法需要在阵法管理面板注入灵石或灵力');
        }
        const spiritStoneCount = Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1));
        const qiCost = shared_1.resolveFormationQiCost(spiritStoneCount);
        this.assertCanPay(playerId, qiCost, spiritStoneCount);
        this.playerRuntimeService.spendQi(playerId, qiCost);
        this.playerRuntimeService.debitWallet(playerId, shared_1.FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
        const added = Math.round(spiritStoneCount * shared_1.FORMATION_AURA_PER_SPIRIT_STONE * formation.diskMultiplier);
        formation.remainingAuraBudget += added;
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}补充灵力 ${formatInteger(added)}。`,
            kind: 'success',
        });
        return formation;
    }

    dispatchSetPersistentFormationActive(playerId, payload, deps = null) {
        const formation = this.findFormationByInstanceOrId(payload?.instanceId, payload?.formationInstanceId);
        if (!formation) {
            throw new common_1.NotFoundException('阵法不存在');
        }
        if (!isPersistentFormation(formation)) {
            throw new common_1.BadRequestException('该阵法不是持续性阵法');
        }
        formation.active = payload?.active !== false && formation.remainingAuraBudget > 0;
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
            throw new common_1.NotFoundException('阵法不存在');
        }
        if (!isPersistentFormation(formation)) {
            throw new common_1.BadRequestException('该阵法不是持续性阵法');
        }
        const spiritStoneCount = normalizeNonNegativeInteger(payload?.spiritStoneCount ?? 0);
        const qiAmount = normalizeNonNegativeInteger(payload?.qiAmount ?? payload?.qiCost ?? 0);
        if (spiritStoneCount <= 0 && qiAmount <= 0) {
            throw new common_1.BadRequestException('至少需要注入灵石或灵力');
        }
        this.assertCanInject(playerId, qiAmount, spiritStoneCount);
        if (qiAmount > 0) {
            this.playerRuntimeService.spendQi(playerId, qiAmount);
        }
        if (spiritStoneCount > 0) {
            this.playerRuntimeService.debitWallet(playerId, shared_1.FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount);
        }
        const added = Math.round((spiritStoneCount * shared_1.FORMATION_AURA_PER_SPIRIT_STONE) + qiAmount);
        formation.remainingAuraBudget = Math.max(0, Number(formation.remainingAuraBudget) || 0) + added;
        if (formation.remainingAuraBudget > 0) {
            formation.active = true;
        }
        formation.updatedAt = Date.now();
        touchRuntimeInstanceRevision(deps, formation.instanceId);
        this.persistInstanceFormationsSoon(formation.instanceId);
        this.playerRuntimeService.enqueueNotice(playerId, {
            text: `${formation.name}注入阵元 ${formatInteger(added)}。`,
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
            if (isPersistentFormation(formation) && formation.remainingAuraBudget <= 0) {
                if (formation.active !== false) {
                    formation.active = false;
                    formation.updatedAt = Date.now();
                    touchInstanceRevision(instance);
                    persistenceDirty = true;
                }
                continue;
            }
            const tickCost = formation.active ? formation.stats.tickActiveCost : formation.stats.tickInactiveCost;
            formation.remainingAuraBudget -= tickCost;
            if (formation.remainingAuraBudget <= 0) {
                if (isPersistentFormation(formation)) {
                    formation.remainingAuraBudget = 0;
                    formation.active = false;
                    formation.updatedAt = Date.now();
                    touchInstanceRevision(instance);
                    persistenceDirty = true;
                    this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                        text: `${formation.name}灵力耗尽，阵势停摆。`,
                        kind: 'warning',
                    });
                    continue;
                }
                formations.splice(index, 1);
                touchInstanceRevision(instance);
                persistenceDirty = true;
                this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                    text: `${formation.name}灵力耗尽，阵势散去。`,
                    kind: 'warning',
                });
                continue;
            }
            if (Number.isFinite(Number(_worldTick)) && Number(_worldTick) % 60 === 0) {
                persistenceDirty = true;
            }
            if (formation.active !== true) {
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
            if (formation.active !== true || formation.template.effect.kind !== TERRAIN_STABILIZER_EFFECT_KIND) {
                continue;
            }
            if (this.containsTile(formation, x, y)) {
                return true;
            }
        }
        return false;
    }

    resolveTerrainDamageReduction(instanceId, x, y) {
        const formations = this.formationsByInstanceId.get(instanceId);
        if (!formations || formations.length <= 0) {
            return 0;
        }
        let reduction = 0;
        for (const formation of formations) {
            if (formation.active !== true || formation.template.effect.kind !== TERRAIN_STABILIZER_EFFECT_KIND) {
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
            remainingAuraBudget: Math.max(0, Number(formation.remainingAuraBudget) || 0),
            damagePerAura: shared_1.resolveFormationDamagePerAura(formation.template),
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
        if (!formation || formation.remainingAuraBudget <= 0) {
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
            remainingAuraBudget: Math.max(0, Number(formation.remainingAuraBudget) || 0),
            damagePerAura: shared_1.resolveFormationDamagePerAura(formation.template),
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

    applyDamageToFormation(instanceId, formationInstanceId, damage, attackerPlayerId = null, deps = null) {
        const formation = this.findFormationInInstance(instanceId, formationInstanceId);
        if (!formation || formation.remainingAuraBudget <= 0) {
            return null;
        }
        const normalizedDamage = Math.max(0, Number(damage) || 0);
        const selfDamageReduction = this.resolveFormationSelfDamageReduction(formation);
        const mitigatedDamage = selfDamageReduction > 0
            ? Math.max(0, normalizedDamage * (1 - selfDamageReduction))
            : normalizedDamage;
        const damagePerAura = shared_1.resolveFormationDamagePerAura(formation.template);
        const auraDamage = mitigatedDamage / damagePerAura;
        if (auraDamage <= 0) {
            return {
                formation,
                appliedDamage: 0,
                auraDamage: 0,
                destroyed: false,
                remainingAuraBudget: formation.remainingAuraBudget,
                damagePerAura,
                selfDamageReduction,
            };
        }
        const appliedAuraDamage = Math.min(Math.max(0, Number(formation.remainingAuraBudget) || 0), auraDamage);
        const appliedDamage = appliedAuraDamage * damagePerAura;
        formation.remainingAuraBudget = Math.max(0, formation.remainingAuraBudget - appliedAuraDamage);
        formation.updatedAt = Date.now();
        const destroyed = formation.remainingAuraBudget <= 0;
        if (destroyed) {
            if (isPersistentFormation(formation)) {
                formation.remainingAuraBudget = 0;
                formation.active = false;
                this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                    text: `${formation.name}阵眼受损，阵势停摆。`,
                    kind: 'warning',
                });
            }
            else {
                const formations = this.formationsByInstanceId.get(instanceId);
                const index = formations?.findIndex((entry) => entry.id === formation.id) ?? -1;
                if (formations && index >= 0) {
                    formations.splice(index, 1);
                    if (formations.length <= 0) {
                        this.formationsByInstanceId.delete(instanceId);
                    }
                }
                this.playerRuntimeService.enqueueNotice(formation.ownerPlayerId, {
                    text: `${formation.name}被摧毁，阵势散去。`,
                    kind: 'warning',
                });
            }
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
            remainingAuraBudget: formation.remainingAuraBudget,
            damagePerAura,
            selfDamageReduction,
            attackerPlayerId,
        };
    }

    listRuntimeFormations(instanceId) {
        const normalizedInstanceId = normalizeInstanceId(instanceId);
        const result = (this.formationsByInstanceId.get(normalizedInstanceId) ?? [])
            .map((formation) => buildRuntimeFormationProjection(formation, 'effect'));
        for (const [sourceInstanceId, formations] of this.formationsByInstanceId.entries()) {
            if (sourceInstanceId === normalizedInstanceId) {
                continue;
            }
            for (const formation of formations) {
                if (!isPersistentFormation(formation) || normalizeInstanceId(formation.eyeInstanceId) !== normalizedInstanceId) {
                    continue;
                }
                result.push(buildRuntimeFormationProjection(formation, 'eye'));
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
            remainingAuraBudget: Math.max(0, Math.floor(formation.remainingAuraBudget)),
            radius: formation.stats.radius,
            refillSpiritStoneCount: Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1)),
            refillQiCost: shared_1.resolveFormationQiCost(Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1))),
            refillAuraBudget: Math.round(Math.max(1, Math.trunc(Number(formation.spiritStoneCount) || 1)) * shared_1.FORMATION_AURA_PER_SPIRIT_STONE * formation.diskMultiplier),
        }));
    }

    advanceAuraFormation(instance, formation) {
        const resourceKey = formation.template.effect.resourceKey || shared_1.DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY;
        const halfLifeTicks = Math.max(1, Math.trunc(formation.template.effect.convergenceHalfLifeTicks ?? shared_1.FORMATION_TICKS_PER_DAY));
        const cells = shared_1.listFormationAffectedCells(formation.template.range.shape, formation.x, formation.y, formation.stats.radius, instance.template.width, instance.template.height);
        for (const cell of cells) {
            const current = instance.getTileResource(resourceKey, cell.x, cell.y) ?? 0;
            const target = Math.max(0, formation.stats.effectValue);
            if (current >= target) {
                continue;
            }
            const delta = Math.max(1, Math.ceil((target - current) / halfLifeTicks));
            instance.addTileResource(resourceKey, cell.x, cell.y, Math.min(delta, target - current));
        }
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
                || formation.remainingAuraBudget <= 0) {
                continue;
            }
            if (!this.containsBoundaryTile(formation, x, y)) {
                continue;
            }
            if (this.canPlayerPassFormationBoundary(formation, playerId)) {
                continue;
            }
            if (!selected || formation.remainingAuraBudget > selected.remainingAuraBudget) {
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
            return null;
        }
        const diskTier = normalizeFormationDiskTier(entry.diskTier);
        const diskMultiplier = Number.isFinite(Number(entry.diskMultiplier)) ? Math.max(1, Number(entry.diskMultiplier)) : 1;
        const spiritStoneCount = Math.max(1, Math.trunc(Number(entry.spiritStoneCount) || 1));
        const allocation = shared_1.normalizeFormationAllocation(entry.allocation);
        const stats = shared_1.resolveFormationStats(template, spiritStoneCount, diskMultiplier, allocation);
        const lifecycle = normalizeFormationLifecycle(entry.lifecycle ?? template.lifecycle);
        const remainingAuraBudget = Number.isFinite(Number(entry.remainingAuraBudget))
            ? Math.max(0, Number(entry.remainingAuraBudget))
            : stats.totalAuraBudget;
        if (remainingAuraBudget <= 0 && lifecycle !== FORMATION_LIFECYCLE_PERSISTENT) {
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
            active: lifecycle === FORMATION_LIFECYCLE_PERSISTENT && remainingAuraBudget <= 0 ? false : entry.active !== false,
            remainingAuraBudget,
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
        };
    }

    persistInstanceFormationsSoon(instanceId) {
        void this.saveInstanceFormations(instanceId).catch((error) => {
            this.logger.warn(`阵法持久化失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
        });
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
        const formations = (this.formationsByInstanceId.get(normalizedInstanceId) ?? []).map((formation) => serializeFormation(formation));
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`DELETE FROM ${INSTANCE_FORMATION_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
            for (const formation of formations) {
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
                        created_at_ms,
                        updated_at_ms,
                        updated_at
                    )
                    VALUES (
                        $1, $2, $3, $4, $5,
                        $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17::jsonb, $18, $19, $20, $21, now()
                    )
                `, [
                    normalizedInstanceId,
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
                    formation.createdAt,
                    formation.updatedAt,
                ]);
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
        const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
        if (!databaseUrl.trim()) {
            return;
        }
        const pool = new pg_1.Pool({ connectionString: databaseUrl });
        try {
            await ensureInstanceFormationStateTable(pool);
            this.persistencePool = pool;
            this.persistenceReady = true;
        } catch (error) {
            await pool.end().catch(() => undefined);
            this.logger.warn(`阵法持久化初始化失败：${error instanceof Error ? error.message : String(error)}`);
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

    findOwnedFormation(playerId, formationInstanceId) {
        const normalizedId = typeof formationInstanceId === 'string' ? formationInstanceId.trim() : '';
        if (!normalizedId) {
            throw new common_1.BadRequestException('formationInstanceId is required');
        }
        for (const formations of this.formationsByInstanceId.values()) {
            const formation = formations.find((entry) => entry.id === normalizedId);
            if (!formation) {
                continue;
            }
            if (formation.ownerPlayerId !== playerId) {
                throw new common_1.ForbiddenException('不能操作他人的阵法');
            }
            return formation;
        }
        throw new common_1.NotFoundException('阵法不存在');
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
            throw new common_1.BadRequestException('formationId is required');
        }
        const configured = typeof this.contentTemplateRepository.getFormationTemplate === 'function'
            ? this.contentTemplateRepository.getFormationTemplate(normalizedId)
            : null;
        const template = configured ?? shared_1.getFormationTemplateById(normalizedId);
        if (!template) {
            throw new common_1.NotFoundException(`Unknown formation: ${normalizedId}`);
        }
        return template;
    }

    assertCanPay(playerId, qiCost, spiritStoneCount) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.qi < qiCost) {
            throw new common_1.NotFoundException('灵力不足');
        }
        if (!this.playerRuntimeService.canAffordWallet(playerId, shared_1.FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount)) {
            throw new common_1.NotFoundException('灵石不足');
        }
    }

    assertCanInject(playerId, qiAmount, spiritStoneCount) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (qiAmount > 0 && player.qi < qiAmount) {
            throw new common_1.NotFoundException('灵力不足');
        }
        if (spiritStoneCount > 0 && !this.playerRuntimeService.canAffordWallet(playerId, shared_1.FORMATION_SPIRIT_STONE_ITEM_ID, spiritStoneCount)) {
            throw new common_1.NotFoundException('灵石不足');
        }
    }
}
exports.WorldRuntimeFormationService = WorldRuntimeFormationService;
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
            spirit_stone_count integer NOT NULL DEFAULT 0,
            qi_cost integer NOT NULL DEFAULT 0,
            x integer NOT NULL,
            y integer NOT NULL,
            eye_instance_id varchar(100) NOT NULL,
            eye_x integer NOT NULL,
            eye_y integer NOT NULL,
            allocation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            active boolean NOT NULL DEFAULT true,
            remaining_aura_budget double precision NOT NULL DEFAULT 0,
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
        throw new common_1.BadRequestException('slotIndex is invalid');
    }
    return value;
}

function normalizePositiveInteger(input, label) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value <= 0) {
        throw new common_1.BadRequestException(`${label}必须大于 0`);
    }
    return value;
}

function normalizeNonNegativeInteger(input) {
    const value = Math.trunc(Number(input));
    if (!Number.isFinite(value) || value < 0) {
        throw new common_1.BadRequestException('灵力消耗不能为负');
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
        throw new common_1.BadRequestException('无法确认布阵坐标');
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
        throw new common_1.BadRequestException('虚境不能布置阵法，请前往现世。');
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
    return typeof shared_1.resolveFormationLifecycle === 'function'
        ? shared_1.resolveFormationLifecycle(template)
        : normalizeFormationLifecycle(template?.lifecycle);
}

function isPersistentFormation(formation) {
    return normalizeFormationLifecycle(formation?.lifecycle ?? formation?.template?.lifecycle) === FORMATION_LIFECYCLE_PERSISTENT;
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
        damagePerAura: shared_1.resolveFormationDamagePerAura(formation.template),
        remainingAuraBudget: Math.max(0, Math.floor(formation.remainingAuraBudget)),
    };
}

function resolveFormationRuntimeVisual(template) {
    const visual = typeof shared_1.resolveFormationVisual === 'function'
        ? shared_1.resolveFormationVisual(template)
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

function serializeFormation(formation) {
    return {
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
        remainingAuraBudget: Math.max(0, Number(formation.remainingAuraBudget) || 0),
        createdAt: formation.createdAt,
        updatedAt: formation.updatedAt,
    };
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
    return shared_1.FORMATION_DISK_TIER_MULTIPLIERS[tier] ?? 1;
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

function formatInteger(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('zh-CN');
}
