/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
import {
  S2C,
  TECHNIQUE_GRADE_ORDER,
  TechniqueRealm,
  deriveTechniqueRealm,
  getTechniqueMaxLevel,
  type TechniqueCategory,
  type TechniqueGrade,
  type TechniquePageCategoryFilterView,
  type TechniquePageStatusFilterView,
} from '@mud/shared';
import type { WorldGatewayHelperContext } from './world-gateway-context.types';

const TECHNIQUE_PAGE_DEFAULT_LIMIT = 12;
const TECHNIQUE_PAGE_MAX_LIMIT = 24;
const TECHNIQUE_CATEGORY_FILTERS = new Set<string>(['all', 'arts', 'internal', 'divine', 'secret']);
const TECHNIQUE_STATUS_FILTERS = new Set<string>(['in_progress', 'completed', 'all']);
const TECHNIQUE_GRADE_SORT_INDEX = new Map(
  TECHNIQUE_GRADE_ORDER.map((grade, index) => [grade, index] as const),
);

/** 世界 socket 功法 helper：收敛功法面板低频分页查询入口。 */
export class WorldGatewayTechniqueHelper {
  constructor(private readonly gateway: WorldGatewayHelperContext) {}

  handleRequestTechniquePage(client, payload): void {
    const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
    if (!playerId) {
      return;
    }
    try {
      const player = this.gateway.playerRuntimeService.getPlayer(playerId);
      if (!player) {
        return;
      }
      client.emit(S2C.TechniquePage, buildTechniquePagePayload(player, payload));
    }
    catch (error) {
      this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_TECHNIQUE_PAGE_FAILED', error);
    }
  }
}

function buildTechniquePagePayload(player: any, payload: any) {
  const category = normalizeTechniquePageCategory(payload?.category);
  const status = normalizeTechniquePageStatus(payload?.status);
  const search = normalizeTechniquePageSearch(payload?.search);
  const offset = normalizeTechniquePageOffset(payload?.offset);
  const limit = normalizeTechniquePageLimit(payload?.limit);
  const techniques = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
  const filtered = techniques
    .filter((entry) => matchesTechniquePageCategory(entry, category))
    .filter((entry) => matchesTechniquePageStatus(entry, status))
    .filter((entry) => matchesTechniquePageSearch(entry, search))
    .sort(compareTechniqueForPanel);
  const items = filtered
    .slice(offset, offset + limit)
    .map((entry) => projectTechniquePageItem(entry));
  return {
    requestId: normalizeTechniquePageRequestId(payload?.requestId),
    category,
    status,
    search,
    offset,
    limit,
    total: filtered.length,
    totalItems: techniques.length,
    revision: Math.max(1, Math.trunc(Number(player?.techniques?.revision ?? 1) || 1)),
    items,
  };
}

function normalizeTechniquePageCategory(value: unknown): TechniquePageCategoryFilterView {
  const category = typeof value === 'string' ? value.trim() : 'all';
  return TECHNIQUE_CATEGORY_FILTERS.has(category)
    ? category as TechniquePageCategoryFilterView
    : 'all';
}

function normalizeTechniquePageStatus(value: unknown): TechniquePageStatusFilterView {
  const status = typeof value === 'string' ? value.trim() : 'in_progress';
  return TECHNIQUE_STATUS_FILTERS.has(status)
    ? status as TechniquePageStatusFilterView
    : 'in_progress';
}

function normalizeTechniquePageOffset(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeTechniquePageLimit(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return TECHNIQUE_PAGE_DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(TECHNIQUE_PAGE_MAX_LIMIT, parsed));
}

function normalizeTechniquePageSearch(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, 64).toLowerCase();
}

function normalizeTechniquePageRequestId(value: unknown): string | undefined {
  const requestId = typeof value === 'string' ? value.trim() : '';
  return requestId ? requestId.slice(0, 80) : undefined;
}

function matchesTechniquePageCategory(entry: any, category: TechniquePageCategoryFilterView): boolean {
  return category === 'all' || resolveTechniqueCategory(entry) === category;
}

