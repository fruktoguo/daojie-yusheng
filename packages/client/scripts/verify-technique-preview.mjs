#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = fileURLToPath(new URL('..', import.meta.url));

const vite = await createServer({
  root: clientRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const [localTemplates, bonusSummary, equipmentTooltip, editorCatalog] = await Promise.all([
    vite.ssrLoadModule('/src/content/local-templates.ts'),
    vite.ssrLoadModule('/src/ui/technique-bonus-summary.ts'),
    vite.ssrLoadModule('/src/ui/equipment-tooltip.ts'),
    vite.ssrLoadModule('/src/content/editor-catalog.ts'),
  ]);

  const resolveTemplatePreview = (techniqueId) => {
    const technique = localTemplates.getLocalTechniqueTemplate(techniqueId);
    assert.ok(technique, `缺少功法模板：${techniqueId}`);
    return {
      technique,
      maxLevel: localTemplates.getPreviewTechniqueMaxLevel(technique),
      layers: localTemplates.resolvePreviewTechniqueTemplateLayers(technique),
    };
  };

  const foundation = resolveTemplatePreview('ningqi_chengji');
  assert.equal(foundation.maxLevel, 49, '凝气成基法必须按 maxLayer 识别为 49 层');
  assert.equal(foundation.layers.length, 49, '凝气成基法紧凑模板必须展开为完整逐层预览');
  const foundationSummary = bonusSummary.formatTechniqueCumulativeBonusSummary(
    foundation.maxLevel,
    foundation.layers,
  );
  assert.match(foundationSummary, /体魄\+/u, '凝气成基法预览缺少体魄加成');
  assert.match(foundationSummary, /经脉\+/u, '凝气成基法预览缺少经脉加成');
  assert.match(
    foundationSummary,
    /无属性灵气吸收效率\+10%/u,
    '凝气成基法满层预览缺少 10% 无属性灵气吸收效率加成',
  );
  assert.match(
    bonusSummary.formatTechniqueCumulativeBonusSummary(7, foundation.layers),
    /无属性灵气吸收效率\+1%/u,
    '凝气成基法分层预览必须只累计已覆盖层数的气机加成',
  );

  const bloodSha = resolveTemplatePreview('xuesha_huanling_jue');
  assert.equal(bloodSha.maxLevel, 9, '血煞唤灵决必须识别为 9 层');
  assert.equal(
    bonusSummary.formatTechniqueCumulativeBonusSummary(bloodSha.maxLevel, bloodSha.layers),
    '无属性灵气吸收效率-90% / 煞气吸收效率+180%',
    '血煞唤灵决满层预览必须同时显示正负气机投影',
  );
  assert.equal(
    bonusSummary.formatTechniqueLayerBonusSummary(bloodSha.layers[0]),
    '无属性灵气吸收效率-10% / 煞气吸收效率+20%',
    '血煞唤灵决单层预览必须显示该层的两项气机变化',
  );

  const insight = resolveTemplatePreview('mountain_insight_chart');
  assert.match(
    bonusSummary.formatTechniqueCumulativeBonusSummary(insight.maxLevel, insight.layers),
    /悟性\+21/u,
    'layerGains 与差量配置必须进入功法满层预览',
  );

  assert.equal(
    bonusSummary.formatTechniqueLayerBonusSummary({
      level: 1,
      expToNext: 0,
      qiProjection: [{
        selector: { resourceKeys: ['aura.dispersed.fire'] },
        visibility: 'observable',
      }],
    }),
    '逸散火属性灵气可感知',
    '气机资源键与可见性也必须被预览格式化',
  );

  const foundationTooltip = equipmentTooltip.buildItemTooltipPayload({
    itemId: 'book.ningqi_chengji',
    name: '《凝气成基法》',
    type: 'skill_book',
    desc: '记载凝气成基法的修行法门。',
    count: 1,
    learnTechniqueId: 'ningqi_chengji',
  });
  const foundationTooltipText = foundationTooltip.lines.join('\n');
  assert.match(foundationTooltipText, /体魄\+/u, '功法书提示未接入展开后的六维属性');
  assert.match(foundationTooltipText, /无属性灵气吸收效率\+10%/u, '功法书提示未接入气机投影');

  const fragmentTooltip = equipmentTooltip.buildItemTooltipPayload({
    itemId: 'book.ningqi_chengji',
    name: '《凝气成基法》残卷',
    type: 'skill_book',
    desc: '记载凝气成基法前 7 层。',
    count: 1,
    learnTechniqueId: 'ningqi_chengji',
    learnTechniqueMaxLevel: 7,
  });
  const fragmentTooltipText = fragmentTooltip.lines.join('\n');
  assert.match(fragmentTooltipText, /无属性灵气吸收效率\+1%/u, '残卷提示必须按可修层数累计气机投影');
  assert.doesNotMatch(fragmentTooltipText, /无属性灵气吸收效率\+10%/u, '残卷提示不得套用完整功法满层加成');

  let coveredTechniqueCount = 0;
  for (const technique of editorCatalog.LOCAL_EDITOR_CATALOG.techniques) {
    const layers = localTemplates.resolvePreviewTechniqueTemplateLayers(technique);
    const hasPreviewBonus = layers.some((layer) => (
      Object.values(layer.attrs ?? {}).some((value) => Number(value) > 0)
      || Object.values(layer.specialStats ?? {}).some((value) => Number(value) > 0)
      || (layer.qiProjection ?? []).some((modifier) => (
        Boolean(modifier.visibility)
        || (Number.isFinite(modifier.efficiencyBpMultiplier) && modifier.efficiencyBpMultiplier !== 10_000)
      ))
    ));
    if (!hasPreviewBonus) {
      continue;
    }
    const summary = bonusSummary.formatTechniqueCumulativeBonusSummary(
      localTemplates.getPreviewTechniqueMaxLevel(technique),
      layers,
    );
    assert.notEqual(summary, '无增益', `${technique.name} 的已配置属性不得在预览中全部丢失`);
    coveredTechniqueCount += 1;
  }
  assert.ok(coveredTechniqueCount > 0, '功法目录专项验证未覆盖到任何带属性的模板');

  console.log(`功法紧凑模板、逐层属性、气机投影与功法书预览验证通过（覆盖 ${coveredTechniqueCount} 门带属性功法）`);
} finally {
  await vite.close();
}
