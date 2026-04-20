/**
 * 世界面板
 * 展示当前地图情报、附近实体、任务建议与可执行行动
 */

import { ActionDef, gridDistance, MapMeta, MonsterTier, PlayerState, QuestState } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';
import { TECH_REALM_LABELS, TECH_REALM_NAME_BY_KEY, WORLD_GUIDE } from '../../constants/world/world-panel';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../../utils/number';
import { getMonsterPresentation } from '../../monster-presentation';
import { assessMapDanger } from '../../utils/map-danger';

/** VisibleEntity：定义该接口的能力与字段约束。 */
interface VisibleEntity {
/** id：定义该变量以承载业务值。 */
  id: string;
/** wx：定义该变量以承载业务值。 */
  wx: number;
/** wy：定义该变量以承载业务值。 */
  wy: number;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  hp?: number;
  maxHp?: number;
}

/** NearbyMonsterView：定义该接口的能力与字段约束。 */
interface NearbyMonsterView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
  tier?: MonsterTier;
/** distance：定义该变量以承载业务值。 */
  distance: number;
/** hp：定义该变量以承载业务值。 */
  hp: number;
/** maxHp：定义该变量以承载业务值。 */
  maxHp: number;
}

/** NearbyNpcView：定义该接口的能力与字段约束。 */
interface NearbyNpcView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
}

/** QuickActionView：定义该接口的能力与字段约束。 */
interface QuickActionView {
/** id：定义该变量以承载业务值。 */
  id: string;
/** name：定义该变量以承载业务值。 */
  name: string;
/** desc：定义该变量以承载业务值。 */
  desc: string;
}

/** WorldPanelSnapshot：定义该接口的能力与字段约束。 */
interface WorldPanelSnapshot {
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
/** mapMood：定义该变量以承载业务值。 */
  mapMood: string;
/** mapDesc：定义该变量以承载业务值。 */
  mapDesc: string;
/** dangerLabel：定义该变量以承载业务值。 */
  dangerLabel: string;
/** dangerTone：定义该变量以承载业务值。 */
  dangerTone: number;
/** recommend：定义该变量以承载业务值。 */
  recommend: string;
/** realmLabel：定义该变量以承载业务值。 */
  realmLabel: string;
/** route：定义该变量以承载业务值。 */
  route: string;
/** resourcesLabel：定义该变量以承载业务值。 */
  resourcesLabel: string;
/** threatsLabel：定义该变量以承载业务值。 */
  threatsLabel: string;
/** cultivatingName：定义该变量以承载业务值。 */
  cultivatingName: string;
/** currentQuestTitle：定义该变量以承载业务值。 */
  currentQuestTitle: string;
/** currentQuestProgress：定义该变量以承载业务值。 */
  currentQuestProgress: string;
/** nearbyMonsters：定义该变量以承载业务值。 */
  nearbyMonsters: NearbyMonsterView[];
/** nearbyNpcs：定义该变量以承载业务值。 */
  nearbyNpcs: NearbyNpcView[];
/** quickActions：定义该变量以承载业务值。 */
  quickActions: QuickActionView[];
}

/** NearbyMonsterRefs：定义该接口的能力与字段约束。 */
interface NearbyMonsterRefs {
/** nameNode：定义该变量以承载业务值。 */
  nameNode: HTMLElement;
/** metaNode：定义该变量以承载业务值。 */
  metaNode: HTMLElement;
/** statusNode：定义该变量以承载业务值。 */
  statusNode: HTMLElement;
}

