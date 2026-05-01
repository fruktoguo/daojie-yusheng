/**
 * 世界面板
 * 展示当前地图信息与天机阁入口
 */
import { MapMeta, PlayerState } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';
import { TECH_REALM_LABELS, TECH_REALM_NAME_BY_KEY, WORLD_GUIDE } from '../../constants/world/world-panel';
import { assessMapDanger } from '../../utils/map-danger';
import { FloatingTooltip } from '../floating-tooltip';
import { patchElementHtml } from '../dom-patch';

/** 世界面板汇总快照。 */
interface WorldPanelSnapshot {
  mapName: string;
  mapTypeLabel: string;
  mapMood: string;
  mapDesc: string;
  dangerLabel: string;
  dangerTone: number;
  recommend: string;
  realmLabel: string;
  route: string;
  resourcesLabel: string;
  threatsLabel: string;
  cultivatingName: string;
}

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

function inferRealm(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  let highest = player.techniques[0];
  for (let index = 1; index < player.techniques.length; index += 1) {
    const technique = player.techniques[index];
    if ((technique?.realm ?? -Infinity) > (highest?.realm ?? -Infinity)) {
      highest = technique;
    }
  }
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

/** resolveRecommendedRealmLabel：解析推荐境界标签。 */
function resolveRecommendedRealmLabel(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (/[^\x00-\x7F]/.test(raw)) return raw;
  const parts = raw.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  const labels = parts.map((part) => TECH_REALM_NAME_BY_KEY[part]);
  if (labels.some((label) => !label)) {
    return fallback;
  }
  return labels.join('到');
}

/** resolveMapTypeLabel：按当前实例解析地图类型。 */
function resolveMapTypeLabel(player: PlayerState): string {
  if (isSectMap(player)) {
    return '宗门';
  }
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  if (instanceId.startsWith('real:') || instanceId.includes(':real:')) {
    return '现世';
  }
  return '虚境';
}

/** isSectMap：判断当前玩家是否处于宗门动态地图。 */
function isSectMap(player: PlayerState): boolean {
  const mapId = typeof player.mapId === 'string' ? player.mapId.trim() : '';
  const instanceId = typeof player.instanceId === 'string' ? player.instanceId.trim() : '';
  return mapId.startsWith('sect_domain:') || instanceId.startsWith('sect:');
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
    this.bindMapPaneEvents();
    this.bindTianjiPaneEvents();
  }

  /** setCallbacks：设置面板回调。 */
  setCallbacks(callbacks: WorldPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  /** update：根据当前玩家与地图元数据刷新面板。 */
  update(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
  }): void {
    const snapshot = this.buildSnapshot(input);
    this.syncMapPane(snapshot);
    this.syncTianjiPane();
  }

  /** clear：清空当前世界面板。 */
  clear(): void {
    this.hideMapTypeTooltip();
    patchElementHtml(this.mapPane, '<div class="empty-hint">尚未进入世界</div>');
    patchElementHtml(this.tianjiPane, '<div class="empty-hint">尚未进入世界</div>');
  }

  /** buildSnapshot：构建地图信息快照。 */
  private buildSnapshot(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
  }): WorldPanelSnapshot {
    const sectMap = isSectMap(input.player);
    const guide = WORLD_GUIDE[input.player.mapId] ?? (sectMap ? {
      title: input.mapMeta?.name ?? '宗门',
      recommendedRealm: input.mapMeta?.recommendedRealm ?? '未知',
      route: '宗门驻地',
      mood: '宗门',
      desc: '宗门驻地。',
      resources: [],
      threats: [],
    } : {
      title: input.mapMeta?.name ?? input.player.mapId,
      recommendedRealm: input.mapMeta?.recommendedRealm ?? '未知',
      route: '继续探索当前区域',
      mood: '未知地域',
      desc: '该区域暂无卷宗记载，建议稳步试探。',
      resources: [],
      threats: [],
    });

    const danger = assessMapDanger(input.player, input.mapMeta?.recommendedRealm, guide.recommendedRealm);
    const recommend = danger.recommendedRealmLabel === '未知'
      ? resolveRecommendedRealmLabel(input.mapMeta?.recommendedRealm, guide.recommendedRealm)
      : danger.recommendedRealmLabel;
    const cultivating = input.player.cultivatingTechId
      ? input.player.techniques.find((entry) => entry.techId === input.player.cultivatingTechId)
      : null;

    return {
      mapName: input.mapMeta?.name ?? guide.title,
      mapTypeLabel: resolveMapTypeLabel(input.player),
      mapMood: guide.mood,
      mapDesc: guide.desc,
      dangerLabel: danger.dangerLabel,
      dangerTone: danger.dangerTone,
      recommend,
      realmLabel: inferRealm(input.player),
      route: guide.route,
      resourcesLabel: guide.resources.join('、') || '暂无',
      threatsLabel: guide.threats.join('、') || '未知',
      cultivatingName: cultivating?.name ?? '未设定',
    };
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
          <div class="world-danger-label">区域危险</div>
          <div class="world-danger-value danger-${snapshot.dangerTone}" data-world-map-danger="true">${escapeHtml(snapshot.dangerLabel)}</div>
          <div class="world-danger-sub" data-world-map-recommend="true">推荐境界：${escapeHtml(snapshot.recommend)}</div>
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
      patchElementHtml(this.mapPane, html);
    });
  }

  /** renderTianjiPane：渲染天机阁入口。 */
  private renderTianjiPane(): void {
    const html = `
      <div class="panel-section">
        <div class="panel-section-title" data-world-tianji-title="true">天机阁</div>
        <div class="panel-subtext" data-world-tianji-desc="true">阁藏天下卷宗，专收低频榜册与汇总情报。</div>
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
      patchElementHtml(this.tianjiPane, html);
    });
  }

  /** patchMapPane：局部刷新地图信息。 */
  private patchMapPane(snapshot: WorldPanelSnapshot): boolean {
    const moodNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-mood="true"]');
    const titleNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-title="true"]');
    const typeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-type="true"]');
    const descNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-desc="true"]');
    const dangerNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-danger="true"]');
    const recommendNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-recommend="true"]');
    const realmNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-realm="true"]');
    const routeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-route="true"]');
    const resourcesNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-resources="true"]');
    const threatsNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-threats="true"]');
    const cultivatingNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-cultivating="true"]');
    if (!moodNode || !titleNode || !typeNode || !descNode || !dangerNode || !recommendNode
      || !realmNode || !routeNode || !resourcesNode || !threatsNode || !cultivatingNode) {
      return false;
    }

    moodNode.textContent = snapshot.mapMood;
    titleNode.textContent = snapshot.mapName;
    typeNode.textContent = snapshot.mapTypeLabel;
    descNode.textContent = snapshot.mapDesc;
    dangerNode.textContent = snapshot.dangerLabel;
    dangerNode.className = `world-danger-value danger-${snapshot.dangerTone}`;
    recommendNode.textContent = `推荐境界：${snapshot.recommend}`;
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
      && this.tianjiPane.querySelector('[data-world-tianji-desc="true"]') !== null
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
    if (mapTypeLabel === '宗门') {
      return ['宗门驻地'];
    }
    if (mapTypeLabel === '现世') {
      return ['可以对其他修士发起攻击', '可以攻击地块'];
    }
    return ['不能对其他修士发起攻击', '可以攻击地块'];
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
