/**
 * 内容模板仓库：服务端启动期从 data/content 目录加载物品、功法、妖兽、阵法等模板，
 * 提供运行时查询、实例化和掉落计算。所有模板在 onModuleInit 时一次性解析并缓存，
 * tick 热路径直接读取预解析结构，不做文件 IO 或 schema 校验。
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_INVENTORY_CAPACITY, DEFAULT_PLAYER_REALM_STAGE, DEFAULT_QI_RESOURCE_DESCRIPTOR, Direction, ELEMENT_KEYS, EQUIP_SLOTS, NUMERIC_SCALAR_STAT_KEYS, PLAYER_REALM_NUMERIC_TEMPLATES, TECHNIQUE_EXP_BASE, TechniqueRealm, buildQiResourceKey, calculateTechniqueSkillQiCost, cloneNumericRatioDivisors, cloneNumericStats, compileEquipmentBaselinePercentsToActualStats, compileValueStatsToActualStats, createMonsterMainCombatStatModifierStats, deriveTechniqueRealm, expandTechniqueAttrRatio, expandTechniqueExpCurve, expandTechniqueLayerGains, getTechniqueExpToNext, getTileTypeFromMapChar, inferMonsterTierFromName, isTileTypeWalkable, normalizeEditableMapDocument, normalizeMonsterTier as normalizeSharedMonsterTier, resolveMonsterTemplateRecord, resolveSkillUnlockLevel, scaleTechniqueExp, shouldExpandTechniqueAttrRatio } from '@mud/shared';
import { resolveProjectPath } from '../common/project-path';

const ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD = 1;
const ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER = 0.7;

/** 内容模板仓库：集中加载物品、功法、妖兽掉落和怪物运行时模板。 */
@Injectable()
export class ContentTemplateRepository {
    /** 运行时日志器，记录内容加载与校验失败。 */
    logger = new Logger(ContentTemplateRepository.name);
    /** 物品模板表，按 itemId 查找。 */
    itemTemplates = new Map();
    /** 功法模板表，按 techniqueId 查找。 */
    techniqueTemplates = new Map();
    /** N44：技能模板按 skillId 反向索引。loadAll 内 technique 填充完成后立即建索引；getSkill 走 O(1) 查询。 */
    skillTemplatesById = new Map();
    /** 共享功法 buff 表，供多个技能复用。 */
    sharedTechniqueBuffs = new Map();
    /** 阵法模板表，按 formationId 查找。 */
    formationTemplates = new Map();
    /** 妖兽掉落表，按 monsterId 聚合。 */
    monsterDropsByMonsterId = new Map();
    /** 妖兽运行时模板表，用于生成世界刷怪数据。 */
    monsterRuntimeTemplates = new Map();
    /** 每张地图上的妖兽运行时状态缓存。 */
    monsterRuntimeStatesByMapId = new Map();
    /** 妖兽倾向数值基准，启动期读取后供运行时模板解析直用。 */
    monsterRealmBaselines = undefined;
    /** 起始背包条目列表。 */
    starterInventoryEntries = [];
    /** 模块初始化时加载全部内容模板。 */
    onModuleInit() {
        this.loadAll();
    }
    /** 生成新玩家的起始背包。 */
    createStarterInventory() {
        return {
            capacity: DEFAULT_INVENTORY_CAPACITY,
            items: this.starterInventoryEntries
                .map((entry) => this.createItem(entry.itemId, entry.count ?? 1))
                .filter((entry) => Boolean(entry)),
        };
    }
    /** 生成默认装备槽位。 */
    createDefaultEquipment() {
        return {
            weapon: null,
            head: null,
            body: null,
            legs: null,
            accessory: null,
        };
    }
    /** 按物品模板生成一份可堆叠物品实例。 */
    createItem(itemId, count = 1) {


        const template = this.itemTemplates.get(itemId);
        if (!template) {
            return null;
        }
        return {
            ...template,
            count: Math.max(1, Math.trunc(count)),
        };
    }
    /** 读取物品名称，供运行时和日志使用。 */
    getItemName(itemId) {
        return this.itemTemplates.get(itemId)?.name ?? null;
    }
    /** 列出全部物品模板的浅拷贝。 */
    listItemTemplates() {
        return Array.from(this.itemTemplates.values(), (template) => ({
            itemId: template.itemId,
            name: template.name,
            type: template.type,
            groundLabel: template.groundLabel,
            grade: template.grade,
            level: template.level,
            equipSlot: template.equipSlot,
            desc: template.desc,
            equipAttrs: template.equipAttrs ? { ...template.equipAttrs } : undefined,
            equipStats: template.equipStats ? { ...template.equipStats } : undefined,
            equipValueStats: template.equipValueStats ? { ...template.equipValueStats } : undefined,
            equipSpecialStats: template.equipSpecialStats ? { ...template.equipSpecialStats } : undefined,
            tags: Array.isArray(template.tags) ? template.tags.slice() : undefined,
            contextActions: Array.isArray(template.contextActions) ? template.contextActions.map((entry) => ({ ...entry })) : undefined,
            effects: Array.isArray(template.effects) ? template.effects.map((entry) => ({ ...entry })) : undefined,
            healAmount: template.healAmount,
            healPercent: template.healPercent,
            qiPercent: template.qiPercent,
            alchemySuccessRate: template.alchemySuccessRate,
            alchemySpeedRate: template.alchemySpeedRate,
            enhancementSuccessRate: template.enhancementSuccessRate,
            enhancementSpeedRate: template.enhancementSpeedRate,
            miningDamageRate: template.miningDamageRate,
            consumeBuffs: Array.isArray(template.consumeBuffs) ? template.consumeBuffs.map((entry) => ({
                ...entry,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
                stats: entry.stats ? { ...entry.stats } : undefined,
                valueStats: entry.valueStats ? { ...entry.valueStats } : undefined,
                qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
            })) : undefined,
            mapUnlockId: template.mapUnlockId,
            mapUnlockIds: Array.isArray(template.mapUnlockIds) ? template.mapUnlockIds.slice() : undefined,
            respawnBindMapId: template.respawnBindMapId,
            tileAuraGainAmount: template.tileAuraGainAmount,
            tileResourceGains: Array.isArray(template.tileResourceGains) ? template.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
            useBehavior: template.useBehavior,
            formationDiskTier: template.formationDiskTier,
            formationDiskMultiplier: template.formationDiskMultiplier,
            spiritualRootSeedTier: template.spiritualRootSeedTier,
            allowBatchUse: template.allowBatchUse,
        })).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
    }
    /** 读取阵法模板。 */
    getFormationTemplate(formationId) {
        const normalized = typeof formationId === 'string' ? formationId.trim() : '';
        return normalized ? this.formationTemplates.get(normalized) ?? null : null;
    }
    /** 列出阵法模板。 */
    listFormationTemplates() {
        return Array.from(this.formationTemplates.values(), (template) => ({ ...template }));
    }
    
    rollLootPoolItems(query) {


        const chance = typeof query.chance === 'number' ? Math.max(0, Math.min(1, query.chance)) : 1;
        if (chance <= 0 || Math.random() > chance) {
            return [];
        }

        const candidates = this.getLootPoolCandidateIds(query);
        if (candidates.length === 0) {
            return [];
        }

        const rolls = Number.isInteger(query.rolls) && Number(query.rolls) > 0 ? Number(query.rolls) : 1;

        const countMin = Number.isInteger(query.countMin) && Number(query.countMin) > 0 ? Number(query.countMin) : 1;

        const countMax = Number.isInteger(query.countMax) && Number(query.countMax) >= countMin ? Number(query.countMax) : countMin;

        const allowDuplicates = query.allowDuplicates === true;

        const pool = candidates.slice();

        const result = [];
        for (let index = 0; index < rolls; index += 1) {
            const source = allowDuplicates ? candidates : pool;
            if (source.length === 0) {
                break;
            }

            const pickedIndex = Math.floor(Math.random() * source.length);

            const pickedItemId = source[pickedIndex];
            if (!pickedItemId) {
                continue;
            }

            const count = randomIntInclusive(countMin, countMax);

            const item = this.createItem(pickedItemId, count);
            if (item) {
                result.push(item);
            }
            if (!allowDuplicates) {
                pool.splice(pickedIndex, 1);
            }
        }
        return result;
    }
    
    normalizeItem(item) {


        const template = this.itemTemplates.get(item.itemId);
        if (!template) {
            return {
                ...item,
                count: Math.max(1, Math.trunc(item.count)),
            };
        }
        return {
            ...template,
            ...item,
            equipSlot: template.equipSlot ?? item.equipSlot,
            equipSpecialStats: template.equipSpecialStats ?? item.equipSpecialStats,
            count: Math.max(1, Math.trunc(item.count)),
            enhanceLevel: item.enhanceLevel ?? template.enhanceLevel,
        };
    }
    
    getLearnTechniqueId(itemId) {
        return this.itemTemplates.get(itemId)?.learnTechniqueId ?? null;
    }
    
    getItemSortLevel(item) {


        const template = this.itemTemplates.get(String(item?.itemId ?? ''));
        if (template?.learnTechniqueId) {

            const technique = this.techniqueTemplates.get(template.learnTechniqueId);
            if (Number.isFinite(technique?.realmLv)) {
                return Math.max(1, Math.trunc(Number(technique.realmLv)));
            }
        }
        if (Number.isFinite(item?.level)) {
            return Math.max(1, Math.trunc(Number(item.level)));
        }
        if (!template) {
            return 1;
        }
        return resolveItemTemplateLevel(template);
    }
    
    createTechniqueState(techniqueId) {


        const template = this.techniqueTemplates.get(techniqueId);
        if (!template) {
            return null;
        }
        return buildTechniqueRuntimeStateFromTemplate(template, {
            level: 1,
            exp: 0,
            realm: TechniqueRealm.Entry,
        });
    }
    
    getTechniqueName(techniqueId) {
        return this.techniqueTemplates.get(techniqueId)?.name ?? null;
    }
    
    getTechniqueCategoryForBookItem(itemId) {
        const techniqueId = this.itemTemplates.get(itemId)?.learnTechniqueId;
        if (!techniqueId) {
            return null;
        }
        return this.techniqueTemplates.get(techniqueId)?.category ?? null;
    }
    
