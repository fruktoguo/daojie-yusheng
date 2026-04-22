import type { PlayerState } from '@mud/shared';

import type { ToastKind } from '../main-app-assembly-types';
import { detailModalHost } from './detail-modal-host';

type WorldMigrationLinePreset = 'peaceful' | 'real';

type OpenWorldMigrationModalOptions = {
  getPlayer: () => PlayerState | null;
  sendAction: (actionId: string, target?: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
};

const WORLD_MIGRATION_MODAL_OWNER = 'world:migration';
const WORLD_MIGRATION_VARIANT_CLASS = 'detail-modal--world-migration';

export function openWorldMigrationModal(options: OpenWorldMigrationModalOptions): void {
  const player = options.getPlayer();
  if (!player) {
    options.showToast('当前角色尚未完成同步，暂时无法切换世界。', 'warn');
    return;
  }
  renderWorldMigrationModal(options, player, null);
}

function renderWorldMigrationModal(
  options: OpenWorldMigrationModalOptions,
  player: PlayerState,
  pendingTargetPreset: WorldMigrationLinePreset | null,
): void {
  const currentPreset = resolveCurrentWorldLinePreset(player.instanceId);
  const modalOptions = {
    ownerId: WORLD_MIGRATION_MODAL_OWNER,
    variantClass: WORLD_MIGRATION_VARIANT_CLASS,
    title: '世界迁移',
    size: 'sm' as const,
    subtitle: `当前世界：${currentPreset === 'real' ? '现世' : '虚境'}`,
    hint: '切换后会立即迁移到当前地图对应分线，并作为后续跨图默认世界。',
    renderBody: (body: HTMLElement) => {
      body.replaceChildren(
        createWorldMigrationShell(options, currentPreset, pendingTargetPreset),
      );
    },
  };
  if (!detailModalHost.patch({ ...modalOptions })) {
    detailModalHost.open(modalOptions);
  }
}

function createWorldMigrationShell(
  options: OpenWorldMigrationModalOptions,
  currentPreset: WorldMigrationLinePreset,
  pendingTargetPreset: WorldMigrationLinePreset | null,
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'world-migration-shell';
  shell.append(
    createWorldMigrationIntro(currentPreset),
    createWorldMigrationChoices(options, currentPreset),
  );
  if (pendingTargetPreset) {
    shell.append(createWorldMigrationConfirmOverlay(options, pendingTargetPreset));
  }
  return shell;
}

function createWorldMigrationIntro(currentPreset: WorldMigrationLinePreset): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'world-migration-intro';

  const current = document.createElement('div');
  current.className = 'world-migration-current';
  current.textContent = currentPreset === 'real' ? '当前处于现世，后续跨图会默认进入现世线。' : '当前处于虚境，后续跨图会默认进入虚境线。';
  wrapper.append(current);

  const intro = document.createElement('p');
  intro.textContent =
    currentPreset === 'real'
      ? '你当前位于现世。切回虚境会回到虚境线，并把后续跨图默认世界改为虚境。'
      : '你当前位于虚境。切入现世会回到现世线，并把后续跨图默认世界改为现世。';
  wrapper.append(intro);

  const tip = document.createElement('p');
  tip.className = 'detail-hint';
  tip.textContent = '虚境为和平世界，现世为 PVP 世界。点击下方选项后还会再做一次确认。';
  wrapper.append(tip);

  return wrapper;
}

function createWorldMigrationChoices(
  options: OpenWorldMigrationModalOptions,
  currentPreset: WorldMigrationLinePreset,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'world-migration-choice-grid';

  grid.append(
    createWorldMigrationButton(options, currentPreset, 'peaceful'),
    createWorldMigrationButton(options, currentPreset, 'real'),
  );
  return grid;
}

