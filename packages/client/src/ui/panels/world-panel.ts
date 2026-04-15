/**
 * 世界面板
 * 展示当前地图情报、附近实体、任务建议与可执行行动
 */

import { ActionDef, gridDistance, MapMeta, MonsterTier, PlayerState, QuestState } from '@mud/shared-next';
import { preserveSelection } from '../selection-preserver';
import { TECH_REALM_LABELS, TECH_REALM_NAME_BY_KEY, WORLD_GUIDE } from '../../constants/world/world-panel';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../../utils/number';
import { getMonsterPresentation } from '../../monster-presentation';
import { assessMapDanger } from '../../utils/map-danger';

/** 世界面板可见实体来源。 */
interface VisibleEntity {
  id: string;
  wx: number;
  wy: number;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  hp?: number;
  maxHp?: number;
}

/** 附近妖兽显示项。 */
interface NearbyMonsterView {
  id: string;
  name: string;
  tier?: MonsterTier;
  distance: number;
  hp: number;
  maxHp: number;
}

/** 附近人物显示项。 */
interface NearbyNpcView {
  id: string;
  name: string;
}

/** 可立即执行的快捷行动项。 */
interface QuickActionView {
  id: string;
  name: string;
  desc: string;
}

/** 世界面板汇总快照。 */
interface WorldPanelSnapshot {
  mapName: string;
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
  currentQuestTitle: string;
  currentQuestProgress: string;
  nearbyMonsters: NearbyMonsterView[];
  nearbyNpcs: NearbyNpcView[];
  quickActions: QuickActionView[];
}

/** 世界面板外部回调集合。 */
interface WorldPanelCallbacks {
  onOpenLeaderboard?: () => void;
  onOpenWorldSummary?: () => void;
}

/** 附近妖兽条目的 DOM 引用。 */
interface NearbyMonsterRefs {
  nameNode: HTMLElement;
  metaNode: HTMLElement;
  statusNode: HTMLElement;
}

