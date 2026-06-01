/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { canMergeItemStack, createItemStackSignature } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { RedeemCodePersistenceService } from '../../persistence/redeem-code-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';
import { buildStructuredNotice } from '../world/structured-notice.helpers';

/** 兑换码运行时：负责分组、码表、兑换与持久化。 */
const REDEEM_CODE_LENGTH = 36;

/** 兑换码字符表，使用大写字母和数字避免歧义。 */
const REDEEM_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 单次批量兑换的最大兑换码数量。 */
const MAX_BATCH_REDEEM_CODES = 50;

/** 单个分组一次最多创建的兑换码数量。 */
const MAX_GROUP_CREATE_COUNT = 500;
const REDEEM_RATE_LIMIT_MS = 3_000;
const REDEEM_RATE_CACHE_TTL_MS = 60_000;
const REDEEM_RATE_CACHE_MAX_PLAYERS = 10_000;

@Injectable()
export class RedeemCodeRuntimeService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * redeemCodePersistenceService：redeemCodePersistence服务引用。
 */

    redeemCodePersistenceService;
    /** durableOperationService：库存强事务服务引用。 */
    durableOperationService;
    /** instanceCatalogService：实例 lease 查询服务引用。 */
    instanceCatalogService;
    /** playerDomainPersistenceService：玩家 presence fence 真源。 */
    playerDomainPersistenceService;
    _redeemRateMap = new Map();
    /** 当前全部兑换码分组。 */
    groups = [];
    /** 当前全部兑换码。 */
    codes = [];
    /** 持久化文档版本号。 */
    revision = 1;
    /** 串行化分组/码表写操作。 */
    mutationQueue = Promise.resolve();
    /** 注入内容、玩家与兑换码持久化服务。 */
    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(RedeemCodePersistenceService) redeemCodePersistenceService: any,
        @Inject(DurableOperationService) durableOperationService: any = null,
        @Inject(InstanceCatalogService) instanceCatalogService: any = null,
        @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.redeemCodePersistenceService = redeemCodePersistenceService;
        this.durableOperationService = durableOperationService;
        this.instanceCatalogService = instanceCatalogService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
    }
    /** 模块初始化时从持久化回填兑换码数据。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    /** 重新读取兑换码文档，供启动和恢复场景重建内存态。 */
    async reloadFromPersistence() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        return this.runExclusiveWithRedeemCatalogRollback(async () => {
            if (this.groups.some((entry) => entry.name === normalizedName)) {
                throw new BadRequestException('兑换码分组名称已存在');
            }

            const now = new Date().toISOString();

            const group = {
                id: `redeem-group:${randomUUID()}`,
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
        return this.runExclusiveWithRedeemCatalogRollback(async () => {

            const group = this.requireGroup(groupId);

            const conflicting = this.groups.find((entry) => entry.id !== group.id && entry.name === normalizedName);
            if (conflicting) {
                throw new BadRequestException('兑换码分组名称已存在');
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
        return this.runExclusiveWithRedeemCatalogRollback(async () => {

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
    /** 删除未产生使用记录的兑换码分组，并同步移除该分组下的码。 */
    async deleteGroup(groupId) {
        const normalizedGroupId = typeof groupId === 'string' ? groupId.trim() : '';
        if (!normalizedGroupId) {
            throw new BadRequestException('兑换码分组不存在');
        }
        return this.runExclusiveWithRedeemCatalogRollback(async () => {
            const group = this.requireGroup(normalizedGroupId);
            const groupCodes = this.codes.filter((entry) => entry.groupId === group.id);
            if (groupCodes.some((entry) => entry.status === 'used')) {
                throw new BadRequestException('已有使用记录的兑换码分组不能删除');
            }
            const deleteFn = this.redeemCodePersistenceService?.deleteGroup;
            if (typeof deleteFn !== 'function') {
                throw new ServiceUnavailableException('redeem_code_persistence_unavailable');
            }
            const nextRevision = this.revision + 1;
            const result = await deleteFn.call(this.redeemCodePersistenceService, group.id, nextRevision);
            if (result === false) {
                throw new ServiceUnavailableException('redeem_code_persistence_unavailable');
            }
            if (result && typeof result === 'object' && result.ok === false) {
                if (result.reason === 'used_code_exists') {
                    throw new BadRequestException('已有使用记录的兑换码分组不能删除');
                }
                throw new BadRequestException('兑换码分组删除失败');
            }
            this.groups = this.groups.filter((entry) => entry.id !== group.id);
            this.codes = this.codes.filter((entry) => entry.groupId !== group.id);
            this.revision = nextRevision;
            return {
                ok: true,
                deletedCodeCount: groupCodes.length,
            };
        });
    }
    /** 销毁单个未使用兑换码。 */
    async destroyCode(codeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedCodeId = typeof codeId === 'string' ? codeId.trim() : '';
        if (!normalizedCodeId) {
            throw new BadRequestException('目标兑换码不存在');
        }
        return this.runExclusiveWithRedeemCatalogRollback(async () => {

            const code = this.codes.find((entry) => entry.id === normalizedCodeId);
            if (!code) {
                throw new BadRequestException('目标兑换码不存在');
            }
            if (code.status === 'used') {
                throw new BadRequestException('已使用的兑换码不能销毁');
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedCodes = normalizeSubmittedCodes(submittedCodes);
        if (normalizedCodes.length === 0) {
            throw new BadRequestException('请至少填写一个兑换码');
        }
        if (normalizedCodes.length > 5) {
            throw new BadRequestException('单次最多兑换 5 个兑换码');
        }
        const now = Date.now();
        if (!this._redeemRateMap) {
            this._redeemRateMap = new Map();
        }
        this.pruneRedeemRateMap(now);
        const lastAttempt = this._redeemRateMap.get(playerId) ?? 0;
        if (now - lastAttempt < REDEEM_RATE_LIMIT_MS) {
            throw new BadRequestException('操作过于频繁，请稍后再试');
        }
        this._redeemRateMap.set(playerId, now);
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
                        message: '兑换码无效或已过期',
                    });
                    continue;
                }

                const group = this.groups.find((entry) => entry.id === codeEntry.groupId) ?? null;

                const groupName = group?.name ?? undefined;
                if (codeEntry.status === 'used') {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码无效或已过期',
                        groupName,
                    });
                    continue;
                }
                if (codeEntry.status === 'destroyed') {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码无效或已过期',
                        groupName,
                    });
                    continue;
                }

                const rewards = Array.isArray(group?.rewards) ? group.rewards.map((entry) => ({ ...entry })) : [];
                if (rewards.length === 0) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码无效或已过期',
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
                const claimResult = await this.claimCodeForUseBeforeRewards(codeEntry, player, nowIso);
                if (!claimResult.ok) {
                    results.push({
                        code: submittedCode,
                        ok: false,
                        message: '兑换码无效或已过期',
                        groupName,
                    });
                    continue;
                }
                const walletItems = [];
                const inventoryItems = [];
                for (const item of items) {
                    if (isWalletRewardItemId(item.itemId)) {
                        walletItems.push(item);
                        continue;
                    }
                    inventoryItems.push(item);
                }
                if (inventoryItems.length > 0) {
                    await this.grantInventoryRewards(player, inventoryItems, submittedCode);
                }
                for (const item of walletItems) {
                    await this.grantWalletReward(player, item, submittedCode);
                }
                codeEntry.status = 'used';
                codeEntry.usedByPlayerId = player.playerId;
                codeEntry.usedByRoleName = player.name;
                codeEntry.usedAt = nowIso;
                codeEntry.updatedAt = nowIso;
                if (group) {
                    group.updatedAt = nowIso;
                }
                const redeemNotice = buildStructuredNotice('success', 'notice.redeem.success', '兑换成功', {
                    vars: { groupName: group?.name ?? submittedCode },
                    pills: [{ key: 'groupName', style: 'target' }],
                });
                this.playerRuntimeService.enqueueNotice(playerId, {
                    text: redeemNotice.text,
                    kind: redeemNotice.kind,
                    structured: redeemNotice.structured,
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
    /**
 * requireGroup：执行requireGroup相关逻辑。
 * @param groupId group ID。
 * @returns 无返回值，直接更新requireGroup相关状态。
 */

    requireGroup(groupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedGroupId = typeof groupId === 'string' ? groupId.trim() : '';

        const group = this.groups.find((entry) => entry.id === normalizedGroupId);
        if (!group) {
            throw new BadRequestException('兑换码分组不存在');
        }
        return group;
    }    
    /**
 * listCodesByGroupId：读取CodeByGroupID并返回结果。
 * @param groupId group ID。
 * @returns 无返回值，完成CodeByGroupID的读取/组装。
 */

    listCodesByGroupId(groupId) {
        return this.codes
            .filter((entry) => entry.groupId === groupId)
            .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt) || left.code.localeCompare(right.code, 'zh-Hans-CN'));
    }    
    /**
 * normalizeRewardsForMutation：规范化或转换RewardForMutation。
 * @param rewards 参数说明。
 * @returns 无返回值，直接更新RewardForMutation相关状态。
 */

    normalizeRewardsForMutation(rewards) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Array.isArray(rewards) || rewards.length === 0) {
            throw new BadRequestException('兑换码分组至少需要一个奖励物品');
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
                throw new BadRequestException(`奖励物品不存在：${itemId}`);
            }
            normalized.push({ itemId, count });
        }
        if (normalized.length === 0) {
            throw new BadRequestException('兑换码分组至少需要一个有效奖励物品');
        }
        return normalized;
    }    
    /**
 * createCodes：构建并返回目标对象。
 * @param groupId group ID。
 * @param count 数量。
 * @param nowIso 参数说明。
 * @returns 无返回值，直接更新Code相关状态。
 */

    createCodes(groupId, count, nowIso) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const seenCodes = new Set(this.codes.map((entry) => entry.code));

        const created = [];
        while (created.length < count) {

            const code = generateRedeemCode(seenCodes);
            seenCodes.add(code);
            created.push({
                id: `redeem-code:${randomUUID()}`,
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
    /**
 * toGroupView：执行toGroup视图相关逻辑。
 * @param group 参数说明。
 * @param codes 参数说明。
 * @returns 无返回值，直接更新toGroup视图相关状态。
 */

    toGroupView(group, codes) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * toCodeView：执行toCode视图相关逻辑。
 * @param code 参数说明。
 * @returns 无返回值，直接更新toCode视图相关状态。
 */

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
    /** 尝试把兑换码的非钱包奖励走 grantInventoryItems durable 主链。 */
    async grantInventoryRewards(player, items, submittedCode) {
        const normalizedItems = Array.isArray(items)
            ? items.map((entry) => this.contentTemplateRepository.normalizeItem(entry))
            : [];
        if (normalizedItems.length === 0) {
            return;
        }
        await this.syncCurrentPresenceFence(player.playerId);
        const nextInventoryItems = buildNextInventorySnapshots(player.inventory?.items ?? [], normalizedItems);
        let finalError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const durableContext = await this.resolveDurableInventoryGrantContext(player);
            if (!durableContext) {
                throw new ServiceUnavailableException('redeem_code_inventory_durable_context_required');
            }
            const rollbackState = captureInventoryGrantRollbackState(player);
            player.suppressImmediateDomainPersistence = true;
            try {
                await this.durableOperationService.grantInventoryItems({
                    operationId: `op:${player.playerId}:redeem-code:${submittedCode}`,
                    playerId: player.playerId,
                    expectedRuntimeOwnerId: durableContext.runtimeOwnerId,
                    expectedSessionEpoch: durableContext.sessionEpoch,
                    expectedInstanceId: durableContext.expectedInstanceId,
                    expectedAssignedNodeId: durableContext.expectedAssignedNodeId,
                    expectedOwnershipEpoch: durableContext.expectedOwnershipEpoch,
                    sourceType: 'redeem_code',
                    sourceRefId: submittedCode,
                    grantedItems: buildGrantedInventorySnapshots(normalizedItems),
                    nextInventoryItems,
                });
                finalError = null;
                player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
                break;
            }
            catch (error) {
                finalError = error;
                restoreInventoryGrantRollbackState(player, rollbackState, this.playerRuntimeService);
                player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
                if (attempt === 0 && shouldRetryRedeemSessionFence(error) && await this.syncCurrentPresenceFence(player.playerId)) {
                    continue;
                }
                break;
            }
        }
        if (finalError) {
            throw finalError;
        }
        this.playerRuntimeService.replaceInventoryItems(player.playerId, nextInventoryItems.map((entry) => ({ ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count })));
    }
    /** 在发奖前抢占核销兑换码；持久化启用时使用数据库条件更新防止跨节点双花。 */
    async claimCodeForUseBeforeRewards(codeEntry, player, nowIso) {
        const claimFn = this.redeemCodePersistenceService?.claimCodeForUse;
        if (typeof claimFn !== 'function') {
            return { ok: true, persistent: false };
        }
        const result = await claimFn.call(this.redeemCodePersistenceService, {
            code: codeEntry.code,
            playerId: player.playerId,
            playerName: player.name,
            usedAt: nowIso,
        });
        if (!result?.ok) {
            return { ok: false, persistent: true, reason: result?.reason ?? 'not_active' };
        }
        codeEntry.status = 'used';
        codeEntry.usedByPlayerId = player.playerId;
        codeEntry.usedByRoleName = player.name;
        codeEntry.usedAt = nowIso;
        codeEntry.updatedAt = nowIso;
        return { ok: true, persistent: result?.skipped !== true };
    }
    /** 兑换码钱包奖励必须走 durable 钱包事务，禁止 direct runtime fallback。 */
    async grantWalletReward(player, item, submittedCode) {
        const walletType = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
        const amount = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
        const nextWalletBalances = buildNextWalletBalances(player.wallet?.balances ?? [], walletType, amount);
        await this.syncCurrentPresenceFence(player.playerId);
        let finalError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const durableContext = await this.resolveDurableInventoryGrantContext(player);
            if (!durableContext || !this.durableOperationService?.isEnabled?.() || typeof this.durableOperationService?.mutatePlayerWallet !== 'function') {
                throw new ServiceUnavailableException('redeem_code_wallet_durable_context_required');
            }
            try {
                await this.durableOperationService.mutatePlayerWallet({
                    operationId: `op:${player.playerId}:redeem-code-wallet:${submittedCode}:${walletType}`,
                    playerId: player.playerId,
                    expectedRuntimeOwnerId: durableContext.runtimeOwnerId,
                    expectedSessionEpoch: durableContext.sessionEpoch,
                    expectedInstanceId: durableContext.expectedInstanceId,
                    expectedAssignedNodeId: durableContext.expectedAssignedNodeId,
                    expectedOwnershipEpoch: durableContext.expectedOwnershipEpoch,
                    walletType,
                    action: 'credit',
                    delta: amount,
                    nextWalletBalances,
                });
                finalError = null;
                break;
            }
            catch (error) {
                finalError = error;
                if (attempt === 0 && shouldRetryRedeemSessionFence(error) && await this.syncCurrentPresenceFence(player.playerId)) {
                    continue;
                }
                break;
            }
        }
        if (finalError) {
            throw finalError;
        }
        this.playerRuntimeService.creditWallet(player.playerId, walletType, amount);
    }
    /** 解析兑换码 durable 发物所需的 session/lease 上下文。 */
    async resolveDurableInventoryGrantContext(player) {
        const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' ? player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(player?.sessionEpoch) ? Math.max(1, Math.trunc(Number(player.sessionEpoch))) : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            return null;
        }
        if (!this.durableOperationService?.isEnabled?.() || typeof this.durableOperationService?.grantInventoryItems !== 'function') {
            return null;
        }
        const expectedInstanceId = typeof player?.instanceId === 'string' && player.instanceId.trim()
            ? player.instanceId.trim()
            : null;
        const leaseContext = await resolveInstanceLeaseContext(expectedInstanceId, this.instanceCatalogService);
        if (expectedInstanceId && !leaseContext) {
            return null;
        }
        return {
            runtimeOwnerId,
            sessionEpoch,
            expectedInstanceId,
            expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
            expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
        };
    }
    async syncCurrentPresenceFence(playerId) {
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return false;
        }
        const persistedPresence = typeof this.playerDomainPersistenceService?.loadPlayerPresence === 'function'
            ? await this.playerDomainPersistenceService.loadPlayerPresence(playerId)
            : null;
        let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        const persistedSessionEpoch = Number.isFinite(persistedPresence?.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
            : 0;
        const persistedRuntimeOwnerId = typeof persistedPresence?.runtimeOwnerId === 'string'
            ? persistedPresence.runtimeOwnerId.trim()
            : '';
        const runtimeSessionEpoch = Math.max(0, Math.trunc(Number(presence.sessionEpoch ?? 0)));
        const runtimeOwnerId = typeof presence.runtimeOwnerId === 'string' ? presence.runtimeOwnerId.trim() : '';
        if (
            typeof this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast === 'function'
            && persistedSessionEpoch > 0
            && (
                runtimeSessionEpoch <= persistedSessionEpoch
                || (persistedRuntimeOwnerId && persistedRuntimeOwnerId !== runtimeOwnerId)
            )
        ) {
            this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
            presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        }
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...presence,
            versionSeed: Date.now(),
        });
        return true;
    }
    /** 持久化当前分组和码表快照。 */
    async persist() {
        this.revision += 1;
        const saveFn = this.redeemCodePersistenceService?.saveDocument;
        if (typeof saveFn !== 'function') {
            throw new ServiceUnavailableException('redeem_code_persistence_unavailable');
        }
        const result = await saveFn.call(this.redeemCodePersistenceService, {
            version: 1,
            revision: this.revision,
            groups: this.groups.map((entry) => cloneGroup(entry)),
            codes: this.codes.map((entry) => cloneCode(entry)),
        });
        if (result === false) {
            throw new ServiceUnavailableException('redeem_code_persistence_unavailable');
        }
    }
    /** 清理兑换频率缓存，避免长期运行后按历史玩家数永久增长。 */
    pruneRedeemRateMap(now = Date.now()) {
        if (!(this._redeemRateMap instanceof Map) || this._redeemRateMap.size <= 0) {
            return;
        }
        for (const [playerId, lastAttempt] of this._redeemRateMap) {
            if (now - Number(lastAttempt ?? 0) >= REDEEM_RATE_CACHE_TTL_MS) {
                this._redeemRateMap.delete(playerId);
            }
        }
        if (this._redeemRateMap.size <= REDEEM_RATE_CACHE_MAX_PLAYERS) {
            return;
        }
        const overflow = this._redeemRateMap.size - REDEEM_RATE_CACHE_MAX_PLAYERS;
        const oldestPlayerIds = Array.from(this._redeemRateMap.entries())
            .sort((left, right) => Number(left[1] ?? 0) - Number(right[1] ?? 0))
            .slice(0, overflow)
            .map(([playerId]) => playerId);
        for (const playerId of oldestPlayerIds) {
            this._redeemRateMap.delete(playerId);
        }
    }
    /** 按顺序执行一次互斥写操作。 */
    async runExclusive(action) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /** GM 分组/码表变更必须先成功落库；失败时撤回本次内存态，避免重启后“成功但丢失”。 */
    async runExclusiveWithRedeemCatalogRollback(action) {
        return this.runExclusive(async () => {
            const previousGroups = this.groups.map((entry) => cloneGroup(entry));
            const previousCodes = this.codes.map((entry) => cloneCode(entry));
            const previousRevision = this.revision;
            try {
                return await action();
            }
            catch (error) {
                this.groups = previousGroups;
                this.codes = previousCodes;
                this.revision = previousRevision;
                throw error;
            }
        });
    }
};
/**
 * normalizeGroupName：规范化或转换Group名称。
 * @param name 参数说明。
 * @returns 无返回值，直接更新Group名称相关状态。
 */