    hydrateTechniqueState(input) {

        if (!input || typeof input !== 'object') {
            return null;
        }

        const techId = typeof input.techId === 'string' ? input.techId.trim() : '';
        if (!techId) {
            return null;
        }

        const template = this.techniqueTemplates.get(techId);
        if (template) {
            return buildTechniqueRuntimeStateFromTemplate(template, input);
        }

        const level = Number.isFinite(input.level) ? Math.max(1, Math.trunc(Number(input.level))) : 1;

        const realmLv = template?.realmLv ?? (Number.isFinite(input.realmLv)
            ? Math.max(1, Math.trunc(Number(input.realmLv)))
            : 1);

        const templateLayerByLevel: Map<any, any> = new Map((template?.layers ?? []).map((entry) => [entry.level, entry]));
        const layers = Array.isArray(input.layers) && input.layers.length > 0
            ? input.layers.map((entry) => {
                const layerLevel = Number.isFinite(entry?.level) ? Math.max(1, Math.trunc(Number(entry.level))) : 1;
                const templateLayer = templateLayerByLevel.get(layerLevel);
                return {
                    level: layerLevel,
                    expToNext: Number.isFinite(templateLayer?.expToNext)
                        ? Math.max(0, Math.trunc(Number(templateLayer.expToNext)))
                        : (Number.isFinite(entry?.expToNext) ? Math.max(0, Math.trunc(Number(entry.expToNext))) : 0),
                    attrs: templateLayer?.attrs
                        ? { ...templateLayer.attrs }
                        : cloneTechniqueLayerAttrsWithoutSpecialStats(entry?.attrs),
                    specialStats: resolveTechniqueLayerSpecialStats(entry, templateLayer),
                    qiProjection: cloneQiProjectionModifiers(templateLayer?.qiProjection ?? entry?.qiProjection),
                };
            })
            : (template?.layers.map((entry) => ({
                level: entry.level,
                expToNext: entry.expToNext,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
                specialStats: entry.specialStats ? { ...entry.specialStats } : undefined,
                qiProjection: cloneQiProjectionModifiers(entry.qiProjection),
            })) ?? []);

        const expToNext = Number.isFinite(input.expToNext)
            ? Math.max(0, Math.trunc(Number(input.expToNext)))
            : (getTechniqueExpToNext(level, layers) ?? 0);

        const grade = typeof input.grade === 'string' ? input.grade : template?.grade;

        const category = typeof input.category === 'string' ? input.category : template?.category;

        const templateSkillById: Map<any, any> = new Map((template?.skills ?? []).map((entry) => [entry.id, entry]));
        const skills = Array.isArray(input.skills) && input.skills.length > 0
            ? input.skills.map((entry) => {
                const templateSkill = typeof entry?.id === 'string' ? templateSkillById.get(entry.id) : null;
                return templateSkill
                    ? {
                        ...entry,
                        playerCast: templateSkill.playerCast ? { ...templateSkill.playerCast } : undefined,
                        monsterCast: templateSkill.monsterCast ? { ...templateSkill.monsterCast } : undefined,
                    }
                    : { ...entry };
            })
            : (template?.skills.map((entry) => ({ ...entry })) ?? []);

        return {
            techId,

            name: typeof input.name === 'string' && input.name ? input.name : (template?.name ?? techId),
            level,
            exp: Number.isFinite(input.exp) ? Math.max(0, Math.trunc(Number(input.exp))) : 0,
            expToNext,
            realmLv,
            realm: Number.isFinite(input.realm) ? Math.max(0, Math.trunc(Number(input.realm))) : deriveTechniqueRealm(level, layers),
            skills,
            grade,
            category,
            layers,
        };
    }
    
