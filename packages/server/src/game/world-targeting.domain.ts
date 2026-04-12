import {
  ActionDef,
  GameTimeState,
  gameplayConstants,
  gridDistance,
  isPointInRange,
  parseTileTargetRef,
  PlayerState,
  SkillDef,
  type QuestState,
} from '@mud/shared';
import { AoiService } from './aoi.service';
import { AttrService } from './attr.service';
import { ContentService } from './content.service';
import { LootService } from './loot.service';
import { ContainerConfig, MapService } from './map.service';
import { PlayerService } from './player.service';
import { ThreatService } from './threat.service';

/** RuntimeMonsterTargetLike：定义该接口的能力与字段约束。 */
export interface RuntimeMonsterTargetLike {
/** runtimeId：定义该变量以承载业务值。 */
  runtimeId: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** alive：定义该变量以承载业务值。 */
  alive: boolean;
/** tier：定义该变量以承载业务值。 */
  tier: 'mortal_blood' | 'variant' | 'demon_king';
/** aggroRange：定义该变量以承载业务值。 */
  aggroRange: number;
}

/** ResolvedTargetLike：定义该类型的结构与数据语义。 */
export type ResolvedTargetLike =
  | { kind: 'monster'; x: number; y: number; monster: RuntimeMonsterTargetLike }
  | { kind: 'player'; x: number; y: number; player: PlayerState }
  | { kind: 'container'; x: number; y: number; container: ContainerConfig }
  | { kind: 'tile'; x: number; y: number; tileType?: string };

/** AutoBattleSkillCandidateLike：定义该接口的能力与字段约束。 */
export interface AutoBattleSkillCandidateLike {
/** action：定义该变量以承载业务值。 */
  action: ActionDef;
/** skill：定义该变量以承载业务值。 */
  skill: SkillDef;
}

/** DomainDeps：定义该接口的能力与字段约束。 */
interface DomainDeps {
  getMonstersByMap: (mapId: string) => RuntimeMonsterTargetLike[];
  canPlayerCastSkill: (player: PlayerState, skill: SkillDef) => boolean;
  buildEffectiveSkillRange: (skill: SkillDef, player: PlayerState) => number;
  canPlayerUseHostileEffectOnTarget: (player: PlayerState, target: ResolvedTargetLike) => boolean;
  canReachAttackPosition: (
    mapId: string,
/** actor：定义该变量以承载业务值。 */
    actor: { x: number; y: number },
    target: ResolvedTargetLike,
    range: number,
    selfOccupancyId: string,
    actorType: 'player' | 'monster',
  ) => boolean;
  getPlayerThreatId: (player: PlayerState) => string;
  getMonsterThreatId: (monster: RuntimeMonsterTargetLike) => string;
  getExtraAggroRate: (target: PlayerState | RuntimeMonsterTargetLike) => number;
  isMonsterAutoAggroEnabled: (monster: RuntimeMonsterTargetLike, timeState: GameTimeState) => boolean;
  clearCombatTarget: (player: PlayerState) => void;
}

/** WorldTargetingDomain：封装相关状态与行为。 */
export class WorldTargetingDomain {
  constructor(
    private readonly attrService: AttrService,
    private readonly contentService: ContentService,
    private readonly aoiService: AoiService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly lootService: LootService,
    private readonly threatService: ThreatService,
    private readonly deps: DomainDeps,
  ) {}

/** getResolvedTargetHpRatio：执行对应的业务逻辑。 */
  getResolvedTargetHpRatio(target: ResolvedTargetLike): number {
    if (target.kind === 'tile' || target.kind === 'container') {
      return 0;
    }
/** hp：定义该变量以承载业务值。 */
    const hp = target.kind === 'monster' ? target.monster.hp : target.player.hp;
/** maxHp：定义该变量以承载业务值。 */
    const maxHp = target.kind === 'monster' ? target.monster.maxHp : target.player.maxHp;
    if (!Number.isFinite(maxHp) || maxHp <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, hp / maxHp));
  }

  getPlayerTargetingThreatMultiplier(
    player: PlayerState,
    target: ResolvedTargetLike,
    distance: number,
    hpRatio: number,
    nearestDistance: number,
    lowestHpRatio: number,
    highestHpRatio: number,
  ): number {
/** multiplier：定义该变量以承载业务值。 */
    const multiplier = gameplayConstants.PLAYER_TARGETING_PREFERENCE_THREAT_MULTIPLIER;
    switch (player.autoBattleTargetingMode) {
      case 'nearest':
        return distance === nearestDistance ? multiplier : 1;
      case 'low_hp':
        return Math.abs(hpRatio - lowestHpRatio) <= 1e-6 ? multiplier : 1;
      case 'full_hp':
        return Math.abs(hpRatio - highestHpRatio) <= 1e-6 ? multiplier : 1;
      case 'boss':
        return target.kind === 'monster' && target.monster.tier === 'demon_king' ? multiplier : 1;
      case 'player':
        return target.kind === 'player' ? multiplier : 1;
      default:
        return 1;
    }
  }

