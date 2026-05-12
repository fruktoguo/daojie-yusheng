// @ts-nocheck
/**
 * 用途：把 packages/server/data/content/techniques/ 下的老格式功法 JSON 迁移到
 *       量化格式（maxLayer + expDifficulty + attrRatio 或 layerGains）。
 *
 * 行为：
 *   1. 扫描全部 techniques/**\/*.json。
 *   2. internal 按原 layers 的满层六维反算 attrFloat / attrRatio。
 *   3. arts / divine / secret 把逐层 attrs / specialStats 压缩为 layerGains。
 *   4. 保留 sparse `layers`，仅留下具有 qiProjection 的层，只写 { level, qiProjection }。
 *   5. 写回文件，输出 diff 报告：
 *      - 六维总量差（旧 vs 新公式）、cosine 相似度；
 *      - 经验曲线总量差；
 *      - 被 clamp 的 attrFloat 列表。
 *   6. 按 `pnpm verify:quick` 规格，避免落库 / 网络依赖。
 *
 * 用法：
 *   node dist/tools/migrate-internal-techniques.js            # 试跑（仅打印报告）
 *   node dist/tools/migrate-internal-techniques.js --apply    # 真实改写 JSON
 */

const fs = require('node:fs');
const path = require('node:path');

const shared = require('@mud/shared');

const TECHNIQUE_ATTR_KEYS = shared.TECHNIQUE_ATTR_KEYS;
const TECHNIQUE_GRADE_ORDER = shared.TECHNIQUE_GRADE_ORDER;

const ROOT = path.resolve(__dirname, '../../data/content/techniques');

function collectJsonFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      result.push(full);
    }
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonPreservingTrailingNewline(file, value) {
  const raw = fs.readFileSync(file, 'utf8');
  const trailing = raw.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + trailing, 'utf8');
}

function sumLayerAttrs(layers) {
  const total = {};
  if (!Array.isArray(layers)) return total;
  for (const layer of layers) {
    const attrs = layer && layer.attrs;
    if (!attrs || typeof attrs !== 'object') continue;
    for (const key of TECHNIQUE_ATTR_KEYS) {
      const value = Number(attrs[key]);
      if (!Number.isFinite(value) || value <= 0) continue;
      total[key] = (total[key] || 0) + value;
    }
  }
  return total;
}

function sumObjectValues(obj) {
  let sum = 0;
  for (const value of Object.values(obj)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) sum += numeric;
  }
  return sum;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const va = Number(a[key] || 0);
    const vb = Number(b[key] || 0);
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function extractSparseQiProjectionLayers(layers) {
  if (!Array.isArray(layers)) return undefined;
  const sparse = [];
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const level = Number(layer.level);
    if (!Number.isFinite(level) || level <= 0) continue;
    if (!Array.isArray(layer.qiProjection) || layer.qiProjection.length === 0) continue;
    sparse.push({
      level: Math.trunc(level),
      qiProjection: layer.qiProjection.map((entry) => JSON.parse(JSON.stringify(entry))),
    });
  }
  return sparse.length > 0 ? sparse : undefined;
}

function sumLayerExp(layers, realmLv) {
  if (!Array.isArray(layers)) return 0;
  let total = 0;
  const scaled = typeof shared.scaleTechniqueExp === 'function' ? shared.scaleTechniqueExp : null;
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const expFactor = Number(layer.expFactor);
    if (Number.isFinite(expFactor) && expFactor > 0) {
      total += scaled ? scaled(expFactor, realmLv) : Math.round(expFactor * 100 * Math.max(1, realmLv));
      continue;
    }
    const expToNext = Number(layer.expToNext);
    if (Number.isFinite(expToNext) && expToNext > 0) {
      total += expToNext;
    }
  }
  return total;
}

