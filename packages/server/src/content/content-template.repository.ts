// @ts-nocheck
"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;

    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));

var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {

            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;

        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();

var ContentTemplateRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentTemplateRepository = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

const fs = __importStar(require("fs"));

const path = __importStar(require("path"));

const project_path_1 = require("../common/project-path");

/** 内容模板仓库：集中加载物品、功法、妖兽掉落和怪物运行时模板。 */
let ContentTemplateRepository = ContentTemplateRepository_1 = class ContentTemplateRepository {
    /** 运行时日志器，记录内容加载与校验失败。 */
    logger = new common_1.Logger(ContentTemplateRepository_1.name);
    /** 物品模板表，按 itemId 查找。 */
    itemTemplates = new Map();
    /** 功法模板表，按 techniqueId 查找。 */
    techniqueTemplates = new Map();
    /** 共享功法 buff 表，供多个技能复用。 */
    sharedTechniqueBuffs = new Map();
    /** 妖兽掉落表，按 monsterId 聚合。 */
    monsterDropsByMonsterId = new Map();
    /** 妖兽运行时模板表，用于生成世界刷怪数据。 */
    monsterRuntimeTemplates = new Map();
    /** 每张地图上的妖兽运行时状态缓存。 */
    monsterRuntimeStatesByMapId = new Map();
    /** 起始背包条目列表。 */
    starterInventoryEntries = [];
    /** 模块初始化时加载全部内容模板。 */
    onModuleInit() {
        this.loadAll();
    }
    /** 生成新玩家的起始背包。 */
    createStarterInventory() {
        return {
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
            tags: Array.isArray(template.tags) ? template.tags.slice() : undefined,
            effects: Array.isArray(template.effects) ? template.effects.map((entry) => ({ ...entry })) : undefined,
            healAmount: template.healAmount,
            healPercent: template.healPercent,
            qiPercent: template.qiPercent,
            consumeBuffs: Array.isArray(template.consumeBuffs) ? template.consumeBuffs.map((entry) => ({
                ...entry,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
                stats: entry.stats ? { ...entry.stats } : undefined,
                valueStats: entry.valueStats ? { ...entry.valueStats } : undefined,
                qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
            })) : undefined,
            mapUnlockId: template.mapUnlockId,
            mapUnlockIds: Array.isArray(template.mapUnlockIds) ? template.mapUnlockIds.slice() : undefined,
            tileAuraGainAmount: template.tileAuraGainAmount,
            tileResourceGains: Array.isArray(template.tileResourceGains) ? template.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
            allowBatchUse: template.allowBatchUse,
        })).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
    }    
    /**
 * rollLootPoolItems：执行roll掉落Pool道具相关逻辑。
 * @param query 参数说明。
 * @returns 无返回值，直接更新roll掉落Pool道具相关状态。
 */

    rollLootPoolItems(query) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * normalizeItem：规范化或转换道具。
 * @param item 道具。
 * @returns 无返回值，直接更新道具相关状态。
 */

    normalizeItem(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
            count: Math.max(1, Math.trunc(item.count)),
        };
    }    
    /**
 * getLearnTechniqueId：读取Learn功法ID。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成Learn功法ID的读取/组装。
 */

    getLearnTechniqueId(itemId) {
        return this.itemTemplates.get(itemId)?.learnTechniqueId ?? null;
    }    
    /**
 * getItemSortLevel：读取道具Sort等级。
 * @param item 道具。
 * @returns 无返回值，完成道具Sort等级的读取/组装。
 */

    getItemSortLevel(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * createTechniqueState：构建并返回目标对象。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新功法状态相关状态。
 */

    createTechniqueState(techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const template = this.techniqueTemplates.get(techniqueId);
        if (!template) {
            return null;
        }
        return {
            techId: template.id,
            name: template.name,
            level: 1,
            exp: 0,
            expToNext: template.layers.find((entry) => entry.level === 1)?.expToNext ?? 0,
            realmLv: template.realmLv,
            realm: shared_1.TechniqueRealm.Entry,
            skills: template.skills.map((entry) => ({ ...entry })),
            grade: template.grade,
            category: template.category,
            layers: template.layers.map((entry) => ({
                level: entry.level,
                expToNext: entry.expToNext,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
            })),
            attrCurves: template.attrCurves ? { ...template.attrCurves } : undefined,
        };
    }    
    /**
 * getTechniqueName：读取功法名称。
 * @param techniqueId technique ID。
 * @returns 无返回值，完成功法名称的读取/组装。
 */

    getTechniqueName(techniqueId) {
        return this.techniqueTemplates.get(techniqueId)?.name ?? null;
    }    
    /**
 * hydrateTechniqueState：执行hydrate功法状态相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新hydrate功法状态相关状态。
 */

    hydrateTechniqueState(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!input || typeof input !== 'object') {
            return null;
        }

        const techId = typeof input.techId === 'string' ? input.techId.trim() : '';
        if (!techId) {
            return null;
        }

        const template = this.techniqueTemplates.get(techId);

        const level = Number.isFinite(input.level) ? Math.max(1, Math.trunc(Number(input.level))) : 1;

        const realmLv = Number.isFinite(input.realmLv)
            ? Math.max(1, Math.trunc(Number(input.realmLv)))
            : (template?.realmLv ?? 1);

        const layers = Array.isArray(input.layers) && input.layers.length > 0
            ? input.layers.map((entry) => ({
                level: Number.isFinite(entry?.level) ? Math.max(1, Math.trunc(Number(entry.level))) : 1,
                expToNext: Number.isFinite(entry?.expToNext) ? Math.max(0, Math.trunc(Number(entry.expToNext))) : 0,

                attrs: entry?.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,
            }))
            : (template?.layers.map((entry) => ({
                level: entry.level,
                expToNext: entry.expToNext,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
            })) ?? []);

        const expToNext = Number.isFinite(input.expToNext)
            ? Math.max(0, Math.trunc(Number(input.expToNext)))
            : ((0, shared_1.getTechniqueExpToNext)(level, layers) ?? 0);

        const grade = typeof input.grade === 'string' ? input.grade : template?.grade;

        const category = typeof input.category === 'string' ? input.category : template?.category;

        const skills = Array.isArray(input.skills) && input.skills.length > 0
            ? input.skills.map((entry) => ({ ...entry }))
            : (template?.skills.map((entry) => ({ ...entry })) ?? []);

        const attrCurves = input.attrCurves && typeof input.attrCurves === 'object'
            ? { ...input.attrCurves }
            : (template?.attrCurves ? { ...template.attrCurves } : undefined);
        return {
            techId,

            name: typeof input.name === 'string' && input.name ? input.name : (template?.name ?? techId),
            level,
            exp: Number.isFinite(input.exp) ? Math.max(0, Math.trunc(Number(input.exp))) : 0,
            expToNext,
            realmLv,
            realm: Number.isFinite(input.realm) ? Math.max(0, Math.trunc(Number(input.realm))) : (0, shared_1.deriveTechniqueRealm)(level, layers, attrCurves),
            skills,
            grade,
            category,
            layers,
            attrCurves,
        };
    }    
    /**
 * listTechniqueTemplates：读取功法Template并返回结果。
 * @returns 无返回值，完成功法Template的读取/组装。
 */

    listTechniqueTemplates() {
        return Array.from(this.techniqueTemplates.values(), (template) => ({
            id: template.id,
            name: template.name,
            grade: template.grade,
            category: template.category,
            realmLv: template.realmLv,
            skills: template.skills.map((entry) => ({ ...entry })),
            layers: template.layers.map((entry) => ({
                level: entry.level,
                expToNext: entry.expToNext,
                attrs: entry.attrs ? { ...entry.attrs } : undefined,
            })),
        })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
    }    
    /**
 * rollMonsterDrops：执行roll怪物Drop相关逻辑。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param lootRateBonus 参数说明。
 * @param rareLootRateBonus 参数说明。
 * @returns 无返回值，直接更新roll怪物Drop相关状态。
 */

    rollMonsterDrops(monsterId, rolls = 1, lootRateBonus = 0, rareLootRateBonus = 0) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
                    : 1 - Math.pow(1 - baseChance, killEquivalent);
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
    /**
 * createRuntimeMonstersForMap：构建并返回目标对象。
 * @param mapId 地图 ID。
 * @returns 无返回值，直接更新运行态怪物For地图相关状态。
 */

    createRuntimeMonstersForMap(mapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
            spawns.push({
                runtimeId: state.runtimeId,
                monsterId,
                x: state.x,
                y: state.y,
                hp: Math.max(0, Math.min(state.hp, template.maxHp)),
                maxHp: template.maxHp,
                respawnTicks: template.respawnTicks,
                alive: state.alive,
                respawnLeft: state.alive ? 0 : Math.max(0, state.respawnLeft),
                facing: state.facing,
                name: template.name,
                char: template.char,
                color: template.color,
                level: template.level,
                tier: template.tier,
                baseAttrs: cloneMonsterAttributes(template.attrs),
                baseNumericStats: (0, shared_1.cloneNumericStats)(template.numericStats),
                ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors),
                skills: template.skills.map((entry) => cloneSkill(entry)),
                aggroRange: template.aggroRange,
                leashRange: template.leashRange,
                attackRange: template.attackRange,
                attackCooldownTicks: template.attackCooldownTicks,
            });
        }
        return spawns;
    }    
    /**
 * buildFallbackMonsterRuntimeStatesForMap：构建并返回目标对象。
 * @param mapId 地图 ID。
 * @returns 无返回值，直接更新Fallback怪物运行态状态For地图相关状态。
 */

    buildFallbackMonsterRuntimeStatesForMap(mapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const filePath = (0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'maps', `${mapId}.json`);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        const document = (0, shared_1.normalizeEditableMapDocument)(raw);

        const spawns = Array.isArray(document.monsterSpawns) ? document.monsterSpawns : [];
        if (spawns.length === 0) {
            return null;
        }

        const runtimeStates = [];

        const nextIndexByMonsterId = new Map();

        const occupied = new Set();

        const plannedCounts = planFallbackSpawnCounts(mapId, document, spawns);
        for (let spawnIndex = 0; spawnIndex < spawns.length; spawnIndex += 1) {
            const spawn = spawns[spawnIndex];
            const monsterId = typeof spawn.templateId === 'string' && spawn.templateId.trim()
                ? spawn.templateId.trim()
                : (typeof spawn.id === 'string' ? spawn.id.trim() : '');

            const template = monsterId ? this.monsterRuntimeTemplates.get(monsterId) : null;
            if (!template) {
                continue;
            }

            const count = plannedCounts[spawnIndex] ?? 1;

            const positions = resolveFallbackSpawnPositions(document, spawn, count, occupied);
            for (const position of positions) {
                const nextIndex = nextIndexByMonsterId.get(monsterId) ?? 0;
                nextIndexByMonsterId.set(monsterId, nextIndex + 1);
                runtimeStates.push({
                    runtimeId: `monster:${mapId}:${monsterId}:${nextIndex}`,
                    x: position.x,
                    y: position.y,
                    hp: template.maxHp,
                    alive: true,
                    respawnLeft: 0,
                    facing: shared_1.Direction.South,
                });
            }
        }
        if (runtimeStates.length === 0) {
            return null;
        }
        this.monsterRuntimeStatesByMapId.set(mapId, runtimeStates);
        return runtimeStates;
    }    
    /**
 * getMonsterCombatProfile：读取怪物战斗Profile。
 * @param monsterId monster ID。
 * @returns 无返回值，完成怪物战斗Profile的读取/组装。
 */

    getMonsterCombatProfile(monsterId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const template = this.monsterRuntimeTemplates.get(monsterId);
        if (!template) {
            return null;
        }
        return {
            attrs: cloneMonsterAttributes(template.attrs),
            numericStats: (0, shared_1.cloneNumericStats)(template.numericStats),
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors),
        };
    }    
    /**
 * getSkill：读取技能。
 * @param skillId skill ID。
 * @returns 无返回值，完成技能的读取/组装。
 */

    getSkill(skillId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const technique of this.techniqueTemplates.values()) {
            const skill = technique.skills.find((entry) => entry.id === skillId);
            if (skill) {
                return cloneSkill(skill);
            }
        }
        return null;
    }    
    /**
 * loadSharedTechniqueBuffs：读取Shared功法Buff并返回结果。
 * @returns 无返回值，完成Shared功法Buff的读取/组装。
 */

    loadSharedTechniqueBuffs() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const sharedBuffFiles = collectJsonFiles((0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'content', 'technique-buffs'));
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
    /**
 * loadAll：读取All并返回结果。
 * @returns 无返回值，完成All的读取/组装。
 */

    loadAll() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.itemTemplates.clear();
        this.techniqueTemplates.clear();
        this.sharedTechniqueBuffs.clear();
        this.monsterDropsByMonsterId.clear();
        this.monsterRuntimeTemplates.clear();
        this.monsterRuntimeStatesByMapId.clear();
        this.starterInventoryEntries = [];

        const itemFiles = collectJsonFiles((0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'content', 'items'));
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

        const techniqueFiles = collectJsonFiles((0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'content', 'techniques'));
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

        const starterPath = (0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'content', 'starter-inventory.json');

        const starterRaw = JSON.parse(fs.readFileSync(starterPath, 'utf-8'));
        this.starterInventoryEntries = Array.isArray(starterRaw.items)
            ? starterRaw.items
                .map((entry) => normalizeStarterInventoryEntry(entry))
                .filter((entry) => Boolean(entry))
            : [];
        this.loadMonsterDrops();
        this.logger.log(`已加载 ${this.itemTemplates.size} 个物品模板、${this.techniqueTemplates.size} 个功法、${this.monsterDropsByMonsterId.size} 张妖兽掉落表和 ${this.starterInventoryEntries.length} 条初始物品记录`);
    }    
    /**
 * loadMonsterDrops：读取怪物Drop并返回结果。
 * @returns 无返回值，完成怪物Drop的读取/组装。
 */

    loadMonsterDrops() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monsterFiles = collectJsonFiles((0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'content', 'monsters'));
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
                    tier: normalizeMonsterTier(monster.tier ?? (0, shared_1.inferMonsterTierFromName)(monster.name)),

                    level: typeof monster.level === 'number' && Number.isFinite(monster.level)
                        ? Math.max(1, Math.trunc(monster.level))
                        : undefined,
                });
                if (drops.length > 0) {
                    this.monsterDropsByMonsterId.set(monsterId, drops);
                }
            }
        }
        this.loadMonsterRuntimeStates();
    }    
    /**
 * buildMonsterDrops：构建并返回目标对象。
 * @param rawDrops 参数说明。
 * @param rawEquipment 参数说明。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新怪物Drop相关状态。
 */

    buildMonsterDrops(rawDrops, rawEquipment, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
            for (const slot of shared_1.EQUIP_SLOTS) {
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

        const spiritStoneDrop = this.buildSpiritStoneMonsterDrop(context, spiritStoneOverride);
        if (spiritStoneDrop) {
            drops.push(spiritStoneDrop);
        }
        return drops;
    }    
    /**
 * resolveMonsterDropChance：规范化或转换怪物DropChance。
 * @param drop 参数说明。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新怪物DropChance相关状态。
 */

    resolveMonsterDropChance(drop, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * computeDefaultMonsterDropChance：执行默认怪物DropChance相关逻辑。
 * @param drop 参数说明。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新Default怪物DropChance相关状态。
 */

    computeDefaultMonsterDropChance(drop, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (drop.type === 'quest_item') {
            return 1;
        }
        if (drop.type === 'material') {
            return this.getMaterialBaseDropChance(context.tier);
        }

        const categoryBase = this.getMonsterDropCategoryBase(drop);

        const itemGrade = this.getMonsterDropItemGrade(drop);

        const monsterGradeIndex = resolveTechniqueGradeOrder(context.grade) ?? 0;

        const itemGradeIndex = resolveTechniqueGradeOrder(itemGrade) ?? 0;

        const gradeDelta = Math.max(-7, monsterGradeIndex - itemGradeIndex);

        const chance = 0.01 * categoryBase * (3 ** gradeDelta) * this.getMonsterTierDropFactor(context.tier);
        return Math.max(Number.MIN_VALUE, Math.min(1, chance));
    }    
    /**
 * getMaterialBaseDropChance：读取MaterialBaseDropChance。
 * @param tier 参数说明。
 * @returns 无返回值，完成MaterialBaseDropChance的读取/组装。
 */

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
    /**
 * getMonsterDropCategoryBase：读取怪物DropCategoryBase。
 * @param drop 参数说明。
 * @returns 无返回值，完成怪物DropCategoryBase的读取/组装。
 */

    getMonsterDropCategoryBase(drop) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * getMonsterTierDropFactor：读取怪物TierDropFactor。
 * @param tier 参数说明。
 * @returns 无返回值，完成怪物TierDropFactor的读取/组装。
 */

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
    /**
 * getMonsterDropItemGrade：读取怪物Drop道具Grade。
 * @param drop 参数说明。
 * @returns 无返回值，完成怪物Drop道具Grade的读取/组装。
 */

    getMonsterDropItemGrade(drop) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * buildSpiritStoneMonsterDrop：构建并返回目标对象。
 * @param context 上下文信息。
 * @param override 参数说明。
 * @returns 无返回值，直接更新SpiritStone怪物Drop相关状态。
 */

    buildSpiritStoneMonsterDrop(context, override) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * computeSpiritStoneDropChance：执行SpiritStoneDropChance相关逻辑。
 * @param tier 参数说明。
 * @returns 无返回值，直接更新SpiritStoneDropChance相关状态。
 */

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
    /**
 * computeSpiritStoneDropCount：执行SpiritStoneDrop数量相关逻辑。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新SpiritStoneDrop数量相关状态。
 */

    computeSpiritStoneDropCount(context) {

        const gradeIndex = Math.max(0, resolveTechniqueGradeOrder(context.grade) ?? 0);

        const level = typeof context.level === 'number' && Number.isFinite(context.level)
            ? Math.max(1, Math.trunc(context.level))
            : 1;
        return Math.max(1, Math.floor(1 + (gradeIndex * 0.5) + (Math.floor(level / 12) * 0.5)));
    }    
    /**
 * resolveRawEquipmentItemId：规范化或转换Raw装备道具ID。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新Raw装备道具ID相关状态。
 */

    resolveRawEquipmentItemId(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (typeof entry === 'string') {
            return entry.trim();
        }
        if (entry && typeof entry === 'object' && typeof entry.itemId === 'string') {
            return entry.itemId.trim();
        }
        return '';
    }    
    /**
 * normalizeMonsterDropEntry：规范化或转换怪物Drop条目。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新怪物Drop条目相关状态。
 */

    normalizeMonsterDropEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * getLootPoolCandidateIds：读取掉落PoolCandidateID。
 * @param query 参数说明。
 * @returns 无返回值，完成掉落PoolCandidateID的读取/组装。
 */

    getLootPoolCandidateIds(query) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * normalizeMonsterRuntimeTemplate：规范化或转换怪物运行态Template。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新怪物运行态Template相关状态。
 */

    normalizeMonsterRuntimeTemplate(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const id = typeof raw.id === 'string' ? raw.id.trim() : '';

        const name = typeof raw.name === 'string' ? raw.name : '';

        const char = typeof raw.char === 'string' ? raw.char : '';

        const color = typeof raw.color === 'string' ? raw.color : '';
        if (!id || !name || !char || !color) {
            return null;
        }

        const tier = normalizeMonsterTier(raw.tier ?? (0, shared_1.inferMonsterTierFromName)(name));

        const grade = normalizeTechniqueGrade(raw.grade);

        const level = typeof raw.level === 'number' && Number.isFinite(raw.level)
            ? Math.max(1, Math.trunc(raw.level))
            : undefined;

        const attrs = (0, shared_1.normalizeMonsterAttrs)((raw.attrs && typeof raw.attrs === 'object' ? raw.attrs : undefined));

        const numericStats = (0, shared_1.resolveMonsterNumericStatsFromAttributes)({
            attrs,
            level,
            grade,
            tier,

            statPercents: (0, shared_1.normalizeMonsterStatPercents)((raw.statPercents && typeof raw.statPercents === 'object'
                ? raw.statPercents
                : undefined)),
        });

        const maxHp = normalizeMonsterMaxHp(raw.maxHp, raw.hp, attrs, numericStats);
        if (maxHp <= 0) {
            return null;
        }
        return {
            id,
            name,
            char,
            color,
            level: level ?? 1,
            tier,
            maxHp,
            respawnTicks: normalizeMonsterRespawnTicks(raw.respawnTicks, raw.respawnSec),
            attrs,
            numericStats,
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].ratioDivisors),
            skills: this.normalizeMonsterSkills(raw.skills, id),
            aggroRange: normalizeMonsterAggroRange(raw.aggroRange, raw.radius, numericStats.viewRange),
            leashRange: normalizeMonsterLeashRange(raw.aggroRange, raw.radius, numericStats.viewRange),
            attackRange: 1,
            attackCooldownTicks: 2,
        };
    }    
    /**
 * normalizeMonsterSkills：规范化或转换怪物技能。
 * @param raw 参数说明。
 * @param monsterId monster ID。
 * @returns 无返回值，直接更新怪物技能相关状态。
 */

    normalizeMonsterSkills(raw, monsterId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * loadMonsterRuntimeStates：读取怪物运行态状态并返回结果。
 * @returns 无返回值，完成怪物运行态状态的读取/组装。
 */

    loadMonsterRuntimeStates() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const runtimePath = (0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'runtime', 'map-monster-runtime-state.json');
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
exports.ContentTemplateRepository = ContentTemplateRepository;
exports.ContentTemplateRepository = ContentTemplateRepository = ContentTemplateRepository_1 = __decorate([
    (0, common_1.Injectable)()
], ContentTemplateRepository);
export { ContentTemplateRepository };
/**
 * parseMonsterIdFromRuntimeId：规范化或转换怪物IDFrom运行态ID。
 * @param runtimeId runtime ID。
 * @returns 无返回值，直接更新怪物IDFrom运行态ID相关状态。
 */

function parseMonsterIdFromRuntimeId(runtimeId) {

    const parts = runtimeId.split(':');
    return parts.length >= 4 ? parts[2] ?? '' : '';
}
/**
 * normalizeMonsterMaxHp：规范化或转换怪物MaxHp。
 * @param maxHp 参数说明。
 * @param hp 参数说明。
 * @param attrs 参数说明。
 * @param numericStats 参数说明。
 * @returns 无返回值，直接更新怪物MaxHp相关状态。
 */

function normalizeMonsterMaxHp(maxHp, hp, attrs, numericStats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
 * normalizeMonsterRespawnTicks：规范化或转换怪物重生tick。
 * @param respawnTicks 参数说明。
 * @param respawnSec 参数说明。
 * @returns 无返回值，直接更新怪物重生tick相关状态。
 */

function normalizeMonsterRespawnTicks(respawnTicks, respawnSec) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof respawnTicks === 'number' && Number.isFinite(respawnTicks)) {
        return Math.max(1, Math.trunc(respawnTicks));
    }
    if (typeof respawnSec === 'number' && Number.isFinite(respawnSec)) {
        return Math.max(1, Math.trunc(respawnSec));
    }
    return 15;
}
/**
 * normalizeMonsterTier：规范化或转换怪物Tier。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新怪物Tier相关状态。
 */

