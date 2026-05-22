/**
 * 本文件属于 React 原型壳层，负责 HUD、地图周边或侧栏控件的展示拼装。
 *
 * 维护时应把它视为前端表现层：只组织视图和用户意图，不保存会与主运行态冲突的真源。
 */
import { StrictMode, memo } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { t } from '../../ui/i18n';
import { createExternalStore } from '../stores/create-external-store';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';

export interface ReactHudStatusState {
  name: string;
  title: string;
  map: string;
  position: string;
  objective: string;
  threat: string;
  realmLabel: string;
  realmReviewLabel: string;
  realmActionLabel: string;
  showRealmAction: boolean;
  realmActionAvailable: boolean;
  hpText: string;
  hpWidth: string;
  qiText: string;
  qiWidth: string;
  cultivateText: string;
  cultivateWidth: string;
}

const DEFAULT_HUD_STATUS: ReactHudStatusState = {
  name: t('shell.name', undefined),
  title: t('shell.title', undefined),
  map: '-',
  position: '(0, 0)',
  objective: t('shell.objective', undefined),
  threat: t('shell.threat', undefined),
  realmLabel: '-',
  realmReviewLabel: '-',
  realmActionLabel: t('shell.breakthrough', undefined),
  showRealmAction: false,
  realmActionAvailable: false,
  hpText: '0/0',
  hpWidth: '0%',
  qiText: '0/0',
  qiWidth: '0%',
  cultivateText: t('shell.cultivate', undefined),
  cultivateWidth: '0%',
};

const hudStatusStore = createExternalStore<ReactHudStatusState>(DEFAULT_HUD_STATUS);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let onBreakthrough: (() => void) | null = null;
let cornerActionsRoot: Root | null = null;
let cornerActionsHost: HTMLDivElement | null = null;
let linkActionsRoot: Root | null = null;
let linkActionsHost: HTMLDivElement | null = null;

export function mountReactHudStatus(hudRoot: HTMLElement): boolean {
  if (root) {
    return true;
  }
  const panel = hudRoot.querySelector<HTMLElement>('.hud-panel');
  if (!panel) {
    return false;
  }
  const identity = panel.querySelector<HTMLElement>('.hud-identity');
  const mobileScroll = panel.querySelector<HTMLElement>('.hud-mobile-scroll');
  const insertBefore = identity ?? mobileScroll ?? panel.firstElementChild;
  host = document.createElement('div');
  host.className = 'react-hud-status-host';
  host.dataset.reactHudStatus = 'true';
  host.style.display = 'contents';
  if (insertBefore) {
    panel.insertBefore(host, insertBefore);
  } else {
    panel.appendChild(host);
  }
  identity?.remove();
  mobileScroll?.remove();
  root = createRoot(host);
  flushSync(() => {
    root?.render(
      <StrictMode>
        <HudStatusView />
      </StrictMode>,
    );
  });
  return true;
}

export function mountReactHudCornerActions(hudRoot: HTMLElement): boolean {
  if (cornerActionsRoot) {
    return true;
  }
  const actions = hudRoot.querySelector<HTMLElement>('.hud-corner-actions');
  if (!actions) {
    return false;
  }
  cornerActionsHost = document.createElement('div');
  cornerActionsHost.className = 'react-hud-corner-actions-host';
  cornerActionsHost.dataset.reactHudCornerActions = 'true';
  cornerActionsHost.style.display = 'contents';
  actions.replaceChildren(cornerActionsHost);
  cornerActionsRoot = createRoot(cornerActionsHost);
  flushSync(() => {
    cornerActionsRoot?.render(
      <StrictMode>
        <HudCornerActions />
      </StrictMode>,
    );
  });
  return true;
}

export function mountReactHudLinkActions(hudRoot: HTMLElement): boolean {
  if (linkActionsRoot) {
    return true;
  }
  const actions = hudRoot.querySelector<HTMLElement>('.hud-link-actions');
  if (!actions) {
    return false;
  }
  linkActionsHost = document.createElement('div');
  linkActionsHost.className = 'react-hud-link-actions-host';
  linkActionsHost.dataset.reactHudLinkActions = 'true';
  linkActionsHost.style.display = 'contents';
  actions.replaceChildren(linkActionsHost);
  linkActionsRoot = createRoot(linkActionsHost);
  flushSync(() => {
    linkActionsRoot?.render(
      <StrictMode>
        <HudLinkActions />
      </StrictMode>,
    );
  });
  return true;
}

export function syncReactHudStatus(state: ReactHudStatusState): void {
  hudStatusStore.setState(state);
}

export function setReactHudBreakthroughHandler(callback: (() => void) | null): void {
  onBreakthrough = callback;
}

