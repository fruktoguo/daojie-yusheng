import { NEXT_S2C_Leaderboard, NEXT_S2C_WorldSummary } from '@mud/shared-next';
import type { SocketPanelSender } from './network/socket-send-panel';
import { detailModalHost } from './ui/detail-modal-host';
import { WorldPanel } from './ui/panels/world-panel';
import { formatDisplayInteger } from './utils/number';

type MainWorldSummaryStateSourceOptions = {
  socket: Pick<SocketPanelSender, 'sendRequestLeaderboard' | 'sendRequestWorldSummary'>;
  worldPanel: Pick<WorldPanel, 'setCallbacks'>;
};

const LEADERBOARD_MODAL_OWNER = 'world:leaderboard';
const WORLD_SUMMARY_MODAL_OWNER = 'world:summary';

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatLeaderboardGeneratedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '刚刚更新';
  }
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function renderLeaderboardRows(rows: string[]): string {
  if (rows.length === 0) {
    return '<div class="empty-hint ui-empty-hint">暂无数据</div>';
  }
  return `<div class="observe-entity-list">${rows.join('')}</div>`;
}

export type MainWorldSummaryStateSource = ReturnType<typeof createMainWorldSummaryStateSource>;

export function createMainWorldSummaryStateSource(options: MainWorldSummaryStateSourceOptions) {
  let latestLeaderboard: NEXT_S2C_Leaderboard | null = null;
  let latestWorldSummary: NEXT_S2C_WorldSummary | null = null;

  function renderLeaderboardModal(): void {
    const data = latestLeaderboard;
    const bodyHtml = !data
      ? '<div class="empty-hint ui-empty-hint">正在读取天下榜……</div>'
      : `
        <div class="panel-section">
          <div class="panel-section-title">境界榜</div>
          ${renderLeaderboardRows(data.boards.realm.map((entry) => `
            <div class="observe-modal-row">
              <span class="observe-modal-label">#${entry.rank} ${escapeHtml(entry.playerName)}</span>
              <span class="observe-modal-value">${escapeHtml(entry.realmName)} · 根基 ${formatDisplayInteger(entry.foundation)}</span>
            </div>
          `))}
        </div>
        <div class="panel-section">
          <div class="panel-section-title">灵石榜</div>
          ${renderLeaderboardRows(data.boards.spiritStones.map((entry) => `
            <div class="observe-modal-row">
              <span class="observe-modal-label">#${entry.rank} ${escapeHtml(entry.playerName)}</span>
              <span class="observe-modal-value">${formatDisplayInteger(entry.spiritStoneCount)}</span>
            </div>
          `))}
        </div>
        <div class="panel-section">
          <div class="panel-section-title">锻体榜</div>
          ${renderLeaderboardRows(data.boards.bodyTraining.map((entry) => `
            <div class="observe-modal-row">
              <span class="observe-modal-label">#${entry.rank} ${escapeHtml(entry.playerName)}</span>
              <span class="observe-modal-value">LV ${formatDisplayInteger(entry.level)} · ${formatDisplayInteger(entry.exp)}/${formatDisplayInteger(entry.expToNext)}</span>
            </div>
          `))}
        </div>
        <div class="panel-section">
          <div class="panel-section-title">至尊属性</div>
          ${renderLeaderboardRows(data.boards.supremeAttrs.map((entry) => `
            <div class="observe-modal-row">
              <span class="observe-modal-label">${escapeHtml(entry.label)} · ${escapeHtml(entry.playerName)}</span>
              <span class="observe-modal-value">${formatDisplayInteger(entry.value)}</span>
            </div>
          `))}
        </div>
      `;
    detailModalHost.open({
      ownerId: LEADERBOARD_MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title: '天下榜',
      subtitle: data ? `Top ${data.limit} · ${formatLeaderboardGeneratedAt(data.generatedAt)}` : '加载中',
      bodyHtml,
    });
  }

  function renderWorldSummaryModal(): void {
    const data = latestWorldSummary;
    const bodyHtml = !data
      ? '<div class="empty-hint ui-empty-hint">正在读取世界总览……</div>'
      : `
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">世界资源</div>
          <div class="info-list ui-key-value-list">
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">全服灵石</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.totalSpiritStones)}</strong></div>
          </div>
        </div>
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">行为统计</div>
          <div class="info-list ui-key-value-list">
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">修炼</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.actionCounts.cultivation)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">战斗</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.actionCounts.combat)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">炼丹</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.actionCounts.alchemy)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">强化</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.actionCounts.enhancement)}</strong></div>
          </div>
        </div>
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">境界分布</div>
          <div class="info-list ui-key-value-list">
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">凡俗</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.realmCounts.initial)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">后天</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.realmCounts.mortal)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">炼气及以上</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.realmCounts.qiRefiningOrAbove)}</strong></div>
          </div>
        </div>
        <div class="panel-section ui-surface-pane ui-surface-pane--stack">
          <div class="panel-section-title">击杀统计</div>
          <div class="info-list ui-key-value-list">
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">普通妖兽</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.killCounts.normalMonsters)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">精英妖兽</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.killCounts.eliteMonsters)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">首领妖兽</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.killCounts.bossMonsters)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">玩家击杀</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.killCounts.playerKills)}</strong></div>
            <div class="info-line ui-key-value-item ui-surface-card ui-surface-card--compact"><span class="ui-key-value-label">玩家死亡</span><strong class="ui-key-value-value">${formatDisplayInteger(data.summary.killCounts.playerDeaths)}</strong></div>
          </div>
        </div>
      `;
    detailModalHost.open({
      ownerId: WORLD_SUMMARY_MODAL_OWNER,
      variantClass: 'detail-modal--quest',
      title: '世界总览',
      subtitle: data ? formatLeaderboardGeneratedAt(data.generatedAt) : '加载中',
      bodyHtml,
    });
  }

  options.worldPanel.setCallbacks({
    onOpenLeaderboard: () => {
      renderLeaderboardModal();
      options.socket.sendRequestLeaderboard();
    },
    onOpenWorldSummary: () => {
      renderWorldSummaryModal();
      options.socket.sendRequestWorldSummary();
    },
  });

  return {
    init(): void {
      options.socket.sendRequestLeaderboard();
      options.socket.sendRequestWorldSummary();
    },

    clear(): void {
      latestLeaderboard = null;
      latestWorldSummary = null;
      detailModalHost.close(LEADERBOARD_MODAL_OWNER);
      detailModalHost.close(WORLD_SUMMARY_MODAL_OWNER);
    },

    handleLeaderboard(data: NEXT_S2C_Leaderboard): void {
      latestLeaderboard = cloneJson(data);
      if (detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        renderLeaderboardModal();
      }
    },

    handleWorldSummary(data: NEXT_S2C_WorldSummary): void {
      latestWorldSummary = cloneJson(data);
      if (detailModalHost.isOpenFor(WORLD_SUMMARY_MODAL_OWNER)) {
        renderWorldSummaryModal();
      }
    },
  };
}