function normalizeGroupName(name) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof name === 'string' ? name.normalize('NFC').trim() : '';
    if (!normalized) {
        throw new BadRequestException('兑换码分组名称不能为空');
    }
    if (normalized.length > 120) {
        throw new BadRequestException('兑换码分组名称过长');
    }
    return normalized;
}
/**
 * normalizeCreateCount：规范化或转换Create数量。
 * @param count 数量。
 * @returns 无返回值，直接更新Create数量相关状态。
 */

function normalizeCreateCount(count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = Math.max(1, Math.floor(Number(count) || 0));
    if (normalized <= 0) {
        throw new BadRequestException('兑换码数量必须大于 0');
    }
    if (normalized > MAX_GROUP_CREATE_COUNT) {
        throw new BadRequestException(`单次最多生成 ${MAX_GROUP_CREATE_COUNT} 个兑换码`);
    }
    return normalized;
}
/**
 * normalizeSubmittedCodes：规范化或转换SubmittedCode。
 * @param codes 参数说明。
 * @returns 无返回值，直接更新SubmittedCode相关状态。
 */

function normalizeSubmittedCodes(codes) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
function buildNextWalletBalances(existingBalances, walletType, amount) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    const normalizedAmount = Math.max(1, Math.trunc(Number(amount ?? 1)));
    const balances = Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
    const existing = balances.find((entry) => entry.walletType === normalizedWalletType);
    if (existing) {
        existing.balance += normalizedAmount;
        existing.version += 1;
    }
    else if (normalizedWalletType) {
        balances.push({
            walletType: normalizedWalletType,
            balance: normalizedAmount,
            frozenBalance: 0,
            version: 1,
        });
    }
    return balances;
}
/**
 * cloneGroup：构建Group。
 * @param group 参数说明。
 * @returns 无返回值，直接更新Group相关状态。
 */

