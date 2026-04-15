import {
  computeAffectedCellsFromAnchor,
  encodeTileTargetRef,
  GridPoint,
  PlayerState,
  resolveTargetingGeometry,
  SkillDef,
  TargetingGeometrySpec,
  TargetingShape,
} from '@mud/shared';

export type TargetingActionState = {
  actionId: string;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  targetMode?: string;
  maxTargets?: number;
};

export type TargetingTarget = {
  x: number;
  y: number;
  entityId?: string;
  entityKind?: string;
};

export type TargetingEntityLike = {
  kind?: string;
  wx: number;
  wy: number;
  hp?: number;
  maxHp?: number;
};

export type TargetTileLike = {
  hp?: number;
  maxHp?: number;
};

export function getSkillDefByActionId(myPlayer: PlayerState | null, actionId: string): SkillDef | null {
  if (!myPlayer) return null;
  for (const technique of myPlayer.techniques) {
    const skill = technique.skills.find((entry) => entry.id === actionId);
    if (skill) {
      return skill;
    }
  }
  return null;
}

export function getPlayerTargetingModifiers(
  numericStats?: PlayerState['numericStats'] | null,
): { extraRange: number; extraArea: number } | undefined {
  if (!numericStats) {
    return undefined;
  }
  return {
    extraRange: Math.max(0, Math.floor(numericStats.extraRange ?? 0)),
    extraArea: Math.max(0, Math.floor(numericStats.extraArea ?? 0)),
  };
}

export function getEffectiveTargetingGeometry(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  myPlayer: PlayerState | null,
): TargetingGeometrySpec {
  const skill = getSkillDefByActionId(myPlayer, action.actionId);
  const baseSpec: TargetingGeometrySpec = {
    range: Math.max(1, skill?.range ?? action.range),
    shape: skill?.targeting?.shape ?? action.shape ?? 'single',
    radius: skill?.targeting?.radius ?? action.radius,
    innerRadius: skill?.targeting?.innerRadius ?? action.innerRadius,
    width: skill?.targeting?.width ?? action.width,
    height: skill?.targeting?.height ?? action.height,
  };
  if (!skill) {
    return baseSpec;
  }

  const modifiers = getPlayerTargetingModifiers(myPlayer?.numericStats);
  return resolveTargetingGeometry(baseSpec, {
    finalRange: Math.max(0, Math.floor(baseSpec.range) + Math.max(0, Math.floor(modifiers?.extraRange ?? 0))),
    extraArea: Math.max(0, Math.floor(modifiers?.extraArea ?? 0)),
  });
}


export function resolveCurrentTargetingRange(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  myPlayer: PlayerState | null,
  infoRadius: number,
): number {
  if (action.actionId === 'client:observe' || action.actionId === 'battle:force_attack') {
    return Math.max(1, infoRadius);
  }
  return Math.max(1, getEffectiveTargetingGeometry(action, myPlayer).range);
}


export function computeAffectedCellsForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchor: GridPoint,
  myPlayer: PlayerState | null,
): GridPoint[] {
  if (!myPlayer) {
    return [];
  }
  const spec = getEffectiveTargetingGeometry(action, myPlayer);
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}


export function resolveTargetRefForAction(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
  target: TargetingTarget,
  myPlayer: PlayerState | null,
): string | null {
  const entityTargetRef = target.entityKind === 'player' && target.entityId
    ? `player:${target.entityId}`
    : target.entityKind === 'monster' && target.entityId
      ? target.entityId
      : null;

  const geometry = getEffectiveTargetingGeometry(action, myPlayer);
  if ((geometry.shape ?? 'single') !== 'single') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  const targetMode = action.targetMode;
  if (targetMode === 'entity') {
    return entityTargetRef;
  }
  if (targetMode === 'tile') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  if (entityTargetRef) {
    return entityTargetRef;
  }
  return encodeTileTargetRef({ x: target.x, y: target.y });
}

/** hasAffectableTargetInArea：判断并返回条件结果。 */
export function hasAffectableTargetInArea(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
  myPlayer: PlayerState | null,
  args: {
    entities: ReadonlyArray<TargetingEntityLike>;
    getTile: (x: number, y: number) => TargetTileLike | null;
    isPlayerLikeEntityKind: (kind: string | null | undefined) => boolean;
  },
): boolean {
  const geometry = getEffectiveTargetingGeometry(action, myPlayer);
  if (!geometry.shape || geometry.shape === 'single') {
    return true;
  }
  const origin = myPlayer ?? null;
  const affectedCells = computeAffectedCellsForAction(action, { x: anchorX, y: anchorY }, origin);
  if (affectedCells.length === 0) {
    return false;
  }
  return affectedCells.some((cell) => {
    const hasMonster = args.entities.some((entity) => entity.kind === 'monster' && entity.wx === cell.x && entity.wy === cell.y);
    const hasPlayer = args.entities.some(
      (entity) => args.isPlayerLikeEntityKind(entity.kind) && entity.wx === cell.x && entity.wy === cell.y,
    );
    const hasAttackableContainer = args.entities.some((entity) => (
      entity.kind === 'container'
      && entity.wx === cell.x
      && entity.wy === cell.y
      && (entity.hp ?? 0) > 0
      && (entity.maxHp ?? 0) > 0
    ));
    if (hasMonster || hasPlayer || hasAttackableContainer) {
      return true;
    }
    const tile = args.getTile(cell.x, cell.y);
    return Boolean(tile?.hp && tile.hp > 0 && tile.maxHp && tile.maxHp > 0);
  });
}

