import type { Direction, PlayerState } from '@mud/shared-next';
import type { ObservedMapEntity } from './game-map/types';
import type { MainRuntimeObservedEntity } from './main-runtime-view-types';

type MainRootRuntimeSourceOptions = {
  replaceVisibleEntities: (entities: MainRuntimeObservedEntity[]) => void;
  getLatestObservedEntitiesSnapshot: () => readonly ObservedMapEntity[];
};

export type MainRootRuntimeSource = ReturnType<typeof createMainRootRuntimeSource>;

export function createMainRootRuntimeSource(options: MainRootRuntimeSourceOptions) {
  let player: PlayerState | null = null;
  let latestEntities: MainRuntimeObservedEntity[] = [];
  let latestEntityMap = new Map<string, MainRuntimeObservedEntity>();

  function setLatestObservedEntities(entities: MainRuntimeObservedEntity[]): void {
    latestEntities = entities;
  }

  function setLatestObservedEntityMap(map: Map<string, MainRuntimeObservedEntity>): void {
    latestEntityMap = map;
  }

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
    getPlayer(): PlayerState | null {
      return player;
    },

    setPlayer(nextPlayer: PlayerState | null): void {
      player = nextPlayer;
    },

    hasPlayer(): boolean {
      return Boolean(player);
    },

    clearPlayer(): void {
      player = null;
    },

    setPlayerFacing(direction: Direction): void {
      if (player) {
        player.facing = direction;
      }
    },

    getLatestEntities(): MainRuntimeObservedEntity[] {
      return latestEntities;
    },

    getLatestEntityById(id: string): MainRuntimeObservedEntity | undefined {
      return latestEntityMap.get(id);
    },

    setLatestObservedEntities,
    setLatestObservedEntityMap,
    syncObservedSnapshot,

    clearObservedEntities(): void {
      latestEntities = [];
      latestEntityMap.clear();
    },

    applyVisibleDisplayName(playerId: string, displayName: string): void {
      patchVisibleEntity(playerId, {
        char: [...displayName][0] ?? undefined,
      });
    },

    applyVisibleRoleName(playerId: string, roleName: string): void {
      patchVisibleEntity(playerId, {
        name: roleName,
      });
    },
  };
}
