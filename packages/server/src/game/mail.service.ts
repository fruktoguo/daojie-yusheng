import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import {
  MAIL_PAGE_SIZE_DEFAULT,
  MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
  MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
  MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
  MailAttachment,
  MailDetailView,
  MailFilter,
  MailPageView,
  MailSummaryView,
  MailTemplateArg,
  PlayerState,
  S2C,
  S2C_MailDetail,
  S2C_MailOpResult,
  S2C_MailSummary,
  buildMailPreviewSnippet,
  createItemStackSignature,
  normalizeMailBatchIds,
  normalizeMailFilter,
  normalizeMailPageSize,
  renderMailBodyPlain,
  renderMailTitlePlain,
} from '@mud/shared';
import { MailAudienceMemberEntity } from '../database/entities/mail-audience-member.entity';
import { MailCampaignEntity } from '../database/entities/mail-campaign.entity';
import { PlayerMailReceiptEntity } from '../database/entities/player-mail-receipt.entity';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { PlayerService } from './player.service';
import {
  DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID,
  HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID,
} from '../constants/gameplay/technique';

interface CreateMailInput {
  templateId?: string | null;
  args?: MailTemplateArg[];
  fallbackTitle?: string | null;
  fallbackBody?: string | null;
  attachments?: MailAttachment[];
  senderLabel?: string;
  startAt?: number | null;
  expireAt?: number | null;
}

interface VisibleMailRecord {
  mailId: string;
  senderLabel: string;
  templateId: string | null;
  args: MailTemplateArg[];
  fallbackTitle: string | null;
  fallbackBody: string | null;
  attachments: MailAttachment[];
  hasAttachments: boolean;
  createdAt: number;
  updatedAt: number;
  expireAt: number | null;
  firstSeenAt: number | null;
  readAt: number | null;
  claimedAt: number | null;
  deletedAt: number | null;
  receiptUpdatedAt: number | null;
}

interface PreparedMailReceiptEntry {
  mailId: string;
  firstSeenAt: number | null;
  readAt: number | null;
  claimedAt: number | null;
  attachments: MailAttachment[];
}

export interface PreparedMarkReadOperation {
  mailIds: string[];
  entries: PreparedMailReceiptEntry[];
}

export interface PreparedDeleteOperation {
  mailIds: string[];
  entries: PreparedMailReceiptEntry[];
}

export interface PreparedClaimOperation {
  mailIds: string[];
  entries: PreparedMailReceiptEntry[];
}

interface MailAggregateRow {
  unreadCount: string | number | null;
  claimableCount: string | number | null;
  revision: string | number | null;
}

interface MailListRawRow {
  campaign_id: string;
  campaign_senderLabel: string;
  campaign_templateId: string | null;
  campaign_args: MailTemplateArg[] | null;
  campaign_fallbackTitle: string | null;
  campaign_fallbackBody: string | null;
  campaign_hasAttachments: boolean;
  campaign_createdAt: string | number;
  campaign_expireAt: string | number | null;
  receipt_readAt: string | number | null;
  receipt_claimedAt: string | number | null;
}

interface MailDetailRawRow extends MailListRawRow {
  campaign_attachments: MailAttachment[] | null;
  campaign_updatedAt: string | number;
  receipt_firstSeenAt: string | number | null;
  receipt_deletedAt: string | number | null;
  receipt_updatedAt: string | number | null;
}

@Injectable()
export class MailService {
  private static readonly WELCOME_TEMPLATE_ID = 'mail.welcome.v1';
  private static readonly BEGINNER_JOURNEY_TEMPLATE_ID = MAIL_TEMPLATE_BEGINNER_JOURNEY_ID;
  private static readonly HEAVEN_ROOT_SEED_TEMPLATE_ID = MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID;
  private static readonly DIVINE_ROOT_SEED_TEMPLATE_ID = MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID;
  private static readonly DEFAULT_SENDER_LABEL = '司命台';
  private static readonly BITTER_CULTIVATION_ELIXIR_ITEM_ID = 'pill.bitter_cultivation_elixir';
  private static readonly BEGINNER_JOURNEY_EQUIPMENT_ITEM_IDS = [
    'equip.starfall_spear',
    'equip.spirit_ring',
    'equip.echo_crystal_crest',
    'equip.rift_guard_armor',
    'equip.rune_robe',
    'equip.dewstep_boots',
    'equip.void_talisman',
    'equip.soul_devour_token',
    'equip.guiding_marrow_pendant',
  ] as const;

