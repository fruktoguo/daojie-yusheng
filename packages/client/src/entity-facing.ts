import { Direction, type RenderEntity } from '@mud/shared';

type SpriteLookupEntity = Pick<RenderEntity, 'id' | 'kind' | 'name' | 'char' | 'facing'>;

export type EntitySpriteLookupPlan = {
  keys: string[];
  directionalKeyCount: number;
  flipBaseX: boolean;
};

function normalizeEntitySpriteSegment(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_\-\u3400-\u9fff]+/gu, '_').replace(/^_+|_+$/g, '');
  return normalized ? normalized : null;
}

function buildBaseEntitySpriteKeys(entity: SpriteLookupEntity): string[] {
  const id = normalizeEntitySpriteSegment(entity.id);
  const name = normalizeEntitySpriteSegment(entity.name);
  const char = normalizeEntitySpriteSegment(entity.char);
  switch (entity.kind) {
    case 'monster':
      return [id && `monster:${id}`, name && `monster:${name}`, char && `monster:${char}`, 'monster:default'].filter(Boolean) as string[];
    case 'npc':
      return [id && `npc:${id}`, name && `npc:${name}`, char && `npc:${char}`, 'npc:default'].filter(Boolean) as string[];
    case 'player':
      return [id && `player:${id}`, name && `player:${name}`, 'player:default'].filter(Boolean) as string[];
    default:
      return [];
  }
}

export function resolveTwoWayMonsterFacing(
  nextFacing: Direction | null | undefined,
  previousFacing: Direction | null | undefined,
): Direction | undefined {
  if (nextFacing === Direction.West || nextFacing === Direction.East) {
    return nextFacing;
  }
  if (previousFacing === Direction.West || previousFacing === Direction.East) {
    return previousFacing;
  }
  if (nextFacing === Direction.North || nextFacing === Direction.South) {
    return Direction.West;
  }
  return undefined;
}

export function buildEntitySpriteLookupPlan(entity: SpriteLookupEntity): EntitySpriteLookupPlan {
  const baseKeys = buildBaseEntitySpriteKeys(entity);
  if (entity.kind !== 'monster') {
    return {
      keys: baseKeys,
      directionalKeyCount: 0,
      flipBaseX: false,
    };
  }

  const facing = resolveTwoWayMonsterFacing(entity.facing, undefined);
  const side = facing === Direction.East ? 'right' : (facing === Direction.West ? 'left' : null);
  const directionalKeys = side
    ? baseKeys.map((key) => `${key}:${side}`)
    : [];

  return {
    keys: [...directionalKeys, ...baseKeys],
    directionalKeyCount: directionalKeys.length,
    flipBaseX: side === 'right',
  };
}