function normalizeMonsterTier(raw) {
    return raw === 'variant' || raw === 'demon_king' ? raw : 'mortal_blood';
}
/**
 * normalizeTechniqueGrade：规范化或转换功法Grade。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新功法Grade相关状态。
 */

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
/**
 * cloneSkill：构建技能。
 * @param source 来源对象。
 * @returns 无返回值，直接更新技能相关状态。
 */

function cloneSkill(source) {
    return {
        ...source,
        targeting: source.targeting ? { ...source.targeting } : undefined,
        effects: source.effects.map((entry) => ({ ...entry })),
    };
}
/**
 * resolveSkillRange：规范化或转换技能范围。
 * @param skill 参数说明。
 * @returns 无返回值，直接更新技能范围相关状态。
 */

function resolveSkillRange(skill) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
/**
 * normalizeMonsterAggroRange：规范化或转换怪物Aggro范围。
 * @param aggroRange 参数说明。
 * @param radius 影响半径。
 * @param viewRange 参数说明。
 * @returns 无返回值，直接更新怪物Aggro范围相关状态。
 */

function normalizeMonsterAggroRange(aggroRange, radius, viewRange) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeMonsterLeashRange：规范化或转换怪物Leash范围。
 * @param aggroRange 参数说明。
 * @param radius 影响半径。
 * @param viewRange 参数说明。
 * @returns 无返回值，直接更新怪物Leash范围相关状态。
 */

