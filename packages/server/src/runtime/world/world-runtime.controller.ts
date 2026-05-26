/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { MapPersistenceFlushService } from '../../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { clearAuthTrace, readAuthTrace } from '../../network/world-player-token.service';
import { MailRuntimeService } from '../mail/mail-runtime.service';
import { MarketRuntimeService } from '../market/market-runtime.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { RuntimeEventBusMetricsService } from '../event-bus/runtime-event-bus-metrics.service';
import { RuntimeHttpAccessGuard } from './runtime-http-access.guard';
import { WorldRuntimeService } from './world-runtime.service';

@Controller('runtime')
@UseGuards(new RuntimeHttpAccessGuard())
export class WorldRuntimeController {
/**
 * worldRuntimeService：世界运行态服务引用。
 */

    worldRuntimeService;    
    /**
 * mailRuntimeService：邮件运行态服务引用。
 */

    mailRuntimeService;    
    /**
 * marketRuntimeService：坊市运行态服务引用。
 */

    marketRuntimeService;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * playerPersistenceFlushService：玩家PersistenceFlush服务引用。
 */

    playerPersistenceFlushService;    
    /**
 * mapPersistenceFlushService：地图PersistenceFlush服务引用。
 */

    mapPersistenceFlushService;    
    /**
 * durableOperationService：强持久化事务服务引用。
 */

