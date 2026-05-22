/**
 * 本文件实现服务端内容模板 Registry，负责把启动期解析后的配置变成运行期只读引用。
 *
 * 维护时要保持模板冻结和实例工厂边界，避免 tick 热路径复制大对象或手写模板字段。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import type { FormationTemplate } from '@mud/shared';
import { resolveProjectPath } from '../../common/project-path';
import { freezeTemplateMap } from './template-freeze';

@Injectable()
export class FormationTemplateRegistry {
  readonly formationTemplates = new Map<string, FormationTemplate>();

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

  getRef(formationId: string): Readonly<FormationTemplate> {
    const template = this.tryGetRef(formationId);
    if (!template) {
      throw new Error(`未找到阵法模板：${formationId}`);
    }
    return template;
  }

  tryGetRef(formationId: string): Readonly<FormationTemplate> | undefined {
    const normalized = typeof formationId === 'string' ? formationId.trim() : '';
    return normalized ? this.formationTemplates.get(normalized) : undefined;
  }

  createInstance(formationId: string, init: Record<string, unknown> = {}): Record<string, unknown> & { formationId: string } {
    return { ...init, formationId };
  }

  hydrate(formationId: string, payload: Record<string, unknown> = {}): Record<string, unknown> & { formationId: string } {
    return this.createInstance(formationId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.formationTemplates.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  getFormationTemplate(formationId: string): FormationTemplate | null {
    return this.tryGetRef(formationId) ?? null;
  }

  listFormationTemplates(): FormationTemplate[] {
    return Array.from(this.formationTemplates.values(), (template) => ({ ...template }));
  }
}