    listTechniqueTemplates() {
        return Array.from(this.techniqueTemplates.values(), (template) => ({
            id: template.id,
            name: template.name,
            desc: template.desc,
            grade: template.grade,
            category: template.category,
            realmLv: template.realmLv,
            skills: template.skills.map((entry) => ({ ...entry })),
            layers: template.layers.map((entry) => ({
                level: entry.level,
                expToNext: entry.expToNext,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
                specialStats: entry.specialStats ? { ...entry.specialStats } : undefined,
                qiProjection: cloneQiProjectionModifiers(entry.qiProjection),
            })),
        })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
    }
    
    rollMonsterDrops(monsterId, rolls = 1, lootRateBonus = 0, rareLootRateBonus = 0, context = {}) {


        const dropTable = this.monsterDropsByMonsterId.get(monsterId);
        if (!dropTable || dropTable.length === 0) {
            return [];
        }

        const normalizedRolls = Math.max(1, Math.trunc(rolls));

        const result = new Map();

        const normalizedLootRateBonus = Number.isFinite(lootRateBonus) ? lootRateBonus : 0;

        const normalizedRareLootRateBonus = Number.isFinite(rareLootRateBonus) ? rareLootRateBonus : 0;
        for (let rollIndex = 0; rollIndex < normalizedRolls; rollIndex += 1) {
            for (const drop of dropTable) {
                const baseChance = typeof drop.chance === 'number' ? Math.max(0, Math.min(1, drop.chance)) : 1;
                const totalRateBonus = normalizedLootRateBonus + (baseChance <= 0.001 ? normalizedRareLootRateBonus : 0);

                const killEquivalent = totalRateBonus >= 0
                    ? 1 + totalRateBonus / 10000
                    : 1 / (1 + Math.abs(totalRateBonus) / 10000);

                const chance = baseChance <= 0 || killEquivalent <= 0
                    ? 0
                    : (1 - Math.pow(1 - baseChance, killEquivalent))
                        * this.getOrdinaryMonsterSpiritStoneDropMultiplier(drop, context);
                if (chance <= 0 || Math.random() > chance) {
                    continue;
                }

                const existing = result.get(drop.itemId);
                if (existing) {
                    existing.count += drop.count;
                    continue;
                }

                const item = this.createItem(drop.itemId, drop.count) ?? {
                    itemId: drop.itemId,
                    name: drop.name,
                    type: drop.type,
                    count: drop.count,
                };
                result.set(drop.itemId, item);
            }
        }
        return Array.from(result.values()).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
    }
    
    createRuntimeMonstersForMap(mapId) {


        const states = this.buildFallbackMonsterRuntimeStatesForMap(mapId) ?? this.monsterRuntimeStatesByMapId.get(mapId);
        if (!states || states.length === 0) {
            return [];
        }

        const spawns = [];
        for (const state of states) {
            const monsterId = parseMonsterIdFromRuntimeId(state.runtimeId);
            if (!monsterId) {
                continue;
            }

            const template = this.monsterRuntimeTemplates.get(monsterId);
            if (!template) {
                continue;
            }
            const resolvedStats = resolveMonsterRuntimeTemplateStats(template, {
                level: state.level,
                tier: state.tier,
            });
            spawns.push({
                runtimeId: state.runtimeId,
                monsterId,
                x: state.x,
                y: state.y,
                spawnOriginX: Number.isFinite(Number(state.spawnOriginX)) ? Math.trunc(Number(state.spawnOriginX)) : state.x,
                spawnOriginY: Number.isFinite(Number(state.spawnOriginY)) ? Math.trunc(Number(state.spawnOriginY)) : state.y,
                spawnKey: typeof state.spawnKey === 'string' && state.spawnKey.trim()
                    ? state.spawnKey.trim()
                    : buildMonsterSpawnKey(mapId, monsterId, Number.isFinite(Number(state.spawnOriginX)) ? Math.trunc(Number(state.spawnOriginX)) : state.x, Number.isFinite(Number(state.spawnOriginY)) ? Math.trunc(Number(state.spawnOriginY)) : state.y),
                hp: Math.max(0, Math.min(state.hp, resolvedStats.maxHp)),
                maxHp: resolvedStats.maxHp,
                respawnTicks: Number.isFinite(Number(state.respawnTicks))
                    ? Math.max(1, Math.trunc(Number(state.respawnTicks)))
                    : template.respawnTicks,
                alive: state.alive,
                respawnLeft: state.alive ? 0 : Math.max(0, state.respawnLeft),
                facing: state.facing,
                name: template.name,
                char: template.char,
                color: template.color,
                level: resolvedStats.level,
                tier: resolvedStats.tier,
                expMultiplier: resolvedStats.expMultiplier,
                baseAttrs: resolvedStats.attrs,
                baseNumericStats: resolvedStats.numericStats,
                ratioDivisors: template.ratioDivisors,
                statFormula: template.statFormula,
                initialBuffs: template.initialBuffs,
                skills: template.skills,
                aggroRange: template.aggroRange,
                leashRange: template.leashRange,
                attackRange: template.attackRange,
                attackCooldownTicks: template.attackCooldownTicks,
                wanderRadius: Number.isFinite(Number(state.wanderRadius)) ? Math.max(0, Math.trunc(Number(state.wanderRadius))) : 0,
            });
        }
        return spawns;
    }
    /**
 * createRuntimeMonsterSpawn：按模板和覆盖项构造单只运行态妖兽。
 * @param monsterId 妖兽模板 ID。
 * @param options 运行态覆盖项。
 * @returns 妖兽运行态生成记录；模板不存在时返回 null。
 */

    createRuntimeMonsterSpawn(monsterId, options: any = {}) {
        const normalizedMonsterId = typeof monsterId === 'string' ? monsterId.trim() : '';
        if (!normalizedMonsterId) {
            return null;
        }
        const template = this.monsterRuntimeTemplates.get(normalizedMonsterId);
        if (!template) {
            return null;
        }
        const x = Number.isFinite(Number(options.x)) ? Math.trunc(Number(options.x)) : 0;
        const y = Number.isFinite(Number(options.y)) ? Math.trunc(Number(options.y)) : 0;
        const spawnOriginX = Number.isFinite(Number(options.spawnOriginX)) ? Math.trunc(Number(options.spawnOriginX)) : x;
        const spawnOriginY = Number.isFinite(Number(options.spawnOriginY)) ? Math.trunc(Number(options.spawnOriginY)) : y;
        const resolvedStats = resolveMonsterRuntimeTemplateStats(template, {
            level: options.level,
            tier: options.tier,
        });
        return {
            runtimeId: typeof options.runtimeId === 'string' && options.runtimeId.trim()
                ? options.runtimeId.trim()
                : `monster:dynamic:${normalizedMonsterId}:${Date.now()}`,
            monsterId: normalizedMonsterId,
            x,
            y,
            spawnOriginX,
            spawnOriginY,
            spawnKey: typeof options.spawnKey === 'string' && options.spawnKey.trim()
                ? options.spawnKey.trim()
                : buildMonsterSpawnKey('dynamic', normalizedMonsterId, spawnOriginX, spawnOriginY),
            hp: resolvedStats.maxHp,
            maxHp: resolvedStats.maxHp,
            respawnTicks: Number.isFinite(Number(options.respawnTicks))
                ? Math.max(1, Math.trunc(Number(options.respawnTicks)))
                : template.respawnTicks,
            alive: options.alive === false ? false : true,
            respawnLeft: 0,
            facing: Direction.South,
            name: typeof options.name === 'string' && options.name.trim() ? options.name.trim() : template.name,
            char: template.char,
            color: template.color,
            level: resolvedStats.level,
            tier: resolvedStats.tier,
            expMultiplier: resolvedStats.expMultiplier,
            baseAttrs: resolvedStats.attrs,
            baseNumericStats: resolvedStats.numericStats,
            ratioDivisors: template.ratioDivisors,
            statFormula: template.statFormula,
            initialBuffs: template.initialBuffs,
            skills: template.skills,
            aggroRange: template.aggroRange,
            leashRange: template.leashRange,
            attackRange: template.attackRange,
            attackCooldownTicks: template.attackCooldownTicks,
            wanderRadius: Number.isFinite(Number(options.wanderRadius)) ? Math.max(0, Math.trunc(Number(options.wanderRadius))) : 0,
        };
    }
    
    buildFallbackMonsterRuntimeStatesForMap(mapId) {


        const filePath = findMapDocumentFile(mapId);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        const document = normalizeEditableMapDocument(raw);

        const spawns = Array.isArray(document.monsterSpawns) ? document.monsterSpawns : [];
        const rawSpawns = Array.isArray(raw?.monsterSpawns) ? raw.monsterSpawns : [];
        if (spawns.length === 0) {
            return null;
        }

        const runtimeStates = [];

        const nextIndexByMonsterId = new Map();

        const occupied = new Set();

        for (let spawnIndex = 0; spawnIndex < spawns.length; spawnIndex += 1) {
            const spawn = spawns[spawnIndex];
            const rawSpawn = rawSpawns[spawnIndex] && typeof rawSpawns[spawnIndex] === 'object'
                ? rawSpawns[spawnIndex]
                : {};
            const monsterId = typeof spawn.templateId === 'string' && spawn.templateId.trim()
                ? spawn.templateId.trim()
                : (typeof spawn.id === 'string' ? spawn.id.trim() : '');

            const template = monsterId ? this.monsterRuntimeTemplates.get(monsterId) : null;
            if (!template) {
                continue;
            }

            const tier = normalizeMonsterTier(spawn.tier ?? template.tier);
            const population = resolveFallbackSpawnPopulation(
                tier,
                Number.isFinite(rawSpawn.count) ? rawSpawn.count : template.count,
                Number.isFinite(rawSpawn.maxAlive) ? rawSpawn.maxAlive : template.maxAlive,
            );
            const count = population.maxAlive;
            const respawnTicks = resolveFallbackSpawnRespawnTicks(rawSpawn, template);
            const spawnOriginX = Math.trunc(spawn.x);
            const spawnOriginY = Math.trunc(spawn.y);
            const spawnKey = buildMonsterSpawnKey(mapId, monsterId, spawnOriginX, spawnOriginY);
            const radius = Number.isFinite(rawSpawn.radius)
                ? Math.max(0, Math.trunc(Number(rawSpawn.radius)))
                : Math.max(0, Math.trunc(Number(template.radius) || 0));
            const wanderRadius = Number.isFinite(rawSpawn.wanderRadius)
                ? Math.max(0, Math.trunc(Number(rawSpawn.wanderRadius)))
                : radius;

            const positions = resolveFallbackSpawnPositions(document, { ...spawn, radius }, count, occupied);
            for (const position of positions) {
                const nextIndex = nextIndexByMonsterId.get(monsterId) ?? 0;
                nextIndexByMonsterId.set(monsterId, nextIndex + 1);
                const alive = position.alive !== false;
                runtimeStates.push({
                    runtimeId: `monster:${mapId}:${monsterId}:${nextIndex}`,
                    spawnOriginX,
                    spawnOriginY,
                    spawnKey,
                    x: position.x,
                    y: position.y,
                    hp: alive ? template.maxHp : 0,
                    alive,
                    respawnLeft: alive ? 0 : respawnTicks,
                    respawnTicks,
                    facing: Direction.South,
                    wanderRadius,
                    level: Number.isFinite(rawSpawn.level)
                        ? Math.max(1, Math.trunc(Number(rawSpawn.level)))
                        : undefined,
                    tier: typeof rawSpawn.tier === 'string' && rawSpawn.tier.trim()
                        ? rawSpawn.tier.trim()
                        : undefined,
                });
            }
        }
        if (runtimeStates.length === 0) {
            return null;
        }
        this.monsterRuntimeStatesByMapId.set(mapId, runtimeStates);
        return runtimeStates;
    }
    
    getMonsterCombatProfile(monsterId) {


        const template = this.monsterRuntimeTemplates.get(monsterId);
        if (!template) {
            return null;
        }
        return {
            attrs: cloneMonsterAttributes(template.attrs),
            numericStats: cloneNumericStats(template.numericStats),
            ratioDivisors: cloneNumericRatioDivisors(template.ratioDivisors),
            expMultiplier: template.expMultiplier,
        };
    }
    
    getSkill(skillId) {
        // N44：走 skillTemplatesById O(1) 索引；旧版嵌套循环（外 technique × 内 skills.find）已废弃。
        const skill = this.skillTemplatesById.get(skillId);
        return skill ? cloneSkill(skill) : null;
    }
    
    loadSharedTechniqueBuffs() {


        const sharedBuffFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'technique-buffs'));
        for (const file of sharedBuffFiles) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (!Array.isArray(parsed)) {
                continue;
            }
            for (const entry of parsed) {
                const effect = normalizeSharedTechniqueBuffEffect(entry);
                if (!effect) {
                    continue;
                }
                this.sharedTechniqueBuffs.set(effect.id, effect);
            }
        }
    }
    
    loadAll() {

        this.itemTemplates.clear();
        this.techniqueTemplates.clear();
        this.skillTemplatesById.clear();
        this.sharedTechniqueBuffs.clear();
        this.formationTemplates.clear();
        this.monsterDropsByMonsterId.clear();
        this.monsterRuntimeTemplates.clear();
        this.monsterRuntimeStatesByMapId.clear();
        this.monsterRealmBaselines = undefined;
        this.starterInventoryEntries = [];
        resetMapDocumentFileIndex();

        const itemFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'items'));
        for (const file of itemFiles) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (!Array.isArray(parsed)) {
                continue;
            }
            for (const entry of parsed) {
                const normalized = normalizeItemTemplate(entry);
                if (!normalized) {
                    continue;
                }
                this.itemTemplates.set(normalized.itemId, normalized);
            }
        }
        this.loadSharedTechniqueBuffs();

        const formationsPath = resolveProjectPath('packages', 'server', 'data', 'content', 'formations.json');
        if (fs.existsSync(formationsPath)) {
            const parsedFormations = JSON.parse(fs.readFileSync(formationsPath, 'utf-8'));
            if (Array.isArray(parsedFormations)) {
                for (const entry of parsedFormations) {
                    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()) {
                        continue;
                    }
                    this.formationTemplates.set(entry.id.trim(), { ...entry, id: entry.id.trim() });
                }
            }
        }

        const techniqueFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'techniques'));
        for (const file of techniqueFiles) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (!Array.isArray(parsed)) {
                continue;
            }
            for (const entry of parsed) {
                const normalized = normalizeTechniqueTemplate(entry, this.sharedTechniqueBuffs);
                if (!normalized) {
                    continue;
                }
                this.techniqueTemplates.set(normalized.id, normalized);
            }
        }
        // N44：technique 填充完成后立即建 skillTemplatesById 反向索引；
        // 后续 loadMonsterDrops -> normalizeMonsterSkills -> getSkill 直接走 O(1) 查询。
        this.skillTemplatesById.clear();
        for (const technique of this.techniqueTemplates.values()) {
            if (!technique || !Array.isArray(technique.skills)) {
                continue;
            }
            for (const skill of technique.skills) {
                if (!skill || typeof skill.id !== 'string' || !skill.id) {
                    continue;
                }
                // 同一 skillId 在多个 technique 中重复定义时按先到先得策略，
                // 与旧版 for-of + skills.find 一致：返回第一次匹配。
                if (!this.skillTemplatesById.has(skill.id)) {
                    this.skillTemplatesById.set(skill.id, skill);
                }
            }
        }

        const starterPath = resolveProjectPath('packages', 'server', 'data', 'content', 'starter-inventory.json');

        const starterRaw = JSON.parse(fs.readFileSync(starterPath, 'utf-8'));
        this.starterInventoryEntries = Array.isArray(starterRaw.items)
            ? starterRaw.items
                .map((entry) => normalizeStarterInventoryEntry(entry))
                .filter((entry) => Boolean(entry))
            : [];
        this.monsterRealmBaselines = loadMonsterRealmBaselines();
        this.loadMonsterDrops();
        this.logger.log(`已加载 ${this.itemTemplates.size} 个物品模板、${this.techniqueTemplates.size} 个功法、${this.monsterDropsByMonsterId.size} 张妖兽掉落表和 ${this.starterInventoryEntries.length} 条初始物品记录`);
    }
    
    loadMonsterDrops() {


        const monsterFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'monsters'));
        for (const file of monsterFiles) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (!Array.isArray(parsed)) {
                continue;
            }
            for (const entry of parsed) {
                if (!entry || typeof entry !== 'object') {
                    continue;
                }

                const monster = entry;

                const monsterId = typeof monster.id === 'string' ? monster.id.trim() : '';
                if (!monsterId) {
                    continue;
                }

                const runtimeTemplate = this.normalizeMonsterRuntimeTemplate(monster);
                if (runtimeTemplate) {
                    this.monsterRuntimeTemplates.set(monsterId, runtimeTemplate);
                }

                const drops = this.buildMonsterDrops(monster.drops, monster.equipment, {
                    grade: normalizeTechniqueGrade(monster.grade),
                    tier: normalizeMonsterTier(monster.tier ?? inferMonsterTierFromName(monster.name)),

                    level: typeof monster.level === 'number' && Number.isFinite(monster.level)
                        ? Math.max(1, Math.trunc(monster.level))
                        : undefined,
                    suppressSpiritStoneDrop: monster.suppressSpiritStoneDrop === true,
                });
                if (drops.length > 0) {
                    this.monsterDropsByMonsterId.set(monsterId, drops);
                }
            }
        }
        this.loadMonsterRuntimeStates();
    }
    
    buildMonsterDrops(rawDrops, rawEquipment, context) {


        const configuredDrops = Array.isArray(rawDrops)
            ? rawDrops
                .map((entry) => this.normalizeMonsterDropEntry(entry))
                .filter((entry) => Boolean(entry))
            : [];

        let spiritStoneOverride = undefined;

        const drops = [];
        for (const entry of configuredDrops) {
            if (entry.itemId === 'spirit_stone') {
                spiritStoneOverride = entry;
                continue;
            }
            drops.push(this.resolveMonsterDropChance(entry, context));
        }

        const existingItemIds = new Set(drops.map((entry) => entry.itemId));
        if (rawEquipment && typeof rawEquipment === 'object') {

            const equipment = rawEquipment;
            for (const slot of EQUIP_SLOTS) {
                const itemId = this.resolveRawEquipmentItemId(equipment[slot]);
                if (!itemId || existingItemIds.has(itemId)) {
                    continue;
                }

                const item = this.itemTemplates.get(itemId);
                if (!item || item.type !== 'equipment') {
                    continue;
                }
                drops.push(this.resolveMonsterDropChance({
                    itemId,
                    name: item.name ?? itemId,
                    type: item.type,
                    count: 1,
                }, context));
                existingItemIds.add(itemId);
            }
        }

        const spiritStoneDrop = context?.suppressSpiritStoneDrop === true
            ? null
            : this.buildSpiritStoneMonsterDrop(context, spiritStoneOverride);
        if (spiritStoneDrop) {
            drops.push(spiritStoneDrop);
        }
        return drops;
    }
    
    resolveMonsterDropChance(drop, context) {

        if (typeof drop.chance === 'number') {
            return {
                ...drop,
                chance: Math.max(0, Math.min(1, drop.chance)),
            };
        }
        return {
            ...drop,
            chance: this.computeDefaultMonsterDropChance(drop, context),
        };
    }
    
    computeDefaultMonsterDropChance(drop, context) {

        if (drop.type === 'quest_item') {
            return 1;
        }
        if (drop.type === 'material') {
            return this.getMaterialBaseDropChance(context.tier);
        }
        if (drop.type === 'equipment') {
            return this.getEquipmentBaseDropChance(context.tier);
        }

        const categoryBase = this.getMonsterDropCategoryBase(drop);

        const itemGrade = this.getMonsterDropItemGrade(drop);

        const monsterGradeIndex = resolveTechniqueGradeOrder(context.grade) ?? 0;

        const itemGradeIndex = resolveTechniqueGradeOrder(itemGrade) ?? 0;

        const gradeDelta = Math.max(-7, monsterGradeIndex - itemGradeIndex);

        const chance = 0.01 * categoryBase * (3 ** gradeDelta) * this.getMonsterTierDropFactor(context.tier);
        return Math.max(Number.MIN_VALUE, Math.min(1, chance));
    }
    
    getMaterialBaseDropChance(tier) {
        switch (tier) {
            case 'variant':
                return 0.2;
            case 'demon_king':
                return 0.5;
            default:
                return 0.05;
        }
    }
    getEquipmentBaseDropChance(tier) {
        switch (tier) {
            case 'variant':
                return 0.2;
            case 'demon_king':
                return 0.5;
            default:
                return 0.05;
        }
    }
    getOrdinaryMonsterSpiritStoneDropMultiplier(drop, context) {
        if (drop.itemId !== 'spirit_stone' || normalizeSharedMonsterTier(context?.monsterTier) !== 'mortal_blood') {
            return 1;
        }
        const playerRealmLv = Math.max(1, Math.floor(Number(context?.playerRealmLv) || 1));
        const monsterLevel = Math.max(1, Math.floor(Number(context?.monsterLevel) || 1));
        return playerRealmLv - monsterLevel >= ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD
            ? ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER
            : 1;
    }
    
    getMonsterDropCategoryBase(drop) {

        if (drop.itemId === 'spirit_stone') {
            return 1;
        }
        switch (drop.type) {
            case 'skill_book':
                return 1;
            case 'equipment':
                return 2;
            case 'material':
                return 20;
            case 'consumable':
                return 10;
            case 'quest_item':
                return 100;
            default:
                return 1;
        }
    }
    
    getMonsterTierDropFactor(tier) {
        switch (tier) {
            case 'variant':
                return 1 / 3;
            case 'demon_king':
                return 1;
            default:
                return 0.1;
        }
    }
    
    getMonsterDropItemGrade(drop) {


        const item = this.itemTemplates.get(drop.itemId);
        if (item?.grade) {
            return normalizeTechniqueGrade(item.grade);
        }
        if (item?.learnTechniqueId) {
            return normalizeTechniqueGrade(this.techniqueTemplates.get(item.learnTechniqueId)?.grade);
        }
        if (typeof item?.level === 'number' && Number.isFinite(item.level)) {
            return inferTechniqueGradeFromItemLevel(item.level);
        }
        return 'mortal';
    }
    
    buildSpiritStoneMonsterDrop(context, override) {


        const item = this.itemTemplates.get('spirit_stone');
        if (!item) {
            return null;
        }

        const count = typeof override?.count === 'number' && Number.isFinite(override.count)
            ? Math.max(1, Math.trunc(override.count))
            : this.computeSpiritStoneDropCount(context);

        const chance = typeof override?.chance === 'number' && Number.isFinite(override.chance)
            ? Math.max(0, Math.min(1, override.chance))
            : this.computeSpiritStoneDropChance(context.tier);
        return {
            itemId: item.itemId,
            name: item.name ?? item.itemId,
            type: item.type,
            count,
            chance,
        };
    }
    
    computeSpiritStoneDropChance(tier) {
        switch (tier) {
            case 'variant':
                return 0.03;
            case 'demon_king':
                return 0.1;
            default:
                return 0.01;
        }
    }
    
    computeSpiritStoneDropCount(context) {

        const gradeIndex = Math.max(0, resolveTechniqueGradeOrder(context.grade) ?? 0);

        const level = typeof context.level === 'number' && Number.isFinite(context.level)
            ? Math.max(1, Math.trunc(context.level))
            : 1;
        return Math.max(1, Math.floor(1 + (gradeIndex * 0.5) + (Math.floor(level / 12) * 0.5)));
    }
    
    resolveRawEquipmentItemId(entry) {

        if (typeof entry === 'string') {
            return entry.trim();
        }
        if (entry && typeof entry === 'object' && typeof entry.itemId === 'string') {
            return entry.itemId.trim();
        }
        return '';
    }
    
    normalizeMonsterDropEntry(raw) {

        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const candidate = raw;
        if (typeof candidate.itemId !== 'string' || !candidate.itemId.trim()) {
            return null;
        }

        const itemId = candidate.itemId.trim();

        const item = this.itemTemplates.get(itemId);

        const type = candidate.type ?? item?.type;
        if (!type) {
            return null;
        }
        return {
            itemId,

            name: typeof candidate.name === 'string' && candidate.name.trim()
                ? candidate.name
                : (item?.name ?? itemId),
            type,
            count: Number.isFinite(candidate.count) ? Math.max(1, Math.trunc(candidate.count ?? 1)) : 1,
            chance: Number.isFinite(candidate.chance) ? Math.max(0, Math.min(1, Number(candidate.chance))) : undefined,
        };
    }
    
    getLootPoolCandidateIds(query) {


        const result = [];
        for (const [itemId, item] of this.itemTemplates) {
            if (!matchesLootPoolFilters(item, query)) {
                continue;
            }
            result.push(itemId);
        }
        result.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        return result;
    }
    
    normalizeMonsterRuntimeTemplate(raw) {


        const id = typeof raw.id === 'string' ? raw.id.trim() : '';

        const name = typeof raw.name === 'string' ? raw.name : '';

        const char = typeof raw.char === 'string' ? raw.char : '';

        const color = typeof raw.color === 'string' ? raw.color : '';
        if (!id || !name || !char || !color) {
            return null;
        }

        const resolved = resolveMonsterTemplateRecord(raw, undefined, this.monsterRealmBaselines);

        const tier = resolved.tier;

        const level = resolved.level ?? 1;

        const attrs = cloneMonsterAttributes(resolved.resolvedAttrs);

        const numericStats = cloneNumericStats(resolved.computedStats);

        const maxHp = normalizeMonsterMaxHp(raw.maxHp, raw.hp, attrs, numericStats);
        if (maxHp <= 0) {
            return null;
        }
        return {
            id,
            name,
            char,
            color,
            level,
            tier,
            maxHp,
            count: Number.isFinite(raw.count)
                ? Math.max(1, Math.trunc(Number(raw.count)))
                : (Number.isFinite(raw.maxAlive) ? Math.max(1, Math.trunc(Number(raw.maxAlive))) : 1),
            radius: Number.isFinite(raw.radius) ? Math.max(0, Math.trunc(Number(raw.radius))) : 3,
            maxAlive: Number.isFinite(raw.maxAlive)
                ? Math.max(1, Math.trunc(Number(raw.maxAlive)))
                : (Number.isFinite(raw.count) ? Math.max(1, Math.trunc(Number(raw.count))) : 1),
            respawnTicks: normalizeMonsterRespawnTicks(raw.respawnTicks, raw.respawnSec),
            attrs,
            numericStats,
            ratioDivisors: cloneNumericRatioDivisors(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].ratioDivisors),
            expMultiplier: resolved.expMultiplier,
            statFormula: createMonsterStatFormula(raw, this.monsterRealmBaselines),
            initialBuffs: normalizeMonsterInitialBuffs(raw.initialBuffs),
            skills: this.normalizeMonsterSkills(raw.skills, id),
            aggroRange: normalizeMonsterAggroRange(raw.aggroRange, raw.radius, numericStats.viewRange),
            leashRange: normalizeMonsterLeashRange(raw.aggroRange, raw.radius, numericStats.viewRange),
            attackRange: 1,
            attackCooldownTicks: 2,
        };
    }
    
    normalizeMonsterSkills(raw, monsterId) {

        if (!Array.isArray(raw)) {
            return [];
        }

        const normalized = [];

        const seen = new Set();
        for (const entry of raw) {
            if (typeof entry !== 'string') {
                continue;
            }

            const skillId = entry.trim();
            if (!skillId || seen.has(skillId)) {
                continue;
            }

            const skill = this.getSkill(skillId);
            if (!skill) {
                this.logger.warn(`妖兽 ${monsterId} 配置了不存在的技能 ${skillId}，已忽略`);
                continue;
            }
            normalized.push(skill);
            seen.add(skillId);
        }
        normalized.sort((left, right) => {

            const rangeGap = resolveSkillRange(right) - resolveSkillRange(left);
            if (rangeGap !== 0) {
                return rangeGap;
            }

            const cooldownGap = (right.cooldown ?? 0) - (left.cooldown ?? 0);
            if (cooldownGap !== 0) {
                return cooldownGap;
            }
            return left.id.localeCompare(right.id, 'zh-Hans-CN');
        });
        return normalized;
    }
    
    loadMonsterRuntimeStates() {


        const runtimePath = resolveProjectPath('packages', 'server', 'data', 'runtime', 'map-monster-runtime-state.json');
        if (!fs.existsSync(runtimePath)) {
            return;
        }

        const parsed = JSON.parse(fs.readFileSync(runtimePath, 'utf-8'));
        if (!parsed || typeof parsed !== 'object') {
            return;
        }

        const maps = parsed.maps;
        if (!maps || typeof maps !== 'object') {
            return;
        }
        for (const [mapId, rawEntries] of Object.entries(maps)) {
            if (!Array.isArray(rawEntries)) {
                continue;
            }

            const entries = rawEntries
                .map((entry) => normalizeMonsterRuntimeStateRecord(entry))
                .filter((entry) => Boolean(entry));
            if (entries.length > 0) {
                this.monsterRuntimeStatesByMapId.set(mapId, entries);
            }
        }
    }
};