function normalizeMonsterLeashRange(aggroRange, radius, viewRange) {
    return Math.max(2, normalizeMonsterAggroRange(aggroRange, radius, viewRange) + 4);
}
/**
 * normalizeMonsterRuntimeStateRecord：规范化或转换怪物运行态状态Record。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新怪物运行态状态Record相关状态。
 */

function normalizeMonsterRuntimeStateRecord(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

        alive: entry.alive !== false,

        respawnLeft: typeof entry.respawnLeft === 'number' && Number.isFinite(entry.respawnLeft)
            ? Math.max(0, Math.trunc(entry.respawnLeft))
            : 0,

        facing: typeof entry.facing === 'number' && Number.isFinite(entry.facing)
            ? Math.trunc(entry.facing)
            : shared_1.Direction.South,
    };
}
/**
 * planFallbackSpawnCounts：执行planFallbackSpawn数量相关逻辑。
 * @param mapId 地图 ID。
 * @param document 参数说明。
 * @param spawns 参数说明。
 * @returns 无返回值，直接更新planFallbackSpawn数量相关状态。
 */

function planFallbackSpawnCounts(mapId, document, spawns) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const requestedCounts = spawns.map((spawn) => resolveFallbackSpawnRequestedCount(spawn));

    const totalRequested = requestedCounts.reduce((sum, count) => sum + count, 0);
    if (totalRequested <= 0) {
        return [];
    }

    const profileId = document.terrainProfileId
        ?? LEGACY_MAP_TERRAIN_PROFILE_IDS[mapId]
        ?? mapId;

    const perSpawnCap = resolveFallbackSpawnPerSpawnCap(profileId);

    const totalCap = Math.max(spawns.length, Math.min(totalRequested, resolveFallbackSpawnTotalCap(profileId)));

    const cappedCounts = requestedCounts.map((count) => Math.min(count, perSpawnCap));

    const cappedTotal = cappedCounts.reduce((sum, count) => sum + count, 0);
    if (cappedTotal <= totalCap) {
        return cappedCounts;
    }

    const planned = cappedCounts.map((count) => Math.min(1, count));

    let remaining = totalCap - planned.reduce((sum, count) => sum + count, 0);
    if (remaining <= 0) {
        return planned;
    }

    const extras = cappedCounts.map((count) => Math.max(0, count - 1));
    while (remaining > 0) {

        let allocated = false;
        for (let index = 0; index < extras.length && remaining > 0; index += 1) {
            if (extras[index] <= 0) {
                continue;
            }
            planned[index] += 1;
            extras[index] -= 1;
            remaining -= 1;
            allocated = true;
        }
        if (!allocated) {
            break;
        }
    }
    return planned;
}
/**
 * resolveFallbackSpawnRequestedCount：规范化或转换FallbackSpawnRequested数量。
 * @param spawn 参数说明。
 * @returns 无返回值，直接更新FallbackSpawnRequested数量相关状态。
 */

