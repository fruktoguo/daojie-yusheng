import { Injectable } from '@nestjs/common';
import { cloneSkill } from '../content-template-utils';

/** 技能模板的最小结构约束（完整字段由 content JSON 决定） */
type SkillTemplateRecord = Record<string, unknown> & { id: string };

/** 功法模板的最小结构约束 */
type TechniqueTemplateRecord = Record<string, unknown> & { skills?: unknown[] };

@Injectable()
export class SkillTemplateRegistry {
  readonly skillTemplatesById = new Map<string, SkillTemplateRecord>();

  loadAll(techniqueTemplates = new Map<string, TechniqueTemplateRecord>()): void {
    this.skillTemplatesById.clear();
    this.rebuildFromTechniques(techniqueTemplates);
  }

  rebuildFromTechniques(techniqueTemplates: Map<string, TechniqueTemplateRecord>): void {
    this.skillTemplatesById.clear();
    for (const technique of techniqueTemplates.values()) {
      if (!technique || !Array.isArray(technique.skills)) {
        continue;
      }
      for (const skill of technique.skills) {
        if (!skill || typeof skill !== 'object' || typeof (skill as Record<string, unknown>).id !== 'string' || !(skill as Record<string, unknown>).id || this.skillTemplatesById.has((skill as SkillTemplateRecord).id)) {
          continue;
        }
        const typed = skill as SkillTemplateRecord;
        this.skillTemplatesById.set(typed.id, typed);
      }
    }
  }

  getRef(skillId: string): Readonly<SkillTemplateRecord> {
    const skill = this.tryGetRef(skillId);
    if (!skill) {
      throw new Error(`未找到技能模板：${skillId}`);
    }
    return skill;
  }

  tryGetRef(skillId: string): Readonly<SkillTemplateRecord> | undefined {
    return this.skillTemplatesById.get(String(skillId ?? '').trim());
  }

  createInstance(skillId: string, init: Record<string, unknown> = {}): Record<string, unknown> & { skillId: string } {
    return { ...init, skillId };
  }

  hydrate(skillId: string, payload: Record<string, unknown> = {}): Record<string, unknown> & { skillId: string } {
    return this.createInstance(skillId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.skillTemplatesById.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  getSkill(skillId: string): SkillTemplateRecord | null {
    const skill = this.tryGetRef(skillId);
    return skill ? cloneSkill(skill) : null;
  }

  getSkillRef(skillId: string): Readonly<SkillTemplateRecord> | null {
    return this.tryGetRef(skillId) ?? null;
  }
}
