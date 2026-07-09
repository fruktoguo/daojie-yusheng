/**
 * 本文件是客户端 DOM UI 的 world panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 世界面板
 * 展示当前地图信息与天机阁入口
 */
import type { MapMeta, PlayerState } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';
import { FloatingTooltip } from '../floating-tooltip';
import {
  mountReactWorldPanels,
  setReactWorldPanelCallbacks,
  shouldUseReactWorldPanel,
  syncReactWorldPanelState,
  unmountReactWorldPanels,
} from '../../react-ui/panels/world/mount-world-panel';
import {
  buildMapTypeTooltipLines,
  buildWorldPanelSnapshot,
  type WorldPanelSnapshot,
} from './world-panel-projection';

/** 世界面板外部回调集合。 */
interface WorldPanelCallbacks {
  onOpenLeaderboard?: () => void;
  onOpenWorldSummary?: () => void;
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** WorldPanel：世界面板实现。 */
export class WorldPanel {
  /** mapPane：地图信息面板。 */
  private mapPane = document.getElementById('pane-map-intel')!;
  /** tianjiPane：天机阁面板。 */
  private tianjiPane = document.getElementById('pane-tianji') ?? document.createElement('div');
  /** mapTypeTooltip：地图类型标签说明。 */
  private mapTypeTooltip = new FloatingTooltip('floating-tooltip');
  /** mapTypeTooltipTarget：当前悬浮中的地图类型标签。 */
  private mapTypeTooltipTarget: HTMLElement | null = null;
  /** callbacks：对外回调。 */
  private callbacks: WorldPanelCallbacks = {};

  constructor() {
    if (!this.useReactPanel()) {
      this.bindMapPaneEvents();
      this.bindTianjiPaneEvents();
    }
  }

  /** setCallbacks：设置面板回调。 */
  setCallbacks(callbacks: WorldPanelCallbacks): void {
    this.callbacks = callbacks;
    setReactWorldPanelCallbacks(callbacks);
    if (this.useReactPanel()) {
      this.mountReactPanels();
    }
  }

  /** update：根据当前玩家与地图元数据刷新面板。 */
  update(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
  }): void {
    const snapshot = buildWorldPanelSnapshot(input.player, input.mapMeta);
    if (this.useReactPanel()) {
      syncReactWorldPanelState(snapshot);
      this.mountReactPanels();
      return;
    }
    this.syncMapPane(snapshot);
    this.syncTianjiPane();
  }

  /** clear：清空当前世界面板。 */
  clear(): void {
    if (this.useReactPanel()) {
      syncReactWorldPanelState(null);
      this.mountReactPanels();
      return;
    }
    this.hideMapTypeTooltip();
    replaceElementHtml(this.mapPane, '<div class="empty-hint">尚未进入世界</div>');
    replaceElementHtml(this.tianjiPane, '<div class="empty-hint">尚未进入世界</div>');
  }

  private useReactPanel(): boolean {
    return shouldUseReactWorldPanel();
  }

  private mountReactPanels(): void {
    if (this.useReactPanel()) {
      mountReactWorldPanels();
      return;
    }
    unmountReactWorldPanels();
  }

  /** syncMapPane：同步地图信息面板。 */
  private syncMapPane(snapshot: WorldPanelSnapshot): void {
    if (!this.patchMapPane(snapshot)) {
      this.renderMapPane(snapshot);
      this.patchMapPane(snapshot);
    }
  }

  /** syncTianjiPane：同步天机阁面板。 */
  private syncTianjiPane(): void {
    if (!this.patchTianjiPane()) {
      this.renderTianjiPane();
      this.patchTianjiPane();
    }
  }

  /** renderMapPane：渲染地图信息面板。 */
  private renderMapPane(snapshot: WorldPanelSnapshot): void {
    const html = `
      <div class="world-hero compact">
        <div>
          <div class="world-kicker" data-world-map-mood="true">${escapeHtml(snapshot.mapMood)}</div>
          <div class="world-title-row">
            <div class="world-title" data-world-map-title="true">${escapeHtml(snapshot.mapName)}</div>
            <span class="world-map-type-badge" data-world-map-type="true">${escapeHtml(snapshot.mapTypeLabel)}</span>
          </div>
          <div class="world-desc" data-world-map-desc="true">${escapeHtml(snapshot.mapDesc)}</div>
        </div>
        <div class="world-danger">
          <div class="world-danger-label">推荐境界</div>
          <div class="world-danger-value danger-3" data-world-map-recommended-realm="true">${escapeHtml(snapshot.recommendedRealmLabel)}</div>
        </div>
      </div>
      <div class="info-list">
        <div class="info-line"><span>当前阶段</span><strong data-world-map-realm="true">${escapeHtml(snapshot.realmLabel)}</strong></div>
        <div class="info-line"><span>推进路线</span><strong data-world-map-route="true">${escapeHtml(snapshot.route)}</strong></div>
        <div class="info-line"><span>主要资源</span><strong data-world-map-resources="true">${escapeHtml(snapshot.resourcesLabel)}</strong></div>
        <div class="info-line"><span>主要威胁</span><strong data-world-map-threats="true">${escapeHtml(snapshot.threatsLabel)}</strong></div>
        <div class="info-line"><span>当前主修</span><strong data-world-map-cultivating="true">${escapeHtml(snapshot.cultivatingName)}</strong></div>
      </div>
    `;
    this.hideMapTypeTooltip();
    preserveSelection(this.mapPane, () => {
      replaceElementHtml(this.mapPane, html);
    });
  }

