import {
  S2C_Detail,
  S2C_NpcDetail,
  S2C_PlayerDetail,
  S2C_MonsterDetail,
  S2C_ContainerDetail,
  S2C_LeaderboardPlayerLocations,
  VisibleBuffState,
  MONSTER_TIER_LABELS,
  type PartialNumericStats,
  type NpcQuestMarker,
} from '@mud/shared';
import { getEntityKindLabel, getQuestLineLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { patchElementHtml } from './dom-patch';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { describePreviewBonuses } from './stat-preview';

const LEADERBOARD_PLAYER_LOCATION_EVENT = 'mud:leaderboard-player-locations';
type LeaderboardTrackedLocation = S2C_LeaderboardPlayerLocations['entries'][number];

let trackedLeaderboardLocations = new Map<string, LeaderboardTrackedLocation>();

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatPortalTrigger：格式化传送点Trigger。 */
function formatPortalTrigger(trigger: 'manual' | 'auto' | undefined): string {
  return trigger === 'auto' ? '踏入即触发' : '需要主动使用';
}

/** formatRespawnTicks：格式化Respawn Ticks。 */
function formatRespawnTicks(respawnTicks: number | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof respawnTicks !== 'number' || !Number.isFinite(respawnTicks) || respawnTicks <= 0) {
    return '即将重生';
  }
  return `${Math.max(1, Math.round(respawnTicks))} 息后重生`;
}

/** formatNpcQuestMarker：格式化NPC任务标记。 */
function formatNpcQuestMarker(marker: NpcQuestMarker | null | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!marker) {
    return '暂无追索之委托';
  }
  const stateLabel = marker.state === 'ready'
    ? '可交付'
    : marker.state === 'available'
      ? '可接取'
      : '进行中';
  return `${getQuestLineLabel(marker.line)} · ${stateLabel}`;
}

function isObservationVitalLabel(label: string | null | undefined): boolean {
  return label === '生命' || label === '气血' || label === '灵力';
}

function formatObservationClarity(clarity: string | undefined): string {
  switch (clarity) {
    case 'veiled':
      return '雾里看花';
    case 'blurred':
      return '轮廓模糊';
    case 'partial':
      return '窥得部分';
    case 'clear':
      return '已较清晰';
    case 'complete':
      return '洞察完整';
    default:
      return '未明';
  }
}

