import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AfdianOrderEntity } from '../database/entities/afdian-order.entity';
import { GmAuthGuard } from '../game/gm-auth.guard';
import { AfdianController, AfdianGmController, AfdianLegacyGmController } from './afdian.controller';
import { AfdianService } from './afdian.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([AfdianOrderEntity]),
  ],
  controllers: [AfdianController, AfdianLegacyGmController, AfdianGmController],
  providers: [AfdianService, GmAuthGuard],
  exports: [AfdianService],
})
export class AfdianModule {}