function parseMonsterIdFromRuntimeId(runtimeId) {

    const parts = runtimeId.split(':');
    return parts.length >= 4 ? parts[2] ?? '' : '';
}
const mapDocumentFileById = new Map();
let mapDocumentFileIndexLoaded = false;
function resetMapDocumentFileIndex() {
    mapDocumentFileById.clear();
    mapDocumentFileIndexLoaded = false;
}
function findMapDocumentFile(mapId) {
    const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';
    if (!normalizedMapId) {
        return '';
    }
    const directPath = resolveProjectPath('packages', 'server', 'data', 'maps', `${normalizedMapId}.json`);
    if (fs.existsSync(directPath)) {
        return directPath;
    }
    if (!mapDocumentFileIndexLoaded) {
        mapDocumentFileIndexLoaded = true;
        const mapsDir = resolveProjectPath('packages', 'server', 'data', 'maps');
        if (fs.existsSync(mapsDir)) {
            for (const filePath of collectJsonFiles(mapsDir)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
                    if (id && !mapDocumentFileById.has(id)) {
                        mapDocumentFileById.set(id, filePath);
                    }
                }
                catch {
                    continue;
                }
            }
        }
    }
    return mapDocumentFileById.get(normalizedMapId) ?? '';
}

function normalizeMonsterMaxHp(maxHp, hp, attrs, numericStats) {

    if (typeof maxHp === 'number' && Number.isFinite(maxHp)) {
        return Math.max(1, Math.trunc(maxHp));
    }
    if (typeof hp === 'number' && Number.isFinite(hp)) {
        return Math.max(1, Math.trunc(hp));
    }
    if (attrs && numericStats) {
        if (Number.isFinite(numericStats.maxHp) && numericStats.maxHp > 0) {
            return Math.max(1, Math.round(numericStats.maxHp));
        }
    }
    return 0;
}
/**
 * loadMonsterRealmBaselines：启动期读取妖兽倾向数值基准。
 * @returns 妖兽等级基准配置。
 */

