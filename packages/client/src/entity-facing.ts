import { Direction, type RenderEntity } from '@mud/shared';

type SpriteLookupEntity = Pick<RenderEntity, 'id' | 'kind' | 'name' | 'char' | 'facing' | 'monsterId'>;

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
  const monsterId = normalizeEntitySpriteSegment(entity.monsterId);
  const id = normalizeEntitySpriteSegment(entity.id);
  const name = normalizeEntitySpriteSegment(entity.name);
  const char = normalizeEntitySpriteSegment(entity.char);
  switch (entity.kind) {
    case 'monster':
      return [monsterId && `monster:${monsterId}`, id && `monster:${id}`, name && `monster:${name}`, char && `monster:${char}`, 'monster:default'].filter(Boolean) as string[];
    case 'npc':
      return [id && `npc:${id}`, name && `npc:${name}`, char && `npc:${char}`, 'npc:default'].filter(Boolean) as string[];
    case 'player':
      return [id && `player:${id}`, name && `player:${name}`, 'player:default'].filter(Boolean) as string[];
    default:
      return [];
  }
}

export function resolveMonsterFacing(
  nextFacing: Direction | null | undefined,
  previousFacing: Direction | null | undefined,
): Direction | undefined {
  if (
    nextFacing === Direction.West
    || nextFacing === Direction.East
    || nextFacing === Direction.North
    || nextFacing === Direction.South
  ) {
    return nextFacing;
  }
  if (
    previousFacing === Direction.West
    || previousFacing === Direction.East
    || previousFacing === Direction.North
    || previousFacing === Direction.South
  ) {
    return previousFacing;
  }
  return undefined;
}

export const resolveTwoWayMonsterFacing = resolveMonsterFacing;

function resolveMonsterFacingKey(facing: Direction | undefined): string | null {
  switch (facing) {
    case Direction.North:
      return 'north';
    case Direction.South:
      return 'south';
    case Direction.East:
      return 'right';
    case Direction.West:
      return 'left';
    default:
      return null;
  }
}

function resolveTwoWayMonsterSide(facing: Direction | undefined): 'left' | 'right' | null {
  if (facing === Direction.East) {
    return 'right';
  }
  if (facing === Direction.West || facing === Direction.North || facing === Direction.South) {
    return 'left';
  }
  return null;
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

  const facing = resolveMonsterFacing(entity.facing, undefined);
  const directionKey = resolveMonsterFacingKey(facing);
  const side = resolveTwoWayMonsterSide(facing);
  const directionalKeys = [
    ...(directionKey ? baseKeys.map((key) => `${key}:${directionKey}`) : []),
    ...(side && side !== directionKey ? baseKeys.map((key) => `${key}:${side}`) : []),
  ];

  return {
    keys: [...directionalKeys, ...baseKeys],
    directionalKeyCount: directionalKeys.length,
    flipBaseX: side === 'right',
  };
}
