/**
 * 认证模块 —— 注册 JWT 签发、用户认证相关服务与控制器
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NameUniquenessService } from './name-uniqueness.service';
import { UserEntity } from '../database/entities/user.entity';
import { PlayerEntity } from '../database/entities/player.entity';

/** 认证模块，导出 AuthService 供其他模块使用 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PlayerEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'daojie-yusheng-dev-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, NameUniquenessService],
  exports: [AuthService, NameUniquenessService],
})
export class AuthModule {}