function loadMonsterRealmBaselines() {

    const baselinesPath = resolveProjectPath('packages', 'server', 'data', 'content', 'realm-attr-baselines.json');
    if (!fs.existsSync(baselinesPath)) {
        return undefined;
    }
    const parsed = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.levels)) {
        return undefined;
    }
    return parsed;
}
/**
 * createMonsterStatFormula：保存妖兽属性公式输入，供运行时按当前等级重算。
 * @param raw 原始妖兽配置。
 * @param baselines 妖兽等级基准。
 * @returns 妖兽属性公式输入。
 */

function createMonsterStatFormula(raw, baselines) {
    return {
        raw: cloneMonsterFormulaRaw(raw),
        baselines: cloneMonsterRealmBaselines(baselines),
    };
}
/**
 * resolveMonsterRuntimeTemplateStats：按当前覆盖项动态计算妖兽真实基础属性。
 * @param template 妖兽运行时模板。
 * @param overrides 动态覆盖项。
 * @returns 妖兽当前基础属性。
 */

function resolveMonsterRuntimeTemplateStats(template, overrides: any = {}) {
    const formula = template.statFormula;
    if (!formula?.raw) {
        return {
            level: template.level,
            tier: template.tier,
            expMultiplier: template.expMultiplier,
            attrs: cloneMonsterAttributes(template.attrs),
            numericStats: cloneNumericStats(template.numericStats),
            maxHp: template.maxHp,
        };
    }
    const raw: any = cloneMonsterFormulaRaw(formula.raw);
    if (Number.isFinite(Number(overrides.level))) {
        raw.level = Math.max(1, Math.trunc(Number(overrides.level)));
    }
    if (typeof overrides.tier === 'string' && overrides.tier.trim()) {
        raw.tier = overrides.tier.trim();
    }
    const resolved = resolveMonsterTemplateRecord(raw, undefined, formula.baselines);
    const attrs = cloneMonsterAttributes(resolved.resolvedAttrs);
    const numericStats = cloneNumericStats(resolved.computedStats);
    return {
        level: resolved.level ?? template.level,
        tier: resolved.tier,
        expMultiplier: resolved.expMultiplier,
        attrs,
        numericStats,
        maxHp: normalizeMonsterMaxHp(raw.maxHp, raw.hp, attrs, numericStats),
    };
}
/**
 * cloneMonsterStatFormula：克隆妖兽公式输入。
 * @param source 来源公式。
 * @returns 克隆后的公式。
 */

function cloneMonsterStatFormula(source) {
    if (!source?.raw) {
        return undefined;
    }
    return {
        raw: cloneMonsterFormulaRaw(source.raw),
        baselines: cloneMonsterRealmBaselines(source.baselines),
    };
}
/**
 * cloneMonsterFormulaRaw：只克隆影响妖兽属性公式的配置字段。
 * @param raw 原始配置。
 * @returns 公式配置。
 */

function cloneMonsterFormulaRaw(raw) {
    return {
        id: typeof raw?.id === 'string' ? raw.id : '',
        name: typeof raw?.name === 'string' ? raw.name : '',
        char: typeof raw?.char === 'string' ? raw.char : '',
        color: typeof raw?.color === 'string' ? raw.color : '',
        grade: raw?.grade,
        tier: raw?.tier,
        level: raw?.level,
        expMultiplier: raw?.expMultiplier,
        valueStats: clonePlainValue(raw?.valueStats),
        attrs: clonePlainValue(raw?.attrs),
        attrTendency: clonePlainValue(raw?.attrTendency),
        statPercents: clonePlainValue(raw?.statPercents),
        statTendency: clonePlainValue(raw?.statTendency),
    };
}
/**
 * cloneMonsterRealmBaselines：克隆妖兽等级基准配置。
 * @param source 来源基准。
 * @returns 克隆后的基准。
 */

function cloneMonsterRealmBaselines(source) {
    if (!source || typeof source !== 'object') {
        return undefined;
    }
    return {
        version: source.version,
        levels: Array.isArray(source.levels)
            ? source.levels.map((entry) => ({ ...entry }))
            : undefined,
    };
}
/**
 * clonePlainValue：克隆 JSON 风格配置值。
 * @param value 来源值。
 * @returns 克隆值。
 */

function clonePlainValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => clonePlainValue(entry));
    }
    if (value && typeof value === 'object') {
        const result = {};
        for (const [key, entry] of Object.entries(value)) {
            result[key] = clonePlainValue(entry);
        }
        return result;
    }
    return value;
}

function normalizeMonsterRespawnTicks(respawnTicks, respawnSec) {

    if (typeof respawnTicks === 'number' && Number.isFinite(respawnTicks)) {
        return Math.max(1, Math.trunc(respawnTicks));
    }
    if (typeof respawnSec === 'number' && Number.isFinite(respawnSec)) {
        return Math.max(1, Math.trunc(respawnSec));
    }
    return 15;
}

function normalizeMonsterTier(raw) {
    return raw === 'variant' || raw === 'demon_king' ? raw : 'mortal_blood';
}

function normalizeTechniqueGrade(raw) {
    switch (raw) {
        case 'yellow':
        case 'mystic':
        case 'earth':
        case 'heaven':
        case 'spirit':
        case 'saint':
        case 'emperor':
            return raw;
        default:
            return 'mortal';
    }
}

function buildTechniqueRuntimeStateFromTemplate(template: any, input: any = {}) {
    const level = Number.isFinite(input?.level) ? Math.max(1, Math.trunc(Number(input.level))) : 1;
    const exp = Number.isFinite(input?.exp) ? Math.max(0, Math.trunc(Number(input.exp))) : 0;
    const expToNext = Number.isFinite(input?.expToNext)
        ? Math.max(0, Math.trunc(Number(input.expToNext)))
        : (getTechniqueExpToNext(level, template.layers) ?? 0);
    return {
        techId: template.id,
        name: template.name,
        level,
        exp,
        expToNext,
        realmLv: template.realmLv,
        realm: Number.isFinite(input?.realm)
            ? Math.max(0, Math.trunc(Number(input.realm)))
            : deriveTechniqueRealm(level, template.layers),
        skillsEnabled: input?.skillsEnabled !== false,
        // skills/layers 是启动期内容模板，运行态只读共享；玩家态只保留等级/经验等动态字段。
        skills: template.skills,
        grade: template.grade,
        category: template.category,
        layers: template.layers,
    };
}

function cloneSkill(source) {
    return {
        ...source,
        targeting: source.targeting ? { ...source.targeting } : undefined,
        effects: source.effects.map((entry) => ({ ...entry })),
    };
}

function resolveSkillRange(skill) {


    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}

function normalizeMonsterAggroRange(aggroRange, radius, viewRange) {

    if (typeof aggroRange === 'number' && Number.isFinite(aggroRange)) {
        return Math.max(1, Math.trunc(aggroRange));
    }
    if (typeof radius === 'number' && Number.isFinite(radius)) {
        return Math.max(1, Math.trunc(radius));
    }
    if (Number.isFinite(viewRange) && viewRange > 0) {
        return Math.max(1, Math.min(8, Math.round(viewRange)));
    }
    return 4;
}

function normalizeMonsterLeashRange(aggroRange, radius, viewRange) {
    return Math.max(2, normalizeMonsterAggroRange(aggroRange, radius, viewRange) + 4);
}

function normalizeMonsterRuntimeStateRecord(raw) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const entry = raw;

    const runtimeId = typeof entry.runtimeId === 'string' ? entry.runtimeId.trim() : '';

    const x = entry.x;

    const y = entry.y;

    const hp = entry.hp;
    if (!runtimeId) {
        return null;
    }
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y) || typeof hp !== 'number' || !Number.isFinite(hp)) {
        return null;
    }
    return {
        runtimeId,
        x: Math.trunc(x),
        y: Math.trunc(y),
        hp: Math.max(0, Math.trunc(hp)),
        spawnOriginX: typeof entry.spawnOriginX === 'number' && Number.isFinite(entry.spawnOriginX)
            ? Math.trunc(entry.spawnOriginX)
            : undefined,
        spawnOriginY: typeof entry.spawnOriginY === 'number' && Number.isFinite(entry.spawnOriginY)
            ? Math.trunc(entry.spawnOriginY)
            : undefined,
        spawnKey: typeof entry.spawnKey === 'string' && entry.spawnKey.trim()
            ? entry.spawnKey.trim()
            : undefined,

        alive: entry.alive !== false,

        respawnLeft: typeof entry.respawnLeft === 'number' && Number.isFinite(entry.respawnLeft)
            ? Math.max(0, Math.trunc(entry.respawnLeft))
            : 0,
        respawnTicks: typeof entry.respawnTicks === 'number' && Number.isFinite(entry.respawnTicks)
            ? Math.max(1, Math.trunc(entry.respawnTicks))
            : undefined,
        level: typeof entry.level === 'number' && Number.isFinite(entry.level)
            ? Math.max(1, Math.trunc(entry.level))
            : (typeof entry.monsterLevel === 'number' && Number.isFinite(entry.monsterLevel)
                ? Math.max(1, Math.trunc(entry.monsterLevel))
                : undefined),
        tier: typeof entry.tier === 'string' && entry.tier.trim()
            ? entry.tier.trim()
            : (typeof entry.monsterTier === 'string' && entry.monsterTier.trim()
                ? entry.monsterTier.trim()
                : undefined),

        facing: typeof entry.facing === 'number' && Number.isFinite(entry.facing)
            ? Math.trunc(entry.facing)
            : Direction.South,
    };
}
const ORDINARY_MONSTER_SPAWN_COUNT = 4;
const ORDINARY_MONSTER_SPAWN_MAX_ALIVE = 6;
/**
 * resolveFallbackSpawnPopulation：按 main 刷怪语义解析刷新点种群规模。
 * @param tier 妖兽血脉层次。
 * @param configuredCount 配置数量。
 * @param configuredMaxAlive 配置最大存活数。
 * @returns 数量与最大存活数。
 */

function resolveFallbackSpawnPopulation(tier, configuredCount, configuredMaxAlive) {
    if (tier === 'mortal_blood') {
        return {
            count: ORDINARY_MONSTER_SPAWN_COUNT,
            maxAlive: ORDINARY_MONSTER_SPAWN_MAX_ALIVE,
        };
    }
    const maxAlive = Math.max(1, Math.round(Number(configuredMaxAlive) || 1));
    const count = Math.min(Math.max(1, Math.round(Number(configuredCount) || maxAlive)), maxAlive);
    return { count, maxAlive };
}
/**
 * resolveFallbackSpawnRespawnTicks：优先使用地图刷新点覆盖，再回退怪物模板。
 * @param spawn 地图刷新点。
 * @param template 怪物运行时模板。
 * @returns 重生间隔 tick。
 */

