import type { PlayerState } from '@mud/shared';

import type { ToastKind } from '../main-app-assembly-types';
import { detailModalHost } from './detail-modal-host';
import { t } from './i18n';

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
    options.showToast(t('world-migration.toast.not-ready'), 'warn');
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
    title: t('world-migration.modal.title'),
    size: 'sm' as const,
    subtitle: t('world-migration.modal.subtitle', { world: currentPreset === 'real' ? t('world-migration.line.real') : t('world-migration.line.peaceful') }),
    hint: t('world-migration.modal.hint'),
    renderBody: (body: HTMLElement) => {
      body.replaceChildren(createWorldMigrationShell(currentPreset, pendingTargetPreset));
    },
    onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
      bindWorldMigrationActions(body, signal, options);
    },
  };
  if (!detailModalHost.patch({ ...modalOptions })) {
    detailModalHost.open(modalOptions);
  }
}

function createWorldMigrationShell(
  currentPreset: WorldMigrationLinePreset,
  pendingTargetPreset: WorldMigrationLinePreset | null,
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'world-migration-shell';
  shell.append(
    createWorldMigrationIntro(currentPreset),
    createWorldMigrationChoices(currentPreset),
  );
  if (pendingTargetPreset) {
    shell.append(createWorldMigrationConfirmOverlay(pendingTargetPreset));
  }
  return shell;
}

function createWorldMigrationIntro(currentPreset: WorldMigrationLinePreset): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'world-migration-intro';

  const current = document.createElement('div');
  current.className = 'world-migration-current';
  current.textContent = currentPreset === 'real' ? t('world.migration.current-real') : t('world.migration.current-peaceful');
  wrapper.append(current);

  const intro = document.createElement('p');
  intro.textContent =
    currentPreset === 'real'
      ? t('world.migration.intro-real')
      : t('world.migration.intro-peaceful');
  wrapper.append(intro);

  const tip = document.createElement('p');
  tip.className = 'detail-hint';
  tip.textContent = t('world.migration.tip');
  wrapper.append(tip);

  return wrapper;
}

function createWorldMigrationChoices(
  currentPreset: WorldMigrationLinePreset,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'world-migration-choice-grid';

  grid.append(
    createWorldMigrationButton(currentPreset, 'peaceful'),
    createWorldMigrationButton(currentPreset, 'real'),
  );
  return grid;
}

function createWorldMigrationButton(
  currentPreset: WorldMigrationLinePreset,
  targetPreset: WorldMigrationLinePreset,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `world-migration-choice ${currentPreset === targetPreset ? 'active' : ''}`.trim();
  button.dataset.worldMigrationTarget = targetPreset;

  const title = document.createElement('span');
  title.className = 'world-migration-choice-title';
  title.textContent = targetPreset === 'real' ? t('world.migration.choice-title.real') : t('world.migration.choice-title.peaceful');

  const badge = document.createElement('span');
  badge.className = 'world-migration-choice-badge';
  badge.textContent = currentPreset === targetPreset ? t('world.migration.badge-current') : t('world.migration.badge-available');

  const head = document.createElement('span');
  head.className = 'world-migration-choice-head';
  head.append(title, badge);

  const desc = document.createElement('span');
  desc.className = 'world-migration-choice-desc';
  desc.textContent =
    targetPreset === 'real'
      ? t('world.migration.desc-real')
      : t('world.migration.desc-peaceful');

  const meta = document.createElement('span');
  meta.className = 'world-migration-choice-meta';
  meta.textContent = targetPreset === 'real' ? t('world.migration.meta-real') : t('world.migration.meta-peaceful');

  button.append(head, desc, meta);
  return button;
}

