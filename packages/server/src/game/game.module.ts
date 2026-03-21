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
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([PlayerEntity, UserEntity]),
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
    InventoryService,
    EquipmentService,
    TechniqueService,
    ActionService,
    ContentService,
    NavigationService,
    BotService,
    GmService,
    PerformanceService,
    LootService,
    TimeService,
    WorldService,
  ],
  exports: [MapService, PlayerService],
})
export class GameModule {}