function resolveFallbackSpawnRespawnTicks(spawn, template) {
    if (Number.isFinite(spawn.respawnTicks)) {
        return Math.max(1, Math.trunc(Number(spawn.respawnTicks)));
    }
    if (Number.isFinite(spawn.respawnSec)) {
        return Math.max(1, Math.trunc(Number(spawn.respawnSec)));
    }
    return Math.max(1, Math.trunc(Number(template.respawnTicks) || 15));
}
/**
 * buildMonsterSpawnKey：构建同一刷新点的稳定分组键。
 * @param mapId 地图 ID。
 * @param monsterId 怪物模板 ID。
 * @param spawnX 刷新点 X。
 * @param spawnY 刷新点 Y。
 * @returns 刷新点分组键。
 */

function buildMonsterSpawnKey(mapId, monsterId, spawnX, spawnY) {
    return `monster_spawn:${mapId}:${monsterId}:${spawnX}:${spawnY}`;
}

function cloneMonsterAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        strength: source.strength ?? source.comprehension ?? 0,
        meridians: source.meridians ?? source.luck ?? 0,
    };
}

function collectJsonFiles(dirPath) {


    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));

    const files = [];
    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJsonFiles(entryPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.json')) {
            files.push(entryPath);
        }
    }
    return files;
}

function resolveFallbackSpawnPositions(document, spawn, count, occupied) {


    const radius = Number.isFinite(spawn.radius)
        ? Math.max(0, Math.trunc(spawn.radius))
        : (Number.isFinite(spawn.wanderRadius) ? Math.max(0, Math.trunc(spawn.wanderRadius)) : 0);

    const positions = [];
    for (let distance = 0; distance <= radius && positions.length < count; distance += 1) {
        for (let dy = -distance; dy <= distance && positions.length < count; dy += 1) {
            for (let dx = -distance; dx <= distance && positions.length < count; dx += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) {
                    continue;
                }

                const x = Math.trunc(spawn.x + dx);

                const y = Math.trunc(spawn.y + dy);
                if (x < 0 || y < 0 || x >= document.width || y >= document.height) {
                    continue;
                }

                const key = `${x},${y}`;
                if (occupied.has(key)) {
                    continue;
                }

                const tileType = getTileTypeFromMapChar(document.tiles[y]?.[x] ?? '#');
                if (!isTileTypeWalkable(tileType)) {
                    continue;
                }
                occupied.add(key);
                positions.push({ x, y });
            }
        }
    }
    if (positions.length === 0) {
        positions.push({
            x: Math.max(0, Math.min(document.width - 1, Math.trunc(spawn.x))),
            y: Math.max(0, Math.min(document.height - 1, Math.trunc(spawn.y))),
            alive: false,
        });
    }
    while (positions.length < count) {
        positions.push({
            x: Math.max(0, Math.min(document.width - 1, Math.trunc(spawn.x))),
            y: Math.max(0, Math.min(document.height - 1, Math.trunc(spawn.y))),
            alive: false,
        });
    }
    return positions;
}

function normalizeStarterInventoryEntry(raw) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.itemId !== 'string' || !candidate.itemId.trim()) {
        return null;
    }
    return {
        itemId: candidate.itemId.trim(),
        count: Number.isFinite(candidate.count) ? Math.max(1, Math.trunc(candidate.count ?? 1)) : 1,
    };
}

function normalizeMaterialElementValues(raw) {
  // 配置冷路径只保留正整数五行值，运行时直读已归一化结果。

    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const result = {};
    for (const element of ELEMENT_KEYS) {
        const value = Number(raw[element]);
        if (!Number.isFinite(value) || value <= 0) {
            continue;
        }
        result[element] = Math.max(1, Math.trunc(value));
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeMaterialScalarValues(raw) {
  // 后续材料硬度、药性、纯度等可通过 scalars 扩展，仍在冷路径完成数值规整。

    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = typeof key === 'string' ? key.trim() : '';
        const normalizedValue = Number(value);
        if (!normalizedKey || !Number.isFinite(normalizedValue)) {
            continue;
        }
        result[normalizedKey] = normalizedValue;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeMaterialValues(raw, legacyElements) {
  // 当前只启用 elements，容器结构为后续其他材料属性预留同层扩展口。

    const candidate: any = raw && typeof raw === 'object' ? raw : {};
    const elements = normalizeMaterialElementValues(candidate.elements ?? legacyElements);
    const scalars = normalizeMaterialScalarValues(candidate.scalars);
    const result: any = {};
    if (elements) {
        result.elements = elements;
    }
    if (scalars) {
        result.scalars = scalars;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeMaterialCategory(value) {
    return ['herb', 'exotic', 'ore'].includes(value) ? value : undefined;
}

function normalizeItemTags(raw, materialCategory) {
    const tags = new Set(Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim()) : []);
    switch (materialCategory) {
        case 'herb':
            tags.add('药材');
            break;
        case 'exotic':
            tags.add('异材');
            break;
        case 'ore':
            tags.add('矿石');
            tags.add('矿材');
            break;
    }
    return tags.size > 0 ? [...tags] : undefined;
}

function normalizeItemTemplate(raw) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.itemId !== 'string' || !candidate.itemId.trim()) {
        return null;
    }
    const defaultTileAuraResourceKey = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
    const normalizedTileAuraGainAmount = Number.isFinite(candidate.tileAuraGainAmount)
        ? Number(candidate.tileAuraGainAmount)
        : undefined;
    const normalizedTileResourceGains = Array.isArray(candidate.tileResourceGains)
        ? candidate.tileResourceGains
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
                resourceKey: typeof entry.resourceKey === 'string' ? entry.resourceKey.trim() : '',
                amount: Number.isFinite(entry.amount) ? Number(entry.amount) : NaN,
            }))
            .filter((entry) => entry.resourceKey.length > 0 && Number.isFinite(entry.amount) && entry.amount > 0)
        : undefined;
    const defaultTileResourceGains = normalizedTileAuraGainAmount && normalizedTileAuraGainAmount > 0
        ? [{
            resourceKey: defaultTileAuraResourceKey,
            amount: normalizedTileAuraGainAmount,
        }]
        : undefined;
    const synthesizedTileAuraGainAmount = normalizedTileAuraGainAmount
        ?? normalizedTileResourceGains?.find((entry) => entry.resourceKey === defaultTileAuraResourceKey)?.amount;
    const materialCategory = normalizeMaterialCategory(candidate.materialCategory);
    const compiledEquipBaselineStats = compileEquipmentBaselinePercentsToActualStats(candidate.equipBaselinePercents, {
        grade: candidate.grade,
        level: candidate.level,
    });
    return {
        itemId: candidate.itemId,

        name: typeof candidate.name === 'string' ? candidate.name : undefined,
        type: candidate.type,

        desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,

        groundLabel: typeof candidate.groundLabel === 'string' ? candidate.groundLabel : undefined,
        grade: candidate.grade,
        level: Number.isFinite(candidate.level) ? Math.trunc(candidate.level ?? 0) : undefined,
        materialCategory,
        materialValues: normalizeMaterialValues(candidate.materialValues, candidate.materialElementValues),

        equipSlot: typeof candidate.equipSlot === 'string' && EQUIP_SLOTS.includes(candidate.equipSlot)
            ? candidate.equipSlot
            : undefined,
        equipAttrs: candidate.equipAttrs ? { ...candidate.equipAttrs } : undefined,
        equipStats: compiledEquipBaselineStats ?? (candidate.equipStats ? { ...candidate.equipStats } : undefined),
        equipValueStats: compiledEquipBaselineStats ? undefined : (candidate.equipValueStats ? { ...candidate.equipValueStats } : undefined),
        equipSpecialStats: normalizeItemSpecialStats(candidate.equipSpecialStats),
        effects: Array.isArray(candidate.effects) ? candidate.effects.slice() : undefined,
        healAmount: Number.isFinite(candidate.healAmount) ? Math.max(1, Math.trunc(candidate.healAmount ?? 0)) : undefined,
        healPercent: Number.isFinite(candidate.healPercent) ? clampUnitRatio(candidate.healPercent ?? 0) : undefined,
        qiPercent: Number.isFinite(candidate.qiPercent) ? clampUnitRatio(candidate.qiPercent ?? 0) : undefined,
        alchemySuccessRate: normalizeUtilityRate(candidate.alchemySuccessRate),
        alchemySpeedRate: normalizeUtilityRate(candidate.alchemySpeedRate),
        enhancementSuccessRate: normalizeUtilityRate(candidate.enhancementSuccessRate),
        enhancementSpeedRate: normalizeUtilityRate(candidate.enhancementSpeedRate),
        miningDamageRate: normalizeUtilityRate(candidate.miningDamageRate),
        consumeBuffs: normalizeConsumableBuffs(raw.consumeBuffs),
        tags: normalizeItemTags(candidate.tags, materialCategory),
        contextActions: normalizeItemContextActions(candidate.contextActions),

        mapUnlockId: typeof candidate.mapUnlockId === 'string' ? candidate.mapUnlockId : undefined,
        mapUnlockIds: Array.isArray(candidate.mapUnlockIds)
            ? candidate.mapUnlockIds.filter((entry) => typeof entry === 'string' && entry.length > 0)
            : undefined,
        respawnBindMapId: typeof candidate.respawnBindMapId === 'string' && candidate.respawnBindMapId.trim()
            ? candidate.respawnBindMapId.trim()
            : undefined,
        tileAuraGainAmount: synthesizedTileAuraGainAmount,
        tileResourceGains: normalizedTileResourceGains && normalizedTileResourceGains.length > 0
            ? normalizedTileResourceGains
            : defaultTileResourceGains,
        useBehavior: typeof candidate.useBehavior === 'string' && candidate.useBehavior.trim() ? candidate.useBehavior.trim() : undefined,
        formationDiskTier: typeof candidate.formationDiskTier === 'string' ? candidate.formationDiskTier : undefined,
        formationDiskMultiplier: Number.isFinite(candidate.formationDiskMultiplier) ? Math.max(1, Number(candidate.formationDiskMultiplier)) : undefined,
        spiritualRootSeedTier: candidate.spiritualRootSeedTier === 'heaven' || candidate.spiritualRootSeedTier === 'divine'
            ? candidate.spiritualRootSeedTier
            : undefined,

        allowBatchUse: candidate.allowBatchUse === true,

        learnTechniqueId: typeof raw.learnTechniqueId === 'string'
            ? raw.learnTechniqueId
            : undefined,
    };
}

function normalizeUtilityRate(value) {

    return Number.isFinite(value) ? Number(value) : undefined;
}

function normalizeItemContextActions(raw) {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const actions = [];
    const seen = new Set();
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const candidate = entry;
        const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
        const desc = typeof candidate.desc === 'string' ? candidate.desc.trim() : '';
        const type = typeof candidate.type === 'string' ? candidate.type.trim() : '';
        if (!id || !name || !desc || type !== 'craft' || seen.has(id)) {
            continue;
        }
        actions.push({
            id,
            name,
            type,
            desc,
            cooldownLeft: Math.max(0, Math.trunc(Number(candidate.cooldownLeft) || 0)),
        });
        seen.add(id);
    }
    return actions.length > 0 ? actions : undefined;
}

