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
    options.showToast('身未安定，暂不可跨界。', 'warn');
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
    hint: '切入他道后，随其之道。',
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
  current.textContent = currentPreset === 'real' ? '身在现世，往后跨界皆入现世。' : '身在虚境，往后跨界皆入虚境。';
  wrapper.append(current);

  const intro = document.createElement('p');
  intro.textContent =
    currentPreset === 'real'
      ? '你当前在现世，欲循虚境则入虚境线。'
      : '你当前在虚境，欲归现世则循现世线。';
  wrapper.append(intro);

  const tip = document.createElement('p');
  tip.className = 'detail-hint';
  tip.textContent = '虚境禁斗法，现世可争锋。选中后尚需再度确认。';
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
      ? '现世可争锋破地，切换后入当前地图现世道。'
      : '虚境禁争伐，切换后入当前地图虚境道。';

  const meta = document.createElement('span');
  meta.className = 'world-migration-choice-meta';
  meta.textContent = targetPreset === 'real' ? '现世 · 可争锋 · 可破地' : '虚境 · 禁争伐 · 禁破地';

  button.append(head, desc, meta);
  button.addEventListener('click', () => {
    const player = options.getPlayer();
    if (!player) {
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      options.showToast('身未安定，暂不可跨界。', 'warn');
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
      ? '确认后入现世，再通过传送点跨界亦循现世。'
      : '确认后入虚境，再通过传送点跨界亦循虚境。';

  const warning = document.createElement('div');
  warning.className = 'world-migration-popup-note';
  warning.textContent =
    targetPreset === 'peaceful'
      ? '若身染煞气入体或反噬，则无法返归虚境。'
      : '入现世后，此后跨界皆循此道。';

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
