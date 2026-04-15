import {
  createMonsterAutoStatPercents,
  expandMapResourceNodeGroups,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapMonsterSpawnRecord,
  inferMonsterAttrsFromNumericStats,
  inferMonsterValueStatsFromLegacy,
  MapMeta,
  MapMinimapMarker,
  MapMinimapSnapshot,
  MonsterCombatModel,
  normalizeMonsterAttrs,
  normalizeMonsterStatPercents,
  normalizeMonsterTier,
  Portal,
  resolveMonsterExpMultiplier,
  resolveMonsterNumericStatsFromAttributes,
  resolveMonsterNumericStatsFromValueStats,
} from '@mud/shared';
import { ContentService } from './content.service';
import {
  ContainerConfig,
  DropConfig,
  MonsterSpawnConfig,
  NpcConfig,
  resolveMonsterSpawnPopulation,
} from './map.service.shared';
import { LANDMARK_RESOURCE_NODE_BY_ID } from '../constants/gameplay/resource-nodes';

interface DomainDeps {
  warn: (message: string) => void;
  normalizeContainerGrade: (grade: unknown) => MonsterSpawnConfig['grade'];
  normalizeDrops: (rawDrops: unknown) => DropConfig[];
  normalizeContainerLootPools: (rawPools: unknown) => ContainerConfig['lootPools'];
  getMapName: (mapId: string) => string | undefined;
}

export class MapContentDomain {
  constructor(
    private readonly contentService: ContentService,
    private readonly deps: DomainDeps,
  ) {}

  normalizeMonsterSpawns(rawSpawns: unknown, meta: MapMeta): MonsterSpawnConfig[] {
    if (!Array.isArray(rawSpawns)) return [];

    const result: MonsterSpawnConfig[] = [];
    for (const candidate of rawSpawns) {
      const rawSpawn = candidate as Partial<GmMapMonsterSpawnRecord> & Partial<MonsterSpawnConfig> & {
        templateId?: string;
        count?: number;
        radius?: number;
        maxAlive?: number;
        wanderRadius?: number;
        respawnSec?: number;
        level?: number;
      };
      const templateId = this.resolveMonsterSpawnTemplateId(rawSpawn);
      const template = templateId ? this.contentService.getMonsterTemplate(templateId) : undefined;
      if (!template) {
        this.deps.warn(`地图 ${meta.id} 存在未匹配怪物模板的刷新点，已忽略: ${String(rawSpawn.id ?? '')}`);
        continue;
      }
      const level = Number.isInteger(rawSpawn.level) ? Math.max(1, Number(rawSpawn.level)) : template.level;
      const equipment = this.contentService.normalizeEquipment(template.equipment);
      const skills = this.contentService.normalizeMonsterSkills(rawSpawn.skills ?? template.skills, String(rawSpawn.id ?? template.id));
      const valueStats = template.valueStats
        ?? inferMonsterValueStatsFromLegacy({
          maxHp: template.maxHp,
          attack: template.attack,
          level: template.level,
          viewRange: template.viewRange,
        });
      const legacyNumericStats = resolveMonsterNumericStatsFromValueStats(valueStats, level);
      const attrs = normalizeMonsterAttrs(
        rawSpawn.attrs ?? template.attrs,
        rawSpawn.attrs || template.attrs ? undefined : inferMonsterAttrsFromNumericStats(legacyNumericStats),
      );
      const statPercents = normalizeMonsterStatPercents(rawSpawn.statPercents ?? template.statPercents)
        ?? (rawSpawn.attrs || template.attrs
          ? undefined
          : createMonsterAutoStatPercents(legacyNumericStats, attrs, level, equipment));
      const initialBuffs = Array.isArray(rawSpawn.initialBuffs)
        ? rawSpawn.initialBuffs.map((entry) => ({ ...entry }))
        : (template.initialBuffs?.map((entry) => ({ ...entry })) ?? undefined);
      const tier = normalizeMonsterTier(rawSpawn.tier ?? template.tier);
      const numericStats = resolveMonsterNumericStatsFromAttributes({
        attrs,
        equipment,
        level,
        statPercents,
        grade: rawSpawn.grade ?? template.grade,
        tier,
      });
      const combatModel: MonsterCombatModel = 'value_stats';
      const spawnId = typeof rawSpawn.id === 'string' && rawSpawn.id.trim().length > 0
        ? rawSpawn.id.trim()
        : templateId;
      const radius = Number.isInteger(rawSpawn.radius) ? Math.max(0, Number(rawSpawn.radius)) : template.radius;
      const configuredMaxAlive = Number.isInteger(rawSpawn.maxAlive) ? Math.max(1, Number(rawSpawn.maxAlive)) : template.maxAlive;
      const configuredCount = Number.isInteger(rawSpawn.count) ? Math.max(1, Number(rawSpawn.count)) : template.count;
      const { count, maxAlive } = resolveMonsterSpawnPopulation(tier, configuredCount, configuredMaxAlive);
      const respawnTicks = Number.isInteger(rawSpawn.respawnTicks)
        ? Math.max(1, Number(rawSpawn.respawnTicks))
        : Math.max(1, Number(rawSpawn.respawnSec ?? template.respawnTicks));
      const wanderRadius = Number.isInteger(rawSpawn.wanderRadius)
        ? Math.max(0, Number(rawSpawn.wanderRadius))
        : radius;
      const expMultiplier = Number.isFinite(rawSpawn.expMultiplier)
        ? resolveMonsterExpMultiplier(rawSpawn.expMultiplier, tier)
        : (rawSpawn.tier !== undefined && tier !== template.tier
          ? resolveMonsterExpMultiplier(undefined, tier)
          : template.expMultiplier);
      const valid =
        typeof spawnId === 'string' &&
        Number.isInteger(rawSpawn.x) &&
        Number.isInteger(rawSpawn.y);
      if (!valid) {
        this.deps.warn(`地图 ${meta.id} 存在非法怪物刷新点配置，已忽略`);
        continue;
      }
      if (rawSpawn.x! < 0 || rawSpawn.x! >= meta.width || rawSpawn.y! < 0 || rawSpawn.y! >= meta.height) {
        this.deps.warn(`地图 ${meta.id} 的怪物刷新点越界: ${spawnId}`);
        continue;
      }
      const drops = this.deps.normalizeDrops(template.drops);
      result.push({
        id: spawnId!,
        name: template.name,
        x: rawSpawn.x!,
        y: rawSpawn.y!,
        char: template.char,
        color: template.color,
        grade: this.deps.normalizeContainerGrade(rawSpawn.grade ?? template.grade),
        attrs,
        equipment,
        statPercents,
        initialBuffs,
        skills,
        tier,
        valueStats,
        numericStats,
        combatModel,
        hp: Math.max(1, Math.round(numericStats.maxHp || template.hp)),
        maxHp: Math.max(1, Math.round(numericStats.maxHp || template.maxHp || template.hp)),
        attack: Math.max(1, Math.round(numericStats.physAtk || numericStats.spellAtk || template.attack || 1)),
        count,
        radius,
        maxAlive,
        wanderRadius,
        aggroRange: template.aggroRange,
        viewRange: template.viewRange,
        aggroMode: template.aggroMode,
        respawnTicks,
        level,
        expMultiplier,
        drops,
      });
    }
    return result;
  }

