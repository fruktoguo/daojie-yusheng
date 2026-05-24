/**
 * 本文件属于服务端内容加载或模板 Registry，负责把配置整理成运行期只读引用。
 *
 * 维护时要保持启动期解析、冻结和实例工厂边界，避免 tick 热路径复制大对象。
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS, DEFAULT_PLAYER_REALM_STAGE, DEFAULT_QI_RESOURCE_DESCRIPTOR, Direction, ELEMENT_KEYS, EQUIP_SLOTS, NUMERIC_SCALAR_STAT_KEYS, PLAYER_REALM_NUMERIC_TEMPLATES, TECHNIQUE_EXP_BASE, TechniqueRealm, buildQiResourceKey, calculateTechniqueSkillQiCost, cloneNumericRatioDivisors, cloneNumericStats, compileEquipmentBaselinePercentsToActualStats, compileValueStatsToActualStats, createMonsterMainCombatStatModifierStats, deriveTechniqueRealm, expandTechniqueAttrRatio, expandTechniqueExpCurve, expandTechniqueLayerGains, getTechniqueExpToNext, getTileTypeFromMapChar, inferMonsterTierFromName, isTileTypeWalkable, normalizeEditableMapDocument, normalizeMonsterTier as normalizeSharedMonsterTier, normalizeTechniqueAttrRatio, resolveMonsterTemplateRecord, resolveSkillRequiresTarget, resolveSkillUnlockLevel, scaleTechniqueExp, shouldExpandTechniqueAttrRatio } from '@mud/shared';
import { resolveProjectPath } from '../common/project-path';

const ITEM_INSTANCE_FIELD_KEYS = new Set(['itemId', 'itemInstanceId', 'count', 'enhanceLevel', 'enhancementLevel']);

function createItemInstanceFromTemplate(template, source: any = {}) {
    const instance = Object.create(template);
    for (const [key, value] of Object.entries(source ?? {})) {
        if (ITEM_INSTANCE_FIELD_KEYS.has(key) || value === undefined) {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(template, key)) {
            continue;
        }
        instance[key] = value;
    }
    defineInstanceValue(instance, 'itemId', typeof source?.itemId === 'string' && source.itemId.trim()
        ? source.itemId.trim()
        : template.itemId);
    defineInstanceValue(instance, 'count', normalizeItemInstanceCount(source?.count));
    const enhanceLevel = normalizeItemInstanceEnhanceLevel(source?.enhanceLevel ?? source?.enhancementLevel ?? template.enhanceLevel);
    if (enhanceLevel > 0) {
        defineInstanceValue(instance, 'enhanceLevel', enhanceLevel);
    }
    const itemInstanceId = typeof source?.itemInstanceId === 'string' && source.itemInstanceId.length > 0
        ? source.itemInstanceId
        : undefined;
    if (itemInstanceId) {
        defineInstanceValue(instance, 'itemInstanceId', itemInstanceId);
    }
    return instance;
}

function defineInstanceValue(target, key, value) {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}

function normalizeItemInstanceCount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1;
}

function normalizeItemInstanceEnhanceLevel(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

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
    const healAmount = Number.isFinite(candidate.healAmount) ? Math.max(1, Math.trunc(candidate.healAmount ?? 0)) : undefined;
    const healPercent = Number.isFinite(candidate.healPercent) ? clampUnitRatio(candidate.healPercent ?? 0) : undefined;
    const qiPercent = Number.isFinite(candidate.qiPercent) ? clampUnitRatio(candidate.qiPercent ?? 0) : undefined;
    const consumeBuffs = normalizeConsumableBuffs(raw.consumeBuffs);
    const cooldown = Number.isFinite(candidate.cooldown)
        ? Math.max(0, Math.trunc(Number(candidate.cooldown)))
        : ((healAmount ?? 0) > 0 || (healPercent ?? 0) > 0 || (qiPercent ?? 0) > 0 || (consumeBuffs?.length ?? 0) > 0)
            ? DEFAULT_INSTANT_CONSUMABLE_COOLDOWN_TICKS
            : undefined;
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
        healAmount,
        healPercent,
        qiPercent,
        cooldown,
        alchemySuccessRate: normalizeUtilityRate(candidate.alchemySuccessRate),
        alchemySpeedRate: normalizeUtilityRate(candidate.alchemySpeedRate),
        enhancementSuccessRate: normalizeUtilityRate(candidate.enhancementSuccessRate),
        enhancementSpeedRate: normalizeUtilityRate(candidate.enhancementSpeedRate),
        miningDamageRate: normalizeUtilityRate(candidate.miningDamageRate),
        consumeBuffs,
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
            .map((skill, index) => normalizeSkill(skill, grade, realmLv, sharedTechniqueBuffs, candidate.id, index))
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
        attrRatio: normalizeTechniqueAttrRatio(isRecord(candidate.attrRatio) ? candidate.attrRatio : undefined),
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

function normalizeSkill(raw, grade, realmLv, sharedTechniqueBuffs = new Map(), techniqueId = '', index = 0) {

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    const skillId = normalizeTechniqueSkillId(candidate.id, techniqueId, index);
    if (!skillId
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

    const costMultiplier = Number.isFinite(candidate.costMultiplier)
        ? Math.max(0, Number(candidate.costMultiplier))
        : Number.isFinite(candidate.cost)
            ? Math.max(0, Number(candidate.cost))
            : 0;

    const cooldown = Math.max(0, Math.trunc(Number(candidate.cooldown)));

    const range = Math.max(0, Math.trunc(Number(candidate.range)));
    const targeting = candidate.targeting ? { ...candidate.targeting } : undefined;
    const requiresTarget = resolveSkillRequiresTarget({
        range,
        targeting,
        requiresTarget: candidate.requiresTarget,
    });
    return {
        id: skillId,
        name: candidate.name,
        desc: candidate.desc,
        cooldown,
        cost: calculateTechniqueSkillQiCost(costMultiplier, grade, realmLv),
        costMultiplier,
        range,
        targeting,
        effects: cloneSkillEffects(candidate.effects, sharedTechniqueBuffs, skillId, candidate.name),
        unlockLevel,
        unlockRealm,
        unlockPlayerRealm: candidate.unlockPlayerRealm,
        requiresTarget: requiresTarget === false ? false : candidate.requiresTarget,
        targetMode: candidate.targetMode,
        playerCast: normalizeSkillCastDef(candidate.playerCast, false),
        monsterCast: normalizeSkillCastDef(candidate.monsterCast, true),
    };
}

function normalizeTechniqueSkillId(raw, techniqueId = '', index = 0) {
    if (typeof raw === 'string' && raw.trim()) {
        const normalized = raw.trim().replace(/[^A-Za-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '');
        if (normalized) {
            return normalized;
        }
    }
    const normalizedTechniqueId = typeof techniqueId === 'string' && techniqueId.trim()
        ? techniqueId.trim().replace(/[^A-Za-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '')
        : 'technique';
    return `${normalizedTechniqueId}_skill_${Math.max(1, Math.trunc(Number(index) || 0) + 1)}`;
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

function cloneSkillEffects(raw, sharedTechniqueBuffs = new Map(), skillId = 'skill', skillName = '技能') {
    return raw
        .filter((entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry, index) => normalizeGeneratedTechniqueSkillEffect(
            resolveSharedTechniqueBuffEffect(entry, sharedTechniqueBuffs),
            skillId,
            skillName,
            index,
        ));
}

function normalizeGeneratedTechniqueSkillEffect(raw, skillId, skillName, index) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return raw;
    }
    const effect = { ...raw };
    if ((effect.type === 'damage' || effect.type === 'heal') && effect.formula === undefined && effect.value !== undefined) {
        effect.formula = normalizeGeneratedTechniqueSkillFormula(effect.value, effect.type, effect.damageKind);
    }
    if (effect.type === 'damage' && typeof effect.formula === 'number' && Number.isFinite(effect.formula)) {
        effect.formula = normalizeGeneratedTechniqueSkillFormula(effect.formula, effect.type, effect.damageKind);
    }
    if (effect.type === 'heal' && effect.target !== 'self' && effect.target !== 'target' && effect.target !== 'allies') {
        effect.target = 'self';
    }
    if (effect.type === 'buff') {
        if (effect.target !== 'self' && effect.target !== 'target' && effect.target !== 'allies') {
            effect.target = 'self';
        }
        if (typeof effect.buffId !== 'string' || !effect.buffId.trim()) {
            effect.buffId = `${skillId}_buff_${Math.max(1, index + 1)}`;
        }
        if (typeof effect.name !== 'string' || !effect.name.trim()) {
            effect.name = skillName;
        }
        if (!Number.isFinite(effect.duration)) {
            effect.duration = 3;
        }
    }
    return effect;
}

function normalizeGeneratedTechniqueSkillFormula(raw, effectType, damageKind) {
    if (raw && typeof raw === 'object') {
        return raw;
    }
    const value = Number(raw);
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 1;
    if (effectType === 'damage') {
        return buildGeneratedTechniqueDamageFormula(normalized, damageKind);
    }
    return normalized;
}

function buildGeneratedTechniqueDamageFormula(value, damageKind) {
    const statVar = damageKind === 'physical' ? 'caster.stat.physAtk' : 'caster.stat.spellAtk';
    const scale = Math.max(0, Math.round(Number(value) * 100) / 100);
    return {
        op: 'mul',
        args: [
            {
                op: 'add',
                args: [
                    {
                        var: statVar,
                        scale,
                    },
                ],
            },
            {
                op: 'add',
                args: [
                    1,
                    {
                        var: 'techLevel',
                        scale: 0.1,
                    },
                ],
            },
        ],
    };
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

export {
  buildMonsterSpawnKey,
  buildTechniqueRuntimeStateFromTemplate,
  cloneMonsterAttributes,
  cloneNumericRatioDivisors,
  cloneNumericStats,
  cloneQiProjectionModifiers,
  cloneSkill,
  cloneTechniqueLayerAttrsWithoutSpecialStats,
  collectJsonFiles,
  createItemInstanceFromTemplate,
  createMonsterStatFormula,
  findMapDocumentFile,
  inferTechniqueGradeFromItemLevel,
  matchesLootPoolFilters,
  normalizeItemTemplate,
  normalizeMonsterInitialBuffs,
  normalizeMonsterMaxHp,
  normalizeMonsterRuntimeStateRecord,
  resolveMonsterRuntimeTemplateStats,
  normalizeMonsterTier,
  normalizeSharedTechniqueBuffEffect,
  normalizeStarterInventoryEntry,
  normalizeTechniqueGrade,
  normalizeTechniqueTemplate,
  parseMonsterIdFromRuntimeId,
  randomIntInclusive,
  resetMapDocumentFileIndex,
  resolveFallbackSpawnPopulation,
  resolveFallbackSpawnPositions,
  resolveFallbackSpawnRespawnTicks,
  resolveItemTemplateLevel,
  resolveSkillRange,
  resolveTechniqueGradeOrder,
  resolveTechniqueLayerSpecialStats,
};
