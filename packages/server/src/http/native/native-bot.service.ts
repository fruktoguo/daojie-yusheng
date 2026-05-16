/**
 * NativeBotService：bot 蓝图签发与释放的协调服务。
 *
 * 设计参考：docs/design/systems/分身宠物机器人系统设计.md §6。
 *
 * 第 1 批职责：
 * - 校验 GM 调用入参（数量、TTL、源玩家 ID）
 * - 调用 BotTokenService 签发 bot 一次性登录 token
 * - 在 EphemeralActorIdentityService 注册 bot identity
 * - 在 ActorPersistencePolicyService 显式登记 `none` 策略
 *
 * 第 1 批暂不实现：
 * - ActorBlueprint 真实克隆（fromPlayer，留待第 2 批）
 * - WS Hello 路径接受 token 并应用蓝图（留待第 2 批）
 */

import { randomBytes } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';

import {
  EPHEMERAL_BOT_ID_PREFIX,
  GmBotIssueBlueprintReq,
  GmBotIssueBlueprintRes,
  GmBotIssuedToken,
  GmBotReleaseReq,
  GmBotReleaseRes,
  isEphemeralPlayerId,
} from '@mud/shared';

import { BotTokenService } from '../../auth/bot-token.service';
import { ActorPersistencePolicyService } from '../../runtime/actor/actor-persistence-policy.service';
import { EphemeralActorIdentityService } from '../../runtime/actor/ephemeral-actor-identity.service';

/** 单次签发请求允许的最大数量。 */
const MAX_ISSUE_COUNT_PER_REQUEST = 1_000;

/** 默认 spawn 地图模板 ID（缺失 sourcePlayerId 推断时回退）。 */
const DEFAULT_SPAWN_MAP_ID = 'yunlai_town';

/** 默认 spawn 坐标。 */
const DEFAULT_SPAWN_X = 0;
const DEFAULT_SPAWN_Y = 0;

@Injectable()
export class NativeBotService {
  private readonly logger = new Logger(NativeBotService.name);
  /** 用于在内存中分配 bot 序号，避免同毫秒批量生成时冲突。 */
  private nextSequence = 1;

  constructor(
    private readonly botTokenService: BotTokenService,
    private readonly ephemeralIdentityService: EphemeralActorIdentityService,
    private readonly persistencePolicyService: ActorPersistencePolicyService,
  ) {}

  /**
   * 签发一批 bot 登录 token。
   * 第 1 批阶段不生成真实 ActorBlueprint，blueprintId 返回 null；下一批接入克隆后改为非空。
   */
  issueBlueprint(req: GmBotIssueBlueprintReq | undefined): GmBotIssueBlueprintRes {
    if (!this.botTokenService.isFeatureEnabled()) {
      throw new ForbiddenException(
        'bot 登录未启用，请设置环境变量 SERVER_BOT_LOGIN_ENABLED=1',
      );
    }
    const sourcePlayerId = readNonEmptyString(req?.sourcePlayerId);
    if (!sourcePlayerId) {
      throw new BadRequestException('sourcePlayerId 不能为空');
    }
    const count = clampCount(req?.count);
    const ttlSec = resolveTtlSec(req?.ttlMinutes);
    const spawnMapId = readNonEmptyString(req?.spawnMapId) || DEFAULT_SPAWN_MAP_ID;
    const spawnX = Number.isFinite(req?.spawnAnchor?.x)
      ? Math.trunc(req!.spawnAnchor!.x)
      : DEFAULT_SPAWN_X;
    const spawnY = Number.isFinite(req?.spawnAnchor?.y)
      ? Math.trunc(req!.spawnAnchor!.y)
      : DEFAULT_SPAWN_Y;

    const issuedTokens: GmBotIssuedToken[] = [];
    for (let index = 0; index < count; index += 1) {
      const playerId = this.allocateBotPlayerId();
      const tokenResult = this.botTokenService.issue({
        playerId,
        blueprintId: null,
        ttlSec,
      });
      this.ephemeralIdentityService.issue({
        playerId,
        kind: 'bot',
        ownerPlayerId: null,
        blueprintId: null,
        expiresAtMs: tokenResult.expiresAtMs,
        preferredMapId: spawnMapId,
        preferredX: spawnX,
        preferredY: spawnY,
      });
      this.persistencePolicyService.register(playerId, { kind: 'none' });
      issuedTokens.push({
        playerId,
        kind: 'bot',
        loginToken: tokenResult.token,
        expiresAtMs: tokenResult.expiresAtMs,
        spawnMapId,
        x: spawnX,
        y: spawnY,
      });
    }

    this.logger.log(
      `bot blueprint issued: source=${sourcePlayerId} count=${count} ttlSec=${ttlSec}`,
    );

    return {
      ok: true,
      blueprintId: null,
      sourcePlayerId,
      issuedTokens,
    };
  }

  /** 释放 bot：注销 ephemeral identity 与 persistence policy。 */
  release(req: GmBotReleaseReq | undefined): GmBotReleaseRes {
    const releaseAll = req?.all === true;
    const requestedIds: string[] = Array.isArray(req?.playerIds)
      ? req!.playerIds!.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const targetIds = releaseAll
      ? this.ephemeralIdentityService
          .listAll()
          .filter((identity) => identity.kind === 'bot')
          .map((identity) => identity.playerId)
      : requestedIds.map((id) => id.trim());

    const released: string[] = [];
    const skipped: string[] = [];
    for (const playerId of targetIds) {
      if (!isEphemeralPlayerId(playerId) || !playerId.startsWith(EPHEMERAL_BOT_ID_PREFIX)) {
        skipped.push(playerId);
        continue;
      }
      const removedIdentity = this.ephemeralIdentityService.release(playerId);
      const removedPolicy = this.persistencePolicyService.unregister(playerId);
      if (removedIdentity || removedPolicy) {
        released.push(playerId);
      } else {
        skipped.push(playerId);
      }
    }

    this.logger.log(
      `bot release: requested=${targetIds.length} released=${released.length} skipped=${skipped.length}`,
    );

    return {
      ok: true,
      releasedPlayerIds: released,
      skippedPlayerIds: skipped,
    };
  }

  /** 生成 bot playerId：`bot_<base36 时间戳>_<seq base36>_<3 字节随机后缀>`。 */
  private allocateBotPlayerId(): string {
    const seq = this.nextSequence++;
    const ts = Date.now().toString(36);
    const seqHex = seq.toString(36);
    const rnd = randomBytes(3).toString('hex');
    return `${EPHEMERAL_BOT_ID_PREFIX}${ts}_${seqHex}_${rnd}`;
  }
}

/** 把字符串入参规范成非空 trim；非字符串返回空串。 */
function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 限制 count 范围：1..MAX_ISSUE_COUNT_PER_REQUEST。 */
function clampCount(input: unknown): number {
  const raw = typeof input === 'number' && Number.isFinite(input) ? Math.trunc(input) : 0;
  if (raw <= 0) {
    throw new BadRequestException('count 必须 > 0');
  }
  return Math.min(raw, MAX_ISSUE_COUNT_PER_REQUEST);
}

/** 把 ttlMinutes 转成 ttlSec，缺失时由 BotTokenService 用默认值。 */
function resolveTtlSec(ttlMinutes: unknown): number {
  if (typeof ttlMinutes !== 'number' || !Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return 0; // 0 触发 BotTokenService.clampTtlSec 走默认 2h
  }
  return Math.trunc(ttlMinutes) * 60;
}
