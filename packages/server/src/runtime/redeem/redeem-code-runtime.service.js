"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedeemCodeRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const node_crypto_1 = require("node:crypto");

const content_template_repository_1 = require("../../content/content-template.repository");

const redeem_code_persistence_service_1 = require("../../persistence/redeem-code-persistence.service");

const player_runtime_service_1 = require("../player/player-runtime.service");

/** 兑换码运行时：负责分组、码表、兑换与持久化。 */
const REDEEM_CODE_LENGTH = 36;

/** 兑换码字符表，使用大写字母和数字避免歧义。 */
const REDEEM_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 单次批量兑换的最大兑换码数量。 */
const MAX_BATCH_REDEEM_CODES = 50;

/** 单个分组一次最多创建的兑换码数量。 */
const MAX_GROUP_CREATE_COUNT = 500;

let RedeemCodeRuntimeService = class RedeemCodeRuntimeService {
    contentTemplateRepository;
    playerRuntimeService;
    redeemCodePersistenceService;
    /** 当前全部兑换码分组。 */
    groups = [];
    /** 当前全部兑换码。 */
    codes = [];
    /** 持久化文档版本号。 */
    revision = 1;
    /** 串行化分组/码表写操作。 */
    mutationQueue = Promise.resolve();
    /** 注入内容、玩家与兑换码持久化服务。 */
    constructor(contentTemplateRepository, playerRuntimeService, redeemCodePersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.redeemCodePersistenceService = redeemCodePersistenceService;
    }
    /** 模块初始化时从持久化回填兑换码数据。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    /** 重新读取兑换码文档，供启动和恢复场景重建内存态。 */
    async reloadFromPersistence() {

        const loaded = await this.redeemCodePersistenceService.loadDocument();
        if (!loaded) {
            this.groups = [];
            this.codes = [];
            this.revision = 1;
            return;
        }
        this.groups = loaded.groups
            .filter((entry) => entry.id && entry.name.trim())
            .map((entry) => cloneGroup(entry));

        const groupIdSet = new Set(this.groups.map((entry) => entry.id));
        this.codes = loaded.codes
            .filter((entry) => entry.groupId && entry.code && groupIdSet.has(entry.groupId))
            .map((entry) => cloneCode(entry));
        this.revision = loaded.revision;
    }
    /** 列出全部兑换码分组。 */
    async listGroups() {
        return {
            groups: this.groups
                .map((group) => this.toGroupView(group, this.listCodesByGroupId(group.id)))
                .sort((left, right) => compareIsoDesc(left.updatedAt, right.updatedAt) || compareIsoDesc(left.createdAt, right.createdAt) || left.id.localeCompare(right.id, 'zh-Hans-CN')),
        };
    }
    /** 读取某个分组的详情和码表。 */
    async getGroupDetail(groupId) {

        const group = this.requireGroup(groupId);

        const codes = this.listCodesByGroupId(group.id);
        return {
            group: this.toGroupView(group, codes),
            codes: codes.map((entry) => this.toCodeView(entry)),
        };
    }
    /** 创建分组并批量生成兑换码。 */
    async createGroup(name, rewards, count) {

        const normalizedName = normalizeGroupName(name);

        const normalizedRewards = this.normalizeRewardsForMutation(rewards);

        const normalizedCount = normalizeCreateCount(count);
        return this.runExclusive(async () => {
            if (this.groups.some((entry) => entry.name === normalizedName)) {
                throw new common_1.BadRequestException('兑换码分组名称已存在');
            }

            const now = new Date().toISOString();

            const group = {
                id: `redeem-group:${(0, node_crypto_1.randomUUID)()}`,
                name: normalizedName,
                rewards: normalizedRewards.map((entry) => ({ ...entry })),
                createdAt: now,
                updatedAt: now,
            };

            const createdCodes = this.createCodes(group.id, normalizedCount, now);
            this.groups.push(group);
            this.codes.push(...createdCodes);
            await this.persist();
            return {
                group: this.toGroupView(group, createdCodes),
                codes: createdCodes.map((entry) => entry.code),
            };
        });
    }
    /** 更新分组名称和奖励内容。 */
    async updateGroup(groupId, name, rewards) {

        const normalizedName = normalizeGroupName(name);

        const normalizedRewards = this.normalizeRewardsForMutation(rewards);
        return this.runExclusive(async () => {

            const group = this.requireGroup(groupId);

            const conflicting = this.groups.find((entry) => entry.id !== group.id && entry.name === normalizedName);
            if (conflicting) {
                throw new common_1.BadRequestException('兑换码分组名称已存在');
            }
            group.name = normalizedName;
            group.rewards = normalizedRewards.map((entry) => ({ ...entry }));
            group.updatedAt = new Date().toISOString();
            await this.persist();
            return this.getGroupDetail(group.id);
        });
    }
    /** 给某个分组追加新的兑换码。 */
    async appendCodes(groupId, count) {

        const normalizedCount = normalizeCreateCount(count);
        return this.runExclusive(async () => {

            const group = this.requireGroup(groupId);

            const now = new Date().toISOString();

            const createdCodes = this.createCodes(group.id, normalizedCount, now);
            this.codes.push(...createdCodes);
            group.updatedAt = now;
            await this.persist();

            const allCodes = this.listCodesByGroupId(group.id);
            return {
                group: this.toGroupView(group, allCodes),
                codes: createdCodes.map((entry) => entry.code),
            };
        });
    }
    /** 销毁单个未使用兑换码。 */
    async destroyCode(codeId) {

        const normalizedCodeId = typeof codeId === 'string' ? codeId.trim() : '';
        if (!normalizedCodeId) {
            throw new common_1.BadRequestException('目标兑换码不存在');
        }
        return this.runExclusive(async () => {

            const code = this.codes.find((entry) => entry.id === normalizedCodeId);
            if (!code) {
                throw new common_1.BadRequestException('目标兑换码不存在');
            }
            if (code.status === 'used') {
                throw new common_1.BadRequestException('已使用的兑换码不能销毁');
            }
            if (code.status === 'destroyed') {
                return { ok: true };
            }

            const now = new Date().toISOString();
            code.status = 'destroyed';
            code.destroyedAt = now;
            code.updatedAt = now;

            const group = this.groups.find((entry) => entry.id === code.groupId);
            if (group) {
                group.updatedAt = now;
            }
            await this.persist();
            return { ok: true };
        });
    }
    /** 校验并兑换玩家提交的兑换码。 */
    async redeemCodes(playerId, submittedCodes) {

        const normalizedCodes = normalizeSubmittedCodes(submittedCodes);
        if (normalizedCodes.length === 0) {
            throw new common_1.BadRequestException('请至少填写一个兑换码');
        }
        return this.runExclusive(async () => {

            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

            const nowIso = new Date().toISOString();

            let changed = false;

            const results = [];
            for (const submittedCode of normalizedCodes) {
                const codeEntry = this.codes.find((entry) => entry.code === submittedCode);
                if (!codeEntry) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码不存在',
                    });
                    continue;
                }

                const group = this.groups.find((entry) => entry.id === codeEntry.groupId) ?? null;

                const groupName = group?.name ?? undefined;
                if (codeEntry.status === 'used') {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码已被使用',
                        groupName,
                    });
                    continue;
                }
                if (codeEntry.status === 'destroyed') {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码已被销毁',
                        groupName,
                    });
                    continue;
                }

                const rewards = Array.isArray(group?.rewards) ? group.rewards.map((entry) => ({ ...entry })) : [];
                if (rewards.length === 0) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码奖励配置无效',
                        groupName,
                    });
                    continue;
                }

                const items = [];

                let invalidRewardItem = false;
                for (const reward of rewards) {
                    const item = this.contentTemplateRepository.createItem(reward.itemId, reward.count);
                    if (!item) {
                        invalidRewardItem = true;
                        break;
                    }
                    items.push(item);
                }
                if (invalidRewardItem) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码奖励物品不存在',
                        groupName,
                    });
                    continue;
                }
                if (!canReceiveAllRewards(player.inventory.items, player.inventory.capacity, items)) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '背包空间不足',
                        groupName,
                        rewards: rewards.map((entry) => ({ ...entry })),
                    });
                    continue;
                }
                for (const item of items) {
                    this.playerRuntimeService.receiveInventoryItem(playerId, item);
                }
                codeEntry.status = 'used';
                codeEntry.usedByPlayerId = player.playerId;
                codeEntry.usedByRoleName = player.name;
                codeEntry.usedAt = nowIso;
                codeEntry.updatedAt = nowIso;
                if (group) {
                    group.updatedAt = nowIso;
                }
                this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
                    id: `redeem:${playerId}:${submittedCode}`,
                    kind: 'grudge',
                    text: `兑换成功：${group?.name ?? submittedCode}`,
                    from: '司命台',
                    at: Date.now(),
                });
                this.playerRuntimeService.enqueueNotice(playerId, {
                    text: `兑换成功：${group?.name ?? submittedCode}`,
                    kind: 'success',
                });
                results.push({
                    code: submittedCode,
                    ok: true,
                    message: '兑换成功',
                    groupName,
                    rewards: rewards.map((entry) => ({ ...entry })),
                });
                changed = true;
            }
            if (changed) {
                await this.persist();
            }
            return { results };
        });
    }
    requireGroup(groupId) {

        const normalizedGroupId = typeof groupId === 'string' ? groupId.trim() : '';

        const group = this.groups.find((entry) => entry.id === normalizedGroupId);
        if (!group) {
            throw new common_1.BadRequestException('兑换码分组不存在');
        }
        return group;
    }
    listCodesByGroupId(groupId) {
        return this.codes
            .filter((entry) => entry.groupId === groupId)
            .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt) || left.code.localeCompare(right.code, 'zh-Hans-CN'));
    }
    normalizeRewardsForMutation(rewards) {
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
    createCodes(groupId, count, nowIso) {

        const seenCodes = new Set(this.codes.map((entry) => entry.code));

        const created = [];
        while (created.length < count) {

            const code = generateRedeemCode(seenCodes);
            seenCodes.add(code);
            created.push({
                id: `redeem-code:${(0, node_crypto_1.randomUUID)()}`,
                groupId,
                code,
                status: 'active',
                usedByPlayerId: null,
                usedByRoleName: null,
                usedAt: null,
                destroyedAt: null,
                createdAt: nowIso,
                updatedAt: nowIso,
            });
        }
        return created;
    }
    toGroupView(group, codes) {

        let usedCodeCount = 0;

        let activeCodeCount = 0;
        for (const code of codes) {
            if (code.status === 'used') {
                usedCodeCount += 1;
            }
            else if (code.status === 'active') {
                activeCodeCount += 1;
            }
        }
        return {
            id: group.id,
            name: group.name,
            rewards: group.rewards.map((entry) => ({ ...entry })),
            totalCodeCount: codes.length,
            usedCodeCount,
            activeCodeCount,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt,
        };
    }
    toCodeView(code) {
        return {
            id: code.id,
            groupId: code.groupId,
            code: code.code,
            status: code.status,
            usedByPlayerId: code.usedByPlayerId,
            usedByRoleName: code.usedByRoleName,
            usedAt: code.usedAt,
            destroyedAt: code.destroyedAt,
            createdAt: code.createdAt,
            updatedAt: code.updatedAt,
        };
    }
    /** 持久化当前分组和码表快照。 */
    async persist() {
        this.revision += 1;
        await this.redeemCodePersistenceService.saveDocument({
            version: 1,
            revision: this.revision,
            groups: this.groups.map((entry) => cloneGroup(entry)),
            codes: this.codes.map((entry) => cloneCode(entry)),
        });
    }
    /** 按顺序执行一次互斥写操作。 */
    async runExclusive(action) {

        const previous = this.mutationQueue;

        let release;
        this.mutationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await action();
        }
        finally {
            release();
        }
    }
};
exports.RedeemCodeRuntimeService = RedeemCodeRuntimeService;
exports.RedeemCodeRuntimeService = RedeemCodeRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        redeem_code_persistence_service_1.RedeemCodePersistenceService])
], RedeemCodeRuntimeService);
function normalizeGroupName(name) {

    const normalized = typeof name === 'string' ? name.normalize('NFC').trim() : '';
    if (!normalized) {
        throw new common_1.BadRequestException('兑换码分组名称不能为空');
    }
    if (normalized.length > 120) {
        throw new common_1.BadRequestException('兑换码分组名称过长');
    }
    return normalized;
}
function normalizeCreateCount(count) {

    const normalized = Math.max(1, Math.floor(Number(count) || 0));
    if (normalized <= 0) {
        throw new common_1.BadRequestException('兑换码数量必须大于 0');
    }
    if (normalized > MAX_GROUP_CREATE_COUNT) {
        throw new common_1.BadRequestException(`单次最多生成 ${MAX_GROUP_CREATE_COUNT} 个兑换码`);
    }
    return normalized;
}
function normalizeSubmittedCodes(codes) {
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
function cloneGroup(group) {
    return {
        ...group,
        rewards: Array.isArray(group.rewards) ? group.rewards.map((entry) => ({ ...entry })) : [],
    };
}
function cloneCode(code) {
    return { ...code };
}
function compareIsoDesc(left, right) {
    if (left === right) {
        return 0;
    }
    return right.localeCompare(left, 'en');
}
function canReceiveAllRewards(currentItems, capacity, items) {

    const snapshot = Array.isArray(currentItems) ? currentItems.map((entry) => ({ ...entry })) : [];
    for (const item of items) {
        const existing = snapshot.find((entry) => entry.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
            continue;
        }
        if (snapshot.length >= capacity) {
            return false;
        }
        snapshot.push({ ...item });
    }
    return true;
}
function generateRedeemCode(seenCodes) {
    for (;;) {
        const bytes = (0, node_crypto_1.randomBytes)(REDEEM_CODE_LENGTH);
        let output = '';
        for (let index = 0; index < REDEEM_CODE_LENGTH; index += 1) {
            output += REDEEM_CODE_ALPHABET[bytes[index] % REDEEM_CODE_ALPHABET.length];
        }
        if (!seenCodes.has(output)) {
            return output;
        }
    }
}
//# sourceMappingURL=redeem-code-runtime.service.js.map


