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
  const [localTemplates, bonusSummary, equipmentTooltip, editorCatalog, contentResolverModule, skillTooltip, panelDeltaStateSource] = await Promise.all([
    vite.ssrLoadModule('/src/content/local-templates.ts'),
    vite.ssrLoadModule('/src/ui/technique-bonus-summary.ts'),
    vite.ssrLoadModule('/src/ui/equipment-tooltip.ts'),
    vite.ssrLoadModule('/src/content/editor-catalog.ts'),
    vite.ssrLoadModule('/src/content/content-resolver.ts'),
    vite.ssrLoadModule('/src/ui/skill-tooltip.ts'),
    vite.ssrLoadModule('/src/main-panel-delta-state-source.ts'),
  ]);

  const stripHtml = (value) => value.replace(/<[^>]+>/gu, '');

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

  const artsTooltip = equipmentTooltip.buildItemTooltipPayload({
    itemId: 'book.baihong_duanyue',
    name: '《白虹断岳典》',
    type: 'skill_book',
    desc: '记载白虹断岳典的修行法门。',
    count: 1,
    learnTechniqueId: 'baihong_duanyue',
  });
  const artsTooltipText = stripHtml(artsTooltip.lines.join('\n'));
  assert.match(artsTooltipText, /断影/u, '系统术法书必须显示技能名称');
  assert.match(artsTooltipText, /物理伤害/u, '系统术法书必须显示具体伤害效果');
  assert.match(artsTooltipText, /破甲/u, '系统术法书必须显示技能附带的 Buff 或 Debuff');
  assert.match(artsTooltipText, /灵力消耗：[^\n]*\d/u, '系统术法书必须显示具体灵力消耗');
  assert.match(artsTooltipText, /冷却：20 息/u, '系统术法书必须显示具体冷却时间');
  assert.ok(artsTooltip.asideCards.length > 0, '系统术法书必须保留技能 Buff 详情侧栏');

  const levelScalingSkill = {
    id: 'skill.preview.level-scaling',
    name: '百艺归元',
    desc: '以自身境界与技艺积淀增幅术法。',
    cooldown: 1,
    cost: 0,
    range: 1,
    targeting: { shape: 'single', maxTargets: 1 },
    effects: [{
      type: 'damage',
      damageKind: 'spell',
      formula: {
        op: 'mul',
        args: [
          { op: 'add', args: [{ var: 'caster.stat.spellAtk', scale: 1 }] },
          {
            op: 'add',
            args: [
              1,
              { var: 'techLevel', scale: 0.1 },
              { var: 'caster.realmLv', scale: 0.12 },
              { var: 'caster.craft.alchemy.level', scale: 0.1 },
              { var: 'caster.craft.forging.level', scale: 0.1 },
              { var: 'caster.craft.enhancement.level', scale: 0.1 },
              { var: 'caster.craft.transmission.level', scale: 0.1 },
              { var: 'caster.craft.gather.level', scale: 0.1 },
              { var: 'caster.craft.mining.level', scale: 0.1 },
              { var: 'caster.craft.building.level', scale: 0.1 },
              { var: 'caster.craft.formation.level', scale: 0.1 },
            ],
          },
        ],
      },
    }],
  };
  const levelScalingPlayer = {
    x: 0,
    y: 0,
    hp: 1_000,
    maxHp: 1_000,
    qi: 1_000,
    realmLv: 1,
    realm: { realmLv: 42 },
    numericStats: { spellAtk: 100, maxQi: 1_000, maxQiOutputPerTick: 1_000 },
    finalAttrs: {},
    temporaryBuffs: [],
    alchemySkill: { level: 1 },
    forgingSkill: { level: 2 },
    enhancementSkill: { level: 3 },
    transmissionSkill: { level: 4 },
    gatherSkill: { level: 5 },
    miningSkill: { level: 6 },
    buildingSkill: { level: 7 },
    formationSkill: { level: 8 },
  };
  const levelScalingContext = {
    techLevel: 3,
    player: levelScalingPlayer,
  };
  assert.equal(
    Math.round(skillTooltip.summarizeSkillPreviewMetrics(levelScalingSkill, levelScalingContext).actualDamage),
    994,
    '术法预览总伤害必须计入当前境界、功法层数和八项技艺等级',
  );
  const levelScalingTooltipText = stripHtml(
    skillTooltip.buildSkillTooltipContent(levelScalingSkill, levelScalingContext).lines.join('\n'),
  );
  assert.match(levelScalingTooltipText, /法术伤害：994/u, '术法 hover 必须显示包含等级增幅的总伤害');
  assert.doesNotMatch(levelScalingTooltipText, /吟唱/u, '瞬发术法不得显示零息吟唱');
  for (const label of [
    '自身境界等级',
    '自身炼丹等级',
    '自身炼器等级',
    '自身强化等级',
    '自身传法等级',
    '自身采集等级',
    '自身挖矿等级',
    '自身营造等级',
    '自身阵法等级',
  ]) {
    assert.match(levelScalingTooltipText, new RegExp(label, 'u'), `${label}必须进入 hover 伤害构成`);
  }
  const projectionStateSource = panelDeltaStateSource.createMainPanelDeltaStateSource({
    getPlayer: () => levelScalingPlayer,
    refreshObservedDecorations() {},
    attrPanel: { update() {}, invalidateDetail() {} },
    equipmentPanel: { update() {}, syncPlayerContext() {} },
    bodyTrainingPanel: { syncFoundation() {}, syncDynamic() {} },
    craftWorkbenchModal: { syncAttrUpdate() {}, syncEquipment() {} },
    inventoryStateSource: { syncInventory() {}, syncPlayerContext() {} },
    refreshHeavenGateModal() {},
    refreshUiChrome() {},
    syncAttrBridgeState() {},
  });
  projectionStateSource.handleAttrUpdate({
    forgingSkill: { level: 12, exp: 0, expToNext: 100 },
    miningSkill: { level: 16, exp: 0, expToNext: 100 },
  });
  assert.equal(levelScalingPlayer.forgingSkill.level, 12, '炼器等级增量必须回写当前玩家投影');
  assert.equal(levelScalingPlayer.miningSkill.level, 16, '挖矿等级增量必须回写当前玩家投影');
  assert.equal(
    Math.round(skillTooltip.summarizeSkillPreviewMetrics(levelScalingSkill, levelScalingContext).actualDamage),
    1_194,
    '技艺升级后 hover 必须直接使用最新服务端投影，不得等待重登',
  );

  const generatedTechniqueId = 'generated.technique.preview.detail';
  const generatedTechnique = {
    id: generatedTechniqueId,
    name: '星火演法',
    desc: '引星火成印，随功法层数稳固术式。',
    grade: 'yellow',
    category: 'arts',
    realmLv: 12,
    maxLayer: 3,
    layers: [
      { level: 1, expToNext: 100, attrs: { spirit: 2 } },
      { level: 2, expToNext: 120, attrs: { spirit: 3 } },
      { level: 3, expToNext: 0, attrs: { spirit: 4 } },
    ],
    skills: [{
      id: 'skill.generated.technique.preview.detail',
      name: '星火印',
      desc: '星火凝成一印，命中后爆开。',
      cooldown: 9,
      cost: 321,
      range: 4,
      targeting: { shape: 'single', maxTargets: 1 },
      effects: [{
        type: 'damage',
        damageKind: 'spell',
        element: 'fire',
        formula: 777,
      }],
      unlockLevel: 2,
      targetMode: 'tile',
      playerCast: { windupTicks: 7 },
    }],
  };
  const generatedInternalTechniqueId = 'generated.technique.preview.budgeted-internal';
  const generatedInternalTechnique = {
    id: generatedInternalTechniqueId,
    name: '听潮照影篇',
    desc: '静听灵潮，映照身形。',
    grade: 'spirit',
    category: 'internal',
    realmLv: 48,
    attrRatio: { spirit: 0.029, perception: 100 },
    budgetPercent: 1.1827,
    totalBudget: 3167.2706,
    maxLayer: 9,
    expDifficulty: 1.07,
    layers: [],
    skills: [],
  };
  const generatedTechniques = new Map([
    [generatedTechniqueId, generatedTechnique],
    [generatedInternalTechniqueId, generatedInternalTechnique],
  ]);
  const requestedTechniqueIds = [];
  contentResolverModule.contentResolver.bindEmitter((payload) => {
    requestedTechniqueIds.push(...(payload.techniques ?? []));
    queueMicrotask(() => {
      contentResolverModule.contentResolver.handleContentTemplatesResponse({
        requestId: payload.requestId,
        techniques: (payload.techniques ?? [])
          .map((techniqueId) => generatedTechniques.get(techniqueId))
          .filter(Boolean),
      });
    });
    return { accepted: true };
  });
  const generatedBook = {
    itemId: 'book.custom_technique',
    name: '《星火演法》',
    type: 'skill_book',
    desc: '完整记载星火演法。',
    count: 1,
    learnTechniqueId: generatedTechniqueId,
  };
  assert.equal(
    localTemplates.getLocalTechniqueTemplate(generatedTechniqueId),
    null,
    '动态自创功法在按需读取前不应伪装成本地静态模板',
  );
  const fetchedGeneratedTechnique = await localTemplates.fetchTechniqueTemplateForBookItem(generatedBook);
  assert.equal(fetchedGeneratedTechnique?.id, generatedTechniqueId, '自创功法书必须能按 learnTechniqueId 读取完整模板');
  assert.deepEqual(requestedTechniqueIds, [generatedTechniqueId], '自创功法详情查询必须只请求当前功法 ID');
  const generatedTooltip = equipmentTooltip.buildItemTooltipPayload(generatedBook);
  const generatedTooltipText = stripHtml(generatedTooltip.lines.join('\n'));
  assert.match(generatedTooltipText, /神识\+9/u, '自创功法属性链必须能读取动态模板的逐层累计属性');
  assert.match(generatedTooltipText, /星火印/u, '自创术法书必须显示动态模板里的技能名称');
  assert.match(generatedTooltipText, /火行法术伤害：777/u, '自创术法书必须显示动态模板里的具体伤害');
  assert.match(generatedTooltipText, /灵力消耗：321/u, '自创术法书必须显示动态模板里的具体消耗');
  assert.match(generatedTooltipText, /吟唱：7 息/u, '自创术法书必须显示运行时实际吟唱时间');
  assert.match(generatedTooltipText, /冷却：9 息/u, '自创术法书必须显示动态模板里的具体冷却');

  const generatedInternalBook = {
    itemId: 'book.custom_technique',
    name: '《听潮照影篇》',
    type: 'skill_book',
    desc: '完整记载听潮照影篇。',
    count: 1,
    learnTechniqueId: generatedInternalTechniqueId,
  };
  await localTemplates.fetchTechniqueTemplateForBookItem(generatedInternalBook);
  const generatedInternalTooltip = equipmentTooltip.buildItemTooltipPayload(generatedInternalBook);
  const generatedInternalTooltipText = stripHtml(generatedInternalTooltip.lines.join('\n'));
  assert.match(
    generatedInternalTooltipText,
    /身法\+3168/u,
    '自创内功书预览必须使用服务端确定的预算百分比展开满层属性',
  );
  assert.doesNotMatch(
    generatedInternalTooltipText,
    /身法\+2676/u,
    '自创内功书预览不得回退到默认 100% 预算',
  );

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

  console.log(`功法属性、系统术法、自创功法模板与技能完整详情验证通过（覆盖 ${coveredTechniqueCount} 门带属性功法）`);
} finally {
  await vite.close();
}