function buildQuantizedInternalTemplate(oldTemplate) {
  const grade = String(oldTemplate.grade || '');
  const realmLv = Number.isFinite(oldTemplate.realmLv) ? Math.max(1, Math.trunc(oldTemplate.realmLv)) : 1;
  const maxLayer = Array.isArray(oldTemplate.layers) ? oldTemplate.layers.length : 9;

  const totalAttrs = sumLayerAttrs(oldTemplate.layers);
  const grandTotal = sumObjectValues(totalAttrs);

  const g = shared.getTechniqueGradeIndex(grade);
  const base = g * g * (realmLv + 25) + 50;
  const rawFloat = base > 0 ? grandTotal / base - 1 : 0;

  const [floatMin, floatMax] = shared.TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE;
  const clampedFloat = Math.max(floatMin, Math.min(floatMax, rawFloat));
  const clamped = clampedFloat !== rawFloat;

  const attrRatio = {};
  if (grandTotal > 0) {
    for (const key of TECHNIQUE_ATTR_KEYS) {
      const value = totalAttrs[key];
      if (typeof value !== 'number' || value <= 0) continue;
      attrRatio[key] = Number((value / grandTotal).toFixed(4));
    }
  }

  const newTemplate = {
    id: oldTemplate.id,
    name: oldTemplate.name,
    desc: typeof oldTemplate.desc === 'string' ? oldTemplate.desc : undefined,
    grade,
    category: 'internal',
    realmLv,
    attrRatio,
    attrFloat: Number(clampedFloat.toFixed(4)),
    maxLayer,
    expDifficulty: 1.0,
  };

  if (Object.prototype.hasOwnProperty.call(oldTemplate, 'skills')) {
    const skills = Array.isArray(oldTemplate.skills) ? oldTemplate.skills : [];
    if (skills.length > 0) {
      newTemplate.skills = skills;
    }
  }

  const sparseLayers = extractSparseQiProjectionLayers(oldTemplate.layers);
  if (sparseLayers) {
    newTemplate.layers = sparseLayers;
  }

  return { newTemplate: reorderInternalFields(newTemplate), clamped, rawFloat, grandTotal, totalAttrs };
}

function reorderInternalFields(template) {
  const ordered = {};
  for (const key of [
    'id',
    'name',
    'desc',
    'grade',
    'category',
    'realmLv',
    'attrRatio',
    'attrFloat',
    'maxLayer',
    'expDifficulty',
    'layers',
    'skills',
  ]) {
    if (template[key] === undefined) continue;
    ordered[key] = template[key];
  }
  return ordered;
}

/**
 * 非内功（arts / divine / secret）量化：
 *   - 丢弃每层 expFactor / expToNext；经验由 shared.expandTechniqueExpCurve 运行时生成；
 *   - 尝试把逐层 `{ attrs, specialStats }` 压缩成紧凑的 `layerGains`（base + deltas）；
 *     压缩失败（存在负向差、非单调累加等）时回退保留 legacy layers。
 *   - arts 的 skills 在根级数组，保留原样。
 */
function buildQuantizedNonInternalTemplate(oldTemplate) {
  const grade = String(oldTemplate.grade || '');
  const category = String(oldTemplate.category || '');
  const realmLv = Number.isFinite(oldTemplate.realmLv) ? Math.max(1, Math.trunc(oldTemplate.realmLv)) : 1;
  const legacyLayers = Array.isArray(oldTemplate.layers) ? oldTemplate.layers : [];
  const maxLayer = legacyLayers.length > 0 ? legacyLayers.length : 9;

  // 清洗每层 attrs / specialStats（提取"有意义"的层）
  const slimLayers = [];
  for (const layer of legacyLayers) {
    if (!layer || typeof layer !== 'object') continue;
    const level = Number(layer.level);
    if (!Number.isFinite(level) || level <= 0) continue;
    const slim = { level: Math.trunc(level) };
    if (layer.attrs && typeof layer.attrs === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(layer.attrs)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric !== 0) cleaned[key] = numeric;
      }
      if (Object.keys(cleaned).length > 0) slim.attrs = cleaned;
    }
    if (layer.specialStats && typeof layer.specialStats === 'object') {
      const cleaned = {};
      for (const key of ['comprehension', 'luck']) {
        const numeric = Number(layer.specialStats[key]);
        if (Number.isFinite(numeric) && numeric !== 0) cleaned[key] = numeric;
      }
      if (Object.keys(cleaned).length > 0) slim.specialStats = cleaned;
    }
    if (Array.isArray(layer.qiProjection) && layer.qiProjection.length > 0) {
      slim.qiProjection = layer.qiProjection.map((entry) => JSON.parse(JSON.stringify(entry)));
    }
    if (Object.keys(slim).length > 1) slimLayers.push(slim);
  }

  const newTemplate = {
    id: oldTemplate.id,
    name: oldTemplate.name,
    desc: typeof oldTemplate.desc === 'string' ? oldTemplate.desc : undefined,
    grade,
    category,
    realmLv,
    maxLayer,
    expDifficulty: 1.0,
  };

  // 尝试压缩：如果所有 slimLayers 都不含 qiProjection，可以安全走 layerGains
  const hasPerLayerQi = slimLayers.some((layer) => Array.isArray(layer.qiProjection) && layer.qiProjection.length > 0);
  let compressed = null;
  if (!hasPerLayerQi && slimLayers.length > 0) {
    compressed = compressLayersToLayerGains(slimLayers, maxLayer);
  }

  if (compressed) {
    newTemplate.layerGains = compressed.layerGains;
  } else if (slimLayers.length > 0) {
    newTemplate.layers = slimLayers;
  }

  if (Array.isArray(oldTemplate.skills) && oldTemplate.skills.length > 0) {
    newTemplate.skills = oldTemplate.skills.map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  return {
    newTemplate: reorderNonInternalFields(newTemplate),
    legacyLayersCount: legacyLayers.length,
    compressed: Boolean(compressed),
    compressionStats: compressed ? compressed.stats : null,
  };
}

