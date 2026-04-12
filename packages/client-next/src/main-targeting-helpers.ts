import {
  computeAffectedCellsFromAnchor,
  encodeTileTargetRef,
  GridPoint,
  PlayerState,
  SkillDef,
  TargetingGeometrySpec,
  TargetingShape,
} from '@mud/shared-next';

/** TargetingActionState：定义该类型的结构与数据语义。 */
export type TargetingActionState = {
  actionId: string;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  width?: number;
  height?: number;
  targetMode?: string;
};

/** TargetingTarget：定义该类型的结构与数据语义。 */
export type TargetingTarget = {
  x: number;
  y: number;
  entityId?: string;
  entityKind?: string;
};

/** TargetingEntityLike：定义该类型的结构与数据语义。 */
export type TargetingEntityLike = {
  kind?: string;
  wx: number;
  wy: number;
};

/** TargetTileLike：定义该类型的结构与数据语义。 */
export type TargetTileLike = {
  hp?: number;
  maxHp?: number;
};

/** getSkillDefByActionId：执行对应的业务逻辑。 */
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

/** getCurrentSkillTargetingSpec：执行对应的业务逻辑。 */
export function getCurrentSkillTargetingSpec(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
  myPlayer: PlayerState | null,
): TargetingGeometrySpec {
  const skill = myPlayer
    ? myPlayer.techniques
      .flatMap((technique) => technique.skills)
      .find((skill) => skill.id === action.actionId)
    : null;
  return {
    range: Math.max(1, skill?.range ?? action.range),
    shape: skill?.targeting?.shape ?? action.shape ?? 'single',
    radius: skill?.targeting?.radius ?? action.radius,
    width: skill?.targeting?.width ?? action.width,
    height: skill?.targeting?.height ?? action.height,
  };
}

/** resolveCurrentTargetingRange：执行对应的业务逻辑。 */
export function resolveCurrentTargetingRange(
  action: Pick<TargetingActionState, 'actionId' | 'range'>,
  infoRadius: number,
): number {
  if (action.actionId === 'client:observe' || action.actionId === 'battle:force_attack') {
    return Math.max(1, infoRadius);
  }
  return Math.max(1, action.range);
}

/** computeAffectedCellsForAction：执行对应的业务逻辑。 */
export function computeAffectedCellsForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
  anchor: GridPoint,
  myPlayer: PlayerState | null,
): GridPoint[] {
  if (!myPlayer) {
    return [];
  }
  const spec = getCurrentSkillTargetingSpec(action, myPlayer);
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}

/** resolveTargetRefForAction：执行对应的业务逻辑。 */
export function resolveTargetRefForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
  target: TargetingTarget,
  myPlayer: PlayerState | null,
): string | null {
  const entityTargetRef = target.entityKind === 'player' && target.entityId
    ? `player:${target.entityId}`
    : target.entityKind === 'monster' && target.entityId
      ? target.entityId
      : null;
  const geometry = myPlayer ? getCurrentSkillTargetingSpec(action, myPlayer).shape : action.shape;
  if (geometry && geometry !== 'single') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  if (action.targetMode === 'entity') {
    return entityTargetRef;
  }
  if (action.targetMode === 'tile') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  if (entityTargetRef) {
    return entityTargetRef;
  }
  return encodeTileTargetRef({ x: target.x, y: target.y });
}

/** hasAffectableTargetInArea：执行对应的业务逻辑。 */
export function hasAffectableTargetInArea(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
  myPlayer: PlayerState | null,
  args: {
    entities: ReadonlyArray<TargetingEntityLike>;
    getTile: (x: number, y: number) => TargetTileLike | null;
    isPlayerLikeEntityKind: (kind: string | null | undefined) => boolean;
  },
): boolean {
  const spec = getCurrentSkillTargetingSpec(action, myPlayer);
  if (!spec.shape || spec.shape === 'single') {
    return true;
  }
  const origin = myPlayer ?? null;
  const affectedCells = computeAffectedCellsForAction(action, { x: anchorX, y: anchorY }, origin);
  if (affectedCells.length === 0) {
    return false;
  }
  return affectedCells.some((cell) => {
    const hasMonster = args.entities.some((entity) => entity.kind === 'monster' && entity.wx === cell.x && entity.wy === cell.y);
    const hasPlayer = args.entities.some((entity) => args.isPlayerLikeEntityKind(entity.kind) && entity.wx === cell.x && entity.wy === cell.y);
    if (hasMonster || hasPlayer) {
      return true;
    }
    const tile = args.getTile(cell.x, cell.y);
    return Boolean(tile?.hp && tile.hp > 0 && tile.maxHp && tile.maxHp > 0);
  });
}