/** SuggestionActionRefs：定义该接口的能力与字段约束。 */
interface SuggestionActionRefs {
/** titleNode：定义该变量以承载业务值。 */
  titleNode: HTMLElement;
/** descNode：定义该变量以承载业务值。 */
  descNode: HTMLElement;
}

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** inferRealm：执行对应的业务逻辑。 */
function inferRealm(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
/** highest：定义该变量以承载业务值。 */
  const highest = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

/** resolveRecommendedRealmLabel：执行对应的业务逻辑。 */
function resolveRecommendedRealmLabel(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (/[^\x00-\x7F]/.test(raw)) return raw;
/** parts：定义该变量以承载业务值。 */
  const parts = raw.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
/** labels：定义该变量以承载业务值。 */
  const labels = parts.map((part) => TECH_REALM_NAME_BY_KEY[part]);
  if (labels.some((label) => !label)) {
    return fallback;
  }
  return labels.join('到');
}

/** buildMonsterStatus：执行对应的业务逻辑。 */
function buildMonsterStatus(distance: number): string {
  return distance <= 2 ? '近身' : distance <= 5 ? '逼近' : '远处';
}

/** isSameStringSequence：执行对应的业务逻辑。 */
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

/** WorldPanel：封装相关状态与行为。 */
export class WorldPanel {
  private mapPane = document.getElementById('pane-map-intel')!;
  private nearbyPane = document.getElementById('pane-nearby')!;
  private suggestionPane = document.getElementById('pane-suggestions')!;
  private tianjiPane = document.getElementById('pane-tianji')!;
/** lastNearbyMonsterIds：定义该变量以承载业务值。 */
  private lastNearbyMonsterIds: string[] | null = null;
/** lastNearbyNpcIds：定义该变量以承载业务值。 */
  private lastNearbyNpcIds: string[] | null = null;
/** lastSuggestionActionIds：定义该变量以承载业务值。 */
  private lastSuggestionActionIds: string[] | null = null;
  private nearbyMonsterRefs = new Map<string, NearbyMonsterRefs>();
  private nearbyNpcNameRefs = new Map<string, HTMLElement>();
  private suggestionActionRefs = new Map<string, SuggestionActionRefs>();
  private onOpenWorldSummary: (() => void) | null = null;
  private onOpenLeaderboard: (() => void) | null = null;

  setCallbacks(callbacks: {
    onOpenWorldSummary?: () => void;
    onOpenLeaderboard?: () => void;
  }): void {
    this.onOpenWorldSummary = callbacks.onOpenWorldSummary ?? null;
    this.onOpenLeaderboard = callbacks.onOpenLeaderboard ?? null;
  }

  /** 根据玩家、地图、实体、行动、任务数据刷新三个子面板 */
  update(input: {
/** player：定义该变量以承载业务值。 */
    player: PlayerState;
/** mapMeta：定义该变量以承载业务值。 */
    mapMeta: MapMeta | null;
/** entities：定义该变量以承载业务值。 */
    entities: VisibleEntity[];
/** actions：定义该变量以承载业务值。 */
    actions: ActionDef[];
/** quests：定义该变量以承载业务值。 */
    quests: QuestState[];
  }): void {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.buildSnapshot(input);
    this.syncMapPane(snapshot);
    this.syncNearbyPane(snapshot);
    this.syncSuggestionPane(snapshot);
    this.syncTianjiPane();
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.mapPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.nearbyPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.suggestionPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.tianjiPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.lastNearbyMonsterIds = null;
    this.lastNearbyNpcIds = null;
    this.lastSuggestionActionIds = null;
    this.nearbyMonsterRefs.clear();
    this.nearbyNpcNameRefs.clear();
    this.suggestionActionRefs.clear();
  }

  private buildSnapshot(input: {
/** player：定义该变量以承载业务值。 */
    player: PlayerState;
/** mapMeta：定义该变量以承载业务值。 */
    mapMeta: MapMeta | null;
/** entities：定义该变量以承载业务值。 */
    entities: VisibleEntity[];
/** actions：定义该变量以承载业务值。 */
    actions: ActionDef[];
/** quests：定义该变量以承载业务值。 */
    quests: QuestState[];
  }): WorldPanelSnapshot {
/** guide：定义该变量以承载业务值。 */
    const guide = WORLD_GUIDE[input.player.mapId] ?? {
      title: input.mapMeta?.name ?? input.player.mapId,
      recommendedRealm: input.mapMeta?.recommendedRealm ?? '未知',
      route: '继续探索当前区域',
      mood: '未知地域',
      desc: '该区域暂无卷宗记载，建议稳步试探。',
      resources: [],
      threats: [],
    };

/** danger：定义该变量以承载业务值。 */
    const danger = assessMapDanger(input.player, input.mapMeta?.recommendedRealm, guide.recommendedRealm);
/** recommend：定义该变量以承载业务值。 */
    const recommend = danger.recommendedRealmLabel === '未知'
      ? resolveRecommendedRealmLabel(input.mapMeta?.recommendedRealm, guide.recommendedRealm)
      : danger.recommendedRealmLabel;
/** cultivating：定义该变量以承载业务值。 */
    const cultivating = input.player.cultivatingTechId
      ? input.player.techniques.find((entry) => entry.techId === input.player.cultivatingTechId)
      : null;
/** currentQuest：定义该变量以承载业务值。 */
    const currentQuest = input.quests.find((entry) => entry.status === 'ready')
      ?? input.quests.find((entry) => entry.status === 'active');
/** nearbyMonsters：定义该变量以承载业务值。 */
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
/** nearbyNpcs：定义该变量以承载业务值。 */
    const nearbyNpcs = input.entities
      .filter((entity) => entity.kind === 'npc')
      .slice(0, 4)
      .map((entity) => ({
        id: entity.id ?? entity.name ?? '',
        name: entity.name ?? entity.id ?? '未知人物',
      }));
/** quickActions：定义该变量以承载业务值。 */
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

/** syncMapPane：执行对应的业务逻辑。 */
  private syncMapPane(snapshot: WorldPanelSnapshot): void {
    if (!this.patchMapPane(snapshot)) {
      this.renderMapPane(snapshot);
      this.patchMapPane(snapshot);
    }
  }

/** syncNearbyPane：执行对应的业务逻辑。 */
  private syncNearbyPane(snapshot: WorldPanelSnapshot): void {
/** monsterIds：定义该变量以承载业务值。 */
    const monsterIds = snapshot.nearbyMonsters.map((monster) => monster.id);
/** npcIds：定义该变量以承载业务值。 */
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

/** syncSuggestionPane：执行对应的业务逻辑。 */
  private syncSuggestionPane(snapshot: WorldPanelSnapshot): void {
/** actionIds：定义该变量以承载业务值。 */
    const actionIds = snapshot.quickActions.map((action) => action.id);
    if (!isSameStringSequence(this.lastSuggestionActionIds, actionIds) || !this.patchSuggestionPane(snapshot)) {
      this.renderSuggestionPane(snapshot);
      this.patchSuggestionPane(snapshot);
    }
  }

/** syncTianjiPane：执行对应的业务逻辑。 */
  private syncTianjiPane(): void {
    if (!this.patchTianjiPane()) {
      this.renderTianjiPane();
      this.patchTianjiPane();
    }
  }

/** renderMapPane：执行对应的业务逻辑。 */
  private renderMapPane(snapshot: WorldPanelSnapshot): void {
/** html：定义该变量以承载业务值。 */
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
      <div class="info-list">
        <div class="info-line"><span>当前阶段</span><strong data-world-map-realm="true">${escapeHtml(snapshot.realmLabel)}</strong></div>
        <div class="info-line"><span>推进路线</span><strong data-world-map-route="true">${escapeHtml(snapshot.route)}</strong></div>
        <div class="info-line"><span>主要资源</span><strong data-world-map-resources="true">${escapeHtml(snapshot.resourcesLabel)}</strong></div>
        <div class="info-line"><span>主要威胁</span><strong data-world-map-threats="true">${escapeHtml(snapshot.threatsLabel)}</strong></div>
        <div class="info-line"><span>当前主修</span><strong data-world-map-cultivating="true">${escapeHtml(snapshot.cultivatingName)}</strong></div>
      </div>
    `;
    preserveSelection(this.mapPane, () => {
      this.mapPane.innerHTML = html;
    });
  }

/** renderNearbyPane：执行对应的业务逻辑。 */
  private renderNearbyPane(snapshot: WorldPanelSnapshot): void {
/** html：定义该变量以承载业务值。 */
    const html = `
      ${snapshot.nearbyMonsters.length === 0 && snapshot.nearbyNpcs.length === 0 ? '<div class="empty-hint">附近暂时平静</div>' : ''}
      ${snapshot.nearbyMonsters.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-title">附近威胁</div>
          <div class="entity-list">
            ${snapshot.nearbyMonsters.map((monster) => `
              <div class="entity-card threat" data-world-monster-card="${escapeHtml(monster.id)}">
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
        <div class="panel-section">
          <div class="panel-section-title">可交互人物</div>
          <div class="entity-list">
            ${snapshot.nearbyNpcs.map((npc) => `
              <div class="entity-card ally" data-world-npc-card="${escapeHtml(npc.id)}">
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

/** renderSuggestionPane：执行对应的业务逻辑。 */
  private renderSuggestionPane(snapshot: WorldPanelSnapshot): void {
/** html：定义该变量以承载业务值。 */
    const html = `
      <div class="panel-section">
        <div class="panel-section-title">当前建议</div>
        <div class="info-list">
          <div class="info-line"><span>优先事项</span><strong data-world-suggestion-priority="true">${escapeHtml(snapshot.currentQuestTitle)}</strong></div>
          <div class="info-line"><span>任务节点</span><strong data-world-suggestion-progress="true">${escapeHtml(snapshot.currentQuestProgress)}</strong></div>
        </div>
      </div>
      ${snapshot.quickActions.length === 0 ? '<div class="empty-hint">当前没有可立即执行的行动</div>' : `
        <div class="action-suggestion-list">
          ${snapshot.quickActions.map((action) => `
            <div class="suggestion-card" data-world-quick-action="${escapeHtml(action.id)}">
              <div class="suggestion-title" data-world-quick-action-title="${escapeHtml(action.id)}">${escapeHtml(action.name)}</div>
              <div class="suggestion-desc" data-world-quick-action-desc="${escapeHtml(action.id)}">${escapeHtml(action.desc)}</div>
            </div>
          `).join('')}
        </div>
      `}
    `;
    preserveSelection(this.suggestionPane, () => {
      this.suggestionPane.innerHTML = html;
    });
    this.captureSuggestionRefs(snapshot);
  }

/** renderTianjiPane：执行对应的业务逻辑。 */
  private renderTianjiPane(): void {
/** html：定义该变量以承载业务值。 */
    const html = `
      <div class="panel-section">
        <div class="panel-section-title">天机阁</div>
        <div class="panel-subtext">阁藏天下卷宗，专收低频榜册与汇总情报。</div>
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
            <div class="tianji-action-desc">查看境界、击杀、灵石、死亡、炼体与四维最强榜单。</div>
          </div>
          <div class="tianji-action-arrow">查看</div>
        </button>
      </div>
    `;
    preserveSelection(this.tianjiPane, () => {
      this.tianjiPane.innerHTML = html;
    });
    this.tianjiPane.querySelectorAll<HTMLButtonElement>('[data-world-tianji-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.worldTianjiAction === 'world') {
          this.onOpenWorldSummary?.();
        } else if (button.dataset.worldTianjiAction === 'leaderboard') {
          this.onOpenLeaderboard?.();
        }
      });
    });
  }

/** patchMapPane：执行对应的业务逻辑。 */
  private patchMapPane(snapshot: WorldPanelSnapshot): boolean {
/** moodNode：定义该变量以承载业务值。 */
    const moodNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-mood="true"]');
/** titleNode：定义该变量以承载业务值。 */
    const titleNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-title="true"]');
/** descNode：定义该变量以承载业务值。 */
    const descNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-desc="true"]');
/** dangerNode：定义该变量以承载业务值。 */
    const dangerNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-danger="true"]');
/** recommendNode：定义该变量以承载业务值。 */
    const recommendNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-recommend="true"]');
