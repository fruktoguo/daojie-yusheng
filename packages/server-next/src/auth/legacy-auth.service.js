"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** LegacyAuthService_1：定义该变量以承载业务值。 */
var LegacyAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** LegacyAuthService：定义该变量以承载业务值。 */
let LegacyAuthService = LegacyAuthService_1 = class LegacyAuthService {
    logger = new common_1.Logger(LegacyAuthService_1.name);
    jwtSecret = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
    pool = null;
    poolInitPromise = null;
    poolUnavailable = false;
    poolUnavailableLogged = false;
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
/** pool：定义该变量以承载业务值。 */
        const pool = this.pool;
        this.pool = null;
        this.poolInitPromise = null;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
/** authenticateSocketToken：执行对应的业务逻辑。 */
    async authenticateSocketToken(token) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.validateToken(token);
        if (!payload) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return {
                userId: payload.sub,
                username: payload.username,
                displayName: resolveDisplayName(null, payload.username, payload.displayName),
                playerId: buildFallbackPlayerId(payload.sub),
                playerName: resolvePlayerName(null, payload.username, payload.displayName),
            };
        }
/** result：定义该变量以承载业务值。 */
        const result = await pool.query(`
        SELECT
          u.id AS "userId",
          u.username AS "username",
          u."displayName" AS "displayName",
          p.id AS "playerId",
          p.name AS "playerName"
        FROM users u
        LEFT JOIN players p ON p."userId" = u.id
        WHERE u.id = $1
        LIMIT 1
      `, [payload.sub]);
/** row：定义该变量以承载业务值。 */
        const row = result.rows[0];
        return {
            userId: row?.userId ?? payload.sub,
            username: row?.username ?? payload.username,
            displayName: resolveDisplayName(row?.displayName, row?.username ?? payload.username, payload.displayName),
            playerId: row?.playerId ?? buildFallbackPlayerId(payload.sub),
            playerName: resolvePlayerName(row?.playerName ?? null, row?.username ?? payload.username, payload.displayName),
        };
    }
/** loadLegacyPlayerSnapshot：执行对应的业务逻辑。 */
    async loadLegacyPlayerSnapshot(playerId) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await pool.query(`
        SELECT
          id,
          "mapId",
          x,
          y,
          facing,
          hp,
          "maxHp",
          qi,
          "pendingLogbookMessages",
          inventory,
          "temporaryBuffs",
          equipment,
          techniques,
          quests,
          bonuses,
          foundation,
          "combatExp",
          "boneAgeBaseYears",
          "lifeElapsedTicks",
          "lifespanYears",
          "heavenGate",
          "spiritualRoots",
          "unlockedMinimapIds",
          "autoBattle",
          "autoBattleSkills",
          "combatTargetId",
          "combatTargetLocked",
          "autoRetaliate",
          "autoBattleStationary",
          "allowAoePlayerHit",
          "autoIdleCultivation",
          "autoSwitchCultivation",
          "cultivatingTechId"
        FROM players
        WHERE id = $1
        LIMIT 1
      `, [playerId]);
/** row：定义该变量以承载业务值。 */
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return toLegacyPlayerSnapshot(row);
    }
/** validateToken：执行对应的业务逻辑。 */
    validateToken(token) {
        try {
/** payload：定义该变量以承载业务值。 */
            const payload = verifyLegacyJwt(token, this.jwtSecret);
            if (!payload || payload.role === 'gm') {
                return null;
            }
            if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                return null;
            }
            return payload;
        }
        catch {
            return null;
        }
    }
