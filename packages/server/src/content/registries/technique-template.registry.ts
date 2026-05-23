/**
 * 本文件属于服务端内容加载或模板 Registry，负责把配置整理成运行期只读引用。
 *
 * 维护时要保持启动期解析、冻结和实例工厂边界，避免 tick 热路径复制大对象。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { TechniqueRealm, deriveTechniqueRealm, getTechniqueExpToNext } from '@mud/shared';
import type { TechniqueTemplate } from '@mud/shared';
import { resolveProjectPath } from '../../common/project-path';
import type { GeneratedTechniqueStoreService } from '../../runtime/technique-generation/generated-technique-store.service';
import {
  buildTechniqueRuntimeStateFromTemplate,
  cloneQiProjectionModifiers,
  cloneTechniqueLayerAttrsWithoutSpecialStats,
  collectJsonFiles,
  normalizeTechniqueTemplate,
  resolveTechniqueLayerSpecialStats,
} from '../content-template-utils';
import { freezeTemplateMap } from './template-freeze';

/** 功法模板最小结构约束 */
type TechniqueTemplateRecord = Record<string, unknown> & {
  id: string;
  name: string;
  desc?: string;
  grade?: string;
  category?: string;
  realmLv?: number;
  skills: Array<Record<string, unknown>>;
  layers: Array<Record<string, unknown> & { level: number; expToNext?: number; attrs?: Record<string, unknown>; specialStats?: Record<string, unknown>; qiProjection?: unknown }>;
};

@Injectable()
export class TechniqueTemplateRegistry {
  readonly techniqueTemplates = new Map<string, TechniqueTemplateRecord>();
  private generatedStore: GeneratedTechniqueStoreService | null = null;

  /** 注入生成功法缓存（启动期由外部调用） */
  setGeneratedStore(store: GeneratedTechniqueStoreService): void {
    this.generatedStore = store;
  }

