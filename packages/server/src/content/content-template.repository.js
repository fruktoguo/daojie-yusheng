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

const shared_1 = require("@mud/shared-next");

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
            allowBatchUse: template.allowBatchUse,
        })).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
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
            count: Math.max(1, Math.trunc(item.count)),
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
    getTechniqueName(techniqueId) {
        return this.techniqueTemplates.get(techniqueId)?.name ?? null;
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
    rollMonsterDrops(monsterId, rolls = 1, lootRateBonus = 0, rareLootRateBonus = 0) {

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
    buildFallbackMonsterRuntimeStatesForMap(mapId) {

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
    getMonsterCombatProfile(monsterId) {

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
    getSkill(skillId) {
        for (const technique of this.techniqueTemplates.values()) {
            const skill = technique.skills.find((entry) => entry.id === skillId);
            if (skill) {
                return cloneSkill(skill);
            }
        }
        return null;
    }
    loadSharedTechniqueBuffs() {

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
    loadAll() {
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
    loadMonsterDrops() {

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
function parseMonsterIdFromRuntimeId(runtimeId) {

    const parts = runtimeId.split(':');
    return parts.length >= 4 ? parts[2] ?? '' : '';
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

        alive: entry.alive !== false,

        respawnLeft: typeof entry.respawnLeft === 'number' && Number.isFinite(entry.respawnLeft)
            ? Math.max(0, Math.trunc(entry.respawnLeft))
            : 0,

        facing: typeof entry.facing === 'number' && Number.isFinite(entry.facing)
            ? Math.trunc(entry.facing)
            : shared_1.Direction.South,
    };
}
function planFallbackSpawnCounts(mapId, document, spawns) {

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
function resolveFallbackSpawnRequestedCount(spawn) {
    if (Number.isFinite(spawn.count)) {
        return Math.max(1, Math.trunc(spawn.count));
    }
    if (Number.isFinite(spawn.maxAlive)) {
        return Math.max(1, Math.trunc(Math.min(spawn.maxAlive, 2)));
    }
    return 1;
}
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
function normalizeItemTemplate(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.itemId !== 'string' || !candidate.itemId.trim()) {
        return null;
    }
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
        tileAuraGainAmount: Number.isFinite(candidate.tileAuraGainAmount)
            ? Number(candidate.tileAuraGainAmount)
            : undefined,

        allowBatchUse: candidate.allowBatchUse === true,

        learnTechniqueId: typeof raw.learnTechniqueId === 'string'
            ? raw.learnTechniqueId
            : undefined,
    };
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
            ? (0, shared_1.scaleTechniqueExp)(Number(candidate.expFactor), realmLv)
            : Math.max(0, Math.trunc(Number(candidate.expToNext ?? 0))),
        attrs: normalizeTechniqueLayerAttrs(candidate.attrs),
    };
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
function normalizeTechniqueAttrCurves(raw) {
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
//# sourceMappingURL=content-template.repository.js.map