function createWorldMigrationButton(
  options: OpenWorldMigrationModalOptions,
  currentPreset: WorldMigrationLinePreset,
  targetPreset: WorldMigrationLinePreset,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `world-migration-choice ${currentPreset === targetPreset ? 'active' : ''}`.trim();

  const title = document.createElement('span');
  title.className = 'world-migration-choice-title';
  title.textContent = targetPreset === 'real' ? '现世' : '虚境';

  const badge = document.createElement('span');
  badge.className = 'world-migration-choice-badge';
  badge.textContent = currentPreset === targetPreset ? '当前世界' : '可切换';

  const head = document.createElement('span');
  head.className = 'world-migration-choice-head';
  head.append(title, badge);

  const desc = document.createElement('span');
  desc.className = 'world-migration-choice-desc';
  desc.textContent =
    targetPreset === 'real'
      ? '现世允许 PVP 与地块攻击，切换后会立刻进入当前地图的现世线。'
      : '虚境为和平世界，切换后会立刻进入当前地图的虚境线，并作为默认跨图世界。';

  const meta = document.createElement('span');
  meta.className = 'world-migration-choice-meta';
  meta.textContent = targetPreset === 'real' ? '现世线 / PVP / 可打地块' : '虚境线 / 禁 PVP / 禁地块攻击';

  button.append(head, desc, meta);
  button.addEventListener('click', () => {
    const player = options.getPlayer();
    if (!player) {
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      options.showToast('当前角色尚未完成同步，暂时无法切换世界。', 'warn');
      return;
    }
    const livePreset = resolveCurrentWorldLinePreset(player.instanceId);
    if (livePreset === targetPreset) {
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      options.showToast(
        targetPreset === 'real' ? '当前已经位于现世。' : '当前已经位于虚境。',
        'travel',
      );
      return;
    }
    renderWorldMigrationModal(options, player, targetPreset);
  });
  return button;
}

function createWorldMigrationConfirmOverlay(
  options: OpenWorldMigrationModalOptions,
  targetPreset: WorldMigrationLinePreset,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'world-migration-popup-overlay';
  overlay.addEventListener('click', () => {
    const player = options.getPlayer();
    if (!player) {
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      return;
    }
    renderWorldMigrationModal(options, player, null);
  });

  const popup = document.createElement('section');
  popup.className = 'world-migration-popup';
  popup.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const title = document.createElement('div');
  title.className = 'world-migration-popup-title';
  title.textContent = `确认切换到${targetPreset === 'real' ? '现世' : '虚境'}`;

  const desc = document.createElement('div');
  desc.className = 'world-migration-popup-desc';
  desc.textContent =
    targetPreset === 'real'
      ? '确认后会立刻迁入当前地图的现世线，后续通过传送点跨图时也会继续进入现世。'
      : '确认后会立刻迁入当前地图的虚境线，后续通过传送点跨图时也会继续进入虚境。';

  const warning = document.createElement('div');
  warning.className = 'world-migration-popup-note';
  warning.textContent =
    targetPreset === 'peaceful'
      ? '若角色身上带有煞气入体或煞气反噬，服务端会拒绝迁回虚境。'
      : '切入现世后，当前地图与后续跨图都会优先进入现世线。';

  const actions = document.createElement('div');
  actions.className = 'ui-modal-footer-actions world-migration-popup-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'small-btn ghost';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', () => {
    const player = options.getPlayer();
    if (!player) {
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      return;
    }
    renderWorldMigrationModal(options, player, null);
  });

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'small-btn';
  confirmButton.textContent = `确认切换到${targetPreset === 'real' ? '现世' : '虚境'}`;
  confirmButton.addEventListener('click', () => {
    detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
    options.sendAction('world:migrate', targetPreset);
  });

  actions.append(cancelButton, confirmButton);
  popup.append(title, desc, warning, actions);
  overlay.append(popup);
  return overlay;
}

function resolveCurrentWorldLinePreset(instanceId: string | undefined): WorldMigrationLinePreset {
  const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
  if (normalized.startsWith('real:') || normalized.includes(':real:')) {
    return 'real';
  }
  return 'peaceful';
}