function resolveFallbackSpawnRequestedCount(spawn) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (Number.isFinite(spawn.count)) {
        return Math.max(1, Math.trunc(spawn.count));
    }
    if (Number.isFinite(spawn.maxAlive)) {
        return Math.max(1, Math.trunc(Math.min(spawn.maxAlive, 2)));
    }
    return 1;
}
/**
 * resolveFallbackSpawnPerSpawnCap：规范化或转换FallbackSpawnPerSpawnCap。
 * @param profileId profile ID。
 * @returns 无返回值，直接更新FallbackSpawnPerSpawnCap相关状态。
 */

function resolveFallbackSpawnPerSpawnCap(profileId) {
    switch (profileId) {
        case 'mortal_settlement':
            return 4;
        case 'yellow_frontier':
        case 'yellow_bamboo':
            return 5;
        default:
            return 6;
    }
}
/**
 * resolveFallbackSpawnTotalCap：规范化或转换FallbackSpawnTotalCap。
 * @param profileId profile ID。
 * @returns 无返回值，直接更新FallbackSpawnTotalCap相关状态。
 */

function resolveFallbackSpawnTotalCap(profileId) {
    switch (profileId) {
        case 'mortal_settlement':
            return 12;
        case 'yellow_frontier':
        case 'yellow_bamboo':
            return 16;
        default:
            return 18;
    }
}
/**
 * cloneMonsterAttributes：构建怪物Attribute。
 * @param source 来源对象。
 * @returns 无返回值，直接更新怪物Attribute相关状态。
 */