function cloneGroup(group) {
    return {
        ...group,
        rewards: Array.isArray(group.rewards) ? group.rewards.map((entry) => ({ ...entry })) : [],
    };
}
/**
 * cloneCode：构建Code。
 * @param code 参数说明。
 * @returns 无返回值，直接更新Code相关状态。
 */

function cloneCode(code) {
    return { ...code };
}
/**
 * compareIsoDesc：判断compareIsoDesc是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareIsoDesc相关状态。
 */

function compareIsoDesc(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return 0;
    }
    return right.localeCompare(left, 'en');
}
/**
 * canReceiveAllRewards：判断ReceiveAllReward是否满足条件。
 * @param currentItems 参数说明。
 * @param capacity 参数说明。
 * @param items 道具列表。
 * @returns 无返回值，完成ReceiveAllReward的条件判断。
 */

function canReceiveAllRewards(currentItems, capacity, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const snapshot = Array.isArray(currentItems) ? currentItems.map((entry) => ({ ...entry })) : [];
    for (const item of items) {
        if (isWalletRewardItemId(item?.itemId)) {
            continue;
        }
        const incoming = { ...item };
        assignItemInstanceIdIfNeeded(incoming);
        const existing = canMergeItemStack(incoming)
            ? snapshot.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === createItemStackSignature(incoming))
            : null;
        if (existing) {
            existing.count += incoming.count;
            continue;
        }
        if (snapshot.length >= capacity) {
            return false;
        }
        snapshot.push(incoming);
    }
    return true;
}
function buildNextInventorySnapshots(currentItems, grantedItems) {
    const snapshot = Array.isArray(currentItems)
        ? currentItems.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId)
        : [];
    for (const grantedItem of Array.isArray(grantedItems) ? grantedItems : []) {
        const itemId = typeof grantedItem?.itemId === 'string' ? grantedItem.itemId.trim() : '';
        const count = Math.max(1, Math.trunc(Number(grantedItem?.count ?? 1)));
        if (!itemId || count <= 0) {
            continue;
        }
        const incoming = grantedItem ? { ...grantedItem, itemId, count } : { itemId, count };
        assignItemInstanceIdIfNeeded(incoming);
        const existing = canMergeItemStack(incoming)
            ? snapshot.find((entry) => canMergeItemStack(entry.rawPayload ?? entry) && createItemStackSignature(entry.rawPayload ?? entry) === createItemStackSignature(incoming))
            : null;
        if (existing) {
            existing.count += count;
            existing.rawPayload = { ...(existing.rawPayload ?? existing), itemId, count: existing.count };
            continue;
        }
        snapshot.push({
            itemId,
            count,
            rawPayload: incoming,
        });
    }
    return snapshot;
}
function buildGrantedInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((item) => ({
            itemId: typeof item?.itemId === 'string' ? item.itemId : '',
            count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
            rawPayload: item ? { ...item } : {},
        })).filter((entry) => entry.itemId)
        : [];
}
function captureInventoryGrantRollbackState(player) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: buildNextInventorySnapshots(player?.inventory?.items ?? [], []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player?.inventory?.revision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}
function restoreInventoryGrantRollbackState(player, rollbackState, playerRuntimeService) {
    player.inventory.items = Array.isArray(rollbackState.inventoryItems)
        ? rollbackState.inventoryItems.map((entry) => ({ ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count }))
        : [];
    player.inventory.revision = rollbackState.inventoryRevision;
    player.persistentRevision = rollbackState.persistentRevision;
    player.selfRevision = rollbackState.selfRevision;
    player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
    player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
    playerRuntimeService.playerProgressionService.refreshPreview(player);
}
async function resolveInstanceLeaseContext(instanceId, instanceCatalogService) {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!normalizedInstanceId || !instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const row = await instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
    if (!row) {
        return null;
    }
    const assignedNodeId = typeof row.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row.ownership_epoch)) ? Math.max(1, Math.trunc(Number(row.ownership_epoch))) : 0;
    if (!assignedNodeId || ownershipEpoch <= 0) {
        return null;
    }
    return {
        assignedNodeId,
        ownershipEpoch,
    };
}
function isWalletRewardItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}
function shouldRetryRedeemSessionFence(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.startsWith('player_session_fencing_conflict');
}
/**
 * generateRedeemCode：执行generateRedeemCode相关逻辑。
 * @param seenCodes 参数说明。
 * @returns 无返回值，直接更新generateRedeemCode相关状态。
 */

function generateRedeemCode(seenCodes) {
    for (;;) {
        const bytes = randomBytes(REDEEM_CODE_LENGTH);
        let output = '';
        for (let index = 0; index < REDEEM_CODE_LENGTH; index += 1) {
            output += REDEEM_CODE_ALPHABET[bytes[index] % REDEEM_CODE_ALPHABET.length];
        }
        if (!seenCodes.has(output)) {
            return output;
        }
    }
}
