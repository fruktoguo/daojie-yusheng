import { NEXT_S2C_Leaderboard, NEXT_S2C_LeaderboardPlayerLocations, NEXT_S2C_WorldSummary } from '@mud/shared-next';
import type { SocketPanelSender } from './network/socket-send-panel';
import { detailModalHost } from './ui/detail-modal-host';
import { WorldPanel } from './ui/panels/world-panel';
import { formatDisplayInteger } from './utils/number';
/**
 * MainWorldSummaryStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainWorldSummaryStateSourceOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<SocketPanelSender, 'sendRequestLeaderboard' | 'sendRequestLeaderboardPlayerLocations' | 'sendRequestWorldSummary'>;  
  /**
 * worldPanel：世界面板相关字段。
 */

  worldPanel: Pick<WorldPanel, 'setCallbacks'>;
};

const LEADERBOARD_MODAL_OWNER = 'world:leaderboard';
const WORLD_SUMMARY_MODAL_OWNER = 'world:summary';
const LEADERBOARD_PLAYER_LOCATION_REFRESH_INTERVAL_MS = 10_000;
/**
 * cloneJson：构建Json。
 * @param value T 参数说明。
 * @returns 返回Json。
 */


function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
/**
 * escapeHtml：执行escapeHtml相关逻辑。
 * @param value string 参数说明。
 * @returns 返回escapeHtml。
 */


function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
/**
 * formatLeaderboardGeneratedAt：规范化或转换LeaderboardGeneratedAt。
 * @param timestamp number 参数说明。
 * @returns 返回LeaderboardGeneratedAt。
 */


function formatLeaderboardGeneratedAt(timestamp: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '刚刚更新';
  }
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}
/**
 * renderLeaderboardRows：执行LeaderboardRow相关逻辑。
 * @param rows string[] 参数说明。
 * @returns 返回LeaderboardRow。
 */