function cloneMonsterAttributes(source) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}
/**
 * collectJsonFiles：执行JsonFile相关逻辑。
 * @param dirPath 参数说明。
 * @returns 无返回值，直接更新JsonFile相关状态。
 */

function collectJsonFiles(dirPath) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * resolveFallbackSpawnPositions：规范化或转换FallbackSpawn位置。
 * @param document 参数说明。
 * @param spawn 参数说明。
 * @param count 数量。
 * @param occupied 参数说明。
 * @returns 无返回值，直接更新FallbackSpawn位置相关状态。
 */

function resolveFallbackSpawnPositions(document, spawn, count, occupied) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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

                const tileType = (0, shared_1.getTileTypeFromMapChar)(document.tiles[y]?.[x] ?? '#');
                if (!(0, shared_1.isTileTypeWalkable)(tileType)) {
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
        });
    }
    return positions;
}
/**
 * normalizeStarterInventoryEntry：规范化或转换Starter背包条目。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新Starter背包条目相关状态。
 */

function normalizeStarterInventoryEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeItemTemplate：规范化或转换道具Template。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新道具Template相关状态。
 */

function normalizeItemTemplate(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.itemId !== 'string' || !candidate.itemId.trim()) {
        return null;
    }
    const defaultTileAuraResourceKey = (0, shared_1.buildQiResourceKey)(shared_1.DEFAULT_QI_RESOURCE_DESCRIPTOR);
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
    return {
        itemId: candidate.itemId,

        name: typeof candidate.name === 'string' ? candidate.name : undefined,
        type: candidate.type,

        desc: typeof candidate.desc === 'string' ? candidate.desc : undefined,

        groundLabel: typeof candidate.groundLabel === 'string' ? candidate.groundLabel : undefined,
        grade: candidate.grade,
        level: Number.isFinite(candidate.level) ? Math.trunc(candidate.level ?? 0) : undefined,

        equipSlot: typeof candidate.equipSlot === 'string' && shared_1.EQUIP_SLOTS.includes(candidate.equipSlot)
            ? candidate.equipSlot
            : undefined,
        equipAttrs: candidate.equipAttrs ? { ...candidate.equipAttrs } : undefined,
        equipStats: candidate.equipStats ? { ...candidate.equipStats } : undefined,
        equipValueStats: candidate.equipValueStats ? { ...candidate.equipValueStats } : undefined,
        effects: Array.isArray(candidate.effects) ? candidate.effects.slice() : undefined,
        healAmount: Number.isFinite(candidate.healAmount) ? Math.max(1, Math.trunc(candidate.healAmount ?? 0)) : undefined,
        healPercent: Number.isFinite(candidate.healPercent) ? clampUnitRatio(candidate.healPercent ?? 0) : undefined,
        qiPercent: Number.isFinite(candidate.qiPercent) ? clampUnitRatio(candidate.qiPercent ?? 0) : undefined,
        consumeBuffs: normalizeConsumableBuffs(raw.consumeBuffs),
        tags: Array.isArray(candidate.tags) ? candidate.tags.slice() : undefined,

        mapUnlockId: typeof candidate.mapUnlockId === 'string' ? candidate.mapUnlockId : undefined,
        mapUnlockIds: Array.isArray(candidate.mapUnlockIds)
            ? candidate.mapUnlockIds.filter((entry) => typeof entry === 'string' && entry.length > 0)
            : undefined,
        tileAuraGainAmount: synthesizedTileAuraGainAmount,
        tileResourceGains: normalizedTileResourceGains && normalizedTileResourceGains.length > 0
            ? normalizedTileResourceGains
            : defaultTileResourceGains,

        allowBatchUse: candidate.allowBatchUse === true,

        learnTechniqueId: typeof raw.learnTechniqueId === 'string'
            ? raw.learnTechniqueId
            : undefined,
    };
}
/**
 * normalizeConsumableBuffs：规范化或转换ConsumableBuff。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新ConsumableBuff相关状态。
 */

