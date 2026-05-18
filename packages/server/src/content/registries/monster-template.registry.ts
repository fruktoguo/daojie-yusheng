import { Injectable } from '@nestjs/common';
import { Direction } from '@mud/shared';
import {
  buildMonsterSpawnKey,
  parseMonsterIdFromRuntimeId,
  resolveMonsterRuntimeTemplateStats,
} from '../content-template-utils';
import { freezeTemplateMap } from './template-freeze';

/** 妖兽运行时模板最小结构约束 */
type MonsterRuntimeTemplate = Record<string, unknown> & {
  monsterId: string;
  name: string;
  char?: string;
  color?: string;
  respawnTicks?: number;
  ratioDivisors?: unknown;
  statFormula?: unknown;
  initialBuffs?: unknown;
  skills?: unknown[];
  aggroRange?: number;
  leashRange?: number;
  attackRange?: number;
  attackCooldownTicks?: number;
};

/** 妖兽运行时状态最小结构约束 */
type MonsterRuntimeState = Record<string, unknown> & {
  runtimeId: string;
  x: number;
  y: number;
};

@Injectable()
export class MonsterTemplateRegistry {
  readonly monsterRuntimeTemplates = new Map<string, MonsterRuntimeTemplate>();
  readonly monsterRuntimeStatesByMapId = new Map<string, MonsterRuntimeState[]>();
  monsterRealmBaselines: Record<string, unknown> | undefined = undefined;

  loadAll(): void {
    this.monsterRuntimeTemplates.clear();
    this.monsterRuntimeStatesByMapId.clear();
    this.monsterRealmBaselines = undefined;
  }

  getRef(monsterId: string): Readonly<MonsterRuntimeTemplate> {
    const template = this.tryGetRef(monsterId);
    if (!template) {
      throw new Error(`未找到妖兽模板：${monsterId}`);
    }
    return template;
  }

  tryGetRef(monsterId: string): Readonly<MonsterRuntimeTemplate> | undefined {
    return this.monsterRuntimeTemplates.get(String(monsterId ?? '').trim());
  }

  createInstance(monsterId: string, init: Record<string, unknown> = {}): Record<string, unknown> | null {
    return this.createRuntimeMonsterSpawn(monsterId, init);
  }

