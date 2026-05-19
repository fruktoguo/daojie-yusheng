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
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';
import { describePreviewBonuses } from './stat-preview';
import { t } from './i18n';

const LEADERBOARD_PLAYER_LOCATION_EVENT = 'mud:leaderboard-player-locations';
const UNKNOWN_PORTAL_TARGET_MAP_NAME = '未知地域';
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

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

/** formatPortalTrigger：格式化传送点Trigger。 */
function formatPortalTrigger(trigger: 'manual' | 'auto' | undefined): string {
  return trigger === 'auto'
    ? t('entity-detail.portal.trigger.auto', undefined)
    : t('entity-detail.portal.trigger.manual', undefined);
}

/** formatRespawnTicks：格式化Respawn Ticks。 */
function formatRespawnTicks(respawnTicks: number | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof respawnTicks !== 'number' || !Number.isFinite(respawnTicks) || respawnTicks <= 0) {
    return t('entity-detail.respawn.soon', undefined);
  }
  return t('entity-detail.respawn.after', { ticks: Math.max(1, Math.round(respawnTicks)) });
}

/** formatNpcQuestMarker：格式化NPC任务标记。 */
function formatNpcQuestMarker(marker: NpcQuestMarker | null | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!marker) {
    return t('entity-detail.npc.quest.none', undefined);
  }
  const stateLabel = marker.state === 'ready'
    ? t('entity-detail.npc.quest.ready', undefined)
    : marker.state === 'available'
      ? t('entity-detail.npc.quest.available', undefined)
      : t('entity-detail.npc.quest.progress', undefined);
  return `${getQuestLineLabel(marker.line)} · ${stateLabel}`;
}

function isObservationVitalLabel(label: string | null | undefined): boolean {
  return label === t('entity-detail.label.life', undefined)
    || label === t('entity-detail.label.hp', undefined)
    || label === t('entity-detail.label.qi', undefined);
}