function renderLeaderboardRows(rows: string[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (rows.length === 0) {
    return '<div class="empty-hint ui-empty-hint">暂无数据</div>';
  }
  return `<div class="observe-entity-list">${rows.join('')}</div>`;
}
/**
 * MainWorldSummaryStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainWorldSummaryStateSource = ReturnType<typeof createMainWorldSummaryStateSource>;
/**
 * createMainWorldSummaryStateSource：构建并返回目标对象。
 * @param options MainWorldSummaryStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main世界摘要状态来源相关状态。
 */


export function createMainWorldSummaryStateSource(options: MainWorldSummaryStateSourceOptions) {
  let latestLeaderboard: NEXT_S2C_Leaderboard | null = null;
  let latestWorldSummary: NEXT_S2C_WorldSummary | null = null;  
  let leaderboardPlayerLocationById = new Map<string, NEXT_S2C_LeaderboardPlayerLocations['entries'][number]>();
  let leaderboardLocationTimer: number | null = null;
  /**
 * renderLeaderboardModal：执行Leaderboard弹层相关逻辑。
 * @returns 无返回值，直接更新Leaderboard弹层相关状态。
 */


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
          <div class="panel-section-title">玩家击杀榜</div>
          ${renderLeaderboardRows(data.boards.playerKills.map((entry) => `
            <div class="observe-modal-row observe-modal-row--stack">
              <span class="observe-modal-label">#${entry.rank} ${escapeHtml(entry.playerName)}</span>
              <span class="observe-modal-value">击杀玩家 ${formatDisplayInteger(entry.playerKillCount)}</span>
              <span class="observe-modal-subvalue" data-leaderboard-player-location="${escapeHtml(entry.playerId)}">${escapeHtml(formatLeaderboardPlayerLocation(entry.playerId))}</span>
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
      subtitle: data ? `Top ${data.limit} · 榜册十分钟一更 · 坐标十秒一追索 · ${formatLeaderboardGeneratedAt(data.generatedAt)}` : '加载中',
      bodyHtml,
      onClose: () => {
        stopLeaderboardLocationPolling();
      },
    });
    requestVisibleLeaderboardPlayerLocations();
  }  
  /**
 * renderWorldSummaryModal：执行世界摘要弹层相关逻辑。
 * @returns 无返回值，直接更新世界摘要弹层相关状态。
 */


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
      startLeaderboardLocationPolling();
      options.socket.sendRequestLeaderboard();
    },
    onOpenWorldSummary: () => {
      renderWorldSummaryModal();
      options.socket.sendRequestWorldSummary();
    },
  });

  return {  
  /**
 * init：执行init相关逻辑。
 * @returns 无返回值，直接更新init相关状态。
 */

    init(): void {
      options.socket.sendRequestLeaderboard();
      options.socket.sendRequestWorldSummary();
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      latestLeaderboard = null;
      latestWorldSummary = null;
      leaderboardPlayerLocationById.clear();
      stopLeaderboardLocationPolling();
      detailModalHost.close(LEADERBOARD_MODAL_OWNER);
      detailModalHost.close(WORLD_SUMMARY_MODAL_OWNER);
    },    
    /**
 * handleLeaderboard：处理Leaderboard并更新相关状态。
 * @param data NEXT_S2C_Leaderboard 原始数据。
 * @returns 无返回值，直接更新Leaderboard相关状态。
 */


    handleLeaderboard(data: NEXT_S2C_Leaderboard): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestLeaderboard = cloneJson(data);
      if (detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        renderLeaderboardModal();
      }
    },    
    /**
 * handleLeaderboardPlayerLocations：处理玩家击杀榜坐标追索结果并更新相关状态。
 * @param data NEXT_S2C_LeaderboardPlayerLocations 原始数据。
 * @returns 无返回值，直接更新玩家击杀榜坐标追索结果相关状态。
 */

    handleLeaderboardPlayerLocations(data: NEXT_S2C_LeaderboardPlayerLocations): void {
      leaderboardPlayerLocationById = new Map(data.entries.map((entry) => [entry.playerId, cloneJson(entry)]));
      if (!detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        return;
      }
      renderLeaderboardModal();
    },    
    /**
 * handleWorldSummary：处理世界摘要并更新相关状态。
 * @param data NEXT_S2C_WorldSummary 原始数据。
 * @returns 无返回值，直接更新世界摘要相关状态。
 */


    handleWorldSummary(data: NEXT_S2C_WorldSummary): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestWorldSummary = cloneJson(data);
      if (detailModalHost.isOpenFor(WORLD_SUMMARY_MODAL_OWNER)) {
        renderWorldSummaryModal();
      }
    },
  };

  function startLeaderboardLocationPolling(): void {
    if (leaderboardLocationTimer !== null) {
      return;
    }
    leaderboardLocationTimer = window.setInterval(() => {
      requestVisibleLeaderboardPlayerLocations();
    }, LEADERBOARD_PLAYER_LOCATION_REFRESH_INTERVAL_MS);
  }

  function stopLeaderboardLocationPolling(): void {
    if (leaderboardLocationTimer === null) {
      return;
    }
    window.clearInterval(leaderboardLocationTimer);
    leaderboardLocationTimer = null;
  }

  function requestVisibleLeaderboardPlayerLocations(): void {
    if (!detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER) || !latestLeaderboard) {
      return;
    }
    const playerIds = latestLeaderboard.boards.playerKills
      .map((entry) => entry.playerId)
      .filter((entry) => typeof entry === 'string' && entry.length > 0);
    if (playerIds.length <= 0) {
      return;
    }
    options.socket.sendRequestLeaderboardPlayerLocations(playerIds);
  }

  function formatLeaderboardPlayerLocation(playerId: string): string {
    const entry = leaderboardPlayerLocationById.get(playerId);
    if (!entry) {
      return '坐标：天机追索中';
    }
    return entry.online
      ? `坐标：${entry.mapName} (${formatDisplayInteger(entry.x)}, ${formatDisplayInteger(entry.y)})`
      : `离线坐标：${entry.mapName} (${formatDisplayInteger(entry.x)}, ${formatDisplayInteger(entry.y)})`;
  }
}