function normalizeConsumableBuffs(raw) {

    if (!Array.isArray(raw)) {
        return undefined;
    }

    const buffs = raw.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
            return [];
        }

        const candidate = entry;
        if (typeof candidate.buffId !== 'string' || typeof candidate.name !== 'string' || !Number.isFinite(candidate.duration)) {
            return [];
        }

        const buffId = candidate.buffId.trim();

        const name = candidate.name.trim();
        if (!buffId || !name) {
            return [];
        }

        const category = candidate.category === 'debuff'
            ? 'debuff'
            : candidate.category === 'buff'
                ? 'buff'
                : undefined;

        const visibility = candidate.visibility === 'public'
            || candidate.visibility === 'observe_only'
            || candidate.visibility === 'hidden'
            ? candidate.visibility
            : undefined;
        return [{
                buffId,
                name,

                desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,

                shortMark: typeof candidate.shortMark === 'string' ? candidate.shortMark : undefined,
                category,
                visibility,

                color: typeof candidate.color === 'string' ? candidate.color : undefined,
                duration: Math.max(1, Math.trunc(Number(candidate.duration))),
                maxStacks: Number.isFinite(candidate.maxStacks) ? Math.max(1, Math.trunc(Number(candidate.maxStacks))) : undefined,
                attrs: isRecord(candidate.attrs) ? { ...candidate.attrs } : undefined,
                attrMode: candidate.attrMode === 'percent' ? 'percent' : candidate.attrMode === 'flat' ? 'flat' : undefined,
                stats: resolveConfiguredBuffStats(candidate.stats, candidate.valueStats, resolveBuffModifierMode(candidate.statMode), candidate.mainCombatStatsPercent),
                statMode: candidate.statMode === 'percent' ? 'percent' : candidate.statMode === 'flat' ? 'flat' : undefined,
                qiProjection: Array.isArray(candidate.qiProjection)
                    ? candidate.qiProjection
                        .filter((modifier) => isRecord(modifier))
                        .map((modifier) => ({ ...modifier }))
                    : undefined,
                valueStats: isRecord(candidate.valueStats) ? normalizePartialNumericStats(candidate.valueStats) : undefined,
                presentationScale: Number.isFinite(candidate.presentationScale) && Number(candidate.presentationScale) > 0
                    ? Number(candidate.presentationScale)
                    : undefined,
                infiniteDuration: candidate.infiniteDuration === true,
                sustainCost: normalizeBuffSustainCost(candidate.sustainCost),
                expireWithBuffId: typeof candidate.expireWithBuffId === 'string' && candidate.expireWithBuffId.trim()
                    ? candidate.expireWithBuffId.trim()
                    : undefined,
                sourceSkillId: typeof candidate.sourceSkillId === 'string' && candidate.sourceSkillId.trim()
                    ? candidate.sourceSkillId.trim()
                    : undefined,
                persistOnDeath: candidate.persistOnDeath === true,
                persistOnReturnToSpawn: candidate.persistOnReturnToSpawn === true,
            }];
    });
    return buffs.length > 0 ? buffs : undefined;
}

function normalizeMonsterInitialBuffs(raw) {
    // 内容冷路径完成校验，运行时只消费稳定结构。

    if (!Array.isArray(raw)) {
        return undefined;
    }
    const result = [];
    for (const entry of raw) {
        const buffs = normalizeConsumableBuffs([entry]);
        const buff = buffs?.[0];
        if (!buff) {
            continue;
        }
        const candidate = entry && typeof entry === 'object' ? entry : {};
        result.push({
            ...buff,
            stacks: Number.isFinite(candidate.stacks) ? Math.max(1, Math.trunc(Number(candidate.stacks))) : undefined,
        });
    }
    return result.length > 0 ? result : undefined;
}

function matchesLootPoolFilters(item, query) {


    const level = resolveItemTemplateLevel(item);
    if (typeof query.minLevel === 'number' && level < Math.max(1, Math.trunc(query.minLevel))) {
        return false;
    }
    if (typeof query.maxLevel === 'number' && level > Math.max(1, Math.trunc(query.maxLevel))) {
        return false;
    }

    const gradeOrder = resolveTechniqueGradeOrder(item.grade);
    if (gradeOrder === null) {
        return false;
    }

    const minGradeOrder = resolveTechniqueGradeOrder(query.minGrade);
    if (minGradeOrder !== null && gradeOrder < minGradeOrder) {
        return false;
    }

    const maxGradeOrder = resolveTechniqueGradeOrder(query.maxGrade);
    if (maxGradeOrder !== null && gradeOrder > maxGradeOrder) {
        return false;
    }

    const tagGroups = Array.isArray(query.tagGroups)
        ? query.tagGroups.filter((group) => Array.isArray(group) && group.length > 0)
        : [];
    if (tagGroups.length === 0) {
        return true;
    }

    const tagSet = new Set((item.tags ?? []).filter((tag) => typeof tag === 'string' && tag.length > 0));
    return tagGroups.every((group) => group.some((tag) => tagSet.has(tag)));
}

function resolveTechniqueGradeOrder(grade) {
    switch (grade) {
        case 'mortal':
            return 0;
        case 'yellow':
            return 1;
        case 'mystic':
            return 2;
        case 'earth':
            return 3;
        case 'heaven':
            return 4;
        case 'spirit':
            return 5;
        case 'saint':
            return 6;
        case 'emperor':
            return 7;
        default:
            return null;
    }
}

function inferTechniqueGradeFromItemLevel(level) {


    const normalizedLevel = Math.max(1, Math.trunc(Number(level)));
    if (normalizedLevel >= 85) {
        return 'emperor';
    }
    if (normalizedLevel >= 73) {
        return 'saint';
    }
    if (normalizedLevel >= 61) {
        return 'spirit';
    }
    if (normalizedLevel >= 49) {
        return 'heaven';
    }
    if (normalizedLevel >= 37) {
        return 'earth';
    }
    if (normalizedLevel >= 25) {
        return 'mystic';
    }
    if (normalizedLevel >= 13) {
        return 'yellow';
    }
    return 'mortal';
}

function resolveItemTemplateLevel(item) {

    if (Number.isFinite(item?.level)) {
        return Math.max(1, Math.trunc(Number(item.level)));
    }
    if (Number.isFinite(item?.healAmount)) {
        if (item.healAmount <= 24) {
            return 1;
        }
        if (item.healAmount <= 40) {
            return 2;
        }
        if (item.healAmount <= 65) {
            return 3;
        }
        if (item.healAmount <= 80) {
            return 4;
        }
        return 5;
    }

    const gradeOrder = resolveTechniqueGradeOrder(item?.grade);
    return gradeOrder === null ? 1 : gradeOrder + 1;
}

function randomIntInclusive(min, max) {

    if (max <= min) {
        return min;
    }
    return min + Math.floor(Math.random() * ((max - min) + 1));
}

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveBuffModifierMode(mode) {
    return mode === 'flat' ? 'flat' : 'percent';
}

function normalizePartialNumericStats(input) {
    if (!isRecord(input)) {
        return undefined;
    }
    const stats = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const value = Number(input[key]);
        if (!Number.isFinite(value) || value === 0) {
            continue;
        }
        stats[key] = value;
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {
        const group = input[groupKey];
        if (!isRecord(group)) {
            continue;
        }
        const normalizedGroup = {};
        for (const element of ELEMENT_KEYS) {
            const value = Number(group[element]);
            if (!Number.isFinite(value) || value === 0) {
                continue;
            }
            normalizedGroup[element] = value;
        }
        if (Object.keys(normalizedGroup).length > 0) {
            stats[groupKey] = normalizedGroup;
        }
    }
    return Object.keys(stats).length > 0 ? stats : undefined;
}

function mergePartialNumericStats(left, right) {
    if (!left) {
        return right;
    }
    if (!right) {
        return left;
    }
    const merged = { ...left };
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
        const value = right[key];
        if (!Number.isFinite(value)) {
            continue;
        }
        merged[key] = (Number(merged[key]) || 0) + Number(value);
    }
    for (const groupKey of ['elementDamageBonus', 'elementDamageReduce']) {
        const group = right[groupKey];
        if (!isRecord(group)) {
            continue;
        }
        const mergedGroup = isRecord(merged[groupKey]) ? { ...merged[groupKey] } : {};
        for (const element of ELEMENT_KEYS) {
            const value = group[element];
            if (!Number.isFinite(value)) {
                continue;
            }
            mergedGroup[element] = (Number(mergedGroup[element]) || 0) + Number(value);
        }
        if (Object.keys(mergedGroup).length > 0) {
            merged[groupKey] = mergedGroup;
        }
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveConfiguredBuffStats(stats, valueStats, mode, mainCombatStatsPercent) {
    const mainCombatStats = mode === 'flat'
        ? undefined
        : createMonsterMainCombatStatModifierStats(Number(mainCombatStatsPercent));
    if (mode === 'flat') {
        return normalizePartialNumericStats(stats)
            ?? (isRecord(valueStats) ? compileValueStatsToActualStats(valueStats) : undefined);
    }
    return mergePartialNumericStats(
        mainCombatStats,
        normalizePartialNumericStats(stats) ?? normalizePartialNumericStats(valueStats),
    );
}

function normalizeBuffSustainCost(input) {
    if (!isRecord(input)) {
        return undefined;
    }
    const resource = input.resource === 'hp' || input.resource === 'qi' ? input.resource : undefined;
    const baseCost = Number(input.baseCost);
    if (!resource || !Number.isFinite(baseCost) || baseCost <= 0) {
        return undefined;
    }
    const growthRate = Number(input.growthRate);
    return {
        resource,
        baseCost: Math.max(1, Math.round(baseCost)),
        growthRate: Number.isFinite(growthRate) && growthRate > 0 ? growthRate : undefined,
    };
}

function clampUnitRatio(value) {
    return Math.max(0.01, Math.min(1, Number(value)));
}

function normalizeTechniqueTemplate(raw, sharedTechniqueBuffs = new Map()) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.id !== 'string'
        || typeof candidate.name !== 'string'
        || !isTechniqueGrade(candidate.grade)) {
        return null;
    }

    const grade = candidate.grade;

    const realmLv = Number.isFinite(candidate.realmLv) ? Math.max(1, Math.trunc(Number(candidate.realmLv))) : 1;

    const sparseLayers = Array.isArray(candidate.layers)
        ? candidate.layers
            .map((layer) => normalizeTechniqueLayer(layer, realmLv))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.level - right.level)
        : [];

    const skills = Array.isArray(candidate.skills)
        ? candidate.skills
            .map((skill) => normalizeSkill(skill, grade, realmLv, sharedTechniqueBuffs))
            .filter((entry) => Boolean(entry))
        : [];
    const category = isTechniqueCategory(candidate.category) ? candidate.category : inferTechniqueCategory(skills);
    const template = {
        id: candidate.id,
        name: candidate.name,
        desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,
        grade,
        category,
        realmLv,
        attrRatio: isRecord(candidate.attrRatio) ? { ...candidate.attrRatio } : undefined,
        attrFloat: Number.isFinite(candidate.attrFloat) ? Number(candidate.attrFloat) : undefined,
        maxLayer: Number.isFinite(candidate.maxLayer) ? Math.max(1, Math.trunc(Number(candidate.maxLayer))) : undefined,
        expDifficulty: Number.isFinite(candidate.expDifficulty) ? Number(candidate.expDifficulty) : undefined,
        layerGains: isRecord(candidate.layerGains) ? cloneTechniqueLayerGains(candidate.layerGains) : undefined,
        layers: sparseLayers,
        skills,
    };
    const layers = expandTechniqueTemplateLayers(template);
    return {
        id: template.id,
        name: template.name,
        desc: template.desc,
        grade,
        category,
        realmLv,
        attrRatio: template.attrRatio,
        attrFloat: template.attrFloat,
        maxLayer: template.maxLayer,
        expDifficulty: template.expDifficulty,
        layerGains: template.layerGains,
        layers,
        skills,
    };
}