/**
 * 把逐层 `{ attrs, specialStats }` 压缩成 `layerGains = { attrs, specialStats, deltas[] }`。
 *
 * 规则：
 *   - base = L1 的 attrs / specialStats；
 *   - 维护"当前 overlay"（相对 base 的累积增量），遍历 L2..maxLayer；
 *   - 当某层需要的 overlay 与当前 overlay 不同，emit 一条 delta = 差值，同时更新 overlay；
 *   - 若 delta 含负值（需要减去 base），压缩失败，返回 null 让调用方回退 legacy layers。
 */
function compressLayersToLayerGains(slimLayers, maxLayer) {
  const byLevel = new Map();
  for (const layer of slimLayers) {
    byLevel.set(Math.trunc(Number(layer.level)), layer);
  }
  const l1 = byLevel.get(1) || {};
  const baseAttrs = { ...(l1.attrs || {}) };
  const baseSpecial = { ...(l1.specialStats || {}) };

  const deltas = [];
  const currentOverlayAttrs = {};
  const currentOverlaySpecial = {};

  let originalLayersJson = 0;

  for (let L = 1; L <= maxLayer; L += 1) {
    const layer = byLevel.get(L);
    const attrsAtL = layer && layer.attrs ? layer.attrs : {};
    const specialAtL = layer && layer.specialStats ? layer.specialStats : {};
    if (layer) {
      originalLayersJson += 1;
    }

    // 需要的 overlay = attrsAtL - baseAttrs（含所有 key 的联合）
    const desiredOverlayAttrs = diffBag(attrsAtL, baseAttrs);
    const desiredOverlaySpecial = diffBag(specialAtL, baseSpecial);

    if (!bagEqual(desiredOverlayAttrs, currentOverlayAttrs) || !bagEqual(desiredOverlaySpecial, currentOverlaySpecial)) {
      const addAttrs = diffBag(desiredOverlayAttrs, currentOverlayAttrs);
      const addSpecial = diffBag(desiredOverlaySpecial, currentOverlaySpecial);

      // 任一字段需要"减少"意味着不能用 ADD 语义压缩
      if (hasNegativeValue(addAttrs) || hasNegativeValue(addSpecial)) {
        return null;
      }

      const delta = { fromLevel: L };
      if (Object.keys(addAttrs).length > 0) delta.attrsAdd = addAttrs;
      if (Object.keys(addSpecial).length > 0) delta.specialStatsAdd = addSpecial;

      if (delta.attrsAdd || delta.specialStatsAdd) {
        deltas.push(delta);
      }
      for (const [k, v] of Object.entries(desiredOverlayAttrs)) currentOverlayAttrs[k] = v;
      for (const k of Object.keys(currentOverlayAttrs)) {
        if (!(k in desiredOverlayAttrs)) delete currentOverlayAttrs[k];
      }
      for (const [k, v] of Object.entries(desiredOverlaySpecial)) currentOverlaySpecial[k] = v;
      for (const k of Object.keys(currentOverlaySpecial)) {
        if (!(k in desiredOverlaySpecial)) delete currentOverlaySpecial[k];
      }
    }
  }

  const layerGains = {};
  if (Object.keys(baseAttrs).length > 0) layerGains.attrs = baseAttrs;
  if (Object.keys(baseSpecial).length > 0) layerGains.specialStats = baseSpecial;
  if (deltas.length > 0) layerGains.deltas = deltas;

  return {
    layerGains,
    stats: {
      originalLayersCount: originalLayersJson,
      compressedDeltas: deltas.length,
    },
  };
}

