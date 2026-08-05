/**
 * 本文件属于服务端内容加载或模板 Registry，负责把配置整理成运行期只读引用。
 *
 * 维护时要保持启动期解析、冻结和实例工厂边界，避免 tick 热路径复制大对象。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { buildGmEditorItemOptionFromTemplate, type GmEditorItemOption, resolveItemTemplateAliasId } from '@mud/shared';
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
    const errors: string[] = [];
    const itemFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'items'));
    for (const file of itemFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(parsed)) {
        errors.push(`${file}: 物品配置文件必须是数组`);
        continue;
      }
      parsed.forEach((entry, index) => {
        const normalized = normalizeItemTemplate(entry);
        if (!normalized) {
          errors.push(`${file}[${index}]: 物品模板缺少有效 itemId 或字段非法`);
          return;
        }
        this.itemTemplates.set(normalized.itemId, normalized as ItemTemplateRecord);
      });
    }
    if (errors.length > 0) {
      this.itemTemplates.clear();
      throw new Error(`物品模板加载失败:\n${errors.join('\n')}`);
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
    return this.itemTemplates.get(resolveItemTemplateId(itemId));
  }

  createInstance(itemId: string, init: Record<string, unknown> = {}): Record<string, unknown> | null {
    const resolvedItemId = resolveItemTemplateId(itemId);
    const template = this.itemTemplates.get(resolvedItemId);
    return template ? createItemInstanceFromTemplate(template, { ...init, itemId: resolvedItemId }) : null;
  }

  hydrate(itemId: string, payload: Record<string, unknown> = {}): Record<string, unknown> | null {
    return this.createInstance(itemId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.itemTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  createItem(itemId: string, count = 1): Record<string, unknown> | null {
    const resolvedItemId = resolveItemTemplateId(itemId);
    return this.createInstance(resolvedItemId, { itemId: resolvedItemId, count });
  }

  normalizeItem(item: unknown): Record<string, unknown> | null {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const record = item as Record<string, unknown>;
    const resolvedItemId = resolveItemTemplateId(String(record?.itemId ?? ''));
    const template = this.itemTemplates.get(resolvedItemId);
    if (!template) {
      return {
        ...record,
        count: Math.max(1, Math.trunc(Number(record.count) || 1)),
      };
    }
    return createItemInstanceFromTemplate(template, { ...record, itemId: resolvedItemId });
  }

  getItemName(itemId: string): string | null {
    return (this.tryGetRef(itemId)?.name as string) ?? null;
  }

  /** 交易行只接受目录中存在且未显式关闭流通的物品。 */
  isMarketTradable(itemId: string): boolean {
    const template = this.tryGetRef(itemId);
    return template !== undefined && template.marketTradable !== false;
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

  listItemTemplates(): GmEditorItemOption[] {
    return Array.from(this.itemTemplates.values())
      .map((template) => buildGmEditorItemOptionFromTemplate(template))
      .filter((entry): entry is NonNullable<ReturnType<typeof buildGmEditorItemOptionFromTemplate>> => Boolean(entry))
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  }
}

function resolveItemTemplateId(itemId: unknown): string {
  return resolveItemTemplateAliasId(itemId);
}
