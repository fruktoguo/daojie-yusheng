import type { Direction, PlayerState } from '@mud/shared-next';
import type { ObservedMapEntity } from './game-map/types';
import type { MainRuntimeObservedEntity } from './main-runtime-view-types';
/**
 * MainRootRuntimeSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainRootRuntimeSourceOptions = {
/**
 * replaceVisibleEntities：可见Entity相关字段。
 */

  replaceVisibleEntities: (entities: MainRuntimeObservedEntity[]) => void;  
  /**
 * getLatestObservedEntitiesSnapshot：LatestObservedEntity快照状态或数据块。
 */

  getLatestObservedEntitiesSnapshot: () => readonly ObservedMapEntity[];
};

const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

function isDemonizedPlayerEntity(entity: Pick<MainRuntimeObservedEntity, 'kind' | 'buffs'>): boolean {
  return entity.kind === 'player' && (entity.buffs ?? []).some((buff) => (
    buff.buffId === PVP_SHA_INFUSION_BUFF_ID
    && Math.max(0, Math.round(buff.stacks ?? 0)) > PVP_SHA_DEMONIZED_STACK_THRESHOLD
  ));
}

function decorateObservedEntity(entity: MainRuntimeObservedEntity, player: PlayerState | null): MainRuntimeObservedEntity {
  const badge = entity.badge ?? (isDemonizedPlayerEntity(entity)
    ? { text: '魔', tone: 'demonic' as const }
    : undefined);
  const hostile = entity.kind === 'player'
    && player !== null
    && entity.id !== player.id
    && (player.allowAoePlayerHit === true || player.retaliatePlayerTargetId === entity.id);
  return {
    ...entity,
    badge,
    hostile,
  };
}
/**
 * MainRootRuntimeSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainRootRuntimeSource = ReturnType<typeof createMainRootRuntimeSource>;
/**
 * createMainRootRuntimeSource：构建并返回目标对象。
 * @param options MainRootRuntimeSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main根容器运行态来源相关状态。
 */