function diffBag(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const av = Number(a?.[key] ?? 0);
    const bv = Number(b?.[key] ?? 0);
    const delta = av - bv;
    if (delta !== 0) out[key] = delta;
  }
  return out;
}

function bagEqual(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    if ((Number(a?.[key] ?? 0)) !== (Number(b?.[key] ?? 0))) return false;
  }
  return true;
}

function hasNegativeValue(bag) {
  for (const value of Object.values(bag || {})) {
    if (Number(value) < 0) return true;
  }
  return false;
}

function reorderNonInternalFields(template) {
  const ordered = {};
  for (const key of [
    'id',
    'name',
    'desc',
    'grade',
    'category',
    'realmLv',
    'maxLayer',
    'expDifficulty',
    'layerGains',
    'layers',
    'skills',
  ]) {
    if (template[key] === undefined) continue;
    ordered[key] = template[key];
  }
  return ordered;
}

function diffPercent(oldValue, newValue) {
  if (oldValue <= 0) return newValue > 0 ? Infinity : 0;
  return (newValue - oldValue) / oldValue;
}

function isAlreadyQuantizedInternal(entry) {
  return entry.category === 'internal'
    && entry.attrRatio
    && typeof entry.attrRatio === 'object'
    && Object.keys(entry.attrRatio).length > 0;
}

function hasLegacyExpFactorLayers(entry) {
  if (!Array.isArray(entry.layers)) return false;
  return entry.layers.some((layer) => layer && typeof layer === 'object' && Number.isFinite(Number(layer.expFactor)));
}

function isAlreadyQuantizedNonInternal(entry) {
  // 已完成量化且进一步压缩的标志：根级已有 layerGains，或根本不需要逐层数据（无 layers）
  if (entry.category === 'internal') return false;
  if (hasLegacyExpFactorLayers(entry)) return false;
  if (entry.layerGains && typeof entry.layerGains === 'object') return true;
  // 根级有 maxLayer 但还在用 layers[] 的，返回 false 让压缩逻辑接管
  if (Number.isFinite(Number(entry.maxLayer)) && Array.isArray(entry.layers) && entry.layers.length > 0) {
    return false;
  }
  // 没有 layers 的 arts：已经是终态
  return Number.isFinite(Number(entry.maxLayer));
}

function processFile(file, apply) {
  const content = readJson(file);
  if (!Array.isArray(content)) return null;

  const reports = [];
  const updated = content.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;

    if (entry.category === 'internal') {
      if (isAlreadyQuantizedInternal(entry)) {
        reports.push({ id: entry.id, category: 'internal', skipped: true, reason: 'already quantized' });
        return entry;
      }
      return migrateInternalEntry(entry, reports);
    }

    if (entry.category === 'arts' || entry.category === 'divine' || entry.category === 'secret') {
      if (isAlreadyQuantizedNonInternal(entry)) {
        reports.push({ id: entry.id, category: entry.category, skipped: true, reason: 'already quantized' });
        return entry;
      }
      return migrateNonInternalEntry(entry, reports);
    }

    return entry;
  });

  if (apply) {
    writeJsonPreservingTrailingNewline(file, updated);
  }
  return { file: path.relative(path.resolve(__dirname, '../../..'), file), reports };
}

