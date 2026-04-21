/**
 * 世界面板
 * 展示当前地图情报、附近实体、任务建议与可执行行动
 */
import { ActionDef, gridDistance, MapMeta, MonsterTier, PlayerState, QuestState } from '@mud/shared-next';
import { preserveSelection } from '../selection-preserver';
import { TECH_REALM_LABELS, TECH_REALM_NAME_BY_KEY, WORLD_GUIDE } from '../../constants/world/world-panel';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../../utils/number';
import { getEntityBadgeClassName, getMonsterPresentation } from '../../monster-presentation';
import { assessMapDanger } from '../../utils/map-danger';

/** 世界面板可见实体来源。 */
interface VisibleEntity {
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
}

/** 附近妖兽显示项。 */
interface NearbyMonsterView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * tier：tier相关字段。
 */

  tier?: MonsterTier;  
  /**
 * distance：distance相关字段。
 */

  distance: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp: number;
}

/** 附近人物显示项。 */
interface NearbyNpcView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;
}

/** 可立即执行的快捷行动项。 */
interface QuickActionView {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * desc：desc相关字段。
 */

  desc: string;
}

/** 世界面板汇总快照。 */
interface WorldPanelSnapshot {
/**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;  
  /**
 * mapMood：地图Mood相关字段。
 */

  mapMood: string;  
  /**
 * mapDesc：地图Desc相关字段。
 */

  mapDesc: string;  
  /**
 * dangerLabel：dangerLabel名称或显示文本。
 */

  dangerLabel: string;  
  /**
 * dangerTone：dangerTone相关字段。
 */

  dangerTone: number;  
  /**
 * recommend：recommend相关字段。
 */

  recommend: string;  
  /**
 * realmLabel：realmLabel名称或显示文本。
 */

  realmLabel: string;  
  /**
 * route：路线相关字段。
 */

  route: string;  
  /**
 * resourcesLabel：resourceLabel名称或显示文本。
 */

  resourcesLabel: string;  
  /**
 * threatsLabel：threatLabel名称或显示文本。
 */

  threatsLabel: string;  
  /**
 * cultivatingName：cultivating名称名称或显示文本。
 */

  cultivatingName: string;  
  /**
 * currentQuestTitle：current任务Title名称或显示文本。
 */

  currentQuestTitle: string;  
  /**
 * currentQuestProgress：current任务进度状态或数据块。
 */

  currentQuestProgress: string;  
  /**
 * nearbyMonsters：集合字段。
 */

  nearbyMonsters: NearbyMonsterView[];  
  /**
 * nearbyNpcs：nearbyNPC相关字段。
 */

  nearbyNpcs: NearbyNpcView[];  
  /**
 * quickActions：quickAction相关字段。
 */

  quickActions: QuickActionView[];
}

/** 世界面板外部回调集合。 */
interface WorldPanelCallbacks {
/**
 * onOpenLeaderboard：onOpenLeaderboard相关字段。
 */

  onOpenLeaderboard?: () => void;  
  /**
 * onOpenWorldSummary：onOpen世界摘要状态或数据块。
 */

  onOpenWorldSummary?: () => void;
}

/** 附近妖兽条目的 DOM 引用。 */
interface NearbyMonsterRefs {
/**
 * nameNode：名称Node相关字段。
 */

  nameNode: HTMLElement;  
  /**
 * metaNode：metaNode相关字段。
 */

  metaNode: HTMLElement;  
  /**
 * statusNode：statuNode相关字段。
 */

  statusNode: HTMLElement;
}

/** 建议动作条目的 DOM 引用。 */
interface SuggestionActionRefs {
/**
 * titleNode：titleNode相关字段。
 */

