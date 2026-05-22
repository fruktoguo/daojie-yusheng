/**
 * 本文件属于 React 原型壳层，负责 HUD、地图周边或侧栏控件的展示拼装。
 *
 * 维护时应把它视为前端表现层：只组织视图和用户意图，不保存会与主运行态冲突的真源。
 */
import { StrictMode, memo } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { t } from '../../ui/i18n';

let shellRoot: Root | null = null;
let shellHost: HTMLDivElement | null = null;
let modalRoot: Root | null = null;
let modalHost: HTMLDivElement | null = null;

export function mountReactMapMinimapShell(documentRef: Document): boolean {
  const shell = documentRef.getElementById('map-minimap-shell');
  const modal = documentRef.getElementById('map-minimap-modal');
  if (!shell || !modal) {
    return false;
  }
  if (!shellRoot) {
    shellHost = documentRef.createElement('div');
    shellHost.className = 'react-map-minimap-shell-host';
    shellHost.dataset.reactMapMinimapShell = 'true';
    shellHost.style.display = 'contents';
    shell.replaceChildren(shellHost);
    shellRoot = createRoot(shellHost);
    flushSync(() => {
      shellRoot?.render(
        <StrictMode>
          <MapMinimapOverlayShell />
        </StrictMode>,
      );
    });
  }
  if (!modalRoot) {
    modalHost = documentRef.createElement('div');
    modalHost.className = 'react-map-minimap-modal-host';
    modalHost.dataset.reactMapMinimapModal = 'true';
    modalHost.style.display = 'contents';
    modal.replaceChildren(modalHost);
    modalRoot = createRoot(modalHost);
    flushSync(() => {
      modalRoot?.render(
        <StrictMode>
          <MapMinimapModalShell />
        </StrictMode>,
      );
    });
  }
  return true;
}

const MapMinimapOverlayShell = memo(function MapMinimapOverlayShell() {
  return (
    <>
      <div className="map-minimap-controls">
        <button
          id="map-minimap-toggle"
          className="map-minimap-btn"
          type="button"
          aria-label={t('shell.map-minimap-toggle.title', undefined)}
        >
          {t('shell.map-minimap-toggle', undefined)}
        </button>
        <button
          id="map-minimap-open"
          className="map-minimap-btn"
          type="button"
          aria-label={t('shell.map-minimap-open.title', undefined)}
        >
          {t('shell.map-minimap-open', undefined)}
        </button>
      </div>
      <div id="map-minimap" className="map-minimap hidden">
        <div className="map-minimap-frame">
          <div id="map-minimap-title" className="map-minimap-title">
            {t('shell.map-minimap-title', undefined)}
          </div>
          <canvas id="map-minimap-canvas" className="map-minimap-canvas" />
        </div>
      </div>
    </>
  );
});

const MapMinimapModalShell = memo(function MapMinimapModalShell() {
  return (
    <div id="map-minimap-modal-window" className="map-minimap-modal-window">
      <div id="map-minimap-modal-header" className="map-minimap-modal-header">
        <div id="map-minimap-modal-title" className="map-minimap-modal-title">
          {t('shell.map-minimap-title', undefined)}
        </div>
        <div className="map-minimap-modal-actions">
          <button
            id="map-minimap-modal-catalog-toggle"
            className="map-minimap-modal-catalog-toggle"
            type="button"
            aria-expanded="false"
          >
            {t('shell.map-minimap-modal-catalog-toggle', undefined)}
          </button>
          <button id="map-minimap-modal-close" className="map-minimap-modal-close" type="button">
            {t('shell.map-minimap-modal-close', undefined)}
          </button>
        </div>
      </div>
      <div className="map-minimap-modal-body">
        <aside className="map-minimap-modal-sidebar">
          <div className="map-minimap-modal-filters">
            <button id="map-minimap-filter-all" className="map-minimap-modal-filter active" type="button">
              {t('shell.map-minimap-filter-all', undefined)}
            </button>
            <button id="map-minimap-filter-memory" className="map-minimap-modal-filter" type="button">
              {t('shell.map-minimap-filter-memory', undefined)}
            </button>
            <button id="map-minimap-filter-unlock" className="map-minimap-modal-filter" type="button">
              {t('shell.map-minimap-filter-unlock', undefined)}
            </button>
          </div>
          <div className="map-minimap-modal-toolbar">
            <button id="map-minimap-delete-memory" className="small-btn ghost" type="button">
              {t('shell.map-minimap-delete-memory', undefined)}
            </button>
            <button id="map-minimap-delete-all-memory" className="small-btn danger" type="button">
              {t('shell.map-minimap-delete-all-memory', undefined)}
            </button>
          </div>
          <div id="map-minimap-modal-list" className="map-minimap-modal-list" />
        </aside>
        <div className="map-minimap-modal-stage">
          <div
            id="map-minimap-modal-source-switch"
            className="map-minimap-modal-source-switch hidden"
            role="group"
            aria-label={t('shell.map-minimap-modal-source-switch.aria-label', undefined)}
          >
            <button
              id="map-minimap-modal-source-memory"
              className="map-minimap-modal-source-toggle"
              type="button"
              aria-pressed="false"
            >
              {t('shell.map-minimap-filter-memory', undefined)}
            </button>
            <button
              id="map-minimap-modal-source-unlock"
              className="map-minimap-modal-source-toggle"
              type="button"
              aria-pressed="false"
            >
              {t('shell.hud-label-map', undefined)}
            </button>
          </div>
          <canvas id="map-minimap-modal-canvas" className="map-minimap-modal-canvas" />
        </div>
      </div>
    </div>
  );
});