function createWorldMigrationConfirmOverlay(
  targetPreset: WorldMigrationLinePreset,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'world-migration-popup-overlay';
  overlay.dataset.worldMigrationOverlay = 'true';

  const popup = document.createElement('section');
  popup.className = 'world-migration-popup';

  const title = document.createElement('div');
  title.className = 'world-migration-popup-title';
  title.textContent = t('world.migration.confirm-title', { target: targetPreset === 'real' ? t('world.migration.choice-title.real') : t('world.migration.choice-title.peaceful') });

  const desc = document.createElement('div');
  desc.className = 'world-migration-popup-desc';
  desc.textContent =
    targetPreset === 'real'
      ? t('world.migration.confirm-desc-real')
      : t('world.migration.confirm-desc-peaceful');

  const warning = document.createElement('div');
  warning.className = 'world-migration-popup-note';
  warning.textContent =
    targetPreset === 'peaceful'
      ? t('world.migration.warning-peaceful')
      : t('world.migration.warning-real');

  const actions = document.createElement('div');
  actions.className = 'ui-modal-footer-actions world-migration-popup-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'small-btn ghost';
  cancelButton.textContent = t('world.migration.cancel');
  cancelButton.dataset.worldMigrationAction = 'cancel';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'small-btn';
  confirmButton.textContent = t('world.migration.confirm-title', { target: targetPreset === 'real' ? t('world.migration.choice-title.real') : t('world.migration.choice-title.peaceful') });
  confirmButton.dataset.worldMigrationAction = 'confirm';
  confirmButton.dataset.worldMigrationTarget = targetPreset;

  actions.append(cancelButton, confirmButton);
  popup.append(title, desc, warning, actions);
  overlay.append(popup);
  return overlay;
}

function bindWorldMigrationActions(
  body: HTMLElement,
  signal: AbortSignal,
  options: OpenWorldMigrationModalOptions,
): void {
  body.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest<HTMLElement>('[data-world-migration-action]');
    const choiceButton = target.closest<HTMLElement>('[data-world-migration-target]');
    const overlay = target.closest<HTMLElement>('[data-world-migration-overlay="true"]');

    if (actionButton?.dataset.worldMigrationAction === 'cancel' || target === overlay) {
      event.preventDefault();
      closeWorldMigrationConfirm(options);
      return;
    }

    if (actionButton?.dataset.worldMigrationAction === 'confirm') {
      const targetPreset = parseWorldMigrationLinePreset(actionButton.dataset.worldMigrationTarget);
      if (!targetPreset) {
        return;
      }
      event.preventDefault();
      detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
      options.sendAction('world:migrate', targetPreset);
      return;
    }

    const targetPreset = parseWorldMigrationLinePreset(choiceButton?.dataset.worldMigrationTarget);
    if (!targetPreset) {
      return;
    }
    event.preventDefault();
    openWorldMigrationConfirm(options, targetPreset);
  }, { signal });
}

function openWorldMigrationConfirm(
  options: OpenWorldMigrationModalOptions,
  targetPreset: WorldMigrationLinePreset,
): void {
  const player = options.getPlayer();
  if (!player) {
    detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
    options.showToast(t('world-migration.toast.not-ready'), 'warn');
    return;
  }
  const livePreset = resolveCurrentWorldLinePreset(player.instanceId);
  if (livePreset === targetPreset) {
    detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
    options.showToast(
      targetPreset === 'real' ? t('world.migration.already-real') : t('world.migration.already-peaceful'),
      'travel',
    );
    return;
  }
  renderWorldMigrationModal(options, player, targetPreset);
}

function closeWorldMigrationConfirm(options: OpenWorldMigrationModalOptions): void {
  const player = options.getPlayer();
  if (!player) {
    detailModalHost.close(WORLD_MIGRATION_MODAL_OWNER);
    return;
  }
  renderWorldMigrationModal(options, player, null);
}

function parseWorldMigrationLinePreset(value: string | undefined): WorldMigrationLinePreset | null {
  if (value === 'peaceful' || value === 'real') {
    return value;
  }
  return null;
}

function resolveCurrentWorldLinePreset(instanceId: string | undefined): WorldMigrationLinePreset {
  const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
  if (normalized.startsWith('real:') || normalized.includes(':real:')) {
    return 'real';
  }
  return 'peaceful';
}