  titleNode: HTMLElement;  
  /**
 * descNode：descNode相关字段。
 */

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

/** createFragmentFromHtml：从 HTML 文本创建文档片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** inferRealm：处理infer境界。 */
function inferRealm(player: PlayerState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  const highest = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

/** resolveRecommendedRealmLabel：解析Recommended境界标签。 */
function resolveRecommendedRealmLabel(raw: string | undefined, fallback: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /** tianjiPane：天机阁 Pane。 */
  private tianjiPane = document.getElementById('pane-tianji') ?? document.createElement('div');
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
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.bindSuggestionPaneEvents();
    this.bindTianjiPaneEvents();
  }

  /** setCallbacks：处理set Callbacks。 */
  setCallbacks(callbacks: WorldPanelCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 根据玩家、地图、实体、行动、任务数据刷新三个子面板 */
  update(input: {
  /**
 * player：玩家引用。
 */

    player: PlayerState;    
    /**
 * mapMeta：地图Meta相关字段。
 */

    mapMeta: MapMeta | null;    
    /**
 * entities：entity相关字段。
 */

    entities: VisibleEntity[];    
    /**
 * actions：action相关字段。
 */

    actions: ActionDef[];    
    /**
 * quests：集合字段。
 */

    quests: QuestState[];
  }): void {
    const snapshot = this.buildSnapshot(input);
    this.syncMapPane(snapshot);
    this.syncNearbyPane(snapshot);
    this.syncSuggestionPane(snapshot);
    this.syncTianjiPane();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.mapPane.replaceChildren(createFragmentFromHtml('<div class="empty-hint">尚未进入世界</div>'));
    this.nearbyPane.replaceChildren(createFragmentFromHtml('<div class="empty-hint">尚未进入世界</div>'));
    this.suggestionPane.replaceChildren(createFragmentFromHtml('<div class="empty-hint">尚未进入世界</div>'));
    this.tianjiPane.replaceChildren(createFragmentFromHtml('<div class="empty-hint">尚未进入世界</div>'));
    this.lastNearbyMonsterIds = null;
    this.lastNearbyNpcIds = null;
    this.lastSuggestionActionIds = null;
    this.nearbyMonsterRefs.clear();
    this.nearbyNpcNameRefs.clear();
    this.suggestionActionRefs.clear();
  }  
  /**
 * buildSnapshot：构建并返回目标对象。
 * @param input {
    player: PlayerState;
    mapMeta: MapMeta | null;
    entities: VisibleEntity[];
    actions: ActionDef[];
    quests: QuestState[];
  } 输入参数。
 * @returns 返回快照。
 */


  private buildSnapshot(input: {  
  /**
 * player：玩家引用。
 */

    player: PlayerState;    
    /**
 * mapMeta：地图Meta相关字段。
 */

    mapMeta: MapMeta | null;    
    /**
 * entities：entity相关字段。
 */

    entities: VisibleEntity[];    
    /**
 * actions：action相关字段。
 */

    actions: ActionDef[];    
    /**
 * quests：集合字段。
 */

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const actionIds = snapshot.quickActions.map((action) => action.id);
    if (!isSameStringSequence(this.lastSuggestionActionIds, actionIds) || !this.patchSuggestionPane(snapshot)) {
      this.renderSuggestionPane(snapshot);
      this.patchSuggestionPane(snapshot);
    }
  }

  /** syncTianjiPane：同步天机阁 Pane。 */
  private syncTianjiPane(): void {
    if (!this.patchTianjiPane()) {
      this.renderTianjiPane();
      this.patchTianjiPane();
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
      <div class="info-list">
        <div class="info-line"><span>当前阶段</span><strong data-world-map-realm="true">${escapeHtml(snapshot.realmLabel)}</strong></div>
        <div class="info-line"><span>推进路线</span><strong data-world-map-route="true">${escapeHtml(snapshot.route)}</strong></div>
        <div class="info-line"><span>主要资源</span><strong data-world-map-resources="true">${escapeHtml(snapshot.resourcesLabel)}</strong></div>
        <div class="info-line"><span>主要威胁</span><strong data-world-map-threats="true">${escapeHtml(snapshot.threatsLabel)}</strong></div>
        <div class="info-line"><span>当前主修</span><strong data-world-map-cultivating="true">${escapeHtml(snapshot.cultivatingName)}</strong></div>
      </div>
    `;
    preserveSelection(this.mapPane, () => {
      this.mapPane.replaceChildren(createFragmentFromHtml(html));
    });
  }

  /** renderNearbyPane：渲染Nearby Pane。 */
  private renderNearbyPane(snapshot: WorldPanelSnapshot): void {
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
      this.nearbyPane.replaceChildren(createFragmentFromHtml(html));
    });
    this.captureNearbyRefs(snapshot);
  }

  /** renderSuggestionPane：渲染建议Pane。 */
  private renderSuggestionPane(snapshot: WorldPanelSnapshot): void {
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
      this.suggestionPane.replaceChildren(createFragmentFromHtml(html));
    });
    this.captureSuggestionRefs(snapshot);
  }

  /** renderTianjiPane：渲染天机阁 Pane。 */
  private renderTianjiPane(): void {
    const html = `
      <div class="panel-section">
        <div class="panel-section-title" data-world-tianji-title="true">天机阁</div>
        <div class="panel-subtext" data-world-tianji-desc="true">阁藏天下卷宗，专收低频榜册与汇总情报。</div>
      </div>
      <div class="tianji-action-list">
        <button
          class="tianji-action-card"
          data-world-tianji-action="world"
          type="button"
        >
          <div>
            <div class="tianji-action-title">世界</div>
            <div class="tianji-action-desc">查看全服灵石总和、行动人数、境界人数，以及击杀与死亡总计。</div>
          </div>
          <div class="tianji-action-arrow">查看</div>
        </button>
        <button
          class="tianji-action-card"
          data-world-tianji-action="leaderboard"
          type="button"
        >
          <div>
            <div class="tianji-action-title">排行榜</div>
            <div class="tianji-action-desc">查看境界、击杀、灵石、死亡、炼体与四维最强榜单。</div>
          </div>
          <div class="tianji-action-arrow">查看</div>
        </button>
      </div>
    `;
    preserveSelection(this.tianjiPane, () => {
      this.tianjiPane.replaceChildren(createFragmentFromHtml(html));
    });
  }

  /** patchMapPane：处理patch地图Pane。 */
  private patchMapPane(snapshot: WorldPanelSnapshot): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      refs.nameNode.replaceChildren(createFragmentFromHtml(this.renderMonsterName(monster)));
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** patchTianjiPane：确认天机阁基础结构已就位。 */
  private patchTianjiPane(): boolean {
    return this.tianjiPane.querySelector('[data-world-tianji-title="true"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-desc="true"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-action="leaderboard"]') !== null
      && this.tianjiPane.querySelector('[data-world-tianji-action="world"]') !== null;
  }

  /** captureNearbyRefs：处理capture Nearby Refs。 */
  private captureNearbyRefs(snapshot: WorldPanelSnapshot): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const badgeClassName = getEntityBadgeClassName(presentation.badge);
    const badge = presentation.badge && badgeClassName
      ? `<span class="${badgeClassName}">${escapeHtml(presentation.badge.text)}</span>`
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