  /** renderTianjiPane：渲染天机阁入口。 */
  private renderTianjiPane(): void {
    const html = `
      <div class="panel-section">
        <div class="panel-section-title" data-world-tianji-title="true">天机阁</div>
      </div>
      <div class="tianji-action-list">
        <button class="tianji-action-card" data-world-tianji-action="world" type="button">
          <div>
            <div class="tianji-action-title">世界</div>
            <div class="tianji-action-desc">查看全服灵石总和、行动人数、境界人数，以及击杀与死亡总计。</div>
          </div>
          <div class="tianji-action-arrow">查看</div>
        </button>
        <button class="tianji-action-card" data-world-tianji-action="leaderboard" type="button">
          <div>
            <div class="tianji-action-title">排行榜</div>
            <div class="tianji-action-desc">查看境界、击杀、灵石、死亡、炼体、六维最强与宗门榜单。</div>
          </div>
          <div class="tianji-action-arrow">查看</div>
        </button>
      </div>
    `;
    preserveSelection(this.tianjiPane, () => {
      replaceElementHtml(this.tianjiPane, html);
    });
  }

  /** patchMapPane：局部刷新地图信息。 */
  private patchMapPane(snapshot: WorldPanelSnapshot): boolean {
    const moodNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-mood="true"]');
    const titleNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-title="true"]');
    const typeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-type="true"]');
    const descNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-desc="true"]');
    const recommendedRealmNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-recommended-realm="true"]');
    const realmNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-realm="true"]');
    const routeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-route="true"]');
    const resourcesNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-resources="true"]');
    const threatsNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-threats="true"]');
    const cultivatingNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-cultivating="true"]');
    if (!moodNode || !titleNode || !typeNode || !descNode || !recommendedRealmNode
      || !realmNode || !routeNode || !resourcesNode || !threatsNode || !cultivatingNode) {
      return false;
    }

    moodNode.textContent = snapshot.mapMood;
    titleNode.textContent = snapshot.mapName;
    typeNode.textContent = snapshot.mapTypeLabel;
    descNode.textContent = snapshot.mapDesc;
    recommendedRealmNode.textContent = snapshot.recommendedRealmLabel;
    realmNode.textContent = snapshot.realmLabel;
    routeNode.textContent = snapshot.route;
    resourcesNode.textContent = snapshot.resourcesLabel;
    threatsNode.textContent = snapshot.threatsLabel;
    cultivatingNode.textContent = snapshot.cultivatingName;
    return true;
  }

  /** patchTianjiPane：确认天机阁基础结构已就位。 */
  private patchTianjiPane(): boolean {
    return this.tianjiPane.querySelector('[data-world-tianji-title="true"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-action="leaderboard"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-action="world"]') !== null;
  }

  /** bindMapPaneEvents：绑定地图类型标签 hover 提示。 */
  private bindMapPaneEvents(): void {
    this.mapPane.addEventListener('pointermove', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        this.hideMapTypeTooltip();
        return;
      }
      const badge = target.closest<HTMLElement>('[data-world-map-type="true"]');
      if (!badge) {
        this.hideMapTypeTooltip();
        return;
      }
      const label = badge.textContent?.trim() || '虚境';
      const lines = this.buildMapTypeTooltipLines(label);
      if (this.mapTypeTooltipTarget !== badge) {
        this.mapTypeTooltip.show(label, lines, event.clientX, event.clientY);
        this.mapTypeTooltipTarget = badge;
        return;
      }
      this.mapTypeTooltip.move(event.clientX, event.clientY);
    });
    this.mapPane.addEventListener('pointerleave', () => {
      this.hideMapTypeTooltip();
    });
  }

  /** buildMapTypeTooltipLines：构建地图类型 hover 说明。 */
  private buildMapTypeTooltipLines(mapTypeLabel: string): string[] {
    return buildMapTypeTooltipLines(mapTypeLabel);
  }

  /** hideMapTypeTooltip：隐藏地图类型说明。 */
  private hideMapTypeTooltip(): void {
    this.mapTypeTooltip.hide(true);
    this.mapTypeTooltipTarget = null;
  }

  /** bindTianjiPaneEvents：绑定天机阁入口事件。 */
  private bindTianjiPaneEvents(): void {
    this.tianjiPane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.closest<HTMLElement>('[data-world-tianji-action]')?.dataset.worldTianjiAction;
      if (action === 'leaderboard') {
        this.callbacks.onOpenLeaderboard?.();
        event.preventDefault();
        return;
      }
      if (action === 'world') {
        this.callbacks.onOpenWorldSummary?.();
        event.preventDefault();
      }
    });
  }
}