/** collectAutoBattleSkillCandidates：执行对应的业务逻辑。 */
  collectAutoBattleSkillCandidates(player: PlayerState): AutoBattleSkillCandidateLike[] {
/** skillActionMap：定义该变量以承载业务值。 */
    const skillActionMap = new Map(
      player.actions
        .filter((action) => action.type === 'skill')
        .map((action) => [action.id, action] as const),
    );

    return player.autoBattleSkills
      .filter((entry) => entry.enabled && entry.skillEnabled !== false)
      .map((entry) => skillActionMap.get(entry.skillId))
      .filter((action): action is ActionDef => action !== undefined && action.skillEnabled !== false && action.cooldownLeft === 0)
      .map((action) => {
/** skill：定义该变量以承载业务值。 */
        const skill = this.contentService.getSkill(action.id);
        return skill ? { action, skill } : null;
      })
      .filter((entry): entry is AutoBattleSkillCandidateLike => entry !== null)
      .filter((entry) => this.deps.canPlayerCastSkill(player, entry.skill));
  }

/** resolveAutoBattlePreferredRange：执行对应的业务逻辑。 */
  resolveAutoBattlePreferredRange(player: PlayerState, skills: AutoBattleSkillCandidateLike[]): number {
    return skills.reduce((maxRange, entry) => Math.max(maxRange, this.deps.buildEffectiveSkillRange(entry.skill, player)), 1);
  }

  selectAutoBattleSkillForTarget(
    player: PlayerState,
    target: ResolvedTargetLike,
    skills: AutoBattleSkillCandidateLike[],
  ): AutoBattleSkillCandidateLike | undefined {
    return skills.find((entry) => (
      entry.skill.requiresTarget === false
      || isPointInRange(player, target, this.deps.buildEffectiveSkillRange(entry.skill, player))
    ));
  }

  canPlayerCastAutoBattleSkillFromCurrentPosition(
    player: PlayerState,
    target: ResolvedTargetLike,
    effectiveViewRange: number,
    skills: AutoBattleSkillCandidateLike[],
  ): boolean {
    if (!this.deps.canPlayerUseHostileEffectOnTarget(player, target) || target.kind === 'tile') {
      return false;
    }
    if (!this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return false;
    }
    return isPointInRange(player, target, 1)
      || skills.some((entry) => (
        entry.skill.requiresTarget === false
        || isPointInRange(player, target, this.deps.buildEffectiveSkillRange(entry.skill, player))
      ));
  }

/** refreshPlayerThreats：执行对应的业务逻辑。 */
  refreshPlayerThreats(player: PlayerState, effectiveViewRange: number): void {
/** ownerId：定义该变量以承载业务值。 */
    const ownerId = this.deps.getPlayerThreatId(player);
    for (const monster of this.deps.getMonstersByMap(player.mapId)) {
      if (!monster.alive) continue;
      if (!this.canPlayerSeeTarget(player, { kind: 'monster', x: monster.x, y: monster.y, monster }, effectiveViewRange)) {
        continue;
      }
      this.threatService.addThreat({
        ownerId,
        targetId: this.deps.getMonsterThreatId(monster),
        baseThreat: gameplayConstants.DEFAULT_PASSIVE_THREAT_PER_TICK,
        targetExtraAggroRate: this.deps.getExtraAggroRate(monster),
        distance: gridDistance(player, monster),
      });
    }

    for (const entry of this.threatService.getThreatEntries(ownerId)) {
      const target = this.resolveThreatTargetForPlayer(player, entry.targetId);
      if (!target || target.kind === 'tile' || !this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
        this.threatService.decayThreat(ownerId, entry.targetId, player.maxHp);
      }
    }
  }

