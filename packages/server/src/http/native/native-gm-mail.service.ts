import { Inject, Injectable } from '@nestjs/common';
import { PlayerPersistenceService } from '../../persistence/player-persistence.service';
import { MailRuntimeService } from '../../runtime/mail/mail-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { NATIVE_GM_MAIL_RECIPIENT_CONTRACT } from './native-gm-contract';
import { isNativeGmBotPlayerId } from './native-gm.constants';
/**
 * PlayerSnapshotLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerSnapshotLike {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}
/**
 * MailRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface MailRuntimeServiceLike {
  createDirectMail(playerId: string, input: unknown): Promise<string>;
}
/**
 * PlayerPersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerPersistenceServiceLike {
  listPlayerSnapshots(): Promise<PlayerSnapshotLike[]>;
}
/**
 * PlayerRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeServiceLike {
  listPlayerSnapshots(): PlayerSnapshotLike[];
}
/**
 * NativeGmMailService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmMailService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param mailRuntimeService MailRuntimeServiceLike 参数说明。
 * @param playerPersistenceService PlayerPersistenceServiceLike 参数说明。
 * @param playerRuntimeService PlayerRuntimeServiceLike 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

  constructor(
    @Inject(MailRuntimeService) private readonly mailRuntimeService: MailRuntimeServiceLike,
    @Inject(PlayerPersistenceService) private readonly playerPersistenceService: PlayerPersistenceServiceLike,
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeServiceLike,
  ) {}  
  /**
 * createDirectMail：构建并返回目标对象。
 * @param playerId string 玩家 ID。
 * @param input unknown 输入参数。
 * @returns 无返回值，直接更新Direct邮件相关状态。
 */


  async createDirectMail(playerId: string, input?: unknown) {
    return this.mailRuntimeService.createDirectMail(playerId, input ?? {});
  }  
  /**
 * collectBroadcastRecipientPlayerIds：执行BroadcastRecipient玩家ID相关逻辑。
 * @returns 返回 Promise，完成后得到BroadcastRecipient玩家ID。
 */


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

    const persistedEntries = await this.playerPersistenceService.listPlayerSnapshots();
    for (const entry of persistedEntries) {
      if (isNativeGmBotPlayerId(entry.playerId) || deliveredPlayerIds.has(entry.playerId)) {
        continue;
      }
      deliveredPlayerIds.add(entry.playerId);
    }

    return Array.from(deliveredPlayerIds);
  }  
  /**
 * createBroadcastMail：构建并返回目标对象。
 * @param input unknown 输入参数。
 * @returns 无返回值，直接更新Broadcast邮件相关状态。
 */


  async createBroadcastMail(input?: unknown) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const deliveredMailIds: string[] = [];
    const batchId = `broadcast:${Date.now().toString(36)}`;

    for (const playerId of await this.collectBroadcastRecipientPlayerIds()) {
      deliveredMailIds.push(await this.mailRuntimeService.createDirectMail(playerId, input ?? {}));
    }

    return {
      mailId: deliveredMailIds[0] ?? batchId,
      batchId,
      recipientCount: deliveredMailIds.length,
    };
  }
}
