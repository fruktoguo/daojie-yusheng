/**
 * 本文件属于服务端内容加载或模板 Registry，负责把配置整理成运行期只读引用。
 *
 * 维护时要保持启动期解析、冻结和实例工厂边界，避免 tick 热路径复制大对象。
 */
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

/** 物品模板最小结构约束 */
type ItemTemplateRecord = Record<string, unknown> & {
  itemId: string;
  name: string;
  type?: string;
};

@Injectable()
export class ItemTemplateRegistry {
  readonly itemTemplates = new Map<string, ItemTemplateRecord>();

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
          this.itemTemplates.set(normalized.itemId, normalized as ItemTemplateRecord);
        }
      }
    }
    freezeTemplateMap(this.itemTemplates);
  }

  getRef(itemId: string): Readonly<ItemTemplateRecord> {
    const template = this.tryGetRef(itemId);
    if (!template) {
      throw new Error(`未找到物品模板：${itemId}`);
    }
    return template;
  }

  tryGetRef(itemId: string): Readonly<ItemTemplateRecord> | undefined {
    return this.itemTemplates.get(String(itemId ?? '').trim());
  }

  createInstance(itemId: string, init: Record<string, unknown> = {}): Record<string, unknown> | null {
    const template = this.tryGetRef(itemId);
    return template ? createItemInstanceFromTemplate(template, { ...init, itemId }) : null;
  }

  hydrate(itemId: string, payload: Record<string, unknown> = {}): Record<string, unknown> | null {
    return this.createInstance(itemId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.itemTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  createItem(itemId: string, count = 1): Record<string, unknown> | null {
    return this.createInstance(itemId, { itemId, count });
  }

  normalizeItem(item: unknown): Record<string, unknown> | null {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const record = item as Record<string, unknown>;
    const template = this.tryGetRef(String(record?.itemId ?? ''));
    if (!template) {
      return {
        ...record,
        count: Math.max(1, Math.trunc(Number(record.count) || 1)),
      };
    }
    return createItemInstanceFromTemplate(template, record);
  }

  getItemName(itemId: string): string | null {
    return (this.tryGetRef(itemId)?.name as string) ?? null;
  }

  getItemSortLevel(item: Record<string, unknown> | null | undefined, techniqueLevelResolver?: (techniqueId: string) => number | null): number {
    const template = this.tryGetRef(String(item?.itemId ?? ''));
    if (template?.learnTechniqueId) {
      const realmLv = techniqueLevelResolver?.(template.learnTechniqueId as string);
      if (Number.isFinite(realmLv)) {
        return Math.max(1, Math.trunc(Number(realmLv)));
      }
    }
    if (Number.isFinite(item?.level)) {
      return Math.max(1, Math.trunc(Number(item!.level)));
    }
    return template ? resolveItemTemplateLevel(template) : 1;
  }

  listItemTemplates(): Array<Record<string, unknown>> {
    return Array.from(this.itemTemplates.values(), (template) => ({
      itemId: template.itemId,
      name: template.name,
      type: template.type,
      groundLabel: template.groundLabel,
      grade: template.grade,
      level: template.level,
      equipSlot: template.equipSlot,
      desc: template.desc,
      equipAttrs: template.equipAttrs ? { ...(template.equipAttrs as object) } : undefined,
      equipStats: template.equipStats ? { ...(template.equipStats as object) } : undefined,
      equipValueStats: template.equipValueStats ? { ...(template.equipValueStats as object) } : undefined,
      equipSpecialStats: template.equipSpecialStats ? { ...(template.equipSpecialStats as object) } : undefined,
      tags: Array.isArray(template.tags) ? (template.tags as unknown[]).slice() : undefined,
      contextActions: Array.isArray(template.contextActions) ? (template.contextActions as unknown[]).map((entry) => ({ ...(entry as object) })) : undefined,
      effects: Array.isArray(template.effects) ? (template.effects as unknown[]).map((entry) => ({ ...(entry as object) })) : undefined,
      healAmount: template.healAmount,
      healPercent: template.healPercent,
      qiPercent: template.qiPercent,
      cooldown: template.cooldown,
      alchemySuccessRate: template.alchemySuccessRate,
      alchemySpeedRate: template.alchemySpeedRate,
      enhancementSuccessRate: template.enhancementSuccessRate,
      enhancementSpeedRate: template.enhancementSpeedRate,
      miningDamageRate: template.miningDamageRate,
      consumeBuffs: Array.isArray(template.consumeBuffs) ? (template.consumeBuffs as Array<Record<string, unknown>>).map((entry) => ({
        ...entry,
        attrs: entry.attrs ? { ...(entry.attrs as object) } : undefined,
        stats: entry.stats ? { ...(entry.stats as object) } : undefined,
        valueStats: entry.valueStats ? { ...(entry.valueStats as object) } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? (entry.qiProjection as unknown[]).map((projection) => ({ ...(projection as object) })) : undefined,
      })) : undefined,
      mapUnlockId: template.mapUnlockId,
      mapUnlockIds: Array.isArray(template.mapUnlockIds) ? (template.mapUnlockIds as unknown[]).slice() : undefined,
      respawnBindMapId: template.respawnBindMapId,
      tileAuraGainAmount: template.tileAuraGainAmount,
      tileResourceGains: Array.isArray(template.tileResourceGains) ? (template.tileResourceGains as unknown[]).map((entry) => ({ ...(entry as object) })) : undefined,
      useBehavior: template.useBehavior,
      formationDiskTier: template.formationDiskTier,
      formationDiskMultiplier: template.formationDiskMultiplier,
      spiritualRootSeedTier: template.spiritualRootSeedTier,
      allowBatchUse: template.allowBatchUse,
    })).sort((left, right) => (left.itemId as string).localeCompare(right.itemId as string, 'zh-Hans-CN'));
  }
}