/** resolveThreatTargetForPlayer：执行对应的业务逻辑。 */
  resolveThreatTargetForPlayer(player: PlayerState, targetId: string): ResolvedTargetLike | null {
    return this.resolveTargetRef(player, targetId);
  }

  canPlayerAttackTarget(
    player: PlayerState,
    target: ResolvedTargetLike,
    effectiveViewRange: number,
    range: number,
  ): boolean {
    if (!this.deps.canPlayerUseHostileEffectOnTarget(player, target)) {
      return false;
    }
    if (!this.canPlayerSeeTarget(player, target, effectiveViewRange)) {
      return false;
    }
    return this.deps.canReachAttackPosition(player.mapId, player, target, range, player.id, 'player');
  }

  refreshMonsterThreats(
    monster: RuntimeMonsterTargetLike,
    players: PlayerState[],
    timeState: GameTimeState,
  ): void {
/** ownerId：定义该变量以承载业务值。 */
    const ownerId = this.deps.getMonsterThreatId(monster);
/** scanRange：定义该变量以承载业务值。 */
    const scanRange = Math.max(0, Math.min(monster.aggroRange, timeState.effectiveViewRange));

    if (this.deps.isMonsterAutoAggroEnabled(monster, timeState)) {
      for (const player of players) {
        if (!this.canMonsterSeeTarget(monster, player, timeState, scanRange)) {
          continue;
        }
        this.threatService.addThreat({
          ownerId,
          targetId: this.deps.getPlayerThreatId(player),
          baseThreat: gameplayConstants.DEFAULT_PASSIVE_THREAT_PER_TICK,
          targetExtraAggroRate: this.deps.getExtraAggroRate(player),
          distance: gridDistance(monster, player),
        });
      }
    }

    for (const entry of this.threatService.getThreatEntries(ownerId)) {
      const target = this.resolveThreatPlayerForMonster(monster, entry.targetId);
      if (!target || !this.canMonsterSeeTarget(monster, target, timeState, scanRange)) {
        this.threatService.decayThreat(ownerId, entry.targetId, monster.maxHp);
      }
    }
  }

/** resolveThreatPlayerForMonster：执行对应的业务逻辑。 */
  resolveThreatPlayerForMonster(monster: RuntimeMonsterTargetLike, targetId: string): PlayerState | null {
    if (!targetId.startsWith('player:')) {
      return null;
    }
/** playerId：定义该变量以承载业务值。 */
    const playerId = targetId.slice('player:'.length);
/** player：定义该变量以承载业务值。 */
    const player = this.playerService.getPlayer(playerId);
    if (!player || player.dead || player.mapId !== monster.mapId) {
      return null;
    }
    return player;
  }

  canMonsterSeeTarget(
    monster: RuntimeMonsterTargetLike,
    target: PlayerState,
    timeState: GameTimeState,
    scanRange: number,
  ): boolean {
    if (target.dead || target.mapId !== monster.mapId) {
      return false;
    }
    if (!isPointInRange(monster, target, scanRange)) {
      return false;
    }
    return this.aoiService.inViewAt(
      monster.mapId,
      monster.x,
      monster.y,
      timeState.effectiveViewRange,
      target.x,
      target.y,
      monster.runtimeId,
    );
  }

  canMonsterAttackTarget(
    monster: RuntimeMonsterTargetLike,
    target: PlayerState,
    timeState: GameTimeState,
  ): boolean {
/** scanRange：定义该变量以承载业务值。 */
    const scanRange = Math.max(0, Math.min(monster.aggroRange, timeState.effectiveViewRange));
    if (!this.canMonsterSeeTarget(monster, target, timeState, scanRange)) {
      return false;
    }
    return this.deps.canReachAttackPosition(
      monster.mapId,
      monster,
      { kind: 'player', x: target.x, y: target.y, player: target },
      1,
      monster.runtimeId,
      'monster',
    );
  }