function migrateInternalEntry(entry, reports) {
  const { newTemplate, clamped, rawFloat, grandTotal, totalAttrs } = buildQuantizedInternalTemplate(entry);

  // 展开一次，比对新旧总量 & 分布 & 经验
  const expansion = shared.expandInternalTechnique(newTemplate);
  const newTotalAttrs = {};
  for (const layer of expansion.layers) {
    if (!layer.attrs) continue;
    for (const [key, value] of Object.entries(layer.attrs)) {
      newTotalAttrs[key] = (newTotalAttrs[key] || 0) + value;
    }
  }
  const newGrand = sumObjectValues(newTotalAttrs);
  const cosine = cosineSimilarity(totalAttrs, newTotalAttrs);

  const newTotalExp = expansion.layers.reduce((acc, layer) => acc + layer.expToNext, 0);
  const oldTotalExp = sumLayerExp(entry.layers, entry.realmLv);

  reports.push({
    id: entry.id,
    category: 'internal',
    grade: entry.grade,
    realmLv: entry.realmLv,
    maxLayer: expansion.layers.length,
    attrFloatRaw: Number(rawFloat.toFixed(4)),
    attrFloatFinal: newTemplate.attrFloat,
    attrFloatClamped: clamped,
    oldAttrTotal: grandTotal,
    newAttrTotal: newGrand,
    attrTotalDelta: Number(diffPercent(grandTotal, newGrand).toFixed(4)),
    attrCosine: Number(cosine.toFixed(4)),
    oldTotalExp,
    newTotalExp,
    expDelta: Number(diffPercent(oldTotalExp, newTotalExp).toFixed(4)),
    attrRatio: newTemplate.attrRatio,
    spareQiProjectionLayers: Array.isArray(newTemplate.layers) ? newTemplate.layers.length : 0,
  });

  return newTemplate;
}

function migrateNonInternalEntry(entry, reports) {
  const { newTemplate, legacyLayersCount, compressed, compressionStats } = buildQuantizedNonInternalTemplate(entry);

  // 比对新旧经验总量
  const perLayer = shared.expandTechniqueExpCurve(
    newTemplate.grade,
    newTemplate.realmLv,
    newTemplate.maxLayer,
    newTemplate.expDifficulty ?? 1,
    newTemplate.category,
  );
  const newTotalExp = Array.isArray(perLayer?.perLayerExp)
    ? perLayer.perLayerExp.reduce((acc, value) => acc + Number(value || 0), 0)
    : 0;
  const oldTotalExp = sumLayerExp(entry.layers, entry.realmLv);

  reports.push({
    id: entry.id,
    category: entry.category,
    grade: entry.grade,
    realmLv: entry.realmLv,
    maxLayer: newTemplate.maxLayer,
    legacyLayersCount,
    compressedToLayerGains: compressed,
    compressionDeltas: compressionStats ? compressionStats.compressedDeltas : null,
    preservedLegacyLayers: Array.isArray(newTemplate.layers) ? newTemplate.layers.length : 0,
    preservedSkills: Array.isArray(newTemplate.skills) ? newTemplate.skills.length : 0,
    oldTotalExp,
    newTotalExp,
    expDelta: Number(diffPercent(oldTotalExp, newTotalExp).toFixed(4)),
  });

  return newTemplate;
}

function main() {
  const apply = process.argv.includes('--apply');
  const files = collectJsonFiles(ROOT);
  const summary = [];
  for (const file of files) {
    const result = processFile(file, apply);
    if (result && result.reports.length > 0) {
      summary.push(result);
    }
  }

  const warnings = [];
  for (const entry of summary) {
    for (const row of entry.reports) {
      if (row.skipped) continue;
      if (typeof row.attrTotalDelta === 'number' && Math.abs(row.attrTotalDelta) > 0.15) {
        warnings.push({
          file: entry.file,
          id: row.id,
          kind: 'attrTotalDelta>15%',
          value: row.attrTotalDelta,
        });
      }
      if (typeof row.attrCosine === 'number' && row.attrCosine < 0.9) {
        warnings.push({
          file: entry.file,
          id: row.id,
          kind: 'attrCosine<0.9',
          value: row.attrCosine,
        });
      }
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    rootDir: path.relative(path.resolve(__dirname, '../../..'), ROOT),
    files: summary,
    warnings,
  }, null, 2));

  if (apply) {
    const total = summary.reduce((acc, entry) => acc + entry.reports.filter((row) => !row.skipped).length, 0);
    console.log(`\n已写回 ${total} 条功法模板（internal / arts / divine / secret）`);
  } else {
    console.log('\n试跑完成，未写入任何文件。加 --apply 参数以真实改写。');
  }
}

main();
