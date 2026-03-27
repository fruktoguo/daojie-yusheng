/**
 * 游戏核心模块 —— 注册所有游戏相关的 Service、Gateway、Controller，
 * 是服务端游戏逻辑的顶层组织入口。
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GameGateway } from './game.gateway';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { GmController } from './gm.controller';
import { GmAuthGuard } from './gm-auth.guard';
import { TickService } from './tick.service';
import { MapService } from './map.service';
import { PlayerService } from './player.service';
import { AoiService } from './aoi.service';
import { AttrService } from './attr.service';
import { InventoryService } from './inventory.service';
import { EquipmentService } from './equipment.service';
import { EquipmentEffectService } from './equipment-effect.service';
import { TechniqueService } from './technique.service';
import { ActionService } from './action.service';
import { ContentService } from './content.service';
import { WorldService } from './world.service';
import { NavigationService } from './navigation.service';
import { BotService } from './bot.service';
import { GmService } from './gm.service';
import { PerformanceService } from './performance.service';
import { LootService } from './loot.service';
import { TimeService } from './time.service';
import { SuggestionService } from './suggestion.service';
import { SuggestionRealtimeService } from './suggestion-realtime.service';
import { ThreatService } from './threat.service';
import { PathRequestSchedulerService } from './pathfinding/path-request-scheduler.service';
import { PathWorkerPoolService } from './pathfinding/path-worker-pool.service';
import { PlayerEntity } from '../database/entities/player.entity';
import { SuggestionEntity } from '../database/entities/suggestion.entity';
import { UserEntity } from '../database/entities/user.entity';
import { MarketOrderEntity } from '../database/entities/market-order.entity';
import { MarketTradeHistoryEntity } from '../database/entities/market-trade-history.entity';
import { MarketService } from './market.service';
import { QiProjectionService } from './qi-projection.service';
import { DatabaseBackupService } from './database-backup.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([PlayerEntity, UserEntity, SuggestionEntity, MarketOrderEntity, MarketTradeHistoryEntity]),
  ],
  controllers: [GmController, AccountController],
  providers: [
    GameGateway,
    AccountService,
    GmAuthGuard,
    TickService,
    MapService,
    PlayerService,
    AoiService,
    AttrService,
    QiProjectionService,
    InventoryService,
    EquipmentService,
    EquipmentEffectService,
    TechniqueService,
    ActionService,
    ContentService,
    NavigationService,
    BotService,
    GmService,
    PerformanceService,
    LootService,
    TimeService,
    ThreatService,
    WorldService,
    SuggestionService,
    SuggestionRealtimeService,
    MarketService,
    PathRequestSchedulerService,
    PathWorkerPoolService,
    DatabaseBackupService,
  ],
  exports: [MapService, PlayerService, SuggestionService, SuggestionRealtimeService],
})

export class GameModule {}
