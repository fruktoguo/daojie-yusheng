// @ts-nocheck
/**
 * smoke：验证全部功法模板（internal / arts / divine / secret）经过 ContentTemplateRepository
 * 加载后的展开结果与 shared 公式保持一致。
 *
 * 覆盖点（来自 docs/design/systems/AI功法生成方案.md §4 / §6 / §7.4）：
 *   - 各 category 模板 layers.length === 配置 maxLayer（attrRatio / layerGains 由公式 + sparse overlay 展开）
 *   - expToNext 非负；最后一层 expToNext === 0（沿用 legacy 约定）
 *   - 非末层 expToNext > 0；阶段内部经验单调不减
 *   - attrRatio 为正的维度在每层都能贡献至少 1 点属性；六维总量与 `calcInternalTechniqueAttrTotal` 对齐
 *   - arts：根级 skills 原样保留，运行时 skills 数组长度等于原 JSON skills 长度
 *   - divine / secret：逐层 attrs / specialStats 完整透传到运行时 layers
 *   - 天阶 `ningqi_chengji` 和 `xuesha_huanling_jue` 的 sparse qiProjection 按原 level 精确挂回
 *   - 全量 layers 总经验 === `sum(shared.expandTechniqueExpCurve(...).perLayerExp)`，末层归零
 *
 * 产物仅读；不改动真源文件，也不依赖数据库或网络。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { ContentTemplateRepository } from '../content/content-template.repository';
import {
  TECHNIQUE_ATTR_KEYS,
  calcInternalTechniqueAttrTotal,
  expandTechniqueExpCurve,
  expandTechniqueLayerGains,
  shouldExpandTechniqueAttrRatio,
} from '@mud/shared';

const TECHNIQUES_ROOT = path.resolve(__dirname, '../../data/content/techniques');

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) out.push(full);
  }
  return out;
}

interface RawTemplate {
  file: string;
  template: Record<string, any>;
}

function loadRawTemplates(): RawTemplate[] {
  const result: RawTemplate[] = [];
  for (const file of collectJsonFiles(TECHNIQUES_ROOT)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      result.push({ file, template: entry });
    }
  }
  return result;
}

function main(): void {
  const repository = new ContentTemplateRepository();
  repository.loadAll();

  const runtimeTemplates = repository.listTechniqueTemplates();
  const byId = new Map<string, (typeof runtimeTemplates)[number]>();
  for (const template of runtimeTemplates) byId.set(template.id, template);

  const ningqi = repository.hydrateTechniqueState({
    techId: 'ningqi_chengji',
    level: 49,
    realmLv: 49,
    exp: 0,
    expToNext: 0,
    realm: 3,
    skills: [],
  });
  assert.ok(ningqi, 'expected ningqi_chengji to hydrate from template');
  assert.equal(
    ningqi.realmLv,
    31,
    'ningqi_chengji template realmLv must win over persisted/current level contamination',
  );
  assert.equal(ningqi.layers.length, 49, 'ningqi_chengji should hydrate to 49 expanded layers');

  const raw = loadRawTemplates();
  assert.ok(raw.length > 0, 'expect at least one technique template in content data');

  const counts = { internal: 0, arts: 0, divine: 0, secret: 0, unknown: 0 };
  const tolerance = (n: number) => Math.max(2, n);

  for (const { template } of raw) {
    const id = String(template.id);
    const runtime = byId.get(id);
    assert.ok(runtime, `runtime template missing for ${id}`);

    const category = String(template.category ?? runtime.category ?? '');
    if (category !== 'internal' && category !== 'arts' && category !== 'divine' && category !== 'secret') {
      counts.unknown += 1;
      continue;
    }
    counts[category] += 1;

    const maxLayer = Math.max(
      1,
      Number(template.maxLayer ?? (Array.isArray(template.layers) ? template.layers.length : 9)),
    );
    const expDifficulty = Number(template.expDifficulty ?? 1);

    // 所有 category：layers 长度对齐 maxLayer
    const runtimeLayers = runtime.layers ?? [];
    assert.equal(
      runtimeLayers.length,
      maxLayer,
      `${id} (${category}): expected runtime layers.length === maxLayer(${maxLayer}), got ${runtimeLayers.length}`,
    );

    // expToNext 非负 + 末层 = 0 + 非末层 > 0 + 阶段内部单调不减
    let prevExp = 0;
    for (let i = 0; i < runtimeLayers.length; i += 1) {
      const layer = runtimeLayers[i];
      assert.equal(layer.level, i + 1, `${id}: layer[${i}].level mismatch`);
      assert.ok(Number.isFinite(layer.expToNext) && layer.expToNext >= 0, `${id}: layer[${i}].expToNext invalid`);
      if (i === runtimeLayers.length - 1) {
        assert.equal(layer.expToNext, 0, `${id}: final layer expToNext must be 0`);
      } else {
        assert.ok(layer.expToNext > 0, `${id}: non-final layer[${i}].expToNext must be > 0`);
        assert.ok(
          layer.expToNext >= prevExp - 1,
          `${id}: layer[${i}] exp regression: ${prevExp} -> ${layer.expToNext}`,
        );
        prevExp = layer.expToNext;
      }
    }

    // expToNext 与 shared 公式完全一致（允许末层归零引起的单层差）
    const expCurve = expandTechniqueExpCurve(
      runtime.grade as never,
      Number(runtime.realmLv),
      maxLayer,
      expDifficulty,
      category as never,
    );
    for (let i = 0; i < runtimeLayers.length; i += 1) {
      assert.equal(
        runtimeLayers[i].expToNext,
        expCurve.perLayerExp[i] ?? 0,
        `${id}: layer[${i}].expToNext mismatch with formula (got ${runtimeLayers[i].expToNext}, expect ${expCurve.perLayerExp[i]})`,
      );
    }

    // attrRatio 语义：在每层均分的前提下，至少贡献一层
    if (shouldExpandTechniqueAttrRatio({ attrRatio: template.attrRatio as never })) {
      const attrRatio = (template.attrRatio ?? {}) as Record<string, number>;
      for (const key of TECHNIQUE_ATTR_KEYS) {
        const weight = Number(attrRatio[key] ?? 0);
        if (weight <= 0) continue;
        const contributed = runtimeLayers.some((layer) => Number(layer.attrs?.[key] ?? 0) > 0);
        assert.ok(contributed, `${id}: attrRatio[${key}]=${weight} but no runtime layer contributes > 0`);
      }
      // 六维总量对齐
      const expectedAttrTotal = calcInternalTechniqueAttrTotal(
        runtime.grade as never,
        Number(runtime.realmLv),
        Number(template.attrFloat ?? 0),
      );
      let actualAttrTotal = 0;
      for (const layer of runtimeLayers) {
        if (!layer.attrs) continue;
        for (const k of TECHNIQUE_ATTR_KEYS) actualAttrTotal += Number(layer.attrs[k] ?? 0);
      }
      const attrDelta = Math.abs(actualAttrTotal - expectedAttrTotal);
      assert.ok(
        attrDelta <= tolerance(maxLayer),
        `${id}: attr total drift too large: expected ~${expectedAttrTotal.toFixed(2)}, got ${actualAttrTotal}`,
      );
    }

    if (category === 'arts') {
      // 根级 skills 数量守恒
      const rawSkills = Array.isArray(template.skills) ? template.skills.length : 0;
      const runtimeSkills = Array.isArray(runtime.skills) ? runtime.skills.length : 0;
      assert.equal(runtimeSkills, rawSkills, `${id}: arts skills count mismatch (raw=${rawSkills}, runtime=${runtimeSkills})`);
      // arts 一般没有逐层 attrs/specialStats；若 JSON 里 layers 不存在，runtime 每层 attrs 应为 undefined
      if (!Array.isArray(template.layers) || template.layers.length === 0) {
        for (const layer of runtimeLayers) {
          assert.equal(layer.attrs, undefined, `${id}: arts without layers should not have attrs on runtime layers`);
          assert.equal(layer.specialStats, undefined, `${id}: arts without layers should not have specialStats on runtime layers`);
        }
      }
    } else if (category === 'divine' || category === 'secret') {
      // 若 JSON 采用 layerGains（新紧凑格式），展开后必须与运行时 layers 逐层一致
      if (template.layerGains && typeof template.layerGains === 'object') {
        const expanded = expandTechniqueLayerGains(template.layerGains as never, maxLayer);
        assert.equal(
          expanded.length,
          runtimeLayers.length,
          `${id}: layerGains expanded length ${expanded.length} != runtime layers.length ${runtimeLayers.length}`,
        );
        for (let i = 0; i < expanded.length; i += 1) {
          const exp = expanded[i];
          const actual = runtimeLayers[i];
          // attrs
          const expAttrKeys = Object.keys(exp.attrs ?? {}).sort();
          const actAttrKeys = Object.keys(actual.attrs ?? {}).sort();
          assert.deepEqual(
            actAttrKeys,
            expAttrKeys,
            `${id}: level ${i + 1} attrs keys mismatch (layerGains expanded: ${expAttrKeys.join(',')}, runtime: ${actAttrKeys.join(',')})`,
          );
          for (const k of expAttrKeys) {
            assert.equal(
              Number(actual.attrs?.[k] ?? 0),
              Number(exp.attrs?.[k] ?? 0),
              `${id}: level ${i + 1} attrs.${k} mismatch`,
            );
          }
          // specialStats
          const expSpecialKeys = Object.keys(exp.specialStats ?? {}).sort();
          const actSpecialKeys = Object.keys(actual.specialStats ?? {}).sort();
          assert.deepEqual(
            actSpecialKeys,
            expSpecialKeys,
            `${id}: level ${i + 1} specialStats keys mismatch`,
          );
          for (const k of expSpecialKeys) {
            assert.equal(
              Number((actual.specialStats as Record<string, number>)?.[k] ?? 0),
              Number((exp.specialStats as Record<string, number>)?.[k] ?? 0),
              `${id}: level ${i + 1} specialStats.${k} mismatch`,
            );
          }
        }
      } else if (Array.isArray(template.layers)) {
        // 逐层 attrs / specialStats 原样透传：按 level 对齐验证每个字段
        for (const legacy of template.layers) {
          if (!legacy || typeof legacy !== 'object') continue;
          const level = Number(legacy.level);
          const target = runtimeLayers.find((layer) => Number(layer.level) === level);
          assert.ok(target, `${id}: runtime missing level ${level}`);
          if (legacy.attrs && typeof legacy.attrs === 'object') {
            for (const [k, v] of Object.entries(legacy.attrs)) {
              assert.equal(
                Number(target.attrs?.[k] ?? 0),
                Number(v),
                `${id}: level ${level} attrs.${k} lost (expect ${v}, got ${target.attrs?.[k]})`,
              );
            }
          }
          if (legacy.specialStats && typeof legacy.specialStats === 'object') {
            for (const [k, v] of Object.entries(legacy.specialStats)) {
              assert.equal(
                Number(target.specialStats?.[k] ?? 0),
                Number(v),
                `${id}: level ${level} specialStats.${k} lost (expect ${v}, got ${target.specialStats?.[k]})`,
              );
            }
          }
        }
      }
    }
  }

  assert.ok(counts.internal + counts.arts + counts.divine + counts.secret > 0, 'no technique templates validated');

  // 天阶 ningqi_chengji 的 sparse qiProjection overlay（特例兜底）
  const nqcj = byId.get('ningqi_chengji');
  assert.ok(nqcj, 'ningqi_chengji runtime template missing');
  const expectedQiLevels = [7, 14, 21, 28, 35, 42, 48, 49];
  const qiLayersByLevel = new Map<number, Array<Record<string, unknown>>>();
  for (const layer of nqcj.layers ?? []) {
    if (Array.isArray(layer.qiProjection) && layer.qiProjection.length > 0) {
      qiLayersByLevel.set(Number(layer.level), layer.qiProjection as never);
    }
  }
  assert.deepEqual(
    [...qiLayersByLevel.keys()].sort((a, b) => a - b),
    expectedQiLevels,
    `ningqi_chengji qiProjection levels mismatch: got ${[...qiLayersByLevel.keys()].sort().join(',')}`,
  );
  const lastQi = qiLayersByLevel.get(49);
  assert.ok(
    Array.isArray(lastQi) && lastQi.some((entry) => Number(entry.efficiencyBpMultiplier) === 10300),
    'ningqi_chengji level 49 should keep upgraded efficiencyBpMultiplier=10300',
  );

  const xuesha = byId.get('xuesha_huanling_jue');
  assert.ok(xuesha, 'xuesha_huanling_jue runtime template missing');
  const xueshaQiLayersByLevel = new Map<number, Array<Record<string, unknown>>>();
  for (const layer of xuesha.layers ?? []) {
    if (Array.isArray(layer.qiProjection) && layer.qiProjection.length > 0) {
      xueshaQiLayersByLevel.set(Number(layer.level), layer.qiProjection as never);
    }
  }
  assert.deepEqual(
    [...xueshaQiLayersByLevel.keys()].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    `xuesha_huanling_jue qiProjection levels mismatch: got ${[...xueshaQiLayersByLevel.keys()].sort().join(',')}`,
  );
  const firstXueshaQi = xueshaQiLayersByLevel.get(1);
  assert.ok(
    Array.isArray(firstXueshaQi)
      && firstXueshaQi.some((entry) => Number(entry.efficiencyBpMultiplier) === 9000)
      && firstXueshaQi.some((entry) => Number(entry.efficiencyBpMultiplier) === 12000),
    'xuesha_huanling_jue level 1 should keep aura 9000 and sha 12000 qiProjection multipliers',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        validatedCountByCategory: counts,
        answers:
          '全部功法模板（internal/arts/divine/secret）经由 ContentTemplateRepository 加载后，layers 长度、expToNext 归一、末层归零、内功六维、术法 skills、神通/秘术 逐层 attrs+specialStats、天阶 sparse qiProjection 均与 shared 公式保持一致',
        excludes:
          '不覆盖 AI 生成落库路径、不覆盖客户端 UI 展示，也不回答运行时战斗表现是否均衡',
      },
      null,
      2,
    ),
  );
}

main();