function normalizeTechniqueLayer(raw, realmLv) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (!Number.isFinite(candidate.level)) {
        return null;
    }
    return {
        level: Math.max(1, Math.trunc(Number(candidate.level))),
        expToNext: Number.isFinite(candidate.expFactor)
            ? scaleTechniqueExpCompat(Number(candidate.expFactor), realmLv)
            : Math.max(0, Math.trunc(Number(candidate.expToNext ?? 0))),
        attrs: normalizeTechniqueLayerAttrs(candidate.attrs),
        specialStats: normalizeTechniqueLayerSpecialStats(candidate.specialStats),
        qiProjection: cloneQiProjectionModifiers(candidate.qiProjection),
    };
}

function expandTechniqueTemplateLayers(template) {
    if (shouldExpandTechniqueAttrRatio(template)) {
        return expandTechniqueAttrRatio(template).layers;
    }
    const maxLayer = Math.max(1, Math.trunc(Number(
        template.maxLayer ?? (Array.isArray(template.layers) && template.layers.length > 0 ? template.layers.length : 1),
    ) || 1));
    if (template.layerGains && typeof template.layerGains === 'object') {
        const gains = expandTechniqueLayerGains(template.layerGains, maxLayer);
        const expCurve = expandTechniqueExpCurve(template.grade, template.realmLv, maxLayer, template.expDifficulty ?? 1, template.category);
        const sparseByLevel = buildTechniqueLayerMap(template.layers);
        return gains.map((gain, index) => {
            const level = index + 1;
            const sparse = sparseByLevel.get(level);
            return {
                level,
                expToNext: expCurve.perLayerExp[index] ?? 0,
                attrs: gain.attrs ? { ...gain.attrs } : (sparse?.attrs ? { ...sparse.attrs } : undefined),
                specialStats: gain.specialStats ? { ...gain.specialStats } : (sparse?.specialStats ? { ...sparse.specialStats } : undefined),
                qiProjection: cloneQiProjectionModifiers(sparse?.qiProjection),
            };
        });
    }
    if (Number.isFinite(template.maxLayer)) {
        const expCurve = expandTechniqueExpCurve(template.grade, template.realmLv, maxLayer, template.expDifficulty ?? 1, template.category);
        const sparseByLevel = buildTechniqueLayerMap(template.layers);
        return Array.from({ length: maxLayer }, (_, index) => {
            const level = index + 1;
            const sparse = sparseByLevel.get(level);
            return {
                level,
                expToNext: expCurve.perLayerExp[index] ?? 0,
                attrs: sparse?.attrs ? { ...sparse.attrs } : undefined,
                specialStats: sparse?.specialStats ? { ...sparse.specialStats } : undefined,
                qiProjection: cloneQiProjectionModifiers(sparse?.qiProjection),
            };
        });
    }
    return (template.layers ?? []).map((entry) => ({
        level: entry.level,
        expToNext: entry.expToNext,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        specialStats: entry.specialStats ? { ...entry.specialStats } : undefined,
        qiProjection: cloneQiProjectionModifiers(entry.qiProjection),
    }));
}

function buildTechniqueLayerMap(layers) {
    const map = new Map();
    for (const entry of layers ?? []) {
        if (!isRecord(entry) || !Number.isFinite(entry.level)) {
            continue;
        }
        map.set(Math.max(1, Math.trunc(Number(entry.level))), entry);
    }
    return map;
}

function cloneTechniqueLayerGains(raw) {
    if (!isRecord(raw)) {
        return undefined;
    }
    const gains: Record<string, any> = {};
    const attrs = normalizeTechniqueLayerAttrs(raw.attrs);
    const specialStats = normalizeTechniqueLayerSpecialStats(raw.specialStats);
    if (attrs) {
        gains.attrs = attrs;
    }
    if (specialStats) {
        gains.specialStats = specialStats;
    }
    if (Array.isArray(raw.deltas)) {
        gains.deltas = raw.deltas
            .filter((delta) => isRecord(delta) && Number.isFinite(delta.fromLevel))
            .map((delta) => ({
                fromLevel: Math.max(1, Math.trunc(Number(delta.fromLevel))),
                toLevel: Number.isFinite(delta.toLevel) ? Math.max(1, Math.trunc(Number(delta.toLevel))) : undefined,
                attrsAdd: normalizeTechniqueLayerAttrs(delta.attrsAdd),
                specialStatsAdd: normalizeTechniqueLayerSpecialStats(delta.specialStatsAdd),
            }));
    }
    return Object.keys(gains).length > 0 ? gains : undefined;
}

function cloneQiProjectionModifiers(source) {
    return Array.isArray(source)
        ? source
            .filter((modifier) => isRecord(modifier))
            .map((modifier) => ({
                ...modifier,
                selector: isRecord(modifier.selector)
                    ? {
                        ...modifier.selector,
                        resourceKeys: Array.isArray(modifier.selector.resourceKeys) ? modifier.selector.resourceKeys.slice() : undefined,
                        families: Array.isArray(modifier.selector.families) ? modifier.selector.families.slice() : undefined,
                        forms: Array.isArray(modifier.selector.forms) ? modifier.selector.forms.slice() : undefined,
                        elements: Array.isArray(modifier.selector.elements) ? modifier.selector.elements.slice() : undefined,
                    }
                    : undefined,
            }))
        : undefined;
}

function scaleTechniqueExpCompat(expFactor, realmLv) {
  if (typeof scaleTechniqueExp === 'function') {
    return scaleTechniqueExp(expFactor, realmLv);
  }
  if (expFactor <= 0) {
    return 0;
  }
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.floor(Number(realmLv))) : 1;
  const expBase = Number.isFinite(TECHNIQUE_EXP_BASE) ? Number(TECHNIQUE_EXP_BASE) : 100;
  return Math.max(0, Math.round(expFactor * expBase * normalizedRealmLv));
}

function normalizeTechniqueLayerAttrs(raw) {

    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const source = raw;

    const result = {};
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
            result[key] = value;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeTechniqueLayerSpecialStats(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const source = raw;
    const result = {};
    for (const key of ['comprehension', 'luck']) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value !== 0) {
            result[key] = value;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeItemSpecialStats(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const source = raw;
    const result = {};
    for (const key of ['comprehension', 'luck']) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value !== 0) {
            result[key] = Math.trunc(value);
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function cloneTechniqueLayerAttrsWithoutSpecialStats(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key === 'comprehension' || key === 'luck') {
            continue;
        }
        if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
            result[key] = value;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function resolveTechniqueLayerSpecialStats(entry, templateLayer) {
    const explicit = normalizeTechniqueLayerSpecialStats(entry?.specialStats);
    if (explicit) {
        return explicit;
    }
    const legacy = normalizeTechniqueLayerSpecialStats(entry?.attrs);
    if (legacy) {
        return legacy;
    }
    return templateLayer?.specialStats ? { ...templateLayer.specialStats } : undefined;
}

function normalizeSkill(raw, grade, realmLv, sharedTechniqueBuffs = new Map()) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.id !== 'string'
        || typeof candidate.name !== 'string'
        || typeof candidate.desc !== 'string'
        || !Number.isFinite(candidate.cooldown)
        || !Number.isFinite(candidate.range)
        || !Array.isArray(candidate.effects)) {
        return null;
    }

    const unlockRealm = typeof candidate.unlockRealm === 'number' ? candidate.unlockRealm : undefined;

    const unlockLevel = resolveSkillUnlockLevel({
        unlockLevel: candidate.unlockLevel,
        unlockRealm,
    });

    const costMultiplier = Number.isFinite(candidate.costMultiplier) ? Math.max(0, Number(candidate.costMultiplier)) : 0;

    const cooldown = Math.max(0, Math.trunc(Number(candidate.cooldown)));

    const range = Math.max(0, Math.trunc(Number(candidate.range)));
    return {
        id: candidate.id,
        name: candidate.name,
        desc: candidate.desc,
        cooldown,
        cost: calculateTechniqueSkillQiCost(costMultiplier, grade, realmLv),
        costMultiplier,
        range,
        targeting: candidate.targeting ? { ...candidate.targeting } : undefined,
        effects: cloneSkillEffects(candidate.effects, sharedTechniqueBuffs),
        unlockLevel,
        unlockRealm,
        unlockPlayerRealm: candidate.unlockPlayerRealm,
        requiresTarget: candidate.requiresTarget,
        targetMode: candidate.targetMode,
        playerCast: normalizeSkillCastDef(candidate.playerCast, false),
        monsterCast: normalizeSkillCastDef(candidate.monsterCast, true),
    };
}
function normalizeSkillCastDef(raw, includeConditions = false) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const candidate = raw;
    const windupTicks = Number(candidate.windupTicks);
    const normalized: any = {};
    if (Number.isFinite(windupTicks)) {
        normalized.windupTicks = Math.max(0, Math.floor(windupTicks));
    }
    if (typeof candidate.warningColor === 'string' && candidate.warningColor.trim().length > 0) {
        normalized.warningColor = candidate.warningColor.trim();
    }
    if (includeConditions && candidate.conditions && typeof candidate.conditions === 'object' && !Array.isArray(candidate.conditions)) {
        normalized.conditions = { ...candidate.conditions };
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function cloneSkillEffects(raw, sharedTechniqueBuffs = new Map()) {
    return raw
        .filter((entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => resolveSharedTechniqueBuffEffect(entry, sharedTechniqueBuffs));
}

function normalizeSharedTechniqueBuffEffect(raw) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
        return null;
    }
    return {
        ...candidate,
        id: candidate.id.trim(),
        type: 'buff',
    };
}

function resolveSharedTechniqueBuffEffect(raw, sharedTechniqueBuffs) {

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return raw;
    }

    const candidate = raw;
    if (candidate.type !== 'buff' || typeof candidate.buffRef !== 'string' || !candidate.buffRef.trim()) {
        return { ...candidate };
    }

    const buffRef = candidate.buffRef.trim();

    const template = sharedTechniqueBuffs.get(buffRef);
    if (!template) {
        throw new Error(`共享功法增益模板 ${buffRef} 不存在`);
    }
    const { id: _id, ...templateEffect } = template;
    const { buffRef: _buffRef, ...effect } = candidate;
    return {
        ...templateEffect,
        ...effect,
        type: 'buff',
    };
}

function isTechniqueGrade(value) {
    return value === 'mortal'
        || value === 'yellow'
        || value === 'mystic'
        || value === 'earth'
        || value === 'heaven'
        || value === 'spirit'
        || value === 'saint'
        || value === 'emperor';
}

function isTechniqueCategory(value) {
    return value === 'arts' || value === 'internal' || value === 'divine' || value === 'secret';
}

function inferTechniqueCategory(skills) {
    return skills.length > 0 ? 'arts' : 'internal';
}
