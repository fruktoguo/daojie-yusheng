import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { createRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import { resolveProjectPath } from '../../common/project-path';
import { collectJsonFiles, normalizeSharedTechniqueBuffEffect } from '../content-template-utils';
import { deepFreezeTemplate, freezeTemplateMap } from './template-freeze';

const BUFF_INSTANCE_OWN_KEYS = new Set([
  'remainingTicks',
  'duration',
  'stacks',
  'maxStacks',
  'realmLv',
  'sourceRealmLv',
  'infiniteDuration',
  'sustainTicksElapsed',
  'persistOnDeath',
  'persistOnReturnToSpawn',
]);

@Injectable()
export class BuffTemplateRegistry {
  readonly sharedTechniqueBuffs = new Map<string, any>();
  readonly buffTemplates = new Map<string, any>();

  loadAll(): void {
    this.sharedTechniqueBuffs.clear();
    this.buffTemplates.clear();
    this.loadSharedTechniqueBuffs();
  }

  loadSharedTechniqueBuffs(): void {
    const sharedBuffFiles = collectJsonFiles(resolveProjectPath('packages', 'server', 'data', 'content', 'technique-buffs'));
    for (const file of sharedBuffFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const entry of parsed) {
        const effect = normalizeSharedTechniqueBuffEffect(entry);
        if (!effect) {
          continue;
        }
        const frozen = deepFreezeTemplate(effect);
        this.sharedTechniqueBuffs.set(effect.id, frozen);
        this.buffTemplates.set(effect.id, frozen);
      }
    }
  }

  registerTemplate(template: any): void {
    const buffId = typeof template?.buffId === 'string' && template.buffId.trim()
      ? template.buffId.trim()
      : (typeof template?.id === 'string' ? template.id.trim() : '');
    if (!buffId) {
      return;
    }
    this.buffTemplates.set(buffId, deepFreezeTemplate({ ...template, buffId }));
  }

  registerTemplates(templates: Iterable<any>): void {
    for (const template of templates) {
      this.registerTemplate(template);
    }
  }

  getRef(buffId: string): Readonly<any> {
    const template = this.tryGetRef(buffId);
    if (!template) {
      throw new Error(`未找到 Buff 模板：${buffId}`);
    }
    return template;
  }

  tryGetRef(buffId: string): Readonly<any> | undefined {
    return this.buffTemplates.get(String(buffId ?? '').trim());
  }

  createInstance(buffId: string, init: any = {}): any {
    const template = this.getRef(buffId);
    const source: Record<string, any> = {};
    for (const key of Object.keys(init ?? {})) {
      if (BUFF_INSTANCE_OWN_KEYS.has(key)) {
        source[key] = init[key];
      }
    }
    return createRuntimeTemporaryBuff({
      ...template,
      ...source,
      buffId,
      remainingTicks: Number.isFinite(source.remainingTicks) ? source.remainingTicks : template.remainingTicks,
      duration: Number.isFinite(source.duration) ? source.duration : template.duration,
      stacks: Number.isFinite(source.stacks) ? source.stacks : template.stacks,
    });
  }

  hydrate(buffId: string, payload: any = {}): any {
    return this.createInstance(buffId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.buffTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  freezeAll(): void {
    freezeTemplateMap(this.sharedTechniqueBuffs);
    freezeTemplateMap(this.buffTemplates);
  }
}
