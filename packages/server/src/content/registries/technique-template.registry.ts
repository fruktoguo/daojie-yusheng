import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { TechniqueRealm, deriveTechniqueRealm, getTechniqueExpToNext } from '@mud/shared';
import { resolveProjectPath } from '../../common/project-path';
import {
  buildTechniqueRuntimeStateFromTemplate,
  cloneQiProjectionModifiers,
  cloneTechniqueLayerAttrsWithoutSpecialStats,
  collectJsonFiles,
  normalizeTechniqueTemplate,
  resolveTechniqueLayerSpecialStats,
} from '../content-template-utils';
import { freezeTemplateMap } from './template-freeze';

@Injectable()
export class TechniqueTemplateRegistry {
  readonly techniqueTemplates = new Map<string, any>();

  loadAll(sharedTechniqueBuffs = new Map<string, any>()): void {
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
          this.techniqueTemplates.set(normalized.id, normalized);
        }
      }
    }
    freezeTemplateMap(this.techniqueTemplates);
  }

  getRef(techniqueId: string): Readonly<any> {
    const template = this.tryGetRef(techniqueId);
    if (!template) {
      throw new Error(`未找到功法模板：${techniqueId}`);
    }
    return template;
  }

  tryGetRef(techniqueId: string): Readonly<any> | undefined {
    return this.techniqueTemplates.get(String(techniqueId ?? '').trim());
  }

  createInstance(techniqueId: string, init: any = {}): any {
    const template = this.tryGetRef(techniqueId);
    return template ? buildTechniqueRuntimeStateFromTemplate(template, init) : null;
  }

  hydrate(techniqueId: string, payload: any = {}): any {
    const template = this.tryGetRef(techniqueId);
    if (template) {
      return buildTechniqueRuntimeStateFromTemplate(template, payload);
    }
    return hydrateMissingTechniqueState(payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.techniqueTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  createTechniqueState(techniqueId: string): any {
    return this.createInstance(techniqueId, {
      level: 1,
      exp: 0,
      realm: TechniqueRealm.Entry,
    });
  }

  getTechniqueName(techniqueId: string): string | null {
    return this.tryGetRef(techniqueId)?.name ?? null;
  }

  getTechniqueRealmLevel(techniqueId: string): number | null {
    const realmLv = this.tryGetRef(techniqueId)?.realmLv;
    return Number.isFinite(realmLv) ? Math.max(1, Math.trunc(Number(realmLv))) : null;
  }

  listTechniqueTemplates(): any[] {
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
    })).sort((left, right) => left.id.localeCompare(right.id, 'zh-Hans-CN'));
  }
}

function hydrateMissingTechniqueState(input: any): any {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const techId = typeof input.techId === 'string' ? input.techId.trim() : '';
  if (!techId) {
    return null;
  }
  const level = Number.isFinite(input.level) ? Math.max(1, Math.trunc(Number(input.level))) : 1;
  const layers = Array.isArray(input.layers) && input.layers.length > 0
    ? input.layers.map((entry) => {
      const layerLevel = Number.isFinite(entry?.level) ? Math.max(1, Math.trunc(Number(entry.level))) : 1;
      return {
        level: layerLevel,
        expToNext: Number.isFinite(entry?.expToNext) ? Math.max(0, Math.trunc(Number(entry.expToNext))) : 0,
        attrs: cloneTechniqueLayerAttrsWithoutSpecialStats(entry?.attrs),
        specialStats: resolveTechniqueLayerSpecialStats(entry, undefined),
        qiProjection: cloneQiProjectionModifiers(entry?.qiProjection),
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
    skills: Array.isArray(input.skills) ? input.skills.map((entry) => ({ ...entry })) : [],
    grade: typeof input.grade === 'string' ? input.grade : undefined,
    category: typeof input.category === 'string' ? input.category : undefined,
    layers,
  };
}