function normalizeConsumableBuffs(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

        const compiled = isRecord(candidate.valueStats)
            ? (0, shared_1.compileValueStatsToActualStats)(candidate.valueStats)
            : undefined;

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
                stats: isRecord(candidate.stats)
                    ? { ...candidate.stats }
                    : compiled,
                qiProjection: Array.isArray(candidate.qiProjection)
                    ? candidate.qiProjection
                        .filter((modifier) => isRecord(modifier))
                        .map((modifier) => ({ ...modifier }))
                    : undefined,
            }];
    });
    return buffs.length > 0 ? buffs : undefined;
}
/**
 * matchesLootPoolFilters：执行matche掉落PoolFilter相关逻辑。
 * @param item 道具。
 * @param query 参数说明。
 * @returns 无返回值，直接更新matche掉落PoolFilter相关状态。
 */

function matchesLootPoolFilters(item, query) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * resolveTechniqueGradeOrder：规范化或转换功法Grade订单。
 * @param grade 参数说明。
 * @returns 无返回值，直接更新功法Grade订单相关状态。
 */

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
/**
 * inferTechniqueGradeFromItemLevel：执行infer功法GradeFrom道具等级相关逻辑。
 * @param level 参数说明。
 * @returns 无返回值，直接更新infer功法GradeFrom道具等级相关状态。
 */

