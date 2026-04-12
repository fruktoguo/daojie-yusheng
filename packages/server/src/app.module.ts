/**
 * 应用根模块 —— 组装全局配置、数据库、认证与游戏子模块
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { GameModule } from './game/game.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';

/** 应用根模块 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    GameModule,
  ],
  controllers: [HealthController],
})
/** AppModule：封装相关状态与行为。 */
export class AppModule {}

