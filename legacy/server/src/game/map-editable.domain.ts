import {
  cloneMapDocument as cloneEditableMapDocument,
  createMonsterAutoStatPercents,
  getTileTypeFromMapChar,
  GmMapDocument,
  GmMapMonsterSpawnRecord,
  inferMonsterAttrsFromNumericStats,
  inferMonsterValueStatsFromLegacy,
  isOffsetInRange,
  isTileTypeWalkable,
  normalizeEditableMapDocument as normalizeEditableMapDocumentValue,
  normalizeMonsterAttrs,
  normalizeMonsterStatPercents,
  normalizeMonsterTier,
  resolveMonsterExpMultiplier,
  resolveMonsterNumericStatsFromAttributes,
  resolveMonsterNumericStatsFromValueStats,
  TileType,
  validateEditableMapDocument as validateEditableMapDocumentValue,
} from '@mud/shared';
import { ContentService } from './content.service';
import { resolveMonsterSpawnPopulation } from './map.service.shared';

/** DomainDeps：定义该接口的能力与字段约束。 */
interface DomainDeps {
  resolveMonsterSpawnTemplateId: (spawn: { id?: unknown; templateId?: unknown }) => string | undefined;
}

/** MapEditableDomain：封装相关状态与行为。 */
export class MapEditableDomain {
  constructor(
    private readonly contentService: ContentService,
    private readonly deps: DomainDeps,
  ) {}

/** cloneMapDocument：执行对应的业务逻辑。 */
  cloneMapDocument(document: GmMapDocument): GmMapDocument {
    return cloneEditableMapDocument(document);
  }

/** normalizeEditableMapDocument：执行对应的业务逻辑。 */
  normalizeEditableMapDocument(raw: unknown): GmMapDocument {
    return normalizeEditableMapDocumentValue(this.hydrateEditableMapDocument(raw));
  }

/** dehydrateEditableMapDocument：执行对应的业务逻辑。 */
  dehydrateEditableMapDocument(document: GmMapDocument): unknown {
    return {
      ...document,
      monsterSpawns: document.monsterSpawns.map((spawn) => this.dehydrateMonsterSpawnRecord(spawn)),
    };
  }

/** validateEditableMapDocument：执行对应的业务逻辑。 */
  validateEditableMapDocument(document: GmMapDocument): string | null {
    return validateEditableMapDocumentValue(document);
  }

/** hydrateEditableMapDocument：执行对应的业务逻辑。 */
  private hydrateEditableMapDocument(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw;
    }
/** source：定义该变量以承载业务值。 */
    const source = raw as {
      monsterSpawns?: unknown[];
      terrainProfileId?: unknown;
      terrainRealmLv?: unknown;
    };
    return {
      ...source,
/** terrainProfileId：定义该变量以承载业务值。 */
      terrainProfileId: typeof source.terrainProfileId === 'string' ? source.terrainProfileId : undefined,
      terrainRealmLv: Number.isFinite(source.terrainRealmLv) ? Math.max(1, Math.floor(Number(source.terrainRealmLv))) : undefined,
      monsterSpawns: Array.isArray(source.monsterSpawns)
        ? source.monsterSpawns.map((spawn) => this.hydrateMonsterSpawnRecord(spawn))
        : [],
    };
  }

/** hydrateMonsterSpawnRecord：执行对应的业务逻辑。 */
  private hydrateMonsterSpawnRecord(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw;
    }
/** spawn：定义该变量以承载业务值。 */
    const spawn = raw as Partial<GmMapMonsterSpawnRecord> & { templateId?: unknown };
/** templateId：定义该变量以承载业务值。 */
    const templateId = this.deps.resolveMonsterSpawnTemplateId(spawn);
/** template：定义该变量以承载业务值。 */
    const template = templateId ? this.contentService.getMonsterTemplate(templateId) : undefined;
    if (!template) {
      return raw;
    }
/** radius：定义该变量以承载业务值。 */
    const radius = Number.isInteger(spawn.radius) ? Math.max(0, Number(spawn.radius)) : template.radius;