function inferTechniqueGradeFromItemLevel(level) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * resolveItemTemplateLevel：规范化或转换道具Template等级。
 * @param item 道具。
 * @returns 无返回值，直接更新道具Template等级相关状态。
 */

function resolveItemTemplateLevel(item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * randomIntInclusive：执行randomIntInclusive相关逻辑。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新randomIntInclusive相关状态。
 */

function randomIntInclusive(min, max) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (max <= min) {
        return min;
    }
    return min + Math.floor(Math.random() * ((max - min) + 1));
}
/**
 * isRecord：判断Record是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成Record的条件判断。
 */

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
/**
 * clampUnitRatio：执行clampUnitRatio相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新clampUnitRatio相关状态。
 */

function clampUnitRatio(value) {
    return Math.max(0.01, Math.min(1, Number(value)));
}
/**
 * normalizeTechniqueTemplate：规范化或转换功法Template。
 * @param raw 参数说明。
 * @param sharedTechniqueBuffs 参数说明。
 * @returns 无返回值，直接更新功法Template相关状态。
 */

function normalizeTechniqueTemplate(raw, sharedTechniqueBuffs = new Map()) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

    const layers = Array.isArray(candidate.layers)
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
    return {
        id: candidate.id,
        name: candidate.name,
        grade,
        category: isTechniqueCategory(candidate.category) ? candidate.category : inferTechniqueCategory(skills),
        realmLv,
        layers,
        attrCurves: normalizeTechniqueAttrCurves(candidate.attrCurves),
        skills,
    };
}
/**
 * normalizeTechniqueLayer：规范化或转换功法层。
 * @param raw 参数说明。
 * @param realmLv 参数说明。
 * @returns 无返回值，直接更新功法层相关状态。
 */

