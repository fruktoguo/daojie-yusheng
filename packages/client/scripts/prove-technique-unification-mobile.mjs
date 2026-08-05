/**
 * 统法台手机端布局与交互连续性 proof。
 *
 * 使用正式 Vite 页面、CraftWorkbenchModal 和样式，验证主 Tab 权限裁剪、双录法入口、
 * 法卷分页筛选、选中边框、强度角标以及窄屏纵向滚动路径。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const VIEWPORT = { width: 390, height: 844 };
const SHORT_VIEWPORT = { width: 390, height: 640 };

const initializeExpression = String.raw`
  (async () => {
    const { CraftWorkbenchModal } = await import('/src/ui/craft-workbench-modal.ts');
    const modal = new CraftWorkbenchModal();
    modal.setCallbacks({
      onRequestTechniqueAggregation: () => true,
      onPublishTechniqueAggregation: () => true,
      onUpdateTechniqueAggregationPermissions: () => true,
      onLearnTechniqueAggregation: () => true,
    });
    modal.openTechniqueAggregation('building:mobile-proof');
    const mortalSources = Array.from({ length: 28 }, (_, index) => ({
      techId: 'gen_mobile_mortal_' + index,
      name: '凡阶归元功' + (index + 1),
      grade: 'mortal',
      category: 'internal',
      realmLv: index < 16 ? 1 : 2,
      strengthPercent: 80 + (index % 41),
      level: 9,
      maxLevel: 9,
      fullyMastered: true,
      covered: false,
    }));
    const yellowSources = Array.from({ length: 2 }, (_, index) => ({
      techId: 'gen_mobile_yellow_' + index,
      name: '黄阶守一经' + (index + 1),
      grade: 'yellow',
      category: 'internal',
      realmLv: 3,
      strengthPercent: 119 - index,
      level: 9,
      maxLevel: 9,
      fullyMastered: true,
      covered: false,
    }));
    const sources = [...mortalSources, ...yellowSources];
    const permissions = {
      read: { unrestricted: false, friendLevels: ['close_friend'], sectRoles: ['elder', 'inner'] },
      revision: { unrestricted: false, friendLevels: [], sectRoles: ['inner'] },
    };
    const buildPanel = ({ bound = false, isOwner = true, canRevise = true } = {}) => ({
      revision: 7,
      buildingId: 'building:mobile-proof',
      eligibleSources: canRevise ? sources : [],
      families: bound ? [{
        familyId: 'family:mobile-proof',
        latestRevision: 4,
        latestTechniqueId: 'agg_mobile_proof_v4',
        name: '太玄归一真经',
        grade: 'mortal',
        category: 'internal',
        realmLv: 3,
        sourceCount: 2,
        sourceTechniqueIds: [mortalSources[0].techId, mortalSources[1].techId],
        jadeEnhancementCount: 2,
        creatorPlayerId: 'player:owner',
        playerCoveredCount: 0,
      }] : [],
      totalCoveredLeafCount: 0,
      learnedAggregateCount: 0,
      jadeItemCount: 3,
      platform: {
        buildingId: 'building:mobile-proof',
        displayName: '玄门统法台',
        ownerPlayerId: 'player:owner',
        isOwner,
        ...(bound ? { familyId: 'family:mobile-proof', latestTechniqueId: 'agg_mobile_proof_v4', latestRevision: 4 } : {}),
        permissions,
        canLearn: bound,
        canRevise,
        learnerState: bound ? 'available' : 'unbound',
      },
    });
    modal.handleTechniqueAggregationPanel(buildPanel());
    window.__techniqueUnificationProofModal = modal;
    window.__techniqueUnificationBuildPanel = buildPanel;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.getElementById('detail-modal-title')?.textContent?.trim() ?? '';
  })()
`;

const measureShellExpression = String.raw`
  (() => {
    const card = document.getElementById('detail-modal-card');
    const body = document.getElementById('detail-modal-body');
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    if (!(card instanceof HTMLElement) || !(body instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('统法台移动端 proof 外壳不完整');
    }
    const cardRect = card.getBoundingClientRect();
    const mainTabs = Array.from(panel.querySelectorAll('.technique-aggregation-primary-tab'));
    const tabRects = mainTabs.map((entry) => entry.getBoundingClientRect());
    const overflowNodes = [card, body, panel, ...Array.from(panel.querySelectorAll('*'))]
      .filter((entry) => entry instanceof HTMLElement && entry.scrollWidth > entry.clientWidth + 1)
      .map((entry) => entry.className || entry.tagName);
    return {
      viewportHeight: innerHeight,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      cardClass: card.className,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      mainTabLabels: mainTabs.map((entry) => entry.textContent?.trim() ?? ''),
      activeMainTab: panel.querySelector('.technique-aggregation-primary-tab.is-active')?.textContent?.trim() ?? '',
      minMainTabHeight: tabRects.length > 0 ? Math.min(...tabRects.map((rect) => rect.height)) : 0,
      hasDirectory: Boolean(panel.querySelector('[data-technique-aggregation-directory="true"]')),
      hasPermissions: Boolean(panel.querySelector('[data-technique-aggregation-permissions="true"]')),
      hasRecordTabs: Boolean(panel.querySelector('.technique-aggregation-record-tabs')),
      overviewText: panel.querySelector('.technique-aggregation-tab-content')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      overflowNodes,
    };
  })()
`;

const openSourceRecordExpression = String.raw`
  (() => {
    document.querySelector('[data-primary-tab="record"]')?.click();
    return Array.from(document.querySelectorAll('.technique-aggregation-record-tab'))
      .map((entry) => entry.textContent?.trim() ?? '');
  })()
`;

const measureSourceExpression = String.raw`
  (() => {
    const body = document.getElementById('detail-modal-body');
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    const directory = document.querySelector('[data-technique-aggregation-directory="true"]');
    const list = document.querySelector('[data-technique-aggregation-source-list="true"]');
    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    const realm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    if (!(body instanceof HTMLElement)
      || !(panel instanceof HTMLElement)
      || !(directory instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(grade instanceof HTMLSelectElement)
      || !(realm instanceof HTMLSelectElement)
      || !(name instanceof HTMLInputElement)) {
      throw new Error('自有功法录法结构不完整');
    }
    const sourceCards = Array.from(list.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement);
    const sourceRects = sourceCards.map((entry) => entry.getBoundingClientRect());
    const firstCard = sourceCards[0];
    const firstStrength = firstCard?.querySelector('.technique-aggregation-source-strength');
    const cardRect = firstCard?.getBoundingClientRect();
    const strengthRect = firstStrength?.getBoundingClientRect();
    const overflowNodes = [body, panel, ...Array.from(panel.querySelectorAll('*'))]
      .filter((entry) => entry instanceof HTMLElement && entry.scrollWidth > entry.clientWidth + 1)
      .map((entry) => entry.className || entry.tagName);
    return {
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      listOverflowY: getComputedStyle(list).overflowY,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      sourceCount: sourceCards.length,
      sourceGridColumns: getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length,
      minSourceHeight: sourceRects.length > 0 ? Math.min(...sourceRects.map((rect) => rect.height)) : 0,
      maxSourceHeight: sourceRects.length > 0 ? Math.max(...sourceRects.map((rect) => rect.height)) : 0,
      maxSourceWidth: sourceRects.length > 0 ? Math.max(...sourceRects.map((rect) => rect.width)) : 0,
      inventoryCardCount: list.querySelectorAll('.technique-aggregation-source.inventory-cell').length,
      firstStrength: firstStrength?.textContent?.trim() ?? '',
      strengthLeftOffset: cardRect && strengthRect ? strengthRect.left - cardRect.left : -1,
      strengthBottomOffset: cardRect && strengthRect ? cardRect.bottom - strengthRect.bottom : -1,
      gradeOptionCount: grade.options.length,
      realmOptionCount: realm.options.length,
      pageText: directory.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '',
      recordTabLabels: Array.from(panel.querySelectorAll('.technique-aggregation-record-tab'))
        .map((entry) => entry.textContent?.trim() ?? ''),
      activeRecordTab: panel.querySelector('.technique-aggregation-record-tab.is-active')?.textContent?.trim() ?? '',
      hasPermissions: Boolean(panel.querySelector('[data-technique-aggregation-permissions="true"]')),
      overflowNodes,
    };
  })()
`;

const sourceInteractionExpression = String.raw`
  (() => {
    const directory = document.querySelector('[data-technique-aggregation-directory="true"]');
    const realm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    const name = document.querySelector('[data-technique-aggregation-name="true"]');
    const firstCard = document.querySelector('.technique-aggregation-source');
    if (!(directory instanceof HTMLElement)
      || !(realm instanceof HTMLSelectElement)
      || !(name instanceof HTMLInputElement)
      || !(firstCard instanceof HTMLButtonElement)) {
      throw new Error('统法台自有功法交互结构不完整');
    }
    name.focus();
    name.value = '太玄归一真经';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    const beforeStyle = getComputedStyle(firstCard);
    const before = {
      borderColor: beforeStyle.borderTopColor,
      backgroundColor: beforeStyle.backgroundColor,
      backgroundImage: beforeStyle.backgroundImage,
    };
    const originalTransition = firstCard.style.transition;
    firstCard.style.transition = 'none';
    void firstCard.offsetWidth;
    firstCard.classList.add('is-selected');
    const selectedStyle = getComputedStyle(firstCard);
    const selectedCss = {
      borderColor: selectedStyle.borderTopColor,
      backgroundColor: selectedStyle.backgroundColor,
      backgroundImage: selectedStyle.backgroundImage,
    };
    firstCard.classList.remove('is-selected');
    firstCard.style.transition = originalTransition;
    firstCard.click();
    const selectedCard = document.querySelector('.technique-aggregation-source.is-selected');
    if (!(selectedCard instanceof HTMLButtonElement)) throw new Error('法卷卡未进入选中态');
    const selectedCardText = selectedCard.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    realm.value = '2';
    realm.dispatchEvent(new Event('change', { bubbles: true }));
    const realmFilteredCards = document.querySelectorAll('.technique-aggregation-source');
    const realmPageText = document.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '';
    const realmStrength = realmFilteredCards[0]?.querySelector('.technique-aggregation-source-strength')?.textContent?.trim() ?? '';

    const currentRealm = document.querySelector('[data-technique-aggregation-realm-filter="true"]');
    if (!(currentRealm instanceof HTMLSelectElement)) throw new Error('境界筛选器丢失');
    currentRealm.value = '';
    currentRealm.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-craft-action="technique-aggregation-select-all"]')?.click();
    const firstPageSelected = document.querySelectorAll('.technique-aggregation-source.is-selected').length;
    const selectedSummary = document.querySelector('[data-technique-aggregation-selection-summary="true"]')?.textContent?.trim() ?? '';
    document.querySelector('[data-craft-action="technique-aggregation-page-next"]')?.click();
    const secondPageSelected = document.querySelectorAll('.technique-aggregation-source.is-selected').length;
    const secondPageText = document.querySelector('.technique-aggregation-pagination span')?.textContent?.trim() ?? '';
    document.querySelector('[data-craft-action="technique-aggregation-clear-selection"]')?.click();
    const selectedAfterClear = document.querySelectorAll('.technique-aggregation-source.is-selected').length;

    const grade = document.querySelector('[data-technique-aggregation-grade-filter="true"]');
    if (!(grade instanceof HTMLSelectElement)) throw new Error('品阶筛选器丢失');
    grade.value = 'yellow';
    grade.dispatchEvent(new Event('change', { bubbles: true }));
    const sparseCards = Array.from(document.querySelectorAll('.technique-aggregation-source'))
      .filter((entry) => entry instanceof HTMLElement);
    const sparseWidths = sparseCards.map((entry) => entry.getBoundingClientRect().width);
    const currentName = document.querySelector('[data-technique-aggregation-name="true"]');
    return {
      directoryIdentityPreserved: document.querySelector('[data-technique-aggregation-directory="true"]') === directory,
      nameIdentityPreserved: currentName === name,
      nameValue: currentName instanceof HTMLInputElement ? currentName.value : '',
      borderChanged: before.borderColor !== selectedCss.borderColor,
      backgroundColorPreserved: before.backgroundColor === selectedCss.backgroundColor,
      backgroundImagePreserved: before.backgroundImage === selectedCss.backgroundImage,
      selectedCardText,
      realmFilteredCount: realmFilteredCards.length,
      realmPageText,
      realmStrength,
      firstPageSelected,
      selectedSummary,
      secondPageSelected,
      secondPageText,
      selectedAfterClear,
      gradeValue: document.querySelector('[data-technique-aggregation-grade-filter="true"]')?.value ?? '',
      sparseCount: sparseCards.length,
      maxSparseWidth: sparseWidths.length > 0 ? Math.max(...sparseWidths) : 0,
    };
  })()
`;

const openBoundJadeExpression = String.raw`
  (() => {
    const modal = window.__techniqueUnificationProofModal;
    const buildPanel = window.__techniqueUnificationBuildPanel;
    modal.handleTechniqueAggregationPanel(buildPanel({ bound: true, isOwner: true, canRevise: true }));
    document.querySelector('[data-primary-tab="record"]')?.click();
    document.querySelector('[data-record-mode="jade"]')?.click();
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    const button = document.querySelector('[data-craft-action="technique-aggregation-record-jade"]');
    return {
      activeMainTab: panel?.querySelector('.technique-aggregation-primary-tab.is-active')?.textContent?.trim() ?? '',
      activeRecordTab: panel?.querySelector('.technique-aggregation-record-tab.is-active')?.textContent?.trim() ?? '',
      jadeText: panel?.querySelector('.technique-aggregation-jade-record')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      jadeMetricCount: panel?.querySelectorAll('.technique-aggregation-jade-metrics > span').length ?? 0,
      balanceLabels: Array.from(panel?.querySelectorAll('.technique-aggregation-jade-balance > span') ?? [])
        .map((entry) => entry.textContent?.trim() ?? ''),
      recordButtonEnabled: button instanceof HTMLButtonElement && !button.disabled,
      hasDirectory: Boolean(panel?.querySelector('[data-technique-aggregation-directory="true"]')),
      overflow: panel instanceof HTMLElement && panel.scrollWidth > panel.clientWidth + 1,
    };
  })()
`;

const openPermissionsExpression = String.raw`
  (() => {
    document.querySelector('[data-primary-tab="permissions"]')?.click();
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    const permissions = panel?.querySelector('[data-technique-aggregation-permissions="true"]');
    const revisionTab = panel?.querySelector('[data-permission-scope="revision"]');
    if (!(permissions instanceof HTMLElement) || !(revisionTab instanceof HTMLButtonElement)) {
      throw new Error('统法台权限页结构不完整');
    }
    const permissionIdentity = permissions;
    revisionTab.click();
    const optionRects = Array.from(permissions.querySelectorAll('.technique-aggregation-policy-option'))
      .map((entry) => entry.getBoundingClientRect());
    const tabRects = Array.from(permissions.querySelectorAll('.technique-aggregation-permission-tab'))
      .map((entry) => entry.getBoundingClientRect());
    return {
      activeMainTab: panel?.querySelector('.technique-aggregation-primary-tab.is-active')?.textContent?.trim() ?? '',
      permissionIdentityPreserved: panel?.querySelector('[data-technique-aggregation-permissions="true"]') === permissionIdentity,
      permissionTabLabels: Array.from(permissions.querySelectorAll('.technique-aggregation-permission-tab'))
        .map((entry) => entry.textContent?.trim() ?? ''),
      activePermissionTab: permissions.querySelector('.technique-aggregation-permission-tab.is-active')?.textContent?.trim() ?? '',
      permissionEditorText: permissions.querySelector('[data-technique-aggregation-permission-editor="true"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      checkedRevisionRoles: Array.from(permissions.querySelectorAll('[data-technique-aggregation-permission-sect-role]:checked'))
        .map((entry) => entry.dataset.techniqueAggregationPermissionSectRole),
      minPolicyOptionHeight: optionRects.length > 0 ? Math.min(...optionRects.map((rect) => rect.height)) : 0,
      minPermissionTabHeight: tabRects.length > 0 ? Math.min(...tabRects.map((rect) => rect.height)) : 0,
      hasDirectory: Boolean(panel?.querySelector('[data-technique-aggregation-directory="true"]')),
      hasJadeRecord: Boolean(panel?.querySelector('.technique-aggregation-jade-record')),
    };
  })()
`;

const openOverviewExpression = String.raw`
  (() => {
    document.querySelector('[data-primary-tab="overview"]')?.click();
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    return {
      activeMainTab: panel?.querySelector('.technique-aggregation-primary-tab.is-active')?.textContent?.trim() ?? '',
      overviewText: panel?.querySelector('.technique-aggregation-tab-content')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      metricCount: panel?.querySelectorAll('.technique-aggregation-overview-metrics > span').length ?? 0,
      hasRecordTabs: Boolean(panel?.querySelector('.technique-aggregation-record-tabs')),
      hasPermissions: Boolean(panel?.querySelector('[data-technique-aggregation-permissions="true"]')),
    };
  })()
`;

const restrictTabsExpression = String.raw`
  (() => {
    const modal = window.__techniqueUnificationProofModal;
    const buildPanel = window.__techniqueUnificationBuildPanel;
    modal.handleTechniqueAggregationPanel(buildPanel({ bound: true, isOwner: false, canRevise: false }));
    const panel = document.querySelector('[data-technique-aggregation-panel="true"]');
    return {
      labels: Array.from(panel?.querySelectorAll('.technique-aggregation-primary-tab') ?? [])
        .map((entry) => entry.textContent?.trim() ?? ''),
      active: panel?.querySelector('.technique-aggregation-primary-tab.is-active')?.textContent?.trim() ?? '',
      hasRecordTabs: Boolean(panel?.querySelector('.technique-aggregation-record-tabs')),
      hasPermissions: Boolean(panel?.querySelector('[data-technique-aggregation-permissions="true"]')),
    };
  })()
`;

function assertShell(measurement, label) {
  assert(measurement.cardTop >= 0, `${label}弹层顶部越出视口：${JSON.stringify(measurement)}`);
  assert(measurement.cardBottom <= measurement.viewportHeight, `${label}弹层底部越出视口：${JSON.stringify(measurement)}`);
  assert.match(measurement.cardClass, /detail-modal--technique-unification/, `${label}未应用统法台弹层变体`);
  assert.match(measurement.bodyOverflowY, /auto|scroll/, `${label}正文没有纵向滚动路径`);
  assert(measurement.minMainTabHeight >= 43.5, `${label}主 Tab 触控高度不足 44px`);
  assert.deepEqual(measurement.overflowNodes, [], `${label}出现横向溢出：${JSON.stringify(measurement.overflowNodes)}`);
}

function assertSourceLayout(measurement, label) {
  assert(measurement.bodyScrollHeight > measurement.bodyClientHeight, `${label}法卷目录没有形成纵向滚动范围`);
  assert.equal(measurement.listOverflowY, 'visible', `${label}法卷目录不应形成嵌套滚动`);
  assert(measurement.listScrollHeight <= measurement.listClientHeight + 1, `${label}法卷目录仍存在内部滚动范围`);
  assert(measurement.sourceCount > 0 && measurement.sourceCount <= 12, `${label}单页法卷数量超出 12 条`);
  assert.equal(measurement.inventoryCardCount, measurement.sourceCount, `${label}法卷未全部使用背包式卡格`);
  assert.equal(measurement.sourceGridColumns, 2, `${label}手机端法卷目录未保持双列`);
  assert(measurement.minSourceHeight >= 111.5, `${label}法卷卡高度不足`);
  assert(measurement.maxSourceHeight - measurement.minSourceHeight <= 1, `${label}同页法卷卡高度不稳定`);
  assert(measurement.maxSourceWidth <= 180, `${label}少量法卷被横向拉伸过宽`);
  assert(Math.abs(measurement.strengthLeftOffset - 4) <= 2, `${label}强度未贴合法卷左下角`);
  assert(Math.abs(measurement.strengthBottomOffset - 3) <= 2, `${label}强度未贴合法卷左下角`);
  assert.equal(measurement.hasPermissions, false, `${label}录法页混入权限编辑器`);
  assert.deepEqual(measurement.overflowNodes, [], `${label}出现横向溢出：${JSON.stringify(measurement.overflowNodes)}`);
}

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'technique-unification-mobile-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(initializeExpression), '统法台', '未打开正式统法台弹层');

  const initial = await cdp.evaluate(measureShellExpression);
  assertShell(initial, '标准手机视口');
  assert.deepEqual(initial.mainTabLabels, ['总览', '录法', '权限'], '建造者主 Tab 不完整');
  assert.equal(initial.activeMainTab, '总览', '默认未打开总览');
  assert.equal(initial.hasDirectory, false, '总览页混入法卷目录');
  assert.equal(initial.hasPermissions, false, '总览页混入权限编辑器');
  assert.equal(initial.hasRecordTabs, false, '总览页混入录法方式');
  assert.match(initial.overviewText, /此台尚未立脉/, '未绑定总览文案错误');

  assert.deepEqual(
    await cdp.evaluate(openSourceRecordExpression),
    ['录入自有功法', '融入悟道玉简'],
    '录法方式 Tab 不完整',
  );
  const sourceInitial = await cdp.evaluate(measureSourceExpression);
  assertSourceLayout(sourceInitial, '标准手机视口');
  assert.equal(sourceInitial.sourceCount, 12, '首页未限制为 12 部法卷');
  assert.equal(sourceInitial.firstStrength, '强度 80%', '未显示服务端权威功法强度');
  assert.equal(sourceInitial.gradeOptionCount, 2, '品阶过滤项不完整');
  assert.equal(sourceInitial.realmOptionCount, 3, '境界过滤项不完整');
  assert.match(sourceInitial.pageText, /第 1 \/ 3 页 · 1-12 \/ 28/, '首页分页摘要错误');
  assert.equal(sourceInitial.activeRecordTab, '录入自有功法', '默认未打开自有功法录法');

  const interaction = await cdp.evaluate(sourceInteractionExpression);
  assert.equal(interaction.directoryIdentityPreserved, true, '筛选或分页时替换了法卷目录根节点');
  assert.equal(interaction.nameIdentityPreserved, true, '筛选或分页时替换了法脉名输入框');
  assert.equal(interaction.nameValue, '太玄归一真经', '筛选或分页后丢失法脉名草稿');
  assert.equal(interaction.borderChanged, true, '选中法卷未通过边框呈现');
  assert.equal(interaction.backgroundColorPreserved, true, '选中法卷不应改变底色');
  assert.equal(interaction.backgroundImagePreserved, true, '选中法卷不应改变品阶底纹');
  assert.doesNotMatch(interaction.selectedCardText, /已选|可选/, '选中状态仍使用文字标记');
  assert.equal(interaction.realmFilteredCount, 12, '境界过滤结果数量错误');
  assert.match(interaction.realmPageText, /第 1 \/ 1 页 · 1-12 \/ 12/, '境界过滤后的分页摘要错误');
  assert.equal(interaction.realmStrength, '强度 96%', '境界过滤后强度显示错误');
  assert.equal(interaction.firstPageSelected, 12, '全选后当前页未全部呈现选中边框');
  assert.match(interaction.selectedSummary, /已择 28 部/, '全选未覆盖当前筛选的全部分页');
  assert.equal(interaction.secondPageSelected, 12, '翻页后跨页全选状态未保留');
  assert.match(interaction.secondPageText, /第 2 \/ 3 页 · 13-24 \/ 28/, '下一页分页摘要错误');
  assert.equal(interaction.selectedAfterClear, 0, '全部取消后仍残留选中法卷');
  assert.equal(interaction.gradeValue, 'yellow', '品阶过滤未切换到黄阶');
  assert.equal(interaction.sparseCount, 2, '黄阶少量法卷筛选结果错误');
  assert(interaction.maxSparseWidth <= 180, '只有两部法卷时卡格被拉伸过宽');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: SHORT_VIEWPORT.width,
    height: SHORT_VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: SHORT_VIEWPORT.width,
    screenHeight: SHORT_VIEWPORT.height,
  });
  await delay(80);
  assertShell(await cdp.evaluate(measureShellExpression), '短屏手机视口');
  assertSourceLayout(await cdp.evaluate(measureSourceExpression), '短屏手机视口');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(80);
  assertShell(await cdp.evaluate(measureShellExpression), '短屏深色模式');
  assertSourceLayout(await cdp.evaluate(measureSourceExpression), '短屏深色模式');

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: VIEWPORT.width,
    screenHeight: VIEWPORT.height,
  });
  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'light'`);
  await delay(80);

  const jade = await cdp.evaluate(openBoundJadeExpression);
  assert.equal(jade.activeMainTab, '录法', '绑定法脉后未停留在录法页');
  assert.equal(jade.activeRecordTab, '融入悟道玉简', '未切换到悟道玉简录法');
  assert.equal(jade.jadeMetricCount, 4, '悟道玉简录法摘要不完整');
  assert.match(jade.jadeText, /现有玉简3 枚/, '悟道玉简数量显示错误');
  assert.match(jade.jadeText, /道韵强度80%-120%/, '悟道玉简强度范围显示错误');
  assert.deepEqual(jade.balanceLabels, ['五行无偏', '六维均衡', '不另立功法'], '悟道玉简均衡规则文案不完整');
  assert.equal(jade.recordButtonEnabled, true, '持有悟道玉简时录法按钮不可用');
  assert.equal(jade.hasDirectory, false, '悟道玉简录法页混入自有功法目录');
  assert.equal(jade.overflow, false, '悟道玉简录法页出现横向溢出');

  const permissions = await cdp.evaluate(openPermissionsExpression);
  assert.equal(permissions.activeMainTab, '权限', '未切换到权限页');
  assert.equal(permissions.permissionIdentityPreserved, true, '切换权限组时替换了权限根节点');
  assert.deepEqual(permissions.permissionTabLabels, ['参阅权限', '修订权限'], '权限组 Tab 不完整');
  assert.equal(permissions.activePermissionTab, '修订权限', '修订权限 Tab 未切换');
  assert.match(permissions.permissionEditorText, /所有修士均可修订/, '修订权限编辑器文案错误');
  assert.deepEqual(permissions.checkedRevisionRoles, ['inner'], '修订权限草稿未独立保留');
  assert(permissions.minPolicyOptionHeight >= 39.5, '权限选项触控高度不足 40px');
  assert(permissions.minPermissionTabHeight >= 41.5, '权限 Tab 触控高度不足 42px');
  assert.equal(permissions.hasDirectory, false, '权限页混入法卷目录');
  assert.equal(permissions.hasJadeRecord, false, '权限页混入悟道玉简录法');

  const overview = await cdp.evaluate(openOverviewExpression);
  assert.equal(overview.activeMainTab, '总览', '未切回总览页');
  assert.equal(overview.metricCount, 3, '已绑定总览指标不完整');
  assert.match(overview.overviewText, /源法2 部/, '总览未显示源法数量');
  assert.match(overview.overviewText, /玉简道韵2 道/, '总览未显示玉简道韵数量');
  assert.equal(overview.hasRecordTabs, false, '总览页混入录法方式');
  assert.equal(overview.hasPermissions, false, '总览页混入权限编辑器');

  const restricted = await cdp.evaluate(restrictTabsExpression);
  assert.deepEqual(restricted.labels, ['总览'], '普通参阅者仍可看到录法或权限 Tab');
  assert.equal(restricted.active, '总览', '权限收窄后未回退总览');
  assert.equal(restricted.hasRecordTabs, false, '普通参阅者仍可进入录法页');
  assert.equal(restricted.hasPermissions, false, '非建造者仍可进入权限页');
});

console.log('technique unification mobile proof passed');