function matchesTechniquePageStatus(entry: any, status: TechniquePageStatusFilterView): boolean {
  if (status === 'all') {
    return true;
  }
  const level = normalizeTechniqueLevel(entry?.level);
  const maxLevel = getTechniqueMaxLevel(Array.isArray(entry?.layers) ? entry.layers : undefined, level);
  return status === 'in_progress' ? level < maxLevel : level >= maxLevel;
}

function matchesTechniquePageSearch(entry: any, search: string): boolean {
  if (!search) {
    return true;
  }
  const name = typeof entry?.name === 'string' ? entry.name.toLowerCase() : '';
  if (!name) {
    return false;
  }
  return search.split(' ').every((term) => term.length === 0 || name.includes(term));
}

function compareTechniqueForPanel(left: any, right: any): number {
  const realmDiff = getResolvedTechniqueRealm(right) - getResolvedTechniqueRealm(left);
  if (realmDiff !== 0) {
    return realmDiff;
  }
  const gradeDiff = getTechniqueGradeSortIndex(right?.grade) - getTechniqueGradeSortIndex(left?.grade);
  if (gradeDiff !== 0) {
    return gradeDiff;
  }
  const realmLevelDiff = normalizeTechniqueNumber(right?.realmLv, 0) - normalizeTechniqueNumber(left?.realmLv, 0);
  if (realmLevelDiff !== 0) {
    return realmLevelDiff;
  }
  const levelDiff = normalizeTechniqueLevel(right?.level) - normalizeTechniqueLevel(left?.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }
  return String(left?.name ?? left?.techId ?? '').localeCompare(String(right?.name ?? right?.techId ?? ''), 'zh-CN');
}

function projectTechniquePageItem(entry: any) {
  const level = normalizeTechniqueLevel(entry?.level);
  const layers = Array.isArray(entry?.layers) ? entry.layers : [];
  return {
    techId: String(entry?.techId ?? ''),
    name: typeof entry?.name === 'string' ? entry.name : String(entry?.techId ?? ''),
    level,
    exp: Math.max(0, Number(entry?.exp) || 0),
    expToNext: Math.max(0, Number(entry?.expToNext) || 0),
    realmLv: Number.isFinite(Number(entry?.realmLv)) ? Math.max(1, Math.trunc(Number(entry.realmLv))) : undefined,
    realm: Number.isFinite(Number(entry?.realm)) ? Math.trunc(Number(entry.realm)) : deriveTechniqueRealm(level, layers),
    skillsEnabled: entry?.skillsEnabled !== false,
    grade: normalizeTechniqueGrade(entry?.grade),
    category: resolveTechniqueCategory(entry),
    skills: Array.isArray(entry?.skills) ? entry.skills : [],
    layers,
  };
}

function resolveTechniqueCategory(entry: any): TechniqueCategory {
  const category = typeof entry?.category === 'string' ? entry.category : '';
  return category === 'internal' || category === 'divine' || category === 'secret' ? category : 'arts';
}

function getResolvedTechniqueRealm(entry: any): TechniqueRealm {
  if (Number.isFinite(Number(entry?.realm))) {
    return Math.trunc(Number(entry.realm)) as TechniqueRealm;
  }
  return deriveTechniqueRealm(normalizeTechniqueLevel(entry?.level), Array.isArray(entry?.layers) ? entry.layers : undefined);
}

function getTechniqueGradeSortIndex(value: unknown): number {
  return TECHNIQUE_GRADE_SORT_INDEX.get(normalizeTechniqueGrade(value)) ?? 0;
}

function normalizeTechniqueGrade(value: unknown): TechniqueGrade {
  return TECHNIQUE_GRADE_ORDER.includes(value as TechniqueGrade) ? value as TechniqueGrade : 'mortal';
}

function normalizeTechniqueLevel(value: unknown): number {
  return Math.max(1, Math.trunc(Number(value ?? 1) || 1));
}

function normalizeTechniqueNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