    durableOperationService;
    runtimeEventBusMetricsService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeService 参数说明。
 * @param mailRuntimeService 参数说明。
 * @param marketRuntimeService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param playerPersistenceFlushService 参数说明。
 * @param mapPersistenceFlushService 参数说明。
 * @param durableOperationService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(@Inject(WorldRuntimeService) worldRuntimeService, @Inject(MailRuntimeService) mailRuntimeService, @Inject(MarketRuntimeService) marketRuntimeService, @Inject(PlayerRuntimeService) playerRuntimeService, @Inject(PlayerPersistenceFlushService) playerPersistenceFlushService, @Inject(MapPersistenceFlushService) mapPersistenceFlushService, @Inject(DurableOperationService) durableOperationService, @Inject(RuntimeEventBusMetricsService) runtimeEventBusMetricsService) {
        this.worldRuntimeService = worldRuntimeService;
        this.mailRuntimeService = mailRuntimeService;
        this.marketRuntimeService = marketRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
        this.mapPersistenceFlushService = mapPersistenceFlushService;
        this.durableOperationService = durableOperationService;
        this.runtimeEventBusMetricsService = runtimeEventBusMetricsService;
    }
    onModuleInit() {
        if (typeof this.playerPersistenceFlushService?.setLeaseGuard === 'function') {
            this.playerPersistenceFlushService.setLeaseGuard({
                isPlayerPersistenceWritable: (playerId) => {
                    const location = this.worldRuntimeService.worldRuntimePlayerLocationService.getPlayerLocation(playerId);
                    if (!location) {
                        return true;
                    }
                    const instance = this.worldRuntimeService.getInstance(location.instanceId);
                    return instance ? this.worldRuntimeService.isInstanceLeaseWritable(instance) : true;
                },
            });
        }
    }
    /** getSummary：读取世界运行时摘要。 */
    @Get('summary')
    getSummary() {
        return this.worldRuntimeService.getRuntimeSummary();
    }
    /** getEventBusMetrics：读取运行时事件总线内存指标。 */
    @Get('event-bus/metrics')
    getEventBusMetrics() {
        return {
            metrics: this.runtimeEventBusMetricsService.getMetrics(),
        };
    }
    /** getTemplates：读取地图模板列表。 */
    @Get('templates')
    getTemplates() {
        return {
            templates: this.worldRuntimeService.listMapTemplates(),
        };
    }
    /** getInstances：读取实例列表。 */
    @Get('instances')
    getInstances() {
        return {
            instances: this.worldRuntimeService.listInstances(),
        };
    }
    /** getInstance：读取指定实例。 */
    @Get('instances/:instanceId')
    getInstance(@Param('instanceId') instanceId) {
        return {
            instance: this.worldRuntimeService.getInstance(instanceId),
        };
    }
    /** getInstanceMonsters：读取实例中的妖兽列表。 */
    @Get('instances/:instanceId/monsters')
    getInstanceMonsters(@Param('instanceId') instanceId) {
        return {
            monsters: this.worldRuntimeService.listInstanceMonsters(instanceId),
        };
    }
    /** getInstanceMonster：读取实例中的单只妖兽。 */
    @Get('instances/:instanceId/monsters/:runtimeId')
    getInstanceMonster(@Param('instanceId') instanceId, @Param('runtimeId') runtimeId) {
        return {
            monster: this.worldRuntimeService.getInstanceMonster(instanceId, runtimeId),
        };
    }
    /** getInstanceTileState：读取实例地块状态。 */
    @Get('instances/:instanceId/tiles/:x/:y')
    getInstanceTileState(@Param('instanceId') instanceId, @Param('x') x, @Param('y') y) {

        const parsedX = Number(x);

        const parsedY = Number(y);
        return {
            tile: this.worldRuntimeService.getInstanceTileState(instanceId, Number.isFinite(parsedX) ? Math.trunc(parsedX) : Number.NaN, Number.isFinite(parsedY) ? Math.trunc(parsedY) : Number.NaN),
        };
    }
    /** spawnMonsterLoot：生成妖兽战利品。 */
    @Post('instances/:instanceId/spawn-monster-loot')
    spawnMonsterLoot(@Param('instanceId') instanceId, @Body() body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSpawnMonsterLoot(instanceId, body.monsterId ?? '', Number.isFinite(body.x) ? Number(body.x) : Number.NaN, Number.isFinite(body.y) ? Number(body.y) : Number.NaN, Number.isFinite(body.rolls) ? Number(body.rolls) : undefined, this.worldRuntimeService);
    }
    /** defeatMonster：直接结算一只妖兽被击败后的占用释放。 */
    @Post('instances/:instanceId/monsters/:runtimeId/defeat')
    defeatMonster(@Param('instanceId') instanceId, @Param('runtimeId') runtimeId, @Body() _body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDefeatMonster(instanceId, runtimeId, this.worldRuntimeService);
    }
    /** damageMonster：伤害妖兽。 */
    @Post('instances/:instanceId/monsters/:runtimeId/damage')
    damageMonster(@Param('instanceId') instanceId, @Param('runtimeId') runtimeId, @Body() body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDamageMonster(instanceId, runtimeId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN, this.worldRuntimeService);
    }
    /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
    @Post('players/connect')
    async connectPlayer(@Body() body) {
        const view = this.worldRuntimeService.worldRuntimePlayerSessionService.connectPlayer({
            playerId: body.playerId ?? '',
            sessionId: body.sessionId,
            instanceId: body.instanceId,
            mapId: body.mapId,
            preferredX: body.preferredX,
            preferredY: body.preferredY,
        }, this.worldRuntimeService);
        const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
        if (playerId) {
            await this.playerPersistenceFlushService.flushPlayer(playerId);
        }
        return view;
    }
    /** removePlayer：注销玩家运行态，先清会话再断开实例。 */
    @Delete('players/:playerId')
    removePlayer(@Param('playerId') playerId) {
        return {
            ok: this.worldRuntimeService.worldRuntimePlayerSessionService.removePlayer(playerId, 'removed', this.worldRuntimeService),
        };
    }
    /** movePlayer：移动玩家。 */
    @Post('players/:playerId/move')
    movePlayer(@Param('playerId') playerId, @Body() body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueMove(playerId, body.direction ?? '', this.worldRuntimeService);
    }
    /** useAction：使用动作。 */
    @Post('players/:playerId/use-action')
    useAction(@Param('playerId') playerId, @Body() body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.executeAction(playerId, body.actionId ?? '', undefined, this.worldRuntimeService);
    }
    /** usePortal：把当前站位的传送请求排入下一次 tick。 */
    @Post('players/:playerId/portal')
    usePortal(@Param('playerId') playerId) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.usePortal(playerId, this.worldRuntimeService);
    }
    /** getPlayerView：读取玩家当前视野快照，并补上 NPC 任务标记。 */
    @Get('players/:playerId/view')
    getPlayerView(@Param('playerId') playerId, @Query('radius') radius) {

        const parsedRadius = radius !== undefined ? Number(radius) : undefined;

        const normalizedRadius = typeof parsedRadius === 'number' && Number.isFinite(parsedRadius)
            ? Math.max(1, Math.trunc(parsedRadius))
            : undefined;
        return {
            view: this.worldRuntimeService.getPlayerView(playerId, normalizedRadius),
        };
    }
    /** getPlayerDetail：读取玩家视野内目标的详情。 */
    @Get('players/:playerId/detail')
    getPlayerDetail(@Param('playerId') playerId, @Query() query) {
        return this.worldRuntimeService.buildDetail(playerId, {
            kind: query.kind ?? 'npc',
            id: query.id ?? '',
        });
    }
    /** getPlayerTileDetail：读取玩家指定地块的详情。 */
    @Get('players/:playerId/tile-detail')
    getPlayerTileDetail(@Param('playerId') playerId, @Query() query) {

        const x = query.x !== undefined ? Number(query.x) : Number.NaN;

        const y = query.y !== undefined ? Number(query.y) : Number.NaN;
        return this.worldRuntimeService.buildTileDetail(playerId, { x, y });
    }
    /** getPlayerState：读取玩家运行态快照。 */
    @Get('players/:playerId/state')
    getPlayerState(@Param('playerId') playerId) {
        return {
            player: this.playerRuntimeService.snapshot(playerId),
        };
    }
    /** getAuthTrace：读取最近一次鉴权追踪。 */
    @Get('auth-trace')
    getAuthTrace() {
        return {
            trace: readAuthTrace(),
        };
    }
    /** clearAuthTrace：清空鉴权追踪缓存。 */
    @Delete('auth-trace')
    clearAuthTrace() {
        /** return：return。 */
        return clearAuthTrace();
    }
    /** queuePendingLogbookMessage：把日志本消息排入玩家运行态队列。 */
    @Post('players/:playerId/pending-logbook')
    queuePendingLogbookMessage(@Param('playerId') playerId, @Body() body) {
        return {
            player: this.playerRuntimeService.queuePendingLogbookMessage(playerId, {
                id: body?.id,
                kind: body?.kind,
                text: body?.text,
                from: body?.from,
                at: Number.isFinite(body?.at) ? Number(body.at) : Date.now(),
            }),
        };
    }
    /** getNpcShop：读取 NPC 商店视图。 */
    @Get('players/:playerId/npc-shop/:npcId')
    getNpcShop(@Param('playerId') playerId, @Param('npcId') npcId) {
        return this.worldRuntimeService.buildNpcShopView(playerId, npcId);
    }
    /** getQuests：读取玩家任务列表。 */
    @Get('players/:playerId/quests')
    getQuests(@Param('playerId') playerId) {
        return this.worldRuntimeService.buildQuestListView(playerId);
    }
    /** getMailSummary：读取邮件摘要。 */
    @Get('players/:playerId/mail/summary')
    async getMailSummary(@Param('playerId') playerId) {
        return {
            summary: await this.mailRuntimeService.getSummary(playerId),
        };
    }
    /** getMailPage：读取邮件分页。 */
    @Get('players/:playerId/mail/page')
    async getMailPage(@Param('playerId') playerId, @Query() query) {

        const page = Number(query.page);

        const pageSize = Number(query.pageSize);
        return {
            page: await this.mailRuntimeService.getPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1, Number.isFinite(pageSize) ? Math.trunc(pageSize) : undefined, query.filter),
        };
    }
    /** getMailDetail：读取邮件详情。 */
    @Get('players/:playerId/mail/:mailId')
    async getMailDetail(@Param('playerId') playerId, @Param('mailId') mailId) {
        return {
            detail: await this.mailRuntimeService.getDetail(playerId, mailId),
        };
    }
    /** flushPersistence：强制刷新玩家与地图的持久化缓存。 */
    @Post('persistence/flush')
    async flushPersistence() {
        await this.playerPersistenceFlushService.flushAllNow();
        await this.mapPersistenceFlushService.flushAllNow();
        return {
            ok: true,
        };
    }
    /** getNpcQuests：读取 NPC 任务列表。 */
    @Get('players/:playerId/npc-quests/:npcId')
    getNpcQuests(@Param('playerId') playerId, @Param('npcId') npcId) {
        return this.worldRuntimeService.buildNpcQuestsView(playerId, npcId);
    }
    /** getMarket：读取市场行情。 */
    @Get('players/:playerId/market')
    async getMarket(@Param('playerId') playerId) {
        await this.marketRuntimeService.ensureStorageHydrated(playerId);
        return this.marketRuntimeService.buildMarketUpdate(playerId);
    }
    /** getMarketItemBook：读取市场物品书。 */
    @Get('players/:playerId/market/item-book')
    getMarketItemBook(@Param('playerId') _playerId, @Query() query) {
        return this.marketRuntimeService.buildItemBook(query.itemKey ?? '');
    }
    /** getMarketTradeHistory：读取市场交易历史。 */
    @Get('players/:playerId/market/trade-history')
    getMarketTradeHistory(@Param('playerId') playerId, @Query() query) {

        const page = Number(query.page);
        const source = query.source === 'auction' ? 'auction' : 'market';
        const scope = source === 'auction' && query.scope === 'all' ? 'all' : 'mine';
        return this.marketRuntimeService.buildTradeHistoryPage(playerId, Number.isFinite(page) ? Math.trunc(page) : 1, source, scope);
    }
    /** updateVitals：同步玩家基础状态。 */
    @Post('players/:playerId/vitals')
    updateVitals(@Param('playerId') playerId, @Body() body) {
        return {
            player: this.playerRuntimeService.setVitals(playerId, body),
        };
    }
    /** damagePlayer：把玩家受伤请求交给世界运行时排队处理。 */
    @Post('players/:playerId/damage')
    damagePlayer(@Param('playerId') playerId, @Body() body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDamagePlayer(playerId, Number.isFinite(body.amount) ? Number(body.amount) : Number.NaN, this.worldRuntimeService);
    }
    /** respawnPlayer：把玩家复生请求交给世界运行时处理。 */
    @Post('players/:playerId/respawn')
    respawnPlayer(@Param('playerId') playerId, @Body() _body) {
        return this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueRespawnPlayer(playerId, this.worldRuntimeService);
    }
    /** grantItem：直接给玩家发放物品并同步运行态。 */
    @Post('players/:playerId/grant-item')
    async grantItem(@Param('playerId') playerId, @Body() body) {
        return {
            player: await this.applyDurableInventoryGrant(playerId, body),
        };
    }
    /** useItem：提交使用物品请求，由世界运行时处理消耗和效果。 */
    @Post('players/:playerId/use-item')
    useItem(@Param('playerId') playerId, @Body() body) {
        const payload = body && typeof body === 'object' ? body : {};
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUseItem(playerId, payload, this.worldRuntimeService),
        };
    }
    /** dropItem：提交丢弃物品请求，落地逻辑由实例侧执行。 */
    @Post('players/:playerId/drop-item')
    dropItem(@Param('playerId') playerId, @Body() body) {
        const payload = body && typeof body === 'object' ? body : {};
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDropItem(playerId, payload, Number.isFinite(payload.count) ? Number(payload.count) : undefined, this.worldRuntimeService),
        };
    }
    /** takeGround：提交拾取地面或容器物品的请求。 */
    @Post('players/:playerId/take-ground')
    takeGround(@Param('playerId') playerId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueTakeGround(playerId, body.sourceId ?? '', body.itemKey ?? '', this.worldRuntimeService),
        };
    }
    /** equipItem：提交装备请求。 */
    @Post('players/:playerId/equip')
    equipItem(@Param('playerId') playerId, @Body() body) {
        const payload = body && typeof body === 'object' ? body : {};
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueEquip(playerId, payload, this.worldRuntimeService),
        };
    }
    /** unequipItem：提交卸下装备请求。 */
    @Post('players/:playerId/unequip')
    unequipItem(@Param('playerId') playerId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUnequip(playerId, String(body.slot ?? ''), this.worldRuntimeService),
        };
    }
    /** cultivateTechnique：切换或开始修炼指定功法。 */
    @Post('players/:playerId/cultivate')
    cultivateTechnique(@Param('playerId') playerId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCultivate(playerId, body.techniqueId ?? null, this.worldRuntimeService),
        };
    }
    /** castSkill：提交技能释放请求。 */
    @Post('players/:playerId/cast-skill')
    castSkill(@Param('playerId') playerId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCastSkill(playerId, body.skillId ?? '', body.targetPlayerId ?? '', body.targetMonsterId ?? '', null, this.worldRuntimeService),
        };
    }
    /** buyNpcShopItem：提交 NPC 商店购买请求。 */
    @Post('players/:playerId/npc-shop/:npcId/buy')
    buyNpcShopItem(@Param('playerId') playerId, @Param('npcId') npcId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueBuyNpcShopItem(playerId, npcId, body.itemId ?? '', Number.isFinite(body.quantity) ? Number(body.quantity) : undefined, this.worldRuntimeService),
        };
    }
    /** acceptNpcQuest：提交接取 NPC 任务请求。 */
    @Post('players/:playerId/npc-quests/:npcId/accept')
    acceptNpcQuest(@Param('playerId') playerId, @Param('npcId') npcId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueAcceptNpcQuest(playerId, npcId, body.questId ?? '', this.worldRuntimeService),
        };
    }
    /** submitNpcQuest：提交完成 NPC 任务请求。 */
    @Post('players/:playerId/npc-quests/:npcId/submit')
    submitNpcQuest(@Param('playerId') playerId, @Param('npcId') npcId, @Body() body) {
        return {
            queued: true,
            view: this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSubmitNpcQuest(playerId, npcId, body.questId ?? '', this.worldRuntimeService),
        };
    }
    /** markMailRead：标记邮件为已读。 */
    @Post('players/:playerId/mail/mark-read')
    async markMailRead(@Param('playerId') playerId, @Body() body) {
        return this.mailRuntimeService.markRead(playerId, body.mailIds ?? []);
    }
    /** claimMailAttachments：领取邮件附件。 */
    @Post('players/:playerId/mail/claim')
    async claimMailAttachments(@Param('playerId') playerId, @Body() body) {
        return this.mailRuntimeService.claimAttachments(playerId, body.mailIds ?? []);
    }
    /** deleteMail：删除邮件。 */
    @Post('players/:playerId/mail/delete')
    async deleteMail(@Param('playerId') playerId, @Body() body) {
        return this.mailRuntimeService.deleteMails(playerId, body.mailIds ?? []);
    }
    /** createDirectMail：创建直达邮件。 */
    @Post('players/:playerId/mail/direct')
    async createDirectMail(@Param('playerId') playerId, @Body() body) {
        return {
            mailId: await this.mailRuntimeService.createDirectMail(playerId, {
                templateId: body.templateId,
                fallbackTitle: body.fallbackTitle,
                fallbackBody: body.fallbackBody,
                senderLabel: body.senderLabel,
                expireAt: Number.isFinite(body.expireAt) ? Number(body.expireAt) : null,
                attachments: Array.isArray(body.attachments)
                    ? body.attachments
                        .filter((entry) => typeof entry?.itemId === 'string' && entry.itemId.trim().length > 0)
                        .map((entry) => ({
                        itemId: String(entry.itemId).trim(),
                        count: Number.isFinite(entry.count) ? Number(entry.count) : 1,
                    }))
                    : [],
            }),
        };
    }
    /** createMarketSellOrder：创建市场卖单。 */
    @Post('players/:playerId/market/create-sell-order')
    async createMarketSellOrder(@Param('playerId') playerId, @Body() body) {
        return this.marketRuntimeService.createSellOrder(playerId, {
            itemRef: body?.itemRef,
            itemInstanceId: typeof body?.itemInstanceId === 'string' ? body.itemInstanceId : undefined,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    /** createMarketBuyOrder：创建市场买单。 */
    @Post('players/:playerId/market/create-buy-order')
    async createMarketBuyOrder(@Param('playerId') playerId, @Body() body) {
        return this.marketRuntimeService.createBuyOrder(playerId, {
            itemKey: body.itemKey ?? '',
            itemId: body.itemId ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
            unitPrice: Number.isFinite(body.unitPrice) ? Number(body.unitPrice) : Number.NaN,
        });
    }
    /** buyMarketItem：执行市场买入。 */
    @Post('players/:playerId/market/buy')
    async buyMarketItem(@Param('playerId') playerId, @Body() body) {
        return this.marketRuntimeService.buyNow(playerId, {
            itemKey: body.itemKey ?? '',
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    /** sellMarketItem：执行市场卖出。 */
    @Post('players/:playerId/market/sell')
    async sellMarketItem(@Param('playerId') playerId, @Body() body) {
        return this.marketRuntimeService.sellNow(playerId, {
            itemRef: body?.itemRef,
            itemInstanceId: typeof body?.itemInstanceId === 'string' ? body.itemInstanceId : undefined,
            quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : Number.NaN,
        });
    }
    /** cancelMarketOrder：取消市场订单。 */
    @Post('players/:playerId/market/cancel-order')
    async cancelMarketOrder(@Param('playerId') playerId, @Body() body) {
        return this.marketRuntimeService.cancelOrder(playerId, {
            orderId: body.orderId ?? '',
        });
    }
    /** claimMarketStorage：领取市场暂存物品。 */
    @Post('players/:playerId/market/claim-storage')
    async claimMarketStorage(@Param('playerId') playerId) {
        return this.marketRuntimeService.claimStorage(playerId);
    }
    /** creditWallet：给玩家钱包加余额。 */
    @Post('players/:playerId/wallet/credit')
    async creditWallet(@Param('playerId') playerId, @Body() body) {
        return {
            player: await this.applyDurableWalletMutation(playerId, body, 'credit'),
        };
    }
    /** debitWallet：给玩家钱包扣余额。 */
    @Post('players/:playerId/wallet/debit')
    async debitWallet(@Param('playerId') playerId, @Body() body) {
        return {
            player: await this.applyDurableWalletMutation(playerId, body, 'debit'),
        };
    }

    async applyDurableWalletMutation(playerId, body, action) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const walletType = typeof body?.walletType === 'string' ? body.walletType.trim() : '';
        const amount = Number.isFinite(body?.amount) ? Math.max(1, Math.trunc(Number(body.amount))) : 1;
        if (!normalizedPlayerId || !walletType || amount <= 0) {
            throw new BadRequestException('钱包变更参数无效');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(normalizedPlayerId);
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim() ? player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch) ? Math.max(1, Math.trunc(Number(player.sessionEpoch))) : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            throw new ServiceUnavailableException('玩家会话尚未准备好，无法执行持久化钱包变更');
        }
        const nextWalletBalances = buildNextWalletBalances(player.wallet?.balances, walletType, amount, action);
        if (!nextWalletBalances) {
            throw new NotFoundException(`${walletType} 余额不足`);
        }
        if (typeof this.durableOperationService?.isEnabled === 'function' && !this.durableOperationService.isEnabled()) {
            if (action === 'credit') {
                return this.playerRuntimeService.creditWallet(normalizedPlayerId, walletType, amount);
            }
            return this.playerRuntimeService.debitWallet(normalizedPlayerId, walletType, amount);
        }
        const location = this.worldRuntimeService.worldRuntimePlayerLocationService.getPlayerLocation(normalizedPlayerId);
        const expectedInstanceId = location?.instanceId ?? null;
        const instanceLease = await this.resolveInstanceLeaseContext(expectedInstanceId);
        const operationId = `op:${normalizedPlayerId}:wallet:${action}:${walletType}:${Date.now().toString(36)}`;
        if (expectedInstanceId && !instanceLease) {
            throw new ServiceUnavailableException('持久化钱包变更需要地图实例租约');
        }
        if (typeof this.durableOperationService?.mutatePlayerWallet !== 'function') {
            throw new ServiceUnavailableException('持久化钱包变更服务不可用');
        }
        await this.durableOperationService.mutatePlayerWallet({
            operationId,
            playerId: normalizedPlayerId,
            expectedRuntimeOwnerId: runtimeOwnerId,
            expectedSessionEpoch: sessionEpoch,
            expectedInstanceId,
            expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
            expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
            walletType,
            action,
            delta: amount,
            nextWalletBalances,
        });
        if (action === 'credit') {
            return this.playerRuntimeService.creditWallet(normalizedPlayerId, walletType, amount);
        }
        return this.playerRuntimeService.debitWallet(normalizedPlayerId, walletType, amount);
    }

    async applyDurableInventoryGrant(playerId, body) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : '';
        const count = Number.isFinite(body?.count) ? Math.max(1, Math.trunc(Number(body.count))) : 1;
        if (!normalizedPlayerId || !itemId || count <= 0) {
            throw new BadRequestException('背包发放参数无效');
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(normalizedPlayerId);
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim() ? player.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch) ? Math.max(1, Math.trunc(Number(player.sessionEpoch))) : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            throw new ServiceUnavailableException('玩家会话尚未准备好，无法执行持久化背包发放');
        }
        if (typeof this.durableOperationService?.isEnabled === 'function' && !this.durableOperationService.isEnabled()) {
            return this.playerRuntimeService.grantItem(normalizedPlayerId, itemId, count);
        }
        const rollbackState = captureInventoryGrantRollbackState(player);
        player.suppressImmediateDomainPersistence = true;
        try {
            const location = this.worldRuntimeService.worldRuntimePlayerLocationService.getPlayerLocation(normalizedPlayerId);
            const expectedInstanceId = location?.instanceId ?? null;
            const instanceLease = await this.resolveInstanceLeaseContext(expectedInstanceId);
            if (expectedInstanceId && !instanceLease) {
                throw new ServiceUnavailableException('持久化背包发放需要地图实例租约');
            }
            if (typeof this.durableOperationService?.grantInventoryItems !== 'function') {
                throw new ServiceUnavailableException('持久化背包发放服务不可用');
            }
            this.playerRuntimeService.grantItem(normalizedPlayerId, itemId, count);
            const grantedItem = buildGrantedInventorySnapshot(itemId, count, player, rollbackState.inventoryItems.length);
            const operationId = `op:${normalizedPlayerId}:inventory-grant:${itemId}:x${count}:${Date.now().toString(36)}`;
            await this.durableOperationService.grantInventoryItems({
                operationId,
                playerId: normalizedPlayerId,
                expectedRuntimeOwnerId: runtimeOwnerId,
                expectedSessionEpoch: sessionEpoch,
                expectedInstanceId,
                expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                sourceType: 'gm_grant',
                sourceRefId: `gm:${itemId}`,
                grantedItems: [grantedItem],
                nextInventoryItems: buildNextInventorySnapshots(player.inventory?.items ?? []),
            });
            return player;
        }
        catch (error) {
            restoreInventoryGrantRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        }
        finally {
            player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
        }
    }
    async resolveInstanceLeaseContext(instanceId) {
        const normalizedInstanceId = typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : '';
        if (!normalizedInstanceId || !this.worldRuntimeService.instanceCatalogService?.isEnabled?.()) {
            return null;
        }
        const catalog = await this.worldRuntimeService.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
        if (!catalog) {
            return null;
        }
        const assignedNodeId = typeof catalog.assigned_node_id === 'string' && catalog.assigned_node_id.trim()
            ? catalog.assigned_node_id.trim()
            : null;
        const ownershipEpoch = Number.isFinite(Number(catalog.ownership_epoch))
            ? Math.max(0, Math.trunc(Number(catalog.ownership_epoch)))
            : null;
        if (!assignedNodeId || ownershipEpoch == null) {
            return null;
        }
        return { assignedNodeId, ownershipEpoch };
    }
};

function buildNextWalletBalances(existingBalances, walletType, amount, action) {
    const balances = Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
    const entry = balances.find((row) => row.walletType === walletType);
    if (action === 'credit') {
        if (entry) {
            entry.balance += amount;
            entry.version += 1;
        } else {
            balances.push({
                walletType,
                balance: amount,
                frozenBalance: 0,
                version: 1,
            });
        }
        return balances;
    }
    if (!entry || entry.balance < amount) {
        return null;
    }
    entry.balance -= amount;
    entry.version += 1;
    return balances;
}

function buildNextInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

function captureInventoryGrantRollbackState(player) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: buildNextInventorySnapshots(player.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
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

function buildGrantedInventorySnapshot(itemId, count, player, previousLength) {
    const nextItems = Array.isArray(player?.inventory?.items) ? player.inventory.items : [];
    const preferred = nextItems.find((entry, index) => index >= previousLength && entry?.itemId === itemId)
        ?? nextItems.find((entry) => entry?.itemId === itemId);
    return {
        itemId,
        count: Math.max(1, Math.trunc(Number(count ?? 1))),
        rawPayload: preferred ? { ...preferred } : { itemId, count: Math.max(1, Math.trunc(Number(count ?? 1))) },
    };
}
