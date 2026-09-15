/**
 * gm/map-location.ts —— GM 地图选择器/位置分类纯函数。
 *
 * 从 gm.ts 抽取：isGmSectTemplateId/isGmSectRuntimeInstance/isGmSecretRealmRuntimeInstance/
 * resolvePositionMapCategory/getMapSummary/getMapDisplayName/
 * getPositionMapCategoryCounts/getPositionCategoryOptions/
 * getPositionMapInstances/getPositionMapOptions/getPositionCategoryForMap。
 * 纯函数，通过显式传参访问 gmMapSummaries/gmWorldInstances 等外部数据。
 */

import {
  type GmMapSummary,
  type GmWorldInstanceSummary,
} from '@mud/shared';
import { getCachedMapMeta } from '../map-static-cache';
import { t } from '../ui/i18n';

/** GmPositionMapCategory：位置地图类别。 */
export type GmPositionMapCategory = 'void' | 'real' | 'sect' | 'secret' | 'map';

/** GM_POSITION_MAP_CATEGORY_OPTIONS：位置地图类别选项。 */
export const GM_POSITION_MAP_CATEGORY_OPTIONS: readonly { id: GmPositionMapCategory; label: string }[] = [
  { id: 'void', label: t('gm.client.position.category.void') },
  { id: 'real', label: t('gm.client.position.category.real') },
  { id: 'sect', label: t('gm.client.position.category.sect') },
  { id: 'secret', label: t('gm.client.position.category.secret') },
];

/** isGmSectTemplateId：判断是否宗门模板 ID。 */
export function isGmSectTemplateId(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && templateId.trim().startsWith('sect_domain:');
}

/** isGmSectRuntimeInstance：判断是否宗门运行时实例。 */
export function isGmSectRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId'>): boolean {
  return isGmSectTemplateId(instance.templateId) && instance.instanceId.startsWith('sect:');
}

/** isGmSecretRealmRuntimeInstance：判断是否秘境运行时实例。 */
export function isGmSecretRealmRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId' | 'mapGroupId' | 'mapGroupName'>): boolean {
  return instance.instanceId.startsWith('tower:tongtian:layer:')
    || instance.templateId.startsWith('tongtian_tower_layer_')
    || instance.mapGroupId === 'secret_realm'
    || instance.mapGroupName === '秘境';
}

/** resolvePositionMapCategory：解析位置地图类别。 */
export function resolvePositionMapCategory(instance: GmWorldInstanceSummary): GmPositionMapCategory {
  if (isGmSectRuntimeInstance(instance)) return 'sect';
  if (isGmSecretRealmRuntimeInstance(instance)) return 'secret';
  return instance.linePreset === 'real' ? 'real' : 'void';
}

/** getMapSummary：读取地图摘要。 */
export function getMapSummary(mapId: string, gmMapSummaries: GmMapSummary[]): GmMapSummary | null {
  return gmMapSummaries.find((entry) => entry.id === mapId) ?? null;
}

/** getMapDisplayName：读取地图显示名称。 */
export function getMapDisplayName(mapId: string, gmMapSummaries: GmMapSummary[], fallbackName?: string): string {
  const name = getMapSummary(mapId, gmMapSummaries)?.name || getCachedMapMeta(mapId)?.name || fallbackName || '未知地域';
  return name.trim() || '未知地域';
}

