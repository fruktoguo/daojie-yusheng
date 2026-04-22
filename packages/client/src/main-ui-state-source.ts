import type { GameTimeState, MonsterTier, PlayerState, QuestState } from '@mud/shared';
import { TechniqueRealm, VIEW_RADIUS } from '@mud/shared';
import { getHeavenGateHudAction } from './ui/heaven-gate-modal';
import type { HUD } from './ui/hud';
import type { WorldPanel } from './ui/panels/world-panel';
import { assessMapDanger } from './utils/map-danger';
import { getDisplayRangeX, getDisplayRangeY, getZoom, setZoom } from './display';
import { formatZoom, refreshZoomChrome as syncZoomChrome } from './main-ui-helpers';
import { MAP_FALLBACK } from './constants/world/world-panel';
/**
 * MainUiStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainUiStateSourceOptions = {
/**
 * hud：hud相关字段。
 */

  hud: Pick<HUD, 'update'>;  
  /**
 * worldPanel：世界面板相关字段。
 */

  worldPanel: Pick<WorldPanel, 'update' | 'clear'>;  
  /**
 * mapRuntime：地图运行态引用。
 */

  mapRuntime: {  
  /**
 * getMapMeta：地图Meta相关字段。
 */

    getMapMeta: () => {    
    /**
 * name：名称名称或显示文本。
 */
 name?: string;    
 /**
 * recommendedRealm：recommendedRealm相关字段。
 */
 recommendedRealm?: string } | null;    
 /**
 * setZoom：Zoom相关字段。
 */

    setZoom: (zoom: number) => void;
  };  
  /**
 * zoomSlider：zoomSlider相关字段。
 */

  zoomSlider: HTMLInputElement | null;  
  /**
 * zoomLevelEl：zoom等级El相关字段。
 */

  zoomLevelEl: HTMLElement | null;  
  /**
 * resizeCanvas：resizeCanva相关字段。
 */

  resizeCanvas: () => void;  
  /**
 * documentRef：documentRef相关字段。
 */

  documentRef: Document;  
  /**
 * showToastEl：showToastEl相关字段。
 */

  showToastEl: HTMLElement | null;  
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * getLatestEntities：LatestEntity相关字段。
 */

  getLatestEntities: () => Array<{  
  /**
 * id：ID标识。
 */

    id: string;    
    /**
 * wx：wx相关字段。
 */

    wx: number;    
    /**
 * wy：wy相关字段。
 */

    wy: number;    
    /**
 * name：名称名称或显示文本。
 */

    name?: string;    
    /**
 * kind：kind相关字段。
 */

    kind?: string;    
    /**
 * monsterTier：怪物Tier相关字段。
 */

    monsterTier?: MonsterTier;    
    /**
 * hp：hp相关字段。
 */

    hp?: number;    
    /**
 * maxHp：maxHp相关字段。
 */

    maxHp?: number;
  }>;
};
/**
 * MainUiStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainUiStateSource = ReturnType<typeof createMainUiStateSource>;
/**
 * createMainUiStateSource：构建并返回目标对象。
 * @param options MainUiStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainUi状态来源相关状态。
 */


export function createMainUiStateSource(options: MainUiStateSourceOptions) {
  let pendingLayoutViewportSync = false;  
  /**
 * resolveRealmLabel：规范化或转换RealmLabel。
 * @param player PlayerState 玩家对象。
 * @returns 返回RealmLabel。
 */


  function resolveRealmLabel(player: PlayerState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * resolveTitleLabel：规范化或转换TitleLabel。
 * @param player PlayerState 玩家对象。
 * @returns 返回TitleLabel。
 */


  function resolveTitleLabel(player: PlayerState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * hasSelectionWithin：判断SelectionWithin是否满足条件。
 * @param root HTMLElement | null 参数说明。
 * @returns 返回是否满足SelectionWithin条件。
 */


  function hasSelectionWithin(root: HTMLElement | null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!root) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
  }  
  /**
 * shouldPauseWorldPanelRefresh：判断Pause世界面板Refresh是否满足条件。
 * @returns 返回是否满足Pause世界面板Refresh条件。
 */


  function shouldPauseWorldPanelRefresh(): boolean {
    return hasSelectionWithin(options.documentRef.getElementById('layout-center'));
  }

  return {  
  /**
 * showToast：执行showToast相关逻辑。
 * @param message string 参数说明。
 * @param kind 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel' 参数说明。
 * @returns 无返回值，直接更新showToast相关状态。
 */

    showToast(
      message: string,
      kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel' = 'system',
    ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * refreshZoomChrome：执行refreshZoomChrome相关逻辑。
 * @param zoom 参数说明。
 * @returns 无返回值，直接更新refreshZoomChrome相关状态。
 */


    refreshZoomChrome(zoom = getZoom()): void {
      syncZoomChrome(zoom, options.zoomSlider, options.zoomLevelEl);
    },    
    /**
 * refreshZoomViewport：执行refreshZoomViewport相关逻辑。
 * @returns 无返回值，直接更新refreshZoomViewport相关状态。
 */


    refreshZoomViewport(): void {
      options.resizeCanvas();
      options.mapRuntime.setZoom(getZoom());
    },    
    /**
 * applyZoomChange：处理ZoomChange并更新相关状态。
 * @param nextZoom number 参数说明。
 * @returns 返回ZoomChange。
 */


    applyZoomChange(nextZoom: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const previous = getZoom();
      const zoom = setZoom(nextZoom);
      syncZoomChrome(zoom, options.zoomSlider, options.zoomLevelEl);
      if (zoom !== previous) {
        options.resizeCanvas();
        options.mapRuntime.setZoom(getZoom());
      }
      return zoom;
    },    
    /**
 * resolveMapDanger：规范化或转换地图Danger。
 * @returns 返回地图Danger。
 */


    resolveMapDanger(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const fallback = player ? MAP_FALLBACK[player.mapId] : undefined;
      if (!player) {
        return '未知';
      }
      return assessMapDanger(player, options.mapRuntime.getMapMeta()?.recommendedRealm, fallback?.recommendedRealm).dangerLabel;
    },    
    /**
 * refreshHudChrome：执行refreshHudChrome相关逻辑。
 * @returns 无返回值，直接更新refreshHudChrome相关状态。
 */


    refreshHudChrome(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * refreshUiChrome：执行refreshUiChrome相关逻辑。
 * @returns 无返回值，直接更新refreshUiChrome相关状态。
 */


    refreshUiChrome(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * getInfoRadius：读取InfoRadiu。
 * @param currentTimeState GameTimeState | null 参数说明。
 * @returns 返回InfoRadiu。
 */


    getInfoRadius(currentTimeState: GameTimeState | null): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const baseViewRange = Math.max(1, Math.round(player?.viewRange ?? VIEW_RADIUS));
      if (currentTimeState) {
        return Math.max(1, Math.ceil(baseViewRange * currentTimeState.visionMultiplier));
      }
      return baseViewRange;
    },    
    /**
 * scheduleLayoutViewportSync：处理scheduleLayoutViewport同步并更新相关状态。
 * @returns 无返回值，直接更新scheduleLayoutViewportSync相关状态。
 */


    scheduleLayoutViewportSync(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
