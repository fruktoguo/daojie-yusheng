import { useEffect, useRef, useCallback, useState } from 'react';
import { SectionPageLayout } from '../../ui';
import { request } from '../../lib/api';
import { toast } from '../../ui/Toast';
import { GmMapEditor } from '../../../../client/src/gm-map-editor';

type SideTab = 'overview' | 'inspector' | 'json';
type CatalogMode = 'main' | 'piece';

export default function MapsPage() {
  const editorRef = useRef<GmMapEditor | null>(null);
  const mountedRef = useRef(false);
  const [sideTab, setSideTab] = useState<SideTab>('overview');
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('main');
  const catalogMapRef = useRef<Map<string, CatalogMode>>(new Map());

  const setAppStatus = useCallback((message: string, isError?: boolean) => {
    const el = document.getElementById('map-status-bar');
    if (el) {
      el.textContent = message;
      el.style.color = isError ? 'var(--destructive)' : '';
    }
    if (isError) toast.error(message);
  }, []);

  // Fetch catalog mode mapping
  const loadCatalogModes = useCallback(async () => {
    try {
      const data = await request<{ maps: Array<{ id: string; catalogMode?: string }> }>('/api/maps');
      const map = new Map<string, CatalogMode>();
      for (const m of data.maps) {
        map.set(m.id, (m.catalogMode as CatalogMode) ?? 'main');
      }
      catalogMapRef.current = map;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadCatalogModes();
    const editor = new GmMapEditor(
      request,
      setAppStatus,
      { mapApiBasePath: '/api/maps' },
    );
    editorRef.current = editor;
    editor.ensureLoaded();
  }, [setAppStatus, loadCatalogModes]);

  // Apply catalog mode filter via CSS whenever catalogMode or DOM changes
  useEffect(() => {
    const listEl = document.getElementById('map-list');
    if (!listEl) return;

    const applyFilter = () => {
      const rows = listEl.querySelectorAll<HTMLElement>('[data-map-id]');
      let hasUnknown = false;
      rows.forEach(row => {
        const mapId = row.dataset.mapId ?? '';
        const mode = catalogMapRef.current.get(mapId);
        if (mode === undefined) hasUnknown = true;
        row.style.display = (mode ?? 'main') === catalogMode ? '' : 'none';
      });
      if (hasUnknown && rows.length > 0) {
        loadCatalogModes().then(() => {
          rows.forEach(row => {
            const mapId = row.dataset.mapId ?? '';
            const mode = catalogMapRef.current.get(mapId) ?? 'main';
            row.style.display = mode === catalogMode ? '' : 'none';
          });
        });
      }
    };

    applyFilter();
    const observer = new MutationObserver(applyFilter);
    observer.observe(listEl, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [catalogMode, loadCatalogModes]);

  // Wire side tab switching + forceTool
  const switchSideTab = useCallback((tab: SideTab) => {
    setSideTab(tab);
    const editor = editorRef.current;
    if (!editor) return;
    if (tab === 'inspector' || tab === 'json') {
      editor.forceTool('select');
    } else {
      editor.clearForcedTool();
    }
  }, []);

  // Sync panel visibility when sideTab changes
  useEffect(() => {
    const panels = {
      overview: document.getElementById('map-side-panel-overview'),
      inspector: document.getElementById('map-side-panel-inspector'),
      json: document.getElementById('map-side-panel-json'),
    };
    for (const [key, el] of Object.entries(panels)) {
      if (el) el.classList.toggle('hidden', key !== sideTab);
    }
  }, [sideTab]);

  return (
    <SectionPageLayout title="地图编辑">
      <div className="flex h-full overflow-hidden">
        {/* Catalog sidebar */}
        <div className="w-[210px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-2">
            <input id="map-search" className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground" placeholder="搜索地图..." />
          </div>
          <div className="flex gap-1 px-2 pb-1">
            <button id="map-catalog-mode-main" className={`small-btn ${catalogMode === 'main' ? 'primary' : ''}`} onClick={() => setCatalogMode('main')}>主图</button>
            <button id="map-catalog-mode-piece" className={`small-btn ${catalogMode === 'piece' ? 'primary' : ''}`} onClick={() => setCatalogMode('piece')}>散图</button>
          </div>
          <div className="flex-1 overflow-auto px-2 space-y-1">
            <div id="map-list" className="flex flex-col gap-1"></div>
          </div>
          <div className="p-2 border-t border-border">
            <button id="map-refresh-list" className="small-btn w-full">刷新列表</button>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0 flex-wrap">
            <div id="map-tool-buttons" className="flex gap-1 flex-wrap"></div>
            <div className="ml-auto flex gap-1">
              <button id="map-undo" className="small-btn">撤销</button>
              <button id="map-save" className="small-btn primary">保存</button>
              <button id="map-reset" className="small-btn">重置</button>
              <button id="map-reload" className="small-btn">重载</button>
              <button id="map-center" className="small-btn">居中</button>
              <button id="map-zoom-out" className="small-btn">-</button>
              <button id="map-zoom-in" className="small-btn">+</button>
            </div>
          </div>

          {/* Canvas host */}
          <div id="map-editor-host" className="flex-1 relative overflow-hidden bg-background">
            <canvas id="map-editor-canvas" className="absolute inset-0 w-full h-full"></canvas>
            <div id="map-canvas-empty" className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              请从左侧选择地图
            </div>
          </div>

          {/* Status bar */}
          <div id="map-status-bar" className="h-6 px-2 flex items-center text-xs text-muted-foreground border-t border-border shrink-0"></div>
        </div>

        {/* Inspector sidebar */}
        <div className="w-[420px] shrink-0 border-l border-border flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            <button
              id="map-side-tab-overview"
              className={`flex-1 h-8 text-xs font-medium ${sideTab === 'overview' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => switchSideTab('overview')}
            >概览与工具</button>
            <button
              id="map-side-tab-inspector"
              className={`flex-1 h-8 text-xs font-medium ${sideTab === 'inspector' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => switchSideTab('inspector')}
            >检视 / 拼图 / 对象</button>
            <button
              id="map-side-tab-json"
              className={`flex-1 h-8 text-xs font-medium ${sideTab === 'json' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => switchSideTab('json')}
            >JSON</button>
          </div>

          {/* Tab panels */}
          <div className="flex-1 overflow-auto">
            <div id="map-side-panel-overview" className="p-3 space-y-3">
              <div id="map-summary" className="map-summary-card"></div>
              <div id="map-editor-empty" className="empty-hint">未选择地图</div>
              <div id="map-editor-panel" className="hidden space-y-3">
                <div id="map-paint-layer-tabs" className="paint-layer-tabs"></div>
                <div id="map-tile-palette" className="grid grid-cols-4 gap-1"></div>
              </div>
            </div>
            <div id="map-side-panel-inspector" className="p-3 hidden">
              <div id="map-inspector-content"></div>
            </div>
            <div id="map-side-panel-json" className="p-3 hidden">
              <textarea id="map-json" className="w-full h-64 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y"></textarea>
              <button id="map-apply-json" className="small-btn primary mt-2">应用 JSON</button>
            </div>
          </div>
        </div>
      </div>
    </SectionPageLayout>
  );
}