  constructor(
    @InjectRepository(MailCampaignEntity)
    private readonly mailCampaignRepo: Repository<MailCampaignEntity>,
    @InjectRepository(MailAudienceMemberEntity)
    private readonly mailAudienceRepo: Repository<MailAudienceMemberEntity>,
    @InjectRepository(PlayerMailReceiptEntity)
    private readonly playerMailReceiptRepo: Repository<PlayerMailReceiptEntity>,
    private readonly playerService: PlayerService,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
  ) {}

  async ensureWelcomeMail(playerId: string): Promise<void> {
    const existing = await this.mailCampaignRepo.createQueryBuilder('campaign')
      .innerJoin(MailAudienceMemberEntity, 'audience', 'audience.mailId = campaign.id AND audience.playerId = :playerId', { playerId })
      .where('campaign.templateId = :templateId', { templateId: MailService.WELCOME_TEMPLATE_ID })
      .getCount();
    if (existing > 0) {
      return;
    }
    await this.createDirectMail(playerId, {
      templateId: MailService.WELCOME_TEMPLATE_ID,
      attachments: [
        { itemId: 'pill.minor_heal', count: 2 },
        { itemId: 'spirit_stone', count: 8 },
      ],
    });
  }

  async createDirectMail(playerId: string, input: CreateMailInput): Promise<string> {
    const campaign = this.buildCampaignEntity('direct', input);
    await this.mailCampaignRepo.save(campaign);
    await this.mailAudienceRepo.save(this.mailAudienceRepo.create({
      mailId: campaign.id,
      playerId,
      createdAt: campaign.createdAt,
    }));
    this.emitSummaryAsync(playerId);
    return campaign.id;
  }

  async createGlobalMail(input: CreateMailInput): Promise<string> {
    const campaign = this.buildCampaignEntity('global', input);
    await this.mailCampaignRepo.save(campaign);
    this.emitSummaryForAllOnlinePlayers();
    return campaign.id;
  }

  async getSummary(playerId: string): Promise<MailSummaryView> {
    const now = Date.now();
    const row = await this.buildVisibleMailQuery(playerId, now)
      .select('COALESCE(SUM(CASE WHEN receipt.readAt IS NULL THEN 1 ELSE 0 END), 0)', 'unreadCount')
      .addSelect('COALESCE(SUM(CASE WHEN campaign.hasAttachments = true AND receipt.claimedAt IS NULL THEN 1 ELSE 0 END), 0)', 'claimableCount')
      .addSelect('COALESCE(MAX(GREATEST(campaign.updatedAt, COALESCE(receipt.updatedAt, 0))), 0)', 'revision')
      .getRawOne<MailAggregateRow>();

    return {
      unreadCount: Number(row?.unreadCount ?? 0),
      claimableCount: Number(row?.claimableCount ?? 0),
      revision: Number(row?.revision ?? 0),
    };
  }

