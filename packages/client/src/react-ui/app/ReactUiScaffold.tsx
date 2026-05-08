import { UiButton } from '../primitives/UiButton';
import { UiEmptyHint } from '../primitives/UiEmptyHint';
import { UiPill } from '../primitives/UiPill';
import { UiSection } from '../primitives/UiSection';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import {
  closeDetailModal,
  hideTooltip,
  moveTooltip,
  openDetailModal,
  showToast,
  showTooltip,
} from '../overlays/overlay-store';
import { panelDataStore } from '../stores/panel-data-store';
import { shellStore } from '../stores/shell-store';
import { t } from '../../ui/i18n';
/**
 * ReactUiScaffold：判断ReactUiScaffold是否满足条件。
 * @returns 无返回值，直接更新ReactUiScaffold相关状态。
 */


export function ReactUiScaffold() {
  const shellState = useExternalStoreSnapshot(shellStore);
  const panelState = useExternalStoreSnapshot(panelDataStore);
  const player = panelState.player;

  return (
    <div className="react-ui-scaffold">
      <UiSection
        title={t('react.prototype.scaffold.title', undefined)}
        subtitle={t('react.prototype.scaffold.subtitle', undefined)}
        actions={<UiPill tone={shellState.runtime.connected ? 'accent' : 'default'}>{t(shellState.runtime.connected ? 'react.prototype.status.online' : 'react.prototype.status.offline')}</UiPill>}
        className="react-ui-scaffold-card"
      >
        <div className="react-ui-scaffold-grid">
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.character', undefined)}</span>
            <span className="react-ui-scaffold-value">{player?.name ?? t('react.prototype.value.not-login', undefined)}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.map', undefined)}</span>
            <span className="react-ui-scaffold-value">{shellState.runtime.mapId ?? t('react.prototype.value.unknown', undefined)}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.inventory', undefined)}</span>
            <span className="react-ui-scaffold-value">{t('react.prototype.count.items', { count: panelState.inventory?.items.length ?? 0 })}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.technique', undefined)}</span>
            <span className="react-ui-scaffold-value">{t('react.prototype.count.items', { count: panelState.techniques.length })}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.action', undefined)}</span>
            <span className="react-ui-scaffold-value">{t('react.prototype.count.items', { count: panelState.actions.length })}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">{t('react.prototype.field.quest', undefined)}</span>
            <span className="react-ui-scaffold-value">{t('react.prototype.count.items', { count: panelState.quests?.length ?? 0 })}</span>
          </div>
        </div>
        <div className="react-ui-scaffold-actions">
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              showToast(t('react.prototype.toast.host-ready', undefined), 'success');
            }}
          >
            {t('react.prototype.action.test-toast', undefined)}
          </UiButton>
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              openDetailModal({
                title: t('react.prototype.detail.title', undefined),
                subtitle: t('react.prototype.detail.subtitle', undefined),
                body: (
                  <div className="react-ui-detail-preview">
                    {t('react.prototype.detail.body', undefined)}
                    <div className="react-ui-detail-preview-actions">
                      <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>{t('react.prototype.action.close', undefined)}</UiButton>
                    </div>
                  </div>
                ),
              });
            }}
          >
            {t('react.prototype.action.test-modal', undefined)}
          </UiButton>
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              window.__toggleMudReactUi__?.(false);
              window.location.reload();
            }}
          >
            {t('react.prototype.action.close-scaffold', undefined)}
          </UiButton>
        </div>
      </UiSection>
      <div
        className="react-ui-tooltip-probe react-ui-surface-pane react-ui-surface-pane--stack"
        onPointerMove={(event) => {
          showTooltip(
            t('react.prototype.tooltip.title', undefined),
            [
              t('react.prototype.tooltip.line.host', undefined),
              t('react.prototype.tooltip.line.future', undefined),
            ],
            event.clientX,
            event.clientY,
          );
          moveTooltip(event.clientX, event.clientY);
        }}
        onPointerLeave={hideTooltip}
      >
        {t('react.prototype.tooltip.probe', undefined)}
      </div>
      <UiEmptyHint text={t('react.prototype.empty.next-step', undefined)} />
    </div>
  );
}
