import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const clientName = normalizeClientName(args.client);
const sharedName = normalizeSharedName(args.shared);
const contentDir = path.join(repoRoot, 'packages/server/data/content');
const clientDir = path.join(repoRoot, 'packages', clientName);
const outputPath = path.join(clientDir, 'src/constants/world/editor-catalog.generated.json');
const realmLevelsPath = path.join(contentDir, 'realm-levels.json');

const sharedModule = await import(pathToFileURL(path.join(repoRoot, 'packages', sharedName, 'dist/index.js')).href);
const {
  calculateTechniqueSkillQiCost,
  scaleTechniqueExp,
} = sharedModule;

const realmLevelsConfig = readJson(realmLevelsPath);
const gradeBandLevelFrom = buildGradeBandLevelMap(realmLevelsConfig.gradeBands);
const sharedTechniqueBuffs = loadSharedTechniqueBuffs(path.join(contentDir, 'technique-buffs'));
const items = loadItems(path.join(contentDir, 'items'));
const techniques = loadTechniques(path.join(contentDir, 'techniques'), sharedTechniqueBuffs, gradeBandLevelFrom, {
  calculateTechniqueSkillQiCost,
  scaleTechniqueExp,
});
const realmLevels = loadRealmLevels(realmLevelsConfig.levels);
const buffs = buildBuffCatalog(techniques, items);

writeJson(outputPath, {
  techniques,
  items,
  realmLevels,
  buffs,
});

console.log(`已生成 ${path.relative(repoRoot, outputPath)}`);

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, value = ''] = arg.slice(2).split('=');
    result[key] = value;
  }
  return result;
}

function normalizeClientName(value) {
  if (value === 'client' || value === 'client-next') {
    return value;
  }
  throw new Error('缺少有效的 --client=client 或 --client=client-next');
}

