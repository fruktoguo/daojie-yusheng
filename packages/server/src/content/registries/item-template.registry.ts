import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { resolveProjectPath } from '../../common/project-path';
import {
  collectJsonFiles,
  createItemInstanceFromTemplate,
  normalizeItemTemplate,
  resolveItemTemplateLevel,
} from '../content-template-utils';
import { freezeTemplateMap } from './template-freeze';

@Injectable()
export class ItemTemplateRegistry {
  readonly itemTemplates = new Map<string, any>();

  loadAll(): void {
    this.itemTemplates.clear();
    const itemFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'items'));
    for (const file of itemFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const entry of parsed) {
        const normalized = normalizeItemTemplate(entry);
        if (normalized) {
          this.itemTemplates.set(normalized.itemId, normalized);
        }
      }
    }
    freezeTemplateMap(this.itemTemplates);
  }

  getRef(itemId: string): Readonly<any> {
    const template = this.tryGetRef(itemId);
    if (!template) {
      throw new Error(`未找到物品模板：${itemId}`);
    }
    return template;
  }

  tryGetRef(itemId: string): Readonly<any> | undefined {
    return this.itemTemplates.get(String(itemId ?? '').trim());
  }

  createInstance(itemId: string, init: any = {}): any {
    const template = this.tryGetRef(itemId);
    return template ? createItemInstanceFromTemplate(template, { ...init, itemId }) : null;
  }

  hydrate(itemId: string, payload: any = {}): any {
    return this.createInstance(itemId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.itemTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  createItem(itemId: string, count = 1): any {
    return this.createInstance(itemId, { itemId, count });
  }

  normalizeItem(item: any): any {
    const template = this.tryGetRef(item?.itemId);
    if (!template) {
      return {
        ...item,
        count: Math.max(1, Math.trunc(item.count)),
      };
    }
    return createItemInstanceFromTemplate(template, item);
  }

  getItemName(itemId: string): string | null {
    return this.tryGetRef(itemId)?.name ?? null;
  }

  getItemSortLevel(item: any, techniqueLevelResolver?: (techniqueId: string) => number | null): number {
    const template = this.tryGetRef(String(item?.itemId ?? ''));
    if (template?.learnTechniqueId) {
      const realmLv = techniqueLevelResolver?.(template.learnTechniqueId);
      if (Number.isFinite(realmLv)) {
        return Math.max(1, Math.trunc(Number(realmLv)));
      }
    }
    if (Number.isFinite(item?.level)) {
      return Math.max(1, Math.trunc(Number(item.level)));
    }
    return template ? resolveItemTemplateLevel(template) : 1;
  }

  listItemTemplates(): any[] {
    return Array.from(this.itemTemplates.values(), (template) => ({
      itemId: template.itemId,
      name: template.name,
      type: template.type,
      groundLabel: template.groundLabel,
      grade: template.grade,
      level: template.level,
      equipSlot: template.equipSlot,
      desc: template.desc,
      equipAttrs: template.equipAttrs ? { ...template.equipAttrs } : undefined,
      equipStats: template.equipStats ? { ...template.equipStats } : undefined,
      equipValueStats: template.equipValueStats ? { ...template.equipValueStats } : undefined,
      equipSpecialStats: template.equipSpecialStats ? { ...template.equipSpecialStats } : undefined,
      tags: Array.isArray(template.tags) ? template.tags.slice() : undefined,
      contextActions: Array.isArray(template.contextActions) ? template.contextActions.map((entry) => ({ ...entry })) : undefined,
      effects: Array.isArray(template.effects) ? template.effects.map((entry) => ({ ...entry })) : undefined,
      healAmount: template.healAmount,
      healPercent: template.healPercent,
      qiPercent: template.qiPercent,
      alchemySuccessRate: template.alchemySuccessRate,
      alchemySpeedRate: template.alchemySpeedRate,
      enhancementSuccessRate: template.enhancementSuccessRate,
      enhancementSpeedRate: template.enhancementSpeedRate,
      miningDamageRate: template.miningDamageRate,
      consumeBuffs: Array.isArray(template.consumeBuffs) ? template.consumeBuffs.map((entry) => ({
        ...entry,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        stats: entry.stats ? { ...entry.stats } : undefined,
        valueStats: entry.valueStats ? { ...entry.valueStats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((projection) => ({ ...projection })) : undefined,
      })) : undefined,
      mapUnlockId: template.mapUnlockId,
      mapUnlockIds: Array.isArray(template.mapUnlockIds) ? template.mapUnlockIds.slice() : undefined,
      respawnBindMapId: template.respawnBindMapId,
      tileAuraGainAmount: template.tileAuraGainAmount,
      tileResourceGains: Array.isArray(template.tileResourceGains) ? template.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
      useBehavior: template.useBehavior,
      formationDiskTier: template.formationDiskTier,
      formationDiskMultiplier: template.formationDiskMultiplier,
      spiritualRootSeedTier: template.spiritualRootSeedTier,
      allowBatchUse: template.allowBatchUse,
    })).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  }
}