/** ensurePool：执行对应的业务逻辑。 */
    async ensurePool() {
        if (this.poolUnavailable) {
            return null;
        }
        if (this.pool) {
            return this.pool;
        }
        if (this.poolInitPromise) {
            return this.poolInitPromise;
        }
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.poolUnavailable = true;
            if (!this.poolUnavailableLogged) {
                this.poolUnavailableLogged = true;
                this.logger.warn('Legacy auth degraded: no SERVER_NEXT_DATABASE_URL/DATABASE_URL, fallback to token-only identity');
            }
            return null;
        }
        this.poolInitPromise = (async () => {
/** pool：定义该变量以承载业务值。 */
            const pool = new pg_1.Pool({ connectionString: databaseUrl });
            try {
                await pool.query('SELECT 1');
                this.pool = pool;
                return pool;
            }
            catch (error) {
                this.poolUnavailable = true;
                this.logger.error('Legacy auth database init failed', error instanceof Error ? error.stack : String(error));
                await pool.end().catch(() => undefined);
                return null;
            }
            finally {
                this.poolInitPromise = null;
            }
        })();
        return this.poolInitPromise;
    }
};
exports.LegacyAuthService = LegacyAuthService;
exports.LegacyAuthService = LegacyAuthService = LegacyAuthService_1 = __decorate([
    (0, common_1.Injectable)()
], LegacyAuthService);
/** resolveDisplayName：执行对应的业务逻辑。 */
function resolveDisplayName(displayName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof displayName === 'string' ? displayName.normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
/** normalizedFallback：定义该变量以承载业务值。 */
    const normalizedFallback = typeof fallback === 'string' ? fallback.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalizedFallback)) {
        return normalizedFallback;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
/** resolvePlayerName：执行对应的业务逻辑。 */
function resolvePlayerName(playerName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
/** buildFallbackPlayerId：执行对应的业务逻辑。 */
function buildFallbackPlayerId(userId) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = userId.trim();
    return normalized ? `p_${normalized}` : 'p_guest';
}
/** isValidVisibleDisplayName：执行对应的业务逻辑。 */
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
/** toLegacyPlayerSnapshot：执行对应的业务逻辑。 */
function toLegacyPlayerSnapshot(row) {
/** inventory：定义该变量以承载业务值。 */
    const inventory = normalizeInventory(row.inventory);
/** buffs：定义该变量以承载业务值。 */
    const buffs = normalizeTemporaryBuffs(row.temporaryBuffs);
/** equipment：定义该变量以承载业务值。 */
    const equipment = normalizeEquipment(row.equipment);
/** techniques：定义该变量以承载业务值。 */
    const techniques = normalizeTechniques(row.techniques);
/** quests：定义该变量以承载业务值。 */
    const quests = normalizeQuests(row.quests);
/** unlockedMapIds：定义该变量以承载业务值。 */
    const unlockedMapIds = normalizeUnlockedMapIds(row.unlockedMinimapIds, row.mapId);
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
/** templateId：定义该变量以承载业务值。 */
            templateId: typeof row.mapId === 'string' && row.mapId.trim() ? row.mapId : 'yunlai_town',
            x: toFiniteInt(row.x, 0),
            y: toFiniteInt(row.y, 0),
            facing: normalizeDirection(row.facing),
        },
        vitals: {
            hp: Math.max(0, toFiniteInt(row.hp, 100)),
            maxHp: Math.max(1, toFiniteInt(row.maxHp, 100)),
            qi: Math.max(0, toFiniteInt(row.qi, 0)),
            maxQi: 0,
        },
        progression: {
            foundation: Math.max(0, toFiniteInt(row.foundation, 0)),
            combatExp: Math.max(0, toFiniteInt(row.combatExp, 0)),
            boneAgeBaseYears: Math.max(1, toFiniteInt(row.boneAgeBaseYears, shared_1.DEFAULT_BONE_AGE_YEARS)),
            lifeElapsedTicks: Math.max(0, toFiniteNumber(row.lifeElapsedTicks, 0)),
            lifespanYears: toNullablePositiveInt(row.lifespanYears),
            realm: normalizeLegacyRealmState(row.bonuses),
            heavenGate: normalizeHeavenGateState(row.heavenGate),
            spiritualRoots: normalizeHeavenGateRoots(row.spiritualRoots),
        },
        unlockedMapIds,
        inventory,
        equipment,
        techniques: {
            revision: 1,
            techniques,
/** cultivatingTechId：定义该变量以承载业务值。 */
            cultivatingTechId: typeof row.cultivatingTechId === 'string' && row.cultivatingTechId.trim()
                ? row.cultivatingTechId
                : null,
        },
        buffs: {
            revision: 1,
            buffs,
        },
        runtimeBonuses: normalizeRuntimeBonuses(row.bonuses),
        pendingLogbookMessages: normalizePendingLogbookMessages(row.pendingLogbookMessages),
        quests: {
            revision: 1,
            entries: quests,
        },
        combat: {
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: row.autoBattle === true,
/** combatTargetId：定义该变量以承载业务值。 */
            combatTargetId: typeof row.combatTargetId === 'string' && row.combatTargetId.trim()
                ? row.combatTargetId.trim()
                : null,
/** combatTargetLocked：定义该变量以承载业务值。 */
            combatTargetLocked: row.combatTargetLocked === true
                && typeof row.combatTargetId === 'string'
                && row.combatTargetId.trim().length > 0,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: row.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: row.autoBattleStationary === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: row.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: row.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: row.autoSwitchCultivation === true,
            senseQiActive: false,
            autoBattleSkills: normalizeAutoBattleSkills(row.autoBattleSkills),
        },
    };
}
/** normalizeInventory：执行对应的业务逻辑。 */
function normalizeInventory(value) {
    if (!value || typeof value !== 'object') {
        return {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        };
    }
/** inventory：定义该变量以承载业务值。 */
    const inventory = value;
    return {
        revision: 1,
        capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, toFiniteInt(inventory.capacity, shared_1.DEFAULT_INVENTORY_CAPACITY)),
        items: Array.isArray(inventory.items)
            ? inventory.items.map(normalizeItem).filter((entry) => entry !== null)
            : [],
    };
}
/** normalizeEquipment：执行对应的业务逻辑。 */
function normalizeEquipment(value) {
/** equipment：定义该变量以承载业务值。 */
    const equipment = value && typeof value === 'object'
        ? value
        : {};
/** slots：定义该变量以承载业务值。 */
    const slots = [];
    for (const slot of shared_1.EQUIP_SLOTS) {
        slots.push({
            slot,
            item: normalizeItem(equipment[slot]),
        });
    }
    return {
        revision: 1,
        slots,
    };
}
/** normalizeTemporaryBuffs：执行对应的业务逻辑。 */
function normalizeTemporaryBuffs(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** buffs：定义该变量以承载业务值。 */
    const buffs = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** buff：定义该变量以承载业务值。 */
        const buff = entry;
/** buffId：定义该变量以承载业务值。 */
        const buffId = typeof buff.buffId === 'string' ? buff.buffId.trim() : '';
/** name：定义该变量以承载业务值。 */
        const name = typeof buff.name === 'string' ? buff.name.trim() : '';
        if (!buffId || !name) {
            continue;
        }
        buffs.push({
            ...buff,
            buffId,
            name,
            remainingTicks: Math.max(0, toFiniteInt(buff.remainingTicks, 0)),
            duration: Math.max(0, toFiniteInt(buff.duration, 0)),
            stacks: Math.max(1, toFiniteInt(buff.stacks, 1)),
            maxStacks: Math.max(1, toFiniteInt(buff.maxStacks, 1)),
        });
    }
    return buffs;
}
/** normalizeTechniques：执行对应的业务逻辑。 */
function normalizeTechniques(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** techniques：定义该变量以承载业务值。 */
    const techniques = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** technique：定义该变量以承载业务值。 */
        const technique = entry;
/** techId：定义该变量以承载业务值。 */
        const techId = typeof technique.techId === 'string' ? technique.techId.trim() : '';
        if (!techId) {
            continue;
        }
        techniques.push({
            techId,
            level: Math.max(1, toFiniteInt(technique.level, 1)),
            exp: Math.max(0, toFiniteInt(technique.exp, 0)),
            expToNext: Math.max(0, toFiniteInt(technique.expToNext, 0)),
            realmLv: Math.max(0, toFiniteInt(technique.realmLv, 0)),
            realm: normalizeTechniqueRealm(technique.realm),
/** name：定义该变量以承载业务值。 */
            name: typeof technique.name === 'string' ? technique.name : undefined,
/** grade：定义该变量以承载业务值。 */
            grade: typeof technique.grade === 'string' ? technique.grade : undefined,
/** category：定义该变量以承载业务值。 */
            category: typeof technique.category === 'string' ? technique.category : undefined,
            skills: Array.isArray(technique.skills) ? technique.skills.map((entry) => ({ ...entry })) : [],
            layers: Array.isArray(technique.layers)
                ? technique.layers.map((layer) => ({
                    level: Math.max(1, toFiniteInt(layer?.level, 1)),
                    expToNext: Math.max(0, toFiniteInt(layer?.expToNext, 0)),
/** attrs：定义该变量以承载业务值。 */
                    attrs: layer?.attrs && typeof layer.attrs === 'object' ? { ...layer.attrs } : undefined,
                }))
                : undefined,
/** attrCurves：定义该变量以承载业务值。 */
            attrCurves: technique.attrCurves && typeof technique.attrCurves === 'object' ? { ...technique.attrCurves } : undefined,
        });
    }
    techniques.sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
    return techniques;
}
/** normalizeQuests：执行对应的业务逻辑。 */
function normalizeQuests(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => Boolean(entry && typeof entry === 'object'))
        .map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
    }));
}
/** normalizeUnlockedMapIds：执行对应的业务逻辑。 */
function normalizeUnlockedMapIds(value, currentMapId) {
/** result：定义该变量以承载业务值。 */
    const result = new Set();
    if (typeof currentMapId === 'string' && currentMapId.trim()) {
        result.add(currentMapId);
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === 'string' && entry.trim()) {
                result.add(entry);
            }
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
/** normalizeAutoBattleSkills：执行对应的业务逻辑。 */
function normalizeAutoBattleSkills(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** config：定义该变量以承载业务值。 */
        const config = entry;
/** skillId：定义该变量以承载业务值。 */
        const skillId = typeof config.skillId === 'string' ? config.skillId.trim() : '';
        if (!skillId) {
            continue;
        }
        result.push({
            skillId,
/** enabled：定义该变量以承载业务值。 */
            enabled: config.enabled !== false,
            skillEnabled: config.skillEnabled,
            autoBattleOrder: Number.isFinite(config.autoBattleOrder) ? Math.max(0, Math.trunc(config.autoBattleOrder)) : undefined,
        });
    }
    return result;
}
/** normalizeItem：执行对应的业务逻辑。 */
function normalizeItem(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
/** item：定义该变量以承载业务值。 */
    const item = value;
/** itemId：定义该变量以承载业务值。 */
    const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    if (!itemId) {
        return null;
    }
    return {
        ...item,
        itemId,
        count: Math.max(1, toFiniteInt(item.count, 1)),
    };
}
/** normalizeDirection：执行对应的业务逻辑。 */
function normalizeDirection(value) {
    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
/** normalizeTechniqueRealm：执行对应的业务逻辑。 */
function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
/** toFiniteInt：执行对应的业务逻辑。 */
function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
/** toFiniteNumber：执行对应的业务逻辑。 */
function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
/** toNullablePositiveInt：执行对应的业务逻辑。 */
function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
/** normalizeLegacyRealmState：执行对应的业务逻辑。 */
function normalizeLegacyRealmState(value) {
    if (!Array.isArray(value)) {
        return createRealmState();
    }
/** entry：定义该变量以承载业务值。 */
    const entry = value.find((bonus) => (bonus
        && typeof bonus === 'object'
        && (bonus.source === 'realm:state' || bonus.source === 'runtime:realm_state')));
/** stage：定义该变量以承载业务值。 */
    const stage = typeof entry?.meta?.stage === 'number' && entry.meta.stage in shared_1.PlayerRealmStage
        ? entry.meta.stage
        : shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: Math.max(1, toFiniteInt(entry?.meta?.realmLv, resolveRealmLevelFromStage(stage))),
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: Math.max(0, toFiniteInt(entry?.meta?.progress, 0)),
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: normalizeHeavenGateState(null),
    };
}
/** normalizePendingLogbookMessages：执行对应的业务逻辑。 */
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
/** indexById：定义该变量以承载业务值。 */
    const indexById = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** candidate：定义该变量以承载业务值。 */
        const candidate = {
/** id：定义该变量以承载业务值。 */
            id: typeof entry.id === 'string' ? entry.id.trim() : '',
            kind: normalizePendingLogbookKind(entry.kind),
/** text：定义该变量以承载业务值。 */
            text: typeof entry.text === 'string' ? entry.text.trim() : '',
/** from：定义该变量以承载业务值。 */
            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0,
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }
/** existingIndex：定义该变量以承载业务值。 */
        const existingIndex = indexById.get(candidate.id);
        if (existingIndex !== undefined) {
            normalized.splice(existingIndex, 1);
        }
        indexById.clear();
        normalized.push(candidate);
        while (normalized.length > 100) {
            normalized.shift();
        }
        normalized.forEach((item, index) => indexById.set(item.id, index));
    }
    return normalized;
}
/** normalizePendingLogbookKind：执行对应的业务逻辑。 */
function normalizePendingLogbookKind(value) {
    switch (value) {
        case 'system':
        case 'chat':
        case 'quest':
        case 'combat':
        case 'loot':
        case 'grudge':
            return value;
        default:
            return 'grudge';
    }
}
/** normalizeRuntimeBonuses：执行对应的业务逻辑。 */
function normalizeRuntimeBonuses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
/** source：定义该变量以承载业务值。 */
        source: canonicalizeRuntimeBonusSource(typeof entry.source === 'string' ? entry.source : ''),