/** resolveCombatTarget：执行对应的业务逻辑。 */
  resolveCombatTarget(player: PlayerState): ResolvedTargetLike | undefined {
    if (!player.combatTargetId) return undefined;
/** target：定义该变量以承载业务值。 */
    const target = this.resolveTargetRef(player, player.combatTargetId);
    if (!target) {
      this.deps.clearCombatTarget(player);
      return undefined;
    }
    return target;
  }

  stopLockedForceAttackForInvalidTile(
    player: PlayerState,
    target: ResolvedTargetLike,
/** update：定义该变量以承载业务值。 */
    update: { error?: string; messages: Array<{ playerId: string; text: string; kind?: string }>; dirty: string[] },
  ) {
    if (
      !player.combatTargetLocked
      || target.kind !== 'tile'
      || (update.error !== '该目标无法被攻击' && update.error !== '没有可命中的目标')
    ) {
      return null;
    }

    player.autoBattle = false;
    this.deps.clearCombatTarget(player);
    return {
      ...update,
      error: undefined,
      messages: [
        ...update.messages,
        {
          playerId: player.id,
          text: '强制攻击目标无法被攻击，自动战斗已停止。',
          kind: 'combat',
        },
      ],
      dirty: [...new Set([...update.dirty, 'actions'])],
    };
  }

/** canPlayerSeeTarget：执行对应的业务逻辑。 */
  canPlayerSeeTarget(player: PlayerState, target: ResolvedTargetLike, effectiveViewRange: number): boolean {
    if (!isPointInRange(player, target, effectiveViewRange)) {
      return false;
    }
    return this.aoiService.inView(player, target.x, target.y, effectiveViewRange);
  }

/** resolveTargetRef：执行对应的业务逻辑。 */
  resolveTargetRef(player: PlayerState, targetRef: string): ResolvedTargetLike | null {
    if (targetRef.startsWith('monster:')) {
/** monster：定义该变量以承载业务值。 */
      const monster = this.deps.getMonstersByMap(player.mapId).find((entry) => entry.runtimeId === targetRef && entry.alive);
      if (!monster) return null;
      return { kind: 'monster', x: monster.x, y: monster.y, monster };
    }

    if (targetRef.startsWith('player:')) {
/** playerId：定义该变量以承载业务值。 */
      const playerId = targetRef.slice('player:'.length);
/** targetPlayer：定义该变量以承载业务值。 */
      const targetPlayer = this.playerService.getPlayer(playerId);
      if (!targetPlayer || targetPlayer.id === player.id || targetPlayer.mapId !== player.mapId || targetPlayer.dead) {
        return null;
      }
      return { kind: 'player', x: targetPlayer.x, y: targetPlayer.y, player: targetPlayer };
    }

    if (targetRef.startsWith('container:')) {
/** containerId：定义该变量以承载业务值。 */
      const containerId = targetRef.slice('container:'.length);
/** container：定义该变量以承载业务值。 */
      const container = this.mapService.getContainerById(player.mapId, containerId);
      if (!container || container.variant !== 'herb') {
        return null;
      }
/** runtime：定义该变量以承载业务值。 */
      const runtime = this.lootService.getContainerRuntimeView(player.mapId, container);
      if (runtime.destroyed || runtime.respawning) {
        return null;
      }
      return { kind: 'container', x: container.x, y: container.y, container };
    }

/** tileTarget：定义该变量以承载业务值。 */
    const tileTarget = parseTileTargetRef(targetRef);
    if (tileTarget) {
      const { x, y } = tileTarget;
/** container：定义该变量以承载业务值。 */
      const container = this.mapService.getContainerAt(player.mapId, x, y);
      if (container?.variant === 'herb') {
/** runtime：定义该变量以承载业务值。 */
        const runtime = this.lootService.getContainerRuntimeView(player.mapId, container);
        if (!runtime.destroyed && !runtime.respawning) {
          return { kind: 'container', x: container.x, y: container.y, container };
        }
      }
/** tile：定义该变量以承载业务值。 */
      const tile = this.mapService.getTile(player.mapId, x, y);
      if (!tile || this.mapService.isTileDestroyed(player.mapId, x, y)) return null;
      return { kind: 'tile', x, y, tileType: tile.type };
    }

    return null;
  }
}