const HudStatusView = memo(function HudStatusView() {
  const state = useExternalStoreSnapshot(hudStatusStore);
  return (
    <>
      <div className="hud-identity">
        <div className="hud-name" id="hud-name">{state.name}</div>
        <div className="hud-title" id="hud-title">{state.title}</div>
      </div>
      <div className="hud-mobile-scroll">
        <div className="hud-top-row">
          <div className="hud-realm-block">
            <div className="hud-realm-label">{t('shell.hud-realm-label-realm', undefined)}</div>
            <button
              className={`hud-realm-action${state.realmActionAvailable ? '' : ' is-unavailable'}`}
              id="hud-breakthrough"
              type="button"
              hidden={!state.showRealmAction}
              aria-disabled={state.realmActionAvailable ? 'false' : 'true'}
              onClick={() => onBreakthrough?.()}
            >
              {state.realmActionLabel}
            </button>
            <div className="hud-realm-main">
              <div className="hud-realm-value" id="hud-realm">{state.realmLabel}</div>
              <div className="hud-realm-sub" id="hud-realm-sub">{state.realmReviewLabel}</div>
            </div>
            <div className="hud-progress-shell">
              <div className="hud-progress-value" id="hud-cultivate">{state.cultivateText}</div>
              <div className="hud-progress-track">
                <div className="hud-progress-fill" id="hud-cultivate-bar" style={{ width: state.cultivateWidth }} />
              </div>
            </div>
          </div>
        </div>

        <div className="hud-resource-bars">
          <HudResource
            label={t('shell.hud-resource-label-hp', undefined)}
            text={state.hpText}
            fillId="hud-hp-bar"
            textId="hud-hp-text"
            width={state.hpWidth}
          />
          <HudResource
            label={t('shell.hud-resource-label-qi', undefined)}
            text={state.qiText}
            fillId="hud-qi-bar"
            textId="hud-qi-text"
            width={state.qiWidth}
            qi
          />
        </div>

        <div className="hud-grid">
          <HudRow label={t('shell.hud-label-map', undefined)} value={state.map} id="hud-map" />
          <HudRow label={t('shell.hud-label-position', undefined)} value={state.position} id="hud-pos" />
          <HudRow label={t('shell.hud-label-age', undefined)} value={state.objective} id="hud-objective" />
          <HudRow label={t('shell.hud-label-lifespan', undefined)} value={state.threat} id="hud-threat" />
        </div>
      </div>
    </>
  );
});

const HudCornerActions = memo(function HudCornerActions() {
  return (
    <>
      <button id="hud-open-settings" className="hud-corner-btn" type="button" data-i18n="shell.open-settings">
        {t('shell.open-settings', undefined)}
      </button>
      <button id="hud-open-mail" className="hud-corner-btn" type="button" data-i18n="shell.open-mail">
        {t('shell.open-mail', undefined)}
      </button>
      <button id="hud-open-suggestions" className="hud-corner-btn" type="button" data-i18n="shell.open-suggestions">
        {t('shell.open-suggestions', undefined)}
      </button>
      <button id="hud-open-chronicle" className="hud-corner-btn" type="button" data-i18n="shell.open-chronicle">
        {t('shell.open-chronicle', undefined)}
      </button>
      <button id="hud-logout" className="hud-corner-btn danger" type="button" data-i18n="shell.logout">
        {t('shell.logout', undefined)}
      </button>
    </>
  );
});

const HudLinkActions = memo(function HudLinkActions() {
  return (
    <>
      <a
        id="hud-join-qq-group"
        className="hud-corner-btn hud-link-btn hud-link-btn--qq"
        href="#"
        data-qq-group-link="true"
        aria-label={t('shell.join-qq-group.aria-label', undefined)}
      >
        <span className="hud-link-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
          </svg>
        </span>
      </a>
      <a
        className="hud-corner-btn hud-link-btn hud-link-btn--github"
        data-guarded-external-link="true"
        data-external-link-url="https://github.com/fruktoguo/daojie-yusheng"
        target="_blank"
        rel="noreferrer"
        role="link"
        tabIndex={0}
        aria-label="GitHub"
      >
        <span className="hud-link-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </span>
      </a>
      <button
        id="hud-open-tutorial"
        className="hud-corner-btn hud-link-btn hud-link-btn--tutorial"
        type="button"
        aria-label={t('shell.open-tutorial.aria-label', undefined)}
      >
        <span className="hud-link-btn-text">{t('shell.hud-link-btn-text-simple-tutorial', undefined)}</span>
      </button>
    </>
  );
});

const HudResource = memo(function HudResource({
  label,
  text,
  textId,
  fillId,
  width,
  qi = false,
}: {
  label: string;
  text: string;
  textId: string;
  fillId: string;
  width: string;
  qi?: boolean;
}) {
  return (
    <div className="hud-resource-bar">
      <div className="hud-resource-head">
        <div className="hud-resource-label">{label}</div>
        <div className="hud-resource-text" id={textId}>{text}</div>
      </div>
      <div className={`hud-resource-meter${qi ? ' hud-resource-meter--qi' : ''}`}>
        <div className="hud-resource-fill" id={fillId} style={{ width }} />
      </div>
    </div>
  );
});

const HudRow = memo(function HudRow({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <div className="hud-row">
      <span className="hud-label">{label}</span>
      <span className="hud-value" id={id}>{value}</span>
    </div>
  );
});
