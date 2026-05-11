/**
 * NPC 访问权限校验服务
 * 负责判断玩家是否在 NPC 交互范围内，提供相邻 NPC 解析和地图内 NPC 查询
 */
import { Injectable, NotFoundException } from '@nestjs/common';

interface RuntimeLocation {
  instanceId: string;
}

interface NpcInstanceLike<TNpc = unknown> {
  getAdjacentNpc(playerId: string, npcId: string): TNpc | null | undefined;
  getNpc(npcId: string): TNpc | null | undefined;
}

interface NpcAccessDeps<TNpc = unknown> {
  getPlayerLocationOrThrow(playerId: string): RuntimeLocation;
  getPlayerLocation(playerId: string): RuntimeLocation | null;
  getInstanceRuntimeOrThrow(instanceId: string): NpcInstanceLike<TNpc>;
  getInstanceRuntime(instanceId: string): NpcInstanceLike<TNpc> | null | undefined;
}

/** NPC 邻近访问与地图内 NPC 查询服务 */
@Injectable()
export class WorldRuntimeNpcAccessService {
  /** 解析玩家相邻的 NPC，不在范围内则抛出异常 */
  resolveAdjacentNpc<TNpc>(playerId: string, npcId: string, deps: NpcAccessDeps<TNpc>): TNpc {
    const location = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
    const npc = instance.getAdjacentNpc(playerId, npcId);
    if (!npc) {
      throw new NotFoundException('你离这位商人太远了');
    }
    return npc;
  }

  getNpcForPlayerMap<TNpc>(playerId: string, npcId: string, deps: NpcAccessDeps<TNpc>): TNpc | null {
    const location = deps.getPlayerLocation(playerId);
    if (!location) {
      return null;
    }
    return deps.getInstanceRuntime(location.instanceId)?.getNpc(npcId) ?? null;
  }
}