/** getPositionMapCategoryCounts：读取位置地图类别计数。 */
export function getPositionMapCategoryCounts(gmWorldInstances: GmWorldInstanceSummary[]): Map<GmPositionMapCategory, number> {
  const counts = new Map<GmPositionMapCategory, number>();
  for (const instance of gmWorldInstances) {
    const category = resolvePositionMapCategory(instance);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

/** getPositionCategoryOptions：读取位置类别选项。 */
export function getPositionCategoryOptions(
  currentCategory: GmPositionMapCategory,
  gmWorldInstances: GmWorldInstanceSummary[],
): Array<{ value: string; label: string }> {
  if (gmWorldInstances.length === 0) {
    return [{ value: 'map', label: '地图' }];
  }
  const counts = getPositionMapCategoryCounts(gmWorldInstances);
  const options = GM_POSITION_MAP_CATEGORY_OPTIONS
    .filter((entry) => (counts.get(entry.id) ?? 0) > 0 || entry.id === currentCategory)
    .map((entry) => ({
      value: entry.id,
      label: `${entry.label}（${counts.get(entry.id) ?? 0}）`,
    }));
  return options.length > 0 ? options : [{ value: 'map', label: '地图' }];
}

/** getPositionMapInstances：读取位置地图实例。 */
export function getPositionMapInstances(category: GmPositionMapCategory, gmWorldInstances: GmWorldInstanceSummary[]): GmWorldInstanceSummary[] {
  return gmWorldInstances
    .filter((instance) => resolvePositionMapCategory(instance) === category)
    .slice()
    .sort((left, right) => {
      const leftGroupOrder = left.mapGroupOrder ?? 1000;
      const rightGroupOrder = right.mapGroupOrder ?? 1000;
      if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder;
      const groupOrder = (left.mapGroupName || left.templateName).localeCompare(right.mapGroupName || right.templateName, 'zh-Hans-CN');
      if (groupOrder !== 0) return groupOrder;
      const memberOrder = (left.mapGroupMemberOrder ?? 0) - (right.mapGroupMemberOrder ?? 0);
      if (memberOrder !== 0) return memberOrder;
      const defaultOrder = Number(!left.defaultEntry) - Number(!right.defaultEntry);
      if (defaultOrder !== 0) return defaultOrder;
      return left.templateName.localeCompare(right.templateName, 'zh-Hans-CN') || left.templateId.localeCompare(right.templateId);
    });
}

/** getPositionMapOptions：读取位置地图选项。 */
export function getPositionMapOptions(
  category: GmPositionMapCategory,
  currentMapId: string,
  gmWorldInstances: GmWorldInstanceSummary[],
  gmMapSummaries: GmMapSummary[],
  fallbackMapIds: string[],
): Array<{ value: string; label: string }> {
  const optionsByMapId = new Map<string, { value: string; label: string }>();
  if (category !== 'map' && gmWorldInstances.length > 0) {
    for (const instance of getPositionMapInstances(category, gmWorldInstances)) {
      if (optionsByMapId.has(instance.templateId)) continue;
      optionsByMapId.set(instance.templateId, {
        value: instance.templateId,
        label: getMapDisplayName(instance.templateId, gmMapSummaries, instance.templateName),
      });
    }
  } else {
    const maps = gmMapSummaries.length > 0
      ? gmMapSummaries.slice().sort((left, right) => {
        const groupOrder = (left.mapGroupOrder ?? 1000) - (right.mapGroupOrder ?? 1000);
        if (groupOrder !== 0) return groupOrder;
        const groupNameOrder = (left.mapGroupName || left.name).localeCompare(right.mapGroupName || right.name, 'zh-Hans-CN');
        if (groupNameOrder !== 0) return groupNameOrder;
        const memberOrder = (left.mapGroupMemberOrder ?? 0) - (right.mapGroupMemberOrder ?? 0);
        if (memberOrder !== 0) return memberOrder;
        return left.name.localeCompare(right.name, 'zh-Hans-CN') || left.id.localeCompare(right.id);
      })
      : Array.from(new Set(fallbackMapIds)).map((mapId) => ({ id: mapId, name: getCachedMapMeta(mapId)?.name ?? '未知地域' } as GmMapSummary));
    for (const map of maps) {
      optionsByMapId.set(map.id, { value: map.id, label: getMapDisplayName(map.id, gmMapSummaries, map.name) });
    }
  }
  if (currentMapId && !optionsByMapId.has(currentMapId)) {
    optionsByMapId.set(currentMapId, { value: currentMapId, label: getMapDisplayName(currentMapId, gmMapSummaries) });
  }
  return Array.from(optionsByMapId.values());
}

/** getPositionCategoryForMap：读取地图对应的位置类别。 */
export function getPositionCategoryForMap(
  playerId: string,
  mapId: string,
  positionMapCategoryDraft: { playerId: string; category: GmPositionMapCategory } | null,
  gmWorldInstances: GmWorldInstanceSummary[],
  gmMapSummaries: GmMapSummary[],
  fallbackMapIds: string[],
): GmPositionMapCategory {
  if (
    positionMapCategoryDraft?.playerId === playerId
    && getPositionMapOptions(positionMapCategoryDraft.category, mapId, gmWorldInstances, gmMapSummaries, fallbackMapIds).some((entry) => entry.value === mapId)
  ) {
    return positionMapCategoryDraft.category;
  }
  for (const entry of GM_POSITION_MAP_CATEGORY_OPTIONS) {
    if (getPositionMapOptions(entry.id, mapId, gmWorldInstances, gmMapSummaries, fallbackMapIds).some((option) => option.value === mapId)) {
      return entry.id;
    }
  }
  return 'map';
}

/** patchPositionMapSelect：更新位置地图选择器选项。 */
export function patchPositionMapSelect(
  category: GmPositionMapCategory,
  currentMapId: string,
  editorContentEl: HTMLElement,
  gmWorldInstances: GmWorldInstanceSummary[],
  gmMapSummaries: GmMapSummary[],
  fallbackMapIds: string[],
): string {
  const mapSelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-select]');
  if (!mapSelect) return currentMapId;
  const mapOptions = getPositionMapOptions(category, currentMapId, gmWorldInstances, gmMapSummaries, fallbackMapIds);
  const nextMapId = mapOptions.some((entry) => entry.value === currentMapId)
    ? currentMapId
    : mapOptions[0]?.value ?? currentMapId;
  const fragment = document.createDocumentFragment();
  for (const option of mapOptions) {
    const optionEl = document.createElement('option');
    optionEl.value = String(option.value);
    optionEl.textContent = option.label;
    optionEl.selected = option.value === nextMapId;
    fragment.append(optionEl);
  }
  mapSelect.replaceChildren(fragment);
  mapSelect.value = nextMapId;
  return nextMapId;
}

/** resolvePositionTargetInstanceId：解析位置目标实例 ID。 */
export function resolvePositionTargetInstanceId(
  mapId: string,
  editorContentEl: HTMLElement,
  positionMapCategoryDraft: { playerId: string; category: GmPositionMapCategory } | null,
  gmWorldInstances: GmWorldInstanceSummary[],
): string | undefined {
  const categorySelect = editorContentEl.querySelector<HTMLSelectElement>('select[data-gm-position-map-category]');
  const category = (categorySelect?.value as GmPositionMapCategory | undefined) ?? positionMapCategoryDraft?.category ?? 'map';
  if (category === 'map') return undefined;
  const candidates = getPositionMapInstances(category, gmWorldInstances).filter((instance) => instance.templateId === mapId);
  const target = candidates.find((instance) => instance.defaultEntry)
    ?? candidates.find((instance) => instance.lineIndex === 1)
    ?? candidates[0];
  return target?.instanceId;
}
