export interface MapGroupInfo {
  mapGroupId: string;
  mapGroupName: string;
  mapGroupOrder: number;
  mapGroupMemberOrder: number;
}

interface MapGroupSource {
  id?: string;
  name?: string;
  parentMapId?: string;
  mapGroupId?: string;
  mapGroupName?: string;
  mapGroupOrder?: number;
  mapGroupMemberOrder?: number;
  floorLevel?: number;
}

const STATIC_MAP_GROUPS = [
  { id: 'yunlai_town', name: '云来镇', order: 10, prefixes: ['yunlai_town_'] },
  { id: 'qizhen_crossing', name: '栖真渡', order: 20, prefixes: ['qizhen_crossing_house_'] },
  { id: 'cleft_blade_plain', name: '裂锋原', order: 30, prefixes: ['cleft_blade_plain_'] },
  { id: 'verdant_vine_vale', name: '青萝谷', order: 40, prefixes: ['verdant_vine_vale_'] },
] as const;

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function inferMemberOrder(mapId: string, groupId: string, source: MapGroupSource): number {
  const explicit = normalizeInteger(source.mapGroupMemberOrder);
  if (explicit !== null) return explicit;
  if (mapId === groupId) return 0;
  const numbered = mapId.match(/_(\d{1,3})(?:_|$)/);
  if (numbered) return Math.max(1, Number(numbered[1]));
  const floorLevel = normalizeInteger(source.floorLevel);
  if (floorLevel !== null) return 100 + floorLevel;
  return 1000;
}

function inferNamePrefix(name: string): string {
  const separatorIndex = name.indexOf('·');
  return separatorIndex > 0 ? name.slice(0, separatorIndex).trim() : '';
}

export function resolveMapGroupInfo(source: MapGroupSource): MapGroupInfo {
  const mapId = normalizeText(source.id);
  const mapName = normalizeText(source.name) || mapId || '未知地图';
  const explicitGroupId = normalizeText(source.mapGroupId);
  const explicitGroupName = normalizeText(source.mapGroupName);
  if (explicitGroupId || explicitGroupName) {
    const groupId = explicitGroupId || mapId;
    return {
      mapGroupId: groupId,
      mapGroupName: explicitGroupName || inferNamePrefix(mapName) || mapName || groupId,
      mapGroupOrder: normalizeInteger(source.mapGroupOrder) ?? 1000,
      mapGroupMemberOrder: inferMemberOrder(mapId, groupId, source),
    };
  }

  for (let index = 0; index < STATIC_MAP_GROUPS.length; index += 1) {
    const group = STATIC_MAP_GROUPS[index]!;
    if (mapId === group.id || group.prefixes.some((prefix) => mapId.startsWith(prefix))) {
      return {
        mapGroupId: group.id,
        mapGroupName: group.name,
        mapGroupOrder: group.order,
        mapGroupMemberOrder: inferMemberOrder(mapId, group.id, source),
      };
    }
  }

  const parentMapId = normalizeText(source.parentMapId);
  if (parentMapId) {
    const groupName = inferNamePrefix(mapName) || parentMapId;
    return {
      mapGroupId: parentMapId,
      mapGroupName: groupName,
      mapGroupOrder: 500,
      mapGroupMemberOrder: inferMemberOrder(mapId, parentMapId, source),
    };
  }

  return {
    mapGroupId: mapId,
    mapGroupName: inferNamePrefix(mapName) || mapName,
    mapGroupOrder: 1000,
    mapGroupMemberOrder: 0,
  };
}
