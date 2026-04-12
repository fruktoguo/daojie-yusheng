import {
  Attributes,
  MONSTER_TIER_LABELS,
  NpcQuestMarker,
  NumericStats,
  PlayerState,
  RenderEntity,
  TemporaryBuffState,
  type ObservedTileEntityDetail,
  VisibleBuffState,
  createNumericStats,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { ContentService } from './content.service';
import { LootService } from './loot.service';
import { ContainerConfig, DropConfig, MapService, NpcConfig } from './map.service';
import {
  buildObservationInsight,
  buildObservationLineSpecs,
  ObservationTargetSnapshot,
} from './world-observation.helpers';
import {
  DEFAULT_MONSTER_RATIO_DIVISORS,
  NPC_ROLE_PROFILES,
} from '../constants/world/overview';
import { estimateMonsterSpiritFromStats } from '@mud/shared';
import { getMonsterDisplayName } from './world.service.shared';

/** NpcPresenceProfile：定义该接口的能力与字段约束。 */
interface NpcPresenceProfile {
/** title：定义该变量以承载业务值。 */
  title: string;
/** spirit：定义该变量以承载业务值。 */
  spirit: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
}

/** CombatSnapshotLike：定义该接口的能力与字段约束。 */
interface CombatSnapshotLike {
/** attrs：定义该变量以承载业务值。 */
  attrs: Attributes;
/** stats：定义该变量以承载业务值。 */
  stats: NumericStats;
}

/** RuntimeMonsterLike：定义该接口的能力与字段约束。 */
interface RuntimeMonsterLike {
/** runtimeId：定义该变量以承载业务值。 */
  runtimeId: string;
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** x：定义该变量以承载业务值。 */
  x: number;
/** y：定义该变量以承载业务值。 */
  y: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
/** qi：定义该变量以承载业务值。 */
  qi: number;
/** char：定义该变量以承载业务值。 */
  char: string;
/** color：定义该变量以承载业务值。 */
  color: string;
/** tier：定义该变量以承载业务值。 */
  tier: 'mortal_blood' | 'variant' | 'demon_king';
  level?: number;
/** attack：定义该变量以承载业务值。 */
  attack: number;
/** drops：定义该变量以承载业务值。 */
  drops: DropConfig[];
/** temporaryBuffs：定义该变量以承载业务值。 */
  temporaryBuffs: TemporaryBuffState[];
}

/** ObservationDomainDeps：定义该接口的能力与字段约束。 */
interface ObservationDomainDeps {
  getMonsterCombatSnapshot: (monster: RuntimeMonsterLike) => CombatSnapshotLike;
  getMonsterPresentationScale: (monster: RuntimeMonsterLike) => number;
  getTemporaryBuffPresentationScale: (buffs: TemporaryBuffState[] | undefined) => number;
  getMapRenderableBuffs: (buffs: TemporaryBuffState[] | undefined) => VisibleBuffState[];
  getRenderableBuffs: (buffs: TemporaryBuffState[] | undefined) => VisibleBuffState[];
  getPlayerRenderableBuffs: (player: PlayerState) => VisibleBuffState[];
  getEffectiveDropChance: (viewer: PlayerState, monster: RuntimeMonsterLike, drop: DropConfig) => number;
  resolveNpcQuestMarker: (viewer: PlayerState, npc: NpcConfig) => NpcQuestMarker | undefined;
  formatRespawnTicks: (ticks?: number) => string;
}

/** WorldObservationDomain：封装相关状态与行为。 */
export class WorldObservationDomain {
  constructor(
    private readonly attrService: AttrService,
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly lootService: LootService,
    private readonly deps: ObservationDomainDeps,
  ) {}

/** buildMonsterRenderEntity：执行对应的业务逻辑。 */
  buildMonsterRenderEntity(_viewer: PlayerState, monster: RuntimeMonsterLike): RenderEntity {
    return {
      id: monster.runtimeId,
      x: monster.x,
      y: monster.y,
      char: monster.char,
      color: monster.color,
      name: getMonsterDisplayName(monster.name, monster.tier),
      kind: 'monster',
      monsterTier: monster.tier,
      monsterScale: this.deps.getMonsterPresentationScale(monster),
      hp: monster.hp,
      maxHp: monster.maxHp,
      buffs: this.deps.getMapRenderableBuffs(monster.temporaryBuffs),
    };
  }

/** buildNpcRenderEntity：执行对应的业务逻辑。 */
  buildNpcRenderEntity(viewer: PlayerState, npc: NpcConfig, mapId: string): RenderEntity {
/** profile：定义该变量以承载业务值。 */
    const profile = this.buildNpcPresenceProfile(npc, mapId);
/** npcQuestMarker：定义该变量以承载业务值。 */
    const npcQuestMarker = this.deps.resolveNpcQuestMarker(viewer, npc);
    return {
      id: `npc:${npc.id}`,
      x: npc.x,
      y: npc.y,
      char: npc.char,
      color: npc.color,
      name: npc.name,
      kind: 'npc',
      hp: profile.hp,
      maxHp: profile.hp,
      npcQuestMarker,
    };
  }

/** buildPlayerObservationDetail：执行对应的业务逻辑。 */
  buildPlayerObservationDetail(viewer: PlayerState, target: PlayerState): ObservedTileEntityDetail {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.createPlayerObservationSnapshot(target);
    return {
      id: target.id,
      name: target.name,
      kind: 'player',
      monsterScale: this.deps.getTemporaryBuffPresentationScale(target.temporaryBuffs),
      hp: target.hp,
      maxHp: target.maxHp,
      qi: target.qi,
      maxQi: snapshot.maxQi,
      observation: buildObservationInsight(
        Math.max(1, this.attrService.getPlayerFinalAttrs(viewer).spirit),
        snapshot,
        buildObservationLineSpecs(snapshot, true),
        viewer.id === target.id,
      ),
      buffs: this.deps.getPlayerRenderableBuffs(target),
    };
  }

/** buildMonsterObservationDetail：执行对应的业务逻辑。 */
  buildMonsterObservationDetail(viewer: PlayerState, monster: RuntimeMonsterLike): ObservedTileEntityDetail {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.createMonsterObservationSnapshot(monster);
/** lineSpecs：定义该变量以承载业务值。 */
    const lineSpecs = [
      ...buildObservationLineSpecs(snapshot, true),
      { threshold: 0.28, label: '血脉层次', value: MONSTER_TIER_LABELS[monster.tier] ?? '凡血' },
    ];
/** observation：定义该变量以承载业务值。 */
    const observation = buildObservationInsight(
      Math.max(1, this.attrService.getPlayerFinalAttrs(viewer).spirit),
      snapshot,
      lineSpecs,
    );
    return {
      id: monster.runtimeId,
      name: getMonsterDisplayName(monster.name, monster.tier),
      kind: 'monster',
      monsterTier: monster.tier,
      monsterScale: this.deps.getMonsterPresentationScale(monster),
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      observation,
/** lootPreview：定义该变量以承载业务值。 */
      lootPreview: observation.clarity === 'complete'
        ? this.buildMonsterObservationLootPreview(viewer, monster)
        : undefined,
      buffs: this.deps.getRenderableBuffs(monster.temporaryBuffs),
    };
  }

/** buildNpcObservationDetail：执行对应的业务逻辑。 */
  buildNpcObservationDetail(viewer: PlayerState, npc: NpcConfig, mapId: string): ObservedTileEntityDetail {
/** profile：定义该变量以承载业务值。 */
    const profile = this.buildNpcPresenceProfile(npc, mapId);
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.createNpcObservationSnapshot(profile);
/** lineSpecs：定义该变量以承载业务值。 */
    const lineSpecs = [
      { threshold: 0.3, label: '身份', value: profile.title },
      ...buildObservationLineSpecs(snapshot, false),
    ];
    return {
      id: `npc:${npc.id}`,
      name: npc.name,
      kind: 'npc',
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      maxQi: snapshot.maxQi,
      npcQuestMarker: this.deps.resolveNpcQuestMarker(viewer, npc),
      observation: buildObservationInsight(
        Math.max(1, this.attrService.getPlayerFinalAttrs(viewer).spirit),
        snapshot,
        lineSpecs,
      ),
    };
  }

/** buildContainerObservationDetail：执行对应的业务逻辑。 */
  buildContainerObservationDetail(mapId: string, container: ContainerConfig): ObservedTileEntityDetail {
    if (container.variant === 'herb') {
/** runtime：定义该变量以承载业务值。 */
      const runtime = this.lootService.getContainerRuntimeView(mapId, container);
      if (!runtime.herb) {
        return {
          id: `container:${mapId}:${container.id}`,
          name: container.name,
          kind: 'container',
          observation: {
            clarity: 'clear',
            verdict: container.desc?.trim() || `${container.name}可以采集，但此时药性尚未凝稳。`,
            lines: [{ label: '类别', value: '可采集草药' }],
          },
        };
      }
      return {
        id: `container:${mapId}:${container.id}`,
        name: container.name,
        kind: 'container',
        hp: runtime.hp,
        maxHp: runtime.maxHp,
        observation: {
          clarity: 'clear',
          verdict: runtime.destroyed
            ? (runtime.respawnRemainingTicks !== undefined
              ? `${container.name}已经枯毁，残枝里药气断绝，约 ${this.deps.formatRespawnTicks(runtime.respawnRemainingTicks)} 后再生。`
              : `${container.name}已经枯毁，枝叶里再无药气。`)
            : (runtime.respawning
              ? `${container.name}已被采尽，药性仍在回转，约 ${this.deps.formatRespawnTicks(runtime.respawnRemainingTicks)} 后再生。`
              : (container.desc?.trim() || `${container.name}药性尚存，可以用拿取行动慢慢采集。`)),
          lines: [
            { label: '类别', value: '可采集草药' },
            { label: '药材', value: runtime.herb.name },
            { label: '品阶', value: runtime.herb.grade ?? 'mortal' },
            { label: '等级', value: `${runtime.herb.level ?? 1}` },
            { label: '采集耗时', value: `${runtime.herb.gatherTicks} 息` },
            { label: '状态', value: runtime.destroyed ? '已摧毁' : (runtime.respawning ? '回生中' : '可采集') },
            ...((runtime.destroyed || runtime.respawning) ? [{
              label: '再生剩余',
              value: this.deps.formatRespawnTicks(runtime.respawnRemainingTicks),
            }] : []),
          ],
        },
      };
    }
    return {
      id: `container:${mapId}:${container.id}`,
      name: container.name,
      kind: 'container',
      observation: {
        clarity: 'clear',
        verdict: container.desc?.trim() || `这处${container.name}可以搜索，翻找后或许会有收获。`,
        lines: [
          { label: '类别', value: '可搜索陈设' },
          { label: '名称', value: container.name },
          { label: '搜索阶次', value: `${container.grade}` },
        ],
      },
    };
  }

/** createPlayerObservationSnapshot：执行对应的业务逻辑。 */
  private createPlayerObservationSnapshot(player: PlayerState): ObservationTargetSnapshot {
/** stats：定义该变量以承载业务值。 */
    const stats = this.attrService.getPlayerNumericStats(player);
/** ratios：定义该变量以承载业务值。 */
    const ratios = this.attrService.getPlayerRatioDivisors(player);
/** attrs：定义该变量以承载业务值。 */
    const attrs = this.attrService.getPlayerFinalAttrs(player);
/** maxQi：定义该变量以承载业务值。 */
    const maxQi = Math.max(0, Math.round(stats.maxQi));
    return {
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      maxQi,
      spirit: Math.max(1, attrs.spirit),
      stats,
      ratios,
      attrs: { ...attrs },
      realmLabel: this.describePlayerRealm(player),
    };
  }

/** createMonsterObservationSnapshot：执行对应的业务逻辑。 */
  private createMonsterObservationSnapshot(monster: RuntimeMonsterLike): ObservationTargetSnapshot {
/** combat：定义该变量以承载业务值。 */
    const combat = this.deps.getMonsterCombatSnapshot(monster);
/** spirit：定义该变量以承载业务值。 */
    const spirit = Math.max(1, Math.round(combat.attrs.spirit ?? this.estimateMonsterSpirit(monster, combat.stats)));
/** maxQi：定义该变量以承载业务值。 */
    const maxQi = Math.max(24, Math.round(combat.stats.maxQi > 0 ? combat.stats.maxQi : (spirit * 2 + (monster.level ?? 1) * 8)));
    return {
      hp: monster.hp,
      maxHp: monster.maxHp,
      qi: Math.max(0, Math.min(maxQi, Math.round(monster.qi))),
      maxQi,
      spirit,
      stats: combat.stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      attrs: { ...combat.attrs },
      realmLabel: this.describeMonsterRealm(monster),
    };
  }

/** createNpcObservationSnapshot：执行对应的业务逻辑。 */
  private createNpcObservationSnapshot(profile: NpcPresenceProfile): ObservationTargetSnapshot {
/** stats：定义该变量以承载业务值。 */
    const stats: NumericStats = createNumericStats();
    stats.maxHp = profile.hp;
    stats.maxQi = profile.qi;
    stats.physAtk = Math.max(4, Math.round(profile.hp * 0.18 + profile.spirit * 0.6));
    stats.spellAtk = Math.max(4, Math.round(profile.qi * 0.2 + profile.spirit * 0.7));
    stats.physDef = Math.max(3, Math.round(profile.hp * 0.12 + profile.spirit * 0.4));
    stats.spellDef = Math.max(3, Math.round(profile.qi * 0.14 + profile.spirit * 0.45));
    stats.hit = Math.max(8, Math.round(profile.spirit * 0.9));
    stats.dodge = Math.max(0, Math.round(profile.spirit * 0.45));
    stats.crit = Math.max(0, Math.round(profile.spirit * 0.28));
    stats.antiCrit = Math.max(0, Math.round(profile.spirit * 0.28));
    stats.critDamage = Math.max(0, Math.round(profile.spirit * 5));
    stats.breakPower = Math.max(0, Math.round(profile.spirit * 0.35));
    stats.resolvePower = Math.max(0, Math.round(profile.spirit * 0.42));
    stats.maxQiOutputPerTick = Math.max(0, Math.round(profile.qi * 0.22));
    stats.qiRegenRate = Math.max(0, Math.round(profile.spirit * 18));
    stats.hpRegenRate = Math.max(0, Math.round(profile.spirit * 12));
    stats.viewRange = 8 + Math.round(profile.spirit * 0.08);
    stats.moveSpeed = Math.max(0, Math.round(profile.spirit * 0.2));
    return {
      hp: profile.hp,
      maxHp: profile.hp,
      qi: profile.qi,
      maxQi: profile.qi,
      spirit: Math.max(1, profile.spirit),
      stats,
      ratios: DEFAULT_MONSTER_RATIO_DIVISORS,
      attrs: this.deriveAttrsFromStats(stats, profile.spirit),
    };
  }

/** buildMonsterObservationLootPreview：处理当前场景中的对应操作。 */
  private buildMonsterObservationLootPreview(viewer: PlayerState, monster: RuntimeMonsterLike) {
/** entries：定义该变量以承载业务值。 */
    const entries = monster.drops.map((drop) => ({
      itemId: drop.itemId,
      name: drop.name,
      type: drop.type,
      count: drop.count,
      chance: this.deps.getEffectiveDropChance(viewer, monster, drop),
    }));
    return {
      entries,
      emptyText: entries.length > 0 ? undefined : '此獠身上暂未看出稳定掉落。',
    };
  }

/** buildNpcPresenceProfile：执行对应的业务逻辑。 */
  private buildNpcPresenceProfile(npc: NpcConfig, mapId: string): NpcPresenceProfile {
/** preset：定义该变量以承载业务值。 */
    const preset = NPC_ROLE_PROFILES[npc.role ?? ''] ?? { title: '过路修者', spirit: 12, hp: 60, qi: 56 };
/** actualDanger：定义该变量以承载业务值。 */
    const actualDanger = this.mapService.getMapMeta(mapId)?.dangerLevel ?? 1;
    return {
      title: preset.title,
      spirit: Math.max(1, preset.spirit + actualDanger * 18),
      hp: Math.max(1, preset.hp + actualDanger * 24),
      qi: Math.max(0, preset.qi + actualDanger * 20),
    };
  }

/** estimateMonsterSpirit：执行对应的业务逻辑。 */
  private estimateMonsterSpirit(monster: RuntimeMonsterLike, stats?: NumericStats): number {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    return estimateMonsterSpiritFromStats(stats ?? this.deps.getMonsterCombatSnapshot(monster).stats, level);
  }

/** deriveAttrsFromStats：执行对应的业务逻辑。 */
  private deriveAttrsFromStats(stats: NumericStats, spirit: number): Attributes {
    return {
      constitution: Math.max(1, Math.round(stats.maxHp / 18)),
      spirit: Math.max(1, Math.round(spirit)),
      perception: Math.max(1, Math.round((stats.hit + stats.dodge) / 14)),
      talent: Math.max(1, Math.round((stats.physAtk + stats.physDef) / 18)),
      comprehension: Math.max(1, Math.round((stats.spellAtk + stats.spellDef) / 18)),
      luck: Math.max(1, Math.round((stats.crit + stats.breakPower) / 12)),
    };
  }

/** describePlayerRealm：执行对应的业务逻辑。 */
  private describePlayerRealm(player: PlayerState): string {
    if (player.realm?.name) {
      return player.realm.shortName ? `${player.realm.name} · ${player.realm.shortName}` : player.realm.name;
    }
    if (player.realmName) {
      return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
    }
    return '行功未明';
  }

/** describeMonsterRealm：执行对应的业务逻辑。 */
  private describeMonsterRealm(monster: RuntimeMonsterLike): string {
/** level：定义该变量以承载业务值。 */
    const level = Math.max(1, monster.level ?? Math.round(monster.attack / 6));
    return this.contentService.getRealmLevelEntry(level)?.displayName ?? `Lv.${level}`;
  }
}