  hydrate(monsterId: string, payload: Record<string, unknown> = {}): Record<string, unknown> | null {
    return this.createRuntimeMonsterSpawn(monsterId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.monsterRuntimeTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  freezeAll(): void {
    freezeTemplateMap(this.monsterRuntimeTemplates);
  }

  createRuntimeMonstersForMap(mapId: string, fallbackResolver?: (mapId: string) => MonsterRuntimeState[] | null): Record<string, unknown>[] {
    const states = fallbackResolver?.(mapId) ?? this.monsterRuntimeStatesByMapId.get(mapId);
    if (!states || states.length === 0) {
      return [];
    }
    const spawns: Record<string, unknown>[] = [];
    for (const state of states) {
      const monsterId = parseMonsterIdFromRuntimeId(state.runtimeId);
      if (!monsterId) {
        continue;
      }
      const template = this.monsterRuntimeTemplates.get(monsterId);
      if (!template) {
        continue;
      }
      const resolvedStats = resolveMonsterRuntimeTemplateStats(template, {
        level: state.level,
        tier: state.tier,
      });
      spawns.push({
        runtimeId: state.runtimeId,
        monsterId,
        x: state.x,
        y: state.y,
        spawnOriginX: Number.isFinite(Number(state.spawnOriginX)) ? Math.trunc(Number(state.spawnOriginX)) : state.x,
        spawnOriginY: Number.isFinite(Number(state.spawnOriginY)) ? Math.trunc(Number(state.spawnOriginY)) : state.y,
        spawnKey: typeof state.spawnKey === 'string' && (state.spawnKey as string).trim()
          ? (state.spawnKey as string).trim()
          : buildMonsterSpawnKey(mapId, monsterId, Number.isFinite(Number(state.spawnOriginX)) ? Math.trunc(Number(state.spawnOriginX)) : state.x, Number.isFinite(Number(state.spawnOriginY)) ? Math.trunc(Number(state.spawnOriginY)) : state.y),
        hp: Math.max(0, Math.min(Number(state.hp) || 0, resolvedStats.maxHp)),
        maxHp: resolvedStats.maxHp,
        respawnTicks: Number.isFinite(Number(state.respawnTicks))
          ? Math.max(1, Math.trunc(Number(state.respawnTicks)))
          : template.respawnTicks,
        alive: state.alive,
        respawnLeft: state.alive ? 0 : Math.max(0, Number(state.respawnLeft) || 0),
        facing: state.facing,
        name: template.name,
        char: template.char,
        color: template.color,
        level: resolvedStats.level,
        tier: resolvedStats.tier,
        expMultiplier: resolvedStats.expMultiplier,
        baseAttrs: resolvedStats.attrs,
        baseNumericStats: resolvedStats.numericStats,
        ratioDivisors: template.ratioDivisors,
        statFormula: template.statFormula,
        initialBuffs: template.initialBuffs,
        skills: template.skills,
        aggroRange: template.aggroRange,
        leashRange: template.leashRange,
        attackRange: template.attackRange,
        attackCooldownTicks: template.attackCooldownTicks,
        wanderRadius: Number.isFinite(Number(state.wanderRadius)) ? Math.max(0, Math.trunc(Number(state.wanderRadius))) : 0,
      });
    }
    return spawns;
  }

  createRuntimeMonsterSpawn(monsterId: string, options: Record<string, unknown> = {}): Record<string, unknown> | null {
    const normalizedMonsterId = typeof monsterId === 'string' ? monsterId.trim() : '';
    if (!normalizedMonsterId) {
      return null;
    }
    const template = this.monsterRuntimeTemplates.get(normalizedMonsterId);
    if (!template) {
      return null;
    }
    const x = Number.isFinite(Number(options.x)) ? Math.trunc(Number(options.x)) : 0;
    const y = Number.isFinite(Number(options.y)) ? Math.trunc(Number(options.y)) : 0;
    const spawnOriginX = Number.isFinite(Number(options.spawnOriginX)) ? Math.trunc(Number(options.spawnOriginX)) : x;
    const spawnOriginY = Number.isFinite(Number(options.spawnOriginY)) ? Math.trunc(Number(options.spawnOriginY)) : y;
    const resolvedStats = resolveMonsterRuntimeTemplateStats(template, {
      level: options.level,
      tier: options.tier,
    });
    return {
      runtimeId: typeof options.runtimeId === 'string' && options.runtimeId.trim()
        ? options.runtimeId.trim()
        : `monster:dynamic:${normalizedMonsterId}:${Date.now()}`,
      monsterId: normalizedMonsterId,
      x,
      y,
      spawnOriginX,
      spawnOriginY,
      spawnKey: typeof options.spawnKey === 'string' && options.spawnKey.trim()
        ? options.spawnKey.trim()
        : buildMonsterSpawnKey('dynamic', normalizedMonsterId, spawnOriginX, spawnOriginY),
      hp: resolvedStats.maxHp,
      maxHp: resolvedStats.maxHp,
      respawnTicks: Number.isFinite(Number(options.respawnTicks))
        ? Math.max(1, Math.trunc(Number(options.respawnTicks)))
        : template.respawnTicks,
      alive: options.alive === false ? false : true,
      respawnLeft: 0,
      facing: Direction.South,
      name: typeof options.name === 'string' && (options.name as string).trim() ? (options.name as string).trim() : template.name,
      char: template.char,
      color: template.color,
      level: resolvedStats.level,
      tier: resolvedStats.tier,
      expMultiplier: resolvedStats.expMultiplier,
      baseAttrs: resolvedStats.attrs,
      baseNumericStats: resolvedStats.numericStats,
      ratioDivisors: template.ratioDivisors,
      statFormula: template.statFormula,
      initialBuffs: template.initialBuffs,
      skills: template.skills,
      aggroRange: template.aggroRange,
      leashRange: template.leashRange,
      attackRange: template.attackRange,
      attackCooldownTicks: template.attackCooldownTicks,
      wanderRadius: Number.isFinite(Number(options.wanderRadius)) ? Math.max(0, Math.trunc(Number(options.wanderRadius))) : 0,
    };
  }
}
