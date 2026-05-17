import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { resolveProjectPath } from '../../common/project-path';
import { freezeTemplateMap } from './template-freeze';

@Injectable()
export class FormationTemplateRegistry {
  readonly formationTemplates = new Map<string, any>();

  loadAll(): void {
    this.formationTemplates.clear();
    const formationsPath = resolveProjectPath('packages', 'server', 'data', 'content', 'formations.json');
    if (!fs.existsSync(formationsPath)) {
      return;
    }
    const parsedFormations = JSON.parse(fs.readFileSync(formationsPath, 'utf-8'));
    if (Array.isArray(parsedFormations)) {
      for (const entry of parsedFormations) {
        if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()) {
          continue;
        }
        this.formationTemplates.set(entry.id.trim(), { ...entry, id: entry.id.trim() });
      }
    }
    freezeTemplateMap(this.formationTemplates);
  }

  getRef(formationId: string): Readonly<any> {
    const template = this.tryGetRef(formationId);
    if (!template) {
      throw new Error(`未找到阵法模板：${formationId}`);
    }
    return template;
  }

  tryGetRef(formationId: string): Readonly<any> | undefined {
    const normalized = typeof formationId === 'string' ? formationId.trim() : '';
    return normalized ? this.formationTemplates.get(normalized) : undefined;
  }

  createInstance(formationId: string, init: any = {}): any {
    return { ...init, formationId };
  }

  hydrate(formationId: string, payload: any = {}): any {
    return this.createInstance(formationId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.formationTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  getFormationTemplate(formationId: string): any | null {
    return this.tryGetRef(formationId) ?? null;
  }

  listFormationTemplates(): any[] {
    return Array.from(this.formationTemplates.values(), (template) => ({ ...template }));
  }
}
