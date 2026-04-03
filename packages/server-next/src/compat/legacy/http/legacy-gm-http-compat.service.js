"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGmHttpCompatService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const node_crypto_1 = require("node:crypto");
const os = require("os");
const content_template_repository_1 = require("../../../content/content-template.repository");
const mail_runtime_service_1 = require("../../../runtime/mail/mail-runtime.service");
const player_persistence_service_1 = require("../../../persistence/player-persistence.service");
const map_template_repository_1 = require("../../../runtime/map/map-template.repository");
const player_progression_service_1 = require("../../../runtime/player/player-progression.service");
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
const suggestion_runtime_service_1 = require("../../../runtime/suggestion/suggestion-runtime.service");
const world_runtime_service_1 = require("../../../runtime/world/world-runtime.service");
const legacy_auth_http_service_1 = require("./legacy-auth-http.service");
const legacy_gm_compat_constants_1 = require("../legacy-gm-compat.constants");
const legacy_gm_compat_service_1 = require("../legacy-gm-compat.service");
const REDEEM_CODE_LENGTH = 36;
const REDEEM_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_BATCH_REDEEM_CODES = 50;
const MAX_GROUP_CREATE_COUNT = 500;
let LegacyGmHttpCompatService = class LegacyGmHttpCompatService {
    contentTemplateRepository;
    legacyAuthHttpService;
    legacyGmCompatService;
    mailRuntimeService;
    mapTemplateRepository;
    playerPersistenceService;
    playerProgressionService;
    playerRuntimeService;
    suggestionRuntimeService;
    worldRuntimeService;
    networkPerfStartedAt = Date.now();
    cpuPerfStartedAt = Date.now();
    pathfindingPerfStartedAt = Date.now();
    worldObserverIds = new Set();
    gmMapTickSpeedByMapId = new Map();
    gmMapPausedByMapId = new Map();
    gmMapTimeConfigByMapId = new Map();
    redeemCodeSchemaReady = false;
    redeemCodeSchemaReadyPromise = null;
    constructor(contentTemplateRepository, legacyAuthHttpService, legacyGmCompatService, mailRuntimeService, mapTemplateRepository, playerPersistenceService, playerProgressionService, playerRuntimeService, suggestionRuntimeService, worldRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.legacyAuthHttpService = legacyAuthHttpService;
        this.legacyGmCompatService = legacyGmCompatService;
        this.mailRuntimeService = mailRuntimeService;
        this.mapTemplateRepository = mapTemplateRepository;
        this.playerPersistenceService = playerPersistenceService;
        this.playerProgressionService = playerProgressionService;
        this.playerRuntimeService = playerRuntimeService;
        this.suggestionRuntimeService = suggestionRuntimeService;
        this.worldRuntimeService = worldRuntimeService;
    }
    async getState() {
        const perf = this.buildPerformanceSnapshot();
        const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots();
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
        const accountIndex = await this.legacyAuthHttpService.getManagedAccountIndex([
            ...runtimePlayers.map((entry) => entry.playerId),
            ...persistedEntries.map((entry) => entry.playerId),
        ]);
        const players = runtimePlayers
            .map((snapshot) => this.toManagedPlayerSummary(snapshot, accountIndex.get(snapshot.playerId)))
            .sort(compareManagedPlayerSummary);
        const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));
        for (const entry of persistedEntries) {
            if (runtimePlayerIds.has(entry.playerId)) {
                continue;
            }
            players.push(this.toManagedPlayerSummaryFromPersistence(entry.playerId, entry.snapshot, entry.updatedAt, accountIndex.get(entry.playerId)));
        }
        players.sort(compareManagedPlayerSummary);
        return {
            players,
            mapIds: this.mapTemplateRepository.listSummaries().map((entry) => entry.id).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
            botCount: players.reduce((count, snapshot) => count + (snapshot.meta.isBot ? 1 : 0), 0),
            perf,
        };
    }
    getEditorCatalog() {
        return {
            items: this.contentTemplateRepository.listItemTemplates(),
            techniques: this.contentTemplateRepository.listTechniqueTemplates(),
            realmLevels: this.playerProgressionService.listRealmLevels(),
            buffs: this.buildEditorBuffCatalog(),
        };
    }
    buildEditorBuffCatalog() {
        const catalog = new Map();
        const register = (input) => {
            const buffId = typeof input?.buffId === 'string' ? input.buffId.trim() : '';
            if (!buffId || catalog.has(buffId)) {
                return;
            }
            const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : buffId;
            const duration = Number.isFinite(input?.duration) ? Math.max(1, Math.trunc(Number(input.duration))) : 1;
            const maxStacks = Number.isFinite(input?.maxStacks) ? Math.max(1, Math.trunc(Number(input.maxStacks))) : 1;
            const shortMark = typeof input?.shortMark === 'string' && input.shortMark.trim()
                ? input.shortMark.trim().slice(0, 1)
                : (name[0] ?? buffId[0] ?? '益');
            catalog.set(buffId, {
                buffId,
                name,
                desc: typeof input?.desc === 'string' ? input.desc : '',
                shortMark,
                category: input?.category === 'debuff' ? 'debuff' : 'buff',
                visibility: typeof input?.visibility === 'string' && input.visibility ? input.visibility : 'public',
                remainingTicks: duration,
                duration,
                stacks: 1,
                maxStacks,
                sourceSkillId: typeof input?.sourceSkillId === 'string' && input.sourceSkillId.trim() ? input.sourceSkillId.trim() : 'gm:editor',
                sourceSkillName: typeof input?.sourceSkillName === 'string' && input.sourceSkillName.trim() ? input.sourceSkillName.trim() : 'GM 编辑器',
                realmLv: Number.isFinite(input?.realmLv) ? Math.max(1, Math.trunc(Number(input.realmLv))) : 1,
                color: typeof input?.color === 'string' && input.color.trim() ? input.color.trim() : undefined,
                attrs: input?.attrs && typeof input.attrs === 'object' ? { ...input.attrs } : undefined,
                attrMode: input?.attrMode,
                stats: input?.stats && typeof input.stats === 'object' ? { ...input.stats } : undefined,
                statMode: input?.statMode,
                qiProjection: Array.isArray(input?.qiProjection) ? input.qiProjection.map((entry) => ({ ...entry })) : undefined,
            });
        };
        for (const technique of this.contentTemplateRepository.listTechniqueTemplates()) {
            for (const skill of technique.skills ?? []) {
                for (const effect of skill.effects ?? []) {
                    if (effect?.type !== 'buff') {
                        continue;
                    }
                    register({
                        ...effect,
                        sourceSkillId: skill.id,
                        sourceSkillName: skill.name,
                        realmLv: technique.realmLv,
                        category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
                    });
                }
            }
        }
        for (const item of this.contentTemplateRepository.listItemTemplates()) {
            for (const buff of item.consumeBuffs ?? []) {
                register({
                    ...buff,
                    sourceSkillId: `item:${item.itemId}`,
                    sourceSkillName: item.name,
                    category: buff.category ?? 'buff',
                });
            }
            for (const effect of item.effects ?? []) {
                if (effect?.type !== 'timed_buff' || !effect.buff) {
                    continue;
                }
                register({
                    ...effect.buff,
                    sourceSkillId: `equip:${item.itemId}:${effect.effectId ?? 'effect'}`,
                    sourceSkillName: item.name,
                    category: effect.buff.category ?? 'buff',
                });
            }
        }
        return Array.from(catalog.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN') || left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
    }
    async getPlayerDetail(playerId) {
        const account = (await this.legacyAuthHttpService.getManagedAccountIndex([playerId])).get(playerId);
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            return {
                player: this.toManagedPlayerRecord(runtime, this.playerRuntimeService.buildPersistenceSnapshot(playerId), account),
            };
        }
        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            return null;
        }
        return {
            player: this.toManagedPlayerRecordFromPersistence(playerId, persisted, account),
        };
    }
    async listRedeemCodeGroups() {
        const pool = await this.ensureRedeemCodePool();
        const result = await pool.query(`
      SELECT
        g.id,
        g.name,
        g.rewards,
        g."createdAt",
        g."updatedAt",
        COUNT(c.id)::int AS "totalCodeCount",
        COUNT(*) FILTER (WHERE c.status = 'used')::int AS "usedCodeCount",
        COUNT(*) FILTER (WHERE c.status = 'active')::int AS "activeCodeCount"
      FROM redeem_code_groups g
      LEFT JOIN redeem_codes c ON c."groupId" = g.id
      GROUP BY g.id, g.name, g.rewards, g."createdAt", g."updatedAt"
      ORDER BY g."updatedAt" DESC, g."createdAt" DESC
    `);
        return {
            groups: result.rows.map((row) => this.toRedeemCodeGroupView(row)),
        };
    }
    async getRedeemCodeGroupDetail(groupId) {
        const pool = await this.ensureRedeemCodePool();
        const group = await this.requireRedeemCodeGroup(pool, groupId);
        const codesResult = await pool.query(`
      SELECT
        id,
        "groupId",
        code,
        status,
        "usedByPlayerId",
        "usedByRoleName",
        "usedAt",
        "destroyedAt",
        "createdAt",
        "updatedAt"
      FROM redeem_codes
      WHERE "groupId" = $1
      ORDER BY "createdAt" DESC, code ASC
    `, [groupId]);
        return {
            group: this.toRedeemCodeGroupView(group, codesResult.rows),
            codes: codesResult.rows.map((row) => this.toRedeemCodeView(row)),
        };
    }
    async createRedeemCodeGroup(body) {
        const pool = await this.ensureRedeemCodePool();
        const name = normalizeRedeemGroupName(body?.name ?? '');
        const rewards = this.normalizeRedeemRewards(body?.rewards ?? []);
        const count = normalizeRedeemCreateCount(body?.count);
        const conflict = await pool.query('SELECT 1 FROM redeem_code_groups WHERE name = $1 LIMIT 1', [name]);
        if (conflict.rowCount > 0) {
            throw new common_1.BadRequestException('兑换码分组名称已存在');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const groupId = (0, node_crypto_1.randomUUID)();
            const insertResult = await client.query(`
        INSERT INTO redeem_code_groups(id, name, rewards, "createdAt", "updatedAt")
        VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        RETURNING id, name, rewards, "createdAt", "updatedAt"
      `, [groupId, name, JSON.stringify(rewards)]);
            const createdCodes = await this.createRedeemCodes(client, groupId, count);
            await client.query('COMMIT');
            return {
                group: this.toRedeemCodeGroupView(insertResult.rows[0], createdCodes),
                codes: createdCodes.map((entry) => String(entry.code ?? '')),
            };
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async updateRedeemCodeGroup(groupId, body) {
        const pool = await this.ensureRedeemCodePool();
        const name = normalizeRedeemGroupName(body?.name ?? '');
        const rewards = this.normalizeRedeemRewards(body?.rewards ?? []);
        await this.requireRedeemCodeGroup(pool, groupId);
        const conflict = await pool.query('SELECT id FROM redeem_code_groups WHERE name = $1 LIMIT 1', [name]);
        if (conflict.rowCount > 0 && conflict.rows[0]?.id !== groupId) {
            throw new common_1.BadRequestException('兑换码分组名称已存在');
        }
        await pool.query(`
      UPDATE redeem_code_groups
      SET name = $2,
          rewards = $3::jsonb,
          "updatedAt" = NOW()
      WHERE id = $1
    `, [groupId, name, JSON.stringify(rewards)]);
        return this.getRedeemCodeGroupDetail(groupId);
    }
    async appendRedeemCodes(groupId, countInput) {
        const pool = await this.ensureRedeemCodePool();
        const count = normalizeRedeemCreateCount(countInput);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const group = await this.requireRedeemCodeGroup(client, groupId);
            const createdCodes = await this.createRedeemCodes(client, groupId, count);
            await client.query('COMMIT');
            const detail = await this.getRedeemCodeGroupDetail(groupId);
            return {
                group: detail.group,
                codes: createdCodes.map((entry) => String(entry.code ?? '')),
            };
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async destroyRedeemCode(codeId) {
        const pool = await this.ensureRedeemCodePool();
        const existing = await pool.query('SELECT status, "groupId" FROM redeem_codes WHERE id = $1 LIMIT 1', [codeId]);
        if (existing.rowCount === 0) {
            throw new common_1.BadRequestException('目标兑换码不存在');
        }
        if (existing.rows[0]?.status === 'used') {
            throw new common_1.BadRequestException('已使用的兑换码不能销毁');
        }
        if (existing.rows[0]?.status === 'destroyed') {
            return { ok: true };
        }
        await pool.query(`
      UPDATE redeem_codes
      SET status = 'destroyed',
          "destroyedAt" = COALESCE("destroyedAt", NOW()),
          "updatedAt" = NOW()
      WHERE id = $1
    `, [codeId]);
        const groupId = typeof existing.rows[0]?.groupId === 'string' ? existing.rows[0].groupId : '';
        if (groupId) {
            await pool.query('UPDATE redeem_code_groups SET "updatedAt" = NOW() WHERE id = $1', [groupId]);
        }
        return { ok: true };
    }
    async redeemCodesForPlayer(playerId, codesInput) {
        const pool = await this.ensureRedeemCodePool();
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const codes = normalizeSubmittedRedeemCodes(codesInput);
        if (codes.length === 0) {
            throw new common_1.BadRequestException('请至少填写一个兑换码');
        }
        const rows = await pool.query(`
      SELECT
        c.id,
        c.code,
        c.status,
        c."groupId",
        g.name AS "groupName",
        g.rewards AS rewards
      FROM redeem_codes c
      LEFT JOIN redeem_code_groups g ON g.id = c."groupId"
      WHERE c.code = ANY($1::varchar[])
    `, [codes]);
        const rowByCode = new Map(rows.rows.map((row) => [String(row.code ?? ''), row]));
        const simulatedInventory = player.inventory.items.map((entry) => ({
            itemId: entry.itemId,
            count: Math.max(1, Math.trunc(entry.count)),
        }));
        const provisionalSuccessByCode = new Map();
        const provisionalSuccessById = new Map();
        const results = [];
        for (const code of codes) {
            const row = rowByCode.get(code);
            if (!row) {
                results.push({ code, ok: false, message: '兑换码不存在' });
                continue;
            }
            const groupName = readOptionalString(row.groupName) || undefined;
            if (row.status === 'used') {
                results.push({ code, ok: false, message: '兑换码已被使用', groupName });
                continue;
            }
            if (row.status === 'destroyed') {
                results.push({ code, ok: false, message: '兑换码已被销毁', groupName });
                continue;
            }
            let rewards;
            try {
                rewards = this.normalizeRedeemRewards(Array.isArray(row.rewards) ? row.rewards : []);
            }
            catch {
                results.push({ code, ok: false, message: '兑换码奖励配置无效', groupName });
                continue;
            }
            if (!canApplyRedeemRewardsToSimulation(simulatedInventory, player.inventory.capacity, rewards)) {
                results.push({
                    code,
                    ok: false,
                    message: '背包空间不足',
                    groupName,
                    rewards: cloneRedeemRewards(rewards),
                });
                continue;
            }
            const provisional = {
                id: String(row.id ?? ''),
                code,
                groupName,
                rewards: cloneRedeemRewards(rewards),
            };
            provisionalSuccessByCode.set(code, provisional);
            provisionalSuccessById.set(provisional.id, provisional);
            results.push({
                code,
                ok: true,
                message: '兑换成功',
                groupName,
                rewards: cloneRedeemRewards(rewards),
            });
        }
        const intendedIds = Array.from(provisionalSuccessById.keys());
        const confirmedIds = new Set();
        if (intendedIds.length > 0) {
            const updateResult = await pool.query(`
        UPDATE redeem_codes
        SET status = 'used',
            "usedByPlayerId" = $2,
            "usedByRoleName" = $3,
            "usedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'active'
        RETURNING id
      `, [intendedIds, player.playerId, player.name]);
            for (const row of updateResult.rows) {
                confirmedIds.add(String(row.id ?? ''));
            }
        }
        for (const result of results) {
            if (!result.ok) {
                continue;
            }
            const provisional = provisionalSuccessByCode.get(result.code);
            if (!provisional || !confirmedIds.has(provisional.id)) {
                result.ok = false;
                result.message = '兑换码已被使用';
                delete result.rewards;
                continue;
            }
            for (const reward of provisional.rewards) {
                this.playerRuntimeService.grantItem(playerId, reward.itemId, reward.count);
            }
            this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
                id: `redeem:${playerId}:${result.code}`,
                kind: 'grudge',
                text: `兑换成功：${provisional.groupName ?? result.code}`,
                from: '司命台',
                at: Date.now(),
            });
        }
        return { results };
    }
    async updateManagedPlayerPassword(playerId, newPassword) {
        await this.legacyAuthHttpService.updateManagedPlayerPassword(playerId, newPassword);
    }
    async updateManagedPlayerAccount(playerId, username) {
        const result = await this.legacyAuthHttpService.updateManagedPlayerAccount(playerId, username);
        if (result?.displayNameChanged === true && typeof result.nextDisplayName === 'string' && result.nextDisplayName) {
            const runtime = this.playerRuntimeService.snapshot(playerId);
            if (runtime) {
                runtime.displayName = result.nextDisplayName;
                runtime.selfRevision += 1;
                runtime.persistentRevision += 1;
                this.playerRuntimeService.restoreSnapshot(runtime);
            }
        }
        return result;
    }
    async updatePlayer(playerId, body) {
        const section = body?.section ?? null;
        const snapshot = body?.snapshot ?? {};
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            if (section === 'position') {
                const current = this.toLegacyPlayerState(runtime);
                this.worldRuntimeService.enqueueLegacyGmUpdatePlayer({
                    playerId,
                    mapId: typeof snapshot.mapId === 'string' ? snapshot.mapId : current.mapId,
                    x: Number.isFinite(snapshot.x) ? snapshot.x : current.x,
                    y: Number.isFinite(snapshot.y) ? snapshot.y : current.y,
                    hp: Number.isFinite(snapshot.hp) ? snapshot.hp : current.hp,
                    autoBattle: typeof snapshot.autoBattle === 'boolean' ? snapshot.autoBattle : current.autoBattle,
                });
                return;
            }
            const next = runtime;
            this.applyLegacySnapshotMutation(next, snapshot, section);
            this.repairRuntimeSnapshot(next);
            next.selfRevision += 1;
            next.persistentRevision += 1;
            this.playerRuntimeService.restoreSnapshot(next);
            return;
        }
        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        if (section === 'position') {
            this.applyPositionToPersistenceSnapshot(persisted, snapshot);
        }
        else {
            this.applyLegacySnapshotMutationToPersistence(persisted, snapshot, section);
        }
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    }
    resetPlayer(playerId) {
        this.worldRuntimeService.enqueueLegacyGmResetPlayer(playerId);
    }
    async resetPersistedPlayer(playerId) {
        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        const template = this.mapTemplateRepository.getOrThrow('yunlai_town');
        persisted.placement.templateId = template.id;
        persisted.placement.x = template.spawnX;
        persisted.placement.y = template.spawnY;
        persisted.placement.facing = shared_1.Direction.South;
        persisted.vitals.hp = persisted.vitals.maxHp;
        persisted.vitals.qi = persisted.vitals.maxQi;
        persisted.buffs.buffs = [];
        persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
        persisted.combat.autoBattle = false;
        persisted.combat.combatTargetId = null;
        persisted.combat.combatTargetLocked = false;
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    }
    async resetHeavenGate(playerId) {
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (runtime) {
            runtime.heavenGate = null;
            runtime.spiritualRoots = null;
            if (runtime.realm) {
                runtime.realm.heavenGate = undefined;
            }
            this.repairRuntimeSnapshot(runtime);
            runtime.selfRevision += 1;
            runtime.persistentRevision += 1;
            this.playerRuntimeService.restoreSnapshot(runtime);
            return;
        }
        const persisted = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (!persisted) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        persisted.progression.heavenGate = null;
        persisted.progression.spiritualRoots = null;
        await this.playerPersistenceService.savePlayerSnapshot(playerId, persisted);
    }
    spawnBots(anchorPlayerId, count) {
        this.worldRuntimeService.enqueueLegacyGmSpawnBots(anchorPlayerId, count);
    }
    removeBots(playerIds, all) {
        this.worldRuntimeService.enqueueLegacyGmRemoveBots(playerIds, all);
    }
    async returnAllPlayersToDefaultSpawn() {
        const template = this.mapTemplateRepository.getOrThrow('yunlai_town');
        const runtimePlayers = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => !(0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId));
        const runtimePlayerIds = new Set(runtimePlayers.map((entry) => entry.playerId));
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
        for (const runtime of runtimePlayers) {
            this.worldRuntimeService.enqueueLegacyGmResetPlayer(runtime.playerId);
        }
        let updatedOfflinePlayers = 0;
        for (const entry of persistedEntries) {
            if (runtimePlayerIds.has(entry.playerId)) {
                continue;
            }
            entry.snapshot.placement.templateId = template.id;
            entry.snapshot.placement.x = template.spawnX;
            entry.snapshot.placement.y = template.spawnY;
            entry.snapshot.placement.facing = shared_1.Direction.South;
            entry.snapshot.vitals.hp = entry.snapshot.vitals.maxHp;
            entry.snapshot.vitals.qi = entry.snapshot.vitals.maxQi;
            entry.snapshot.buffs.buffs = [];
            entry.snapshot.buffs.revision = Math.max(1, (entry.snapshot.buffs.revision ?? 1) + 1);
            entry.snapshot.combat.autoBattle = false;
            entry.snapshot.combat.combatTargetId = null;
            entry.snapshot.combat.combatTargetLocked = false;
            await this.playerPersistenceService.savePlayerSnapshot(entry.playerId, entry.snapshot);
            updatedOfflinePlayers += 1;
        }
        return {
            ok: true,
            totalPlayers: runtimePlayers.length + updatedOfflinePlayers,
            queuedRuntimePlayers: runtimePlayers.length,
            updatedOfflinePlayers,
            targetMapId: template.id,
            targetX: template.spawnX,
            targetY: template.spawnY,
        };
    }
    resetNetworkPerf() {
        this.networkPerfStartedAt = Date.now();
    }
    resetCpuPerf() {
        this.cpuPerfStartedAt = Date.now();
    }
    resetPathfindingPerf() {
        this.pathfindingPerfStartedAt = Date.now();
    }
    async createDirectMail(playerId, input) {
        return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
    }
    async createBroadcastMail(input) {
        const runtimePlayerIds = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => !(0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId))
            .map((entry) => entry.playerId);
        const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
        const deliveredPlayerIds = new Set(runtimePlayerIds);
        const deliveredMailIds = [];
        const batchId = `broadcast:${Date.now().toString(36)}`;
        for (const playerId of runtimePlayerIds) {
            deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
        }
        for (const entry of persistedEntries) {
            if ((0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
                continue;
            }
            deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(entry.playerId, input ?? {}));
            deliveredPlayerIds.add(entry.playerId);
        }
        return {
            mailId: deliveredMailIds[0] ?? batchId,
            batchId,
            recipientCount: deliveredMailIds.length,
        };
    }
    getSuggestions(query) {
        const page = Math.max(1, Math.trunc(Number(query?.page) || 1));
        const pageSize = clamp(Math.trunc(Number(query?.pageSize) || 10), 1, 50);
        const keyword = typeof query?.keyword === 'string' ? query.keyword.trim() : '';
        const normalizedKeyword = keyword.toLowerCase();
        const filtered = this.suggestionRuntimeService.getAll().filter((entry) => {
            if (!normalizedKeyword) {
                return true;
            }
            return entry.title.toLowerCase().includes(normalizedKeyword)
                || entry.description.toLowerCase().includes(normalizedKeyword)
                || entry.authorName.toLowerCase().includes(normalizedKeyword)
                || entry.replies.some((reply) => reply.content.toLowerCase().includes(normalizedKeyword));
        });
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = clamp(page, 1, totalPages);
        const start = (safePage - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize);
        return {
            items,
            total,
            page: safePage,
            pageSize,
            totalPages,
            keyword,
        };
    }
    async completeSuggestion(id) {
        const updated = await this.suggestionRuntimeService.markCompleted(id);
        if (!updated) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    async replySuggestion(id, body) {
        const updated = await this.suggestionRuntimeService.addReply(id, 'gm', 'gm', '开发者', body?.content ?? '');
        if (!updated) {
            throw new common_1.BadRequestException('回复失败');
        }
        return { ok: true };
    }
    async removeSuggestion(id) {
        const removed = await this.suggestionRuntimeService.remove(id);
        if (!removed) {
            throw new common_1.BadRequestException('目标建议不存在');
        }
        return { ok: true };
    }
    getMaps() {
        return {
            maps: this.mapTemplateRepository.list().map((template) => ({
                id: template.id,
                name: template.name,
                width: template.width,
                height: template.height,
                description: template.source.description,
                dangerLevel: template.source.dangerLevel,
                recommendedRealm: template.source.recommendedRealm,
                portalCount: template.portals.length,
                npcCount: template.npcs.length,
                monsterSpawnCount: template.source.monsterSpawns?.length ?? 0,
            })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN')),
        };
    }
    getMapRuntime(mapId, x, y, w, h, viewerId) {
        const template = this.mapTemplateRepository.getOrThrow(mapId);
        const clampedW = Math.min(20, Math.max(1, Math.trunc(Number(w) || 20)));
        const clampedH = Math.min(20, Math.max(1, Math.trunc(Number(h) || 20)));
        const startX = clamp(Math.trunc(Number(x) || 0), 0, Math.max(0, template.width - 1));
        const startY = clamp(Math.trunc(Number(y) || 0), 0, Math.max(0, template.height - 1));
        const endX = Math.min(template.width, startX + clampedW);
        const endY = Math.min(template.height, startY + clampedH);
        const instanceId = `public:${mapId}`;
        const runtimeInstance = this.worldRuntimeService.getInstance(instanceId);
        const internalInstance = this.worldRuntimeService.instances?.get(instanceId) ?? null;
        if (typeof viewerId === 'string' && viewerId.trim()) {
            this.worldObserverIds.add(viewerId.trim());
        }
        const tiles = [];
        for (let row = startY; row < endY; row += 1) {
            const line = [];
            const terrainRow = template.source.tiles[row] ?? '';
            for (let column = startX; column < endX; column += 1) {
                const aura = internalInstance?.getTileAura(column, row) ?? template.baseAuraByTile[(0, map_template_repository_1.getTileIndex)(column, row, template.width)] ?? 0;
                const tile = this.legacyGmCompatService.projectLegacyRuntimeTile({
                    mapChar: terrainRow[column] ?? '#',
                    aura,
                });
                line.push({
                    type: tile.type,
                    walkable: tile.walkable,
                    aura: tile.aura,
                });
            }
            tiles.push(line);
        }
        const entities = [];
        if (runtimeInstance) {
            for (const entry of runtimeInstance.players) {
                if (!isInRect(entry.x, entry.y, startX, startY, endX, endY)) {
                    continue;
                }
                const player = this.playerRuntimeService.getPlayer(entry.playerId);
                entities.push({
                    id: entry.playerId,
                    x: entry.x,
                    y: entry.y,
                    char: player?.displayName?.[0] ?? player?.name?.[0] ?? '人',
                    color: typeof player?.sessionId === 'string' && player.sessionId.length > 0 ? '#4caf50' : '#888',
                    name: player?.name ?? entry.playerId,
                    kind: 'player',
                    hp: player?.hp,
                    maxHp: player?.maxHp,
                    dead: (player?.hp ?? 1) <= 0,
                    online: typeof player?.sessionId === 'string' && player.sessionId.length > 0,
                    autoBattle: player?.combat.autoBattle === true,
                    isBot: (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(entry.playerId),
                });
            }
        }
        if (internalInstance) {
            for (const monster of internalInstance.listMonsters()) {
                if (!isInRect(monster.x, monster.y, startX, startY, endX, endY)) {
                    continue;
                }
                entities.push({
                    id: monster.runtimeId,
                    x: monster.x,
                    y: monster.y,
                    char: monster.char,
                    color: monster.color,
                    name: monster.name,
                    kind: 'monster',
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    dead: monster.alive !== true,
                    alive: monster.alive === true,
                    targetPlayerId: monster.aggroTargetPlayerId ?? undefined,
                    respawnLeft: monster.respawnLeft,
                });
            }
        }
        for (const npc of template.npcs) {
            if (!isInRect(npc.x, npc.y, startX, startY, endX, endY)) {
                continue;
            }
            entities.push({
                id: npc.id,
                x: npc.x,
                y: npc.y,
                char: npc.char,
                color: npc.color,
                name: npc.name,
                kind: 'npc',
            });
        }
        for (const container of template.containers) {
            if (!isInRect(container.x, container.y, startX, startY, endX, endY)) {
                continue;
            }
            entities.push({
                id: container.id,
                x: container.x,
                y: container.y,
                char: container.char,
                color: container.color,
                name: container.name,
                kind: 'container',
            });
        }
        const tickSpeed = this.getMapTickSpeed(mapId);
        const tickPaused = this.isMapPaused(mapId);
        return {
            mapId,
            mapName: template.name,
            width: template.width,
            height: template.height,
            tiles,
            entities,
            time: buildLegacyTimeState(template, runtimeInstance?.tick ?? this.worldRuntimeService.getRuntimeSummary().tick, shared_1.VIEW_RADIUS, this.getMapTimeConfig(mapId), tickSpeed),
            timeConfig: this.getMapTimeConfig(mapId),
            tickSpeed,
            tickPaused,
        };
    }
    updateMapTick(mapId, body) {
        this.mapTemplateRepository.getOrThrow(mapId);
        if (body?.paused === true || body?.speed === 0) {
            this.gmMapPausedByMapId.set(mapId, true);
            this.gmMapTickSpeedByMapId.set(mapId, 0);
            return;
        }
        if (body?.paused === false) {
            this.gmMapPausedByMapId.set(mapId, false);
        }
        if (Number.isFinite(body?.speed)) {
            const speed = clamp(Number(body.speed), 0, 100);
            this.gmMapTickSpeedByMapId.set(mapId, speed);
            this.gmMapPausedByMapId.set(mapId, speed === 0);
        }
    }
    updateMapTime(mapId, body) {
        const template = this.mapTemplateRepository.getOrThrow(mapId);
        const current = this.getMapTimeConfig(mapId);
        const next = {
            ...current,
        };
        if (Number.isFinite(body?.scale)) {
            next.scale = Math.max(0, Number(body.scale));
        }
        if (Number.isFinite(body?.offsetTicks)) {
            next.offsetTicks = Math.trunc(Number(body.offsetTicks));
        }
        this.gmMapTimeConfigByMapId.set(mapId, {
            ...template.source.time,
            ...next,
        });
    }
    reloadTickConfig() {
        this.contentTemplateRepository.loadAll();
        this.mapTemplateRepository.loadAll();
        const validMapIds = new Set(this.mapTemplateRepository.listSummaries().map((entry) => entry.id));
        for (const mapId of Array.from(this.gmMapTickSpeedByMapId.keys())) {
            if (!validMapIds.has(mapId)) {
                this.gmMapTickSpeedByMapId.delete(mapId);
                this.gmMapPausedByMapId.delete(mapId);
                this.gmMapTimeConfigByMapId.delete(mapId);
            }
        }
        return { ok: true };
    }
    clearWorldObservation(viewerId) {
        const normalized = typeof viewerId === 'string' ? viewerId.trim() : '';
        if (!normalized) {
            return;
        }
        this.worldObserverIds.delete(normalized);
    }
    buildPerformanceSnapshot() {
        const perf = this.legacyGmCompatService.buildPerformanceSnapshot();
        const now = Date.now();
        const sharedGmStatePerf = this.legacyGmCompatService.buildSharedGmStatePerf();
        return {
            ...perf,
            cpu: {
                ...perf.cpu,
                profileStartedAt: this.cpuPerfStartedAt,
                profileElapsedSec: roundMetric(Math.max(0, (now - this.cpuPerfStartedAt) / 1000)),
            },
            pathfinding: {
                ...perf.pathfinding,
                ...sharedGmStatePerf,
                statsStartedAt: this.pathfindingPerfStartedAt,
                statsElapsedSec: roundMetric(Math.max(0, (now - this.pathfindingPerfStartedAt) / 1000)),
            },
            networkStatsStartedAt: this.networkPerfStartedAt,
            networkStatsElapsedSec: roundMetric(Math.max(0, (now - this.networkPerfStartedAt) / 1000)),
        };
    }
    getMapTickSpeed(mapId) {
        if (this.gmMapPausedByMapId.get(mapId) === true) {
            return 0;
        }
        const speed = this.gmMapTickSpeedByMapId.get(mapId);
        return Number.isFinite(speed) ? speed : 1;
    }
    isMapPaused(mapId) {
        return this.gmMapPausedByMapId.get(mapId) === true || this.getMapTickSpeed(mapId) === 0;
    }
    getMapTimeConfig(mapId) {
        const template = this.mapTemplateRepository.getOrThrow(mapId);
        return {
            ...(template.source.time ?? {}),
            ...(this.gmMapTimeConfigByMapId.get(mapId) ?? {}),
        };
    }
    applyLegacySnapshotMutation(next, snapshot, section) {
        if (section === null || section === 'basic') {
            if (typeof snapshot.name === 'string' && snapshot.name.trim()) {
                next.name = snapshot.name.trim();
            }
            if (typeof snapshot.displayName === 'string' && snapshot.displayName.trim()) {
                next.displayName = snapshot.displayName.trim();
            }
            if (Number.isFinite(snapshot.maxHp)) {
                next.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
            }
            if (Number.isFinite(snapshot.maxQi)) {
                next.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
            }
            if (Number.isFinite(snapshot.hp)) {
                next.hp = clamp(Math.trunc(snapshot.hp), 0, next.maxHp);
            }
            if (Number.isFinite(snapshot.qi)) {
                next.qi = clamp(Math.trunc(snapshot.qi), 0, next.maxQi);
            }
            if (typeof snapshot.dead === 'boolean') {
                next.hp = snapshot.dead ? 0 : Math.max(1, next.hp);
            }
            if (typeof snapshot.autoBattle === 'boolean') {
                next.combat.autoBattle = snapshot.autoBattle;
            }
            if (typeof snapshot.autoRetaliate === 'boolean') {
                next.combat.autoRetaliate = snapshot.autoRetaliate;
            }
            if (typeof snapshot.autoBattleStationary === 'boolean') {
                next.combat.autoBattleStationary = snapshot.autoBattleStationary;
            }
            if (typeof snapshot.allowAoePlayerHit === 'boolean') {
                next.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
            }
            if (typeof snapshot.autoIdleCultivation === 'boolean') {
                next.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
            }
            if (typeof snapshot.autoSwitchCultivation === 'boolean') {
                next.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
            }
            if (typeof snapshot.senseQiActive === 'boolean') {
                next.combat.senseQiActive = snapshot.senseQiActive;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                next.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),
                    enabled: entry.enabled !== false,
                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
            if (Array.isArray(snapshot.temporaryBuffs)) {
                next.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
                next.buffs.revision += 1;
            }
        }
        if (section === 'realm') {
            if (snapshot.baseAttrs && typeof snapshot.baseAttrs === 'object') {
                next.attrs.baseAttrs = { ...shared_1.DEFAULT_BASE_ATTRS, ...snapshot.baseAttrs };
            }
            if (Number.isFinite(snapshot.foundation)) {
                next.foundation = Math.max(0, Math.trunc(snapshot.foundation));
            }
            if (Number.isFinite(snapshot.combatExp)) {
                next.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
            }
            const realmLv = Number.isFinite(snapshot.realmLv)
                ? Math.trunc(snapshot.realmLv)
                : next.realm?.realmLv ?? 1;
            const progress = Number.isFinite(snapshot.realm?.progress)
                ? Math.trunc(snapshot.realm.progress)
                : next.realm?.progress ?? 0;
            next.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
        }
        if (section === 'techniques') {
            if (Array.isArray(snapshot.techniques)) {
                next.techniques.techniques = snapshot.techniques
                    .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
                    .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
                    .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
                next.techniques.revision += 1;
            }
            if (snapshot.cultivatingTechId === undefined || snapshot.cultivatingTechId === null || typeof snapshot.cultivatingTechId === 'string') {
                next.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                next.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),
                    enabled: entry.enabled !== false,
                    skillEnabled: entry.skillEnabled !== false,
                    autoBattleOrder: Number.isFinite(entry.autoBattleOrder) ? Math.max(0, Math.trunc(entry.autoBattleOrder)) : undefined,
                }));
            }
        }
        if (section === 'items') {
            if (snapshot.inventory && typeof snapshot.inventory === 'object') {
                if (Number.isFinite(snapshot.inventory.capacity)) {
                    next.inventory.capacity = Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
                }
                if (Array.isArray(snapshot.inventory.items)) {
                    next.inventory.items = snapshot.inventory.items
                        .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
                        .map((entry) => this.contentTemplateRepository.normalizeItem({
                        ...entry,
                        itemId: entry.itemId.trim(),
                        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
                    }));
                    next.inventory.revision += 1;
                }
            }
            if (snapshot.equipment && typeof snapshot.equipment === 'object') {
                const bySlot = new Map(next.equipment.slots.map((entry) => [entry.slot, entry]));
                for (const slot of shared_1.EQUIP_SLOTS) {
                    if (!(slot in snapshot.equipment)) {
                        continue;
                    }
                    const record = bySlot.get(slot);
                    if (!record) {
                        continue;
                    }
                    const item = snapshot.equipment[slot];
                    record.item = item && typeof item.itemId === 'string' && item.itemId.trim()
                        ? this.contentTemplateRepository.normalizeItem({
                            ...item,
                            itemId: item.itemId.trim(),
                            count: 1,
                        })
                        : null;
                }
                next.equipment.revision += 1;
            }
        }
        if (section === 'quests' && Array.isArray(snapshot.quests)) {
            next.quests.quests = snapshot.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            }));
            next.quests.revision += 1;
        }
    }
    applyPositionToPersistenceSnapshot(persisted, snapshot) {
        if (typeof snapshot.mapId === 'string' && snapshot.mapId.trim()) {
            this.mapTemplateRepository.getOrThrow(snapshot.mapId.trim());
            persisted.placement.templateId = snapshot.mapId.trim();
        }
        const template = this.mapTemplateRepository.getOrThrow(persisted.placement.templateId);
        if (Number.isFinite(snapshot.x)) {
            persisted.placement.x = clamp(Math.trunc(snapshot.x), 0, Math.max(0, template.width - 1));
        }
        if (Number.isFinite(snapshot.y)) {
            persisted.placement.y = clamp(Math.trunc(snapshot.y), 0, Math.max(0, template.height - 1));
        }
        if (Number.isFinite(snapshot.facing)) {
            persisted.placement.facing = Math.trunc(snapshot.facing);
        }
        if (Number.isFinite(snapshot.hp)) {
            persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
        }
        if (typeof snapshot.autoBattle === 'boolean') {
            persisted.combat.autoBattle = snapshot.autoBattle;
        }
    }
    applyLegacySnapshotMutationToPersistence(persisted, snapshot, section) {
        if (section === null || section === 'basic') {
            if (Number.isFinite(snapshot.maxHp)) {
                persisted.vitals.maxHp = Math.max(1, Math.trunc(snapshot.maxHp));
                if (persisted.vitals.hp > persisted.vitals.maxHp) {
                    persisted.vitals.hp = persisted.vitals.maxHp;
                }
            }
            if (Number.isFinite(snapshot.maxQi)) {
                persisted.vitals.maxQi = Math.max(0, Math.trunc(snapshot.maxQi));
                if (persisted.vitals.qi > persisted.vitals.maxQi) {
                    persisted.vitals.qi = persisted.vitals.maxQi;
                }
            }
            if (Number.isFinite(snapshot.hp)) {
                persisted.vitals.hp = clamp(Math.trunc(snapshot.hp), 0, persisted.vitals.maxHp);
            }
            if (Number.isFinite(snapshot.qi)) {
                persisted.vitals.qi = clamp(Math.trunc(snapshot.qi), 0, persisted.vitals.maxQi);
            }
            if (typeof snapshot.dead === 'boolean') {
                persisted.vitals.hp = snapshot.dead ? 0 : Math.max(1, persisted.vitals.hp);
            }
            if (typeof snapshot.autoBattle === 'boolean') {
                persisted.combat.autoBattle = snapshot.autoBattle;
            }
            if (typeof snapshot.autoRetaliate === 'boolean') {
                persisted.combat.autoRetaliate = snapshot.autoRetaliate;
            }
            if (typeof snapshot.autoBattleStationary === 'boolean') {
                persisted.combat.autoBattleStationary = snapshot.autoBattleStationary;
            }
            if (typeof snapshot.allowAoePlayerHit === 'boolean') {
                persisted.combat.allowAoePlayerHit = snapshot.allowAoePlayerHit;
            }
            if (typeof snapshot.autoIdleCultivation === 'boolean') {
                persisted.combat.autoIdleCultivation = snapshot.autoIdleCultivation;
            }
            if (typeof snapshot.autoSwitchCultivation === 'boolean') {
                persisted.combat.autoSwitchCultivation = snapshot.autoSwitchCultivation;
            }
            if (typeof snapshot.senseQiActive === 'boolean') {
                persisted.combat.senseQiActive = snapshot.senseQiActive;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),
                    enabled: entry.enabled !== false,
                    skillEnabled: entry.skillEnabled !== false,
                }));
            }
            if (Array.isArray(snapshot.temporaryBuffs)) {
                persisted.buffs.buffs = snapshot.temporaryBuffs.map((entry) => cloneTemporaryBuff(entry));
                persisted.buffs.revision = Math.max(1, (persisted.buffs.revision ?? 1) + 1);
            }
        }
        if (section === 'realm') {
            if (Number.isFinite(snapshot.foundation)) {
                persisted.progression.foundation = Math.max(0, Math.trunc(snapshot.foundation));
            }
            if (Number.isFinite(snapshot.combatExp)) {
                persisted.progression.combatExp = Math.max(0, Math.trunc(snapshot.combatExp));
            }
            const realmLv = Number.isFinite(snapshot.realmLv)
                ? Math.trunc(snapshot.realmLv)
                : persisted.progression.realm?.realmLv ?? 1;
            const progress = Number.isFinite(snapshot.realm?.progress)
                ? Math.trunc(snapshot.realm.progress)
                : persisted.progression.realm?.progress ?? 0;
            persisted.progression.realm = this.playerProgressionService.createRealmStateFromLevel(realmLv, progress);
        }
        if (section === 'techniques') {
            if (Array.isArray(snapshot.techniques)) {
                persisted.techniques.techniques = snapshot.techniques
                    .filter((entry) => Boolean(entry && typeof entry.techId === 'string' && entry.techId.trim()))
                    .map((entry) => ({ ...entry, techId: entry.techId.trim() }))
                    .sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
                persisted.techniques.revision = Math.max(1, (persisted.techniques.revision ?? 1) + 1);
            }
            if (snapshot.cultivatingTechId === undefined || snapshot.cultivatingTechId === null || typeof snapshot.cultivatingTechId === 'string') {
                persisted.techniques.cultivatingTechId = snapshot.cultivatingTechId?.trim() || null;
            }
            if (Array.isArray(snapshot.autoBattleSkills)) {
                persisted.combat.autoBattleSkills = snapshot.autoBattleSkills
                    .filter((entry) => Boolean(entry && typeof entry.skillId === 'string' && entry.skillId.trim()))
                    .map((entry) => ({
                    skillId: entry.skillId.trim(),
                    enabled: entry.enabled !== false,
                    skillEnabled: entry.skillEnabled !== false,
                }));
            }
        }
        if (section === 'items') {
            if (snapshot.inventory && typeof snapshot.inventory === 'object') {
                if (Number.isFinite(snapshot.inventory.capacity)) {
                    persisted.inventory.capacity = Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, Math.trunc(snapshot.inventory.capacity));
                }
                if (Array.isArray(snapshot.inventory.items)) {
                    persisted.inventory.items = snapshot.inventory.items
                        .filter((entry) => Boolean(entry && typeof entry.itemId === 'string' && entry.itemId.trim()))
                        .map((entry) => ({
                        ...entry,
                        itemId: entry.itemId.trim(),
                        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(entry.count)) : 1,
                    }));
                    persisted.inventory.revision = Math.max(1, (persisted.inventory.revision ?? 1) + 1);
                }
            }
            if (snapshot.equipment && typeof snapshot.equipment === 'object') {
                const nextSlots = [];
                for (const slot of shared_1.EQUIP_SLOTS) {
                    const item = snapshot.equipment[slot];
                    nextSlots.push({
                        slot,
                        item: item && typeof item.itemId === 'string' && item.itemId.trim()
                            ? {
                                ...item,
                                itemId: item.itemId.trim(),
                                count: 1,
                            }
                            : null,
                    });
                }
                persisted.equipment.slots = nextSlots;
                persisted.equipment.revision = Math.max(1, (persisted.equipment.revision ?? 1) + 1);
            }
        }
        if (section === 'quests' && Array.isArray(snapshot.quests)) {
            persisted.quests.entries = snapshot.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            }));
            persisted.quests.revision = Math.max(1, (persisted.quests.revision ?? 1) + 1);
        }
    }
    repairRuntimeSnapshot(snapshot) {
        if (snapshot.maxHp < 1) {
            snapshot.maxHp = 1;
        }
        if (snapshot.maxQi < 0) {
            snapshot.maxQi = 0;
        }
        snapshot.hp = clamp(snapshot.hp, 0, snapshot.maxHp);
        snapshot.qi = clamp(snapshot.qi, 0, snapshot.maxQi);
        if (snapshot.realm) {
            snapshot.realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.realm.realmLv, snapshot.realm.progress);
        }
        this.playerProgressionService.initializePlayer(snapshot);
        this.playerRuntimeService.rebuildActionState(snapshot, 0);
    }
    toManagedPlayerSummary(snapshot, account = null) {
        const player = this.toLegacyPlayerState(snapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,
            autoBattleStationary: player.autoBattleStationary === true,
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
                isBot: player.isBot === true,
                online: player.online === true,
                inWorld: player.inWorld !== false,
                dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
            },
        };
    }
    toManagedPlayerSummaryFromPersistence(playerId, snapshot, updatedAt, account = null) {
        const player = this.toLegacyPlayerStateFromPersistence(playerId, snapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,
            autoBattleStationary: player.autoBattleStationary === true,
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : undefined,
                dirtyFlags: [],
            },
        };
    }
    toManagedPlayerRecord(snapshot, persistedSnapshot, account = null) {
        const summary = this.toManagedPlayerSummary(snapshot, account);
        return {
            ...summary,
            account: buildManagedAccountView(account, summary.meta.online === true),
            snapshot: this.toLegacyPlayerState(snapshot),
            persistedSnapshot: persistedSnapshot ?? null,
        };
    }
    toManagedPlayerRecordFromPersistence(playerId, persistedSnapshot, account = null) {
        const player = this.toLegacyPlayerStateFromPersistence(playerId, persistedSnapshot);
        return {
            id: player.id,
            name: player.name,
            roleName: player.name,
            displayName: player.displayName ?? player.name,
            accountName: account?.username,
            mapId: player.mapId,
            mapName: this.resolveMapName(player.mapId),
            realmLv: player.realmLv ?? 1,
            realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
            x: player.x,
            y: player.y,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            dead: player.dead,
            autoBattle: player.autoBattle,
            autoBattleStationary: player.autoBattleStationary === true,
            autoRetaliate: player.autoRetaliate !== false,
            meta: {
                userId: account?.userId,
                isBot: player.isBot === true,
                online: false,
                inWorld: false,
                dirtyFlags: [],
            },
            account: buildManagedAccountView(account, false),
            snapshot: player,
            persistedSnapshot,
        };
    }
    toLegacyPlayerState(snapshot) {
        return {
            id: snapshot.playerId,
            name: snapshot.name,
            displayName: snapshot.displayName,
            isBot: (0, legacy_gm_compat_constants_1.isLegacyGmCompatBotPlayerId)(snapshot.playerId),
            online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
            inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
            senseQiActive: snapshot.combat.senseQiActive === true,
            autoRetaliate: snapshot.combat.autoRetaliate !== false,
            autoBattleStationary: snapshot.combat.autoBattleStationary === true,
            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
            cultivationActive: snapshot.combat.cultivationActive === true,
            realmLv: snapshot.realm?.realmLv ?? 1,
            realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
            realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
            realmReview: snapshot.realm?.review,
            breakthroughReady: snapshot.realm?.breakthroughReady === true,
            heavenGate: snapshot.heavenGate,
            spiritualRoots: snapshot.spiritualRoots,
            boneAgeBaseYears: snapshot.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.lifeElapsedTicks,
            lifespanYears: snapshot.lifespanYears,
            mapId: snapshot.templateId,
            x: snapshot.x,
            y: snapshot.y,
            facing: snapshot.facing,
            viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
            hp: snapshot.hp,
            maxHp: snapshot.maxHp,
            qi: snapshot.qi,
            dead: snapshot.hp <= 0,
            foundation: snapshot.foundation,
            combatExp: snapshot.combatExp,
            baseAttrs: { ...snapshot.attrs.baseAttrs },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            finalAttrs: { ...snapshot.attrs.finalAttrs },
            numericStats: { ...snapshot.attrs.numericStats },
            ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: snapshot.inventory.items.map((entry) => ({ ...entry })),
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
            actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
            quests: snapshot.quests.quests.map((entry) => ({
                ...entry,
                rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
                rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
            })),
            autoBattle: snapshot.combat.autoBattle === true,
            autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,
            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm: snapshot.realm ? {
                ...snapshot.realm,
                heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
                breakthrough: snapshot.realm.breakthrough ? {
                    ...snapshot.realm.breakthrough,
                    requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                        ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                        : [],
                } : snapshot.realm.breakthrough,
            } : undefined,
        };
    }
    toLegacyPlayerStateFromPersistence(playerId, snapshot) {
        const realm = this.playerProgressionService.createRealmStateFromLevel(snapshot.progression?.realm?.realmLv ?? 1, snapshot.progression?.realm?.progress ?? 0);
        return {
            id: playerId,
            name: playerId,
            displayName: playerId,
            mapId: snapshot.placement.templateId,
            x: snapshot.placement.x,
            y: snapshot.placement.y,
            facing: snapshot.placement.facing,
            viewRange: shared_1.VIEW_RADIUS,
            hp: snapshot.vitals.hp,
            maxHp: snapshot.vitals.maxHp,
            qi: snapshot.vitals.qi,
            dead: snapshot.vitals.hp <= 0,
            autoBattle: snapshot.combat.autoBattle === true,
            autoRetaliate: snapshot.combat.autoRetaliate !== false,
            autoBattleStationary: snapshot.combat.autoBattleStationary === true,
            allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
            autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
            autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
            senseQiActive: snapshot.combat.senseQiActive === true,
            realmLv: realm.realmLv,
            realmName: realm.displayName,
            realmStage: realm.stage,
            realmReview: realm.review,
            breakthroughReady: realm.breakthroughReady,
            heavenGate: snapshot.progression.heavenGate ?? null,
            spiritualRoots: snapshot.progression.spiritualRoots ?? null,
            boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
            lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
            lifespanYears: snapshot.progression.lifespanYears,
            foundation: snapshot.progression.foundation,
            combatExp: snapshot.progression.combatExp,
            baseAttrs: { ...shared_1.DEFAULT_BASE_ATTRS },
            bonuses: [],
            temporaryBuffs: snapshot.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
            inventory: {
                capacity: snapshot.inventory.capacity,
                items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
            },
            equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
            techniques: Array.isArray(snapshot.techniques.techniques) ? snapshot.techniques.techniques.map((entry) => ({ ...entry })) : [],
            actions: [],
            quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
            autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills) ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })) : [],
            combatTargetId: snapshot.combat.combatTargetId ?? undefined,
            combatTargetLocked: snapshot.combat.combatTargetLocked === true,
            cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
            pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
                ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
                : [],
            realm,
        };
    }
    async ensureRedeemCodePool() {
        const pool = await this.legacyAuthHttpService.legacyAuthService.ensurePool();
        if (!pool) {
            throw new common_1.BadRequestException('当前未启用数据库持久化，兑换码功能不可用');
        }
        if (this.redeemCodeSchemaReady) {
            return pool;
        }
        if (!this.redeemCodeSchemaReadyPromise) {
            this.redeemCodeSchemaReadyPromise = (async () => {
                await pool.query(`
          CREATE TABLE IF NOT EXISTS redeem_code_groups (
            id uuid PRIMARY KEY,
            name varchar(120) NOT NULL UNIQUE,
            rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
            "createdAt" timestamptz NOT NULL DEFAULT NOW(),
            "updatedAt" timestamptz NOT NULL DEFAULT NOW()
          )
        `);
                await pool.query(`
          CREATE TABLE IF NOT EXISTS redeem_codes (
            id uuid PRIMARY KEY,
            "groupId" uuid NOT NULL REFERENCES redeem_code_groups(id) ON DELETE CASCADE,
            code varchar(36) NOT NULL UNIQUE,
            status varchar(16) NOT NULL DEFAULT 'active',
            "usedByPlayerId" varchar(100),
            "usedByRoleName" varchar(50),
            "usedAt" timestamptz,
            "destroyedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT NOW(),
            "updatedAt" timestamptz NOT NULL DEFAULT NOW()
          )
        `);
                await pool.query('CREATE INDEX IF NOT EXISTS idx_redeem_codes_group_id ON redeem_codes("groupId")');
                await pool.query('CREATE INDEX IF NOT EXISTS idx_redeem_codes_status ON redeem_codes(status)');
                this.redeemCodeSchemaReady = true;
            })().catch((error) => {
                this.redeemCodeSchemaReady = false;
                throw error;
            }).finally(() => {
                if (!this.redeemCodeSchemaReady) {
                    this.redeemCodeSchemaReadyPromise = null;
                }
            });
        }
        await this.redeemCodeSchemaReadyPromise;
        return pool;
    }
    normalizeRedeemRewards(rewards) {
        if (!Array.isArray(rewards) || rewards.length === 0) {
            throw new common_1.BadRequestException('兑换码分组至少需要一个奖励物品');
        }
        const normalized = [];
        for (const reward of rewards) {
            if (!reward || typeof reward.itemId !== 'string') {
                continue;
            }
            const itemId = reward.itemId.trim();
            const count = Math.max(1, Math.floor(Number(reward.count) || 0));
            if (!itemId || count <= 0) {
                continue;
            }
            if (!this.contentTemplateRepository.createItem(itemId, count)) {
                throw new common_1.BadRequestException(`奖励物品不存在：${itemId}`);
            }
            normalized.push({ itemId, count });
        }
        if (normalized.length === 0) {
            throw new common_1.BadRequestException('兑换码分组至少需要一个有效奖励物品');
        }
        return normalized;
    }
    async requireRedeemCodeGroup(pool, groupId) {
        const result = await pool.query(`
      SELECT id, name, rewards, "createdAt", "updatedAt"
      FROM redeem_code_groups
      WHERE id = $1
      LIMIT 1
    `, [groupId]);
        if (result.rowCount === 0) {
            throw new common_1.BadRequestException('兑换码分组不存在');
        }
        return result.rows[0];
    }
    async createRedeemCodes(client, groupId, count) {
        const created = [];
        const seenCodes = new Set();
        while (created.length < count) {
            const remaining = count - created.length;
            const batchSize = Math.min(remaining * 2, 128);
            const candidates = [];
            while (candidates.length < batchSize) {
                const code = generateRedeemCodeValue();
                if (seenCodes.has(code)) {
                    continue;
                }
                seenCodes.add(code);
                candidates.push(code);
            }
            const existing = await client.query('SELECT code FROM redeem_codes WHERE code = ANY($1::varchar[])', [candidates]);
            const existingSet = new Set(existing.rows.map((row) => String(row.code ?? '')));
            for (const code of candidates) {
                if (existingSet.has(code)) {
                    continue;
                }
                const id = (0, node_crypto_1.randomUUID)();
                const insertResult = await client.query(`
          INSERT INTO redeem_codes(
            id,
            "groupId",
            code,
            status,
            "usedByPlayerId",
            "usedByRoleName",
            "usedAt",
            "destroyedAt",
            "createdAt",
            "updatedAt"
          )
          VALUES ($1, $2, $3, 'active', NULL, NULL, NULL, NULL, NOW(), NOW())
          RETURNING id, "groupId", code, status, "usedByPlayerId", "usedByRoleName", "usedAt", "destroyedAt", "createdAt", "updatedAt"
        `, [id, groupId, code]);
                created.push(insertResult.rows[0]);
                if (created.length >= count) {
                    break;
                }
            }
        }
        return created;
    }
    toRedeemCodeGroupView(row, codes) {
        const codeList = Array.isArray(codes) ? codes : null;
        let totalCodeCount = Number(row.totalCodeCount ?? 0);
        let usedCodeCount = Number(row.usedCodeCount ?? 0);
        let activeCodeCount = Number(row.activeCodeCount ?? 0);
        if (codeList) {
            totalCodeCount = codeList.length;
            usedCodeCount = 0;
            activeCodeCount = 0;
            for (const code of codeList) {
                if (code?.status === 'used') {
                    usedCodeCount += 1;
                }
                else if (code?.status === 'active') {
                    activeCodeCount += 1;
                }
            }
        }
        return {
            id: String(row.id ?? ''),
            name: String(row.name ?? ''),
            rewards: cloneRedeemRewards(Array.isArray(row.rewards) ? row.rewards : []),
            totalCodeCount: Number.isFinite(totalCodeCount) ? totalCodeCount : 0,
            usedCodeCount: Number.isFinite(usedCodeCount) ? usedCodeCount : 0,
            activeCodeCount: Number.isFinite(activeCodeCount) ? activeCodeCount : 0,
            createdAt: new Date(row.createdAt ?? row['createdAt']).toISOString(),
            updatedAt: new Date(row.updatedAt ?? row['updatedAt']).toISOString(),
        };
    }
    toRedeemCodeView(row) {
        return {
            id: String(row.id ?? ''),
            groupId: String(row.groupId ?? row['groupId'] ?? ''),
            code: String(row.code ?? ''),
            status: row.status === 'used' || row.status === 'destroyed' ? row.status : 'active',
            usedByPlayerId: readOptionalString(row.usedByPlayerId ?? row['usedByPlayerId']),
            usedByRoleName: readOptionalString(row.usedByRoleName ?? row['usedByRoleName']),
            usedAt: row.usedAt ? new Date(row.usedAt).toISOString() : null,
            destroyedAt: row.destroyedAt ? new Date(row.destroyedAt).toISOString() : null,
            createdAt: new Date(row.createdAt ?? row['createdAt']).toISOString(),
            updatedAt: new Date(row.updatedAt ?? row['updatedAt']).toISOString(),
        };
    }
    resolveMapName(mapId) {
        try {
            return this.mapTemplateRepository.getOrThrow(mapId).name;
        }
        catch {
            return mapId;
        }
    }
};
exports.LegacyGmHttpCompatService = LegacyGmHttpCompatService;
exports.LegacyGmHttpCompatService = LegacyGmHttpCompatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        legacy_auth_http_service_1.LegacyAuthHttpService,
        legacy_gm_compat_service_1.LegacyGmCompatService,
        mail_runtime_service_1.MailRuntimeService,
        map_template_repository_1.MapTemplateRepository,
        player_persistence_service_1.PlayerPersistenceService,
        player_progression_service_1.PlayerProgressionService,
        player_runtime_service_1.PlayerRuntimeService,
        suggestion_runtime_service_1.SuggestionRuntimeService,
        world_runtime_service_1.WorldRuntimeService])
], LegacyGmHttpCompatService);
function buildManagedAccountView(account, online) {
    if (!account?.userId || !account.username) {
        return undefined;
    }
    let totalOnlineSeconds = Number.isFinite(account.totalOnlineSeconds) ? Math.max(0, Math.trunc(account.totalOnlineSeconds)) : 0;
    if (online && typeof account.currentOnlineStartedAt === 'string' && account.currentOnlineStartedAt) {
        const sessionStartedAt = Date.parse(account.currentOnlineStartedAt);
        if (Number.isFinite(sessionStartedAt)) {
            totalOnlineSeconds += Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
        }
    }
    return {
        userId: account.userId,
        username: account.username,
        createdAt: typeof account.createdAt === 'string' && account.createdAt ? account.createdAt : new Date(0).toISOString(),
        totalOnlineSeconds,
    };
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function compareManagedPlayerSummary(left, right) {
    if (left.meta.isBot !== right.meta.isBot) {
        return left.meta.isBot ? 1 : -1;
    }
    if (left.meta.online !== right.meta.online) {
        return left.meta.online ? -1 : 1;
    }
    if (left.mapName !== right.mapName) {
        return left.mapName.localeCompare(right.mapName, 'zh-Hans-CN');
    }
    return left.roleName.localeCompare(right.roleName, 'zh-Hans-CN');
}
function isInRect(x, y, startX, startY, endX, endY) {
    return x >= startX && x < endX && y >= startY && y < endY;
}
function roundMetric(value) {
    return Math.round(value * 100) / 100;
}
function buildLegacyTimeState(template, totalTicks, baseViewRange, overrideConfig, tickSpeed) {
    const config = normalizeLegacyMapTimeConfig(overrideConfig ?? template.source.time);
    const localTimeScale = typeof config.scale === 'number' && Number.isFinite(config.scale) && config.scale >= 0
        ? config.scale
        : 1;
    const timeScale = tickSpeed > 0 ? localTimeScale : 0;
    const offsetTicks = typeof config.offsetTicks === 'number' && Number.isFinite(config.offsetTicks)
        ? Math.round(config.offsetTicks)
        : 0;
    const effectiveTicks = tickSpeed > 0 ? totalTicks : 0;
    const localTicks = ((Math.floor(effectiveTicks * timeScale) + offsetTicks) % shared_1.GAME_DAY_TICKS + shared_1.GAME_DAY_TICKS) % shared_1.GAME_DAY_TICKS;
    const phase = shared_1.GAME_TIME_PHASES.find((entry) => localTicks >= entry.startTick && localTicks < entry.endTick)
        ?? shared_1.GAME_TIME_PHASES[shared_1.GAME_TIME_PHASES.length - 1];
    const baseLight = typeof config.light?.base === 'number' && Number.isFinite(config.light.base)
        ? config.light.base
        : 0;
    const timeInfluence = typeof config.light?.timeInfluence === 'number' && Number.isFinite(config.light.timeInfluence)
        ? config.light.timeInfluence
        : 100;
    const lightPercent = Math.max(0, Math.min(100, Math.round(baseLight + phase.skyLightPercent * (timeInfluence / 100))));
    const darknessStacks = resolveLegacyDarknessStacks(lightPercent);
    const visionMultiplier = shared_1.DARKNESS_STACK_TO_VISION_MULTIPLIER[darknessStacks] ?? 0.5;
    const palette = config.palette?.[phase.id];
    return {
        totalTicks,
        localTicks,
        dayLength: shared_1.GAME_DAY_TICKS,
        timeScale,
        phase: phase.id,
        phaseLabel: phase.label,
        darknessStacks,
        visionMultiplier,
        lightPercent,
        effectiveViewRange: Math.max(1, Math.ceil(Math.max(1, baseViewRange) * visionMultiplier)),
        tint: palette?.tint ?? phase.tint,
        overlayAlpha: palette?.alpha ?? Math.max(phase.overlayAlpha, (100 - lightPercent) / 100 * 0.8),
    };
}
function normalizeLegacyMapTimeConfig(input) {
    const candidate = input ?? {};
    return {
        offsetTicks: candidate.offsetTicks,
        scale: candidate.scale,
        light: candidate.light,
        palette: candidate.palette,
    };
}
function resolveLegacyDarknessStacks(lightPercent) {
    if (lightPercent >= 95)
        return 0;
    if (lightPercent >= 85)
        return 1;
    if (lightPercent >= 75)
        return 2;
    if (lightPercent >= 65)
        return 3;
    if (lightPercent >= 55)
        return 4;
    return 5;
}
function toLegacyEquipmentSlots(slots) {
    const bySlot = new Map(slots.map((entry) => [entry.slot, entry.item ? { ...entry.item } : null]));
    return {
        weapon: bySlot.get('weapon') ?? null,
        head: bySlot.get('head') ?? null,
        body: bySlot.get('body') ?? null,
        legs: bySlot.get('legs') ?? null,
        accessory: bySlot.get('accessory') ?? null,
    };
}
function cloneTemporaryBuff(entry) {
    return {
        ...entry,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        stats: entry.stats ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
    };
}
function cloneRatioDivisors(source) {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: source.elementDamageReduce ? { ...source.elementDamageReduce } : undefined,
    };
}