  loadAll(sharedTechniqueBuffs = new Map<string, Record<string, unknown>>()): void {
    this.techniqueTemplates.clear();
    const techniqueFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'techniques'));
    for (const file of techniqueFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const entry of parsed) {
        const normalized = normalizeTechniqueTemplate(entry, sharedTechniqueBuffs);
        if (normalized) {
          this.techniqueTemplates.set(normalized.id, normalized as TechniqueTemplateRecord);
        }
      }
    }
    freezeTemplateMap(this.techniqueTemplates);
  }

  getRef(techniqueId: string): Readonly<TechniqueTemplateRecord> {
    const template = this.tryGetRef(techniqueId);
    if (!template) {
      throw new Error(`未找到功法模板：${techniqueId}`);
    }
    return template;
  }

  tryGetRef(techniqueId: string): Readonly<TechniqueTemplateRecord> | undefined {
    const id = String(techniqueId ?? '').trim();
    const staticRef = this.techniqueTemplates.get(id);
    if (staticRef) return staticRef;
    // fallback: 从生成功法缓存查找
    const generated = this.generatedStore?.getById(id);
    if (!generated) return undefined;
    return generatedTemplateToRecord(generated);
  }

  createInstance(techniqueId: string, init: Record<string, unknown> = {}): Record<string, unknown> | null {
    const template = this.tryGetRef(techniqueId);
    return template ? buildTechniqueRuntimeStateFromTemplate(template, init) : null;
  }

  hydrate(techniqueId: string, payload: Record<string, unknown> = {}): Record<string, unknown> | null {
    const template = this.tryGetRef(techniqueId);
    if (template) {
      return buildTechniqueRuntimeStateFromTemplate(template, payload);
    }
    return hydrateMissingTechniqueState(payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.techniqueTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  createTechniqueState(techniqueId: string): Record<string, unknown> | null {
    return this.createInstance(techniqueId, {
      level: 1,
      exp: 0,
      realm: TechniqueRealm.Entry,
    });
  }

  getTechniqueName(techniqueId: string): string | null {
    return (this.tryGetRef(techniqueId)?.name as string) ?? null;
  }

  getTechniqueRealmLevel(techniqueId: string): number | null {
    const realmLv = this.tryGetRef(techniqueId)?.realmLv;
    return Number.isFinite(realmLv) ? Math.max(1, Math.trunc(Number(realmLv))) : null;
  }

  listTechniqueTemplates(): Array<Record<string, unknown>> {
    return Array.from(this.techniqueTemplates.values(), (template) => ({
      id: template.id,
      name: template.name,
      desc: template.desc,
      grade: template.grade,
      category: template.category,
      realmLv: template.realmLv,
      skills: template.skills.map((entry) => ({ ...entry })),
      layers: template.layers.map((entry) => ({
        level: entry.level,
        expToNext: entry.expToNext,
        attrs: entry.attrs ? { ...entry.attrs } : undefined,
        specialStats: entry.specialStats ? { ...entry.specialStats } : undefined,
        qiProjection: cloneQiProjectionModifiers(entry.qiProjection),
      })),
    })).sort((left, right) => (left.id as string).localeCompare(right.id as string, 'zh-Hans-CN'));
  }
}

function hydrateMissingTechniqueState(input: Record<string, unknown>): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const techId = typeof input.techId === 'string' ? input.techId.trim() : '';
  if (!techId) {
    return null;
  }
  const level = Number.isFinite(input.level) ? Math.max(1, Math.trunc(Number(input.level))) : 1;
  const rawLayers = Array.isArray(input.layers) ? input.layers : [];
  const layers = rawLayers.length > 0
    ? rawLayers.map((entry: unknown) => {
      const e = entry as Record<string, unknown> | null;
      const layerLevel = Number.isFinite(e?.level) ? Math.max(1, Math.trunc(Number(e!.level))) : 1;
      return {
        level: layerLevel,
        expToNext: Number.isFinite(e?.expToNext) ? Math.max(0, Math.trunc(Number(e!.expToNext))) : 0,
        attrs: cloneTechniqueLayerAttrsWithoutSpecialStats(e?.attrs),
        specialStats: resolveTechniqueLayerSpecialStats(e, undefined),
        qiProjection: cloneQiProjectionModifiers(e?.qiProjection),
      };
    })
    : [];
  return {
    techId,
    name: typeof input.name === 'string' && input.name ? input.name : techId,
    level,
    exp: Number.isFinite(input.exp) ? Math.max(0, Math.trunc(Number(input.exp))) : 0,
    expToNext: Number.isFinite(input.expToNext)
      ? Math.max(0, Math.trunc(Number(input.expToNext)))
      : (getTechniqueExpToNext(level, layers) ?? 0),
    realmLv: Number.isFinite(input.realmLv) ? Math.max(1, Math.trunc(Number(input.realmLv))) : 1,
    realm: Number.isFinite(input.realm) ? Math.max(0, Math.trunc(Number(input.realm))) : deriveTechniqueRealm(level, layers),
    skills: Array.isArray(input.skills) ? (input.skills as unknown[]).map((entry) => ({ ...(entry as object) })) : [],
    grade: typeof input.grade === 'string' ? input.grade : undefined,
    category: typeof input.category === 'string' ? input.category : undefined,
    layers,
  };
}

/** 将 TechniqueTemplate（生成功法缓存格式）转为 TechniqueTemplateRecord（Registry 内部格式） */
function generatedTemplateToRecord(template: TechniqueTemplate): TechniqueTemplateRecord {
  return {
    id: template.id,
    name: template.name,
    desc: template.desc,
    grade: template.grade,
    category: template.category,
    realmLv: template.realmLv,
    skills: (template.skills ?? []) as Array<Record<string, unknown>>,
    layers: (template.layers ?? []) as Array<Record<string, unknown> & { level: number; expToNext?: number; attrs?: Record<string, unknown>; specialStats?: Record<string, unknown>; qiProjection?: unknown }>,
  };
}
