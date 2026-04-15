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

/** TargetingActionState：定义该类型的结构与数据语义。 */
export type TargetingActionState = {
/** actionId：定义该变量以承载业务值。 */
  actionId: string;
/** range：定义该变量以承载业务值。 */
  range: number;
  shape?: TargetingShape;
  radius?: number;
  innerRadius?: number;
  width?: number;
  height?: number;
  targetMode?: string;
  maxTargets?: number;
};

/** TargetingTarget：定义该类型的结构与数据语义。 */
export type TargetingTarget = {
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
  entityId?: string;
  entityKind?: string;
};

/** TargetingEntityLike：定义该类型的结构与数据语义。 */
export type TargetingEntityLike = {
  kind?: string;
/** wx：定义该变量以承载业务值。 */
  wx: number;
/** wy：定义该变量以承载业务值。 */
  wy: number;
  hp?: number;
  maxHp?: number;
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

/** getPlayerTargetingModifiers：执行对应的业务逻辑。 */
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

/** getEffectiveTargetingGeometry：执行对应的业务逻辑。 */
export function getEffectiveTargetingGeometry(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  myPlayer: PlayerState | null,
): TargetingGeometrySpec {
/** skill：定义该变量以承载业务值。 */
  const skill = getSkillDefByActionId(myPlayer, action.actionId);
/** baseSpec：定义该变量以承载业务值。 */
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

/** modifiers：定义该变量以承载业务值。 */
  const modifiers = getPlayerTargetingModifiers(myPlayer?.numericStats);
  return resolveTargetingGeometry(baseSpec, {
    finalRange: Math.max(0, Math.floor(baseSpec.range) + Math.max(0, Math.floor(modifiers?.extraRange ?? 0))),
    extraArea: Math.max(0, Math.floor(modifiers?.extraArea ?? 0)),
  });
}

/** resolveCurrentTargetingRange：执行对应的业务逻辑。 */
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

/** computeAffectedCellsForAction：执行对应的业务逻辑。 */
export function computeAffectedCellsForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchor: GridPoint,
  myPlayer: PlayerState | null,
): GridPoint[] {
  if (!myPlayer) {
    return [];
  }
/** spec：定义该变量以承载业务值。 */
  const spec = getEffectiveTargetingGeometry(action, myPlayer);
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}

/** resolveTargetRefForAction：执行对应的业务逻辑。 */
export function resolveTargetRefForAction(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
  target: TargetingTarget,
  myPlayer: PlayerState | null,
): string | null {
/** entityTargetRef：定义该变量以承载业务值。 */
  const entityTargetRef = target.entityKind === 'player' && target.entityId
    ? `player:${target.entityId}`
    : target.entityKind === 'monster' && target.entityId
      ? target.entityId
      : null;

/** geometry：定义该变量以承载业务值。 */
  const geometry = getEffectiveTargetingGeometry(action, myPlayer);
  if ((geometry.shape ?? 'single') !== 'single') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
/** targetMode：定义该变量以承载业务值。 */
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

/** hasAffectableTargetInArea：执行对应的业务逻辑。 */
export function hasAffectableTargetInArea(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
  myPlayer: PlayerState | null,
  args: {
/** entities：定义该变量以承载业务值。 */
    entities: ReadonlyArray<TargetingEntityLike>;
    getTile: (x: number, y: number) => TargetTileLike | null;
    isPlayerLikeEntityKind: (kind: string | null | undefined) => boolean;
  },
): boolean {
/** geometry：定义该变量以承载业务值。 */
  const geometry = getEffectiveTargetingGeometry(action, myPlayer);
  if (!geometry.shape || geometry.shape === 'single') {
    return true;
  }
/** origin：定义该变量以承载业务值。 */
  const origin = myPlayer ?? null;
/** affectedCells：定义该变量以承载业务值。 */
  const affectedCells = computeAffectedCellsForAction(action, { x: anchorX, y: anchorY }, origin);
  if (affectedCells.length === 0) {
    return false;
  }
  return affectedCells.some((cell) => {
/** hasMonster：定义该变量以承载业务值。 */
    const hasMonster = args.entities.some((entity) => entity.kind === 'monster' && entity.wx === cell.x && entity.wy === cell.y);
/** hasPlayer：定义该变量以承载业务值。 */
    const hasPlayer = args.entities.some(
      (entity) => args.isPlayerLikeEntityKind(entity.kind) && entity.wx === cell.x && entity.wy === cell.y,
    );
/** hasAttackableContainer：定义该变量以承载业务值。 */
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
/** tile：定义该变量以承载业务值。 */
    const tile = args.getTile(cell.x, cell.y);
    return Boolean(tile?.hp && tile.hp > 0 && tile.maxHp && tile.maxHp > 0);
  });
}