/** realmNode：定义该变量以承载业务值。 */
    const realmNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-realm="true"]');
/** routeNode：定义该变量以承载业务值。 */
    const routeNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-route="true"]');
/** resourcesNode：定义该变量以承载业务值。 */
    const resourcesNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-resources="true"]');
/** threatsNode：定义该变量以承载业务值。 */
    const threatsNode = this.mapPane.querySelector<HTMLElement>('[data-world-map-threats="true"]');
/** cultivatingNode：定义该变量以承载业务值。 */
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

/** patchNearbyPane：执行对应的业务逻辑。 */
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

/** patchSuggestionPane：执行对应的业务逻辑。 */
  private patchSuggestionPane(snapshot: WorldPanelSnapshot): boolean {
/** priorityNode：定义该变量以承载业务值。 */
    const priorityNode = this.suggestionPane.querySelector<HTMLElement>('[data-world-suggestion-priority="true"]');
/** progressNode：定义该变量以承载业务值。 */
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

/** patchTianjiPane：执行对应的业务逻辑。 */
  private patchTianjiPane(): boolean {
    return this.tianjiPane.querySelector('[data-world-tianji-action="world"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-action="leaderboard"]') !== null;
  }

/** captureNearbyRefs：执行对应的业务逻辑。 */
  private captureNearbyRefs(snapshot: WorldPanelSnapshot): void {
    this.nearbyMonsterRefs.clear();
    this.nearbyNpcNameRefs.clear();
    for (const monster of snapshot.nearbyMonsters) {
      const card = this.nearbyPane.querySelector<HTMLElement>(`[data-world-monster-card="${CSS.escape(monster.id)}"]`);
      const nameNode = card?.querySelector<HTMLElement>('[data-world-monster-name]');
/** metaNode：定义该变量以承载业务值。 */
      const metaNode = card?.querySelector<HTMLElement>('[data-world-monster-meta]');
/** statusNode：定义该变量以承载业务值。 */
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

/** captureSuggestionRefs：执行对应的业务逻辑。 */
  private captureSuggestionRefs(snapshot: WorldPanelSnapshot): void {
    this.suggestionActionRefs.clear();
    for (const action of snapshot.quickActions) {
      const card = this.suggestionPane.querySelector<HTMLElement>(`[data-world-quick-action="${CSS.escape(action.id)}"]`);
      const titleNode = card?.querySelector<HTMLElement>('[data-world-quick-action-title]');
/** descNode：定义该变量以承载业务值。 */
      const descNode = card?.querySelector<HTMLElement>('[data-world-quick-action-desc]');
      if (card && titleNode && descNode) {
        this.suggestionActionRefs.set(action.id, { titleNode, descNode });
      }
    }
    this.lastSuggestionActionIds = snapshot.quickActions.map((action) => action.id);
  }

/** renderMonsterName：执行对应的业务逻辑。 */
  private renderMonsterName(monster: NearbyMonsterView): string {
/** presentation：定义该变量以承载业务值。 */
    const presentation = getMonsterPresentation(monster.name, monster.tier);
/** badge：定义该变量以承载业务值。 */
    const badgeClassName = presentation.badge
      ? presentation.badge.tone === 'boss'
        ? 'monster-badge monster-badge--boss'
        : presentation.badge.tone === 'demonic'
          ? 'monster-badge monster-badge--boss'
          : 'monster-badge monster-badge--variant'
      : '';
    const badge = presentation.badge
      ? `<span class="${badgeClassName}">${escapeHtml(presentation.badge.text)}</span>`
      : '';
    return `${badge}${escapeHtml(presentation.label)}`;
  }
}