function normalizeSharedName(value) {
  if (value === 'shared' || value === 'shared-next') {
    return value;
  }
  throw new Error('缺少有效的 --shared=shared 或 --shared=shared-next');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkJsonFiles(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildGradeBandLevelMap(gradeBands) {
  const entries = Array.isArray(gradeBands) ? gradeBands : [];
  return new Map(entries.flatMap((entry) => (
    typeof entry?.grade === 'string' && Number.isFinite(entry?.levelFrom)
      ? [[entry.grade, Math.max(1, Math.floor(Number(entry.levelFrom)))]]
      : []
  )));
}

function loadItems(itemsDir) {
  return walkJsonFiles(itemsDir)
    .flatMap((filePath) => {
      const entries = readJson(filePath);
      return Array.isArray(entries) ? entries : [];
    })
    .filter((item) => typeof item?.itemId === 'string' && typeof item?.name === 'string' && typeof item?.type === 'string')
    .map((item) => ({ ...item }))
    .sort((left, right) => sortByNameThenId(left.name, right.name, left.itemId, right.itemId));
}

function loadSharedTechniqueBuffs(sharedTechniqueBuffsDir) {
  const sharedBuffs = new Map();
  if (!fs.existsSync(sharedTechniqueBuffsDir)) {
    return sharedBuffs;
  }
  for (const filePath of walkJsonFiles(sharedTechniqueBuffsDir)) {
    const entries = readJson(filePath);
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (!id) {
        continue;
      }
      const { id: _id, ...template } = entry;
      sharedBuffs.set(id, {
        ...template,
        type: 'buff',
      });
    }
  }
  return sharedBuffs;
}

function loadTechniques(techniquesDir, sharedTechniqueBuffs, gradeBandLevelFrom, helpers) {
  return walkJsonFiles(techniquesDir)
    .flatMap((filePath) => {
      const entries = readJson(filePath);
      return Array.isArray(entries) ? entries : [];
    })
    .filter((technique) => typeof technique?.id === 'string' && typeof technique?.name === 'string')
    .map((technique) => normalizeTechnique(technique, sharedTechniqueBuffs, gradeBandLevelFrom, helpers))
    .sort((left, right) => sortByNameThenId(left.name, right.name, left.id, right.id));
}

function normalizeTechnique(raw, sharedTechniqueBuffs, gradeBandLevelFrom, helpers) {
  const realmLv = Number.isFinite(raw.realmLv)
    ? Math.max(1, Math.floor(Number(raw.realmLv)))
    : (gradeBandLevelFrom.get(raw.grade) ?? 1);
  const grade = typeof raw.grade === 'string' ? raw.grade : undefined;
  const layers = Array.isArray(raw.layers)
    ? [...raw.layers]
      .filter((layer) => Number.isFinite(layer?.level))
      .map((layer) => ({
        level: Math.max(1, Math.floor(Number(layer.level))),
        expToNext: layer.expFactor === undefined
          ? Math.max(0, Math.floor(Number(layer.expToNext ?? 0)))
          : helpers.scaleTechniqueExp(Number(layer.expFactor), realmLv),
        attrs: isPlainObject(layer.attrs) ? { ...layer.attrs } : undefined,
      }))
      .sort((left, right) => left.level - right.level)
    : undefined;
  const skills = Array.isArray(raw.skills)
    ? raw.skills
      .filter((skill) => typeof skill?.id === 'string' && typeof skill?.name === 'string')
      .map((skill) => {
        const costMultiplier = Number.isFinite(skill.costMultiplier ?? skill.cost)
          ? Math.max(0, Number(skill.costMultiplier ?? skill.cost))
          : 0;
        return {
          ...skill,
          effects: normalizeSkillEffects(skill.effects, sharedTechniqueBuffs),
          costMultiplier,
          cost: helpers.calculateTechniqueSkillQiCost(costMultiplier, grade, realmLv),
        };
      })
    : undefined;
  return {
    id: raw.id,
    name: raw.name,
    grade,
    category: normalizeTechniqueCategory(raw.category, skills),
    realmLv,
    skills,
    layers,
  };
}

function normalizeSkillEffects(effects, sharedTechniqueBuffs) {
  if (!Array.isArray(effects)) {
    return [];
  }
  return effects.flatMap((effect) => normalizeSkillEffect(effect, sharedTechniqueBuffs));
}

function normalizeSkillEffect(effect, sharedTechniqueBuffs) {
  if (!isPlainObject(effect) || typeof effect.type !== 'string') {
    return [];
  }
  if (effect.type !== 'buff') {
    return [{ ...effect }];
  }
  const resolved = resolveSharedTechniqueBuffEffect(effect, sharedTechniqueBuffs);
  return resolved ? [resolved] : [];
}

function resolveSharedTechniqueBuffEffect(effect, sharedTechniqueBuffs) {
  const buffRef = typeof effect.buffRef === 'string' ? effect.buffRef.trim() : '';
  if (!buffRef) {
    return { ...effect };
  }
  const template = sharedTechniqueBuffs.get(buffRef);
  if (!template) {
    throw new Error(`共享功法 Buff 模板 ${buffRef} 不存在`);
  }
  const { buffRef: _buffRef, ...resolvedEffect } = effect;
  return {
    ...template,
    ...resolvedEffect,
    type: 'buff',
  };
}

function normalizeTechniqueCategory(category, skills) {
  if (category === 'arts' || category === 'internal' || category === 'divine' || category === 'secret') {
    return category;
  }
  return (skills?.length ?? 0) > 0 ? 'arts' : 'internal';
}

function loadRealmLevels(levels) {
  return (Array.isArray(levels) ? levels : [])
    .filter((entry) => Number.isFinite(entry?.realmLv) && typeof entry?.displayName === 'string' && typeof entry?.name === 'string')
    .map((entry) => ({
      realmLv: Math.max(1, Math.floor(Number(entry.realmLv))),
      displayName: entry.displayName,
      name: entry.name,
      phaseName: typeof entry.phaseName === 'string' && entry.phaseName.trim().length > 0 ? entry.phaseName : undefined,
      review: typeof entry.review === 'string' && entry.review.trim().length > 0 ? entry.review : undefined,
    }))
    .sort((left, right) => left.realmLv - right.realmLv);
}

function buildBuffCatalog(techniques, items) {
  const buffMap = new Map();
  const register = (buff) => {
    const buffId = typeof buff?.buffId === 'string' ? buff.buffId.trim() : '';
    if (!buffId || buffMap.has(buffId)) {
      return;
    }
    buffMap.set(buffId, {
      ...buff,
      buffId,
      shortMark: normalizeBuffShortMark(buff.shortMark, buff.name),
    });
  };

  for (const technique of techniques) {
    for (const skill of technique.skills ?? []) {
      for (const effect of skill.effects ?? []) {
        if (effect?.type !== 'buff') {
          continue;
        }
        register({
          buffId: effect.buffId,
          name: effect.name,
          desc: effect.desc,
          shortMark: effect.shortMark,
          category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
          visibility: effect.visibility ?? 'public',
          remainingTicks: Math.max(1, Math.floor(Number(effect.duration ?? 1))),
          duration: Math.max(1, Math.floor(Number(effect.duration ?? 1))),
          stacks: 1,
          maxStacks: Math.max(1, Math.floor(Number(effect.maxStacks ?? 1))),
          sourceSkillId: skill.id,
          sourceSkillName: skill.name,
          realmLv: 1,
          color: effect.color,
          attrs: isPlainObject(effect.attrs) ? { ...effect.attrs } : undefined,
          attrMode: effect.attrMode,
          stats: isPlainObject(effect.stats) ? { ...effect.stats } : undefined,
          statMode: effect.statMode,
          qiProjection: effect.qiProjection,
        });
      }
    }
  }

  for (const item of items) {
    for (const buff of item.consumeBuffs ?? []) {
      register({
        buffId: buff.buffId,
        name: buff.name,
        desc: buff.desc,
        shortMark: buff.shortMark,
        category: buff.category ?? 'buff',
        visibility: buff.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.floor(Number(buff.duration ?? 1))),
        duration: Math.max(1, Math.floor(Number(buff.duration ?? 1))),
        stacks: 1,
        maxStacks: Math.max(1, Math.floor(Number(buff.maxStacks ?? 1))),
        sourceSkillId: `item:${item.itemId}`,
        sourceSkillName: item.name,
        realmLv: 1,
        color: buff.color,
        attrs: isPlainObject(buff.attrs) ? { ...buff.attrs } : undefined,
        attrMode: buff.attrMode,
        stats: isPlainObject(buff.stats) ? { ...buff.stats } : undefined,
        statMode: buff.statMode,
        qiProjection: buff.qiProjection,
      });
    }
    for (const effect of item.effects ?? []) {
      if (effect?.type !== 'timed_buff' || !isPlainObject(effect.buff)) {
        continue;
      }
      register({
        buffId: effect.buff.buffId,
        name: effect.buff.name,
        desc: effect.buff.desc,
        shortMark: effect.buff.shortMark,
        category: effect.buff.category ?? 'buff',
        visibility: effect.buff.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.floor(Number(effect.buff.duration ?? 1))),
        duration: Math.max(1, Math.floor(Number(effect.buff.duration ?? 1))),
        stacks: 1,
        maxStacks: Math.max(1, Math.floor(Number(effect.buff.maxStacks ?? 1))),
        sourceSkillId: `equip:${item.itemId}:${typeof effect.effectId === 'string' ? effect.effectId : 'effect'}`,
        sourceSkillName: item.name,
        realmLv: 1,
        color: effect.buff.color,
        attrs: isPlainObject(effect.buff.attrs) ? { ...effect.buff.attrs } : undefined,
        attrMode: effect.buff.attrMode,
        stats: isPlainObject(effect.buff.stats) ? { ...effect.buff.stats } : undefined,
        statMode: effect.buff.statMode,
        qiProjection: effect.buff.qiProjection,
      });
    }
  }

  return [...buffMap.values()].sort((left, right) => sortByNameThenId(left.name, right.name, left.buffId, right.buffId));
}

function normalizeBuffShortMark(raw, fallbackName) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
  const fallback = typeof fallbackName === 'string' ? fallbackName.trim() : '';
  return [...fallback][0] ?? '气';
}

function sortByNameThenId(leftName, rightName, leftId, rightId) {
  const nameOrder = String(leftName).localeCompare(String(rightName), 'zh-CN');
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return String(leftId).localeCompare(String(rightId), 'zh-CN');
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