/** level：定义该变量以承载业务值。 */
    const level = Number.isInteger(spawn.level) ? Math.max(1, Number(spawn.level)) : template.level;
/** equipment：定义该变量以承载业务值。 */
    const equipment = this.contentService.normalizeEquipment(template.equipment);
/** skills：定义该变量以承载业务值。 */
    const skills = this.contentService.normalizeMonsterSkills(spawn.skills ?? template.skills, String(spawn.id ?? template.id));
/** valueStats：定义该变量以承载业务值。 */
    const valueStats = template.valueStats
      ?? inferMonsterValueStatsFromLegacy({
        maxHp: template.maxHp,
        attack: template.attack,
        level: template.level,
        viewRange: template.viewRange,
      });
/** legacyNumericStats：定义该变量以承载业务值。 */
    const legacyNumericStats = resolveMonsterNumericStatsFromValueStats(valueStats, level);
/** attrs：定义该变量以承载业务值。 */
    const attrs = normalizeMonsterAttrs(
      spawn.attrs ?? template.attrs,
      spawn.attrs || template.attrs ? undefined : inferMonsterAttrsFromNumericStats(legacyNumericStats),
    );
/** statPercents：定义该变量以承载业务值。 */
    const statPercents = normalizeMonsterStatPercents(spawn.statPercents ?? template.statPercents)
      ?? (spawn.attrs || template.attrs
        ? undefined
        : createMonsterAutoStatPercents(legacyNumericStats, attrs, level, equipment));
/** initialBuffs：定义该变量以承载业务值。 */
    const initialBuffs = Array.isArray(spawn.initialBuffs)
      ? spawn.initialBuffs.map((entry) => ({ ...entry }))
      : (template.initialBuffs?.map((entry) => ({ ...entry })) ?? undefined);
/** tier：定义该变量以承载业务值。 */
    const tier = normalizeMonsterTier(spawn.tier ?? template.tier);
/** configuredMaxAlive：定义该变量以承载业务值。 */
    const configuredMaxAlive = Number.isInteger(spawn.maxAlive) ? Math.max(1, Number(spawn.maxAlive)) : template.maxAlive;
/** configuredCount：定义该变量以承载业务值。 */
    const configuredCount = Number.isInteger(spawn.count) ? Math.max(1, Number(spawn.count)) : template.count;
    const { count, maxAlive } = resolveMonsterSpawnPopulation(tier, configuredCount, configuredMaxAlive);
/** expMultiplier：定义该变量以承载业务值。 */
    const expMultiplier = Number.isFinite(spawn.expMultiplier)
      ? resolveMonsterExpMultiplier(spawn.expMultiplier, tier)
      : (spawn.tier !== undefined && tier !== template.tier
        ? resolveMonsterExpMultiplier(undefined, tier)
        : template.expMultiplier);
/** numericStats：定义该变量以承载业务值。 */
    const numericStats = resolveMonsterNumericStatsFromAttributes({
      attrs,
      equipment,
      level,
      statPercents,
      grade: spawn.grade ?? template.grade,
      tier,
    });
    return {
      ...template,
/** id：定义该变量以承载业务值。 */
      id: typeof spawn.id === 'string' && spawn.id.trim().length > 0 ? spawn.id : template.id,
      templateId,
      x: Number.isInteger(spawn.x) ? Number(spawn.x) : 0,
      y: Number.isInteger(spawn.y) ? Number(spawn.y) : 0,
      grade: spawn.grade ?? template.grade,
      attrs,
      equipment,
      statPercents,
      initialBuffs,
      skills,
      tier,
      hp: Math.max(1, Math.round(numericStats.maxHp || template.hp)),
      maxHp: Math.max(1, Math.round(numericStats.maxHp || template.maxHp || template.hp)),
      attack: Math.max(1, Math.round(numericStats.physAtk || numericStats.spellAtk || template.attack || 1)),
      count,
      radius,
      maxAlive,
      wanderRadius: Number.isInteger(spawn.wanderRadius) ? Math.max(0, Number(spawn.wanderRadius)) : radius,
      respawnTicks: Number.isInteger(spawn.respawnTicks)
        ? Math.max(1, Number(spawn.respawnTicks))
        : undefined,
      respawnSec: Number.isInteger(spawn.respawnSec)
        ? Math.max(1, Number(spawn.respawnSec))
        : undefined,
      level,
      expMultiplier,
    };
  }

