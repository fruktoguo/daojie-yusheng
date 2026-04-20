import {
  computeAffectedCellsFromAnchor,
  encodeTileTargetRef,
  GridPoint,
  PlayerState,
  SkillDef,
  TargetingGeometrySpec,
  TargetingShape,
} from '@mud/shared-next';

/** 记录当前待执行动作的目标参数，供落点、范围和目标解析复用。 */
export type TargetingActionState = {
/**
 * actionId：对象字段。
 */

  actionId: string;  
  /**
 * range：对象字段。
 */

  range: number;  
  /**
 * shape：对象字段。
 */

  shape?: TargetingShape;  
  /**
 * radius：对象字段。
 */

  radius?: number;  
  /**
 * width：对象字段。
 */

  width?: number;  
  /**
 * height：对象字段。
 */

  height?: number;  
  /**
 * targetMode：对象字段。
 */

  targetMode?: string;
};

/** 落点或候选实体的轻量快照，仅保留坐标和类型信息。 */
export type TargetingTarget = {
/**
 * x：对象字段。
 */

  x: number;  
  /**
 * y：对象字段。
 */

  y: number;  
  /**
 * entityId：对象字段。
 */

  entityId?: string;  
  /**
 * entityKind：对象字段。
 */

  entityKind?: string;
};

/** 用于判定命中范围的实体轻量对象。 */
export type TargetingEntityLike = {
/**
 * kind：对象字段。
 */

  kind?: string;  
  /**
 * wx：对象字段。
 */

  wx: number;  
  /**
 * wy：对象字段。
 */

  wy: number;
};

/** 用于判断格子上是否存在可作用地块的轻量对象。 */
export type TargetTileLike = {
/**
 * hp：对象字段。
 */

  hp?: number;  
  /**
 * maxHp：对象字段。
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

/** 汇总当前动作的目标规则，优先用玩家侧配置，再回退到技能模板。 */
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

/** 计算当前动作的可用距离，侦测与观察类动作使用视野范围。 */
export function resolveCurrentTargetingRange(
  action: Pick<TargetingActionState, 'actionId' | 'range'>,
  infoRadius: number,
): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (action.actionId === 'client:observe' || action.actionId === 'battle:force_attack') {
    return Math.max(1, infoRadius);
  }
  return Math.max(1, action.range);
}

/** 以玩家当前位置和锚点为基准，计算该动作会影响到的格子。 */
export function computeAffectedCellsForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height'>,
  anchor: GridPoint,
  myPlayer: PlayerState | null,
): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!myPlayer) {
    return [];
  }
  const spec = getCurrentSkillTargetingSpec(action, myPlayer);
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}

/** 将目标坐标或实体转换为服务端可识别的 targeting ref。 */
export function resolveTargetRefForAction(
  action: Pick<TargetingActionState, 'actionId' | 'range' | 'shape' | 'radius' | 'width' | 'height' | 'targetMode'>,
  target: TargetingTarget,
  myPlayer: PlayerState | null,
): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 判断候选落点周围是否存在可作用目标，用于高亮与防误点。 */
export function hasAffectableTargetInArea(
  action: Pick<TargetingActionState, 'actionId' | 'shape' | 'range' | 'radius' | 'width' | 'height'>,
  anchorX: number,
  anchorY: number,
  myPlayer: PlayerState | null,
  args: {  
  /**
 * entities：对象字段。
 */

    entities: ReadonlyArray<TargetingEntityLike>;    
    /**
 * getTile：对象字段。
 */

    getTile: (x: number, y: number) => TargetTileLike | null;    
    /**
 * isPlayerLikeEntityKind：对象字段。
 */

    isPlayerLikeEntityKind: (kind: string | null | undefined) => boolean;
  },
): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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


