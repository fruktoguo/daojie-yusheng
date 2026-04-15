import { NEXT_S2C_Detail, NEXT_S2C_NpcDetail, NEXT_S2C_PlayerDetail, NEXT_S2C_MonsterDetail, NEXT_S2C_ContainerDetail, VisibleBuffState, MONSTER_TIER_LABELS, type NpcQuestMarker } from '@mud/shared-next';
import { getEntityKindLabel, getQuestLineLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './item-inline-tooltip';

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
  if (typeof respawnTicks !== 'number' || !Number.isFinite(respawnTicks) || respawnTicks <= 0) {
    return '即将重生';
  }
  return `${Math.max(1, Math.round(respawnTicks))} 息后重生`;
}

/** formatNpcQuestMarker：格式化NPC任务标记。 */
function formatNpcQuestMarker(marker: NpcQuestMarker | null | undefined): string {
  if (!marker) {
    return '暂无可追踪任务';
  }
  const stateLabel = marker.state === 'ready'
    ? '可交付'
    : marker.state === 'available'
      ? '可接取'
      : '进行中';
  return `${getQuestLineLabel(marker.line)} · ${stateLabel}`;
}

/** EntityDetailModal：实体详情弹窗实现。 */
export class EntityDetailModal {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'entity-detail-modal';
  private pending: { kind: NEXT_S2C_Detail['kind']; id: string; title: string } | null = null;
  /** detail：详情。 */
  private detail: NEXT_S2C_Detail | null = null;
  /** loading：loading。 */
  private loading = false;

  /** openPending：打开待处理。 */
  openPending(kind: NEXT_S2C_Detail['kind'], id: string, title: string): void {
    this.pending = { kind, id, title };
    this.detail = null;
    this.loading = true;
    this.render();
  }

  /** updateDetail：更新详情。 */
  updateDetail(detail: NEXT_S2C_Detail): void {
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
    const title = this.detail ? this.resolveTitle(this.detail, this.pending?.title) : (this.pending?.title ?? '详情');
    const subtitle = this.detail ? `目标类型：${escapeHtml(getEntityKindLabel(this.detail.kind, this.detail.kind))}` : '详情同步中';
    detailModalHost.open({
      ownerId: EntityDetailModal.MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title,
      subtitle,
      bodyHtml: this.renderBody(),
      onClose: () => {
        this.pending = null;
        this.detail = null;
        this.loading = false;
      },
      onAfterRender: (body) => {
        bindInlineItemTooltips(body);
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(): string {
    if (this.loading && !this.detail) {
      return '<div class="empty-hint ui-empty-hint">正在读取目标详情……</div>';
    }
    if (!this.detail) {
      return '<div class="empty-hint ui-empty-hint">暂时无法读取目标详情。</div>';
    }
    if (this.detail.error) {
      return `<div class="empty-hint ui-empty-hint">${escapeHtml(this.detail.error)}</div>`;
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
        return '<div class="empty-hint ui-empty-hint">当前详情类型暂未支持展示。</div>';
    }
  }

  /** resolveTitle：解析标题。 */
  private resolveTitle(detail: NEXT_S2C_Detail, fallbackTitle?: string): string {
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
  private renderNpc(npc: NEXT_S2C_NpcDetail | null): string {
    if (!npc) {
      return '<div class="empty-hint ui-empty-hint">未读取到 NPC 详情。</div>';
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
  private renderMonster(monster: NEXT_S2C_MonsterDetail | null): string {
    if (!monster) {
      return '<div class="empty-hint ui-empty-hint">未读取到怪物详情。</div>';
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
  private renderPlayer(player: NEXT_S2C_PlayerDetail | null): string {
    if (!player) {
      return '<div class="empty-hint ui-empty-hint">未读取到玩家详情。</div>';
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
      ${this.renderObservation(player.observation, true)}
      ${this.renderBuffs(player.buffs ?? [])}
    `;
  }

  /** renderPortal：渲染传送点。 */
  private renderPortal(): string {
    const portal = this.detail?.portal;
    if (!portal) {
      return '<div class="empty-hint ui-empty-hint">未读取到传送点详情。</div>';
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
    const ground = this.detail?.ground;
    if (!ground) {
      return '<div class="empty-hint ui-empty-hint">未读取到地面物详情。</div>';
    }
    const items = ground.items.length > 0
      ? `<div class="inline-item-flow">${ground.items.map((item) => renderInlineItemChip(item.itemId, { count: item.count, label: item.name, tone: 'reward' })).join('')}</div>`
      : '<div class="inline-rich-text">这里已经没有可见物品。</div>';
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
  private renderContainer(container: NEXT_S2C_ContainerDetail | null): string {
    if (!container) {
      return '<div class="empty-hint ui-empty-hint">未读取到容器详情。</div>';
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

  private renderObservation(
    observation: { verdict?: string; lines?: Array<{ label: string; value: string }> } | null | undefined,
    hideVitals = false,
  ): string {
    if (!observation) {
      return '<div class="ui-detail-field ui-detail-field--section"><strong>观测</strong><div>未得更多回响。</div></div>';
    }
    const lines = hideVitals
      ? (observation.lines ?? []).filter((line) => line.label !== '生命' && line.label !== '气血' && line.label !== '灵力')
      : (observation.lines ?? []);
    const rows = lines.length > 0
      ? `<div class="entity-detail-list">${lines.map((line) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(line.label)}</span><span class="observe-modal-value">${escapeHtml(line.value)}</span></div>`).join('')}</div>`
      : '<div>暂无额外细节。</div>';
    return `
      <div class="ui-detail-field ui-detail-field--section"><strong>判词</strong><div>${escapeHtml(observation.verdict ?? '未得更多回响。')}</div></div>
      <div class="ui-detail-field ui-detail-field--section"><strong>细节</strong><div>${rows}</div></div>
    `;
  }

  /** renderBuffs：渲染Buff。 */
  private renderBuffs(buffs: VisibleBuffState[]): string {
    if (buffs.length === 0) {
      return '<div class="ui-detail-field ui-detail-field--section"><strong>状态</strong><div>当前未见明显状态变化。</div></div>';
    }
    return `
      <div class="ui-detail-field ui-detail-field--section"><strong>状态</strong><div class="entity-detail-buff-list">${buffs.map((buff) => `<span class="inline-item-chip inline-item-chip--material">${escapeHtml(buff.name)}</span>`).join('')}</div></div>
    `;
  }
}