/** EntityDetailModal：实体详情弹窗实现。 */
export class EntityDetailModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'entity-detail-modal';  
  /** buffTooltip：Buff 浮动提示。 */
  private readonly buffTooltip = new FloatingTooltip();
  /**
 * pending：pending相关字段。
 */

  private pending: {  
  /**
 * kind：kind相关字段。
 */
 kind: S2C_Detail['kind'];  
 /**
 * id：ID标识。
 */
 id: string;  
 /**
 * title：title名称或显示文本。
 */
 title: string } | null = null;
  /** detail：详情。 */
  private detail: S2C_Detail | null = null;
  /** loading：loading。 */
  private loading = false;

  constructor() {
    window.addEventListener(LEADERBOARD_PLAYER_LOCATION_EVENT, (event) => {
      const customEvent = event as CustomEvent<{ entries?: LeaderboardTrackedLocation[] }>;
      trackedLeaderboardLocations = new Map(
        (customEvent.detail?.entries ?? []).map((entry) => [entry.playerId, entry]),
      );
      if (this.pending?.kind === 'player' && detailModalHost.isOpenFor(EntityDetailModal.MODAL_OWNER)) {
        this.render();
      }
    });
  }

  /** openPending：打开待处理。 */
  openPending(kind: S2C_Detail['kind'], id: string, title: string): void {
    this.pending = { kind, id, title };
    this.detail = null;
    this.loading = true;
    this.render();
  }

  /** updateDetail：更新详情。 */
  updateDetail(detail: S2C_Detail): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.pending && (this.pending.kind !== detail.kind || this.pending.id !== detail.id)) {
      return;
    }
    this.pending = { kind: detail.kind, id: detail.id, title: this.resolveTitle(detail, this.pending?.title) };
    this.detail = detail;
    this.loading = false;
    this.render();
  }

  /** clear：清理clear。 */
  clear(): void {
    this.pending = null;
    this.detail = null;
    this.loading = false;
    detailModalHost.close(EntityDetailModal.MODAL_OWNER);
  }

  /** render：渲染渲染。 */
  private render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const title = this.detail ? this.resolveTitle(this.detail, this.pending?.title) : (this.pending?.title ?? '详情');
    const subtitle = this.detail ? `目标类型：${escapeHtml(getEntityKindLabel(this.detail.kind, this.detail.kind))}` : '详情观望中...';
    const existingBody = detailModalHost.isOpenFor(EntityDetailModal.MODAL_OWNER)
      ? document.getElementById('detail-modal-body')
      : null;
    if (existingBody && this.patchBody(existingBody, title, subtitle)) {
      return;
    }
    detailModalHost.open({
      ownerId: EntityDetailModal.MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title,
      subtitle,
      renderBody: (body) => {
        patchElementHtml(body, `<div data-entity-detail-body="true">${this.renderBody()}</div>`);
      },
      onClose: () => {
        this.buffTooltip.hide(true);
        this.pending = null;
        this.detail = null;
        this.loading = false;
      },
      onAfterRender: (body, signal) => {
        bindInlineItemTooltips(body, signal);
        this.bindBuffTooltips(body, signal);
      },
    });
  }

  /** patchBody：局部刷新详情弹层。 */
  private patchBody(body: HTMLElement, title: string, subtitle: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shell = body.querySelector<HTMLElement>('[data-entity-detail-body="true"]');
    const titleNode = document.getElementById('detail-modal-title');
    const subtitleNode = document.getElementById('detail-modal-subtitle');
    if (!shell || !titleNode || !subtitleNode) {
      return false;
    }
    titleNode.textContent = title;
    subtitleNode.textContent = subtitle;
    patchElementHtml(shell, this.renderBody());
    bindInlineItemTooltips(body);
    return true;
  }

  /** renderBody：渲染身体。 */
  private renderBody(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.loading && !this.detail) {
      return '<div class="empty-hint">详情观望中……</div>';
    }
    if (!this.detail) {
      return '<div class="empty-hint">暂未探明此物详情。</div>';
    }
    if (this.detail.error) {
      return `<div class="empty-hint">${escapeHtml(this.detail.error)}</div>`;
    }
    switch (this.detail.kind) {
      case 'npc':
        return this.renderNpc(this.detail.npc ?? null);
      case 'monster':
        return this.renderMonster(this.detail.monster ?? null);
      case 'player':
        return this.renderPlayer(this.detail.player ?? null);
      case 'portal':
        return this.renderPortal();
      case 'ground':
        return this.renderGround();
      case 'container':
        return this.renderContainer(this.detail.container ?? null);
      default:
        return '<div class="empty-hint">此般详情尚不可察。</div>';
    }
  }

  /** resolveTitle：解析标题。 */
  private resolveTitle(detail: S2C_Detail, fallbackTitle?: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (detail.player && fallbackTitle && fallbackTitle.trim() && fallbackTitle !== detail.player.id) {
      return fallbackTitle;
    }
    return detail.npc?.name
      ?? detail.monster?.name
      ?? fallbackTitle
      ?? detail.player?.id
      ?? detail.portal?.targetMapName
      ?? detail.container?.name
      ?? detail.ground?.sourceId
      ?? detail.id;
  }

  /** renderNpc：渲染NPC。 */
  private renderNpc(npc: S2C_NpcDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!npc) {
      return '<div class="empty-hint">暂未探明此人详情。</div>';
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(npc.name)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(npc.role ?? '无身份标记')}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${npc.x}, ${npc.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>身份</strong><span>${escapeHtml(npc.role ?? '无')}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>商店</strong><span>${npc.hasShop ? '可交易' : '无'}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>任务</strong><span>${npc.questCount ?? 0} 条</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>任务状态</strong><span>${escapeHtml(formatNpcQuestMarker(npc.questMarker ?? null))}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>对话</strong><div>${escapeHtml(npc.dialogue)}</div></div>
      ${this.renderObservation(npc.observation)}
    `;
  }

  /** renderMonster：渲染妖兽。 */
  private renderMonster(monster: S2C_MonsterDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!monster) {
      return '<div class="empty-hint">暂未探明妖兽详情。</div>';
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(monster.name)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(MONSTER_TIER_LABELS[monster.tier] ?? monster.tier)} · 等级 ${monster.level}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${monster.x}, ${monster.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>生命</strong><span>${monster.hp}/${monster.maxHp}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>层级</strong><span>${monster.level}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>血脉</strong><span>${escapeHtml(MONSTER_TIER_LABELS[monster.tier] ?? monster.tier)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>状态</strong><span>${monster.alive ? '存活' : '待重生'}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>重生</strong><span>${escapeHtml(monster.alive ? '无需等待' : formatRespawnTicks(monster.respawnTicks))}</span></div>
      </div>
      ${this.renderObservation(monster.observation, true)}
      ${this.renderBuffs(monster.buffs ?? [])}
    `;
  }

  /** renderPlayer：渲染玩家。 */
  private renderPlayer(player: S2C_PlayerDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!player) {
      return '<div class="empty-hint">暂未探明此身详情。</div>';
    }
    const pendingTitle = this.pending?.kind === 'player' && this.pending.id === player.id ? this.pending.title : '';
    const titleRow = pendingTitle && pendingTitle !== player.id
      ? `<div class="ui-detail-field ui-detail-field--section"><strong>称呼</strong><span>${escapeHtml(pendingTitle)}</span></div>`
      : '';
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(pendingTitle && pendingTitle !== player.id ? pendingTitle : player.id)}</div>
        <div class="ui-title-block-subtitle">玩家观测</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        ${titleRow}
        <div class="ui-detail-field ui-detail-field--section"><strong>编号</strong><span>${escapeHtml(player.id)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${player.x}, ${player.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>生命</strong><span>${player.hp}/${player.maxHp}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>灵力</strong><span>${player.qi}/${player.maxQi}</span></div>
      </div>
      ${this.renderTrackedPlayerIntel(player.id)}
      ${this.renderObservation(player.observation, true)}
      ${this.renderBuffs(player.buffs ?? [])}
    `;
  }

  /** renderTrackedPlayerIntel：渲染玩家天机追索情报。 */
  private renderTrackedPlayerIntel(playerId: string): string {
    const tracked = trackedLeaderboardLocations.get(playerId);
    if (!tracked) {
      return `
        <div class="ui-detail-field ui-detail-field--section">
          <strong>天机追索</strong>
          <div>此身未在诛仙榜追索册页中。查看天下榜时若命中上榜对象，会在这里显现最新坐标。</div>
        </div>
      `;
    }
    const coordinate = `${tracked.mapName} (${tracked.x}, ${tracked.y})`;
    const status = tracked.online ? '在线追索' : '离线坐标';
    return `
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>天机追索</strong><span>${escapeHtml(status)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>卷宗坐标</strong><span>${escapeHtml(coordinate)}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>说明</strong><div>该坐标来自天下榜玩家击杀榜的低频追索结果，榜册开启期间每十息刷新一次。</div></div>
    `;
  }

  /** renderPortal：渲染传送点。 */
  private renderPortal(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const portal = this.detail?.portal;
    if (!portal) {
      return '<div class="empty-hint">暂未探明界门详情。</div>';
    }
    const portalKind = portal.kind === 'stairs' ? '楼梯' : portal.kind === 'gate' ? '关隘' : '传送点';
    const destination = typeof portal.targetX === 'number' && typeof portal.targetY === 'number'
      ? `(${portal.targetX}, ${portal.targetY})`
      : '未知';
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(portal.targetMapName ?? portal.targetMapId)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(portalKind)}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${portal.x}, ${portal.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>类型</strong><span>${escapeHtml(portalKind)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>目标地图</strong><span>${escapeHtml(portal.targetMapName ?? portal.targetMapId)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>目标坐标</strong><span>${escapeHtml(destination)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>触发方式</strong><span>${escapeHtml(formatPortalTrigger(portal.trigger))}</span></div>
      </div>
    `;
  }

  /** renderGround：渲染地面。 */
  private renderGround(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ground = this.detail?.ground;
    if (!ground) {
      return '<div class="empty-hint">暂未探明地面之物。</div>';
    }
    const items = ground.items.length > 0
      ? `<div class="inline-item-flow">${ground.items.map((item) => renderInlineItemChip(item.itemId, { count: item.count, label: item.name, tone: 'reward' })).join('')}</div>`
      : '<div class="inline-rich-text">已无可见之物。</div>';
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">地面物</div>
        <div class="ui-title-block-subtitle">${escapeHtml(ground.sourceId)}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${ground.x}, ${ground.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>来源</strong><span>${escapeHtml(ground.sourceId)}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>物品</strong><div>${items}</div></div>
    `;
  }

  /** renderContainer：渲染容器。 */
  private renderContainer(container: S2C_ContainerDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!container) {
      return '<div class="empty-hint">暂未探明此物详情。</div>';
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(container.name)}</div>
        <div class="ui-title-block-subtitle">可搜索陈设</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>位置</strong><span>(${container.x}, ${container.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>名称</strong><span>${escapeHtml(container.name)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>搜索阶次</strong><span>${container.grade}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>类别</strong><span>可搜索陈设</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>说明</strong><div>${escapeHtml(container.desc ?? `这处${container.name}可以搜索，翻找后或许会有收获。`)}</div></div>
    `;
  }  
  /**
 * renderObservation：执行Observation相关逻辑。
 * @param observation { verdict?: string; lines?: Array<{ label: string; value: string }> } | null | undefined 参数说明。
 * @param hideVitals 参数说明。
 * @returns 返回Observation。
 */


  private renderObservation(
    observation: {    
    /**
 * verdict：verdict相关字段。
 */
 verdict?: string;
 /**
 * clarity：clarity相关字段。
 */
 clarity?: string;
 /**
 * lines：line相关字段。
 */
 lines?: Array<{    
 /**
 * label：label名称或显示文本。
 */
 label: string;    
 /**
 * value：值数值。
 */
 value: string }> } | null | undefined,
    hideVitals = false,
  ): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!observation) {
      return '<div class="ui-detail-field ui-detail-field--section"><strong>观测</strong><div>未得更多回响。</div></div>';
    }
    const lines = hideVitals
      ? (observation.lines ?? []).filter((line) => !isObservationVitalLabel(line.label))
      : (observation.lines ?? []);
    const rows = lines.length > 0
      ? `<div class="entity-detail-list">${lines.map((line) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(line.label)}</span><span class="observe-modal-value">${escapeHtml(line.value)}</span></div>`).join('')}</div>`
      : '<div>暂且如此。</div>';
    return `
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>清晰度</strong><span>${escapeHtml(formatObservationClarity(observation.clarity))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>洞察条目</strong><span>${lines.length} 条</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>判词</strong><div>${escapeHtml(observation.verdict ?? '未得更多回响。')}</div></div>
      <div class="ui-detail-field ui-detail-field--section"><strong>细节</strong><div>${rows}</div></div>
    `;
  }

  /** renderBuffs：渲染Buff。 */
  private renderBuffs(buffs: VisibleBuffState[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (buffs.length === 0) {
      return '<div class="ui-detail-field ui-detail-field--section"><strong>状态</strong><div>未见异状。</div></div>';
    }
    const publicBuffs = buffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
    const publicDebuffs = buffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
    const observeOnlyBuffs = buffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
    const observeOnlyDebuffs = buffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
    const visibleCount = publicBuffs.length + publicDebuffs.length;
    const insightCount = observeOnlyBuffs.length + observeOnlyDebuffs.length;
    return `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>状态</strong>
        <div class="ui-detail-grid ui-detail-grid--section">
          <div class="ui-detail-field ui-detail-field--section"><strong>可见状态</strong><span>${visibleCount} 项</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>洞察状态</strong><span>${insightCount} 项</span></div>
        </div>
        <div class="observe-buff-columns">
          ${this.renderBuffSection('可见增益', publicBuffs, '未见增益')}
          ${this.renderBuffSection('可见减益', publicDebuffs, '未见减益')}
          ${this.renderBuffSection('洞察增益', observeOnlyBuffs, '未见增益')}
          ${this.renderBuffSection('洞察减益', observeOnlyDebuffs, '未见减益')}
        </div>
      </div>
    `;
  }

  /** renderBuffSection：渲染 Buff 分组。 */
  private renderBuffSection(title: string, buffs: VisibleBuffState[], emptyText: string): string {
    return `<section class="observe-buff-section">
      <div class="observe-buff-title">${escapeHtml(title)}</div>
      ${buffs.length > 0
        ? `<div class="observe-buff-list">${buffs.map((buff) => this.renderBuffBadge(buff)).join('')}</div>`
        : `<div class="observe-entity-empty">${escapeHtml(emptyText)}</div>`}
    </section>`;
  }

  /** renderBuffBadge：渲染单个 Buff 徽记。 */
  private renderBuffBadge(buff: VisibleBuffState): string {
    const title = escapeHtml(buff.name);
    const detail = escapeHtml(this.buildBuffTooltipLines(buff).join('\n'));
    const stackText = buff.maxStacks > 1 ? `<span class="observe-buff-stack">${Math.max(0, Math.round(buff.stacks))}</span>` : '';
    const className = buff.category === 'debuff' ? 'observe-buff-chip debuff' : 'observe-buff-chip buff';
    return `<button class="${className}" type="button" data-entity-buff-tooltip-title="${title}" data-entity-buff-tooltip-detail="${detail}">
      <span class="observe-buff-mark">${escapeHtml(buff.shortMark)}</span>
      <span class="observe-buff-name">${escapeHtml(buff.name)}</span>
      <span class="observe-buff-duration">${escapeHtml(this.formatBuffDuration(buff))}</span>
      ${stackText}
    </button>`;
  }

  /** bindBuffTooltips：绑定 Buff tooltip。 */
  private bindBuffTooltips(root: HTMLElement, signal: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    const resolveTooltip = (node: HTMLElement) => {
      const title = node.dataset.entityBuffTooltipTitle ?? '';
      const detail = node.dataset.entityBuffTooltipDetail ?? '';
      const lines = detail.split('\n').filter(Boolean);
      return { title, lines };
    };

    root.addEventListener('click', (event) => {
      if (!tapMode || !(event instanceof MouseEvent)) {
        return;
      }
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-entity-buff-tooltip-title]')
        : null;
      if (!node || !root.contains(node)) {
        return;
      }
      if (this.buffTooltip.isPinnedTo(node)) {
        this.buffTooltip.hide(true);
        return;
      }
      const tooltip = resolveTooltip(node);
      this.buffTooltip.showPinned(node, tooltip.title, tooltip.lines, event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }, { capture: true, signal });

    root.addEventListener('mouseover', (event) => {
      if (!(event instanceof MouseEvent)) {
        return;
      }
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-entity-buff-tooltip-title]')
        : null;
      if (!node || !root.contains(node)) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && node.contains(relatedTarget)) {
        return;
      }
      const tooltip = resolveTooltip(node);
      this.buffTooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY);
    }, { signal });

    root.addEventListener('mousemove', (event) => {
      if (!(event instanceof MouseEvent)) {
        return;
      }
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-entity-buff-tooltip-title]')
        : null;
      if (!node || !root.contains(node)) {
        return;
      }
      this.buffTooltip.move(event.clientX, event.clientY);
    }, { signal });

    root.addEventListener('mouseout', (event) => {
      const target = event.target;
      const node = target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-entity-buff-tooltip-title]')
        : null;
      if (!node || !root.contains(node)) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && node.contains(relatedTarget)) {
        return;
      }
      if (!this.buffTooltip.isPinnedTo(node)) {
        this.buffTooltip.hide();
      }
    }, { signal });
  }

  /** formatBuffDuration：格式化 Buff 持续时间。 */
  private formatBuffDuration(buff: VisibleBuffState): string {
    return `${Math.max(0, Math.round(buff.remainingTicks))} / ${Math.max(1, Math.round(buff.duration))} 息`;
  }

  /** scaleBuffAttrs：按层数缩放 Buff 六维。 */
  private scaleBuffAttrs(attrs: VisibleBuffState['attrs'], stacks: number): VisibleBuffState['attrs'] | undefined {
    if (!attrs || stacks === 1) {
      return attrs;
    }
    const scaled: NonNullable<VisibleBuffState['attrs']> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value !== 'number') {
        continue;
      }
      scaled[key as keyof NonNullable<VisibleBuffState['attrs']>] = value * stacks;
    }
    return Object.keys(scaled).length > 0 ? scaled : undefined;
  }

  /** scaleBuffStats：按层数缩放 Buff 数值。 */
  private scaleBuffStats(stats: VisibleBuffState['stats'], stacks: number): VisibleBuffState['stats'] | undefined {
    if (!stats || stacks === 1) {
      return stats;
    }
    const scaled: PartialNumericStats = {};
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number') {
        (scaled as Record<string, unknown>)[key] = value * stacks;
        continue;
      }
      if (!value || typeof value !== 'object') {
        continue;
      }
      const nested: Record<string, number> = {};
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (typeof nestedValue !== 'number') {
          continue;
        }
        nested[nestedKey] = nestedValue * stacks;
      }
      if (Object.keys(nested).length > 0) {
        (scaled as Record<string, unknown>)[key] = nested;
      }
    }
    return Object.keys(scaled).length > 0 ? scaled : undefined;
  }

  /** buildBuffTooltipLines：组装 Buff tooltip 文案。 */
  private buildBuffTooltipLines(buff: VisibleBuffState): string[] {
    const lines = [
      `类别：${buff.category === 'debuff' ? '减益' : '增益'}`,
      `剩余：${this.formatBuffDuration(buff)}`,
    ];
    if (buff.maxStacks > 1) {
      lines.push(`层数：${Math.max(0, Math.round(buff.stacks))} / ${Math.max(1, Math.round(buff.maxStacks))}`);
    }
    if (buff.sourceSkillName || buff.sourceSkillId) {
      lines.push(`来源：${buff.sourceSkillName ?? buff.sourceSkillId}`);
    }
    const stackFactor = Math.max(1, Math.floor(buff.stacks || 1));
    const effectLines = describePreviewBonuses(
      this.scaleBuffAttrs(buff.attrs, stackFactor),
      this.scaleBuffStats(buff.stats, stackFactor),
      undefined,
      buff.attrMode ?? 'percent',
      buff.statMode ?? 'percent',
    );
    if (effectLines.length > 0) {
      lines.push(`效果：${effectLines.join('，')}`);
    }
    if (buff.desc) {
      lines.push(buff.desc);
    }
    return lines;
  }
}