/** label：定义该变量以承载业务值。 */
        label: typeof entry.label === 'string' ? entry.label : undefined,
/** attrs：定义该变量以承载业务值。 */
        attrs: entry.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,
/** stats：定义该变量以承载业务值。 */
        stats: entry.stats && typeof entry.stats === 'object' ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((item) => ({ ...item })) : undefined,
/** meta：定义该变量以承载业务值。 */
        meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : undefined,
    }))
        .filter((entry) => entry.source.length > 0);
}
/** canonicalizeRuntimeBonusSource：执行对应的业务逻辑。 */
function canonicalizeRuntimeBonusSource(source) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'legacy:vitals_baseline') {
        return 'runtime:vitals_baseline';
    }
    if (normalized === 'technique:aggregate') {
        return 'runtime:technique_aggregate';
    }
    if (normalized === 'realm:state') {
        return 'runtime:realm_state';
    }
    if (normalized === 'realm:stage') {
        return 'runtime:realm_stage';
    }
    if (normalized === 'heaven_gate:roots') {
        return 'runtime:heaven_gate_roots';
    }
    if (normalized.startsWith('equip:')) {
        return `equipment:${normalized.slice('equip:'.length)}`;
    }
    return normalized;
}
/** createRealmState：执行对应的业务逻辑。 */
function createRealmState() {
/** stage：定义该变量以承载业务值。 */
    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: 1,
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: 0,
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: null,
    };
}
/** normalizeHeavenGateState：执行对应的业务逻辑。 */
function normalizeHeavenGateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
/** unlocked：定义该变量以承载业务值。 */
        unlocked: raw.unlocked === true,
        severed: Array.isArray(raw.severed)
            ? raw.severed.filter((entry) => typeof entry === 'string')
            : [],
        roots: normalizeHeavenGateRoots(raw.roots),