  async getPage(playerId: string, requestedPage: number, requestedPageSize?: number, requestedFilter?: MailFilter): Promise<MailPageView> {
    const pageSize = normalizeMailPageSize(requestedPageSize);
    const filter = normalizeMailFilter(requestedFilter);
    const now = Date.now();
    const baseQuery = this.applyMailFilter(this.buildVisibleMailQuery(playerId, now), filter);
    const total = await baseQuery.clone().getCount();
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage || 1)));
    const rows = await baseQuery
      .clone()
      .select([
        'campaign.id',
        'campaign.senderLabel',
        'campaign.templateId',
        'campaign.args',
        'campaign.fallbackTitle',
        'campaign.fallbackBody',
        'campaign.hasAttachments',
        'campaign.createdAt',
        'campaign.expireAt',
        'receipt.readAt',
        'receipt.claimedAt',
      ])
      .orderBy('campaign.createdAt', 'DESC')
      .addOrderBy('campaign.id', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawMany<MailListRawRow>();

    return {
      items: rows.map((row) => {
        const title = renderMailTitlePlain(
          row.campaign_templateId,
          row.campaign_args ?? [],
          row.campaign_fallbackTitle,
        );
        const body = renderMailBodyPlain(
          row.campaign_templateId,
          row.campaign_args ?? [],
          row.campaign_fallbackBody,
        );
        return {
          mailId: row.campaign_id,
          title,
          summary: buildMailPreviewSnippet(body),
          senderLabel: row.campaign_senderLabel,
          createdAt: Number(row.campaign_createdAt ?? 0),
          expireAt: row.campaign_expireAt == null ? null : Number(row.campaign_expireAt),
          hasAttachments: row.campaign_hasAttachments === true,
          read: row.receipt_readAt != null,
          claimed: row.campaign_hasAttachments !== true || row.receipt_claimedAt != null,
        };
      }),
      total,
      page,
      pageSize,
      totalPages,
      filter,
    };
  }

  async getDetail(playerId: string, mailId: string): Promise<MailDetailView | null> {
    const row = await this.findVisibleMailById(playerId, mailId);
    if (!row) {
      return null;
    }
    return this.toMailDetailView(row);
  }

  async prepareMarkRead(playerId: string, mailIds: string[]): Promise<PreparedMarkReadOperation | null> {
    const normalizedIds = normalizeMailBatchIds(mailIds);
    if (normalizedIds.length === 0) {
      return null;
    }
    const rows = await this.findVisibleMailByIds(playerId, normalizedIds);
    if (rows.length === 0) {
      return null;
    }
    return {
      mailIds: rows.map((row) => row.mailId),
      entries: rows.map((row) => ({
        mailId: row.mailId,
        firstSeenAt: row.firstSeenAt,
        readAt: row.readAt,
        claimedAt: row.claimedAt,
        attachments: row.attachments,
      })),
    };
  }

  async prepareDelete(playerId: string, mailIds: string[]): Promise<{ error?: string; operation?: PreparedDeleteOperation }> {
    const normalizedIds = normalizeMailBatchIds(mailIds);
    if (normalizedIds.length === 0) {
      return { error: '未选择要删除的邮件。' };
    }
    const rows = await this.findVisibleMailByIds(playerId, normalizedIds);
    if (rows.length === 0) {
      return { error: '目标邮件不存在、已过期，或已被删除。' };
    }
    const unclaimed = rows.find((row) => row.hasAttachments && row.claimedAt == null);
    if (unclaimed) {
      return { error: '仍有未领取附件的邮件，不能直接删除。' };
    }
    return {
      operation: {
        mailIds: rows.map((row) => row.mailId),
        entries: rows.map((row) => ({
          mailId: row.mailId,
          firstSeenAt: row.firstSeenAt,
          readAt: row.readAt,
          claimedAt: row.claimedAt,
          attachments: row.attachments,
        })),
      },
    };
  }

  async prepareClaim(playerId: string, mailIds: string[]): Promise<{ error?: string; operation?: PreparedClaimOperation }> {
    const normalizedIds = normalizeMailBatchIds(mailIds);
    if (normalizedIds.length === 0) {
      return { error: '未选择要领取附件的邮件。' };
    }
    const rows = await this.findVisibleMailByIds(playerId, normalizedIds);
    const claimable = rows.filter((row) => row.hasAttachments && row.claimedAt == null && row.attachments.length > 0);
    if (claimable.length === 0) {
      return { error: '当前没有可领取附件的邮件。' };
    }
    return {
      operation: {
        mailIds: claimable.map((row) => row.mailId),
        entries: claimable.map((row) => ({
          mailId: row.mailId,
          firstSeenAt: row.firstSeenAt,
          readAt: row.readAt,
          claimedAt: row.claimedAt,
          attachments: row.attachments,
        })),
      },
    };
  }

  applyPreparedMarkRead(playerId: string, prepared: PreparedMarkReadOperation): void {
    const now = Date.now();
    const rows = prepared.entries.map((entry) => this.playerMailReceiptRepo.create({
      mailId: entry.mailId,
      playerId,
      firstSeenAt: entry.firstSeenAt ?? now,
      readAt: entry.readAt ?? now,
      claimedAt: entry.claimedAt,
      deletedAt: null,
      updatedAt: now,
    }));
    this.persistReceiptRows(rows);
    this.emitSummaryAsync(playerId);
    this.emitOpResult(playerId, {
      operation: 'markRead',
      ok: true,
      mailIds: prepared.mailIds,
    });
  }

  applyPreparedDelete(playerId: string, prepared: PreparedDeleteOperation): void {
    const now = Date.now();
    const rows = prepared.entries.map((entry) => this.playerMailReceiptRepo.create({
      mailId: entry.mailId,
      playerId,
      firstSeenAt: entry.firstSeenAt,
      readAt: entry.readAt,
      claimedAt: entry.claimedAt,
      deletedAt: now,
      updatedAt: now,
    }));
    this.persistReceiptRows(rows);
    this.emitSummaryAsync(playerId);
    this.emitOpResult(playerId, {
      operation: 'delete',
      ok: true,
      mailIds: prepared.mailIds,
    });
  }

  applyPreparedClaim(player: PlayerState, prepared: PreparedClaimOperation): { ok: boolean; message?: string } {
    const resolvedItems = prepared.entries.flatMap((entry) => entry.attachments.map((attachment) => {
      const item = this.contentService.createItem(attachment.itemId, attachment.count);
      return item ? { attachment, item } : null;
    }));
    if (resolvedItems.some((entry) => entry === null)) {
      const message = '邮件附件包含无效物品，暂时无法领取。';
      this.emitOpResult(player.id, {
        operation: 'claim',
        ok: false,
        mailIds: prepared.mailIds,
        message,
      });
      return { ok: false, message };
    }

    const items = resolvedItems
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => entry.item);

    const nextInventoryItems = this.buildInventoryAfterAttachments(player, items);
    if (!nextInventoryItems) {
      const message = '背包空间不足，无法领取全部附件。';
      this.emitOpResult(player.id, {
        operation: 'claim',
        ok: false,
        mailIds: prepared.mailIds,
        message,
      });
      return { ok: false, message };
    }

    player.inventory.items = nextInventoryItems;
    const now = Date.now();
    const rows = prepared.entries.map((entry) => this.playerMailReceiptRepo.create({
      mailId: entry.mailId,
      playerId: player.id,
      firstSeenAt: entry.firstSeenAt ?? now,
      readAt: entry.readAt ?? now,
      claimedAt: now,
      deletedAt: null,
      updatedAt: now,
    }));
    this.persistReceiptRows(rows);
    this.playerService.syncPlayerRealtimeState(player.id);
    this.emitSummaryAsync(player.id);
    this.emitOpResult(player.id, {
      operation: 'claim',
      ok: true,
      mailIds: prepared.mailIds,
      message: `已领取 ${prepared.mailIds.length} 封邮件的附件。`,
    });
    return { ok: true };
  }

  async emitSummary(playerId: string): Promise<void> {
    const socket = this.playerService.getSocket(playerId);
    if (!socket) {
      return;
    }
    socket.emit(S2C.MailSummary, {
      summary: await this.getSummary(playerId),
    } satisfies S2C_MailSummary);
  }

  private emitSummaryAsync(playerId: string): void {
    this.emitSummary(playerId).catch(() => {});
  }

  private emitSummaryForAllOnlinePlayers(): void {
    for (const player of this.playerService.getAllPlayers()) {
      if (player.isBot || player.inWorld === false) {
        continue;
      }
      this.emitSummaryAsync(player.id);
    }
  }

  private emitOpResult(playerId: string, result: S2C_MailOpResult): void {
    const socket = this.playerService.getSocket(playerId);
    socket?.emit(S2C.MailOpResult, result);
  }

  private buildCampaignEntity(scope: 'global' | 'direct', input: CreateMailInput): MailCampaignEntity {
    const now = Date.now();
    const attachments = this.normalizeAttachments(this.buildTemplateAttachments(input.templateId, input.attachments));
    return this.mailCampaignRepo.create({
      id: randomUUID(),
      scope,
      status: 'active',
      templateId: input.templateId?.trim() || null,
      args: this.normalizeArgs(input.args),
      fallbackTitle: input.fallbackTitle?.trim() || null,
      fallbackBody: input.fallbackBody?.trim() || null,
      senderLabel: input.senderLabel?.trim() || MailService.DEFAULT_SENDER_LABEL,
      attachments,
      hasAttachments: attachments.length > 0,
      createdAt: now,
      updatedAt: now,
      startAt: input.startAt ?? null,
      expireAt: input.expireAt ?? null,
    });
  }

  private buildTemplateAttachments(
    templateId: string | null | undefined,
    attachments: MailAttachment[] | undefined,
  ): MailAttachment[] | undefined {
    const normalizedTemplateId = templateId?.trim();
    const presetAttachments = normalizedTemplateId === MailService.BEGINNER_JOURNEY_TEMPLATE_ID
      ? this.buildBeginnerJourneyAttachments()
      : normalizedTemplateId === MailService.HEAVEN_ROOT_SEED_TEMPLATE_ID
        ? [{ itemId: HEAVEN_SPIRITUAL_ROOT_SEED_ITEM_ID, count: 1 }]
        : normalizedTemplateId === MailService.DIVINE_ROOT_SEED_TEMPLATE_ID
          ? [{ itemId: DIVINE_SPIRITUAL_ROOT_SEED_ITEM_ID, count: 1 }]
          : [];
    if (presetAttachments.length === 0) {
      return attachments;
    }
    return Array.isArray(attachments) && attachments.length > 0
      ? [...presetAttachments, ...attachments]
      : presetAttachments;
  }

  private buildBeginnerJourneyAttachments(): MailAttachment[] {
    const catalog = this.contentService.getEditorItemCatalog();
    const attachments: MailAttachment[] = [];
    const seen = new Set<string>();
    for (const itemId of MailService.BEGINNER_JOURNEY_EQUIPMENT_ITEM_IDS) {
      const item = catalog.find((entry) => entry.itemId === itemId);
      if (!item || seen.has(item.itemId)) {
        continue;
      }
      attachments.push({ itemId: item.itemId, count: 1 });
      seen.add(item.itemId);
    }
    for (const item of catalog) {
      if (item.type !== 'skill_book' || seen.has(item.itemId) || this.isDivineTechniqueBook(item.itemId)) {
        continue;
      }
      attachments.push({ itemId: item.itemId, count: 1 });
      seen.add(item.itemId);
    }
    attachments.push({
      itemId: MailService.BITTER_CULTIVATION_ELIXIR_ITEM_ID,
      count: 5,
    });
    return attachments;
  }

  private isDivineTechniqueBook(itemId: string): boolean {
    const techniqueId = this.contentService.getItem(itemId)?.learnTechniqueId
      ?? this.resolveTechniqueIdFromBookItemId(itemId);
    if (!techniqueId) {
      return false;
    }
    return this.contentService.getTechnique(techniqueId)?.category === 'divine';
  }

  private resolveTechniqueIdFromBookItemId(itemId: string): string | null {
    if (itemId.startsWith('book.')) {
      return itemId.slice(5);
    }
    if (itemId.startsWith('book_')) {
      return itemId.slice(5);
    }
    return null;
  }

  private normalizeArgs(args: MailTemplateArg[] | undefined): MailTemplateArg[] {
    if (!Array.isArray(args)) {
      return [];
    }
    const normalized: MailTemplateArg[] = [];
    for (const entry of args) {
      if (!entry || typeof entry !== 'object' || typeof entry.kind !== 'string') {
        continue;
      }
      if (entry.kind === 'text') {
        normalized.push({ kind: 'text', value: String(entry.value ?? '') });
        continue;
      }
      if (entry.kind === 'number') {
        normalized.push({ kind: 'number', value: Number(entry.value ?? 0) });
        continue;
      }
      if (entry.kind === 'item' && typeof entry.itemId === 'string' && entry.itemId.trim()) {
        normalized.push({
          kind: 'item',
          itemId: entry.itemId.trim(),
          label: typeof entry.label === 'string' ? entry.label : undefined,
          count: Number.isFinite(entry.count) ? Math.max(1, Math.floor(Number(entry.count))) : undefined,
        });
      }
    }
    return normalized;
  }

  private normalizeAttachments(attachments: MailAttachment[] | undefined): MailAttachment[] {
    if (!Array.isArray(attachments)) {
      return [];
    }
    const normalized: MailAttachment[] = [];
    for (const attachment of attachments) {
      if (!attachment || typeof attachment.itemId !== 'string') {
        continue;
      }
      const itemId = attachment.itemId.trim();
      const count = Number.isFinite(attachment.count) ? Math.max(1, Math.floor(Number(attachment.count))) : 0;
      if (!itemId || count <= 0) {
        continue;
      }
      normalized.push({ itemId, count });
    }
    return normalized;
  }

  private buildVisibleMailQuery(playerId: string, now: number): SelectQueryBuilder<MailCampaignEntity> {
    return this.mailCampaignRepo.createQueryBuilder('campaign')
      .leftJoin(MailAudienceMemberEntity, 'audience', 'audience.mailId = campaign.id AND audience.playerId = :playerId', { playerId })
      .leftJoin(PlayerMailReceiptEntity, 'receipt', 'receipt.mailId = campaign.id AND receipt.playerId = :playerId', { playerId })
      .where('campaign.status = :status', { status: 'active' })
      .andWhere('(campaign.startAt IS NULL OR campaign.startAt <= :now)', { now })
      .andWhere('(campaign.expireAt IS NULL OR campaign.expireAt > :now)', { now })
      .andWhere('(campaign.scope = :globalScope OR audience.playerId IS NOT NULL)', { globalScope: 'global' })
      .andWhere('receipt.deletedAt IS NULL');
  }

  private applyMailFilter(query: SelectQueryBuilder<MailCampaignEntity>, filter: MailFilter): SelectQueryBuilder<MailCampaignEntity> {
    if (filter === 'unread') {
      return query.andWhere('receipt.readAt IS NULL');
    }
    if (filter === 'claimable') {
      return query
        .andWhere('campaign.hasAttachments = true')
        .andWhere('receipt.claimedAt IS NULL');
    }
    return query;
  }

  private async findVisibleMailById(playerId: string, mailId: string): Promise<VisibleMailRecord | null> {
    const rows = await this.buildVisibleMailQuery(playerId, Date.now())
      .andWhere('campaign.id = :mailId', { mailId })
      .select([
        'campaign.id',
        'campaign.senderLabel',
        'campaign.templateId',
        'campaign.args',
        'campaign.fallbackTitle',
        'campaign.fallbackBody',
        'campaign.attachments',
        'campaign.hasAttachments',
        'campaign.createdAt',
        'campaign.updatedAt',
        'campaign.expireAt',
        'receipt.firstSeenAt',
        'receipt.readAt',
        'receipt.claimedAt',
        'receipt.deletedAt',
        'receipt.updatedAt',
      ])
      .limit(1)
      .getRawMany<MailDetailRawRow>();
    return rows.length > 0 ? this.toVisibleMailRecord(rows[0]) : null;
  }

  private async findVisibleMailByIds(playerId: string, mailIds: string[]): Promise<VisibleMailRecord[]> {
    if (mailIds.length === 0) {
      return [];
    }
    const rows = await this.buildVisibleMailQuery(playerId, Date.now())
      .andWhere('campaign.id IN (:...mailIds)', { mailIds })
      .select([
        'campaign.id',
        'campaign.senderLabel',
        'campaign.templateId',
        'campaign.args',
        'campaign.fallbackTitle',
        'campaign.fallbackBody',
        'campaign.attachments',
        'campaign.hasAttachments',
        'campaign.createdAt',
        'campaign.updatedAt',
        'campaign.expireAt',
        'receipt.firstSeenAt',
        'receipt.readAt',
        'receipt.claimedAt',
        'receipt.deletedAt',
        'receipt.updatedAt',
      ])
      .orderBy('campaign.createdAt', 'DESC')
      .getRawMany<MailDetailRawRow>();
    const byId = new Map(rows.map((row) => {
      const record = this.toVisibleMailRecord(row);
      return [record.mailId, record] as const;
    }));
    return mailIds
      .map((mailId) => byId.get(mailId) ?? null)
      .filter((record): record is VisibleMailRecord => record !== null);
  }

  private toMailDetailView(row: VisibleMailRecord): MailDetailView {
    const attachments = row.attachments.map((attachment) => ({ ...attachment }));
    return {
      mailId: row.mailId,
      senderLabel: row.senderLabel,
      createdAt: row.createdAt,
      expireAt: row.expireAt,
      templateId: row.templateId,
      args: row.args.map((entry) => ({ ...entry })),
      fallbackTitle: row.fallbackTitle,
      fallbackBody: row.fallbackBody,
      attachments,
      read: row.readAt != null,
      claimed: !row.hasAttachments || row.claimedAt != null,
      deletable: !row.hasAttachments || row.claimedAt != null,
    };
  }

  private toVisibleMailRecord(row: MailDetailRawRow): VisibleMailRecord {
    return {
      mailId: row.campaign_id,
      senderLabel: row.campaign_senderLabel,
      templateId: row.campaign_templateId,
      args: Array.isArray(row.campaign_args) ? row.campaign_args : [],
      fallbackTitle: row.campaign_fallbackTitle,
      fallbackBody: row.campaign_fallbackBody,
      attachments: Array.isArray(row.campaign_attachments) ? row.campaign_attachments : [],
      hasAttachments: row.campaign_hasAttachments === true,
      createdAt: Number(row.campaign_createdAt ?? 0),
      updatedAt: Number(row.campaign_updatedAt ?? 0),
      expireAt: row.campaign_expireAt == null ? null : Number(row.campaign_expireAt),
      firstSeenAt: row.receipt_firstSeenAt == null ? null : Number(row.receipt_firstSeenAt),
      readAt: row.receipt_readAt == null ? null : Number(row.receipt_readAt),
      claimedAt: row.receipt_claimedAt == null ? null : Number(row.receipt_claimedAt),
      deletedAt: row.receipt_deletedAt == null ? null : Number(row.receipt_deletedAt),
      receiptUpdatedAt: row.receipt_updatedAt == null ? null : Number(row.receipt_updatedAt),
    };
  }

  private persistReceiptRows(rows: PlayerMailReceiptEntity[]): void {
    if (rows.length === 0) {
      return;
    }
    this.playerMailReceiptRepo.upsert(rows, ['mailId', 'playerId']).catch(() => {});
  }

  private buildInventoryAfterAttachments(player: PlayerState, items: NonNullable<ReturnType<ContentService['createItem']>>[]): PlayerState['inventory']['items'] | null {
    const nextItems = player.inventory.items.map((entry) => ({ ...entry }));
    const signatureIndex = new Map<string, number>();
    for (let index = 0; index < nextItems.length; index += 1) {
      signatureIndex.set(createItemStackSignature(nextItems[index]), index);
    }
    let nextSize = nextItems.length;
    for (const item of items) {
      const signature = createItemStackSignature(item);
      const existingIndex = signatureIndex.get(signature);
      if (existingIndex !== undefined) {
        nextItems[existingIndex].count += item.count;
        continue;
      }
      if (nextSize >= player.inventory.capacity) {
        return null;
      }
      signatureIndex.set(signature, nextItems.length);
      nextItems.push({ ...item });
      nextSize += 1;
    }
    return nextItems;
  }
}
