import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AccountRedeemCodeResult,
  AccountRedeemCodesRes,
  GmAppendRedeemCodesRes,
  GmCreateRedeemCodeGroupRes,
  GmRedeemCodeGroupDetailRes,
  GmRedeemCodeGroupListRes,
  S2C,
  S2C_RedeemCodesResult,
  RedeemCodeCodeView,
  RedeemCodeGroupRewardItem,
  RedeemCodeGroupView,
} from '@mud/shared';
import { randomBytes } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { PlayerState } from '@mud/shared';
import { RedeemCodeEntity } from '../database/entities/redeem-code.entity';
import { RedeemCodeGroupEntity } from '../database/entities/redeem-code-group.entity';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { PlayerService } from './player.service';

const REDEEM_CODE_LENGTH = 36;
const REDEEM_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_BATCH_REDEEM_CODES = 50;
const MAX_GROUP_CREATE_COUNT = 500;

/** PreparedRedeemCodeEntry：定义该接口的能力与字段约束。 */
export interface PreparedRedeemCodeEntry {
  code: string;
  redeemCodeId: string | null;
  groupName: string | null;
  rewards: RedeemCodeGroupRewardItem[];
  state: 'active' | 'used' | 'destroyed' | 'not_found' | 'invalid_rewards';
}

/** PreparedRedeemCodeOperation：定义该接口的能力与字段约束。 */
export interface PreparedRedeemCodeOperation {
  entries: PreparedRedeemCodeEntry[];
}

@Injectable()
/** RedeemCodeService：封装相关状态与行为。 */
export class RedeemCodeService {
  constructor(
    @InjectRepository(RedeemCodeGroupEntity)
    private readonly redeemCodeGroupRepo: Repository<RedeemCodeGroupEntity>,
    @InjectRepository(RedeemCodeEntity)
    private readonly redeemCodeRepo: Repository<RedeemCodeEntity>,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly playerService: PlayerService,
  ) {}