function formatObservationClarity(clarity: string | undefined): string {
  switch (clarity) {
    case 'veiled':
      return t('entity-detail.observation.clarity.veiled', undefined);
    case 'blurred':
      return t('entity-detail.observation.clarity.blurred', undefined);
    case 'partial':
      return t('entity-detail.observation.clarity.partial', undefined);
    case 'clear':
      return t('entity-detail.observation.clarity.clear', undefined);
    case 'complete':
      return t('entity-detail.observation.clarity.complete', undefined);
    default:
      return t('entity-detail.value.unknown', undefined);
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

    const title = this.detail ? this.resolveTitle(this.detail, this.pending?.title) : (this.pending?.title ?? t('entity-detail.title.default', undefined));
    const subtitle = this.detail
      ? t('entity-detail.subtitle.kind', { kind: escapeHtml(getEntityKindLabel(this.detail.kind, this.detail.kind)) })
      : t('entity-detail.subtitle.loading', undefined);
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
        replaceElementHtml(body, `<div data-entity-detail-body="true">${this.renderBody()}</div>`);
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
    replaceElementHtml(shell, this.renderBody());
    bindInlineItemTooltips(body);
    return true;
  }

  /** renderBody：渲染身体。 */
  private renderBody(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.loading && !this.detail) {
      return `<div class="empty-hint">${t('entity-detail.loading', undefined)}</div>`;
    }
    if (!this.detail) {
      return `<div class="empty-hint">${t('entity-detail.empty', undefined)}</div>`;
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
        return `<div class="empty-hint">${t('entity-detail.unsupported', undefined)}</div>`;
    }
  }

  /** resolveTitle：解析标题。 */
  private resolveTitle(detail: S2C_Detail, fallbackTitle?: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (detail.player) {
      const playerTitle = fallbackTitle?.trim();
      return playerTitle && playerTitle !== detail.player.id
        ? playerTitle
        : t('entity-detail.player.subtitle', undefined);
    }
    if (detail.ground) {
      return t('entity-detail.ground.title', undefined);
    }
    if (detail.portal) {
      return detail.portal.targetMapName?.trim() || UNKNOWN_PORTAL_TARGET_MAP_NAME;
    }
    return detail.npc?.name
      ?? detail.monster?.name
      ?? fallbackTitle
      ?? detail.container?.name
      ?? t('entity-detail.title.default', undefined);
  }

  /** renderNpc：渲染NPC。 */
  private renderNpc(npc: S2C_NpcDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!npc) {
      return `<div class="empty-hint">${t('entity-detail.npc.empty', undefined)}</div>`;
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(npc.name)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(npc.role ?? t('entity-detail.npc.no-role-mark', undefined))}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${npc.x}, ${npc.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.npc.field.role', undefined)}</strong><span>${escapeHtml(npc.role ?? t('entity-detail.value.none', undefined))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.npc.field.shop', undefined)}</strong><span>${npc.hasShop ? t('entity-detail.npc.shop.available', undefined) : t('entity-detail.value.none', undefined)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.npc.field.quest', undefined)}</strong><span>${t('entity-detail.count.entries', { count: npc.questCount ?? 0 })}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.npc.field.quest-state', undefined)}</strong><span>${escapeHtml(formatNpcQuestMarker(npc.questMarker ?? null))}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.npc.field.dialogue', undefined)}</strong><div>${escapeHtml(npc.dialogue)}</div></div>
      ${this.renderObservation(npc.observation)}
    `;
  }

  /** renderMonster：渲染妖兽。 */
  private renderMonster(monster: S2C_MonsterDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!monster) {
      return `<div class="empty-hint">${t('entity-detail.monster.empty', undefined)}</div>`;
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(monster.name)}</div>
        <div class="ui-title-block-subtitle">${t('entity-detail.monster.subtitle', { tier: escapeHtml(MONSTER_TIER_LABELS[monster.tier] ?? monster.tier), level: monster.level })}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${monster.x}, ${monster.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.label.life', undefined)}</strong><span>${monster.hp}/${monster.maxHp}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.label.qi', undefined)}</strong><span>${monster.qi}/${monster.maxQi}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.monster.field.level', undefined)}</strong><span>${monster.level}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.monster.field.tier', undefined)}</strong><span>${escapeHtml(MONSTER_TIER_LABELS[monster.tier] ?? monster.tier)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.state', undefined)}</strong><span>${monster.alive ? t('entity-detail.monster.alive', undefined) : t('entity-detail.monster.respawning', undefined)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.monster.field.respawn', undefined)}</strong><span>${escapeHtml(monster.alive ? t('entity-detail.respawn.none', undefined) : formatRespawnTicks(monster.respawnTicks))}</span></div>
      </div>
      ${this.renderObservation(monster.observation, true)}
      ${this.renderBuffs(monster.buffs ?? [])}
    `;
  }

  /** renderPlayer：渲染玩家。 */
  private renderPlayer(player: S2C_PlayerDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!player) {
      return `<div class="empty-hint">${t('entity-detail.player.empty', undefined)}</div>`;
    }
    const pendingTitle = this.pending?.kind === 'player' && this.pending.id === player.id ? this.pending.title : '';
    const defaultPlayerTitle = t('entity-detail.player.subtitle', undefined);
    const hasPlayerDisplayTitle = pendingTitle && pendingTitle !== player.id && pendingTitle !== defaultPlayerTitle;
    const titleRow = hasPlayerDisplayTitle
      ? `<div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.player.field.display-name', undefined)}</strong><span>${escapeHtml(pendingTitle)}</span></div>`
      : '';
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(hasPlayerDisplayTitle ? pendingTitle : defaultPlayerTitle)}</div>
        <div class="ui-title-block-subtitle">${t('entity-detail.player.subtitle', undefined)}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        ${titleRow}
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.category', undefined)}</strong><span>${t('entity-detail.player.subtitle', undefined)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${player.x}, ${player.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.label.life', undefined)}</strong><span>${player.hp}/${player.maxHp}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.label.qi', undefined)}</strong><span>${player.qi}/${player.maxQi}</span></div>
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
          <div>${t('entity-detail.player.tracking.empty', undefined)}</div>
        </div>
      `;
    }
    const coordinate = `${tracked.mapName} (${tracked.x}, ${tracked.y})`;
    const status = tracked.online ? t('entity-detail.player.tracking.online', undefined) : t('entity-detail.player.tracking.offline', undefined);
    return `
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.player.tracking.title', undefined)}</strong><span>${escapeHtml(status)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.player.tracking.coordinate', undefined)}</strong><span>${escapeHtml(coordinate)}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.description', undefined)}</strong><div>${t('entity-detail.player.tracking.desc', undefined)}</div></div>
    `;
  }

  /** renderPortal：渲染传送点。 */
  private renderPortal(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const portal = this.detail?.portal;
    if (!portal) {
      return `<div class="empty-hint">${t('entity-detail.portal.empty', undefined)}</div>`;
    }
    const portalKind = portal.kind === 'stairs'
      ? t('entity-detail.portal.kind.stairs', undefined)
      : portal.kind === 'gate'
        ? t('entity-detail.portal.kind.gate', undefined)
        : t('entity-detail.portal.kind.portal', undefined);
    const destination = typeof portal.targetX === 'number' && typeof portal.targetY === 'number'
      ? `(${portal.targetX}, ${portal.targetY})`
      : t('entity-detail.value.unknown', undefined);
    const targetMapName = portal.targetMapName?.trim() || UNKNOWN_PORTAL_TARGET_MAP_NAME;
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(targetMapName)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(portalKind)}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${portal.x}, ${portal.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.type', undefined)}</strong><span>${escapeHtml(portalKind)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.portal.field.target-map', undefined)}</strong><span>${escapeHtml(targetMapName)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.portal.field.target-coordinate', undefined)}</strong><span>${escapeHtml(destination)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.portal.field.trigger', undefined)}</strong><span>${escapeHtml(formatPortalTrigger(portal.trigger))}</span></div>
      </div>
    `;
  }

  /** renderGround：渲染地面。 */
  private renderGround(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ground = this.detail?.ground;
    if (!ground) {
      return `<div class="empty-hint">${t('entity-detail.ground.empty', undefined)}</div>`;
    }
    const items = ground.items.length > 0
      ? `<div class="inline-item-flow">${ground.items.map((item) => renderInlineItemChip(item.itemId, { count: item.count, label: item.name, tone: 'reward' })).join('')}</div>`
      : `<div class="inline-rich-text">${t('entity-detail.ground.no-visible-items', undefined)}</div>`;
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${t('entity-detail.ground.title', undefined)}</div>
        <div class="ui-title-block-subtitle">${escapeHtml(t('entity-detail.count.items', { count: ground.items.length }))}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${ground.x}, ${ground.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.category', undefined)}</strong><span>${t('entity-detail.ground.title', undefined)}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.ground.field.items', undefined)}</strong><div>${items}</div></div>
    `;
  }

  /** renderContainer：渲染容器。 */
  private renderContainer(container: S2C_ContainerDetail | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!container) {
      return `<div class="empty-hint">${t('entity-detail.empty', undefined)}</div>`;
    }
    return `
      <div class="ui-title-block">
        <div class="ui-title-block-title">${escapeHtml(container.name)}</div>
        <div class="ui-title-block-subtitle">${t('entity-detail.container.searchable', undefined)}</div>
      </div>
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.position', undefined)}</strong><span>(${container.x}, ${container.y})</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.name', undefined)}</strong><span>${escapeHtml(container.name)}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.container.field.grade', undefined)}</strong><span>${container.grade}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.category', undefined)}</strong><span>${t('entity-detail.container.searchable', undefined)}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.description', undefined)}</strong><div>${escapeHtml(container.desc ?? t('entity-detail.container.default-desc', { name: container.name }))}</div></div>
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
      return `<div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.observation.title', undefined)}</strong><div>${t('entity-detail.observation.no-more', undefined)}</div></div>`;
    }
    const lines = hideVitals
      ? (observation.lines ?? []).filter((line) => !isObservationVitalLabel(line.label))
      : (observation.lines ?? []);
    const rows = lines.length > 0
      ? `<div class="entity-detail-list">${lines.map((line) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(line.label)}</span><span class="observe-modal-value">${escapeHtml(line.value)}</span></div>`).join('')}</div>`
      : `<div>${t('entity-detail.observation.rows.empty', undefined)}</div>`;
    return `
      <div class="ui-detail-grid ui-detail-grid--section">
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.observation.field.clarity', undefined)}</strong><span>${escapeHtml(formatObservationClarity(observation.clarity))}</span></div>
        <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.observation.field.count', undefined)}</strong><span>${t('entity-detail.count.entries', { count: lines.length })}</span></div>
      </div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.observation.field.verdict', undefined)}</strong><div>${escapeHtml(observation.verdict ?? t('entity-detail.observation.no-more', undefined))}</div></div>
      <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.observation.field.details', undefined)}</strong><div>${rows}</div></div>
    `;
  }

  /** renderBuffs：渲染Buff。 */
  private renderBuffs(buffs: VisibleBuffState[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (buffs.length === 0) {
      return `<div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.field.state', undefined)}</strong><div>${t('entity-detail.buff.empty', undefined)}</div></div>`;
    }
    const publicBuffs = buffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
    const publicDebuffs = buffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
    const observeOnlyBuffs = buffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
    const observeOnlyDebuffs = buffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
    const visibleCount = publicBuffs.length + publicDebuffs.length;
    const insightCount = observeOnlyBuffs.length + observeOnlyDebuffs.length;
    return `
      <div class="ui-detail-field ui-detail-field--section">
        <strong>${t('entity-detail.field.state', undefined)}</strong>
        <div class="ui-detail-grid ui-detail-grid--section">
          <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.buff.visible-count', undefined)}</strong><span>${t('entity-detail.count.items', { count: visibleCount })}</span></div>
          <div class="ui-detail-field ui-detail-field--section"><strong>${t('entity-detail.buff.insight-count', undefined)}</strong><span>${t('entity-detail.count.items', { count: insightCount })}</span></div>
        </div>
        <div class="observe-buff-columns">
          ${this.renderBuffSection(t('entity-detail.buff.section.public-buffs', undefined), publicBuffs, t('entity-detail.buff.empty.buffs', undefined))}
          ${this.renderBuffSection(t('entity-detail.buff.section.public-debuffs', undefined), publicDebuffs, t('entity-detail.buff.empty.debuffs', undefined))}
          ${this.renderBuffSection(t('entity-detail.buff.section.observe-buffs', undefined), observeOnlyBuffs, t('entity-detail.buff.empty.buffs', undefined))}
          ${this.renderBuffSection(t('entity-detail.buff.section.observe-debuffs', undefined), observeOnlyDebuffs, t('entity-detail.buff.empty.debuffs', undefined))}
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
    return t('entity-detail.buff.duration', {
      remaining: Math.max(0, Math.round(buff.remainingTicks)),
      duration: Math.max(1, Math.round(buff.duration)),
    });
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
      t('entity-detail.buff.tooltip.category', { category: buff.category === 'debuff' ? t('entity-detail.buff.category.debuff', undefined) : t('entity-detail.buff.category.buff', undefined) }),
      t('entity-detail.buff.tooltip.remaining', { duration: this.formatBuffDuration(buff) }),
    ];
    if (buff.maxStacks > 1) {
      lines.push(t('entity-detail.buff.tooltip.stacks', { stacks: Math.max(0, Math.round(buff.stacks)), max: Math.max(1, Math.round(buff.maxStacks)) }));
    }
    if (buff.sourceSkillName || buff.sourceSkillId) {
      lines.push(t('entity-detail.buff.tooltip.source', { source: buff.sourceSkillName ?? t('entity-detail.value.unknown', undefined) }));
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
      lines.push(t('entity-detail.buff.tooltip.effect', { effect: effectLines.join('，') }));
    }
    if (buff.desc) {
      lines.push(buff.desc);
    }
    return lines;
  }
}