/** dehydrateMonsterSpawnRecord：执行对应的业务逻辑。 */
  private dehydrateMonsterSpawnRecord(spawn: GmMapMonsterSpawnRecord): unknown {
/** templateId：定义该变量以承载业务值。 */
    const templateId = typeof spawn.templateId === 'string' && spawn.templateId.trim().length > 0
      ? spawn.templateId
      : spawn.id;
/** template：定义该变量以承载业务值。 */
    const template = this.contentService.getMonsterTemplate(templateId);
    if (!template) {
      return spawn;
    }
/** persisted：定义该变量以承载业务值。 */
    const persisted: Partial<GmMapMonsterSpawnRecord> = {
      id: spawn.id,
      x: spawn.x,
      y: spawn.y,
    };
    if (templateId !== spawn.id) {
      persisted.templateId = templateId;
    }
    if (spawn.grade !== template.grade) persisted.grade = spawn.grade;
    if (spawn.tier !== template.tier) persisted.tier = spawn.tier;
    if (JSON.stringify(spawn.attrs) !== JSON.stringify(template.attrs)) persisted.attrs = spawn.attrs;
    if (JSON.stringify(spawn.statPercents ?? null) !== JSON.stringify(template.statPercents ?? null)) {
      persisted.statPercents = spawn.statPercents;
    }
    if (JSON.stringify(spawn.initialBuffs ?? null) !== JSON.stringify(template.initialBuffs ?? null)) {
      persisted.initialBuffs = spawn.initialBuffs;
    }
    if (JSON.stringify(spawn.skills) !== JSON.stringify(template.skills)) persisted.skills = spawn.skills;
/** effectiveTier：定义该变量以承载业务值。 */
    const effectiveTier = normalizeMonsterTier(spawn.tier ?? template.tier);
/** baselinePopulation：定义该变量以承载业务值。 */
    const baselinePopulation = resolveMonsterSpawnPopulation(effectiveTier, template.count, template.maxAlive);
    if ((spawn.count ?? baselinePopulation.count) !== baselinePopulation.count) persisted.count = spawn.count;
    if ((spawn.radius ?? 3) !== template.radius) persisted.radius = spawn.radius;
    if ((spawn.maxAlive ?? baselinePopulation.maxAlive) !== baselinePopulation.maxAlive) persisted.maxAlive = spawn.maxAlive;
/** defaultWanderRadius：定义该变量以承载业务值。 */
    const defaultWanderRadius = spawn.radius ?? template.radius;
    if ((spawn.wanderRadius ?? defaultWanderRadius) !== defaultWanderRadius) persisted.wanderRadius = spawn.wanderRadius;
/** effectiveRespawnTicks：定义该变量以承载业务值。 */
    const effectiveRespawnTicks = Number.isInteger(spawn.respawnTicks)
      ? Math.max(1, Number(spawn.respawnTicks))
      : Number.isInteger(spawn.respawnSec)
        ? Math.max(1, Number(spawn.respawnSec))
        : template.respawnTicks;
    if (effectiveRespawnTicks !== template.respawnTicks) {
      persisted.respawnTicks = spawn.respawnTicks;
      if (persisted.respawnTicks === undefined && spawn.respawnSec !== undefined) {
        persisted.respawnSec = spawn.respawnSec;
      }
    }
    if ((spawn.level ?? undefined) !== template.level) persisted.level = spawn.level;
/** baselineExpMultiplier：定义该变量以承载业务值。 */
    const baselineExpMultiplier = spawn.tier === template.tier
      ? template.expMultiplier
      : resolveMonsterExpMultiplier(undefined, spawn.tier);
    if (spawn.expMultiplier !== baselineExpMultiplier) persisted.expMultiplier = spawn.expMultiplier;
    return persisted;
  }
}

