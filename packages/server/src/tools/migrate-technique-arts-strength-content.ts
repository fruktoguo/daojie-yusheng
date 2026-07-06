/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
/**
 * 静态功法内容迁移：将 artsStrength/raw* 草稿展开为正式运行时 SkillDef。
 */
import * as fs from 'fs';
import * as path from 'path';
import { expandTechniqueArtsStrengthContentSkill, type TechniqueGrade } from '@mud/shared';

const TECHNIQUES_DIR = path.resolve(__dirname, '../../data/content/techniques');
const LEGACY_TECHNIQUE_DRAFT_KEYS = ['artsStrength', 'rawRange', 'rawTargeting', 'rawFormula', 'rawCandidate'];

type JsonRecord = Record<string, unknown>;

function main(): void {
  const mode = process.argv.includes('--apply') ? 'apply' : (process.argv.includes('--check') ? 'check' : 'dry-run');
  let matched = 0;
  let converted = 0;
  const samples: string[] = [];
  const errors: string[] = [];

  for (const filePath of collectJsonFiles(TECHNIQUES_DIR)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      if (!Array.isArray(parsed)) {
        continue;
      }
      const next = parsed.map((technique, techniqueIndex) => migrateTechnique(technique, techniqueIndex, filePath, errors));
      const changed = JSON.stringify(next) !== JSON.stringify(parsed);
      if (!changed) {
        continue;
      }
      matched += 1;
      converted += countConvertedSkills(parsed, next);
      if (mode === 'apply') {
        const compact = process.argv.includes('--compact');
        const serialized = compact ? JSON.stringify(next) : JSON.stringify(next, null, 2);
        fs.writeFileSync(filePath, `${serialized}\n`, 'utf-8');
      }
      if (samples.length < 10) {
        samples.push(path.relative(TECHNIQUES_DIR, filePath));
      }
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = { ok: errors.length === 0, mode, matchedFiles: matched, convertedSkills: converted, samples, errors };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0 || (mode === 'check' && matched > 0)) {
    process.exit(1);
  }
}

function migrateTechnique(raw: unknown, techniqueIndex: number, filePath: string, errors: string[]): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  const technique = raw;
  if (!Array.isArray(technique.skills)) {
    return technique;
  }
  const techniqueId = typeof technique.id === 'string' && technique.id.trim() ? technique.id.trim() : `technique_${techniqueIndex + 1}`;
  const grade = normalizeGrade(technique.grade);
  const realmLv = Number.isFinite(technique.realmLv) ? Math.max(1, Math.trunc(Number(technique.realmLv))) : 1;
  const skills = technique.skills.map((skill, skillIndex) => {
    if (!hasLegacyTechniqueDraftField(skill)) {
      return skill;
    }
    if (!isRecord(skill) || !isRecord(skill.artsStrength)) {
      errors.push(`${filePath} ${techniqueId}.skills[${skillIndex}] 含 raw* 旧字段但缺少 artsStrength，无法自动展开`);
      return skill;
    }
    const expanded = expandTechniqueArtsStrengthContentSkill(skill, { techniqueId, grade, realmLv, skillIndex });
    if (!expanded?.skill) {
      errors.push(`${filePath} ${techniqueId}.skills[${skillIndex}] artsStrength 展开失败`);
      return skill;
    }
    const nextSkill = pruneUndefined(expanded.skill) as JsonRecord;
    if (hasLegacyTechniqueDraftField(nextSkill)) {
      errors.push(`${filePath} ${techniqueId}.skills[${skillIndex}] 展开后仍含旧草稿字段`);
      return skill;
    }
    return nextSkill;
  });
  return { ...technique, skills };
}

function collectJsonFiles(dir: string, output: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(fullPath, output);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      output.push(fullPath);
    }
  }
  return output.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function hasLegacyTechniqueDraftField(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasLegacyTechniqueDraftField(entry));
  }
  return Object.entries(value).some(([key, child]) => LEGACY_TECHNIQUE_DRAFT_KEYS.includes(key) || hasLegacyTechniqueDraftField(child));
}

function countConvertedSkills(before: unknown[], after: unknown[]): number {
  let total = 0;
  for (let index = 0; index < before.length; index += 1) {
    const entry = before[index];
    const next = after[index];
    if (!isRecord(entry) || !Array.isArray(entry.skills) || !isRecord(next) || !Array.isArray(next.skills)) {
      continue;
    }
    for (let skillIndex = 0; skillIndex < entry.skills.length; skillIndex += 1) {
      if (JSON.stringify(entry.skills[skillIndex]) !== JSON.stringify(next.skills[skillIndex])) {
        total += 1;
      }
    }
  }
  return total;
}

function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefined(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const result: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      result[key] = pruneUndefined(child);
    }
  }
  return result;
}

function normalizeGrade(value: unknown): TechniqueGrade {
  const grade = typeof value === 'string' ? value : '';
  return ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'].includes(grade)
    ? grade as TechniqueGrade
    : 'mortal';
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

main();
