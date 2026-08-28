#!/usr/bin/env node
/**
 * 境界等级极限基准期望六维生成脚本
 *
 * 依据 docs/design/balance/境界等级极限基准期望六维参数.json
 * 生成 packages/server/data/content/realm-attr-peak-baselines.json
 * 及 docs/design/balance/境界等级极限基准期望六维公式.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultConfigPath = path.join(repoRoot, 'docs/design/balance/境界等级极限基准期望六维参数.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const realmNames = {
  1: '凡胎', 2: '炼皮', 3: '锻骨', 4: '易筋', 5: '洗髓',
  6: '养气', 7: '通脉', 8: '瑶光',
  9: '开阳', 10: '玉衡', 11: '天权',
  12: '天玑', 13: '天璇', 14: '天枢', 15: '宗师',
  16: '大宗师', 17: '临渊', 18: '叩仙门',
  19: '练气一层', 20: '练气二层', 21: '练气三层', 22: '练气四层',
  23: '练气五层', 24: '练气六层', 25: '练气七层', 26: '练气八层',
  27: '练气九层', 28: '练气巅峰', 29: '练气大圆满', 30: '半步筑基',
  31: '筑基一层', 32: '筑基二层', 33: '筑基三层', 34: '筑基四层',
  35: '筑基五层', 36: '筑基六层', 37: '筑基七层', 38: '筑基八层',
  39: '筑基九层', 40: '筑基巅峰', 41: '筑基大圆满', 42: '半步金丹',
  43: '金丹一层', 44: '金丹二层', 45: '金丹三层', 46: '金丹四层',
  47: '金丹五层', 48: '金丹六层', 49: '金丹七层', 50: '金丹八层',
  51: '金丹九层', 52: '金丹巅峰', 53: '金丹大圆满', 54: '半步元婴',
  55: '元婴一层', 56: '元婴二层', 57: '元婴三层', 58: '元婴四层',
  59: '元婴五层', 60: '元婴六层', 61: '元婴七层', 62: '元婴八层',
  63: '元婴九层', 64: '元婴巅峰', 65: '元婴大圆满', 66: '半步化神',
  67: '化神一层', 68: '化神二层', 69: '化神三层', 70: '化神四层',
  71: '化神五层', 72: '化神六层', 73: '化神七层', 74: '化神八层',
  75: '化神九层', 76: '化神巅峰', 77: '化神大圆满', 78: '半步炼虚',
};

const gradeMultipliers = {
  mortal: 1.0, yellow: 1.2, mystic: 1.5, earth: 2.0, heaven: 2.6, spirit: 3.4, saint: 4.5, emperor: 6.0,
};

function getEquipmentGrade(L) {
  if (L <= 8) return 'yellow';
  if (L <= 18) return 'earth';
  if (L <= 30) return 'heaven';
  if (L <= 42) return 'spirit';
  if (L <= 54) return 'saint';
  return 'emperor';
}

function getTemplateStats(L) {
  if (L <= 5) return { maxHp: 100, physAtk: 10, spellAtk: 7 };
  if (L <= 8) return { maxHp: 120, physAtk: 12, spellAtk: 8 };
  if (L <= 11) return { maxHp: 140, physAtk: 14, spellAtk: 9 };
  if (L <= 15) return { maxHp: 160, physAtk: 15, spellAtk: 11 };
  if (L <= 18) return { maxHp: 180, physAtk: 16, spellAtk: 14 };
  if (L <= 22) return { maxHp: 220, physAtk: 20, spellAtk: 19 };
  if (L <= 26) return { maxHp: 270, physAtk: 24, spellAtk: 25 };
  if (L <= 30) return { maxHp: 320, physAtk: 28, spellAtk: 31 };
  if (L <= 34) return { maxHp: 400, physAtk: 36, spellAtk: 40 };
  if (L <= 38) return { maxHp: 480, physAtk: 43, spellAtk: 49 };
  if (L <= 42) return { maxHp: 580, physAtk: 51, spellAtk: 58 };
  if (L <= 46) return { maxHp: 720, physAtk: 62, spellAtk: 70 };
  if (L <= 50) return { maxHp: 880, physAtk: 75, spellAtk: 85 };
  if (L <= 54) return { maxHp: 1080, physAtk: 90, spellAtk: 105 };
  return { maxHp: 1300, physAtk: 110, spellAtk: 130 };
}

function interpolateAnchor(anchors, L, key) {
  if (L <= anchors[0].level) return anchors[0][key];
  if (L >= anchors[anchors.length - 1].level) return anchors[anchors.length - 1][key];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (L >= a.level && L <= b.level) {
      const ratio = (L - a.level) / (b.level - a.level);
      return a[key] + (b[key] - a[key]) * ratio;
    }
  }
  return anchors[anchors.length - 1][key];
}

function main() {
  const config = readJson(defaultConfigPath);
  const maxLevel = config.maxRealmLevel || 78;
  const decayRate = config.techniqueDecay?.marginalDecayRate || 0.9998;
  const lnDecay = Math.log(1 / (1 - decayRate));

  const gradeOutputs = {};
  for (const b of config.gradeBands) {
    gradeOutputs[b.grade] = b.freeLimit + b.decaySpan * lnDecay;
  }

  // 大境界基础六维累加
  const stages = config.realmBaseAttrs.stages || [];
  function getRealmBaseAttr(L) {
    let sum = 0;
    for (const s of stages) {
      if (L >= s.levelFrom) {
        const bonusValues = Object.values(s.attrBonus || {});
        if (bonusValues.length > 0) {
          const avg = bonusValues.reduce((a, b) => a + b, 0) / 6;
          sum += avg;
        }
      }
    }
    return sum;
  }

  // 极限可学功法池随等级解锁
  function getPeakTechPool(L) {
    const pMortal = gradeOutputs.mortal;
    const pYellow = gradeOutputs.yellow;
    const pMystic = gradeOutputs.mystic;
    const pEarth = gradeOutputs.earth;
    const pHeaven = gradeOutputs.heaven;
    const pSpirit = gradeOutputs.spirit;
    const pSaint = gradeOutputs.saint || (1760 + 1408 * lnDecay);
    const pEmperor = gradeOutputs.emperor || (3520 + 2816 * lnDecay);

    if (L <= 8) return pMortal + pYellow * (L / 8);
    if (L <= 18) return pMortal + pYellow + (pMystic + pEarth) * ((L - 8) / 10);
    if (L <= 30) return pMortal + pYellow + pMystic + pEarth + pHeaven * ((L - 18) / 12);
    if (L <= 42) return pMortal + pYellow + pMystic + pEarth + pHeaven + pSpirit * ((L - 30) / 12);
    if (L <= 54) return pMortal + pYellow + pMystic + pEarth + pHeaven + pSpirit + pSaint * ((L - 42) / 12);
    return pMortal + pYellow + pMystic + pEarth + pHeaven + pSpirit + pSaint + pEmperor * ((L - 54) / 24);
  }

  const outputLevels = [];
  const mdRows = [];

  for (let L = 1; L <= maxLevel; L++) {
    const realmExpMult = Math.pow(1.1, L - 1);
    const tpl = getTemplateStats(L);

    // 1. 乘区前底子
    const realmOneAttr = getRealmBaseAttr(L);
    const techPool = getPeakTechPool(L);
    const beforeMult = config.baseAttrPerKey + realmOneAttr + techPool;

    // 2. 炼体乘区
    const bodyTrainingLevel = Math.round(L * config.bodyTraining.levelMultiplier);
    const bodyMult = 1 + (bodyTrainingLevel * config.bodyTraining.percentPerLevel) / 100;

    // 3. 根基乘区
    const rootCap = Math.floor((L * (L + 1)) / 2);
    const rootMult = 1 + (rootCap * config.rootFoundation.percentPerPoint) / 100;

    // 4. 万法归元乘区
    const wanfaPct = interpolateAnchor(config.wanfaGuiyuan.anchors, L, 'wanfaPct');
    const wanfaMult = 1 + wanfaPct / 100;

    // 5. 最终极限单项六维
    const peakSingleAttr = beforeMult * bodyMult * rootMult * wanfaMult;

    // 6. 极限装备与战斗属性
    const enhanceLv = Math.round(interpolateAnchor(config.equipmentEnhancement.anchors, L, 'enhanceLevel'));
    const gradeKey = getEquipmentGrade(L);
    const gradeMult = gradeMultipliers[gradeKey] || 1.0;
    const equipBase = (8 + 0.5 * L) * gradeMult;
    const enhanceMult = Math.pow(1.1, enhanceLv);

    const equipHp = equipBase * enhanceMult * 1.50;
    const equipAtk = equipBase * enhanceMult * 1.15;

    const doubleMult = 1 + (peakSingleAttr * 2) / 100;
    const peakHp = Math.round((tpl.maxHp + equipHp) * doubleMult * realmExpMult);
    const peakAtk = Math.round(((tpl.physAtk + tpl.spellAtk) / 2 + equipAtk) * doubleMult * realmExpMult);

    outputLevels.push({
      realmLv: L,
      realmName: realmNames[L] || `等级${L}`,
      singleAttr: Math.round(peakSingleAttr * 100) / 100,
      singleBaseStatValue: Math.round(equipBase * enhanceMult * 100) / 100,
      maxHp: peakHp,
      attack: peakAtk,
      enhanceLevel: enhanceLv,
      wanfaPercent: Math.round(wanfaPct * 100) / 100,
    });

    function formatN(n) {
      if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
      if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
      return `${Math.round(n)}`;
    }

    mdRows.push(`| **${L}** | ${realmNames[L] || `等级${L}`} | **\`${Math.round(peakSingleAttr).toLocaleString()}\`** | +${enhanceLv} | \`${formatN(peakHp)}\` | \`${formatN(peakAtk)}\` |`);
  }

  // 写入 JSON 生产配置
  const jsonContent = {
    version: 1,
    description: "各个境界等级的极限数值基准配置 (含万法归元独立乘区与极限强化)",
    levels: outputLevels,
  };
  const jsonTarget = path.resolve(repoRoot, config.baselineOutputPath);
  fs.mkdirSync(path.dirname(jsonTarget), { recursive: true });
  fs.writeFileSync(jsonTarget, JSON.stringify(jsonContent, null, 2), 'utf8');
  console.log(`✓ 极限基准配置已生成至: ${jsonTarget}`);

  // 写入 Markdown 文档
  const mdTarget = path.resolve(repoRoot, config.outputPath);
  const mdContent = `# 境界等级极限基准期望六维公式

统计日期：${config.reportDate}

> 本文由 \`scripts/generate-realm-peak-baseline-attrs.mjs\` 自动生成。
> 调整参数请改 \`docs/design/balance/境界等级极限基准期望六维参数.json\`。
> 同次生成的生产基准配置：\`packages/server/data/content/realm-attr-peak-baselines.json\`。

## 目标

本文定义 **“玩家极限基准属性 (Peak Baseline)”**，用来反映玩家在各个境界等级下，追求极致培养（功法 99.98% 深度衰减池、100% 满额根基、3倍等级炼体、顶配自创主力功法带来的【万法归元】全局独立乘区、全套毕业神装高强）时的理论极限数值。

主要用于 **高难度多人现世副本、世界妖王、封界阵耐久** 的数值平衡设计。

---

## 极限基准公式

\`\`\`text
乘区前单项六维 = 默认基础六维(10) + 境界累计均分六维 + 功法99.98%衰减池总和
极限单项六维 = 乘区前单项六维 × (1 + 极限炼体%) × (1 + 极限万法归元%) × (1 + 极限根基%)
\`\`\`

- **极限炼体**：按 \`3 × 等级\` 层满额达成（每层 +1% 六维）
- **极限根基**：按当前境界 \`100% 满点\` 达成（每点 +0.6% 六维）
- **万法归元**：按当前境界允许自创的最高品阶专精功法满层单项六维 \`M / 10%\` 独立乘区计入
- **极限装备**：18级 +12 强化，30级 +18 强化，42级 +23 强化，54级 +25 强化，78级 +30 强化

---

## 1 ~ ${maxLevel} 级 极限基准数值总表

| 等级 | 境界阶段 | 极限单项六维 | 装备强化 | 极限生命值 | 极限攻击力 |
| :---: | :--- | :---: | :---: | :---: | :---: |
${mdRows.join('\n')}
`;

  fs.mkdirSync(path.dirname(mdTarget), { recursive: true });
  fs.writeFileSync(mdTarget, mdContent, 'utf8');
  console.log(`✓ 极限基准设计文档已生成至: ${mdTarget}`);
}

main();