  normalizeContainers(rawLandmarks: unknown, meta: MapMeta): ContainerConfig[] {
    if (!Array.isArray(rawLandmarks)) {
      return [];
    }

    const result: ContainerConfig[] = [];
    for (const candidate of rawLandmarks) {
      const landmark = candidate as GmMapLandmarkRecord;
      const resourceNodeId = typeof landmark?.resourceNodeId === 'string' && landmark.resourceNodeId.trim().length > 0
        ? landmark.resourceNodeId.trim()
        : undefined;
      const resourceNode = resourceNodeId ? LANDMARK_RESOURCE_NODE_BY_ID.get(resourceNodeId) : undefined;
      const resolvedContainer = landmark?.container
        ?? (resourceNode?.kind === 'landmark_container' ? resourceNode.container : undefined);

      if (resourceNodeId && !resourceNode) {
        this.deps.warn(`地图 ${meta.id} 的资源节点不存在: ${resourceNodeId}`);
        continue;
      }
      if (!resolvedContainer || typeof landmark.id !== 'string' || typeof landmark.name !== 'string') {
        continue;
      }
      if (!Number.isInteger(landmark.x) || !Number.isInteger(landmark.y)) {
        continue;
      }
      if (landmark.x < 0 || landmark.x >= meta.width || landmark.y < 0 || landmark.y >= meta.height) {
        this.deps.warn(`地图 ${meta.id} 的容器越界: ${landmark.id}`);
        continue;
      }
      if (resourceNode && resourceNode.kind !== 'landmark_container' && !landmark.container) {
        continue;
      }

      result.push({
        id: landmark.id,
        name: landmark.name,
        x: landmark.x,
        y: landmark.y,
        desc: typeof landmark.desc === 'string' ? landmark.desc : undefined,
        variant: resolvedContainer.variant === 'herb' ? 'herb' : undefined,
        char: typeof resolvedContainer.char === 'string' && resolvedContainer.char.trim().length > 0
          ? resolvedContainer.char.trim().slice(0, 1)
          : undefined,
        color: typeof resolvedContainer.color === 'string' && resolvedContainer.color.trim().length > 0
          ? resolvedContainer.color.trim()
          : undefined,
        grade: this.deps.normalizeContainerGrade(resolvedContainer.grade),
        refreshTicks: Number.isInteger(resolvedContainer.refreshTicks) && resolvedContainer.refreshTicks! > 0
          ? Number(resolvedContainer.refreshTicks)
          : undefined,
        refreshTicksMin: Number.isInteger(resolvedContainer.refreshTicksMin) && resolvedContainer.refreshTicksMin! > 0
          ? Number(resolvedContainer.refreshTicksMin)
          : undefined,
        refreshTicksMax: Number.isInteger(resolvedContainer.refreshTicksMax) && resolvedContainer.refreshTicksMax! > 0
          ? Number(resolvedContainer.refreshTicksMax)
          : undefined,
        drops: this.deps.normalizeDrops(resolvedContainer.drops),
        lootPools: this.deps.normalizeContainerLootPools(resolvedContainer.lootPools),
      });
    }

    return result;
  }

