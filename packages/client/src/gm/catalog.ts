/**
 * gm/catalog.ts —— GM 编辑器目录选项与查找工具。
 *
 * 从 gm.ts 抽取：getTechniqueCatalogOptions/getItemCatalogOptions/getBuffCatalogOptions、
 * findTechniqueCatalogEntry/findItemCatalogEntry/findBuffCatalogEntry、
 * createTechniqueFromCatalog/createItemFromCatalog/createBuffFromCatalog 等。
 * 通过参数接收 editorCatalog 与 hasServerCatalog 标志，不直接依赖 gm.ts 模块状态。
 */

import type {
  GmEditorBuffOption,
  GmEditorCatalogRes,
  GmEditorItemOption,
  GmEditorTechniqueOption,
  ItemStack,
  TechniqueState,
  TemporaryBuffState,
} from '@mud/shared';
import * as gmCatalogHelpers from '../gm/helpers/catalog';
import { clone } from './format';

// ── 选项标签 ──

export function getTechniqueOptionLabel(option: GmEditorTechniqueOption, catalog: GmEditorCatalogRes | null): string {
  return gmCatalogHelpers.getTechniqueOptionLabel(option, catalog);
}

export function getItemOptionLabel(option: GmEditorItemOption): string {
  return gmCatalogHelpers.getItemOptionLabel(option);
}

export function getBuffOptionLabel(option: GmEditorBuffOption): string {
  return gmCatalogHelpers.getBuffOptionLabel(option);
}

// ── 目录选项 ──

export function getTechniqueCatalogOptions(
  catalog: GmEditorCatalogRes | null,
  hasServerCatalog: boolean,
  includeEmpty = false,
): Array<{ value: string; label: string }> {
  if (!hasServerCatalog) {
    return includeEmpty ? [{ value: '', label: '未选择' }] : [];
  }
  return gmCatalogHelpers.getTechniqueCatalogOptions(catalog, includeEmpty);
}

export function getLearnedTechniqueOptions(
  techniques: TechniqueState[],
  includeEmpty = false,
): Array<{ value: string; label: string }> {
  const options = techniques.map((technique) => ({
    value: technique.techId,
    label: technique.name?.trim() || '未知功法',
  }));
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

export function getRealmCatalogOptions(catalog: GmEditorCatalogRes | null): Array<{ value: number; label: string }> {
  return gmCatalogHelpers.getRealmCatalogOptions(catalog);
}

export function getItemCatalogOptions(
  catalog: GmEditorCatalogRes | null,
  hasServerCatalog: boolean,
  filter?: (option: GmEditorItemOption) => boolean,
): Array<{ value: string; label: string }> {
  if (!hasServerCatalog) {
    return [];
  }
  return gmCatalogHelpers.getItemCatalogOptions(catalog, filter);
}

export function getBuffCatalogOptions(
  catalog: GmEditorCatalogRes | null,
  hasServerCatalog: boolean,
  selectedBuffId?: string,
): Array<{ value: string; label: string }> {
  if (!hasServerCatalog) {
    return selectedBuffId
      ? [
          { value: '', label: '请选择增益' },
          { value: selectedBuffId, label: selectedBuffId },
        ]
      : [{ value: '', label: '请选择增益' }];
  }
  return gmCatalogHelpers.getBuffCatalogOptions(catalog, selectedBuffId);
}

export function getMailAttachmentItemOptions(catalog: GmEditorCatalogRes | null): Array<{ value: string; label: string }> {
  return gmCatalogHelpers.getMailAttachmentItemOptions(catalog);
}

// ── 目录查找 ──

export function findTechniqueCatalogEntry(catalog: GmEditorCatalogRes | null, techId: string | undefined): GmEditorTechniqueOption | null {
  return gmCatalogHelpers.findTechniqueCatalogEntry(catalog, techId);
}

export function findItemCatalogEntry(catalog: GmEditorCatalogRes | null, itemId: string | undefined): GmEditorItemOption | null {
  return gmCatalogHelpers.findItemCatalogEntry(catalog, itemId);
}

export function findBuffCatalogEntry(catalog: GmEditorCatalogRes | null, buffId: string | undefined): GmEditorBuffOption | null {
  return gmCatalogHelpers.findBuffCatalogEntry(catalog, buffId);
}

// ── 从目录创建 ──

export function createTechniqueFromCatalog(
  techId: string,
  catalog: GmEditorCatalogRes | null,
  createDefaultTechnique: () => TechniqueState,
): TechniqueState {
  return gmCatalogHelpers.createTechniqueFromCatalog(techId, catalog, createDefaultTechnique, clone);
}

export function createItemFromCatalog(
  itemId: string,
  catalog: GmEditorCatalogRes | null,
  createDefaultItem: (equipSlot?: string) => ItemStack,
  count = 1,
): ItemStack {
  return gmCatalogHelpers.createItemFromCatalog(itemId, catalog, createDefaultItem, clone, count);
}

export function createBuffFromCatalog(
  buffId: string,
  catalog: GmEditorCatalogRes | null,
  createDefaultBuff: () => TemporaryBuffState,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  return gmCatalogHelpers.createBuffFromCatalog(buffId, catalog, createDefaultBuff, clone, current);
}

// ── 摘要与模板 ──

export function getTechniqueSummary(technique: TechniqueState): string {
  return gmCatalogHelpers.getTechniqueSummary(technique);
}

export function getTechniqueTemplateMaxLevel(technique: TechniqueState, catalog: GmEditorCatalogRes | null): number {
  return gmCatalogHelpers.getTechniqueTemplateMaxLevel(technique, catalog);
}

export function buildMaxLevelTechniqueState(
  technique: TechniqueState,
  catalog: GmEditorCatalogRes | null,
  createDefaultTechnique: () => TechniqueState,
): TechniqueState {
  const catalogEntry = findTechniqueCatalogEntry(catalog, technique.techId);
  const maxLevel = getTechniqueTemplateMaxLevel(technique, catalog);
  if (!catalogEntry) {
    return {
      ...clone(technique),
      level: maxLevel,
      exp: 0,
      expToNext: 0,
    };
  }
  const next = createTechniqueFromCatalog(technique.techId, catalog, createDefaultTechnique);
  return {
    ...next,
    level: maxLevel,
    exp: 0,
    expToNext: 0,
  };
}

export function getInventoryRowMeta(catalog: GmEditorCatalogRes | null, item: ItemStack): string {
  return gmCatalogHelpers.getResolvedInventoryRowMeta(catalog, item);
}