function normalizeRedeemGroupName(name) {
    const normalized = typeof name === 'string' ? name.normalize('NFC').trim() : '';
    if (!normalized) {
        throw new common_1.BadRequestException('兑换码分组名称不能为空');
    }
    if (normalized.length > 120) {
        throw new common_1.BadRequestException('兑换码分组名称过长');
    }
    return normalized;
}
function normalizeRedeemCreateCount(count) {
    const normalized = Math.max(1, Math.floor(Number(count) || 0));
    if (normalized <= 0) {
        throw new common_1.BadRequestException('兑换码数量必须大于 0');
    }
    if (normalized > MAX_GROUP_CREATE_COUNT) {
        throw new common_1.BadRequestException(`单次最多生成 ${MAX_GROUP_CREATE_COUNT} 个兑换码`);
    }
    return normalized;
}
function normalizeSubmittedRedeemCodes(codes) {
    if (!Array.isArray(codes)) {
        return [];
    }
    const normalized = [];
    const seen = new Set();
    for (const entry of codes) {
        if (typeof entry !== 'string') {
            continue;
        }
        const code = entry.trim().toUpperCase();
        if (!code || seen.has(code)) {
            continue;
        }
        seen.add(code);
        normalized.push(code);
        if (normalized.length >= MAX_BATCH_REDEEM_CODES) {
            break;
        }
    }
    return normalized;
}
function cloneRedeemRewards(rewards) {
    return Array.isArray(rewards)
        ? rewards.map((entry) => ({
            itemId: String(entry?.itemId ?? ''),
            count: Math.max(1, Math.floor(Number(entry?.count) || 0)),
        })).filter((entry) => entry.itemId.length > 0)
        : [];
}
function canApplyRedeemRewardsToSimulation(simulatedInventory, capacity, rewards) {
    const next = simulatedInventory.map((entry) => ({ ...entry }));
    for (const reward of rewards) {
        const existing = next.find((entry) => entry.itemId === reward.itemId);
        if (existing) {
            existing.count += reward.count;
            continue;
        }
        if (next.length >= capacity) {
            return false;
        }
        next.push({ itemId: reward.itemId, count: reward.count });
    }
    simulatedInventory.splice(0, simulatedInventory.length, ...next);
    return true;
}
function generateRedeemCodeValue() {
    const bytes = (0, node_crypto_1.randomBytes)(REDEEM_CODE_LENGTH);
    let output = '';
    for (let index = 0; index < REDEEM_CODE_LENGTH; index += 1) {
        output += REDEEM_CODE_ALPHABET[bytes[index] % REDEEM_CODE_ALPHABET.length];
    }
    return output;
}
function readOptionalString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
