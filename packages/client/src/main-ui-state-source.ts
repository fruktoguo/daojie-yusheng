import type { GameTimeState, MonsterTier, PlayerState, QuestState } from '@mud/shared-next';
import { TechniqueRealm, VIEW_RADIUS } from '@mud/shared-next';
import { getHeavenGateHudAction } from './ui/heaven-gate-modal';
import type { HUD } from './ui/hud';
import type { WorldPanel } from './ui/panels/world-panel';
import { assessMapDanger } from './utils/map-danger';
import { getDisplayRangeX, getDisplayRangeY, getZoom, setZoom } from './display';
import { formatZoom, refreshZoomChrome as syncZoomChrome } from './main-ui-helpers';
import { MAP_FALLBACK } from './constants/world/world-panel';

type MainUiStateSourceOptions = {
  hud: Pick<HUD, 'update'>;
  worldPanel: Pick<WorldPanel, 'update' | 'clear'>;
  mapRuntime: {
    getMapMeta: () => { name?: string; recommendedRealm?: string } | null;
    setZoom: (zoom: number) => void;
  };
  zoomSlider: HTMLInputElement | null;
  zoomLevelEl: HTMLElement | null;
  resizeCanvas: () => void;
  documentRef: Document;
  showToastEl: HTMLElement | null;
  getPlayer: () => PlayerState | null;
  getLatestEntities: () => Array<{
    id: string;
    wx: number;
    wy: number;
    name?: string;
    kind?: string;
    monsterTier?: MonsterTier;
    hp?: number;
    maxHp?: number;
  }>;
};

export type MainUiStateSource = ReturnType<typeof createMainUiStateSource>;

export function createMainUiStateSource(options: MainUiStateSourceOptions) {
  let pendingLayoutViewportSync = false;

  function resolveRealmLabel(player: PlayerState): string {
    if (player.realmName) {
      return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
    }
    const top = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
    if (!top) return '凡俗武者';
    const labels: Record<TechniqueRealm, string> = {
      [TechniqueRealm.Entry]: '武学入门',
      [TechniqueRealm.Minor]: '后天圆熟',
      [TechniqueRealm.Major]: '先天凝意',
      [TechniqueRealm.Perfection]: '半步修真',
    };
    return labels[top.realm] ?? '修行中';
  }

  function resolveTitleLabel(player: PlayerState): string {
    if (player.realm?.path === 'immortal') {
      return player.realm.shortName === '筑基' ? '云游真修' : '初登仙门';
    }
    const top = [...player.techniques].sort((a, b) => b.level - a.level)[0];
    if (!top) return '无名后学';
    if (top.realm >= TechniqueRealm.Perfection) return '名动一方';
    if (top.realm >= TechniqueRealm.Major) return '先天气成';
    if (top.realm >= TechniqueRealm.Minor) return '游历武者';
    return '见习弟子';
  }

  function hasSelectionWithin(root: HTMLElement | null): boolean {
    if (!root) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
  }

  function shouldPauseWorldPanelRefresh(): boolean {
    return hasSelectionWithin(options.documentRef.getElementById('layout-center'));
  }

  return {
    showToast(
      message: string,
      kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel' = 'system',
    ): void {
      const el = options.showToastEl;
      if (!el) return;
      el.className = `toast-kind-${kind}`;
      el.textContent = message;
      el.classList.remove('hidden');
      el.classList.add('show');
      const durationMs = kind === 'quest' || kind === 'grudge' ? 4200 : 2500;
      window.setTimeout(() => {
        el.classList.remove('show');
        el.classList.add('hidden');
      }, durationMs);
    },

    refreshZoomChrome(zoom = getZoom()): void {
      syncZoomChrome(zoom, options.zoomSlider, options.zoomLevelEl);
    },

    refreshZoomViewport(): void {
      options.resizeCanvas();
      options.mapRuntime.setZoom(getZoom());
    },

    applyZoomChange(nextZoom: number): number {
      const previous = getZoom();
      const zoom = setZoom(nextZoom);
      syncZoomChrome(zoom, options.zoomSlider, options.zoomLevelEl);
      if (zoom !== previous) {
        options.resizeCanvas();
        options.mapRuntime.setZoom(getZoom());
      }
      return zoom;
    },

    resolveMapDanger(): string {
      const player = options.getPlayer();
      const fallback = player ? MAP_FALLBACK[player.mapId] : undefined;
      if (!player) {
        return '未知';
      }
      return assessMapDanger(player, options.mapRuntime.getMapMeta()?.recommendedRealm, fallback?.recommendedRealm).dangerLabel;
    },

    refreshHudChrome(): void {
      const player = options.getPlayer();
      if (!player) return;
      const heavenGateAction = getHeavenGateHudAction(player);
      options.hud.update(player, {
        mapName: options.mapRuntime.getMapMeta()?.name ?? player.mapId,
        mapDanger: this.resolveMapDanger(),
        realmLabel: player.realm?.displayName ?? resolveRealmLabel(player),
        realmReviewLabel: player.realm?.review ?? player.realmReview,
        realmActionLabel: heavenGateAction?.label,
        showRealmAction: heavenGateAction?.visible,
        titleLabel: resolveTitleLabel(player),
      });
    },

    refreshUiChrome(): void {
      const player = options.getPlayer();
      this.refreshHudChrome();
      if (!player || shouldPauseWorldPanelRefresh()) {
        return;
      }
      options.worldPanel.update({
        player,
        mapMeta: options.mapRuntime.getMapMeta() as never,
        entities: options.getLatestEntities(),
        actions: player.actions,
        quests: player.quests as QuestState[],
      });
    },

    getInfoRadius(currentTimeState: GameTimeState | null): number {
      const player = options.getPlayer();
      const baseViewRange = Math.max(1, Math.round(player?.viewRange ?? VIEW_RADIUS));
      if (currentTimeState) {
        return Math.max(1, Math.ceil(baseViewRange * currentTimeState.visionMultiplier));
      }
      return baseViewRange;
    },

    scheduleLayoutViewportSync(): void {
      if (pendingLayoutViewportSync) {
        return;
      }
      pendingLayoutViewportSync = true;
      requestAnimationFrame(() => {
        pendingLayoutViewportSync = false;
        options.resizeCanvas();
      });
    },
  };
}
