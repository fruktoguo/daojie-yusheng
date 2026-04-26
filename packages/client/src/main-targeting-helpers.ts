import {
  computeAffectedCellsFromAnchor,
  encodeTileTargetRef,
  FormationRangeShape,
  GridPoint,
  PlayerState,
  resolveTargetingGeometry,
  SkillDef,
  TargetingGeometrySpec,
  TargetingShape,
} from '@mud/shared';

/** 记录当前待执行动作的目标参数，供落点、范围和目标解析复用。 */
export type TargetingActionState = {
/**
 * actionId：actionID标识。
 */

  actionId: string;
  /**
 * range：范围相关字段。
 */

  range: number;
  /**
 * shape：shape相关字段。
 */

  shape?: TargetingShape;
  /**
 * radius：radiu相关字段。
 */

  radius?: number;
  /**
 * innerRadius：环带内半径。
 */

  innerRadius?: number;
  /**
 * width：width相关字段。
 */

  width?: number;
  /**
 * height：height相关字段。
 */

  height?: number;
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: string;
};

/** 落点或候选实体的轻量快照，仅保留坐标和类型信息。 */
export type TargetingTarget = {
/**
 * x：x相关字段。
 */

  x: number;
  /**
 * y：y相关字段。
 */

  y: number;
  /**
 * entityId：entityID标识。
 */

  entityId?: string;
  /**
 * entityKind：entityKind相关字段。
 */

  entityKind?: string;
};

/** 用于判定命中范围的实体轻量对象。 */
export type TargetingEntityLike = {
/**
 * kind：kind相关字段。
 */

  kind?: string;
  /**
 * wx：wx相关字段。
 */

  wx: number;
  /**
 * wy：wy相关字段。
 */

  wy: number;
  /**
 * hp：当前生命，用于可破坏对象目标判定。
 */

  hp?: number;
  /**
 * maxHp：最大生命，用于可破坏对象目标判定。
 */

  maxHp?: number;
  formationRadius?: number;
  formationRangeShape?: FormationRangeShape;
  formationBlocksBoundary?: boolean;
  formationOwnerSectId?: string | null;
  formationOwnerPlayerId?: string | null;
};

/** 用于判断格子上是否存在可作用地块的轻量对象。 */
export type TargetTileLike = {
/**
 * hp：hp相关字段。
 */

  hp?: number;
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;
};

/** 按动作 ID 反查对应技能定义，便于后续按技能模板计算范围。 */
export function getSkillDefByActionId(myPlayer: PlayerState | null, actionId: string): SkillDef | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!myPlayer) return null;
  for (const technique of myPlayer.techniques) {
    const skill = technique.skills.find((entry) => entry.id === actionId);
    if (skill) {
      return skill;
    }
  }
  return null;
}

/** 读取玩家技能几何修饰，负数不参与扩大目标几何。 */
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

/** 汇总当前动作最终目标规则，叠加玩家额外射程和额外范围。 */
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

/** 计算当前动作的可用距离，侦测与观察类动作使用视野范围。 */
export function resolveCurrentTargetingRange(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  myPlayer: PlayerState | null,
  infoRadius: number,
): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (action.actionId === 'client:observe' || action.actionId === 'battle:force_attack') {
    return Math.max(1, infoRadius);
  }
  return Math.max(1, getEffectiveTargetingGeometry(action, myPlayer).range);
}

/** 以玩家当前位置和锚点为基准，计算该动作会影响到的格子。 */
export function computeAffectedCellsForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchor: GridPoint,
  myPlayer: PlayerState | null,
): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!myPlayer) {
    return [];
  }
  const spec = getEffectiveTargetingGeometry(action, myPlayer);
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}

/** 将目标坐标或实体转换为服务端可识别的 targeting ref。 */
export function resolveTargetRefForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'innerRadius' | 'width' | 'height' | 'targetMode'>,
  target: TargetingTarget,
  myPlayer: PlayerState | null,
): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const entityTargetRef = target.entityKind === 'player' && target.entityId
    ? `player:${target.entityId}`
    : (target.entityKind === 'monster' || target.entityKind === 'formation') && target.entityId
      ? target.entityId
      : null;
  const geometry = getEffectiveTargetingGeometry(action, myPlayer);
  if ((geometry.shape ?? 'single') !== 'single') {
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

/** 判断候选落点周围是否存在可作用目标，用于高亮与防误点。 */
export function hasAffectableTargetInArea(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'innerRadius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
  myPlayer: PlayerState | null,
  args: {
  /**
 * entities：entity相关字段。
 */

    entities: ReadonlyArray<TargetingEntityLike>;
    /**
 * getTile：Tile相关字段。
 */

    getTile: (x: number, y: number) => TargetTileLike | null;
    /**
 * isPlayerLikeEntityKind：启用开关或状态标识。
 */

    isPlayerLikeEntityKind: (kind: string | null | undefined) => boolean;
  },
): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const hasFormation = args.entities.some((entity) => entity.kind === 'formation' && entity.wx === cell.x && entity.wy === cell.y);
    const hasPlayer = args.entities.some((entity) => args.isPlayerLikeEntityKind(entity.kind) && entity.wx === cell.x && entity.wy === cell.y);
    if (hasMonster || hasFormation || hasPlayer) {
      return true;
    }
    const hasFormationBoundary = args.entities.some((entity) => (
      entity.kind === 'formation'
      && entity.formationBlocksBoundary === true
      && !canPlayerPassFormationBoundary(myPlayer, entity)
      && isCellOnFormationBoundary(entity, cell.x, cell.y)
    ));
    if (hasFormationBoundary) {
      return true;
    }
    const hasAttackableContainer = args.entities.some((entity) => (
      entity.kind === 'container'
      && entity.wx === cell.x
      && entity.wy === cell.y
      && (entity.hp ?? 0) > 0
      && (entity.maxHp ?? 0) > 0
    ));
    if (hasAttackableContainer) {
      return true;
    }
    const tile = args.getTile(cell.x, cell.y);
    return Boolean(tile?.hp && tile.hp > 0 && tile.maxHp && tile.maxHp > 0);
  });
}

function isCellOnFormationBoundary(entity: TargetingEntityLike, x: number, y: number): boolean {
  const radius = Math.max(1, Math.trunc(Number(entity.formationRadius) || 0));
  const dx = x - entity.wx;
  const dy = y - entity.wy;
  if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
    return false;
  }
  if (entity.formationRangeShape === 'circle') {
    return (dx * dx) + (dy * dy) <= radius * radius
      && (
        ((dx + 1) * (dx + 1)) + (dy * dy) > radius * radius
        || ((dx - 1) * (dx - 1)) + (dy * dy) > radius * radius
        || (dx * dx) + ((dy + 1) * (dy + 1)) > radius * radius
        || (dx * dx) + ((dy - 1) * (dy - 1)) > radius * radius
      );
  }
  return Math.abs(dx) === radius || Math.abs(dy) === radius;
}

function canPlayerPassFormationBoundary(
  player: Pick<PlayerState, 'id' | 'sectId'> | null | undefined,
  entity: Pick<TargetingEntityLike, 'formationOwnerSectId' | 'formationOwnerPlayerId'>,
): boolean {
  if (player?.id && normalizePlayerId(entity.formationOwnerPlayerId) === player.id) {
    return true;
  }
  const playerSectId = normalizeSectId(player?.sectId);
  const ownerSectId = normalizeSectId(entity.formationOwnerSectId);
  return Boolean(playerSectId && ownerSectId && playerSectId === ownerSectId);
}

function normalizePlayerId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSectId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
