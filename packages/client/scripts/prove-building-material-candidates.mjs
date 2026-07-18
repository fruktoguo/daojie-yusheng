/**
 * ISSUE-000016：通过正式营造工具栏验证合法背包材料不会被偏好项隐藏，并随 revision 刷新。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000016:PASS';
const VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    document.getElementById('login-overlay')?.classList.add('hidden');
    document.getElementById('game-shell')?.classList.remove('hidden');
    const { createMainBuildingFengShuiStateSource } = await import('/src/main-building-fengshui-state-source.ts');
    const player = {
      playerId: 'p_build_material_proof',
      mapId: 'proof-map',
      x: 0,
      y: 0,
      buildingSkill: { level: 1 },
      inventory: {
        revision: 1,
        capacity: 200,
        items: [
          {
            itemId: 'black_iron_chunk',
            itemInstanceId: 'proof-black-iron',
            name: '玄铁矿块',
            type: 'material',
            count: 3,
            materialCategory: 'ore',
            tags: ['石材', '金属', '矿石', '矿材'],
          },
          {
            itemId: 'cleft_iron_fragment',
            itemInstanceId: 'proof-cleft-iron',
            name: '残兵铁片',
            type: 'material',
            count: 2,
            materialCategory: 'ore',
            tags: ['石材', '金属', '矿石', '矿材'],
          },
        ],
      },
    };
    const source = createMainBuildingFengShuiStateSource({
      socket: {
        sendBuildPlaceIntent() {},
        sendBuildDeconstruct() {},
        sendRoomSetRole() {},
        sendFengShuiObserve() {},
      },
      setFengShuiOverlay() {},
      setBuildPreviewOverlay() {},
      getPlayer: () => player,
      getVisibleTileAt: () => ({}),
      showToast() {},
      beginTargeting() {},
      cancelTargeting() {},
      getInfoRadius: () => 8,
      sidePanel: {
        getLayoutCollapseState: () => ({ leftCollapsed: false, rightCollapsed: false, bottomCollapsed: false }),
        setLayoutCollapseState() {},
        setBuildingModeActive() {},
        isMobileLayoutActive: () => true,
      },
    });
    source.openBuildingPanel();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__buildingMaterialProof = { source, player };
    return true;
  })()
`;

const measureExpression = String.raw`
  (() => {
    const toolbar = document.getElementById('building-mode-toolbar');
    const content = toolbar?.querySelector('.building-mode-content');
    const cards = [...(toolbar?.querySelectorAll('.building-mode-material-card') ?? [])];
    if (!(toolbar instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error('营造工具栏未按正式路径打开');
    }
    return {
      visible: !toolbar.classList.contains('hidden'),
      contentOverflowY: getComputedStyle(content).overflowY,
      strengthValue: toolbar.querySelector('[data-action="build-strength"]')?.value ?? '',
      strengthFocused: document.activeElement === toolbar.querySelector('[data-action="build-strength"]'),
      cards: cards.map((card) => ({
        itemId: card.dataset.itemId ?? '',
        name: card.querySelector('.building-mode-material-card-name')?.textContent?.trim() ?? '',
        active: card.classList.contains('active'),
        disabled: card.disabled,
        stableProof: card.dataset.proofStable ?? '',
        textFits: card.querySelector('.building-mode-material-card-name') instanceof HTMLElement
          ? card.querySelector('.building-mode-material-card-name').scrollWidth <= card.querySelector('.building-mode-material-card-name').clientWidth + 1
          : false,
      })),
    };
  })()
`;

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'building-material-proof-' }, async (cdp) => {
  assert.equal(await cdp.evaluate(fixtureExpression), true, '未能建立正式营造面板 fixture');
  const initial = await cdp.evaluate(measureExpression);
  assert.equal(initial.visible, true, '手机端营造工具栏不可见');
  assert.equal(initial.contentOverflowY, 'auto', '手机端营造内容没有纵向滚动路径');
  assert.deepEqual(
    initial.cards.map((card) => card.itemId),
    ['black_iron_chunk', 'cleft_iron_fragment'],
    '玄铁偏好不应隐藏其他合法石材候选',
  );
  assert(initial.cards.every((card) => !card.disabled && card.textFits), '合法材料卡片不可用或名称溢出');

  const prepared = await cdp.evaluate(`
    (() => {
      document.querySelector('[data-item-id="black_iron_chunk"]').dataset.proofStable = 'kept';
      const strengthInput = document.querySelector('[data-action="build-strength"]');
      strengthInput.value = '77';
      strengthInput.focus({ preventScroll: true });
      return {
        focused: document.activeElement === strengthInput,
        value: strengthInput.value,
      };
    })()
  `);
  assert.equal(prepared.focused, true, '浏览器 fixture 未能聚焦建造强度输入');
  assert.equal(prepared.value, '77', '浏览器 fixture 未能建立未提交建造强度');

  await cdp.evaluate(`
    (() => {
      const proof = window.__buildingMaterialProof;
      proof.player.inventory = {
        ...proof.player.inventory,
        revision: 2,
        items: [...proof.player.inventory.items, {
          itemId: 'earthbearing_stone',
          itemInstanceId: 'proof-earthbearing-stone',
          name: '承脉石',
          type: 'material',
          count: 4,
          materialCategory: 'ore',
          tags: ['石材', '矿石', '矿材'],
        }],
      };
    })()
  `);
  await delay(100);
  const refreshed = await cdp.evaluate(measureExpression);
  assert.deepEqual(
    refreshed.cards.map((card) => card.itemId),
    ['black_iron_chunk', 'earthbearing_stone', 'cleft_iron_fragment'],
    '背包 revision 推进后新增合法材料未刷新到营造面板',
  );
  assert.equal(refreshed.cards.find((card) => card.itemId === 'black_iron_chunk')?.stableProof, 'kept', '背包变化重建了已有材料卡片');
  assert.equal(refreshed.strengthValue, '77', '材料刷新覆盖了正在编辑的建造强度');
  assert.equal(refreshed.strengthFocused, true, '材料刷新打断了建造强度输入焦点');

  await cdp.evaluate(`document.querySelector('[data-item-id="cleft_iron_fragment"]').click()`);
  await delay(50);
  const selected = await cdp.evaluate(measureExpression);
  assert.equal(selected.cards.find((card) => card.itemId === 'cleft_iron_fragment')?.active, true, '手机端无法切换其他合法材料');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  const dark = await cdp.evaluate(measureExpression);
  assert.equal(dark.cards.length, 3, '深色模式切换后营造材料候选丢失');
  await cdp.evaluate(`window.__buildingMaterialProof.source.clear()`);
});

console.log(MARKER);
