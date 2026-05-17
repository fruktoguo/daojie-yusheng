import { Injectable } from '@nestjs/common';
import { cloneSkill } from '../content-template-utils';

@Injectable()
export class SkillTemplateRegistry {
  readonly skillTemplatesById = new Map<string, any>();

  loadAll(techniqueTemplates = new Map<string, any>()): void {
    this.skillTemplatesById.clear();
    this.rebuildFromTechniques(techniqueTemplates);
  }

  rebuildFromTechniques(techniqueTemplates: Map<string, any>): void {
    this.skillTemplatesById.clear();
    for (const technique of techniqueTemplates.values()) {
      if (!technique || !Array.isArray(technique.skills)) {
        continue;
      }
      for (const skill of technique.skills) {
        if (!skill || typeof skill.id !== 'string' || !skill.id || this.skillTemplatesById.has(skill.id)) {
          continue;
        }
        this.skillTemplatesById.set(skill.id, skill);
      }
    }
  }

  getRef(skillId: string): Readonly<any> {
    const skill = this.tryGetRef(skillId);
    if (!skill) {
      throw new Error(`未找到技能模板：${skillId}`);
    }
    return skill;
  }

  tryGetRef(skillId: string): Readonly<any> | undefined {
    return this.skillTemplatesById.get(String(skillId ?? '').trim());
  }

  createInstance(skillId: string, init: any = {}): any {
    return { ...init, skillId };
  }

  hydrate(skillId: string, payload: any = {}): any {
    return this.createInstance(skillId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.skillTemplatesById.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  getSkill(skillId: string): any | null {
    const skill = this.tryGetRef(skillId);
    return skill ? cloneSkill(skill) : null;
  }

  getSkillRef(skillId: string): any | null {
    return this.tryGetRef(skillId) ?? null;
  }
}
