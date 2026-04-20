import type { Direction, PlayerState } from '@mud/shared-next';
import type { ObservedMapEntity } from './game-map/types';
import type { MainRuntimeObservedEntity } from './main-runtime-view-types';
/**
 * MainRootRuntimeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRootRuntimeSourceOptions = {
/**
 * replaceVisibleEntities：对象字段。
 */

  replaceVisibleEntities: (entities: MainRuntimeObservedEntity[]) => void;  
  /**
 * getLatestObservedEntitiesSnapshot：对象字段。
 */

  getLatestObservedEntitiesSnapshot: () => readonly ObservedMapEntity[];
};
/**
 * MainRootRuntimeSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRootRuntimeSource = ReturnType<typeof createMainRootRuntimeSource>;
/**
 * createMainRootRuntimeSource：构建并返回目标对象。
 * @param options MainRootRuntimeSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainRootRuntimeSource(options: MainRootRuntimeSourceOptions) {
  let player: PlayerState | null = null;
  let latestEntities: MainRuntimeObservedEntity[] = [];
  let latestEntityMap = new Map<string, MainRuntimeObservedEntity>();  
  /**
 * setLatestObservedEntities：更新/写入相关状态。
 * @param entities MainRuntimeObservedEntity[] 参数说明。
 * @returns void。
 */


  function setLatestObservedEntities(entities: MainRuntimeObservedEntity[]): void {
    latestEntities = entities;
  }  
  /**
 * setLatestObservedEntityMap：更新/写入相关状态。
 * @param map Map<string, MainRuntimeObservedEntity> 地图信息。
 * @returns void。
 */


  function setLatestObservedEntityMap(map: Map<string, MainRuntimeObservedEntity>): void {
    latestEntityMap = map;
  }  
  /**
 * syncObservedSnapshot：执行核心业务逻辑。
 * @returns MainRuntimeObservedEntity[]。
 */


  function syncObservedSnapshot(): MainRuntimeObservedEntity[] {
    const entities = options.getLatestObservedEntitiesSnapshot().map<MainRuntimeObservedEntity>((entity) => ({
      ...entity,
      npcQuestMarker: entity.npcQuestMarker ?? undefined,
      observation: entity.observation ?? undefined,
    }));
    setLatestObservedEntities(entities);
    setLatestObservedEntityMap(new Map(entities.map((entity) => [entity.id, entity])));
    return entities;
  }  
  /**
 * patchVisibleEntity：执行核心业务逻辑。
 * @param playerId string 玩家 ID。
 * @param patch Partial<Pick<MainRuntimeObservedEntity, 'char' | 'name'>> 参数说明。
 * @returns void。
 */


  function patchVisibleEntity(
    playerId: string,
    patch: Partial<Pick<MainRuntimeObservedEntity, 'char' | 'name'>>,
  ): void {
    latestEntities = latestEntities.map((entity) => {
      if (entity.id !== playerId) {
        return entity;
      }
      return {
        ...entity,
        ...(patch.char !== undefined ? { char: patch.char } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      };
    });
    latestEntityMap = new Map(latestEntities.map((entity) => [entity.id, entity]));
    options.replaceVisibleEntities(latestEntities);
  }

  return {  
  /**
 * getPlayer：按给定条件读取/查询数据。
 * @returns PlayerState | null。
 */

    getPlayer(): PlayerState | null {
      return player;
    },    
    /**
 * setPlayer：更新/写入相关状态。
 * @param nextPlayer PlayerState | null 参数说明。
 * @returns void。
 */


    setPlayer(nextPlayer: PlayerState | null): void {
      player = nextPlayer;
    },    
    /**
 * hasPlayer：执行状态校验并返回判断结果。
 * @returns boolean。
 */


    hasPlayer(): boolean {
      return Boolean(player);
    },    
    /**
 * clearPlayer：执行核心业务逻辑。
 * @returns void。
 */


    clearPlayer(): void {
      player = null;
    },    
    /**
 * setPlayerFacing：更新/写入相关状态。
 * @param direction Direction 方向参数。
 * @returns void。
 */


    setPlayerFacing(direction: Direction): void {
      if (player) {
        player.facing = direction;
      }
    },    
    /**
 * getLatestEntities：按给定条件读取/查询数据。
 * @returns MainRuntimeObservedEntity[]。
 */


    getLatestEntities(): MainRuntimeObservedEntity[] {
      return latestEntities;
    },    
    /**
 * getLatestEntityById：按给定条件读取/查询数据。
 * @param id string 参数说明。
 * @returns MainRuntimeObservedEntity | undefined。
 */


    getLatestEntityById(id: string): MainRuntimeObservedEntity | undefined {
      return latestEntityMap.get(id);
    },

    setLatestObservedEntities,
    setLatestObservedEntityMap,
    syncObservedSnapshot,    
    /**
 * clearObservedEntities：执行核心业务逻辑。
 * @returns void。
 */


    clearObservedEntities(): void {
      latestEntities = [];
      latestEntityMap.clear();
    },    
    /**
 * applyVisibleDisplayName：更新/写入相关状态。
 * @param playerId string 玩家 ID。
 * @param displayName string 参数说明。
 * @returns void。
 */


    applyVisibleDisplayName(playerId: string, displayName: string): void {
      patchVisibleEntity(playerId, {
        char: [...displayName][0] ?? undefined,
      });
    },    
    /**
 * applyVisibleRoleName：更新/写入相关状态。
 * @param playerId string 玩家 ID。
 * @param roleName string 参数说明。
 * @returns void。
 */


    applyVisibleRoleName(playerId: string, roleName: string): void {
      patchVisibleEntity(playerId, {
        name: roleName,
      });
    },
  };
}