function normalizeTechniqueLayer(raw, realmLv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            ? (0, shared_1.scaleTechniqueExp)(Number(candidate.expFactor), realmLv)
            : Math.max(0, Math.trunc(Number(candidate.expToNext ?? 0))),
        attrs: normalizeTechniqueLayerAttrs(candidate.attrs),
    };
}
/**
 * normalizeTechniqueLayerAttrs：规范化或转换功法层Attr。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新功法层Attr相关状态。
 */

function normalizeTechniqueLayerAttrs(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeTechniqueAttrCurves：规范化或转换功法AttrCurve。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新功法AttrCurve相关状态。
 */

function normalizeTechniqueAttrCurves(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const result = {};
    for (const [key, segments] of Object.entries(raw)) {
        if (!Array.isArray(segments)) {
            continue;
        }

        const normalizedSegments = segments
            .filter((entry) => Boolean(entry && typeof entry === 'object'))
            .map((entry) => ({
            startLevel: Number.isFinite(entry.startLevel) ? Math.max(1, Math.trunc(Number(entry.startLevel))) : 1,
            endLevel: Number.isFinite(entry.endLevel) ? Math.max(1, Math.trunc(Number(entry.endLevel))) : undefined,
            gainPerLevel: Number.isFinite(entry.gainPerLevel) ? Number(entry.gainPerLevel) : 0,
        }))
            .filter((entry) => entry.gainPerLevel !== 0)
            .sort((left, right) => left.startLevel - right.startLevel || ((left.endLevel ?? Number.MAX_SAFE_INTEGER) - (right.endLevel ?? Number.MAX_SAFE_INTEGER)));
        if (normalizedSegments.length > 0) {
            result[key] = normalizedSegments;
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
/**
 * normalizeSkill：规范化或转换技能。
 * @param raw 参数说明。
 * @param grade 参数说明。
 * @param realmLv 参数说明。
 * @param sharedTechniqueBuffs 参数说明。
 * @returns 无返回值，直接更新技能相关状态。
 */

function normalizeSkill(raw, grade, realmLv, sharedTechniqueBuffs = new Map()) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

    const unlockLevel = (0, shared_1.resolveSkillUnlockLevel)({
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
        cost: (0, shared_1.calculateTechniqueSkillQiCost)(costMultiplier, grade, realmLv),
        costMultiplier,
        range,
        targeting: candidate.targeting ? { ...candidate.targeting } : undefined,
        effects: cloneSkillEffects(candidate.effects, sharedTechniqueBuffs),
        unlockLevel,
        unlockRealm,
        unlockPlayerRealm: candidate.unlockPlayerRealm,
        requiresTarget: candidate.requiresTarget,
        targetMode: candidate.targetMode,
    };
}
/**
 * cloneSkillEffects：构建技能Effect。
 * @param raw 参数说明。
 * @param sharedTechniqueBuffs 参数说明。
 * @returns 无返回值，直接更新技能Effect相关状态。
 */

function cloneSkillEffects(raw, sharedTechniqueBuffs = new Map()) {
    return raw
        .filter((entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => resolveSharedTechniqueBuffEffect(entry, sharedTechniqueBuffs));
}
/**
 * normalizeSharedTechniqueBuffEffect：规范化或转换Shared功法BuffEffect。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新Shared功法BuffEffect相关状态。
 */

function normalizeSharedTechniqueBuffEffect(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * resolveSharedTechniqueBuffEffect：规范化或转换Shared功法BuffEffect。
 * @param raw 参数说明。
 * @param sharedTechniqueBuffs 参数说明。
 * @returns 无返回值，直接更新Shared功法BuffEffect相关状态。
 */

function resolveSharedTechniqueBuffEffect(raw, sharedTechniqueBuffs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        throw new Error(`共享功法 Buff 模板 ${buffRef} 不存在`);
    }
    const { id: _id, ...templateEffect } = template;
    const { buffRef: _buffRef, ...effect } = candidate;
    return {
        ...templateEffect,
        ...effect,
        type: 'buff',
    };
}
/**
 * isTechniqueGrade：判断功法Grade是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成功法Grade的条件判断。
 */

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
/**
 * isTechniqueCategory：判断功法Category是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成功法Category的条件判断。
 */

function isTechniqueCategory(value) {
    return value === 'arts' || value === 'internal' || value === 'divine' || value === 'secret';
}
/**
 * inferTechniqueCategory：执行infer功法Category相关逻辑。
 * @param skills 参数说明。
 * @returns 无返回值，直接更新infer功法Category相关状态。
 */

function inferTechniqueCategory(skills) {
    return skills.length > 0 ? 'arts' : 'internal';
}