  async listGroups(): Promise<GmRedeemCodeGroupListRes> {
    const groups = await this.redeemCodeGroupRepo.find({
      relations: ['codes'],
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
    return {
      groups: groups.map((group) => this.toGroupView(group)),
    };
  }

  async getGroupDetail(groupId: string): Promise<GmRedeemCodeGroupDetailRes> {
    const group = await this.requireGroup(groupId);
    const codes = await this.redeemCodeRepo.find({
      where: { groupId },
      order: { createdAt: 'DESC', code: 'ASC' },
    });
    return {
      group: this.toGroupView(group, codes),
      codes: codes.map((code) => this.toCodeView(code)),
    };
  }

  async createGroup(
    name: string,
    rewards: RedeemCodeGroupRewardItem[],
    count: number,
  ): Promise<GmCreateRedeemCodeGroupRes> {
    const normalizedName = normalizeGroupName(name);
    const normalizedRewards = this.normalizeRewards(rewards);
    const normalizedCount = normalizeCreateCount(count);

    const existing = await this.redeemCodeGroupRepo.findOne({ where: { name: normalizedName } });
    if (existing) {
      throw new BadRequestException('兑换码分组名称已存在');
    }

    const group = await this.redeemCodeGroupRepo.save(this.redeemCodeGroupRepo.create({
      name: normalizedName,
      rewards: normalizedRewards,
    }));
    const createdCodes = await this.createCodes(group.id, normalizedCount);
    return {
      group: this.toGroupView(group, createdCodes),
      codes: createdCodes.map((entry) => entry.code),
    };
  }

  async updateGroup(
    groupId: string,
    name: string,
    rewards: RedeemCodeGroupRewardItem[],
  ): Promise<GmRedeemCodeGroupDetailRes> {
    const group = await this.requireGroup(groupId);
    const normalizedName = normalizeGroupName(name);
    const normalizedRewards = this.normalizeRewards(rewards);

    const conflicting = await this.redeemCodeGroupRepo.findOne({ where: { name: normalizedName } });
    if (conflicting && conflicting.id !== groupId) {
      throw new BadRequestException('兑换码分组名称已存在');
    }

    group.name = normalizedName;
    group.rewards = normalizedRewards;
    await this.redeemCodeGroupRepo.save(group);
    return this.getGroupDetail(groupId);
  }

  async appendCodes(groupId: string, count: number): Promise<GmAppendRedeemCodesRes> {
    const group = await this.requireGroup(groupId);
    const normalizedCount = normalizeCreateCount(count);
    const createdCodes = await this.createCodes(group.id, normalizedCount);
    const allCodes = await this.redeemCodeRepo.find({ where: { groupId } });
    return {
      group: this.toGroupView(group, allCodes),
      codes: createdCodes.map((entry) => entry.code),
    };
  }

  async destroyCode(codeId: string): Promise<{ ok: true }> {
    const code = await this.redeemCodeRepo.findOne({ where: { id: codeId } });
    if (!code) {
      throw new BadRequestException('目标兑换码不存在');
    }
    if (code.status === 'used') {
      throw new BadRequestException('已使用的兑换码不能销毁');
    }
    if (code.status === 'destroyed') {
      return { ok: true };
    }
    code.status = 'destroyed';
    code.destroyedAt = new Date();
    await this.redeemCodeRepo.save(code);
    return { ok: true };
  }

  async prepareRedeemCodes(codes: string[]): Promise<PreparedRedeemCodeOperation> {
    const normalizedCodes = normalizeSubmittedCodes(codes);
    if (normalizedCodes.length === 0) {
      throw new BadRequestException('请至少填写一个兑换码');
    }

    const matchedCodes = normalizedCodes.length > 0
      ? await this.redeemCodeRepo.find({
        where: { code: In(normalizedCodes) },
        relations: ['group'],
      })
      : [];
    const matchedCodeByValue = new Map(matchedCodes.map((entry) => [entry.code, entry] as const));
    const entries: PreparedRedeemCodeEntry[] = [];
    for (const submittedCode of normalizedCodes) {
      const codeEntity = matchedCodeByValue.get(submittedCode);
      if (!codeEntity) {
        entries.push({
          code: submittedCode,
          redeemCodeId: null,
          groupName: null,
          rewards: [],
          state: 'not_found',
        });
        continue;
      }

      const group = codeEntity.group;
      let rewards: RedeemCodeGroupRewardItem[] = [];
      let state: PreparedRedeemCodeEntry['state'] = codeEntity.status;
      try {
        rewards = this.normalizeRewards(group?.rewards ?? []);
      } catch {
        state = 'invalid_rewards';
      }

      entries.push({
        code: submittedCode,
        redeemCodeId: codeEntity.id,
        groupName: group?.name ?? null,
        rewards,
        state,
      });
    }
    return { entries };
  }

  applyPreparedRedeem(
    player: PlayerState,
    prepared: PreparedRedeemCodeOperation,
  ): AccountRedeemCodesRes {
    const results: AccountRedeemCodeResult[] = [];
    const stagedInventory = cloneInventoryItems(player.inventory.items);
    const consumedCodeIds: string[] = [];
    const now = new Date();

    for (const entry of prepared.entries) {
      if (entry.state === 'not_found') {
        results.push({
          code: entry.code,
          ok: false,
          message: '兑换码不存在',
        });
        continue;
      }
      if (entry.state === 'used') {
        results.push({
          code: entry.code,
          ok: false,
          message: '兑换码已被使用',
          groupName: entry.groupName ?? undefined,
        });
        continue;
      }
      if (entry.state === 'destroyed') {
        results.push({
          code: entry.code,
          ok: false,
          message: '兑换码已被销毁',
          groupName: entry.groupName ?? undefined,
        });
        continue;
      }
      if (entry.state === 'invalid_rewards') {
        results.push({
          code: entry.code,
          ok: false,
          message: '兑换码奖励配置无效',
          groupName: entry.groupName ?? undefined,
        });
        continue;
      }

      const items = entry.rewards.map((reward) => this.contentService.createItem(reward.itemId, reward.count));
      if (items.some((item) => item === null)) {
        results.push({
          code: entry.code,
          ok: false,
          message: '兑换码奖励物品不存在',
          groupName: entry.groupName ?? undefined,
        });
        continue;
      }

      const inventorySnapshot = cloneInventoryItems(stagedInventory);
      let inventoryOk = true;
      for (const item of items) {
        if (!item || !this.addItemToInventorySnapshot(inventorySnapshot, player.inventory.capacity, item)) {
          inventoryOk = false;
          break;
        }
      }
      if (!inventoryOk) {
        results.push({
          code: entry.code,
          ok: false,
          message: '背包空间不足',
          groupName: entry.groupName ?? undefined,
          rewards: cloneRewards(entry.rewards),
        });
        continue;
      }

      stagedInventory.splice(0, stagedInventory.length, ...inventorySnapshot);
      if (entry.redeemCodeId) {
        consumedCodeIds.push(entry.redeemCodeId);
      }
      results.push({
        code: entry.code,
        ok: true,
        message: '兑换成功',
        groupName: entry.groupName ?? undefined,
        rewards: cloneRewards(entry.rewards),
      });
    }

    player.inventory.items = stagedInventory;
    if (consumedCodeIds.length > 0) {
      this.playerService.markDirty(player.id, 'inv');
      this.playerService.syncPlayerRealtimeState(player.id);
      this.redeemCodeRepo.createQueryBuilder()
        .update(RedeemCodeEntity)
        .set({
          status: 'used',
          usedByPlayerId: player.id,
          usedByRoleName: player.name,
          usedAt: now,
        })
        .where('id IN (:...ids)', { ids: consumedCodeIds })
        .andWhere('status = :status', { status: 'active' })
        .execute()
        .catch(() => {});
    }

    for (const result of results) {
      if (!result.ok) {
        continue;
      }
      this.playerService.queuePendingLogbookMessage(player.id, {
        id: `redeem:${player.id}:${result.code}`,
        kind: 'grudge',
        text: `兑换成功：${result.groupName ?? result.code}`,
        from: '司命台',
        at: Date.now(),
      });
    }

    const payload = { results };
    const socket = this.playerService.getSocket(player.id);
    socket?.emit(S2C.RedeemCodesResult, {
      result: payload,
    } satisfies S2C_RedeemCodesResult);
    return payload;
  }

  private addItemToInventorySnapshot(
    inventoryItems: PlayerState['inventory']['items'],
    capacity: number,
    item: NonNullable<ReturnType<ContentService['createItem']>>,
  ): boolean {
    const simulatedPlayer = {
      inventory: {
        items: inventoryItems,
        capacity,
      },
    } as PlayerState;
    return this.inventoryService.addItem(simulatedPlayer, { ...item });
  }

  private normalizeRewards(rewards: RedeemCodeGroupRewardItem[]): RedeemCodeGroupRewardItem[] {
    if (!Array.isArray(rewards) || rewards.length === 0) {
      throw new BadRequestException('兑换码分组至少需要一个奖励物品');
    }
    const normalized: RedeemCodeGroupRewardItem[] = [];
    for (const reward of rewards) {
      if (!reward || typeof reward.itemId !== 'string') {
        continue;
      }
      const itemId = reward.itemId.trim();
      const count = Math.max(1, Math.floor(Number(reward.count) || 0));
      if (!itemId || count <= 0) {
        continue;
      }
      const template = this.contentService.getItem(itemId);
      if (!template) {
        throw new BadRequestException(`奖励物品不存在：${itemId}`);
      }
      normalized.push({ itemId, count });
    }
    if (normalized.length === 0) {
      throw new BadRequestException('兑换码分组至少需要一个有效奖励物品');
    }
    return normalized;
  }

  private async requireGroup(groupId: string): Promise<RedeemCodeGroupEntity> {
    const group = await this.redeemCodeGroupRepo.findOne({
      where: { id: groupId },
      relations: ['codes'],
    });
    if (!group) {
      throw new BadRequestException('兑换码分组不存在');
    }
    return group;
  }

  private async createCodes(groupId: string, count: number): Promise<RedeemCodeEntity[]> {
    const created: RedeemCodeEntity[] = [];
    const seenCodes = new Set<string>();
    while (created.length < count) {
      const remaining = count - created.length;
      const batchSize = Math.min(remaining * 2, 128);
      const candidates: string[] = [];
      while (candidates.length < batchSize) {
        const code = generateRedeemCode();
        if (seenCodes.has(code)) {
          continue;
        }
        seenCodes.add(code);
        candidates.push(code);
      }
      const existing = await this.redeemCodeRepo.find({
        where: { code: In(candidates) },
        select: { code: true },
      });
      const existingCodeSet = new Set(existing.map((entry) => entry.code));
      const insertable = candidates
        .filter((code) => !existingCodeSet.has(code))
        .slice(0, remaining)
        .map((code) => this.redeemCodeRepo.create({
          groupId,
          code,
          status: 'active',
          usedByPlayerId: null,
          usedByRoleName: null,
          usedAt: null,
          destroyedAt: null,
        }));
      if (insertable.length === 0) {
        continue;
      }
      const saved = await this.redeemCodeRepo.save(insertable);
      created.push(...saved);
    }
    return created;
  }

  private toGroupView(
    group: RedeemCodeGroupEntity,
    codes?: RedeemCodeEntity[],
  ): RedeemCodeGroupView {
    const codeList = codes ?? group.codes ?? [];
    let usedCodeCount = 0;
    let activeCodeCount = 0;
    for (const code of codeList) {
      if (code.status === 'used') {
        usedCodeCount += 1;
      } else if (code.status === 'active') {
        activeCodeCount += 1;
      }
    }
    return {
      id: group.id,
      name: group.name,
      rewards: cloneRewards(group.rewards),
      totalCodeCount: codeList.length,
      usedCodeCount,
      activeCodeCount,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  private toCodeView(code: RedeemCodeEntity): RedeemCodeCodeView {
    return {
      id: code.id,
      groupId: code.groupId,
      code: code.code,
      status: code.status,
      usedByPlayerId: code.usedByPlayerId,
      usedByRoleName: code.usedByRoleName,
      usedAt: code.usedAt?.toISOString() ?? null,
      destroyedAt: code.destroyedAt?.toISOString() ?? null,
      createdAt: code.createdAt.toISOString(),
      updatedAt: code.updatedAt.toISOString(),
    };
  }
}

/** normalizeGroupName：执行对应的业务逻辑。 */
function normalizeGroupName(name: string): string {
  const normalized = name.normalize('NFC').trim();
  if (!normalized) {
    throw new BadRequestException('兑换码分组名称不能为空');
  }
  if (normalized.length > 120) {
    throw new BadRequestException('兑换码分组名称过长');
  }
  return normalized;
}

/** normalizeCreateCount：执行对应的业务逻辑。 */
function normalizeCreateCount(count: number): number {
  const normalized = Math.max(1, Math.floor(Number(count) || 0));
  if (normalized <= 0) {
    throw new BadRequestException('兑换码数量必须大于 0');
  }
  if (normalized > MAX_GROUP_CREATE_COUNT) {
    throw new BadRequestException(`单次最多生成 ${MAX_GROUP_CREATE_COUNT} 个兑换码`);
  }
  return normalized;
}

/** normalizeSubmittedCodes：执行对应的业务逻辑。 */
function normalizeSubmittedCodes(codes: string[]): string[] {
  if (!Array.isArray(codes)) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
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

/** cloneInventoryItems：执行对应的业务逻辑。 */
function cloneInventoryItems(items: PlayerState['inventory']['items']): PlayerState['inventory']['items'] {
  return items.map((entry) => ({ ...entry }));
}

/** cloneRewards：执行对应的业务逻辑。 */
function cloneRewards(rewards: RedeemCodeGroupRewardItem[]): RedeemCodeGroupRewardItem[] {
  return rewards.map((entry) => ({ ...entry }));
}

/** generateRedeemCode：执行对应的业务逻辑。 */
function generateRedeemCode(): string {
  const bytes = randomBytes(REDEEM_CODE_LENGTH);
  let output = '';
  for (let index = 0; index < REDEEM_CODE_LENGTH; index += 1) {
    output += REDEEM_CODE_ALPHABET[bytes[index] % REDEEM_CODE_ALPHABET.length];
  }
  return output;
}