/** entered：定义该变量以承载业务值。 */
        entered: raw.entered === true,
        averageBonus: toFiniteInt(raw.averageBonus, 0),
    };
}
/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
function normalizeHeavenGateRoots(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
        metal: Math.max(0, Math.min(100, toFiniteInt(raw.metal, 0))),
        wood: Math.max(0, Math.min(100, toFiniteInt(raw.wood, 0))),
        water: Math.max(0, Math.min(100, toFiniteInt(raw.water, 0))),
        fire: Math.max(0, Math.min(100, toFiniteInt(raw.fire, 0))),
        earth: Math.max(0, Math.min(100, toFiniteInt(raw.earth, 0))),
    };
}
/** resolveRealmLevelFromStage：执行对应的业务逻辑。 */
function resolveRealmLevelFromStage(stage) {
    switch (stage) {
        case shared_1.PlayerRealmStage.BodyTempering:
            return 6;
        case shared_1.PlayerRealmStage.BoneForging:
            return 9;
        case shared_1.PlayerRealmStage.Meridian:
            return 13;
        case shared_1.PlayerRealmStage.Innate:
            return 16;
        case shared_1.PlayerRealmStage.QiRefining:
            return 19;
        case shared_1.PlayerRealmStage.Foundation:
            return 31;
        case shared_1.PlayerRealmStage.Mortal:
        default:
            return 1;
    }
}
/** verifyLegacyJwt：执行对应的业务逻辑。 */
function verifyLegacyJwt(token, secret) {
/** segments：定义该变量以承载业务值。 */
    const segments = token.split('.');
    if (segments.length !== 3) {
        return null;
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
/** header：定义该变量以承载业务值。 */
    const header = parseJwtSegment(encodedHeader);
/** payload：定义该变量以承载业务值。 */
    const payload = parseJwtSegment(encodedPayload);
    if (!header || !payload) {
        return null;
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return null;
    }
/** expectedSignature：定义该变量以承载业务值。 */
    const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
/** left：定义该变量以承载业务值。 */
    const left = Buffer.from(encodedSignature);
/** right：定义该变量以承载业务值。 */
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
        return null;
    }
/** now：定义该变量以承载业务值。 */
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
        return null;
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
        return null;
    }
    return payload;
}
/** parseJwtSegment：执行对应的业务逻辑。 */
function parseJwtSegment(segment) {
    try {
/** json：定义该变量以承载业务值。 */
        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
/** value：定义该变量以承载业务值。 */
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
/** base64UrlDecode：执行对应的业务逻辑。 */
function base64UrlDecode(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
/** padding：定义该变量以承载业务值。 */
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
/** base64UrlEncode：执行对应的业务逻辑。 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
//# sourceMappingURL=legacy-auth.service.js.map
