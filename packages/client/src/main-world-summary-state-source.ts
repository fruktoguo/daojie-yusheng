import { S2C_Leaderboard, S2C_LeaderboardPlayerLocations, S2C_WorldSummary } from '@mud/shared';
import type { SocketPanelSender } from './network/socket-send-panel';
import { detailModalHost } from './ui/detail-modal-host';
import { preserveSelection } from './ui/selection-preserver';
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
const LEADERBOARD_PLAYER_LOCATION_EVENT = 'mud:leaderboard-player-locations';

type LeaderboardTab = 'realm' | 'monsterKills' | 'spiritStones' | 'playerKills' | 'deaths' | 'bodyTraining' | 'supremeAttrs';

const LEADERBOARD_LIMIT = 10;
const LEADERBOARD_TAB_LABELS: Record<LeaderboardTab, string> = {
  realm: '境界',
  monsterKills: '斩妖',
  spiritStones: '灵石',
  playerKills: '杀伐',
  deaths: '身陨',
  bodyTraining: '炼体',
  supremeAttrs: '四维最强',
};
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
    return '调卷中';
  }
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
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
  let latestLeaderboard: S2C_Leaderboard | null = null;
  let latestWorldSummary: S2C_WorldSummary | null = null;  
  let leaderboardPlayerLocationById = new Map<string, S2C_LeaderboardPlayerLocations['entries'][number]>();
  let leaderboardLocationTimer: number | null = null;
  let activeLeaderboardTab: LeaderboardTab = 'realm';
  let leaderboardLoading = false;
  let worldSummaryLoading = false;

  function emitLeaderboardPlayerLocations(): void {
    window.dispatchEvent(new CustomEvent(LEADERBOARD_PLAYER_LOCATION_EVENT, {
      detail: {
        entries: [...leaderboardPlayerLocationById.values()].map((entry) => cloneJson(entry)),
      },
    }));
  }
  /**
 * renderLeaderboardModal：执行Leaderboard弹层相关逻辑。
 * @returns 无返回值，直接更新Leaderboard弹层相关状态。
 */


  function renderLeaderboardModal(): void {
    const data = latestLeaderboard;
    const limit = data?.limit ?? LEADERBOARD_LIMIT;
    const modalOptions = {
      ownerId: LEADERBOARD_MODAL_OWNER,
      variantClass: 'detail-modal--leaderboard',
      title: '排行榜',
      subtitle: `收录前 ${formatDisplayInteger(limit)} 名 · 十分钟一更 · ${formatLeaderboardGeneratedAt(data?.generatedAt ?? 0)}`,
      hint: '点击空白处关闭',
      bodyHtml: renderLeaderboardModalBody(data),
      onAfterRender: bindLeaderboardModalEvents,
      onClose: () => {
        stopLeaderboardLocationPolling();
      },
    };
    if (!detailModalHost.patch(modalOptions)) {
      detailModalHost.open(modalOptions);
    }
    requestVisibleLeaderboardPlayerLocations();
  }
  /**
 * renderWorldSummaryModal：执行世界摘要弹层相关逻辑。
 * @returns 无返回值，直接更新世界摘要弹层相关状态。
 */


  function renderWorldSummaryModal(): void {
    const data = latestWorldSummary;
    const modalOptions = {
      ownerId: WORLD_SUMMARY_MODAL_OWNER,
      variantClass: 'detail-modal--leaderboard',
      title: '世界',
      subtitle: `世界卷宗 · 十分钟一更 · ${formatLeaderboardGeneratedAt(data?.generatedAt ?? 0)}`,
      hint: '点击空白处关闭',
      bodyHtml: renderWorldSummaryModalBody(data),
      onAfterRender: bindWorldSummaryModalEvents,
    };
    if (!detailModalHost.patch(modalOptions)) {
      detailModalHost.open(modalOptions);
    }
  }

  options.worldPanel.setCallbacks({
    onOpenLeaderboard: () => {
      openLeaderboardModal();
    },
    onOpenWorldSummary: () => {
      openWorldSummaryModal();
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
      emitLeaderboardPlayerLocations();
      stopLeaderboardLocationPolling();
      detailModalHost.close(LEADERBOARD_MODAL_OWNER);
      detailModalHost.close(WORLD_SUMMARY_MODAL_OWNER);
    },    
    /**
 * handleLeaderboard：处理Leaderboard并更新相关状态。
 * @param data S2C_Leaderboard 原始数据。
 * @returns 无返回值，直接更新Leaderboard相关状态。
 */


    handleLeaderboard(data: S2C_Leaderboard): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestLeaderboard = cloneJson(data);
      leaderboardLoading = false;
      if (detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        renderLeaderboardModal();
      }
    },    
    /**
 * handleLeaderboardPlayerLocations：处理玩家击杀榜坐标追索结果并更新相关状态。
 * @param data S2C_LeaderboardPlayerLocations 原始数据。
 * @returns 无返回值，直接更新玩家击杀榜坐标追索结果相关状态。
 */

    handleLeaderboardPlayerLocations(data: S2C_LeaderboardPlayerLocations): void {
      leaderboardPlayerLocationById = new Map(data.entries.map((entry) => [entry.playerId, cloneJson(entry)]));
      emitLeaderboardPlayerLocations();
      if (!detailModalHost.isOpenFor(LEADERBOARD_MODAL_OWNER)) {
        return;
      }
      if (activeLeaderboardTab === 'playerKills') {
        patchLeaderboardPlayerLocationTexts();
      }
    },    
    /**
 * handleWorldSummary：处理世界摘要并更新相关状态。
 * @param data S2C_WorldSummary 原始数据。
 * @returns 无返回值，直接更新世界摘要相关状态。
 */


    handleWorldSummary(data: S2C_WorldSummary): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestWorldSummary = cloneJson(data);
      worldSummaryLoading = false;
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

  function openLeaderboardModal(): void {
    leaderboardLoading = true;
    renderLeaderboardModal();
    startLeaderboardLocationPolling();
    options.socket.sendRequestLeaderboard();
  }

  function openWorldSummaryModal(): void {
    worldSummaryLoading = true;
    renderWorldSummaryModal();
    options.socket.sendRequestWorldSummary();
  }

  function renderActiveLeaderboardBoard(data: S2C_Leaderboard | null): string {
    if (!data) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    switch (activeLeaderboardTab) {
      case 'realm':
        return renderStandardLeaderboardList(
          data.boards.realm.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: escapeHtml(entry.realmName),
          })),
        );
      case 'monsterKills':
        return renderStandardLeaderboardList(
          data.boards.monsterKills.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: `击杀 ${formatDisplayInteger(entry.totalKills)}`,
            meta: `精英 ${formatDisplayInteger(entry.eliteKills)} · Boss ${formatDisplayInteger(entry.bossKills)}`,
          })),
        );
      case 'spiritStones':
        return renderStandardLeaderboardList(
          data.boards.spiritStones.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: `${formatDisplayInteger(entry.spiritStoneCount)} 灵石`,
          })),
        );
      case 'playerKills':
        return renderStandardLeaderboardList(
          data.boards.playerKills.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: `击杀玩家 ${formatDisplayInteger(entry.playerKillCount)}`,
            meta: formatLeaderboardPlayerLocation(entry.playerId),
          })),
        );
      case 'deaths':
        return renderStandardLeaderboardList(
          data.boards.deaths.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: `死亡 ${formatDisplayInteger(entry.deathCount)}`,
          })),
        );
      case 'bodyTraining':
        return renderStandardLeaderboardList(
          data.boards.bodyTraining.map((entry) => ({
            rank: entry.rank,
            name: entry.playerName,
            value: `炼体 ${formatDisplayInteger(entry.level)} 层`,
          })),
        );
      case 'supremeAttrs':
        return renderSupremeAttrBoard(data);
      default:
        return '<div class="empty-hint">暂无榜册内容。</div>';
    }
  }

  function renderLeaderboardModalBody(data: S2C_Leaderboard | null): string {
    const tabs = (Object.keys(LEADERBOARD_TAB_LABELS) as LeaderboardTab[])
      .map((tab) => `
        <button
          class="leaderboard-tab-btn ${tab === activeLeaderboardTab ? 'active' : ''}"
          data-leaderboard-tab="${tab}"
          type="button"
        >${LEADERBOARD_TAB_LABELS[tab]}</button>
      `)
      .join('');
    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="leaderboard-tabs">${tabs}</div>
          <div class="leaderboard-toolbar-actions">
            <button class="small-btn ghost" data-open-world-summary type="button">世界卷宗</button>
            <button class="small-btn" data-leaderboard-refresh type="button">${leaderboardLoading ? '调卷中' : '刷新榜册'}</button>
          </div>
        </div>
        <div class="leaderboard-content">
          ${leaderboardLoading && !data ? '<div class="leaderboard-loading">天机阁正在调阅最新榜册……</div>' : ''}
          <div class="leaderboard-board">${renderActiveLeaderboardBoard(data)}</div>
        </div>
      </div>
    `;
  }

  function renderWorldSummaryModalBody(data: S2C_WorldSummary | null): string {
    return `
      <div class="leaderboard-shell">
        <div class="leaderboard-toolbar">
          <div class="panel-subtext">阁藏天下卷宗，专收全服低频汇总情报。</div>
          <div class="leaderboard-toolbar-actions">
            <button class="small-btn ghost" data-open-leaderboard type="button">天下榜</button>
            <button class="small-btn" data-world-summary-refresh type="button">${worldSummaryLoading ? '调卷中' : '刷新卷宗'}</button>
          </div>
        </div>
        <div class="leaderboard-content">
          ${worldSummaryLoading && !data ? '<div class="leaderboard-loading">天机阁正在调阅世界卷宗……</div>' : ''}
          <div class="leaderboard-board">${renderWorldSummaryBoard(data)}</div>
        </div>
      </div>
    `;
  }

  function bindLeaderboardModalEvents(body: HTMLElement): void {
    body.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const tabButton = target.closest<HTMLElement>('[data-leaderboard-tab]');
      if (tabButton) {
        event.preventDefault();
        event.stopPropagation();
        const tab = tabButton.dataset.leaderboardTab as LeaderboardTab | undefined;
        if (!tab || tab === activeLeaderboardTab) {
          return;
        }
        activeLeaderboardTab = tab;
        renderLeaderboardModal();
        return;
      }
      if (target.closest('[data-leaderboard-refresh]')) {
        event.preventDefault();
        event.stopPropagation();
        leaderboardLoading = true;
        renderLeaderboardModal();
        options.socket.sendRequestLeaderboard();
        return;
      }
      if (target.closest('[data-open-world-summary]')) {
        event.preventDefault();
        event.stopPropagation();
        openWorldSummaryModal();
      }
    };
  }

  function bindWorldSummaryModalEvents(body: HTMLElement): void {
    body.onclick = (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest('[data-world-summary-refresh]')) {
        event.preventDefault();
        event.stopPropagation();
        worldSummaryLoading = true;
        renderWorldSummaryModal();
        options.socket.sendRequestWorldSummary();
        return;
      }
      if (target.closest('[data-open-leaderboard]')) {
        event.preventDefault();
        event.stopPropagation();
        openLeaderboardModal();
      }
    };
  }

  function patchLeaderboardPlayerLocationTexts(): void {
    const body = document.getElementById('detail-modal-body');
    if (!body) {
      return;
    }
    const playerKillEntries = latestLeaderboard?.boards.playerKills ?? [];
    preserveSelection(body, () => {
      const submetaNodes = [...body.querySelectorAll<HTMLElement>('.leaderboard-submeta')];
      playerKillEntries.forEach((entry, index) => {
        const node = submetaNodes[index];
        if (!node) {
          return;
        }
        const nextText = formatLeaderboardPlayerLocation(entry.playerId);
        if (node.textContent === nextText) {
          return;
        }
        node.textContent = nextText;
      });
    });
  }

  function renderStandardLeaderboardList(entries: Array<{
    rank: number;
    name: string;
    value: string;
    meta?: string;
  }>): string {
    if (entries.length === 0) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    return `
      <div class="leaderboard-list">
        ${entries.map((entry) => `
          <div class="leaderboard-row">
            <div class="leaderboard-rank">#${formatDisplayInteger(entry.rank)}</div>
            <div class="leaderboard-main">
              <div class="leaderboard-name">${escapeHtml(entry.name)}</div>
              <div class="leaderboard-meta">${entry.value}</div>
              ${entry.meta ? `<div class="leaderboard-submeta">${escapeHtml(entry.meta)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderSupremeAttrBoard(data: S2C_Leaderboard): string {
    if (data.boards.supremeAttrs.length === 0) {
      return '<div class="empty-hint">暂无榜册内容。</div>';
    }
    return `
      <div class="leaderboard-supreme-grid">
        ${data.boards.supremeAttrs.map((entry) => `
          <div class="leaderboard-supreme-card">
            <div class="leaderboard-supreme-label">${escapeHtml(entry.label)}</div>
            <div class="leaderboard-supreme-name">${escapeHtml(entry.playerName)}</div>
            <div class="leaderboard-supreme-value">${formatDisplayInteger(entry.value)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderWorldSummaryBoard(data: S2C_WorldSummary | null): string {
    if (!data) {
      return '<div class="empty-hint">暂无世界卷宗。</div>';
    }
    const summary = data.summary;
    return `
      <div class="leaderboard-world-grid">
        ${renderWorldSection('灵石总和', [{
          label: '全体玩家持有',
          value: `${formatDisplayInteger(summary.totalSpiritStones)} 灵石`,
          hint: '包含背包、坊市托管仓与求购挂单中冻结的灵石。',
        }])}
        ${renderWorldSection('当前行动人数', [
          { label: '修炼', value: `${formatDisplayInteger(summary.actionCounts.cultivation)} 人` },
          { label: '战斗', value: `${formatDisplayInteger(summary.actionCounts.combat)} 人` },
          { label: '炼丹', value: `${formatDisplayInteger(summary.actionCounts.alchemy)} 人` },
          { label: '强化', value: `${formatDisplayInteger(summary.actionCounts.enhancement)} 人` },
        ])}
        ${renderWorldSection('境界人数', [
          { label: '初始境界', value: `${formatDisplayInteger(summary.realmCounts.initial)} 人`, hint: 'Lv.1' },
          { label: '凡人境界', value: `${formatDisplayInteger(summary.realmCounts.mortal)} 人`, hint: 'Lv.2 - Lv.18' },
          { label: '炼气及以上', value: `${formatDisplayInteger(summary.realmCounts.qiRefiningOrAbove)} 人`, hint: 'Lv.19+' },
        ])}
        ${renderWorldSection('全服击杀与死亡', [
          { label: '普通怪物', value: `${formatDisplayInteger(summary.killCounts.normalMonsters)} 次` },
          { label: '精英怪物', value: `${formatDisplayInteger(summary.killCounts.eliteMonsters)} 次` },
          { label: 'Boss', value: `${formatDisplayInteger(summary.killCounts.bossMonsters)} 次` },
          { label: '玩家击杀玩家', value: `${formatDisplayInteger(summary.killCounts.playerKills)} 次` },
          { label: '玩家死亡', value: `${formatDisplayInteger(summary.killCounts.playerDeaths)} 次` },
        ])}
      </div>
    `;
  }

  function renderWorldSection(title: string, entries: Array<{ label: string; value: string; hint?: string }>): string {
    return `
      <section class="leaderboard-world-card">
        <div class="leaderboard-world-title">${escapeHtml(title)}</div>
        <div class="leaderboard-world-list">
          ${entries.map((entry) => `
            <div class="leaderboard-world-row">
              <div class="leaderboard-world-copy">
                <div class="leaderboard-world-label">${escapeHtml(entry.label)}</div>
                ${entry.hint ? `<div class="leaderboard-world-hint">${escapeHtml(entry.hint)}</div>` : ''}
              </div>
              <div class="leaderboard-world-value">${escapeHtml(entry.value)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }
}