export function createMainRootRuntimeSource(options: MainRootRuntimeSourceOptions) {
  let player: PlayerState | null = null;
  let latestEntities: MainRuntimeObservedEntity[] = [];
  let latestEntityMap = new Map<string, MainRuntimeObservedEntity>();  

  function rebuildObservedEntityMap(entities: MainRuntimeObservedEntity[]): void {
    latestEntityMap = new Map(entities.map((entity) => [entity.id, entity]));
  }

  function decorateObservedEntities(entities: MainRuntimeObservedEntity[]): MainRuntimeObservedEntity[] {
    return entities.map((entity) => decorateObservedEntity(entity, player));
  }

  function refreshObservedDecorations(): void {
    if (latestEntities.length === 0) {
      latestEntityMap.clear();
      return;
    }
    latestEntities = decorateObservedEntities(latestEntities);
    rebuildObservedEntityMap(latestEntities);
    options.replaceVisibleEntities(latestEntities);
  }
  /**
 * setLatestObservedEntities：写入最新ObservedEntity。
 * @param entities MainRuntimeObservedEntity[] 参数说明。
 * @returns 无返回值，直接更新LatestObservedEntity相关状态。
 */


  function setLatestObservedEntities(entities: MainRuntimeObservedEntity[]): void {
    latestEntities = decorateObservedEntities(entities);
    rebuildObservedEntityMap(latestEntities);
  }  
  /**
 * setLatestObservedEntityMap：写入最新ObservedEntity地图。
 * @param map Map<string, MainRuntimeObservedEntity> 地图信息。
 * @returns 无返回值，直接更新LatestObservedEntity地图相关状态。
 */


  function setLatestObservedEntityMap(map: Map<string, MainRuntimeObservedEntity>): void {
    latestEntityMap = new Map(Array.from(map.entries(), ([id, entity]) => [id, decorateObservedEntity(entity, player)]));
  }  
  /**
 * syncObservedSnapshot：处理Observed快照并更新相关状态。
 * @returns 返回Observed快照列表。
 */


  function syncObservedSnapshot(): MainRuntimeObservedEntity[] {
    const entities = options.getLatestObservedEntitiesSnapshot().map<MainRuntimeObservedEntity>((entity) => ({
      ...entity,
      badge: entity.badge ?? undefined,
      hostile: entity.hostile === true,
      monsterScale: entity.monsterScale,
      npcQuestMarker: entity.npcQuestMarker ?? undefined,
      observation: entity.observation ?? undefined,
    }));
    setLatestObservedEntities(entities);
    return entities;
  }  
  /**
 * patchVisibleEntity：判断patch可见Entity是否满足条件。
 * @param playerId string 玩家 ID。
 * @param patch Partial<Pick<MainRuntimeObservedEntity, 'char' | 'name'>> 参数说明。
 * @returns 无返回值，直接更新patch可见Entity相关状态。
 */


  function patchVisibleEntity(
    playerId: string,
    patch: Partial<Pick<MainRuntimeObservedEntity, 'char' | 'name'>>,
  ): void {
    latestEntities = decorateObservedEntities(latestEntities.map((entity) => {
      if (entity.id !== playerId) {
        return entity;
      }
      return {
        ...entity,
        ...(patch.char !== undefined ? { char: patch.char } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      };
    }));
    rebuildObservedEntityMap(latestEntities);
    options.replaceVisibleEntities(latestEntities);
  }

  return {  
  /**
 * getPlayer：读取玩家。
 * @returns 返回玩家。
 */

    getPlayer(): PlayerState | null {
      return player;
    },    
    /**
 * setPlayer：写入玩家。
 * @param nextPlayer PlayerState | null 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


    setPlayer(nextPlayer: PlayerState | null): void {
      player = nextPlayer;
      refreshObservedDecorations();
    },    
    /**
 * hasPlayer：判断玩家是否满足条件。
 * @returns 返回是否满足玩家条件。
 */


    hasPlayer(): boolean {
      return Boolean(player);
    },    
    /**
 * clearPlayer：执行clear玩家相关逻辑。
 * @returns 无返回值，直接更新clear玩家相关状态。
 */


    clearPlayer(): void {
      player = null;
    },    
    /**
 * setPlayerFacing：写入玩家Facing。
 * @param direction Direction 方向参数。
 * @returns 无返回值，直接更新玩家Facing相关状态。
 */


    setPlayerFacing(direction: Direction): void {
      if (player) {
        player.facing = direction;
      }
    },    
    /**
 * getLatestEntities：读取最新Entity。
 * @returns 返回LatestEntity列表。
 */


    getLatestEntities(): MainRuntimeObservedEntity[] {
      return latestEntities;
    },    
    /**
 * getLatestEntityById：读取最新EntityByID。
 * @param id string 参数说明。
 * @returns 返回LatestEntityByID。
 */


    getLatestEntityById(id: string): MainRuntimeObservedEntity | undefined {
      return latestEntityMap.get(id);
    },

    setLatestObservedEntities,
    setLatestObservedEntityMap,
    refreshObservedDecorations,
    syncObservedSnapshot,    
    /**
 * clearObservedEntities：执行clearObservedEntity相关逻辑。
 * @returns 无返回值，直接更新clearObservedEntity相关状态。
 */


    clearObservedEntities(): void {
      latestEntities = [];
      latestEntityMap.clear();
    },    
    /**
 * applyVisibleDisplayName：判断可见显示名称是否满足条件。
 * @param playerId string 玩家 ID。
 * @param displayName string 参数说明。
 * @returns 无返回值，直接更新可见显示名称相关状态。
 */


    applyVisibleDisplayName(playerId: string, displayName: string): void {
      patchVisibleEntity(playerId, {
        char: [...displayName][0] ?? undefined,
      });
    },    
    /**
 * applyVisibleRoleName：判断可见Role名称是否满足条件。
 * @param playerId string 玩家 ID。
 * @param roleName string 参数说明。
 * @returns 无返回值，直接更新可见Role名称相关状态。
 */


    applyVisibleRoleName(playerId: string, roleName: string): void {
      patchVisibleEntity(playerId, {
        name: roleName,
      });
    },
  };
}
