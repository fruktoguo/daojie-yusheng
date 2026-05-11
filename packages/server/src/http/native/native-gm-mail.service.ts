/**
 * GM 邮件服务。
 * 提供定向邮件和广播邮件发送能力，广播时合并运行时在线玩家和持久化离线玩家，
 * 排除 GM 机器人。
 */
import { Inject, Injectable } from '@nestjs/common';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import { MailRuntimeService } from '../../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { NATIVE_GM_MAIL_RECIPIENT_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
/** 玩家快照最小接口。 */
interface PlayerSnapshotLike {
  playerId: string;
}

/** 邮件运行时服务端口。 */
interface MailRuntimeServiceLike {
  createDirectMail(playerId: string, input: unknown): Promise<string>;
}

/** 玩家持久化服务端口。 */
interface PlayerDomainPersistenceServiceLike {
  listProjectedSnapshots(buildStarterSnapshot: (playerId: string) => any | null): Promise<PlayerSnapshotLike[]>;
}

/** 玩家运行时服务端口。 */
interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
  buildStarterPersistenceSnapshot(playerId: string): any | null;
}

/** GM 邮件服务：定向邮件和广播邮件发送，排除 GM 机器人。 */
@Injectable()
export class NativeGmMailService {
  constructor(
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeServiceLike,
    @Inject(PlayerDomainPersistenceService) private readonly playerDomainPersistenceService: PlayerDomainPersistenceServiceLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
  ) {}

  /** 向指定玩家发送定向邮件。 */
  async createDirectMail(playerId: string, input?: unknown) {
    return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
  }

  /** 收集广播邮件收件人：运行时在线 + 持久化离线，排除机器人。 */
  async collectBroadcastRecipientPlayerIds(): Promise<string[]> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const runtimePlayerIds: string[] = this.playerRuntimeService
      .listPlayerSnapshots()
      .filter((entry) => !isNativeGmBotPlayerId(entry.playerId))
      .map((entry) => entry.playerId);
    const deliveredPlayerIds = new Set(runtimePlayerIds);

    if (NATIVE_GM_MAIL_RECIPIENT_CONTRACT.persistedFallbackRecipients !== 'persisted_non_runtime_non_bot_players') {
      return runtimePlayerIds;
    }

    const persistedEntries = await this.playerDomainPersistenceService.listProjectedSnapshots(
      (playerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(playerId),
    );
    for (const entry of persistedEntries) {
      if (isNativeGmBotPlayerId(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
        continue;
      }
      deliveredPlayerIds.add(entry.playerId);
    }

    return Array.from(deliveredPlayerIds);
  }  
  /** 向所有非机器人玩家广播邮件，支持指定范围。 */
  async createBroadcastMail(input?: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const deliveredMailIds: string[] = [];
    const batchId = `broadcast:${Date.now().toString(36)}`;
    const scopedPlayerIds = this.normalizePlayerIdScope(input);
    const recipientPlayerIds = scopedPlayerIds.length > 0
      ? scopedPlayerIds
      : await this.collectBroadcastRecipientPlayerIds();

    for (const playerId of recipientPlayerIds) {
      deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
    }

    return {
      mailId: deliveredMailIds[0] ?? batchId,
      batchId,
      recipientCount: deliveredMailIds.length,
    };
  }

  private normalizePlayerIdScope(input: unknown): string[] {
    const source = typeof input === 'object' && input !== null
      ? ((input as { playerIds?: unknown; targetPlayerIds?: unknown }).playerIds
        ?? (input as { playerIds?: unknown; targetPlayerIds?: unknown }).targetPlayerIds)
      : null;
    if (!Array.isArray(source)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const raw of source) {
      const playerId = typeof raw === 'string' ? raw.trim() : '';
      if (!playerId || seen.has(playerId) || isNativeGmBotPlayerId(playerId)) {
        continue;
      }
      seen.add(playerId);
      normalized.push(playerId);
    }
    return normalized;
  }
}