/** 建议动作条目的 DOM 引用。 */
interface SuggestionActionRefs {
  titleNode: HTMLElement;
  descNode: HTMLElement;
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

/** inferRealm：处理infer境界。 */
function inferRealm(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  const highest = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

/** resolveRecommendedRealmLabel：解析Recommended境界标签。 */
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

/** buildMonsterStatus：构建妖兽状态。 */
function buildMonsterStatus(distance: number): string {
  return distance <= 2 ? '近身' : distance <= 5 ? '逼近' : '远处';
}

/** isSameStringSequence：判断是否Same String Sequence。 */
function isSameStringSequence(previous: string[] | null, next: string[]): boolean {
  if (!previous || previous.length !== next.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

/** WorldPanel：世界面板实现。 */
export class WorldPanel {
  /** mapPane：地图Pane。 */
  private mapPane = document.getElementById('pane-map-intel')!;
  /** nearbyPane：nearby Pane。 */
  private nearbyPane = document.getElementById('pane-nearby')!;
  /** suggestionPane：建议Pane。 */
  private suggestionPane = document.getElementById('pane-suggestions')!;
  /** lastNearbyMonsterIds：last Nearby妖兽ID 列表。 */
  private lastNearbyMonsterIds: string[] | null = null;
  /** lastNearbyNpcIds：last Nearby NPC ID 列表。 */
  private lastNearbyNpcIds: string[] | null = null;
  /** lastSuggestionActionIds：last建议动作ID 列表。 */
  private lastSuggestionActionIds: string[] | null = null;
  /** nearbyMonsterRefs：nearby妖兽Refs。 */
  private nearbyMonsterRefs = new Map<string, NearbyMonsterRefs>();
  /** nearbyNpcNameRefs：nearby NPC名称Refs。 */
  private nearbyNpcNameRefs = new Map<string, HTMLElement>();
  /** suggestionActionRefs：建议动作Refs。 */
  private suggestionActionRefs = new Map<string, SuggestionActionRefs>();
  /** callbacks：callbacks。 */
  private callbacks: WorldPanelCallbacks = {};

  constructor() {
    this.bindSuggestionPaneEvents();
  }

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: WorldPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 根据玩家、地图、实体、行动、任务数据刷新三个子面板 */
  update(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
    entities: VisibleEntity[];
    actions: ActionDef[];
    quests: QuestState[];
  }): void {
    const snapshot = this.buildSnapshot(input);
    this.syncMapPane(snapshot);
    this.syncNearbyPane(snapshot);
    this.syncSuggestionPane(snapshot);
  }

  /** clear：清理clear。 */
  clear(): void {
    this.mapPane.innerHTML = '<div class="empty-hint ui-empty-hint">尚未进入世界</div>';
    this.nearbyPane.innerHTML = '<div class="empty-hint ui-empty-hint">尚未进入世界</div>';
    this.suggestionPane.innerHTML = '<div class="empty-hint ui-empty-hint">尚未进入世界</div>';
    this.lastNearbyMonsterIds = null;
    this.lastNearbyNpcIds = null;
    this.lastSuggestionActionIds = null;
    this.nearbyMonsterRefs.clear();
    this.nearbyNpcNameRefs.clear();
    this.suggestionActionRefs.clear();
  }

  private buildSnapshot(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
    entities: VisibleEntity[];
    actions: ActionDef[];
    quests: QuestState[];
  }): WorldPanelSnapshot {
    const guide = WORLD_GUIDE[input.player.mapId] ?? {
      title: input.mapMeta?.name ?? input.player.mapId,
      recommendedRealm: input.mapMeta?.recommendedRealm ?? '未知',
      route: '继续探索当前区域',
      mood: '未知地域',
      desc: '该区域暂无卷宗记载，建议稳步试探。',
      resources: [],
      threats: [],
    };

    const danger = assessMapDanger(input.player, input.mapMeta?.recommendedRealm, guide.recommendedRealm);
    const recommend = danger.recommendedRealmLabel === '未知'
      ? resolveRecommendedRealmLabel(input.mapMeta?.recommendedRealm, guide.recommendedRealm)
      : danger.recommendedRealmLabel;
    const cultivating = input.player.cultivatingTechId
      ? input.player.techniques.find((entry) => entry.techId === input.player.cultivatingTechId)
      : null;
    const currentQuest = input.quests.find((entry) => entry.status === 'ready')
      ?? input.quests.find((entry) => entry.status === 'active');
    const nearbyMonsters = input.entities
      .filter((entity) => entity.kind === 'monster')
      .map((entity) => ({
        id: entity.id ?? entity.name ?? '',
        name: entity.name ?? entity.id ?? '未知妖兽',
        tier: entity.monsterTier,
        distance: gridDistance({ x: entity.wx, y: entity.wy }, input.player),
        hp: entity.hp ?? 0,
        maxHp: entity.maxHp ?? 0,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    const nearbyNpcs = input.entities
      .filter((entity) => entity.kind === 'npc')
      .slice(0, 4)
      .map((entity) => ({
        id: entity.id ?? entity.name ?? '',
        name: entity.name ?? entity.id ?? '未知人物',
      }));
    const quickActions = input.actions
      .filter((action) => action.cooldownLeft === 0)
      .slice(0, 6)
      .map((action) => ({
        id: action.id,
        name: action.name,
        desc: action.desc,
      }));

    return {
      mapName: input.mapMeta?.name ?? guide.title,
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
      currentQuestTitle: currentQuest?.title ?? '继续推进或补修炼',
      currentQuestProgress: currentQuest ? `${currentQuest.targetName} ${currentQuest.progress}/${currentQuest.required}` : '暂无',
      nearbyMonsters,
      nearbyNpcs,
      quickActions,
    };
  }

  /** syncMapPane：同步地图Pane。 */
  private syncMapPane(snapshot: WorldPanelSnapshot): void {
    if (!this.patchMapPane(snapshot)) {
      this.renderMapPane(snapshot);
      this.patchMapPane(snapshot);
    }
  }

  /** syncNearbyPane：同步Nearby Pane。 */
  private syncNearbyPane(snapshot: WorldPanelSnapshot): void {
    const monsterIds = snapshot.nearbyMonsters.map((monster) => monster.id);
    const npcIds = snapshot.nearbyNpcs.map((npc) => npc.id);
    if (
      !isSameStringSequence(this.lastNearbyMonsterIds, monsterIds)
      || !isSameStringSequence(this.lastNearbyNpcIds, npcIds)
      || !this.patchNearbyPane(snapshot)
    ) {
      this.renderNearbyPane(snapshot);
      this.patchNearbyPane(snapshot);
    }
  }

  /** syncSuggestionPane：同步建议Pane。 */
  private syncSuggestionPane(snapshot: WorldPanelSnapshot): void {
    const actionIds = snapshot.quickActions.map((action) => action.id);
    if (!isSameStringSequence(this.lastSuggestionActionIds, actionIds) || !this.patchSuggestionPane(snapshot)) {
      this.renderSuggestionPane(snapshot);
      this.patchSuggestionPane(snapshot);
    }
  }

  /** renderMapPane：渲染地图Pane。 */
  private renderMapPane(snapshot: WorldPanelSnapshot): void {
    const html = `
      <div class="world-hero compact">
        <div>
          <div class="world-kicker" data-world-map-mood="true">${escapeHtml(snapshot.mapMood)}</div>
          <div class="world-title" data-world-map-title="true">${escapeHtml(snapshot.mapName)}</div>
          <div class="world-desc" data-world-map-desc="true">${escapeHtml(snapshot.mapDesc)}</div>
        </div>
        <div class="world-danger">
          <div class="world-danger-label">区域危险</div>
          <div class="world-danger-value danger-${snapshot.dangerTone}" data-world-map-danger="true">${escapeHtml(snapshot.dangerLabel)}</div>
          <div class="world-danger-sub" data-world-map-recommend="true">推荐境界：${escapeHtml(snapshot.recommend)}</div>
        </div>
      </div>
      <div class="info-list ui-key-value-list">
        <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">当前阶段</span><strong class="ui-key-value-value" data-world-map-realm="true">${escapeHtml(snapshot.realmLabel)}</strong></div>
        <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">推进路线</span><strong class="ui-key-value-value" data-world-map-route="true">${escapeHtml(snapshot.route)}</strong></div>
        <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">主要资源</span><strong class="ui-key-value-value" data-world-map-resources="true">${escapeHtml(snapshot.resourcesLabel)}</strong></div>
        <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">主要威胁</span><strong class="ui-key-value-value" data-world-map-threats="true">${escapeHtml(snapshot.threatsLabel)}</strong></div>
        <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">当前主修</span><strong class="ui-key-value-value" data-world-map-cultivating="true">${escapeHtml(snapshot.cultivatingName)}</strong></div>
      </div>
    `;
    preserveSelection(this.mapPane, () => {
      this.mapPane.innerHTML = html;
    });
  }

  /** renderNearbyPane：渲染Nearby Pane。 */
  private renderNearbyPane(snapshot: WorldPanelSnapshot): void {
    const html = `
      ${snapshot.nearbyMonsters.length === 0 && snapshot.nearbyNpcs.length === 0 ? '<div class="empty-hint ui-empty-hint">附近暂时平静</div>' : ''}
      ${snapshot.nearbyMonsters.length > 0 ? `
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">附近威胁</div>
          <div class="entity-list ui-card-list">
            ${snapshot.nearbyMonsters.map((monster) => `
              <div class="entity-card threat ui-surface-card ui-surface-card--compact" data-world-monster-card="${escapeHtml(monster.id)}">
                <div>
                  <div class="entity-name" data-world-monster-name="${escapeHtml(monster.id)}">${this.renderMonsterName(monster)}</div>
                  <div class="entity-meta" data-world-monster-meta="${escapeHtml(monster.id)}">距离 ${formatDisplayInteger(monster.distance)} 格 · HP ${formatDisplayCurrentMax(monster.hp, monster.maxHp)}</div>
                </div>
                <div class="entity-hp" data-world-monster-status="${escapeHtml(monster.id)}">${buildMonsterStatus(monster.distance)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${snapshot.nearbyNpcs.length > 0 ? `
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">可交互人物</div>
          <div class="entity-list ui-card-list">
            ${snapshot.nearbyNpcs.map((npc) => `
              <div class="entity-card ally ui-surface-card ui-surface-card--compact" data-world-npc-card="${escapeHtml(npc.id)}">
                <div>
                  <div class="entity-name" data-world-npc-name="${escapeHtml(npc.id)}">${escapeHtml(npc.name)}</div>
                  <div class="entity-meta">就在视野附近，可尝试接话或交任务</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
    preserveSelection(this.nearbyPane, () => {
      this.nearbyPane.innerHTML = html;
    });
    this.captureNearbyRefs(snapshot);
  }

  /** renderSuggestionPane：渲染建议Pane。 */
  private renderSuggestionPane(snapshot: WorldPanelSnapshot): void {
    const html = `
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">当前建议</div>
        <div class="info-list ui-key-value-list">
          <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">优先事项</span><strong class="ui-key-value-value" data-world-suggestion-priority="true">${escapeHtml(snapshot.currentQuestTitle)}</strong></div>
          <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">任务节点</span><strong class="ui-key-value-value" data-world-suggestion-progress="true">${escapeHtml(snapshot.currentQuestProgress)}</strong></div>
        </div>
      </div>
      ${snapshot.quickActions.length === 0 ? '<div class="empty-hint ui-empty-hint">当前没有可立即执行的行动</div>' : `
        <div class="action-suggestion-list ui-card-list">
          ${snapshot.quickActions.map((action) => `
            <div class="suggestion-card ui-surface-card ui-surface-card--compact" data-world-quick-action="${escapeHtml(action.id)}">
              <div class="suggestion-title" data-world-quick-action-title="${escapeHtml(action.id)}">${escapeHtml(action.name)}</div>
              <div class="suggestion-desc" data-world-quick-action-desc="${escapeHtml(action.id)}">${escapeHtml(action.desc)}</div>
            </div>
          `).join('')}
        </div>
      `}
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">世界情报</div>
        <div class="ui-action-row ui-action-row--start">
          <button class="small-btn ghost" type="button" data-world-open-leaderboard="true">天下榜</button>
          <button class="small-btn ghost" type="button" data-world-open-summary="true">世界总览</button>
        </div>
      </div>
    `;
    preserveSelection(this.suggestionPane, () => {
      this.suggestionPane.innerHTML = html;
    });
    this.captureSuggestionRefs(snapshot);
  }

  /** patchMapPane：处理patch地图Pane。 */
  private patchMapPane(snapshot: WorldPanelSnapshot): boolean {
    const moodNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-mood="true"]');
    const titleNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-title="true"]');
    const descNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-desc="true"]');
    const dangerNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-danger="true"]');
    const recommendNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-recommend="true"]');
    const realmNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-realm="true"]');
    const routeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-route="true"]');
    const resourcesNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-resources="true"]');
    const threatsNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-threats="true"]');
    const cultivatingNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-cultivating="true"]');
    if (
      !moodNode
      || !titleNode
      || !descNode
      || !dangerNode
      || !recommendNode
      || !realmNode
      || !routeNode
      || !resourcesNode
      || !threatsNode
      || !cultivatingNode
    ) {
      return false;
    }

    moodNode.textContent = snapshot.mapMood;
    titleNode.textContent = snapshot.mapName;
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

  /** patchNearbyPane：处理patch Nearby Pane。 */
  private patchNearbyPane(snapshot: WorldPanelSnapshot): boolean {
    if (snapshot.nearbyMonsters.length === 0 && snapshot.nearbyNpcs.length === 0) {
      this.lastNearbyMonsterIds = [];
      this.lastNearbyNpcIds = [];
      this.nearbyMonsterRefs.clear();
      this.nearbyNpcNameRefs.clear();
      return this.nearbyPane.querySelector('.empty-hint') !== null;
    }

    for (const monster of snapshot.nearbyMonsters) {
      const refs = this.nearbyMonsterRefs.get(monster.id);
      if (!refs) {
        return false;
      }
      refs.nameNode.innerHTML = this.renderMonsterName(monster);
      refs.metaNode.textContent = `距离 ${formatDisplayInteger(monster.distance)} 格 · HP ${formatDisplayCurrentMax(monster.hp, monster.maxHp)}`;
      refs.statusNode.textContent = buildMonsterStatus(monster.distance);
    }

    for (const npc of snapshot.nearbyNpcs) {
      const nameNode = this.nearbyNpcNameRefs.get(npc.id);
      if (!nameNode) {
        return false;
      }
      nameNode.textContent = npc.name;
    }

    this.lastNearbyMonsterIds = snapshot.nearbyMonsters.map((monster) => monster.id);
    this.lastNearbyNpcIds = snapshot.nearbyNpcs.map((npc) => npc.id);
    return true;
  }

  /** patchSuggestionPane：处理patch建议Pane。 */
  private patchSuggestionPane(snapshot: WorldPanelSnapshot): boolean {
    const priorityNode = this.suggestionPane.querySelector<HTMLElement>('[data-world-suggestion-priority="true"]');
    const progressNode = this.suggestionPane.querySelector<HTMLElement>('[data-world-suggestion-progress="true"]');
    if (!priorityNode || !progressNode) {
      return false;
    }

    priorityNode.textContent = snapshot.currentQuestTitle;
    progressNode.textContent = snapshot.currentQuestProgress;

    if (snapshot.quickActions.length === 0) {
      this.lastSuggestionActionIds = [];
      this.suggestionActionRefs.clear();
      return this.suggestionPane.querySelector('.empty-hint') !== null;
    }

    for (const action of snapshot.quickActions) {
      const refs = this.suggestionActionRefs.get(action.id);
      if (!refs) {
        return false;
      }
      refs.titleNode.textContent = action.name;
      refs.descNode.textContent = action.desc;
    }

    this.lastSuggestionActionIds = snapshot.quickActions.map((action) => action.id);
    return true;
  }

  /** captureNearbyRefs：处理capture Nearby Refs。 */
  private captureNearbyRefs(snapshot: WorldPanelSnapshot): void {
    this.nearbyMonsterRefs.clear();
    this.nearbyNpcNameRefs.clear();
    for (const monster of snapshot.nearbyMonsters) {
      const card = this.nearbyPane.querySelector<HTMLElement>(`[data-world-monster-card="${CSS.escape(monster.id)}"]`);
      const nameNode = card?.querySelector<HTMLElement>('[data-world-monster-name]');
      const metaNode = card?.querySelector<HTMLElement>('[data-world-monster-meta]');
      const statusNode = card?.querySelector<HTMLElement>('[data-world-monster-status]');
      if (card && nameNode && metaNode && statusNode) {
        this.nearbyMonsterRefs.set(monster.id, { nameNode, metaNode, statusNode });
      }
    }
    for (const npc of snapshot.nearbyNpcs) {
      const card = this.nearbyPane.querySelector<HTMLElement>(`[data-world-npc-card="${CSS.escape(npc.id)}"]`);
      const nameNode = card?.querySelector<HTMLElement>('[data-world-npc-name]');
      if (card && nameNode) {
        this.nearbyNpcNameRefs.set(npc.id, nameNode);
      }
    }
    this.lastNearbyMonsterIds = snapshot.nearbyMonsters.map((monster) => monster.id);
    this.lastNearbyNpcIds = snapshot.nearbyNpcs.map((npc) => npc.id);
  }

  /** captureSuggestionRefs：处理capture建议Refs。 */
  private captureSuggestionRefs(snapshot: WorldPanelSnapshot): void {
    this.suggestionActionRefs.clear();
    for (const action of snapshot.quickActions) {
      const card = this.suggestionPane.querySelector<HTMLElement>(`[data-world-quick-action="${CSS.escape(action.id)}"]`);
      const titleNode = card?.querySelector<HTMLElement>('[data-world-quick-action-title]');
      const descNode = card?.querySelector<HTMLElement>('[data-world-quick-action-desc]');
      if (card && titleNode && descNode) {
        this.suggestionActionRefs.set(action.id, { titleNode, descNode });
      }
    }
    this.lastSuggestionActionIds = snapshot.quickActions.map((action) => action.id);
  }

  /** renderMonsterName：渲染妖兽名称。 */
  private renderMonsterName(monster: NearbyMonsterView): string {
    const presentation = getMonsterPresentation(monster.name, monster.tier);
    const badge = presentation.badgeText
      ? `<span class="${presentation.badgeClassName}">${escapeHtml(presentation.badgeText)}</span>`
      : '';
    return `${badge}${escapeHtml(presentation.label)}`;
  }

  /** bindSuggestionPaneEvents：绑定建议Pane事件。 */
  private bindSuggestionPaneEvents(): void {
    this.suggestionPane.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest('[data-world-open-leaderboard]')) {
        this.callbacks.onOpenLeaderboard?.();
        event.preventDefault();
        return;
      }
      if (target.closest('[data-world-open-summary]')) {
        this.callbacks.onOpenWorldSummary?.();
        event.preventDefault();
      }
    });
  }
}