  buildMinimapSnapshot(
    meta: MapMeta,
    document: GmMapDocument,
    portals: Portal[],
    containers: ContainerConfig[],
    npcs: NpcConfig[],
    monsterSpawns: MonsterSpawnConfig[],
  ): MapMinimapSnapshot {
    const markers: MapMinimapMarker[] = [];
    const containerLandmarkIds = new Set(containers.map((container) => container.id));
    const landmarks = expandMapResourceNodeGroups(document);

    const pushMarker = (marker: MapMinimapMarker): void => {
      if (marker.x < 0 || marker.x >= meta.width || marker.y < 0 || marker.y >= meta.height) {
        return;
      }
      markers.push(marker);
    };

    for (const landmark of landmarks) {
      if (!Number.isInteger(landmark.x) || !Number.isInteger(landmark.y)) {
        continue;
      }
      if (containerLandmarkIds.has(landmark.id)) {
        continue;
      }
      pushMarker({
        id: `landmark:${landmark.id}`,
        kind: 'landmark',
        x: landmark.x,
        y: landmark.y,
        label: landmark.name,
        detail: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc.trim() : undefined,
      });
    }

    for (const container of containers) {
      pushMarker({
        id: `container:${container.id}`,
        kind: 'container',
        x: container.x,
        y: container.y,
        label: container.name,
        detail: container.desc?.trim() || '可搜索容器',
      });
    }

    for (const npc of npcs) {
      pushMarker({
        id: `npc:${npc.id}`,
        kind: 'npc',
        x: npc.x,
        y: npc.y,
        label: npc.name,
        detail: npc.role ? `NPC · ${npc.role}` : 'NPC',
      });
    }

    for (const spawn of monsterSpawns) {
      pushMarker({
        id: `monster_spawn:${spawn.id}`,
        kind: 'monster_spawn',
        x: spawn.x,
        y: spawn.y,
        label: spawn.name,
        detail: `刷新点 · 半径 ${spawn.radius}`,
      });
    }

    for (const portal of portals) {
      if (portal.hidden) {
        continue;
      }
      const targetMapName = this.deps.getMapName(portal.targetMapId)?.trim() || undefined;
      const label = portal.observeTitle
        ?? (targetMapName ? `通往 ${targetMapName}` : (portal.kind === 'stairs' ? '楼梯' : '传送阵'));
      const detail = portal.observeDesc
        ?? (targetMapName ? `通往 ${targetMapName}` : undefined)
        ?? `通往 ${portal.targetMapId}`;
      pushMarker({
        id: `${portal.kind}:${portal.x},${portal.y}:${portal.targetMapId}`,
        kind: portal.kind,
        x: portal.x,
        y: portal.y,
        label,
        detail,
      });
    }

    const terrainRows = document.tiles.map((row) => row.split(''));
    for (const portal of portals) {
      if (portal.hidden) {
        continue;
      }
      if (!terrainRows[portal.y]?.[portal.x]) {
        continue;
      }
      terrainRows[portal.y]![portal.x] = portal.kind === 'stairs' ? 'S' : 'P';
    }

    return {
      width: meta.width,
      height: meta.height,
      terrainRows: terrainRows.map((row) => row.join('')),
      markers,
    };
  }

  private resolveMonsterSpawnTemplateId(spawn: { id?: unknown; templateId?: unknown }): string | undefined {
    if (typeof spawn.templateId === 'string' && spawn.templateId.trim().length > 0) {
      return spawn.templateId.trim();
    }
    if (typeof spawn.id === 'string' && spawn.id.trim().length > 0) {
      return spawn.id.trim();
    }
    return undefined;
  }
}

